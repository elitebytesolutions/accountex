import { z } from 'zod';
import { optionalId } from '../parties/common.ts';
import { optionalText } from '../treasury/common.ts';
import type { Who } from './leave-request.ts';

/**
 * Phase 33: employee letters (HR/LTR/YYYY/NNNN), generated on the server as an English PDF from the company's HR
 * letter templates (Settings › Document templates) with merge fields, stored as an attachment and verifiable by code.
 */
export const EMPLOYEE_LETTER_TYPES = ['SALARY_CERTIFICATE', 'EXPERIENCE', 'EMPLOYMENT_VERIFICATION', 'NOC_TRAVEL', 'INCREMENT', 'PROMOTION', 'CONFIRMATION',
  'APPOINTMENT', 'OFFER', 'RELIEVING', 'WARNING'] as const;
/** The template kind each letter type is generated from (DocumentTemplates.letterKind); others use OTHER. */
export const EMPLOYEE_LETTER_KIND: Record<string, string> = {
  OFFER: 'OFFER', APPOINTMENT: 'APPOINTMENT', EXPERIENCE: 'EXPERIENCE', SALARY_CERTIFICATE: 'SALARY_CERTIFICATE', RELIEVING: 'RELIEVING',
};
/** Merge fields the letter renderer fills in (template bodyHtml). */
export const EMPLOYEE_LETTER_FIELDS = ['{{letter.date}}', '{{letter.number}}', '{{letter.addressedTo}}', '{{company.name}}', '{{company.address}}', '{{employee.name}}',
  '{{employee.code}}', '{{employee.cnic}}', '{{employee.designation}}', '{{employee.department}}', '{{employee.joiningDate}}', '{{employee.exitDate}}',
  '{{employee.noticeDays}}', '{{salary.gross}}', '{{salary.basic}}', '{{salary.statement}}', '{{signatory.name}}', '{{signatory.designation}}'] as const;

export type EmployeeLetterItem = {
  id: string; letterNo: string; letterType: string; letterDate: string; addressedTo: string | null; template: { id: string; name: string } | null;
  signatory: { id: string; name: string; designation: string | null } | null; includeSalary: boolean; status: string; verificationCode: string | null;
  pdf: { id: string; fileName: string; sizeBytes: number } | null; remarks: string | null; createdBy: Who | null; createdAt: string; rowVersion: number;
};
export type EmployeeLetterOptions = {
  templates: { id: string; name: string; letterKind: string; isDefault: boolean }[];
  signatories: { id: string; name: string; designation: string | null }[];
};
/** Public verification result (no sign-in): enough for a bank or employer to match the paper letter. */
export type EmployeeLetterVerification = {
  valid: boolean; status: string; letterNo: string; letterType: string; letterDate: string; company: string; employeeName: string; designation: string | null;
};

export const EmployeeLetterCreateSchema = z.object({
  letterType: z.enum(EMPLOYEE_LETTER_TYPES, 'Choose the letter'),
  docTemplateId: optionalId,
  addressedTo: optionalText(200),
  letterDate: z.iso.date('Use a date'),
  signatoryEmployeeId: optionalId,
  includeSalary: z.boolean().default(false),
  remarks: optionalText(300),
});
export type EmployeeLetterCreate = z.infer<typeof EmployeeLetterCreateSchema>;
export const EmployeeLetterVoidSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });
export const EmployeeLetterCodeSchema = z.string().trim().toUpperCase().regex(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/, 'Not a verification code');
