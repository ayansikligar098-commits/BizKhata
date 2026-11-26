'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { formatINR } from '@/lib/money';
import { agentPayablePaise, balancesPaise, buildDailyRows, dailyBusinessSummary, mtClosingPaise, mtProfitPaise, netProfitPaise, serviceProfitPaise, totalCustomerDuePaise } from '@/lib/accounting';
import { CATEGORIES, MT_EXPENSE_CATEGORIES } from '@/lib/categories';
import { auditEntry, exportBackup, exportCSV } from '@/lib/store';
import { t, LANG_OPTIONS } from '@/lib/i18n';
import type { Lang, Theme } from '@/lib/types';
import { SUPPORTED_LANGUAGES, type AiLangCode } from '@/lib/languages';
import { clearAiServiceKey, getAiServiceEndpoint, hasAiServiceKey, setAiServiceEndpoint, setAiServiceKey } from '@/lib/conversation-ai';
import { todayISO } from '@/lib/types';
import { BarChart, Btn, Card, Empty, Field, Pager, Stat, formatDate, pageSlice, type Ctx } from './ui';
import { jobServices } from '@/lib/routes';

/* ================= Reports (page 23) ================= */

export function ReportsView({ ctx, tab: tabProp }: { ctx: Ctx; tab?: 'business' | 'service' | 'customer' | 'agent' | 'mt' | 'expenses' | 'daily' }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const [period, setPeriod] = React.useState<'today' | 'week' | 'month' | 'year' | 'all'>('month');
  const [tab, setTab] = React.useState<'business' | 'service' | 'customer' | 'agent' | 'mt' | 'expenses' | 'daily'>(tabProp || 'business');
  const [dailyPage, setDailyPage] = React.useState(1);
  const router = useRouter();

  // Route-driven tab: /reports/<type> opens this tab.
  React.useEffect(() => { if (tabProp) setTab(tabProp); }, [tabProp]);

  function selectTab(k: typeof tab) {
    setTab(k);
    // Business / Service-wise / Expenses / Daily Business have their own
    // URLs; Customer, Agent and Money Transfer tabs live on /reports.
    const path = k === 'business' ? '/reports' : k === 'service' ? '/reports/service-wise' : k === 'expenses' ? '/reports/expenses' : k === 'daily' ? '/reports/daily-business' : null;
    if (path) router.push(path);
  }
  const jobs = state.jobs.filter((j) => j.profileId === pid);
  const expenses = state.expenses.filter((e) => e.profileId === pid);
  const txns = state.cashTxns.filter((x) => x.profileId === pid);
  const mtT = state.mtTransfers.filter((m) => m.profileId === pid);
  const mtE = state.mtExpenses.filter((m) => m.profileId === pid);
  const mtF = state.mtFunds.filter((m) => m.profileId === pid);
  const agents = state.agents.filter((a) => a.profileId === pid);
  const today = todayISO();

  const inRange = (d: string) => {
    if (period === 'all') return true;
    if (period === 'today') return d === today;
    if (period === 'week') return d >= new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    if (period === 'month') return d.slice(0, 7) === today.slice(0, 7);
    return d.slice(0, 4) === today.slice(0, 4);
  };
  // Daily Business summary for the selected period (same derivation as
  // the /daily-business hub — one transaction counted exactly once).
  const dailyRange = period === 'all'
    ? { start: '0000-01-01', end: today }
    : period === 'today'
      ? { start: today, end: today }
      : period === 'week'
        ? { start: new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10), end: today }
        : period === 'month'
          ? { start: today.slice(0, 7) + '-01', end: today }
          : { start: today.slice(0, 4) + '-01-01', end: today };
  const dailySummary = dailyBusinessSummary({
    start: dailyRange.start, end: dailyRange.end,
    jobs, cashTxns: txns, dailyEntries: state.dailyEntries.filter((e) => e.profileId === pid),
    expenses, mtTransfers: mtT, mtExpenses: mtE,
  });
  const dailyRows = buildDailyRows({
    start: dailyRange.start, end: dailyRange.end,
    jobs, cashTxns: txns, dailyEntries: state.dailyEntries.filter((e) => e.profileId === pid),
    expenses, mtTransfers: mtT, mtExpenses: mtE,
  });
  const dailyPageRows = pageSlice(dailyRows, dailyPage, 8);
  React.useEffect(() => { setDailyPage(1); }, [period]);
  const pj = jobs.filter((j) => inRange(j.date));
  const pe = expenses.filter((e) => inRange(e.date));
  const pmt = mtT.filter((m) => inRange(m.date));
  const pmte = mtE.filter((m) => inRange(m.date));
  const bal = balancesPaise(profile.openingCashPaise, profile.openingUpiPaise, txns);
  const profit = netProfitPaise(pj, pe, pmt, pmte);
  const mtClose = mtClosingPaise(0, 0, mtF, mtT, mtE);
  const received = pj.reduce((s, j) => s + j.receivedPaise, 0);
  const expTotal = pe.reduce((s, e) => s + e.amountPaise, 0);
  const due = totalCustomerDuePaise(jobs);
  const payable = agents.reduce((s, a) => s + agentPayablePaise(a, jobs), 0);

  const byService = new Map<string, { received: number; profit: number }>();
  for (const j of pj) {
    const p = serviceProfitPaise(j.service, pj, pe);
    byService.set(j.service, { received: (byService.get(j.service)?.received || 0) + j.receivedPaise, profit: p.profit });
  }
  const byCategory = new Map<string, number>();
  for (const e of pe) byCategory.set(e.category, (byCategory.get(e.category) || 0) + e.amountPaise);

  // Income vs Expenses bar chart: last 7 days, real cash-book data.
  const barData: { label: string; value: number; valueLabel: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const v = txns.filter((x) => x.date === iso && x.kind === 'in').reduce((s, x) => s + x.amountPaise, 0);
    barData.push({ label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: v, valueLabel: formatINR(v) });
  }

  const exportServiceCSV = () => exportCSV(`bizkhata-report-${period}.csv`,
    ['Service', 'Received (Rs)', 'Profit (Rs)'],
    [...byService.entries()].map(([s, v]) => [s, (v.received / 100).toFixed(2), (v.profit / 100).toFixed(2)]));

  const reportRows: { title: string; sub: string; action: () => void; actionLabel: string }[] = [
    { title: 'Income Report', sub: 'All money received in this period', action: () => exportCSV(`bizkhata-income-${period}.csv`, ['Date', 'Category', 'Method', 'Amount (Rs)'], txns.filter((x) => inRange(x.date) && x.kind === 'in').map((x) => [x.date, x.category, x.method, (x.amountPaise / 100).toFixed(2)])), actionLabel: 'Export CSV' },
    { title: 'Expense Report', sub: 'All shop expenses in this period', action: () => exportCSV(`bizkhata-expense-${period}.csv`, ['Date', 'Category', 'Service', 'Amount (Rs)'], pe.map((e) => [e.date, e.category, e.service, (e.amountPaise / 100).toFixed(2)])), actionLabel: 'Export CSV' },
    { title: 'Profit Report', sub: 'Service-wise received vs profit', action: exportServiceCSV, actionLabel: 'Export CSV' },
    { title: 'Cash & UPI Report', sub: 'Balances and all transactions', action: () => exportCSV(`bizkhata-transactions-${period}.csv`, ['Date', 'Type', 'Category', 'Method', 'Amount (Rs)', 'Note'], txns.filter((x) => inRange(x.date)).map((x) => [x.date, x.kind, x.category, x.method, (x.amountPaise / 100).toFixed(2), x.note])), actionLabel: 'Export CSV' },
    { title: 'Money Transfer Report', sub: 'Transfers, commission and MT balance', action: () => exportCSV(`bizkhata-mt-${period}.csv`, ['Date', 'Receiver', 'Amount (Rs)', 'Commission (Rs)', 'Method', 'Status'], pmt.map((m) => [m.date, m.receiverName, (m.amountPaise / 100).toFixed(2), (m.commissionPaise / 100).toFixed(2), m.method, m.status])), actionLabel: 'Export CSV' },
    { title: 'Customer Due Report', sub: 'Who owes what, per customer', action: () => exportCSV(`bizkhata-due-${period}.csv`, ['Customer', 'Service', 'Due (Rs)'], jobs.filter((j) => j.totalPaise - j.receivedPaise > 0).map((j) => [j.customerName, j.service, ((j.totalPaise - j.receivedPaise) / 100).toFixed(2)])), actionLabel: 'Export CSV' },
    { title: 'Daily Business Report', sub: 'Combined daily collection, expenses and earnings — quick entries, jobs and MT commission together', action: () => selectTab('daily'), actionLabel: 'Open →' },
  ];

  return (
    <div>
      <div className="page-head">
        <div className="pills">
          {(['today', 'week', 'month', 'year', 'all'] as const).map((p) => (
            <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>
              {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : 'All Time'}
            </button>
          ))}
        </div>
        <div className="btn-row" style={{ marginTop: 0 }}>
          <Btn kind="secondary" onClick={() => window.print()}>Export PDF / Print</Btn>
          <Btn kind="secondary" onClick={exportServiceCSV}>Export CSV</Btn>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {([['business', 'Business'], ['daily', 'Daily Business'], ['service', 'Service-wise'], ['customer', 'Customer'], ['agent', 'Agent'], ['mt', 'Money Transfer'], ['expenses', 'Expenses']] as const).map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => selectTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'business' && (
        <div>
          <Card title="Business Summary">
            <div className="grid grid-4">
              <Stat label="Income Received" value={formatINR(received)} tone="green" />
              <Stat label="Expenses" value={formatINR(expTotal)} tone="red" />
              <Stat label="Net Profit" value={formatINR(profit)} tone="purple" />
              <Stat label="Cash Balance" value={formatINR(bal.cash)} tone="blue" />
              <Stat label="UPI Balance" value={formatINR(bal.upi)} tone="indigo" />
              <Stat label="Customer Due" value={formatINR(due)} tone="orange" />
              <Stat label="Agent Payable" value={formatINR(payable)} tone="pink" />
              <Stat label="MT Profit" value={formatINR(mtProfitPaise(pmt, pmte))} tone="purple" sub={`MT balance ${formatINR(mtClose.total)}`} />
            </div>
          </Card>
          <Card title="Income vs Expenses — last 7 days">
            {txns.length === 0 ? <Empty text="No transactions yet — the chart fills in as you record income and expenses." /> : <BarChart data={barData} />}
          </Card>
          <Card title="Available Reports">
            {reportRows.map((r) => (
              <button key={r.title} className="report-row" onClick={r.action}>
                <span className="row-ico">▦</span>
                <span><span className="report-title">{r.title}</span><br /><span className="report-sub">{r.sub}</span></span>
                <span className="report-chev">{r.actionLabel} ›</span>
              </button>
            ))}
          </Card>
        </div>
      )}

      {tab === 'daily' && (
        <div>
          <Card title={`Daily Business Report — ${period === 'today' ? `Today (${formatDate(today)})` : period === 'week' ? 'This Week' : period === 'month' ? 'This Month' : period === 'year' ? 'This Year' : 'All Time'}`}>
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>
              Combined daily, weekly, monthly and yearly business — quick entries, job payments,
              Money Transfer commission and expenses together. One transaction is counted once;
              MT principal is never income; due is never collection.
            </p>
            <div className="grid grid-4">
              <Stat label="Total Collection" value={formatINR(dailySummary.totalCollection)} tone="green" sub={`Cash ${formatINR(dailySummary.cashCollection)} • UPI ${formatINR(dailySummary.upiCollection)} • MT commission ${formatINR(dailySummary.mtCommission)}`} />
              <Stat label="Expenses" value={formatINR(dailySummary.expenses)} tone="red" sub={`Shop ${formatINR(dailySummary.shopExpenses)} • MT ${formatINR(dailySummary.mtExpensesTotal)}`} />
              <Stat label="Net Earnings" value={formatINR(dailySummary.netEarnings)} tone="purple" />
              <Stat label="Customer Due" value={formatINR(dailySummary.customerDue)} tone="orange" sub="Not collected yet" />
              <Stat label="Cash Collection" value={formatINR(dailySummary.cashCollection)} tone="blue" />
              <Stat label="UPI Collection" value={formatINR(dailySummary.upiCollection)} tone="indigo" />
              <Stat label="MT Commission" value={formatINR(dailySummary.mtCommission)} tone="green" sub="Principal excluded" />
              <Stat label="Total Transactions" value={String(dailySummary.totalTransactions)} tone="pink" />
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <Btn kind="secondary" onClick={() => exportCSV(
                `bizkhata-daily-business-${period}.csv`,
                ['Date', 'Time', 'Service', 'Details', 'Method', 'Amount (Rs)', 'Collected'],
                dailyRows.map((r) => [r.date, r.time, r.service, r.label, r.method, (r.amountPaise / 100).toFixed(2), r.collected ? 'Yes' : 'No — due']),
              )}>Export Daily Report (CSV)</Btn>
              <Btn kind="secondary" onClick={() => ctx.go?.('daily')}>Open Daily Business →</Btn>
            </div>
          </Card>
          <Card title="Service-wise Collection">
            {dailySummary.byService.length === 0 ? (
              <Empty text="No business in this period yet." />
            ) : (
              <div>
                <BarChart data={dailySummary.byService.filter((s) => s.collection > 0).map((s) => ({ label: s.service, value: s.collection, valueLabel: formatINR(s.collection) }))} />
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead><tr><th>Service</th><th className="num">Collection</th><th className="num">Cash</th><th className="num">UPI</th><th className="num">Due</th><th className="num">Direct Exp.</th><th className="num">Txns</th></tr></thead>
                    <tbody>
                      {dailySummary.byService.map((s) => (
                        <tr key={s.service}>
                          <td>{s.service}</td>
                          <td className="num"><strong>{formatINR(s.collection)}</strong></td>
                          <td className="num">{formatINR(s.cash)}</td>
                          <td className="num">{formatINR(s.upi)}</td>
                          <td className="num">{formatINR(s.due)}</td>
                          <td className="num">{formatINR(s.directExpenses)}</td>
                          <td className="num">{s.transactions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
          <Card title="Entries in this period">
            {dailyRows.length === 0 ? (
              <Empty text="No entries in this period yet." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Service</th><th>Details</th><th>Method</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {dailyPageRows.map((r) => (
                      <tr key={`${r.kind}-${r.id}`}>
                        <td>{formatDate(r.date)}{r.time ? ` ${r.time}` : ''}</td>
                        <td>{r.service}</td>
                        <td>
                          {r.label}
                          {r.kind === 'mt' && r.principalPaise !== undefined ? ` — sent ${formatINR(r.principalPaise)} (principal, not income)` : ''}
                          {!r.collected && r.kind === 'quick' ? ' — Due, not collected' : ''}
                        </td>
                        <td>{r.method.toUpperCase()}</td>
                        <td className="num" style={{ color: r.amountPaise < 0 ? 'var(--danger)' : '#007a5e' }}>
                          {r.amountPaise < 0 ? '−' : '+'} {formatINR(Math.abs(r.amountPaise))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pager total={dailyRows.length} page={dailyPage} pageSize={8} onPage={setDailyPage} />
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'service' && (
        <div>
          <Card title="Service-wise Profit">
            {byService.size === 0 ? <Empty text="No jobs in this period." /> : (
              <div>
                <BarChart data={[...byService.entries()].map(([s, v]) => ({ label: s, value: v.received, valueLabel: formatINR(v.received) }))} />
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead><tr><th>Service</th><th className="num">Received</th><th className="num">Profit</th></tr></thead>
                    <tbody>
                      {[...byService.entries()].map(([s, v]) => (
                        <tr key={s}><td>{s}</td><td className="num">{formatINR(v.received)}</td><td className="num">{formatINR(v.profit)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
          <Card title="Cash vs UPI">
            <p>Cash: <strong>{formatINR(bal.cash)}</strong></p>
            <p>UPI: <strong>{formatINR(bal.upi)}</strong></p>
            <p>Total in hand: <strong>{formatINR(bal.cash + bal.upi)}</strong></p>
            <p style={{ color: 'var(--muted)' }}>Money Transfer balance is separate: {formatINR(mtClose.total)} (cash {formatINR(mtClose.cash)}, UPI {formatINR(mtClose.upi)}).</p>
          </Card>
        </div>
      )}

      {tab === 'customer' && (
        <Card title="Pending Customer Payments">
          {jobs.filter((j) => j.totalPaise - j.receivedPaise > 0).length === 0 ? <Empty text="No pending payments." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Customer</th><th>Service</th><th className="num">Due</th></tr></thead>
                <tbody>
                  {jobs.filter((j) => j.totalPaise - j.receivedPaise > 0).map((j) => (
                    <tr key={j.id}><td>{j.customerName}</td><td>{j.service}</td><td className="num">{formatINR(j.totalPaise - j.receivedPaise)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'agent' && (
        <Card title="Agent Payables">
          {agents.length === 0 ? <Empty text="No agents." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Agent</th><th className="num">Payable</th></tr></thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id}><td>{a.name}</td><td className="num">{formatINR(agentPayablePaise(a, jobs))}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'mt' && (
        <Card title="Money Transfer Summary">
          <div className="grid grid-4">
            <Stat label="Fund Received" value={formatINR(mtF.reduce((s, f) => s + f.amountPaise, 0))} tone="blue" />
            <Stat label="Money Sent" value={formatINR(mtT.filter((m) => m.status !== 'Failed').reduce((s, m) => s + m.amountPaise, 0))} tone="indigo" sub="Principal — not profit" />
            <Stat label="Commission" value={formatINR(mtT.filter((m) => m.status !== 'Failed').reduce((s, m) => s + m.commissionPaise, 0))} tone="green" />
            <Stat label="MT Profit" value={formatINR(mtProfitPaise(mtT, mtE))} tone="purple" sub={`MT balance ${formatINR(mtClose.total)}`} />
          </div>
        </Card>
      )}

      {tab === 'expenses' && (
        <Card title="Expenses by Category">
          {byCategory.size === 0 ? <Empty text="No expenses in this period." /> : (
            <div>
              <BarChart data={[...byCategory.entries()].map(([c, v]) => ({ label: c, value: v, valueLabel: formatINR(v) }))} />
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead><tr><th>Category</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {[...byCategory.entries()].map(([c, v]) => (
                      <tr key={c}><td>{c}</td><td className="num">{formatINR(v)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/* ================= Difference Finder (page 24) ================= */

const DF_SCOPES = ['Cash', 'UPI', 'Money Transfer', 'Service', 'General'] as const;
type DfScope = (typeof DF_SCOPES)[number];

export function DifferenceFinderView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const [scope, setScope] = React.useState<DfScope>('Cash');
  const [service, setService] = React.useState(jobServices(profile.services)[0] || 'Xerox');
  const [expected, setExpected] = React.useState('');
  const [result, setResult] = React.useState<{ recorded: number; diff: number; suggestions: { label: string; why: string; amount: number }[] } | null>(null);

  function recordedBalance(): number {
    const txns = state.cashTxns.filter((x) => x.profileId === pid);
    const bal = balancesPaise(profile.openingCashPaise, profile.openingUpiPaise, txns);
    if (scope === 'Cash') return bal.cash;
    if (scope === 'UPI') return bal.upi;
    if (scope === 'General') return bal.cash + bal.upi;
    if (scope === 'Money Transfer') {
      const c = mtClosingPaise(0, 0, state.mtFunds.filter((f) => f.profileId === pid), state.mtTransfers.filter((m) => m.profileId === pid), state.mtExpenses.filter((m) => m.profileId === pid));
      return c.total;
    }
    const jobs = state.jobs.filter((j) => j.profileId === pid && j.service === service);
    return jobs.reduce((s, j) => s + j.receivedPaise, 0);
  }

  function find() {
    const expPaise = Math.round(parseFloat(expected || '0') * 100);
    const recorded = recordedBalance();
    const diff = expPaise - recorded;
    const suggestions: { label: string; why: string; amount: number }[] = [];
    if (diff !== 0) {
      const abs = Math.abs(diff);
      const candidates: { label: string; why: string; amount: number }[] = [];
      if (scope === 'Money Transfer') {
        for (const tr of state.mtTransfers.filter((m) => m.profileId === pid)) {
          candidates.push({ label: `MT transfer to ${tr.receiverName} (${formatDate(tr.date)})`, why: 'A transfer of exactly this amount may have been missed, duplicated, or entered in the wrong mode.', amount: tr.amountPaise });
          candidates.push({ label: `MT commission on transfer to ${tr.receiverName}`, why: 'Commission may have been counted as principal, or missed.', amount: tr.commissionPaise });
        }
        for (const f of state.mtFunds.filter((m) => m.profileId === pid)) {
          candidates.push({ label: `Fund received from brother (${formatDate(f.date)})`, why: 'A fund receipt may have been missed or entered twice.', amount: f.amountPaise });
        }
      } else {
        for (const x of state.cashTxns.filter((t) => t.profileId === pid)) {
          if (scope === 'Cash' && x.method !== 'cash' && x.kind !== 'transfer') continue;
          if (scope === 'UPI' && x.method !== 'upi' && x.kind !== 'transfer') continue;
          candidates.push({ label: `${x.category} — ${x.note || x.kind} (${formatDate(x.date)})`, why: 'An entry of exactly this amount may be missing, duplicated, or in the wrong Cash/UPI book.', amount: x.amountPaise });
        }
        for (const j of state.jobs.filter((j) => j.profileId === pid)) {
          candidates.push({ label: `Job payment from ${j.customerName} — ${j.service}`, why: 'A received payment may not have been recorded in the Cash/UPI book.', amount: j.receivedPaise });
          candidates.push({ label: `Due from ${j.customerName} — ${j.service}`, why: 'Due money may have been wrongly counted as received cash.', amount: Math.max(0, j.totalPaise - j.receivedPaise) });
        }
      }
      for (const c of candidates) {
        if (c.amount === abs && c.amount > 0) suggestions.push(c);
      }
    }
    setResult({ recorded, diff, suggestions });
  }

  const recorded = recordedBalance();

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 14 }}>
        {DF_SCOPES.map((s) => (
          <button key={s} className={scope === s ? 'active' : ''} onClick={() => { setScope(s); setResult(null); }}>{s}</button>
        ))}
      </div>
      <div className="grid grid-2">
        <Card title={`${scope} Reconciliation`}>
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>
            Enter the balance you <strong>expect</strong> (counted cash/UPI in hand). The app compares it
            with the recorded balance and only <strong>suggests</strong> possible causes. It never
            changes any entry by itself — you correct entries manually, with an audit trail.
          </p>
          {scope === 'Service' && (
            <Field label="Service">
              <select className="input" value={service} onChange={(e) => setService(e.target.value)}>
                {jobServices(profile.services).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          )}
          <Field label="Expected Balance (₹) — counted by hand">
            <input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="e.g. 25000" />
          </Field>
          <div className="grid grid-3" style={{ marginTop: 8 }}>
            <Stat label="Expected (Actual)" value={expected ? formatINR(Math.round(parseFloat(expected) * 100)) : '—'} tone="blue" />
            <Stat label="App Recorded" value={formatINR(recorded)} tone="indigo" />
            <Stat label="Difference" value={result ? formatINR(result.diff) : '—'} tone={result && result.diff === 0 ? 'green' : 'red'} />
          </div>
          <Btn onClick={find}>Find Possible Causes</Btn>
          {result && result.diff === 0 && <p className="success" style={{ marginTop: 12 }}>Hisab matches — no difference. Good!</p>}
        </Card>
        <Card title="Possible Matches">
          {!result ? (
            <Empty text="Run the check to see possible causes here." />
          ) : result.diff === 0 ? (
            <p className="success">No difference to investigate.</p>
          ) : result.suggestions.length === 0 ? (
            <ul>
              <li><strong>Unmatched entry</strong> — a payment or expense not recorded</li>
              <li><strong>Duplicate entry</strong> — same transaction recorded twice</li>
              <li><strong>Incorrect amount</strong> — wrong amount, wrong mode (Cash vs UPI), or wrong date</li>
              <li><strong>Wrong opening balance</strong></li>
              <li><strong>Cash/UPI mismatch</strong> — money recorded in the wrong book</li>
            </ul>
          ) : (
            <ul>
              {result.suggestions.map((s, i) => (
                <li key={i}><strong>{s.label}</strong> — {formatINR(s.amount)}. {s.why}</li>
              ))}
            </ul>
          )}
          {result && result.diff !== 0 && (
            <p style={{ color: 'var(--muted)' }}>Fix entries manually from the Cash Book / UPI Book / Money Transfer pages. Every change is written to the Audit Log.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ================= Recycle Bin (page 25) ================= */

export function RecycleBinView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const items = state.recycle.filter((r) => r.profileId === profile.id)
    .filter((r) => !search || r.label.toLowerCase().includes(search.toLowerCase()) || r.kind.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
  const pageItems = pageSlice(items, page, 8);
  React.useEffect(() => { setPage(1); }, [search]);

  function restore(item: (typeof items)[number]) {
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(item.data) as Record<string, unknown>; } catch { /* ignore */ }
    ctx.mutate((s) => {
      if (item.kind === 'Job') s.jobs.push(data as never);
      else if (item.kind === 'CashTxn') s.cashTxns.push(data as never);
      else if (item.kind === 'Customer') s.customers.push(data as never);
      else if (item.kind === 'Expense') s.expenses.push(data as never);
      else if (item.kind === 'Receipt') s.receipts.push(data as never);
      else if (item.kind === 'MtTransfer') s.mtTransfers.push(data as never);
      else if (item.kind === 'DocFile') s.docs.push(data as never);
      else if (item.kind === 'DailyEntry') {
        // A deleted quick entry was recycled together with the CashTxn(s)
        // and Expense it wrote, so restoring it restores all three —
        // the books stay consistent (one transaction, counted once).
        const bundle = data as { entry?: unknown; cashTxns?: unknown[]; expense?: unknown };
        if (bundle.entry) s.dailyEntries.push(bundle.entry as never);
        for (const t of bundle.cashTxns || []) s.cashTxns.push(t as never);
        if (bundle.expense) s.expenses.push(bundle.expense as never);
      }
      s.recycle = s.recycle.filter((x) => x.id !== item.id);
    }, [auditEntry(profile.id, 'restore', item.kind, String(data.id || ''), '', `Restored ${item.label}`)]);
  }

  return (
    <Card title="Recycle Bin — restore deleted records">
      <Field label="Search deleted records">
        <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Record or type" />
      </Field>
      {items.length === 0 ? (
        <Empty text="Recycle Bin is empty. Deleted records go here first and can be restored." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Record</th><th>Type</th><th>Deleted</th><th></th></tr></thead>
            <tbody>
              {pageItems.map((it) => (
                <tr key={it.id}>
                  <td>{it.label}</td><td><span className="pill">{it.kind}</span></td><td>{formatDate(it.deletedAt)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Btn kind="secondary" onClick={() => restore(it)}>Restore</Btn>{' '}
                    <Btn kind="danger" onClick={() => {
                      if (!window.confirm('Permanently delete this record? This cannot be undone.')) return;
                      ctx.mutate((s) => { s.recycle = s.recycle.filter((x) => x.id !== it.id); },
                        [auditEntry(profile.id, 'permanent-delete', it.kind, it.id, it.label, '')]);
                    }}>Delete Forever</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager total={items.length} page={page} pageSize={8} onPage={setPage} />
        </div>
      )}
    </Card>
  );
}

/* ================= Audit Log (page 26) ================= */

export function AuditLogView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const [search, setSearch] = React.useState('');
  const [action, setAction] = React.useState('All');
  const [page, setPage] = React.useState(1);
  const entries = [...state.audit.filter((a) => a.profileId === profile.id)]
    .filter((a) => !search || a.entity.toLowerCase().includes(search.toLowerCase()) || a.newValue.toLowerCase().includes(search.toLowerCase()))
    .filter((a) => action === 'All' || a.action === action)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  const actions = [...new Set(state.audit.filter((a) => a.profileId === profile.id).map((a) => a.action))];
  const pageEntries = pageSlice(entries, page, 10);
  React.useEffect(() => { setPage(1); }, [search, action]);

  return (
    <Card title="Audit Log — who changed what, and when">
      <div className="form-row">
        <Field label="Search">
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Record or new value" />
        </Field>
        <Field label="Action">
          <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="All">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
      </div>
      {entries.length === 0 ? (
        <Empty text="No changes recorded yet. Every create, edit, delete and restore is logged here with old and new values." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Action</th><th>Record</th><th>Old Value</th><th>New Value</th></tr></thead>
            <tbody>
              {pageEntries.map((a) => (
                <tr key={a.id}>
                  <td>{formatDate(a.at)}</td><td><span className="pill">{a.action}</span></td><td>{a.entity}</td>
                  <td>{a.oldValue || '—'}</td><td>{a.newValue || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager total={entries.length} page={page} pageSize={10} onPage={setPage} />
        </div>
      )}
    </Card>
  );
}

/* ================= Customization Studio (page 27) ================= */

export function CustomizationView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const [service, setService] = React.useState('');
  const [expCat, setExpCat] = React.useState('');
  const [renameTarget, setRenameTarget] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const [msg, setMsg] = React.useState('');
  const lang = profile.language;

  const modules = [
    { key: 'moneyTransfer', label: t(lang, 'moneyTransfer') },
    { key: 'agents', label: t(lang, 'agents') },
    { key: 'maintenance', label: t(lang, 'maintenance') },
    { key: 'receipts', label: t(lang, 'receipts') },
    { key: 'reports', label: t(lang, 'reports') },
    { key: 'differenceFinder', label: t(lang, 'differenceFinder') },
  ];
  const cards = [
    { key: 'todayIncome', label: t(lang, 'todayIncome') },
    { key: 'todayExpenses', label: t(lang, 'todayExpenses') },
    { key: 'netProfit', label: t(lang, 'netProfit') },
    { key: 'cashBalance', label: t(lang, 'cashBalance') },
    { key: 'upiBalance', label: t(lang, 'upiBalance') },
    { key: 'customerDue', label: t(lang, 'customerDue') },
    { key: 'agentPayable', label: t(lang, 'agentPayable') },
    { key: 'cashVsUpi', label: t(lang, 'cashVsUpi') },
  ];

  function update(patch: Partial<typeof profile>) {
    ctx.mutate((s) => {
      const p = s.profiles.find((x) => x.id === profile.id);
      if (p) Object.assign(p, patch);
    }, [auditEntry(profile.id, 'update', 'BusinessProfile', profile.id, '', 'Customization updated')]);
  }

  function restoreDefaults() {
    const cat = CATEGORIES.find((c) => c.name === profile.category);
    if (!cat) return;
    update({
      services: cat.services, customServices: [], expenseCategories: cat.expenseCategories,
      customExpenseCategories: [], disabledModules: [], hiddenCards: [],
    });
  }

  /** Rename a service everywhere it is used (jobs, quick daily entries,
   *  expenses, receipts) so history stays consistent — a rename never
   *  orphans or duplicates past transactions. */
  function renameService(oldName: string, newName: string) {
    const name = newName.trim();
    if (!name || name === oldName) { setRenameTarget(null); return; }
    if (profile.services.includes(name)) { setMsg(`A service named "${name}" already exists.`); return; }
    ctx.mutate((s) => {
      const p = s.profiles.find((x) => x.id === profile.id);
      if (!p) return;
      p.services = p.services.map((x) => (x === oldName ? name : x));
      p.customServices = p.customServices.map((x) => (x === oldName ? name : x));
      for (const j of s.jobs) if (j.profileId === profile.id && j.service === oldName) j.service = name;
      for (const e of s.dailyEntries) if (e.profileId === profile.id && e.service === oldName) e.service = name;
      for (const e of s.expenses) if (e.profileId === profile.id && e.service === oldName) e.service = name;
      for (const r of s.receipts) if (r.profileId === profile.id && r.service === oldName) r.service = name;
    }, [auditEntry(profile.id, 'update', 'BusinessProfile', profile.id, `Service ${oldName}`, `Service renamed to ${name}`)]);
    setRenameTarget(null);
    setMsg(`Service renamed to "${name}" — jobs, entries, expenses and receipts updated.`);
  }

  /** Remove an owner-added service. Built-in services cannot be removed.
   *  A service in use by jobs, entries or expenses cannot be removed —
   *  rename it instead, so no history is lost. */
  function removeService(name: string) {
    if (!profile.customServices.includes(name)) { setMsg(`"${name}" is a built-in service and cannot be removed. You can hide its module instead.`); return; }
    const pid = profile.id;
    const inUse =
      state.jobs.some((j) => j.profileId === pid && j.service === name) ||
      state.dailyEntries.some((e) => e.profileId === pid && e.service === name) ||
      state.expenses.some((e) => e.profileId === pid && e.service === name);
    if (inUse) { setMsg(`Cannot remove "${name}" — it is used by jobs, daily entries or expenses. Rename it instead.`); return; }
    if (!window.confirm(`Remove the service "${name}"? It will no longer appear in service lists.`)) return;
    update({
      services: profile.services.filter((x) => x !== name),
      customServices: profile.customServices.filter((x) => x !== name),
    });
    setMsg(`Service "${name}" removed.`);
  }

  return (
    <div>
      <Card title="Customization Studio — per business profile">
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Changes here affect only this business profile, never the others, and never change
          past transactions.
        </p>
        <div className="grid grid-2">
          <div>
            <h3>Add a Service</h3>
            <div className="btn-row">
              <input className="input" value={service} onChange={(e) => setService(e.target.value)} placeholder="e.g. Lamination" style={{ flex: 1 }} />
              <Btn onClick={() => {
                if (!service.trim()) return;
                if (profile.services.includes(service.trim())) { setMsg(`A service named "${service.trim()}" already exists.`); return; }
                update({ services: [...profile.services, service.trim()], customServices: [...profile.customServices, service.trim()] });
                setService('');
                setMsg(`Service "${service.trim()}" added — it now appears in Daily Business, Services and job forms.`);
              }}>Add</Btn>
            </div>
            <p className="field-hint">Rename or remove your own services below. Built-in services can be renamed but not removed.</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
              {profile.services.map((s) => (
                <li key={s} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  {renameTarget === s ? (
                    <>
                      <input className="input" style={{ flex: 1, minWidth: 140 }} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
                      <Btn kind="secondary" onClick={() => renameService(s, renameValue)}>Save</Btn>
                      <Btn kind="ghost" onClick={() => setRenameTarget(null)}>Cancel</Btn>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, minWidth: 120 }}>{s}{profile.customServices.includes(s) ? ' (yours)' : ''}</span>
                      <Btn kind="ghost" onClick={() => { setRenameTarget(s); setRenameValue(s); setMsg(''); }}>Rename</Btn>
                      {profile.customServices.includes(s) && <Btn kind="ghost" onClick={() => removeService(s)}>Remove</Btn>}
                    </>
                  )}
                </li>
              ))}
            </ul>
            {msg && <p className="field-hint" style={{ marginTop: 8 }}>{msg}</p>}
            <h3 style={{ marginTop: 16 }}>Add an Expense Category</h3>
            <div className="btn-row">
              <input className="input" value={expCat} onChange={(e) => setExpCat(e.target.value)} placeholder="e.g. Tea" style={{ flex: 1 }} />
              <Btn onClick={() => {
                if (!expCat.trim()) return;
                update({ expenseCategories: [...profile.expenseCategories, expCat.trim()], customExpenseCategories: [...profile.customExpenseCategories, expCat.trim()] });
                setExpCat('');
              }}>Add</Btn>
            </div>
            <p>Categories: {profile.expenseCategories.join(', ')}</p>
          </div>
          <div>
            <h3>Show / Hide Modules</h3>
            {modules.map((m) => (
              <label key={m.key} style={{ display: 'block', marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={!profile.disabledModules.includes(m.key)}
                  onChange={() => {
                    const disabled = profile.disabledModules.includes(m.key)
                      ? profile.disabledModules.filter((x) => x !== m.key)
                      : [...profile.disabledModules, m.key];
                    update({ disabledModules: disabled });
                  }}
                /> {m.label}
              </label>
            ))}
            <h3 style={{ marginTop: 16 }}>Dashboard Cards</h3>
            {cards.map((c) => (
              <label key={c.key} style={{ display: 'block', marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={!profile.hiddenCards.includes(c.key)}
                  onChange={() => {
                    const hidden = profile.hiddenCards.includes(c.key)
                      ? profile.hiddenCards.filter((x) => x !== c.key)
                      : [...profile.hiddenCards, c.key];
                    update({ hiddenCards: hidden });
                  }}
                /> {c.label}
              </label>
            ))}
          </div>
        </div>
        <div className="btn-row">
          <Btn kind="secondary" onClick={restoreDefaults}>Restore Defaults</Btn>
        </div>
      </Card>
    </div>
  );
}

/* ================= Settings (page 28) ================= */

export function SettingsView({ ctx, section }: { ctx: Ctx; section?: string }) {
  const { state, profile } = ctx;
  const lang = profile.language;
  const [name, setName] = React.useState(profile.name);
  const [address, setAddress] = React.useState(profile.address);
  const [mobile, setMobile] = React.useState(profile.mobile);
  const [openingCash, setOpeningCash] = React.useState(String(profile.openingCashPaise / 100));
  const [openingUpi, setOpeningUpi] = React.useState(String(profile.openingUpiPaise / 100));
  const [msg, setMsg] = React.useState('');
  const [importError, setImportError] = React.useState('');
  // AI chat service (UPDATE 15): generic, unnamed. The key is stored
  // only on this device, never in the business profile, never in
  // backups/exports, never displayed. Without it the assistant still
  // handles accounts, entries and app help; general conversation needs it.
  const [aiKeyInput, setAiKeyInput] = React.useState('');
  const [aiKeySaved, setAiKeySaved] = React.useState(false);
  const [aiEndpointInput, setAiEndpointInput] = React.useState('');
  React.useEffect(() => {
    setAiKeySaved(hasAiServiceKey());
    setAiEndpointInput(getAiServiceEndpoint());
  }, []);

  // Deep link: /settings/<section> scrolls to that card.
  React.useEffect(() => {
    if (!section) return;
    const el = document.getElementById(`settings-${section}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [section]);

  function update(patch: Partial<typeof profile>, note = 'Settings updated') {
    ctx.mutate((s) => {
      const p = s.profiles.find((x) => x.id === profile.id);
      if (p) Object.assign(p, patch);
    }, [auditEntry(profile.id, 'update', 'BusinessProfile', profile.id, '', note)]);
    setMsg('Saved.');
    setTimeout(() => setMsg(''), 2000);
  }

  function saveBusiness() {
    update({
      name, address, mobile,
      openingCashPaise: Math.round(parseFloat(openingCash || '0') * 100),
      openingUpiPaise: Math.round(parseFloat(openingUpi || '0') * 100),
    }, 'Business information updated');
  }

  function importBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || typeof data !== 'object' || !Array.isArray(data.profiles)) throw new Error('bad file');
        ctx.mutate((s) => {
          Object.assign(s, data);
        }, [auditEntry(profile.id, 'import', 'Backup', '', '', 'Backup imported')]);
        setMsg('Backup imported.');
      } catch {
        setImportError('That file is not a valid BizKhata backup.');
      }
    };
    reader.readAsText(f);
    e.target.value = '';
  }

  return (
    <div>
      <Card>
        <div className="khata-head">
          <span className="avatar" style={{ width: 52, height: 52, fontSize: 19 }}>A</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>Ayan Sikligar</h2>
            <p className="page-sub" style={{ margin: 0 }}>Owner • {profile.name} • {profile.category}</p>
          </div>
          <Btn kind="secondary" onClick={() => ctx.go?.('customize')}>Customization Studio →</Btn>
        </div>
      </Card>

      <div className="grid grid-2">
        <div id="settings-profile"><Card title="Business Profiles">
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>Manage your businesses — up to 3 separate profiles.</p>
          <p><strong>{profile.name}</strong> — {profile.category}</p>
          <p className="field-hint">{state.profiles.map((p) => p.name).join(' • ')}</p>
          <Btn kind="secondary" onClick={() => ctx.go?.('customize')}>Manage Profiles</Btn>
        </Card></div>

        <div id="settings-business"><Card title="Business Information">
          <div className="form-row">
            <Field label="Business Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Mobile"><input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" /></Field>
          </div>
          <Field label="Address"><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          <div className="form-row">
            <Field label="Opening Cash Balance (₹)"><input className="input" type="number" step="0.01" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} /></Field>
            <Field label="Opening UPI Balance (₹)"><input className="input" type="number" step="0.01" value={openingUpi} onChange={(e) => setOpeningUpi(e.target.value)} /></Field>
          </div>
          <Btn onClick={saveBusiness}>Save Business Info</Btn>
          {msg && <p className="success">{msg}</p>}
        </Card></div>

        <div id="settings-language"><Card title={t(lang, 'language')}>
          <div className="lang-pick">
            {LANG_OPTIONS.map((o) => (
              <button key={o.code} onClick={() => update({ language: o.code as Lang }, `Language changed to ${o.label}`)}>
                {o.label} {profile.language === o.code ? '✓' : ''}
              </button>
            ))}
          </div>
          <Field label="AI Assistant language — 22 Indian languages + English (Auto-detect replies in your language)">
            <select
              className="input"
              value={profile.aiLanguage || 'auto'}
              onChange={(e) => update({ aiLanguage: e.target.value as AiLangCode | 'auto' }, `AI Assistant language changed to ${e.target.selectedOptions[0]?.text || e.target.value}`)}
              aria-label="AI Assistant language"
            >
              <option value="auto">Auto-detect (recommended) — replies in the language you write in</option>
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.name} — {l.nativeName}</option>
              ))}
            </select>
          </Field>
          <p className="muted" style={{ marginTop: 8 }}>The AI understands all 22 scheduled languages in native script and in Roman letters (Hinglish, Roman Gujarati, Roman Marathi…), including mixed-language sentences. You never have to pick a language before chatting.</p>
        </Card></div>

        <div id="settings-ai-chat"><Card title="AI Chat">
          <p className="muted" style={{ marginTop: 0 }}>General conversation (jokes, ideas, explanations, everyday help) uses the AI chat service. Accounts questions, entries and app help work without it. The key stays only on this device — it is never shown, never saved in your business profile, and never included in backups.</p>
          <Field label="AI chat service address (optional)">
            <input className="input" value={aiEndpointInput} onChange={(e) => setAiEndpointInput(e.target.value)} placeholder="https://…" inputMode="url" autoComplete="off" />
          </Field>
          <Field label={aiKeySaved ? 'AI chat key — saved ✓ (type a new key to replace it)' : 'AI chat key (optional)'}>
            <input className="input" type="password" value={aiKeyInput} onChange={(e) => setAiKeyInput(e.target.value)} placeholder="Paste your key here — it is never displayed again" autoComplete="off" />
          </Field>
          <div className="btn-row">
            <Btn onClick={() => {
              setAiServiceEndpoint(aiEndpointInput);
              if (aiKeyInput.trim()) { setAiServiceKey(aiKeyInput); setAiKeyInput(''); }
              setAiKeySaved(hasAiServiceKey());
              setMsg('AI chat settings saved.');
              setTimeout(() => setMsg(''), 2000);
            }}>Save AI Chat Settings</Btn>
            {aiKeySaved && <Btn kind="secondary" onClick={() => { clearAiServiceKey(); setAiKeySaved(false); setMsg('AI chat key removed.'); setTimeout(() => setMsg(''), 2000); }}>Remove Key</Btn>}
          </div>
          <p className="field-hint">Without a key, the assistant says so honestly and still handles everything about your accounts. No provider or service name is shown anywhere in the app.</p>
        </Card></div>

        <Card title={t(lang, 'theme')}>
          <div className="btn-row">
            {(['light', 'dark', 'system'] as Theme[]).map((th) => (
              <Btn key={th} kind={profile.theme === th ? 'primary' : 'secondary'} onClick={() => update({ theme: th }, `Theme ${th}`)}>
                {th === 'light' ? 'Light' : th === 'dark' ? 'Dark' : 'System'}
              </Btn>
            ))}
          </div>
        </Card>

        <div id="settings-receipt"><Card title="Receipt Settings">
          <Field label="Receipt Number Prefix">
            <input className="input" value={profile.receiptPrefix} onChange={(e) => update({ receiptPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BK' }, 'Receipt prefix changed')} />
          </Field>
          <p className="field-hint">Next receipt number: {profile.receiptPrefix}-{String(profile.receiptCounter + 1).padStart(4, '0')}</p>
          <div className="btn-row">
            <Btn kind="secondary" onClick={() => ctx.go?.('receipt-generator')}>Open Receipt Generator</Btn>
          </div>
        </Card></div>

        <Card title="Service Settings">
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>Manage services &amp; rates for this profile.</p>
          <Btn kind="secondary" onClick={() => ctx.go?.('customize')}>Open Customization Studio</Btn>
        </Card>

        <Card title="Categories">
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>Income &amp; expense categories for this profile.</p>
          <p className="field-hint">{profile.expenseCategories.join(', ')}</p>
          <Btn kind="secondary" onClick={() => ctx.go?.('customize')}>Manage Categories</Btn>
        </Card>

        <Card title="BizKhata AI Assistant">
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>
            BizKhata AI Assistant is built in — ask it anything about your business in Hinglish,
            English or Hindi, add entries through chat, and get insights from your real records.
            It works on this device; nothing is sent anywhere and no key is needed.
          </p>
          <div className="btn-row">
            <Btn kind="secondary" onClick={() => ctx.go?.('chatbot')}>Open AI Assistant</Btn>
          </div>
        </Card>

        <Card title="Data & Backup">
          <div className="btn-row">
            <Btn onClick={() => exportBackup(state)}>Download Backup (JSON)</Btn>
            <label className="btn btn-secondary" style={{ display: 'inline-block', cursor: 'pointer' }}>
              Import Backup
              <input type="file" hidden accept=".json" onChange={importBackup} />
            </label>
            <Btn
              kind="danger"
              onClick={() => {
                if (!window.confirm('Erase ALL BizKhata data on this device? This cannot be undone. Download a backup first!')) return;
                if (!window.confirm('Really erase everything?')) return;
                window.localStorage.removeItem('bizkhata.v1');
                window.location.reload();
              }}
            >
              Erase All Data
            </Btn>
          </div>
          {importError && <p className="error">{importError}</p>}
        </Card>

        <div id="settings-security"><Card title="Security & Privacy">
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>
            App lock (mobile + PIN) protects this device. Data is local-first — nothing is
            uploaded anywhere.
          </p>
          <div className="btn-row">
            <Btn kind="secondary" onClick={() => ctx.go?.('audit')}>Audit Log →</Btn>
            <Btn kind="secondary" onClick={() => ctx.go?.('recycle')}>Recycle Bin →</Btn>
          </div>
        </Card></div>

        <Card title="About BizKhata">
          <p>BizKhata v1.0 — free business accounting for CSC Centers and small businesses.</p>
          <p>Local-first: your data stays on this device. Free hosting on Cloudflare Pages.</p>
          <p>Support: ask in the app — no subscription, no payment gateway in v1.</p>
        </Card>
      </div>
    </div>
  );
}
