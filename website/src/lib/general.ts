/**
 * BizKhata general knowledge — UPDATE 14/15.
 *
 * On-device, deterministic, no key, no network. This is the LOCAL
 * engine for general conversation: it answers ONLY what it can answer
 * genuinely from this built-in knowledge. Anything outside it returns
 * null, and the caller must NOT invent a reply — it either asks the
 * configured conversational-AI service (conversation-ai.ts) or says
 * honestly, in plain language, that it could not understand / needs
 * the key. It NEVER answers a statement or a plan with a money
 * question, and NEVER mentions business records in casual replies.
 *
 * Casual replies are VARIED (2–3 variants per kind per language),
 * picked deterministically from the message text so the same greeting
 * does not always get the same robotic answer — but the engine is
 * deliberately NOT presented as a free-form AI: it is a bounded local
 * fallback. The dynamic conversational engine is the configured AI
 * service (conversation-ai.ts); when no service is configured, this
 * file is the honest limit of what the assistant can say.
 */
import { detectLanguage, replyIn, type AiLangCode } from './languages';

/* ================= Casual replies (varied, not fixed) ================= */

type CasualKind = 'greeting' | 'bored' | 'thanks' | 'mood' | 'morning' | 'doing' | 'advice' | 'helpOffer';

const CASUAL: Record<string, Partial<Record<CasualKind, string[]>>> = {
  hi: {
    greeting: [
      'Main badhiya hoon bhai! Tum batao, sab kaisa chal raha hai? Aaj shop ka kaam kaisa raha?',
      'Main ekdum theek hoon! Tum sunao — aaj ka din kaisa gaya?',
      'Badhiya hoon bhai, tumhari dua se! Batao, aaj kya karna hai?',
    ],
    bored: [
      'Toh kuch interesting karte hain! Batao, kuch naya seekhna hai, koi business idea chahiye, ya bas thodi baatein karein?',
      'Bore ho rahe ho? Chalo kuch naya karte hain — main tumhe CSC ke liye ek naya business idea bata sakta hoon, ya ek joke sunaun?',
      'Arre, bore hone ka time kahan! Batao, aaj shop ke liye kuch naya plan karein?',
    ],
    thanks: [
      'Koi baat nahi bhai, ye to mera kaam hai! Aur kuch chahiye ho to batao.',
      'Arre, isme kya! Tum bas batao, aage kya karna hai.',
      'Welcome bhai! Koi aur help chahiye ho to main yahin hoon.',
    ],
    mood: [
      'Oh, mood kharab hai? Chalo, thoda break lo — chai peelo, phir batao kya hua. Main yahin hoon, sunne ke liye.',
      'Arey, aisa hota hai bhai. Thoda aaram karo, aur jab man kare to batao — baat karke halka lagta hai.',
      'Mood off hai to koi baat nahi. Aaj ka kaam halka rakho, kal fresh start karenge. Main yahin hoon.',
    ],
    morning: [
      'Good morning bhai! Aaj ka din achha jaye — batao, aaj shop par kya plan hai?',
      'Subah ho gayi! Chai peeli? Batao, aaj kya-kya kaam karna hai?',
    ],
    doing: [
      'Main yahin hoon bhai, tumhari help ke liye ready! Tum batao, kya chal raha hai?',
      'Bas tumhara intezaar kar raha tha! Batao, aaj kya kaam hai?',
    ],
    advice: [
      'Batao bhai, kis baare mein advice chahiye — business, shop, ya kuch aur? Main poori koshish karunga help karne ki.',
      'Haan bhai, bolo — kya soch rahe ho? Main sun raha hoon.',
    ],
    helpOffer: [
      'Haan bhai, bolo — kya help chahiye? Hisab-kitab, entries, koi sawal, ya kuch aur?',
      'Bilkul, main yahin hoon help ke liye. Batao, kya karna hai?',
    ],
  },
  en: {
    greeting: [
      'I am doing great, brother! How about you — how is everything going at the shop today?',
      'I am fine, thanks! Tell me, how has your day been?',
      'Doing well! What are we working on today?',
    ],
    bored: [
      'Then let us do something interesting! Do you want to learn something new, hear a business idea, or just chat a bit?',
      'Bored? Let me tell you a joke, or I can suggest a new idea for your shop — your call!',
    ],
    thanks: [
      'You are welcome, brother — that is what I am here for! Tell me if you need anything else.',
      'Anytime! What is next?',
    ],
    mood: [
      'Oh, feeling low today? Take a short break — have a chai, then tell me what happened. I am right here to listen.',
      'That happens, brother. Take it easy today and start fresh tomorrow. I am here if you want to talk.',
    ],
    morning: [
      'Good morning! Hope today goes well — what is the plan for the shop today?',
      'Good morning! Had your chai? Tell me what work we have today.',
    ],
    doing: [
      'Right here, ready to help! What is going on?',
      'Just waiting for you! What do you need today?',
    ],
    advice: [
      'Sure — tell me what you need advice about: business, the shop, or something else? I will do my best to help.',
      'Go ahead, I am listening. What is on your mind?',
    ],
    helpOffer: [
      'Yes, tell me — what do you need help with? Accounts, entries, a question, or something else?',
      'Of course, I am here to help. What shall we do?',
    ],
  },
  gu: {
    greeting: [
      'Hu majama chhu bhai! Tame kaho, badhu kem chale chhe? Aaj shop nu kaam kevu rahyu?',
      'Hu ekdam theek chhu bhai! Tame kaho — aaj shop nu kaam kevu chhe?',
    ],
    bored: [
      'To chalo kai interesting karie! Kaho, kai navu shikhvu chhe, koi business idea joie chhe, ke bas thodi vaato karvi chhe?',
      'Bore thay chhe? Chalo, hu tamne ek joke kahu, ke shop mate navo idea aapu — tame kaho!',
    ],
    thanks: [
      'Koi vaat nahi bhai, aa to maru kaam chhe! Biju kai joie to kaho.',
      'Welcome bhai! Biju kai joie chhe to kaho.',
    ],
    mood: [
      'Oh, mood kharab chhe? Thodo break lo — chai pivo, pachhi kaho shu thayu. Hu ahin chhu, sambhalva mate.',
      'Aevu thay bhai. Aaj nu kaam halku rakho, kale fresh start karishu — kem ke aaram pan jaruri chhe.',
    ],
    morning: [
      'Good morning bhai! Aaj no divas saras jay — kaho, aaj shop par shu plan chhe?',
      'Subah thai gai! Chai pidhi? Kaho, aaj shu shu kaam karvanu chhe?',
    ],
    doing: [
      'Hu ahin chhu bhai, tamari help mate ready! Tame kaho, shu chale chhe?',
      'Bas tamari raah joto hato! Kaho, aaj shu kaam chhe?',
    ],
    advice: [
      'Kaho bhai, kai babat advice joie chhe — business, shop, ke biju kai? Hu puri koshish karish help karvani.',
      'Haan bhai, bolo — shu vicharo chho? Hu sambhlu chhu.',
    ],
    helpOffer: [
      'Haan bhai, bolo — shu help joie chhe? Hisab-kitab, entries, koi sawal, ke biju kai?',
      'Bilkul, hu ahin chhu help mate. Kaho, shu karvanu chhe?',
    ],
  },
  mr: {
    greeting: [
      'Mi mast aahe bhau! Tu sang, sagla kasa chalala aahe? Aaj shop cha kaam kasa hota?',
      'Mi ekdam theek aahe! Tu sang — aajcha divas kasa gela?',
    ],
    bored: [
      'Mag kahi interesting karuya! Sang, kahi navin shikaycha aahe, kahi business idea havay, ki fakt thodya gappa maraychya aahet?',
      'Bore hotoy? Chala, mi tula ek joke sangto, kinva shop sathi navin idea deto — tu sang!',
    ],
    thanks: [
      'Kahi harkat nahi bhau, hech maz kaam aahe! Ajun kahi havay asel tar sang.',
      'Welcome bhau! Ajun kahi madat havay asel tar mi ithech aahe.',
    ],
    mood: [
      'Oh, mood kharab aahe? Thoda break ghe — chai ghe, mag sang kay jhala. Mi ithech aahe, aikayla.',
      'Asa hota bhau. Aajcha kaam halka thev, udya fresh start karuya.',
    ],
    morning: [
      'Good morning bhau! Aajcha divas changla javo — sang, aaj shop var kay plan aahe?',
      'Sakal jhali! Chai ghetli? Sang, aaj kay kay kaam karaycha aahe?',
    ],
    doing: [
      'Mi ithech aahe bhau, tujhya madatisathi ready! Tu sang, kay chalala aahe?',
      'Fakt tujhi vaat pahat hoto! Sang, aaj kay kaam aahe?',
    ],
    advice: [
      'Sang bhau, kashabaddal advice havay — business, shop, ki kahi itar? Mi purn prayatna karen madat karaycha.',
      'Ho bhau, bol — kay vichar karat aahes? Mi aikat aahe.',
    ],
    helpOffer: [
      'Ho bhau, bol — kay madat havay? Hisab-kitab, entries, kahi prashna, ki kahi itar?',
      'Nakkich, mi ithech aahe madatisathi. Sang, kay karaycha aahe?',
    ],
  },
};

