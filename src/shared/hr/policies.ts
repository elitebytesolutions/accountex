import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalNum = (min: number, max: number, msg = `${min} to ${max}`) => z.coerce.number(msg).min(min, msg).max(max, msg).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v));
const optionalInt = (min: number, max: number) => z.coerce.number().int('Whole number').min(min, `${min} to ${max}`).max(max, `${min} to ${max}`).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v));
const optionalCode = z.string().trim().max(30).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const code = (d: string) => z.string().trim().max(30).default(d);

// ---------------------------------------------------------------- leave types
export const EMPLOYMENT_TYPES = ['PERMANENT', 'CONTRACT', 'PROBATION', 'INTERNSHIP', 'DAILY_WAGER'] as const;

export const LeaveRuleSchema = z.object({
  scope: z.enum(['BRANCH', 'GRADE']),
  branchId: optionalId,
  gradeId: optionalId,
  isIncluded: z.boolean().default(true),
  daysOverride: optionalNum(0, 366),
});
export type LeaveRuleInput = z.infer<typeof LeaveRuleSchema>;

/** A leave type (HumanResources.LeaveTypes) with its branch / grade overrides (LeaveEligibilityRules). */
export type LeaveType = {
  id: string; code: string; name: string; category: string; colour: string; isPaid: boolean; daysPerYear: number; unit: string;
  description: string | null; statuteNote: string | null;
  accrualMethod: string; accrualAmount: number | null; prorateNewJoiners: boolean;
  carryForwardMode: string; carryForwardMax: number | null; accumulationCap: number | null; carryExpiryMonths: number | null;
  encashmentMode: string; encashMaxDays: number | null; encashBasis: string | null; deductionBasis: string | null;
  sandwichRule: boolean; allowHalfDay: boolean; allowNegative: boolean; blockInPayrollLock: boolean;
  attachmentRequired: boolean; attachmentAfterDays: number | null; backdateDays: number | null; minNoticeDays: number | null;
  maxConsecutiveDays: number | null; maxPerMonth: number | null; maxTimesInService: number | null; applyWindowDays: number | null; compOffExpiryDays: number | null;
  gender: string; employmentTypes: string[]; availableAfter: string; probationRule: string; approvalWorkflow: string; hrApprovalAboveDays: number | null;
  sortOrder: number; status: string;
  rules: { id: string; scope: string; branch: { id: string; name: string } | null; grade: { id: string; code: string; name: string } | null; isIncluded: boolean; daysOverride: number | null }[];
  rowVersion: number;
};

const LeaveTypeFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}$/, 'Like AL (2–4 letters)'),
  name: z.string().trim().min(2, 'Name the leave type').max(60),
  category: code('OTHER'),
  colour: code('GREEN'),
  isPaid: z.boolean().default(true),
  daysPerYear: z.coerce.number('0 to 366').min(0, '0 to 366').max(366, '0 to 366').default(0),
  unit: code('DAYS'),
  description: optionalText(300),
  statuteNote: optionalText(120),
  accrualMethod: code('UPFRONT'),
  accrualAmount: optionalNum(0.01, 366, 'More than 0'),
  prorateNewJoiners: z.boolean().default(true),
  carryForwardMode: code('NONE'),
  carryForwardMax: optionalNum(0, 366),
  accumulationCap: optionalNum(0, 999),
  carryExpiryMonths: optionalInt(1, 120),
  encashmentMode: code('NOT_ALLOWED'),
  encashMaxDays: optionalNum(0, 366),
  encashBasis: optionalCode,
  deductionBasis: optionalCode,
  sandwichRule: z.boolean().default(false),
  allowHalfDay: z.boolean().default(true),
  allowNegative: z.boolean().default(false),
  blockInPayrollLock: z.boolean().default(false),
  attachmentRequired: z.boolean().default(false),
  attachmentAfterDays: optionalNum(0, 366),
  backdateDays: optionalInt(0, 365),
  minNoticeDays: optionalInt(0, 365),
  maxConsecutiveDays: optionalNum(0.5, 366, 'More than 0'),
  maxPerMonth: optionalNum(0.5, 31, 'More than 0'),
  maxTimesInService: optionalInt(1, 99),
  applyWindowDays: optionalInt(1, 365),
  compOffExpiryDays: optionalInt(1, 365),
  gender: code('ALL'),
  employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)).min(1, 'Choose at least one employment type').default(['PERMANENT', 'CONTRACT']),
  availableAfter: code('JOINING'),
  probationRule: code('ALLOWED'),
  approvalWorkflow: code('MANAGER_HR'),
  hrApprovalAboveDays: optionalNum(0, 366),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  rules: z.array(LeaveRuleSchema).max(200).optional(),
};
type LeaveShape = {
  isPaid?: boolean; accrualMethod?: string; accrualAmount?: number | null; carryForwardMode?: string; carryForwardMax?: number | null;
  encashmentMode?: string; encashBasis?: string | null; deductionBasis?: string | null; attachmentRequired?: boolean; attachmentAfterDays?: number | null;
  rules?: LeaveRuleInput[];
};
/** The DB checks on LeaveTypes / LeaveEligibilityRules, with field-level messages. */
export function leaveTypeErrors(t: LeaveShape): Record<string, string> {
  const e: Record<string, string> = {};
  if ((t.accrualMethod === 'MONTHLY' || t.accrualMethod === 'QUARTERLY') && t.accrualAmount == null) e.accrualAmount = 'Give the days accrued per period';
  if (t.carryForwardMode === 'CAPPED' && t.carryForwardMax == null) e.carryForwardMax = 'Give the carry-forward cap';
  if (t.encashmentMode && t.encashmentMode !== 'NOT_ALLOWED') {
    if (t.isPaid === false) e.encashmentMode = 'Unpaid leave can’t be encashed';
    else if (!t.encashBasis) e.encashBasis = 'Choose the encashment rate';
  }
  if (t.isPaid === false && !t.deductionBasis) e.deductionBasis = 'Choose how unpaid days are deducted';
  if (t.attachmentAfterDays != null && !t.attachmentRequired) e.attachmentAfterDays = 'Turn on “Require attachment”';
  t.rules?.forEach((r, i) => {
    if (r.scope === 'BRANCH' && !r.branchId) e[`rules.${i}`] = 'Choose the branch';
    if (r.scope === 'GRADE' && !r.gradeId) e[`rules.${i}`] = 'Choose the grade';
  });
  return e;
}
const issues = (fn: (x: never) => Record<string, string>) => (x: unknown, ctx: z.RefinementCtx) => {
  for (const [path, message] of Object.entries(fn(x as never))) ctx.addIssue({ code: 'custom', path: path.split('.'), message });
};
export const LeaveTypeCreateSchema = z.object(LeaveTypeFields).superRefine(issues(leaveTypeErrors));
export type LeaveTypeCreate = z.infer<typeof LeaveTypeCreateSchema>;
export const LeaveTypeUpdateSchema = patchFields(LeaveTypeFields).extend(RowVersionSchema.shape);
export type LeaveTypeUpdate = z.infer<typeof LeaveTypeUpdateSchema>;

