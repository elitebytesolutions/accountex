import { Injectable } from '@nestjs/common';
import type { PettyCashFund } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { glBalances, isReferenced } from '../../../../infrastructure/prisma/references.js';
import { PettyFundStore } from '../application/petty-fund-store.js';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

@Injectable()
export class PrismaPettyFundStore extends PettyFundStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<PettyCashFund[]> {
    const db = this.prisma.db();
    const funds = await db.pettyCashFunds.findMany({ where: { tenantId, deletedAt: null }, orderBy: { name: 'asc' } });
    if (!funds.length) return [];
    const [accounts, branches, users] = await Promise.all([
      db.cashAccounts.findMany({ where: { tenantId, id: { in: funds.map((f) => f.cashAccountId) } }, select: { id: true, code: true, name: true, accountId: true } }),
      db.branches.findMany({ where: { tenantId, id: { in: funds.map((f) => f.branchId) } }, select: { id: true, name: true } }),
      db.users.findMany({ where: { tenantId, id: { in: funds.map((f) => f.custodianUserId).filter((x): x is string => !!x) } }, select: { id: true, fullName: true } }),
    ]);
    const balances = await glBalances(this.prisma, tenantId, accounts.map((a) => a.accountId));
    return funds.map((f) => {
      const a = accounts.find((x) => x.id === f.cashAccountId)!, u = users.find((x) => x.id === f.custodianUserId);
      return {
        id: f.id, name: f.name, branch: branches.find((b) => b.id === f.branchId)!, cashAccount: { id: a.id, code: a.code, name: a.name },
        custodian: u ? { id: u.id, name: u.fullName } : null, imprestAmount: f.imprestAmount.toNumber(), lowPct: f.lowPct.toNumber(),
        criticalPct: f.criticalPct.toNumber(), cycleStartedOn: day(f.cycleStartedOn), status: f.status, balance: balances.get(a.accountId) ?? 0,
        rowVersion: f.rowVersion,
      };
    });
  }

  async accountTaken(tenantId: string, cashAccountId: string) {
    return (await this.prisma.db().pettyCashFunds.count({ where: { tenantId, cashAccountId } })) > 0;
  }

  async activeUsers(tenantId: string) {
    const rows = await this.prisma.db().users.findMany({ where: { tenantId, status: 'ACTIVE' }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } });
    return rows.map((u) => ({ id: u.id, name: u.fullName }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'pettyCashFundAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'pettyCashFunds', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().pettyCashFunds.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this fund. Reload and try again.');
  }
}
