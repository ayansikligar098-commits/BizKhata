'use client';
import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import {
  answerLocally,
  applyDraftAnswer,
  computeFacts,
  findDuplicateWarning,
  parseAssistantMessage,
  type ActionDraft,
} from '@/lib/chatbot';
import { applyAssistantAction, type AssistantAction, type ExecResult } from '@/lib/assistant';
import { computeKnowledge, type ChatContext, type KnowledgeTable } from '@/lib/knowledge';
import { loadState } from '@/lib/store';
import { formatINR } from '@/lib/money';
import { uid } from '@/lib/types';

/**
 * BizKhata AI Assistant — "BizKhata AI Assistant", subtitle
 * "Your Intelligent Business Assistant". No third-party provider name,
 * no key, no technical error ever appears here.
 *
 * The chat is a conversational interface over the real store:
 *  - Questions → scoped knowledge retrieval (knowledge.ts) or the
 *    factual responder (chatbot.ts), both from real ledgers.
 *  - Actions → structured AssistantAction → human-readable preview →
 *    Confirm & Save / Edit / Cancel → backend executor (assistant.ts)
 *    with validation + audit + idempotency → verified result.
 * Chat history is stored per business profile (localStorage) and is
 * NEVER a financial record by itself.
 */

interface PreviewData {
  action: AssistantAction;
  idemKey: string;
  lines: string[];
  totalPaise: number;
  duplicateWarning?: string;
  editing: boolean;
  /** Editable rows (daily income) or single amount/method (other actions). */
  editRows: { service: string; amountRs: string; method: string }[];
  editAmountRs: string;
  editMethod: string;
  cancelled?: boolean;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'bot';
  text: string;
  ts: string;
  preview?: PreviewData;
  result?: { ok: boolean; lines: string[]; verified?: boolean; link?: { label: string; path: string } };
  table?: KnowledgeTable;
  links?: { label: string; path: string }[];
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMsg[];
  ctx: ChatContext;
}

const WELCOME =
  'Namaste! Main aapka BizKhata AI Assistant hoon — Your Intelligent Business Assistant. Aap mujhse apne business ke baare mein kuch bhi pooch sakte ho, ya aise hi bata do kya hua (jaise: "Aaj Xerox ke 300 cash hue"). Main pehle preview dikhaunga, aap confirm karoge, tabhi entry save hogi. Mere jawab aapke real record se aate hain.';

const QUICK_QUESTIONS = [
  'Aaj Xerox ke 300 cash hue',
  'Aaj ka dhandha kitna hua?',
  'Is month Xerox se kitna kamaya?',
  'Sabse zyada due kis customer ka hai?',
  'Agent ko kitna dena hai?',
  'Cash Book kholo',
  'Cash Book mein entry kaise add karu?',
];

function chatKey(profileId: string): string {
  return `bizkhata.chat.v1.${profileId}`;
}

