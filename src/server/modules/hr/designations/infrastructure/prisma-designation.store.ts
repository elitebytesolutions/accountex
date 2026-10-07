import { Injectable } from '@nestjs/common';
import type { Designation } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { DesignationStore } from '../application/designation-store.js';

@Injectable()
export class PrismaDesignationStore extends DesignationStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, departmentId?: string): Promise<Designation[]> {
    const db = this.prisma.db();
    const rows = await db.designations.findMany({ where: { tenantId, deletedAt: null, ...(departmentId && { departmentId }) }, orderBy: { title: 'asc' } });
    const some = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const [depts, grades, bosses, staff] = await Promise.all([
      db.departments.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.departmentId)) } }, select: { id: true, code: true, name: true } }),
      db.grades.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.gradeId)) } }, select: { id: true, code: true, levelName: true, levelRank: true } }),
      db.designations.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.reportsToDesignationId)) } }, select: { id: true, title: true } }),
      db.employees.groupBy({ by: ['designationId'], where: { tenantId, deletedAt: null, status: { not: 'EXITED' } }, _count: { _all: true } }),
    ]);
    return rows
      .map((r) => {
        const g = grades.find((x) => x.id === r.gradeId);
        return {
          id: r.id, title: r.title, department: depts.find((d) => d.id === r.departmentId) ?? { id: r.departmentId, code: '?', name: '?' },
          grade: g ? { id: g.id, code: g.code, name: g.levelName, levelRank: g.levelRank } : null, approvedPositions: r.approvedPositions,
          reportsTo: bosses.find((b) => b.id === r.reportsToDesignationId) ?? null, filled: staff.find((s) => s.designationId === r.id)?._count._all ?? 0, isActive: r.isActive, rowVersion: r.rowVersion,
        };
      })
      .sort((a, b) => (b.grade?.levelRank ?? 0) - (a.grade?.levelRank ?? 0) || a.title.localeCompare(b.title));
  }

  chain(tenantId: string) {
    return this.prisma.db().designations.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, reportsToDesignationId: true } });
  }

  async activeDepartment(tenantId: string, id: string) {
    return (await this.prisma.db().departments.count({ where: { tenantId, id, deletedAt: null, isActive: true } })) > 0;
  }

  async activeGrade(tenantId: string, id: string) {
    return (await this.prisma.db().grades.count({ where: { tenantId, id, deletedAt: null, isActive: true } })) > 0;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'designationAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'designations', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().designations.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this designation. Reload and try again.');
  }
}
