/**
 * BizKhata unified intent router — UPDATE 14/15/16.
 *
 * Runs FIRST, before any business-data path, in both the chat send()
 * flow and the parser entry. One assistant, no separate restricted
 * bots. Classification is deliberately conservative: it only routes
 * to the structured financial parser when the message really looks
 * like a financial action (an amount + a service/expense/agent/MT
 * signal). Everything else goes to conversation, plans, general
 * knowledge, app help, navigation or an honest "I could not
 * understand" — NEVER to a forced money question.
 *
 * UPDATE 15 guard: a statement or a plan (future plan, no amount, no
 * money question) must NEVER be answered with a money question.
 * isPlanOrStatement() is also called inside parseAssistantMessage()
 * so the parser can never turn "Mujhe kal PAN Card banane hai" into
 * "PAN Card ke kitne rupaye hue?".
 *
 * UPDATE 16: imperative messages are executable commands — navigation
 * performs the navigation, checklist requests produce a real saved
 * checklist, summary/report requests produce the real report from
 * the ledgers, language-switch requests switch the reply language.
 * Those are routed as do_* intents and executed by conversation.ts /
 * the chat UI, not merely described.
 */
import { detectLanguage, normalizeMultilingual, replyIn, type AiLangCode } from './languages';
import { answerCasual, buildChecklist, checklistTopicFor, type Checklist } from './general';
import { findServiceIn, navigationRequest, type ChatContext } from './knowledge';

export type UnifiedIntent =
  | 'casual'
  | 'general'
  | 'business_query'
  | 'business_action'
  | 'app_help'
  | 'navigation'
  | 'plan'
  | 'statement'
  | 'do_checklist'
  | 'do_summary'
  | 'language_switch'
  | 'unknown';

export type CasualKind = 'greeting' | 'bored' | 'thanks' | 'mood' | 'morning' | 'doing' | 'advice' | 'helpOffer';

const HAS_AMOUNT = /\d/;
const MONEY_WORDS = /\b(cash|upi|nagad|rupaye|rupees?|rs\.?|₹|hue|hua|mile|mila|diye|diya|kharcha|expense|commission|transfer|jama|add kar|payment)\b/;

function norm(raw: string): string {
  return normalizeMultilingual(raw.toLowerCase());
}

/** Language-switch requests: "Mujhe Gujarati mein samjhao" → 'gu'.
 *  Matches the language name in Roman AND native script ("ગુજરાતીમાં
 *  મારી સાથે વાત કરો" → 'gu'), plus a talk/switch verb in either. */
export function detectLanguageSwitch(raw: string): AiLangCode | null {
  const s = norm(raw);
  const rawLower = raw.toLowerCase();
  const both = `${s} ${rawLower}`;
  const m: [RegExp, AiLangCode][] = [
    [/gujarati|ગુજરાતી/, 'gu'],
    [/marathi|मराठी/, 'mr'],
    [/hindi|हिन्दी|हिंदी/, 'hi'],
    [/english|angrezi/, 'en'],
    [/bengali|bangla|বাংলা/, 'bn'],
    [/punjabi|ਪੰਜਾਬੀ/, 'pa'],
    [/tamil|தமிழ்/, 'ta'],
    [/telugu|తెలుగు/, 'te'],
    [/kannada|ಕನ್ನಡ/, 'kn'],
    [/malayalam|മലയാളം/, 'ml'],
    [/odia|ଓଡ଼ିଆ/, 'or'],
    [/assamese|অসমীয়া/, 'as'],
    [/urdu|اردو/, 'ur'],
    [/nepali|नेपाली/, 'ne'],
  ];
  // A language name alone is not a switch ("Gujarati kya hai?" is a
  // question) — require a talk/switch/explain verb as well.
  const talk = /(mein|me|main|ma|bhasha|language|samjhao|samjha|baat|vaat|વાત|बात|bolo|bolna|bol|kara|karo|કરો|speak|talk)/.test(both);
  if (!talk) return null;
  for (const [re, code] of m) {
    if (re.test(both)) return code;
  }
  return null;
}

