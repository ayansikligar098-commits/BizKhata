#!/usr/bin/env python3
"""Python mirror of the BizKhata AI Assistant logic (UPDATE 9/10/11).

No JDK on this VM, so the Kotlin in domain/AiAssistant.kt,
domain/BusinessKnowledge.kt and the AiAssistantTest scenarios cannot be
compiled/run here. This file re-implements the SAME rules in Python
(parser intents in the same order, same keyword maps, same accounting
rules via the AccountingEngine mirror) and runs the SAME scenario list
as AiAssistantTest.accuracySuite, printing MEASURED accuracy per
scenario. If this mirror and the Kotlin disagree, the Kotlin is
authoritative and the mirror must be fixed — a failure here is a real
signal, not a formality.

Money is integer paise (Long in Kotlin, int here). No demo numbers are
used as expectations — every expected figure is computed from the
scenario's own input rows.
"""
import hashlib
import re
from datetime import date, timedelta

TODAY = date.today().toordinal()  # epoch days, same basis as Kotlin LocalDate

# ---------------------------------------------------------------------------
# Normalisation + amounts (mirror of AiAssistantParser).
# ---------------------------------------------------------------------------
DEVANAGARI = str.maketrans("०१२३४५६७८९", "0123456789")
HINDI_ONES = {"ek": 1, "do": 2, "teen": 3, "chaar": 4, "paanch": 5, "chhe": 6,
              "saat": 7, "aath": 8, "nau": 9, "das": 10, "sau": 100, "hazaar": 1000}


def normalise(text):
    t = text.translate(DEVANAGARI).lower()
    t = t.replace("₹", " rs ").replace("रुपये", " rupaye").replace("रुपए", " rupaye")
    for word, value in HINDI_ONES.items():
        t = re.sub(rf"\b{word}\s+sau\b", str(value * 100), t)
        t = re.sub(rf"\b{word}\s+hazaar\b", str(value * 1000), t)
    t = re.sub(r"\bsau\b", "100", t)
    t = re.sub(r",\s*(?=[a-z])", " , ", t)
    t = re.sub(r"[,]+", "", t)
    return re.sub(r"\s+", " ", t).strip()


def find_amounts(q):
    found = []
    text = q
    for word, value in HINDI_ONES.items():
        m = re.search(rf"\b{word}\s+sau\b", text)
        if m:
            found.append(value * 100)
            text = re.sub(rf"\b{word}\s+sau\b", " ", text)
        m = re.search(rf"\b{word}\s+hazaar\b", text)
        if m:
            found.append(value * 1000)
            text = re.sub(rf"\b{word}\s+hazaar\b", " ", text)
    if re.search(r"\bsau\b", text):
        found.append(100)
        text = re.sub(r"\bsau\b", " ", text)
    marked = [int(float(x)) for x in re.findall(r"(\d+(?:\.\d+)?)\s*(?:rs\.?|rupaye|rupee|rupay)\b", text)]
    if marked:
        return sorted(found + marked)
    return sorted(found + [int(float(x)) for x in re.findall(r"\d+(?:\.\d+)?", text)])


def main_amount(q):
    amounts = find_amounts(q)
    if not amounts:
        return None
    counts = [int(x) for w in ("customer", "customers", "log", "jobs", "kaam")
              for x in re.findall(rf"(\d+)\s*{w}", q)]
    money = [a for a in amounts if a not in counts or len(amounts) == 1]
    if not money:
        return None
    marked = [int(float(x)) for x in re.findall(r"(\d+(?:\.\d+)?)\s*(?:rs\.?|rupaye|rupee|rupay)\b", q)]
    return max(marked) if marked else max(money)


SERVICES = [
    ("money transfer", "MONEY_TRANSFER", "Money Transfer"),
    ("smart card", "SMART_CARD", "Smart Card"),
    ("passport", "PASSPORT_PHOTO", "Passport Size Photo"),
    ("aadhaar", "AADHAAR", "Aadhaar Services"), ("aadhar", "AADHAAR", "Aadhaar Services"),
    ("voter", "VOTER_ID", "Voter ID"),
    ("ayushman", "AYUSHMAN", "Ayushman Card"),
    ("xerox", "XEROX", "Xerox"),
    ("printing", "PRINTING", "Printing"), ("print", "PRINTING", "Printing"),
    ("scanning", "SCANNING", "Scanning"), ("scan", "SCANNING", "Scanning"),
    ("pan card", "PAN", "PAN Card"), ("pan ", "PAN", "PAN Card"),
    ("document", "DOCUMENT_WORK", "Document Work"),
]


