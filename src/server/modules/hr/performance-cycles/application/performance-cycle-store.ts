import type { ListResult, PerformanceCycle, TalentListQuery } from '../../../../../shared/index.js';

export abstract class PerformanceCycleStore {
  abstract page(tenantId: string, q: TalentListQuery): Promise<ListResult<PerformanceCycle>>;
  abstract get(tenantId: string, id: string): Promise<PerformanceCycle | null>;
  abstract byName(tenantId: string, name: string): Promise<{ id: string } | null>;
  abstract active(tenantId: string): Promise<{ id: string; name: string } | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  /** Hard delete (cycles have no deletedAt). */
  abstract remove(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
