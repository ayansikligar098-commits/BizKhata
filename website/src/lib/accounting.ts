/**
 * BizKhata accounting engine — pure functions, integer paise only.
 *
 * SACRED RULES (from the spec, verified by tests/accounting.test.mjs):
 * 1. Bill ₹500 / received ₹200 -> due ₹300. Only ₹200 counts as cash/UPI.
 * 2. Money Transfer ₹10,000 with ₹50 commission -> profit is ₹50 ONLY.
 *    The transferred principal is NEVER profit.
 * 3. Cash -> UPI ₹1,000 internal transfer -> ₹0 income, ₹0 expense.
 * 4. Customer receivable and agent payable are SEPARATE ledgers.
 * 5. Billing, actual received, revenue, cash balance and profit are
 *    DIFFERENT figures — never confuse them.
 */
import { addPaise } from './money';
import type {
  Agent,
  CashTxn,
  DailyEntry,
  Expense,
  Job,
  MtExpense,
  MtFund,
  MtTransfer,
} from './types';

/** Rule 1: what the customer still owes on a job. */
export function jobDuePaise(job: Pick<Job, 'totalPaise' | 'receivedPaise'>): number {
  return Math.max(0, job.totalPaise - job.receivedPaise);
}

/** Rule 1: only money actually received increases cash/UPI. */
export function jobReceivedPaise(job: Pick<Job, 'receivedPaise'>): number {
  return job.receivedPaise;
}

/** Agent margin on a job: what the shop keeps (received - agent charge). */
export function jobMarginPaise(job: Pick<Job, 'receivedPaise' | 'agentChargePaise'>): number {
  return job.receivedPaise - job.agentChargePaise;
}

/** Rule 4: what is still payable to an agent across their jobs. */
export function agentPayablePaise(
  agent: Pick<Agent, 'id'>,
  jobs: Pick<Job, 'agentId' | 'agentChargePaise' | 'agentPaidPaise'>[],
): number {
  return jobs
    .filter((j) => j.agentId === agent.id)
    .reduce((sum, j) => sum + Math.max(0, j.agentChargePaise - j.agentPaidPaise), 0);
}

/** Rule 4: total customer due across jobs (receivable ledger). */
export function totalCustomerDuePaise(
  jobs: Pick<Job, 'totalPaise' | 'receivedPaise'>[],
): number {
  return jobs.reduce((sum, j) => sum + jobDuePaise(j), 0);
}

/** Cash / UPI balance from opening balance + transactions.
 *  Internal transfers move money between cash and UPI but change neither
 *  the total nor income/expense (Rule 3). */
export function balancesPaise(
  openingCash: number,
  openingUpi: number,
  txns: Pick<CashTxn, 'kind' | 'method' | 'amountPaise' | 'transferTo'>[],
): { cash: number; upi: number } {
  let cash = openingCash;
  let upi = openingUpi;
  for (const t of txns) {
    const apply = (method: 'cash' | 'upi', delta: number) => {
      if (method === 'cash') cash += delta;
      else upi += delta;
    };
    if (t.kind === 'in') apply(t.method, t.amountPaise);
    else if (t.kind === 'out') apply(t.method, -t.amountPaise);
    else if (t.kind === 'transfer' && t.transferTo) {
      apply(t.method, -t.amountPaise);
      apply(t.transferTo, t.amountPaise);
    }
  }
  return { cash, upi };
}

/** Rule 3: income from a set of transactions — internal transfers count 0. */
export function incomePaise(txns: Pick<CashTxn, 'kind' | 'amountPaise'>[]): number {
  return txns.filter((t) => t.kind === 'in').reduce((s, t) => s + t.amountPaise, 0);
}

export function expensePaise(txns: Pick<CashTxn, 'kind' | 'amountPaise'>[]): number {
  return txns.filter((t) => t.kind === 'out').reduce((s, t) => s + t.amountPaise, 0);
}

/** Money Transfer closing balances (brother's fund ledger, fully separate).
 *  Closing = Starting + Funds received - Sent - MT expenses.
 *  Cash and UPI tracked separately. */
export function mtClosingPaise(
  openingCash: number,
  openingUpi: number,
  funds: Pick<MtFund, 'amountPaise' | 'method'>[],
  transfers: Pick<MtTransfer, 'amountPaise' | 'method' | 'status'>[],
  expenses: Pick<MtExpense, 'amountPaise' | 'method'>[],
): { cash: number; upi: number; total: number } {
  let cash = openingCash;
  let upi = openingUpi;
  for (const f of funds) {
    if (f.method === 'cash') cash += f.amountPaise;
    else upi += f.amountPaise;
  }
  for (const t of transfers) {
    if (t.status === 'Failed') continue;
    if (t.method === 'cash') cash -= t.amountPaise;
    else upi -= t.amountPaise;
  }
  for (const e of expenses) {
    if (e.method === 'cash') cash -= e.amountPaise;
    else upi -= e.amountPaise;
  }
  return { cash, upi, total: cash + upi };
}

