/**
 * What flag rules and segment rules can look at for one tenant (and, in the workspace, the signed-in user's roles).
 * Built by infrastructure from Platform.Tenants + the live subscription's plan; pure data here.
 */
export type TenantFacts = {
  id: string;
  code: string;
  name: string;
  /** SubscriptionPlans.code of the live subscription (TRIAL / ACTIVE / PAST_DUE / SUSPENDED), or null. */
  planCode: string | null;
  planId: string | null;
  /** Tenants.province (lookup Province). */
  region: string | null;
  city: string | null;
  industry: string | null;
  /** Days since the tenant was created. */
  ageDays: number | null;
  appVersion: string | null;
  platforms: string[];
  /** Role keys of the signed-in user (empty when evaluating a tenant without a user). */
  roles: string[];
  isBeta: boolean;
  isInternal: boolean;
  salesTaxRegistered: boolean | null;
};

/**
 * Port: is the tenant in the segment with this key ("segment.beta")? Resolved through the segment matcher
 * (TenantSegments rules + SegmentTenants include / exclude). Unknown or deleted segments → false.
 */
export interface SegmentMembership {
  isMember(segmentKey: string, tenant: TenantFacts): boolean;
}

/** Port: does the tenant have this platform module (enabled, and core or included in the tenant's plan)? */
export interface ModuleAccess {
  hasModule(moduleId: string, tenant: TenantFacts): boolean;
}
