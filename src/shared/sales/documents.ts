import { z } from 'zod';
import { optionalText } from '../treasury/common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const qty = z.coerce.number('Enter a quantity').min(0, 'Not negative').max(1_000_000_000);
const money = z.coerce.number('Enter an amount').min(0, 'Not negative').max(100_000_000_000);
const pct = z.coerce.number().min(0, 'Not negative').max(100, 'At most 100');
type Ref = { id: string; code: string; name: string };
type Who = { id: string; name: string } | null;
type DocRef = { id: string; docNo: string } | null;
type VoucherRef = { id: string; docNo: string; voucherType: string; status: string } | null;

/** Days of credit a payment-terms code gives (NET_30 → 30; advance / cash on delivery / due on receipt → 0). */
export function termDays(code: string | null | undefined) {
  const m = /^NET_(\d+)$/.exec(code ?? '');
  return m ? Number(m[1]) : 0;
}

/** Quotation shown as Expired once its validity date passed while it was still waiting for the customer. */
export function quotationShownStatus(status: string, validTill: string, today: string) {
  return status === 'SENT' && validTill < today ? 'EXPIRED' : status;
}

// ---------------------------------------------------------------- options
export type SalesDocOptions = {
  customers: {
    id: string; code: string; name: string; city: string | null; address: string | null; ntn: string | null; strn: string | null; cnic: string | null;
    phone: string | null; email: string | null; paymentTerms: string; creditDays: number; creditLimit: number; priceListId: string | null; status: string;
    salesRepUserId: string | null; branchId: string | null; isGstExempt: boolean;
  }[];
  products: { id: string; sku: string; name: string; ctn: number; unit: string | null; trackExpiry: boolean; price: number; avgCost: number; taxCodeId: string | null; gstRate: number; hsCode: string | null }[];
  warehouses: { id: string; code: string; name: string; branchId: string | null }[];
  branches: Ref[];
  taxCodes: { id: string; code: string; name: string; rate: number | null }[];
  priceLists: (Ref & { isDefault: boolean })[];
  users: { id: string; name: string }[];
  vans: { id: string; regNo: string; model: string | null }[];
  paymentTerms: { code: string; label: string }[];
  deliverySlots: { code: string; label: string }[];
  saleTypes: { code: string; label: string }[];
  /** FBR / PRA reporting on posting is set up and active. */
  fbr: { active: boolean; authority: string | null };
};

/** A customer's credit position (Sales.getCustomerCreditExposure). */
export type CustomerCredit = {
  customerId: string; status: string; holdReason: string | null; creditLimit: number; effectiveLimit: number; balance: number; overdueAmount: number;
  openOrdersAmount: number; exposure: number; available: number; blockOverLimit: boolean;
};

/** Sales price of each product on a price list (itemId → price), effective today. */
export type PriceMap = Record<string, number>;

// ---------------------------------------------------------------- lines (quotations, orders, invoices)
export const SalesLineSchema = z.object({
  id: optionalId,
  itemId: optionalId,
  description: optionalText(300),
  qtyCtn: qty.default(0),
  qtyLoose: qty.default(0),
  bonusQty: qty.default(0),
  rate: money,
  discountPct: pct.default(0),
  taxCodeId: optionalId,
  taxRate: pct.default(0),
  /** Invoices: the order / challan line it bills, the batch it issues. */
  salesOrderLineId: optionalId,
  deliveryChallanLineId: optionalId,
  batchId: optionalId,
}).refine((l) => l.itemId || l.description, { message: 'Choose a product or enter a description', path: ['itemId'] })
  .refine((l) => l.qtyCtn + l.qtyLoose > 0, { message: 'Enter a quantity', path: ['qtyLoose'] });
export type SalesLineInput = z.input<typeof SalesLineSchema>;

export type SalesLine = {
  id: string; lineNo: number; item: { id: string; sku: string; name: string; ctn: number } | null; description: string | null;
  qtyCtn: number; qtyLoose: number; baseQty: number; bonusQty: number; rate: number; discountPct: number;
  grossAmount: number; discountAmount: number; taxableAmount: number; taxCode: Ref | null; taxRate: number; taxAmount: number; totalAmount: number;
  deliveredQty?: number; invoicedQty?: number; salesOrderLineId?: string | null; deliveryChallanLineId?: string | null; batchId?: string | null; hsCode?: string | null;
};