/** Rule 2: Money Transfer profit = commission ONLY, never the principal. */
export function mtProfitPaise(
  transfers: Pick<MtTransfer, 'commissionPaise' | 'status'>[],
  expenses: Pick<MtExpense, 'amountPaise'>[],
): number {
  const commission = transfers
    .filter((t) => t.status !== 'Failed')
    .reduce((s, t) => s + t.commissionPaise, 0);
  const exp = expenses.reduce((s, e) => s + e.amountPaise, 0);
  return commission - exp;
}

/** Service-wise profit: received - agent charges - direct expenses. */
export function serviceProfitPaise(
  service: string,
  jobs: Pick<Job, 'service' | 'receivedPaise' | 'agentChargePaise'>[],
  expenses: Pick<Expense, 'service' | 'amountPaise'>[],
): { received: number; agentCharges: number; expenses: number; profit: number } {
  const received = jobs
    .filter((j) => j.service === service)
    .reduce((s, j) => s + j.receivedPaise, 0);
  const agentCharges = jobs
    .filter((j) => j.service === service)
    .reduce((s, j) => s + j.agentChargePaise, 0);
  const exp = expenses
    .filter((e) => e.service === service)
    .reduce((s, e) => s + e.amountPaise, 0);
  return { received, agentCharges, expenses: exp, profit: received - agentCharges - exp };
}

/** Net profit for a profile: service income + MT commission - expenses.
 *  Billing (total) is NOT income; only received money counts. */
export function netProfitPaise(
  jobs: Pick<Job, 'receivedPaise' | 'agentChargePaise'>[],
  expenses: Pick<Expense, 'amountPaise'>[],
  mtTransfers: Pick<MtTransfer, 'commissionPaise' | 'status'>[],
  mtExpenses: Pick<MtExpense, 'amountPaise'>[],
): number {
  const received = jobs.reduce((s, j) => s + j.receivedPaise, 0);
  const agentCharges = jobs.reduce((s, j) => s + j.agentChargePaise, 0);
  const exp = expenses.reduce((s, e) => s + e.amountPaise, 0);
  const mtProfit = mtProfitPaise(mtTransfers, mtExpenses);
  return addPaise(received, -agentCharges, -exp, mtProfit);
}

/** Lifetime cost of a machine: purchase + all maintenance. */
export function equipmentLifetimeCostPaise(
  purchaseCostPaise: number,
  records: { costPaise: number }[],
): number {
  return purchaseCostPaise + records.reduce((s, r) => s + r.costPaise, 0);
}

/* ================= Daily Business hub =================
 *
 * ONE real transaction = ONE entry in the books. The hub never adds a
 * job's received money AND its CashTxn together — the CashTxn IS the money.
 * Derivation rules (all verified by tests/accounting.test.mjs):
 *  - Collection = CashTxn kind 'in' (job payments, quick entries, manual
 *    cash-book income) + MT commission. Internal transfers count 0.
 *  - A quick daily entry writes exactly one 'in' CashTxn, linked by
 *    dailyEntryId: the hub shows the ENTRY row, not the CashTxn row.
 *  - An Expense record writes exactly one 'out' CashTxn, linked by
 *    expenseId: the hub shows the EXPENSE row, not the CashTxn row.
 *  - MT principal is NEVER collection or profit — only commission.
 *  - Customer due (job total - received, plus 'other'-mode quick entries)
 *    is NEVER collection; it is shown separately.
 *  - Net earnings = total collection - all expenses - agent charges on
 *    in-range jobs that are still unpaid. (Agent payments already sit
 *    inside CashTxn 'out', so only the UNPAID part is deducted — the paid
 *    part is never deducted twice.)
 */

/** Label for Money Transfer earnings in the hub (commission only). */
export const MT_COMMISSION_SERVICE = 'Money Transfer Commission';
/** Fallback service for manual Cash/UPI Book income with no job/entry. */
export const OTHER_SERVICES = 'Other Services';

export type DailyRowKind = 'quick' | 'collection' | 'mt' | 'expense' | 'mt-expense';

export interface DailyRow {
  id: string;
  kind: DailyRowKind;
  date: string;
  /** HH:mm when known (quick entries + createdAt of txns/expenses). */
  time: string;
  service: string;
  label: string;
  detail: string;
  method: 'cash' | 'upi' | 'other';
  /** Signed paise: + money in, − money out. For an 'other'-mode quick
   *  entry this is the billed total, but collected=false: it is due. */
  amountPaise: number;
  /** True when the money actually moved (Cash/UPI). False for 'other'. */
  collected: boolean;
  /** MT principal, for 'mt' rows only (never income, shown for clarity). */
  principalPaise?: number;
  /** Quick-entry breakdown, for 'quick' rows only (view formats ₹). */
  quantity?: number;
  ratePaise?: number;
  expensePaise?: number;
  /** Where the row jumps to, or null. */
  link: string | null;
}

