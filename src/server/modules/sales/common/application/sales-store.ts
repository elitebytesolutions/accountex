import type {
  CustomerCredit, DeliverableOrder, DeliveryChallan, DeliveryChallanList, PriceMap, Quotation, QuotationList, SalesDocOptions, SalesInvoice, SalesInvoiceList,
  SalesOrder, SalesOrderList, SalesQuery,
} from '../../../../../shared/index.js';

export type OrderBase = Omit<SalesOrder, 'approval' | 'routing' | 'approvalId' | 'canAct'>;
export type InvoiceBase = Omit<SalesInvoice, 'approval' | 'routing' | 'approvalId' | 'canAct' | 'awaitingApproval'>;
export type Doc = 'quotation' | 'order' | 'challan' | 'invoice';

/** The database functions sales documents move through (all in schema Sales). */
export type Lifecycle =
  | 'quotationSend' | 'quotationAccept' | 'quotationReject' | 'quotationCancel'
  | 'salesOrderClose' | 'salesOrderCancel'
  | 'deliveryChallanDispatch' | 'deliveryChallanDeliver' | 'deliveryChallanCancel'
  | 'salesInvoicePost' | 'salesInvoiceVoid';
export type SaveFunction = 'quotationAddUpdate' | 'salesOrderAddUpdate' | 'deliveryChallanAddUpdate' | 'salesInvoiceAddUpdate';

/** Persistence for quotations, sales orders, delivery challans and sales invoices / counter vouchers. */
export abstract class SalesStore {
  abstract options(tenantId: string): Promise<SalesDocOptions>;
  abstract prices(tenantId: string, priceListId: string): Promise<PriceMap>;
  abstract credit(tenantId: string, customerId: string): Promise<CustomerCredit | null>;

  abstract listQuotations(tenantId: string, q: SalesQuery): Promise<QuotationList>;
  abstract getQuotation(tenantId: string, id: string): Promise<Quotation | null>;
  abstract listOrders(tenantId: string, q: SalesQuery): Promise<SalesOrderList>;
  abstract getOrder(tenantId: string, id: string): Promise<OrderBase | null>;
  /** Confirmed / partly delivered orders with lines still to deliver (New challan drawer). */
  abstract deliverableOrders(tenantId: string): Promise<DeliverableOrder[]>;
  abstract listChallans(tenantId: string, q: SalesQuery): Promise<DeliveryChallanList>;
  abstract getChallan(tenantId: string, id: string): Promise<DeliveryChallan | null>;
  abstract listInvoices(tenantId: string, q: SalesQuery): Promise<SalesInvoiceList>;
  abstract getInvoice(tenantId: string, id: string): Promise<InvoiceBase | null>;

  abstract save(fn: SaveFunction, data: Record<string, unknown>): Promise<string>;
  /** Columns the save functions leave alone (status, receivedBy…). */
  abstract set(doc: Doc, tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  abstract run(fn: Lifecycle, id: string, text?: string | null): Promise<void>;
  /** Sales.salesOrderConfirm: lines, warehouse, customer and credit checks, reservations. */
  abstract confirmOrder(id: string, allowOverLimit: boolean): Promise<void>;
  /** Deletes a draft (lines first); false when it changed or is no longer a draft. */
  abstract deleteDraft(doc: Doc, tenantId: string, id: string, rowVersion: number): Promise<boolean>;
}
