import { Injectable } from '@nestjs/common';
import type { MyPolicy, PolicyAcknowledgement } from '../../../../../shared/self-service/policy-ack.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { employeeName, employeeOfUser, employeeRefs, unknownEmp } from '../../../hr/attendance/infrastructure/hr-refs.js';
import { PolicyAckStore, type AckInsert } from '../application/policy-ack-store.js';

type AckRow = { id: string; policyDocumentId: string; employeeId: string; acknowledgedAt: Date; readToEnd: boolean; signatureText: string | null };
const ACTIVE_EMP = { deletedAt: null, status: { not: 'EXITED' } } as const;

@Injectable()
export class PrismaPolicyAckStore extends PolicyAckStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  private async toAcks(tenantId: string, rows: AckRow[]): Promise<PolicyAcknowledgement[]> {
    const refs = await employeeRefs(this.db(), tenantId, rows.map((r) => r.employeeId));
    return rows.map((r) => ({
      id: r.id, policyId: r.policyDocumentId, employee: refs.get(r.employeeId) ?? unknownEmp(r.employeeId),
      acknowledgedAt: r.acknowledgedAt.toISOString(), readToEnd: r.readToEnd, signatureText: r.signatureText,
    }));
  }

  async employeeIdOfUser(tenantId: string, userId: string) {
    return (await employeeOfUser(this.db(), tenantId, userId))?.id ?? null;
  }

  async employeeName(tenantId: string, employeeId: string) {
    const e = await this.db().employees.findFirst({ where: { tenantId, id: employeeId }, select: { displayName: true, firstName: true, lastName: true } });
    return e ? employeeName(e) : null;
  }

  async myPolicies(tenantId: string, employeeId: string): Promise<MyPolicy[]> {
    const db = this.db();
    const policies = await db.companyPolicies.findMany({ where: { tenantId, status: 'PUBLISHED', deletedAt: null }, orderBy: [{ requiresAcknowledgement: 'desc' }, { effectiveDate: 'desc' }, { code: 'asc' }] });
    if (!policies.length) return [];
    const acks = await db.$queryRaw<{ policyDocumentId: string; code: string; acknowledgedAt: Date }[]>`
      select a."policyDocumentId"::text as "policyDocumentId", p.code, a."acknowledgedAt"
        from "EmployeeSelfService"."PolicyAcknowledgements" a
        join "EmployeeSelfService"."CompanyPolicies" p on p."tenantId" = a."tenantId" and p.id = a."policyDocumentId"
       where a."tenantId" = ${tenantId}::uuid and a."employeeId" = ${employeeId}::uuid`;
    const owners = await employeeRefs(db, tenantId, policies.map((p) => p.ownerEmployeeId));
    return policies.map((p) => {
      const mine = acks.find((a) => a.policyDocumentId === p.id);
      return {
        id: p.id, code: p.code, title: p.title, version: p.version, category: p.category, effectiveDate: p.effectiveDate.toISOString().slice(0, 10),
        readMinutes: p.readMinutes, requiresAcknowledgement: p.requiresAcknowledgement, body: p.body, attachmentId: p.attachmentId,
        owner: p.ownerEmployeeId ? owners.get(p.ownerEmployeeId)?.name ?? null : null,
        acknowledgedAt: mine ? mine.acknowledgedAt.toISOString() : null,
        previousVersionAcknowledged: !mine && acks.some((a) => a.code === p.code),
      };
    });
  }

  async policy(tenantId: string, id: string) {
    return this.db().companyPolicies.findFirst({ where: { tenantId, id }, select: { id: true, code: true, title: true, version: true, status: true, requiresAcknowledgement: true, deletedAt: true } });
  }

  async acknowledgement(tenantId: string, policyId: string, employeeId: string) {
    const rows = await this.db().$queryRaw<AckRow[]>`
      select id::text, "policyDocumentId"::text as "policyDocumentId", "employeeId"::text as "employeeId", "acknowledgedAt", "readToEnd", "signatureText"
        from "EmployeeSelfService"."PolicyAcknowledgements"
       where "tenantId" = ${tenantId}::uuid and "policyDocumentId" = ${policyId}::uuid and "employeeId" = ${employeeId}::uuid`;
    return rows.length ? (await this.toAcks(tenantId, rows))[0]! : null;
  }

  async openPolicyTask(tenantId: string, employeeId: string) {
    const rows = await this.db().$queryRaw<{ id: string }[]>`
      select t.id::text
        from "HumanResources"."OnboardingTasks" t
        join "HumanResources"."Onboardings" o on o."tenantId" = t."tenantId" and o.id = t."onboardingId"
       where t."tenantId" = ${tenantId}::uuid and o."employeeId" = ${employeeId}::uuid
         and o.status in ('PRE_JOINING', 'IN_PROGRESS') and t."actionKind" = 'POLICY_ACK' and t.status not in ('COMPLETED', 'SKIPPED')
       order by t."sortOrder", t."createdAt" limit 1`;
    return rows[0]?.id ?? null;
  }

  async insert(d: AckInsert) {
    const rows = await this.db().$queryRaw<{ id: string }[]>`
      insert into "EmployeeSelfService"."PolicyAcknowledgements"
             ("tenantId", "policyDocumentId", "employeeId", "acknowledgedAt", "readToEnd", "signatureText", "ipAddress", "userAgent", "onboardingTaskId")
      values ("Company"."getCurrentTenantId"(), ${d.policyDocumentId}::uuid, ${d.employeeId}::uuid, now(), ${d.readToEnd}, ${d.signatureText},
              ${d.ipAddress}::inet, ${d.userAgent}, ${d.onboardingTaskId}::uuid)
      returning id::text`;
    return rows[0]!.id;
  }

  async completeTask(taskId: string, note: string) {
    await this.db().$queryRaw`select "HumanResources"."onboardingTaskUpdate"(${taskId}::uuid, ${JSON.stringify({ status: 'COMPLETED', completionNote: note })}::jsonb)::text`;
  }

  async acknowledgements(tenantId: string, policyId: string) {
    const rows = await this.db().$queryRaw<AckRow[]>`
      select id::text, "policyDocumentId"::text as "policyDocumentId", "employeeId"::text as "employeeId", "acknowledgedAt", "readToEnd", "signatureText"
        from "EmployeeSelfService"."PolicyAcknowledgements"
       where "tenantId" = ${tenantId}::uuid and "policyDocumentId" = ${policyId}::uuid
       order by "acknowledgedAt" desc`;
    return this.toAcks(tenantId, rows);
  }

  async pending(tenantId: string, policyId: string) {
    const db = this.db();
    const done = await db.$queryRaw<{ employeeId: string }[]>`
      select "employeeId"::text as "employeeId" from "EmployeeSelfService"."PolicyAcknowledgements"
       where "tenantId" = ${tenantId}::uuid and "policyDocumentId" = ${policyId}::uuid`;
    const emps = await db.employees.findMany({ where: { tenantId, ...ACTIVE_EMP, id: { notIn: done.map((d) => d.employeeId) } }, select: { id: true }, orderBy: { code: 'asc' } });
    const refs = await employeeRefs(db, tenantId, emps.map((e) => e.id));
    return emps.map((e) => refs.get(e.id) ?? unknownEmp(e.id));
  }

  async directReports(tenantId: string, managerEmployeeId: string) {
    const db = this.db();
    const emps = await db.employees.findMany({ where: { tenantId, ...ACTIVE_EMP, reportingManagerId: managerEmployeeId }, select: { id: true }, orderBy: { code: 'asc' } });
    const refs = await employeeRefs(db, tenantId, emps.map((e) => e.id));
    return emps.map((e) => refs.get(e.id) ?? unknownEmp(e.id));
  }

  async requiredWithAcks(tenantId: string, employeeIds: string[]) {
    const db = this.db();
    const policies = await db.companyPolicies.findMany({
      where: { tenantId, status: 'PUBLISHED', deletedAt: null, requiresAcknowledgement: true },
      select: { id: true, code: true, title: true, version: true }, orderBy: { code: 'asc' },
    });
    if (!policies.length || !employeeIds.length) return { policies, acked: new Set<string>() };
    const rows = await db.$queryRaw<{ k: string }[]>`
      select "policyDocumentId"::text || ':' || "employeeId"::text as k from "EmployeeSelfService"."PolicyAcknowledgements"
       where "tenantId" = ${tenantId}::uuid and "policyDocumentId" = any(${policies.map((p) => p.id)}::uuid[]) and "employeeId" = any(${employeeIds}::uuid[])`;
    return { policies, acked: new Set(rows.map((r) => r.k)) };
  }
}
