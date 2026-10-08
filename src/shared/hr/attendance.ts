import { z } from 'zod';
import { optionalText } from '../treasury/common.ts';

/** Phase 30: punches and the daily attendance register (HR › Attendance, My Profile › Attendance, My Day punch card). */
export type EmpRef = { id: string; code: string; name: string; department: string | null; designation: string | null; branch: string | null };

/** AttendanceDayStatus → register letter (the generated AttendanceRegister.registerCode). */
export const REGISTER_CODE: Record<string, string> = {
  PRESENT: 'P', WFH: 'P', ON_DUTY: 'P', ABSENT: 'A', LEAVE: 'L', HOLIDAY: 'H', WEEKLY_OFF: 'W', LATE: 'LT', HALF_DAY: 'HD',
};
/** Earth distance in metres between two points (haversine). */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6_371_000, rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(a)));
}
/** "Mon YYYY-MM" helpers: the first day of a month (YYYY-MM-01) and its days. */
export const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
export function monthDays(month: string): string[] {
  const [y, m] = month.slice(0, 7).split('-').map(Number) as [number, number];
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`);
}
/** Minutes as "8h 05m". */
export const hoursLabel = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;

export type RegisterDay = {
  id: string; employeeId: string; date: string; status: string; code: string; shift: { id: string; code: string; name: string; startTime: string; endTime: string } | null;
  firstIn: string | null; lastOut: string | null; lateMinutes: number; earlyLeaveMinutes: number; workedMinutes: number; overtimeMinutes: number;
  payableFraction: number; lateMarkWaived: boolean; isManual: boolean; manualReason: string | null; locationLabel: string | null; lockedAt: string | null;
  holiday: string | null; leaveType: string | null; requestDocNo: string | null; rowVersion: number;
};
export type PunchItem = {
  id: string; employee: EmpRef; punchAt: string; direction: string; source: string; workMode: string; device: string | null;
  locationLabel: string | null; insideGeofence: boolean | null; geofenceDistanceM: number | null; manualReason: string | null; isVoid: boolean;
};
export type AttendanceToday = {
  date: string; total: number; devices: number; lastSync: string | null;
  kpis: { present: number; absent: number; onLeave: number; late: number; wfh: number; notYetIn: number; avgLateMinutes: number; absentNoPunch: number };
  byDepartment: { department: string; total: number; in: number; onTime: number; late: number; leave: number; absent: number }[];
  late: { day: RegisterDay; employee: EmpRef; lateThisMonth: number }[];
  live: PunchItem[];
};
export type RegisterRow = {
  employee: EmpRef; days: Record<string, RegisterDay>;
  payable: number; present: number; absent: number; late: number; leave: number; manual: number;
};
export type AttendanceRegisterView = {
  month: string; days: string[]; workingDays: number; weeklyOffs: number; total: number;
  locked: { lockedAt: string; payrollRunId: string | null } | null;
  rows: RegisterRow[];
  kpis: { avgAttendance: number | null; absentDays: number; lateMarks: number; manualEntries: number };
};
export type AttendanceOptions = {
  employees: { id: string; code: string; name: string; department: string | null; branch: string | null }[];
  departments: { id: string; name: string }[];
  branches: { id: string; code: string; name: string }[];
  shifts: { id: string; code: string; name: string; startTime: string; endTime: string; colour: string; scheduledHours: number }[];
};

/** My Profile › Attendance and the My Day punch card. */
export type Geofence = { branch: string; latitude: number; longitude: number; radiusM: number } | null;
export type MyAttendanceDay = {
  date: string; status: string | null; code: string | null; firstIn: string | null; lastOut: string | null; workedMinutes: number; overtimeMinutes: number;
  lateMinutes: number; location: string | null; source: string | null; holiday: string | null; leave: string | null; pending: string | null; weeklyOff: boolean;
};
export type MyAttendance = {
  employee: EmpRef; today: string; timezone: string;
  shift: { code: string; name: string; startTime: string; endTime: string; graceMinutes: number; scheduledHours: number } | null;
  geofence: Geofence; punches: PunchItem[]; firstIn: string | null; lastOut: string | null; state: 'out' | 'in' | 'done'; locked: boolean;
  month: string; days: MyAttendanceDay[];
  stats: { onTimePct: number | null; present: number; workingDays: number; lateMarks: number; avgCheckIn: string | null; overtimeMinutes: number };
  last7: { date: string; minutes: number }[];
  approver: string | null;
};

// ---------------------------------------------------------------- inputs
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const optionalTime = time.optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
export const PunchSchema = z.object({
  direction: z.enum(['IN', 'OUT', 'AUTO']).default('AUTO'),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  workMode: z.enum(['OFFICE', 'WFH', 'FIELD']).default('OFFICE'),
}).superRefine((p, ctx) => {
  if ((p.latitude ?? null) === null || (p.longitude ?? null) === null) ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Allow location access: a check-in needs your latitude and longitude' });
});
export type PunchInput = z.infer<typeof PunchSchema>;

export const MANUAL_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'WFH', 'ON_DUTY'] as const;
export const ManualAttendanceSchema = z.object({
  employeeIds: z.array(z.uuid()).min(1, 'Choose at least one employee').max(100),
  date: z.iso.date('Use a date'),
  status: z.enum(MANUAL_STATUSES).default('PRESENT'),
  checkIn: optionalTime,
  checkOut: optionalTime,
  locationLabel: optionalText(120),
  reason: z.string().trim().min(3, 'Give the reason').max(500),
}).superRefine((m, ctx) => {
  if (m.status !== 'ABSENT' && !m.checkIn) ctx.addIssue({ code: 'custom', path: ['checkIn'], message: 'Give the check-in time' });
  if (m.checkIn && m.checkOut && m.checkOut <= m.checkIn) ctx.addIssue({ code: 'custom', path: ['checkOut'], message: 'Check-out must be after check-in' });
});
export type ManualAttendanceInput = z.infer<typeof ManualAttendanceSchema>;
export const ProcessSchema = z.object({ date: z.iso.date().optional(), month: z.string().regex(/^\d{4}-\d{2}$/).optional(), employeeId: z.uuid().optional() })
  .refine((p) => !!p.date !== !!p.month, { message: 'Give a date or a month', path: ['date'] });
export const MonthSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM') });
export const RegisterQuerySchema = MonthSchema.extend({ search: z.string().trim().max(100).optional(), department: z.uuid().optional(), branch: z.uuid().optional() });
export const TodayQuerySchema = z.object({ date: z.iso.date().optional(), branch: z.uuid().optional() });
export const WaiveSchema = z.object({ rowVersion: z.coerce.number().int().min(0), reason: optionalText(300) });

