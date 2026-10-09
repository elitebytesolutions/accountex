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
type VoucherRef = { id: string; docNo: string; voucherType: string; status: string } | null;
type DocRef = { id: string; docNo: string; status: string };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------- maths
/** Return line: gross = qty × rate, discount %, tax on the net. */
export function returnLineAmounts(l: { returnQty: number; rate: number; discountPct: number; taxRate: number }) {
  const grossAmount = r2(l.returnQty * l.rate);
  const discountAmount = r2((grossAmount * l.discountPct) / 100);
  const taxAmount = r2(((grossAmount - discountAmount) * l.taxRate) / 100);
  return { grossAmount, discountAmount, taxAmount, totalAmount: r2(grossAmount - discountAmount + taxAmount) };
}

/** Debit-note line: net = qty × rate, tax on the net. */
export function debitNoteLineAmounts(l: { returnQty: number; rate: number; taxRate: number }) {
  const netAmount = r2(l.returnQty * l.rate);
  const taxAmount = r2((netAmount * l.taxRate) / 100);
  return { netAmount, taxAmount, totalAmount: r2(netAmount + taxAmount) };
}

/** WHT withheld on a payment allocation (on the gross settled: cash paid + tax withheld). */
export function allocationWht(settle: number, whtRate: number) {
  const wht = r2((settle * whtRate) / 100);
  return { whtAmount: wht, amount: r2(settle - wht) };
}

/** Spreads an amount over open items oldest first. */
export function allocateOldestFirst<T extends { id: string; balance: number; dueDate: string }>(items: T[], amount: number) {
  let left = r2(amount);
  return [...items].sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0)).flatMap((i) => {
    if (left <= 0) return [];
    const take = Math.min(left, i.balance);
    left = r2(left - take);
    return take > 0 ? [{ id: i.id, amount: r2(take) }] : [];
  });
}

export const AGEING_BUCKETS = ['CURRENT', 'D1_30', 'D31_60', 'D61_90', 'D90_PLUS'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];
/** Ageing bucket of an item `days` past its due (or bill) date. */
export function ageingBucket(days: number): AgeingBucket {
  return days <= 0 ? 'CURRENT' : days <= 30 ? 'D1_30' : days <= 60 ? 'D31_60' : days <= 90 ? 'D61_90' : 'D90_PLUS';
}

// ---------------------------------------------------------------- open items
export type OpenBill = {
  id: string; docNo: string; vendorInvoiceNo: string; docDate: string; dueDate: string; vendor: Ref; branch: Ref; netPayableAmount: number; balanceAmount: number;
  daysOverdue: number; status: string; whtSection: string | null; whtRate: number; isDisputed: boolean;
};
export type OpenItems = {
  bills: OpenBill[];
  payments: { id: string; docNo: string; docDate: string; vendor: Ref; amount: number; unallocatedAmount: number }[];
  debitNotes: { id: string; docNo: string; docDate: string; vendor: Ref; bill: { id: string; docNo: string } | null; balanceAmount: number }[];
};

// ---------------------------------------------------------------- purchase returns
export const PurchaseReturnLineSchema = z.object({
  id: optionalId,
  billLineId: optionalId,
  itemId: z.uuid('Choose a product'),
  batchNo: optionalText(60),
  expiryDate: optionalDate,
  returnQty: z.coerce.number('Enter a quantity').positive('More than 0').max(1_000_000_000),
  bonusQty: qty.default(0),
  rate: money,
  discountPct: pct.default(0),
  taxCodeId: optionalId,
  taxRate: pct.default(0),
});
export const PurchaseReturnInputSchema = z.object({
  docDate: z.iso.date('Use a date'),
  vendorId: z.uuid('Choose a vendor'),
  branchId: z.uuid('Choose a branch'),
  warehouseId: z.uuid('Choose the warehouse the goods leave from'),
  billId: optionalId,
  supplierBillNo: optionalText(60),
  settlement: z.enum(['CREDIT', 'CASH_REFUND']).default('CREDIT'),
  cashAccountId: optionalId,
  reason: z.string().trim().min(1, 'Choose a reason').max(30),
  gatePassNo: optionalText(40),
  transporter: optionalText(80),
  debitNoteNarration: optionalText(300),
  remarks: optionalText(500),
  lines: z.array(PurchaseReturnLineSchema).min(1, 'Return at least one line').max(200),
}).superRefine((r, ctx) => {
  if (r.settlement === 'CASH_REFUND' && !r.cashAccountId) ctx.addIssue({ code: 'custom', path: ['cashAccountId'], message: 'Choose the cash account the refund goes into' });
});
export type PurchaseReturnInput = z.infer<typeof PurchaseReturnInputSchema>;
export const PurchaseReturnUpdateSchema = z.intersection(PurchaseReturnInputSchema, z.object({ rowVersion }));

