import { z } from 'zod';
import { ListQuerySchema, patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalCode = z.string().trim().max(30).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalEmail = z.email('Like name@company.pk').max(120).optional().nullable().or(z.literal('')).transform((v) => (v ? v.toLowerCase() : null));
const phone = z.string().trim().regex(/^\+?[0-9][0-9 -]{6,18}$/, 'Like +92 300 1234567');
const optionalPhone = phone.optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));

export const CNIC_PATTERN = /^\d{5}-\d{7}-\d$/;
export const IBAN_PATTERN = /^PK\d{2}[A-Z]{4}[0-9A-Z]{16}$/;
/** IBAN as stored: upper case, no spaces (PK36 MEZN 0002 … → PK36MEZN0002…). */
export const normaliseIban = (v: string) => v.replace(/\s+/g, '').toUpperCase();
/** IBAN as printed: groups of four. */
export const formatIban = (v: string) => v.replace(/(.{4})/g, '$1 ').trim();

type Ref = { id: string; code: string; name: string };

// ---------------------------------------------------------------- read models
export type EmployeeListItem = {
  id: string; code: string; name: string; designation: string; department: Ref; branch: Ref; joiningDate: string; employmentType: string;
  status: string; mobile: string; workEmail: string | null; personalEmail: string | null; cnic: string;
};
export type EmployeeKpis = { headcount: number; joinersThisMonth: number; exitsThisMonth: number; attrition: number | null; byStatus: Record<string, number> };
export type EmployeeList = { items: EmployeeListItem[]; total: number; kpis: EmployeeKpis };

export type EmployeeStatutory = {
  id: string | null; eobiApplicable: boolean; eobiNo: string | null; eobiRegisteredOn: string | null; socialSecurityApplicable: boolean; socialSecurityScheme: string | null;
  socialSecurityNo: string | null; ntn: string | null; atlStatus: string; pfApplicable: boolean; pfFromDate: string | null; groupInsurance: boolean; overtimeEligible: boolean;
};
export type EmployeeBank = {
  id: string; paymentMode: string; bank: { id: string; name: string } | null; bankName: string | null; branchName: string | null; accountTitle: string | null;
  iban: string | null; isPrimary: boolean; effectiveFrom: string; isActive: boolean;
};
export type EmployeeDocument = {
  id: string; category: string; title: string; issuedOn: string | null; expiresOn: string | null; isRequired: boolean; renewalFrequency: string | null;
  dueOn: string | null; status: string; remarks: string | null;
};
export type PositionEvent = {
  id: string; effectiveDate: string; eventType: string; reason: string | null; incrementPct: number | null;
  from: { department: string | null; designation: string | null; grade: string | null; branch: string | null; manager: string | null; employmentType: string | null; status: string | null };
  to: { department: string | null; designation: string | null; grade: string | null; branch: string | null; manager: string | null; employmentType: string | null; status: string | null };
};

/** One employee with everything the profile shows. */
export type Employee = {
  id: string; code: string; firstName: string; lastName: string; name: string; legalName: string | null; guardianName: string; guardianRelation: string;
  cnic: string; cnicIssueDate: string | null; cnicExpiryDate: string | null; dateOfBirth: string; gender: string; maritalStatus: string | null; childrenCount: number | null;
  religion: string | null; bloodGroup: string | null; nationality: string;
  mobile: string; personalEmail: string | null; workEmail: string | null; currentAddress: string | null; permanentAddress: string | null; city: string | null;
  emergencyContactName: string | null; emergencyRelation: string | null; emergencyPhone: string | null;
  emergencyAltName: string | null; emergencyAltRelation: string | null; emergencyAltPhone: string | null;
  department: Ref; designation: { id: string; title: string }; grade: (Ref & { minSalary: number; maxSalary: number }) | null;
  manager: { id: string; code: string; name: string; designation: string } | null; costCentre: Ref | null; branch: Ref;
  shift: { id: string; code: string; name: string; startTime: string; endTime: string; graceMinutes: number } | null;
  weeklyOff: string; payGroup: string; employmentType: string; workPattern: string; joiningDate: string; probationMonths: number;
  confirmationDueOn: string | null; confirmedOn: string | null; contractEndDate: string | null; noticeDays: number; biometricId: string | null;
  isBooker: boolean; isSalesman: boolean; isDeliveryman: boolean; isSupervisor: boolean;
  status: string; exitDate: string | null; exitType: string | null;
  appUser: { id: string; name: string; email: string } | null;
  statutory: EmployeeStatutory; bankAccounts: EmployeeBank[]; documents: EmployeeDocument[]; history: PositionEvent[];
  directReports: { id: string; code: string; name: string; designation: string }[];
  rowVersion: number;
};

