import { Injectable } from '@nestjs/common';
import type { CoaTemplate, CoaTemplateDetail } from '../../../../../../shared/index.js';
import type { ChartOfAccountsTemplates } from '../../../../../generated/prisma/client.js';
import { ConcurrencyError } from '../../../../../core/domain/errors.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../../infrastructure/prisma/references.js';
import { CoaTemplateStore } from '../application/coa-template-store.js';

const ORDER = { DEFAULT: 0, PUBLISHED: 1, DRAFT: 2, RETIRED: 3 } as Record<string, number>;

@Injectable()
export class PrismaCoaTemplateStore extends CoaTemplateStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<CoaTemplate[]> {
    const rows = await this.prisma.db().chartOfAccountsTemplates.findMany({ orderBy: { name: 'asc' } });
    const out = await this.map(rows);
    return out.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<CoaTemplateDetail | null> {
    const db = this.prisma.db();
    const row = await db.chartOfAccountsTemplates.findUnique({ where: { id } });
    if (!row) return null;
    const accounts = await db.chartOfAccountsTemplateAccounts.findMany({ where: { templateId: id }, orderBy: { code: 'asc' } });
    return {
      ...(await this.map([row]))[0]!,
      accounts: accounts.map((a) => ({
        id: a.id, code: a.code, name: a.name, parentCode: a.parentCode, level: a.level, accountClass: a.accountClass,
        nature: a.nature.trim(), subType: a.subType, isPostable: a.isPostable, defaultRole: a.defaultRole,
      })),
    };
  }

  async allCodes() {
    return this.prisma.db().chartOfAccountsTemplates.findMany({ select: { id: true, code: true } });
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'chartOfAccountsTemplateAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'chartOfAccountsTemplates', id, ['chartOfAccountsTemplateAccounts']);
  }

  async remove(id: string, rowVersion: number) {
    const db = this.prisma.db();
    await db.chartOfAccountsTemplateAccounts.deleteMany({ where: { templateId: id } });
    const { count } = await db.chartOfAccountsTemplates.deleteMany({ where: { id, rowVersion } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this template. Reload and try again.');
  }

  private async map(rows: ChartOfAccountsTemplates[]): Promise<CoaTemplate[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [counts, tenants] = await Promise.all([
      this.prisma.db().$queryRaw<{ templateId: string; total: bigint; postable: bigint }[]>`
        select "templateId"::text as "templateId", count(*) as total, count(*) filter (where "isPostable") as postable
          from "Platform"."ChartOfAccountsTemplateAccounts" where "templateId" = any(${ids}::uuid[]) group by "templateId"`,
      this.prisma.db().$queryRaw<{ templateId: string; n: bigint }[]>`
        select "coaTemplateId"::text as "templateId", count(*) as n from "Platform"."Tenants"
         where "coaTemplateId" = any(${ids}::uuid[]) group by "coaTemplateId"`,
    ]);
    return rows.map((r) => {
      const c = counts.find((x) => x.templateId === r.id);
      return {
        id: r.id, code: r.code, name: r.name, industry: r.industry, version: r.version, status: r.status, description: r.description, icon: r.icon,
        accountCount: Number(c?.total ?? 0), postableCount: Number(c?.postable ?? 0),
        tenantCount: Number(tenants.find((x) => x.templateId === r.id)?.n ?? 0),
        updatedAt: r.updatedAt.toISOString(), rowVersion: r.rowVersion,
      };
    });
  }
}
