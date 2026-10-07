import type { ListResult, Scheme, SchemeListQuery, SchemeSummary } from '../../../../../shared/index.js';

export abstract class SchemeStore {
  abstract page(tenantId: string, q: SchemeListQuery, today: string): Promise<ListResult<Scheme>>;
  abstract summary(tenantId: string, today: string): Promise<SchemeSummary>;
  abstract get(tenantId: string, id: string): Promise<Scheme | null>;
  /** Every code ever used, deleted schemes included (codes are never reused). */
  abstract allCodes(tenantId: string): Promise<string[]>;
  abstract productsExist(tenantId: string, ids: string[]): Promise<boolean>;
  abstract groupsExist(tenantId: string, ids: string[]): Promise<boolean>;
  abstract customersExist(tenantId: string, ids: string[]): Promise<boolean>;
  abstract tierCodes(): Promise<string[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