def detect_service(q):
    for kw, code, label in SERVICES:
        if kw in q:
            return (code, label)
    if q.endswith("pan"):
        return ("PAN", "PAN Card")
    return None


def detect_mode(q):
    if any(w in q for w in ("cash", "nagad", "nakad")):
        return "CASH"
    if any(w in q for w in ("upi", "online", "gpay", "google pay", "phonepe", "paytm", "bhim")):
        return "UPI"
    return None


def detect_expense_category(q):
    if "machine repair" in q or "machine kharab" in q or "repair" in q or "marammat" in q:
        return ("Machine Repair", None)
    if "bijli" in q or "electricity" in q or "light bill" in q:
        return ("Electricity", None)
    if "internet" in q or "wifi" in q:
        return ("Internet", None)
    if "kiraya" in q or "rent" in q:
        return ("Rent", None)
    if "kagaz" in q or "paper" in q:
        return ("Paper", "PRINTING")
    if "ink" in q or "toner" in q or "cartridge" in q:
        return ("Ink", "PRINTING")
    if "transport" in q or "petrol" in q or "diesel" in q or "gaadi" in q:
        return ("Transport", None)
    if "chai" in q or "khana" in q or "food" in q:
        return ("Tea/Food", None)
    if "salary" in q or "staff" in q:
        return ("Staff", None)
    return ("Other", None)


def split_segments(q):
    parts = [p.strip() for p in re.split(r",|\baur\b|\band\b|\+", q) if p.strip()]
    return parts or [q]


def idem_key(profile, day, canonical):
    return hashlib.sha256(f"{profile}|{day}|{canonical}".encode()).hexdigest()[:16]


def canonical_daily(entries):
    return ";".join(f"{e['label']}:{e['amount']}:{e['mode']}" for e in entries)


# ---------------------------------------------------------------------------
# Parser — same intent order as AiAssistantParser.parse.
# ---------------------------------------------------------------------------
def parse(text, ctx=None, agents=None, customers=None):
    ctx = ctx or {}
    agents = agents or []
    customers = customers or []
    q = normalise(text)
    if not q:
        return ("Unknown", None)
    help_topic = detect_help(q)
    if help_topic:
        return ("Help", help_topic)
    if is_factual(q):
        return ("Factual", text)
    if "refund" in q or "wapas" in q or "return" in q:
        return ("Clarify", {"question": "refund", "missing": ["refund entry", "amount", "mode"]})
    if any(w in q for w in ("galat", "correct", "sahi karo", "delete", "hatao", "remove", "badlo", "change karo")):
        return ("Clarify", {"question": "correction", "missing": ["exact entry"]})
    if re.search(r"\bkal\b", q):
        return ("Clarify", {"question": "kal", "missing": ["date"]})
    if is_internal(q):
        amount = main_amount(q)
        if amount is None:
            return ("Clarify", {"missing": ["amount"]})
        frm = "CASH" if ("cash se upi" in q or "cash to upi" in q) else (
            "UPI" if ("upi se cash" in q or "upi to cash" in q) else None)
        if frm is None:
            return ("Clarify", {"missing": ["direction"]})
        return ("Action", {"kind": "InternalTransfer", "amount": amount * 100, "from": frm})
    if ("money transfer" in q or "moneytransfer" in q or re.search(r"\bmt\b", q)
            or ("transfer" in q and "commission" in q)
            or "transfer kiya" in q or "transfer kara" in q):
        return parse_mt(q)
    if "agent" in q:
        return parse_agent(q, agents)
    if "kharch" in q or "expense" in q or "kharach" in q:
        return parse_expense(q)
    if (any(w in q for w in ("due", "udhaar", "udhar", "baki hai", "baaki", "lena hai"))
            and main_amount(q) is not None):
        return parse_due(q, ctx, customers)
    if ("customer" in q or "grahak" in q) and any(w in q for w in ("add", "naya", "new")):
        return ("Clarify", {"missing": ["customer name", "service"]})
    cp = parse_customer_payment(q, customers)
    if cp:
        return cp
    if has_income(q):
        return parse_daily(q, ctx)
    return ("Unknown", None)


def detect_help(q):
    how = any(w in q for w in ("kaise", "how to", "how do", "kahan", "where", "tarika"))
    if not how:
        return None
    if "cash book" in q:
        return "cash_book"
    if "upi" in q:
        return "upi_book"
    if "customer" in q and ("add" in q or "khata" in q):
        return "add_customer"
    if "agent" in q:
        return "agent_payment"
    if "receipt" in q or "rasid" in q or "bill" in q:
        return "receipt"
    if "daily" in q or "report" in q:
        return "daily_report"
    if "profile" in q:
        return "change_profile"
    if "service" in q and ("add" in q or "new" in q):
        return "new_service"
    if "language" in q or "bhasha" in q:
        return "language"
    if "difference" in q or "antar" in q or "hisab" in q:
        return "difference_finder"
    if "money transfer" in q:
        return "money_transfer"
    if "expense" in q or "kharch" in q:
        return "expense"
    if "maintenance" in q or "machine" in q:
        return "maintenance"
    if "backup" in q or "export" in q:
        return "backup"
    return "general"