function loadConversations(profileId: string): { conversations: Conversation[]; activeId: string } {
  try {
    const raw = window.localStorage.getItem(chatKey(profileId));
    if (raw) {
      const parsed = JSON.parse(raw) as { conversations: Conversation[]; activeId: string };
      if (Array.isArray(parsed.conversations) && parsed.conversations.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  const first: Conversation = {
    id: uid('chat'),
    title: 'New chat',
    createdAt: new Date().toISOString(),
    messages: [{ id: uid('m'), role: 'bot', text: WELCOME, ts: new Date().toISOString() }],
    ctx: {},
  };
  return { conversations: [first], activeId: first.id };
}

function newConversation(): Conversation {
  return {
    id: uid('chat'),
    title: 'New chat',
    createdAt: new Date().toISOString(),
    messages: [{ id: uid('m'), role: 'bot', text: WELCOME, ts: new Date().toISOString() }],
    ctx: {},
  };
}

function timeStr(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function previewFromAction(action: AssistantAction, lines: string[], totalPaise: number, duplicateWarning?: string): PreviewData {
  const editRows =
    action.kind === 'daily_income'
      ? action.entries.map((e) => ({ service: e.service, amountRs: String(e.amountPaise / 100), method: e.method }))
      : [];
  const singleAmount =
    action.kind === 'expense' ? action.amountPaise
    : action.kind === 'mt_transfer' ? action.amountPaise
    : action.kind === 'agent_payment' ? action.amountPaise
    : action.kind === 'internal_transfer' ? action.amountPaise
    : action.kind === 'customer_payment' ? action.amountPaise
    : action.kind === 'refund' ? action.amountPaise
    : action.kind === 'correct_entry' ? action.newAmountPaise
    : 0;
  const singleMethod =
    action.kind === 'expense' ? action.method
    : action.kind === 'mt_transfer' ? action.method
    : action.kind === 'agent_payment' ? action.method
    : action.kind === 'internal_transfer' ? action.to
    : action.kind === 'customer_payment' ? action.method
    : action.kind === 'refund' ? action.method
    : 'cash';
  return {
    action,
    idemKey: uid('idem'),
    lines,
    totalPaise,
    duplicateWarning,
    editing: false,
    editRows,
    editAmountRs: String(singleAmount / 100),
    editMethod: singleMethod,
  };
}

/** Rebuild an action from edited preview rows (Edit flow). */
function rebuildAction(preview: PreviewData): AssistantAction | null {
  const a = preview.action;
  if (a.kind === 'daily_income') {
    const entries = preview.editRows
      .map((r) => {
        const paise = Math.round(parseFloat(r.amountRs || '0') * 100);
        return { service: r.service, amountPaise: paise, method: (r.method === 'upi' ? 'upi' : r.method === 'other' ? 'other' : 'cash') as 'cash' | 'upi' | 'other' };
      })
      .filter((e) => e.amountPaise > 0 && e.service);
    if (entries.length === 0) return null;
    return { kind: 'daily_income', date: a.date, entries };
  }
  const paise = Math.round(parseFloat(preview.editAmountRs || '0') * 100);
  if (paise <= 0) return null;
  const method = (preview.editMethod === 'upi' ? 'upi' : 'cash') as 'cash' | 'upi';
  if (a.kind === 'expense') return { ...a, amountPaise: paise, method };
  if (a.kind === 'mt_transfer') return { ...a, amountPaise: paise, method };
  if (a.kind === 'agent_payment') return { ...a, amountPaise: paise, method };
  if (a.kind === 'internal_transfer') return { ...a, amountPaise: paise, to: method, from: method === 'cash' ? 'upi' : 'cash' };
  if (a.kind === 'customer_payment') return { ...a, amountPaise: paise, method };
  if (a.kind === 'refund') return { ...a, amountPaise: paise, method };
  if (a.kind === 'correct_entry') return { ...a, newAmountPaise: paise };
  return a;
}

function previewLinesFor(action: AssistantAction): string[] {
  if (action.kind === 'daily_income') {
    return action.entries.map((e) => `${e.service} ${formatINR(e.amountPaise)} ${e.method === 'other' ? '(due — abhi mile nahi)' : `(${e.method.toUpperCase()})`}${e.customerName ? ` — ${e.customerName}` : ''}`);
  }
  if (action.kind === 'expense') return [`Expense: ${action.category} — ${formatINR(action.amountPaise)} (${action.method.toUpperCase()})`, `Service: ${action.service}`];
  if (action.kind === 'mt_transfer') return [`Money Transfer: principal ${formatINR(action.amountPaise)} (${action.method.toUpperCase()}) — principal income NAHI hai.`, `Commission: ${formatINR(action.commissionPaise)} — sirf yehi income hai.`];
  if (action.kind === 'mt_fund') return [`MT Fund received: ${formatINR(action.amountPaise)} (${action.method.toUpperCase()}) — bhai se`];
  if (action.kind === 'agent_payment') return [`Agent payment: ${action.agentName} ko ${formatINR(action.amountPaise)} (${action.method.toUpperCase()})`];
  if (action.kind === 'internal_transfer') return [`Internal transfer: ${formatINR(action.amountPaise)} ${action.from.toUpperCase()} → ${action.to.toUpperCase()} — ₹0 income, ₹0 expense.`];
  if (action.kind === 'customer_payment') return [`Payment received: ${action.customerName} se ${formatINR(action.amountPaise)} (${action.method.toUpperCase()})`];
  if (action.kind === 'customer_add') return [`Add customer: ${action.name}${action.mobile ? ` (${action.mobile})` : ''}`];
  if (action.kind === 'correct_entry') return [`Correct: ${action.label}`, `Naya amount: ${formatINR(action.newAmountPaise)} (pehle ${formatINR(action.oldAmountPaise)})`];
  if (action.kind === 'delete_entry') return [`Delete: ${action.label}`, 'Ye entry Recycle Bin mein jayegi.'];
  return [`Refund: ${formatINR(action.amountPaise)} (${action.method.toUpperCase()}) — reversal, ordinary kharcha nahi.`];
}

function totalFor(action: AssistantAction): number {
  if (action.kind === 'daily_income') return action.entries.reduce((a, e) => a + e.amountPaise, 0);
  if (action.kind === 'expense' || action.kind === 'mt_transfer' || action.kind === 'agent_payment' || action.kind === 'internal_transfer' || action.kind === 'customer_payment' || action.kind === 'refund') return action.amountPaise;
  if (action.kind === 'mt_fund') return action.amountPaise;
  if (action.kind === 'correct_entry') return action.newAmountPaise;
  return 0;
}

function useChat(onNavigateAway?: () => void) {
  const app = useApp();
  const router = useRouter();
  const profileId = app.profile?.id || '';
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeId, setActiveId] = React.useState('');
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const [speakOn, setSpeakOn] = React.useState(false);
  const [historyQuery, setHistoryQuery] = React.useState('');
  const [showHistory, setShowHistory] = React.useState(false);
  const msgsRef = React.useRef<HTMLDivElement>(null);
  const convRef = React.useRef<{ conversations: Conversation[]; activeId: string }>({ conversations: [], activeId: '' });
  const draftRef = React.useRef<ActionDraft | null>(null);
  const pendingRef = React.useRef<{ msgId: string; preview: PreviewData } | null>(null);
  const recogRef = React.useRef<{ stop: () => void } | null>(null);

  const active = conversations.find((c) => c.id === activeId) || conversations[0];
  const messages = active?.messages || [];

  // Load this profile's chat history (never mix profiles).
  React.useEffect(() => {
    if (!profileId) return;
    const loaded = loadConversations(profileId);
    setConversations(loaded.conversations);
    setActiveId(loaded.activeId);
    draftRef.current = null;
    pendingRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  // Persist history + keep the ref in sync for async handlers.
  React.useEffect(() => {
    convRef.current = { conversations, activeId };
    if (profileId && conversations.length > 0) {
      try {
        window.localStorage.setItem(chatKey(profileId), JSON.stringify({ conversations, activeId }));
      } catch { /* ignore */ }
    }
  }, [conversations, activeId, profileId]);

  React.useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  function updateActive(fn: (c: Conversation) => Conversation) {
    setConversations((prev) => prev.map((c) => (c.id === activeId ? fn(c) : c)));
  }

  function pushMsg(msg: ChatMsg) {
    updateActive((c) => {
      const title = c.messages.length <= 1 && msg.role === 'user'
        ? msg.text.slice(0, 40)
        : c.title === 'New chat' && msg.role === 'user' ? msg.text.slice(0, 40) : c.title;
      return { ...c, title, messages: [...c.messages, msg] };
    });
  }

  function updateMsg(id: string, fn: (m: ChatMsg) => ChatMsg) {
    updateActive((c) => ({ ...c, messages: c.messages.map((m) => (m.id === id ? fn(m) : m)) }));
  }

  function speak(text: string) {
    if (!speakOn || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[*#]/g, '').slice(0, 400));
      u.lang = app.profile?.language === 'hi' ? 'hi-IN' : 'en-IN';
      window.speechSynthesis.speak(u);
    } catch { /* voice response is best-effort */ }
  }

  function newChat() {
    const c = newConversation();
    setConversations((prev) => [c, ...prev]);
    setActiveId(c.id);
    draftRef.current = null;
    pendingRef.current = null;
    setShowHistory(false);
  }

  function clearHistory() {
    if (!window.confirm('Saari chat history delete karni hai? Financial records par koi asar nahi padega.')) return;
    const c = newConversation();
    setConversations([c]);
    setActiveId(c.id);
    draftRef.current = null;
    pendingRef.current = null;
    try { window.localStorage.removeItem(chatKey(profileId)); } catch { /* ignore */ }
  }

  /** Verify the backend actually stored the applied records. */
  function verifySaved(appliedIds: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        try {
          const s = loadState();
          const all = [
            ...s.jobs.map((x) => x.id), ...s.dailyEntries.map((x) => x.id),
            ...s.expenses.map((x) => x.id), ...s.cashTxns.map((x) => x.id),
            ...s.mtTransfers.map((x) => x.id), ...s.mtFunds.map((x) => x.id),
            ...s.customers.map((x) => x.id), ...s.recycle.map((x) => x.id),
          ];
          resolve(appliedIds.every((id) => all.includes(id)));
        } catch {
          resolve(false);
        }
      }, 600);
    });
  }

  async function confirmPreview(msgId: string) {
    const pending = pendingRef.current;
    if (!pending || pending.msgId !== msgId || busy) return;
    const preview = pending.preview;
    setBusy(true);
    let result: ExecResult | undefined;
    // Execute ONLY through the backend action layer (never direct writes).
    app.mutate((s) => {
      result = applyAssistantAction(s, app.profile.id, preview.action, preview.idemKey);
    });
    const res = result as ExecResult | undefined;
    pendingRef.current = null;
    if (!res) {
      updateMsg(msgId, (m) => ({ ...m, preview: undefined, result: { ok: false, lines: ['Kuch gadbad hui — entry save nahi hui. Dobara try karo.'] } }));
      setBusy(false);
      return;
    }
    if (res.ok) {
      const verified = await verifySaved(res.appliedIds);
      updateMsg(msgId, (m) => ({
        ...m,
        preview: undefined,
        result: {
          ok: true,
          lines: res.lines,
          verified,
          link: res.link || undefined,
        },
      }));
      // Conversation context: remember the service just saved.
      if (preview.action.kind === 'daily_income' && preview.action.entries.length > 0) {
        updateActive((c) => ({ ...c, ctx: { ...c.ctx, lastService: preview.action.kind === 'daily_income' ? preview.action.entries[0].service : c.ctx.lastService, lastTopic: 'daily_income' } }));
      }
      speak(`${res.summary} ${verified ? 'Save verify ho gaya.' : ''}`);
    } else if (res.duplicate) {
      updateMsg(msgId, (m) => ({ ...m, preview: undefined, result: { ok: false, lines: [res.summary] } }));
    } else {
      updateMsg(msgId, (m) => ({ ...m, preview: undefined, result: { ok: false, lines: [res.summary] } }));
      speak('Entry save nahi hui. ' + res.summary);
    }
    setBusy(false);
  }

  function cancelPreview(msgId: string) {
    if (pendingRef.current?.msgId !== msgId) return;
    pendingRef.current = null;
    draftRef.current = null;
    updateMsg(msgId, (m) => ({ ...m, preview: m.preview ? { ...m.preview, cancelled: true } : undefined }));
    pushMsg({ id: uid('m'), role: 'bot', text: 'Cancelled — kuch bhi save nahi hua.', ts: new Date().toISOString() });
  }

  function applyEdit(msgId: string) {
    // Read the preview from the message itself — the pending ref can be
    // stale after inline edits (the message is the source of truth).
    const conv = convRef.current.conversations.find((c) => c.id === convRef.current.activeId);
    const preview = conv?.messages.find((m) => m.id === msgId)?.preview;
    if (!preview) return;
    const rebuilt = rebuildAction(preview);
    if (!rebuilt) {
      pushMsg({ id: uid('m'), role: 'bot', text: 'Edit mein amount ₹0 se zyada hona chahiye. Preview dobara check karo.', ts: new Date().toISOString() });
      return;
    }
    const lines = previewLinesFor(rebuilt);
    const total = totalFor(rebuilt);
    const dup = findDuplicateWarning(app.state, app.profile.id, rebuilt);
    const next: PreviewData = { ...preview, action: rebuilt, lines, totalPaise: total, duplicateWarning: dup || undefined, editing: false };
    pendingRef.current = { msgId, preview: next };
    updateMsg(msgId, (m) => ({ ...m, preview: next }));
  }

  /** Mark the currently pending preview as superseded by a newer message. */
  function supersedePending() {
    const pending = pendingRef.current;
    if (!pending) return;
    updateMsg(pending.msgId, (m) => (m.preview ? { ...m, preview: { ...m.preview, cancelled: true } } : m));
    pendingRef.current = null;
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    const userMsg: ChatMsg = { id: uid('m'), role: 'user', text: q, ts: new Date().toISOString() };
    pushMsg(userMsg);
    const ctx: ChatContext = (convRef.current.conversations.find((c) => c.id === convRef.current.activeId)?.ctx) || {};
    const state = app.state;
    const profile = app.profile;

    const botReply = (text2: string, extra?: Partial<ChatMsg>) => {
      const msg: ChatMsg = { id: uid('m'), role: 'bot', text: text2, ts: new Date().toISOString(), ...extra };
      pushMsg(msg);
      speak(text2);
      return msg;
    };
    const setCtx = (patch: ChatContext) => {
      updateActive((c) => ({ ...c, ctx: { ...c.ctx, ...patch } }));
    };

    try {
      // 1. Answering a clarification question for an incomplete action.
      if (draftRef.current) {
        const parsed = applyDraftAnswer(draftRef.current, q, state, profile, ctx);
        if (parsed.kind === 'draft') {
          draftRef.current = parsed.draft;
          botReply(parsed.draft.question);
          setBusy(false);
          return;
        }
        draftRef.current = null;
        if (parsed.kind === 'action') {
          supersedePending();
          const preview = previewFromAction(parsed.action, parsed.previewLines, parsed.totalPaise, parsed.duplicateWarning);
          const msg = botReply('Ye entries save karun?', { preview });
          pendingRef.current = { msgId: msg.id, preview };
          setBusy(false);
          return;
        }
        if (parsed.kind === 'error') {
          botReply(parsed.text);
          setBusy(false);
          return;
        }
        // Fell through — parse the message fresh below.
      }

      // 2. Confirm / cancel of a pending preview.
      const parsed0 = parseAssistantMessage(q, state, profile, ctx);
      if (parsed0.kind === 'confirm') {
        if (pendingRef.current) {
          setBusy(false);
          await confirmPreview(pendingRef.current.msgId);
          return;
        }
        botReply('Confirm karne ke liye koi pending entry nahi hai. Pehle koi entry batao (jaise: "Aaj Xerox ke 300 cash hue").');
        setBusy(false);
        return;
      }
      if (parsed0.kind === 'cancel') {
        if (pendingRef.current) {
          cancelPreview(pendingRef.current.msgId);
          setBusy(false);
          return;
        }
        botReply('Cancel karne ke liye koi pending entry nahi hai.');
        setBusy(false);
        return;
      }
      if (parsed0.kind === 'action') {
        supersedePending();
        const preview = previewFromAction(parsed0.action, parsed0.previewLines, parsed0.totalPaise, parsed0.duplicateWarning);
        const msg = botReply('Ye entries save karun? Pehle check karo, phir Confirm dabao.', { preview });
        pendingRef.current = { msgId: msg.id, preview };
        setBusy(false);
        return;
      }
      if (parsed0.kind === 'draft') {
        draftRef.current = parsed0.draft;
        botReply(parsed0.draft.question);
        setBusy(false);
        return;
      }
      if (parsed0.kind === 'error') {
        botReply(parsed0.text);
        setBusy(false);
        return;
      }

      // 3. Knowledge Q&A (business questions, comparisons, analysis,
      //    app help, navigation) — scoped real records only.
      const know = computeKnowledge(state, profile, q, ctx);
      if (know) {
        setCtx(know.context);
        botReply(know.text, { table: know.table, links: know.links });
        if (know.navigateTo) {
          router.push(know.navigateTo);
          if (onNavigateAway) onNavigateAway();
        }
        setBusy(false);
        return;
      }

      // 4. Factual fallback (profit, balance, due, agent, MT, overview).
      const facts = computeFacts(state, profile);
      const local = answerLocally(q, facts);
      botReply(local.text);
      setBusy(false);
    } catch (e) {
      botReply('Sorry, kuch gadbad hui — AI abhi available nahi hai, baad me try karo. Aapka data safe hai, kuch save nahi hua.');
      setBusy(false);
    }
  }

  function toggleMic() {
    if (typeof window === 'undefined') return;
    const SR = (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
    if (!SR) {
      pushMsg({ id: uid('m'), role: 'bot', text: 'Is browser mein voice input support nahi hai. Aap type karke likh sakte ho.', ts: new Date().toISOString() });
      return;
    }
    if (listening && recogRef.current) {
      recogRef.current.stop();
      setListening(false);
      return;
    }
    try {
      const recog = new (SR as new () => {
        lang: string; interimResults: boolean; continuous: boolean;
        onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string; isFinal: boolean } }; length: number } }) => void) | null;
        onerror: ((e: { error: string }) => void) | null;
        onend: (() => void) | null;
        start: () => void; stop: () => void;
      })();
      recog.lang = app.profile?.language === 'hi' ? 'hi-IN' : 'en-IN';
      recog.interimResults = false;
      recog.continuous = false;
      recog.onresult = (e) => {
        const transcript = e.results[e.results.length - 1]?.[0]?.transcript || '';
        if (transcript.trim()) {
          setListening(false);
          void send(transcript.trim());
        }
      };
      recog.onerror = (e) => {
        setListening(false);
        if (e.error !== 'aborted') {
          pushMsg({ id: uid('m'), role: 'bot', text: 'Voice samajh nahi aaya — dobara bolo ya type karke likho.', ts: new Date().toISOString() });
        }
      };
      recog.onend = () => setListening(false);
      recog.start();
      recogRef.current = recog;
      setListening(true);
    } catch {
      pushMsg({ id: uid('m'), role: 'bot', text: 'Voice input start nahi hua — type karke likho.', ts: new Date().toISOString() });
    }
  }

  return {
    messages, input, setInput, busy, send, msgsRef,
    conversations, activeId, setActiveId, newChat, clearHistory,
    historyQuery, setHistoryQuery, showHistory, setShowHistory,
    confirmPreview, cancelPreview, applyEdit, updateMsg,
    listening, toggleMic, speakOn, setSpeakOn,
    profileName: app.profile?.name || '',
  };
}

