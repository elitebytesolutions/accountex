import { z } from 'zod';
import { ListQuerySchema, patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

const ref = z.object({ id: z.string(), code: z.string(), name: z.string() });
const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalNum = (min: number, max: number) => z.coerce.number().min(min).max(max).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v));
const optionalInt = (min: number, max: number) => z.coerce.number().int('Whole number').min(min, `${min} to ${max}`).max(max, `${min} to ${max}`).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v));
const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Like 09:00');
const optionalTime = time.optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));

// ---------------------------------------------------------------- departments
/** A department (HumanResources.Departments) in the hierarchy, with its head and headcount (active employees). */
export const DepartmentSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  parent: ref.nullable(),
  division: z.string().nullable(),
  head: z.object({ id: z.string(), name: z.string(), code: z.string() }).nullable(),
  costCentre: ref.nullable(),
  annualBudget: z.number().nullable(),
  isActive: z.boolean(),
  childCount: z.number().int(),
  designationCount: z.number().int(),
  positions: z.number().int(),
  headcount: z.number().int(),
  rowVersion: z.number().int(),
});
export type Department = z.infer<typeof DepartmentSchema>;
const DepartmentFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/, 'Like SAL or QA (2–10 letters or digits)'),
  name: z.string().trim().min(2, 'Name the department').max(80),
  description: optionalText(200),
  parentId: optionalId,
  division: z.string().trim().max(20).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  costCentreId: optionalId,
  headEmployeeId: optionalId,
  annualBudget: optionalNum(0, 100_000_000_000),
};
export const DepartmentCreateSchema = z.object(DepartmentFields);
export type DepartmentCreate = z.infer<typeof DepartmentCreateSchema>;
export const DepartmentUpdateSchema = patchFields(DepartmentFields).extend(RowVersionSchema.shape);
export type DepartmentUpdate = z.infer<typeof DepartmentUpdateSchema>;
export const DepartmentListQuerySchema = ListQuerySchema.extend({ pageSize: z.coerce.number().int().min(1).max(500).default(100) });
export type DepartmentListQuery = z.infer<typeof DepartmentListQuerySchema>;

/** Would making `newParent` the parent of `id` create a loop? `parentOf` maps each node to its parent. */
export function wouldCycle(parentOf: Map<string, string | null>, id: string, newParent: string | null): boolean {
  for (let p = newParent, hops = 0; p && hops < 1000; p = parentOf.get(p) ?? null, hops++) if (p === id) return true;
  return false;
}

// ---------------------------------------------------------------- grades
export const GradeSchema = z.object({
  id: z.string(),
  code: z.string(),
  levelRank: z.number().int(),
  levelName: z.string(),
  minSalary: z.number(),
  midSalary: z.number(),
  maxSalary: z.number(),
  isActive: z.boolean(),
  designationCount: z.number().int(),
  staff: z.number().int(),
  rowVersion: z.number().int(),
});
export type Grade = z.infer<typeof GradeSchema>;
const money = z.coerce.number().min(0, 'Not negative').max(100_000_000);
const GradeFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{1,3}-?[0-9]{1,2}$/, 'Like G-5'),
  levelRank: z.coerce.number().int('Whole number').min(1, '1 to 99').max(99, '1 to 99'),
  levelName: z.string().trim().min(2, 'Name the level').max(60),
  minSalary: money,
  midSalary: money,
  maxSalary: money,
};
const bandOk = (g: { minSalary?: number; midSalary?: number; maxSalary?: number }) =>
  g.minSalary === undefined || g.midSalary === undefined || g.maxSalary === undefined || (g.minSalary <= g.midSalary && g.midSalary <= g.maxSalary);
export const GradeCreateSchema = z.object(GradeFields).refine(bandOk, { path: ['midSalary'], message: 'Min ≤ mid ≤ max' });
export type GradeCreate = z.infer<typeof GradeCreateSchema>;
export const GradeUpdateSchema = patchFields(GradeFields).extend(RowVersionSchema.shape);
export type GradeUpdate = z.infer<typeof GradeUpdateSchema>;

// ---------------------------------------------------------------- designations
export const DesignationSchema = z.object({
  id: z.string(),
  title: z.string(),
  department: ref,
  grade: z.object({ id: z.string(), code: z.string(), name: z.string(), levelRank: z.number().int() }).nullable(),
  approvedPositions: z.number().int(),
  reportsTo: z.object({ id: z.string(), title: z.string() }).nullable(),
  filled: z.number().int(),
  isActive: z.boolean(),
  rowVersion: z.number().int(),
});
export type Designation = z.infer<typeof DesignationSchema>;
const DesignationFields = {
  title: z.string().trim().min(2, 'Enter the title').max(80),
  departmentId: z.uuid('Choose the department'),
  gradeId: optionalId,
  approvedPositions: z.coerce.number().int('Whole number').min(0, 'Not negative').max(10_000).default(1),
  reportsToDesignationId: optionalId,
};
export const DesignationCreateSchema = z.object(DesignationFields);
export type DesignationCreate = z.infer<typeof DesignationCreateSchema>;
export const DesignationUpdateSchema = patchFields(DesignationFields).extend(RowVersionSchema.shape);
export type DesignationUpdate = z.infer<typeof DesignationUpdateSchema>;

