import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { StaffDirectory, type StaffMember } from '../application/staff-directory.js';

type Row = { id: string; code: string; name: string; roles: string[] | null };

/** Reads employees with plain SQL so this module doesn't depend on the HR models while Phase 11 is in progress. */
@Injectable()
export class PrismaStaffDirectory extends StaffDirectory {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async members(tenantId: string): Promise<StaffMember[]> {
    const rows = await this.prisma.db().$queryRaw<Row[]>`
      select e.id::text as id, e.code, coalesce(e."displayName", e."firstName" || ' ' || e."lastName") as name,
             array_remove(array_agg(distinct r."systemKey"), null) as roles
        from "HumanResources"."Employees" e
        left join "Company"."UserRoles" ur on ur."tenantId" = e."tenantId" and ur."userId" = e."appUserId"
        left join "Company"."Roles" r on r."tenantId" = ur."tenantId" and r.id = ur."roleId" and r."deletedAt" is null
       where e."tenantId" = ${tenantId}::uuid and e."deletedAt" is null and e.status <> 'EXITED'
       group by e.id
       order by 3`;
    return rows.map((r) => ({ ...r, roles: r.roles ?? [] }));
  }

  async byIds(tenantId: string, ids: string[]): Promise<StaffMember[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.db().$queryRaw<Row[]>`
      select e.id::text as id, e.code, coalesce(e."displayName", e."firstName" || ' ' || e."lastName") as name,
             array_remove(array_agg(distinct r."systemKey"), null) as roles
        from "HumanResources"."Employees" e
        left join "Company"."UserRoles" ur on ur."tenantId" = e."tenantId" and ur."userId" = e."appUserId"
        left join "Company"."Roles" r on r."tenantId" = ur."tenantId" and r.id = ur."roleId" and r."deletedAt" is null
       where e."tenantId" = ${tenantId}::uuid and e.id = any(${ids}::uuid[])
       group by e.id`;
    return rows.map((r) => ({ ...r, roles: r.roles ?? [] }));
  }
}
