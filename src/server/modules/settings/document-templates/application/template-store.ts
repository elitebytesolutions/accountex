import type { DocumentTemplate, DocumentTemplateSave } from '../../../../../shared/index.js';

/** Port: print/PDF layouts (Company.DocumentTemplates). Writes run inside a UnitOfWork. */
export abstract class TemplateStore {
  abstract list(tenantId: string): Promise<DocumentTemplate[]>;
  abstract get(tenantId: string, id: string): Promise<DocumentTemplate | null>;
  /** Insert or update (Company.documentTemplateAddUpdate). New templates start ACTIVE, version 1. */
  abstract save(data: DocumentTemplateSave & { id?: string; rowVersion?: number; version?: number }): Promise<string>;
  /** Company.setDefaultDocumentTemplate: the previous default of the same kind is cleared. */
  abstract setDefault(id: string): Promise<void>;
  abstract setStatus(id: string, rowVersion: number, status: 'ACTIVE' | 'ARCHIVED'): Promise<void>;
  abstract softDelete(id: string, rowVersion: number): Promise<void>;
}
