'use client';
import React from 'react';
import { formatINR } from '@/lib/money';
import {
  agentPayablePaise,
  balancesPaise,
  mtProfitPaise,
  netProfitPaise,
  totalCustomerDuePaise,
} from '@/lib/accounting';
import { t } from '@/lib/i18n';
import type { Job } from '@/lib/types';
import { todayISO } from '@/lib/types';
import { Btn, Card, Empty, Stat, CHART_COLORS, DonutChart, LineChart, formatDate, initials, statusPill, type Ctx } from './ui';
import { getAIInsights } from '@/lib/ai';

type Period = 'today' | 'week' | 'month' | 'year';

function periodRange(period: Period, today: string): { start: string; end: string } {
  if (period === 'today') return { start: today, end: today };
  if (period === 'week') {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - 6);
    return { start: d.toISOString().slice(0, 10), end: today };
  }
  if (period === 'month') return { start: today.slice(0, 7) + '-01', end: today };
  return { start: today.slice(0, 4) + '-01-01', end: today };
}

function prevRange(period: Period, range: { start: string; end: string }): { start: string; end: string } {
  const days = Math.max(1, Math.round((new Date(`${range.end}T00:00:00`).getTime() - new Date(`${range.start}T00:00:00`).getTime()) / 864e5) + 1);
  const end = new Date(`${range.start}T00:00:00`);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function trendPct(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

const QUICK_SERVICES: { service: string; label: string; bg: string; fg: string }[] = [
  { service: 'PAN Card', label: 'New PAN', bg: '#e9eafe', fg: '#3d4fd7' },
  { service: 'Aadhaar Services', label: 'Aadhaar', bg: '#fff3e6', fg: '#b7791f' },
  { service: 'Voter ID', label: 'Voter ID', bg: '#e8f1fe', fg: '#0b5fa5' },
  { service: 'Ayushman Card', label: 'Ayushman', bg: '#e3f8f1', fg: '#007a5e' },
  { service: 'Xerox', label: 'Xerox', bg: '#fdeef6', fg: '#b02a6b' },
  { service: 'Printing', label: 'Printing', bg: '#f1eafe', fg: '#6c3fd4' },
  { service: 'Passport Size Photo', label: 'Passport Photo', bg: '#e8f6fd', fg: '#0b6fa5' },
  { service: 'Scanning', label: 'Scanning', bg: '#eef7e8', fg: '#4a7d0b' },
];

export function DashboardView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const jobs = state.jobs.filter((j) => j.profileId === pid);
  const txns = state.cashTxns.filter((x) => x.profileId === pid);
  const expenses = state.expenses.filter((e) => e.profileId === pid);
  const mtT = state.mtTransfers.filter((m) => m.profileId === pid);
  const mtE = state.mtExpenses.filter((m) => m.profileId === pid);
  const agents = state.agents.filter((a) => a.profileId === pid);
  const customers = state.customers.filter((c) => c.profileId === pid);

  const [period, setPeriod] = React.useState<Period>('today');
  const [chartRange, setChartRange] = React.useState<'7' | '30'>('7');
  const [donutRange, setDonutRange] = React.useState<'month' | 'all'>('month');

  const bal = balancesPaise(profile.openingCashPaise, profile.openingUpiPaise, txns);
  const today = todayISO();
  const range = periodRange(period, today);
  const prev = prevRange(period, range);
  const inRange = (d: string, r: { start: string; end: string }) => d >= r.start && d <= r.end;

  const pTxns = txns.filter((x) => inRange(x.date, range));
  const pTxnsPrev = txns.filter((x) => inRange(x.date, prev));
  const pIn = pTxns.filter((x) => x.kind === 'in').reduce((s, x) => s + x.amountPaise, 0);
  const pOut = pTxns.filter((x) => x.kind === 'out').reduce((s, x) => s + x.amountPaise, 0);
  const pInPrev = pTxnsPrev.filter((x) => x.kind === 'in').reduce((s, x) => s + x.amountPaise, 0);
  const pOutPrev = pTxnsPrev.filter((x) => x.kind === 'out').reduce((s, x) => s + x.amountPaise, 0);
  const pJobs = jobs.filter((j) => inRange(j.date, range));
  const pExp = expenses.filter((e) => inRange(e.date, range));
  const pMt = mtT.filter((m) => inRange(m.date, range));
  const pMtE = mtE.filter((m) => inRange(m.date, range));
  /** Quick daily entries collected in a range (Cash/UPI only — 'other'
   *  mode is credit, never income). Their direct expenses already sit in
   *  the Expense records, so they are deducted exactly once. */
  const entryCollectedIn = (r: { start: string; end: string }) =>
    state.dailyEntries
      .filter((e) => e.profileId === pid && e.method !== 'other' && inRange(e.date, r))
      .reduce((s, e) => s + e.totalPaise, 0);
  const profit = netProfitPaise(pJobs, pExp, pMt, pMtE) + entryCollectedIn(range);
  const profitPrev = netProfitPaise(
    jobs.filter((j) => inRange(j.date, prev)),
    expenses.filter((e) => inRange(e.date, prev)),
    mtT.filter((m) => inRange(m.date, prev)),
    mtE.filter((m) => inRange(m.date, prev)),
  ) + entryCollectedIn(prev);
  // Customer due: job dues + quick daily entries taken on credit ('other'
  // mode) — both are money not yet received, never collection.
  const quickDue = state.dailyEntries.filter((e) => e.profileId === pid && e.method === 'other').reduce((s, e) => s + e.totalPaise, 0);
  const due = totalCustomerDuePaise(jobs) + quickDue;
  const payable = agents.reduce((s, a) => s + agentPayablePaise(a, jobs), 0);
  const mtProfit = mtProfitPaise(mtT, mtE);
  const lang = profile.language;

  // --- Business Overview line chart: daily income vs expenses ---
  const chartDays = chartRange === '7' ? 7 : 30;
  const chartLabels: string[] = [];
  const chartIncome: number[] = [];
  const chartExpenses: number[] = [];
  for (let i = chartDays - 1; i >= 0; i--) {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    chartLabels.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
    chartIncome.push(txns.filter((x) => x.date === iso && x.kind === 'in').reduce((s, x) => s + x.amountPaise, 0) / 100);
    chartExpenses.push(txns.filter((x) => x.date === iso && x.kind === 'out').reduce((s, x) => s + x.amountPaise, 0) / 100);
  }

  // --- Service-wise income donut: jobs + quick daily entries + MT commission
  // (one transaction counted once — entries are Cash/UPI money, commission
  // is MT earnings, never the principal).
  const donutJobs = donutRange === 'month' ? jobs.filter((j) => j.date.slice(0, 7) === today.slice(0, 7)) : jobs;
  const donutEntries = (donutRange === 'month'
    ? state.dailyEntries.filter((e) => e.profileId === pid && e.date.slice(0, 7) === today.slice(0, 7))
    : state.dailyEntries.filter((e) => e.profileId === pid)
  ).filter((e) => e.method !== 'other');
  const donutMt = (donutRange === 'month'
    ? mtT.filter((m) => m.date.slice(0, 7) === today.slice(0, 7))
    : mtT
  ).filter((m) => m.status !== 'Failed');
  const byService = new Map<string, number>();
  for (const j of donutJobs) byService.set(j.service, (byService.get(j.service) || 0) + j.receivedPaise);
  for (const e of donutEntries) byService.set(e.service, (byService.get(e.service) || 0) + e.totalPaise);
  for (const m of donutMt) byService.set('Money Transfer Commission', (byService.get('Money Transfer Commission') || 0) + m.commissionPaise);
  const sorted = [...byService.entries()].sort((a, b) => b[1] - a[1]);
  const top5 = sorted.slice(0, 5);
  const othersTotal = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
  const donutData = [
    ...top5.map(([service, v], i) => ({ label: service, value: v, color: CHART_COLORS[i % CHART_COLORS.length], valueLabel: formatINR(v) })),
    ...(othersTotal > 0 ? [{ label: 'Others', value: othersTotal, color: CHART_COLORS[5], valueLabel: formatINR(othersTotal) }] : []),
  ];
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0);

  const recentJobs = [...jobs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);
  const dueCustomers = new Map<string, number>();
  for (const j of jobs) {
    const d = Math.max(0, j.totalPaise - j.receivedPaise);
    if (d > 0) dueCustomers.set(j.mobile || j.customerName, (dueCustomers.get(j.mobile || j.customerName) || 0) + d);
  }
  const payableAgents = agents.filter((a) => agentPayablePaise(a, jobs) > 0);
  const mtPending = mtT.filter((m) => m.status === 'Pending');
  const mtSentTotal = mtT.filter((m) => m.status !== 'Failed').reduce((s, m) => s + m.amountPaise, 0);

  const [insights, setInsights] = React.useState<string[]>([]);

  function askAi() {
    const thisYm = today.slice(0, 7);
    const prevYm = (() => {
      const [y, m] = thisYm.split('-').map(Number);
      const d = new Date(y, m - 2, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })();
    const monthIn = txns.filter((x) => x.kind === 'in' && x.date.slice(0, 7) === thisYm).reduce((s, x) => s + x.amountPaise, 0);
    const prevMonthIn = txns.filter((x) => x.kind === 'in' && x.date.slice(0, 7) === prevYm).reduce((s, x) => s + x.amountPaise, 0);
    const biggestDue = [...jobs].map((j) => ({ name: j.customerName, due: Math.max(0, j.totalPaise - j.receivedPaise) })).filter((d) => d.due > 0).sort((a, b) => b.due - a.due)[0];
    setInsights(getAIInsights({
      incomePaise: pIn,
      expensePaise: pOut,
      profitPaise: profit,
      customerDuePaise: due,
      agentPayablePaise: payable,
      mtCommissionPaise: mtT.reduce((s, m) => s + (m.status === 'Failed' ? 0 : m.commissionPaise), 0),
      topServices: sorted.map(([service, receivedPaise]) => ({ service, receivedPaise })),
      biggestDueName: biggestDue?.name,
      monthIncomePaise: monthIn,
      prevMonthIncomePaise: prevMonthIn,
    }));
  }

  const visible = (card: string) => !profile.hiddenCards.includes(card);
  const periodLabel = period === 'today' ? "Today's" : period === 'week' ? "This Week's" : period === 'month' ? "This Month's" : "This Year's";

  return (
    <div>
      {/* period + actions */}
      <div className="page-head">
        <div className="pills" role="tablist" aria-label="Period">
          {(['today', 'week', 'month', 'year'] as Period[]).map((p) => (
            <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>
              {p === 'today' ? 'Today' : p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'Year'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="date-chip">📅 {formatDate(today)}</span>
          <Btn onClick={() => ctx.goService?.('PAN Card')}>+ Add Job</Btn>
          <Btn kind="secondary" onClick={() => ctx.go?.('services')}>+ Add Payment</Btn>
        </div>
      </div>

      {/* greeting + quick services */}
      <div className="greet-row">
        <div>
          <h1>{greeting()}, Ayan</h1>
          <p className="page-sub">Here&apos;s your business summary for {period === 'today' ? 'today' : period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'this year'} — {formatDate(today)}</p>
        </div>
        <div className="quick-services">
          {QUICK_SERVICES.filter((q) => profile.services.includes(q.service)).map((q) => (
            <button key={q.service} className="qs-btn" onClick={() => ctx.goService?.(q.service)}>
              <span className="qs-ico" style={{ background: q.bg, color: q.fg }}>{initials(q.service).slice(0, 1)}</span>
              {q.label}
            </button>
          ))}
          <button className="qs-btn" onClick={() => ctx.go?.('services')}>
            <span className="qs-ico" style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>⋮⋮</span>
            More
          </button>
        </div>
      </div>

      {/* 7 summary cards */}
      <div className="grid grid-7" style={{ marginBottom: 16 }}>
        {visible('todayIncome') && <Stat tone="green" icon="₹" label={`${periodLabel} Income`} value={formatINR(pIn)} trend={{ pct: trendPct(pIn, pInPrev) }} />}
        {visible('todayExpenses') && <Stat tone="red" icon="▤" label={`${periodLabel} Expenses`} value={formatINR(pOut)} trend={{ pct: trendPct(pOut, pOutPrev) }} />}
        {visible('netProfit') && <Stat tone="purple" icon="↗" label="Net Profit" value={formatINR(profit)} trend={{ pct: trendPct(profit, profitPrev) }} sub={`MT commission profit ${formatINR(mtProfit)}`} />}
        {visible('cashBalance') && <Stat tone="blue" icon="₹" label={t(lang, 'cashBalance')} value={formatINR(bal.cash)} />}
        {visible('upiBalance') && <Stat tone="indigo" icon="⌁" label={t(lang, 'upiBalance')} value={formatINR(bal.upi)} />}
        {visible('customerDue') && <Stat tone="orange" icon="◉" label={t(lang, 'customerDue')} value={formatINR(due)} sub={`${dueCustomers.size} customer${dueCustomers.size === 1 ? '' : 's'} owe you${quickDue > 0 ? ` • ${formatINR(quickDue)} quick-entry due` : ''}`} />}
        {visible('agentPayable') && <Stat tone="pink" icon="◉" label={t(lang, 'agentPayable')} value={formatINR(payable)} sub={`${payableAgents.length} agent${payableAgents.length === 1 ? '' : 's'} to pay — separate from due`} />}
      </div>

      {/* charts */}
      <div className="grid grid-charts">
        <Card
          title="Business Overview"
          right={
            <select className="chart-select" value={chartRange} onChange={(e) => setChartRange(e.target.value as '7' | '30')} aria-label="Chart range">
              <option value="7">7 Days</option>
              <option value="30">30 Days</option>
            </select>
          }
        >
          {txns.length === 0 ? (
            <Empty text={t(lang, 'noRecords')} />
          ) : (
            <LineChart labels={chartLabels} income={chartIncome} expenses={chartExpenses} />
          )}
        </Card>

        <Card
          title={t(lang, 'serviceIncome')}
          right={
            <select className="chart-select" value={donutRange} onChange={(e) => setDonutRange(e.target.value as 'month' | 'all')} aria-label="Donut range">
              <option value="month">This Month</option>
              <option value="all">All Time</option>
            </select>
          }
        >
          {donutData.length === 0 ? (
            <Empty text={t(lang, 'noRecords')} />
          ) : (
            <DonutChart data={donutData} totalLabel="Total" totalValue={formatINR(donutTotal)} />
          )}
        </Card>
      </div>

      {/* bottom row */}
      <div className="grid grid-bottom">
        <Card
          title="Recent Jobs"
          right={jobs.length > 0 ? <button className="link-btn" onClick={() => ctx.go?.('services')}>View All →</button> : undefined}
        >
          {recentJobs.length === 0 ? (
            <Empty text={t(lang, 'noRecords')} />
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Service</th><th>Status</th><th className="num">Amount</th><th>Date</th></tr></thead>
                <tbody>
                  {recentJobs.map((j: Job) => (
                    <tr key={j.id}>
                      <td>
                        <div className="cell-with-ico">
                          <span className="row-ico">{initials(j.service).slice(0, 1)}</span>
                          <span>
                            <span className="cell-main">{j.service}</span><br />
                            <span className="cell-sub">{j.customerName}{j.refNo ? ` • ${j.refNo}` : ''}</span>
                          </span>
                        </div>
                      </td>
                      <td><span className={`pill ${statusPill(j.status)}`}>{j.status}</span></td>
                      <td className="num"><strong>{formatINR(j.totalPaise)}</strong></td>
                      <td>{formatDate(j.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Pending Payments" right={due > 0 || payable > 0 ? <button className="link-btn" onClick={() => ctx.go?.('khata')}>View All →</button> : undefined}>
          <button className="pending-row" onClick={() => ctx.go?.('khata')}>
            <span className="row-ico" style={{ background: 'var(--purple-soft)' }}>◉</span>
            <span><span className="pending-title">Customer Due</span><br /><span className="pending-sub">{dueCustomers.size} customer{dueCustomers.size === 1 ? '' : 's'} • {formatINR(due)}{quickDue > 0 ? ` (incl. ${formatINR(quickDue)} quick-entry due)` : ''}</span></span>
            <span className="pending-chev">›</span>
          </button>
          <button className="pending-row" onClick={() => ctx.go?.('agents')}>
            <span className="row-ico" style={{ background: 'var(--orange-soft)' }}>◉</span>
            <span><span className="pending-title">Agent Payable</span><br /><span className="pending-sub">{payableAgents.length} agent{payableAgents.length === 1 ? '' : 's'} • {formatINR(payable)}</span></span>
            <span className="pending-chev">›</span>
          </button>
          <button className="pending-row" onClick={() => ctx.go?.('mt')}>
            <span className="row-ico" style={{ background: 'var(--blue-soft)' }}>⇄</span>
            <span><span className="pending-title">MT Settlement</span><br /><span className="pending-sub">{mtPending.length} pending • {formatINR(mtSentTotal)} sent</span></span>
            <span className="pending-chev">›</span>
          </button>
          {due === 0 && payable === 0 && mtT.length === 0 && (
            <p className="empty">No pending payments — everything is settled.</p>
          )}
        </Card>

        <Card title="Quick Actions">
          <div className="qa-grid">
            <button className="qa-btn" onClick={() => ctx.go?.('customers')}><span className="qa-ico" style={{ background: 'var(--blue-soft)', color: '#0b5fa5' }}>+</span>Add Customer</button>
            <button className="qa-btn" onClick={() => ctx.go?.('agents')}><span className="qa-ico" style={{ background: 'var(--purple-soft)', color: 'var(--purple-ink)' }}>◉</span>Add Agent</button>
            <button className="qa-btn" onClick={() => ctx.go?.('expenses')}><span className="qa-ico" style={{ background: 'var(--green-soft)', color: '#007a5e' }}>▤</span>Add Expense</button>
            <button className="qa-btn" onClick={() => ctx.go?.('receipts')}><span className="qa-ico" style={{ background: 'var(--pink-card)', color: '#b02a6b' }}>▦</span>Generate Receipt</button>
            <button className="qa-btn" onClick={() => ctx.go?.('reports')}><span className="qa-ico" style={{ background: 'var(--indigo-soft)', color: '#3d4fd7' }}>↗</span>View Reports</button>
            <button className="qa-btn" onClick={() => ctx.go?.('difference')}><span className="qa-ico" style={{ background: 'var(--orange-soft)', color: '#9a5b00' }}>≠</span>Difference Finder</button>
          </div>
          <p className="field-hint" style={{ marginTop: 12 }}>
            {customers.length} customer{customers.length === 1 ? '' : 's'} • {agents.length} agent{agents.length === 1 ? '' : 's'} • {jobs.length} job{jobs.length === 1 ? '' : 's'} on this profile.
          </p>
        </Card>
      </div>

      <Card title="AI Business Insights">
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          BizKhata AI analyses your real records on this device — nothing is sent anywhere.
        </p>
        <Btn onClick={askAi}>Get AI Business Insights</Btn>
        {insights.length > 0 && (
          <ul style={{ marginTop: 12, paddingLeft: 18 }}>
            {insights.map((tip, i) => <li key={i} style={{ marginBottom: 6 }}>{tip}</li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}
