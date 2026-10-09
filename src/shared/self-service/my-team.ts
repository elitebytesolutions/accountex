/** My Profile › My Team (Phase 34): the line manager's view of their direct reports. */
export type TeamGroup = 'IN' | 'LATE' | 'ON_LEAVE' | 'OFF' | 'NOT_CHECKED_IN';

export type TeamTodayRow = {
  employeeId: string; code: string; name: string; designation: string | null; mobile: string | null; workEmail: string | null;
  group: TeamGroup; dayStatus: string | null; checkInAt: string | null; lateMinutes: number | null; locationLabel: string | null;
  leaveTypeCode: string | null; presence: { status: string; message: string | null } | null;
};

/** One day of leave / training on the team calendar (EmployeeSelfService.getMyTeamCalendar). */
export type TeamCalendarEntry = { employeeId: string; date: string; kind: 'LEAVE' | 'LEAVE_PENDING' | 'SICK' | 'TRAINING'; label: string | null; duration: string | null };

export type MyTeam = {
  /** null when the signed-in user has no employee record. */
  me: { id: string; name: string } | null;
  today: string;
  month: string;
  members: TeamTodayRow[];
  calendar: { people: { employeeId: string; name: string; weeklyOff: string | null }[]; entries: TeamCalendarEntry[] };
};
