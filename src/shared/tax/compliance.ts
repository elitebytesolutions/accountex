import { z } from 'zod';

/**
 * Phase 28 — tax compliance: sales tax returns (Annex-C / Annex-A), the WHT register with challans, certificates and
 * statements, and FBR invoice submissions. Amounts are in the company currency.
 */
const id = z.uuid();
const rowVersion = z.coerce.number().int().min(0);
const money = z.coerce.number('Enter an amount').min(0, 'Not negative').max(100_000_000_000);
const month = z.string().regex(/^\d{4}-\d{2}(-01)?$/, 'Choose a month').transform((v) => (v.length === 7 ? `${v}-01` : v));
const date = z.iso.date('Choose a date');
const cpr = z.string().trim().min(6, 'Enter the CPR number').max(40);
const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
type Who = { id: string; name: string } | null;
type Party = { id: string; name: string } | null;

// ---------------------------------------------------------------- sales tax returns
export const TAX_AUTHORITIES = ['FBR', 'PRA', 'SRB', 'KPRA', 'BRA'] as const;

export type SalesTaxReturnLine = {
  id: string;
  annex: 'A' | 'C' | 'H';
  lineNo: number;
  party: string | null;
  partyNtnCnic: string | null;
  partyStrn: string | null;
  isRegistered: boolean | null;
  /** The source document (invoice / credit note / bill / debit note) and where it opens. */
  document: { id: string; kind: 'INVOICE' | 'CREDIT_NOTE' | 'BILL' | 'DEBIT_NOTE'; no: string | null } | null;
  documentDate: string | null;
  taxRate: number | null;
  valueExclTax: number;
  salesTax: number;
  furtherTax: number;
  matchStatus: string | null;
  isAdmissible: boolean;
  rowVersion: number;
};

export type SalesTaxReturn = {
  id: string;
  docNo: string;
  authority: string;
  periodMonth: string;
  revisionNo: number;
  strn: string;
  dueDate: string;
  outputTax: number;
  furtherTax: number;
  totalOutputTax: number;
  inputTax: number;
  inadmissibleInput: number;
  admissibleInputTax: number;
  carryForwardIn: number;
  netPayable: number;
  inputCapPct: number;
  annexCCount: number;
  annexACount: number;
  excludeUnmatchedInput: boolean;
  status: string;
  filedOn: string | null;
  filedBy: Who;
  cprNo: string | null;
  paidOn: string | null;
  paidAmount: number | null;
  paidFrom: { id: string; name: string } | null;
  paymentJournal: { id: string; docNo: string } | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};
export type SalesTaxReturnDetail = SalesTaxReturn & {
  lines: SalesTaxReturnLine[];
  /** Pre-filing checks shown in the Validation panel (warnings never block filing). */
  checks: { key: string; ok: boolean; title: string; detail: string }[];
  /** Further tax summary (unregistered buyers) for the info banner. */
  furtherTaxInvoices: number;
  /** FBR digital invoice sync for the month: reported / required. */
  fbrSync: { reported: number; required: number };
};
export type SalesTaxReturnList = { items: SalesTaxReturn[]; total: number };

