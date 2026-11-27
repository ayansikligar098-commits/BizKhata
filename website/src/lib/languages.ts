/**
 * BizKhata multilingual layer — UPDATE 13.
 *
 * All 22 scheduled Indian languages + English, in native script AND
 * Romanized form (Hinglish, Roman Gujarati, Roman Marathi, ...), plus
 * mixed-language sentences. This module is DATA-DRIVEN on purpose:
 * to add a word, spelling or dialect variant, add one entry to
 * VOCAB_ENTRIES / NUMBER_WORDS below — no parser `if` changes needed.
 *
 * How it works:
 *  1. `normalizeMultilingual()` maps every known word (native script or
 *     Romanized, any spelling variant) to one canonical Hinglish token
 *     the existing parser already understands (aaj, kal, kitna, munafa,
 *     kharcha, baaki, diye, mila, hue, ...), and converts every
 *     supported script's digits and number words to ASCII digits.
 *     The structured-action + knowledge pipelines then run UNCHANGED
 *     on the normalised text — one pipeline, 23 languages.
 *  2. `detectLanguage()` identifies language + writing style (script
 *     detection + Romanized keyword scoring) and detects mixed messages.
 *  3. `REPLY_TEMPLATES` gives the assistant short native replies for
 *     the common answers/clarifications in every supported language.
 *
 * Safety: normalisation never invents anything — it only translates
 * words the user actually wrote. Unknown words pass through untouched,
 * so an unrecognised message still reaches the clarification drafts
 * instead of being guessed at. No third-party provider is involved;
 * everything here is on-device and provider-free.
 */

export type AiLangCode =
  | 'en' | 'hi' | 'gu' | 'mr' | 'bn' | 'pa' | 'ta' | 'te' | 'kn' | 'ml'
  | 'or' | 'as' | 'ur' | 'sa' | 'ks' | 'kok' | 'ne' | 'sd' | 'mni'
  | 'brx' | 'doi' | 'mai' | 'sat';

export interface SupportedLanguage {
  code: AiLangCode;
  name: string;
  nativeName: string;
  /** BCP-47 tag for Web Speech API (voice input / speech synthesis). */
  bcp47: string;
  script: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English', bcp47: 'en-IN', script: 'Latin' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', bcp47: 'hi-IN', script: 'Devanagari' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', bcp47: 'gu-IN', script: 'Gujarati' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', bcp47: 'mr-IN', script: 'Devanagari' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', bcp47: 'bn-IN', script: 'Bengali' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', bcp47: 'pa-IN', script: 'Gurmukhi' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', bcp47: 'ta-IN', script: 'Tamil' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', bcp47: 'te-IN', script: 'Telugu' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', bcp47: 'kn-IN', script: 'Kannada' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', bcp47: 'ml-IN', script: 'Malayalam' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', bcp47: 'or-IN', script: 'Odia' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', bcp47: 'as-IN', script: 'Bengali' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', bcp47: 'ur-PK', script: 'Arabic' },
  { code: 'sa', name: 'Sanskrit', nativeName: 'संस्कृतम्', bcp47: 'sa-IN', script: 'Devanagari' },
  { code: 'ks', name: 'Kashmiri', nativeName: 'کٲشُر', bcp47: 'ks-IN', script: 'Arabic' },
  { code: 'kok', name: 'Konkani', nativeName: 'कोंकणी', bcp47: 'kok-IN', script: 'Devanagari' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', bcp47: 'ne-NP', script: 'Devanagari' },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي', bcp47: 'sd-PK', script: 'Arabic' },
  { code: 'mni', name: 'Manipuri (Meitei)', nativeName: 'মৈতৈলোন্', bcp47: 'mni-IN', script: 'Bengali' },
  { code: 'brx', name: 'Bodo', nativeName: 'बड़ो', bcp47: 'brx-IN', script: 'Devanagari' },
  { code: 'doi', name: 'Dogri', nativeName: 'डोगरी', bcp47: 'doi-IN', script: 'Devanagari' },
  { code: 'mai', name: 'Maithili', nativeName: 'मैथिली', bcp47: 'mai-IN', script: 'Devanagari' },
  { code: 'sat', name: 'Santali', nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ', bcp47: 'sat-IN', script: 'Ol Chiki' },
];

export const LANG_BY_CODE: Record<AiLangCode, SupportedLanguage> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((l) => [l.code, l]),
) as Record<AiLangCode, SupportedLanguage>;

/* ================= Script + digit detection ================= */

const SCRIPT_RANGES: { code: AiLangCode; re: RegExp; name: string }[] = [
  { code: 'gu', re: /[\u0A80-\u0AFF]/, name: 'Gujarati' },
  { code: 'bn', re: /[\u0980-\u09FF]/, name: 'Bengali/Assamese' },
  { code: 'pa', re: /[\u0A00-\u0A7F]/, name: 'Gurmukhi' },
  { code: 'ta', re: /[\u0B80-\u0BFF]/, name: 'Tamil' },
  { code: 'te', re: /[\u0C00-\u0C7F]/, name: 'Telugu' },
  { code: 'kn', re: /[\u0C80-\u0CFF]/, name: 'Kannada' },
  { code: 'ml', re: /[\u0D00-\u0D7F]/, name: 'Malayalam' },
  { code: 'or', re: /[\u0B00-\u0B7F]/, name: 'Odia' },
  { code: 'ur', re: /[\u0600-\u06FF]/, name: 'Arabic (Urdu/Kashmiri/Sindhi)' },
  { code: 'sat', re: /[\u1C50-\u1C7F]/, name: 'Ol Chiki (Santali)' },
  { code: 'mni', re: /[\uABC0-\uABFF]/, name: 'Meetei Mayek' },
  { code: 'hi', re: /[\u0900-\u097F]/, name: 'Devanagari' },
];

/** Digits in every supported script → ASCII. Built from the Unicode blocks. */
const DIGIT_BLOCKS: [number, AiLangCode][] = [
  [0x0AE6, 'gu'], [0x09E6, 'bn'], [0x0A66, 'pa'], [0x0BE6, 'ta'],
  [0x0C66, 'te'], [0x0CE6, 'kn'], [0x0D66, 'ml'], [0x0B66, 'or'],
  [0x0660, 'ur'], [0x06F0, 'ur'], // Arabic-Indic + Extended Arabic-Indic (Urdu)
  [0x1C50, 'sat'], [0xABF0, 'mni'], // Ol Chiki (Santali), Meetei Mayek (Manipuri)
];
const DIGIT_MAP: Record<string, string> = {};
for (const [base] of DIGIT_BLOCKS) {
  for (let d = 0; d <= 9; d++) DIGIT_MAP[String.fromCodePoint(base + d)] = String(d);
}
// Devanagari base above is 0x0966; the entry above computed 0x0906-6 = 0x0900 (wrong) — fix explicitly.
for (let d = 0; d <= 9; d++) DIGIT_MAP[String.fromCodePoint(0x0966 + d)] = String(d);

export function normalizeDigitsMultilingual(text: string): string {
  return text.replace(/./gu, (ch) => DIGIT_MAP[ch] ?? ch);
}

export function detectScript(text: string): { code: AiLangCode | 'en'; name: string } | null {
  for (const s of SCRIPT_RANGES) {
    if (s.re.test(text)) return { code: s.code, name: s.name };
  }
  return null;
}

/* ================= Vocabulary (expandable tables) =================
 * Each entry: canonical Hinglish token the parser understands, then
 * every known spelling — native script + Romanized + dialect variants.
 * Add a variant here and every parser, Q&A and clarification flow
 * understands it immediately. Canonical tokens are deliberately the
 * words the existing chatbot/knowledge regexes already match.
 */
type VocabEntry = [canonical: string, ...variants: string[]];

