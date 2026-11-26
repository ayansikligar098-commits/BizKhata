# BizKhata — Android (native, Kotlin + Jetpack Compose)

**BizKhata** is a complete Business Accounting & Management Platform for
every shopkeeper. CSC / Cyber Cafe is the first category (Al Falah
Communication — CSC Center, ayan's shop); 15 categories are supported at
signup, each with its own ready-made setup. This is the native Android app
— no WebView, no HTML wrapper. The website (React/Next.js + TypeScript,
built in parallel as the BizKhata web app) shares the same data model and
the same accounting rules.

## Status (2026-11-26)

- **Phases A–F scaffold: code complete, not yet compiled in Android Studio.**
  All screens, Room entities/DAOs, repositories, the accounting engine and
  the unit tests are written. It has NOT been built in Android Studio yet,
  so a first compile may surface small errors — fix and re-run the tests.
- **Phase G (testing) is in progress, not passed.** The accounting engine
  unit tests are written; they must be run (`./gradlew testDebugUnitTest`)
  and pass before any release claim.
- **GitHub: BLOCKED, then new email.** Creating the GitHub account failed —
  GitHub says the account linked to the owner's Google identity is
  suspended, so "Continue with Google" signs into the suspended account
  instead of making a new one. No repo was created. Ayan gave a new
  email for GitHub only: **alfalah7797@gmail.com** — a browser task is
  creating the account + repo now; repo URL pending. The code lives in
  the workspace (`~/workspace/al-falah-app/android/`) until then.
- **Scope settled 2026-11-26 19:03 IST: Record B DISCARDED.** The original
  ChatGPT chat (43 messages) was found and read — it is CSC-only. Record
  B's retail+school content was ChatGPT's wrong reconstruction. No
  school modules, no retail inventory/sales/purchase. Full detail in
  `../requirements.md` (Original Chat appendix).
- **Money Transfer fund** (original chat): from ayan's brother, by UPI —
  implemented as `MoneyTransferFundEntity` (Room v2, auto-migrated from
  v1), "Add Fund From Brother" + MT Cash/UPI closing balances in the MT
  screen. Agent margin (received − agent charges) is shown per job;
  receipts have a Duplicate button.

## How to open

1. Android Studio (Hedgehog or newer) → Open → select this `android/`
   folder.
2. Let Gradle sync (Kotlin 2.0.21, Compose 1.7.6, Material 3 1.3.1,
   Room 2.6.1, Navigation Compose, DataStore).
3. Run on an emulator or a real phone (minSdk 24).
4. First run: Language (English / Hindi / Hinglish) → pick your business
   category → Dashboard. Start empty — add real entries.

## Architecture

- `domain/` — pure Kotlin, no Android dependency: `Models` (enums,
  `BusinessCategory` ×15, `JobStatus` ×7), `CategorySetup` (ready-made
  setup per category), `AccountingEngine` (all money rules, paise as
  `Long`, never `Double`), `AiFeatures` (Gemini free-tier only, off
  without a key), `Branding` (single place for the app name: `BizKhata`).
- `data/` — Room (`bizkhata.db`, v1): entities, DAOs, `AppDatabase`,
  `SettingsStore` (DataStore: language, theme, active profile),
  `Repositories` (transactional: receive payment, add expense, internal
  transfer, money transfer, pay agent, soft-delete/restore job).
- `ui/` — one screen per module: Dashboard, Cash Book, UPI Book, Money
  Transfer, Service Jobs (PAN, Aadhaar, Voter ID, Ayushman, Xerox,
  Printing, Smart Card, Document Work), Customer Khata, Agents, Expenses
  + Machine Maintenance, Receipts, Daily Business / Reports, Difference
  Finder, Settings (language, theme, profiles, Recycle Bin, AI, backup).
- `navigation/` — `Routes`, one route per module.

## Accounting rules (non-negotiable, enforced in `AccountingEngine`)

- Cash and UPI are separate accounts.
- Customer outstanding is NEVER counted as received cash
  (bill ₹500 / received ₹200 → due ₹300; only ₹200 is cash).
- Agent payable is a separate ledger from customer receivable.
- Money Transfer profit = commission only (₹10,000 transfer, ₹50
  commission → ₹50 income, never ₹10,000).
- Cash ↔ UPI transfers are internal transfers, not income/expense.
- Billing, received, due, balance and profit are different figures.

## Implemented vs still to do

Implemented (code written, needs a first compile + Phase G run):
- Language (EN/Hindi/Hinglish), theme Light/Dark/System, category pick,
  2–3 business profiles with strict isolation.
- Dashboard with today's income/expenses, net profit, Cash/UPI balance,
  Customer Due, Agent Payable, service-wise income, recent transactions.
- Cash Book / UPI Book with internal transfers; Money Transfer with a
  fully separate ledger and daily closing; service jobs with the 7
  statuses, per-customer hisab, payment recording (never more than due);
  Customer Khata; Agents (Aadhaar/licence work only — PAN is done by the
  owner, never outsourced); Expenses + equipment maintenance with lifetime
  cost; Receipts with unique numbers; Reports with CSV share export;
  Difference Finder (suggests only, never auto-modifies); Settings with
  Recycle Bin + restore; audit logs written on payment/expense/transfer.

Still to do (see `DECISIONS.md` for the full list):
- First compile in Android Studio + fix any errors; run
  `./gradlew testDebugUnitTest` and `./gradlew connectedDebugAndroidTest`.
- PDF receipt export and PDF/Excel report export on Android (CSV share
  works now; full PDF/Excel export is in the web app on the same model).
- Opening balances entry in Settings (balances start at 0 in v1).
- MT Other Expenses as a separate MT-ledger list (Tea/Food, Transport,
  Staff, Shop, Misc — original chat turn 18). Per-transfer charges are
  recorded; a dedicated MT expense list is remaining work.
- Custom Module & Category Builder UI (original chat: compulsory) — the
  category setups exist (`domain/CategorySetup.kt`) and the owner can
  add/customise services; the in-app builder screen for adding a service
  / income category / expense category / custom fields and enabling or
  disabling modules is remaining work.
- Gujarati language (mentioned once in the original chat) — possible
  later addition, not in v1; English/Hindi/Hinglish are implemented.
- Document upload per customer (file storage) — the web app has it;
  Android file picker wiring is remaining.
- Auth: Google Sign-In + mobile login (v2 spec §A) — the scaffold runs
  single-owner local-first for now; add auth before multi-device sync.
- Gemini AI key entry in Settings (AI is off without a key; the app
  works fully without it — free tier only, never a paid key).

## Cost

Free only. Kotlin/Compose/Room are free; local-first storage; no paid
hosting, no paid API, no paid service anywhere. WhatsApp reminders are
manual via share link. The Gemini API is free tier only, with graceful
fallback when no key is set.

## Decisions

See `DECISIONS.md` in `~/workspace/al-falah-app/` — every default chosen
for the pending Section 28 items, so the owner can change any of them.
