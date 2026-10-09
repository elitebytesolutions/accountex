import { pool, soft, type Ctx, type Step } from './ctx.ts';
import { addDays, monthEnd, months, rngFor, today, workDays } from './rng.ts';
import { activeOn, as, walkApproval, employees, empByCode, ESS_USERS, essEmail, EXIT, hasLogin, holidayDates, shiftOf, yesterday, type Emp } from './tx-hr-common.ts';
import { steps as extraSteps } from './tx-hr-extra.ts';
import { payrollStep } from './tx-payroll.ts';

/**
 * HR activity, Apr 2025 → today: employee logins for self-service, confirmations, then month by month leave (HR on
 * behalf for the past; self-service requests for the coming weeks), attendance (manual register entries, grouped by
 * check-in/out time, then the month is processed so absences and late marks are built), and the resignation.
 * Each month's payroll run (tx-payroll.ts) follows that month's step; approving a regular run locks its attendance.
 * State: ids.hrUsers (see tx-hr-common.ts); ids.hrTx.leaves[month] = number of leave requests recorded.
 */

/** Employee logins for self-service (password = SHOWCASE_USER_PASSWORD), linked to their employee records. */
const users: Step = {
  name: 'tx.hr.users',
  async run(ctx) {
    const roles: any[] = await ctx.admin.all('/settings/roles');
    const existing: any[] = await ctx.admin.all('/settings/users');
    const out: any[] = [];
    for (const { code, role } of ESS_USERS) {
      const e = empByCode(ctx, code);
      const email = essEmail(e);
      let u = existing.find((x) => x.email === email);
      if (!u) {
        const roleId = roles.find((r) => (r.systemKey ?? r.code) === role)!.id;
        u = await ctx.admin.post('/settings/users', {
          fullName: e.name, email, jobTitle: e.designation, roleIds: [roleId], branchIds: [e.branchId],
          temporaryPassword: process.env.SHOWCASE_USER_PASSWORD, mustChangePassword: false,
        });
      }
      const detail: any = await ctx.admin.get(`/hr/employees/${e.id}`);
      if (!detail.appUser) await ctx.admin.post(`/hr/employees/${e.id}/link-user`, { userId: u.id, rowVersion: detail.rowVersion });
      e.userId = u.id;
      out.push({ employeeId: e.id, code, email, userId: u.id });
    }
    ctx.state.ids.hrUsers = out;
    ctx.save();
    ctx.log(`  ${out.length} employee logins`);
  },
};

/** Confirms every employee whose probation (3 months) ended before today. */
const confirmations: Step = {
  name: 'tx.hr.confirm',
  async run(ctx) {
    let n = 0;
    await pool(employees(ctx), 5, async (e) => {
      const d: any = await ctx.admin.get(`/hr/employees/${e.id}`);
      const due = d.confirmationDueOn ?? addDays(e.joinDate, 90);
      if (d.status !== 'PROBATION' || due > today()) return;
      await ctx.admin.post(`/hr/employees/${e.id}/confirm`, { confirmedOn: due, reason: 'Probation completed satisfactorily', rowVersion: d.rowVersion });
      n++;
    });
    ctx.log(`  ${n} employees confirmed`);
  },
};

// ---------------------------------------------------------------------------------------------------- leave
type LeaveTypeRef = { id: string; code: string };
const leaveType = (ctx: Ctx, code: string): LeaveTypeRef => (ctx.state.ids.people.leaveTypes as LeaveTypeRef[]).find((t) => t.code === code)!;
const REASONS: Record<string, string[]> = {
  AL: ['Family trip to Murree', 'Sister’s wedding', 'Visiting parents in hometown', 'Annual family vacation', 'Moving house'],
  CL: ['Personal errand', 'Child’s school meeting', 'Bank and NADRA work', 'Family function', 'Car repair'],
  SL: ['Fever and flu', 'Doctor’s appointment', 'Food poisoning', 'Dental treatment', 'Migraine'],
};

