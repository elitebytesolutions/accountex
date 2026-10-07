import type { MovementReason } from '../../../../../shared/index.js';

export abstract class ReasonStore {
  abstract list(tenantId: string): Promise<MovementReason[]>;
  /** Codes of deleted reasons per direction (from row history: the table has no soft delete). */
  abstract retiredCodes(tenantId: string, direction: string): Promise<string[]>;
  /** Active postable expense accounts (class 5) for the reason form. */
  abstract expenseAccounts(tenantId: string): Promise<{ id: string; code: string; name: string }[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract delete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
