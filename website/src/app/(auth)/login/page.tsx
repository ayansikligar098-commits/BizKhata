'use client';
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { LoadingScreen, OfflineScreen } from '@/components/shell';
import { Btn, Field } from '@/components/ui';
import { isPrivatePath } from '@/lib/routes';

/**
 * Login / register / forgot-PIN. Only ever shown when there is genuinely no
 * valid session (see AppProvider): an authenticated user is redirected away
 * to their requested page instead of seeing this form.
 */
export default function LoginPage() {
  return (
    <React.Suspense fallback={<LoadingScreen />}>
      <LoginInner />
    </React.Suspense>
  );
}

function LoginInner() {
  const app = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const dest = next && isPrivatePath(next) ? next : '/dashboard';

  const [mode, setMode] = React.useState<'login' | 'register' | 'forgot'>('login');
  const [mobile, setMobile] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [pin2, setPin2] = React.useState('');
  const [recoveryWord, setRecoveryWord] = React.useState('');
  const [error, setError] = React.useState('');

  // Already authenticated? Go straight to the requested page — never flash login.
  React.useEffect(() => {
    if (app.authStatus === 'authed') router.replace(dest);
  }, [app.authStatus, dest, router]);

  if (app.authStatus === 'checking') return <LoadingScreen />;
  if (app.authStatus === 'offline') return <OfflineScreen />;

  async function doLogin() {
    const err = await app.loginWithPin(mobile, pin);
    if (err) { setError(err); return; }
    setError('');
    router.replace(dest);
  }

  async function doRegister() {
    const err = await app.registerAccount(mobile, pin, pin2, recoveryWord);
    if (err) { setError(err); return; }
    setError('');
    router.replace('/dashboard');
  }

  async function doForgot() {
    const err = await app.resetPin(mobile, recoveryWord, pin);
    if (err) { setError(err); return; }
    // UPDATE 24: resetPin now logs the user in immediately with the new
    // PIN (authStatus flips to 'authed' and the effect below redirects).
    setError('');
    setPin('');
    router.replace(dest);
  }

  // UPDATE 24: registration was blocked because an account already exists
  // on this device — offer a one-tap switch to login instead of a dead end.
  const blockedAsExisting = error.includes('pehle se hai');

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1><span className="brand-mark">B</span> BizKhata</h1>
        <p style={{ color: 'var(--muted)' }}>Business Accounting &amp; Management — free, local-first. Your data stays on this device.</p>
        <p style={{ color: 'var(--muted)', fontSize: '0.9em' }}>Note: your account lives only in the browser/app where you created it — the website and the in-app web app keep separate accounts.</p>
        {mode === 'register' && (
          <>
            <h2>Create your account</h2>
            <Field label="Mobile Number"><input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" placeholder="10-digit mobile" /></Field>
            <Field label="Set a PIN (4–6 digits)"><input className="input" type="password" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={6} /></Field>
            <Field label="Confirm PIN"><input className="input" type="password" value={pin2} onChange={(e) => setPin2(e.target.value)} inputMode="numeric" maxLength={6} /></Field>
            <Field label="Recovery Word" hint="One word you will remember — needed only if you forget the PIN.">
              <input className="input" value={recoveryWord} onChange={(e) => setRecoveryWord(e.target.value)} placeholder="e.g. your favourite food" />
            </Field>
            {error && <p className="error">{error}</p>}
            <div className="btn-row"><Btn onClick={doRegister}>Create Account</Btn></div>
            {blockedAsExisting && (
              <p><button className="btn btn-ghost" onClick={() => { setMode('login'); setError(''); }}>Account already hai — Log in par jao</button></p>
            )}
            <p><button className="btn btn-ghost" onClick={() => { setMode('login'); setError(''); }}>Already have an account? Log in</button></p>
          </>
        )}
        {mode === 'login' && (
          <>
            <h2>{app.state.owner ? 'Log in' : 'Welcome — create your account'}</h2>
            <Field label="Mobile Number"><input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" placeholder="10-digit mobile" /></Field>
            <Field label="PIN"><input className="input" type="password" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={6} /></Field>
            {error && <p className="error">{error}</p>}
            <div className="btn-row"><Btn onClick={doLogin}>Log In</Btn></div>
            <p>
              <button className="btn btn-ghost" onClick={() => { setMode('forgot'); setError(''); }}>Forgot PIN?</button>
              <button className="btn btn-ghost" onClick={() => { setMode('register'); setError(''); }}>Create account</button>
            </p>
          </>
        )}
        {mode === 'forgot' && (
          <>
            <h2>Forgot PIN</h2>
            <Field label="Mobile Number"><input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" /></Field>
            <Field label="Recovery Word"><input className="input" value={recoveryWord} onChange={(e) => setRecoveryWord(e.target.value)} /></Field>
            <Field label="New PIN (4–6 digits)"><input className="input" type="password" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={6} /></Field>
            {error && <p className="error">{error}</p>}
            <div className="btn-row"><Btn onClick={doForgot}>Reset PIN</Btn></div>
            <p><button className="btn btn-ghost" onClick={() => { setMode('login'); setError(''); }}>Back to login</button></p>
          </>
        )}
      </div>
    </div>
  );
}
