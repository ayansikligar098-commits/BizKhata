/**
 * Shared UI helpers + the Ctx (page context) passed to every view.
 * Keep labels simple — ordinary shopkeepers must understand every button.
 * Charts are plain SVG/CSS — no new dependencies.
 */
'use client';
import React from 'react';
import type { AppState, AuditEntry, BusinessProfile } from '@/lib/types';

export interface Ctx {
  state: AppState;
  profile: BusinessProfile;
  /** Apply a mutation to the whole state (persisted + audited). */
  mutate: (fn: (s: AppState) => void, audit?: AuditEntry[]) => void;
  /** Soft-delete: move to Recycle Bin + audit, instead of erasing. */
  softDelete: (kind: string, label: string, data: unknown, remove: (s: AppState) => void) => void;
  /** Navigate to another view (view key from page.tsx). */
  go?: (view: string) => void;
  /** Jump to Services and open the Add Job form for this service. */
  goService?: (service: string) => void;
  /** Jump to Services and filter to this service (no form). */
  goServiceFilter?: (service: string) => void;
  /** Latest service jump (service + nonce); ServicesView reacts to it. */
  serviceJump?: { service: string; nonce: number; openForm: boolean };
  /** Open the dedicated Customer Profile page for this customer id. */
  openCustomer?: (customerId: string) => void;
  /** Currently open customer id (Customer Profile view). */
  customerId?: string | null;
  /** Open the dedicated Agent Profile page for this agent id. */
  openAgent?: (agentId: string) => void;
  /** Currently open agent id (Agent Profile / Agent Payments views). */
  agentId?: string | null;
}

export function Card({ title, children, right }: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="card">
      {(title || right) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Btn({
  children,
  onClick,
  kind = 'primary',
  type = 'button',
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <button type={type} className={`btn btn-${kind}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export type StatTone = 'green' | 'red' | 'purple' | 'blue' | 'indigo' | 'orange' | 'pink';

export function Stat({
  label,
  value,
  sub,
  tone,
  icon,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: StatTone;
  icon?: React.ReactNode;
  trend?: { pct: number | null; label?: string };
}) {
  return (
    <div className={`stat${tone ? ` tone-${tone}` : ''}`}>
      {icon && <div className="stat-ico" style={{ background: 'var(--purple-soft)', color: 'var(--purple-ink)' }}>{icon}</div>}
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {trend && trend.pct !== null && (
        <div style={{ marginTop: 6 }}>
          <span className={`trend ${trend.pct >= 0 ? 'up' : 'down'}`}>
            {trend.pct >= 0 ? '▲' : '▼'} {Math.abs(Math.round(trend.pct))}%{trend.label ? ` ${trend.label}` : ''}
          </span>
        </div>
      )}
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}

/** Pagination footer: "Showing 1–8 of 23" + numbered pages. */
export function Pager({
  total,
  page,
  pageSize,
  onPage,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums: number[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== -1) nums.push(-1);
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
      <span style={{ color: 'var(--muted)', fontSize: 13.5 }}>
        Showing {from}–{to} of {total}
      </span>
      <div className="pills" aria-label="Pagination">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Previous page">‹</button>
        {nums.map((p) =>
          p === -1 ? (
            <button key={`e${Math.random()}`} disabled>…</button>
          ) : (
            <button key={p} className={p === page ? 'active' : ''} onClick={() => onPage(p)}>{p}</button>
          ),
        )}
        <button onClick={() => onPage(Math.min(pages, page + 1))} disabled={page >= pages} aria-label="Next page">›</button>
      </div>
    </div>
  );
}

/** Slice helper for paged tables. */
export function pageSlice<T>(rows: T[], page: number, pageSize: number): T[] {
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Controlled rupee amount input — stores paise in the parent. */
export function AmountInput({
  valuePaise,
  onChange,
  placeholder,
}: {
  valuePaise: number;
  onChange: (paise: number) => void;
  placeholder?: string;
}) {
  const [text, setText] = React.useState(valuePaise ? String(valuePaise / 100) : '');
  return (
    <input
      className="input"
      type="number"
      min="0"
      step="0.01"
      inputMode="decimal"
      placeholder={placeholder || '0.00'}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        onChange(Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0);
      }}
    />
  );
}

export function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Initials avatar text, e.g. "Rahul Patel" -> "RP". */
export function initials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/);
  return (parts[0]?.[0] || '?').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

/** Status -> pill class suffix. */
export function statusPill(status: string): string {
  const s = status.toLowerCase().replace(/\s+/g, '-');
  if (s === 'completed' || s === 'delivered') return 'completed';
  if (s === 'pending') return 'pending';
  if (s === 'in-progress' || s === 'submitted') return 'in-progress';
  if (s === 'new') return 'new';
  if (s === 'cancelled') return 'cancelled';
  return '';
}

export const CHART_COLORS = ['#6c5ce7', '#00b894', '#f59e0b', '#e84393', '#0984e3', '#a29bfe', '#636e72'];

/* ---------------- charts (pure SVG, no dependencies) ---------------- */

export function DonutChart({
  data,
  totalLabel,
  totalValue,
}: {
  data: { label: string; value: number; color: string; valueLabel: string }[];
  totalLabel: string;
  totalValue: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-flex">
      <svg className="donut-svg" viewBox="0 0 180 180" role="img" aria-label="Service-wise income donut chart">
        <circle cx="90" cy="90" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="26" />
        {total > 0 &&
          data.map((d) => {
            const frac = d.value / total;
            const dash = frac * c;
            const el = (
              <circle
                key={d.label}
                cx="90"
                cy="90"
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth="26"
                strokeDasharray={`${Math.max(0, dash - 2)} ${c - Math.max(0, dash - 2)}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 90 90)"
              />
            );
            offset += dash;
            return el;
          })}
        <text x="90" y="86" textAnchor="middle" style={{ fontSize: 19, fontWeight: 800, fill: 'var(--text)' }}>
          {totalValue}
        </text>
        <text x="90" y="106" textAnchor="middle" style={{ fontSize: 12, fill: 'var(--muted)' }}>
          {totalLabel}
        </text>
      </svg>
      <div className="donut-legend">
        {data.map((d) => (
          <div className="dl-row" key={d.label}>
            <span className="lg-dot" style={{ background: d.color }} />
            <span>{d.label}</span>
            <b>{d.valueLabel}</b>
          </div>
        ))}
        {data.length === 0 && <p className="empty">No income yet.</p>}
      </div>
    </div>
  );
}

