import type { TeamCalendarEntry, TeamTodayRow } from '../../../../../shared/self-service/my-team.js';

export abstract class MyTeamStore {
  abstract employeeOfUser(tenantId: string, userId: string): Promise<{ id: string; name: string } | null>;
  abstract today(tenantId: string): Promise<string>;
  /** Direct reports today (EmployeeSelfService.getMyTeamToday). */
  abstract members(tenantId: string, managerId: string): Promise<TeamTodayRow[]>;
  /** Me and my direct reports (the team calendar rows). */
  abstract people(tenantId: string, managerId: string): Promise<{ employeeId: string; name: string; weeklyOff: string | null }[]>;
  /** Leave and training days of the people in a date range (EmployeeSelfService.getMyTeamCalendar). */
  abstract calendar(tenantId: string, employeeIds: string[], from: string, to: string): Promise<TeamCalendarEntry[]>;
}
