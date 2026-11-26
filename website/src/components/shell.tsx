'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CATEGORIES } from '@/lib/categories';
import { t, LANG_OPTIONS } from '@/lib/i18n';
import { formatINR } from '@/lib/money';
import { agentPayablePaise, totalCustomerDuePaise } from '@/lib/accounting';
import { routeForKey, routeForPath, serviceFromSlug, serviceLabel, serviceSlug, jobServices } from '@/lib/routes';
import type { Lang } from '@/lib/types';
import { Btn, Field, Modal } from '@/components/ui';
import { ChatWidget } from '@/components/chatbot';
import { useApp } from '@/lib/app-context';

/** Branded loading screen — shown while the session is verified. Never a login flash. */
export function LoadingScreen({ note }: { note?: string }) {
  return (
    <div className="auth-wrap">
      <div className="loading-card">
        <span className="brand-mark" style={{ width: 64, height: 64, fontSize: 34, borderRadius: 16 }}>B</span>
        <h1 style={{ margin: '14px 0 4px', color: 'var(--purple-ink)' }}>BizKhata</h1>
        <p style={{ color: 'var(--muted)', margin: 0 }}>{note || 'Verifying your session…'}</p>
        <div className="spinner" aria-label="Loading" />
      </div>
    </div>
  );
}

/** Offline / session-check-failed screen — retry, never a silent logout. */
export function OfflineScreen() {
  const app = useApp();
  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <span className="brand-mark" style={{ width: 56, height: 56, fontSize: 30, display: 'inline-flex' }}>B</span>
        <h1 style={{ marginTop: 12 }}>You&apos;re offline</h1>
        <p style={{ color: 'var(--muted)' }}>
          BizKhata couldn&apos;t verify your session because there&apos;s no network right now.
          You are NOT logged out — check your connection and retry.
        </p>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <Btn onClick={app.reverify}>Retry Verification</Btn>
          <Btn kind="secondary" onClick={() => window.location.reload()}>Reload Page</Btn>
        </div>
      </div>
    </div>
  );
}

function BusinessSetupScreen() {
  const app = useApp();
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1><span className="brand-mark">B</span> Set up your business</h1>
        <p style={{ color: 'var(--muted)' }}>Choose your business category — BizKhata sets up ready-made services for it. You can add up to 3 separate businesses.</p>
        <Field label="Business Name"><input className="input" value={app.bizName} onChange={(e) => app.setBizName(e.target.value)} /></Field>
        <Field label="Business Category">
          <select className="input" value={app.bizCategory} onChange={(e) => app.setBizCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Address (optional)"><input className="input" value={app.bizAddress} onChange={(e) => app.setBizAddress(e.target.value)} /></Field>
        <Field label="Business Mobile"><input className="input" value={app.bizMobile} onChange={(e) => app.setBizMobile(e.target.value)} inputMode="tel" /></Field>
        <div className="btn-row"><Btn onClick={app.createBusiness}>Create Business</Btn></div>
      </div>
    </div>
  );
}

function LanguageScreen() {
  const app = useApp();
  const profile = app.profile;
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1><span className="brand-mark">B</span> Choose your language</h1>
        <p style={{ color: 'var(--muted)' }}>Apni bhasha chuno. You can change it later in Settings.</p>
        <div className="lang-pick">
          {LANG_OPTIONS.map((o) => (
            <button key={o.code} onClick={() => {
              app.mutate((s) => {
                const p = s.profiles.find((x) => x.id === profile.id);
                if (p) p.language = o.code as Lang;
              });
              app.setShowLang(false);
            }}>{o.label}</button>
          ))}
        </div>
        <Btn kind="secondary" onClick={() => app.setShowLang(false)}>Skip (English)</Btn>
      </div>
    </div>
  );
}

const REPORT_SUBS: { type: string; label: string }[] = [
  { type: 'income', label: 'Income Report' },
  { type: 'expenses', label: 'Expense Report' },
  { type: 'profit', label: 'Profit Report' },
  { type: 'service-wise', label: 'Service-wise Report' },
  { type: 'daily-business', label: 'Daily Business Report' },
];