function pickVariant(list: string[], seed: string): string {
  if (list.length === 0) return '';
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

/** Varied casual reply in the user's language (hi/en/gu/mr; others fall back to Hinglish). */
export function answerCasual(kind: CasualKind, lang: AiLangCode, seed: string): string {
  const table = CASUAL[lang] || CASUAL.hi;
  const list = table[kind] || CASUAL.hi[kind] || [];
  if (list.length > 0) return pickVariant(list, seed);
  // Template fallback (en/hi/gu/mr carry these keys; others → English).
  const key = kind === 'greeting' ? 'casualGreeting' : kind === 'bored' ? 'casualBored' : kind === 'thanks' ? 'casualThanks' : kind === 'mood' ? 'casualMood' : 'casualGreeting';
  return replyIn(lang, key);
}

/* ================= Jokes (clean, per language) ================= */

const JOKES: Record<string, string[]> = {
  hi: [
    'Teacher: "Beta, tumhare homework mein ek bhi answer sahi nahi hai!"\nStudent: "Sir, galti se bhi sahi ho jata to aap kehte — nakal ki hai!"',
    'Ek aadmi doctor ke paas gaya: "Doctor sahab, mujhe bhoolne ki bimari hai."\nDoctor: "Kab se hai?"\nAadmi: "Kya kab se hai?"',
    'Pati: "Aaj khana bahut achha bana hai!"\nPatni: "Achha? Aaj to khana tumne banaya hai!"',
    'Customer: "Bhai, Xerox ek taraf se karna."\nShopkeeper: "Dusri taraf se kya karun — likh dun ki ye Xerox hai?"',
  ],
  en: [
    'Why did the computer go to the doctor? Because it caught a virus!',
    'A man asked the shopkeeper: "Do you have a photocopy of this document?"\nShopkeeper: "Sir, this IS the photocopy."',
    'Teacher: "Why is your homework blank?"\nStudent: "Sir, I did it in invisible ink — it will appear when you mark it!"',
  ],
  gu: [
    'Teacher: "Beta, homework ma ek pan answer saacho nathi!"\nStudent: "Sir, bhul thi pan saacho thai jay to tame kehso — nakal kari chhe!"',
    'Ek maanas doctor pase gayo: "Doctor saheb, mane bhulvani bimari chhe."\nDoctor: "Kyare thi chhe?"\nMaanas: "Shu kyare thi chhe?"',
  ],
  mr: [
    'Teacher: "Beta, homework madhe ekhi uttar barobar nahi!"\nStudent: "Sir, chukun hi barobar jhala asta tar tumhi mhanala asta — nakal keli!"',
    'Ek manus doctor kade gela: "Doctor saheb, mala visraychi bimari aahe."\nDoctor: "Kevha pasun aahe?"\nManus: "Kay kevha pasun aahe?"',
  ],
};

export function tellJoke(lang: AiLangCode, seed: string): string {
  const list = JOKES[lang] || JOKES.hi;
  return pickVariant(list, seed);
}

/* ================= Service explainers (honest, with documents) ================= */

interface Explainer { title: string; body: string }

const EXPLAINERS: Record<string, Record<string, Explainer>> = {
  hi: {
    pan: {
      title: 'PAN Card kya hai?',
      body: 'PAN Card ek 10-digit ka Permanent Account Number hai jo Income Tax Department deta hai. Ye har financial kaam ke liye zaroori hota hai — bank account kholna, tax bharna, bade payment karna.\n\nDocuments (aam taur par):\n• Aadhaar Card\n• Passport-size photo\n• Date of birth ka proof (Aadhaar / Birth Certificate)\n• Signature\n\nKaise banta hai: NSDL/UTI portal par online form bhara jata hai, documents upload hote hain, aur fee ke baad PAN card ghar par aata hai (e-PAN pehle mil jata hai). Rules kabhi-kabhi badalte rehte hain — isliye form bharne se pehle latest fee aur documents apne agent ya portal par verify kar lena.',
    },
    aadhaar: {
      title: 'Aadhaar Card kya hai?',
      body: 'Aadhaar ek 12-digit ki unique ID hai jo UIDAI deta hai — ye pehchan (identity) aur pata (address) ka saboot hai.\n\nServices: naya Aadhaar, naam/mobile/address correction, biometric update.\nDocuments: pehchan ka proof (PAN/Voter ID/Passport), pata ka proof (bijli ka bill/bank statement), aur janm-tithi ka proof.\n\nNote: Aadhaar update ke kuch kaam sirf authorised Aadhaar centre par hote hain — CSC centre par sirf wohi kaam hote hain jo portal par allowed hain. Galat jankari dekar form kabhi mat bharo.',
    },
    voter: {
      title: 'Voter ID kya hai?',
      body: 'Voter ID (EPIC) ek pehchan patra hai jo 18 saal ya usse upar ke Bharatiya nagrik ko vote dene ka adhikar deta hai.\n\nNaya Voter ID ke liye: Form 6 bhara jata hai. Documents: umar ka proof (Birth Certificate/Aadhaar), pata ka proof, passport-size photo.\n\nCorrection/transfer ke liye Form 8 use hota hai. Aavedan NVSP portal par online hota hai.',
    },
    ayushman: {
      title: 'Ayushman Card kya hai?',
      body: 'Ayushman Bharat (PM-JAY) yojana ke under garib aur zarooratmand parivaron ko har saal ₹5 lakh tak ka muft ilaaj (hospitalisation) milta hai.\n\nEligibility: yojana ki list (SECC data) ke hisab se — CSC centre par Aadhaar se check kiya jata hai ki parivar list mein hai ya nahi.\nDocuments: Aadhaar Card, ration card (agar ho), parivar ke sadasyon ki jankari.\n\nCard banne ke baad listed hospitals mein ilaaj cashless hota hai.',
    },
    csc: {
      title: 'CSC Centre kya hai?',
      body: 'CSC (Common Service Centre) ek digital seva kendra hai jahan gaon/sheher ke log sarkari aur digitial services le sakte hain — PAN Card, Aadhaar, Voter ID, Ayushman Card, Money Transfer, Xerox/Printing, bill payment, aur bhi.\n\nEk CSC centre par aam taur par ye services hoti hain: PAN Card, Aadhaar Services, Voter ID, Ayushman Card, Smart Card, Xerox, Printing, Passport Size Photo, Scanning, Money Transfer aur Document Work.',
    },
  },
  en: {
    pan: {
      title: 'What is a PAN Card?',
      body: 'A PAN Card carries a 10-digit Permanent Account Number issued by the Income Tax Department. It is needed for almost every financial task — opening a bank account, paying tax, large payments.\n\nDocuments (usually):\n• Aadhaar Card\n• Passport-size photo\n• Date-of-birth proof (Aadhaar / Birth Certificate)\n• Signature\n\nHow it is made: the online form is filled on the NSDL/UTI portal, documents are uploaded, and after the fee the PAN card arrives at home (e-PAN comes first). Rules change from time to time — verify the latest fee and documents on the portal before filling a form.',
    },
    aadhaar: {
      title: 'What is Aadhaar?',
      body: 'Aadhaar is a 12-digit unique ID issued by UIDAI — proof of identity and address.\n\nServices: new Aadhaar, name/mobile/address correction, biometric update.\nDocuments: identity proof (PAN/Voter ID/Passport), address proof (electricity bill/bank statement), date-of-birth proof.\n\nNote: some Aadhaar updates happen only at authorised Aadhaar centres — a CSC centre can do only what the portal allows. Never fill a form with wrong information.',
    },
    voter: {
      title: 'What is a Voter ID?',
      body: 'A Voter ID (EPIC) is an identity card that gives Indian citizens aged 18 or above the right to vote.\n\nFor a new Voter ID, Form 6 is filled. Documents: age proof (Birth Certificate/Aadhaar), address proof, passport-size photo.\n\nFor correction/transfer, Form 8 is used. Applications are made online on the NVSP portal.',
    },
    ayushman: {
      title: 'What is an Ayushman Card?',
      body: 'Under Ayushman Bharat (PM-JAY), poor and needy families get free hospital treatment up to ₹5 lakh per year.\n\nEligibility: as per the scheme list (SECC data) — a CSC centre checks with Aadhaar whether the family is on the list.\nDocuments: Aadhaar Card, ration card (if any), family member details.\n\nAfter the card is made, treatment at listed hospitals is cashless.',
    },
    csc: {
      title: 'What is a CSC Centre?',
      body: 'A CSC (Common Service Centre) is a digital service centre where people can get government and digital services — PAN Card, Aadhaar, Voter ID, Ayushman Card, Money Transfer, Xerox/Printing, bill payment, and more.\n\nA CSC centre usually offers: PAN Card, Aadhaar Services, Voter ID, Ayushman Card, Smart Card, Xerox, Printing, Passport Size Photo, Scanning, Money Transfer and Document Work.',
    },
  },
};

export function explainService(topic: string, lang: AiLangCode): string | null {
  const table = EXPLAINERS[lang] || EXPLAINERS.hi;
  const e = table[topic];
  if (!e) return null;
  return `${e.title}\n\n${e.body}`;
}

/* ================= Troubleshooting (common, safe steps) ================= */

const FIXES: { re: RegExp; hi: string; en: string }[] = [
  {
    re: /internet|wifi|net.*(nahi|slow|chal|band)|data.*(nahi|khatam)/,
    hi: 'Internet na chale to ye try karo:\n1. Phone ka Airplane Mode 10 second ON karke OFF karo.\n2. Wi-Fi ya Mobile Data ek baar band karke phir chalu karo.\n3. Phone restart karo.\n4. Agar Wi-Fi hai to router ko 30 second ke liye band karke phir chalu karo.\n5. Phir bhi na chale to apne network provider ko call karo — ho sakta hai area mein network down ho.',
    en: 'If the internet is not working, try this:\n1. Turn Airplane Mode ON for 10 seconds, then OFF.\n2. Turn Wi-Fi or Mobile Data off and on again.\n3. Restart the phone.\n4. For Wi-Fi, switch the router off for 30 seconds and on again.\n5. If it still does not work, call your network provider — the network may be down in your area.',
  },
  {
    re: /printer|print.*(nahi|ruk|error)|xerox.*(nahi|ruk)/,
    hi: 'Printer na chale to ye check karo:\n1. Printer ON hai aur cable/USB theek se laga hai?\n2. Paper tray mein kagaz hai?\n3. Ink/toner khatam to nahi — printer ki light blink kar rahi hai kya?\n4. Computer/phone se printer select sahi hai?\n5. Printer ko band karke 30 second baad phir chalu karo, aur ek test page print karo.\n6. Agar paper jam hai to dhyaan se kagaz nikalo — zor se kheenchna mat.',
    en: 'If the printer is not working, check this:\n1. Is the printer ON and the cable/USB connected properly?\n2. Is there paper in the tray?\n3. Is the ink/toner finished — is the printer light blinking?\n4. Is the correct printer selected on the computer/phone?\n5. Switch the printer off, wait 30 seconds, switch it on and print a test page.\n6. If paper is jammed, pull it out gently — do not force it.',
  },
  {
    re: /phone.*(slow|hang|garam)|mobile.*(slow|hang|garam)|slow.*phone/,
    hi: 'Phone slow ya hang ho to:\n1. Phone restart karo — ye sabse asaan fix hai.\n2. Jo apps use nahi karte, unhe band karo aur purani apps delete karo.\n3. Storage check karo — agar 90% se zyada bhara hai to purane photos/videos delete ya backup karo.\n4. Phone ka software update karo (Settings → Software Update).\n5. Phone garam ho raha hai to use band karke thanda hone do — charging par game/video mat chalao.',
    en: 'If the phone is slow or hanging:\n1. Restart the phone — this is the easiest fix.\n2. Close apps you are not using and delete old apps.\n3. Check storage — if more than 90% full, delete or back up old photos/videos.\n4. Update the phone software (Settings → Software Update).\n5. If the phone is hot, switch it off and let it cool — do not play games or videos while charging.',
  },
  {
    re: /upi.*(fail|nahi|error|pending)|payment.*(fail|ruk|nahi)/,
    hi: 'UPI payment fail ho to:\n1. Pehle check karo — paisa account se kata ya nahi (bank SMS/app mein dekho). Agar nahi kata to dobara try karo.\n2. Agar paisa kat gaya par payment fail hua to 24–48 ghante mein wapas aa jata hai — bank se confirm karo.\n3. Internet connection check karo aur app ko update karo.\n4. UPI PIN galat to nahi — 3 baar galat PIN par UPI block ho jata hai, phir bank se reset karna padta hai.\n5. Kabhi bhi kisi ko apna UPI PIN ya OTP mat batao — bank kabhi PIN/OTP nahi mangta.',
    en: 'If a UPI payment fails:\n1. First check whether money was deducted (bank SMS/app). If not deducted, try again.\n2. If money was deducted but the payment failed, it usually comes back in 24–48 hours — confirm with your bank.\n3. Check the internet connection and update the app.\n4. Check the UPI PIN — 3 wrong PINs block UPI, then the bank must reset it.\n5. Never share your UPI PIN or OTP with anyone — the bank never asks for PIN/OTP.',
  },
  {
    re: /storage.*(full|khatam|bhar)|memory.*full/,
    hi: 'Storage full ho to:\n1. Settings → Storage mein dekho kya sabse zyada jagah le raha hai.\n2. WhatsApp ke purane videos/photos delete karo (WhatsApp → Settings → Storage).\n3. Photos ka backup Google Photos par lo, phir phone se delete karo.\n4. Jo apps use nahi karte, unhe uninstall karo.',
    en: 'If storage is full:\n1. Check Settings → Storage to see what is using the most space.\n2. Delete old WhatsApp videos/photos (WhatsApp → Settings → Storage).\n3. Back up photos to Google Photos, then delete them from the phone.\n4. Uninstall apps you do not use.',
  },
];

function fixFor(message: string, lang: AiLangCode): string | null {
  const s = message.toLowerCase();
  for (const f of FIXES) {
    if (f.re.test(s)) return lang === 'en' ? f.en : f.hi;
  }
  return null;
}

/* ================= Business ideas / planning for a CSC centre ================= */

export function cscBusinessIdeas(lang: AiLangCode): string {
  if (lang === 'en') {
    return 'Business ideas for your CSC centre:\n1. Money Transfer + AEPS — daily commission income; keep enough fund balance.\n2. PAN Card + Aadhaar + Voter ID + Ayushman — steady demand, one customer often needs 2–3 services.\n3. Passport-size photos + lamination — quick, high-margin add-on with Xerox.\n4. Online form filling (exam forms, job applications, railway tickets) — charge per form.\n5. Bill payments + mobile recharge — small margin but daily footfall.\n6. Printing + spiral binding for students — exam season is peak time.\n7. WhatsApp reminders for due payments — customers come back faster.\n\nStart with one new service, do it well for a month, then add the next. Which one do you want to start with? I can make a plan for it.';
  }
  if (lang === 'gu') {
    return 'Tamara CSC centre mate business ideas:\n1. Money Transfer + AEPS — roj commission income; fund balance purto rakho.\n2. PAN Card + Aadhaar + Voter ID + Ayushman — satat demand, ek customer ne 2–3 service joie chhe.\n3. Passport-size photo + lamination — Xerox sathe jaldi, vadhu margin.\n4. Online form bharvu (exam form, job application, railway ticket) — form deeth charge.\n5. Bill payment + mobile recharge — ochho margin pan roj customer aave chhe.\n6. Printing + spiral binding vidyarthi mate — exam season ma peak.\n7. Due payment mate WhatsApp reminder — customer jaldi paachha aave chhe.\n\nEk navo service thi shuru karo, ek mahino saras karo, pachhi bijo umero. Kayo shuru karvo chhe? Hu tena mate plan banavi aapish.';
  }
  return 'CSC centre ke liye business ideas:\n1. Money Transfer + AEPS — roz commission income; fund balance poora rakho.\n2. PAN Card + Aadhaar + Voter ID + Ayushman — hamesha demand rehti hai, ek customer ko 2–3 service chahiye hoti hai.\n3. Passport-size photo + lamination — Xerox ke saath jaldi, achha margin.\n4. Online form bharna (exam form, job application, railway ticket) — per form charge.\n5. Bill payment + mobile recharge — chhota margin par roz aane wale customer.\n6. Printing + spiral binding students ke liye — exam season mein peak.\n7. Due payment ke liye WhatsApp reminder — customer jaldi wapas aate hain.\n\nEk nayi service se shuru karo, ek mahina achhe se karo, phir dusri add karo. Kaunsi shuru karni hai? Main uska plan bana sakta hoon.';
}

export function websitePlan(lang: AiLangCode): string {
  if (lang === 'en') {
    return 'How to make a website — simple plan:\n1. Purpose first: what should the website do? (Shop info? Online orders? Portfolio?)\n2. Name + pages: Home, Services, Prices, Contact — 4 pages are enough to start.\n3. Build it: free tools like Google Sites (easiest) or a simple site builder; for a shop website you do not need coding.\n4. Content: shop name, services with prices, phone number, address, photos.\n5. Publish + share the link on WhatsApp and Google.\n\nTell me — what kind of website do you want? A shop website, a personal website, or something else? I can plan it step by step with you.';
  }
  if (lang === 'gu') {
    return 'Website kevite banavi shakay — saral plan:\n1. Pehla hetu: website shu karse? (Shop ni mahiti? Online order? Portfolio?)\n2. Naam + pages: Home, Services, Prices, Contact — sharuaat mate 4 pages purta chhe.\n3. Banavvu: Google Sites jevu free tool (sauthi sahalu) ke site builder; shop website mate coding ni jarur nathi.\n4. Content: shop nu naam, kimmat sathe services, phone number, address, photos.\n5. Publish karo ane link WhatsApp ane Google par share karo.\n\nKaho — kevi website joie chhe? Shop website, personal website, ke biju kai? Hu tamari sathe step-by-step plan banavish.';
  }
  return 'Website kaise banaye — simple plan:\n1. Pehle purpose: website ko kya karna hai? (Shop ki info? Online order? Portfolio?)\n2. Naam + pages: Home, Services, Prices, Contact — shuru ke liye 4 pages kaafi hain.\n3. Banana: Google Sites jaisa free tool (sabse asaan) ya koi site builder; shop website ke liye coding ki zaroorat nahi.\n4. Content: shop ka naam, kimmat ke saath services, phone number, address, photos.\n5. Publish karo aur link WhatsApp aur Google par share karo.\n\nBatao — kis type ki website chahiye? Shop website, personal website, ya kuch aur? Main tumhare saath step-by-step plan bana sakta hoon.';
}

/* ================= Writing help ================= */

export function writingHelp(message: string, lang: AiLangCode): string | null {
  const s = message.toLowerCase();
  if (/whatsapp.*(message|msg)|message.*(likh|bhejna|send)|msg.*likh/.test(s)) {
    return lang === 'en'
      ? 'Here is a WhatsApp message template you can copy:\n\n"Namaste! This is {shop} — your {service} work is done. Please collect it from the shop. Total: ₹{amount}. Thank you!"\n\nTell me the customer name, service and amount and I will fill it in for you.'
      : 'WhatsApp message ka template — copy kar sakte ho:\n\n"Namaste! Main {shop} se bol raha hoon — aapka {service} ka kaam ho gaya hai. Shop se collect kar lo. Total: ₹{amount}. Dhanyavaad!"\n\nCustomer ka naam, service aur amount batao to main bhar kar de dunga.';
  }
  if (/email.*(likh|likho|write)|mail.*likh/.test(s)) {
    return lang === 'en'
      ? 'Email template:\n\nSubject: {subject}\n\n"Dear Sir/Madam,\nI am writing about {topic}. Please let me know the next steps.\nThank you,\n{name} — {shop}"\n\nTell me whom the email is for and what it is about, and I will write the full email for you.'
      : 'Email ka template:\n\nSubject: {subject}\n\n"Dear Sir/Madam,\nMain {topic} ke baare mein likh raha hoon. Kripya aage ke steps bata dein.\nDhanyavaad,\n{name} — {shop}"\n\nKisko email likhna hai aur kis baare mein — batao to main poora email likh dunga.';
  }
  if (/caption|instagram|facebook.*post/.test(s)) {
    return lang === 'en'
      ? 'Caption idea for your shop post:\n\n"📄 Xerox • Printing • PAN Card • Aadhaar — sab kaam ek hi jagah! Visit {shop} today. ✅ Fast service, fair price."\n\nTell me which service the post is about and I will write 2–3 captions for it.'
      : 'Shop post ke liye caption idea:\n\n"📄 Xerox • Printing • PAN Card • Aadhaar — sab kaam ek hi jagah! Aaj hi {shop} par aao. ✅ Fast service, sahi price."\n\nKis service ke liye post hai — batao to main 2–3 caption likh dunga.';
  }
  return null;
}

/* ================= Arithmetic + conversions (safe, no eval) ================= */

function calc(message: string): string | null {
  const s = message.replace(/,/g, '').toLowerCase();
  // "250 * 3", "12+8", "1000 / 4", "15% of 2000", "2000 ka 15%"
  const pct = s.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of|ka)\s*(\d+(?:\.\d+)?)/);
  if (pct) {
    const v = (parseFloat(pct[1]) / 100) * parseFloat(pct[2]);
    return `${pct[1]}% of ${pct[2]} = ${Number.isInteger(v) ? v : v.toFixed(2)}`;
  }
  const m = s.match(/(\d+(?:\.\d+)?)\s*([+\-*/x×÷])\s*(\d+(?:\.\d+)?)/);
  if (m && !/\d{4}-\d{2}-\d{2}/.test(s)) {
    const a = parseFloat(m[1]);
    const b = parseFloat(m[3]);
    const op = m[2];
    let v: number | null = null;
    if (op === '+') v = a + b;
    else if (op === '-') v = a - b;
    else if (op === '*' || op === 'x' || op === '×') v = a * b;
    else if (op === '/' || op === '÷') v = b === 0 ? null : a / b;
    if (v === null) return 'Divide by zero nahi ho sakta.';
    const out = Number.isInteger(v) ? String(v) : v.toFixed(2);
    return `${m[1]} ${op === 'x' || op === '×' ? '×' : op} ${m[3]} = ${out}`;
  }
  // Unit conversions.
  const conv = s.match(/(\d+(?:\.\d+)?)\s*(km|kilometer|kilometre|kg|kilogram|gram|gm|inch|inches|feet|foot|mile|miles)\b/);
  if (conv && /(mile|miles|kg|pound|inch|cm|meter|metre)/.test(s)) {
    const v = parseFloat(conv[1]);
    const u = conv[2];
    if ((u === 'km' || u.startsWith('kilo')) && /mile/.test(s)) return `${v} km = ${(v * 0.621371).toFixed(2)} miles`;
    if (/mile/.test(s) && u.startsWith('mile')) return `${v} miles = ${(v * 1.60934).toFixed(2)} km`;
    if (u === 'kg' && /pound/.test(s)) return `${v} kg = ${(v * 2.20462).toFixed(2)} pounds`;
    if ((u === 'inch' || u === 'inches') && /cm/.test(s)) return `${v} inch = ${(v * 2.54).toFixed(2)} cm`;
    if ((u === 'gram' || u === 'gm') && /kg/.test(s)) return `${v} gram = ${(v / 1000).toFixed(3)} kg`;
  }
  return null;
}

