import type { CompanySettings } from '../../../../../shared/index.js';

/** Port: the tenant's single Company.CompanySettings row. */
export abstract class CompanySettingsStore {
  /** The saved row, or null when the profile has never been saved. */
  abstract get(tenantId: string): Promise<CompanySettings | null>;
  /** The database column defaults, shown before the first save. */
  abstract defaults(): CompanySettings;
  /** Insert (no id) or partial update through Company.companySettingAddUpdate. */
  abstract save(data: Record<string, unknown>): Promise<string>;
}
