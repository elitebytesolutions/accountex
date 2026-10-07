import { Injectable } from '@nestjs/common';
import type { DocumentTemplate, DocumentTemplateSave } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { TemplateStore } from '../application/template-store.js';

@Injectable()
export class PrismaTemplateStore extends TemplateStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<DocumentTemplate[]> {
    const db = this.prisma.db();
    const [rows, types] = await Promise.all([
      db.documentTemplates.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
      db.documentTypes.findMany({ select: { code: true, name: true } }),
    ]);
    const typeName = new Map(types.map((t) => [t.code, t.name]));
    return rows.map((t) => ({
      id: t.id, name: t.name, category: t.category, docType: t.docType, letterKind: t.letterKind, paper: t.paper, headerLayout: t.headerLayout,
      language: t.language, showNtnStrn: t.showNtnStrn, showFbrQr: t.showFbrQr, showHsCodes: t.showHsCodes, showItemImages: t.showItemImages,
      showAmountInWords: t.showAmountInWords, showBankDetails: t.showBankDetails, bodyHtml: t.bodyHtml, version: t.version, isDefault: t.isDefault,
      status: t.status, rowVersion: t.rowVersion,
      docTypeName: t.docType ? (typeName.get(t.docType) ?? t.docType) : null,
      updatedAt: t.updatedAt.toISOString(),
    }));
  }

  async get(tenantId: string, id: string) {
    return (await this.list(tenantId)).find((t) => t.id === id) ?? null;
  }

  save(data: DocumentTemplateSave & { id?: string; rowVersion?: number; version?: number }) {
    return addUpdate(this.prisma, 'documentTemplateAddUpdate', data.id ? data : { ...data, status: 'ACTIVE', version: 1 });
  }

  async setDefault(id: string) {
    await this.prisma.db().$executeRaw`select "Company"."setDefaultDocumentTemplate"(${id}::uuid)`;
  }

  async setStatus(id: string, rowVersion: number, status: 'ACTIVE' | 'ARCHIVED') {
    const { count } = await this.prisma.db().documentTemplates.updateMany({ where: { id, rowVersion }, data: { status } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this template. Reload and try again.');
  }

  async softDelete(id: string, rowVersion: number) {
    const { count } = await this.prisma.db().documentTemplates.updateMany({ where: { id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this template. Reload and try again.');
  }
}
