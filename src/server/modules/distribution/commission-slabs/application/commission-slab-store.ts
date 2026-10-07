import type { CommissionSlab } from '../../../../../shared/distribution/index.js';

export abstract class CommissionSlabStore {
  /** Every live (not deleted) band. */
  abstract live(tenantId: string): Promise<CommissionSlab[]>;
  /** Inserts or updates one band; an overlap with another live band raises 409 COMMISSION_SLAB_OVERLAP. */
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  /** Soft-deletes bands (each at the version read). */
  abstract softDelete(tenantId: string, rows: { id: string; rowVersion: number }[]): Promise<void>;
}
