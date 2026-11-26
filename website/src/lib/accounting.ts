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
