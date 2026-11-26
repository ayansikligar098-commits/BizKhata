'use client';
import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CATEGORIES, CSC_SERVICES_V2 } from '@/lib/categories';
import { auditEntry, hashPin, loadState, recycleEntry, saveState } from '@/lib/store';
import {
  accessMsLeft,
  issueSession,
  onSessionEvent,
  readLastPath,
  renewSession,
  revokeSession,
  verifySession,
  writeLastPath,
  RENEW_BEFORE_MS,
  type VerifyResult,
} from '@/lib/session';
import { routeForKey, serviceSlug } from '@/lib/routes';
import type { AppState, AuditEntry, BusinessProfile, Lang } from '@/lib/types';
import { EMPTY_STATE, uid } from '@/lib/types';
import type { Ctx } from '@/components/ui';

export type AuthStatus = 'checking' | 'authed' | 'guest' | 'offline';

export interface AppCtx extends Ctx {
  authStatus: AuthStatus;
  hydrated: boolean;
  /** Re-run session verification (used by the offline retry screen). */
  reverify: () => void;
  /** Login with mobile+PIN. Returns an error message, or null on success. */
  loginWithPin: (mobile: string, pin: string) => Promise<string | null>;
  /** Register a new owner account. Returns an error message, or null on success. */
  registerAccount: (mobile: string, pin: string, pin2: string, recoveryWord: string) => Promise<string | null>;
  /** Reset the PIN with the recovery word. Returns an error message, or null on success. */
  resetPin: (mobile: string, recoveryWord: string, pin: string) => Promise<string | null>;
  logout: () => void;
  /** Business setup / language flow state (shown instead of the shell when set). */
  showLang: boolean;
  setShowLang: (v: boolean) => void;
  showAddBusiness: boolean;
  setShowAddBusiness: (v: boolean) => void;
  /** Business setup form state (shared by the setup screen + add-business modal). */
  bizName: string;
  setBizName: (v: string) => void;
  bizCategory: string;
  setBizCategory: (v: string) => void;
  bizAddress: string;
  setBizAddress: (v: string) => void;
  bizMobile: string;
  setBizMobile: (v: string) => void;
  createBusiness: () => void;
  storageError: boolean;
}

const AppContext = React.createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

