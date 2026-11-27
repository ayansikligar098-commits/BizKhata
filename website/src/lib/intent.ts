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
import { isAppChangeRequest } from './dev-requests';
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
  | 'app_change'
  | 'accept_offer'
  | 'followup_count'
  | 'followup_correct'
  | 'decline_offer'
  | 'checklist_edit'
  | 'checklist_translate'
  | 'checklist_show'
  | 'topic_followup'
  // UPDATE 25: key-status statements ("Mene Key Dal Di"), one-off
  // "translate THIS reply" (vs switching the profile language), and
  // typed "Bas, short mein batao" (shorten the last reply).
  | 'key_status'
  | 'translate_reply'
  | 'shorten_reply'
  | 'unknown';

export type CasualKind = 'greeting' | 'farewell' | 'bored' | 'thanks' | 'mood' | 'morning' | 'doing' | 'advice' | 'helpOffer';

const HAS_AMOUNT = /\d/;

/**
 * "Bana" verb forms the way the owner actually says them — with a
 * SPACE ("bana do", "bana de", "bana dena", "banake do", "bana dijiye",
 * "banakar do"), not just the joined spellings ("banao", "banado").
 * The old do_checklist/do_summary regexes only matched the joined
 * forms, so "Checklist Bana Do" fell through to the plan reply and
 * no checklist was ever built (BUG A, video 2026-11-27).
 */
const BANA_FORMS = String.raw`(bana\s*do|bana\s*de|bana\s*dena|banake\s*do|bana\s*dijiye|banakar\s*do|banao|banado|banaye|banau|bana\b|save\s*karo)`;
const CHECKLIST_WORD = String.raw`(checklist|cheklist|checlist)`;
const CHECKLIST_RE = new RegExp(String.raw`${CHECKLIST_WORD}.*${BANA_FORMS}|list\s+${BANA_FORMS}|kaam\s*ki\s*list\s+${BANA_FORMS}`);
const SUMMARY_RE = new RegExp(String.raw`(summary|report|hisab|dhandha).*(${BANA_FORMS}|dikhao)|${BANA_FORMS}.*(summary|report|hisab|dhandha)`);

/** True when the message explicitly asks for a checklist, in any of
 *  the owner's phrasings. A bare "checklist" while an offer is pending
 *  is NOT an explicit request — it is an acceptance of the offer
 *  (accept_offer), so the offered topic is used, not the default. */
export function isChecklistRequest(raw: string, ctx: ChatContext): boolean {
  return CHECKLIST_RE.test(norm(raw));
}

/** True when the message explicitly asks for a summary/report. */
export function isSummaryRequest(raw: string): boolean {
  return SUMMARY_RE.test(norm(raw));
}

/**
 * Bare acceptance of a pending offer — the whole message is just a
 * yes / "bana do" / "kar do" / "checklist", nothing else. Anchored +
 * full-message so "Ha, aur Xerox 300 cash hue" (yes + a real entry)
 * is NOT swallowed as an acceptance.
 */
const OFFER_ACCEPT_RE = /^(haan?|ha+|yes|yep|ok+|okay|theek\s*hai|bilkul|ji\s*haan|kar\s*do|karo|confirm|save|save\s*kar|bana\s*do|bana\s*de|bana\s*dena|banake\s*do|bana\s*dijiye|banakar\s*do|banao|checklist|cheklist|checlist|list\s*bana\s*do|list\s*banao|haan?\s*(bana\s*do|banao|kar\s*do|checklist\s*bana\s*do))[\s.!]*$/;
export function isOfferAcceptance(raw: string): boolean {
  // norm() maps first-word "theek" → "haan", so "Theek hai" arrives
  // as "haan hai" — drop the trailing "hai" before matching.
  const s = norm(raw).trim().replace(/\s+hai$/, '');
  return OFFER_ACCEPT_RE.test(s);
}

/* ================= Follow-up resolution (UPDATE 21) =================
 * The mechanism, not just the examples: when the bot's last reply
 * asked a question or offered something, a short follow-up resolves
 * against that context — a bare number, a correction, "documents bhi
 * batao", "English mein likho" — instead of falling through to the
 * fixed not-understood reply. */

