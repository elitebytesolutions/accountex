import { Injectable } from '@nestjs/common';
import type { Delegation, DelegationSave, Workflow, WorkflowSave } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { WorkflowStore } from '../application/workflow-store.js';

const day = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class PrismaWorkflowStore extends WorkflowStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<Workflow[]> {
    const db = this.prisma.db();
    const workflows = await db.approvalWorkflows.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ status: 'asc' }, { name: 'asc' }] });
    if (!workflows.length) return [];
    const ids = workflows.map((w) => w.id);
    const [steps, conditions, names] = await Promise.all([
      db.approvalWorkflowSteps.findMany({ where: { tenantId, workflowId: { in: ids } }, orderBy: { stepNo: 'asc' } }),
      db.approvalWorkflowConditions.findMany({ where: { tenantId, workflowId: { in: ids } }, orderBy: { seq: 'asc' } }),
      this.names(tenantId),
    ]);
    return workflows.map((w) => ({
      id: w.id,
      name: w.name,
      subject: w.subject,
      description: w.description,
      status: w.status,
      version: w.version,
      priority: w.priority,
      onComplete: w.onComplete,
      onReject: w.onReject,
      notifyPreparer: w.notifyPreparer,
      notifyInApp: w.notifyInApp,
      notifyEmail: w.notifyEmail,
      notifyWhatsapp: w.notifyWhatsapp,
      publishedAt: w.publishedAt?.toISOString() ?? null,
      rowVersion: w.rowVersion,
      steps: steps
        .filter((s) => s.workflowId === w.id)
        .map((s) => ({
          id: s.id,
          stepNo: s.stepNo,
          name: s.name,
          approverType: s.approverType as 'ROLE' | 'USER' | 'LINE_MANAGER',
          approverRoleId: s.approverRoleId,
          approverUserId: s.approverUserId,
          approverLabel:
            s.approverType === 'ROLE' ? `Role: ${names.roles.get(s.approverRoleId ?? '') ?? 'deleted role'}`
            : s.approverType === 'USER' ? (names.users.get(s.approverUserId ?? '') ?? 'Removed user')
            : "Preparer's line manager",
          appliesAboveAmount: s.appliesAboveAmount?.toNumber() ?? null,
          slaHours: s.slaHours.toNumber(),
          onSlaBreach: s.onSlaBreach,
          approvalMode: s.approvalMode,
          blockSelfApproval: s.blockSelfApproval,
          allowDelegation: s.allowDelegation,
          requireComment: s.requireComment,
        })),
      conditions: conditions.filter((c) => c.workflowId === w.id).map((c) => ({ id: c.id, seq: c.seq, field: c.field, operator: c.operator, value: c.value })),
    }));
  }

  async get(tenantId: string, id: string) {
    return (await this.list(tenantId)).find((w) => w.id === id) ?? null;
  }

  save(data: WorkflowSave & { id?: string; rowVersion?: number }) {
    const { steps, conditions, ...fields } = data;
    return addUpdate(this.prisma, 'approvalWorkflowAddUpdate', {
      ...fields,
      // Replaced as a whole (no ids), so renumbering never collides with the unique step number.
      steps: steps.map((s, i) => ({ ...s, id: undefined, stepNo: i + 1 })),
      conditions: conditions.map((c, i) => ({ ...c, id: undefined, seq: i + 1 })),
    });
  }

  async setStatus(id: string, rowVersion: number, status: 'ACTIVE' | 'INACTIVE', publishedByUserId?: string) {
    const db = this.prisma.db();
    const wf = await db.approvalWorkflows.findUnique({ where: { id }, select: { publishedAt: true, version: true } });
    const publishing = status === 'ACTIVE' && publishedByUserId;
    const { count } = await db.approvalWorkflows.updateMany({
      where: { id, rowVersion },
      data: {
        status,
        ...(publishing && { publishedAt: new Date(), publishedByUserId, version: wf?.publishedAt ? (wf.version ?? 1) + 1 : (wf?.version ?? 1) }),
      },
    });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this workflow. Reload and try again.');
  }

  async softDelete(id: string, rowVersion: number) {
    const { count } = await this.prisma.db().approvalWorkflows.updateMany({ where: { id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this workflow. Reload and try again.');
  }

  async validApprovers(tenantId: string, roleIds: string[], userIds: string[]) {
    const db = this.prisma.db();
    const [roles, users] = await Promise.all([
      roleIds.length ? db.roles.findMany({ where: { tenantId, id: { in: roleIds }, deletedAt: null }, select: { id: true } }) : [],
      userIds.length ? db.users.findMany({ where: { tenantId, id: { in: userIds }, status: 'ACTIVE', deletedAt: null }, select: { id: true } }) : [],
    ]);
    return { roleIds: roles.map((r) => r.id), userIds: users.map((u) => u.id) };
  }

  async approvers(tenantId: string) {
    const db = this.prisma.db();
    const [roles, users] = await Promise.all([
      db.roles.findMany({ where: { tenantId, deletedAt: null, NOT: { systemKey: 'EMPLOYEE' } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.users.findMany({ where: { tenantId, status: 'ACTIVE', deletedAt: null }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } }),
    ]);
    return { roles, users: users.map((u) => ({ id: u.id, name: u.fullName })) };
  }

  async delegations(tenantId: string): Promise<Delegation[]> {
    const [rows, names] = await Promise.all([
      this.prisma.db().approvalDelegations.findMany({ where: { tenantId }, orderBy: [{ isActive: 'desc' }, { startsOn: 'desc' }] }),
      this.names(tenantId),
    ]);
    return rows.map((d) => ({
      id: d.id,
      fromUserId: d.fromUserId,
      fromUserName: names.users.get(d.fromUserId) ?? 'Removed user',
      toUserId: d.toUserId,
      toUserName: names.users.get(d.toUserId) ?? 'Removed user',
      subject: d.subject,
      startsOn: day(d.startsOn),
      endsOn: day(d.endsOn),
      reason: d.reason,
      isActive: d.isActive,
      rowVersion: d.rowVersion,
    }));
  }

  async delegation(tenantId: string, id: string) {
    return (await this.delegations(tenantId)).find((d) => d.id === id) ?? null;
  }

  saveDelegation(data: DelegationSave & { id?: string; rowVersion?: number }) {
    return addUpdate(this.prisma, 'approvalDelegationAddUpdate', data);
  }

  async deleteDelegation(tenantId: string, id: string) {
    await this.prisma.db().approvalDelegations.deleteMany({ where: { tenantId, id } });
  }

  private async names(tenantId: string) {
    const db = this.prisma.db();
    const [roles, users] = await Promise.all([
      db.roles.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      db.users.findMany({ where: { tenantId }, select: { id: true, fullName: true } }),
    ]);
    return { roles: new Map(roles.map((r) => [r.id, r.name])), users: new Map(users.map((u) => [u.id, u.fullName])) };
  }
}