/** Which casual kind is this message, if any? Checked on raw + normalised text. */
export function casualKindFor(raw: string): CasualKind | null {
  const s = `${raw.toLowerCase()} ${norm(raw)}`;
  if (/\b(thank|thanks|shukriya|dhanyavad|dhanyavaad|aabhar|thank you)\b/.test(s)) return 'thanks';
  if (/\b(bored|bore ho|bore hoon|bore ho raha|boring|boriyat)\b/.test(s)) return 'bored';
  if (/(mood (kharab|off|nahi)|mood.*kharab|feeling (sad|low|down|bored)|dukhi|pareshan|mood kharab)/.test(s)) return 'mood';
  if (/\b(good morning|suprabhat|shubh prabhat|good afternoon|good evening)\b/.test(s)) return 'morning';
  if (/(kya kar rahe|what are you doing|kya kar rahe ho|what.*doing)/.test(s)) return 'doing';
  if (/\b(advice|salah|suggestion|suggest karo|advice chahiye)\b/.test(s) && !/business idea/.test(s)) return 'advice';
  if (/(can you help|help karo|madad|mujhe ek baat puchni|help chahiye|i need.*help|can u help|help me)/.test(s)) return 'helpOffer';
  // Greeting / how-are-you — matched ANYWHERE in the message, not just
  // at the start (the UPDATE 14 bug: "Kaise Ho Bhai" missed the old
  // start-anchored greeting regex and fell through to no-data).
  if (/\b(hi+|hello|hey|namaste|namaskar|sat sri akal|vanakkam|namaskaram|ram ram|salaam|adaab)\b/.test(s)) return 'greeting';
  if (/(kaise ho|kaisa hai|kaisa ho|kaise hai|how are you|kem cho|kem chho|su chale chhe|shu chale|kem chhe|kaisa chhe|how r u|how are u)/.test(s)) return 'greeting';
  return null;
}

const STATEMENT_FACTS: { re: RegExp; fact: string; replyHi: string; replyEn: string }[] = [
  {
    re: /(i run a|i have a|i own a|mera.*(csc|shop|centre|center)|main.*(csc|shop).*(chalata|chalati|chalata hoon)|i run a csc)/,
    fact: 'runs a CSC centre',
    replyHi: 'Achha! CSC centre chalate ho — toh PAN Card, Aadhaar, Xerox jaise kaam roz hote honge. Batao, aaj kya help chahiye?',
    replyEn: 'Got it — you run a CSC centre, so PAN Card, Aadhaar and Xerox work must come in every day. Tell me, what do you need help with today?',
  },
  {
    re: /(aaj.*(bahut|bohot|kaafi|bahot).*kaam|today.*(very|a lot of|so much) work|aaj kaam (bahut|zyada) tha)/,
    fact: 'busy day today',
    replyHi: 'Achha, aaj shop par kaafi rush tha kya? Thoda aaram kar lo — batao, koi pending kaam hai jo kal karna hai?',
    replyEn: 'Oh, was the shop very busy today? Take some rest — tell me, is there any pending work for tomorrow?',
  },
];

/**
 * Plan / statement guard (UPDATE 15). True when the message states
 * a plan or a fact — future work, a wish, a statement about the day —
 * with NO amount and NO money question. Such a message must never be
 * answered with "kitne rupaye hue?" or any other money question.
 */
export function isPlanOrStatement(raw: string): boolean {
  const s = norm(raw);
  if (HAS_AMOUNT.test(raw)) return false;
  if (/kitne (rupaye|paise)|how much (money|rupees)|rupaye hue|paise hue/.test(s)) return false;
  // Explicit plan: tomorrow/day-after + work verb, or "mujhe ... banani/banane/karna hai".
  // Bare "chahiye" alone is NOT a plan ("Mujhe ek business idea chahiye"
  // is a request for ideas, not a plan) — a work verb is required.
  if (/(kal|parso|tomorrow|aane wale|agle)/.test(s) && /(banane|banani|karna|karne|karna hai|karne hain|jana|aana|kholna|kaam|hoga|chahiye)/.test(s)) return true;
  if (/(mujhe|mere ko).*(banani|banane|karna hai|karne hai|karna|karne)/.test(s)) return true;
  if (/banani hai|banane hai|banane hain|banana hai|banana chahte|banana chahta/.test(s)) return true;
  if (/kal.*(kya kya|kaam).*chahiye|tomorrow.*(what|work).*should/.test(s)) return true;
  // Statements about the day / the business.
  for (const f of STATEMENT_FACTS) {
    if (f.re.test(s) || f.re.test(raw.toLowerCase())) return true;
  }
  if (/(aaj.*kaam tha|aaj.*rush tha|bahut kaam tha|bohot kaam tha)/.test(s)) return true;
  return false;
}

/** Extract the plan's topic (service / website / general) and when. */
export function planDetails(raw: string, services: string[]): { topic: string; service: string | null; when: string; whenLabel: string } {
  const s = norm(raw);
  const service = findServiceIn(raw, services);
  const when = /parso|day after/.test(s) ? 'parso' : /kal|tomorrow/.test(s) ? 'kal' : /aaj|today/.test(s) ? 'aaj' : 'coming days';
  const whenLabel = when === 'kal' ? 'kal' : when === 'parso' ? 'parso' : when === 'aaj' ? 'aaj' : 'aane wale din';
  const topic = /website/.test(s) ? 'website' : service ? service.toLowerCase().replace(/\s+/g, '_') : 'general';
  return { topic, service, when, whenLabel };
}

