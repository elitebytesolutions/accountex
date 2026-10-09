import type { ItemInsight, Grn, GrnList, ImportGrn, LandedCost, LandedCostList, PurchaseOptions, PurchaseOrder, PurchaseOrderList, VendorBill, VendorBillList } from '../../../../../shared/index.js';

export type OrderBase = Omit<PurchaseOrder, 'approval' | 'routing' | 'approvalId' | 'canAct'>;
export type BillBase = Omit<VendorBill, 'approval' | 'routing' | 'approvalId' | 'canAct'>;
export type Doc = 'order' | 'grn' | 'bill' | 'landedCost';
export type ListQuery = { status?: string; vendor?: string; match?: string; search?: string; channel?: string; page: number; pageSize: number };

/** The database functions purchasing documents move through (all in schema Purchases). */
export type Lifecycle =
  | 'purchaseOrderApprove' | 'purchaseOrderCancel'
  | 'goodsReceivedNotePost' | 'goodsReceivedNoteCancel'
  | 'vendorBillApprove' | 'vendorBillPost' | 'vendorBillVoid'
  | 'landedCostShipmentPost' | 'landedCostShipmentCancel';
export type SaveFunction = 'purchaseOrderAddUpdate' | 'goodsReceivedNoteAddUpdate' | 'vendorBillAddUpdate' | 'landedCostShipmentAddUpdate';

/** Persistence for purchase orders, goods receipts, vendor bills and landed cost. */
export abstract class PurchasingStore {
  abstract options(tenantId: string): Promise<PurchaseOptions>;

  abstract listOrders(tenantId: string, q: ListQuery): Promise<PurchaseOrderList>;
  abstract getOrder(tenantId: string, id: string): Promise<OrderBase | null>;
  abstract listGrns(tenantId: string, q: ListQuery): Promise<GrnList>;
  abstract getGrn(tenantId: string, id: string): Promise<Grn | null>;
  abstract listBills(tenantId: string, q: ListQuery): Promise<VendorBillList>;
  abstract getBill(tenantId: string, id: string): Promise<BillBase | null>;
  abstract listLandedCosts(tenantId: string, q: ListQuery): Promise<LandedCostList>;
  abstract getLandedCost(tenantId: string, id: string): Promise<LandedCost | null>;
  /** Stock by warehouse, sale-price changes and recent purchases of a product (null when not found). */
  abstract itemInsight(tenantId: string, itemId: string): Promise<ItemInsight | null>;
  /** Posted import GRNs (for linking a shipment), with their lines. */
  abstract importGrns(tenantId: string): Promise<ImportGrn[]>;

  abstract save(fn: SaveFunction, data: Record<string, unknown>): Promise<string>;
  /** Columns the save functions leave alone (status, submittedAt…). */
  abstract set(doc: Doc, tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  abstract run(fn: Lifecycle, id: string, text?: string | null): Promise<void>;
  /** Deletes a draft (lines first); false when it changed or is no longer a draft. */
  abstract deleteDraft(doc: Doc, tenantId: string, id: string, rowVersion: number): Promise<boolean>;
  /** The company's default account for a posting role (Company Settings › Default accounts), null when unmapped. */
  abstract roleAccount(tenantId: string, role: string): Promise<string | null>;
  /** Another live bill of the vendor with this invoice no. */
  abstract duplicateInvoice(tenantId: string, vendorId: string, invoiceNo: string, exceptId: string | null): Promise<string | null>;
}
