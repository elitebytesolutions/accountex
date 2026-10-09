import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import type { TicketItem, TicketMessage, TicketQuery, TicketStatus } from '../../../../../shared/self-service/helpdesk-ticket.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { employeeName, employeeOfUser, employeeRefs, ids, unknownEmp } from '../../../hr/attendance/infrastructure/hr-refs.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { HelpdeskTicketStore, type TicketRow, type TicketStatusChange } from '../application/helpdesk-ticket-store.js';

type Raw = {
  id: string; docNo: string; employeeId: string; categoryId: string; subject: string; description: string; priority: string; status: string;
  agentEmployeeId: string | null; contactChannel: string; contactValue: string | null; openedAt: Date; slaHours: Prisma.Decimal; dueAt: Date;
  firstResponseAt: Date | null; resolvedAt: Date | null; closedAt: Date | null; slaMet: boolean | null; reopenedCount: number;
  csatRating: number | null; rowVersion: number; messageCount: number;
};
const COLS = Prisma.sql`t.id, t."docNo", t."employeeId", t."categoryId", t.subject, t.description, t.priority, t.status, t."agentEmployeeId",
  t."contactChannel", t."contactValue", t."openedAt", t."slaHours", t."dueAt", t."firstResponseAt", t."resolvedAt", t."closedAt", t."slaMet",
  t."reopenedCount", t."csatRating", t."rowVersion",
  (select count(*)::int from "EmployeeSelfService"."HelpdeskTicketMessages" m where m."tenantId" = t."tenantId" and m."ticketId" = t.id) as "messageCount"`;
const iso = (d: Date | null) => (d ? d.toISOString() : null);

