import type { Branch, ListResult } from '../../../../../shared/index.js';

export type BranchListQuery = { search?: string; status?: string; page: number; pageSize: number; sort?: string };

/** Port: branch persistence. Every method is scoped to one tenant. Business rules are DB triggers (007-company-core.sql). */
export abstract class BranchStore {
  abstract list(tenantId: string, query: BranchListQuery): Promise<ListResult<Branch>>;
  abstract get(tenantId: string, id: string): Promise<Branch | null>;
  /** Insert (no id) or partial update (with id + rowVersion) through Company.branchAddUpdate. */
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract makeDefault(id: string): Promise<void>;
  /** Hard delete; the database refuses referenced branches (23503) and the default branch. */
  abstract delete(tenantId: string, id: string): Promise<boolean>;
}
