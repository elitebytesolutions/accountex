import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { TaxDeclarationList } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { asDate, day, employeeOfUser, employeeRefs, ids, num, unknownEmp, userNames } from '../../../hr/attendance/infrastructure/hr-refs.js';
import { TaxDeclarationStore, type DeclarationQuery, type DeclarationRow } from '../application/tax-declaration-store.js';

type Row = Prisma.TaxDeclarationsGetPayload<object>;

@Injectable()
export class PrismaTaxDeclarationStore extends TaxDeclarationStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, q: DeclarationQuery): Promise<TaxDeclarationList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const matching = s ? (await db.employees.findMany({ where: { tenantId, OR: [{ code: { contains: s, mode: 'insensitive' } }, { displayName: { contains: s, mode: 'insensitive' } }, { firstName: { contains: s, mode: 'insensitive' } }] }, select: { id: true } })).map((e) => e.id) : null;
    const base: Prisma.TaxDeclarationsWhereInput = { tenantId, status: { not: 'NOT_DECLARED' }, ...(q.taxYear && { taxYear: q.taxYear }), ...(matching && { employeeId: { in: matching } }) };
    const where: Prisma.TaxDeclarationsWhereInput = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, byStatus] = await Promise.all([
      db.taxDeclarations.findMany({ where, orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.taxDeclarations.count({ where }),
      db.taxDeclarations.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);
    return { items: await this.map(tenantId, rows), total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) };
  }

  async forEmployee(tenantId: string, employeeId: string, taxYear: string) {
    return this.map(tenantId, await this.prisma.db().taxDeclarations.findMany({ where: { tenantId, employeeId, taxYear }, orderBy: { createdAt: 'asc' } }));
  }

  async get(tenantId: string, id: string) {
    const r = await this.prisma.db().taxDeclarations.findFirst({ where: { tenantId, id } });
    return r ? (await this.map(tenantId, [r]))[0]! : null;
  }

  async byProof(tenantId: string, attachmentId: string) {
    const r = await this.prisma.db().taxDeclarations.findFirst({ where: { tenantId, proofAttachmentId: attachmentId } });
    return r ? (await this.map(tenantId, [r]))[0]! : null;
  }

  private async map(tenantId: string, rows: Row[]): Promise<DeclarationRow[]> {
    const db = this.prisma.db();
    const [emps, users, files] = await Promise.all([
      employeeRefs(db, tenantId, rows.map((r) => r.employeeId)),
      userNames(db, tenantId, rows.map((r) => r.verifiedByUserId)),
      db.attachments.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.proofAttachmentId)) } }, select: { id: true, fileName: true, sizeBytes: true, contentType: true } }),
    ]);
    return rows.map((r) => {
      const f = files.find((x) => x.id === r.proofAttachmentId);
      return {
        id: r.id, employee: emps.get(r.employeeId) ?? unknownEmp(r.employeeId), taxYear: r.taxYear, declarationType: r.declarationType, itoSection: r.itoSection, reliefKind: r.reliefKind,
        amount: num(r.amount), paidTo: r.paidTo, proof: f ? { id: f.id, fileName: f.fileName, sizeBytes: Number(f.sizeBytes), contentType: f.contentType } : null,
        estimatedTaxSaving: r.estimatedTaxSaving ? num(r.estimatedTaxSaving) : null, status: r.status, submittedAt: r.submittedAt?.toISOString() ?? null,
        verifiedBy: users.get(r.verifiedByUserId ?? '') ?? null, verifiedAt: r.verifiedAt?.toISOString() ?? null, rejectionReason: r.rejectionReason,
        effectiveFromMonth: day(r.effectiveFromMonth), createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion, createdBy: r.createdBy,
      };
    });
  }

  async projectionFacts(tenantId: string, employeeId: string, taxYear: { start: string }) {
    const db = this.prisma.db();
    const today = asDate(new Date().toISOString().slice(0, 10));
    const monthStart = asDate(`${new Date().toISOString().slice(0, 7)}-01`);
    const [sal, runs] = await Promise.all([
      db.employeeSalaries.findFirst({ where: { tenantId, employeeId, effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] }, orderBy: { effectiveFrom: 'desc' } }),
      db.payrollRuns.findMany({ where: { tenantId, status: { in: ['POSTED', 'PAID'] }, payrollMonth: { gte: asDate(taxYear.start), lt: monthStart } }, select: { id: true } }),
    ]);
    const lines = await db.payrollRunLines.findMany({ where: { tenantId, employeeId, payrollRunId: { in: runs.map((r) => r.id) } }, select: { id: true, grossAmount: true, taxAmount: true } });
    const comps = await db.payrollRunLineComponents.findMany({ where: { tenantId, payrollLineId: { in: lines.map((l) => l.id) }, componentType: 'EARNING', isTaxable: true }, select: { amount: true, exemptAmount: true } });
    return {
      salary: sal ? { structureId: sal.structureId, addonStructureId: sal.addonStructureId, basicAmount: num(sal.basicAmount) } : null,
      ytdGross: lines.reduce((s, l) => s + num(l.grossAmount), 0), ytdTax: lines.reduce((s, l) => s + num(l.taxAmount), 0),
      ytdTaxable: comps.reduce((s, c) => s + num(c.amount) - num(c.exemptAmount), 0),
    };
  }

  async employeeOf(tenantId: string, userId: string) {
    const e = await employeeOfUser(this.prisma.db(), tenantId, userId);
    return e ? { id: e.id } : null;
  }

  async employeeRef(tenantId: string, employeeId: string) {
    return (await employeeRefs(this.prisma.db(), tenantId, [employeeId])).get(employeeId) ?? null;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'taxDeclarationAddUpdate', data);
  }

  async call(fn: 'submit' | 'approve' | 'reject', id: string, text: string | null = null) {
    const db = this.prisma.db();
    if (fn === 'submit') await db.$queryRaw`select "Payroll"."taxDeclarationSubmit"(${id}::uuid)::text`;
    else if (fn === 'approve') await db.$queryRaw`select "Payroll"."taxDeclarationApprove"(${id}::uuid, ${text})::text`;
    else await db.$queryRaw`select "Payroll"."taxDeclarationReject"(${id}::uuid, ${text})::text`;
  }
}
