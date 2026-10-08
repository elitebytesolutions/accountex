import type {
  FlagAuditEntry,
  FlagDefaultRuleInput,
  FlagDetail,
  FlagListItem,
  FlagListQuery,
  FlagOptions,
  FlagRuleInput,
  FlagSummary,
} from '../../../../../shared/index.js';
import type { EvalDefaultRule } from '../domain/flag-evaluator.js';

/** A prerequisite row as written through Platform.featureFlagAddUpdate (every environment's rows in one array). */
export type PrerequisiteRow = {
  id?: string;
  flagEnvironmentId: string;
  prerequisiteFlagId: string | null;
  requiredVariationIdx: number | null;
  prerequisiteModuleId: string | null;
};

export type FlagAuditWrite = {
  flagId: string;
  environment: 'DEV' | 'STAGING' | 'PRODUCTION' | 'ALL';
  eventKind: 'CREATED' | 'TOGGLED' | 'KILL_SWITCH' | 'TARGETING' | 'LIFECYCLE' | 'ARCHIVED' | 'RESTORED';
  summary: string;
  before: unknown;
  after: unknown;
  isEmergency?: boolean;
};

/** Port: feature flags persistence (Platform.FeatureFlags and its per-environment tables). */
export abstract class FlagStore {
  abstract list(query: FlagListQuery): Promise<FlagListItem[]>;
  abstract detail(id: string): Promise<FlagDetail | null>;
  abstract keyExists(key: string): Promise<boolean>;
  abstract summary(): Promise<FlagSummary>;
  abstract audit(flagId: string, limit: number): Promise<FlagAuditEntry[]>;
  abstract options(): Promise<FlagOptions>;
  /** Platform.featureFlagAddUpdate (flag + environments + variations + prerequisites). Returns the flag id. */
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Every prerequisite row of the flag, all environments (to pass back whole to featureFlagAddUpdate). */
  abstract prerequisiteRows(flagId: string): Promise<(PrerequisiteRow & { id: string })[]>;
  /** Flag → prerequisite-flag edges of one environment (for the cycle check). */
  abstract prerequisiteEdges(environment: string): Promise<Map<string, string[]>>;
  /** FlagVariations row id by idx (featureFlagAddUpdate updates rows by id). */
  abstract variationIds(flagId: string): Promise<Map<number, string>>;
  /** Number of variations of each flag. */
  abstract variationCounts(flagIds: string[]): Promise<Map<string, number>>;
  /**
   * Bumps FlagEnvironments.rowVersion when it still equals `rowVersion` (optimistic check) and sets isOn.
   * Returns false when the row changed meanwhile.
   */
  abstract touchEnvironment(envId: string, rowVersion: number, isOn: boolean): Promise<boolean>;
  /** Direct writes of one environment's rules (by position), targets (by tenant) and default rule. */
  abstract writeTargeting(flagId: string, envId: string, t: { rules: FlagRuleInput[]; targets: { tenantId: string; variationIdx: number }[]; defaultRule: FlagDefaultRuleInput }): Promise<void>;
  /** Creates the default rule row of each environment (new flags). */
  abstract createDefaultRules(flagId: string, rule: EvalDefaultRule): Promise<void>;
  /** Copies targeting (rules, targets, default rules, prerequisites) from one flag to another, environment by environment. */
  abstract copyTargeting(fromFlagId: string, toFlagId: string): Promise<void>;
  /** Platform.flagAuditWrite: one append-only FlagAuditLogs row, attributed to app.userId. */
  abstract writeAudit(entry: FlagAuditWrite): Promise<void>;
}