export type EmployeeFormOptions = {
  nextCode: string | null;
  departments: { id: string; code: string; name: string }[];
  designations: { id: string; title: string; departmentId: string; gradeId: string | null }[];
  grades: { id: string; code: string; name: string }[];
  managers: { id: string; code: string; name: string; designation: string; departmentId: string }[];
  costCentres: Ref[];
  branches: Ref[];
  shifts: { id: string; code: string; name: string; startTime: string; endTime: string; isDefault: boolean; weeklyOff: string }[];
  banks: { id: string; name: string; ibanBankCode: string | null }[];
  users: { id: string; name: string; email: string }[];
};

// ---------------------------------------------------------------- writes
export const StatutorySchema = z.object({
  eobiApplicable: z.boolean().default(true),
  eobiNo: optionalText(40),
  eobiRegisteredOn: optionalDate,
  socialSecurityApplicable: z.boolean().default(true),
  socialSecurityScheme: optionalCode,
  socialSecurityNo: optionalText(40),
  ntn: z.string().trim().regex(/^\d{7}-?\d$/, 'Like 3520277-1').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  atlStatus: z.string().trim().max(20).default('NON_FILER'),
  pfApplicable: z.boolean().default(false),
  pfFromDate: optionalDate,
  groupInsurance: z.boolean().default(false),
  overtimeEligible: z.boolean().default(false),
});
export type StatutoryInput = z.infer<typeof StatutorySchema>;
export function statutoryErrors(s: Partial<StatutoryInput>): Record<string, string> {
  const e: Record<string, string> = {};
  if (s.socialSecurityNo && !s.socialSecurityScheme) e.socialSecurityScheme = 'Choose the scheme for this number';
  if (s.pfFromDate && !s.pfApplicable) e.pfFromDate = 'Turn on provident fund';
  return e;
}

export const EmployeeBankSchema = z.object({
  id: z.uuid().optional(),
  paymentMode: z.string().trim().max(20).default('BANK'),
  bankId: optionalId,
  bankName: optionalText(80),
  branchName: optionalText(80),
  accountTitle: optionalText(80),
  iban: z.string().transform(normaliseIban).pipe(z.string().regex(IBAN_PATTERN, 'Like PK36 MEZN 0002 1401 0567 8421')).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  isPrimary: z.boolean().default(true),
  effectiveFrom: z.iso.date('Use a date').optional(),
  isActive: z.boolean().default(true),
});
export type EmployeeBankInput = z.infer<typeof EmployeeBankSchema>;
export function employeeBankErrors(b: Partial<EmployeeBankInput>): Record<string, string> {
  const e: Record<string, string> = {};
  if ((b.paymentMode ?? 'BANK') === 'BANK') {
    if (!b.bankId && !b.bankName) e.bankId = 'Choose the bank';
    if (!b.accountTitle) e.accountTitle = 'Enter the account title';
    if (!b.iban) e.iban = 'Enter the IBAN';
  }
  return e;
}

export const DOCUMENT_STATUSES_NOW = ['PENDING', 'MISSING'] as const;
export const DocumentSchema = z.object({
  id: z.uuid().optional(),
  category: z.string().trim().min(1).max(30),
  title: z.string().trim().min(2, 'Name the document').max(120),
  issuedOn: optionalDate,
  expiresOn: optionalDate,
  isRequired: z.boolean().default(false),
  renewalFrequency: optionalCode,
  dueOn: optionalDate,
  /** Uploads arrive with file storage (Phase 35): until then a document is only Pending or Missing. */
  status: z.enum(DOCUMENT_STATUSES_NOW).default('PENDING'),
  remarks: optionalText(200),
});
export type DocumentInput = z.infer<typeof DocumentSchema>;

