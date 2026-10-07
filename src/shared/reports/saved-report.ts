import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

// ---------------------------------------------------------------- source catalogue
export type ReportFieldType = 'text' | 'date' | 'number' | 'money';
/** One field a report source offers. `count` fields are 1 per row, so their sum counts the rows of a group. */
export type ReportField = { key: string; label: string; type: ReportFieldType; count?: boolean };
export type ReportSource = {
  label: string;
  /** The source module's view permission, needed (with rpt:view) to preview it. */
  permission: string;
  /** The roadmap phase that builds the module when its documents don't exist yet (the preview is empty until then). */
  pendingPhase?: number;
  /** True when the date range filters it (documents); master lists have none. */
  dated: boolean;
  /** True when a branch filters it. */
  branched: boolean;
  fields: ReportField[];
  defaultColumns: string[];
  defaultGroupBy: string[];
  defaultSort: string;
};

/**
 * The report sources and their field allow-list (fieldKey ⇒ label / type). The server maps every key to a fixed SQL
 * expression; a key that is not listed here is rejected (REPORT_FIELD_NOT_ALLOWED).
 */
export const REPORT_SOURCES = {
  SALES_INVOICES: {
    label: 'Sales invoices', permission: 'sinv:view', dated: true, branched: true,
    fields: [
      { key: 'docNo', label: 'Invoice no.', type: 'text' },
      { key: 'docDate', label: 'Invoice date', type: 'date' },
      { key: 'dueDate', label: 'Due date', type: 'date' },
      { key: 'customer', label: 'Customer', type: 'text' },
      { key: 'branch', label: 'Branch', type: 'text' },
      { key: 'city', label: 'City', type: 'text' },
      { key: 'salesperson', label: 'Salesperson', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'invoiceCount', label: 'Invoices', type: 'number', count: true },
      { key: 'netSales', label: 'Net sales', type: 'money' },
      { key: 'gst', label: 'GST', type: 'money' },
      { key: 'furtherTax', label: 'Further tax', type: 'money' },
      { key: 'grossTotal', label: 'Gross total', type: 'money' },
      { key: 'paid', label: 'Paid', type: 'money' },
      { key: 'balance', label: 'Balance', type: 'money' },
    ],
    defaultColumns: ['customer', 'branch', 'invoiceCount', 'netSales', 'gst', 'grossTotal'],
    defaultGroupBy: ['customer'],
    defaultSort: 'netSales',
  },
  VENDOR_BILLS: {
    label: 'Vendor bills', permission: 'bill:view', pendingPhase: 19, dated: true, branched: true,
    fields: [
      { key: 'docNo', label: 'Bill no.', type: 'text' },
      { key: 'docDate', label: 'Bill date', type: 'date' },
      { key: 'dueDate', label: 'Due date', type: 'date' },
      { key: 'vendor', label: 'Vendor', type: 'text' },
      { key: 'vendorInvoiceNo', label: 'Vendor invoice no.', type: 'text' },
      { key: 'branch', label: 'Branch', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'billCount', label: 'Bills', type: 'number', count: true },
      { key: 'netAmount', label: 'Net amount', type: 'money' },
      { key: 'tax', label: 'Sales tax', type: 'money' },
      { key: 'total', label: 'Total', type: 'money' },
      { key: 'wht', label: 'WHT', type: 'money' },
      { key: 'balance', label: 'Balance', type: 'money' },
    ],
    defaultColumns: ['vendor', 'branch', 'billCount', 'netAmount', 'tax', 'total'],
    defaultGroupBy: ['vendor'],
    defaultSort: 'total',
  },
  GL_TRANSACTIONS: {
    label: 'GL transactions', permission: 'vch:view', pendingPhase: 16, dated: true, branched: true,
    fields: [
      { key: 'docNo', label: 'Voucher no.', type: 'text' },
      { key: 'voucherType', label: 'Voucher type', type: 'text' },
      { key: 'postingDate', label: 'Posting date', type: 'date' },
      { key: 'accountCode', label: 'Account code', type: 'text' },
      { key: 'account', label: 'Account', type: 'text' },
      { key: 'particulars', label: 'Particulars', type: 'text' },
      { key: 'branch', label: 'Branch', type: 'text' },
      { key: 'lineCount', label: 'Lines', type: 'number', count: true },
      { key: 'debit', label: 'Debit', type: 'money' },
      { key: 'credit', label: 'Credit', type: 'money' },
      { key: 'net', label: 'Net (Dr − Cr)', type: 'money' },
    ],
    defaultColumns: ['account', 'debit', 'credit', 'net'],
    defaultGroupBy: ['account'],
    defaultSort: 'net',
  },
  CUSTOMERS: {
    label: 'Customers', permission: 'cust:view', dated: false, branched: true,
    fields: [
      { key: 'code', label: 'Code', type: 'text' },
      { key: 'name', label: 'Customer', type: 'text' },
      { key: 'customerType', label: 'Type', type: 'text' },
      { key: 'group', label: 'Group', type: 'text' },
      { key: 'branch', label: 'Branch', type: 'text' },
      { key: 'city', label: 'City', type: 'text' },
      { key: 'area', label: 'Area', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'customerCount', label: 'Customers', type: 'number', count: true },
      { key: 'creditLimit', label: 'Credit limit', type: 'money' },
      { key: 'creditDays', label: 'Credit days', type: 'number' },
      { key: 'openingBalance', label: 'Opening balance', type: 'money' },
    ],
    defaultColumns: ['code', 'name', 'branch', 'city', 'creditLimit', 'status'],
    defaultGroupBy: [],
    defaultSort: 'name',
  },
  STOCK_MOVEMENTS: {
    label: 'Stock movements', permission: 'irep:view', dated: true, branched: true,
    fields: [
      { key: 'movementDate', label: 'Date', type: 'date' },
      { key: 'docNo', label: 'Document', type: 'text' },
      { key: 'movementType', label: 'Movement', type: 'text' },
      { key: 'sku', label: 'SKU', type: 'text' },
      { key: 'item', label: 'Item', type: 'text' },
      { key: 'warehouse', label: 'Warehouse', type: 'text' },
      { key: 'party', label: 'Party', type: 'text' },
      { key: 'movementCount', label: 'Movements', type: 'number', count: true },
      { key: 'qtyIn', label: 'Qty in', type: 'number' },
      { key: 'qtyOut', label: 'Qty out', type: 'number' },
      { key: 'netQty', label: 'Net qty', type: 'number' },
      { key: 'value', label: 'Value', type: 'money' },
    ],
    defaultColumns: ['item', 'warehouse', 'qtyIn', 'qtyOut', 'netQty', 'value'],
    defaultGroupBy: ['item'],
    defaultSort: 'value',
  },
  PAYROLL_LINES: {
    label: 'Payroll lines', permission: 'prun:view', pendingPhase: 32, dated: true, branched: true,
    fields: [
      { key: 'payrollMonth', label: 'Month', type: 'date' },
      { key: 'runNo', label: 'Run', type: 'text' },
      { key: 'employeeCode', label: 'Employee code', type: 'text' },
      { key: 'employee', label: 'Employee', type: 'text' },
      { key: 'department', label: 'Department', type: 'text' },
      { key: 'branch', label: 'Branch', type: 'text' },
      { key: 'employeeCount', label: 'Employees', type: 'number', count: true },
      { key: 'paidDays', label: 'Paid days', type: 'number' },
      { key: 'gross', label: 'Gross', type: 'money' },
      { key: 'tax', label: 'Income tax', type: 'money' },
      { key: 'deductions', label: 'Deductions', type: 'money' },
      { key: 'net', label: 'Net pay', type: 'money' },
    ],
    defaultColumns: ['department', 'employeeCount', 'gross', 'tax', 'deductions', 'net'],
    defaultGroupBy: ['department'],
    defaultSort: 'net',
  },
} as const satisfies Record<string, ReportSource>;
export type ReportSourceKey = keyof typeof REPORT_SOURCES;
export const REPORT_SOURCE_KEYS = Object.keys(REPORT_SOURCES) as ReportSourceKey[];

