'use client';
import React from 'react';
import { formatINR } from '@/lib/money';
import { auditEntry, nextReceiptNumber, whatsAppLink } from '@/lib/store';
import type { Receipt } from '@/lib/types';
import { uid } from '@/lib/types';
import { Btn, Card, Empty, Field, Pager, formatDate, pageSlice, type Ctx } from './ui';

export function ReceiptsView({ ctx }: { ctx: Ctx }) {
  const { state, profile } = ctx;
  const pid = profile.id;
  const jobs = state.jobs.filter((j) => j.profileId === pid);
  const receipts = [...state.receipts.filter((r) => r.profileId === pid)].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const [jobId, setJobId] = React.useState('');
  const [layout, setLayout] = React.useState<'A4' | 'Thermal'>('A4');
  const [viewReceipt, setViewReceipt] = React.useState<Receipt | null>(null);
  const [error, setError] = React.useState('');
  const [page, setPage] = React.useState(1);
  const pageReceipts = pageSlice(receipts, page, 8);

  function createReceipt() {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) { setError('Select a job first.'); return; }
    const number = nextReceiptNumber(profile);
    const r: Receipt = {
      id: uid('rcp'), profileId: pid, number, jobId: job.id,
      customerName: job.customerName, mobile: job.mobile, service: job.service,
      totalPaise: job.totalPaise, paidPaise: job.receivedPaise,
      duePaise: Math.max(0, job.totalPaise - job.receivedPaise),
      method: job.receivedMethod, date: job.date, notes: job.notes, layout,
      createdAt: new Date().toISOString(),
    };
    ctx.mutate((s) => {
      s.receipts.push(r);
      const p = s.profiles.find((x) => x.id === pid);
      if (p) p.receiptCounter += 1;
    }, [auditEntry(pid, 'create', 'Receipt', r.id, '', `Receipt ${number} for ${job.customerName} — ${formatINR(job.totalPaise)}`)]);
    setJobId(''); setError('');
    setViewReceipt(r);
  }

  function duplicateReceipt(r: Receipt) {
    const number = nextReceiptNumber(profile);
    const copy: Receipt = { ...r, id: uid('rcp'), number, createdAt: new Date().toISOString() };
    ctx.mutate((s) => {
      s.receipts.push(copy);
      const p = s.profiles.find((x) => x.id === pid);
      if (p) p.receiptCounter += 1;
    }, [auditEntry(pid, 'create', 'Receipt', copy.id, '', `Duplicate of ${r.number} as ${number}`)]);
    setViewReceipt(copy);
  }

  const printReceipt = (r: Receipt) => {
    setViewReceipt(r);
    setTimeout(() => window.print(), 100);
  };

  return (
    <div>
      <Card title="Receipts & Invoices">
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Professional receipts with your business details, unique numbers starting {profile.receiptPrefix}-0001,
          A4 and thermal layouts, signature section, and Paid vs Due shown clearly.
        </p>
        <div className="form-row">
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
        </div>
        {error && <p className="error">{error}</p>}
        <Btn onClick={createReceipt} disabled={!jobId}>+ Create Receipt</Btn>
      </Card>

      <Card title="Receipt History">
        {receipts.length === 0 ? (
          <Empty text="No receipts yet." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>No.</th><th>Date</th><th>Customer</th><th>Service</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Due</th><th></th></tr></thead>
              <tbody>
                {pageReceipts.map((r) => (
                  <tr key={r.id}>
                    <td>{r.number}</td>
                    <td>{formatDate(r.date)}</td>
                    <td>{r.customerName}</td>
                    <td>{r.service}</td>
                    <td className="num">{formatINR(r.totalPaise)}</td>
                    <td className="num"><span className="pill paid">{formatINR(r.paidPaise)}</span></td>
                    <td className="num"><span className={r.duePaise > 0 ? 'pill due' : 'pill paid'}>{formatINR(r.duePaise)}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Btn kind="ghost" onClick={() => setViewReceipt(r)}>View</Btn>
                      <Btn kind="ghost" onClick={() => printReceipt(r)}>PDF / Print</Btn>
                      <Btn kind="ghost" onClick={() => duplicateReceipt(r)}>Duplicate</Btn>
                      {r.mobile && (
                        <a
                          className="btn btn-ghost"
                          href={whatsAppLink(r.mobile, `Namaste ${r.customerName}, ${profile.name} — Receipt ${r.number}: ${r.service}, Total ${formatINR(r.totalPaise)}, Paid ${formatINR(r.paidPaise)}, Due ${formatINR(r.duePaise)}. Dhanyavaad!`)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          WhatsApp
                        </a>
                      )}
                      <Btn kind="ghost" onClick={() => {
                        if (!window.confirm('Move this receipt to the Recycle Bin?')) return;
                        ctx.softDelete('Receipt', `Receipt ${r.number} — ${r.customerName}`, r, (s) => {
                          s.receipts = s.receipts.filter((x) => x.id !== r.id);
                        });
                      }}>Delete</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager total={receipts.length} page={page} pageSize={8} onPage={setPage} />
          </div>
        )}
      </Card>

      {viewReceipt && (
        <Card title={`Receipt ${viewReceipt.number} — ${viewReceipt.layout} layout`}>
          <div className={viewReceipt.layout === 'Thermal' ? 'receipt-print receipt-thermal' : 'receipt-print'}>
            <h1>{profile.name}</h1>
            <p>{profile.address || 'CSC Center'}{profile.mobile ? ` • ${profile.mobile}` : ''}</p>
            <hr />
            <p><strong>Receipt No:</strong> {viewReceipt.number} &nbsp; <strong>Date:</strong> {formatDate(viewReceipt.date)}</p>
            <p><strong>Customer:</strong> {viewReceipt.customerName} {viewReceipt.mobile ? `(${viewReceipt.mobile})` : ''}</p>
            <p><strong>Service:</strong> {viewReceipt.service}</p>
            <hr />
            <p>Total Fees: <strong>{formatINR(viewReceipt.totalPaise)}</strong></p>
            <p>Amount Paid ({viewReceipt.method.toUpperCase()}): <strong>{formatINR(viewReceipt.paidPaise)}</strong></p>
            <p>Remaining Due: <strong>{formatINR(viewReceipt.duePaise)}</strong></p>
            {viewReceipt.notes && <p>Notes: {viewReceipt.notes}</p>}
            <div className="sig-row">
              <div>Customer Signature</div>
              <div>Authorised Signature</div>
            </div>
            <p style={{ fontSize: 12, color: '#555', marginTop: 16 }}>Thank you for your business!</p>
          </div>
          <div className="btn-row no-print">
            <Btn onClick={() => window.print()}>PDF / Print</Btn>
            <Btn kind="secondary" onClick={() => setViewReceipt(null)}>Close</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}
