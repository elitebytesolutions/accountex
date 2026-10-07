import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import {
  formatOf, reportField, type ReportColumnInput, type ReportScheduleCreate, type ReportShareInput, type SavedReport, type SavedReportCreate,
  type SavedReportSummary, type SavedReportUpdate,
} from '../../../../../shared/reports/saved-report.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { canEditReport, canViewReport } from '../../domain/access.js';
import { nextRunAt } from '../../domain/schedule.js';
import { assertFieldsAllowed, sourceFor } from './report-query.js';
import { ReportStore, type StoredReport } from './report-store.js';

/**
 * Saved Report Studio definitions: columns, filters, grouping, sharing (PRIVATE / SHARED / EVERYONE) and email schedules.
 * Schedules are stored with their next run; sending them arrives in Phase 35.
 */
@Injectable()
export class SavedReportsService {
  constructor(
    private readonly store: ReportStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(user: SessionUser): Promise<SavedReportSummary[]> {
    const roleIds = await this.store.roleIdsOf(user.tenantId, user.id);
    return (await this.store.list(user.tenantId))
      .filter((r) => canViewReport(r, user.id, roleIds))
      .map((r) => ({ id: r.id, name: r.name, folder: r.folder, sourceEntity: r.sourceEntity, visibility: r.visibility, owner: r.owner, canEdit: this.editable(user, r, roleIds), isFavourite: r.isFavourite, updatedAt: r.updatedAt }));
  }

  async get(user: SessionUser, id: string): Promise<SavedReport> {
    const roleIds = await this.store.roleIdsOf(user.tenantId, user.id);
    const r = await this.store.get(user.tenantId, id);
    // A report the user may not see is reported as missing, so private reports stay invisible.
    if (!r || !canViewReport(r, user.id, roleIds)) throw new NotFoundError('Report not found');
    const { ownerUserId: _owner, ...rest } = r;
    void _owner;
    return { ...rest, canEdit: this.editable(user, r, roleIds) };
  }

  async create(user: SessionUser, meta: RequestMeta, input: SavedReportCreate): Promise<SavedReport> {
    sourceFor(input.sourceEntity, user.permissions);
    assertFieldsAllowed(input.sourceEntity, input);
    await this.checkLinks(user, input.branchId, input.shares);
    const { columns, shares, ...d } = input;
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({
      ...d, kind: 'CUSTOM', ownerUserId: user.id, status: 'ACTIVE', viewMode: d.groupBy.length ? 'SUMMARY' : 'DETAIL',
      columns: this.columnRows(input.sourceEntity, columns), shares: d.visibility === 'SHARED' ? this.shareRows(shares) : [],
    }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: SavedReportUpdate): Promise<SavedReport> {
    const r = await this.editableReport(user, id, input.rowVersion);
    const source = input.sourceEntity ?? r.sourceEntity!;
    sourceFor(source, user.permissions);
    const sourceChanged = source !== r.sourceEntity;
    if (sourceChanged && !input.columns) throw new ValidationError('Pick the columns of the new data source', { columns: ['Pick columns'] });
    assertFieldsAllowed(source, {
      columns: input.columns ?? r.columns, groupBy: input.groupBy ?? (sourceChanged ? [] : r.groupBy),
      sortField: input.sortField !== undefined ? input.sortField : sourceChanged ? null : r.sortField, filters: input.filters ?? (sourceChanged ? [] : r.filters),
    });
    if (input.visibility && input.visibility !== r.visibility && r.ownerUserId !== user.id) throw new ForbiddenError('Only the owner changes who sees this report.');
    if (input.branchId) await this.checkLinks(user, input.branchId, []);
    const { columns, ...d } = input;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({
      ...d, id,
      ...(d.groupBy && { viewMode: d.groupBy.length ? 'SUMMARY' : 'DETAIL' }),
      ...(sourceChanged && { groupBy: d.groupBy ?? [], filters: d.filters ?? [], sortField: d.sortField ?? null }),
      ...(columns && { columns: this.columnRows(source, columns, r.columns) }),
    }));
    return this.get(user, id);
  }

  async setColumns(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, columns: ReportColumnInput[]): Promise<SavedReport> {
    const r = await this.editableReport(user, id, rowVersion);
    assertFieldsAllowed(r.sourceEntity!, { columns });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, columns: this.columnRows(r.sourceEntity!, columns, r.columns) }));
    return this.get(user, id);
  }

  /** Sharing is the owner's: visibility plus the role / user shares (kept only while SHARED). */
  async setShares(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, visibility: string | undefined, shares: ReportShareInput[]): Promise<SavedReport> {
    const r = await this.current(user, id, rowVersion);
    if (r.ownerUserId !== user.id) throw new ForbiddenError('Only the owner changes who sees this report.');
    await this.checkLinks(user, null, shares);
    const vis = visibility ?? r.visibility;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, visibility: vis, shares: vis === 'SHARED' ? this.shareRows(shares, r.shares) : [] }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const r = await this.current(user, id, rowVersion);
    if (r.ownerUserId !== user.id) throw new ForbiddenError('Only the owner deletes this report.');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.pauseSchedules(user.tenantId, id);
      await this.store.softDelete(user.tenantId, id, rowVersion);
    });
  }

  // ---------------------------------------------------------------- schedules
  async createSchedule(user: SessionUser, meta: RequestMeta, reportId: string, input: ReportScheduleCreate): Promise<SavedReport> {
    await this.editableReport(user, reportId, null);
    await this.checkRecipients(user, input.recipientUserIds);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveSchedule({ ...this.scheduleRow(input), reportId, ownerUserId: user.id, timezone: 'Asia/Karachi' }));
    return this.get(user, reportId);
  }

  async updateSchedule(user: SessionUser, meta: RequestMeta, reportId: string, id: string, input: ReportScheduleCreate & { rowVersion: number }): Promise<SavedReport> {
    const r = await this.editableReport(user, reportId, null);
    const s = r.schedules.find((x) => x.id === id);
    if (!s) throw new NotFoundError('Schedule not found');
    if (s.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this schedule. Reload and try again.');
    await this.checkRecipients(user, input.recipientUserIds);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveSchedule({ ...this.scheduleRow(input), id, rowVersion: input.rowVersion }));
    return this.get(user, reportId);
  }

  async deleteSchedule(user: SessionUser, meta: RequestMeta, reportId: string, id: string, rowVersion: number): Promise<SavedReport> {
    const r = await this.editableReport(user, reportId, null);
    const s = r.schedules.find((x) => x.id === id);
    if (!s) throw new NotFoundError('Schedule not found');
    if (await this.store.scheduleInUse(id)) throw new ConflictError('This schedule has already run. Pause it instead.', undefined, { code: 'CONFLICT' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteSchedule(user.tenantId, reportId, id, rowVersion));
    return this.get(user, reportId);
  }

  // ---------------------------------------------------------------- helpers
  private editable(user: SessionUser, r: StoredReport, roleIds: string[]) {
    return user.permissions.includes('rpt:edit') && canEditReport(r, user.id, roleIds);
  }

  /** The report when the user may edit it (owner or editing share), checked at `rowVersion` when given. */
  private async editableReport(user: SessionUser, id: string, rowVersion: number | null) {
    const roleIds = await this.store.roleIdsOf(user.tenantId, user.id);
    const r = await this.store.get(user.tenantId, id);
    if (!r || !canViewReport(r, user.id, roleIds)) throw new NotFoundError('Report not found');
    if (!canEditReport(r, user.id, roleIds)) throw new ForbiddenError('Only the owner, or someone it is shared with for editing, can change this report.');
    if (rowVersion !== null && r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this report. Reload and try again.');
    return r;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const roleIds = await this.store.roleIdsOf(user.tenantId, user.id);
    const r = await this.store.get(user.tenantId, id);
    if (!r || !canViewReport(r, user.id, roleIds)) throw new NotFoundError('Report not found');
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this report. Reload and try again.');
    return r;
  }

  private async checkLinks(user: SessionUser, branchId: string | null | undefined, shares: ReportShareInput[]) {
    if (branchId && !(await this.store.activeBranch(user.tenantId, branchId))) throw new ValidationError('Choose an active branch', { branchId: ['Unknown or inactive branch'] });
    const roles = shares.filter((s) => s.shareType === 'ROLE').map((s) => s.roleId!);
    const users = shares.filter((s) => s.shareType === 'USER').map((s) => s.userId!);
    if (!(await this.store.rolesExist(user.tenantId, roles))) throw new ValidationError('Choose existing roles', { shares: ['Unknown role'] });
    if (!(await this.store.usersExist(user.tenantId, users))) throw new ValidationError('Choose existing users', { shares: ['Unknown user'] });
  }

  private async checkRecipients(user: SessionUser, ids: string[]) {
    if (!(await this.store.usersExist(user.tenantId, ids))) throw new ValidationError('Choose existing users', { recipientUserIds: ['Unknown user'] });
  }

  /** Column rows numbered 1..n; a row keeps its id when its field keeps its number (no seq / fieldKey key clashes). */
  private columnRows(source: string, cols: ReportColumnInput[], existing: StoredReport['columns'] = []) {
    const keys = new Set<string>();
    return cols
      .filter((c) => (keys.has(c.fieldKey) ? false : (keys.add(c.fieldKey), true)))
      .map((c, i) => {
        const f = reportField(source, c.fieldKey)!;
        const prev = existing.find((x) => x.fieldKey === c.fieldKey && x.seq === i + 1);
        return { ...(prev && { id: prev.id }), seq: i + 1, fieldKey: c.fieldKey, label: c.label || f.label, isVisible: c.isVisible, aggregate: c.aggregate, format: formatOf(f.type), widthPx: c.widthPx ?? null };
      });
  }

  private shareRows(shares: ReportShareInput[], existing: StoredReport['shares'] = []) {
    const seen = new Set<string>();
    return shares
      .filter((s) => { const k = `${s.shareType}:${s.roleId ?? s.userId}`; return seen.has(k) ? false : (seen.add(k), true); })
      .map((s) => {
        const prev = existing.find((x) => x.shareType === s.shareType && (x.roleId ?? null) === (s.roleId ?? null) && (x.userId ?? null) === (s.userId ?? null));
        return { ...(prev && { id: prev.id }), shareType: s.shareType, roleId: s.shareType === 'ROLE' ? s.roleId : null, userId: s.shareType === 'USER' ? s.userId : null, canEdit: s.canEdit };
      });
  }

  /** The stored schedule row, with the next run worked out (every schedule carries one, so ACTIVE always satisfies the DB check). */
  private scheduleRow(s: ReportScheduleCreate) {
    const weekly = s.frequency === 'WEEKLY', monthly = s.frequency === 'MONTHLY' || s.frequency === 'QUARTERLY';
    const row = { frequency: s.frequency, dayOfWeek: weekly ? s.dayOfWeek ?? null : null, dayOfMonth: monthly ? s.dayOfMonth ?? null : null, runTime: s.runTime };
    return {
      ...row, format: s.format, recipientEmails: s.recipientEmails, recipientUserIds: s.recipientUserIds, onlyIfRows: s.onlyIfRows, status: s.status,
      nextRunAt: s.status === 'ACTIVE' ? nextRunAt(row, new Date()).toISOString() : null,
    };
  }
}
