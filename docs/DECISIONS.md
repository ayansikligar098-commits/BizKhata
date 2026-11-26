# BizKhata — Decisions Taken (safe defaults)

Ayan said "Sab Tumhare Hisab Se Banao" (2026-11-26 18:58 IST) — make all
remaining decisions as per judgement, and list them so he can change any.
These are the defaults the build uses. Nothing here is ayan-confirmed
except the items marked **confirmed**.

## Confirmed by ayan

- **App name: BizKhata** (confirmed 2026-11-26). Business profile inside
  the app stays **Al Falah Communication — CSC Center** (the shop name,
  not the app name). Never "Al Falah Business" as the app name.
- **Build both together**: native Android app + website in parallel,
  same backend/data model. No HTML anywhere (Android = Kotlin/Compose;
  website = React/Next.js + TypeScript fullstack web app).
- **Working application, not a UI prototype.** Every button works on
  real saved data; no hardcoded demo numbers, no fake success messages,
  no placeholder modules. Start empty.
- **FREE only** (2026-11-26 18:57 IST): no paid tools, tiers, hosting,
  APIs or services. Do not buy anything.
- **Gemini API, free tier only** for AI features (chatbot, insights,
  demand prediction). Graceful fallback when no key/quota — the app
  works fully without AI. The key is ayan's to provide later via secure
  setup; no key is invented or embedded.
- **No bugs / crashes / glitches** (2026-11-26 18:59 IST): Phase G
  testing is mandatory before any release claim.
- **App is for EVERYONE** — multi-business, not single-shop-only. CSC
  is the first/primary category because it is ayan's shop.
- **Chatbot home (2026-11-26, ayan asked "Chat Bot Kha Pe Hoga")**:
  purple floating chat button bottom-right on the Dashboard + "Chatbot /
  AI Assistant" drawer entry + `Routes.CHATBOT`. Built-in responder
  answers from real Room data with no key; Gemini (free tier only)
  summarises the same facts only when the owner adds his free key in
  Settings; Gemini failure falls back to the built-in answer and says
  so. Never invents numbers; empty data = plain "Abhi koi record nahi
  hai". Reports AI Insight stays in Reports.
- **PAN is done by ayan himself — NOT outsourced.** Aadhaar (name
  correction, mobile update, biometric, Aavak Dhakla), Licence and other
  backend work go to external agents.
- **Money Transfer fund comes from ayan's brother**; hisab goes wrong
  after 1–2 days — hence the fully separate MT ledger with daily closing.

## Section 28 pending items — defaults chosen (changeable)

1. **One business profile per category** — profiles fully separate, no
   mixing. (2–3 profiles per account.)
2. **Backend/hosting: free tiers only; local-first data (Room) with sync
   when online.** No paid backend in v1.
3. **DB schema / API / architecture**: Room entities as in
   `data/entity/Entities.kt`; repository pattern; same data model shared
   by the Android app and the website. PostgreSQL discussed as suitable
   for the shared backend; the web app uses its own server storage on
   the same model.
4. **Offline + auto-sync**: offline transactions work locally first;
   sync when online (v1: local-first; full sync wiring is remaining
   work after auth).
5. **Backup/export**: PDF + Excel/CSV + local DB backup. (Android v1:
   CSV share export works; PDF/Excel export is in the web app; Android
   PDF export is remaining work.)
6. **WhatsApp reminders: manual via share link** — no paid auto service.
7. **Inventory/stock: NOT in CSC v1.** (Retail categories can add it
   later; do not merge school modules — attendance, library, exams,
   fees — into CSC v1 without ayan confirming.)
8. **Branding**: clean professional Material 3, simple colours, logo
   placeholder he can replace later. App name is a single constant
   (`domain/Branding.kt` — `APP_NAME = "BizKhata"`).
9. **Website: built together with the app** (order changed 2026-11-26
   18:54 IST; supersedes the earlier Android-first-then-website order).
10. **Deployment costs: free only for v1.**

## GitHub — BLOCKED, then new email (2026-11-26)

