import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { GlOptions, VoucherList, VoucherListItem, VoucherListQuery } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { VoucherStore, type VoucherBase } from '../application/voucher-store.js';

type Row = Prisma.VouchersGetPayload<object>;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const ids = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

@Injectable()
export class PrismaVoucherStore extends VoucherStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, userId: string, q: VoucherListQuery): Promise<VoucherList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const amount = s && /^[\d,.]+$/.test(s) ? Number(s.replace(/,/g, '')) : null;
    const base: Prisma.VouchersWhereInput = {
      tenantId,
      ...(q.from && { postingDate: { gte: new Date(q.from), ...(q.to && { lte: new Date(q.to) }) } }),
      ...(!q.from && q.to && { postingDate: { lte: new Date(q.to) } }),
      ...(q.branch && { branchId: q.branch }), ...(q.status && { status: q.status }), ...(q.mine && { preparedByUserId: userId }),
      ...(q.minAmount && { totalDebit: { gt: q.minAmount } }),
      ...(s && { OR: [
        { docNo: { contains: s, mode: 'insensitive' } }, { narration: { contains: s, mode: 'insensitive' } }, { referenceNo: { contains: s, mode: 'insensitive' } },
        { partyName: { contains: s, mode: 'insensitive' } }, ...(amount ? [{ totalDebit: amount }] : []),
      ] }),
    };
    const where: Prisma.VouchersWhereInput = { ...base, ...(q.type && { voucherType: q.type }) };
    const [rows, total, byType, all] = await Promise.all([
      db.vouchers.findMany({ where, orderBy: [{ postingDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.vouchers.count({ where }),
      db.vouchers.groupBy({ by: ['voucherType'], where: base, _count: { _all: true } }),
      db.vouchers.groupBy({ by: ['status'], where: base, _count: { _all: true }, _sum: { totalDebit: true } }),
    ]);
    const typeCounts = Object.fromEntries(byType.map((b) => [b.voucherType, b._count._all]));
    const st = (k: string) => all.find((a) => a.status === k);
    return {
      items: await this.items(tenantId, rows), total, typeCounts,
      kpis: {
        count: all.reduce((n, a) => n + a._count._all, 0),
        totalDebit: all.filter((a) => a.status === 'POSTED' || a.status === 'REVERSED').reduce((n, a) => n + (a._sum.totalDebit?.toNumber() ?? 0), 0),
        pending: st('PENDING_APPROVAL')?._count._all ?? 0, drafts: st('DRAFT')?._count._all ?? 0,
      },
    };
  }

  private async items(tenantId: string, rows: Row[]): Promise<VoucherListItem[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const [branches, users, links, counts] = await Promise.all([
      db.branches.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.branchId)) } }, select: { id: true, code: true, name: true } }),
      db.users.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.preparedByUserId)) } }, select: { id: true, fullName: true } }),
      db.vouchers.findMany({ where: { tenantId, id: { in: ids(rows.flatMap((r) => [r.reversedById, r.reversalOfId])) } }, select: { id: true, docNo: true } }),
      db.voucherLines.groupBy({ by: ['journalEntryId'], where: { tenantId, journalEntryId: { in: rows.map((r) => r.id) } }, _count: { _all: true } }),
    ]);
    return rows.map((r) => {
      const u = users.find((x) => x.id === r.preparedByUserId);
      return {
        id: r.id, docNo: r.docNo, voucherType: r.voucherType, docDate: day(r.docDate)!, postingDate: day(r.postingDate)!, narration: r.narration, referenceNo: r.referenceNo,
        branch: branches.find((b) => b.id === r.branchId)!, totalDebit: r.totalDebit.toNumber(), totalCredit: r.totalCredit.toNumber(), status: r.status, partyName: r.partyName,
        preparedBy: u ? { id: u.id, name: u.fullName } : null, reversedBy: links.find((l) => l.id === r.reversedById)?.docNo ?? null,
        reversalOf: links.find((l) => l.id === r.reversalOfId)?.docNo ?? null, sourceDocType: r.sourceDocType, lineCount: counts.find((c) => c.journalEntryId === r.id)?._count._all ?? 0,
      };
    });
  }

  async get(tenantId: string, id: string): Promise<VoucherBase | null> {
    const db = this.prisma.db();
    const r = await db.vouchers.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    const [item] = await this.items(tenantId, [r]);
    const [lines, acts, period, rec] = await Promise.all([
      db.voucherLines.findMany({ where: { tenantId, journalEntryId: id }, orderBy: { lineNo: 'asc' } }),
      db.voucherActivities.findMany({ where: { tenantId, journalEntryId: id }, orderBy: { occurredAt: 'desc' } }),
      r.fiscalPeriodId ? db.fiscalPeriods.findFirst({ where: { tenantId, id: r.fiscalPeriodId }, select: { id: true, code: true, status: true } }) : null,
      r.recurringTemplateId ? db.recurringVoucherTemplates.findFirst({ where: { tenantId, id: r.recurringTemplateId }, select: { id: true, name: true } }) : null,
    ]);
    const [accounts, ccs, users] = await Promise.all([
      db.chartOfAccounts.findMany({ where: { tenantId, id: { in: ids([...lines.map((l) => l.accountId), r.cashBankAccountId]) } }, select: { id: true, code: true, name: true, accountClass: true } }),
      db.costCentres.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.costCentreId)) } }, select: { id: true, code: true, name: true } }),
      db.users.findMany({ where: { tenantId, id: { in: ids([...acts.map((a) => a.userId), r.approvedByUserId, r.postedByUserId]) } }, select: { id: true, fullName: true } }),
    ]);
    const who = (x: string | null) => { const u = users.find((y) => y.id === x); return u ? { id: u.id, name: u.fullName } : null; };
    const acc = (x: string | null) => { const a = accounts.find((y) => y.id === x); return a ? { id: a.id, code: a.code, name: a.name, accountClass: Number(a.accountClass) } : null; };
    return {
      ...item!,
      fiscalPeriod: period, department: r.department, currencyCode: r.currencyCode, remarks: r.remarks, tags: r.tags, cashBankAccount: acc(r.cashBankAccountId),
      instrumentType: r.instrumentType, instrumentNo: r.instrumentNo, instrumentDate: day(r.instrumentDate), autoReverseOn: day(r.autoReverseOn),
      submittedAt: r.submittedAt?.toISOString() ?? null, approvedBy: who(r.approvedByUserId), approvedAt: r.approvedAt?.toISOString() ?? null,
      postedBy: who(r.postedByUserId), postedAt: r.postedAt?.toISOString() ?? null, reversalReason: r.reversalReason, reversalRemarks: r.reversalRemarks,
      reversalDate: day(r.reversalDate), reversedById: r.reversedById, reversalOfId: r.reversalOfId, recurringTemplate: rec,
      lines: lines.map((l) => ({
        id: l.id, lineNo: l.lineNo, account: acc(l.accountId) ?? { id: l.accountId, code: '?', name: '?', accountClass: 0 }, particulars: l.particulars,
        debit: l.debit.toNumber(), credit: l.credit.toNumber(), costCentre: ccs.find((c) => c.id === l.costCentreId) ?? null, isAutoContra: l.isAutoContra,
      })),
      activities: acts.map((a) => ({ id: a.id, occurredAt: a.occurredAt.toISOString(), user: who(a.userId), action: a.action, detail: a.detail })),
      rowVersion: r.rowVersion,
    };
  }

  async options(tenantId: string): Promise<GlOptions> {
    const db = this.prisma.db();
    const [accounts, banks, cash, ccs, branches, periods, years, templates, preview] = await Promise.all([
      db.chartOfAccounts.findMany({ where: { tenantId, deletedAt: null, kind: 'POSTABLE', status: 'ACTIVE' }, select: { id: true, code: true, name: true, accountClass: true, nature: true }, orderBy: { code: 'asc' } }),
      db.bankAccounts.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, accountTitle: true, accountId: true, branchId: true, bankId: true, accountLast4: true } }),
      db.cashAccounts.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true, code: true, accountId: true, branchId: true } }),
      db.costCentres.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }] }),
      db.fiscalPeriods.findMany({ where: { tenantId }, select: { id: true, code: true, startDate: true, endDate: true, status: true, fiscalYearId: true }, orderBy: { startDate: 'asc' } }),
      db.fiscalYears.findMany({ where: { tenantId }, select: { id: true, code: true, startDate: true, endDate: true, status: true }, orderBy: { startDate: 'asc' } }),
      db.recurringVoucherTemplates.findMany({ where: { tenantId }, select: { id: true, name: true, voucherType: true }, orderBy: { name: 'asc' } }),
      db.$queryRaw<{ docType: string; preview: string }[]>`select "docType", preview from "Company"."getNumberingSeriesPreview" where "tenantId" = ${tenantId}::uuid and "branchId" is null and "isActive"`,
    ]);
    const glOf = new Map(accounts.map((a) => [a.id, a]));
    return {
      accounts: accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, accountClass: Number(a.accountClass), nature: String(a.nature) })),
      bankAccounts: banks.filter((b) => b.accountId && glOf.has(b.accountId)).map((b) => ({ id: b.accountId!, code: glOf.get(b.accountId!)!.code, name: `${b.accountTitle}${b.accountLast4 ? ` ·${b.accountLast4}` : ''}`, accountId: b.accountId!, branchId: b.branchId })),
      cashAccounts: cash.filter((c) => c.accountId && glOf.has(c.accountId)).map((c) => ({ id: c.accountId!, code: glOf.get(c.accountId!)!.code, name: c.name, accountId: c.accountId!, branchId: c.branchId })),
      costCentres: ccs, branches,
      periods: periods.map((p) => ({ id: p.id, code: p.code, startDate: day(p.startDate)!, endDate: day(p.endDate)!, status: p.status, fiscalYearId: p.fiscalYearId })),
      fiscalYears: years.map((y) => ({ id: y.id, code: y.code, startDate: day(y.startDate)!, endDate: day(y.endDate)!, status: y.status })),
      templates, nextNumbers: Object.fromEntries(preview.map((p) => [p.docType, p.preview])),
    };
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'voucherAddUpdate', data);
  }

  async setState(tenantId: string, id: string, data: Parameters<VoucherStore['setState']>[2]) {
    await this.prisma.db().vouchers.updateMany({ where: { tenantId, id }, data });
  }

  async post(id: string) {
    await this.prisma.db().$queryRaw`select "Accounting"."voucherPost"(${id}::uuid)::text`;
  }

  async reverse(id: string, date: string, reason: string, remarks: string | null) {
    const r = await this.prisma.db().$queryRaw<{ id: string }[]>`select "Accounting"."voucherReverse"(${id}::uuid, ${date}::date, ${reason}, ${remarks})::text as id`;
    return r[0]!.id;
  }

  async addActivity(tenantId: string, voucherId: string, userId: string | null, action: string, detail: string | null) {
    await this.prisma.db().voucherActivities.create({ data: { tenantId, journalEntryId: voucherId, userId, action, detail } });
  }

  async deleteDraft(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().vouchers.deleteMany({ where: { tenantId, id, rowVersion, status: 'DRAFT' } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this voucher. Reload and try again.');
  }

  async dueAutoReversals(tenantId: string, today: string) {
    const rows = await this.prisma.db().vouchers.findMany({ where: { tenantId, status: 'POSTED', autoReverseOn: { lte: new Date(today) } }, select: { id: true, autoReverseOn: true } });
    return rows.map((r) => ({ id: r.id, autoReverseOn: day(r.autoReverseOn)! }));
  }
}