/* ================= Checklists (UPDATE 16: "do it" — real lists) ================= */

export interface Checklist {
  id: string;
  title: string;
  items: string[];
  createdAt: string;
}

const CHECKLIST_TOPICS: Record<string, { hi: string[]; en: string[]; gu: string[] }> = {
  pan: {
    hi: ['Customer ka Aadhaar Card lena', 'Passport-size photo lena', 'Date of birth verify karna', 'Online form bharna (NSDL/UTI portal)', 'Fee lena aur receipt dena', 'Acknowledgement number customer ko dena', 'PAN card aane par customer ko bulana'],
    en: ['Take the customer Aadhaar Card', 'Take a passport-size photo', 'Verify the date of birth', 'Fill the online form (NSDL/UTI portal)', 'Collect the fee and give a receipt', 'Give the acknowledgement number to the customer', 'Call the customer when the PAN card arrives'],
    gu: ['Customer nu Aadhaar Card levu', 'Passport-size photo levo', 'Date of birth verify karvo', 'Online form bharvu (NSDL/UTI portal)', 'Fee levi ane receipt aapvi', 'Acknowledgement number customer ne aapvo', 'PAN card aave tyare customer ne bolavvo'],
  },
  shop_day: {
    hi: ['Shop kholna aur safai karna', 'Cash aur UPI balance check karna', 'Pending jobs ki list dekhna', 'Money Transfer fund balance check karna', 'Customer due walo ko reminder bhejna', 'Din ke end mein Daily Business closing karna', 'Kal ke kaam ki list banana'],
    en: ['Open the shop and clean up', 'Check cash and UPI balance', 'Look at the pending jobs list', 'Check the Money Transfer fund balance', 'Send reminders to customers who owe money', 'Do the Daily Business closing at the end of the day', 'Make tomorrow work list'],
    gu: ['Shop kholvi ane safai karvi', 'Cash ane UPI balance check karvu', 'Pending jobs ni list jovi', 'Money Transfer fund balance check karvu', 'Customer due valane reminder mokalvo', 'Divas na end ma Daily Business closing karvu', 'Kale na kaam ni list banavvi'],
  },
  website: {
    hi: ['Website ka purpose likhna', 'Pages ki list banana (Home, Services, Prices, Contact)', 'Services aur prices likhna', 'Shop ki photos lena', 'Contact details (phone, address) likhna', 'Website publish karna', 'Link WhatsApp aur Google par share karna'],
    en: ['Write down the website purpose', 'List the pages (Home, Services, Prices, Contact)', 'Write services and prices', 'Take shop photos', 'Write contact details (phone, address)', 'Publish the website', 'Share the link on WhatsApp and Google'],
    gu: ['Website no hetu lakhvo', 'Pages ni list banavvi (Home, Services, Prices, Contact)', 'Services ane prices lakhva', 'Shop na photos leva', 'Contact details (phone, address) lakhva', 'Website publish karvi', 'Link WhatsApp ane Google par share karvi'],
  },
  aadhaar: {
    hi: ['Customer ka purana Aadhaar lena', 'Kya update karna hai — naam/mobile/address?', 'Proof documents lena', 'Portal par form bharna', 'Fee lena aur receipt dena', 'Acknowledgement slip dena'],
    en: ['Take the customer old Aadhaar', 'What needs updating — name/mobile/address?', 'Take the proof documents', 'Fill the form on the portal', 'Collect the fee and give a receipt', 'Give the acknowledgement slip'],
    gu: ['Customer nu junu Aadhaar levu', 'Shu update karvanu chhe — naam/mobile/address?', 'Proof documents leva', 'Portal par form bharvu', 'Fee levi ane receipt aapvi', 'Acknowledgement slip aapvi'],
  },
};

