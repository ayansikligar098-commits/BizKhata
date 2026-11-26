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

type ViewKey =
  | 'dashboard' | 'cash' | 'upi' | 'mt' | 'services' | 'customers' | 'khata'
  | 'agents' | 'expenses' | 'maintenance' | 'receipts' | 'daily' | 'reports'
  | 'difference' | 'recycle' | 'audit' | 'customize' | 'settings';

const VIEW_TITLES: Record<ViewKey, string> = {
  dashboard: 'Dashboard', cash: 'Cash Book', upi: 'UPI Book', mt: 'Money Transfer',
  services: 'Services', customers: 'Customers', khata: 'Customer Khata',
  agents: 'Agents', expenses: 'Expenses', maintenance: 'Machine Maintenance',
  receipts: 'Receipts', daily: 'Daily Dhandha', reports: 'Reports',
  difference: 'Difference Finder', recycle: 'Recycle Bin', audit: 'Audit Log',
  customize: 'Customization Studio', settings: 'Settings',
};

const MODULE_FOR_VIEW: Partial<Record<ViewKey, string>> = {
  mt: 'moneyTransfer', agents: 'agents', maintenance: 'maintenance',
  receipts: 'receipts', reports: 'reports', difference: 'differenceFinder',
};

export default function Home() {
  const [state, setState] = React.useState<AppState>(EMPTY_STATE);
  const [hydrated, setHydrated] = React.useState(false);
  const [loggedIn, setLoggedIn] = React.useState(false);
  const [view, setView] = React.useState<ViewKey>('dashboard');
  const [showLang, setShowLang] = React.useState(false);
  const [showAddBusiness, setShowAddBusiness] = React.useState(false);
  const [storageError, setStorageError] = React.useState(false);

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

  if (!hydrated) return <div className="auth-wrap"><p>Loading BizKhata…</p></div>;

  // ---------- auth screens ----------
  if (!loggedIn) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <h1>BizKhata</h1>
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
          <h1>Set up your business</h1>
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
          <h1>Choose your language</h1>
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
  const ctx: Ctx = { state, profile, mutate, softDelete };
  const navSections: { section: string; items: ViewKey[] }[] = [
    { section: 'Main', items: ['dashboard', 'daily'] },
    { section: 'Money', items: ['cash', 'upi', 'mt', 'expenses'] },
    { section: 'Work', items: ['services', 'customers', 'khata', 'agents'] },
    { section: 'Shop', items: ['maintenance', 'receipts'] },
    { section: 'Reports', items: ['reports', 'difference'] },
    { section: 'System', items: ['recycle', 'audit', 'customize', 'settings'] },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">BizKhata<small>{t(lang, 'tagline')}</small></div>
        <div className="profile-box">
          <div className="pname">{profile.name}</div>
          <div className="pcat">{profile.category}</div>
          <div className="btn-row" style={{ marginTop: 8 }}>
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
          </div>
          {state.profiles.length < 3 && (
            <Btn kind="ghost" onClick={() => setShowAddBusiness(true)}>+ Add Business</Btn>
          )}
        </div>
        <nav className="nav">
          {navSections.map(({ section, items }) => (
            <React.Fragment key={section}>
              <div className="nav-section">{section}</div>
              {items.map((k) => {
                const mod = MODULE_FOR_VIEW[k];
                if (mod && profile.disabledModules.includes(mod)) return null;
                return (
                  <button key={k} className={view === k ? 'active' : ''} onClick={() => setView(k)}>
                    {t(lang, ({
                      dashboard: 'dashboard', cash: 'cashBook', upi: 'upiBook', mt: 'moneyTransfer',
                      services: 'services', customers: 'customers', khata: 'customerKhata',
                      agents: 'agents', expenses: 'expenses', maintenance: 'maintenance',
                      receipts: 'receipts', daily: 'dailyBusiness', reports: 'reports',
                      difference: 'differenceFinder', recycle: 'recycleBin', audit: 'auditLog',
                      customize: 'customization', settings: 'settings',
                    } as Record<ViewKey, string>)[k])}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
          <div className="nav-section">Account</div>
          <button onClick={logout}>{t(lang, 'logout')}</button>
        </nav>
      </aside>

      <main className="main">
        <div className="topbar">
          <h1>{VIEW_TITLES[view]}</h1>
          <span style={{ color: 'var(--muted)' }}>{profile.name} • {profile.category}</span>
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
        {view === 'expenses' && <ExpensesView ctx={ctx} />}
        {view === 'maintenance' && <MaintenanceView ctx={ctx} />}
        {view === 'receipts' && <ReceiptsView ctx={ctx} />}
        {view === 'reports' && <ReportsView ctx={ctx} />}
        {view === 'difference' && <DifferenceFinderView ctx={ctx} />}
        {view === 'recycle' && <RecycleBinView ctx={ctx} />}
        {view === 'audit' && <AuditLogView ctx={ctx} />}
        {view === 'customize' && <CustomizationView ctx={ctx} />}
        {view === 'settings' && <SettingsView ctx={ctx} />}
      </main>

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
