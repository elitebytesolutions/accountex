import type { ReorderRule } from '../../../../../shared/index.js';

/** What the suggestion maths needs per product (rule or the product's own levels) and per warehouse. */
export type ReorderInput = {
  product: { id: string; sku: string; name: string; ctn: number; uomCode: string; cost: number; avgDaily: number };
  supplier: { id: string; code: string; name: string } | null;
  warehouse: { id: string; name: string } | null;
  onHand: number;
  lowLevel: number; highLevel: number; leadDays: number; safetyDays: number; coverAlertDays: number;
};

export abstract class ReorderStore {
  abstract list(tenantId: string, itemId?: string): Promise<ReorderRule[]>;
  abstract inputs(tenantId: string): Promise<ReorderInput[]>;
  abstract productExists(tenantId: string, itemId: string): Promise<boolean>;
  abstract activeWarehouse(tenantId: string, id: string): Promise<boolean>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract delete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
