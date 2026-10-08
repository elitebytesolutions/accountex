import { Injectable } from '@nestjs/common';
import type { PrivacyRequest, PrivacyRequestCreate, PrivacySummary } from '../../../../../../shared/index.js';
import type { PrivacyRequests } from '../../../../../generated/prisma/client.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { PrivacyStore } from '../application/privacy-store.js';
import { daysLeft, exportAvailable } from '../domain/erasure-policy.js';
import { todayPk } from '../../change-requests/domain/rollout-schedule.js';
import { iso, isoDate, isSoloStaff, staffNames } from '../../infrastructure/staff-names.js';

@Injectable()
export class PrismaPrivacyStore extends PrivacyStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  async list() {
    return this.map(await this.db().privacyRequests.findMany({ orderBy: [{ receivedOn: 'desc' }, { createdAt: 'desc' }], take: 300 }));
  }

  async get(id: string) {
    const r = await this.db().privacyRequests.findUnique({ where: { id } });
    return r ? (await this.map([r]))[0]! : null;
  }

  async tenant(id: string) {
    const t = await this.db().tenants.findUnique({ where: { id }, select: { id: true, code: true, displayName: true, status: true } });
    return t ? { id: t.id, code: t.code, name: t.displayName, status: t.status } : null;
  }

  async hasOpen(tenantId: string, requestType: string) {
    return (await this.db().privacyRequests.count({ where: { tenantId, requestType, step: { notIn: ['DONE', 'REJECTED'] } } })) > 0;
  }

  create(input: PrivacyRequestCreate) {
    return addUpdate(this.prisma, 'privacyRequestAddUpdate', {
      tenantId: input.tenantId, requestType: input.requestType, requestedByName: input.requestedByName, requestedByRole: input.requestedByRole ?? null,
      requesterEmail: input.requesterEmail ?? null, ...(input.receivedOn ? { receivedOn: input.receivedOn } : {}),
    });
  }

  async verify(id: string) {
    await this.db().$queryRaw`select "Platform"."privacyRequestVerify"(${id}::uuid)::text as id`;
  }

  async approve(id: string, note: string | null) {
    const rows = await this.db().$queryRaw<{ step: string }[]>`select "Platform"."privacyRequestApprove"(${id}::uuid, ${note}) as step`;
    return rows[0]!.step;
  }

  async reject(id: string, reason: string) {
    await this.db().$queryRaw`select "Platform"."privacyRequestReject"(${id}::uuid, ${reason})::text as id`;
  }

  async startExport(id: string, backupRunId: string) {
    await this.db().$queryRaw`select "Platform"."privacyRequestStartExport"(${id}::uuid, ${backupRunId}::uuid)::text as id`;
  }

  async fulfilExport(id: string) {
    const rows = await this.db().$queryRaw<{ step: string }[]>`select "Platform"."privacyRequestFulfilExport"(${id}::uuid) as step`;
    return rows[0]!.step;
  }

  async fulfilDelete(id: string, confirmCode: string) {
    const rows = await this.db().$queryRaw<{ s: PrivacySummary }[]>`select "Platform"."privacyRequestFulfilDelete"(${id}::uuid, ${confirmCode}) as s`;
    return rows[0]!.s;
  }

  isSolo() {
    return isSoloStaff(this.prisma);
  }

  refs(id: string) {
    return this.db().privacyRequests.findUnique({ where: { id }, select: { approver1StaffId: true, exportBackupRunId: true } });
  }

  private async map(rows: PrivacyRequests[]): Promise<PrivacyRequest[]> {
    if (!rows.length) return [];
    const db = this.db();
    const [tenants, runs] = await Promise.all([
      db.tenants.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.tenantId))] } }, select: { id: true, code: true, displayName: true, status: true } }),
      db.backupRuns.findMany({ where: { id: { in: rows.map((r) => r.exportBackupRunId).filter((x): x is string => !!x) } }, select: { id: true, status: true } }),
    ]);
    const names = await staffNames(this.prisma, rows.flatMap((r) => [r.verifiedByStaffId, r.approver1StaffId, r.approver2StaffId]));
    const today = todayPk();
    return rows.map((r) => {
      const t = tenants.find((x) => x.id === r.tenantId);
      const runStatus = r.exportBackupRunId ? (runs.find((x) => x.id === r.exportBackupRunId)?.status ?? null) : null;
      const n = (id: string | null) => (id ? (names.get(id) ?? null) : null);
      return {
        id: r.id, docNo: r.docNo, tenantId: r.tenantId, tenantCode: t?.code ?? '', tenantName: t?.displayName ?? '', tenantStatus: t?.status ?? '', requestType: r.requestType,
        requestedByName: r.requestedByName, requestedByRole: r.requestedByRole, requesterEmail: r.requesterEmail, receivedOn: isoDate(r.receivedOn)!, dueOn: isoDate(r.dueOn)!,
        daysLeft: daysLeft(isoDate(r.dueOn)!, r.step, today), step: r.step, verifiedBy: n(r.verifiedByStaffId), verifiedAt: iso(r.verifiedAt),
        approver1: n(r.approver1StaffId), approved1At: iso(r.approved1At), approver2: n(r.approver2StaffId), approved2At: iso(r.approved2At),
        approvals: (r.approver1StaffId ? 1 : 0) + (r.approver2StaffId ? 1 : 0), decisionNote: r.decisionNote, rejectedReason: r.rejectedReason, rejectedAt: iso(r.rejectedAt),
        completedAt: iso(r.completedAt), certificateRef: r.certificateRef, exportStatus: runStatus, exportLinkExpiresAt: iso(r.exportLinkExpiresAt),
        exportAvailable: r.requestType === 'EXPORT' && exportAvailable(r.step, r.exportLinkExpiresAt, runStatus),
        summary: (r.fulfilmentSummary as PrivacySummary | null) ?? null, rowVersion: r.rowVersion,
      };
    });
  }
}
