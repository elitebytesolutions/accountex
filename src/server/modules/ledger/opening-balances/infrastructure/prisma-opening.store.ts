import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { OpeningBatch } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { OpeningStore } from '../application/opening-store.js';

const day = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class PrismaOpeningStore extends OpeningStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async forYear(tenantId: string, fiscalYearId: string): Promise<OpeningBatch | null> {
    const db = this.prisma.db();
    const row = await db.openingBalances.findFirst({ where: { tenantId, fiscalYearId }, orderBy: { createdAt: 'asc' } });
    if (row) return this.full(tenantId, row);
    const fy = await db.fiscalYears.findFirst({ where: { tenantId, id: fiscalYearId } });
    if (!fy) return null;
    const ho = await db.branches.findFirst({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }], select: { id: true, code: true, name: true } });
    return {
      id: null, fiscalYear: { id: fy.id, code: fy.code, startDate: day(fy.startDate) }, asAtDate: day(fy.startDate), branch: ho ?? { id: '', code: '', name: '' },
      suspenseAccount: null, totalDebit: 0, totalCredit: 0, difference: 0, status: 'DRAFT', voucher: null, postedAt: null, postedBy: null, remarks: null, lines: [], rowVersion: null,
    };
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().openingBalances.findFirst({ where: { tenantId, id } });
    return row ? this.full(tenantId, row) : null;
  }

  private async full(tenantId: string, r: Prisma.OpeningBalancesGetPayload<object>): Promise<OpeningBatch> {
    const db = this.prisma.db();
    const lines = await db.openingBalanceLines.findMany({ where: { tenantId, batchId: r.id } });
    const accIds = [...new Set([...lines.map((l) => l.accountId), ...(r.suspenseAccountId ? [r.suspenseAccountId] : [])])];
    const [accounts, fy, branch, voucher, user] = await Promise.all([
      db.chartOfAccounts.findMany({ where: { tenantId, id: { in: accIds } }, select: { id: true, code: true, name: true, accountClass: true } }),
      db.fiscalYears.findFirst({ where: { tenantId, id: r.fiscalYearId }, select: { id: true, code: true, startDate: true } }),
      db.branches.findFirst({ where: { tenantId, id: r.branchId }, select: { id: true, code: true, name: true } }),
      r.journalEntryId ? db.vouchers.findFirst({ where: { tenantId, id: r.journalEntryId }, select: { id: true, docNo: true } }) : null,
      r.postedByUserId ? db.users.findFirst({ where: { tenantId, id: r.postedByUserId }, select: { id: true, fullName: true } }) : null,
    ]);
    const acc = (id: string) => {
      const a = accounts.find((x) => x.id === id);
      return { id, code: a?.code ?? '?', name: a?.name ?? '?', accountClass: Number(a?.accountClass ?? 0) };
    };
    return {
      id: r.id, fiscalYear: { id: fy!.id, code: fy!.code, startDate: day(fy!.startDate) }, asAtDate: day(r.asAtDate), branch: branch!,
      suspenseAccount: r.suspenseAccountId ? acc(r.suspenseAccountId) : null, totalDebit: r.totalDebit.toNumber(), totalCredit: r.totalCredit.toNumber(),
      difference: r.difference?.toNumber() ?? 0, status: r.status, voucher, postedAt: r.postedAt?.toISOString() ?? null,
      postedBy: user ? { id: user.id, name: user.fullName } : null, remarks: r.remarks,
      lines: lines.map((l) => ({ id: l.id, account: acc(l.accountId), debit: l.debit.toNumber(), credit: l.credit.toNumber(), remarks: l.remarks }))
        .sort((a, b) => a.account.code.localeCompare(b.account.code)),
      rowVersion: r.rowVersion,
    };
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'openingBalanceAddUpdate', data);
  }

  async post(id: string) {
    const r = await this.prisma.db().$queryRaw<{ id: string }[]>`select "Accounting"."openingBalancePost"(${id}::uuid)::text as id`;
    return r[0]!.id;
  }
}
