/**
 * Development requests — the AI's app-change workflow (UPDATE 22).
 *
 * When the owner asks the AI to create a module / add a service, field,
 * feature, category or report, the AI does NOT build it on the spot and
 * NEVER claims it exists. It shows a proposed spec, asks for
 * confirmation, and on confirmation records a real saved DEVELOPMENT
 * REQUEST (status 'queued') that the owner can reopen on the
 * /module-requests page. The request is a RECORD of the ask — it is
 * not the module itself, and the module only appears after it is
 * actually built and tested.
 *
 * A BizKhata management module is NOT a submission to UIDAI or any
 * government portal: it only tracks the shop's own work. That
 * distinction is stated plainly in the spec reply whenever relevant.
 */
import type { AiLangCode } from './languages';

export type AppChangeKind = 'module' | 'service' | 'feature' | 'category' | 'field' | 'report';

export interface AppChangeSpec {
  kind: AppChangeKind;
  /** Name of the thing requested, e.g. 'Aadhaar Mobile Number Update'. */
  name: string;
  /** Proposed contents, one line each. */
  lines: string[];
  /** True when the request touches Aadhaar/UIDAI — the UIDAI distinction applies. */
  touchesAadhaar: boolean;
}

export interface DevRequest {
  id: string;
  kind: AppChangeKind;
  name: string;
  /** Proposed spec lines, as shown to the user. */
  spec: string[];
  status: 'queued';
  createdAt: string;
  /** The exact words the owner asked with. */
  requestedAs: string;
}

/* ================= Spec building ================= */

const KIND_WORDS: [RegExp, AppChangeKind][] = [
  [/module/, 'module'],
  [/categor/, 'category'],
  [/field/, 'field'],
  [/report/, 'report'],
  [/service/, 'service'],
  [/feature/, 'feature'],
  [/dashboard/, 'feature'],
];

/** "Aadhaar Mobile Number Update ka module bana do" → kind 'module'. */
export function appChangeKindFor(raw: string): AppChangeKind | null {
  const s = raw.toLowerCase();
  for (const [re, kind] of KIND_WORDS) if (re.test(s)) return kind;
  return null;
}

/** True when the message is an app-change request (creation/modification
 *  of the app itself), not a business question or a data summary. */
export function isAppChangeRequest(raw: string): boolean {
  const s = raw.toLowerCase();
  // Creation markers + a thing: "naya module banao", "add a service",
  // "create a report", "ek naya field add karo", "module bana do".
  if (/(naya|new|create|ek aur)\s+(module|service|feature|categor\w*|field|report|dashboard)/.test(s)) return true;
  if (/module\s*(bana|banado|banao|create|banaye|banau)/.test(s)) return true;
  if (/(add|create|banao|bana\s*do)\s+(a\s+|an\s+|ek\s+|naya\s+|new\s+)?(module|service|feature|categor\w*|field|report|dashboard)\b/.test(s)) return true;
  // Quoted name between the verb and the kind word: "Add a 'GST
  // Number' field to customers", 'Add a "Date of Birth" field'.
  if (/(add|create)\s+(?:a\s+|an\s+)?["'][^"']+["']\s+(field|service|module|feature|categor\w*|report)/.test(s)) return true;
  // Thing-first with a creation marker: "service add karo", "field add
  // karo", "naya report banao". (Bare "report bana do" is NOT this —
  // that generates the report from data, i.e. do_summary.)
  if (/(module|service|feature|categor\w*|field|report)\s+(add|create|naya|new)\b/.test(s)) return true;
  // Modification of an existing thing: "Cash Book mein ek field add karo",
  // "Receipts module mein ye change karo", "report mein ye column add karo".
  if (/(module|service|feature|categor\w*|field|report)\s*(mein|me|ka|ki)\b/.test(s)
    && /(add|change|modify|badlo|banao|update|naya)/.test(s)) return true;
  if (/(modify|change|update|badlo)\s+(the\s+)?(module|service|feature|categor\w*|report|dashboard)/.test(s)) return true;
  // Modification of a named app area: "Modify the Cash Book to show
  // weekly totals", "Change the Daily Business page...".
  if (/(modify|change|update|badlo)\s+(the\s+)?(cash book|upi book|daily business|dashboard|receipts?|settings|money transfer|customer khata|agents?|expenses?|services?)\b/.test(s)) return true;
  return false;
}

const KIND_LABEL: Record<AppChangeKind, string> = {
  module: 'Module', service: 'Service', feature: 'Feature',
  category: 'Category', field: 'Field', report: 'Report',
};

/** The generic placeholder name used when no real name was given. */
export function appChangeFallbackName(kind: AppChangeKind): string {
  return `New ${KIND_LABEL[kind]}`;
}

