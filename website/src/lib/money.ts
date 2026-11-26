/**
 * Money handling for BizKhata.
 *
 * RULE: money is ALWAYS stored as integer paise (1 rupee = 100 paise).
 * Never use float/double for money. All arithmetic is integer arithmetic,
 * so ₹500 - ₹200 is exactly ₹300 and never ₹299.999999.
 */

/** Rupees (as typed by the user, e.g. 500 or 500.5) -> integer paise. */
export function rupeesToPaise(rupees: number | string): number {
  const n = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/** Integer paise -> rupees as a number (for display only). */
export function paiseToRupees(paise: number): number {
  return Math.floor(paise) / 100;
}

/** Format integer paise as Indian rupees with Indian digit grouping,
 *  e.g. 50000 -> "₹500.00", 12345678 -> "₹1,23,456.78". */
export function formatINR(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const s = rupees.toString();
  let grouped: string;
  if (s.length <= 3) grouped = s;
  else {
    const last3 = s.slice(-3);
    let rest = s.slice(0, -3);
    const parts: string[] = [];
    while (rest.length > 2) {
      parts.unshift(rest.slice(-2));
      rest = rest.slice(0, -2);
    }
    if (rest) parts.unshift(rest);
    grouped = `${parts.join(',')},${last3}`;
  }
  return `${negative ? '-' : ''}₹${grouped}.${p.toString().padStart(2, '0')}`;
}

/** Short form for cards: ₹500, ₹1.2k style is avoided — always exact. */
export function formatINRShort(paise: number): string {
  return formatINR(paise);
}

/** Parse a user-typed amount string safely. Returns paise, or null if invalid. */
export function parseAmount(input: string): number | null {
  const cleaned = input.trim().replace(/[₹,\s]/g, '');
  if (cleaned === '' || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return rupeesToPaise(parseFloat(cleaned));
}

/** Add paise safely (integers only). */
export function addPaise(...values: number[]): number {
  return values.reduce((a, b) => a + Math.round(b), 0);
}
