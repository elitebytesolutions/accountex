import { Injectable } from '@nestjs/common';
import type { Ticket, TicketDetail, TicketKpis, TicketListQuery, TicketMessage } from '../../../../../../shared/index.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { TicketStore } from '../application/ticket-store.js';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

type Row = {
  id: string; docNo: string; tenantId: string; tenantCode: string; tenantName: string; planName: string | null; subject: string; category: string;
  priority: string; status: string; channel: string; requesterUserId: string | null; requesterName: string; requesterRole: string | null;
  requesterEmail: string | null; assigneeStaffId: string | null; assigneeName: string | null; openedAt: Date; firstResponseAt: Date | null;
  slaDueAt: Date | null; resolvedAt: Date | null; closedAt: Date | null; csatRating: number | null; csatComment: string | null;
  messageCount: number; lastMessageAt: Date | null; updatedAt: Date; rowVersion: number;
};

/** Ticket rows with company, live plan, assignee and message facts; `$internal` = count internal notes too. */
const select = (internal: boolean) => `
  select t.id::text, t."docNo", t."tenantId"::text as "tenantId", tn.code::text as "tenantCode", tn."displayName" as "tenantName",
         (select p.name from "Platform"."Subscriptions" s join "Platform"."SubscriptionPlans" p on p.id = s."planId"
           where s."tenantId" = t."tenantId" and s.status in ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED') order by s."startsOn" desc limit 1) as "planName",
         t.subject, t.category, t.priority, t.status, t.channel, t."requesterUserId"::text as "requesterUserId", t."requesterName", t."requesterRole",
         t."requesterEmail"::text as "requesterEmail", t."assigneeStaffId"::text as "assigneeStaffId", st."fullName" as "assigneeName",
         t."openedAt", t."firstResponseAt", t."slaDueAt", t."resolvedAt", t."closedAt", t."csatRating", t."csatComment",
         m.n::int as "messageCount", m.last as "lastMessageAt", t."updatedAt", t."rowVersion"
    from "Platform"."SupportTickets" t
    join "Platform"."Tenants" tn on tn.id = t."tenantId"
    left join "Platform"."PlatformStaff" st on st.id = t."assigneeStaffId"
    left join lateral (select count(*) as n, max(x."postedAt") as last from "Platform"."SupportTicketMessages" x
                        where x."ticketId" = t.id ${internal ? '' : 'and not x."isInternalNote"'}) m on true
   where true`;

const toTicket = (r: Row): Ticket => ({
  ...r, openedAt: r.openedAt.toISOString(), firstResponseAt: iso(r.firstResponseAt), slaDueAt: iso(r.slaDueAt), resolvedAt: iso(r.resolvedAt),
  closedAt: iso(r.closedAt), lastMessageAt: iso(r.lastMessageAt), updatedAt: r.updatedAt.toISOString(),
});

