/**
 * BizKhata chatbot — factual answers from the REAL ledgers.
 *
 * Every figure quoted comes from computeFacts() (integer paise, same
 * accounting engine as the rest of the app). The built-in BizKhata AI
 * responder works with no key and no third-party service at all; it
 * never invents numbers. With no data, it says so plainly — never demo
 * numbers.
 */
import {
  agentPayablePaise,
  balancesPaise,
  dailyBusinessSummary,
  jobDuePaise,
  mtProfitPaise,
  netProfitPaise,
  totalCustomerDuePaise,
} from './accounting';
import { formatINR } from './money';
import { todayISO } from './types';
import type { AppState, BusinessProfile, Method } from './types';
import type { AssistantAction, FoundRecord } from './assistant';
import { findAssistantTargets } from './assistant';
import type { ChatContext } from './knowledge';
import { detectLanguage, normalizeDigitsMultilingual, normalizeMultilingual, replyIn, resolveReplyLang, type AiLangCode, type ReplyKey } from './languages';
import { SERVICE_ALIASES, findNameIn, findServiceIn, normalizeDevanagariWords, parseDateRange } from './knowledge';
import { isPlanOrStatement } from './intent';

export interface DueEntry {
  name: string;
  duePaise: number;
}

export interface BusinessFacts {
  today: string;
  todayIncomePaise: number;
  todayExpensePaise: number;
  todayProfitPaise: number;
  monthIncomePaise: number;
  monthExpensePaise: number;
  monthProfitPaise: number;
  cashPaise: number;
  upiPaise: number;
  customerDuePaise: number;
  topDues: DueEntry[];
  agentPayablePaise: number;
  agentDues: DueEntry[];
  mtTodayTransfers: number;
  mtTodaySentPaise: number;
  mtTodayCommissionPaise: number;
  mtTodayProfitPaise: number;
  mtPending: number;
  totalCustomers: number;
  totalJobs: number;
  totalAgents: number;
  hasData: boolean;
  /** Today's collection + top service, from the Daily Business hub
   *  (jobs + quick entries + MT commission, never double-counted). */
  todayCollectionPaise: number;
  todayCashPaise: number;
  todayUpiPaise: number;
  topServiceToday: { service: string; collectionPaise: number } | null;
  todayJobs: number;
}

export function computeFacts(state: AppState, profile: BusinessProfile): BusinessFacts {
  const pid = profile.id;
  const today = todayISO();
  const month = today.slice(0, 7);
  const jobs = state.jobs.filter((j) => j.profileId === pid);
  const expenses = state.expenses.filter((e) => e.profileId === pid);
  const txns = state.cashTxns.filter((x) => x.profileId === pid);
  const mtT = state.mtTransfers.filter((m) => m.profileId === pid);
  const mtE = state.mtExpenses.filter((m) => m.profileId === pid);
  const agents = state.agents.filter((a) => a.profileId === pid);

  const inDay = (d: string) => d === today;
  const inMonth = (d: string) => d.slice(0, 7) === month;
  const dayJobs = jobs.filter((j) => inDay(j.date));
  const monthJobs = jobs.filter((j) => inMonth(j.date));
  const dayExp = expenses.filter((e) => inDay(e.date));
  const monthExp = expenses.filter((e) => inMonth(e.date));
  const dayMt = mtT.filter((m) => inDay(m.date));
  const monthMt = mtT.filter((m) => inMonth(m.date));
  const dayMtE = mtE.filter((m) => inDay(m.date));
  const monthMtE = mtE.filter((m) => inMonth(m.date));

  const bal = balancesPaise(profile.openingCashPaise, profile.openingUpiPaise, txns);
  const due = totalCustomerDuePaise(jobs);
  const topDues: DueEntry[] = jobs
    .map((j) => ({ name: j.customerName, duePaise: jobDuePaise(j) }))
    .filter((d) => d.duePaise > 0)
    .sort((a, b) => b.duePaise - a.duePaise)
    .slice(0, 5);
  const agentDues: DueEntry[] = agents
    .map((a) => ({ name: a.name, duePaise: agentPayablePaise(a, jobs) }))
    .filter((d) => d.duePaise > 0)
    .sort((a, b) => b.duePaise - a.duePaise);

  // Today's Daily Business hub figures (jobs + quick entries + MT
  // commission, never double-counted) — for "aaj ka dhandha" answers.
  // The chat's income/profit answers use the SAME hub figures as the
  // Dashboard Net Profit and the Daily Business page, so the assistant
  // never quotes a different profit than the screen shows.
  const hub = dailyBusinessSummary({
    start: today,
    end: today,
    jobs,
    cashTxns: txns,
    dailyEntries: state.dailyEntries.filter((x) => x.profileId === pid),
    expenses,
    mtTransfers: mtT,
    mtExpenses: mtE,
  });
  const monthHub = dailyBusinessSummary({
    start: `${month}-01`,
    end: today,
    jobs,
    cashTxns: txns,
    dailyEntries: state.dailyEntries.filter((x) => x.profileId === pid),
    expenses,
    mtTransfers: mtT,
    mtExpenses: mtE,
  });

  return {
    today,
    todayIncomePaise: hub.totalCollection,
    todayExpensePaise: hub.expenses,
    todayProfitPaise: hub.netEarnings,
    monthIncomePaise: monthHub.totalCollection,
    monthExpensePaise: monthHub.expenses,
    monthProfitPaise: monthHub.netEarnings,
    cashPaise: bal.cash,
    upiPaise: bal.upi,
    customerDuePaise: due,
    topDues,
    agentPayablePaise: agents.reduce((s, a) => s + agentPayablePaise(a, jobs), 0),
    agentDues,
    mtTodayTransfers: dayMt.filter((m) => m.status !== 'Failed').length,
    mtTodaySentPaise: dayMt.filter((m) => m.status !== 'Failed').reduce((s, m) => s + m.amountPaise, 0),
    mtTodayCommissionPaise: dayMt.filter((m) => m.status !== 'Failed').reduce((s, m) => s + m.commissionPaise, 0),
    mtTodayProfitPaise: mtProfitPaise(dayMt, dayMtE),
    mtPending: mtT.filter((m) => m.status === 'Pending').length,
    totalCustomers: state.customers.filter((c) => c.profileId === pid).length,
    totalJobs: jobs.length,
    totalAgents: agents.length,
    hasData: jobs.length > 0 || expenses.length > 0 || txns.length > 0 || mtT.length > 0,
    todayCollectionPaise: hub.totalCollection,
    todayCashPaise: hub.cashCollection,
    todayUpiPaise: hub.upiCollection,
    topServiceToday: hub.byService.length > 0
      ? { service: hub.byService[0].service, collectionPaise: hub.byService[0].collection }
      : null,
    todayJobs: dayJobs.length,
  };
}

/** Plain-text facts (paise) for the built-in AI answer. */
export function factsSummary(f: BusinessFacts): string {
  return [
    `Today (${f.today}): income received ${f.todayIncomePaise} paise, expenses ${f.todayExpensePaise} paise, net profit ${f.todayProfitPaise} paise.`,
    `This month: income ${f.monthIncomePaise} paise, expenses ${f.monthExpensePaise} paise, net profit ${f.monthProfitPaise} paise.`,
    `Cash balance ${f.cashPaise} paise, UPI balance ${f.upiPaise} paise.`,
    `Total customer due ${f.customerDuePaise} paise. Top dues: ${f.topDues.map((d) => `${d.name} ${d.duePaise}`).join(', ') || 'none'}.`,
    `Total agent payable ${f.agentPayablePaise} paise. Per agent: ${f.agentDues.map((d) => `${d.name} ${d.duePaise}`).join(', ') || 'none'}.`,
    `Money Transfer today: ${f.mtTodayTransfers} transfers, sent ${f.mtTodaySentPaise} paise, commission ${f.mtTodayCommissionPaise} paise, MT profit ${f.mtTodayProfitPaise} paise, ${f.mtPending} pending.`,
    `Today's collection (Daily Business hub): ${f.todayCollectionPaise} paise (cash ${f.todayCashPaise}, UPI ${f.todayUpiPaise}). Top service today: ${f.topServiceToday ? `${f.topServiceToday.service} ${f.topServiceToday.collectionPaise}` : 'none'}. Jobs today: ${f.todayJobs}.`,
    `Customers ${f.totalCustomers}, jobs ${f.totalJobs}, agents ${f.totalAgents}.`,
    '100 paise = 1 rupee. Only use these figures.',
  ].join('\n');
}