export function checklistTopicFor(message: string): string {
  const s = message.toLowerCase();
  if (/pan/.test(s)) return 'pan';
  if (/aadhaar|aadhar/.test(s)) return 'aadhaar';
  if (/website/.test(s)) return 'website';
  return 'shop_day';
}

export function buildChecklist(topic: string, lang: AiLangCode, whenLabel: string): Checklist {
  const t = CHECKLIST_TOPICS[topic] || CHECKLIST_TOPICS.shop_day;
  const items = lang === 'en' ? t.en : lang === 'gu' ? t.gu : t.hi;
  const title =
    topic === 'pan' ? (lang === 'en' ? `PAN Card work checklist — ${whenLabel}` : lang === 'gu' ? `PAN Card kaam checklist — ${whenLabel}` : `PAN Card kaam checklist — ${whenLabel}`)
    : topic === 'website' ? (lang === 'en' ? `Website checklist — ${whenLabel}` : `Website checklist — ${whenLabel}`)
    : (lang === 'en' ? `Shop work checklist — ${whenLabel}` : lang === 'gu' ? `Shop kaam checklist — ${whenLabel}` : `Shop kaam checklist — ${whenLabel}`);
  return { id: `chk_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`, title, items, createdAt: new Date().toISOString() };
}

export function checklistText(c: Checklist, lang: AiLangCode): string {
  const head = lang === 'en' ? `Here is your checklist — ${c.title}:` : lang === 'gu' ? `Tamari checklist — ${c.title}:` : `Ye rahi tumhari checklist — ${c.title}:`;
  const tail = lang === 'en' ? 'I have saved it — you can open it again from the chat. Tell me when a task is done and I will tick it off.' : lang === 'gu' ? 'Hu aene save kari didhi chhe — tame chat mathi phari kholi shaksho. Koi kaam thai jay to kaho, hu tick kari daish.' : 'Maine ise save kar diya hai — chat se phir khol sakte ho. Koi kaam ho jaye to batao, main tick kar dunga.';
  return `${head}\n${c.items.map((it, i) => `${i + 1}. ☐ ${it}`).join('\n')}\n\n${tail}`;
}