/** The topic the conversation is currently about, from context. */
export function currentTopic(ctx: ChatContext): string | null {
  return ctx.pendingQuestion?.topic || ctx.pendingOffer?.topic || ctx.activeChecklist?.topic || null;
}

/** Bare number answer ("5") — norm() already converts number words. */
export function isBareNumber(raw: string): boolean {
  return /^\d+$/.test(norm(raw).trim());
}
export function bareNumber(raw: string): number | null {
  const m = norm(raw).trim().match(/^(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

/** Correction of a just-answered value ("Nahi, 3 the, 5 nahi"). */
export function isCorrection(raw: string, ctx: ChatContext): boolean {
  const s = norm(raw);
  // Count correction ("Nahi, 3 the, 5 nahi") — answers the pending
  // "Kitne applications hain?" question with a different number.
  if (ctx.pendingQuestion?.answeredValue !== undefined) {
    return /(nahi|nahin|no|galat|wrong)\b/.test(s) && /\d/.test(s);
  }
  // Checklist-count correction after a topic switch: the pending
  // question is gone (a business turn cleared it) but the ACTIVE
  // checklist still remembers the count — "Nahi, 3 the, 5 nahi"
  // must still correct it (UPDATE 21 §4: return to earlier context).
  if (ctx.activeChecklist?.count !== undefined) {
    return /(nahi|nahin|no|galat|wrong)\b/.test(s) && /\d/.test(s);
  }
  // Financial preview correction ("Nahi, 250 the" after a preview) —
  // a negation/correction word + a number, with a previewed action in
  // context. A bare "Nahi" with no number is a cancel, not a correction.
  if (ctx.pendingAction) {
    return /^(nahi|nahin|no|galat|wrong)\b/.test(s) && /\d/.test(s);
  }
  return false;
}
/** The corrected value: the number NOT rejected by a negation.
 *  UPDATE 25 (C-3): the old code returned the FIRST number ≠ old,
 *  so "nahi, 500 nahi 600 tha" (old ₹300) returned 500 — the very
 *  value the user just rejected. The number immediately BEFORE a
 *  negation word ("500 nahi") is the REJECTED value; the corrected
 *  value is another number in the message (prefer the last one).
 *  The count case still works: "Nahi, 3 the, 5 nahi" (old 5) —
 *  rejected 5, corrected 3. A bare "nahi, 250 the" has no number
 *  before "nahi", so 250 is the corrected value, not a rejection. */
export function correctedNumber(raw: string, ctx: ChatContext): number | null {
  const old = ctx.pendingQuestion?.answeredValue
    ?? ctx.activeChecklist?.count
    ?? (ctx.pendingAction?.kind === 'daily_income' ? ctx.pendingAction.entries[0]?.amountPaise / 100 : undefined);
  const normed = norm(raw);
  const nums = (normed.match(/\d+/g) || []).map((n) => parseInt(n, 10));
  if (nums.length === 0) return null;
  // Numbers immediately before "nahi/nahin/galat" are rejected.
  const rejected = new Set<number>();
  const re = /(\d+)\s+(nahi|nahin|galat|wrong)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normed)) !== null) rejected.add(parseInt(m[1], 10));
  // Prefer the LAST non-rejected number that is not the old value.
  for (let i = nums.length - 1; i >= 0; i--) {
    if (!rejected.has(nums[i]) && nums[i] !== old) return nums[i];
  }
  // Fallback: first number that is not the old value (old behaviour).
  for (const n of nums) if (n !== old) return n;
  return null;
}

/** Bare decline of a pending offer ("Nahi", "Rehne do") — NOT a
 *  correction (isCorrection runs first) and NOT a financial cancel. */
export function isOfferDecline(raw: string): boolean {
  return /^(nahi|nahin|no|nope|rehne\s*do|mat\s*karo|chhodo|ruk[o]?|cancel)\b/.test(norm(raw).trim());
}

