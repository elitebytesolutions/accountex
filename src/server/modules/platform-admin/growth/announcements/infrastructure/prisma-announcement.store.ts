import { Injectable } from '@nestjs/common';
import type { PlatformAnnouncement, PlatformAnnouncementList, PlatformMessage, PlatformNotice } from '../../../../../../shared/index.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { AnnouncementStore, type AnnouncementRecipient } from '../application/announcement-store.js';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const LIVE_SUB = `('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED')`;

/** Does announcement `a` reach the company whose id is the SQL expression `tenant`? (audience ALL / PLANS / MODULES / TENANTS) */
const matches = (tenant: string) => `(a.audience = 'ALL'
  or (a.audience = 'TENANTS' and exists (select 1 from "Platform"."AnnouncementTargets" x where x."announcementId" = a.id and x."tenantId" = ${tenant}))
  or (a.audience = 'PLANS' and exists (select 1 from "Platform"."AnnouncementTargets" x
        join "Platform"."Subscriptions" s on s."planId" = x."planId" and s."tenantId" = ${tenant} and s.status in ${LIVE_SUB}
       where x."announcementId" = a.id))
  or (a.audience = 'MODULES' and exists (select 1 from "Platform"."AnnouncementTargets" x
        join "Platform"."TenantModules" m on m."moduleKey" = x."moduleKey" and m."tenantId" = ${tenant} and m.enabled
       where x."announcementId" = a.id)))`;

type Row = {
  id: string; announcementType: string; severity: string; releaseLabel: string | null; title: string; message: string; audience: string;
  publishAt: Date | null; status: string; showBanner: boolean; emailAdmins: boolean; viewCount: bigint; clickCount: bigint; dismissCount: number;
  maintenanceWindowId: string | null; maintenanceWindowTitle: string | null; createdBy: string | null; updatedBy: string | null;
  createdAt: Date; updatedAt: Date; rowVersion: number;
  targets: { planId: string | null; moduleKey: string | null; tenantId: string | null; label: string }[] | null;
};

const SELECT = `
  select a.id::text, a."announcementType", a.severity, a."releaseLabel", a.title, a.message, a.audience, a."publishAt", a.status, a."showBanner",
         a."emailAdmins", a."viewCount", a."clickCount", a."maintenanceWindowId"::text as "maintenanceWindowId", w.title as "maintenanceWindowTitle",
         (select count(*) from "Platform"."AnnouncementReceipts" r where r."announcementId" = a.id and r."dismissedAt" is not null)::int as "dismissCount",
         cb."fullName" as "createdBy", ub."fullName" as "updatedBy", a."createdAt", a."updatedAt", a."rowVersion",
         (select json_agg(json_build_object('planId', x."planId", 'moduleKey', x."moduleKey", 'tenantId', x."tenantId",
                 'label', coalesce(p.name, tn."displayName", x."moduleKey")) order by coalesce(p.name, tn."displayName", x."moduleKey"))
            from "Platform"."AnnouncementTargets" x
            left join "Platform"."SubscriptionPlans" p on p.id = x."planId"
            left join "Platform"."Tenants" tn on tn.id = x."tenantId"
           where x."announcementId" = a.id) as targets
    from "Platform"."Announcements" a
    left join "Platform"."MaintenanceWindows" w on w.id = a."maintenanceWindowId"
    left join "Platform"."PlatformStaff" cb on cb.id = a."createdBy"
    left join "Platform"."PlatformStaff" ub on ub.id = a."updatedBy"
   where true`;

const toAnnouncement = (r: Row): PlatformAnnouncement => ({
  ...r, publishAt: iso(r.publishAt), viewCount: Number(r.viewCount), clickCount: Number(r.clickCount), targets: r.targets ?? [],
  createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
});

