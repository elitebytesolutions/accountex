import { z } from 'zod';
import { optionalText } from '../treasury/common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const money = z.coerce.number('Enter an amount').min(0, 'Not negative').max(100_000_000_000);
const qty = z.coerce.number('Enter a quantity').min(0, 'Not negative').max(1_000_000_000);
const rowVersion = z.coerce.number().int().min(0);
type Ref = { id: string; code: string; name: string };
type Who = { id: string; name: string } | null;
type DocRef = { id: string; docNo: string } | null;
type VoucherRef = { id: string; docNo: string; voucherType: string; status: string } | null;
type Opt = { code: string; label: string };

// ---------------------------------------------------------------- options
export type DistributionOpsOptions = {
  routes: (Ref & { branchId: string | null; sourceWarehouseId: string | null; bookerEmployeeId: string | null; salesmanEmployeeId: string | null; driverEmployeeId: string | null; vehicleId: string | null })[];
  vans: { id: string; regNo: string; capacityCtn: number; capacityKg: number; driverEmployeeId: string | null }[];
  employees: { id: string; code: string; name: string; isBooker: boolean; isSalesman: boolean; isDeliveryman: boolean; userId: string | null }[];
  warehouses: Ref[];
  branches: Ref[];
  cashAccounts: Ref[];
  bankAccounts: { id: string; title: string }[];
  banks: { id: string; code: string; name: string }[];
  commissionSlabs: { id: string; label: string; fromPct: number; toPct: number; ratePct: number }[];
  lookups: Record<'returnReasons' | 'deliveryStates' | 'recoveryModes' | 'overrideTypes' | 'holdReasons' | 'targetRoles', Opt[]>;
};

// ---------------------------------------------------------------- load sheets
export const LoadSheetInputSchema = z.object({
  docDate: z.iso.date('Enter the run date'),
  routeId: z.uuid('Choose the route'),
  vehicleId: z.uuid('Choose the van'),
  driverEmployeeId: z.uuid('Choose the driver'),
  salesmanEmployeeId: optionalId,
  departureTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM').default('08:00'),
  sealNo: optionalText(40),
  returnableCrates: z.coerce.number().int().min(0).max(10000).default(0),
  remarks: optionalText(1000),
  invoiceIds: z.array(z.uuid()).min(1, 'Choose at least one invoice').max(300),
});
export type LoadSheetInput = z.input<typeof LoadSheetInputSchema>;
export const LoadSheetUpdateSchema = z.intersection(LoadSheetInputSchema, z.object({ rowVersion }));
export const DeliveryUpdateSchema = z.object({ state: z.enum(['FULL', 'PARTIAL', 'NONE']), reason: optionalText(200) });

/** Posted route invoices not on a live run (load-sheet picker). */
export type LoadCandidate = { id: string; docNo: string; docDate: string; customer: Ref; netAmount: number; balanceAmount: number; lineCount: number; ctnEquiv: number; stopSeq: number | null };
export type LoadSheet = {
  id: string; docNo: string; docDate: string; route: Ref; branch: Ref | null; vehicle: { id: string; regNo: string }; driver: Who; salesman: Who; sourceWarehouse: Ref;
  departureTime: string; gatePassNo: string | null; sealNo: string | null; returnableCrates: number; invoiceCount: number; shopCount: number; skuCount: number;
  totalCtnEquiv: number; totalPcs: number; totalValue: number; capacityCtn: number; capacityCtnPct: number;
  /** LOADING (draft), SCHEDULED (approved), DISPATCHED, SETTLED, CANCELLED */
  status: string; dispatchedAt: string | null; cancelledAt: string | null; remarks: string | null; settlement: (DocRef & { status: string }) | null;
  createdBy: Who; createdAt: string; rowVersion: number;
  invoices: { id: string; invoice: NonNullable<DocRef>; customer: Ref; stopSeq: number | null; lineCount: number; ctnEquiv: number; amount: number; released: boolean; deliveryState: string | null }[];
  lines: { id: string; item: { id: string; sku: string; name: string }; qtyCtn: number; qtyLoose: number; baseQty: number; ctnEquiv: number; value: number; isPicked: boolean }[];
};
export type LoadSheetList = { items: Omit<LoadSheet, 'invoices' | 'lines'>[]; total: number; counts: Record<string, number> };

