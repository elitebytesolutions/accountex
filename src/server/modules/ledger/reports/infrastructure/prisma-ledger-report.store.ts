import { Injectable } from '@nestjs/common';
import type { DayBookRow, GlRow, TrialBalanceRow } from '../../../../../shared/index.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { LedgerReportStore } from '../application/ledger-report-store.js';

type Num = { toNumber(): number } | number | string | null;
const n = (v: Num) => (v == null ? 0 : typeof v === 'object' ? v.toNumber() : Number(v));
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

@Injectable()
export class PrismaLedgerReportStore extends LedgerReportStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async trialBalance(tenantId: string, from: string, to: string, branchId: string | null, level: number): Promise<TrialBalanceRow[]> {
    const rows = await this.prisma.db().$queryRaw<Record<string, Num & string>[]>`
      select "accountId"::text, code, name, "accountClass", "className", level, kind, "openingDr", "openingCr", "movementDr", "movementCr", "closingDr", "closingCr"
        from "Accounting"."getTrialBalanceForPeriod"(${from}::date, ${to}::date, ${branchId}::uuid, ${level}::int)
       where "tenantId" = ${tenantId}::uuid
       order by code`;
    return rows.map((r) => ({
      accountId: r.accountId, code: r.code, name: r.name, accountClass: n(r.accountClass), className: r.className, level: n(r.level), kind: r.kind,
      openingDr: n(r.openingDr), openingCr: n(r.openingCr), movementDr: n(r.movementDr), movementCr: n(r.movementCr), closingDr: n(r.closingDr), closingCr: n(r.closingCr),
    }));
  }

  async generalLedger(tenantId: string, from: string, to: string, accountId: string | null, branchId: string | null): Promise<GlRow[]> {
    const rows = await this.prisma.db().$queryRaw<{ rowKind: string; accountId: string; accountCode: string; accountName: string; postingDate: Date | null; journalEntryId: string | null; docNo: string | null; voucherType: string | null; description: string | null; debit: Num; credit: Num; balance: Num; nature: string }[]>`
      select "rowKind", "accountId"::text, "accountCode", "accountName", "postingDate", "journalEntryId"::text, coalesce("displayDocNo", "docNo") as "docNo", "voucherType", description, debit, credit, balance, nature
        from "Accounting"."getGeneralLedgerForPeriod"(${from}::date, ${to}::date, ${accountId}::uuid, ${branchId}::uuid)
       where "tenantId" = ${tenantId}::uuid`;
    return rows.map((r) => ({
      rowKind: r.rowKind, accountId: r.accountId, accountCode: r.accountCode, accountName: r.accountName, postingDate: day(r.postingDate), voucherId: r.journalEntryId,
      docNo: r.docNo, voucherType: r.voucherType, description: r.description, debit: n(r.debit), credit: n(r.credit), balance: n(r.balance), nature: r.nature,
    }));
  }

  async dayBook(tenantId: string, date: string, branchId: string | null): Promise<DayBookRow[]> {
    const rows = await this.prisma.db().$queryRaw<{ id: string; docNo: string; voucherType: string; postedAt: Date | null; narration: string; by: string | null; debitAccount: string | null; debit: Num; credit: Num }[]>`
      select v.id::text, v."docNo", v."voucherType", v."postedAt", v.narration, u."fullName" as by,
             (select a.code || ' ' || a.name from "Accounting"."VoucherLines" l join "Accounting"."ChartOfAccounts" a on a.id = l."accountId"
               where l."journalEntryId" = v.id and l.debit > 0 order by l."lineNo" limit 1) as "debitAccount",
             v."totalDebit" as debit, v."totalCredit" as credit
        from "Accounting"."Vouchers" v
        left join "Company"."Users" u on u.id = v."postedByUserId"
       where v."tenantId" = ${tenantId}::uuid and v."postingDate" = ${date}::date and v.status in ('POSTED', 'REVERSED')
         and (${branchId}::uuid is null or v."branchId" = ${branchId}::uuid)
       order by v."postedAt" nulls last, v."docNo"`;
    return rows.map((r) => ({
      voucherId: r.id, docNo: r.docNo, voucherType: r.voucherType, postedAt: r.postedAt?.toISOString() ?? '', narration: r.narration, by: r.by,
      debitAccount: r.debitAccount ?? '—', debit: n(r.debit), credit: n(r.credit),
    }));
  }

  async yearStart(tenantId: string, date: string) {
    const fy = await this.prisma.db().fiscalYears.findFirst({ where: { tenantId, startDate: { lte: new Date(date) }, endDate: { gte: new Date(date) } }, select: { startDate: true } });
    return day(fy?.startDate ?? null) ?? `${date.slice(0, 7)}-01`;
  }
}