/** Leave planned for one month: [{ emp, type, from, to, duration }] (one per employee at most). */
function planLeave(ctx: Ctx, month: string, holidays: Set<string>) {
  const rng = rngFor(`leave:${month}`);
  const days = workDays(month).filter((d) => !holidays.has(d) && d < today());
  const plan: { emp: Emp; type: string; from: string; to: string; duration: 'FULL' | 'HALF_AM' | 'HALF_PM'; reason: string }[] = [];
  if (days.length < 5) return plan;
  for (const emp of employees(ctx)) {
    if (!rng.chance(0.28)) continue;
    const confirmed = addDays(emp.joinDate, 90) <= days[0]!;
    const type = confirmed && rng.chance(0.45) ? 'AL' : rng.chance(0.6) ? 'CL' : 'SL';
    const len = type === 'AL' ? rng.int(2, 4) : rng.int(1, 2);
    const start = rng.int(0, Math.max(0, days.length - len - 1));
    const span = days.slice(start, start + len);
    if (span.length < len || span.some((d) => !activeOn(emp, d))) continue;
    const half = type === 'CL' && len === 1 && rng.chance(0.25);
    plan.push({ emp, type, from: span[0]!, to: span[span.length - 1]!, duration: half ? 'HALF_PM' : 'FULL', reason: rng.pick(REASONS[type]!) });
  }
  return plan;
}

/** Monthly leave accrual (earned leave monthly; upfront types at the leave-year start). Already accrued is fine. */
async function accrue(ctx: Ctx, month: string) {
  try { await ctx.admin.post(`/hr/leave-balances/accrue?month=${month}`); }
  catch (e) { if ((e as any).code !== 'LEAVE_ALREADY_ACCRUED') throw e; }
}

/** Opening accruals for the leave year running when the history starts (Jul 2024 → Mar 2025). */
const openingAccruals: Step = {
  name: 'tx.hr.leave-opening',
  async run(ctx) {
    for (let m = '2024-07-01'; m < '2025-04-01'; m = addDays(monthEnd(m), 1)) await accrue(ctx, m.slice(0, 7));
    ctx.log('  leave accrued Jul 2024 – Mar 2025');
  },
};

// ---------------------------------------------------------------------------------------------------- attendance
type Mark = { checkIn: string; checkOut: string };
const pad = (n: number) => String(n).padStart(2, '0');
const at = (base: string, deltaMin: number) => { const [h, m] = base.split(':').map(Number); const t = h! * 60 + m! + deltaMin; return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; };

/** One employee's day: null = absent; otherwise check-in/out (late, half day and overtime by chance). */
function dayMark(emp: Emp, date: string, variants: { onTime: number[]; late: number; outs: number[] }): Mark | null {
  const r = rngFor(`att:${emp.code}:${date}`);
  const start = shiftOf(emp) === 'WHE' ? '07:00' : '09:00';
  const end = shiftOf(emp) === 'WHE' ? '16:00' : '18:00';
  const roll = r.next();
  if (roll < 0.025) return null; // absent
  if (roll < 0.045) return { checkIn: at(start, variants.onTime[0]!), checkOut: at(start, 200) }; // half day (< 4 h)
  const late = roll < 0.125;
  const checkIn = at(start, late ? variants.late : r.pick(variants.onTime));
  const overtime = (emp.departmentCode === 'WH' || emp.departmentCode === 'DIST' || emp.departmentCode === 'SAL') && r.chance(0.08);
  const checkOut = at(end, overtime ? 120 + (variants.outs[0]! % 30) : r.pick(variants.outs));
  return { checkIn, checkOut };
}

