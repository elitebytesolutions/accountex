import { Injectable } from '@nestjs/common';
import type { Grade } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { GradeStore } from '../application/grade-store.js';

@Injectable()
export class PrismaGradeStore extends GradeStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<Grade[]> {
    const db = this.prisma.db();
    const [rows, desigs, staff] = await Promise.all([
      db.grades.findMany({ where: { tenantId, deletedAt: null }, orderBy: { levelRank: 'asc' } }),
      db.designations.groupBy({ by: ['gradeId'], where: { tenantId, deletedAt: null, gradeId: { not: null } }, _count: { _all: true } }),
      db.employees.groupBy({ by: ['gradeId'], where: { tenantId, deletedAt: null, status: { not: 'EXITED' }, gradeId: { not: null } }, _count: { _all: true } }),
    ]);
    return rows.map((g) => ({
      id: g.id, code: g.code, levelRank: g.levelRank, levelName: g.levelName, minSalary: g.minSalary.toNumber(), midSalary: g.midSalary.toNumber(),
      maxSalary: g.maxSalary.toNumber(), isActive: g.isActive, designationCount: desigs.find((d) => d.gradeId === g.id)?._count._all ?? 0, staff: staff.find((s) => s.gradeId === g.id)?._count._all ?? 0, rowVersion: g.rowVersion,
    }));
  }

  async allCodes(tenantId: string) {
    const rows = await this.prisma.db().grades.findMany({ where: { tenantId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  async allRanks(tenantId: string) {
    const rows = await this.prisma.db().grades.findMany({ where: { tenantId }, select: { id: true, levelRank: true, deletedAt: true } });
    return rows.map((r) => ({ id: r.id, levelRank: r.levelRank, deleted: r.deletedAt !== null }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'gradeAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'grades', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().grades.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this grade. Reload and try again.');
  }
}
