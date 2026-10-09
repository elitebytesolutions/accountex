import type {
  ArAgeing, CreditNote, CreditNoteList, CustomerReceipt, CustomerReceiptList, CustomerStatement, CustomerOpenItems, PosHeldSale, PosShift, PosShiftList, PosShiftReport,
  ReceivablesOptions, ReceivablesQuery, RecurringInvoice, RecurringInvoiceList, ReturnableInvoice, SalesReturn, SalesReturnList,
} from '../../../../../shared/index.js';

export type ReceivablesSave = 'salesReturnAddUpdate' | 'creditNoteAddUpdate' | 'customerReceiptAddUpdate' | 'recurringInvoiceAddUpdate' | 'posShiftAddUpdate';
/** The Sales lifecycle functions this module runs (posting, cancel / void, shift close). */
export type ReceivablesLifecycle =
  | 'salesReturnPost' | 'salesReturnCancel' | 'creditNotePost' | 'creditNoteCancel' | 'customerReceiptPost' | 'customerReceiptVoid' | 'posShiftClose';
export type ReceivablesDoc = 'return' | 'creditNote' | 'receipt' | 'recurring' | 'shift';
export type DueRecurring = { id: string; tenantId: string; nextRunDate: string };

/** Persistence for sales returns, credit notes, customer receipts, recurring invoices, POS shifts and the AR reports. */
export abstract class ReceivablesStore {
  abstract options(tenantId: string): Promise<ReceivablesOptions>;

  abstract listReturns(tenantId: string, q: ReceivablesQuery): Promise<SalesReturnList>;
  abstract getReturn(tenantId: string, id: string): Promise<SalesReturn | null>;
  abstract returnable(tenantId: string, invoiceId: string): Promise<ReturnableInvoice | null>;

  abstract listCreditNotes(tenantId: string, q: ReceivablesQuery): Promise<CreditNoteList>;
  abstract getCreditNote(tenantId: string, id: string): Promise<CreditNote | null>;

  abstract listReceipts(tenantId: string, q: ReceivablesQuery): Promise<CustomerReceiptList>;
  abstract getReceipt(tenantId: string, id: string): Promise<CustomerReceipt | null>;
  abstract openItems(tenantId: string, customerId: string): Promise<CustomerOpenItems | null>;
  /** Replaces a receipt's invoice allocations (and its cheque's allocations); the database checks the limits. */
  abstract setAllocations(tenantId: string, receiptId: string, customerId: string, rows: { invoiceId: string; amount: number; isAutoFifo: boolean }[]): Promise<void>;

  abstract listRecurring(tenantId: string, q: ReceivablesQuery): Promise<RecurringInvoiceList>;
  abstract getRecurring(tenantId: string, id: string): Promise<RecurringInvoice | null>;
  /** Active companies (the recurring job runs each in its own tenant context: Sales tables are row-level secured). */
  abstract tenants(): Promise<string[]>;
  abstract dueRecurring(tenantId: string, today: string): Promise<DueRecurring[]>;

  abstract openShift(tenantId: string, userId: string): Promise<PosShift | null>;
  abstract getShift(tenantId: string, id: string): Promise<PosShift | null>;
  abstract shiftReport(tenantId: string, id: string): Promise<PosShiftReport | null>;
  abstract listShifts(tenantId: string, q: ReceivablesQuery): Promise<PosShiftList>;
  abstract heldSales(tenantId: string, shiftId: string): Promise<PosHeldSale[]>;
  abstract counterTaken(tenantId: string, branchId: string, counterName: string, userId: string): Promise<boolean>;
  abstract addPosPayment(tenantId: string, row: { posShiftId: string; invoiceId: string; tender: string; amount: number; tenderedAmount: number | null; changeAmount: number; reference: string | null; receiptId: string | null }): Promise<void>;

  abstract ageing(tenantId: string, asOf: string, basis: 'DUE' | 'DOC'): Promise<ArAgeing>;
  abstract statement(tenantId: string, customerId: string, from: string, to: string): Promise<CustomerStatement | null>;

  /** Company.getNextDocNo (Z-report numbers). */
  abstract nextNo(docType: string, date: string, branchId: string | null): Promise<string>;
  abstract save(fn: ReceivablesSave, data: Record<string, unknown>): Promise<string>;
  /** Columns the save functions leave alone (status, counts, schedule…). */
  abstract set(doc: ReceivablesDoc, tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  abstract run(fn: ReceivablesLifecycle, id: string, text?: string | null): Promise<void>;
  /** Deletes a draft (lines first); false when it changed or is no longer a draft. */
  abstract deleteDraft(doc: 'return' | 'creditNote' | 'recurring', tenantId: string, id: string, rowVersion: number): Promise<boolean>;
}
