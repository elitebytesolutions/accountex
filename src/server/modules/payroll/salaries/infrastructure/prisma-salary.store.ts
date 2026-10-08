import { Injectable } from '@nestjs/common';
import type { EmployeeSalary } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { SalaryStore } from '../application/salary-store.js';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

@Injectable()
export class PrismaSalaryStore extends SalaryStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async history(tenantId: string, employeeId: string): Promise<EmployeeSalary[]> {
    const db = this.prisma.db();
    const rows = await db.employeeSalaries.findMany({ where: { tenantId, employeeId }, orderBy: { effectiveFrom: 'desc' } });
    const ids = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const [structures, groups, users] = await Promise.all([
      db.salaryStructures.findMany({ where: { tenantId, id: { in: ids(rows.flatMap((r) => [r.structureId, r.addonStructureId])) } }, select: { id: true, code: true, name: true } }),
      db.payGroups.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.payGroupId)) } }, select: { id: true, code: true, name: true } }),
      db.users.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.approvedByUserId)) } }, select: { id: true, fullName: true } }),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    return rows.map((r) => {
      const from = day(r.effectiveFrom)!;
      const to = day(r.effectiveTo);
      const u = users.find((x) => x.id === r.approvedByUserId);
      return {
        id: r.id, employeeId: r.employeeId, structure: structures.find((s) => s.id === r.structureId)!, addon: structures.find((s) => s.id === r.addonStructureId) ?? null,
        payGroup: groups.find((g) => g.id === r.payGroupId) ?? null, effectiveFrom: from, effectiveTo: to, basicAmount: r.basicAmount.toNumber(), grossAmount: r.grossAmount.toNumber(),
        payMode: r.payMode, revisionType: r.revisionType, revisionReason: r.revisionReason, approvedBy: u ? { id: u.id, name: u.fullName } : null,
        approvedAt: r.approvedAt?.toISOString() ?? null, isCurrent: from <= today && (!to || to >= today), rowVersion: r.rowVersion,
      };
    });
  }

  async employee(tenantId: string, id: string) {
    const e = await this.prisma.db().employees.findFirst({ where: { tenantId, id, deletedAt: null }, select: { id: true, status: true, joiningDate: true } });
    return e ? { id: e.id, status: e.status, joiningDate: day(e.joiningDate)! } : null;
  }

  async employeeOfSalary(tenantId: string, salaryId: string) {
    return (await this.prisma.db().employeeSalaries.findFirst({ where: { tenantId, id: salaryId }, select: { employeeId: true } }))?.employeeId ?? null;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'employeeSalaryAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'employeeSalaries', id);
  }

  async remove(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().employeeSalaries.deleteMany({ where: { tenantId, id, rowVersion } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this salary. Reload and try again.');
  }
}
