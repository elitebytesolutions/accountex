import { z } from 'zod';
import { optDate, optText, rowVersion } from './fields.ts';

/**
 * Phase 41: platform payments (Platform.PlatformPayments), one invoice per payment. There is no payment gateway yet:
 * payments are recorded by the Super Admin and the database allocates them to the invoice (paidAmount and status,
 * refusing over-payment). A refund lowers the allocation again.
 */
export const PLATFORM_PAYMENT_METHODS = ['BANK_TRANSFER', 'RAAST', 'JAZZCASH', 'EASYPAISA', 'CARD', 'DIRECT_DEBIT', 'INVOICE'] as const;

export type PlatformPayment = {
  id: string; invoiceId: string; docNo: string | null; tenantId: string; paymentMethod: string; paymentRef: string | null; amount: number;
  status: string; failureMessage: string | null; attemptedAt: string; paidAt: string | null; refundedAmount: number; refundedAt: string | null;
  recordedBy: string | null; createdAt: string; rowVersion: number;
};

export const PaymentCreateSchema = z.object({
  amount: z.coerce.number('Enter the amount').positive('More than 0').max(100_000_000),
  paymentMethod: z.enum(PLATFORM_PAYMENT_METHODS).default('BANK_TRANSFER'),
  paymentRef: optText(80),
  /** The day the money arrived (default today). */
  paidOn: optDate.optional(),
});
export type PaymentCreate = z.infer<typeof PaymentCreateSchema>;

export const PaymentRefundSchema = z.object({
  rowVersion,
  amount: z.coerce.number('Enter the amount').positive('More than 0').max(100_000_000),
  reason: z.string().trim().min(3, 'Give the reason').max(300),
});
export type PaymentRefund = z.infer<typeof PaymentRefundSchema>;
