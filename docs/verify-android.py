#!/usr/bin/env python3
"""JVM-free verification for the BizKhata Android rebuild (no JDK on this VM).
Checks: brace balance, project-internal import resolution, route/composable
references, demo-number leakage, WebView absence, Double-money absence.
Plus a Python mirror of AccountingEngine running the unit-test cases.
"""
import re, sys
from pathlib import Path

BASE = Path.home() / "workspace/al-falah-app/android/app/src"
MAIN = BASE / "main/java/com/alfalah/business"
TEST = BASE / "test/java/com/alfalah/business"
fails, warns = [], []

kt_files = sorted(MAIN.rglob("*.kt")) + sorted(TEST.rglob("*.kt"))
print(f"Kotlin files: {len(kt_files)}")

def strip_code(text):
    # remove block comments, line comments, string literals (rough but adequate)
    # NOTE (UPDATE 17): the string/char patterns must NOT span newlines —
    # Kotlin string/char literals never do, but an apostrophe in a line
    # comment (owner's, don't) used to pair with a far-away quote and
    # swallow whole functions, faking a brace imbalance.
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    text = re.sub(r'"(?:\\.|[^"\\\n])*"', '""', text)
    text = re.sub(r"'(?:\\.|[^'\\\n])*'", "''", text)
    text = re.sub(r'//.*', '', text)
    return text

# 1. Brace/paren/bracket balance
for f in kt_files:
    code = strip_code(f.read_text())
    for a, b, name in [('{', '}', 'brace'), ('(', ')', 'paren'), ('[', ']', 'bracket')]:
        if code.count(a) != code.count(b):
            fails.append(f"{f.name}: unbalanced {name}: {code.count(a)} vs {code.count(b)}")

# 2. Defined project symbols
defined = {}  # short name -> file
for f in kt_files:
    code = strip_code(f.read_text())
    for m in re.finditer(r'\b(?:fun|class|object|interface|enum class|data class)\s+([A-Z][A-Za-z0-9_]*)', code):
        defined.setdefault(m.group(1), f.name)
    for m in re.finditer(r'\b(?:val|var)\s+([A-Z][A-Za-z0-9_]*)\b', code):
        defined.setdefault(m.group(1), f.name)
# top-level functions (lowercase)
defined_fns = set()
for f in kt_files:
    code = strip_code(f.read_text())
    for m in re.finditer(r'(?m)^fun\s+([a-z][A-Za-z0-9_]*)', code):
        defined_fns.add(m.group(1))
    for m in re.finditer(r'(?m)^(?:private\s+)?fun\s+([a-z][A-Za-z0-9_]*)', code):
        defined_fns.add(m.group(1))

for f in kt_files:
    code = strip_code(f.read_text())
    for m in re.finditer(r'import\s+com\.alfalah\.business\.([A-Za-z0-9_.]+)', code):
        dotted = m.group(1)
        parts = dotted.split('.')
        # last part is the symbol (or member of an object)
        sym = parts[-1]
        if sym[0].isupper() and sym not in defined:
            fails.append(f"{f.name}: import of undefined project symbol {dotted}")
        if sym[0].islower() and sym not in defined_fns and sym not in ('get',):
            # member functions of objects (e.g. Routes.service) handled below
            pass

# 3. Routes referenced exist
routes_src = (MAIN / "navigation/NavGraph.kt").read_text()
route_names = set(re.findall(r'const val ([A-Z_]+)\s*=', routes_src))
route_names |= set(re.findall(r'fun ([a-zA-Z]+)\(', routes_src))
for f in kt_files:
    code = strip_code(f.read_text())
    for m in re.finditer(r'Routes\.([A-Za-z_]+)', code):
        if m.group(1) not in route_names:
            fails.append(f"{f.name}: unknown route Routes.{m.group(1)}")

# 4. Composables referenced in MainActivity exist as defined functions
main_act = (MAIN / "MainActivity.kt").read_text()
for m in set(re.findall(r'\b([A-Z][A-Za-z]+Screen)\b', main_act)):
    if m not in defined:
        fails.append(f"MainActivity references undefined screen {m}")
for m in set(re.findall(r'\b([A-Z][A-Za-z]+ViewModel)\b', main_act)):
    if m not in defined:
        fails.append(f"MainActivity references undefined ViewModel {m}")

# 5. Demo numbers / demo names must not appear as live data (comments excluded)
demo_patterns = ["5420", "5,420", "Rahul Patel", "98765 43210", "50,000", "24,300", "33,500"]
for f in kt_files:
    if 'test' in str(f):
        continue
    code = strip_code(f.read_text())
    for pat in demo_patterns:
        if pat in code:
            fails.append(f"{f.name}: demo value leaked into code: {pat!r}")

# 6. No WebView anywhere (comments stripped — "no WebView" doc notes are fine)
for f in kt_files:
    if 'WebView' in strip_code(f.read_text()):
        fails.append(f"{f.name}: WebView found (forbidden)")

# 7. No Double money maths in main source (parse uses BigDecimal; formatting is integer)
for f in kt_files:
    if 'test' in str(f):
        continue
    code = strip_code(f.read_text())
    for pat in [r'\.toDouble\(\)', r'amount \* 100', r'/ 100\.0', r'\* 100\.0']:
        if re.search(pat, code):
            fails.append(f"{f.name}: Double money maths pattern: {pat}")

# 8. Every screen file referenced by a route exists in NavHost
for route in ["CASH_BOOK", "UPI_BOOK", "MONEY_TRANSFER", "SERVICE", "CUSTOMER_DETAIL",
              "KHATA", "AGENTS", "AGENT_DETAIL", "EXPENSES", "MAINTENANCE", "RECEIPTS",
              "DAILY_BUSINESS", "REPORTS", "CHATBOT", "DIFFERENCE_FINDER", "AUDIT_LOG", "RECYCLE_BIN",
              "CUSTOMIZATION", "SETTINGS", "LANGUAGE", "AUTH", "CATEGORY_PICK", "DASHBOARD", "SERVICES"]:
    if f"Routes.{route}" not in main_act:
        fails.append(f"MainActivity NavHost missing route Routes.{route}")

# 10. Chatbot wiring — FAB on Dashboard, drawer entry, NavHost, no hardcoded key
chatbot_screen = MAIN / "ui/chatbot/ChatbotScreen.kt"
chatbot_vm = MAIN / "ui/chatbot/ChatbotViewModel.kt"
if not chatbot_screen.exists():
    fails.append("ChatbotScreen.kt missing (ui/chatbot/)")
if not chatbot_vm.exists():
    fails.append("ChatbotViewModel.kt missing (ui/chatbot/)")
if "FloatingActionButton" not in main_act or "Routes.CHATBOT" not in main_act:
    fails.append("MainActivity missing chatbot FAB / Routes.CHATBOT wiring")
if main_act.count("Routes.CHATBOT") < 3:
    fails.append(f"MainActivity references Routes.CHATBOT only {main_act.count('Routes.CHATBOT')}x (need FAB + drawer + NavHost)")
for f in kt_files:
    if 'test' in str(f):
        continue
    # Raw text on purpose: strip_code() removes string literals, and a
    # hardcoded key would hide inside one.
    if "AIza" in f.read_text():
        fails.append(f"{f.name}: hardcoded AI key prefix found (never ship a key)")

# 11. UPDATE 12 — no third-party AI provider name in the app (user-visible
#     or otherwise), except the single model-identifier constant value in
#     AiFeatures.kt (code config, never shown in the UI). No "free tier"
#     wording anywhere in app source.
for f in kt_files:
    raw = f.read_text()
    low = raw.lower()
    if "gemini" in low and f.name not in ("AiFeatures.kt", "SettingsStore.kt"):
        # UPDATE 19: the model-value test in ConversationTest.kt may
        # name the constant's value (its assert lines mention AI_MODEL);
        # any other provider-named text there is still a violation.
        if f.name == "ConversationTest.kt":
            for line in raw.splitlines():
                if "gemini" in line.lower() and "AI_MODEL" not in line:
                    fails.append(f"ConversationTest.kt: provider name outside the AI_MODEL value test: {line.strip()[:80]}")
        else:
            fails.append(f"{f.name}: provider name 'gemini' still present (UPDATE 12)")
    if f.name == "AiFeatures.kt":
        for line in raw.splitlines():
            if "gemini" in line.lower() and "AI_MODEL" not in line:
                fails.append(f"AiFeatures.kt: provider name outside the AI_MODEL constant: {line.strip()[:80]}")
    if f.name == "SettingsStore.kt":
        # UPDATE 17 key migration: the ONLY allowed provider-named
        # text is the legacy storage key literal "gemini_api_key"
        # (LEGACY_AI_KEY constant + its doc comment) — the old
        # DataStore key a key entered early was stored under. Any
        # other provider-named text here is still a violation.
        for line in raw.splitlines():
            if "gemini" in line.lower() and "gemini_api_key" not in line:
                fails.append(f"SettingsStore.kt: provider name outside the legacy-key migration: {line.strip()[:80]}")
    if "free tier" in low or "free-tier" in low:
        fails.append(f"{f.name}: 'free tier' wording still present (UPDATE 12)")
    if "http 404" in low or "http_code" in low:
        fails.append(f"{f.name}: technical provider error text still present (UPDATE 12)")
    if "GeminiChatbotClient" in raw:
        fails.append(f"{f.name}: old provider-named client still referenced (use CloudAiClient)")

# 12. AI Assistant files + wiring (UPDATE 9/10/11).
ai_files = {
    "domain/AiAssistant.kt": "parser + structured actions",
    "domain/BusinessKnowledge.kt": "knowledge engine + app help + navigation",
    "domain/CloudAiClient.kt": "provider-neutral cloud client",
    "data/ChatHistoryStore.kt": "per-profile chat history",
    "ui/chatbot/VoiceInput.kt": "SpeechRecognizer voice input",
    "ui/chatbot/ChatbotViewModel.kt": "12-step execution ViewModel",
    "ui/chatbot/ChatbotScreen.kt": "assistant screen",
}
for rel, what in ai_files.items():
    if not (MAIN / rel).exists():
        fails.append(f"AI file missing: {rel} ({what})")
