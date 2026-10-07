import type { FiscalYear, PeriodModule } from '../../../../../shared/index.js';

export type PeriodState = { id: string; fiscalYearId: string; status: string; rowVersion: number; modules: Record<string, string> };

/** Port: the company's fiscal calendar. Writes run inside a UnitOfWork. */
export abstract class FiscalStore {
  /** Years (newest first) with their periods, module states and voucher counts. */
  abstract list(tenantId: string): Promise<FiscalYear[]>;
  /** Day after the latest year's end, or null when there is none. */
  abstract nextStart(tenantId: string): Promise<string | null>;
  /** Fiscal year start month (company settings, else the tenant's). */
  abstract startMonth(tenantId: string): Promise<number>;
  /** Accounting.createFiscalYear: the year and its monthly periods (+ P13). */
  abstract create(startDate: string, adjustment: boolean): Promise<string>;
  abstract period(tenantId: string, id: string): Promise<PeriodState | null>;
  /** Sets the period status (the database guard checks open vouchers and stamps who/when). */
  abstract setPeriodStatus(tenantId: string, id: string, rowVersion: number, status: 'OPEN' | 'CLOSED' | 'LOCKED'): Promise<void>;
  /** Sets the given modules of a period to a status (rows are created as needed). */
  abstract setModules(tenantId: string, periodId: string, modules: PeriodModule[], status: 'OPEN' | 'CLOSED' | 'LOCKED', userId: string): Promise<void>;
}