async function markMonth(ctx: Ctx, month: string, holidays: Set<string>, onLeave: Map<string, Set<string>>, halfDays: Map<string, Set<string>>) {
  const last = yesterday();
  const days = workDays(month).filter((d) => !holidays.has(d) && d <= last);
  // Days already punched (a re-run after a failure) are skipped, so punches are never doubled.
  const reg: any = await ctx.admin.get(`/hr/attendance/register?month=${month.slice(0, 7)}`);
  const punched = new Set<string>();
  for (const row of reg.rows) for (const [d, v] of Object.entries<any>(row.days)) if (v?.firstIn) punched.add(`${row.employee.id}|${d}`);
  let calls = 0;
  await pool(days, 4, async (date) => {
    const r = rngFor(`attday:${date}`);
    const variants = { onTime: [r.int(-12, -6), r.int(-5, 0), r.int(1, 12)], late: r.int(22, 48), outs: [r.int(2, 9), r.int(10, 25)] };
    const groups = new Map<string, string[]>();
    for (const emp of employees(ctx)) {
      if (!activeOn(emp, date) || onLeave.get(emp.id)?.has(date) || punched.has(`${emp.id}|${date}`)) continue;
      let m = dayMark(emp, date, variants);
      if (halfDays.get(emp.id)?.has(date)) m = { checkIn: at(shiftOf(emp) === 'WHE' ? '07:00' : '09:00', -4), checkOut: at(shiftOf(emp) === 'WHE' ? '07:00' : '09:00', 235) };
      if (!m) continue;
      const k = `${m.checkIn}|${m.checkOut}`;
      groups.set(k, [...(groups.get(k) ?? []), emp.id]);
    }
    for (const [k, ids] of groups) {
      const [checkIn, checkOut] = k.split('|');
      await ctx.admin.post('/hr/attendance/manual', { employeeIds: ids, date, status: 'PRESENT', checkIn, checkOut, reason: 'Entered from the daily attendance sheet' });
      calls++;
    }
  });
  // Build the month: absences, late marks, half days, leave and holidays.
  if (monthEnd(month) < today()) await ctx.admin.post(`/hr/attendance/process?month=${month.slice(0, 7)}`);
  else for (const d of workDays(month).filter((x) => x <= last)) await ctx.admin.post(`/hr/attendance/process?date=${d}`);
  return { days: days.length, calls };
}

/** Overtime claims for the month's longest overtime days (approved through the workflow; about one in six rejected). */
async function overtime(ctx: Ctx, month: string) {
  const reg: any = await ctx.admin.get(`/hr/attendance/register?month=${month.slice(0, 7)}`);
  const existing: any = await ctx.admin.get(`/hr/overtime-claims?month=${month.slice(0, 7)}`).catch(() => ({ items: [] }));
  if ((existing.items ?? existing).length) return 0;
  const local = (iso: string) => new Date(Date.parse(iso) + 5 * 3600_000).toISOString().slice(11, 16);
  const days: { emp: string; date: string; from: string; to: string }[] = [];
  for (const row of reg.rows) for (const [d, v] of Object.entries<any>(row.days)) {
    if ((v?.overtimeMinutes ?? 0) >= 60 && v.lastOut) days.push({ emp: row.employee.id, date: d, from: v.shift?.endTime ?? '18:00', to: local(v.lastOut) });
  }
  const r = rngFor(`ot:${month}`);
  const picked = r.sample(days, 5);
  for (const [i, p] of picked.entries()) {
    const c: any = await soft(ctx, `overtime ${p.date}`, () => ctx.admin.post('/hr/overtime-claims', {
      employeeId: p.emp, dateFrom: p.date, dayType: 'WEEKDAY', timeFrom: p.from, timeTo: p.to, reason: r.pick(['Month-end stock loading', 'Late delivery run to Sheikhupura', 'Unloading principal shipment', 'Stock count support', 'Route recovery visits']),
    }));
    if (!c) continue;
    const reject = i === 4 && r.chance(0.5);
    await walkApproval(ctx, `/hr/overtime-claims/${c.id}`, (api) => reject
      ? api.post(`/hr/overtime-claims/${c.id}/reject`, { reason: 'Overtime was not pre-approved by the supervisor' })
      : api.post(`/hr/overtime-claims/${c.id}/approve`, { comment: 'Verified with the gate register' }), (d) => d.status === 'PENDING');
  }
  return picked.length;
}