// ---------------------------------------------------------------- work shifts
export const ShiftSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  colour: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  crossesMidnight: z.boolean(),
  scheduledHours: z.number(),
  graceMinutes: z.number().int(),
  breakStart: z.string().nullable(),
  breakEnd: z.string().nullable(),
  fridayExtendedBreak: z.boolean(),
  fridayBreakEnd: z.string().nullable(),
  prayerBreakNote: z.string().nullable(),
  halfDayBelowHours: z.number().nullable(),
  lateMarksPerHalfDay: z.number().int().nullable(),
  overtimeAfterMinutes: z.number().int(),
  weeklyOff: z.string(),
  isDefault: z.boolean(),
  isSeasonal: z.boolean(),
  season: z.string().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  status: z.string(),
  employees: z.number().int(),
  rowVersion: z.number().int(),
});
export type Shift = z.infer<typeof ShiftSchema>;
const ShiftFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,6}$/, 'Like GEN (2–6 letters or digits)'),
  name: z.string().trim().min(2, 'Name the shift').max(60),
  description: optionalText(120),
  colour: z.string().trim().max(20).default('TEAL'),
  startTime: time,
  endTime: time,
  graceMinutes: z.coerce.number().int('Whole minutes').min(0, '0 to 240').max(240, '0 to 240').default(15),
  breakStart: optionalTime,
  breakEnd: optionalTime,
  fridayExtendedBreak: z.boolean().default(false),
  fridayBreakEnd: optionalTime,
  prayerBreakNote: optionalText(120),
  halfDayBelowHours: optionalNum(0.5, 24),
  lateMarksPerHalfDay: optionalInt(1, 31),
  overtimeAfterMinutes: z.coerce.number().int('Whole minutes').min(0, 'Not negative').max(1440).default(30),
  weeklyOff: z.string().trim().max(20).default('SUNDAY'),
  isSeasonal: z.boolean().default(false),
  season: z.string().trim().max(20).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  validFrom: optionalDate,
  validTo: optionalDate,
};
type ShiftShape = { startTime?: string; endTime?: string; breakStart?: string | null; breakEnd?: string | null; fridayExtendedBreak?: boolean; fridayBreakEnd?: string | null; isSeasonal?: boolean; season?: string | null; validFrom?: string | null; validTo?: string | null };
/** Same rules as the DB checks: start ≠ end, break start / end together, Friday break end only with an extended Friday break, seasonal ⇔ season, valid dates in order. */
export function shiftErrors(s: ShiftShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (s.startTime && s.endTime && s.startTime === s.endTime) e.endTime = 'Ends when it starts';
  if (!!s.breakStart !== !!s.breakEnd) e[s.breakStart ? 'breakEnd' : 'breakStart'] = 'Give both break times, or neither';
  if (s.fridayBreakEnd && !s.fridayExtendedBreak) e.fridayBreakEnd = 'Turn on the extended Friday break';
  if (s.isSeasonal && !s.season) e.season = 'Choose the season';
  if (!s.isSeasonal && s.season) e.season = 'Only seasonal shifts have a season';
  if (s.validFrom && s.validTo && s.validTo < s.validFrom) e.validTo = 'Ends before it starts';
  return e;
}
export const ShiftCreateSchema = z.object(ShiftFields).superRefine((s, ctx) => {
  for (const [path, message] of Object.entries(shiftErrors(s))) ctx.addIssue({ code: 'custom', path: [path], message });
});
export type ShiftCreate = z.infer<typeof ShiftCreateSchema>;
export const ShiftUpdateSchema = patchFields(ShiftFields).extend(RowVersionSchema.shape);
export type ShiftUpdate = z.infer<typeof ShiftUpdateSchema>;

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Hours from start to end (over midnight when the end is earlier), the shift's span as the DB computes scheduledHours. */
export const shiftSpanHours = (start: string, end: string) => { const d = mins(end) - mins(start); return Math.round(((d < 0 ? d + 1440 : d) / 60) * 100) / 100; };

