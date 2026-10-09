import { z } from 'zod';
import { optionalText } from '../treasury/common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const money = z.coerce.number('Enter an amount').min(0, 'Not negative').max(100_000_000_000);
const rowVersion = z.coerce.number().int().min(0);
type Ref = { id: string; code: string; name: string };
type Who = { id: string; name: string } | null;
type VoucherRef = { id: string; docNo: string; voucherType: string; status: string } | null;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** One month's charge, as Phase 27's database compute: SLM on cost less residual, WDV on net book value; never below residual. */
export function monthlyCharge(a: { method: string; ratePct: number | null; cost: number; accumulated: number; residualValue: number }, months = 1) {
  if (a.method === 'NONE' || !a.ratePct) return 0;
  const base = a.method === 'SLM' ? a.cost - a.residualValue : a.cost - a.accumulated;
  return r2(Math.max(0, Math.min((base * a.ratePct) / 100 / 12 * months, a.cost - a.accumulated - a.residualValue)));
}

// ---------------------------------------------------------------- options
export type AssetOptions = {
  categories: { id: string; code: string; name: string; defaultMethod: string; defaultRatePct: number | null; costAccountId: string; accumDepAccountId: string | null; depExpenseAccountId: string | null }[];
  branches: Ref[];
  costCentres: Ref[];
  employees: { id: string; name: string }[];
  accounts: (Ref & { accountClass: number })[];
  periods: { id: string; code: string; startDate: string; endDate: string; status: string; fiscalYearId: string }[];
  /** Bank and cash accounts' GL accounts (disposal proceeds). */
  receiveInto: { accountId: string; label: string }[];
  taxCodes: { id: string; code: string; name: string; rate: number | null; accountId: string | null }[];
  /** Default gain / loss on disposal accounts (posting roles FA_GAIN / FA_LOSS). */
  gainAccountId: string | null;
  lossAccountId: string | null;
};

/** A posted vendor bill line that can be capitalised (not yet on an asset). */
export type CapitalisableLine = {
  id: string; billId: string; billNo: string; billDate: string; vendor: Ref; description: string | null; account: Ref | null; netAmount: number;
};

// ---------------------------------------------------------------- fixed assets
export const ASSET_METHODS = ['WDV', 'SLM', 'NONE'] as const;
export const FixedAssetInputSchema = z.object({
  name: z.string().trim().min(2, 'Name the asset').max(150),
  description: optionalText(500),
  categoryId: z.uuid('Choose the category'),
  branchId: z.uuid('Choose the location'),
  custodianEmployeeId: optionalId,
  costCentreId: optionalId,
  tagNo: optionalText(40),
  serialNo: optionalText(80),
  acquisitionDate: z.iso.date('Enter the acquisition date'),
  cost: z.coerce.number('Enter the cost').gt(0, 'More than 0').max(100_000_000_000),
  vendorId: optionalId,
  method: z.enum(ASSET_METHODS),
  ratePct: z.coerce.number().gt(0, 'More than 0').max(100, 'At most 100').optional().nullable().transform((v) => v ?? null),
  residualValue: money.default(0),
  chargeFullMonthOnPurchase: z.boolean().default(true),
  costAccountId: z.uuid('Choose the asset account'),
  accumDepAccountId: optionalId,
  depExpenseAccountId: optionalId,
  registrationNo: optionalText(40),
  engineNo: optionalText(60),
  chassisNo: optionalText(60),
  insurer: optionalText(100),
  insurancePolicyNo: optionalText(60),
  insuranceExpiry: optionalDate,
}).superRefine((a, ctx) => {
  const add = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (a.method === 'NONE') { if (a.ratePct !== null) add('ratePct', 'No rate when the asset is not depreciated'); }
  else {
    if (a.ratePct === null) add('ratePct', 'Enter the yearly rate');
    if (!a.accumDepAccountId) add('accumDepAccountId', 'Choose the accumulated depreciation account');
    if (!a.depExpenseAccountId) add('depExpenseAccountId', 'Choose the depreciation expense account');
  }
  if (a.residualValue >= a.cost) add('residualValue', 'Residual value must be below cost');
});
export type FixedAssetInput = z.input<typeof FixedAssetInputSchema>;
export const FixedAssetUpdateSchema = z.intersection(FixedAssetInputSchema, z.object({ rowVersion }));
export const CapitaliseSchema = z.object({ rowVersion, billLineId: optionalId });

export type FixedAsset = {
  id: string; code: string; name: string; description: string | null; category: Ref; branch: Ref; custodian: Who; costCentre: Ref | null; tagNo: string | null; serialNo: string | null;
  acquisitionDate: string; cost: number; source: { type: string | null; id: string | null; docNo: string | null; lineId: string | null }; vendor: Ref | null;
  method: string; ratePct: number | null; residualValue: number; chargeFullMonthOnPurchase: boolean;
  costAccount: Ref; accumDepAccount: Ref | null; depExpenseAccount: Ref | null; accumulatedDepreciation: number; nbv: number; depreciatedThrough: string | null;
  registrationNo: string | null; engineNo: string | null; chassisNo: string | null; insurer: string | null; insurancePolicyNo: string | null; insuranceExpiry: string | null;
  status: string; disposedOn: string | null; capitalisedBy: Who; monthlyCharge: number; createdAt: string; rowVersion: number;
};
export type FixedAssetList = {
  items: FixedAsset[]; total: number; counts: Record<string, number>;
  kpis: { grossCost: number; accumulated: number; nbv: number; active: number; fullyDepreciated: number; branches: number; monthlyCharge: number; additionsFy: number };
  byCategory: { category: Ref; count: number; cost: number; nbv: number; method: string }[];
};
/** Depreciation by fiscal year: posted months are locked, the current year pending, later years projected. */
export type AssetScheduleRow = { fiscalYear: string; openingNbv: number; months: number; monthsPosted: number; depreciation: number; accumulated: number; closingNbv: number; status: 'LOCKED' | 'PENDING' | 'PROJECTED' };
export type AssetDetail = FixedAsset & {
  schedule: AssetScheduleRow[];
  transfers: AssetTransfer[];
  disposal: { id: string; docNo: string; status: string; disposalDate: string } | null;
  runs: { runId: string; docNo: string; period: string; charge: number; status: string }[];
};

