'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { formatINR } from '@/lib/money';
import { buildDailyRows, dailyBusinessSummary, type DailyRow } from '@/lib/accounting';
import { OTHER_SERVICES } from '@/lib/categories';
import { jobServices } from '@/lib/routes';
import { auditEntry, exportCSV } from '@/lib/store';
import type { DailyEntry, DailyEntryMethod, Method } from '@/lib/types';
import { todayISO, uid } from '@/lib/types';
import { AmountInput, BarChart, Btn, Card, Empty, Field, Modal, Pager, Stat, formatDate, pageSlice, type Ctx } from './ui';

type Period = 'today' | 'week' | 'month' | 'year' | 'custom';

function periodRange(period: Exclude<Period, 'custom'>, today: string): { start: string; end: string } {
  if (period === 'today') return { start: today, end: today };
  if (period === 'week') {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - 6);
    return { start: d.toISOString().slice(0, 10), end: today };
  }
  if (period === 'month') return { start: today.slice(0, 7) + '-01', end: today };
  return { start: today.slice(0, 4) + '-01-01', end: today };
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const ROW_KIND_LABEL: Record<DailyRow['kind'], string> = {
  quick: 'Quick Entry',
  collection: 'Job / Cash Book',
  mt: 'Money Transfer',
  expense: 'Expense',
  'mt-expense': 'MT Expense',
};

/** The central Daily Business hub (replaces the old Daily Dhandha page).
 *  One page for the day's small work: collection, expenses, earnings,
 *  service-wise collection and recent entries — with a fast Add Entry.
 *  Everything is DERIVED from the real books (jobs + Cash/UPI book +
 *  quick entries + MT ledger) through dailyBusinessSummary, so one real
 *  transaction is counted exactly once. */
