import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import {
  type MyProfile, type ProfileChangeQuery, type ProfileChangeRequest, type ProfileChangeStatus, type ProfileFieldKey,
} from '../../../../../shared/self-service/profile-change.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, employeeOfUser, employeeRefs, unknownEmp, userNames } from '../../../hr/attendance/infrastructure/hr-refs.js';
import { ProfileChangeStore, type ProfileValues } from '../application/profile-change-store.js';

type Row = {
  id: string; employeeId: string; fieldKey: string; fieldLabel: string; currentValue: string | null; requestedValue: string; reason: string | null;
  status: string; createdAt: Date; reviewedByUserId: string | null; reviewedAt: Date | null; reviewComment: string | null; appliedAt: Date | null; rowVersion: number;
};
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const ZAKAT = [{ code: 'EXEMPT', label: 'Exempt (CZ-50 filed)' }, { code: 'NOT_EXEMPT', label: 'Not exempt' }];

@Injectable()
export class PrismaProfileChangeStore extends ProfileChangeStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  async employeeOfUser(tenantId: string, userId: string) {
    return (await employeeOfUser(this.db(), tenantId, userId))?.id ?? null;
  }

  async usersOfEmployee(tenantId: string, employeeId: string) {
    const rows = await this.db().$queryRaw<{ id: string }[]>`
      select u.id::text from "Company"."Users" u
       where u."tenantId" = ${tenantId}::uuid and (u."employeeId" = ${employeeId}::uuid
          or u.id = (select e."appUserId" from "HumanResources"."Employees" e where e."tenantId" = ${tenantId}::uuid and e.id = ${employeeId}::uuid))`;
    return rows.map((r) => r.id);
  }

  async header(tenantId: string, employeeId: string): Promise<MyProfile['employee'] | null> {
    const db = this.db();
    const refs = await employeeRefs(db, tenantId, [employeeId]);
    const ref = refs.get(employeeId);
    if (!ref) return null;
    const [e] = await db.$queryRaw<{
      status: string; joiningDate: Date | null; manager: string | null; grade: string | null; employmentType: string | null; cnic: string | null; dateOfBirth: Date | null;
      gender: string | null; guardianName: string | null; workEmail: string | null; shift: string | null; emergencyContactName: string | null; emergencyRelation: string | null; emergencyPhone: string | null;
    }[]>`
      select e.status, e."joiningDate", coalesce(m."displayName", trim(m."firstName" || ' ' || coalesce(m."lastName", ''))) as manager,
             g."levelName" as grade, e."employmentType", e.cnic, e."dateOfBirth", e.gender, e."guardianName", e."workEmail"::text as "workEmail", s.name as shift,
             e."emergencyContactName", e."emergencyRelation", e."emergencyPhone"
        from "HumanResources"."Employees" e
        left join "HumanResources"."Employees" m on m."tenantId" = e."tenantId" and m.id = e."reportingManagerId"
        left join "HumanResources"."Grades" g on g."tenantId" = e."tenantId" and g.id = e."gradeId"
        left join "HumanResources"."WorkShifts" s on s."tenantId" = e."tenantId" and s.id = e."shiftId"
       where e."tenantId" = ${tenantId}::uuid and e.id = ${employeeId}::uuid`;
    if (!e) return null;
    return { ...ref, ...e, joiningDate: day(e.joiningDate), dateOfBirth: day(e.dateOfBirth) };
  }

  async values(tenantId: string, employeeId: string): Promise<ProfileValues> {
    const [v] = await this.db().$queryRaw<{
      maritalStatus: string | null; bloodGroup: string | null; personalEmail: string | null; mobile: string | null; currentAddress: string | null;
      photo: string | null; bank: string | null; iban: string | null; ntn: string | null;
    }[]>`
      select e."maritalStatus", e."bloodGroup", e."personalEmail"::text as "personalEmail", e.mobile, e."currentAddress", e."photoAttachmentId"::text as photo,
             coalesce(bk.name, ba."bankName") as bank, ba.iban, sd.ntn
        from "HumanResources"."Employees" e
        left join lateral (select * from "HumanResources"."EmployeeBankAccounts" b
                            where b."tenantId" = e."tenantId" and b."employeeId" = e.id and b."isActive"
                            order by b."isPrimary" desc, b."effectiveFrom" desc limit 1) ba on true
        left join "BankCash"."Banks" bk on bk."tenantId" = ba."tenantId" and bk.id = ba."bankId"
        left join "HumanResources"."EmployeeStatutoryDetails" sd on sd."tenantId" = e."tenantId" and sd."employeeId" = e.id
       where e."tenantId" = ${tenantId}::uuid and e.id = ${employeeId}::uuid`;
    return {
      MARITAL_STATUS: v?.maritalStatus ?? null, BLOOD_GROUP: v?.bloodGroup ?? null, PERSONAL_EMAIL: v?.personalEmail ?? null, MOBILE: v?.mobile ?? null,
      HOME_ADDRESS: v?.currentAddress ?? null, PHOTO: v?.photo ?? null, SALARY_BANK: v?.bank ?? null, ACCOUNT_NUMBER: null, IBAN: v?.iban ?? null,
      NTN_TAX_STATUS: v?.ntn ?? null, ZAKAT_EXEMPTION: null,
    };
  }

  async labels(tenantId: string) {
    const rows = await this.db().$queryRaw<{ lookupType: string; code: string; label: string }[]>`
      select l."lookupType", l.code, l.label from "Lookups"."Lookups" l
       where l."lookupType" in ('FieldKey', 'MaritalStatus', 'BloodGroup') and l."isActive" and (l."tenantId" is null or l."tenantId" = ${tenantId}::uuid)
       order by l."sortOrder", l.label`;
    const of = (t: string) => rows.filter((r) => r.lookupType === t).map((r) => ({ code: r.code, label: r.label }));
    const fields = Object.fromEntries(of('FieldKey').map((r) => [r.code, r.code === 'IBAN' ? 'IBAN' : r.label]));
    return { fields, choices: { MARITAL_STATUS: of('MaritalStatus'), BLOOD_GROUP: of('BloodGroup'), ZAKAT_EXEMPTION: ZAKAT } };
  }

  private async items(tenantId: string, rows: Row[]): Promise<ProfileChangeRequest[]> {
    const db = this.db();
    const [refs, users] = await Promise.all([employeeRefs(db, tenantId, rows.map((r) => r.employeeId)), userNames(db, tenantId, rows.map((r) => r.reviewedByUserId))]);
    return rows.map((r) => ({
      id: r.id, employee: refs.get(r.employeeId) ?? unknownEmp(r.employeeId), fieldKey: r.fieldKey as ProfileFieldKey, fieldLabel: r.fieldLabel,
      currentValue: r.currentValue, requestedValue: r.requestedValue, reason: r.reason, status: r.status as ProfileChangeStatus, createdAt: r.createdAt.toISOString(),
      reviewedBy: r.reviewedByUserId ? users.get(r.reviewedByUserId)?.name ?? null : null, reviewedAt: iso(r.reviewedAt), reviewComment: r.reviewComment,
      appliedAt: iso(r.appliedAt), rowVersion: r.rowVersion,
    }));
  }

  private select(where: Prisma.Sql, tail = Prisma.empty) {
    return this.db().$queryRaw<Row[]>`
      select r.id::text, r."employeeId"::text, r."fieldKey", r."fieldLabel", r."currentValue", r."requestedValue", r.reason, r.status, r."createdAt",
             r."reviewedByUserId"::text, r."reviewedAt", r."reviewComment", r."appliedAt", r."rowVersion"
        from "EmployeeSelfService"."ProfileChangeRequests" r
        join "HumanResources"."Employees" e on e."tenantId" = r."tenantId" and e.id = r."employeeId"
       where ${where} ${tail}`;
  }

  async list(tenantId: string, q: ProfileChangeQuery & { employeeId?: string }) {
    const s = q.search?.trim();
    const conds: Prisma.Sql[] = [Prisma.sql`r."tenantId" = ${tenantId}::uuid`];
    if (q.employeeId) conds.push(Prisma.sql`r."employeeId" = ${q.employeeId}::uuid`);
    if (s) {
      const like = `%${s}%`;
      conds.push(Prisma.sql`(e.code ilike ${like} or e."firstName" ilike ${like} or e."lastName" ilike ${like} or e."displayName" ilike ${like} or r."fieldLabel" ilike ${like})`);
    }
    const base = Prisma.join(conds, ' and ');
    const where = q.status === 'ALL' ? base : Prisma.sql`${base} and r.status = ${q.status}`;
    const db = this.db();
    const [rows, total, counts] = await Promise.all([
      this.select(where, Prisma.sql`order by r."createdAt" desc limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`),
      db.$queryRaw<{ n: number }[]>`select count(*)::int as n from "EmployeeSelfService"."ProfileChangeRequests" r join "HumanResources"."Employees" e on e."tenantId" = r."tenantId" and e.id = r."employeeId" where ${where}`,
      db.$queryRaw<{ status: string; n: number }[]>`select r.status, count(*)::int as n from "EmployeeSelfService"."ProfileChangeRequests" r join "HumanResources"."Employees" e on e."tenantId" = r."tenantId" and e.id = r."employeeId" where ${base} group by r.status`,
    ]);
    return { items: await this.items(tenantId, rows), total: total[0]?.n ?? 0, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) };
  }

  async get(tenantId: string, id: string) {
    const rows = await this.select(Prisma.sql`r."tenantId" = ${tenantId}::uuid and r.id = ${id}::uuid`);
    return rows.length ? (await this.items(tenantId, rows))[0]! : null;
  }

  async hasPending(tenantId: string, employeeId: string, fieldKey: ProfileFieldKey) {
    const rows = await this.db().$queryRaw<{ n: number }[]>`
      select count(*)::int as n from "EmployeeSelfService"."ProfileChangeRequests"
       where "tenantId" = ${tenantId}::uuid and "employeeId" = ${employeeId}::uuid and "fieldKey" = ${fieldKey} and status = 'PENDING'`;
    return (rows[0]?.n ?? 0) > 0;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'profileChangeRequestAddUpdate', data);
  }

  async setStatus(tenantId: string, id: string, rowVersion: number, status: 'WITHDRAWN' | 'REJECTED', review?: { userId: string; comment: string }) {
    const n = await this.db().$executeRaw`
      update "EmployeeSelfService"."ProfileChangeRequests"
         set status = ${status}, "reviewedByUserId" = coalesce(${review?.userId ?? null}::uuid, "reviewedByUserId"),
             "reviewedAt" = case when ${!!review} then now() else "reviewedAt" end, "reviewComment" = coalesce(${review?.comment ?? null}, "reviewComment")
       where "tenantId" = ${tenantId}::uuid and id = ${id}::uuid and status = 'PENDING' and "rowVersion" = ${rowVersion}`;
    return n === 1;
  }

  async apply(tenantId: string, employeeId: string, fieldKey: ProfileFieldKey, value: string) {
    const db = this.db();
    const emp = (column: Prisma.Sql, v: Prisma.Sql) =>
      db.$executeRaw`update "HumanResources"."Employees" set ${column} = ${v} where "tenantId" = ${tenantId}::uuid and id = ${employeeId}::uuid`;
    const bank = (set: Prisma.Sql) => db.$executeRaw`
      update "HumanResources"."EmployeeBankAccounts" b set ${set}
       where b.id = (select x.id from "HumanResources"."EmployeeBankAccounts" x where x."tenantId" = ${tenantId}::uuid and x."employeeId" = ${employeeId}::uuid and x."isActive"
                      order by x."isPrimary" desc, x."effectiveFrom" desc limit 1)`;
    switch (fieldKey) {
      case 'MARITAL_STATUS': return (await emp(Prisma.sql`"maritalStatus"`, Prisma.sql`${value}`)) === 1;
      case 'BLOOD_GROUP': return (await emp(Prisma.sql`"bloodGroup"`, Prisma.sql`${value}`)) === 1;
      case 'PERSONAL_EMAIL': return (await emp(Prisma.sql`"personalEmail"`, Prisma.sql`${value}::citext`)) === 1;
      case 'MOBILE': return (await emp(Prisma.sql`mobile`, Prisma.sql`${value}`)) === 1;
      case 'HOME_ADDRESS': return (await emp(Prisma.sql`"currentAddress"`, Prisma.sql`${value}`)) === 1;
      case 'PHOTO': return (await emp(Prisma.sql`"photoAttachmentId"`, Prisma.sql`${value}::uuid`)) === 1;
      case 'IBAN': return (await bank(Prisma.sql`iban = ${value}`)) === 1;
      case 'SALARY_BANK': return (await bank(Prisma.sql`"bankName" = ${value},
          "bankId" = (select k.id from "BankCash"."Banks" k where k."tenantId" = ${tenantId}::uuid and k."deletedAt" is null and (lower(k.name) = lower(${value}) or lower(k."shortName") = lower(${value})) limit 1)`)) === 1;
      case 'NTN_TAX_STATUS': return (await db.$executeRaw`update "HumanResources"."EmployeeStatutoryDetails" set ntn = ${value} where "tenantId" = ${tenantId}::uuid and "employeeId" = ${employeeId}::uuid`) === 1;
      // no account-number or zakat column on the employee records: HR updates these by hand
      case 'ACCOUNT_NUMBER':
      case 'ZAKAT_EXEMPTION':
        return false;
    }
    return false;
  }

  async approve(id: string, comment: string | null) {
    await this.db().$queryRaw`select "EmployeeSelfService"."profileChangeRequestApprove"(${id}::uuid, ${comment})::text`;
  }
}
