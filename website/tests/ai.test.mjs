/**
 * BizKhata AI accuracy suite — run with `npm test`.
 *
 * Measures (does not merely assert "it responds") how accurately the
 * assistant understands predefined business scenarios. Each scenario
 * has a known expected output; the suite prints pass/total and
 * accuracy % per category, plus an overall accuracy figure. It exits
 * non-zero if ANY scenario fails, so accuracy is a gate, not a vibe.
 *
 * Categories: service recognition, amount extraction, payment-mode
 * extraction, date interpretation, multiple transactions, follow-ups,
 * Hindi/Hinglish, MT accounting, outstanding, agent payable, Cash/UPI
 * balances, profile isolation, confirmation handling, ambiguity.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/bizkhata-ai-test';

execSync(
  `npx tsc src/lib/types.ts src/lib/money.ts src/lib/accounting.ts src/lib/store.ts src/lib/categories.ts src/lib/routes.ts src/lib/chatbot.ts src/lib/knowledge.ts src/lib/assistant.ts src/lib/ai.ts --outDir ${outDir} --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'pipe' },
);

const require = createRequire(import.meta.url);
const chat = require(path.join(outDir, 'chatbot.js'));
const know = require(path.join(outDir, 'knowledge.js'));
const asst = require(path.join(outDir, 'assistant.js'));
const acct = require(path.join(outDir, 'accounting.js'));

const TODAY = new Date().toISOString().slice(0, 10);
const YDAY = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

function profile(id, name, services) {
  return {
    id, name, category: 'Cyber Cafe / CSC Center',
    services: services || ['PAN Card', 'Aadhaar Services', 'Voter ID', 'Ayushman Card', 'Smart Card', 'Xerox', 'Printing', 'Passport Size Photo', 'Scanning', 'Document Work'],
    customServices: [], expenseCategories: ['Machine Repair', 'Electricity', 'Internet', 'Paper', 'Ink', 'Rent', 'Staff', 'Transport', 'Other'],
    customExpenseCategories: [], disabledModules: [], hiddenCards: [],
    address: '', mobile: '', openingCashPaise: 0, openingUpiPaise: 0,
    receiptPrefix: 'BK', receiptCounter: 0, language: 'hinglish', theme: 'light', createdAt: TODAY,
  };
}

function fixture() {
  const p1 = profile('prof1', 'Al Falah Communication');
  const p2 = profile('prof2', 'Second Shop', ['Grocery Sale', 'Home Delivery']);
  return {
    state: {
      owner: null, profiles: [p1, p2], activeProfileId: 'prof1',
      jobs: [
        { id: 'job1', profileId: 'prof1', service: 'PAN Card', customerName: 'Rahul', mobile: '9876500001', refNo: '', status: 'Completed', totalPaise: 50000, receivedPaise: 20000, receivedMethod: 'cash', agentId: 'agt1', agentChargePaise: 25000, agentPaidPaise: 15000, date: TODAY, notes: '', docIds: [], createdAt: TODAY, updatedAt: TODAY },
      ],
      dailyEntries: [], cashTxns: [
        { id: 'txn1', profileId: 'prof1', kind: 'in', method: 'cash', amountPaise: 20000, category: 'PAN Card — Rahul', note: '', date: TODAY, jobId: 'job1', createdAt: TODAY },
      ],
      mtFunds: [{ id: 'mtf1', profileId: 'prof1', amountPaise: 2000000, method: 'upi', date: TODAY, note: 'Fund from brother' }],
      mtTransfers: [], mtExpenses: [],
      customers: [{ id: 'cus1', profileId: 'prof1', name: 'Rahul', mobile: '9876500001', notes: '', docIds: [], createdAt: TODAY }],
      docs: [], agents: [{ id: 'agt1', profileId: 'prof1', name: 'Ramesh Bhai', mobile: '9876500010', type: 'Aadhaar Backend Agent', status: 'Active', notes: '' }],
      expenses: [], equipment: [], receipts: [], audit: [], recycle: [], executedActionKeys: [],
    },
    p1, p2,
  };
}

const results = {};
function run(category, name, fn) {
  results[category] = results[category] || { pass: 0, total: 0 };
  results[category].total++;
  let ok = false;
  let detail = '';
  try {
    ok = fn() === true;
  } catch (e) {
    detail = ` (threw: ${e.message})`;
  }
  if (ok) results[category].pass++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} [${category}] ${name}${detail}`);
}

const P = (text, ctx) => {
  const { state, p1 } = fixture();
  return chat.parseAssistantMessage(text, state, p1, ctx || {});
};
const isAction = (r) => r && r.kind === 'action';
const entry = (r, i = 0) => (r && r.action && r.action.entries ? r.action.entries[i] : undefined);

console.log('BizKhata AI accuracy suite — measured per scenario:');

// --- Service recognition ---
run('service recognition', 'Xerox', () => entry(P('Aaj Xerox ke 300 cash hue'))?.service === 'Xerox');
run('service recognition', 'Printing (UPI first)', () => entry(P('Aaj 500 rupaye UPI se printing hui'))?.service === 'Printing');
run('service recognition', 'Smart Card', () => entry(P('Smart Card ke 500 cash hue'))?.service === 'Smart Card');
run('service recognition', 'PAN Card', () => entry(P('PAN Card 400 cash hua'))?.service === 'PAN Card');
run('service recognition', 'Passport Size Photo', () => entry(P('Passport photo 150 cash hua'))?.service === 'Passport Size Photo');
run('service recognition', 'Scanning', () => entry(P('Scanning 80 cash hua'))?.service === 'Scanning');
run('service recognition', 'Aadhaar (transliteration)', () => entry(P('Aadhaar 250 cash hua'))?.service === 'Aadhaar Services');
run('service recognition', 'Xerox misspelling zerox', () => entry(P('Zerox 100 cash hua'))?.service === 'Xerox');

// --- Amount extraction ---
run('amount extraction', 'plain 300', () => entry(P('Xerox 300 cash'))?.amountPaise === 30000);
run('amount extraction', 'with commas 1,000', () => entry(P('Xerox 1,000 cash'))?.amountPaise === 100000);
run('amount extraction', 'with ₹ symbol', () => entry(P('Xerox ₹450 cash'))?.amountPaise === 45000);
run('amount extraction', 'decimal 250.50', () => entry(P('Xerox 250.50 cash'))?.amountPaise === 25050);
run('amount extraction', 'mobile number ignored', () => {
  const r = P('Rahul 9876500001 Xerox 300 cash');
  return isAction(r) && r.action.entries[0].amountPaise === 30000;
});
run('amount extraction', '"5 customers" is a count, not money', () => {
  const r = P('Smart Card ke 5 customers aaye, total 1000 rupaye mile');
  // Only ₹1000 is money (the "5" is a count); mode is genuinely unknown,
  // so the honest answer is a clarification draft for that one entry.
  return r.kind === 'draft' && r.draft.missing === 'method'
    && r.draft.partial.pendingEntries.length === 1
    && r.draft.partial.pendingEntries[0].amountPaise === 100000;
});
run('amount extraction', 'Hindi words do sau = 200', () => entry(P('Xerox do sau cash'))?.amountPaise === 20000);
run('amount extraction', 'Devanagari digits ३००', () => entry(P('Xerox ३०० cash'))?.amountPaise === 30000);

// --- Payment-mode extraction ---
run('payment mode', 'cash', () => entry(P('Xerox 300 cash'))?.method === 'cash');
run('payment mode', 'UPI', () => entry(P('Xerox 300 UPI'))?.method === 'upi');
run('payment mode', 'nagad = cash', () => entry(P('Xerox 300 nagad'))?.method === 'cash');
run('payment mode', 'udhaar = other/due', () => entry(P('Xerox 300 udhaar'))?.method === 'other');
run('payment mode', 'per-amount in one message', () => {
  const r = P('Xerox 300 cash, 200 UPI hua');
  return isAction(r) && r.action.entries[0].method === 'cash' && r.action.entries[1].method === 'upi';
});
run('payment mode', 'missing mode asks, never invents', () => P('Aaj 500 rupaye printing hui').kind === 'draft');

// --- Date interpretation ---
run('date interpretation', 'aaj = today', () => isAction(P('Aaj Xerox 300 cash')) && P('Aaj Xerox 300 cash').action.date === TODAY);
run('date interpretation', 'kal = yesterday', () => P('Kal Xerox 300 cash hua').action.date === YDAY);
run('date interpretation', 'explicit dd/mm/yyyy', () => P('Xerox 300 cash 25/11/2026').action.date === '2026-11-25');
run('date interpretation', 'no date defaults to today', () => P('Xerox 300 cash').action.date === TODAY);
run('date interpretation', 'yesterday summary uses yesterday', () => {
  const { state, p1 } = fixture();
  const a = know.computeKnowledge(state, p1, 'Kal kitni earning hui thi?', {});
  return a !== null && a.text.includes('yesterday');
});

// --- Multiple transactions ---
run('multiple transactions', 'three services one message', () => {
  const r = P('Aaj Xerox 300 cash, 200 UPI aur Smart Card 500 cash hua');
  return isAction(r) && r.action.entries.length === 3 && r.totalPaise === 100000;
});
run('multiple transactions', 'two amounts same service', () => {
  const r = P('Xerox 300 cash aur 200 UPI hua');
  return isAction(r) && r.action.entries.length === 2;
});
run('multiple transactions', 'amount before service word', () => {
  const r = P('Aaj 500 rupaye UPI se printing hui');
  return isAction(r) && r.action.entries[0].service === 'Printing' && r.action.entries[0].method === 'upi';
});
run('multiple transactions', 'saves all as separate records', () => {
  const { state, p1 } = fixture();
  const r = P('Aaj Xerox 300 cash, 200 UPI aur Smart Card 500 cash hua');
  const res = asst.applyAssistantAction(state, p1.id, r.action, 'acc-multi');
  return res.ok && state.dailyEntries.length === 3 && state.cashTxns.length === 4;
});

// --- Follow-up understanding ---
run('follow-ups', '"Aur 200 UPI" reuses last service', () => {
  const r = P('Aur 200 UPI bhi add kar do', { lastService: 'Xerox' });
  return isAction(r) && r.action.entries[0].service === 'Xerox' && r.action.entries[0].method === 'upi' && r.action.entries[0].amountPaise === 20000;
});
run('follow-ups', '"Haan" confirms pending (intent)', () => P('Haan').kind === 'confirm');
run('follow-ups', '"Last month se compare karo" keeps service context', () => {
  const { state, p1 } = fixture();
  const a = know.computeKnowledge(state, p1, 'Last month se compare karo', { lastService: 'Xerox' });
  return a !== null && a.text.includes('Xerox') && !!a.table;
});

// --- Hindi / Hinglish ---
run('hindi/hinglish', 'Devanagari question answered', () => {
  const { state, p1 } = fixture();
  const a = know.computeKnowledge(state, p1, 'आज कितना धंधा हुआ?', {});
  return a !== null;
});
run('hindi/hinglish', 'Hinglish expense parsed', () => {
  const r = P('Aaj bijli ka bill 800 rupaye cash bhara');
  return isAction(r) && r.action.kind === 'expense' && r.action.amountPaise === 80000;
});
run('hindi/hinglish', 'Hinglish MT parsed', () => {
  const r = P('Rahul ko 10000 transfer kiya, commission 50 mila');
  return isAction(r) && r.action.kind === 'mt_transfer' && r.action.amountPaise === 1000000 && r.action.commissionPaise === 5000;
});
run('hindi/hinglish', 'Hinglish agent payment parsed', () => {
  const r = P('Agent Ramesh ko 50 rupaye diye');
  return isAction(r) && r.action.kind === 'agent_payment' && r.action.amountPaise === 5000;
});
run('hindi/hinglish', 'Hinglish summary question', () => {
  const { state, p1 } = fixture();
  return know.computeKnowledge(state, p1, 'Aaj ka dhandha kitna hua?', {}) !== null;
});
run('hindi/hinglish', 'Hinglish help question', () => {
  const { state, p1 } = fixture();
  const a = know.computeKnowledge(state, p1, 'Cash Book mein entry kaise add karu?', {});
  return a !== null && a.links && a.links[0].path === '/cash-book';
});

// --- MT accounting rules ---
run('mt accounting', 'principal is not income', () => {
  const { state, p1 } = fixture();
  const r = P('Rahul ko 10000 transfer kiya, commission 50 mila');
  const res = asst.applyAssistantAction(state, p1.id, r.action, 'acc-mt1');
  return res.ok && acct.mtProfitPaise(state.mtTransfers, state.mtExpenses) === 5000;
});
run('mt accounting', 'MT without commission asks', () => P('Rahul ko 10000 transfer kiya').kind === 'draft');
run('mt accounting', 'MT without fund rejected, nothing written', () => {
  const { state, p1 } = fixture();
  state.mtFunds = [];
  const r = P('Rahul ko 10000 transfer kiya, commission 50 mila');
  const res = asst.applyAssistantAction(state, p1.id, r.action, 'acc-mt2');
  return !res.ok && state.mtTransfers.length === 0;
});
run('mt accounting', 'fund from brother recorded', () => {
  const { state, p1 } = fixture();
  const r = P('Bhai se 20000 fund mila UPI se');
  return isAction(r) && r.action.kind === 'mt_fund' && r.action.amountPaise === 2000000;
});

// --- Outstanding / agent payable ---
run('outstanding', 'due is not income (udhaar job received 0)', () => {
  const { state, p1 } = fixture();
  const r = P('Rahul ko Xerox 500 udhaar diya');
  const res = asst.applyAssistantAction(state, p1.id, r.action, 'acc-due1');
  const job = state.jobs.find((j) => j.service === 'Xerox');
  return res.ok && job && job.receivedPaise === 0 && acct.jobDuePaise(job) === 50000;
});
run('outstanding', 'biggest due answered with real figure', () => {
  const { state, p1 } = fixture();
  const a = know.computeKnowledge(state, p1, 'Sabse zyada due kis customer ka hai?', {});
  return a !== null && a.text.includes('Rahul') && a.text.includes('₹300.00');
});
run('outstanding', 'customer payment reduces due', () => {
  const { state, p1 } = fixture();
  const r = P('Rahul ne 100 diye cash');
  const res = asst.applyAssistantAction(state, p1.id, r.action, 'acc-due2');
  return res.ok && acct.jobDuePaise(state.jobs[0]) === 20000;
});
run('agent payable', 'agent payment reduces payable', () => {
  const { state, p1 } = fixture();
  const r = P('Agent Ramesh ko 50 rupaye diye');
  const res = asst.applyAssistantAction(state, p1.id, r.action, 'acc-agt1');
  return res.ok && acct.agentPayablePaise({ id: 'agt1' }, state.jobs) === 5000;
});
run('agent payable', 'overpaying agent rejected', () => {
  const { state, p1 } = fixture();
  const r = P('Agent Ramesh ko 500 rupaye diye');
  const res = asst.applyAssistantAction(state, p1.id, r.action, 'acc-agt2');
  return !res.ok && state.jobs[0].agentPaidPaise === 15000;
});
run('agent payable', 'unknown agent asks, never invents', () => P('Agent Mohan ko 500 rupaye diye').kind === 'draft');

// --- Cash/UPI balances ---
run('balances', 'cash balance from real txns', () => {
  const { state, p1 } = fixture();
  const f = chat.computeFacts(state, p1);
  return f.cashPaise === 20000 && f.upiPaise === 0;
});
run('balances', 'internal transfer moves, income stays 0', () => {
  const { state, p1 } = fixture();
  const r = P('1000 rupaye cash se UPI transfer kar do');
  const res = asst.applyAssistantAction(state, p1.id, r.action, 'acc-bal1');
  const b = acct.balancesPaise(0, 0, state.cashTxns.filter((x) => x.profileId === 'prof1'));
  return res.ok && b.cash === -80000 && b.upi === 100000 && acct.incomePaise(state.cashTxns.filter((x) => x.kind === 'transfer')) === 0;
});
run('balances', 'cash vs upi difference answered', () => {
  const { state, p1 } = fixture();
  const a = know.computeKnowledge(state, p1, 'Cash aur UPI mein difference kya hai?', {});
  return a !== null && a.text.includes('₹200.00');
});

// --- Profile isolation ---
run('profile isolation', 'second profile has no data', () => {
  const { state, p2 } = fixture();
  const a = know.computeKnowledge(state, p2, 'Aaj kitna dhandha hua?', {});
  return a !== null && a.text.includes('koi record nahi');
});
run('profile isolation', 'write to p1 never touches p2', () => {
  const { state, p1 } = fixture();
  const r = P('Aaj Xerox ke 300 cash hue');
  asst.applyAssistantAction(state, p1.id, r.action, 'acc-iso');
  return state.dailyEntries.filter((x) => x.profileId === 'prof2').length === 0;
});

// --- Confirmation handling ---
run('confirmation', '"Haan" with no pending is not a save', () => P('Haan').kind === 'confirm');
run('confirmation', 'cancel intent recognised', () => P('Nahi, cancel kar do').kind === 'cancel');

// --- Ambiguity / honest errors ---
run('ambiguity', 'no service asks service', () => P('Aaj 300 rupaye hue').kind === 'draft');
run('ambiguity', 'no amount asks amount', () => P('Aaj Xerox hue').kind === 'draft');
run('ambiguity', 'correct unknown entry says so', () => P('Xerox 9999 galat tha, 100 hona chahiye').kind === 'error');
run('ambiguity', 'delete unknown entry says so', () => P('Xerox 9999 wali entry delete kar do').kind === 'error');

// --- Totals ---
let totalPass = 0;
let total = 0;
console.log('\nAccuracy per category:');
for (const [cat, r] of Object.entries(results)) {
  const pct = ((r.pass / r.total) * 100).toFixed(1);
  console.log(`  ${cat}: ${r.pass}/${r.total} (${pct}%)`);
  totalPass += r.pass;
  total += r.total;
}
console.log(`\nOverall AI accuracy: ${totalPass}/${total} (${((totalPass / total) * 100).toFixed(1)}%)`);
if (totalPass !== total) process.exit(1);
