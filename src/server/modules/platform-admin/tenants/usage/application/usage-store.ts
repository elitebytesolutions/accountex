import type { UsageMeter, UsageOverride, UsageRow } from '../../../../../../shared/index.js';

/** Port: Platform.UsageMeters / UsageSnapshots (getCurrentUsage) / UsageLimitOverrides. */
export abstract class UsageStore {
  abstract meters(): Promise<UsageMeter[]>;
  abstract current(tenantId?: string): Promise<UsageRow[]>;
  abstract overrides(liveOnly: boolean): Promise<UsageOverride[]>;
  abstract override(id: string): Promise<UsageOverride | null>;
  abstract liveOverride(tenantId: string, meterId: string): Promise<UsageOverride | null>;
  abstract tenantExists(tenantId: string): Promise<boolean>;
  abstract periodEnd(tenantId: string): Promise<string | null>;
  abstract currentLimit(tenantId: string, meterId: string): Promise<number | null>;
  /** Platform.captureUsageSnapshots for today (all companies, or one). Returns the rows written. */
  abstract capture(tenantId?: string): Promise<number>;
  abstract addOverride(o: {
    tenantId: string; usageMeterId: string; previousLimit: number | null; limitValue: number; expiryMode: string; expiresOn: string | null;
    billOverage: string; customPrice: number | null; reason: string; appliedByStaffId: string;
  }): Promise<string>;
  abstract revokeOverride(id: string, rowVersion: number): Promise<boolean>;
}
