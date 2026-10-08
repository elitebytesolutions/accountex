import { Injectable } from '@nestjs/common';
import type { ChangeRequestKpis, ChangeRequestPatch, FlagScheduleStep } from '../../../../../../shared/index.js';
import type { FlagChangeRequests } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { ChangeRequestStore, type ChangeRequestSubmit, type DueStep, type StoredChangeRequest } from '../application/change-request-store.js';
import { iso, isoDate, isSoloStaff, staffNames } from '../../infrastructure/staff-names.js';

@Injectable()
export class PrismaChangeRequestStore extends ChangeRequestStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  async list(q: { status?: string; flagId?: string }) {
    const rows = await this.db().flagChangeRequests.findMany({
      where: { ...(q.status && q.status !== 'ALL' ? { status: q.status } : {}), ...(q.flagId ? { flagId: q.flagId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return this.map(rows);
  }

  async get(id: string) {
    const r = await this.db().flagChangeRequests.findUnique({ where: { id } });
    return r ? (await this.map([r]))[0]! : null;
  }

  async kpis(): Promise<ChangeRequestKpis> {
    const [r] = await this.db().$queryRaw<{ pending: number; approved: number; rejected: number; median: number | null }[]>`
      select count(*) filter (where status = 'PENDING')::int as pending,
             count(*) filter (where status = 'APPROVED' and "decidedAt" >= now() - interval '30 days')::int as approved,
             count(*) filter (where status = 'REJECTED' and "decidedAt" >= now() - interval '30 days')::int as rejected,
             (percentile_cont(0.5) within group (order by extract(epoch from "decidedAt" - "createdAt") / 60)
                filter (where status = 'APPROVED' and "decidedAt" >= now() - interval '30 days'))::float8 as median
        from "Platform"."FlagChangeRequests"`;
    return { pending: r?.pending ?? 0, approved30d: r?.approved ?? 0, rejected30d: r?.rejected ?? 0, medianApproveMinutes: r?.median === null || r?.median === undefined ? null : Math.round(Number(r.median)) };
  }

  async submit(d: ChangeRequestSubmit) {
    const rows = await this.db().$queryRaw<{ id: string }[]>`select "Platform"."flagChangeRequestSubmit"(${JSON.stringify(d)}::jsonb)::text as id`;
    return rows[0]!.id;
  }

  async decide(id: string, approve: boolean, note: string) {
    await this.db().$queryRaw`select "Platform"."flagChangeRequestDecide"(${id}::uuid, ${approve}, ${note})::text as id`;
  }

  async cancel(id: string, reason: string | null) {
    await this.db().$queryRaw`select "Platform"."flagChangeRequestCancel"(${id}::uuid, ${reason})::text as id`;
  }

  async markApplied(id: string, summary: string, before: unknown, after: unknown) {
    await this.db().$queryRaw`
      select "Platform"."flagChangeRequestMarkApplied"(${id}::uuid, ${summary}, ${JSON.stringify(before ?? {})}::jsonb, ${JSON.stringify(after ?? {})}::jsonb)::text as id`;
  }

  async comment(id: string, staffId: string, body: string) {
    await this.db().flagChangeRequestComments.create({ data: { changeRequestId: id, staffUserId: staffId, body } });
  }

  async dueApproved(now: Date) {
    const rows = await this.db().flagChangeRequests.findMany({
      where: { status: 'APPROVED', appliedAt: null, OR: [{ applyNotBefore: null }, { applyNotBefore: { lte: now } }] },
      orderBy: { decidedAt: 'asc' },
    });
    return this.map(rows);
  }

  isSolo() {
    return isSoloStaff(this.prisma);
  }

  async isStaff(id: string | null) {
    if (!id) return false;
    return (await staffNames(this.prisma, [id])).has(id);
  }

  async schedule(flagId: string, environment: string): Promise<FlagScheduleStep[]> {
    const rows = await this.db().flagScheduledChanges.findMany({ where: { flagId, environment }, orderBy: { stepDate: 'asc' } });
    const crIds = rows.map((r) => r.changeRequestId).filter((x): x is string => !!x);
    const crs = crIds.length ? await this.db().flagChangeRequests.findMany({ where: { id: { in: crIds } }, select: { id: true, docNo: true } }) : [];
    return rows.map((r) => ({
      id: r.id, environment: r.environment, stepDate: isoDate(r.stepDate)!, rolloutPct: r.rolloutPct, status: r.status, changeRequestId: r.changeRequestId,
      changeRequestDocNo: crs.find((c) => c.id === r.changeRequestId)?.docNo ?? null, rowVersion: r.rowVersion,
    }));
  }

  async saveSchedule(flagId: string, environment: string, steps: { id?: string; stepDate: string; rolloutPct: number }[]) {
    const db = this.db();
    const planned = await db.flagScheduledChanges.findMany({ where: { flagId, environment, status: 'PLANNED' } });
    const keep = new Set(steps.map((s) => s.id).filter(Boolean));
    const gone = planned.filter((p) => !keep.has(p.id)).map((p) => p.id);
    if (gone.length) await db.flagScheduledChanges.deleteMany({ where: { id: { in: gone } } });
    for (const s of steps) {
      const stepDate = new Date(`${s.stepDate}T00:00:00Z`);
      const cur = s.id ? planned.find((p) => p.id === s.id) : undefined;
      if (!s.id) await db.flagScheduledChanges.create({ data: { flagId, environment, stepDate, rolloutPct: s.rolloutPct, status: 'PLANNED' } });
      else if (cur && (isoDate(cur.stepDate) !== s.stepDate || cur.rolloutPct !== s.rolloutPct)) await db.flagScheduledChanges.update({ where: { id: cur.id }, data: { stepDate, rolloutPct: s.rolloutPct } });
    }
  }

  async dueSteps(today: string): Promise<DueStep[]> {
    const rows = await this.db().$queryRaw<{ id: string; flagId: string; environment: string; stepDate: Date; rolloutPct: number; createdBy: string | null; ownerStaffId: string }[]>`
      select s.id::text as id, s."flagId"::text as "flagId", s.environment, s."stepDate", s."rolloutPct", s."createdBy"::text as "createdBy", f."ownerStaffId"::text as "ownerStaffId"
        from "Platform"."FlagScheduledChanges" s join "Platform"."FeatureFlags" f on f.id = s."flagId"
       where s.status = 'PLANNED' and s."stepDate" <= ${today}::date and f.stage <> 'ARCHIVED'
       order by s."stepDate", s."createdAt"`;
    return rows.map((r) => ({ ...r, stepDate: isoDate(r.stepDate)!, rolloutPct: Number(r.rolloutPct) }));
  }

  async markStepRequested(stepId: string, changeRequestId: string) {
    await this.db().flagScheduledChanges.update({ where: { id: stepId }, data: { status: 'REQUESTED', changeRequestId } });
  }

  private async map(rows: FlagChangeRequests[]): Promise<StoredChangeRequest[]> {
    if (!rows.length) return [];
    const db = this.db();
    const ids = rows.map((r) => r.id);
    const [flags, approvers, comments] = await Promise.all([
      db.featureFlags.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.flagId))] } }, select: { id: true, key: true, name: true, flagType: true } }),
      db.flagChangeRequestApprovers.findMany({ where: { changeRequestId: { in: ids } }, orderBy: { createdAt: 'asc' } }),
      db.flagChangeRequestComments.findMany({ where: { changeRequestId: { in: ids } }, orderBy: { postedAt: 'asc' } }),
    ]);
    const names = await staffNames(this.prisma, [...rows.flatMap((r) => [r.requesterStaffId, r.decidedByStaffId]), ...approvers.map((a) => a.staffUserId), ...comments.map((c) => c.staffUserId)]);
    const now = Date.now();
    return rows.map((r) => {
      const f = flags.find((x) => x.id === r.flagId);
      return {
        id: r.id, docNo: r.docNo, flagId: r.flagId, flagKey: f?.key ?? '', flagName: f?.name ?? '', flagType: f?.flagType ?? '', environment: r.environment,
        requesterStaffId: r.requesterStaffId, requesterName: names.get(r.requesterStaffId) ?? '—', reason: r.reason, summary: r.summary,
        beforeState: r.beforeState, afterState: r.afterState, patch: r.patch as unknown as ChangeRequestPatch, applyNotBefore: iso(r.applyNotBefore), source: r.source, status: r.status,
        decidedByStaffId: r.decidedByStaffId, decidedBy: r.decidedByStaffId ? (names.get(r.decidedByStaffId) ?? null) : null, decidedAt: iso(r.decidedAt),
        decisionNote: r.decisionNote, appliedAt: iso(r.appliedAt), createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
        scheduled: r.status === 'APPROVED' && !r.appliedAt && !!r.applyNotBefore && r.applyNotBefore.getTime() > now,
        approvers: approvers.filter((a) => a.changeRequestId === r.id).map((a) => ({ staffId: a.staffUserId, name: names.get(a.staffUserId) ?? '—', decision: a.decision, decidedAt: iso(a.decidedAt) })),
        comments: comments.filter((c) => c.changeRequestId === r.id).map((c) => ({ id: c.id, staffId: c.staffUserId, staffName: names.get(c.staffUserId) ?? '—', body: c.body, postedAt: c.postedAt.toISOString() })),
      };
    });
  }
}
