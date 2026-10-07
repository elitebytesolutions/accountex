import { Injectable } from '@nestjs/common';
import type { BranchHr, HrFormOptions } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { OrgStore, type OrgDepartment, type OrgDesignation, type OrgEmployee } from '../application/org-store.js';

const current = { deletedAt: null, status: { not: 'EXITED' } };

@Injectable()
export class PrismaOrgStore extends OrgStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  departments(tenantId: string): Promise<OrgDepartment[]> {
    return this.prisma.db().departments.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, code: true, name: true, parentId: true, division: true, isActive: true }, orderBy: { name: 'asc' } });
  }

  async designations(tenantId: string): Promise<OrgDesignation[]> {
    const db = this.prisma.db();
    const rows = await db.designations.findMany({ where: { tenantId, deletedAt: null }, orderBy: { title: 'asc' } });
    const grades = await db.grades.findMany({ where: { tenantId, id: { in: rows.map((r) => r.gradeId).filter((x): x is string => !!x) } }, select: { id: true, code: true } });
    return rows.map((r) => ({
      id: r.id, title: r.title, departmentId: r.departmentId, reportsToDesignationId: r.reportsToDesignationId, approvedPositions: r.approvedPositions,
      gradeCode: grades.find((g) => g.id === r.gradeId)?.code ?? null, isActive: r.isActive,
    }));
  }

  async employees(tenantId: string): Promise<OrgEmployee[]> {
    const rows = await this.prisma.db().employees.findMany({
      where: { tenantId, ...current }, orderBy: { code: 'asc' },
      select: { id: true, code: true, displayName: true, designationId: true, departmentId: true, branchId: true, reportingManagerId: true },
    });
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.displayName ?? '', designationId: r.designationId, departmentId: r.departmentId, branchId: r.branchId, managerId: r.reportingManagerId }));
  }

  branches(tenantId: string) {
    return this.prisma.db().branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true, isHeadOffice: true, city: true }, orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }] });
  }

  async options(tenantId: string): Promise<HrFormOptions> {
    const db = this.prisma.db();
    const [departments, grades, designations, costCentres, branches, employees] = await Promise.all([
      db.departments.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, code: true, name: true, parentId: true, isActive: true }, orderBy: { name: 'asc' } }),
      db.grades.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, code: true, levelName: true, levelRank: true }, orderBy: { levelRank: 'asc' } }),
      db.designations.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, title: true, departmentId: true }, orderBy: { title: 'asc' } }),
      db.costCentres.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      this.branches(tenantId),
      db.employees.findMany({ where: { tenantId, ...current }, select: { id: true, code: true, displayName: true }, orderBy: { firstName: 'asc' } }),
    ]);
    return {
      departments, grades: grades.map((g) => ({ id: g.id, code: g.code, name: g.levelName, levelRank: g.levelRank })), designations, costCentres, branches,
      employees: employees.map((e) => ({ id: e.id, code: e.code, name: e.displayName ?? '' })),
    };
  }

  async branchHr(tenantId: string): Promise<BranchHr[]> {
    const db = this.prisma.db();
    const [branches, settings, heads, devices, shifts] = await Promise.all([
      this.branches(tenantId),
      db.branchHrSettings.findMany({ where: { tenantId } }),
      db.employees.groupBy({ by: ['branchId'], where: { tenantId, ...current }, _count: { _all: true } }),
      db.biometricDevices.groupBy({ by: ['branchId'], where: { tenantId, deletedAt: null, isActive: true }, _count: { _all: true } }),
      db.workShifts.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true } }),
    ]);
    const managers = await db.employees.findMany({ where: { tenantId, id: { in: settings.map((s) => s.managerEmployeeId).filter((x): x is string => !!x) } }, select: { id: true, code: true, displayName: true } });
    return branches.map((b) => {
      const s = settings.find((x) => x.branchId === b.id);
      const m = managers.find((x) => x.id === s?.managerEmployeeId);
      const sh = shifts.find((x) => x.id === s?.defaultShiftId);
      return {
        ...b, settingId: s?.id ?? null, rowVersion: s?.rowVersion ?? null, socialSecurityScheme: s?.socialSecurityScheme ?? 'NONE',
        manager: m ? { id: m.id, code: m.code, name: m.displayName ?? '' } : null, defaultShift: sh ?? null,
        headcount: heads.find((h) => h.branchId === b.id)?._count._all ?? 0, devices: devices.find((d) => d.branchId === b.id)?._count._all ?? 0,
      };
    });
  }

  saveBranchHr(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'branchHrSettingAddUpdate', data);
  }
}
