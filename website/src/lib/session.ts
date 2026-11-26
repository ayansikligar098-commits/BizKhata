/**
 * BizKhata persistent session layer (website, local-first deployment).
 *
 * ARCHITECTURE — read before changing:
 * The website is a Next.js static export on Cloudflare Pages (free tier).
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
 * - Access token (15 min) + refresh token (30 days). Raw tokens live ONLY
 *   in cookies (Secure on HTTPS, SameSite=Lax, Path=/). localStorage holds
 *   ONLY SHA-256 hashes of the tokens + metadata (owner, expiry, device).
 *   NOTE: cookies set from JS cannot be HttpOnly — that needs a server
 *   (Pages Functions). This is the known gap; see README.md.
 * - Rotation: using the refresh token issues a NEW access token (and a new
 *   refresh token) and revokes the old refresh token hash.
 * - Revocation: logout deletes the cookies + the session record and records
 *   the token hashes in a local revocation list, so a revoked session can
 *   never be replayed on this device.
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

const RECORD_KEY = 'bizkhata.session.v1';
const REVOKED_KEY = 'bizkhata.session.revoked.v1';
const LAST_PATH_KEY = 'bizkhata.lastPath';
const CHANNEL = 'bizkhata-session';

export interface SessionRecord {
  version: 1;
  ownerMobile: string;
  deviceId: string;
  accessHash: string;
  refreshHash: string;
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
  writeCookie('bizkhata.rt', refresh, Math.floor(REFRESH_TTL_MS / 1000));
  broadcast('login');
}

/** Rotate the access token using the refresh token. Returns false if the refresh session is gone. */
export async function renewSession(): Promise<boolean> {
  const rec = readRecord();
  const refresh = readCookie('bizkhata.rt');
  if (!rec || !refresh) return false;
  if (Date.now() >= rec.refreshExpiresAt) return false;
  if ((await hashToken(refresh)) !== rec.refreshHash) return false;
  if (readRevoked().includes(rec.refreshHash)) return false;

  const now = Date.now();
  const access = newToken();
  const nextRefresh = newToken();
  addRevoked([rec.refreshHash]); // old refresh token is single-use
  const next: SessionRecord = {
    ...rec,
    accessHash: await hashToken(access),
    refreshHash: await hashToken(nextRefresh),
    accessExpiresAt: now + ACCESS_TTL_MS,
    refreshExpiresAt: now + REFRESH_TTL_MS,
    issuedAt: now,
  };
  writeRecord(next);
  writeCookie('bizkhata.at', access, Math.floor(ACCESS_TTL_MS / 1000));
  writeCookie('bizkhata.rt', nextRefresh, Math.floor(REFRESH_TTL_MS / 1000));
  broadcast('renewed');
  return true;
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
  const refresh = readCookie('bizkhata.rt');
  if (!rec || (!access && !refresh)) return { status: 'none' };
  const now = Date.now();
  if (readRevoked().includes(rec.refreshHash) || readRevoked().includes(rec.accessHash)) {
    return { status: 'revoked' };
  }
  if (now >= rec.refreshExpiresAt) return { status: 'expired' };
  if (access && (await hashToken(access)) === rec.accessHash && now < rec.accessExpiresAt) {
    return { status: 'valid' };
  }
  // Access token expired/missing but refresh is alive -> rotate silently.
  if (refresh && (await hashToken(refresh)) === rec.refreshHash) {
    return (await renewSession()) ? { status: 'renewed' } : { status: 'expired' };
  }
  return { status: 'expired' };
}

/** Revoke the session: cookies + record deleted, hashes blocklisted. */
export function revokeSession(): void {
  const rec = readRecord();
  if (rec) addRevoked([rec.accessHash, rec.refreshHash]);
  if (isBrowser()) window.localStorage.removeItem(RECORD_KEY);
  deleteCookie('bizkhata.at');
  deleteCookie('bizkhata.rt');
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