const lines = z.array(SalesLineSchema).min(1, 'Add at least one line').max(200);
const rowVersion = { rowVersion: z.coerce.number().int().min(0) };

// ---------------------------------------------------------------- quotations
export const QuotationInputSchema = z.object({
  customerId: z.uuid('Choose a customer'),
  docDate: z.iso.date('Enter the quote date'),
  validTill: z.iso.date('Enter the validity date'),
  subject: optionalText(200),
  salesRepUserId: optionalId,
  branchId: optionalId,
  priceListId: optionalId,
  remarks: optionalText(1000),
  terms: optionalText(2000),
  lines,
}).refine((q) => q.validTill >= q.docDate, { message: 'Valid till can’t be before the quote date', path: ['validTill'] });
export type QuotationInput = z.input<typeof QuotationInputSchema>;
export const QuotationUpdateSchema = z.intersection(QuotationInputSchema, z.object(rowVersion));

export type Quotation = {
  id: string; docNo: string; docDate: string; validTill: string; customer: Ref & { city: string | null }; subject: string | null; salesRep: Who;
  branch: Ref | null; priceList: Ref | null; revisionOf: DocRef; grossAmount: number; discountAmount: number; taxAmount: number; netAmount: number;
  /** DRAFT, SENT, ACCEPTED, CONVERTED, REJECTED, CANCELLED, or EXPIRED (sent and past its validity date). */
  status: string; sentAt: string | null; acceptedAt: string | null; remarks: string | null; terms: string | null;
  order: DocRef; createdBy: Who; createdAt: string; rowVersion: number; lines: SalesLine[];
};
export type QuotationList = {
  items: Omit<Quotation, 'lines'>[]; total: number; counts: Record<string, number>;
  kpis: { open: number; openAmount: number; winRate: number | null; convertedMonth: number; convertedMonthAmount: number; expiringSoon: number; expiringAmount: number };
};

export const QuotationConvertSchema = z.object({
  rowVersion: z.coerce.number().int().min(0),
  docDate: z.iso.date('Enter the order date'),
  expectedDeliveryDate: optionalDate,
  warehouseId: z.uuid('Choose the warehouse'),
  customerPoRef: optionalText(60),
  reserveStock: z.boolean().default(true),
});
export type QuotationConvertInput = z.input<typeof QuotationConvertSchema>;

// ---------------------------------------------------------------- sales orders
export const SalesOrderInputSchema = z.object({
  customerId: z.uuid('Choose a customer'),
  docDate: z.iso.date('Enter the order date'),
  branchId: optionalId,
  warehouseId: z.uuid('Choose the warehouse'),
  expectedDeliveryDate: optionalDate,
  customerPoRef: optionalText(60),
  customerPoDate: optionalDate,
  salesRepUserId: optionalId,
  priceListId: optionalId,
  paymentTerms: z.string().min(1, 'Choose payment terms'),
  reserveStock: z.boolean().default(true),
  remarks: optionalText(1000),
  lines,
}).refine((o) => !o.expectedDeliveryDate || o.expectedDeliveryDate >= o.docDate, { message: 'Delivery can’t be before the order date', path: ['expectedDeliveryDate'] });
export type SalesOrderInput = z.input<typeof SalesOrderInputSchema>;
export const SalesOrderUpdateSchema = z.intersection(SalesOrderInputSchema, z.object(rowVersion));

export type SalesOrder = {
  id: string; docNo: string; docDate: string; customer: Ref & { city: string | null }; branch: Ref | null; warehouse: Ref | null; expectedDeliveryDate: string | null;
  customerPoRef: string | null; customerPoDate: string | null; salesRep: Who; priceList: Ref | null; paymentTerms: string | null; reserveStock: boolean;
  grossAmount: number; discountAmount: number; taxAmount: number; netAmount: number; status: string; holdReason: string | null; confirmedAt: string | null;
  cancelledAt: string | null; cancelReason: string | null; remarks: string | null; quotation: DocRef;
  /** Delivered / invoiced share of the ordered quantity (0–100); late = past the delivery date and not fully delivered. */
  deliveredPct: number; invoicedPct: number; late: boolean;
  createdBy: Who; createdAt: string; rowVersion: number; lines: SalesLine[];
  challans: { id: string; docNo: string; docDate: string; status: string }[];
  invoices: { id: string; docNo: string; docDate: string; status: string }[];
  approval?: unknown; routing?: unknown; approvalId?: string | null; canAct?: boolean;
};
export type SalesOrderList = {
  items: Omit<SalesOrder, 'lines' | 'challans' | 'invoices'>[]; total: number; counts: Record<string, number>;
  kpis: { open: number; openAmount: number; toDeliver: number; dueThisWeek: number; toInvoiceAmount: number; late: number; onTimePct: number | null };
};