@Injectable()
export class PrismaTicketStore extends TicketStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(q: TicketListQuery): Promise<Ticket[]> {
    const args: unknown[] = [];
    const arg = (v: unknown) => { args.push(v); return `$${args.length}`; };
    let where = '';
    if (q.search) {
      const s = arg(`%${q.search}%`);
      where += ` and (t.subject ilike ${s} or t."docNo" ilike ${s} or tn."displayName" ilike ${s} or t."requesterName" ilike ${s})`;
    }
    if (q.assigneeStaffId) where += ` and t."assigneeStaffId" = ${arg(q.assigneeStaffId)}::uuid`;
    if (q.category) where += ` and t.category = ${arg(q.category)}`;
    if (q.priority) where += ` and t.priority = ${arg(q.priority)}`;
    if (q.tenantId) where += ` and t."tenantId" = ${arg(q.tenantId)}::uuid`;
    // open tickets first by SLA; resolved / closed ones (most recent first, last 200)
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(
      `${select(true)}${where} order by (t.status in ('RESOLVED', 'CLOSED')), case when t.status in ('RESOLVED', 'CLOSED') then null else t."slaDueAt" end, t."openedAt" desc limit 500`,
      ...args,
    );
    return rows.map(toTicket);
  }

  async listForTenant(tenantId: string, requesterUserId: string | null): Promise<Ticket[]> {
    const rows = requesterUserId
      ? await this.prisma.db().$queryRawUnsafe<Row[]>(`${select(false)} and t."tenantId" = $1::uuid and t."requesterUserId" = $2::uuid order by t."openedAt" desc`, tenantId, requesterUserId)
      : await this.prisma.db().$queryRawUnsafe<Row[]>(`${select(false)} and t."tenantId" = $1::uuid order by t."openedAt" desc`, tenantId);
    return rows.map(toTicket);
  }

  async get(id: string): Promise<Ticket | null> {
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(`${select(true)} and t.id = $1::uuid`, id);
    return rows[0] ? toTicket(rows[0]) : null;
  }

  async messages(ticketId: string, includeInternal: boolean): Promise<TicketMessage[]> {
    const rows = await this.prisma.db().supportTicketMessages.findMany({
      where: { ticketId, ...(includeInternal ? {} : { isInternalNote: false }) },
      orderBy: [{ postedAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, authorKind: true, authorName: true, body: true, isInternalNote: true, postedAt: true, authorUserId: true },
    });
    return rows.map((m) => ({ id: m.id, authorKind: m.authorKind, authorName: m.authorName, body: m.body, isInternalNote: m.isInternalNote, postedAt: m.postedAt.toISOString() }));
  }

  async supportSessions(ticketId: string): Promise<TicketDetail['supportSessions']> {
    const rows = await this.prisma.db().$queryRaw<{ id: string; staff: string | null; targetUserLabel: string; startedAt: Date; endedAt: Date | null; isReadOnly: boolean }[]>`
      select i.id::text, st."fullName" as staff, i."targetUserLabel", i."startedAt", i."endedAt", i."isReadOnly"
        from "Platform"."ImpersonationSessions" i left join "Platform"."PlatformStaff" st on st.id = i."staffUserId"
       where i."supportTicketId" = ${ticketId}::uuid order by i."startedAt" desc`;
    return rows.map((r) => ({ ...r, startedAt: r.startedAt.toISOString(), endedAt: iso(r.endedAt) }));
  }

  async kpis(): Promise<TicketKpis> {
    const rows = await this.prisma.db().$queryRaw<{ openTickets: number; unassignedOpen: number; breachingNow: number; slaBreaches30d: number; avgFirstResponseMin: string | null; medianFirstResponseMin: string | null; csatAvg30d: string | null; csatCount30d: number }[]>`
      select "openTickets", "unassignedOpen", "breachingNow", "slaBreaches30d", "avgFirstResponseMin"::text, "medianFirstResponseMin"::text,
             "csatAvg30d"::text, "csatCount30d" from "Platform"."getSupportTicketKpis"`;
    const k = rows[0]!;
    const n = (v: string | null) => (v === null ? null : Number(v));
    return { ...k, avgFirstResponseMin: n(k.avgFirstResponseMin), medianFirstResponseMin: n(k.medianFirstResponseMin), csatAvg30d: n(k.csatAvg30d) };
  }

  async staff() {
    return this.prisma.db().$queryRaw<{ id: string; name: string }[]>`
      select id::text, "fullName" as name from "Platform"."PlatformStaff" where status = 'ACTIVE' and "removedAt" is null order by "fullName"`;
  }

  async tenantExists(id: string) {
    return (await this.prisma.db().tenants.count({ where: { id } })) > 0;
  }

  async staffExists(id: string) {
    const rows = await this.prisma.db().$queryRaw<{ ok: boolean }[]>`select exists(select 1 from "Platform"."PlatformStaff" where id = ${id}::uuid and status = 'ACTIVE') as ok`;
    return !!rows[0]?.ok;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'supportTicketAddUpdate', data);
  }

  reply(data: Parameters<TicketStore['reply']>[0]) {
    return addUpdate(this.prisma, 'supportTicketReply', data);
  }

  async linkSupportSession(sessionId: string, ticketId: string) {
    await this.prisma.db().impersonationSessions.update({ where: { id: sessionId }, data: { supportTicketId: ticketId } });
  }
}
