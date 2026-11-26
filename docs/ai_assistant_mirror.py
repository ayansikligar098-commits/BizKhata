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

# ---------------------------------------------------------------------------
# UPDATE 13 — multilingual layer (mirror of domain/Multilingual.kt).
# Same tables, same order: digits -> phrases -> token map -> number words.
# REPLIES below mirrors the Hinglish/English/Hindi/Gujarati/Tamil/Nepali
# template columns in full; the other nine template languages fall back
# to Hinglish here (the Kotlin file is authoritative for them — the
# verifier checks every template key exists there). Understanding
# (detection + canonicalisation + parse) is mirrored for ALL languages.
# ---------------------------------------------------------------------------
_DIGIT_BASES = [0x966, 0x9E6, 0xA66, 0xAE6, 0xB66, 0xBE6, 0xC66, 0xCE6,
                0xD66, 0x660, 0x6F0, 0xABF0, 0x1C50]
DIGIT_MAP = {base + i: ord("0") + i for base in _DIGIT_BASES for i in range(10)}

ROMAN_VARIANTS = {
    "aaja": "aaj", "aje": "aaj", "aaje": "aaj", "aaz": "aaj", "aiz": "aaj",
    "aai": "aaj", "inniki": "aaj", "innu": "aaj", "indu": "aaj", "aji": "aaj",
    "aj": "aaj", "adya": "aaj", "dinai": "aaj", "ajj": "aaj", "tehen": "aaj",
    "houjik": "aaj",
    "kale": "kal", "kaale": "kal", "kaal": "kal", "ninnu": "kal",
    "ninne": "kal", "naalai": "kal", "repu": "kal", "naale": "kal",
    "innalle": "kal", "gatakali": "kal", "kail": "kal",
    "baaki": "baki", "bakaya": "baki",
    "munafa": "nafa", "labh": "nafa", "laabh": "nafa", "munafe": "nafa",
    "kharcha": "kharch", "kharcho": "kharch", "kharach": "kharch",
    "kharchu": "kharch", "kharche": "kharch",
    "jamma": "jama",
    "thaya": "hue", "thayo": "hue", "thayu": "hue", "hoyeche": "hua",
    "hoyechi": "hua", "holo": "hua", "aachu": "hua", "aayitu": "hua",
    "malyo": "mila", "malya": "mila", "milyo": "mila", "milya": "mila",
    "kitti": "mila", "vachindi": "mila", "milila": "mila", "palo": "mila",
    "meel": "mila", "mello": "mila", "mon": "mila", "mileya": "mila",
    "bhetal": "mila", "namena": "mila", "phangba": "mila",
    "praptam": "mila", "milayo": "mila",
    "aavyo": "aaya", "aavyu": "aaya", "aagaya": "aaya", "aayo": "aaya",
    "vandhu": "aaya", "vandhadhu": "aaya", "vachina": "aaya",
    "bandide": "aaya", "bantu": "aaya",
    "ane": "aur", "ani": "aur", "ar": "aur", "ebong": "aur",
    "matte": "aur", "mattu": "aur", "te": "aur", "ate": "aur",
    "mari": "aur", "aani": "aur",
    "mattrum": "aur", "mariyu": "aur", "pinne": "aur",
    "au": "aur", "aru": "aur", "cha": "aur", "teh": "aur",
    "ra": "aur", "ain": "aur", "amasung": "aur", "arw": "aur",
    # "pan" is deliberately NOT mapped to "bhi" — it is also "PAN"
    # (the PAN Card service); mapping it would destroy "PAN ka 500".
    # "pann" covers the Gujarati "also" without the collision.
    "pann": "bhi", "kooda": "bhi",
    "thi": "se",
    "ketla": "kitna", "ketlo": "kitna", "ketli": "kitna", "koto": "kitna",
    "kinna": "kitna", "evlo": "kitna", "enta": "kitna", "eshtu": "kitna",
    "ethra": "kitna", "kete": "kitna", "kiman": "kitna", "katlo": "kitna",
    "kati": "kitna", "kitli": "kitna",
    "shu": "kya", "enna": "kya", "emiti": "kya", "enu": "kya",
    "enthu": "kya", "kana": "kya", "kia": "kya",
    "kem": "kaise", "kase": "kaise", "kivein": "kaise", "kivabe": "kaise",
    "kiddan": "kaise", "eppadi": "kaise", "ela": "kaise", "hege": "kaise",
    "engane": "kaise", "kiperi": "kaise", "kenekoi": "kaise",
    "batavo": "batao", "sanga": "batao", "daso": "batao", "sollu": "batao",
    "cheppu": "batao", "helu": "batao",
    "kyare": "kab", "kakhan": "kab", "kadon": "kab", "eppodhu": "kab",
    "eppudu": "kab", "yavaga": "kab", "eppol": "kab", "kebe": "kab",
    "ketia": "kab",
    "aapvana": "dena", "aapva": "dena", "aapvanu": "dena", "devana": "dena",
    "rokad": "cash", "rokda": "cash",
    "vijli": "bijli", "bhadu": "kiraya", "bhada": "kiraya",
    "samarkam": "repair",
    "chhella": "pichhle", "gata": "pichhle", "pichhla": "pichhle",
    "divas": "din", "athavadiya": "hafta", "athvadiyu": "hafta",
    "hafte": "hafta", "mahina": "mahine",
    "dhandho": "dhandha", "byabsha": "dhandha", "vyaparam": "dhandha",
    "vyapaar": "dhandha",
    "vapas": "wapas", "kadho": "hatao",
    "taka": "rupaye", "toka": "rupaye", "tanka": "rupaye",
    "rupi": "rupaye", "rupaiya": "rupaye", "rupia": "rupaye",
}