export interface DailyBusinessInput {
  start: string;
  end: string;
  jobs: Pick<Job, 'id' | 'service' | 'date' | 'totalPaise' | 'receivedPaise' | 'agentChargePaise' | 'agentPaidPaise'>[];
  cashTxns: Pick<CashTxn, 'id' | 'kind' | 'method' | 'amountPaise' | 'category' | 'note' | 'date' | 'jobId' | 'dailyEntryId' | 'expenseId' | 'createdAt'>[];
  dailyEntries: Pick<DailyEntry, 'id' | 'service' | 'description' | 'quantity' | 'ratePaise' | 'totalPaise' | 'method' | 'expensePaise' | 'date' | 'time' | 'notes' | 'createdAt'>[];
  expenses: Pick<Expense, 'id' | 'service' | 'category' | 'description' | 'amountPaise' | 'method' | 'date' | 'createdAt'>[];
  mtTransfers: Pick<MtTransfer, 'id' | 'receiverName' | 'amountPaise' | 'commissionPaise' | 'method' | 'status' | 'date'>[];
  mtExpenses: Pick<MtExpense, 'id' | 'category' | 'amountPaise' | 'method' | 'date'>[];
}

export interface ServiceCollection {
  service: string;
  collection: number;
  cash: number;
  upi: number;
  commission: number;
  due: number;
  directExpenses: number;
  transactions: number;
}

export interface DailyBusinessSummary {
  totalCollection: number;
  cashCollection: number;
  upiCollection: number;
  mtCommission: number;
  shopExpenses: number;
  mtExpensesTotal: number;
  /** shopExpenses + mtExpensesTotal. */
  expenses: number;
  netEarnings: number;
  customerDue: number;
  jobDue: number;
  quickEntryDue: number;
  totalTransactions: number;
  byService: ServiceCollection[];
}

function timeOf(createdAt: string): string {
  return createdAt && createdAt.length > 16 ? createdAt.slice(11, 16) : '';
}

/**
 * The unified Recent Entries list for a date range: every real daily
 * event exactly once, newest first. Internal transfers are not events
 * (they move money, they are not income/expense) and are left out.
 */
export function buildDailyRows(input: DailyBusinessInput): DailyRow[] {
  const { start, end } = input;
  const inRange = (d: string) => d >= start && d <= end;
  const jobById = new Map(input.jobs.map((j) => [j.id, j]));
  const rows: DailyRow[] = [];

  for (const e of input.dailyEntries) {
    if (!inRange(e.date)) continue;
    const collected = e.method !== 'other';
    rows.push({
      id: e.id,
      kind: 'quick',
      date: e.date,
      time: e.time,
      service: e.service,
      label: e.description || e.service,
      detail: e.notes || '',
      method: e.method,
      amountPaise: e.totalPaise,
      collected,
      quantity: e.quantity,
      ratePaise: e.ratePaise,
      expensePaise: e.expensePaise,
      link: null,
    });
  }

  for (const x of input.cashTxns) {
    if (!inRange(x.date)) continue;
    if (x.kind === 'transfer') continue; // internal move, never income/expense
    if (x.kind === 'in' && x.dailyEntryId) continue; // shown as the quick-entry row
    if (x.kind === 'out' && x.expenseId) continue; // shown as the expense row
    const job = x.jobId ? jobById.get(x.jobId) : undefined;
    rows.push({
      id: x.id,
      kind: x.kind === 'in' ? 'collection' : 'expense',
      date: x.date,
      time: timeOf(x.createdAt),
      service: job ? job.service : x.kind === 'in' ? OTHER_SERVICES : 'General',
      label: x.category,
      detail: x.note || (job ? `Job payment — ${job.service}` : ''),
      method: x.method,
      amountPaise: x.kind === 'in' ? x.amountPaise : -x.amountPaise,
      collected: x.kind === 'in',
      link: x.kind === 'in' && x.method === 'cash' ? '/cash-book' : x.kind === 'in' ? '/upi-book' : null,
    });
  }

  for (const e of input.expenses) {
    if (!inRange(e.date)) continue;
    rows.push({
      id: e.id,
      kind: 'expense',
      date: e.date,
      time: timeOf(e.createdAt),
      service: e.service,
      label: e.description,
      detail: e.category,
      method: e.method,
      amountPaise: -e.amountPaise,
      collected: false,
      link: '/expenses',
    });
  }

  for (const m of input.mtTransfers) {
    if (!inRange(m.date) || m.status === 'Failed') continue;
    rows.push({
      id: m.id,
      kind: 'mt',
      date: m.date,
      time: '',
      service: MT_COMMISSION_SERVICE,
      label: `Transfer to ${m.receiverName}`,
      detail: 'Principal is not income — only commission counts',
      method: m.method,
      amountPaise: m.commissionPaise,
      collected: m.commissionPaise > 0,
      principalPaise: m.amountPaise,
      link: '/money-transfer',
    });
  }

  for (const e of input.mtExpenses) {
    if (!inRange(e.date)) continue;
    rows.push({
      id: e.id,
      kind: 'mt-expense',
      date: e.date,
      time: '',
      service: 'Money Transfer',
      label: e.category,
      detail: 'MT other expense',
      method: e.method,
      amountPaise: -e.amountPaise,
      collected: false,
      link: '/money-transfer',
    });
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.time !== b.time) return a.time < b.time ? 1 : -1;
    return 0;
  });
  return rows;
}

