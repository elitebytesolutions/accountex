import type { OpeningBatch } from '../../../../../shared/index.js';

export abstract class OpeningStore {
  /** The batch for a fiscal year, or an empty one dated at the year's start (id null); null when the year doesn't exist. */
  abstract forYear(tenantId: string, fiscalYearId: string): Promise<OpeningBatch | null>;
  abstract get(tenantId: string, id: string): Promise<OpeningBatch | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Posts the batch as one OB voucher (the DB parks any difference on the suspense account). Returns the voucher id. */
  abstract post(id: string): Promise<string>;
}
