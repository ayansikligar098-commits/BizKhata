/**
 * Local-first store for BizKhata website.
 * All data lives in localStorage (key bizkhata.v1) on the user's device.
 * No server, no paid backend — this is what makes the Cloudflare Pages
 * static deployment work with zero cost.
 * Every mutation is recorded in the audit log (old value -> new value).
 */
import type { AppState, AuditEntry, BusinessProfile, RecycleItem } from './types';
import { EMPTY_STATE, uid } from './types';

const KEY = 'bizkhata.v1';

export function loadState(): AppState {
  if (typeof window === 'undefined') return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as AppState;
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: AppState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // localStorage full (e.g. many large document data-URLs): keep the app
    // working, but warn in the UI via the returned flag in useStore.
    throw new Error('storage_full');
  }
}

/**
 * Normalize an Indian mobile number to its 10-digit form.
 * Accepts "+91 98765 43210", "09876543210", "98765 43210", "91-9876543210",
 * spaces/dashes/brackets — returns the last 10 digits, or null when the
 * input does not resolve to exactly 10 digits.
 * MUST be applied BEFORE hashing (hashPin uses the mobile as the salt) and
 * identically at register / login / PIN-reset, or the hash never matches.
 */
export function normalizeMobile(input: string): string | null {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const last10 = digits.slice(-10);
  // A leading 0 or 91/​+91 is stripped by taking the last 10 digits; reject
  // anything longer than 12 digits (e.g. a foreign code) rather than guessing.
  if (digits.length > 12) return null;
  if (!/^\d{10}$/.test(last10)) return null;
  return last10;
}

/** Simple local-only PIN hash (NOT a server secret — the data is local). */
export function hashPin(pin: string, salt: string): string {
  let h = 2166136261;
  const s = `${salt}:${pin}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv_${(h >>> 0).toString(16)}`;
}

export function auditEntry(
  profileId: string,
  action: string,
  entity: string,
  entityId: string,
  oldValue: string,
  newValue: string,
): AuditEntry {
  return {
    id: uid('aud'),
    profileId,
    action,
    entity,
    entityId,
    oldValue,
    newValue,
    at: new Date().toISOString(),
  };
}

export function recycleEntry(profileId: string, kind: string, label: string, data: unknown): RecycleItem {
  return {
    id: uid('rec'),
    profileId,
    kind,
    label,
    data: JSON.stringify(data),
    deletedAt: new Date().toISOString(),
  };
}

export function nextReceiptNumber(profile: BusinessProfile): string {
  const n = profile.receiptCounter + 1;
  return `${profile.receiptPrefix}-${String(n).padStart(4, '0')}`;
}

/** Export the whole state as a JSON backup file (free, local). */
export function exportBackup(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bizkhata-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export rows as CSV (free, local). */
export function exportCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const text = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** WhatsApp share link (manual — no paid auto service). */
export function whatsAppLink(mobile: string, message: string): string {
  const phone = mobile.replace(/\D/g, '');
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
