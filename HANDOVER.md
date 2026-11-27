# BizKhata — Android Project Handover

**Date:** 27 November 2026
**App:** BizKhata (business accounting & management for CSC centres and small shops)
**Business profile inside the app:** Al Falah Communication — CSC Center
**Repo:** https://github.com/ayansikligar098-commits/BizKhata (owner: ayansikligar098-commits)
**Remote HEAD verified:** `e49b9ca1` — the files in this package are **identical** to the GitHub repo at that commit (checked file-by-file on 27 Nov 2026; the only difference is a Python cache file, `docs/__pycache__/*.pyc`, which is not part of the project).
**Language:** Kotlin + Jetpack Compose (Material 3). **No WebView, no HTML anywhere.**

> This handover gives you the complete Android Studio project. There is **no APK** in this package — the code has never been compiled (no JDK on the machine that built it). Section 9 explains exactly what is missing before a first build, and Section 11 tells you how to build it yourself.

---

## 1. What you are getting

| Item | Detail |
|---|---|
| Project folder | `BizKhata-android/` (the whole `android/` folder) |
| Files in the package | **90** (89 project files + this handover) |
| Kotlin files | **59** (55 main + 4 test), **12,693 lines** |
| Size | ~4.7 MB (no build outputs, no `.git`, no caches) |
| Excluded on purpose | `.git/`, `build/`, `.gradle/`, `__pycache__`, `*.pyc`, `local.properties` (machine-specific, Android Studio recreates it) |
| Secrets in the package | **None.** No API keys, no keystore, no passwords anywhere (see §6) |

**How to check nothing is missing:** the file inventory in §12 lists every file. Count the files after unzipping — it must be 90 including this document. The GitHub repo is the second copy of the same tree.

---

## 2. Project structure

```
BizKhata-android/
├── HANDOVER.md                  ← this document
├── README.md                    ← project readme (status, architecture, rules)
├── build.gradle.kts             ← root: plugin versions (AGP, Kotlin, KSP)
├── settings.gradle.kts          ← project name "BizKhata", includes :app
├── gradle.properties            ← JVM args, AndroidX flags
├── gradle/wrapper/
│   ├── gradle-wrapper.properties← Gradle 8.7
│   └── gradle-wrapper.jar       ← official wrapper jar (Gradle 8.7)
├── gradlew / gradlew.bat        ← wrapper scripts (recreated in this handover, §9)
├── .gitignore
├── app/
│   ├── build.gradle.kts         ← app config + all dependencies (§3–4)
│   ├── proguard-rules.pro       ← release rules (added in this handover, §9)
│   └── src/
│       ├── main/
│       │   ├── AndroidManifest.xml
│       │   ├── java/com/alfalah/business/
│       │   │   ├── AlFalahApp.kt / MainActivity.kt
│       │   │   ├── data/        ← Room DB (v2), DAOs, entities, repositories,
│       │   │   │                    SettingsStore (DataStore), ChatHistoryStore
│       │   │   ├── domain/      ← pure Kotlin: AccountingEngine, Models,
│       │   │   │                    CategorySetup, Chatbot, AiAssistant,
│       │   │   │                    CloudAiClient, Conversation, Multilingual,
│       │   │   │                    Streaming, VoiceConversation, DailyBusiness,
│       │   │   │                    BusinessKnowledge, AiFeatures, Branding
│       │   │   ├── navigation/  ← NavGraph, Routes (27 routes)
│       │   │   └── ui/          ← one screen per module (see §7)
│       │   │       ├── agents, auth, cashbook, chatbot, components,
│       │   │       │   dailybusiness, dashboard, expenses, khata, language,
│       │   │       │   moneytransfer, receipts, reports, services,
│       │   │       │   settings, theme
│       │   └── res/
│       │       ├── values/strings.xml, colors.xml, themes.xml
│       │       └── mipmap-mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi/
│       │           ├── ic_launcher.png / ic_launcher_round.png
│       └── test/java/com/alfalah/business/   ← 4 unit-test files (§7)
└── docs/
    ├── requirements.md          ← full spec (Sections 1–28 + original chat)
    ├── DECISIONS.md             ← every default chosen for open questions
    ├── AI_TEST_REPORT_UPDATE20.md ← AI test report (website + Android + artifact)
    ├── ai_assistant_mirror.py   ← Python mirror of the AI logic (test aid)
    └── verify-android.py        ← JVM-free structural checks (see §7)
```

---

## 3. Gradle configuration

