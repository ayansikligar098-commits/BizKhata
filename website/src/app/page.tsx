'use client';
import React from 'react';
import { CATEGORIES } from '@/lib/categories';
import { t, LANG_OPTIONS } from '@/lib/i18n';
import { auditEntry, hashPin, loadState, recycleEntry, saveState } from '@/lib/store';
import type { AppState, AuditEntry, BusinessProfile, Lang } from '@/lib/types';
import { EMPTY_STATE, uid } from '@/lib/types';
import { Btn, Card, Field, Modal, type Ctx } from '@/components/ui';
import { DashboardView, DailyDhandhaView } from '@/components/views-dashboard';
import { CashBookView, UpiBookView } from '@/components/views-books';
import { MoneyTransferView } from '@/components/views-mt';
import { ServicesView, CustomersView, KhataView } from '@/components/views-services';
import { AgentsView, ExpensesView, MaintenanceView } from '@/components/views-people';
import { ReceiptsView } from '@/components/views-receipts';
import {
  ReportsView,
  DifferenceFinderView,
  RecycleBinView,
  AuditLogView,
  CustomizationView,
  SettingsView,
} from '@/components/views-reports';
import {
  CustomerProfileView,
  AgentProfileView,
  AgentPaymentsView,
  ReceiptGeneratorView,
} from '@/components/views-profiles';
import { formatINR } from '@/lib/money';
import { agentPayablePaise, totalCustomerDuePaise } from '@/lib/accounting';

type ViewKey =
  | 'dashboard' | 'cash' | 'upi' | 'mt' | 'services' | 'customers' | 'khata'
  | 'agents' | 'expenses' | 'maintenance' | 'receipts' | 'daily' | 'reports'
  | 'difference' | 'recycle' | 'audit' | 'customize' | 'settings'
  | 'customer-profile' | 'agent-profile' | 'agent-payments' | 'receipt-generator';

const VIEW_TITLES: Record<ViewKey, string> = {
  dashboard: 'Dashboard', cash: 'Cash Book', upi: 'UPI Book', mt: 'Money Transfer',
  services: 'Services', customers: 'Customers', khata: 'Customer Khata',
  agents: 'Agents', expenses: 'Expenses', maintenance: 'Machine Maintenance',
  receipts: 'Receipts', daily: 'Daily Dhandha', reports: 'Reports',
  difference: 'Difference Finder', recycle: 'Recycle Bin', audit: 'Audit Log',
  customize: 'Customization Studio', settings: 'Settings',
  'customer-profile': 'Customer Profile', 'agent-profile': 'Agent Profile',
  'agent-payments': 'Agent Payments', 'receipt-generator': 'Receipt Generator',
};

const VIEW_SUBS: Record<ViewKey, string> = {
  dashboard: 'Your business at a glance',
  cash: 'Cash received, spent and internal transfers',
  upi: 'UPI received, spent and internal transfers',
  mt: 'Separate ledger — commission is the only profit',
  services: 'Jobs across all services',
  customers: 'Everyone you serve',
  khata: 'Per-customer ledger — who owes what',
  agents: 'Backend agents and what you owe them',
  expenses: 'Shop spending, linked to services',
  maintenance: 'Machines, service history and lifetime cost',
  receipts: 'Professional receipts, A4 + thermal',
  daily: 'Billing vs actually received vs profit',
  reports: 'Business, service, customer and agent reports',
  difference: 'Expected vs recorded — suggestions only, never edits',
  recycle: 'Deleted records — restore them here',
  audit: 'Every change, old value → new value',
  customize: 'Services, modules and dashboard cards for this profile',
  settings: 'Business, language, theme, receipts, backup and AI',
  'customer-profile': 'Ledger, jobs, payments and documents for one customer',
  'agent-profile': 'Assigned jobs, charges, payments and payable for one agent',
  'agent-payments': 'Payment history and record a payment to an agent',
  'receipt-generator': 'Create a professional receipt from a job',
};

const MODULE_FOR_VIEW: Partial<Record<ViewKey, string>> = {
  mt: 'moneyTransfer', agents: 'agents', maintenance: 'maintenance',
  receipts: 'receipts', reports: 'reports', difference: 'differenceFinder',
};