export const reportField = (source: string, key: string): ReportField | undefined =>
  (REPORT_SOURCES as Record<string, ReportSource>)[source]?.fields.find((f) => f.key === key);

// ---------------------------------------------------------------- date ranges
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
/**
 * The [from, to] dates (inclusive, either may be open) of a DateRange lookup code, as of `today` (YYYY-MM-DD).
 * Quarters are calendar quarters (Jul–Sep is Q1 of the July fiscal year); the fiscal year starts in July.
 */
export function resolveDateRange(range: string, dateFrom: string | null, dateTo: string | null, today: string): { from: string | null; to: string | null } {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1;
  const q = Math.floor(m / 3) * 3;
  const fy = m >= 6 ? y : y - 1;
  switch (range) {
    case 'TODAY': return { from: today, to: today };
    case 'THIS_MONTH': return { from: iso(utc(y, m, 1)), to: iso(utc(y, m + 1, 0)) };
    case 'LAST_MONTH': return { from: iso(utc(y, m - 1, 1)), to: iso(utc(y, m, 0)) };
    case 'THIS_QUARTER': return { from: iso(utc(y, q, 1)), to: iso(utc(y, q + 3, 0)) };
    case 'LAST_QUARTER': return { from: iso(utc(y, q - 3, 1)), to: iso(utc(y, q, 0)) };
    case 'FISCAL_YTD': return { from: iso(utc(fy, 6, 1)), to: today };
    case 'LAST_FISCAL_YEAR': return { from: iso(utc(fy - 1, 6, 1)), to: iso(utc(fy, 5, 30)) };
    case 'AS_ON': return { from: null, to: dateTo };
    case 'CUSTOM': return { from: dateFrom, to: dateTo };
    default: return { from: null, to: null };
  }
}