export const VOCAB_ENTRIES: VocabEntry[] = [
  // --- Time ---
  ['aaj', 'आज', 'આજે', 'আজ', 'ਅੱਜ', 'இன்று', 'ఈరోజు', 'ಇಂದು', 'ഇന്ന്', 'ଆଜି', 'আজি', 'آج', 'अद्य', 'آز', 'आज', 'तिहिन्', 'aaje', 'aje', 'aaja', 'ajj', 'inniki', 'indru', 'eeroju', 'ivattu', 'innu', 'aji', 'az', 'adya', 'ngasi', 'tihin', 'dinwi', 'aajka', 'aajke', 'दिनै', 'ᱛᱤᱦᱤᱧ', 'ꯉꯁꯤ', 'اڄ'],
  ['kal', 'कल', 'કાલે', 'কাল', 'ਕੱਲ੍ਹ', 'நேற்று', 'నిన్న', 'ನಿನ್ನೆ', 'ഇന്നലെ', 'ଗତକାଲି', 'কালি', 'کل', 'ह्यः', 'کالھ', 'हिजो', 'kale', 'kaale', 'gai kale', 'gaikale', 'kall', 'netru', 'ninna', 'ninne', 'innale', 'gatakali', 'kali', 'hijo', 'kalh', 'hyah'],
  ['parso', 'परसों', 'પરમદિવસે', 'পরশু', 'ਪਰਸੋਂ', 'நாளை மறுநாள்', 'ఎల్లుండి', 'ನಾಳಿದ್ದು', 'മറ്റന്നാൾ', 'ପରଦିନ', 'পৰহি', 'پرسوں', 'परश्वः', 'परसों', 'भोलि', 'parsu', 'parsoo', 'ellundi', 'naliddu', 'mattannal', 'paradin'],
  // --- Question words ---
  ['kitna', 'कितना', 'કેટલા', 'কত', 'ਕਿੰਨਾ', 'எவ்வளவு', 'ఎంత', 'ಎಷ್ಟು', 'എത്ര', 'କେତେ', 'কিমান', 'کتنا', 'कियत्', 'کتھ', 'कति', 'کترو', 'kitlo', 'kitla', 'ketla', 'ketlo', 'koto', 'kinna', 'evvalavu', 'entha', 'eshtu', 'ethra', 'kete', 'kiman', 'kati', 'katro', 'kith', 'kitni', 'kitne'],
  ['kya', 'क्या', 'શું', 'কি', 'ਕੀ', 'என்ன', 'ఏమిటి', 'ಏನು', 'എന്ത്', 'କଣ', 'কি', 'کیا', 'किम्', 'کیاھ', 'کیا', 'shu', 'su', 'ki', 'enna', 'emiti', 'enu', 'enthu', 'kana', 'kim', 'keh', 'kyaa'],
  ['kaun', 'कौन', 'કોણ', 'কে', 'ਕੌਣ', 'யார்', 'ఎవరు', 'ಯಾರು', 'ആര്', 'କିଏ', 'কোন', 'کون', 'कः', 'کوس', 'کير', 'kon', 'kone', 'yaar', 'evaru', 'yaaru', 'aar', 'kie', 'koon', 'kos', 'kaun'],
  ['kis', 'किस', 'કયા', 'কোন', 'ਕਿਸ', 'எந்த', 'ఏ', 'ಯಾವ', 'ഏത്', 'କେଉଁ', 'কোন', 'کس', 'कस्य', 'کس', 'कुन', 'کس', 'kya', 'kon', 'entha', 'yava', 'ethu', 'keun', 'kun', 'kas', 'kisko', 'kiske'],
  ['kab', 'कब', 'ક્યારે', 'কখন', 'ਕਦੋਂ', 'எப்போது', 'ఎప్పుడు', 'ಯಾವಾಗ', 'എപ്പോൾ', 'କେବେ', 'কেতিয়া', 'کب', 'कदा', 'کد', 'कहिले', 'کڏھن', 'kyare', 'kokhon', 'kadon', 'eppodhu', 'eppudu', 'yavaga', 'eppol', 'kebe', 'ketiya', 'kahile', 'kadhen'],
  ['kaise', 'कैसे', 'કેવી રીતે', 'কেমন', 'ਕਿਵੇਂ', 'எப்படி', 'ఎలా', 'ಹೇಗೆ', 'എങ്ങനെ', 'କେମିତି', 'কেনেকৈ', 'کیسے', 'कथम्', 'کینٛہ', 'कसरी', 'کئن', 'kevi rite', 'kemon', 'kiven', 'eppadi', 'ela', 'hege', 'engane', 'kemiti', 'kenekoi', 'kasari', 'kinh'],
  ['kahan', 'कहाँ', 'ક્યાં', 'কোথায়', 'ਕਿੱਥੇ', 'எங்கே', 'ఎక్కడ', 'ಎಲ್ಲಿ', 'എവിടെ', 'କେଉଁଠି', 'ক’ত', 'کہاں', 'कुत्र', 'کٔتۍ', 'कहाँ', 'کتھے', 'kya', 'kothay', 'kitthe', 'enge', 'ekkada', 'elli', 'evide', 'keunthi', 'kot', 'kutra', 'kathay'],
  // --- Verbs / actions ---
  ['batao', 'बताओ', 'બતાવો', 'বলো', 'ਦੱਸੋ', 'சொல்லுங்கள்', 'చెప్పండి', 'ಹೇಳಿ', 'പറയൂ', 'କୁହ', 'কোৱা', 'بتاؤ', 'वदतु', 'وَن', 'भन्नुहोस्', 'ٻڌايو', 'batavo', 'bolo', 'dasso', 'sollunga', 'cheppandi', 'heli', 'parayu', 'kuha', 'kowa', 'bata', 'bataye', 'bataiye', 'kaho', 'batao'],
  ['dikhao', 'दिखाओ', 'બતાવો', 'দেখাও', 'ਦਿਖਾਓ', 'காட்டுங்கள்', 'చూపించండి', 'ತೋರಿಸಿ', 'കാണിക്കൂ', 'ଦେଖାଅ', 'দেখুৱা', 'دکھاؤ', 'दर्शयतु', 'ہاو', 'देखाउनुहोस्', 'ڏيکاريو', 'dekhao', 'dikhau', 'kaattunga', 'choopinchandi', 'torisi', 'kaanikku', 'dekhaa', 'dekhuwa'],
  ['kholo', 'खोलो', 'ખોલો', 'খোলো', 'ਖੋਲ੍ਹੋ', 'திறங்கள்', 'తెరవండి', 'ತೆರೆಯಿರಿ', 'തുറക്കൂ', 'ଖୋଲ', 'খোলা', 'کھولو', 'उद्घाटयतु', 'کُھل', 'खोल्नुहोस्', 'کوليو', 'khol', 'open karo', 'thiranga', 'teravandi', 'tereyiri', 'thurakku', 'khola'],
  ['dena', 'देना', 'આપવાનું', 'দেওয়া', 'ਦੇਣਾ', 'கொடுக்க', 'ఇవ్వడం', 'ಕೊಡುವುದು', 'കൊടുക്കുക', 'ଦେବା', 'দিয়া', 'دینا', 'दातुम्', 'دِن', 'दिनु', 'ڏيڻ', 'aapvana', 'aapva', 'apvanu', 'deva', 'kodukka', 'ivvadam', 'koduvudhu', 'kodukkuka', 'deba', 'diya', 'denu', 'dena'],
  ['diye', 'दिए', 'આપ્યા', 'দিয়েছি', 'ਦਿੱਤੇ', 'கொடுத்தேன்', 'ఇచ్చాను', 'ಕೊಟ್ಟೆ', 'കൊടുത്തു', 'ଦେଲି', 'দিলো', 'دیے', 'दत्तवान्', 'دِت', 'दिएँ', 'ڏنا', 'aapya', 'diyechi', 'ditte', 'koduthen', 'ichchanu', 'kotte', 'koduthu', 'deli', 'dilo', 'diya', 'diye', 'de diye', 'aapya'],
  ['diya', 'दिया', 'આપ્યું', 'দিল', 'ਦਿੱਤਾ', 'கொடுத்தான்', 'ఇచ్చాడు', 'ಕೊಟ್ಟ', 'കൊടുത്തു', 'ଦେଲା', 'দিলে', 'دیا', 'दत्तम्', 'دِتھ', 'दियो', 'ڏنو', 'aapyu', 'dil', 'ditta', 'koduthan', 'ichchadu', 'kotta', 'dela', 'dile', 'diyo'],
  ['mila', 'मिला', 'મળ્યો', 'পেলাম', 'ਮਿਲਿਆ', 'கிடைத்தது', 'వచ్చింది', 'ಸಿಕ್ಕಿತು', 'കിട്ടി', 'ମିଳିଲା', 'পালো', 'ملا', 'लब्धम्', 'مِل', 'पाइयो', 'مليو', 'malyo', 'malya', 'malyo', 'pelam', 'miliya', 'kidaithadhu', 'vachindi', 'sikkitu', 'kitti', 'milila', 'palo', 'paayo', 'mile', 'mila'],
  ['mile', 'मिले', 'મળ્યા', 'পেলে', 'ਮਿਲੇ', 'கிடைத்தன', 'వచ్చాయి', 'ಸಿಕ್ಕವು', 'കിട്ടി', 'ମିଳିଲେ', 'পালে', 'ملے', 'लब्धाः', 'مِلے', 'पाइए', 'مليا', 'malya', 'malyo', 'pele', 'kidaithana', 'vachayi', 'sikkavu', 'milile', 'pale'],
  ['hue', 'हुए', 'થયા', 'হল', 'ਹੋਏ', 'ஆனது', 'అయ్యింది', 'ಆಯಿತು', 'ആയി', 'ହେଲା', 'হ’ল', 'ہوئے', 'भूतम्', 'ہُے', 'भयो', 'ٿيا', 'thaya', 'thayo', 'hol', 'hoye', 'aanadhu', 'ayyindi', 'aayitu', 'aayi', 'hela', 'hol', 'bhayo', 'thiya', 'hua', 'hue'],
  ['hua', 'हुआ', 'થયું', 'হলো', 'ਹੋਇਆ', 'ஆனது', 'అయ్యాడు', 'ಆಯಿತು', 'ആയി', 'ହେଲା', 'হ’ল', 'ہوا', 'भूतम्', 'ہو', 'भयो', 'ٿيو', 'thayo', 'thaya', 'holo', 'hoiya', 'aayitu', 'helo'],
  ['hai', 'है', 'છે', 'আছে', 'ਹੈ', 'இருக்கிறது', 'ఉంది', 'ಇದೆ', 'ആണ്', 'ଅଛି', 'আছে', 'ہے', 'अस्ति', 'چھُ', 'छ', 'آهي', 'chhe', 'che', 'achhe', 'irukkiradhu', 'undi', 'ide', 'aanu', 'achhi', 'chhu', 'cha', 'ahe', 'hai'],
  ['hain', 'हैं', 'છે', 'আছে', 'ਹਨ', 'இருக்கிறார்கள்', 'ఉన్నారు', 'ಇದ್ದಾರೆ', 'ഉണ്ട്', 'ଅଛନ୍ତି', 'আছে', 'ہیں', 'सन्ति', 'چھِ', 'छन्', 'آهن', 'chhe', 'ache', 'han', 'irukkirargal', 'unnaru', 'iddare', 'undu', 'achhanti', 'santhi', 'chhan'],
  // --- Money / business nouns ---
  ['munafa', 'मुनाफा', 'નફો', 'লাভ', 'ਮੁਨਾਫ਼ਾ', 'லாபம்', 'లాభం', 'ಲಾಭ', 'ലാഭം', 'ଲାଭ', 'লাভ', 'منافع', 'लाभः', 'نفعہ', 'नाफा', 'نفعو', 'nafo', 'nafa', 'labh', 'labham', 'labhah', 'labha', 'munafa', 'profit', 'fayda', 'faayda', 'फायदा', 'ફાયદો', 'ফায়দা', 'ਫਾਇਦਾ', 'நன்மை', 'ప్రయోజనం', 'ಪ್ರಯೋಜನ', 'പ്രയോജനം', 'ଫାଇଦା', 'ফায়দা', 'فائدہ', 'प्रयोजनम्', 'فائدو', 'faydo', 'fayda'],
  ['kharcha', 'खर्चा', 'ખર્ચો', 'খরচ', 'ਖਰਚਾ', 'செலவு', 'ఖర్చు', 'ಖರ್ಚು', 'ചെലവ്', 'ଖର୍ଚ୍ଚ', 'খৰচ', 'خرچ', 'व्ययः', 'خَرچ', 'खर्च', 'خرچو', 'kharcho', 'kharch', 'kharach', 'khoroch', 'selavu', 'kharchu', 'chelavu', 'kharcha', 'vyayah', 'kharcho'],
  ['baaki', 'बाकी', 'બાકી', 'বাকি', 'ਬਾਕੀ', 'பாக்கி', 'బాకీ', 'ಬಾಕಿ', 'ബാക്കി', 'ବାକି', 'বাকী', 'باقی', 'शेषम्', 'باقی', 'बाँकी', 'باقي', 'baki', 'baaki', 'baki', 'bakki', 'sesham', 'banki', 'baqi'],
  ['paise', 'पैसे', 'પૈસા', 'টাকা', 'ਪੈਸੇ', 'பணம்', 'డబ్బు', 'ಹಣ', 'പണം', 'ଟଙ୍କା', 'টকা', 'پیسے', 'धनम्', 'پونٛسہ', 'पैसा', 'پئسا', 'paisa', 'taka', 'panam', 'dabbu', 'hana', 'panam', 'tanka', 'toka', 'dhanam', 'paisa'],
  ['rupaye', 'रुपये', 'રૂપિયા', 'টাকা', 'ਰੁਪਏ', 'ரூபாய்', 'రూపాయలు', 'ರೂಪಾಯಿ', 'രൂപ', 'ଟଙ୍କା', 'টকা', 'روپے', 'रूप्यकाणि', 'رۄپے', 'रुपियाँ', 'روپيا', 'rupiya', 'rupay', 'rs', 'roopay', 'roobai', 'roopayalu', 'roopayi', 'roopa', 'rupya', 'rupaiya'],
  ['customer', 'ग्राहक', 'ગ્રાહક', 'গ্রাহক', 'ਗਾਹਕ', 'வாடிக்கையாளர்', 'కస్టమర్', 'ಗ್ರಾಹಕ', 'ഉപഭോക്താവ്', 'ଗ୍ରାହକ', 'গ্ৰাহক', 'گاہک', 'ग्राहकः', 'گاہک', 'ग्राहक', 'گاہڪ', 'grahak', 'grahaka', 'vaadikkaiyalar', 'kastamar', 'grahaka', 'upabhokthavu', 'grahaka', 'gahak', 'customer'],
  ['agent', 'एजेंट', 'એજન્ટ', 'এজেন্ট', 'ਏਜੰਟ', 'முகவர்', 'ఏజెంట్', 'ಏಜೆಂಟ್', 'ഏജന്റ്', 'ଏଜେଣ୍ଟ', 'এজেণ্ট', 'ایجنٹ', 'प्रतिनिधिः', 'ایجنٹ', 'एजेन्ट', 'ايجنٽ', 'mugavar', 'ejent', 'pratinidhi', 'agent'],
  ['cash', 'कैश', 'કેશ', 'ক্যাশ', 'ਕੈਸ਼', 'கேஷ்', 'క్యాష్', 'ಕ್ಯಾಶ್', 'ക്യാഷ്', 'କ୍ୟାସ', 'কেশ', 'کیش', 'कॅश', 'रोकड़', 'रोकड', 'રોકડ', 'নগদ', 'ਨਕਦ', 'பணம்', 'నగదు', 'ನಗದು', 'പണം', 'ନଗଦ', 'নগদ', 'نقد', 'नगदम्', 'نقد', 'नगद', 'نقد', 'rokad', 'nagad', 'nagad', 'nagadu', 'nagadu', 'nagad', 'cash', 'nakad', 'nakdi', 'nakdi'],
  ['upi', 'यूपीआई', 'યુપીઆઈ', 'ইউপিআই', 'ਯੂਪੀਆਈ', 'யுபிஐ', 'యూపీఐ', 'ಯುಪಿಐ', 'യുപിഐ', 'ୟୁପିଆଇ', 'ইউপিআই', 'یوپیآئی', 'यूपिआई', 'یوٗپیٖآی', 'युपिआई', 'يو پي آئي', 'online', 'gpay', 'phonepe', 'paytm'],
  ['transfer', 'ट्रांसफर', 'ટ્રાન્સફર', 'ট্রান্সফার', 'ਟ੍ਰਾਂਸਫਰ', 'பரிமாற்றம்', 'బదిలీ', 'ವರ್ಗಾವಣೆ', 'ട്രാൻസ്ഫർ', 'ଟ୍ରାନ୍ସଫର', 'ট্ৰেন্সফাৰ', 'ٹرانسفر', 'स्थानान्तरणम्', 'ٹرانسفر', 'ट्रान्सफर', 'ٽرانسفر', 'bheja', 'bheje', 'bhej', 'parimaatram', 'badili', 'vargavane', 'transfer'],
  ['commission', 'कमीशन', 'કમિશન', 'কমিশন', 'ਕਮਿਸ਼ਨ', 'கமிஷன்', 'కమిషన్', 'ಕಮಿಷನ್', 'കമ്മീഷൻ', 'କମିଶନ', 'কমিছন', 'کمیشن', 'आयोगः', 'کمیٖشن', 'कमिसन', 'ڪميشن', 'kamishan', 'commission'],
  ['kamai', 'कमाई', 'કમાણી', 'আয়', 'ਕਮਾਈ', 'வருமானம்', 'ఆదాయం', 'ಆದಾಯ', 'വരുമാനം', 'ଆୟ', 'আয়', 'کمائی', 'आयः', 'کمایٖ', 'कमाई', 'ڪمائي', 'kamani', 'aay', 'varumanam', 'aadayam', 'aadaaya', 'varumanam', 'aaya', 'kamai', 'income', 'earning'],
  ['dhandha', 'धंधा', 'ધંધો', 'ব্যবসা', 'ਧੰਦਾ', 'வியாபாரம்', 'వ్యాపారం', 'ವ್ಯಾಪಾರ', 'ബിസിനസ്', 'ବ୍ୟବସାୟ', 'ব্যৱসায়', 'دھندہ', 'व्यापारः', 'دھندٕ', 'धन्दा', 'ڌنڌو', 'dhandho', 'vyapaar', 'vyaparam', 'vyaparam', 'vyapara', 'business', 'byabsa', 'dhanda', 'hisab', 'हिसाब', 'હિસાબ', 'হিসাব', 'ਹਿਸਾਬ', 'கணக்கு', 'లెక్క', 'ಲೆಕ್ಕ', 'കണക്ക്', 'ହିସାବ', 'হিচাপ', 'حساب', 'गणना', 'حساب', 'हिसाब', 'حساب', 'hisab', 'kanakku', 'lekka', 'hisab', 'hisaab', 'dhadhe', 'dhande', 'dhandhe'],
  ['mahina', 'महीना', 'મહિનો', 'মাস', 'ਮਹੀਨਾ', 'மாதம்', 'నెల', 'ತಿಂಗಳು', 'മാസം', 'ମାସ', 'মাহ', 'مہینہ', 'मासः', 'مہیٖنہ', 'महिना', 'مهينو', 'mahino', 'maas', 'maadham', 'nela', 'thingalu', 'maasam', 'maasa', 'maah', 'mahina'],
  ['saal', 'साल', 'વર્ષ', 'বছর', 'ਸਾਲ', 'ஆண்டு', 'సంవత్సరం', 'ವರ್ಷ', 'വർഷം', 'ବର୍ଷ', 'বছৰ', 'سال', 'वर्षम्', 'ؤرِ', 'साल', 'سال', 'varsh', 'bochhor', 'aandu', 'samvatsaram', 'varsha', 'varsham', 'barsha', 'bosor', 'saal'],
  ['hafta', 'हफ्ता', 'અઠવાડિયું', 'সপ্তাহ', 'ਹਫ਼ਤਾ', 'வாரம்', 'వారం', 'ವಾರ', 'ആഴ്ച', 'ସପ୍ତାହ', 'সপ্তাহ', 'ہفتہ', 'सप्ताहः', 'ہفتہٕ', 'हप्ता', 'هفتو', 'athvadiyu', 'soptah', 'hafta', 'vaaram', 'vaaram', 'vaara', 'aazhcha', 'saptaha', 'hapta', 'hafto'],
  ['pichhla', 'पिछला', 'પાછલો', 'গত', 'ਪਿਛਲਾ', 'கடந்த', 'గత', 'ಹಿಂದಿನ', 'കഴിഞ്ഞ', 'ଗତ', 'যোৱা', 'پچھلا', 'गतम्', 'گُزُر', 'पछिल्लो', 'گذريل', 'pachlo', 'goto', 'pichla', 'kadantha', 'gatha', 'hindina', 'kazhinja', 'gata', 'jowa', 'pachhillo', 'guzril'],
  ['balance', 'बैलेंस', 'બેલેન્સ', 'ব্যালেন্স', 'ਬੈਲੈਂਸ', 'இருப்பு', 'బ్యాలెన్స్', 'ಬ್ಯಾಲೆನ್ಸ್', 'ബാലൻസ്', 'ବାଲାନ୍ସ', 'বেলেঞ্চ', 'بیلنس', 'शेषः', 'بیلنس', 'ब्यालेन्स', 'بيلنس', 'iruppu', 'shesh', 'balance'],
  ['jama', 'जमा', 'જમા', 'জমা', 'ਜਮ੍ਹਾਂ', 'டெபாசிட்', 'డిపాజిట్', 'ಠೇವಣಿ', 'നിക്ഷേപം', 'ଜମା', 'জমা', 'جمع', 'निक्षेपः', 'جمع', 'जम्मा', 'جمع', 'jamma', 'deposit', 'thevani', 'nikshepam', 'jama'],
  ['udhaar', 'उधार', 'ઉધાર', 'ধার', 'ਉਧਾਰ', 'கடன்', 'అప్పు', 'ಸಾಲ', 'കടം', 'ଧାର', 'ধাৰ', 'ادھار', 'ऋणम्', 'اُدھار', 'उधारो', 'اُڌار', 'udhar', 'dhar', 'kadan', 'appu', 'saala', 'kadam', 'dhaar', 'credit', 'due'],
  ['galat', 'गलत', 'ખોટું', 'ভুল', 'ਗਲਤ', 'தவறு', 'తప్పు', 'ತಪ್ಪು', 'തെറ്റ്', 'ଭୁଲ୍', 'ভুল', 'غلط', 'अशुद्धम्', 'غلط', 'गलत', 'غلط', 'khotu', 'bhul', 'thavaru', 'thappu', 'thettu', 'bhul', 'wrong', 'galti', 'mistake'],
  ['refund', 'रिफंड', 'રિફંડ', 'রিফান্ড', 'ਰਿਫੰਡ', 'திருப்பி', 'రిఫండ్', 'ಮರುಪಾವತಿ', 'റീഫണ്ട്', 'ରିଫଣ୍ଡ', 'ৰিফাণ্ড', 'ریفنڈ', 'प्रतिदानम्', 'واپس', 'फिर्ता', 'واپس', 'wapas', 'return', 'marupavati', 'refund'],
  ['machine', 'मशीन', 'મશીન', 'মেশিন', 'ਮਸ਼ੀਨ', 'இயந்திரம்', 'యంత్రం', 'ಯಂತ್ರ', 'യന്ത്രം', 'ମେସିନ', 'মেচিন', 'مشین', 'यन्त्रम्', 'مشین', 'मेसिन', 'مشين', 'iyanthiram', 'yantram', 'yantra', 'yanthram', 'machine'],
  ['bijli', 'बिजली', 'વીજળી', 'বিদ্যুৎ', 'ਬਿਜਲੀ', 'மின்சாரம்', 'విద్యుత్', 'ವಿದ್ಯುತ್', 'വൈദ്യുതി', 'ବିଜୁଳି', 'বিদ্যুৎ', 'بجلی', 'विद्युत्', 'بجلی', 'बिजुली', 'بجلي', 'vijli', 'bidyut', 'minsaram', 'vidyut', 'vaidyuthi', 'bijuli', 'electricity'],
  ['kagaz', 'कागज', 'કાગળ', 'কাগজ', 'ਕਾਗਜ਼', 'காகிதம்', 'కాగితం', 'ಕಾಗದ', 'കടലാസ്', 'କାଗଜ', 'কাগজ', 'کاغذ', 'पत्रम्', 'کاغذ', 'कागज', 'ڪاغذ', 'kagal', 'kaagaz', 'kaagitham', 'kaagitam', 'kaagada', 'kadalas', 'paper'],
  ['kiraya', 'किराया', 'ભાડું', 'ভাড়া', 'ਕਿਰਾਇਆ', 'வாடகை', 'అద్దె', 'ಬಾಡಿಗೆ', 'വാടക', 'ଭଡ଼ା', 'ভাড়া', 'کرایہ', 'भाटकम्', 'کِریہٕ', 'भाडा', 'ڪرايو', 'bhadu', 'bhada', 'vaadagai', 'adde', 'baadige', 'vaadaka', 'bhada', 'rent'],
  // --- Connectors / misc ---
  ['aur', 'और', 'અને', 'এবং', 'ਅਤੇ', 'மற்றும்', 'మరియు', 'ಮತ್ತು', 'ഒപ്പം', 'ଏବଂ', 'আৰু', 'اور', 'च', 'تہٕ', 'र', '۽', 'ane', 'ebong', 'ate', 'matrum', 'mariyu', 'mattu', 'oppam', 'ebam', 'aru', 'and', 'ani', 'ra', 'ca', 'te', 'ain', 'amadi', 'ar'],
  ['bhi', 'भी', 'પણ', 'ও', 'ਵੀ', 'கூட', 'కూడా', 'ಕೂಡ', 'കൂടി', 'ମଧ୍ୟ', 'ও', 'بھی', 'अपि', 'تہِ', 'पनि', 'پڻ', 'o', 'vi', 'kooda', 'kooda', 'koodi', 'madhy', 'api', 'pani', 'also'],
  ['mein', 'में', 'માં', 'এ', 'ਵਿੱਚ', 'இல்', 'లో', 'ನಲ್ಲಿ', 'ൽ', 'ରେ', 'ত', 'میں', 'मध्ये', 'مَنٛز', 'मा', '۾', 'ma', 'me', 'lo', 'nalli', 're', 'in'],
  // --- Services (native-script names → canonical service word) ---
  ['xerox', 'ज़ेरॉक्स', 'जेरॉक्स', 'ઝેરોક્સ', 'জেরক্স', 'ਜ਼ੇਰੌਕਸ', 'ஜெராக்ஸ்', 'జిరాక్స్', 'ಜೆರಾಕ್ಸ್', 'സീറോക്സ്', 'ଜେରକ୍ସ', 'জেৰক্স', 'زیروکس', 'जेरोक्स', 'زيروڪس', 'zerox', 'photocopy', 'जेरॉक्स', 'झेरॉक्स'],
  ['printing', 'प्रिंटिंग', 'પ્રિન્ટિંગ', 'প্রিন্টিং', 'ਪ੍ਰਿੰਟਿੰਗ', 'அச்சிடுதல்', 'ప్రింటింగ్', 'ಮುದ್ರಣ', 'പ്രിന്റിംഗ്', 'ପ୍ରିଣ୍ଟିଂ', 'প্ৰিণ্টিং', 'پرنٹنگ', 'मुद्रणम्', 'پرنٹنگ', 'प्रिन्टिङ', 'پرنٽنگ', 'print', 'printout', 'mudran', 'achchiduthal', 'print'],
  ['pan', 'पैन', 'પાન', 'প্যান', 'ਪੈਨ', 'பான்', 'పాన్', 'ಪ್ಯಾನ್', 'പാൻ', 'ପାନ୍', 'পান', 'پین', 'पैन', 'پين'],
  ['aadhaar', 'आधार', 'આધાર', 'আধার', 'ਆਧਾਰ', 'ஆதார்', 'ఆధార్', 'ಆಧಾರ್', 'ആധാർ', 'ଆଧାର', 'আধাৰ', 'آدھار', 'आधारः', 'آدھار', 'आधार', 'آڌار', 'aadhar', 'adhaar'],
  ['voter', 'वोटर', 'મતદાર', 'ভোটার', 'ਵੋਟਰ', 'வாக்காளர்', 'ఓటరు', 'ಮತದಾರ', 'വോട്ടർ', 'ଭୋଟର', 'ভোটাৰ', 'ووٹر', 'मतदाता', 'ووٹر', 'मतदाता', 'ووٽر', 'matdar', 'vaakkalar', 'otaru', 'voter'],
  ['ayushman', 'आयुष्मान', 'આયુષ્માન', 'আয়ুষ্মান', 'ਆਯੁਸ਼ਮਾਨ', 'ஆயுஷ்மான்', 'ఆయుష్మాన్', 'ಆಯುಷ್ಮಾನ್', 'ആയുഷ്മാൻ', 'ଆୟୁଷ୍ମାନ', 'আয়ুষ্মান', 'آیوشمان', 'आयुष्मान्', 'آیوشمان', 'आयुष्मान', 'آيوشمان'],
  ['receipt', 'रसीद', 'રસીદ', 'রসিদ', 'ਰਸੀਦ', 'ரசீது', 'రసీదు', 'ರಸೀದಿ', 'രസീത്', 'ରସିଦ', 'ৰচিদ', 'رسید', 'रसिदम्', 'رسیٖد', 'रसिद', 'رسيد', 'raseed', 'rasid', 'raseedu', 'raseedi', 'raseeth', 'rasid'],
];

