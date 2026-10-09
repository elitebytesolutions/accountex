import { z } from 'zod';
import { optionalText } from '../treasury/common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const qty = z.coerce.number('Enter a quantity').min(0, 'Not negative').max(1_000_000_000);
const money = z.coerce.number('Enter an amount').min(0, 'Not negative').max(100_000_000_000);
const pct = z.coerce.number().min(0, 'Not negative').max(100, 'At most 100');
const rowVersion = z.coerce.number().int().min(0);
type Ref = { id: string; code: string; name: string };
type Who = { id: string; name: string } | null;
type DocRef = { id: string; docNo: string } | null;
type VoucherRef = { id: string; docNo: string; voucherType: string; status: string } | null;
type Item = { id: string; sku: string; name: string } | null;

// ---------------------------------------------------------------- options (returns, credit notes, receipts, recurring, POS)
export type ReceivablesOptions = {
  customers: { id: string; code: string; name: string; city: string | null; paymentTerms: string; branchId: string | null; priceListId: string | null; status: string }[];
  products: { id: string; sku: string; name: string; ctn: number; unit: string | null; price: number; avgCost: number; taxCodeId: string | null; gstRate: number; barcode?: string | null }[];
  warehouses: { id: string; code: string; name: string; branchId: string | null }[];
  branches: Ref[];
  taxCodes: { id: string; code: string; name: string; rate: number | null }[];
  cashAccounts: { id: string; code: string; name: string; branchId: string | null }[];
  bankAccounts: { id: string; title: string; last4: string | null }[];
  paymentTerms: { code: string; label: string }[];
  lookups: Record<
    'receiptMethods' | 'returnReasons' | 'dispositions' | 'creditNoteReasons' | 'tenders' | 'frequencies' | 'endModes',
    { code: string; label: string }[]
  >;
};

// ---------------------------------------------------------------- sales returns
export const RETURN_TYPES = ['AGAINST_INVOICE', 'WITHOUT_INVOICE'] as const;
export const SalesReturnLineSchema = z.object({
  invoiceLineId: optionalId,
  itemId: z.uuid('Choose a product'),
  batchId: optionalId,
  qty: qty.refine((n) => n > 0, 'Enter a quantity'),
  rate: money,
  discountPct: pct.default(0),
  taxCodeId: optionalId,
  taxRate: pct.default(0),
  reason: z.string().min(1, 'Choose a reason'),
  disposition: z.string().min(1, 'Choose what happens to the goods'),
});
export const SalesReturnInputSchema = z.object({
  returnType: z.enum(RETURN_TYPES).default('AGAINST_INVOICE'),
  docDate: z.iso.date('Enter the return date'),
  customerId: z.uuid('Choose a customer'),
  invoiceId: optionalId,
  branchId: optionalId,
  warehouseId: z.uuid('Choose the warehouse the goods come back to'),
  remarks: optionalText(1000),
  lines: z.array(SalesReturnLineSchema).min(1, 'Add at least one returned item').max(200),
}).refine((r) => r.returnType !== 'AGAINST_INVOICE' || !!r.invoiceId, { message: 'Choose the invoice', path: ['invoiceId'] });
export type SalesReturnInput = z.input<typeof SalesReturnInputSchema>;
export const SalesReturnUpdateSchema = z.intersection(SalesReturnInputSchema, z.object({ rowVersion }));

export type SalesReturnLine = {
  id: string; lineNo: number; invoiceLineId: string | null; item: Item; batchId: string | null; soldQty: number | null; qty: number; rate: number;
  discountPct: number; valueAmount: number; taxRate: number; taxAmount: number; totalAmount: number; reason: string; disposition: string; costAmount: number;
};
export type SalesReturn = {
  id: string; docNo: string; docDate: string; returnType: string; customer: Ref; invoice: DocRef; branch: Ref | null; warehouse: Ref;
  totalItems: number; totalQty: number; valueAmount: number; taxAmount: number; totalAmount: number; costAmount: number;
  /** DRAFT, POSTED, CANCELLED */
  status: string; creditNote: (DocRef & { status: string; treatment: string }) | null; journal: VoucherRef; postedAt: string | null; cancelledAt: string | null;
  remarks: string | null; createdBy: Who; createdAt: string; rowVersion: number; lines: SalesReturnLine[];
};
export type SalesReturnList = { items: Omit<SalesReturn, 'lines'>[]; total: number; counts: Record<string, number>; kpis: { returnedMtd: number; returnedMtdCount: number; draftCount: number } };

/** An invoice's lines with what is still returnable (invoiced − already returned on posted returns). */
export type ReturnableInvoice = {
  invoice: { id: string; docNo: string; docDate: string; customer: Ref; branch: Ref; warehouse: Ref | null; status: string; balanceAmount: number };
  lines: { invoiceLineId: string; item: NonNullable<Item>; batchId: string | null; rate: number; discountPct: number; taxCodeId: string | null; taxRate: number; soldQty: number; returnedQty: number; returnableQty: number }[];
};

