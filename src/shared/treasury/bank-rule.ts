import { z } from 'zod';
import { RowVersionSchema } from '../common/list-query.ts';
import { GlRefSchema } from './common.ts';

/** Operators allowed per condition field (BankRuleConditionField / BankRuleConditionOperator lookups). */
export const RULE_OPERATORS: Record<string, string[]> = {
  DESC: ['CONTAINS', 'STARTS_WITH', 'EQUALS'],
  REF: ['CONTAINS', 'STARTS_WITH', 'EQUALS'],
  AMT: ['LT', 'GT', 'EQUALS'],
  TYPE: ['IS'],
};

export const BankRuleConditionSchema = z.object({ id: z.string().optional(), seq: z.number().int(), field: z.string(), operator: z.string(), value: z.string() });
export type BankRuleCondition = z.infer<typeof BankRuleConditionSchema>;

export const BankRuleSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  priority: z.number().int(),
  matchMode: z.string(),
  bankAccount: z.object({ id: z.string(), name: z.string() }).nullable(),
  account: GlRefSchema,
  costCentre: z.object({ id: z.string(), code: z.string(), name: z.string() }).nullable(),
  autoPost: z.boolean(),
  isEnabled: z.boolean(),
  hitCount: z.number().int(),
  lastHitAt: z.string().nullable(),
  conditions: z.array(BankRuleConditionSchema),
  rowVersion: z.number().int(),
});
export type BankRule = z.infer<typeof BankRuleSchema>;

const ConditionSave = z
  .object({ field: z.string().min(1), operator: z.string().min(1), value: z.string().trim().min(1, 'Enter a value').max(120) })
  .superRefine((c, ctx) => {
    if (!(RULE_OPERATORS[c.field] ?? []).includes(c.operator)) ctx.addIssue({ code: 'custom', path: ['operator'], message: 'Not available for this field' });
    if (c.field === 'AMT' && !/^[0-9]+(\.[0-9]{1,2})?$/.test(c.value)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'An amount, e.g. 5000' });
    if (c.field === 'TYPE' && !['IN', 'OUT'].includes(c.value.toUpperCase())) ctx.addIssue({ code: 'custom', path: ['value'], message: 'IN or OUT' });
  })
  .transform((c) => ({ ...c, value: c.field === 'TYPE' ? c.value.toUpperCase() : c.value }));

/** POST / PATCH body: the whole rule (conditions are replaced as a list). Code is assigned (BR-NN) when blank. */
export const BankRuleSaveSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^BR-[0-9]{2,4}$/, 'Like BR-01').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  name: z.string().trim().min(2, 'Name the rule').max(120),
  matchMode: z.enum(['ALL', 'ANY']).default('ALL'),
  bankAccountId: z.uuid().optional().nullable().transform((v) => v ?? null),
  accountId: z.uuid('Choose the account'),
  costCentreId: z.uuid().optional().nullable().transform((v) => v ?? null),
  autoPost: z.boolean().default(true),
  isEnabled: z.boolean().default(true),
  conditions: z.array(ConditionSave).min(1, 'Add at least one condition').max(10),
});
export type BankRuleSave = z.infer<typeof BankRuleSaveSchema>;
export type BankRuleSaveFields = z.input<typeof BankRuleSaveSchema>;
export const BankRuleUpdateSchema = BankRuleSaveSchema.extend(RowVersionSchema.shape);
export type BankRuleUpdate = z.infer<typeof BankRuleUpdateSchema>;

export const BankRuleOrderSchema = z.object({ ids: z.array(z.uuid()).min(1) });

/** A statement line to test rules against (no statements are imported yet, so lines are pasted). */
export const SampleLineSchema = z.object({ description: z.string().max(300).default(''), reference: z.string().max(120).default(''), amount: z.coerce.number() });
export type SampleLine = z.infer<typeof SampleLineSchema>;
export const BankRuleTestSchema = z.object({
  lines: z.array(SampleLineSchema).min(1).max(200),
  /** An unsaved draft to test (the rule builder's live preview); omitted = test the saved rules. */
  draft: z.object({ matchMode: z.enum(['ALL', 'ANY']), conditions: z.array(ConditionSave).min(1) }).optional(),
});
export type BankRuleTest = z.infer<typeof BankRuleTestSchema>;
export type BankRuleTestResult = { lines: { index: number; matched: boolean; ruleId: string | null; ruleCode: string | null; ruleName: string | null }[]; matched: number };

/** Pure matcher (same rules the statement import will apply): case-insensitive text, absolute amounts, IN/OUT direction. */
export function ruleMatches(rule: { matchMode: string; conditions: { field: string; operator: string; value: string }[] }, line: SampleLine): boolean {
  const test = (c: { field: string; operator: string; value: string }) => {
    if (c.field === 'AMT') {
      const v = Math.abs(line.amount), n = Number(c.value);
      return c.operator === 'LT' ? v < n : c.operator === 'GT' ? v > n : v === n;
    }
    if (c.field === 'TYPE') return (line.amount < 0 ? 'OUT' : 'IN') === c.value.toUpperCase();
    const s = (c.field === 'REF' ? line.reference : line.description).toUpperCase(), v = c.value.toUpperCase();
    return c.operator === 'CONTAINS' ? s.includes(v) : c.operator === 'STARTS_WITH' ? s.startsWith(v) : s === v;
  };
  const results = rule.conditions.map(test);
  return rule.matchMode === 'ANY' ? results.some(Boolean) : results.every(Boolean);
}

