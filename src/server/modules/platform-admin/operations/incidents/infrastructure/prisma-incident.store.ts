import { Injectable } from '@nestjs/common';
import type { ActiveIncident, Incident, IncidentDeclare, IncidentPostUpdate, StatusComponentDay } from '../../../../../../shared/index.js';
import type { ServiceIncidents, ServiceIncidentUpdates } from '../../../../../generated/prisma/client.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { IncidentStore } from '../application/incident-store.js';
import { durationMinutes } from '../domain/incident-rules.js';
import { iso, isoDate, staffNames } from '../../infrastructure/staff-names.js';

@Injectable()
export class PrismaIncidentStore extends IncidentStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.db().serviceIncidents.findMany({
      where: { OR: [{ startedAt: { gte: since } }, { stage: { not: 'RESOLVED' } }] },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });
    return this.map(rows);
  }

  async get(id: string) {
    const r = await this.prisma.db().serviceIncidents.findUnique({ where: { id } });
    return r ? (await this.map([r]))[0]! : null;
  }

  async declare(input: IncidentDeclare) {
    const rows = await this.prisma.db().$queryRaw<{ id: string }[]>`select "Platform"."serviceIncidentDeclare"(${JSON.stringify(input)}::jsonb)::text as id`;
    return rows[0]!.id;
  }

  async postUpdate(id: string, input: IncidentPostUpdate) {
    await this.prisma.db().$queryRaw`
      select "Platform"."serviceIncidentPostUpdate"(${id}::uuid, ${input.stage}, ${input.message}, ${input.notifySubscribers}, ${input.updateBanner})::text as id`;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'serviceIncidentAddUpdate', data);
  }

  async openPublic(): Promise<ActiveIncident[]> {
    const rows = await this.prisma.db().serviceIncidents.findMany({ where: { isPublic: true, stage: { not: 'RESOLVED' } }, orderBy: { startedAt: 'desc' } });
    return rows.map((r) => ({ id: r.id, docNo: r.docNo, title: r.title, impact: r.impact, stage: r.stage, components: r.components, startedAt: r.startedAt.toISOString() }));
  }

  async componentHistory() {
    const rows = await this.prisma.db().$queryRaw<{ component: string; componentName: string; sortOrder: number; day: Date; worstImpact: string; incidentCount: number; inMaintenance: boolean; uptimePct: string }[]>`
      select component, "componentName", "sortOrder", day, "worstImpact", "incidentCount", "inMaintenance", "uptimePct"::text as "uptimePct"
        from "Platform"."getStatusComponentHistory" order by "sortOrder", day`;
    return rows.map((r) => ({
      component: r.component, name: r.componentName, sortOrder: Number(r.sortOrder), day: isoDate(r.day)!, worstImpact: r.worstImpact as StatusComponentDay['worstImpact'],
      incidentCount: Number(r.incidentCount), inMaintenance: r.inMaintenance, uptimePct: Number(r.uptimePct),
    }));
  }

  async inMaintenance() {
    const now = new Date();
    const rows = await this.prisma.db().maintenanceWindows.findMany({ where: { status: { not: 'CANCELLED' }, startsAt: { lte: now }, endsAt: { gt: now } }, select: { components: true } });
    return new Set(rows.flatMap((r) => r.components));
  }

  private async map(rows: ServiceIncidents[]): Promise<Incident[]> {
    if (!rows.length) return [];
    const updates = await this.prisma.db().serviceIncidentUpdates.findMany({ where: { incidentId: { in: rows.map((r) => r.id) } }, orderBy: [{ postedAt: 'desc' }, { createdAt: 'desc' }] });
    const names = await staffNames(this.prisma, [...rows.map((r) => r.declaredByStaffId), ...updates.map((u) => u.postedByStaffId)]);
    const byInc = new Map<string, ServiceIncidentUpdates[]>();
    for (const u of updates) byInc.set(u.incidentId, [...(byInc.get(u.incidentId) ?? []), u]);
    return rows.map((r) => ({
      id: r.id, docNo: r.docNo, title: r.title, impact: r.impact, components: r.components, stage: r.stage, startedAt: r.startedAt.toISOString(),
      resolvedAt: iso(r.resolvedAt), isPublic: r.isPublic, declaredBy: names.get(r.declaredByStaffId) ?? null, postmortemDueOn: isoDate(r.postmortemDueOn),
      postmortemRef: r.postmortemRef, durationMinutes: durationMinutes(r.startedAt, r.resolvedAt), createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
      updates: (byInc.get(r.id) ?? []).map((u) => ({
        id: u.id, stage: u.stage, message: u.message, postedAt: u.postedAt.toISOString(), postedBy: names.get(u.postedByStaffId) ?? null,
        notifySubscribers: u.notifySubscribers, updateBanner: u.updateBanner,
      })),
    }));
  }
}
