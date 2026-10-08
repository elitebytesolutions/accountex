import { z } from 'zod';
import { optDate, optId, optText, rowVersion } from './fields.ts';
import type { PlatformPayment } from './payment.ts';

/**
 * Phase 41: platform invoices (Platform.PlatformInvoices + PlatformInvoiceLines), the invoices Accountex issues to
 * companies. A new invoice is a DRAFT without a number; issuing it assigns FS-INV-YYYY-NNNNN and makes it immutable
 * (corrections are a void and a new invoice). Payments are allocated by the database (paidAmount, status).
 * Totals: gross = Σ lines, net = gross − discount, tax = round(net × rate %), total = net + tax.
 */
export const INVOICE_KINDS = ['SUBSCRIPTION', 'ADDON', 'PRORATION', 'OVERAGE', 'MANUAL'] as const;
export const INVOICE_LINE_KINDS = ['PLAN', 'ADDON', 'SEATS', 'PRORATION_CREDIT', 'PRORATION_CHARGE', 'OVERAGE', 'MANUAL'] as const;
/** List chips (template admin/invoices): Overdue = open with a balance past its due date. */
export const INVOICE_CHIPS = ['all', 'PAID', 'OPEN', 'OVERDUE', 'VOID', 'DRAFT'] as const;
export type InvoiceChip = (typeof INVOICE_CHIPS)[number];
/** Payment terms of generated invoices (issued on the period start, due 14 days later). */
export const INVOICE_TERMS_DAYS = 14;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The invoice totals from its lines, discount and tax rate (same rule the database checks when issuing). */
export function invoiceTotals(lines: { quantity: number; unitPrice: number }[], discount: number, taxRate: number) {
  const gross = round2(lines.reduce((s, l) => s + round2(l.quantity * l.unitPrice), 0));
  const net = round2(gross - discount);
  const tax = round2((net * taxRate) / 100);
  return { gross, discount: round2(discount), net, tax, total: round2(net + tax) };
}

export type PlatformInvoiceLine = {
  id: string; lineNo: number; lineKind: string; description: string; planId: string | null; addonId: string | null;
  quantity: number; unitPrice: number; amount: number; periodStart: string | null; periodEnd: string | null;
};

export type PlatformInvoice = {
  id: string; docNo: string | null; tenantId: string; tenantCode: string; tenantName: string; subscriptionId: string | null;
  invoiceKind: string; description: string; periodStart: string | null; periodEnd: string | null; issuedOn: string; dueOn: string;
  currencyCode: string; grossAmount: number; discountAmount: number; netAmount: number; taxAuthorityId: string | null; taxAuthorityCode: string | null;
  taxRate: number; taxAmount: number; totalAmount: number; paidAmount: number; balanceAmount: number; status: string;
  /** Open / partially paid with a balance past the due date. */
  overdue: boolean; daysOverdue: number; couponId: string | null; couponCode: string | null;
  voidedAt: string | null; voidReason: string | null; dunningStage: string | null; createdAt: string; rowVersion: number;
};

export type PlatformInvoiceDetail = PlatformInvoice & {
  lines: PlatformInvoiceLine[];
  payments: PlatformPayment[];
  dunningCaseId: string | null;
  taxAuthorityName: string | null;
  /** Bill-to facts for the print view. */
  tenant: { legalName: string; ntn: string | null; strn: string | null; address: string | null; city: string | null; province: string | null; email: string | null };
};

export type InvoiceKpis = {
  month: string; billed: number; billedTax: number; collected: number; collectionRatePct: number | null;
  openCount: number; openAmount: number; overdueCount: number; overdueAmount: number;
};
export type InvoiceList = {
  items: PlatformInvoice[]; total: number; kpis: InvoiceKpis; months: string[];
  counts: Record<InvoiceChip, number>;
};

export const InvoiceListQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM').optional(),
  status: z.enum(INVOICE_CHIPS).default('all'),
  search: z.string().trim().max(80).optional(),
  tenantId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type InvoiceListQuery = z.infer<typeof InvoiceListQuerySchema>;

export const InvoiceLineInputSchema = z.object({
  id: z.uuid().optional(),
  lineKind: z.enum(INVOICE_LINE_KINDS).default('MANUAL'),
  description: z.string().trim().min(2, 'Describe the line').max(200),
  quantity: z.coerce.number('Quantity').positive('More than 0').max(1_000_000),
  unitPrice: z.coerce.number('Price').min(-100_000_000).max(100_000_000),
  /** PRORATION_* lines: the date the change took effect; the server prorates the unit price over the invoice period. */
  prorateFrom: optDate.optional(),
}).refine((l) => (l.lineKind === 'PRORATION_CREDIT') === (l.unitPrice < 0) || l.unitPrice === 0, {
  path: ['unitPrice'], message: 'Only a proration credit is negative',
});
export type InvoiceLineInput = z.infer<typeof InvoiceLineInputSchema>;

const InvoiceFields = {
  invoiceKind: z.enum(INVOICE_KINDS).default('MANUAL'),
  description: z.string().trim().min(3, 'Describe the invoice').max(200),
  issuedOn: z.iso.date('Choose a date'),
  dueOn: z.iso.date('Choose a date'),
  periodStart: optDate.optional(),
  periodEnd: optDate.optional(),
  discountAmount: z.coerce.number('Not negative').min(0, 'Not negative').max(100_000_000).default(0),
  /** Blank = the company's provincial sales-tax rate on the issue date (Tax Master). */
  taxRate: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().min(0, '0 to 100').max(100, '0 to 100').nullable()).optional(),
  lines: z.array(InvoiceLineInputSchema).min(1, 'Add at least one line').max(50),
};
const dueAfterIssue = (x: { issuedOn?: string; dueOn?: string }) => !x.issuedOn || !x.dueOn || x.dueOn >= x.issuedOn;
export const InvoiceCreateSchema = z.object({ tenantId: z.uuid('Choose a company'), ...InvoiceFields })
  .refine(dueAfterIssue, { path: ['dueOn'], message: 'On or after the issue date' });
export type InvoiceCreate = z.infer<typeof InvoiceCreateSchema>;
export const InvoiceUpdateSchema = z.object({ rowVersion, ...InvoiceFields })
  .refine(dueAfterIssue, { path: ['dueOn'], message: 'On or after the issue date' });
export type InvoiceUpdate = z.infer<typeof InvoiceUpdateSchema>;

export const InvoiceActionSchema = z.object({ rowVersion });
export type InvoiceAction = z.infer<typeof InvoiceActionSchema>;
export const InvoiceVoidSchema = z.object({ rowVersion, reason: z.string().trim().min(3, 'Give the reason').max(300) });
export type InvoiceVoid = z.infer<typeof InvoiceVoidSchema>;

/** POST /api/admin/invoices/generate?period=YYYY-MM-DD: one company (tenantId) or every live paid subscription due. */
export const InvoiceGenerateQuerySchema = z.object({ period: z.iso.date('YYYY-MM-DD').optional() });
export const InvoiceGenerateSchema = z.object({
  tenantId: optId.optional(),
  couponCode: optText(24).optional(),
  /** Issue the generated drafts straight away (the daily job always does). */
  issue: z.boolean().default(false),
});
export type InvoiceGenerate = z.infer<typeof InvoiceGenerateSchema>;
export type InvoiceGenerateResult = { generated: number; issued: number; invoices: PlatformInvoice[]; skipped: { tenantName: string; reason: string }[] };
