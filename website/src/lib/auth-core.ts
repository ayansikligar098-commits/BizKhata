/**
 * BizKhata auth decisions (UPDATE 24) — pure functions, no React/Next.
 *
 * app-context.tsx calls these and only then applies the state change /
 * issues a session. Keeping the decisions here means the exact code the
 * UI runs is what tests/auth-update24.test.mjs drives — no duplicated
 * logic in the tests.
 *
 * Rules:
 * - The mobile is ALWAYS normalized (see normalizeMobile in store.ts)
 *   BEFORE any comparison or hashing — hashPin salts with the mobile.
 * - One owner per device/browser: register is blocked when an owner
 *   already exists; it never overwrites the owner or the PIN.
 * - Login never reveals whether the mobile or the PIN was wrong.
 * - When there is no owner at login, the caller distinguishes the two
 *   honest cases via hasSessionRecord() (session.ts): no session record
 *   at all = no account on this device/browser; a record with no owner =
 *   stored account lost (cleared/corrupt store) — offer recovery.
 */
import { hashPin, normalizeMobile } from './store';
import type { OwnerAccount } from './types';

export const ALREADY_EXISTS_ERROR =
  'Is number par account pehle se hai — login karo ya Forgot PIN use karo.';
export const NO_ACCOUNT_ON_DEVICE_ERROR =
  'Is device/browser par koi account nahi hai — pehle Create Account karo. Account sirf usi browser/app mein rehta hai jisme banaya tha.';
export const OWNER_LOST_ERROR =
  'Is device par login session mila, lekin saved account nahi mila — shayad data clear ho gaya hai. Backup se restore karo, ya naya account banao (purana data backup ke bina wapas nahi aayega).';
export const WRONG_CREDENTIALS_ERROR = 'Wrong mobile or PIN. Try again, or use Forgot PIN.';
export const INVALID_MOBILE_ERROR = 'Enter a 10-digit mobile number.';

export type AuthDecision =
  | { ok: false; error: string }
  | { ok: true; mobile: string; owner: OwnerAccount };

/** Login: normalized mobile + PIN checked against the stored hash. */
export function decideLogin(owner: OwnerAccount | null, mobile: string, pin: string): AuthDecision {
  const norm = normalizeMobile(mobile);
  if (!owner || !norm) return { ok: false, error: WRONG_CREDENTIALS_ERROR };
  // Stored mobiles were validated as 10-digit at registration; normalize
  // the stored value too so an old un-normalized record still matches.
  const stored = normalizeMobile(owner.mobile) ?? owner.mobile;
  if (norm !== stored || hashPin(pin, norm) !== owner.pinHash) {
    return { ok: false, error: WRONG_CREDENTIALS_ERROR };
  }
  return { ok: true, mobile: norm, owner };
}

/**
 * Register: blocked when an owner already exists (one account per mobile
 * per device/browser). On success returns the new owner — the caller
 * spreads it into state with {...prev, owner} so business data survives.
 */
export function decideRegister(
  owner: OwnerAccount | null,
  mobile: string,
  pin: string,
  pin2: string,
  recoveryWord: string,
): AuthDecision {
  if (owner) return { ok: false, error: ALREADY_EXISTS_ERROR };
  const norm = normalizeMobile(mobile);
  if (!norm) return { ok: false, error: INVALID_MOBILE_ERROR };
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, error: 'PIN must be 4 to 6 digits.' };
  if (pin !== pin2) return { ok: false, error: 'PINs do not match.' };
  if (!recoveryWord.trim()) {
    return { ok: false, error: 'Enter a recovery word (needed if you forget the PIN).' };
  }
  return {
    ok: true,
    mobile: norm,
    owner: {
      mobile: norm,
      pinHash: hashPin(pin, norm),
      recoveryWord: recoveryWord.trim().toLowerCase(),
      createdAt: new Date().toISOString(),
    },
  };
}

/** PIN reset: normalized mobile + case-insensitive recovery word; returns the new hash. */
export function decideResetPin(
  owner: OwnerAccount | null,
  mobile: string,
  recoveryWord: string,
  pin: string,
): { ok: false; error: string } | { ok: true; mobile: string; pinHash: string } {
  const norm = normalizeMobile(mobile);
  if (!owner || !norm) return { ok: false, error: 'Mobile or recovery word does not match.' };
  const stored = normalizeMobile(owner.mobile) ?? owner.mobile;
  if (norm !== stored || recoveryWord.trim().toLowerCase() !== owner.recoveryWord) {
    return { ok: false, error: 'Mobile or recovery word does not match.' };
  }
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, error: 'New PIN must be 4 to 6 digits.' };
  return { ok: true, mobile: norm, pinHash: hashPin(pin, norm) };
}
