import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';

const money = z.coerce.number().min(0, 'Not negative').max(100_000_000_000);
const tag = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, 'Letters, digits, - and _');

export const CostCentreSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  branchId: z.string().nullable(),
  centreType: z.string(),
  annualBudget: z.number().nullable(),
  tags: z.array(z.string()),
  status: z.string(),
  rowVersion: z.number().int(),
});
export type CostCentre = z.infer<typeof CostCentreSchema>;

const CentreFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}-[0-9]{2,5}$/, 'Code like ADM-01'),
  name: z.string().trim().min(2, 'Name is required').max(80),
  parentId: z.uuid().optional().nullable().transform((v) => v ?? null),
  branchId: z.uuid().optional().nullable().transform((v) => v ?? null),
  centreType: z.string().min(1).default('DEPARTMENT'),
  annualBudget: money.optional().nullable().transform((v) => v ?? null),
  tags: z.array(tag).default([]),
};
export const CostCentreCreateSchema = z.object(CentreFields);
export type CostCentreCreate = z.infer<typeof CostCentreCreateSchema>;
export type CostCentreCreateFields = z.input<typeof CostCentreCreateSchema>;
export const CostCentreUpdateSchema = patchFields(CentreFields).extend(RowVersionSchema.shape);
export type CostCentreUpdate = z.infer<typeof CostCentreUpdateSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  budgetAmount: z.number(),
  expectedRevenue: z.number(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  colour: z.string(),
  status: z.string(),
  tags: z.array(z.string()),
  rowVersion: z.number().int(),
});
export type Project = z.infer<typeof ProjectSchema>;

const ProjectFields = z.object({
  code: z.string().trim().toUpperCase().regex(/^PRJ-[0-9]{2,4}$/, 'Code like PRJ-01'),
  name: z.string().trim().min(2, 'Name is required').max(120),
  budgetAmount: money.default(0),
  expectedRevenue: money.default(0),
  startDate: z.iso.date().optional().nullable().transform((v) => v ?? null),
  endDate: z.iso.date().optional().nullable().transform((v) => v ?? null),
  colour: z.string().min(1).default('blue'),
  status: z.string().min(1).default('PLANNING'),
  tags: z.array(tag).default([]),
});
const projectDates = <T extends z.ZodType<{ startDate?: string | null; endDate?: string | null }>>(s: T) =>
  s.refine((p) => !p.startDate || !p.endDate || p.endDate >= p.startDate, { path: ['endDate'], message: 'Ends on or after the start' });
export const ProjectCreateSchema = projectDates(ProjectFields);
export type ProjectCreate = z.infer<typeof ProjectCreateSchema>;
export type ProjectCreateFields = z.input<typeof ProjectCreateSchema>;
export const ProjectUpdateSchema = projectDates(patchFields(ProjectFields.shape).extend(RowVersionSchema.shape));
export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;

export const AllocationRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  accountId: z.string(),
  accountCode: z.string(),
  accountName: z.string(),
  basis: z.string(),
  tags: z.array(z.string()),
  status: z.string(),
  splits: z.array(z.object({ costCentreId: z.string(), percent: z.number() })),
  rowVersion: z.number().int(),
});
export type AllocationRule = z.infer<typeof AllocationRuleSchema>;

const RuleFields = z.object({
  name: z.string().trim().min(2, 'Name the rule').max(80),
  accountId: z.uuid('Choose the account to split'),
  basis: z.string().min(1),
  tags: z.array(tag).default([]),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  splits: z
    .array(z.object({ costCentreId: z.uuid(), percent: z.coerce.number().gt(0, 'More than 0').max(100) }))
    .min(1, 'Add at least one cost centre'),
});
const splitRules = <T extends z.ZodType<{ splits: { costCentreId: string; percent: number }[] }>>(s: T) =>
  s
    .refine((r) => Math.abs(r.splits.reduce((n, x) => n + x.percent, 0) - 100) < 0.0001, { path: ['splits'], message: 'Splits must total 100%' })
    .refine((r) => new Set(r.splits.map((x) => x.costCentreId)).size === r.splits.length, { path: ['splits'], message: 'Each cost centre once' });
export const AllocationRuleSaveSchema = splitRules(RuleFields);
export type AllocationRuleSave = z.infer<typeof AllocationRuleSaveSchema>;
export type AllocationRuleSaveFields = z.input<typeof AllocationRuleSaveSchema>;
export const AllocationRuleUpdateSchema = splitRules(RuleFields.extend(RowVersionSchema.shape));
export type AllocationRuleUpdate = z.infer<typeof AllocationRuleUpdateSchema>;
