import { z } from 'zod';
import { optionalText } from '../treasury/common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const qty = z.coerce.number('Enter a quantity').min(0, 'Not negative').max(1_000_000_000);
const money = z.coerce.number('Enter an amount').min(0, 'Not negative').max(100_000_000_000);
const pct = z.coerce.number().min(0, 'Not negative').max(100, 'At most 100');
const rowVersion = z.coerce.number().int().min(0);
type Ref = { id: string; code: string; name: string };
type Who = { id: string; name: string } | null;
type DocRef = { id: string; docNo: string } | null;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Wholesale rate per piece: the product's wholesale price (else its sale price) × the shop's price-tier factor. */
export function tierRate(p: { wprice: number; price: number }, factor: number) {
  return r2((p.wprice > 0 ? p.wprice : p.price) * (factor > 0 ? factor : 1));
}

/** Free pieces a buy-X-get-Y scheme gives on a quantity (floor(qty / buy) × free). */
export function schemeFree(baseQty: number, s: { buyQty: number; freeQty: number } | null | undefined) {
  return s && s.buyQty > 0 && s.freeQty > 0 ? Math.floor(baseQty / s.buyQty) * s.freeQty : 0;
}

// ---------------------------------------------------------------- options
export type WholesaleOptions = {
  routes: { id: string; code: string; name: string; branchId: string | null; warehouseId: string | null; booker: Who; salesman: Who; days: string[] }[];
  shops: { customerId: string; code: string; name: string; area: string | null; city: string | null; phone: string | null; routeId: string | null; priceTier: string; creditLimit: number; status: string; paymentTerms: string }[];
  tiers: { code: string; name: string; rateFactor: number; allocationRank: number }[];
  products: { id: string; sku: string; name: string; ctn: number; wprice: number; price: number; taxCodeId: string | null; taxRate: number; trackExpiry: boolean }[];
  /** Active buy-X-get-Y schemes and the products they cover. */
  schemes: { id: string; code: string; name: string; buyQty: number; freeQty: number; itemIds: string[] | null }[];
  warehouses: Ref[];
  branches: Ref[];
  employees: { id: string; name: string }[];
  /** The signed-in user's employee (booker / salesman) and whether they see every route's bookings. */
  me: { employeeId: string | null; allRoutes: boolean };
};
/** Stock available (on hand − reserved) by product in a warehouse. */
export type StockMap = Record<string, number>;

// ---------------------------------------------------------------- order templates
export const TemplateLineSchema = z.object({ itemId: z.uuid('Choose a product'), qtyCtn: qty.default(0), qtyLoose: qty.default(0) })
  .refine((l) => l.qtyCtn + l.qtyLoose > 0, { message: 'Enter a quantity', path: ['qtyLoose'] });
export const OrderTemplateInputSchema = z.object({
  name: z.string().trim().min(2, 'Name the template').max(80),
  customerId: optionalId,
  isShared: z.boolean().default(true),
  lines: z.array(TemplateLineSchema).min(1, 'Add at least one line').max(200),
});
export type OrderTemplateInput = z.input<typeof OrderTemplateInputSchema>;
export const OrderTemplateUpdateSchema = z.intersection(OrderTemplateInputSchema, z.object({ rowVersion }));
export type OrderTemplate = {
  id: string; name: string; customer: Ref | null; owner: Who; isShared: boolean; status: string; updatedAt: string; rowVersion: number;
  lines: { id: string; item: { id: string; sku: string; name: string; ctn: number }; qtyCtn: number; qtyLoose: number }[];
};