/** Extract the name of the thing from the request. */
export function appChangeNameFor(raw: string, kind: AppChangeKind): string {
  const fallback = appChangeFallbackName(kind);
  const titleCase = (t: string) => t.split(/\s+/).map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  const stripEdges = (t: string): string => {
    let s = t.trim();
    // Strip leading action/filler words (repeat: "ek naya ...").
    // The verb words (karo/karna/karne/banao/...) are filler too: a
    // single pass leaves a bare verb behind ("Naya service add karo"
    // → "Karo"), so this loops until the text stops changing.
    for (;;) {
      const next = s.replace(/^(please\s+|kripya\s+|ek\s+|a\s+|an\s+|naya\s+|new\s+|add\s+|create\s+|bana\s*do\s+|banao\s+|banado\s+|bana\s+|banane\s+|banayein\s+|banaye\s+|karo\s+|karna\s+|karne\s+|kar\s+|mere\s+liye\s+|mujhe\s+)+/i, '').trim();
      if (next === s) break;
      s = next;
    }
    // Strip trailing filler words (repeat: "... ka", "... naya").
    // Trailing verbs included, for the same reason: "... add karo" /
    // "... add karna hai" must not leave "Karo" / "Karna Hai" as a name.
    for (;;) {
      const next = s.replace(/\s+(ka|ki|ke|mein|me|par|ko|naya|new|ek|a|an|karo|karna|karne|kar|banao|banado|bana|banane|banayein|banaye|do|de|dena|chahiye|hai|hain)$/i, '').trim();
      if (next === s) break;
      s = next;
    }
    // A bare filler word / bare verb left on its own ("Add a new
    // service" → before = "new", "add karo" → "karo") is not a name.
    if (/^(please|kripya|ek|a|an|naya|new|add|create|karo|kar|karna|karne|banao|bana|banane|do|de|dena|chahiye|hai|hain|mere liye|mujhe)$/i.test(s)) return '';
    return s;
  };
  // Quoted name: "Add a 'GST Number' field" → "GST Number".
  const quoted = raw.match(/["']([^"']+)["']/);
  if (quoted) return titleCase(quoted[1].trim());
  // "called X": "Add a new service called Courier" → "Courier".
  const called = raw.match(/\bcalled\s+["']?([A-Za-z][\w\s]*?)["']?\s*$/i);
  if (called) return titleCase(called[1].trim());
  // "for X": "Create a new module for Passport services" → "Passport"
  // (trailing kind word stripped), "Add a feature for SMS reminders"
  // → "SMS Reminders".
  const forName = raw.match(/\bfor\s+([A-Za-z][\w\s]*?)\s*$/i);
  if (forName) {
    const name = forName[1].trim().replace(/\s+(services?|modules?|features?|categor\w*|fields?|reports?|work)$/i, '').trim();
    if (name) return titleCase(name);
  }
  // Dashboard: "Mujhe ek naya dashboard chahiye" → "Dashboard".
  if (/dashboard/i.test(raw)) return 'Dashboard';
  // Modification of a named area: "Modify the Cash Book..." → "Cash Book".
  const area = raw.match(/\b(cash book|upi book|daily business|money transfer|customer khata|receipts?|settings|agents?|expenses?)\b/i);
  if (area && /(modify|change|update|badlo)/i.test(raw)) return titleCase(area[1]);
  // The name usually sits BEFORE the kind word: "Aadhaar Mobile Number
  // Update ka Module bana do" → "Aadhaar Mobile Number Update".
  const m = raw.match(/\b(module|service|feature|categor\w*|field|report|dashboard)\b/i);
  if (m && m.index !== undefined) {
    const rawBefore = raw.slice(0, m.index);
    const before = stripEdges(rawBefore);
    // A location ("Cash Book mein ... field") is not a name. The
    // guard must read the RAW before-part: stripEdges drops trailing
    // "mein"/"ek" as filler, so checking the stripped text misses
    // "Cash Book mein ek ..." entirely and returns "Cash Book" as
    // the field name.
    if (before && !/\b(mein|me|par|ko)\b/i.test(rawBefore)) {
      const name = /^(monthly|daily|weekly|yearly)$/i.test(before) ? `${titleCase(before)} ${KIND_LABEL[kind]}` : before;
      return titleCase(name);
    }
    // Strip ALL leading request verbs, repeatedly: a single replace
    // leaves "karo" behind ("Naya service add karo" → after "add
    // karo" → "karo" → a service named "Karo"). Loop until the text
    // stops changing, then strip edges again.
    const verb = /^\s*(bana\s*do|banao|banado|bana|banane|banayein|banaye|create|add|called\s+|karo|karna|karne|kar|do|de|dena|chahiye|naya|new|hai|hain)\b\s*/i;
    let after = raw.slice(m.index + m[0].length);
    let prevAfter = '';
    while (after !== prevAfter) {
      prevAfter = after;
      after = after.replace(verb, '');
    }
    after = stripEdges(after);
    // A bare verb left over is not a name — fall through to the
    // generic fallback (and the "what is its name?" ask) instead.
    if (after && !/^(karo|kar|karna|karne|banao|bana|banane|do|de|dena|chahiye|hai|hain|naya|new|add|create)$/i.test(after)) return titleCase(after);
  }
  const whole = stripEdges(raw);
  if (whole && !/\b(mein|me|par|ko|module|service|feature|categor\w*|field|report|dashboard|bana|banao|banado|create|add|chahiye|naya|new)\b/i.test(whole)) return titleCase(whole);
  return fallback;
}

const AADHAAR_MOBILE_SPEC: { hi: string[]; en: string[] } = {
  hi: [
    'Alag page: Aadhaar Mobile Number Update',
    'Customer ka naam, purana mobile number, naya mobile number',
    'Application date, service charge, received + pending (auto)',
    'Cash / UPI payment mode',
    'Status: New / Pending / Completed / Delivered / Cancelled',
    'Notes + job history, receipt generation',
    'Daily / Monthly / Yearly reports, edit / delete / search',
    'Integration: Customer Management, Daily Business, Reports',
  ],
  en: [
    'Separate page: Aadhaar Mobile Number Update',
    'Customer name, old mobile number, new mobile number',
    'Application date, service charge, received + pending (auto)',
    'Cash / UPI payment mode',
    'Status: New / Pending / Completed / Delivered / Cancelled',
    'Notes + job history, receipt generation',
    'Daily / Monthly / Yearly reports, edit / delete / search',
    'Integration: Customer Management, Daily Business, Reports',
  ],
};

function genericSpec(kind: AppChangeKind, name: string, lang: AiLangCode): string[] {
  const hi = lang !== 'en';
  switch (kind) {
    case 'module':
      return hi
        ? [`Alag page: ${name}`, 'Customer / record details form (naam, date, amount, status)', 'List + search + edit / delete', 'Receipt generation, reports (daily / monthly / yearly)', 'Integration: Customer Management, Daily Business, Reports']
        : [`Separate page: ${name}`, 'Customer / record details form (name, date, amount, status)', 'List + search + edit / delete', 'Receipt generation, reports (daily / monthly / yearly)', 'Integration: Customer Management, Daily Business, Reports'];
    case 'service':
      return hi
        ? [`Nayi service: ${name}`, 'Services list aur AI Assistant mein aayegi', 'Charge / fee, Cash / UPI, Daily Business mein collection', 'Customer Khata aur Reports mein dikhegi']
        : [`New service: ${name}`, 'Appears in the Services list and the AI Assistant', 'Charge / fee, Cash / UPI, collection in Daily Business', 'Shows in Customer Khata and Reports'];
    case 'field':
      return hi
        ? [`Naya field: ${name}`, 'Form mein naya column/field add hoga', 'Purana data safe rahega — field khali bhi ho sakta hai', 'Reports aur search mein bhi dikhega']
        : [`New field: ${name}`, 'A new column/field is added to the form', 'Old data stays safe — the field may be left empty', 'Also shows in reports and search'];
    case 'category':
      return hi
        ? [`Nayi category: ${name}`, 'Is category ki services alag se dikhengi', 'Business profile setup mein category select hogi', 'Reports category-wise dikhenge']
        : [`New category: ${name}`, 'This category services show separately', 'The category is selectable in business profile setup', 'Reports show category-wise'];
    case 'report':
      return hi
        ? [`Nayi report: ${name}`, 'Daily / Monthly / Yearly scope', 'Real record se figures — koi invented number nahi', 'PDF / Excel export, print']
        : [`New report: ${name}`, 'Daily / Monthly / Yearly scope', 'Figures from real records — no invented numbers', 'PDF / Excel export, print'];
    case 'feature':
    default:
      return hi
        ? [`Naya feature: ${name}`, 'App mein wahi jagah par dikhega jahan kaam hota hai', 'Purana kaam badlega nahi — naya option add hoga', 'Test hone ke baad hi dikhega']
        : [`New feature: ${name}`, 'Appears where the work happens in the app', 'Old work does not change — a new option is added', 'Shows only after it is tested'];
  }
}

/** Build the proposed spec for an app-change request. */
export function buildAppChangeSpec(raw: string, lang: AiLangCode): AppChangeSpec {
  const kind = appChangeKindFor(raw) || 'module';
  const name = appChangeNameFor(raw, kind);
  const touchesAadhaar = /aadhaar|aadhar|uidai/.test(raw.toLowerCase());
  let lines: string[];
  if (touchesAadhaar && /mobile/.test(raw.toLowerCase()) && kind === 'module') {
    lines = lang === 'en' ? AADHAAR_MOBILE_SPEC.en : AADHAAR_MOBILE_SPEC.hi;
  } else {
    lines = genericSpec(kind, name, lang);
  }
  return { kind, name, lines, touchesAadhaar };
}

/** The spec reply: proposed change + honest status + confirmation ask. */
export function appChangeSpecText(spec: AppChangeSpec, lang: AiLangCode): string {
  const hi = lang !== 'en';
  const head = hi
    ? `Ye raha "${spec.name}" ka proposed plan — abhi ye bana NAHI hai, sirf proposal hai:`
    : `Here is the proposed plan for "${spec.name}" — it is NOT built yet, this is only a proposal:`;
  const body = spec.lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
  const note = spec.touchesAadhaar
    ? (hi
      ? '\n\nEk zaroori baat: ye BizKhata ke andar aapke kaam ko track karne ka module hoga — ye UIDAI ko application submit nahi karta, aur iski koi official integration nahi hai.'
      : '\n\nOne important thing: this will be a module inside BizKhata to track your own work — it does not submit applications to UIDAI, and there is no official integration.')
    : '';
  // No real name was given — the name above is only the generic
  // placeholder ("New Service"), never a verb left over from the
  // request ("Karo"). Ask for the real name instead of presenting
  // the placeholder as if it were the name.
  const kindWord = KIND_LABEL[spec.kind].toLowerCase();
  const nameAsk = spec.name === appChangeFallbackName(spec.kind)
    ? (hi
      ? `\n\nEk baat — is ${kindWord} ka naam kya hai? Naam batao (jaise "Courier"), to main plan usi naam se bana dunga.`
      : `\n\nOne thing — what is the name of this ${kindWord}? Tell me its name (for example "Courier"), and I will make the plan with that name.`)
    : '';
  const ask = hi
    ? '\n\nAgar ye plan theek hai to "Haan, banao" bolo — main ise development queue mein save kar dunga. (In-app AI khud code deploy nahi kar sakta — isiliye ye request queue mein jati hai.) Banne aur test hone ke baad hi ye app mein dikhega; usse pehle main kabhi nahi kahunga ki ye ban gaya hai.'
    : '\n\nIf this plan looks right, say "Yes, build it" — I will save it to the development queue. (The in-app AI cannot deploy code itself — that is why the request goes to the queue.) It will appear in the app only after it is built and tested; I will never claim it is ready before that.';
  return `${head}\n${body}${note}${nameAsk}${ask}`;
}

/** The queued confirmation reply — honest: queued, not built. */
export function appChangeQueuedText(spec: AppChangeSpec, lang: AiLangCode): string {
  const hi = lang !== 'en';
  return hi
    ? `"${spec.name}" development queue mein save ho gaya hai — status: Queued.\n\nYe abhi bana nahi hai. Development workflow mein banne aur test hone ke baad hi ye app mein dikhega. Aap apni saari requests "Module Requests" page par dekh sakte ho.`
    : `"${spec.name}" has been saved to the development queue — status: Queued.\n\nIt is not built yet. It will appear in the app only after it is built and tested in the development workflow. You can see all your requests on the "Module Requests" page.`;
}

/* ================= Storage (same pattern as checklists) ================= */

const memStore = new Map<string, DevRequest[]>();
function storeKey(profileId: string): string {
  return `bizkhata.devrequests.v1.${profileId}`;
}

export function saveDevRequest(profileId: string, r: DevRequest): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(storeKey(profileId));
      const list: DevRequest[] = raw ? JSON.parse(raw) : [];
      list.unshift(r);
      window.localStorage.setItem(storeKey(profileId), JSON.stringify(list.slice(0, 50)));
      return;
    }
  } catch { /* fall through to memory */ }
  const list = memStore.get(profileId) || [];
  list.unshift(r);
  memStore.set(profileId, list.slice(0, 50));
}

export function listDevRequests(profileId: string): DevRequest[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(storeKey(profileId));
      if (raw) return JSON.parse(raw) as DevRequest[];
    }
  } catch { /* ignore */ }
  return memStore.get(profileId) || [];
}

export function queueDevRequest(profileId: string, spec: AppChangeSpec, requestedAs: string): DevRequest {
  const r: DevRequest = {
    id: `dev_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`,
    kind: spec.kind,
    name: spec.name,
    spec: spec.lines,
    status: 'queued',
    createdAt: new Date().toISOString(),
    requestedAs,
  };
  saveDevRequest(profileId, r);
  return r;
}