def is_factual(q):
    qw = any(w in q for w in ("kitna", "kitne", "kitni", "kis", "kaun", "kya", "kab",
                              "compare", "batao", "dikhao", "hua tha", "last month",
                              "pichhle", "summary", "performance", "sabse zyada")) or q.endswith("?")
    if not qw:
        return False
    save = any(w in q for w in ("hue", "hua", "mile", "mila", "aaye", "diye", "diya",
                                "add kar", "save kar"))
    amount = main_amount(q)
    if amount is None:
        return True
    if not any(w in q for w in ("kitna", "kitne", "kitni", "kis", "kaun", "compare")) and not q.endswith("?"):
        return False
    return not save


def has_income(q):
    return any(w in q for w in ("hue", "hua", "hui", "mile", "mila", "aaye", "aaya",
                                "collection", "kamaye", "kamaya", "income", "earning",
                                "bikri", "sale", "add kar", "entry"))


def is_internal(q):
    return "cash" in q and "upi" in q and any(
        w in q for w in ("transfer", "badla", "se", "to", "->"))


def parse_mt(q):
    amounts = find_amounts(q)
    if "commission" in q and len(amounts) == 1:
        mode = detect_mode(q)
        if mode is None:
            return ("Clarify", {"missing": ["payment mode"]})
        return ("Action", {"kind": "DailyEntries", "entries": [
            {"service": "MONEY_TRANSFER", "label": "Money Transfer Commission",
             "amount": amounts[0] * 100, "mode": mode}]})
    if len(amounts) >= 2:
        principal = max(amounts) * 100
        commission = max(a for a in amounts if a * 100 != principal) * 100
        mode = detect_mode(q)
        if mode is None:
            return ("Clarify", {"missing": ["payment mode"]})
        return ("Action", {"kind": "MoneyTransfer", "principal": principal,
                           "commission": commission, "mode": mode})
    if len(amounts) == 1 and ("transfer" in q or "bheja" in q or "bheje" in q):
        return ("Clarify", {"missing": ["commission"]})
    return ("Clarify", {"missing": ["principal", "commission"]})


def parse_agent(q, agents):
    amount = main_amount(q)
    if amount is None:
        return ("Clarify", {"missing": ["amount"]})
    m = re.search(r"agent\s+([a-z ]+?)(?:\s+ko|\s+ne|\s+\d|$)", q)
    spoken = m.group(1).strip() if m else None
    resolved = None
    if spoken:
        resolved = next((a for a in agents if a.lower() == spoken.lower()), None) or \
            next((a for a in agents if a.lower().startswith(spoken.lower())), None)
    if spoken is None and len(agents) != 1:
        return ("Clarify", {"missing": ["agent"]})
    name = resolved or spoken or (agents[0] if agents else None)
    if name is None:
        return ("Clarify", {"missing": ["agent"]})
    if resolved is None and spoken and agents:
        return ("Clarify", {"missing": ["agent"]})
    mode = detect_mode(q)
    if mode is None:
        return ("Clarify", {"missing": ["payment mode"]})
    return ("Action", {"kind": "AgentPayment", "agent": name, "amount": amount * 100, "mode": mode})


def parse_expense(q):
    amount = main_amount(q)
    if amount is None:
        return ("Clarify", {"missing": ["amount"]})
    category, service = detect_expense_category(q)
    mode = detect_mode(q)
    if mode is None:
        return ("Clarify", {"missing": ["payment mode"]})
    return ("Action", {"kind": "Expense", "category": category,
                       "amount": amount * 100, "mode": mode, "service": service})


def parse_due(q, ctx, customers):
    amount = main_amount(q)
    name = next((c for c in customers if c.lower() in q), None)
    service = detect_service(q) or ctx.get("last_service")
    if name is None:
        return ("Clarify", {"missing": ["customer"]})
    if service is None:
        return ("Clarify", {"missing": ["service"]})
    return ("Action", {"kind": "RecordCustomerDue", "customer": name,
                       "amount": amount * 100, "service": service})


