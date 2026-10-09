import { Api } from './client.ts';
import type { Ctx } from './ctx.ts';
import { addDays, today } from './rng.ts';

/**
 * Shared HR helpers for tx-hr.ts / tx-payroll.ts.
 * State: ids.hrUsers = [{ employeeId, code, email, userId }] (employee logins created for self-service, password =
 * SHOWCASE_USER_PASSWORD); ids.hrTx = { exit: { employeeId, exitDate }, ... } (lifecycle facts later steps reuse).
 */
export type Emp = {
  id: string; code: string; name: string; branchId: string; branchCode: string; departmentCode: string; designation: string;
  gradeCode: string; managerId: string | null; userId: string | null; joinDate: string; basic: number; gender: string;
  isSalesman: boolean; isBooker: boolean; isDeliveryman: boolean; isSupervisor: boolean;
};

export const employees = (ctx: Ctx): Emp[] => ctx.state.ids.people.employees;
export const empByCode = (ctx: Ctx, code: string): Emp => employees(ctx).find((e) => e.code === code)!;

/** The resignation of the seed: Hamza Raza (HO accounts officer; not field staff, so routes are unaffected) resigns 2026-04-30, last day 2026-05-30. */
export const EXIT = { code: 'EMP-0006', resignedOn: '2026-04-30', exitDate: '2026-05-30' };

/** Is the employee on the payroll/attendance on that date (joined and not yet exited)? */
export const activeOn = (e: Emp, date: string) => e.joinDate <= date && !(e.code === EXIT.code && date > EXIT.exitDate);

/** Shift per employee (warehouse + delivery staff work the early WHE shift). */
export const shiftOf = (e: Emp) => (e.departmentCode === 'WH' || e.departmentCode === 'DIST' ? 'WHE' : 'GEN');

/** Self-service logins (non-field staff, so they don't clash with route users the trade seeder may create). Every login needs a job role (EMPLOYEE is added by the database); managers without one get the read-only Auditor role. */
export const ESS_USERS: { code: string; role: string }[] = [
  { code: 'EMP-0003', role: 'AUDITOR' },
  { code: 'EMP-0004', role: 'STOREKEEPER' },
  { code: 'EMP-0005', role: 'FINANCIAL_ACCOUNTANT' },
  { code: 'EMP-0007', role: 'HR_MANAGER' },
  { code: 'EMP-0008', role: 'AUDITOR' },
  { code: 'EMP-0016', role: 'AUDITOR' },
  { code: 'EMP-0017', role: 'FINANCIAL_ACCOUNTANT' },
  { code: 'EMP-0023', role: 'AUDITOR' },
];
export const essEmail = (e: Emp) => `${e.name.toLowerCase().replace(/[^a-z]+/g, '.')}@${process.env.SHOWCASE_TENANT_CODE ?? 'showcase'}.accountex.local`;

const sessions = new Map<string, Api>();
/** A signed-in session for an employee (admin / approver for the two linked managers, else their own ESS login). */
export async function as(ctx: Ctx, code: string): Promise<Api> {
  if (code === 'EMP-0001') return ctx.admin;
  if (code === 'EMP-0002') return ctx.approver;
  const cached = sessions.get(code);
  if (cached) return cached;
  const u = [...((ctx.state.ids.hrUsers as any[] | undefined) ?? []), ...((ctx.state.ids.hrLogins as any[] | undefined) ?? [])].find((x) => x.code === code);
  if (!u) throw new Error(`${code} has no login`);
  const api = new Api(ctx.admin.base, code);
  await api.login('/auth/login', { email: u.email, password: process.env.SHOWCASE_USER_PASSWORD, companyCode: process.env.SHOWCASE_TENANT_CODE ?? 'showcase' });
  sessions.set(code, api);
  return api;
}
export const hasLogin = (ctx: Ctx, code: string) => code === 'EMP-0001' || code === 'EMP-0002' || !!(ctx.state.ids.hrUsers as any[] | undefined)?.some((x) => x.code === code);

