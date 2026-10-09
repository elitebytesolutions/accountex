import { z } from 'zod';
import type { EmpRef } from '../hr/attendance.ts';

/** Phase 34: employees acknowledge the published version of each company policy (EmployeeSelfService.PolicyAcknowledgements). */

/** A published policy as the employee reads it, with their acknowledgement of this version. */
export type MyPolicy = {
  id: string; code: string; title: string; version: string; category: string; effectiveDate: string;
  readMinutes: number | null; requiresAcknowledgement: boolean; body: string | null; attachmentId: string | null;
  owner: string | null;
  /** When I acknowledged this version (null = still to read). */
  acknowledgedAt: string | null;
  /** I acknowledged an earlier version of this policy (this one is a revision to re-read). */
  previousVersionAcknowledged: boolean;
};
export type MyPolicies = { employeeName: string | null; policies: MyPolicy[]; summary: { required: number; acknowledged: number } };

export const PolicyAcknowledgeSchema = z.object({
  readToEnd: z.boolean().default(false),
  signatureText: z.string('Type your full name to sign').trim().min(3, 'Type your full name to sign').max(120),
});
export type PolicyAcknowledge = z.infer<typeof PolicyAcknowledgeSchema>;

export type PolicyAcknowledgement = {
  id: string; policyId: string; employee: EmpRef; acknowledgedAt: string; readToEnd: boolean; signatureText: string | null;
};

/** HR › Policies › Acknowledgements of one policy version. */
export type PolicyAcknowledgementReport = {
  policy: { id: string; code: string; title: string; version: string; status: string; requiresAcknowledgement: boolean };
  acknowledged: PolicyAcknowledgement[];
  pending: EmpRef[];
  counts: { acknowledged: number; pending: number; total: number };
};

/** My Team: each direct report's acknowledgement of the published policies that require it. */
export type TeamPolicyStatus = {
  employee: EmpRef;
  required: number;
  acknowledged: number;
  missing: { policyId: string; code: string; title: string; version: string }[];
}[];
