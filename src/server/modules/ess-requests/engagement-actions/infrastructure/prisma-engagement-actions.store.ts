import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import type {
  AnnouncementRead, Colleague, Directory, DirectoryPerson, KudosItem, KudosReaction, Presence, PresenceInput, PresenceStatus,
} from '../../../../../shared/self-service/engagement-actions.js';
import { KUDOS_REACTIONS } from '../../../../../shared/self-service/engagement-actions.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { employeeName, employeeOfUser, employeeRefs, ids, tenantTimezone, todayIn, unknownEmp } from '../../../hr/attendance/infrastructure/hr-refs.js';
import { EngagementActionsStore } from '../application/engagement-actions-store.js';

type KudosRow = {
  id: string; fromEmployeeId: string; toEmployeeId: string; badge: string; message: string; shareOnWall: boolean; givenAt: Date; pointsToRecipient: number;
};
type PresenceRow = { employeeId: string; status: string; message: string | null; locationLabel: string | null; untilAt: Date | null; source: string; updatedAt: Date };

const KUDOS_COLS = Prisma.sql`k.id::text, k."fromEmployeeId"::text, k."toEmployeeId"::text, k.badge, k.message, k."shareOnWall", k."givenAt", k."pointsToRecipient"`;
const presenceOf = (p: PresenceRow | undefined, now: Date): Presence | null =>
  p && (!p.untilAt || p.untilAt > now)
    ? { status: p.status as PresenceStatus, message: p.message, locationLabel: p.locationLabel, untilAt: p.untilAt?.toISOString() ?? null, source: p.source, updatedAt: p.updatedAt.toISOString() }
    : null;