const PersonalFields = {
  firstName: z.string().trim().min(1, 'Enter the first name').max(60),
  lastName: z.string().trim().min(1, 'Enter the last name').max(60),
  legalName: optionalText(120),
  guardianName: z.string().trim().min(2, 'Enter the father / husband name').max(120),
  guardianRelation: z.string().trim().max(20).default('FATHER'),
  cnic: z.string().trim().regex(CNIC_PATTERN, 'Like 35202-1234567-1'),
  cnicIssueDate: optionalDate,
  cnicExpiryDate: optionalDate,
  dateOfBirth: z.iso.date('Use a date'),
  gender: z.string().trim().min(1, 'Choose the gender').max(20),
  maritalStatus: optionalCode,
  childrenCount: z.coerce.number().int('Whole number').min(0, 'Not negative').max(30).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  religion: optionalCode,
  bloodGroup: optionalCode,
  nationality: z.string().trim().max(30).default('PAKISTANI'),
  mobile: phone,
  personalEmail: optionalEmail,
  workEmail: optionalEmail,
  currentAddress: optionalText(200),
  permanentAddress: optionalText(200),
  city: optionalText(60),
  emergencyContactName: optionalText(80),
  emergencyRelation: optionalText(40),
  emergencyPhone: optionalPhone,
  emergencyAltName: optionalText(80),
  emergencyAltRelation: optionalText(40),
  emergencyAltPhone: optionalPhone,
};
/** Job fields edited freely (not position history). */
const TermsFields = {
  costCentreId: optionalId,
  shiftId: optionalId,
  weeklyOff: z.string().trim().max(20).default('SUNDAY'),
  payGroup: z.string().trim().max(20).default('STAFF'),
  workPattern: z.string().trim().max(20).default('FULL_TIME'),
  probationMonths: z.coerce.number().int('Whole months').min(0, '0 to 24').max(24, '0 to 24').default(3),
  confirmationDueOn: optionalDate,
  contractEndDate: optionalDate,
  noticeDays: z.coerce.number().int('Whole days').min(0, '0 to 365').max(365, '0 to 365').default(30),
  biometricId: z.string().trim().max(30).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  isBooker: z.boolean().default(false),
  isSalesman: z.boolean().default(false),
  isDeliveryman: z.boolean().default(false),
  isSupervisor: z.boolean().default(false),
};
/** Position fields: set on create, then changed only through a position change (kept as history). */
const PositionFields = {
  departmentId: z.uuid('Choose the department'),
  designationId: z.uuid('Choose the designation'),
  gradeId: optionalId,
  reportingManagerId: optionalId,
  branchId: z.uuid('Choose the branch'),
  employmentType: z.string().trim().min(1, 'Choose the employment type').max(20),
};

type DatesShape = { dateOfBirth?: string; joiningDate?: string; cnicIssueDate?: string | null; cnicExpiryDate?: string | null; confirmationDueOn?: string | null; contractEndDate?: string | null };
/** The DB date checks, with field messages. */
export function employeeErrors(e: DatesShape): Record<string, string> {
  const x: Record<string, string> = {};
  if (e.dateOfBirth && e.joiningDate && e.dateOfBirth >= e.joiningDate) x.dateOfBirth = 'Must be before the joining date';
  if (e.cnicIssueDate && e.cnicExpiryDate && e.cnicExpiryDate <= e.cnicIssueDate) x.cnicExpiryDate = 'Must be after the issue date';
  if (e.joiningDate && e.confirmationDueOn && e.confirmationDueOn < e.joiningDate) x.confirmationDueOn = 'Not before joining';
  if (e.joiningDate && e.contractEndDate && e.contractEndDate < e.joiningDate) x.contractEndDate = 'Not before joining';
  return x;
}
const issues = (fn: (x: never) => Record<string, string>) => (x: unknown, ctx: z.RefinementCtx) => {
  for (const [path, message] of Object.entries(fn(x as never))) ctx.addIssue({ code: 'custom', path: path.split('.'), message });
};