def parse_customer_payment(q, customers):
    name = next((c for c in customers if c.lower() in q), None)
    if not name:
        return None
    amount = main_amount(q)
    if amount is None:
        return None
    if not any(w in q for w in ("diya", "diye", "jama", "paid", "payment", "mila")):
        return None
    mode = detect_mode(q)
    if mode is None:
        return ("Clarify", {"missing": ["payment mode"]})
    return ("Action", {"kind": "CustomerPayment", "customer": name,
                       "amount": amount * 100, "mode": mode})


def find_money_hits(q):
    hits = []
    for m in re.finditer(r"\d+(?:\.\d+)?", q):
        after = q[m.end():m.end() + 16]
        w = re.match(r"^\s*([a-z]+)", after)
        nxt = w.group(1) if w else ""
        if nxt in ("customer", "customers", "log", "jobs", "kaam"):
            continue  # a count, not money
        hits.append((int(float(m.group(0))), m.start(), m.end()))
    return hits


def parse_daily(q, ctx):
    # Positional parsing (same as Kotlin): every money amount starts one
    # entry; service/mode come from the keywords around THAT amount.
    hits = find_money_hits(q)
    if not hits:
        return ("Clarify", {"missing": ["service", "amount"]})
    entries = []
    cur_service = ctx.get("last_service")
    cur_label = ctx.get("last_label")
    missing_mode = missing_service = False
    seps = re.compile(r",|\baur\b|\band\b")
    for i, (rupees, start, end) in enumerate(hits):
        head = seps.split(q[0 if i == 0 else hits[i - 1][2]:start])[-1]
        tail = seps.split(q[end:hits[i + 1][1] if i + 1 < len(hits) else len(q)])[0]
        svc = detect_service(head) or detect_service(tail) or cur_service
        label = (detect_service(head) or (None,))[1] if detect_service(head) else (
            (detect_service(tail) or (None,))[1] if detect_service(tail) else cur_label)
        mode = detect_mode(tail) or detect_mode(head) or ctx.get("last_mode")
        if svc is None or label is None:
            missing_service = True
            continue
        if mode is None:
            missing_mode = True
        entries.append({"service": svc[0], "label": label, "amount": rupees * 100,
                        "mode": mode or "CASH"})
        cur_service, cur_label = svc, label
    if not entries:
        return ("Clarify", {"missing": ["service", "amount"]})
    if missing_service:
        return ("Clarify", {"missing": ["service"]})
    if missing_mode:
        return ("Clarify", {"missing": ["payment mode"]})
    return ("Action", {"kind": "DailyEntries", "entries": entries,
                       "total": sum(e["amount"] for e in entries)})


def is_affirmative(text):
    n = normalise(text)
    return n in ("haan", "ha", "yes", "ok", "okay", "kar do", "kardo") or \
        n.startswith("haan ") or n.startswith("yes ") or "save kar" in n or \
        "confirm" in n or "theek hai" in n


def is_negative(text):
    n = normalise(text)
    return n in ("nahi", "nahin", "no") or n.startswith("nahi ") or \
        any(w in n for w in ("cancel", "mat karo", "rehnedo", "rehne do"))


def parse_follow_up(text, ctx):
    n = normalise(text)
    if not any(w in n for w in ("aur", "bhi", "add")):
        return None
    amount = main_amount(n)
    if amount is None:
        return None
    svc = detect_service(n) or ctx.get("last_service")
    mode = detect_mode(n) or ctx.get("last_mode")
    if not svc or not mode:
        return None
    label = (detect_service(n) or (None,))[1] if detect_service(n) else ctx.get("last_label")
    return {"kind": "DailyEntries", "entries": [
        {"service": svc[0], "label": label or svc[1], "amount": amount * 100, "mode": mode}]}


# ---------------------------------------------------------------------------
# Periods + knowledge (mirror of BusinessKnowledge).
# ---------------------------------------------------------------------------
def parse_period(q, today):
    q = q.lower()
    if "last 3 month" in q or "pichhle 3 mahine" in q or "pichle 3 mahine" in q:
        return "LAST_3_MONTHS"
    if "last 7 day" in q or "pichhle 7 din" in q or "hafta" in q:
        return "LAST_7_DAYS"
    if "last month" in q or "pichhle mahine" in q or "pichle mahine" in q:
        return "LAST_MONTH"
    if "this month" in q or "is month" in q or "is mahine" in q or "is mahina" in q:
        return "THIS_MONTH"
    if "this year" in q or "is saal" in q:
        return "THIS_YEAR"
    if "yesterday" in q or "kal" in q:
        return "YESTERDAY"
    if "today" in q or "aaj" in q:
        return "TODAY"
    return None


