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
      'Document Work',
      'Money Transfer',
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
