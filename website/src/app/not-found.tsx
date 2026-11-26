import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <span className="brand-mark" style={{ width: 56, height: 56, fontSize: 30, display: 'inline-flex' }}>B</span>
        <h1 style={{ marginTop: 12 }}>Page not found</h1>
        <p style={{ color: 'var(--muted)' }}>
          This BizKhata page does not exist, or the link you followed is out of date.
          Check the address, or go back to the Dashboard.
        </p>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <Link className="btn" href="/dashboard">Go to Dashboard</Link>
          <Link className="btn btn-secondary" href="/">Home</Link>
        </div>
      </div>
    </div>
  );
}