// ---------------------------------------------------------------- quick wholesale entry and held bills
export const WholesaleLineSchema = z.object({
  itemId: z.uuid('Choose a product'),
  qtyCtn: qty.default(0),
  qtyLoose: qty.default(0),
  bonusQty: qty.default(0),
  schemeId: optionalId,
  rate: money,
  isManualRate: z.boolean().default(false),
  discountPct: pct.default(0),
  taxRate: pct.default(0),
}).refine((l) => l.qtyCtn + l.qtyLoose > 0, { message: 'Enter a quantity', path: ['qtyLoose'] });
export type WholesaleLineInput = z.input<typeof WholesaleLineSchema>;
export const WholesaleBillSchema = z.object({
  customerId: z.uuid('Choose a shop'),
  docDate: z.iso.date('Enter the date'),
  routeId: optionalId,
  salesmanEmployeeId: optionalId,
  warehouseId: z.uuid('Choose the warehouse'),
  branchId: optionalId,
  priceTier: z.string().min(1, 'Choose the price tier'),
  remarks: optionalText(500),
  /** Saving a recalled held bill closes it. */
  heldBillId: optionalId,
  lines: z.array(WholesaleLineSchema).min(1, 'Add at least one line').max(300),
});
export type WholesaleBillInput = z.input<typeof WholesaleBillSchema>;
export const HoldBillSchema = z.intersection(WholesaleBillSchema, z.object({ holdReason: z.string().default('MANUAL') }));
export type HeldBill = {
  id: string; docDate: string; customer: Ref; route: Ref | null; salesman: Who; warehouse: Ref | null; priceTier: string; holdReason: string;
  lineCount: number; totalCtn: number; totalLoose: number; netAmount: number; status: string; heldAt: string; heldBy: Who; remarks: string | null; rowVersion: number;
  lines: { item: { id: string; sku: string; name: string; ctn: number }; qtyCtn: number; qtyLoose: number; bonusQty: number; schemeId: string | null; rate: number; isManualRate: boolean; discountPct: number; taxRate: number; netAmount: number }[];
};
/** The posted wholesale invoice a quick-entry save / conversion created. */
export type WholesaleInvoiceRef = { id: string; docNo: string; netAmount: number; customer: string };

// ---------------------------------------------------------------- order bookings
export const BookingLineSchema = z.object({ itemId: z.uuid('Choose a product'), qtyCtn: qty.default(0), qtyLoose: qty.default(0), rate: money.optional().nullable() })
  .refine((l) => l.qtyCtn + l.qtyLoose > 0, { message: 'Enter a quantity', path: ['qtyLoose'] });
export const BookingInputSchema = z.object({
  customerId: z.uuid('Choose a shop'),
  docDate: z.iso.date('Enter the date'),
  warehouseId: optionalId,
  bookerEmployeeId: optionalId,
  note: optionalText(500),
  allowPartial: z.boolean().default(true),
  lines: z.array(BookingLineSchema).min(1, 'Add at least one line').max(200),
});
export type BookingInput = z.input<typeof BookingInputSchema>;
export const BookingUpdateSchema = z.intersection(BookingInputSchema, z.object({ rowVersion }));
export type OrderBooking = {
  id: string; docNo: string; docDate: string; bookedAt: string; booker: Who; route: Ref; customer: Ref & { area: string | null }; warehouse: Ref | null; priceTier: string;
  gpsVerified: boolean; gpsOffsetM: number | null; note: string | null; lineCount: number; grossAmount: number; taxAmount: number; netAmount: number; status: string;
  stockCheckedAt: string | null; shortLineCount: number; short: { sku: string; need: number; have: number }[]; allowPartial: boolean | null; invoice: DocRef;
  convertedAt: string | null; cancelledAt: string | null; cancelReason: string | null; createdAt: string; rowVersion: number;
  lines: { id: string; lineNo: number; item: { id: string; sku: string; name: string; ctn: number }; qtyCtn: number; qtyLoose: number; baseQty: number; rate: number; taxRate: number; netAmount: number; availableQty: number | null; shortQty: number; invoicedQty: number; backorderQty: number }[];
};
export type OrderBookingList = {
  items: Omit<OrderBooking, 'lines'>[]; total: number; counts: Record<string, number>;
  kpis: { today: number; yesterday: number; todayValue: number; awaiting: number; partial: number; backorderLines: number; gpsVerifiedPct: number | null };
};
export const BookingIdsSchema = z.object({ ids: z.array(z.uuid()).min(1, 'Select at least one booking').max(200), allowPartial: z.boolean().default(true) });
export type BookingConvertResult = {
  invoices: WholesaleInvoiceRef[]; held: string[]; backorderLines: number;
  failed: { docNo: string; code: string | null; message: string }[];
};

