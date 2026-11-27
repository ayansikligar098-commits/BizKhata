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
import { todayISO, addDaysISO } from './types';
import type { AppState, BusinessProfile, Method } from './types';
import type { AssistantAction, FoundRecord } from './assistant';
import { findAssistantTargetById, findAssistantTargets, recentAssistantTargets } from './assistant';
import type { ChatContext, LastSavedEntry } from './knowledge';
import { detectLanguage, normalizeDigitsMultilingual, normalizeMultilingual, replyIn, resolveReplyLang, type AiLangCode, type ReplyKey } from './languages';
import { SERVICE_ALIASES, findNameIn, findServiceIn, normalizeDevanagariWords, parseDateRange } from './knowledge';
import { DHANDA_SERVICE } from './categories';
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
  // UPDATE 25 (C-5): a greeting PLUS a business question in the same
  // message is NOT a greeting — "Kaise ho bhai, aaj ka profit kitna
  // hua?" must reach the profit branch below, not stop here.
  const asksFigure = /profit|munafa|faayda|fayda|kitna|kitne|hisab|total|kamai|due|udhaar|balance|kharcha|income|collection/.test(q);
  if (!asksFigure && has(q, /\b(hi|hii+|hello|hey|namaste|namaskar|ram\s*ram|good\s(morning|afternoon|evening)|salaam|adaab|vanakkam|namaskaram|sat\s*sri\s*akal|johar|khurumjari|namaskara)\b|kaise ho|how are you|kem cho/)) {
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
  if (has(q, /income|kamai|kamaya|kamaye|received|collection|aaya|mila/)) {
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
    // Pure ISO arithmetic — never `new Date(today + 'T00:00:00')`,
    // which parses as LOCAL midnight and shifts a day when converted
    // back with toISOString() (UTC).
    return addDaysISO(today, -1);
  }
  return today;
}

/**
 * UPDATE 25 (C-11): the date NEAR one amount inside a multi-entry
 * message. "Aaj printing ke 150 hue, aur kal ke 200 bhi add kar do"
 * has two dates: 150 is today, 200 is yesterday. The whole-message
 * extractDate() would put BOTH on yesterday. The date word must be
 * in the SAME clause as the amount (clauses split at commas and
 * "aur") — a ±N-char window is not enough, because "kal" sits only
 * a few words after the first amount in that sentence.
 */
export function dateNearAmount(segmentText: string, amountIndex: number, today: string = todayISO()): string {
  const text = segmentText.toLowerCase();
  const boundaryRe = /,|\baur\b/g;
  let clauseStart = 0;
  let clauseEnd = text.length;
  let m: RegExpExecArray | null;
  while ((m = boundaryRe.exec(text)) !== null) {
    if (m.index < amountIndex) clauseStart = m.index + m[0].length;
    else { clauseEnd = m.index; break; }
  }
  const clause = text.slice(clauseStart, clauseEnd);
  if (/\b(kal|yesterday)\b/.test(clause)) return addDaysISO(today, -1);
  return today;
}

/** Preview line for one daily-income entry, with its own date when
 *  it differs from the action date ("(kal)" for yesterday). */