/** Hinglish (Devanagari or Hinglish words) vs English. */
export function detectLang(q: string): 'hi' | 'en' {
  const det = detectLanguage(q);
  return det.code === 'en' ? 'en' : 'hi';
}

/** Full multilingual reply language for a message (23 languages). */
export function detectReplyLang(q: string, preferred?: AiLangCode | 'auto' | null): AiLangCode {
  return resolveReplyLang(q, preferred);
}

/** Localised clarification question, in the user's own language/style. */
function askIn(original: string, key: ReplyKey, values: Record<string, string | number> = {}): string {
  return replyIn(detectReplyLang(original), key, values);
}

export type ChatIntent =
  | 'profit' | 'income' | 'expenses' | 'due' | 'agents' | 'mt'
  | 'balance' | 'overview' | 'help' | 'greeting' | 'unknown';

function has(q: string, re: RegExp): boolean {
  return re.test(q);
}

/** Built-in factual responder — every figure comes from the real ledgers. */
export function answerLocally(question: string, f: BusinessFacts, preferred?: AiLangCode | 'auto' | null): { intent: ChatIntent; text: string } {
  const lang = detectReplyLang(question, preferred);
  const q = normalizeMultilingual(question.toLowerCase());
  const noData = !f.hasData;

  const t = (key: ReplyKey, values: Record<string, string | number> = {}) => replyIn(lang, key, values);

  // Greeting / help first (they contain no figures). The greeting
  // regex matches ANYWHERE in the message (not just at the start) and
  // includes "kaise ho" — the UPDATE 14 bug was a start-anchored
  // regex that missed "Kaise Ho Bhai". (The unified router in
  // intent.ts normally answers casual messages before this runs.)
  if (has(q, /\b(hi|hii+|hello|hey|namaste|namaskar|ram\s*ram|good\s(morning|afternoon|evening)|salaam|adaab|vanakkam|namaskaram|sat\s*sri\s*akal|johar|khurumjari|namaskara)\b|kaise ho|how are you|kem cho/)) {
    return { intent: 'greeting', text: t('greeting') };
  }
  if (has(q, /help|madad|kya kar sakte|what can you|kaise (use|kaam)|how (to|do)/)) {
    return { intent: 'help', text: t('help') };
  }

  // UPDATE 14: no blanket no-data reply any more. Profit / income /
  // expense / balance / overview quote the REAL figure — ₹0.00 on an
  // empty store is an honest figure, not "no data". The noData text is
  // used only for the final unknown fallback below.

  // Agent payable (check before customer due — both mention "dena").
  if (has(q, /agent/)) {
    if (f.agentPayablePaise <= 0) {
      return { intent: 'agents', text: t('agentNone') };
    }
    const lines = f.agentDues.map((d) => `• ${d.name} — ${formatINR(d.duePaise)}`).join('\n');
    return { intent: 'agents', text: t('agent', { due: formatINR(f.agentPayablePaise), lines }) };
  }

  // Money Transfer (check before income — "commission" is MT-only profit).
  if (has(q, /money transfer|\bmt\b|commission/)) {
    if (f.mtTodayTransfers === 0 && f.mtPending === 0) {
      return { intent: 'mt', text: t('mtNone') };
    }
    return {
      intent: 'mt',
      text: t('mt', { count: f.mtTodayTransfers, sent: formatINR(f.mtTodaySentPaise), commission: formatINR(f.mtTodayCommissionPaise), profit: formatINR(f.mtTodayProfitPaise), pending: f.mtPending }),
    };
  }

  // Profit.
  if (has(q, /profit|munafa|faayda|fayda/)) {
    return { intent: 'profit', text: t('profit', { profit: formatINR(f.todayProfitPaise), income: formatINR(f.todayIncomePaise), expense: formatINR(f.todayExpensePaise), monthProfit: formatINR(f.monthProfitPaise) }) };
  }

  // Income.
  if (has(q, /income|kamai|received|collection|aaya|mila/)) {
    return { intent: 'income', text: t('income', { income: formatINR(f.todayIncomePaise), monthIncome: formatINR(f.monthIncomePaise) }) };
  }

  // Expenses.
  if (has(q, /expense|kharcha|kharach|spend/)) {
    return { intent: 'expenses', text: t('expense', { expense: formatINR(f.todayExpensePaise), monthExpense: formatINR(f.monthExpensePaise) }) };
  }

  // Customer due.
  if (has(q, /due|udhaar|udhar|baaki|baki|dena|owe|owes|collect|pending|kisne|kaun/)) {
    if (f.customerDuePaise <= 0) {
      return { intent: 'due', text: t('dueNone') };
    }
    const lines = f.topDues.map((d) => `• ${d.name} — ${formatINR(d.duePaise)}`).join('\n');
    return { intent: 'due', text: t('due', { due: formatINR(f.customerDuePaise), lines }) };
  }

  // Balances.
  if (has(q, /balance|cash|upi|kitne paise (hai|bache)|available/)) {
    return { intent: 'balance', text: t('balance', { cash: formatINR(f.cashPaise), upi: formatINR(f.upiPaise), total: formatINR(f.cashPaise + f.upiPaise) }) };
  }

  // Overview / summary.
  if (has(q, /overview|summary|haal|hisab|dhandha|total|report|sab kuch|kul|aaj ka (kya|kaise)|today/)) {
    return {
      intent: 'overview',
      text: t('overview', { income: formatINR(f.todayIncomePaise), expense: formatINR(f.todayExpensePaise), profit: formatINR(f.todayProfitPaise), due: formatINR(f.customerDuePaise), agent: formatINR(f.agentPayablePaise), commission: formatINR(f.mtTodayCommissionPaise), cash: formatINR(f.cashPaise), upi: formatINR(f.upiPaise) }),
    };
  }

  // Unknown question: with no data at all, say so plainly; with data,
  // point at what the assistant can answer.
  return { intent: 'unknown', text: noData ? t('noData') : t('unknown') };
}

/* ================= Natural-language action parsing =================
 *
 * Turns an ordinary Hinglish/English/Hindi message into a structured
 * AssistantAction (or a clarification request). Accuracy first: the
 * parser NEVER invents a payment mode, service, date, customer/agent
 * identity, amount or classification — anything it cannot determine
 * reliably comes back as a `draft` with a short question, and the chat
 * UI asks the user instead of guessing.
 */

// Devanagari + all supported scripts' digits live in languages.ts.
export function normalizeDigits(text: string): string {
  return normalizeDigitsMultilingual(text);
}

const HINDI_NUMBERS: Record<string, number> = {
  ek: 1, do: 2, teen: 3, chaar: 4, paanch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
  bees: 20, tees: 30, chalees: 40, pachaas: 50, pachas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90,
};

/** Replace Hindi number words ("do sau", "paanch hazaar") with digits. */
export function normalizeNumberWords(text: string): string {
  return normalizeMultilingual(text);
}

export interface FoundAmount {
  paise: number;
  index: number;
}

/**
 * Extract money amounts from a message (integer paise). Skips 10-digit
 * mobile numbers, years and date parts so they are never mistaken for
 * money. Amounts must look like money: a currency word nearby, or a
 * plain number in a money context (cash/upi/kharcha/diye/mila/hua...).
 */