// ---------------------------------------------------------------- route settlements
export const SettlementLineSchema = z.object({
  invoiceId: z.uuid(),
  deliveryState: z.enum(['FULL', 'PARTIAL', 'NONE']).default('FULL'),
  nonDeliveryReason: optionalText(200),
  cashAmount: money.default(0),
  cheques: z.array(z.object({ chequeNo: z.string().regex(/^\d{4,10}$/, 'Cheque no. is 4–10 digits'), bankId: optionalId, bankName: z.string().trim().min(1, 'Bank').max(80), chequeDate: z.iso.date(), amount: money.refine((n) => n > 0) })).max(10).default([]),
  returns: z.array(z.object({ invoiceLineId: z.uuid(), qty: qty.refine((n) => n > 0, 'Enter a quantity'), reason: z.string().min(1, 'Choose a reason') })).max(100).default([]),
});
export const RouteSettlementSaveSchema = z.object({
  rowVersion,
  docDate: z.iso.date(),
  cashAccountId: z.uuid('Choose the cash account the cash goes into'),
  salesmanEmployeeId: optionalId,
  denominations: z.array(z.object({ denomination: money.refine((n) => n > 0), noteCount: z.coerce.number().int().min(0).max(100000) })).max(30).default([]),
  remarks: optionalText(1000),
  lines: z.array(SettlementLineSchema).max(300),
});
export type RouteSettlementSave = z.input<typeof RouteSettlementSaveSchema>;

export type RouteSettlement = {
  id: string; docNo: string; docDate: string; loadSheet: NonNullable<DocRef> & { route: Ref; vehicle: string }; salesman: Who; cashAccount: Ref | null;
  invoiceTotal: number; returnTotal: number; cashExpected: number; cashCounted: number; cashShortAmount: number; cashOverAmount: number; chequeTotal: number; creditTotal: number;
  /** OPEN, SETTLED */
  status: string; journal: VoucherRef; postedAt: string | null; postedBy: Who; remarks: string | null; rowVersion: number;
  denominations: { denomination: number; noteCount: number; amount: number }[];
  lines: {
    id: string; lineNo: number; invoice: NonNullable<DocRef>; customer: Ref; invoiceAmount: number; balanceAmount: number; deliveryState: string | null; nonDeliveryReason: string | null;
    cashAmount: number; chequeAmount: number; returnAmount: number; creditAmount: number; receipt: DocRef; salesReturn: DocRef;
    cheques: { id: string; chequeNo: string; bankId: string | null; bankName: string; chequeDate: string; amount: number; chequeId: string | null }[];
    returns: { id: string; invoiceLineId: string; item: { id: string; sku: string; name: string }; suppliedQty: number; returnQty: number; unitPrice: number; returnValue: number; reason: string }[];
    invoiceLines: { id: string; item: { id: string; sku: string; name: string }; qty: number; rate: number; netRate: number }[];
  }[];
};
export type RouteSettlementList = { items: Omit<RouteSettlement, 'lines' | 'denominations'>[]; total: number; counts: Record<string, number> };

// ---------------------------------------------------------------- recovery sheets
export const RecoveryGenerateSchema = z.object({ routeId: z.uuid('Choose the route'), docDate: z.iso.date(), salesmanEmployeeId: optionalId });
export const RecoveryLinesSchema = z.object({
  rowVersion,
  lines: z.array(z.object({
    id: z.uuid(),
    collectedAmount: money.default(0),
    mode: z.string().default('CASH'),
    /** Cheque number (CHEQUE) or the bank / wallet reference. */
    reference: optionalText(60),
    depositBankAccountId: optionalId,
    promiseToPayDate: optionalDate,
    remarks: optionalText(300),
  })).max(500),
});
export const RecoveryPostSchema = z.object({ rowVersion, cashAccountId: z.uuid('Choose the cash account') });
export type RecoverySheet = {
  id: string; docNo: string; docDate: string; route: Ref | null; salesman: Who; shopCount: number; targetAmount: number; outstandingTotal: number; collectedTotal: number; postedTotal: number;
  /** OPEN, POSTED */
  status: string; createdBy: Who; createdAt: string; rowVersion: number;
  lines: {
    id: string; lineNo: number; customer: Ref; outstandingAmount: number; age030: number; age3160: number; age6190: number; age90Plus: number; creditLimit: number;
    lastPaymentDate: string | null; lastPaymentAmount: number; targetAmount: number; collectedAmount: number; mode: string | null; remarks: string | null;
    depositBankAccountId: string | null; promiseToPayDate: string | null; status: string; receipt: DocRef; cheque: DocRef;
  }[];
};
export type RecoverySheetList = { items: Omit<RecoverySheet, 'lines'>[]; total: number; counts: Record<string, number> };

