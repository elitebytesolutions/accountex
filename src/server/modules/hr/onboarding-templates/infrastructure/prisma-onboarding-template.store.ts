import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { ListResult, OnboardingTemplate, TalentListQuery } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { OnboardingTemplateStore } from '../application/onboarding-template-store.js';

type Row = Prisma.OnboardingTemplatesGetPayload<object>;

@Injectable()
export class PrismaOnboardingTemplateStore extends OnboardingTemplateStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(tenantId: string, q: TalentListQuery): Promise<ListResult<OnboardingTemplate>> {
    const s = q.search?.trim();
    const where: Prisma.OnboardingTemplatesWhereInput = {
      tenantId, deletedAt: null,
      ...(q.status === 'ACTIVE' && { isActive: true }), ...(q.status === 'INACTIVE' && { isActive: false }),
      ...(s && { name: { contains: s, mode: 'insensitive' } }),
    };
    const db = this.prisma.db();
    const [rows, total] = await Promise.all([
      db.onboardingTemplates.findMany({ where, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.onboardingTemplates.count({ where }),
    ]);
    return { items: await this.map(tenantId, rows), total };
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().onboardingTemplates.findFirst({ where: { tenantId, id, deletedAt: null } });
    return row ? (await this.map(tenantId, [row]))[0]! : null;
  }

  async allNames(tenantId: string) {
    const rows = await this.prisma.db().onboardingTemplates.findMany({ where: { tenantId }, select: { id: true, name: true, deletedAt: true } });
    return rows.map((r) => ({ id: r.id, name: r.name, deleted: r.deletedAt !== null }));
  }

  defaults(tenantId: string, track: string) {
    return this.prisma.db().onboardingTemplates.findMany({ where: { tenantId, track, isDefault: true, deletedAt: null }, select: { id: true } });
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'onboardingTemplateAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'onboardingTemplates', id, ['onboardingTemplateTasks']);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().onboardingTemplates.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), isActive: false, isDefault: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this template. Reload and try again.');
  }

  private async map(tenantId: string, rows: Row[]): Promise<OnboardingTemplate[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const db = this.prisma.db();
    const [tasks, started] = await Promise.all([
      db.onboardingTemplateTasks.findMany({ where: { tenantId, templateId: { in: ids } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      // Onboardings (Phase 31) have no model yet: count them straight from the table.
      db.$queryRaw<{ templateId: string; n: number }[]>`
        select "templateId"::text as "templateId", count(*)::int as n from "HumanResources"."Onboardings"
         where "tenantId" = ${tenantId}::uuid and "templateId" = any(${ids}::uuid[]) group by "templateId"`,
    ]);
    return rows.map((r) => ({
      id: r.id, name: r.name, track: r.track, isDefault: r.isDefault, isActive: r.isActive,
      tasks: tasks.filter((t) => t.templateId === r.id).map((t) => ({
        id: t.id, taskGroup: t.taskGroup, title: t.title, description: t.description, ownerFunction: t.ownerFunction,
        dueOffsetDays: t.dueOffsetDays, actionKind: t.actionKind, sortOrder: t.sortOrder,
      })),
      onboardings: started.find((s) => s.templateId === r.id)?.n ?? 0,
      rowVersion: r.rowVersion,
    }));
  }
}
