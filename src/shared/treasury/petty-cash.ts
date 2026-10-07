import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';

/** One petty cash fund (BankCash.PettyCashFunds) with its cash account. */
export const PettyCashFundSchema = z.object({
  id: z.string(),
  name: z.string(),
  branch: z.object({ id: z.string(), name: z.string() }),
  cashAccount: z.object({ id: z.string(), code: z.string(), name: z.string() }),
  custodian: z.object({ id: z.string(), name: z.string() }).nullable(),
  imprestAmount: z.number(),
  lowPct: z.number(),
  criticalPct: z.number(),
  cycleStartedOn: z.string().nullable(),
  status: z.string(),
  /** Cash in the fund today (the cash account's balance; 0 until vouchers post). */
  balance: z.number(),
  rowVersion: z.number().int(),
});
export type PettyCashFund = z.infer<typeof PettyCashFundSchema>;

const pct = z.coerce.number().gt(0, 'More than 0').lt(100, 'Less than 100');
const FundFields = {
  name: z.string().trim().min(2, 'Name the fund').max(120),
  branchId: z.uuid('Choose the branch'),
  custodianUserId: z.uuid('Choose the custodian'),
  imprestAmount: z.coerce.number().gt(0, 'More than 0').max(100_000_000),
  lowPct: pct.default(25),
  criticalPct: pct.default(10),
};
/** Same as pettyCashFundPctChk. */
export function pettyFundErrors(f: { lowPct: number; criticalPct: number }): Record<string, string> {
  return f.criticalPct >= f.lowPct ? { criticalPct: 'Critical must be below the low level' } : {};
}

/** The fund's cash account: a new petty cash account (and GL account), or an existing petty / imprest account without a fund. */
export const FundAccountSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('create') }),
  z.object({ mode: z.literal('link'), cashAccountId: z.uuid('Choose the cash account') }),
]);

export const PettyCashFundCreateSchema = z.object({ ...FundFields, account: FundAccountSchema.default({ mode: 'create' }) }).superRefine((f, ctx) => {
  for (const [path, message] of Object.entries(pettyFundErrors(f))) ctx.addIssue({ code: 'custom', path: [path], message });
});
export type PettyCashFundCreate = z.infer<typeof PettyCashFundCreateSchema>;
export type PettyCashFundCreateFields = z.input<typeof PettyCashFundCreateSchema>;
export const PettyCashFundUpdateSchema = patchFields(FundFields).extend(RowVersionSchema.shape);
export type PettyCashFundUpdate = z.infer<typeof PettyCashFundUpdateSchema>;
