import { Injectable } from '@nestjs/common';
import type { TeamCalendarEntry, TeamGroup, TeamTodayRow } from '../../../../../shared/self-service/my-team.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { employeeName, employeeOfUser, tenantTimezone, todayIn } from '../../../hr/attendance/infrastructure/hr-refs.js';
import { MyTeamStore } from '../application/my-team-store.js';

type TodayRow = {
  employeeId: string; employeeCode: string; displayName: string | null; firstName: string; lastName: string | null; designation: string | null; mobile: string | null;
  workEmail: string | null; teamGroup: string; dayStatus: string | null; checkInAt: Date | null; lateMinutes: number | null; locationLabel: string | null;
  leaveTypeCode: string | null; presenceStatus: string | null; presenceMessage: string | null;
};

@Injectable()
export class PrismaMyTeamStore extends MyTeamStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async employeeOfUser(tenantId: string, userId: string) {
    const db = this.prisma.db();
    const e = await employeeOfUser(db, tenantId, userId);
    if (!e) return null;
    const full = await db.employees.findFirst({ where: { tenantId, id: e.id }, select: { id: true, displayName: true, firstName: true, lastName: true } });
    return full ? { id: full.id, name: employeeName(full) } : null;
  }

  async today(tenantId: string) {
    return todayIn(await tenantTimezone(this.prisma.db(), tenantId));
  }

  async members(tenantId: string, managerId: string): Promise<TeamTodayRow[]> {
    const rows = await this.prisma.db().$queryRaw<TodayRow[]>`
      select v."employeeId", v."employeeCode", v."displayName", e."firstName", e."lastName", v.designation, v.mobile, v."workEmail"::text as "workEmail",
             v."teamGroup", v."dayStatus", v."checkInAt", v."lateMinutes", v."locationLabel", v."leaveTypeCode", v."presenceStatus", v."presenceMessage"
        from "EmployeeSelfService"."getMyTeamToday" v
        join "HumanResources"."Employees" e on e."tenantId" = v."tenantId" and e.id = v."employeeId"
       where v."tenantId" = ${tenantId}::uuid and v."managerEmployeeId" = ${managerId}::uuid
       order by v."employeeCode"`;
    return rows.map((r) => ({
      employeeId: r.employeeId, code: r.employeeCode, name: employeeName(r), designation: r.designation, mobile: r.mobile, workEmail: r.workEmail,
      group: r.teamGroup as TeamGroup, dayStatus: r.dayStatus, checkInAt: r.checkInAt?.toISOString() ?? null, lateMinutes: r.lateMinutes,
      locationLabel: r.locationLabel, leaveTypeCode: r.leaveTypeCode, presence: r.presenceStatus ? { status: r.presenceStatus, message: r.presenceMessage } : null,
    }));
  }

  async people(tenantId: string, managerId: string) {
    const rows = await this.prisma.db().employees.findMany({
      where: { tenantId, deletedAt: null, status: { not: 'EXITED' }, OR: [{ id: managerId }, { reportingManagerId: managerId }] },
      select: { id: true, displayName: true, firstName: true, lastName: true, weeklyOff: true },
      orderBy: { code: 'asc' },
    });
    // me first, then my reports
    return rows
      .sort((a, b) => Number(b.id === managerId) - Number(a.id === managerId))
      .map((e) => ({ employeeId: e.id, name: employeeName(e), weeklyOff: e.weeklyOff }));
  }

  async calendar(tenantId: string, employeeIds: string[], from: string, to: string): Promise<TeamCalendarEntry[]> {
    if (!employeeIds.length) return [];
    const rows = await this.prisma.db().$queryRaw<{ employeeId: string; calDate: Date; entryKind: string; label: string | null; duration: string | null }[]>`
      select c."employeeId", c."calDate", c."entryKind", c.label, c.duration
        from "EmployeeSelfService"."getMyTeamCalendar" c
       where c."tenantId" = ${tenantId}::uuid and c."employeeId" = any(${employeeIds}::uuid[])
         and c."calDate" between ${from}::date and ${to}::date
       order by c."calDate"`;
    return rows.map((r) => ({
      employeeId: r.employeeId, date: r.calDate.toISOString().slice(0, 10), kind: r.entryKind as TeamCalendarEntry['kind'], label: r.label, duration: r.duration,
    }));
  }
}
