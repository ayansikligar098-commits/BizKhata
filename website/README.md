# BizKhata — Website

Business Accounting & Management Platform for Al Falah Communication (CSC Center first),
for all businesses. This is the **website side** of BizKhata: a real Next.js + TypeScript
app that builds to plain static files — no server, no paid backend, free hosting on
Cloudflare Pages.

> The Android app (Kotlin / Jetpack Compose) lives in `../android/`. Both share the
> same data model and accounting rules.

## What it does

- **Starts completely empty** — no demo numbers, ever.
- **28 dedicated pages, each with its own real URL** (Next.js App Router —
  see [URL routing](#url-routing) below): Dashboard, Daily Dhandha, Cash Book,
  UPI Book, Money Transfer, PAN Card, Aadhaar Services, Voter ID, Ayushman
  Card, Xerox, Printing, Smart Card, Document Work, Customers, Customer
  Profile, Customer Khata, Agent Management, Agent Profile, Agent Payments,
  Expenses, Machine Maintenance, Receipt Generator, Reports, Difference
  Finder, Recycle Bin, Audit Log, Customization Studio, Settings — plus the
  **AI Assistant** chat page (`/chatbot`). Every page has its own header,
  summary cards, search and filters, professional tables, Add/Edit/View/Delete
  actions, working forms and dialogs, and pagination — all wired to real saved
  data. Browser Back/Forward, Refresh, deep links and bookmarks all work;
  refreshing `/cash-book` reopens Cash Book.
- **AI Assistant / chatbot** (`/chatbot`, sidebar "Chatbot / AI Assistant",
  and a purple floating chat button on every screen): ask in Hinglish,
  English or Hindi about today's profit, who owes money, agent payables,
  Money Transfer commission, or cash/UPI balance. Every figure comes from
  the real ledgers (integer paise) — nothing is invented, and with no data
  it says so plainly. The assistant is built in and works entirely on your
  device: no key, no third-party AI provider, nothing sent anywhere. It can
  also add daily entries, expenses, payments and transfers through chat —
  always showing a preview first and saving only after you confirm.
- **Design**: premium dark navy sidebar with expandable Services/Reports
  groups, modern top nav (business profile switcher, global search across
  customers/jobs/receipts, notification bell, owner menu), purple primary
  actions, white cards, pastel summary cards, pure-SVG line/donut/bar charts
  (no chart dependencies). Responsive: sidebar becomes a slide-in drawer with
  a bottom nav on tablet/mobile.
- **Mobile + PIN registration / login** with forgot-PIN recovery (recovery word).
- **Language screen after login**: English (default), Hindi, Hinglish — changeable in Settings.
- **15 business categories** at signup, each with ready-made services. CSC Center is
  fully built first for Al Falah Communication. Up to **3 separate business profiles**
  per account, with a switcher — data is never mixed between profiles.
- **Dashboard**: net profit, Cash/UPI balances, customer due and agent payable (always
  separate), service-wise income, Cash vs UPI, pending payments, AI Business Insights.
- **Cash Book / UPI Book**: separate books; Cash↔UPI is an internal transfer, never income.
- **Money Transfer**: fully separate ledger. Fund from brother (by UPI), transfers,
  commission-only profit, MT other expenses (Tea/Food, Transport, Staff, Shop, Misc),
  daily closing (Starting + Received − Sent − Expenses, Cash and UPI separately).
  Money Transfer is a top-level module, **not** a job service: it never appears
  in the Services list, the add-job service picker, or the Difference Finder
  service picker (older profiles that saved it as a service have it filtered
  out everywhere; `/services/money-transfer` redirects to `/money-transfer`).
- **Services / Jobs**: per-service jobs with status (New → Delivered), fees, received,
  due, per-job margin. **PAN work can never be assigned to an agent** — enforced in the UI.
- **Customers & Customer Khata**: per-customer pages, document uploads, WhatsApp
  reminders (manual share link), per-customer ledger.
- **Agents**: per-agent ledger, agent payments, payable separate from customer due.
- **Expenses & Machine Maintenance**: expenses linked to a service for accurate profit;
  per-machine lifetime cost (purchase + maintenance).
- **Receipts**: unique numbers BK-0001…, A4 + thermal layouts, PDF/Print, WhatsApp share,
  duplicate, signature section, Paid vs Due clearly shown.
- **Daily Business** (`/daily-business`): the central hub for the day's small work —
  Today's Total Collection, Cash Collection, UPI Collection, Expenses, Net Earnings,
  Customer Due (shown separately, never counted as collection), Service-wise Collection
  and Recent Entries, filterable by period (Today/Week/Month/Year/Custom), date and
  service. A fast **+ Quick Entry** form (date/time, service, description, quantity,
  rate, auto total, Cash/UPI/Other, direct expense, notes) saves small sales without
  opening a full job. Job payments, Money Transfer commission (never the principal)
  and expenses appear here automatically — one real transaction is counted exactly
  once (a quick entry writes one Cash/UPI entry; a job payment is its Cash/UPI entry;
  an expense writes one expense + one Cash/UPI entry). Passport Size Photo and
  Scanning are first-class services alongside PAN, Aadhaar, Voter ID, Ayushman, Xerox,
  Printing, Smart Card and Document Work.
- **Reports**: PDF/Print + CSV export, service-wise profit, Cash vs UPI, dues, payables,
  plus a combined **Daily Business Report** (`/reports/daily-business`) — daily, weekly,
  monthly, yearly and all-time collection, expenses, earnings and service-wise totals.
- **Difference Finder**: expected vs recorded balance, with suggestions only — it never
  changes entries. Separate finders for General / Cash / UPI / Money Transfer / Service.
- **Recycle Bin + Audit Log**: soft delete with restore; every change logged old → new.
- **Customization Studio**: add services/expense categories, rename or remove your own
  services (rename updates jobs, daily entries, expenses and receipts; a service in use
  cannot be removed), enable/disable modules, show/hide dashboard cards, restore
  defaults — per profile.
- **AI Business Insights** (Dashboard): short practical insights computed on your device
  from your real figures — top service, biggest due, agent payable, Money Transfer
  commission, expense trend. No key, no third-party provider, nothing sent anywhere.

## Accounting rules (verified by tests)

All money is integer **paise** — never float. See `tests/accounting.test.mjs`
(run `npm test`, 26 checks):

1. Bill ₹500 / received ₹200 → due ₹300; only ₹200 counts as cash/UPI.
2. Money Transfer ₹10,000 with ₹50 commission → profit is ₹50 only.
3. Cash→UPI ₹1,000 internal transfer → ₹0 income, ₹0 expense.
4. Customer receivable and agent payable are separate ledgers.
5. Daily Business: one real transaction is counted exactly once — a job's received
   money is its Cash/UPI entry (never job + entry), a quick entry writes exactly one
   Cash/UPI entry, an expense writes one expense + one Cash/UPI entry. Money Transfer
   principal is never income (only commission); 'Other' (credit) entries are due,
   never collection; internal transfers count 0. See `tests/accounting.test.mjs`
   (52 checks).

## URL routing

Every feature has its own proper URL (App Router, static export). The address
bar always reflects the open page:

`/dashboard`, `/daily-business`, `/cash-book`, `/upi-book`,
`/money-transfer`, `/services`, `/services/pan-card`, `/services/aadhaar`,
`/services/voter-id`, `/services/ayushman`, `/services/xerox`,
`/services/printing`, `/services/smart-card`, `/services/document-work`,
`/customers`, `/customers/[id]`, `/customer-khata`, `/agents`, `/agents/[id]`,
`/agent-payments`, `/expenses`, `/machine-maintenance`, `/receipts`,
`/receipt-generator`, `/reports`, `/reports/income`, `/reports/expenses`,
`/reports/profit`, `/reports/service-wise`, `/difference-finder`,
`/recycle-bin`, `/audit-log`, `/customization`, `/chatbot`, `/settings`,
`/settings/profile`, `/settings/business`, `/settings/language`,
`/settings/receipt`, `/settings/security`. Unknown routes show a professional
404 page (`src/app/not-found.tsx`). Switching business profiles keeps the
current feature open and loads that business's data.

How deep links work on the static export: every fixed route is its own HTML
file in `out/`, so direct loads and refresh work natively — no SPA fallback.
Customer and agent ids are created by the user at runtime, so no static HTML
can exist for them: `public/_redirects` rewrites `/customers/*` and
`/agents/*` to the list page's HTML (200, URL unchanged), and the list pages
are pathname-aware — they render that customer's / agent's profile when the
URL carries an id. One honest consequence: a click on a customer/agent
profile does a full page load instead of a client-side transition (no
prerendered RSC payload can exist for a user-created id); the profile still
renders correctly, as verified in the browser drive.

## Persistent login (sessions)

Opening the site shows a branded BizKhata loading screen while the saved
session is verified — the login page is never flashed to an authenticated
user. Valid session → Dashboard (or the last page / originally requested
page); renewable session → silently renewed in the background; no session →
Login. Refresh, close/reopen and new tabs all restore the session, the
active business profile, language, theme and last page. Logout revokes the
session (cookies + record deleted, token hashes blocklisted) and logs out all
tabs (BroadcastChannel + storage events). All private routes are gated behind
session validation; a private URL without login redirects to
`/login?next=<page>` and returns there after login. Network failure during
verification shows a retry screen — it is never treated as a logout.

Implementation (`src/lib/session.ts`): opaque 256-bit random tokens, access
15 min + refresh 30 days, rotation on use (old refresh is single-use),
revocation list. Raw tokens live only in cookies (`Path=/`, `SameSite=Lax`,
`Secure` on HTTPS); localStorage holds only SHA-256 hashes + metadata —
never the PIN, never a boolean `loggedIn` flag.

**Honest gap:** cookies set from JavaScript cannot be `HttpOnly`, and there
is no server in this deployment to validate sessions. A full server-side
session layer (Cloudflare Pages Functions + KV/D1 session store + a
dashboard-configured signing secret) is the documented next step — it needs
Cloudflare dashboard bindings that cannot be created from here, so it is
NOT faked. The current layer is the closest secure equivalent that actually
works on the free static tier.

## Local development

```bash
cd website
npm install
npm run dev        # http://localhost:3000
npm test           # accounting rule tests
npm run build      # production static export -> out/
```

## Deploy — free, on Cloudflare Pages

The site is a static export (`output: 'export'`), so Cloudflare Pages serves it
for free on a `.pages.dev` address. Two ways:

### Option A — connect the GitHub repo (recommended, auto-deploys on push)

1. Log in to [Cloudflare](https://dash.cloudflare.com) (free account — the owner
   creates this; no account is created for him here).
2. Workers & Pages → **Create** → **Pages** → **Connect to Git**.
3. Select the repo `ayansikligar098-commits/BizKhata`.
4. Project settings:
   - **Framework preset:** Next.js (Static HTML Export)
   - **Build command:** `cd website && npm install && npm run build`
   - **Build output directory:** `website/out`
   - **Root directory:** leave empty (the build command handles the subfolder)
5. **Save and Deploy.** The site goes live at `https://bizkhata.pages.dev`
   (Cloudflare assigns the exact subdomain; it can be renamed in the project).

### Option B — one-off deploy with Wrangler

```bash
npm install -g wrangler        # free CLI
cd website && npm run build
npx wrangler pages deploy out --project-name bizkhata
```

Every push to the GitHub repo re-deploys automatically with Option A.

## Streaming architecture

The AI Assistant has two reply paths, and they are not the same thing:

- **Configured service → genuine backend streaming.** When the owner
  adds an AI service address + key in Settings → AI Chat, chat calls the
  Cloudflare Pages Function `POST /api/ai-chat` (repo-root
  `functions/api/ai-chat.ts`, free tier — it MUST live at the repo root,
  because the Pages project builds from the repo root; when it sat at
  `website/functions/` it never deployed and live POSTs returned 405),
  which forwards the request to the owner's own configured
  endpoint asking for a streaming response and relays the SSE stream to
  the browser (`src/lib/streaming.ts` parses it). The key and endpoint
  are never stored server-side and never logged. The reply appears
  word by word as it arrives, with a three-dot "BizKhata AI is
  thinking..." indicator until the first word, a blinking cursor while
  typing, and working Stop / Regenerate / Copy / Retry controls.
- **No service configured → on-device engine + typewriter display.**
  The built-in engine (`src/lib/conversation.ts`, `general.ts`,
  `intent.ts`) generates the whole reply on the device, and the
  typewriter (`src/lib/streaming.ts`, ~11 words/sec) reveals it
  progressively. This is a display animation over locally generated
  text — it is NOT backend streaming, and nothing in the UI claims it
  is. A key entered in an earlier version of the app is carried over
  automatically into the new key slot (see `migrateLegacyAiKey` in
  `src/lib/conversation-ai.ts`); the service address was never stored,
  so it needs adding once in Settings → AI Chat.

Live cloud streaming is unverified until the owner tests it on their
own device with their own key — the VM has no key and cannot verify it.

**Model value (UPDATE 19).** Every cloud call sends a `model` field
(`DEFAULT_MODEL` in `src/lib/conversation-ai.ts`, `UPSTREAM_MODEL` in
the repo-root `functions/api/ai-chat.ts`, both `gemini-3.8-flash` — the live Stable
Flash model, free tier, verified 2026-11-27 against Google's own
models page; the previous value was shut down June 1, 2026). The
model name is internal only and never appears in the UI. Models get
shut down — re-check this value against Google's models page
periodically and, if it changes, update it in all three places
together (the two website constants plus Android's `AI_MODEL`);
`tests/streaming.test.mjs` fails the suite if the constants drift
apart or name a dead model.

## Data & privacy

- **Local-first**: all data is stored in the browser's localStorage on the user's
  own device. There is no server database in v1 and nothing is uploaded anywhere.
- Documents are stored locally (max 2 MB each in this version).
- Backup: Settings → Download Backup (JSON) / Import Backup.
- No subscription, no payment gateway, no paid API in v1.

## Known limits (honest)

- The Android code in `../android/` has never been compiled on this machine
  (no JDK here) — first compile + unit tests need Android Studio.
- The AI Assistant and AI Business Insights work fully on-device with no key;
  there is no third-party AI provider to configure.
- Receipt "PDF" uses the browser's Print → Save as PDF (free, no paid service).
- **Sessions are not yet server-validated** (see "Persistent login" above):
  JS-set cookies cannot be HttpOnly and there is no Pages Functions + KV/D1
  session store yet — that needs Cloudflare dashboard bindings. The current
  token/rotation/revocation layer is the closest secure equivalent on the
  free static tier; it is not presented as server-side validation.
- **Customer/agent profiles open as `/customers?id=<id>` / `/agents?id=<id>`**:
  a static export cannot prerender a page for a user-created id, so profile
  links use a query param — the list page's HTML always exists, so clicks
  and full loads both render the profile. Old `/customers/<id>` deep links
  still work through the pathname-aware list page + `_redirects` rewrite.