@Injectable()
export class PrismaHelpdeskTicketStore extends HelpdeskTicketStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  private async rows(tenantId: string, raws: Raw[]): Promise<(TicketItem & { description: string; categoryOwnerId: string | null })[]> {
    if (!raws.length) return [];
    const db = this.db();
    const [refs, desks] = await Promise.all([
      employeeRefs(db, tenantId, raws.flatMap((r) => [r.employeeId, r.agentEmployeeId])),
      db.helpdeskCategories.findMany({ where: { tenantId, id: { in: ids(raws.map((r) => r.categoryId)) } }, select: { id: true, code: true, name: true, icon: true, ownerEmployeeId: true } }),
    ]);
    return raws.map((r) => {
      const d = desks.find((x) => x.id === r.categoryId);
      return {
        id: r.id, docNo: r.docNo, subject: r.subject, description: r.description, priority: r.priority, status: r.status as TicketStatus,
        category: d ? { id: d.id, code: d.code, name: d.name, icon: d.icon } : { id: r.categoryId, code: '?', name: '?', icon: null },
        categoryOwnerId: d?.ownerEmployeeId ?? null,
        employee: refs.get(r.employeeId) ?? unknownEmp(r.employeeId), agent: r.agentEmployeeId ? refs.get(r.agentEmployeeId) ?? unknownEmp(r.agentEmployeeId) : null,
        contactChannel: r.contactChannel, contactValue: r.contactValue,
        openedAt: r.openedAt.toISOString(), slaHours: Number(r.slaHours), dueAt: r.dueAt.toISOString(),
        firstResponseAt: iso(r.firstResponseAt), resolvedAt: iso(r.resolvedAt), closedAt: iso(r.closedAt),
        slaMet: r.slaMet, reopenedCount: r.reopenedCount, csatRating: r.csatRating, messageCount: r.messageCount, rowVersion: r.rowVersion,
      };
    });
  }

  async list(tenantId: string, q: TicketQuery & { employeeId?: string; agentOf?: string }) {
    const db = this.db();
    const s = q.search?.trim();
    const conds: Prisma.Sql[] = [Prisma.sql`t."tenantId" = ${tenantId}::uuid`];
    if (q.employeeId) conds.push(Prisma.sql`t."employeeId" = ${q.employeeId}::uuid`);
    if (q.agentOf) {
      conds.push(Prisma.sql`(t."agentEmployeeId" = ${q.agentOf}::uuid or exists (select 1 from "EmployeeSelfService"."HelpdeskCategories" c
        where c."tenantId" = t."tenantId" and c.id = t."categoryId" and c."ownerEmployeeId" = ${q.agentOf}::uuid))`);
    }
    if (s) {
      const like = `%${s}%`;
      conds.push(Prisma.sql`(t."docNo" ilike ${like} or t.subject ilike ${like} or exists (select 1 from "HumanResources"."Employees" e
        where e."tenantId" = t."tenantId" and e.id = t."employeeId" and (e.code ilike ${like} or e."firstName" ilike ${like} or e."lastName" ilike ${like} or e."displayName" ilike ${like})))`);
    }
    const base = Prisma.join(conds, ' and ');
    const where = q.status && q.status !== 'ALL' ? Prisma.sql`${base} and t.status = ${q.status}` : base;
    const [raws, total, counts] = await Promise.all([
      db.$queryRaw<Raw[]>`select ${COLS} from "EmployeeSelfService"."HelpdeskTickets" t where ${where}
        order by case when t.status in ('OPEN','IN_PROGRESS') then 0 else 1 end, t."openedAt" desc
        limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`,
      db.$queryRaw<{ n: number }[]>`select count(*)::int as n from "EmployeeSelfService"."HelpdeskTickets" t where ${where}`,
      db.$queryRaw<{ status: string; n: number }[]>`select t.status, count(*)::int as n from "EmployeeSelfService"."HelpdeskTickets" t where ${base} group by t.status`,
    ]);
    const items: TicketItem[] = (await this.rows(tenantId, raws)).map((r) => { const { description, categoryOwnerId, ...i } = r; void description; void categoryOwnerId; return i; });
    return { items, total: total[0]?.n ?? 0, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) };
  }

  async get(tenantId: string, id: string): Promise<TicketRow | null> {
    const raws = await this.db().$queryRaw<Raw[]>`select ${COLS} from "EmployeeSelfService"."HelpdeskTickets" t where t."tenantId" = ${tenantId}::uuid and t.id = ${id}::uuid`;
    return (await this.rows(tenantId, raws))[0] ?? null;
  }

  async messages(tenantId: string, ticketId: string): Promise<TicketMessage[]> {
    const db = this.db();
    const rows = await db.$queryRaw<{ id: string; authorRole: TicketMessage['authorRole']; authorEmployeeId: string | null; body: string; sentAt: Date }[]>`
      select m.id, m."authorRole", m."authorEmployeeId", m.body, m."sentAt" from "EmployeeSelfService"."HelpdeskTicketMessages" m
       where m."tenantId" = ${tenantId}::uuid and m."ticketId" = ${ticketId}::uuid order by m."sentAt", m."createdAt"`;
    const refs = await employeeRefs(db, tenantId, rows.map((r) => r.authorEmployeeId));
    return rows.map((r) => ({ id: r.id, authorRole: r.authorRole, author: r.authorEmployeeId ? refs.get(r.authorEmployeeId) ?? unknownEmp(r.authorEmployeeId) : null, body: r.body, sentAt: r.sentAt.toISOString() }));
  }

  async desk(tenantId: string, id: string) {
    const d = await this.db().helpdeskCategories.findFirst({ where: { tenantId, id, deletedAt: null } });
    return d ? { id: d.id, name: d.name, status: d.status, slaHours: d.slaHours.toNumber(), highPrioritySlaFactor: d.highPrioritySlaFactor.toNumber(), ownerEmployeeId: d.ownerEmployeeId } : null;
  }

  async ownsDesk(tenantId: string, employeeId: string) {
    return (await this.db().helpdeskCategories.count({ where: { tenantId, ownerEmployeeId: employeeId, deletedAt: null } })) > 0;
  }

  async deskRouting(tenantId: string, employeeId: string | null) {
    const db = this.db();
    const [desks, open] = await Promise.all([
      db.helpdeskCategories.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, highPrioritySlaFactor: true, routingKeywords: true } }),
      employeeId ? db.$queryRaw<{ categoryId: string; n: number }[]>`select t."categoryId", count(*)::int as n from "EmployeeSelfService"."HelpdeskTickets" t
        where t."tenantId" = ${tenantId}::uuid and t."employeeId" = ${employeeId}::uuid and t.status in ('OPEN', 'IN_PROGRESS') group by t."categoryId"` : [],
    ]);
    return desks.map((d) => ({ id: d.id, highPrioritySlaFactor: d.highPrioritySlaFactor.toNumber(), routingKeywords: d.routingKeywords, open: open.find((o) => o.categoryId === d.id)?.n ?? 0 }));
  }

  async agents(tenantId: string) {
    const emps = await this.db().employees.findMany({
      where: { tenantId, deletedAt: null, status: { not: 'EXITED' } },
      select: { id: true, code: true, displayName: true, firstName: true, lastName: true }, orderBy: { code: 'asc' },
    });
    return emps.map((e) => ({ id: e.id, code: e.code, name: employeeName(e) }));
  }

  async activeEmployee(tenantId: string, employeeId: string) {
    return (await this.db().employees.count({ where: { tenantId, id: employeeId, deletedAt: null, status: { not: 'EXITED' } } })) > 0;
  }

  async employeeOfUser(tenantId: string, userId: string) {
    return (await employeeOfUser(this.db(), tenantId, userId))?.id ?? null;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'helpdeskTicketAddUpdate', data);
  }

  async setStatus(tenantId: string, id: string, rowVersion: number | null, d: TicketStatusChange) {
    const sets: Prisma.Sql[] = [Prisma.sql`status = ${d.status}`];
    if (d.firstResponseAt !== undefined) sets.push(Prisma.sql`"firstResponseAt" = ${d.firstResponseAt}::timestamptz`);
    if (d.resolvedAt !== undefined) sets.push(Prisma.sql`"resolvedAt" = ${d.resolvedAt}::timestamptz`);
    if (d.slaMet !== undefined) sets.push(Prisma.sql`"slaMet" = ${d.slaMet}::boolean`);
    if (d.closedAt !== undefined) sets.push(Prisma.sql`"closedAt" = ${d.closedAt}::timestamptz`);
    if (d.reopenedCount !== undefined) sets.push(Prisma.sql`"reopenedCount" = ${d.reopenedCount}::smallint`);
    if (d.csatRating !== undefined) sets.push(Prisma.sql`"csatRating" = ${d.csatRating}::smallint`);
    if (d.csatAt !== undefined) sets.push(Prisma.sql`"csatAt" = ${d.csatAt}::timestamptz`);
    const n = await this.db().$executeRaw`update "EmployeeSelfService"."HelpdeskTickets" set ${Prisma.join(sets, ', ')}
      where "tenantId" = ${tenantId}::uuid and id = ${id}::uuid and (${rowVersion}::int is null or "rowVersion" = ${rowVersion}::int)`;
    if (!n) throw new ConcurrencyError('Someone else changed this ticket. Reload and try again.');
  }

  async addMessage(tenantId: string, ticketId: string, authorRole: 'REQUESTER' | 'AGENT', authorEmployeeId: string, body: string) {
    await this.db().$executeRaw`insert into "EmployeeSelfService"."HelpdeskTicketMessages" ("tenantId", "ticketId", "authorRole", "authorEmployeeId", body, "sentAt")
      values (${tenantId}::uuid, ${ticketId}::uuid, ${authorRole}, ${authorEmployeeId}::uuid, ${body}, clock_timestamp())`;
  }
}