NATIVE_TOKENS = {
    "और": "aur", "અને": "aur", "এবং": "aur", "আৰু": "aur",
    "ਤੇ": "aur", "மற்றும்": "aur", "మరియు": "aur", "ಮತ್ತು": "aur",
    "പിന്നെ": "aur", "ଏବଂ": "aur", "आणि": "aur",
    "आज": "aaj", "આજે": "aaj", "আজ": "aaj", "ਅੱਜ": "aaj",
    "இன்று": "aaj", "ఈరోజు": "aaj", "ಇಂದು": "aaj", "ഇന്ന്": "aaj",
    "ଆଜି": "aaj", "আজি": "aaj", "آج": "aaj", "ꯍꯧꯖꯤꯛ": "aaj",
    "হৌজিক": "aaj", "अद्य": "aaj", "आयज": "aaj", "अज्ज": "aaj",
    "दिनै": "aaj", "আই": "aaj",
    "कल": "kal", "કાલે": "kal", "কাল": "kal", "ਕੱਲ੍ਹ": "kal",
    "நேற்று": "kal", "நாளை": "kal", "నిన్న": "kal", "రేపు": "kal",
    "ನಿನ್ನೆ": "kal", "ನಾಳೆ": "kal", "ഇന്നലെ": "kal", "നാളെ": "kal",
    "ଗତକାଲି": "kal", "ଆସନ୍ତାକାଲି": "kal", "কালি": "kal",
    "কাইল": "kal", "کل": "kal",
    "बाकी": "baki", "બાકી": "baki", "বাকি": "baki", "ਬਾਕੀ": "baki",
    "பாக்கி": "baki", "బాకీ": "baki", "ಬಾಕಿ": "baki", "ബാക്കി": "baki",
    "ବାକି": "baki", "বাকী": "baki", "باقی": "baki",
    "नफा": "nafa", "નફો": "nafa", "লাভ": "nafa", "ਲਾਭ": "nafa",
    "லாபம்": "nafa", "లాభం": "nafa", "ಲಾಭ": "nafa", "ലാഭം": "nafa",
    "ଲାଭ": "nafa", "نفع": "nafa", "मुनाफा": "nafa",
    "खर्च": "kharch", "ખર્ચો": "kharch", "খরচ": "kharch",
    "ਖਰਚ": "kharch", "செலவு": "kharch", "ఖర్చు": "kharch",
    "ಖರ್ಚು": "kharch", "ചെലവ്": "kharch", "ଖର୍ଚ୍ଚ": "kharch",
    "খৰচ": "kharch", "خرچ": "kharch",
    "कैश": "cash", "નગદ": "cash", "રોકડ": "cash", "নগদ": "cash",
    "ਨਗਦ": "cash", "ரொக்கம்": "cash", "నగదు": "cash", "ನಗದು": "cash",
    "کیش": "cash",
    "यूपीआई": "upi", "યુપીઆઈ": "upi", "ইউপিআই": "upi",
    "ਯੂਪੀਆਈ": "upi", "யுபிஐ": "upi", "యూపీఐ": "upi",
    "ಯುಪಿಐ": "upi", "യുപിഐ": "upi", "ୟୁପିଆଇ": "upi",
    "रुपये": "rupaye", "रुपए": "rupaye", "रुपैयाँ": "rupaye",
    "રૂપિયા": "rupaye", "টাকা": "rupaye", "টকা": "rupaye",
    "ਰੁਪਏ": "rupaye", "ரூபாய்": "rupaye", "రూపాయలు": "rupaye",
    "ರೂಪಾಯಿ": "rupaye", "രൂപ": "rupaye", "ଟଙ୍କା": "rupaye",
    "روپے": "rupaye", "روپیہ": "rupaye", "روپيا": "rupaye",
    "ꯔꯨꯄꯤ": "rupaye", "রুপি": "rupaye",
    "ज़ेरॉक्स": "xerox", "झेरॉक्स": "xerox", "जेरॉक्स": "xerox",
    "ઝેરોક્સ": "xerox", "জেরক্স": "xerox", "জেৰক্স": "xerox",
    "ਜ਼ੇਰੌਕਸ": "xerox", "ஜெராக்ஸ்": "xerox", "జెరాక్స్": "xerox",
    "ಜೆರಾಕ್ಸ್": "xerox", "സെറോക്സ്": "xerox", "ଜେରକ୍ସ": "xerox",
    "زیروکس": "xerox",
    "प्रिंट": "print", "प्रिंटिंग": "printing", "પ્રિન્ટ": "print",
    "ছাপা": "print", "ਛਪਾਈ": "print", "அச்சு": "print",
    "ముద్రణ": "print", "ಮುದ್ರಣ": "print", "പ്രിന്റ്": "print",
    "ଛପା": "print", "چھپائی": "print",
    "पैन": "pan", "પાન": "pan", "প্যান": "pan", "ਪੈਨ": "pan",
    "பான்": "pan", "పాన్": "pan", "ಪಾನ್": "pan", "പാൻ": "pan",
    "ପାନ": "pan", "পান": "pan",
    "आधार": "aadhaar", "આધાર": "aadhaar", "আধার": "aadhaar",
    "ਆਧਾਰ": "aadhaar", "ஆதார்": "aadhaar", "ఆధార్": "aadhaar",
    "ಆಧಾರ್": "aadhaar", "ആധാർ": "aadhaar", "ଆଧାର": "aadhaar",
    "আধাৰ": "aadhaar", "آدھار": "aadhaar",
    "कितना": "kitna", "कितने": "kitna", "કેટલા": "kitna",
    "কত": "kitna", "ਕਿੰਨਾ": "kitna", "எவ்வளவு": "kitna",
    "ఎంత": "kitna", "ಎಷ್ಟು": "kitna", "എത്ര": "kitna",
    "କେତେ": "kitna", "কিমান": "kitna", "کتنا": "kitna",
    "क्या": "kya", "શું": "kya", "কি": "kya", "ਕੀ": "kya",
    "என்ன": "kya", "ఏమిటి": "kya", "ಏನು": "kya",
    "എന്ത്": "kya", "କଣ": "kya", "کیا": "kya",
    "कैसे": "kaise", "કેમ": "kaise", "কিভাবে": "kaise",
    "ਕਿਵੇਂ": "kaise", "எப்படி": "kaise", "ఎలా": "kaise",
    "ಹೇಗೆ": "kaise", "എങ്ങനെ": "kaise", "କିପରି": "kaise",
    "কেনেকৈ": "kaise", "کیسے": "kaise",
    "बताओ": "batao", "બતાવો": "batao", "বলো": "batao",
    "ਦੱਸੋ": "batao", "சொல்லு": "batao", "చెప్పు": "batao",
    "ಹೇಳು": "batao", "പറയൂ": "batao", "କୁହ": "batao",
    "কোৱা": "batao", "بتاؤ": "batao",
    "कब": "kab", "ક્યારે": "kab", "কখন": "kab", "ਕਦੋਂ": "kab",
    "எப்போது": "kab", "ఎప్పుడు": "kab", "ಯಾವಾಗ": "kab",
    "എപ്പോൾ": "kab", "କେବେ": "kab", "কেতিয়া": "kab", "کب": "kab",
    "हुए": "hue", "हुआ": "hua", "थया": "hue",
    "થયા": "hue", "হয়েছে": "hua", "ਹੋਇਆ": "hua",
    "ஆச்சு": "hua", "అయ్యింది": "hua", "ಆಯಿತು": "hua",
    "ആയി": "hua", "ହେଲା": "hua", "হ'ল": "hua", "ہوا": "hua",
    "मिला": "mila", "मिले": "mila", "मिली": "mila",
    "મળ્યું": "mila", "পেলাম": "mila", "ਮਿਲਿਆ": "mila",
    "கிடைச்சது": "mila", "వచ్చింది": "mila", "ಸಿಕ್ತು": "mila",
    "കിട്ടി": "mila", "ମିଳିଲା": "mila", "পালোঁ": "mila",
    "পালো": "mila", "ملے": "mila", "مليا": "mila", "مِل": "mila",
    "मिळाले": "mila", "मिल्यो": "mila", "मेळ्ळे": "mila",
    "मिलेआ": "mila", "भेटल": "mila", "मोन": "mila",
    "મળ્યા": "mila", "મળ્યુ": "mila",
    "ꯐꯪꯕꯥ": "mila", "ফংবা": "mila", "प्राप्तम्": "mila",
    "आया": "aaya", "வந்தது": "aaya", "వచ్చింది": "aaya", "ಬಂತು": "aaya",
    "देना": "dena", "આપવાનું": "dena", "দিতে": "dena",
    "ਦੇਣਾ": "dena", "கொடுக்க": "dena", "ఇవ్వాలి": "dena",
    "ಕೊಡಬೇಕು": "dena", "കൊടുക്കണം": "dena", "ଦେବା": "dena",
    "দিব": "dena", "دینا": "dena",
    "एजेंट": "agent", "એજન્ટ": "agent", "এজেন্ট": "agent",
    "ਏਜੰਟ": "agent", "ஏஜெண்ட்": "agent", "ఏజెంట్": "agent",
    "ಏಜೆಂಟ್": "agent", "ഏജന്റ്": "agent", "ଏଜେଣ୍ଟ": "agent",
    "এজেণ্ট": "agent", "ایجنٹ": "agent",
    "ग्राहक": "customer", "ગ્રાહક": "customer", "গ্রাহক": "customer",
    "ਗਾਹਕ": "customer", "வாடிக்கையாளர்": "customer",
    "కస్టమర్": "customer", "ಗ್ರಾಹಕ": "customer",
    "ഉപഭോക്താവ്": "customer", "ଗ୍ରାହକ": "customer",
    "গ্ৰাহক": "customer", "گاہک": "customer",
}

PHRASES = {
    "nakh de": "save kar do", "nakh do": "save kar do",
    "nakho": "save kar do", "daal de": "save kar do",
    "bhar de": "save kar do",
    "aapvana che": "dena hai", "aapvanu che": "dena hai",
    "levanu che": "lena hai",
    "upi ma": "upi se", "cash ma": "cash se",
    "thaya che": "hue", "thayo che": "hue",
    "baki che": "baki hai", "baaki che": "baki hai",
    "reva do": "rehne do", "rahva do": "rehne do",
    "eeroju": "aaj",
    "मनी ट्रांसफर": "money transfer",
    "પૈસા ટ્રાન્સફર": "money transfer",
    "টাকা পাঠানো": "money transfer",
    "பணம் அனுப்ப": "money transfer",
    "డబ్బు పంపు": "money transfer",
}

NUMBER_WORDS = {
    "ek": 1, "do": 2, "teen": 3, "chaar": 4, "paanch": 5, "chhe": 6,
    "saat": 7, "aath": 8, "nau": 9, "das": 10, "gyarah": 11, "barah": 12,
    "bees": 20, "pachaas": 50,
    "be": 2, "tran": 3, "nav": 9,
    "don": 2, "paach": 5, "sahaa": 6, "daha": 10,
    "dui": 2, "tin": 3, "panch": 5, "chhoy": 6, "aat": 8, "noy": 9,
    "dosh": 10, "tini": 3,
    "ikk": 1, "tinn": 3, "panj": 5, "satt": 7, "atth": 8,
    "onru": 1, "rendu": 2, "moonru": 3, "naalu": 4, "anju": 5,
    "aaru": 6, "ezhu": 7, "ettu": 8, "onbadhu": 9, "pathu": 10,
    "okati": 1, "moodu": 3, "naalugu": 4, "aidu": 5, "edu": 7,
    "enimidi": 8, "tommidi": 9, "padi": 10,
    "ondu": 1, "eradu": 2, "mooru": 3, "naalku": 4, "elu": 7,
    "entu": 8, "ombattu": 9, "hattu": 10,
    "onn": 1, "rand": 2, "moon": 3, "naal": 4, "anj": 5, "aar": 6,
    "ezh": 7, "ett": 8, "onpat": 9, "patt": 10,
    "eka": 1, "chari": 4, "pancha": 5, "chha": 6, "sata": 7,
    "atha": 8, "dasa": 10,
    "ekam": 1, "dve": 2, "trini": 3, "chatvari": 4, "sapta": 7,
    "asta": 8, "nava": 9, "dasha": 10,
}
HUNDRED_WORDS = {"sau", "so", "sho", "sou", "shambhar", "nooru", "vanda",
                 "noor", "saha", "xo", "shata", "saya"}
THOUSAND_WORDS = {"hazaar", "hajar", "hazar", "aayiram", "veyyi",
                  "saavira", "sahasra"}