export function DailyBusinessView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const router = useRouter();
  const pid = profile.id;
  const today = todayISO();

  const [period, setPeriod] = React.useState<Period>('today');
  const [customFrom, setCustomFrom] = React.useState(today);
  const [customTo, setCustomTo] = React.useState(today);
  const [serviceFilter, setServiceFilter] = React.useState<string>('All');
  const [page, setPage] = React.useState(1);

  const range = period === 'custom'
    ? { start: customFrom <= customTo ? customFrom : customTo, end: customFrom <= customTo ? customTo : customFrom }
    : periodRange(period, today);

  const jobs = state.jobs.filter((j) => j.profileId === pid);
  const cashTxns = state.cashTxns.filter((x) => x.profileId === pid);
  const dailyEntries = state.dailyEntries.filter((e) => e.profileId === pid);
  const expenses = state.expenses.filter((e) => e.profileId === pid);
  const mtT = state.mtTransfers.filter((m) => m.profileId === pid);
  const mtE = state.mtExpenses.filter((m) => m.profileId === pid);

  const summary = dailyBusinessSummary({
    start: range.start, end: range.end, jobs, cashTxns, dailyEntries, expenses, mtTransfers: mtT, mtExpenses: mtE,
  });
  const allRows = buildDailyRows({
    start: range.start, end: range.end, jobs, cashTxns, dailyEntries, expenses, mtTransfers: mtT, mtExpenses: mtE,
  });
  const rows = serviceFilter === 'All' ? allRows : allRows.filter((r) => r.service === serviceFilter);
  const pageRows = pageSlice(rows, page, 8);
  React.useEffect(() => { setPage(1); }, [period, customFrom, customTo, serviceFilter]);

  const byService = serviceFilter === 'All'
    ? summary.byService
    : summary.byService.filter((s) => s.service === serviceFilter);

  // --- Quick Daily Entry form ---
  const [showForm, setShowForm] = React.useState(false);
  const [fDate, setFDate] = React.useState(today);
  const [fTime, setFTime] = React.useState(nowTime());
  const [fService, setFService] = React.useState('');
  const [fDesc, setFDesc] = React.useState('');
  const [fQty, setFQty] = React.useState(1);
  const [fRate, setFRate] = React.useState(0);
  const [fMethod, setFMethod] = React.useState<DailyEntryMethod>('cash');
  const [fExpense, setFExpense] = React.useState(0);
  const [fExpenseMethod, setFExpenseMethod] = React.useState<Method>('cash');
  const [fNotes, setFNotes] = React.useState('');
  const [fError, setFError] = React.useState('');

  const dailyServices = [...jobServices(profile.services), ...(profile.services.includes(OTHER_SERVICES) ? [] : [OTHER_SERVICES])];
  const formService = fService || dailyServices[0] || 'Xerox';
  const formTotal = Math.max(0, Math.floor(fQty) * fRate);

  function resetForm() {
    setFDate(today); setFTime(nowTime()); setFService(''); setFDesc('');
    setFQty(1); setFRate(0); setFMethod('cash'); setFExpense(0);
    setFExpenseMethod('cash'); setFNotes(''); setFError(''); setShowForm(false);
  }

  function submitEntry() {
    if (!fDesc.trim()) { setFError('Enter a short description (e.g. 10 pages B&W Xerox).'); return; }
    if (!Number.isInteger(fQty) || fQty < 1) { setFError('Quantity must be 1 or more.'); return; }
    if (fRate <= 0) { setFError('Enter the rate (more than 0).'); return; }
    if (formTotal <= 0) { setFError('Total must be more than 0.'); return; }
    if (fExpense < 0) { setFError('Direct expense cannot be negative.'); return; }
    const entry: DailyEntry = {
      id: uid('de'), profileId: pid, service: formService, description: fDesc.trim(),
      quantity: Math.floor(fQty), ratePaise: fRate, totalPaise: formTotal,
      method: fMethod, expensePaise: fExpense,
      expenseMethod: fExpenseMethod, date: fDate, time: fTime,
      notes: fNotes.trim(), createdAt: new Date().toISOString(),
    };
    const collected = fMethod !== 'other';
    ctx.mutate((s) => {
      s.dailyEntries.push(entry);
      // One real transaction = one CashTxn: collected money moves the
      // Cash/UPI balance exactly once, linked to this entry.
      if (collected) {
        s.cashTxns.push({
          id: uid('txn'), profileId: pid, kind: 'in', method: fMethod as Method,
          amountPaise: formTotal, category: `${formService} — ${entry.description}`,
          note: `Daily entry (${entry.id})`, date: fDate, dailyEntryId: entry.id,
          createdAt: new Date().toISOString(),
        });
      }
      // Direct expense: one Expense record + one 'out' CashTxn, linked.
      if (fExpense > 0) {
        const exId = uid('exp');
        s.expenses.push({
          id: exId, profileId: pid, category: 'Direct Expense', equipmentId: null,
          description: `Direct expense — ${entry.description}`, amountPaise: fExpense,
          method: fExpenseMethod, vendor: '', date: fDate, service: formService,
          notes: `Daily entry ${entry.id}`, dailyEntryId: entry.id,
          createdAt: new Date().toISOString(),
        });
        s.cashTxns.push({
          id: uid('txn'), profileId: pid, kind: 'out', method: fExpenseMethod,
          amountPaise: fExpense, category: 'Expense — Direct Expense',
          note: `Direct expense — ${entry.description}`, date: fDate,
          expenseId: exId, dailyEntryId: entry.id, createdAt: new Date().toISOString(),
        });
      }
    }, [auditEntry(pid, 'create', 'DailyEntry', entry.id, '', `${formService} — ${entry.description}: ${formatINR(formTotal)} (${fMethod}${fExpense > 0 ? `, expense ${formatINR(fExpense)}` : ''})`)]);
    resetForm();
  }

  function deleteEntry(entry: DailyEntry) {
    const linkedTxns = state.cashTxns.filter((x) => x.profileId === pid && x.dailyEntryId === entry.id);
    const linkedExpense = state.expenses.find((e) => e.profileId === pid && e.dailyEntryId === entry.id) || null;
    ctx.softDelete(
      'DailyEntry',
      `${entry.service} — ${entry.description} ${formatINR(entry.totalPaise)}`,
      { entry, cashTxns: linkedTxns, expense: linkedExpense },
      (s) => {
        s.dailyEntries = s.dailyEntries.filter((x) => x.id !== entry.id);
        s.cashTxns = s.cashTxns.filter((x) => x.dailyEntryId !== entry.id);
        if (linkedExpense) s.expenses = s.expenses.filter((x) => x.id !== linkedExpense.id);
      },
    );
  }

  function openService(service: string) {
    if (service === 'Money Transfer Commission' || service === 'Money Transfer') ctx.go?.('mt');
    else if (service === OTHER_SERVICES || service === 'General') ctx.go?.('cash');
    else ctx.goServiceFilter?.(service);
  }

  const rangeLabel = period === 'today'
    ? `Today — ${formatDate(today)}`
    : `${formatDate(range.start)} → ${formatDate(range.end)}`;

  return (
    <div>
      <div className="page-head">
        <div className="pills" role="tablist" aria-label="Period">
          {(['today', 'week', 'month', 'year'] as Period[]).map((p) => (
            <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>
              {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'This Year'}
            </button>
          ))}
          <button className={period === 'custom' ? 'active' : ''} onClick={() => setPeriod('custom')}>Custom</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="date-chip">📅 {rangeLabel}</span>
          <Btn onClick={() => setShowForm(true)}>+ Quick Entry</Btn>
          <Btn
            kind="secondary"
            onClick={() => exportCSV(
              `bizkhata-daily-business-${range.start}-to-${range.end}.csv`,
              ['Date', 'Time', 'Source', 'Service', 'Details', 'Method', 'Amount (Rs)', 'Collected'],
              rows.map((r) => [
                r.date, r.time, ROW_KIND_LABEL[r.kind], r.service,
                r.kind === 'quick' && r.quantity ? `${r.label} (${r.quantity} × ${(r.ratePaise || 0) / 100})` : r.label,
                r.method, (r.amountPaise / 100).toFixed(2),
                r.collected ? 'Yes' : 'No — due',
              ]),
            )}
          >
            Export CSV
          </Btn>
        </div>
      </div>

      {period === 'custom' && (
        <div className="form-row" style={{ maxWidth: 480 }}>
          <Field label="From date">
            <input className="input" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </Field>
          <Field label="To date">
            <input className="input" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </Field>
        </div>
      )}

      <p style={{ color: 'var(--muted)' }}>
        One page for the day&apos;s small work. Jobs, Money Transfer commission and expenses appear
        here automatically — one real transaction is counted exactly once. Due money is never
        counted as collection; only money actually received counts.
      </p>

      {/* summary cards */}
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Total Collection" value={formatINR(summary.totalCollection)} tone="green" icon="₹" sub={`Cash ${formatINR(summary.cashCollection)} • UPI ${formatINR(summary.upiCollection)} • MT commission ${formatINR(summary.mtCommission)}`} />
        <Stat label="Cash Collection" value={formatINR(summary.cashCollection)} tone="blue" icon="₹" />
        <Stat label="UPI Collection" value={formatINR(summary.upiCollection)} tone="indigo" icon="⌁" />
        <Stat label="Net Earnings" value={formatINR(summary.netEarnings)} tone="purple" icon="↗" sub="Collection − expenses − unpaid agent charges" />
      </div>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <Stat label="Expenses" value={formatINR(summary.expenses)} tone="red" icon="▤" sub={`Shop ${formatINR(summary.shopExpenses)} • MT ${formatINR(summary.mtExpensesTotal)}`} />
        <Stat label="Customer Due" value={formatINR(summary.customerDue)} tone="orange" icon="◉" sub={`Jobs ${formatINR(summary.jobDue)} • Quick entries ${formatINR(summary.quickEntryDue)} — not collected yet`} />
        <Stat label="Total Transactions" value={String(summary.totalTransactions)} tone="pink" icon="▦" sub={`${rows.length} shown in this period`} />
      </div>

      {/* service-wise collection */}
      <Card
        title="Service-wise Collection"
        right={
          <select className="input" style={{ minWidth: 170 }} value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} aria-label="Filter by service">
            <option value="All">All Services</option>
            {[...new Set([...dailyServices, 'Money Transfer Commission', OTHER_SERVICES])].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        }
      >
        {byService.length === 0 ? (
          <Empty text="No collection in this period yet. Add a quick entry, a job, or a Money Transfer." />
        ) : (
          <div>
            <BarChart data={byService.filter((s) => s.collection > 0).map((s) => ({ label: s.service, value: s.collection, valueLabel: formatINR(s.collection) }))} />
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>Service</th><th className="num">Collection</th><th className="num">Cash</th><th className="num">UPI</th><th className="num">Commission</th><th className="num">Due</th><th className="num">Direct Exp.</th><th className="num">Txns</th><th></th></tr></thead>
                <tbody>
                  {byService.map((s) => (
                    <tr key={s.service}>
                      <td><span className="cell-main">{s.service}</span></td>
                      <td className="num"><strong>{formatINR(s.collection)}</strong></td>
                      <td className="num">{formatINR(s.cash)}</td>
                      <td className="num">{formatINR(s.upi)}</td>
                      <td className="num">{formatINR(s.commission)}</td>
                      <td className="num" style={{ color: s.due > 0 ? 'var(--danger)' : undefined }}>{formatINR(s.due)}</td>
                      <td className="num">{formatINR(s.directExpenses)}</td>
                      <td className="num">{s.transactions}</td>
                      <td><Btn kind="ghost" onClick={() => openService(s.service)}>Open →</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="field-hint">
              Money Transfer shows commission only — the money sent (principal) is never income.
              Due is money billed but not received yet. Direct expenses are costs linked to the service.
            </p>
          </div>
        )}
      </Card>

      {/* recent entries */}
      <Card title="Recent Entries">
        {rows.length === 0 ? (
          <Empty text="No entries in this period yet. Use + Quick Entry for small daily work — Xerox, Printing, Scanning, Passport Photo and more." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date / Time</th><th>Source</th><th>Service</th><th>Details</th><th>Method</th><th className="num">Amount</th><th></th></tr></thead>
              <tbody>
                {pageRows.map((r) => {
                  const entry = r.kind === 'quick' ? dailyEntries.find((e) => e.id === r.id) : undefined;
                  const isOut = r.kind === 'expense' || r.kind === 'mt-expense';
                  return (
                    <tr key={`${r.kind}-${r.id}`}>
                      <td>{formatDate(r.date)}{r.time ? <><br /><span className="cell-sub">{r.time}</span></> : null}</td>
                      <td><span className="pill">{ROW_KIND_LABEL[r.kind]}</span></td>
                      <td>{r.service}</td>
                      <td>
                        <span className="cell-main">{r.label}</span>
                        {r.kind === 'quick' && r.quantity ? (
                          <><br /><span className="cell-sub">{r.quantity} × {formatINR(r.ratePaise || 0)}{(r.expensePaise || 0) > 0 ? ` • direct expense ${formatINR(r.expensePaise || 0)}` : ''}</span></>
                        ) : null}
                        {r.kind === 'mt' && r.principalPaise !== undefined ? (
                          <><br /><span className="cell-sub">Sent {formatINR(r.principalPaise)} — principal, not income</span></>
                        ) : null}
                        {r.detail ? <><br /><span className="cell-sub">{r.detail}</span></> : null}
                        {!r.collected && r.kind === 'quick' ? <><br /><span className="pill due">Due — not collected yet</span></> : null}
                      </td>
                      <td>{r.method.toUpperCase()}</td>
                      <td className="num" style={{ color: isOut ? 'var(--danger)' : '#007a5e' }}>
                        {isOut ? '−' : '+'} {formatINR(Math.abs(r.amountPaise))}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {entry && (
                          <Btn kind="ghost" onClick={() => {
                            if (!window.confirm('Move this entry to the Recycle Bin? Its Cash/UPI entry and direct expense go with it.')) return;
                            deleteEntry(entry);
                          }}>Delete</Btn>
                        )}
                        {r.link && <Btn kind="ghost" onClick={() => router.push(r.link!)}>Open →</Btn>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager total={rows.length} page={page} pageSize={8} onPage={setPage} />
          </div>
        )}
        <p className="field-hint">
          Need customer/job tracking for a service? Open its module: Services → PAN Card, Aadhaar,
          Voter ID, Ayushman, Xerox, Printing, Passport Size Photo, Scanning, Smart Card, Document
          Work — or Money Transfer for transfers. Anything added there appears here automatically.
        </p>
      </Card>

      {/* quick entry form */}
      {showForm && (
        <Modal title="Quick Daily Entry" onClose={resetForm}>
          <div className="form-row">
            <Field label="Date">
              <input className="input" type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </Field>
            <Field label="Time">
              <input className="input" type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} />
            </Field>
            <Field label="Service Category">
              <select className="input" value={formService} onChange={(e) => setFService(e.target.value)}>
                {dailyServices.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Description" hint="What was done — e.g. 10 pages B&W Xerox, 4 passport photos.">
            <input className="input" value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="e.g. 10 pages B&W Xerox" />
          </Field>
          <div className="form-row">
            <Field label="Quantity">
              <input className="input" type="number" min="1" step="1" value={fQty} onChange={(e) => setFQty(parseInt(e.target.value || '0', 10))} />
            </Field>
            <Field label="Rate (₹ per unit)">
              <AmountInput valuePaise={fRate} onChange={setFRate} />
            </Field>
            <Field label="Total Amount (₹)" hint="Quantity × Rate — calculated automatically.">
              <input className="input" value={formatINR(formTotal)} readOnly />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Payment Mode" hint="Other = money not collected yet (due). It will NOT count as collection.">
              <select className="input" value={fMethod} onChange={(e) => setFMethod(e.target.value as DailyEntryMethod)}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="other">Other / Due (not collected)</option>
              </select>
            </Field>
            <Field label="Direct Expense (₹) — if any" hint="Cost for this entry, e.g. paper/ink. Recorded once as an expense.">
              <AmountInput valuePaise={fExpense} onChange={setFExpense} />
            </Field>
            {fExpense > 0 && (
              <Field label="Expense paid by">
                <select className="input" value={fExpenseMethod} onChange={(e) => setFExpenseMethod(e.target.value as Method)}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                </select>
              </Field>
            )}
          </div>
          <Field label="Notes (optional)"><input className="input" value={fNotes} onChange={(e) => setFNotes(e.target.value)} /></Field>
          {fError && <p className="error">{fError}</p>}
          <div className="btn-row">
            <Btn onClick={submitEntry}>Save Entry</Btn>
            <Btn kind="secondary" onClick={resetForm}>Cancel</Btn>
          </div>
          <p className="field-hint">
            {fMethod === 'other'
              ? 'This entry will show as Due — it will not increase Cash/UPI until the money is actually received.'
              : `Saving adds ${formatINR(formTotal)} to ${fMethod === 'cash' ? 'Cash' : 'UPI'} once — visible here, in the ${fMethod === 'cash' ? 'Cash' : 'UPI'} Book and in Reports.`}
          </p>
        </Modal>
      )}
    </div>
  );
}
