import { Injectable } from '@nestjs/common';
import type { PermissionModule, SeedLeaveType, SeedListKind, SeedSalaryComponent, SeedTaxCode } from '../../../../../../shared/index.js';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { ConcurrencyError } from '../../../../../core/domain/errors.js';
import { addUpdate, type AddUpdateFunction } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced, type ReferencedTable } from '../../../../../infrastructure/prisma/references.js';
import { RoleGrantStore, SeedStore } from '../application/seed-store.js';
import { readPlatformLog } from '../../infrastructure/platform-log.js';

const num = (d: Prisma.Decimal | null) => (d === null ? null : d.toNumber());
const ORDER = [{ seedVersion: 'desc' }, { sortOrder: 'asc' }] as const;
const FN: Record<SeedListKind, AddUpdateFunction> = {
  'leave-types': 'templateLeaveTypeAddUpdate',
  'salary-components': 'templateSalaryComponentAddUpdate',
  'tax-codes': 'templateTaxCodeAddUpdate',
};
const TABLE: Record<SeedListKind, ReferencedTable> = {
  'leave-types': 'templateLeaveTypes',
  'salary-components': 'templateSalaryComponents',
  'tax-codes': 'templateTaxCodes',
};

@Injectable()
export class PrismaSeedStore extends SeedStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async leaveTypes(): Promise<SeedLeaveType[]> {
    const rows = await this.prisma.db().templateLeaveTypes.findMany({ orderBy: [...ORDER, { name: 'asc' }] });
    return rows.map((r) => ({
      id: r.id, seedVersion: r.seedVersion, name: r.name, daysPerYear: r.daysPerYear.toNumber(), accrualPerMonth: num(r.accrualPerMonth),
      carryForwardMax: num(r.carryForwardMax), isPaid: r.isPaid, genderRestriction: r.genderRestriction, onceInService: r.onceInService,
      medicalCertAfterDays: r.medicalCertAfterDays, ruleNote: r.ruleNote, sortOrder: r.sortOrder, rowVersion: r.rowVersion,
    }));
  }

  async salaryComponents(): Promise<SeedSalaryComponent[]> {
    const rows = await this.prisma.db().templateSalaryComponents.findMany({ orderBy: [...ORDER, { name: 'asc' }] });
    return rows.map((r) => ({
      id: r.id, seedVersion: r.seedVersion, name: r.name, componentKind: r.componentKind, calcMethod: r.calcMethod, pctOfBasic: num(r.pctOfBasic),
      isTaxable: r.isTaxable, statutoryCode: r.statutoryCode, ruleNote: r.ruleNote, sortOrder: r.sortOrder, rowVersion: r.rowVersion,
    }));
  }

  async taxCodes(): Promise<SeedTaxCode[]> {
    const rows = await this.prisma.db().templateTaxCodes.findMany({ orderBy: [...ORDER, { code: 'asc' }] });
    return rows.map((r) => ({
      id: r.id, seedVersion: r.seedVersion, code: r.code, description: r.description, taxKind: r.taxKind, rate: num(r.rate), rateNote: r.rateNote,
      whtSection: r.whtSection, sortOrder: r.sortOrder, isActive: r.isActive, rowVersion: r.rowVersion,
    }));
  }

  save(kind: SeedListKind, data: Record<string, unknown>) {
    return addUpdate(this.prisma, FN[kind], data);
  }

  inUse(kind: SeedListKind, id: string) {
    return isReferenced(this.prisma, TABLE[kind], id);
  }

  async remove(kind: SeedListKind, id: string, rowVersion: number) {
    const db = this.prisma.db();
    const where = { id, rowVersion };
    const { count } = kind === 'leave-types' ? await db.templateLeaveTypes.deleteMany({ where })
      : kind === 'salary-components' ? await db.templateSalaryComponents.deleteMany({ where })
        : await db.templateTaxCodes.deleteMany({ where });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this row. Reload and try again.');
  }
}

@Injectable()
export class PrismaRoleGrantStore extends RoleGrantStore {
  private catalogueCache?: Promise<PermissionModule[]>;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async systemRoles() {
    const rows = await this.prisma.db().lookups.findMany({
      where: { lookupType: 'SystemKey', tenantId: null, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }], select: { code: true, label: true, isActive: true },
    });
    return rows.map((r) => ({ systemKey: r.code, label: r.label, isActive: r.isActive }));
  }

  /** Same grouping as Settings › Roles (Company.Permissions, catalogue order); read once per process. */
  catalogue(): Promise<PermissionModule[]> {
    this.catalogueCache ??= this.prisma
      .db()
      .permissions.findMany({ orderBy: [{ sortOrder: 'asc' }], select: { code: true, module: true, resource: true, resourceLabel: true, action: true } })
      .then((rows) => {
        const modules = new Map<string, Map<string, { resource: string; label: string; actions: Record<string, string> }>>();
        for (const p of rows) {
          const m = modules.get(p.module) ?? new Map();
          modules.set(p.module, m);
          const r = m.get(p.resource) ?? { resource: p.resource, label: p.resourceLabel, actions: {} };
          m.set(p.resource, r);
          r.actions[p.action] = p.code;
        }
        return [...modules].map(([module, resources]) => ({ module, resources: [...resources.values()] }));
      });
    return this.catalogueCache;
  }

  grants() {
    return this.prisma.db().systemRoleGrants.findMany({ select: { systemKey: true, permissionCode: true }, orderBy: [{ systemKey: 'asc' }, { permissionCode: 'asc' }] });
  }

  async lastChanged() {
    const rows = await this.prisma.db().$queryRaw<{ systemKey: string; at: Date }[]>`
      select l."rowData" ->> 'systemKey' as "systemKey", max(l."occurredAt") as at from "Platform"."PlatformAuditLogs" l
       where split_part(l.action, '.', 1) = 'SystemRoleGrants' and l."staffUserId" is not null group by 1`;
    return new Map(rows.map((r) => [r.systemKey, r.at.toISOString()]));
  }

  async apply(systemKey: string, add: string[], remove: string[]) {
    const db = this.prisma.db();
    if (remove.length) await db.systemRoleGrants.deleteMany({ where: { systemKey, permissionCode: { in: remove } } });
    if (add.length) await db.systemRoleGrants.createMany({ data: add.map((permissionCode) => ({ systemKey, permissionCode })), skipDuplicates: true });
  }

  history(systemKey: string, limit: number, offset: number) {
    return readPlatformLog(this.prisma, { tables: ['SystemRoleGrants'], match: { field: 'systemKey', value: systemKey }, limit, offset });
  }
}