// ---------------------------------------------------------------- transfers
export const AssetTransferInputSchema = z.object({
  toBranchId: z.uuid('Choose the new location'),
  toCustodianEmployeeId: optionalId,
  effectiveDate: z.iso.date('Enter the effective date'),
  reason: optionalText(500),
});
export type AssetTransferInput = z.input<typeof AssetTransferInputSchema>;
export type AssetTransfer = {
  id: string; asset: { id: string; code: string; name: string }; fromBranch: Ref; toBranch: Ref; fromCustodian: Who; toCustodian: Who; effectiveDate: string;
  reason: string | null; status: string; requestedBy: Who; approvedBy: Who; approvedAt: string | null; completedAt: string | null; createdAt: string; rowVersion: number;
};

// ---------------------------------------------------------------- disposals
export const DISPOSAL_TYPES = ['SALE', 'SCRAPPED', 'WRITTEN_OFF', 'TRADE_IN'] as const;
export const AssetDisposalInputSchema = z.object({
  assetId: z.uuid('Choose the asset'),
  disposalType: z.enum(DISPOSAL_TYPES),
  disposalDate: z.iso.date('Enter the disposal date'),
  buyerName: optionalText(150),
  customerId: optionalId,
  proceeds: money.default(0),
  taxCodeId: optionalId,
  receiveIntoAccountId: optionalId,
  remarks: optionalText(500),
}).superRefine((d, ctx) => {
  if (d.disposalType === 'WRITTEN_OFF' && d.proceeds > 0) ctx.addIssue({ code: 'custom', path: ['proceeds'], message: 'A write-off has no proceeds' });
  if (d.proceeds > 0 && !d.receiveIntoAccountId) ctx.addIssue({ code: 'custom', path: ['receiveIntoAccountId'], message: 'Choose where the money is received' });
});
export type AssetDisposalInput = z.input<typeof AssetDisposalInputSchema>;
export const AssetDisposalUpdateSchema = z.intersection(AssetDisposalInputSchema, z.object({ rowVersion }));
export type AssetDisposal = {
  id: string; docNo: string; asset: { id: string; code: string; name: string; category: string }; disposalDate: string; disposalType: string; buyerName: string | null;
  customer: Ref | null; cost: number; accumulatedDepreciation: number; nbv: number; proceeds: number; taxCode: Ref | null; gstRate: number; gstAmount: number; gainLoss: number;
  receiveIntoAccount: Ref | null; status: string; submittedAt: string | null; approvedBy: Who; approvedAt: string | null; journal: VoucherRef; postedAt: string | null;
  remarks: string | null; createdBy: Who; createdAt: string; rowVersion: number;
};
export type AssetDisposalList = {
  items: AssetDisposal[]; total: number; counts: Record<string, number>;
  kpis: { count: number; posted: number; pending: number; draft: number; nbvDerecognised: number; costDerecognised: number; proceeds: number; netGain: number };
};

// ---------------------------------------------------------------- depreciation runs
export const DepreciationRunInputSchema = z.object({
  fiscalPeriodId: z.uuid('Choose the period'),
  postingDate: z.iso.date('Enter the posting date'),
  branchId: optionalId,
  categoryId: optionalId,
});
export type DepreciationRunInput = z.input<typeof DepreciationRunInputSchema>;
export type DepreciationRun = {
  id: string; docNo: string; period: { id: string; code: string; startDate: string; endDate: string; status: string }; postingDate: string; branch: Ref | null; category: Ref | null;
  status: string; assetsCount: number; skippedCount: number; totalDepreciation: number; nbvBefore: number; nbvAfter: number; computedAt: string | null; computedBy: Who;
  journal: VoucherRef; postedAt: string | null; postedBy: Who; createdAt: string; rowVersion: number;
  lines: { id: string; asset: { id: string; code: string; name: string }; category: Ref; branch: Ref; method: string; ratePct: number; months: number; openingNbv: number; charge: number; closingNbv: number }[];
  /** Journal the run posts: Dr depreciation expense / Cr accumulated depreciation, by account. */
  journalPreview: { account: Ref; debit: number; credit: number }[];
};
export type DepreciationRunList = { items: Omit<DepreciationRun, 'lines' | 'journalPreview'>[]; total: number };

export const AssetQuerySchema = z.object({
  status: z.string().optional(),
  category: z.uuid().optional(),
  branch: z.uuid().optional(),
  type: z.string().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});
export type AssetQuery = z.infer<typeof AssetQuerySchema>;
export const AssetReasonSchema = z.object({ rowVersion, reason: z.string().trim().min(3, 'Give a reason').max(500) });
export const AssetOptionalReasonSchema = z.object({ reason: optionalText(500) });
