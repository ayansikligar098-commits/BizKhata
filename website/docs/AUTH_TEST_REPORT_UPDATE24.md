# BizKhata Website — Auth Test Report UPDATE 24

**Date:** 2026-11-27 (IST)
**Scope:** Website login/account bugs reported 2026-11-27 16:07–16:08 IST — "Login Save Nahi Rehta, Ek Number Se Kai Account Bana Rahe Hai" + "Kal Account Banaya Tha, Aaj No Account Found Bata Rha Hai".
**Method:** New suite `tests/auth-update24.test.mjs` compiles the REAL `src/lib/{types,store,auth-core,session}.ts` with tsc into /tmp and drives them against stubbed browser storage (one shared localStorage + cookie jar = how two tabs of the same browser share state). No mocks of the logic under test. Full `npm test`, `npx tsc --noEmit`, `npm run build` all run for real.

## What was fixed

| Bug | Fix | Files |
|---|---|---|
| 1. One number → many accounts | `registerAccount` now blocked when an owner already exists; returns "Is number par account pehle se hai — login karo ya Forgot PIN use karo." Never overwrites owner/PIN. Decisions moved to pure, tested `src/lib/auth-core.ts` (`decideRegister`/`decideLogin`/`decideResetPin`), called by `app-context.tsx`. | `src/lib/auth-core.ts` (new), `src/lib/app-context.tsx` |
| 2. "No account found" next day | Honest split via `hasSessionRecord()` (session.ts): no session record at all → "Is device/browser par koi account nahi hai — pehle Create Account karo. Account sirf usi browser/app mein rehta hai jisme banaya tha."; record exists but owner gone → recovery wording (restore from backup / register). Never auto-creates or overwrites. | `src/lib/session.ts`, `src/lib/app-context.tsx` |
| 3. Login does not persist | Refresh token now mirrored to localStorage (`bizkhata.rt.v1`), read FIRST with cookie fallback; written on issue/renew, cleared on logout. Silent verification restores the session on reload / new tab / 15+ min idle (access expired). | `src/lib/session.ts` |
| 3b. Two tabs logging each other out | Single-use revocation kept, but rotation now stores the previous refresh hash with a 60s grace window (`previousRefreshHash` + `previousRefreshExpiresAt`), plus a localStorage single-flight renewal lock — a tab that finds the lock held waits ~2s and re-reads shared storage instead of failing. | `src/lib/session.ts` |
| 4. No mobile normalization | Shared `normalizeMobile()` in `store.ts`: strips spaces/dashes/brackets, strips leading +91/91/0 (last 10 digits), null unless exactly 10 digits. Applied BEFORE every compare and hash (hashPin salts with the mobile) at register/login/reset. | `src/lib/store.ts`, `src/lib/auth-core.ts` |
| 6. Business data on (re-)registration | `...prev` spread preserved; covered by test (profiles/jobs/daily entries/customers survive). | `src/lib/app-context.tsx` |
| 7. Forgot PIN | Recovery word check unchanged (case-insensitive, trimmed). After a successful reset the user is now logged in immediately with the new PIN (session issued + `authed`), and the login page navigates to the dashboard instead of showing an alert and leaving him at login. | `src/lib/app-context.tsx`, `src/app/(auth)/login/page.tsx` |
| 8. Login page | One-line note: the website and the in-app web app keep SEPARATE accounts (an account lives only in the browser/app where it was created). When registration is blocked as "already exists", a button switches to login mode. | `src/app/(auth)/login/page.tsx` |

Also updated: the architecture comment at the top of `session.ts` now states honestly that on this static local-first deployment the refresh token only guards local data (no server exists), so localStorage storage is the accepted trade-off that makes login survive cookie loss; server-side sessions (Pages Functions + KV/D1) remain the documented next step.

Chat files NOT touched (chatbot.ts, conversation.ts, conversation-ai.ts, assistant.ts, components/chatbot.tsx) — owned by the UPDATE 23 coordinator.

## Results — AUTH UPDATE24 suite: 63 passed, 0 failed

