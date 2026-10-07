import { Injectable } from '@nestjs/common';
import type { Account, AccountTemplate, Ledger, LedgerView, LedgerViewSave } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { AccountStore, type AccountChanges, type NewAccount } from '../application/account-store.js';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

@Injectable()
export class PrismaAccountStore extends AccountStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<Account[]> {
    const db = this.prisma.db();
    const [rows, branches, year, users] = await Promise.all([
      db.chartOfAccounts.findMany({ where: { tenantId, deletedAt: null }, orderBy: { code: 'asc' } }),
      db.accountBranches.findMany({ where: { tenantId }, select: { accountId: true, branchId: true } }),
      db.fiscalYears.findFirst({ where: { tenantId, startDate: { lte: new Date() }, endDate: { gte: new Date() } }, select: { startDate: true } }),
      db.users.findMany({ where: { tenantId }, select: { id: true, fullName: true } }),
    ]);
    const userName = new Map(users.map((u) => [u.id, u.fullName]));
    // Closing balances for the current fiscal year to date (0 until vouchers post).
    const from = day(year?.startDate ?? new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)))!;
    const balances = await db.$queryRaw<{ accountId: string; closing: string }[]>`
      select "accountId"::text as "accountId", "closing"::text as closing
      from "Accounting"."getAccountBalancesForPeriod"(${from}::date, current_date, null)
      where "tenantId" = ${tenantId}::uuid`;
    const bal = new Map(balances.map((b) => [b.accountId, num(b.closing)]));
    return rows.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      description: a.description,
      parentId: a.parentAccountId,
      level: a.level,
      accountClass: a.accountClass,
      nature: a.nature.trim(),
      kind: a.kind,
      subType: a.subType,
      currencyCode: a.currencyCode.trim(),
      branchIds: branches.filter((b) => b.accountId === a.id).map((b) => b.branchId),
      status: a.status,
      balance: bal.get(a.id) ?? 0,
      updatedAt: a.updatedAt.toISOString(),
      updatedByName: a.updatedBy ? (userName.get(a.updatedBy) ?? null) : null,
      rowVersion: a.rowVersion,
    }));
  }

  async get(tenantId: string, id: string) {
    return (await this.list(tenantId)).find((a) => a.id === id) ?? null;
  }

  async retiredCodes(tenantId: string) {
    const rows = await this.prisma.db().chartOfAccounts.findMany({ where: { tenantId, deletedAt: { not: null } }, select: { code: true } });
    return rows.map((r) => r.code);
  }

  async hasAny(tenantId: string) {
    return (await this.prisma.db().chartOfAccounts.count({ where: { tenantId } })) > 0;
  }

  async activeBranchIds(tenantId: string, ids: string[]) {
    const rows = await this.prisma.db().branches.findMany({ where: { tenantId, id: { in: ids }, status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async subTypeFits(subType: string, accountClass: number) {
    const row = await this.prisma.db().lookups.findFirst({
      where: { lookupType: 'AccountSubType', code: subType, isActive: true, tenantId: null },
      select: { parentCodes: true },
    });
    return !!row && (!row.parentCodes.length || row.parentCodes.includes(String(accountClass)));
  }

  create(a: NewAccount) {
    return addUpdate(this.prisma, 'accountAddUpdate', {
      code: a.code, name: a.name, description: a.description, parentAccountId: a.parentId, level: a.level, accountClass: a.accountClass,
      nature: a.nature, kind: a.kind, subType: a.subType, currencyCode: a.currencyCode, status: 'ACTIVE',
      branches: a.branchIds.map((branchId) => ({ branchId })),
    });
  }

  async update(tenantId: string, id: string, rowVersion: number, changes: AccountChanges, branchIds?: string[]) {
    const data: Record<string, unknown> = { ...changes, id, rowVersion };
    if (branchIds) {
      const current = await this.prisma.db().accountBranches.findMany({ where: { tenantId, accountId: id }, select: { id: true, branchId: true } });
      data.branches = [
        ...current.filter((b) => branchIds.includes(b.branchId)).map((b) => ({ id: b.id })),
        ...branchIds.filter((b) => !current.some((c) => c.branchId === b)).map((branchId) => ({ branchId })),
      ];
    }
    await addUpdate(this.prisma, 'accountAddUpdate', data);
  }

  async setStatus(tenantId: string, ids: string[], status: 'ACTIVE' | 'INACTIVE') {
    const { count } = await this.prisma.db().chartOfAccounts.updateMany({ where: { tenantId, id: { in: ids }, deletedAt: null, NOT: { status } }, data: { status } });
    return count;
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().chartOfAccounts.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this account. Reload and try again.');
  }

  async templates(): Promise<AccountTemplate[]> {
    const db = this.prisma.db();
    const [templates, counts] = await Promise.all([
      db.chartOfAccountsTemplates.findMany({ where: { status: { in: ['DEFAULT', 'PUBLISHED'] } }, orderBy: { name: 'asc' } }),
      db.$queryRaw<{ templateId: string; total: bigint; postable: bigint }[]>`
        select "templateId"::text as "templateId", count(*) as total, count(*) filter (where "isPostable") as postable
        from "Platform"."ChartOfAccountsTemplateAccounts" group by "templateId"`,
    ]);
    return templates.map((t) => {
      const c = counts.find((x) => x.templateId === t.id);
      return { id: t.id, code: t.code, name: t.name, description: t.description, accountCount: Number(c?.total ?? 0), postableCount: Number(c?.postable ?? 0) };
    });
  }

  async applyTemplate(templateId: string) {
    const rows = await this.prisma.db().$queryRaw<{ n: number }[]>`select "Accounting"."applyChartTemplate"(${templateId}::uuid) as n`;
    return Number(rows[0]?.n ?? 0);
  }

  async ledger(tenantId: string, account: Account, from: string, to: string): Promise<Ledger> {
    const rows = await this.prisma.db().$queryRaw<
      { rowKind: string; postingDate: Date | null; journalEntryId: string | null; displayDocNo: string | null; voucherType: string | null; description: string | null; referenceNo: string | null; debit: string; credit: string; balance: string }[]
    >`
      select "rowKind", "postingDate", "journalEntryId"::text as "journalEntryId", "displayDocNo", "voucherType", description, "referenceNo",
             debit::text as debit, credit::text as credit, balance::text as balance
      from "Accounting"."getGeneralLedgerForPeriod"(${from}::date, ${to}::date, ${account.id}::uuid, null)
      where "tenantId" = ${tenantId}::uuid`;
    const lines = rows.map((r) => ({
      rowKind: r.rowKind, postingDate: day(r.postingDate), voucherId: r.journalEntryId, docNo: r.displayDocNo, voucherType: r.voucherType,
      description: r.description, referenceNo: r.referenceNo, debit: num(r.debit), credit: num(r.credit), balance: num(r.balance),
    }));
    const opening = lines.find((l) => l.rowKind === 'OPENING')?.balance ?? 0;
    const tx = lines.filter((l) => l.rowKind !== 'OPENING' && l.rowKind !== 'CLOSING');
    const debit = tx.reduce((s, l) => s + l.debit, 0), credit = tx.reduce((s, l) => s + l.credit, 0);
    return { account, from, to, opening, debit, credit, closing: lines.find((l) => l.rowKind === 'CLOSING')?.balance ?? opening + debit - credit, lines: tx };
  }

  async ledgerViews(tenantId: string, userId: string): Promise<LedgerView[]> {
    const db = this.prisma.db();
    const [rows, users] = await Promise.all([
      db.savedLedgerViews.findMany({ where: { tenantId, OR: [{ userId }, { isShared: true }] }, orderBy: { name: 'asc' } }),
      db.users.findMany({ where: { tenantId }, select: { id: true, fullName: true } }),
    ]);
    return rows.map((v) => ({
      id: v.id, name: v.name, accountId: v.accountId, rangeLabel: v.rangeLabel, dateFrom: day(v.dateFrom), dateTo: day(v.dateTo),
      filters: (v.filters ?? {}) as Record<string, unknown>, isShared: v.isShared, isMine: v.userId === userId,
      ownerName: users.find((u) => u.id === v.userId)?.fullName ?? '—', rowVersion: v.rowVersion,
    }));
  }

  async ledgerView(tenantId: string, id: string, userId: string) {
    return (await this.ledgerViews(tenantId, userId)).find((v) => v.id === id) ?? null;
  }

  saveLedgerView(data: LedgerViewSave & { id?: string; rowVersion?: number; userId?: string }) {
    return addUpdate(this.prisma, 'savedLedgerViewAddUpdate', data);
  }

  async deleteLedgerView(tenantId: string, id: string) {
    await this.prisma.db().savedLedgerViews.deleteMany({ where: { tenantId, id } });
  }
}
