import type { EmpRef } from '../../../../../shared/index.js';
import type { MyPolicy, PolicyAcknowledgement } from '../../../../../shared/self-service/policy-ack.js';

export type PolicyRow = { id: string; code: string; title: string; version: string; status: string; requiresAcknowledgement: boolean; deletedAt: Date | null };
export type AckInsert = {
  policyDocumentId: string; employeeId: string; readToEnd: boolean; signatureText: string;
  ipAddress: string | null; userAgent: string | null; onboardingTaskId: string | null;
};

/** Port: policy acknowledgements (EmployeeSelfService.PolicyAcknowledgements) and the published policies they refer to. */
export abstract class PolicyAckStore {
  abstract employeeIdOfUser(tenantId: string, userId: string): Promise<string | null>;
  abstract employeeName(tenantId: string, employeeId: string): Promise<string | null>;
  /** The current published version of each policy, with my acknowledgement of it. */
  abstract myPolicies(tenantId: string, employeeId: string): Promise<MyPolicy[]>;
  abstract policy(tenantId: string, id: string): Promise<PolicyRow | null>;
  abstract acknowledgement(tenantId: string, policyId: string, employeeId: string): Promise<PolicyAcknowledgement | null>;
  /** My open onboarding's policy-acknowledgement task that is not done yet. */
  abstract openPolicyTask(tenantId: string, employeeId: string): Promise<string | null>;
  abstract insert(data: AckInsert): Promise<string>;
  abstract completeTask(taskId: string, note: string): Promise<void>;
  abstract acknowledgements(tenantId: string, policyId: string): Promise<PolicyAcknowledgement[]>;
  /** Active employees who have not acknowledged the policy version. */
  abstract pending(tenantId: string, policyId: string): Promise<EmpRef[]>;
  abstract directReports(tenantId: string, managerEmployeeId: string): Promise<EmpRef[]>;
  /** Published policies requiring acknowledgement, and which of the employees acknowledged each. */
  abstract requiredWithAcks(tenantId: string, employeeIds: string[]): Promise<{ policies: { id: string; code: string; title: string; version: string }[]; acked: Set<string> }>;
}
