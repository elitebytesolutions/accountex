import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { CompanyPolicy, ListResult, TalentListQuery } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { PolicyStore } from '../application/policy-store.js';

type Row = Prisma.CompanyPoliciesGetPayload<object>;

@Injectable()
export class PrismaPolicyStore extends PolicyStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(tenantId: string, q: TalentListQuery): Promise<ListResult<CompanyPolicy>> {
    const s = q.search?.trim();
    const where: Prisma.CompanyPoliciesWhereInput = {
      tenantId, deletedAt: null, ...(q.status && { status: q.status }),
      ...(s && { OR: [{ code: { contains: s, mode: 'insensitive' } }, { title: { contains: s, mode: 'insensitive' } }] }),
    };
    const db = this.prisma.db();
    const [rows, total] = await Promise.all([
      db.companyPolicies.findMany({ where, orderBy: [{ code: 'asc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.companyPolicies.count({ where }),
    ]);
    return { items: await this.map(tenantId, rows), total };
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().companyPolicies.findFirst({ where: { tenantId, id, deletedAt: null } });
    return row ? (await this.map(tenantId, [row]))[0]! : null;
  }

  async versions(tenantId: string, code: string) {
    const rows = await this.prisma.db().companyPolicies.findMany({ where: { tenantId, code }, select: { id: true, version: true, status: true, deletedAt: true } });
    return rows.map((r) => ({ id: r.id, version: r.version, status: r.status, deleted: r.deletedAt !== null }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'companyPolicyAddUpdate', data);
  }

  async activeEmployee(tenantId: string, id: string) {
    return (await this.prisma.db().employees.count({ where: { tenantId, id, deletedAt: null, status: { not: 'EXITED' } } })) === 1;
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'companyPolicies', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().companyPolicies.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null, status: 'DRAFT' }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this policy. Reload and try again.');
  }

  private async map(tenantId: string, rows: Row[]): Promise<CompanyPolicy[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const some = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const [prev, owners] = await Promise.all([
      db.companyPolicies.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.supersedesPolicyId)) } }, select: { id: true, version: true } }),
      db.employees.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.ownerEmployeeId)) } }, select: { id: true, code: true, displayName: true } }),
    ]);
    return rows.map((r) => {
      const o = owners.find((x) => x.id === r.ownerEmployeeId);
      return {
        id: r.id, code: r.code, title: r.title, version: r.version, category: r.category, effectiveDate: r.effectiveDate.toISOString().slice(0, 10),
        owner: o ? { id: o.id, code: o.code, name: o.displayName ?? '' } : null,
        body: r.body, readMinutes: r.readMinutes, attachmentId: r.attachmentId, requiresAcknowledgement: r.requiresAcknowledgement,
        supersedes: prev.find((p) => p.id === r.supersedesPolicyId) ?? null,
        status: r.status, publishedAt: r.publishedAt?.toISOString() ?? null, rowVersion: r.rowVersion,
      };
    });
  }
}