export const SalesOrderConfirmSchema = z.object({
  comment: optionalText(500),
  /** Confirm although the customer is on hold or over limit (needs crovr:approve). */
  overrideCredit: z.boolean().default(false),
});

// ---------------------------------------------------------------- delivery challans
export const ChallanLineSchema = z.object({
  id: optionalId,
  salesOrderLineId: z.uuid(),
  qty: qty,
  batchId: optionalId,
});
export const ChallanInputSchema = z.object({
  salesOrderId: z.uuid('Choose a sales order'),
  docDate: z.iso.date('Enter the challan date'),
  warehouseId: optionalId,
  vehicleId: optionalId,
  vehicleNo: z.string().trim().min(1, 'Enter the vehicle no.').max(30),
  driverName: optionalText(100),
  deliverySlot: optionalText(20),
  remarks: optionalText(500),
  lines: z.array(ChallanLineSchema).min(1, 'Tick at least one line').max(200),
}).refine((c) => c.lines.some((l) => l.qty > 0), { message: 'Deliver at least one unit', path: ['lines'] });
export type ChallanInput = z.input<typeof ChallanInputSchema>;
export const ChallanUpdateSchema = z.intersection(ChallanInputSchema, z.object(rowVersion));

export type DeliveryChallan = {
  id: string; docNo: string; docDate: string; salesOrder: { id: string; docNo: string }; customer: Ref & { city: string | null; address: string | null; phone: string | null };
  branch: Ref | null; warehouse: Ref; vehicleNo: string; driverName: string | null; deliverySlot: string | null; totalQty: number; costAmount: number; status: string;
  dispatchedAt: string | null; deliveredAt: string | null; receivedBy: string | null; invoice: DocRef; journal: VoucherRef; remarks: string | null;
  cancelledAt: string | null; createdBy: Who; createdAt: string; rowVersion: number;
  lines: { id: string; lineNo: number; salesOrderLineId: string; item: { id: string; sku: string; name: string }; batchId: string | null; orderedQty: number; previouslyDeliveredQty: number; baseQty: number; unitCost: number | null; costAmount: number }[];
};
export type DeliveryChallanList = {
  items: Omit<DeliveryChallan, 'lines'>[]; total: number; counts: Record<string, number>;
  kpis: { packed: number; onRoad: number; deliveredToInvoice: number; unbilledAmount: number; invoicedWeek: number; invoicedWeekAmount: number };
};
/** An order's lines still to deliver, for the New challan drawer. */
export type DeliverableOrder = {
  id: string; docNo: string; customer: Ref & { city: string | null; address: string | null; phone: string | null }; warehouse: Ref | null;
  lines: { id: string; item: { id: string; sku: string; name: string; trackExpiry: boolean }; ordered: number; delivered: number; pending: number }[];
};
export const ChallanDeliverSchema = z.object({ rowVersion: z.coerce.number().int().min(0), receivedBy: optionalText(100) });

