# BizKhata — Android (native, Kotlin + Jetpack Compose)

**BizKhata** is a complete Business Accounting & Management Platform for
every shopkeeper. CSC / Cyber Cafe is the first category (Al Falah
Communication — CSC Center, ayan's shop); 15 categories are supported at
signup, each with its own ready-made setup. This is the native Android app
— no WebView, no HTML wrapper. The website (React/Next.js + TypeScript,
built in parallel as the BizKhata web app) shares the same data model and
the same accounting rules.

## Status (2026-11-26)

- **UI REBUILD (2026-11-26): native Android UI rebuilt to match the
  12-screen reference (navy + purple, reference file
  `workspace/user/files/44420_4_1a7l.png`).** Dashboard (period pills,
  Income/Expenses/Profit, Cash/UPI/Due/Payable, service-wise donut),
  drawer navigation, Cash/UPI Book (filters, opening/closing, running
  balance, + entry FAB), Money Transfer (Overview/Transactions/Settlement
  tabs, gradient summary, daily closing), Services grid, per-service job
  pages (filter pills with real counts, search, status pill, Amount/Paid/
  Due, status change, agent assignment — PAN never assignable), Customer
  Khata list + Customer Profile (Ledger/Jobs/Documents tabs), Agent
  Management + Agent Profile (per-agent ledger), Expenses (category chips,
  month, search), Machine Maintenance (own screen), Reports (Business/
  Service-wise/Customer tabs, 7-day bar chart, CSV share), Difference
  Finder (Cash/UPI/MT/Service tabs, reconciliation card, possible-cause
  suggestions), Receipt Generator (A4/thermal preview, signature),
  Audit Log, Recycle Bin, Customization Studio, Settings (list rows),
  mobile + 4-digit PIN auth (SHA-256 hash only), language picker,
  business setup — all in the same navy/purple language, Light/Dark/
  System themes, Canvas charts (no chart dependency), responsive layouts.
- **CHATBOT (2026-11-26): native Android AI Assistant is in.** Home: a
  purple floating chat button (chat icon) fixed bottom-right on the
  Dashboard + a "Chatbot / AI Assistant" drawer entry, route
  `Routes.CHATBOT` (`ui/chatbot/ChatbotScreen` + `ChatbotViewModel`).
  It answers in Hinglish/English/Hindi about the owner's REAL saved
  Room data — today's profit/income/expense, Cash/UPI balance, who owes
  money (customer due), agent payables, Money Transfer commission
  (principal is never profit) and fund from the brother. Built-in
  responder (`domain/Chatbot.kt`) always works with no key; when the
  owner adds his own free Gemini key in Settings ("AI Assistant
  (Gemini)"), `domain/GeminiChatbotClient` (free tier only, model
  `gemini-2.0-flash`, plain HttpURLConnection, no new dependency)
  summarises the same real figures — and if Gemini fails it falls back
  to the built-in answer and says so. No key is ever embedded or
  shipped; no number is ever invented; empty data gets a plain "Abhi
  koi record nahi hai". The Reports AI Insight stays in Reports.
  **Still NOT compiled: this VM has no JDK.** First compile + unit tests
  must happen in Android Studio (`./gradlew testDebugUnitTest`).
- **JVM-free verification done (2026-11-26):** `docs/verify-android.py`
  passes — brace/paren balance on all 40 Kotlin files, every project
  import resolves to a defined symbol, every `Routes.*` reference exists,
  every screen the NavHost uses is defined, no demo numbers/names in
  code, no WebView, no Double money maths; the 8 AccountingEngine test
  cases pass in a Python mirror. The test file was fixed where it called
  APIs the engine never had (`isInternalTransfer`, 2-arg `serviceProfit`)
  — the engine is authoritative, the test now uses `internalTransfer`
  (delta pair) and the 3-arg `serviceProfit`.
- **Phase G (testing) is in progress, not passed.** The accounting engine
  unit tests are written; they must be run (`./gradlew testDebugUnitTest`)
  and pass before any release claim.
- **GitHub: live.** Repo https://github.com/ayansikligar098-commits/BizKhata
  (owner ayansikligar098-commits, ayansikligar098@gmail.com). Android code
  is pushed via the `custom.github` helper (`push-android`); the website
  is pushed separately by another agent (`push-website`).
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
3. Run on an emulator or a real phone (minSdk 26).
4. First run: Language (English / Hindi / Hinglish) → pick your business
   category → mobile + 4-digit PIN → Dashboard. Start empty — add real entries.

## Architecture

- `domain/` — pure Kotlin, no Android dependency: `Models` (enums,
  `BusinessCategory` ×15, `JobStatus` ×7), `CategorySetup` (ready-made
  setup per category), `AccountingEngine` (all money rules, paise as
  `Long`, never `Double`), `AiFeatures` (Gemini free-tier only, off
  without a key), `Chatbot` (business snapshot + built-in responder —
  every figure from the real ledgers, paise as `Long`),
  `GeminiChatbotClient` (free-tier Gemini summary of those same facts),
  `Branding` (single place for the app name: `BizKhata`).
- `data/` — Room (`bizkhata.db`, v2): entities, DAOs, `AppDatabase`,
  `SettingsStore` (DataStore: language, theme, active profile, PIN hash,
  disabled modules), `Repositories` (transactional: receive payment, add
  expense, internal transfer, money transfer, pay agent, soft-delete/
  restore job, agent assignment with the PAN guard, job status changes,
  direct Cash/UPI book entries).
- `ui/` — one screen per module, navy + purple design (see Status):
  Dashboard (period pills + donut), drawer + bottom nav shell, Cash Book,
  UPI Book, Money Transfer (3 tabs + daily closing), Services grid,
  Service Jobs (PAN, Aadhaar, Voter ID, Ayushman, Xerox, Printing, Smart
  Card, Document Work), Customer Khata + Customer Profile, Agents + Agent
  Profile, Expenses + Machine Maintenance, Receipt Generator, Reports
  (bar chart), Difference Finder, Audit Log, Recycle Bin, Customization
  Studio, Settings, Auth (mobile + PIN), Language, Category Pick,
  Chatbot / AI Assistant (message bubbles, suggestion chips, loading +
  Gemini-failure fallback states, key entry in Settings).
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
- Gemini key storage hardening: the owner's free key currently lives in
  app-private DataStore (never in code/git, removable in Settings);
  move it to EncryptedSharedPreferences / server-side when the backend
  is built, so it never sits in plain preferences.

## Cost

Free only. Kotlin/Compose/Room are free; local-first storage; no paid
hosting, no paid API, no paid service anywhere. WhatsApp reminders are
manual via share link. The Gemini API is free tier only, with graceful
fallback when no key is set.

## Decisions

See `DECISIONS.md` in `~/workspace/al-falah-app/` — every default chosen
for the pending Section 28 items, so the owner can change any of them.