/** Checklists are saved per profile in local storage (browser) or in
 *  memory (tests/Node). They are NOT financial records. */
const memStore = new Map<string, Checklist[]>();
function storeKey(profileId: string): string {
  return `bizkhata.checklists.v1.${profileId}`;
}
export function saveChecklist(profileId: string, c: Checklist): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(storeKey(profileId));
      const list: Checklist[] = raw ? JSON.parse(raw) : [];
      list.unshift(c);
      window.localStorage.setItem(storeKey(profileId), JSON.stringify(list.slice(0, 20)));
      return;
    }
  } catch { /* fall through to memory */ }
  const list = memStore.get(profileId) || [];
  list.unshift(c);
  memStore.set(profileId, list.slice(0, 20));
}
export function listChecklists(profileId: string): Checklist[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(storeKey(profileId));
      if (raw) return JSON.parse(raw) as Checklist[];
    }
  } catch { /* ignore */ }
  return memStore.get(profileId) || [];
}

/* ================= General answers ================= */

export interface GeneralAnswer {
  text: string;
  /** True when the question needs live/current information we do not
   *  have on-device — the caller must be honest about it, never invent. */
  needsLive?: boolean;
}

const LIVE_PATTERNS = [
  /aaj ka (news|mausam|weather)|news.*(aaj|today)|cricket.*(score|match|won|jeeta)|mausam kaisa|weather.*today|petrol.*(price|rate|daam)|gold.*(price|rate)|aaj.*(rate|bhav)|who won|latest news|breaking news|aaj kaun jeeta/,
];

