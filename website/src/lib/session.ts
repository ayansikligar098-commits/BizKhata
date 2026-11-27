/**
 * BizKhata persistent session layer (website, local-first deployment).
 *
 * ARCHITECTURE — read before changing:
 * The website is a Next.js static export on Cloudflare Pages (free hosting).
 * There is NO server database and NO server-side user store in this
 * deployment, so there is no server that could validate a session today.
 * A full server-side session layer (Pages Functions + KV/D1 session store +
 * a dashboard-configured signing secret) is the documented next step in
 * README.md — it needs Cloudflare dashboard bindings this agent cannot
 * create, so it is NOT faked here.
 *
 * What this module DOES implement, honestly, on the static tier:
 * - Opaque random session tokens (256-bit, crypto.getRandomValues), NOT a
 *   boolean `loggedIn` flag and NOT the PIN hash in storage.
 * - Access token (15 min) + refresh token (30 days). Raw tokens live in
 *   cookies (Secure on HTTPS, SameSite=Lax, Path=/). UPDATE 24: the raw
 *   refresh token is ALSO kept in localStorage (key bizkhata.rt.v1) and
 *   read from there FIRST, because cookies alone do not survive in-app
 *   browsers / cleared cookies — that was why "Login Save Nahi Rehta".
 *   Honest trade-off on this static local-first deployment: there is no
 *   server, so the refresh token only guards LOCAL data on this device;
 *   storing it in localStorage is the accepted cost of login surviving
 *   cookie loss. Server-side sessions (Pages Functions + KV/D1) remain
 *   the documented next step; until then no claim of server security is
 *   made. localStorage also holds ONLY SHA-256 hashes of the tokens +
 *   metadata (owner, expiry, device).
 *   NOTE: cookies set from JS cannot be HttpOnly — that needs a server
 *   (Pages Functions). This is the known gap; see README.md.
 * - Rotation: using the refresh token issues a NEW access token (and a new
 *   refresh token) and revokes the old refresh token hash — with a 60s
 *   grace window for the previous hash, so two tabs renewing at once do
 *   not revoke each other (UPDATE 24). A localStorage single-flight lock
 *   makes renewal tab-safe; a tab that finds the lock held waits briefly
 *   and then re-reads the (shared) record instead of failing.
 * - Revocation: logout deletes the cookies + the localStorage refresh
 *   token + the session record and records the token hashes in a local
 *   revocation list, so a revoked session can never be replayed on this
 *   device.
 * - Multi-tab sync: BroadcastChannel + storage events (logout in one tab
 *   logs out every tab; a fresh login in one tab is visible to others).
 * - Offline-aware verification: no network = "retry", NEVER "logged out".
 *
 * The PIN itself is never stored. Login still verifies the mobile+PIN
 * against the local PIN hash (see store.ts) — that check is unchanged.
 */

export const ACCESS_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const RENEW_BEFORE_MS = 5 * 60 * 1000; // renew access when < 5 min left
/** Previous refresh hash stays usable this long after rotation (tab-race grace). */
export const REFRESH_GRACE_MS = 60 * 1000; // 60 seconds
/** How long one tab may hold the renewal lock before another tab treats it as stale. */
const RENEW_LOCK_TTL_MS = 10 * 1000;

const RECORD_KEY = 'bizkhata.session.v1';
const REVOKED_KEY = 'bizkhata.session.revoked.v1';
/** Raw refresh token mirror (UPDATE 24) — read FIRST, cookie is the fallback. */
const REFRESH_LS_KEY = 'bizkhata.rt.v1';
const RENEW_LOCK_KEY = 'bizkhata.renew.lock.v1';
const LAST_PATH_KEY = 'bizkhata.lastPath';
const CHANNEL = 'bizkhata-session';

export interface SessionRecord {
  version: 1;
  ownerMobile: string;
  deviceId: string;
  accessHash: string;
  refreshHash: string;
  /** Previous refresh hash, still accepted until previousRefreshExpiresAt (grace). */
  previousRefreshHash?: string;
  previousRefreshExpiresAt?: number;
  accessExpiresAt: number; // epoch ms
  refreshExpiresAt: number; // epoch ms
  issuedAt: number;
}

