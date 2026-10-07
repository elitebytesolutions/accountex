import { Injectable } from '@nestjs/common';
import type { LabelJob, LabelTemplate } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { LabelStore } from '../application/label-store.js';

@Injectable()
export class PrismaLabelStore extends LabelStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async templates(tenantId: string): Promise<LabelTemplate[]> {
    const rows = await this.prisma.db().barcodeLabelTemplates.findMany({ where: { tenantId }, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
    return rows.map((t) => ({
      id: t.id, code: t.code, name: t.name, media: t.media, widthMm: t.widthMm.toNumber(), heightMm: t.heightMm.toNumber(), labelsPerSheet: t.labelsPerSheet,
      sheetColumns: t.sheetColumns, sheetRows: t.sheetRows, isSystem: t.isSystem, isActive: t.isActive, rowVersion: t.rowVersion,
    }));
  }

  async templateCodes(tenantId: string) {
    return (await this.prisma.db().barcodeLabelTemplates.findMany({ where: { tenantId }, select: { code: true } })).map((t) => t.code);
  }

  async jobs(tenantId: string, limit: number): Promise<LabelJob[]> {
    const db = this.prisma.db();
    const jobs = await db.barcodeLabelJobs.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: limit });
    if (!jobs.length) return [];
    const [lines, templates, users] = await Promise.all([
      db.barcodeLabelJobLines.findMany({ where: { tenantId, jobId: { in: jobs.map((j) => j.id) } } }),
      db.barcodeLabelTemplates.findMany({ where: { tenantId, id: { in: jobs.map((j) => j.templateId) } }, select: { id: true, name: true } }),
      db.users.findMany({ where: { tenantId, id: { in: jobs.map((j) => j.printedByUserId).filter((x): x is string => !!x) } }, select: { id: true, fullName: true } }),
    ]);
    const products = await db.products.findMany({ where: { tenantId, id: { in: [...new Set(lines.map((l) => l.itemId))] } }, select: { id: true, sku: true, name: true } });
    return jobs.map((j) => ({
      id: j.id, template: templates.find((t) => t.id === j.templateId) ?? { id: j.templateId, name: '?' }, showPrice: j.showPrice, showUrduName: j.showUrduName,
      showBatchExpiry: j.showBatchExpiry, showCompany: j.showCompany, useCartonBarcode: j.useCartonBarcode, productCount: j.productCount, totalLabels: j.totalLabels,
      pageCount: j.pageCount, source: j.source, status: j.status, printedAt: j.printedAt?.toISOString() ?? null,
      printedBy: users.find((u) => u.id === j.printedByUserId)?.fullName ?? null,
      lines: lines.filter((l) => l.jobId === j.id).map((l) => ({
        product: products.find((p) => p.id === l.itemId) ?? { id: l.itemId, sku: '?', name: '?' }, copies: l.copies, barcode: l.barcode, printedPrice: l.printedPrice?.toNumber() ?? null,
      })),
    }));
  }

  async printData(tenantId: string, itemIds: string[]) {
    const db = this.prisma.db();
    const [products, barcodes] = await Promise.all([
      db.products.findMany({ where: { tenantId, id: { in: itemIds }, deletedAt: null }, select: { id: true, price: true, upc: true } }),
      db.productBarcodes.findMany({ where: { tenantId, itemId: { in: itemIds }, isPrimary: true } }),
    ]);
    return products.map((p) => ({
      id: p.id, price: p.price.toNumber(),
      piece: barcodes.find((b) => b.itemId === p.id && b.kind === 'PIECE')?.barcode ?? p.upc,
      carton: barcodes.find((b) => b.itemId === p.id && b.kind === 'CARTON')?.barcode ?? null,
    }));
  }

  saveTemplate(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'barcodeLabelTemplateAddUpdate', data);
  }

  saveJob(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'barcodeLabelJobAddUpdate', data);
  }

  templateInUse(id: string) {
    return isReferenced(this.prisma, 'labelTemplates', id);
  }

  async deleteTemplate(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().barcodeLabelTemplates.deleteMany({ where: { tenantId, id, rowVersion, isSystem: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this template. Reload and try again.');
  }
}
