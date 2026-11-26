'use client';
import React from 'react';
import { formatINR } from '@/lib/money';
import {
  agentPayablePaise,
  balancesPaise,
  mtProfitPaise,
  netProfitPaise,
  serviceProfitPaise,
  totalCustomerDuePaise,
} from '@/lib/accounting';
import { t } from '@/lib/i18n';
import type { Job } from '@/lib/types';
import { todayISO } from '@/lib/types';
import { Btn, Card, Empty, Stat, type Ctx } from './ui';
import { exportCSV } from '@/lib/store';
import { getGeminiInsight, geminiEnabled } from '@/lib/gemini';

export function DashboardView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const jobs = state.jobs.filter((j) => j.profileId === pid);
  const txns = state.cashTxns.filter((x) => x.profileId === pid);
  const expenses = state.expenses.filter((e) => e.profileId === pid);
  const mtT = state.mtTransfers.filter((m) => m.profileId === pid);
  const mtE = state.mtExpenses.filter((m) => m.profileId === pid);
  const agents = state.agents.filter((a) => a.profileId === pid);

  const bal = balancesPaise(profile.openingCashPaise, profile.openingUpiPaise, txns);
  const today = todayISO();
  const todayTxns = txns.filter((x) => x.date === today);
  const todayIn = todayTxns.filter((x) => x.kind === 'in').reduce((s, x) => s + x.amountPaise, 0);
  const todayOut = todayTxns.filter((x) => x.kind === 'out').reduce((s, x) => s + x.amountPaise, 0);
  const profit = netProfitPaise(jobs, expenses, mtT, mtE);
  const due = totalCustomerDuePaise(jobs);
  const payable = agents.reduce((s, a) => s + agentPayablePaise(a, jobs), 0);
  const mtProfit = mtProfitPaise(mtT, mtE);
  const lang = profile.language;

  const byService = new Map<string, number>();
  for (const j of jobs) byService.set(j.service, (byService.get(j.service) || 0) + j.receivedPaise);
  const topServices = [...byService.entries()]
    .map(([service, receivedPaise]) => ({ service, receivedPaise }))
    .sort((a, b) => b.receivedPaise - a.receivedPaise);

  const [insight, setInsight] = React.useState('');
  const [insightBusy, setInsightBusy] = React.useState(false);
  const aiOn = geminiEnabled(state);

  async function askAi() {
    if (!aiOn) return;
    setInsightBusy(true);
    const res = await getGeminiInsight(profile.geminiKey, {
      incomePaise: todayIn,
      expensePaise: todayOut,
      profitPaise: profit,
      customerDuePaise: due,
      agentPayablePaise: payable,
      mtCommissionPaise: mtT.reduce((s, m) => s + (m.status === 'Failed' ? 0 : m.commissionPaise), 0),
      topServices,
    });
    setInsight(res.text);
    setInsightBusy(false);
  }

  const visible = (card: string) => !profile.hiddenCards.includes(card);

  return (
    <div>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        {visible('todayIncome') && <Stat label={t(lang, 'todayIncome')} value={formatINR(todayIn)} />}
        {visible('todayExpenses') && <Stat label={t(lang, 'todayExpenses')} value={formatINR(todayOut)} />}
        {visible('netProfit') && <Stat label={t(lang, 'netProfit')} value={formatINR(profit)} sub={`MT commission profit ${formatINR(mtProfit)}`} />}
        {visible('cashBalance') && <Stat label={t(lang, 'cashBalance')} value={formatINR(bal.cash)} />}
        {visible('upiBalance') && <Stat label={t(lang, 'upiBalance')} value={formatINR(bal.upi)} />}
        {visible('customerDue') && <Stat label={t(lang, 'customerDue')} value={formatINR(due)} sub="Money to collect — not cash yet" />}
        {visible('agentPayable') && <Stat label={t(lang, 'agentPayable')} value={formatINR(payable)} sub="Separate from customer due" />}
        {visible('cashVsUpi') && <Stat label={t(lang, 'cashVsUpi')} value={`${formatINR(bal.cash)} / ${formatINR(bal.upi)}`} sub="Cash / UPI" />}
      </div>

      <div className="grid grid-2">
        <Card title={t(lang, 'serviceIncome')}>
          {topServices.length === 0 ? (
            <Empty text={t(lang, 'noRecords')} />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Service</th><th className="num">Received</th><th className="num">Profit</th></tr>
                </thead>
                <tbody>
                  {topServices.map((s) => {
                    const p = serviceProfitPaise(s.service, jobs, expenses);
                    return (
                      <tr key={s.service}>
                        <td>{s.service}</td>
                        <td className="num">{formatINR(s.receivedPaise)}</td>
                        <td className="num">{formatINR(p.profit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Recent Jobs">
          {jobs.length === 0 ? (
            <Empty text={t(lang, 'noRecords')} />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Customer</th><th>Service</th><th className="num">Total</th><th className="num">Due</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {[...jobs].slice(-6).reverse().map((j: Job) => (
                    <tr key={j.id}>
                      <td>{j.customerName}</td>
                      <td>{j.service}</td>
                      <td className="num">{formatINR(j.totalPaise)}</td>
                      <td className="num">{formatINR(Math.max(0, j.totalPaise - j.receivedPaise))}</td>
                      <td>{j.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="AI Insight (Gemini — free tier)">
        {!aiOn ? (
          <p>
            AI is OFF. Add your own free Gemini API key in Settings to get short business
            insights here. The app works fully without AI — nothing is sent anywhere.
          </p>
        ) : (
          <div>
            <Btn onClick={askAi} disabled={insightBusy}>{insightBusy ? 'Thinking…' : 'Get AI Insight'}</Btn>
            {insight && <p style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{insight}</p>}
          </div>
        )}
      </Card>

      <Card title="Pending Payments (customers who still owe)">
        {jobs.filter((j) => j.totalPaise - j.receivedPaise > 0).length === 0 ? (
          <Empty text="No pending customer payments." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Mobile</th><th>Service</th><th className="num">Due</th></tr></thead>
              <tbody>
                {jobs.filter((j) => j.totalPaise - j.receivedPaise > 0).map((j) => (
                  <tr key={j.id}>
                    <td>{j.customerName}</td><td>{j.mobile}</td><td>{j.service}</td>
                    <td className="num">{formatINR(j.totalPaise - j.receivedPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export function DailyDhandhaView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const [period, setPeriod] = React.useState<'today' | 'week' | 'month' | 'year'>('today');
  const jobs = state.jobs.filter((j) => j.profileId === pid);
  const expenses = state.expenses.filter((e) => e.profileId === pid);
  const mtT = state.mtTransfers.filter((m) => m.profileId === pid);
  const mtE = state.mtExpenses.filter((m) => m.profileId === pid);

  const inRange = (d: string) => {
    const today = todayISO();
    if (period === 'today') return d === today;
    if (period === 'week') return d >= new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    if (period === 'month') return d.slice(0, 7) === today.slice(0, 7);
    return d.slice(0, 4) === today.slice(0, 4);
  };
  const pj = jobs.filter((j) => inRange(j.date));
  const pe = expenses.filter((e) => inRange(e.date));
  const pmt = mtT.filter((m) => inRange(m.date));
  const pmte = mtE.filter((m) => inRange(m.date));
  const billing = pj.reduce((s, j) => s + j.totalPaise, 0);
  const received = pj.reduce((s, j) => s + j.receivedPaise, 0);
  const agentCharges = pj.reduce((s, j) => s + j.agentChargePaise, 0);
  const expTotal = pe.reduce((s, e) => s + e.amountPaise, 0);
  const mtProfit = mtProfitPaise(pmt, pmte);
  const profit = netProfitPaise(pj, pe, pmt, pmte);

  const byService = new Map<string, { billing: number; received: number; profit: number }>();
  for (const j of pj) {
    const cur = byService.get(j.service) || { billing: 0, received: 0, profit: 0 };
    const p = serviceProfitPaise(j.service, pj, pe);
    byService.set(j.service, { billing: cur.billing + j.totalPaise, received: cur.received + j.receivedPaise, profit: p.profit });
  }

  return (
    <div>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        {(['today', 'week', 'month', 'year'] as const).map((p) => (
          <Btn key={p} kind={period === p ? 'primary' : 'secondary'} onClick={() => setPeriod(p)}>
            {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'This Year'}
          </Btn>
        ))}
        <Btn
          kind="secondary"
          onClick={() =>
            exportCSV(`bizkhata-daily-${period}.csv`, ['Service', 'Billing (Rs)', 'Received (Rs)', 'Profit (Rs)'], [
              ...[...byService.entries()].map(([s, v]) => [s, (v.billing / 100).toFixed(2), (v.received / 100).toFixed(2), (v.profit / 100).toFixed(2)]),
              ['TOTAL', (billing / 100).toFixed(2), (received / 100).toFixed(2), (profit / 100).toFixed(2)],
            ])
          }
        >
          Export CSV
        </Btn>
      </div>
      <p style={{ color: 'var(--muted)' }}>
        Billing, actual received, and profit are different figures. Billing is what you charged;
        received is what actually came in; profit is received minus agent charges and expenses.
      </p>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Total Billing" value={formatINR(billing)} />
        <Stat label="Actually Received" value={formatINR(received)} />
        <Stat label="Agent Charges" value={formatINR(agentCharges)} />
        <Stat label="Direct Expenses" value={formatINR(expTotal)} />
        <Stat label="MT Commission Profit" value={formatINR(mtProfit)} />
        <Stat label="Net Profit" value={formatINR(profit)} />
      </div>
      <Card title="Per-Service Breakdown">
        {byService.size === 0 ? (
          <Empty text="No jobs in this period yet." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Service</th><th className="num">Billing</th><th className="num">Received</th><th className="num">Agent Charges</th><th className="num">Profit</th></tr></thead>
              <tbody>
                {[...byService.entries()].map(([s, v]) => (
                  <tr key={s}>
                    <td>{s}</td>
                    <td className="num">{formatINR(v.billing)}</td>
                    <td className="num">{formatINR(v.received)}</td>
                    <td className="num">{formatINR(pj.filter((j) => j.service === s).reduce((a, j) => a + j.agentChargePaise, 0))}</td>
                    <td className="num">{formatINR(v.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
