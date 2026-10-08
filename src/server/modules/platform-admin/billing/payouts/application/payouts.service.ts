import { Injectable } from '@nestjs/common';
import type {
  AdminSession, PayoutCalculateResult, PayoutList, PayoutPay, ResellerAttribution, ResellerAttributionInput, ResellerPayout,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { todayPk } from '../../../tenants/subscriptions/domain/billing.js';
import { PayoutStore } from './payout-store.js';

const settled = (status: string) =>
  new ConflictError(`This payout is already ${status.toLowerCase()}.`, undefined, { code: 'PAYOUT_ALREADY_PAID' });

/**
 * Reseller payouts (Partners & Coupons › Resellers: statement drawer) and reseller–tenant attribution. A month's
 * payouts are calculated from the partners' live attributions (Platform.resellerPayoutCalculate: MRR × commission %,
 * WHT 12% u/s 233); paying records the date and the IBFT / cheque reference.
 */
@Injectable()
export class PayoutsService {
  constructor(
    private readonly store: PayoutStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(q: { partnerId?: string; month?: string }): Promise<PayoutList> {
    const [items, commissions] = await Promise.all([this.store.list(q), this.store.commissions()]);
    const due = items.filter((p) => p.status === 'DUE');
    return {
      items, commissions,
      kpis: {
        partnerMrr: Math.round(commissions.reduce((s, c) => s + c.sourcedMrr, 0) * 100) / 100,
        commissionDue: Math.round(due.reduce((s, p) => s + p.netAmount, 0) * 100) / 100,
        dueCount: due.length,
      },
    };
  }

  async get(id: string): Promise<ResellerPayout> {
    const p = await this.store.get(id);
    if (!p) throw new NotFoundError('Payout not found');
    return p;
  }

  async calculate(admin: AdminSession, meta: RequestMeta, month?: string): Promise<PayoutCalculateResult> {
    const m = month ?? todayPk().slice(0, 7);
    const created = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.calculate(`${m}-01`));
    return { month: m, created, payouts: await this.store.list({ month: m }) };
  }

  async pay(admin: AdminSession, meta: RequestMeta, id: string, input: PayoutPay): Promise<ResellerPayout> {
    const p = await this.due(id, input.rowVersion);
    if (input.paidOn < `${p.periodMonth.slice(0, 7)}-01`) throw new ValidationError('Paid before the payout month', { paidOn: ['On or after the month start'] });
    if (input.paidOn > todayPk()) throw new ValidationError('The payment date can\'t be in the future', { paidOn: ['Today or earlier'] });
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      if (!(await this.store.settle(id, input.rowVersion, { status: 'PAID', paidOn: input.paidOn, paymentRef: input.paymentRef, whtCertificateNo: input.whtCertificateNo }))) {
        throw new ConcurrencyError('Someone else changed this payout. Reload and try again.');
      }
    });
    return (await this.store.get(id))!;
  }

  async cancel(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<ResellerPayout> {
    await this.due(id, rowVersion);
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      if (!(await this.store.settle(id, rowVersion, { status: 'CANCELLED' }))) throw new ConcurrencyError('Someone else changed this payout. Reload and try again.');
    });
    return (await this.store.get(id))!;
  }

  async attributions(partnerId: string): Promise<ResellerAttribution[]> {
    if (!(await this.store.partner(partnerId))) throw new NotFoundError('Reseller not found');
    return this.store.attributions(partnerId);
  }

  /** Attributes a company to the partner (one partner per company) or ends its attribution. */
  async attribute(admin: AdminSession, meta: RequestMeta, partnerId: string, input: ResellerAttributionInput): Promise<ResellerAttribution[]> {
    const partner = await this.store.partner(partnerId);
    if (!partner) throw new NotFoundError('Reseller not found');
    const tenant = await this.store.tenant(input.tenantId);
    if (!tenant) throw new ValidationError('Choose an existing company', { tenantId: ['Unknown company'] });
    const today = todayPk();
    const current = await this.store.attributions(partnerId);
    const keep = current.map((a) => ({ id: a.id }));
    const existing = await this.store.attributionOfTenant(input.tenantId);
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      if (input.action === 'end') {
        const row = current.find((a) => a.tenantId === input.tenantId && !a.endedOn);
        if (!row) throw new ConflictError(`${tenant.name} is not attributed to ${partner.name}.`, undefined, { code: 'CONFLICT' });
        const endedOn = input.endedOn ?? today;
        if (endedOn < row.attributedOn) throw new ValidationError('Ends before it started', { endedOn: [`On or after ${row.attributedOn}`] });
        await this.store.saveAttributions(partnerId, keep.map((k) => (k.id === row.id ? { id: row.id, endedOn } : k)));
        return;
      }
      if (partner.status !== 'ACTIVE') throw new ConflictError(`${partner.name} is ${partner.status.toLowerCase()}: reactivate it first.`, undefined, { code: 'CONFLICT' });
      const attributedOn = input.attributedOn ?? today;
      const override = input.commissionPctOverride ?? null;
      if (existing && existing.partnerId !== partnerId) {
        if (!existing.endedOn || existing.endedOn > today) {
          throw new ConflictError(`${tenant.name} is attributed to ${existing.partnerName}. End that attribution first.`, undefined, { code: 'RESELLER_TENANT_ATTRIBUTED' });
        }
        await this.store.reassign(existing.id, partnerId, attributedOn, override);
        return;
      }
      if (existing) {
        await this.store.saveAttributions(partnerId, keep.map((k) => (k.id === existing.id ? { id: existing.id, attributedOn, endedOn: null, commissionPctOverride: override } : k)));
        return;
      }
      await this.store.saveAttributions(partnerId, [...keep, { tenantId: input.tenantId, attributedOn, commissionPctOverride: override }]);
    });
    return this.store.attributions(partnerId);
  }

  private async due(id: string, rowVersion: number) {
    const p = await this.store.get(id);
    if (!p) throw new NotFoundError('Payout not found');
    if (p.status !== 'DUE') throw settled(p.status);
    if (p.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this payout. Reload and try again.');
    return p;
  }
}