/** A posted bill a return can reference (picker for users without bill:view). */
export type ReturnBill = { id: string; docNo: string; docDate: string; vendorInvoiceNo: string; netPayableAmount: number; balanceAmount: number; status: string; warehouse: Ref | null; branch: Ref };
/** A bill's lines with what can still be returned. */
export type ReturnableLine = {
  billLineId: string; item: { id: string; sku: string; name: string; trackExpiry: boolean }; purchasedQty: number; returnedQty: number; returnableQty: number;
  rate: number; discountPct: number; taxCode: Ref | null; taxRate: number; batchNo: string | null; expiryDate: string | null;
};
export type PurchaseReturn = {
  id: string; docNo: string; docDate: string; vendor: Ref; branch: Ref; warehouse: Ref; bill: { id: string; docNo: string; vendorInvoiceNo: string } | null; supplierBillNo: string | null;
  settlement: string; cashAccount: Ref | null; reason: string; gatePassNo: string | null; transporter: string | null; debitNoteNarration: string | null;
  grossAmount: number; discountAmount: number; taxAmount: number; totalAmount: number; status: string; postedAt: string | null; voucher: VoucherRef;
  cancelledAt: string | null; cancelReason: string | null; remarks: string | null; debitNote: DocRef | null; createdBy: Who; createdAt: string; rowVersion: number;
  lines: {
    id: string; lineNo: number; billLineId: string | null; item: { id: string; sku: string; name: string; trackExpiry: boolean }; batchNo: string | null; expiryDate: string | null;
    purchasedQty: number | null; returnQty: number; bonusQty: number; rate: number; discountPct: number; grossAmount: number; discountAmount: number; taxCode: Ref | null;
    taxRate: number; taxAmount: number; totalAmount: number;
  }[];
};
export type PurchaseReturnList = {
  items: Omit<PurchaseReturn, 'lines'>[]; total: number; counts: Record<string, number>;
  kpis: { thisMonth: number; thisMonthAmount: number; creditAmount: number; cashRefundAmount: number; drafts: number };
};

// ---------------------------------------------------------------- debit notes
export const DebitNoteLineSchema = z.object({
  id: optionalId,
  billLineId: optionalId,
  itemId: optionalId,
  description: optionalText(300),
  billedQty: z.coerce.number().min(0).optional().nullable().transform((v) => v ?? null),
  returnQty: qty.default(1),
  rate: money,
  taxCodeId: optionalId,
  taxRate: pct.default(0),
}).refine((l) => l.itemId || l.billLineId || l.description, { message: 'Pick the bill line or describe the claim', path: ['description'] });
export const DebitNoteInputSchema = z.object({
  docDate: z.iso.date('Use a date'),
  billId: z.uuid('Choose the bill'),
  reason: z.enum(['PRICE_VARIANCE', 'SHORT_SUPPLY', 'QUALITY_REJECTION', 'PURCHASE_RETURN']),
  reasonNote: optionalText(300),
  warehouseId: optionalId,
  settlement: z.enum(['ADJUST_AGAINST_BILL', 'REQUEST_REFUND']).default('ADJUST_AGAINST_BILL'),
  whtAmount: money.default(0),
  remarks: optionalText(500),
  lines: z.array(DebitNoteLineSchema).min(1, 'Add at least one line').max(200),
});
export type DebitNoteInput = z.infer<typeof DebitNoteInputSchema>;
export const DebitNoteUpdateSchema = z.intersection(DebitNoteInputSchema, z.object({ rowVersion }));
export const DebitNoteRefundSchema = z.object({
  rowVersion, date: z.iso.date('Use a date'), amount: z.coerce.number().positive('More than 0'),
  cashAccountId: optionalId, bankAccountId: optionalId,
}).refine((r) => !!r.cashAccountId !== !!r.bankAccountId, { message: 'Choose the bank or the cash account the refund came into', path: ['bankAccountId'] });
export const DebitNoteApplySchema = z.object({ rowVersion, billId: z.uuid('Choose the bill'), amount: z.coerce.number().positive('More than 0') });

