'use client';
import React from 'react';
import { formatINR } from '@/lib/money';
import { agentPayablePaise, equipmentLifetimeCostPaise, jobMarginPaise } from '@/lib/accounting';
import { auditEntry, exportCSV } from '@/lib/store';
import type { Agent, Equipment, Expense, MaintenanceRecord, Method } from '@/lib/types';
import { todayISO, uid } from '@/lib/types';
import { AmountInput, Btn, Card, Empty, Field, Modal, Pager, Stat, formatDate, initials, pageSlice, type Ctx } from './ui';
import { jobServices } from '@/lib/routes';

export function AgentsView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const agents = state.agents.filter((a) => a.profileId === pid);
  const jobs = state.jobs.filter((j) => j.profileId === pid);
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState('');
  const [mobile, setMobile] = React.useState('');
  const [type, setType] = React.useState('Aadhaar Backend Agent');
  const [notes, setNotes] = React.useState('');
  const [payJobId, setPayJobId] = React.useState('');
  const [payAmount, setPayAmount] = React.useState(0);
  const [payMethod, setPayMethod] = React.useState<Method>('cash');
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);

  const filteredAgents = agents.filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.mobile.includes(search) || a.type.toLowerCase().includes(search.toLowerCase()));
  const pageAgents = pageSlice(filteredAgents, page, 8);
  React.useEffect(() => { setPage(1); }, [search]);
  const agentJobsAll = jobs.filter((j) => j.agentId);
  const totalCharges = agentJobsAll.reduce((s, j) => s + j.agentChargePaise, 0);
  const totalPaid = agentJobsAll.reduce((s, j) => s + j.agentPaidPaise, 0);
  const totalPayable = agents.reduce((s, a) => s + agentPayablePaise(a, jobs), 0);

  function addAgent() {
    if (!name.trim()) { setError('Enter the agent name.'); return; }
    const a: Agent = { id: uid('agt'), profileId: pid, name, mobile, type, status: 'Active', notes };
    ctx.mutate((s) => { s.agents.push(a); }, [auditEntry(pid, 'create', 'Agent', a.id, '', `Agent ${name} (${type})`)]);
    setShowForm(false); setName(''); setMobile(''); setNotes(''); setError('');
  }

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
        <Stat label="Total Agents" value={String(agents.length)} tone="blue" />
        <Stat label="Total Jobs" value={String(agentJobsAll.length)} tone="indigo" />
        <Stat label="Total Charges" value={formatINR(totalCharges)} tone="purple" />
        <Stat label="Total Paid" value={formatINR(totalPaid)} tone="green" />
        <Stat label="Payable" value={formatINR(totalPayable)} tone={totalPayable > 0 ? 'orange' : 'green'} sub="Separate from customer due" />
      </div>
      <Card title="Agent Management" right={<Btn onClick={() => setShowForm(true)}>+ Add Agent</Btn>}>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          You bring the customer, the agent does the backend work, you print + deliver, then you
          pay the agent. Agent payable is a separate ledger from customer receivable. PAN work is
          never given to an agent.
        </p>
        <Field label="Search agent">
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, mobile or type" />
        </Field>
        {filteredAgents.length === 0 ? (
          <Empty text="No agents yet." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Agent</th><th>Type</th><th className="num">Jobs</th><th className="num">Charges</th><th className="num">Paid</th><th className="num">Payable</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {pageAgents.map((a, i) => {
                  const aj = jobs.filter((j) => j.agentId === a.id);
                  const charges = aj.reduce((s, j) => s + j.agentChargePaise, 0);
                  const paid = aj.reduce((s, j) => s + j.agentPaidPaise, 0);
                  return (
                    <tr key={a.id}>
                      <td>{(page - 1) * 8 + i + 1}</td>
                      <td>
                        <div className="cell-with-ico">
                          <span className="avatar sm">{initials(a.name)}</span>
                          <span>
                            <button className="link-btn" style={{ border: 'none', background: 'transparent', color: 'var(--purple-ink)', fontWeight: 700, cursor: 'pointer', padding: 0 }} onClick={() => ctx.openAgent?.(a.id)}>{a.name}</button>
                            <br /><span className="cell-sub">{a.mobile}</span>
                          </span>
                        </div>
                      </td>
                      <td>{a.type}</td>
                      <td className="num">{aj.length}</td>
                      <td className="num">{formatINR(charges)}</td>
                      <td className="num">{formatINR(paid)}</td>
                      <td className="num">{formatINR(agentPayablePaise(a, jobs))}</td>
                      <td>{a.status}</td>
                      <td><Btn kind="ghost" onClick={() => ctx.openAgent?.(a.id)}>Profile →</Btn></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager total={filteredAgents.length} page={page} pageSize={8} onPage={setPage} />
          </div>
        )}
      </Card>

      <Card title="Agent Jobs & Payments">
        {jobs.filter((j) => j.agentId).length === 0 ? (
          <Empty text="No jobs assigned to agents yet." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Service</th><th>Agent</th><th className="num">Charge</th><th className="num">Paid</th><th className="num">Payable</th><th className="num">Margin</th><th>Status</th></tr></thead>
              <tbody>
                {jobs.filter((j) => j.agentId).map((j) => {
                  const a = agents.find((x) => x.id === j.agentId);
                  return (
                    <tr key={j.id}>
                      <td>{j.customerName}</td><td>{j.service}</td><td>{a?.name || '—'}</td>
                      <td className="num">{formatINR(j.agentChargePaise)}</td>
                      <td className="num">{formatINR(j.agentPaidPaise)}</td>
                      <td className="num">{formatINR(Math.max(0, j.agentChargePaise - j.agentPaidPaise))}</td>
                      <td className="num">{formatINR(jobMarginPaise(j))}</td>
                      <td>{j.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="form-row" style={{ marginTop: 16 }}>
          <Field label="Pay agent for job">
            <select className="input" value={payJobId} onChange={(e) => setPayJobId(e.target.value)}>
              <option value="">Select a job with agent payable…</option>
              {jobs.filter((j) => j.agentId && j.agentChargePaise - j.agentPaidPaise > 0).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.customerName} — {j.service} — payable {formatINR(j.agentChargePaise - j.agentPaidPaise)}
                </option>
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

      {showForm && (
        <Modal title="Add Agent" onClose={() => setShowForm(false)}>
          <div className="form-row">
            <Field label="Agent Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Mobile"><input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" /></Field>
          </div>
          <Field label="Agent Type">
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option>Aadhaar Backend Agent</option>
              <option>Aadhaar Aavak Dhakla Agent</option>
              <option>Licence Agent</option>
              <option>Other Agent</option>
            </select>
          </Field>
          <Field label="Notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {error && <p className="error">{error}</p>}
          <div className="btn-row">
            <Btn onClick={addAgent}>Save Agent</Btn>
            <Btn kind="secondary" onClick={() => setShowForm(false)}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function ExpensesView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const expenses = [...state.expenses.filter((e) => e.profileId === pid)].sort((a, b) => (a.date < b.date ? 1 : -1));
  const equipment = state.equipment.filter((e) => e.profileId === pid);
  const [showForm, setShowForm] = React.useState(false);
  const [category, setCategory] = React.useState(profile.expenseCategories[0] || 'Other');
  const [customCat, setCustomCat] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [amount, setAmount] = React.useState(0);
  const [method, setMethod] = React.useState<Method>('cash');
  const [vendor, setVendor] = React.useState('');
  const [service, setService] = React.useState('General');
  const [equipmentId, setEquipmentId] = React.useState('');
  const [date, setDate] = React.useState(todayISO());
  const [error, setError] = React.useState('');
  const [catFilter, setCatFilter] = React.useState('All');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);

  const thisMonth = todayISO().slice(0, 7);
  const monthTotal = expenses.filter((e) => e.date.slice(0, 7) === thisMonth).reduce((s, e) => s + e.amountPaise, 0);
  const equipmentTotal = expenses.filter((e) => e.equipmentId).reduce((s, e) => s + e.amountPaise, 0);
  const maintenanceTotal = expenses.filter((e) => e.category.toLowerCase().includes('maintenance') || e.category.toLowerCase().includes('service')).reduce((s, e) => s + e.amountPaise, 0);
  const generalTotal = expenses.filter((e) => e.service === 'General').reduce((s, e) => s + e.amountPaise, 0);
  const categories = [...new Set(expenses.map((e) => e.category))];
  const filteredExpenses = expenses
    .filter((e) => catFilter === 'All' || e.category === catFilter)
    .filter((e) => !search || e.description.toLowerCase().includes(search.toLowerCase()) || e.vendor.toLowerCase().includes(search.toLowerCase()) || e.category.toLowerCase().includes(search.toLowerCase()));
  const pageExpenses = pageSlice(filteredExpenses, page, 8);
  React.useEffect(() => { setPage(1); }, [catFilter, search]);

  function submit() {
    if (amount <= 0) { setError('Enter an amount more than 0.'); return; }
    const cat = category === '__custom' ? customCat.trim() : category;
    if (!cat) { setError('Enter a category.'); return; }
    const ex: Expense = {
      id: uid('exp'), profileId: pid, category: cat, equipmentId: equipmentId || null,
      description: description || cat, amountPaise: amount, method, vendor, date,
      service, notes: '', createdAt: new Date().toISOString(),
    };
    ctx.mutate((s) => {
      s.expenses.push(ex);
      s.cashTxns.push({
        id: uid('txn'), profileId: pid, kind: 'out', method, amountPaise: amount,
        category: `Expense — ${cat}`, note: description || cat, date, createdAt: new Date().toISOString(),
      });
    }, [auditEntry(pid, 'create', 'Expense', ex.id, '', `${cat} ${formatINR(amount)} (${method})`)]);
    setShowForm(false); setAmount(0); setDescription(''); setVendor(''); setCustomCat(''); setError('');
  }

  return (
    <div>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="This Month" value={formatINR(monthTotal)} tone="red" />
        <Stat label="Equipment" value={formatINR(equipmentTotal)} tone="blue" sub="Linked to a machine" />
        <Stat label="Maintenance" value={formatINR(maintenanceTotal)} tone="orange" />
        <Stat label="General" value={formatINR(generalTotal)} tone="purple" sub="Shared shop expenses" />
      </div>
      <Card title="Expenses" right={<Btn onClick={() => setShowForm(true)}>+ Add Expense</Btn>}>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Link an expense to the right service (e.g. ink to Printing) so service profit stays
          accurate. Shared expenses use service “General”.
        </p>
        <div className="form-row">
          <Field label="Search">
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Description, vendor or category" />
          </Field>
          <Field label="Month">
            <input className="input" type="month" value={thisMonth} readOnly />
          </Field>
        </div>
        <div className="pills" style={{ marginBottom: 12 }} aria-label="Category filter">
          <button className={catFilter === 'All' ? 'active' : ''} onClick={() => setCatFilter('All')}>All ({expenses.length})</button>
          {categories.map((c) => (
            <button key={c} className={catFilter === c ? 'active' : ''} onClick={() => setCatFilter(c)}>
              {c} ({expenses.filter((e) => e.category === c).length})
            </button>
          ))}
        </div>
        {filteredExpenses.length === 0 ? (
          <Empty text="No expenses yet." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Date</th><th>Expense</th><th>Category</th><th>Service</th><th>Vendor</th><th className="num">Amount</th><th>Method</th><th></th></tr></thead>
              <tbody>
                {pageExpenses.map((e, i) => (
                  <tr key={e.id}>
                    <td>{(page - 1) * 8 + i + 1}</td>
                    <td>{formatDate(e.date)}</td>
                    <td><span className="cell-main">{e.description}</span></td>
                    <td><span className="pill">{e.category}</span></td>
                    <td>{e.service}</td><td>{e.vendor}</td>
                    <td className="num">{formatINR(e.amountPaise)}</td><td>{e.method.toUpperCase()}</td>
                    <td>
                      <Btn kind="ghost" onClick={() => {
                        if (!window.confirm('Move this expense to the Recycle Bin?')) return;
                        ctx.softDelete('Expense', `${e.category} ${formatINR(e.amountPaise)}`, e, (s) => {
                          s.expenses = s.expenses.filter((x) => x.id !== e.id);
                        });
                      }}>Delete</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager total={filteredExpenses.length} page={page} pageSize={8} onPage={setPage} />
          </div>
        )}
      </Card>
      {showForm && (
        <Modal title="Add Expense" onClose={() => setShowForm(false)}>
          <div className="form-row">
            <Field label="Category">
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {profile.expenseCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__custom">+ Custom category…</option>
              </select>
            </Field>
            {category === '__custom' && (
              <Field label="Custom Category"><input className="input" value={customCat} onChange={(e) => setCustomCat(e.target.value)} /></Field>
            )}
            <Field label="Service (for profit)">
              <select className="input" value={service} onChange={(e) => setService(e.target.value)}>
                <option value="General">General (shared)</option>
                {jobServices(profile.services).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Description"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Epson ink bottle" /></Field>
          <div className="form-row">
            <Field label="Amount (₹)"><AmountInput valuePaise={amount} onChange={setAmount} /></Field>
            <Field label="Method">
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
              </select>
            </Field>
            <Field label="Vendor"><input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} /></Field>
          </div>
          <div className="form-row">
            <Field label="Equipment (optional)">
              <select className="input" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
                <option value="">None</option>
                {equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
              </select>
            </Field>
            <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="btn-row">
            <Btn onClick={submit}>Save Expense</Btn>
            <Btn kind="secondary" onClick={() => setShowForm(false)}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function MaintenanceView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const equipment = state.equipment.filter((e) => e.profileId === pid);
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState('');
  const [purchaseDate, setPurchaseDate] = React.useState(todayISO());
  const [purchaseCost, setPurchaseCost] = React.useState(0);
  const [nextMaint, setNextMaint] = React.useState('');
  const [selEq, setSelEq] = React.useState<Equipment | null>(null);
  const [mDesc, setMDesc] = React.useState('');
  const [mParts, setMParts] = React.useState('');
  const [mCost, setMCost] = React.useState(0);
  const [mDate, setMDate] = React.useState(todayISO());
  const [error, setError] = React.useState('');
  const [tab, setTab] = React.useState<'machines' | 'history'>('machines');
  const allRecords = equipment.flatMap((eq) => eq.records.map((r) => ({ eq, r }))).sort((a, b) => (a.r.date < b.r.date ? 1 : -1));

  function addEquipment() {
    if (!name.trim()) { setError('Enter the machine name.'); return; }
    const eq: Equipment = {
      id: uid('eqp'), profileId: pid, name, purchaseDate,
      purchaseCostPaise: purchaseCost, lastMaintenance: '', nextMaintenance: nextMaint, records: [],
    };
    ctx.mutate((s) => { s.equipment.push(eq); }, [auditEntry(pid, 'create', 'Equipment', eq.id, '', `Equipment ${name}`)]);
    setShowForm(false); setName(''); setPurchaseCost(0); setNextMaint(''); setError('');
  }

  function addMaintenance() {
    if (!selEq) return;
    if (mCost < 0) { setError('Cost cannot be negative.'); return; }
    const rec: MaintenanceRecord = { id: uid('mnt'), date: mDate, description: mDesc || 'Servicing', partsReplaced: mParts, costPaise: mCost };
    ctx.mutate((s) => {
      const eq = s.equipment.find((x) => x.id === selEq.id);
      if (!eq) return;
      eq.records.push(rec);
      eq.lastMaintenance = mDate;
    }, [auditEntry(pid, 'update', 'Equipment', selEq.id, '', `Maintenance: ${rec.description} ${formatINR(mCost)}`)]);
    setSelEq(null); setMDesc(''); setMParts(''); setMCost(0); setError('');
  }

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={tab === 'machines' ? 'active' : ''} onClick={() => setTab('machines')}>Machines ({equipment.length})</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Service History ({allRecords.length})</button>
      </div>
      {tab === 'machines' && (
        <div>
          <div className="btn-row" style={{ marginBottom: 14 }}>
            <Btn onClick={() => setShowForm(true)}>+ Add Machine</Btn>
          </div>
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>
            Track purchase details, parts replaced and lifetime cost per machine — e.g. Epson L805:
            ink + printhead + servicing = total lifetime cost.
          </p>
          {equipment.length === 0 ? (
            <Card><Empty text="No machines added yet. Add your Xerox machine, printers, computer, scanner." /></Card>
          ) : (
            <div className="machine-grid">
              {equipment.map((eq) => {
                const mCost = eq.records.reduce((s, r) => s + r.costPaise, 0);
                const last = eq.records.length ? eq.records[eq.records.length - 1] : null;
                return (
                  <div className="machine-card" key={eq.id}>
                    <div className="mc-head">
                      <span className="row-ico" style={{ width: 44, height: 44, fontSize: 18 }}>▦</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mc-name">{eq.name}</div>
                        <div className="mc-type">Purchased: {formatDate(eq.purchaseDate)}</div>
                      </div>
                      <span className="pill paid">Active</span>
                    </div>
                    <div className="mc-stats">
                      <div><div className="mc-label">Total Cost</div><div className="mc-value">{formatINR(equipmentLifetimeCostPaise(eq.purchaseCostPaise, eq.records))}</div></div>
                      <div><div className="mc-label">Maintenance Cost</div><div className="mc-value">{formatINR(mCost)}</div></div>
                      <div><div className="mc-label">Last Service</div><div className="mc-value">{last ? formatDate(last.date) : eq.lastMaintenance ? formatDate(eq.lastMaintenance) : '—'}</div></div>
                    </div>
                    <p className="field-hint" style={{ margin: '10px 0' }}>
                      Purchase {formatINR(eq.purchaseCostPaise)}
                      {eq.nextMaintenance ? ` • Next service ${formatDate(eq.nextMaintenance)}` : ''}
                      {` • ${eq.records.length} service record${eq.records.length === 1 ? '' : 's'}`}
                    </p>
                    <div className="btn-row">
                      <Btn kind="secondary" onClick={() => setSelEq(eq)}>Add Service Record</Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {tab === 'history' && (
        <Card title="Maintenance History">
          {allRecords.length === 0 ? <Empty text="No service records yet. Open a machine and add a service record." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Machine</th><th>Work</th><th>Parts Replaced</th><th className="num">Cost</th></tr></thead>
                <tbody>
                  {allRecords.map(({ eq, r }) => (
                    <tr key={r.id}><td>{formatDate(r.date)}</td><td>{eq.name}</td><td>{r.description}</td><td>{r.partsReplaced || '—'}</td><td className="num">{formatINR(r.costPaise)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {showForm && (
        <Modal title="Add Machine / Equipment" onClose={() => setShowForm(false)}>
          <Field label="Machine Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Xerox Machine, Epson L805" /></Field>
          <div className="form-row">
            <Field label="Purchase Date"><input className="input" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} /></Field>
            <Field label="Purchase Cost (₹)"><AmountInput valuePaise={purchaseCost} onChange={setPurchaseCost} /></Field>
            <Field label="Next Maintenance Date"><input className="input" type="date" value={nextMaint} onChange={(e) => setNextMaint(e.target.value)} /></Field>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="btn-row">
            <Btn onClick={addEquipment}>Save Machine</Btn>
            <Btn kind="secondary" onClick={() => setShowForm(false)}>Cancel</Btn>
          </div>
        </Modal>
      )}
      {selEq && (
        <Modal title={`Service Record — ${selEq.name}`} onClose={() => setSelEq(null)}>
          <div className="form-row">
            <Field label="Date"><input className="input" type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} /></Field>
            <Field label="Cost (₹)"><AmountInput valuePaise={mCost} onChange={setMCost} /></Field>
          </div>
          <Field label="Work Done"><input className="input" value={mDesc} onChange={(e) => setMDesc(e.target.value)} placeholder="e.g. Printhead repair" /></Field>
          <Field label="Parts Replaced"><input className="input" value={mParts} onChange={(e) => setMParts(e.target.value)} placeholder="e.g. Printhead" /></Field>
          {error && <p className="error">{error}</p>}
          <div className="btn-row">
            <Btn onClick={addMaintenance}>Save Record</Btn>
            <Btn kind="secondary" onClick={() => setSelEq(null)}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
