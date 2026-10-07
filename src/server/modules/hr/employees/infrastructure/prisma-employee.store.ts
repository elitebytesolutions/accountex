import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { Employee, EmployeeFormOptions, EmployeeList, EmployeeListQuery, PositionEvent } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { EmployeeStore, type PositionRow } from '../application/employee-store.js';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const hm = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : '');
const some = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
const monthStart = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)); };

@Injectable()
export class PrismaEmployeeStore extends EmployeeStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(tenantId: string, q: EmployeeListQuery): Promise<EmployeeList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.EmployeesWhereInput = {
      tenantId, deletedAt: null,
      ...(q.department && { departmentId: q.department }), ...(q.branch && { branchId: q.branch }), ...(q.type && { employmentType: q.type }),
      ...(s && { OR: [
        { firstName: { contains: s, mode: 'insensitive' } }, { lastName: { contains: s, mode: 'insensitive' } }, { code: { contains: s, mode: 'insensitive' } },
        { cnic: { contains: s } }, { workEmail: { contains: s, mode: 'insensitive' } }, { personalEmail: { contains: s, mode: 'insensitive' } }, { mobile: { contains: s } },
      ] }),
    };
    // "All" is everyone still employed; exited staff show only under their own filter.
    const where: Prisma.EmployeesWhereInput = { ...base, ...(q.status ? { status: q.status } : { status: { not: 'EXITED' } }) };
    const start = monthStart();
    const yearAgo = new Date(Date.now() - 365 * 86400000);
    const [rows, total, byStatus, joiners, exits, exits12] = await Promise.all([
      db.employees.findMany({ where, orderBy: { code: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.employees.count({ where }),
      db.employees.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.employees.count({ where: { tenantId, deletedAt: null, joiningDate: { gte: start } } }),
      db.employees.count({ where: { tenantId, deletedAt: null, exitDate: { gte: start } } }),
      db.employees.count({ where: { tenantId, deletedAt: null, exitDate: { gte: yearAgo } } }),
    ]);
    const [depts, desigs, branches] = await Promise.all([
      db.departments.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.departmentId)) } }, select: { id: true, code: true, name: true } }),
      db.designations.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.designationId)) } }, select: { id: true, title: true } }),
      db.branches.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.branchId)) } }, select: { id: true, code: true, name: true } }),
    ]);
    const counts = Object.fromEntries(byStatus.map((b) => [b.status, b._count._all]));
    const headcount = byStatus.filter((b) => b.status !== 'EXITED').reduce((n, b) => n + b._count._all, 0);
    return {
      items: rows.map((r) => ({
        id: r.id, code: r.code, name: r.displayName ?? `${r.firstName} ${r.lastName}`, designation: desigs.find((d) => d.id === r.designationId)?.title ?? '',
        department: depts.find((d) => d.id === r.departmentId)!, branch: branches.find((b) => b.id === r.branchId)!, joiningDate: day(r.joiningDate)!,
        employmentType: r.employmentType, status: r.status, mobile: r.mobile, workEmail: r.workEmail, personalEmail: r.personalEmail, cnic: r.cnic,
      })),
      total,
      kpis: { headcount, joinersThisMonth: joiners, exitsThisMonth: exits, attrition: headcount ? Math.round((exits12 / headcount) * 1000) / 10 : null, byStatus: counts },
    };
  }

  async get(tenantId: string, id: string): Promise<Employee | null> {
    const db = this.prisma.db();
    const r = await db.employees.findFirst({ where: { tenantId, id, deletedAt: null } });
    if (!r) return null;
    const [statutory, banks, docs, history, reports, user] = await Promise.all([
      db.employeeStatutoryDetails.findFirst({ where: { tenantId, employeeId: id } }),
      db.employeeBankAccounts.findMany({ where: { tenantId, employeeId: id }, orderBy: [{ isPrimary: 'desc' }, { effectiveFrom: 'desc' }] }),
      db.employeeDocuments.findMany({ where: { tenantId, employeeId: id }, orderBy: { createdAt: 'asc' } }),
      db.employeePositionHistory.findMany({ where: { tenantId, employeeId: id }, orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }] }),
      db.employees.findMany({ where: { tenantId, reportingManagerId: id, deletedAt: null, status: { not: 'EXITED' } }, select: { id: true, code: true, displayName: true, designationId: true }, orderBy: { code: 'asc' } }),
      r.appUserId ? db.users.findFirst({ where: { tenantId, id: r.appUserId }, select: { id: true, fullName: true, email: true } }) : null,
    ]);
    const deptIds = some([r.departmentId, ...history.flatMap((h) => [h.fromDepartmentId, h.toDepartmentId])]);
    const desigIds = some([r.designationId, ...reports.map((x) => x.designationId), ...history.flatMap((h) => [h.fromDesignationId, h.toDesignationId])]);
    const gradeIds = some([r.gradeId, ...history.flatMap((h) => [h.fromGradeId, h.toGradeId])]);
    const branchIds = some([r.branchId, ...history.flatMap((h) => [h.fromBranchId, h.toBranchId])]);
    const empIds = some([r.reportingManagerId, ...history.flatMap((h) => [h.fromManagerId, h.toManagerId])]);
    const [depts, desigs, grades, branches, emps, cc, shift, bankRefs] = await Promise.all([
      db.departments.findMany({ where: { tenantId, id: { in: deptIds } }, select: { id: true, code: true, name: true } }),
      db.designations.findMany({ where: { tenantId, id: { in: desigIds } }, select: { id: true, title: true } }),
      db.grades.findMany({ where: { tenantId, id: { in: gradeIds } }, select: { id: true, code: true, levelName: true, minSalary: true, maxSalary: true } }),
      db.branches.findMany({ where: { tenantId, id: { in: branchIds } }, select: { id: true, code: true, name: true } }),
      db.employees.findMany({ where: { tenantId, id: { in: empIds } }, select: { id: true, code: true, displayName: true, designationId: true } }),
      r.costCentreId ? db.costCentres.findFirst({ where: { tenantId, id: r.costCentreId }, select: { id: true, code: true, name: true } }) : null,
      r.shiftId ? db.workShifts.findFirst({ where: { tenantId, id: r.shiftId } }) : null,
      db.banks.findMany({ where: { tenantId, id: { in: some(banks.map((b) => b.bankId)) } }, select: { id: true, name: true } }),
    ]);
    const mgr = emps.find((e) => e.id === r.reportingManagerId);
    const mgrDesig = mgr ? (await db.designations.findFirst({ where: { tenantId, id: mgr.designationId }, select: { title: true } }))?.title ?? '' : '';
    const g = grades.find((x) => x.id === r.gradeId);
    const nm = {
      department: (x: string | null) => depts.find((d) => d.id === x)?.name ?? null,
      designation: (x: string | null) => desigs.find((d) => d.id === x)?.title ?? null,
      grade: (x: string | null) => grades.find((d) => d.id === x)?.code ?? null,
      branch: (x: string | null) => branches.find((d) => d.id === x)?.name ?? null,
      manager: (x: string | null) => emps.find((d) => d.id === x)?.displayName ?? null,
    };
    const side = (h: (typeof history)[number], k: 'from' | 'to'): PositionEvent['from'] => ({
      department: nm.department(h[`${k}DepartmentId`]), designation: nm.designation(h[`${k}DesignationId`]), grade: nm.grade(h[`${k}GradeId`]),
      branch: nm.branch(h[`${k}BranchId`]), manager: nm.manager(h[`${k}ManagerId`]), employmentType: h[`${k}EmploymentType`], status: h[`${k}Status`],
    });
    return {
      id: r.id, code: r.code, firstName: r.firstName, lastName: r.lastName, name: r.displayName ?? `${r.firstName} ${r.lastName}`, legalName: r.legalName,
      guardianName: r.guardianName, guardianRelation: r.guardianRelation, cnic: r.cnic, cnicIssueDate: day(r.cnicIssueDate), cnicExpiryDate: day(r.cnicExpiryDate),
      dateOfBirth: day(r.dateOfBirth)!, gender: r.gender, maritalStatus: r.maritalStatus, childrenCount: r.childrenCount, religion: r.religion, bloodGroup: r.bloodGroup,
      nationality: r.nationality, mobile: r.mobile, personalEmail: r.personalEmail, workEmail: r.workEmail, currentAddress: r.currentAddress, permanentAddress: r.permanentAddress,
      city: r.city, emergencyContactName: r.emergencyContactName, emergencyRelation: r.emergencyRelation, emergencyPhone: r.emergencyPhone,
      emergencyAltName: r.emergencyAltName, emergencyAltRelation: r.emergencyAltRelation, emergencyAltPhone: r.emergencyAltPhone,
      department: depts.find((d) => d.id === r.departmentId)!, designation: desigs.find((d) => d.id === r.designationId)!,
      grade: g ? { id: g.id, code: g.code, name: g.levelName, minSalary: g.minSalary.toNumber(), maxSalary: g.maxSalary.toNumber() } : null,
      manager: mgr ? { id: mgr.id, code: mgr.code, name: mgr.displayName ?? '', designation: mgrDesig } : null, costCentre: cc,
      branch: branches.find((b) => b.id === r.branchId)!,
      shift: shift ? { id: shift.id, code: shift.code, name: shift.name, startTime: hm(shift.startTime), endTime: hm(shift.endTime), graceMinutes: shift.graceMinutes } : null,
      weeklyOff: r.weeklyOff, payGroup: r.payGroup, employmentType: r.employmentType, workPattern: r.workPattern, joiningDate: day(r.joiningDate)!,
      probationMonths: r.probationMonths, confirmationDueOn: day(r.confirmationDueOn), confirmedOn: day(r.confirmedOn), contractEndDate: day(r.contractEndDate),
      noticeDays: r.noticeDays, biometricId: r.biometricId, isBooker: r.isBooker, isSalesman: r.isSalesman, isDeliveryman: r.isDeliveryman, isSupervisor: r.isSupervisor,
      status: r.status, exitDate: day(r.exitDate), exitType: r.exitType, appUser: user ? { id: user.id, name: user.fullName, email: user.email } : null,
      statutory: statutory ? {
        id: statutory.id, eobiApplicable: statutory.eobiApplicable, eobiNo: statutory.eobiNo, eobiRegisteredOn: day(statutory.eobiRegisteredOn),
        socialSecurityApplicable: statutory.socialSecurityApplicable, socialSecurityScheme: statutory.socialSecurityScheme, socialSecurityNo: statutory.socialSecurityNo,
        ntn: statutory.ntn, atlStatus: statutory.atlStatus, pfApplicable: statutory.pfApplicable, pfFromDate: day(statutory.pfFromDate), groupInsurance: statutory.groupInsurance,
        overtimeEligible: statutory.overtimeEligible,
      } : {
        id: null, eobiApplicable: false, eobiNo: null, eobiRegisteredOn: null, socialSecurityApplicable: false, socialSecurityScheme: null, socialSecurityNo: null,
        ntn: null, atlStatus: 'NON_FILER', pfApplicable: false, pfFromDate: null, groupInsurance: false, overtimeEligible: false,
      },
      bankAccounts: banks.map((b) => ({
        id: b.id, paymentMode: b.paymentMode, bank: bankRefs.find((x) => x.id === b.bankId) ?? null, bankName: b.bankName, branchName: b.branchName,
        accountTitle: b.accountTitle, iban: b.iban, isPrimary: b.isPrimary, effectiveFrom: day(b.effectiveFrom)!, isActive: b.isActive,
      })),
      documents: docs.map((d) => ({
        id: d.id, category: d.category, title: d.title, issuedOn: day(d.issuedOn), expiresOn: day(d.expiresOn), isRequired: d.isRequired,
        renewalFrequency: d.renewalFrequency, dueOn: day(d.dueOn), status: d.status, remarks: d.remarks,
      })),
      history: history.map((h) => ({ id: h.id, effectiveDate: day(h.effectiveDate)!, eventType: h.eventType, reason: h.reason, incrementPct: h.incrementPct?.toNumber() ?? null, from: side(h, 'from'), to: side(h, 'to') })),
      directReports: reports.map((x) => ({ id: x.id, code: x.code, name: x.displayName ?? '', designation: desigs.find((d) => d.id === x.designationId)?.title ?? '' })),
      rowVersion: r.rowVersion,
    };
  }

  async options(tenantId: string): Promise<EmployeeFormOptions> {
    const db = this.prisma.db();
    const [preview, departments, designations, grades, managers, costCentres, branches, shifts, banks, users] = await Promise.all([
      db.$queryRaw<{ preview: string }[]>`select preview from "Company"."getNumberingSeriesPreview" where "tenantId" = ${tenantId}::uuid and "docType" = 'EMP' and "isActive" order by "branchId" nulls first limit 1`,
      db.departments.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      db.designations.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, title: true, departmentId: true, gradeId: true }, orderBy: { title: 'asc' } }),
      db.grades.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, code: true, levelName: true }, orderBy: { levelRank: 'asc' } }),
      db.employees.findMany({ where: { tenantId, deletedAt: null, status: { not: 'EXITED' } }, select: { id: true, code: true, displayName: true, designationId: true, departmentId: true }, orderBy: { firstName: 'asc' } }),
      db.costCentres.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }] }),
      db.workShifts.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, orderBy: [{ isDefault: 'desc' }, { startTime: 'asc' }] }),
      db.banks.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, name: true, ibanBankCode: true }, orderBy: { name: 'asc' } }),
      db.users.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE', employeeId: null }, select: { id: true, fullName: true, email: true }, orderBy: { fullName: 'asc' } }),
    ]);
    const titles = await db.designations.findMany({ where: { tenantId, id: { in: some(managers.map((m) => m.designationId)) } }, select: { id: true, title: true } });
    return {
      nextCode: preview[0]?.preview ?? null, departments, designations, grades: grades.map((g) => ({ id: g.id, code: g.code, name: g.levelName })),
      managers: managers.map((m) => ({ id: m.id, code: m.code, name: m.displayName ?? '', designation: titles.find((t) => t.id === m.designationId)?.title ?? '', departmentId: m.departmentId })),
      costCentres, branches,
      shifts: shifts.map((s) => ({ id: s.id, code: s.code, name: s.name, startTime: hm(s.startTime), endTime: hm(s.endTime), isDefault: s.isDefault, weeklyOff: s.weeklyOff })),
      banks, users: users.map((u) => ({ id: u.id, name: u.fullName, email: u.email })),
    };
  }

  async clashes(tenantId: string, values: { cnic?: string; biometricId?: string | null }, exceptId?: string) {
    const db = this.prisma.db();
    const not = exceptId ? { id: { not: exceptId } } : {};
    const [cnic, bio] = await Promise.all([
      values.cnic ? db.employees.count({ where: { tenantId, cnic: values.cnic, ...not } }) : 0,
      values.biometricId ? db.employees.count({ where: { tenantId, biometricId: values.biometricId, ...not } }) : 0,
    ]);
    return { cnic: cnic > 0, biometricId: bio > 0 };
  }

  async managers(tenantId: string) {
    const rows = await this.prisma.db().employees.findMany({ where: { tenantId }, select: { id: true, reportingManagerId: true } });
    return new Map(rows.map((r) => [r.id, r.reportingManagerId]));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'employeeAddUpdate', data);
  }

  async addHistory(tenantId: string, row: PositionRow) {
    await this.prisma.db().employeePositionHistory.create({ data: { ...row, tenantId, effectiveDate: new Date(row.effectiveDate) } });
  }

  async userFree(tenantId: string, userId: string, employeeId: string) {
    const u = await this.prisma.db().users.findFirst({ where: { tenantId, id: userId, deletedAt: null }, select: { status: true, employeeId: true } });
    if (!u || u.status !== 'ACTIVE') return 'missing' as const;
    return u.employeeId && u.employeeId !== employeeId ? ('linked' as const) : ('ok' as const);
  }

  async setUserLink(tenantId: string, userId: string, employeeId: string | null) {
    await this.prisma.db().users.updateMany({ where: { tenantId, id: userId }, data: { employeeId } });
  }

  inUse(tenantId: string, id: string) {
    return isReferenced(this.prisma, 'employees', id, ['employeeStatutory', 'employeeBankAccounts', 'employeeDocuments', 'employeePositionHistory']);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().employees.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this employee. Reload and try again.');
  }
}