// ---------------------------------------------------------------- credit notes
export const CN_TREATMENTS = ['APPLY_TO_INVOICE', 'KEEP_AS_CREDIT'] as const;
export const CreditNoteLineSchema = z.object({
  invoiceLineId: optionalId,
  itemId: optionalId,
  description: optionalText(300),
  qty: qty.default(0),
  rate: money,
  taxCodeId: optionalId,
  taxRate: pct.default(0),
  restock: z.boolean().default(false),
}).refine((l) => l.itemId || l.description, { message: 'Choose a product or enter a description', path: ['description'] })
  .refine((l) => !l.restock || (!!l.itemId && l.qty > 0), { message: 'Restocking needs a product and a quantity', path: ['qty'] });
export const CreditNoteInputSchema = z.object({
  docDate: z.iso.date('Enter the date'),
  customerId: z.uuid('Choose a customer'),
  invoiceId: optionalId,
  branchId: optionalId,
  reason: z.string().min(1, 'Choose a reason'),
  reasonNote: optionalText(500),
  treatment: z.enum(CN_TREATMENTS).default('APPLY_TO_INVOICE'),
  returnWarehouseId: optionalId,
  narration: optionalText(1000),
  lines: z.array(CreditNoteLineSchema).min(1, 'Add at least one line').max(200),
}).refine((c) => c.treatment !== 'APPLY_TO_INVOICE' || !!c.invoiceId, { message: 'Choose the invoice to apply it to', path: ['invoiceId'] })
  .refine((c) => !c.lines.some((l) => l.restock) || !!c.returnWarehouseId, { message: 'Choose the warehouse restocked goods return to', path: ['returnWarehouseId'] });
export type CreditNoteInput = z.input<typeof CreditNoteInputSchema>;
export const CreditNoteUpdateSchema = z.intersection(CreditNoteInputSchema, z.object({ rowVersion }));

export type CreditNoteLine = {
  id: string; lineNo: number; invoiceLineId: string | null; item: Item; description: string; qty: number; rate: number; valueAmount: number;
  taxRate: number; taxAmount: number; totalAmount: number; restock: boolean;
};
export type CreditNote = {
  id: string; docNo: string; docDate: string; customer: Ref; invoice: DocRef; branch: Ref | null; reason: string; reasonNote: string | null; treatment: string;
  returnWarehouse: Ref | null; valueAmount: number; taxAmount: number; totalAmount: number; appliedAmount: number; balanceAmount: number;
  /** DRAFT, OPEN (customer credit), APPLIED, CANCELLED */
  status: string; salesReturn: DocRef; journal: VoucherRef; postedAt: string | null; cancelledAt: string | null; cancelReason: string | null;
  narration: string | null; createdBy: Who; createdAt: string; rowVersion: number; lines: CreditNoteLine[];
};
export type CreditNoteList = { items: Omit<CreditNote, 'lines'>[]; total: number; counts: Record<string, number>; kpis: { issuedMtd: number; issuedMtdCount: number; openCredit: number } };

// ---------------------------------------------------------------- customer receipts
export const ReceiptAllocationSchema = z.object({ invoiceId: z.uuid(), amount: money.refine((n) => n > 0, 'Enter an amount') });
export const CustomerReceiptInputSchema = z.object({
  docDate: z.iso.date('Enter the receipt date'),
  customerId: z.uuid('Choose a customer'),
  branchId: optionalId,
  method: z.string().min(1, 'Choose how it was received'),
  bankAccountId: optionalId,
  cashAccountId: optionalId,
  /** Cheque number for a cheque, else the bank / wallet reference. */
  reference: optionalText(60),
  amountReceived: money.refine((n) => n > 0, 'Enter the amount received'),
  whtAmount: money.default(0),
  whtSection: optionalText(20),
  bankCharges: money.default(0),
  memo: optionalText(500),
  /** Allocate oldest invoices first (FIFO) when no allocations are given. */
  autoAllocate: z.boolean().default(false),
  allocations: z.array(ReceiptAllocationSchema).max(200).default([]),
}).refine((r) => r.method !== 'CASH' || !!r.cashAccountId, { message: 'Choose the cash account', path: ['cashAccountId'] })
  .refine((r) => !['IBFT', 'RAAST'].includes(r.method) || !!r.bankAccountId, { message: 'Choose the bank account', path: ['bankAccountId'] })
  .refine((r) => r.method !== 'CHEQUE' || /^\d{4,10}$/.test((r.reference ?? '').replace(/\D/g, '')), { message: 'Enter the cheque number (4 to 10 digits)', path: ['reference'] });
