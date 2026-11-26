'use client';
import React from 'react';
import { useApp } from '@/lib/app-context';
import { listDevRequests, type DevRequest } from '@/lib/dev-requests';

/**
 * Module Requests — the visible development queue (UPDATE 22).
 *
 * Lists the real saved development requests the AI queued from chat
 * (spec → confirm → queued). Every request is status "Queued": a
 * request is a RECORD of the ask, not the module itself. Nothing here
 * claims to be built — a module appears in the app only after it is
 * actually built and tested.
 */
export default function Page() {
  const app = useApp();
  const profile = app.profile;
  const [items, setItems] = React.useState<DevRequest[]>([]);
  React.useEffect(() => {
    if (profile) setItems(listDevRequests(profile.id));
  }, [profile?.id]);
  const kindLabel: Record<DevRequest['kind'], string> = {
    module: 'Module', service: 'Service', feature: 'Feature',
    category: 'Category', field: 'Field', report: 'Report',
  };
  return (
    <div className="card">
      <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>Module Requests</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 16px' }}>
        Development requests queued from the AI Assistant. Each request is a record of what you asked for —
        status stays “Queued” until the change is actually built and tested, and only then will it appear in the app.
        The in-app AI cannot deploy code itself.
      </p>
      {items.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          No requests yet. Ask the AI Assistant, for example “Aadhaar Mobile Number Update ka module bana do” —
          it will show a proposed plan, and save it here once you confirm.
        </p>
      ) : (
        <table>
          <thead>
            <tr><th>Request</th><th>Type</th><th>Status</th><th>Asked on</th></tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>{r.spec.map((s, i) => `${i + 1}. ${s}`).join('\n')}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>“{r.requestedAs}”</div>
                </td>
                <td>{kindLabel[r.kind]}</td>
                <td><span className="chip">Queued</span></td>
                <td>{new Date(r.createdAt).toLocaleDateString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