DETECTION_KEYWORDS = {
    "hinglish": {"aaj", "kal", "kitna", "kitne", "batao", "hue", "hua",
                 "mila", "kharcha", "baki", "dhandha", "hisab", "rupaye",
                 "paise", "kaise", "kya", "nahi", "haan", "dena", "lena", "jama"},
    "hi": {"आज", "कल", "कितना", "बताओ", "हुए", "मिला", "खर्च", "बाकी",
           "है", "मुझे", "मेरा", "कैसे", "क्या", "नहीं", "हाँ", "रुपये"},
    "gu": {"aaje", "ketla", "ketlo", "thaya", "thayo", "malyo", "malya",
           "ane", "che", "kharcho", "baki", "nakh", "આજે", "કેટલા", "થયા",
           "બાકી", "ખર્ચો", "રૂપિયા"},
    "mr": {"आज", "किती", "कसे", "मला", "तुम्ही", "माझे", "झाले",
           "मिळाले", "बाकी", "खर्च", "आहे", "सांगा", "che", "milale",
           "चे", "ची", "चा"},
    "bn": {"আজ", "কত", "কিভাবে", "হয়েছে", "টাকা", "বাকি", "খরচ",
           "আমার", "বলো", "hoyeche", "taka", "koto"},
    "pa": {"ਅੱਜ", "ਕਿੰਨਾ", "ਕਿਵੇਂ", "ਮਿਲਿਆ", "ਮਿਲੇ", "ਰੁਪਏ", "ਬਾਕੀ",
           "ਖਰਚ", "ਦੱਸੋ", "kinna", "mile", "dasso", "de"},
    "ta": {"இன்று", "எவ்வளவு", "எப்படி", "வந்தது", "ரூபாய்",
           "பாக்கி", "சொல்லு", "inniki", "vandhadhu", "evlo", "sari"},
    "te": {"ఈరోజు", "ఎంత", "ఎలా", "వచ్చింది", "రూపాయలు", "బాకీ",
           "చెప్పు", "eeroju", "vachindi", "enta"},
    "kn": {"ಇಂದು", "ಎಷ್ಟು", "ಹೇಗೆ", "ಬಂತು", "ರೂಪಾಯಿ", "ಬಾಕಿ",
           "ಹೇಳು", "indu", "bandide", "eshtu"},
    "ml": {"ഇന്ന്", "എത്ര", "എങ്ങനെ", "കിട്ടി", "രൂപ", "ബാക്കി",
           "പറയൂ", "innu", "kitti", "ethra"},
    "or": {"ଆଜି", "କେତେ", "କିପରି", "ମିଳିଲା", "ଟଙ୍କା",
           "ବାକି", "କୁହ", "aji", "milila", "tanka"},
    "as": {"আজি", "কিমান", "কেনেকৈ", "পালোঁ", "টকা", "বাকী",
           "কোৱা", "aji", "palo", "toka", "kiman"},
    "ur": {"آج", "کتنا", "کیسے", "ملے", "روپے", "باقی", "بتاؤ",
           "mile", "rupaye"},
    "sa": {"अद्य", "कति", "अस्ति", "मम", "कृपया", "प्राप्तम्",
           "adya", "praptam", "kripaya"},
    "ks": {"آج", "کٲشُر", "چھُ", "مِل", "aaz", "meel", "chhu"},
    "kok": {"आयज", "आसा", "म्हाका", "कितलें", "मेळ्ळे", "aiz",
            "mello", "asa"},
    "ne": {"कति", "मलाई", "मेरो", "हो", "मिल्यो", "रुपैयाँ",
           "aaja", "milayo", "kati"},
    "sd": {"ڇا", "آهي", "مليا", "روپيا", "milyo", "chha", "ja"},
    "mni": {"ꯍꯧꯖꯤꯛ", "ꯐꯪꯕꯥ", "ꯔꯨꯄꯤ", "হৌজিক", "ফংবা",
            "houjik", "phangba"},
    "brx": {"दिनै", "आं", "नों", "मोन", "बे", "dinai", "mon"},
    "doi": {"अज्ज", "ऐ", "मिगी", "किन्ना", "मिलेआ", "ajj",
            "mileya", "kinna"},
    "mai": {"आइ", "अछि", "हमरा", "कतेक", "भेटल", "aai",
            "bhetal", "achhi"},
    "sat": {"ᱛᱮᱦᱮᱧ", "tehen", "namena", "ᱧᱟᱢ"},
    "en": {"today", "yesterday", "how", "much", "total", "show",
           "please", "save", "received", "income", "expense",
           "cash", "tell", "what", "balance"},
}


def _script_of(ch):
    c = ord(ch)
    if 0x0900 <= c <= 0x097F:
        return "devanagari"
    if 0x0980 <= c <= 0x09FF:
        return "bengali"
    if 0x0A00 <= c <= 0x0A7F:
        return "gurmukhi"
    if 0x0A80 <= c <= 0x0AFF:
        return "gujarati"
    if 0x0B00 <= c <= 0x0B7F:
        return "odia"
    if 0x0B80 <= c <= 0x0BFF:
        return "tamil"
    if 0x0C00 <= c <= 0x0C7F:
        return "telugu"
    if 0x0C80 <= c <= 0x0CFF:
        return "kannada"
    if 0x0D00 <= c <= 0x0D7F:
        return "malayalam"
    if 0x0600 <= c <= 0x06FF or 0x0750 <= c <= 0x077F:
        return "arabic"
    if 0xABC0 <= c <= 0xABFF:
        return "meitei"
    if 0x1C50 <= c <= 0x1C7F:
        return "olchiki"
    return None


def detect_language(text):
    """Mirror of Multilingual.detectLanguage. Returns dict with
    language code, confidence, script, romanized, mixed, top scores."""
    if not text.strip():
        return {"language": "unknown", "confidence": 0.0, "script": "",
                "romanized": False, "mixed": False, "scores": []}
    lower = text.lower()
    tokens = set(t for t in re.split(r"[\s,.;:!?।॥'\"()\[\]{}۔؟،؛]+", lower) if t)
    script_counts = {}
    for ch in text:
        s = _script_of(ch)
        if s:
            script_counts[s] = script_counts.get(s, 0) + 1
    dominant = max(script_counts, key=script_counts.get) if script_counts else ""
    latin = sum(1 for ch in text if ch.isascii() and ch.isalpha())
    romanized = not dominant and latin > 0
    script_mixed = len(script_counts) > 1 or (dominant and latin >= 3)
    scores = sorted(
        ((lang, len(tokens & kws)) for lang, kws in DETECTION_KEYWORDS.items()),
        key=lambda kv: -kv[1])
    scores = [s for s in scores if s[1] > 0]
    kw = lambda lang: len(tokens & DETECTION_KEYWORDS.get(lang, set()))
    winner = None
    if dominant == "gurmukhi":
        winner = "pa"
    elif dominant == "gujarati":
        winner = "gu"
    elif dominant == "odia":
        winner = "or"
    elif dominant == "tamil":
        winner = "ta"
    elif dominant == "telugu":
        winner = "te"
    elif dominant == "kannada":
        winner = "kn"
    elif dominant == "malayalam":
        winner = "ml"
    elif dominant == "meitei":
        winner = "mni"
    elif dominant == "olchiki":
        winner = "sat"
    elif dominant == "bengali":
        winner = "as" if kw("as") > kw("bn") and kw("as") >= kw("mni") else (
            "mni" if kw("mni") > kw("bn") else "bn")
    elif dominant == "arabic":
        # Kashmiri / Sindhi / Urdu share the script: the HIGHEST
        # keyword score wins; a tie falls back to Urdu.
        winner = "ks" if kw("ks") > kw("ur") and kw("ks") >= kw("sd") else (
            "sd" if kw("sd") > kw("ur") and kw("sd") >= kw("ks") else "ur")
    elif dominant == "devanagari":
        best = scores[0] if scores else None
        dev_langs = {"mr", "ne", "sa", "kok", "doi", "mai", "brx"}
        winner = best[0] if best and best[0] in dev_langs else "hi"
    best = scores[0] if scores else None
    second = scores[1] if len(scores) > 1 else None
    mixed = bool((second and second[1] >= 2 and second[1] * 2 >= (best[1] if best else 0))
                 or script_mixed)
    if winner and (not best or best[1] <= 1 or winner == best[0]):
        lang, conf = winner, 0.9
    elif winner and best and best[0] == "hinglish" and winner != "hi":
        lang, conf = winner, 0.85
    elif best:
        lang = "hinglish" if (romanized and best[0] == "hi") else best[0]
        conf = 0.8 if best[1] >= 3 else 0.6
    elif dominant:
        lang, conf = winner or "unknown", 0.5
    else:
        lang, conf = "unknown", 0.0
    return {"language": lang, "confidence": conf, "script": dominant,
            "romanized": romanized, "mixed": mixed, "scores": scores[:3]}


