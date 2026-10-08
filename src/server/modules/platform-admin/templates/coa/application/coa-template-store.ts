import type { CoaTemplate, CoaTemplateDetail } from '../../../../../../shared/index.js';

/** Port: chart-of-accounts templates with their account trees (Platform schema). Writes run inside a UnitOfWork. */
export abstract class CoaTemplateStore {
  abstract list(): Promise<CoaTemplate[]>;
  abstract get(id: string): Promise<CoaTemplateDetail | null>;
  abstract allCodes(): Promise<{ id: string; code: string }[]>;
  /** Platform.chartOfAccountsTemplateAddUpdate (`accounts` replaces the tree). Returns the id. */
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Tenants (or anything else outside the template's own accounts) point at it? */
  abstract inUse(id: string): Promise<boolean>;
  /** Deletes the template and its accounts (both audited). */
  abstract remove(id: string, rowVersion: number): Promise<void>;
}