export type DebitNote = {
  id: string; docNo: string; docDate: string; vendor: Ref; branch: Ref; bill: { id: string; docNo: string; vendorInvoiceNo: string; balanceAmount: number } | null;
  reason: string; reasonNote: string | null; warehouse: Ref | null; settlement: string; netAmount: number; taxAmount: number; totalAmount: number; whtAmount: number;
  creditAmount: number; appliedAmount: number; refundedAmount: number; balanceAmount: number; status: string; postedAt: string | null; voucher: VoucherRef;
  voidedAt: string | null; voidReason: string | null; remarks: string | null; purchaseReturn: DocRef | null; createdBy: Who; createdAt: string; rowVersion: number;
  lines: { id: string; lineNo: number; billLineId: string | null; item: { id: string; sku: string; name: string } | null; description: string | null; billedQty: number | null; returnQty: number; rate: number; netAmount: number; taxCode: Ref | null; taxRate: number; taxAmount: number; totalAmount: number }[];
  applications: { id: string; bill: { id: string; docNo: string }; date: string; amount: number; isReversed: boolean }[];
};
export type DebitNoteList = { items: Omit<DebitNote, 'lines' | 'applications'>[]; total: number; counts: Record<string, number>; kpis: { openAmount: number; appliedThisMonth: number; refundDue: number; drafts: number } };

// ---------------------------------------------------------------- vendor payments
export const PAYMENT_METHODS = ['IBFT', 'CHEQUE', 'PAY_ORDER', 'CASH', 'ONLINE'] as const;
export const PaymentAllocationInput = z.object({
  billId: z.uuid(),
  amount: z.coerce.number().positive('More than 0'),
  whtAmount: money.default(0),
});
const PaymentFields = {
  docDate: z.iso.date('Use a date'),
  vendorId: z.uuid('Choose a vendor'),
  branchId: z.uuid('Choose a branch'),
  method: z.enum(PAYMENT_METHODS),
  bankAccountId: optionalId,
  cashAccountId: optionalId,
  chequeNo: optionalText(20),
  chequeBookId: optionalId,
  isCrossed: z.boolean().default(true),
  amount: z.coerce.number('Enter the amount').positive('More than 0').max(100_000_000_000),
  whtTreatment: z.enum(['ALREADY_WITHHELD', 'WITHHOLD_NOW']).default('ALREADY_WITHHELD'),
  whtSection: optionalText(20),
  whtRate: pct.default(0),
  bankChargesAmount: money.default(0),
  remarks: optionalText(300),
  allocations: z.array(PaymentAllocationInput).max(200).default([]),
};
const paymentRules = (p: { method: string; bankAccountId: string | null; cashAccountId: string | null; chequeNo: string | null; amount: number; allocations: { amount: number }[]; whtTreatment: string; whtRate: number; whtSection: string | null }, ctx: z.RefinementCtx) => {
  const err = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (p.method === 'CASH' && !p.cashAccountId) err('cashAccountId', 'Choose the cash account');
  if (p.method !== 'CASH' && !p.bankAccountId) err('bankAccountId', 'Choose the bank account');
  if (p.method === 'CHEQUE' && !/^\d{4,10}$/.test(p.chequeNo ?? '')) err('chequeNo', 'Cheque no.: 4 to 10 digits');
  const alloc = r2(p.allocations.reduce((s, a) => s + a.amount, 0));
  if (alloc > p.amount + 0.001) err('allocations', 'Allocated more than the amount paid');
  if (p.whtTreatment === 'WITHHOLD_NOW' && p.whtRate > 0 && !p.whtSection) err('whtSection', 'Choose the WHT section');
};
export const VendorPaymentInputSchema = z.object(PaymentFields).superRefine(paymentRules);
export type VendorPaymentInput = z.infer<typeof VendorPaymentInputSchema>;
export const VendorPaymentUpdateSchema = z.object({ ...PaymentFields, rowVersion }).superRefine(paymentRules);
export const PaymentAllocateSchema = z.object({ rowVersion, allocations: z.array(z.object({ billId: z.uuid(), amount: z.coerce.number().positive('More than 0') })).min(1).max(200) });

