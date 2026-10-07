import type { ListResult, OnboardingTemplate, TalentListQuery } from '../../../../../shared/index.js';

export abstract class OnboardingTemplateStore {
  abstract page(tenantId: string, q: TalentListQuery): Promise<ListResult<OnboardingTemplate>>;
  abstract get(tenantId: string, id: string): Promise<OnboardingTemplate | null>;
  /** Every name in use, deleted templates included (the name stays unique per company). */
  abstract allNames(tenantId: string): Promise<{ id: string; name: string; deleted: boolean }[]>;
  /** Live default templates of a track. */
  abstract defaults(tenantId: string, track: string): Promise<{ id: string }[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
