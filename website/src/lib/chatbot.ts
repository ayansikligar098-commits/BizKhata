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
import { SERVICE_ALIASES, findNameIn, findServiceIn, normalizeDevanagariWords, parseDateRange } from './knowledge';

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
  if (/[\u0900-\u097F]/.test(q)) return 'hi';
  const s = q.toLowerCase();
  if (/\b(aaj|kal|kitna|kitne|kaun|kisne|kya|kab|dena|lena|baaki|baki|munafa|faayda|fayda|kharcha|kamai|paise|rupay|batao|dikhao|mere|mera|meri|hoga|hain|hai|kar|do|bolo|bata)\b/.test(s)) return 'hi';
  return 'en';
}

export type ChatIntent =
  | 'profit' | 'income' | 'expenses' | 'due' | 'agents' | 'mt'
  | 'balance' | 'overview' | 'help' | 'greeting' | 'unknown';

function has(q: string, re: RegExp): boolean {
  return re.test(q);
}

/** Built-in factual responder — every figure comes from the real ledgers. */
export function answerLocally(question: string, f: BusinessFacts): { intent: ChatIntent; text: string } {
  const lang = detectLang(question);
  const q = question.toLowerCase();
  const hi = lang === 'hi';
  const noData = !f.hasData;

  const t = (h: string, e: string) => (hi ? h : e);

  // Greeting / help first (they contain no figures).
  if (has(q, /^(hi|hii+|hello|hey|namaste|namaskar|ram\s*ram|good\s(morning|afternoon|evening)|salaam|adaab)\b/)) {
    return {
      intent: 'greeting',
      text: t(
        'Namaste! Main aapka BizKhata AI Assistant hoon. Mujhse poochho: aaj ka profit, aaj ki kamai, kharcha, customer due, agent payable, Money Transfer commission, ya cash/UPI balance.',
        'Hello! I am your BizKhata AI Assistant. Ask me about: today\u2019s profit, today\u2019s income, expenses, customer dues, agent payables, Money Transfer commission, or cash/UPI balance.',
      ),
    };
  }
  if (has(q, /help|madad|kya kar sakte|what can you|kaise (use|kaam)|how (to|do)/)) {
    return {
      intent: 'help',
      text: t(
        'Main ye bata sakta hoon — sab aapke real record se:\n• Aaj ka profit / kamai / kharcha\n• Customer due — kaun kitna dena baaki hai\n• Agent payable — agent ko kitna dena hai\n• Money Transfer — aaj ka commission aur profit\n• Cash aur UPI balance\nNeeche diye gaye sawal par tap karo ya apna sawal likho.',
        'I can tell you — all from your real records:\n• Today\u2019s profit / income / expenses\n• Customer dues — who owes how much\n• Agent payables — what you owe each agent\n• Money Transfer — today\u2019s commission and profit\n• Cash and UPI balance\nTap a suggested question below or type your own.',
      ),
    };
  }

  if (noData) {
    return {
      intent: 'unknown',
      text: t(
        'Abhi koi record nahi hai — isliye main koi figure nahi bata sakta. Pehle ek job, payment, kharcha ya Money Transfer add karo, phir mujhse poochho (jaise: "Aaj ka profit kitna hai?").',
        'There are no records yet, so I cannot quote any figure. Add a job, payment, expense or Money Transfer first, then ask me (for example: "What is today\u2019s profit?").',
      ),
    };
  }

  // Agent payable (check before customer due — both mention "dena").
  if (has(q, /agent/)) {
    if (f.agentPayablePaise <= 0) {
      return { intent: 'agents', text: t('Kisi agent ko kuch dena baaki nahi hai — sab clear hai.', 'You owe no agent anything — everything is clear.') };
    }
    const lines = f.agentDues.map((d) => `• ${d.name} — ${formatINR(d.duePaise)}`).join('\n');
    return {
      intent: 'agents',
      text: t(
        `Agent ko kul dena baaki hai: ${formatINR(f.agentPayablePaise)}.\n${lines}`,
        `Total payable to agents: ${formatINR(f.agentPayablePaise)}.\n${lines}`,
      ),
    };
  }

  // Money Transfer (check before income — "commission" is MT-only profit).
  if (has(q, /money transfer|\bmt\b|commission/)) {
    if (f.mtTodayTransfers === 0 && f.mtPending === 0) {
      return { intent: 'mt', text: t('Aaj koi Money Transfer nahi hua aur koi pending transfer bhi nahi hai.', 'No Money Transfer happened today and none is pending.') };
    }
    return {
      intent: 'mt',
      text: t(
        `Aaj Money Transfer: ${f.mtTodayTransfers} transfer, kul bheja ${formatINR(f.mtTodaySentPaise)}, commission ${formatINR(f.mtTodayCommissionPaise)}, MT profit ${formatINR(f.mtTodayProfitPaise)}. Pending transfer: ${f.mtPending}.`,
        `Money Transfer today: ${f.mtTodayTransfers} transfers, total sent ${formatINR(f.mtTodaySentPaise)}, commission ${formatINR(f.mtTodayCommissionPaise)}, MT profit ${formatINR(f.mtTodayProfitPaise)}. Pending transfers: ${f.mtPending}.`,
      ),
    };
  }

  // Profit.
  if (has(q, /profit|munafa|faayda|fayda/)) {
    return {
      intent: 'profit',
      text: t(
        `Aaj ka profit ${formatINR(f.todayProfitPaise)} hai (income ${formatINR(f.todayIncomePaise)} − kharcha ${formatINR(f.todayExpensePaise)}). Is mahine ka profit ab tak ${formatINR(f.monthProfitPaise)} hai.`,
        `Today\u2019s profit is ${formatINR(f.todayProfitPaise)} (income ${formatINR(f.todayIncomePaise)} − expenses ${formatINR(f.todayExpensePaise)}). This month\u2019s profit so far is ${formatINR(f.monthProfitPaise)}.`,
      ),
    };
  }

  // Income.
  if (has(q, /income|kamai|received|collection|aaya|mila/)) {
    return {
      intent: 'income',
      text: t(
        `Aaj ki kamai (received) ${formatINR(f.todayIncomePaise)} hai. Is mahine ki kamai ab tak ${formatINR(f.monthIncomePaise)} hai.`,
        `Today\u2019s income (received) is ${formatINR(f.todayIncomePaise)}. This month\u2019s income so far is ${formatINR(f.monthIncomePaise)}.`,
      ),
    };
  }

  // Expenses.
  if (has(q, /expense|kharcha|kharach|spend/)) {
    return {
      intent: 'expenses',
      text: t(
        `Aaj ka kharcha ${formatINR(f.todayExpensePaise)} hai. Is mahine ka kharcha ab tak ${formatINR(f.monthExpensePaise)} hai.`,
        `Today\u2019s expenses are ${formatINR(f.todayExpensePaise)}. This month\u2019s expenses so far are ${formatINR(f.monthExpensePaise)}.`,
      ),
    };
  }

  // Customer due.
  if (has(q, /due|udhaar|udhar|baaki|baki|dena|owe|owes|collect|pending|kisne|kaun/)) {
    if (f.customerDuePaise <= 0) {
      return { intent: 'due', text: t('Koi customer due nahi hai — sab clear hai.', 'No customer owes anything — everything is clear.') };
    }
    const lines = f.topDues.map((d) => `• ${d.name} — ${formatINR(d.duePaise)}`).join('\n');
    return {
      intent: 'due',
      text: t(
        `Kul customer due ${formatINR(f.customerDuePaise)} hai. Sabse zyada dena baaki:\n${lines}`,
        `Total customer due is ${formatINR(f.customerDuePaise)}. Biggest amounts owed:\n${lines}`,
      ),
    };
  }

  // Balances.
  if (has(q, /balance|cash|upi|kitne paise (hai|bache)|available/)) {
    return {
      intent: 'balance',
      text: t(
        `Cash balance ${formatINR(f.cashPaise)} hai aur UPI balance ${formatINR(f.upiPaise)} hai. Kul ${formatINR(f.cashPaise + f.upiPaise)} available hai.`,
        `Cash balance is ${formatINR(f.cashPaise)} and UPI balance is ${formatINR(f.upiPaise)}. Total available: ${formatINR(f.cashPaise + f.upiPaise)}.`,
      ),
    };
  }

  // Overview / summary.
  if (has(q, /overview|summary|haal|hisab|report|sab kuch|kul|aaj ka (kya|kaise)|today/)) {
    return {
      intent: 'overview',
      text: t(
        `Aaj ka hisab:\n• Income: ${formatINR(f.todayIncomePaise)}\n• Kharcha: ${formatINR(f.todayExpensePaise)}\n• Profit: ${formatINR(f.todayProfitPaise)}\n• Customer due: ${formatINR(f.customerDuePaise)}\n• Agent payable: ${formatINR(f.agentPayablePaise)}\n• MT commission (aaj): ${formatINR(f.mtTodayCommissionPaise)}\n• Cash: ${formatINR(f.cashPaise)} • UPI: ${formatINR(f.upiPaise)}`,
        `Today\u2019s summary:\n• Income: ${formatINR(f.todayIncomePaise)}\n• Expenses: ${formatINR(f.todayExpensePaise)}\n• Profit: ${formatINR(f.todayProfitPaise)}\n• Customer due: ${formatINR(f.customerDuePaise)}\n• Agent payable: ${formatINR(f.agentPayablePaise)}\n• MT commission (today): ${formatINR(f.mtTodayCommissionPaise)}\n• Cash: ${formatINR(f.cashPaise)} • UPI: ${formatINR(f.upiPaise)}`,
      ),
    };
  }

  return {
    intent: 'unknown',
    text: t(
      'Sorry, ye main nahi bata sakta. Main ye bata sakta hoon: aaj ka profit, income, kharcha, customer due, agent payable, Money Transfer commission, cash/UPI balance. Neeche diye gaye sawal par tap karo.',
      'Sorry, I cannot answer that. I can tell you about: today\u2019s profit, income, expenses, customer dues, agent payables, Money Transfer commission, and cash/UPI balance. Tap a suggested question below.',
    ),
  };
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

const DEVANAGARI_DIGITS: Record<string, string> = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

export function normalizeDigits(text: string): string {
  return text.replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS[d] || d);
}