function PreviewCard({ msg, chat }: { msg: ChatMsg; chat: ReturnType<typeof useChat> }) {
  const p = msg.preview;
  if (!p) return null;
  const app = useApp();
  const services = app.profile?.services || [];
  if (p.cancelled) {
    return <div className="chat-result error">❌ Cancelled — kuch bhi save nahi hua.</div>;
  }
  const setEdit = (fn: (prev: PreviewData) => PreviewData) => {
    chat.updateMsg(msg.id, (m) => (m.preview ? { ...m, preview: fn(m.preview) } : m));
  };
  return (
    <div className="chat-preview" data-testid="ai-preview">
      <div className="chat-preview-title">Transaction Preview — check karo, phir Confirm dabao</div>
      {p.editing ? (
        <div className="chat-edit">
          {p.action.kind === 'daily_income' ? (
            <>
              {p.editRows.map((row, i) => (
                <div key={i} className="chat-edit-row">
                  <select className="input" value={row.service} onChange={(e) => setEdit((prev) => ({ ...prev, editRows: prev.editRows.map((r, j) => (j === i ? { ...r, service: e.target.value } : r)) }))} aria-label="Service">
                    {services.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input className="input" type="number" min="0" step="0.01" value={row.amountRs} onChange={(e) => setEdit((prev) => ({ ...prev, editRows: prev.editRows.map((r, j) => (j === i ? { ...r, amountRs: e.target.value } : r)) }))} aria-label="Amount in rupees" />
                  <select className="input" value={row.method} onChange={(e) => setEdit((prev) => ({ ...prev, editRows: prev.editRows.map((r, j) => (j === i ? { ...r, method: e.target.value } : r)) }))} aria-label="Payment method">
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="other">Udhaar / Due</option>
                  </select>
                  <button className="icon-btn" aria-label="Remove row" onClick={() => setEdit((prev) => ({ ...prev, editRows: prev.editRows.filter((_, j) => j !== i) }))}>✕</button>
                </div>
              ))}
              <button className="chat-link" onClick={() => setEdit((prev) => ({ ...prev, editRows: [...prev.editRows, { service: services[0] || 'Xerox', amountRs: '', method: 'cash' }] }))}>+ Add row</button>
            </>
          ) : (
            <div className="chat-edit-row">
              <input className="input" type="number" min="0" step="0.01" value={p.editAmountRs} onChange={(e) => setEdit((prev) => ({ ...prev, editAmountRs: e.target.value }))} aria-label="Amount in rupees" />
              <select className="input" value={p.editMethod} onChange={(e) => setEdit((prev) => ({ ...prev, editMethod: e.target.value }))} aria-label="Payment method">
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
              </select>
            </div>
          )}
          <div className="chat-preview-btns">
            <button className="btn" onClick={() => chat.applyEdit(msg.id)}>Save Preview</button>
            <button className="btn btn-secondary" onClick={() => setEdit((prev) => ({ ...prev, editing: false }))}>Back</button>
          </div>
        </div>
      ) : (
        <>
          <ul className="chat-preview-list">
            {p.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
          {p.totalPaise > 0 && <div className="chat-preview-total">Total: {formatINR(p.totalPaise)}</div>}
          {p.duplicateWarning && <div className="chat-warn">{p.duplicateWarning}</div>}
          <div className="chat-preview-btns">
            <button className="btn" onClick={() => chat.confirmPreview(msg.id)} disabled={chat.busy} data-testid="ai-confirm">✓ Confirm &amp; Save</button>
            <button className="btn btn-secondary" onClick={() => setEdit((prev) => ({ ...prev, editing: true }))}>✎ Edit</button>
            <button className="btn btn-secondary" onClick={() => chat.cancelPreview(msg.id)} data-testid="ai-cancel">Cancel</button>
          </div>
          <div className="chat-preview-note">Confirm karne par hi entry save hogi — usse pehle kuch save nahi hota.</div>
        </>
      )}
    </div>
  );
}

function ResultCard({ msg }: { msg: ChatMsg }) {
  const r = msg.result;
  if (!r) return null;
  return (
    <div className={`chat-result ${r.ok ? 'ok' : 'error'}`} data-testid={r.ok ? 'ai-saved' : 'ai-error'}>
      <div style={{ fontWeight: 700 }}>{r.ok ? '✓ Saved' : '✕ Not saved'}</div>
      <ul className="chat-preview-list">
        {r.lines.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
      {r.ok && <div className="chat-preview-note">{r.verified ? '✓ Save verify ho gaya — records mein dikh raha hai.' : 'Save ho gaya — verification abhi pending hai, Daily Business mein check kar lo.'}</div>}
    </div>
  );
}

function ChatBody({ chat }: { chat: ReturnType<typeof useChat> }) {
  const router = useRouter();
  return (
    <>
      <div className="chat-msgs" ref={chat.msgsRef}>
        {chat.messages.map((m) => (
          <div key={m.id} className={`chat-msg-wrap ${m.role}`}>
            <div className={`chat-msg ${m.role}`} data-testid={m.role === 'user' ? 'chat-user-msg' : 'chat-bot-msg'}>
              {m.text}
              <span className="chat-time">{timeStr(m.ts)}</span>
            </div>
            {m.preview && <PreviewCard msg={m} chat={chat} />}
            {m.result && <ResultCard msg={m} />}
            {m.table && (
              <div className="chat-table-wrap">
                <table className="chat-table">
                  <thead><tr>{m.table.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                  <tbody>
                    {m.table.rows.map((row, i) => (
                      <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {m.links && m.links.length > 0 && (
              <div className="chat-links">
                {m.links.map((l) => (
                  <button key={l.path} className="chat-link" onClick={() => router.push(l.path)}>{l.label} →</button>
                ))}
              </div>
            )}
            {m.result?.link && (
              <div className="chat-links">
                <button className="chat-link" onClick={() => router.push(m.result!.link!.path)}>{m.result!.link!.label} →</button>
              </div>
            )}
          </div>
        ))}
        {chat.busy && <div className="chat-msg bot">Soch raha hoon…</div>}
      </div>
      <div className="chat-chips">
        {QUICK_QUESTIONS.map((q) => (
          <button key={q} className="chat-chip" onClick={() => chat.send(q)} disabled={chat.busy}>
            {q}
          </button>
        ))}
      </div>
      <div className="chat-input-row">
        <button
          className={`icon-btn chat-mic ${chat.listening ? 'listening' : ''}`}
          onClick={chat.toggleMic}
          aria-label={chat.listening ? 'Stop voice input' : 'Voice input'}
          title="Voice input (Hindi / English / Hinglish)"
        >
          🎙️
        </button>
        <input
          className="input"
          value={chat.input}
          onChange={(e) => chat.setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') chat.send(chat.input); }}
          placeholder="Apna sawal likho ya bolo… (Hinglish / English / Hindi)"
          aria-label="Ask the AI assistant"
          data-testid="chat-input"
        />
        <button className="btn" onClick={() => chat.send(chat.input)} disabled={chat.busy || !chat.input.trim()} data-testid="chat-send">
          Send
        </button>
      </div>
      <div className="chat-note">
        BizKhata AI Assistant • Figures always from your real records — nothing is sent anywhere.
        {chat.listening ? ' • 🎙️ Sun raha hoon…' : ''}
      </div>
    </>
  );
}

/** Overlay chat panel (opened by the floating button). */
export function ChatPanel({ onClose }: { onClose: () => void }) {
  const chat = useChat(onClose);
  return (
    <div className="chat-panel" role="dialog" aria-label="BizKhata AI Assistant">
      <div className="chat-panel-head">
        <span className="brand-mark" style={{ width: 34, height: 34, fontSize: 18 }}>B</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>BizKhata AI Assistant</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Your Intelligent Business Assistant • {chat.profileName}</div>
        </div>
        <button className="icon-btn" style={{ color: '#fff' }} onClick={() => chat.setSpeakOn(!chat.speakOn)} aria-label={chat.speakOn ? 'Turn off voice replies' : 'Turn on voice replies'} title="Voice replies">
          {chat.speakOn ? '🔊' : '🔇'}
        </button>
        <button className="icon-btn" style={{ color: '#fff' }} onClick={chat.newChat} aria-label="New chat" title="New chat">＋</button>
        <button className="icon-btn" style={{ color: '#fff' }} onClick={onClose} aria-label="Close chat">✕</button>
      </div>
      <ChatBody chat={chat} />
    </div>
  );
}

/** Floating chat button — fixed bottom-right on every private screen. */
export function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  // On the dedicated /chatbot page the full chat is already on screen.
  if ((pathname || '').replace(/\/$/, '') === '/chatbot') return null;
  return (
    <>
      <button
        className="chat-fab"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close AI Assistant' : 'Open AI Assistant'}
        title="BizKhata AI Assistant"
      >
        💬
      </button>
      {open && <ChatPanel onClose={() => setOpen(false)} />}
    </>
  );
}

/** Dedicated full-page chat (/chatbot) with conversation history. */
export function ChatPageView() {
  const chat = useChat();
  const filtered = chat.conversations.filter((c) => {
    if (!chat.historyQuery.trim()) return true;
    const q = chat.historyQuery.toLowerCase();
    return c.title.toLowerCase().includes(q) || c.messages.some((m) => m.text.toLowerCase().includes(q));
  });
  return (
    <div className="chat-page-wrap">
      {chat.showHistory && (
        <div className="chat-history">
          <div className="chat-history-head">
            <strong>Chat History</strong>
            <button className="icon-btn" onClick={() => chat.setShowHistory(false)} aria-label="Close history">✕</button>
          </div>
          <input
            className="input"
            value={chat.historyQuery}
            onChange={(e) => chat.setHistoryQuery(e.target.value)}
            placeholder="Search chats…"
            aria-label="Search chat history"
          />
          <div className="chat-history-list">
            {filtered.length === 0 && <p className="empty">Koi chat nahi mili.</p>}
            {filtered.map((c) => (
              <button
                key={c.id}
                className={`chat-history-item ${c.id === chat.activeId ? 'active' : ''}`}
                onClick={() => { chat.setActiveId(c.id); chat.setShowHistory(false); }}
              >
                <span className="chat-history-title">{c.title}</span>
                <span className="chat-history-date">{new Date(c.createdAt).toLocaleDateString('en-IN')}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={chat.clearHistory}>Clear All History</button>
        </div>
      )}
      <div className="chat-page">
        <div className="chat-panel-head">
          <span className="brand-mark" style={{ width: 34, height: 34, fontSize: 18 }}>B</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>BizKhata AI Assistant</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Your Intelligent Business Assistant • {chat.profileName} • Ask in Hinglish, English or Hindi</div>
          </div>
          <button className="icon-btn" style={{ color: '#fff' }} onClick={() => chat.setSpeakOn(!chat.speakOn)} aria-label={chat.speakOn ? 'Turn off voice replies' : 'Turn on voice replies'} title="Voice replies">
            {chat.speakOn ? '🔊' : '🔇'}
          </button>
          <button className="btn btn-secondary" style={{ background: 'rgba(255,255,255,.15)', color: '#fff', borderColor: 'transparent' }} onClick={() => chat.setShowHistory(!chat.showHistory)}>History</button>
          <button className="btn btn-secondary" style={{ background: 'rgba(255,255,255,.15)', color: '#fff', borderColor: 'transparent' }} onClick={chat.newChat}>+ New Chat</button>
        </div>
        <ChatBody chat={chat} />
      </div>
    </div>
  );
}