// ---------------------------------------------------------------- targets & commissions
export const SalesmanTargetInputSchema = z.object({
  employeeId: z.uuid('Choose the employee'),
  role: z.enum(['BOOKER', 'SALESMAN']),
  routeId: optionalId,
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  targetAmount: money.refine((n) => n > 0, 'Enter the target'),
}).refine((t) => t.periodEnd >= t.periodStart, { message: 'End after start', path: ['periodEnd'] });
export type SalesmanTargetInput = z.input<typeof SalesmanTargetInputSchema>;
export const SalesmanTargetUpdateSchema = z.intersection(SalesmanTargetInputSchema, z.object({ rowVersion }));
export const CommissionCalcSchema = z.object({ periodStart: z.iso.date(), periodEnd: z.iso.date() });
export type SalesmanTarget = {
  id: string; employee: Ref; role: string; route: Ref | null; periodStart: string; periodEnd: string; targetAmount: number; achievedAmount: number; achievementPct: number;
  status: string; commission: { id: string; status: string; amount: number } | null; rowVersion: number;
};
export type SalesmanCommission = {
  id: string; employee: Ref; target: { id: string; role: string }; periodStart: string; periodEnd: string; targetAmount: number; achievedAmount: number; achievementPct: number;
  slab: { id: string; label: string } | null; ratePct: number; commissionAmount: number;
  /** DRAFT, APPROVED, ACCRUED, PAID, CANCELLED */
  status: string; approvedBy: Who; approvedAt: string | null; journal: VoucherRef; payrollRun: DocRef; rowVersion: number;
};
export type TargetsOverview = { targets: SalesmanTarget[]; commissions: SalesmanCommission[] };

// ---------------------------------------------------------------- credit control
export const CreditHoldSchema = z.object({ reason: z.string().min(1, 'Choose a reason'), notes: optionalText(500) });
export const CreditOverrideInputSchema = z.object({
  customerId: z.uuid('Choose the customer'),
  overrideType: z.enum(['ONE_TIME', 'TEMP_LIMIT', 'RELEASE_HOLD']),
  invoiceId: optionalId,
  documentAmount: money.optional().nullable(),
  tempLimitAmount: money.optional().nullable(),
  validUntil: optionalDate,
  requestReason: z.string().trim().min(3, 'Give a reason').max(500),
}).refine((o) => o.overrideType === 'TEMP_LIMIT' || !!o.invoiceId, { message: 'Choose the invoice this is for', path: ['invoiceId'] })
  .refine((o) => o.overrideType !== 'TEMP_LIMIT' || (!!o.tempLimitAmount && !!o.validUntil), { message: 'Enter the temporary limit and until when', path: ['tempLimitAmount'] });
export type CreditOverrideInput = z.input<typeof CreditOverrideInputSchema>;
export const CreditDecisionSchema = z.object({ comment: optionalText(500) });

export type CreditCustomerRow = {
  customer: Ref & { city: string | null }; status: string; holdReason: string | null; onHoldSince: string | null; creditLimit: number; balance: number; overdue: number;
  usedPct: number | null; overLimit: boolean; maxDaysOverdue: number | null;
};
export type CreditOverride = {
  id: string; docNo: string; customer: Ref; overrideType: string; invoice: DocRef; documentAmount: number; creditLimit: number; balance: number; exceedBy: number;
  tempLimitAmount: number | null; validUntil: string | null; requestReason: string; status: string; requestedBy: Who; requestedAt: string; decidedBy: Who; decidedAt: string | null;
  conditionComments: string | null; rowVersion: number;
};
export type CreditControl = {
  kpis: { onHold: number; overLimit: number; overdueAmount: number; pendingOverrides: number };
  customers: CreditCustomerRow[];
  overrides: CreditOverride[];
  events: { id: string; customer: Ref; eventType: string; reason: string; source: string; occurredAt: string; user: Who; notes: string | null }[];
};

export const DistributionQuerySchema = z.object({
  status: z.string().optional(),
  route: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type DistributionQuery = z.infer<typeof DistributionQuerySchema>;
export const DistributionRowVersionSchema = z.object({ rowVersion });
export const DistributionReasonSchema = z.object({ rowVersion, reason: z.string().trim().min(3, 'Give a reason').max(500) });