/** Raw SQL over the EmployeeSelfService engagement tables (not mapped in schema.prisma). */
@Injectable()
export class PrismaEngagementActionsStore extends EngagementActionsStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  async employeeOfUser(tenantId: string, userId: string) {
    const e = await employeeOfUser(this.db(), tenantId, userId);
    return e && e.status !== 'EXITED' ? { id: e.id, departmentId: e.departmentId, status: e.status } : null;
  }

  async employeeRef(tenantId: string, employeeId: string) {
    return (await employeeRefs(this.db(), tenantId, [employeeId])).get(employeeId) ?? null;
  }

  async today(tenantId: string) {
    return todayIn(await tenantTimezone(this.db(), tenantId));
  }

  // ---------------------------------------------------------------- kudos
  private async items(tenantId: string, rows: KudosRow[], viewerId: string): Promise<KudosItem[]> {
    if (!rows.length) return [];
    const kudosIds = rows.map((r) => r.id);
    const [refs, rx] = await Promise.all([
      employeeRefs(this.db(), tenantId, rows.flatMap((r) => [r.fromEmployeeId, r.toEmployeeId])),
      this.db().$queryRaw<{ kudosId: string; reaction: string; n: number; mine: boolean }[]>`
        select r."kudosId"::text, r.reaction, count(*)::int as n, bool_or(r."employeeId" = ${viewerId}::uuid) as mine
          from "EmployeeSelfService"."KudosReactions" r
         where r."tenantId" = ${tenantId}::uuid and r."isActive" and r."kudosId" = any(${kudosIds}::uuid[])
         group by r."kudosId", r.reaction`,
    ]);
    return rows.map((r) => {
      const mineRx = rx.filter((x) => x.kudosId === r.id);
      return {
        id: r.id, from: refs.get(r.fromEmployeeId) ?? unknownEmp(r.fromEmployeeId), to: refs.get(r.toEmployeeId) ?? unknownEmp(r.toEmployeeId),
        badge: r.badge, message: r.message, shareOnWall: r.shareOnWall, givenAt: r.givenAt.toISOString(), pointsToRecipient: r.pointsToRecipient,
        reactions: Object.fromEntries(KUDOS_REACTIONS.map((c) => [c, mineRx.find((x) => x.reaction === c)?.n ?? 0])) as Record<KudosReaction, number>,
        mine: KUDOS_REACTIONS.filter((c) => mineRx.some((x) => x.reaction === c && x.mine)),
      };
    });
  }

  async wall(tenantId: string, viewerId: string, limit: number) {
    const rows = await this.db().$queryRaw<KudosRow[]>`
      select ${KUDOS_COLS} from "EmployeeSelfService"."Kudos" k
       where k."tenantId" = ${tenantId}::uuid and not k."isHidden"
         and (k."shareOnWall" or k."fromEmployeeId" = ${viewerId}::uuid or k."toEmployeeId" = ${viewerId}::uuid)
       order by k."givenAt" desc limit ${limit}`;
    return this.items(tenantId, rows, viewerId);
  }

  async received(tenantId: string, viewerId: string, yearStart: string) {
    const rows = await this.db().$queryRaw<KudosRow[]>`
      select ${KUDOS_COLS} from "EmployeeSelfService"."Kudos" k
       where k."tenantId" = ${tenantId}::uuid and k."toEmployeeId" = ${viewerId}::uuid and not k."isHidden" and k."givenAt" >= ${yearStart}::date
       order by k."givenAt" desc`;
    return this.items(tenantId, rows, viewerId);
  }

  async givenCount(tenantId: string, employeeId: string, yearStart: string) {
    const r = await this.db().$queryRaw<{ n: number; pts: number }[]>`
      select count(*)::int as n, coalesce(sum(k."pointsToGiver"), 0)::int as pts from "EmployeeSelfService"."Kudos" k
       where k."tenantId" = ${tenantId}::uuid and k."fromEmployeeId" = ${employeeId}::uuid and not k."isHidden" and k."givenAt" >= ${yearStart}::date`;
    return { count: r[0]?.n ?? 0, points: r[0]?.pts ?? 0 };
  }

  async badges(tenantId: string) {
    return this.db().$queryRaw<{ code: string; label: string }[]>`
      select l.code, l.label from "Lookups"."Lookups" l
       where l."lookupType" = 'Badge' and l."isActive" and (l."tenantId" is null or l."tenantId" = ${tenantId}::uuid)
       order by l."sortOrder", l.label`;
  }

  async kudos(tenantId: string, id: string, viewerId: string) {
    const rows = await this.db().$queryRaw<KudosRow[]>`
      select ${KUDOS_COLS} from "EmployeeSelfService"."Kudos" k
       where k."tenantId" = ${tenantId}::uuid and k.id = ${id}::uuid and not k."isHidden"
         and (k."shareOnWall" or k."fromEmployeeId" = ${viewerId}::uuid or k."toEmployeeId" = ${viewerId}::uuid)`;
    return (await this.items(tenantId, rows, viewerId))[0] ?? null;
  }

  async colleagues(tenantId: string, excludeId: string, search: string | undefined): Promise<Colleague[]> {
    const s = search?.trim();
    const emps = await this.db().employees.findMany({
      where: {
        tenantId, deletedAt: null, status: { not: 'EXITED' }, id: { not: excludeId },
        ...(s && { OR: [{ code: { contains: s, mode: 'insensitive' } }, { firstName: { contains: s, mode: 'insensitive' } }, { lastName: { contains: s, mode: 'insensitive' } }, { displayName: { contains: s, mode: 'insensitive' } }] }),
      },
      select: { id: true }, orderBy: [{ firstName: 'asc' }], take: 20,
    });
    const refs = await employeeRefs(this.db(), tenantId, emps.map((e) => e.id));
    return emps.map((e) => refs.get(e.id)!).filter(Boolean);
  }

  async activeEmployee(tenantId: string, id: string) {
    return (await this.db().employees.count({ where: { tenantId, id, deletedAt: null, status: { not: 'EXITED' } } })) > 0;
  }

  saveKudos(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'kudosAddUpdate', data);
  }

  async toggleReaction(tenantId: string, kudosId: string, employeeId: string, reaction: KudosReaction) {
    const r = await this.db().$queryRaw<{ isActive: boolean }[]>`
      insert into "EmployeeSelfService"."KudosReactions" ("tenantId", "kudosId", "employeeId", reaction, "isActive", "reactedAt")
      values (${tenantId}::uuid, ${kudosId}::uuid, ${employeeId}::uuid, ${reaction}, true, now())
      on conflict ("tenantId", "kudosId", "employeeId", reaction)
      do update set "isActive" = not "KudosReactions"."isActive", "reactedAt" = now()
      returning "isActive"`;
    return r[0]!.isActive;
  }

  // ---------------------------------------------------------------- polls & pulse
  async poll(tenantId: string, id: string) {
    const p = await this.db().polls.findFirst({ where: { tenantId, id } });
    if (!p) return null;
    const opts = await this.db().pollOptions.findMany({ where: { tenantId, pollId: id }, select: { id: true } });
    return { id: p.id, status: p.status, opensAt: p.opensAt, closesAt: p.closesAt, showResultsAfterVote: p.showResultsAfterVote, optionIds: opts.map((o) => o.id) };
  }

  async hasVoted(tenantId: string, pollId: string, employeeId: string) {
    const r = await this.db().$queryRaw<{ n: number }[]>`
      select count(*)::int as n from "EmployeeSelfService"."PollVotes" where "tenantId" = ${tenantId}::uuid and "pollId" = ${pollId}::uuid and "employeeId" = ${employeeId}::uuid`;
    return (r[0]?.n ?? 0) > 0;
  }

  async vote(tenantId: string, pollId: string, optionId: string, employeeId: string) {
    await this.db().$executeRaw`
      insert into "EmployeeSelfService"."PollVotes" ("tenantId", "pollId", "optionId", "employeeId", "votedAt")
      values (${tenantId}::uuid, ${pollId}::uuid, ${optionId}::uuid, ${employeeId}::uuid, now())`;
  }

  async results(tenantId: string, pollId: string) {
    const rows = await this.db().$queryRaw<{ optionId: string; votes: number }[]>`
      select o.id::text as "optionId", count(v.id)::int as votes
        from "EmployeeSelfService"."PollOptions" o
        left join "EmployeeSelfService"."PollVotes" v on v."tenantId" = o."tenantId" and v."optionId" = o.id
       where o."tenantId" = ${tenantId}::uuid and o."pollId" = ${pollId}::uuid
       group by o.id, o.seq order by o.seq`;
    return { pollId, total: rows.reduce((n, r) => n + r.votes, 0), options: rows };
  }

  async survey(tenantId: string, id: string) {
    const s = await this.db().pulseSurveys.findFirst({ where: { tenantId, id } });
    if (!s) return null;
    const qs = await this.db().pulseSurveyQuestions.findMany({ where: { tenantId, surveyId: id }, select: { id: true }, orderBy: { seq: 'asc' } });
    return { id: s.id, status: s.status, periodFrom: s.periodFrom.toISOString().slice(0, 10), periodTo: s.periodTo.toISOString().slice(0, 10), questionIds: qs.map((q) => q.id) };
  }

  async hasAnswered(tenantId: string, surveyId: string, respondentHash: string) {
    const r = await this.db().$queryRaw<{ n: number }[]>`
      select count(*)::int as n from "EmployeeSelfService"."PulseSurveyResponses"
       where "tenantId" = ${tenantId}::uuid and "surveyId" = ${surveyId}::uuid and "respondentHash" = ${respondentHash}`;
    return (r[0]?.n ?? 0) > 0;
  }

  async answer(tenantId: string, surveyId: string, respondentHash: string, departmentId: string | null, answers: { questionId: string; score: number }[]) {
    for (const a of answers) {
      await this.db().$executeRaw`
        insert into "EmployeeSelfService"."PulseSurveyResponses" ("tenantId", "surveyId", "questionId", "respondentHash", "departmentId", score, "respondedAt")
        values (${tenantId}::uuid, ${surveyId}::uuid, ${a.questionId}::uuid, ${respondentHash}, ${departmentId}::uuid, ${a.score}::smallint, now())`;
    }
  }

  async myVotes(tenantId: string, employeeId: string) {
    return this.db().$queryRaw<{ pollId: string; optionId: string; showResults: boolean }[]>`
      select v."pollId"::text, v."optionId"::text, p."showResultsAfterVote" as "showResults"
        from "EmployeeSelfService"."PollVotes" v
        join "EmployeeSelfService"."Polls" p on p."tenantId" = v."tenantId" and p.id = v."pollId"
       where v."tenantId" = ${tenantId}::uuid and v."employeeId" = ${employeeId}::uuid and p.status = 'OPEN'`;
  }

  async answeredSurveys(tenantId: string, hashes: Map<string, string>) {
    if (!hashes.size) return [];
    const r = await this.db().$queryRaw<{ h: string }[]>`
      select distinct "respondentHash" as h from "EmployeeSelfService"."PulseSurveyResponses"
       where "tenantId" = ${tenantId}::uuid and "respondentHash" = any(${[...hashes.keys()]}::text[])`;
    return r.map((x) => hashes.get(x.h)!).filter(Boolean);
  }

  async openSurveyIds(tenantId: string) {
    return (await this.db().pulseSurveys.findMany({ where: { tenantId, status: 'OPEN' }, select: { id: true } })).map((s) => s.id);
  }

  // ---------------------------------------------------------------- announcements & presence
  async announcement(tenantId: string, id: string) {
    const a = await this.db().companyAnnouncements.findFirst({ where: { tenantId, id }, select: { id: true, status: true, requiresRsvp: true } });
    return a ?? null;
  }

  async markRead(tenantId: string, announcementId: string, employeeId: string, rsvp: string | null | undefined): Promise<AnnouncementRead> {
    // rsvp undefined keeps an earlier answer; null clears it
    const keep = rsvp === undefined;
    const r = await this.db().$queryRaw<{ announcementId: string; readAt: Date; rsvp: string | null }[]>`
      insert into "EmployeeSelfService"."CompanyAnnouncementReads" ("tenantId", "announcementId", "employeeId", "readAt", rsvp)
      values (${tenantId}::uuid, ${announcementId}::uuid, ${employeeId}::uuid, now(), ${rsvp ?? null})
      on conflict ("tenantId", "announcementId", "employeeId")
      do update set rsvp = case when ${keep} then "CompanyAnnouncementReads".rsvp else excluded.rsvp end
      returning "announcementId"::text, "readAt", rsvp`;
    return { announcementId: r[0]!.announcementId, readAt: r[0]!.readAt.toISOString(), rsvp: r[0]!.rsvp };
  }

  async reads(tenantId: string, employeeId: string) {
    const r = await this.db().$queryRaw<{ announcementId: string; readAt: Date; rsvp: string | null }[]>`
      select "announcementId"::text, "readAt", rsvp from "EmployeeSelfService"."CompanyAnnouncementReads"
       where "tenantId" = ${tenantId}::uuid and "employeeId" = ${employeeId}::uuid`;
    return r.map((x) => ({ announcementId: x.announcementId, readAt: x.readAt.toISOString(), rsvp: x.rsvp }));
  }

  async setPresence(tenantId: string, employeeId: string, input: PresenceInput) {
    await this.db().$executeRaw`
      insert into "EmployeeSelfService"."PresenceStatuses" ("tenantId", "employeeId", status, message, "locationLabel", "untilAt", source)
      values (${tenantId}::uuid, ${employeeId}::uuid, ${input.status}, ${input.message}, ${input.locationLabel}, ${input.untilAt}::timestamptz, 'MANUAL')
      on conflict ("tenantId", "employeeId")
      do update set status = excluded.status, message = excluded.message, "locationLabel" = excluded."locationLabel", "untilAt" = excluded."untilAt", source = 'MANUAL'`;
  }

  async directory(tenantId: string, viewerId: string | null, q: { search?: string; departmentId?: string }): Promise<Directory> {
    const db = this.db();
    const s = q.search?.trim();
    const active = { tenantId, deletedAt: null, status: { not: 'EXITED' } };
    const [emps, all] = await Promise.all([
      db.employees.findMany({
        where: {
          ...active, ...(q.departmentId && { departmentId: q.departmentId }),
          ...(s && { OR: [{ code: { contains: s, mode: 'insensitive' } }, { firstName: { contains: s, mode: 'insensitive' } }, { lastName: { contains: s, mode: 'insensitive' } }, { displayName: { contains: s, mode: 'insensitive' } }] }),
        },
        select: { id: true, mobile: true, workEmail: true, reportingManagerId: true, firstName: true, lastName: true, displayName: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], take: 200,
      }),
      db.employees.groupBy({ by: ['departmentId'], where: active, _count: { _all: true } }),
    ]);
    const [refs, depts, pres] = await Promise.all([
      employeeRefs(db, tenantId, emps.map((e) => e.id)),
      db.departments.findMany({ where: { tenantId, id: { in: ids(all.map((a) => a.departmentId)) } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.$queryRaw<PresenceRow[]>`
        select "employeeId"::text, status, message, "locationLabel", "untilAt", source, "updatedAt" from "EmployeeSelfService"."PresenceStatuses"
         where "tenantId" = ${tenantId}::uuid and ("employeeId" = any(${emps.map((e) => e.id)}::uuid[]) or "employeeId" = ${viewerId}::uuid)`,
    ]);
    const now = new Date();
    const people: DirectoryPerson[] = emps.map((e) => {
      const r = refs.get(e.id) ?? { ...unknownEmp(e.id), name: employeeName(e) };
      return {
        id: e.id, code: r.code, name: r.name, designation: r.designation, department: r.department, branch: r.branch,
        mobile: e.mobile, workEmail: e.workEmail, managerId: e.reportingManagerId, presence: presenceOf(pres.find((p) => p.employeeId === e.id), now), me: e.id === viewerId,
      };
    });
    return {
      people, total: all.reduce((n, a) => n + a._count._all, 0),
      departments: depts.map((d) => ({ ...d, count: all.find((a) => a.departmentId === d.id)?._count._all ?? 0 })),
      mine: viewerId ? presenceOf(pres.find((p) => p.employeeId === viewerId), now) : null,
    };
  }
}
