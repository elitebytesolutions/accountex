import type { CompanyPolicy, ListResult, TalentListQuery } from '../../../../../shared/index.js';

export abstract class PolicyStore {
  abstract page(tenantId: string, q: TalentListQuery): Promise<ListResult<CompanyPolicy>>;
  abstract get(tenantId: string, id: string): Promise<CompanyPolicy | null>;
  /** Every version of a policy code, deleted ones included (code + version stay unique). */
  abstract versions(tenantId: string, code: string): Promise<{ id: string; version: string; status: string; deleted: boolean }[]>;
  /** A live (not deleted, not exited) employee. */
  abstract activeEmployee(tenantId: string, id: string): Promise<boolean>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
