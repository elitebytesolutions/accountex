import { Injectable } from '@nestjs/common';
import type { CreditOverrideInput, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { DistributionOpsStore } from '../../common/application/distribution-ops-store.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notPending = () => new ConflictError('This override request is already decided.', undefined, { code: 'CREDIT_OVERRIDE_NOT_PENDING' });

/**
 * Credit control: customers over their limit / overdue / on hold, holds placed and released by hand (each an event),
 * and override requests (one-time for an invoice, temporary limit, release hold) approved by crovr:approve — never by
 * the requester. An approved one-time override is set on the draft invoice so its posting passes the credit check;
 * every request and decision is logged in CreditOverrideLogs.
 */
@Injectable()
export class CreditControlService {
  constructor(
    private readonly store: DistributionOpsStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  overview(user: SessionUser) {
    return this.store.creditControl(user.tenantId);
  }

  async hold(user: SessionUser, meta: RequestMeta, customerId: string, place: boolean, reason: string, notes: string | null) {
    const c = await this.store.customerCredit(user.tenantId, customerId);
    if (!c) throw new NotFoundError('Customer not found');
    const o = await this.store.options(user.tenantId);
    if (!o.lookups.holdReasons.some((x) => x.code === reason)) throw v({ reason: 'Choose a reason' });
    if (place === (c.status === 'ON_HOLD')) throw new ConflictError(place ? 'This customer is already on hold.' : 'This customer is not on hold.', undefined, { code: 'CREDIT_OVERRIDE_NOT_PENDING' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setHold(user.tenantId, customerId, place, reason, 'USER', user.id, notes));
    return this.overview(user);
  }

  async request(user: SessionUser, meta: RequestMeta, p: CreditOverrideInput) {
    const c = await this.store.customerCredit(user.tenantId, p.customerId);
    if (!c) throw v({ customerId: 'Choose a customer' });
    let amount = Number(p.documentAmount ?? 0);
    if (p.invoiceId) {
      const [inv] = await this.store.invoiceFacts(user.tenantId, [p.invoiceId]);
      if (!inv || inv.customerId !== p.customerId) throw v({ invoiceId: 'Choose an invoice of this customer' });
      if (inv.status !== 'DRAFT') throw v({ invoiceId: 'Only a draft invoice can be let through' });
      amount = inv.netAmount;
    }
    const after = r2(c.balance + amount);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const oid = await this.store.save('creditOverrideAddUpdate', {
        customerId: p.customerId, overrideType: p.overrideType, invoiceId: p.invoiceId ?? null, documentAmount: amount, creditLimitSnapshot: c.creditLimit, balanceSnapshot: c.balance,
        exposureAfter: after, overdueSnapshot: c.overdue, exceedByAmount: Math.max(0, r2(after - c.creditLimit)), tempLimitAmount: p.overrideType === 'TEMP_LIMIT' ? p.tempLimitAmount : null,
        validUntil: p.overrideType === 'TEMP_LIMIT' ? p.validUntil : null, requestReason: p.requestReason, approvalMethod: 'APPROVAL', requestedByUserId: user.id,
        requestedAt: new Date().toISOString(), status: 'PENDING',
      });
      await this.store.logOverride(user.tenantId, {
        customerId: p.customerId, invoiceId: p.invoiceId ?? null, creditOverrideId: oid, triggerPoint: 'SAVE', creditLimit: c.creditLimit, outstandingAmount: c.balance, billAmount: amount,
        usedPct: c.creditLimit > 0 ? Math.min(r2((after / c.creditLimit) * 100), 99999) : 0, overdueDays: Math.max(c.maxDaysOverdue ?? 0, 0),
        requestedByUserId: user.id, attempts: 0, outcome: 'PENDING', requestedAt: new Date(),
      });
      return oid;
    });
    return (await this.store.getOverride(user.tenantId, id))!;
  }

  async approve(user: SessionUser, meta: RequestMeta, id: string, comment: string | null) {
    const o = await this.store.getOverride(user.tenantId, id);
    if (!o) throw new NotFoundError('Override request not found');
    if (o.status !== 'PENDING') throw notPending();
    if (o.requestedBy?.id === user.id) throw new ConflictError('You can’t approve your own override request.', undefined, { code: 'CREDIT_OVERRIDE_SELF_APPROVAL' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      // the decision is recorded first: an APPROVED row must carry who decided and when
      await this.store.set('override', user.tenantId, id, { approverUserId: user.id, decidedByUserId: user.id, decidedAt: new Date(), conditionComments: comment });
      await this.store.run('creditOverrideApprove', id, comment);
      if (o.overrideType === 'ONE_TIME' && o.invoice) await this.store.setInvoiceOverride(user.tenantId, o.invoice.id, id);
      if (o.overrideType === 'RELEASE_HOLD') {
        const c = await this.store.customerCredit(user.tenantId, o.customer.id);
        if (c?.status === 'ON_HOLD') await this.store.setHold(user.tenantId, o.customer.id, false, 'OVERRIDE', 'USER', user.id, `Override ${o.docNo}`, id);
      }
      await this.store.resolveOverrideLog(user.tenantId, id, 'APPROVED', user.id);
    });
    return (await this.store.getOverride(user.tenantId, id))!;
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, comment: string | null) {
    const o = await this.store.getOverride(user.tenantId, id);
    if (!o) throw new NotFoundError('Override request not found');
    if (o.status !== 'PENDING') throw notPending();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.set('override', user.tenantId, id, { status: 'REJECTED', decidedByUserId: user.id, decidedAt: new Date(), conditionComments: comment });
      await this.store.resolveOverrideLog(user.tenantId, id, 'DENIED', user.id);
    });
    return (await this.store.getOverride(user.tenantId, id))!;
  }
}