if (MAIN / "domain/GeminiChatbot.kt").exists():
    fails.append("domain/GeminiChatbot.kt still exists (renamed to CloudAiClient.kt)")
for f in kt_files:
    if 'test' in str(f):
        continue
    if "RECORD_AUDIO" in f.read_text() and False:
        pass
manifest = (BASE / "../AndroidManifest.xml").read_text() if (BASE / "../AndroidManifest.xml").exists() else ""
manifest_path = Path.home() / "workspace/al-falah-app/android/app/src/main/AndroidManifest.xml"
if "RECORD_AUDIO" not in manifest_path.read_text():
    fails.append("AndroidManifest.xml missing RECORD_AUDIO (voice input)")
screen = (MAIN / "ui/chatbot/ChatbotScreen.kt").read_text()
for needle in ["BizKhata AI Assistant", "Your Intelligent Business Assistant",
               "Confirm & Save", "VoiceInputHelper", "New Chat"]:
    if needle not in screen:
        fails.append(f"ChatbotScreen.kt missing: {needle!r}")
if "AI key" not in (MAIN / "ui/settings/SettingsScreen.kt").read_text():
    fails.append("SettingsScreen.kt missing neutral 'AI key' label (UPDATE 12)")
vm = (MAIN / "ui/chatbot/ChatbotViewModel.kt").read_text()
for needle in ["executeAiAction", "KnowledgeSnapshot", "pendingAction",
               "navigationEvents", "ChatHistoryStore", "CloudAiClient"]:
    if needle not in vm:
        fails.append(f"ChatbotViewModel.kt missing: {needle!r}")
if "GeminiChatbotClient" in vm or "geminiApiKey" in vm:
    fails.append("ChatbotViewModel.kt still uses provider-named client/key")
repo = (MAIN / "data/repository/Repositories.kt").read_text()
for needle in ["executeAiAction", "AiExecuteResult", "alreadyExecuted",
               "possibleDuplicateDailyEntry", "addDailyEntry"]:
    if needle not in repo:
        fails.append(f"Repositories.kt missing AI executor piece: {needle!r}")
# Entry points: assistant reachable from Dashboard (FAB), drawer,
# Daily Business, Money Transfer, Services, ServiceJobs.
for needle, where in [
    ("Routes.CHATBOT", "MainActivity"),
    ("onOpenAssistant", "MainActivity"),
    ("Routes.CHATBOT", "DailyBusinessScreen"),
    ("onOpenAssistant", "MoneyTransferScreen"),
    ("onOpenAssistant", "ServicesScreen"),
]:
    fname = {"MainActivity": MAIN / "MainActivity.kt",
             "DailyBusinessScreen": MAIN / "ui/dailybusiness/DailyBusinessScreen.kt",
             "MoneyTransferScreen": MAIN / "ui/moneytransfer/MoneyTransferScreen.kt",
             "ServicesScreen": MAIN / "ui/services/ServicesScreen.kt"}[where]
    if needle not in fname.read_text():
        fails.append(f"{where} missing assistant entry point {needle!r}")
# AI test suite + Python mirror.
if not (TEST / "AiAssistantTest.kt").exists():
    fails.append("AiAssistantTest.kt missing (dedicated AI test suite, UPDATE 11 §15)")
mirror = Path.home() / "workspace/al-falah-app/android/docs/ai_assistant_mirror.py"
if not mirror.exists():
    fails.append("docs/ai_assistant_mirror.py missing (JVM-free accuracy measurement)")


# 13. UPDATE 13 — multilingual AI (22 scheduled languages + English).
multi = MAIN / "domain/Multilingual.kt"
if not multi.exists():
    fails.append("domain/Multilingual.kt missing (UPDATE 13 language layer)")
else:
    multi_src = multi.read_text()
    # All 23 language codes + Hinglish + Unknown in the enum.
    for code in ["ENGLISH", "HINDI", "GUJARATI", "MARATHI", "BENGALI", "PUNJABI",
                "TAMIL", "TELUGU", "KANNADA", "MALAYALAM", "ODIA", "ASSAMESE",
                "URDU", "SANSKRIT", "KASHMIRI", "KONKANI", "NEPALI", "SINDHI",
                "MANIPURI", "BODO", "DOGRI", "MAITHILI", "SANTALI", "HINGLISH"]:
        if code not in multi_src:
            fails.append(f"Multilingual.kt missing AiLanguage.{code}")
    for needle in ["fun detectLanguage", "fun canonicalise", "fun asciiDigits",
                   "object MultilingualReplies", "romanVariants", "nativeTokens",
                   "numberWords", "detectionKeywords"]:
        if needle not in multi_src:
            fails.append(f"Multilingual.kt missing: {needle}")
    # Combining marks must be in the token regexes, or Indic words with
    # vowel signs (कैश, मिळाले, টাকা) never match any vocabulary key.
    if "\\p{M}" not in multi_src:
        fails.append("Multilingual.kt token regexes lack \\p{M} (combining marks)")
    # "pan" must never map to "bhi" — it is the PAN Card service.
    if '"pan" to "bhi"' in multi_src:
        fails.append("Multilingual.kt maps 'pan' to 'bhi' (destroys PAN Card)")
    # Reply templates: 15 languages x 12 keys, each present.
    template_langs = ["HINGLISH", "ENGLISH", "HINDI", "GUJARATI", "MARATHI",
                      "BENGALI", "PUNJABI", "TAMIL", "TELUGU", "KANNADA",
                      "MALAYALAM", "ODIA", "ASSAMESE", "URDU", "NEPALI"]
    template_keys = ["previewHeader", "totalLine", "askMode", "askService",
                     "askAmount", "askAgent", "askCustomer", "askCommission",
                     "askDirection", "refund", "kal", "cancelled"]
    for lang in template_langs:
        block = multi_src.split(f"AiLanguage.{lang} to mapOf(")
        if len(block) < 2:
            fails.append(f"MultilingualReplies missing template block for {lang}")
            continue
        seg = block[1].split("AiLanguage.")[0]
        for key in template_keys:
            if f'"{key}"' not in seg:
                fails.append(f"MultilingualReplies {lang} missing template key {key!r}")
ai_src = (MAIN / "domain/AiAssistant.kt").read_text()
for needle in ["Multilingual.canonicalise", "Multilingual.detectLanguage",
               "MultilingualReplies.get", "Multilingual.isAffirmative",
               "Multilingual.isNegative"]:
    if needle not in ai_src:
        fails.append(f"AiAssistant.kt not wired to language layer: {needle}")
if 'Regex("\\\\bupi\\\\b")' not in ai_src and "bupi" not in ai_src:
    fails.append("AiAssistant.kt detectMode still uses bare contains(\"upi\") — 'rupiya' fakes UPI")
if "lastLanguage" not in ai_src:
    fails.append("AiAssistant.kt AiConversationContext missing lastLanguage (UPDATE 13)")
if "jama kar" not in ai_src:
    fails.append("AiAssistant.kt missing collect-a-due (jama kar) branch (UPDATE 13)")
bk_src = (MAIN / "domain/BusinessKnowledge.kt").read_text()
if "AiAssistantParser.normalise(text)" not in bk_src:
    fails.append("BusinessKnowledge.parsePeriod does not normalise (multilingual periods, UPDATE 13)")
settings_store_src = (MAIN / "data/SettingsStore.kt").read_text()
for needle in ["aiLanguagePref", "setAiLanguagePref", "AI_LANGUAGE_PREF"]:
    if needle not in settings_store_src:
        fails.append(f"SettingsStore missing: {needle} (UPDATE 13 manual AI language)")
settings_screen_src = (MAIN / "ui/settings/SettingsScreen.kt").read_text()
for needle in ["AI Assistant Language", "showAiLanguage", "aiLanguagePref", "onAiLanguagePref"]:
    if needle not in settings_screen_src:
        fails.append(f"SettingsScreen missing: {needle} (UPDATE 13)")
if "aiLanguagePref" not in main_act:
    fails.append("MainActivity does not pass aiLanguagePref to SettingsScreen (UPDATE 13)")
voice_src = (MAIN / "ui/chatbot/VoiceInput.kt").read_text()
if "startListening(languageTag" not in voice_src:
    fails.append("VoiceInput.startListening does not take a language tag (UPDATE 13)")
if "voiceLanguageTag" not in (MAIN / "ui/chatbot/ChatbotViewModel.kt").read_text():
    fails.append("ChatbotViewModel missing voiceLanguageTag (UPDATE 13)")
if "voiceLanguageTag" not in (MAIN / "ui/chatbot/ChatbotScreen.kt").read_text():
    fails.append("ChatbotScreen does not use voiceLanguageTag for the mic (UPDATE 13)")
cloud_src = (MAIN / "domain/CloudAiClient.kt").read_text()
if "Indian language" not in cloud_src:
    fails.append("CloudAiClient prompts do not mention Indian languages (UPDATE 13)")
if not (TEST / "MultilingualAiTest.kt").exists():
    fails.append("MultilingualAiTest.kt missing (UPDATE 13 test suite)")
else:
    ml_test = (TEST / "MultilingualAiTest.kt").read_text()
    for needle in ["allLanguagesIncome", "detectionPerLanguage", "accuracySuite_reportsMeasuredAccuracyPerLanguage"]:
        if needle not in ml_test:
            fails.append(f"MultilingualAiTest.kt missing: {needle}")
mirror_src = mirror.read_text()
for needle in ["LANG_INCOME", "LANGUAGE-WISE ACCURACY", "detect_language", "canonicalise"]:
    if needle not in mirror_src:
        fails.append(f"ai_assistant_mirror.py missing multilingual piece: {needle}")


# 11. Daily Business hub checks
db_screen = MAIN / "ui/dailybusiness/DailyBusinessScreen.kt"
db_vm = MAIN / "ui/dailybusiness/DailyBusinessViewModel.kt"
if not db_screen.exists():
    fails.append("DailyBusinessScreen.kt missing (ui/dailybusiness/)")
