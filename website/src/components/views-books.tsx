'use client';
import React from 'react';
import { formatINR, parseAmount } from '@/lib/money';
import { balancesPaise } from '@/lib/accounting';
import { auditEntry } from '@/lib/store';
import type { CashTxn, Method } from '@/lib/types';
import { todayISO, uid } from '@/lib/types';
import { AmountInput, Btn, Card, Empty, Field, Modal, Stat, formatDate, type Ctx } from './ui';

function BookView({ ctx, method }: { ctx: Ctx; method: Method }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const txns = state.cashTxns
    .filter((x) => x.profileId === pid && (x.method === method || (x.kind === 'transfer' && x.transferTo === method)))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const bal = balancesPaise(profile.openingCashPaise, profile.openingUpiPaise, state.cashTxns.filter((x) => x.profileId === pid));
  const balance = method === 'cash' ? bal.cash : bal.upi;
  const [showForm, setShowForm] = React.useState(false);
  const [kind, setKind] = React.useState<'in' | 'out' | 'transfer'>('in');
  const [amount, setAmount] = React.useState(0);
  const [category, setCategory] = React.useState('Income');
  const [note, setNote] = React.useState('');
  const [date, setDate] = React.useState(todayISO());
  const [error, setError] = React.useState('');

  const other: Method = method === 'cash' ? 'upi' : 'cash';
  const title = method === 'cash' ? 'Cash Book' : 'UPI Book';

  function submit() {
    if (amount <= 0) { setError('Enter an amount more than 0.'); return; }
    if (kind === 'transfer' && amount > balance) {
      setError(`Not enough ${method} balance (${formatINR(balance)}). Internal transfer cannot exceed the balance.`);
      return;
    }
    const txn: CashTxn = {
      id: uid('txn'), profileId: pid, kind, method,
      amountPaise: amount, category: kind === 'transfer' ? 'Internal Transfer' : category,
      note, date, transferTo: kind === 'transfer' ? other : undefined,
      createdAt: new Date().toISOString(),
    };
    ctx.mutate(
      (s) => { s.cashTxns.push(txn); },
      [auditEntry(pid, 'create', 'CashTxn', txn.id, '', `${kind} ${formatINR(amount)} ${method} — ${txn.category}`)],
    );
    setShowForm(false); setAmount(0); setNote(''); setError('');
  }

  return (
    <div>
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Stat label={`${method === 'cash' ? 'Cash' : 'UPI'} Balance`} value={formatINR(balance)} sub={`Opening ${formatINR(method === 'cash' ? profile.openingCashPaise : profile.openingUpiPaise)}`} />
        <Stat label="This book — money in" value={formatINR(txns.filter((x) => x.kind === 'in' && x.method === method).reduce((s, x) => s + x.amountPaise, 0))} sub="Internal transfers are not income" />
      </div>
      <Card
        title={title}
        right={<Btn onClick={() => setShowForm(true)}>+ Add Entry</Btn>}
      >
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Cash-to-UPI and UPI-to-Cash are internal transfers — they move money, they are never
          income or expense.
        </p>
        {txns.length === 0 ? (
          <Empty text="No entries yet." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Note</th><th className="num">Amount</th><th></th></tr></thead>
              <tbody>
                {txns.map((x) => {
                  const sign = x.kind === 'in' ? '+' : x.kind === 'out' ? '−' : '⇄';
                  const amt = x.kind === 'transfer'
                    ? (x.method === method ? -x.amountPaise : x.amountPaise)
                    : (x.kind === 'in' ? x.amountPaise : -x.amountPaise);
                  return (
                    <tr key={x.id}>
                      <td>{formatDate(x.date)}</td>
                      <td>{x.kind === 'transfer' ? 'Internal Transfer' : x.kind === 'in' ? 'Received' : 'Spent'}</td>
                      <td>{x.category}</td>
                      <td>{x.note}</td>
                      <td className="num">{sign} {formatINR(Math.abs(amt))}</td>
                      <td>
                        <Btn kind="ghost" onClick={() => {
                          if (!window.confirm('Move this entry to the Recycle Bin?')) return;
                          ctx.softDelete('CashTxn', `${x.category} ${formatINR(x.amountPaise)}`, x, (s) => {
                            s.cashTxns = s.cashTxns.filter((t) => t.id !== x.id);
                          });
                        }}>Delete</Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {showForm && (
        <Modal title={`Add to ${title}`} onClose={() => setShowForm(false)}>
          <Field label="Type">
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as 'in' | 'out' | 'transfer')}>
              <option value="in">Money Received (Income)</option>
              <option value="out">Money Spent (Expense)</option>
              <option value="transfer">Internal Transfer → {other.toUpperCase()} (not income/expense)</option>
            </select>
          </Field>
          {kind !== 'transfer' && (
            <Field label="Category">
              <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Xerox Income, Rent" />
            </Field>
          )}
          <Field label="Amount (₹)">
            <AmountInput valuePaise={amount} onChange={setAmount} />
          </Field>
          <div className="form-row">
            <Field label="Date">
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Note">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
            </Field>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="btn-row">
            <Btn onClick={submit}>Save</Btn>
            <Btn kind="secondary" onClick={() => setShowForm(false)}>Cancel</Btn>
          </div>
          <p className="field-hint">Tip: type the amount and press Save — 2 steps, done.</p>
        </Modal>
      )}
    </div>
  );
}

export function CashBookView({ ctx }: { ctx: Ctx }) {
  return <BookView ctx={ctx} method="cash" />;
}

export function UpiBookView({ ctx }: { ctx: Ctx }) {
  return <BookView ctx={ctx} method="upi" />;
}
