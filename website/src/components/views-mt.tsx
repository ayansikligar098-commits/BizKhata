'use client';
import React from 'react';
import { formatINR } from '@/lib/money';
import { mtClosingPaise, mtProfitPaise } from '@/lib/accounting';
import { MT_EXPENSE_CATEGORIES } from '@/lib/categories';
import { auditEntry, exportCSV } from '@/lib/store';
import type { Method, MtExpense, MtFund, MtTransfer } from '@/lib/types';
import { todayISO, uid } from '@/lib/types';
import { AmountInput, Btn, Card, Empty, Field, Modal, Stat, formatDate, type Ctx } from './ui';

export function MoneyTransferView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const funds = state.mtFunds.filter((f) => f.profileId === pid);
  const transfers = [...state.mtTransfers.filter((m) => m.profileId === pid)].sort((a, b) => (a.date < b.date ? 1 : -1));
  const expenses = state.mtExpenses.filter((m) => m.profileId === pid);

  const closing = mtClosingPaise(0, 0, funds, transfers, expenses);
  const profit = mtProfitPaise(transfers, expenses);
  const totalSent = transfers.filter((t) => t.status !== 'Failed').reduce((s, t) => s + t.amountPaise, 0);
  const totalFund = funds.reduce((s, f) => s + f.amountPaise, 0);
  const commission = transfers.filter((t) => t.status !== 'Failed').reduce((s, t) => s + t.commissionPaise, 0);

  const [tab, setTab] = React.useState<'fund' | 'transfer' | 'expense' | null>(null);
  const [amount, setAmount] = React.useState(0);
  const [commissionAmt, setCommissionAmt] = React.useState(0);
  const [method, setMethod] = React.useState<Method>('upi');
  const [name, setName] = React.useState('');
  const [mobile, setMobile] = React.useState('');
  const [refNo, setRefNo] = React.useState('');
  const [note, setNote] = React.useState('');
  const [date, setDate] = React.useState(todayISO());
  const [expCat, setExpCat] = React.useState<(typeof MT_EXPENSE_CATEGORIES)[number]>('Tea/Food');
  const [error, setError] = React.useState('');

  function reset() {
    setAmount(0); setCommissionAmt(0); setName(''); setMobile(''); setRefNo(''); setNote(''); setError(''); setTab(null);
  }

  function submit() {
    if (amount <= 0) { setError('Enter an amount more than 0.'); return; }
    if (tab === 'fund') {
      const f: MtFund = { id: uid('mtf'), profileId: pid, amountPaise: amount, method, date, note: note || 'Fund from brother' };
      ctx.mutate((s) => { s.mtFunds.push(f); }, [auditEntry(pid, 'create', 'MtFund', f.id, '', `Fund received ${formatINR(amount)} by ${method}`)]);
    } else if (tab === 'transfer') {
      if (!name.trim()) { setError('Enter the receiver name.'); return; }
      const avail = method === 'cash' ? closing.cash : closing.upi;
      if (amount > avail) { setError(`Not enough MT ${method} balance (${formatINR(avail)}). Add fund from brother first.`); return; }
      const tr: MtTransfer = {
        id: uid('mtt'), profileId: pid, receiverName: name, mobile,
        amountPaise: amount, commissionPaise: commissionAmt, method,
        status: 'Sent', refNo, date, note,
      };
      ctx.mutate((s) => { s.mtTransfers.push(tr); }, [auditEntry(pid, 'create', 'MtTransfer', tr.id, '', `Transfer ${formatINR(amount)} to ${name}, commission ${formatINR(commissionAmt)}`)]);
    } else if (tab === 'expense') {
      const e: MtExpense = { id: uid('mte'), profileId: pid, category: expCat, amountPaise: amount, method, date, note };
      ctx.mutate((s) => { s.mtExpenses.push(e); }, [auditEntry(pid, 'create', 'MtExpense', e.id, '', `MT expense ${expCat} ${formatINR(amount)}`)]);
    }
    reset();
  }

  return (
    <div>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Money Transfer is a <strong>fully separate ledger</strong> — never mixed with shop cash, PAN,
        Aadhaar, Xerox or Printing. Profit comes ONLY from commission, never from the money sent.
        Fund comes from your brother, by UPI.
      </p>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Fund Received (Brother)" value={formatINR(totalFund)} />
        <Stat label="Money Sent" value={formatINR(totalSent)} sub="Principal — not profit" />
        <Stat label="Commission Earned" value={formatINR(commission)} />
        <Stat label="MT Profit" value={formatINR(profit)} sub="Commission − MT expenses" />
        <Stat label="Closing Cash (MT)" value={formatINR(closing.cash)} />
        <Stat label="Closing UPI (MT)" value={formatINR(closing.upi)} />
        <Stat label="MT Balance (Total)" value={formatINR(closing.total)} />
      </div>

      <div className="btn-row" style={{ marginBottom: 16 }}>
        <Btn onClick={() => setTab('fund')}>+ Add Fund From Brother</Btn>
        <Btn onClick={() => setTab('transfer')}>+ New Transfer</Btn>
        <Btn kind="secondary" onClick={() => setTab('expense')}>+ MT Expense</Btn>
        <Btn
          kind="secondary"
          onClick={() =>
            exportCSV('bizkhata-money-transfer.csv',
              ['Date', 'Receiver', 'Mobile', 'Amount (Rs)', 'Commission (Rs)', 'Method', 'Status', 'Ref'],
              transfers.map((tr) => [tr.date, tr.receiverName, tr.mobile, (tr.amountPaise / 100).toFixed(2), (tr.commissionPaise / 100).toFixed(2), tr.method, tr.status, tr.refNo]))
          }
        >
          Export CSV
        </Btn>
      </div>

      <Card title="Daily Closing — Closing = Starting + Funds Received − Sent − Expenses">
        <p>
          Closing Cash: <strong>{formatINR(closing.cash)}</strong> &nbsp;•&nbsp; Closing UPI:{' '}
          <strong>{formatINR(closing.upi)}</strong> &nbsp;•&nbsp; Total MT balance:{' '}
          <strong>{formatINR(closing.total)}</strong>
        </p>
        <p style={{ color: 'var(--muted)' }}>
          Count the actual cash/UPI in hand and compare with these figures. If they differ, use
          the Difference Finder (Money Transfer) — it only suggests, it never changes entries.
        </p>
      </Card>

      <Card title="Transfers">
        {transfers.length === 0 ? (
          <Empty text="No transfers yet." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Receiver</th><th>Mobile</th><th className="num">Amount</th><th className="num">Commission</th><th>Method</th><th>Status</th><th>Ref</th><th></th></tr></thead>
              <tbody>
                {transfers.map((tr) => (
                  <tr key={tr.id}>
                    <td>{formatDate(tr.date)}</td>
                    <td>{tr.receiverName}</td>
                    <td>{tr.mobile}</td>
                    <td className="num">{formatINR(tr.amountPaise)}</td>
                    <td className="num">{formatINR(tr.commissionPaise)}</td>
                    <td>{tr.method.toUpperCase()}</td>
                    <td>{tr.status}</td>
                    <td>{tr.refNo}</td>
                    <td>
                      <Btn kind="ghost" onClick={() => {
                        if (!window.confirm('Move this transfer to the Recycle Bin?')) return;
                        ctx.softDelete('MtTransfer', `Transfer ${formatINR(tr.amountPaise)} to ${tr.receiverName}`, tr, (s) => {
                          s.mtTransfers = s.mtTransfers.filter((t) => t.id !== tr.id);
                        });
                      }}>Delete</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-2">
        <Card title="Funds Received (from Brother)">
          {funds.length === 0 ? <Empty text="No fund received yet." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th className="num">Amount</th><th>Method</th><th>Note</th></tr></thead>
                <tbody>
                  {funds.map((f) => (
                    <tr key={f.id}><td>{formatDate(f.date)}</td><td className="num">{formatINR(f.amountPaise)}</td><td>{f.method.toUpperCase()}</td><td>{f.note}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="MT Other Expenses">
          {expenses.length === 0 ? <Empty text="No MT expenses yet." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Category</th><th className="num">Amount</th><th>Method</th></tr></thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id}><td>{formatDate(e.date)}</td><td>{e.category}</td><td className="num">{formatINR(e.amountPaise)}</td><td>{e.method.toUpperCase()}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {tab && (
        <Modal title={tab === 'fund' ? 'Add Fund From Brother' : tab === 'transfer' ? 'New Money Transfer' : 'MT Other Expense'} onClose={reset}>
          {tab === 'transfer' && (
            <div className="form-row">
              <Field label="Receiver Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Receiver Mobile"><input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" /></Field>
            </div>
          )}
          {tab === 'expense' && (
            <Field label="Expense Category">
              <select className="input" value={expCat} onChange={(e) => setExpCat(e.target.value as (typeof MT_EXPENSE_CATEGORIES)[number])}>
                {MT_EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}
          <div className="form-row">
            <Field label="Amount (₹)"><AmountInput valuePaise={amount} onChange={setAmount} /></Field>
            {tab === 'transfer' && (
              <Field label="Commission (₹)" hint="Only this is profit — never the transfer amount.">
                <AmountInput valuePaise={commissionAmt} onChange={setCommissionAmt} />
              </Field>
            )}
            <Field label="Method">
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
              </select>
            </Field>
          </div>
          <div className="form-row">
            <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            {tab === 'transfer' && (
              <Field label="Reference No."><input className="input" value={refNo} onChange={(e) => setRefNo(e.target.value)} /></Field>
            )}
          </div>
          <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {error && <p className="error">{error}</p>}
          <div className="btn-row">
            <Btn onClick={submit}>Save</Btn>
            <Btn kind="secondary" onClick={reset}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
