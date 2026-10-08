import type { PayrollOptions, SalaryComponent } from '../../../../../shared/index.js';

export abstract class ComponentStore {
  abstract list(tenantId: string): Promise<SalaryComponent[]>;
  abstract options(tenantId: string): Promise<PayrollOptions>;
  /** Every code ever used, deleted components included (codes are never reused). */
  abstract allCodes(tenantId: string): Promise<{ code: string; deleted: boolean }[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
