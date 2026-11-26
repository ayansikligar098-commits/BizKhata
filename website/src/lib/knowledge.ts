/**
 * BizKhata AI — business knowledge retrieval.
 *
 * The assistant answers almost any question about the selected business
 * from REAL records only. This module is the retrieval layer: given a
 * question it works out WHAT is needed (date range, service, customer,
 * agent, equipment, category), pulls ONLY those scoped records from the
 * store, and computes the answer with the deterministic accounting
 * engine (dailyBusinessSummary, serviceProfitPaise, balancesPaise,
 * mtClosingPaise, equipmentLifetimeCostPaise — integer paise throughout).
 * The whole database is never handed to the AI; only the retrieved
 * figures reach the answer (and, when the built-in AI summary is used,
 * the same retrieved figures only). Everything is restricted to the
 * selected profile.
 *
 * It also answers application-help questions ("Cash Book mein entry
 * kaise add karu?") with step-by-step guidance + a real deep link, and
 * navigation requests ("Cash Book kholo") with an approved route.
 * When the records do not cover a question, it says so plainly instead
 * of inventing a figure. Facts, calculations and suggestions are kept
 * separate in the answer text.
 */
import {
  agentPayablePaise,
  balancesPaise,
  dailyBusinessSummary,
  equipmentLifetimeCostPaise,
  jobDuePaise,
  mtClosingPaise,
  mtProfitPaise,
  netProfitPaise,
  serviceProfitPaise,
  totalCustomerDuePaise,
} from './accounting';
import { formatINR } from './money';
import type { AppState, BusinessProfile } from './types';
import { todayISO } from './types';
import { detectLanguage, normalizeMultilingual, replyIn, type AiLangCode, type ReplyKey } from './languages';

/** Common Devanagari words → Latin equivalents, so Hinglish written in
 *  Devanagari ("आज ज़ेरॉक्स के ३०० रुपये कैश हुए") is understood the
 *  same as the Latin spelling. */
export const DEVANAGARI_WORDS: Record<string, string> = {
  'आज': 'aaj', 'कल': 'kal', 'परसों': 'parso',
  'कितना': 'kitna', 'कितनी': 'kitni', 'कितने': 'kitne',
  'किस': 'kis', 'कौन': 'kaun', 'कौनसा': 'kaunsa', 'क्या': 'kya',
  'बताओ': 'batao', 'दिखाओ': 'dikhao', 'बताइए': 'batao',
  'धंधा': 'dhandha', 'कमाई': 'kamai', 'मुनाफा': 'munafa', 'फायदा': 'fayda',
  'खर्चा': 'kharcha', 'खर्च': 'kharcha', 'बाकी': 'baaki', 'उधार': 'udhaar',
  'रुपये': 'rupaye', 'रुपए': 'rupaye', 'पैसे': 'paise', 'पैसा': 'paisa',
  'कैश': 'cash', 'नकद': 'nagad', 'यूपीआई': 'upi', 'ऑनलाइन': 'online',
  'हुए': 'hue', 'हुआ': 'hua', 'हुई': 'hui', 'मिला': 'mila', 'मिले': 'mile',
  'दिए': 'diye', 'दिया': 'diya', 'देना': 'dena', 'लेना': 'lena',
  'मशीन': 'machine', 'बिजली': 'bijli', 'एजेंट': 'agent',
  'ट्रांसफर': 'transfer', 'कमीशन': 'commission', 'ग्राहक': 'customer',
  'ज़ेरॉक्स': 'xerox', 'जेरॉक्स': 'xerox', 'प्रिंटिंग': 'printing',
  'महीने': 'mahine', 'महीना': 'mahina', 'साल': 'saal', 'हफ्ते': 'hafte',
  'दिन': 'din', 'पिछले': 'pichhle', 'पिछला': 'pichhla',
  'खोलो': 'kholo', 'खोल': 'khol', 'कैसे': 'kaise', 'कहाँ': 'kahan',
};

export function normalizeDevanagariWords(text: string): string {
  // Backwards-compatible name: now normalises ALL supported languages
  // (native scripts + Romanized + mixed) to canonical Hinglish tokens.
  return normalizeMultilingual(text);
}

export interface ChatContext {
  lastService?: string;
  lastPeriodKey?: string;
  lastCustomer?: string;
  lastAgent?: string;
  lastTopic?: string;
}

export interface KnowledgeLink {
  label: string;
  path: string;
}

export interface KnowledgeTable {
  headers: string[];
  rows: string[][];
}

export interface KnowledgeAnswer {
  text: string;
  table?: KnowledgeTable;
  links?: KnowledgeLink[];
  /** Route the assistant should actually open (approved navigation). */
  navigateTo?: string;
  /** Updated conversation context. */
  context: ChatContext;
}

export type PeriodKey = 'today' | 'yesterday' | 'month' | 'last_month' | 'last7' | 'last3months' | 'year' | 'all';

export interface DateRange {
  key: PeriodKey;
  label: string;
  start: string;
  end: string;
  prevLabel: string;
  prevStart: string;
  prevEnd: string;
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number);
  const end = new Date(y, m, 0).toISOString().slice(0, 10);
  return { start: `${ym}-01`, end };
}