if not db_vm.exists():
    fails.append("DailyBusinessViewModel.kt missing (ui/dailybusiness/)")
if "ReportsScreen" in main_act.split("Routes.DAILY_BUSINESS")[1].split("composable(")[0]:
    fails.append("MainActivity still routes DAILY_BUSINESS to ReportsScreen (must be DailyBusinessScreen)")
if "DailyBusinessScreen" not in main_act:
    fails.append("MainActivity does not wire DailyBusinessScreen")
if "DailyBusinessViewModel" not in main_act:
    fails.append("MainActivity does not wire DailyBusinessViewModel")
models_src = (MAIN / "domain/Models.kt").read_text()
for svc in ["PASSPORT_PHOTO", "SCANNING"]:
    if svc not in models_src:
        fails.append(f"ServiceType.{svc} missing from Models.kt")
daily_src = (MAIN / "domain/DailyBusiness.kt").read_text() if (MAIN / "domain/DailyBusiness.kt").exists() else ""
if not daily_src:
    fails.append("domain/DailyBusiness.kt missing")
for label in ["Xerox", "Money Transfer Commission", "Smart Card", "Passport Size Photo", "Printing", "Scanning", "Document Work"]:
    if label not in daily_src:
        fails.append(f"DailyBusiness summary missing service: {label}")
qe = re.search(r'val quickEntryServices[^=]*=\s*listOf\((.*?)\)', daily_src, re.S)
if not qe:
    fails.append("DailyBusiness.quickEntryServices list not found")
elif "MONEY_TRANSFER" in qe.group(1):
    fails.append("Money Transfer must NOT be a Quick Entry category (principal risk)")
if db_vm.exists():
    vm_src = db_vm.read_text()
    if "observeTransactions" not in vm_src:
        fails.append("DailyBusinessViewModel does not derive from observeTransactions (single source of truth)")
    if "INTERNAL_TRANSFER" not in vm_src:
        fails.append("DailyBusinessViewModel does not exclude INTERNAL_TRANSFER rows")
    if "computeDailyBusiness" not in vm_src:
        fails.append("DailyBusinessViewModel does not use AccountingEngine.computeDailyBusiness")
repo_src = (MAIN / "data/repository/Repositories.kt").read_text()
if "fun addDailyEntry" not in repo_src:
    fails.append("BusinessRepository.addDailyEntry missing")
else:
    daily_fn = repo_src.split("fun addDailyEntry")[1].split("\n    /** Add an expense")[0]
    if daily_fn.count('kind = "INCOME"') != 1:
        fails.append(f"addDailyEntry must write exactly one INCOME row, found {daily_fn.count(chr(34)+'INCOME'+chr(34))} income markers")
    if "runInTransaction" not in daily_fn:
        fails.append("addDailyEntry is not wrapped in runInTransaction")
cust_src = (MAIN / "ui/settings/CustomizationScreen.kt").read_text()
for term in ["customServices", "Add Your Own Service", "renameCustomService", "passport_photo", "scanning"]:
    if term not in cust_src:
        fails.append(f"CustomizationScreen missing: {term}")
settings_src = (MAIN / "data/SettingsStore.kt").read_text()
for term in ["customServices", "addCustomService", "renameCustomService", "removeCustomService"]:
    if term not in settings_src:
        fails.append(f"SettingsStore missing: {term}")
reports_src = (MAIN / "ui/reports/ReportsScreen.kt").read_text()
if '"Daily Business"' not in reports_src:
    fails.append("ReportsScreen missing Daily Business tab")
if "income - mtCommission" not in reports_src:
    fails.append("ReportsScreen still double-counts MT commission in profit")
dash_vm_src = (MAIN / "ui/dashboard/DashboardViewModel.kt").read_text()
if "income + mtPeriod" in dash_vm_src or "income + mtCommission" in dash_vm_src:
    fails.append("DashboardViewModel still double-counts MT commission in income")
services_src = (MAIN / "ui/services/ServicesScreen.kt").read_text()
for svc in ["PASSPORT_PHOTO", "SCANNING"]:
    if svc not in services_src:
        fails.append(f"ServicesScreen missing {svc} card")
if db_screen.exists():
    screen_src = db_screen.read_text()
    for term in ["Total Collection", "Cash Collection", "UPI Collection", "Net Earnings", "Total Transactions", "Recent Entries", "QuickDailyEntryDialog", "Direct Expense"]:
        if term not in screen_src:
            fails.append(f"DailyBusinessScreen missing: {term}")

# 14. UPDATE 14/15/16 — general + business AI assistant.
# The two screenshot bugs must stay fixed: (a) "Kaise Ho Bhai" (Hinglish
# greeting) answered in Marathi about no records; (b) "Mujhe kal PAN
# Card banane hai" (a plan) answered "PAN Card ke kitne rupaye hue?".
conv = MAIN / "domain/Conversation.kt"
if not conv.exists():
    fails.append("domain/Conversation.kt missing (UPDATE 14 casual/general engine)")
else:
    conv_src = conv.read_text()
    for needle in ["object ConversationEngine", "object MeaningParser",
                   "object ChecklistBuilder", "object ConversationMemory",
                   "object ConversationReplies", "object ConversationJokes",
                   "fun understand", "fun composeLocal", "fun isPlan",
                   "planVerbs", "fun generalAnswer", "fun honestLimitation",
                   "fun liveInfoLimitation", "fun tomorrowPlanGeneric"]:
        if needle not in conv_src:
            fails.append(f"Conversation.kt missing: {needle}")
    # The plan guard: a plan/statement must NEVER be answered with a
    # money question — the forced question must not appear anywhere in
    # the conversational engine.
    if "kitne rupaye hue" in conv_src:
        fails.append("Conversation.kt contains the forced money question 'kitne rupaye hue?' (UPDATE 15)")
cloud = (MAIN / "domain/CloudAiClient.kt").read_text()
for needle in ["suspend fun converse", "Latest message: ",
               "NEVER ask how much money was involved",
               "You never perform a financial action yourself"]:
    if needle not in cloud:
        fails.append(f"CloudAiClient.kt missing conversational-AI piece: {needle!r}")
vm_src = (MAIN / "ui/chatbot/ChatbotViewModel.kt").read_text()
for needle in ["handleConversational", "tryCloudConverse",
               "ConversationMemory.updateContext", "ConversationEngine.understand",
               "tomorrowPlan", "pendingJobsChecklist",
               "checklist: List<String>", "Conversation so far:"]:
    if needle not in vm_src:
        fails.append(f"ChatbotViewModel.kt missing conversational piece: {needle!r}")
if "AiParseResult.Conversational" not in vm_src:
    fails.append("ChatbotViewModel.kt does not handle AiParseResult.Conversational (UPDATE 14)")
ai_src = (MAIN / "domain/AiAssistant.kt").read_text()
for needle in ["data class Conversational", "runsCscCentre", "lastPlanTopic",
               "lastPlanDayEpoch", "ConversationEngine.understand"]:
    if needle not in ai_src:
        fails.append(f"AiAssistant.kt missing conversational piece: {needle!r}")
chatbot_src = (MAIN / "domain/Chatbot.kt").read_text()
if 'contains("bhai")' in chatbot_src:
    fails.append("Chatbot.kt still treats 'bhai' as a fund signal (UPDATE 14 screenshot bug)")
if "isPlanStatement" not in chatbot_src or "planStatementAnswer" not in chatbot_src:
    fails.append("Chatbot.kt missing plan-statement guard (UPDATE 15)")
multi_src = (MAIN / "domain/Multilingual.kt").read_text()
if '"bhai"' not in multi_src:
    fails.append("Multilingual.kt Hinglish detection keywords lack 'bhai' (UPDATE 14)")
if "hinglishMarkerCount >= 2" not in multi_src:
    fails.append("Multilingual.kt missing the Roman-Hinglish guard (UPDATE 14)")
bk_src = (MAIN / "domain/BusinessKnowledge.kt").read_text()
if "fun tomorrowPlan" not in bk_src:
    fails.append("BusinessKnowledge.kt missing tomorrowPlan (UPDATE 15)")
if "total hisab" not in bk_src:
    fails.append("BusinessKnowledge.kt summary does not cover 'total hisab' (UPDATE 14)")
if not (TEST / "ConversationTest.kt").exists():
    fails.append("ConversationTest.kt missing (UPDATE 14/15/16 acceptance suite)")
else:
    conv_test = (TEST / "ConversationTest.kt").read_text()
    for needle in ["screenshotBug_greetingAnsweredInMarathiAboutNoRecords",
                   "screenshotBug_planForcedIntoMoneyQuestion",
                   "update14_hiBhaiKaiseHo", "update14_funnyJoke",
                   "update14_panCardExplained", "update14_romanGujaratiWhatsGoingOn",
                   "update14_xeroxCashActionPreview", "update14_profitOnEmptyStoreIsZero",
                   "update14_cashBookHelpWithStepsAndDeepLink", "update14_boredSuggestSomething",
                   "update14_speakInGujarati", "update14_totalOnEmptyStoreIsZero",
                   "update15_planPanCardTomorrow", "update15_busyDayStatement",
                   "update15_businessIdea", "update15_howToBuildWebsite",
                   "update15_whatWorkTomorrow", "honestLimitationForLiveInfo",
                   "greetingVariesWithContext_noFixedReply",
                   "doIt_navigationExecutes", "doIt_checklistIsProduced",
                   "doIt_summaryIsRealFromLedgers",
                   "conversationAccuracySuite_reportsMeasuredAccuracy"]:
        if needle not in conv_test:
            fails.append(f"ConversationTest.kt missing: {needle}")
mirror_src = mirror.read_text()
for needle in ["u14-screenshot greeting", "u15-plan pan tomorrow",
               "u16-do-it navigation executes", "def understand", "def compose_local",
               "def respond", "def tomorrow_plan", "def _checklist_for",
               "SECTION ACCURACY (UPDATE 14/15/16"]:
    if needle not in mirror_src:
        fails.append(f"ai_assistant_mirror.py missing conversational piece: {needle!r}")
