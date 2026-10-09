import { z } from 'zod';
import type { EmpRef } from '../hr/attendance.ts';
import { optionalText } from '../treasury/common.ts';

/** Profile change requests (Phase 34, EmployeeSelfService.ProfileChangeRequests): the employee asks, HR approves and the value is applied. */
export const PROFILE_FIELD_KEYS = [
  'MARITAL_STATUS', 'BLOOD_GROUP', 'PERSONAL_EMAIL', 'MOBILE', 'HOME_ADDRESS', 'SALARY_BANK', 'ACCOUNT_NUMBER', 'IBAN', 'NTN_TAX_STATUS', 'ZAKAT_EXEMPTION', 'PHOTO',
] as const;
export type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number];
export const PROFILE_CHANGE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const;
export type ProfileChangeStatus = (typeof PROFILE_CHANGE_STATUSES)[number];

/** Allowed values of the coded fields (Lookups MaritalStatus / BloodGroup). */
export const MARITAL_STATUSES = ['SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
/** Fields whose value is masked until revealed. */
export const MASKED_FIELDS: readonly ProfileFieldKey[] = ['ACCOUNT_NUMBER', 'IBAN'];

const PATTERNS: Partial<Record<ProfileFieldKey, [RegExp, string]>> = {
  PERSONAL_EMAIL: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Enter a valid email address'],
  MOBILE: [/^03\d{9}$/, 'Use a mobile number like 03001234567'],
  IBAN: [/^PK\d{2}[A-Z]{4}[0-9A-Z]{16}$/, 'Use a 24-character Pakistani IBAN (PK + 22 characters)'],
  NTN_TAX_STATUS: [/^[0-9A-Z-]{7,15}$/, 'Enter the NTN (7–9 digits, optional check digit)'],
  ACCOUNT_NUMBER: [/^[0-9 -]{6,24}$/, 'Use digits only'],
  PHOTO: [/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Upload the photo first'],
};

/** Normalises and checks a requested value; returns the value to store or an error message. */
export function checkProfileValue(key: ProfileFieldKey, raw: string): { value: string } | { error: string } {
  let v = raw.trim();
  if (key === 'MOBILE') v = v.replace(/[\s-]/g, '');
  if (key === 'IBAN') v = v.replace(/\s/g, '').toUpperCase();
  if (key === 'PERSONAL_EMAIL') v = v.toLowerCase();
  if (key === 'NTN_TAX_STATUS') v = v.toUpperCase();
  if (!v) return { error: 'Enter the new value' };
  if (key === 'MARITAL_STATUS' && !(MARITAL_STATUSES as readonly string[]).includes(v)) return { error: 'Choose a marital status' };
  if (key === 'BLOOD_GROUP' && !(BLOOD_GROUPS as readonly string[]).includes(v)) return { error: 'Choose a blood group' };
  if (key === 'ZAKAT_EXEMPTION' && !['EXEMPT', 'NOT_EXEMPT'].includes(v)) return { error: 'Choose exempt or not exempt' };
  const p = PATTERNS[key];
  if (p && !p[0].test(v)) return { error: p[1] };
  if (v.length > 300) return { error: 'Up to 300 characters' };
  return { value: v };
}

export const ProfileChangeCreateSchema = z
  .object({
    fieldKey: z.enum(PROFILE_FIELD_KEYS, 'Choose the field to change'),
    requestedValue: z.string().max(300),
    reason: optionalText(500),
    proofAttachmentId: z.uuid().optional().nullable().transform((v) => v ?? null),
  })
  .transform((d, ctx) => {
    const r = checkProfileValue(d.fieldKey, d.requestedValue);
    if ('error' in r) {
      ctx.addIssue({ code: 'custom', path: ['requestedValue'], message: r.error });
      return z.NEVER;
    }
    return { ...d, requestedValue: r.value };
  });
export type ProfileChangeCreate = z.infer<typeof ProfileChangeCreateSchema>;

export const ProfileChangeApproveSchema = z.object({ comment: optionalText(500), rowVersion: z.coerce.number().int().min(0) });
export const ProfileChangeRejectSchema = z.object({ comment: z.string().trim().min(3, 'Say why the change is rejected').max(500), rowVersion: z.coerce.number().int().min(0) });
export type ProfileChangeApprove = z.infer<typeof ProfileChangeApproveSchema>;
export type ProfileChangeReject = z.infer<typeof ProfileChangeRejectSchema>;

export const ProfileChangeQuerySchema = z.object({
  status: z.enum([...PROFILE_CHANGE_STATUSES, 'ALL']).default('PENDING'),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ProfileChangeQuery = z.infer<typeof ProfileChangeQuerySchema>;

export type ProfileChangeRequest = {
  id: string;
  employee: EmpRef;
  fieldKey: ProfileFieldKey;
  fieldLabel: string;
  /** Masked for account number / IBAN in the employee's own list. */
  currentValue: string | null;
  requestedValue: string;
  reason: string | null;
  status: ProfileChangeStatus;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  appliedAt: string | null;
  rowVersion: number;
};
export type ProfileChangeList = { items: ProfileChangeRequest[]; total: number; counts: Record<string, number> };
/** Approve result: `applied` is false when the field has no record to write to (HR updates it by hand). */
export type ProfileChangeDecision = ProfileChangeRequest & { applied: boolean };

export type MyProfileField = {
  key: ProfileFieldKey;
  label: string;
  /** Display value (label of a coded value); null when not set. */
  value: string | null;
  /** The raw value for the change sheet. */
  raw: string | null;
  masked: boolean;
  pending: { id: string; requestedValue: string; createdAt: string; rowVersion: number } | null;
};
export type MyProfile = {
  employee: EmpRef & {
    status: string; joiningDate: string | null; manager: string | null; grade: string | null; employmentType: string | null;
    cnic: string | null; dateOfBirth: string | null; gender: string | null; guardianName: string | null; workEmail: string | null; shift: string | null;
    emergencyContactName: string | null; emergencyRelation: string | null; emergencyPhone: string | null;
  };
  fields: MyProfileField[];
  requests: ProfileChangeRequest[];
  /** Label of each coded value (marital status, blood group, zakat). */
  choices: Partial<Record<ProfileFieldKey, { code: string; label: string }[]>>;
};
