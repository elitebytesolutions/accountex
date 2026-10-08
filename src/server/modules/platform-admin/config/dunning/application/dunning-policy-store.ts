import type { DunningPolicy } from '../../../../../../shared/index.js';

/** Port: Platform.DunningPolicies (writes through Platform.dunningPolicyAddUpdate). */
export abstract class DunningPolicyStore {
  abstract list(): Promise<DunningPolicy[]>;
  abstract get(id: string): Promise<DunningPolicy | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Clears isActive on every other policy (one active policy: partial unique index dunningPolicyOneActive). */
  abstract deactivateOthers(id: string): Promise<void>;
  abstract remove(id: string, rowVersion: number): Promise<void>;
}