| Setting | Value | Where |
|---|---|---|
| Android Gradle Plugin | **8.5.2** | root `build.gradle.kts` |
| Kotlin | **2.0.21** | root `build.gradle.kts` |
| KSP (annotation processing, Room) | **2.0.21-1.0.28** | root `build.gradle.kts` |
| Gradle (wrapper) | **8.7** | `gradle/wrapper/gradle-wrapper.properties` |
| JDK needed | **17** (`sourceCompatibility`/`targetCompatibility`/`jvmTarget` = 17) | `app/build.gradle.kts` |
| compileSdk / targetSdk | **34** (Android 14) | `app/build.gradle.kts` |
| minSdk | **26** (Android 8.0) | `app/build.gradle.kts` |
| applicationId | `com.alfalah.business` | `app/build.gradle.kts` |
| versionCode / versionName | **1 / "1.0.0-prototype"** | `app/build.gradle.kts` |
| Compose compiler extension | 1.7.6 | `app/build.gradle.kts` |
| Minify (release) | **off** (`isMinifyEnabled = false`) | `app/build.gradle.kts` |
| Repositories | `google()`, `mavenCentral()`, `gradlePluginPortal()` | `settings.gradle.kts` |
| Gradle JVM args | `-Xmx2048m -Dfile.encoding=UTF-8` | `gradle.properties` |
| AndroidX / non-transitive R | `android.useAndroidX=true`, `android.nonTransitiveRDeps=true` | `gradle.properties` |

---

## 4. Dependencies (all free, all from Google/Maven Central)

| Library | Version | Purpose |
|---|---|---|
| androidx.core:core-ktx | 1.13.1 | Core Kotlin extensions |
| androidx.activity:activity-compose | 1.9.3 | Compose Activity |
| androidx.lifecycle (runtime-compose, viewmodel-compose, runtime-ktx) | 2.8.3 | Lifecycle + ViewModel |
| Compose BOM | 2024.09.00 | Compose 1.7.6 (ui, ui-graphics, tooling-preview) |
| androidx.compose.material3:material3 | 1.3.1 | Material 3 UI |
| androidx.compose.material:material-icons-extended | 1.7.6 | Icons |
| androidx.navigation:navigation-compose | 2.8.0 | Navigation |
| androidx.room (runtime, ktx, compiler via KSP) | 2.6.1 | Local database (offline-first) |
| androidx.datastore:datastore-preferences | 1.1.1 | Settings (language, theme, profile, PIN hash) |
| org.jetbrains.kotlinx:kotlinx-coroutines-android | 1.8.1 | Coroutines |
| junit:junit (test) | 4.13.2 | Unit tests |
| kotlinx-coroutines-test (test) | 1.8.1 | Coroutine tests |
| androidx.test.ext:junit, espresso-core, ui-test-junit4 (androidTest) | 1.2.1 / 3.6.1 | Instrumented tests |

No other dependencies. No paid SDK, no proprietary library, no Firebase, no analytics.

---

## 5. Permissions and app configuration

`app/src/main/AndroidManifest.xml` — one launcher Activity (`MainActivity`, exported), application class `AlFalahApp`, app label `BizKhata`, theme `@style/Theme.AlFalah`.

| Permission | Why |
|---|---|
| `INTERNET` | Cloud AI chat (only when the owner has entered a key in Settings) |
| `RECORD_AUDIO` | Voice input for the AI Assistant (asked at runtime from the chat screen) |
| `READ_MEDIA_IMAGES` | Picking images (e.g. customer documents) |
| `READ_MEDIA_VISUAL_USER_SELECTED` | Partial photo access (Android 14) |

No location, contacts, SMS, camera or storage permissions. No WebView is used anywhere.

**Data:** Room database `bizkhata.db` (v2), local-first, on the device. No backend server is wired in — sync is a pending decision (see §8). The app starts **completely empty** — no demo numbers, no sample customers.

**AI key:** no key is shipped in the code or in this package. The owner enters his own key in Settings → AI Chat; it is stored in app-private DataStore and can be removed there. The cloud client is provider-neutral (plain `HttpURLConnection`, no extra dependency) and falls back to the built-in on-device responder when the cloud is unavailable, saying so honestly.

---

## 6. Signing configuration — READ THIS

**There is no signing configuration in this project.**