// ---------------------------------------------------------------- definition parts
export const FILTER_OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'] as const;
export type FilterOp = (typeof FILTER_OPS)[number];
export const FILTER_OP_LABELS: Record<FilterOp, string> = { eq: 'is', ne: 'is not', gt: '>', gte: '≥', lt: '<', lte: '≤', contains: 'contains' };

const fieldKey = z.string().regex(/^[a-z][A-Za-z0-9]{0,40}$/, 'Unknown field');
export const ReportFilterSchema = z.object({ field: fieldKey, op: z.enum(FILTER_OPS), value: z.string().trim().max(100) });
export type ReportFilter = z.infer<typeof ReportFilterSchema>;

export const AGGREGATES = ['NONE', 'SUM', 'COUNT', 'AVG', 'MIN', 'MAX'] as const;
export const ReportColumnInputSchema = z.object({
  fieldKey,
  label: z.string().trim().max(60).optional(),
  isVisible: z.boolean().default(true),
  aggregate: z.enum(AGGREGATES).default('NONE'),
  widthPx: z.coerce.number().int().min(40).max(800).optional().nullable(),
});
export type ReportColumnInput = z.infer<typeof ReportColumnInputSchema>;

export const ReportShareInputSchema = z
  .object({ shareType: z.enum(['ROLE', 'USER']), roleId: z.uuid().optional().nullable(), userId: z.uuid().optional().nullable(), canEdit: z.boolean().default(false) })
  .refine((s) => (s.shareType === 'ROLE' ? !!s.roleId && !s.userId : !!s.userId && !s.roleId), { message: 'Choose a role or a user', path: ['roleId'] });
export type ReportShareInput = z.infer<typeof ReportShareInputSchema>;

/** What a preview runs (also the stored definition's query part). */
const QueryFields = {
  sourceEntity: z.enum(REPORT_SOURCE_KEYS as [ReportSourceKey, ...ReportSourceKey[]], 'Choose a data source'),
  dateRange: z.string().trim().max(30).default('THIS_QUARTER'),
  dateFrom: z.iso.date().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  dateTo: z.iso.date().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  branchId: z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  filters: z.array(ReportFilterSchema).max(10, 'Up to 10 filters').default([]),
  groupBy: z.array(fieldKey).max(3, 'Group by up to 3 fields').default([]),
  sortField: fieldKey.optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  sortDir: z.enum(['ASC', 'DESC']).default('DESC'),
  rowLimit: z.coerce.number().int().min(1).max(100_000).optional().nullable(),
  showTotals: z.boolean().default(true),
  columns: z.array(ReportColumnInputSchema).min(1, 'Pick at least one column').max(40),
};
const rangeOk = (q: { dateRange?: string; dateFrom?: string | null; dateTo?: string | null }, ctx: z.RefinementCtx) => {
  if (q.dateRange === 'CUSTOM' && (!q.dateFrom || !q.dateTo)) ctx.addIssue({ code: 'custom', path: ['dateFrom'], message: 'Give both dates' });
  if (q.dateRange === 'CUSTOM' && q.dateFrom && q.dateTo && q.dateTo < q.dateFrom) ctx.addIssue({ code: 'custom', path: ['dateTo'], message: 'Ends before it starts' });
  if (q.dateRange === 'AS_ON' && !q.dateTo) ctx.addIssue({ code: 'custom', path: ['dateTo'], message: 'Give the as-on date' });
};
export const ReportPreviewRequestSchema = z.object(QueryFields).superRefine(rangeOk);
export type ReportPreviewRequest = z.infer<typeof ReportPreviewRequestSchema>;

