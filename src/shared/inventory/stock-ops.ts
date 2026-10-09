import { z } from 'zod';
import { optionalText } from '../treasury/common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const qty = z.coerce.number('Enter a quantity').positive('More than 0').max(1_000_000_000);
const money = z.coerce.number().min(0, 'Not negative').max(100_000_000_000);
const rowVersion = z.coerce.number().int().min(0);
type Ref = { id: string; code: string; name: string };
type Who = { id: string; name: string } | null;
type VoucherRef = { id: string; docNo: string; voucherType: string; status: string } | null;
type ItemRef = { id: string; sku: string; name: string; trackExpiry: boolean };

// ---------------------------------------------------------------- options
export type StockOpsOptions = {
  warehouses: (Ref & { branchId: string | null; type: string; bins: { id: string; code: string }[] })[];
  products: { id: string; sku: string; name: string; upc: string | null; uomId: string; ctn: number; trackExpiry: boolean; avgCost: number; unit: string | null; productClassId: string | null; abcClass: string | null }[];
  reasons: { id: string; code: string; label: string; direction: string; ledgerMovementType: string; icon: string | null }[];
  classes: Ref[];
  accounts: (Ref & { accountClass: number })[];
  users: { id: string; name: string }[];
  countReasons: { code: string; label: string }[];
};
/** On-hand stock of a warehouse, by item and batch. */
export type StockOnHand = { itemId: string; batchId: string | null; batchNo: string | null; expiryDate: string | null; qtyOnHand: number; unitCost: number }[];

export const StockOpsQuerySchema = z.object({
  status: z.string().trim().max(30).optional(), warehouse: z.uuid().optional(), mode: z.enum(['IN', 'OUT']).optional(), search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(20),
});
export const StockReasonSchema = z.object({ rowVersion, reason: z.string().trim().min(3, 'Give a reason').max(300) });

// ---------------------------------------------------------------- stock in / out
export const StockEntryInputSchema = z.object({
  mode: z.enum(['IN', 'OUT']),
  docDate: z.iso.date('Use a date'),
  warehouseId: z.uuid('Choose the warehouse'),
  binId: optionalId,
  reasonId: z.uuid('Choose a reason'),
  manualRef: optionalText(60),
  requestedByName: optionalText(120),
  notes: optionalText(500),
  lines: z.array(z.object({
    itemId: z.uuid('Choose a product'), batchId: optionalId, newBatchNo: optionalText(60), newExpiryDate: optionalDate, qty, unitCost: money.default(0),
  })).min(1, 'Add at least one line').max(300),
});
export type StockEntryInput = z.infer<typeof StockEntryInputSchema>;
export const StockEntryUpdateSchema = z.intersection(StockEntryInputSchema, z.object({ rowVersion }));
export type StockEntry = {
  id: string; docNo: string; mode: string; docDate: string; warehouse: Ref; bin: { id: string; code: string } | null; reason: { id: string; code: string; label: string };
  manualRef: string | null; requestedByName: string | null; notes: string | null; status: string; totalItems: number; totalQty: number; totalValue: number;
  postedAt: string | null; postedBy: Who; voucher: VoucherRef; cancelledAt: string | null; cancelReason: string | null; enteredBy: Who; createdAt: string; rowVersion: number;
  lines: { id: string; lineNo: number; item: ItemRef; batchNo: string | null; expiryDate: string | null; qty: number; unitCost: number; value: number }[];
};
export type StockEntryList = { items: Omit<StockEntry, 'lines'>[]; total: number; counts: Record<string, number>; kpis: { inValue: number; outValue: number; drafts: number } };