export const SalesTaxReturnQuerySchema = z.object({
  authority: z.enum(TAX_AUTHORITIES).optional(),
  status: z.string().trim().max(20).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type SalesTaxReturnQuery = z.infer<typeof SalesTaxReturnQuerySchema>;

export const SalesTaxReturnPrepareSchema = z.object({ periodMonth: month, authority: z.enum(TAX_AUTHORITIES).default('FBR') });
export type SalesTaxReturnPrepare = z.infer<typeof SalesTaxReturnPrepareSchema>;

/** Draft edits: remarks, "exclude unmatched input", and the Annex-A lines flagged unmatched. */
export const SalesTaxReturnUpdateSchema = z.object({
  remarks: text(1000),
  excludeUnmatchedInput: z.boolean().optional(),
  unmatchedLineIds: z.array(id).max(5000).optional(),
  rowVersion,
});
export type SalesTaxReturnUpdate = z.infer<typeof SalesTaxReturnUpdateSchema>;

export const SalesTaxReturnPaySchema = z.object({
  cprNo: cpr,
  paidOn: date,
  bankAccountId: id,
  paidAmount: money,
  rowVersion,
});
export type SalesTaxReturnPay = z.infer<typeof SalesTaxReturnPaySchema>;

// ---------------------------------------------------------------- WHT register and challans
export type WhtDeduction = {
  id: string;
  direction: string;
  deductionDate: string;
  periodMonth: string;
  whtSection: string;
  taxCode: { id: string; code: string } | null;
  party: string;
  partyNtnCnic: string | null;
  vendor: Party;
  customer: Party;
  employee: Party;
  isAtl: boolean | null;
  /** Source document (null for a deduction entered by hand). */
  source: { type: string; id: string; docNo: string | null } | null;
  taxableAmount: number;
  taxRate: number | null;
  taxAmount: number;
  status: string;
  challan: { id: string; docNo: string; cprNo: string } | null;
  certificate: { id: string; certificateNo: string } | null;
  createdAt: string;
  rowVersion: number;
};
export type WhtDeductionList = { items: WhtDeduction[]; total: number };

export const WhtQuerySchema = z.object({
  period: month.optional(),
  section: z.string().trim().max(40).optional(),
  direction: z.string().trim().max(20).optional(),
  status: z.string().trim().max(20).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type WhtQuery = z.infer<typeof WhtQuerySchema>;

/** One row of "Deductions by section" for a month. */
export type WhtSectionSummary = {
  direction: string;
  whtSection: string;
  transactions: number;
  taxableAmount: number;
  /** Single rate when every row shares it, else null ("Slab" / mixed). */
  rate: number | null;
  taxAmount: number;
  unpaid: number;
  status: 'UNPAID' | 'PAID' | 'PART_PAID';
};
export type WhtSummary = {
  period: string;
  sections: WhtSectionSummary[];
  deducted: number;
  transactions: number;
  unpaid: number;
  dueDate: string;
  /** Deposited in the fiscal quarter so far, and the quarter's label. */
  depositedQuarter: number;
  quarterLabel: string;
  /** Next quarterly statement (u/s 165) in this quarter, if prepared. */
  statement: { label: string; dueDate: string; status: string } | null;
  suffered: number;
};

/** A deduction entered by hand (e.g. rent u/s 155). Party is a vendor, customer or employee, or just a name. */
export const WhtDeductionInputSchema = z.object({
  direction: z.enum(['DEDUCTED', 'COLLECTED', 'SUFFERED']),
  deductionDate: date,
  whtSection: z.string().trim().min(1, 'Choose a section').max(40),
  taxCodeId: id.optional().nullable(),
  vendorId: id.optional().nullable(),
  customerId: id.optional().nullable(),
  employeeId: id.optional().nullable(),
  partyName: z.string().trim().min(2, 'Enter the party').max(200),
  partyNtnCnic: text(30),
  taxableAmount: money,
  taxRate: z.coerce.number().min(0).max(100).optional().nullable(),
  taxAmount: money.refine((v) => v > 0, 'Enter the tax amount'),
  branchId: id.optional().nullable(),
});
export type WhtDeductionInput = z.infer<typeof WhtDeductionInputSchema>;

export type WhtChallan = {
  id: string;
  docNo: string;
  cprNo: string;
  periodMonth: string;
  sections: string[];
  paymentDate: string;
  bankAccount: { id: string; name: string } | null;
  amount: number;
  status: string;
  journal: { id: string; docNo: string } | null;
  deductions: number;
  remarks: string | null;
  createdAt: string;
  rowVersion: number;
};

export const WhtChallanInputSchema = z.object({
  periodMonth: month,
  sections: z.array(z.string().trim().min(1).max(40)).min(1, 'Choose the sections this challan pays'),
  cprNo: cpr,
  paymentDate: date,
  bankAccountId: z.uuid('Choose the bank account'),
  amount: money.refine((v) => v > 0, 'Enter the amount'),
  remarks: text(500),
  /** Post (pay) right away: records the CPR, links the deductions and posts the BPV. */
  post: z.boolean().default(true),
});
export type WhtChallanInput = z.infer<typeof WhtChallanInputSchema>;

// ---------------------------------------------------------------- certificates and statements
export type WhtCertificate = {
  id: string;
  direction: string;
  certificateNo: string;
  party: string;
  partyNtnCnic: string | null;
  vendor: Party;
  customer: Party;
  employee: Party;
  whtSection: string;
  periodFrom: string;
  periodTo: string;
  taxableAmount: number;
  taxAmount: number;
  cprNo: string | null;
  challan: { id: string; docNo: string } | null;
  issuedOn: string | null;
  receivedOn: string | null;
  status: string;
  deductions: number;
  rowVersion: number;
};
export type WhtCertificateList = { items: WhtCertificate[]; total: number };

export const WhtCertificateQuerySchema = z.object({
  direction: z.enum(['ISSUED', 'RECEIVED']).optional(),
  status: z.string().trim().max(20).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type WhtCertificateQuery = z.infer<typeof WhtCertificateQuerySchema>;

export const WhtCertificateGenerateSchema = z.object({ periodFrom: date, periodTo: date })
  .refine((v) => v.periodTo >= v.periodFrom, { path: ['periodTo'], message: 'On or after the start' });

/** A certificate received from a customer for tax they withheld from us. */
export const WhtCertificateReceiveSchema = z.object({
  customerId: z.uuid('Choose the customer'),
  certificateNo: z.string().trim().min(2, 'Enter the certificate number').max(60),
  whtSection: z.string().trim().max(40).optional().nullable().transform((v) => v || null),
  periodFrom: date,
  periodTo: date,
  receivedOn: date,
  cprNo: text(40),
  taxAmount: money.optional().nullable(),
}).refine((v) => v.periodTo >= v.periodFrom, { path: ['periodTo'], message: 'On or after the start' });
export type WhtCertificateReceive = z.infer<typeof WhtCertificateReceiveSchema>;

export type WhtStatement = {
  id: string;
  returnType: string;
  label: string;
  periodFrom: string;
  periodTo: string;
  dueDate: string;
  taxAmount: number;
  status: string;
  filedOn: string | null;
  filedBy: Who;
  irisReference: string | null;
  rowVersion: number;
};

export const WhtStatementPrepareSchema = z.object({
  returnType: z.enum(['QUARTERLY_165', 'ANNUAL_149', 'ANNUAL_165']),
  /** Any date in the quarter (quarterly) or fiscal year (annual). */
  periodOf: date,
});
export type WhtStatementPrepare = z.infer<typeof WhtStatementPrepareSchema>;
export const WhtStatementFileSchema = z.object({ filedOn: date, irisReference: z.string().trim().min(3, 'Enter the IRIS reference').max(60), rowVersion });

// ---------------------------------------------------------------- FBR submissions
export type FbrSubmission = {
  id: string;
  authority: string;
  document: { kind: 'INVOICE' | 'CREDIT_NOTE'; id: string; no: string };
  buyerName: string | null;
  buyerNtnCnic: string | null;
  amount: number;
  status: string;
  attempts: number;
  firstSubmittedAt: string | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  fbrInvoiceNo: string | null;
  responseCode: string | null;
  errorMessage: string | null;
  latencyMs: number | null;
  createdAt: string;
  rowVersion: number;
};
export type FbrSubmissionList = {
  items: FbrSubmission[];
  total: number;
  counts: { pending: number; failed: number; accepted: number; skipped: number };
  /** This month: accepted / due (documents reported or waiting). */
  month: { accepted: number; total: number };
};
export const FbrSubmissionQuerySchema = z.object({
  authority: z.enum(['FBR', 'PRA']).default('FBR'),
  status: z.string().trim().max(20).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export type FbrSubmissionQuery = z.infer<typeof FbrSubmissionQuerySchema>;

export type FbrConnectionEvent = { id: string; occurredAt: string; event: string; ok: boolean; latencyMs: number | null; retriedCount: number | null; actor: Who; details: string | null };

/** What is waiting when sending is first switched on. */
export type FbrBacklog = { pending: number; failed: number; oldest: string | null; newest: string | null; amount: number };
export const FbrBacklogSkipSchema = z.object({ authority: z.enum(['FBR', 'PRA']).default('FBR'), from: date, to: date })
  .refine((v) => v.to >= v.from, { path: ['to'], message: 'On or after the start' });
export const FbrAuthorityBodySchema = z.object({ authority: z.enum(['FBR', 'PRA']).default('FBR') });
export type FbrSyncResult = { sent: number; accepted: number; failed: number };
/** Sending state of an authority for the FBR page: off (default), live, or the test simulator. */
export type FbrSendingState = { configured: boolean; sendingEnabled: boolean; simulated: boolean; connectionStatus: string; lastSyncAt: string | null; backlog: FbrBacklog };
export type FbrTestResult = { ok: boolean; latencyMs: number | null; message: string };
