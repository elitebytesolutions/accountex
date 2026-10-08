import { Injectable } from '@nestjs/common';
import type { AdminSession, PaymentCreate, PaymentRefund, PlatformInvoiceDetail, PlatformPayment } from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { TenantStore } from '../../../tenants/tenants/application/tenant-store.js';
import { DunningService } from '../../dunning/application/dunning.service.js';
import { InvoicesService } from '../../invoices/application/invoices.service.js';
import { PaymentStore } from './payment-store.js';

/**
 * Platform payments: "Record payment" / "Mark paid" on an invoice and refunds. The database trigger allocates the
 * money to the invoice (OPEN → PARTIALLY_PAID → PAID); a payment that settles an invoice in dunning recovers its case
 * and restores the company's access, in the same transaction.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly store: PaymentStore,
    private readonly invoices: InvoicesService,
    private readonly dunning: DunningService,
    private readonly tenants: TenantStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async record(admin: AdminSession, meta: RequestMeta, invoiceId: string, input: PaymentCreate): Promise<PlatformInvoiceDetail> {
    const inv = await this.invoices.get(invoiceId);
    if (!['OPEN', 'PARTIALLY_PAID'].includes(inv.status)) {
      throw new ConflictError('Payments can only be recorded against an open or partially paid invoice.', undefined, { code: 'INVOICE_NOT_PAYABLE' });
    }
    if (input.amount > inv.balanceAmount) {
      throw new ConflictError(`The payment is more than the balance (Rs ${inv.balanceAmount.toLocaleString('en-PK')}).`, { amount: ['At most the balance'] }, { code: 'PAYMENT_EXCEEDS_BALANCE' });
    }
    const paidAt = input.paidOn ? new Date(`${input.paidOn}T12:00:00+05:00`) : new Date();
    if (paidAt.getTime() > Date.now() + 86_400_000) throw new ValidationError('The payment date can\'t be in the future', { paidOn: ['Today or earlier'] });
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      await this.store.insert({
        tenantId: inv.tenantId, invoiceId, paymentMethod: input.paymentMethod, paymentRef: input.paymentRef, amount: input.amount, status: 'SUCCEEDED',
        paidAt, failureMessage: null, staffId: admin.staffId,
      });
      await this.dunning.afterPayment(invoiceId);
    });
    return this.invoices.get(invoiceId);
  }

  async refund(admin: AdminSession, meta: RequestMeta, id: string, input: PaymentRefund): Promise<PlatformPayment> {
    const p = await this.store.get(id);
    if (!p) throw new NotFoundError('Payment not found');
    if (p.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this payment. Reload and try again.');
    if (!['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(p.status)) {
      throw new ConflictError('Only a succeeded payment can be refunded.', undefined, { code: 'PAYMENT_NOT_REFUNDABLE' });
    }
    const left = Math.round((p.amount - p.refundedAmount) * 100) / 100;
    if (input.amount > left) throw new ValidationError(`At most Rs ${left.toLocaleString('en-PK')} is left to refund`, { amount: ['More than what is left'] }, { code: 'REFUND_EXCEEDS_PAID' });
    const refunded = Math.round((p.refundedAmount + input.amount) * 100) / 100;
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      if (!(await this.store.refund(id, input.rowVersion, refunded, refunded >= p.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED'))) {
        throw new ConcurrencyError('Someone else changed this payment. Reload and try again.');
      }
      if (admin.staffId) await this.tenants.addNote(p.tenantId, admin.staffId, `Refund of Rs ${input.amount.toLocaleString('en-PK')} on ${p.docNo ?? 'invoice'}: ${input.reason}`);
    });
    return (await this.store.get(id))!;
  }
}
