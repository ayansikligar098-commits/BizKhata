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
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    text = re.sub(r'"(?:\\.|[^"\\])*"', '""', text)
    text = re.sub(r"'(?:\\.|[^'\\])*'", "''", text)
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
    if "gemini" in low and f.name != "AiFeatures.kt":
        fails.append(f"{f.name}: provider name 'gemini' still present (UPDATE 12)")
    if f.name == "AiFeatures.kt":
        for line in raw.splitlines():
            if "gemini" in line.lower() and "AI_MODEL" not in line:
                fails.append(f"AiFeatures.kt: provider name outside the AI_MODEL constant: {line.strip()[:80]}")
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