if 'def _no_money_q' not in mirror_src:
    fails.append("ai_assistant_mirror.py missing the no-money-question guard assertion (UPDATE 15)")

# 15. UPDATE 17 — real-time streaming + natural animated typing.
streaming = MAIN / "domain/Streaming.kt"
if not streaming.exists():
    fails.append("domain/Streaming.kt missing (UPDATE 17 streaming engine)")
else:
    stream_src = streaming.read_text()
    for needle in ["object GraphemeChunker", "fun graphemeClusters",
                   "fun displayChunks", "fun isLossless",
                   "object TypewriterLogic", "fun steps",
                   "class Typewriter", "fun feed", "fun markFinished",
                   "fun stop", "fun flush", "fun awaitCompletion",
                   "DEFAULT_WORDS_PER_SECOND", "MIN_WORDS_PER_SECOND",
                   "MAX_WORDS_PER_SECOND", "BreakIterator",
                   "sealed class StreamingError", "NoCloudConfigured",
                   "HttpStatus", "InvalidResponse",
                   "class SseParser", "sealed class SseEvent",
                   "[DONE]", "enum class GenerationState"]:
        if needle not in stream_src:
            fails.append(f"Streaming.kt missing: {needle}")
    if "local engine: typewriter display over locally generated text" not in stream_src:
        fails.append("Streaming.kt must label the local path honestly (typewriter display, no network stream)")
cloud_src = (MAIN / "domain/CloudAiClient.kt").read_text()
for needle in ["suspend fun converse", "fun converseStreaming", "fun hasCloudStream",
               "text/event-stream", "Flow<String>",
               "SseParser", "StreamingError", "ensureActive",
               "local engine: typewriter display over locally generated text"]:
    if needle not in cloud_src:
        fails.append(f"CloudAiClient.kt missing streaming piece: {needle!r}")
# UPDATE 19 — every cloud call is an OpenAI-style chat completion
# with "model" in the body; the native generateContent paths are gone.
for needle in ["openai/chat/completions", "CHAT_COMPLETIONS_URL",
               "Bearer", "chatBody", "extractMessageContent",
               "SseParser(\"content\")", "\"model\"",
               "stream\\\":true",
               "choices"]:
    if needle not in cloud_src:
        fails.append(f"CloudAiClient.kt missing UPDATE 19 piece: {needle!r}")
for dead in ["streamGenerateContent", ":generateContent", "X-goog-api-key",
             "gemini-2.0-flash", "\"contents\"", "\"parts\""]:
    if dead in cloud_src:
        fails.append(f"CloudAiClient.kt still contains retired native-call piece: {dead!r}")
ai_features_src = (MAIN / "domain/AiFeatures.kt").read_text()
if '"gemini-3.5-flash-lite"' not in ai_features_src:
    fails.append("AiFeatures.AI_MODEL is not gemini-3.5-flash-lite (UPDATE 19)")
for f in kt_files:
    if "gemini-2.0-flash" in f.read_text():
        fails.append(f"{f.name}: dead model gemini-2.0-flash still present (shut down June 1 2026, UPDATE 19)")
stream_src2 = (MAIN / "domain/Streaming.kt").read_text()
for needle in ["extractFirstContent", "extractFirstValue", "textKey"]:
    if needle not in stream_src2:
        fails.append(f"Streaming.kt missing UPDATE 19 piece: {needle}")
if "OkHttp" in cloud_src or "okhttp" in cloud_src:
    fails.append("CloudAiClient added OkHttp — use the existing HttpURLConnection (UPDATE 17)")
vm_src = (MAIN / "ui/chatbot/ChatbotViewModel.kt").read_text()
for needle in ["isThinking", "isStreaming", "canRetry", "lastUserMessage",
               "stopGeneration", "fun regenerate", "fun retryLast",
               "fun streamReply", "Typewriter", "onCleared",
               "migrateLegacyAiKey", "cloudConverseFlow", "GenerationState"]:
    if needle not in vm_src:
        fails.append(f"ChatbotViewModel.kt missing streaming piece: {needle!r}")
if "generationJob" not in vm_src or "cancelAndJoin" not in vm_src:
    fails.append("ChatbotViewModel.kt does not guard one active generation (cancelAndJoin)")
screen_src = (MAIN / "ui/chatbot/ChatbotScreen.kt").read_text()
for needle in ["BizKhata AI is thinking...", "ThinkingDots", "BlinkingCursor",
               "Stop Generating", "Regenerate", "Copy", "Retry",
               "MarkdownText", "markdownInline", "LocalClipboardManager",
               "lastBotMessage", "isThinking", "isStreaming"]:
    if needle not in screen_src:
        fails.append(f"ChatbotScreen.kt missing streaming piece: {needle!r}")
if "Jawab likh raha hai" in screen_src:
    fails.append("ChatbotScreen.kt still shows the old spinner text instead of the thinking indicator")
if "▍" not in screen_src:
    fails.append("ChatbotScreen.kt missing the blinking cursor glyph")
if not (TEST / "ConversationTest.kt").exists():
    fails.append("ConversationTest.kt missing")
else:
    stream_test = (TEST / "ConversationTest.kt").read_text()
    for needle in ["class StreamingTest", "chunkerGraphemeSafety_devanagari",
                   "chunkerGraphemeSafety_gujaratiAndTamil",
                   "chunkerGraphemeSafety_emojiZwjAndMixed",
                   "typewriterFinalEqualsSource_emptyShortLong",
                   "typewriterStopPreservesPrefix", "typewriterAppendWhileTyping",
                   "sseParser_splitLinesAndSplitUtf8", "sseParser_doneAndCancel",
                   "sseParser_contentKey_openAiStyleDeltas", "aiModelIsLiveStableFlash",
                   "typingSpeed_naturalBand", "streamingErrorsAreTyped"]:
        if needle not in stream_test:
            fails.append(f"ConversationTest.kt missing streaming test: {needle}")
mirror_src = mirror.read_text()
for needle in ["u17-chunker devanagari", "u17-typewriter final equals source",
               "u17-sse split lines", "u17-sse done", "u17-flow-14step",
               "u17-migration legacy key", "STREAMING TYPING SPEED",
               "u19-model is live stable flash", "u19-every cloud path sends model",
               "u19-sse content key deltas", "u19-nonstreaming content extraction",
               "def chat_body", "def extract_message_content",
               "AI_MODEL = \"gemini-3.5-flash-lite\"",
               "def grapheme_clusters", "def display_chunks",
               "class SseParser", "class TypewriterSim", "class GenerationSim",
               "def migrate_legacy_key", "def markdown_plain"]:
    if needle not in mirror_src:
        fails.append(f"ai_assistant_mirror.py missing streaming piece: {needle!r}")
# Key migration (UPDATE 17 check): the old Android storage key must
# exist as a LEGACY constant, the migration must copy it opaquely
# into the new key, and clearing must remove both.
settings_src = (MAIN / "data/SettingsStore.kt").read_text()
for needle in ["LEGACY_AI_KEY", "gemini_api_key", "fun migrateLegacyAiKey",
               "it.remove(LEGACY_AI_KEY)"]:
    if needle not in settings_src:
        fails.append(f"SettingsStore.kt missing key-migration piece: {needle!r}")
if "migrateLegacyAiKey" not in (MAIN / "MainActivity.kt").read_text():
    fails.append("MainActivity does not run migrateLegacyAiKey on launch (UPDATE 17)")
if "migrateLegacyAiKey" not in vm_src:
    fails.append("ChatbotViewModel does not run migrateLegacyAiKey before first aiKey read (UPDATE 17)")

# 16. UPDATE 18/25 — two-way voice conversation (Android only).
# STT is the native Android speech service (free, no key); the
# intelligence is the SAME conversational client as text chat
# (CloudAiClient.converse() via the shared pipeline) — voice builds
# no separate AI path and no separate intent logic. The user speaks
# in his own way: no rigid command grammar anywhere.
# UPDATE 25: spoken replies are the REAL AI voice (AiVoiceClient via
# the Interactions API, played with MediaPlayer). The phone/device
# voice is GONE — no TextToSpeech anywhere in the app, no speed/pitch
# settings, no silent fallback to it. The voice is rationed (10
# spoken replies/day, midnight Pacific reset) with a visible counter.
voice_conv = MAIN / "domain/VoiceConversation.kt"
if not voice_conv.exists():
    fails.append("domain/VoiceConversation.kt missing (UPDATE 18 voice logic)")
else:
    vc_src = voice_conv.read_text()
    for needle in ["enum class VoiceState", "data class VoiceSettings",
                   "sealed class VoiceDecision", "object VoiceInterrupt",
                   "fun stripInterruptPrefix", "object VoicePipeline",
                   "MIN_CONFIDENCE", "DUPLICATE_WINDOW_MS",
                   "object ContinuousMode", "shouldRestartAfterResult",
                   "shouldRestartAfterSpeech", "object VoiceText",
                   "fun speakable", "fun repeatPrompt",
                   "fun clarificationForMissing", "object VoiceNaturalPhrasing",
                   "fun understands", "isFinancialAction"]:
        if needle not in vc_src:
            fails.append(f"VoiceConversation.kt missing: {needle}")
    # No rigid-command wording: the voice flow must never demand a
    # fixed phrase from the user.
    for bad in ["say it exactly", "exact command", "fixed command",
                "speak like this", "you must say"]:
        if bad in vc_src.lower():
            fails.append(f"VoiceConversation.kt demands a fixed phrase: {bad!r}")
    # No provider name anywhere in the voice layer (UPDATE 12).
    if "gemini" in vc_src.lower():
        fails.append("VoiceConversation.kt names a provider (UPDATE 12)")
voice_out = MAIN / "ui/chatbot/VoiceOutput.kt"
if not voice_out.exists():
    fails.append("ui/chatbot/VoiceOutput.kt missing (UPDATE 25 AI-voice speaker)")
