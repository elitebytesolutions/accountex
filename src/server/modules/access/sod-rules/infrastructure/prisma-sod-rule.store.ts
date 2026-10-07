import { Injectable } from '@nestjs/common';
import type { SodRule } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { SodRuleStore } from '../application/sod-rule-store.js';

/**
 * SoD rules have no deletedAt: a custom rule is deleted outright (its row history stays). Codes of deleted custom
 * rules are taken from row history so they are never reused.
 */
@Injectable()
export class PrismaSodRuleStore extends SodRuleStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<SodRule[]> {
    const rows = await this.prisma.db().segregationOfDutiesRules.findMany({ where: { tenantId }, orderBy: [{ kind: 'asc' }, { code: 'asc' }] });
    return rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, kind: r.kind, permissionA: r.permissionA, permissionB: r.permissionB, description: r.description,
      severity: r.severity, ownerExempt: r.ownerExempt, isActive: r.isActive, isStandard: r.kind !== 'CUSTOM', rowVersion: r.rowVersion,
    }));
  }

  async retiredCodes(tenantId: string) {
    const rows = await this.prisma.db().$queryRaw<{ code: string }[]>`
      select distinct a."rowData"->>'code' as code from "Company"."AuditTrailEntries" a
       where a."tenantId" = ${tenantId}::uuid and a."tableName" = 'SegregationOfDutiesRules' and a.action = 'DELETE'`;
    return rows.map((r) => r.code);
  }

  async knownPermissions() {
    return new Set((await this.prisma.db().permissions.findMany({ select: { code: true } })).map((p) => p.code));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'segregationOfDutiesRuleAddUpdate', data);
  }

  async delete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().segregationOfDutiesRules.deleteMany({ where: { tenantId, id, rowVersion } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this rule. Reload and try again.');
  }
}
