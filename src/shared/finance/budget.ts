import { z } from 'zod';
import { optionalText } from '../treasury/common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const rowVersion = z.coerce.number().int().min(0);
type Ref = { id: string; code: string; name: string };
type Who = { id: string; name: string } | null;

export const BUDGET_TYPES = ['OPERATING', 'CAPITAL', 'DEPARTMENT', 'PROJECT'] as const;
export const BUDGET_SEEDS = ['BLANK', 'PRIOR_ACTUALS', 'PRIOR_BUDGET'] as const;

export type BudgetOptions = {
  fiscalYears: { id: string; code: string; startDate: string; endDate: string; status: string }[];
  accounts: (Ref & { accountClass: number })[];
  costCentres: Ref[];
  projects: Ref[];
  branches: Ref[];
  users: { id: string; name: string }[];
};

export const BudgetInputSchema = z.object({
  name: z.string().trim().min(2, 'Name the budget').max(120),
  fiscalYearId: z.uuid('Choose the fiscal year'),
  budgetType: z.enum(BUDGET_TYPES),
  department: optionalText(80),
  costCentreId: optionalId,
  projectId: optionalId,
  branchId: optionalId,
  ownerUserId: optionalId,
  seedFrom: z.enum(BUDGET_SEEDS).default('BLANK'),
  seedUpliftPct: z.coerce.number().min(-100).max(1000).optional().nullable().transform((v) => v ?? null),
  requiresCeoApproval: z.boolean().default(false),
}).superRefine((b, ctx) => {
  if (b.budgetType === 'PROJECT' && !b.projectId) ctx.addIssue({ code: 'custom', path: ['projectId'], message: 'Choose the project' });
  if (b.budgetType === 'DEPARTMENT' && !b.department && !b.costCentreId) ctx.addIssue({ code: 'custom', path: ['costCentreId'], message: 'Choose the department / cost centre' });
});
export type BudgetInput = z.input<typeof BudgetInputSchema>;

export const BudgetLineSchema = z.object({
  accountId: z.uuid('Choose the account'),
  costCentreId: optionalId,
  months: z.array(z.coerce.number().min(-100_000_000_000).max(100_000_000_000)).length(12, 'Twelve months'),
});
export const BudgetLinesSchema = z.object({ rowVersion, lines: z.array(BudgetLineSchema).max(1000) });
export type BudgetLinesInput = z.input<typeof BudgetLinesSchema>;

export type BudgetVersion = {
  id: string; versionNo: number; status: string; notes: string | null; approvedBy: Who; approvedAt: string | null; createdBy: Who; createdAt: string; rowVersion: number; total: number;
  lines: { id: string; account: Ref & { accountClass: number }; costCentre: Ref | null; months: number[]; total: number }[];
};
export type Budget = {
  id: string; code: string; name: string; fiscalYear: { id: string; code: string; startDate: string; endDate: string }; budgetType: string; department: string | null;
  costCentre: Ref | null; project: Ref | null; branch: Ref | null; owner: Who; seedFrom: string; seedUpliftPct: number | null; requiresCeoApproval: boolean; status: string;
  currentVersion: { id: string; versionNo: number; status: string } | null; amount: number; actualToDate: number; utilisedPct: number | null;
  approvedBy: Who; approvedAt: string | null; createdAt: string; rowVersion: number;
  versions: Omit<BudgetVersion, 'lines'>[];
};
export type BudgetDetail = Budget & { version: BudgetVersion | null };
export type BudgetList = { items: Budget[]; total: number; kpis: { revenue: number; costs: number; result: number; capexBudget: number; capexUtilised: number } };

/** Budget vs actual of one budget version over months [from..to] of its fiscal year (1 = first month). */
export type BudgetVariance = {
  budget: { id: string; code: string; name: string; fiscalYear: string }; version: { id: string; versionNo: number; status: string } | null;
  fromMonth: number; toMonth: number;
  months: { monthNo: number; label: string; budgetRevenue: number; actualRevenue: number; budgetCost: number; actualCost: number }[];
  accounts: { account: Ref & { accountClass: number }; kind: 'REVENUE' | 'COST'; budget: number; actual: number; variance: number; variancePct: number | null; utilisationPct: number | null }[];
  costCentres: { costCentre: Ref | null; budget: number; actual: number }[];
  totals: { budgetRevenue: number; actualRevenue: number; budgetCost: number; actualCost: number; budgetResult: number; actualResult: number; linesOver: number; linesTotal: number };
};

export const BudgetQuerySchema = z.object({
  fiscalYear: z.uuid().optional(),
  status: z.string().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type BudgetQuery = z.infer<typeof BudgetQuerySchema>;
export const BudgetVarianceQuerySchema = z.object({ version: z.uuid().optional(), from: z.coerce.number().int().min(1).max(12).default(1), to: z.coerce.number().int().min(1).max(12).default(12) });
