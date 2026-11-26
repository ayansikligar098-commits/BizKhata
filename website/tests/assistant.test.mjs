/**
 * BizKhata AI Assistant tests — run with `npm test`.
 * Compiles src/lib/*.ts with tsc into /tmp and drives the real parser
 * + backend executor against a known fixture (no mocks of the logic).
 * Covers: daily income, multi-service, clarification, follow-ups,
 * expense, MT commission rules, agent payment, internal transfer,
 * customer due (never income), correction, delete -> Recycle Bin,
 * refund, idempotency, duplicate warning, profile isolation, and
 * knowledge Q&A (service earnings, compare, biggest due, agent, MT,
 * maintenance, help links, navigation, missing-data honesty).
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/bizkhata-ai-test';

execSync(
  `npx tsc src/lib/types.ts src/lib/money.ts src/lib/accounting.ts src/lib/store.ts src/lib/categories.ts src/lib/routes.ts src/lib/languages.ts src/lib/chatbot.ts src/lib/knowledge.ts src/lib/assistant.ts src/lib/ai.ts --outDir ${outDir} --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'pipe' },
);

const require = createRequire(import.meta.url);
const chat = require(path.join(outDir, 'chatbot.js'));
const know = require(path.join(outDir, 'knowledge.js'));
const asst = require(path.join(outDir, 'assistant.js'));
const acct = require(path.join(outDir, 'accounting.js'));

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  if (Object.is(actual, expected)) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const TODAY = new Date().toISOString().slice(0, 10);
const YDAY = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

function profile(id, name) {
  return {
    id, name, category: 'Cyber Cafe / CSC Center',
    services: ['PAN Card', 'Aadhaar Services', 'Voter ID', 'Ayushman Card', 'Smart Card', 'Xerox', 'Printing', 'Passport Size Photo', 'Scanning', 'Document Work'],
    customServices: [], expenseCategories: ['Machine Repair', 'Printer Repair', 'Servicing', 'Ink', 'Toner', 'Cartridge', 'Paper', 'Electricity', 'Internet', 'Rent', 'Staff', 'Transport', 'Other'],
    customExpenseCategories: [], disabledModules: [], hiddenCards: [],
    address: 'Main Road', mobile: '9876543210', openingCashPaise: 0, openingUpiPaise: 0,
    receiptPrefix: 'BK', receiptCounter: 0, language: 'hinglish', theme: 'light', createdAt: TODAY,
  };
}

function fixture() {
  const p1 = profile('prof1', 'Al Falah Communication');
  const p2 = profile('prof2', 'Second Shop');
  const state = {
    owner: null, profiles: [p1, p2], activeProfileId: 'prof1',
    jobs: [
      { id: 'job1', profileId: 'prof1', service: 'PAN Card', customerName: 'Rahul', mobile: '9876500001', refNo: '', status: 'Completed', totalPaise: 50000, receivedPaise: 20000, receivedMethod: 'cash', agentId: 'agt1', agentChargePaise: 25000, agentPaidPaise: 15000, date: TODAY, notes: '', docIds: [], createdAt: TODAY, updatedAt: TODAY },
      { id: 'job2', profileId: 'prof1', service: 'Aadhaar Services', customerName: 'Priya', mobile: '9876500002', refNo: '', status: 'Completed', totalPaise: 30000, receivedPaise: 30000, receivedMethod: 'upi', agentId: null, agentChargePaise: 0, agentPaidPaise: 0, date: YDAY, notes: '', docIds: [], createdAt: YDAY, updatedAt: YDAY },
    ],
    dailyEntries: [], cashTxns: [
      { id: 'txn1', profileId: 'prof1', kind: 'in', method: 'cash', amountPaise: 20000, category: 'PAN Card — Rahul', note: 'Job payment (job1)', date: TODAY, jobId: 'job1', createdAt: TODAY },
      { id: 'txn2', profileId: 'prof1', kind: 'in', method: 'upi', amountPaise: 30000, category: 'Aadhaar Services — Priya', note: 'Job payment (job2)', date: YDAY, jobId: 'job2', createdAt: YDAY },
    ],
    mtFunds: [{ id: 'mtf1', profileId: 'prof1', amountPaise: 2000000, method: 'upi', date: TODAY, note: 'Fund from brother' }],
    mtTransfers: [], mtExpenses: [],
    customers: [
      { id: 'cus1', profileId: 'prof1', name: 'Rahul', mobile: '9876500001', notes: '', docIds: [], createdAt: TODAY },
      { id: 'cus2', profileId: 'prof1', name: 'Priya', mobile: '9876500002', notes: '', docIds: [], createdAt: YDAY },
    ],
    docs: [], agents: [{ id: 'agt1', profileId: 'prof1', name: 'Ramesh Bhai', mobile: '9876500010', type: 'Aadhaar Backend Agent', status: 'Active', notes: '' }],
    expenses: [], equipment: [{ id: 'eq1', profileId: 'prof1', name: 'Epson L805', purchaseDate: '2025-01-10', purchaseCostPaise: 1500000, lastMaintenance: TODAY, nextMaintenance: TODAY, records: [{ id: 'm1', date: TODAY, description: 'Printhead cleaning', partsReplaced: 'Ink pad', costPaise: 80000 }] }],
    receipts: [], audit: [], recycle: [], executedActionKeys: [],
  };
  return { state, p1, p2 };
}

function exec(state, p, action, key) {
  const res = asst.applyAssistantAction(state, p.id, action, key);
  return res;
}

console.log('BizKhata AI Assistant — executor + parser + knowledge:');

// --- 1. Xerox cash via chat (parse + execute) ---
{
  const { state, p1 } = fixture();
  const parsed = chat.parseAssistantMessage('Aaj Xerox ke 300 rupaye cash hue', state, p1, {});
  check('parse xerox cash is action', parsed.kind, 'action');
  check('parse xerox amount', parsed.action.entries[0].amountPaise, 30000);
  check('parse xerox method', parsed.action.entries[0].method, 'cash');
  const res = exec(state, p1, parsed.action, 'k1');
  check('xerox cash saved', res.ok, true);
  check('daily entry written', state.dailyEntries.length, 1);
  check('one cash txn written', state.cashTxns.length, 3);
  check('cash balance +300', acct.balancesPaise(0, 0, state.cashTxns.filter((x) => x.profileId === 'prof1')).cash, 50000);
  check('audit logged', state.audit.length > 0, true);
}

// --- 2. UPI collection via chat ---
{
  const { state, p1 } = fixture();
  const parsed = chat.parseAssistantMessage('Aaj 500 rupaye UPI se printing hui', state, p1, {});
  check('parse upi printing is action', parsed.kind, 'action');
  check('upi amount', parsed.action.entries[0].amountPaise, 50000);
  check('upi method', parsed.action.entries[0].method, 'upi');
  check('upi service', parsed.action.entries[0].service, 'Printing');
  const res = exec(state, p1, parsed.action, 'k2');
  check('upi saved', res.ok, true);
  check('upi balance +500', acct.balancesPaise(0, 0, state.cashTxns.filter((x) => x.profileId === 'prof1')).upi, 80000);
}

// --- 3. Multiple services in one message ---
{
  const { state, p1 } = fixture();
  const parsed = chat.parseAssistantMessage('Aaj Xerox 300 cash, 200 UPI aur Smart Card 500 cash hua', state, p1, {});
  check('multi-service is action', parsed.kind, 'action');
  check('multi-service entries', parsed.action.entries.length, 3);
  check('multi-service total', parsed.totalPaise, 100000);
  const res = exec(state, p1, parsed.action, 'k3');
  check('multi-service saved', res.ok, true);
  check('multi-service entries written', state.dailyEntries.length, 3);
  const hub = acct.dailyBusinessSummary({ start: TODAY, end: TODAY, jobs: state.jobs, cashTxns: state.cashTxns, dailyEntries: state.dailyEntries, expenses: state.expenses, mtTransfers: state.mtTransfers, mtExpenses: state.mtExpenses });
  check('hub collection 1000 + 200 job', hub.totalCollection, 120000);
}

// --- 4. Expense via chat ---
{
  const { state, p1 } = fixture();
  const parsed = chat.parseAssistantMessage('Aaj 200 rupaye machine repair mein kharch hue', state, p1, {});
  check('expense is action', parsed.kind, 'action');
  check('expense category', parsed.action.category, 'Machine Repair');
  const res = exec(state, p1, parsed.action, 'k4');
  check('expense saved', res.ok, true);
  check('expense record', state.expenses.length, 1);
  check('expense cash out', state.cashTxns.filter((x) => x.kind === 'out').length, 1);
}

// --- 5. Agent payment via chat ---
{
  const { state, p1 } = fixture();
  const parsed = chat.parseAssistantMessage('Agent Ramesh ko 50 rupaye diye', state, p1, {});
  check('agent pay is action', parsed.kind, 'action');
  check('agent pay amount', parsed.action.amountPaise, 5000);
  check('agent id resolved', parsed.action.agentId, 'agt1');
  const res = exec(state, p1, parsed.action, 'k5');
  check('agent pay saved', res.ok, true);
  const job = state.jobs.find((j) => j.id === 'job1');
  check('agent paid now 150+50=200', job.agentPaidPaise, 20000);
  check('agent payable now 50', acct.agentPayablePaise({ id: 'agt1' }, state.jobs), 5000);
}

// --- 6. MT commission recorded correctly ---
{
  const { state, p1 } = fixture();
  const parsed = chat.parseAssistantMessage('Rahul ko 10000 transfer kiya, commission 50 mila', state, p1, {});
  check('mt is action', parsed.kind, 'action');
  check('mt principal', parsed.action.amountPaise, 1000000);
  check('mt commission', parsed.action.commissionPaise, 5000);
  const res = exec(state, p1, parsed.action, 'k6');
  check('mt saved', res.ok, true);
  check('mt profit = commission only', acct.mtProfitPaise(state.mtTransfers, state.mtExpenses), 5000);
  check('mt closing upi 20000-10000', acct.mtClosingPaise(0, 0, state.mtFunds, state.mtTransfers, state.mtExpenses).upi, 1000000);
}

// --- 7. Daily summary via knowledge ---
{
  const { state, p1 } = fixture();
  const parsed = chat.parseAssistantMessage('Aaj Xerox ke 300 rupaye cash hue', state, p1, {});
  exec(state, p1, parsed.action, 'k7');
  const ans = know.computeKnowledge(state, p1, 'Aaj kitna dhandha hua?', {});
  check('daily summary answered', ans !== null, true);
  check('daily summary has collection 500 (200 job + 300 xerox)', ans.text.includes('₹500.00'), true);
}

// --- 8. Customer outstanding ---
{
  const { state, p1 } = fixture();
  const ans = know.computeKnowledge(state, p1, 'Sabse zyada due kis customer ka hai?', {});
  check('biggest due answered', ans !== null, true);
  check('biggest due is Rahul 300', ans.text.includes('Rahul') && ans.text.includes('₹300.00'), true);
}

// --- 9. Agent payable ---
{
  const { state, p1 } = fixture();
  const ans = know.computeKnowledge(state, p1, 'Ramesh agent ko kitna dena baaki hai?', {});
  check('agent payable answered', ans !== null, true);
  check('agent payable 100', ans.text.includes('₹100.00'), true);
}

// --- 10. Correct a transaction via chat ---
{
  const { state, p1 } = fixture();
  const parsed = chat.parseAssistantMessage('Aaj Xerox ke 300 rupaye cash hue', state, p1, {});
  exec(state, p1, parsed.action, 'k10a');
  const fix = chat.parseAssistantMessage('Xerox 300 galat tha, 250 hona chahiye', state, p1, {});
  check('correction is action', fix.kind, 'action');
  check('correction new amount', fix.action.newAmountPaise, 25000);
  const res = exec(state, p1, fix.action, 'k10b');
  check('correction saved', res.ok, true);
  check('entry corrected to 250', state.dailyEntries[0].totalPaise, 25000);
  check('linked txn corrected', state.cashTxns.find((x) => x.dailyEntryId === state.dailyEntries[0].id).amountPaise, 25000);
}

// --- 11. Cancel an unconfirmed transaction (parser level: cancel intent) ---
{
  const { state, p1 } = fixture();
  check('cancel intent', chat.parseAssistantMessage('Nahi, cancel kar do', state, p1, {}).kind, 'cancel');
  check('nothing saved after cancel', state.dailyEntries.length, 0);
}

// --- 12. Incomplete / ambiguous messages -> clarification, never invented ---
{
  const { state, p1 } = fixture();
  const m1 = chat.parseAssistantMessage('Aaj 500 rupaye printing hui', state, p1, {});
  check('missing method -> draft', m1.kind, 'draft');
  check('draft asks cash/upi', m1.draft.missing, 'method');
  const m2 = chat.parseAssistantMessage('Aaj 300 rupaye hue', state, p1, {});
  check('missing service -> draft', m2.kind, 'draft');
  check('draft missing service', m2.draft.missing, 'service');
  // Complete the method draft: "cash" -> action.
  const done = chat.applyDraftAnswer(m1.draft, 'cash', state, p1, {});
  check('draft completed to action', done.kind, 'action');
  check('draft completed method cash', done.action.entries[0].method, 'cash');
}

// --- 13. Duplicate prevention: same idempotency key twice ---
{
  const { state, p1 } = fixture();
  const parsed = chat.parseAssistantMessage('Aaj Xerox ke 300 rupaye cash hue', state, p1, {});
  const r1 = exec(state, p1, parsed.action, 'dup-key');
  const r2 = exec(state, p1, parsed.action, 'dup-key');
  check('first save ok', r1.ok, true);
  check('second save rejected as duplicate', r2.duplicate, true);
  check('only one entry after retry', state.dailyEntries.length, 1);
  // ...but a legitimate identical transaction with a NEW key is allowed.
  const warn = chat.findDuplicateWarning(state, p1.id, parsed.action);
  check('duplicate warning shown', typeof warn === 'string' && warn.length > 0, true);
  const r3 = exec(state, p1, parsed.action, 'dup-key-2');
  check('legitimate identical txn allowed with new key', r3.ok, true);
  check('two entries now', state.dailyEntries.length, 2);
}

// --- 14. Multiple business profiles: isolation ---
{
  const { state, p1, p2 } = fixture();
  const parsed = chat.parseAssistantMessage('Aaj Xerox ke 300 rupaye cash hue', state, p1, {});
  exec(state, p1, parsed.action, 'k14');
  check('p2 has no entries', state.dailyEntries.filter((x) => x.profileId === 'prof2').length, 0);
  check('p2 has no txns', state.cashTxns.filter((x) => x.profileId === 'prof2').length, 0);
  const ans2 = know.computeKnowledge(state, p2, 'Aaj kitna dhandha hua?', {});
  check('p2 summary says no records', ans2.text.includes('koi record nahi'), true);
}

// --- 15. Hindi / Hinglish + Devanagari digits ---
{
  const { state, p1 } = fixture();
  const parsed = chat.parseAssistantMessage('आज ज़ेरॉक्स के ३०० रुपये कैश हुए', state, p1, {});
  check('devanagari xerox action', parsed.kind, 'action');
  check('devanagari amount 300', parsed.action.entries[0].amountPaise, 30000);
  const h2 = chat.parseAssistantMessage('Aaj do sau rupaye Xerox cash hue', state, p1, {});
  check('hindi words do sau = 200', h2.kind === 'action' && h2.action.entries[0].amountPaise, 20000);
}

// --- 16. Customer due is NEVER income ---
{
  const { state, p1 } = fixture();
  const parsed = chat.parseAssistantMessage('Rahul ko Xerox 500 udhaar diya', state, p1, {});
  check('udhaar is action', parsed.kind, 'action');
  const res = exec(state, p1, parsed.action, 'k16');
  check('udhaar saved', res.ok, true);
  const job = state.jobs.find((j) => j.customerName === 'Rahul' && j.service === 'Xerox');
  check('udhaar job received 0', job ? job.receivedPaise : -1, 0);
  check('udhaar job due 500', job ? acct.jobDuePaise(job) : -1, 50000);
  check('no cash txn for udhaar', state.cashTxns.filter((x) => x.jobId === (job && job.id)).length, 0);
}

// --- 17. Internal transfer is not income ---
{
  const { state, p1 } = fixture();
  const parsed = chat.parseAssistantMessage('1000 rupaye cash se UPI transfer kar do', state, p1, {});
  check('internal transfer action', parsed.kind, 'action');
  const res = exec(state, p1, parsed.action, 'k17');
  check('transfer saved', res.ok, true);
  check('transfer income 0', acct.incomePaise(state.cashTxns.filter((x) => x.profileId === 'prof1')), 50000); // only the 200+300 job receipts
}

// --- 18. Delete -> Recycle Bin + audit ---
{
  const { state, p1 } = fixture();
  const parsed = chat.parseAssistantMessage('Aaj 200 rupaye machine repair mein kharch hue', state, p1, {});
  exec(state, p1, parsed.action, 'k18a');
  const del = chat.parseAssistantMessage('Machine Repair 200 wali entry delete kar do', state, p1, {});
  check('delete is action', del.kind, 'action');
  const res = exec(state, p1, del.action, 'k18b');
  check('delete saved', res.ok, true);
  check('expense gone', state.expenses.length, 0);
  check('in recycle bin', state.recycle.length > 0, true);
}

// --- 19. Refund is a reversal, not an expense ---
{
  const { state, p1 } = fixture();
  const parsed = chat.parseAssistantMessage('Rahul ko 100 refund karna hai', state, p1, {});
  check('refund is action', parsed.kind, 'action');
  const res = exec(state, p1, parsed.action, 'k19');
  check('refund saved', res.ok, true);
  check('job received 200-100', state.jobs.find((j) => j.id === 'job1').receivedPaise, 10000);
  check('refund is cash out txn', state.cashTxns.some((x) => x.kind === 'out' && x.category.startsWith('Refund')), true);
}

// --- 20. Knowledge: service month earning, compare, MT, maintenance, help, nav ---
{
  const { state, p1 } = fixture();
  const a1 = know.computeKnowledge(state, p1, 'Is month Xerox se kitna kamaya?', {});
  check('xerox month q answered honestly (₹0, no xerox records)', a1 !== null && a1.text.includes('Xerox') && a1.text.includes('₹0.00'), true);
  const a2 = know.computeKnowledge(state, p1, 'Is month aur last month ki earning compare karo', {});
  check('compare answered with table', a2 !== null && !!a2.table, true);
  const a3 = know.computeKnowledge(state, p1, 'Epson printer par total kitna kharcha hua?', {});
  check('epson expense answered', a3 !== null && a3.text.includes('Epson L805'), true);
  const a4 = know.computeKnowledge(state, p1, 'Cash Book mein entry kaise add karu?', {});
  check('help answered with link', a4 !== null && a4.links && a4.links[0].path === '/cash-book', true);
  const a5 = know.computeKnowledge(state, p1, 'Cash Book kholo', {});
  check('navigation opens cash book', a5 !== null && a5.navigateTo === '/cash-book', true);
  const a6 = know.computeKnowledge(state, p1, 'Last 7 days ka business summary do', {});
  check('7-day summary has 7 rows', a6 !== null && a6.table && a6.table.rows.length, 7);
  const a7 = know.computeKnowledge(state, p1, 'Business mein koi galti hai?', {});
  check('analysis answered', a7 !== null, true);
}

// --- 21. Follow-up context: "Aur 200 UPI bhi add kar do" ---
{
  const { state, p1 } = fixture();
  const first = chat.parseAssistantMessage('Aaj Xerox ke 300 cash hue', state, p1, {});
  exec(state, p1, first.action, 'k21a');
  const follow = chat.parseAssistantMessage('Aur 200 UPI bhi add kar do', state, p1, { lastService: 'Xerox' });
  check('follow-up is action', follow.kind, 'action');
  check('follow-up same service', follow.action.entries[0].service, 'Xerox');
  check('follow-up amount 200 upi', follow.action.entries[0].amountPaise, 20000);
  check('follow-up method upi', follow.action.entries[0].method, 'upi');
  const res = exec(state, p1, follow.action, 'k21b');
  check('follow-up saved without duplicating first', res.ok && state.dailyEntries.length, 2);
}

// --- 22. MT without enough fund fails safely ---
{
  const { state, p1 } = fixture();
  state.mtFunds = [];
  const parsed = chat.parseAssistantMessage('Rahul ko 10000 transfer kiya, commission 50 mila', state, p1, {});
  const res = exec(state, p1, parsed.action, 'k22');
  check('mt without fund rejected', res.ok, false);
  check('no transfer written', state.mtTransfers.length, 0);
}

// --- 23. Unknown agent -> clarification, not invented ---
{
  const { state, p1 } = fixture();
  const parsed = chat.parseAssistantMessage('Agent Mohan ko 500 rupaye diye', state, p1, {});
  check('unknown agent -> draft', parsed.kind, 'draft');
  check('draft missing agent', parsed.draft.missing, 'agent');
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
