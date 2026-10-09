import type {
  CreditControl, CreditOverride, DistributionOpsOptions, DistributionQuery, LoadCandidate, LoadSheet, LoadSheetList, RecoverySheet, RecoverySheetList, RouteSettlement,
  RouteSettlementList, SalesmanCommission, SalesmanTarget,
} from '../../../../../shared/index.js';

export type DistSave = 'loadSheetAddUpdate' | 'routeSettlementAddUpdate' | 'recoverySheetAddUpdate' | 'salesmanTargetAddUpdate' | 'salesmanCommissionAddUpdate' | 'creditOverrideAddUpdate';
export type DistLifecycle = 'loadSheetDispatch' | 'loadSheetCancel' | 'routeSettlementPost' | 'recoverySheetPost' | 'salesmanCommissionAccrue' | 'creditOverrideApprove';
export type DistDoc = 'loadSheet' | 'loadSheetInvoice' | 'settlement' | 'recovery' | 'recoveryLine' | 'target' | 'commission' | 'override';

/** A posted invoice with what a load sheet / settlement needs. */
export type InvoiceFacts = {
  id: string; docNo: string; docDate: string; status: string; routeId: string | null; customerId: string; customerName: string; branchId: string; warehouseId: string | null;
  netAmount: number; balanceAmount: number; salesmanEmployeeId: string | null;
  lines: { id: string; itemId: string; batchId: string | null; qty: number; rate: number; netRate: number; taxRate: number; discountPct: number; ctn: number; value: number }[];
};
export type SettlementDetail = {
  lines: {
    id: string; invoiceId: string; deliveryState: string; nonDeliveryReason: string | null; cashAmount: number; chequeAmount: number; returnAmount: number; creditAmount: number;
    cheques: { chequeNo: string; bankId: string | null; bankName: string; chequeDate: string; amount: number }[];
    returns: { invoiceLineId: string; itemId: string; batchId: string | null; suppliedQty: number; returnQty: number; unitPrice: number; unitCost: number; reason: string }[];
  }[];
  cashCounts: { denomination: number; noteCount: number }[];
};
export type CustomerCreditFacts = { id: string; name: string; status: string; creditLimit: number; balance: number; overdue: number; maxDaysOverdue: number | null };
export type RecoveryCandidate = {
  customerId: string; outstanding: number; age030: number; age3160: number; age6190: number; age90Plus: number; creditLimit: number; target: number;
  lastPaymentDate: string | null; lastPaymentAmount: number;
};

/** Persistence for load sheets, route settlements, recovery sheets, targets / commissions and credit control. */
export abstract class DistributionOpsStore {
  abstract options(tenantId: string): Promise<DistributionOpsOptions>;
  abstract employeeOfUser(tenantId: string, userId: string): Promise<string | null>;

  abstract candidates(tenantId: string, routeId: string, date: string): Promise<LoadCandidate[]>;
  abstract invoiceFacts(tenantId: string, invoiceIds: string[]): Promise<InvoiceFacts[]>;
  abstract listLoadSheets(tenantId: string, q: DistributionQuery): Promise<LoadSheetList>;
  abstract getLoadSheet(tenantId: string, id: string): Promise<LoadSheet | null>;

  abstract listSettlements(tenantId: string, q: DistributionQuery): Promise<RouteSettlementList>;
  abstract getSettlement(tenantId: string, id: string): Promise<RouteSettlement | null>;
  abstract writeSettlement(tenantId: string, id: string, d: SettlementDetail): Promise<void>;
  /** Removes an OPEN settlement and its detail (cancelling its run). */
  abstract deleteSettlement(tenantId: string, id: string): Promise<void>;
  abstract setSettlementLine(tenantId: string, lineId: string, data: Record<string, unknown>): Promise<void>;
  abstract setSettlementCheque(tenantId: string, settlementLineId: string, chequeNo: string, chequeId: string): Promise<void>;

  abstract listRecovery(tenantId: string, q: DistributionQuery): Promise<RecoverySheetList>;
  abstract getRecovery(tenantId: string, id: string): Promise<RecoverySheet | null>;
  abstract recoveryCandidates(tenantId: string, routeId: string, asOf: string): Promise<RecoveryCandidate[]>;

  abstract targets(tenantId: string): Promise<{ targets: SalesmanTarget[]; commissions: SalesmanCommission[] }>;
  abstract getTarget(tenantId: string, id: string): Promise<SalesmanTarget | null>;
  abstract getCommission(tenantId: string, id: string): Promise<SalesmanCommission | null>;
  /** Posted invoices (net of applied / open credit notes on them) booked or sold by the employee in the period. */
  abstract achievement(tenantId: string, employeeId: string, role: string, from: string, to: string, routeId: string | null): Promise<number>;
  abstract draftPayrollRun(tenantId: string, month: string): Promise<{ id: string; docNo: string } | null>;
  abstract commissionComponentId(tenantId: string): Promise<string | null>;
  abstract payrollAdjustmentFor(tenantId: string, commissionId: string): Promise<{ id: string; docNo: string } | null>;
  abstract addPayrollAdjustment(tenantId: string, row: { payrollRunId: string; employeeId: string; componentId: string; amount: number; remarks: string; sourceDocId: string }): Promise<void>;

  abstract creditControl(tenantId: string): Promise<CreditControl>;
  abstract customerCredit(tenantId: string, customerId: string): Promise<CustomerCreditFacts | null>;
  abstract getOverride(tenantId: string, id: string): Promise<CreditOverride | null>;
  abstract setHold(tenantId: string, customerId: string, hold: boolean, reason: string, source: string, userId: string | null, notes: string | null, overrideId?: string | null): Promise<void>;
  abstract logOverride(tenantId: string, row: Record<string, unknown>): Promise<void>;
  abstract resolveOverrideLog(tenantId: string, overrideId: string, outcome: string, approverUserId: string | null): Promise<void>;
  abstract setInvoiceOverride(tenantId: string, invoiceId: string, overrideId: string): Promise<boolean>;

  abstract nextNo(docType: string, date: string, branchId: string | null): Promise<string>;
  abstract save(fn: DistSave, data: Record<string, unknown>): Promise<string>;
  abstract set(doc: DistDoc, tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  abstract run(fn: DistLifecycle, id: string, text?: string | null): Promise<void>;
  abstract deleteDraft(doc: 'loadSheet' | 'target', tenantId: string, id: string, rowVersion: number): Promise<boolean>;
}
