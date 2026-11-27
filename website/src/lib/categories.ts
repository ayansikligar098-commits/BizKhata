/**
 * Business categories (15, chosen at signup) with ready-made services.
 * CSC / Cyber Cafe is the primary, fully-built category.
 * Other categories get their own ready-made service lists; owners can add
 * more services in Customization Studio. No school modules anywhere.
 */

export interface CategoryDef {
  name: string;
  services: string[];
  expenseCategories: string[];
}

export const CATEGORIES: CategoryDef[] = [
  {
    name: 'Cyber Cafe / CSC Center',
    services: [
      'PAN Card',
      'Aadhaar Services',
      'Voter ID',
      'Ayushman Card',
      'Smart Card',
      'Xerox',
      'Printing',
      'Passport Size Photo',
      'Scanning',
      'Document Work',
    ],
    expenseCategories: [
      'Machine Repair',
      'Printer Repair',
      'Servicing',
      'Ink',
      'Toner',
      'Cartridge',
      'Paper',
      'Printhead',
      'Spare Parts',
      'Electricity',
      'Internet',
      'Rent',
      'Staff',
      'Transport',
      'Other',
    ],
  },
  {
    name: 'Mobile Shop',
    services: ['Mobile Sale', 'Recharge', 'Accessories', 'Mobile Repair', 'SIM Card'],
    expenseCategories: ['Purchase', 'Rent', 'Electricity', 'Staff', 'Transport', 'Other'],
  },
  {
    name: 'Grocery / Kirana',
    services: ['Grocery Sale', 'Home Delivery', 'Customer Credit'],
    expenseCategories: ['Purchase', 'Rent', 'Electricity', 'Staff', 'Transport', 'Other'],
  },
  {
    name: 'Clothing Store',
    services: ['Clothing Sale', 'Stitching', 'Alteration'],
    expenseCategories: ['Purchase', 'Rent', 'Electricity', 'Staff', 'Transport', 'Other'],
  },
  {
    name: 'Electronics Shop',
    services: ['Electronics Sale', 'Repair', 'Installation'],
    expenseCategories: ['Purchase', 'Rent', 'Electricity', 'Staff', 'Transport', 'Other'],
  },
  {
    name: 'Printing Shop',
    services: ['Printing', 'Xerox', 'Binding', 'Flex Printing', 'Lamination'],
    expenseCategories: ['Paper', 'Ink', 'Toner', 'Machine Repair', 'Rent', 'Electricity', 'Staff', 'Other'],
  },
  {
    name: 'Hardware Shop',
    services: ['Hardware Sale', 'Tools Sale', 'Fitting Work'],
    expenseCategories: ['Purchase', 'Rent', 'Electricity', 'Staff', 'Transport', 'Other'],
  },
  {
    name: 'Medical Store',
    services: ['Medicine Sale', 'Health Products'],
    expenseCategories: ['Purchase', 'Rent', 'Electricity', 'Staff', 'Transport', 'Other'],
  },
  {
    name: 'Restaurant / Cafe',
    services: ['Food Sale', 'Tea / Coffee', 'Home Delivery', 'Catering'],
    expenseCategories: ['Ingredients', 'Gas', 'Rent', 'Electricity', 'Staff', 'Transport', 'Other'],
  },
  {
    name: 'Salon',
    services: ['Haircut', 'Shaving', 'Facial', 'Colour'],
    expenseCategories: ['Products', 'Rent', 'Electricity', 'Staff', 'Other'],
  },
  {
    name: 'Automobile / Garage',
    services: ['Repair', 'Servicing', 'Washing', 'Spare Parts'],
    expenseCategories: ['Spare Parts', 'Rent', 'Electricity', 'Staff', 'Transport', 'Other'],
  },
  {
    name: 'Wholesale Business',
    services: ['Wholesale Sale', 'Bulk Order', 'Delivery'],
    expenseCategories: ['Purchase', 'Rent', 'Electricity', 'Staff', 'Transport', 'Other'],
  },
  {
    name: 'General Retail',
    services: ['Retail Sale', 'Home Delivery'],
    expenseCategories: ['Purchase', 'Rent', 'Electricity', 'Staff', 'Transport', 'Other'],
  },
  {
    name: 'Service Business',
    services: ['Service Work', 'Consultation', 'Home Visit'],
    expenseCategories: ['Rent', 'Electricity', 'Staff', 'Transport', 'Other'],
  },
  {
    name: 'Other Business',
    services: ['Sale', 'Service'],
    expenseCategories: ['Purchase', 'Rent', 'Electricity', 'Staff', 'Transport', 'Other'],
  },
];

export const CSC_SERVICES = CATEGORIES[0].services;

/** Services added to CSC profiles after v1 (Daily Business redesign).
 *  Existing profiles get them once via the servicesV2Migrated flag. */
export const CSC_SERVICES_V2 = ['Passport Size Photo', 'Scanning'];

/** Label used in the Daily Business hub for Money Transfer earnings.
 *  Only commission ever appears here — never the transfer principal. */
export const MT_COMMISSION_SERVICE = 'Money Transfer Commission';

/**
 * UPDATE 26 — "Dhanda": the owner's word for the whole day's mixed
 * business (his definition, 2026-11-27 21:01 IST): Passport Size
 * Photo + Smart Card + Xerox + Documents profit + Money Transfer
 * profit, all together. It is a GENERAL Daily Business category for
 * a mixed total, NOT one of the shop's services — so it is deliberately
 * NOT added to any profile's `services` list and gets NO tile on the
 * Services page. The chat parser maps the word to this label, and the
 * backend allow-lists it (assistant.ts) exactly like 'Other Services'.
 * The Daily Business hub already attributes any service string, so a
 * Dhanda entry shows up there, in Cash/UPI Books and in Reports
 * without ever being split across services.
 */
export const DHANDA_SERVICE = 'Dhanda';

/** Fallback service for manual Cash/UPI Book income with no job or entry. */
export const OTHER_SERVICES = 'Other Services';

/** Services that must NEVER be assigned to an agent (done by ayan himself). */
export const NON_OUTSOURCEABLE_SERVICES = ['PAN Card'];

/** Money Transfer other-expense categories (fixed by spec). */
export const MT_EXPENSE_CATEGORIES = [
  'Tea/Food',
  'Transport',
  'Staff',
  'Shop',
  'Miscellaneous',
] as const;

export const JOB_STATUSES = [
  'New',
  'In Progress',
  'Submitted',
  'Pending',
  'Completed',
  'Delivered',
  'Cancelled',
] as const;