// ---------------------------------------------------------------------------------------------------- resignation
async function resignation(ctx: Ctx, month: string) {
  const e = empByCode(ctx, EXIT.code);
  const list: any = await ctx.admin.get('/hr/offboardings?status=ALL');
  let ob = (list.items ?? list).find((o: any) => (o.employee?.id ?? o.employeeId) === e.id);
  if (month === EXIT.resignedOn.slice(0, 8) + '01' && !ob) {
    ob = await ctx.admin.post('/hr/offboardings', {
      employeeId: e.id, exitType: 'RESIGNATION', resignationDate: EXIT.resignedOn, lastWorkingDay: EXIT.exitDate, noticeDaysRequired: 30, noticeDaysServed: 30,
      reasonCategory: 'BETTER_OPPORTUNITY', reasonDetail: 'Offered a senior accountant role at a bank', isVoluntary: true, remarks: 'Handover to Sana Iqbal',
    });
    ctx.log(`  resignation recorded: ${e.name}`);
  }
  if (month === EXIT.exitDate.slice(0, 8) + '01' && ob) {
    const full: any = await ctx.admin.get(`/hr/offboardings/${ob.id}`);
    if (['CLOSED', 'COMPLETED'].includes(full.status)) return;
    await soft(ctx, 'exit interview', async () => {
      const cur: any = await ctx.admin.get(`/hr/offboardings/${ob.id}`);
      await ctx.admin.put(`/hr/offboardings/${ob.id}/exit-interview`, {
        interviewDate: '2026-05-28', conductedByEmployeeId: empByCode(ctx, 'EMP-0002').id, primaryReason: 'BETTER_OPPORTUNITY', wouldRejoin: 'MAYBE',
        roleSatisfaction: 4, managerSatisfaction: 4, compensationFairness: 3, wouldRecommend: true,
        valuedMost: 'Supportive team and clear month-end routines.', shouldImprove: 'Salary bands for accounts staff.', eligibleForRehire: true, rowVersion: cur.rowVersion,
      });
    });
    const cur: any = await ctx.admin.get(`/hr/offboardings/${ob.id}`);
    for (const item of cur.clearance ?? cur.clearanceItems ?? []) {
      if (item.status && item.status !== 'PENDING') continue;
      await soft(ctx, `clearance ${item.area}`, () => ctx.admin.post(`/hr/offboardings/${ob.id}/clearance/${item.id}/clear`, { remarks: 'Cleared' }));
    }
    const fresh: any = await ctx.admin.get(`/hr/offboardings/${ob.id}`);
    await soft(ctx, 'offboarding complete', () => ctx.admin.post(`/hr/offboardings/${ob.id}/complete`, { rowVersion: fresh.rowVersion }));
    ctx.log(`  offboarding completed: ${e.name}`);
  }
}