- No keystore file (`.jks` / `.keystore`) exists anywhere in the project or the repo.
- No `signingConfigs` block in any `build.gradle.kts`.
- No key alias, no store password, no key password — nothing to expose, nothing to leak.
- The `release` build type exists (minify off, ProGuard files listed) but **signs with nothing** — a release build from this project is unsigned and **cannot be installed on a phone** until signing is set up.

**To make a signed release build** (in Android Studio): `Build → Generate Signed App Bundle / APK → APK → Create new…` — create a new keystore, choose a strong store password + key password, and **back up the keystore file and both passwords somewhere safe, outside the project**. If the keystore is lost, the app can never be updated on the same Play listing / same install — a new keystore means a new app identity. Never commit a keystore or a password to GitHub.

---

## 7. What is complete

Code is **written** for all of this. "Complete" here means implemented in code — it has **not** been compiled or run yet (see §10).

- **Auth & setup:** language picker (English / Hindi / Hinglish), business category pick (15 categories, CSC first), mobile + 4-digit PIN login (SHA-256 hash only), 2–3 business profiles with strict isolation, Light/Dark/System themes.
- **Dashboard:** Today/Week/Month/Year pills, Income/Expenses/Profit, Cash/UPI/Due/Payable cards, service-wise income donut, Recent Jobs, bottom nav + drawer.
- **Daily Business hub:** Today's Total / Cash / UPI collection, Expenses, Net Earnings, service-wise collection, total transactions, recent entries, Quick Add Entry (date/time, service, description, quantity, rate, total, Cash/UPI/Other, direct expense, notes). Modules feed it automatically; nothing is written twice.
- **Cash Book / UPI Book:** filters, opening/closing, running balance, internal Cash↔UPI transfers (never income/expense).
- **Money Transfer:** Overview/Transactions/Settlement tabs, fund received from the brother by UPI, daily closing, commission-only income (₹10,000 principal + ₹50 commission → ₹50 income).
- **Services:** PAN Card, Aadhaar, Voter ID, Ayushman, Xerox, Printing, Smart Card, Passport Size Photo, Scanning, Document Work — job lists with status filters (New / In Progress / Submitted / Pending / Completed / Delivered / Cancelled), search, edit, status change, agent assignment. **PAN is never assignable to an agent** (the owner does PAN himself; enforced in the repository layer).
- **Customers & Agents:** Customer Khata (Ledger/Jobs/Documents/Details), Agent Management + Agent Profile (per-agent ledger, payables). Customer receivable and agent payable are separate ledgers. Bill ₹500 / received ₹200 → due ₹300 (only ₹200 counts as cash).
- **Expenses & Maintenance:** expense categories, machine maintenance (purchase details, parts replaced, lifetime cost, last/next maintenance).
- **Receipts:** unique numbers (BK-0001…), A4 + thermal preview, signature section, duplicate button.
- **Reports:** Business / Service-wise / Customer tabs, 7-day bar chart, Daily Business tab, CSV share export.
- **Difference Finder:** Cash/UPI/MT/Service reconciliation, suggests possible causes only — never auto-changes data.
- **Settings:** Recycle Bin + restore, Audit Log (old → new values), Customization Studio (module toggles, add/rename/delete your own services), Settings list.
- **AI Assistant:** chat screen (floating button on Dashboard + drawer entry), general conversation + business questions from real Room data, preview → confirm before any financial save, do-it commands (open pages, build checklists), multilingual replies (22 scheduled languages + Hinglish/Roman forms), streaming display, voice input (SpeechRecognizer) + voice replies (TextToSpeech), chat history.
- **Tests written:** 4 unit-test files, 34 Kotlin tests (AccountingEngine, AI assistant, conversation, multilingual).

**Verification done without a JDK (all passing, 27 Nov 2026):**

- `docs/verify-android.py` — **ALL JVM-FREE CHECKS PASSED**: brace/paren balance on all Kotlin files, every import resolves to a defined symbol, every `Routes.*` reference exists, every screen the NavHost uses is defined, no demo numbers/names in code, no WebView, no `Double` money maths.
- Python mirror of the accounting engine + AI logic — **476/476** checks, including MT ₹10,000/₹50 → income ₹50 and bill ₹500/received ₹200 → collection ₹200, due ₹300.
- **These are not a compile and not a test run.** They check structure and logic only.

---

## 8. What is incomplete / still to do

