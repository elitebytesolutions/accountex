import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import { REPORT_SOURCE_KEYS, REPORT_SOURCES, reportField, type ReportOptions, type ReportPreview, type ReportPreviewRequest, type ReportSource } from '../../../../../shared/reports/saved-report.js';
import { planQuery, sourceFor } from './report-query.js';
import { ReportStore } from './report-store.js';

/** Report Studio's live, read-only preview (at most 1,000 rows), and the pick lists the studio needs. */
@Injectable()
export class ReportPreviewService {
  constructor(private readonly store: ReportStore) {}

  async options(user: SessionUser): Promise<ReportOptions> {
    const base = await this.store.options(user.tenantId);
    const allowedSources = REPORT_SOURCE_KEYS.filter((k) => user.permissions.includes((REPORT_SOURCES as Record<string, ReportSource>)[k]!.permission));
    return { ...base, allowedSources };
  }

  async preview(user: SessionUser, req: ReportPreviewRequest): Promise<ReportPreview> {
    const source = sourceFor(req.sourceEntity, user.permissions);
    const plan = planQuery(req, new Date().toISOString().slice(0, 10));
    const raw = await this.store.run(user.tenantId, { ...plan, limit: plan.limit + 1 });
    const truncated = raw.length > plan.limit;
    const rows = truncated ? raw.slice(0, plan.limit) : raw;
    const labels = new Map(req.columns.map((c) => [c.fieldKey, c.label]));
    const numeric = (t: string) => t === 'number' || t === 'money';
    const totals = req.showTotals
      ? plan.columns.map((c, i) => (numeric(c.type) && c.aggregate !== 'MIN' && c.aggregate !== 'MAX' && c.aggregate !== 'AVG'
        ? Math.round(rows.reduce((s, r) => s + (typeof r[i] === 'number' ? (r[i] as number) : 0), 0) * 100) / 100
        : null))
      : null;
    return {
      columns: plan.columns.map((c) => ({ key: c.key, label: labels.get(c.key) || reportField(req.sourceEntity, c.key)!.label, type: c.type, aggregate: c.aggregate })),
      rows,
      totals,
      truncated,
      range: { from: plan.from, to: plan.to },
      pendingPhase: source.pendingPhase ?? null,
    };
  }
}
