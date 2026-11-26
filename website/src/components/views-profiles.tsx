'use client';
import React from 'react';
import { formatINR } from '@/lib/money';
import { agentPayablePaise, jobDuePaise, jobMarginPaise } from '@/lib/accounting';
import { auditEntry, nextReceiptNumber, whatsAppLink } from '@/lib/store';
import type { Job, Method, Receipt } from '@/lib/types';
import { todayISO, uid } from '@/lib/types';
import { AmountInput, Btn, Card, Empty, Field, Modal, Stat, formatDate, initials, statusPill, type Ctx } from './ui';
import { jobServices } from '@/lib/routes';
import { DocUploader } from './views-services';

/* ================= Customer Profile (page 15) ================= */

export function CustomerProfileView({ ctx, customerId }: { ctx: Ctx; customerId?: string }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const id = customerId || ctx.customerId;
  const customer = state.customers.find((c) => c.profileId === pid && c.id === id)
    || state.customers.find((c) => c.profileId === pid) || null;
  const [tab, setTab] = React.useState<'ledger' | 'jobs' | 'documents' | 'details'>('ledger');
  const [payJob, setPayJob] = React.useState<Job | null>(null);
  const [payAmount, setPayAmount] = React.useState(0);
  const [payMethod, setPayMethod] = React.useState<Method>('cash');
  const [showAddJob, setShowAddJob] = React.useState(false);
  const [showEdit, setShowEdit] = React.useState(false);
  const [error, setError] = React.useState('');
  // add-job form
  const [service, setService] = React.useState(jobServices(profile.services)[0] || 'Xerox');
  const [total, setTotal] = React.useState(0);
  const [received, setReceived] = React.useState(0);
  const [method, setMethod] = React.useState<Method>('cash');
  const [refNo, setRefNo] = React.useState('');
  // edit form
  const [editName, setEditName] = React.useState('');
  const [editMobile, setEditMobile] = React.useState('');
  const [editNotes, setEditNotes] = React.useState('');

  const jobs = customer
    ? state.jobs.filter((j) => j.profileId === pid && (j.mobile === customer.mobile || j.customerName === customer.name))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
    : [];
  const totalBill = jobs.reduce((s, j) => s + j.totalPaise, 0);
  const totalPaid = jobs.reduce((s, j) => s + j.receivedPaise, 0);
  const totalDue = totalBill - totalPaid;

  // Ledger entries: bill + payment per job, running balance (due).
  type LedgerRow = { key: string; date: string; label: string; sub: string; amount: number; kind: 'bill' | 'payment'; balance: number };
  const ledger: LedgerRow[] = [];
  let running = 0;
  for (const j of [...jobs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    running += j.totalPaise;
    ledger.push({ key: `${j.id}-bill`, date: j.date, label: `${j.service} — Bill`, sub: `Bill • ${formatDate(j.date)}${j.refNo ? ` • Ref ${j.refNo}` : ''}`, amount: j.totalPaise, kind: 'bill', balance: running });
    if (j.receivedPaise > 0) {
      running -= j.receivedPaise;
      ledger.push({ key: `${j.id}-pay`, date: j.date, label: 'Payment Received', sub: `${j.receivedMethod.toUpperCase()} • ${formatDate(j.date)}`, amount: j.receivedPaise, kind: 'payment', balance: running });
    }
  }
  ledger.sort((a, b) => (a.date < b.date ? 1 : -1));

  function recordPayment() {
    if (!payJob) return;
    const due = jobDuePaise(payJob);
    if (payAmount <= 0) { setError('Enter an amount more than 0.'); return; }
    if (payAmount > due) { setError(`Due is only ${formatINR(due)}. Payment cannot be more than due.`); return; }
    ctx.mutate((s) => {
      const j = s.jobs.find((x) => x.id === payJob.id);
      if (!j) return;
      j.receivedPaise += payAmount;
      j.updatedAt = new Date().toISOString();
      s.cashTxns.push({
        id: uid('txn'), profileId: pid, kind: 'in', method: payMethod,
        amountPaise: payAmount, category: `${j.service} — ${j.customerName}`, note: `Payment received (${j.id})`,
        date: todayISO(), jobId: j.id, createdAt: new Date().toISOString(),
      });
    }, [auditEntry(pid, 'update', 'Job', payJob.id, `received ${formatINR(payJob.receivedPaise)}`, `received ${formatINR(payJob.receivedPaise + payAmount)}`)]);
    setPayJob(null); setPayAmount(0); setError('');
  }

  function submitJob() {
    if (!customer) return;
    if (total <= 0) { setError('Enter the total fees (more than 0).'); return; }
    if (received > total) { setError('Received cannot be more than total fees.'); return; }
    const job: Job = {
      id: uid('job'), profileId: pid, service, customerName: customer.name, mobile: customer.mobile, refNo,
      status: 'New', totalPaise: total, receivedPaise: received, receivedMethod: method,
      agentId: null, agentChargePaise: 0, agentPaidPaise: 0,
      date: todayISO(), notes: '', docIds: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    ctx.mutate((s) => {
      s.jobs.push(job);
      if (received > 0) {
        s.cashTxns.push({
          id: uid('txn'), profileId: pid, kind: 'in', method,
          amountPaise: received, category: `${service} — ${customer.name}`, note: `Job payment (${job.id})`,
          date: todayISO(), jobId: job.id, createdAt: new Date().toISOString(),
        });
      }
    }, [auditEntry(pid, 'create', 'Job', job.id, '', `${service} for ${customer.name}: total ${formatINR(total)}, received ${formatINR(received)}`)]);
    setShowAddJob(false); setTotal(0); setReceived(0); setRefNo(''); setError('');
  }

  function saveEdit() {
    if (!customer || !editName.trim()) { setError('Enter the customer name.'); return; }
    ctx.mutate((s) => {
      const c = s.customers.find((x) => x.id === customer.id);
      if (c) { c.name = editName.trim(); c.mobile = editMobile; c.notes = editNotes; }
    }, [auditEntry(pid, 'update', 'Customer', customer.id, customer.name, editName.trim())]);
    setShowEdit(false); setError('');
  }

  if (!customer) {
    return (
      <Card title="Customer Profile">
        <Empty text="No customers yet. Add a customer first, then open their profile here." />
        <Btn onClick={() => ctx.go?.('customers')}>Go to Customers</Btn>
      </Card>
    );
  }

  const firstDueJob = jobs.find((j) => jobDuePaise(j) > 0) || null;

  return (
    <div>
      <Card>
        <div className="khata-head">
          <span className="avatar" style={{ width: 52, height: 52, fontSize: 19 }}>{initials(customer.name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>{customer.name}</h2>
            <p className="page-sub" style={{ margin: 0 }}>{customer.mobile || 'No mobile'} • {jobs.length} job{jobs.length === 1 ? '' : 's'}</p>
          </div>
          <Btn kind="secondary" onClick={() => { setEditName(customer.name); setEditMobile(customer.mobile); setEditNotes(customer.notes); setShowEdit(true); }}>✎ Edit</Btn>
          <Btn kind="ghost" onClick={() => ctx.go?.('customers')}>← All Customers</Btn>
        </div>
        <div className="grid grid-3" style={{ marginTop: 14 }}>
          <Stat label="Total Bill" value={formatINR(totalBill)} tone="blue" />
          <Stat label="Paid" value={formatINR(totalPaid)} tone="green" />
          <Stat label="Due" value={formatINR(totalDue)} tone={totalDue > 0 ? 'red' : 'green'} sub={totalDue > 0 ? 'Outstanding — not cash yet' : 'Fully paid'} />
        </div>
      </Card>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {([['ledger', 'Ledger'], ['jobs', `Jobs (${jobs.length})`], ['documents', 'Documents'], ['details', 'Details']] as const).map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'ledger' && (
        <Card title="Ledger Transactions">
          {ledger.length === 0 ? <Empty text="No ledger entries yet — add a job for this customer." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Particulars</th><th className="num">Amount</th><th className="num">Balance Due</th></tr></thead>
                <tbody>
                  {ledger.map((r) => (
                    <tr key={r.key}>
                      <td>{formatDate(r.date)}</td>
                      <td>
                        <div className="cell-with-ico">
                          <span className="row-ico" style={r.kind === 'payment' ? { background: 'var(--green-soft)', color: '#007a5e' } : { background: 'var(--blue-soft)', color: '#0b5fa5' }}>
                            {r.kind === 'payment' ? '↓' : '▦'}
                          </span>
                          <span><span className="cell-main">{r.label}</span><br /><span className="cell-sub">{r.sub}</span></span>
                        </div>
                      </td>
                      <td className="num" style={{ color: r.kind === 'payment' ? '#007a5e' : 'var(--text)' }}>
                        {r.kind === 'payment' ? '−' : '+'}{formatINR(r.amount)}
                      </td>
                      <td className="num"><strong>{formatINR(r.balance)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'jobs' && (
        <Card title="Job History">
          {jobs.length === 0 ? <Empty text="No jobs for this customer yet." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Service</th><th>Date</th><th>Status</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Due</th><th></th></tr></thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td>{j.service}{j.refNo ? <><br /><span className="cell-sub">Ref {j.refNo}</span></> : null}</td>
                      <td>{formatDate(j.date)}</td>
                      <td><span className={`pill ${statusPill(j.status)}`}>{j.status}</span></td>
                      <td className="num">{formatINR(j.totalPaise)}</td>
                      <td className="num">{formatINR(j.receivedPaise)}</td>
                      <td className="num">{formatINR(jobDuePaise(j))}</td>
                      <td>{jobDuePaise(j) > 0 && <Btn kind="ghost" onClick={() => setPayJob(j)}>Payment</Btn>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'documents' && (
        <Card title="Documents">
          <DocUploader ctx={ctx} ownerType="customer" ownerId={customer.id} />
        </Card>
      )}

      {tab === 'details' && (
        <Card title="Customer Details">
          <p><strong>Name:</strong> {customer.name}</p>
          <p><strong>Mobile:</strong> {customer.mobile || '—'}</p>
          <p><strong>Notes:</strong> {customer.notes || '—'}</p>
          <p><strong>Since:</strong> {formatDate(customer.createdAt)}</p>
          <div className="btn-row">
            {customer.mobile && (
              <a
                className="btn btn-secondary"
                href={whatsAppLink(customer.mobile, `Namaste ${customer.name}, ${profile.name} se — aapka baki payment ${formatINR(totalDue)} hai. Kripya jald se jald bhugtan karein. Dhanyavaad!`)}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp Reminder
              </a>
            )}
            <Btn kind="danger" onClick={() => {
              if (!window.confirm('Move this customer to the Recycle Bin?')) return;
              ctx.softDelete('Customer', `${customer.name} (${customer.mobile})`, customer, (s) => {
                s.customers = s.customers.filter((x) => x.id !== customer.id);
              });
              ctx.go?.('customers');
            }}>Delete Customer</Btn>
          </div>
        </Card>
      )}

      <div className="btn-row">
        <Btn onClick={() => setPayJob(firstDueJob)} disabled={!firstDueJob}>+ Add Payment</Btn>
        <Btn kind="secondary" onClick={() => setShowAddJob(true)}>+ Add Job</Btn>
      </div>

      {payJob && (
        <Modal title={`Payment Received — ${payJob.customerName}`} onClose={() => setPayJob(null)}>
          <p>Due: <strong>{formatINR(jobDuePaise(payJob))}</strong> (total {formatINR(payJob.totalPaise)}, received {formatINR(payJob.receivedPaise)})</p>
          <div className="form-row">
            <Field label="Amount (₹)"><AmountInput valuePaise={payAmount} onChange={setPayAmount} /></Field>
            <Field label="Method">
              <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value as Method)}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
              </select>
            </Field>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="btn-row">
            <Btn onClick={recordPayment}>Record Payment</Btn>
            <Btn kind="secondary" onClick={() => setPayJob(null)}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {showAddJob && (
        <Modal title={`Add Job — ${customer.name}`} onClose={() => setShowAddJob(false)}>
          <Field label="Service">
            <select className="input" value={service} onChange={(e) => setService(e.target.value)}>
              {jobServices(profile.services).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Application Reference No. (optional)"><input className="input" value={refNo} onChange={(e) => setRefNo(e.target.value)} /></Field>
          <div className="form-row">
            <Field label="Total Fees (₹)"><AmountInput valuePaise={total} onChange={setTotal} /></Field>
            <Field label="Amount Received (₹)"><AmountInput valuePaise={received} onChange={setReceived} /></Field>
            <Field label="Payment Method">
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
              </select>
            </Field>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="btn-row">
            <Btn onClick={submitJob}>Save Job</Btn>
            <Btn kind="secondary" onClick={() => setShowAddJob(false)}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {showEdit && (
        <Modal title="Edit Customer" onClose={() => setShowEdit(false)}>
          <Field label="Name"><input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} /></Field>
          <Field label="Mobile"><input className="input" value={editMobile} onChange={(e) => setEditMobile(e.target.value)} inputMode="tel" /></Field>
          <Field label="Notes"><input className="input" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} /></Field>
          {error && <p className="error">{error}</p>}
          <div className="btn-row">
            <Btn onClick={saveEdit}>Save</Btn>
            <Btn kind="secondary" onClick={() => setShowEdit(false)}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================= Agent Profile (page 18) ================= */

export function AgentProfileView({ ctx, agentId }: { ctx: Ctx; agentId?: string }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const id = agentId || ctx.agentId;
  const agent = state.agents.find((a) => a.profileId === pid && a.id === id)
    || state.agents.find((a) => a.profileId === pid) || null;
  const [tab, setTab] = React.useState<'jobs' | 'payments' | 'details'>('jobs');
  const [payJobId, setPayJobId] = React.useState('');
  const [payAmount, setPayAmount] = React.useState(0);
  const [payMethod, setPayMethod] = React.useState<Method>('cash');
  const [error, setError] = React.useState('');

  const jobs = agent ? state.jobs.filter((j) => j.profileId === pid && j.agentId === agent.id) : [];
  const charges = jobs.reduce((s, j) => s + j.agentChargePaise, 0);
  const paid = jobs.reduce((s, j) => s + j.agentPaidPaise, 0);
  const payable = agent ? agentPayablePaise(agent, state.jobs.filter((j) => j.profileId === pid)) : 0;
  const paidJobs = jobs.filter((j) => j.agentPaidPaise > 0);

  function payAgent() {
    const job = jobs.find((j) => j.id === payJobId);
    if (!job) return;
    const due = Math.max(0, job.agentChargePaise - job.agentPaidPaise);
    if (payAmount <= 0 || payAmount > due) { setError(`Payable on this job is ${formatINR(due)}.`); return; }
    ctx.mutate((s) => {
      const j = s.jobs.find((x) => x.id === job.id);
      if (!j) return;
      j.agentPaidPaise += payAmount;
      j.updatedAt = new Date().toISOString();
      s.cashTxns.push({
        id: uid('txn'), profileId: pid, kind: 'out', method: payMethod,
        amountPaise: payAmount, category: `Agent Payment — ${j.service}`, note: `Paid to agent for ${j.customerName}`,
        date: todayISO(), jobId: j.id, createdAt: new Date().toISOString(),
      });
    }, [auditEntry(pid, 'update', 'Job', job.id, `agent paid ${formatINR(job.agentPaidPaise)}`, `agent paid ${formatINR(job.agentPaidPaise + payAmount)}`)]);
    setPayJobId(''); setPayAmount(0); setError('');
  }

  if (!agent) {
    return (
      <Card title="Agent Profile">
        <Empty text="No agents yet. Add an agent first, then open their profile here." />
        <Btn onClick={() => ctx.go?.('agents')}>Go to Agents</Btn>
      </Card>
    );
  }

  return (
    <div>
      <Card>
        <div className="khata-head">
          <span className="avatar" style={{ width: 52, height: 52, fontSize: 19 }}>{initials(agent.name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>{agent.name}</h2>
            <p className="page-sub" style={{ margin: 0 }}>{agent.type} • {agent.mobile || 'No mobile'} • <span className={`pill ${agent.status === 'Active' ? 'paid' : 'cancelled'}`}>{agent.status}</span></p>
          </div>
          <Btn kind="secondary" onClick={() => ctx.go?.('agent-payments')}>Agent Payments →</Btn>
          <Btn kind="ghost" onClick={() => ctx.go?.('agents')}>← All Agents</Btn>
        </div>
        <div className="grid grid-4" style={{ marginTop: 14 }}>
          <Stat label="Assigned Jobs" value={String(jobs.length)} tone="blue" />
          <Stat label="Total Charges" value={formatINR(charges)} tone="indigo" />
          <Stat label="Total Paid" value={formatINR(paid)} tone="green" />
          <Stat label="Remaining Payable" value={formatINR(payable)} tone={payable > 0 ? 'orange' : 'green'} sub="Separate from customer due" />
        </div>
      </Card>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {([['jobs', `Assigned Jobs (${jobs.length})`], ['payments', 'Payment History'], ['details', 'Details']] as const).map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'jobs' && (
        <Card title="Assigned Jobs">
          {jobs.length === 0 ? <Empty text="No jobs assigned to this agent yet." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Customer</th><th>Service</th><th>Date</th><th>Status</th><th className="num">Charge</th><th className="num">Paid</th><th className="num">Payable</th><th className="num">Margin</th></tr></thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td>{j.customerName}</td><td>{j.service}</td><td>{formatDate(j.date)}</td>
                      <td><span className={`pill ${statusPill(j.status)}`}>{j.status}</span></td>
                      <td className="num">{formatINR(j.agentChargePaise)}</td>
                      <td className="num">{formatINR(j.agentPaidPaise)}</td>
                      <td className="num">{formatINR(Math.max(0, j.agentChargePaise - j.agentPaidPaise))}</td>
                      <td className="num">{formatINR(jobMarginPaise(j))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'payments' && (
        <Card title="Payment History">
          {paidJobs.length === 0 ? <Empty text="No payments made to this agent yet." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Customer / Job</th><th>Service</th><th className="num">Charge</th><th className="num">Paid</th><th className="num">Payable</th></tr></thead>
                <tbody>
                  {paidJobs.map((j) => (
                    <tr key={j.id}>
                      <td>{j.customerName}</td><td>{j.service}</td>
                      <td className="num">{formatINR(j.agentChargePaise)}</td>
                      <td className="num">{formatINR(j.agentPaidPaise)}</td>
                      <td className="num">{formatINR(Math.max(0, j.agentChargePaise - j.agentPaidPaise))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'details' && (
        <Card title="Agent Details">
          <p><strong>Name:</strong> {agent.name}</p>
          <p><strong>Type:</strong> {agent.type}</p>
          <p><strong>Mobile:</strong> {agent.mobile || '—'}</p>
          <p><strong>Status:</strong> {agent.status}</p>
          <p><strong>Notes:</strong> {agent.notes || '—'}</p>
          <p style={{ color: 'var(--muted)' }}>PAN work is never given to an agent — the app blocks it when adding a job.</p>
        </Card>
      )}

      <Card title="Record Agent Payment">
        <div className="form-row">
          <Field label="Pay agent for job">
            <select className="input" value={payJobId} onChange={(e) => setPayJobId(e.target.value)}>
              <option value="">Select a job with agent payable…</option>
              {jobs.filter((j) => j.agentChargePaise - j.agentPaidPaise > 0).map((j) => (
                <option key={j.id} value={j.id}>{j.customerName} — {j.service} — payable {formatINR(j.agentChargePaise - j.agentPaidPaise)}</option>
              ))}
            </select>
          </Field>
          <Field label="Amount (₹)"><AmountInput valuePaise={payAmount} onChange={setPayAmount} /></Field>
          <Field label="Method">
            <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value as Method)}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
            </select>
          </Field>
        </div>
        {error && <p className="error">{error}</p>}
        <Btn onClick={payAgent} disabled={!payJobId}>Record Agent Payment</Btn>
      </Card>
    </div>
  );
}

/* ================= Agent Payments (page 19) ================= */

export function AgentPaymentsView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const agents = state.agents.filter((a) => a.profileId === pid);
  const jobs = state.jobs.filter((j) => j.profileId === pid);
  const agentJobs = jobs.filter((j) => j.agentId);
  const totalCharges = agentJobs.reduce((s, j) => s + j.agentChargePaise, 0);
  const totalPaid = agentJobs.reduce((s, j) => s + j.agentPaidPaise, 0);
  const totalPayable = agents.reduce((s, a) => s + agentPayablePaise(a, jobs), 0);
  const [payJobId, setPayJobId] = React.useState(ctx.agentId
    ? (jobs.find((j) => j.agentId === ctx.agentId && j.agentChargePaise - j.agentPaidPaise > 0)?.id || '')
    : '');
  const [payAmount, setPayAmount] = React.useState(0);
  const [payMethod, setPayMethod] = React.useState<Method>('cash');
  const [error, setError] = React.useState('');

  function payAgent() {
    const job = jobs.find((j) => j.id === payJobId);
    if (!job) return;
    const due = Math.max(0, job.agentChargePaise - job.agentPaidPaise);
    if (payAmount <= 0 || payAmount > due) { setError(`Payable on this job is ${formatINR(due)}.`); return; }
    ctx.mutate((s) => {
      const j = s.jobs.find((x) => x.id === job.id);
      if (!j) return;
      j.agentPaidPaise += payAmount;
      j.updatedAt = new Date().toISOString();
      s.cashTxns.push({
        id: uid('txn'), profileId: pid, kind: 'out', method: payMethod,
        amountPaise: payAmount, category: `Agent Payment — ${j.service}`, note: `Paid to agent for ${j.customerName}`,
        date: todayISO(), jobId: j.id, createdAt: new Date().toISOString(),
      });
    }, [auditEntry(pid, 'update', 'Job', job.id, `agent paid ${formatINR(job.agentPaidPaise)}`, `agent paid ${formatINR(job.agentPaidPaise + payAmount)}`)]);
    setPayJobId(''); setPayAmount(0); setError('');
  }

  return (
    <div>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Agents" value={String(agents.length)} tone="blue" />
        <Stat label="Total Charges" value={formatINR(totalCharges)} tone="indigo" />
        <Stat label="Total Paid" value={formatINR(totalPaid)} tone="green" />
        <Stat label="Remaining Payable" value={formatINR(totalPayable)} tone={totalPayable > 0 ? 'orange' : 'green'} />
      </div>

      <Card title="Record Agent Payment">
        <div className="form-row">
          <Field label="Pay agent for job">
            <select className="input" value={payJobId} onChange={(e) => setPayJobId(e.target.value)}>
              <option value="">Select a job with agent payable…</option>
              {agentJobs.filter((j) => j.agentChargePaise - j.agentPaidPaise > 0).map((j) => {
                const a = agents.find((x) => x.id === j.agentId);
                return (
                  <option key={j.id} value={j.id}>
                    {a?.name || 'Agent'} — {j.customerName} ({j.service}) — payable {formatINR(j.agentChargePaise - j.agentPaidPaise)}
                  </option>
                );
              })}
            </select>
          </Field>
          <Field label="Amount (₹)"><AmountInput valuePaise={payAmount} onChange={setPayAmount} /></Field>
          <Field label="Method">
            <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value as Method)}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
            </select>
          </Field>
        </div>
        {error && <p className="error">{error}</p>}
        <Btn onClick={payAgent} disabled={!payJobId}>Record Agent Payment</Btn>
        <p className="field-hint">Paying an agent also records a Cash/UPI expense, so balances stay correct.</p>
      </Card>

      <Card title="Agent Jobs & Payments">
        {agentJobs.length === 0 ? <Empty text="No jobs assigned to agents yet." /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Service</th><th>Agent</th><th className="num">Charge</th><th className="num">Paid</th><th className="num">Payable</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {agentJobs.map((j) => {
                  const a = agents.find((x) => x.id === j.agentId);
                  const due = Math.max(0, j.agentChargePaise - j.agentPaidPaise);
                  return (
                    <tr key={j.id}>
                      <td>{j.customerName}</td><td>{j.service}</td>
                      <td>{a ? <button className="link-btn" style={{ border: 'none', background: 'transparent', color: 'var(--purple-ink)', fontWeight: 700, cursor: 'pointer', padding: 0 }} onClick={() => ctx.openAgent?.(a.id)}>{a.name}</button> : '—'}</td>
                      <td className="num">{formatINR(j.agentChargePaise)}</td>
                      <td className="num">{formatINR(j.agentPaidPaise)}</td>
                      <td className="num"><span className={due > 0 ? 'pill due' : 'pill paid'}>{formatINR(due)}</span></td>
                      <td><span className={`pill ${statusPill(j.status)}`}>{j.status}</span></td>
                      <td>{due > 0 && <Btn kind="ghost" onClick={() => setPayJobId(j.id)}>Pay</Btn>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ================= Receipt Generator (page 22) ================= */

export function ReceiptGeneratorView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const jobs = state.jobs.filter((j) => j.profileId === pid);
  const receipts = [...state.receipts.filter((r) => r.profileId === pid)].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const [jobId, setJobId] = React.useState('');
  const [layout, setLayout] = React.useState<'A4' | 'Thermal'>('A4');
  const [notes, setNotes] = React.useState('');
  const [created, setCreated] = React.useState<Receipt | null>(null);
  const [error, setError] = React.useState('');

  const job = jobs.find((j) => j.id === jobId) || null;
  const nextNo = nextReceiptNumber(profile);

  function createReceipt() {
    if (!job) { setError('Select a job first.'); return; }
    const number = nextReceiptNumber(profile);
    const r: Receipt = {
      id: uid('rcp'), profileId: pid, number, jobId: job.id,
      customerName: job.customerName, mobile: job.mobile, service: job.service,
      totalPaise: job.totalPaise, paidPaise: job.receivedPaise,
      duePaise: Math.max(0, job.totalPaise - job.receivedPaise),
      method: job.receivedMethod, date: job.date, notes: notes || job.notes, layout,
      createdAt: new Date().toISOString(),
    };
    ctx.mutate((s) => {
      s.receipts.push(r);
      const p = s.profiles.find((x) => x.id === pid);
      if (p) p.receiptCounter += 1;
    }, [auditEntry(pid, 'create', 'Receipt', r.id, '', `Receipt ${number} for ${job.customerName} — ${formatINR(job.totalPaise)}`)]);
    setCreated(r);
    setJobId(''); setNotes(''); setError('');
  }

  function duplicateReceipt(r: Receipt) {
    const number = nextReceiptNumber(profile);
    const copy: Receipt = { ...r, id: uid('rcp'), number, createdAt: new Date().toISOString() };
    ctx.mutate((s) => {
      s.receipts.push(copy);
      const p = s.profiles.find((x) => x.id === pid);
      if (p) p.receiptCounter += 1;
    }, [auditEntry(pid, 'create', 'Receipt', copy.id, '', `Duplicate of ${r.number} as ${number}`)]);
    setCreated(copy);
  }

  const preview = created || (job ? {
    number: nextNo, customerName: job.customerName, mobile: job.mobile, service: job.service,
    totalPaise: job.totalPaise, paidPaise: job.receivedPaise,
    duePaise: Math.max(0, job.totalPaise - job.receivedPaise),
    method: job.receivedMethod, date: job.date, notes: notes || job.notes, layout,
  } : null);

  return (
    <div>
      <div className="grid grid-2">
        <Card title="Generate Receipt">
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>
            Pick a job and create a professional receipt — unique number {nextNo}, A4 or thermal
            layout, signature section, Paid vs Due shown clearly.
          </p>
          <Field label="Create receipt from job">
            <select className="input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">Select a job…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.customerName} — {j.service} — {formatINR(j.totalPaise)} (paid {formatINR(j.receivedPaise)})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Layout">
            <select className="input" value={layout} onChange={(e) => setLayout(e.target.value as 'A4' | 'Thermal')}>
              <option value="A4">A4</option>
              <option value="Thermal">Thermal</option>
            </select>
          </Field>
          <Field label="Notes (optional)"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Thank you" /></Field>
          {error && <p className="error">{error}</p>}
          <div className="btn-row">
            <Btn onClick={createReceipt} disabled={!job}>+ Create Receipt {nextNo}</Btn>
            <Btn kind="secondary" onClick={() => ctx.go?.('receipts')}>View All Receipts</Btn>
          </div>
          {receipts.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3>Recently Generated</h3>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {receipts.slice(0, 5).map((r) => (
                  <li key={r.id} style={{ marginBottom: 4 }}>
                    <button className="link-btn" style={{ border: 'none', background: 'transparent', color: 'var(--purple-ink)', fontWeight: 700, cursor: 'pointer', padding: 0 }} onClick={() => setCreated(r)}>
                      {r.number}
                    </button>
                    {' '}— {r.customerName} • {r.service} • {formatINR(r.totalPaise)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title={created ? `Receipt ${created.number} — ${created.layout} layout` : 'Live Preview'}>
          {!preview ? (
            <Empty text="Select a job to see a live receipt preview here." />
          ) : (
            <div>
              <div className={preview.layout === 'Thermal' ? 'receipt-print receipt-thermal' : 'receipt-print'}>
                <h1>{profile.name}</h1>
                <p>{profile.address || 'CSC Center'}{profile.mobile ? ` • ${profile.mobile}` : ''}</p>
                <hr />
                <p><strong>Receipt No:</strong> {preview.number} &nbsp; <strong>Date:</strong> {formatDate(preview.date)}</p>
                <p><strong>Customer:</strong> {preview.customerName} {preview.mobile ? `(${preview.mobile})` : ''}</p>
                <p><strong>Service:</strong> {preview.service}</p>
                <hr />
                <p>Total Fees: <strong>{formatINR(preview.totalPaise)}</strong></p>
                <p>Amount Paid ({preview.method.toUpperCase()}): <strong>{formatINR(preview.paidPaise)}</strong></p>
                <p>Remaining Due: <strong>{formatINR(preview.duePaise)}</strong></p>
                {preview.notes && <p>Notes: {preview.notes}</p>}
                <div className="sig-row">
                  <div>Customer Signature</div>
                  <div>Authorised Signature</div>
                </div>
                <p style={{ fontSize: 12, color: '#555', marginTop: 16 }}>Thank you for your business!</p>
              </div>
              {created && (
                <div className="btn-row no-print">
                  <Btn onClick={() => window.print()}>PDF / Print</Btn>
                  {created.mobile && (
                    <a
                      className="btn btn-secondary"
                      href={whatsAppLink(created.mobile, `Namaste ${created.customerName}, ${profile.name} — Receipt ${created.number}: ${created.service}, Total ${formatINR(created.totalPaise)}, Paid ${formatINR(created.paidPaise)}, Due ${formatINR(created.duePaise)}. Dhanyavaad!`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  )}
                  <Btn kind="secondary" onClick={() => duplicateReceipt(created)}>Duplicate</Btn>
                  <Btn kind="ghost" onClick={() => setCreated(null)}>Close</Btn>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
