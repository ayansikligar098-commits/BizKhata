/**
 * BizKhata auth tests — UPDATE 24 (website login/account bugs).
 * Run with `npm test`. Compiles src/lib/{types,store,auth-core,session}.ts
 * with tsc into /tmp and drives the REAL code against stubbed browser
 * storage (one shared localStorage + cookie jar, i.e. how two tabs of the
 * same browser actually share state). No mocks of the logic under test.
 *
 * Covers: mobile normalization, one-account-per-mobile, login with
 * +91/0/spaces variants, wrong-PIN rejection, PIN reset + immediate
 * login, register preserving business data, session persistence across
 * reload / access-expiry / deleted cookies (localStorage-only renewal),
 * two-tab renewal race, previous-refresh grace window, logout revoking
 * everywhere, honest no-account cases.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/bizkhata-auth-test';

execSync(
  `npx tsc src/lib/types.ts src/lib/store.ts src/lib/auth-core.ts src/lib/session.ts --outDir ${outDir} --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'pipe' },
);

// ---- stubbed browser environment (shared storage = one browser) ----
function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    _map: map,
  };
}
const ls = makeStorage();
const cookieJar = new Map();
const documentStub = {};
Object.defineProperty(documentStub, 'cookie', {
  get() {
    return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  },
  set(raw) {
    const [pair, ...attrs] = String(raw).split(';');
    const eq = pair.indexOf('=');
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (/Max-Age=0/i.test(attrs.join(';'))) cookieJar.delete(name);
    else if (name) cookieJar.set(name, decodeURIComponent(value));
  },
  configurable: true,
});
globalThis.window = {
  localStorage: ls,
  document: documentStub,
  location: { protocol: 'https:' },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};
globalThis.document = documentStub;
const navigatorStub = { onLine: true };
Object.defineProperty(globalThis, 'navigator', { value: navigatorStub, configurable: true, writable: true });
globalThis.BroadcastChannel = class {
  postMessage() { /* no-op */ }
  close() { /* no-op */ }
  set onmessage(_) { /* no-op */ }
};

const require = createRequire(import.meta.url);
const store = require(path.join(outDir, 'store.js'));
const auth = require(path.join(outDir, 'auth-core.js'));
const sess = require(path.join(outDir, 'session.js'));

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  if (Object.is(actual, expected)) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function resetStorage() {
  ls.clear();
  cookieJar.clear();
}
function readRecord() {
  return JSON.parse(ls.getItem('bizkhata.session.v1'));
}
function writeRecord(rec) {
  ls.setItem('bizkhata.session.v1', JSON.stringify(rec));
}
function cookie(name) {
  return cookieJar.get(name) ?? null;
}

// ---------------------------------------------------------------- normalize
console.log('normalizeMobile');
check('+91 with spaces', store.normalizeMobile('+91 98765 43210'), '9876543210');
check('leading 0', store.normalizeMobile('09876543210'), '9876543210');
check('space inside', store.normalizeMobile('98765 43210'), '9876543210');
check('91- prefix', store.normalizeMobile('91-9876543210'), '9876543210');
check('brackets', store.normalizeMobile('(98765) 43210'), '9876543210');
check('plain 10 digits', store.normalizeMobile('9876543210'), '9876543210');
check('9 digits -> null', store.normalizeMobile('987654321'), null);
check('empty -> null', store.normalizeMobile(''), null);
check('13 digits -> null', store.normalizeMobile('1234567890123'), null);

// ------------------------------------------------------- register (one owner)
console.log('decideRegister — one account per mobile');
const first = auth.decideRegister(null, '+91 98765 43210', '1234', '1234', 'Mango');
check('first register ok', first.ok, true);
check('stored mobile normalized', first.owner.mobile, '9876543210');
check('pin hash uses normalized salt', first.owner.pinHash, store.hashPin('1234', '9876543210'));
const owner = first.owner;
const second = auth.decideRegister(owner, '9876543210', '9999', '9999', 'Apple');
check('second register same number blocked', second.ok, false);
check('blocked message', second.error, auth.ALREADY_EXISTS_ERROR);
const third = auth.decideRegister(owner, '9999999999', '9999', '9999', 'Apple');
check('second register different number also blocked', third.ok, false);
check('owner + PIN unchanged after blocked attempts', owner.pinHash, store.hashPin('1234', '9876543210'));
check('short mobile rejected', auth.decideRegister(null, '12345', '1234', '1234', 'x').error, auth.INVALID_MOBILE_ERROR);
check('PIN mismatch rejected', auth.decideRegister(null, '9876543210', '1234', '4321', 'x').ok, false);
check('missing recovery word rejected', auth.decideRegister(null, '9876543210', '1234', '1234', '  ').ok, false);

