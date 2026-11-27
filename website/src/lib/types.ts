/**
 * BizKhata data model (website, local-first).
 * All money fields are integer PAISE. See money.ts.
 * One account -> up to 3 business profiles, each fully separate.
 */

export type Method = 'cash' | 'upi';
import type { AiLangCode } from './languages';
export type Lang = 'en' | 'hi' | 'hinglish';
export type Theme = 'light' | 'dark' | 'system';
export type JobStatus =
  | 'New'
  | 'In Progress'
  | 'Submitted'
  | 'Pending'
  | 'Completed'
  | 'Delivered'
  | 'Cancelled';

export interface OwnerAccount {
  mobile: string;
  /** Simple local-only hash of the PIN (not a server secret). */
  pinHash: string;
  recoveryWord: string;
  createdAt: string;
}

export interface BusinessProfile {
  id: string;
  name: string;
  category: string;
  /** Ready-made services for the category, plus owner-added ones. */
  services: string[];
  customServices: string[];
  expenseCategories: string[];
  customExpenseCategories: string[];
  /** Modules hidden by the owner in Customization Studio. */
  disabledModules: string[];
  /** Dashboard cards hidden by the owner. */
  hiddenCards: string[];
  /** One-time migration flag: 'Passport Size Photo' + 'Scanning' added to
   *  an existing CSC profile's service list (new profiles get them from the
   *  category defaults). */
  servicesV2Migrated?: boolean;
  address: string;
  mobile: string;
  /** Opening balances (paise). Everything else is derived from transactions. */
  openingCashPaise: number;
  openingUpiPaise: number;
  receiptPrefix: string;
  receiptCounter: number;
  language: Lang;
  /** AI Assistant reply language: one of the 22 scheduled languages +
   *  English, or 'auto' (default) — the assistant detects the user's
   *  language from each message and replies in the same language/style. */
  aiLanguage?: AiLangCode | 'auto';
  /** Voice (UPDATE 18): speak AI replies aloud, speech rate
   *  (0.5 slow … 1.5 fast), keep listening across turns, and the
   *  preferred speech-voice name per language code ('default' = any
   *  language). Browser voices only — no cloud voice, no key. */
  voiceReplies?: boolean;
  voiceRate?: number;
  voiceContinuous?: boolean;
  voiceByLang?: Record<string, string>;
  /** UPDATE 25: the AI voice picked in Settings → Voice (a prebuilt
   *  voice name such as 'Kore'; default 'Kore'). The device-voice
   *  fields above (voiceRate / voiceByLang) no longer drive any
   *  speech output — the owner rejected the phone's voice; spoken
   *  replies are AI voice only (src/lib/ai-voice.ts). */
  aiVoice?: string;
  theme: Theme;
  createdAt: string;
}