const NAV_ICONS: Record<string, string> = {
  dashboard: '⌂', daily: '◷', cash: '▤', upi: '⌁', mt: '⇄', services: '▦',
  customers: '◉', khata: '▤', agents: '◉', expenses: '▤', maintenance: '⚙',
  receipts: '▦', reports: '↗', difference: '≠', recycle: '↺', audit: '☰',
  customize: '✦', settings: '⚙',
  'customer-profile': '◉', 'agent-profile': '◉', 'agent-payments': '▤', 'receipt-generator': '▦',
};

/** Sidebar labels use the profile language where a translation exists. */
function navLabel(lang: Lang, k: ViewKey): string {
  const keyMap: Record<ViewKey, string> = {
    dashboard: 'dashboard', cash: 'cashBook', upi: 'upiBook', mt: 'moneyTransfer',
    services: 'services', customers: 'customers', khata: 'customerKhata',
    agents: 'agents', expenses: 'expenses', maintenance: 'maintenance',
    receipts: 'receipts', daily: 'dailyBusiness', reports: 'reports',
    difference: 'differenceFinder', recycle: 'recycleBin', audit: 'auditLog',
    customize: 'customization', settings: 'settings',
    'customer-profile': 'customers', 'agent-profile': 'agents',
    'agent-payments': 'agents', 'receipt-generator': 'receipts',
  };
  if (k === 'customer-profile') return 'Customer Profile';
  if (k === 'agent-profile') return 'Agent Profile';
  if (k === 'agent-payments') return 'Agent Payments';
  if (k === 'receipt-generator') return 'Receipt Generator';
  return t(lang, keyMap[k]);
}