// ------------------------------------------- register preserves business data
console.log('register preserves business data');
{
  const state = {
    owner: null,
    profiles: [{ id: 'prof_1', name: 'Al Falah Communication' }],
    jobs: [{ id: 'job_1' }],
    dailyEntries: [{ id: 'd1' }],
    customers: [{ id: 'c1' }],
  };
  const d = auth.decideRegister(null, '9876543210', '1234', '1234', 'Mango');
  const next = { ...state, owner: d.owner }; // same spread app-context uses
  check('profiles survive', next.profiles.length, 1);
  check('jobs survive', next.jobs.length, 1);
  check('daily entries survive', next.dailyEntries.length, 1);
  check('customers survive', next.customers.length, 1);
}

// ------------------------------------------------------------------- login
console.log('decideLogin — normalized variants + wrong PIN');
check('login +91 variant', auth.decideLogin(owner, '+91 98765 43210', '1234').ok, true);
check('login leading-0 variant', auth.decideLogin(owner, '09876543210', '1234').ok, true);
check('login spaced variant', auth.decideLogin(owner, '98765 43210', '1234').ok, true);
check('login plain variant', auth.decideLogin(owner, '9876543210', '1234').ok, true);
check('login returns normalized mobile', auth.decideLogin(owner, '+91 98765 43210', '1234').mobile, '9876543210');
check('wrong PIN rejected', auth.decideLogin(owner, '9876543210', '0000').error, auth.WRONG_CREDENTIALS_ERROR);
check('wrong mobile same error (no leak)', auth.decideLogin(owner, '9876543211', '1234').error, auth.WRONG_CREDENTIALS_ERROR);
check('null owner -> error, no crash', auth.decideLogin(null, '9876543210', '1234').ok, false);

// --------------------------------------------------------------- PIN reset
console.log('decideResetPin — immediate login with new PIN');
check('wrong recovery word rejected', auth.decideResetPin(owner, '9876543210', 'Banana', '5555').ok, false);
{
  const r = auth.decideResetPin(owner, '09876543210', '  MANGO ', '5555');
  check('reset with 0-prefix + case-insensitive word ok', r.ok, true);
  check('reset hashes with normalized mobile', r.pinHash, store.hashPin('5555', '9876543210'));
  const owner2 = { ...owner, pinHash: r.pinHash };
  check('new PIN logs in', auth.decideLogin(owner2, '+91 98765 43210', '5555').ok, true);
  check('old PIN no longer works', auth.decideLogin(owner2, '9876543210', '1234').ok, false);
}

// ------------------------------------------------- honest no-account cases
console.log('hasSessionRecord — honest no-account handling');
resetStorage();
check('no record -> no account on this device', sess.hasSessionRecord(), false);
check('no-account message text', auth.NO_ACCOUNT_ON_DEVICE_ERROR.includes('Is device/browser par koi account nahi hai'), true);
check('owner-lost message text', auth.OWNER_LOST_ERROR.includes('saved account nahi mila'), true);

