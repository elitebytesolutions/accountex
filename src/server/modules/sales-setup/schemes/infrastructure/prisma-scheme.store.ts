import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { ListResult, Scheme, SchemeListQuery, SchemeSummary } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { SchemeStore } from '../application/scheme-store.js';

const SORTABLE = new Set(['code', 'name', 'validFrom', 'validTo', 'createdAt']);
const day = (d: Date) => d.toISOString().slice(0, 10);
const n = (d: { toNumber(): number } | null) => (d ? d.toNumber() : null);
type Row = Prisma.SalesSchemesGetPayload<object>;

/** Where-clauses for live / scheduled / ended / off on a date (same rule as schemeState). */
function stateWhere(state: string | undefined, today: Date): Prisma.SalesSchemesWhereInput {
  switch (state) {
    case 'LIVE': return { isActive: true, validFrom: { lte: today }, validTo: { gte: today } };
    case 'SCHEDULED': return { isActive: true, validFrom: { gt: today } };
    case 'ENDED': return { validTo: { lt: today } };
    case 'OFF': return { isActive: false, validTo: { gte: today } };
    default: return {};
  }
}

@Injectable()
export class PrismaSchemeStore extends SchemeStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(tenantId: string, q: SchemeListQuery, today: string): Promise<ListResult<Scheme>> {
    const s = q.search?.trim();
    const where: Prisma.SalesSchemesWhereInput = {
      tenantId, deletedAt: null, ...stateWhere(q.state, new Date(`${today}T00:00:00Z`)),
      ...(q.type && { schemeType: q.type }),
      ...(s && { OR: [{ code: { contains: s, mode: 'insensitive' } }, { name: { contains: s, mode: 'insensitive' } }] }),
    };
    const field = q.sort?.replace(/^-/, '');
    const orderBy: Prisma.SalesSchemesOrderByWithRelationInput[] = field && SORTABLE.has(field) ? [{ [field]: q.sort!.startsWith('-') ? 'desc' : 'asc' }] : [{ validTo: 'desc' }, { code: 'desc' }];
    const db = this.prisma.db();
    const [rows, total] = await Promise.all([db.salesSchemes.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }), db.salesSchemes.count({ where })]);
    return { items: await this.map(tenantId, rows), total };
  }

  async summary(tenantId: string, today: string): Promise<SchemeSummary> {
    const db = this.prisma.db();
    const t = new Date(`${today}T00:00:00Z`);
    const count = (state: string) => db.salesSchemes.count({ where: { tenantId, deletedAt: null, ...stateWhere(state, t) } });
    const [live, scheduled, ended, off, given] = await Promise.all([
      count('LIVE'), count('SCHEDULED'), count('ENDED'), count('OFF'),
      db.salesSchemes.aggregate({ where: { tenantId, deletedAt: null }, _sum: { valueGiven: true } }),
    ]);
    return { live, scheduled, ended, off, valueGiven: given._sum.valueGiven?.toNumber() ?? 0 };
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().salesSchemes.findFirst({ where: { tenantId, id, deletedAt: null } });
    return row ? (await this.map(tenantId, [row]))[0]! : null;
  }

  async allCodes(tenantId: string) {
    return (await this.prisma.db().salesSchemes.findMany({ where: { tenantId }, select: { code: true } })).map((r) => r.code);
  }

  async productsExist(tenantId: string, ids: string[]) {
    const u = [...new Set(ids)];
    return !u.length || (await this.prisma.db().products.count({ where: { tenantId, id: { in: u }, deletedAt: null } })) === u.length;
  }

  async groupsExist(tenantId: string, ids: string[]) {
    const u = [...new Set(ids)];
    return !u.length || (await this.prisma.db().customerGroups.count({ where: { tenantId, id: { in: u }, deletedAt: null } })) === u.length;
  }

  async customersExist(tenantId: string, ids: string[]) {
    const u = [...new Set(ids)];
    return !u.length || (await this.prisma.db().customers.count({ where: { tenantId, id: { in: u }, deletedAt: null } })) === u.length;
  }

  async tierCodes() {
    const rows = await this.prisma.db().$queryRaw<{ code: string }[]>`select code from "Lookups"."Lookups" where "lookupType" = 'PriceTier' and "tenantId" is null and "isActive"`;
    return rows.map((r) => r.code);
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'salesSchemeAddUpdate', data);
  }

  async inUse(id: string) {
    const used = await this.prisma.db().salesSchemes.findFirst({ where: { id }, select: { usedCount: true } });
    return (used?.usedCount ?? 0) > 0 || isReferenced(this.prisma, 'schemes', id, ['schemeItems', 'schemeEligibilities']);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().salesSchemes.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this scheme. Reload and try again.');
    // Its products and audience go with it, so they stop counting as uses of products, groups and customers (history keeps them).
    await this.prisma.db().salesSchemeItems.deleteMany({ where: { tenantId, schemeId: id } });
    await this.prisma.db().salesSchemeEligibilities.deleteMany({ where: { tenantId, schemeId: id } });
  }

  private async map(tenantId: string, rows: Row[]): Promise<Scheme[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const ids = rows.map((r) => r.id);
    const [items, elig] = await Promise.all([
      db.salesSchemeItems.findMany({ where: { tenantId, schemeId: { in: ids } }, orderBy: { createdAt: 'asc' } }),
      db.salesSchemeEligibilities.findMany({ where: { tenantId, schemeId: { in: ids } }, orderBy: { createdAt: 'asc' } }),
    ]);
    const some = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const [products, groups, customers, tiers] = await Promise.all([
      db.products.findMany({ where: { tenantId, id: { in: some(items.map((i) => i.itemId)) } }, select: { id: true, sku: true, name: true } }),
      db.customerGroups.findMany({ where: { tenantId, id: { in: some(elig.map((e) => e.customerGroupId)) } }, select: { id: true, name: true } }),
      db.customers.findMany({ where: { tenantId, id: { in: some(elig.map((e) => e.customerId)) } }, select: { id: true, name: true } }),
      db.priceTiers.findMany({ where: { tenantId }, select: { code: true, name: true } }),
    ]);
    return rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, description: r.description, schemeType: r.schemeType, validFrom: day(r.validFrom), validTo: day(r.validTo), isActive: r.isActive,
      buyQty: n(r.buyQty), freeQty: n(r.freeQty), discountPct: n(r.discountPct), discountAmount: n(r.discountAmount), minInvoiceAmount: n(r.minInvoiceAmount),
      minLineQty: n(r.minLineQty), bundlePrice: n(r.bundlePrice), settlementDays: r.settlementDays, appliesToAll: r.appliesToAll, budgetCap: n(r.budgetCap),
      maxUsesPerCustomer: r.maxUsesPerCustomer, usedCount: r.usedCount, valueGiven: r.valueGiven.toNumber(),
      items: items.filter((i) => i.schemeId === r.id).map((i) => ({
        id: i.id, product: products.find((p) => p.id === i.itemId) ?? { id: i.itemId, sku: '?', name: '?' }, itemRole: i.itemRole, qty: n(i.qty),
      })),
      eligibility: elig.filter((e) => e.schemeId === r.id).map((e) => {
        const [kind, refId, label] = e.customerGroupId ? ['GROUP' as const, e.customerGroupId, groups.find((g) => g.id === e.customerGroupId)?.name]
          : e.customerId ? ['CUSTOMER' as const, e.customerId, customers.find((c) => c.id === e.customerId)?.name]
            : ['TIER' as const, e.priceTier!, tiers.find((t) => t.code === e.priceTier)?.name ?? e.priceTier];
        return { id: e.id, kind, refId, label: label ?? '?', isExcluded: e.isExcluded };
      }),
      rowVersion: r.rowVersion,
    }));
  }
}