@Injectable()
export class PrismaAnnouncementStore extends AnnouncementStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(q: { status?: string; type?: string }): Promise<PlatformAnnouncementList> {
    const args: unknown[] = [];
    let where = '';
    if (q.status) { args.push(q.status); where += ` and a.status = $${args.length}`; }
    if (q.type) { args.push(q.type); where += ` and a."announcementType" = $${args.length}`; }
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(
      `${SELECT}${where} order by case a.status when 'DRAFT' then 0 when 'SCHEDULED' then 1 when 'PUBLISHED' then 2 else 3 end, coalesce(a."publishAt", a."updatedAt") desc`,
      ...args,
    );
    const all = await this.prisma.db().$queryRaw<{ status: string; n: number }[]>`select status, count(*)::int as n from "Platform"."Announcements" group by status`;
    const c = (s: string) => all.find((x) => x.status === s)?.n ?? 0;
    return {
      items: rows.map(toAnnouncement),
      counts: { all: all.reduce((a, x) => a + x.n, 0), PUBLISHED: c('PUBLISHED'), SCHEDULED: c('SCHEDULED'), DRAFT: c('DRAFT'), ARCHIVED: c('ARCHIVED') },
    };
  }

  async get(id: string): Promise<PlatformAnnouncement | null> {
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(`${SELECT} and a.id = $1::uuid`, id);
    return rows[0] ? toAnnouncement(rows[0]) : null;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'announcementAddUpdate', data);
  }

  async remove(id: string) {
    const db = this.prisma.db();
    await db.announcementTargets.deleteMany({ where: { announcementId: id } });
    await db.announcements.delete({ where: { id } });
  }

  async promoteDue(): Promise<string[]> {
    const due = await this.prisma.db().$queryRaw<{ id: string }[]>`
      select id::text from "Platform"."Announcements" where status = 'SCHEDULED' and "publishAt" <= now() order by "publishAt"`;
    for (const d of due) await addUpdate(this.prisma, 'announcementAddUpdate', { id: d.id, status: 'PUBLISHED' });
    return due.map((d) => d.id);
  }

  async recipients(id: string): Promise<AnnouncementRecipient[]> {
    return this.prisma.db().$queryRawUnsafe<AnnouncementRecipient[]>(`
      select tn.id::text as "tenantId", tn."displayName" as "tenantName", tn."defaultLanguage" as language,
             coalesce((select c.email::text from "Platform"."TenantContacts" c where c."tenantId" = tn.id and c."contactRole" = 'OWNER'
                        order by c."isPrimary" desc, c."createdAt" limit 1), tn.email::text) as email
        from "Platform"."Announcements" a cross join "Platform"."Tenants" tn
       where a.id = $1::uuid and tn.status not in ('CHURNED', 'PROVISIONING') and ${matches('tn.id')}
       order by tn."displayName"`, id);
  }

  async maintenanceWindowExists(id: string) {
    return (await this.prisma.db().$queryRaw<{ ok: boolean }[]>`select exists(select 1 from "Platform"."MaintenanceWindows" where id = ${id}::uuid) as ok`)[0]!.ok;
  }

  async feed(tenantId: string, userId: string): Promise<PlatformNotice[]> {
    const rows = await this.prisma.db().$queryRawUnsafe<{
      id: string; announcementType: string; severity: string; releaseLabel: string | null; title: string; message: string; publishAt: Date;
      showBanner: boolean; dismissed: boolean; wTitle: string | null; startsAt: Date | null; endsAt: Date | null;
    }[]>(`
      select a.id::text, a."announcementType", a.severity, a."releaseLabel", a.title, a.message, a."publishAt", a."showBanner",
             (r."dismissedAt" is not null) as dismissed, w.title as "wTitle", w."startsAt", w."endsAt"
        from "Platform"."Announcements" a
        left join "Platform"."AnnouncementReceipts" r on r."announcementId" = a.id and r."userId" = $2::uuid
        left join "Platform"."MaintenanceWindows" w on w.id = a."maintenanceWindowId"
       where a.status = 'PUBLISHED' and a."publishAt" <= now() and a."publishAt" > now() - interval '90 days' and ${matches('$1::uuid')}
       order by a."publishAt" desc limit 20`, tenantId, userId);
    return rows.map((r) => ({
      id: r.id, announcementType: r.announcementType, severity: r.severity, releaseLabel: r.releaseLabel, title: r.title, message: r.message,
      publishAt: r.publishAt.toISOString(), showBanner: r.showBanner, dismissed: r.dismissed,
      maintenance: r.wTitle && r.startsAt && r.endsAt ? { title: r.wTitle, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString() } : null,
    }));
  }

  async mark(announcementId: string, tenantId: string, userId: string, what: 'view' | 'click' | 'dismiss') {
    const db = this.prisma.db();
    const existing = await db.announcementReceipts.findUnique({ where: { announcementId_userId: { announcementId, userId } } });
    const now = new Date();
    if (!existing) {
      await db.announcementReceipts.create({
        data: { announcementId, tenantId, userId, viewedAt: now, clickedAt: what === 'click' ? now : null, dismissedAt: what === 'dismiss' ? now : null },
      });
    } else if ((what === 'click' && !existing.clickedAt) || (what === 'dismiss' && !existing.dismissedAt)) {
      await db.announcementReceipts.update({ where: { id: existing.id }, data: what === 'click' ? { clickedAt: now } : { dismissedAt: now } });
    } else {
      return;
    }
    // counters grow once per user (the receipt row above is the per-user record)
    const views = existing ? 0 : 1;
    const clicks = what === 'click' && !existing?.clickedAt ? 1 : 0;
    if (views || clicks) {
      await db.$executeRaw`update "Platform"."Announcements" set "viewCount" = "viewCount" + ${views}, "clickCount" = "clickCount" + ${clicks} where id = ${announcementId}::uuid`;
    }
  }

  async messages(tenantId: string, userId: string): Promise<PlatformMessage[]> {
    const rows = await this.prisma.db().$queryRaw<{ id: string; title: string; body: string | null; severity: string; createdAt: Date; readAt: Date | null }[]>`
      select id::text, title, body, severity, "createdAt", "readAt" from "Company"."Notifications"
       where "tenantId" = ${tenantId}::uuid and "userId" = ${userId}::uuid and "eventCode" = 'PLATFORM_BROADCAST' and "archivedAt" is null
       order by "createdAt" desc limit 20`;
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), readAt: iso(r.readAt) }));
  }

  async readMessages(tenantId: string, userId: string) {
    return this.prisma.db().$executeRaw`
      update "Company"."Notifications" set "readAt" = now()
       where "tenantId" = ${tenantId}::uuid and "userId" = ${userId}::uuid and "eventCode" = 'PLATFORM_BROADCAST' and "readAt" is null`;
  }
}
