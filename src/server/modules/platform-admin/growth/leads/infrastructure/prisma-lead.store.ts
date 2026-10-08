import { Injectable } from '@nestjs/common';
import type { Lead, LeadActivity, LeadBoard, LeadListQuery } from '../../../../../../shared/index.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { LeadStore } from '../application/lead-store.js';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

type Row = {
  id: string; companyName: string; contactPerson: string | null; phone: string | null; email: string | null; city: string | null; source: string;
  partnerId: string | null; partnerName: string | null; ownerStaffId: string; ownerName: string; planInterestId: string | null; planCode: string | null;
  planName: string | null; expectedMrr: string; stage: string; boardPosition: number; notes: string | null; demoAt: Date | null; trialStartedOn: Date | null;
  trialEndsOn: Date | null; trialEngagementScore: number | null; wonAt: Date | null; churnedAt: Date | null; lostReason: string | null;
  tenantId: string | null; tenantCode: string | null; tenantName: string | null; createdAt: Date; updatedAt: Date; rowVersion: number;
};

const SELECT = `
  select l.id::text, l."companyName", l."contactPerson", l.phone, l.email::text as email, l.city, l.source, l."partnerId"::text as "partnerId",
         r."name" as "partnerName", l."ownerStaffId"::text as "ownerStaffId", st."fullName" as "ownerName", l."planInterestId"::text as "planInterestId",
         p.code as "planCode", p.name as "planName", l."expectedMrr"::text as "expectedMrr", l.stage, l."boardPosition", l.notes, l."demoAt",
         l."trialStartedOn", l."trialEndsOn", l."trialEngagementScore", l."wonAt", l."churnedAt", l."lostReason", l."tenantId"::text as "tenantId",
         tn.code::text as "tenantCode", tn."displayName" as "tenantName", l."createdAt", l."updatedAt", l."rowVersion"
    from "Platform"."PlatformLeads" l
    join "Platform"."PlatformStaff" st on st.id = l."ownerStaffId"
    left join "Platform"."Resellers" r on r.id = l."partnerId"
    left join "Platform"."SubscriptionPlans" p on p.id = l."planInterestId"
    left join "Platform"."Tenants" tn on tn.id = l."tenantId"
   where l."deletedAt" is null`;

const toLead = (r: Row): Lead => ({
  id: r.id, companyName: r.companyName, contactPerson: r.contactPerson, phone: r.phone, email: r.email, city: r.city, source: r.source,
  partnerId: r.partnerId, partnerName: r.partnerName, ownerStaffId: r.ownerStaffId, ownerName: r.ownerName, planInterestId: r.planInterestId,
  planCode: r.planCode, planName: r.planName, expectedMrr: Number(r.expectedMrr), stage: r.stage, boardPosition: r.boardPosition, notes: r.notes,
  demoAt: iso(r.demoAt), trialStartedOn: isoDay(r.trialStartedOn), trialEndsOn: isoDay(r.trialEndsOn), trialEngagementScore: r.trialEngagementScore,
  wonAt: iso(r.wonAt), churnedAt: iso(r.churnedAt), lostReason: r.lostReason, tenantId: r.tenantId, tenantCode: r.tenantCode, tenantName: r.tenantName,
  createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), rowVersion: r.rowVersion,
});