export type VerifyResult =
  | { status: 'valid' }
  | { status: 'renewed' }
  | { status: 'none' }
  | { status: 'expired' }
  | { status: 'revoked' }
  | { status: 'offline' };

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/** 256-bit opaque token, base64url. */
export function newToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 hex of a token. Falls back to FNV if SubtleCrypto is unavailable. */
export async function hashToken(token: string): Promise<string> {
  try {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `fnv_${(h >>> 0).toString(16)}`;
  }
}

function readCookie(name: string): string | null {
  if (!isBrowser()) return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (!isBrowser()) return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function deleteCookie(name: string): void {
  if (!isBrowser()) return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Refresh token, UPDATE 24: localStorage FIRST, cookie as fallback.
 * Cookies alone did not survive in-app browsers / cleared cookies, so
 * renewal died and the user was logged out. Both stores are written on
 * issue/renew and both are cleared on logout.
 */
function readRefreshToken(): string | null {
  if (!isBrowser()) return null;
  try {
    const fromLs = window.localStorage.getItem(REFRESH_LS_KEY);
    if (fromLs) return fromLs;
  } catch { /* ignore */ }
  return readCookie('bizkhata.rt');
}

function writeRefreshToken(value: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(REFRESH_LS_KEY, value);
  } catch { /* ignore — cookie still written below */ }
  writeCookie('bizkhata.rt', value, Math.floor(REFRESH_TTL_MS / 1000));
}

function clearRefreshToken(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(REFRESH_LS_KEY);
  } catch { /* ignore */ }
  deleteCookie('bizkhata.rt');
}

/** True when a session record exists on this device/browser (UPDATE 24). */
export function hasSessionRecord(): boolean {
  return readRecord() !== null;
}

function readRecord(): SessionRecord | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(RECORD_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as SessionRecord;
    if (rec.version !== 1 || !rec.refreshHash || !rec.accessHash) return null;
    return rec;
  } catch {
    return null;
  }
}

function writeRecord(rec: SessionRecord): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(RECORD_KEY, JSON.stringify(rec));
}