export const PREVIEW_ROW_CAP = 1000;
export const ReportPreviewSchema = z.object({
  columns: z.array(z.object({ key: z.string(), label: z.string(), type: z.string(), aggregate: z.string() })),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
  /** Sums of the number / money columns over the returned rows (null for other columns), when totals are on. */
  totals: z.array(z.union([z.number(), z.null()])).nullable(),
  /** More rows matched than the limit (rowLimit, at most 1,000 in a preview). */
  truncated: z.boolean(),
  range: z.object({ from: z.string().nullable(), to: z.string().nullable() }),
  pendingPhase: z.number().int().nullable(),
});
export type ReportPreview = z.infer<typeof ReportPreviewSchema>;

// ---------------------------------------------------------------- saved reports
const DefinitionFields = {
  name: z.string().trim().min(1, 'Name the report').max(120),
  description: optionalText(300),
  folder: z.string().trim().max(30).default('GENERAL'),
  display: z.enum(['TABLE', 'CHART']).default('TABLE'),
  chartType: z.enum(['BAR', 'LINE', 'DONUT']).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  defaultFormat: z.string().trim().max(10).default('PDF'),
  visibility: z.enum(['PRIVATE', 'SHARED', 'EVERYONE']).default('PRIVATE'),
  isFavourite: z.boolean().default(false),
  shares: z.array(ReportShareInputSchema).max(50).default([]),
};
const chartOk = (d: { display?: string; chartType?: string | null }, ctx: z.RefinementCtx) => {
  if (d.display === 'CHART' && !d.chartType) ctx.addIssue({ code: 'custom', path: ['chartType'], message: 'Choose the chart type' });
};
export const SavedReportCreateSchema = z.object({ ...QueryFields, ...DefinitionFields }).superRefine((d, ctx) => { rangeOk(d, ctx); chartOk(d, ctx); });
export type SavedReportCreate = z.infer<typeof SavedReportCreateSchema>;
/** PATCH changes the definition (columns optional, so a source change can carry its columns); shares have their own PUT. */
export const SavedReportUpdateSchema = patchFields({ ...QueryFields, ...DefinitionFields })
  .omit({ shares: true })
  .extend(RowVersionSchema.shape)
  .superRefine((d, ctx) => { rangeOk(d, ctx); chartOk(d, ctx); });
export type SavedReportUpdate = z.infer<typeof SavedReportUpdateSchema>;
export const SavedReportColumnsSchema = RowVersionSchema.extend({ columns: QueryFields.columns });
export const SavedReportSharesSchema = RowVersionSchema.extend({ visibility: DefinitionFields.visibility.optional(), shares: DefinitionFields.shares });

