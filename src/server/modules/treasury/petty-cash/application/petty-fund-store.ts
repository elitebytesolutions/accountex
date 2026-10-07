import type { PettyCashFund } from '../../../../../shared/index.js';

export abstract class PettyFundStore {
  abstract list(tenantId: string): Promise<PettyCashFund[]>;
  /** Whether a fund (deleted ones included) already sits on this cash account: one fund per cash account. */
  abstract accountTaken(tenantId: string, cashAccountId: string): Promise<boolean>;
  /** Active users (id and name only): custodian choices for anyone who manages cash. */
  abstract activeUsers(tenantId: string): Promise<{ id: string; name: string }[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
