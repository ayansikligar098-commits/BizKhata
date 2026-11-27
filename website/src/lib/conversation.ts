/**
 * BizKhata conversation orchestrator — UPDATE 14/15/16.
 *
 * One entry point for every chat message: respondToMessage().
 *
 * Order (the fix for both screenshot bugs):
 *   1. Unified intent router (intent.ts) runs FIRST — casual, plan,
 *      statement, do-command and language-switch messages are decided
 *      BEFORE the financial parser ever sees them, so a greeting or a
 *      plan can never become a money question or a no-data reply.
 *   2. Financial actions go ONLY through parseAssistantMessage() +
 *      the existing preview → confirm → backend flow. The result
 *      carries the structured action; the UI shows the preview.
 *   3. Business-data questions go through computeKnowledge() /
 *      answerLocally() — figures only from the real ledgers. On an
 *      empty store a total/profit question quotes the real figure
 *      (₹0.00), never "no records" as a substitute for a figure.
 *   4. General questions go through the on-device knowledge base
 *      (general.ts). If it cannot genuinely answer, the result is
 *      marked cloudNeeded: the chat UI may ask the owner-configured
 *      conversational-AI service (conversation-ai.ts). With no service
 *      configured, the reply says so honestly (first time per
 *      conversation) and asks the user to rephrase — it NEVER invents
 *      an unrelated business question.
 *   5. Do-commands (UPDATE 16) EXECUTE: navigation returns the real
 *      route, checklist requests build + save a real checklist,
 *      summary/report requests return the real ledger summary.
 *
 * This module is synchronous and deterministic (no network, no key)
 * so the acceptance tests can drive it exactly. The async cloud-AI
 * call lives in the chat UI, which replaces the text only when the
 * service actually answers.
 */
import { answerLocally, computeFacts, entryPreviewLine, findDuplicateWarning, parseAssistantMessage, type ParsedMessage } from './chatbot';
import { applyAssistantAction, findAssistantTargetById, type AssistantAction } from './assistant';
import {
  answerGeneral, buildChecklist, checklistDocItems, checklistItemsFor, checklistText,
  checklistTopicFor, listChecklists, saveChecklist, serviceDocuments, updateChecklist, type Checklist,
} from './general';
import {
  answerCasualFor, answerPlan, answerStatement, bareNumber, classifyIntent, correctedNumber,
  currentTopic, detectLanguageSwitch, editItemText, isChecklistTranslate, targetLangFor,
  type UnifiedIntent,
} from './intent';
import { computeKnowledge, navigationRequest, type ActiveChecklist, type ChatContext, type KnowledgeTable } from './knowledge';
import { detectLanguage, LANG_BY_CODE, replyIn, type AiLangCode } from './languages';
import { hasAiServiceKey } from './conversation-ai';
import { shortenForVoice } from './voice';
import { formatINR } from './money';
import { todayISO } from './types';
import {
  appChangeQueuedText, appChangeSpecText, buildAppChangeSpec, listDevRequests, queueDevRequest,
  type AppChangeSpec, type DevRequest,
} from './dev-requests';
import type { AppState, BusinessProfile } from './types';

export interface ConversationResult {
  intent: UnifiedIntent;
  /** Reply text to show. */
  text: string;
  kind: 'text' | 'action' | 'navigation' | 'checklist' | 'summary';
  /** Structured financial action (UI shows preview → confirm). */
  action?: AssistantAction;
  previewLines?: string[];
  totalPaise?: number;
  duplicateWarning?: string;
  /** Clarification draft question (UI asks the user). */
  draftQuestion?: string;
  draft?: ParsedMessage extends never ? never : unknown;
  navigateTo?: string;
  links?: { label: string; path: string }[];
  table?: KnowledgeTable;
  checklist?: Checklist;
  /** The user asked to switch language — the UI must apply this. */
  languageChanged?: AiLangCode;
  /** This message needs the configured AI service (local engine cannot answer it). */
  cloudNeeded?: boolean;
  /** Honest no-key notice was included in the text (first time only). */
  keyNoticeShown?: boolean;
  /** Contextual follow-up chips for this reply (UPDATE 20 §2) — only
   *  suggestions relevant to this turn; empty means show no chips. */
  suggestions?: string[];
  /** Saved development request (app_change accepted → queued). */
  devRequest?: DevRequest;
  newCtx: ChatContext;
}

const LANG_SWITCH_REPLY: Record<string, string> = {
  gu: 'Barabar! Have thi hu Gujarati ma vaat karish. Kaho, shu help joie chhe?',
  hi: 'Theek hai! Ab se main Hindi/Hinglish mein baat karunga. Batao, kya help chahiye?',
  en: 'Sure! From now on I will talk in English. What do you need help with?',
  mr: 'Barobar! Aata pasun mi Marathi madhe bolen. Sang, kay madat havay?',
  bn: 'Thik ache! Ekhon theke ami Bangla te kotha bolbo. Bolo, ki sahajjo lagbe?',
};