// ---------------------------------------------------------------- transfers
export const TransferInputSchema = z.object({
  docDate: z.iso.date('Use a date'),
  fromWarehouseId: z.uuid('Choose where the stock leaves'),
  toWarehouseId: z.uuid('Choose where it goes'),
  carrier: optionalText(80), driverName: optionalText(80), vehicleNo: optionalText(30), etaAt: optionalDate, remarks: optionalText(500),
  lines: z.array(z.object({ itemId: z.uuid('Choose a product'), batchId: optionalId, fromBinId: optionalId, toBinId: optionalId, qtyCtn: z.coerce.number().min(0).default(0), qtyLoose: z.coerce.number().min(0).default(0) })
    .refine((l) => l.qtyCtn + l.qtyLoose > 0, { message: 'Enter a quantity', path: ['qtyLoose'] })).min(1, 'Add at least one line').max(300),
}).refine((t) => t.fromWarehouseId !== t.toWarehouseId, { message: 'Choose a different warehouse', path: ['toWarehouseId'] });
export type TransferInput = z.infer<typeof TransferInputSchema>;
export const TransferUpdateSchema = z.intersection(TransferInputSchema, z.object({ rowVersion }));
export const TransferReceiveSchema = z.object({ rowVersion, note: optionalText(300), lines: z.array(z.object({ transferLineId: z.uuid(), receivedQty: z.coerce.number().min(0), note: optionalText(200) })).max(300).default([]) });
export type StockTransfer = {
  id: string; docNo: string; docDate: string; from: Ref; to: Ref; carrier: string | null; driverName: string | null; vehicleNo: string | null; etaAt: string | null;
  remarks: string | null; status: string; dispatchedAt: string | null; receivedAt: string | null; receivedBy: Who; receiptNote: string | null; totalItems: number;
  totalQty: number; totalValue: number; voucher: VoucherRef; receiptVoucher: VoucherRef; cancelledAt: string | null; cancelReason: string | null; preparedBy: Who;
  createdAt: string; rowVersion: number;
  lines: { id: string; lineNo: number; item: ItemRef; batchNo: string | null; qtyCtn: number; qtyLoose: number; baseQty: number; unitCost: number; value: number; receivedQty: number | null; varianceQty: number | null }[];
};
export type StockTransferList = { items: Omit<StockTransfer, 'lines'>[]; total: number; counts: Record<string, number>; kpis: { inTransit: number; inTransitValue: number; receivedThisMonth: number; drafts: number } };

// ---------------------------------------------------------------- adjustments
export const AdjustmentInputSchema = z.object({
  docDate: z.iso.date('Use a date'),
  warehouseId: z.uuid('Choose the warehouse'),
  reasonId: z.uuid('Choose a reason'),
  offsetAccountId: optionalId,
  remarks: optionalText(500),
  lines: z.array(z.object({ itemId: z.uuid('Choose a product'), batchId: optionalId, qtyCounted: z.coerce.number().min(0, 'Not negative') })).min(1, 'Add at least one line').max(300),
});
export type AdjustmentInput = z.infer<typeof AdjustmentInputSchema>;
export const AdjustmentUpdateSchema = z.intersection(AdjustmentInputSchema, z.object({ rowVersion }));
export type StockAdjustment = {
  id: string; docNo: string; docDate: string; warehouse: Ref; reason: { id: string; code: string; label: string }; offsetAccount: Ref | null; remarks: string | null;
  status: string; lineCount: number; netValue: number; preparedBy: Who; submittedAt: string | null; approvedBy: Who; approvedAt: string | null; rejectionReason: string | null;
  postedAt: string | null; voucher: VoucherRef; source: { type: string; id: string } | null; createdAt: string; rowVersion: number;
  lines: { id: string; lineNo: number; item: ItemRef; batchNo: string | null; qtyOnHand: number; qtyCounted: number; qtyChange: number; unitCost: number; value: number }[];
  approval?: unknown; routing?: unknown; approvalId?: string | null; canAct?: boolean;
};
export type StockAdjustmentList = { items: Omit<StockAdjustment, 'lines'>[]; total: number; counts: Record<string, number>; kpis: { writeOffThisMonth: number; gainThisMonth: number; pending: number } };

// ---------------------------------------------------------------- counts
export const CountInputSchema = z.object({
  name: z.string().trim().min(2, 'Name the count').max(120),
  docDate: z.iso.date('Use a date'),
  warehouseId: z.uuid('Choose the warehouse'),
  scopeClassIds: z.array(z.uuid()).max(50).default([]),
  abcAOnly: z.boolean().default(false),
  isBlind: z.boolean().default(true),
});
export type CountInput = z.infer<typeof CountInputSchema>;
export const CountEntrySchema = z.object({ rowVersion, lines: z.array(z.object({ id: z.uuid(), countedQty: z.coerce.number().min(0).nullable(), reason: optionalText(200) })).min(1).max(2000) });
export const CountApproveSchema = z.object({ rowVersion, comment: optionalText(300) });
export type StockCount = {
  id: string; docNo: string; name: string; docDate: string; warehouse: Ref; scopeLabel: string | null; abcAOnly: boolean; isBlind: boolean; status: string; frozenAt: string | null;
  owner: Who; lineCount: number; countedCount: number; shortageValue: number; excessValue: number; netVarianceValue: number; approver: Who; approvedAt: string | null;
  approvalComment: string | null; voucher: VoucherRef; createdAt: string; rowVersion: number;
  lines: { id: string; lineNo: number; item: ItemRef; batchNo: string | null; expectedQty: number | null; countedQty: number | null; varianceQty: number | null; unitCost: number; varianceValue: number | null; reason: string | null }[];
};
export type StockCountList = { items: Omit<StockCount, 'lines'>[]; total: number; counts: Record<string, number> };
