import type {
  AssemblyList, AssemblyVoucher, BulkPriceUpdate, BulkPriceUpdateList, DemandOptions, GoodsDemand, GoodsDemandList, PrincipalClaim, PrincipalClaimList, PrincipalTarget,
  StockVoucher, StockVoucherList,
} from '../../../../../shared/index.js';

export type DemandQuery = { status?: string; type?: string; search?: string; page: number; pageSize: number };
export type DemandDoc = 'stockVoucher' | 'assembly' | 'demand' | 'claim' | 'target' | 'priceUpdate';
export type DemandSave = 'stockVoucherAddUpdate' | 'assemblyVoucherAddUpdate' | 'goodsDemandAddUpdate' | 'principalClaimAddUpdate' | 'principalTargetAddUpdate' | 'bulkPriceUpdateAddUpdate';
export type DemandLifecycle = 'stockVoucherPost' | 'stockVoucherCancel' | 'assemblyVoucherPost' | 'assemblyVoucherCancel' | 'goodsDemandOrder' | 'goodsDemandCancel' | 'principalClaimCancel';
/** An item below its reorder level, with what to order to reach the high level. */
export type ReorderNeed = { itemId: string; manufacturerId: string | null; ctn: number; onHand: number; lowLevel: number; highLevel: number; rate: number };

/** Persistence for stock vouchers, assembly, goods demand, principal claims / targets and bulk price updates. */
export abstract class StockDemandStore {
  abstract options(tenantId: string): Promise<DemandOptions>;
  abstract listStockVouchers(tenantId: string, q: DemandQuery): Promise<StockVoucherList>;
  abstract getStockVoucher(tenantId: string, id: string): Promise<StockVoucher | null>;
  abstract listAssemblies(tenantId: string, q: DemandQuery): Promise<AssemblyList>;
  abstract getAssembly(tenantId: string, id: string): Promise<AssemblyVoucher | null>;
  abstract listDemands(tenantId: string, q: DemandQuery): Promise<GoodsDemandList>;
  abstract getDemand(tenantId: string, id: string): Promise<GoodsDemand | null>;
  /** Items the vendor supplies (distributor or supplier list) below their reorder low level. */
  abstract reorderNeeds(tenantId: string, vendorId: string, manufacturerId: string | null): Promise<ReorderNeed[]>;
  abstract listClaims(tenantId: string, q: DemandQuery): Promise<PrincipalClaimList>;
  abstract getClaim(tenantId: string, id: string): Promise<PrincipalClaim | null>;
  abstract listTargets(tenantId: string): Promise<PrincipalTarget[]>;
  abstract getTarget(tenantId: string, id: string): Promise<PrincipalTarget | null>;
  abstract listPriceUpdates(tenantId: string, q: DemandQuery): Promise<BulkPriceUpdateList>;
  abstract getPriceUpdate(tenantId: string, id: string): Promise<BulkPriceUpdate | null>;
  /** Products a price update covers, with their current price fields. */
  abstract priceScope(tenantId: string, scope: { applyTo: string; manufacturerId: string | null; productClassId: string | null; itemIds: string[] }): Promise<{ id: string; price: number; wprice: number | null; cost: number; status: string }[]>;
  /** Writes product prices and their price logs (source BULK_UPDATE or UNDO). */
  abstract applyPrices(tenantId: string, batchId: string, userId: string, source: 'BULK_UPDATE' | 'UNDO', changes: { itemId: string; field: string; oldValue: number; newValue: number }[]): Promise<void>;
  abstract nextNo(docType: string, date: string): Promise<string>;

  abstract save(fn: DemandSave, data: Record<string, unknown>): Promise<string>;
  abstract set(doc: DemandDoc, tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  abstract run(fn: DemandLifecycle, id: string, text?: string | null): Promise<void>;
  abstract deleteDraft(doc: DemandDoc, tenantId: string, id: string, rowVersion: number): Promise<boolean>;
}
