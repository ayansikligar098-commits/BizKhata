/**
 * BizKhata AI Business Assistant — backend action layer.
 *
 * The AI NEVER touches the database directly. The chat UI turns a natural
 * language message into a structured AssistantAction (see chatbot.ts),
 * the user confirms it, and only then does applyAssistantAction() run:
 * it validates everything (profile scope, amounts, balances, agent /
 * customer existence), executes the change on the real store, writes
 * audit entries, and returns the actual result. Every rule mirrors what
 * the normal screens do (same DailyEntry + CashTxn pairing, same
 * Expense + CashTxn pairing, same MT fund check, same agent-payment
 * distribution) so a chat-created record is indistinguishable from a
 * screen-created one — and is never counted twice.
 *
 * Idempotency: every confirmed action carries a client-generated key.
 * The key is recorded in state.executedActionKeys; a repeat of the same
 * key is rejected without touching any record.
 *
 * All money is integer paise. All actions are restricted to one profile.
 */
import { agentPayablePaise, mtClosingPaise } from './accounting';
import { formatINR } from './money';
import { auditEntry, recycleEntry } from './store';
import type {
  AppState,
  CashTxn,
  DailyEntry,
  Expense,
  Job,
  Method,
  MtTransfer,
} from './types';
import { todayISO, uid } from './types';

export type AssistantAction =
  | {
      kind: 'daily_income';
      date: string;
      entries: { service: string; amountPaise: number; method: 'cash' | 'upi' | 'other'; customerName?: string }[];
    }
  | {
      kind: 'expense';
      date: string;
      category: string;
      description: string;
      amountPaise: number;
      method: Method;
      service: string;
      vendor: string;
    }
  | {
      kind: 'mt_transfer';
      date: string;
      receiverName: string;
      mobile: string;
      amountPaise: number;
      commissionPaise: number;
      method: Method;
    }
  | { kind: 'mt_fund'; date: string; amountPaise: number; method: Method; note: string }
  | {
      kind: 'agent_payment';
      date: string;
      agentId: string;
      agentName: string;
      amountPaise: number;
      method: Method;
    }
  | { kind: 'internal_transfer'; date: string; from: Method; to: Method; amountPaise: number }
  | {
      kind: 'customer_payment';
      date: string;
      jobId: string;
      customerName: string;
      amountPaise: number;
      method: Method;
    }
  | { kind: 'customer_add'; name: string; mobile: string }
  | {
      kind: 'correct_entry';
      targetKind: 'daily' | 'job' | 'expense' | 'mt';
      targetId: string;
      label: string;
      oldAmountPaise: number;
      newAmountPaise: number;
      newMethod?: Method;
    }
  | {
      kind: 'delete_entry';
      targetKind: 'daily' | 'job' | 'expense' | 'mt' | 'txn';
      targetId: string;
      label: string;
    }
  | {
      kind: 'refund';
      date: string;
      jobId: string | null;
      service: string;
      customerName: string;
      amountPaise: number;
      method: Method;
    };

export interface ExecResult {
  ok: boolean;
  /** True when this exact key was already executed (no second write). */
  duplicate?: boolean;
  /** Short human-readable summary of what actually happened. */
  summary: string;
  /** One line per record written, for the result card. */
  lines: string[];
  /** Record ids written, so the UI can verify them in the store. */
  appliedIds: string[];
  /** Where the user can see the result (route key for app.go / path). */
  link: { label: string; path: string } | null;
  error?: string;
}

function fail(error: string): ExecResult {
  return { ok: false, summary: error, lines: [], appliedIds: [], link: null, error };
}

function nowTime(): string {
  return new Date().toTimeString().slice(0, 5);
}