1. **First compile + first test run (Phase G).** Run `./gradlew testDebugUnitTest` and `./gradlew connectedDebugAndroidTest` in Android Studio. Fix whatever the compiler reports. **Do not call the app complete until an APK is built and tested.**
2. **PDF receipt / PDF-Excel report export on Android.** CSV share works; full PDF/Excel export exists only in the web app so far.
3. **Opening balances entry in Settings.** Balances start at ₹0 in v1.
4. **MT Other Expenses as a separate list** (Tea/Food, Transport, Staff, Shop, Misc). Per-transfer charges are recorded; the dedicated list is remaining.
5. **Custom Module & Category Builder UI.** Category setups exist; owners can add/rename/delete services in Customization Studio. Still remaining: the in-app builder for income/expense categories, custom fields and custom pages.
6. **Gujarati language.** Mentioned once; English/Hindi/Hinglish are implemented.
7. **Document upload per customer** (file picker wiring). The web app has it.
8. **Google Sign-In + mobile login** (spec §A). The app is single-owner local-first for now; add auth before multi-device sync.
9. **AI key storage hardening.** The key currently lives in app-private DataStore; move it to EncryptedSharedPreferences / server-side when a backend is built.
10. **"Today" timezone.** Android still uses UTC for "today"; align it to the device-local date (the website already does this) so entries made after midnight IST are dated correctly.
11. **Aadhaar Mobile Number Update module — NOT built, by the owner's decision** (27 Nov 2026: "Tum Mat Banana Module"). Only the AI behaviour exists: the AI takes the request as a spec, asks for confirmation, and queues it as a saved development request — it must never claim the module exists.

---

## 9. Known errors found in this handover — and what was done

Checked on 27 Nov 2026, **before** packaging. Four groups of files were missing — the project as it stood on GitHub could not have built. All four are standard boilerplate, not app logic, and each added file says so in a header comment.

| # | Missing file(s) | Effect if left missing | Fix applied in this package |
|---|---|---|---|
| 1 | `app/src/main/res/mipmap-*/ic_launcher.png` and `ic_launcher_round.png` (10 files, 5 densities) | Manifest references `@mipmap/ic_launcher` — build error "resource not found" | Generated with the brand colours (navy `#1B1B3A` background, purple `#6C5CE7` rounded square, white "B"). Simple, on-brand; replace with a designed logo any time. |
| 2 | `app/src/main/res/values/themes.xml` (+ `colors.xml`) | Manifest references `@style/Theme.AlFalah` — build error "resource not found" | Added `Theme.AlFalah` (`Theme.Material3.DayNight.NoActionBar`, navy status/nav bars, light background). The Compose theme in `ui/theme/Theme.kt` is untouched. |
| 3 | `app/proguard-rules.pro` | Referenced by the release build type — missing file | Added a minimal standard file (keeps the data/domain layers if minify is ever turned on). Minify is off today, so it changes nothing. |
| 4 | `gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar` | No wrapper — `./gradlew` commands in the README would not run | Recreated from the official Gradle 8.7 template; the jar is the official one merged from the Gradle 8.7 distribution (`gradle-wrapper-shared-8.7.jar` + `GradleWrapperMain`). `bash -n` syntax check passed. If the scripts ever misbehave, delete the three files and let Android Studio regenerate the wrapper. |

**After these fixes:** every resource the manifest references resolves, and `verify-android.py` still passes. **This is still not a compile** — the Kotlin code itself has never been compiled, so first-compile errors in the code may still appear. Fix them in Android Studio; do not delete code to make the build pass.

---

## 10. Known limitations (honest)

