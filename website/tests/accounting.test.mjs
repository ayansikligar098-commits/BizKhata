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

// Money formatting (integer paise, no float drift).
check('format 500.00', money.formatINR(50000), '₹500.00');
check('format 123456.78', money.formatINR(12345678), '₹1,23,456.78');
check('rupees->paise 500.5', money.rupeesToPaise(500.5), 50050);
check('parse amount', money.parseAmount('1,250.50'), 125050);
check('parse invalid amount', money.parseAmount('abc'), null);

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
