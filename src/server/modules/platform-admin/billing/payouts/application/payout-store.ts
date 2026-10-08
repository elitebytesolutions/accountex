import type { ResellerAttribution, ResellerCommission, ResellerPayout } from '../../../../../../shared/index.js';

/** Port: Platform.ResellerPayouts, ResellerTenants, getResellerCommissions and resellerPayoutCalculate. */
export abstract class PayoutStore {
  abstract list(q: { partnerId?: string; month?: string }): Promise<ResellerPayout[]>;
  abstract get(id: string): Promise<ResellerPayout | null>;
  abstract commissions(): Promise<ResellerCommission[]>;
  /** Platform.resellerPayoutCalculate for the month (YYYY-MM-01). Returns how many payouts it created. */
  abstract calculate(monthStart: string): Promise<number>;
  /** Updates a DUE payout when rowVersion still matches; false when stale or no longer DUE. */
  abstract settle(id: string, rowVersion: number, data: { status: 'PAID' | 'CANCELLED'; paidOn?: string; paymentRef?: string; whtCertificateNo?: string | null }): Promise<boolean>;
  abstract partner(id: string): Promise<{ id: string; name: string; status: string } | null>;
  abstract tenant(id: string): Promise<{ id: string; name: string } | null>;
  abstract attributions(partnerId: string): Promise<ResellerAttribution[]>;
  abstract attributionOfTenant(tenantId: string): Promise<{ id: string; partnerId: string; partnerName: string; endedOn: string | null } | null>;
  /** Platform.resellerAddUpdate with its tenants array (every current row by id, plus the new / changed one). */
  abstract saveAttributions(partnerId: string, tenants: Record<string, unknown>[]): Promise<void>;
  /** Moves an ended attribution of another partner to this one (one row per company). */
  abstract reassign(id: string, partnerId: string, attributedOn: string, commissionPctOverride: number | null): Promise<void>;
}