export type CustomerReceiptInput = z.input<typeof CustomerReceiptInputSchema>;
export const ReceiptAllocationsSchema = z.object({ rowVersion, allocations: z.array(ReceiptAllocationSchema).max(200) });
export const ReceiptVoidSchema = z.object({ rowVersion, reason: z.string().trim().min(3, 'Give a reason').max(500) });

export type CustomerReceipt = {
  id: string; docNo: string; docDate: string; customer: Ref; branch: Ref | null; method: string; bankAccount: { id: string; title: string } | null; cashAccount: Ref | null;
  reference: string | null; amountReceived: number; whtAmount: number; whtSection: string | null; bankCharges: number; settledAmount: number; allocatedAmount: number; unallocatedAmount: number;
  /** UNALLOCATED, PARTLY_ALLOCATED, ALLOCATED, BOUNCED, VOID */
  status: string; cheque: (DocRef & { status: string }) | null; journal: VoucherRef; posShiftId: string | null; memo: string | null;
  bouncedAt: string | null; bounceReason: string | null; voidedAt: string | null; voidReason: string | null; createdBy: Who; createdAt: string; rowVersion: number;
  allocations: { id: string; invoice: DocRef; creditNote: DocRef; amount: number; date: string; isAutoFifo: boolean }[];
};
export type CustomerReceiptList = {
  items: Omit<CustomerReceipt, 'allocations'>[]; total: number; counts: Record<string, number>;
  kpis: { receivedMtd: number; receivedMtdCount: number; unallocated: number; chequesInHand: number; chequesInHandCount: number };
};
/** A customer's open invoices (oldest first) and unused credit. */
export type CustomerOpenItems = {
  customer: Ref; invoices: { id: string; docNo: string; docDate: string; dueDate: string; netAmount: number; balanceAmount: number; daysOverdue: number }[];
  credits: { id: string; docNo: string; balanceAmount: number }[]; unallocatedReceipts: number; balance: number;
};

// ---------------------------------------------------------------- recurring invoices
export const RecurringLineSchema = z.object({
  itemId: optionalId,
  description: optionalText(300),
  qty: qty.refine((n) => n > 0, 'Enter a quantity'),
  rate: money,
  useCurrentPrice: z.boolean().default(true),
  taxCodeId: optionalId,
  taxRate: pct.default(0),
}).refine((l) => l.itemId || l.description, { message: 'Choose a product or enter a description', path: ['itemId'] });
export const RecurringInvoiceInputSchema = z.object({
  name: z.string().trim().min(2, 'Name it').max(120),
  customerId: z.uuid('Choose a customer'),
  branchId: z.uuid('Choose the branch'),
  warehouseId: optionalId,
  paymentTerms: z.string().min(1, 'Choose payment terms'),
  frequency: z.string().min(1, 'Choose how often'),
  everyDays: z.coerce.number().int().min(1).max(365).optional().nullable(),
  startDate: z.iso.date('Enter the first invoice date'),
  endMode: z.string().default('NEVER'),
  endDate: optionalDate,
  maxRuns: z.coerce.number().int().min(1).max(1000).optional().nullable(),
  /** Keep the invoices as drafts instead of posting them. */
  saveAsDraft: z.boolean().default(false),
  lines: z.array(RecurringLineSchema).min(1, 'Add at least one line').max(100),
}).refine((r) => r.frequency !== 'CUSTOM' || !!r.everyDays, { message: 'Enter every how many days', path: ['everyDays'] })
  .refine((r) => r.endMode !== 'ON_DATE' || !!r.endDate, { message: 'Enter the end date', path: ['endDate'] })
  .refine((r) => r.endMode !== 'AFTER_RUNS' || !!r.maxRuns, { message: 'Enter how many invoices', path: ['maxRuns'] });
export type RecurringInvoiceInput = z.input<typeof RecurringInvoiceInputSchema>;
export const RecurringInvoiceUpdateSchema = z.intersection(RecurringInvoiceInputSchema, z.object({ rowVersion }));

export type RecurringInvoice = {
  id: string; docNo: string; name: string; customer: Ref; branch: Ref | null; warehouse: Ref | null; paymentTerms: string; frequency: string; everyDays: number | null;
  startDate: string; nextRunDate: string | null; endMode: string; endDate: string | null; maxRuns: number | null; runsCount: number; amount: number; saveAsDraft: boolean;
  /** ACTIVE, PAUSED, ENDED */
  status: string; lastRunAt: string | null; lastInvoice: DocRef; createdBy: Who; createdAt: string; rowVersion: number;
  lines: { id: string; lineNo: number; item: Item; description: string; qty: number; rate: number; useCurrentPrice: boolean; taxRate: number; taxAmount: number; totalAmount: number }[];
  invoices: { id: string; docNo: string; docDate: string; netAmount: number; status: string }[];
};
export type RecurringInvoiceList = { items: Omit<RecurringInvoice, 'lines' | 'invoices'>[]; total: number; counts: Record<string, number>; kpis: { monthlyValue: number; dueThisWeek: number } };

