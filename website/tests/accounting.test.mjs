/**
 * BizKhata accounting tests — run with `npm test`.
 * Compiles src/lib/accounting.ts + money.ts with tsc into /tmp and asserts
 * the sacred accounting rules from the spec. No test framework needed.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/bizkhata-acct-test';

execSync(
  `npx tsc src/lib/accounting.ts src/lib/money.ts --outDir ${outDir} --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'pipe' },
);

const require = createRequire(import.meta.url);
const acct = require(path.join(outDir, 'accounting.js'));
const money = require(path.join(outDir, 'money.js'));

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  if (Object.is(actual, expected)) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}: expected ${expected}, got ${actual}`);
  }
}

console.log('BizKhata accounting rules:');

// Rule 1 — bill 500 / received 200 = due 300; only 200 counts as cash.
check('job due 500/200 = 300', acct.jobDuePaise({ totalPaise: 50000, receivedPaise: 20000 }), 30000);
check('job received counts 200', acct.jobReceivedPaise({ receivedPaise: 20000 }), 20000);
check('job due never negative', acct.jobDuePaise({ totalPaise: 10000, receivedPaise: 15000 }), 0);
check('customer due total', acct.totalCustomerDuePaise([
  { totalPaise: 50000, receivedPaise: 20000 },
  { totalPaise: 100000, receivedPaise: 100000 },
]), 30000);

// Rule 2 — MT 10,000 with 50 commission = 50 profit only.
check('MT profit = commission only', acct.mtProfitPaise(
  [{ commissionPaise: 5000, status: 'Sent' }], []), 5000);
check('MT profit minus MT expenses', acct.mtProfitPaise(
  [{ commissionPaise: 5000, status: 'Sent' }],
  [{ amountPaise: 1000 }]), 4000);
check('MT failed transfer earns nothing', acct.mtProfitPaise(
  [{ commissionPaise: 5000, status: 'Failed' }], []), 0);

// Rule 3 — Cash->UPI 1,000 internal transfer = 0 income, 0 expense.
check('internal transfer income = 0', acct.incomePaise([
  { kind: 'transfer', amountPaise: 100000 },
]), 0);
check('internal transfer expense = 0', acct.expensePaise([
  { kind: 'transfer', amountPaise: 100000 },
]), 0);
{
  const b = acct.balancesPaise(0, 0, [
    { kind: 'in', method: 'cash', amountPaise: 100000 },
    { kind: 'transfer', method: 'cash', transferTo: 'upi', amountPaise: 100000 },
  ]);
  check('transfer moves cash to UPI', b.cash, 0);
  check('transfer arrives in UPI', b.upi, 100000);
  const b2 = acct.balancesPaise(50000, 20000, [
    { kind: 'in', method: 'upi', amountPaise: 30000 },
    { kind: 'out', method: 'cash', amountPaise: 10000 },
  ]);
  check('balances: cash', b2.cash, 40000);
  check('balances: upi', b2.upi, 50000);
}

// Rule 4 — customer receivable and agent payable are separate ledgers.
check('agent payable', acct.agentPayablePaise({ id: 'a1' }, [
  { agentId: 'a1', agentChargePaise: 25000, agentPaidPaise: 15000 },
  { agentId: 'a1', agentChargePaise: 30000, agentPaidPaise: 30000 },
  { agentId: 'a2', agentChargePaise: 99900, agentPaidPaise: 0 },
]), 10000);
check('agent margin 500 received - 250 charge', acct.jobMarginPaise(
  { receivedPaise: 50000, agentChargePaise: 25000 }), 25000);

// MT closing: starting + funds - sent - expenses, cash and UPI separate.
{
  const c = acct.mtClosingPaise(
    0, 0,
    [{ amountPaise: 2000000, method: 'upi' }], // brother's fund by UPI
    [{ amountPaise: 1000000, method: 'upi', status: 'Sent' }],
    [{ amountPaise: 5000, method: 'upi' }],
  );
  check('MT closing UPI = 20000-10000-50', c.upi, 995000);
  check('MT closing cash = 0', c.cash, 0);
  check('MT closing total', c.total, 995000);
}

// Service profit: received - agent charges - direct expenses.
{
  const s = acct.serviceProfitPaise('Printing',
    [{ service: 'Printing', receivedPaise: 100000, agentChargePaise: 0 }],
    [{ service: 'Printing', amountPaise: 20000 }],
  );
  check('service profit', s.profit, 80000);
}

// Net profit: received + MT commission - agent charges - expenses.
check('net profit example', acct.netProfitPaise(
  [{ receivedPaise: 20000, agentChargePaise: 0 }],
  [{ amountPaise: 0 }],
  [{ commissionPaise: 5000, status: 'Sent' }],
  [],
), 25000);

// Equipment lifetime cost: purchase + maintenance.
check('equipment lifetime cost', acct.equipmentLifetimeCostPaise(500000, [
  { costPaise: 80000 }, { costPaise: 120000 }, { costPaise: 50000 },
]), 750000);

// ---- Daily Business hub: one real transaction = one entry ----
{
  // PAN job 500 / received 200 (cash) + its CashTxn: collection 200,
  // due 300 shown separately, the job counted ONCE (not 200+200).
  const day = {
    start: '2026-11-26', end: '2026-11-26',
    jobs: [{ id: 'job1', service: 'PAN Card', date: '2026-11-26', totalPaise: 50000, receivedPaise: 20000, agentChargePaise: 0, agentPaidPaise: 0 }],
    cashTxns: [{ id: 'txn1', kind: 'in', method: 'cash', amountPaise: 20000, category: 'PAN Card — Rahul', note: 'Job payment (job1)', date: '2026-11-26', jobId: 'job1', createdAt: '2026-11-26T10:00:00.000Z' }],
    dailyEntries: [],
    expenses: [],
    mtTransfers: [],
    mtExpenses: [],
  };
  const s = acct.dailyBusinessSummary(day);
  check('daily: PAN job collection is 200 once', s.totalCollection, 20000);
  check('daily: PAN job cash collection 200', s.cashCollection, 20000);
  check('daily: PAN job due 300 separate', s.customerDue, 30000);
  check('daily: PAN job due not in collection', s.totalCollection + s.customerDue, 50000);
  check('daily: PAN service row collection 200', s.byService.find((x) => x.service === 'PAN Card').collection, 20000);
  check('daily: one transaction row for the job', s.totalTransactions, 1);
  check('daily: net earnings 200', s.netEarnings, 20000);
  const rows = acct.buildDailyRows(day);
  check('daily: one recent-entry row', rows.length, 1);
  check('daily: row is the job payment', rows[0].kind, 'collection');

  // Quick Xerox entry: qty 10 x rate 2 = 20 cash. Its CashTxn is linked
  // by dailyEntryId: the entry shows once, cash balance gets 20 once.
  const xerox = {
    start: '2026-11-26', end: '2026-11-26',
    jobs: [],
    cashTxns: [{ id: 'txn2', kind: 'in', method: 'cash', amountPaise: 2000, category: 'Xerox — 10 pages', note: '', date: '2026-11-26', dailyEntryId: 'de1', createdAt: '2026-11-26T11:00:00.000Z' }],
    dailyEntries: [{ id: 'de1', service: 'Xerox', description: '10 pages B&W', quantity: 10, ratePaise: 200, totalPaise: 2000, method: 'cash', expensePaise: 0, date: '2026-11-26', time: '11:00', notes: '', createdAt: '2026-11-26T11:00:00.000Z' }],
    expenses: [],
    mtTransfers: [],
    mtExpenses: [],
  };
  const sx = acct.dailyBusinessSummary(xerox);
  check('daily: Xerox entry collection 20', sx.totalCollection, 2000);
  check('daily: Xerox entry cash 20', sx.cashCollection, 2000);
  check('daily: Xerox service row 20', sx.byService.find((x) => x.service === 'Xerox').collection, 2000);
  check('daily: Xerox entry is one transaction', sx.totalTransactions, 1);
  check('daily: Xerox row kind is quick', acct.buildDailyRows(xerox)[0].kind, 'quick');

  // Money Transfer 10,000 with 50 commission: income is 50, never 10,000.
  const mt = {
    start: '2026-11-26', end: '2026-11-26',
    jobs: [],
    cashTxns: [],
    dailyEntries: [],
    expenses: [],
    mtTransfers: [{ id: 'mtt1', receiverName: 'Ramesh', amountPaise: 1000000, commissionPaise: 5000, method: 'upi', status: 'Sent', date: '2026-11-26' }],
    mtExpenses: [{ id: 'mte1', category: 'Tea/Food', amountPaise: 1000, method: 'cash', date: '2026-11-26' }],
  };
  const sm = acct.dailyBusinessSummary(mt);
  check('daily: MT collection is commission 50 only', sm.totalCollection, 5000);
  check('daily: MT commission 50', sm.mtCommission, 5000);
  check('daily: MT principal never in collection', sm.totalCollection < 100000, true);
  check('daily: MT net earnings 50-10 expense', sm.netEarnings, 4000);
  check('daily: MT commission service row 50', sm.byService.find((x) => x.service === 'Money Transfer Commission').collection, 5000);

  // 'other'-mode quick entry: billed 100 on credit -> due 100, collection 0.
  const credit = {
    start: '2026-11-26', end: '2026-11-26',
    jobs: [],
    cashTxns: [],
    dailyEntries: [{ id: 'de2', service: 'Printing', description: '50 posters', quantity: 50, ratePaise: 200, totalPaise: 10000, method: 'other', expensePaise: 0, date: '2026-11-26', time: '12:00', notes: '', createdAt: '2026-11-26T12:00:00.000Z' }],
    expenses: [],
    mtTransfers: [],
    mtExpenses: [],
  };
  const sc = acct.dailyBusinessSummary(credit);
  check('daily: credit entry collection 0', sc.totalCollection, 0);
  check('daily: credit entry due 100', sc.customerDue, 10000);
  check('daily: credit entry quick due 100', sc.quickEntryDue, 10000);

  // Internal transfer + direct expense: transfer counts 0; expense counts
  // once even though it has both an Expense record and a CashTxn 'out'.
  const misc = {
    start: '2026-11-26', end: '2026-11-26',
    jobs: [{ id: 'job2', service: 'Aadhaar Services', date: '2026-11-26', totalPaise: 50000, receivedPaise: 50000, agentChargePaise: 25000, agentPaidPaise: 15000 }],
    cashTxns: [
      { id: 'txn3', kind: 'in', method: 'upi', amountPaise: 50000, category: 'Aadhaar Services — Sita', note: '', date: '2026-11-26', jobId: 'job2', createdAt: '2026-11-26T09:00:00.000Z' },
      { id: 'txn4', kind: 'transfer', method: 'cash', transferTo: 'upi', amountPaise: 100000, category: 'Internal Transfer', note: '', date: '2026-11-26', createdAt: '2026-11-26T09:30:00.000Z' },
      { id: 'txn5', kind: 'out', method: 'cash', amountPaise: 15000, category: 'Agent Payment — Aadhaar Services', note: 'Paid to agent', date: '2026-11-26', jobId: 'job2', createdAt: '2026-11-26T10:00:00.000Z' },
      { id: 'txn6', kind: 'out', method: 'cash', amountPaise: 20000, category: 'Expense — Paper', note: 'A4 paper', date: '2026-11-26', expenseId: 'exp1', createdAt: '2026-11-26T10:30:00.000Z' },
    ],
    dailyEntries: [],
    expenses: [{ id: 'exp1', service: 'Printing', category: 'Paper', description: 'A4 paper', amountPaise: 20000, method: 'cash', date: '2026-11-26', createdAt: '2026-11-26T10:30:00.000Z' }],
    mtTransfers: [],
    mtExpenses: [],
  };
  const smisc = acct.dailyBusinessSummary(misc);
  check('daily: transfer adds 0 to collection', smisc.totalCollection, 50000);
  check('daily: expenses = agent pay 150 + paper 200', smisc.expenses, 35000);
  check('daily: net = 500 - 350 - unpaid agent 100', smisc.netEarnings, 5000);
  check('daily: paper counted once (expense row, not txn row)', smisc.totalTransactions, 3);
}

// Money formatting (integer paise, no float drift).
check('format 500.00', money.formatINR(50000), '₹500.00');
check('format 123456.78', money.formatINR(12345678), '₹1,23,456.78');
check('rupees->paise 500.5', money.rupeesToPaise(500.5), 50050);
check('parse amount', money.parseAmount('1,250.50'), 125050);
check('parse invalid amount', money.parseAmount('abc'), null);

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