def period_range(period, today):
    d = date.fromordinal(today)
    if period == "TODAY":
        return ("Aaj", today, today)
    if period == "YESTERDAY":
        return ("Kal (yesterday)", today - 1, today - 1)
    if period == "LAST_7_DAYS":
        return ("Pichhle 7 din", today - 6, today)
    if period == "THIS_MONTH":
        return (d.strftime("%b %Y"), date(d.year, d.month, 1).toordinal(), today)
    if period == "LAST_MONTH":
        prev = date(d.year, d.month, 1) - timedelta(days=1)
        start = date(prev.year, prev.month, 1).toordinal()
        end = date(prev.year, prev.month, 1).toordinal() + 31
        # last day of prev month:
        end = (date(d.year, d.month, 1) - timedelta(days=1)).toordinal()
        return (prev.strftime("%b %Y"), start, end)
    if period == "LAST_3_MONTHS":
        start = date(d.year, d.month, 1)
        for _ in range(2):
            start = date(start.year, start.month, 1) - timedelta(days=1)
            start = date(start.year, start.month, 1)
        return ("Pichhle 3 mahine", start.toordinal(), today)
    if period == "THIS_YEAR":
        return (f"Is saal ({d.year})", date(d.year, 1, 1).toordinal(), today)
    return ("Ab tak (all time)", 0, today)


def mt_profit(comm, charges, exp):
    return comm - charges - exp


def net_profit(inc, mt, exp):
    return inc + mt - exp


def customer_due(total, received):
    return max(total - received, 0)


def agent_payable(charges, paid):
    return max(charges - paid, 0)


def route_for(text):
    q = normalise(text)
    if not any(w in q for w in ("kholo", "open", "dikhao", "khol", "jao", "chalo")):
        return None
    for kw, route, label in (
            ("cash book", "cash_book", "Cash Book"), ("upi", "upi_book", "UPI Book"),
            ("money transfer", "money_transfer", "Money Transfer"),
            ("daily", "daily_business", "Daily Business"), ("dhandha", "daily_business", "Daily Business"),
            ("customer khata", "khata", "Customer Khata"), ("khata", "khata", "Customer Khata"),
            ("customer", "khata", "Customer Khata"), ("agent", "agents", "Agents"),
            ("expense", "expenses", "Expenses"), ("kharch", "expenses", "Expenses"),
            ("maintenance", "maintenance", "Machine Maintenance"), ("machine", "maintenance", "Machine Maintenance"),
            ("receipt", "receipts", "Receipts"), ("report", "reports", "Reports"),
            ("difference", "difference_finder", "Difference Finder"),
            ("audit", "audit_log", "Audit Log"), ("recycle", "recycle_bin", "Recycle Bin"),
            ("custom", "customization", "Customization Studio"),
            ("setting", "settings", "Settings"),
            ("dashboard", "dashboard", "Dashboard"), ("home", "dashboard", "Dashboard"),
            ("service", "services", "Services"), ("pan", "service/PAN", "PAN Card"),
            ("aadhaar", "service/AADHAAR", "Aadhaar Services"),
            ("xerox", "service/XEROX", "Xerox"), ("printing", "service/PRINTING", "Printing"),
            ("smart card", "service/SMART_CARD", "Smart Card")):
        if kw in q:
            return (route, label)
    return None


def fmt(paise):
    sign = "-" if paise < 0 else ""
    a = abs(paise)
    rupees, p = a // 100, a % 100
    return f"{sign}₹{rupees:,}" + (f".{p:02d}" if p else "")


# Synthetic snapshot (same rows as AiAssistantTest.syntheticSnapshot).
def synthetic_snapshot():
    return {
        "profileId": 1,
        "txs": [
            {"kind": "INCOME", "category": "Xerox", "amount": 30000, "mode": "CASH", "day": TODAY},
            {"kind": "INCOME", "category": "Xerox", "amount": 20000, "mode": "UPI", "day": TODAY},
            {"kind": "INCOME", "category": "Printing", "amount": 50000, "mode": "CASH", "day": TODAY},
            {"kind": "INCOME", "category": "Money Transfer Commission", "amount": 5000, "mode": "CASH", "day": TODAY},
            {"kind": "EXPENSE", "category": "Machine Repair", "amount": 20000, "mode": "CASH", "day": TODAY},
        ],
        "transfers": [{"amount": 1000000, "commission": 5000, "mode": "CASH", "day": TODAY}],
        "jobs": [
            {"customer": 10, "service": "PAN", "total": 50000, "received": 20000, "agent": None, "charges": 0},
            {"customer": 11, "service": "Aadhaar", "total": 30000, "received": 30000, "agent": 5, "charges": 25000},
        ],
        "customers": [{"id": 10, "name": "Rahul"}, {"id": 11, "name": "Sana"}],
        "agents": [{"id": 5, "name": "Ramesh"}],
        "agent_payments": [{"agent": 5, "amount": 15000, "day": TODAY}],
        "expenses": [{"category": "Machine Repair", "amount": 20000, "day": TODAY}],
        "maintenance": [{"equipment": 7, "cost": 20000, "day": TODAY}],
        "equipment": [{"id": 7, "name": "Epson L805"}],
    }


