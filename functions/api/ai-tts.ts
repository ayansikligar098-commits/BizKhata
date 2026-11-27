/**
 * BizKhata AI voice — Cloudflare Pages Function (free tier).
 *
 * PLACEMENT — same rule as functions/api/ai-chat.ts: this file MUST
 * live at the repo root, `functions/api/ai-tts.ts`. The Cloudflare
 * Pages project "bizkhata" builds from the repo root and only deploys
 * Functions from the project root's `functions/` directory. Do NOT
 * move it under website/.
 *
 * POST /api/ai-tts
 *   Body: { key, text, voice }
 *   (key = the owner's own saved key from their device, sent in the
 *   POST body — never in a URL; text = the short reply to speak;
 *   voice = a prebuilt voice name such as "Kore".)
 *
 * Relays ONE speech request to the documented Interactions API and
 * returns { ok: true, audio: "<base64 wav>", mime: "audio/wav" }.
 * The Function stores NOTHING: the key is never saved, never logged,
 * and never appears in any error message. No provider name, model
 * name or key appears anywhere in this file or in any response it
 * sends. The model id is sent upstream only.
 *
 * Errors are plain JSON { ok: false, error: "..." } with a short,
 * non-technical message. A rate-limit upstream (429) is reported as
 * error "rate-limited" so the app can stop voice for the day
 * honestly instead of retrying. A request without a key/text is
 * rejected the same way (never a bare 404/500).
 *
 * Free-tier reality: the voice service is rationed (~10 spoken
 * replies/day on the free tier, per community reports — the exact
 * number lives on the owner's AI Studio rate-limit page). The app
 * counts spoken replies on-device and stops at 10; this relay does
 * not keep a server-side count (there is no server state).
 */

export const TTS_MODEL = 'gemini-3.8-flash-lite-tts';
const TTS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const ERROR_MSG = 'The AI voice could not be reached. Please try again later — text chat still works.';
const NO_KEY_MSG = 'No AI chat key is saved. Add the key in Settings → AI Chat to use the AI voice.';

function jsonError(message: string, status = 200): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

interface AiTtsRequest {
  key?: unknown;
  text?: unknown;
  voice?: unknown;
}

/** Walk an Interactions API answer for the base64 audio payload. */
function extractAudio(payload: unknown): { audio: string; mime: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const steps = root.steps;
  if (!Array.isArray(steps)) return null;
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const content = (step as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      const it = item as Record<string, unknown>;
      if (typeof it.data === 'string' && it.data.length > 0) {
        return { audio: it.data, mime: typeof it.mimeType === 'string' ? it.mimeType : 'audio/wav' };
      }
      const inline = it.inlineData as Record<string, unknown> | undefined;
      if (inline && typeof inline.data === 'string' && inline.data.length > 0) {
        return { audio: inline.data, mime: typeof inline.mimeType === 'string' ? inline.mimeType : 'audio/wav' };
      }
    }
  }
  return null;
}

export async function onRequest(context: { request: Request }): Promise<Response> {
  const { request } = context;
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  let body: AiTtsRequest;
  try {
    body = (await request.json()) as AiTtsRequest;
  } catch {
    return jsonError(ERROR_MSG);
  }
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const voice = typeof body.voice === 'string' && body.voice.trim() ? body.voice.trim() : 'Kore';
  if (!key) return jsonError(NO_KEY_MSG);
  if (!text) return jsonError(ERROR_MSG);
  // Short replies only — the app already caps the spoken text; the
  // relay refuses absurd input rather than spending a voice call.
  if (text.length > 2000) return jsonError(ERROR_MSG);

  let upstream: Response;
  try {
    upstream = await fetch(TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: [
          {
            type: 'user_input',
            content: [
              {
                type: 'text',
                text,
                annotations: [
                  { type: 'speech_metadata', style: 'warm, friendly, speaking clearly and naturally' },
                ],
              },
            ],
          },
        ],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice }] },
      }),
    });
  } catch {
    return jsonError(ERROR_MSG);
  }
  if (upstream.status === 429) return jsonError('rate-limited');
  if (!upstream.ok) return jsonError(ERROR_MSG);
  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return jsonError(ERROR_MSG);
  }
  const audio = extractAudio(payload);
  if (!audio) return jsonError(ERROR_MSG);
  return new Response(JSON.stringify({ ok: true, audio: audio.audio, mime: audio.mime }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