function userFacts(ctx: ChatContext, fact?: string): string[] {
  const list = [...(ctx.userFacts || [])];
  if (fact && !list.includes(fact)) list.push(fact);
  return list;
}

/**
 * Contextual follow-up chips (UPDATE 20 §2). Only suggestions relevant
 * to THIS turn — never the same fixed chips after every answer. An
 * empty list means the UI shows no chips at all.
 *//**
 * Action verification (FINAL DIRECTIVE §6): a reply must never claim
 * a checklist / dev-request was saved without checking the store.
 * Returns the honest reply text: the saved artefact, or the list plus
 * a plain failure note when the save did not stick.
 */
function verifiedChecklist(profileId: string, c: Checklist, lang: AiLangCode): { text: string; ok: boolean } {
  let ok = false;
  try { ok = listChecklists(profileId).some((x) => x.id === c.id); } catch { ok = false; }
  if (ok) return { text: checklistText(c, lang), ok: true };
  const note = lang === 'en'
    ? 'I made the checklist, but it could not be saved — please try again.'
    : 'Checklist bana di, lekin save nahi ho payi — dobara try karo.';
  return { text: `${checklistText(c, lang)}\n\n${note}`, ok: false };
}

function suggestionsFor(intent: UnifiedIntent, ctx: ChatContext, _lang: AiLangCode, acceptedDev = false): string[] {
  switch (intent) {
    case 'plan':
      return ctx.pendingOffer ? ['Checklist bana do', 'Documents bhi batao'] : [];
    case 'do_checklist':
    case 'followup_count':
    case 'checklist_edit':
    case 'checklist_translate':
      return ['Documents bhi add karo', 'English mein likho'];
    case 'accept_offer':
      if (acceptedDev) return ['Module Requests kholo'];
      return ctx.activeChecklist ? ['Documents bhi add karo', 'English mein likho'] : [];
    case 'app_change':
      return ['Haan, banao'];
    case 'business_query':
      return ['Aaj ka summary banao'];
    default:
      return [];
  }
}