function isIntPaise(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

/** Find a record the user wants to correct/delete, by amount + text. */
export interface FoundRecord {
  kind: 'daily' | 'job' | 'expense' | 'mt' | 'txn';
  id: string;
  label: string;
  amountPaise: number;
  date: string;
  service: string;
}

export function findAssistantTargets(
  state: AppState,
  profileId: string,
  opts: { amountPaise?: number; text?: string; date?: string },
): FoundRecord[] {
  const out: FoundRecord[] = [];
  const needle = (opts.text || '').toLowerCase();
  const matchAmt = (a: number) => opts.amountPaise === undefined || a === opts.amountPaise;
  const matchDate = (d: string) => !opts.date || d === opts.date;
  const matchText = (s: string) => !needle || s.toLowerCase().includes(needle);
  for (const e of state.dailyEntries.filter((x) => x.profileId === profileId)) {
    if (matchAmt(e.totalPaise) && matchDate(e.date) && (matchText(e.service) || matchText(e.description))) {
      out.push({ kind: 'daily', id: e.id, label: `${e.service} ${formatINR(e.totalPaise)} (${e.method})`, amountPaise: e.totalPaise, date: e.date, service: e.service });
    }
  }
  for (const j of state.jobs.filter((x) => x.profileId === profileId)) {
    if ((matchAmt(j.receivedPaise) || matchAmt(j.totalPaise)) && matchDate(j.date) && (matchText(j.service) || matchText(j.customerName))) {
      out.push({ kind: 'job', id: j.id, label: `${j.service} — ${j.customerName}, received ${formatINR(j.receivedPaise)} of ${formatINR(j.totalPaise)}`, amountPaise: j.receivedPaise, date: j.date, service: j.service });
    }
  }
  for (const e of state.expenses.filter((x) => x.profileId === profileId)) {
    if (matchAmt(e.amountPaise) && matchDate(e.date) && (matchText(e.category) || matchText(e.description) || matchText(e.service))) {
      out.push({ kind: 'expense', id: e.id, label: `${e.category} — ${e.description} ${formatINR(e.amountPaise)}`, amountPaise: e.amountPaise, date: e.date, service: e.service });
    }
  }
  for (const m of state.mtTransfers.filter((x) => x.profileId === profileId)) {
    if ((matchAmt(m.amountPaise) || matchAmt(m.commissionPaise)) && matchDate(m.date) && matchText(m.receiverName)) {
      out.push({ kind: 'mt', id: m.id, label: `Money Transfer to ${m.receiverName} ${formatINR(m.amountPaise)}, commission ${formatINR(m.commissionPaise)}`, amountPaise: m.amountPaise, date: m.date, service: 'Money Transfer' });
    }
  }
  return out.slice(0, 5);
}

/**
 * Execute one confirmed assistant action against the store (mutates the
 * passed state draft in place — call inside ctx.mutate). Returns the
 * actual result; ok=false means NOTHING was written.
 */
export function applyAssistantAction(
  s: AppState,
  profileId: string,
  action: AssistantAction,
  idempotencyKey: string,
): ExecResult {
  const profile = s.profiles.find((p) => p.id === profileId);
  if (!profile) return fail('Business profile not found. Switch profiles and try again.');
  if (!idempotencyKey) return fail('Missing confirmation key — please confirm again.');
  if (!s.executedActionKeys) s.executedActionKeys = [];
  if (s.executedActionKeys.includes(idempotencyKey)) {
    return { ok: false, duplicate: true, summary: 'Already saved — this action was executed before, so nothing was written again.', lines: [], appliedIds: [], link: null, error: 'duplicate' };
  }
  const date = 'date' in action && action.date ? action.date : todayISO();
  const appliedIds: string[] = [];
  const lines: string[] = [];
  const audits: { action: string; entity: string; id: string; oldV: string; newV: string }[] = [];
  const commit = (summary: string, link: ExecResult['link']): ExecResult => {
    s.executedActionKeys.push(idempotencyKey);
    for (const a of audits) s.audit.push(auditEntry(profileId, a.action, a.entity, a.id, a.oldV, a.newV));
    return { ok: true, summary, lines, appliedIds, link };
  };

  switch (action.kind) {
    case 'daily_income': {
      if (action.entries.length === 0) return fail('No entries to save.');
      for (const e of action.entries) {
        if (!isIntPaise(e.amountPaise)) return fail(`Amount must be more than ₹0 (got ${e.amountPaise} paise). Nothing was saved.`);
        if (!profile.services.includes(e.service) && e.service !== 'Other Services') {
          return fail(`"${e.service}" is not a service in this business profile. Nothing was saved.`);
        }
      }
      for (const e of action.entries) {
        if (e.customerName) {
          // Named customer → a real job. 'other' (udhaar) means the money
          // was NOT collected: received stays 0 and the full amount is
          // due — never record a due as received money.
          const job: Job = {
            id: uid('job'), profileId, service: e.service, customerName: e.customerName,
            mobile: '', refNo: '', status: 'Completed', totalPaise: e.amountPaise,
            receivedPaise: e.method === 'other' ? 0 : e.amountPaise, receivedMethod: e.method === 'other' ? 'cash' : e.method,
            agentId: null, agentChargePaise: 0, agentPaidPaise: 0, date,
            notes: 'Added via AI Assistant', docIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          };
          s.jobs.push(job);
          appliedIds.push(job.id);
          if (e.method !== 'other') {
            const txn: CashTxn = { id: uid('txn'), profileId, kind: 'in', method: e.method, amountPaise: e.amountPaise, category: `${e.service} — ${e.customerName}`, note: `Job payment (${job.id})`, date, jobId: job.id, createdAt: new Date().toISOString() };
            s.cashTxns.push(txn);
            appliedIds.push(txn.id);
          }
          if (!s.customers.some((c) => c.profileId === profileId && c.name.toLowerCase() === e.customerName!.toLowerCase())) {
            const cid = uid('cus');
            s.customers.push({ id: cid, profileId, name: e.customerName, mobile: '', notes: '', docIds: [], createdAt: new Date().toISOString() });
            appliedIds.push(cid);
          }
          audits.push({ action: 'create', entity: 'Job', id: job.id, oldV: '', newV: `${e.service} for ${e.customerName}: ${e.method === 'other' ? `due ${formatINR(e.amountPaise)}` : `received ${formatINR(e.amountPaise)}`} via AI Assistant` });
          lines.push(`${e.service} — ${e.customerName}: ${formatINR(e.amountPaise)} ${e.method === 'other' ? '(due, not collected)' : `(${e.method.toUpperCase()})`} — saved as a job.`);
        } else {
          // Quick daily entry: ONE DailyEntry + exactly ONE linked CashTxn.
          const entry: DailyEntry = {
            id: uid('de'), profileId, service: e.service, description: `${e.service} collection`,
            quantity: 1, ratePaise: e.amountPaise, totalPaise: e.amountPaise, method: e.method,
            expensePaise: 0, expenseMethod: 'cash', date, time: nowTime(),
            notes: 'Added via AI Assistant', createdAt: new Date().toISOString(),
          };
          s.dailyEntries.push(entry);
          appliedIds.push(entry.id);
          if (e.method !== 'other') {
            const txn: CashTxn = { id: uid('txn'), profileId, kind: 'in', method: e.method, amountPaise: e.amountPaise, category: `${e.service} collection`, note: `Daily entry (${entry.id})`, date, dailyEntryId: entry.id, createdAt: new Date().toISOString() };
            s.cashTxns.push(txn);
            appliedIds.push(txn.id);
          }
          audits.push({ action: 'create', entity: 'DailyEntry', id: entry.id, oldV: '', newV: `${e.service} ${formatINR(e.amountPaise)} (${e.method}) via AI Assistant` });
          lines.push(`${e.service} ${formatINR(e.amountPaise)} ${e.method === 'other' ? '(due — not collected yet)' : `(${e.method.toUpperCase()})`} — saved.`);
        }
      }
      const total = action.entries.reduce((a, e) => a + e.amountPaise, 0);
      return commit(`Saved ${action.entries.length} ${action.entries.length === 1 ? 'entry' : 'entries'} — total ${formatINR(total)}. Daily Business, ${action.entries.some((e) => e.method === 'cash') ? 'Cash Book, ' : ''}${action.entries.some((e) => e.method === 'upi') ? 'UPI Book, ' : ''}and Dashboard are updated.`, { label: 'View Daily Business', path: '/daily-business' });
    }

    case 'expense': {
      if (!isIntPaise(action.amountPaise)) return fail('Expense amount must be more than ₹0. Nothing was saved.');
      const ex: Expense = {
        id: uid('exp'), profileId, category: action.category, equipmentId: null,
        description: action.description, amountPaise: action.amountPaise, method: action.method,
        vendor: action.vendor, date, service: action.service, notes: 'Added via AI Assistant',
        createdAt: new Date().toISOString(),
      };
      s.expenses.push(ex);
      appliedIds.push(ex.id);
      const txn: CashTxn = { id: uid('txn'), profileId, kind: 'out', method: action.method, amountPaise: action.amountPaise, category: `Expense — ${action.category}`, note: action.description, date, expenseId: ex.id, createdAt: new Date().toISOString() };
      s.cashTxns.push(txn);
      appliedIds.push(txn.id);
      audits.push({ action: 'create', entity: 'Expense', id: ex.id, oldV: '', newV: `${action.category} ${formatINR(action.amountPaise)} (${action.method}) via AI Assistant` });
      lines.push(`${action.category} — ${action.description}: ${formatINR(action.amountPaise)} (${action.method.toUpperCase()}) — saved.`);
      return commit(`Expense saved: ${formatINR(action.amountPaise)} for ${action.category}.`, { label: 'View Expenses', path: '/expenses' });
    }

    case 'mt_fund': {
      if (!isIntPaise(action.amountPaise)) return fail('Fund amount must be more than ₹0. Nothing was saved.');
      const f = { id: uid('mtf'), profileId, amountPaise: action.amountPaise, method: action.method, date, note: action.note || 'Fund from brother' };
      s.mtFunds.push(f);
      appliedIds.push(f.id);
      audits.push({ action: 'create', entity: 'MtFund', id: f.id, oldV: '', newV: `Fund received ${formatINR(action.amountPaise)} by ${action.method} via AI Assistant` });
      lines.push(`Fund received ${formatINR(action.amountPaise)} by ${action.method.toUpperCase()} — saved.`);
      return commit(`Money Transfer fund ${formatINR(action.amountPaise)} added.`, { label: 'View Money Transfer', path: '/money-transfer' });
    }

    case 'mt_transfer': {
      if (!isIntPaise(action.amountPaise)) return fail('Transfer amount must be more than ₹0. Nothing was saved.');
      if (action.commissionPaise < 0 || !Number.isInteger(action.commissionPaise)) return fail('Commission must be a whole paise amount of ₹0 or more.');
      if (!action.receiverName.trim()) return fail('Receiver name is missing. Nothing was saved.');
      const closing = mtClosingPaise(0, 0, s.mtFunds.filter((f) => f.profileId === profileId), s.mtTransfers.filter((m) => m.profileId === profileId), s.mtExpenses.filter((m) => m.profileId === profileId));
      const avail = action.method === 'cash' ? closing.cash : closing.upi;
      if (action.amountPaise > avail) {
        return fail(`Not enough Money Transfer ${action.method} balance (${formatINR(avail)}) to send ${formatINR(action.amountPaise)}. Add fund from brother first. Nothing was saved.`);
      }
      const tr: MtTransfer = {
        id: uid('mtt'), profileId, receiverName: action.receiverName, mobile: action.mobile,
        amountPaise: action.amountPaise, commissionPaise: action.commissionPaise, method: action.method,
        status: 'Sent', refNo: '', date, note: 'Added via AI Assistant',
      };
      s.mtTransfers.push(tr);
      appliedIds.push(tr.id);
      audits.push({ action: 'create', entity: 'MtTransfer', id: tr.id, oldV: '', newV: `Transfer ${formatINR(action.amountPaise)} to ${action.receiverName}, commission ${formatINR(action.commissionPaise)} via AI Assistant` });
      lines.push(`Transfer to ${action.receiverName}: principal ${formatINR(action.amountPaise)} (${action.method.toUpperCase()}) — principal is fund movement, NOT income.`);
      lines.push(`Commission earned: ${formatINR(action.commissionPaise)} — only this counts as income/profit.`);
      return commit(`Money Transfer saved: ${formatINR(action.amountPaise)} sent, ${formatINR(action.commissionPaise)} commission earned.`, { label: 'View Money Transfer', path: '/money-transfer' });
    }

    case 'agent_payment': {
      if (!isIntPaise(action.amountPaise)) return fail('Payment amount must be more than ₹0. Nothing was saved.');
      const agent = s.agents.find((a) => a.id === action.agentId && a.profileId === profileId);
      if (!agent) return fail(`Agent "${action.agentName}" not found in this business profile. Nothing was saved.`);
      const jobs = s.jobs.filter((j) => j.profileId === profileId && j.agentId === agent.id);
      const payable = agentPayablePaise(agent, jobs);
      if (action.amountPaise > payable) {
        return fail(`You owe ${agent.name} only ${formatINR(payable)}. Payment of ${formatINR(action.amountPaise)} is more than the payable amount. Nothing was saved.`);
      }
      let remaining = action.amountPaise;
      const paidJobs: string[] = [];
      for (const j of [...jobs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
        if (remaining <= 0) break;
        const due = Math.max(0, j.agentChargePaise - j.agentPaidPaise);
        if (due <= 0) continue;
        const pay = Math.min(due, remaining);
        const old = j.agentPaidPaise;
        j.agentPaidPaise += pay;
        j.updatedAt = new Date().toISOString();
        remaining -= pay;
        paidJobs.push(j.id);
        audits.push({ action: 'update', entity: 'Job', id: j.id, oldV: `agent paid ${formatINR(old)}`, newV: `agent paid ${formatINR(j.agentPaidPaise)}` });
      }
      const txn: CashTxn = { id: uid('txn'), profileId, kind: 'out', method: action.method, amountPaise: action.amountPaise, category: `Agent Payment — ${agent.name}`, note: `Paid to agent ${agent.name} via AI Assistant`, date, createdAt: new Date().toISOString() };
      s.cashTxns.push(txn);
      appliedIds.push(txn.id, ...paidJobs);
      audits.push({ action: 'create', entity: 'AgentPayment', id: txn.id, oldV: '', newV: `Paid ${agent.name} ${formatINR(action.amountPaise)} (${action.method}) via AI Assistant` });
      lines.push(`Paid ${agent.name}: ${formatINR(action.amountPaise)} (${action.method.toUpperCase()}) — this is an agent payment, not a customer expense.`);
      lines.push(`Remaining payable to ${agent.name}: ${formatINR(payable - action.amountPaise)}.`);
      return commit(`Agent payment saved: ${formatINR(action.amountPaise)} to ${agent.name}.`, { label: 'View Agents', path: '/agents' });
    }

    case 'internal_transfer': {
      if (!isIntPaise(action.amountPaise)) return fail('Transfer amount must be more than ₹0. Nothing was saved.');
      if (action.from === action.to) return fail('Cash→UPI transfer needs two different modes. Nothing was saved.');
      const txn: CashTxn = { id: uid('txn'), profileId, kind: 'transfer', method: action.from, transferTo: action.to, amountPaise: action.amountPaise, category: 'Internal Transfer', note: `Moved ${action.from} → ${action.to} via AI Assistant`, date, createdAt: new Date().toISOString() };
      s.cashTxns.push(txn);
      appliedIds.push(txn.id);
      audits.push({ action: 'create', entity: 'CashTxn', id: txn.id, oldV: '', newV: `Internal transfer ${formatINR(action.amountPaise)} ${action.from} → ${action.to} via AI Assistant` });
      lines.push(`Moved ${formatINR(action.amountPaise)} from ${action.from.toUpperCase()} to ${action.to.toUpperCase()} — internal transfer, ₹0 income and ₹0 expense.`);
      return commit(`Internal transfer saved: ${formatINR(action.amountPaise)} ${action.from} → ${action.to}.`, { label: 'View Cash Book', path: '/cash-book' });
    }

    case 'customer_payment': {
      if (!isIntPaise(action.amountPaise)) return fail('Payment amount must be more than ₹0. Nothing was saved.');
      const job = s.jobs.find((j) => j.id === action.jobId && j.profileId === profileId);
      if (!job) return fail('That customer job was not found in this business profile. Nothing was saved.');
      const due = Math.max(0, job.totalPaise - job.receivedPaise);
      if (action.amountPaise > due) return fail(`${job.customerName} owes only ${formatINR(due)}. Payment of ${formatINR(action.amountPaise)} is more than the due. Nothing was saved.`);
      const old = job.receivedPaise;
      job.receivedPaise += action.amountPaise;
      job.updatedAt = new Date().toISOString();
      const txn: CashTxn = { id: uid('txn'), profileId, kind: 'in', method: action.method, amountPaise: action.amountPaise, category: `${job.service} — ${job.customerName}`, note: `Payment received (${job.id})`, date, jobId: job.id, createdAt: new Date().toISOString() };
      s.cashTxns.push(txn);
      appliedIds.push(job.id, txn.id);
      audits.push({ action: 'update', entity: 'Job', id: job.id, oldV: `received ${formatINR(old)}`, newV: `received ${formatINR(job.receivedPaise)}` });
      lines.push(`Received ${formatINR(action.amountPaise)} (${action.method.toUpperCase()}) from ${job.customerName} for ${job.service}.`);
      lines.push(`Remaining due from ${job.customerName}: ${formatINR(Math.max(0, job.totalPaise - job.receivedPaise))}.`);
      return commit(`Payment recorded: ${formatINR(action.amountPaise)} from ${job.customerName}.`, { label: 'View Customer Khata', path: '/customer-khata' });
    }

    case 'customer_add': {
      if (!action.name.trim()) return fail('Customer name is missing. Nothing was saved.');
      const dup = s.customers.find((c) => c.profileId === profileId && action.mobile && c.mobile === action.mobile);
      if (dup) return fail(`A customer with mobile ${action.mobile} already exists (${dup.name}). Nothing was saved.`);
      const id = uid('cus');
      s.customers.push({ id, profileId, name: action.name.trim(), mobile: action.mobile, notes: '', docIds: [], createdAt: new Date().toISOString() });
      appliedIds.push(id);
      audits.push({ action: 'create', entity: 'Customer', id, oldV: '', newV: `${action.name.trim()} ${action.mobile} via AI Assistant` });
      lines.push(`Customer added: ${action.name.trim()}${action.mobile ? ` (${action.mobile})` : ''}.`);
      return commit(`Customer ${action.name.trim()} added.`, { label: 'View Customers', path: '/customers' });
    }

    case 'correct_entry': {
      if (!isIntPaise(action.newAmountPaise)) return fail('Corrected amount must be more than ₹0. Nothing was changed.');
      if (action.targetKind === 'daily') {
        const e = s.dailyEntries.find((x) => x.id === action.targetId && x.profileId === profileId);
        if (!e) return fail('That daily entry was not found. Nothing was changed.');
        const old = e.totalPaise;
        const method = action.newMethod || e.method;
        e.totalPaise = action.newAmountPaise;
        e.ratePaise = action.newAmountPaise;
        e.method = method as DailyEntry['method'];
        const txn = s.cashTxns.find((x) => x.dailyEntryId === e.id);
        if (txn) { txn.amountPaise = action.newAmountPaise; txn.method = method === 'other' ? txn.method : (method as Method); }
        audits.push({ action: 'update', entity: 'DailyEntry', id: e.id, oldV: `${e.service} ${formatINR(old)}`, newV: `${e.service} ${formatINR(action.newAmountPaise)} via AI Assistant` });
        lines.push(`${e.service}: corrected from ${formatINR(old)} to ${formatINR(action.newAmountPaise)}${action.newMethod ? ` (${action.newMethod.toUpperCase()})` : ''}.`);
        appliedIds.push(e.id);
        return commit(`Corrected: ${e.service} is now ${formatINR(action.newAmountPaise)}.`, { label: 'View Daily Business', path: '/daily-business' });
      }
      if (action.targetKind === 'job') {
        const j = s.jobs.find((x) => x.id === action.targetId && x.profileId === profileId);
        if (!j) return fail('That job was not found. Nothing was changed.');
        if (action.newAmountPaise > j.totalPaise) return fail(`Received cannot be more than the billed total ${formatINR(j.totalPaise)}. Nothing was changed.`);
        const old = j.receivedPaise;
        const delta = action.newAmountPaise - old;
        j.receivedPaise = action.newAmountPaise;
        j.updatedAt = new Date().toISOString();
        const txns = s.cashTxns.filter((x) => x.jobId === j.id && x.kind === 'in').sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
        if (txns.length > 0) {
          const last = txns[txns.length - 1];
          if (last.amountPaise + delta < 0) return fail('The linked cash entry cannot go below ₹0. Nothing was changed.');
          last.amountPaise += delta;
          if (action.newMethod) last.method = action.newMethod;
        }
        audits.push({ action: 'update', entity: 'Job', id: j.id, oldV: `received ${formatINR(old)}`, newV: `received ${formatINR(action.newAmountPaise)} via AI Assistant` });
        lines.push(`${j.service} — ${j.customerName}: received corrected from ${formatINR(old)} to ${formatINR(action.newAmountPaise)}. Due is now ${formatINR(Math.max(0, j.totalPaise - j.receivedPaise))}.`);
        appliedIds.push(j.id);
        return commit(`Corrected: ${j.customerName}'s received amount is now ${formatINR(action.newAmountPaise)}.`, { label: 'View Services', path: '/services' });
      }
      if (action.targetKind === 'expense') {
        const e = s.expenses.find((x) => x.id === action.targetId && x.profileId === profileId);
        if (!e) return fail('That expense was not found. Nothing was changed.');
        const old = e.amountPaise;
        e.amountPaise = action.newAmountPaise;
        if (action.newMethod) e.method = action.newMethod;
        const txn = s.cashTxns.find((x) => x.expenseId === e.id);
        if (txn) { txn.amountPaise = action.newAmountPaise; if (action.newMethod) txn.method = action.newMethod; }
        audits.push({ action: 'update', entity: 'Expense', id: e.id, oldV: `${e.category} ${formatINR(old)}`, newV: `${e.category} ${formatINR(action.newAmountPaise)} via AI Assistant` });
        lines.push(`${e.category}: corrected from ${formatINR(old)} to ${formatINR(action.newAmountPaise)}.`);
        appliedIds.push(e.id);
        return commit(`Corrected: expense is now ${formatINR(action.newAmountPaise)}.`, { label: 'View Expenses', path: '/expenses' });
      }
      // mt: correct the commission (the profit part) or the principal.
      const m = s.mtTransfers.find((x) => x.id === action.targetId && x.profileId === profileId);
      if (!m) return fail('That Money Transfer was not found. Nothing was changed.');
      const old = m.commissionPaise;
      m.commissionPaise = action.newAmountPaise;
      audits.push({ action: 'update', entity: 'MtTransfer', id: m.id, oldV: `commission ${formatINR(old)}`, newV: `commission ${formatINR(action.newAmountPaise)} via AI Assistant` });
      lines.push(`Money Transfer to ${m.receiverName}: commission corrected from ${formatINR(old)} to ${formatINR(action.newAmountPaise)}. Principal ${formatINR(m.amountPaise)} unchanged.`);
      appliedIds.push(m.id);
      return commit(`Corrected: MT commission is now ${formatINR(action.newAmountPaise)}.`, { label: 'View Money Transfer', path: '/money-transfer' });
    }

    case 'delete_entry': {
      const label = action.label;
      const removeLinkedTxns = (pred: (x: CashTxn) => boolean) => {
        for (const x of s.cashTxns.filter(pred)) {
          s.recycle.push(recycleEntry(profileId, 'CashTxn', `${x.category} ${formatINR(x.amountPaise)}`, x));
        }
        s.cashTxns = s.cashTxns.filter((x) => !pred(x));
      };
      if (action.targetKind === 'daily') {
        const e = s.dailyEntries.find((x) => x.id === action.targetId && x.profileId === profileId);
        if (!e) return fail('That daily entry was not found. Nothing was deleted.');
        removeLinkedTxns((x) => x.dailyEntryId === e.id);
        s.dailyEntries = s.dailyEntries.filter((x) => x.id !== e.id);
        s.recycle.push(recycleEntry(profileId, 'DailyEntry', label, e));
        audits.push({ action: 'delete', entity: 'DailyEntry', id: e.id, oldV: label, newV: 'Moved to Recycle Bin' });
        appliedIds.push(e.id);
        lines.push(`Deleted: ${label}. It is in the Recycle Bin — you can restore it from there.`);
        return commit(`Deleted ${label} (moved to Recycle Bin).`, { label: 'View Recycle Bin', path: '/recycle-bin' });
      }
      if (action.targetKind === 'job') {
        const j = s.jobs.find((x) => x.id === action.targetId && x.profileId === profileId);
        if (!j) return fail('That job was not found. Nothing was deleted.');
        removeLinkedTxns((x) => x.jobId === j.id);
        s.jobs = s.jobs.filter((x) => x.id !== j.id);
        s.recycle.push(recycleEntry(profileId, 'Job', label, j));
        audits.push({ action: 'delete', entity: 'Job', id: j.id, oldV: label, newV: 'Moved to Recycle Bin' });
        appliedIds.push(j.id);
        lines.push(`Deleted: ${label}. It is in the Recycle Bin — you can restore it from there.`);
        return commit(`Deleted ${label} (moved to Recycle Bin).`, { label: 'View Recycle Bin', path: '/recycle-bin' });
      }
      if (action.targetKind === 'expense') {
        const e = s.expenses.find((x) => x.id === action.targetId && x.profileId === profileId);
        if (!e) return fail('That expense was not found. Nothing was deleted.');
        removeLinkedTxns((x) => x.expenseId === e.id);
        s.expenses = s.expenses.filter((x) => x.id !== e.id);
        s.recycle.push(recycleEntry(profileId, 'Expense', label, e));
        audits.push({ action: 'delete', entity: 'Expense', id: e.id, oldV: label, newV: 'Moved to Recycle Bin' });
        appliedIds.push(e.id);
        lines.push(`Deleted: ${label}. It is in the Recycle Bin — you can restore it from there.`);
        return commit(`Deleted ${label} (moved to Recycle Bin).`, { label: 'View Recycle Bin', path: '/recycle-bin' });
      }
      if (action.targetKind === 'mt') {
        const m = s.mtTransfers.find((x) => x.id === action.targetId && x.profileId === profileId);
        if (!m) return fail('That transfer was not found. Nothing was deleted.');
        s.mtTransfers = s.mtTransfers.filter((x) => x.id !== m.id);
        s.recycle.push(recycleEntry(profileId, 'MtTransfer', label, m));
        audits.push({ action: 'delete', entity: 'MtTransfer', id: m.id, oldV: label, newV: 'Moved to Recycle Bin' });
        appliedIds.push(m.id);
        lines.push(`Deleted: ${label}. It is in the Recycle Bin — you can restore it from there.`);
        return commit(`Deleted ${label} (moved to Recycle Bin).`, { label: 'View Recycle Bin', path: '/recycle-bin' });
      }
      const x = s.cashTxns.find((t) => t.id === action.targetId && t.profileId === profileId);
      if (!x) return fail('That transaction was not found. Nothing was deleted.');
      s.cashTxns = s.cashTxns.filter((t) => t.id !== x.id);
      s.recycle.push(recycleEntry(profileId, 'CashTxn', label, x));
      audits.push({ action: 'delete', entity: 'CashTxn', id: x.id, oldV: label, newV: 'Moved to Recycle Bin' });
      appliedIds.push(x.id);
      lines.push(`Deleted: ${label}. It is in the Recycle Bin — you can restore it from there.`);
      return commit(`Deleted ${label} (moved to Recycle Bin).`, { label: 'View Recycle Bin', path: '/recycle-bin' });
    }

    case 'refund': {
      if (!isIntPaise(action.amountPaise)) return fail('Refund amount must be more than ₹0. Nothing was saved.');
      if (action.jobId) {
        const j = s.jobs.find((x) => x.id === action.jobId && x.profileId === profileId);
        if (!j) return fail('That job was not found. Nothing was saved.');
        if (action.amountPaise > j.receivedPaise) return fail(`Only ${formatINR(j.receivedPaise)} was received on this job, so a refund of ${formatINR(action.amountPaise)} is not possible. Nothing was saved.`);
        const old = j.receivedPaise;
        j.receivedPaise -= action.amountPaise;
        j.updatedAt = new Date().toISOString();
        const txn: CashTxn = { id: uid('txn'), profileId, kind: 'out', method: action.method, amountPaise: action.amountPaise, category: `Refund — ${action.service}`, note: `Refund to ${j.customerName} (${j.id})`, date, createdAt: new Date().toISOString() };
        s.cashTxns.push(txn);
        appliedIds.push(j.id, txn.id);
        audits.push({ action: 'update', entity: 'Job', id: j.id, oldV: `received ${formatINR(old)}`, newV: `received ${formatINR(j.receivedPaise)} (refund ${formatINR(action.amountPaise)})` });
        lines.push(`Refund ${formatINR(action.amountPaise)} (${action.method.toUpperCase()}) to ${j.customerName} — recorded as a reversal of the received payment, not as an ordinary expense.`);
        lines.push(`${j.service} received is now ${formatINR(j.receivedPaise)}.`);
        return commit(`Refund saved: ${formatINR(action.amountPaise)} to ${j.customerName}.`, { label: 'View Services', path: '/services' });
      }
      const txn: CashTxn = { id: uid('txn'), profileId, kind: 'out', method: action.method, amountPaise: action.amountPaise, category: `Refund — ${action.service}`, note: `Refund via AI Assistant${action.customerName ? ` to ${action.customerName}` : ''}`, date, createdAt: new Date().toISOString() };
      s.cashTxns.push(txn);
      appliedIds.push(txn.id);
      audits.push({ action: 'create', entity: 'CashTxn', id: txn.id, oldV: '', newV: `Refund ${formatINR(action.amountPaise)} (${action.service}) via AI Assistant` });
      lines.push(`Refund ${formatINR(action.amountPaise)} (${action.method.toUpperCase()}) for ${action.service} — recorded as a reversal, not as an ordinary expense.`);
      return commit(`Refund saved: ${formatINR(action.amountPaise)}.`, { label: 'View Cash Book', path: '/cash-book' });
    }
  }
}
