/** Lookups shared by the ledger seeding steps (accounts by code, branches, cost centres, cash / bank GL accounts). */
import type { Ctx } from './ctx.ts';
import { monthEnd, today } from './rng.ts';

export const C = (ctx: Ctx) => ctx.state.ids.company;
export const acct = (ctx: Ctx, code: string): string => {
  const id = C(ctx).accounts[code];
  if (!id) throw new Error(`No account ${code}`);
  return id;
};
export const br = (ctx: Ctx, code: string): string => (ctx.state.ids.branches as any[]).find((b) => b.code === code)!.id;
const BR_NO: Record<string, string> = { HO: '01', ISB: '02', KHI: '03' };
export const cc = (ctx: Ctx, kind: 'ADM' | 'DST' | 'SAL' | 'WHS' | 'FIN', branch: string): string | null =>
  (C(ctx).costCentres as any[]).find((c) => c.code === `${kind}-${kind === 'FIN' ? '01' : BR_NO[branch]}`)?.id ?? null;
/** GL account of a bank account by purpose. */
export const bank = (ctx: Ctx, purpose: 'PRIMARY' | 'COLLECTIONS' | 'PAYROLL'): string => (C(ctx).bankAccounts as any[]).find((b) => b.purpose === purpose)!.accountId;
/** BankAccounts.id by purpose (for APIs that take the bank account, not its GL account). */
export const bankAccountId = (ctx: Ctx, purpose: 'PRIMARY' | 'COLLECTIONS' | 'PAYROLL'): string => (C(ctx).bankAccounts as any[]).find((b) => b.purpose === purpose)!.id;
/** GL account of a branch's main cash drawer. */
export const cash = (ctx: Ctx, branch: string): string => (C(ctx).cashAccounts as any[]).find((c) => c.branchId === br(ctx, branch))!.accountId;
/** The bank a branch pays from: Karachi uses its HBL collections account, the others Meezan. */
export const branchBank = (ctx: Ctx, branch: string) => bank(ctx, branch === 'KHI' ? 'COLLECTIONS' : 'PRIMARY');
export const clampDate = (d: string) => (d > today() ? today() : d);
export const dayOf = (month: string, day: number) => clampDate(`${month.slice(0, 8)}${String(Math.min(day, Number(monthEnd(month).slice(8)))).padStart(2, '0')}`);
