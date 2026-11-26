'use client';
import React from 'react';
import { formatINR } from '@/lib/money';
import { mtClosingPaise, mtProfitPaise } from '@/lib/accounting';
import { MT_EXPENSE_CATEGORIES } from '@/lib/categories';
import { auditEntry, exportCSV } from '@/lib/store';
import type { Method, MtExpense, MtFund, MtTransfer } from '@/lib/types';
import { todayISO, uid } from '@/lib/types';
import { AmountInput, Btn, Card, Empty, Field, Modal, Pager, Stat, formatDate, pageSlice, statusPill, type Ctx } from './ui';

const PAGE_SIZE = 8;

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

  const today = todayISO();
  const todayFunds = funds.filter((f) => f.date === today).reduce((s, f) => s + f.amountPaise, 0);
  const todayTransfers = transfers.filter((t) => t.date === today && t.status !== 'Failed');
  const todaySent = todayTransfers.reduce((s, t) => s + t.amountPaise, 0);
  const todayCommission = todayTransfers.reduce((s, t) => s + t.commissionPaise, 0);
  const todayExpenses = expenses.filter((e) => e.date === today).reduce((s, e) => s + e.amountPaise, 0);
  const todayProfit = todayCommission - todayExpenses;
  const todayClosing = mtClosingPaise(0, 0, funds.filter((f) => f.date <= today), transfers.filter((t) => t.date <= today), expenses.filter((e) => e.date <= today));

  const [tab, setTab] = React.useState<'overview' | 'transactions' | 'settlement' | 'difference'>('overview');
  const [form, setForm] = React.useState<'fund' | 'transfer' | 'expense' | null>(null);
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
  const [page, setPage] = React.useState(1);
  const [expected, setExpected] = React.useState('');
  const [recon, setRecon] = React.useState<{ diff: number; matches: string[] } | null>(null);

  function reset() {
    setAmount(0); setCommissionAmt(0); setName(''); setMobile(''); setRefNo(''); setNote(''); setError(''); setForm(null);
  }

  function submit() {
    if (amount <= 0) { setError('Enter an amount more than 0.'); return; }
    if (form === 'fund') {
      const f: MtFund = { id: uid('mtf'), profileId: pid, amountPaise: amount, method, date, note: note || 'Fund from brother' };
      ctx.mutate((s) => { s.mtFunds.push(f); }, [auditEntry(pid, 'create', 'MtFund', f.id, '', `Fund received ${formatINR(amount)} by ${method}`)]);
    } else if (form === 'transfer') {
      if (!name.trim()) { setError('Enter the receiver name.'); return; }
      const avail = method === 'cash' ? closing.cash : closing.upi;
      if (amount > avail) { setError(`Not enough MT ${method} balance (${formatINR(avail)}). Add fund from brother first.`); return; }
      const tr: MtTransfer = {
        id: uid('mtt'), profileId: pid, receiverName: name, mobile,
        amountPaise: amount, commissionPaise: commissionAmt, method,
        status: 'Sent', refNo, date, note,
      };
      ctx.mutate((s) => { s.mtTransfers.push(tr); }, [auditEntry(pid, 'create', 'MtTransfer', tr.id, '', `Transfer ${formatINR(amount)} to ${name}, commission ${formatINR(commissionAmt)}`)]);
    } else if (form === 'expense') {
      const e: MtExpense = { id: uid('mte'), profileId: pid, category: expCat, amountPaise: amount, method, date, note };
      ctx.mutate((s) => { s.mtExpenses.push(e); }, [auditEntry(pid, 'create', 'MtExpense', e.id, '', `MT expense ${expCat} ${formatINR(amount)}`)]);
    }
    reset();
  }

  function findRecon() {
    const expPaise = Math.round(parseFloat(expected || '0') * 100);
    const diff = expPaise - closing.total;
    const matches: string[] = [];
    if (diff !== 0) {
      const abs = Math.abs(diff);
      for (const tr of transfers) {
        if (tr.amountPaise === abs) matches.push(`Transfer to ${tr.receiverName} (${formatDate(tr.date)}) — ${formatINR(tr.amountPaise)}`);
        if (tr.commissionPaise === abs && tr.commissionPaise > 0) matches.push(`Commission on transfer to ${tr.receiverName} — ${formatINR(tr.commissionPaise)}`);
      }
      for (const f of funds) if (f.amountPaise === abs) matches.push(`Fund from brother (${formatDate(f.date)}) — ${formatINR(f.amountPaise)}`);
      for (const e of expenses) if (e.amountPaise === abs) matches.push(`MT expense ${e.category} (${formatDate(e.date)}) — ${formatINR(e.amountPaise)}`);
    }
    setRecon({ diff, matches });
  }

  const pageTransfers = pageSlice(transfers, page, PAGE_SIZE);

  return (
    <div>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Money Transfer is a <strong>fully separate ledger</strong> — never mixed with shop cash, PAN,
        Aadhaar, Xerox or Printing. Profit comes ONLY from commission, never from the money sent.
        Fund comes from your brother, by UPI.
      </p>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {([['overview', 'Overview'], ['transactions', 'Transactions'], ['settlement', 'Settlement'], ['difference', 'Difference']] as const).map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      <div className="btn-row" style={{ marginBottom: 14 }}>
        <Btn onClick={() => setForm('fund')}>+ Add Fund From Brother</Btn>
        <Btn onClick={() => setForm('transfer')}>+ New Transfer</Btn>
        <Btn kind="secondary" onClick={() => setForm('expense')}>+ MT Expense</Btn>
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

      {tab === 'overview' && (
        <div>
          <div className="mt-summary">
            <h2>Transfer Today — {formatDate(today)}</h2>
            <div className="mt-grid">
              <div className="mt-cell"><div className="mt-label">Cash Received (Fund)</div><div className="mt-value">{formatINR(todayFunds)}</div></div>
              <div className="mt-cell"><div className="mt-label">Cash Sent</div><div className="mt-value">{formatINR(todaySent)}</div></div>
              <div className="mt-cell"><div className="mt-label">Commission</div><div className="mt-value">{formatINR(todayCommission)}</div></div>
              <div className="mt-cell"><div className="mt-label">Expenses</div><div className="mt-value">{formatINR(todayExpenses)}</div></div>
            </div>
            <div className="mt-net"><span>Net Profit (today)</span><span>{formatINR(todayProfit)}</span></div>
          </div>

          <div className="grid grid-2">
            <Card title="Balances">
              <p>Cash Balance (MT): <strong>{formatINR(closing.cash)}</strong></p>
              <p>UPI Balance (MT): <strong>{formatINR(closing.upi)}</strong></p>
              <p>Total MT Balance: <strong>{formatINR(closing.total)}</strong></p>
              <p style={{ color: 'var(--muted)' }}>Fund received from brother: {formatINR(totalFund)} • Money sent: {formatINR(totalSent)} • Commission earned: {formatINR(commission)}</p>
            </Card>
            <Card title="Today's Transfers" right={todayTransfers.length > 0 ? <button className="link-btn" onClick={() => setTab('transactions')}>See All →</button> : undefined}>
              {todayTransfers.length === 0 ? <Empty text="No transfers today yet." /> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Receiver</th><th className="num">Amount</th><th className="num">Commission</th><th>Status</th></tr></thead>
                    <tbody>
                      {todayTransfers.slice(0, 5).map((tr) => (
                        <tr key={tr.id}>
                          <td>{tr.receiverName}</td>
                          <td className="num">{formatINR(tr.amountPaise)}</td>
                          <td className="num">{formatINR(tr.commissionPaise)}</td>
                          <td><span className={`pill ${statusPill(tr.status)}`}>{tr.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="grid grid-4" style={{ marginBottom: 16 }}>
            <Stat label="Fund Received (Brother)" value={formatINR(totalFund)} tone="blue" />
            <Stat label="Money Sent" value={formatINR(totalSent)} tone="indigo" sub="Principal — not profit" />
            <Stat label="Commission Earned" value={formatINR(commission)} tone="green" />
            <Stat label="MT Profit" value={formatINR(profit)} tone="purple" sub="Commission − MT expenses" />
          </div>
        </div>
      )}

      {tab === 'transactions' && (
        <div>
          <Card title="Transfers">
            {transfers.length === 0 ? (
              <Empty text="No transfers yet." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Receiver</th><th>Mobile</th><th className="num">Amount</th><th className="num">Commission</th><th>Method</th><th>Status</th><th>Ref</th><th></th></tr></thead>
                  <tbody>
                    {pageTransfers.map((tr) => (
                      <tr key={tr.id}>
                        <td>{formatDate(tr.date)}</td>
                        <td>{tr.receiverName}</td>
                        <td>{tr.mobile}</td>
                        <td className="num">{formatINR(tr.amountPaise)}</td>
                        <td className="num">{formatINR(tr.commissionPaise)}</td>
                        <td>{tr.method.toUpperCase()}</td>
                        <td><span className={`pill ${statusPill(tr.status)}`}>{tr.status}</span></td>
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
                <Pager total={transfers.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
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
        </div>
      )}

      {tab === 'settlement' && (
        <Card title="Daily Settlement — Closing = Starting + Funds Received − Sent − Expenses">
          <p>
            Closing Cash: <strong>{formatINR(todayClosing.cash)}</strong> &nbsp;•&nbsp; Closing UPI:{' '}
            <strong>{formatINR(todayClosing.upi)}</strong> &nbsp;•&nbsp; Total MT balance:{' '}
            <strong>{formatINR(todayClosing.total)}</strong>
          </p>
          <p style={{ color: 'var(--muted)' }}>
            Count the actual cash/UPI in hand and compare with these figures. If they differ, use
            the Difference tab here or the Difference Finder — it only suggests, it never changes entries.
          </p>
          <div className="grid grid-3" style={{ marginTop: 12 }}>
            <Stat label="Fund Received (all time)" value={formatINR(totalFund)} tone="blue" />
            <Stat label="Money Sent (all time)" value={formatINR(totalSent)} tone="indigo" />
            <Stat label="MT Profit (all time)" value={formatINR(profit)} tone="purple" />
          </div>
          <div className="btn-row">
            <Btn kind="secondary" onClick={() => setTab('difference')}>Check Difference →</Btn>
            <Btn kind="secondary" onClick={() => ctx.go?.('difference')}>Open Difference Finder</Btn>
          </div>
        </Card>
      )}

      {tab === 'difference' && (
        <Card title="MT Reconciliation — expected vs recorded">
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>
            Enter the MT balance you counted by hand. The app compares it with the recorded
            balance and suggests possible causes. It never changes any entry.
          </p>
          <div className="form-row">
            <Field label="Expected MT Balance (₹) — counted by hand">
              <input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="e.g. 25000" />
            </Field>
            <Field label="App Recorded Balance">
              <input className="input" value={formatINR(closing.total)} readOnly />
            </Field>
          </div>
          <Btn onClick={findRecon}>Find Possible Causes</Btn>
          {recon && (
            <div style={{ marginTop: 14 }}>
              <p>Difference: <strong style={{ color: recon.diff === 0 ? 'var(--accent-2)' : 'var(--danger)' }}>{formatINR(recon.diff)}</strong></p>
              {recon.diff === 0 ? (
                <p className="success">MT hisab matches — no difference. Good!</p>
              ) : recon.matches.length === 0 ? (
                <p>Possible causes: a missed or duplicated fund receipt, transfer or expense; a wrong amount or Cash/UPI method; commission counted as principal.</p>
              ) : (
                <div>
                  <h3>Possible Matches</h3>
                  <ul>{recon.matches.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {form && (
        <Modal title={form === 'fund' ? 'Add Fund From Brother' : form === 'transfer' ? 'New Money Transfer' : 'MT Other Expense'} onClose={reset}>
          {form === 'transfer' && (
            <div className="form-row">
              <Field label="Receiver Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Receiver Mobile"><input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" /></Field>
            </div>
          )}
          {form === 'expense' && (
            <Field label="Expense Category">
              <select className="input" value={expCat} onChange={(e) => setExpCat(e.target.value as (typeof MT_EXPENSE_CATEGORIES)[number])}>
                {MT_EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}
          <div className="form-row">
            <Field label="Amount (₹)"><AmountInput valuePaise={amount} onChange={setAmount} /></Field>
            {form === 'transfer' && (
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
            {form === 'transfer' && (
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
