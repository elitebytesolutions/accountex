import { Injectable } from '@nestjs/common';
import type { MovementReason } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { ReasonStore } from '../application/reason-store.js';

@Injectable()
export class PrismaReasonStore extends ReasonStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<MovementReason[]> {
    const db = this.prisma.db();
    const rows = await db.stockMovementReasons.findMany({ where: { tenantId }, orderBy: [{ direction: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }] });
    const ids = rows.map((r) => r.expenseAccountId).filter((x): x is string => !!x);
    const gl = ids.length ? await db.chartOfAccounts.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, code: true, name: true } }) : [];
    return rows.map((r) => ({
      id: r.id, direction: r.direction, code: r.code, label: r.label, hint: r.hint, icon: r.icon, ledgerMovementType: r.ledgerMovementType,
      expenseAccount: gl.find((g) => g.id === r.expenseAccountId) ?? null, isSystem: r.isSystem, sortOrder: r.sortOrder, isActive: r.isActive,
      rowVersion: r.rowVersion,
    }));
  }

  async retiredCodes(tenantId: string, direction: string) {
    const rows = await this.prisma.db().$queryRaw<{ code: string }[]>`
      select distinct a."rowData"->>'code' as code from "Company"."AuditTrailEntries" a
       where a."tenantId" = ${tenantId}::uuid and a."tableName" = 'StockMovementReasons' and a.action = 'DELETE'
         and a."rowData"->>'direction' = ${direction}`;
    return rows.map((r) => r.code);
  }

  expenseAccounts(tenantId: string) {
    return this.prisma.db().chartOfAccounts.findMany({
      where: { tenantId, kind: 'POSTABLE', status: 'ACTIVE', deletedAt: null, accountClass: 5 }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' },
    });
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'stockMovementReasonAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'stockMovementReasons', id);
  }

  async delete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().stockMovementReasons.deleteMany({ where: { tenantId, id, rowVersion, isSystem: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this reason. Reload and try again.');
  }
}