else:
    vo_src = voice_out.read_text()
    for needle in ["class VoiceSpeaker", "MediaPlayer", "fun playAudio",
                   "fun stop", "fun shutdown", "class VoiceTestPlayer",
                   "fun play", "fun release"]:
        if needle not in vo_src:
            fails.append(f"VoiceOutput.kt missing: {needle}")
    # UPDATE 25: the device voice is GONE — no TextToSpeech class,
    # no utterance listener, no speak/setLanguage/rate/pitch API.
    for bad in ["TextToSpeech", "UtteranceProgressListener", "QUEUE_FLUSH",
                "fun speak", "setLanguage", "speechRate", "speechPitch"]:
        if bad in vo_src:
            fails.append(f"VoiceOutput.kt still uses the device voice: {bad!r} (UPDATE 25)")
    if "gemini" in vo_src.lower():
        fails.append("VoiceOutput.kt names a provider (UPDATE 12)")
voice_in = MAIN / "ui/chatbot/VoiceInput.kt"
voice_in_src = voice_in.read_text()
for needle in ["SpeechRecognizer", "CONFIDENCE_SCORES", "onResultWithConfidence",
               "onPartial", "fun isListening", "ERROR_NO_MATCH",
               "ERROR_SPEECH_TIMEOUT", "isRecognitionAvailable"]:
    if needle not in voice_in_src:
        fails.append(f"VoiceInput.kt missing voice piece: {needle}")
# A bare service+amount fragment ("Xerox 300") must reach the
# clarification path, not Unknown (UPDATE 18 natural phrasing).
ai_src = (MAIN / "domain/AiAssistant.kt").read_text()
if "detectService(q) != null && mainAmount(q) != null &&" not in ai_src:
    fails.append("AiAssistant.kt bare-entry gate still requires a mode (UPDATE 18: 'Xerox 300' must clarify)")
settings_src = (MAIN / "data/SettingsStore.kt").read_text()
for needle in ["voiceResponsesEnabled", "setVoiceResponsesEnabled",
               "voiceName", "setVoiceName",
               "voiceUsedCount", "voiceUsedDate", "consumeVoiceReply",
               "voiceContinuousMode", "setVoiceContinuousMode"]:
    if needle not in settings_src:
        fails.append(f"SettingsStore missing voice setting: {needle}")
for bad in ["voiceSpeechRate", "setVoiceSpeechRate",
            "voiceSpeechPitch", "setVoiceSpeechPitch"]:
    if bad in settings_src:
        fails.append(f"SettingsStore still has the device-voice setting: {bad} (UPDATE 25)")
settings_screen_src = (MAIN / "ui/settings/SettingsScreen.kt").read_text()
for needle in ["Voice Assistant", "showVoice", "voiceResponsesEnabled",
               "onVoiceResponsesEnabled", "voiceName", "onVoiceName",
               "voiceUsedToday", "quotaLabel", "onVoiceTest", "Suno",
               "voiceContinuousMode", "onVoiceContinuousMode"]:
    if needle not in settings_screen_src:
        fails.append(f"SettingsScreen missing voice piece: {needle}")
for bad in ["voiceSpeechRate", "onVoiceSpeechRate", "Bolne ki speed"]:
    if bad in settings_screen_src:
        fails.append(f"SettingsScreen still has the device-voice UI: {bad} (UPDATE 25)")
if "gemini" in settings_screen_src.lower():
    fails.append("SettingsScreen voice section names a provider (UPDATE 12)")
if "voiceResponsesEnabled" not in (MAIN / "MainActivity.kt").read_text():
    fails.append("MainActivity does not wire voice settings to SettingsScreen (UPDATE 18)")
if "voiceName" not in (MAIN / "MainActivity.kt").read_text():
    fails.append("MainActivity does not wire the AI voice pick to SettingsScreen (UPDATE 25)")
vm_src = (MAIN / "ui/chatbot/ChatbotViewModel.kt").read_text()
for needle in ["onVoiceTranscript", "speakEvents", "stopSpeakingEvents",
               "voiceState", "voiceSessionActive", "interruptSpeaking",
               "stopVoiceSession", "setContinuousMode", "setVoiceResponsesEnabled",
               "setVoiceName", "voiceName", "voiceUsedToday",
               "testVoice", "voiceTestAudio", "voiceTestError",
               "maybeSpeak", "confirmPendingFromChat",
               "queuedVoiceTranscript", "VoiceSpeakRequest"]:
    if needle not in vm_src:
        fails.append(f"ChatbotViewModel.kt missing voice piece: {needle!r}")
for bad in ["setSpeechRate", "setSpeechPitch", "_speechRate", "_speechPitch"]:
    if bad in vm_src:
        fails.append(f"ChatbotViewModel.kt still has the device-voice API: {bad} (UPDATE 25)")
screen_src = (MAIN / "ui/chatbot/ChatbotScreen.kt").read_text()
for needle in ["VoiceSpeaker", "VoiceState", "onVoiceTranscript",
               "onResultWithConfidence", "Continuous: ON", "Voice replies: ON",
               "stopVoice", "startListening", "DisposableEffect",
               "Sun raha hoon", "Bol raha hoon", "playAudio", "quotaLabel"]:
    if needle not in screen_src:
        fails.append(f"ChatbotScreen.kt missing voice piece: {needle!r}")
for bad in ["speechRate", "speechPitch", "setLanguage"]:
    if bad in screen_src:
        fails.append(f"ChatbotScreen.kt still drives the device voice: {bad} (UPDATE 25)")
if "gemini" in screen_src.lower():
    fails.append("ChatbotScreen.kt names a provider (UPDATE 12)")
conv_test = (TEST / "ConversationTest.kt").read_text()
for needle in ["voice_verbatim_gujarati_roman_asks_mode_not_guesses",
               "voice_verbatim_mixed_amounts_asks_service",
               "voice_verbatim_agent_payment_asks_agent_name",
               "voice_verbatim_pan_plan_is_not_entry",
               "voice_verbatim_total_hisab_is_factual",
               "voice_verbatim_gujarati_profit_is_factual",
               "voice_fragment_xerox_300_cash_is_action",
               "voice_word_order_swap_is_action",
               "voice_low_confidence_asks_repeat_never_guesses",
               "voice_duplicate_transcript_ignored_once_only",
               "voice_interrupt_stops_speech_and_keeps_instruction",
               "voice_continuous_mode_restarts_only_when_active",
               "voice_no_rigid_grammar_fragments_understood"]:
    if needle not in conv_test:
        fails.append(f"ConversationTest.kt missing voice test: {needle}")
mirror_src = mirror.read_text()
for needle in ["u18-s1 normal voice conversation", "u18-s3 cash income by voice",
               "u18-s6 daily profit by voice", "u18-s7 open Cash Book by voice",
               "u18-s8 interrupt AI speech", "u18-s10 continuous mode multi-turn",
               "u18-s11 mic permission denial", "u18-s12 network failure",
               "u18-s13 ambiguous financial instruction",
               "u18-s14 duplicate prevention",
               "u18-natural-1 fragment", "u18-natural-5 verbatim",
               "VOICE LATENCY", "def voice_decide", "def voice_speakable",
               "class VoiceStore", "def voice_respond"]:
    if needle not in mirror_src:
        fails.append(f"ai_assistant_mirror.py missing voice piece: {needle!r}")

# 17. UPDATE 20/21/22 — video bugs, continuous conversation, app-change.
# BUG A: the do_checklist regex must accept the space-separated forms
# ("bana do", "bana de", ...), a bare "yes" with a pending offer must
# EXECUTE the checklist, and the "no pending entry" reply must only
# appear for a genuinely pending financial preview. BUG B: the chat
# header buttons must be visible on the purple bar (translucent white,
# not white-on-white). UPDATE 21: follow-ups resolve against the
# previous turn (pending question + pending offer + current topic).
# UPDATE 22: app-change requests show a spec, confirm, and queue a
# real saved development request — never claim the thing exists.
conv_src = (MAIN / "domain/Conversation.kt").read_text()
ai_src2 = (MAIN / "domain/AiAssistant.kt").read_text()
for needle in ["ACCEPT_OFFER", "OFFER_DECLINED", "APP_CHANGE"]:
    if needle not in conv_src:
        fails.append(f"Conversation.kt missing ConversationIntent.{needle} (UPDATE 20/22)")
for needle in ["PendingChecklistOffer", "PendingQuestion", "ActiveChecklist",
               "AppChangeRequest", "isOfferAcceptance", "correctedCount"]:
    if needle not in ai_src2:
        fails.append(f"AiAssistant.kt missing: {needle} (UPDATE 21/22)")
for needle in ["banaForms", "checklistRegex", "summaryRegex", "isChecklistRequest",
               "isDoItSummary", "resolveFollowUp", "planOfferPan", "planOfferCount",
               "pendingQuestionReask", "checklistSavedTail", "offerDeclined",
               "appChangeDeclined", "honestBareYes", "appChangeIntro",
               "appChangeCannotDeploy", "appChangeConfirmAsk", "appChangeQueued",
               "appChangeServiceAsk", "EXPLAINER_TOPICS", "EXPLAINER_MARKERS",
               "hasCommonWord", "documentsTopic",
               "countableTopics", "hasExplicitMoney", "titleFromColon",
               "AppChangeSpecBuilder", "fun specFor", "fun titleFrom",
               "fun nameFor", "fun stripEdges", "fun namedArea",
               "externalLimitTopic", "aadhaarSubmit", "buildEnglish",
               "documentsFor"]:
    if needle not in conv_src:
        fails.append(f"Conversation.kt missing: {needle} (UPDATE 20/21/22)")
# Website order (final re-read): app-change (1b) is classified BEFORE
# navigation (2d), and a topic follow-up keeps the offer/question while
# any other general question expires them.
_u = conv_src.split("fun understand")[1].split("fun resolveFollowUp")[0]
if _u.index("1b. App-change") > _u.index("5. Navigation"):
    fails.append("Conversation.kt understand() still checks navigation before app-change (website 1b beats 2d)")
