import { Injectable } from '@nestjs/common';
import type { ReportFilter } from '../../../../../shared/reports/saved-report.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { ReportStore, type QueryPlan, type StoredReport } from '../application/report-store.js';
import { SOURCE_SQL } from './report-sources.sql.js';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const hhmm = (d: Date) => d.toISOString().slice(11, 16);
const OPS: Record<string, string> = { eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
const AGG: Record<string, string> = { SUM: 'sum', COUNT: 'count', AVG: 'avg', MIN: 'min', MAX: 'max' };

@Injectable()
export class PrismaReportStore extends ReportStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private async load(tenantId: string, id?: string): Promise<StoredReport[]> {
    const db = this.prisma.db();
    const rows = await db.savedReports.findMany({ where: { tenantId, deletedAt: null, ...(id && { id }) }, orderBy: [{ folder: 'asc' }, { name: 'asc' }] });
    const ids = rows.map((r) => r.id);
    const [columns, shares, schedules] = await Promise.all([
      db.savedReportColumns.findMany({ where: { tenantId, reportId: { in: ids } }, orderBy: { seq: 'asc' } }),
      db.savedReportShares.findMany({ where: { tenantId, reportId: { in: ids } } }),
      // recipientEmails is citext[], which the pg adapter does not map: read it below as text[].
      db.reportSchedules.findMany({ where: { tenantId, reportId: { in: ids } }, orderBy: { createdAt: 'asc' }, omit: { recipientEmails: true } }),
    ]);
    const emails = schedules.length
      ? await db.$queryRaw<{ id: string; emails: string[] }[]>`
          select id::text as id, "recipientEmails"::text[] as emails from "Reports"."ReportSchedules" where "tenantId" = ${tenantId}::uuid and id = any(${schedules.map((s) => s.id)}::uuid[])`
      : [];
    const userIds = [...new Set([...rows.map((r) => r.ownerUserId), ...shares.map((s) => s.userId).filter((x): x is string => !!x)])];
    const [users, roles] = await Promise.all([
      db.users.findMany({ where: { tenantId, id: { in: userIds } }, select: { id: true, fullName: true } }),
      db.roles.findMany({ where: { tenantId, id: { in: shares.map((s) => s.roleId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    ]);
    const userName = (uid: string) => users.find((u) => u.id === uid)?.fullName ?? '?';
    return rows.map((r) => ({
      id: r.id, name: r.name, description: r.description, folder: r.folder, kind: r.kind, sourceEntity: r.sourceEntity, dateRange: r.dateRange,
      dateFrom: day(r.dateFrom), dateTo: day(r.dateTo), branchId: r.branchId, filters: Array.isArray(r.filters) ? (r.filters as ReportFilter[]) : [],
      groupBy: r.groupBy, sortField: r.sortField, sortDir: r.sortDir, rowLimit: r.rowLimit, showTotals: r.showTotals, display: r.display, chartType: r.chartType,
      defaultFormat: r.defaultFormat, visibility: r.visibility, ownerUserId: r.ownerUserId, owner: { id: r.ownerUserId, name: userName(r.ownerUserId) },
      isFavourite: r.isFavourite, status: r.status, lastRunAt: iso(r.lastRunAt),
      columns: columns.filter((c) => c.reportId === r.id).map((c) => ({ id: c.id, seq: c.seq, fieldKey: c.fieldKey, label: c.label, isVisible: c.isVisible, aggregate: c.aggregate, format: c.format, widthPx: c.widthPx })),
      shares: shares.filter((s) => s.reportId === r.id).map((s) => ({
        id: s.id, shareType: s.shareType, roleId: s.roleId, userId: s.userId, canEdit: s.canEdit,
        name: s.roleId ? (roles.find((x) => x.id === s.roleId)?.name ?? '?') : userName(s.userId!),
      })),
      schedules: schedules.filter((s) => s.reportId === r.id).map((s) => ({
        id: s.id, frequency: s.frequency, dayOfWeek: s.dayOfWeek, dayOfMonth: s.dayOfMonth, runTime: hhmm(s.runTime), timezone: s.timezone, format: s.format,
        recipientEmails: emails.find((e) => e.id === s.id)?.emails ?? [], recipientUserIds: s.recipientUserIds, onlyIfRows: s.onlyIfRows, status: s.status, nextRunAt: iso(s.nextRunAt), lastRunAt: iso(s.lastRunAt), rowVersion: s.rowVersion,
      })),
      updatedAt: r.updatedAt.toISOString(), rowVersion: r.rowVersion,
    }));
  }

  list(tenantId: string) {
    return this.load(tenantId);
  }

  async get(tenantId: string, id: string) {
    return (await this.load(tenantId, id))[0] ?? null;
  }

  async roleIdsOf(tenantId: string, userId: string) {
    return (await this.prisma.db().userRoles.findMany({ where: { tenantId, userId }, select: { roleId: true } })).map((r) => r.roleId);
  }

  async options(tenantId: string) {
    const db = this.prisma.db();
    const [branches, roles, users] = await Promise.all([
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.roles.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.users.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, fullName: true, email: true }, orderBy: { fullName: 'asc' } }),
    ]);
    return { branches, roles, users: users.map((u) => ({ id: u.id, name: u.fullName, email: u.email })) };
  }

  async rolesExist(tenantId: string, ids: string[]) {
    const u = [...new Set(ids)];
    return !u.length || (await this.prisma.db().roles.count({ where: { tenantId, id: { in: u }, deletedAt: null } })) === u.length;
  }

  async usersExist(tenantId: string, ids: string[]) {
    const u = [...new Set(ids)];
    return !u.length || (await this.prisma.db().users.count({ where: { tenantId, id: { in: u }, deletedAt: null } })) === u.length;
  }

  async activeBranch(tenantId: string, id: string) {
    return (await this.prisma.db().branches.count({ where: { tenantId, id, deletedAt: null, status: 'ACTIVE' } })) === 1;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'savedReportAddUpdate', data);
  }

  saveSchedule(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'reportScheduleAddUpdate', data);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().savedReports.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this report. Reload and try again.');
  }

  async pauseSchedules(tenantId: string, reportId: string) {
    await this.prisma.db().reportSchedules.updateMany({ where: { tenantId, reportId, status: 'ACTIVE' }, data: { status: 'PAUSED' } });
  }

  scheduleInUse(id: string) {
    return isReferenced(this.prisma, 'reportSchedules', id);
  }

  async deleteSchedule(tenantId: string, reportId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().reportSchedules.deleteMany({ where: { tenantId, reportId, id, rowVersion } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this schedule. Reload and try again.');
  }

  /**
   * Builds the preview SQL from the source's fixed expressions (keys were validated against the allow-list; an unknown
   * key here is a programming error) and binds every user value as a parameter. Runs in a read-only transaction with the
   * tenant's session setting (the same app.tenantId the row-level security policies read), filtered by tenant
   * explicitly as the other repositories do, with a statement timeout.
   */
  async run(tenantId: string, plan: QueryPlan): Promise<(string | number | null)[][]> {
    const src = SOURCE_SQL[plan.source];
    if (!src) throw new Error(`No SQL for report source ${plan.source}`);
    const expr = (key: string) => {
      const e = src.fields[key];
      if (!e) throw new Error(`Field ${key} is not mapped for ${plan.source}`);
      return e;
    };
    const params: unknown[] = [tenantId];
    const p = (v: unknown, cast: string) => `$${params.push(v)}::${cast}`;
    const out = (sql: string, type: string) => (type === 'number' || type === 'money' ? `(${sql})::float8` : type === 'date' ? `to_char(${sql}, 'YYYY-MM-DD')` : `(${sql})::text`);
    const measure = (key: string, type: string, agg: string) => {
      if (agg === 'NONE') return expr(key);
      return agg === 'COUNT' ? `count(${expr(key)})` : `${AGG[agg]}(${expr(key)})`;
    };
    const select = plan.columns.map((c, i) => {
      const type = c.aggregate === 'COUNT' ? 'number' : c.type;
      return `${out(measure(c.key, c.type, plan.grouped && !c.grouped ? c.aggregate : 'NONE'), type)} as "c${i}"`;
    });
    const where = [`${src.tenant} = $1::uuid`];
    if (src.where) where.push(src.where);
    if (src.date && plan.from) where.push(`${src.date} >= ${p(plan.from, 'date')}`);
    if (src.date && plan.to) where.push(`${src.date} <= ${p(plan.to, 'date')}`);
    if (src.branch && plan.branchId) where.push(`${src.branch} = ${p(plan.branchId, 'uuid')}`);
    const having: string[] = [];
    for (const f of plan.filters) {
      const cast = f.type === 'number' || f.type === 'money' ? 'float8' : f.type === 'date' ? 'date' : 'text';
      if (f.op === 'contains') {
        where.push(`${expr(f.key)}::text ilike '%' || ${p(String(f.value).replace(/[\\%_]/g, (m) => `\\${m}`), 'text')} || '%'`);
        continue;
      }
      const op = OPS[f.op];
      if (!op) throw new Error(`Unknown filter op ${f.op}`);
      if (f.onAggregate) {
        const col = plan.columns.find((c) => c.key === f.key)!;
        having.push(`(${measure(f.key, f.type, col.aggregate)})::float8 ${op} ${p(f.value, cast)}`);
      } else {
        where.push(`(${expr(f.key)})${cast === 'text' ? '::text' : ''} ${op} ${p(f.value, cast)}`);
      }
    }
    const groupBy = plan.grouped ? plan.columns.map((c, i) => (c.grouped ? String(i + 1) : null)).filter(Boolean) : [];
    const sql = [
      `select ${select.join(', ')}`,
      `from ${src.from}`,
      `where ${where.join(' and ')}`,
      groupBy.length ? `group by ${groupBy.join(', ')}` : '',
      having.length ? `having ${having.join(' and ')}` : '',
      plan.sort ? `order by ${plan.sort.index + 1} ${plan.sort.dir === 'ASC' ? 'asc' : 'desc'} nulls last` : '',
      `limit ${p(plan.limit, 'int')}`,
    ].filter(Boolean).join('\n');
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('set transaction read only');
      await tx.$executeRaw`select set_config('app.tenantId', ${tenantId}, true)`;
      await tx.$executeRawUnsafe(`set local statement_timeout = '15s'`);
      return tx.$queryRawUnsafe<Record<string, string | number | null>[]>(sql, ...params);
    });
    return rows.map((r) => plan.columns.map((_, i) => r[`c${i}`] ?? null));
  }
}