const SETTINGS_SUBS: { section: string; label: string }[] = [
  { section: 'profile', label: 'Business Profiles' },
  { section: 'business', label: 'Business Information' },
  { section: 'language', label: 'Language' },
  { section: 'receipt', label: 'Receipt Settings' },
  { section: 'security', label: 'Security & Privacy' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const { state, profile } = app;
  const lang = profile?.language || 'en';

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [servicesOpen, setServicesOpen] = React.useState(true);
  const [reportsOpen, setReportsOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [searchFocus, setSearchFocus] = React.useState(false);
  const [bellOpen, setBellOpen] = React.useState(false);
  const [ownerMenuOpen, setOwnerMenuOpen] = React.useState(false);

  // Guests never see the login form flashing on a private route: while the
  // session is being verified they see the loading screen, then a redirect.
  React.useEffect(() => {
    if (app.authStatus === 'guest' && pathname) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [app.authStatus, pathname, router]);

  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (!app.hydrated || app.authStatus === 'checking') {
    return <LoadingScreen />;
  }

  if (app.authStatus === 'offline') {
    return <OfflineScreen />;
  }

  if (app.authStatus === 'guest') {
    return <LoadingScreen note="Redirecting to login…" />;
  }

  // A profile exists only when it has a real id. (The context carries a
  // placeholder object before setup so the type stays satisfied — never
  // treat it as a real profile, or the nav reads undefined fields.)
  if (!profile || !profile.id) return <BusinessSetupScreen />;
  if (app.showLang) return <LanguageScreen />;

  const pid = profile.id;
  const jobs = state.jobs.filter((j) => j.profileId === pid);
  const dueJobs = jobs.filter((j) => j.totalPaise - j.receivedPaise > 0);
  const dueTotal = totalCustomerDuePaise(jobs);
  const payableTotal = state.agents.filter((a) => a.profileId === pid).reduce((s, a) => s + agentPayablePaise(a, jobs), 0);
  const pendingMt = state.mtTransfers.filter((m) => m.profileId === pid && m.status === 'Pending').length;
  const notifCount = dueJobs.length + pendingMt;

  // Global search results (customers, jobs, receipts — real saved data only)
  const q = search.trim().toLowerCase();
  type SearchHit = { kind: string; label: string; path: string };
  const hits: SearchHit[] = q
    ? [
        ...state.customers.filter((c) => c.profileId === pid && (c.name.toLowerCase().includes(q) || c.mobile.includes(q)))
          .slice(0, 3).map((c): SearchHit => ({ kind: 'Customer', label: `${c.name} • ${c.mobile}`, path: `/customers?id=${c.id}` })),
        ...jobs.filter((j) => j.customerName.toLowerCase().includes(q) || j.service.toLowerCase().includes(q) || j.refNo.toLowerCase().includes(q) || j.mobile.includes(q))
          .slice(0, 3).map((j): SearchHit => ({ kind: 'Job', label: `${j.service} — ${j.customerName}${j.refNo ? ` • ${j.refNo}` : ''}`, path: `/services/${serviceSlug(j.service)}` })),
        ...state.receipts.filter((r) => r.profileId === pid && (r.number.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q)))
          .slice(0, 3).map((r): SearchHit => ({ kind: 'Receipt', label: `${r.number} — ${r.customerName} • ${r.service}`, path: '/receipts' })),
      ].slice(0, 8)
    : [];

  const cleanPath = (pathname || '').replace(/\/$/, '') || '/';
  const route = routeForPath(cleanPath);
  let pageTitle = route?.title || 'BizKhata';
  let pageSub = route ? `${route.sub} — ${profile.name} • ${profile.category}` : `${profile.name} • ${profile.category}`;
  if (cleanPath.startsWith('/services/')) {
    const slug = cleanPath.split('/')[2] || '';
    const svc = serviceFromSlug(slug);
    if (svc) { pageTitle = svc; pageSub = `${jobs.filter((j) => j.service === svc).length} jobs • ${profile.name}`; }
    else pageTitle = serviceLabel(slug);
  }
  if (cleanPath.startsWith('/reports/')) {
    const type = cleanPath.split('/')[2] || '';
    const found = REPORT_SUBS.find((r) => r.type === type);
    if (found) pageTitle = found.label;
  }
  if (cleanPath.startsWith('/settings/')) {
    const sec = cleanPath.split('/')[2] || '';
    const found = SETTINGS_SUBS.find((r) => r.section === sec);
    if (found) pageTitle = found.label;
  }
  if (cleanPath.startsWith('/customers/') && cleanPath !== '/customers') {
    const c = state.customers.find((x) => x.id === cleanPath.split('/')[2]);
    if (c) { pageTitle = c.name; pageSub = `Customer Profile • ${c.mobile || ''}`; }
  }
  if (cleanPath.startsWith('/agents/') && cleanPath !== '/agents') {
    const a = state.agents.find((x) => x.id === cleanPath.split('/')[2]);
    if (a) { pageTitle = a.name; pageSub = `Agent Profile • ${a.type}`; }
  }

  const isActive = (path: string) => cleanPath === path || (path !== '/dashboard' && cleanPath.startsWith(path + '/'));
  const navLink = (key: string) => {
    const r = routeForKey(key);
    if (r.module && profile.disabledModules.includes(r.module)) return null;
    const label = key === 'customer-profile' ? 'Customer Profile'
      : key === 'agent-profile' ? 'Agent Profile'
      : key === 'agent-payments' ? 'Agent Payments'
      : key === 'receipt-generator' ? 'Receipt Generator'
      : key === 'chatbot' ? 'Chatbot / AI Assistant'
      : t(lang, ({ dashboard: 'dashboard', cash: 'cashBook', upi: 'upiBook', mt: 'moneyTransfer', services: 'services', customers: 'customers', khata: 'customerKhata', agents: 'agents', expenses: 'expenses', maintenance: 'maintenance', receipts: 'receipts', daily: 'dailyBusiness', reports: 'reports', difference: 'differenceFinder', recycle: 'recycleBin', audit: 'auditLog', customize: 'customization', settings: 'settings' } as Record<string, string>)[key] || r.title);
    return (
      <Link key={key} href={r.path} className={isActive(r.path) ? 'active' : ''}>
        <span className="nav-ico">{r.icon}</span>
        {label}
      </Link>
    );
  };

  return (
    <div className="shell">
      {drawerOpen && <button className="drawer-scrim" aria-label="Close menu" onClick={() => setDrawerOpen(false)} />}
      <aside className={`sidebar${drawerOpen ? ' open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">B</span>
          <span><span className="brand-name">BizKhata</span><small>{t(lang, 'tagline')} • v1.0.0</small></span>
        </div>
        <div className="profile-box">
          <div className="pname">{profile.name}</div>
          <div className="pcat">{profile.category}</div>
          <select
            className="input"
            value={profile.id}
            onChange={(e) => {
              // Switching profiles keeps the current feature open — only the
              // data changes (every view filters by the active profile).
              app.mutate((s) => { s.activeProfileId = e.target.value; });
            }}
            aria-label={t(lang, 'switchProfile')}
          >
            {state.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {state.profiles.length < 3 && (
            <Btn kind="ghost" onClick={() => app.setShowAddBusiness(true)}>+ Add Business</Btn>
          )}
        </div>
        <nav className="nav">
          {navLink('dashboard')}
          {navLink('daily')}
          {navLink('cash')}
          {navLink('upi')}
          {navLink('mt')}
          <Link href="/services" className={isActive('/services') && cleanPath === '/services' ? 'active' : ''} onClick={() => setServicesOpen(true)}>
            <span className="nav-ico">▦</span>
            {t(lang, 'services')}
            <span className="nav-caret" role="button" aria-label="Collapse services menu" title="Collapse" onClick={(e) => { e.preventDefault(); setServicesOpen(!servicesOpen); }}>{servicesOpen ? '▾' : '▸'}</span>
          </Link>
          {servicesOpen && jobServices(profile.services).map((s) => (
            <Link
              key={s}
              href={`/services/${serviceSlug(s)}`}
              className={`nav-sub${cleanPath === `/services/${serviceSlug(s)}` ? ' active' : ''}`}
            >
              {s}
            </Link>
          ))}
          {navLink('customers')}
          {navLink('khata')}
          {navLink('agents')}
          {navLink('agent-payments')}
          {navLink('expenses')}
          {navLink('maintenance')}
          {navLink('receipts')}
          {navLink('receipt-generator')}
          <Link href="/reports" className={isActive('/reports') && cleanPath === '/reports' ? 'active' : ''} onClick={() => setReportsOpen(true)}>
            <span className="nav-ico">↗</span>
            {t(lang, 'reports')}
            <span className="nav-caret" role="button" aria-label="Collapse reports menu" title="Collapse" onClick={(e) => { e.preventDefault(); setReportsOpen(!reportsOpen); }}>{reportsOpen ? '▾' : '▸'}</span>
          </Link>
          {reportsOpen && (
            <>
              {REPORT_SUBS.map((r) => (
                <Link key={r.type} href={`/reports/${r.type}`} className={`nav-sub${cleanPath === `/reports/${r.type}` ? ' active' : ''}`}>
                  {r.label}
                </Link>
              ))}
              {navLink('difference')}
            </>
          )}
          {!reportsOpen && navLink('difference')}
          <div className="nav-section">System</div>
          {navLink('chatbot')}
          {navLink('recycle')}
          {navLink('audit')}
          {navLink('customize')}
          <Link href="/settings" className={isActive('/settings') && cleanPath === '/settings' ? 'active' : ''} onClick={() => setSettingsOpen(true)}>
            <span className="nav-ico">⚙</span>
            {t(lang, 'settings')}
            <span className="nav-caret" role="button" aria-label="Collapse settings menu" title="Collapse" onClick={(e) => { e.preventDefault(); setSettingsOpen(!settingsOpen); }}>{settingsOpen ? '▾' : '▸'}</span>
          </Link>
          {settingsOpen && SETTINGS_SUBS.map((r) => (
            <Link key={r.section} href={`/settings/${r.section}`} className={`nav-sub${cleanPath === `/settings/${r.section}` ? ' active' : ''}`}>
              {r.label}
            </Link>
          ))}
          <button onClick={app.logout}><span className="nav-ico">↩</span>{t(lang, 'logout')}</button>
        </nav>
        <div className="sidebar-foot">BizKhata v1.0.0 • Free • Local-first</div>
      </aside>

      <div className="main-col">
        <header className="topnav">
          <button className="icon-btn hamburger" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>☰</button>
          <div className="biz-switch">
            <span className="biz-ico">▦</span>
            <div style={{ minWidth: 0 }}>
              <select
                value={profile.id}
                onChange={(e) => {
                  app.mutate((s) => { s.activeProfileId = e.target.value; });
                }}
                aria-label={t(lang, 'switchProfile')}
              >
                {state.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div className="biz-cat">{profile.category}{profile.address ? ` • ${profile.address}` : ''}</div>
            </div>
          </div>

          <div className="top-search">
            <span className="search-ico">⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setTimeout(() => setSearchFocus(false), 150)}
              onKeyDown={(e) => { if (e.key === 'Enter' && hits.length) { router.push(hits[0].path); setSearch(''); } }}
              placeholder="Search customer, job, receipt…"
              aria-label="Global search"
            />
            {searchFocus && q && (
              <div className="search-results">
                {hits.length === 0 ? (
                  <div className="search-empty">No matches for “{search}” in customers, jobs or receipts.</div>
                ) : hits.map((h, i) => (
                  <button key={i} onClick={() => { router.push(h.path); setSearch(''); }}>
                    <span>{h.label}</span><span className="sr-kind">{h.kind}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="menu-anchor">
            <button className="icon-btn" aria-label="Notifications" onClick={() => { setBellOpen(!bellOpen); setOwnerMenuOpen(false); }}>
              🔔{notifCount > 0 && <span className="dot" />}
            </button>
            {bellOpen && (
              <div className="bell-pop">
                <strong>Notifications</strong>
                {notifCount === 0 ? (
                  <p style={{ color: 'var(--muted)', margin: '8px 0 0' }}>All clear — no pending payments or transfers.</p>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    {dueJobs.length > 0 && <p style={{ margin: '6px 0' }}>• {dueJobs.length} job{dueJobs.length === 1 ? '' : 's'} with customer due — {formatINR(dueTotal)} to collect.</p>}
                    {payableTotal > 0 && <p style={{ margin: '6px 0' }}>• Agent payable {formatINR(payableTotal)} is pending.</p>}
                    {pendingMt > 0 && <p style={{ margin: '6px 0' }}>• {pendingMt} Money Transfer{pendingMt === 1 ? '' : 's'} pending settlement.</p>}
                    <div className="btn-row"><Btn kind="secondary" onClick={() => { setBellOpen(false); router.push('/customer-khata'); }}>View Pending</Btn></div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="menu-anchor">
            <button className="owner-chip" onClick={() => { setOwnerMenuOpen(!ownerMenuOpen); setBellOpen(false); }} aria-label="Owner menu">
              <span className="avatar">A</span>
              <span className="owner-meta"><span className="oname">Ayan Sikligar</span><br /><span className="orole">Owner</span></span>
              <span style={{ color: 'var(--muted)' }}>▾</span>
            </button>
            {ownerMenuOpen && (
              <div className="owner-menu">
                <button onClick={() => { setOwnerMenuOpen(false); router.push('/settings'); }}>Settings</button>
                <button onClick={() => { setOwnerMenuOpen(false); router.push('/customization'); }}>Customization Studio</button>
                <button onClick={app.logout}>{t(lang, 'logout')}</button>
              </div>
            )}
          </div>
        </header>

        <main className="main">
          <div className="page-head">
            <div>
              <h1>{pageTitle}</h1>
              <p className="page-sub">{pageSub}</p>
            </div>
          </div>
          {app.storageError && (
            <p className="error">Storage is full — documents may not save. Delete some uploaded documents or download a backup and erase old data.</p>
          )}
          {children}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Quick navigation">
        <Link href="/dashboard" className={cleanPath === '/dashboard' ? 'active' : ''}><span className="bn-ico">⌂</span>Dashboard</Link>
        <Link href="/services" className={cleanPath.startsWith('/services') ? 'active' : ''}><span className="bn-ico">▦</span>Services</Link>
        <Link href="/services/pan-card?new=1" className="bn-fab" aria-label="Add job">+</Link>
        <Link href="/reports" className={cleanPath.startsWith('/reports') ? 'active' : ''}><span className="bn-ico">↗</span>Reports</Link>
        <button onClick={() => setDrawerOpen(true)}><span className="bn-ico">☰</span>More</button>
      </nav>

      <ChatWidget />

      {app.showAddBusiness && (
        <Modal title="Add Another Business" onClose={() => app.setShowAddBusiness(false)}>
          <p style={{ color: 'var(--muted)' }}>Each business is fully separate — its own dashboard, customers, cash, UPI and reports. Up to 3 per account.</p>
          <Field label="Business Name"><input className="input" value={app.bizName} onChange={(e) => app.setBizName(e.target.value)} /></Field>
          <Field label="Business Category">
            <select className="input" value={app.bizCategory} onChange={(e) => app.setBizCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Address (optional)"><input className="input" value={app.bizAddress} onChange={(e) => app.setBizAddress(e.target.value)} /></Field>
          <div className="btn-row">
            <Btn onClick={app.createBusiness}>Create Business</Btn>
            <Btn kind="secondary" onClick={() => app.setShowAddBusiness(false)}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