/** Full Daily Business summary for a date range (integer paise). */
export function dailyBusinessSummary(input: DailyBusinessInput): DailyBusinessSummary {
  const { start, end } = input;
  const inRange = (d: string) => d >= start && d <= end;
  const rows = buildDailyRows(input);

  let cashCollection = 0;
  let upiCollection = 0;
  let mtCommission = 0;
  let shopExpenses = 0;
  let mtExpensesTotal = 0;
  const byService = new Map<string, ServiceCollection>();
  const svc = (name: string): ServiceCollection => {
    let s = byService.get(name);
    if (!s) {
      s = { service: name, collection: 0, cash: 0, upi: 0, commission: 0, due: 0, directExpenses: 0, transactions: 0 };
      byService.set(name, s);
    }
    return s;
  };

  for (const r of rows) {
    const s = svc(r.service);
    s.transactions += 1;
    if (r.kind === 'mt') {
      mtCommission += r.amountPaise;
      s.collection += r.amountPaise;
      s.commission += r.amountPaise;
    } else if (r.kind === 'quick' || r.kind === 'collection') {
      if (!r.collected) {
        s.due += r.amountPaise; // 'other'-mode quick entry: due, never collection
      } else if (r.method === 'cash') {
        cashCollection += r.amountPaise;
        s.collection += r.amountPaise;
        s.cash += r.amountPaise;
      } else {
        upiCollection += r.amountPaise;
        s.collection += r.amountPaise;
        s.upi += r.amountPaise;
      }
    } else if (r.kind === 'expense') {
      shopExpenses += -r.amountPaise;
    } else if (r.kind === 'mt-expense') {
      mtExpensesTotal += -r.amountPaise;
    }
  }

  // Direct expenses per service (Expense records; the matching CashTxn
  // 'out' is already excluded from the rows, so this counts once).
  for (const e of input.expenses) {
    if (!inRange(e.date)) continue;
    svc(e.service).directExpenses += e.amountPaise;
  }
  // MT expenses sit on the Money Transfer Commission row.
  if (mtExpensesTotal > 0) svc(MT_COMMISSION_SERVICE).directExpenses += mtExpensesTotal;

  // Customer due on jobs billed in range (receivable, never collection).
  let jobDue = 0;
  for (const j of input.jobs) {
    if (!inRange(j.date)) continue;
    const due = jobDuePaise(j);
    if (due > 0) {
      jobDue += due;
      svc(j.service).due += due;
    }
  }
  const quickEntryDue = rows
    .filter((r) => r.kind === 'quick' && !r.collected)
    .reduce((s, r) => s + r.amountPaise, 0);

  // Agent charges on in-range jobs still unpaid (paid part already sits
  // inside CashTxn 'out' via shopExpenses — never deduct it twice).
  let unpaidAgentCharges = 0;
  for (const j of input.jobs) {
    if (!inRange(j.date)) continue;
    unpaidAgentCharges += Math.max(0, j.agentChargePaise - j.agentPaidPaise);
  }

  const totalCollection = cashCollection + upiCollection + mtCommission;
  const expenses = shopExpenses + mtExpensesTotal;
  const netEarnings = totalCollection - expenses - unpaidAgentCharges;

  const byServiceList = [...byService.values()].sort(
    (a, b) => b.collection - a.collection || b.transactions - a.transactions,
  );

  return {
    totalCollection,
    cashCollection,
    upiCollection,
    mtCommission,
    shopExpenses,
    mtExpensesTotal,
    expenses,
    netEarnings,
    customerDue: jobDue + quickEntryDue,
    jobDue,
    quickEntryDue,
    totalTransactions: rows.length,
    byService: byServiceList,
  };
}