- **Never compiled, never run, no APK.** No JDK existed on the machine that built this code. First compile is step 1 of §11.
- **Unit tests were never executed on a JVM.** The 34 Kotlin tests are written; the 476/476 figure is a Python mirror, not a Gradle test run.
- **No emulator or device testing was ever done** for the Android app (no mic, no device on the build machine).
- **Local `.git` is stale.** The `android/.git` folder has only 2 old commits; it is **not** the source of truth. GitHub (`e49b9ca1`) is. The code was pushed to GitHub through the API, not through this local git history. Do not rely on `git log` inside the project folder.
- **Version is `1.0.0-prototype` (versionCode 1).** Bump the version name before any public release.
- **AI cloud answers need the owner's key** (Settings → AI Chat) and the service address; without a key the built-in on-device responder answers instead.
- **Website ≠ Android.** The live website (https://bizkhata.pages.dev) and this Android code share the data model and accounting rules, but they are separate codebases — a fix in one does not appear in the other.

---

## 11. Build instructions (independent build)

You need: a computer with Android Studio, internet (first sync downloads Gradle 8.7 + dependencies, roughly 1 GB), and a phone or emulator.

1. **Install Android Studio** — Hedgehog or newer (Ladybug / Koala / Meerkat all work with AGP 8.5.2). Use the **bundled JDK 17** (Android Studio ships it; `File → Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK` should say 17).
2. **Install the Android 14 SDK** — SDK Manager → SDK Platforms → tick **Android 14.0 ("UpsideDownCake"), API 34** → Apply. Build-tools 34.x are installed automatically with the platform.
3. **Unzip this package** and open the folder in Android Studio: `File → Open → select the BizKhata-android folder` (the one containing `settings.gradle.kts`).
4. **Let Gradle sync finish.** First sync downloads Gradle 8.7 and all §4 dependencies. If sync reports an error, read the error — it is usually a missing SDK component or no internet, not a code problem.
5. **Run the unit tests:** terminal inside Android Studio → `./gradlew testDebugUnitTest` (Mac/Linux) or `gradlew.bat testDebugUnitTest` (Windows). All 34 tests must pass.
6. **Run the app:** create an emulator (Device Manager → Create Device → any phone → API 34 image, or API 26+ — minSdk is 26) or connect a real phone with USB debugging. Press **Run ▶**.
7. **First run:** Language (English / Hindi / Hinglish) → pick business category → mobile number + 4-digit PIN → Dashboard. The app starts empty — add real entries to test.
8. **Release APK (signed):** `Build → Generate Signed App Bundle / APK → APK → Create new…` (keystore — see §6) → choose `release` → Finish. The APK appears under `app/release/`. **Unsigned release builds cannot be installed — do not distribute them.**
9. **Debug APK (quick test):** `./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk` (signed with the debug key, installable on any phone for testing).

If the first compile reports errors in the Kotlin code, fix the error the compiler names — do not delete the file or comment the feature out to make it build. The accounting rules in §7 and in `README.md` are non-negotiable (MT principal is never income, dues are never cash, Cash↔UPI is an internal transfer, PAN is never assigned to an agent).

---

## 12. File inventory (all 90 files)

```
HANDOVER.md
README.md
build.gradle.kts
settings.gradle.kts
gradle.properties
gradle/wrapper/gradle-wrapper.properties
gradle/wrapper/gradle-wrapper.jar          [added §9]
gradlew                                     [added §9]
gradlew.bat                                 [added §9]
.gitignore
app/build.gradle.kts
app/proguard-rules.pro                      [added §9]
app/src/main/AndroidManifest.xml
app/src/main/java/com/alfalah/business/AlFalahApp.kt
app/src/main/java/com/alfalah/business/MainActivity.kt
app/src/main/java/com/alfalah/business/data/AppDatabase.kt
app/src/main/java/com/alfalah/business/data/ChatHistoryStore.kt
app/src/main/java/com/alfalah/business/data/Converters.kt
app/src/main/java/com/alfalah/business/data/SettingsStore.kt
app/src/main/java/com/alfalah/business/data/dao/Daos.kt
app/src/main/java/com/alfalah/business/data/entity/Entities.kt
app/src/main/java/com/alfalah/business/data/repository/Repositories.kt
app/src/main/java/com/alfalah/business/domain/AccountingEngine.kt
app/src/main/java/com/alfalah/business/domain/AiAssistant.kt
app/src/main/java/com/alfalah/business/domain/AiFeatures.kt
app/src/main/java/com/alfalah/business/domain/Branding.kt
app/src/main/java/com/alfalah/business/domain/BusinessKnowledge.kt
app/src/main/java/com/alfalah/business/domain/CategorySetup.kt
app/src/main/java/com/alfalah/business/domain/Chatbot.kt
app/src/main/java/com/alfalah/business/domain/CloudAiClient.kt
app/src/main/java/com/alfalah/business/domain/Conversation.kt
app/src/main/java/com/alfalah/business/domain/DailyBusiness.kt
app/src/main/java/com/alfalah/business/domain/Models.kt
app/src/main/java/com/alfalah/business/domain/Multilingual.kt
app/src/main/java/com/alfalah/business/domain/Streaming.kt
app/src/main/java/com/alfalah/business/domain/VoiceConversation.kt
app/src/main/java/com/alfalah/business/navigation/NavGraph.kt
app/src/main/java/com/alfalah/business/ui/agents/AgentDetailScreen.kt
app/src/main/java/com/alfalah/business/ui/agents/AgentScreen.kt
app/src/main/java/com/alfalah/business/ui/auth/AuthScreen.kt
app/src/main/java/com/alfalah/business/ui/cashbook/CashBookScreen.kt
app/src/main/java/com/alfalah/business/ui/cashbook/DifferenceFinderScreen.kt
app/src/main/java/com/alfalah/business/ui/chatbot/ChatbotScreen.kt
app/src/main/java/com/alfalah/business/ui/chatbot/ChatbotViewModel.kt
app/src/main/java/com/alfalah/business/ui/chatbot/VoiceInput.kt
app/src/main/java/com/alfalah/business/ui/chatbot/VoiceOutput.kt
app/src/main/java/com/alfalah/business/ui/components/Common.kt
app/src/main/java/com/alfalah/business/ui/dailybusiness/DailyBusinessScreen.kt
app/src/main/java/com/alfalah/business/ui/dailybusiness/DailyBusinessViewModel.kt
app/src/main/java/com/alfalah/business/ui/dashboard/DashboardScreen.kt
app/src/main/java/com/alfalah/business/ui/dashboard/DashboardViewModel.kt
app/src/main/java/com/alfalah/business/ui/expenses/ExpensesScreen.kt
app/src/main/java/com/alfalah/business/ui/expenses/MaintenanceScreen.kt
app/src/main/java/com/alfalah/business/ui/khata/CustomerDetailScreen.kt
app/src/main/java/com/alfalah/business/ui/khata/KhataScreen.kt
app/src/main/java/com/alfalah/business/ui/language/LanguageScreen.kt
app/src/main/java/com/alfalah/business/ui/language/Strings.kt
app/src/main/java/com/alfalah/business/ui/moneytransfer/MoneyTransferScreen.kt
app/src/main/java/com/alfalah/business/ui/receipts/ReceiptsScreen.kt
app/src/main/java/com/alfalah/business/ui/reports/ReportsScreen.kt
app/src/main/java/com/alfalah/business/ui/services/ServiceJobsScreen.kt
app/src/main/java/com/alfalah/business/ui/services/ServicesScreen.kt
app/src/main/java/com/alfalah/business/ui/settings/AuditLogScreen.kt
app/src/main/java/com/alfalah/business/ui/settings/CategoryPickScreen.kt
app/src/main/java/com/alfalah/business/ui/settings/CustomizationScreen.kt
app/src/main/java/com/alfalah/business/ui/settings/RecycleBinScreen.kt
app/src/main/java/com/alfalah/business/ui/settings/SettingsScreen.kt
app/src/main/java/com/alfalah/business/ui/theme/Theme.kt
app/src/main/res/values/strings.xml
app/src/main/res/values/colors.xml          [added §9]
app/src/main/res/values/themes.xml          [added §9]
app/src/main/res/mipmap-mdpi/ic_launcher.png        [added §9]
app/src/main/res/mipmap-mdpi/ic_launcher_round.png  [added §9]
app/src/main/res/mipmap-hdpi/ic_launcher.png        [added §9]
app/src/main/res/mipmap-hdpi/ic_launcher_round.png  [added §9]
app/src/main/res/mipmap-xhdpi/ic_launcher.png       [added §9]
app/src/main/res/mipmap-xhdpi/ic_launcher_round.png [added §9]
app/src/main/res/mipmap-xxhdpi/ic_launcher.png      [added §9]
app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png[added §9]
app/src/main/res/mipmap-xxxhdpi/ic_launcher.png     [added §9]
app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png[added §9]
app/src/test/java/com/alfalah/business/AccountingEngineTest.kt
app/src/test/java/com/alfalah/business/AiAssistantTest.kt
app/src/test/java/com/alfalah/business/ConversationTest.kt
app/src/test/java/com/alfalah/business/MultilingualAiTest.kt
docs/AI_TEST_REPORT_UPDATE20.md
docs/DECISIONS.md
docs/ai_assistant_mirror.py
docs/requirements.md
docs/verify-android.py
```

---

## 13. Where the rest of BizKhata lives

- **Live website / web app:** https://bizkhata.pages.dev (React/Next.js, same data model and accounting rules, already running).
- **Website code:** `website/` in the same GitHub repo.
- **User guide (PDF, website + app):** `bizkhata-user-guide.pdf` v1.3 (73 pages) — Android screenshots are pending the first compile.
- **This handover covers the Android app only.** Nothing in the website was changed for it.

*End of handover — 27 November 2026.*