const WORD_MAP = new Map<string, string>();
for (const [canon, ...variants] of VOCAB_ENTRIES) {
  for (const v of variants) {
    const key = v.toLowerCase();
    // First writer wins — keeps a variant from being re-mapped by a later entry.
    if (!WORD_MAP.has(key)) WORD_MAP.set(key, canon);
  }
  if (!WORD_MAP.has(canon)) WORD_MAP.set(canon, canon);
}

/** Yes / no words — only the FIRST word of a message is mapped, so
 *  Gujarati genitive "na/no" mid-sentence is never mistaken for "no". */
const YES_WORDS = new Set([
  'haan', 'ha', 'haa', 'hanji', 'ho', 'yes', 'yep', 'ok', 'okay', 'theek', 'bilkul',
  'हाँ', 'हां',
  'aamaam', 'aamam', 'avunu', 'haudu', 'athe', 'haanji', 'ji', 'hajo', 'hoy', 'barobar', 'hoi', 'aam', 'aah', 'ao',
]);
const NO_WORDS = new Set([
  'nahi', 'nahin', 'naa', 'nai', 'no', 'nathi', 'illa', 'kadu', 'ledu', 'alla', 'nahi', 'mat',
  'na', 'nah', 'nope', 'never', 'kadapi', 'illa', 'vendam', 'nako', 'naako', 'nathi', 'naka', 'hoina', 'nathe', 'nowwa', 'banga',
]);

/* ================= Number words (expandable) ================= */

export interface NumberWordTables {
  ones: Record<string, number>;
  hundreds: string[];
  thousands: string[];
}

function buildNumberWords(): NumberWordTables {
  const ones: Record<string, number> = {};
  const add = (n: number, ...words: string[]) => { for (const w of words) ones[w] = n; };
  add(1, 'ek', 'ondu', 'onnu', 'okati', 'onru', 'eka', 'ik', 'ek', 'ondru');
  add(2, 'do', 'be', 'don', 'dui', 'do', 'rendu', 'eradu', 'randu', 'rindu', 'irandu', 'du', 'dve', 'nwi');
  add(3, 'teen', 'tran', 'tin', 'tini', 'moonnu', 'moodu', 'mooru', 'moondru', 'tini', 'char', 'tinn');
  add(4, 'chaar', 'char', 'chari', 'naalugu', 'naangu', 'naalku', 'naalu', 'chari', 'sari');
  add(5, 'paanch', 'panch', 'paanch', 'panja', 'panj', 'aidu', 'aindhu', 'pancha', 'pas', 'panch');
  add(6, 'chhe', 'chh', 'chhoy', 'aaru', 'aaru', 'chha', 'soy', 'chhe');
  add(7, 'saat', 'sat', 'aath', 'edu', 'ezhu', 'elu', 'ezhu', 'sata', 'sat');
  add(8, 'aath', 'aath', 'aat', 'enimidi', 'ettu', 'entu', 'ettu', 'atha', 'ath');
  add(9, 'nau', 'nav', 'noy', 'tommidi', 'onbadhu', 'ombattu', 'onpathu', 'naba', 'no');
  add(10, 'das', 'daha', 'dosh', 'pathu', 'padi', 'hattu', 'pathu', 'dasa', 'doh', 'ten');
  add(1, 'one'); add(2, 'two'); add(3, 'three'); add(4, 'four'); add(5, 'five'); add(6, 'six'); add(7, 'seven'); add(8, 'eight'); add(9, 'nine');
  add(20, 'bees', 'vis', 'kuri', 'irupadhu', 'ippadhu', 'iruvathu');
  add(30, 'tees', 'tris', 'muppadhu', 'muppayi', 'muvvadi');
  add(50, 'pachaas', 'pachas', 'pachaas', 'aivathu', 'aivathu');
  add(100, 'sau', 'so', 'sho', 'sau', 'nooru', 'vanda', 'nooru', 'nooru', 'sau', 'xo', 'saya', 'sou');
  const hundreds = ['sau', 'so', 'sho', 'nooru', 'vanda', 'saya', 'xo', 'sou', 'she', 'sata', 'shata', 'hundred'];
  const thousands = ['hazaar', 'hazar', 'hazara', 'hajar', 'aayiram', 'veyyi', 'saavira', 'aayiram', 'hazar', 'hajar', 'thousand'];
  // 100/1000 words are also in `ones` as 100 for the combo logic; keep them out of plain ones.
  for (const h of hundreds) delete ones[h];
  for (const t of thousands) delete ones[t];
  return { ones, hundreds, thousands };
}
export const NUMBER_WORDS = buildNumberWords();

/** Convert number words to digits inside a token list. */
function normalizeNumberWordsTokens(tokens: string[]): string[] {
  const { ones, hundreds, thousands } = NUMBER_WORDS;
  const out: string[] = [];
  const moneyCtx = new Set(['cash', 'upi', 'rupaye', 'paise', 'rupees', 'rs', 'xerox', 'printing', 'pan', 'aadhaar', 'voter', 'ayushman', 'smart', 'scan', 'kharcha', 'hue', 'hua', 'mila', 'diye', 'commission', 'transfer', 'jama', 'baaki']);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const next = tokens[i + 1];
    const prev = tokens[i - 1];
    if (ones[tok] !== undefined && next && (hundreds.includes(next) || thousands.includes(next))) {
      const mult = hundreds.includes(next) ? 100 : 1000;
      out.push(String(ones[tok] * mult));
      i++;
      continue;
    }
    if (hundreds.includes(tok)) { out.push('100'); continue; }
    if (thousands.includes(tok)) { out.push('1000'); continue; }
    if (ones[tok] !== undefined && ones[tok] < 100) {
      // Standalone number word → digit only in a money context, so
      // "do din" (two days) is never turned into money.
      const near = [prev, next, tokens[i + 2]].filter(Boolean) as string[];
      if (near.some((w) => moneyCtx.has(w) || /^\d/.test(w))) { out.push(String(ones[tok])); continue; }
    }
    out.push(tok);
  }
  return out;
}

/* ================= Normalisation ================= */

/**
 * Normalise any supported language/style to canonical Hinglish tokens.
 * Unknown words, names (Ramesh, Rahul) and numbers pass through.
 */
export function normalizeMultilingual(raw: string): string {
  let text = normalizeDigitsMultilingual(raw);
  // "dedh sau" (one and a half hundred) = 150, in any spelling.
  text = text.replace(/\bdedh\s+sau\b/gi, '150');
  // Split on whitespace, keeping punctuation attached to tokens.
  const tokens = text.split(/(\s+)/);
  const mapped = tokens.map((tok) => {
    if (/^\s+$/.test(tok) || tok === '') return tok;
    const m = tok.match(/^([^\p{L}\p{M}\p{N}]*)([\p{L}\p{M}\p{N}]+)([^\p{L}\p{M}\p{N}]*)$/u);
    if (!m) return tok;
    const canon = WORD_MAP.get(m[2].toLowerCase());
    return canon ? `${m[1]}${canon}${m[3]}` : tok;
  });
  let s = mapped.join('');
  // Fold nukta forms so Devanagari service matching works.
  s = s.replace(/ज़/g, 'ज').replace(/फ़/g, 'फ').replace(/क़/g, 'क').replace(/ख़/g, 'ख').replace(/ग़/g, 'ग');
  // Number words → digits (token-based, money-context aware).
  const parts = s.split(/(\s+)/);
  const words = parts.filter((p) => !/^\s+$/.test(p) && p !== '');
  const converted = normalizeNumberWordsTokens(words.map((w) => w.toLowerCase()));
  // Rebuild preserving original spacing roughly (single spaces are fine for the parser).
  s = converted.join(' ');
  // First-word yes/no → haan/nahi (confirmation handling). Keep
  // combining marks (\p{M}) so Devanagari "हाँ" stays "हाँ" (and maps
  // via YES_WORDS) instead of collapsing to "ह".
  const first = s.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '') || '';
  if (YES_WORDS.has(first)) s = s.replace(/^\S+/, 'haan');
  else if (NO_WORDS.has(first) && s.trim().split(/\s+/).length <= 3) s = s.replace(/^\S+/, 'nahi');
  return s;
}