/** "Isme documents bhi add karo" / "signature lena bhi add karo". */
export function isChecklistEdit(raw: string): boolean {
  const s = norm(raw);
  return /(add|jod|jodo|shamil)\s*(kar|karo|do|de|dena|kardo|karde)\b/.test(s)
    || /(documents?|dastavej)\s*(bhi\s*)?(add|jod)/.test(s);
}
/** The item to add, if the user named one (else null → topic doc items). */
export function editItemText(raw: string): string | null {
  let s = norm(raw).trim();
  s = s.replace(/^(isme|is me|usme|checklist me|checklist mein|list me|is checklist me)\s+/, '');
  s = s.replace(/\s*(bhi\s*)?(add|jod|jodo|shamil)\s*(kar|karo|do|de|dena|kardo|karde)\s*[.!]*$/, '');
  s = s.trim();
  if (!s || /^(documents?|dastavej)$/.test(s)) return null;
  return s;
}

/** Target language for "English mein likho" / "Hindi mein batao". */
const TARGET_LANGS: [RegExp, import('./languages').AiLangCode][] = [
  [/english/, 'en'], [/hindi|hindustani/, 'hi'], [/gujarati/, 'gu'], [/marathi/, 'mr'],
  [/bengali|bangla/, 'bn'], [/punjabi/, 'pa'], [/tamil/, 'ta'], [/telugu/, 'te'],
  [/kannada/, 'kn'], [/malayalam/, 'ml'], [/odia|oriya/, 'or'], [/assamese/, 'as'],
  [/urdu/, 'ur'],
];
export function targetLangFor(raw: string): import('./languages').AiLangCode | null {
  const s = norm(raw);
  for (const [re, code] of TARGET_LANGS) if (re.test(s)) return code;
  return null;
}
/** "Aur English mein likho" — convert the active checklist. */
export function isChecklistTranslate(raw: string): boolean {
  const s = norm(raw);
  return !!targetLangFor(raw) && /(mein|me|main)\s*(likho|likh|batao|kar\s*do|convert|likh\s*do|bata\s*do)\b/.test(s);
}

/** "PAN wali checklist phir dikhao" — show the active checklist again. */
export function isChecklistShow(raw: string): boolean {
  const s = norm(raw);
  return /(checklist|list)\s*(phir|wapas|dobara|again)/.test(s)
    || /phir\s*(dikhao|dikhado|batao|dikha)/.test(s)
    || /(checklist|list)\s*(dikhao|dikhado|show|batao)/.test(s);
}

/**
 * A short question about the current topic without naming it —
 * "Documents bhi batao", "Fee kitni hai", "Process kya hai" — while
 * the conversation is about PAN (or another topic). Resolves against
 * the topic in context; never a generic reply.
 */
export function isTopicFollowup(raw: string, ctx: ChatContext): boolean {
  if (!currentTopic(ctx)) return false;
  const s = norm(raw);
  if (/documents?|dastavej|kagaz|kagaj/.test(s)) return true;
  if (/\bfee\b|charges?|kitna (lagta|lagega|padega)|process|kaise (hota|banta|kare|karna)/.test(s)) return true;
  return false;
}

/**
 * A digit is only a MONEY amount when a money word is near it — "Kal
 * PAN Card ke 5 application karne hain" carries the count 5 (five
 * applications to do tomorrow), not ₹5. Without this distinction the
 * plan guard below would treat a future plan as a financial action
 * and ask "kitne rupaye hue?" for work that has not happened yet.
 */
