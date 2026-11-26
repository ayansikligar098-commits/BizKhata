'use client';
import React from 'react';
import { formatINR, parseAmount } from '@/lib/money';
import { jobDuePaise, jobMarginPaise } from '@/lib/accounting';
import { NON_OUTSOURCEABLE_SERVICES, JOB_STATUSES } from '@/lib/categories';
import { auditEntry, whatsAppLink } from '@/lib/store';
import type { DocFile, Job, JobStatus, Method } from '@/lib/types';
import { todayISO, uid } from '@/lib/types';
import { AmountInput, Btn, Card, Empty, Field, Modal, Pager, Stat, formatDate, initials, pageSlice, statusPill, type Ctx } from './ui';

/** Upload a document (local only, max 2 MB). */
export function DocUploader({ ctx, ownerType, ownerId }: { ctx: Ctx; ownerType: 'customer' | 'job'; ownerId: string }) {
  const { state, profile } = ctx;
  const docs = state.docs.filter((d) => d.profileId === profile.id && d.ownerType === ownerType && d.ownerId === ownerId);
  const [error, setError] = React.useState('');

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { setError('File is too big (max 2 MB in this version).'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const doc: DocFile = {
        id: uid('doc'), profileId: profile.id, ownerType, ownerId,
        name: f.name, mime: f.type || 'application/octet-stream',
        dataUrl: String(reader.result || ''), category: 'Document', notes: '',
        uploadedAt: new Date().toISOString(),
      };
      ctx.mutate((s) => { s.docs.push(doc); }, [auditEntry(profile.id, 'create', 'DocFile', doc.id, '', `Uploaded ${f.name}`)]);
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  }

  return (
    <div>
      <label className="btn btn-secondary" style={{ display: 'inline-block', cursor: 'pointer' }}>
        Upload Document
        <input type="file" hidden onChange={onFile} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
      </label>
      {error && <p className="error">{error}</p>}
      {docs.length === 0 ? (
        <p className="field-hint">No documents uploaded yet. PDF, JPG, PNG accepted.</p>
      ) : (
        <ul>
          {docs.map((d) => (
            <li key={d.id} style={{ marginBottom: 6 }}>
              <a href={d.dataUrl} download={d.name}>{d.name}</a>{' '}
              <span className="field-hint">{formatDate(d.uploadedAt)}</span>{' '}
              <Btn kind="ghost" onClick={() => {
                if (!window.confirm('Delete this document? It goes to the Recycle Bin.')) return;
                ctx.softDelete('DocFile', d.name, d, (s) => { s.docs = s.docs.filter((x) => x.id !== d.id); });
              }}>Delete</Btn>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ServicesView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const [serviceFilter, setServiceFilter] = React.useState<string>('All');
  const [statusFilter, setStatusFilter] = React.useState<string>('All');
  const [search, setSearch] = React.useState('');
  const [showForm, setShowForm] = React.useState(false);
  const [payJob, setPayJob] = React.useState<Job | null>(null);
  const [payAmount, setPayAmount] = React.useState(0);
  const [payMethod, setPayMethod] = React.useState<Method>('cash');
  const [page, setPage] = React.useState(1);

  // form state
  const [service, setService] = React.useState(profile.services[0] || 'Xerox');
  const [customerName, setCustomerName] = React.useState('');
  const [mobile, setMobile] = React.useState('');
  const [refNo, setRefNo] = React.useState('');
  const [status, setStatus] = React.useState<JobStatus>('New');
  const [total, setTotal] = React.useState(0);
  const [received, setReceived] = React.useState(0);
  const [method, setMethod] = React.useState<Method>('cash');
  const [agentId, setAgentId] = React.useState('');
  const [agentCharge, setAgentCharge] = React.useState(0);
  const [notes, setNotes] = React.useState('');
  const [error, setError] = React.useState('');

  const agents = state.agents.filter((a) => a.profileId === pid && a.status === 'Active');
  const allJobs = state.jobs.filter((j) => j.profileId === pid);
  const jobs = allJobs
    .filter((j) => serviceFilter === 'All' || j.service === serviceFilter)
    .filter((j) => statusFilter === 'All' || j.status === statusFilter)
    .filter((j) => !search || j.customerName.toLowerCase().includes(search.toLowerCase()) || j.mobile.includes(search))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // Jump from dashboard quick-service buttons / sidebar service list.
  const jumpNonce = ctx.serviceJump?.nonce;
  React.useEffect(() => {
    if (!ctx.serviceJump) return;
    setServiceFilter(ctx.serviceJump.service);
    setService(ctx.serviceJump.service);
    setStatusFilter('All');
    if (ctx.serviceJump.openForm) setShowForm(true);
  }, [jumpNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const sumTotal = jobs.reduce((s, j) => s + j.totalPaise, 0);
  const sumReceived = jobs.reduce((s, j) => s + j.receivedPaise, 0);
  const sumDue = jobs.reduce((s, j) => s + jobDuePaise(j), 0);
  const countCompleted = jobs.filter((j) => j.status === 'Completed' || j.status === 'Delivered').length;
  const countPending = jobs.filter((j) => j.status === 'Pending' || j.status === 'In Progress' || j.status === 'New').length;
  const pageJobs = pageSlice(jobs, page, 8);
  React.useEffect(() => { setPage(1); }, [serviceFilter, statusFilter, search]);

  const isPan = service === 'PAN Card';

  function submit() {
    if (!customerName.trim()) { setError('Enter the customer name.'); return; }
    if (total <= 0) { setError('Enter the total fees (more than 0).'); return; }
    if (received > total) { setError('Received cannot be more than total fees.'); return; }
    if (isPan && agentId) { setError('PAN work is done by you yourself — it can never be assigned to an agent.'); return; }
    const job: Job = {
      id: uid('job'), profileId: pid, service, customerName, mobile, refNo, status,
      totalPaise: total, receivedPaise: received, receivedMethod: method,
      agentId: agentId || null, agentChargePaise: agentId ? agentCharge : 0, agentPaidPaise: 0,
      date: todayISO(), notes, docIds: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    ctx.mutate((s) => {
      s.jobs.push(job);
      // Only actually-received money touches the cash/UPI book.
      if (received > 0) {
        s.cashTxns.push({
          id: uid('txn'), profileId: pid, kind: 'in', method,
          amountPaise: received, category: `${service} — ${customerName}`, note: `Job payment (${job.id})`,
          date: todayISO(), jobId: job.id, createdAt: new Date().toISOString(),
        });
      }
      // Keep a customer record in sync.
      if (!s.customers.some((c) => c.profileId === pid && c.mobile === mobile && mobile)) {
        s.customers.push({ id: uid('cus'), profileId: pid, name: customerName, mobile, notes: '', docIds: [], createdAt: new Date().toISOString() });
      }
    }, [auditEntry(pid, 'create', 'Job', job.id, '', `${service} for ${customerName}: total ${formatINR(total)}, received ${formatINR(received)}`)]);
    setShowForm(false); setCustomerName(''); setMobile(''); setRefNo(''); setTotal(0); setReceived(0); setAgentId(''); setAgentCharge(0); setNotes(''); setError('');
  }

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

  return (
    <div>
      {serviceFilter !== 'All' && (
        <div className="page-head">
          <div>
            <h2 style={{ margin: 0 }}>{serviceFilter}</h2>
            <p className="page-sub" style={{ margin: 0 }}>{jobs.length} job{jobs.length === 1 ? '' : 's'} • {formatINR(sumReceived)} received • {formatINR(sumDue)} due</p>
          </div>
          <Btn kind="secondary" onClick={() => setServiceFilter('All')}>← All Services</Btn>
        </div>
      )}
      <div className="summary-strip">
        <div className="summary-chip"><div className="sc-label">Total Jobs</div><div className="sc-value">{jobs.length}</div></div>
        <div className="summary-chip"><div className="sc-label">Completed</div><div className="sc-value">{countCompleted}</div></div>
        <div className="summary-chip"><div className="sc-label">Pending</div><div className="sc-value">{countPending}</div></div>
        <div className="summary-chip"><div className="sc-label">Billed</div><div className="sc-value">{formatINR(sumTotal)}</div></div>
        <div className="summary-chip"><div className="sc-label">Received</div><div className="sc-value">{formatINR(sumReceived)}</div></div>
        <div className="summary-chip"><div className="sc-label">Due</div><div className="sc-value" style={{ color: 'var(--danger)' }}>{formatINR(sumDue)}</div></div>
      </div>
      <Card
        title="Service Jobs"
        right={<Btn onClick={() => setShowForm(true)}>+ Add Job</Btn>}
      >
        <div className="form-row">
          <Field label="Service">
            <select className="input" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
              <option value="All">All Services</option>
              {profile.services.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Search customer / mobile">
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or mobile" />
          </Field>
        </div>
        <div className="pills" style={{ marginBottom: 12 }} aria-label="Status filter">
          {['All', 'New', 'In Progress', 'Submitted', 'Pending', 'Completed', 'Delivered'].map((s) => (
            <button key={s} className={statusFilter === s ? 'active' : ''} onClick={() => setStatusFilter(s)}>
              {s === 'All' ? `All (${allJobs.length})` : `${s} (${allJobs.filter((j) => j.status === s).length})`}
            </button>
          ))}
        </div>
        {jobs.length === 0 ? (
          <Empty text="No jobs yet. Add your first job — the app starts empty." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Service</th><th>Status</th><th className="num">Total</th><th className="num">Received</th><th className="num">Due</th><th className="num">Margin</th><th>Agent</th><th></th></tr></thead>
              <tbody>
                {pageJobs.map((j) => {
                  const agent = state.agents.find((a) => a.id === j.agentId);
                  return (
                    <tr key={j.id}>
                      <td>
                        <div className="cell-with-ico">
                          <span className="avatar sm">{initials(j.customerName)}</span>
                          <span>
                            <span className="cell-main">{j.customerName}</span><br />
                            <span className="cell-sub">{j.mobile}{j.refNo ? ` • Ref ${j.refNo}` : ''}</span>
                          </span>
                        </div>
                      </td>
                      <td>{j.service}</td>
                      <td>
                        <select className="input" style={{ padding: '6px', minWidth: 120 }} value={j.status} onChange={(e) => {
                          const ns = e.target.value as JobStatus;
                          ctx.mutate((s) => {
                            const x = s.jobs.find((y) => y.id === j.id);
                            if (x) { x.status = ns; x.updatedAt = new Date().toISOString(); }
                          }, [auditEntry(pid, 'update', 'Job', j.id, `status ${j.status}`, `status ${ns}`)]);
                        }}>
                          {JOB_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="num">{formatINR(j.totalPaise)}</td>
                      <td className="num">{formatINR(j.receivedPaise)}</td>
                      <td className="num">{formatINR(jobDuePaise(j))}</td>
                      <td className="num">{formatINR(jobMarginPaise(j))}</td>
                      <td>{agent ? agent.name : '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {jobDuePaise(j) > 0 && <Btn kind="ghost" onClick={() => setPayJob(j)}>Payment</Btn>}
                        <Btn kind="ghost" onClick={() => {
                          if (!window.confirm('Move this job to the Recycle Bin?')) return;
                          ctx.softDelete('Job', `${j.service} — ${j.customerName} ${formatINR(j.totalPaise)}`, j, (s) => {
                            s.jobs = s.jobs.filter((x) => x.id !== j.id);
                          });
                        }}>Delete</Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager total={jobs.length} page={page} pageSize={8} onPage={setPage} />
          </div>
        )}
        <p className="field-hint">Margin = received − agent charges. Customer due and agent payable are separate ledgers.</p>
      </Card>

      {showForm && (
        <Modal title="Add Job" onClose={() => setShowForm(false)}>
          <div className="form-row">
            <Field label="Service">
              <select className="input" value={service} onChange={(e) => { setService(e.target.value); setAgentId(''); }}>
                {profile.services.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as JobStatus)}>
                {JOB_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <div className="form-row">
            <Field label="Customer Name"><input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></Field>
            <Field label="Mobile"><input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" /></Field>
          </div>
          <Field label="Application Reference No. (optional)"><input className="input" value={refNo} onChange={(e) => setRefNo(e.target.value)} /></Field>
          <div className="form-row">
            <Field label="Total Fees (₹)"><AmountInput valuePaise={total} onChange={setTotal} /></Field>
            <Field label="Amount Received (₹)" hint="Only this counts as cash/UPI. Due = total − received.">
              <AmountInput valuePaise={received} onChange={setReceived} />
            </Field>
            <Field label="Payment Method">
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
              </select>
            </Field>
          </div>
          <Field label="Assign Agent (optional)">
            {isPan ? (
              <p className="field-hint" style={{ color: 'var(--warn)' }}>
                PAN work is done by you yourself — it can never be assigned to an agent.
              </p>
            ) : (
              <select className="input" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">No agent (I do it myself)</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.type}</option>)}
              </select>
            )}
          </Field>
          {agentId && (
            <Field label="Agent Charges (₹)"><AmountInput valuePaise={agentCharge} onChange={setAgentCharge} /></Field>
          )}
          <Field label="Notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {error && <p className="error">{error}</p>}
          <div className="btn-row">
            <Btn onClick={submit}>Save Job</Btn>
            <Btn kind="secondary" onClick={() => setShowForm(false)}>Cancel</Btn>
          </div>
        </Modal>
      )}

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
    </div>
  );
}

export function CustomersView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const [search, setSearch] = React.useState('');
  const [name, setName] = React.useState('');
  const [mobile, setMobile] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [page, setPage] = React.useState(1);

  const customers = state.customers
    .filter((c) => c.profileId === pid)
    .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.mobile.includes(search))
    .sort((a, b) => a.name.localeCompare(b.name));
  const pageCustomers = pageSlice(customers, page, 8);
  React.useEffect(() => { setPage(1); }, [search]);

  function addCustomer() {
    if (!name.trim()) return;
    ctx.mutate((s) => {
      s.customers.push({ id: uid('cus'), profileId: pid, name, mobile, notes, docIds: [], createdAt: new Date().toISOString() });
    }, [auditEntry(pid, 'create', 'Customer', name, '', `Customer ${name} (${mobile})`)]);
    setName(''); setMobile(''); setNotes('');
  }

  return (
    <div>
      <Card title="Customers">
        <div className="form-row">
          <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" /></Field>
          <Field label="Mobile"><input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" /></Field>
          <Field label="Notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <Btn onClick={addCustomer}>+ Add Customer</Btn>
        <div style={{ marginTop: 16 }}>
          <Field label="Search">
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or mobile" />
          </Field>
        </div>
        {customers.length === 0 ? (
          <Empty text="No customers yet." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Mobile</th><th className="num">Jobs</th><th className="num">Total Due</th><th></th></tr></thead>
              <tbody>
                {pageCustomers.map((c) => {
                  const cj = state.jobs.filter((j) => j.profileId === pid && (j.mobile === c.mobile || j.customerName === c.name));
                  const due = cj.reduce((s, j) => s + jobDuePaise(j), 0);
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="cell-with-ico">
                          <span className="avatar sm">{initials(c.name)}</span>
                          <span className="cell-main">{c.name}</span>
                        </div>
                      </td>
                      <td>{c.mobile}</td>
                      <td className="num">{cj.length}</td>
                      <td className="num">{formatINR(due)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <Btn kind="ghost" onClick={() => ctx.openCustomer?.(c.id)}>Open Profile</Btn>
                        <Btn kind="ghost" onClick={() => {
                          if (!window.confirm('Move this customer to the Recycle Bin?')) return;
                          ctx.softDelete('Customer', `${c.name} (${c.mobile})`, c, (s) => {
                            s.customers = s.customers.filter((x) => x.id !== c.id);
                          });
                        }}>Delete</Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager total={customers.length} page={page} pageSize={8} onPage={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}

export function KhataView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const jobs = state.jobs.filter((j) => j.profileId === pid);
  const byCustomer = new Map<string, { name: string; mobile: string; total: number; received: number; jobs: Job[] }>();
  for (const j of jobs) {
    const key = j.mobile || j.customerName;
    const cur = byCustomer.get(key) || { name: j.customerName, mobile: j.mobile, total: 0, received: 0, jobs: [] };
    cur.total += j.totalPaise;
    cur.received += j.receivedPaise;
    cur.jobs.push(j);
    byCustomer.set(key, cur);
  }
  const rows = [...byCustomer.values()].sort((a, b) => (b.total - b.received) - (a.total - a.received));
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const filteredRows = rows.filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.mobile.includes(search));
  const pageRows = pageSlice(filteredRows, page, 8);
  React.useEffect(() => { setPage(1); }, [search]);
  const totalBilled = rows.reduce((s, r) => s + r.total, 0);
  const totalReceived = rows.reduce((s, r) => s + r.received, 0);
  const totalDue = totalBilled - totalReceived;

  return (
    <div>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <Stat label="Total Billed" value={formatINR(totalBilled)} tone="blue" />
        <Stat label="Total Received" value={formatINR(totalReceived)} tone="green" />
        <Stat label="Total Due" value={formatINR(totalDue)} tone={totalDue > 0 ? 'red' : 'green'} sub={`${rows.filter((r) => r.total - r.received > 0).length} customers owe you`} />
      </div>
      <Card title="Customer Khata — per-customer ledger">
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Outstanding is NEVER money already received. Only actual received payments increase
          cash/UPI. Advance, partial and full payments are all recorded per job. Click a customer
          to open their full profile — ledger, jobs, payments and documents.
        </p>
        <Field label="Search customer">
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or mobile" />
        </Field>
        {filteredRows.length === 0 ? (
          <Empty text="No customer ledgers yet — add a job first." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Mobile</th><th className="num">Jobs</th><th className="num">Total Billed</th><th className="num">Received</th><th className="num">Due</th><th></th></tr></thead>
              <tbody>
                {pageRows.map((r) => {
                  const cust = state.customers.find((c) => c.profileId === pid && (c.mobile === r.mobile || c.name === r.name));
                  return (
                    <tr key={r.mobile + r.name}>
                      <td>
                        <div className="cell-with-ico">
                          <span className="avatar sm">{initials(r.name)}</span>
                          <span className="cell-main">{r.name}</span>
                        </div>
                      </td>
                      <td>{r.mobile}</td><td className="num">{r.jobs.length}</td>
                      <td className="num">{formatINR(r.total)}</td>
                      <td className="num">{formatINR(r.received)}</td>
                      <td className="num"><span className={r.total - r.received > 0 ? 'pill due' : 'pill paid'}>{formatINR(r.total - r.received)}</span></td>
                      <td>{cust && <Btn kind="ghost" onClick={() => ctx.openCustomer?.(cust.id)}>Open Profile →</Btn>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager total={filteredRows.length} page={page} pageSize={8} onPage={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
