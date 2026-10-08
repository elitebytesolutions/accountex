import type { Coupon, CouponRedemption, PartnerOption } from '../../../../../../shared/index.js';

/** Port: subscription coupons, the plans they apply to and their (read-only) redemptions. */
export abstract class CouponStore {
  abstract list(): Promise<Coupon[]>;
  abstract get(id: string): Promise<Coupon | null>;
  /** Every code in use (case-insensitive), deleted coupons included. */
  abstract allCodes(): Promise<{ id: string; code: string; deleted: boolean }[]>;
  abstract planExists(id: string): Promise<boolean>;
  abstract partnerExists(id: string): Promise<boolean>;
  /** The coupon's SubscriptionCouponPlans rows. */
  abstract planLinks(id: string): Promise<{ id: string; planId: string }[]>;
  /** Platform.subscriptionCouponAddUpdate (plans[] replace the coupon's rows). Returns the id. */
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Redemptions or invoices use it? */
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(id: string, rowVersion: number): Promise<void>;
  abstract redemptions(id: string): Promise<CouponRedemption[]>;
  abstract partners(): Promise<PartnerOption[]>;
}
