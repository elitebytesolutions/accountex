import type { EmployeeLetterItem, EmployeeLetterOptions, EmployeeLetterVerification } from '../../../../../shared/index.js';

/** Everything a letter's merge fields need, read in one go. */
export type EmployeeLetterFacts = {
  company: { name: string; address: string | null; phone: string | null; email: string | null; ntn: string | null; accent: string | null };
  employee: { id: string; name: string; code: string; cnic: string | null; designation: string | null; department: string | null; joiningDate: string; exitDate: string | null; noticeDays: number; status: string };
  salary: { basic: number; gross: number } | null;
  signatory: { name: string; designation: string | null } | null;
  template: { id: string; name: string; bodyHtml: string } | null;
};

export abstract class EmployeeLetterStore {
  abstract employeeExists(tenantId: string, employeeId: string): Promise<boolean>;
  abstract list(tenantId: string, employeeId: string): Promise<EmployeeLetterItem[]>;
  abstract get(tenantId: string, id: string): Promise<EmployeeLetterItem & { employeeId: string } | null>;
  abstract options(tenantId: string): Promise<EmployeeLetterOptions>;
  /** The template (the chosen one, else the active default of the letter kind) and the merge facts. */
  abstract facts(tenantId: string, employeeId: string, input: { docTemplateId: string | null; letterKind: string; signatoryEmployeeId: string | null; asOf: string }): Promise<EmployeeLetterFacts>;
  abstract createDraft(data: Record<string, unknown>): Promise<{ id: string; letterNo: string; verificationCode: string }>;
  abstract issue(id: string, attachmentId: string): Promise<void>;
  abstract void(id: string, reason: string): Promise<void>;
  /** Public verification by code (any company; codes are random). */
  abstract verify(code: string): Promise<EmployeeLetterVerification | null>;
  /** The letter a PDF attachment belongs to. */
  abstract byAttachment(tenantId: string, attachmentId: string): Promise<{ employeeId: string } | null>;
  abstract employeeOfUser(tenantId: string, userId: string): Promise<string | null>;
}