export interface Job {
  id: string;
  profileId: string;
  service: string;
  customerName: string;
  mobile: string;
  refNo: string;
  status: JobStatus;
  /** Total fees billed (paise). */
  totalPaise: number;
  /** Actually received from the customer (paise). Only this touches cash/UPI. */
  receivedPaise: number;
  receivedMethod: Method;
  agentId: string | null;
  agentChargePaise: number;
  agentPaidPaise: number;
  date: string; // ISO date yyyy-mm-dd
  notes: string;
  docIds: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Quick Daily Business entry — one small daily sale/service that does not
 * need a full job + customer record (Xerox, Printing, Scanning, Passport
 * Size Photo, Smart Card, Document Work, ...).
 * ONE real transaction = ONE entry in the books: a Cash/UPI entry writes
 * exactly one CashTxn (kind 'in', linked by dailyEntryId) so Cash/UPI
 * balances move once and the entry is visible in Daily Business, the
 * Cash/UPI Book and Reports without ever being counted twice.
 * Payment mode 'other' means the money was NOT collected yet (credit/due):
 * no CashTxn is written and the amount counts as due, never as collection.
 */
export type DailyEntryMethod = 'cash' | 'upi' | 'other';

export interface DailyEntry {
  id: string;
  profileId: string;
  service: string;
  description: string;
  /** Number of units (pages, photos, copies, ...). Integer. */
  quantity: number;
  /** Price per unit (paise). */
  ratePaise: number;
  /** Total billed = quantity * ratePaise (integer paise, never float). */
  totalPaise: number;
  method: DailyEntryMethod;
  /** Direct expense for this entry, if any (paise) — e.g. paper/ink used.
   *  Recorded as an Expense + one CashTxn 'out' (linked by dailyEntryId),
   *  so it is deducted exactly once. */
  expensePaise: number;
  /** How the direct expense was paid (only used when expensePaise > 0). */
  expenseMethod: Method;
  date: string; // ISO date yyyy-mm-dd
  time: string; // HH:mm
  notes: string;
  createdAt: string;
}

export interface CashTxn {
  id: string;
  profileId: string;
  /** 'in' = money received, 'out' = money spent, 'transfer' = internal move. */
  kind: 'in' | 'out' | 'transfer';
  method: Method;
  amountPaise: number;
  category: string;
  note: string;
  date: string;
  /** For transfers: the other side ('cash' <-> 'upi'). */
  transferTo?: Method;
  jobId?: string;
  /** Quick Daily Business entry this transaction belongs to (if any).
   *  A daily entry writes exactly one 'in' CashTxn with this link, so the
   *  Daily Business hub can attribute it to its service without ever
   *  counting the same money twice (never job + txn). */
  dailyEntryId?: string;
  /** Expense record this 'out' transaction pays for (if any). An 'out'
   *  CashTxn with an expenseId is the same money as that Expense record —
   *  reports must count one of them, never both. */
  expenseId?: string;
  createdAt: string;
}

export interface MtFund {
  id: string;
  profileId: string;
  /** Fund received from brother (by UPI). */
  amountPaise: number;
  method: Method;
  date: string;
  note: string;
}

export interface MtTransfer {
  id: string;
  profileId: string;
  receiverName: string;
  mobile: string;
  amountPaise: number;
  /** Commission earned on this transfer (paise). Profit comes ONLY from this. */
  commissionPaise: number;
  method: Method;
  status: 'Sent' | 'Pending' | 'Failed';
  refNo: string;
  date: string;
  note: string;
}

export interface MtExpense {
  id: string;
  profileId: string;
  category: 'Tea/Food' | 'Transport' | 'Staff' | 'Shop' | 'Miscellaneous';
  amountPaise: number;
  method: Method;
  date: string;
  note: string;
}

export interface Customer {
  id: string;
  profileId: string;
  name: string;
  mobile: string;
  notes: string;
  docIds: string[];
  createdAt: string;
}

export interface DocFile {
  id: string;
  profileId: string;
  ownerType: 'customer' | 'job';
  ownerId: string;
  name: string;
  mime: string;
  /** data: URL (local only). Kept small; large files are rejected. */
  dataUrl: string;
  category: string;
  notes: string;
  uploadedAt: string;
}

export interface Agent {
  id: string;
  profileId: string;
  name: string;
  mobile: string;
  /** e.g. "Aadhaar Backend Agent", "Licence Agent", custom types allowed. */
  type: string;
  status: 'Active' | 'Inactive';
  notes: string;
}

export interface Expense {
  id: string;
  profileId: string;
  category: string;
  equipmentId: string | null;
  description: string;
  amountPaise: number;
  method: Method;
  vendor: string;
  date: string;
  /** Service this cost belongs to (for accurate service profit). */
  service: string;
  notes: string;
  /** Quick Daily Business entry this expense belongs to (if any). */
  dailyEntryId?: string;
  createdAt: string;
}

export interface MaintenanceRecord {
  id: string;
  date: string;
  description: string;
  partsReplaced: string;
  costPaise: number;
}

export interface Equipment {
  id: string;
  profileId: string;
  name: string;
  purchaseDate: string;
  purchaseCostPaise: number;
  lastMaintenance: string;
  nextMaintenance: string;
  records: MaintenanceRecord[];
}

export interface Receipt {
  id: string;
  profileId: string;
  number: string; // e.g. BK-0001
  jobId: string | null;
  customerName: string;
  mobile: string;
  service: string;
  totalPaise: number;
  paidPaise: number;
  duePaise: number;
  method: Method;
  date: string;
  notes: string;
  layout: 'A4' | 'Thermal';
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  profileId: string;
  action: string;
  entity: string;
  entityId: string;
  oldValue: string;
  newValue: string;
  at: string;
}

export interface RecycleItem {
  id: string;
  profileId: string;
  kind: string;
  label: string;
  data: string; // JSON of the deleted record
  deletedAt: string;
}

export interface AppState {
  owner: OwnerAccount | null;
  profiles: BusinessProfile[];
  activeProfileId: string | null;
  jobs: Job[];
  /** Quick Daily Business entries (small daily sales, no full job). */
  dailyEntries: DailyEntry[];
  cashTxns: CashTxn[];
  mtFunds: MtFund[];
  mtTransfers: MtTransfer[];
  mtExpenses: MtExpense[];
  customers: Customer[];
  docs: DocFile[];
  agents: Agent[];
  expenses: Expense[];
  equipment: Equipment[];
  receipts: Receipt[];
  audit: AuditEntry[];
  recycle: RecycleItem[];
  /** Idempotency keys of assistant actions already executed. A repeated
   *  key is rejected, so a retry/double-tap can never duplicate a
   *  financial transaction. */
  executedActionKeys: string[];
}

export const EMPTY_STATE: AppState = {
  owner: null,
  profiles: [],
  activeProfileId: null,
  jobs: [],
  dailyEntries: [],
  cashTxns: [],
  mtFunds: [],
  mtTransfers: [],
  mtExpenses: [],
  customers: [],
  docs: [],
  agents: [],
  expenses: [],
  equipment: [],
  receipts: [],
  audit: [],
  recycle: [],
  executedActionKeys: [],
};

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Today's date as YYYY-MM-DD in the DEVICE'S LOCAL timezone.
 *  (Was: new Date().toISOString() — the UTC date — so between 00:00
 *  and 05:30 IST the app dated everything "yesterday" and "kal"
 *  resolved a day early. A shop's "today" is its local calendar day.) */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Shift a YYYY-MM-DD date by N days using pure UTC arithmetic on the
 *  ISO string — never local-time parsing, so the result is identical
 *  in every timezone (no local-midnight → UTC conversion, which
 *  shifts the date by the timezone offset). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}
