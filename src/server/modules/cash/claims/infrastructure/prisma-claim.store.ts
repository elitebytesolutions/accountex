import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { ExpenseClaimList } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, ids, num, userRefs, voucherRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { ClaimStore, type ClaimBase } from '../application/claim-store.js';

type Row = Prisma.ExpenseClaimsGetPayload<object>;
const OPEN_STATUSES = ['PENDING', 'OVER_POLICY'];

@Injectable()
export class PrismaClaimStore extends ClaimStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, q: { status?: string; department?: string; search?: string; employeeId?: string; page: number; pageSize: number }): Promise<ExpenseClaimList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const deptEmployees = q.department ? (await db.employees.findMany({ where: { tenantId, departmentId: q.department }, select: { id: true } })).map((e) => e.id) : null;
    const base: Prisma.ExpenseClaimsWhereInput = {
      tenantId,
      ...(q.employeeId ? { employeeId: q.employeeId } : { status: { not: 'DRAFT' } }),
      ...(deptEmployees && { employeeId: { in: deptEmployees } }),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { title: { contains: s, mode: 'insensitive' } }, { merchant: { contains: s, mode: 'insensitive' } }] }),
    };
    const where: Prisma.ExpenseClaimsWhereInput = { ...base, ...(q.status && (q.status === 'PENDING' ? { status: { in: OPEN_STATUSES } } : { status: q.status })) };
    const monthStart = new Date(`${new Date().toISOString().slice(0, 7)}-01`);
    const [rows, total, byStatus, awaiting, approved, paid, over] = await Promise.all([
      db.expenseClaims.findMany({ where, orderBy: [{ submittedAt: { sort: 'desc', nulls: 'first' } }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.expenseClaims.count({ where }),
      db.expenseClaims.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.expenseClaims.aggregate({ where: { ...base, status: { in: OPEN_STATUSES } }, _sum: { totalAmount: true }, _count: { _all: true } }),
      db.expenseClaims.aggregate({ where: { ...base, status: 'APPROVED' }, _sum: { approvedAmount: true }, _count: { _all: true } }),
      db.expenseClaims.aggregate({ where: { ...base, status: 'PAID', paidAt: { gte: monthStart } }, _sum: { approvedAmount: true } }),
      db.expenseClaims.count({ where: { ...base, isOverPolicy: true, status: { in: OPEN_STATUSES } } }),
    ]);
    const counts = Object.fromEntries(byStatus.map((b) => [b.status, b._count._all]));
    const items = (await this.map(tenantId, rows, false)).map((c) => {
      const { lines, actions, ...rest } = c;
      void lines; void actions;
      return rest;
    });
    return {
      items, total, counts,
      kpis: { awaiting: awaiting._count._all, awaitingAmount: num(awaiting._sum.totalAmount), approvedUnpaid: approved._count._all, approvedUnpaidAmount: num(approved._sum.approvedAmount), paidThisMonth: num(paid._sum.approvedAmount), overPolicy: over },
    };
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().expenseClaims.findFirst({ where: { tenantId, id } });
    return row ? (await this.map(tenantId, [row], true))[0]! : null;
  }

  private async map(tenantId: string, rows: Row[], full: boolean): Promise<ClaimBase[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const [emps, branches, cats, ccs, customers, accounts, users, vouchers, prev] = await Promise.all([
      db.employees.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.employeeId)) } }, select: { id: true, code: true, displayName: true, firstName: true, lastName: true, departmentId: true } }),
      db.branches.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.branchId)) } }, select: { id: true, code: true, name: true } }),
      db.expenseCategories.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.categoryId)) } }, select: { id: true, code: true, name: true, icon: true } }),
      db.costCentres.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.costCentreId)) } }, select: { id: true, code: true, name: true } }),
      db.customers.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.customerId)) } }, select: { id: true, code: true, name: true } }),
      db.chartOfAccounts.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.chargeAccountId)) } }, select: { id: true, code: true, name: true } }),
      userRefs(db, tenantId, rows.map((r) => r.approvedByUserId)),
      voucherRefs(db, tenantId, rows.flatMap((r) => [r.approvalJournalEntryId, r.paymentJournalEntryId])),
      db.expenseClaims.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.resubmittedFromClaimId)) } }, select: { id: true, docNo: true } }),
    ]);
    const depts = await db.departments.findMany({ where: { tenantId, id: { in: ids(emps.map((e) => e.departmentId)) } }, select: { id: true, name: true } });
    const lines = full ? await db.expenseClaimLines.findMany({ where: { tenantId, claimId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const actions = full ? await db.expenseClaimActions.findMany({ where: { tenantId, claimId: { in: rows.map((r) => r.id) } }, orderBy: { actedAt: 'asc' } }) : [];
    const [lineCats, lineCcs, actors] = await Promise.all([
      db.expenseCategories.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.categoryId)) } }, select: { id: true, name: true } }),
      db.costCentres.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.costCentreId)) } }, select: { id: true, code: true, name: true } }),
      userRefs(db, tenantId, actions.map((a) => a.actorUserId)),
    ]);
    return rows.map((r) => {
      const e = emps.find((x) => x.id === r.employeeId);
      return {
        id: r.id, docNo: r.docNo, docDate: day(r.docDate)!, submittedAt: r.submittedAt?.toISOString() ?? null,
        employee: { id: r.employeeId, code: e?.code ?? '?', name: e?.displayName ?? `${e?.firstName ?? ''} ${e?.lastName ?? ''}`.trim(), department: depts.find((d) => d.id === e?.departmentId)?.name ?? null },
        branch: branches.find((b) => b.id === r.branchId) ?? { id: r.branchId, code: '?', name: '?' }, source: r.source, title: r.title, merchant: r.merchant,
        tripFrom: day(r.tripFrom), tripTo: day(r.tripTo), category: cats.find((c) => c.id === r.categoryId) ?? { id: r.categoryId, code: '?', name: '?', icon: null },
        costCentre: ccs.find((c) => c.id === r.costCentreId) ?? null, customer: customers.find((c) => c.id === r.customerId) ?? null,
        chargeAccount: accounts.find((a) => a.id === r.chargeAccountId) ?? null, travelRequestRef: r.travelRequestRef, totalAmount: num(r.totalAmount),
        approvedAmount: r.approvedAmount ? num(r.approvedAmount) : null, receiptCount: r.receiptCount, policyLimitAmount: r.policyLimitAmount ? num(r.policyLimitAmount) : null,
        policyLimitPeriod: r.policyLimitPeriod, isOverPolicy: r.isOverPolicy, policyJustification: r.policyJustification, status: r.status, workflowStage: r.workflowStage,
        approvedBy: users.get(r.approvedByUserId ?? '') ?? null, approvedAt: r.approvedAt?.toISOString() ?? null, rejectionReason: r.rejectionReason, rejectionComment: r.rejectionComment,
        allowResubmit: r.allowResubmit, resubmittedFrom: prev.find((p) => p.id === r.resubmittedFromClaimId) ?? null, paymentMethod: r.paymentMethod, paidAt: r.paidAt?.toISOString() ?? null,
        approvalVoucher: vouchers.get(r.approvalJournalEntryId ?? '') ?? null, paymentVoucher: vouchers.get(r.paymentJournalEntryId ?? '') ?? null, rowVersion: r.rowVersion,
        lines: lines.filter((l) => l.claimId === r.id).map((l) => ({
          id: l.id, lineNo: l.lineNo, expenseDate: day(l.expenseDate), description: l.description, category: lineCats.find((c) => c.id === l.categoryId) ?? null,
          merchant: l.merchant, amount: num(l.amount), costCentre: lineCcs.find((c) => c.id === l.costCentreId) ?? null,
        })),
        actions: actions.filter((a) => a.claimId === r.id).map((a) => ({ id: a.id, action: a.action, stage: a.stage, actor: actors.get(a.actorUserId ?? '') ?? null, actedAt: a.actedAt.toISOString(), comment: a.comment })),
      };
    });
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'expenseClaimAddUpdate', data);
  }

  async set(tenantId: string, id: string, data: Record<string, unknown>) {
    await this.prisma.db().expenseClaims.updateMany({ where: { tenantId, id }, data });
  }

  async addAction(tenantId: string, claimId: string, action: string, stage: string, actorUserId: string | null, comment: string | null) {
    await this.prisma.db().expenseClaimActions.create({ data: { tenantId, claimId, action, stage, actorUserId, comment, actedAt: new Date() } });
  }

  async deleteDraft(tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    await db.expenseClaimLines.deleteMany({ where: { tenantId, claimId: id } });
    const r = await db.expenseClaims.deleteMany({ where: { tenantId, id, rowVersion, status: 'DRAFT', submittedAt: null } });
    if (!r.count) throw new ConcurrencyError('Someone else changed this claim. Reload and try again.');
  }

  async employeeOf(tenantId: string, userId: string) {
    const db = this.prisma.db();
    const u = await db.users.findFirst({ where: { tenantId, id: userId }, select: { employeeId: true } });
    const e = await db.employees.findFirst({ where: { tenantId, deletedAt: null, ...(u?.employeeId ? { id: u.employeeId } : { appUserId: userId }) }, select: { id: true, branchId: true } });
    return e ? { id: e.id, branchId: e.branchId! } : null;
  }

  async usedInMonth(tenantId: string, employeeId: string, categoryId: string, date: string, exceptId: string | null) {
    const from = new Date(`${date.slice(0, 7)}-01`);
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    const r = await this.prisma.db().expenseClaims.aggregate({
      where: { tenantId, employeeId, categoryId, status: { in: ['PENDING', 'OVER_POLICY', 'APPROVED', 'PAID'] }, docDate: { gte: from, lt: to }, ...(exceptId && { id: { not: exceptId } }) },
      _sum: { totalAmount: true },
    });
    return num(r._sum.totalAmount);
  }

  async approve(id: string, comment: string | null) {
    await this.prisma.db().$queryRaw`select "BankCash"."expenseClaimApprove"(${id}::uuid, ${comment})::text`;
  }

  async pay(id: string) {
    await this.prisma.db().$queryRaw`select "BankCash"."expenseClaimPay"(${id}::uuid)::text`;
  }
}
