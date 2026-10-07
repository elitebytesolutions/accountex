import { Injectable } from '@nestjs/common';
import type { AccountMapping } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { MappingStore } from '../application/mapping-store.js';

@Injectable()
export class PrismaMappingStore extends MappingStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, all: boolean): Promise<AccountMapping[]> {
    const db = this.prisma.db();
    const [roles, maps] = await Promise.all([
      db.postingRoles.findMany({ where: all ? {} : { onSettingsScreen: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
      db.defaultAccountMappings.findMany({ where: { tenantId }, select: { role: true, accountId: true } }),
    ]);
    const accounts = await db.chartOfAccounts.findMany({ where: { tenantId, id: { in: maps.map((m) => m.accountId) } }, select: { id: true, code: true, name: true } });
    return roles.map((r) => {
      const m = maps.find((x) => x.role === r.code);
      const a = m && accounts.find((x) => x.id === m.accountId);
      return {
        role: r.code, name: r.name, roleGroup: r.roleGroup, normalBalance: r.normalBalance.trim(),
        accountId: a?.id ?? null, accountCode: a?.code ?? null, accountName: a?.name ?? null,
      };
    });
  }

  async roleExists(role: string) {
    return (await this.prisma.db().postingRoles.count({ where: { code: role } })) === 1;
  }

  async postableAccounts(tenantId: string, ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.db().chartOfAccounts.findMany({
      where: { tenantId, id: { in: ids }, kind: 'POSTABLE', status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async set(tenantId: string, role: string, accountId: string | null) {
    const db = this.prisma.db();
    const current = await db.defaultAccountMappings.findFirst({ where: { tenantId, role }, select: { id: true, accountId: true, rowVersion: true } });
    if (!accountId) {
      if (current) await db.defaultAccountMappings.deleteMany({ where: { tenantId, id: current.id } });
      return;
    }
    if (current?.accountId === accountId) return;
    await addUpdate(this.prisma, 'defaultAccountMappingAddUpdate', current ? { id: current.id, rowVersion: current.rowVersion, accountId } : { role, accountId });
  }
}