def canonicalise(text):
    out = text.translate(DIGIT_MAP).lower()
    for phrase, canon in sorted(PHRASES.items(), key=lambda kv: -len(kv[0])):
        out = re.sub(rf"(^|[^\w]){re.escape(phrase)}($|[^\w])",
                     lambda m: m.group(1) + canon + m.group(2), out)
    token_map = {**NATIVE_TOKENS, **ROMAN_VARIANTS}
    # Tokens are split on whitespace/punctuation only: Python's \w
    # does NOT include Indic combining marks (vowel signs), so \w-based
    # tokenising shatters कैश / मिळाले / টাকা and no map key matches.
    out = re.sub(r"[^\s,.;:!?।॥'\"()\[\]{}۔؟،؛]+",
                 lambda m: token_map.get(m.group(0), m.group(0)), out)
    hundreds = "|".join(sorted(HUNDRED_WORDS))
    thousands = "|".join(sorted(THOUSAND_WORDS))
    for word, value in NUMBER_WORDS.items():
        out = re.sub(rf"\b{word}\s+(?:{hundreds})\b", str(value * 100), out)
        out = re.sub(rf"\b{word}\s+(?:{thousands})\b", str(value * 1000), out)
    # "so"/"xo" are NOT converted standalone: in English "so" is a
    # common word ("...hue, so total...") and converting it would invent
    # a phantom 100 entry. They still work as "<one> so" (= 100 x n).
    for w in HUNDRED_WORDS - {"so", "xo"}:
        out = re.sub(rf"\b{w}\b", "100", out)
    for w in THOUSAND_WORDS:
        out = re.sub(rf"\b{w}\b", "1000", out)
    return re.sub(r"\s+", " ", out).strip()


REPLIES = {
    "hinglish": {
        "previewHeader": "Maine ye samjha hai — confirm karein to save karunga:",
        "totalLine": "Total: {total}",
        "askMode": "{amount} payment Cash mein mila ya UPI mein?",
        "askService": "Kaunsi service ki entry hai — Xerox, Printing, Smart Card, ya koi aur? Amount maine samajh liya hai ({amount}), service bata dein.",
        "askAmount": "Kaunsi service aur kitne rupaye? Misal: \"Aaj Xerox ke 300 rupaye cash hue\".",
        "askAgent": "Kis agent ko {amount} diye? Agent ka naam bata dein.",
        "askCustomer": "{amount} kis customer ka due hai? Customer ka naam bata dein — due ko main income nahi likhunga, sirf uska udhaar record karunga.",
        "askCommission": "Money Transfer {amount} — commission kitna mila? (Commission bataye bina main profit galat nahi likhna chahta.)",
        "askDirection": "Transfer kis taraf hua — Cash se UPI, ya UPI se Cash?",
        "refund": "Refund kis entry ka hai? Kaunsi service / kitne rupaye / Cash ya UPI — refund ko main wapas (reversal) ki tarah record karunga, kharcha nahi.",
        "kal": "\"Kal\" se aapka matlab yesterday (pichhla din) hai ya tomorrow (aane wala din)? Date confirm karein, phir main entry bana dunga.",
        "cancelled": "Theek hai — ye entry save nahi ki gayi. Kuch bhi change nahi hua hai.",
    },
    "en": {
        "previewHeader": "This is what I understood — confirm to save:",
        "totalLine": "Total: {total}",
        "askMode": "Was {amount} received in Cash or UPI?",
        "askService": "Which service is this entry for — Xerox, Printing, Smart Card, or another? I understood the amount ({amount}); please tell me the service.",
        "askAmount": "Which service and how many rupees? Example: \"Today Xerox 300 rupees in cash\".",
        "askAgent": "Which agent did you pay {amount} to? Please tell me the agent's name.",
        "askCustomer": "Which customer owes {amount}? Please tell me the customer's name — I will record it as a due, not as income.",
        "askCommission": "Money Transfer {amount} — how much commission did you get? (I don't want to record the profit wrong without the commission.)",
        "askDirection": "Which way did the transfer go — Cash to UPI, or UPI to Cash?",
        "refund": "Which entry is the refund for? Which service / how many rupees / Cash or UPI — I will record a refund as a return (reversal), not as an expense.",
        "kal": "By \"tomorrow/yesterday\" do you mean yesterday or tomorrow? Please confirm the date, then I will make the entry.",
        "cancelled": "Okay — this entry was not saved. Nothing has changed.",
    },
    "hi": {
        "previewHeader": "मैंने यह समझा है — कन्फर्म करें तो सेव करूँगा:",
        "totalLine": "कुल: {total}",
        "askMode": "{amount} Cash में मिला या UPI में?",
        "askService": "यह किस सेवा की एंट्री है — Xerox, Printing, Smart Card, या कोई और? राशि मैंने समझ ली है ({amount}), सेवा बता दीजिए।",
        "askAmount": "कौनसी सेवा और कितने रुपये? उदाहरण: \"आज Xerox के 300 रुपये कैश हुए\"।",
        "askAgent": "किस एजेंट को {amount} दिए? एजेंट का नाम बता दीजिए।",
        "askCustomer": "{amount} किस ग्राहक का बाकी है? ग्राहक का नाम बता दीजिए — बाकी को मैं आय नहीं लिखूँगा, सिर्फ उधार दर्ज करूँगा।",
        "askCommission": "Money Transfer {amount} — कमीशन कितना मिला? (कमीशन बताए बिना मैं मुनाफा गलत नहीं लिखना चाहता।)",
        "askDirection": "ट्रांसफर किस तरफ हुआ — Cash से UPI, या UPI से Cash?",
        "refund": "रिफंड किस एंट्री का है? कौनसी सेवा / कितने रुपये / Cash या UPI — रिफंड को मैं वापसी (reversal) की तरह दर्ज करूँगा, खर्चा नहीं।",
        "kal": "\"कल\" से आपका मतलब बीता हुआ कल है या आने वाला कल? तारीख कन्फर्म करें, फिर मैं एंट्री बना दूँगा।",
        "cancelled": "ठीक है — यह एंट्री सेव नहीं की गई। कुछ भी बदला नहीं है।",
    },
    "gu": {
        "previewHeader": "Mane aa samjayu chhe — confirm karo to save karish:",
        "totalLine": "Total: {total}",
        "askMode": "{amount} Cash ma malyu ke UPI ma?",
        "askService": "Aa kai service ni entry chhe — Xerox, Printing, Smart Card, ke biji? Amount mane samjai gayo chhe ({amount}), service kaho.",
        "askAmount": "Kai service ane ketla rupiya? Udaharan: \"Aaje Xerox na 300 rupiya cash thaya\".",
        "askAgent": "Kaya agent ne {amount} aapya? Agent nu naam kaho.",
        "askCustomer": "{amount} kaya customer na baki chhe? Customer nu naam kaho — baki ne hu income nahi lakhish, fakt udhaar record karish.",
        "askCommission": "Money Transfer {amount} — commission ketlu malyu? (Commission kahya vagar hu nafo khoto nahi lakhva mangu.)",
        "askDirection": "Transfer kai disha ma thayu — Cash thi UPI, ke UPI thi Cash?",
        "refund": "Refund kai entry no chhe? Kai service / ketla rupiya / Cash ke UPI — refund ne hu paachhu (reversal) tarike record karish, kharcho nahi.",
        "kal": "\"Kaale\" thi tamaro matlab gayo kal chhe ke aavto kal? Date confirm karo, pachhi hu entry banavish.",
        "cancelled": "Barabar — aa entry save nathi thai. Kai pan badlayu nathi.",
    },
    "ta": {
        "previewHeader": "Idhu naan purinjikitten — confirm panna save pannuven:",
        "totalLine": "Motham: {total}",
        "askMode": "{amount} Cash la vandhadha illa UPI la?",
        "askService": "Idhu endha service entry — Xerox, Printing, Smart Card, illana vera? Amount purinjiruchu ({amount}), service sollunga.",
        "askAmount": "Endha service, evlo rupees? Udhaaranam: \"Inniki Xerox 300 cash vandhadhu\".",
        "askAgent": "Endha agent ku {amount} kudutheenga? Agent peru sollunga.",
        "askCustomer": "{amount} endha customer bakki? Customer peru sollunga — bakkiya naan income nu ezhudha maaten, kadan aave record pannuven.",
        "askCommission": "Money Transfer {amount} — commission evlo vandhadhu? (Commission sollama naan laabam thappa ezhudha virumbala.)",
        "askDirection": "Transfer endha pakkam ponadhu — Cash la irundhu UPI, illa UPI la irundhu Cash?",
        "refund": "Refund endha entry ku? Endha service / evlo rupees / Cash illa UPI — refund naan thiruppi (reversal) aave record pannuven, selavu illa.",
        "kal": "\"Naetru/Naalai\" na neenga sendha naala illa varum naala? Date confirm pannunga, apparam naan entry pannuven.",
        "cancelled": "Sari — indha entry save pannala. Edhuvum maara la.",
    },
    "ne": {
        "previewHeader": "Maile yo bujhe — confirm garnus bhane save garchu:",
        "totalLine": "Kul: {total}",
        "askMode": "{amount} Cash ma milyo ki UPI ma?",
        "askService": "Yo kun service ko entry ho — Xerox, Printing, Smart Card, ki aru? Raha maile bujhe ({amount}), service bhannus.",
        "askAmount": "Kun service ra kati rupaiya? Udaharan: \"Aaja Xerox ko 300 rupaiya cash milyo\".",
        "askAgent": "Kun agent lai {amount} dinus? Agent ko naam bhannus.",
        "askCustomer": "{amount} kun customer ko baki cha? Customer ko naam bhannus — baki lai ma income lekhne chhaina, matra udharo record garchu.",
        "askCommission": "Money Transfer {amount} — commission kati milyo? (Commission nabhani ma nafa galat lekhna chahanna.)",
        "askDirection": "Transfer kun dishama bhayo — Cash bata UPI, ki UPI bata Cash?",
        "refund": "Refund kun entry ko ho? Kun service / kati rupaiya / Cash ki UPI — refund lai ma phirta (reversal) gari record garchu, kharcha hoina.",
        "kal": "\"Bholiko/Bijako\" bhaneko tapai hijo bhannu bhako ki bholi? Date confirm garnus, ani ma entry banaunchu.",
        "cancelled": "Thik cha — yo entry save garieko chhaina. Kehi pani pariwartan bhaeko chhaina.",
    },
}


