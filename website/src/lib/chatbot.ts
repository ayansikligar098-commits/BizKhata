/**
 * BizKhata chatbot — factual answers from the REAL ledgers.
 *
 * Every figure quoted comes from computeFacts() (integer paise, same
 * accounting engine as the rest of the app). The built-in responder works
 * with no Gemini key at all; with a key, Gemini only rephrases the same
 * figures (see askGeminiChat in gemini.ts) and never invents numbers.
 * With no data, it says so plainly — never demo numbers.
 */
import {
  agentPayablePaise,
  balancesPaise,
  jobDuePaise,
  mtProfitPaise,
  netProfitPaise,
  totalCustomerDuePaise,
} from './accounting';
import { formatINR } from './money';
import { todayISO } from './types';
import type { AppState, BusinessProfile } from './types';

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

  return {
    today,
    todayIncomePaise: dayJobs.reduce((s, j) => s + j.receivedPaise, 0),
    todayExpensePaise: dayExp.reduce((s, e) => s + e.amountPaise, 0),
    todayProfitPaise: netProfitPaise(dayJobs, dayExp, dayMt, dayMtE),
    monthIncomePaise: monthJobs.reduce((s, j) => s + j.receivedPaise, 0),
    monthExpensePaise: monthExp.reduce((s, e) => s + e.amountPaise, 0),
    monthProfitPaise: netProfitPaise(monthJobs, monthExp, monthMt, monthMtE),
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
  };
}

/** Plain-text facts for the Gemini prompt (paise — the model converts). */
export function factsSummary(f: BusinessFacts): string {
  return [
    `Today (${f.today}): income received ${f.todayIncomePaise} paise, expenses ${f.todayExpensePaise} paise, net profit ${f.todayProfitPaise} paise.`,
    `This month: income ${f.monthIncomePaise} paise, expenses ${f.monthExpensePaise} paise, net profit ${f.monthProfitPaise} paise.`,
    `Cash balance ${f.cashPaise} paise, UPI balance ${f.upiPaise} paise.`,
    `Total customer due ${f.customerDuePaise} paise. Top dues: ${f.topDues.map((d) => `${d.name} ${d.duePaise}`).join(', ') || 'none'}.`,
    `Total agent payable ${f.agentPayablePaise} paise. Per agent: ${f.agentDues.map((d) => `${d.name} ${d.duePaise}`).join(', ') || 'none'}.`,
    `Money Transfer today: ${f.mtTodayTransfers} transfers, sent ${f.mtTodaySentPaise} paise, commission ${f.mtTodayCommissionPaise} paise, MT profit ${f.mtTodayProfitPaise} paise, ${f.mtPending} pending.`,
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
