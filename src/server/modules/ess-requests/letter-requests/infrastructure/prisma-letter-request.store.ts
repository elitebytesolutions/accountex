import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import type { LetterRequestItem, LetterRequestQuery } from '../../../../../shared/self-service/letter-request.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { employeeOfUser, tenantTimezone, todayIn } from '../../../hr/attendance/infrastructure/hr-refs.js';
import { LetterRequestStore } from '../application/letter-request-store.js';

type Row = {
  id: string; docNo: string; docDate: string; employeeId: string; empCode: string; empName: string; department: string | null; designation: string | null;
  letterType: string; letterTypeLabel: string | null; addressedTo: string; purpose: string; travelCountry: string | null; travelFrom: string | null; travelTill: string | null;
  includeSalary: boolean; responsibilities: string | null; outputFormat: string; language: string; stage: string; status: string; rejectedReason: string | null;
  dueAt: Date | null; signedByUserId: string | null; signedByName: string | null; signedAt: Date | null; referenceNo: string | null; verificationCode: string | null;
  pdfAttachmentId: string | null; hrLetterId: string | null; withdrawnAt: Date | null; createdAt: Date; rowVersion: number;
};
const iso = (d: Date | null) => (d ? d.toISOString() : null);

const SELECT = Prisma.sql`
  select r.id::text, r."docNo", r."docDate"::text as "docDate", r."employeeId"::text as "employeeId", e.code as "empCode",
         coalesce(e."displayName", trim(e."firstName" || ' ' || coalesce(e."lastName", ''))) as "empName", d.name as department, g.title as designation,
         r."letterType", lk.label as "letterTypeLabel", r."addressedTo", r.purpose, r."travelCountry", r."travelFrom"::text as "travelFrom", r."travelTill"::text as "travelTill",
         r."includeSalary", r.responsibilities, r."outputFormat", r.language, r.stage, r.status, r."rejectedReason", r."dueAt",
         r."signedByUserId"::text as "signedByUserId", u."fullName" as "signedByName", r."signedAt", r."referenceNo", r."verificationCode",
         r."pdfAttachmentId"::text as "pdfAttachmentId", r."hrLetterId"::text as "hrLetterId", r."withdrawnAt", r."createdAt", r."rowVersion"
    from "EmployeeSelfService"."LetterRequests" r
    join "HumanResources"."Employees" e on e."tenantId" = r."tenantId" and e.id = r."employeeId"
    left join "HumanResources"."Departments" d on d."tenantId" = e."tenantId" and d.id = e."departmentId"
    left join "HumanResources"."Designations" g on g."tenantId" = e."tenantId" and g.id = e."designationId"
    left join "Company"."Users" u on u."tenantId" = r."tenantId" and u.id = r."signedByUserId"
    left join "Lookups"."Lookups" lk on lk."lookupType" = 'LetterRequestLetterType' and lk.code = r."letterType" and lk."tenantId" is null`;

const toItem = (r: Row): LetterRequestItem => ({
  id: r.id, docNo: r.docNo, docDate: r.docDate,
  employee: { id: r.employeeId, code: r.empCode, name: r.empName, department: r.department, designation: r.designation },
  letterType: r.letterType, letterTypeLabel: r.letterTypeLabel ?? r.letterType, addressedTo: r.addressedTo, purpose: r.purpose,
  travelCountry: r.travelCountry, travelFrom: r.travelFrom, travelTill: r.travelTill, includeSalary: r.includeSalary, responsibilities: r.responsibilities,
  outputFormat: r.outputFormat, language: r.language, stage: r.stage, status: r.status, rejectedReason: r.rejectedReason, dueAt: iso(r.dueAt),
  signedBy: r.signedByUserId ? { id: r.signedByUserId, name: r.signedByName ?? '?' } : null, signedAt: iso(r.signedAt),
  referenceNo: r.referenceNo, verificationCode: r.verificationCode, pdfAttachmentId: r.pdfAttachmentId, hrLetterId: r.hrLetterId,
  withdrawnAt: iso(r.withdrawnAt), createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
});

@Injectable()
export class PrismaLetterRequestStore extends LetterRequestStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async employeeOfUser(tenantId: string, userId: string) {
    return (await employeeOfUser(this.prisma.db(), tenantId, userId))?.id ?? null;
  }

  async list(tenantId: string, q: LetterRequestQuery & { employeeId?: string }) {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const conds: Prisma.Sql[] = [Prisma.sql`r."tenantId" = ${tenantId}::uuid`];
    if (q.employeeId) conds.push(Prisma.sql`r."employeeId" = ${q.employeeId}::uuid`);
    if (s) {
      const like = `%${s}%`;
      conds.push(Prisma.sql`(r."docNo" ilike ${like} or r.purpose ilike ${like} or r."addressedTo" ilike ${like} or e.code ilike ${like}
        or coalesce(e."displayName", e."firstName" || ' ' || coalesce(e."lastName", '')) ilike ${like})`);
    }
    const base = Prisma.join(conds, ' and ');
    const where = q.status === 'ALL' ? base : Prisma.sql`${base} and r.status = ${q.status}`;
    const [rows, byStatus] = await Promise.all([
      db.$queryRaw<Row[]>`${SELECT} where ${where} order by r."createdAt" desc limit 200`,
      db.$queryRaw<{ status: string; n: number }[]>`select r.status, count(*)::int as n from "EmployeeSelfService"."LetterRequests" r
        join "HumanResources"."Employees" e on e."tenantId" = r."tenantId" and e.id = r."employeeId" where ${base} group by r.status`,
    ]);
    const counts = Object.fromEntries(byStatus.map((b) => [b.status, b.n]));
    const total = q.status === 'ALL' ? byStatus.reduce((n, b) => n + b.n, 0) : (counts[q.status] ?? 0);
    return { items: rows.map(toItem), total, counts };
  }

  async get(tenantId: string, id: string) {
    const rows = await this.prisma.db().$queryRaw<Row[]>`${SELECT} where r."tenantId" = ${tenantId}::uuid and r.id = ${id}::uuid`;
    return rows[0] ? toItem(rows[0]) : null;
  }

  types() {
    return this.prisma.db().$queryRaw<{ code: string; label: string }[]>`
      select code, label from "Lookups"."Lookups" where "lookupType" = 'LetterRequestLetterType' and "tenantId" is null and "isActive" order by "sortOrder", label`;
  }

  async today(tenantId: string) {
    return todayIn(await tenantTimezone(this.prisma.db(), tenantId));
  }

  /**
   * letterRequestAddUpdate leaves `status` alone, and COMPLETED must arrive with stage READY (letterRequestCompletedChk):
   * the other fields go through the save function (rowVersion check), then status and stage change in one statement.
   */
  async save(data: Record<string, unknown>) {
    const { status, ...rest } = data;
    if (status === undefined) return addUpdate(this.prisma, 'letterRequestAddUpdate', data);
    const { stage, ...fields } = rest;
    const id = await addUpdate(this.prisma, 'letterRequestAddUpdate', fields);
    await this.prisma.db().$executeRaw`update "EmployeeSelfService"."LetterRequests" set status = ${status as string}, stage = coalesce(${(stage as string | undefined) ?? null}, stage)
      where id = ${id}::uuid`;
    return id;
  }
}
