import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { payrollMonthBounds, type PayrollGlLine, type PayrollOverview, type PayrollRunSummary, type RunInputs, type RunList, type RunOptions } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { asDate, day, employeeRefs, ids, num, unknownEmp, userNames } from '../../../hr/attendance/infrastructure/hr-refs.js';
import { RunStore, type EmployeeFacts, type RunBase, type RunScope, type ScopeEmployee, type StoredAdjustment } from '../application/run-store.js';

type Db = Prisma.TransactionClient;
type RunRow = Prisma.PayrollRunsGetPayload<object>;
const CLOSED = ['REJECTED', 'CANCELLED', 'REVERSED'];
const BOOKED = ['POSTED', 'PAID'];
const addDays = (iso: string, n: number) => { const d = asDate(iso); d.setUTCDate(d.getUTCDate() + n); return day(d)!; };
const daysBetween = (a: string, b: string) => Math.round((asDate(b).getTime() - asDate(a).getTime()) / 86400_000) + 1;
const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

@Injectable()
export class PrismaRunStore extends RunStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(): Db {
    return this.prisma.db();
  }

  // ---------------------------------------------------------------- reads
  async list(tenantId: string, q: { status?: string; year?: string; page: number; pageSize: number }): Promise<RunList> {
    const where: Prisma.PayrollRunsWhereInput = {
      tenantId,
      ...(q.status && { status: q.status }),
      ...(q.year && { payrollMonth: { gte: asDate(`${q.year}-01-01`), lte: asDate(`${q.year}-12-01`) } }),
    };
    const [rows, total] = await Promise.all([
      this.db().payrollRuns.findMany({ where, orderBy: [{ payrollMonth: 'desc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.db().payrollRuns.count({ where }),
    ]);
    return { items: await this.summaries(tenantId, rows), total };
  }

  private async summaries(tenantId: string, rows: RunRow[]): Promise<PayrollRunSummary[]> {
    const db = this.db();
    const [groups, vouchers] = await Promise.all([
      db.payGroups.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.payGroupId)) } }, select: { id: true, code: true, name: true } }),
      db.vouchers.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.journalEntryId)) } }, select: { id: true, docNo: true, status: true } }),
    ]);
    return rows.map((r) => ({
      id: r.id, docNo: r.docNo, runType: r.runType, payrollMonth: day(r.payrollMonth)!, periodFrom: day(r.periodFrom)!, periodTo: day(r.periodTo)!, payDate: day(r.payDate)!,
      payGroup: groups.find((g) => g.id === r.payGroupId) ?? null, status: r.status, employeeCount: r.employeeCount, grossAmount: num(r.grossAmount),
      taxAmount: num(r.taxAmount), eobiEmployeeAmount: num(r.eobiEmployeeAmount), pfEmployeeAmount: num(r.pfEmployeeAmount), loanAmount: num(r.loanAmount),
      deductionAmount: num(r.deductionAmount), netAmount: num(r.netAmount), employerContributionAmount: num(r.employerContributionAmount),
      journal: vouchers.find((v) => v.id === r.journalEntryId) ?? null, postedAt: r.postedAt?.toISOString() ?? null, paidAt: r.paidAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
    }));
  }

  async get(tenantId: string, id: string): Promise<RunBase | null> {
    const db = this.db();
    const r = await db.payrollRuns.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    const [summary] = await this.summaries(tenantId, [r]);
    const [branches, checklist, adjustments, lines, batches, account, prev] = await Promise.all([
      db.payrollRunBranches.findMany({ where: { tenantId, payrollRunId: id } }),
      db.payrollRunChecklistItems.findMany({ where: { tenantId, payrollRunId: id }, orderBy: { sortOrder: 'asc' } }),
      db.payrollAdjustments.findMany({ where: { tenantId, payrollRunId: id }, orderBy: { createdAt: 'asc' } }),
      db.payrollRunLines.findMany({ where: { tenantId, payrollRunId: id } }),
      db.salaryPaymentBatches.findMany({ where: { tenantId, payrollRunId: id }, orderBy: { createdAt: 'asc' } }),
      db.chartOfAccounts.findFirst({ where: { tenantId, id: r.salaryPayableAccountId }, select: { id: true, code: true, name: true } }),
      db.payrollRuns.findFirst({ where: { tenantId, runType: 'REGULAR', status: { in: BOOKED }, payrollMonth: { lt: r.payrollMonth }, id: { not: id } }, orderBy: { payrollMonth: 'desc' } }),
    ]);
    const comps = await db.payrollRunLineComponents.findMany({ where: { tenantId, payrollLineId: { in: lines.map((l) => l.id) } }, orderBy: { sortOrder: 'asc' } });
    const [emps, branchRefs, compRefs, users, vouchers, banks] = await Promise.all([
      employeeRefs(db, tenantId, [...lines.map((l) => l.employeeId), ...adjustments.map((a) => a.employeeId)]),
      db.branches.findMany({ where: { tenantId, id: { in: ids(branches.map((b) => b.branchId)) } }, select: { id: true, code: true, name: true } }),
      db.salaryComponents.findMany({ where: { tenantId, id: { in: ids([...comps.map((c) => c.componentId), ...adjustments.map((a) => a.componentId)]) } }, select: { id: true, code: true, name: true, componentType: true } }),
      userNames(db, tenantId, [r.createdBy, r.preparedByUserId, r.approvedByUserId, r.postedByUserId, ...checklist.map((c) => c.doneByUserId)]),
      db.vouchers.findMany({ where: { tenantId, OR: [{ id: { in: ids([r.reversalJournalEntryId]) } }, { sourceDocType: 'PRUN', sourceDocId: { in: batches.map((b) => b.id) } }] }, select: { id: true, docNo: true, status: true, sourceDocId: true, reversalOfId: true } }),
      db.bankAccounts.findMany({ where: { tenantId, id: { in: ids(batches.map((b) => b.bankAccountId)) } }, select: { id: true, accountTitle: true, accountLast4: true } }),
    ]);
    const emp = (eid: string) => emps.get(eid) ?? unknownEmp(eid);
    const user = (uid: string | null) => (uid ? users.get(uid) ?? null : null);
    const v = (x: { id: string; docNo: string; status: string } | undefined) => (x ? { id: x.id, docNo: x.docNo, status: x.status } : null);
    return {
      ...summary!,
      attendanceCutoffDate: day(r.attendanceCutoffDate), salaryPayableAccount: account ?? { id: r.salaryPayableAccountId, code: '?', name: '?' },
      includeNoticePeriod: r.includeNoticePeriod, includeExited: r.includeExited, workingDays: r.workingDays, publicHolidays: r.publicHolidays, wizardStep: r.wizardStep,
      calculatedAt: r.calculatedAt?.toISOString() ?? null, createdBy: user(r.createdBy), preparedBy: user(r.preparedByUserId), preparedAt: r.preparedAt?.toISOString() ?? null,
      approvedBy: user(r.approvedByUserId), approvedAt: r.approvedAt?.toISOString() ?? null, postedBy: user(r.postedByUserId),
      reversalJournal: v(vouchers.find((x) => x.id === r.reversalJournalEntryId)), emailPayslips: r.emailPayslips, publishToEss: r.publishToEss,
      smsNetPayAlert: r.smsNetPayAlert, createDepositReminders: r.createDepositReminders, narration: r.narration, remarks: r.remarks,
      branches: branches.map((b) => { const x = branchRefs.find((y) => y.id === b.branchId); return { branchId: b.branchId, code: x?.code ?? '?', name: x?.name ?? '?', employeeCount: b.employeeCount, isIncluded: b.isIncluded }; }),
      checklist: checklist.map((c) => ({ itemKey: c.itemKey, label: c.label, isDone: c.isDone, doneBy: user(c.doneByUserId), doneAt: c.doneAt?.toISOString() ?? null })),
      adjustments: adjustments.map((a) => {
        const c = compRefs.find((x) => x.id === a.componentId);
        return {
          id: a.id, employee: emp(a.employeeId), component: c ?? { id: a.componentId, code: '?', name: '?', componentType: 'EARNING' }, inputSource: a.inputSource,
          quantity: a.quantity ? num(a.quantity) : null, amount: num(a.amount), isTaxable: a.isTaxable, remarks: a.remarks, sourceDocType: a.sourceDocType, sourceDocId: a.sourceDocId,
        };
      }),
      lines: lines
        .map((l) => ({
          id: l.id, employee: emp(l.employeeId), daysInMonth: l.daysInMonth, paidDays: num(l.paidDays), lwpDays: num(l.lwpDays), leaveTakenDays: num(l.leaveTakenDays),
          overtimeHours: num(l.overtimeHours), basicAmount: num(l.basicAmount), allowanceAmount: num(l.allowanceAmount), grossAmount: num(l.grossAmount), taxAmount: num(l.taxAmount),
          eobiAmount: num(l.eobiAmount), pfAmount: num(l.pfAmount), loanAmount: num(l.loanAmount), otherDeductionAmount: num(l.otherDeductionAmount),
          deductionAmount: num(l.deductionAmount), netAmount: num(l.netAmount), employerEobiAmount: num(l.employerEobiAmount), employerPessiAmount: num(l.employerPessiAmount),
          employerPfAmount: num(l.employerPfAmount), gratuityProvisionAmount: num(l.gratuityProvisionAmount), taxStatus: l.taxStatus,
          projectedAnnualSalary: l.projectedAnnualSalary ? num(l.projectedAnnualSalary) : null, annualExemptAmount: l.annualExemptAmount ? num(l.annualExemptAmount) : null,
          annualTaxableIncome: l.annualTaxableIncome ? num(l.annualTaxableIncome) : null, annualTaxLiability: l.annualTaxLiability ? num(l.annualTaxLiability) : null,
          prevNetAmount: l.prevNetAmount ? num(l.prevNetAmount) : null, variancePct: l.variancePct ? num(l.variancePct) : null, isNewJoiner: l.isNewJoiner,
          isRevised: l.isRevised, flags: l.flags, payMode: l.payMode, bankName: l.bankName, ibanMasked: l.ibanMasked, paymentRef: l.paymentRef,
          paid: !!l.paymentBatchId, isOnHold: l.isOnHold, holdReason: l.holdReason,
          components: comps.filter((c) => c.payrollLineId === l.id).map((c) => ({
            id: c.id, componentId: c.componentId, code: compRefs.find((x) => x.id === c.componentId)?.code ?? '?', componentType: c.componentType, label: c.label,
            basisText: c.basisText, quantity: c.quantity ? num(c.quantity) : null, rate: c.rate ? num(c.rate) : null, amount: num(c.amount), isTaxable: c.isTaxable,
            exemptAmount: num(c.exemptAmount), loanId: c.loanId, payrollInputId: c.payrollInputId, showOnPayslip: c.showOnPayslip,
          })),
        }))
        .sort((a, b) => a.employee.code.localeCompare(b.employee.code)),
      batches: batches.map((b) => {
        const vv = vouchers.find((x) => x.sourceDocId === b.id && !x.reversalOfId);
        const bank = banks.find((x) => x.id === b.bankAccountId);
        return {
          id: b.id, paymentMethod: b.paymentMethod, bankAccount: bank ? { id: bank.id, name: `${bank.accountTitle}${bank.accountLast4 ? ` — ${bank.accountLast4}` : ''}` } : null,
          employeeCount: b.employeeCount, totalAmount: num(b.totalAmount), instructionRef: b.instructionRef, valueDate: day(b.valueDate), status: b.status, voucher: v(vv),
        };
      }),
      previous: prev ? { id: prev.id, docNo: prev.docNo, payrollMonth: day(prev.payrollMonth)!, grossAmount: num(prev.grossAmount), taxAmount: num(prev.taxAmount), netAmount: num(prev.netAmount), employeeCount: prev.employeeCount } : null,
    };
  }

  async options(tenantId: string): Promise<RunOptions> {
    const db = this.db();
    const [groups, branches, accounts, banks, cash, comps, emps, salaries] = await Promise.all([
      db.payGroups.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }] }),
      db.chartOfAccounts.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE', kind: 'POSTABLE', accountClass: 2 }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      db.bankAccounts.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, accountTitle: true, accountLast4: true, useForPayroll: true } }),
      db.cashAccounts.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, code: true, name: true } }),
      db.salaryComponents.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE', componentType: { in: ['EARNING', 'DEDUCTION'] } }, orderBy: [{ componentType: 'asc' }, { sortOrder: 'asc' }] }),
      db.employees.findMany({ where: { tenantId, deletedAt: null, status: { not: 'EXITED' } }, select: { id: true }, orderBy: { code: 'asc' } }),
      db.employeeSalaries.findMany({ where: { tenantId }, select: { employeeId: true } }),
    ]);
    const refs = await employeeRefs(db, tenantId, emps.map((e) => e.id));
    const withSalary = new Set(salaries.map((s) => s.employeeId));
    return {
      payGroups: groups, branches, payableAccounts: accounts, defaultPayableAccountId: await this.salaryPayableDefault(tenantId),
      bankAccounts: banks.map((b) => ({ id: b.id, name: b.accountTitle, last4: b.accountLast4, useForPayroll: b.useForPayroll })), cashAccounts: cash,
      components: comps.filter((c) => !['INCOME_TAX', 'LOAN', 'ADVANCE'].includes(c.systemRole ?? '')).map((c) => ({ id: c.id, code: c.code, name: c.name, componentType: c.componentType, systemRole: c.systemRole, taxable: c.taxTreatment !== 'EXEMPT' })),
      employees: emps.map((e) => ({ ...(refs.get(e.id) ?? unknownEmp(e.id)), hasSalary: withSalary.has(e.id) })),
    };
  }

  async salaryPayableDefault(tenantId: string) {
    return (await this.db().defaultAccountMappings.findFirst({ where: { tenantId, role: 'SALARIES_PAYABLE' }, select: { accountId: true } }))?.accountId ?? null;
  }

  async openRegular(tenantId: string, month: string, payGroupId: string | null, exceptId?: string) {
    const r = await this.db().payrollRuns.findFirst({
      where: { tenantId, runType: 'REGULAR', payrollMonth: asDate(`${month}-01`), payGroupId, status: { notIn: CLOSED }, ...(exceptId && { id: { not: exceptId } }) },
      select: { id: true, docNo: true, status: true },
    });
    return r;
  }

  async previous(tenantId: string, month: string) {
    const r = await this.db().payrollRuns.findFirst({ where: { tenantId, runType: 'REGULAR', payrollMonth: { lt: asDate(`${month}-01`) }, status: { notIn: ['CANCELLED', 'REJECTED'] } }, orderBy: { payrollMonth: 'desc' } });
    return r ? { id: r.id, docNo: r.docNo, status: r.status, payrollMonth: day(r.payrollMonth)! } : null;
  }

  async scope(tenantId: string, s: RunScope): Promise<ScopeEmployee[]> {
    const db = this.db();
    const salaries = await db.employeeSalaries.findMany({
      where: { tenantId, effectiveFrom: { lte: asDate(s.periodTo) }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: asDate(s.periodFrom) } }] },
      orderBy: { effectiveFrom: 'desc' },
    });
    const current = new Map<string, (typeof salaries)[number]>();
    for (const x of salaries) if (!current.has(x.employeeId)) current.set(x.employeeId, x);
    const chosen = [...current.values()].filter((x) => !s.payGroupId || x.payGroupId === s.payGroupId);
    const emps = await db.employees.findMany({ where: { tenantId, deletedAt: null, id: { in: chosen.map((x) => x.employeeId) } } });
    const out: ScopeEmployee[] = [];
    for (const e of emps) {
      const sal = current.get(e.id)!;
      const joining = day(e.joiningDate)!;
      const exit = day(e.exitDate);
      if (joining > s.periodTo) continue;
      if (exit && exit < s.periodFrom) continue;
      if (e.status === 'EXITED' && !exit) continue;
      if (exit && exit <= s.periodTo && !s.includeExited) continue;
      if (e.status === 'NOTICE_PERIOD' && !s.includeNoticePeriod) continue;
      if (s.branchIds && (!e.branchId || !s.branchIds.includes(e.branchId))) continue;
      const from = day(sal.effectiveFrom)!;
      out.push({
        employeeId: e.id, code: e.code, status: e.status, joiningDate: joining, exitDate: exit, branchId: e.branchId, departmentId: e.departmentId, gradeId: e.gradeId,
        costCentreId: e.costCentreId, salaryId: sal.id, structureId: sal.structureId, addonStructureId: sal.addonStructureId, basicAmount: num(sal.basicAmount),
        payMode: sal.payMode, isRevised: from >= s.periodFrom && from <= s.periodTo && sal.revisionType !== 'JOINING',
      });
    }
    return out.sort((a, b) => a.code.localeCompare(b.code));
  }

  async facts(tenantId: string, s: RunScope, employees: ScopeEmployee[], taxYear: { taxYear: string; start: string }): Promise<Map<string, EmployeeFacts>> {
    const db = this.db();
    const empIds = employees.map((e) => e.employeeId);
    const month = asDate(s.payrollMonth);
    const [register, leaves, statutory, banks, loans, decls, ytdLines, prevLines, empRows, holidays] = await Promise.all([
      db.attendanceRegister.findMany({ where: { tenantId, employeeId: { in: empIds }, attDate: { gte: asDate(s.periodFrom), lte: asDate(s.periodTo) } }, select: { employeeId: true, attDate: true, status: true, payableFraction: true, firstIn: true, lastOut: true } }),
      db.leaveRequests.findMany({ where: { tenantId, employeeId: { in: empIds }, status: 'APPROVED', fromDate: { lte: asDate(s.periodTo) }, toDate: { gte: asDate(s.periodFrom) } }, select: { employeeId: true, leaveTypeId: true, fromDate: true, toDate: true, duration: true } }),
      db.employeeStatutoryDetails.findMany({ where: { tenantId, employeeId: { in: empIds } } }),
      db.employeeBankAccounts.findMany({ where: { tenantId, employeeId: { in: empIds }, isActive: true, effectiveFrom: { lte: asDate(s.periodTo) } }, orderBy: [{ isPrimary: 'desc' }, { effectiveFrom: 'desc' }] }),
      db.loansAndAdvances.findMany({ where: { tenantId, employeeId: { in: empIds }, status: 'ACTIVE' } }),
      db.taxDeclarations.findMany({ where: { tenantId, employeeId: { in: empIds }, taxYear: taxYear.taxYear, status: 'APPROVED', OR: [{ effectiveFromMonth: null }, { effectiveFromMonth: { lte: month } }] } }),
      db.payrollRunLines.findMany({
        where: { tenantId, employeeId: { in: empIds }, payrollRunId: { in: (await db.payrollRuns.findMany({ where: { tenantId, status: { in: BOOKED }, payrollMonth: { gte: asDate(taxYear.start), lt: month }, ...(s.runId && { id: { not: s.runId } }) }, select: { id: true } })).map((r) => r.id) } },
        select: { id: true, employeeId: true, grossAmount: true, taxAmount: true },
      }),
      db.payrollRuns.findMany({ where: { tenantId, runType: 'REGULAR', status: { in: BOOKED }, payrollMonth: { lt: month } }, orderBy: { payrollMonth: 'desc' }, take: 3, select: { id: true } }),
      db.employees.findMany({ where: { tenantId, id: { in: empIds } }, select: { id: true, weeklyOff: true } }),
      db.holidays.findMany({ where: { tenantId, deletedAt: null, holidayType: 'PUBLIC', status: { not: 'TENTATIVE' }, fromDate: { lte: asDate(s.periodTo) }, toDate: { gte: asDate(s.periodFrom) } }, select: { fromDate: true, toDate: true } }),
    ]);
    const [leaveTypes, installments, ytdComps, prevNets] = await Promise.all([
      db.leaveTypes.findMany({ where: { tenantId, id: { in: ids(leaves.map((l) => l.leaveTypeId)) } }, select: { id: true, isPaid: true } }),
      db.loanInstallments.findMany({ where: { tenantId, loanId: { in: loans.map((l) => l.id) }, status: 'SCHEDULED', dueMonth: { lte: month } }, orderBy: [{ dueMonth: 'asc' }, { installmentNo: 'asc' }] }),
      db.payrollRunLineComponents.findMany({ where: { tenantId, payrollLineId: { in: ytdLines.map((l) => l.id) }, componentType: 'EARNING' }, select: { payrollLineId: true, amount: true, exemptAmount: true, isTaxable: true } }),
      db.payrollRunLines.findMany({ where: { tenantId, employeeId: { in: empIds }, payrollRunId: { in: prevLines.map((r) => r.id) } }, select: { employeeId: true, payrollRunId: true, netAmount: true } }),
    ]);
    const holidayDates = new Set<string>();
    for (const h of holidays) for (let d = day(h.fromDate)!; d <= day(h.toDate)!; d = addDays(d, 1)) holidayDates.add(d);
    const out = new Map<string, EmployeeFacts>();
    for (const e of employees) {
      const rows = register.filter((r) => r.employeeId === e.employeeId);
      const inEmployment = (d: string) => d >= e.joiningDate && (!e.exitDate || d <= e.exitDate);
      const regDates = new Set(rows.map((r) => day(r.attDate)!));
      let unpaid = 0; let paidLeave = 0; let absent = 0;
      const missing: { date: string }[] = [];
      for (const r of rows) {
        const d = day(r.attDate)!;
        if (!inEmployment(d)) continue;
        const pf = num(r.payableFraction);
        unpaid += 1 - pf;
        if (r.status === 'LEAVE' && pf > 0) paidLeave += pf;
        if (r.status === 'ABSENT') absent += 1;
        if (r.firstIn && !r.lastOut && r.status !== 'ABSENT') missing.push({ date: d });
      }
      // approved unpaid leave on days the register hasn't built yet (weekly off and public holidays excluded)
      const off = (empRows.find((x) => x.id === e.employeeId)?.weeklyOff ?? 'SUNDAY').toUpperCase();
      for (const l of leaves.filter((x) => x.employeeId === e.employeeId)) {
        const paid = leaveTypes.find((t) => t.id === l.leaveTypeId)?.isPaid ?? true;
        if (paid) continue;
        const from = day(l.fromDate)! > s.periodFrom ? day(l.fromDate)! : s.periodFrom;
        const to = day(l.toDate)! < s.periodTo ? day(l.toDate)! : s.periodTo;
        for (let d = from; d <= to; d = addDays(d, 1)) {
          if (regDates.has(d) || !inEmployment(d) || holidayDates.has(d) || off.includes(WEEKDAYS[asDate(d).getUTCDay()]!)) continue;
          unpaid += l.duration === 'FULL' ? 1 : 0.5;
        }
      }
      const before = e.joiningDate > s.periodFrom ? daysBetween(s.periodFrom, addDays(e.joiningDate, -1)) : 0;
      const after = e.exitDate && e.exitDate < s.periodTo ? daysBetween(addDays(e.exitDate, 1), s.periodTo) : 0;
      const st = statutory.find((x) => x.employeeId === e.employeeId);
      const bank = banks.find((x) => x.employeeId === e.employeeId && x.paymentMode === 'BANK');
      const myLoans = loans.filter((l) => l.employeeId === e.employeeId).map((l) => {
        const due = installments.filter((i) => i.loanId === l.id);
        const amount = due.reduce((sum, i) => sum + num(i.amount), 0);
        const first = due[0];
        return { loanId: l.id, loanType: l.loanType, docNo: l.docNo, amount, label: `${l.loanType === 'SALARY_ADVANCE' ? 'Salary advance' : 'Loan installment'} (${l.docNo}${first ? ` · ${first.installmentNo}/${l.installmentCount}` : ''})` };
      }).filter((l) => l.amount > 0);
      const myDecl = decls.filter((d) => d.employeeId === e.employeeId);
      const declSum = (t: string) => myDecl.filter((d) => d.declarationType === t).reduce((sum, d) => sum + num(d.amount), 0);
      const myYtd = ytdLines.filter((l) => l.employeeId === e.employeeId);
      const ytdTaxable = ytdComps.filter((c) => myYtd.some((l) => l.id === c.payrollLineId) && c.isTaxable).reduce((sum, c) => sum + num(c.amount) - num(c.exemptAmount), 0);
      const prev = prevLines.map((r) => prevNets.find((p) => p.payrollRunId === r.id && p.employeeId === e.employeeId)).find(Boolean);
      out.set(e.employeeId, {
        unpaidDays: Math.round(unpaid * 100) / 100, outsideDays: before + after, paidLeaveDays: paidLeave, missingPunches: missing, absentDays: absent, hasRegister: rows.length > 0,
        statutory: { eobi: st?.eobiApplicable ?? true, pessi: st?.socialSecurityApplicable ?? true, pf: !!st?.pfApplicable && (!st.pfFromDate || day(st.pfFromDate)! <= s.periodTo) },
        taxStatus: st?.atlStatus ?? 'FILER', bankName: bank?.bankName ?? null, iban: bank?.iban ?? null, loans: myLoans,
        declarations: { ZAKAT: declSum('ZAKAT'), VPS_PENSION: declSum('VPS_PENSION'), DONATION: declSum('DONATION'), HEALTH_INSURANCE: declSum('HEALTH_INSURANCE') },
        ytdGross: myYtd.reduce((sum, l) => sum + num(l.grossAmount), 0), ytdTaxable, ytdTax: myYtd.reduce((sum, l) => sum + num(l.taxAmount), 0),
        prevNet: prev ? num(prev.netAmount) : null,
      });
    }
    return out;
  }

  async workingDays(tenantId: string, from: string, to: string) {
    const hol = await this.db().holidays.findMany({ where: { tenantId, deletedAt: null, holidayType: 'PUBLIC', status: { not: 'TENTATIVE' }, fromDate: { lte: asDate(to) }, toDate: { gte: asDate(from) } }, select: { fromDate: true, toDate: true } });
    const dates = new Set<string>();
    for (const h of hol) for (let d = day(h.fromDate)!; d <= day(h.toDate)!; d = addDays(d, 1)) if (d >= from && d <= to && asDate(d).getUTCDay() !== 0) dates.add(d);
    let working = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) if (asDate(d).getUTCDay() !== 0 && !dates.has(d)) working++;
    return { workingDays: working, publicHolidays: dates.size };
  }

  async adjustments(tenantId: string, runId: string): Promise<StoredAdjustment[]> {
    const rows = await this.db().payrollAdjustments.findMany({ where: { tenantId, payrollRunId: runId }, orderBy: { createdAt: 'asc' } });
    return rows.map((a) => ({ id: a.id, employeeId: a.employeeId, componentId: a.componentId, amount: num(a.amount), quantity: a.quantity ? num(a.quantity) : null, isTaxable: a.isTaxable, inputSource: a.inputSource, remarks: a.remarks, sourceDocType: a.sourceDocType, sourceDocId: a.sourceDocId }));
  }

  async inputs(tenantId: string, run: RunBase): Promise<RunInputs> {
    const db = this.db();
    const scope = await this.scope(tenantId, { runId: run.id, runType: run.runType, payrollMonth: run.payrollMonth, periodFrom: run.periodFrom, periodTo: run.periodTo, payGroupId: run.payGroup?.id ?? null, includeNoticePeriod: run.includeNoticePeriod, includeExited: run.includeExited, branchIds: run.branches.length ? run.branches.filter((b) => b.isIncluded).map((b) => b.branchId) : null });
    const empIds = scope.map((e) => e.employeeId);
    const month = asDate(run.payrollMonth);
    const today = day(new Date())!;
    const [register, claims, loans, pendingLoans, revisions] = await Promise.all([
      db.attendanceRegister.findMany({ where: { tenantId, employeeId: { in: empIds }, attDate: { gte: asDate(run.periodFrom), lte: asDate(run.periodTo) } }, select: { employeeId: true, attDate: true, status: true, payableFraction: true, firstIn: true, lastOut: true } }),
      db.overtimeClaims.findMany({ where: { tenantId, payrollMonth: month, status: { in: ['PENDING', 'APPROVED', 'PUSHED'] } }, select: { employeeId: true, hours: true, amount: true, status: true, isCompOff: true, payrollRunId: true } }),
      db.loansAndAdvances.findMany({ where: { tenantId, employeeId: { in: empIds }, status: 'ACTIVE' }, select: { id: true } }),
      db.loansAndAdvances.count({ where: { tenantId, status: { in: ['PENDING', 'APPROVED'] } } }),
      db.employeeSalaries.count({ where: { tenantId, employeeId: { in: empIds }, effectiveFrom: { gte: asDate(run.periodFrom), lte: asDate(run.periodTo) }, revisionType: { not: 'JOINING' } } }),
    ]);
    const due = await db.loanInstallments.findMany({ where: { tenantId, loanId: { in: loans.map((l) => l.id) }, status: 'SCHEDULED', dueMonth: { lte: month } }, select: { loanId: true, amount: true } });
    const missing = register.filter((r) => r.firstIn && !r.lastOut && r.status !== 'ABSENT' && day(r.attDate)! < today);
    const refs = await employeeRefs(db, tenantId, missing.map((m) => m.employeeId));
    const pushed = claims.filter((c) => c.payrollRunId === run.id && c.status === 'PUSHED');
    const unpaidBy = new Map<string, number>();
    for (const r of register) { const u = 1 - num(r.payableFraction); if (u > 0 && r.status !== 'HALF_DAY' && r.status !== 'ABSENT') unpaidBy.set(r.employeeId, (unpaidBy.get(r.employeeId) ?? 0) + u); }
    for (const l of run.lines) if (l.lwpDays > 0 && !unpaidBy.has(l.employee.id)) unpaidBy.set(l.employee.id, l.lwpDays);
    return {
      attendance: {
        employees: empIds.length, withRegister: new Set(register.map((r) => r.employeeId)).size,
        missingPunches: missing.slice(0, 50).map((m) => ({ employee: refs.get(m.employeeId) ?? unknownEmp(m.employeeId), date: day(m.attDate)! })),
        absentDays: register.filter((r) => r.status === 'ABSENT').length,
      },
      overtime: {
        claims: pushed.length, hours: pushed.reduce((s, c) => s + num(c.hours), 0), amount: pushed.reduce((s, c) => s + num(c.amount), 0),
        employees: new Set(pushed.map((c) => c.employeeId)).size, pending: claims.filter((c) => c.status === 'PENDING').length,
        unpushed: claims.filter((c) => c.status === 'APPROVED' && !c.isCompOff && num(c.amount) > 0 && !c.payrollRunId && empIds.includes(c.employeeId)).length,
      },
      unpaidLeave: { employees: unpaidBy.size, days: Math.round([...unpaidBy.values()].reduce((s, x) => s + x, 0) * 100) / 100 },
      loans: { installments: due.length, amount: due.reduce((s, x) => s + num(x.amount), 0), loans: new Set(due.map((x) => x.loanId)).size, pending: pendingLoans },
      revisions,
    };
  }

  async glPreview(tenantId: string, runId: string, salaryPayableAccountId: string): Promise<PayrollGlLine[]> {
    const db = this.db();
    const lines = await db.payrollRunLines.findMany({ where: { tenantId, payrollRunId: runId, isOnHold: false }, select: { id: true, netAmount: true } });
    if (!lines.length) return [];
    const comps = await db.payrollRunLineComponents.findMany({ where: { tenantId, payrollLineId: { in: lines.map((l) => l.id) } }, select: { componentId: true, componentType: true, amount: true } });
    const setup = await db.salaryComponents.findMany({ where: { tenantId, id: { in: ids(comps.map((c) => c.componentId)) } }, select: { id: true, name: true, debitAccountId: true, creditAccountId: true } });
    const acc = new Map<string, { debit: number; credit: number; parts: Set<string> }>();
    const add = (accountId: string | null, side: 'debit' | 'credit', amount: number, part: string) => {
      if (!accountId || !amount) return;
      const x = acc.get(accountId) ?? { debit: 0, credit: 0, parts: new Set<string>() };
      x[side] += amount; x.parts.add(part); acc.set(accountId, x);
    };
    for (const c of comps) {
      const s = setup.find((x) => x.id === c.componentId);
      const a = num(c.amount);
      if (!s) continue;
      if (c.componentType === 'EARNING' || c.componentType === 'EMPLOYER_CONTRIBUTION') add(s.debitAccountId, 'debit', a, s.name);
      if (c.componentType === 'EMPLOYER_CONTRIBUTION' || c.componentType === 'DEDUCTION') add(s.creditAccountId, 'credit', a, s.name);
    }
    add(salaryPayableAccountId, 'credit', lines.reduce((s, l) => s + num(l.netAmount), 0), `Net pay to ${lines.length} employee${lines.length === 1 ? '' : 's'}`);
    const accounts = await db.chartOfAccounts.findMany({ where: { tenantId, id: { in: [...acc.keys()] } }, select: { id: true, code: true, name: true } });
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return [...acc.entries()]
      .map(([id, x]) => ({ account: accounts.find((a) => a.id === id) ?? { id, code: '?', name: '?' }, particulars: [...x.parts].join(' · '), debit: r2(Math.max(0, x.debit - x.credit)), credit: r2(Math.max(0, x.credit - x.debit)), detail: x.debit && x.credit ? `Debit ${r2(x.debit)} · credit ${r2(x.credit)}` : null }))
      .filter((l) => l.debit || l.credit)
      .sort((a, b) => (b.debit ? 1 : 0) - (a.debit ? 1 : 0) || a.account.code.localeCompare(b.account.code));
  }

  async overview(tenantId: string): Promise<PayrollOverview> {
    const db = this.db();
    const booked = await db.payrollRuns.findMany({ where: { tenantId, status: { in: BOOKED } }, orderBy: [{ payrollMonth: 'desc' }, { createdAt: 'desc' }], take: 60 });
    const regular = booked.filter((r) => r.runType === 'REGULAR');
    const [lastRow, prevRow] = regular;
    const [last, previous] = await this.summaries(tenantId, [lastRow, prevRow].filter((x): x is RunRow => !!x));
    const lastLines = lastRow ? await db.payrollRunLines.findMany({ where: { tenantId, payrollRunId: lastRow.id, isOnHold: false } }) : [];
    const months: PayrollOverview['monthly'] = [];
    const end = lastRow ? day(lastRow.payrollMonth)!.slice(0, 7) : new Date().toISOString().slice(0, 7);
    for (let i = 11; i >= 0; i--) {
      const [y, m] = end.split('-').map(Number) as [number, number];
      const key = new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7);
      const rs = booked.filter((r) => day(r.payrollMonth)!.startsWith(key));
      const lines = rs.length ? await db.payrollRunLines.aggregate({ where: { tenantId, payrollRunId: { in: rs.map((r) => r.id) }, isOnHold: false }, _sum: { basicAmount: true, grossAmount: true } }) : null;
      months.push({
        month: key, basic: num(lines?._sum.basicAmount), allowances: num(lines?._sum.grossAmount) - num(lines?._sum.basicAmount),
        employer: rs.reduce((s, r) => s + num(r.employerContributionAmount), 0), net: rs.reduce((s, r) => s + num(r.netAmount), 0), gross: rs.reduce((s, r) => s + num(r.grossAmount), 0),
      });
    }
    const openRow = await db.payrollRuns.findFirst({ where: { tenantId, status: { in: ['DRAFT', 'REVIEW', 'AWAITING_APPROVAL', 'APPROVED', 'POSTED'] } }, orderBy: [{ payrollMonth: 'desc' }, { createdAt: 'desc' }] });
    const openSummary = openRow ? (await this.summaries(tenantId, [openRow]))[0]! : null;
    const preparer = openRow ? (await userNames(db, tenantId, [openRow.preparedByUserId ?? openRow.createdBy])).get(openRow.preparedByUserId ?? openRow.createdBy ?? '')?.name ?? null : null;
    const depts = await db.departments.findMany({ where: { tenantId, id: { in: ids(lastLines.map((l) => l.departmentId)) } }, select: { id: true, name: true } });
    const byDept = new Map<string, { employees: number; gross: number }>();
    for (const l of lastLines) {
      const k = depts.find((d) => d.id === l.departmentId)?.name ?? 'Unassigned';
      const x = byDept.get(k) ?? { employees: 0, gross: 0 };
      x.employees++; x.gross += num(l.grossAmount); byDept.set(k, x);
    }
    const recentRows = await db.payrollRuns.findMany({ where: { tenantId, status: { not: 'CANCELLED' } }, orderBy: [{ payrollMonth: 'desc' }, { createdAt: 'desc' }], take: 6 });
    const nextBase = lastRow ? day(lastRow.payrollMonth)!.slice(0, 7) : null;
    const [ny, nm] = (nextBase ?? new Date().toISOString().slice(0, 7)).split('-').map(Number) as [number, number];
    const nextMonth = nextBase ? new Date(Date.UTC(ny, nm, 1)).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7);
    return {
      last: last ?? null, previous: previous ?? null, taxable: lastLines.filter((l) => num(l.taxAmount) > 0).length, insured: lastLines.filter((l) => num(l.eobiAmount) > 0 || num(l.employerEobiAmount) > 0).length,
      employerEobi: lastLines.reduce((s, l) => s + num(l.employerEobiAmount), 0), employeeEobi: lastLines.reduce((s, l) => s + num(l.eobiAmount), 0),
      employerPessi: lastLines.reduce((s, l) => s + num(l.employerPessiAmount), 0), employerPf: lastLines.reduce((s, l) => s + num(l.employerPfAmount), 0),
      monthly: months, open: openSummary ? { ...openSummary, preparedBy: preparer, approvalWaitingOn: null } : null, nextMonth,
      byDepartment: [...byDept.entries()].map(([department, x]) => ({ department, ...x })).sort((a, b) => b.gross - a.gross),
      recent: await this.summaries(tenantId, recentRows),
    };
  }

  async bankAdvice(tenantId: string, runId: string) {
    const db = this.db();
    const lines = await db.payrollRunLines.findMany({ where: { tenantId, payrollRunId: runId, isOnHold: false }, select: { employeeId: true, netAmount: true, payMode: true, paymentRef: true, bankName: true } });
    const [emps, banks] = await Promise.all([
      db.employees.findMany({ where: { tenantId, id: { in: lines.map((l) => l.employeeId) } }, select: { id: true, code: true, displayName: true, firstName: true, lastName: true } }),
      db.employeeBankAccounts.findMany({ where: { tenantId, employeeId: { in: lines.map((l) => l.employeeId) }, isActive: true, paymentMode: 'BANK' }, orderBy: [{ isPrimary: 'desc' }, { effectiveFrom: 'desc' }] }),
    ]);
    return lines.map((l) => {
      const e = emps.find((x) => x.id === l.employeeId);
      const b = banks.find((x) => x.employeeId === l.employeeId);
      return { code: e?.code ?? '?', name: e ? e.displayName ?? `${e.firstName} ${e.lastName ?? ''}`.trim() : '?', bankName: b?.bankName ?? l.bankName, iban: b?.iban ?? null, accountTitle: b?.accountTitle ?? null, netAmount: num(l.netAmount), payMode: l.payMode, paymentRef: l.paymentRef };
    }).sort((a, b) => a.code.localeCompare(b.code));
  }

  // ---------------------------------------------------------------- writes
  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'payrollRunAddUpdate', data);
  }

  async set(tenantId: string, id: string, data: Record<string, unknown>) {
    await this.db().payrollRuns.updateMany({ where: { tenantId, id }, data });
  }

  async refreshTotals(id: string) {
    await this.db().$executeRaw`select "Payroll"."refreshPayrollRunTotals"(${id}::uuid)`;
  }

  async setChecklist(tenantId: string, runId: string, itemKey: string, isDone: boolean, userId: string) {
    await this.db().payrollRunChecklistItems.updateMany({ where: { tenantId, payrollRunId: runId, itemKey }, data: { isDone, doneByUserId: isDone ? userId : null, doneAt: isDone ? new Date() : null } });
  }

  async pullOvertime(id: string, employeeIds: string[]) {
    const r = await this.db().$queryRaw<{ n: number }[]>`select "Payroll"."payrollRunPullOvertime"(${id}::uuid, ${employeeIds}::uuid[]) as n`;
    return Number(r[0]?.n ?? 0);
  }

  async releaseInputs(id: string, all: boolean) {
    const r = await this.db().$queryRaw<{ n: number }[]>`select "Payroll"."payrollRunReleaseInputs"(${id}::uuid, ${all}) as n`;
    return Number(r[0]?.n ?? 0);
  }

  async call(fn: 'submit' | 'approve' | 'post' | 'sendBack' | 'reject' | 'cancel' | 'reverse', id: string, text: string | null = null) {
    const db = this.db();
    if (fn === 'submit') await db.$queryRaw`select "Payroll"."payrollRunSubmit"(${id}::uuid)::text`;
    else if (fn === 'approve') await db.$queryRaw`select "Payroll"."payrollRunApprove"(${id}::uuid, ${text})::text`;
    else if (fn === 'post') await db.$queryRaw`select "Payroll"."payrollRunPost"(${id}::uuid)::text`;
    else if (fn === 'sendBack') await db.$queryRaw`select "Payroll"."payrollRunSendBack"(${id}::uuid, ${text})::text`;
    else if (fn === 'reject') await db.$queryRaw`select "Payroll"."payrollRunReject"(${id}::uuid, ${text})::text`;
    else if (fn === 'cancel') await db.$queryRaw`select "Payroll"."payrollRunCancel"(${id}::uuid, ${text})::text`;
    else await db.$queryRaw`select "Payroll"."payrollRunReverse"(${id}::uuid, ${text})::text`;
  }

  async pay(id: string, data: Record<string, unknown>) {
    const r = await this.db().$queryRaw<{ id: string }[]>`select "Payroll"."payrollRunPay"(${id}::uuid, ${JSON.stringify(data)}::jsonb)::text as id`;
    return r[0]!.id;
  }
}

/** Days and bounds of the run month (used by the service when a period is not given). */
export const periodOf = (month: string) => payrollMonthBounds(month);