| Case group | Cases | Result |
|---|---|---|
| `normalizeMobile` (+91 / 0 / spaces / 91- / brackets / plain; 9-digit, empty, 13-digit → null) | 10 | 10 PASS |
| Register: first ok + normalized mobile + hash uses normalized salt; 2nd same number blocked with "already exists"; 2nd different number also blocked; owner+PIN unchanged; short mobile / PIN mismatch / missing recovery word rejected | 10 | 10 PASS |
| Register preserves business data (profiles, jobs, daily entries, customers survive the `{...prev, owner}` spread) | 4 | 4 PASS |
| Login: "+91 98765 43210", "09876543210", "98765 43210", plain — all find the same account, return normalized mobile; wrong PIN and wrong mobile both give the same "Wrong mobile or PIN" (no leak); null owner → error, no crash | 8 | 8 PASS |
| PIN reset: wrong recovery word rejected; reset with 0-prefix + case-insensitive word ok, hash uses normalized mobile; new PIN logs in, old PIN stops working | 5 | 5 PASS |
| Honest no-account: `hasSessionRecord()` false with empty storage; both message wordings present | 3 | 3 PASS |
| Session persistence: fresh valid; reload keeps login; back-dated access expiry → silent renew; cookies (at + rt) DELETED → localStorage-only renewal works; valid after renewal | 8 | 8 PASS |
| Two tabs renewing at once (`Promise.all`) → both true, still valid, renewal still works afterwards (no revocation race) | 4 | 4 PASS |
| Previous-refresh grace: pre-rotation refresh token accepted inside 60s; same token rejected ("revoked") after grace expiry | 2 | 2 PASS |
| Refresh expired (30d) → "expired", renewal fails; offline → "offline" (never logged out), back online → valid | 4 | 4 PASS |
| Logout: record + LS refresh + cookie cleared; verify → none; replaying captured old tokens → none (rejected everywhere) | 5 | 5 PASS |

## Full verification (2026-11-27)

- `npm test` — **exit 0, 869 PASS lines, 0 FAIL**. Suites: accounting 52/52, assistant 100/100, AI accuracy 168/168, UPDATE 20 acceptance 202/202, multi-turn 38/38, streaming 68/68, UPDATE 23 acceptance 12/12, **AUTH UPDATE24 63/63**.
- `npx tsc --noEmit` — **clean, exit 0**.
- `npm run build` — **passes, exit 0** (static export, all routes prerendered).

## Remaining limitations (honest)

- **Static export, no server:** sessions are local-only. The refresh token in localStorage guards data on this device only; there is still no server-side session, no HttpOnly cookie, and no cross-device account — an account created in one browser/app genuinely does not exist in another. Server-side sessions (Pages Functions + KV/D1) remain the documented next step and need Cloudflare dashboard bindings this agent cannot create.
- **Corrupt store:** if `bizkhata.v1` itself is cleared/corrupt, the owner is gone for good on that device — only a backup restore can bring it back. The app now says so instead of a bare "No account found".
- **Live-device proof:** reload / cookie-loss / two-tab behaviour was proven in the stubbed-browser suite above, not on ayan's phone. The coordinator's live verification (login on the real site, reload, 15+ min idle, second tab) is still the final proof.
- **"Is number par account pehle se hai"** blocks re-registration on the same browser even for a genuinely different number — by design (single-owner local-first app, one account per device/browser).

## Independent live verification (2026-11-27, ~16:25–17:05 IST — verifier, not the fix worker)

Re-ran everything from scratch; nothing below is taken from the workers' claims.

### 1. Remote HEAD

- `git ls-remote https://github.com/ayansikligar098-commits/BizKhata.git HEAD` → **`d86e6f743eea1a0a033ede87fcd524de9f6d10ea`**, exactly the claimed website HEAD. `main` points at the same commit; no newer commit had landed at check time. The website push also carries UPDATE 23's files (parent `fc3a76b0`).

### 2. Live website — https://bizkhata.pages.dev