Creating the GitHub account with ayan's Google account **failed**:
GitHub says the account linked to that Google identity is **suspended**
("Access to your account has been suspended due to a violation of our
Terms of Service"), so "Continue with Google" signs into the suspended
account instead of making a new one. No GitHub username chosen, no
BizKhata repo created. **This does NOT block the build** — all code stays
in the workspace (`~/workspace/al-falah-app/`).
- **New email for GitHub only (2026-11-26 19:03 IST): alfalah7797@gmail.com**
  — use ONLY this email to create the GitHub account (username
  "BizKhata" if available, repo "BizKhata", public). A browser task is
  creating the account + repo now; repo URL pending. When it arrives,
  initialise git in the workspace, commit, and push. Do NOT push before
  the repo URL is provided, and do NOT use alfalah7797@gmail.com for
  anything except GitHub.

## Original ChatGPT chat FOUND — Record B DISCARDED (2026-11-26 19:03 IST)

The original "app wali chat" was found and read first-to-last (43 user
messages, same share URL, tab ayan opened). It settles Record A vs
Record B: **the original chat is CSC-only for Al Falah Communication —
NO school features (no attendance/library/fees/exams), NO retail
inventory/sales/purchase.** Record B's retail+school content was
ChatGPT's wrong reconstruction — **DISCARD it completely, do not build
school modules.** Full detail in `requirements.md` (Original Chat
appendix) and the browser report under
`~/workspace/agents/702ac013-1717-410f-9f95-3d195fe042a4/subagent-output/`.

New facts applied from the original chat:
- **Money Transfer fund comes from ayan's BROTHER by UPI.** Track per
  fund receipt and per transaction: fund received, amount transferred,
  expenses, balance left, who it went to. Closing formula (turn 18):
  Starting + Received − Sent − Expenses = Closing (Cash and UPI
  separately). Implemented: `MoneyTransferFundEntity` (Room v2,
  auto-migrated), "Add Fund From Brother" in the MT screen, MT Cash/UPI
  closing balances.
- **Agent model**: ayan brings the customer, agent does backend work,
  ayan prints + delivers, then pays agent. Example: customer ₹500,
  agent ₹250, paid ₹150, remaining ₹100, **margin ₹250**. Margin is
  shown per job (received − agent charges). Customer and agent ledgers
  stay separate.
- **"Recipe" = receipt.** Professional invoice: A4 + thermal layouts,
  signature section, Paid/Due clearly separate, PDF/WhatsApp/print/
  duplicate/history. Duplicate receipt added to Receipts screen.
- **Design "2" = Option 2 Clickable Prototype** — ayan chose the
  interactive clickable demo over static UI screens. The web app must
  feel like that: every button navigates/works.
- **Demo numbers are DEMO only** (Income ₹5,420, Expenses ₹1,220,
  Customer Due ₹3,500, Agent Payable ₹1,200, Xerox ₹350, Printing ₹450,
  Smart Card ₹200, MT Commission ₹300) — never use as real data; start
  empty.
- **Language**: English (default, proper professional), Hindi,
  Hinglish; Gujarati mentioned once — possible later addition, not now.
  Chosen on a screen after login, saved, changeable in Settings,
  synced across app + website.
- **Checked radios are NOT confirmed decisions**: offline+online,
  owner-only, automatic cloud backup, Hindi+English were shown checked
  in a ChatGPT summary, but Section 28 still lists them pending — use
  the defaults in this file (offline-capable local-first, owner-only,
  free tiers, manual + cloud backup where free).
- **Easy to use is core**: big buttons, simple labels, 2–3 steps to
  add money, help messages, undo/correction with audit history.
- **Custom Module & Category Builder is compulsory** — any shopkeeper
  can add services, income/expense categories, custom fields, and
  enable/disable modules.
- **"Online Payments"** (listed as a module in the turn-37 compilation)
  is covered by the UPI Book — UPI is the shop's online payment method;
  no separate module.

## Open questions for ayan (do not block the build)

- Which record is final: Record A (CSC-only, v1 scope) vs Record B
  (retail + school features)? Record B is kept separate in
  `requirements.md` Appendix and is NOT merged into v1.
- Where the original "app wali chat" lives (the ChatGPT shared link
  does not contain it; login read found no chats).
- CSC vs plain gold-fill poster choice (asked 2026-11-26 11:38 IST,
  still unanswered).

## UPDATE 13 — complete Indian language, Hinglish & mixed-word understanding (2026-11-26 23:17 IST, owner order)

- New pure-Kotlin layer `domain/Multilingual.kt` UNDER the existing parser: `canonicalise()` maps any supported language/script/Romanized spelling to the canonical Hinglish tokens the parser already understands ("aaje" → "aaj", "થયા" → "hue", "૩૦૦" → "300", "ane" → "aur", "malyo" → "mila"), then the existing structured-action pipeline runs UNCHANGED — same intents, same accounting rules, same preview + confirm flow. `detectLanguage()` scores script (Unicode ranges) + keyword tables; `MultilingualReplies` holds reply templates.
- Coverage: all 22 scheduled languages + English (HI, GU, MR, BN, PA, TA, TE, KN, ML, OR, AS, UR, SA, KS, KOK, NE, SD, MNI, BRX, DOI, MAI, SAT + EN). Romanized input (Hinglish, Roman Gujarati, Roman Marathi, …) is first-class — native script is never required. Mixed sentences (2–3 languages in one message) are understood as a whole; mid-conversation switching re-detects per message. Nobody is ever forced to pick a language before chatting.
- Vocabulary is DATA-DRIVEN tables (`romanVariants`, `nativeTokens`, `numberWords`, `detectionKeywords`, reply templates) — extend by adding a row, never a one-off `if`. Number words cover Hindi/Urdu, Gujarati, Marathi, Bengali, Punjabi, Tamil, Telugu, Kannada, Malayalam, Odia, Assamese, Nepali, Sanskrit; all Indic + Arabic digit blocks convert to ASCII.
- Reply templates exist for 15/23 languages (EN, Hinglish, HI, GU, MR, BN, PA, TA, TE, KN, ML, OR, AS, UR, NE). Sanskrit, Kashmiri, Konkani, Sindhi, Manipuri, Bodo, Dogri, Maithili, Santali are UNDERSTOOD but answered in Hinglish until templates are added (documented limit, not a silent gap).
- Manual AI-language preference in Settings ("AI Assistant Language", Auto default) — fixes reply language + voice recogniser language (`VoiceInput.startListening(languageTag)`); Auto detects per message. Stored in DataStore as `ai_language_pref`. ChatbotViewModel exposes `voiceLanguageTag`; ChatbotScreen passes it to the mic. Cloud prompts now say "any Indian language, native script or Romanized" and answer in the user's language; cloud still goes through provider-neutral `CloudAiClient` with structured JSON and falls back to the built-in parser.
- Behaviour changes from this update (all covered by tests): "Rahul ka baki 300 jama kar" is a customer PAYMENT (tried before the due branch, which would have recorded fresh udhaar); agent names strip possessive particles ("Ramesh nu" → Ramesh) and bare particles ("Agent ko/ne 500…") ask for the agent instead of inventing one; a bare "Xerox 300 cash" (no verb — common in voice-to-text) parses as an entry, unless a known customer name appears (then it is NOT guessed as walk-in income); "pending" counts as a due word; "Kal" stays ambiguous in every language.
- BUGS FOUND BY THE NEW TESTS (fixed in this update): (1) tokenising with `\w`/`\p{L}` shatters Indic words at vowel signs, so "कैश"/"मिळाले"/"টাকা" never matched any vocabulary — fixed with `\p{M}` (combining marks) in the token regexes. (2) `detectMode` used bare `contains("upi")` — "rupiya" contains "upi", so Gujarati "rupiya" messages were misread as UPI payments; now word-boundary `\bupi\b` everywhere (parser, help, navigation, knowledge, built-in responder). (3) `isInternalTransfer` used bare `contains("to")` — "total" contains "to", so multi-entry messages were misread as internal transfers; now word-boundary. (4) "pan" must never map to "bhi" (it is PAN Card) — deliberately unmapped. (5) standalone "so" must not become ₹100 — English "so" would invent a phantom entry; only "<one> so" composes.
- MEASURED (Python mirror, `docs/ai_assistant_mirror.py`): 165/165 = 100% overall (was 35/35 before; the 35 original scenarios still pass unchanged). Per-language accuracy 100% for all 23 languages on the measured cases (native + Romanized + mixed income, detection, brief examples, voice-style input, follow-ups). The mirror prints a per-language table; the Kotlin suite is `MultilingualAiTest.kt` (same scenarios) with its own per-language accuracy report and a 95% floor.
- HONEST LIMITS: Devanagari is shared by 8 languages, so short Devanagari messages rely on keyword scoring and can be confused with each other (understanding is unaffected — they share most vocabulary; only the reply language may fall back). Roman Urdu overlaps Hinglish (detected as Hinglish). Number words are missing for Kashmiri, Sindhi, Konkani, Dogri, Maithili, Bodo, Manipuri, Santali (digits work for all). Voice recognition per language is implemented against the platform API and is UNTESTED on a live device (no device on this VM). First compile + `./gradlew testDebugUnitTest` in Android Studio remains pending (no JDK on this VM) — the JVM-free verifier and the Python mirror pass, which is not a compile proof.

- The owner sent a screenshot of the live website showing visible
  third-party AI provider references and ordered ALL of them removed
  from the whole application. For Android: no provider name, no tier
  wording, no technical error text in any user-visible string.
- Branding ONLY: "BizKhata AI Assistant" / "Your Intelligent Business
  Assistant"; insights heading "AI Business Insights". Settings labels
  the key entry neutrally as "AI key" (masked, never shown). Errors are
  plain Hinglish, e.g. "AI abhi available nahi hai, baad me try karo".
- The AI feature itself is PRESERVED. The underlying cloud provider is
  unchanged and still free-tier; only its name was removed from the UI.
  The single remaining provider string in `app/src` is the model
  identifier value in `AiFeatures.AI_MODEL` (code config, never shown).
- `domain/GeminiChatbot.kt` was renamed to the provider-neutral
  `domain/CloudAiClient.kt`; `SettingsStore` key is now neutral `ai_key`.
