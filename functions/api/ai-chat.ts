/**
 * BizKhata AI chat — Cloudflare Pages Function (free tier).
 *
 * PLACEMENT — READ BEFORE MOVING: this file MUST live at the repo
 * root, `functions/api/ai-chat.ts`. The Cloudflare Pages project
 * "bizkhata" builds from the repo root (`cd website && npm install
 * && npm run build`, output `website/out`), and Pages only deploys
 * Functions from the project root's `functions/` directory. When this
 * file sat at `website/functions/api/ai-chat.ts` it never deployed:
 * POST https://bizkhata.pages.dev/api/ai-chat returned HTTP 405 live
 * (verified 2026-11-27), so the Function path never ran and every
 * cloud call fell back to a direct browser→endpoint call. Moved to
 * the repo root 2026-11-27; do NOT move it back under website/.
 *
 * POST /api/ai-chat
 *   Body: { endpoint, key, messages, systemPrompt }
 *   (endpoint + key come from the owner's own Settings on their device)
 *
 * Generic, provider-neutral SSE proxy: forwards the request to the
 * configured endpoint asking for a streaming response, then relays
 * the SSE stream to the browser. The Function stores NOTHING: the key
 * and endpoint are never saved, never logged, and never appear in any
 * error message. No provider name, model name or key appears anywhere
 * in this file or in any response it sends.
 *
 * Responses are ALWAYS text/event-stream (even errors): an upstream
 * failure is a clean `data: {"error": "..."}` event with a short,
 * plain, non-technical message — no provider name, no HTTP status
 * code, no upstream body. A request without an endpoint/key is
 * rejected the same way (never a bare 404/500).
 *
 * The upstream call includes a `model` field: OpenAI-compatible
 * chat-completions endpoints REQUIRE one — without it the service
 * rejects the call even with a valid key. The model value is sent
 * upstream only; it never appears in any response this Function sends
 * or in the app UI.
 *
 * UPDATE 19 model choice (verified 2026-11-27 against Google's own
 * models page): the previous value is SHUT DOWN (June 1, 2026) and
 * the 2.5 Flash model is deprecated (routes to the 3.5 Flash-Lite
 * model from Dec 1, 2026). `gemini-3.8-flash` is the live Stable Flash
 * model, free-tier. It must match DEFAULT_MODEL in
 * src/lib/conversation-ai.ts and Android's AI_MODEL — the three
 * constants must always agree (tests/streaming.test.mjs checks this).
 * MODELS GET SHUT DOWN: re-check this value against Google's models
 * page periodically.
 *
 * If the upstream endpoint does not stream (answers JSON instead),
 * the reply is converted into a single SSE data event followed by
 * [DONE], so the client always sees one uniform stream.
 */

export const UPSTREAM_MODEL = 'gemini-3.8-flash';

const ERROR_MSG =
  'The AI service could not be reached. Please check the AI Chat settings and try again.';

function sseError(message: string): Response {
  return new Response(`data: ${JSON.stringify({ error: message })}\n\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    },
  });
}

function sseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  };
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AiChatRequest {
  endpoint?: unknown;
  key?: unknown;
  messages?: unknown;
  systemPrompt?: unknown;
}

/** Pull displayable text out of a non-streaming JSON answer. */
function textFromJson(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const o = data as Record<string, unknown>;
  const choices = o.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const c = choices[0] as Record<string, unknown>;
    const msg = c.message as Record<string, unknown> | undefined;
    if (msg && typeof msg.content === 'string') return msg.content;
    if (typeof c.text === 'string') return c.text;
  }
  if (typeof o.reply === 'string') return o.reply;
  if (typeof o.text === 'string') return o.text;
  if (typeof o.content === 'string') return o.content;
  return '';
}

export async function onRequest(context: { request: Request }): Promise<Response> {
  const { request } = context;
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  let body: AiChatRequest;
  try {
    body = (await request.json()) as AiChatRequest;
  } catch {
    return sseError(ERROR_MSG);
  }
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt : '';
  const messages = Array.isArray(body.messages)
    ? (body.messages as ChatMessage[]).filter(
        (m) => m && typeof m === 'object' && typeof m.content === 'string',
      )
    : [];
  if (!endpoint || !key || messages.length === 0) return sseError(ERROR_MSG);
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    return sseError(ERROR_MSG);
  }
  if (endpointUrl.protocol !== 'https:' && endpointUrl.protocol !== 'http:') {
    return sseError(ERROR_MSG);
  }

  let upstream: Response;
  try {
    upstream = await fetch(endpointUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: UPSTREAM_MODEL,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          ...messages,
        ],
        temperature: 0.7,
        stream: true,
      }),
    });
  } catch {
    return sseError(ERROR_MSG);
  }
  if (!upstream.ok || !upstream.body) return sseError(ERROR_MSG);

  const contentType = upstream.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    // Relay the upstream SSE stream untouched (already event-shaped).
    return new Response(upstream.body, { status: 200, headers: sseHeaders() });
  }

  // Non-streaming JSON answer: convert it into one SSE event + [DONE].
  let text = '';
  try {
    text = textFromJson(await upstream.json());
  } catch {
    return sseError(ERROR_MSG);
  }
  if (!text) return sseError(ERROR_MSG);
  const payload =
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n` +
    'data: [DONE]\n\n';
  return new Response(payload, { status: 200, headers: sseHeaders() });
}