/* ================= Language detection ================= */

export interface DetectedLanguage {
  code: AiLangCode;
  /** 'native' = native script, 'romanized' = Latin letters, 'mixed' = 2+ languages/styles, 'english' = plain English. */
  style: 'native' | 'romanized' | 'mixed' | 'english';
  confidence: number;
  /** All languages with a real signal in the message (mixed detection). */
  languages: AiLangCode[];
  script: string | null;
}

export function detectLanguage(text: string): DetectedLanguage {
  const script = detectScript(text);
  // Romanized scoring: count distinct vocab words per language.
  // We approximate per-language scoring with marker words per language.
  const lower = text.toLowerCase();
  // UPDATE 14 guard (the "Kaise Ho Bhai" screenshot bug): Roman-script
  // Hinglish must never be detected as Marathi/Gujarati. Distinctive
  // Roman markers decide FIRST; generic scoring only runs when none
  // of them fire. A lone "ho" scores nothing anywhere (see markers).
  if (!script) {
    const has = (re: RegExp) => re.test(lower);
    // Distinctive Roman Gujarati ("Aaje su chale chhe?", "batavo").
    if (has(/\b(aaje|aje|su|chhe|kem|ketlo|ketla|nafo|thaya|malyo|batavo|kharcho|aapvana|tamaro)\b/)) {
      return { code: 'gu', style: 'romanized', confidence: 0.85, languages: ['gu'], script: null };
    }
    // Distinctive Roman Marathi.
    if (has(/\b(kiti|kaay|kasa|nako|barobar|aajcha|tumcha)\b/)) {
      return { code: 'mr', style: 'romanized', confidence: 0.85, languages: ['mr'], script: null };
    }
    // Strong Hinglish markers — one is enough ("Kaise ho bhai?" has
    // three: kaise + ho + bhai). Weaker markers need a second signal
    // so a shared word like "aaj" alone cannot force Hindi.
    // UPDATE 20: "nahi / raha / chal / gaya" are Hindi too — without
    // them "Internet nahi chal raha" scored as English (no marker hit).
    // UPDATE 20 (drive): bare Indian greetings ("Namaste", "Salaam")
    // are Hinglish too — without them a bare "Namaste" scored as
    // English and the first reply came back in English.
    if (has(/\b(kaise|bhai|hoon|hun|mujhe|kaisa|namaste|namaskar|salaam|adaab|ram ram)\b/)
      || (has(/\b(kya|hai|rahe|mera|tum|batao|banane|chahiye|tha|nahi|nahin|raha|rahi|chal|gaya|hua)\b/) && has(/\b(aaj|kal|kitna|kaam|shop|hisab|dhandha|kharcha|rupaye|kaisa|internet|printer|phone|upi|payment|wifi|computer|mobile|slow|fail|band|garam|hang)\b/))
      // UPDATE 25 (C-14): weak-marker Hinglish — "samjhao", "kiya",
      // "mila" are Hinglish verbs; combined with a Hindi function
      // word (ke/ko/ne/se/mein) or a shop word they are enough.
      // "PAN card ke baare mein samjhao" and "Rahul ko 10000 transfer
      // kiya commission 50 mila" both hit this, never English.
      || (has(/\b(samjhao|samjha|kiya|kiye|mila|mile|samajh|batao)\b/) && has(/\b(ke|ka|ki|ko|ne|se|mein|me|pan|aadhaar|transfer|commission|bare|baare)\b/))) {
      return { code: 'hi', style: 'romanized', confidence: 0.85, languages: ['hi'], script: null };
    }
  }
  const markers: Partial<Record<AiLangCode, string[]>> = {
    // NOTE (UPDATE 14): 'ho' was removed from Marathi/Santali markers —
    // in Roman Hinglish "ho" is the verb "are" ("Kaise ho bhai?"), and a
    // lone "ho" must NEVER flip a Hinglish message to Marathi. 'batao'
    // was removed from Gujarati markers (it is Hindi; Gujarati is
    // 'batavo'). 'aaj' stays in several lists but the Hinglish guard
    // below outranks single shared words.
    gu: ['aaje', 'thaya', 'malyo', 'nakh', 'kem', 'shu', 'aapvana', 'chhe', 'kharcho', 'nafo', 'jamma', 'batavo'],
    mr: ['kiti', 'kaay', 'kasa', 'nako', 'barobar', 'kharcha', 'aajcha', 'tumcha'],
    bn: ['aajke', 'koto', 'kemon', 'diyechi', 'baki', 'taka', 'khoroch'],
    pa: ['ajj', 'hanji', 'kinna', 'ditta', 'kiven', 'kiddan'],
    ta: ['inniki', 'evvalavu', 'enna', 'sollunga', 'aamaam', 'kidaithadhu'],
    te: ['eeroju', 'entha', 'emiti', 'avunu', 'vachindi', 'cheppandi'],
    kn: ['ivattu', 'eshtu', 'hege', 'haudu', 'kotte', 'aayitu'],
    ml: ['innu', 'ethra', 'enthu', 'athe', 'kitti', 'aayi'],
    or: ['aji', 'kete', 'kemiti', 'kana', 'gatakali', 'milila'],
    as: ['aji', 'kiman', 'ketiya', 'kowa', 'palo'],
    ur: ['aaj', 'kitna', 'batao', 'paisa', 'diye', 'kya', 'kaise'],
    hi: ['aaj', 'kal', 'kitna', 'batao', 'munafa', 'kharcha', 'baaki', 'kaise', 'bhai', 'kya', 'hai', 'hoon', 'rahe', 'mujhe', 'mera', 'tum', 'karna', 'banane', 'chahiye', 'tha', 'kaisa', 'nahi', 'raha', 'chal', 'kaam', 'gaya', 'hua', 'namaste', 'namaskar', 'salaam', 'adaab', 'samjhao', 'samjha', 'kiya', 'kiye', 'mila', 'mile', 'ko', 'ne', 'se', 'dhandha', 'dhanda', 'dhandho', 'dhande', 'dhandhe', 'dhadhe', 'hisab', 'hisaab'],
    ne: ['aaja', 'kati', 'kasari', 'kahile', 'paayo', 'hijo'],
    sa: ['adya', 'katham', 'labhah', 'vyayah'],
    ks: ['az', 'kith', 'kath', 'chhu'],
    kok: ['aaj', 'kitem', 'koso', 'sang'],
    sd: ['ajj', 'katro', 'kadeh', 'thiya'],
    mni: ['ngasi', 'kari', 'nou', 'thok'],
    brx: ['dinwi', 'bese', 'ma', 'gwdan'],
    doi: ['ajj', 'kitthe', 'kine', 'diyo'],
    mai: ['aaj', 'kati', 'kahiya', 'kehan'],
    sat: ['tihin', 'chet', 'kana'],
  };
  const scores = new Map<AiLangCode, number>();
  for (const [code, words] of Object.entries(markers)) {
    let n = 0;
    for (const w of words as string[]) {
      if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) n++;
    }
    if (n > 0) scores.set(code as AiLangCode, n);
  }
  // Native-script words also score their language.
  if (script) {
    const byScript: Record<string, AiLangCode> = {
      Gujarati: 'gu', 'Bengali/Assamese': 'bn', Gurmukhi: 'pa', Tamil: 'ta', Telugu: 'te',
      Kannada: 'kn', Malayalam: 'ml', Odia: 'or', 'Ol Chiki (Santali)': 'sat', 'Meetei Mayek': 'mni',
    };
    const sc = byScript[script.name];
    if (sc) scores.set(sc, (scores.get(sc) || 0) + 3);
    if (script.name === 'Devanagari') scores.set('hi', (scores.get('hi') || 0) + 3);
    if (script.name.startsWith('Arabic')) scores.set('ur', (scores.get('ur') || 0) + 3);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  // Roman-script tie-break (UPDATE 14): Hindi and Urdu share the
  // markers 'aaj'/'kitna'/'batao'/'kya'. For Roman text with no script
  // and no distinctive Urdu words, this app's user writes Hinglish —
  // a tie goes to Hindi, never to Urdu by accident. Distinctive
  // Marathi/Gujarati/Bengali markers are already handled by the guard
  // above, so they never reach this tie-break.
  let top = ranked[0];
  if (!script && ranked.length > 1 && ranked[1] && top && top[1] === ranked[1][1] && scores.get('hi') === top[1]) {
    top = ['hi', top[1]];
  }
  const second = ranked[1];
  const mixed = ranked.length >= 2 && second && second[1] >= 1 && top && top[1] <= second[1] + 2;
  // English: Latin script, no non-English markers, English words present.
  // UPDATE 25 (C-14): 'upi' is NOT an English word — it used to make
  // "Aur 200 UPI" score as English (0.8). 'cash' stays: it is shared,
  // but a bare "cash" message with no Hinglish marker is genuinely
  // ambiguous and the low-confidence fallback (conversation.ts) keeps
  // the conversation language instead of flipping to English.
  const englishWords = /\b(today|yesterday|profit|expense|income|balance|how much|total|customer|agent|money|cash|show|tell|open|what|is|the)\b/.test(lower);
  if (!script && !top) {
    return { code: 'en', style: 'english', confidence: englishWords ? 0.8 : 0.5, languages: ['en'], script: null };
  }
  if (script && top && top[0] === script.code) {
    return { code: top[0], style: mixed ? 'mixed' : 'native', confidence: 0.9, languages: ranked.slice(0, 3).map(([c]) => c), script: script.name };
  }
  if (script) {
    return { code: top ? top[0] : (script.code as AiLangCode), style: 'mixed', confidence: 0.7, languages: ranked.slice(0, 3).map(([c]) => c), script: script.name };
  }
  return {
    code: top ? top[0] : 'en',
    style: mixed ? 'mixed' : (top && top[0] !== 'en' ? 'romanized' : 'english'),
    confidence: top ? Math.min(0.95, 0.5 + top[1] * 0.15) : 0.5,
    languages: ranked.slice(0, 3).map(([c]) => c),
    script: null,
  };
}

export function voiceLangFor(code: AiLangCode): string {
  return LANG_BY_CODE[code]?.bcp47 || 'en-IN';
}

/* ================= Reply templates =================
 * Short native replies for the common answers + clarification
 * questions, one entry per supported language. {x} placeholders are
 * filled by the caller (amounts are already formatted ₹ strings).
 * English is the fallback for any missing key.
 */
export type ReplyKey =
  | 'greeting' | 'help' | 'noData' | 'profit' | 'income' | 'expense'
  | 'dueNone' | 'due' | 'agentNone' | 'agent' | 'mtNone' | 'mt'
  | 'balance' | 'overview' | 'unknown' | 'askMethod' | 'askService'
  | 'askAmount' | 'askAgent' | 'askCustomer' | 'askCommission'
  | 'saved' | 'cancelled' | 'confirmPrompt'
  // UPDATE 14/15 — casual + plan + honest-limitation replies. Only
  // en/hi/gu/mr carry full text below; every other language falls
  // back to the English template via replyIn() (documented fallback —
  // the content is correct, only the language is English). The varied
  // multi-variant casual replies live in general.ts instead.
  | 'casualGreeting' | 'casualBored' | 'casualThanks' | 'casualMood'
  | 'planAck' | 'notUnderstood' | 'aiKeyNeeded';

type TemplateSet = Partial<Record<ReplyKey, string>>;