/** Optional access (for the root/login pages that render before auth resolves). */
export function useAppOptional(): AppCtx | null {
  return React.useContext(AppContext);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = React.useState<AppState>(EMPTY_STATE);
  const [hydrated, setHydrated] = React.useState(false);
  const [authStatus, setAuthStatus] = React.useState<AuthStatus>('checking');
  const [showLang, setShowLang] = React.useState(false);
  const [showAddBusiness, setShowAddBusiness] = React.useState(false);
  const [storageError, setStorageError] = React.useState(false);
  const [bizName, setBizName] = React.useState('Al Falah Communication');
  const [bizCategory, setBizCategory] = React.useState(CATEGORIES[0].name);
  const [bizAddress, setBizAddress] = React.useState('');
  const [bizMobile, setBizMobile] = React.useState('');

  const authStatusRef = React.useRef(authStatus);
  authStatusRef.current = authStatus;

  async function applyVerify(res: VerifyResult, minDelayMs = 450): Promise<void> {
    // Keep the loading screen visible briefly so the transition feels
    // deliberate and the login page is never flashed.
    await new Promise((r) => setTimeout(r, minDelayMs));
    if (res.status === 'valid' || res.status === 'renewed') setAuthStatus('authed');
    else if (res.status === 'offline') setAuthStatus('offline');
    else setAuthStatus('guest');
  }

  const reverify = React.useCallback(() => {
    setAuthStatus('checking');
    verifySession().then((res) => applyVerify(res, 300));
  }, []);

  React.useEffect(() => {
    // One-time migration: drop the old frontend-only session flag.
    try {
      window.sessionStorage.removeItem('bizkhata.session');
    } catch { /* ignore */ }
    setState(loadState());
    setHydrated(true);
    verifySession().then((res) => applyVerify(res, 650));
    const off = onSessionEvent((type) => {
      if (type === 'logout') setAuthStatus((s) => (s === 'authed' ? 'guest' : s));
      if (type === 'login') reverify();
    });
    const onOnline = () => {
      if (authStatusRef.current === 'offline') reverify();
    };
    window.addEventListener('online', onOnline);
    return () => {
      off();
      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  React.useEffect(() => {
    if (!hydrated) return;
    // One-time migration for existing CSC profiles: add the new
    // 'Passport Size Photo' + 'Scanning' services (new profiles get them
    // from the category defaults). Flagged per profile so an owner who
    // deliberately removes one is never forced to take it back.
    setState((prev) => {
      let changed = false;
      const profiles = prev.profiles.map((p) => {
        if (p.servicesV2Migrated || p.category !== CATEGORIES[0].name) return p;
        changed = true;
        const services = [...p.services];
        for (const s of CSC_SERVICES_V2) if (!services.includes(s)) services.push(s);
        return { ...p, services, servicesV2Migrated: true };
      });
      return changed ? { ...prev, profiles } : prev;
    });
  }, [hydrated]);

  // Silent auto-renewal while the app is open.
  React.useEffect(() => {
    if (authStatus !== 'authed') return;
    const id = window.setInterval(async () => {
      if (accessMsLeft() < RENEW_BEFORE_MS) {
        const ok = await renewSession();
        if (!ok) setAuthStatus('guest');
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [authStatus]);

  // Remember the last private route (for the `/` redirect).
  React.useEffect(() => {
    if (authStatus === 'authed' && pathname) writeLastPath(pathname);
  }, [pathname, authStatus]);

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

  function go(view: string) {
    router.push(routeForKey(view).path);
  }

  function goService(service: string) {
    router.push(`/services/${serviceSlug(service)}?new=1`);
  }

  function goServiceFilter(service: string) {
    router.push(`/services/${serviceSlug(service)}`);
  }

  function openCustomer(id: string) {
    // Query-param profile link: the site is a static export, so
    // /customers/<id> has no prerendered page (dynamicParams=false made
    // client navigation 404). /customers?id=<id> always serves the list
    // page's HTML, which renders the profile from the query.
    router.push(`/customers?id=${id}`);
  }

  function openAgent(id: string) {
    router.push(`/agents?id=${id}`);
  }

  // ---------- auth (mobile + PIN, verified against the local PIN hash) ----------
  async function loginWithPin(mobile: string, pin: string): Promise<string | null> {
    if (!state.owner) return 'No account yet — register first.';
    if (mobile !== state.owner.mobile || hashPin(pin, mobile) !== state.owner.pinHash) {
      return 'Wrong mobile or PIN. Try again, or use Forgot PIN.';
    }
    await issueSession(mobile);
    setAuthStatus('authed');
    if (!state.profiles.length) setShowLang(false);
    return null;
  }

  async function registerAccount(mobile: string, pin: string, pin2: string, recoveryWord: string): Promise<string | null> {
    if (!/^\d{10}$/.test(mobile)) return 'Enter a 10-digit mobile number.';
    if (!/^\d{4,6}$/.test(pin)) return 'PIN must be 4 to 6 digits.';
    if (pin !== pin2) return 'PINs do not match.';
    if (!recoveryWord.trim()) return 'Enter a recovery word (needed if you forget the PIN).';
    setState((prev) => ({
      ...prev,
      owner: { mobile, pinHash: hashPin(pin, mobile), recoveryWord: recoveryWord.trim().toLowerCase(), createdAt: new Date().toISOString() },
    }));
    await issueSession(mobile);
    setAuthStatus('authed');
    return null;
  }

  async function resetPin(mobile: string, recoveryWord: string, pin: string): Promise<string | null> {
    if (!state.owner) return 'No account yet — register first.';
    if (mobile !== state.owner.mobile || recoveryWord.trim().toLowerCase() !== state.owner.recoveryWord) {
      return 'Mobile or recovery word does not match.';
    }
    if (!/^\d{4,6}$/.test(pin)) return 'New PIN must be 4 to 6 digits.';
    setState((prev) => prev.owner ? { ...prev, owner: { ...prev.owner, pinHash: hashPin(pin, mobile) } } : prev);
    return null;
  }

  function logout() {
    revokeSession();
    setAuthStatus('guest');
    router.replace('/login');
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
      mobile: bizMobile || '',
      openingCashPaise: 0,
      openingUpiPaise: 0,
      receiptPrefix: 'BK',
      receiptCounter: 0,
      language: 'en',
      aiLanguage: 'auto',
      voiceReplies: false,
      voiceRate: 1,
      voiceContinuous: false,
      voiceByLang: {},
      theme: 'light',
      servicesV2Migrated: true,
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

  const ctx: AppCtx = {
    state,
    profile: profile as BusinessProfile,
    mutate,
    softDelete,
    go,
    goService,
    goServiceFilter,
    openCustomer,
    openAgent,
    authStatus,
    hydrated,
    reverify,
    loginWithPin,
    registerAccount,
    resetPin,
    logout,
    showLang,
    setShowLang,
    showAddBusiness,
    setShowAddBusiness,
    bizName,
    setBizName,
    bizCategory,
    setBizCategory,
    bizAddress,
    setBizAddress,
    bizMobile,
    setBizMobile,
    createBusiness,
    storageError,
  };

  // Provide a placeholder profile object before one exists so the context
  // type stays satisfied; the Shell never renders views until a real
  // profile exists, so this placeholder is never read by a view.
  const safeCtx: AppCtx = profile ? ctx : { ...ctx, profile: {} as BusinessProfile };

  return <AppContext.Provider value={safeCtx}>{children}</AppContext.Provider>;
}

/** The last private route, for the `/` redirect. */
export function useLastPath(): string | null {
  const [last, setLast] = React.useState<string | null>(null);
  React.useEffect(() => { setLast(readLastPath()); }, []);
  return last;
}
