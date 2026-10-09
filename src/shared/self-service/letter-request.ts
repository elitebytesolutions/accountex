import { z } from 'zod';
import { RowVersionSchema } from '../common/list-query.ts';
import { optionalDate, optionalId } from '../parties/common.ts';
import { optionalText } from '../treasury/common.ts';

/**
 * Phase 34: self-service letter requests (EmployeeSelfService.LetterRequests, RQ-). The employee asks from My Profile ›
 * Letters & Requests; HR reviews and issues the Phase 33 employee letter (PDF + verification code) or rejects.
 */
export const LETTER_REQUEST_TYPES = ['SALARY_CERTIFICATE', 'EXPERIENCE', 'NOC_VISA', 'BANK_LETTER', 'EMPLOYMENT_VERIFICATION'] as const;
export type LetterRequestType = (typeof LETTER_REQUEST_TYPES)[number];
export const LETTER_REQUEST_STAGES = ['SUBMITTED', 'HR_REVIEW', 'SIGNED', 'READY'] as const;
export const LETTER_REQUEST_STATUSES = ['OPEN', 'COMPLETED', 'REJECTED', 'WITHDRAWN'] as const;

export type LetterRequestItem = {
  id: string; docNo: string; docDate: string;
  employee: { id: string; code: string; name: string; department: string | null; designation: string | null };
  letterType: string; letterTypeLabel: string; addressedTo: string; purpose: string;
  travelCountry: string | null; travelFrom: string | null; travelTill: string | null;
  includeSalary: boolean; responsibilities: string | null; outputFormat: string; language: string;
  stage: string; status: string; rejectedReason: string | null; dueAt: string | null;
  signedBy: { id: string; name: string } | null; signedAt: string | null;
  referenceNo: string | null; verificationCode: string | null; pdfAttachmentId: string | null; hrLetterId: string | null;
  withdrawnAt: string | null; createdAt: string; rowVersion: number;
};
export type LetterTypeOption = { code: string; label: string };
export type MyLetterRequests = { items: LetterRequestItem[]; total: number; types: LetterTypeOption[] };
export type LetterRequestList = { items: LetterRequestItem[]; total: number; counts: Record<string, number> };

const base = {
  letterType: z.enum(LETTER_REQUEST_TYPES, 'Choose the letter'),
  addressedTo: z.string().trim().min(2, 'Who is the letter addressed to?').max(200),
  purpose: z.string().trim().min(2, 'Give the purpose').max(200),
  travelCountry: optionalText(80),
  travelFrom: optionalDate,
  travelTill: optionalDate,
  includeSalary: z.boolean().default(false),
  responsibilities: optionalText(1000),
  outputFormat: z.enum(['DIGITAL_PDF_QR', 'PRINTED_STAMPED']).default('DIGITAL_PDF_QR'),
  language: z.enum(['EN', 'UR']).default('EN'),
};
type Base = { letterType: string; travelCountry: string | null; travelFrom: string | null; travelTill: string | null };
const travelRule = (v: Base, ctx: z.RefinementCtx) => {
  if (v.letterType === 'NOC_VISA') {
    if (!v.travelCountry) ctx.addIssue({ code: 'custom', path: ['travelCountry'], message: 'Country is needed for a visa NOC' });
    if (!v.travelFrom) ctx.addIssue({ code: 'custom', path: ['travelFrom'], message: 'Travel dates are needed for a visa NOC' });
    if (!v.travelTill) ctx.addIssue({ code: 'custom', path: ['travelTill'], message: 'Travel dates are needed for a visa NOC' });
  }
  if (v.travelFrom && v.travelTill && v.travelTill < v.travelFrom) ctx.addIssue({ code: 'custom', path: ['travelTill'], message: 'Return is before departure' });
};
export const LetterRequestCreateSchema = z.object(base).superRefine(travelRule);
export type LetterRequestCreate = z.infer<typeof LetterRequestCreateSchema>;
export const LetterRequestUpdateSchema = z.object({ ...base, rowVersion: z.coerce.number().int().min(0) }).superRefine(travelRule);
export type LetterRequestUpdate = z.infer<typeof LetterRequestUpdateSchema>;

export const LetterRequestQuerySchema = z.object({
  status: z.enum([...LETTER_REQUEST_STATUSES, 'ALL']).default('OPEN'),
  search: z.string().trim().max(100).optional(),
});
export type LetterRequestQuery = z.infer<typeof LetterRequestQuerySchema>;
export const LetterRequestIssueSchema = RowVersionSchema.extend({ signatoryEmployeeId: optionalId });
export type LetterRequestIssue = z.infer<typeof LetterRequestIssueSchema>;
export const LetterRequestRejectSchema = RowVersionSchema.extend({ reason: z.string().trim().min(3, 'Give a reason').max(300) });
export type LetterRequestReject = z.infer<typeof LetterRequestRejectSchema>;