const PLAN_OFFER: Record<string, { hi: string; en: string; gu: string }> = {
  pan: {
    hi: 'Kitne applications hain? Agar chaho toh main tumhare liye kaam ki checklist bhi bana sakta hoon — bas "checklist banao" bolo.',
    en: 'How many applications are there? If you like, I can also make a work checklist for you — just say "make a checklist".',
    gu: 'Ketla applications chhe? Jo joie to hu tamara mate kaam ni checklist pan banavi aapish — bas "checklist banao" bolo.',
  },
  website: {
    hi: 'Kis type ki website banana chahte ho? Main planning, design aur steps mein help kar sakta hoon.',
    en: 'What kind of website do you want to make? I can help with the planning, design and steps.',
    gu: 'Kevi website banavvi chhe? Hu planning, design ane steps ma help kari shaku chhu.',
  },
  general: {
    hi: 'Batao, isme main tumhari kya help kar sakta hoon — plan banau, checklist banau, ya kuch aur?',
    en: 'Tell me, how can I help with this — make a plan, make a checklist, or something else?',
    gu: 'Kaho, aama hu tamari kevi help kari shaku — plan banavu, checklist banavu, ke biju kai?',
  },
};

export function answerPlan(raw: string, lang: AiLangCode, services: string[]): { text: string; checklist?: Checklist; newFact?: string } {
  const { topic, service, when, whenLabel } = planDetails(raw, services);
  const s = norm(raw);
  // "Kal mujhe kya kya kaam karna chahiye?" — tomorrow's work list.
  if (/kal.*(kya kya|kaam).*chahiye|tomorrow.*(what|work).*should/.test(s)) {
    const c = buildChecklist('shop_day', lang, 'kal');
    return {
      text: lang === 'en'
        ? `For tomorrow, this is a good order of work:\n${c.items.map((it, i) => `${i + 1}. ${it}`).join('\n')}\n\nStart with the pending jobs and the fund balance, then the customers who owe money. Want me to save this as a checklist? Just say "save the checklist".`
        : lang === 'gu'
          ? `Kale mate kaam no saras order aa chhe:\n${c.items.map((it, i) => `${i + 1}. ${it}`).join('\n')}\n\nPending jobs ane fund balance thi shuru karo, pachhi due vala customers. Aa checklist save karvi hoy to "checklist save karo" bolo.`
          : `Kal ke liye kaam ka achha order ye hai:\n${c.items.map((it, i) => `${i + 1}. ${it}`).join('\n')}\n\nPending jobs aur fund balance se shuru karo, phir due wale customers. Ye checklist save karni ho to "checklist save karo" bolo.`,
      checklist: c,
    };
  }
  const offerKey = topic === 'website' ? 'website' : service && /pan/.test(service.toLowerCase()) ? 'pan' : 'general';
  const offer = PLAN_OFFER[offerKey][lang === 'en' ? 'en' : lang === 'gu' ? 'gu' : 'hi'];
  const planHi = service
    ? `${whenLabel === 'kal' ? 'Kal' : whenLabel === 'parso' ? 'Parso' : whenLabel === 'aaj' ? 'Aaj' : 'Aane wale din'} ${service} ka kaam karna hai`
    : topic === 'website'
      ? 'Website banani hai'
      : `${whenLabel === 'kal' ? 'Kal' : whenLabel === 'parso' ? 'Parso' : 'Aane wale din'} kaam karna hai`;
  const planEn = service
    ? `You have ${service} work to do ${when === 'kal' ? 'tomorrow' : when === 'parso' ? 'the day after tomorrow' : when === 'aaj' ? 'today' : 'in the coming days'}`
    : topic === 'website'
      ? 'You want to make a website'
      : `You have work to do ${when === 'kal' ? 'tomorrow' : 'in the coming days'}`;
  const plan = lang === 'en' ? planEn : lang === 'gu' ? planHi : planHi;
  return { text: replyIn(lang, 'planAck', { plan, offer }) };
}

export function answerStatement(raw: string, lang: AiLangCode): { text: string; newFact?: string } | null {
  const s = norm(raw);
  const rawLower = raw.toLowerCase();
  for (const f of STATEMENT_FACTS) {
    if (f.re.test(s) || f.re.test(rawLower)) {
      return { text: lang === 'en' ? f.replyEn : f.replyHi, newFact: f.fact };
    }
  }
  return null;
}

/**
 * Classify one message. Order matters: do-commands and casual/plan
 * are decided BEFORE the financial parser ever sees the message, so
 * a greeting or a plan can never become a money question.
 */
