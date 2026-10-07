/** A saved Company.SetupGuideSteps row. */
export interface StepState {
  stepKey: string;
  isDone: boolean;
  doneAt: string | null;
  autoDetected: boolean;
  rowVersion: number;
}

/** Port: the tenant's setup guide progress. */
export abstract class SetupGuideStore {
  abstract steps(tenantId: string): Promise<StepState[]>;
  abstract hasProfile(tenantId: string): Promise<boolean>;
  /** Insert or update the tenant's row for this step. */
  abstract setDone(tenantId: string, stepKey: string, done: boolean, userId: string): Promise<void>;
}