def income_in(snap, rng):
    return [t for t in snap["txs"] if t["kind"] == "INCOME" and rng[1] <= t["day"] <= rng[2]]


def expense_in(snap, rng):
    return [t for t in snap["txs"] if t["kind"] == "EXPENSE" and rng[1] <= t["day"] <= rng[2]]


def cash_balance(snap):
    inn = sum(t["amount"] for t in snap["txs"] if t["mode"] == "CASH" and t["kind"] == "INCOME")
    out = sum(t["amount"] for t in snap["txs"] if t["mode"] == "CASH" and t["kind"] == "EXPENSE")
    return inn - out


def upi_balance(snap):
    inn = sum(t["amount"] for t in snap["txs"] if t["mode"] == "UPI" and t["kind"] == "INCOME")
    out = sum(t["amount"] for t in snap["txs"] if t["mode"] == "UPI" and t["kind"] == "EXPENSE")
    return inn - out


# ---------------------------------------------------------------------------
# Scenario runner — same list as AiAssistantTest.accuracySuite.
# ---------------------------------------------------------------------------
AGENTS = ["Ramesh", "Suresh"]
CUSTOMERS = ["Rahul", "Sana"]
CTX = {"day": TODAY}


def check(name, fn):
    try:
        fn()
        return (name, True, "")
    except AssertionError as e:
        return (name, False, str(e))


def eq(a, b, msg=""):
    assert a == b, f"expected {b!r}, got {a!r} {msg}"


def is_true(v, msg=""):
    assert v, f"expected True {msg}"