export function LineChart({
  labels,
  income,
  expenses,
}: {
  labels: string[];
  income: number[];
  expenses: number[];
}) {
  const W = 640;
  const H = 250;
  const padL = 44;
  const padR = 12;
  const padT = 14;
  const padB = 28;
  const max = Math.max(1, ...income, ...expenses);
  const top = max * 1.15;
  const x = (i: number) => padL + (i * (W - padL - padR)) / Math.max(1, labels.length - 1);
  const y = (v: number) => padT + (1 - v / top) * (H - padT - padB);
  const line = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = (vals: number[]) =>
    `${line(vals)} L${x(vals.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const ticks = [0, 0.5, 1].map((f) => Math.round((top * f) / 1000) * 1000);
  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        <span className="lg"><span className="lg-dot" style={{ background: '#6c5ce7' }} /> Income</span>
        <span className="lg"><span className="lg-dot" style={{ background: '#e84393' }} /> Expenses</span>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Business overview line chart">
        <defs>
          <linearGradient id="bkInc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6c5ce7" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#6c5ce7" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="bkExp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e84393" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#e84393" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((tv) => (
          <g key={tv}>
            <line x1={padL} x2={W - padR} y1={y(tv)} y2={y(tv)} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 8} y={y(tv) + 4} textAnchor="end" style={{ fontSize: 11, fill: 'var(--muted)' }}>
              {tv >= 1000 ? `${Math.round(tv / 1000)}K` : tv}
            </text>
          </g>
        ))}
        <path d={area(income)} fill="url(#bkInc)" />
        <path d={area(expenses)} fill="url(#bkExp)" />
        <path d={line(income)} fill="none" stroke="#6c5ce7" strokeWidth="2.5" strokeLinejoin="round" />
        <path d={line(expenses)} fill="none" stroke="#e84393" strokeWidth="2.5" strokeLinejoin="round" />
        {income.map((v, i) => (
          <circle key={`i${i}`} cx={x(i)} cy={y(v)} r="3.5" fill="#fff" stroke="#6c5ce7" strokeWidth="2" />
        ))}
        {expenses.map((v, i) => (
          <circle key={`e${i}`} cx={x(i)} cy={y(v)} r="3.5" fill="#fff" stroke="#e84393" strokeWidth="2" />
        ))}
        {labels.map((lb, i) => (
          <text key={lb + i} x={x(i)} y={H - 8} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--muted)' }}>
            {lb}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function BarChart({
  data,
}: {
  data: { label: string; value: number; valueLabel: string }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bar-chart" role="img" aria-label="Bar chart">
      {data.map((d) => (
        <div className="bar-col" key={d.label} title={`${d.label}: ${d.valueLabel}`}>
          <span className="bar-val">{d.valueLabel}</span>
          <div className="bar" style={{ height: `${Math.max(3, (d.value / max) * 78)}%` }} />
          <span className="bar-lbl">{d.label}</span>
        </div>
      ))}
      {data.length === 0 && <p className="empty">No data yet.</p>}
    </div>
  );
}
