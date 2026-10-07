import type { DocumentType, NumberingSeries } from '../../../../../shared/index.js';

/** Port: the tenant's numbering series (with live preview) and the global document types. */
export abstract class NumberingStore {
  abstract list(tenantId: string): Promise<NumberingSeries[]>;
  abstract get(tenantId: string, id: string): Promise<NumberingSeries | null>;
  /** Insert or update through Company.numberingSeriesAddUpdate. */
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** The database refuses once numbers were issued (NUMBERING_IN_USE). */
  abstract delete(tenantId: string, id: string): Promise<boolean>;
  abstract documentTypes(): Promise<DocumentType[]>;
}
