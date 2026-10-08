import type { PlatformPayment } from '../../../../../../shared/index.js';

export type NewPayment = {
  tenantId: string; invoiceId: string; paymentMethod: string; paymentRef: string | null; amount: number; status: 'SUCCEEDED' | 'FAILED';
  paidAt: Date | null; failureMessage: string | null; staffId: string | null;
};

/** Port: Platform.PlatformPayments (the database trigger allocates them to the invoice). */
export abstract class PaymentStore {
  abstract forInvoice(invoiceId: string): Promise<PlatformPayment[]>;
  abstract get(id: string): Promise<PlatformPayment | null>;
  abstract insert(p: NewPayment): Promise<string>;
  /** Sets the refunded total and status when rowVersion still matches; false when stale. */
  abstract refund(id: string, rowVersion: number, refundedAmount: number, status: string): Promise<boolean>;
}
