import type { Reseller } from '../../../../../../shared/index.js';

/** Port: Platform.Resellers (writes through Platform.resellerAddUpdate). Never returns the sealed IBAN. */
export abstract class ResellerStore {
  abstract list(): Promise<Reseller[]>;
  abstract get(id: string): Promise<Reseller | null>;
  /** Every name (deleted rows included: the name stays unique). */
  abstract allNames(): Promise<{ id: string; name: string; deleted: boolean }[]>;
  abstract inviteCodeTaken(code: string): Promise<boolean>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Linked tenants, payouts, leads or coupons. */
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(id: string, rowVersion: number): Promise<void>;
}