// ---------------------------------------------------------------------------------------------------- month steps
function monthStep(month: string): Step {
  return {
    name: `tx.hr.month.${month.slice(0, 7)}`,
    async run(ctx) {
      const holidays = await holidayDates(ctx);
      const onLeave = new Map<string, Set<string>>();
      const halfDays = new Map<string, Set<string>>();
      await accrue(ctx, month.slice(0, 7));
      const plan = planLeave(ctx, month, holidays);
      let ok = 0;
      let failed = 0;
      await pool(plan, 4, async (p) => {
        // The admin is Usman Tariq himself (APPROVAL_SELF), so HR manager Ayesha records his leave.
        const hr = p.emp.code === 'EMP-0001' ? ctx.approver : ctx.admin;
        const r = await soft(ctx, `leave ${p.emp.code} ${p.from}`, () => hr.post('/hr/leave-requests', {
          employeeId: p.emp.id, leaveTypeId: leaveType(ctx, p.type).id, duration: p.duration, fromDate: p.from, toDate: p.to, reason: p.reason,
        }));
        if (!r) { failed++; return; }
        ok++;
        const target = p.duration === 'FULL' ? onLeave : halfDays;
        const set = target.get(p.emp.id) ?? new Set<string>();
        for (let d = p.from; d <= p.to; d = addDays(d, 1)) set.add(d);
        target.set(p.emp.id, set);
      });
      if (month.slice(0, 7) === EXIT.resignedOn.slice(0, 7)) await resignation(ctx, month);
      const att = await markMonth(ctx, month, holidays, onLeave, halfDays);
      if (month.slice(0, 7) === EXIT.exitDate.slice(0, 7)) await resignation(ctx, month);
      const ot = monthEnd(month) < today() ? await overtime(ctx, month) : 0;
      ctx.log(`  ${month.slice(0, 7)}: ${ok} leave (${failed} refused), ${att.days} days, ${att.calls} register entries, ${ot} overtime claims`);
    },
  };
}

/** Self-service leave for the coming weeks: some approved, some rejected, a few left pending for the approvals inbox. */
const upcomingLeave: Step = {
  name: 'tx.hr.leave-upcoming',
  async run(ctx) {
    const rng = rngFor('leave-upcoming');
    const holidays = await holidayDates(ctx);
    const ahead = (n: number) => { let d = today(); let k = 0; while (k < n) { d = addDays(d, 1); if (new Date(d + 'T00:00:00Z').getUTCDay() !== 0 && !holidays.has(d)) k++; } return d; };
    const people = (ctx.state.ids.hrUsers as any[]).map((u) => empByCode(ctx, u.code));
    let i = 0;
    for (const emp of people) {
      i++;
      const api = await as(ctx, emp.code);
      const type = i % 3 === 0 ? 'CL' : 'AL';
      const from = ahead(type === 'AL' ? 10 + i * 2 : 3 + i);
      const to = type === 'AL' ? ahead(10 + i * 2 + rng.int(1, 3)) : from;
      const req: any = await soft(ctx, `self-service leave ${emp.code}`, () => api.post('/me/leave-requests', {
        leaveTypeId: leaveType(ctx, type).id, duration: 'FULL', fromDate: from, toDate: to, reason: rng.pick(REASONS[type]!),
      }));
      if (!req) continue;
      const outcome = i % 4 === 1 ? 'pending' : i % 4 === 2 ? 'reject' : 'approve';
      if (outcome === 'pending') continue;
      // Walk the approval chain with whoever can act (line manager / HR / admin).
      for (let step = 0; step < 4; step++) {
        let acted = false;
        for (const who of [ctx.approver, ctx.admin]) {
          const cur: any = await who.get(`/hr/leave-requests/${req.id}`).catch(() => null);
          if (!cur || cur.status !== 'PENDING') { acted = true; break; }
          if (!cur.canAct) continue;
          if (outcome === 'reject') await who.post(`/hr/leave-requests/${req.id}/reject`, { reason: 'TEAM_OVERLAP', comment: 'Two others from the team are off that week; please pick other dates.', suggestAlternative: true });
          else await who.post(`/hr/leave-requests/${req.id}/approve`, { comment: 'Approved. Please arrange a handover.' });
          acted = true;
          break;
        }
        if (!acted) break;
        const cur: any = await ctx.admin.get(`/hr/leave-requests/${req.id}`);
        if (cur.status !== 'PENDING') break;
      }
    }
    ctx.log(`  self-service leave for ${people.length} employees`);
  },
};

export const steps: Step[] = [
  users, confirmations, openingAccruals,
  // Each month: leave + attendance, then that month's payroll (approving it locks the attendance).
  ...months().flatMap((m) => [monthStep(m), payrollStep(m)].filter((s): s is Step => !!s)),
  upcomingLeave, ...extraSteps,
];
export { hasLogin };
