import { z } from 'zod';
import { patchFields } from '../common/list-query.ts';
import { issues, optDate, optId, optInt, rowVersion } from './fields.ts';

/**
 * Phase 36: subscription coupons (Platform.SubscriptionCoupons) with the plans they apply to (SubscriptionCouponPlans).
 * Redemptions (SubscriptionCouponRedemptions) are written by billing (Phase 41) and read-only here.
 */
export const COUPON_DISCOUNT_TYPES = ['PERCENT', 'FLAT'] as const;
export const COUPON_DURATIONS = ['ONCE', 'MONTHS_3', 'MONTHS_6', 'MONTHS_12', 'FOREVER'] as const;
export const COUPON_STATUSES = ['SCHEDULED', 'ACTIVE', 'PAUSED', 'EXPIRED'] as const;

export type Coupon = {
  id: string; code: string; discountType: string; discountValue: number; duration: string; redemptionCap: number | null;
  startsOn: string; expiresOn: string | null; newCustomersOnly: boolean; stackableWithPartner: boolean;
  partner: { id: string; name: string } | null;
  /** Stored status; a live coupon outside its dates shows as SCHEDULED / EXPIRED (couponStatus). */
  status: string;
  planIds: string[];
  redemptions: number;
  rowVersion: number;
};
export type CouponRedemption = {
  id: string; tenant: { id: string; name: string }; redeemedAt: string; discountPerInvoice: number; monthsRemaining: number | null; status: string;
};
export type PartnerOption = { id: string; name: string };

/** Status a coupon is in today: PAUSED stays; otherwise its dates decide (SCHEDULED before start, EXPIRED after end). */
export function couponStatus(c: { status: string; startsOn: string; expiresOn: string | null }, today: string): string {
  if (c.status === 'PAUSED') return 'PAUSED';
  if (c.expiresOn && c.expiresOn < today) return 'EXPIRED';
  if (c.startsOn > today) return 'SCHEDULED';
  return 'ACTIVE';
}

type CouponShape = { discountType?: string; discountValue?: number; startsOn?: string | null; expiresOn?: string | null };
/** Percent at most 100; expiry not before the start (the DB checks both: couponPercentChk, couponDatesChk). */
export function couponErrors(c: CouponShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (c.discountType === 'PERCENT' && (c.discountValue ?? 0) > 100) e.discountValue = 'At most 100%';
  if (c.startsOn && c.expiresOn && c.expiresOn < c.startsOn) e.expiresOn = 'Expires before it starts';
  return e;
}

const CouponFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{4,24}$/, '4–24 letters, digits or dashes'),
  discountType: z.enum(COUPON_DISCOUNT_TYPES),
  discountValue: z.coerce.number('Enter a value').gt(0, 'More than 0').max(100_000_000),
  duration: z.enum(COUPON_DURATIONS),
  /** Blank = unlimited. */
  redemptionCap: optInt(1, 10_000_000, 'More than 0'),
  startsOn: z.iso.date('Choose a start date'),
  expiresOn: optDate,
  newCustomersOnly: z.boolean().default(true),
  stackableWithPartner: z.boolean().default(false),
  /** A reseller (Phase 38) the coupon belongs to. */
  partnerId: optId,
  planIds: z.array(z.uuid()).min(1, 'Pick at least one plan').max(50),
};
export const CouponCreateSchema = z.object(CouponFields).superRefine(issues(couponErrors));
export type CouponCreate = z.infer<typeof CouponCreateSchema>;
export const CouponUpdateSchema = patchFields(CouponFields).extend({ rowVersion });
export type CouponUpdate = z.infer<typeof CouponUpdateSchema>;
export const CouponStatusInputSchema = z.object({ rowVersion });
export type CouponStatusInput = z.infer<typeof CouponStatusInputSchema>;