export default function Home() {
  const [state, setState] = React.useState<AppState>(EMPTY_STATE);
  const [hydrated, setHydrated] = React.useState(false);
  const [loggedIn, setLoggedIn] = React.useState(false);
  const [view, setView] = React.useState<ViewKey>('dashboard');
  const [showLang, setShowLang] = React.useState(false);
  const [showAddBusiness, setShowAddBusiness] = React.useState(false);
  const [storageError, setStorageError] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [servicesOpen, setServicesOpen] = React.useState(true);
  const [reportsOpen, setReportsOpen] = React.useState(false);
  const [serviceJump, setServiceJump] = React.useState<{ service: string; nonce: number; openForm: boolean } | undefined>(undefined);
  const [search, setSearch] = React.useState('');
  const [searchFocus, setSearchFocus] = React.useState(false);
  const [bellOpen, setBellOpen] = React.useState(false);
  const [ownerMenuOpen, setOwnerMenuOpen] = React.useState(false);
  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [agentId, setAgentId] = React.useState<string | null>(null);

  // Auth form state
  const [authMode, setAuthMode] = React.useState<'login' | 'register' | 'forgot'>('login');
  const [mobile, setMobile] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [pin2, setPin2] = React.useState('');
  const [recoveryWord, setRecoveryWord] = React.useState('');
  const [authError, setAuthError] = React.useState('');

  // Business setup form state
  const [bizName, setBizName] = React.useState('Al Falah Communication');
  const [bizCategory, setBizCategory] = React.useState(CATEGORIES[0].name);
  const [bizAddress, setBizAddress] = React.useState('');
  const [bizMobile, setBizMobile] = React.useState('');

  React.useEffect(() => {
    setState(loadState());
    setLoggedIn(window.sessionStorage.getItem('bizkhata.session') === '1');
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      saveState(state);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [state, hydrated]);

  const profile: BusinessProfile | null =
    state.profiles.find((p) => p.id === state.activeProfileId) || null;

  // Theme
  React.useEffect(() => {
    const theme = profile?.theme || 'light';
    const resolved = theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      : theme;
    document.documentElement.setAttribute('data-theme', resolved);
  }, [profile?.theme]);

  function mutate(fn: (s: AppState) => void, audit?: AuditEntry[]) {
    setState((prev) => {
      const next: AppState = JSON.parse(JSON.stringify(prev));
      fn(next);
      if (audit) next.audit.push(...audit);
      return next;
    });
  }

  function softDelete(kind: string, label: string, data: unknown, remove: (s: AppState) => void) {
    const pid = profile?.id || '';
    mutate((s) => {
      remove(s);
      s.recycle.push(recycleEntry(pid, kind, label, data));
    }, [auditEntry(pid, 'delete', kind, '', label, 'Moved to Recycle Bin')]);
  }

  function go(v: string) {
    // A plain navigation to Services shows All Services — a stale service
    // jump (e.g. PAN Card from the sidebar) must not re-apply on remount.
    if (v === 'services') setServiceJump(undefined);
    setView(v as ViewKey);
    setDrawerOpen(false);
    setSearch('');
    window.scrollTo({ top: 0 });
  }

  function goService(service: string) {
    setServiceJump({ service, nonce: Date.now(), openForm: true });
    setView('services');
    setDrawerOpen(false);
    window.scrollTo({ top: 0 });
  }

  function goServiceFilter(service: string) {
    setServiceJump({ service, nonce: Date.now(), openForm: false });
    setView('services');
    setDrawerOpen(false);
    setServicesOpen(true);
    window.scrollTo({ top: 0 });
  }

  function openCustomer(id: string) {
    setCustomerId(id);
    setView('customer-profile');
    setDrawerOpen(false);
    window.scrollTo({ top: 0 });
  }

  function openAgent(id: string) {
    setAgentId(id);
    setView('agent-profile');
    setDrawerOpen(false);
    window.scrollTo({ top: 0 });
  }

  // ---------- auth ----------
  function doRegister() {
    if (!/^\d{10}$/.test(mobile)) { setAuthError('Enter a 10-digit mobile number.'); return; }
    if (!/^\d{4,6}$/.test(pin)) { setAuthError('PIN must be 4 to 6 digits.'); return; }
    if (pin !== pin2) { setAuthError('PINs do not match.'); return; }
    if (!recoveryWord.trim()) { setAuthError('Enter a recovery word (needed if you forget the PIN).'); return; }
    setState((prev) => ({
      ...prev,
      owner: { mobile, pinHash: hashPin(pin, mobile), recoveryWord: recoveryWord.trim().toLowerCase(), createdAt: new Date().toISOString() },
    }));
    setLoggedIn(true);
    window.sessionStorage.setItem('bizkhata.session', '1');
    setAuthError('');
    setShowLang(true);
  }

  function doLogin() {
    if (!state.owner) { setAuthError('No account yet — register first.'); return; }
    if (mobile !== state.owner.mobile || hashPin(pin, mobile) !== state.owner.pinHash) {
      setAuthError('Wrong mobile or PIN. Try again, or use Forgot PIN.');
      return;
    }
    setLoggedIn(true);
    window.sessionStorage.setItem('bizkhata.session', '1');
    setAuthError('');
    if (!state.profiles.length) setShowLang(true);
  }

  function doForgot() {
    if (!state.owner) { setAuthError('No account yet — register first.'); return; }
    if (mobile !== state.owner.mobile || recoveryWord.trim().toLowerCase() !== state.owner.recoveryWord) {
      setAuthError('Mobile or recovery word does not match.'); return;
    }
    if (!/^\d{4,6}$/.test(pin)) { setAuthError('New PIN must be 4 to 6 digits.'); return; }
    setState((prev) => prev.owner ? { ...prev, owner: { ...prev.owner, pinHash: hashPin(pin, mobile) } } : prev);
    setAuthMode('login');
    setAuthError('');
    setPin('');
    alert('PIN reset. Now log in with the new PIN.');
  }

  function logout() {
    setLoggedIn(false);
    window.sessionStorage.removeItem('bizkhata.session');
    setView('dashboard');
    setOwnerMenuOpen(false);
  }

  // ---------- business profiles ----------
  function createBusiness() {
    if (state.profiles.length >= 3) { alert('You can have up to 3 business profiles.'); return; }
    const cat = CATEGORIES.find((c) => c.name === bizCategory) || CATEGORIES[0];
    const p: BusinessProfile = {
      id: uid('prof'),
      name: bizName.trim() || 'My Business',
      category: cat.name,
      services: [...cat.services],
      customServices: [],
      expenseCategories: [...cat.expenseCategories],
      customExpenseCategories: [],
      disabledModules: [],
      hiddenCards: [],
      address: bizAddress,
      mobile: bizMobile || mobile,
      openingCashPaise: 0,
      openingUpiPaise: 0,
      receiptPrefix: 'BK',
      receiptCounter: 0,
      language: 'en',
      theme: 'light',
      geminiKey: '',
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      profiles: [...prev.profiles, p],
      activeProfileId: p.id,
    }));
    setShowAddBusiness(false);
    setShowLang(true);
  }

  if (!hydrated) return <div className="auth-wrap"><p style={{ color: '#fff' }}>Loading BizKhata…</p></div>;

  // ---------- auth screens ----------
  if (!loggedIn) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <h1><span className="brand-mark">B</span> BizKhata</h1>
          <p style={{ color: 'var(--muted)' }}>Business Accounting &amp; Management — free, local-first. Your data stays on this device.</p>
          {authMode === 'register' && (
            <>
              <h2>Create your account</h2>
              <Field label="Mobile Number"><input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" placeholder="10-digit mobile" /></Field>
              <Field label="Set a PIN (4–6 digits)"><input className="input" type="password" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={6} /></Field>
              <Field label="Confirm PIN"><input className="input" type="password" value={pin2} onChange={(e) => setPin2(e.target.value)} inputMode="numeric" maxLength={6} /></Field>
              <Field label="Recovery Word" hint="One word you will remember — needed only if you forget the PIN.">
                <input className="input" value={recoveryWord} onChange={(e) => setRecoveryWord(e.target.value)} placeholder="e.g. your favourite food" />
              </Field>
              {authError && <p className="error">{authError}</p>}
              <div className="btn-row"><Btn onClick={doRegister}>Create Account</Btn></div>
              <p><button className="btn btn-ghost" onClick={() => { setAuthMode('login'); setAuthError(''); }}>Already have an account? Log in</button></p>
            </>
          )}
          {authMode === 'login' && (
            <>
              <h2>{state.owner ? 'Log in' : 'Welcome — create your account'}</h2>
              <Field label="Mobile Number"><input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" placeholder="10-digit mobile" /></Field>
              <Field label="PIN"><input className="input" type="password" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={6} /></Field>
              {authError && <p className="error">{authError}</p>}
              <div className="btn-row"><Btn onClick={doLogin}>Log In</Btn></div>
              <p>
                <button className="btn btn-ghost" onClick={() => { setAuthMode('forgot'); setAuthError(''); }}>Forgot PIN?</button>
                <button className="btn btn-ghost" onClick={() => { setAuthMode('register'); setAuthError(''); }}>Create account</button>
              </p>
            </>
          )}
          {authMode === 'forgot' && (
            <>
              <h2>Forgot PIN</h2>
              <Field label="Mobile Number"><input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" /></Field>
              <Field label="Recovery Word"><input className="input" value={recoveryWord} onChange={(e) => setRecoveryWord(e.target.value)} /></Field>
              <Field label="New PIN (4–6 digits)"><input className="input" type="password" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={6} /></Field>
              {authError && <p className="error">{authError}</p>}
              <div className="btn-row"><Btn onClick={doForgot}>Reset PIN</Btn></div>
              <p><button className="btn btn-ghost" onClick={() => { setAuthMode('login'); setAuthError(''); }}>Back to login</button></p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---------- business setup ----------
  if (!profile) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <h1><span className="brand-mark">B</span> Set up your business</h1>
          <p style={{ color: 'var(--muted)' }}>Choose your business category — BizKhata sets up ready-made services for it. You can add up to 3 separate businesses.</p>
          <Field label="Business Name"><input className="input" value={bizName} onChange={(e) => setBizName(e.target.value)} /></Field>
          <Field label="Business Category">
            <select className="input" value={bizCategory} onChange={(e) => setBizCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Address (optional)"><input className="input" value={bizAddress} onChange={(e) => setBizAddress(e.target.value)} /></Field>
          <Field label="Business Mobile"><input className="input" value={bizMobile} onChange={(e) => setBizMobile(e.target.value)} inputMode="tel" /></Field>
          <div className="btn-row"><Btn onClick={createBusiness}>Create Business</Btn></div>
        </div>
      </div>
    );
  }

  // ---------- language screen ----------
  if (showLang) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <h1><span className="brand-mark">B</span> Choose your language</h1>
          <p style={{ color: 'var(--muted)' }}>Apni bhasha chuno. You can change it later in Settings.</p>
          <div className="lang-pick">
            {LANG_OPTIONS.map((o) => (
              <button key={o.code} onClick={() => {
                mutate((s) => {
                  const p = s.profiles.find((x) => x.id === profile.id);
                  if (p) p.language = o.code as Lang;
                });
                setShowLang(false);
              }}>{o.label}</button>
            ))}
          </div>
          <Btn kind="secondary" onClick={() => setShowLang(false)}>Skip (English)</Btn>
        </div>
      </div>
    );
  }

  const lang = profile.language;
  const ctx: Ctx = { state, profile, mutate, softDelete, go, goService, goServiceFilter, serviceJump, openCustomer, customerId, openAgent, agentId };
  const pid = profile.id;
  const jobs = state.jobs.filter((j) => j.profileId === pid);
  const dueJobs = jobs.filter((j) => j.totalPaise - j.receivedPaise > 0);
  const dueTotal = totalCustomerDuePaise(jobs);
  const payableTotal = state.agents.filter((a) => a.profileId === pid).reduce((s, a) => s + agentPayablePaise(a, jobs), 0);
  const pendingMt = state.mtTransfers.filter((m) => m.profileId === pid && m.status === 'Pending').length;
  const notifCount = dueJobs.length + pendingMt;

  // Global search results (customers, jobs, receipts — real saved data only)
  const q = search.trim().toLowerCase();
  type SearchHit = { kind: string; label: string; view: ViewKey };
  const hits: SearchHit[] = q
    ? [
        ...state.customers.filter((c) => c.profileId === pid && (c.name.toLowerCase().includes(q) || c.mobile.includes(q)))
          .slice(0, 3).map((c): SearchHit => ({ kind: 'Customer', label: `${c.name} • ${c.mobile}`, view: 'customers' })),
        ...jobs.filter((j) => j.customerName.toLowerCase().includes(q) || j.service.toLowerCase().includes(q) || j.refNo.toLowerCase().includes(q) || j.mobile.includes(q))
          .slice(0, 3).map((j): SearchHit => ({ kind: 'Job', label: `${j.service} — ${j.customerName}${j.refNo ? ` • ${j.refNo}` : ''}`, view: 'services' })),
        ...state.receipts.filter((r) => r.profileId === pid && (r.number.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q)))
          .slice(0, 3).map((r): SearchHit => ({ kind: 'Receipt', label: `${r.number} — ${r.customerName} • ${r.service}`, view: 'receipts' })),
      ].slice(0, 8)
    : [];

  const navItem = (k: ViewKey) => {
    const mod = MODULE_FOR_VIEW[k];
    if (mod && profile.disabledModules.includes(mod)) return null;
    return (
      <button key={k} className={view === k ? 'active' : ''} onClick={() => go(k)}>
        <span className="nav-ico">{NAV_ICONS[k]}</span>
        {navLabel(lang, k)}
      </button>
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
              setState((prev) => ({ ...prev, activeProfileId: e.target.value }));
              setView('dashboard');
            }}
            aria-label={t(lang, 'switchProfile')}
          >
            {state.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {state.profiles.length < 3 && (
            <Btn kind="ghost" onClick={() => setShowAddBusiness(true)}>+ Add Business</Btn>
          )}
        </div>
        <nav className="nav">
          {navItem('dashboard')}
          {navItem('daily')}
          {navItem('cash')}
          {navItem('upi')}
          {navItem('mt')}
          <button onClick={() => { setServicesOpen(true); go('services'); }} aria-expanded={servicesOpen}>
            <span className="nav-ico">{NAV_ICONS.services}</span>
            {t(lang, 'services')}
            <span className="nav-caret" role="button" aria-label="Collapse services menu" title="Collapse" onClick={(e) => { e.stopPropagation(); setServicesOpen(!servicesOpen); }}>{servicesOpen ? '▾' : '▸'}</span>
          </button>
          {servicesOpen && profile.services.map((s) => (
            <button
              key={s}
              className={`nav-sub${view === 'services' && serviceJump?.service === s ? ' active' : ''}`}
              onClick={() => goServiceFilter(s)}
            >
              {s}
            </button>
          ))}
          {navItem('customers')}
          {navItem('khata')}
          {navItem('agents')}
          {navItem('agent-payments')}
          {navItem('expenses')}
          {navItem('maintenance')}
          {navItem('receipts')}
          {navItem('receipt-generator')}
          <button onClick={() => { setReportsOpen(true); go('reports'); }} aria-expanded={reportsOpen}>
            <span className="nav-ico">{NAV_ICONS.reports}</span>
            {t(lang, 'reports')}
            <span className="nav-caret" role="button" aria-label="Collapse reports menu" title="Collapse" onClick={(e) => { e.stopPropagation(); setReportsOpen(!reportsOpen); }}>{reportsOpen ? '▾' : '▸'}</span>
          </button>
          {reportsOpen && (
            <>
              {navItem('reports')}
              {navItem('difference')}
            </>
          )}
          {!reportsOpen && navItem('difference')}
          <div className="nav-section">System</div>
          {navItem('recycle')}
          {navItem('audit')}
          {navItem('customize')}
          {navItem('settings')}
          <button onClick={logout}><span className="nav-ico">↩</span>{t(lang, 'logout')}</button>
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
                  setState((prev) => ({ ...prev, activeProfileId: e.target.value }));
                  setView('dashboard');
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
              onKeyDown={(e) => { if (e.key === 'Enter' && hits.length) go(hits[0].view); }}
              placeholder="Search customer, job, receipt…"
              aria-label="Global search"
            />
            {searchFocus && q && (
              <div className="search-results">
                {hits.length === 0 ? (
                  <div className="search-empty">No matches for “{search}” in customers, jobs or receipts.</div>
                ) : hits.map((h, i) => (
                  <button key={i} onClick={() => go(h.view)}>
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
                    <div className="btn-row"><Btn kind="secondary" onClick={() => { setBellOpen(false); go('khata'); }}>View Pending</Btn></div>
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
                <button onClick={() => { setOwnerMenuOpen(false); go('settings'); }}>Settings</button>
                <button onClick={() => { setOwnerMenuOpen(false); go('customize'); }}>Customization Studio</button>
                <button onClick={logout}>{t(lang, 'logout')}</button>
              </div>
            )}
          </div>
        </header>

        <main className="main">
          <div className="page-head">
            <div>
              <h1>{VIEW_TITLES[view]}</h1>
              <p className="page-sub">{VIEW_SUBS[view]} — {profile.name} • {profile.category}</p>
            </div>
          </div>
          {storageError && (
            <p className="error">Storage is full — documents may not save. Delete some uploaded documents or download a backup and erase old data.</p>
          )}
          {view === 'dashboard' && <DashboardView ctx={ctx} />}
          {view === 'daily' && <DailyDhandhaView ctx={ctx} />}
          {view === 'cash' && <CashBookView ctx={ctx} />}
          {view === 'upi' && <UpiBookView ctx={ctx} />}
          {view === 'mt' && <MoneyTransferView ctx={ctx} />}
          {view === 'services' && <ServicesView ctx={ctx} />}
          {view === 'customers' && <CustomersView ctx={ctx} />}
          {view === 'khata' && <KhataView ctx={ctx} />}
          {view === 'agents' && <AgentsView ctx={ctx} />}
          {view === 'agent-profile' && <AgentProfileView ctx={ctx} />}
          {view === 'agent-payments' && <AgentPaymentsView ctx={ctx} />}
          {view === 'expenses' && <ExpensesView ctx={ctx} />}
          {view === 'maintenance' && <MaintenanceView ctx={ctx} />}
          {view === 'receipts' && <ReceiptsView ctx={ctx} />}
          {view === 'receipt-generator' && <ReceiptGeneratorView ctx={ctx} />}
          {view === 'customer-profile' && <CustomerProfileView ctx={ctx} />}
          {view === 'reports' && <ReportsView ctx={ctx} />}
          {view === 'difference' && <DifferenceFinderView ctx={ctx} />}
          {view === 'recycle' && <RecycleBinView ctx={ctx} />}
          {view === 'audit' && <AuditLogView ctx={ctx} />}
          {view === 'customize' && <CustomizationView ctx={ctx} />}
          {view === 'settings' && <SettingsView ctx={ctx} />}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Quick navigation">
        <button className={view === 'dashboard' ? 'active' : ''} onClick={() => go('dashboard')}><span className="bn-ico">⌂</span>Dashboard</button>
        <button className={view === 'services' ? 'active' : ''} onClick={() => go('services')}><span className="bn-ico">▦</span>Services</button>
        <button className="bn-fab" aria-label="Add job" onClick={() => goService('PAN Card')}>+</button>
        <button className={view === 'reports' ? 'active' : ''} onClick={() => go('reports')}><span className="bn-ico">↗</span>Reports</button>
        <button onClick={() => setDrawerOpen(true)}><span className="bn-ico">☰</span>More</button>
      </nav>

      {showAddBusiness && (
        <Modal title="Add Another Business" onClose={() => setShowAddBusiness(false)}>
          <p style={{ color: 'var(--muted)' }}>Each business is fully separate — its own dashboard, customers, cash, UPI and reports. Up to 3 per account.</p>
          <Field label="Business Name"><input className="input" value={bizName} onChange={(e) => setBizName(e.target.value)} /></Field>
          <Field label="Business Category">
            <select className="input" value={bizCategory} onChange={(e) => setBizCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Address (optional)"><input className="input" value={bizAddress} onChange={(e) => setBizAddress(e.target.value)} /></Field>
          <div className="btn-row">
            <Btn onClick={createBusiness}>Create Business</Btn>
            <Btn kind="secondary" onClick={() => setShowAddBusiness(false)}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
