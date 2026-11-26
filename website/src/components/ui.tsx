/**
 * Shared UI helpers + the Ctx (page context) passed to every view.
 * Keep labels simple — ordinary shopkeepers must understand every button.
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

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
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
