import { z } from 'zod';
import { optionalText } from '../treasury/common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const qty = z.coerce.number('Enter a quantity').min(0, 'Not negative').max(1_000_000_000);
const money = z.coerce.number('Enter an amount').min(0, 'Not negative').max(100_000_000_000);
const pct = z.coerce.number().min(0, 'Not negative').max(100, 'At most 100');
type Ref = { id: string; code: string; name: string };
type Who = { id: string; name: string } | null;
type VoucherRef = { id: string; docNo: string; voucherType: string; status: string } | null;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;

// ---------------------------------------------------------------- line maths (same rounding as the DB checks)
/** Cartons × units per carton + loose; service lines (no carton factor) use the quantity as entered. */
export function baseQtyOf(qtyCtn: number, qtyLoose: number, ctn: number | null) {
  return r4(qtyCtn * (ctn && ctn > 0 ? ctn : 1) + qtyLoose);
}

/** gross = qty × rate, discount = gross × %, net, tax = net × rate %, total; WHT on the line total. */
export function lineAmounts(l: { baseQty: number; rate: number; discountPct: number; taxRate: number; whtRate?: number }) {
  const grossAmount = r2(l.baseQty * l.rate);
  const discountAmount = r2((grossAmount * l.discountPct) / 100);
  const netAmount = r2(grossAmount - discountAmount);
  const taxAmount = r2((netAmount * l.taxRate) / 100);
  const totalAmount = r2(netAmount + taxAmount);
  const whtAmount = r2((totalAmount * (l.whtRate ?? 0)) / 100);
  return { grossAmount, discountAmount, netAmount, taxAmount, totalAmount, whtAmount };
}

/** Header totals from the lines; bills add advance tax (236G) and take off WHT. */
export function docTotals(lines: ReturnType<typeof lineAmounts>[], advanceTaxAmount = 0) {
  const sum = (k: keyof ReturnType<typeof lineAmounts>) => r2(lines.reduce((s, l) => s + l[k], 0));
  const grossAmount = sum('grossAmount');
  const discountAmount = sum('discountAmount');
  const netAmount = r2(grossAmount - discountAmount);
  const taxAmount = sum('taxAmount');
  const whtAmount = sum('whtAmount');
  const totalAmount = r2(netAmount + taxAmount + advanceTaxAmount);
  return { grossAmount, discountAmount, netAmount, taxAmount, advanceTaxAmount: r2(advanceTaxAmount), totalAmount, whtAmount, netPayableAmount: r2(totalAmount - whtAmount) };
}

/**
 * Three-way match of a bill against its PO (rates) and GRN (quantities): PRICE_VARIANCE beats QTY_VARIANCE; the
 * variance % is the bill's net against the PO value of the billed quantities.
 */
export function threeWayMatch(lines: { qty: number; rate: number; poRate: number | null; receivedQty: number | null }[], hasPo: boolean) {
  if (!hasPo) return { matchStatus: 'NO_PO' as const, matchVariancePct: null };
  let price = false;
  let quantity = false;
  let billed = 0;
  let expected = 0;
  for (const l of lines) {
    if (l.poRate !== null && Math.abs(l.rate - l.poRate) > 0.0001) price = true;
    if (l.receivedQty !== null && Math.abs(l.qty - l.receivedQty) > 0.0001) quantity = true;
    billed += l.qty * l.rate;
    expected += l.qty * (l.poRate ?? l.rate);
  }
  const matchVariancePct = expected > 0 ? Math.round(((billed - expected) / expected) * 10_000) / 100 : 0;
  return { matchStatus: price ? ('PRICE_VARIANCE' as const) : quantity ? ('QTY_VARIANCE' as const) : ('MATCHED' as const), matchVariancePct };
}

/** Spreads the capitalised charges over the items by value / qty / weight; the last line takes the rounding. */
export function allocateLandedCost(items: { fobAmount: number; qty: number; weightKg: number }[], basis: 'VALUE' | 'QTY' | 'WEIGHT', capitalised: number) {
  const weightOf = (i: { fobAmount: number; qty: number; weightKg: number }) => (basis === 'VALUE' ? i.fobAmount : basis === 'QTY' ? i.qty : i.weightKg);
  const total = items.reduce((s, i) => s + weightOf(i), 0);
  let left = r2(capitalised);
  return items.map((i, n) => {
    const share = total > 0 ? weightOf(i) / total : 0;
    const allocatedAmount = n === items.length - 1 ? left : r2(capitalised * share);
    left = r2(left - allocatedAmount);
    return { sharePct: r4(share * 100), allocatedAmount };
  });
}

