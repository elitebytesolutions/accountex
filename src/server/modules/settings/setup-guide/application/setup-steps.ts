/**
 * Setup Guide step content (template app/setup, 9A-company-plus.js STEPS), with the demo-specific tips made neutral.
 * Weights and minutes match the view Company.getSetupGuideProgress. `phase` is the roadmap phase that builds the step's
 * screen: until then the step shows "Available in Phase N" instead of a link.
 */
export const BUILT_THROUGH_PHASE = 1;

export interface StepDefinition {
  key: string;
  group: string;
  title: string;
  weightPct: number;
  minutes: number;
  icon: string;
  route: string;
  phase: number;
  cta: string;
  description: string;
  tips: string[];
}

export const SETUP_STEPS: StepDefinition[] = [
  { key: 'PROFILE', group: 'Basics', title: 'Company profile', weightPct: 10, minutes: 3, icon: 'building-2', route: '/settings', phase: 1, cta: 'Review profile',
    description: 'Legal name, NTN, STRN, registered address, logo and financial year. These print on every invoice and FBR return.',
    tips: ['NTN and STRN in FBR format', 'Registered address as on SECP record', 'Financial year start month'] },
  { key: 'COA', group: 'Basics', title: 'Chart of accounts', weightPct: 14, minutes: 10, icon: 'list-tree', route: '/accounting/coa', phase: 3, cta: 'Open chart of accounts',
    description: 'Start from a Pakistan chart of accounts template and tailor the expense heads to how you report.',
    tips: ['Apply a template', 'Link control accounts to AR / AP', 'Map tax accounts to FBR heads'] },
  { key: 'OPENING', group: 'Money', title: 'Opening balances', weightPct: 14, minutes: 15, icon: 'scale', route: '/accounting/opening', phase: 16, cta: 'Enter opening balances',
    description: 'Bring in your trial balance at the go-live date, plus open customer and vendor invoices so ageing is correct from day one.',
    tips: ['Trial balance must be in balance', 'Upload open invoices from Excel', 'Value opening stock'] },
  { key: 'ITEMS', group: 'Basics', title: 'Import items', weightPct: 10, minutes: 8, icon: 'package', route: '/import', phase: 35, cta: 'Import items',
    description: 'Upload your item master with SKUs, barcodes, units, pack sizes, cost and selling price.',
    tips: ['SKUs and barcodes', 'Units and pack sizes', 'Default sales tax per item'] },
  { key: 'BANK', group: 'Money', title: 'Connect bank', weightPct: 10, minutes: 5, icon: 'landmark', route: '/bank/accounts', phase: 4, cta: 'Manage bank accounts',
    description: 'Add your bank accounts, then import statements or turn on rules to categorise routine lines automatically.',
    tips: ['Add each bank account', 'Import statements', 'Set up bank rules'] },
  { key: 'TAX', group: 'Compliance', title: 'Tax & FBR', weightPct: 10, minutes: 7, icon: 'shield-check', route: '/tax/fbr', phase: 5, cta: 'Configure tax',
    description: 'Set sales tax rates, withholding sections and connect FBR integration for real-time invoice reporting.',
    tips: ['Sales tax rates', 'WHT sections and filer status', 'FBR integration key'] },
  { key: 'TEAM', group: 'People', title: 'Invite team', weightPct: 8, minutes: 4, icon: 'user-plus', route: '/settings/users', phase: 2, cta: 'Invite users',
    description: 'Invite your accountant, sales team and HR, and give each a role so they see only what they need.',
    tips: ['Invite users by email', 'Assign roles', 'Enforce MFA for finance'] },
  { key: 'INVOICE', group: 'Money', title: 'First invoice', weightPct: 10, minutes: 3, icon: 'receipt-text', route: '/sales/invoices/new', phase: 23, cta: 'Create an invoice',
    description: 'Raise a sales tax invoice, share it with the customer and watch it flow into receivables and the ledger.',
    tips: ['Issue a sales tax invoice', 'Share it with the customer', 'Check it posted to the ledger'] },
  { key: 'PAYROLL', group: 'People', title: 'Payroll setup', weightPct: 14, minutes: 20, icon: 'wallet-cards', route: '/hr/payroll/structures', phase: 12, cta: 'Set up payroll',
    description: 'Define salary structures, EOBI / social security contributions and income tax slabs, then run a dry-run payroll.',
    tips: ['Salary structures and allowances', 'EOBI and social security rates', 'Income tax slabs'] },
];