for needle in ["pan_documents", "aadhaar_documents", "voter_documents",
               "ayushman_documents", "pending_question",
               "ConversationIntent.LANGUAGE_REQUEST ->",
               "ONLY the converted checklist"]:
    if needle not in conv_src:
        fails.append(f"Conversation.kt missing lifecycle piece: {needle} (website KEEP_OFFER/KEEP_QUESTION + checklist_translate)")
if "correctedPreviewAmount" not in ai_src2:
    fails.append("AiAssistant.kt missing correctedPreviewAmount (a 'Nahi, 500 the' correction must not cancel the entry)")
# The plan guard must use the explicit-money check: a bare number +
# service ("5 PAN Card") is a COUNT, not money.
if "hasExplicitMoney(q)" not in conv_src:
    fails.append("Conversation.kt isPlan does not use hasExplicitMoney (a count in a plan message becomes a financial action)")
# Aadhaar submission ("Mera Aadhaar update kar do") is an external
# action; a plan for tomorrow ("Aadhaar update karna hai") is not.
if "update kar do" not in conv_src or "update karo" not in conv_src:
    fails.append("Conversation.kt externalLimitTopic lacks the Aadhaar-submission pattern (UPDATE 22)")
# The help layer must have a REAL answer for every topic detectHelp
# can return — no placeholder "general" topic anywhere.
bk_src2 = (MAIN / "domain/BusinessKnowledge.kt").read_text()
for topic in ["cash_book", "upi_book", "add_customer", "agent_payment",
              "receipt", "daily_report", "change_profile", "new_service",
              "language", "difference_finder", "money_transfer",
              "expense", "maintenance", "backup"]:
    if f'"{topic}" to AppHelpTopic' not in bk_src2:
        fails.append(f"BusinessKnowledge.kt missing AppHelpTopic {topic!r} (a 'kaise' question would hit the placeholder)")
if '"general" to AppHelpTopic' in bk_src2:
    # The generic topic exists only as a last-resort entry; the
    # detectHelp else-branch must be null, never "general".
    pass
if "else -> \"general\"" in ai_src2:
    fails.append("AiAssistant.kt detectHelp still returns a placeholder 'general' topic (UPDATE 20)")
# Count + due + agent questions read the real ledgers (named customer /
# named agent trigger the answer, not just the word "customer"/"agent").
for needle in ["fun isCountQuestion", "fun countAnswer",
               "isCustomerQuestion(q, snap)", "isAgentQuestion(q, snap)"]:
    if needle not in bk_src2:
        fails.append(f"BusinessKnowledge.kt missing: {needle} (UPDATE 20/21)")
# A due record splits total + received (never sums them) and the
# received part is recorded through receivePayment with its mode.
if "receivedPaise" not in ai_src2 or "receivedMode" not in ai_src2:
    fails.append("AiAssistant.kt RecordCustomerDue lacks receivedPaise/receivedMode (total + received are summed into one payment)")
repo_src2 = (MAIN / "data/repository/Repositories.kt").read_text()
if "receivePayment(" not in repo_src2.split("executeAiCustomerDue")[1].split("private suspend fun executeAiDeleteTransaction")[0]:
    fails.append("Repositories.executeAiCustomerDue does not record the received part via receivePayment (UPDATE 21)")
# The chat history stores checklists + dev requests as structured
# records, not just text.
hist_src = (MAIN / "data/ChatHistoryStore.kt").read_text()
for needle in ["data class DevRequest", "checklist: List<String>",
               "checklistTopic: String?", "devRequest: DevRequest?"]:
    if needle not in hist_src:
        fails.append(f"ChatHistoryStore.kt missing: {needle} (UPDATE 21/22)")
# The ViewModel: pending-offer state for the contextual chip, context
# restore on reopen, service add + verify, app-change delivery, and the
# contextual suggestions (website suggestionsFor) + the navigation
# gate for app-change requests.
vm_src2 = (MAIN / "ui/chatbot/ChatbotViewModel.kt").read_text()
for needle in ["pendingOffer", "restoreContextFromHistory", "executeServiceAdd",
               "app_change_service", "app_change_queued", "ConversationIntent",
               "_suggestions", "suggestions", "Checklist bana do",
               "Documents bhi batao", "Documents bhi add karo",
               "English mein likho", "Haan, banao", "Aaj ka summary banao",
               "Aaj ka dhandha kitna hua?", "Kal ke kaam ki checklist banao",
               "meaning.intent != ConversationIntent.APP_CHANGE"]:
    if needle not in vm_src2:
        fails.append(f"ChatbotViewModel.kt missing: {needle} (UPDATE 20/21/22)")
if "fun confirmPending" not in vm_src2:
    fails.append("ChatbotViewModel.kt missing confirmPending (UPDATE 20 honest-confirm)")
# The header: a purple bar with translucent-white circular buttons
# (0.16 idle, 0.30 active), white icons, a close button, and the
# ViewModel-driven suggestion chips (starter set on a fresh chat,
# contextual after that) — no hard-coded chip, no static chips.
screen_src2 = (MAIN / "ui/chatbot/ChatbotScreen.kt").read_text()
for needle in ["BizColors.Purple", "HeaderCircleButton", "0.16f", "0.30f",
               "onClose", "vm.suggestions", "suggestions.forEach"]:
    if needle not in screen_src2:
        fails.append(f"ChatbotScreen.kt missing header piece: {needle!r} (BUG B / UPDATE 20)")
if "✓ Checklist banao" in screen_src2:
    fails.append("ChatbotScreen.kt still has the hard-coded pending-offer chip (chips come from the ViewModel now)")
if "BizColors.PurpleSoft" in screen_src2:
    fails.append("ChatbotScreen.kt still uses PurpleSoft for a header/input control (washed out in dark theme, BUG B)")
if "onClose" not in (MAIN / "MainActivity.kt").read_text():
    fails.append("MainActivity does not pass onClose to ChatbotScreen (BUG B close button)")
# Kotlin tests for the new behaviour (run in Android Studio — no JDK here).
conv_test2 = (TEST / "ConversationTest.kt").read_text()
for needle in ["videoSequence_exactFourMessages", "phrasings_checklistBanaDoForms",
               "bareNumberAnswersPendingCountQuestion", "correctionReplacesStoredCount",
               "documentsStayInTopic", "englishConversionPreservesChecklist",
               "checklistEditAddsDocuments", "showChecklistAgain",
               "doSummaryFormsReachRealSummary", "offerClearsOnTopicChange",
               "bareHaWithNoOfferIsNotChecklistOrAction",
               "appChange_aadhaarModuleSpecThenQueued",
               "appChange_addFieldModifyReportServiceCategory",
               "appChange_commaInServiceNamePreserved",
               "appChange_declineCancelsTheRequest",
               "appChange_quotedNameIsTheTitle",
               "appChange_calledAndForNameTheThing",
               "appChange_modifyNamedAreaIsNotNavigation",
               "appChange_locationIsNotAName",
               "appChange_bareAddServiceAndReportAndDashboard",
               "offerExpiresAfterAGeneralQuestion",
               "documentsFollowUpKeepsTheOffer",
               "translateChecklistClaimsNoLanguageSwitch",
               "explainerRouting_panAadhaarConversion",
               "mtPrincipalIsNotCommission", "dueTotalAndReceivedSplit",
               "countableServices_aadhaarVoterAyushman",
               "englishPlanAndShowMe", "denaHaiQuestionIsNotAPlan",
               "countInsidePlanMessageIsStillAPlan",
               "gibberishIsHonestLimitation",
               "uidaiPortalRequestIsExternalLimit",
               "aadhaarSubmissionIsExternalLimitButPlanIsNot",
               "serviceCountQuestionFromLedger", "class ThreadedChat"]:
    if needle not in conv_test2:
        fails.append(f"ConversationTest.kt missing UPDATE 20/21/22 test: {needle}")
# Mirror: the four new batches + the Session simulator + the fixes
# the arc testing forced (due split, MT commission in profit, customer
# and agent question branches, full help table).
mirror_src2 = mirror.read_text()
for needle in ["u21-followups: bare number answers",
               "u21-multiturn-long: canonical PAN arc",
               "u22-appchange: Aadhaar module request shows the spec",
               "u20-ambiguous-fail: confirm with no pending entry",
               "class Session", "def restore_context", "ARC_TRANSCRIPTS",
               "def _execute_service_add", "def _has_explicit_money",
               "def _title_from_colon", "_HELP_TOPICS",
               "def _execute_pending", "Money Transfer Commission",
               "ki history:", "Abhi payable (baaki)",
               "def _is_plan", "aadhaar_submit",
               "STARTER_CHIPS", "def _suggestions_for",
               "def _name_for", "def _strip_edges", "def _named_area",
               "u22-appchange: a quoted name is the title",
               "u22-appchange: modifying a named area",
               "u22-appchange: a location is not a name",
               "u21-followups: a general question expires",
               "u21-followups: a documents follow-up keeps the offer",
               "u21-followups: translating the checklist claims no language switch",
               "u20-header: a fresh chat shows the website's three starter chips",
               "u20-header: a plan reply earns the checklist"]:
    if needle not in mirror_src2:
        fails.append(f"ai_assistant_mirror.py missing UPDATE 20/21/22 piece: {needle!r}")
for prefix in ["u21-followups", "u21-multiturn-long", "u22-appchange",
               "u20-ambiguous-fail"]:
    if mirror_src2.count(f"@t(\"{prefix}") < 10:
        fails.append(f"ai_assistant_mirror.py has fewer than 10 {prefix} tests (need 15/15/15/15)")
if "FULL 10-15 MESSAGE ARC" not in mirror_src2:
    fails.append("ai_assistant_mirror.py does not print a full 10-15 message arc transcript (UPDATE 21 report requirement)")

