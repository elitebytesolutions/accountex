import type { ListResult, TalentListQuery, TrainingProgram } from '../../../../../shared/index.js';

export abstract class TrainingProgramStore {
  abstract page(tenantId: string, q: TalentListQuery): Promise<ListResult<TrainingProgram>>;
  abstract get(tenantId: string, id: string): Promise<TrainingProgram | null>;
  /** Every name in use, deleted programs included (the name stays unique per company). */
  abstract allNames(tenantId: string): Promise<{ id: string; name: string; deleted: boolean }[]>;
  abstract activeDepartment(tenantId: string, id: string): Promise<boolean>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
