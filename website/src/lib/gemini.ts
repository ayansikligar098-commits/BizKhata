/**
 * Gemini AI insight (free tier only).
 * OFF by default. The owner adds his own free Gemini API key in Settings;
 * without a key the app works fully and shows a clear "AI off" message.
 * No key is ever invented or embedded. Calls go to Google's free-tier
 * endpoint (generativelanguage.googleapis.com) directly from the browser.
 */
import type { AppState } from './types';

export function geminiEnabled(state: AppState): boolean {
  const p = state.profiles.find((x) => x.id === state.activeProfileId);
  return Boolean(p?.geminiKey && p.geminiKey.trim().length > 0);
}

export interface InsightInput {
  incomePaise: number;
  expensePaise: number;
  profitPaise: number;
  customerDuePaise: number;
  agentPayablePaise: number;
  mtCommissionPaise: number;
  topServices: { service: string; receivedPaise: number }[];
}

/** Ask Gemini for a short business insight. Returns a message or an error. */
export async function getGeminiInsight(
  apiKey: string,
  input: InsightInput,
): Promise<{ ok: boolean; text: string }> {
  const prompt = [
    'You are a helpful assistant for a small Indian shop owner using the BizKhata accounting app.',
    'Give 3-4 short, simple, practical tips in plain English based on these numbers (amounts are in paise, 100 paise = 1 rupee).',
    `Income received: ${input.incomePaise} paise. Expenses: ${input.expensePaise} paise. Net profit: ${input.profitPaise} paise.`,
    `Customer due (money to collect): ${input.customerDuePaise} paise. Agent payable: ${input.agentPayablePaise} paise.`,
    `Money Transfer commission earned: ${input.mtCommissionPaise} paise.`,
    `Top services by money received: ${input.topServices.map((s) => `${s.service} ${s.receivedPaise}`).join(', ') || 'none yet'}.`,
    'Keep it short and simple. No invented numbers.',
  ].join('\n');
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    if (!res.ok) return { ok: false, text: `Gemini request failed (HTTP ${res.status}). Check the key or quota — the app works fine without AI.` };
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
    return { ok: true, text: text.trim() || 'Gemini returned an empty answer.' };
  } catch (e) {
    return { ok: false, text: `Could not reach Gemini: ${e instanceof Error ? e.message : 'network error'}. The app works fine without AI.` };
  }
}
