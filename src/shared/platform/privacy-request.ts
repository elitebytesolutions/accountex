import { z } from 'zod';
import { optDate, optText } from './fields.ts';

/**
 * Phase 43: company privacy requests (Platform.PrivacyRequests): the Security & Privacy table. EXPORT produces a
 * per-company JSON file (downloadable 7 days); DELETE irreversibly anonymises the company's personal data, keeps the
 * financial records with names replaced, disables every login and closes the company (CHURNED). Both end with a
 * certificate. Steps: RECEIVED → VERIFIED → APPROVED → PROCESSING → DONE (or REJECTED); a deletion needs two
 * approvers, or one solo approval (typed company code + note) while one platform staff member exists.
 */
export const PRIVACY_TYPES = ['EXPORT', 'DELETE'] as const;
export const PRIVACY_STEPS = ['RECEIVED', 'VERIFIED', 'APPROVED', 'PROCESSING', 'DONE', 'REJECTED'] as const;
/** The statutory deadline (days from receipt). */
export const PRIVACY_SLA_DAYS = 30;

export type PrivacyErasureTable = { schema: string; table: string; columns: string[]; rows: number };
export type PrivacySummary = {
  kind: 'EXPORT' | 'DELETE'; tenantCode?: string; erasedAt?: string; tables?: PrivacyErasureTable[]; rowsTouched?: number; historyEntriesScrubbed?: number;
  sessionsRevoked?: number; companyStatus?: string; backupCode?: string; format?: string; sizeBytes?: number;
};
export type PrivacyRequest = {
  id: string; docNo: string; tenantId: string; tenantCode: string; tenantName: string; tenantStatus: string; requestType: string;
  requestedByName: string; requestedByRole: string | null; requesterEmail: string | null; receivedOn: string; dueOn: string;
  /** Days until dueOn (negative = overdue); null once done or rejected. */
  daysLeft: number | null; step: string; verifiedBy: string | null; verifiedAt: string | null;
  approver1: string | null; approved1At: string | null; approver2: string | null; approved2At: string | null; approvals: number;
  decisionNote: string | null; rejectedReason: string | null; rejectedAt: string | null; completedAt: string | null; certificateRef: string | null;
  exportStatus: string | null; exportLinkExpiresAt: string | null; exportAvailable: boolean; summary: PrivacySummary | null; rowVersion: number;
};
export type PrivacyRequestList = { items: PrivacyRequest[]; solo: boolean };
export type PrivacyCertificate = { request: PrivacyRequest; issuedAt: string; issuedBy: string };

export const PrivacyRequestCreateSchema = z.object({
  tenantId: z.uuid('Choose the company'),
  requestType: z.enum(PRIVACY_TYPES),
  requestedByName: z.string().trim().min(2, 'Who asked?').max(120),
  requestedByRole: optText(80),
  requesterEmail: z.preprocess((v) => (v === '' ? null : v), z.email('Use an email address').nullable().optional()),
  receivedOn: optDate.optional(),
});
export type PrivacyRequestCreate = z.infer<typeof PrivacyRequestCreateSchema>;

export const PrivacyApproveSchema = z.object({
  note: optText(1000),
  /** A deletion's approval: the company code, typed. */
  confirmCode: z.string().trim().max(20).optional(),
});
export type PrivacyApprove = z.infer<typeof PrivacyApproveSchema>;
export const PrivacyRejectSchema = z.object({ reason: z.string().trim().min(3, 'Tell the requester why').max(500) });
export type PrivacyReject = z.infer<typeof PrivacyRejectSchema>;
export const PrivacyFulfilSchema = z.object({ confirmCode: z.string().trim().max(20).optional() });
export type PrivacyFulfil = z.infer<typeof PrivacyFulfilSchema>;