export function hasMoneyAmount(raw: string): boolean {
  // UPDATE 25 (C-4): test norm(raw) — number words become digits.
  if (!/\d/.test(norm(raw))) return false;
  const s = norm(raw);
  return /(₹|\brs\b|rupees?|rupaye|rupay|paise|paisa|cash|upi|nagad|kharcha|kharach|commission|transfer|diye|diya|mila|mile|hue|hua|jama|payment|bill|due|udhaar|udhar|bheja|bheje|add\s*kar)/.test(s);
}
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
  // Not casual: a weather question ("Aaj mausam kaisa hai?") or a
  // translation question ("Namaste ka matlab kya hai?") — the "kaisa
  // hai" / "namaste" words must not hijack them into a greeting.
  if (/mausam|weather/.test(s)) return null;
  if (/matlab|translate/.test(s)) return null;
  // UPDATE 25 (C-5): a greeting PLUS a real business question in the
  // same message is a business question, not a greeting — "Aaj su
  // chale chhe, ketlo profit thayo?" must answer the profit, and
  // "Kaise ho bhai, aaj ka profit kitna hua?" must answer the profit.
  // A bare greeting ("Kaise ho bhai?") has no business signal and
  // still returns 'greeting' below.
  if (/(profit|munafa|faayda|fayda|kamai|hisab|total|due|udhaar|udhar|balance|kharcha|income|collection)/.test(s)
    && /(kitna|kitne|kitni|kya|kaise|ketlo|ketla|ketlu|thayo|thaya|hoga|hua|hai|hain|chhe|batao|\?)/.test(s)) return null;
  if (/\b(thank|thanks|shukriya|dhanyavad|dhanyavaad|aabhar|thank you)\b/.test(s)) return 'thanks';
  if (/\b(bored|bore ho|bore hoon|bore ho raha|boring|boriyat)\b/.test(s)) return 'bored';
  if (/(mood (kharab|off|nahi)|mood.*kharab|feeling (sad|low|down|bored)|dukhi|pareshan|mood kharab)/.test(s)) return 'mood';
  if (/\b(good morning|suprabhat|shubh prabhat|good afternoon|good evening)\b/.test(s)) return 'morning';
  if (/(kya kar rahe|what are you doing|kya kar rahe ho|what.*doing)/.test(s)) return 'doing';
  if (/\b(advice|salah|suggestion|suggest karo|advice chahiye)\b/.test(s) && !/business idea/.test(s)) return 'advice';
  if (/(can you help|help karo|madad|mujhe ek baat puchni|help chahiye|i need.*help|can u help|help me)/.test(s)) return 'helpOffer';
  // Farewell ("Bye, kal milte hain") — NOT a greeting: the user is
  // leaving, so answering "Main ekdum theek hoon, tum sunao?" is wrong
  // (drive caught this: the greeting reply has no bye/kal in it).
  // Checked before the greeting patterns below.
  if (/\b(bye|alvida|phir milenge|phir milte|kal milte|kal milenge|chalo bye|good ?bye)\b/.test(s)) return 'farewell';
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
 * UPDATE 23 — delete words as whole words (padded-space match, so
 * "Khata" never matches "hata"). A how-to question ("entry kaise
 * delete karu?") is app help, not a delete action.
 */
function hasDeleteWord(raw: string): boolean {
  const s = ` ${norm(raw).replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ')} `;
  return [' delete ', ' hata ', ' hatao ', ' hatana ', ' hatado ', ' hatade ', ' remove ', ' mita ', ' mitado ', ' हटा ', ' हटाना ', ' मिटा ', ' डिलीट '].some((w) => s.includes(w));
}

/**
 * Plan / statement guard (UPDATE 15). True when the message states
 * a plan or a fact — future work, a wish, a statement about the day —
 * with NO amount and NO money question. Such a message must never be
 * answered with "kitne rupaye hue?" or any other money question.
 */
export function isPlanOrStatement(raw: string): boolean {
  const s = norm(raw);
  // UPDATE 23: a delete request is NEVER a plan ("Kal wali entry
  // delete karni hai" is a delete, not tomorrow's work).
  if (hasDeleteWord(raw)) return false;
  if (hasMoneyAmount(raw)) return false;
  if (/kitne (rupaye|paise)|how much (money|rupees)|rupaye hue|paise hue/.test(s)) return false;
  // A how-to question ("website banana hai, kaise banau?") asks for
  // instructions — it is not a plan. An info question ("kitne din lagte
  // hain?") asks for facts — also not a plan. (norm() maps "kitne" →
  // "kitna", so match both.)
  if (/kaise|how (to|do|can|make)/.test(s)) return false;
  if (/kitn[ae]\s+(din|time|samay)|kitna time|kab tak/.test(s)) return false;
  // A correction ("300 galat the, 250 hone chahiye") is NOT a plan —
  // it fixes a past entry. Without this, "Kal ke 300 Xerox galat the"
  // was answered as a future plan and the correction never ran.
  if (/(galat|wrong|galti|badal|correct)/.test(s) && /\d/.test(raw)) return false;
  // Explicit plan: tomorrow/day-after + work verb, or "mujhe ... banani/banane/karna hai".
  // Bare "chahiye" alone is NOT a plan ("Mujhe ek business idea chahiye"
  // is a request for ideas, not a plan) — a work verb is required.
  if (/(kal|parso|tomorrow|aane wale|agle)/.test(s) && /(banane|banani|karna|karne|karna hai|karne hain|jana|aana|kholna|kaam|hoga|chahiye)/.test(s)) return true;
  if (/(mujhe|mere ko).*(banani|banane|karna hai|karne hai|karna|karne)/.test(s)) return true;
  if (/banani hai|banane hai|banane hain|banana hai|banana chahte|banana chahta/.test(s)) return true;
  // Service work stated as a task ("Aadhaar mein mobile number update
  // karna hai") is a plan, not a money question — unless it asks HOW
  // (kaise) or names UIDAI/portal submission (a different, honest
  // limitation — the AI cannot submit to UIDAI).
  if (/(aadhaar|aadhar|pan|voter|ayushman).*(update|correction)/.test(s)
    && !/(kaise|how|kya|matlab|explain|samjhao|uidai|portal)/.test(s)) return true;
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
    hi: 'Kitne applications hain? Agar chaho toh main tumhare liye kaam ki checklist bhi bana sakta hoon — bas "checklist bana do" bolo, ya bas "haan" bolo.',
    en: 'How many applications are there? If you like, I can also make a work checklist for you — just say "make a checklist" or just say "yes".',
    gu: 'Ketla applications chhe? Jo joie to hu tamara mate kaam ni checklist pan banavi aapish — bas "checklist bana do" bolo, ke bas "haan" bolo.',
  },
  website: {
    hi: 'Kis type ki website banana chahte ho? Main planning, design aur steps mein help kar sakta hoon.',
    en: 'What kind of website do you want to make? I can help with the planning, design and steps.',
    gu: 'Kevi website banavvi chhe? Hu planning, design ane steps ma help kari shaku chhu.',
  },
  general: {
    hi: 'Batao, isme main tumhari kya help kar sakta hoon — plan banau, checklist banau, ya kuch aur? Checklist chahiye to bas "haan" bolo ya "checklist bana do" bolo.',
    en: 'Tell me, how can I help with this — make a plan, make a checklist, or something else? If you want the checklist, just say "yes" or "make a checklist".',
    gu: 'Kaho, aama hu tamari kevi help kari shaku — plan banavu, checklist banavu, ke biju kai? Checklist joie to bas "haan" bolo ke "checklist bana do" bolo.',
  },
};

