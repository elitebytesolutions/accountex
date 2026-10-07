import { Injectable } from '@nestjs/common';
import { labelPages, type LabelJob, type LabelJobCreate, type LabelTemplate, type LabelTemplateCreate, type LabelTemplateUpdate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { LabelStore } from './label-store.js';

/**
 * Barcode label templates and print jobs. Printing is the browser's print of the live preview; each print is recorded
 * here as a job (template, options, products, copies, printed price and barcode, who printed). No server PDF.
 */
@Injectable()
export class LabelsService {
  constructor(
    private readonly store: LabelStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  templates(user: SessionUser) {
    return this.store.templates(user.tenantId);
  }

  jobs(user: SessionUser) {
    return this.store.jobs(user.tenantId, 20);
  }

  async createTemplate(user: SessionUser, meta: RequestMeta, input: LabelTemplateCreate): Promise<LabelTemplate> {
    if ((await this.store.templateCodes(user.tenantId)).includes(input.code)) throw new ConflictError(`Code ${input.code} is already used.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveTemplate({ ...input, ...sheet(input), isSystem: false, isActive: true }));
    return this.template(user, id);
  }

  async updateTemplate(user: SessionUser, meta: RequestMeta, id: string, input: LabelTemplateUpdate): Promise<LabelTemplate> {
    const t = await this.currentTemplate(user, id, input.rowVersion);
    if (t.isSystem && (input.code !== undefined && input.code !== t.code)) throw new ValidationError("A standard template's code doesn't change", { code: ['Standard template'] });
    const merged = { media: input.media ?? t.media, sheetColumns: input.sheetColumns !== undefined ? input.sheetColumns : t.sheetColumns, sheetRows: input.sheetRows !== undefined ? input.sheetRows : t.sheetRows, labelsPerSheet: input.labelsPerSheet !== undefined ? input.labelsPerSheet : t.labelsPerSheet };
    if (merged.media === 'SHEET' && !(merged.sheetColumns && merged.sheetRows)) throw new ValidationError('A sheet needs columns and rows', { sheetColumns: ['A sheet needs columns and rows'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveTemplate({ ...input, ...sheet(merged), id }));
    return this.template(user, id);
  }

  async deleteTemplate(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const t = await this.currentTemplate(user, id, rowVersion);
    if (t.isSystem) throw new ConflictError('Standard templates can be edited or deactivated, not deleted.', undefined, { code: 'SYSTEM_ROW_LOCKED' });
    if (await this.store.templateInUse(id)) throw new ConflictError('Printed jobs use this template. Deactivate it instead.', undefined, { code: 'SYSTEM_ROW_LOCKED' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteTemplate(user.tenantId, id, rowVersion));
  }

  /** Records a printed job; price and barcode are taken from the product at print time (never from the client). */
  async recordJob(user: SessionUser, meta: RequestMeta, input: LabelJobCreate): Promise<LabelJob> {
    const t = (await this.store.templates(user.tenantId)).find((x) => x.id === input.templateId && x.isActive);
    if (!t) throw new ValidationError('Choose an active label template', { templateId: ['Unknown or inactive template'] });
    const data = await this.store.printData(user.tenantId, input.lines.map((l) => l.itemId));
    if (data.length !== input.lines.length) throw new ValidationError('Pick active products', { lines: ['Unknown or deleted product'] });
    const total = input.lines.reduce((s, l) => s + l.copies, 0);
    const { lines, ...options } = input;
    const id = await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.saveJob({
        ...options, productCount: lines.length, totalLabels: total, pageCount: labelPages(t, total), status: 'PRINTED', printedAt: new Date().toISOString(), printedByUserId: user.id,
        lines: lines.map((l) => {
          const d = data.find((x) => x.id === l.itemId)!;
          return { itemId: l.itemId, copies: l.copies, batchId: l.batchId ?? null, barcode: (input.useCartonBarcode ? d.carton : null) ?? d.piece, printedPrice: input.showPrice ? d.price : null };
        }),
      }),
    );
    const job = (await this.store.jobs(user.tenantId, 50)).find((j) => j.id === id);
    if (!job) throw new NotFoundError('Label job not found');
    return job;
  }

  private async template(user: SessionUser, id: string) {
    const t = (await this.store.templates(user.tenantId)).find((x) => x.id === id);
    if (!t) throw new NotFoundError('Label template not found');
    return t;
  }

  private async currentTemplate(user: SessionUser, id: string, rowVersion: number) {
    const t = await this.template(user, id);
    if (t.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this template. Reload and try again.');
    return t;
  }
}

/** A sheet stores its labels per sheet (labelTemplateSheetChk): columns × rows unless given; a roll has no grid. */
function sheet(t: { media?: string; sheetColumns?: number | null; sheetRows?: number | null; labelsPerSheet?: number | null }) {
  return t.media === 'SHEET'
    ? { labelsPerSheet: t.labelsPerSheet ?? (t.sheetColumns ?? 1) * (t.sheetRows ?? 1) }
    : t.media === 'ROLL' ? { labelsPerSheet: null, sheetColumns: null, sheetRows: null } : {};
}
