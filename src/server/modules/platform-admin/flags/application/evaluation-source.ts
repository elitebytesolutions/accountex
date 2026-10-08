import type { EvalFlag } from '../domain/flag-evaluator.js';
import type { ModuleAccess, SegmentMembership, TenantFacts } from '../domain/tenant-facts.js';

/** A flag as evaluated in one environment, with what the API reports about it. */
export type EvaluableFlag = EvalFlag & { name: string; stage: string; variations: { idx: number; name: string; value: string }[] };

/** Port: everything the evaluator reads, loaded once per request. */
export abstract class EvaluationSource {
  /** Every flag (archived included, so prerequisites resolve) in one environment. */
  abstract flags(environment: string): Promise<EvaluableFlag[]>;
  /** One tenant by id or code; `roles` = the signed-in user's role keys, when there is one. */
  abstract tenant(ref: string, roles?: string[]): Promise<TenantFacts | null>;
  /** Every active tenant (for "Tenants served"). */
  abstract tenants(): Promise<TenantFacts[]>;
  /** The segment matcher over the current segments (Phase 38 tables). */
  abstract segments(): Promise<SegmentMembership>;
  abstract modules(): Promise<ModuleAccess>;
}