export function answerPlan(raw: string, lang: AiLangCode, services: string[]): { text: string; checklist?: Checklist; newFact?: string; pendingOffer?: import('./knowledge').PendingOffer; pendingQuestion?: import('./knowledge').PendingQuestion } {
  const { topic, service, when, whenLabel } = planDetails(raw, services);
  const s = norm(raw);
  // "Kal mujhe kya kya kaam karna chahiye?" — tomorrow's work list.
  if (/kal.*(kya kya|kaam).*chahiye|tomorrow.*(what|work).*should/.test(s)) {
    const c = buildChecklist('shop_day', lang, 'kal');
    return {
      text: lang === 'en'
        ? `For tomorrow, this is a good order of work:\n${c.items.map((it, i) => `${i + 1}. ${it}`).join('\n')}\n\nStart with the pending jobs and the fund balance, then the customers who owe money. Want me to save this as a checklist? Just say "save the checklist" or just say "yes".`
        : lang === 'gu'
          ? `Kale mate kaam no saras order aa chhe:\n${c.items.map((it, i) => `${i + 1}. ${it}`).join('\n')}\n\nPending jobs ane fund balance thi shuru karo, pachhi due vala customers. Aa checklist save karvi hoy to "checklist save karo" bolo ke bas "haan" bolo.`
          : `Kal ke liye kaam ka achha order ye hai:\n${c.items.map((it, i) => `${i + 1}. ${it}`).join('\n')}\n\nPending jobs aur fund balance se shuru karo, phir due wale customers. Ye checklist save karni ho to "checklist save karo" bolo ya bas "haan" bolo.`,
      checklist: c,
      // The reply offers to save this list — a bare "haan" saves it.
      pendingOffer: { kind: 'checklist', topic: 'shop_day', when: 'kal' },
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
  // The pan/general offers include a checklist offer — record it so a
  // bare "Ha" / "Bana do" executes it (BUG A). Website offers none.
  const pendingOffer = offerKey === 'pan'
    ? { kind: 'checklist' as const, topic: 'pan', when }
    : offerKey === 'general'
      ? { kind: 'checklist' as const, topic: checklistTopicFor(raw), when }
      : undefined;
  // The PAN offer asks "Kitne applications hain?" — record the pending
  // question so a bare "5" resolves to 5 PAN applications (UPDATE 21).
  const pendingQuestion = offerKey === 'pan'
    ? { kind: 'count' as const, topic: 'pan', service: 'PAN Card', label: 'applications' }
    : undefined;
  return { text: replyIn(lang, 'planAck', { plan, offer }), pendingOffer, pendingQuestion };
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

/** UPDATE 25 (C-7): a statement that the key was entered ("Mene Key
 *  Dal Di Starting Me", "Key daal di hai", "Key add kar di") — the
 *  assistant must CHECK whether the key is actually saved and answer
 *  honestly, never tell the owner to enter a key he just entered. */
export function isKeyStatus(raw: string): boolean {
  const s = norm(raw);
  if (!/\bkey\b/.test(s)) return false;
  return /(dal\s*di|daal\s*di|dali|dal\s*diya|daal\s*diya|add\s*kar\s*di|save\s*(kar\s*di|ho\s*gayi|ki)|enter\s*(kar\s*di|ki)|daal\s*di\s*hai|dal\s*di\s*hai)/.test(s);
}

/** UPDATE 25 (C-17): typed "Bas, short mein batao" / "short mein
 *  batao" — shorten the last reply instead of not-understood. A bare
 *  typed "Bas" alone is NOT this (voice-mode interrupt only). */
export function isShortenRequest(raw: string): boolean {
  const s = norm(raw).trim();
  return /^(bas|ruk|chup)\b[,.!]?\s*(short\s*(mein|me)\s*batao|chhota\s*batao|short\s*mein)/.test(s)
    || /^short\s*(mein|me)\s*batao/.test(s);
}

/**
 * Classify one message. Order matters: do-commands and casual/plan
 * are decided BEFORE the financial parser ever sees the message, so
 * a greeting or a plan can never become a money question.
 */
export function classifyIntent(raw: string, ctx: ChatContext, services: string[]): UnifiedIntent {
  const s = norm(raw);
  const rawLower = raw.toLowerCase();

  // 0. Checklist translation first: "Aur English mein likho" with an
  //    active checklist converts the checklist — it is NOT a language
  //    switch (detectLanguageSwitch would claim "English ... mein").
  if (ctx.activeChecklist && isChecklistTranslate(raw)) return 'checklist_translate';
  // 0b. UPDATE 25 (C-13): "X mein likho/batao" with NO active
  //     checklist translates JUST the last reply — it must NOT
  //     permanently switch the profile language. Only "X mein baat
  //     karo / samjhao" (or the Settings control) switches it.
  //     Anchored to the whole message: "Hindi mein batao, PAN card
  //     kya hai?" is a new question, not a translate request.
  if (!ctx.activeChecklist && /^(aur\s+)?(english|hindi|gujarati|marathi|bengali|bangla|punjabi|tamil|telugu|kannada|malayalam|odia|oriya|assamese|urdu|nepali)\s*(mein|me|main)\s*(likho|likh|batao|kar\s*do|convert|likh\s*do|bata\s*do)[\s.!]*$/.test(s)) return 'translate_reply';
  // 0c. UPDATE 25 (C-17): typed "Bas, short mein batao".
  if (isShortenRequest(raw)) return 'shorten_reply';
  // 0d. UPDATE 25 (C-7): key-status statements.
  if (isKeyStatus(raw)) return 'key_status';
  // 1. Language switch — the user tells the AI what to DO. A translation
  //    question ("Dhanyavaad ka matlab English mein kya hai?") mentions a
  //    language but is NOT a switch — it must reach the general engine.
  if (detectLanguageSwitch(raw) && !/matlab|translate/.test(s)) return 'language_switch';
  // 1b. App-change requests (UPDATE 22) — BEFORE do_summary (so "ek
  //     naya report banao" is a change request, not a data summary) and
  //     before every business/general path ("Aadhaar ... module bana
  //     do" must never reach the CSC-portal explainer or a money flow).
  if (isAppChangeRequest(raw)) return 'app_change';
  // 2. Do-commands (UPDATE 16) — explicit requests win over a pending
  //    offer, so a new topic in the same message builds ITS checklist.
  if (isChecklistRequest(raw, ctx)) return 'do_checklist';
  if (isSummaryRequest(raw)) return 'do_summary';
  // 2b. Bare acceptance of a pending offer (UPDATE 17 / BUG A + UPDATE
  //     22): "Ha", "Bana do", "Haan, banao" — executes the offer
  //     (checklist OR queued app change) instead of falling through to
  //     a wrong financial confirm.
  if (ctx.pendingOffer && isOfferAcceptance(raw)) return 'accept_offer';
  // 2c. Follow-up resolution (UPDATE 21): a short reply that only
  //     makes sense against the previous turn — a bare number answering
  //     "Kitne applications hain?", a correction, a checklist edit /
  //     translation / re-show, or a question about the current topic.
  //     Checked BEFORE casual/plan so "5" never becomes 'unknown'.
  if (isCorrection(raw, ctx)) return 'followup_correct';
  if (ctx.pendingOffer && isOfferDecline(raw)) return 'decline_offer';
  if (ctx.pendingQuestion?.kind === 'count' && isBareNumber(raw)) return 'followup_count';
  if (ctx.activeChecklist && isChecklistTranslate(raw)) return 'checklist_translate';
  if (ctx.activeChecklist && isChecklistEdit(raw)) return 'checklist_edit';
  if (ctx.activeChecklist && isChecklistShow(raw)) return 'checklist_show';
  if (isTopicFollowup(raw, ctx)) return 'topic_followup';
  // UPDATE 23 — delete requests (any form: amount, "isko", bare
  // "Hatana hai") are financial actions handled by the structured
  // parser — they must NEVER fall through to the cloud model, which
  // fabricated deletions on 2026-11-27. Checked before casual/plan
  // and before navigation, so "Isko remove kardo" routes here even
  // with no amount and no service word.
  if (hasDeleteWord(raw) && !/(kaise|how)/.test(s)) return 'business_action';
  if (navigationRequest(raw)) return 'navigation';
  // 3. Casual conversation — before everything business.
  if (casualKindFor(raw)) return 'casual';
  // 4. Plan / statement — before the financial parser (UPDATE 15 guard).
  if (isPlanOrStatement(raw)) return 'plan';
  // 5. Financial action: an amount + a money/service signal, or a
  //    follow-up amount with a service already in context. Unit
  //    conversions ("100 km kitne miles?") carry an amount but are NOT
  //    money — "miles" contains "mile" (received), which used to route
  //    them to the money parser and ask for a service.
  const isConversion = /(km|miles|kg|pound|percent|% of)/.test(s);
  // UPDATE 25 (C-4): the amount test runs on norm(raw), not raw —
  // norm() converts number words ("do sau" → 200), so "do sau Xerox
  // cash hue" reaches the router instead of falling to unknown.
  if (HAS_AMOUNT.test(norm(raw)) && !isConversion) {
    if (/(xerox|printing|pan|aadhaar|aadhar|voter|ayushman|smart|scan|kharcha|expense|agent|transfer|commission|cash|upi|hue|hua|mile|mila|diye|diya|add kar|jama|payment|repair|bijli|electricity|internet|kagaz|paper|ink|kiraya|rent|refund|wapas|return)/.test(s)) return 'business_action';
    if ((/^(aur|or|also|bhi|add)\b/.test(s) || /\b(aur|bhi)\b/.test(s)) && ctx.lastService) return 'business_action';
    if (/kharcha|expense/.test(s)) return 'business_action';
  }
  // "Add customer" / "naya customer" without an amount is still an action.
  if (/naya customer|new customer|add.*customer|customer.*add/.test(s)) return 'business_action';
  // 5b. Advice questions — "kaise badhaye / kaise karu" about growth,
  //     marketing, budget, commission, dues, UPI failure — are general
  //     advice, NOT data questions. Without this, "Mera profit kaise
  //     badhaye?" was answered with today's ₹0.00 profit figure, and
  //     "Customer se due kaise vasool karu?" with "koi due nahi hai".
  //     (norm() maps "due" → "udhaar" and "online" → "upi", so match
  //     the canonical forms.)
  if (/(customer.*badhaye|profit.*badhaye|dhandha.*badhaye|badhaye|marketing|budget|(online|upi).*le\s*jaau|discount|commission.*(du|dun|kitna)|kharcha.*kam|naam.*rakhu|festival|subah.*kholo|rate.*rakhu|(due|udhaar|udhar).*vasool|vasool.*(due|udhaar|udhar)|service.*shuru|upi.*fail|payment.*fail)/.test(s)) return 'general';
  // 6. App help (feature + kaise/how) — before general, so "Cash Book
  //    kaise use karte hain?" gets steps + a link, not a web answer.
  //    "Where do I record this?" (UPDATE 20 §1/§5) — Daily Business is
  //    the place for the day's mixed shop work.
  //    UPDATE 25 (C-8): "Kaise add karu dhadhe ka" — a how-to-add
  //    question with no recognised feature word ("dhadhe" is a
  //    misspelling of "dhandhe") still reaches app help.
  if (/(kaise|how)\s*(add|likh|daal|note|likhu|karu|karna|kart[aei])/.test(s)
    || (/dhadhe|dhande|dhandhe/.test(s) && /kaise/.test(s))) return 'app_help';
  if (/\b(kha|kahan|kidhar|where)\b.*(likh|likhu|likhna|entry|note|record|daal)/.test(s)
    || /(dhandha|kamai|collection)\b.*\b(kha|kahan|kidhar|likh)/.test(s)) return 'app_help';
  if (/(cash\s*book|upi\s*book|customer|agent|receipt|daily business|daily dhandha|dhandha|profile|service|language|difference finder|money transfer|backup|settings|customization|maintenance|report)/.test(s)
    && /(kaise|how|use|entry|add|karo|karu|kaam|kahan|kaha|kya)/.test(s)) return 'app_help';
  // 7. General-first (distinctive non-business topics) — BEFORE the
  //    business-query check, because normalisation maps "business" to
  //    the canonical token "dhandha": "Mujhe ek business idea chahiye"
  //    must reach the ideas engine, never the daily-summary branch.
  if (/(business idea|naya business|idea chahiye|idea do|website|joke|chutkula|hasao|majak|funny)/.test(s)) return 'general';
  if (/(pan card|aadhaar|aadhar|voter|ayushman|csc|common service)/.test(s)
    && /(kya|samjhao|explain|batao|matlab|about|bare mein|ke baare)/.test(s)) return 'general';
  if (/(internet|wifi|printer|print|phone|mobile|computer|storage|whatsapp|troubleshoot)/.test(s)
    && /(nahi|slow|chal|band|fail|error|hang|garam|full|khatam|kaise|how|fix)/.test(s)) return 'general';
  if (/(email|whatsapp.*message|caption|translate|matlab|photosynthesis|gst)/.test(s)) return 'general';
  // UIDAI / portal submissions: the AI cannot submit anything there —
  // routed to general so the honest-limitation answer applies.
  if (/(uidai|portal)/.test(s)) return 'general';
  // 8. Business-data question.
  if (/(profit|munafa|faayda|fayda|income|kamai|collection|expense|kharcha|due|udhaar|udhar|baaki|baki|agent|commission|balance|cash|upi|hisab|dhandha|summary|overview|report)/.test(s)
    && /(kitna|kitne|kitni|kya|batao|dikhao|kaun|kab|kaise|kahan|total|aaj|kal|month|mahina|saal|hisab|hoga|hua|hai|hain|chahiye|\?)/.test(s)) return 'business_query';
  if (/what about (expenses|expense|kharcha)/.test(rawLower) && ctx.userFacts?.some((f) => /csc/i.test(f))) return 'business_query';
  if (/(kitna|kitne|total|hisab)/.test(s) && /(aaj|kal|month|mahina)/.test(s)) return 'business_query';
  // 9. General knowledge / everyday help (remaining questions).
  if (/(joke|chutkula|hasao|majak|funny|pan card|aadhaar|voter|ayushman|csc|internet|wifi|printer|print|phone|mobile|computer|upi.*fail|payment.*fail|storage|business idea|website|email|whatsapp.*message|caption|translate|matlab|photosynthesis|gst|kaun ho|who are you|tum kaun|\+|\*|% of|km|miles|kg|pound)/.test(s)) return 'general';
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
