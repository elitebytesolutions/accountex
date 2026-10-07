import type { AllocationRule, AllocationRuleSave, CostCentre, CostCentreCreate, Project, ProjectCreate } from '../../../../../shared/index.js';

/** Port: cost centres, projects and cost-allocation rules. Writes run inside a UnitOfWork. */
export abstract class CostStore {
  abstract centres(tenantId: string): Promise<CostCentre[]>;
  /** Codes of soft-deleted centres / projects: codes are never reused (unique per tenant including deleted rows). */
  abstract retiredCodes(tenantId: string, kind: 'centre' | 'project'): Promise<string[]>;
  abstract saveCentre(data: Partial<CostCentreCreate> & { id?: string; rowVersion?: number; status?: string }): Promise<string>;
  abstract deleteCentre(tenantId: string, id: string, rowVersion: number): Promise<void>;

  abstract projects(tenantId: string): Promise<Project[]>;
  /** Tags are replaced as a set when given. */
  abstract saveProject(tenantId: string, data: Partial<ProjectCreate> & { id?: string; rowVersion?: number }): Promise<string>;
  abstract deleteProject(tenantId: string, id: string, rowVersion: number): Promise<void>;

  abstract rules(tenantId: string): Promise<AllocationRule[]>;
  /** Splits are replaced as a whole; the database checks an active rule totals 100% at commit. */
  abstract saveRule(data: AllocationRuleSave & { id?: string; rowVersion?: number }): Promise<string>;
  abstract deleteRule(tenantId: string, id: string): Promise<void>;

  /** Whether the account is an active postable account of this company. */
  abstract postableAccount(tenantId: string, id: string): Promise<boolean>;
  abstract activeBranch(tenantId: string, id: string): Promise<boolean>;
}
