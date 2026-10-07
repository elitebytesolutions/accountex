import type { BankRule } from '../../../../../shared/index.js';

export abstract class BankRuleStore {
  abstract list(tenantId: string): Promise<BankRule[]>;
  /** Codes of all rules ever created (deleted ones included): codes are never reused. */
  abstract allCodes(tenantId: string): Promise<string[]>;
  abstract retiredCodes(tenantId: string): Promise<string[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract setPriorities(tenantId: string, order: { id: string; priority: number }[]): Promise<void>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract activeBankAccount(tenantId: string, id: string): Promise<boolean>;
  abstract activeCostCentre(tenantId: string, id: string): Promise<boolean>;
}
