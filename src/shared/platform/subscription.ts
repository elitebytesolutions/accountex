import { z } from 'zod';
import { rowVersion } from './fields.ts';

/**
 * Phase 40: subscriptions (Platform.Subscriptions) and their event history (SubscriptionEvents, append-only). Every
 * change writes an event with the MRR before / after and the movement (NEW, EXPANSION, CONTRACTION, CHURN,
 * REACTIVATION, NONE), which the SaaS analytics read. MRR is the monthly equivalent of the price (annual / 12); a
 * trial earns no MRR until it converts.
 */
export const SUBSCRIPTION_LIVE: readonly string[] = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'];
export const BILLING_CYCLES = ['MONTHLY', 'ANNUAL'] as const;
export const TRIAL_EXTENSIONS = [7, 14, 30] as const;

/** The movement a change of MRR is (same rule as subscriptionEventMovementChk). */
export function mrrMovement(before: number, after: number, reactivation = false): string {
  if (reactivation && after > 0) return 'REACTIVATION';
  if (before === 0 && after > 0) return 'NEW';
  if (after > before) return 'EXPANSION';
  if (after < before && after > 0) return 'CONTRACTION';
  if (after === 0 && before > 0) return 'CHURN';
  return 'NONE';
}

export type SubscriptionEvent = {
  id: string; eventType: string; occurredAt: string; effectiveOn: string; fromPlan: string | null; toPlan: string | null;
  fromSeats: number | null; toSeats: number | null; mrrBefore: number; mrrAfter: number; mrrDelta: number | null; movement: string;
  trialDaysAdded: number | null; note: string | null; staff: string | null;
};
export type Subscription = {
  id: string; tenantId: string; tenantCode: string; tenantName: string; planId: string; planCode: string; planName: string;
  billingCycle: string; amount: number; seats: number | null; startsOn: string; trialEndsOn: string | null;
  currentPeriodStart: string; currentPeriodEnd: string; nextRenewalOn: string | null; paymentMethod: string | null;
  autoRenew: boolean; status: string; cancelledAt: string | null; cancelReason: string | null; cancelAtPeriodEnd: boolean;
  mrrAmount: number; rowVersion: number;
};
export type SubscriptionDetail = Subscription & { events: SubscriptionEvent[] };
export type SubscriptionKpis = { mrr: number; annualContracts: number; renewals30d: number; pastDue: number; trials: number };
export type SubscriptionList = { items: Subscription[]; kpis: SubscriptionKpis; trialsExpiring: Subscription[]; movement: { movement: string; amount: number; count: number }[] };

export const SubscriptionCreateSchema = z.object({
  tenantId: z.uuid('Choose a company'),
  planId: z.uuid('Choose a plan'),
  billingCycle: z.enum(BILLING_CYCLES).default('MONTHLY'),
  seats: z.coerce.number().int().min(1).max(100_000).optional(),
  startTrial: z.boolean().default(false),
  paymentMethod: z.string().trim().max(40).optional().nullable(),
});
export type SubscriptionCreate = z.infer<typeof SubscriptionCreateSchema>;

export const SubscriptionChangePlanSchema = z.object({
  rowVersion,
  planId: z.uuid('Choose a plan'),
  billingCycle: z.enum(BILLING_CYCLES).optional(),
  seats: z.coerce.number().int().min(1).max(100_000).optional(),
  note: z.string().trim().max(300).optional(),
});
export type SubscriptionChangePlan = z.infer<typeof SubscriptionChangePlanSchema>;

export const SubscriptionCancelSchema = z.object({
  rowVersion,
  reason: z.string().trim().min(3, 'Give the reason').max(300),
  atPeriodEnd: z.boolean().default(true),
});
export type SubscriptionCancel = z.infer<typeof SubscriptionCancelSchema>;

export const SubscriptionActionSchema = z.object({ rowVersion, note: z.string().trim().max(300).optional() });
export type SubscriptionAction = z.infer<typeof SubscriptionActionSchema>;

export const SubscriptionExtendTrialSchema = z.object({
  rowVersion,
  days: z.union([z.literal(7), z.literal(14), z.literal(30)]),
});
export type SubscriptionExtendTrial = z.infer<typeof SubscriptionExtendTrialSchema>;

export type RenewalRunResult = { renewed: number; converted: number; expired: number; ids: string[] };