/** The payment run: bills of any vendors paid from one account; one payment per vendor. */
export const PaymentRunSchema = z.object({
  docDate: z.iso.date('Use a date'),
  branchId: z.uuid('Choose a branch'),
  method: z.enum(PAYMENT_METHODS),
  bankAccountId: optionalId,
  cashAccountId: optionalId,
  whtTreatment: z.enum(['ALREADY_WITHHELD', 'WITHHOLD_NOW']).default('WITHHOLD_NOW'),
  remarks: optionalText(300),
  /** Cheque no. per vendor (CHEQUE). */
  cheques: z.record(z.string(), z.string().trim().regex(/^\d{4,10}$/, 'Cheque no.: 4 to 10 digits')).default({}),
  bills: z.array(z.object({ billId: z.uuid(), amount: z.coerce.number().positive('More than 0'), whtSection: optionalText(20), whtRate: pct.default(0) })).min(1, 'Select bills to pay').max(500),
}).superRefine((p, ctx) => {
  if (p.method === 'CASH' && !p.cashAccountId) ctx.addIssue({ code: 'custom', path: ['cashAccountId'], message: 'Choose the cash account' });
  if (p.method !== 'CASH' && !p.bankAccountId) ctx.addIssue({ code: 'custom', path: ['bankAccountId'], message: 'Choose the bank account' });
});
export type PaymentRunInput = z.infer<typeof PaymentRunSchema>;
export type PaymentRunResult = { payments: { id: string; docNo: string; vendor: Ref; amount: number; whtAmount: number; status: string; chequeNo: string | null }[]; failed: { vendor: Ref; message: string }[] };

export type VendorPayment = {
  id: string; docNo: string; docDate: string; vendor: Ref; branch: Ref; method: string; bankAccount: { id: string; title: string } | null; cashAccount: Ref | null;
  chequeNo: string | null; cheque: DocRef | null; isCrossed: boolean; currencyCode: string; amount: number; whtTreatment: string; whtSection: string | null; whtRate: number;
  whtAmount: number; bankChargesAmount: number; allocatedAmount: number; unallocatedAmount: number; paymentRunRef: string | null; status: string; approvedBy: Who;
  approvedAt: string | null; postedAt: string | null; clearedOn: string | null; voucher: VoucherRef; voidedAt: string | null; voidReason: string | null; remarks: string | null;
  createdBy: Who; createdAt: string; rowVersion: number;
  allocations: { id: string; bill: { id: string; docNo: string; vendorInvoiceNo: string }; date: string; amount: number; whtAmount: number; isReversed: boolean }[];
  approval?: unknown; routing?: unknown; approvalId?: string | null; canAct?: boolean;
};
export type VendorPaymentList = {
  items: Omit<VendorPayment, 'allocations'>[]; total: number; counts: Record<string, number>;
  kpis: { paidThisMonth: number; whtThisMonth: number; pendingApproval: number; unpresentedCheques: number; onAccount: number };
};

// ---------------------------------------------------------------- reports
export const ApAgeingQuerySchema = z.object({
  asOf: z.iso.date().optional(), basis: z.enum(['DUE', 'BILL']).default('DUE'), branch: z.uuid().optional(), vendor: z.uuid().optional(), includeZero: z.coerce.boolean().default(false),
});
export type ApAgeing = {
  asOf: string; basis: string;
  rows: { vendor: Ref & { city: string | null; creditDays: number }; branch: Ref | null; buckets: Record<AgeingBucket, number>; total: number; bills: number; oldestDays: number; disputed: number }[];
  totals: Record<AgeingBucket, number> & { total: number };
};
export const VendorStatementQuerySchema = z.object({ vendor: z.uuid('Choose a vendor'), from: z.iso.date(), to: z.iso.date() });
export type VendorStatement = {
  vendor: Ref & { ntn: string | null; city: string | null }; from: string; to: string; openingBalance: number; closingBalance: number;
  totals: { billed: number; paid: number; debitNotes: number; returns: number; wht: number };
  rows: { date: string; docType: 'BILL' | 'PAY' | 'DN' | 'PR' | 'PV'; docNo: string; docId: string; reference: string | null; description: string; debit: number; credit: number; balance: number }[];
};