@Injectable()
export class PrismaLeadStore extends LeadStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(q: LeadListQuery): Promise<Lead[]> {
    const args: unknown[] = [];
    const arg = (v: unknown) => { args.push(v); return `$${args.length}`; };
    let where = '';
    if (q.search) where += ` and (l."companyName" ilike ${arg(`%${q.search}%`)} or l.city ilike $${args.length})`;
    if (q.ownerStaffId) where += ` and l."ownerStaffId" = ${arg(q.ownerStaffId)}::uuid`;
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(`${SELECT}${where} order by l."boardPosition", l."createdAt" desc`, ...args);
    return rows.map(toLead);
  }

  async get(id: string): Promise<Lead | null> {
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(`${SELECT} and l.id = $1::uuid`, id);
    return rows[0] ? toLead(rows[0]) : null;
  }

  async activities(leadId: string): Promise<LeadActivity[]> {
    const rows = await this.prisma.db().$queryRaw<{ id: string; activityType: string; fromStage: string | null; toStage: string | null; note: string | null; staffName: string | null; occurredAt: Date }[]>`
      select a.id::text, a."activityType", a."fromStage", a."toStage", a.note, st."fullName" as "staffName", a."occurredAt"
        from "Platform"."PlatformLeadActivities" a left join "Platform"."PlatformStaff" st on st.id = a."staffUserId"
       where a."leadId" = ${leadId}::uuid order by a."occurredAt" desc, a."createdAt" desc`;
    return rows.map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() }));
  }

  async pipeline(): Promise<LeadBoard['pipeline']> {
    const rows = await this.prisma.db().$queryRaw<{ stage: string; stageOrder: number; currentCount: number; currentValue: string; reached: number; stepConversionPct: string | null; winRatePct: string | null; pipelineValue: string }[]>`
      select stage, "stageOrder", "currentCount", "currentValue"::text, reached, "stepConversionPct"::text, "winRatePct"::text, "pipelineValue"::text
        from "Platform"."getPlatformLeadPipeline" order by "stageOrder"`;
    return {
      stages: rows.map((r) => ({
        stage: r.stage, stageOrder: r.stageOrder, currentCount: r.currentCount, currentValue: Number(r.currentValue), reached: r.reached,
        stepConversionPct: r.stepConversionPct === null ? null : Number(r.stepConversionPct),
      })),
      winRatePct: rows[0]?.winRatePct == null ? null : Number(rows[0].winRatePct),
      pipelineValue: Number(rows[0]?.pipelineValue ?? 0),
    };
  }

  async staff() {
    return this.prisma.db().$queryRaw<{ id: string; name: string }[]>`
      select id::text, "fullName" as name from "Platform"."PlatformStaff" where status = 'ACTIVE' and "removedAt" is null order by "fullName"`;
  }

  async column(stage: string) {
    return this.prisma.db().$queryRaw<{ id: string; position: number }[]>`
      select id::text, "boardPosition" as position from "Platform"."PlatformLeads"
       where stage = ${stage} and "deletedAt" is null order by "boardPosition", "createdAt" desc`;
  }

  private async exists(sql: string, id: string) {
    const rows = await this.prisma.db().$queryRawUnsafe<{ ok: boolean }[]>(sql, id);
    return !!rows[0]?.ok;
  }
  partnerExists(id: string) { return this.exists(`select exists(select 1 from "Platform"."Resellers" where id = $1::uuid) as ok`, id); }
  planExists(id: string) { return this.exists(`select exists(select 1 from "Platform"."SubscriptionPlans" where id = $1::uuid) as ok`, id); }
  staffExists(id: string) { return this.exists(`select exists(select 1 from "Platform"."PlatformStaff" where id = $1::uuid and status = 'ACTIVE') as ok`, id); }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'platformLeadAddUpdate', data);
  }

  async setPositions(rows: { id: string; position: number }[]) {
    for (const r of rows) await addUpdate(this.prisma, 'platformLeadAddUpdate', { id: r.id, boardPosition: r.position });
  }

  async move(data: { leadId: string; toStage: string; boardPosition: number; note: string | null; lostReason: string | null; staffUserId: string | null; rowVersion: number }) {
    await addUpdate(this.prisma, 'leadMoveStage', data);
  }

  async convert(leadId: string, tenantId: string, staffUserId: string | null) {
    await addUpdate(this.prisma, 'leadConvert', { leadId, tenantId, staffUserId });
  }

  async addActivity(a: { leadId: string; activityType: string; note: string | null; staffUserId: string | null; fromStage?: string | null; toStage?: string | null }) {
    await this.prisma.db().platformLeadActivities.create({
      data: { leadId: a.leadId, activityType: a.activityType, note: a.note, staffUserId: a.staffUserId, fromStage: a.fromStage ?? null, toStage: a.toStage ?? null },
    });
  }
}
