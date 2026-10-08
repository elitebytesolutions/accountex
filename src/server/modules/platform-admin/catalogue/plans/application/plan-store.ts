import type { SubscriptionPlan, UsageMeterOption } from '../../../../../../shared/index.js';

/** Port: subscription plans with their features and limits (Platform schema). */
export abstract class PlanStore {
  abstract list(): Promise<SubscriptionPlan[]>;
  abstract get(id: string): Promise<SubscriptionPlan | null>;
  abstract allCodes(): Promise<{ id: string; code: string }[]>;
  /** Platform.subscriptionPlanAddUpdate (features[] / limits[] replace the plan's rows). Returns the id. */
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Active public plans other than `exceptId`. */
  abstract activePublicCount(exceptId: string): Promise<number>;
  /** A new version takes over the old plan's module inclusion, add-on availability, coupons and module minimums. */
  abstract copyLinks(fromPlanId: string, toPlanId: string): Promise<void>;
  /** Anything outside the plan's own link tables points at it (subscriptions, invoices, leads, alert rules, …)? */
  abstract inUse(id: string): Promise<boolean>;
  /** Deletes an unused plan with its features, limits and link rows. */
  abstract remove(id: string, rowVersion: number): Promise<void>;
  abstract usageMeters(): Promise<UsageMeterOption[]>;
}