export function extractAmounts(raw: string): FoundAmount[] {
  const text = normalizeNumberWords(raw);
  const out: FoundAmount[] = [];
  const re = /(\d[\d,]*\.?\d*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const digits = m[1].replace(/,/g, '');
    if (digits.length >= 10) continue; // mobile number, not money
    if (/^\d{4}$/.test(digits) && Number(digits) >= 1900 && Number(digits) <= 2100) continue; // year
    // Part of a date (25/11/2026) — day/month are not money.
    if (text[m.index - 1] === '/' || text[m.index + m[0].length] === '/') continue;
    const before = text.slice(Math.max(0, m.index - 14), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 14);
    const near = `${before} ${after}`.toLowerCase();
    // A count, not money: "5 customers", "10 pages", "3 copies",
    // "5 applications" (PAN Card applications to do — not ₹5).
    if (/^\s*(customers?|clients?|pages?|copies|photos?|jobs?|log|pieces?|items?|applications?|forms?)\b/.test(after.toLowerCase())) continue;
    const moneyWord = /(₹|rs\.?|rupees?|rupaye|rupay|paise|paisa|cash|upi|nagad|kharcha|kharach|diye|diya|mila|mile|hua|hue|hoga|payment|transfer|commission|bill|due|udhaar|udhar|bheja|bheje|add|aur)\b/.test(near);
    if (!moneyWord && Number(digits) > 100000) continue;
    const value = parseFloat(digits);
    if (!Number.isFinite(value) || value <= 0) continue;
    out.push({ paise: Math.round(value * 100), index: m.index });
  }
  return out;
}

export type PayMethod = 'cash' | 'upi' | 'other';

export function extractMethod(segment: string): PayMethod | null {
  const s = segment.toLowerCase();
  if (/\b(upi|online|gpay|google\s*pay|phonepe|paytm|bhim|qr)\b/.test(s)) return 'upi';
  if (/\b(cash|nagad|nakad|nakdi|nakad)\b/.test(s)) return 'cash';
  if (/\b(udhaar|udhar|due|credit|baad\s*mein|baaki|baki|pending)\b/.test(s)) return 'other';
  return null;
}

/**
 * Payment mode nearest to one amount inside a segment ("Xerox 300 cash,
 * 200 UPI": 300 is cash, 200 is UPI). Prefers the mode word right after
 * the amount, else the closest one before it.
 */
export function methodNear(text: string, amountIndex: number, amountLen: number, nextAmountIndex?: number): PayMethod | null {
  const after = text.slice(amountIndex + amountLen, nextAmountIndex ?? text.length);
  const before = text.slice(0, amountIndex);
  const pick = (s: string): PayMethod | null => {
    const m = s.match(/\b(upi|online|gpay|google\s*pay|phonepe|paytm|bhim|cash|nagad|udhaar|udhar|due|credit)\b/);
    return m ? extractMethod(m[0]) : null;
  };
  const afterHit = pick(after);
  if (afterHit) return afterHit;
  const beforeWords = before.match(/\b(upi|online|gpay|google\s*pay|phonepe|paytm|bhim|cash|nagad|udhaar|udhar|due|credit)\b/g);
  if (beforeWords && beforeWords.length > 0) return extractMethod(beforeWords[beforeWords.length - 1]);
  return null;
}

/** Expense-category hint from the message ("Machine Repair 200 ..."). */
export function expenseCategoryHint(text: string): string | null {
  const s = text.toLowerCase();
  for (const m of EXPENSE_CATEGORY_MAP) {
    if (m.re.test(s)) return m.category;
  }
  return null;
}

/** Narrow a parsed payment mode to Cash/UPI for money-movement actions
 *  (refund, MT fund/transfer, agent/customer payment, expense).
 *  'other' (udhaar/due) is not a way to move money, so the module default
 *  applies — and the action preview always shows the method, so the user
 *  sees it and can cancel before anything is saved. */
export function cashUpiMethod(m: PayMethod | null, fallback: Method): Method {
  return m === 'cash' || m === 'upi' ? m : fallback;
}