export const REPLY_TEMPLATES: Record<AiLangCode, TemplateSet> = {
  en: {
    greeting: 'Hello! I am your BizKhata AI Assistant. Ask me about: today\u2019s profit, today\u2019s income, expenses, customer dues, agent payables, Money Transfer commission, or cash/UPI balance.',
    help: 'I can tell you — all from your real records:\n• Today\u2019s profit / income / expenses\n• Customer dues — who owes how much\n• Agent payables — what you owe each agent\n• Money Transfer — today\u2019s commission and profit\n• Cash and UPI balance',
    noData: 'There are no records yet, so I cannot quote any figure. Add a job, payment, expense or Money Transfer first, then ask me.',
    profit: 'Today\u2019s profit is {profit} (income {income} − expenses {expense}). This month\u2019s profit so far is {monthProfit}.',
    income: 'Today\u2019s income (received) is {income}. This month\u2019s income so far is {monthIncome}.',
    expense: 'Today\u2019s expenses are {expense}. This month\u2019s expenses so far are {monthExpense}.',
    dueNone: 'No customer owes anything — everything is clear.',
    due: 'Total customer due is {due}. Biggest amounts owed:\n{lines}',
    agentNone: 'You owe no agent anything — everything is clear.',
    agent: 'Total payable to agents: {due}.\n{lines}',
    mtNone: 'No Money Transfer happened today and none is pending.',
    mt: 'Money Transfer today: {count} transfers, total sent {sent}, commission {commission}, MT profit {profit}. Pending transfers: {pending}.',
    balance: 'Cash balance is {cash} and UPI balance is {upi}. Total available: {total}.',
    overview: 'Today\u2019s summary:\n• Income: {income}\n• Expenses: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (today): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, I cannot answer that. I can tell you about: today\u2019s profit, income, expenses, customer dues, agent payables, Money Transfer commission, and cash/UPI balance.',
    askMethod: '{service} — {amount}: did you get it in Cash or UPI?',
    askService: '{amount} — which service was this for? Services: {services}.',
    askAmount: '{service} — how much was it?',
    askAgent: 'Which agent should I record this for?{agents}',
    askCustomer: 'Which customer is this for?{customers}',
    askCommission: 'How much commission did you get on the {amount} transfer to {name}? (Write 0 if none.)',
    saved: 'Saved and verified in your records.',
    cancelled: 'Cancelled — nothing was saved.',
    confirmPrompt: 'Shall I save these entries? Please check first, then press Confirm.',
    casualGreeting: 'I am doing great, brother! How about you — how is everything going at the shop today?',
    casualBored: 'Then let us do something interesting! Tell me — do you want to learn something new, need an idea, or just want to chat a bit?',
    casualThanks: 'You are welcome, brother — that is what I am here for! Tell me if you need anything else.',
    casualMood: 'Oh, feeling low today? Take a short break — have a chai, then tell me what happened. I am right here to listen.',
    planAck: 'Got it! {plan} — I understand. {offer}',
    notUnderstood: 'Sorry brother, I could not quite understand that. Please say it a little differently — I am solid at accounts, entries and app help, and I can also chat generally.',
    aiKeyNeeded: 'For this question I need an AI chat key — add it in Settings. Without a key I can still handle accounts questions, entries and app help; general conversation needs the key.',
  },
  hi: {
    greeting: 'Namaste! Main aapka BizKhata AI Assistant hoon. Mujhse poochho: aaj ka profit, aaj ki kamai, kharcha, customer due, agent payable, Money Transfer commission, ya cash/UPI balance.',
    help: 'Main ye bata sakta hoon — sab aapke real record se:\n• Aaj ka profit / kamai / kharcha\n• Customer due — kaun kitna dena baaki hai\n• Agent payable — agent ko kitna dena hai\n• Money Transfer — aaj ka commission aur profit\n• Cash aur UPI balance',
    noData: 'Abhi koi record nahi hai — isliye main koi figure nahi bata sakta. Pehle ek job, payment, kharcha ya Money Transfer add karo, phir mujhse poochho.',
    profit: 'Aaj ka profit {profit} hai (income {income} − kharcha {expense}). Is mahine ka profit ab tak {monthProfit} hai.',
    income: 'Aaj ki kamai (received) {income} hai. Is mahine ki kamai ab tak {monthIncome} hai.',
    expense: 'Aaj ka kharcha {expense} hai. Is mahine ka kharcha ab tak {monthExpense} hai.',
    dueNone: 'Koi customer due nahi hai — sab clear hai.',
    due: 'Kul customer due {due} hai. Sabse zyada dena baaki:\n{lines}',
    agentNone: 'Kisi agent ko kuch dena baaki nahi hai — sab clear hai.',
    agent: 'Agent ko kul dena baaki hai: {due}.\n{lines}',
    mtNone: 'Aaj koi Money Transfer nahi hua aur koi pending transfer bhi nahi hai.',
    mt: 'Aaj Money Transfer: {count} transfer, kul bheja {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} hai aur UPI balance {upi} hai. Kul {total} available hai.',
    overview: 'Aaj ka hisab:\n• Income: {income}\n• Kharcha: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (aaj): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, ye main nahi bata sakta. Main ye bata sakta hoon: aaj ka profit, income, kharcha, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} ke {amount} — Cash mein mile ya UPI mein?',
    askService: '{amount} kis service ke hue? Services: {services}.',
    askAmount: '{service} ke kitne rupaye hue?',
    askAgent: 'Kis agent ke liye record karun?{agents}',
    askCustomer: 'Kis customer ke liye hai?{customers}',
    askCommission: '{name} ko {amount} transfer par commission kitna mila? (0 ho to 0 likho)',
    saved: 'Save ho gaya aur records mein verify ho gaya.',
    cancelled: 'Cancelled — kuch bhi save nahi hua.',
    confirmPrompt: 'Ye entries save karun? Pehle check karo, phir Confirm dabao.',
    casualGreeting: 'Main badhiya hoon bhai! Tum batao, sab kaisa chal raha hai? Aaj shop ka kaam kaisa raha?',
    casualBored: 'Toh kuch interesting karte hain! Batao, kuch naya seekhna hai, koi idea chahiye, ya bas thodi baatein karein?',
    casualThanks: 'Koi baat nahi bhai, ye to mera kaam hai! Aur kuch chahiye ho to batao.',
    casualMood: 'Oh, mood kharab hai? Chalo, thoda break lo — chai peelo, phir batao kya hua. Main yahin hoon, sunne ke liye.',
    planAck: 'Achha! {plan} — main samajh gaya. {offer}',
    notUnderstood: 'Sorry bhai, ye baat main theek se samajh nahi paya. Thoda alag tareeke se batao — main hisaab-kitab, entries, aur app ki help mein pakka hoon, aur aam baat-cheet bhi kar sakta hoon.',
    aiKeyNeeded: 'Is sawal ke liye mujhe AI chat ki key chahiye hoti hai — Settings mein jaakar key add karo. Bina key ke main hisaab-kitab wale sawaal, entries aur app ki help handle kar sakta hoon; aam baat-cheet ke liye key lagti hai.',
  },
  gu: {
    greeting: 'Namaste! Hu tamaro BizKhata AI Assistant chhu. Mane puchho: aaj no profit, aaj ni kamani, kharcho, customer due, agent payable, Money Transfer commission, ke cash/UPI balance.',
    help: 'Hu aa batavi shaku chhu — badhu tamara real record mathi:\n• Aaj no profit / kamani / kharcho\n• Customer due — kone ketlu aapvanu baki chhe\n• Agent payable — agent ne ketlu aapvanu chhe\n• Money Transfer — aaj nu commission ane profit\n• Cash ane UPI balance',
    noData: 'Have koi record nathi — etle hu koi figure naa kahi shaku. Pehla ek job, payment, kharcho ke Money Transfer add karo, pachhi mane puchho.',
    profit: 'Aaj no profit {profit} chhe (income {income} − kharcho {expense}). Aa mahina no profit atyar sudhi {monthProfit} chhe.',
    income: 'Aaj ni kamani (received) {income} chhe. Aa mahina ni kamani atyar sudhi {monthIncome} chhe.',
    expense: 'Aaj no kharcho {expense} chhe. Aa mahina no kharcho atyar sudhi {monthExpense} chhe.',
    dueNone: 'Koi customer due nathi — badhu clear chhe.',
    due: 'Kul customer due {due} chhe. Sauthi vadhu dena baki:\n{lines}',
    agentNone: 'Koi agent ne kashu aapvanu baki nathi — badhu clear chhe.',
    agent: 'Agent ne kul aapvanu baki chhe: {due}.\n{lines}',
    mtNone: 'Aaj koi Money Transfer thayo nathi ane koi pending transfer pan nathi.',
    mt: 'Aaj Money Transfer: {count} transfer, kul moklyu {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} chhe ane UPI balance {upi} chhe. Kul {total} available chhe.',
    overview: 'Aaj no hisab:\n• Income: {income}\n• Kharcho: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (aaj): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, aa hu naa kahi shaku. Hu aa batavi shaku chhu: aaj no profit, income, kharcho, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} na {amount} — Cash ma malya ke UPI ma?',
    askService: '{amount} kai service na hata? Services: {services}.',
    askAmount: '{service} na ketla rupiya thaya?',
    askAgent: 'Kaya agent mate record karu?{agents}',
    askCustomer: 'Kaya customer mate chhe?{customers}',
    askCommission: '{name} ne {amount} transfer par commission ketlu malyu? (0 hoy to 0 lakho)',
    saved: 'Save thai gayu ane record ma verify thai gayu.',
    cancelled: 'Cancelled — kashu save thayu nathi.',
    confirmPrompt: 'Aa entries save karu? Pehla check karo, pachhi Confirm dabavo.',
    casualGreeting: 'Hu majama chhu bhai! Tame kaho, badhu kem chale chhe? Aaj shop nu kaam kevu rahyu?',
    casualBored: 'To chalo kai interesting karie! Kaho, kai navu shikhvu chhe, koi idea joie chhe, ke bas thodi vaato karvi chhe?',
    casualThanks: 'Koi vaat nahi bhai, aa to maru kaam chhe! Biju kai joie to kaho.',
    casualMood: 'Oh, mood kharab chhe? Thodo break lo — chai pivo, pachhi kaho shu thayu. Hu ahin chhu, sambhalva mate.',
    planAck: 'Achha! {plan} — hu samji gayo. {offer}',
    notUnderstood: 'Sorry bhai, aa vaat hu barabar samji na shakyo. Thodi alag rite kaho — hu hisab-kitab, entries ane app ni help ma pakko chhu, ane aam vaat-cheet pan kari shaku chhu.',
    aiKeyNeeded: 'Aa sawal mate mane AI chat ni key joie chhe — Settings ma jaine key add karo. Key vagar hu hisab-kitab na sawal, entries ane app ni help sambhali shaku chhu; aam vaat-cheet mate key lagti chhe.',
  },
  mr: {
    greeting: 'Namaste! Mi tumcha BizKhata AI Assistant aahe. Mala vichara: aajcha profit, aajchi kamai, kharcha, customer due, agent payable, Money Transfer commission, kinva cash/UPI balance.',
    help: 'Mi he sangu shakto — sagle tumchya real record madhun:\n• Aajcha profit / kamai / kharcha\n• Customer due — koni kiti dyayche baaki aahe\n• Agent payable — agent la kiti dyayche aahe\n• Money Transfer — aajcha commission ani profit\n• Cash ani UPI balance',
    noData: 'Aajun kahi record nahi — mhanun mi kahi figure sangu shakat nahi. Pahile ek job, payment, kharcha kinva Money Transfer add kara, mag mala vichara.',
    profit: 'Aajcha profit {profit} aahe (income {income} − kharcha {expense}). Ya mahinyacha profit aataparyant {monthProfit} aahe.',
    income: 'Aajchi kamai (received) {income} aahe. Ya mahinyachi kamai aataparyant {monthIncome} aahe.',
    expense: 'Aajcha kharcha {expense} aahe. Ya mahinyacha kharcha aataparyant {monthExpense} aahe.',
    dueNone: 'Koni customer due nahi — sagle clear aahe.',
    due: 'Ekun customer due {due} aahe. Sarvat jast dyayche baaki:\n{lines}',
    agentNone: 'Koni agent la kahi dyayche baaki nahi — sagle clear aahe.',
    agent: 'Agent la ekun dyayche baaki aahe: {due}.\n{lines}',
    mtNone: 'Aaj kahi Money Transfer jhala nahi ani kahi pending transfer hi nahi.',
    mt: 'Aaj Money Transfer: {count} transfer, ekun pathavle {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} aahe ani UPI balance {upi} aahe. Ekun {total} available aahe.',
    overview: 'Aajcha hisab:\n• Income: {income}\n• Kharcha: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (aaj): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, he mi sangu shakat nahi. Mi he sangu shakto: aajcha profit, income, kharcha, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} che {amount} — Cash madhe milale ki UPI madhe?',
    askService: '{amount} konatya service che hote? Services: {services}.',
    askAmount: '{service} che kiti rupaye jhale?',
    askAgent: 'Konatya agent sathi record karu?{agents}',
    askCustomer: 'Konatya customer sathi aahe?{customers}',
    askCommission: '{name} la {amount} transfer var commission kiti milale? (0 asel tar 0 liha)',
    saved: 'Save jhale ani records madhe verify jhale.',
    cancelled: 'Cancelled — kahi save jhale nahi.',
    confirmPrompt: 'Ha entries save karu? Pahile check kara, mag Confirm daba.',
    casualGreeting: 'Mi mast aahe bhau! Tu sang, sagla kasa chalala aahe? Aaj shop cha kaam kasa hota?',
    casualBored: 'Mag kahi interesting karuya! Sang, kahi navin shikaycha aahe, kahi idea havay, ki fakt thodya gappa maraychya aahet?',
    casualThanks: 'Kahi harkat nahi bhau, hech maz kaam aahe! Ajun kahi havay asel tar sang.',
    casualMood: 'Oh, mood kharab aahe? Thoda break ghe — chai ghe, mag sang kay jhala. Mi ithech aahe, aikayla.',
    planAck: 'Achha! {plan} — mi samajlo. {offer}',
    notUnderstood: 'Sorry bhau, hi gosht mi barobar samajlo nahi. Thoda veglya paddhatine sang — mi hisab-kitab, entries ani app chi madat madhe pakka aahe, ani aam gappa hi maru shakto.',
    aiKeyNeeded: 'Ya prashnasathi mala AI chat chi key lagte — Settings madhe jaun key add kara. Key shivay mi hisab-kitab che prashna, entries ani app chi madat sambhalu shakto; aam gappansathi key lagte.',
  },
  bn: {
    greeting: 'Namaskar! Ami tomar BizKhata AI Assistant. Amake jiggasa koro: ajker profit, ajker income, khoroch, customer due, agent payable, Money Transfer commission, ba cash/UPI balance.',
    help: 'Ami eta bolte pari — sob tomar asol record theke:\n• Ajker profit / income / khoroch\n• Customer due — ke koto dite baki ache\n• Agent payable — agent ke koto dite hobe\n• Money Transfer — ajker commission ar profit\n• Cash ar UPI balance',
    noData: 'Ekhono kono record nei — tai ami kono figure bolte parbo na. Prothome ekta job, payment, khoroch ba Money Transfer jog koro, tarpor amake jiggasa koro.',
    profit: 'Ajker profit {profit} (income {income} − khoroch {expense}). Ei masher profit ekhon porjonto {monthProfit}.',
    income: 'Ajker income (received) {income}. Ei masher income ekhon porjonto {monthIncome}.',
    expense: 'Ajker khoroch {expense}. Ei masher khoroch ekhon porjonto {monthExpense}.',
    dueNone: 'Kono customer due nei — sob clear.',
    due: 'Mot customer due {due}. Sobcheye beshi dite baki:\n{lines}',
    agentNone: 'Kono agent ke kichu dite baki nei — sob clear.',
    agent: 'Agent ke mot dite baki: {due}.\n{lines}',
    mtNone: 'Aj kono Money Transfer hoyni ar kono pending transfer o nei.',
    mt: 'Aj Money Transfer: {count} transfer, mot pathano {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} ar UPI balance {upi}. Mot {total} available.',
    overview: 'Ajker hisab:\n• Income: {income}\n• Khoroch: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (aj): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, eta ami bolte parbo na. Ami bolte pari: ajker profit, income, khoroch, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} er {amount} — Cash e pele na UPI te?',
    askService: '{amount} kon service er chilo? Services: {services}.',
    askAmount: '{service} er koto taka holo?',
    askAgent: 'Kon agent er jonno record korbo?{agents}',
    askCustomer: 'Kon customer er jonno?{customers}',
    askCommission: '{name} ke {amount} transfer e commission koto pelen? (0 hole 0 likhun)',
    saved: 'Save hoye geche ar record e verify hoye geche.',
    cancelled: 'Cancelled — kichu save hoyni.',
    confirmPrompt: 'Ei entries save korbo? Age check koro, tarpor Confirm chapno.',
  },
  pa: {
    greeting: 'Sat Sri Akal! Main tuhada BizKhata AI Assistant haan. Mainu puchho: ajj da profit, ajj di kamai, kharcha, customer due, agent payable, Money Transfer commission, jaan cash/UPI balance.',
    help: 'Main eh dass sakda haan — sab tuhade asali record ton:\n• Ajj da profit / kamai / kharcha\n• Customer due — kaun kinna dena baaki hai\n• Agent payable — agent nu kinna dena hai\n• Money Transfer — ajj da commission te profit\n• Cash te UPI balance',
    noData: 'Haje koi record nahi hai — is layi main koi figure nahi dass sakda. Pehla ik job, payment, kharcha jaan Money Transfer add karo, phir mainu puchho.',
    profit: 'Ajj da profit {profit} hai (income {income} − kharcha {expense}). Is mahine da profit hun tak {monthProfit} hai.',
    income: 'Ajj di kamai (received) {income} hai. Is mahine di kamai hun tak {monthIncome} hai.',
    expense: 'Ajj da kharcha {expense} hai. Is mahine da kharcha hun tak {monthExpense} hai.',
    dueNone: 'Koi customer due nahi hai — sab clear hai.',
    due: 'Kul customer due {due} hai. Sab ton zyada dena baaki:\n{lines}',
    agentNone: 'Kise agent nu kujh dena baaki nahi hai — sab clear hai.',
    agent: 'Agent nu kul dena baaki hai: {due}.\n{lines}',
    mtNone: 'Ajj koi Money Transfer nahi hoya te koi pending transfer vi nahi hai.',
    mt: 'Ajj Money Transfer: {count} transfer, kul bheja {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} hai te UPI balance {upi} hai. Kul {total} available hai.',
    overview: 'Ajj da hisaab:\n• Income: {income}\n• Kharcha: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (ajj): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, eh main nahi dass sakda. Main eh dass sakda haan: ajj da profit, income, kharcha, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} de {amount} — Cash vich mileya jaan UPI vich?',
    askService: '{amount} kis service de si? Services: {services}.',
    askAmount: '{service} de kinne rupaye hoye?',
    askAgent: 'Kis agent layi record karaan?{agents}',
    askCustomer: 'Kis customer layi hai?{customers}',
    askCommission: '{name} nu {amount} transfer te commission kinna milya? (0 hove taan 0 likho)',
    saved: 'Save ho gaya te record vich verify ho gaya.',
    cancelled: 'Cancelled — kujh save nahi hoya.',
    confirmPrompt: 'Eh entries save karaan? Pehla check karo, phir Confirm dabao.',
  },
  ta: {
    greeting: 'Vanakkam! Naan ungal BizKhata AI Assistant. Ennidam ketkkalaam: indru profit, indru varumaanam, selavu, customer due, agent payable, Money Transfer commission, alladhu cash/UPI balance.',
    help: 'Naan idhai solla mudiyum — ellaam ungal unmai record ilirundhu:\n• Indru profit / varumaanam / selavu\n• Customer due — yaar evvalavu kodukka vendum\n• Agent payable — agent ku evvalavu kodukka vendum\n• Money Transfer — indru commission matrum profit\n• Cash matrum UPI balance',
    noData: 'Innum edhuvum record illai — aagaal naan edha figure um solla mudiyaadhu. Mudhalil oru job, payment, selavu alladhu Money Transfer seerungal, piragu ennidam ketkkalaam.',
    profit: 'Indru profit {profit} (varumaanam {income} − selavu {expense}). Indha maadha profit ippodhu varai {monthProfit}.',
    income: 'Indru varumaanam (received) {income}. Indha maadha varumaanam ippodhu varai {monthIncome}.',
    expense: 'Indru selavu {expense}. Indha maadha selavu ippodhu varai {monthExpense}.',
    dueNone: 'Edha customer um due illai — ellaam clear.',
    due: 'Motha customer due {due}. Migavum adhigam kodukka vendiyadhu:\n{lines}',
    agentNone: 'Edha agent kum edhuvum kodukka vendam — ellaam clear.',
    agent: 'Agent ku motham kodukka vendiyadhu: {due}.\n{lines}',
    mtNone: 'Indru edha Money Transfer nadakkavillai, pending transfer um illai.',
    mt: 'Indru Money Transfer: {count} transfer, motham anuppiyadhu {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} matrum UPI balance {upi}. Motham {total} available.',
    overview: 'Indru kanakku:\n• Varumaanam: {income}\n• Selavu: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (indru): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, idhai naan solla mudiyaadhu. Naan solla mudivandhu: indru profit, varumaanam, selavu, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} {amount} — Cash il kidaithadhaa alladhu UPI il?',
    askService: '{amount} endha service ku? Services: {services}.',
    askAmount: '{service} ku evvalavu?',
    askAgent: 'Endha agent ku record seiyattum?{agents}',
    askCustomer: 'Endha customer ku?{customers}',
    askCommission: '{name} ku {amount} transfer il commission evvalavu kidaithadhu? (0 endraal 0 ezhudhungal)',
    saved: 'Save aagivittadhu, record il verify aagivittadhu.',
    cancelled: 'Cancelled — edhuvum save aagavillai.',
    confirmPrompt: 'Indha entries save seiyattumaa? Mudhalil check seiyungal, piragu Confirm azhuthungal.',
  },
  te: {
    greeting: 'Namaste! Nenu mee BizKhata AI Assistant. Nannu adagandi: ee roju profit, ee roju aadayam, kharchu, customer due, agent payable, Money Transfer commission, leda cash/UPI balance.',
    help: 'Nenu idi cheppagalanu — anni mee nijamaina records nundi:\n• Ee roju profit / aadayam / kharchu\n• Customer due — evaru entha ivvalsindhi\n• Agent payable — agent ki entha ivvalsindhi\n• Money Transfer — ee roju commission mariyu profit\n• Cash mariyu UPI balance',
    noData: 'Inka emi record ledu — anduke nenu emi figure cheppalenu. Mundhu oka job, payment, kharchu leda Money Transfer add cheyandi, taruvatha nannu adagandi.',
    profit: 'Ee roju profit {profit} (aadayam {income} − kharchu {expense}). Ee nela profit ippati varaku {monthProfit}.',
    income: 'Ee roju aadayam (received) {income}. Ee nela aadayam ippati varaku {monthIncome}.',
    expense: 'Ee roju kharchu {expense}. Ee nela kharchu ippati varaku {monthExpense}.',
    dueNone: 'Evaru customer due ledu — anni clear.',
    due: 'Motham customer due {due}. Atyadhikam ga ivvalsindhi:\n{lines}',
    agentNone: 'Evaru agent ki emi ivvalsina avasaram ledu — anni clear.',
    agent: 'Agent laku motham ivvalsindhi: {due}.\n{lines}',
    mtNone: 'Ee roju emi Money Transfer jaragaledu, pending transfer kuda ledu.',
    mt: 'Ee roju Money Transfer: {count} transfer, motham pampindhi {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} mariyu UPI balance {upi}. Motham {total} available.',
    overview: 'Ee roju lekkalu:\n• Aadayam: {income}\n• Kharchu: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (ee roju): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, idi nenu cheppalenu. Nenu cheppagaligindhi: ee roju profit, aadayam, kharchu, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} {amount} — Cash lo vachindaa leda UPI lo?',
    askService: '{amount} ee service ki? Services: {services}.',
    askAmount: '{service} ki entha?',
    askAgent: 'Ee agent kosam record cheyala?{agents}',
    askCustomer: 'Ee customer kosam?{customers}',
    askCommission: '{name} ki {amount} transfer pai commission entha vachindhi? (0 aithe 0 rayandi)',
    saved: 'Save ayyindi mariyu records lo verify ayyindi.',
    cancelled: 'Cancelled — emi save avvaledu.',
    confirmPrompt: 'Ee entries save cheyala? Mundhu check cheyandi, taruvatha Confirm nokkandi.',
  },
  kn: {
    greeting: 'Namaskara! Naanu nimma BizKhata AI Assistant. Nanna keli: indina profit, indina aadaaya, kharchu, customer due, agent payable, Money Transfer commission, athava cash/UPI balance.',
    help: 'Naanu idannu helabahudu — ella nimma nijavaada record inda:\n• Indina profit / aadaaya / kharchu\n• Customer due — yaaru eshtu kodabeku\n• Agent payable — agent ge eshtu kodabeku\n• Money Transfer — indina commission mattu profit\n• Cash mattu UPI balance',
    noData: 'Innu yaavude record illa — aadare naanu yaavude figure helalu aagalla. Modalu ondu job, payment, kharchu athava Money Transfer serisi, nantara nanna keli.',
    profit: 'Indina profit {profit} (aadaaya {income} − kharchu {expense}). Ee tingala profit ivarige {monthProfit}.',
    income: 'Indina aadaaya (received) {income}. Ee tingala aadaaya ivarige {monthIncome}.',
    expense: 'Indina kharchu {expense}. Ee tingala kharchu ivarige {monthExpense}.',
    dueNone: 'Yaavude customer due illa — ella clear.',
    due: 'Ottu customer due {due}. Atyadhika kodabekada:\n{lines}',
    agentNone: 'Yaavude agent ge enu kodabekagilla — ella clear.',
    agent: 'Agent ge ottu kodabekada: {due}.\n{lines}',
    mtNone: 'Indu yaavude Money Transfer aagilla, pending transfer kuda illa.',
    mt: 'Indu Money Transfer: {count} transfer, ottu kalisiddu {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} mattu UPI balance {upi}. Otta {total} available.',
    overview: 'Indina hisaabu:\n• Aadaaya: {income}\n• Kharchu: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (indu): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, idannu naanu helalu aagalla. Naanu helabahudada: indina profit, aadaaya, kharchu, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} {amount} — Cash nalli sikkitu athava UPI nalli?',
    askService: '{amount} yaava service ge? Services: {services}.',
    askAmount: '{service} ge eshtu?',
    askAgent: 'Yaava agent ge record madabeku?{agents}',
    askCustomer: 'Yaava customer ge?{customers}',
    askCommission: '{name} ge {amount} transfer mele commission eshtu sikkitu? (0 iddare 0 bariyiri)',
    saved: 'Save aayitu mattu record nalli verify aayitu.',
    cancelled: 'Cancelled — enu save aagilla.',
    confirmPrompt: 'Ee entries save madabekaa? Modalu check madi, nantara Confirm ottiri.',
  },
  ml: {
    greeting: 'Namaskaram! Njan ningalude BizKhata AI Assistant aanu. Ennodu chodikkam: innathe profit, innathe varumanam, chelavu, customer due, agent payable, Money Transfer commission, allenkil cash/UPI balance.',
    help: 'Enikku ithu parayan kazhiyum — ellam ningalude yathartha recordukalil ninnu:\n• Innathe profit / varumanam / chelavu\n• Customer due — aaru ethra kodukkanam\n• Agent payable — agentinu ethra kodukkanam\n• Money Transfer — innathe commissionum profitum\n• Cashum UPI balanceum',
    noData: 'Innum ethum record illa — athukondu enikku ethum figure parayan kazhiyilla. Aadyam oru job, payment, chelavu allenkil Money Transfer cherthittu, shesham ennodu chodikkam.',
    profit: 'Innathe profit {profit} aanu (varumanam {income} − chelavu {expense}). Ee masathe profit ippol vare {monthProfit} aanu.',
    income: 'Innathe varumanam (received) {income} aanu. Ee masathe varumanam ippol vare {monthIncome} aanu.',
    expense: 'Innathe chelavu {expense} aanu. Ee masathe chelavu ippol vare {monthExpense} aanu.',
    dueNone: 'Arum customer due illa — ellam clear aanu.',
    due: 'Akke customer due {due} aanu. Ettavum kooduthal kodukkanam:\n{lines}',
    agentNone: 'Arum agentinu onnum kodukkanam illa — ellam clear aanu.',
    agent: 'Agentinu akke kodukkanam: {due}.\n{lines}',
    mtNone: 'Innu oru Money Transferum nadannilla, pending transferum illa.',
    mt: 'Innu Money Transfer: {count} transfer, akke ayachu {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} aanu, UPI balance {upi} aanu. Akke {total} available aanu.',
    overview: 'Innathe kanakku:\n• Varumanam: {income}\n• Chelavu: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (innu): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, ithu enikku parayan kazhiyilla. Enikku parayan kazhiyunnathu: innathe profit, varumanam, chelavu, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} {amount} — Cashil kitti allenkil UPIyil?',
    askService: '{amount} eth serviceinu? Services: {services}.',
    askAmount: '{service}nu ethra?',
    askAgent: 'Eth agentinu record cheyyanam?{agents}',
    askCustomer: 'Eth customerinu?{customers}',
    askCommission: '{name}nu {amount} transferil commission ethra kitti? (0 anenkil 0 ezhuthuka)',
    saved: 'Save cheythu, recordil verify cheythu.',
    cancelled: 'Cancelled — onnum save cheythilla.',
    confirmPrompt: 'Ee entries save cheyyatte? Aadyam check cheyyuka, shesham Confirm amarthuka.',
  },
  or: {
    greeting: 'Namaskar! Mu tumara BizKhata AI Assistant. Mote pacharantu: aji profit, aji aaya, kharcha, customer due, agent payable, Money Transfer commission, ki cash/UPI balance.',
    help: 'Mu eha kahiparibi — sabu tumara asala record ru:\n• Aji profit / aaya / kharcha\n• Customer due — kie kete deba baki achhi\n• Agent payable — agent ku kete deba achhi\n• Money Transfer — aji commission o profit\n• Cash o UPI balance',
    noData: 'Ebe kichi record nahin — sethipain mu kichi figure kahiparibini. Prathame gote job, payment, kharcha ki Money Transfer joga karantu, tapare mote pacharantu.',
    profit: 'Aji profit {profit} (aaya {income} − kharcha {expense}). E masa profit ebe jaen {monthProfit}.',
    income: 'Aji aaya (received) {income}. E masa aaya ebe jaen {monthIncome}.',
    expense: 'Aji kharcha {expense}. E masa kharcha ebe jaen {monthExpense}.',
    dueNone: 'Kei customer due nahin — sabu clear.',
    due: 'Mota customer due {due}. Sabuthu adhika deba baki:\n{lines}',
    agentNone: 'Kei agent ku kichhi deba baki nahin — sabu clear.',
    agent: 'Agent ku mota deba baki: {due}.\n{lines}',
    mtNone: 'Aji kehi Money Transfer heini ki kehi pending transfer bhi nahin.',
    mt: 'Aji Money Transfer: {count} transfer, mota pathaila {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} o UPI balance {upi}. Mota {total} available.',
    overview: 'Aji hisab:\n• Aaya: {income}\n• Kharcha: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (aji): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, eha mu kahiparibini. Mu kahiparibi: aji profit, aaya, kharcha, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} {amount} — Cash re milila ki UPI re?',
    askService: '{amount} keun service ra? Services: {services}.',
    askAmount: '{service} ra kete?',
    askAgent: 'Keun agent pain record karibi?{agents}',
    askCustomer: 'Keun customer pain?{customers}',
    askCommission: '{name} ku {amount} transfer re commission kete milila? (0 hele 0 lekhantu)',
    saved: 'Save heigala o record re verify heigala.',
    cancelled: 'Cancelled — kichhi save heini.',
    confirmPrompt: 'E entries save karibi? Prathame check karantu, tapare Confirm dabantu.',
  },
  as: {
    greeting: 'Nomoskar! Moi tomar BizKhata AI Assistant. Mok sudhibo: ajir profit, ajir income, khoroch, customer due, agent payable, Money Transfer commission, ba cash/UPI balance.',
    help: 'Moi eitu kobo paru — hokolu tomar asol record pora:\n• Ajir profit / income / khoroch\n• Customer due — kune kiman dibo baki ase\n• Agent payable — agentok kiman dibo lage\n• Money Transfer — ajir commission aru profit\n• Cash aru UPI balance',
    noData: 'Etialoi kunu record nai — heibabe moi kunu figure kobo nuwaru. Prothome eta job, payment, khoroch ba Money Transfer jog kora, tar pasot mok sudhiba.',
    profit: 'Ajir profit {profit} (income {income} − khoroch {expense}). Ei mahor profit etialoi {monthProfit}.',
    income: 'Ajir income (received) {income}. Ei mahor income etialoi {monthIncome}.',
    expense: 'Ajir khoroch {expense}. Ei mahor khoroch etialoi {monthExpense}.',
    dueNone: 'Kunu customer due nai — hokolu clear.',
    due: 'Muth customer due {due}. Ataitkoi beshi dibo baki:\n{lines}',
    agentNone: 'Kunu agentok ekou dibo baki nai — hokolu clear.',
    agent: 'Agentok muth dibo baki: {due}.\n{lines}',
    mtNone: 'Aj kunu Money Transfer huwa nai aru kunu pending transfer u nai.',
    mt: 'Aj Money Transfer: {count} transfer, muth pothuwa {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} aru UPI balance {upi}. Muth {total} available.',
    overview: 'Ajir hisap:\n• Income: {income}\n• Khoroch: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (aj): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, eitu moi kobo nuwaru. Moi kobo paru: ajir profit, income, khoroch, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service}r {amount} — Cashot palu ne UPIot?',
    askService: '{amount} kun serviceor asil? Services: {services}.',
    askAmount: '{service}r kiman?',
    askAgent: 'Kun agentor babe record korim?{agents}',
    askCustomer: 'Kun customeror babe?{customers}',
    askCommission: '{name}k {amount} transferot commission kiman palu? (0 hole 0 likhiba)',
    saved: 'Save hol aru recordot verify hol.',
    cancelled: 'Cancelled — ekou save huwa nai.',
    confirmPrompt: 'Ei entries save korim ne? Agote check kora, tar pasot Confirm tipa.',
  },
  ur: {
    greeting: 'Assalam-o-Alaikum! Main aapka BizKhata AI Assistant hoon. Mujhse poochho: aaj ka profit, aaj ki kamai, kharcha, customer due, agent payable, Money Transfer commission, ya cash/UPI balance.',
    help: 'Main ye bata sakta hoon — sab aapke real record se:\n• Aaj ka profit / kamai / kharcha\n• Customer due — kaun kitna dena baaki hai\n• Agent payable — agent ko kitna dena hai\n• Money Transfer — aaj ka commission aur profit\n• Cash aur UPI balance',
    noData: 'Abhi koi record nahi hai — isliye main koi figure nahi bata sakta. Pehle ek job, payment, kharcha ya Money Transfer add karo, phir mujhse poochho.',
    profit: 'Aaj ka profit {profit} hai (income {income} − kharcha {expense}). Is mahine ka profit ab tak {monthProfit} hai.',
    income: 'Aaj ki kamai (received) {income} hai. Is mahine ki kamai ab tak {monthIncome} hai.',
    expense: 'Aaj ka kharcha {expense} hai. Is mahine ka kharcha ab tak {monthExpense} hai.',
    dueNone: 'Koi customer due nahi hai — sab clear hai.',
    due: 'Kul customer due {due} hai. Sabse zyada dena baaki:\n{lines}',
    agentNone: 'Kisi agent ko kuch dena baaki nahi hai — sab clear hai.',
    agent: 'Agent ko kul dena baaki hai: {due}.\n{lines}',
    mtNone: 'Aaj koi Money Transfer nahi hua aur koi pending transfer bhi nahi hai.',
    mt: 'Aaj Money Transfer: {count} transfer, kul bheja {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} hai aur UPI balance {upi} hai. Kul {total} available hai.',
    overview: 'Aaj ka hisab:\n• Income: {income}\n• Kharcha: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (aaj): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, ye main nahi bata sakta. Main ye bata sakta hoon: aaj ka profit, income, kharcha, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} ke {amount} — Cash mein mile ya UPI mein?',
    askService: '{amount} kis service ke hue? Services: {services}.',
    askAmount: '{service} ke kitne rupaye hue?',
    askAgent: 'Kis agent ke liye record karun?{agents}',
    askCustomer: 'Kis customer ke liye hai?{customers}',
    askCommission: '{name} ko {amount} transfer par commission kitna mila? (0 ho to 0 likho)',
    saved: 'Save ho gaya aur records mein verify ho gaya.',
    cancelled: 'Cancelled — kuch bhi save nahi hua.',
    confirmPrompt: 'Ye entries save karun? Pehle check karo, phir Confirm dabao.',
  },
  sa: {
    greeting: 'Namaste! Aham tava BizKhata AI Sahayakah asmi. Mam prccha: adya labhah, adya ayah, vyayah, grahaka sesah, agent deyah, Money Transfer ayogah, va cash/UPI sesah.',
    help: 'Aham etat vaktum saknomi — sarvam tava satya abhilekhat:\n• Adya labhah / ayah / vyayah\n• Grahaka sesah — kah kiyad deyam\n• Agent deyah — agentaya kiyad deyam\n• Money Transfer — adya ayogah labhas ca\n• Cash UPI sesah ca',
    noData: 'Adya kimapi abhilekhah nasti — atah aham kimapi sankhyam vaktum na saknomi. Prathamam ekam karyam, danam, vyayam va Money Transfer yojaya, tatah mam prccha.',
    profit: 'Adya labhah {profit} (ayah {income} − vyayah {expense}). Asya masasya labhah adyavadhi {monthProfit}.',
    income: 'Adya ayah (praptah) {income}. Asya masasya ayah adyavadhi {monthIncome}.',
    expense: 'Adya vyayah {expense}. Asya masasya vyayah adyavadhi {monthExpense}.',
    dueNone: 'Kasyapi grahakasya sesah nasti — sarvam spashtam.',
    due: 'Kula grahaka sesah {due}. Sarvadhikam deyam:\n{lines}',
    agentNone: 'Kasyapi agentasya kimapi deyam nasti — sarvam spashtam.',
    agent: 'Agentebhyah kulam deyam: {due}.\n{lines}',
    mtNone: 'Adya kimapi Money Transfer na abhavat, kimapi lambitam sthanantaram api nasti.',
    mt: 'Adya Money Transfer: {count} sthanantarani, kulam presitam {sent}, ayogah {commission}, MT labhah {profit}. Lambitani: {pending}.',
    balance: 'Cash sesah {cash}, UPI sesah {upi}. Kulam {total} upalabdham.',
    overview: 'Adya ganana:\n• Ayah: {income}\n• Vyayah: {expense}\n• Labhah: {profit}\n• Grahaka sesah: {due}\n• Agent deyah: {agent}\n• MT ayogah (adya): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Ksamata, etat aham vaktum na saknomi. Aham vaktum saknomi: adya labhah, ayah, vyayah, grahaka sesah, agent deyah, Money Transfer ayogah, cash/UPI sesah.',
    askMethod: '{service} — {amount}: Cash praptam va UPI?',
    askService: '{amount} kasya sevayah? Sevah: {services}.',
    askAmount: '{service} — kiyad rupyakam?',
    askAgent: 'Kasya agentasya krte abhilekhah karomi?{agents}',
    askCustomer: 'Kasya grahakasya krte?{customers}',
    askCommission: '{name} — {amount} sthanantare ayogah kiyad praptah? (0 cet 0 likha)',
    saved: 'Samraksitam, abhilekhesu pramanitam ca.',
    cancelled: 'Cancelled — kimapi na samraksitam.',
    confirmPrompt: 'Etani pravistayah samraksami? Prathamam pariksasva, tatah Confirm pidaya.',
  },
  ks: {
    greeting: 'Adaab! Be chus tohund BizKhata AI Assistant. Me prichiv: azuk profit, azuk kamayi, kharch, customer due, agent payable, Money Transfer commission, ya cash/UPI balance.',
    help: 'Be heki wanith — soruy tohund asli record manz:\n• Azuk profit / kamayi / kharch\n• Customer due — kus kath den baaki chhu\n• Agent payable — agentis kath den chhu\n• Money Transfer — azuk commission te profit\n• Cash te UPI balance',
    noData: 'Wonyi kenh record ne — ti be kenh figure wani heki ne. Goud akh job, payment, kharch ya Money Transfer traav, pat me prichiv.',
    profit: 'Azuk profit {profit} chhu (income {income} − kharch {expense}). Yim mahine hun profit wonyi taam {monthProfit} chhu.',
    income: 'Azuk kamayi (received) {income} chhu. Yim mahine hun kamayi wonyi taam {monthIncome} chhu.',
    expense: 'Azuk kharch {expense} chhu. Yim mahine hun kharch wonyi taam {monthExpense} chhu.',
    dueNone: 'Kenh customer due ne — soruy clear chhu.',
    due: 'Kul customer due {due} chhu. Sab se zyada den baaki:\n{lines}',
    agentNone: 'Kenh agentis kenh den baaki ne — soruy clear chhu.',
    agent: 'Agentis kul den baaki chhu: {due}.\n{lines}',
    mtNone: 'Az kenh Money Transfer guv ne te kenh pending transfer ti ne.',
    mt: 'Az Money Transfer: {count} transfer, kul bozun {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} chhu te UPI balance {upi} chhu. Kul {total} available chhu.',
    overview: 'Azuk hisaab:\n• Income: {income}\n• Kharch: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (az): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Maafi, ye be wani heki ne. Be wani heki: azuk profit, income, kharch, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} {amount} — Cash manz milya ya UPI manz?',
    askService: '{amount} kus service uk chhu? Services: {services}.',
    askAmount: '{service} kath rupaye guv?',
    askAgent: 'Kus agent khaater record karun?{agents}',
    askCustomer: 'Kus customer khaater chhu?{customers}',
    askCommission: '{name} {amount} transferas peth commission kath milya? (0 aasith 0 lekhiv)',
    saved: 'Save guv te record manz verify guv.',
    cancelled: 'Cancelled — kenh save guv ne.',
    confirmPrompt: 'Ye entries save karun? Goud check kariv, pat Confirm dabiv.',
  },
  kok: {
    greeting: 'Namaskar! Hanv tumcho BizKhata AI Assistant. Maka vichar: aajcho profit, aajchi kamai, kharcho, customer due, agent payable, Money Transfer commission, vo cash/UPI balance.',
    help: 'Hanv he sangunk shakta — soglem tumchea kharea recordantle:\n• Aajcho profit / kamai / kharcho\n• Customer due — konnank kitle diunk urla\n• Agent payable — agentak kitle diunk asa\n• Money Transfer — aajcho commission ani profit\n• Cash ani UPI balance',
    noData: 'Azun kaim record na — mhonun hanv kaim figure sangunk shakna. Poinnem ek job, payment, kharcho vo Money Transfer ghal, mag maka vichar.',
    profit: 'Aajcho profit {profit} (income {income} − kharcho {expense}). Hea mhoineacho profit ataporyant {monthProfit}.',
    income: 'Aajchi kamai (received) {income}. Hea mhoineachi kamai ataporyant {monthIncome}.',
    expense: 'Aajcho kharcho {expense}. Hea mhoineacho kharcho ataporyant {monthExpense}.',
    dueNone: 'Konnacho customer due na — soglem clear.',
    due: 'Ekvott customer due {due}. Sogleantlean chod diunk urla:\n{lines}',
    agentNone: 'Konnachea agentak kaim diunk urunk na — soglem clear.',
    agent: 'Agentak ekvott diunk urla: {due}.\n{lines}',
    mtNone: 'Aiz kaim Money Transfer zaunk na ani kaim pending transfer-i na.',
    mt: 'Aiz Money Transfer: {count} transfer, ekvott dhadlo {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} ani UPI balance {upi}. Ekvott {total} available.',
    overview: 'Aajcho hisab:\n• Income: {income}\n• Kharcho: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (aiz): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, he hanv sangunk shakna. Hanv he sangunk shakta: aajcho profit, income, kharcho, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} {amount} — Cashantlean mellim vo UPI antlean?',
    askService: '{amount} konne servicechem? Services: {services}.',
    askAmount: '{service}chem kitle rupoi zalim?',
    askAgent: 'Konnea agentakhatir record korum?{agents}',
    askCustomer: 'Konnea customerakhatir?{customers}',
    askCommission: '{name} {amount} transferacher commission kitle mellim? (0 aslear 0 boroi)',
    saved: 'Save zale ani recordantlean verify zale.',
    cancelled: 'Cancelled — kaim save zaunk na.',
    confirmPrompt: 'Heo entries save korum? Poinnem check kor, mag Confirm dab.',
  },
  ne: {
    greeting: 'Namaste! Ma tapaiiko BizKhata AI Assistant hun. Malai sodhnuhos: aaja ko profit, aaja ko kamai, kharcha, customer due, agent payable, Money Transfer commission, ya cash/UPI balance.',
    help: 'Ma yo bhanna sakchhu — sabai tapaiiko wastawik record bata:\n• Aaja ko profit / kamai / kharcha\n• Customer due — kasle kati tirna baki chha\n• Agent payable — agent lai kati tirna chha\n• Money Transfer — aaja ko commission ra profit\n• Cash ra UPI balance',
    noData: 'Ahile kunai record chhaina — tyasaile ma kunai figure bhanna sakdin. Pahile euta job, payment, kharcha ya Money Transfer thapnuhos, tyaspachhi malai sodhnuhos.',
    profit: 'Aaja ko profit {profit} chha (income {income} − kharcha {expense}). Yo mahina ko profit ahile samma {monthProfit} chha.',
    income: 'Aaja ko kamai (received) {income} chha. Yo mahina ko kamai ahile samma {monthIncome} chha.',
    expense: 'Aaja ko kharcha {expense} chha. Yo mahina ko kharcha ahile samma {monthExpense} chha.',
    dueNone: 'Kunai customer due chhaina — sabai clear chha.',
    due: 'Kul customer due {due} chha. Sabaibhanda dherai tirna baki:\n{lines}',
    agentNone: 'Kunai agent lai kehi tirna baki chhaina — sabai clear chha.',
    agent: 'Agent lai kul tirna baki chha: {due}.\n{lines}',
    mtNone: 'Aaja kunai Money Transfer bhaena ra kunai pending transfer pani chhaina.',
    mt: 'Aaja Money Transfer: {count} transfer, kul pathaiyo {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} chha ra UPI balance {upi} chha. Kul {total} available chha.',
    overview: 'Aaja ko hisab:\n• Income: {income}\n• Kharcha: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (aaja): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, yo ma bhanna sakdin. Ma yo bhanna sakchhu: aaja ko profit, income, kharcha, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} ko {amount} — Cash ma payo ki UPI ma?',
    askService: '{amount} kun service ko thiyo? Services: {services}.',
    askAmount: '{service} ko kati rupiya thiyo?',
    askAgent: 'Kun agent ko lagi record garne?{agents}',
    askCustomer: 'Kun customer ko lagi ho?{customers}',
    askCommission: '{name} lai {amount} transfer ma commission kati payo? (0 bhaye 0 lekhnuhos)',
    saved: 'Save bhayo ra record ma verify bhayo.',
    cancelled: 'Cancelled — kehi save bhaena.',
    confirmPrompt: 'Yo entries save garne? Pahile check garnuhos, tyaspachhi Confirm thichnuhos.',
  },
  sd: {
    greeting: 'Assalam-o-Alaikum! Maan tawhanjo BizKhata AI Assistant aahiyan. Mokhan puchho: ajj jo profit, ajj ji kamai, kharcho, customer due, agent payable, Money Transfer commission, ya cash/UPI balance.',
    help: 'Maan he budhaayi saghan tho — sabh tawhanje asli record maan:\n• Ajj jo profit / kamai / kharcho\n• Customer due — ker khatro denu baaki aahe\n• Agent payable — agent khe khatro denu aahe\n• Money Transfer — ajj jo commission ain profit\n• Cash ain UPI balance',
    noData: 'Haane koi record naahe — te kare maan koi figure budhaayi na saghan. Pehriyan hik job, payment, kharcho ya Money Transfer wadho, poe mokhan puchho.',
    profit: 'Ajj jo profit {profit} aahe (income {income} − kharcho {expense}). Hin mahine jo profit haane taaiin {monthProfit} aahe.',
    income: 'Ajj ji kamai (received) {income} aahe. Hin mahine ji kamai haane taaiin {monthIncome} aahe.',
    expense: 'Ajj jo kharcho {expense} aahe. Hin mahine jo kharcho haane taaiin {monthExpense} aahe.',
    dueNone: 'Koi customer due naahe — sabh clear aahe.',
    due: 'Kul customer due {due} aahe. Sabh khaan wadhu denu baaki:\n{lines}',
    agentNone: 'Kehin agent khe kujh denu baaki naahe — sabh clear aahe.',
    agent: 'Agent khe kul denu baaki aahe: {due}.\n{lines}',
    mtNone: 'Ajj koi Money Transfer na thiyo ain koi pending transfer bhi naahe.',
    mt: 'Ajj Money Transfer: {count} transfer, kul mokliyo {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} aahe ain UPI balance {upi} aahe. Kul {total} available aahe.',
    overview: 'Ajj jo hisaab:\n• Income: {income}\n• Kharcho: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (ajj): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, he maan budhaayi na saghan. Maan he budhaayi saghan tho: ajj jo profit, income, kharcho, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} ja {amount} — Cash mein milya ya UPI mein?',
    askService: '{amount} kehri service ja hua? Services: {services}.',
    askAmount: '{service} ja khatra rupiya thya?',
    askAgent: 'Kehre agent laye record kayan?{agents}',
    askCustomer: 'Kehre customer laye aahe?{customers}',
    askCommission: '{name} khe {amount} transfer te commission khatro milyo? (0 huje te 0 likho)',
    saved: 'Save thi wayo ain record mein verify thi wayo.',
    cancelled: 'Cancelled — kujh save na thiyo.',
    confirmPrompt: 'He entries save kayan? Pehriyan check kayo, poe Confirm dabayo.',
  },
  mni: {
    greeting: 'Khurumjari! Ei eigi BizKhata AI Assistant ni. Eibu hangbiro: ngasigi profit, ngasigi income, khoroch, customer due, agent payable, Money Transfer commission, amasung cash/UPI balance.',
    help: 'Eina haiba ngammi — pumnamak eigi achumba recordtagi:\n• Ngasigi profit / income / khoroch\n• Customer due — kanana kayam piba dorkar\n• Agent payable — agentta kayam piba dorkar\n• Money Transfer — ngasigi commission amasung profit\n• Cash amasung UPI balance',
    noData: 'Houjik record amata leitre — maramdi eina figure amata haiba ngamde. Ahanba job, payment, khoroch amasung Money Transfer happa, matungda eibu hangbiro.',
    profit: 'Ngasigi profit {profit} ni (income {income} − khoroch {expense}). Tha asi profit houjikphaoba {monthProfit} ni.',
    income: 'Ngasigi income (received) {income} ni. Tha asi income houjikphaoba {monthIncome} ni.',
    expense: 'Ngasigi khoroch {expense} ni. Tha asi khoroch houjikphaoba {monthExpense} ni.',
    dueNone: 'Customer due amata leitre — pumnamak clear ni.',
    due: 'Apunba customer due {due} ni. Khenna henna piba dorkar:\n{lines}',
    agentNone: 'Agent amata piba dorkar leitre — pumnamak clear ni.',
    agent: 'Agentta apunba piba dorkar: {due}.\n{lines}',
    mtNone: 'Ngasi Money Transfer amata toukhide, pending transfer su leitre.',
    mt: 'Ngasi Money Transfer: {count} transfer, apunba tharakpa {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} ni amasung UPI balance {upi} ni. Apunba {total} available ni.',
    overview: 'Ngasigi hisab:\n• Income: {income}\n• Khoroch: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (ngasi): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, eibu eina haiba ngamde. Eina haiba ngammi: ngasigi profit, income, khoroch, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} {amount} — Cash ta phangbra amasung UPI ta?',
    askService: '{amount} kari servicegi? Services: {services}.',
    askAmount: '{service} kayam?',
    askAgent: 'Kari agentgi record tougadba?{agents}',
    askCustomer: 'Kari customergi?{customers}',
    askCommission: '{name} {amount} transferda commission kayam phangbra? (0 oiraba 0 ibiro)',
    saved: 'Save toukhre amasung recordta verify toukhre.',
    cancelled: 'Cancelled — karisu save toukhide.',
    confirmPrompt: 'Ei entries save tougadra? Ahanba check toubiro, matungda Confirm nambiro.',
  },
  brx: {
    greeting: 'Namaste! Angni BizKhata AI Assistant. Nwngni swdang: dinai profit, dinai income, kharcha, customer due, agent payable, Money Transfer commission, aru cash/UPI balance.',
    help: 'Ang hekhwna hagon — gubun nwngni asol record nifrai:\n• Dinai profit / income / kharcha\n• Customer due — sorni besh denai baki dong\n• Agent payable — agentni besh denai dong\n• Money Transfer — dinai commission aru profit\n• Cash aru UPI balance',
    noData: 'Da record geyao — eikhwna ang figure geyao hwnai hagon. Gwdangse job, payment, kharcha aru Money Transfer lagw, besey nwngni swdang.',
    profit: 'Dinai profit {profit} (income {income} − kharcha {expense}). Be danai profit daosim {monthProfit}.',
    income: 'Dinai income (received) {income}. Be danai income daosim {monthIncome}.',
    expense: 'Dinai kharcha {expense}. Be danai kharcha daosim {monthExpense}.',
    dueNone: 'Customer due geyao — gubun clear.',
    due: 'Gubun customer due {due}. Beshi denai baki:\n{lines}',
    agentNone: 'Agentni hwnai denai baki geyao — gubun clear.',
    agent: 'Agentni gubun denai baki: {due}.\n{lines}',
    mtNone: 'Dinai Money Transfer geyao, pending transfer arw geyao.',
    mt: 'Dinai Money Transfer: {count} transfer, gubun har {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} aru UPI balance {upi}. Gubun {total} available.',
    overview: 'Dinai hisab:\n• Income: {income}\n• Kharcha: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (dinai): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, eikhu ang hwnai hagon. Ang hwnai hagon: dinai profit, income, kharcha, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} {amount} — Cash jwng mwngkhangna arw UPI jwngna?',
    askService: '{amount} mabw service ni? Services: {services}.',
    askAmount: '{service} besh?',
    askAgent: 'Mabw agentni record khalamna?{agents}',
    askCustomer: 'Mabw customer ni?{customers}',
    askCommission: '{name} {amount} transferao commission besh mwngkhang? (0 jaa 0 liri)',
    saved: 'Save jabai aru record ao verify jabai.',
    cancelled: 'Cancelled — hwnai save jabaiya.',
    confirmPrompt: 'Be entries save khalamna? Gwdangse check khalam, besey Confirm dabw.',
  },
  doi: {
    greeting: 'Namaste! Main tuhada BizKhata AI Assistant haan. Mainu puchho: ajj da profit, ajj di kamai, kharcha, customer due, agent payable, Money Transfer commission, jaan cash/UPI balance.',
    help: 'Main eh dass sakda haan — sab tuhade asali record ton:\n• Ajj da profit / kamai / kharcha\n• Customer due — kaun kinna dena baaki hai\n• Agent payable — agent nu kinna dena hai\n• Money Transfer — ajj da commission te profit\n• Cash te UPI balance',
    noData: 'Haje koi record nahi hai — is layi main koi figure nahi dass sakda. Pehla ik job, payment, kharcha jaan Money Transfer add karo, phir mainu puchho.',
    profit: 'Ajj da profit {profit} hai (income {income} − kharcha {expense}). Is mahine da profit hun tak {monthProfit} hai.',
    income: 'Ajj di kamai (received) {income} hai. Is mahine di kamai hun tak {monthIncome} hai.',
    expense: 'Ajj da kharcha {expense} hai. Is mahine da kharcha hun tak {monthExpense} hai.',
    dueNone: 'Koi customer due nahi hai — sab clear hai.',
    due: 'Kul customer due {due} hai. Sab ton zyada dena baaki:\n{lines}',
    agentNone: 'Kise agent nu kujh dena baaki nahi hai — sab clear hai.',
    agent: 'Agent nu kul dena baaki hai: {due}.\n{lines}',
    mtNone: 'Ajj koi Money Transfer nahi hoya te koi pending transfer vi nahi hai.',
    mt: 'Ajj Money Transfer: {count} transfer, kul bheja {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} hai te UPI balance {upi} hai. Kul {total} available hai.',
    overview: 'Ajj da hisaab:\n• Income: {income}\n• Kharcha: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (ajj): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, eh main nahi dass sakda. Main eh dass sakda haan: ajj da profit, income, kharcha, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} de {amount} — Cash vich mileya jaan UPI vich?',
    askService: '{amount} kis service de si? Services: {services}.',
    askAmount: '{service} de kinne rupaye hoye?',
    askAgent: 'Kis agent layi record karaan?{agents}',
    askCustomer: 'Kis customer layi hai?{customers}',
    askCommission: '{name} nu {amount} transfer te commission kinna milya? (0 hove taan 0 likho)',
    saved: 'Save ho gaya te record vich verify ho gaya.',
    cancelled: 'Cancelled — kujh save nahi hoya.',
    confirmPrompt: 'Eh entries save karaan? Pehla check karo, phir Confirm dabao.',
  },
  mai: {
    greeting: 'Namaskar! Ham ahank BizKhata AI Assistant chhi. Hamra puchhu: aaj ke profit, aaj ke kamai, kharcha, customer due, agent payable, Money Transfer commission, ya cash/UPI balance.',
    help: 'Ham e bata sakait chhi — sab ahank asal record se:\n• Aaj ke profit / kamai / kharcha\n• Customer due — ke ketek dena baki aichh\n• Agent payable — agent ke ketek dena aichh\n• Money Transfer — aaj ke commission ar profit\n• Cash ar UPI balance',
    noData: 'Abhi koi record nahi aichh — isliye ham koi figure nahi bata sakait chhi. Pahine ek job, payment, kharcha ya Money Transfer add karu, phir hamra puchhu.',
    profit: 'Aaj ke profit {profit} aichh (income {income} − kharcha {expense}). E mahina ke profit abhi tak {monthProfit} aichh.',
    income: 'Aaj ke kamai (received) {income} aichh. E mahina ke kamai abhi tak {monthIncome} aichh.',
    expense: 'Aaj ke kharcha {expense} aichh. E mahina ke kharcha abhi tak {monthExpense} aichh.',
    dueNone: 'Koi customer due nahi aichh — sab clear aichh.',
    due: 'Kul customer due {due} aichh. Sabase badhi dena baki:\n{lines}',
    agentNone: 'Kono agent ke kuchh dena baki nahi aichh — sab clear aichh.',
    agent: 'Agent ke kul dena baki aichh: {due}.\n{lines}',
    mtNone: 'Aaj koi Money Transfer nahi bhel ar koi pending transfer bhi nahi aichh.',
    mt: 'Aaj Money Transfer: {count} transfer, kul bhejla {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} aichh ar UPI balance {upi} aichh. Kul {total} available aichh.',
    overview: 'Aaj ke hisab:\n• Income: {income}\n• Kharcha: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (aaj): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, e ham nahi bata sakait chhi. Ham e bata sakait chhi: aaj ke profit, income, kharcha, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} ke {amount} — Cash me milal ya UPI me?',
    askService: '{amount} ke service ke bhel? Services: {services}.',
    askAmount: '{service} ke ketek rupiya bhel?',
    askAgent: 'Ke agent ke liye record karu?{agents}',
    askCustomer: 'Ke customer ke liye aichh?{customers}',
    askCommission: '{name} ke {amount} transfer par commission ketek milal? (0 ho ta 0 likhu)',
    saved: 'Save bhay gel ar record me verify bhay gel.',
    cancelled: 'Cancelled — kuchh save nahi bhel.',
    confirmPrompt: 'E entries save karu? Pahine check karu, phir Confirm dabau.',
  },
  sat: {
    greeting: 'Johar! Ing BizKhata AI Assistant kaning. Ing kukli me: tihin profit, tihin income, khoroch, customer due, agent payable, Money Transfer commission, se cash/UPI balance.',
    help: 'Ing noa lai dareyag — joto amag asol record khon:\n• Tihin profit / income / khoroch\n• Customer due — okoe tinag em hoyok\n• Agent payable — agent tinag em hoyok\n• Money Transfer — tihin commission ar profit\n• Cash ar UPI balance',
    noData: 'Nitog record banug — onate ing figure banug lai dareyag. Pahila mit job, payment, khoroch se Money Transfer seled me, ona ing kukli me.',
    profit: 'Tihin profit {profit} (income {income} − khoroch {expense}). No chando profit nitog habic {monthProfit}.',
    income: 'Tihin income (received) {income}. No chando income nitog habic {monthIncome}.',
    expense: 'Tihin khoroch {expense}. No chando khoroch nitog habic {monthExpense}.',
    dueNone: 'Okoe customer due banug — joto clear.',
    due: 'Joto customer due {due}. Sab khon beshi em hoyok:\n{lines}',
    agentNone: 'Okoe agent em hoyok banug — joto clear.',
    agent: 'Agent joto em hoyok: {due}.\n{lines}',
    mtNone: 'Tihin Money Transfer banug, pending transfer ho banug.',
    mt: 'Tihin Money Transfer: {count} transfer, joto kol {sent}, commission {commission}, MT profit {profit}. Pending transfer: {pending}.',
    balance: 'Cash balance {cash} ar UPI balance {upi}. Joto {total} available.',
    overview: 'Tihin hisab:\n• Income: {income}\n• Khoroch: {expense}\n• Profit: {profit}\n• Customer due: {due}\n• Agent payable: {agent}\n• MT commission (tihin): {commission}\n• Cash: {cash} • UPI: {upi}',
    unknown: 'Sorry, noa ing lai dareyag. Ing lai dareyag: tihin profit, income, khoroch, customer due, agent payable, Money Transfer commission, cash/UPI balance.',
    askMethod: '{service} {amount} — Cash re namkeda se UPI re?',
    askService: '{amount} okoe service re? Services: {services}.',
    askAmount: '{service} tinag?',
    askAgent: 'Okoe agent lagit record me?{agents}',
    askCustomer: 'Okoe customer lagit?{customers}',
    askCommission: '{name} {amount} transfer re commission tinag namkeda? (0 khon 0 ol me)',
    saved: 'Save ena ar record re verify ena.',
    cancelled: 'Cancelled — joto save banug.',
    confirmPrompt: 'No entries save me? Pahila check me, ona Confirm dab me.',
  },
};

/** Fill a reply template; falls back to English for a missing key/language. */
export function replyIn(code: AiLangCode, key: ReplyKey, values: Record<string, string | number> = {}): string {
  const tpl = REPLY_TEMPLATES[code]?.[key] ?? REPLY_TEMPLATES.en[key] ?? '';
  return tpl.replace(/\{(\w+)\}/g, (_m, k) => String(values[k] ?? `{${k}}`));
}

/** Resolve the reply language: manual profile preference wins, else auto-detect from the message. */
export function resolveReplyLang(message: string, preferred?: AiLangCode | 'auto' | null): AiLangCode {
  if (preferred && preferred !== 'auto') return preferred;
  const det = detectLanguage(message);
  return det.code;
}