function prevMonthYm(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Interpret the date words in a question (aaj/kal/is mahine/last month/...). */
export function parseDateRange(q: string, today: string = todayISO()): DateRange {
  const s = normalizeMultilingual(q.toLowerCase());
  const ym = today.slice(0, 7);
  if (/pichhle?\s*(3|teen)\s*(mahine|month)|last\s*3\s*months?|pichle\s*3/.test(s)) {
    const start = shiftISO(monthRange(prevMonthYm(prevMonthYm(ym))).start, 0);
    return { key: 'last3months', label: 'last 3 months', start, end: today, prevLabel: 'previous 3 months', prevStart: shiftISO(start, -92), prevEnd: shiftISO(start, -1) };
  }
  if (/last\s*7|pichhle?\s*(7|saat)\s*din|last\s*week|pichhle\s*hafte/.test(s)) {
    return { key: 'last7', label: 'last 7 days', start: shiftISO(today, -6), end: today, prevLabel: 'previous 7 days', prevStart: shiftISO(today, -13), prevEnd: shiftISO(today, -7) };
  }
  if (/last\s*month|pichhle?\s*(mahine|month)|last\s*mahine/.test(s)) {
    const pm = prevMonthYm(ym);
    const r = monthRange(pm);
    const ppm = prevMonthYm(pm);
    const pr = monthRange(ppm);
    return { key: 'last_month', label: 'last month', start: r.start, end: r.end, prevLabel: 'month before last', prevStart: pr.start, prevEnd: pr.end };
  }
  if (/is\s*(saal|year)|this\s*year/.test(s)) {
    return { key: 'year', label: 'this year', start: `${today.slice(0, 4)}-01-01`, end: today, prevLabel: 'last year', prevStart: `${Number(today.slice(0, 4)) - 1}-01-01`, prevEnd: `${Number(today.slice(0, 4)) - 1}-12-31` };
  }
  if (/kal|yesterday/.test(s)) {
    const y = shiftISO(today, -1);
    return { key: 'yesterday', label: 'yesterday', start: y, end: y, prevLabel: 'day before yesterday', prevStart: shiftISO(today, -2), prevEnd: shiftISO(today, -2) };
  }
  if (/is\s*(mahine|month)|this\s*month/.test(s)) {
    const r = monthRange(ym);
    const pm = prevMonthYm(ym);
    const pr = monthRange(pm);
    return { key: 'month', label: 'this month', start: r.start, end: today, prevLabel: 'last month', prevStart: pr.start, prevEnd: pr.end };
  }
  return { key: 'today', label: 'today', start: today, end: today, prevLabel: 'yesterday', prevStart: shiftISO(today, -1), prevEnd: shiftISO(today, -1) };
}

/** Service aliases (English/Hinglish/Hindi transliteration). */
export const SERVICE_ALIASES: Record<string, string[]> = {
  'PAN Card': ['pan'],
  'Aadhaar Services': ['aadhaar', 'aadhar', 'adhaar'],
  'Voter ID': ['voter'],
  'Ayushman Card': ['ayushman'],
  'Smart Card': ['smart card', 'smartcard'],
  Xerox: ['xerox', 'zerox', 'photocopy', 'जेरॉक्स'],
  Printing: ['printing', 'print', 'printout', 'print out'],
  'Passport Size Photo': ['passport', 'passport photo', 'passport size'],
  Scanning: ['scan', 'scanning'],
  'Document Work': ['document'],
  'Mobile Sale': ['mobile sale'],
  Recharge: ['recharge'],
  'Mobile Repair': ['mobile repair'],
  'Grocery Sale': ['grocery', 'kirana'],
  'Money Transfer': ['money transfer', 'moneytransfer', 'mt'],
};

export function findServiceIn(text: string, services: string[]): string | null {
  const cleaned = normalizeDevanagariWords(text.toLowerCase())
    .replace(/ज़/g, 'ज').replace(/फ़/g, 'फ').replace(/क़/g, 'क').replace(/ख़/g, 'ख').replace(/ग़/g, 'ग')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ');
  const s = ` ${cleaned} `;
  for (const svc of services) {
    const aliases = [svc.toLowerCase(), ...(SERVICE_ALIASES[svc] || [])];
    for (const a of aliases) {
      // Whole-word match: "printer" must NOT match the "print" alias,
      // and Devanagari words need space boundaries (ASCII \b fails).
      if (a && s.includes(` ${a} `)) return svc;
    }
  }
  return null;
}

export function findNameIn(text: string, names: string[]): string | null {
  const s = text.toLowerCase();
  const sorted = [...names].sort((a, b) => b.length - a.length);
  for (const n of sorted) {
    if (n && s.includes(n.toLowerCase())) return n;
  }
  // First-name match (e.g. "Ramesh" for "Ramesh Bhai").
  for (const n of sorted) {
    const first = n.split(' ')[0];
    if (first.length >= 3 && new RegExp(`\\b${first.toLowerCase()}\\b`).test(s)) return n;
  }
  return null;
}

function has(q: string, re: RegExp): boolean {
  return re.test(q);
}

function dailyInput(state: AppState, pid: string, start: string, end: string) {
  return {
    start,
    end,
    jobs: state.jobs.filter((j) => j.profileId === pid),
    cashTxns: state.cashTxns.filter((x) => x.profileId === pid),
    dailyEntries: state.dailyEntries.filter((x) => x.profileId === pid),
    expenses: state.expenses.filter((e) => e.profileId === pid),
    mtTransfers: state.mtTransfers.filter((m) => m.profileId === pid),
    mtExpenses: state.mtExpenses.filter((m) => m.profileId === pid),
  };
}

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** App help: step-by-step guidance + real deep link for a feature. */
export function appHelp(q: string): KnowledgeAnswer | null {
  const s = normalizeDevanagariWords(q.toLowerCase());
  const ctx: ChatContext = { lastTopic: 'help' };
  const help = (
    title: string,
    steps: string[],
    path: string,
    linkLabel: string,
  ): KnowledgeAnswer => ({
    text: `${title}\n${steps.map((st, i) => `${i + 1}. ${st}`).join('\n')}`,
    links: [{ label: linkLabel, path }],
    context: ctx,
  });
  if (/cash\s*book/.test(s) && /kaise|how|add|entry/.test(s)) {
    return help('Cash Book mein entry add karne ke liye:', ['Cash Book page kholo (neeche button se).', '"Add Entry" dabao.', 'Amount, Cash/UPI mode aur note likho.', 'Save dabao — entry Cash Book aur Daily Business dono mein dikhegi.'], '/cash-book', 'Open Cash Book');
  }
  if (/upi\s*book/.test(s) && /kaise|how|add|entry/.test(s)) {
    return help('UPI Book mein entry add karne ke liye:', ['UPI Book page kholo.', '"Add Entry" dabao.', 'Amount aur note likho (mode UPI hi hoga).', 'Save dabao.'], '/upi-book', 'Open UPI Book');
  }
  if (/customer.*add|add.*customer|naya customer|new customer/.test(s)) {
    return help('Naya customer add karne ke liye:', ['Customers page kholo.', '"Add Customer" dabao.', 'Naam aur mobile number likho.', 'Save dabao — customer Customer Khata mein bhi dikhega.'], '/customers', 'Open Customers');
  }
  if (/agent.*payment|agent ko.*(pay|de|payment)|pay.*agent/.test(s) && /kaise|how/.test(s)) {
    return help('Agent ko payment dene ke liye:', ['Agents page kholo aur agent chuno.', '"Record Agent Payment" dabao.', 'Job aur amount chuno (due se zyada nahi).', 'Save dabao — payable kam ho jayega aur Cash/UPI Book mein entry banegi.'], '/agents', 'Open Agents');
  }
  if (/receipt/.test(s) && /kaise|how|generate|ban/.test(s)) {
    return help('Receipt banane ke liye:', ['Receipt Generator kholo.', 'Customer, service, total aur paid amount likho.', 'Layout chuno — A4 ya Thermal.', '"Generate" dabao, phir Print / PDF / WhatsApp share karo.'], '/receipt-generator', 'Open Receipt Generator');
  }
  if (/daily.*report|daily business|dhandha.*report/.test(s) && /kahan|kaha|where|kaise|how/.test(s)) {
    return help('Daily report dekhne ke liye:', ['Daily Business page kholo.', 'Today / Week / Month / Year chuno.', 'Collection, kharcha aur net earnings upar dikhenge; neeche service-wise breakdown hai.', 'CSV export bhi kar sakte ho.'], '/daily-business', 'Open Daily Business');
  }
  if (/profile.*change|business.*(change|switch|badlo)|profile.*badlo/.test(s)) {
    return help('Business profile badalne ke liye:', ['Upar top bar mein business ka naam (profile switcher) dabao.', 'Jo business kholna hai use chuno.', 'Poora app usi business ka data dikhane lagega — profiles ka data kabhi mix nahi hota.'], '/dashboard', 'Open Dashboard');
  }
  if (/new service|service.*add|service kaise/.test(s)) {
    return help('Nayi service add karne ke liye:', ['Customization Studio kholo.', '"Add Service" mein service ka naam likho.', 'Save dabao — nayi service Services list aur AI Assistant dono mein aa jayegi.'], '/customization', 'Open Customization Studio');
  }
  if (/language.*change|bhasha.*(badlo|change)|hindi.*(karo|change)|english.*(karo|change)/.test(s)) {
    return help('Language badalne ke liye:', ['Settings kholo.', '"Language" section mein jao.', 'App language (English / Hindi / Hinglish) chuno.', '"AI Assistant language" mein 22 Indian languages mein se koi ek chuno — ya Auto-detect chhodo, to AI aapki bhasha khud pehchan lega.', 'Save dabao.'], '/settings/language', 'Open Language Settings');
  }
  if (/difference finder/.test(s)) {
    return help('Difference Finder use karne ke liye:', ['Difference Finder kholo.', 'Scope chuno — Cash, UPI, Money Transfer, Service ya General.', 'Apna ginna hua (expected) balance likho.', '"Find Possible Causes" dabao — app batayega kahan fark ho sakta hai. Ye kabhi entry khud nahi badalta.'], '/difference-finder', 'Open Difference Finder');
  }
  if (/money transfer/.test(s) && /kaise|how|add|fund/.test(s)) {
    return help('Money Transfer ke liye:', ['Money Transfer page kholo.', 'Pehle "Add Fund" se bhai se mila fund add karo (UPI).', 'Phir "New Transfer" se receiver, amount aur commission likho.', 'Daily closing mein Starting + Fund − Sent − Expenses dikhega.'], '/money-transfer', 'Open Money Transfer');
  }
  if (/backup/.test(s)) {
    return help('Backup lene ke liye:', ['Settings kholo.', '"Download Backup" dabao — poora data JSON file mein download hoga.', 'Wapas lane ke liye "Import Backup" se wahi file chuno.'], '/settings', 'Open Settings');
  }
  return null;
}

/** Approved navigation routes the AI may open ("Cash Book kholo"). */
export const NAV_ROUTES: { re: RegExp; path: string; label: string }[] = [
  { re: /cash\s*book/, path: '/cash-book', label: 'Cash Book' },
  { re: /upi\s*book/, path: '/upi-book', label: 'UPI Book' },
  { re: /money\s*transfer/, path: '/money-transfer', label: 'Money Transfer' },
  { re: /daily\s*business|daily\s*dhandha/, path: '/daily-business', label: 'Daily Business' },
  { re: /customer\s*khata|khata/, path: '/customer-khata', label: 'Customer Khata' },
  { re: /customers?/, path: '/customers', label: 'Customers' },
  { re: /agents?/, path: '/agents', label: 'Agents' },
  { re: /agent\s*payment/, path: '/agent-payments', label: 'Agent Payments' },
  { re: /expense/, path: '/expenses', label: 'Expenses' },
  { re: /maintenance|machine/, path: '/machine-maintenance', label: 'Machine Maintenance' },
  { re: /receipt/, path: '/receipt-generator', label: 'Receipt Generator' },
  { re: /reports?/, path: '/reports', label: 'Reports' },
  { re: /difference\s*finder/, path: '/difference-finder', label: 'Difference Finder' },
  { re: /recycle/, path: '/recycle-bin', label: 'Recycle Bin' },
  { re: /audit/, path: '/audit-log', label: 'Audit Log' },
  { re: /customi[sz]ation|customize/, path: '/customization', label: 'Customization Studio' },
  { re: /settings?/, path: '/settings', label: 'Settings' },
  { re: /dashboard/, path: '/dashboard', label: 'Dashboard' },
  { re: /pan\s*card/, path: '/services/pan-card', label: 'PAN Card' },
  { re: /aadhaar/, path: '/services/aadhaar', label: 'Aadhaar Services' },
  { re: /voter/, path: '/services/voter-id', label: 'Voter ID' },
  { re: /ayushman/, path: '/services/ayushman', label: 'Ayushman Card' },
  { re: /xerox/, path: '/services/xerox', label: 'Xerox' },
  { re: /printing/, path: '/services/printing', label: 'Printing' },
  { re: /smart\s*card/, path: '/services/smart-card', label: 'Smart Card' },
  { re: /chatbot|ai assistant|assistant/, path: '/chatbot', label: 'AI Assistant' },
  { re: /services?/, path: '/services', label: 'Services' },
];

export function navigationRequest(q: string): { path: string; label: string } | null {
  const s = normalizeDevanagariWords(q.toLowerCase());
  if (!/kholo|khol|open|dikhao|dikha|show|jao|chalo|le chalo|go to/.test(s)) return null;
  for (const r of NAV_ROUTES) {
    if (r.re.test(s)) return { path: r.path, label: r.label };
  }
  return null;
}

/**
 * Answer a business question from scoped real records.
 * Returns null when the question is not a knowledge question (the caller
 * then falls back to the factual responder / action parser).
 */
export function computeKnowledge(
  state: AppState,
  profile: BusinessProfile,
  question: string,
  prevCtx: ChatContext = {},
): KnowledgeAnswer | null {
  const pid = profile.id;
  const q = normalizeDevanagariWords(question.toLowerCase());
  const today = todayISO();
  const range = parseDateRange(q, today);
  const replyLang: AiLangCode = profile.aiLanguage && profile.aiLanguage !== 'auto' ? profile.aiLanguage : detectLanguage(question).code;
  const langHi = replyLang !== 'en';
  const t = (h: string, e: string) => (langHi ? h : e);
  /** Localised template when the reply language has one, else hi/en text. */
  const tt = (key: ReplyKey, values: Record<string, string | number>, h: string, e: string) =>
    replyLang !== 'hi' && replyLang !== 'en' ? replyIn(replyLang, key, values) : (langHi ? h : e);
  const jobs = state.jobs.filter((j) => j.profileId === pid);
  const expenses = state.expenses.filter((e) => e.profileId === pid);
  const txns = state.cashTxns.filter((x) => x.profileId === pid);
  const mtT = state.mtTransfers.filter((m) => m.profileId === pid);
  const mtE = state.mtExpenses.filter((m) => m.profileId === pid);
  const agents = state.agents.filter((a) => a.profileId === pid);
  const customers = state.customers.filter((c) => c.profileId === pid);
  const hasAny = jobs.length + expenses.length + txns.length + mtT.length + state.dailyEntries.filter((x) => x.profileId === pid).length > 0;
  const baseCtx: ChatContext = { ...prevCtx };

  // --- App help first (no figures needed). ---
  const help = appHelp(q);
  if (help) return help;

  // --- Navigation ("Cash Book kholo"). ---
  const nav = navigationRequest(q);
  if (nav) {
    return {
      text: t(`${nav.label} khol diya — aap ab ${nav.label} page par hain.`, `Opened ${nav.label} — you are now on the ${nav.label} page.`),
      navigateTo: nav.path,
      links: [{ label: `Open ${nav.label}`, path: nav.path }],
      context: { ...baseCtx, lastTopic: 'navigation' },
    };
  }

  // --- Comparison ("last month se compare karo", "compare karo"). ---
  // Word-boundary care: bare "kam" would match "kamaya" (earned).
  if (/\bcompare\b|tulna|comparison|\bse compare\b|last month se|pichhle?\s*(mahine|month)\s*se/.test(q)) {
    const service = findServiceIn(q, profile.services) || prevCtx.lastService;
    const r = service ? range : { ...range };
    const cur = dailyBusinessSummary(dailyInput(state, pid, r.start, r.end));
    const prev = dailyBusinessSummary(dailyInput(state, pid, r.prevStart, r.prevEnd));
    const curSvc = service ? cur.byService.find((x) => x.service === service) : undefined;
    const prevSvc = service ? prev.byService.find((x) => x.service === service) : undefined;
    const curVal = service ? (curSvc?.collection || 0) : cur.totalCollection;
    const prevVal = service ? (prevSvc?.collection || 0) : prev.totalCollection;
    const diff = curVal - prevVal;
    const pct = prevVal > 0 ? Math.round((diff / prevVal) * 100) : null;
    const table: KnowledgeTable = {
      headers: [t('Period', 'Period'), t('Collection', 'Collection'), t('Kharcha', 'Expenses'), t('Net Earnings', 'Net Earnings')],
      rows: [
        [r.label, formatINR(curVal), formatINR(cur.expenses), formatINR(cur.netEarnings)],
        [r.prevLabel, formatINR(prevVal), formatINR(prev.expenses), formatINR(prev.netEarnings)],
        [t('Fark', 'Difference'), `${diff >= 0 ? '+' : ''}${formatINR(diff)}${pct !== null ? ` (${pct >= 0 ? '+' : ''}${pct}%)` : ''}`, '', ''],
      ],
    };
    return {
      text: t(
        `${service ? `${service} — ` : ''}${r.label} vs ${r.prevLabel} comparison (real records se):`,
        `${service ? `${service} — ` : ''}Comparison of ${r.label} vs ${r.prevLabel} (from real records):`,
      ),
      table,
      links: [{ label: 'View Reports', path: '/reports' }],
      context: { ...baseCtx, lastService: service, lastPeriodKey: r.key, lastTopic: 'compare' },
    };
  }

  // --- Last 7 days / 3 months / yearly summaries (tables). ---
  if (range.key === 'last7' || range.key === 'last3months' || range.key === 'year') {
    if (has(q, /summary|dhandha|business|profit|hisab|kamai|earning/)) {
      if (range.key === 'last3months') {
        const rows: string[][] = [];
        const ym = today.slice(0, 7);
        const months = [ym, prevMonthYm(ym), prevMonthYm(prevMonthYm(ym))];
        for (const m of months) {
          const r = monthRange(m);
          const s = dailyBusinessSummary(dailyInput(state, pid, r.start, r.end));
          rows.push([m, formatINR(s.totalCollection), formatINR(s.expenses), formatINR(s.netEarnings)]);
        }
        return {
          text: t('Pichhle 3 mahine ka profit (real records se):', 'Profit for the last 3 months (from real records):'),
          table: { headers: [t('Mahina', 'Month'), t('Collection', 'Collection'), t('Kharcha', 'Expenses'), t('Net Earnings', 'Net Earnings')], rows },
          links: [{ label: 'View Reports', path: '/reports/profit' }],
          context: { ...baseCtx, lastPeriodKey: range.key, lastTopic: 'months' },
        };
      }
      if (range.key === 'year') {
        const s = dailyBusinessSummary(dailyInput(state, pid, range.start, range.end));
        const rows = s.byService.map((x) => [x.service, formatINR(x.collection), formatINR(x.directExpenses), formatINR(x.collection - x.directExpenses)]);
        return {
          text: t(`Is saal ki service-wise performance (real records se):`, `This year's service-wise performance (from real records):`),
          table: { headers: [t('Service', 'Service'), t('Collection', 'Collection'), t('Kharcha', 'Expenses'), t('Profit', 'Profit')], rows: rows.length ? rows : [[t('Koi record nahi', 'No records yet'), '—', '—', '—']] },
          links: [{ label: 'View Service-wise Report', path: '/reports/service-wise' }],
          context: { ...baseCtx, lastPeriodKey: range.key, lastTopic: 'year' },
        };
      }
      const s = dailyBusinessSummary(dailyInput(state, pid, range.start, range.end));
      const rows: string[][] = [];
      for (let i = 6; i >= 0; i--) {
        const d = shiftISO(today, -i);
        const ds = dailyBusinessSummary(dailyInput(state, pid, d, d));
        rows.push([d, formatINR(ds.totalCollection), formatINR(ds.expenses), formatINR(ds.netEarnings)]);
      }
      return {
        text: t('Last 7 days ka business summary (real records se):', 'Business summary for the last 7 days (from real records):'),
        table: { headers: [t('Date', 'Date'), t('Collection', 'Collection'), t('Kharcha', 'Expenses'), t('Net', 'Net')], rows },
        links: [{ label: 'View Daily Business', path: '/daily-business' }],
        context: { ...baseCtx, lastPeriodKey: range.key, lastTopic: 'week' },
      };
    }
  }

  // --- Rising expenses / increasing expenses analysis. ---
  if (/badh|badhta|badhti|increasing|rising|zyada kharcha/.test(q) && /expense|kharcha/.test(q)) {
    const cur = expenses.filter((e) => monthOf(e.date) === today.slice(0, 7));
    const prev = expenses.filter((e) => monthOf(e.date) === prevMonthYm(today.slice(0, 7)));
    const sumBy = (list: typeof expenses) => {
      const m = new Map<string, number>();
      for (const e of list) m.set(e.category, (m.get(e.category) || 0) + e.amountPaise);
      return m;
    };
    const c = sumBy(cur);
    const p = sumBy(prev);
    const rows = [...c.entries()]
      .map(([cat, amt]) => ({ cat, amt, diff: amt - (p.get(cat) || 0) }))
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 5)
      .map((x) => [x.cat, formatINR(x.amt), `${x.diff >= 0 ? '+' : ''}${formatINR(x.diff)}`]);
    if (rows.length === 0) {
      return { text: t('Is mahine koi kharcha record nahi hai, isliye badhte kharche ka comparison nahi kar sakta.', 'There are no expenses recorded this month, so I cannot compare rising expenses.'), context: { ...baseCtx, lastTopic: 'expenses' } };
    }
    return {
      text: t('Kharcha comparison — is mahina vs pichhla mahina (real records se). Upar wali categories mein kharcha badha hai:', 'Expense comparison — this month vs last month (from real records). Spending rose in these categories:'),
      table: { headers: [t('Category', 'Category'), t('Is Mahina', 'This Month'), t('Fark', 'Change')], rows },
      links: [{ label: 'View Expenses', path: '/expenses' }],
      context: { ...baseCtx, lastTopic: 'expenses' },
    };
  }

  // --- Service-specific earnings / profit / sales. ---
  const service = findServiceIn(q, profile.services);
  if (service && /earning|kamai|kamaya|profit|munafa|sales|collection|kitna|kitni|batao/.test(q)) {
    const s = dailyBusinessSummary(dailyInput(state, pid, range.start, range.end));
    const svc = s.byService.find((x) => x.service === service);
    const sp = serviceProfitPaise(service, jobs.filter((j) => j.date >= range.start && j.date <= range.end), expenses.filter((e) => e.date >= range.start && e.date <= range.end));
    const collection = svc?.collection || 0;
    const profit = service === 'Money Transfer Commission' ? s.mtCommission : (svc ? svc.collection - svc.directExpenses : sp.profit);
    if (!hasAny) {
      return { text: t('Abhi koi record nahi hai — isliye main koi earning nahi bata sakta.', 'There are no records yet, so I cannot quote any earnings.'), context: { ...baseCtx, lastService: service, lastTopic: 'service' } };
    }
    return {
      text: t(
        `${service} — ${range.label}: collection ${formatINR(collection)} (cash ${formatINR(svc?.cash || 0)}, UPI ${formatINR(svc?.upi || 0)}), direct kharcha ${formatINR(svc?.directExpenses || 0)}, profit lagbhag ${formatINR(profit)}. Calculation: collection − direct kharcha = profit (job-based agent charges alag se Reports mein dikhte hain).`,
        `${service} — ${range.label}: collection ${formatINR(collection)} (cash ${formatINR(svc?.cash || 0)}, UPI ${formatINR(svc?.upi || 0)}), direct expenses ${formatINR(svc?.directExpenses || 0)}, profit about ${formatINR(profit)}. Calculation: collection − direct expenses = profit (job agent charges appear separately in Reports).`,
      ),
      links: [{ label: 'View Service-wise Report', path: '/reports/service-wise' }],
      context: { ...baseCtx, lastService: service, lastPeriodKey: range.key, lastTopic: 'service' },
    };
  }

  // --- Top / best / worst service. ---
  if (/sabse zyada|best|top|highest|kam.*service|sabse kam|lowest|worst/.test(q) && /earning|kamai|profit|collection|service/.test(q)) {
    const s = dailyBusinessSummary(dailyInput(state, pid, range.start, range.end));
    if (s.byService.length === 0) {
      return { text: t(`${range.label} mein koi collection nahi hai — isliye best service nahi bata sakta.`, `There is no collection in ${range.label}, so I cannot name a best service.`), context: { ...baseCtx, lastTopic: 'service' } };
    }
    const sorted = [...s.byService].sort((a, b) => b.collection - a.collection);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const rows = sorted.slice(0, 5).map((x) => [x.service, formatINR(x.collection), formatINR(x.collection - x.directExpenses)]);
    return {
      text: t(
        `${range.label} mein sabse zyada earning ${best.service} se hui: ${formatINR(best.collection)} (profit lagbhag ${formatINR(best.collection - best.directExpenses)}). Sabse kam: ${worst.service} — ${formatINR(worst.collection)}.`,
        `In ${range.label}, the highest earning service is ${best.service}: ${formatINR(best.collection)} (profit about ${formatINR(best.collection - best.directExpenses)}). Lowest: ${worst.service} — ${formatINR(worst.collection)}.`,
      ),
      table: { headers: [t('Service', 'Service'), t('Collection', 'Collection'), t('Profit (lagbhag)', 'Profit (approx.)')], rows },
      links: [{ label: 'View Service-wise Report', path: '/reports/service-wise' }],
      context: { ...baseCtx, lastService: best.service, lastPeriodKey: range.key, lastTopic: 'service' },
    };
  }

  // --- Money Transfer commission / totals. ---
  if (/money transfer|\bmt\b|commission/.test(q)) {
    const inR = mtT.filter((m) => m.date >= range.start && m.date <= range.end && m.status !== 'Failed');
    const commission = inR.reduce((a, m) => a + m.commissionPaise, 0);
    const sent = inR.reduce((a, m) => a + m.amountPaise, 0);
    const closing = mtClosingPaise(0, 0, state.mtFunds.filter((f) => f.profileId === pid), mtT, mtE);
    if (inR.length === 0 && mtT.length === 0) {
      return { text: t('Abhi koi Money Transfer record nahi hai.', 'There are no Money Transfer records yet.'), context: { ...baseCtx, lastTopic: 'mt' } };
    }
    return {
      text: t(
        `Money Transfer — ${range.label}: ${inR.length} transfer, kul bheja ${formatINR(sent)} (ye principal hai, income NAHI), commission ${formatINR(commission)} — sirf commission hi income/profit hai. MT balance abhi: cash ${formatINR(closing.cash)}, UPI ${formatINR(closing.upi)}.`,
        `Money Transfer — ${range.label}: ${inR.length} transfers, total sent ${formatINR(sent)} (this is principal, NOT income), commission ${formatINR(commission)} — only the commission is income/profit. MT balance now: cash ${formatINR(closing.cash)}, UPI ${formatINR(closing.upi)}.`,
      ),
      links: [{ label: 'View Money Transfer', path: '/money-transfer' }],
      context: { ...baseCtx, lastPeriodKey: range.key, lastTopic: 'mt' },
    };
  }

  // --- Customer questions. ---
  const custName = findNameIn(q, customers.map((c) => c.name)) || findNameIn(q, jobs.map((j) => j.customerName));
  if (custName && (/history|hisab|detail|poora|complete|last payment|kab|due|pending|dena/.test(q) || /customer/.test(q))) {
    const cJobs = jobs.filter((j) => j.customerName.toLowerCase() === custName.toLowerCase());
    if (cJobs.length === 0) {
      return { text: t(`${custName} ke naam par is profile mein koi job record nahi mila.`, `No job record was found for ${custName} in this profile.`), context: { ...baseCtx, lastCustomer: custName, lastTopic: 'customer' } };
    }
    const billed = cJobs.reduce((a, j) => a + j.totalPaise, 0);
    const received = cJobs.reduce((a, j) => a + j.receivedPaise, 0);
    const due = totalCustomerDuePaise(cJobs);
    const lastPay = [...cJobs].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const rows = cJobs.slice(0, 8).map((j) => [j.date, j.service, formatINR(j.totalPaise), formatINR(j.receivedPaise), formatINR(jobDuePaise(j)), j.status]);
    return {
      text: t(
        `${custName} ki history: ${cJobs.length} job, kul bill ${formatINR(billed)}, mila ${formatINR(received)}, baaki due ${formatINR(due)}. Last job: ${lastPay.date} ko ${lastPay.service}.`,
        `${custName}'s history: ${cJobs.length} jobs, total billed ${formatINR(billed)}, received ${formatINR(received)}, still due ${formatINR(due)}. Last job: ${lastPay.service} on ${lastPay.date}.`,
      ),
      table: { headers: [t('Date', 'Date'), t('Service', 'Service'), t('Bill', 'Bill'), t('Mila', 'Received'), t('Due', 'Due'), t('Status', 'Status')], rows },
      links: [{ label: 'View Customer Khata', path: '/customer-khata' }],
      context: { ...baseCtx, lastCustomer: custName, lastTopic: 'customer' },
    };
  }
  if (/sabse zyada due|biggest due|kaun.*due|kis.*due|pending.*customer|due.*customer/.test(q) || (has(q, /due|udhaar|baaki|pending/) && /customer/.test(q))) {
    const dues = jobs
      .map((j) => ({ name: j.customerName, due: jobDuePaise(j), date: j.date, service: j.service }))
      .filter((d) => d.due > 0)
      .sort((a, b) => b.due - a.due);
    const total = totalCustomerDuePaise(jobs);
    if (dues.length === 0) {
      return { text: t('Koi customer due nahi hai — sab clear hai.', 'No customer owes anything — everything is clear.'), context: { ...baseCtx, lastTopic: 'due' } };
    }
    const rows = dues.slice(0, 5).map((d) => [d.name, d.service, formatINR(d.due), d.date]);
    return {
      text: t(
        `Kul customer due ${formatINR(total)} hai. Sabse zyada due ${dues[0].name} ka hai: ${formatINR(dues[0].due)} (${dues[0].service}, ${dues[0].date}).`,
        `Total customer due is ${formatINR(total)}. The biggest due is ${dues[0].name}: ${formatINR(dues[0].due)} (${dues[0].service}, ${dues[0].date}).`,
      ),
      table: { headers: [t('Customer', 'Customer'), t('Service', 'Service'), t('Due', 'Due'), t('Date', 'Date')], rows },
      links: [{ label: 'View Customer Khata', path: '/customer-khata' }],
      context: { ...baseCtx, lastCustomer: dues[0].name, lastTopic: 'due' },
    };
  }
  if (/naye customer|new customer|kitne customer.*(aaye|add)/.test(q)) {
    const todayNew = customers.filter((c) => c.createdAt.slice(0, 10) === today).length;
    const jobsToday = jobs.filter((j) => j.date === today).length;
    return {
      text: t(
        `Aaj ${todayNew} naye customer add hue aur ${jobsToday} job hue. Kul customers is profile mein: ${customers.length}.`,
        `Today ${todayNew} new customers were added and ${jobsToday} jobs were done. Total customers in this profile: ${customers.length}.`,
      ),
      links: [{ label: 'View Customers', path: '/customers' }],
      context: { ...baseCtx, lastTopic: 'customer' },
    };
  }

  // --- Agent questions. ---
  const agentName = findNameIn(q, agents.map((a) => a.name));
  if (agentName && (/kitna.*(diya|pay|paid)|total.*(diya|paid)|payable|baaki|pending|jobs/.test(q) || /agent/.test(q))) {
    const agent = agents.find((a) => a.name === agentName)!;
    const aJobs = jobs.filter((j) => j.agentId === agent.id);
    const payable = agentPayablePaise(agent, aJobs);
    const paid = aJobs.reduce((a, j) => a + j.agentPaidPaise, 0);
    const charges = aJobs.reduce((a, j) => a + j.agentChargePaise, 0);
    const pendingJobs = aJobs.filter((j) => !['Completed', 'Delivered', 'Cancelled'].includes(j.status));
    const monthPaid = aJobs.reduce((a, j) => a + j.agentPaidPaise, 0);
    return {
      text: t(
        `${agent.name}: kul agent charge ${formatINR(charges)}, ab tak diya ${formatINR(paid)}, dena baaki (payable) ${formatINR(payable)}. Pending jobs: ${pendingJobs.length} (${pendingJobs.map((j) => `${j.service} — ${j.customerName}`).join(', ') || 'koi nahi'}).`,
        `${agent.name}: total agent charges ${formatINR(charges)}, paid so far ${formatINR(paid)}, still payable ${formatINR(payable)}. Pending jobs: ${pendingJobs.length} (${pendingJobs.map((j) => `${j.service} — ${j.customerName}`).join(', ') || 'none'}).`,
      ),
      table: { headers: [t('Job', 'Job'), t('Customer', 'Customer'), t('Charge', 'Charge'), t('Diya', 'Paid'), t('Baaki', 'Balance')], rows: aJobs.slice(0, 8).map((j) => [`${j.service} (${j.date})`, j.customerName, formatINR(j.agentChargePaise), formatINR(j.agentPaidPaise), formatINR(Math.max(0, j.agentChargePaise - j.agentPaidPaise))]) },
      links: [{ label: 'View Agents', path: '/agents' }],
      context: { ...baseCtx, lastAgent: agentName, lastTopic: 'agent' },
    };
  }
  if (/agent/.test(q) && /payable|baaki|dena|kitna/.test(q)) {
    const list = agents.map((a) => ({ name: a.name, payable: agentPayablePaise(a, jobs) })).filter((a) => a.payable > 0).sort((a, b) => b.payable - a.payable);
    const total = agents.reduce((a, ag) => a + agentPayablePaise(ag, jobs), 0);
    if (list.length === 0) {
      return { text: t('Kisi agent ko kuch dena baaki nahi hai — sab clear hai.', 'You owe no agent anything — everything is clear.'), context: { ...baseCtx, lastTopic: 'agent' } };
    }
    return {
      text: t(`Agents ko kul dena baaki hai: ${formatINR(total)}.`, `Total payable to agents: ${formatINR(total)}.`),
      table: { headers: [t('Agent', 'Agent'), t('Payable', 'Payable')], rows: list.map((a) => [a.name, formatINR(a.payable)]) },
      links: [{ label: 'View Agents', path: '/agents' }],
      context: { ...baseCtx, lastAgent: list[0].name, lastTopic: 'agent' },
    };
  }
  if (/agent/.test(q) && /is month|this month|month.*(pay|diya|payment)/.test(q)) {
    const paidThisMonth = txns.filter((x) => x.kind === 'out' && x.category.startsWith('Agent Payment') && x.date.slice(0, 7) === today.slice(0, 7)).reduce((a, x) => a + x.amountPaise, 0);
    return {
      text: t(`Is mahine agents ko kul ${formatINR(paidThisMonth)} payment kiya gaya (Cash/UPI Book ke Agent Payment entries se).`, `This month you paid agents a total of ${formatINR(paidThisMonth)} (from Agent Payment entries in the Cash/UPI Book).`),
      links: [{ label: 'View Agent Payments', path: '/agent-payments' }],
      context: { ...baseCtx, lastTopic: 'agent' },
    };
  }

  // --- Expense questions. ---
  const equipName = findNameIn(q, state.equipment.filter((e) => e.profileId === pid).map((e) => e.name));
  if (equipName && /kharcha|expense|kitna|total/.test(q)) {
    const eq = state.equipment.find((e) => e.profileId === pid && e.name === equipName)!;
    const lifetime = equipmentLifetimeCostPaise(eq.purchaseCostPaise, eq.records);
    const maint = eq.records.reduce((a, r) => a + r.costPaise, 0);
    const linked = expenses.filter((e) => e.equipmentId === eq.id).reduce((a, e) => a + e.amountPaise, 0);
    return {
      text: t(
        `${eq.name}: khareed ${formatINR(eq.purchaseCostPaise)}, maintenance kul ${formatINR(maint)} (${eq.records.length} records), lifetime cost ${formatINR(lifetime)}. Linked expenses: ${formatINR(linked)}.`,
        `${eq.name}: purchase ${formatINR(eq.purchaseCostPaise)}, maintenance total ${formatINR(maint)} (${eq.records.length} records), lifetime cost ${formatINR(lifetime)}. Linked expenses: ${formatINR(linked)}.`,
      ),
      table: { headers: [t('Date', 'Date'), t('Kaam', 'Work'), t('Kharcha', 'Cost')], rows: eq.records.slice(0, 8).map((r) => [r.date, `${r.description}${r.partsReplaced ? ` (${r.partsReplaced})` : ''}`, formatINR(r.costPaise)]) },
      links: [{ label: 'View Machine Maintenance', path: '/machine-maintenance' }],
      context: { ...baseCtx, lastTopic: 'expense' },
    };
  }
  if (/maintenance/.test(q) && /kharcha|expense|kitna/.test(q)) {
    const inR = expenses.filter((e) => e.date >= range.start && e.date <= range.end && /repair|maintenance|servicing|machine/i.test(e.category));
    const total = inR.reduce((a, e) => a + e.amountPaise, 0);
    return {
      text: t(`Machine maintenance par ${range.label} kul kharcha ${formatINR(total)} hua (${inR.length} entries).`, `Machine maintenance cost ${formatINR(total)} in ${range.label} (${inR.length} entries).`),
      links: [{ label: 'View Machine Maintenance', path: '/machine-maintenance' }],
      context: { ...baseCtx, lastTopic: 'expense' },
    };
  }
  if (/sabse zyada.*expense|biggest.*expense|expense.*category|kis.*category/.test(q) || (has(q, /expense|kharcha/) && /sabse|category/.test(q))) {
    const inR = expenses.filter((e) => e.date >= range.start && e.date <= range.end);
    const byCat = new Map<string, number>();
    for (const e of inR) byCat.set(e.category, (byCat.get(e.category) || 0) + e.amountPaise);
    const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
      return { text: t(`${range.label} mein koi kharcha record nahi hai.`, `No expenses are recorded in ${range.label}.`), context: { ...baseCtx, lastTopic: 'expense' } };
    }
    return {
      text: t(`Sabse zyada kharcha ${sorted[0][0]} mein hua: ${formatINR(sorted[0][1])} (${range.label}).`, `The biggest expense category is ${sorted[0][0]}: ${formatINR(sorted[0][1])} (${range.label}).`),
      table: { headers: [t('Category', 'Category'), t('Kharcha', 'Expense')], rows: sorted.slice(0, 5).map(([c, a]) => [c, formatINR(a)]) },
      links: [{ label: 'View Expenses', path: '/expenses' }],
      context: { ...baseCtx, lastTopic: 'expense' },
    };
  }

  // --- Balances / opening / closing. ---
  if (/opening|closing/.test(q) && /balance/.test(q)) {
    const bal = balancesPaise(profile.openingCashPaise, profile.openingUpiPaise, txns);
    return {
      text: t(
        `Opening balance: cash ${formatINR(profile.openingCashPaise)}, UPI ${formatINR(profile.openingUpiPaise)}. Closing (abhi ka) balance: cash ${formatINR(bal.cash)}, UPI ${formatINR(bal.upi)}, kul ${formatINR(bal.cash + bal.upi)}.`,
        `Opening balance: cash ${formatINR(profile.openingCashPaise)}, UPI ${formatINR(profile.openingUpiPaise)}. Closing (current) balance: cash ${formatINR(bal.cash)}, UPI ${formatINR(bal.upi)}, total ${formatINR(bal.cash + bal.upi)}.`,
      ),
      links: [{ label: 'View Cash Book', path: '/cash-book' }],
      context: { ...baseCtx, lastTopic: 'balance' },
    };
  }
  if (/cash.*upi|upi.*cash|difference.*cash/.test(q) && /difference|fark|antar/.test(q)) {
    const bal = balancesPaise(profile.openingCashPaise, profile.openingUpiPaise, txns);
    return {
      text: t(
        `Cash balance ${formatINR(bal.cash)} hai, UPI balance ${formatINR(bal.upi)} hai — fark ${formatINR(Math.abs(bal.cash - bal.upi))} hai (cash ${bal.cash >= bal.upi ? 'zyada' : 'kam'} hai). Kul available ${formatINR(bal.cash + bal.upi)}.`,
        `Cash balance is ${formatINR(bal.cash)}, UPI balance is ${formatINR(bal.upi)} — the difference is ${formatINR(Math.abs(bal.cash - bal.upi))} (cash is ${bal.cash >= bal.upi ? 'higher' : 'lower'}). Total available ${formatINR(bal.cash + bal.upi)}.`,
      ),
      links: [{ label: 'View Difference Finder', path: '/difference-finder' }],
      context: { ...baseCtx, lastTopic: 'balance' },
    };
  }

  // --- Daily business summary (today / yesterday / month). ---
  if (/dhandha|business|hisab|summary|kamai|earning|collection/.test(q) && !service) {
    const s = dailyBusinessSummary(dailyInput(state, pid, range.start, range.end));
    if (!hasAny) {
      return { text: t('Abhi koi record nahi hai — isliye main aaj ka dhandha nahi bata sakta. Pehle ek entry add karo.', 'There are no records yet, so I cannot report today\u2019s business. Add an entry first.'), context: { ...baseCtx, lastPeriodKey: range.key, lastTopic: 'daily' } };
    }
    const top = s.byService[0];
    return {
      text: tt('overview',
        { income: formatINR(s.totalCollection), expense: formatINR(s.expenses), profit: formatINR(s.netEarnings), due: formatINR(s.customerDue), agent: formatINR(agents.reduce((a, ag) => a + agentPayablePaise(ag, jobs), 0)), commission: formatINR(s.mtCommission), cash: formatINR(s.cashCollection), upi: formatINR(s.upiCollection) },
        `${range.label} ka dhandha:\n• Collection: ${formatINR(s.totalCollection)} (cash ${formatINR(s.cashCollection)}, UPI ${formatINR(s.upiCollection)})\n• MT commission: ${formatINR(s.mtCommission)}\n• Kharcha: ${formatINR(s.expenses)}\n• Net earnings: ${formatINR(s.netEarnings)}\n• Customer due: ${formatINR(s.customerDue)}\n• Transactions: ${s.totalTransactions}${top ? `\n• Sabse zyada earning: ${top.service} — ${formatINR(top.collection)}` : ''}`,
        `Business for ${range.label}:\n• Collection: ${formatINR(s.totalCollection)} (cash ${formatINR(s.cashCollection)}, UPI ${formatINR(s.upiCollection)})\n• MT commission: ${formatINR(s.mtCommission)}\n• Expenses: ${formatINR(s.expenses)}\n• Net earnings: ${formatINR(s.netEarnings)}\n• Customer due: ${formatINR(s.customerDue)}\n• Transactions: ${s.totalTransactions}${top ? `\n• Top earning service: ${top.service} — ${formatINR(top.collection)}` : ''}`,
      ),
      table: s.byService.length > 1 ? { headers: [t('Service', 'Service'), t('Collection', 'Collection'), t('Cash', 'Cash'), t('UPI', 'UPI')], rows: s.byService.map((x) => [x.service, formatINR(x.collection), formatINR(x.cash), formatINR(x.upi)]) } : undefined,
      links: [{ label: 'View Daily Business', path: '/daily-business' }],
      context: { ...baseCtx, lastPeriodKey: range.key, lastTopic: 'daily', lastService: top?.service },
    };
  }

  // --- Profit (month / today). ---
  // Use the SAME Daily Business hub figures as the Dashboard and the
  // factual responder (jobs + quick daily entries + MT commission, never
  // double-counted) — job-only profit would wrongly report ₹0 after
  // real daily entries were saved through the chat.
  if (/profit|munafa|faayda/.test(q)) {
    const hub = dailyBusinessSummary(dailyInput(state, pid, range.start, range.end));
    const profit = hub.netEarnings;
    const received = hub.totalCollection;
    const mtP = hub.mtCommission;
    const inE = expenses.filter((e) => e.date >= range.start && e.date <= range.end);
    return {
      text: tt('profit',
        { profit: formatINR(profit), income: formatINR(received), expense: formatINR(inE.reduce((a, e) => a + e.amountPaise, 0)), monthProfit: formatINR(profit) },
        `${range.label} ka profit ${formatINR(profit)} hai. Calculation: collection ${formatINR(received)} (is me MT commission ${formatINR(mtP)} shamil hai) − agent charges − kharcha ${formatINR(inE.reduce((a, e) => a + e.amountPaise, 0))}. (Sirf mila hua paisa income hai — due/billing nahi.)`,
        `Profit for ${range.label} is ${formatINR(profit)}. Calculation: collection ${formatINR(received)} (including MT commission ${formatINR(mtP)}) − agent charges − expenses ${formatINR(inE.reduce((a, e) => a + e.amountPaise, 0))}. (Only money actually received counts as income — not billing/due.)`,
      ),
      links: [{ label: 'View Profit Report', path: '/reports/profit' }],
      context: { ...baseCtx, lastPeriodKey: range.key, lastTopic: 'profit' },
    };
  }

  // --- Business analysis: mistakes / unusual differences / overdue. ---
  if (/galti|mistake|check.*hisab|hisab.*check|gadbad|unusual|overdue|delay/.test(q)) {
    const issues: string[] = [];
    const overdue = jobs.filter((j) => jobDuePaise(j) > 0 && j.date < shiftISO(today, -30));
    if (overdue.length > 0) issues.push(t(`${overdue.length} job ka due 30 din se zyada purana hai (kul ${formatINR(overdue.reduce((a, j) => a + jobDuePaise(j), 0))}) — payment follow-up karo.`, `${overdue.length} jobs have dues older than 30 days (total ${formatINR(overdue.reduce((a, j) => a + jobDuePaise(j), 0))}) — follow up for payment.`));
    const closing = mtClosingPaise(0, 0, state.mtFunds.filter((f) => f.profileId === pid), mtT, mtE);
    if (closing.total < 0) issues.push(t(`Money Transfer closing negative hai (${formatINR(closing.total)}) — fund ya transfer mein galti ho sakti hai.`, `Money Transfer closing is negative (${formatINR(closing.total)}) — there may be an error in funds or transfers.`));
    const bal = balancesPaise(profile.openingCashPaise, profile.openingUpiPaise, txns);
    if (bal.cash < 0 || bal.upi < 0) issues.push(t(`Cash/UPI balance negative hai (cash ${formatINR(bal.cash)}, UPI ${formatINR(bal.upi)}) — koi entry galat ho sakti hai.`, `Cash/UPI balance is negative (cash ${formatINR(bal.cash)}, UPI ${formatINR(bal.upi)}) — an entry may be wrong.`));
    // Possible duplicate same-day entries (same service + amount + method).
    const seen = new Map<string, number>();
    for (const e of state.dailyEntries.filter((x) => x.profileId === pid)) {
      const k = `${e.date}|${e.service}|${e.totalPaise}|${e.method}`;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    const dups = [...seen.entries()].filter(([, n]) => n > 1);
    if (dups.length > 0) issues.push(t(`${dups.length} jagah ek hi din mein ek hi service/amount/mode ki duplicate jaisi entries hain — Difference Finder se verify karo.`, `There are ${dups.length} possible duplicate entries (same day, service, amount and mode) — verify with the Difference Finder.`));
    if (issues.length === 0) {
      return {
        text: t('Hisab check kiya — koi badi gadbad nahi mili: koi 30+ din purana due nahi, MT closing negative nahi, Cash/UPI balance negative nahi, aur koi clear duplicate entry nahi. Ye ek basic check hai, poori audit nahi.', 'I checked the books — no major problem found: no dues older than 30 days, MT closing is not negative, Cash/UPI balances are not negative, and no clear duplicate entries. This is a basic check, not a full audit.'),
        links: [{ label: 'Open Difference Finder', path: '/difference-finder' }],
        context: { ...baseCtx, lastTopic: 'analysis' },
      };
    }
    return {
      text: t(`Hisab mein ye cheezein dhyaan dene layak hain (facts — suggestions nahi):\n${issues.map((i) => `• ${i}`).join('\n')}`, `These items in the books deserve attention (facts, not suggestions):\n${issues.map((i) => `• ${i}`).join('\n')}`),
      links: [{ label: 'Open Difference Finder', path: '/difference-finder' }],
      context: { ...baseCtx, lastTopic: 'analysis' },
    };
  }

  // --- Profile / settings info. ---
  if (/business.*(info|profile|naam|category)|mera business|profile.*(kya|batao)/.test(q)) {
    return {
      text: t(
        `Business: ${profile.name} (${profile.category}). Services: ${profile.services.join(', ')}. Address: ${profile.address || '—'}. Mobile: ${profile.mobile || '—'}. Language: ${profile.language}. Receipt prefix: ${profile.receiptPrefix}.`,
        `Business: ${profile.name} (${profile.category}). Services: ${profile.services.join(', ')}. Address: ${profile.address || '—'}. Mobile: ${profile.mobile || '—'}. Language: ${profile.language}. Receipt prefix: ${profile.receiptPrefix}.`,
      ),
      links: [{ label: 'Open Business Settings', path: '/settings/business' }],
      context: { ...baseCtx, lastTopic: 'profile' },
    };
  }
  if (/kitne (receipt|documents|jobs)|receipt.*kitne|document.*kitne/.test(q)) {
    const docs = state.docs.filter((d) => d.profileId === pid);
    const receipts = state.receipts.filter((r) => r.profileId === pid);
    return {
      text: t(
        `Is profile mein: ${jobs.length} jobs, ${customers.length} customers, ${agents.length} agents, ${receipts.length} receipts, ${docs.length} documents saved hain.`,
        `In this profile: ${jobs.length} jobs, ${customers.length} customers, ${agents.length} agents, ${receipts.length} receipts, ${docs.length} documents saved.`,
      ),
      links: [{ label: 'View Receipts', path: '/receipts' }],
      context: { ...baseCtx, lastTopic: 'counts' },
    };
  }

  return null;
}