function readRevoked(): string[] {
  if (!isBrowser()) return [];
  try {
    return JSON.parse(window.localStorage.getItem(REVOKED_KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

function addRevoked(hashes: string[]): void {
  if (!isBrowser()) return;
  const list = [...new Set([...readRevoked(), ...hashes])].slice(-20);
  window.localStorage.setItem(REVOKED_KEY, JSON.stringify(list));
}

function getDeviceId(): string {
  if (!isBrowser()) return 'server';
  let id = window.localStorage.getItem('bizkhata.device');
  if (!id) {
    id = newToken();
    window.localStorage.setItem('bizkhata.device', id);
  }
  return id;
}

function broadcast(type: 'login' | 'logout' | 'renewed'): void {
  if (!isBrowser()) return;
  try {
    new BroadcastChannel(CHANNEL).postMessage({ type, at: Date.now() });
  } catch {
    /* BroadcastChannel unavailable — storage events still sync tabs. */
  }
}

/** Issue a fresh session after a successful mobile+PIN check. */
export async function issueSession(ownerMobile: string): Promise<void> {
  const now = Date.now();
  const access = newToken();
  const refresh = newToken();
  const rec: SessionRecord = {
    version: 1,
    ownerMobile,
    deviceId: getDeviceId(),
    accessHash: await hashToken(access),
    refreshHash: await hashToken(refresh),
    accessExpiresAt: now + ACCESS_TTL_MS,
    refreshExpiresAt: now + REFRESH_TTL_MS,
    issuedAt: now,
  };
  writeRecord(rec);
  writeCookie('bizkhata.at', access, Math.floor(ACCESS_TTL_MS / 1000));
  writeRefreshToken(refresh);
  broadcast('login');
}

/** Single-flight renewal lock (localStorage, best-effort across tabs). */
function acquireRenewLock(): string | null {
  if (!isBrowser()) return null;
  const token = newToken();
  const now = Date.now();
  try {
    const raw = window.localStorage.getItem(RENEW_LOCK_KEY);
    if (raw) {
      const lock = JSON.parse(raw) as { token: string; expiresAt: number };
      if (lock.expiresAt > now) return null; // another tab is renewing
    }
    window.localStorage.setItem(RENEW_LOCK_KEY, JSON.stringify({ token, expiresAt: now + RENEW_LOCK_TTL_MS }));
    return token;
  } catch {
    return token; // storage unavailable — proceed without the lock
  }
}

function releaseRenewLock(token: string | null): void {
  if (!isBrowser() || !token) return;
  try {
    const raw = window.localStorage.getItem(RENEW_LOCK_KEY);
    if (raw && (JSON.parse(raw) as { token: string }).token === token) {
      window.localStorage.removeItem(RENEW_LOCK_KEY);
    }
  } catch { /* ignore */ }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Is the stored session currently fresh (access token alive)? */
async function sessionIsFresh(): Promise<boolean> {
  const rec = readRecord();
  if (!rec) return false;
  const now = Date.now();
  if (now >= rec.refreshExpiresAt) return false;
  const access = readCookie('bizkhata.at');
  if (access && (await hashToken(access)) === rec.accessHash && now < rec.accessExpiresAt) return true;
  // No usable access cookie, but the refresh token in shared storage is
  // the CURRENT one — another tab just renewed, so the session is alive.
  const refresh = readRefreshToken();
  if (refresh && (await hashToken(refresh)) === rec.refreshHash) return true;
  return false;
}

/**
 * One rotation attempt against the FRESH record + FRESH refresh token.
 * Accepts the current refresh hash, or the previous hash inside its 60s
 * grace window (a tab that started renewing before another tab rotated).
 * Presenting a previous-grace hash means another tab already rotated, so
 * the session is already fresh — return true without rotating again.
 */
async function tryRotateOnce(): Promise<boolean> {
  const rec = readRecord();
  const refresh = readRefreshToken();
  if (!rec || !refresh) return false;
  const now = Date.now();
  if (now >= rec.refreshExpiresAt) return false;
  const presented = await hashToken(refresh);
  const isCurrent = presented === rec.refreshHash;
  const isPrevious =
    !!rec.previousRefreshHash &&
    presented === rec.previousRefreshHash &&
    now < (rec.previousRefreshExpiresAt ?? 0);
  if (!isCurrent && !isPrevious) return false;
  if (isPrevious) return true; // already rotated by another tab
  if (readRevoked().includes(presented)) return false;

  const access = newToken();
  const nextRefresh = newToken();
  addRevoked([rec.refreshHash]); // old refresh token is single-use (+60s grace)
  const next: SessionRecord = {
    ...rec,
    accessHash: await hashToken(access),
    refreshHash: await hashToken(nextRefresh),
    previousRefreshHash: rec.refreshHash,
    previousRefreshExpiresAt: now + REFRESH_GRACE_MS,
    accessExpiresAt: now + ACCESS_TTL_MS,
    refreshExpiresAt: now + REFRESH_TTL_MS,
    issuedAt: now,
  };
  writeRecord(next);
  writeCookie('bizkhata.at', access, Math.floor(ACCESS_TTL_MS / 1000));
  writeRefreshToken(nextRefresh);
  broadcast('renewed');
  return true;
}

/**
 * Rotate the access token using the refresh token. Tab-safe: only one tab
 * rotates at a time (lock); a tab that finds the lock held waits briefly
 * for the other tab's rotation and then re-reads shared storage instead
 * of failing. Returns false only if the refresh session is really gone.
 */
export async function renewSession(): Promise<boolean> {
  const lock = acquireRenewLock();
  if (!lock) {
    // Another tab is renewing — wait for it, then trust shared storage.
    for (let i = 0; i < 10; i++) {
      await sleep(200);
      if (await sessionIsFresh()) return true;
    }
    // Lock holder seems stuck (or its lock expired): try ourselves.
    return tryRotateOnce();
  }
  try {
    return await tryRotateOnce();
  } finally {
    releaseRenewLock(lock);
  }
}

/**
 * Verify the saved session. Never throws for offline: no network is
 * reported as 'offline' (retry), never as logged out.
 */
export async function verifySession(): Promise<VerifyResult> {
  if (!isBrowser()) return { status: 'none' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline' };
  const rec = readRecord();
  const access = readCookie('bizkhata.at');
  // UPDATE 24: refresh token comes from localStorage first, cookie fallback.
  const refresh = readRefreshToken();
  if (!rec || (!access && !refresh)) return { status: 'none' };
  const now = Date.now();
  if (now >= rec.refreshExpiresAt) return { status: 'expired' };
  const refreshHash = refresh ? await hashToken(refresh) : null;
  // A previous-grace refresh hash is in the revocation list by design;
  // it is NOT a revoked session. Only a hash that is neither current nor
  // grace-previous counts as revoked.
  const isPreviousGrace =
    !!refreshHash &&
    !!rec.previousRefreshHash &&
    refreshHash === rec.previousRefreshHash &&
    now < (rec.previousRefreshExpiresAt ?? 0);
  if (refreshHash && refreshHash !== rec.refreshHash && !isPreviousGrace && readRevoked().includes(refreshHash)) {
    return { status: 'revoked' };
  }
  if (access) {
    const accessHash = await hashToken(access);
    if (accessHash === rec.accessHash && now < rec.accessExpiresAt) {
      return { status: 'valid' };
    }
    if (accessHash !== rec.accessHash && readRevoked().includes(accessHash)) {
      return { status: 'revoked' };
    }
  }
  // Access token expired/missing but refresh is alive -> rotate silently.
  if (refreshHash === rec.refreshHash || isPreviousGrace) {
    return (await renewSession()) ? { status: 'renewed' } : { status: 'expired' };
  }
  return { status: 'expired' };
}

/** Revoke the session: cookies + localStorage refresh token + record deleted, hashes blocklisted. */
export function revokeSession(): void {
  const rec = readRecord();
  if (rec) {
    addRevoked([rec.accessHash, rec.refreshHash, ...(rec.previousRefreshHash ? [rec.previousRefreshHash] : [])]);
  }
  if (isBrowser()) window.localStorage.removeItem(RECORD_KEY);
  deleteCookie('bizkhata.at');
  clearRefreshToken();
  broadcast('logout');
}

/** Milliseconds until the access token expires (<= 0 when expired/absent). */
export function accessMsLeft(): number {
  const rec = readRecord();
  return rec ? rec.accessExpiresAt - Date.now() : 0;
}

export function readSessionMeta(): { ownerMobile: string | null; refreshExpiresAt: number | null } {
  const rec = readRecord();
  return { ownerMobile: rec?.ownerMobile ?? null, refreshExpiresAt: rec?.refreshExpiresAt ?? null };
}

/** Last private route the user visited (for the `/` redirect). */
export function readLastPath(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(LAST_PATH_KEY);
}

export function writeLastPath(path: string): void {
  if (!isBrowser()) return;
  if (path === '/' || path.startsWith('/login')) return;
  window.localStorage.setItem(LAST_PATH_KEY, path);
}

/** Listen for login/logout/renew events from other tabs. */
export function onSessionEvent(cb: (type: 'login' | 'logout' | 'renewed') => void): () => void {
  if (!isBrowser()) return () => undefined;
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (e: MessageEvent) => {
      if (e.data && typeof e.data.type === 'string') cb(e.data.type as 'login' | 'logout' | 'renewed');
    };
  } catch {
    bc = null;
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === RECORD_KEY && e.newValue === null) cb('logout');
    if (e.key === RECORD_KEY && e.newValue !== null && e.oldValue === null) cb('login');
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('storage', onStorage);
    bc?.close();
  };
}