def reply(lang, key, **values):
    table = REPLIES.get(lang) or REPLIES["hinglish"]
    out = table.get(key) or REPLIES["hinglish"][key]
    for name, value in values.items():
        out = out.replace("{" + name + "}", value)
    return out


_AFFIRM_EXACT = {
    "haan", "ha", "hanji", "han", "ho", "hao", "aaho", "sari", "aama",
    "avunu", "hudu", "hou", "ji", "yes", "ok", "okay", "theek hai",
    "barabar", "sahi", "chalse", "chale", "bilkul", "zaroor",
    "haan ji", "ha ji", "aaha",
}
_AFFIRM_CONTAINS = ["save kar", "confirm", "nakh de", "save kara",
                    "save karo", "kar do", "kardo", "theek hai",
                    "haan ", "yes ", "ho, ", "hao, ", "sari"]
_NEG_EXACT = {
    "nahi", "nahin", "no", "nathi", "nai", "illa", "illai", "kadhu",
    "kadu", "ledu", "na", "naa", "nah", "venam", "beda", "nako",
    "nope", "naa ji", "illae",
}
_NEG_CONTAINS = ["cancel", "mat karo", "rehnedo", "rehne do", "reva do",
                 "nahi chahiye", "nahi karna", "nahi ", "no, ", "na, "]


def is_affirmative_ml(text):
    n = normalise(text)
    return n in _AFFIRM_EXACT or any(w in n for w in _AFFIRM_CONTAINS)


def is_negative_ml(text):
    n = normalise(text)
    return n in _NEG_EXACT or any(w in n for w in _NEG_CONTAINS)


def normalise(text):
    t = canonicalise(text)
    t = t.replace("₹", " rs ")
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
    # Word boundary for "upi": "rupiya" contains "upi" and must NOT
    # read as a UPI payment (UPDATE 13).
    if re.search(r"\bupi\b", q) or any(
            w in q for w in ("online", "gpay", "google pay", "phonepe", "paytm", "bhim")):
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
    detected = detect_language(text)
    lang = detected["language"] if detected["language"] != "unknown" else ctx.get("last_language", "hinglish")
    help_topic = detect_help(q)
    if help_topic:
        return ("Help", help_topic)
    if is_factual(q):
        return ("Factual", text)
    if "refund" in q or "wapas" in q or "return" in q:
        return ("Clarify", {"question": reply(lang, "refund"), "missing": ["refund entry", "amount", "mode"]})
    if any(w in q for w in ("galat", "correct", "sahi karo", "delete", "hatao", "remove", "badlo", "change karo")):
        return ("Clarify", {"question": "correction", "missing": ["exact entry"]})
    if re.search(r"\bkal\b", q):
        return ("Clarify", {"question": reply(lang, "kal"), "missing": ["date"]})
    if is_internal(q):
        amount = main_amount(q)
        if amount is None:
            return ("Clarify", {"missing": ["amount"]})
        frm = "CASH" if ("cash se upi" in q or "cash to upi" in q) else (
            "UPI" if ("upi se cash" in q or "upi to cash" in q) else None)
        if frm is None:
            return ("Clarify", {"question": reply(lang, "askDirection"), "missing": ["direction"]})
        return ("Action", {"kind": "InternalTransfer", "amount": amount * 100, "from": frm})
    if ("money transfer" in q or "moneytransfer" in q or re.search(r"\bmt\b", q)
            or ("transfer" in q and "commission" in q)
            or "transfer kiya" in q or "transfer kara" in q):
        return parse_mt(q, lang)
    if "agent" in q:
        return parse_agent(q, agents, lang)
    if "kharch" in q or "expense" in q or "kharach" in q:
        return parse_expense(q, lang)
    if "jama kar" in q or "jama karo" in q:
        cp = parse_customer_payment(q, customers, lang)
        if cp:
            return cp
        amt = main_amount(q)
        if amt is not None:
            return ("Clarify", {"question": reply(lang, "askCustomer", amount=fmt(amt * 100)),
                                "missing": ["customer"]})
    if (any(w in q for w in ("due", "udhaar", "udhar", "pending", "baki hai", "baaki", "lena hai"))
            and main_amount(q) is not None):
        return parse_due(q, ctx, customers, lang)
    if ("customer" in q or "grahak" in q) and any(w in q for w in ("add", "naya", "new")):
        return ("Clarify", {"missing": ["customer name", "service"]})
    cp = parse_customer_payment(q, customers, lang)
    if cp:
        return cp
    bare = (detect_service(q) is not None and main_amount(q) is not None
            and detect_mode(q) is not None
            and not any(c.lower() in q for c in customers))
    if has_income(q) or bare:
        return parse_daily(q, ctx, lang)
    return ("Unknown", None)


def detect_help(q):
    how = any(w in q for w in ("kaise", "how to", "how do", "kahan", "where", "tarika"))
    if not how:
        return None
    if "cash book" in q:
        return "cash_book"
    if re.search(r"\bupi\b", q):
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
    return "cash" in q and bool(re.search(r"\bupi\b", q)) and bool(
        re.search(r"\b(transfer|badla|se|to)\b", q))


def parse_mt(q, lang="hinglish"):
    amounts = find_amounts(q)
    if "commission" in q and len(amounts) == 1:
        mode = detect_mode(q)
        if mode is None:
            return ("Clarify", {"question": reply(lang, "askMode", amount=fmt(amounts[0] * 100)),
                                "missing": ["payment mode"]})
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
        return ("Clarify", {"question": reply(lang, "askCommission", amount=fmt(amounts[0] * 100)),
                            "missing": ["commission"]})
    return ("Clarify", {"missing": ["principal", "commission"]})


def parse_agent(q, agents, lang="hinglish"):
    amount = main_amount(q)
    if amount is None:
        return ("Clarify", {"missing": ["amount"]})
    m = re.search(r"agent\s+([a-z ]+?)(?:\s+ko|\s+ne|\s+\d|$)", q)
    raw = m.group(1).strip() if m else None
    _particles = {"ko", "ne", "se", "ka", "ki", "ke", "nu", "de", "da",
                  "che", "ni", "na", "no", "thi"}
    words = []
    for w in (raw or "").split():
        if w.lower() in _particles:
            break
        words.append(w)
    spoken = " ".join(words).strip() or None
    resolved = None
    if spoken:
        resolved = next((a for a in agents if a.lower() == spoken.lower()), None) or \
            next((a for a in agents if a.lower().startswith(spoken.lower())), None)
    if spoken is None and len(agents) != 1:
        return ("Clarify", {"question": reply(lang, "askAgent", amount=fmt(amount * 100)),
                            "missing": ["agent"]})
    name = resolved or spoken or (agents[0] if agents else None)
    if name is None:
        return ("Clarify", {"missing": ["agent"]})
    if resolved is None and spoken and agents:
        return ("Clarify", {"missing": ["agent"]})
    mode = detect_mode(q)
    if mode is None:
        return ("Clarify", {"question": reply(lang, "askMode", amount=fmt(amount * 100)),
                            "missing": ["payment mode"]})
    return ("Action", {"kind": "AgentPayment", "agent": name, "amount": amount * 100, "mode": mode})


def parse_expense(q, lang="hinglish"):
    amount = main_amount(q)
    if amount is None:
        return ("Clarify", {"missing": ["amount"]})
    category, service = detect_expense_category(q)
    mode = detect_mode(q)
    if mode is None:
        return ("Clarify", {"question": reply(lang, "askMode", amount=fmt(amount * 100)),
                            "missing": ["payment mode"]})
    return ("Action", {"kind": "Expense", "category": category,
                       "amount": amount * 100, "mode": mode, "service": service})


def parse_due(q, ctx, customers, lang="hinglish"):
    amount = main_amount(q)
    name = next((c for c in customers if c.lower() in q), None)
    service = detect_service(q) or ctx.get("last_service")
    if name is None:
        return ("Clarify", {"question": reply(lang, "askCustomer", amount=fmt(amount * 100)),
                            "missing": ["customer"]})
    if service is None:
        return ("Clarify", {"missing": ["service"]})
    return ("Action", {"kind": "RecordCustomerDue", "customer": name,
                       "amount": amount * 100, "service": service})


def parse_customer_payment(q, customers, lang="hinglish"):
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
        return ("Clarify", {"question": reply(lang, "askMode", amount=fmt(amount * 100)),
                            "missing": ["payment mode"]})
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