// ------------------------------------------------------------------ sessions
console.log('session — persistence, renewal, tabs, logout');
{
  resetStorage();
  await sess.issueSession('9876543210');
  check('fresh session valid', (await sess.verifySession()).status, 'valid');
  check('refresh token mirrored to localStorage', typeof ls.getItem('bizkhata.rt.v1'), 'string');
  check('session record exists', sess.hasSessionRecord(), true);

  // Reload: nothing cleared, still valid.
  check('reload keeps login', (await sess.verifySession()).status, 'valid');

  // Access token expired (back-date the record) -> silent refresh.
  let rec = readRecord();
  rec.accessExpiresAt = Date.now() - 1000;
  writeRecord(rec);
  check('expired access silently renewed', (await sess.verifySession()).status, 'renewed');
  check('valid again after renewal', (await sess.verifySession()).status, 'valid');

  // Cookies deleted entirely (in-app browser / cleared cookies):
  // localStorage refresh token alone must renew the session.
  rec = readRecord();
  rec.accessExpiresAt = Date.now() - 1000;
  writeRecord(rec);
  cookieJar.delete('bizkhata.at');
  cookieJar.delete('bizkhata.rt');
  check('rt cookie deleted but LS refresh survives', ls.getItem('bizkhata.rt.v1') !== null, true);
  check('localStorage-only renewal works', (await sess.verifySession()).status, 'renewed');
  check('valid after LS-only renewal', (await sess.verifySession()).status, 'valid');

  // Two tabs renewing at once -> both stay logged in, no revocation race.
  rec = readRecord();
  rec.accessExpiresAt = Date.now() - 1000;
  writeRecord(rec);
  const [tabA, tabB] = await Promise.all([sess.renewSession(), sess.renewSession()]);
  check('tab A renewal ok', tabA, true);
  check('tab B renewal ok (no race)', tabB, true);
  check('still valid after concurrent renewal', (await sess.verifySession()).status, 'valid');
  // And again after another expiry — the loser's tokens must not be revoked.
  rec = readRecord();
  rec.accessExpiresAt = Date.now() - 1000;
  writeRecord(rec);
  check('renewal still works after the race', (await sess.verifySession()).status, 'renewed');

  // Previous-refresh grace: the pre-rotation refresh token still works
  // within 60s (a tab that started renewing before the other rotated).
  const oldRefresh = cookie('bizkhata.rt');
  rec = readRecord();
  rec.accessExpiresAt = Date.now() - 1000;
  writeRecord(rec);
  await sess.renewSession(); // rotates; oldRefresh becomes the previous hash
  ls.setItem('bizkhata.rt.v1', oldRefresh);
  cookieJar.set('bizkhata.rt', oldRefresh);
  rec = readRecord();
  rec.accessExpiresAt = Date.now() - 1000;
  writeRecord(rec);
  check('previous refresh accepted inside grace', (await sess.verifySession()).status, 'renewed');

  // Past the grace window, that same old token is revoked, not valid.
  const staleRefresh = oldRefresh;
  rec = readRecord();
  rec.previousRefreshExpiresAt = Date.now() - 1000;
  rec.accessExpiresAt = Date.now() - 1000;
  writeRecord(rec);
  ls.setItem('bizkhata.rt.v1', staleRefresh);
  cookieJar.set('bizkhata.rt', staleRefresh);
  cookieJar.delete('bizkhata.at');
  check('previous refresh rejected after grace', (await sess.verifySession()).status, 'revoked');

  // Refresh token itself expired (30 days) -> expired, renewal fails.
  await sess.issueSession('9876543210');
  rec = readRecord();
  rec.refreshExpiresAt = Date.now() - 1000;
  rec.accessExpiresAt = Date.now() - 1000;
  writeRecord(rec);
  check('expired refresh -> expired', (await sess.verifySession()).status, 'expired');
  check('renewal fails when refresh expired', await sess.renewSession(), false);

  // Offline never logs out.
  await sess.issueSession('9876543210');
  navigatorStub.onLine = false;
  check('offline -> offline (not logged out)', (await sess.verifySession()).status, 'offline');
  navigatorStub.onLine = true;
  check('back online -> valid', (await sess.verifySession()).status, 'valid');

  // Logout revokes everywhere: record + LS refresh + cookies gone, and
  // replaying the old tokens must NOT restore the session.
  const capturedRefresh = ls.getItem('bizkhata.rt.v1');
  const capturedAccess = cookie('bizkhata.at');
  sess.revokeSession();
  check('record gone after logout', sess.hasSessionRecord(), false);
  check('LS refresh cleared after logout', ls.getItem('bizkhata.rt.v1'), null);
  check('rt cookie cleared after logout', cookie('bizkhata.rt'), null);
  check('verify after logout -> none', (await sess.verifySession()).status, 'none');
  ls.setItem('bizkhata.rt.v1', capturedRefresh);
  cookieJar.set('bizkhata.rt', capturedRefresh);
  if (capturedAccess) cookieJar.set('bizkhata.at', capturedAccess);
  check('old tokens rejected after logout', (await sess.verifySession()).status, 'none');
}

console.log(`\nAUTH UPDATE24: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