- `/login` → 308 to `/login/`, then **HTTP 200** (checked ~16:25 IST; response `Date: Fri, 27 Nov 2026 10:55:57 GMT`).
- Live buildId in the served HTML: `oMZhIFjvc1lqtgrcQkIhS`. Note: this differs from a fresh local `npm run build` (buildId `FezfKfEHvbPLxVKUqAcfn`), and the live login chunk is `page-bf9afd4ab6f6dae3.js` while the local build produces `page-fbb36ff78261f360.js`. Chunk hashes differ between builds, so this alone proves nothing either way — the evidence that the live deploy carries UPDATE 24 is the fix strings in the live chunks plus the live drive below.
- Fix strings confirmed present in the **live** JS chunks (downloaded from the live site, 2026-11-27):
  - `bizkhata.rt.v1` in live chunk `2824-2317cf6e5c5931a1.js` (refresh-token localStorage mirror).
  - `Is number par account pehle se hai — login karo ya Forgot PIN use karo.` in live chunk `2824-2317cf6e5c5931a1.js`.
  - Separate-accounts note in the live login chunk `page-bf9afd4ab6f6dae3.js`: "Note: your account lives only in the browser/app where you created it — the website and the in-app web app keep separate accounts." — and the switch-to-login button "Account already hai — Log in par jao" (shown when the error contains "pehle se hai").
  - `normalizeMobile` does **not** appear literally in the live chunks — expected: minification mangles the function name. Normalization was proven behaviourally instead (step (c) below: "+91 …" logs into the plain-digits account).
- `POST /api/ai-chat` sanity check → **HTTP 200**.

### 3. Playwright drive on the LIVE site — 14/14 PASS (the critical proof)

Drove `https://bizkhata.pages.dev` in headless Chromium (Playwright-core 1.49.1, cached Chromium 1148) in a **fresh throwaway browser profile** — nothing touched ayan's real account or data. Test number used: **`9876543210` (PIN 1234, recovery word "mango")** — a test number, NOT ayan's real number (his real number is not recorded anywhere accessible to this verifier, so the "exact owner phone" test could not be run against his real number; the +91-variant test below proves normalization for any number in that format). After registration the app asks for business setup; the drive created a test business ("Test Shop", same test mobile) and skipped the language screen, as a new user would.

| Step | Result | What was actually observed |
|---|---|---|
| (a0) Login screen shows separate-accounts note | **PASS** | Note visible on the live login screen before any account existed |
| (a) Register fresh account | **PASS** | Register → landed on `…/dashboard/`, `bizkhata.v1` has owner, `bizkhata.rt.v1` present |
| (a) Business setup | **PASS** | "Set up your business" → Create Business → owner menu present on dashboard |
| (a) Reload → still logged in | **PASS** | After reload, still on `…/dashboard/`, no login screen |
| Logout via UI | **PASS** | Owner menu → Logout → `…/login/?next=%2Fdashboard%2F`. (Note: Logout lives in the owner menu / drawer; there is no logout button on the bare dashboard before a business exists — the first drive attempt failed here until the business-setup step was added.) |
| (b) Re-register SAME number | **PASS** | Blocked with exactly "Is number par account pehle se hai — login karo ya Forgot PIN use karo."; stayed on login page; "Account already hai — Log in par jao" button shown |
| (b) Owner + PIN unchanged | **PASS** | Login with the new PIN 9999 rejected ("Wrong mobile or PIN. Try again, or use Forgot PIN."); login with original PIN 1234 succeeded → dashboard |
| (c) Login with "+91 …" variant | **PASS** | After logout, login with `+91 98765 43210` + PIN 1234 → dashboard |
| (d) Access cookie deleted → silent renewal | **PASS** | Deleted `bizkhata.at` cookie, reloaded → still on dashboard; a fresh `bizkhata.at` cookie was re-issued |
| (d) BOTH cookies deleted → localStorage-only renewal | **PASS** | Deleted `bizkhata.at` + `bizkhata.rt`, reloaded → still on dashboard (`bizkhata.rt.v1` in localStorage restored the session) |
| (e) Second tab, same session | **PASS** | Second tab opened `…/dashboard` directly, logged in, owner present; first tab reloaded afterwards, still logged in — no logout race |