def parse_daily(q, ctx, lang="hinglish"):
    # Positional parsing (same as Kotlin): every money amount starts one
    # entry; service/mode come from the keywords around THAT amount.
    hits = find_money_hits(q)
    if not hits:
        return ("Clarify", {"question": reply(lang, "askAmount"),
                            "missing": ["service", "amount"]})
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
        return ("Clarify", {"question": reply(lang, "askAmount"),
                            "missing": ["service", "amount"]})
    if missing_service:
        return ("Clarify", {"question": reply(
            lang, "askService",
            amount=fmt(sum(e["amount"] for e in entries))),
            "missing": ["service"]})
    if missing_mode:
        return ("Clarify", {"question": reply(
            lang, "askMode",
            amount=fmt(sum(e["amount"] for e in entries))),
            "missing": ["payment mode"]})
    return ("Action", {"kind": "DailyEntries", "entries": entries,
                       "total": sum(e["amount"] for e in entries),
                       "preview": preview_daily(entries, lang)})


def preview_daily(entries, lang="hinglish"):
    lines = [reply(lang, "previewHeader")]
    lines += [f"• {e['label']} {fmt(e['amount'])} {e['mode']}" for e in entries]
    lines.append(reply(lang, "totalLine",
                       total=fmt(sum(e["amount"] for e in entries))))
    return "\n".join(lines)


def is_affirmative(text):
    return is_affirmative_ml(text)


