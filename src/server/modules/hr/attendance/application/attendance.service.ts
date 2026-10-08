import { Injectable } from '@nestjs/common';
import type { ManualAttendanceInput, MyAttendance, PunchInput, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { geofenceCheck, geofenceRefusal, nextDirection, processDays } from '../domain/attendance-rules.js';
import { AttendanceStore } from './attendance-store.js';

const locked = (month: string) => new ConflictError(`Attendance for ${month} is locked for payroll. Unlock the month first.`, undefined, { code: 'ATTENDANCE_DAY_LOCKED' });
const tzToday = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
/** The UTC instant of a local date + HH:MM in a time zone. */
function instant(tz: string, date: string, time: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const local = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(guess).replace(', ', 'T') + 'Z');
  return new Date(guess.getTime() - (local.getTime() - guess.getTime()));
}

/**
 * Attendance: punches (device / manual / self-service geo), the daily register built by the database from punches,
 * roster, holidays and approved leave and regularisation, and the monthly lock for payroll. The register is rebuilt
 * for the employee after every punch, and for a day or month on demand ("Process").
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly store: AttendanceStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  async today(user: SessionUser, q: { date?: string; branch?: string }) {
    const tz = await this.store.timezone(user.tenantId);
    return this.store.today(user.tenantId, q.date ?? tzToday(tz), tz, q.branch ?? null);
  }

  register(user: SessionUser, q: { month: string; search?: string; department?: string; branch?: string }) {
    return this.store.register(user.tenantId, q);
  }

  /** Builds the register for a day or for a month (days up to today). */
  async process(user: SessionUser, meta: RequestMeta, q: { date?: string; month?: string; employeeId?: string }) {
    const today = tzToday(await this.store.timezone(user.tenantId));
    const days = q.date ? [q.date] : processDays(q.month!, today);
    if (q.date && q.date > today) throw new ValidationError('Attendance can’t be processed for a future date.', { date: ['Not after today'] });
    if (!days.length) throw new ValidationError('That month hasn’t started yet.', { month: ['Not a future month'] });
    if (await this.store.monthLocked(user.tenantId, days[0]!)) throw locked(days[0]!.slice(0, 7));
    const written = await this.unitOfWork.run(actorContext(user, meta), async () => {
      let n = 0;
      for (const d of days) n += await this.store.build(user.tenantId, d, q.employeeId ?? null);
      return n;
    });
    return { written, days: days.length };
  }

  /** HR marks attendance by hand: punches with the reason, and a manual day for any status other than present. */
  async manual(user: SessionUser, meta: RequestMeta, input: ManualAttendanceInput) {
    const tz = await this.store.timezone(user.tenantId);
    if (input.date > tzToday(tz)) throw new ValidationError('Attendance can’t be marked for a future date.', { date: ['Not after today'] });
    if (await this.store.monthLocked(user.tenantId, input.date)) throw locked(input.date.slice(0, 7));
    const active = await this.store.activeEmployees(user.tenantId, input.employeeIds, input.date);
    const missing = input.employeeIds.filter((id) => !active.includes(id));
    if (missing.length) throw new ValidationError('Some employees weren’t working on that date.', { employeeIds: ['Choose employees employed on that date'] });
    const workMode = input.status === 'WFH' ? 'WFH' : input.status === 'ON_DUTY' ? 'FIELD' : 'OFFICE';
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const employeeId of input.employeeIds) {
        const base = { employeeId, source: 'MANUAL', manualReason: input.reason, workMode, locationLabel: input.locationLabel };
        const inAt = input.checkIn ? instant(tz, input.date, input.checkIn) : null;
        const outAt = input.checkOut ? instant(tz, input.date, input.checkOut) : null;
        if (inAt && input.status !== 'ABSENT') await this.store.addPunch({ ...base, punchAt: inAt.toISOString(), direction: 'IN' });
        if (outAt && input.status !== 'ABSENT') await this.store.addPunch({ ...base, punchAt: outAt.toISOString(), direction: 'OUT' });
        if (input.status === 'PRESENT') await this.store.build(user.tenantId, input.date, employeeId);
        else await this.store.manualDay(user.tenantId, { employeeId, date: input.date, status: input.status, firstIn: input.status === 'ABSENT' ? null : inAt, lastOut: input.status === 'ABSENT' ? null : outAt, reason: input.reason, locationLabel: input.locationLabel });
      }
    });
    return { marked: input.employeeIds.length };
  }

  async lock(user: SessionUser, meta: RequestMeta, month: string) {
    const today = tzToday(await this.store.timezone(user.tenantId));
    if (`${month}-01` > today) throw new ValidationError('A future month can’t be locked.', { month: ['Not a future month'] });
    if (await this.store.monthLocked(user.tenantId, `${month}-01`)) throw locked(month);
    return this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const d of processDays(month, today)) await this.store.build(user.tenantId, d, null);
      return { locked: await this.store.lock(`${month}-01`) };
    });
  }

  async unlock(user: SessionUser, meta: RequestMeta, month: string) {
    if (!(await this.store.monthLocked(user.tenantId, `${month}-01`))) throw new ConflictError(`Attendance for ${month} isn’t locked.`);
    return this.unitOfWork.run(actorContext(user, meta), async () => ({ unlocked: await this.store.unlock(`${month}-01`) }));
  }

  async day(user: SessionUser, id: string) {
    const d = await this.store.day(user.tenantId, id);
    if (!d) throw new NotFoundError('Attendance day not found');
    return d;
  }

  async waive(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string | null) {
    const d = await this.day(user, id);
    if (d.lockedAt) throw locked(d.date.slice(0, 7));
    if (d.status !== 'LATE') throw new ConflictError('Only a late day can have its late mark waived.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.waive(user.tenantId, id, rowVersion, user.id, reason ?? 'Late mark waived by HR'));
    return this.day(user, id);
  }

  // ---------------------------------------------------------------- my attendance
  async my(user: SessionUser, month?: string): Promise<MyAttendance> {
    const me = await this.me(user);
    const tz = await this.store.timezone(user.tenantId);
    const m = month ?? tzToday(tz).slice(0, 7);
    const base = await this.store.my(user.tenantId, me.id, m, tz);
    return { ...base, locked: await this.store.monthLocked(user.tenantId, base.today), approver: await this.store.managerName(user.tenantId, me.id) };
  }

  /** A self-service geo punch (Q30-4): the browser's location is checked against the branch geofence; selfies stay off. */
  async punch(user: SessionUser, meta: RequestMeta, input: PunchInput) {
    const me = await this.me(user);
    const tz = await this.store.timezone(user.tenantId);
    const today = tzToday(tz);
    const fence = await this.store.geofence(user.tenantId, me.id);
    const g = geofenceCheck(fence, input.latitude!, input.longitude!);
    const refusal = geofenceRefusal(input.workMode, g.inside, g.distanceM, fence?.radiusM ?? null);
    if (refusal) throw new ValidationError(refusal, { workMode: ['Outside the geofence'] });
    if (await this.store.monthLocked(user.tenantId, today)) throw locked(today.slice(0, 7));
    const mine = await this.store.my(user.tenantId, me.id, today.slice(0, 7), tz);
    const direction = input.direction === 'AUTO' ? nextDirection(mine.punches) : input.direction;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.addPunch({
        employeeId: me.id, punchAt: new Date().toISOString(), direction, source: 'ESS_GEO', workMode: input.workMode, verifyMode: null,
        latitude: input.latitude, longitude: input.longitude, geofenceDistanceM: g.distanceM, insideGeofence: g.inside, locationLabel: g.label,
      });
      await this.store.build(user.tenantId, today, me.id);
    });
    return this.my(user);
  }

  private async me(user: SessionUser) {
    const me = await this.store.employeeOf(user.tenantId, user.id);
    if (!me || me.status === 'EXITED') throw new ForbiddenError('Your user isn’t linked to an employee record, so attendance isn’t available. Ask HR to link it.');
    return me;
  }
}
