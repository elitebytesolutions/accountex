import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { Department, DepartmentListQuery, ListResult } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { DepartmentStore } from '../application/department-store.js';

type Row = Prisma.DepartmentsGetPayload<object>;

@Injectable()
export class PrismaDepartmentStore extends DepartmentStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(tenantId: string, q: DepartmentListQuery): Promise<ListResult<Department>> {
    const s = q.search?.trim();
    const where: Prisma.DepartmentsWhereInput = {
      tenantId, deletedAt: null,
      ...(q.status === 'ACTIVE' && { isActive: true }), ...(q.status === 'INACTIVE' && { isActive: false }),
      ...(s && { OR: [{ code: { contains: s, mode: 'insensitive' } }, { name: { contains: s, mode: 'insensitive' } }, { description: { contains: s, mode: 'insensitive' } }] }),
    };
    const db = this.prisma.db();
    const [rows, total] = await Promise.all([db.departments.findMany({ where, orderBy: { name: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }), db.departments.count({ where })]);
    return { items: await this.map(tenantId, rows), total };
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().departments.findFirst({ where: { tenantId, id, deletedAt: null } });
    return row ? (await this.map(tenantId, [row]))[0]! : null;
  }

  tree(tenantId: string) {
    return this.prisma.db().departments.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, parentId: true, isActive: true } });
  }

  async allCodes(tenantId: string) {
    const rows = await this.prisma.db().departments.findMany({ where: { tenantId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  async activeCostCentre(tenantId: string, id: string) {
    return (await this.prisma.db().costCentres.count({ where: { tenantId, id, deletedAt: null, status: 'ACTIVE' } })) > 0;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'departmentAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'departments', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().departments.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this department. Reload and try again.');
  }

  private async map(tenantId: string, rows: Row[]): Promise<Department[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const ids = rows.map((r) => r.id);
    const some = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const [parents, ccs, children, desigs, staff, heads] = await Promise.all([
      db.departments.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.parentId)) } }, select: { id: true, code: true, name: true } }),
      db.costCentres.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.costCentreId)) } }, select: { id: true, code: true, name: true } }),
      db.departments.groupBy({ by: ['parentId'], where: { tenantId, deletedAt: null, parentId: { in: ids } }, _count: { _all: true } }),
      db.designations.groupBy({ by: ['departmentId'], where: { tenantId, deletedAt: null, departmentId: { in: ids } }, _count: { _all: true }, _sum: { approvedPositions: true } }),
      db.employees.groupBy({ by: ['departmentId'], where: { tenantId, deletedAt: null, status: { not: 'EXITED' }, departmentId: { in: ids } }, _count: { _all: true } }),
      db.employees.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.headEmployeeId)) } }, select: { id: true, code: true, displayName: true } }),
    ]);
    return rows.map((r) => {
      const d = desigs.find((x) => x.departmentId === r.id);
      return {
        id: r.id, code: r.code, name: r.name, description: r.description, parent: parents.find((p) => p.id === r.parentId) ?? null, division: r.division,
        head: (() => { const h = heads.find((x) => x.id === r.headEmployeeId); return h ? { id: h.id, code: h.code, name: h.displayName ?? '' } : null; })(), costCentre: ccs.find((c) => c.id === r.costCentreId) ?? null, annualBudget: r.annualBudget?.toNumber() ?? null, isActive: r.isActive,
        childCount: children.find((c) => c.parentId === r.id)?._count._all ?? 0, designationCount: d?._count._all ?? 0, positions: d?._sum.approvedPositions ?? 0,
        headcount: staff.find((s) => s.departmentId === r.id)?._count._all ?? 0, rowVersion: r.rowVersion,
      };
    });
  }
}