export const ReportScheduleSchema = z.object({
  id: z.string(),
  frequency: z.string(),
  dayOfWeek: z.number().int().nullable(),
  dayOfMonth: z.number().int().nullable(),
  runTime: z.string(),
  timezone: z.string(),
  format: z.string(),
  recipientEmails: z.array(z.string()),
  recipientUserIds: z.array(z.string()),
  onlyIfRows: z.boolean(),
  status: z.string(),
  nextRunAt: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  rowVersion: z.number().int(),
});
export type ReportSchedule = z.infer<typeof ReportScheduleSchema>;
const ScheduleFields = {
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY']),
  dayOfWeek: z.coerce.number().int().min(1, 'Monday (1) to Sunday (7)').max(7, 'Monday (1) to Sunday (7)').optional().nullable(),
  dayOfMonth: z.coerce.number().int().min(1, '1 to 28').max(28, '1 to 28').optional().nullable(),
  runTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Like 08:00').default('08:00'),
  format: z.enum(['XLSX', 'PDF', 'CSV']).default('XLSX'),
  recipientEmails: z.array(z.email('Use an email address').trim().toLowerCase()).max(30).default([]),
  recipientUserIds: z.array(z.uuid()).max(30).default([]),
  onlyIfRows: z.boolean().default(false),
  status: z.enum(['ACTIVE', 'PAUSED']).default('ACTIVE'),
};
const scheduleOk = (s: { frequency?: string; dayOfWeek?: number | null; dayOfMonth?: number | null; recipientEmails?: string[]; recipientUserIds?: string[] }, ctx: z.RefinementCtx) => {
  if (s.frequency === 'WEEKLY' && !s.dayOfWeek) ctx.addIssue({ code: 'custom', path: ['dayOfWeek'], message: 'Choose the day' });
  if ((s.frequency === 'MONTHLY' || s.frequency === 'QUARTERLY') && !s.dayOfMonth) ctx.addIssue({ code: 'custom', path: ['dayOfMonth'], message: 'Choose the day of the month' });
  if (s.recipientEmails && s.recipientUserIds && s.recipientEmails.length + s.recipientUserIds.length === 0) ctx.addIssue({ code: 'custom', path: ['recipientEmails'], message: 'Add at least one recipient' });
};
export const ReportScheduleCreateSchema = z.object(ScheduleFields).superRefine(scheduleOk);
export type ReportScheduleCreate = z.infer<typeof ReportScheduleCreateSchema>;
export const ReportScheduleUpdateSchema = z.object(ScheduleFields).extend(RowVersionSchema.shape).superRefine(scheduleOk);
export type ReportScheduleUpdate = z.infer<typeof ReportScheduleUpdateSchema>;

export const SavedReportSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  folder: z.string(),
  kind: z.string(),
  sourceEntity: z.string().nullable(),
  dateRange: z.string(),
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
  branchId: z.string().nullable(),
  filters: z.array(ReportFilterSchema),
  groupBy: z.array(z.string()),
  sortField: z.string().nullable(),
  sortDir: z.string(),
  rowLimit: z.number().int().nullable(),
  showTotals: z.boolean(),
  display: z.string(),
  chartType: z.string().nullable(),
  defaultFormat: z.string(),
  visibility: z.string(),
  owner: z.object({ id: z.string(), name: z.string() }),
  /** The signed-in user owns it or holds an editing share (and rpt:edit). */
  canEdit: z.boolean(),
  isFavourite: z.boolean(),
  status: z.string(),
  lastRunAt: z.string().nullable(),
  columns: z.array(z.object({ id: z.string(), seq: z.number().int(), fieldKey: z.string(), label: z.string(), isVisible: z.boolean(), aggregate: z.string(), format: z.string(), widthPx: z.number().int().nullable() })),
  shares: z.array(z.object({ id: z.string(), shareType: z.string(), roleId: z.string().nullable(), userId: z.string().nullable(), name: z.string(), canEdit: z.boolean() })),
  schedules: z.array(ReportScheduleSchema),
  updatedAt: z.string(),
  rowVersion: z.number().int(),
});
export type SavedReport = z.infer<typeof SavedReportSchema>;
export const SavedReportSummarySchema = SavedReportSchema.pick({ id: true, name: true, folder: true, sourceEntity: true, visibility: true, owner: true, canEdit: true, isFavourite: true, updatedAt: true });
export type SavedReportSummary = z.infer<typeof SavedReportSummarySchema>;

/** Roles and users a report can be shared with or scheduled to. */
export const ReportOptionsSchema = z.object({
  branches: z.array(z.object({ id: z.string(), name: z.string() })),
  roles: z.array(z.object({ id: z.string(), name: z.string() })),
  users: z.array(z.object({ id: z.string(), name: z.string(), email: z.string() })),
  /** The sources the signed-in user may preview (holds the source module's view permission). */
  allowedSources: z.array(z.string()),
});
export type ReportOptions = z.infer<typeof ReportOptionsSchema>;

/** The column format stored for a field type (SavedReportColumnFormat lookup). */
export const formatOf = (t: ReportFieldType) => (t === 'money' ? 'MONEY' : t === 'number' ? 'NUMBER' : t === 'date' ? 'DATE' : 'TEXT');
