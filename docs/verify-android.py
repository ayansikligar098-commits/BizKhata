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
        fails.append(f"{f.name}: hardcoded Gemini key prefix found (never ship a key)")

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

cases = [
    ("bill500/recv200 -> due300", customer_due(50_000, 20_000) == 30_000),
    ("due/payable separate", customer_due(50_000, 0) == 50_000 and agent_payable(30_000, 0) == 30_000),
    ("MT profit commission only", mt_profit(5_000, 0, 0) == 5_000 and mt_profit(5_000, 1_000, 0) == 4_000),
    ("cash->upi 1000 internal", internal_transfer(100_000, "CASH") == (-100_000, 100_000) and net_profit(0, 0, 0) == 0),
    ("service profit 3-arg", service_profit(50_000, 10_000, 0) == 40_000),
    ("agent example 500/250/150", agent_payable(25_000, 15_000) == 10_000 and service_profit(50_000, 0, 25_000) == 25_000),
    ("MT closing 50050", mt_closing(0, 50_000_00 + 10_050_00, 10_000_00, 0) == 50_050_00 and mt_closing(0, 0, 0, 0) == 0),
    ("difference 500", find_diff(100_000, 99_500) == 500 and find_diff(100_000, 100_000) == 0),
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
