import type { EntitlementChangeSet } from '../../../../../../shared/index.js';

export type EntitlementLogRow = {
  changeKind: 'FEATURE' | 'LIMIT' | 'ADDON_PRICE'; planId: string | null; platformModuleId: string | null; usageMeterId: string | null; addonId: string | null;
  fromValue: unknown; toValue: unknown; tenantsAffected: number; impactTone: string;
};

/** Port: Platform.EntitlementChangeLogs (append-only; Phase 43). */
export abstract class EntitlementLogStore {
  abstract write(changeSetId: string, staffId: string, flags: { grandfatherUntilRenewal: boolean; emailOwners: boolean; postChangelog: boolean }, rows: EntitlementLogRow[]): Promise<void>;
  /** Change sets, newest first, with their rows. */
  abstract changeSets(limit: number): Promise<EntitlementChangeSet[]>;
}
