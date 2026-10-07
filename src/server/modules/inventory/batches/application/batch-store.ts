import type { Batch, BatchListQuery, ListResult } from '../../../../../shared/index.js';

export type BatchSummary = { windows: Record<string, { count: number; value: number }>; total: { count: number; value: number }; byMonth: { month: string; value: number; count: number }[] };

export abstract class BatchStore {
  abstract page(tenantId: string, q: BatchListQuery, today: string): Promise<ListResult<Batch>>;
  abstract summary(tenantId: string, today: string): Promise<BatchSummary>;
  abstract get(tenantId: string, id: string): Promise<Batch | null>;
  abstract productExists(tenantId: string, itemId: string): Promise<boolean>;
  abstract batchNoTaken(tenantId: string, itemId: string, batchNo: string): Promise<boolean>;
  abstract save(data: Record<string, unknown>): Promise<string>;
}