export const EmployeeCreateSchema = z.object({
  ...PersonalFields, ...TermsFields, ...PositionFields,
  joiningDate: z.iso.date('Use a date'),
  statutory: StatutorySchema.default(StatutorySchema.parse({})),
  bankAccount: EmployeeBankSchema.nullable().optional(),
  documents: z.array(DocumentSchema).max(50).default([]),
}).superRefine((e, ctx) => {
  issues(employeeErrors)(e, ctx);
  for (const [k, m] of Object.entries(statutoryErrors(e.statutory))) ctx.addIssue({ code: 'custom', path: ['statutory', k], message: m });
  if (e.bankAccount) for (const [k, m] of Object.entries(employeeBankErrors(e.bankAccount))) ctx.addIssue({ code: 'custom', path: ['bankAccount', k], message: m });
});
export type EmployeeCreate = z.infer<typeof EmployeeCreateSchema>;
/** Position fields are accepted only so a change to them can be refused with EMPLOYEE_USE_POSITION_CHANGE. */
export const EmployeeUpdateSchema = patchFields({ ...PersonalFields, ...TermsFields, joiningDate: z.iso.date('Use a date') }).extend({
  ...RowVersionSchema.shape,
  departmentId: z.string().optional(), designationId: z.string().optional(), gradeId: z.string().nullable().optional(),
  reportingManagerId: z.string().nullable().optional(), branchId: z.string().optional(), employmentType: z.string().optional(),
});
export type EmployeeUpdate = z.infer<typeof EmployeeUpdateSchema>;

export const POSITION_EVENTS = ['TRANSFER', 'PROMOTED', 'DEMOTED', 'DESIGNATION_CHANGE', 'GRADE_CHANGE', 'DEPARTMENT_CHANGE', 'MANAGER_CHANGE', 'EMPLOYMENT_TYPE_CHANGE'] as const;
export const PositionChangeSchema = z.object({
  eventType: z.enum(POSITION_EVENTS),
  effectiveDate: z.iso.date('Use a date'),
  departmentId: z.uuid().optional(),
  designationId: z.uuid().optional(),
  gradeId: optionalId.optional(),
  branchId: z.uuid().optional(),
  reportingManagerId: optionalId.optional(),
  employmentType: z.string().trim().max(20).optional(),
  reason: optionalText(300),
  rowVersion: z.coerce.number().int().min(0),
});
export type PositionChange = z.infer<typeof PositionChangeSchema>;
export const ConfirmSchema = z.object({ confirmedOn: z.iso.date('Use a date'), reason: optionalText(300), rowVersion: z.coerce.number().int().min(0) });
export const ExitSchema = z.object({ exitDate: z.iso.date('Use a date'), exitType: z.string().trim().min(1, 'Choose the exit type').max(20), reason: optionalText(300), rowVersion: z.coerce.number().int().min(0) });
export const RejoinSchema = z.object({ effectiveDate: z.iso.date('Use a date'), reason: optionalText(300), rowVersion: z.coerce.number().int().min(0) });
export const EMPLOYEE_SETTABLE_STATUSES = ['ACTIVE', 'ON_LEAVE', 'NOTICE_PERIOD'] as const;
export const StatusChangeSchema = z.object({ status: z.enum(EMPLOYEE_SETTABLE_STATUSES), effectiveDate: z.iso.date('Use a date'), reason: optionalText(300), rowVersion: z.coerce.number().int().min(0) });
export const LinkUserSchema = z.object({ userId: z.uuid().nullable(), rowVersion: z.coerce.number().int().min(0) });
export const BankAccountsSchema = z.object({ accounts: z.array(EmployeeBankSchema).max(10), rowVersion: z.coerce.number().int().min(0) }).superRefine((b, ctx) => {
  b.accounts.forEach((a, i) => { for (const [k, m] of Object.entries(employeeBankErrors(a))) ctx.addIssue({ code: 'custom', path: ['accounts', i, k], message: m }); });
  if (b.accounts.filter((a) => a.isPrimary && a.isActive).length > 1) ctx.addIssue({ code: 'custom', path: ['accounts'], message: 'Only one primary account' });
});
export const DocumentsSchema = z.object({ documents: z.array(DocumentSchema).max(50), rowVersion: z.coerce.number().int().min(0) });
export const StatutoryUpdateSchema = StatutorySchema.extend(RowVersionSchema.shape).superRefine(issues(statutoryErrors));

export const EmployeeListQuerySchema = ListQuerySchema.extend({
  department: z.uuid().optional(),
  branch: z.uuid().optional(),
  type: z.string().trim().max(20).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).default(12),
});
export type EmployeeListQuery = z.infer<typeof EmployeeListQuerySchema>;