export function classifyIntent(raw: string, ctx: ChatContext, services: string[]): UnifiedIntent {
  const s = norm(raw);
  const rawLower = raw.toLowerCase();

  // 1. Language switch — the user tells the AI what to DO.
  if (detectLanguageSwitch(raw)) return 'language_switch';
  // 2. Do-commands (UPDATE 16).
  if (/checklist.*(banao|banado|banaye|save karo)|list banao|kaam ki list banao/.test(s)) return 'do_checklist';
  if (/(summary|report|hisab).*(banao|banado|banaye|dikhao)|banao.*(summary|report|hisab)/.test(s)) return 'do_summary';
  if (navigationRequest(raw)) return 'navigation';
  // 3. Casual conversation — before everything business.
  if (casualKindFor(raw)) return 'casual';
  // 4. Plan / statement — before the financial parser (UPDATE 15 guard).
  if (isPlanOrStatement(raw)) return 'plan';
  // 5. Financial action: an amount + a money/service signal, or a
  //    follow-up amount with a service already in context.
  if (HAS_AMOUNT.test(raw)) {
    if (/(xerox|printing|pan|aadhaar|aadhar|voter|ayushman|smart|scan|kharcha|expense|agent|transfer|commission|cash|upi|hue|hua|mile|mila|diye|diya|add kar|jama|payment|repair|bijli|electricity|internet|kagaz|paper|ink|kiraya|rent)/.test(s)) return 'business_action';
    if ((/^(aur|or|also|bhi|add)\b/.test(s) || /\b(aur|bhi)\b/.test(s)) && ctx.lastService) return 'business_action';
    if (/kharcha|expense/.test(s)) return 'business_action';
  }
  // "Add customer" / "naya customer" without an amount is still an action.
  if (/naya customer|new customer|add.*customer|customer.*add/.test(s)) return 'business_action';
  // 6. App help (feature + kaise/how) — before general, so "Cash Book
  //    kaise use karte hain?" gets steps + a link, not a web answer.
  if (/(cash\s*book|upi\s*book|customer|agent|receipt|daily business|profile|service|language|difference finder|money transfer|backup|settings|customization|maintenance)/.test(s)
    && /(kaise|how|use|entry|add|karo|karu|kaam)/.test(s)) return 'app_help';
  // 7. General-first (distinctive non-business topics) — BEFORE the
  //    business-query check, because normalisation maps "business" to
  //    the canonical token "dhandha": "Mujhe ek business idea chahiye"
  //    must reach the ideas engine, never the daily-summary branch.
  if (/(business idea|naya business|idea chahiye|idea do|website|joke|chutkula|hasao|majak|funny)/.test(s)) return 'general';
  if (/(pan card|aadhaar|aadhar|voter|ayushman|csc|common service)/.test(s)
    && /(kya|samjhao|explain|batao|matlab|about|bare mein|ke baare)/.test(s)) return 'general';
  if (/(internet|wifi|printer|print|phone|mobile|computer|storage|troubleshoot)/.test(s)
    && /(nahi|slow|chal|band|fail|error|hang|garam|full|khatam|kaise|how|fix)/.test(s)) return 'general';
  if (/(email|whatsapp.*message|caption|translate|matlab|photosynthesis|gst)/.test(s)) return 'general';
  // 8. Business-data question.
  if (/(profit|munafa|faayda|fayda|income|kamai|collection|expense|kharcha|due|udhaar|udhar|baaki|baki|agent|commission|balance|cash|upi|hisab|dhandha|summary|overview|report)/.test(s)
    && /(kitna|kitne|kitni|kya|batao|dikhao|kaun|kab|kaise|kahan|total|aaj|kal|month|mahina|saal|hisab|hoga|hua|hai|hain|chahiye|\?)/.test(s)) return 'business_query';
  if (/what about (expenses|expense|kharcha)/.test(rawLower) && ctx.userFacts?.some((f) => /csc/i.test(f))) return 'business_query';
  if (/(kitna|kitne|total|hisab)/.test(s) && /(aaj|kal|month|mahina)/.test(s)) return 'business_query';
  // 9. General knowledge / everyday help (remaining questions).
  if (/(joke|chutkula|hasao|majak|funny|pan card|aadhaar|voter|ayushman|csc|internet|wifi|printer|print|phone|mobile|computer|upi.*fail|payment.*fail|storage|business idea|website|email|whatsapp.*message|caption|translate|matlab|photosynthesis|gst|\+|\*|% of|km|miles|kg|pound)/.test(s)) return 'general';
  if (/\?$/.test(raw.trim()) || /^(what|how|why|when|where|who|kya|kaise|kyun|kab|kahan|kaun)\b/.test(s)) return 'general';
  return 'unknown';
}

/** Casual reply in the user's language, varied by message text. */
export function answerCasualFor(raw: string, lang: AiLangCode): string {
  const kind = casualKindFor(raw) || 'greeting';
  return answerCasual(kind, lang, raw);
}

/** Reply language for a message: detected language (Hinglish guard applied). */
export function replyLangFor(raw: string): AiLangCode {
  return detectLanguage(raw).code;
}