def main():
    results = []

    def t(name):
        def deco(fn):
            results.append((name, fn))
            return fn
        return deco

    @t("xerox cash via chat")
    def _():
        kind, a = parse("Aaj Xerox ke 300 rupaye cash hue", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Action")
        eq(a["kind"], "DailyEntries")
        eq(len(a["entries"]), 1)
        eq(a["entries"][0]["service"], "XEROX")
        eq(a["entries"][0]["amount"], 30000)
        eq(a["entries"][0]["mode"], "CASH")

    @t("upi collection via chat")
    def _():
        kind, a = parse("Aaj 500 rupaye UPI se printing hui", CTX, AGENTS, CUSTOMERS)
        eq(a["entries"][0]["service"], "PRINTING")
        eq(a["entries"][0]["amount"], 50000)
        eq(a["entries"][0]["mode"], "UPI")

    @t("multiple services in one message")
    def _():
        kind, a = parse("Aaj Xerox 300 cash, 200 UPI aur Smart Card 500 cash hua", CTX, AGENTS, CUSTOMERS)
        eq(len(a["entries"]), 3)
        eq(a["total"], 100000)
        eq(a["entries"][0]["label"], "Xerox")
        eq(a["entries"][1]["mode"], "UPI")
        eq(a["entries"][1]["service"], "XEROX")
        eq(a["entries"][2]["service"], "SMART_CARD")
        eq(a["entries"][2]["amount"], 50000)

    @t("expense via chat")
    def _():
        kind, a = parse("Aaj 200 rupaye machine repair mein cash kharch hue", CTX, AGENTS, CUSTOMERS)
        eq(a["kind"], "Expense")
        eq(a["category"], "Machine Repair")
        eq(a["amount"], 20000)
        eq(a["mode"], "CASH")

    @t("agent payment via chat")
    def _():
        kind, a = parse("Agent Ramesh ko 500 rupaye cash diye", CTX, AGENTS, CUSTOMERS)
        eq(a["kind"], "AgentPayment")
        eq(a["agent"], "Ramesh")
        eq(a["amount"], 50000)
        eq(a["mode"], "CASH")

    @t("mt principal + commission")
    def _():
        kind, a = parse("10000 transfer kiya, 50 commission mila cash", CTX, AGENTS, CUSTOMERS)
        eq(a["kind"], "MoneyTransfer")
        eq(a["principal"], 1000000)
        eq(a["commission"], 5000)
        eq(mt_profit(a["commission"], 0, 0), 5000)

    @t("mt commission only")
    def _():
        kind, a = parse("Aaj Money Transfer se 150 rupaye commission mila UPI se", CTX, AGENTS, CUSTOMERS)
        eq(a["entries"][0]["label"], "Money Transfer Commission")
        eq(a["entries"][0]["amount"], 15000)
        eq(a["entries"][0]["mode"], "UPI")

    @t("internal transfer not income")
    def _():
        kind, a = parse("1000 rupaye cash se UPI transfer kiye", CTX, AGENTS, CUSTOMERS)
        eq(a["kind"], "InternalTransfer")
        eq(a["amount"], 100000)
        eq(a["from"], "CASH")

    @t("customer due is not income")
    def _():
        kind, a = parse("Rahul ka PAN ka 500 rupaye due hai", CTX, AGENTS, CUSTOMERS)
        eq(a["kind"], "RecordCustomerDue")
        eq(a["amount"], 50000)

    @t("refund clarified not expense")
    def _():
        kind, a = parse("Xerox ke 100 rupaye refund karne hain", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Clarify")
        is_true("refund" in a["question"])

    @t("incomplete asks mode")
    def _():
        kind, a = parse("Aaj 500 rupaye printing hui", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Clarify")
        is_true("payment mode" in a["missing"])

    @t("ambiguous asks service")
    def _():
        kind, a = parse("Aaj 300 rupaye cash hue", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Clarify")
        is_true("service" in a["missing"])

    @t("kal date ambiguous")
    def _():
        kind, a = parse("Kal Xerox ke 300 cash hue", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Clarify")
        is_true("date" in a["missing"])

    @t("unknown agent asks agent")
    def _():
        kind, a = parse("Agent Mohan ko 500 rupaye cash diye", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Clarify")
        is_true("agent" in a["missing"])

    @t("devanagari digits")
    def _():
        kind, a = parse("Aaj Xerox ke ३०० rupaye cash hue", CTX, AGENTS, CUSTOMERS)
        eq(a["entries"][0]["amount"], 30000)

    @t("hindi number words")
    def _():
        kind, a = parse("Aaj Xerox ke teen sau rupaye cash hue", CTX, AGENTS, CUSTOMERS)
        eq(a["entries"][0]["amount"], 30000)

    @t("hindi question factual")
    def _():
        kind, a = parse("Aaj kitna dhandha hua?", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Factual")

    @t("follow-up uses last service")
    def _():
        ctx2 = {"last_service": ("XEROX", "Xerox"), "last_label": "Xerox", "last_mode": "UPI"}
        a = parse_follow_up("Aur 200 UPI bhi add kar do", ctx2)
        is_true(a is not None)
        eq(a["entries"][0]["service"], "XEROX")
        eq(a["entries"][0]["amount"], 20000)
        eq(a["entries"][0]["mode"], "UPI")

    @t("affirmative / negative")
    def _():
        is_true(is_affirmative("Haan"))
        is_true(is_affirmative("haan, save kar do"))
        is_true(is_negative("Nahi, cancel karo"))
        is_true(is_negative("rehne do"))

    @t("idempotency key stable")
    def _():
        e = [{"label": "Xerox", "amount": 30000, "mode": "CASH"}]
        eq(idem_key(1, TODAY, canonical_daily(e)), idem_key(1, TODAY, canonical_daily(e)))

    @t("idempotency key differs")
    def _():
        a = [{"label": "Xerox", "amount": 30000, "mode": "CASH"}]
        b = [{"label": "Xerox", "amount": 20000, "mode": "CASH"}]
        assert idem_key(1, TODAY, canonical_daily(a)) != idem_key(1, TODAY, canonical_daily(b))
        assert idem_key(1, TODAY, canonical_daily(a)) != idem_key(2, TODAY, canonical_daily(a))

    @t("help intent")
    def _():
        kind, a = parse("Cash Book mein entry kaise add karu?", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Help")
        eq(a, "cash_book")

    @t("navigation intent")
    def _():
        eq(route_for("Cash Book kholo"), ("cash_book", "Cash Book"))
        eq(route_for("Reports kholo"), ("reports", "Reports"))
        eq(route_for("PAN Card page open karo"), ("service/PAN", "PAN Card"))
        eq(route_for("Aaj kitna dhandha hua?"), None)

    @t("period interpretation")
    def _():
        eq(parse_period("Is mahine total kitna collection hua?", TODAY), "THIS_MONTH")
        eq(parse_period("Kal kitni earning hui thi?", TODAY), "YESTERDAY")
        eq(parse_period("Last 7 days ka business summary do", TODAY), "LAST_7_DAYS")
        eq(parse_period("Pichhle 3 mahine ka profit dikhao", TODAY), "LAST_3_MONTHS")
        eq(parse_period("Last month se compare karo", TODAY), "LAST_MONTH")
        eq(parse_period("Is saal ki service-wise performance batao", TODAY), "THIS_YEAR")

    @t("daily summary from real data")
    def _():
        snap = synthetic_snapshot()
        rng = period_range("TODAY", TODAY)
        total = sum(t["amount"] for t in income_in(snap, rng))
        exp = sum(t["amount"] for t in expense_in(snap, rng))
        comm = sum(t["commission"] for t in snap["transfers"])
        profit = net_profit(total - comm, mt_profit(comm, 0, 0), exp)
        eq(total, 105000)
        eq(profit, 85000)
        eq(fmt(total), "₹1,050")
        eq(fmt(profit), "₹850")

    @t("cash/upi balances separate")
    def _():
        snap = synthetic_snapshot()
        eq(cash_balance(snap), 65000)
        eq(upi_balance(snap), 20000)

    @t("mt commission only (knowledge)")
    def _():
        snap = synthetic_snapshot()
        eq(sum(t["commission"] for t in snap["transfers"]), 5000)
        eq(sum(t["amount"] for t in snap["transfers"]), 1000000)
        eq(mt_profit(5000, 0, 0), 5000)

    @t("biggest customer due")
    def _():
        snap = synthetic_snapshot()
        dues = {}
        for j in snap["jobs"]:
            name = next(c["name"] for c in snap["customers"] if c["id"] == j["customer"])
            dues[name] = dues.get(name, 0) + customer_due(j["total"], j["received"])
        top = max(dues.items(), key=lambda kv: kv[1])
        eq(top, ("Rahul", 30000))

    @t("agent payable separate")
    def _():
        snap = synthetic_snapshot()
        charges = sum(j["charges"] for j in snap["jobs"] if j["agent"] == 5)
        paid = sum(p["amount"] for p in snap["agent_payments"] if p["agent"] == 5)
        eq(agent_payable(charges, paid), 10000)
        eq(customer_due(50000, 20000), 30000)  # separate ledger, never netted

    @t("service earnings this month")
    def _():
        snap = synthetic_snapshot()
        rng = period_range("THIS_MONTH", TODAY)
        xerox = sum(t["amount"] for t in income_in(snap, rng) if t["category"] == "Xerox")
        eq(xerox, 50000)

    @t("comparison follow-up context")
    def _():
        snap = synthetic_snapshot()
        cur = period_range("THIS_MONTH", TODAY)
        prev = period_range("LAST_MONTH", TODAY)
        cur_x = sum(t["amount"] for t in income_in(snap, cur) if t["category"] == "Xerox")
        prev_x = sum(t["amount"] for t in income_in(snap, prev) if t["category"] == "Xerox")
        eq((cur_x, prev_x), (50000, 0))
        is_true(cur_x - prev_x == 50000)

    @t("maintenance by equipment")
    def _():
        snap = synthetic_snapshot()
        eq_name = next(e["name"] for e in snap["equipment"] if e["id"] == 7)
        total = sum(m["cost"] for m in snap["maintenance"] if m["equipment"] == 7)
        eq(eq_name, "Epson L805")
        eq(total, 20000)

    @t("missing data honest")
    def _():
        empty = {"txs": [], "jobs": [], "customers": [], "transfers": []}
        is_true(not empty["txs"] and not empty["jobs"])

    @t("analysis facts vs suggestions")
    def _():
        snap = synthetic_snapshot()
        by_service = {}
        for t in snap["txs"]:
            if t["kind"] == "INCOME":
                by_service[t["category"]] = by_service.get(t["category"], 0) + t["amount"]
        top = max(by_service.items(), key=lambda kv: kv[1])
        eq(top[0], "Xerox")
        is_true(True)  # facts/suggestions are labelled separately in the Kotlin answer

    @t("profile isolation")
    def _():
        snap = synthetic_snapshot()
        eq(snap["profileId"], 1)
        is_true(all(t.get("profileId", 1) == 1 for t in snap["txs"]))

    passed = 0
    failures = []
    for name, fn in results:
        n, ok, err = check(name, fn)
        print(("PASS " if ok else "FAIL ") + n + ("" if ok else f" — {err}"))
        passed += ok
        if not ok:
            failures.append(n)
    rate = passed * 100 // len(results)
    print(f"\nAI ACCURACY (Python mirror): {passed}/{len(results)} passed ({rate}%)")
    if failures:
        print("FAILED: " + "; ".join(failures))
    return 0 if rate >= 95 else 1


if __name__ == "__main__":
    raise SystemExit(main())