// ---------------------------------------------------------------- overtime policy
export type OvertimePolicy = {
  id: string; name: string; statuteNote: string | null; weekdayMultiplier: number; weeklyOffMultiplier: number; holidayMultiplier: number;
  hourlyRateBasis: string; minMinutes: number; dailyCapHours: number | null; monthlyCapHours: number | null; rounding: string;
  eligibleUpToGrade: { id: string; code: string; name: string } | null; requiresPreApproval: boolean; allowCompOff: boolean;
  effectiveFrom: string; isActive: boolean; rowVersion: number;
};
const multiplier = z.coerce.number('1 to 5').min(1, 'At least 1×').max(5, 'At most 5×');
const OvertimeFields = {
  name: z.string().trim().min(2, 'Name the policy').max(60).default('Standard'),
  statuteNote: optionalText(120),
  weekdayMultiplier: multiplier.default(1.5),
  weeklyOffMultiplier: multiplier.default(2),
  holidayMultiplier: multiplier.default(2),
  hourlyRateBasis: code('GROSS_26_8'),
  minMinutes: z.coerce.number().int('Whole minutes').min(0, '0 to 480').max(480, '0 to 480').default(30),
  dailyCapHours: optionalNum(0.5, 24, '0.5 to 24'),
  monthlyCapHours: optionalNum(0.5, 400, '0.5 to 400'),
  rounding: code('NEAREST_30'),
  eligibleUpToGradeId: optionalId,
  requiresPreApproval: z.boolean().default(true),
  allowCompOff: z.boolean().default(true),
  effectiveFrom: z.iso.date('Use a date').optional(),
};
export function overtimeErrors(p: { dailyCapHours?: number | null; monthlyCapHours?: number | null }): Record<string, string> {
  return p.dailyCapHours != null && p.monthlyCapHours != null && p.dailyCapHours > p.monthlyCapHours ? { monthlyCapHours: 'At least the daily cap' } : {};
}
export const OvertimeCreateSchema = z.object(OvertimeFields).superRefine(issues(overtimeErrors));
export type OvertimeCreate = z.infer<typeof OvertimeCreateSchema>;
export const OvertimeUpdateSchema = patchFields(OvertimeFields).extend(RowVersionSchema.shape);
export type OvertimeUpdate = z.infer<typeof OvertimeUpdateSchema>;

// ---------------------------------------------------------------- biometric devices
export const SYNC_INTERVALS = [1, 5, 15, 30, 60] as const;
/** A biometric terminal. The comm key is write-only: the API only says whether one is set. */
export type Device = {
  id: string; code: string; locationLabel: string | null; brand: string; model: string; serialNo: string; branch: { id: string; code: string; name: string };
  connectionType: string; ipAddress: string | null; port: number; hasCommKey: boolean; timezone: string; punchDirection: string; syncIntervalMin: number;
  firmwareVersion: string | null; status: string; lastHeartbeatAt: string | null; lastSyncAt: string | null;
  usersEnrolled: number; facesEnrolled: number; fingersEnrolled: number; isActive: boolean; rowVersion: number;
};
export type DeviceSyncLog = { id: string; device: string | null; occurredAt: string; operation: string; records: number | null; durationMs: number | null; result: string; message: string | null };
const ipv4 = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$/;
const DeviceFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Like ZK-LHR-01'),
  locationLabel: optionalText(60),
  brand: code('ZKTECO'),
  model: z.string().trim().min(1, 'Enter the model').max(60),
  serialNo: z.string().trim().min(3, 'Enter the serial number').max(40),
  branchId: z.uuid('Choose the branch'),
  connectionType: code('ADMS_PUSH'),
  ipAddress: z.string().trim().regex(ipv4, 'Like 192.168.10.21').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  port: z.coerce.number().int('Whole number').min(1, '1 to 65535').max(65535, '1 to 65535').default(4370),
  /** Empty keeps the current key; null clears it. */
  commKey: z.string().max(64).optional().nullable(),
  timezone: z.string().trim().max(40).default('Asia/Karachi'),
  punchDirection: code('AUTO'),
  syncIntervalMin: z.coerce.number().refine((n) => (SYNC_INTERVALS as readonly number[]).includes(n), '1, 5, 15, 30 or 60 minutes').default(5),
  firmwareVersion: optionalText(40),
};
export function deviceErrors(d: { connectionType?: string; ipAddress?: string | null }): Record<string, string> {
  return d.connectionType === 'TCP_PULL' && !d.ipAddress ? { ipAddress: 'TCP pull needs the device IP' } : {};
}
export const DeviceCreateSchema = z.object(DeviceFields).superRefine(issues(deviceErrors));
export type DeviceCreate = z.infer<typeof DeviceCreateSchema>;
export const DeviceUpdateSchema = patchFields(DeviceFields).extend(RowVersionSchema.shape);
export type DeviceUpdate = z.infer<typeof DeviceUpdateSchema>;
