import { z } from 'zod';

/**
 * Phase 40: usage (Platform.UsageMeters, UsageSnapshots, UsageLimitOverrides). Snapshots are taken by
 * Platform.captureUsageSnapshots ("Refresh usage"); the limit in force is a live override, else the plan limit.
 * Bands: OK below 80 %, NEAR from 80 %, AT 100 %, OVER above (Platform.getCurrentUsage).
 */
export const OVERRIDE_EXPIRY_MODES = ['END_OF_CYCLE', 'DAYS_30', 'DAYS_90', 'NEVER'] as const;
export const BILL_OVERAGE = ['NO', 'PLAN_RATE', 'CUSTOM'] as const;

export type UsageMeter = { id: string; code: string; name: string; unit: string | null; icon: string | null; resetPeriod: string; sortOrder: number };
export type UsageRow = {
  tenantId: string; tenantCode: string; tenantName: string; planCode: string | null; meterId: string; meterCode: string; meterName: string;
  unit: string | null; snapshotDate: string; usedValue: number; limitValue: number | null; planLimitValue: number | null;
  overrideLimitValue: number | null; overrideExpiresOn: string | null; pct: number | null; band: string;
};
export type UsageOverride = {
  id: string; tenantId: string; tenantName: string; meterId: string; meterName: string; previousLimit: number | null; limitValue: number;
  expiryMode: string; expiresOn: string | null; billOverage: string; customPrice: number | null; reason: string;
  appliedBy: string | null; revokedAt: string | null; createdAt: string; rowVersion: number;
};
export type UsageOverview = {
  meters: UsageMeter[];
  rows: UsageRow[];
  overrides: UsageOverride[];
  kpis: { tenants: number; near: number; over: number; overrides: number; lastSnapshot: string | null };
};

/** The expiry date an override's mode gives (END_OF_CYCLE = the subscription's current period end). */
export function overrideExpiry(mode: string, today: string, periodEnd: string | null): string | null {
  const add = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
  switch (mode) {
    case 'DAYS_30': return add(30);
    case 'DAYS_90': return add(90);
    case 'END_OF_CYCLE': return periodEnd ?? add(30);
    default: return null;
  }
}

export const UsageOverrideCreateSchema = z.object({
  tenantId: z.uuid('Choose a company'),
  usageMeterId: z.uuid('Choose a meter'),
  limitValue: z.coerce.number('Enter the new limit').gt(0, 'More than 0').max(1_000_000_000_000),
  expiryMode: z.enum(OVERRIDE_EXPIRY_MODES).default('END_OF_CYCLE'),
  billOverage: z.enum(BILL_OVERAGE).default('NO'),
  customPrice: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().min(0).max(100_000_000).nullable()),
  reason: z.string().trim().min(3, 'Give the reason').max(300),
}).refine((o) => o.billOverage !== 'CUSTOM' || o.customPrice !== null, { path: ['customPrice'], message: 'Set the custom overage price' });
export type UsageOverrideCreate = z.infer<typeof UsageOverrideCreateSchema>;

export const UsageQuerySchema = z.object({ tenantId: z.uuid().optional() });
