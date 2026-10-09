import type { Budget, BudgetOptions, BudgetQuery, BudgetVersion } from '../../../../../shared/index.js';

export type SeedLine = { accountId: string; costCentreId: string | null; months: number[] };
export type VarianceRow = { accountId: string; accountCode: string; accountName: string; accountClass: number; costCentreId: string | null; costCentreCode: string | null; costCentreName: string | null; monthNo: number; budget: number; actual: number };

/** Persistence for budgets, versions and their account × month lines (Accounting schema). */
export abstract class BudgetStore {
  abstract options(tenantId: string): Promise<BudgetOptions>;
  abstract list(tenantId: string, q: BudgetQuery): Promise<{ items: Budget[]; total: number }>;
  abstract get(tenantId: string, id: string): Promise<Budget | null>;
  abstract version(tenantId: string, versionId: string): Promise<(BudgetVersion & { budgetId: string }) | null>;
  abstract nextCode(tenantId: string, year: number): Promise<string>;
  /** Posted actuals of a fiscal year per account and month (revenue as credit − debit, the rest as debit − credit). */
  abstract actuals(tenantId: string, fiscalYearId: string): Promise<SeedLine[]>;
  /** The approved (else latest) version's lines of the same type's budget for a fiscal year. */
  abstract priorBudgetLines(tenantId: string, fiscalYearId: string, budgetType: string): Promise<SeedLine[]>;
  abstract previousYear(tenantId: string, fiscalYearId: string): Promise<string | null>;
  /** Budget vs actual rows of a version (Accounting.getBudgetVsActual). */
  abstract variance(tenantId: string, versionId: string): Promise<VarianceRow[]>;
  /** Actual to date of each budget's current version (for the list). */
  abstract actualToDate(tenantId: string, versionIds: string[]): Promise<Map<string, number>>;

  abstract create(tenantId: string, budget: Record<string, unknown>, lines: SeedLine[]): Promise<string>;
  abstract replaceLines(tenantId: string, versionId: string, lines: SeedLine[]): Promise<void>;
  abstract newVersion(tenantId: string, budgetId: string): Promise<string>;
  abstract submit(versionId: string): Promise<void>;
  abstract approve(versionId: string): Promise<void>;
  /** Deletes a budget that was never approved (versions and lines first); false when it changed. */
  abstract remove(tenantId: string, id: string, rowVersion: number): Promise<boolean>;
}