// ---------------------------------------------------------------- POS
export const PosShiftOpenSchema = z.object({
  branchId: z.uuid('Choose the branch'),
  warehouseId: z.uuid('Choose the warehouse'),
  counterName: z.string().trim().min(1, 'Name the counter').max(40),
  cashAccountId: z.uuid('Choose the cash drawer account'),
  openingFloat: money.default(0),
});
export type PosShiftOpenInput = z.input<typeof PosShiftOpenSchema>;
export const PosShiftCloseSchema = z.object({
  rowVersion,
  denominations: z.array(z.object({ denomination: money.refine((n) => n > 0), noteCount: z.coerce.number().int().min(0).max(100000) })).max(30),
  remarks: optionalText(500),
});
export const PosSaleSchema = z.object({
  shiftId: z.uuid(),
  /** Resuming a held sale. */
  heldInvoiceId: optionalId,
  customerId: z.uuid('Choose the customer'),
  lines: z.array(z.object({ itemId: z.uuid(), qty: qty.refine((n) => n > 0, 'Enter a quantity'), rate: money, discountPct: pct.default(0) })).min(1, 'Add an item').max(200),
  payments: z.array(z.object({ tender: z.string().min(1), amount: money.refine((n) => n > 0), tenderedAmount: money.optional().nullable(), reference: optionalText(60) })).max(5).default([]),
  /** Park the bill (draft) instead of completing it. */
  hold: z.boolean().default(false),
});
export type PosSaleInput = z.input<typeof PosSaleSchema>;

export type PosShift = {
  id: string; zReportNo: string | null; branch: Ref; warehouse: Ref; counterName: string; cashier: Who; cashAccount: Ref | null; openedAt: string; closedAt: string | null;
  openingFloat: number; cashSales: number; cardSales: number; walletSales: number; creditSales: number; billsCount: number;
  expectedCash: number; countedCash: number | null; overShort: number | null; status: string; journal: VoucherRef; remarks: string | null; rowVersion: number;
  denominations: { denomination: number; noteCount: number; amount: number }[];
};
export type PosHeldSale = { id: string; docNo: string; customer: Ref; netAmount: number; createdAt: string; lines: { itemId: string; qty: number; rate: number; discountPct: number }[] };
export type PosSession = { shift: PosShift | null; held: PosHeldSale[]; walkInCustomerId: string | null };
export type PosSaleResult = { invoice: { id: string; docNo: string; netAmount: number; status: string }; change: number; shift: PosShift };
export type PosShiftReport = PosShift & {
  byTender: { tender: string; count: number; amount: number }[];
  bills: { id: string; docNo: string; customer: string; netAmount: number; status: string; postedAt: string | null }[];
};
export type PosShiftList = { items: Omit<PosShift, 'denominations'>[]; total: number };

// ---------------------------------------------------------------- reports
export type ArAgeingRow = {
  customer: Ref; branch: Ref | null; paymentTerms: string; current: number; d1to30: number; d31to60: number; d61to90: number; d90plus: number; total: number; openInvoices: number; maxDaysOverdue: number | null;
};
export type ArAgeing = { asOf: string; basis: 'DUE' | 'DOC'; rows: ArAgeingRow[]; totals: Omit<ArAgeingRow, 'customer' | 'branch' | 'paymentTerms' | 'maxDaysOverdue' | 'openInvoices'> & { openInvoices: number } };
export type CustomerStatement = {
  customer: Ref & { city: string | null; paymentTerms: string }; from: string; to: string; opening: number; closing: number;
  lines: { date: string; docType: string; docNo: string; description: string; debit: number; credit: number; balance: number; link: string | null }[];
};

export const ReceivablesQuerySchema = z.object({
  status: z.string().optional(),
  customer: z.uuid().optional(),
  method: z.string().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type ReceivablesQuery = z.infer<typeof ReceivablesQuerySchema>;
export const ReceivablesReasonSchema = z.object({ rowVersion, reason: z.string().trim().min(3, 'Give a reason').max(500) });
export const ReceivablesRowVersionSchema = z.object({ rowVersion });
export const AgeingQuerySchema = z.object({ asOf: z.iso.date().optional(), basis: z.enum(['DUE', 'DOC']).default('DUE') });
export const StatementQuerySchema = z.object({ customer: z.uuid('Choose a customer'), from: z.iso.date().optional(), to: z.iso.date().optional() });
