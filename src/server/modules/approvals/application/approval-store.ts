import type { EngineAction, EngineWorkflow } from '../domain/engine.js';

export type ApprovalRow = {
  id: string; workflowId: string; entityType: string; entityId: string; docLabel: string; title: string | null; amount: number | null; currencyCode: string;
  branchId: string | null; requestedByUserId: string; requestedAt: Date; currentStepNo: number | null; currentStepDueAt: Date | null; status: string; completedAt: Date | null; rowVersion: number;
};
export type ActionRow = EngineAction & { id: string; requestId: string; reason: string | null; comment: string | null };

export abstract class ApprovalStore {
  abstract workflows(tenantId: string, subject: string): Promise<EngineWorkflow[]>;
  abstract workflow(tenantId: string, id: string): Promise<EngineWorkflow | null>;
  /** Active users holding a role. */
  /** The company's default user, who holds every role (Platform.Tenants.defaultUserId). */
  abstract defaultUserId(tenantId: string): Promise<string | null>;
  abstract roleMembers(tenantId: string, roleIds: string[]): Promise<{ roleId: string; userId: string }[]>;
  /** The requester's line manager's login (Users.employeeId → reporting manager → their linked user). */
  abstract lineManagerUser(tenantId: string, userId: string): Promise<string | null>;
  /** Active delegations today: approver (from) → delegate (to), for this subject or all subjects. */
  abstract delegations(tenantId: string, subject: string): Promise<{ fromUserId: string; toUserId: string }[]>;
  abstract names(tenantId: string, userIds: string[]): Promise<Map<string, string>>;
  /** Active users of the company (delegation picker). */
  abstract activeUsers(tenantId: string): Promise<{ id: string; name: string }[]>;
  abstract request(tenantId: string, id: string): Promise<ApprovalRow | null>;
  /** The latest request for a document (any status). */
  abstract requestFor(tenantId: string, entityType: string, entityId: string): Promise<ApprovalRow | null>;
  abstract pending(tenantId: string): Promise<ApprovalRow[]>;
  abstract requestedBy(tenantId: string, userId: string): Promise<ApprovalRow[]>;
  abstract actions(tenantId: string, requestIds: string[]): Promise<ActionRow[]>;
  abstract approvedTodayBy(tenantId: string, userId: string): Promise<number>;
  abstract create(tenantId: string, row: Omit<ApprovalRow, 'id' | 'rowVersion' | 'requestedAt' | 'completedAt' | 'status'>): Promise<string>;
  abstract update(tenantId: string, id: string, rowVersion: number, data: { status?: string; currentStepNo?: number | null; currentStepDueAt?: Date | null; completedAt?: Date | null; amount?: number | null; title?: string | null; docLabel?: string }): Promise<void>;
  abstract addAction(tenantId: string, row: { requestId: string; stepNo: number; action: string; actorUserId: string | null; onBehalfOfUserId?: string | null; delegateToUserId?: string | null; reason?: string | null; comment?: string | null; isBulk?: boolean; ipAddress?: string | null }): Promise<void>;
}