// ---------------------------------------------------------------- sales invoices (STANDARD) and the counter sales voucher (COUNTER)
export const SALES_CHANNELS = ['STANDARD', 'COUNTER', 'WHOLESALE'] as const;
export const SalesInvoiceInputSchema = z.object({
  channel: z.enum(SALES_CHANNELS).default('STANDARD'),
  customerId: z.uuid('Choose a customer'),
  docDate: z.iso.date('Enter the invoice date'),
  branchId: z.uuid('Choose the branch'),
  warehouseId: optionalId,
  salesOrderId: optionalId,
  deliveryChallanId: optionalId,
  customerPoNo: optionalText(60),
  customerPoDate: optionalDate,
  salesRepUserId: optionalId,
  priceListId: optionalId,
  paymentTerms: z.string().min(1, 'Choose payment terms'),
  dueDate: optionalDate,
  saleType: z.string().default('REGULAR'),
  submitToFbr: z.boolean().default(true),
  customerNotes: optionalText(2000),
  termsConditions: optionalText(2000),
  remarks: optionalText(1000),
  billBookNo: optionalText(30),
  bookerName: optionalText(100),
  deliverymanName: optionalText(100),
  salesmanName: optionalText(100),
  supervisorName: optionalText(100),
  deliverySlot: optionalText(20),
  /** Wholesale (Phase 25): price tier and route / staff of the bill. */
  priceTier: optionalText(30),
  priceTierFactor: z.coerce.number().gt(0).max(1).optional().nullable(),
  routeId: optionalId,
  bookerEmployeeId: optionalId,
  salesmanEmployeeId: optionalId,
  lines,
}).refine((i) => !i.dueDate || i.dueDate >= i.docDate, { message: 'Due date can’t be before the invoice date', path: ['dueDate'] });
export type SalesInvoiceInput = z.input<typeof SalesInvoiceInputSchema>;
export const SalesInvoiceUpdateSchema = z.intersection(SalesInvoiceInputSchema, z.object(rowVersion));
/** The counter sales voucher: saved and, unless kept as a draft, posted in one go. */
export const SalesVoucherSchema = z.intersection(SalesInvoiceInputSchema, z.object({ post: z.boolean().default(true) }));

export type SalesInvoice = {
  id: string; docNo: string; channel: string; docDate: string; customer: Ref & { city: string | null }; branch: Ref; warehouse: Ref | null;
  salesOrder: DocRef; deliveryChallan: DocRef; quotation: DocRef; customerPoNo: string | null; customerPoDate: string | null; salesRep: Who; priceList: Ref | null;
  paymentTerms: string; dueDate: string; buyer: { name: string | null; address: string | null; ntn: string | null; strn: string | null; cnic: string | null; city: string | null; phone: string | null; email: string | null };
  saleType: string; grossAmount: number; discountAmount: number; taxableAmount: number; taxAmount: number; furtherTaxAmount: number; netAmount: number;
  paidAmount: number; balanceAmount: number; costAmount: number; submitToFbr: boolean; fbrStatus: string; fbrInvoiceNo: string | null; fbrError: string | null;
  /** DRAFT, POSTED, PARTIALLY_PAID, PAID, VOID; overdue = open past the due date; awaitingApproval = submitted to a workflow. */
  status: string; overdue: boolean; awaitingApproval: boolean; postedAt: string | null; postedBy: Who; journal: VoucherRef;
  voidReason: string | null; voidedAt: string | null; customerNotes: string | null; termsConditions: string | null; remarks: string | null;
  billBookNo: string | null; bookerName: string | null; deliverymanName: string | null; salesmanName: string | null; supervisorName: string | null; deliverySlot: string | null;
  createdBy: Who; createdAt: string; rowVersion: number; lines: SalesLine[];
  approval?: unknown; routing?: unknown; approvalId?: string | null; canAct?: boolean;
};
export type SalesInvoiceList = {
  items: Omit<SalesInvoice, 'lines' | 'approval' | 'routing' | 'approvalId' | 'canAct'>[]; total: number; counts: Record<string, number>;
  kpis: { invoicedMtd: number; invoicedMtdCount: number; outstanding: number; openCount: number; overdue: number; overdueCount: number };
};

// ---------------------------------------------------------------- shared actions and list query
export const SalesQuerySchema = z.object({
  status: z.string().optional(),
  customer: z.uuid().optional(),
  warehouse: z.uuid().optional(),
  salesRep: z.uuid().optional(),
  branch: z.uuid().optional(),
  channel: z.string().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type SalesQuery = z.infer<typeof SalesQuerySchema>;
export const SalesReasonSchema = z.object({ rowVersion: z.coerce.number().int().min(0), reason: z.string().trim().min(3, 'Give a reason').max(500) });
export const SalesOptionalReasonSchema = z.object({ rowVersion: z.coerce.number().int().min(0), reason: optionalText(500) });
export const SalesCommentSchema = z.object({ comment: optionalText(500) });
export const SalesRejectSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(500) });
