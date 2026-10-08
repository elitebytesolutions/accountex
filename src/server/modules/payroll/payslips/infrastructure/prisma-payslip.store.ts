import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { amountInWords, payrollTaxYearOf, type MyPayslips, type Payslip, type PayslipList, type PayslipSummary, type PayslipYtd, type RunLineComponent } from '../../../../../shared/index.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { asDate, day, employeeOfUser, employeeRefs, ids, num, unknownEmp } from '../../../hr/attendance/infrastructure/hr-refs.js';
import { PayslipStore, type PayslipQuery } from '../application/payslip-store.js';

type Row = Prisma.PayslipsGetPayload<object>;
const BOOKED = ['POSTED', 'PAID'];

@Injectable()
export class PrismaPayslipStore extends PayslipStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, q: PayslipQuery): Promise<PayslipList> {
    const db = this.prisma.db();
    const runs = await db.payrollRuns.findMany({ where: { tenantId, status: { in: [...BOOKED, 'REVERSED'] } }, orderBy: [{ payrollMonth: 'desc' }, { createdAt: 'desc' }], take: 36, select: { id: true, docNo: true, payrollMonth: true, status: true, postedAt: true, paidAt: true, netAmount: true, employeeCount: true } });
    const run = (q.run ? runs.find((r) => r.id === q.run) : runs.find((r) => BOOKED.includes(r.status))) ?? runs[0] ?? null;
    if (!run) return { items: [], total: 0, counts: {}, run: null, runs: [], kpis: { generated: 0, emailed: 0, viewed: 0, noEmail: 0 } };
    const s = q.search?.trim();
    const matching = s || q.department ? (await db.employees.findMany({ where: { tenantId, ...(q.department && { departmentId: q.department }), ...(s && { OR: [{ code: { contains: s, mode: 'insensitive' } }, { displayName: { contains: s, mode: 'insensitive' } }, { firstName: { contains: s, mode: 'insensitive' } }, { lastName: { contains: s, mode: 'insensitive' } }] }) }, select: { id: true } })).map((e) => e.id) : null;
    const base: Prisma.PayslipsWhereInput = { tenantId, payrollRunId: run.id, ...(matching && { employeeId: { in: matching } }) };
    const where: Prisma.PayslipsWhereInput = { ...base, ...(q.status && (q.status === 'VIEWED' ? { viewedAt: { not: null } } : { status: q.status })) };
    const [rows, total, byStatus, viewed] = await Promise.all([
      db.payslips.findMany({ where, orderBy: { docNo: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.payslips.count({ where }),
      db.payslips.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.payslips.count({ where: { ...base, viewedAt: { not: null } } }),
    ]);
    const counts = Object.fromEntries(byStatus.map((b) => [b.status, b._count._all]));
    const generated = byStatus.reduce((sum, b) => sum + b._count._all, 0);
    return {
      items: await this.summaries(tenantId, rows), total, counts: { ...counts, VIEWED: viewed },
      run: { id: run.id, docNo: run.docNo, payrollMonth: day(run.payrollMonth)!, status: run.status, postedAt: run.postedAt?.toISOString() ?? null, paidAt: run.paidAt?.toISOString() ?? null, netAmount: num(run.netAmount), employeeCount: run.employeeCount },
      runs: runs.map((r) => ({ id: r.id, docNo: r.docNo, payrollMonth: day(r.payrollMonth)!, status: r.status })),
      kpis: { generated, emailed: (counts.EMAILED ?? 0) + (counts.VIEWED ?? 0), viewed, noEmail: (counts.NO_EMAIL ?? 0) + (counts.BOUNCED ?? 0) },
    };
  }

  private async summaries(tenantId: string, rows: Row[]): Promise<PayslipSummary[]> {
    const db = this.prisma.db();
    const [emps, runs, lines] = await Promise.all([
      employeeRefs(db, tenantId, rows.map((r) => r.employeeId)),
      db.payrollRuns.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.payrollRunId)) } }, select: { id: true, docNo: true, status: true } }),
      db.payrollRunLines.findMany({ where: { tenantId, id: { in: rows.map((r) => r.payrollLineId) } }, select: { id: true, bankName: true, ibanMasked: true, payMode: true } }),
    ]);
    return rows.map((r) => {
      const l = lines.find((x) => x.id === r.payrollLineId);
      return {
        id: r.id, docNo: r.docNo, payrollMonth: day(r.payrollMonth)!, run: runs.find((x) => x.id === r.payrollRunId) ?? { id: r.payrollRunId, docNo: '?', status: '?' },
        employee: emps.get(r.employeeId) ?? unknownEmp(r.employeeId),
        bank: l ? (l.payMode === 'BANK_TRANSFER' ? (l.bankName ? `${l.bankName}${l.ibanMasked ? ` ••${l.ibanMasked.slice(-4)}` : ''}` : 'Bank') : l.payMode === 'CASH' ? 'Cash' : 'Cheque') : null,
        grossAmount: num(r.grossAmount), deductionAmount: num(r.deductionAmount), netAmount: num(r.netAmount), status: r.status,
        publishedToEssAt: r.publishedToEssAt?.toISOString() ?? null, viewedAt: r.viewedAt?.toISOString() ?? null, emailTo: r.emailTo, holdReason: r.holdReason,
      };
    });
  }

  private async ytd(tenantId: string, employeeId: string, upTo: Date): Promise<PayslipYtd> {
    const db = this.prisma.db();
    const ty = payrollTaxYearOf(day(upTo)!);
    const runs = await db.payrollRuns.findMany({ where: { tenantId, status: { in: BOOKED }, payrollMonth: { gte: asDate(ty.start), lte: upTo } }, select: { id: true } });
    const a = await db.payrollRunLines.aggregate({
      where: { tenantId, employeeId, isOnHold: false, payrollRunId: { in: runs.map((r) => r.id) } },
      _sum: { grossAmount: true, taxAmount: true, eobiAmount: true, pfAmount: true, loanAmount: true, netAmount: true },
    });
    return { from: ty.start, to: day(upTo)!, gross: num(a._sum.grossAmount), tax: num(a._sum.taxAmount), eobi: num(a._sum.eobiAmount), pf: num(a._sum.pfAmount), loanRecovered: num(a._sum.loanAmount), net: num(a._sum.netAmount) };
  }

  async get(tenantId: string, id: string): Promise<Payslip | null> {
    const db = this.prisma.db();
    const r = await db.payslips.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    const [summary] = await this.summaries(tenantId, [r]);
    const [line, run, tenant, emp, statutory] = await Promise.all([
      db.payrollRunLines.findFirst({ where: { tenantId, id: r.payrollLineId } }),
      db.payrollRuns.findFirst({ where: { tenantId, id: r.payrollRunId }, select: { paidAt: true } }),
      db.tenants.findFirst({ where: { id: tenantId }, select: { displayName: true, legalName: true, address: true, city: true, ntn: true } }),
      db.employees.findFirst({ where: { tenantId, id: r.employeeId }, select: { cnic: true, joiningDate: true, gradeId: true, designationId: true, departmentId: true, branchId: true } }),
      db.employeeStatutoryDetails.findFirst({ where: { tenantId, employeeId: r.employeeId }, select: { eobiNo: true } }),
    ]);
    if (!line) return null;
    const [comps, grade, slab, loans, pfRuns] = await Promise.all([
      db.payrollRunLineComponents.findMany({ where: { tenantId, payrollLineId: line.id }, orderBy: { sortOrder: 'asc' } }),
      emp?.gradeId ? db.grades.findFirst({ where: { tenantId, id: emp.gradeId }, select: { code: true, levelName: true } }) : null,
      line.taxSlabId ? db.salaryTaxSlabs.findFirst({ where: { tenantId, id: line.taxSlabId } }) : null,
      db.loansAndAdvances.findMany({ where: { tenantId, employeeId: r.employeeId, status: { in: ['ACTIVE', 'SETTLEMENT'] } }, select: { approvedAmount: true, requestedAmount: true, recoveredAmount: true } }),
      db.payrollRuns.findMany({ where: { tenantId, status: { in: BOOKED }, payrollMonth: { lte: r.payrollMonth } }, select: { id: true } }),
    ]);
    const codes = await db.salaryComponents.findMany({ where: { tenantId, id: { in: ids(comps.map((c) => c.componentId)) } }, select: { id: true, code: true } });
    const pf = await db.payrollRunLines.aggregate({ where: { tenantId, employeeId: r.employeeId, payrollRunId: { in: pfRuns.map((x) => x.id) } }, _sum: { pfAmount: true, employerPfAmount: true } });
    const toComp = (c: (typeof comps)[number]): RunLineComponent => ({
      id: c.id, componentId: c.componentId, code: codes.find((x) => x.id === c.componentId)?.code ?? '?', componentType: c.componentType, label: c.label, basisText: c.basisText,
      quantity: c.quantity ? num(c.quantity) : null, rate: c.rate ? num(c.rate) : null, amount: num(c.amount), isTaxable: c.isTaxable, exemptAmount: num(c.exemptAmount),
      loanId: c.loanId, payrollInputId: c.payrollInputId, showOnPayslip: c.showOnPayslip,
    });
    const visible = comps.filter((c) => c.showOnPayslip || c.componentType !== 'EMPLOYER_CONTRIBUTION');
    const ref = summary!.employee;
    return {
      ...summary!,
      company: { name: tenant?.displayName ?? '', legalName: tenant?.legalName ?? '', address: [tenant?.address, tenant?.city].filter(Boolean).join(', ') || null, ntn: tenant?.ntn ?? null },
      employeeInfo: {
        designation: ref.designation, department: ref.department, grade: grade ? `${grade.code} · ${grade.levelName}` : null, branch: ref.branch, cnic: emp?.cnic ?? null,
        joiningDate: day(emp?.joiningDate), eobiNo: statutory?.eobiNo ?? null, taxStatus: line.taxStatus,
      },
      days: { daysInMonth: line.daysInMonth, paidDays: num(line.paidDays), lwpDays: num(line.lwpDays), leaveTakenDays: num(line.leaveTakenDays), overtimeHours: num(line.overtimeHours) },
      earnings: visible.filter((c) => c.componentType === 'EARNING').map(toComp),
      deductions: visible.filter((c) => c.componentType === 'DEDUCTION').map(toComp),
      employer: comps.filter((c) => c.componentType === 'EMPLOYER_CONTRIBUTION').map(toComp),
      amountInWords: amountInWords(num(r.netAmount)), ytd: await this.ytd(tenantId, r.employeeId, r.payrollMonth),
      tax: {
        taxYear: payrollTaxYearOf(day(r.payrollMonth)!).taxYear, projectedAnnualSalary: line.projectedAnnualSalary ? num(line.projectedAnnualSalary) : null,
        annualExemptAmount: line.annualExemptAmount ? num(line.annualExemptAmount) : null, annualTaxableIncome: line.annualTaxableIncome ? num(line.annualTaxableIncome) : null,
        annualTaxLiability: line.annualTaxLiability ? num(line.annualTaxLiability) : null, monthly: num(line.taxAmount),
        slab: slab ? `Rs ${num(slab.incomeFrom).toLocaleString('en-US')} – ${slab.incomeTo ? `Rs ${num(slab.incomeTo).toLocaleString('en-US')}` : 'above'} · ${num(slab.fixedTax) ? `Rs ${num(slab.fixedTax).toLocaleString('en-US')} + ` : ''}${num(slab.ratePercent)}% of excess` : null,
      },
      payment: {
        payMode: line.payMode, bankName: line.bankName, ibanMasked: line.ibanMasked, paymentRef: line.paymentRef, paidAt: line.paymentBatchId ? run?.paidAt?.toISOString() ?? null : null,
        loanOutstanding: loans.reduce((sum, l) => sum + num(l.approvedAmount ?? l.requestedAmount) - num(l.recoveredAmount), 0),
        pfBalance: num(pf._sum.pfAmount) + num(pf._sum.employerPfAmount),
      },
      generatedAt: r.generatedAt.toISOString(),
    };
  }

  async mine(tenantId: string, employeeId: string): Promise<MyPayslips> {
    const db = this.prisma.db();
    const rows = await db.payslips.findMany({ where: { tenantId, employeeId, publishedToEssAt: { not: null } }, orderBy: { payrollMonth: 'desc' }, take: 36 });
    const refs = await employeeRefs(db, tenantId, [employeeId]);
    return { items: await this.summaries(tenantId, rows), ytd: rows[0] ? await this.ytd(tenantId, employeeId, rows[0].payrollMonth) : null, employee: refs.get(employeeId) ?? null };
  }

  async markViewed(tenantId: string, id: string) {
    await this.prisma.db().payslips.updateMany({ where: { tenantId, id, viewedAt: null }, data: { viewedAt: new Date() } });
    await this.prisma.db().payslips.updateMany({ where: { tenantId, id, status: { in: ['GENERATED', 'EMAILED', 'NO_EMAIL'] } }, data: { status: 'VIEWED' } });
  }

  async markPrinted(tenantId: string, id: string) {
    await this.prisma.db().payslips.updateMany({ where: { tenantId, id }, data: { printedAt: new Date() } });
  }

  async employeeOf(tenantId: string, userId: string) {
    const e = await employeeOfUser(this.prisma.db(), tenantId, userId);
    return e ? { id: e.id } : null;
  }
}