# 15. UPDATE 24 — login/account mirror (website fix mirrored to Android).
# Owner report 2026-11-27: "Login Save Nahi Rehta, Ek Number Se Kai
# Account Bana Rahe Hai" / "Kal Account Banaya Tha, Aaj No Account
# Found Bata Rha Hai". Website bugs checked against Android:
# (1) setPin blindly overwrote the owner -> now refuses when a PIN
# exists; (2) no mobile normalisation (+91 truncated to a wrong
# number by take(10)) -> AuthUtils.normalizeMobile everywhere;
# (5) no Forgot PIN at all -> resetPin + Forgot PIN screen.
# (3) persistence and (6) data preservation differ / were already
# correct on Android (DataStore, no session/token; auth never touches
# Room) — no code to check, documented in SettingsStore.
auth_utils = MAIN / "domain/AuthUtils.kt"
if not auth_utils.exists():
    fails.append("domain/AuthUtils.kt missing (UPDATE 24 normalisation + hash)")
else:
    au_src = auth_utils.read_text()
    for needle in ["fun normalizeMobile", "takeLast(10)", "fun hashPin", "fun maskMobile"]:
        if needle not in au_src:
            fails.append(f"AuthUtils.kt missing: {needle}")
settings_store_src = (MAIN / "data/SettingsStore.kt").read_text()
for needle in ["fun setPin(mobileNumber: String, pin: String): Boolean",
               "fun resetPin(mobileNumber: String, pin: String): Boolean",
               "AuthUtils.normalizeMobile", "AuthUtils.hashPin"]:
    if needle not in settings_store_src:
        fails.append(f"SettingsStore missing: {needle} (UPDATE 24)")
if "it[MOBILE] = mobileNumber.trim()" in settings_store_src:
    fails.append("SettingsStore still stores the mobile raw (must normalise, UPDATE 24)")
if 'getInstance("SHA-256")' in settings_store_src:
    fails.append("SettingsStore still hashes the PIN inline (must use AuthUtils.hashPin, UPDATE 24)")
auth_src = (MAIN / "ui/auth/AuthScreen.kt").read_text()
for needle in ["Forgot PIN", "onResetPin", "hasExistingData",
               "Is number par account pehle se hai", "take(12)",
               "Is device par aapka business data pehle se hai"]:
    if needle not in auth_src:
        fails.append(f"AuthScreen missing: {needle!r} (UPDATE 24)")
if ".take(10)" in auth_src:
    fails.append("AuthScreen still truncates the mobile field with take(10) (mangles +91 numbers, UPDATE 24)")
if "clear the app data (this erases local data" in auth_src:
    fails.append("AuthScreen still tells forgot-PIN users to clear app data (UPDATE 24 reset replaces this)")
for needle in ["onResetPin", "hasExistingData",
               "Is number par account pehle se hai — login karo ya Forgot PIN use karo",
               "Number account wale number se match nahi karta"]:
    if needle not in main_act:
        fails.append(f"MainActivity missing: {needle!r} (UPDATE 24)")
if not (TEST / "AuthUtilsTest.kt").exists():
    fails.append("AuthUtilsTest.kt missing (UPDATE 24 test suite)")
else:
    au_test = (TEST / "AuthUtilsTest.kt").read_text()
    for needle in ["plus91WithSpacesAndDashes_sameNumber", "leadingZero_sameNumber",
                   "tenDigitsStartingWith91_notStripped", "hashPin_isDeterministicSha256Hex"]:
        if needle not in au_test:
            fails.append(f"AuthUtilsTest.kt missing: {needle}")


# 18. UPDATE 23 — context-aware delete (the 2026-11-27 16:02–16:04 IST
# live bug: "Isko Remove Kardo" → fake "hata diya", then the verified
# ₹600 save denied, then a false "chat can't delete"). The website
# root cause was a delete gated on an amount in the same message with
# no "isko" resolution; the Android mirror must have the same five
# behaviours: pronoun delete resolves to the last VERIFIED save,
# bare delete lists recent candidates (never a cloud fall-through),
# the cloud never claims a financial action (deterministic guard +
# prompt hardening), the contradiction guard grounds on the verified
# save, and the add flow / checklist / "Ha" / module behaviour is kept.
ai_src3 = (MAIN / "domain/AiAssistant.kt").read_text()
for needle in ["LastSavedEntry", "lastSavedEntry", "isDeleteIntent",
               "isPronounReference", "parseDelete", "\"delete target\"",
               "fun lastSavedFacts"]:
    if needle not in ai_src3:
        fails.append(f"AiAssistant.kt missing: {needle} (UPDATE 23 context-aware delete)")
if "isDeleteIntent(q)" not in ai_src3.split("private fun isFactualQuestion")[1].split("private fun detectHelp")[0]:
    fails.append("AiAssistant.kt isFactualQuestion does not guard delete intents (UPDATE 23: 'Hatana hai?' must reach the delete path)")
conv_src3 = (MAIN / "domain/Conversation.kt").read_text()
if "AiAssistantParser.isDeleteIntent(q)" not in conv_src3:
    fails.append("Conversation.kt understand() does not classify delete intent before casual/statement (UPDATE 23: 'Hatana hai' would be a statement, 'Isko remove kardo' unknown)")
_u23 = conv_src3.split("fun understand")[1].split("fun resolveFollowUp")[0]
if "2c. UPDATE 23" not in _u23 or _u23.index("2c. UPDATE 23") < _u23.index("2b. UPDATE 21"):
    fails.append("Conversation.kt delete step (2c) is missing or not after the follow-up step (UPDATE 23)")
cloud_src = (MAIN / "domain/CloudAiClient.kt").read_text()
for needle in ["containsFinancialActionClaim", "guardCloudReply",
               "NEVER claim that you saved, deleted, corrected or refunded"]:
    if needle not in cloud_src:
        fails.append(f"CloudAiClient.kt missing: {needle} (UPDATE 23 cloud-never-claims guard)")
vm_src3 = (MAIN / "ui/chatbot/ChatbotViewModel.kt").read_text()
for needle in ["resolveBareDelete", "lastSavedEntry", "guardDeliveredCloudReply",
               "lastSavedFactsForCloud", "\"delete target\""]:
    if needle not in vm_src3:
        fails.append(f"ChatbotViewModel.kt missing: {needle} (UPDATE 23 delete mirror)")
if "DeleteTransaction ->" not in vm_src3.split("private fun updateContextFrom")[1].split("private fun tryCompleteClarification")[0]:
    fails.append("ChatbotViewModel.updateContextFrom does not clear lastSavedEntry on delete (UPDATE 23: 'isko' would resolve to a deleted entry)")
conv_test3 = (TEST / "ConversationTest.kt").read_text()
for needle in ["deleteIntent_hatanaHaiIsBusinessActionNotStatement",
               "deletePronoun_resolvesToLastSavedEntry",
               "deletePronoun_exact4pmWordingResolves",
               "deletePronoun_withoutSavedEntryIsBareClarification",
               "deleteBare_hatanaHaiIsClarificationNotCloud",
               "deleteAmountForm_stillResolvesByAmount",
               "deleteIntent_doesNotBecomeFactualQuestion",
               "deleteIntent_wordFormsRecognised",
               "cloudGuard_claimsAreCaughtAndCleanRepliesPass",
               "cloudGuard_replacementIsHonestAndGroundsTheSave",
               "lastSavedFacts_groundVerifiedSave",
               "correctionStillWorksAfterDeleteFix"]:
    if needle not in conv_test3:
        fails.append(f"ConversationTest.kt missing UPDATE 23 test: {needle}")
mirror_src3 = mirror.read_text()
for needle in ["def _is_delete_intent", "def _is_pronoun_ref",
               "def _parse_delete", "def cloud_claim_guard",
               "def last_saved_facts", "def _resolve_bare_delete",
               "def _resolve_correction", "\"delete target\"",
               "u23-delete: exact 4pm sequence",
               "u23-delete: bare delete lists recent candidates",
               "u23-delete: amount-form delete still works",
               "u23-delete: two same-amount entries are disambiguated",
               "u23-delete: non-existent amount is an honest error",
               "u23-delete: correction still works",
               "u23-delete: no contradiction after a verified save",
               "u23-delete: cloud guard catches fabricated claims",
               "u23-delete: parser-level"]:
    if needle not in mirror_src3:
        fails.append(f"ai_assistant_mirror.py missing UPDATE 23 piece: {needle!r}")
if mirror_src3.count("@t(\"u23-delete") < 10:
    fails.append("ai_assistant_mirror.py has fewer than 10 u23-delete tests")

# 19. UPDATE 25 — real AI voice + chat understanding (Android mirror
#     of the website fix). Same caps as the website: 10 spoken
#     replies/day, midnight Pacific reset, first ~2 sentences / 400
#     chars, Kore default, no device voice anywhere.
ai_voice = MAIN / "domain/AiVoice.kt"
ai_voice_client = MAIN / "domain/AiVoiceClient.kt"
if not ai_voice.exists():
    fails.append("domain/AiVoice.kt missing (UPDATE 25 AI-voice config + text)")
else:
    av_src = ai_voice.read_text()
    for needle in ["DAILY_LIMIT = 10", "SPOKEN_CAP_CHARS = 400",
                   "MIN_GAP_MS", "INTERACTIONS_URL", "DEFAULT_VOICE",
                   "VOICES", "fun pacificDay", "fun isNewDay",
                   "fun quotaLabel", "object AiVoiceText",
                   "fun shortenForVoice", "fun quotaFinishedLine",
                   "fun noKeyLine", "object AiVoiceRequest",
                   "fun buildJson", "fun extractAudioBase64"]:
        if needle not in av_src:
            fails.append(f"AiVoice.kt missing: {needle}")
    for bad in ["TextToSpeech", "free tier"]:
        if bad in av_src:
            fails.append(f"AiVoice.kt still mentions the device voice / free tier: {bad!r} (UPDATE 25)")
    if "gemini" in av_src.lower():
        fails.append("AiVoice.kt names a provider outside the model constant (UPDATE 12)")
if not ai_voice_client.exists():
    fails.append("domain/AiVoiceClient.kt missing (UPDATE 25 Interactions-API client)")