// ---------------------------------------------------------------- holidays
export const HolidaySchema = z.object({
  id: z.string(),
  name: z.string(),
  fromDate: z.string(),
  toDate: z.string(),
  days: z.number().int(),
  holidayType: z.string(),
  isMoonDependent: z.boolean(),
  hijriNote: z.string().nullable(),
  eligibilityNote: z.string().nullable(),
  appliesToAllBranches: z.boolean(),
  branches: z.array(z.object({ id: z.string(), name: z.string() })),
  status: z.string(),
  source: z.string(),
  notifyEss: z.boolean(),
  rowVersion: z.number().int(),
});
export type Holiday = z.infer<typeof HolidaySchema>;
export const HOLIDAY_STATUSES = ['UPCOMING', 'TENTATIVE', 'OBSERVED', 'CANCELLED'] as const;
const HolidayFields = {
  name: z.string().trim().min(2, 'Name the holiday').max(80),
  fromDate: z.iso.date('Use a date'),
  toDate: z.iso.date('Use a date'),
  holidayType: z.string().trim().min(1).max(20).default('PUBLIC'),
  isMoonDependent: z.boolean().default(false),
  hijriNote: optionalText(80),
  eligibilityNote: optionalText(120),
  appliesToAllBranches: z.boolean().default(true),
  branchIds: z.array(z.uuid()).max(200).default([]),
  status: z.enum(HOLIDAY_STATUSES).default('UPCOMING'),
  notifyEss: z.boolean().default(true),
};
type HolidayShape = { fromDate?: string; toDate?: string; isMoonDependent?: boolean; status?: string; appliesToAllBranches?: boolean; branchIds?: string[] };
/** Same as the DB checks: to ≥ from; tentative only when moon-dependent; a branch holiday names its branches. */
export function holidayErrors(h: HolidayShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (h.fromDate && h.toDate && h.toDate < h.fromDate) e.toDate = 'Ends before it starts';
  if (h.status === 'TENTATIVE' && !h.isMoonDependent) e.status = 'Only moon-dependent holidays are tentative';
  if (h.appliesToAllBranches === false && !(h.branchIds?.length)) e.branchIds = 'Choose the branches, or apply it to all';
  return e;
}
export const HolidayCreateSchema = z.object(HolidayFields).superRefine((h, ctx) => {
  for (const [path, message] of Object.entries(holidayErrors(h))) ctx.addIssue({ code: 'custom', path: [path], message });
});
export type HolidayCreate = z.infer<typeof HolidayCreateSchema>;
export const HolidayUpdateSchema = patchFields(HolidayFields).extend(RowVersionSchema.shape);
export type HolidayUpdate = z.infer<typeof HolidayUpdateSchema>;
export const HolidayStatusSchema = z.object({ status: z.enum(HOLIDAY_STATUSES), rowVersion: z.coerce.number().int().min(0) });
export const HolidayListQuerySchema = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional(), branch: z.uuid().optional() });
export type HolidayListQuery = z.infer<typeof HolidayListQuerySchema>;

// ---------------------------------------------------------------- org chart
export type OrgNode = { id: string; kind: 'DEPARTMENT' | 'DESIGNATION' | 'EMPLOYEE'; title: string; subtitle: string; badge: string | null; positions: number; filled: number; children: OrgNode[] };
export type OrgChart = { view: 'people' | 'departments' | 'positions'; roots: OrgNode[]; maxDepth: number; avgSpan: number; vacant: number; branches: { count: number; codes: string[] } };
export type HrFormOptions = {
  departments: { id: string; code: string; name: string; parentId: string | null; isActive: boolean }[];
  grades: { id: string; code: string; name: string; levelRank: number }[];
  designations: { id: string; title: string; departmentId: string }[];
  costCentres: { id: string; code: string; name: string }[];
  branches: { id: string; code: string; name: string; isHeadOffice: boolean; city: string | null }[];
  /** Current employees (department head select). */
  employees: { id: string; code: string; name: string }[];
};

// ---------------------------------------------------------------- branch HR settings
/** A branch with its HR settings (HumanResources.BranchHrSettings, created on first save). */
export type BranchHr = {
  id: string; code: string; name: string; isHeadOffice: boolean; city: string | null;
  settingId: string | null; rowVersion: number | null; socialSecurityScheme: string;
  manager: { id: string; code: string; name: string } | null; defaultShift: { id: string; name: string } | null; headcount: number; devices: number;
};
export const BranchHrSchema = z.object({
  managerEmployeeId: optionalId,
  defaultShiftId: optionalId,
  socialSecurityScheme: z.string().trim().max(20).default('NONE'),
  rowVersion: z.coerce.number().int().min(0).nullable().optional(),
});
export type BranchHrInput = z.infer<typeof BranchHrSchema>;