/** Date words: "kal" = yesterday, explicit dd/mm/yyyy, else today. */
export function extractDate(raw: string, today: string = todayISO()): string {
  const s = normalizeMultilingual(raw.toLowerCase());
  const dm = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dm) {
    const y = dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3]);
    const iso = `${y}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && iso <= today) return iso;
  }
  if (/\b(kal|yesterday)\b/.test(s)) {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return today;
}

export interface ActionDraft {
  /** Which field is missing: 'method' | 'service' | 'amount' | 'agent' | 'customer' | 'target' | 'commission'. */
  missing: string;
  question: string;
  /** Partial action being built (fields filled so far). */
  partial: Record<string, unknown>;
  /** Original user text, for context. */
  original: string;
}

export type ParsedMessage =
  | { kind: 'confirm' }
  | { kind: 'cancel' }
  | { kind: 'action'; action: AssistantAction; previewLines: string[]; totalPaise: number; duplicateWarning?: string }
  | { kind: 'draft'; draft: ActionDraft }
  | { kind: 'question' }
  | { kind: 'error'; text: string };

function draftFor(missing: string, question: string, partial: Record<string, unknown>, original: string): ParsedMessage {
  return { kind: 'draft', draft: { missing, question, partial, original } };
}

const EXPENSE_CATEGORY_MAP: { re: RegExp; category: string }[] = [
  { re: /machine\s*repair|printer\s*repair|machine.*repair|repair.*machine/, category: 'Machine Repair' },
  { re: /printer.*(repair|kharab)|epson|kyocera/, category: 'Printer Repair' },
  { re: /servicing|service.*machine/, category: 'Servicing' },
  { re: /bijli|electricity|light\s*bill/, category: 'Electricity' },
  { re: /internet|wifi|broadband/, category: 'Internet' },
  { re: /kagaz|paper/, category: 'Paper' },
  { re: /\bink\b/, category: 'Ink' },
  { re: /toner/, category: 'Toner' },
  { re: /cartridge/, category: 'Cartridge' },
  { re: /kiraya|rent/, category: 'Rent' },
  { re: /chai|khana|food|tea/, category: 'Other' },
  { re: /transport|petrol|diesel|travel/, category: 'Transport' },
  { re: /staff|sallery|salary|vetan/, category: 'Staff' },
];

function expenseCategoryFor(text: string, profile: BusinessProfile): string {
  const s = text.toLowerCase();
  for (const m of EXPENSE_CATEGORY_MAP) {
    if (m.re.test(s) && profile.expenseCategories.includes(m.category)) return m.category;
  }
  for (const m of EXPENSE_CATEGORY_MAP) {
    if (m.re.test(s)) return m.category;
  }
  return 'Other';
}

function money(n: number): string {
  return formatINR(n);
}

/** Split "Xerox 300 cash, 200 UPI aur Smart Card 500 cash" into segments. */
function splitServiceSegments(text: string, services: string[]): { service: string | null; text: string; index: number }[] {
  const lower = text.toLowerCase();
  const hits: { service: string; index: number }[] = [];
  for (const svc of services) {
    const aliases = [svc.toLowerCase(), ...(SERVICE_ALIASES[svc] || [])];
    for (const a of aliases) {
      if (!a) continue;
      let i = lower.indexOf(a);
      while (i >= 0) {
        // Whole-word-ish: alias must not be part of a longer word
        // ("printer" is not "print").
        const beforeOk = i === 0 || !/[a-z0-9]/.test(lower[i - 1]);
        const afterOk = i + a.length >= lower.length || !/[a-z0-9]/.test(lower[i + a.length]);
        if (beforeOk && afterOk) hits.push({ service: svc, index: i });
        i = lower.indexOf(a, i + 1);
      }
    }
  }
  hits.sort((a, b) => a.index - b.index);
  if (hits.length === 0) return [{ service: null, text, index: 0 }];
  const segments: { service: string | null; text: string; index: number }[] = [];
  for (let k = 0; k < hits.length; k++) {
    const start = hits[k].index;
    const end = k + 1 < hits.length ? hits[k + 1].index : text.length;
    // Amounts/method words BEFORE the first service word belong to it
    // ("500 rupaye UPI se printing hui").
    const prefix = k === 0 && start > 0 ? text.slice(0, start) : '';
    segments.push({ service: hits[k].service, text: prefix + text.slice(start, end), index: start });
  }
  return segments;
}

/**
 * Check whether a daily-income/expense action would duplicate a record
 * that already exists today. This only WARNS — two legitimate identical
 * transactions are still allowed after explicit confirmation.
 */
export function findDuplicateWarning(state: AppState, profileId: string, action: AssistantAction): string | null {
  const today = todayISO();
  if (action.kind === 'daily_income') {
    for (const e of action.entries) {
      const dup = state.dailyEntries.find(
        (x) => x.profileId === profileId && x.date === (action.date || today) && x.service === e.service && x.totalPaise === e.amountPaise && x.method === e.method,
      );
      if (dup) return `⚠ Aaj ${e.service} ${money(e.amountPaise)} (${e.method.toUpperCase()}) ki entry pehle se saved hai. Agar ye alag transaction hai to Confirm dabao — warna Cancel karo.`;
    }
  }
  if (action.kind === 'expense') {
    const dup = state.expenses.find(
      (x) => x.profileId === profileId && x.date === (action.date || today) && x.category === action.category && x.amountPaise === action.amountPaise,
    );
    if (dup) return `⚠ Aaj ${action.category} ${money(action.amountPaise)} ka kharcha pehle se saved hai. Agar ye alag kharcha hai to Confirm dabao — warna Cancel karo.`;
  }
  return null;
}

/** Parse one user message into an action, a clarification draft, or a question. */
export function parseAssistantMessage(
  rawText: string,
  state: AppState,
  profile: BusinessProfile,
  ctx: ChatContext = {},
): ParsedMessage {
  const text = normalizeNumberWords(rawText.trim());
  const q = text.toLowerCase();
  const today = todayISO();
  const amounts = extractAmounts(rawText);
  const date = extractDate(rawText, today);

  // --- Confirm / cancel (handled by the chat UI's pending action). ---
  if (/^(haan|ha+|yes|yep|confirm|save|kar\s*do|karo|theek\s*hai|ok+|save\s*kar|confirm\s*kar|bilkul|ji\s*haan)\b/.test(q)) return { kind: 'confirm' };
  if (/^(nahi|nahin|no|cancel|mat\s*karo|rehne\s*do|chhodo|ruk[o]?|cancel\s*kar)\b/.test(q)) return { kind: 'cancel' };

  // --- UPDATE 15 plan guard: a statement/plan (future work, no
  // amount, no money question) is NEVER a financial action and must
  // never be answered with a money question. Return 'question' so the
  // conversation router answers it as a plan ("Mujhe kal PAN Card
  // banane hai" → plan acknowledgement, NOT "kitne rupaye hue?").
  if (isPlanOrStatement(rawText)) return { kind: 'question' };

  // --- Correction: "Xerox 300 galat tha, 250 hona chahiye". ---
  if (/galat|wrong|correct|sahi|badal|theek\s*karo|galti/.test(q) && amounts.length >= 1) {
    const oldAmt = amounts[0].paise;
    const newAmt = amounts.length >= 2 ? amounts[1].paise : undefined;
    const svc = findServiceIn(q, profile.services);
    const targets = findAssistantTargets(state, profile.id, { amountPaise: oldAmt, text: svc || expenseCategoryHint(q) || undefined, date: /aaj|kal/.test(q) ? date : undefined }).filter((t): t is FoundRecord & { kind: 'daily' | 'job' | 'expense' | 'mt' } => t.kind !== 'txn');
    if (targets.length === 0) {
      return { kind: 'error', text: `Mujhe ${money(oldAmt)} ki koi entry nahi mili jo correct kar sakun. Entry ka service aur date batao (jaise: "Aaj Xerox 300 galat tha").` };
    }
    if (targets.length > 1) {
      return draftFor('target', `₹${oldAmt / 100} ki ${targets.length} entries mili — kaunsi correct karni hai?\n${targets.map((t, i) => `${i + 1}. ${t.label} (${t.date})`).join('\n')}`, { targets, newAmountPaise: newAmt }, rawText);
    }
    if (!newAmt) {
      return draftFor('amount', `${targets[0].label} — sahi amount kitna hona chahiye?`, { target: targets[0] }, rawText);
    }
    const t0 = targets[0];
    const action: AssistantAction = { kind: 'correct_entry', targetKind: t0.kind, targetId: t0.id, label: t0.label, oldAmountPaise: t0.amountPaise, newAmountPaise: newAmt };
    return { kind: 'action', action, previewLines: [`Correct: ${t0.label}`, `Naya amount: ${money(newAmt)} (pehle ${money(t0.amountPaise)})`], totalPaise: newAmt };
  }

  // --- Delete: "Xerox 300 wali entry delete kar do". ---
  if (/delete|hata|remove|delete\s*kar|mita/.test(q) && amounts.length >= 1) {
    const amt = amounts[0].paise;
    const svc = findServiceIn(q, profile.services);
    const targets = findAssistantTargets(state, profile.id, { amountPaise: amt, text: svc || expenseCategoryHint(q) || undefined });
    if (targets.length === 0) {
      return { kind: 'error', text: `Mujhe ${money(amt)} ki koi entry nahi mili jo delete kar sakun. Service aur date batao.` };
    }
    if (targets.length > 1) {
      return draftFor('target', `${targets.length} entries mili — kaunsi delete karni hai?\n${targets.map((t, i) => `${i + 1}. ${t.label} (${t.date})`).join('\n')}`, { targets }, rawText);
    }
    const t0 = targets[0];
    const action: AssistantAction = { kind: 'delete_entry', targetKind: t0.kind, targetId: t0.id, label: t0.label };
    return { kind: 'action', action, previewLines: [`Delete: ${t0.label} (${t0.date})`, 'Ye entry Recycle Bin mein jayegi — wahan se restore bhi ho sakti hai.'], totalPaise: 0 };
  }

  // --- Refund: "Rahul ko 200 refund karna hai". ---
  if (/refund|wapas|return/.test(q) && amounts.length >= 1) {
    const amt = amounts[0].paise;
    const svc = findServiceIn(q, profile.services);
    const custName = findNameIn(q, [...state.customers.filter((c) => c.profileId === profile.id).map((c) => c.name), ...state.jobs.filter((j) => j.profileId === profile.id).map((j) => j.customerName)]);
    const job = custName
      ? state.jobs.filter((j) => j.profileId === profile.id && j.customerName.toLowerCase() === custName.toLowerCase() && j.receivedPaise >= amt).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
      : undefined;
    const method = cashUpiMethod(extractMethod(q), 'cash');
    const action: AssistantAction = { kind: 'refund', date, jobId: job?.id || null, service: svc || job?.service || 'General', customerName: custName || '', amountPaise: amt, method };
    return { kind: 'action', action, previewLines: [`Refund: ${money(amt)} (${method.toUpperCase()})${custName ? ` to ${custName}` : ''}${job ? ` — ${job.service} job se` : ''}`, 'Ye reversal hai — ordinary kharcha nahi.'], totalPaise: amt };
  }

  // --- Internal transfer: "1000 cash se UPI kar do". ---
  if (/transfer|bhej|move|badal/.test(q) && /\bcash\b/.test(q) && /\bupi\b/.test(q) && amounts.length >= 1) {
    const amt = amounts[0].paise;
    const cashFirst = q.indexOf('cash') < q.indexOf('upi');
    const from: 'cash' | 'upi' = /cash\s*(se|to|->|→)/.test(q) || (cashFirst && /cash.*upi/.test(q)) ? 'cash' : 'upi';
    const to: 'cash' | 'upi' = from === 'cash' ? 'upi' : 'cash';
    const action: AssistantAction = { kind: 'internal_transfer', date, from, to, amountPaise: amt };
    return { kind: 'action', action, previewLines: [`Internal transfer: ${money(amt)} ${from.toUpperCase()} → ${to.toUpperCase()}`, 'Ye income ya kharcha NAHI hai — sirf paisa ek jagah se dusri jagah gaya.'], totalPaise: amt };
  }

  // --- Money Transfer fund from brother. ---
  if (/fund/.test(q) && amounts.length >= 1 && /bhai|mila|aaya|received/.test(q)) {
    const amt = amounts[0].paise;
    const method = cashUpiMethod(extractMethod(q), 'upi');
    const action: AssistantAction = { kind: 'mt_fund', date, amountPaise: amt, method, note: 'Fund from brother' };
    return { kind: 'action', action, previewLines: [`MT Fund received: ${money(amt)} (${method.toUpperCase()}) — bhai se`, 'Ye fund hai — income nahi.'], totalPaise: amt };
  }

  // --- Money Transfer: principal + commission. A transfer + commission
  //  mentioned together is an MT action even without the words "money
  //  transfer" ("Rahul ko 10000 transfer kiya, commission 50 mila").
  //  A bare "transfer" with no MT keyword and a payment mode (UPI/cash)
  //  is a customer payment, not an MT transfer — that is handled below.
  //  Questions ("MT commission kitna hai?") have no amounts and stay
  //  questions.
  const hasMtKeyword = /money\s*transfer|\bmt\b|commission/.test(q);
  const hasMethodWord = /\b(cash|upi|nagad|online|gpay|phonepe|paytm)\b/.test(q);
  if ((hasMtKeyword || /transfer|bhej/.test(q)) && /transfer|bhej|commission|bheja/.test(q) && amounts.length >= 1 && (hasMtKeyword || !hasMethodWord)) {
    const receiver = findNameIn(q, state.jobs.filter((j) => j.profileId === profile.id).map((j) => j.customerName))
      || (() => {
        const beforeKo = q.match(/([a-z\u0900-\u097F]+(?:\s+[a-z\u0900-\u097F]+){0,2})\s+ko\s+\d/);
        if (beforeKo) {
          const words = beforeKo[1].split(/\s+/).filter((w) => !['aaj', 'kal', 'money', 'transfer', 'mt', 'ne', 'se', 'ko', 'bheja', 'bheje', 'kiya', 'karo', 'please'].includes(w));
          const name = words.slice(-2).join(' ').trim();
          if (name) return name;
        }
        const m = q.match(/(?:to|ko)\s+([a-z\u0900-\u097F][a-z\u0900-\u097F ]{2,30}?)(?:\s+ko|\s+ka|\s+\d|\s*$)/);
        return m ? m[1].trim().replace(/\s+(ko|ka|ke)$/, '') : null;
      })();
    const commMatch = q.match(/commission\s*(?:\w+\s+)?(\d[\d,]*\.?\d*)/);
    const commission = commMatch ? Math.round(parseFloat(commMatch[1].replace(/,/g, '')) * 100) : undefined;
    const principal = amounts.find((a) => a.paise !== commission)?.paise;
    if (!receiver) {
      return draftFor('customer', 'Money Transfer kis ko bhejna hai? Receiver ka naam batao.', { mtPrincipal: principal, mtCommission: commission, date }, rawText);
    }
    if (principal === undefined) {
      return draftFor('amount', `${receiver} ko kitne rupaye transfer karne hain?`, { mtReceiver: receiver, mtCommission: commission, date }, rawText);
    }
    if (commission === undefined) {
      return draftFor('commission', askIn(rawText, 'askCommission', { name: receiver, amount: money(principal) }), { mtReceiver: receiver, mtPrincipal: principal, date }, rawText);
    }
    const method = cashUpiMethod(extractMethod(q), 'upi');
    const action: AssistantAction = { kind: 'mt_transfer', date, receiverName: receiver, mobile: '', amountPaise: principal, commissionPaise: commission, method };
    return {
      kind: 'action',
      action,
      previewLines: [
        `Money Transfer to ${receiver}: principal ${money(principal)} (${method.toUpperCase()}) — principal income NAHI hai.`,
        `Commission: ${money(commission)} — sirf yehi income/profit hai.`,
      ],
      totalPaise: principal,
    };
  }

  // --- Agent payment: "Agent Ramesh ko 500 diye" (a completed payment).
  // "Kitna dena baaki hai" (how much is owed) is a QUESTION, not a
  // payment — past-tense verbs only, never the infinitive "dena".
  if (/agent/.test(q) && /diye|diya|\bpaid\b|\bpayment\b|\bpay\b|de\s*diye/.test(q)) {
    const agentName = findNameIn(q, state.agents.filter((a) => a.profileId === profile.id).map((a) => a.name));
    if (!agentName) {
      const names = state.agents.filter((a) => a.profileId === profile.id).map((a) => a.name);
      return draftFor('agent', askIn(rawText, 'askAgent', { agents: names.length ? ` Agents: ${names.join(', ')}.` : '' }), { agentAmount: amounts[0]?.paise, date }, rawText);
    }
    if (amounts.length === 0) {
      return draftFor('amount', `${agentName} ko kitne rupaye diye?`, { agentName, date }, rawText);
    }
    const agent = state.agents.find((a) => a.profileId === profile.id && a.name === agentName)!;
    const method = cashUpiMethod(extractMethod(q), 'cash');
    const action: AssistantAction = { kind: 'agent_payment', date, agentId: agent.id, agentName, amountPaise: amounts[0].paise, method };
    return { kind: 'action', action, previewLines: [`Agent payment: ${agentName} ko ${money(amounts[0].paise)} (${method.toUpperCase()})`, 'Ye agent payment hai — customer kharcha nahi.'], totalPaise: amounts[0].paise };
  }

  // --- Agent payable (owed, not paid): "Agent ko 500 dena baaki hai",
  // "Agent ne 500 rupaye dene hain" (infinitive "dene" = obligation).
  // This is NOT a payment — it is a question/record request. If no
  // agent is named, ask which one (never invent an agent). If one is
  // named, fall through to the knowledge Q&A, which quotes the real
  // payable. Recording a NEW payable needs a job (payable lives on
  // jobs), so the draft flow asks for the job/service next instead of
  // inventing a payable entry.
  if (/agent/.test(q) && /(dena|dene|baki|baaki|payable|aapvana)/.test(q) && amounts.length >= 1 && !/diye|diya|\bpaid\b|\bpayment\b|\bpay\b|de\s*diye/.test(q)) {
    const agentName = findNameIn(q, state.agents.filter((a) => a.profileId === profile.id).map((a) => a.name));
    if (!agentName) {
      const names = state.agents.filter((a) => a.profileId === profile.id).map((a) => a.name);
      return draftFor('agent', askIn(rawText, 'askAgent', { agents: names.length ? ` Agents: ${names.join(', ')}.` : '' }), { payableAmount: amounts[0].paise, date }, rawText);
    }
    return { kind: 'question' };
  }

  // --- Generic customer due collection: "customer ka baki 300 jama kar"
  // (no customer named yet) — ask which customer, never invent one.
  if (/customer|grahak/.test(q) && !/customers\b/.test(q) && !findServiceIn(q, profile.services) && amounts.length >= 1 && /(jama|mila|mile|diye|diya|paid|payment|collect)/.test(q) && !/agent/.test(q)) {
    const custName = findNameIn(q, [...state.customers.filter((c) => c.profileId === profile.id).map((c) => c.name), ...state.jobs.filter((j) => j.profileId === profile.id).map((j) => j.customerName)]);
    if (!custName) {
      const names = state.customers.filter((c) => c.profileId === profile.id).map((c) => c.name);
      return draftFor('customer', askIn(rawText, 'askCustomer', { customers: names.length ? ` Customers: ${names.join(', ')}.` : '' }), { customerPaymentAmount: amounts[0].paise, date }, rawText);
    }
  }

  // --- Customer payment: "Rahul ne 500 diye" / "Rahul se 500 mile".
  // NOT a payment when the money goes TO the customer ("Rahul ko 500
  // udhaar diya" is a new credit sale, handled by daily income below).
  {
    const custName = findNameIn(q, [...state.customers.filter((c) => c.profileId === profile.id).map((c) => c.name), ...state.jobs.filter((j) => j.profileId === profile.id).map((j) => j.customerName)]);
    const gaveToCustomer = custName ? new RegExp(`${custName.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+ko\\b`).test(q) : false;
    if (custName && amounts.length >= 1 && /diye|diya|mila|mile|paid|payment|de\s*diye|jama|transfer|bheja|bheje/.test(q) && !/agent/.test(q) && !/udhaar|udhar|credit/.test(q) && !gaveToCustomer) {
      const amt = amounts[0].paise;
      const dueJobs = state.jobs
        .filter((j) => j.profileId === profile.id && j.customerName.toLowerCase() === custName.toLowerCase() && jobDuePaise(j) > 0)
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      if (dueJobs.length === 0) {
        return { kind: 'error', text: `${custName} ka koi due nahi hai — isliye payment record nahi kar sakta. Agar nayi sale hai to service aur amount batao (jaise: "Xerox 500 cash").` };
      }
      const job = dueJobs[0];
      if (amt > jobDuePaise(job)) {
        return { kind: 'error', text: `${custName} ka is job par due sirf ${money(jobDuePaise(job))} hai (${job.service}, ${job.date}). ${money(amt)} zyada hai — sahi amount batao.` };
      }
      const method = cashUpiMethod(extractMethod(q), 'cash');
      const action: AssistantAction = { kind: 'customer_payment', date, jobId: job.id, customerName: custName, amountPaise: amt, method };
      return { kind: 'action', action, previewLines: [`Payment received: ${custName} se ${money(amt)} (${method.toUpperCase()})`, `${job.service} job — due ${money(jobDuePaise(job))} se ${money(jobDuePaise(job) - amt)} reh jayega.`], totalPaise: amt };
    }
  }

  // --- Add customer. ---
  if (/naya customer|new customer|add.*customer|customer.*add/.test(q)) {
    const m = q.match(/(?:customer|grahak)\s+([a-z\u0900-\u097F][a-z\u0900-\u097F ]{2,30})/);
    const name = m ? m[1].replace(/\s+(add|karo|kar|ko)$/, '').trim() : null;
    const mobile = (rawText.match(/\b\d{10}\b/) || [])[0] || '';
    if (!name) return draftFor('customer', 'Naye customer ka naam kya hai?', { customerMobile: mobile }, rawText);
    const action: AssistantAction = { kind: 'customer_add', name, mobile };
    return { kind: 'action', action, previewLines: [`Add customer: ${name}${mobile ? ` (${mobile})` : ''}`], totalPaise: 0 };
  }

  // --- Expense: "machine repair mein 200 kharch hue". ---
  if (/kharcha|kharach|expense|repair|bijli|electricity|internet|kagaz|paper|\bink\b|kiraya|rent|transport|petrol/.test(q) && amounts.length >= 1 && !/money\s*transfer/.test(q)) {
    const amt = amounts[0].paise;
    const category = expenseCategoryFor(q, profile);
    const svc = findServiceIn(q, profile.services) || 'General';
    const method = cashUpiMethod(extractMethod(q), 'cash');
    const desc = rawText.trim();
    const action: AssistantAction = { kind: 'expense', date, category, description: desc.length > 80 ? desc.slice(0, 80) : desc, amountPaise: amt, method, service: svc, vendor: '' };
    return { kind: 'action', action, previewLines: [`Expense: ${category} — ${money(amt)} (${method.toUpperCase()})`, `Service: ${svc}`], totalPaise: amt };
  }

  // --- Daily income (the main flow): service + amount (+ method). ---
  {
    const segments = splitServiceSegments(text, profile.services);
    const hasServiceWord = segments.some((s) => s.service !== null);
    const hasMoneyWord = /cash|upi|nagad|rupaye|rupees?|rs\.?|₹|hue|hua|hoga|mila|mile|collection|kamai|earning|dhandha/.test(q);
    // Follow-up = the message STARTS with aur/bhi/add ("Aur 200 UPI bhi
    // add kar do"), or it carries aur/bhi AND a service is already in
    // context. A mid-sentence "aur" joining two amounts ("300 cash aur
    // 200 UPI hue") is NOT a follow-up — without a service in context
    // that message must ask which service, not guess one.
    const followUp = /^(aur|or|also|bhi|add|aur\s+ek|phir)\b/.test(q)
      || (/\b(aur|bhi)\b/.test(q) && !!ctx.lastService);
    if ((hasServiceWord && amounts.length >= 1) || (followUp && amounts.length >= 1 && ctx.lastService) || (hasServiceWord && amounts.length >= 1 && hasMoneyWord)) {
      const entries: { service: string; amountPaise: number; method: PayMethod | null; customerName?: string }[] = [];
      const globalMethods = (text.match(/\b(cash|upi|nagad|online|gpay|phonepe|paytm)\b/g) || []).map((w) => extractMethod(w));
      const uniqueGlobal = [...new Set(globalMethods)];
      let lastService = ctx.lastService || null;
      let missingMethod = false;
      let missingService = false;
      // Per-amount methods for the no-service draft, so answering the
      // service later keeps "300 cash, 200 UPI" as cash + UPI instead
      // of flattening both to one mode.
      let missingServiceMethods: (PayMethod | null)[] = [];
      for (const seg of segments) {
        const segAmounts = extractAmounts(seg.text);
        if (segAmounts.length === 0) continue;
        const service = seg.service || lastService;
        if (!service) {
          missingService = true;
          for (let ai = 0; ai < segAmounts.length; ai++) {
            const a = segAmounts[ai];
            const amtLen = String(a.paise / 100).length;
            let m = methodNear(seg.text, a.index, amtLen, ai + 1 < segAmounts.length ? segAmounts[ai + 1].index : undefined);
            if (!m && uniqueGlobal.length === 1) m = uniqueGlobal[0];
            missingServiceMethods.push(m);
          }
          continue;
        }
        for (let ai = 0; ai < segAmounts.length; ai++) {
          const a = segAmounts[ai];
          // Per-amount payment mode ("300 cash, 200 UPI" — not one mode
          // for the whole segment).
          const amtLen = String(a.paise / 100).length;
          let method = methodNear(seg.text, a.index, amtLen, ai + 1 < segAmounts.length ? segAmounts[ai + 1].index : undefined);
          if (!method && uniqueGlobal.length === 1) method = uniqueGlobal[0];
          if (!method) missingMethod = true;
          entries.push({ service, amountPaise: a.paise, method });
        }
        lastService = service;
      }
      if (missingService && entries.length === 0) {
        return draftFor('service', askIn(rawText, 'askService', { amount: money(amounts[0].paise), services: profile.services.join(', ') }), { pendingAmounts: amounts.map((a) => a.paise), pendingMethods: missingServiceMethods, date }, rawText);
      }
      if (entries.length === 0) {
        return draftFor('amount', askIn(rawText, 'askAmount', { service: segments[0]?.service || ctx.lastService || 'Service' }), { pendingService: segments[0]?.service || ctx.lastService, date }, rawText);
      }
      if (missingMethod) {
        const first = entries[0];
        return draftFor('method', askIn(rawText, 'askMethod', { service: first.service, amount: money(first.amountPaise) }), { pendingEntries: entries, date }, rawText);
      }
      // 'other' (udhaar) entries: customer name present?
      const custName = findNameIn(q, state.customers.filter((c) => c.profileId === profile.id).map((c) => c.name));
      if (custName && entries.some((e) => e.method === 'other')) {
        for (const e of entries) if (e.method === 'other') e.customerName = custName;
      }
      const action: AssistantAction = { kind: 'daily_income', date, entries: entries.map((e) => ({ service: e.service, amountPaise: e.amountPaise, method: e.method || 'cash', customerName: e.customerName })) };
      const total = entries.reduce((a, e) => a + e.amountPaise, 0);
      const previewLines = entries.map((e) => `${e.service} ${money(e.amountPaise)} ${e.method === 'other' ? '(due — abhi mile nahi)' : `(${(e.method || 'cash').toUpperCase()})`}${e.customerName ? ` — ${e.customerName}` : ''}`);
      const dup = findDuplicateWarning(state, profile.id, action);
      return { kind: 'action', action, previewLines, totalPaise: total, duplicateWarning: dup || undefined };
    }
    // Service mentioned but no amount → ask for amount.
    if (hasServiceWord && amounts.length === 0 && !/kitna|kitne|kitni|kya|batao|dikhao|compare|kab|kaise|kahan|kaun|kab/.test(q)) {
      const svc = segments.find((s) => s.service)?.service || null;
      return draftFor('amount', askIn(rawText, 'askAmount', { service: svc || 'Service' }), { pendingService: svc, date }, rawText);
    }
    // Amount + money words but no service → ask for service (unless follow-up with context).
    // Carry the per-amount methods along, so answering the service
    // later keeps "300 cash, 200 UPI" as cash + UPI.
    if (amounts.length >= 1 && !hasServiceWord && hasMoneyWord && !followUp && !/kharcha|expense/.test(q)) {
      const pendingMethods = amounts.map((a, i) => methodNear(text, a.index, String(a.paise / 100).length, i + 1 < amounts.length ? amounts[i + 1].index : undefined));
      return draftFor('service', askIn(rawText, 'askService', { amount: money(amounts[0].paise), services: profile.services.join(', ') }), { pendingAmounts: amounts.map((a) => a.paise), pendingMethods, date }, rawText);
    }
  }

  return { kind: 'question' };
}

/** Complete a clarification draft with the user's reply. */
export function applyDraftAnswer(
  draft: ActionDraft,
  replyText: string,
  state: AppState,
  profile: BusinessProfile,
  ctx: ChatContext = {},
): ParsedMessage {
  const q = replyText.toLowerCase();
  const amounts = extractAmounts(replyText);
  const p = draft.partial;

  if (draft.missing === 'method' && p.pendingEntries) {
    const method = extractMethod(q);
    if (!method) return draftFor('method', 'Cash ya UPI — kaunsa mode tha?', p, draft.original);
    // Fill ONLY the entries whose mode is still unknown — entries
    // whose mode the user already stated keep it ("300 cash, 200 UPI"
    // never flattens to one mode).
    const entries = (p.pendingEntries as { service: string; amountPaise: number; method: PayMethod | null }[]).map((e) => ({ ...e, method: e.method || method }));
    const date = (p.date as string) || todayISO();
    const action: AssistantAction = { kind: 'daily_income', date, entries: entries.map((e) => ({ service: e.service, amountPaise: e.amountPaise, method: e.method || 'cash' })) };
    const total = entries.reduce((a, e) => a + e.amountPaise, 0);
    const dup = findDuplicateWarning(state, profile.id, action);
    return { kind: 'action', action, previewLines: entries.map((e) => `${e.service} ${formatINR(e.amountPaise)} ${e.method === 'other' ? '(due — abhi mile nahi)' : `(${e.method.toUpperCase()})`}`), totalPaise: total, duplicateWarning: dup || undefined };
  }
  if (draft.missing === 'service' && p.pendingAmounts) {
    const svc = findServiceIn(q, profile.services);
    if (!svc) return draftFor('service', `Service samajh nahi aaya. Services: ${profile.services.join(', ')}.`, p, draft.original);
    const method = extractMethod(q);
    // Per-amount modes from the original message ("300 cash, 200 UPI")
    // survive: the reply's mode fills only the amounts whose mode is
    // still unknown, it never overwrites a stated mode.
    const pendingMethods = (p.pendingMethods as (PayMethod | null)[] | undefined) || [];
    const entries = (p.pendingAmounts as number[]).map((a, i) => ({ service: svc, amountPaise: a, method: (pendingMethods[i] || method || null) as PayMethod | null }));
    if (entries.some((e) => !e.method)) {
      return draftFor('method', `${svc} ke ${formatINR(entries[0].amountPaise)} — Cash mein mile ya UPI mein?`, { pendingEntries: entries, date: p.date }, draft.original);
    }
    const date = (p.date as string) || todayISO();
    const action: AssistantAction = { kind: 'daily_income', date, entries: entries.map((e) => ({ service: e.service, amountPaise: e.amountPaise, method: e.method || 'cash' })) };
    const total = entries.reduce((a, e) => a + e.amountPaise, 0);
    const dup = findDuplicateWarning(state, profile.id, action);
    return { kind: 'action', action, previewLines: entries.map((e) => `${e.service} ${formatINR(e.amountPaise)} (${(e.method || 'cash').toUpperCase()})`), totalPaise: total, duplicateWarning: dup || undefined };
  }
  if (draft.missing === 'amount' && p.pendingService) {
    if (amounts.length === 0) return draftFor('amount', 'Amount kitna tha? Sirf number likho (jaise: 300).', p, draft.original);
    const method = extractMethod(q);
    const entries = amounts.map((a) => ({ service: p.pendingService as string, amountPaise: a.paise, method: method || 'cash' as PayMethod }));
    if (!method) {
      return draftFor('method', `${p.pendingService} ke ${formatINR(amounts[0].paise)} — Cash mein mile ya UPI mein?`, { pendingEntries: entries, date: p.date }, draft.original);
    }
    const date = (p.date as string) || todayISO();
    const action: AssistantAction = { kind: 'daily_income', date, entries };
    const total = entries.reduce((a, e) => a + e.amountPaise, 0);
    return { kind: 'action', action, previewLines: entries.map((e) => `${e.service} ${formatINR(e.amountPaise)} (${e.method.toUpperCase()})`), totalPaise: total };
  }
  if (draft.missing === 'amount' && p.target) {
    if (amounts.length === 0) return draftFor('amount', 'Sahi amount kitna hona chahiye?', p, draft.original);
    const t0 = p.target as { kind: 'daily' | 'job' | 'expense' | 'mt'; id: string; label: string; amountPaise: number };
    const action: AssistantAction = { kind: 'correct_entry', targetKind: t0.kind, targetId: t0.id, label: t0.label, oldAmountPaise: t0.amountPaise, newAmountPaise: amounts[0].paise };
    return { kind: 'action', action, previewLines: [`Correct: ${t0.label}`, `Naya amount: ${formatINR(amounts[0].paise)} (pehle ${formatINR(t0.amountPaise)})`], totalPaise: amounts[0].paise };
  }
  if (draft.missing === 'customer' && p.customerPaymentAmount) {
    // Generic due collection: the reply names the customer.
    const custName = findNameIn(q, [...state.customers.filter((c) => c.profileId === profile.id).map((c) => c.name), ...state.jobs.filter((j) => j.profileId === profile.id).map((j) => j.customerName)]);
    if (!custName) return draftFor('customer', askIn(replyText, 'askCustomer', {}), p, draft.original);
    const amt = (p.customerPaymentAmount as number) || amounts[0]?.paise;
    const dueJobs = state.jobs
      .filter((j) => j.profileId === profile.id && j.customerName.toLowerCase() === custName.toLowerCase() && jobDuePaise(j) > 0)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (dueJobs.length === 0) {
      return { kind: 'error', text: `${custName} ka koi due nahi hai — isliye payment record nahi kar sakta.` };
    }
    const job = dueJobs[0];
    if (amt > jobDuePaise(job)) {
      return { kind: 'error', text: `${custName} ka is job par due sirf ${formatINR(jobDuePaise(job))} hai. ${formatINR(amt)} zyada hai — sahi amount batao.` };
    }
    const method = cashUpiMethod(extractMethod(q), 'cash');
    const action: AssistantAction = { kind: 'customer_payment', date: (p.date as string) || todayISO(), jobId: job.id, customerName: custName, amountPaise: amt, method };
    return { kind: 'action', action, previewLines: [`Payment received: ${custName} se ${formatINR(amt)} (${method.toUpperCase()})`, `${job.service} job — due ${formatINR(jobDuePaise(job))} se ${formatINR(jobDuePaise(job) - amt)} reh jayega.`], totalPaise: amt };
  }
  if (draft.missing === 'agent' && p.payableAmount) {
    // Payable (owed) — NOT a payment. Agent payable lives on jobs, so
    // a new payable cannot be recorded without a job. Ask for the
    // job/service instead of inventing a payable entry.
    const agentName = findNameIn(q, state.agents.filter((a) => a.profileId === profile.id).map((a) => a.name));
    if (!agentName) return draftFor('agent', askIn(replyText, 'askAgent', {}), p, draft.original);
    const agent = state.agents.find((a) => a.profileId === profile.id && a.name === agentName)!;
    const payable = agentPayablePaise(agent, state.jobs.filter((j) => j.profileId === profile.id && j.agentId === agent.id));
    if (payable >= (p.payableAmount as number) && payable > 0) {
      return { kind: 'error', text: `${agentName} ko abhi ${formatINR(payable)} dena baaki hai (asli payable). ${formatINR(p.payableAmount as number)} ka naya payable record karne ke liye us job/service ka naam batao jis ka kaam hua tha — payable job par banta hai, khaali amount se nahi.` };
    }
    return { kind: 'error', text: `${agentName} ke naam par abhi ${formatINR(payable)} payable hai. ${formatINR(p.payableAmount as number)} ka naya payable record karne ke liye job/service aur customer ka naam batao (jaise: "Ramesh ne Rahul ka PAN Card kiya, charge 500") — payable job par banta hai, khaali amount se nahi.` };
  }
  if (draft.missing === 'agent') {
    const agentName = findNameIn(q, state.agents.filter((a) => a.profileId === profile.id).map((a) => a.name));
    if (!agentName) return draftFor('agent', 'Agent ka naam samajh nahi aaya. Naam dobara likho.', p, draft.original);
    const agent = state.agents.find((a) => a.profileId === profile.id && a.name === agentName)!;
    const amt = (p.agentAmount as number | undefined) || amounts[0]?.paise;
    if (!amt) return draftFor('amount', `${agentName} ko kitne rupaye diye?`, { agentName, date: p.date }, draft.original);
    const method = cashUpiMethod(extractMethod(q), 'cash');
    const action: AssistantAction = { kind: 'agent_payment', date: (p.date as string) || todayISO(), agentId: agent.id, agentName, amountPaise: amt, method };
    return { kind: 'action', action, previewLines: [`Agent payment: ${agentName} ko ${formatINR(amt)} (${method.toUpperCase()})`], totalPaise: amt };
  }
  if (draft.missing === 'customer') {
    if (p.mtReceiver === undefined && p.mtPrincipal !== undefined) {
      // MT receiver name answer.
      const name = replyText.trim().replace(/\s+ko$/, '');
      if (name.length < 2) return draftFor('customer', 'Receiver ka naam batao.', p, draft.original);
      const commission = p.mtCommission as number | undefined;
      if (commission === undefined) {
        return draftFor('commission', `${name} ko ${formatINR(p.mtPrincipal as number)} transfer par commission kitna mila? (0 ho to 0 likho)`, { mtReceiver: name, mtPrincipal: p.mtPrincipal, date: p.date }, draft.original);
      }
      const method = cashUpiMethod(extractMethod(q), 'upi');
      const action: AssistantAction = { kind: 'mt_transfer', date: (p.date as string) || todayISO(), receiverName: name, mobile: '', amountPaise: p.mtPrincipal as number, commissionPaise: commission, method };
      return { kind: 'action', action, previewLines: [`Money Transfer to ${name}: principal ${formatINR(p.mtPrincipal as number)} (${method.toUpperCase()}) — principal income NAHI hai.`, `Commission: ${formatINR(commission)} — sirf yehi income hai.`], totalPaise: p.mtPrincipal as number };
    }
    const name = replyText.trim();
    if (name.length < 2) return draftFor('customer', 'Customer ka naam batao.', p, draft.original);
    const action: AssistantAction = { kind: 'customer_add', name, mobile: (p.customerMobile as string) || '' };
    return { kind: 'action', action, previewLines: [`Add customer: ${name}`], totalPaise: 0 };
  }
  if (draft.missing === 'commission') {
    if (amounts.length === 0) return draftFor('commission', 'Commission kitna mila? (0 ho to 0 likho)', p, draft.original);
    const method = cashUpiMethod(extractMethod(q), 'upi');
    const action: AssistantAction = { kind: 'mt_transfer', date: (p.date as string) || todayISO(), receiverName: p.mtReceiver as string, mobile: '', amountPaise: p.mtPrincipal as number, commissionPaise: amounts[0].paise, method };
    return { kind: 'action', action, previewLines: [`Money Transfer to ${p.mtReceiver}: principal ${formatINR(p.mtPrincipal as number)} (${method.toUpperCase()}) — principal income NAHI hai.`, `Commission: ${formatINR(amounts[0].paise)} — sirf yehi income hai.`], totalPaise: p.mtPrincipal as number };
  }
  if (draft.missing === 'amount' && p.mtReceiver) {
    if (amounts.length === 0) return draftFor('amount', 'Transfer amount kitna tha?', p, draft.original);
    const commission = p.mtCommission as number | undefined;
    if (commission === undefined) {
      return draftFor('commission', `${p.mtReceiver} ko ${formatINR(amounts[0].paise)} transfer par commission kitna mila? (0 ho to 0 likho)`, { mtReceiver: p.mtReceiver, mtPrincipal: amounts[0].paise, date: p.date }, draft.original);
    }
    const method = cashUpiMethod(extractMethod(q), 'upi');
    const action: AssistantAction = { kind: 'mt_transfer', date: (p.date as string) || todayISO(), receiverName: p.mtReceiver as string, mobile: '', amountPaise: amounts[0].paise, commissionPaise: commission, method };
    return { kind: 'action', action, previewLines: [`Money Transfer to ${p.mtReceiver}: principal ${formatINR(amounts[0].paise)} (${method.toUpperCase()}) — principal income NAHI hai.`, `Commission: ${formatINR(commission)} — sirf yehi income hai.`], totalPaise: amounts[0].paise };
  }
  if (draft.missing === 'target' && p.targets) {
    const n = parseInt(q, 10);
    const targets = p.targets as { kind: 'daily' | 'job' | 'expense' | 'mt'; id: string; label: string; amountPaise: number }[];
    const picked = Number.isInteger(n) && n >= 1 && n <= targets.length ? targets[n - 1] : targets.find((t) => q.includes(t.label.toLowerCase().slice(0, 12)));
    if (!picked) return draftFor('target', 'Number likho — kaunsi entry? (1, 2, 3…)', p, draft.original);
    if (p.newAmountPaise) {
      const action: AssistantAction = { kind: 'correct_entry', targetKind: picked.kind, targetId: picked.id, label: picked.label, oldAmountPaise: picked.amountPaise, newAmountPaise: p.newAmountPaise as number };
      return { kind: 'action', action, previewLines: [`Correct: ${picked.label}`, `Naya amount: ${formatINR(p.newAmountPaise as number)} (pehle ${formatINR(picked.amountPaise)})`], totalPaise: p.newAmountPaise as number };
    }
    const action: AssistantAction = { kind: 'delete_entry', targetKind: picked.kind, targetId: picked.id, label: picked.label };
    return { kind: 'action', action, previewLines: [`Delete: ${picked.label}`, 'Ye entry Recycle Bin mein jayegi.'], totalPaise: 0 };
  }
  void ctx;
  return { kind: 'question' };
}

