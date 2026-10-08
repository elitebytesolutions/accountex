import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import type { Addon } from '../../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../../core/domain/errors.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../../infrastructure/prisma/references.js';
import { AddonStore } from '../application/addon-store.js';

const include = { AddonPlans: { orderBy: { createdAt: 'asc' } } } as const satisfies Prisma.AddonsInclude;
type Row = Prisma.AddonsGetPayload<{ include: typeof include }>;
const num = (d: Prisma.Decimal | null) => (d === null ? null : d.toNumber());

@Injectable()
export class PrismaAddonStore extends AddonStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list() {
    return this.map(await this.prisma.db().addons.findMany({ where: { deletedAt: null }, include, orderBy: [{ name: 'asc' }] }));
  }

  async get(id: string) {
    const row = await this.prisma.db().addons.findFirst({ where: { id, deletedAt: null }, include });
    return row ? (await this.map([row]))[0]! : null;
  }

  async allCodes() {
    const rows = await this.prisma.db().addons.findMany({ select: { id: true, code: true, deletedAt: true } });
    return rows.map((r) => ({ id: r.id, code: r.code, deleted: r.deletedAt !== null }));
  }

  async moduleExists(id: string) {
    return (await this.prisma.db().platformModules.count({ where: { id, deletedAt: null } })) > 0;
  }

  async planExists(id: string) {
    return (await this.prisma.db().subscriptionPlans.count({ where: { id } })) > 0;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'addonAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'addons', id, ['addonPlans']);
  }

  async softDelete(id: string, rowVersion: number) {
    const { count } = await this.prisma.db().addons.updateMany({ where: { id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this add-on. Reload and try again.');
  }

  private async map(rows: Row[]): Promise<Addon[]> {
    if (!rows.length) return [];
    // TenantAddons belongs to Phase 40 (tenant lifecycle); read here only to show how many tenants run each add-on.
    const counts = await this.prisma.db().$queryRaw<{ addonId: string; n: bigint }[]>`
      select "addonId"::text as "addonId", count(*) as n from "Platform"."TenantAddons"
       where status = 'ACTIVE' and "addonId" = any(${rows.map((r) => r.id)}::uuid[]) group by "addonId"`;
    return rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, icon: r.icon, price: r.price.toNumber(), billingUnit: r.billingUnit,
      usagePrice: num(r.usagePrice), usageUnit: r.usageUnit, note: r.note, platformModuleId: r.platformModuleId, isActive: r.isActive,
      plans: r.AddonPlans.map((p) => ({ id: p.id, planId: p.planId, availability: p.availability })),
      activeTenants: Number(counts.find((c) => c.addonId === r.id)?.n ?? 0),
      rowVersion: r.rowVersion,
    }));
  }
}
