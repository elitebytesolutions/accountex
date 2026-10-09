import type {
  ApAgeing, ReturnBill, DebitNote, DebitNoteList, OpenItems, PurchaseReturn, PurchaseReturnList, ReturnableLine, VendorPayment, VendorPaymentList, VendorStatement,
} from '../../../../../shared/index.js';
import type { ListQuery } from './purchasing-store.js';

export type PaymentBase = Omit<VendorPayment, 'approval' | 'routing' | 'approvalId' | 'canAct'>;
export type PayablesDoc = 'return' | 'debitNote' | 'payment';
export type PayablesLifecycle = 'purchaseReturnPost' | 'purchaseReturnCancel' | 'debitNotePost' | 'debitNoteVoid' | 'vendorPaymentPost' | 'vendorPaymentVoid';
export type PayablesSave = 'purchaseReturnAddUpdate' | 'debitNoteAddUpdate' | 'vendorPaymentAddUpdate';

/** Persistence for purchase returns, debit notes, vendor payments and the payables reports. */
export abstract class PayablesStore {
  abstract openItems(tenantId: string, vendorId: string | null): Promise<OpenItems>;

  abstract listReturns(tenantId: string, q: ListQuery): Promise<PurchaseReturnList>;
  abstract getReturn(tenantId: string, id: string): Promise<PurchaseReturn | null>;
  /** A vendor's posted bills with stock lines (newest first) a return can reference. */
  abstract returnBills(tenantId: string, vendorId: string): Promise<ReturnBill[]>;
  /** The bill's stock lines with what can still be returned (posted returns counted; `exceptReturnId` left out). */
  abstract returnable(tenantId: string, billId: string, exceptReturnId: string | null): Promise<ReturnableLine[]>;

  abstract listDebitNotes(tenantId: string, q: ListQuery): Promise<DebitNoteList>;
  abstract getDebitNote(tenantId: string, id: string): Promise<DebitNote | null>;

  abstract listPayments(tenantId: string, q: ListQuery): Promise<VendorPaymentList>;
  abstract getPayment(tenantId: string, id: string): Promise<PaymentBase | null>;

  abstract save(fn: PayablesSave, data: Record<string, unknown>): Promise<string>;
  abstract set(doc: PayablesDoc, tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  abstract run(fn: PayablesLifecycle, id: string, text?: string | null): Promise<void>;
  abstract deleteDraft(doc: PayablesDoc, tenantId: string, id: string, rowVersion: number): Promise<boolean>;
  /** Allocates a posted payment's or open debit note's balance to bills (allocation rows). */
  abstract allocate(tenantId: string, source: { paymentId?: string; debitNoteId?: string }, date: string, rows: { billId: string; amount: number; whtAmount?: number }[]): Promise<void>;
  abstract reverseAllocation(tenantId: string, allocationId: string): Promise<{ paymentId: string | null; debitNoteId: string | null } | null>;
  abstract refundDebitNote(id: string, date: string, cashAccountId: string | null, bankAccountId: string | null, amount: number): Promise<void>;

  abstract ageing(tenantId: string, q: { asOf: string; basis: 'DUE' | 'BILL'; branch?: string; vendor?: string; includeZero: boolean }): Promise<ApAgeing>;
  abstract statement(tenantId: string, vendorId: string, from: string, to: string): Promise<VendorStatement | null>;
}