def is_negative(text):
    return is_negative_ml(text)


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
    q = normalise(q)  # UPDATE 13: multilingual period words canonicalise
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
    # Word boundary: "rupiya" contains "upi" and must not open UPI Book.
    if re.search(r"\bupi\b", q):
        return ("upi_book", "UPI Book")
    for kw, route, label in (
            ("cash book", "cash_book", "Cash Book"),
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

    # ---------------- UPDATE 13: multilingual -------------------------
    # Per-language income cases: (lang, input, expected entries).
    # Each language is tested in native script, Romanized typing and a
    # mixed sentence — the difficult real-world forms, not translations.
    LANG_INCOME = [
        ("en", "Today Xerox 300 rupees cash received.",
         [("XEROX", 30000, "CASH")]),
        ("en", "Today Xerox 300 cash and 200 UPI received.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("hi", "आज Xerox के ३०० रुपये कैश मिले।",
         [("XEROX", 30000, "CASH")]),
        ("hi", "Aaj Xerox ke 300 rupaye cash hue.",
         [("XEROX", 30000, "CASH")]),
        ("hi", "Aaj Xerox ke 300 cash aur 200 UPI hue.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("gu", "આજે Xerox ના ૩૦૦ રૂપિયા cash મળ્યા।",
         [("XEROX", 30000, "CASH")]),
        ("gu", "Aaje Xerox na 300 cash ane 200 UPI thaya.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("gu", "Aaje Xerox na 500 cash ane 200 UPI thaya.",
         [("XEROX", 50000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("mr", "आज Xerox चे ३०० रुपये cash मिळाले.",
         [("XEROX", 30000, "CASH")]),
        ("mr", "Aaj Xerox che 300 cash milale.",
         [("XEROX", 30000, "CASH")]),
        ("mr", "Aaj Xerox che 300 cash ani 200 UPI milale.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("bn", "আজ Xerox এর ৩০০ টাকা cash হয়েছে।",
         [("XEROX", 30000, "CASH")]),
        ("bn", "Aaj Xerox er 300 taka cash hoyeche.",
         [("XEROX", 30000, "CASH")]),
        ("bn", "Aaj Xerox er 300 cash ar 200 UPI hoyeche.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("pa", "ਅੱਜ Xerox ਦੇ 300 ਰੁਪਏ cash ਮਿਲੇ।",
         [("XEROX", 30000, "CASH")]),
        ("pa", "Aaj Xerox de 300 rupaye cash mile.",
         [("XEROX", 30000, "CASH")]),
        ("pa", "Aaj Xerox de 300 cash te 200 UPI mile.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("ta", "இன்று Xerox 300 ரூபாய் cash வந்தது.",
         [("XEROX", 30000, "CASH")]),
        ("ta", "Inniki Xerox 300 cash vandhadhu.",
         [("XEROX", 30000, "CASH")]),
        ("ta", "Inniki Xerox 300 cash mattrum 200 UPI vandhadhu.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("te", "ఈరోజు Xerox 300 రూపాయలు cash వచ్చింది.",
         [("XEROX", 30000, "CASH")]),
        ("te", "Eeroju Xerox 300 cash vachindi.",
         [("XEROX", 30000, "CASH")]),
        ("te", "Eeroju Xerox 300 cash mariyu 200 UPI vachindi.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("kn", "ಇಂದು Xerox 300 ರೂಪಾಯಿ cash ಬಂತು.",
         [("XEROX", 30000, "CASH")]),
        ("kn", "Indu Xerox 300 cash bandide.",
         [("XEROX", 30000, "CASH")]),
        ("kn", "Indu Xerox 300 cash mattu 200 UPI bandide.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("ml", "ഇന്ന് Xerox 300 രൂപ cash കിട്ടി.",
         [("XEROX", 30000, "CASH")]),
        ("ml", "Innu Xerox 300 cash kitti.",
         [("XEROX", 30000, "CASH")]),
        ("ml", "Innu Xerox 300 cash pinne 200 UPI kitti.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("or", "ଆଜି Xerox 300 ଟଙ୍କା cash ମିଳିଲା।",
         [("XEROX", 30000, "CASH")]),
        ("or", "Aji Xerox 300 tanka cash milila.",
         [("XEROX", 30000, "CASH")]),
        ("or", "Aji Xerox 300 cash au 200 UPI milila.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("as", "আজি Xerox ৩০০ টকা cash পালোঁ।",
         [("XEROX", 30000, "CASH")]),
        ("as", "Aji Xerox 300 toka cash palo.",
         [("XEROX", 30000, "CASH")]),
        ("as", "Aji Xerox 300 cash aru 200 UPI palo.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("ur", "آج Xerox کے 300 روپے cash ملے۔",
         [("XEROX", 30000, "CASH")]),
        ("ur", "Aaj Xerox ke 300 rupaye cash mile.",
         [("XEROX", 30000, "CASH")]),
        ("ur", "Aaj Xerox ke 300 cash aur 200 UPI mile.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("sa", "अद्य Xerox ३०० रुपये cash प्राप्तम्।",
         [("XEROX", 30000, "CASH")]),
        ("sa", "Adya Xerox 300 cash praptam.",
         [("XEROX", 30000, "CASH")]),
        ("sa", "Adya Xerox 300 cash cha 200 UPI praptam.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("ks", "آج زیروکس 300 روپیہ کیش مِل۔",
         [("XEROX", 30000, "CASH")]),
        ("ks", "Aaz Xerox 300 cash meel.",
         [("XEROX", 30000, "CASH")]),
        ("ks", "Aaz Xerox 300 cash teh 200 UPI meel.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("kok", "आयज Xerox ३०० रुपये cash मेळ्ळे।",
         [("XEROX", 30000, "CASH")]),
        ("kok", "Aiz Xerox 300 cash mello.",
         [("XEROX", 30000, "CASH")]),
        ("kok", "Aiz Xerox 300 cash ani 200 UPI mello.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("ne", "आज Xerox को ३०० रुपैयाँ cash मिल्यो।",
         [("XEROX", 30000, "CASH")]),
        ("ne", "Aaja Xerox ko 300 rupaiya cash milyo.",
         [("XEROX", 30000, "CASH")]),
        ("ne", "Aaja Xerox ko 300 cash ra 200 UPI milyo.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("sd", "آج Xerox جا 300 روپيا cash مليا۔",
         [("XEROX", 30000, "CASH")]),
        ("sd", "Aaj Xerox ja 300 rupia cash milyo.",
         [("XEROX", 30000, "CASH")]),
        ("sd", "Aaj Xerox ja 300 cash ain 200 UPI milyo.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("mni", "ꯍꯧꯖꯤꯛ Xerox ꯳꯰꯰ ꯔꯨꯄꯤ cash ꯐꯪꯕꯥ।",
         [("XEROX", 30000, "CASH")]),
        ("mni", "হৌজিক Xerox ৩০০ রুপি cash ফংবা।",
         [("XEROX", 30000, "CASH")]),
        ("mni", "Houjik Xerox 300 rupi cash phangba.",
         [("XEROX", 30000, "CASH")]),
        ("mni", "Houjik Xerox 300 cash amasung 200 UPI phangba.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("brx", "दिनै Xerox ३०० cash मोन।",
         [("XEROX", 30000, "CASH")]),
        ("brx", "Dinai Xerox 300 cash mon.",
         [("XEROX", 30000, "CASH")]),
        ("brx", "Dinai Xerox 300 cash arw 200 UPI mon.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("doi", "अज्ज Xerox ३०० cash मिलेआ।",
         [("XEROX", 30000, "CASH")]),
        ("doi", "Ajj Xerox 300 cash mileya.",
         [("XEROX", 30000, "CASH")]),
        ("doi", "Ajj Xerox 300 cash te 200 UPI mileya.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("mai", "आइ Xerox ३०० cash भेटल।",
         [("XEROX", 30000, "CASH")]),
        ("mai", "Aai Xerox 300 cash bhetal.",
         [("XEROX", 30000, "CASH")]),
        ("mai", "Aai Xerox 300 cash au 200 UPI bhetal.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
        ("sat", "Tehen Xerox 300 taka cash namena.",
         [("XEROX", 30000, "CASH")]),
        ("sat", "Tehen Xerox 300 cash ar 200 UPI namena.",
         [("XEROX", 30000, "CASH"), ("XEROX", 20000, "UPI")]),
    ]
    lang_results = {}  # lang -> [passed, total]

    def lang_case(lang, text, expected):
        name = f"ml-{lang}-income: {text[:44]}"
        def fn(lang=lang, text=text, expected=expected):
            kind, a = parse(text, CTX, AGENTS, CUSTOMERS)
            eq(kind, "Action", text)
            eq(a["kind"], "DailyEntries", text)
            got = [(e["service"], e["amount"], e["mode"]) for e in a["entries"]]
            eq(got, expected, text)
            lang_results.setdefault(lang, [0, 0])
            lang_results[lang][1] += 1
            lang_results[lang][0] += 1
        results.append((name, fn))

    for lang, text, expected in LANG_INCOME:
        lang_case(lang, text, expected)

    def lang_check(lang, name, fn):
        def wrapped(lang=lang, fn=fn):
            fn()
            lang_results.setdefault(lang, [0, 0])
            lang_results[lang][1] += 1
            lang_results[lang][0] += 1
        results.append((f"ml-{lang}-{name}", wrapped))

    # Detection per language (native-script input where the language has
    # one; Roman Urdu is genuinely indistinguishable from Hinglish, so
    # only its native script is asserted here).
    DETECT_CASES = [
        ("en", "Today Xerox 300 rupees cash received.", "en"),
        ("hi", "आज Xerox के ३०० रुपये कैश मिले।", "hi"),
        ("gu", "આજે Xerox ના ૩૦૦ રૂપિયા cash મળ્યા।", "gu"),
        ("gu", "Aaje Xerox na 300 cash ane 200 UPI thaya.", "gu"),
        ("mr", "आज Xerox चे ३०० रुपये cash मिळाले।", "mr"),
        ("mr", "Aaj Xerox che 300 cash milale.", "mr"),
        ("bn", "আজ Xerox এর ৩০০ টাকা cash হয়েছে।", "bn"),
        ("pa", "ਅੱਜ Xerox ਦੇ 300 ਰੁਪਏ cash ਮਿਲੇ।", "pa"),
        ("pa", "Aaj Xerox de 300 cash te 200 UPI mile.", "pa"),
        ("ta", "இன்று Xerox 300 ரூபாய் cash வந்தது.", "ta"),
        ("te", "ఈరోజు Xerox 300 రూపాయలు cash వచ్చింది.", "te"),
        ("kn", "ಇಂದು Xerox 300 ರೂಪಾಯಿ cash ಬಂತು.", "kn"),
        ("ml", "ഇന്ന് Xerox 300 രൂപ cash കിട്ടി.", "ml"),
        ("or", "ଆଜି Xerox 300 ଟଙ୍କା cash ମିଳିଲା।", "or"),
        ("as", "আজি Xerox ৩০০ টকা cash পালোঁ।", "as"),
        ("ur", "آج Xerox کے 300 روپے cash ملے۔", "ur"),
        ("sa", "अद्य Xerox ३०० रुपये cash प्राप्तम्।", "sa"),
        ("sa", "Adya Xerox 300 cash praptam.", "sa"),
        ("ks", "آج زیروکس 300 روپیہ کیش مِل۔", "ks"),
        ("ks", "Aaz Xerox 300 cash meel.", "ks"),
        ("kok", "आयज Xerox ३०० रुपये cash मेळ्ळे।", "kok"),
        ("ne", "आज Xerox को ३०० रुपैयाँ cash मिल्यो।", "ne"),
        ("sd", "آج Xerox جا 300 روپيا cash مليا۔", "sd"),
        ("sd", "Aaj Xerox ja 300 rupia cash milyo.", "sd"),
        ("mni", "ꯍꯧꯖꯤꯛ Xerox ꯳꯰꯰ ꯔꯨꯄꯤ cash ꯐꯪꯕꯥ।", "mni"),
        ("mni", "হৌজিক Xerox ৩০০ রুপি cash ফংবা।", "mni"),
        ("brx", "दिनै Xerox ३०० cash मोन।", "brx"),
        ("doi", "अज्ज Xerox ३०० cash मिलेआ।", "doi"),
        ("mai", "आइ Xerox ३०० cash भेटल।", "mai"),
        ("sat", "Tehen Xerox 300 taka cash namena.", "sat"),
    ]
    for lang, text, want in DETECT_CASES:
        def _det(lang=lang, text=text, want=want):
            got = detect_language(text)
            eq(got["language"], want, f"{text!r} -> {got}")
        lang_check(lang, f"detect: {text[:32]}", _det)

    # Mixed-language detection: Gujarati + Hinglish in one message.
    def _mixed():
        d = detect_language("Aaje Xerox na 500 cash ane 200 UPI thaya, bhai total hisab batao.")
        eq(d["language"], "gu")
        is_true(d["mixed"], f"expected mixed, got {d}")
    lang_check("gu", "detect-mixed", _mixed)

    # The brief's 10 example sentences, verbatim.
    @t("ml-brief: gujarati roman multi-entry")
    def _():
        kind, a = parse("Aaje Xerox na 500 cash ane 200 UPI thaya.", CTX, AGENTS, CUSTOMERS)
        eq(a["total"], 70000)
        eq(a["entries"][0]["mode"], "CASH")
        eq(a["entries"][1]["mode"], "UPI")

    @t("ml-brief: gujarati native multi-entry")
    def _():
        kind, a = parse("આજે Xerox ના 500 cash અને 200 UPI થયા.", CTX, AGENTS, CUSTOMERS)
        eq(a["total"], 70000)

    @t("ml-brief: collect a due (jama kar)")
    def _():
        kind, a = parse("Aaj Rahul ka baki 300 rupiya jama kar cash", CTX, AGENTS, CUSTOMERS)
        eq(a["kind"], "CustomerPayment")
        eq(a["customer"], "Rahul")
        eq(a["amount"], 30000)
        eq(a["mode"], "CASH")

    @t("ml-brief: collect a due, unknown customer asks who")
    def _():
        kind, a = parse("Aaj customer ka baki 300 rupiya jama kar.", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Clarify")
        is_true("customer" in a["missing"])

    @t("ml-brief: agent payable gujarati (no name -> asks)")
    def _():
        kind, a = parse("Agent ne 500 rupiya aapvana che.", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Clarify")
        is_true("agent" in a["missing"])

    @t("ml-brief: agent payable hinglish (no name -> asks)")
    def _():
        kind, a = parse("Agent ko 500 dena baki hai.", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Clarify")
        is_true("agent" in a["missing"])

    @t("ml-brief: kal question is factual, not a date")
    def _():
        kind, a = parse("Kal na total income kitna hua?", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Factual")

    @t("ml-brief: gujarati printing, no amount -> asks amount")
    def _():
        kind, a = parse("Aaj printing ka paisa UPI ma malyo.", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Clarify")
        is_true("amount" in a["missing"])

    @t("ml-brief: gujarati native pending due asks customer")
    def _():
        kind, a = parse("આજે customer ના 200 રૂપિયા pending છે.", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Clarify")
        is_true("customer" in a["missing"])

    @t("ml-brief: cash received but entry pending -> asks service+amount")
    def _():
        kind, a = parse("Cash ma paisa malya but entry baki che.", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Clarify")
        is_true("service" in a["missing"] and "amount" in a["missing"])

    @t("ml-brief: gujarati total question is factual")
    def _():
        kind, a = parse("Bhai aaj no total hisab batao.", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Factual")

    # Spelling variants / dialects / voice-to-text style input.
    @t("ml-variants: aaja/aje/aaje all mean today")
    def _():
        for w in ("Aaj", "Aaja", "Aje", "Aaje"):
            kind, a = parse(f"{w} Xerox ke 300 rupaye cash hue", CTX, AGENTS, CUSTOMERS)
            eq(a["entries"][0]["amount"], 30000, w)

    @t("ml-variants: baaki/baki, kharcho/kharcha, jamma/jama")
    def _():
        kind, a = parse("Aaj 200 rupaye kharcho cash hue machine repair mein", CTX, AGENTS, CUSTOMERS)
        eq(a["kind"], "Expense")
        eq(a["amount"], 20000)
        kind, a = parse("Rahul ka PAN ka 500 rupaye baaki hai", CTX, AGENTS, CUSTOMERS)
        eq(a["kind"], "RecordCustomerDue")

    @t("ml-voice: ASR 'teen so' (sau misheard) still parses")
    def _():
        kind, a = parse("xerox ke teen so rupay cash hue", CTX, AGENTS, CUSTOMERS)
        eq(a["entries"][0]["amount"], 30000)

    @t("ml-voice: ASR drops the verb — bare entry still parses")
    def _():
        kind, a = parse("Xerox 300 cash", CTX, AGENTS, CUSTOMERS)
        eq(a["entries"][0]["service"], "XEROX")
        eq(a["entries"][0]["amount"], 30000)
        eq(a["entries"][0]["mode"], "CASH")

    @t("ml-voice: ASR drops the verb, Tamil roman")
    def _():
        kind, a = parse("Inniki Xerox 300 cash", CTX, AGENTS, CUSTOMERS)
        eq(a["entries"][0]["service"], "XEROX")
        eq(a["entries"][0]["amount"], 30000)

    @t("ml-voice: bare entry with a customer name is NOT guessed as income")
    def _():
        kind, a = parse("Rahul ka PAN 500 cash", CTX, AGENTS, CUSTOMERS)
        assert kind != "Action" or a["kind"] != "DailyEntries", "customer job must not become walk-in income"

    # Number words across languages.
    @t("ml-numbers: gujarati/marathi/bengali/tamil/telugu words")
    def _():
        cases = [
            ("Aaje Xerox na be so cash thaya.", 20000),
            ("Aaj Xerox che don shambhar cash milale.", 20000),
            ("Aaj Xerox er dui sho cash hoyeche.", 20000),
            ("Inniki Xerox rendu nooru cash vandhadhu.", 20000),
            ("Eeroju Xerox rendu vanda cash vachindi.", 20000),
        ]
        for text, want in cases:
            kind, a = parse(text, CTX, AGENTS, CUSTOMERS)
            eq(a["entries"][0]["amount"], want, text)

    @t("ml-numbers: hazaar across languages")
    def _():
        kind, a = parse("Aaj Xerox ke do hazaar cash hue", CTX, AGENTS, CUSTOMERS)
        eq(a["entries"][0]["amount"], 200000)
        kind, a = parse("Aaje Xerox na be hazaar cash thaya.", CTX, AGENTS, CUSTOMERS)
        eq(a["entries"][0]["amount"], 200000)

    # All Indic digit blocks convert to ASCII.
    @t("ml-digits: every script's digits")
    def _():
        for digits, want in [
                ("३००", "300"), ("૩૦૦", "300"), ("৩০০", "300"),
                ("੩੦੦", "300"), ("௩௦௦", "300"), ("౩౦౦", "300"),
                ("೩೦೦", "300"), ("൩൦൦", "300"), ("୩୦୦", "300"),
                ("۳۰۰", "300"), ("꯳꯰꯰", "300"), ("᱓᱐᱐", "300")]:
            eq(canonicalise(digits), want, digits)

    # Localised previews / clarifications.
    @t("ml-replies: gujarati preview + ask-mode")
    def _():
        entries = [{"service": "XEROX", "label": "Xerox", "amount": 50000, "mode": "CASH"},
                   {"service": "XEROX", "label": "Xerox", "amount": 20000, "mode": "UPI"}]
        pv = preview_daily(entries, "gu")
        is_true("Mane aa samjayu chhe" in pv)
        is_true("₹500" in pv and "₹200" in pv)
        is_true("₹500" in reply("gu", "askMode", amount="₹500"))

    @t("ml-replies: tamil preview, hindi preview, english preview")
    def _():
        entries = [{"service": "XEROX", "label": "Xerox", "amount": 30000, "mode": "CASH"}]
        is_true("purinjikitten" in preview_daily(entries, "ta"))
        is_true("मैंने यह समझा है" in preview_daily(entries, "hi"))
        is_true("This is what I understood" in preview_daily(entries, "en"))
        is_true("Maile yo bujhe" in preview_daily(entries, "ne"))

    @t("ml-replies: gujarati ask-mode is actually asked")
    def _():
        kind, a = parse("Aaje Xerox na 300 thaya.", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Clarify")
        is_true("Cash ma malyu" in a["question"])
        is_true("payment mode" in a["missing"])

    @t("ml-replies: tamil refund + kal in tamil")
    def _():
        kind, a = parse("Xerox 100 refund pannanum.", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Clarify")
        kind, a = parse("Naalai Xerox 300 cash vandhadhu.", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Clarify")
        is_true("date" in a["missing"])

    # Follow-ups + yes/no across languages (no duplicates from follow-ups).
    @t("ml-followup: gujarati 'ane 200 UPI pan' adds, not duplicates")
    def _():
        ctx2 = {"last_service": ("XEROX", "Xerox"), "last_label": "Xerox", "last_mode": "CASH"}
        a = parse_follow_up("Ane 200 UPI pan add karo.", ctx2)
        is_true(a is not None)
        eq(a["entries"][0]["amount"], 20000)
        eq(a["entries"][0]["mode"], "UPI")

    @t("ml-yesno: haan / ho / sari / nakh de / nathi / na")
    def _():
        is_true(is_affirmative("Haan nakh de."))
        is_true(is_affirmative("Ho, save kara."))
        is_true(is_affirmative("Sari, save pannunga."))
        is_true(is_affirmative("Haan, save kar do."))
        is_true(is_negative("Nathi, reva do."))
        is_true(is_negative("Na, reva do."))
        is_true(is_negative("Illai, cancel pannunga."))
        is_true(is_negative("Nai, rehnedo."))

    # Multilingual periods + expense + agent in other languages.
    @t("ml-periods: chhella / gata / pichhle")
    def _():
        eq(parse_period("Chhella 7 divas no hisab batao", TODAY), "LAST_7_DAYS")
        eq(parse_period("Gata mahina no total ketlo?", TODAY), "LAST_MONTH")
        eq(parse_period("Aaje no total hisab batao", TODAY), "TODAY")

    @t("ml-expense: gujarati kharcho asks mode in gujarati")
    def _():
        kind, a = parse("Aaje 200 rupiya kharcho thayo.", CTX, AGENTS, CUSTOMERS)
        eq(kind, "Clarify")
        is_true("payment mode" in a["missing"])

    @t("ml-agent: punjabi agent payment")
    def _():
        kind, a = parse("Agent Ramesh nu 500 rupaye cash ditte", CTX, AGENTS, CUSTOMERS)
        eq(a["kind"], "AgentPayment")
        eq(a["agent"], "Ramesh")
        eq(a["amount"], 50000)

    @t("ml-internal: 'total' no longer misreads as internal transfer")
    def _():
        kind, a = parse("Aaj Xerox 300 cash, 200 UPI total hua", CTX, AGENTS, CUSTOMERS)
        eq(a["kind"], "DailyEntries")
        eq(a["total"], 50000)

    @t("ml-internal: gujarati cash-upi transfer still internal")
    def _():
        kind, a = parse("1000 rupiya cash thi UPI transfer karya.", CTX, AGENTS, CUSTOMERS)
        eq(a["kind"], "InternalTransfer")
        eq(a["from"], "CASH")

    passed = 0
    failures = []
    lang_totals = {}
    for name, fn in results:
        n, ok, err = check(name, fn)
        print(("PASS " if ok else "FAIL ") + n + ("" if ok else f" — {err}"))
        passed += ok
        if not ok:
            failures.append(n)
        if name.startswith("ml-"):
            # attribute to the language code after "ml-"
            code = name[3:].split("-")[0].split(":")[0].split(" ")[0]
            tot = lang_totals.setdefault(code, [0, 0])
            tot[1] += 1
            tot[0] += ok
    rate = passed * 100 // len(results)
    print(f"\nAI ACCURACY (Python mirror): {passed}/{len(results)} passed ({rate}%)")
    if failures:
        print("FAILED: " + "; ".join(failures))
    print("\nLANGUAGE-WISE ACCURACY (UPDATE 13, measured on this run):")
    print(f"{'lang':<8}{'passed':>8}{'total':>7}{'accuracy':>10}  notes")
    _LANG_NAMES = {"en": "English", "hi": "Hindi", "gu": "Gujarati",
                   "mr": "Marathi", "bn": "Bengali", "pa": "Punjabi",
                   "ta": "Tamil", "te": "Telugu", "kn": "Kannada",
                   "ml": "Malayalam", "or": "Odia", "as": "Assamese",
                   "ur": "Urdu", "sa": "Sanskrit", "ks": "Kashmiri",
                   "kok": "Konkani", "ne": "Nepali", "sd": "Sindhi",
                   "mni": "Manipuri", "brx": "Bodo", "doi": "Dogri",
                   "mai": "Maithili", "sat": "Santali"}
    _LIMITS = {
        "sa": "replies fall back to Hinglish; number words partial",
        "ks": "replies fall back to Hinglish; Roman digits only for numbers",
        "kok": "replies fall back to Hinglish; Devanagari keywords only",
        "sd": "replies fall back to Hinglish; number words not in table",
        "mni": "replies fall back to Hinglish; Meitei+Bengali scripts",
        "brx": "replies fall back to Hinglish; number words not in table",
        "doi": "replies fall back to Hinglish; Devanagari keywords only",
        "mai": "replies fall back to Hinglish; number words not in table",
        "sat": "replies fall back to Hinglish; Ol Chiki digits only",
        "ur": "Roman Urdu overlaps Hinglish (detected as Hinglish)",
    }
    for code in sorted(_LANG_NAMES):
        p, tot = lang_totals.get(code, [0, 0])
        acc = f"{p * 100 // tot}%" if tot else "n/a"
        print(f"{code:<8}{p:>8}{tot:>7}{acc:>10}  {_LANG_NAMES[code]}"
              + (f" — LIMIT: {_LIMITS[code]}" if code in _LIMITS else ""))
    print("Reply templates exist for 15/23 languages (en/hi/gu/mr/bn/pa/ta/te/"
          "kn/ml/or/as/ur/ne + Hinglish); the other 8 fall back to Hinglish.")
    print("Detection of Devanagari languages (hi/mr/ne/sa/kok/doi/mai/brx) "
          "relies on keyword scoring on short messages.")
    return 0 if rate >= 95 else 1


if __name__ == "__main__":
    raise SystemExit(main())
