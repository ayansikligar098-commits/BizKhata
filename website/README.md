# BizKhata — Website

Business Accounting & Management Platform for Al Falah Communication (CSC Center first),
for all businesses. This is the **website side** of BizKhata: a real Next.js + TypeScript
app that builds to plain static files — no server, no paid backend, free hosting on
Cloudflare Pages.

> The Android app (Kotlin / Jetpack Compose) lives in `../android/`. Both share the
> same data model and accounting rules.

## What it does

- **Starts completely empty** — no demo numbers, ever.
- **Mobile + PIN registration / login** with forgot-PIN recovery (recovery word).
- **Language screen after login**: English (default), Hindi, Hinglish — changeable in Settings.
- **15 business categories** at signup, each with ready-made services. CSC Center is
  fully built first for Al Falah Communication. Up to **3 separate business profiles**
  per account, with a switcher — data is never mixed between profiles.
- **Dashboard**: net profit, Cash/UPI balances, customer due and agent payable (always
  separate), service-wise income, Cash vs UPI, pending payments, AI insight (off by default).
- **Cash Book / UPI Book**: separate books; Cash↔UPI is an internal transfer, never income.
- **Money Transfer**: fully separate ledger. Fund from brother (by UPI), transfers,
  commission-only profit, MT other expenses (Tea/Food, Transport, Staff, Shop, Misc),
  daily closing (Starting + Received − Sent − Expenses, Cash and UPI separately).
- **Services / Jobs**: per-service jobs with status (New → Delivered), fees, received,
  due, per-job margin. **PAN work can never be assigned to an agent** — enforced in the UI.
- **Customers & Customer Khata**: per-customer pages, document uploads, WhatsApp
  reminders (manual share link), per-customer ledger.
- **Agents**: per-agent ledger, agent payments, payable separate from customer due.
- **Expenses & Machine Maintenance**: expenses linked to a service for accurate profit;
  per-machine lifetime cost (purchase + maintenance).
- **Receipts**: unique numbers BK-0001…, A4 + thermal layouts, PDF/Print, WhatsApp share,
  duplicate, signature section, Paid vs Due clearly shown.
- **Daily Dhandha**: billing vs actually-received vs profit, per service, by period.
- **Reports**: PDF/Print + CSV export, service-wise profit, Cash vs UPI, dues, payables.
- **Difference Finder**: expected vs recorded balance, with suggestions only — it never
  changes entries. Separate finders for General / Cash / UPI / Money Transfer / Service.
- **Recycle Bin + Audit Log**: soft delete with restore; every change logged old → new.
- **Customization Studio**: add services/expense categories, enable/disable modules,
  show/hide dashboard cards, restore defaults — per profile.
- **Gemini AI insight (free tier only)**: OFF until the owner adds his own free Gemini
  API key in Settings. The app works fully without AI.

## Accounting rules (verified by tests)

All money is integer **paise** — never float. See `tests/accounting.test.mjs`
(run `npm test`, 26 checks):

1. Bill ₹500 / received ₹200 → due ₹300; only ₹200 counts as cash/UPI.
2. Money Transfer ₹10,000 with ₹50 commission → profit is ₹50 only.
3. Cash→UPI ₹1,000 internal transfer → ₹0 income, ₹0 expense.
4. Customer receivable and agent payable are separate ledgers.

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

## Data & privacy

- **Local-first**: all data is stored in the browser's localStorage on the user's
  own device. There is no server database in v1 and nothing is uploaded anywhere.
- Documents are stored locally (max 2 MB each in this version).
- Backup: Settings → Download Backup (JSON) / Import Backup.
- No subscription, no payment gateway, no paid API in v1.

## Known limits (honest)

- The Android code in `../android/` has never been compiled on this machine
  (no JDK here) — first compile + unit tests need Android Studio.
- Gemini insight needs the owner's own free Gemini key; without it, AI stays off
  and the app works fully.
- Receipt "PDF" uses the browser's Print → Save as PDF (free, no paid service).
