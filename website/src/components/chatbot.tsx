'use client';
import React from 'react';
import { usePathname } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { answerLocally, computeFacts, factsSummary } from '@/lib/chatbot';
import { askGeminiChat } from '@/lib/gemini';

interface Msg {
  role: 'user' | 'bot';
  text: string;
}

const QUICK_QUESTIONS = [
  'Aaj ka profit kitna hai?',
  'Kaun paise dena baaki hai?',
  'Agent ko kitna dena hai?',
  'MT commission kitna hai?',
  'Cash aur UPI balance kitna hai?',
];

const WELCOME =
  'Namaste! Main aapka BizKhata AI Assistant hoon. Aaj ka profit, customer due, agent payable, Money Transfer commission ya balance — kuch bhi poochho. Mere jawab aapke real record se aate hain.';

function useChat() {
  const app = useApp();
  const [messages, setMessages] = React.useState<Msg[]>([{ role: 'bot', text: WELCOME }]);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const msgsRef = React.useRef<HTMLDivElement>(null);
  const key = (app.profile?.geminiKey || '').trim();

  // Scroll only the message list (never the whole page — scrollIntoView on
  // the marker would scroll the document and clip the page header).
  React.useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setBusy(true);
    const facts = computeFacts(app.state, app.profile);
    const local = answerLocally(q, facts);
    let reply = local.text;
    if (key) {
      // Gemini only rephrases the same real figures — it never invents any.
      const res = await askGeminiChat(key, q, factsSummary(facts));
      if (res.ok) reply = res.text;
      else reply = `${local.text}\n\n(AI summary unavailable — showing real figures from your ledgers.)`;
    }
    setMessages((m) => [...m, { role: 'bot', text: reply }]);
    setBusy(false);
  }

  return { messages, input, setInput, busy, send, bottomRef, msgsRef, hasKey: key.length > 0 };
}

function ChatBody({ chat }: { chat: ReturnType<typeof useChat> }) {
  return (
    <>
      <div className="chat-msgs" ref={chat.msgsRef}>
        {chat.messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.text}
          </div>
        ))}
        {chat.busy && <div className="chat-msg bot">Soch raha hoon…</div>}
        <div ref={chat.bottomRef} />
      </div>
      <div className="chat-chips">
        {QUICK_QUESTIONS.map((q) => (
          <button key={q} className="chat-chip" onClick={() => chat.send(q)} disabled={chat.busy}>
            {q}
          </button>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          className="input"
          value={chat.input}
          onChange={(e) => chat.setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') chat.send(chat.input); }}
          placeholder="Apna sawal likho… (Hinglish / English / Hindi)"
          aria-label="Ask the AI assistant"
        />
        <button className="btn" onClick={() => chat.send(chat.input)} disabled={chat.busy || !chat.input.trim()}>
          Send
        </button>
      </div>
      <div className="chat-note">
        {chat.hasKey
          ? 'AI summary ON (free Gemini key) — figures always from your real ledgers.'
          : 'AI summary OFF — add your free Gemini key in Settings for smarter answers. Figures are always from your real ledgers.'}
      </div>
    </>
  );
}

/** Overlay chat panel (opened by the floating button). */
export function ChatPanel({ onClose }: { onClose: () => void }) {
  const chat = useChat();
  return (
    <div className="chat-panel" role="dialog" aria-label="BizKhata AI Assistant">
      <div className="chat-panel-head">
        <span className="brand-mark" style={{ width: 34, height: 34, fontSize: 18 }}>B</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>BizKhata AI Assistant</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {chat.hasKey ? '● AI on (Gemini free tier)' : '● AI off — real figures only'}
          </div>
        </div>
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

/** Dedicated full-page chat (/chatbot). */
export function ChatPageView() {
  const chat = useChat();
  return (
    <div className="chat-page">
      <div className="chat-panel-head">
        <span className="brand-mark" style={{ width: 34, height: 34, fontSize: 18 }}>B</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>BizKhata AI Assistant</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {chat.hasKey ? '● AI on (Gemini free tier)' : '● AI off — real figures only'} • Ask in Hinglish, English or Hindi
          </div>
        </div>
      </div>
      <ChatBody chat={chat} />
    </div>
  );
}
