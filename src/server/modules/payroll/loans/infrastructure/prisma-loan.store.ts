import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { LoanList } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { asDate, day, employeeOfUser, employeeRefs, ids, num, unknownEmp, userNames } from '../../../hr/attendance/infrastructure/hr-refs.js';
import { LoanStore, type LoanBase, type LoanQuery } from '../application/loan-store.js';

type Row = Prisma.LoansAndAdvancesGetPayload<object>;
const OPEN = ['PENDING', 'APPROVED', 'ACTIVE', 'SETTLEMENT'];

@Injectable()
export class PrismaLoanStore extends LoanStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, q: LoanQuery): Promise<LoanList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const matching = s ? (await db.employees.findMany({ where: { tenantId, OR: [{ code: { contains: s, mode: 'insensitive' } }, { displayName: { contains: s, mode: 'insensitive' } }, { firstName: { contains: s, mode: 'insensitive' } }, { lastName: { contains: s, mode: 'insensitive' } }] }, select: { id: true } })).map((e) => e.id) : null;
    const base: Prisma.LoansAndAdvancesWhereInput = {
      tenantId,
      ...(q.employeeId && { employeeId: q.employeeId }),
      ...(q.type && (q.type === 'ADVANCE' ? { loanType: 'SALARY_ADVANCE' } : { loanType: { in: ['LOAN', 'MEDICAL'] } })),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { employeeId: { in: matching ?? [] } }] }),
    };
    const where: Prisma.LoansAndAdvancesWhereInput = { ...base, ...(q.status && { status: q.status }) };
    const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const [rows, total, byStatus, active, pending] = await Promise.all([
      db.loansAndAdvances.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.loansAndAdvances.count({ where }),
      db.loansAndAdvances.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.loansAndAdvances.findMany({ where: { tenantId, status: 'ACTIVE', ...(q.employeeId && { employeeId: q.employeeId }) }, select: { id: true, loanType: true, approvedAmount: true, requestedAmount: true, recoveredAmount: true } }),
      db.loansAndAdvances.aggregate({ where: { tenantId, status: 'PENDING', ...(q.employeeId && { employeeId: q.employeeId }) }, _count: { _all: true }, _sum: { requestedAmount: true } }),
    ]);
    const due = await db.loanInstallments.aggregate({ where: { tenantId, loanId: { in: active.map((a) => a.id) }, status: 'SCHEDULED', dueMonth: { lte: month } }, _sum: { amount: true } });
    const items = (await this.map(tenantId, rows, false)).map((l) => { const { installments, ...rest } = l; void installments; return rest; });
    return {
      items, total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      kpis: {
        active: active.length, activeLoans: active.filter((a) => a.loanType !== 'SALARY_ADVANCE').length, activeAdvances: active.filter((a) => a.loanType === 'SALARY_ADVANCE').length,
        outstanding: active.reduce((sum, a) => sum + num(a.approvedAmount ?? a.requestedAmount) - num(a.recoveredAmount), 0), monthlyRecovery: num(due._sum.amount),
        recoveryMonth: month.toISOString().slice(0, 7), pending: pending._count._all, pendingAmount: num(pending._sum.requestedAmount),
      },
    };
  }

  async get(tenantId: string, id: string) {
    const r = await this.prisma.db().loansAndAdvances.findFirst({ where: { tenantId, id } });
    return r ? (await this.map(tenantId, [r], true))[0]! : null;
  }

  private async map(tenantId: string, rows: Row[], full: boolean): Promise<LoanBase[]> {
    const db = this.prisma.db();
    const [emps, users, banks, cash, vouchers] = await Promise.all([
      employeeRefs(db, tenantId, rows.map((r) => r.employeeId)),
      userNames(db, tenantId, rows.flatMap((r) => [r.approvedByUserId, r.createdBy])),
      db.bankAccounts.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.disbursedFromBankAccountId)) } }, select: { id: true, accountTitle: true, accountLast4: true } }),
      db.cashAccounts.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.disbursedFromCashAccountId)) } }, select: { id: true, name: true } }),
      db.vouchers.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.disbursementJournalEntryId)) } }, select: { id: true, docNo: true, status: true } }),
    ]);
    const inst = full ? await db.loanInstallments.findMany({ where: { tenantId, loanId: { in: rows.map((r) => r.id) } }, orderBy: { installmentNo: 'asc' } }) : [];
    const lines = inst.length ? await db.payrollRunLines.findMany({ where: { tenantId, id: { in: ids(inst.map((i) => i.payrollLineId)) } }, select: { id: true, payrollRunId: true } }) : [];
    const runs = lines.length ? await db.payrollRuns.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.payrollRunId)) } }, select: { id: true, docNo: true } }) : [];
    return rows.map((r) => {
      const bank = banks.find((b) => b.id === r.disbursedFromBankAccountId);
      const c = cash.find((x) => x.id === r.disbursedFromCashAccountId);
      const amount = num(r.approvedAmount ?? r.requestedAmount);
      return {
        id: r.id, docNo: r.docNo, docDate: day(r.docDate)!, employee: emps.get(r.employeeId) ?? unknownEmp(r.employeeId), loanType: r.loanType, purpose: r.purpose,
        purposeDetail: r.purposeDetail, requestChannel: r.requestChannel, requestedAmount: num(r.requestedAmount), approvedAmount: r.approvedAmount ? num(r.approvedAmount) : null,
        installmentCount: r.installmentCount, installmentAmount: num(r.installmentAmount), firstDeductionMonth: day(r.firstDeductionMonth)!, markupType: r.markupType,
        grossSalarySnapshot: r.grossSalarySnapshot ? num(r.grossSalarySnapshot) : null, installmentPctOfGross: r.installmentPctOfGross ? num(r.installmentPctOfGross) : null,
        eligibleLimitAmount: r.eligibleLimitAmount ? num(r.eligibleLimitAmount) : null, isWithinPolicy: r.isWithinPolicy, disbursementDate: day(r.disbursementDate),
        disbursedFrom: bank ? { kind: 'BANK' as const, id: bank.id, name: `${bank.accountTitle}${bank.accountLast4 ? ` — ${bank.accountLast4}` : ''}` } : c ? { kind: 'CASH' as const, id: c.id, name: c.name } : null,
        disbursementVoucher: vouchers.find((v) => v.id === r.disbursementJournalEntryId) ?? null, recoveredAmount: num(r.recoveredAmount),
        outstandingAmount: Math.round((amount - num(r.recoveredAmount)) * 100) / 100, status: r.status, decisionComment: r.decisionComment,
        approvedBy: users.get(r.approvedByUserId ?? '') ?? null, approvedAt: r.approvedAt?.toISOString() ?? null, closedAt: r.closedAt?.toISOString() ?? null,
        remarks: r.remarks, createdAt: r.createdAt.toISOString(), createdBy: users.get(r.createdBy ?? '') ?? null, rowVersion: r.rowVersion,
        installments: inst.filter((i) => i.loanId === r.id).map((i) => ({
          id: i.id, installmentNo: i.installmentNo, dueMonth: day(i.dueMonth)!, amount: num(i.amount), balanceAfter: num(i.balanceAfter), status: i.status,
          recoveredAt: i.recoveredAt?.toISOString() ?? null, payrollRun: runs.find((x) => x.id === lines.find((l) => l.id === i.payrollLineId)?.payrollRunId)?.docNo ?? null,
        })),
      };
    });
  }

  async facts(tenantId: string, employeeId: string) {
    const db = this.prisma.db();
    const today = asDate(new Date().toISOString().slice(0, 10));
    const [e, sal, loans] = await Promise.all([
      db.employees.findFirst({ where: { tenantId, id: employeeId, deletedAt: null }, select: { joiningDate: true, status: true } }),
      db.employeeSalaries.findFirst({ where: { tenantId, employeeId, effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] }, orderBy: { effectiveFrom: 'desc' } }),
      db.loansAndAdvances.findMany({ where: { tenantId, employeeId, status: { in: OPEN } }, select: { loanType: true, installmentAmount: true, status: true } }),
    ]);
    if (!e) return null;
    return {
      gross: num(sal?.grossAmount), basic: num(sal?.basicAmount), joiningDate: day(e.joiningDate), status: e.status,
      openLoans: loans.filter((l) => l.loanType !== 'SALARY_ADVANCE').length, openAdvances: loans.filter((l) => l.loanType === 'SALARY_ADVANCE').length,
      runningInstallments: loans.filter((l) => l.status === 'ACTIVE').reduce((sum, l) => sum + num(l.installmentAmount), 0),
    };
  }

  async employeeOf(tenantId: string, userId: string) {
    const e = await employeeOfUser(this.prisma.db(), tenantId, userId);
    return e ? { id: e.id } : null;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'loanAddUpdate', data);
  }

  async approve(id: string, comment: string | null) {
    await this.prisma.db().$queryRaw`select "Payroll"."loanApprove"(${id}::uuid, ${comment})::text`;
  }

  async reject(id: string, reason: string) {
    await this.prisma.db().$queryRaw`select "Payroll"."loanReject"(${id}::uuid, ${reason})::text`;
  }

  async disburse(id: string, date: string, bankAccountId: string | null, cashAccountId: string | null) {
    await this.prisma.db().$queryRaw`select "Payroll"."loanDisburseFrom"(${id}::uuid, ${date}::date, ${bankAccountId}::uuid, ${cashAccountId}::uuid)::text`;
  }

  async setApprovalRequest(tenantId: string, id: string, approvalRequestId: string) {
    await this.prisma.db().loansAndAdvances.updateMany({ where: { tenantId, id }, data: { approvalRequestId } });
  }
}