// ---------------------------------------------------------------- bulk invoice runs
export const BulkCellSchema = z.object({ customerId: z.uuid(), itemId: z.uuid(), qtyCtn: z.coerce.number().int().min(1).max(999) });
export const BulkRunInputSchema = z.object({
  routeId: z.uuid('Choose a route'),
  docDate: z.iso.date('Enter the invoice date'),
  warehouseId: optionalId,
  mode: z.enum(['MATRIX', 'SAME']).default('MATRIX'),
  cells: z.array(BulkCellSchema).min(1, 'Enter at least one quantity').max(5000),
});
export type BulkRunInput = z.input<typeof BulkRunInputSchema>;
export type BulkShopPreview = {
  customerId: string; name: string; lines: number; ctn: number; amount: number; creditLimit: number; balance: number; overBy: number;
  short: { sku: string; need: number; have: number }[]; willSkip: 'OVER_CREDIT_LIMIT' | 'OUT_OF_STOCK' | null;
};
export type BulkRun = {
  id: string; docDate: string; route: Ref; warehouse: Ref | null; mode: string; status: string; shopsSelected: number; totalCtn: number; totalValue: number;
  creditWarnings: number; invoiceCount: number; invoicedValue: number; skippedCount: number; firstInvoiceNo: string | null; lastInvoiceNo: string | null;
  generatedAt: string | null; generatedBy: Who; createdAt: string; rowVersion: number;
  cells: { customerId: string; itemId: string; qtyCtn: number; rate: number; amount: number; invoiceId: string | null }[];
  invoices: { customerId: string; customer: string; id: string; docNo: string; amount: number }[];
  skipped: { customerId: string; customer: string; reasonCode: string; reason: string; billAmount: number; overByAmount: number | null }[];
  preview?: BulkShopPreview[];
};
export type BulkRunList = { items: Omit<BulkRun, 'cells' | 'invoices' | 'skipped' | 'preview'>[]; total: number };

// ---------------------------------------------------------------- back-orders
export type BackOrder = {
  id: string; source: { type: string; id: string | null; docNo: string | null }; customer: Ref & { area: string | null }; route: Ref | null;
  item: { id: string; sku: string; name: string; ctn: number }; backorderDate: string; ageDays: number; originalQty: number; invoicedQty: number; cancelledQty: number;
  pendingQty: number; allocatedQty: number; unitRate: number; taxRate: number; value: number; status: string; lastInvoice: DocRef;
  allocations: { grnNo: string; batchNo: string | null; qty: number; status: string }[];
};
export type BackOrderList = {
  items: BackOrder[]; total: number;
  kpis: { pendingLines: number; products: number; pendingValue: number; customers: number; oldestDays: number; ready: number };
};
/** Posted goods receipt lines with free quantity for items that have open back-orders. */
export type IncomingStock = {
  grnLineId: string; grnId: string; grnNo: string; docDate: string; vendor: string | null; item: { id: string; sku: string; name: string; ctn: number };
  batchNo: string | null; expiryDate: string | null; acceptedQty: number; freeQty: number; waitingQty: number; customersWaiting: number; arrived: boolean;
};
export const BACKORDER_POLICIES = ['FEFO', 'PRIORITY', 'PRO_RATA'] as const;
export const BackOrderAllocateSchema = z.object({ grnLineId: z.uuid(), policy: z.enum(BACKORDER_POLICIES).default('FEFO'), ids: z.array(z.uuid()).max(500).optional().nullable() });
export const BackOrderIdsSchema = z.object({ ids: z.array(z.uuid()).min(1, 'Select at least one line').max(500) });
export const BackOrderCancelSchema = z.object({ ids: z.array(z.uuid()).min(1).max(500), reason: z.string().min(1, 'Choose a reason'), note: optionalText(500) });

export const WholesaleQuerySchema = z.object({
  status: z.string().optional(),
  route: z.uuid().optional(),
  booker: z.uuid().optional(),
  customer: z.uuid().optional(),
  item: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type WholesaleQuery = z.infer<typeof WholesaleQuerySchema>;
export const WholesaleReasonSchema = z.object({ rowVersion, reason: optionalText(500) });
