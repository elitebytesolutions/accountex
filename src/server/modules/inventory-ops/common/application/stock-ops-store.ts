import type {
  StockAdjustment, StockAdjustmentList, StockCount, StockCountList, StockEntry, StockEntryList, StockOnHand, StockOpsOptions, StockTransfer, StockTransferList,
} from '../../../../../shared/index.js';

export type OpsQuery = { status?: string; warehouse?: string; mode?: 'IN' | 'OUT'; search?: string; page: number; pageSize: number };
export type OpsDoc = 'entry' | 'transfer' | 'adjustment' | 'count';
export type AdjustmentBase = Omit<StockAdjustment, 'approval' | 'routing' | 'approvalId' | 'canAct'>;
export type OpsSave = 'stockInOutEntryAddUpdate' | 'stockTransferAddUpdate' | 'stockAdjustmentAddUpdate' | 'stockCountAddUpdate';
export type OpsLifecycle =
  | 'stockInOutEntryPost' | 'stockInOutEntryCancel' | 'stockTransferPost' | 'stockTransferReceive' | 'stockTransferCancel'
  | 'stockAdjustmentPost' | 'stockAdjustmentCancel' | 'stockCountApprove' | 'stockCountCancel';

/** Persistence for manual stock in / out, transfers, adjustments and stock counts. */
export abstract class StockOpsStore {
  abstract options(tenantId: string): Promise<StockOpsOptions>;
  abstract onHand(tenantId: string, warehouseId: string, itemIds?: string[]): Promise<StockOnHand>;

  abstract listEntries(tenantId: string, q: OpsQuery): Promise<StockEntryList>;
  abstract getEntry(tenantId: string, id: string): Promise<StockEntry | null>;
  abstract listTransfers(tenantId: string, q: OpsQuery): Promise<StockTransferList>;
  abstract getTransfer(tenantId: string, id: string): Promise<StockTransfer | null>;
  /** Replaces a draft transfer's lines (the save function does not cover them). */
  abstract setTransferLines(tenantId: string, transferId: string, from: string, to: string, lines: { itemId: string; batchId: string | null; fromBinId: string | null; toBinId: string | null; ctnSize: number; qtyCtn: number; qtyLoose: number; unitCost: number }[]): Promise<void>;
  /** Receipt lines of a dispatched transfer (what arrived per line). */
  abstract saveReceipt(tenantId: string, transferId: string, lines: { transferLineId: string; sentQty: number; receivedQty: number; note: string | null; receivedAt: string; receivedByUserId: string }[]): Promise<void>;
  abstract listAdjustments(tenantId: string, q: OpsQuery): Promise<StockAdjustmentList>;
  abstract getAdjustment(tenantId: string, id: string): Promise<AdjustmentBase | null>;
  abstract listCounts(tenantId: string, q: OpsQuery): Promise<StockCountList>;
  abstract getCount(tenantId: string, id: string): Promise<StockCount | null>;
  /** Counted quantities of a frozen count (its save function only edits drafts). */
  abstract setCountLines(tenantId: string, countId: string, lines: { id: string; countedQty: number | null; reason: string | null; countedAt?: string; countedByUserId?: string }[]): Promise<void>;
  /** The product classes a count is scoped to (empty = all). */
  abstract countScope(tenantId: string, id: string): Promise<string[]>;

  abstract save(fn: OpsSave, data: Record<string, unknown>): Promise<string>;
  abstract set(doc: OpsDoc, tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  abstract run(fn: OpsLifecycle, id: string, text?: string | null): Promise<void>;
  abstract deleteDraft(doc: OpsDoc, tenantId: string, id: string, rowVersion: number): Promise<boolean>;
}