export function answerGeneral(message: string, lang: AiLangCode, seed: string): GeneralAnswer | null {
  const s = message.toLowerCase();
  const norm = message;
  // Live/current information — never invent.
  for (const re of LIVE_PATTERNS) {
    if (re.test(s)) {
      return {
        needsLive: true,
        text: lang === 'en'
          ? 'I do not have live news or current rates on this device, so I will not guess. Please check the news app or the official website for today\u2019s update — and if you add an AI chat key in Settings, I can look it up for you.'
          : lang === 'gu'
            ? 'Mara device par live news ke aaj na bhav nathi, etle hu andaj thi kahi na shaku. Aaj ni mahiti mate news app ke official website jovo — ane jo tame Settings ma AI chat ni key add karsho to hu tamara mate joi aapish.'
            : 'Mere paas is device par live news ya aaj ke rates nahi hain, isliye main andaze se kuch nahi kahunga. Aaj ki update ke liye news app ya official website dekho — aur agar tum Settings mein AI chat ki key add kar do to main tumhare liye dekh sakta hoon.',
      };
    }
  }
  // Jokes.
  if (/joke|chutkula|hasao|majak|funny/.test(s)) {
    return { text: tellJoke(lang, seed) };
  }
  // Service explainers.
  if (/pan card/.test(s) && /(kya|samjhao|explain|batao|matlab|about|bare mein|ke baare)/.test(s)) {
    const t = explainService('pan', lang);
    if (t) return { text: t };
  }
  if (/aadhaar|aadhar/.test(s) && /(kya|samjhao|explain|batao|matlab|about|bare mein)/.test(s)) {
    const t = explainService('aadhaar', lang);
    if (t) return { text: t };
  }
  if (/voter/.test(s) && /(kya|samjhao|explain|batao|matlab|about|bare mein)/.test(s)) {
    const t = explainService('voter', lang);
    if (t) return { text: t };
  }
  if (/ayushman/.test(s) && /(kya|samjhao|explain|batao|matlab|about|bare mein)/.test(s)) {
    const t = explainService('ayushman', lang);
    if (t) return { text: t };
  }
  if (/(csc|common service)/.test(s) && /(kya|samjhao|explain|batao|matlab|about|bare mein|centre|center)/.test(s)) {
    const t = explainService('csc', lang);
    if (t) return { text: t };
  }
  // Troubleshooting.
  const fix = fixFor(norm, lang);
  if (fix) return { text: fix };
  // Business ideas / planning.
  if (/business idea|naya business|idea chahiye|idea do|kaunsa business|new business/.test(s)) {
    return { text: cscBusinessIdeas(lang) };
  }
  if (/website.*(kaise|ban|bana|karo|banani|banane)|how.*(make|build).*website|website.*banana/.test(s)) {
    return { text: websitePlan(lang) };
  }
  // Writing help.
  const w = writingHelp(norm, lang);
  if (w) return { text: w };
  // Arithmetic / conversions.
  const c = calc(norm);
  if (c) return { text: c };
  // Simple education explainers.
  if (/photosynthesis/.test(s)) {
    return { text: lang === 'en' ? 'Photosynthesis is how green plants make food: they use sunlight, water and carbon dioxide to make glucose (food) and release oxygen. That is why plants are called the lungs of the earth.' : 'Photosynthesis woh process hai jisse hare ped-paudhe khana banate hain: suraj ki roshni, paani aur carbon dioxide se glucose (khana) banta hai aur oxygen nikalti hai. Isi liye ped-paudhon ko dharti ke phephde kehte hain.' };
  }
  if (/internet kya hai|what is (the )?internet/.test(s)) {
    return { text: lang === 'en' ? 'The internet is a worldwide network of computers connected to each other. It lets us send messages, watch videos, pay online and get information from anywhere in the world — through Wi-Fi or mobile data.' : 'Internet duniya bhar ke computers ka ek bada network hai jo ek dusre se jude hote hain. Isse hum message bhej sakte hain, video dekh sakte hain, online payment kar sakte hain aur duniya bhar ki jankari le sakte hain — Wi-Fi ya mobile data se.' };
  }
  if (/gst kya hai|what is gst/.test(s)) {
    return { text: lang === 'en' ? 'GST (Goods and Services Tax) is the single tax on most goods and services in India. It replaced many older taxes. Small shops below the turnover limit usually do not need GST registration — but the exact limit changes, so check the official GST portal before deciding.' : 'GST (Goods and Services Tax) Bharat mein zyadatar goods aur services par lagne wala ek hi tax hai. Isne kai purane tax ko replace kar diya. Chhoti dukaanen jin ka turnover limit se kam hai, unhe aam taur par GST registration ki zaroorat nahi hoti — par limit badalta rehta hai, isliye official GST portal par check kar lena.' };
  }
  // Translation of a few common phrases.
  if (/translate|matlab.*(english|gujarati|hindi)|ka matlab/.test(s)) {
    if (/dhanyavaad|dhanyavad|thank/.test(s)) return { text: lang === 'en' ? '"Dhanyavaad" means "Thank you". In Gujarati it is "Aabhar".' : '"Dhanyavaad" ka matlab hai "Thank you". Gujarati mein ise "Aabhar" kehte hain.' };
    if (/namaste/.test(s)) return { text: lang === 'en' ? '"Namaste" is a respectful greeting — it means "Hello" with respect. In Gujarati: "Namaste" or "Kem chho".' : '"Namaste" ek samman wala greeting hai — matlab "Hello". Gujarati mein: "Namaste" ya "Kem chho".' };
  }
  return null;
}

/** Detect the user's own language from the message (used by the router). */
export function replyLangOf(message: string): AiLangCode {
  return detectLanguage(message).code;
}
