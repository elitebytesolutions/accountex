import type { Subscription, SubscriptionEvent } from '../../../../../../shared/index.js';

export type PlanForBilling = {
  id: string; code: string; name: string; status: string; priceMonthly: number; priceAnnual: number | null; trialDays: number; userSeats: number | null;
};
export type SubscriptionWrite = {
  planId?: string; billingCycle?: string; amount?: number; seats?: number | null; trialEndsOn?: string | null;
  currentPeriodStart?: string; currentPeriodEnd?: string; nextRenewalOn?: string | null; paymentMethod?: string | null;
  autoRenew?: boolean; status?: string; cancelledAt?: Date | null; cancelReason?: string | null; cancelAtPeriodEnd?: boolean;
};
export type NewSubscription = SubscriptionWrite & {
  tenantId: string; planId: string; billingCycle: string; amount: number; startsOn: string; currentPeriodStart: string; currentPeriodEnd: string; status: string;
};
export type NewSubscriptionEvent = {
  subscriptionId: string; tenantId: string; eventType: string; effectiveOn?: string; fromPlanId?: string | null; toPlanId?: string | null;
  fromSeats?: number | null; toSeats?: number | null; mrrBefore: number; mrrAfter: number; movement: string; trialDaysAdded?: number | null;
  staffUserId: string | null; note?: string | null;
};

/** Port: Platform.Subscriptions + SubscriptionEvents (writes run inside the admin's UnitOfWork). */
export abstract class SubscriptionStore {
  abstract list(): Promise<Subscription[]>;
  abstract get(id: string): Promise<Subscription | null>;
  abstract events(id: string): Promise<SubscriptionEvent[]>;
  abstract liveForTenant(tenantId: string): Promise<Subscription | null>;
  abstract plan(id: string): Promise<PlanForBilling | null>;
  abstract tenantStatus(tenantId: string): Promise<string | null>;
  abstract insert(data: NewSubscription): Promise<string>;
  /** Updates when rowVersion still matches; false when stale. */
  abstract update(id: string, rowVersion: number, data: SubscriptionWrite): Promise<boolean>;
  abstract addEvent(e: NewSubscriptionEvent): Promise<void>;
  /** Live subscriptions whose period (or trial) ends on or before `today`. */
  abstract due(today: string): Promise<Subscription[]>;
  abstract movement(since: string): Promise<{ movement: string; amount: number; count: number }[]>;
}
