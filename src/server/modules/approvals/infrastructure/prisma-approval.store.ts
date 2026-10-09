import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { ConcurrencyError } from '../../../core/domain/errors.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { ApprovalStore, type ActionRow, type ApprovalRow } from '../application/approval-store.js';
import type { EngineWorkflow } from '../domain/engine.js';

type Row = Prisma.ApprovalsGetPayload<object>;
const map = (r: Row): ApprovalRow => ({
  id: r.id, workflowId: r.workflowId, entityType: r.entityType, entityId: r.entityId, docLabel: r.docLabel, title: r.title, amount: r.amount?.toNumber() ?? null,
  currencyCode: r.currencyCode, branchId: r.branchId, requestedByUserId: r.requestedByUserId, requestedAt: r.requestedAt, currentStepNo: r.currentStepNo,
  currentStepDueAt: r.currentStepDueAt, status: r.status, completedAt: r.completedAt, rowVersion: r.rowVersion,
});

@Injectable()
export class PrismaApprovalStore extends ApprovalStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async workflows(tenantId: string, subject: string): Promise<EngineWorkflow[]> {
    const db = this.prisma.db();
    const wfs = await db.approvalWorkflows.findMany({ where: { tenantId, subject, status: 'ACTIVE', deletedAt: null } });
    return this.full(tenantId, wfs);
  }

  async workflow(tenantId: string, id: string) {
    const wfs = await this.prisma.db().approvalWorkflows.findMany({ where: { tenantId, id } });
    return (await this.full(tenantId, wfs))[0] ?? null;
  }

  private async full(tenantId: string, wfs: { id: string; name: string; priority: number; onComplete: string; onReject: string }[]): Promise<EngineWorkflow[]> {
    if (!wfs.length) return [];
    const db = this.prisma.db();
    const ids = wfs.map((w) => w.id);
    const [conds, steps] = await Promise.all([
      db.approvalWorkflowConditions.findMany({ where: { tenantId, workflowId: { in: ids } }, orderBy: { seq: 'asc' } }),
      db.approvalWorkflowSteps.findMany({ where: { tenantId, workflowId: { in: ids } }, orderBy: { stepNo: 'asc' } }),
    ]);
    return wfs.map((w) => ({
      id: w.id, name: w.name, priority: w.priority, onComplete: w.onComplete, onReject: w.onReject,
      conditions: conds.filter((c) => c.workflowId === w.id).map((c) => ({ seq: c.seq, field: c.field, operator: c.operator, value: c.value })),
      steps: steps.filter((s) => s.workflowId === w.id).map((s) => ({
        id: s.id, stepNo: s.stepNo, name: s.name, approverType: s.approverType, approverRoleId: s.approverRoleId, approverUserId: s.approverUserId,
        appliesAboveAmount: s.appliesAboveAmount?.toNumber() ?? null, slaHours: s.slaHours.toNumber(), approvalMode: s.approvalMode, blockSelfApproval: s.blockSelfApproval,
        allowDelegation: s.allowDelegation, requireComment: s.requireComment,
      })),
    }));
  }

  async defaultUserId(tenantId: string) {
    return (await this.prisma.db().tenants.findFirst({ where: { id: tenantId }, select: { defaultUserId: true } }))?.defaultUserId ?? null;
  }

  async roleMembers(tenantId: string, roleIds: string[]) {
    if (!roleIds.length) return [];
    const db = this.prisma.db();
    const rows = await db.userRoles.findMany({ where: { tenantId, roleId: { in: roleIds } }, select: { roleId: true, userId: true } });
    const active = await db.users.findMany({ where: { tenantId, id: { in: rows.map((r) => r.userId) }, status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    const ok = new Set(active.map((u) => u.id));
    return rows.filter((r) => ok.has(r.userId));
  }

  async lineManagerUser(tenantId: string, userId: string) {
    const db = this.prisma.db();
    const u = await db.users.findFirst({ where: { tenantId, id: userId }, select: { employeeId: true } });
    if (!u?.employeeId) return null;
    const e = await db.employees.findFirst({ where: { tenantId, id: u.employeeId }, select: { reportingManagerId: true } });
    if (!e?.reportingManagerId) return null;
    const m = await db.employees.findFirst({ where: { tenantId, id: e.reportingManagerId }, select: { appUserId: true } });
    return m?.appUserId ?? null;
  }

  async delegations(tenantId: string, subject: string) {
    const today = new Date(new Date().toISOString().slice(0, 10));
    return this.prisma.db().approvalDelegations.findMany({
      where: { tenantId, isActive: true, startsOn: { lte: today }, endsOn: { gte: today }, OR: [{ subject: null }, { subject }] },
      select: { fromUserId: true, toUserId: true },
    });
  }

  async names(tenantId: string, userIds: string[]) {
    const rows = await this.prisma.db().users.findMany({ where: { tenantId, id: { in: [...new Set(userIds)] } }, select: { id: true, fullName: true } });
    return new Map(rows.map((r) => [r.id, r.fullName]));
  }

  async activeUsers(tenantId: string) {
    const rows = await this.prisma.db().users.findMany({ where: { tenantId, status: 'ACTIVE', deletedAt: null }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } });
    return rows.map((r) => ({ id: r.id, name: r.fullName }));
  }

  async request(tenantId: string, id: string) {
    const r = await this.prisma.db().approvals.findFirst({ where: { tenantId, id } });
    return r ? map(r) : null;
  }

  async requestFor(tenantId: string, entityType: string, entityId: string) {
    const r = await this.prisma.db().approvals.findFirst({ where: { tenantId, entityType, entityId }, orderBy: { requestedAt: 'desc' } });
    return r ? map(r) : null;
  }

  async pending(tenantId: string) {
    return (await this.prisma.db().approvals.findMany({ where: { tenantId, status: 'PENDING' }, orderBy: { requestedAt: 'asc' } })).map(map);
  }

  async requestedBy(tenantId: string, userId: string) {
    return (await this.prisma.db().approvals.findMany({ where: { tenantId, requestedByUserId: userId }, orderBy: { requestedAt: 'desc' }, take: 50 })).map(map);
  }

  async actions(tenantId: string, requestIds: string[]): Promise<ActionRow[]> {
    if (!requestIds.length) return [];
    const rows = await this.prisma.db().approvalActions.findMany({ where: { tenantId, requestId: { in: requestIds } }, orderBy: { actedAt: 'asc' } });
    return rows.map((a) => ({
      id: a.id, requestId: a.requestId, stepNo: a.stepNo, action: a.action, actorUserId: a.actorUserId, onBehalfOfUserId: a.onBehalfOfUserId,
      delegateToUserId: a.delegateToUserId, actedAt: a.actedAt, reason: a.reason, comment: a.comment,
    }));
  }

  async approvedTodayBy(tenantId: string, userId: string) {
    const start = new Date(new Date().toISOString().slice(0, 10));
    return this.prisma.db().approvalActions.count({ where: { tenantId, actorUserId: userId, action: 'APPROVE', actedAt: { gte: start } } });
  }

  async create(tenantId: string, row: Parameters<ApprovalStore['create']>[1]) {
    const r = await this.prisma.db().approvals.create({ data: { ...row, tenantId, status: 'PENDING' } });
    return r.id;
  }

  async update(tenantId: string, id: string, rowVersion: number, data: Parameters<ApprovalStore['update']>[3]) {
    const { count } = await this.prisma.db().approvals.updateMany({ where: { tenantId, id, rowVersion }, data });
    if (count !== 1) throw new ConcurrencyError('Someone else acted on this request. Reload and try again.');
  }

  async addAction(tenantId: string, row: Parameters<ApprovalStore['addAction']>[1]) {
    await this.prisma.db().approvalActions.create({ data: { ...row, tenantId } });
  }
}
