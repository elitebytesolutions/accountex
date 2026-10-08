import { Injectable } from '@nestjs/common';
import { couponErrors, couponStatus, type AdminSession, type Coupon, type CouponCreate, type CouponUpdate } from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { statusFor, todayPk } from '../domain/coupon-rules.js';
import { CouponStore } from './coupon-store.js';

const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * Subscription coupons (Super Admin › Growth › Partners & Coupons, Coupons tab). Status follows the dates unless paused;
 * a coupon with redemptions or invoices can only be paused. Redemptions are read-only (billing writes them, Phase 41).
 */
@Injectable()
export class CouponsService {
  constructor(
    private readonly store: CouponStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /** Coupons with today's status (a live coupon past its expiry shows EXPIRED). */
  async list(): Promise<Coupon[]> {
    const today = todayPk();
    return (await this.store.list()).map((c) => ({ ...c, status: couponStatus(c, today) }));
  }

  async get(id: string): Promise<Coupon> {
    const c = await this.store.get(id);
    if (!c) throw new NotFoundError('Coupon not found');
    return { ...c, status: couponStatus(c, todayPk()) };
  }

  async redemptions(id: string) {
    await this.get(id);
    return this.store.redemptions(id);
  }

  partners() {
    return this.store.partners();
  }

  async create(admin: AdminSession, meta: RequestMeta, input: CouponCreate): Promise<Coupon> {
    await this.assertCodeFree(input.code, null);
    await this.checkLinks(input.partnerId, input.planIds);
    const { planIds, ...fields } = input;
    const status = statusFor({ paused: false, startsOn: input.startsOn, expiresOn: input.expiresOn }, todayPk());
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () =>
      this.store.save({ ...fields, status, plans: planIds.map((planId) => ({ planId })) }));
    return this.get(id);
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: CouponUpdate): Promise<Coupon> {
    const c = await this.current(id, input.rowVersion);
    const { rowVersion, planIds, ...rest } = input;
    const patch = defined(rest) as Partial<CouponUpdate>;
    const next = { ...c, ...patch };
    const e = couponErrors(next);
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
    if (patch.code && patch.code !== c.code.toUpperCase()) await this.assertCodeFree(patch.code, id);
    await this.checkLinks(patch.partnerId, planIds ?? []);
    const status = statusFor({ paused: c.status === 'PAUSED', startsOn: next.startsOn, expiresOn: next.expiresOn ?? null }, todayPk());
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      const links = planIds ? await this.store.planLinks(id) : [];
      // Existing plan rows keep their id (no history churn); new plans are inserted, missing ones removed.
      const plans = planIds?.map((planId) => {
        const link = links.find((l) => l.planId === planId);
        return link ? { id: link.id, planId } : { planId };
      });
      await this.store.save({ ...patch, id, rowVersion, status, ...(plans && { plans }) });
    });
    return this.get(id);
  }

  /** Paused codes stop working at checkout; existing redemptions keep their discount. */
  async pause(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<Coupon> {
    const c = await this.current(id, rowVersion);
    if (c.status === 'PAUSED') return c;
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion, status: 'PAUSED' }));
    return this.get(id);
  }

  async resume(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<Coupon> {
    const c = await this.current(id, rowVersion);
    if (c.status !== 'PAUSED') return c;
    const status = statusFor({ paused: false, startsOn: c.startsOn, expiresOn: c.expiresOn }, todayPk());
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion, status }));
    return this.get(id);
  }

  /** Soft delete of a coupon nobody redeemed; a used coupon is paused instead. */
  async delete(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('This coupon has been redeemed or invoiced. Pause it instead.', undefined, { code: 'COUPON_IN_USE' });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.softDelete(id, rowVersion));
  }

  private async checkLinks(partnerId: string | null | undefined, planIds: string[]) {
    if (partnerId && !(await this.store.partnerExists(partnerId))) throw new ValidationError('Choose an existing partner', { partnerId: ['Unknown partner'] });
    for (const p of planIds) if (!(await this.store.planExists(p))) throw new ValidationError('Choose existing plans', { planIds: ['Unknown plan'] });
  }

  private async assertCodeFree(code: string, id: string | null) {
    const hit = (await this.store.allCodes()).find((c) => c.id !== id && c.code === code.toUpperCase());
    if (hit) {
      throw new ConflictError(hit.deleted ? `${code} belonged to a deleted coupon and can't be reused.` : `${code} already exists.`,
        { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
  }

  private async current(id: string, rowVersion: number) {
    const c = await this.get(id);
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this coupon. Reload and try again.');
    return c;
  }
}
