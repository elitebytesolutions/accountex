import type { Delegation, DelegationSave, Workflow, WorkflowSave } from '../../../../../shared/index.js';

/** Port: approval workflows (with steps and conditions) and delegations. Writes run inside a UnitOfWork. */
export abstract class WorkflowStore {
  abstract list(tenantId: string): Promise<Workflow[]>;
  abstract get(tenantId: string, id: string): Promise<Workflow | null>;
  /** Insert or update (Company.approvalWorkflowAddUpdate); steps and conditions are replaced as a whole. */
  abstract save(data: WorkflowSave & { id?: string; rowVersion?: number }): Promise<string>;
  abstract setStatus(id: string, rowVersion: number, status: 'ACTIVE' | 'INACTIVE', publishedByUserId?: string): Promise<void>;
  abstract softDelete(id: string, rowVersion: number): Promise<void>;
  /** Of `roleIds` / `userIds`, the ones that exist in this company and can approve. */
  abstract validApprovers(tenantId: string, roleIds: string[], userIds: string[]): Promise<{ roleIds: string[]; userIds: string[] }>;

  /** Roles and active users that can be picked as approvers or delegates. */
  abstract approvers(tenantId: string): Promise<{ roles: { id: string; name: string }[]; users: { id: string; name: string }[] }>;

  abstract delegations(tenantId: string): Promise<Delegation[]>;
  abstract delegation(tenantId: string, id: string): Promise<Delegation | null>;
  abstract saveDelegation(data: DelegationSave & { id?: string; rowVersion?: number }): Promise<string>;
  abstract deleteDelegation(tenantId: string, id: string): Promise<void>;
}