/** Public holidays (dates) from the holiday calendar. */
export async function holidayDates(ctx: Ctx): Promise<Set<string>> {
  const out = new Set<string>();
  for (const year of [2025, 2026]) {
    const list: any[] = await ctx.admin.get(`/hr/holidays?year=${year}`);
    for (const h of list) for (let d = h.fromDate; d <= h.toDate; d = addDays(d, 1)) out.add(d);
  }
  return out;
}

export const yesterday = () => addDays(today(), -1);

/** Every session that may hold an approval step: approver, admin, then each self-service login. */
export async function approvers(ctx: Ctx): Promise<Api[]> {
  const out = [ctx.approver, ctx.admin];
  for (const u of (ctx.state.ids.hrUsers as any[] | undefined) ?? []) out.push(await as(ctx, u.code));
  return out;
}

/**
 * Walks an approval chain: for each pending step, finds a session whose GET of `path` says it can act
 * (`approval.canAct`, `canAct` or `can.approve`) and calls `act` with it. Returns the final document (or null when no one can act).
 */
export async function walkApproval(ctx: Ctx, path: string, act: (api: Api) => Promise<unknown>, pending = (d: any) => d.approval?.status === 'PENDING'): Promise<any> {
  const list = await approvers(ctx);
  let doc: any = await ctx.admin.get(path);
  for (let step = 0; step < 6 && pending(doc); step++) {
    let acted = false;
    for (const api of list) {
      const view: any = await api.get(path).catch(() => null);
      if (!view || !(view.approval?.canAct || view.canAct || view.can?.approve)) continue;
      await act(api);
      acted = true;
      break;
    }
    if (!acted) return doc;
    doc = await ctx.admin.get(path);
  }
  return doc;
}

/** Job role for an employee's own login (EMPLOYEE is added by the database; managers get read-only Auditor). */
const roleFor = (e: Emp) => e.isSalesman ? 'SALESMAN' : e.isBooker ? 'ORDER_BOOKER' : e.isDeliveryman ? 'DELIVERYMAN' : e.departmentCode === 'WH' ? 'STOREKEEPER' : e.departmentCode === 'FIN' ? 'FINANCIAL_ACCOUNTANT' : 'AUDITOR';

/**
 * A session for any employee: reuses their linked login (the trade seeder creates route staff logins with the same
 * password) or creates one (name.surname@<company>.accountex.local) and links it. Recorded in ids.hrLogins.
 */
export async function ensureLogin(ctx: Ctx, code: string): Promise<Api> {
  try { return await as(ctx, code); } catch { /* no login yet */ }
  const e = empByCode(ctx, code);
  const d: any = await ctx.admin.get(`/hr/employees/${e.id}`);
  const users: any[] = await ctx.admin.all('/settings/users');
  let user = d.appUser ? users.find((u) => u.id === (d.appUser.id ?? d.appUser)) : null;
  if (!user) {
    const roles: any[] = await ctx.admin.all('/settings/roles');
    const email = essEmail(e);
    user = users.find((u) => u.email === email) ?? await ctx.admin.post('/settings/users', {
      fullName: e.name, email, jobTitle: e.designation, roleIds: [roles.find((r) => (r.systemKey ?? r.code) === roleFor(e))!.id], branchIds: [e.branchId],
      temporaryPassword: process.env.SHOWCASE_USER_PASSWORD, mustChangePassword: false,
    });
    if (!d.appUser) await ctx.admin.post(`/hr/employees/${e.id}/link-user`, { userId: user.id, rowVersion: d.rowVersion });
  }
  const list = (ctx.state.ids.hrLogins ??= []) as any[];
  if (!list.some((x) => x.code === code)) list.push({ employeeId: e.id, code, email: user.email, userId: user.id });
  ctx.save();
  return as(ctx, code);
}