export function respondToMessage(opts: {
  message: string;
  state: AppState;
  profile: BusinessProfile;
  ctx?: ChatContext;
  preferredLang?: AiLangCode | 'auto' | null;
}): ConversationResult {
  const { message, state, profile } = opts;
  const ctx: ChatContext = opts.ctx || {};
  const det = detectLanguage(message);
  const detectedLang = det.code;
  // A bare follow-up ("5", "Ha", "Aur 200 UPI") carries no language
  // signal of its own — keep the conversation's language instead of
  // defaulting to English. Without this the confirm prompt flipped
  // Hinglish→English mid-conversation ("Aur 200 UPI" detects as 'en').
  // The same applies to one-word casual turns ("Shukriya", "Bye",
  // "Namaste"): detectLanguage sees no Hinglish marker in them, so a
  // thanks/bye after a Hinglish conversation was answered in English.
  const isFollowup = /^(aur|bhi|or|also|phir)\b/i.test(message.trim())
    || /^\d+\s*$/.test(message.trim())
    || /^(haan?|ha+|yes|nahi|nahin|no)\b/i.test(message.trim())
    || /^(shukriya|dhanyavaad?|thanks?|thank you|bye|alvida|namaste|namaskar|hi+|hello|hey|theek hai|ok+)\b/i.test(message.trim());
  // UPDATE 25 (C-14): a LOW-CONFIDENCE detection (≤0.5 — the message
  // carries almost no language signal, e.g. "PAN card ke baare mein
  // samjhao", "Rahul ko 10000 transfer kiya...") falls back to the
  // conversation language instead of flipping the reply to English.
  // The follow-up stickiness above already did this for short
  // messages; this extends it to every low-confidence message.
  const lang: AiLangCode = opts.preferredLang && opts.preferredLang !== 'auto'
    ? opts.preferredLang
    : isFollowup && ctx.lastLanguage ? ctx.lastLanguage
    : det.confidence <= 0.5 && ctx.lastLanguage ? ctx.lastLanguage
    : /[\p{L}]/u.test(message) ? detectedLang : (ctx.lastLanguage || detectedLang);
  const intent = classifyIntent(message, ctx, profile.services);
  const baseCtx: ChatContext = { ...ctx, lastLanguage: lang };
  // A pending offer lives for ONE turn: a new message on any other
  // topic clears it (the offer is acted on, or the topic changed).
  // 'plan' keeps/overwrites it below; 'accept_offer' consumes it.
  if (intent !== 'plan') delete baseCtx.pendingOffer;
  baseCtx.lastIntent = intent;
  const done = (r: Partial<ConversationResult> & { text: string; newCtx?: ChatContext }): ConversationResult => {
    const { newCtx, ...rest } = r;
    const out: ChatContext = newCtx || baseCtx;
    // Choke point: a pending offer / question lives only while the
    // user stays in the same topic. Any other reply clears it —
    // including knowledge answers, whose context is built from the
    // previous ctx and would otherwise reintroduce it. Follow-up and
    // checklist turns keep the question (corrections need the old
    // value); the active checklist itself is never cleared here, so
    // the user can return to it after a topic switch.
    const KEEP_OFFER: UnifiedIntent[] = ['plan', 'topic_followup', 'app_change'];
    const KEEP_QUESTION: UnifiedIntent[] = ['plan', 'topic_followup', 'followup_count', 'followup_correct', 'checklist_edit', 'checklist_translate', 'checklist_show', 'accept_offer'];
    const KEEP_ACTION: UnifiedIntent[] = ['business_action', 'followup_correct'];
    if (!KEEP_OFFER.includes(intent)) delete out.pendingOffer;
    if (!KEEP_QUESTION.includes(intent)) delete out.pendingQuestion;
    if (!KEEP_ACTION.includes(intent)) delete out.pendingAction;
    return { intent, kind: 'text', ...rest, newCtx: out, suggestions: suggestionsFor(intent, out, lang, !!rest.devRequest) };
  };

  // --- Language switch (UPDATE 16: do it, don't just talk about it). ---
  if (intent === 'language_switch') {
    const code = detectLanguageSwitch(message)!;
    const text = LANG_SWITCH_REPLY[code] || LANG_SWITCH_REPLY.en;
    return done({ text, kind: 'text', languageChanged: code, newCtx: { ...baseCtx, lastTopic: 'language' } });
  }

  // --- Key status (UPDATE 25, C-7): "Mene Key Dal Di Starting Me" —
  //     check the ACTUAL on-device key slot and answer honestly.
  //     This also answers the open UPDATE 14/15 key-migration
  //     question: the answer comes from the device's storage state,
  //     never a guess, and the key itself is never shown.
  if (intent === 'key_status') {
    const saved = hasAiServiceKey();
    const text = saved
      ? (lang === 'en'
        ? 'Haan — key save hai ✓, AI chat chalu hai. Kuch bhi poochho, main jawab dunga.'
        : 'Haan, key save hai ✓ — AI chat chalu hai. Kuch bhi poochho, main jawab dunga.')
      : (lang === 'en'
        ? 'Key save nahi dikh rahi — Settings → AI Chat mein check karo. Wahan key save karo, phir AI chat chalega.'
        : 'Key save nahi dikh rahi — Settings → AI Chat mein check karo. Wahan key save karo, phir AI chat chalega.');
    return done({ text, newCtx: { ...baseCtx, lastTopic: 'general' } });
  }

  // --- Translate THIS reply (UPDATE 25, C-13): "Aur English mein
  //     likho" with no active checklist translates just the last
  //     reply. It NEVER changes profile.aiLanguage (no
  //     languageChanged). The real translation comes from the cloud
  //     engine when a key is saved (cloudNeeded); without a key the
  //     last reply is shown again with an honest note in the target
  //     language — the profile language stays exactly as it was.
  if (intent === 'translate_reply') {
    const target = targetLangFor(message) || 'en';
    const last = (ctx.lastBotText || '').trim();
    if (!last) {
      const text = target === 'en'
        ? 'Which reply should I translate? Please tell me what to translate.'
        : target === 'gu'
          ? 'Kevo jawab translate karvo chhe? Kaho, shu translate karu.'
          : 'Kaunsa jawab translate karun? Batao, kya translate karna hai.';
      return done({ text, newCtx: { ...baseCtx, lastTopic: 'general' } });
    }
    const note = target === 'en'
      ? '\n\n(Translation needs the AI chat key — add it in Settings → AI Chat. Maine aapki bhasha setting nahi badli hai.)'
      : target === 'gu'
        ? '\n\n(Translate karva mate AI chat ni key joie chhe — Settings → AI Chat ma key add karo. Me tamari bhasha setting badli nathi.)'
        : '\n\n(Translate karne ke liye AI chat ki key chahiye — Settings → AI Chat mein key add karo. Maine aapki bhasha setting nahi badli hai.)';
    return done({ text: `${last}${note}`, cloudNeeded: true, newCtx: { ...baseCtx, lastTopic: 'general', translateTarget: target } });
  }

  // --- Shorten the last reply (UPDATE 25, C-17): typed "Bas, short
  //     mein batao" — first 2 sentences of the last reply, nothing else.
  if (intent === 'shorten_reply') {
    const last = (ctx.lastBotText || '').trim();
    if (!last) {
      return done({ text: lang === 'en' ? 'There is no reply to shorten yet — ask me something first.' : 'Abhi koi jawab nahi hai jo short karun — pehle kuch poochho.', newCtx: { ...baseCtx, lastTopic: 'general' } });
    }
    return done({ text: shortenForVoice(last, 2), newCtx: { ...baseCtx, lastTopic: 'general' } });
  }

  // --- Navigation (UPDATE 16: actually open the page). ---
  if (intent === 'navigation') {
    const nav = navigationRequest(message)!;
    const text = lang === 'en'
      ? `Opened ${nav.label} — you are now on the ${nav.label} page.`
      : lang === 'gu'
        ? `${nav.label} kholi didhu — tame have ${nav.label} page par chho.`
        : `${nav.label} khol diya — aap ab ${nav.label} page par hain.`;
    return done({ text, kind: 'navigation', navigateTo: nav.path, links: [{ label: `Open ${nav.label}`, path: nav.path }], newCtx: { ...baseCtx, lastTopic: 'navigation' } });
  }

  // --- Checklist (UPDATE 16: build + save a real checklist). ---
  if (intent === 'do_checklist') {
    // The topic comes from THIS message when it names a service; a
    // bare "Checklist bana do" after a plan uses the plan's topic
    // ("Kal Pan Card banane hai" → PAN checklist, not a shop list).
    const named = checklistTopicFor(message);
    const topic = named !== 'shop_day' ? named : (currentTopic(ctx) || 'shop_day');
    const whenLabel = /parso/.test(message.toLowerCase()) ? 'parso' : /kal/.test(message.toLowerCase()) ? 'kal' : 'aaj';
    const c = buildChecklist(topic, lang, whenLabel);
    saveChecklist(profile.id, c);
    const v = verifiedChecklist(profile.id, c, lang);
    const active: ActiveChecklist = { id: c.id, topic, when: whenLabel, lang, customItems: [] };
    return done({ text: v.text, kind: 'checklist', checklist: c, newCtx: { ...baseCtx, lastTopic: 'checklist', activeChecklist: v.ok ? active : undefined } });
  }

  // --- Accept a pending offer (UPDATE 17 / BUG A + UPDATE 22): a bare
  //     "Ha" / "Bana do" / "Haan, banao" after an offer executes it —
  //     a checklist is built + saved, an app change is QUEUED as a
  //     development request. Neither is ever a financial confirm.
  if (intent === 'accept_offer' && ctx.pendingOffer) {
    const offer = ctx.pendingOffer;
    if (offer.kind === 'app_change' && offer.spec) {
      const spec: AppChangeSpec = offer.spec;
      const req = queueDevRequest(profile.id, spec, offer.requestedAs || message);
      let queuedOk = false;
      try { queuedOk = listDevRequests(profile.id).some((x) => x.id === req.id); } catch { queuedOk = false; }
      const text = queuedOk
        ? appChangeQueuedText(spec, lang)
        : (lang === 'en'
          ? `I could not save "${spec.name}" to the development queue — please try confirming again. Nothing was built.`
          : `"${spec.name}" development queue mein save nahi ho paya — dobara confirm karo. Kuch bana nahi hai.`);
      return done({
        text,
        kind: 'text',
        devRequest: queuedOk ? req : undefined,
        links: queuedOk ? [{ label: 'Open Module Requests', path: '/module-requests' }] : undefined,
        newCtx: { ...baseCtx, lastTopic: 'app_change', pendingOffer: undefined },
      });
    }
    if (offer.kind === 'checklist') {
      const c = buildChecklist(offer.topic, lang, offer.when);
      saveChecklist(profile.id, c);
      const v = verifiedChecklist(profile.id, c, lang);
      const active: ActiveChecklist = { id: c.id, topic: offer.topic, when: offer.when, lang, customItems: [] };
      return done({ text: v.text, kind: 'checklist', checklist: c, newCtx: { ...baseCtx, lastTopic: 'checklist', activeChecklist: v.ok ? active : undefined, pendingOffer: undefined } });
    }
  }

  // --- Decline a pending offer ("Nahi" after a checklist offer) —
  //     graceful, clears the offer, never a financial cancel.
  if (intent === 'decline_offer') {
    return done({
      text: lang === 'en'
        ? 'No problem — let me know whenever you want the checklist.'
        : 'Theek hai — koi baat nahi. Jab checklist chahiye ho to bata dena.',
      newCtx: { ...baseCtx, lastTopic: 'plan', pendingOffer: undefined, pendingQuestion: undefined },
    });
  }

  // --- App-change request (UPDATE 22): show the proposed spec and ask
  //     for confirmation. NEVER claim it is built, and never deflect
  //     to a CSC/UIDAI portal — a BizKhata module tracks the shop's
  //     own work; it does not submit anything anywhere.
  if (intent === 'app_change') {
    const spec = buildAppChangeSpec(message, lang);
    return done({
      text: appChangeSpecText(spec, lang),
      kind: 'text',
      links: [{ label: 'Open Module Requests', path: '/module-requests' }],
      newCtx: { ...baseCtx, lastTopic: 'app_change', pendingOffer: { kind: 'app_change', topic: spec.name.toLowerCase().replace(/\s+/g, '_'), when: 'aaj', spec, requestedAs: message } },
    });
  }

  // --- Follow-up: bare number answering the pending question ("5" =
  //     5 PAN applications). Build the checklist FOR that count.
  if (intent === 'followup_count' && ctx.pendingQuestion) {
    const q = ctx.pendingQuestion;
    const n = bareNumber(message);
    const count = n === null ? q.answeredValue : n;
    const whenLabel = q.topic === 'pan' ? 'kal' : 'aaj';
    const c = buildChecklist(q.topic, lang, whenLabel, count);
    saveChecklist(profile.id, c);
    const v = verifiedChecklist(profile.id, c, lang);
    const active: ActiveChecklist = { id: c.id, topic: q.topic, when: whenLabel, lang, count, customItems: [] };
    const head = lang === 'en'
      ? `Got it — ${count} ${q.service || q.topic} ${q.label}. Here is the checklist for ${count}:`
      : `Theek hai — ${count} ${q.service || q.topic} ${q.label}. ${count} ke liye checklist ye rahi:`;
    return done({
      text: `${head}\n${v.text}`,
      kind: 'checklist',
      checklist: c,
      newCtx: { ...baseCtx, lastTopic: 'checklist', activeChecklist: v.ok ? active : undefined, pendingQuestion: { ...q, answeredValue: count } },
    });
  }

  // --- Follow-up: correction ("Nahi, 3 the, 5 nahi") — replace the
  //     stored value, acknowledge it, and update the checklist. The old
  //     value comes from the pending question OR the active checklist
  //     (after a topic switch the question is gone but the checklist
  //     still remembers the count).
  if (intent === 'followup_correct' && (ctx.pendingQuestion || ctx.activeChecklist?.count !== undefined)) {
    const q = ctx.pendingQuestion;
    const n = correctedNumber(message, ctx);
    if (n === null) {
      return done({ text: lang === 'en' ? 'Sorry — how many should it be? Just tell me the number.' : 'Sorry — kitne hone chahiye? Bas number bata do.', newCtx: { ...baseCtx, lastTopic: 'plan' } });
    }
    const active = ctx.activeChecklist;
    const topic = q?.topic || active?.topic;
    const oldVal = q?.answeredValue ?? active?.count;
    let tail = '';
    if (active && active.topic === topic) {
      const c = buildChecklist(active.topic, lang, active.when, n);
      c.id = active.id;
      updateChecklist(profile.id, c);
      let corrOk = false;
      try { corrOk = listChecklists(profile.id).some((x) => x.id === c.id); } catch { corrOk = false; }
      tail = `\n${checklistText(c, lang)}${corrOk ? '' : (lang === 'en' ? '\n\nBut the updated checklist could not be saved — please try again.' : '\n\nLekin updated checklist save nahi ho payi — dobara try karo.')}`;
    }
    const head = lang === 'en'
      ? `Theek hai — corrected to ${n} (not ${oldVal}). Checklist updated.`
      : `Theek hai — ${n} kar diya ( ${oldVal} nahi). Checklist update kar di hai.`;
    return done({
      text: `${head}${tail}`,
      kind: active && active.topic === topic ? 'checklist' : 'text',
      newCtx: { ...baseCtx, lastTopic: 'checklist', activeChecklist: active ? { ...active, count: n } : active, pendingQuestion: q ? { ...q, answeredValue: n } : undefined },
    });
  }

  // --- Follow-up: preview correction ("Nahi, 250 the" after a
  //     financial preview) — rebuild the SAME preview with the
  //     corrected amount. Still unsaved: the user confirms the
  //     corrected preview as usual. Single-entry previews only; a
  //     multi-entry preview asks which entry to change.
  if (intent === 'followup_correct' && ctx.pendingAction?.kind === 'daily_income') {
    const n = correctedNumber(message, ctx);
    const entries = ctx.pendingAction.entries;
    if (n === null || entries.length !== 1) {
      return done({ text: lang === 'en' ? 'Sorry — which amount should it be? Tell me the amount and the service (like "Xerox 250").' : 'Sorry — kitna hona chahiye? Amount aur service bata do (jaise "Xerox 250").', newCtx: { ...baseCtx, lastTopic: 'action', pendingAction: ctx.pendingAction } });
    }
    const e = entries[0];
    const action: AssistantAction = { ...ctx.pendingAction, entries: [{ ...e, amountPaise: n * 100 }] };
    return done({
      text: replyIn(lang, 'confirmPrompt'),
      kind: 'action',
      action,
      previewLines: [`${e.service} ${formatINR(n * 100)} (${(e.method || 'cash').toUpperCase()})`],
      totalPaise: n * 100,
      newCtx: { ...baseCtx, lastTopic: 'action', lastService: e.service, pendingAction: action },
    });
  }

  // --- Checklist edit ("Isme documents bhi add karo") — append items
  //     to the ACTIVE checklist and save the updated list.
  if (intent === 'checklist_edit' && ctx.activeChecklist) {
    const active = ctx.activeChecklist;
    const item = editItemText(message);
    const added = item ? [item] : checklistDocItems(active.topic, active.lang);
    const next: ActiveChecklist = { ...active, customItems: [...active.customItems, ...added] };
    const c = buildChecklist(active.topic, active.lang, active.when, active.count);
    c.id = active.id;
    c.items = [...checklistItemsFor(active.topic, active.lang), ...next.customItems];
    c.title = buildChecklist(active.topic, active.lang, active.when, active.count).title;
    updateChecklist(profile.id, c);
    let editOk = false;
    try { editOk = listChecklists(profile.id).some((x) => x.id === c.id && x.items.length === c.items.length); } catch { editOk = false; }
    const head = lang === 'en' ? 'Added to the checklist:' : 'Checklist mein add kar diya:';
    const failNote = editOk ? '' : (lang === 'en' ? '\n\nBut the updated list could not be saved — please try again.' : '\n\nLekin updated list save nahi ho payi — dobara try karo.');
    return done({
      text: `${head}\n${checklistText(c, lang)}${failNote}`,
      kind: 'checklist',
      checklist: c,
      newCtx: { ...baseCtx, lastTopic: 'checklist', activeChecklist: editOk ? next : active },
    });
  }

  // --- Checklist translate ("Aur English mein likho") — re-render the
  //     SAME checklist in the asked language; base items translate via
  //     the topic table, the user's own additions stay verbatim.
  if (intent === 'checklist_translate' && ctx.activeChecklist) {
    const active = ctx.activeChecklist;
    const target = targetLangFor(message) || 'en';
    const c = buildChecklist(active.topic, target, active.when, active.count);
    c.id = active.id;
    c.items = [...checklistItemsFor(active.topic, target), ...active.customItems];
    updateChecklist(profile.id, c);
    let convOk = false;
    try { convOk = listChecklists(profile.id).some((x) => x.id === c.id); } catch { convOk = false; }
    const next: ActiveChecklist = { ...active, lang: convOk ? target : active.lang };
    const failNote = convOk ? '' : (lang === 'en' ? '\n\nBut the converted list could not be saved — please try again.' : '\n\nLekin converted list save nahi ho payi — dobara try karo.');
    return done({
      text: `${checklistText(c, target)}${failNote}`,
      kind: 'checklist',
      checklist: c,
      newCtx: { ...baseCtx, lastTopic: 'checklist', activeChecklist: next },
    });
  }

  // --- Checklist show ("PAN wali checklist phir dikhao") — re-render
  //     the active checklist from context, even after a topic switch.
  if (intent === 'checklist_show' && ctx.activeChecklist) {
    const active = ctx.activeChecklist;
    const c = buildChecklist(active.topic, active.lang, active.when, active.count);
    c.id = active.id;
    c.items = [...checklistItemsFor(active.topic, active.lang), ...active.customItems];
    return done({
      text: checklistText(c, active.lang),
      kind: 'checklist',
      checklist: c,
      newCtx: { ...baseCtx, lastTopic: 'checklist' },
    });
  }

  // --- Topic follow-up ("Documents bhi batao") — answer about the
  //     current topic from context, without the service word.
  if (intent === 'topic_followup') {
    const topic = currentTopic(ctx) || 'pan';
    const docs = /documents?|dastavej|kagaz|kagaj/.test(message.toLowerCase()) ? serviceDocuments(topic, lang) : null;
    if (docs) {
      const servicePath = topic === 'pan' ? '/services/pan-card' : topic === 'aadhaar' ? '/services/aadhaar' : topic === 'voter' ? '/services/voter-id' : topic === 'ayushman' ? '/services/ayushman' : '/services';
      return done({ text: docs, links: [{ label: `Open ${topic === 'pan' ? 'PAN Card' : topic}`, path: servicePath }], newCtx: { ...baseCtx, lastTopic: 'plan' } });
    }
    const g = answerGeneral(`${topic} ${message}`, lang, message);
    if (g) return done({ text: g.text, newCtx: { ...baseCtx, lastTopic: 'plan' } });
    return done({ text: replyIn(lang, 'notUnderstood'), cloudNeeded: true, newCtx: { ...baseCtx, lastTopic: 'plan' } });
  }

  // --- Summary / report (UPDATE 16: generate the REAL summary). ---
  if (intent === 'do_summary') {
    const know = computeKnowledge(state, profile, message, ctx);
    // A "no records" knowledge answer is not a summary: quote the real
    // ledger figures (₹0.00 on an empty store) instead.
    if (know && !/koi record nahi|no record/i.test(know.text)) {
      return done({ text: know.text, kind: 'summary', table: know.table, links: know.links, newCtx: { ...baseCtx, ...know.context, lastTopic: 'daily' } });
    }
    const facts = computeFacts(state, profile);
    const local = answerLocally(message, facts, opts.preferredLang || 'auto');
    return done({ text: local.text, kind: 'summary', links: [{ label: 'View Daily Business', path: '/daily-business' }], newCtx: { ...baseCtx, lastTopic: 'daily' } });
  }

  // --- Casual conversation (varied local replies, no records talk). ---
  if (intent === 'casual') {
    return done({ text: answerCasualFor(message, lang), newCtx: { ...baseCtx, lastTopic: 'casual' } });
  }

  // --- Plan / statement (UPDATE 15: acknowledge, never ask for money). ---
  if (intent === 'plan') {
    const st = answerStatement(message, lang);
    if (st) {
      // A statement is a new topic — it does not accept the old offer.
      return done({ text: st.text, newCtx: { ...baseCtx, userFacts: userFacts(ctx, st.newFact), lastTopic: 'statement', pendingOffer: undefined } });
    }
    const plan = answerPlan(message, lang, profile.services);
    return done({
      text: plan.text,
      checklist: plan.checklist,
      newCtx: { ...baseCtx, lastTopic: 'plan', pendingOffer: plan.pendingOffer, pendingQuestion: plan.pendingQuestion },
    });
  }

  // --- Financial action (structured parser only; preview + confirm in UI). ---
  if (intent === 'business_action') {
    const parsed = parseAssistantMessage(message, state, profile, ctx);
    if (parsed.kind === 'action') {
      // UPDATE 25 (C-1): a follow-up amount ("Aur 200 UPI" after a
      // ₹300 cash preview) APPENDS to the pending preview instead of
      // replacing it — "Aaj Xerox ke 300 cash hue" → "Aur 200 UPI" →
      // "Ha" must save BOTH entries. Only daily_income merges, and
      // only when the message is a follow-up amount (starts with
      // aur/bhi/... or carries aur/bhi with a pending preview). The
      // chat UI only passes ctx.pendingAction while a preview is
      // actually pending (after Confirm/Cancel it passes none), so a
      // follow-up after a SAVED entry starts a fresh preview.
      let finalAction = parsed.action;
      let finalLines = parsed.previewLines;
      let finalTotal = parsed.totalPaise;
      let finalDup = parsed.duplicateWarning;
      const prev = ctx.pendingAction;
      const isFollowupAmount = /^(aur|or|also|bhi|add|phir)\b/i.test(message.trim())
        || /\b(aur|bhi)\b/i.test(message);
      if (prev?.kind === 'daily_income' && parsed.action.kind === 'daily_income' && isFollowupAmount) {
        const mergedEntries = [...prev.entries, ...parsed.action.entries];
        finalAction = { ...parsed.action, date: prev.date, entries: mergedEntries };
        finalLines = [
          ...prev.entries.map((e) => entryPreviewLine(e, prev.date, todayISO())),
          ...parsed.previewLines,
        ];
        finalTotal = mergedEntries.reduce((a, e) => a + e.amountPaise, 0);
        finalDup = findDuplicateWarning(state, profile.id, finalAction) || parsed.duplicateWarning;
      }
      // Record the service NOW (at preview time), so the next message
      // ("Aur 200 UPI") resolves as a follow-up on the same service —
      // waiting for confirmation would lose it (UPDATE 21 §5). Also
      // keep the whole previewed action, so a correction ("Nahi, 250
      // the") can rebuild the preview instead of starting over.
      const svc = finalAction.kind === 'daily_income' ? finalAction.entries[0]?.service
        : finalAction.kind === 'refund' ? finalAction.service
        : undefined;
      return done({
        text: replyIn(lang, 'confirmPrompt'),
        kind: 'action',
        action: finalAction,
        previewLines: finalLines,
        totalPaise: finalTotal,
        duplicateWarning: finalDup,
        newCtx: { ...baseCtx, lastTopic: 'action', lastService: svc || ctx.lastService, pendingAction: finalAction },
      });
    }
    if (parsed.kind === 'draft') {
      const pendingService = (parsed.draft.partial as Record<string, unknown>).pendingService as string | undefined;
      return done({ text: parsed.draft.question, draftQuestion: parsed.draft.question, draft: parsed.draft, newCtx: { ...baseCtx, lastTopic: 'action', lastService: pendingService || ctx.lastService } });
    }
    if (parsed.kind === 'error') {
      return done({ text: parsed.text, newCtx: { ...baseCtx, lastTopic: 'action' } });
    }
    // Parser says "question" — fall through to business Q&A below.
  }

  // --- App help. ---
  if (intent === 'app_help') {
    const know = computeKnowledge(state, profile, message, ctx);
    if (know) {
      return done({ text: know.text, links: know.links, table: know.table, navigateTo: know.navigateTo, newCtx: { ...baseCtx, ...know.context } });
    }
  }

  // --- Business-data question (figures only from the real ledgers). ---
  if (intent === 'business_query' || intent === 'business_action') {
    const know = computeKnowledge(state, profile, message, ctx);
    // A "no records" knowledge answer is NOT a figure answer: a total /
    // profit question on an empty store must quote the real figure
    // (₹0.00), so fall through to the factual responder instead.
    const asksFigure = /(profit|hisab|hisaab|total|summary|dhandha|dhanda|dhandho|dhande|dhadhe|kitna|kitne|balance|kamai)/.test(message.toLowerCase());
    if (know && !(asksFigure && /koi record nahi|no record/i.test(know.text))) {
      return done({ text: know.text, links: know.links, table: know.table, navigateTo: know.navigateTo, newCtx: { ...baseCtx, ...know.context } });
    }
    const facts = computeFacts(state, profile);
    const local = answerLocally(message, facts, opts.preferredLang || 'auto');
    return done({ text: local.text, newCtx: { ...baseCtx, lastTopic: local.intent } });
  }

  // --- General knowledge / everyday help (local engine only). ---
  if (intent === 'general' || intent === 'unknown') {
    // UPDATE 23 — contradiction guard (local): a question about what
    // was just saved is answered from the verified save + the REAL
    // store, never from the general engine (which knows nothing about
    // saves and would invent "no records"). Only questions about a
    // PAST save ("Maine kya save kiya tha?", "Entry save hui thi?")
    // trigger this — "How to save money?" is general advice and
    // must NOT land here.
    if (/save\s+(hua|hui|ki|kiya|tha|thi|kari|kar\s*di)|kya.*save|maine.*save|tumne.*save|सेव\s*(हुई|हुआ|की)/i.test(message)) {
      const saved = ctx.lastSavedEntry;
      if (saved) {
        const stillThere = findAssistantTargetById(state, profile.id, saved.kind, saved.id);
        const inRecycle = state.recycle.some((r) => {
          try {
            const d = JSON.parse(r.data) as { id?: string };
            return !!d && d.id === saved.id;
          } catch { return false; }
        });
        if (stillThere) {
          return done({
            text: lang === 'en'
              ? `Yes — it was saved and verified: ${saved.label} (${saved.date}). You can see it in Daily Business.`
              : `Haan — ${saved.label} save hui thi aur verify bhi ho gayi thi (${saved.date}). Daily Business mein dikh rahi hai.`,
            newCtx: { ...baseCtx, lastTopic: 'action' },
          });
        }
        if (inRecycle) {
          return done({
            text: lang === 'en'
              ? `${saved.label} was saved, but it has since been deleted and moved to the Recycle Bin — you can restore it from there.`
              : `${saved.label} save hui thi, lekin ab use delete karke Recycle Bin mein bhej diya gaya hai — wahan se restore ho sakti hai.`,
            newCtx: { ...baseCtx, lastTopic: 'action' },
          });
        }
        return done({
          text: lang === 'en'
            ? `${saved.label} was saved and verified, but it is not in the records now — please check the Recycle Bin.`
            : `${saved.label} save hui thi aur verify bhi ho gayi thi, lekin ab records mein nahi dikh rahi — Recycle Bin mein check karo.`,
          newCtx: { ...baseCtx, lastTopic: 'action' },
        });
      }
      return done({
        text: lang === 'en'
          ? 'No entry has been saved in this chat yet — nothing was saved, so there is nothing to delete.'
          : 'Is chat mein abhi koi entry save nahi hui hai — kuch save nahi hua, isliye delete karne ko kuch nahi hai.',
        newCtx: { ...baseCtx, lastTopic: 'action' },
      });
    }
    const g = answerGeneral(message, lang, message);
    if (g) {
      // Live info: local honesty stands; cloud may do better if configured.
      return done({ text: g.text, cloudNeeded: g.needsLive ? true : undefined, newCtx: { ...baseCtx, lastTopic: 'general' } });
    }
    // Local engine cannot genuinely answer this. Honest limitation
    // (first time per conversation) + ask to rephrase — NEVER an
    // unrelated business question. The UI may try the configured AI
    // service instead (cloudNeeded).
    const firstTime = !ctx.keyNoticeShown;
    const notice = firstTime ? replyIn(lang, 'aiKeyNeeded') : '';
    const text = firstTime
      ? `${replyIn(lang, 'notUnderstood')}\n\n${notice}`
      : replyIn(lang, 'notUnderstood');
    return done({
      text,
      cloudNeeded: true,
      keyNoticeShown: firstTime,
      newCtx: { ...baseCtx, keyNoticeShown: true, lastTopic: 'general' },
    });
  }

  // Fallback (should not happen): honest, no invented question.
  return done({ text: replyIn(lang, 'notUnderstood'), cloudNeeded: true, newCtx: { ...baseCtx, keyNoticeShown: true, lastTopic: 'general' } });
}

/** Human language name for the system prompt / UI. */
export function langName(code: AiLangCode): string {
  return LANG_BY_CODE[code]?.name || 'Hinglish';
}

export type { AssistantAction };
export { applyAssistantAction };
