/**
 * BizKhata data model (website, local-first).
 * All money fields are integer PAISE. See money.ts.
 * One account -> up to 3 business profiles, each fully separate.
 */

export type Method = 'cash' | 'upi';
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
  address: string;
  mobile: string;
  /** Opening balances (paise). Everything else is derived from transactions. */
  openingCashPaise: number;
  openingUpiPaise: number;
  receiptPrefix: string;
  receiptCounter: number;
  language: Lang;
  theme: Theme;
  geminiKey: string;
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
}

export const EMPTY_STATE: AppState = {
  owner: null,
  profiles: [],
  activeProfileId: null,
  jobs: [],
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
};

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
