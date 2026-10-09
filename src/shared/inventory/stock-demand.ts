import { z } from 'zod';
import { optionalText } from '../treasury/common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const rowVersion = z.coerce.number().int().min(0);
const money = z.coerce.number().min(0, 'Not negative').max(100_000_000_000);
type Ref = { id: string; code: string; name: string };
type Who = { id: string; name: string } | null;
type VoucherRef = { id: string; docNo: string; voucherType: string; status: string } | null;
type ItemRef = { id: string; sku: string; name: string };

export const DemandQuerySchema = z.object({
  status: z.string().trim().max(30).optional(), type: z.string().trim().max(10).optional(), search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(20),
});
export type DemandOptions = {
  kits: { id: string; code: string; name: string; kitItemId: string; components: { itemId: string; qtyPerKit: number }[] }[];
  companies: Ref[];
  vendors: Ref[];
  branches: Ref[];
  expenseDefaults: Record<string, Ref | null>;
};

// ---------------------------------------------------------------- stock vouchers (BRK / GFT / SMP / INT)
export const StockVoucherInputSchema = z.object({
  voucherType: z.enum(['BRK', 'GFT', 'SMP', 'INT']),
  docDate: z.iso.date('Use a date'),
  warehouseId: z.uuid('Choose the warehouse'),
  referenceNo: optionalText(60),
  breakageReason: optionalText(40),
  recipientName: optionalText(120),
  occasion: optionalText(40),
  customerId: optionalId,
  employeeId: optionalId,
  isReturnable: z.boolean().default(false),
  returnDueDate: optionalDate,
  departmentId: optionalId,
  costCentreId: optionalId,
  expenseAccountId: optionalId,
  remarks: optionalText(500),
  lines: z.array(z.object({ itemId: z.uuid('Choose a product'), batchId: optionalId, qty: z.coerce.number().positive('More than 0'), remark: optionalText(200) })).min(1, 'Add at least one line').max(300),
}).superRefine((v, ctx) => {
  if (v.voucherType === 'BRK' && !v.breakageReason) ctx.addIssue({ code: 'custom', path: ['breakageReason'], message: 'Choose the breakage reason' });
  if (v.voucherType === 'GFT' && !v.recipientName) ctx.addIssue({ code: 'custom', path: ['recipientName'], message: 'Who received the gift' });
});
export type StockVoucherInput = z.infer<typeof StockVoucherInputSchema>;
export const StockVoucherUpdateSchema = z.intersection(StockVoucherInputSchema, z.object({ rowVersion }));
export type StockVoucher = {
  id: string; voucherType: string; docNo: string; docDate: string; warehouse: Ref; referenceNo: string | null; breakageReason: string | null; recipientName: string | null;
  occasion: string | null; isReturnable: boolean; returnDueDate: string | null; costCentre: Ref | null; expenseAccount: Ref | null; remarks: string | null; status: string;
  totalItems: number; totalQty: number; totalAmount: number; postedAt: string | null; postedBy: Who; voucher: VoucherRef; createdAt: string; rowVersion: number;
  lines: { id: string; lineNo: number; item: ItemRef; batchNo: string | null; qty: number; rate: number; amount: number; remark: string | null }[];
};
export type StockVoucherList = { items: Omit<StockVoucher, 'lines'>[]; total: number; counts: Record<string, number>; byType: Record<string, number> };

// ---------------------------------------------------------------- assembly vouchers
export const AssemblyInputSchema = z.object({
  docDate: z.iso.date('Use a date'),
  kitId: z.uuid('Choose the kit'),
  direction: z.enum(['ASSEMBLE', 'DISASSEMBLE']),
  kitQty: z.coerce.number().positive('More than 0'),
  warehouseId: z.uuid('Choose the warehouse'),
  remarks: optionalText(500),
});
export type AssemblyInput = z.infer<typeof AssemblyInputSchema>;
export const AssemblyUpdateSchema = z.intersection(AssemblyInputSchema, z.object({ rowVersion }));
export type AssemblyVoucher = {
  id: string; docNo: string; docDate: string; kit: { id: string; code: string; name: string }; direction: string; kitQty: number; warehouse: Ref; kitUnitCost: number;
  totalCost: number; status: string; postedAt: string | null; voucher: VoucherRef; remarks: string | null; createdAt: string; rowVersion: number;
  lines: { id: string; lineNo: number; item: ItemRef; qtyPerKit: number; qty: number; unitCost: number; value: number }[];
};
export type AssemblyList = { items: Omit<AssemblyVoucher, 'lines'>[]; total: number; counts: Record<string, number> };

// ---------------------------------------------------------------- goods demand
export const DemandGenerateSchema = z.object({ vendorId: z.uuid('Choose the vendor'), manufacturerId: z.uuid('Choose the company'), notes: optionalText(300) });
export const DemandInputSchema = z.object({
  docDate: z.iso.date('Use a date'),
  vendorId: z.uuid('Choose the vendor'),
  manufacturerId: z.uuid('Choose the company'),
  notes: optionalText(500),
  lines: z.array(z.object({ itemId: z.uuid(), qtyCtn: z.coerce.number().min(0).default(0), baseQty: z.coerce.number().positive('More than 0'), bonusQty: z.coerce.number().min(0).default(0), rate: money, discountPct: z.coerce.number().min(0).max(100).default(0) })).min(1).max(500),
});
export type DemandInput = z.infer<typeof DemandInputSchema>;
export const DemandUpdateSchema = z.intersection(DemandInputSchema, z.object({ rowVersion }));
export const DemandConvertSchema = z.object({ rowVersion, branchId: z.uuid('Choose the branch'), warehouseId: optionalId, expectedDate: optionalDate });
export type GoodsDemand = {
  id: string; docNo: string; docDate: string; manufacturer: Ref; vendor: Ref | null; source: string; notes: string | null; status: string; totalItems: number; totalQty: number;
  totalBonus: number; grossAmount: number; discountAmount: number; netAmount: number; purchaseOrder: { id: string; docNo: string; status: string } | null; orderedAt: string | null;
  preparedBy: Who; createdAt: string; rowVersion: number;
  lines: { id: string; lineNo: number; item: ItemRef; ctnSize: number; qtyCtn: number; baseQty: number; bonusQty: number; rate: number; discountPct: number; netAmount: number; onHand: number; lowLevel: number; highLevel: number }[];
};
export type GoodsDemandList = { items: Omit<GoodsDemand, 'lines'>[]; total: number; counts: Record<string, number> };