const HINDI_NUMBERS: Record<string, number> = {
  ek: 1, do: 2, teen: 3, chaar: 4, paanch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
  bees: 20, tees: 30, chalees: 40, pachaas: 50, pachas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90,
};

/** Replace Hindi number words ("do sau", "paanch hazaar") with digits. */
export function normalizeNumberWords(text: string): string {
  let s = normalizeDevanagariWords(normalizeDigits(text.toLowerCase()));
  // Fold nukta forms (ज़ेरॉक्स -> जेरॉक्स) so service matching works.
  s = s.replace(/ज़/g, 'ज').replace(/फ़/g, 'फ').replace(/क़/g, 'क').replace(/ख़/g, 'ख').replace(/ग़/g, 'ग');
  s = s.replace(/\b(ek|do|teen|chaar|paanch|chhe|saat|aath|nau|das)\s+hazaar\b/g, (_m, w) => String((HINDI_NUMBERS[w] || 1) * 1000));
  s = s.replace(/\b(ek|do|teen|chaar|paanch|chhe|saat|aath|nau|das)\s+sau\b/g, (_m, w) => String((HINDI_NUMBERS[w] || 1) * 100));
  s = s.replace(/\bhazaar\b/g, '1000');
  s = s.replace(/\bsau\b/g, '100');
  s = s.replace(/\bdedh\s+sau\b/g, '150');
  return s;
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
    // A count, not money: "5 customers", "10 pages", "3 copies".
    if (/^\s*(customers?|clients?|pages?|copies|photos?|jobs?|log|pieces?|items?)\b/.test(after.toLowerCase())) continue;
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
  const s = raw.toLowerCase();
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
      return draftFor('commission', `${receiver} ko ${money(principal)} transfer par commission kitna mila? (0 ho to 0 likho)`, { mtReceiver: receiver, mtPrincipal: principal, date }, rawText);
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

  // --- Agent payment: "Agent Ramesh ko 500 diye". ---
  if (/agent/.test(q) && /diye|diya|pay|paid|payment|de\s*diye|dena/.test(q)) {
    const agentName = findNameIn(q, state.agents.filter((a) => a.profileId === profile.id).map((a) => a.name));
    if (!agentName) {
      const names = state.agents.filter((a) => a.profileId === profile.id).map((a) => a.name);
      return draftFor('agent', `Kis agent ko payment diya?${names.length ? ` Agents: ${names.join(', ')}.` : ' Is profile mein koi agent nahi hai — pehle agent add karo.'}`, { agentAmount: amounts[0]?.paise, date }, rawText);
    }
    if (amounts.length === 0) {
      return draftFor('amount', `${agentName} ko kitne rupaye diye?`, { agentName, date }, rawText);
    }
    const agent = state.agents.find((a) => a.profileId === profile.id && a.name === agentName)!;
    const method = cashUpiMethod(extractMethod(q), 'cash');
    const action: AssistantAction = { kind: 'agent_payment', date, agentId: agent.id, agentName, amountPaise: amounts[0].paise, method };
    return { kind: 'action', action, previewLines: [`Agent payment: ${agentName} ko ${money(amounts[0].paise)} (${method.toUpperCase()})`, 'Ye agent payment hai — customer kharcha nahi.'], totalPaise: amounts[0].paise };
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
    const followUp = /^(aur|or|also|bhi|add|aur\s+ek|phir)/.test(q) || /\b(aur|bhi)\b/.test(q);
    if ((hasServiceWord && amounts.length >= 1) || (followUp && amounts.length >= 1 && ctx.lastService) || (hasServiceWord && amounts.length >= 1 && hasMoneyWord)) {
      const entries: { service: string; amountPaise: number; method: PayMethod; customerName?: string }[] = [];
      const globalMethods = (text.match(/\b(cash|upi|nagad|online|gpay|phonepe|paytm)\b/g) || []).map((w) => extractMethod(w));
      const uniqueGlobal = [...new Set(globalMethods)];
      let lastService = ctx.lastService || null;
      let missingMethod = false;
      let missingService = false;
      for (const seg of segments) {
        const segAmounts = extractAmounts(seg.text);
        if (segAmounts.length === 0) continue;
        const service = seg.service || lastService;
        if (!service) { missingService = true; continue; }
        for (let ai = 0; ai < segAmounts.length; ai++) {
          const a = segAmounts[ai];
          // Per-amount payment mode ("300 cash, 200 UPI" — not one mode
          // for the whole segment).
          const amtLen = String(a.paise / 100).length;
          let method = methodNear(seg.text, a.index, amtLen, ai + 1 < segAmounts.length ? segAmounts[ai + 1].index : undefined);
          if (!method && uniqueGlobal.length === 1) method = uniqueGlobal[0];
          if (!method) missingMethod = true;
          entries.push({ service, amountPaise: a.paise, method: method || 'cash' });
        }
        lastService = service;
      }
      if (missingService && entries.length === 0) {
        return draftFor('service', `Ye amount kis service ka hai? Services: ${profile.services.join(', ')}.`, { pendingAmounts: amounts.map((a) => a.paise), date }, rawText);
      }
      if (entries.length === 0) {
        return draftFor('amount', 'Kitne rupaye hue? Amount batao.', { pendingService: segments[0]?.service || ctx.lastService, date }, rawText);
      }
      if (missingMethod) {
        const first = entries[0];
        return draftFor('method', `${first.service} ke ${money(first.amountPaise)} — Cash mein mile ya UPI mein?`, { pendingEntries: entries, date }, rawText);
      }
      // 'other' (udhaar) entries: customer name present?
      const custName = findNameIn(q, state.customers.filter((c) => c.profileId === profile.id).map((c) => c.name));
      if (custName && entries.some((e) => e.method === 'other')) {
        for (const e of entries) if (e.method === 'other') e.customerName = custName;
      }
      const action: AssistantAction = { kind: 'daily_income', date, entries: entries.map((e) => ({ service: e.service, amountPaise: e.amountPaise, method: e.method, customerName: e.customerName })) };
      const total = entries.reduce((a, e) => a + e.amountPaise, 0);
      const previewLines = entries.map((e) => `${e.service} ${money(e.amountPaise)} ${e.method === 'other' ? '(due — abhi mile nahi)' : `(${e.method.toUpperCase()})`}${e.customerName ? ` — ${e.customerName}` : ''}`);
      const dup = findDuplicateWarning(state, profile.id, action);
      return { kind: 'action', action, previewLines, totalPaise: total, duplicateWarning: dup || undefined };
    }
    // Service mentioned but no amount → ask for amount.
    if (hasServiceWord && amounts.length === 0 && !/kitna|kitne|kitni|kya|batao|dikhao|compare|kab|kaise|kahan|kaun|kab/.test(q)) {
      const svc = segments.find((s) => s.service)?.service || null;
      return draftFor('amount', `${svc ? `${svc} ke ` : ''}kitne rupaye hue?`, { pendingService: svc, date }, rawText);
    }
    // Amount + money words but no service → ask for service (unless follow-up with context).
    if (amounts.length >= 1 && !hasServiceWord && hasMoneyWord && !followUp && !/kharcha|expense/.test(q)) {
      return draftFor('service', `${money(amounts[0].paise)} kis service ke hue? Services: ${profile.services.join(', ')}.`, { pendingAmounts: amounts.map((a) => a.paise), date }, rawText);
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
    const entries = (p.pendingEntries as { service: string; amountPaise: number; method: PayMethod }[]).map((e) => ({ ...e, method }));
    const date = (p.date as string) || todayISO();
    const action: AssistantAction = { kind: 'daily_income', date, entries: entries.map((e) => ({ service: e.service, amountPaise: e.amountPaise, method: e.method })) };
    const total = entries.reduce((a, e) => a + e.amountPaise, 0);
    const dup = findDuplicateWarning(state, profile.id, action);
    return { kind: 'action', action, previewLines: entries.map((e) => `${e.service} ${formatINR(e.amountPaise)} ${e.method === 'other' ? '(due — abhi mile nahi)' : `(${e.method.toUpperCase()})`}`), totalPaise: total, duplicateWarning: dup || undefined };
  }
  if (draft.missing === 'service' && p.pendingAmounts) {
    const svc = findServiceIn(q, profile.services);
    if (!svc) return draftFor('service', `Service samajh nahi aaya. Services: ${profile.services.join(', ')}.`, p, draft.original);
    const method = extractMethod(q);
    if (!method) {
      const entries = (p.pendingAmounts as number[]).map((a) => ({ service: svc, amountPaise: a, method: 'cash' as PayMethod }));
      return draftFor('method', `${svc} ke ${formatINR(entries[0].amountPaise)} — Cash mein mile ya UPI mein?`, { pendingEntries: entries, date: p.date }, draft.original);
    }
    const date = (p.date as string) || todayISO();
    const entries = (p.pendingAmounts as number[]).map((a) => ({ service: svc, amountPaise: a, method }));
    const action: AssistantAction = { kind: 'daily_income', date, entries };
    const total = entries.reduce((a, e) => a + e.amountPaise, 0);
    const dup = findDuplicateWarning(state, profile.id, action);
    return { kind: 'action', action, previewLines: entries.map((e) => `${e.service} ${formatINR(e.amountPaise)} (${e.method.toUpperCase()})`), totalPaise: total, duplicateWarning: dup || undefined };
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

