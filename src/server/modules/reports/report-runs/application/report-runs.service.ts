import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { ReportRun, SessionUser } from '../../../../../shared/index.js';
import { ReportPreviewRequestSchema } from '../../../../../shared/reports/saved-report.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, NotFoundError } from '../../../../core/domain/errors.js';
import { AttachmentsService } from '../../../attachments/application/attachments.service.js';
import { planQuery, sourceFor } from '../../saved-reports/application/report-query.js';
import { ReportStore } from '../../saved-reports/application/report-store.js';
import { SavedReportsService } from '../../saved-reports/application/saved-reports.service.js';

const RUN_ROW_CAP = 50_000;

/** Report run history and its output files (Reports.ReportRuns). */
export abstract class ReportRunStore {
  abstract start(data: { tenantId: string; reportId: string; title: string; format: string; parameters: unknown; runByUserId: string }): Promise<string>;
  abstract finish(tenantId: string, id: string, data: { status: 'COMPLETED' | 'FAILED'; rowCount: number | null; outputAttachmentId: string | null; errorMessage: string | null }): Promise<void>;
  abstract list(tenantId: string, q: { reportId?: string; userId?: string; page: number; pageSize: number }): Promise<{ items: ReportRun[]; total: number }>;
  abstract get(tenantId: string, id: string): Promise<ReportRun | null>;
  abstract isRunOutput(tenantId: string, attachmentId: string): Promise<boolean>;
}

/**
 * Runs a saved report on demand: the same field allow-list and query builder as the Report Studio preview, up to
 * 50,000 rows, written as a CSV file (Company.Attachments, purpose REPORT_OUTPUT) and logged in the run history.
 * Anyone with rpt:view may download run outputs. Scheduled delivery needs an email provider (later phase).
 */
@Injectable()
export class ReportRunsService implements OnModuleInit {
  constructor(
    private readonly runs: ReportRunStore,
    private readonly reports: SavedReportsService,
    private readonly store: ReportStore,
    private readonly attachments: AttachmentsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.attachments.registerAccess('report-runs', async (user, att) => user.permissions.includes('rpt:view') && this.runs.isRunOutput(user.tenantId, att.id));
  }

  list(user: SessionUser, q: { report?: string; mine?: boolean; page: number; pageSize: number }) {
    return this.runs.list(user.tenantId, { reportId: q.report, userId: q.mine ? user.id : undefined, page: q.page, pageSize: q.pageSize });
  }

  async run(user: SessionUser, meta: RequestMeta, reportId: string, format: string): Promise<ReportRun> {
    const r = await this.reports.get(user, reportId);
    if (!r.sourceEntity) throw new ConflictError('This report has no data source to run.', undefined, { code: 'REPORT_RUN_FAILED' });
    const req = ReportPreviewRequestSchema.parse({
      sourceEntity: r.sourceEntity, dateRange: r.dateRange, dateFrom: r.dateFrom, dateTo: r.dateTo, branchId: r.branchId, filters: r.filters, groupBy: r.groupBy,
      sortField: r.sortField, sortDir: r.sortDir, rowLimit: r.rowLimit, showTotals: r.showTotals,
      columns: [...r.columns].sort((a, b) => a.seq - b.seq).map((c) => ({ fieldKey: c.fieldKey, label: c.label, isVisible: c.isVisible, aggregate: c.aggregate, format: c.format, widthPx: c.widthPx })),
    });
    sourceFor(req.sourceEntity, user.permissions);
    const today = new Date().toISOString().slice(0, 10);
    const plan = planQuery(req, today);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.runs.start({ tenantId: user.tenantId, reportId, title: r.name, format, parameters: { ...req, range: { from: plan.from, to: plan.to } }, runByUserId: user.id }));
    try {
      const rows = await this.store.run(user.tenantId, { ...plan, limit: Math.min(r.rowLimit ?? RUN_ROW_CAP, RUN_ROW_CAP) });
      const visible = req.columns.filter((c) => c.isVisible);
      const label = (key: string) => visible.find((c) => c.fieldKey === key)?.label || key;
      const q = (v: string | number | null) => (v === null ? '' : typeof v === 'number' ? String(v) : `"${v.replace(/"/g, '""')}"`);
      const csv = `﻿${[plan.columns.map((c) => q(label(c.key))).join(','), ...rows.map((row) => row.map(q).join(','))].join('\r\n')}`;
      const buffer = Buffer.from(csv, 'utf8');
      const file = { originalName: `${r.name.replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'report'} ${today}.csv`, mimeType: 'text/csv', size: buffer.length, buffer };
      await this.unitOfWork.run(actorContext(user, meta), async () => {
        const att = await this.attachments.save(user, file, { purpose: 'REPORT_OUTPUT' }, { types: ['text/csv'], maxBytes: 50 * 1024 * 1024 });
        await this.runs.finish(user.tenantId, id, { status: 'COMPLETED', rowCount: rows.length, outputAttachmentId: att.id, errorMessage: null });
      });
    } catch (e) {
      await this.unitOfWork.run(actorContext(user, meta), () => this.runs.finish(user.tenantId, id, { status: 'FAILED', rowCount: null, outputAttachmentId: null, errorMessage: e instanceof Error ? e.message.slice(0, 500) : 'Failed' }));
      throw e;
    }
    return (await this.runs.get(user.tenantId, id))!;
  }

  async download(user: SessionUser, id: string) {
    const run = await this.runs.get(user.tenantId, id);
    if (!run) throw new NotFoundError('Report run not found');
    if (!run.outputAttachmentId) throw new ConflictError('This run has no output file.', undefined, { code: 'REPORT_RUN_FAILED' });
    return this.attachments.download(user, run.outputAttachmentId);
  }
}