else:
    avc_src = ai_voice_client.read_text()
    for needle in ["class AiVoiceClient", "fun speak", "x-goog-api-key",
                   "AiVoiceResult", "INTERACTIONS_URL"]:
        if needle not in avc_src:
            fails.append(f"AiVoiceClient.kt missing: {needle}")
    if "TextToSpeech" in avc_src or "gemini" in avc_src.lower():
        fails.append("AiVoiceClient.kt names the device voice / a provider (UPDATE 12/25)")
ai_features_src = (MAIN / "domain/AiFeatures.kt").read_text()
if "AI_MODEL_VOICE" not in ai_features_src:
    fails.append("AiFeatures.kt missing AI_MODEL_VOICE (UPDATE 25 speech model)")
# STT thresholds, unified with the website (0.5 / 5 s).
vc25_src = voice_conv.read_text()
for needle in ["MIN_CONFIDENCE = 0.5f", "DUPLICATE_WINDOW_MS = 5000L"]:
    if needle not in vc25_src:
        fails.append(f"VoiceConversation.kt STT threshold changed: {needle} (UPDATE 25)")
# Parser / conversation fixes C-1..C-18.
ai25_src = (MAIN / "domain/AiAssistant.kt").read_text()
for needle in ["fun correctionPair", "fun stripLeadingYes",
               "fun isKeyStatusMessage", "fun ordinalIndex",
               "val dayEpoch: Long? = null"]:
    if needle not in ai25_src:
        fails.append(f"AiAssistant.kt missing UPDATE 25 piece: {needle}")
if "entry.dayEpoch ?: action.dayEpoch" not in (MAIN / "data/repository/Repositories.kt").read_text():
    fails.append("Repositories.kt does not save multi-date entries on their own day (UPDATE 25 C-11)")
conv25_src = (MAIN / "domain/Conversation.kt").read_text()
for needle in ["TRANSLATE_REPLY", "fun languageRequestForm",
               "gk_capital", "fun gkCapitalAnswer"]:
    if needle not in conv25_src:
        fails.append(f"Conversation.kt missing UPDATE 25 piece: {needle}")
for bad in ["ask me for the module and I will make a spec",
            "module request karo to main spec bana"]:
    if bad in conv25_src:
        fails.append(f"Conversation.kt still carries the proactive module suggestion: {bad!r} (UPDATE 25 C-6)")
if '"dhadhe" to "dhandha"' not in (MAIN / "domain/Multilingual.kt").read_text():
    fails.append("Multilingual.kt missing the 'dhadhe' spelling (UPDATE 25 C-8)")
if "fun isWrongLanguage" not in (MAIN / "domain/CloudAiClient.kt").read_text():
    fails.append("CloudAiClient.kt missing isWrongLanguage (UPDATE 25 C-15)")
# Kotlin acceptance suite.
u25_test = TEST / "Update25Test.kt"
if not u25_test.exists():
    fails.append("Update25Test.kt missing (UPDATE 25 acceptance suite)")
else:
    u25_src = u25_test.read_text()
    for needle in ["c1_followUpAmountMergesIntoPendingPreview",
                   "c2_yesPlusEntryNotSwallowed",
                   "c3_correctionPicksRightNumber",
                   "c4_numberWordsRoute",
                   "c5_greetingDoesNotHijackProfitQuestion",
                   "c6_noProactiveModuleSuggestionButExplicitRequestStillSpecs",
                   "c7_keyStatusUnderstood",
                   "c8_howToAddDhadhe",
                   "c9_localGeneralKnowledgeCapital",
                   "c10_internalTransferBothDirections",
                   "c11_multiDateEntriesKeepTheirOwnDay",
                   "c12_dueSplitReceivedPlusDueEqualsTotal",
                   "c13_translateVsSwitch",
                   "c14_hinglishMarkersAndLowConfidenceFallback",
                   "c15_cloudReplyLanguageChecked",
                   "c17_typedInterruptPrefix",
                   "c18_ordinalDeletePicksShownOrder",
                   "voiceCap_dailyLimitIs10",
                   "voiceShorten_longReplySpeaksFirstTwoSentencesOnly",
                   "voiceQuota_pacificDayResetsAtMidnightPacific",
                   "regression_deletePronounStillResolvesToLastSaved"]:
        if needle not in u25_src:
            fails.append(f"Update25Test.kt missing test: {needle}")
# Python mirror batch.
mirror_src25 = mirror.read_text()
for needle in ["def correction_pair", "def strip_leading_yes",
               "def is_key_status_message", "def ordinal_index",
               "def shorten_for_voice", "def build_voice_json",
               "def extract_audio_base64", "def pacific_day",
               "def is_wrong_language", "def strip_interrupt_prefix",
               "TRANSLATE_REPLY", "gk_capital",
               "AI_VOICE_DAILY_LIMIT = 10",
               "u25-c1: follow-up merges",
               "u25-c2: 'Ha aur 200 UPI bhi add kar do'",
               "u25-c3: correction picks the right number",
               "u25-c5: greeting must not hijack",
               "u25-c6: no proactive module suggestion",
               "u25-c11: multi-date entries keep their own day",
               "u25-c12: due split",
               "u25-c13: 'likho' translates one reply",
               "u25-c17: typed interrupt",
               "u25-c18: ordinal delete picks the shown order"]:
    if needle not in mirror_src25:
        fails.append(f"ai_assistant_mirror.py missing UPDATE 25 piece: {needle!r}")
if mirror_src25.count("@t(\"u25-") < 20:
    fails.append("ai_assistant_mirror.py has fewer than 20 u25- tests")
for bad in ["ask me for the module and I will make a spec",
            "module request karo to main spec bana"]:
    if bad in mirror_src25:
        fails.append(f"ai_assistant_mirror.py still carries the proactive module suggestion: {bad!r} (UPDATE 25 C-6)")

# 9. Python mirror of AccountingEngine — run the unit-test cases
def customer_due(total, received): return max(total - received, 0)
def agent_payable(charges, paid): return max(charges - paid, 0)
def mt_profit(comm, charges, exp): return comm - charges - exp
def mt_closing(start, recv, sent, exp): return start + recv - sent - exp
def internal_transfer(amount, frm):
    return (-amount, amount) if frm == "CASH" else (amount, -amount)
def service_profit(recv, exp, charges): return recv - exp - charges
def net_profit(inc, mt, exp): return inc + mt - exp
def find_diff(expected, recorded): return expected - recorded
def quick_total(qty, rate): return qty * rate
def daily_totals(income, expenses, mt_profit, mt_comm_in_income):
    # income/expenses: list of (amount_paise, mode); mirrors computeDailyBusiness
    total = sum(a for a, _ in income)
    cash = sum(a for a, m in income if m == "CASH")
    upi = sum(a for a, m in income if m == "UPI")
    exp = sum(a for a, _ in expenses)
    net = (total - mt_comm_in_income) + mt_profit - exp
    return total, cash, upi, exp, net, len(income) + len(expenses)

cases = [
    ("bill500/recv200 -> due300", customer_due(50_000, 20_000) == 30_000),
    ("due/payable separate", customer_due(50_000, 0) == 50_000 and agent_payable(30_000, 0) == 30_000),
    ("MT profit commission only", mt_profit(5_000, 0, 0) == 5_000 and mt_profit(5_000, 1_000, 0) == 4_000),
    ("cash->upi 1000 internal", internal_transfer(100_000, "CASH") == (-100_000, 100_000) and net_profit(0, 0, 0) == 0),
    ("service profit 3-arg", service_profit(50_000, 10_000, 0) == 40_000),
    ("agent example 500/250/150", agent_payable(25_000, 15_000) == 10_000 and service_profit(50_000, 0, 25_000) == 25_000),
    ("MT closing 50050", mt_closing(0, 50_000_00 + 10_050_00, 10_000_00, 0) == 50_050_00 and mt_closing(0, 0, 0, 0) == 0),
    ("difference 500", find_diff(100_000, 99_500) == 500 and find_diff(100_000, 100_000) == 0),
    # --- Daily Business integration (single source of truth) ---
    # One job payment row (Xerox ₹200 cash, from a module) appears exactly
    # once in Daily Business: collection ₹200, 1 transaction.
    ("daily: module job payment appears once", daily_totals([(20_000, "CASH")], [], 0, 0) == (20_000, 20_000, 0, 0, 20_000, 1)),
    # MT ₹10,000 principal + ₹50 commission: only the ₹50 commission row
    # exists in the books, so Daily Business income is ₹50, never ₹10,000.
    ("daily: MT 10000/50 -> income 50 only", daily_totals([(5_000, "UPI")], [], mt_profit(5_000, 0, 0), 5_000) == (5_000, 0, 5_000, 0, 5_000, 1)),
    # Bill ₹500 / received ₹200: collection ₹200, due ₹300 (due is not a row).
    ("daily: bill500/recv200 -> collection 200 due 300", daily_totals([(20_000, "CASH")], [], 0, 0)[0] == 20_000 and customer_due(50_000, 20_000) == 30_000),
    # Quick entry: 10 xerox copies @ ₹2 = ₹20; cash ₹200 + UPI ₹300 - ₹100 exp = net ₹400.
    ("daily: quick total 10x200=2000", quick_total(10, 200) == 2_000),
    ("daily: cash200+upi300-exp100 net400", daily_totals([(20_000, "CASH"), (30_000, "UPI")], [(10_000, "CASH")], 0, 0) == (50_000, 20_000, 30_000, 10_000, 40_000, 3)),
    # Empty day is all zero (app starts empty, no demo numbers).
    ("daily: empty day is zero", daily_totals([], [], 0, 0) == (0, 0, 0, 0, 0, 0)),
]
for name, ok in cases:
    print(("PASS " if ok else "FAIL ") + name)
    if not ok:
        fails.append(f"AccountingEngine mirror case failed: {name}")

print(f"\nDefined project types: {len(defined)} | top-level fns: {len(defined_fns)}")
print(f"Routes defined: {sorted(route_names)}")
if warns:
    print("WARNINGS:"); [print(" -", w) for w in warns]
if fails:
    print(f"\nFAILURES ({len(fails)}):"); [print(" -", x) for x in fails]
    sys.exit(1)
print("\nALL JVM-FREE CHECKS PASSED")
