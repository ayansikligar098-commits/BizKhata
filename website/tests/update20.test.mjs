/**
 * BizKhata AI — UPDATE 20/21/22 acceptance suite (200+ real-world cases).
 *
 * One file, 14 categories. Each case: a real question/instruction, the
 * expected behaviour, and an assertion over the REAL reply from
 * respondToMessage() (lib-level, same harness style as
 * tests/conversation.test.mjs). A case passes only when the assistant
 * understood the intention — returning *some* reply is not enough.
 *
 * Cloud-only knowledge cases assert: correct local answer OR an honest
 * limitation (cloudNeeded + a key hint, never an invented fact). Those
 * are recorded in the results as cloud:'needs-owner-phone-test' and
 * never as evidence-backed passes. The runner writes
 * tests/update20-results.json with every question, expected, actual,
 * intent/kind, pass/fail, detail — and exits non-zero unless the
 * overall pass rate is >= 95% AND every financial-safety case passes.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/bizkhata-u20-test';
execSync(
  `npx tsc src/lib/types.ts src/lib/money.ts src/lib/accounting.ts src/lib/store.ts src/lib/categories.ts src/lib/routes.ts src/lib/languages.ts src/lib/chatbot.ts src/lib/knowledge.ts src/lib/assistant.ts src/lib/ai.ts src/lib/general.ts src/lib/intent.ts src/lib/conversation-ai.ts src/lib/conversation.ts src/lib/dev-requests.ts src/lib/voice.ts --outDir ${outDir} --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'pipe' },
);
const require = createRequire(import.meta.url);
const conv = require(path.join(outDir, 'conversation.js'));
const chat = require(path.join(outDir, 'chatbot.js'));
const lang = require(path.join(outDir, 'languages.js'));
const gen = require(path.join(outDir, 'general.js'));
const dev = require(path.join(outDir, 'dev-requests.js'));
const voiceLib = require(path.join(outDir, 'voice.js'));

// ---------------------------------------------------------------- helpers
let seq = 0;
function profile(id, name, services) {
  return {
    id, name,
    category: 'Cyber Cafe / CSC Center',
    services: services || ['PAN Card', 'Aadhaar Services', 'Voter ID', 'Ayushman Card', 'Smart Card', 'Xerox', 'Printing', 'Passport Size Photo', 'Scanning', 'Document Work'],
    customServices: [],
    expenseCategories: ['Machine Repair', 'Electricity', 'Internet', 'Paper', 'Ink', 'Rent', 'Staff', 'Transport', 'Other'],
    customExpenseCategories: [], disabledModules: [], hiddenCards: [],
    address: '', mobile: '', openingCashPaise: 0, openingUpiPaise: 0,
    receiptPrefix: 'BK', receiptCounter: 0, language: 'hinglish', theme: 'light',
    createdAt: '2026-11-27', aiLanguage: 'auto',
  };
}
function emptyState() {
  const id = `u20-${++seq}`;
  const p1 = profile(id, 'Al Falah Communication');
  return {
    state: {
      owner: null, profiles: [p1], activeProfileId: id, jobs: [], dailyEntries: [],
      cashTxns: [], mtFunds: [], mtTransfers: [], mtExpenses: [], customers: [],
      docs: [], agents: [], expenses: [], equipment: [], receipts: [], audit: [],
      recycle: [], executedActionKeys: [],
    }, p1,
  };
}
function localISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const TODAY = localISO(new Date());
const T = (t) => String(t || '');
const has = (...ns) => (r) => ns.some((n) => T(r.text).includes(n));
const hasNone = (...ns) => (r) => !ns.some((n) => T(r.text).includes(n));
const re = (rx) => (r) => rx.test(T(r.text));
const clen = (r) => ((r.checklist && r.checklist.items) || []).length;
const linksHave = (...ps) => (r) => ps.some((pp) => (r.links || []).some((l) => String(l.path).includes(pp)));
const isIntent = (...xs) => (r) => xs.includes(r.intent);
const isKind = (...xs) => (r) => xs.includes(r.kind);
const and = (...fs) => (r, a) => fs.every((f) => f(r, a));
// Normal chat must never force a money question or a fake entry.
const noMoneyQ = (r) => !/kitne rupaye|rupaye hue|paise hue|how much money/i.test(T(r.text));
const noFakeEntry = (r) => !/koi pending entry|Confirm karne ke liye koi pending entry/i.test(T(r.text));
// Honest deferral to the cloud engine (no key on this VM): cloudNeeded
// plus a mention of the key — never an invented fact.
const honestCloud = (r) => r.cloudNeeded === true && /key/i.test(T(r.text));
const correctOrHonest = (re) => (r) => re.test(T(r.text)) || honestCloud(r);
// Financial state must not move for non-actions.
const snap = (state) => JSON.stringify([
  state.dailyEntries, state.cashTxns, state.expenses, state.jobs,
  state.customers, state.agents, state.mtTransfers,
]);
const unchanged = (_r, a) => snap(a.state) === a.before;
const totalPaise = (state) => state.dailyEntries.reduce((s, e) => s + (e.totalPaise || 0), 0);
const noIncomeAction = (r) => !(r.kind === 'action' && r.action && r.action.kind === 'daily_income');
const seedXeroxToday = (state, p1, paise = 30000) => {
  state.dailyEntries.push({
    id: 'seed-1', profileId: p1.id, date: TODAY, service: 'Xerox',
    totalPaise: paise, method: 'cash', description: 'Xerox', quantity: 1, ratePaise: paise,
  });
};

// ---------------------------------------------------------------- registry
const CASES = [];
function C(cat, q, expected, check, setup) {
  CASES.push({ cat, q, expected, check, setup });
}

// ============================================================ (1) normal conversation / greetings
C('1-normal', 'Namaste', 'Warm greeting reply, no money question', and(isIntent('casual'), noMoneyQ));
C('1-normal', 'Hi', 'Greeting reply', and(isIntent('casual'), noMoneyQ));
C('1-normal', 'Kaise ho bhai?', 'How-are-you reply, not a transaction prompt', and(isIntent('casual'), noMoneyQ));
C('1-normal', 'Tum kaun ho?', 'Identity: BizKhata AI Assistant', and(isIntent('general'), has('BizKhata AI Assistant')));
C('1-normal', 'Good morning', 'Morning greeting reply', and(isIntent('casual'), noMoneyQ));
C('1-normal', 'Bye, kal milte hain', 'Farewell reply, not a restart', and(isIntent('casual'), noMoneyQ));
C('1-normal', 'Shukriya', 'Thanks reply', and(isIntent('casual'), noMoneyQ));
C('1-normal', 'Dhanyavaad', 'Thanks reply (Devanagari)', and(isIntent('casual'), noMoneyQ));
C('1-normal', 'Aaj mausam kaisa hai?', 'Weather: honest limitation, no invented forecast', correctOrHonest(/mausam|weather/i));
C('1-normal', 'Aaj ka din kaisa raha?', 'Normal chat reply, no business forcing', and(noMoneyQ, isKind('text')));
C('1-normal', 'Main thak gaya hoon', 'Empathetic normal reply, no money question', and(noMoneyQ, isKind('text')));
C('1-normal', 'Mujhe ek achha joke sunao', 'A joke', and(isIntent('general'), has('—')));
C('1-normal', 'Ek chutkula sunao', 'A joke (Hinglish)', and(isIntent('general'), re(/photocopy|shopkeeper/i)));
C('1-normal', 'Kya tum meri help kar sakte ho?', 'Help offer reply', and(noMoneyQ, isKind('text')));
C('1-normal', 'Tum kya kya kar sakte ho?', 'Capabilities, real features only', and(has('Daily Business'), noMoneyQ));

// ============================================================ (2) general knowledge / everyday
C('2-general', 'Bharat ki rajdhani kya hai?', 'Delhi, or honest cloud deferral (no invented capital)', correctOrHonest(/Delhi/i));
C('2-general', 'Photosynthesis kya hai?', 'Photosynthesis explained', and(isIntent('general'), has('Photosynthesis')));
C('2-general', 'Internet kya hai?', 'Internet explained', and(isIntent('general'), has('Internet')));
C('2-general', 'GST kya hai?', 'GST explained', and(isIntent('general'), has('GST')));
C('2-general', 'Aaj ka petrol price kya hai?', 'No invented live price — honest limitation', correctOrHonest(/live|current|official/i));
C('2-general', 'Dhanyavaad ka matlab English mein kya hai?', 'Translation: Thank you', and(isIntent('general'), has('Thank you')));
C('2-general', 'Namaste ka matlab kya hai?', 'Translation of Namaste', and(isIntent('general'), has('Hello')));
C('2-general', '100 km kitne miles hote hain?', 'Unit conversion (62.14 miles)', and(isIntent('general'), has('62.14')));
C('2-general', '5 kilo kitne pound hote hain?', 'Unit conversion (11.02 pound)', and(isIntent('general'), has('11.02')));
C('2-general', '10 ka 20 percent kitna hota hai?', 'Percent: 2', and(isIntent('general'), has('2')));
C('2-general', '10 * 25 kitna hota hai?', 'Arithmetic: 250', and(isIntent('general'), has('250')));
C('2-general', 'Mujhe WhatsApp par ek message likh do', 'Writing help (WhatsApp message)', and(isIntent('general'), has('WhatsApp')));
C('2-general', 'Instagram ke liye ek caption likh do', 'Caption help', and(isIntent('general'), has('caption')));
C('2-general', 'Mujhe ek email likh do', 'Email writing help', and(isIntent('general'), has('email')));
C('2-general', 'Sone se pehle kya karna chahiye?', 'Everyday advice, no business forcing', and(noMoneyQ, isKind('text')));

// ============================================================ (3) technology / troubleshooting
C('3-tech', 'Internet nahi chal raha', 'Internet troubleshooting steps (Hinglish)', and(isIntent('general'), has('Internet')));
C('3-tech', 'Mera phone hang ho raha hai', 'Phone troubleshooting', and(isIntent('general'), has('Phone')));
C('3-tech', 'Printer kaam nahi kar raha', 'Printer troubleshooting', and(isIntent('general'), has('Printer')));
C('3-tech', 'WiFi connect nahi ho raha', 'WiFi troubleshooting', and(isIntent('general'), re(/wi-?fi/i)));
C('3-tech', 'Phone ki battery jaldi khatam ho jati hai', 'Battery advice', and(isIntent('general'), has('battery')));
C('3-tech', 'Phone ka storage full ho gaya hai', 'Storage advice', and(isIntent('general'), re(/storage/i)));
C('3-tech', 'UPI payment fail ho gaya, kya karu?', 'UPI failure advice', and(isIntent('general'), has('UPI')));
C('3-tech', 'Computer slow chal raha hai', 'Computer troubleshooting', and(isIntent('general'), has('Computer')));
C('3-tech', 'Mera mobile garam ho raha hai', 'Phone heating advice', and(isIntent('general'), has('Phone')));
C('3-tech', 'Whatsapp download nahi ho raha', 'WhatsApp troubleshooting', and(isIntent('general'), has('WhatsApp')));
C('3-tech', 'Google Chrome mein website nahi khul rahi', 'Browser troubleshooting', and(isIntent('general'), has('browser')));
C('3-tech', 'Printer mein paper jam ho gaya', 'Printer jam fix', and(isIntent('general'), has('Printer')));
C('3-tech', 'Mujhe ek website banana hai, kaise banau?', 'Website guidance', and(isIntent('general'), has('Website')));
C('3-tech', 'Password bhool gaya, kya karu?', 'Password reset guidance', and(isIntent('general'), has('password')));
C('3-tech', 'Mera phone kho gaya, kya karu?', 'Lost phone guidance, no panic replies', and(isIntent('general'), has('Phone')));

// ============================================================ (4) business advice / planning
C('4-advice', 'Mujhe ek business idea chahiye', 'Business ideas, relevant to the shop', and(isIntent('general'), has('business idea')));
C('4-advice', 'Dukaan mein customer kaise badhaye?', 'Customer growth advice', and(isIntent('general'), re(/customer/i)));
C('4-advice', 'Mera profit kaise badhaye?', 'Profit advice, no fake figures', and(noMoneyQ, (r) => !/₹[0-9]/.test(T(r.text))));
C('4-advice', 'Xerox ka rate kya rakhu?', 'Pricing advice (no invented market rate claimed as fact)', correctOrHonest(/rate/i));
C('4-advice', 'Dukaan ke liye marketing kaise karu?', 'Marketing advice', and(isIntent('general'), re(/marketing/i)));
C('4-advice', 'Customer se due kaise vasool karu?', 'Due recovery advice', and(isIntent('general'), has('due')));
C('4-advice', 'Shop ko online kaise le jaau?', 'Online presence advice', and(isIntent('general'), has('online')));
C('4-advice', 'Naya service shuru karu ya nahi?', 'Service expansion advice', and(noMoneyQ, isKind('text')));
C('4-advice', 'Dukaan ka naam kya rakhu?', 'Naming ideas', correctOrHonest(/naam|name/i));
C('4-advice', 'Customer ko discount dena chahiye?', 'Discount advice', correctOrHonest(/discount/i));
C('4-advice', 'Mera monthly budget kaise banau?', 'Budget advice', and(isIntent('general'), re(/budget/i)));
C('4-advice', 'Agent ko kitna commission du?', 'Agent commission advice (no invented rule)', correctOrHonest(/commission/i));
C('4-advice', 'Dukaan ka kharcha kaise kam karu?', 'Cost saving advice', and(noMoneyQ, isKind('text')));
C('4-advice', 'Subah dukaan kitne baje kholu?', 'Opening-time advice', correctOrHonest(/subah|morning|baje/i));
C('4-advice', 'Festival season mein kya sale karu?', 'Seasonal advice', correctOrHonest(/festival|season/i));

// ============================================================ (5) navigation / feature help
C('5-nav', 'Mene jo dukan se dhandha kara use ye website me kha likhu batoge?', 'Daily Business guidance + link', and(isIntent('app_help'), has('Daily Business'), (r) => linksHave('daily-business')(r)));
C('5-nav', 'Daily Business mein entry kaise add karu?', 'Daily Business help + link', and(isIntent('app_help'), has('Daily Business')));
C('5-nav', 'Cash Book kahan hai?', 'Cash Book help + link', and(isIntent('app_help'), has('Cash Book'), (r) => linksHave('cash-book')(r)));
C('5-nav', 'Cash Book mein aaj ki entry dikhao', 'Opens Cash Book (real navigation), not a financial save', and(isIntent('navigation'), unchanged));
C('5-nav', 'UPI Book kahan hai?', 'UPI Book help + link', and(isIntent('app_help'), has('UPI Book'), (r) => linksHave('upi-book')(r)));
C('5-nav', 'Customer Khata kahan hai?', 'Customer Khata help + link', and(isIntent('app_help'), has('Customer Khata')));
C('5-nav', 'Agent ka payment kahan record karu?', 'Agent Management help + link', and(isIntent('app_help'), has('Agent')));
C('5-nav', 'Money Transfer ka fund kahan likhu?', 'Money Transfer help + link', and(isIntent('app_help'), has('Money Transfer')));
C('5-nav', 'Report kahan se download karu?', 'Reports help + link', and(isIntent('app_help'), has('Reports')));
C('5-nav', 'Receipt kaise banau?', 'Receipt help + link', and(isIntent('app_help'), has('Receipt')));
C('5-nav', 'Machine ka maintenance kahan likhu?', 'Maintenance help', and(isIntent('app_help'), has('Machine')));
C('5-nav', 'Settings kahan hai?', 'Settings help + link', and(isIntent('app_help'), has('Settings'), (r) => linksHave('settings')(r)));
C('5-nav', 'PAN Card ka kaam kahan likhu?', 'PAN module help + link', and(isIntent('app_help'), has('PAN'), (r) => linksHave('services/pan-card')(r)));
C('5-nav', 'Xerox ka paisa kahan likhu?', 'Xerox → Daily Business guidance, no fake save', and(isIntent('app_help'), has('Daily Business'), unchanged));
C('5-nav', 'Difference Finder kya hai?', 'Difference Finder explainer', and(isIntent('app_help'), has('Difference')));

// ============================================================ (6) PAN / Aadhaar / CSC services
C('6-csc', 'Kal Pan Card banane hai', 'Future plan + checklist offer, NOT a transaction', and(isIntent('plan'), has('checklist'), noFakeEntry, unchanged));
C('6-csc', 'Kal Pan Card banane hai. Kal checklist bana do.', 'Real PAN checklist saved', and(isIntent('do_checklist'), isKind('checklist'), (r) => clen(r) >= 4, unchanged));
C('6-csc', 'PAN card ke liye kaunse documents chahiye?', 'PAN document list', and(isIntent('general'), has('Aadhaar'), hasNone('₹')));
C('6-csc', 'PAN Card kya hota hai?', 'PAN explainer', and(isIntent('general'), has('PAN')));
C('6-csc', 'Aadhaar Card mein mobile number update karna hai', 'Plan reply (not a portal deflection)', and(isIntent('plan'), noFakeEntry));
C('6-csc', 'Aadhaar card ke liye kaunse documents chahiye?', 'Aadhaar document list', and(isIntent('general'), has('Aadhaar')));
C('6-csc', 'Aadhaar Card kya hota hai?', 'Aadhaar explainer', and(isIntent('general'), has('Aadhaar')));
C('6-csc', 'Voter ID ke liye kaunse documents chahiye?', 'Voter document list', and(isIntent('general'), has('Voter')));
C('6-csc', 'Ayushman Card ke liye kaunse documents chahiye?', 'Ayushman document list', and(isIntent('general'), has('Ayushman')));
C('6-csc', 'CSC kya hota hai?', 'CSC explainer', and(isIntent('general'), has('CSC')));
C('6-csc', 'PAN card banane mein kitna time lagta hai?', 'PAN process info, no invented fee', and(isIntent('general'), hasNone('₹')));
C('6-csc', 'Aadhaar card update mein kitne din lagte hain?', 'Aadhaar update info', and(isIntent('general'), has('Aadhaar')));
C('6-csc', 'Kal Aadhaar ka kaam karna hai, checklist bana do', 'Aadhaar checklist saved', and(isIntent('do_checklist'), isKind('checklist'), (r) => clen(r) >= 4));
C('6-csc', 'Kal Voter ID banane hai, checklist bana do', 'Voter checklist saved', and(isIntent('do_checklist'), isKind('checklist'), (r) => clen(r) >= 3));
C('6-csc', 'Kal Ayushman Card banane hai', 'Future plan + offer, not a transaction', and(isIntent('plan'), has('checklist'), unchanged));

// ============================================================ (7) Daily Business / Cash / UPI
C('7-daily', 'Aaj Xerox ke 300 cash hue', 'Income preview, NOT saved yet', and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'daily_income' && r.totalPaise === 30000, unchanged));
C('7-daily', 'Aaj Xerox ke 300 cash hue, aur Printing ke 200 UPI', 'Two entries, total ₹500 preview', and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'daily_income' && r.totalPaise === 50000 && (r.action.entries || []).length === 2, unchanged));
C('7-daily', 'Aaj ka dhandha kitna hua?', 'Real total from ledger (empty = ₹0.00)', and(isIntent('business_query'), has('₹0.00')));
C('7-daily', 'Aaj kitna profit hua?', 'Real profit figure (empty = ₹0.00)', and(isIntent('business_query'), has('₹0.00')));
C('7-daily', 'Aaj cash kitna aaya?', 'Cash total from ledger (empty = ₹0.00)', and(isIntent('business_query'), has('₹0.00')));
C('7-daily', 'Aaj UPI se kitne paise aaye?', 'UPI total from ledger (empty = ₹0.00)', and(isIntent('business_query'), has('₹0.00')));
C('7-daily', 'Aaj Xerox ke 300 cash hue', 'Seeded ledger total reflected in summary', and((r, a) => { const r2 = a.send('Aaj ka dhandha kitna hua?'); return /₹300\.00/.test(T(r2.text)); }), (s, p) => seedXeroxToday(s, p));
C('7-daily', 'Kal ka hisab batao', 'Yesterday/tomorrow ledger figure, no invented amount', and(isIntent('business_query'), has('₹0.00')));
C('7-daily', 'Is month kitna kamaya?', 'Month figure from ledger (empty = ₹0.00)', and(isIntent('business_query'), has('₹0.00')));
C('7-daily', 'Aaj 200 ka kagaz kharida', 'Expense preview ₹200, not income', and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'expense' && r.totalPaise === 20000, unchanged));
C('7-daily', 'Bijli ka bill 1200 cash diya', 'Expense preview ₹1200', and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'expense' && r.totalPaise === 120000, unchanged));
C('7-daily', 'Aaj Xerox 300', 'Asks Cash/UPI — never invents the payment mode', and(isKind('text'), (r) => !!r.draftQuestion && /Cash|UPI/.test(r.draftQuestion), unchanged));
C('7-daily', '300 cash hue', 'Asks which service — never invents it', and(isKind('text'), (r) => !!r.draftQuestion, unchanged));
C('7-daily', 'Aaj Money Transfer mein 10000 bheje, commission 50 mila', 'Asks receiver name; does NOT book ₹10000 as income', and(isKind('text'), (r) => !!r.draftQuestion, noIncomeAction, unchanged));
C('7-daily', '1000 cash se UPI kar do', 'Internal transfer — NOT income, NOT expense', and((r) => r.kind !== 'action' || (r.action && r.action.kind !== 'daily_income' && r.action.kind !== 'expense'), unchanged));

// ============================================================ (8) expenses / customers / agents
C('8-exp-cust', 'Aaj 500 ka ink kharida', 'Expense preview ₹500', and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'expense' && r.totalPaise === 50000, unchanged));
C('8-exp-cust', 'Machine repair ke 800 diye', 'Repair expense preview ₹800', and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'expense' && r.totalPaise === 80000, unchanged));
C('8-exp-cust', 'Aaj ka kharcha kitna hua?', 'Expense total from ledger (empty = ₹0.00)', and(isIntent('business_query'), has('₹0.00')));
C('8-exp-cust', 'Rahul ka due kitna hai?', 'Customer due from ledger (empty = ₹0.00 or honest no-dues)', and(isIntent('business_query'), re(/₹0\.00|koi customer due nahi/i)));
C('8-exp-cust', 'Kis customer ka due sabse zyada hai?', 'Top dues from ledger, no invented names', and(isIntent('business_query'), (r) => !/Rahul|Sharma|Verma/.test(T(r.text)) || /₹0\.00/.test(T(r.text))));
C('8-exp-cust', 'Agent ko 500 de diye', 'Asks which agent — never guesses the agent', and(isKind('text'), (r) => !!r.draftQuestion, unchanged));
C('8-exp-cust', 'Agent ko kitna dena baaki hai?', 'Agent payable from ledger (empty = ₹0.00 or honest none)', and(isIntent('business_query'), re(/₹0\.00|dena baaki nahi/i)));
C('8-exp-cust', 'Rahul se 500 lene hain', 'Receivable is NOT income — no income action', and(noIncomeAction, unchanged));
C('8-exp-cust', 'Aaj ka net profit kitna hai?', 'Net profit from ledger (empty = ₹0.00)', and(isIntent('business_query'), has('₹0.00')));
C('8-exp-cust', 'Aaj ka summary batao', 'Daily summary from real ledger', and((r) => ['do_summary', 'business_query'].includes(r.intent), has('₹0.00')));
C('8-exp-cust', 'Kal ka summary bana do', 'Summary for the other day, no fake entries', and(isIntent('do_summary'), has('₹0.00')));
C('8-exp-cust', 'Mujhe ek customer add karna hai', 'Customer add guidance, no fake save', and(isKind('text'), unchanged));
C('8-exp-cust', 'Aaj ke expenses dikhao', 'Opens Expenses (real navigation), no invented entries', and(isIntent('navigation'), unchanged));
C('8-exp-cust', 'Mujhe aaj ki report chahiye', 'Reports help (how to get the report), real page, no fake figures', and(isIntent('app_help'), has('Reports'), unchanged));
C('8-exp-cust', 'Aaj Xerox ke 300 cash hue, aur 100 ka kagaz kharida', 'Mixed message: the expense is previewed with the RIGHT amount (₹100 kagaz, never ₹300); the income part must be sent separately (known limitation, see test report)', and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'expense' && r.action.amountPaise === 10000, unchanged));

// ============================================================ (9) follow-ups / context (2-turn)
C('9-followup', 'Kal Pan Card banane hai', 'Plan → "Ha" builds the real checklist', and((r, a) => {
  const r2 = a.send('Ha');
  return r2.kind === 'checklist' && clen(r2) >= 4 && !/pending entry/i.test(T(r2.text));
}));
C('9-followup', 'Kal Pan Card banane hai', 'Plan → "Nahi" declines gracefully, no pending-entry line', and((r, a) => {
  const r2 = a.send('Nahi');
  return r2.intent === 'decline_offer' && !/pending entry/i.test(T(r2.text));
}));
C('9-followup', 'Kal Pan Card banane hai', 'Plan → "5" answers the count question with a 5-application checklist', and((r, a) => {
  const r2 = a.send('5');
  return r2.kind === 'checklist' && /5 applications/.test(T(r2.text)) && clen(r2) >= 4;
}));
C('9-followup', 'Kal Pan Card banane hai', 'Plan → "5" → "Nahi, 3 the, 5 nahi" corrects the count to 3', and((r, a) => {
  const r2 = a.send('5');
  const r3 = a.send('Nahi, 3 the, 5 nahi');
  return r3.kind === 'checklist' && /3 applications/.test(T(r3.text)) && !/5 applications/.test(T(r3.text));
}));
C('9-followup', 'Kal Pan Card banane hai', 'Plan → "5" → "Documents bhi batao" lists PAN documents in the same topic', and((r, a) => {
  const r2 = a.send('5');
  const r3 = a.send('Documents bhi batao');
  return /Aadhaar/.test(T(r3.text)) && r3.intent === 'topic_followup';
}));
C('9-followup', 'Kal Pan Card banane hai', 'Plan → "5" → "Aur English mein likho" converts the checklist, content kept', and((r, a) => {
  const r2 = a.send('5');
  const r3 = a.send('Aur English mein likho');
  return r3.kind === 'checklist' && /PAN Card work checklist/.test(T(r3.text)) && /5 applications/.test(T(r3.text));
}));
C('9-followup', 'Kal Pan Card banane hai', 'Checklist → "Isme documents bhi add karo" appends document items', and((r, a) => {
  const r2 = a.send('Checklist bana do');
  const before = clen(r2);
  const r3 = a.send('Isme documents bhi add karo');
  return r3.kind === 'checklist' && clen(r3) > before && /Aadhaar/.test(T(r3.text));
}));
C('9-followup', 'Aaj Xerox ke 300 cash hue', 'Preview → "Aur 200 UPI" uses the SAME service (Xerox)', and((r, a) => {
  const r2 = a.send('Aur 200 UPI');
  return r2.kind === 'action' && r2.action.kind === 'daily_income' && /Xerox/.test((r2.previewLines || []).join(' ')) && r2.totalPaise === 20000;
}));
C('9-followup', 'Aaj Xerox ke 300 cash hue', 'Preview → "Ha": lib level must NOT fake-save (real confirm is the UI pending-preview flow, verified in the drive)', and((r, a) => {
  const r2 = a.send('Ha');
  return r2.kind !== 'action' && totalPaise(a.state) === 0 && !/save ho gaya|saved/i.test(T(r2.text));
}));
C('9-followup', 'Aaj Xerox ke 300 cash hue', 'Voice transcript "Aur 200 UPI" continues the same context', and((r, a) => {
  const d = voiceLib.handleVoiceTranscript({ transcript: 'Aur 200 UPI' });
  if (d.action !== 'send') return { ok: false, detail: 'voice decision=' + d.action };
  const r2 = a.send(d.text);
  return r2.kind === 'action' && r2.action.kind === 'daily_income' && r2.totalPaise === 20000;
}));
C('9-followup', 'Kal Pan Card banane hai', 'Topic switch then return: "PAN wali checklist phir dikhao" restores it', and((r, a) => {
  const r2 = a.send('Checklist bana do');
  const r3 = a.send('Aaj ka dhandha kitna hua?');
  const r4 = a.send('PAN wali checklist phir dikhao');
  return r4.kind === 'checklist' && clen(r4) >= 4;
}));
C('9-followup', 'Aaj Xerox ke 300 cash hue', 'Preview → "Nahi": nothing is saved, no fake save claim (UI cancel flow verified in the drive)', and((r, a) => {
  const r2 = a.send('Nahi');
  return r2.kind === 'text' && totalPaise(a.state) === 0 && !/save ho gaya|saved/i.test(T(r2.text));
}));
C('9-followup', 'Kal Pan Card banane hai', '"Ha" with NO pending offer must not claim a pending entry', and((r, a) => {
  // New conversation: no offer pending, bare "Ha" is a clarification, not a confirm.
  const { state: s2, p1: q2 } = emptyState();
  const r2 = conv.respondToMessage({ message: 'Ha', state: s2, profile: q2, ctx: {} });
  return !/pending entry/i.test(T(r2.text)) && r2.kind === 'text';
}));
C('9-followup', 'Aaj Xerox ke 300 cash hue', 'Preview → "Nahi, 250 the" corrects the amount before saving', and((r, a) => {
  const r2 = a.send('Nahi, 250 the');
  return r2.kind === 'action' && r2.action.kind === 'daily_income' && r2.totalPaise === 25000;
}));
C('9-followup', 'Kal Pan Card banane hai', 'Greeting first, then plan — no repeated introduction', and((r, a) => {
  const r2 = a.send('Namaste');
  const r3 = a.send('Kal Pan Card banane hai');
  return r3.intent === 'plan' && !/Namaste|main BizKhata/i.test(T(r3.text));
}));

// ============================================================ (10) multilingual / mixed-language
C('10-multi', 'Aaj ka dhandha kitna hua?', 'Hinglish summary, real figure', and((r) => ['do_summary', 'business_query'].includes(r.intent), has('₹0.00')));
C('10-multi', 'Aaje 500 rupiya Xerox na malya.', 'Roman Gujarati income → asks Cash/UPI, never invents mode', and(isKind('text'), (r) => !!r.draftQuestion, unchanged));
C('10-multi', 'Kem cho?', 'Gujarati greeting reply', and(isIntent('casual'), noMoneyQ));
C('10-multi', 'Su chale chhe?', 'Gujarati how-are-you reply', and(isIntent('casual'), noMoneyQ));
C('10-multi', 'Aaj 300 cash aur 200 UPI hue.', 'No service named: asks which service, never invents it', and(isKind('text'), (r) => !!r.draftQuestion, unchanged));
C('10-multi', 'Aaj ka total hisab batao', 'Roman Hindi summary, real figure', and((r) => ['do_summary', 'business_query'].includes(r.intent), has('₹0.00')));
C('10-multi', 'Kal PAN Card banane hai, cheklist bana do', 'Misspelled "cheklist" still builds the checklist', and(isIntent('do_checklist'), isKind('checklist'), (r) => clen(r) >= 4));
C('10-multi', 'Kal PAN Card banane hai, checlist bana do', 'Misspelled "checlist" still builds the checklist', and(isIntent('do_checklist'), isKind('checklist'), (r) => clen(r) >= 4));
C('10-multi', 'Aaj Xerox ke 300 cash hue', 'Devanagari-adjacent Hinglish income preview', and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'daily_income' && r.totalPaise === 30000, unchanged));
C('10-multi', 'आज Xerox के 300 cash हुए', 'Devanagari income → preview ₹300', and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'daily_income' && r.totalPaise === 30000, unchanged));
C('10-multi', 'આજે કેટલો નફો થયો?', 'Gujarati-script profit question: real figure or honest cloud deferral', correctOrHonest(/₹0\.00/));
C('10-multi', 'Aaj ke 300 Xerox galat the, 250 hone chahiye', 'Roman Hindi correction → correct_entry action', and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'correct_entry', unchanged), (s, p) => seedXeroxToday(s, p));
C('10-multi', 'Kal Pan Card banane hai checklist bana do', 'No-punctuation checklist request → real checklist', and(isIntent('do_checklist'), isKind('checklist'), (r) => clen(r) >= 4));
C('10-multi', 'checklist bana do na', '"bana do na" phrasing → real checklist', and(isIntent('do_checklist'), isKind('checklist'), (r) => clen(r) >= 4));
C('10-multi', 'list bana do', 'Bare "list bana do" after no offer → checklist (or honest ask)', and((r) => r.kind === 'checklist' || /kis|kya|checklist/i.test(T(r.text))));

// ============================================================ (11) app-change / development requests
C('11-appchange', 'Aadhaar Mobile Number Update ka module bana do', 'Spec shown, UIDAI distinction, NOT claimed built, no portal deflection', and(isIntent('app_change'), has('Aadhaar Mobile Number Update'), re(/deploy nahi kar sakta|bana NAHI|NOT built yet|not built/i), hasNone('portal', 'module taiyaar', 'module ban gaya')));
C('11-appchange', 'Aadhaar Mobile Number Update ka module bana do', 'Confirm → QUEUED development request, stored and visible', and((r, a) => {
  const r2 = a.send('Haan, banao');
  const list = dev.listDevRequests(a.p1.id);
  return r2.intent === 'accept_offer' && /Queued|queue/i.test(T(r2.text)) && list.length === 1 && list[0].status === 'queued' && /Aadhaar Mobile Number Update/.test(list[0].name) && !/ban gaya|ready|taiyaar/i.test(T(r2.text));
}));
C('11-appchange', 'Add a new service called Courier', 'New-service spec shown', and(isIntent('app_change'), has('Courier'), re(/spec|proposal|module/i)));
C('11-appchange', 'Create a new category called Grocery', 'New-category spec shown', and(isIntent('app_change'), has('Grocery')));
C('11-appchange', 'Add a "GST Number" field to customers', 'New-field spec shown', and(isIntent('app_change'), re(/GST Number|field/i)));
C('11-appchange', 'Modify the Cash Book to show weekly totals', 'Modify-module spec shown', and(isIntent('app_change'), has('Cash Book')));
C('11-appchange', 'Ek naya report banao', 'New-report spec (NOT a data summary)', and(isIntent('app_change'), re(/report/i)));
C('11-appchange', 'Mujhe ek naya dashboard chahiye', 'New-dashboard spec shown', and(isIntent('app_change'), re(/dashboard/i)));
C('11-appchange', 'Add a new feature for SMS reminders', 'New-feature spec shown', and(isIntent('app_change'), re(/SMS|reminder/i)));
C('11-appchange', 'Create a new module for Passport services', 'New-module spec shown', and(isIntent('app_change'), has('Passport')));
C('11-appchange', 'Add a "Date of Birth" field to the PAN form', 'Field spec shown', and(isIntent('app_change'), re(/Date of Birth|field/i)));
C('11-appchange', 'Mujhe ek naya service add karna hai', 'Add-service spec, asks what service', and(isIntent('app_change'), re(/service/i)));
C('11-appchange', 'Change the Daily Business page to show weekly totals', 'Modify spec shown', and(isIntent('app_change'), has('Daily Business')));
C('11-appchange', 'Ek naya module bana do', 'Generic module spec shown', and(isIntent('app_change'), re(/module/i)));
C('11-appchange', 'Aadhaar Mobile Number Update ka module bana do', '"Nahi" after the spec declines it — nothing queued', and((r, a) => {
  const r2 = a.send('Nahi');
  return r2.intent === 'decline_offer' && dev.listDevRequests(a.p1.id).length === 0;
}));

// ============================================================ (12) ambiguous / incomplete / corrections / mind-change
C('12-ambig', 'Aaj 300', 'Incomplete: asks for service/mode or honest deferral, never invents', and((r) => !!r.draftQuestion || honestCloud(r), unchanged, noIncomeAction));
C('12-ambig', '300', 'Bare number: no fake income, asks or defers honestly', and(noIncomeAction, unchanged, (r) => !!r.draftQuestion || honestCloud(r)));
C('12-ambig', 'Kal', 'Bare "Kal": no money question, no fake entry', and(noMoneyQ, noFakeEntry, unchanged));
C('12-ambig', 'Haan', 'Bare "Haan" with no offer: no pending-entry line, no fake save', and(noFakeEntry, unchanged, (r) => r.kind !== 'action'));
C('12-ambig', 'Pehle wala', 'Vague reference: no fake action', and(noIncomeAction, unchanged));
C('12-ambig', 'Uska hisab batao', 'Unnamed customer: real figure or clarification, no invented name', and((r) => /₹0\.00/.test(T(r.text)) || /kis|kaun/i.test(T(r.text)) || honestCloud(r)));
C('12-ambig', '500', 'Bare amount: no fake income', and(noIncomeAction, unchanged));
C('12-ambig', 'Aaj Xerox 300 cash hue aur kal PAN card banane hai', 'Two requests in one message: the income part is previewed correctly', and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'daily_income' && r.totalPaise === 30000, unchanged));
C('12-ambig', 'Nahi, pehle wala cancel kar do', 'Cancel with no pending entry: no fake save', and(noFakeEntry, unchanged, (r) => !/save ho gaya|saved/i.test(T(r.text))));
C('12-ambig', 'Theek hai, baad mein karte hain', 'Mind-change: no forced action', and(noIncomeAction, unchanged));
C('12-ambig', 'Kal ke 300 Xerox galat the, 250 hone chahiye', 'Correction with no matching entry: honest "no entry found", nothing changed', and(re(/nahi mili|nahi mila/i), unchanged), (s, p) => seedXeroxToday(s, p));
C('12-ambig', 'Mujhe kal 500 chahiye', 'Ambiguous "chahiye": NOT booked as income', and(noIncomeAction, unchanged));
C('12-ambig', 'Xerox', 'Service word alone: no fake entry', and(noIncomeAction, unchanged));
C('12-ambig', 'Kya karu?', 'Vague question: no forced business reply', and(noMoneyQ, unchanged));
C('12-ambig', 'Samajh nahi aaya', 'Confusion: honest reply, no fixed business push', and(noMoneyQ, noFakeEntry));

// ============================================================ (13) financial safety (100% bar)
C('13-safety', 'Aaj Xerox ke 300 cash hue, aur Printing ke 200 UPI', 'Preview only — state unchanged until confirm', and(isIntent('business_action'), isKind('action'), (r) => r.totalPaise === 50000, unchanged));
C('13-safety', 'Aaj Money Transfer mein 10000 bheje, commission 50 mila', 'MT principal ₹10000 is NEVER income — asks receiver, nothing saved', and(isKind('text'), (r) => !!r.draftQuestion, noIncomeAction, unchanged));
C('13-safety', '1000 cash se UPI kar do', 'Cash→UPI is an internal transfer, NOT income/expense', and((r) => r.kind !== 'action' || (r.action && r.action.kind !== 'daily_income' && r.action.kind !== 'expense'), unchanged));
C('13-safety', 'Rahul se 500 lene hain', 'Customer due is NOT received income', and(noIncomeAction, unchanged));
C('13-safety', 'Rahul ko 200 refund karna hai', 'Refund is a reversal action, NOT an expense', and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'refund', unchanged));
C('13-safety', 'Aaj ke 300 Xerox galat the, 250 hone chahiye', 'Correction is a correct_entry action, NOT a new entry', and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'correct_entry', unchanged), (s, p) => seedXeroxToday(s, p));
C('13-safety', 'Aaj Xerox ke 300 cash hue', 'Duplicate attempt: duplicate warning, nothing saved twice', and((r) => !!r.duplicateWarning, unchanged), (s, p) => seedXeroxToday(s, p));
C('13-safety', 'Aaj ka dhandha kitna hua?', 'Profile isolation: other profile\'s ₹500 does NOT leak into this profile', and(isIntent('business_query'), has('₹0.00')), (s, p) => {
  const p2 = profile('u20-p2', 'Second Shop');
  s.profiles.push(p2);
  s.dailyEntries.push({ id: 'seed-p2', profileId: p2.id, date: TODAY, service: 'Xerox', totalPaise: 50000, method: 'cash', description: 'Xerox', quantity: 1, ratePaise: 50000 });
});
C('13-safety', 'Ha', 'Confirm with NO pending entry: honest, no fake "saved"', and(noFakeEntry, unchanged, (r) => r.kind !== 'action' && !/save ho gaya|saved/i.test(T(r.text))));
C('13-safety', 'Aaj Xerox 300', 'Missing payment mode: asks, never invents Cash/UPI', and(isKind('text'), (r) => !!r.draftQuestion, unchanged));
C('13-safety', 'Xerox 300 wali entry delete kar do', 'Delete is a previewed action, NOT executed silently', and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'delete_entry', unchanged), (s, p) => seedXeroxToday(s, p));
C('13-safety', 'Agent ko 500 de diye', 'Agent payment without a named agent: asks, never guesses', and(isKind('text'), (r) => !!r.draftQuestion, unchanged));

// ============================================================ (14) honesty: failed actions + unavailable features
C('14-honesty', 'Aadhaar Mobile Number Update ka module bana do', 'Honest: spec + "in-app AI cannot deploy code", module NOT claimed built', and(isIntent('app_change'), re(/deploy nahi kar sakta|bana NAHI|NOT built yet|not built/i), hasNone('module taiyaar', 'module ban gaya', 'module ready', 'created the module')));
C('14-honesty', 'Mujhe UIDAI portal par Aadhaar update kar do', 'Honest limitation: cannot submit to UIDAI, no fake success', and(isIntent('general'), has('UIDAI'), re(/nahi kar sakta|cannot/i), hasNone('ho gaya', 'submitted', 'done')));
C('14-honesty', 'Ha', 'Confirm with nothing pending: honest error, NOT a fake "saved"', and((r) => !/save ho gaya|saved/i.test(T(r.text)), noFakeEntry, unchanged));
C('14-honesty', 'Mera Aadhaar update kar do', 'No portal deflection, no fake submission', and(hasNone('ho gaya', 'submitted', 'portal par kar diya'), unchanged));
C('14-honesty', 'Mujhe live cricket score batao', 'Live data: honest limitation + key hint, no invented score', correctOrHonest(/live|key/i));
C('14-honesty', 'Aaj ka gold rate kya hai?', 'Live rate: honest limitation, no invented price', correctOrHonest(/live|key|rate/i));
C('14-honesty', 'Mera bank balance kitna hai?', 'No bank linked: no invented balance figure', and((r) => !/₹[1-9][0-9]*\.[0-9]{2}/.test(T(r.text)), unchanged));
C('14-honesty', 'Kal ke 300 Xerox galat the, 250 hone chahiye', 'Failed correction: honest "entry not found", nothing changed', and(re(/nahi mili|nahi mila/i), unchanged), (s, p) => seedXeroxToday(s, p));

// ---------------------------------------------------------------- runner
const results = [];
let passed = 0;
const byCat = new Map();
for (const c of CASES) {
  const { state, p1 } = emptyState();
  if (c.setup) c.setup(state, p1);
  const before = snap(state);
  let ctx = {};
  const send = (q) => {
    const r = conv.respondToMessage({ message: q, state, profile: p1, ctx });
    ctx = r.newCtx;
    return r;
  };
  const r = send(c.q);
  let ok = false;
  let detail = '';
  try {
    const v = c.check(r, { state, p1, send, before, getCtx: () => ctx });
    ok = v === true || (v && v.ok === true);
    detail = v && v.detail ? String(v.detail) : '';
  } catch (e) {
    detail = 'threw: ' + (e && e.message ? e.message : String(e));
  }
  if (ok) passed++;
  const cat = byCat.get(c.cat) || { total: 0, pass: 0 };
  cat.total++;
  if (ok) cat.pass++;
  byCat.set(c.cat, cat);
  results.push({
    category: c.cat, question: c.q, expected: c.expected,
    actual: T(r.text).slice(0, 600), intent: r.intent, kind: r.kind,
    cloud: r.cloudNeeded ? 'needs-owner-phone-test' : null,
    pass: ok, detail,
  });
  console.log(`  ${ok ? 'PASS' : 'FAIL'} [${c.cat}] ${c.q}${detail ? ' — ' + detail : ''}`);
}

const perCategory = [...byCat.entries()].map(([cat, v]) => ({
  category: cat, total: v.total, pass: v.pass,
  rate: Math.round((v.pass / v.total) * 1000) / 10,
}));
const safety = byCat.get('13-safety') || { total: 0, pass: 0 };
const rate = Math.round((passed / CASES.length) * 1000) / 10;
console.log(`\nUPDATE 20 acceptance: ${passed}/${CASES.length} (${rate}%)`);
for (const pc of perCategory) console.log(`  ${pc.category}: ${pc.pass}/${pc.total} (${pc.rate}%)`);
console.log(`  financial safety: ${safety.pass}/${safety.total} (bar: 100%)`);

fs.writeFileSync(
  path.join(root, 'tests', 'update20-results.json'),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: CASES.length, passed, rate,
    safety: { total: safety.total, pass: safety.pass },
    perCategory,
    cases: results,
  }, null, 2),
);
console.log('Wrote tests/update20-results.json');

const okOverall = rate >= 95 && safety.pass === safety.total;
if (!okOverall) {
  console.error(`ACCEPTANCE NOT MET: rate ${rate}% (need >=95%), safety ${safety.pass}/${safety.total} (need 100%)`);
  process.exit(1);
}
