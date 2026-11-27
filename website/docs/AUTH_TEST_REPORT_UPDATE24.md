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