// ---------------------------------------------------------------- principal claims & targets
export const PrincipalClaimInputSchema = z.object({
  manufacturerId: z.uuid('Choose the principal'),
  claimDate: z.iso.date('Use a date'),
  claimType: z.enum(['DAMAGE', 'DISPLAY', 'EXPIRY', 'OTHER', 'PRICE_DIFFERENCE', 'SCHEME']),
  description: z.string().trim().min(3, 'Describe the claim').max(300),
  itemId: optionalId, batchId: optionalId,
  qty: z.coerce.number().min(0).optional().nullable().transform((v) => v ?? null),
  amount: z.coerce.number().positive('More than 0'),
  remarks: optionalText(500),
});
export type PrincipalClaimInput = z.infer<typeof PrincipalClaimInputSchema>;
export const PrincipalClaimUpdateSchema = z.intersection(PrincipalClaimInputSchema, z.object({ rowVersion }));
export const PrincipalClaimSettleSchema = z.object({ rowVersion, settledDate: z.iso.date('Use a date'), settledAmount: z.coerce.number().min(0), debitNoteId: optionalId, rejected: z.boolean().default(false), remarks: optionalText(300) });
export type PrincipalClaim = {
  id: string; claimNo: string; manufacturer: Ref; claimDate: string; claimType: string; description: string; item: ItemRef | null; batchNo: string | null; qty: number | null;
  amount: number; status: string; submittedAt: string | null; settledDate: string | null; settledAmount: number | null; debitNote: { id: string; docNo: string } | null;
  remarks: string | null; createdBy: Who; createdAt: string; rowVersion: number;
};
export type PrincipalClaimList = { items: PrincipalClaim[]; total: number; counts: Record<string, number>; kpis: { open: number; openAmount: number; settledThisYear: number } };
export const TargetInputSchema = z.object({
  manufacturerId: z.uuid('Choose the principal'),
  periodType: z.enum(['MONTH', 'QUARTER', 'YEAR']),
  periodStart: z.iso.date('Use a date'),
  periodEnd: z.iso.date('Use a date'),
  basis: z.enum(['PURCHASE', 'SALES']),
  targetAmount: z.coerce.number().positive('More than 0'),
  notes: optionalText(300),
}).refine((t) => t.periodEnd >= t.periodStart, { message: 'Ends before it starts', path: ['periodEnd'] });
export type TargetInput = z.infer<typeof TargetInputSchema>;
export const TargetUpdateSchema = z.intersection(TargetInputSchema, z.object({ rowVersion }));
export type PrincipalTarget = {
  id: string; manufacturer: Ref; periodType: string; periodStart: string; periodEnd: string; basis: string; targetAmount: number; achievedAmount: number; achievedPct: number;
  notes: string | null; rowVersion: number;
};

// ---------------------------------------------------------------- bulk price updates
export const PriceUpdateInputSchema = z.object({
  applyTo: z.enum(['COMPANY', 'CLASS', 'SELECTED']),
  manufacturerId: optionalId,
  productClassId: optionalId,
  itemIds: z.array(z.uuid()).max(2000).default([]),
  priceField: z.enum(['PRICE', 'WPRICE', 'COST', 'BOTH']),
  changePct: z.coerce.number().min(-90, 'At most −90%').max(500, 'At most +500%').refine((v) => v !== 0, 'Enter a change'),
  roundTo: z.coerce.number().min(0).max(1000).default(1),
}).superRefine((p, ctx) => {
  if (p.applyTo === 'COMPANY' && !p.manufacturerId) ctx.addIssue({ code: 'custom', path: ['manufacturerId'], message: 'Choose the company' });
  if (p.applyTo === 'CLASS' && !p.productClassId) ctx.addIssue({ code: 'custom', path: ['productClassId'], message: 'Choose the class' });
  if (p.applyTo === 'SELECTED' && !p.itemIds.length) ctx.addIssue({ code: 'custom', path: ['itemIds'], message: 'Pick the products' });
});
export type PriceUpdateInput = z.infer<typeof PriceUpdateInputSchema>;
export type BulkPriceUpdate = {
  id: string; docNo: string; applyTo: string; manufacturer: Ref | null; productClass: Ref | null; priceField: string; changePct: number; roundTo: number; itemCount: number;
  status: string; appliedAt: string | null; appliedBy: Who; undoneAt: string | null; createdAt: string; rowVersion: number;
  lines: { id: string; item: ItemRef; priceField: string; oldValue: number; newValue: number; changeAmount: number }[];
};
export type BulkPriceUpdateList = { items: Omit<BulkPriceUpdate, 'lines'>[]; total: number; counts: Record<string, number> };

/** New price for a % change, rounded to the nearest `roundTo` (0 = 2 decimals). */
export function bumpPrice(old: number, pct: number, roundTo: number) {
  const raw = old * (1 + pct / 100);
  return roundTo > 0 ? Math.max(0, Math.round(raw / roundTo) * roundTo) : Math.max(0, Math.round(raw * 100) / 100);
}
