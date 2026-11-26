'use client';
import React from 'react';
import { formatINR } from '@/lib/money';
import { balancesPaise } from '@/lib/accounting';
import { auditEntry } from '@/lib/store';
import type { CashTxn, Method } from '@/lib/types';
import { todayISO, uid } from '@/lib/types';
import { AmountInput, Btn, Card, Empty, Field, Modal, Pager, Stat, formatDate, pageSlice, type Ctx } from './ui';

const PAGE_SIZE = 8;

function BookView({ ctx, method }: { ctx: Ctx; method: Method }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const allTxns = state.cashTxns.filter((x) => x.profileId === pid);
  const txns = allTxns
    .filter((x) => x.method === method || (x.kind === 'transfer' && x.transferTo === method))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const bal = balancesPaise(profile.openingCashPaise, profile.openingUpiPaise, allTxns);
  const balance = method === 'cash' ? bal.cash : bal.upi;
  const opening = method === 'cash' ? profile.openingCashPaise : profile.openingUpiPaise;
  const [showForm, setShowForm] = React.useState(false);
  const [kind, setKind] = React.useState<'in' | 'out' | 'transfer'>('in');
  const [amount, setAmount] = React.useState(0);
  const [category, setCategory] = React.useState('Income');
  const [note, setNote] = React.useState('');
  const [date, setDate] = React.useState(todayISO());
  const [error, setError] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'in' | 'out' | 'transfer'>('all');
  const [search, setSearch] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [page, setPage] = React.useState(1);

  const other: Method = method === 'cash' ? 'upi' : 'cash';
  const title = method === 'cash' ? 'Cash Book' : 'UPI Book';

  const totalIn = txns.filter((x) => x.kind === 'in' && x.method === method).reduce((s, x) => s + x.amountPaise, 0);
  const totalOut = txns.filter((x) => x.kind === 'out' && x.method === method).reduce((s, x) => s + x.amountPaise, 0);

  const filtered = txns
    .filter((x) => filter === 'all' || x.kind === filter)
    .filter((x) => !search || x.category.toLowerCase().includes(search.toLowerCase()) || x.note.toLowerCase().includes(search.toLowerCase()))
    .filter((x) => (!from || x.date >= from) && (!to || x.date <= to));

  // Running balance per row: walk oldest -> newest from the opening balance.
  const running = new Map<string, number>();
  {
    let b = opening;
    const asc = [...txns].sort((a, c) => (a.date < c.date ? -1 : 1));
    for (const x of asc) {
      if (x.kind === 'in' && x.method === method) b += x.amountPaise;
      else if (x.kind === 'out' && x.method === method) b -= x.amountPaise;
      else if (x.kind === 'transfer') b += x.method === method ? -x.amountPaise : x.amountPaise;
      running.set(x.id, b);
    }
  }
  const pageRows = pageSlice(filtered, page, PAGE_SIZE);

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
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label={method === 'cash' ? 'Total Cash In' : 'Total Received'} value={formatINR(totalIn)} tone="green" sub="Income only — transfers excluded" />
        <Stat label={method === 'cash' ? 'Total Cash Out' : 'Total Sent'} value={formatINR(totalOut)} tone="red" sub="Expenses only — transfers excluded" />
        <Stat label="Opening Balance" value={formatINR(opening)} tone="blue" />
        <Stat label="Closing Balance" value={formatINR(balance)} tone="purple" sub={`Cash ${formatINR(bal.cash)} • UPI ${formatINR(bal.upi)}`} />
      </div>
      <Card
        title={title}
        right={<Btn onClick={() => setShowForm(true)}>+ Add Transaction</Btn>}
      >
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Cash-to-UPI and UPI-to-Cash are internal transfers — they move money, they are never
          income or expense.
        </p>
        <div className="form-row">
          <Field label="Search">
            <input className="input" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Category or note…" />
          </Field>
          <Field label="From date"><input className="input" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Field>
          <Field label="To date"><input className="input" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Field>
        </div>
        <div className="pills" style={{ marginBottom: 12 }} aria-label="Transaction filter">
          {([['all', `All (${txns.length})`], ['in', `Income (${txns.filter((x) => x.kind === 'in').length})`], ['out', `Expense (${txns.filter((x) => x.kind === 'out').length})`], ['transfer', `Transfers (${txns.filter((x) => x.kind === 'transfer').length})`]] as const).map(([k, label]) => (
            <button key={k} className={filter === k ? 'active' : ''} onClick={() => { setFilter(k); setPage(1); }}>{label}</button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <Empty text="No entries yet." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Date</th><th>Particulars</th><th>Type</th><th className="num">Amount</th><th className="num">Balance</th><th>Action</th></tr></thead>
              <tbody>
                {pageRows.map((x, i) => {
                  const sign = x.kind === 'in' ? '+' : x.kind === 'out' ? '−' : '⇄';
                  const amt = x.kind === 'transfer'
                    ? (x.method === method ? -x.amountPaise : x.amountPaise)
                    : (x.kind === 'in' ? x.amountPaise : -x.amountPaise);
                  return (
                    <tr key={x.id}>
                      <td>{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td>{formatDate(x.date)}</td>
                      <td>
                        <span className="cell-main">{x.category}</span>
                        {x.note ? <><br /><span className="cell-sub">{x.note}</span></> : null}
                      </td>
                      <td>{x.kind === 'transfer' ? 'Internal Transfer' : x.kind === 'in' ? 'Received' : 'Spent'}</td>
                      <td className="num" style={{ color: amt >= 0 ? '#007a5e' : 'var(--danger)' }}>{sign} {formatINR(Math.abs(amt))}</td>
                      <td className="num">{formatINR(running.get(x.id) ?? 0)}</td>
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
            <Pager total={filtered.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
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
