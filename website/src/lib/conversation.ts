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
import { answerLocally, computeFacts, parseAssistantMessage, type ParsedMessage } from './chatbot';
import { applyAssistantAction, type AssistantAction } from './assistant';
import { answerGeneral, buildChecklist, checklistText, checklistTopicFor, saveChecklist, type Checklist } from './general';
import {
  answerCasualFor, answerPlan, answerStatement, classifyIntent, detectLanguageSwitch,
  type UnifiedIntent,
} from './intent';
import { computeKnowledge, navigationRequest, type ChatContext, type KnowledgeTable } from './knowledge';
import { detectLanguage, LANG_BY_CODE, replyIn, type AiLangCode } from './languages';
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

export function respondToMessage(opts: {
  message: string;
  state: AppState;
  profile: BusinessProfile;
  ctx?: ChatContext;
  preferredLang?: AiLangCode | 'auto' | null;
}): ConversationResult {
  const { message, state, profile } = opts;
  const ctx: ChatContext = opts.ctx || {};
  const lang: AiLangCode = opts.preferredLang && opts.preferredLang !== 'auto'
    ? opts.preferredLang
    : detectLanguage(message).code;
  const baseCtx: ChatContext = { ...ctx, lastLanguage: lang };
  const intent = classifyIntent(message, ctx, profile.services);
  baseCtx.lastIntent = intent;
  const done = (r: Partial<ConversationResult> & { text: string; newCtx?: ChatContext }): ConversationResult => {
    const { newCtx, ...rest } = r;
    return { intent, kind: 'text', ...rest, newCtx: newCtx || baseCtx };
  };

  // --- Language switch (UPDATE 16: do it, don't just talk about it). ---
  if (intent === 'language_switch') {
    const code = detectLanguageSwitch(message)!;
    const text = LANG_SWITCH_REPLY[code] || LANG_SWITCH_REPLY.en;
    return done({ text, kind: 'text', languageChanged: code, newCtx: { ...baseCtx, lastTopic: 'language' } });
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
    const topic = checklistTopicFor(message);
    const whenLabel = /parso/.test(message.toLowerCase()) ? 'parso' : /kal/.test(message.toLowerCase()) ? 'kal' : 'aaj';
    const c = buildChecklist(topic, lang, whenLabel);
    saveChecklist(profile.id, c);
    return done({ text: checklistText(c, lang), kind: 'checklist', checklist: c, newCtx: { ...baseCtx, lastTopic: 'checklist' } });
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
      return done({ text: st.text, newCtx: { ...baseCtx, userFacts: userFacts(ctx, st.newFact), lastTopic: 'statement' } });
    }
    const plan = answerPlan(message, lang, profile.services);
    return done({
      text: plan.text,
      checklist: plan.checklist,
      newCtx: { ...baseCtx, lastTopic: 'plan' },
    });
  }

  // --- Financial action (structured parser only; preview + confirm in UI). ---
  if (intent === 'business_action') {
    const parsed = parseAssistantMessage(message, state, profile, ctx);
    if (parsed.kind === 'action') {
      return done({
        text: replyIn(lang, 'confirmPrompt'),
        kind: 'action',
        action: parsed.action,
        previewLines: parsed.previewLines,
        totalPaise: parsed.totalPaise,
        duplicateWarning: parsed.duplicateWarning,
        newCtx: { ...baseCtx, lastTopic: 'action' },
      });
    }
    if (parsed.kind === 'draft') {
      return done({ text: parsed.draft.question, draftQuestion: parsed.draft.question, draft: parsed.draft, newCtx: { ...baseCtx, lastTopic: 'action' } });
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
    const asksFigure = /(profit|hisab|total|summary|dhandha|kitna|kitne|balance|kamai)/.test(message.toLowerCase());
    if (know && !(asksFigure && /koi record nahi|no record/i.test(know.text))) {
      return done({ text: know.text, links: know.links, table: know.table, navigateTo: know.navigateTo, newCtx: { ...baseCtx, ...know.context } });
    }
    const facts = computeFacts(state, profile);
    const local = answerLocally(message, facts, opts.preferredLang || 'auto');
    return done({ text: local.text, newCtx: { ...baseCtx, lastTopic: local.intent } });
  }

  // --- General knowledge / everyday help (local engine only). ---
  if (intent === 'general' || intent === 'unknown') {
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