export function entryPreviewLine(e: { service: string; amountPaise: number; method: PayMethod | null; customerName?: string; date?: string }, actionDate: string, today: string = todayISO()): string {
  const dateSuffix = e.date && e.date !== actionDate ? ` (${e.date === addDaysISO(today, -1) ? 'kal' : e.date})` : '';
  return `${e.service} ${formatINR(e.amountPaise)} ${e.method === 'other' ? '(due — abhi mile nahi)' : `(${(e.method || 'cash').toUpperCase()})`}${e.customerName ? ` — ${e.customerName}` : ''}${dateSuffix}`;
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

/* ================= UPDATE 23 — delete routing =================
 *
 * The 2026-11-27 16:03 bug: "Isko remove kardo" / "Hatana hai" carry
 * no amount, so the old delete branch (amount-gated) never fired and
 * the message fell through to the cloud model, which fabricated the
 * deletion and then invented a false history. Delete routing is now:
 *   amount form → existing behaviour (unchanged);
 *   service-only form → resolve by service (1 = delete, >1 = list);
 *   "isko / ye / is entry" + delete → the conversation's last
 *     verified save (ctx.lastSavedEntry), re-read from the store;
 *     with no saved-entry context, the single most recent entry
 *     (preview still shows its label — the user confirms or cancels);
 *   bare delete ("Hatana hai") → NEVER falls through to the cloud:
 *     a clarification listing the recent candidates (draft 'target').
 * Every path still goes through preview → confirm → backend delete
 * → verify; nothing is ever silently deleted.
 */

/** Word-boundary delete words. Deliberately NOT a bare substring
 *  regex: /hata/ would also match "Khata" ("Customer Khata kholo"
 *  is navigation, not a delete). Padded-space matching works for
 *  Devanagari too, where \b fails. */
function paddedWords(text: string): string {
  return ` ${normalizeMultilingual(text.toLowerCase()).replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ')} `;
}
const DELETE_WORDS = [' delete ', ' hata ', ' hatao ', ' hatana ', ' hatado ', ' hatade ', ' remove ', ' mita ', ' mitado ', ' हटा ', ' हटाना ', ' मिटा ', ' डिलीट '];
const DELETE_PRONOUNS = [' isko ', ' is ko ', ' ye ', ' yeh ', ' is entry ', ' ye wali ', ' is wali ', ' usko ', ' us entry ', ' last ', ' pichli ', ' pehle wali ', ' इसको ', ' ये ', ' इस '];

/** True when the message contains a delete word as its own word. */
export function hasDeleteWord(text: string): boolean {
  const s = paddedWords(text);
  return DELETE_WORDS.some((w) => s.includes(w));
}

/** True when the message points at a specific entry ("isko", "ye wali"). */
export function hasDeletePronoun(text: string): boolean {
  const s = paddedWords(text);
  return DELETE_PRONOUNS.some((w) => s.includes(w));
}

/** True when the message asks to delete/remove an entry (any form). */
export function isDeleteRequest(raw: string): boolean {
  const s = `${normalizeMultilingual(raw.toLowerCase())} ${raw.toLowerCase()}`;
  // A how-to question ("entry kaise delete karu?") is app help, not
  // a delete action — it must reach the help engine, never a draft.
  if (/kaise|how/.test(s)) return false;
  return hasDeleteWord(raw);
}

function deleteActionFor(t: FoundRecord): ParsedMessage {
  const action: AssistantAction = { kind: 'delete_entry', targetKind: t.kind, targetId: t.id, label: t.label };
  return { kind: 'action', action, previewLines: [`Delete: ${t.label} (${t.date})`, 'Ye entry Recycle Bin mein jayegi — wahan se restore bhi ho sakti hai.'], totalPaise: 0 };
}

function deleteCandidatesDraft(targets: FoundRecord[], rawText: string): ParsedMessage {
  return draftFor(
    'target',
    `Kaunsi entry delete karni hai? Number likho (1, 2, 3…) — confirm karne par hi delete hogi:\n${targets.map((t, i) => `${i + 1}. ${t.label} (${t.date})`).join('\n')}`,
    { targets },
    rawText,
  );
}

/**
 * UPDATE 23 — the conversation-context record for a just-confirmed
 * save: the chat UI calls this with the backend's appliedIds after a
 * verified save and stores the result as ctx.lastSavedEntry. Single
 * source of truth (the UI and the tests use the same function).
 * Multi-entry saves resolve "isko" to the FIRST entry of the save —
 * the preview always shows its label, so the user can cancel if they
 * meant a different one. Returns null for actions with no record
 * (e.g. internal transfer creates only a txn — still resolvable as
 * 'txn' via appliedIds[0]).
 */
export function savedEntryFor(action: AssistantAction, appliedIds: string[]): LastSavedEntry | null {
  if (!appliedIds || appliedIds.length === 0) return null;
  if (action.kind === 'daily_income') {
    const e = action.entries[0];
    if (!e) return null;
    return {
      kind: e.customerName ? 'job' : 'daily',
      id: appliedIds[0],
      label: `${e.service} ${formatINR(e.amountPaise)} (${e.method})`,
      amountPaise: e.amountPaise,
      date: action.date,
      service: e.service,
    };
  }
  if (action.kind === 'expense') {
    return { kind: 'expense', id: appliedIds[0], label: `${action.category} ${formatINR(action.amountPaise)}`, amountPaise: action.amountPaise, date: action.date, service: action.service };
  }
  if (action.kind === 'mt_transfer') {
    return { kind: 'mt', id: appliedIds[0], label: `Money Transfer to ${action.receiverName} ${formatINR(action.amountPaise)}`, amountPaise: action.amountPaise, date: action.date, service: 'Money Transfer' };
  }
  if (action.kind === 'customer_payment') {
    return { kind: 'job', id: appliedIds[0], label: `Payment from ${action.customerName} ${formatINR(action.amountPaise)}`, amountPaise: action.amountPaise, date: action.date };
  }
  if (action.kind === 'agent_payment') {
    return { kind: 'txn', id: appliedIds[0], label: `Agent Payment — ${action.agentName} ${formatINR(action.amountPaise)}`, amountPaise: action.amountPaise, date: action.date, service: 'Agent Payment' };
  }
  return null;
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
    // UPDATE 26: the normalised text carries the canonical token
    // 'dhandha' (all spellings/scripts normalise to it), while the
    // label is 'Dhanda' — 'dhanda' alone never matches it.
    const aliases = [svc.toLowerCase(), ...(SERVICE_ALIASES[svc] || []), ...(svc === DHANDA_SERVICE ? ['dhandha'] : [])];
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

/* ================= UPDATE 26 — "Dhanda" (the day's mixed business) =================
 *
 * The owner's definition (2026-11-27 21:01 IST): "Dhanda Matlab
 * Passport Size Photo Smart Card Xerox Documents Ka Profit Money
 * Transfer Profit Sab Mix Ko Dhanda Kehta Hu Me" — dhanda is ALL of
 * it mixed together. The word was already known (languages.ts maps
 * dhanda/dhandha/dhandho/dhande/dhandhe/dhadhe + Devanagari धंधा/धन्दा
 * + Gujarati ધંધો, and also 'business'/'hisab', to the canonical
 * token 'dhandha') but the parser never mapped it to anything, so
 * "Aaj dhanda 500 ka hua" fell into the askService draft and every
 * reply of "dhanda" hit the identical dead-end
 * "Service samajh nahi aaya. Services: ..." in a loop (screenshot
 * 2026-11-27 20:59 IST).
 *
 * Rules now:
 *  - "Dhanda" (any spelling/script, plus 'kaam' when no specific
 *    service is named, plus 'business'/'hisab' which normalise to
 *    the same token) is a GENERAL Daily Business category: an add
 *    saves ONE entry under the label 'Dhanda' (DHANDA_SERVICE) —
 *    never an invented split across services, never a Services-page
 *    tile. The backend allow-lists it (assistant.ts).
 *  - A question ("Aaj dhanda kitna hua?") is answered from the hub
 *    total (knowledge.ts daily-summary branch): sum across services,
 *    MT commission only, dues never counted as collection.
 *  - A service that still cannot be resolved gets ONE short
 *    clarifying question with a Dhanda escape hatch, and a repeat of
 *    the same unknown word escalates the help instead of repeating
 *    the identical dead-end text.
 */

/** True when the text means the day's mixed business ("dhanda" in any
 *  spelling/script, or 'kaam' / 'business' / 'hisab' with no specific
 *  service named). The input is normalised first, so Devanagari and
 *  Gujarati forms arrive here as the canonical 'dhandha' token. */
export function isDhandaWord(raw: string, hasSpecificService = false): boolean {
  const n = normalizeMultilingual(raw.toLowerCase());
  if (/\bdhandha\b/.test(n)) return true;
  // 'kaam' is generic work — only a Dhanda synonym when no specific
  // service is in the message ("PAN Card ka kaam" is PAN Card, not
  // Dhanda). 'business' and 'hisab' already normalise to 'dhandha'.
  if (!hasSpecificService && /\bkaam\b/.test(n)) return true;
  return false;
}

/** Resolve a service-answer reply: a named service first, else the
 *  general Dhanda category when the reply says dhanda/kaam. Returns
 *  null only for a genuinely unknown word. */
export function resolveServiceReply(replyText: string, services: string[]): string | null {
  return findServiceIn(replyText, services)
    || (isDhandaWord(replyText) ? DHANDA_SERVICE : null);
}

export interface DhandaToday {
  totalPaise: number;
  count: number;
  cashPaise: number;
  upiPaise: number;
}

/** Today's already-saved Dhanda-category entries (quick daily entries
 *  + any Dhanda job received money), for the safe-default warning.
 *  Only collected money (cash/UPI) counts — 'other' (due) never does. */
export function dhandaTodayTotal(state: AppState, profileId: string, date: string = todayISO()): DhandaToday {
  let total = 0;
  let count = 0;
  let cash = 0;
  let upi = 0;
  for (const e of state.dailyEntries.filter((x) => x.profileId === profileId && x.date === date && x.service === DHANDA_SERVICE && x.method !== 'other')) {
    total += e.totalPaise;
    count += 1;
    if (e.method === 'cash') cash += e.totalPaise;
    else upi += e.totalPaise;
  }
  for (const j of state.jobs.filter((x) => x.profileId === profileId && x.date === date && x.service === DHANDA_SERVICE)) {
    total += j.receivedPaise;
    count += 1;
  }
  return { totalPaise: total, count, cashPaise: cash, upiPaise: upi };
}

/**
 * Safe default (UPDATE 26): if a Dhanda entry already exists today,
 * the preview warns with today's Dhanda total so far and asks before
 * adding — the same day's mix must never be double-counted by
 * accident. The user can still Confirm (a second, separate Dhanda
 * total is legitimate) — this only warns, it never blocks.
 */
export function dhandaExistingWarning(state: AppState, profileId: string, date: string = todayISO()): string | null {
  const t = dhandaTodayTotal(state, profileId, date);
  if (t.totalPaise <= 0) return null;
  const split = `${t.cashPaise > 0 ? `, cash ${formatINR(t.cashPaise)}` : ''}${t.upiPaise > 0 ? `, UPI ${formatINR(t.upiPaise)}` : ''}`;
  return `⚠ Aaj Dhanda ${formatINR(t.totalPaise)} pehle se saved hai (${t.count} ${t.count === 1 ? 'entry' : 'entries'}${split}). Ye naya amount usme AUR add hoga — agar ye alag dhandha hai to Confirm dabao, warna Cancel karo.`;
}

/** Dhanda warning for a set of entries being previewed (null when
 *  none of them is Dhanda, or nothing is saved today yet). */
export function dhandaWarningForEntries(
  state: AppState,
  profileId: string,
  entries: { service: string }[],
  date: string = todayISO(),
): string | null {
  if (!entries.some((e) => e.service === DHANDA_SERVICE)) return null;
  return dhandaExistingWarning(state, profileId, date);
}

/**
 * UPDATE 26 safe default (diagnosis §6b): a "Dhanda" total is a
 * RUNNING total for the day, not a series of independent
 * transactions — so a second Dhanda add on the same day is never
 * silently added on top. When pure Dhanda quick entries (no
 * customer, no baaki split) for TODAY are about to be previewed and
 * a Dhanda entry already exists today, return a DRAFT asking
 * "upar add karun ya total badal dun?" instead of the action. The
 * draft carries the pending entries + today's Dhanda total so far +
 * today's overall collection, so the reply can build either
 * outcome. Returns null when there is nothing to ask about (no
 * existing Dhanda entry, mixed entries, a baaki split, entries
 * spanning more than one date, or a non-today date — those keep the
 * preview warning instead).
 */
export function dhandaAddModeDraft(
  state: AppState,
  profile: BusinessProfile,
  entries: { service: string; amountPaise: number; method: PayMethod | null; customerName?: string; date?: string }[],
  date: string,
  original: string,
): ParsedMessage | null {
  if (entries.length === 0) return null;
  if (!entries.every((e) => e.service === DHANDA_SERVICE && !e.customerName)) return null;
  const entryDate = entries[0].date || date;
  if (entryDate !== todayISO()) return null;
  if (!entries.every((e) => (e.date || date) === entryDate)) return null;
  const existing = dhandaTodayTotal(state, profile.id, entryDate);
  if (existing.totalPaise <= 0) return null;
  const newTotal = entries.reduce((a, e) => a + e.amountPaise, 0);
  const todayTotal = computeFacts(state, profile).todayCollectionPaise;
  const isEn = detectLanguage(original).code === 'en';
  const question = isEn
    ? `Dhanda of ${formatINR(existing.totalPaise)} is already saved today (${existing.count} ${existing.count === 1 ? 'entry' : 'entries'}; total collection today ${formatINR(todayTotal)}). Should I add this ${formatINR(newTotal)} ON TOP (Dhanda total becomes ${formatINR(existing.totalPaise + newTotal)}), or is this ${formatINR(newTotal)} today's TOTAL Dhanda (replacing ${formatINR(existing.totalPaise)})? Reply "Add on top" or "Replace total".`
    : `Aaj Dhanda ${formatINR(existing.totalPaise)} pehle se saved hai (${existing.count} ${existing.count === 1 ? 'entry' : 'entries'}; aaj ki kul collection ${formatINR(todayTotal)} hai). Ye ${formatINR(newTotal)} uske UPAR add karun (Dhanda total ${formatINR(existing.totalPaise + newTotal)} ho jayega), ya yehi ${formatINR(newTotal)} aaj ka TOTAL Dhanda hai (${formatINR(existing.totalPaise)} ki jagah ${formatINR(newTotal)} ho jayega)? "Upar add karo" ya "Total badal do" — batao.`;
  return draftFor('dhanda_add_mode', question, {
    pendingEntries: entries.map((e) => ({ ...e })),
    date: entryDate,
    existingDhandaPaise: existing.totalPaise,
    existingDhandaCount: existing.count,
    todayTotalPaise: todayTotal,
  }, original);
}

/** Parse one user message into an action, a clarification draft, or a question. */
export function parseAssistantMessage(
  rawText: string,
  state: AppState,
  profile: BusinessProfile,
  ctx: ChatContext = {},
): ParsedMessage {
  let text = normalizeNumberWords(rawText.trim());
  let q = text.toLowerCase();
  const today = todayISO();
  const amounts = extractAmounts(rawText);
  const date = extractDate(rawText, today);

  // --- Confirm / cancel (handled by the chat UI's pending action). ---
  // UPDATE 25 (C-2): a leading "Haan/Ha" must NOT swallow the rest
  // of the message. "Haan, aur Xerox 300 cash hue" is a NEW entry
  // (₹300 Xerox), not a confirmation — strip the leading yes and
  // parse the remainder as an action (or merge it into the pending
  // preview per C-1). A bare "Haan" / "Haan, banao" (no amount or
  // service of its own) is still a confirm.
  const CONFIRM_START_RE = /^(haan|ha+|yes|yep|confirm|save|kar\s*do|karo|theek\s*hai|ok+|save\s*kar|confirm\s*kar|bilkul|ji\s*haan)\b/;
  if (CONFIRM_START_RE.test(q)) {
    const rest = q.replace(CONFIRM_START_RE, '').replace(/^[,!.\s]+/, '').trim();
    const restAmounts = extractAmounts(rest);
    const restHasAction = restAmounts.length > 0
      && /(xerox|printing|pan|aadhaar|aadhar|voter|ayushman|smart|scan|kharcha|expense|agent|transfer|commission|cash|upi|nagad|hue|hua|mile|mila|diye|diya|jama|payment|refund|wapas|dhandha)/.test(rest);
    if (!restHasAction) return { kind: 'confirm' };
    text = rest;
    q = rest;
  }
  // UPDATE 25: a correction ("Nahi, 250 the", "Nahi, 3 the, 5 nahi")
  // is NEVER a cancel — it carries a number and there is a preview /
  // question / checklist value to correct. A bare "Nahi" (no number)
  // is still a cancel. Without this, the chat UI's confirm/cancel
  // gate (which runs before the router) swallowed corrections.
  const isCorrectionLike = /\d/.test(q)
    && (ctx.pendingAction !== undefined
      || ctx.pendingQuestion?.answeredValue !== undefined
      || ctx.activeChecklist?.count !== undefined);
  if (!isCorrectionLike && /^(nahi|nahin|no|cancel|mat\s*karo|rehne\s*do|chhodo|ruk[o]?|cancel\s*kar)\b/.test(q)) return { kind: 'cancel' };

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
    // UPDATE 26: "Dhanda 300 galat tha, 250 hona chahiye" narrows the
    // correction search to Dhanda entries, like a named service.
    const svc = findServiceIn(q, profile.services) || (isDhandaWord(rawText) ? DHANDA_SERVICE : null);
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

  // --- Delete (UPDATE 23): amount form, service-only form, "isko"
  //     form (last verified save / most recent entry), and bare
  //     delete ("Hatana hai") → clarification listing candidates.
  //     NEVER falls through to the cloud — every form is handled here.
  if (hasDeleteWord(rawText)) {
    // UPDATE 26: "Dhanda wali entry delete kar do" resolves to the
    // general Dhanda category, not to a service-list dead-end.
    const svc = findServiceIn(q, profile.services) || (isDhandaWord(rawText) ? DHANDA_SERVICE : null);
    // 1. Amount form (unchanged behaviour): "Aadhaar 600 wali entry
    //    delete kar do".
    if (amounts.length >= 1) {
      const amt = amounts[0].paise;
      const targets = findAssistantTargets(state, profile.id, { amountPaise: amt, text: svc || expenseCategoryHint(q) || undefined });
      if (targets.length === 0) {
        return { kind: 'error', text: `Mujhe ${money(amt)} ki koi entry nahi mili jo delete kar sakun. Service aur date batao.` };
      }
      if (targets.length > 1) {
        return deleteCandidatesDraft(targets, rawText);
      }
      return deleteActionFor(targets[0]);
    }
    // 2. Service-only form: "Xerox wali entry delete kar do".
    if (svc) {
      const targets = findAssistantTargets(state, profile.id, { text: svc });
      if (targets.length === 0) {
        return { kind: 'error', text: `Mujhe ${svc} ki koi entry nahi mili jo delete kar sakun.` };
      }
      if (targets.length > 1) {
        return deleteCandidatesDraft(targets, rawText);
      }
      return deleteActionFor(targets[0]);
    }
    // 3. "Isko / ye / is entry" + delete → the last verified save
    //    in this conversation, re-read from the store (never trusted
    //    blindly: if it is already gone, say so honestly).
    if (hasDeletePronoun(rawText)) {
      if (ctx.lastSavedEntry) {
        const t = findAssistantTargetById(state, profile.id, ctx.lastSavedEntry.kind, ctx.lastSavedEntry.id);
        if (!t) {
          return { kind: 'error', text: `Ye entry (${ctx.lastSavedEntry.label}) ab records mein nahi hai — pehle hi delete ho chuki hogi. Recycle Bin mein check karo, wahan se restore ho sakti hai.` };
        }
        return deleteActionFor(t);
      }
      const recent = recentAssistantTargets(state, profile.id, 1);
      if (recent.length === 0) {
        return { kind: 'error', text: 'Abhi koi entry nahi hai jo delete kar sakun.' };
      }
      return deleteActionFor(recent[0]);
    }
    // 3b. UPDATE 25 (C-18): ordinal delete — "Dusra wala delete kar
    //      do" / "Pehli wali entry hata do" resolves to the Nth most
    //      recent entry (1st = most recent). With fewer entries than
    //      the ordinal, list the candidates instead of guessing.
    {
      const s = paddedWords(rawText);
      const ordMatch = s.match(/\s(pehla|pehli|pahla|pahli|first|1st)\s/);
      const ord2 = s.match(/\s(dusra|dusri|doosra|doosri|second|2nd)\s/);
      const ord3 = s.match(/\s(teesra|teesri|third|3rd)\s/);
      const ordinal = ordMatch ? 1 : ord2 ? 2 : ord3 ? 3 : 0;
      if (ordinal > 0) {
        const recent = recentAssistantTargets(state, profile.id, 3);
        if (recent.length === 0) {
          return { kind: 'error', text: 'Abhi koi entry nahi hai jo delete kar sakun.' };
        }
        if (recent.length >= ordinal) return deleteActionFor(recent[ordinal - 1]);
        return deleteCandidatesDraft(recent, rawText);
      }
    }
    // 4. Bare delete ("Hatana hai", "delete kar do") → ask WHICH
    //    entry, listing the recent candidates. Never a cloud reply,
    //    never a success claim, never a silent delete.
    const recent = recentAssistantTargets(state, profile.id, 3);
    if (recent.length === 0) {
      return { kind: 'error', text: 'Abhi koi entry nahi hai jo delete kar sakun — pehle koi entry save karo.' };
    }
    if (recent.length === 1) {
      return deleteActionFor(recent[0]);
    }
    return deleteCandidatesDraft(recent, rawText);
  }

  // --- Refund: "Rahul ko 200 refund karna hai". ---
  if (/refund|wapas|return/.test(q) && amounts.length >= 1) {
    const amt = amounts[0].paise;
    // UPDATE 26: a "Dhanda" refund is labelled Dhanda, not 'General'.
    const svc = findServiceIn(q, profile.services) || (isDhandaWord(rawText) ? DHANDA_SERVICE : null);
    const custName = findNameIn(q, [...state.customers.filter((c) => c.profileId === profile.id).map((c) => c.name), ...state.jobs.filter((j) => j.profileId === profile.id).map((j) => j.customerName)]);
    const job = custName
      ? state.jobs.filter((j) => j.profileId === profile.id && j.customerName.toLowerCase() === custName.toLowerCase() && j.receivedPaise >= amt).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
      : undefined;
    const method = cashUpiMethod(extractMethod(q), 'cash');
    const action: AssistantAction = { kind: 'refund', date, jobId: job?.id || null, service: svc || job?.service || 'General', customerName: custName || '', amountPaise: amt, method };
    return { kind: 'action', action, previewLines: [`Refund: ${money(amt)} (${method.toUpperCase()})${custName ? ` to ${custName}` : ''}${job ? ` — ${job.service} job se` : ''}`, 'Ye reversal hai — ordinary kharcha nahi.'], totalPaise: amt };
  }

  // --- Internal transfer: "1000 cash se UPI kar do". ---
  // UPDATE 25 (C-10): "cash se UPI kar do" / "UPI se cash kar do"
  // is an internal transfer even without the words transfer/bhej/
  // move/badal — the "se" between the two modes + "kar do" says it.
  // A plain "Xerox 300 cash, 200 UPI" (two collections, no "se" /
  // "kar do") is NOT this — it stays a daily-income pair.
  const transferWord = /transfer|bhej|move|badal/.test(q);
  const transferSe = /(cash\s*se\s*upi|upi\s*se\s*cash|cash.*upi.*(kar\s*do|bana|badal|convert)|upi.*cash.*(kar\s*do|bana|badal|convert))/.test(q);
  if ((transferWord || transferSe) && /\bcash\b/.test(q) && /\bupi\b/.test(q) && amounts.length >= 1) {
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
  // UPDATE 25 (C-12): NOT for a baaki/udhaar split ("200 diye, baaki
  // 300 udhaar") — that message carries a due that this generic draft
  // (customerPaymentAmount only) would silently drop. Let it fall
  // through to the baaki block below, which asks for the customer AND
  // confirms the due.
  if (/customer|grahak/.test(q) && !/customers\b/.test(q) && !findServiceIn(q, profile.services) && amounts.length >= 1 && /(jama|mila|mile|diye|diya|paid|payment|collect)/.test(q) && !/agent/.test(q) && !(/\b(baaki|baki|udhaar|udhar)\b/.test(q) && amounts.length >= 2)) {
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
    // Amount NEAREST the expense word, not amounts[0]: "Xerox ke 300
    // cash hue, aur 100 ka kagaz kharida" must expense ₹100 (kagaz),
    // never ₹300 (the Xerox income mentioned first).
    const expMatch = rawText.toLowerCase().match(/kharcha|kharach|expense|repair|bijli|electricity|internet|kagaz|paper|\bink\b|kiraya|rent|transport|petrol/);
    const expIdx = expMatch?.index ?? 0;
    const amt = amounts.reduce((best, a) => (Math.abs(a.index - expIdx) < Math.abs(best.index - expIdx) ? a : best), amounts[0]).paise;
    const category = expenseCategoryFor(q, profile);
    // UPDATE 26: an expense "for dhanda" is labelled Dhanda, not 'General'.
    const svc = findServiceIn(q, profile.services) || (isDhandaWord(rawText) ? DHANDA_SERVICE : null) || 'General';
    const method = cashUpiMethod(extractMethod(q), 'cash');
    const desc = rawText.trim();
    const action: AssistantAction = { kind: 'expense', date, category, description: desc.length > 80 ? desc.slice(0, 80) : desc, amountPaise: amt, method, service: svc, vendor: '' };
    return { kind: 'action', action, previewLines: [`Expense: ${category} — ${money(amt)} (${method.toUpperCase()})`, `Service: ${svc}`], totalPaise: amt };
  }

  // --- "Baaki / udhaar" split (UPDATE 25, C-12): "Ramesh ne 200
  //     diye, baaki 300 udhaar" — ₹200 received AND ₹300 due. The due
  //     used to be silently dropped. Two cases:
  //     (a) the customer already has a due job whose due equals
  //         received + stated-due (or covers the payment): the
  //         payment goes against THAT job (customer_payment), and
  //         the preview shows the due falling to the stated ₹300 —
  //         no new due is invented on top of the old one.
  //     (b) no matching due job: a new split — received entry +
  //         'other' (due) entry on the same customer (the backend
  //         creates the customer/job; received stays received and
  //         the due stays due, never mixed).
  //     Unknown customer → draft asking for the customer AND
  //     confirming the due (never silently dropped). Unknown service
  //     → draft asking for the service, carrying the split along.
  {
    const normQ = normalizeMultilingual(rawText.toLowerCase());
    const baakiIdx = normQ.search(/\b(baaki|baki|udhaar|udhar)\b/);
    if (baakiIdx >= 0 && amounts.length >= 2) {
      const dueAmt = amounts.find((a) => a.index > baakiIdx);
      const recvAmt = [...amounts].reverse().find((a) => a.index < baakiIdx) || amounts[0];
      if (dueAmt && recvAmt && dueAmt.paise !== recvAmt.paise) {
        const custName = findNameIn(q, [...state.customers.filter((c) => c.profileId === profile.id).map((c) => c.name), ...state.jobs.filter((j) => j.profileId === profile.id).map((j) => j.customerName)]);
        const method = cashUpiMethod(extractMethod(q), 'cash');
        // UPDATE 26: a "dhanda" baaki split is the general category —
        // it must be resolved BEFORE the customer's latest job service
        // fallback, which would wrongly pin the mix to one service.
        const svc = findServiceIn(q, profile.services)
          || (isDhandaWord(rawText) ? DHANDA_SERVICE : null)
          || (() => {
            if (!custName) return null;
            const custJobs = state.jobs
              .filter((j) => j.profileId === profile.id && j.customerName.toLowerCase() === custName.toLowerCase())
              .sort((a, b) => (a.date < b.date ? 1 : -1));
            return custJobs[0]?.service || null;
          })();
        if (!custName) {
          return draftFor('customer', askIn(rawText, 'askCustomer', {}) + ` ${money(recvAmt.paise)} mile aur ${money(dueAmt.paise)} due (udhaar) hai — customer ka naam batao, dono record kar dunga.`, { baakiReceived: recvAmt.paise, baakiDue: dueAmt.paise, baakiService: svc, baakiMethod: method, date }, rawText);
        }
        if (!svc) {
          return draftFor('service', `${custName} se ${money(recvAmt.paise)} mile aur ${money(dueAmt.paise)} due hai — ye kis service ka kaam tha? Services: ${profile.services.join(', ')}.`, { baakiReceived: recvAmt.paise, baakiDue: dueAmt.paise, baakiCustomer: custName, baakiMethod: method, date }, rawText);
        }
        const dueJobs = state.jobs
          .filter((j) => j.profileId === profile.id && j.customerName.toLowerCase() === custName.toLowerCase() && jobDuePaise(j) > 0)
          .sort((a, b) => (a.date < b.date ? -1 : 1));
        const matching = dueJobs.find((j) => jobDuePaise(j) === recvAmt.paise + dueAmt.paise)
          || dueJobs.find((j) => jobDuePaise(j) > recvAmt.paise);
        if (matching) {
          const job = matching;
          const action: AssistantAction = { kind: 'customer_payment', date, jobId: job.id, customerName: custName, amountPaise: recvAmt.paise, method };
          return { kind: 'action', action, previewLines: [`Payment received: ${custName} se ${money(recvAmt.paise)} (${method.toUpperCase()})`, `${job.service} job — due ${money(jobDuePaise(job))} se ${money(jobDuePaise(job) - recvAmt.paise)} reh jayega (baaki ${money(dueAmt.paise)} udhaar).`], totalPaise: recvAmt.paise };
        }
        const action: AssistantAction = {
          kind: 'daily_income', date,
          entries: [
            { service: svc, amountPaise: recvAmt.paise, method, customerName: custName },
            { service: svc, amountPaise: dueAmt.paise, method: 'other', customerName: custName },
          ],
        };
        return {
          kind: 'action', action,
          previewLines: [
            `${svc} ${money(recvAmt.paise)} (${method.toUpperCase()}) — ${custName} se mile`,
            `${svc} ${money(dueAmt.paise)} (due — abhi mile nahi) — ${custName} ka udhaar`,
          ],
          totalPaise: recvAmt.paise,
        };
      }
    }
  }

  // --- Daily income (the main flow): service + amount (+ method). ---
  {
    // UPDATE 26: 'Dhanda' rides along as a segment service (NOT a
    // profile service) so "Dhanda 500, Xerox 300" splits correctly
    // instead of attributing the ₹500 to Xerox via the prefix rule.
    const segments = splitServiceSegments(text, [...profile.services, DHANDA_SERVICE]);
    const hasServiceWord = segments.some((s) => s.service !== null);
    const hasMoneyWord = /cash|upi|nagad|rupaye|rupees?|rs\.?|₹|hue|hua|hoga|mila|mile|collection|kamai|earning|dhandha/.test(q);
    // UPDATE 26: the whole message is about the day's mixed business
    // ("Aaj dhanda 500 ka hua", "Aaj kaam 500 ka hua", "business 500")
    // — 'business'/'hisab' already normalised to 'dhandha' above.
    const dhandaWord = isDhandaWord(rawText, hasServiceWord);
    // Follow-up = the message STARTS with aur/bhi/add ("Aur 200 UPI bhi
    // add kar do"), or it carries aur/bhi AND a service is already in
    // context. A mid-sentence "aur" joining two amounts ("300 cash aur
    // 200 UPI hue") is NOT a follow-up — without a service in context
    // that message must ask which service, not guess one.
    const followUp = /^(aur|or|also|bhi|add|aur\s+ek|phir)\b/.test(q)
      || (/\b(aur|bhi)\b/.test(q) && !!ctx.lastService);
    if ((hasServiceWord && amounts.length >= 1) || (followUp && amounts.length >= 1 && ctx.lastService) || (hasServiceWord && amounts.length >= 1 && hasMoneyWord) || (dhandaWord && amounts.length >= 1)) {
      const entries: { service: string; amountPaise: number; method: PayMethod | null; customerName?: string; date?: string }[] = [];
      const globalMethods = (text.match(/\b(cash|upi|nagad|online|gpay|phonepe|paytm)\b/g) || []).map((w) => extractMethod(w));
      const uniqueGlobal = [...new Set(globalMethods)];
      let lastService = ctx.lastService || null;
      let missingMethod = false;
      let missingService = false;
      // Per-amount methods for the no-service draft, so answering the
      // service later keeps "300 cash, 200 UPI" as cash + UPI instead
      // of flattening both to one mode.
      let missingServiceMethods: (PayMethod | null)[] = [];
      // UPDATE 25 (C-11): per-amount dates for the no-service draft.
      let missingServiceDates: string[] = [];
      for (const seg of segments) {
        const segAmounts = extractAmounts(seg.text);
        if (segAmounts.length === 0) continue;
        // UPDATE 26: a segment carrying the dhanda word IS the general
        // Dhanda category — it beats a stale lastService ("Xerox" from
        // an earlier turn must not swallow "dhanda 500"). A named
        // service in the same segment still wins ("dhanda: Xerox 300"
        // is a service split, not a Dhanda entry). A bare 'kaam'
        // segment only becomes Dhanda when there is no service in
        // context — in a follow-up ("Aur kaam 200") the pending
        // service wins, as before.
        const segDhandhaToken = /\bdhandha\b/.test(normalizeMultilingual(seg.text.toLowerCase()));
        const service = seg.service
          || (segDhandhaToken ? DHANDA_SERVICE : lastService)
          || (isDhandaWord(seg.text, false) ? DHANDA_SERVICE : null);
        if (!service) {
          missingService = true;
          for (let ai = 0; ai < segAmounts.length; ai++) {
            const a = segAmounts[ai];
            const amtLen = String(a.paise / 100).length;
            let m = methodNear(seg.text, a.index, amtLen, ai + 1 < segAmounts.length ? segAmounts[ai + 1].index : undefined);
            if (!m && uniqueGlobal.length === 1) m = uniqueGlobal[0];
            missingServiceMethods.push(m);
            missingServiceDates.push(dateNearAmount(seg.text, a.index, today));
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
          // UPDATE 25 (C-11): each amount keeps its own date
          // ("aaj ... 150, aur kal ke 200" — 150 today, 200 yesterday).
          entries.push({ service, amountPaise: a.paise, method, date: dateNearAmount(seg.text, a.index, today) });
        }
        lastService = service;
      }
      if (missingService && entries.length === 0) {
        return draftFor('service', askIn(rawText, 'askService', { amount: money(amounts[0].paise), services: profile.services.join(', ') }), { pendingAmounts: amounts.map((a) => a.paise), pendingMethods: missingServiceMethods, pendingDates: missingServiceDates, date }, rawText);
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
      const action: AssistantAction = { kind: 'daily_income', date, entries: entries.map((e) => ({ service: e.service, amountPaise: e.amountPaise, method: e.method || 'cash', customerName: e.customerName, date: e.date })) };
      const total = entries.reduce((a, e) => a + e.amountPaise, 0);
      const previewLines = entries.map((e) => entryPreviewLine(e, date, today));
      const dup = findDuplicateWarning(state, profile.id, action);
      // UPDATE 26 safe default: a Dhanda add warns with today's
      // Dhanda total so far (any earlier Dhanda entry today, not just
      // an exact same-amount duplicate) before it is added again.
      // For a pure Dhanda add the draft below asks first ("upar add
      // karun ya total badal dun?" — diagnosis §6b); the warning
      // here is only the fallback for mixed or baaki entries.
      const dhWarn = dhandaWarningForEntries(state, profile.id, entries, date);
      const dhDraft = dhandaAddModeDraft(state, profile, entries, date, rawText);
      if (dhDraft) return dhDraft;
      return { kind: 'action', action, previewLines, totalPaise: total, duplicateWarning: dhWarn || dup || undefined };
    }
    // Service mentioned but no amount → ask for amount.
    if (hasServiceWord && amounts.length === 0 && !/kitna|kitne|kitni|kya|batao|dikhao|compare|kab|kaise|kahan|kaun|kab/.test(q)) {
      const svc = segments.find((s) => s.service)?.service || null;
      return draftFor('amount', askIn(rawText, 'askAmount', { service: svc || 'Service' }), { pendingService: svc, date }, rawText);
    }
    // UPDATE 26: "Dhanda add kar do" (no amount, no question word) →
    // ask for the amount ONCE, with Dhanda as the pending service.
    // A question ("Aaj dhanda kitna hua?") carries kitna/kya and
    // falls through to the knowledge answer instead — never a draft.
    if (dhandaWord && amounts.length === 0 && !/kitna|kitne|kitni|kya|batao|dikhao|compare|kab|kaise|kahan|kaun|kab/.test(q)) {
      return draftFor('amount', askIn(rawText, 'askAmount', { service: DHANDA_SERVICE }), { pendingService: DHANDA_SERVICE, date }, rawText);
    }
    // Amount + money words but no service → ask for service (unless follow-up with context).
    // Carry the per-amount methods along, so answering the service
    // later keeps "300 cash, 200 UPI" as cash + UPI.
    // UPDATE 26: a dhanda amount never reaches this branch — it is
    // the general Dhanda category, not a missing service.
    if (amounts.length >= 1 && !hasServiceWord && hasMoneyWord && !followUp && !dhandaWord && !/kharcha|expense/.test(q)) {
      const pendingMethods = amounts.map((a, i) => methodNear(text, a.index, String(a.paise / 100).length, i + 1 < amounts.length ? amounts[i + 1].index : undefined));
      return draftFor('service', askIn(rawText, 'askService', { amount: money(amounts[0].paise), services: profile.services.join(', ') }), { pendingAmounts: amounts.map((a) => a.paise), pendingMethods, date }, rawText);
    }
  }

  return { kind: 'question' };
}

/**
 * UPDATE 26 — the service dead-end, with an escape hatch and an
 * escalation instead of a loop. First failure: the short "Service
 * samajh nahi aaya" text PLUS the Dhanda escape hatch (it is a LAST
 * resort for a genuinely unknown service word, and it must never
 * fire for dhanda/kaam/business/hisaab — resolveServiceReply handles
 * those first). Second failure on the SAME draft: a different,
 * escalated question that offers Dhanda (whole day's mix) or one
 * named service, with examples — the identical text is never
 * repeated twice. The attempt count rides in partial.serviceAskCount.
 */
function serviceDeadEnd(
  profile: BusinessProfile,
  p: Record<string, unknown>,
  original: string,
): ParsedMessage {
  const count = ((p.serviceAskCount as number | undefined) || 0) + 1;
  const partial = { ...p, serviceAskCount: count };
  if (count >= 2) {
    return draftFor(
      'service',
      `Samajh nahi aaya — ye poora din ka mix (Dhanda) tha, ya kisi ek service ka? 'Dhanda' likho, ya service ka naam likho — jaise Xerox, Printing, PAN Card. Amount aur Cash/UPI main pehle se jaanta hoon, bas service bata do.`,
      partial,
      original,
    );
  }
  return draftFor(
    'service',
    `Service samajh nahi aaya. Services: ${profile.services.join(', ')}. Ya 'Dhanda' likho — agar poora din ka mix tha.`,
    partial,
    original,
  );
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
    const entries = (p.pendingEntries as { service: string; amountPaise: number; method: PayMethod | null; date?: string }[]).map((e) => ({ ...e, method: e.method || method }));
    const date = (p.date as string) || todayISO();
    const action: AssistantAction = { kind: 'daily_income', date, entries: entries.map((e) => ({ service: e.service, amountPaise: e.amountPaise, method: e.method || 'cash', date: (e as { date?: string }).date })) };
    const total = entries.reduce((a, e) => a + e.amountPaise, 0);
    const dup = findDuplicateWarning(state, profile.id, action);
    const dhWarn = dhandaWarningForEntries(state, profile.id, entries, date);
    // UPDATE 26 safe default (diagnosis §6b): a second Dhanda add on
    // the same day asks "upar add karun ya total badal dun?" first.
    const dhDraft = dhandaAddModeDraft(state, profile, entries, date, draft.original);
    if (dhDraft) return dhDraft;
    return { kind: 'action', action, previewLines: entries.map((e) => entryPreviewLine(e, date, todayISO())), totalPaise: total, duplicateWarning: dhWarn || dup || undefined };
  }
  // UPDATE 25 (C-12): baaki split waiting on the service — the reply
  // names the service; the received + due split is built as one action.
  if (draft.missing === 'service' && p.baakiReceived !== undefined) {
    // UPDATE 26: 'dhanda' here is the general category, never a dead-end.
    const svc = resolveServiceReply(replyText, profile.services);
    if (!svc) return serviceDeadEnd(profile, p, draft.original);
    const custName = p.baakiCustomer as string;
    const method = (p.baakiMethod as Method) || cashUpiMethod(extractMethod(q), 'cash');
    const date = (p.date as string) || todayISO();
    const action: AssistantAction = {
      kind: 'daily_income', date,
      entries: [
        { service: svc, amountPaise: p.baakiReceived as number, method, customerName: custName },
        { service: svc, amountPaise: p.baakiDue as number, method: 'other', customerName: custName },
      ],
    };
    return {
      kind: 'action', action,
      previewLines: [
        `${svc} ${formatINR(p.baakiReceived as number)} (${method.toUpperCase()}) — ${custName} se mile`,
        `${svc} ${formatINR(p.baakiDue as number)} (due — abhi mile nahi) — ${custName} ka udhaar`,
      ],
      totalPaise: p.baakiReceived as number,
      duplicateWarning: dhandaWarningForEntries(state, profile.id, action.entries, date) || undefined,
    };
  }
  if (draft.missing === 'service' && p.pendingAmounts) {
    // UPDATE 26: this is the exact screenshot loop — the user answers
    // the service question with "dhanda" and the old code returned the
    // identical dead-end again. 'dhanda' now resolves to the general
    // Dhanda category; a genuinely unknown word escalates instead.
    const svc = resolveServiceReply(replyText, profile.services);
    if (!svc) return serviceDeadEnd(profile, p, draft.original);
    const method = extractMethod(q);
    // Per-amount modes from the original message ("300 cash, 200 UPI")
    // survive: the reply's mode fills only the amounts whose mode is
    // still unknown, it never overwrites a stated mode.
    const pendingMethods = (p.pendingMethods as (PayMethod | null)[] | undefined) || [];
    // UPDATE 25 (C-11): per-amount dates survive the draft too.
    const pendingDates = (p.pendingDates as (string | undefined)[] | undefined) || [];
    const entries = (p.pendingAmounts as number[]).map((a, i) => ({ service: svc, amountPaise: a, method: (pendingMethods[i] || method || null) as PayMethod | null, date: pendingDates[i] }));
    if (entries.some((e) => !e.method)) {
      return draftFor('method', `${svc} ke ${formatINR(entries[0].amountPaise)} — Cash mein mile ya UPI mein?`, { pendingEntries: entries, date: p.date }, draft.original);
    }
    const date = (p.date as string) || todayISO();
    const action: AssistantAction = { kind: 'daily_income', date, entries: entries.map((e) => ({ service: e.service, amountPaise: e.amountPaise, method: e.method || 'cash', date: e.date })) };
    const total = entries.reduce((a, e) => a + e.amountPaise, 0);
    const dup = findDuplicateWarning(state, profile.id, action);
    const dhWarn = dhandaWarningForEntries(state, profile.id, entries, date);
    // UPDATE 26 safe default (diagnosis §6b): a second Dhanda add on
    // the same day asks "upar add karun ya total badal dun?" first.
    const dhDraft = dhandaAddModeDraft(state, profile, entries, date, draft.original);
    if (dhDraft) return dhDraft;
    return { kind: 'action', action, previewLines: entries.map((e) => entryPreviewLine(e, date, todayISO())), totalPaise: total, duplicateWarning: dhWarn || dup || undefined };
  }
  // UPDATE 26 safe default (diagnosis §6b): a second Dhanda add on
  // the same day — the user chooses "add on top" or "replace the
  // total". Bare "haan" means add on top (Confirm semantics); a bare
  // "nahi" cancels and nothing is saved. A correction with an amount
  // ("Nahi, 250 the") rebuilds the pending amount and re-asks the
  // choice instead of cancelling (UPDATE 25 correction guard).
  if (draft.missing === 'dhanda_add_mode' && p.pendingEntries) {
    const reply = replyText.trim().toLowerCase();
    const replyAmounts = extractAmounts(replyText);
    const entries = p.pendingEntries as { service: string; amountPaise: number; method: PayMethod | null; date?: string }[];
    const date = (p.date as string) || todayISO();
    const newTotal = entries.reduce((a, e) => a + e.amountPaise, 0);
    // Correction of the pending amount: rebuild + re-ask the choice.
    if (replyAmounts.length >= 1 && /nahi|nahin|galat|wrong|sahi|badal|theek\s*karo/.test(reply) && replyAmounts[0].paise !== newTotal) {
      const corrected = entries.map((e, i) => (i === 0 ? { ...e, amountPaise: replyAmounts[0].paise } : e));
      const redraft = dhandaAddModeDraft(state, profile, corrected, date, draft.original);
      if (redraft) return redraft;
    }
    // "Total badal do": correct the MOST RECENT Dhanda entry of the
    // day to the new amount (the existing tested correct_entry path
    // — it updates the entry AND its linked CashTxn). The preview
    // says so, with the day total that results.
    if (/total\s*badal|badal\s*do|yehi\s*total|ye\s*total|replace|sahi\s*total|badlo|correct\s*kar/.test(reply)) {
      const existing = state.dailyEntries
        .filter((x) => x.profileId === profile.id && x.service === DHANDA_SERVICE && x.date === date && x.method !== 'other')
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      const target = existing[existing.length - 1];
      if (!target) {
        return { kind: 'error', text: 'Aaj ki Dhanda entry ab records mein nahi mili — dobara batao kitna add karna hai.' };
      }
      const totalAfter = (p.existingDhandaPaise as number) - target.totalPaise + newTotal;
      const action: AssistantAction = { kind: 'correct_entry', targetKind: 'daily', targetId: target.id, label: `Dhanda ${formatINR(target.totalPaise)} (${target.method.toUpperCase()})`, oldAmountPaise: target.totalPaise, newAmountPaise: newTotal };
      return {
        kind: 'action', action,
        previewLines: [
          `Correct: Dhanda ${formatINR(target.totalPaise)} (${target.method.toUpperCase()}) — sabse recent Dhanda entry`,
          `Naya amount: ${formatINR(newTotal)} (pehle ${formatINR(target.totalPaise)}) — aaj ka Dhanda total ${formatINR(totalAfter)} ho jayega.`,
        ],
        totalPaise: newTotal,
      };
    }
    // Add on top (bare "haan" counts — Confirm semantics).
    if (/upar|aur\s*add|add\s*kar|add\s*on|jod\s*do|jod|haan|ha\b|yes|ok|kar\s*do|theek\s*hai|bilkul/.test(reply)) {
      const action: AssistantAction = { kind: 'daily_income', date, entries: entries.map((e) => ({ service: e.service, amountPaise: e.amountPaise, method: e.method || 'cash', date: e.date })) };
      const dup = findDuplicateWarning(state, profile.id, action);
      return { kind: 'action', action, previewLines: entries.map((e) => entryPreviewLine(e, date, todayISO())), totalPaise: newTotal, duplicateWarning: dup || undefined };
    }
    // Bare "nahi" (no amount) cancels — nothing is saved.
    if (replyAmounts.length === 0 && /^(nahi|nahin|no|cancel|mat\s*karo|rehne\s*do|chhodo|ruk[o]?)\b/.test(reply)) {
      return { kind: 'error', text: `Theek hai — ye Dhanda entry add nahi ki. Aaj ka Dhanda total wahi rahega jo pehle se saved hai (${formatINR(p.existingDhandaPaise as number)}).` };
    }
    // Anything else — ask the same question again (same draft).
    return draftFor('dhanda_add_mode', draft.question, p, draft.original);
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
    // UPDATE 26 safe default (diagnosis §6b): a second Dhanda add on
    // the same day asks "upar add karun ya total badal dun?" first;
    // the preview warning below is only the fallback for mixed or
    // baaki entries (the draft returns null for those).
    const dhDraft = dhandaAddModeDraft(state, profile, entries, date, draft.original);
    if (dhDraft) return dhDraft;
    const dhWarn = dhandaWarningForEntries(state, profile.id, entries, date);
    return { kind: 'action', action, previewLines: entries.map((e) => `${e.service} ${formatINR(e.amountPaise)} (${e.method.toUpperCase()})`), totalPaise: total, duplicateWarning: dhWarn || undefined };
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
  // UPDATE 25 (C-12): baaki split waiting on the customer — the
  // reply names the customer; received + due are recorded together.
  // If the service is still unknown, ask for it next (carrying the
  // split along) instead of guessing a service.
  if (draft.missing === 'customer' && p.baakiReceived !== undefined) {
    const name = replyText.trim().replace(/\s+ko$/, '');
    if (name.length < 2) return draftFor('customer', 'Customer ka naam batao.', p, draft.original);
    const svc = p.baakiService as string | null;
    if (!svc) {
      return draftFor('service', `${name} se ${formatINR(p.baakiReceived as number)} mile aur ${formatINR(p.baakiDue as number)} due hai — ye kis service ka kaam tha? Services: ${profile.services.join(', ')}.`, { baakiReceived: p.baakiReceived, baakiDue: p.baakiDue, baakiCustomer: name, baakiMethod: p.baakiMethod, date: p.date }, draft.original);
    }
    const method = (p.baakiMethod as Method) || 'cash';
    const date = (p.date as string) || todayISO();
    const action: AssistantAction = {
      kind: 'daily_income', date,
      entries: [
        { service: svc, amountPaise: p.baakiReceived as number, method, customerName: name },
        { service: svc, amountPaise: p.baakiDue as number, method: 'other', customerName: name },
      ],
    };
    return {
      kind: 'action', action,
      previewLines: [
        `${svc} ${formatINR(p.baakiReceived as number)} (${method.toUpperCase()}) — ${name} se mile`,
        `${svc} ${formatINR(p.baakiDue as number)} (due — abhi mile nahi) — ${name} ka udhaar`,
      ],
      totalPaise: p.baakiReceived as number,
    };
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
    const targets = p.targets as { kind: 'daily' | 'job' | 'expense' | 'mt'; id: string; label: string; amountPaise: number; service?: string; date: string }[];
    let picked = Number.isInteger(n) && n >= 1 && n <= targets.length ? targets[n - 1] : targets.find((t) => q.includes(t.label.toLowerCase().slice(0, 12)));
    if (!picked) {
      // UPDATE 23 — the user answers with the amount/service instead
      // of the list number ("Aadhaar 600 wali", "600 wali"): match on
      // those instead of asking for the number again.
      const replyAmounts = extractAmounts(replyText);
      const replySvc = findServiceIn(q, profile.services) || (isDhandaWord(replyText) ? DHANDA_SERVICE : null);
      const byAmount = replyAmounts.length > 0 ? targets.filter((t) => t.amountPaise === replyAmounts[0].paise) : [];
      const byService = replySvc ? targets.filter((t) => (t.service || '').toLowerCase() === replySvc.toLowerCase() || t.label.toLowerCase().includes(replySvc.toLowerCase())) : [];
      const both = byAmount.filter((t) => byService.length === 0 || byService.includes(t));
      if (both.length === 1) picked = both[0];
      else if (byAmount.length === 1 && byService.length === 0) picked = byAmount[0];
      else if (byService.length === 1 && byAmount.length === 0) picked = byService[0];
    }
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

