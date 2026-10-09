import type {
  BackOrder, BackOrderList, BulkRun, BulkRunList, HeldBill, IncomingStock, OrderBooking, OrderBookingList, OrderTemplate, StockMap, WholesaleOptions, WholesaleQuery,
} from '../../../../../shared/index.js';

export type WholesaleSave = 'orderTemplateAddUpdate' | 'heldBillAddUpdate' | 'orderBookingAddUpdate' | 'bulkInvoiceRunAddUpdate';
/** Bookings an order booker may see: their own, or on routes they book for (null = every booking). */
export type BookingScope = { employeeId: string | null } | null;

/** Persistence for order templates, held bills, order bookings, bulk invoice runs and back-orders (schema Distribution). */
export abstract class WholesaleStore {
  abstract options(tenantId: string, userId: string, allRoutes: boolean): Promise<WholesaleOptions>;
  /** Available stock (on hand − reserved) per product in a warehouse. */
  abstract stock(tenantId: string, warehouseId: string): Promise<StockMap>;
  abstract employeeOf(tenantId: string, userId: string): Promise<string | null>;

  abstract listTemplates(tenantId: string, userId: string, customerId: string | null): Promise<OrderTemplate[]>;
  abstract getTemplate(tenantId: string, id: string): Promise<OrderTemplate | null>;
  abstract archiveTemplate(tenantId: string, id: string, rowVersion: number): Promise<boolean>;

  abstract listHeld(tenantId: string): Promise<HeldBill[]>;
  abstract getHeld(tenantId: string, id: string): Promise<(HeldBill & { routeId: string | null; warehouseId: string | null; salesmanEmployeeId: string | null; customerId: string }) | null>;

  abstract listBookings(tenantId: string, q: WholesaleQuery, scope: BookingScope): Promise<OrderBookingList>;
  abstract getBooking(tenantId: string, id: string): Promise<OrderBooking | null>;
  /** The route that books for an employee (null when none). */
  abstract routesOf(tenantId: string, employeeId: string): Promise<string[]>;

  abstract listRuns(tenantId: string, q: WholesaleQuery): Promise<BulkRunList>;
  abstract getRun(tenantId: string, id: string): Promise<BulkRun | null>;
  /** Records a generated run: invoices on its cells, skipped shops, totals, COMPLETED. */
  abstract completeRun(tenantId: string, id: string, userId: string, done: { customerId: string; invoiceId: string; docNo: string; amount: number }[], skipped: { customerId: string; reasonCode: string; reason: string; billAmount: number; outstandingAmount: number | null; creditLimit: number | null; overByAmount: number | null }[], creditWarnings: number): Promise<void>;

  abstract listBackOrders(tenantId: string, q: WholesaleQuery): Promise<BackOrderList>;
  abstract getBackOrders(tenantId: string, ids: string[]): Promise<BackOrder[]>;
  abstract incoming(tenantId: string): Promise<IncomingStock[]>;
  /** The warehouse / batch an allocation's stock sits in (per back-order, the latest allocation). */
  abstract allocationSource(tenantId: string, backOrderIds: string[]): Promise<Map<string, { warehouseId: string; batchId: string | null; branchId: string | null }>>;

  abstract save(fn: WholesaleSave, data: Record<string, unknown>): Promise<string>;
  abstract checkStock(ids: string[]): Promise<void>;
  abstract holdBooking(id: string): Promise<void>;
  abstract bookingConverted(id: string, invoiceId: string): Promise<void>;
  abstract cancelBooking(id: string, reason: string | null): Promise<void>;
  abstract closeHeld(id: string, status: 'RECALLED' | 'DISCARDED'): Promise<void>;
  abstract allocate(grnLineId: string, policy: string, ids: string[] | null): Promise<number>;
  abstract backOrderInvoiced(id: string, invoiceId: string): Promise<void>;
  abstract cancelBackOrder(id: string, reason: string, note: string | null): Promise<void>;
  /** Deletes a NEW booking (lines first); false when it changed. */
  abstract deleteBooking(tenantId: string, id: string, rowVersion: number): Promise<boolean>;
}
