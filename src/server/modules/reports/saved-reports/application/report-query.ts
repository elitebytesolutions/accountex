import { PREVIEW_ROW_CAP, REPORT_SOURCES, reportField, resolveDateRange, type ReportPreviewRequest, type ReportSource } from '../../../../../shared/reports/saved-report.js';
import { ForbiddenError, ValidationError } from '../../../../core/domain/errors.js';
import type { PlannedColumn, PlannedFilter, QueryPlan } from './report-store.js';

const notAllowed = (what: string, key: string) =>
  new ValidationError(`${what} "${key}" is not offered by this data source`, { [what.toLowerCase()]: [`Unknown field ${key}`] }, { code: 'REPORT_FIELD_NOT_ALLOWED' });

/** The source's catalogue entry, after checking the user holds rpt:view (route guard) and the source module's own view permission. */
export function sourceFor(sourceEntity: string, permissions: string[]): ReportSource {
  const source = (REPORT_SOURCES as Record<string, ReportSource>)[sourceEntity];
  if (!source) throw new ValidationError('Choose a data source', { sourceEntity: ['Unknown source'] });
  if (!permissions.includes(source.permission)) {
    throw new ForbiddenError(`You need ${source.permission} to report on ${source.label.toLowerCase()}.`, undefined, { code: 'REPORT_SOURCE_FORBIDDEN', log: { source: sourceEntity, missing: source.permission } });
  }
  return source;
}

/** Every column, group, sort and filter key must be in the source's allow-list (REPORT_FIELD_NOT_ALLOWED otherwise). */
export function assertFieldsAllowed(sourceEntity: string, q: { columns?: { fieldKey: string }[]; groupBy?: string[]; sortField?: string | null; filters?: { field: string }[] }): void {
  for (const c of q.columns ?? []) if (!reportField(sourceEntity, c.fieldKey)) throw notAllowed('Column', c.fieldKey);
  for (const g of q.groupBy ?? []) if (!reportField(sourceEntity, g)) throw notAllowed('Group', g);
  if (q.sortField && !reportField(sourceEntity, q.sortField)) throw notAllowed('Sort', q.sortField);
  for (const f of q.filters ?? []) if (!reportField(sourceEntity, f.field)) throw notAllowed('Filter', f.field);
}

const numeric = (t: string) => t === 'number' || t === 'money';

/**
 * Turns a validated request into a QueryPlan of allow-listed keys and typed values. Grouping keeps the group fields
 * (added in front when they are not selected) and aggregates the rest: numbers by their aggregate (SUM by default),
 * text / dates by COUNT, MIN or MAX (MAX by default, a representative value). Filters on aggregated numbers become HAVING.
 */
export function planQuery(req: ReportPreviewRequest, today: string): QueryPlan {
  const source = (REPORT_SOURCES as Record<string, ReportSource>)[req.sourceEntity]!;
  assertFieldsAllowed(req.sourceEntity, req);
  const grouped = req.groupBy.length > 0;
  const visible = req.columns.filter((c) => c.isVisible);
  if (!visible.length) throw new ValidationError('Pick at least one column', { columns: ['No visible column'] });
  const keys = [...(grouped ? req.groupBy.filter((g) => !visible.some((c) => c.fieldKey === g)) : []), ...visible.map((c) => c.fieldKey)];
  const columns: PlannedColumn[] = [...new Set(keys)].map((key) => {
    const type = reportField(req.sourceEntity, key)!.type;
    const isGroup = grouped && req.groupBy.includes(key);
    const asked = visible.find((c) => c.fieldKey === key)?.aggregate ?? 'NONE';
    let aggregate: PlannedColumn['aggregate'] = 'NONE';
    if (grouped && !isGroup) {
      if (numeric(type)) aggregate = asked === 'NONE' ? 'SUM' : asked;
      else aggregate = asked === 'COUNT' || asked === 'MIN' ? asked : 'MAX';
    }
    return { key, type, aggregate, grouped: isGroup };
  });
  const filters: PlannedFilter[] = req.filters.map((f) => {
    const type = reportField(req.sourceEntity, f.field)!.type;
    let value: string | number = f.value;
    if (numeric(type)) {
      value = Number(f.value.replace(/,/g, ''));
      if (f.op === 'contains' || f.value === '' || !Number.isFinite(value)) throw new ValidationError('Use a number', { filters: [`${f.field}: use a number`] });
    } else if (type === 'date') {
      if (f.op === 'contains' || !/^\d{4}-\d{2}-\d{2}$/.test(f.value)) throw new ValidationError('Use a date (YYYY-MM-DD)', { filters: [`${f.field}: use a date`] });
    } else if (!['eq', 'ne', 'contains'].includes(f.op)) {
      throw new ValidationError('Text fields use is, is not or contains', { filters: [`${f.field}: use is, is not or contains`] });
    }
    const col = columns.find((c) => c.key === f.field);
    return { key: f.field, type, op: f.op, value, onAggregate: grouped && numeric(type) && !!col && !col.grouped };
  });
  const sortIndex = req.sortField ? columns.findIndex((c) => c.key === req.sortField) : -1;
  const range = source.dated ? resolveDateRange(req.dateRange, req.dateFrom, req.dateTo, today) : { from: null, to: null };
  return {
    source: req.sourceEntity,
    columns,
    grouped,
    filters,
    sort: sortIndex >= 0 ? { index: sortIndex, dir: req.sortDir } : grouped ? { index: 0, dir: 'ASC' } : null,
    from: range.from,
    to: range.to,
    branchId: source.branched ? req.branchId : null,
    limit: Math.min(req.rowLimit ?? PREVIEW_ROW_CAP, PREVIEW_ROW_CAP),
  };
}
