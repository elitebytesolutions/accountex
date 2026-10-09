import { Injectable } from '@nestjs/common';
import type { EmployeeLetterItem, EmployeeLetterVerification } from '../../../../../shared/index.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { asDate, day, employeeName, employeeOfUser, employeeRefs, ids, num, userNames } from '../../attendance/infrastructure/hr-refs.js';
import { EmployeeLetterStore } from '../application/letter-store.js';

const OPEN_EXIT = ['SERVING_NOTICE', 'RETENTION_TALK', 'SETTLEMENT'];

@Injectable()
export class PrismaEmployeeLetterStore extends EmployeeLetterStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  async employeeExists(tenantId: string, employeeId: string) {
    return (await this.db().employees.count({ where: { tenantId, id: employeeId, deletedAt: null } })) > 0;
  }

  private async items(tenantId: string, where: { employeeId?: string; id?: string }): Promise<(EmployeeLetterItem & { employeeId: string })[]> {
    const db = this.db();
    const rows = await db.employeeLetters.findMany({ where: { tenantId, ...where }, orderBy: [{ letterDate: 'desc' }, { letterNo: 'desc' }], take: 200 });
    const [templates, signatories, files, users] = await Promise.all([
      db.documentTemplates.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.docTemplateId)) } }, select: { id: true, name: true } }),
      employeeRefs(db, tenantId, rows.map((r) => r.signatoryEmployeeId)),
      db.attachments.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.pdfAttachmentId)) } }, select: { id: true, fileName: true, sizeBytes: true } }),
      userNames(db, tenantId, rows.map((r) => r.createdBy)),
    ]);
    return rows.map((r) => {
      const s = r.signatoryEmployeeId ? signatories.get(r.signatoryEmployeeId) : null;
      const f = files.find((x) => x.id === r.pdfAttachmentId);
      return {
        id: r.id, employeeId: r.employeeId, letterNo: r.letterNo, letterType: r.letterType, letterDate: day(r.letterDate)!, addressedTo: r.addressedTo,
        template: templates.find((t) => t.id === r.docTemplateId) ?? null, signatory: s ? { id: s.id, name: s.name, designation: s.designation } : null,
        includeSalary: r.includeSalary, status: r.status, verificationCode: r.verificationCode, pdf: f ? { id: f.id, fileName: f.fileName, sizeBytes: Number(f.sizeBytes) } : null,
        remarks: r.remarks, createdBy: users.get(r.createdBy ?? '') ?? null, createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
      };
    });
  }

  list(tenantId: string, employeeId: string) {
    return this.items(tenantId, { employeeId });
  }

  async get(tenantId: string, id: string) {
    return (await this.items(tenantId, { id }))[0] ?? null;
  }

  async options(tenantId: string) {
    const db = this.db();
    const [templates, emps] = await Promise.all([
      db.documentTemplates.findMany({ where: { tenantId, category: 'HR_LETTER', status: 'ACTIVE', deletedAt: null }, orderBy: [{ letterKind: 'asc' }, { name: 'asc' }], select: { id: true, name: true, letterKind: true, isDefault: true } }),
      db.employees.findMany({ where: { tenantId, deletedAt: null, status: { not: 'EXITED' } }, orderBy: { code: 'asc' }, select: { id: true } }),
    ]);
    const refs = await employeeRefs(db, tenantId, emps.map((e) => e.id));
    return {
      templates: templates.map((t) => ({ id: t.id, name: t.name, letterKind: t.letterKind ?? 'OTHER', isDefault: t.isDefault })),
      signatories: [...refs.values()].map((e) => ({ id: e.id, name: e.name, designation: e.designation })),
    };
  }

  async facts(tenantId: string, employeeId: string, input: { docTemplateId: string | null; letterKind: string; signatoryEmployeeId: string | null; asOf: string }) {
    const db = this.db();
    const [company, tenant, emp, refs, salary, exit, template] = await Promise.all([
      db.companySettings.findFirst({ where: { tenantId } }),
      db.tenants.findFirst({ where: { id: tenantId }, select: { displayName: true, legalName: true } }),
      db.employees.findFirst({ where: { tenantId, id: employeeId } }),
      employeeRefs(db, tenantId, [employeeId, input.signatoryEmployeeId]),
      db.employeeSalaries.findFirst({ where: { tenantId, employeeId, effectiveFrom: { lte: asDate(input.asOf) } }, orderBy: { effectiveFrom: 'desc' } }),
      db.offboardings.findFirst({ where: { tenantId, employeeId, status: { in: OPEN_EXIT } }, select: { lastWorkingDay: true } }),
      input.docTemplateId
        ? db.documentTemplates.findFirst({ where: { tenantId, id: input.docTemplateId, category: 'HR_LETTER', deletedAt: null }, select: { id: true, name: true, bodyHtml: true } })
        : db.documentTemplates.findFirst({ where: { tenantId, category: 'HR_LETTER', letterKind: input.letterKind, status: 'ACTIVE', deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }], select: { id: true, name: true, bodyHtml: true } }),
    ]);
    const me = refs.get(employeeId);
    const sig = input.signatoryEmployeeId ? refs.get(input.signatoryEmployeeId) : null;
    const name = company?.tradingName || company?.legalName || tenant?.legalName || tenant?.displayName || 'Company';
    return {
      company: { name, address: [company?.registeredAddress, company?.city].filter(Boolean).join(', ') || null, phone: company?.phone ?? null, email: company?.email ?? null, ntn: company?.ntn ?? null, accent: company?.brandPrimaryColour ?? null },
      employee: {
        id: employeeId, name: emp ? (emp.legalName ?? employeeName(emp)) : me?.name ?? '?', code: emp?.code ?? '?', cnic: emp?.cnic ?? null, designation: me?.designation ?? null, department: me?.department ?? null,
        joiningDate: day(emp?.joiningDate)!, exitDate: day(emp?.exitDate) ?? day(exit?.lastWorkingDay), noticeDays: emp?.noticeDays ?? 30, status: emp?.status ?? '?',
      },
      salary: salary ? { basic: num(salary.basicAmount), gross: num(salary.grossAmount) } : null,
      signatory: sig ? { name: sig.name, designation: sig.designation } : null,
      template: template?.bodyHtml ? { id: template.id, name: template.name, bodyHtml: template.bodyHtml } : null,
    };
  }

  async createDraft(data: Record<string, unknown>) {
    const db = this.db();
    const r = await db.$queryRaw<{ id: string }[]>`select "HumanResources"."employeeLetterAddUpdate"(${JSON.stringify(data)}::jsonb)::text as id`;
    const l = await db.employeeLetters.findFirstOrThrow({ where: { id: r[0]!.id }, select: { id: true, letterNo: true, verificationCode: true } });
    return { id: l.id, letterNo: l.letterNo, verificationCode: l.verificationCode ?? '' };
  }

  async issue(id: string, attachmentId: string) {
    await this.db().$queryRaw`select "HumanResources"."employeeLetterIssue"(${id}::uuid, ${attachmentId}::uuid)::text`;
  }

  async void(id: string, reason: string) {
    await this.db().$queryRaw`select "HumanResources"."employeeLetterVoid"(${id}::uuid, ${reason})::text`;
  }

  async verify(code: string): Promise<EmployeeLetterVerification | null> {
    const db = this.db();
    const l = await db.employeeLetters.findFirst({ where: { verificationCode: code, status: { not: 'DRAFT' } } });
    if (!l) return null;
    const [refs, company, tenant] = await Promise.all([
      employeeRefs(db, l.tenantId, [l.employeeId]),
      db.companySettings.findFirst({ where: { tenantId: l.tenantId }, select: { legalName: true, tradingName: true } }),
      db.tenants.findFirst({ where: { id: l.tenantId }, select: { displayName: true } }),
    ]);
    const e = refs.get(l.employeeId);
    return {
      valid: l.status === 'ISSUED' || l.status === 'SIGNED', status: l.status, letterNo: l.letterNo, letterType: l.letterType, letterDate: day(l.letterDate)!,
      company: company?.tradingName || company?.legalName || tenant?.displayName || '—', employeeName: e?.name ?? '—', designation: e?.designation ?? null,
    };
  }

  async byAttachment(tenantId: string, attachmentId: string) {
    return this.db().employeeLetters.findFirst({ where: { tenantId, pdfAttachmentId: attachmentId }, select: { employeeId: true } });
  }

  async employeeOfUser(tenantId: string, userId: string) {
    return (await employeeOfUser(this.db(), tenantId, userId))?.id ?? null;
  }
}
