/**
 * Route registry for the BizKhata website.
 * Every feature has its own proper URL (App Router, static export).
 * The address bar always reflects the open page; refresh keeps the page.
 */
export interface RouteDef {
  key: string;
  path: string;
  title: string;
  sub: string;
  icon: string;
  /** i18n key for the sidebar label (falls back to title). */
  i18n?: string;
  /** Customization Studio module key that can hide this route. */
  module?: string;
}

export const ROUTES: RouteDef[] = [
  { key: 'dashboard', path: '/dashboard', title: 'Dashboard', sub: 'Your business at a glance', icon: '⌂', i18n: 'dashboard' },
  { key: 'daily', path: '/daily-business', title: 'Daily Business', sub: 'One page for the day\u2019s small work \u2014 collection, expenses, earnings', icon: '◷', i18n: 'dailyBusiness' },
  { key: 'cash', path: '/cash-book', title: 'Cash Book', sub: 'Cash received, spent and internal transfers', icon: '▤', i18n: 'cashBook' },
  { key: 'upi', path: '/upi-book', title: 'UPI Book', sub: 'UPI received, spent and internal transfers', icon: '⌁', i18n: 'upiBook' },
  { key: 'mt', path: '/money-transfer', title: 'Money Transfer', sub: 'Separate ledger — commission is the only profit', icon: '⇄', i18n: 'moneyTransfer', module: 'moneyTransfer' },
  { key: 'services', path: '/services', title: 'Services', sub: 'Jobs across all services', icon: '▦', i18n: 'services' },
  { key: 'customers', path: '/customers', title: 'Customers', sub: 'Everyone you serve', icon: '◉', i18n: 'customers' },
  { key: 'khata', path: '/customer-khata', title: 'Customer Khata', sub: 'Per-customer ledger — who owes what', icon: '▤', i18n: 'customerKhata' },
  { key: 'agents', path: '/agents', title: 'Agents', sub: 'Backend agents and what you owe them', icon: '◉', i18n: 'agents', module: 'agents' },
  { key: 'agent-payments', path: '/agent-payments', title: 'Agent Payments', sub: 'Payment history and record a payment to an agent', icon: '▤', i18n: 'agents', module: 'agents' },
  { key: 'expenses', path: '/expenses', title: 'Expenses', sub: 'Shop spending, linked to services', icon: '▤', i18n: 'expenses' },
  { key: 'maintenance', path: '/machine-maintenance', title: 'Machine Maintenance', sub: 'Machines, service history and lifetime cost', icon: '⚙', i18n: 'maintenance', module: 'maintenance' },
  { key: 'receipts', path: '/receipts', title: 'Receipts', sub: 'Professional receipts, A4 + thermal', icon: '▦', i18n: 'receipts', module: 'receipts' },
  { key: 'receipt-generator', path: '/receipt-generator', title: 'Receipt Generator', sub: 'Create a professional receipt from a job', icon: '▦', i18n: 'receipts', module: 'receipts' },
  { key: 'reports', path: '/reports', title: 'Reports', sub: 'Business, service, customer and agent reports', icon: '↗', i18n: 'reports', module: 'reports' },
  { key: 'difference', path: '/difference-finder', title: 'Difference Finder', sub: 'Expected vs recorded — suggestions only, never edits', icon: '≠', i18n: 'differenceFinder', module: 'differenceFinder' },
  { key: 'chatbot', path: '/chatbot', title: 'AI Assistant', sub: 'Ask about your business — profit, dues, agents, Money Transfer', icon: '💬' },
  { key: 'recycle', path: '/recycle-bin', title: 'Recycle Bin', sub: 'Deleted records — restore them here', icon: '↺', i18n: 'recycleBin' },
  { key: 'audit', path: '/audit-log', title: 'Audit Log', sub: 'Every change, old value → new value', icon: '☰', i18n: 'auditLog' },
  { key: 'customize', path: '/customization', title: 'Customization Studio', sub: 'Services, modules and dashboard cards for this profile', icon: '✦', i18n: 'customization' },
  { key: 'settings', path: '/settings', title: 'Settings', sub: 'Business, language, theme, receipts, backup and AI', icon: '⚙', i18n: 'settings' },
  { key: 'customer-profile', path: '/customers', title: 'Customer Profile', sub: 'Ledger, jobs, payments and documents for one customer', icon: '◉' },
  { key: 'agent-profile', path: '/agents', title: 'Agent Profile', sub: 'Assigned jobs, charges, payments and payable for one agent', icon: '◉' },
];

export function routeForKey(key: string): RouteDef {
  return ROUTES.find((r) => r.key === key) || ROUTES[0];
}

export function routeForPath(path: string): RouteDef | null {
  const clean = path.replace(/\/$/, '') || '/';
  if (clean === '/') return null;
  // Exact match first.
  const exact = ROUTES.find((r) => r.path === clean);
  if (exact) return exact;
  // /services/<slug>, /customers/<id>, /agents/<id>, /reports/<type>, /settings/<section>
  if (clean.startsWith('/services/')) return routeForKey('services');
  if (clean.startsWith('/customers/')) return routeForKey('customer-profile');
  if (clean.startsWith('/agents/')) return routeForKey('agent-profile');
  if (clean.startsWith('/reports/')) return routeForKey('reports');
  if (clean.startsWith('/settings/')) return routeForKey('settings');
  return null;
}

/** Service name -> URL slug. */
export const SERVICE_SLUGS: Record<string, string> = {
  'PAN Card': 'pan-card',
  'Aadhaar Services': 'aadhaar',
  'Voter ID': 'voter-id',
  'Ayushman Card': 'ayushman',
  Xerox: 'xerox',
  Printing: 'printing',
  'Passport Size Photo': 'passport-photo',
  Scanning: 'scanning',
  'Smart Card': 'smart-card',
  'Document Work': 'document-work',
};

export const SLUG_SERVICES: Record<string, string> = Object.fromEntries(
  Object.entries(SERVICE_SLUGS).map(([name, slug]) => [slug, name]),
);

export function serviceSlug(name: string): string {
  return SERVICE_SLUGS[name] || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function serviceFromSlug(slug: string): string | null {
  return SLUG_SERVICES[slug] || null;
}

export function serviceLabel(slug: string): string {
  return serviceFromSlug(slug) || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Services that are real job types. 'Money Transfer' is a separate
 *  top-level module with its own ledger — never a job service. Older
 *  profiles may still carry it in their saved service list, so every
 *  service list in the UI goes through this filter. */
export function jobServices(services: string[]): string[] {
  return services.filter((s) => s !== 'Money Transfer');
}

/** /reports/<type> -> ReportsView tab. */
export const REPORT_TYPES = ['income', 'expenses', 'profit', 'service-wise', 'daily-business'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export function reportTabFromType(type: string): 'business' | 'service' | 'expenses' | 'daily' {
  if (type === 'service-wise') return 'service';
  if (type === 'expenses') return 'expenses';
  if (type === 'daily-business') return 'daily';
  return 'business'; // income + profit both show the business summary
}

/** /settings/<section> sections. */
export const SETTING_SECTIONS = ['profile', 'business', 'language', 'receipt', 'security'] as const;
export type SettingSection = (typeof SETTING_SECTIONS)[number];

/** Paths that are private (everything except /, /login). */
export function isPrivatePath(path: string): boolean {
  const clean = path.replace(/\/$/, '') || '/';
  return clean !== '/' && clean !== '/login';
}