/** Due date: document date + the vendor's credit days. */
export function dueDateFor(docDate: string, creditDays: number) {
  const d = new Date(`${docDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + creditDays);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- options
export type PurchaseOptions = {
  vendors: { id: string; code: string; name: string; paymentTerms: string; creditDays: number; whtSection: string; atlStatus: string; payableAccountId: string | null; defaultAccountId: string | null; currencyCode: string; ntn: string | null }[];
  products: { id: string; sku: string; name: string; upc: string | null; ctn: number; unit: string | null; trackExpiry: boolean; cost: number; avgCost: number; price: number; taxCodeId: string | null; gstRate: number; weightKg: number | null }[];
  warehouses: { id: string; code: string; name: string; branchId: string | null; type: string }[];
  taxCodes: { id: string; code: string; name: string; taxType: string; whtSection: string | null; rate: number | null; nonAtlRate: number | null }[];
  branches: Ref[];
  costCentres: Ref[];
  departments: Ref[];
  projects: Ref[];
  accounts: (Ref & { accountClass: number })[];
  bankAccounts: { id: string; title: string; last4: string | null; branchId: string }[];
  cashAccounts: { id: string; code: string; name: string; branchId: string }[];
  users: { id: string; name: string }[];
  rejectReasons: { code: string; label: string }[];
  chargeTypes: { code: string; label: string }[];
  whtSections: { code: string; label: string }[];
  paymentTerms: { code: string; label: string }[];
};

/** A product's context for the purchase voucher's "More information" panel. */
export type ItemInsight = {
  item: { id: string; sku: string; name: string; price: number; avgCost: number };
  /** Stock by warehouse (on hand, reserved by open orders, available). */
  stock: { warehouse: { id: string; code: string; name: string }; onHand: number; reserved: number; available: number }[];
  onHand: number;
  /** Sale price changes, newest first. */
  priceLog: { at: string; oldValue: number | null; newValue: number; source: string }[];
  /** Posted purchases of the product, newest first. */
  lastPurchases: { date: string; docNo: string; billId: string; vendor: string; qty: number; rate: number }[];
};

// ---------------------------------------------------------------- purchase orders
export const PO_STATUSES = ['DRAFT', 'PENDING_L1', 'PENDING_L2', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'BILLED', 'CANCELLED'] as const;

export const PoLineSchema = z.object({
  id: optionalId,
  itemId: optionalId,
  description: optionalText(300),
  accountId: optionalId,
  qtyCtn: qty.default(0),
  qtyLoose: qty.default(0),
  bonusQty: qty.default(0),
  rate: money,
  discountPct: pct.default(0),
  taxCodeId: optionalId,
  taxRate: pct.default(0),
  costCentreId: optionalId,
  remarks: optionalText(300),
}).refine((l) => l.itemId || l.description, { message: 'Choose a product or describe the service', path: ['itemId'] })
  .refine((l) => l.qtyCtn + l.qtyLoose > 0, { message: 'Enter a quantity', path: ['qtyLoose'] });

export const PoInputSchema = z.object({
  docDate: z.iso.date('Use a date'),
  vendorId: z.uuid('Choose a vendor'),
  branchId: z.uuid('Choose a branch'),
  warehouseId: optionalId,
  expectedDate: optionalDate,
  paymentTerms: z.string().trim().min(1).max(20).default('NET_30'),
  creditDays: z.coerce.number().int().min(0).max(365).default(30),
  costCentreId: optionalId,
  departmentId: optionalId,
  projectId: optionalId,
  buyerUserId: optionalId,
  remarks: optionalText(500),
  lines: z.array(PoLineSchema).min(1, 'Add at least one line').max(200),
}).refine((p) => !p.expectedDate || p.expectedDate >= p.docDate, { message: 'On or after the order date', path: ['expectedDate'] });
export type PoInput = z.infer<typeof PoInputSchema>;
export const PoUpdateSchema = z.intersection(PoInputSchema, z.object({ rowVersion: z.coerce.number().int().min(0) }));

export type PoLine = {
  id: string; lineNo: number; item: { id: string; sku: string; name: string; ctn: number; trackExpiry: boolean } | null; description: string | null; account: Ref | null;
  qtyCtn: number; qtyLoose: number; baseQty: number; bonusQty: number; rate: number; discountPct: number; grossAmount: number; discountAmount: number; netAmount: number;
  taxCode: Ref | null; taxRate: number; taxAmount: number; totalAmount: number; receivedQty: number; billedQty: number; openQty: number; costCentre: Ref | null; remarks: string | null;
};
export type PurchaseOrder = {
  id: string; docNo: string; docDate: string; vendor: Ref; branch: Ref; warehouse: Ref | null; expectedDate: string | null; paymentTerms: string; creditDays: number;
  costCentre: Ref | null; department: Ref | null; project: Ref | null; buyer: Who; currencyCode: string; grossAmount: number; discountAmount: number; netAmount: number;
  taxAmount: number; totalAmount: number; status: string; submittedAt: string | null; approvedBy: Who; approvedAt: string | null; cancelledAt: string | null; cancelReason: string | null;
  remarks: string | null; createdBy: Who; createdAt: string; rowVersion: number; receivedPct: number; billedPct: number;
  lines: PoLine[];
  grns: { id: string; docNo: string; docDate: string; status: string }[];
  approval?: unknown; routing?: unknown; approvalId?: string | null; canAct?: boolean;
};
export type PurchaseOrderList = {
  items: Omit<PurchaseOrder, 'lines' | 'grns'>[]; total: number; counts: Record<string, number>;
  kpis: { open: number; openAmount: number; pending: number; pendingAmount: number; awaitingReceipt: number; thisMonthAmount: number };
};

// ---------------------------------------------------------------- goods received notes
export const GrnLineSchema = z.object({
  id: optionalId,
  purchaseOrderLineId: optionalId,
  itemId: z.uuid('Choose a product'),
  orderedQty: qty.default(0),
  prevReceivedQty: qty.default(0),
  acceptedQty: qty,
  rejectedQty: qty.default(0),
  rejectReason: optionalText(30),
  batchNo: optionalText(60),
  expiryDate: optionalDate,
  unitCost: money,
}).refine((l) => l.rejectedQty === 0 || !!l.rejectReason, { message: 'Choose why it was rejected', path: ['rejectReason'] })
  .refine((l) => l.acceptedQty + l.rejectedQty > 0, { message: 'Enter the quantity received', path: ['acceptedQty'] });

export const GrnInputSchema = z.object({
  docDate: z.iso.date('Use a date'),
  purchaseOrderId: optionalId,
  vendorId: z.uuid('Choose a vendor'),
  branchId: optionalId,
  warehouseId: z.uuid('Choose the receiving warehouse'),
  vendorRef: optionalText(60),
  qcNote: optionalText(500),
  isImport: z.boolean().default(false),
  remarks: optionalText(500),
  lines: z.array(GrnLineSchema).min(1, 'Receive at least one line').max(200),
});
export type GrnInput = z.infer<typeof GrnInputSchema>;
export const GrnUpdateSchema = z.intersection(GrnInputSchema, z.object({ rowVersion: z.coerce.number().int().min(0) }));

export type GrnLine = {
  id: string; lineNo: number; purchaseOrderLineId: string | null; item: { id: string; sku: string; name: string; trackExpiry: boolean }; orderedQty: number; prevReceivedQty: number;
  receivedQty: number; acceptedQty: number; rejectedQty: number; rejectReason: string | null; batchNo: string | null; expiryDate: string | null; unitCost: number;
  acceptedAmount: number; rejectedAmount: number; billedQty: number;
};
export type Grn = {
  id: string; docNo: string; docDate: string; purchaseOrder: { id: string; docNo: string } | null; vendor: Ref; branch: Ref; warehouse: Ref; vendorRef: string | null;
  qcStatus: string; qcNote: string | null; matchStatus: string; billStatus: string; receivedQty: number; acceptedAmount: number; rejectedAmount: number; isImport: boolean;
  status: string; postedAt: string | null; voucher: VoucherRef; cancelledAt: string | null; cancelReason: string | null; remarks: string | null; createdBy: Who; createdAt: string;
  rowVersion: number; lines: GrnLine[]; bills: { id: string; docNo: string; status: string }[];
};
export type GrnList = { items: Omit<Grn, 'lines' | 'bills'>[]; total: number; counts: Record<string, number>; kpis: { drafts: number; postedThisMonth: number; valueThisMonth: number; awaitingBill: number; awaitingBillAmount: number } };

// ---------------------------------------------------------------- vendor bills and the purchase voucher (COUNTER)
export const BILL_PAY_MODES = ['CREDIT', 'CASH', 'BANK', 'CHEQUE'] as const;

export const BillLineSchema = z.object({
  id: optionalId,
  itemId: optionalId,
  description: optionalText(300),
  accountId: optionalId,
  purchaseOrderLineId: optionalId,
  grnLineId: optionalId,
  upc: optionalText(40),
  qtyCtn: qty.default(0),
  qtyLoose: qty.default(0),
  bonusQty: qty.default(0),
  breakageQty: qty.default(0),
  rate: money,
  salePrice: z.coerce.number().min(0).optional().nullable().transform((v) => v ?? null),
  updateItemSalePrice: z.boolean().default(false),
  discountPct: pct.default(0),
  taxCodeId: optionalId,
  taxRate: pct.default(0),
  whtSection: optionalText(20),
  whtRate: pct.default(0),
  batchNo: optionalText(60),
  expiryDate: optionalDate,
  costCentreId: optionalId,
  projectId: optionalId,
}).refine((l) => l.itemId || (l.description && l.accountId), { message: 'Choose a product, or describe the line and pick its account', path: ['itemId'] })
  .refine((l) => l.qtyCtn + l.qtyLoose + l.bonusQty > 0, { message: 'Enter a quantity', path: ['qtyLoose'] })
  .refine((l) => l.whtRate === 0 || !!l.whtSection, { message: 'Choose the WHT section', path: ['whtSection'] });

export const BillInputSchema = z.object({
  channel: z.enum(['STANDARD', 'COUNTER']).default('STANDARD'),
  docDate: z.iso.date('Use a date'),
  dueDate: optionalDate,
  vendorId: z.uuid('Choose a vendor'),
  branchId: z.uuid('Choose a branch'),
  warehouseId: optionalId,
  purchaseOrderId: optionalId,
  grnId: optionalId,
  vendorInvoiceNo: z.string().trim().min(1, 'Enter the vendor’s invoice no.').max(60),
  payableAccountId: optionalId,
  purchaserUserId: optionalId,
  costCentreId: optionalId,
  projectId: optionalId,
  dealOnSupply: optionalText(200),
  retailPriceDiscountPct: pct.default(0),
  advanceTaxAmount: money.default(0),
  payMode: z.enum(BILL_PAY_MODES).default('CREDIT'),
  cashAccountId: optionalId,
  bankAccountId: optionalId,
  chequeNo: optionalText(20),
  paidNowAmount: money.default(0),
  isDisputed: z.boolean().default(false),
  disputeNote: optionalText(500),
  remarks: optionalText(500),
  lines: z.array(BillLineSchema).min(1, 'Add at least one line').max(300),
}).superRefine((b, ctx) => {
  const err = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (b.dueDate && b.dueDate < b.docDate) err('dueDate', 'On or after the bill date');
  if (b.isDisputed && !b.disputeNote) err('disputeNote', 'Say what is disputed');
  if (b.channel === 'STANDARD' && b.payMode !== 'CREDIT') err('payMode', 'A standard bill is on credit; pay it from Payables');
  if (b.payMode === 'CREDIT' && b.paidNowAmount > 0) err('paidNowAmount', 'Nothing is paid now on credit');
  if (b.payMode !== 'CREDIT' && !(b.paidNowAmount > 0)) err('paidNowAmount', 'Enter the amount paid now');
  if (b.payMode === 'CASH' && !b.cashAccountId) err('cashAccountId', 'Choose the cash account');
  if ((b.payMode === 'BANK' || b.payMode === 'CHEQUE') && !b.bankAccountId) err('bankAccountId', 'Choose the bank account');
  if (b.payMode === 'CHEQUE' && !/^\d{4,10}$/.test(b.chequeNo ?? '')) err('chequeNo', 'Cheque no.: 4 to 10 digits');
});
export type BillInput = z.infer<typeof BillInputSchema>;
export const BillUpdateSchema = z.intersection(BillInputSchema, z.object({ rowVersion: z.coerce.number().int().min(0) }));

export type BillLine = {
  id: string; lineNo: number; item: { id: string; sku: string; name: string; ctn: number; trackExpiry: boolean } | null; description: string | null; account: Ref | null;
  purchaseOrderLineId: string | null; grnLineId: string | null; upc: string | null; qtyCtn: number; qtyLoose: number; baseQty: number; bonusQty: number; breakageQty: number;
  totalQty: number; rate: number; salePrice: number | null; updateItemSalePrice: boolean; discountPct: number; grossAmount: number; discountAmount: number; netAmount: number;
  taxCode: Ref | null; taxRate: number; taxAmount: number; totalAmount: number; whtSection: string | null; whtRate: number; whtAmount: number; netUnitCost: number | null;
  batchNo: string | null; expiryDate: string | null; costCentre: Ref | null; project: Ref | null; poRate: number | null; receivedQty: number | null;
};
export type VendorBill = {
  id: string; channel: string; docNo: string; docDate: string; dueDate: string; vendor: Ref; branch: Ref; warehouse: Ref | null; purchaseOrder: { id: string; docNo: string } | null;
  grn: { id: string; docNo: string } | null; vendorInvoiceNo: string; payableAccount: Ref | null; currencyCode: string; purchaser: Who; costCentre: Ref | null; project: Ref | null;
  dealOnSupply: string | null; retailPriceDiscountPct: number; captureMethod: string; grossAmount: number; discountAmount: number; netAmount: number; taxAmount: number;
  advanceTaxAmount: number; totalAmount: number; whtAmount: number; netPayableAmount: number; payMode: string; bankAccount: { id: string; title: string } | null;
  cashAccount: Ref | null; chequeNo: string | null; cheque: { id: string; docNo: string; status: string } | null; paidNowAmount: number; balanceAmount: number;
  matchStatus: string; matchVariancePct: number | null; isDisputed: boolean; disputeNote: string | null; status: string; submittedAt: string | null; approvedBy: Who;
  approvedAt: string | null; postedAt: string | null; voucher: VoucherRef; voidedAt: string | null; voidReason: string | null; remarks: string | null; createdBy: Who;
  createdAt: string; rowVersion: number; overdueDays: number; lines: BillLine[];
  approval?: unknown; routing?: unknown; approvalId?: string | null; canAct?: boolean;
};
export type VendorBillList = {
  items: Omit<VendorBill, 'lines'>[]; total: number; counts: Record<string, number>; matchCounts: Record<string, number>;
  kpis: { outstanding: number; overdue: number; overdueCount: number; dueThisWeek: number; pendingApproval: number; disputed: number };
};

// ---------------------------------------------------------------- landed cost
export const LcItemSchema = z.object({
  id: optionalId,
  grnLineId: optionalId,
  itemId: z.uuid('Choose a product'),
  qty: z.coerce.number().positive('More than 0'),
  weightKg: qty.default(0),
  fobUnitFcy: money,
});
export const LcChargeSchema = z.object({
  id: optionalId,
  chargeType: z.string().trim().min(1, 'Choose the charge').max(40),
  description: z.string().trim().min(1, 'Describe the charge').max(200),
  payeeVendorId: optionalId,
  payeeName: z.string().trim().min(1, 'Who is paid').max(160),
  ratePct: z.coerce.number().min(0).max(100).optional().nullable().transform((v) => v ?? null),
  amount: money,
  isCapitalised: z.boolean().default(true),
  isClaimable: z.boolean().default(false),
  claimAccountId: optionalId,
});
export const LcInputSchema = z.object({
  docDate: z.iso.date('Use a date'),
  vendorId: z.uuid('Choose the supplier'),
  branchId: z.uuid('Choose a branch'),
  grnId: optionalId,
  originCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Two-letter country code'),
  portOfLoading: optionalText(80),
  portOfDischarge: optionalText(80),
  shipmentMode: z.enum(['SEA_FCL', 'SEA_LCL', 'AIR', 'ROAD']),
  containerInfo: optionalText(120),
  billOfLadingNo: optionalText(60),
  gdNo: optionalText(60),
  lcRef: optionalText(60),
  bankAccountId: optionalId,
  currencyCode: z.string().trim().toUpperCase().length(3).default('USD'),
  fxRate: z.coerce.number().positive('More than 0'),
  eta: optionalDate,
  clearedOn: optionalDate,
  allocationBasis: z.enum(['VALUE', 'QTY', 'WEIGHT']).default('VALUE'),
  cleared: z.boolean().default(false),
  remarks: optionalText(500),
  items: z.array(LcItemSchema).max(200).default([]),
  charges: z.array(LcChargeSchema).max(100).default([]),
}).refine((s) => !s.cleared || !!s.clearedOn, { message: 'Enter the clearing date', path: ['clearedOn'] });
export type LcInput = z.infer<typeof LcInputSchema>;
export const LcUpdateSchema = z.intersection(LcInputSchema, z.object({ rowVersion: z.coerce.number().int().min(0) }));

export type LandedCost = {
  id: string; docNo: string; docDate: string; vendor: Ref; branch: Ref; grn: { id: string; docNo: string; status: string } | null; originCountry: string;
  portOfLoading: string | null; portOfDischarge: string | null; shipmentMode: string; containerInfo: string | null; billOfLadingNo: string | null; gdNo: string | null;
  lcRef: string | null; bankAccount: { id: string; title: string } | null; currencyCode: string; fxRate: number; eta: string | null; clearedOn: string | null;
  allocationBasis: string; fobAmount: number; capitalisedAmount: number; claimableAmount: number; landedValueAmount: number; status: string; postedAt: string | null;
  voucher: VoucherRef; cancelledAt: string | null; cancelReason: string | null; remarks: string | null; createdBy: Who; createdAt: string; rowVersion: number;
  items: { id: string; lineNo: number; grnLineId: string | null; item: { id: string; sku: string; name: string }; qty: number; weightKg: number; fobUnitFcy: number; fobAmount: number; sharePct: number; allocatedAmount: number; landedUnitCost: number | null }[];
  charges: { id: string; lineNo: number; chargeType: string; description: string; payeeVendor: Ref | null; payeeName: string; ratePct: number | null; amount: number; isCapitalised: boolean; isClaimable: boolean; claimAccount: Ref | null }[];
};
export type LandedCostList = { items: Omit<LandedCost, 'items' | 'charges'>[]; total: number; counts: Record<string, number> };

/** Open import GRNs a shipment can be linked to, with their lines. */
export type ImportGrn = { id: string; docNo: string; docDate: string; vendor: Ref; lines: { id: string; item: { id: string; sku: string; name: string; weightKg: number | null }; acceptedQty: number; unitCost: number }[] };

// ---------------------------------------------------------------- queries and actions
export const PurchaseQuerySchema = z.object({
  status: z.string().trim().max(30).optional(), vendor: z.uuid().optional(), match: z.string().trim().max(30).optional(), search: z.string().trim().max(100).optional(),
  channel: z.enum(['STANDARD', 'COUNTER']).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(20),
});
export const PurchaseReasonSchema = z.object({ rowVersion: z.coerce.number().int().min(0), reason: z.string().trim().min(3, 'Give a reason').max(300) });
export const PurchaseCommentSchema = z.object({ comment: z.string().trim().max(500).optional() });
export const PurchaseRejectSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });
export const BillFromGrnSchema = z.object({ vendorInvoiceNo: z.string().trim().min(1, 'Enter the vendor’s invoice no.').max(60), docDate: z.iso.date('Use a date') });
/** The counter purchase voucher: always a COUNTER bill. */
export const PurchaseVoucherSchema = z.preprocess((v) => (v && typeof v === 'object' ? { ...v, channel: 'COUNTER' } : v), z.intersection(BillInputSchema, z.object({ post: z.boolean().default(true) })));
export const LcAllocateSchema = z.object({ rowVersion: z.coerce.number().int().min(0), basis: z.enum(['VALUE', 'QTY', 'WEIGHT']) });