Drive script: `/tmp/pw-drive/drive.mjs` (ephemeral; per-step JSON in `/tmp/pw-drive/results.json`). Two environment hurdles, both solved during this verification and worth knowing for future drives: (1) Chromium cannot use the VM egress proxy directly — it drops unauthenticated CONNECTs (`ERR_TUNNEL_CONNECTION_FAILED`); the drive must go through the local CONNECT forwarder on `127.0.0.1:18080` (`~/workspace/bizkhata-drive/proxy-forwarder.mjs`, started for this drive, stopped afterwards). (2) The egress proxy MITMs TLS, so the Playwright context needs `ignoreHTTPSErrors: true` (same as the existing `drive-update23.mjs` / `smoke23b.mjs` drives). No test data leaked: the test account lived only in the throwaway profile, which was discarded with the browser.

### 4. Website checks re-run by the verifier (fresh, exit codes real)

Run 2026-11-27 ~16:55–17:00 IST in `~/workspace/al-falah-app/website`:

- `npm test` — **exit 0, 869 PASS lines, 0 FAIL lines** (suites incl. accounting 52/52, assistant 100/100, AUTH UPDATE24 **63/63**). Matches the worker's claim; the two failed exec records in the worker's handoff (SIGTERM / unknown-status) did not reproduce.
- `npx tsc --noEmit` — **exit 0, clean**.
- `npm run build` — **exit 0** (static export, all routes prerendered).

### 5. Artifact v19 — live check NOT VERIFIED by this verifier

- The artifact namespace available to this subagent exposes only `restore` / `share` / `unshare` — there is **no status/read function**, so the published artifact version and its live login screen could not be checked from here. The parent's claim "v19 published and live" is therefore **unconfirmed by this verification**; it needs a parent-side artifact status check.
- What WAS verified (source level, `~/workspace/ts-spaces/al-falah-business-app/`): `normalizeMobile()` exists in `server/src/actions.ts` (line 402) and is applied in register/login/resetPin; the block message "Is number par account pehle se hai — login karo ya Forgot PIN use karo" is in `actions.ts:2136`; the separate-storage note is in `client/src/App.tsx:887` ("Account sirf usi app mein rehta hai jisme banaya tha — website par banaya account is app mein nahi dikhega."); the "New Account" tab is hidden when `state.hasAccount` (`App.tsx:859-864`). The artifact worker's own report (`~/workspace/al-falah-app/UPDATE24-artifact-report.md`) says the fix was **NOT YET PUBLISHED** at the time that report was written and that publishing was handed to the parent — so v19's live state hinges entirely on whether the parent published it after that report.
- The artifact worker's 30/30 auth harness and clean typecheck were **not** re-run by this verifier (harness needs `bun` + the ts-space server; out of scope for this website-focused verification — flagging, not claiming).

### 6. Android — HEAD claim NOT VERIFIED

- Claimed HEAD `ba68504` **does not exist** in the local clone (`~/workspace/al-falah-app/android/.git`, stale `master` branch, HEAD `6d14dfb`) and is **not on the GitHub remote** (`git ls-remote` shows only `main` → `d86e6f74`). The Android UPDATE 24 files exist locally only as **uncommitted changes** in that stale clone (`AuthUtils.kt` with `normalizeMobile` at line 27, `AuthUtilsTest.kt` 73 lines, `AuthScreen.kt`, `SettingsStore.kt`). Nothing confirms `ba68504` was ever pushed; the Android work's commit/push state needs the parent (or the Android worker) to confirm. Android code was not compiled here (no JDK), as before.

### Remaining limitations (updated)

- **Live-device proof:** the 14/14 drive ran in a throwaway desktop-Chromium profile on this VM, not on ayan's phone. The in-app-browser cookie behaviour and the 15+ min idle renewal on his actual device are still only proven by the stubbed suite + this drive, not by his phone.
- **Access-token expiry was simulated** by deleting the `bizkhata.at` cookie, not by waiting 15 real minutes. The renewal code path is the same, but a real 15-minute idle test on the phone is still the truest check.
- **Artifact v19 live state unconfirmed** (see §5) and **Android commit `ba68504` unconfirmed / apparently unpushed** (see §6).
- **Report file itself uncommitted:** this appendix was appended to `website/docs/AUTH_TEST_REPORT_UPDATE24.md` in the workspace only — **nothing was pushed** (verification only, per instructions). Committing it is for the parent to decide.

