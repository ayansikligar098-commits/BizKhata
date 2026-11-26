/**
 * BizKhata conversational-AI client — UPDATE 15.
 *
 * Provider-neutral: the assistant can call a conversational-AI
 * service the OWNER configures in Settings. No provider name, model
 * name or key text ever appears in the UI, in strings, in errors or
 * in logs. The configuration is generic — an endpoint + a key — and
 * the key is stored ONLY in the browser's local storage under a
 * dedicated key, never in the business profile, never in backups or
 * exports, never sent anywhere except to the configured endpoint.
 *
 * Static-export reality: this website has no backend server, so the
 * call goes directly from the owner's device to the endpoint they
 * configured. If no service is configured, the assistant says so
 * honestly in plain language (conversation.ts) and the local engine
 * (general.ts / intent.ts) handles only what it can genuinely handle.
 * A local template fallback is NEVER the main conversation engine.
 *
 * The AI service NEVER performs financial actions and NEVER receives
 * the whole database: it only gets the conversation history, the
 * business context (profile name, CSC centre, services) and a short
 * facts summary the app already computed from the real ledgers.
 * Financial actions are proposed by the structured parser and go
 * through preview → confirm → backend flow (assistant.ts).
 */
import type { AiLangCode } from './languages';

/** Local-storage keys (browser only; never part of the app state). */
const KEY_STORAGE = 'bizkhata.ai.service.key.v1';
const ENDPOINT_STORAGE = 'bizkhata.ai.service.endpoint.v1';

/** In-memory fallback for tests / non-browser runtimes. */
const mem = new Map<string, string>();

function lsGet(k: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage.getItem(k);
  } catch { /* ignore */ }
  return mem.get(k) ?? null;
}
function lsSet(k: string, v: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) { window.localStorage.setItem(k, v); return; }
  } catch { /* ignore */ }
  mem.set(k, v);
}
function lsDel(k: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) { window.localStorage.removeItem(k); return; }
  } catch { /* ignore */ }
  mem.delete(k);
}

/** The owner-configured AI service key (generic, unnamed). Empty = not configured. */
export function getAiServiceKey(): string {
  return (lsGet(KEY_STORAGE) || '').trim();
}
export function hasAiServiceKey(): boolean {
  return getAiServiceKey().length > 0;
}
export function setAiServiceKey(key: string): void {
  const v = (key || '').trim();
  if (v) lsSet(KEY_STORAGE, v);
  else lsDel(KEY_STORAGE);
}
export function clearAiServiceKey(): void {
  lsDel(KEY_STORAGE);
}
/** Configured endpoint (generic chat endpoint). Empty = use the built-in default path (none — no call is made without an endpoint + key). */
export function getAiServiceEndpoint(): string {
  return (lsGet(ENDPOINT_STORAGE) || '').trim();
}
export function setAiServiceEndpoint(url: string): void {
  const v = (url || '').trim();
  if (v) lsSet(ENDPOINT_STORAGE, v);
  else lsDel(ENDPOINT_STORAGE);
}

export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * System prompt carried with every conversational-AI call. It fixes
 * the assistant's behaviour: reply in the user's language/style,
 * never invent figures, never perform financial actions itself,
 * never mention any provider/model/key, and say plainly when it does
 * not know something.
 */
export function buildSystemPrompt(opts: {
  lang: AiLangCode;
  langName: string;
  profileName: string;
  category: string;
  services: string[];
  factsSummary: string;
}): string {
  return [
    'You are the BizKhata AI Assistant, a helpful personal + business assistant for a small shop owner in India.',
    `The owner runs "${opts.profileName}" (${opts.category}). Services offered: ${opts.services.join(', ')}.`,
    `Reply in the user's own language and style. Detected language code: ${opts.lang} (${opts.langName}). If the user writes in Hinglish (Roman Hindi), reply in Hinglish. If they write in Gujarati (native or Roman), reply in Gujarati. Match their language exactly — never mix languages randomly.`,
    'Understand the user actual intention first: casual chat, a statement, a plan, a question, a request, or a financial action. A plan or statement (for example "I have to make PAN cards tomorrow") is NOT a financial action — acknowledge it, discuss it, offer relevant help such as a checklist. NEVER ask "how much money?" for a message that contains no amount and no money question.',
    'You do NOT perform financial actions. If the user wants to record income, an expense, a payment or a correction, say what you understood and that the app will show a preview for confirmation — do not claim anything is saved.',
    'Figures: use ONLY the ledger facts below. If a figure is not in the facts, say you do not have that record — never invent numbers, customers, or transactions.',
    'If you do not know something (especially live/current information such as news, rates or scores), say so plainly instead of guessing.',
    'Keep replies natural, short and useful. Ask a follow-up question only when it is genuinely needed.',
    'Never mention any AI provider, model name, credential, or technical detail.',
    `Ledger facts (real records only, 100 paise = 1 rupee):\n${opts.factsSummary}`,
  ].join('\n');
}

export interface AiCallResult {
  ok: boolean;
  /** Generated reply text (when ok). */
  text?: string;
  /** Short, non-technical failure reason (never shown raw to the user). */
  reason?: string;
}

/**
 * Call the owner-configured conversational-AI service with a generic
 * chat request. Returns { ok: false } on any failure — the caller
 * falls back to the local engine and never shows a technical error.
 * A timeout of 10s keeps the chat responsive; the key is sent only
 * as a bearer header to the configured endpoint.
 */
export async function callConversationAI(
  messages: AiChatMessage[],
  systemPrompt: string,
  timeoutMs = 10000,
): Promise<AiCallResult> {
  const endpoint = getAiServiceEndpoint();
  const key = getAiServiceKey();
  if (!endpoint || !key) return { ok: false, reason: 'not-configured' };
  if (typeof fetch === 'undefined') return { ok: false, reason: 'unavailable' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: `http-${res.status}` };
    const data = await res.json() as { choices?: { message?: { content?: string } }[]; reply?: string; text?: string };
    const text =
      data?.choices?.[0]?.message?.content?.trim()
      || (typeof data?.reply === 'string' ? data.reply.trim() : '')
      || (typeof data?.text === 'string' ? data.text.trim() : '');
    if (!text) return { ok: false, reason: 'empty' };
    return { ok: true, text };
  } catch {
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timer);
  }
}
