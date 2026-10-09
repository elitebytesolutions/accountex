import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import type {
  FbrBacklog, FbrConnectionEvent, FbrSubmission, FbrSubmissionList, FbrSubmissionQuery, SalesTaxReturn, SalesTaxReturnLine, SalesTaxReturnList,
  SalesTaxReturnQuery, WhtCertificate, WhtCertificateList, WhtCertificateQuery, WhtChallan, WhtDeduction, WhtDeductionInput, WhtDeductionList, WhtQuery,
  WhtStatement,
} from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, ids, num, userRefs, voucherRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import type { FbrDocument, FbrSendResult } from '../../fbr/application/fbr-gateway.js';
import { TaxStore, type DueSubmission, type FbrTenantConfig, type ReturnFacts, type TaxOptions, type WhtSectionRow } from '../application/tax-store.js';

type Db = Prisma.TransactionClient;
const d = (v: string) => new Date(`${v}T00:00:00Z`);
const nd = (v: Prisma.Decimal | null | undefined) => (v === null || v === undefined ? null : v.toNumber());
const empName = (e: { displayName: string | null; firstName: string; lastName: string | null }) => e.displayName ?? [e.firstName, e.lastName].filter(Boolean).join(' ');
const OPEN_SUB = ['PENDING', 'FAILED'];

async function bankNames(db: Db, tenantId: string, xs: (string | null)[]) {
  const rows = ids(xs).length ? await db.bankAccounts.findMany({ where: { tenantId, id: { in: ids(xs) } }, select: { id: true, accountTitle: true, accountLast4: true } }) : [];
  return new Map(rows.map((r) => [r.id, { id: r.id, name: `${r.accountTitle}${r.accountLast4 ? ` — ${r.accountLast4}` : ''}` }]));
}
async function partyRefs(db: Db, tenantId: string, vendorIds: (string | null)[], customerIds: (string | null)[], employeeIds: (string | null)[]) {
  const [v, c, e] = await Promise.all([
    ids(vendorIds).length ? db.vendors.findMany({ where: { tenantId, id: { in: ids(vendorIds) } }, select: { id: true, name: true } }) : [],
    ids(customerIds).length ? db.customers.findMany({ where: { tenantId, id: { in: ids(customerIds) } }, select: { id: true, name: true, displayName: true } }) : [],
    ids(employeeIds).length ? db.employees.findMany({ where: { tenantId, id: { in: ids(employeeIds) } }, select: { id: true, displayName: true, firstName: true, lastName: true } }) : [],
  ]);
  return {
    vendor: (id: string | null) => (id ? (v.find((x) => x.id === id) ?? null) : null),
    customer: (id: string | null) => { const x = id ? c.find((y) => y.id === id) : null; return x ? { id: x.id, name: x.displayName ?? x.name } : null; },
    employee: (id: string | null) => { const x = id ? e.find((y) => y.id === id) : null; return x ? { id: x.id, name: empName(x) } : null; },
  };
}

@Injectable()
export class PrismaTaxStore extends TaxStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private fn(sql: string, ...args: unknown[]) {
    return this.prisma.db().$queryRawUnsafe<Record<string, unknown>[]>(sql, ...args);
  }

  // ---------------------------------------------------------------- options
  async options(tenantId: string): Promise<TaxOptions> {
    const db = this.prisma.db();
    const [banks, lookups, used, vendors, customers, employees, cs] = await Promise.all([
      db.bankAccounts.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, accountTitle: true, accountLast4: true }, orderBy: { accountTitle: 'asc' } }),
      db.lookups.findMany({ where: { tenantId: null, lookupType: { in: ['DefaultWhtSection', 'WhtSection'] }, isActive: true }, select: { lookupType: true, code: true, label: true }, orderBy: { sortOrder: 'asc' } }),
      db.whtDeductions.findMany({ where: { tenantId }, distinct: ['whtSection'], select: { whtSection: true } }),
      db.vendors.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true, ntn: true, cnic: true }, orderBy: { name: 'asc' }, take: 2000 }),
      db.customers.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true, displayName: true, ntn: true, cnic: true }, orderBy: { name: 'asc' }, take: 2000 }),
      db.employees.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, displayName: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' }, take: 2000 }),
      db.companySettings.findFirst({ where: { tenantId }, select: { ntn: true, strn: true, legalName: true, tradingName: true } }),
    ]);
    const sections = new Map<string, string>();
    for (const l of lookups.filter((x) => x.lookupType === 'DefaultWhtSection')) sections.set(l.code, l.label);
    for (const l of lookups.filter((x) => x.lookupType === 'WhtSection')) if (!sections.has(l.code)) sections.set(l.code, l.label);
    for (const s of ['149', '155', '236G', '236H']) if (!sections.has(s)) sections.set(s, s === '149' ? '149 — salary' : s === '155' ? '155 — rent' : `${s} — collected on sales`);
    for (const u of used) if (!sections.has(u.whtSection)) sections.set(u.whtSection, u.whtSection);
    return {
      bankAccounts: banks.map((b) => ({ id: b.id, name: `${b.accountTitle}${b.accountLast4 ? ` — ${b.accountLast4}` : ''}` })),
      sections: [...sections].map(([code, label]) => ({ code, label })),
      vendors: vendors.map((v) => ({ id: v.id, name: v.name, ntnCnic: v.ntn ?? v.cnic })),
      customers: customers.map((c) => ({ id: c.id, name: c.displayName ?? c.name, ntnCnic: c.ntn ?? c.cnic })),
      employees: employees.map((e) => ({ id: e.id, name: empName(e) })),
      ntn: cs?.ntn ?? null, strn: cs?.strn ?? null, companyName: cs?.legalName ?? cs?.tradingName ?? null,
    };
  }

  // ---------------------------------------------------------------- sales tax returns
  private async mapReturns(tenantId: string, rows: Prisma.SalesTaxReturnsGetPayload<object>[]): Promise<SalesTaxReturn[]> {
    const db = this.prisma.db();
    const [users, banks, vouchers] = await Promise.all([
      userRefs(db, tenantId, rows.map((r) => r.filedByUserId)), bankNames(db, tenantId, rows.map((r) => r.paidFromBankAccountId)), voucherRefs(db, tenantId, rows.map((r) => r.paymentJournalEntryId)),
    ]);
    return rows.map((r) => {
      const v = r.paymentJournalEntryId ? vouchers.get(r.paymentJournalEntryId) : null;
      return {
        id: r.id, docNo: r.docNo, authority: r.authority, periodMonth: day(r.periodMonth)!, revisionNo: r.revisionNo, strn: r.strn, dueDate: day(r.dueDate)!,
        outputTax: num(r.outputTax), furtherTax: num(r.furtherTax), totalOutputTax: num(r.totalOutputTax), inputTax: num(r.inputTax),
        inadmissibleInput: num(r.inadmissibleInput), admissibleInputTax: num(r.admissibleInputTax), carryForwardIn: num(r.carryForwardIn),
        netPayable: num(r.netPayable), inputCapPct: num(r.inputCapPct), annexCCount: r.annexCCount, annexACount: r.annexACount,
        excludeUnmatchedInput: r.excludeUnmatchedInput, status: r.status, filedOn: day(r.filedOn), filedBy: users.get(r.filedByUserId ?? '') ?? null,
        cprNo: r.cprNo, paidOn: day(r.paidOn), paidAmount: nd(r.paidAmount), paidFrom: banks.get(r.paidFromBankAccountId ?? '') ?? null,
        paymentJournal: v ? { id: v.id, docNo: v.docNo } : null, remarks: r.remarks,
        createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), rowVersion: r.rowVersion,
      };
    });
  }

  async listReturns(tenantId: string, q: SalesTaxReturnQuery): Promise<SalesTaxReturnList> {
    const db = this.prisma.db();
    const where: Prisma.SalesTaxReturnsWhereInput = { tenantId, ...(q.authority && { authority: q.authority }), ...(q.status && { status: q.status }) };
    const [rows, total] = await Promise.all([
      db.salesTaxReturns.findMany({ where, orderBy: [{ periodMonth: 'desc' }, { revisionNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.salesTaxReturns.count({ where }),
    ]);
    return { items: await this.mapReturns(tenantId, rows), total };
  }

  async getReturn(tenantId: string, id: string) {
    const db = this.prisma.db();
    const row = await db.salesTaxReturns.findFirst({ where: { tenantId, id } });
    if (!row) return null;
    const lines = await db.salesTaxReturnLines.findMany({ where: { tenantId, returnId: id }, orderBy: [{ annex: 'asc' }, { lineNo: 'asc' }] });
    return {
      ...(await this.mapReturns(tenantId, [row]))[0]!,
      lines: lines.map((l): SalesTaxReturnLine => ({
        id: l.id, annex: l.annex as SalesTaxReturnLine['annex'], lineNo: l.lineNo, party: l.partyName, partyNtnCnic: l.partyNtnCnic, partyStrn: l.partyStrn,
        isRegistered: l.isRegistered,
        document: l.invoiceId ? { id: l.invoiceId, kind: 'INVOICE', no: l.documentNo } : l.creditNoteId ? { id: l.creditNoteId, kind: 'CREDIT_NOTE', no: l.documentNo }
          : l.billId ? { id: l.billId, kind: 'BILL', no: l.documentNo } : l.debitNoteId ? { id: l.debitNoteId, kind: 'DEBIT_NOTE', no: l.documentNo } : null,
        documentDate: day(l.documentDate), taxRate: nd(l.taxRate), valueExclTax: num(l.valueExclTax), salesTax: num(l.salesTax), furtherTax: num(l.furtherTax),
        matchStatus: l.matchStatus, isAdmissible: l.isAdmissible, rowVersion: l.rowVersion,
      })),
    };
  }

  async returnFacts(tenantId: string, r: SalesTaxReturn): Promise<ReturnFacts> {
    const db = this.prisma.db();
    const from = d(r.periodMonth);
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
    const [missing, unm, first, ftInv, gl, fbr] = await Promise.all([
      db.salesTaxReturnLines.count({ where: { tenantId, returnId: r.id, annex: 'C', partyNtnCnic: null } }),
      db.salesTaxReturnLines.aggregate({ where: { tenantId, returnId: r.id, annex: 'A', matchStatus: 'UNMATCHED' }, _count: true, _sum: { salesTax: true } }),
      db.salesTaxReturnLines.findFirst({ where: { tenantId, returnId: r.id, annex: 'A', matchStatus: 'UNMATCHED' }, orderBy: { salesTax: 'desc' } }),
      db.salesTaxReturnLines.count({ where: { tenantId, returnId: r.id, annex: 'C', furtherTax: { gt: 0 } } }),
      this.prisma.db().$queryRaw<{ amt: Prisma.Decimal | null; mapped: boolean }[]>`
        select (select sum(l.credit - l.debit) from "Accounting"."VoucherLines" l
                  join "Accounting"."Vouchers" v on v."tenantId" = l."tenantId" and v.id = l."journalEntryId"
                 where l."tenantId" = ${tenantId}::uuid and v.status = 'POSTED' and v."docDate" between ${from} and ${to}
                   and l."accountId" in (select m."accountId" from "Company"."DefaultAccountMappings" m where m."tenantId" = ${tenantId}::uuid and m.role = 'OUTPUT_GST')) as amt,
               exists (select 1 from "Company"."DefaultAccountMappings" m where m."tenantId" = ${tenantId}::uuid and m.role = 'OUTPUT_GST' and m."accountId" is not null) as mapped`,
      this.prisma.db().$queryRaw<{ reported: bigint; required: bigint }[]>`
        select count(*) filter (where f.status = 'ACCEPTED') as reported, count(*) filter (where f.status <> 'SKIPPED') as required
          from "Sales"."SalesInvoices" i join "Tax"."FbrInvoiceSubmissions" f on f."tenantId" = i."tenantId" and f."invoiceId" = i.id
         where i."tenantId" = ${tenantId}::uuid and i."docDate" between ${from} and ${to} and i.status in ('POSTED','PARTIALLY_PAID','PAID')`,
    ]);
    return {
      annexCMissingTaxId: missing,
      glOutputTax: gl[0]?.mapped ? Number(gl[0].amt ?? 0) : null,
      unmatched: { count: unm._count, tax: num(unm._sum.salesTax), first: first ? { party: first.partyName, documentNo: first.documentNo, tax: num(first.salesTax) } : null },
      furtherTaxInvoices: ftInv,
      fbrReported: Number(fbr[0]?.reported ?? 0),
      fbrRequired: Number(fbr[0]?.required ?? 0),
    };
  }

  async prepareReturn(periodMonth: string, authority: string) {
    const rows = await this.fn('select "Tax"."salesTaxReturnPrepare"($1::date, $2)::text as id', periodMonth, authority);
    return rows[0]!.id as string;
  }

  async saveReturnDraft(tenantId: string, id: string, rowVersion: number, data: { remarks?: string | null; excludeUnmatchedInput?: boolean }) {
    const n = await this.prisma.db().salesTaxReturns.updateMany({
      where: { tenantId, id, rowVersion, status: { in: ['DRAFT', 'VALIDATED'] } },
      data: { ...(data.remarks !== undefined && { remarks: data.remarks }), ...(data.excludeUnmatchedInput !== undefined && { excludeUnmatchedInput: data.excludeUnmatchedInput }), status: 'DRAFT' },
    });
    return n.count > 0;
  }

  async setUnmatched(tenantId: string, returnId: string, unmatchedLineIds: string[]) {
    const db = this.prisma.db();
    await db.salesTaxReturnLines.updateMany({ where: { tenantId, returnId, annex: 'A', matchStatus: 'UNMATCHED', id: { notIn: unmatchedLineIds } }, data: { matchStatus: 'MATCHED' } });
    if (unmatchedLineIds.length) await db.salesTaxReturnLines.updateMany({ where: { tenantId, returnId, annex: 'A', matchStatus: 'MATCHED', id: { in: unmatchedLineIds } }, data: { matchStatus: 'UNMATCHED' } });
  }

  async recalcReturn(id: string) {
    await this.fn('select "Tax"."salesTaxReturnRecalc"($1::uuid)::text as id', id);
  }

  async setReturnStatus(tenantId: string, id: string, rowVersion: number, from: string[], to: string) {
    return (await this.prisma.db().salesTaxReturns.updateMany({ where: { tenantId, id, rowVersion, status: { in: from } }, data: { status: to } })).count > 0;
  }

  async fileReturn(id: string) {
    await this.fn('select "Tax"."salesTaxReturnFile"($1::uuid)::text as id', id);
  }

  async payReturn(id: string, data: { cprNo: string; paidOn: string; paidAmount: number; bankAccountId: string }) {
    await this.fn('select "Tax"."salesTaxReturnRecordPayment"($1::uuid, $2::jsonb)::text as id', id, JSON.stringify(data));
  }

  async cprInUse(tenantId: string, cprNo: string) {
    const db = this.prisma.db();
    const [a, b] = await Promise.all([db.salesTaxReturns.count({ where: { tenantId, cprNo } }), db.whtChallans.count({ where: { tenantId, cprNo } })]);
    return a + b > 0;
  }

  async deleteReturn(tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    const row = await db.salesTaxReturns.findFirst({ where: { tenantId, id, rowVersion, status: { in: ['DRAFT', 'VALIDATED'] } }, select: { id: true } });
    if (!row) return false;
    await db.salesTaxReturnLines.deleteMany({ where: { tenantId, returnId: id } });
    await db.salesTaxReturns.deleteMany({ where: { tenantId, id } });
    return true;
  }

  // ---------------------------------------------------------------- WHT register
  private async mapDeductions(tenantId: string, rows: Prisma.WhtDeductionsGetPayload<object>[]): Promise<WhtDeduction[]> {
    const db = this.prisma.db();
    const srcIds = (types: string[]) => rows.filter((r) => r.sourceDocType && types.includes(r.sourceDocType)).map((r) => r.sourceDocId);
    const [parties, codes, challans, certs, pays, bills, rcpts, invs] = await Promise.all([
      partyRefs(db, tenantId, rows.map((r) => r.vendorId), rows.map((r) => r.customerId), rows.map((r) => r.employeeId)),
      ids(rows.map((r) => r.taxCodeId)).length ? db.taxCodes.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.taxCodeId)) } }, select: { id: true, code: true } }) : [],
      ids(rows.map((r) => r.whtPaymentId)).length ? db.whtChallans.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.whtPaymentId)) } }, select: { id: true, docNo: true, cprNo: true } }) : [],
      ids(rows.map((r) => r.whtCertificateId)).length ? db.whtCertificates.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.whtCertificateId)) } }, select: { id: true, certificateNo: true } }) : [],
      ids(srcIds(['PAY'])).length ? db.vendorPayments.findMany({ where: { tenantId, id: { in: ids(srcIds(['PAY'])) } }, select: { id: true, docNo: true } }) : [],
      ids(srcIds(['BILL', 'PV'])).length ? db.vendorBills.findMany({ where: { tenantId, id: { in: ids(srcIds(['BILL', 'PV'])) } }, select: { id: true, docNo: true } }) : [],
      ids(srcIds(['RCPT'])).length ? db.customerReceipts.findMany({ where: { tenantId, id: { in: ids(srcIds(['RCPT'])) } }, select: { id: true, docNo: true } }) : [],
      ids(srcIds(['INV', 'SV', 'POS', 'WS'])).length ? db.salesInvoices.findMany({ where: { tenantId, id: { in: ids(srcIds(['INV', 'SV', 'POS', 'WS'])) } }, select: { id: true, docNo: true } }) : [],
    ]);
    const docs = new Map([...pays, ...bills, ...rcpts, ...invs].map((x) => [x.id, x.docNo]));
    return rows.map((r) => ({
      id: r.id, direction: r.direction, deductionDate: day(r.deductionDate)!, periodMonth: day(r.periodMonth)!, whtSection: r.whtSection,
      taxCode: codes.find((c) => c.id === r.taxCodeId) ?? null, party: r.partyName, partyNtnCnic: r.partyNtnCnic,
      vendor: parties.vendor(r.vendorId), customer: parties.customer(r.customerId), employee: parties.employee(r.employeeId), isAtl: r.isAtl,
      source: r.sourceDocType && r.sourceDocId ? { type: r.sourceDocType, id: r.sourceDocId, docNo: docs.get(r.sourceDocId) ?? null } : null,
      taxableAmount: num(r.taxableAmount), taxRate: nd(r.taxRate), taxAmount: num(r.taxAmount), status: r.status,
      challan: challans.find((c) => c.id === r.whtPaymentId) ?? null, certificate: certs.find((c) => c.id === r.whtCertificateId) ?? null,
      createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
    }));
  }

  async listDeductions(tenantId: string, q: WhtQuery): Promise<WhtDeductionList> {
    const db = this.prisma.db();
    const where: Prisma.WhtDeductionsWhereInput = {
      tenantId,
      ...(q.period && { periodMonth: d(q.period) }),
      ...(q.section && { whtSection: q.section }),
      ...(q.direction && { direction: q.direction }),
      ...(q.status && { status: q.status }),
      ...(q.search && { OR: [{ partyName: { contains: q.search, mode: 'insensitive' } }, { partyNtnCnic: { contains: q.search } }] }),
    };
    const [rows, total] = await Promise.all([
      db.whtDeductions.findMany({ where, orderBy: [{ deductionDate: 'desc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.whtDeductions.count({ where }),
    ]);
    return { items: await this.mapDeductions(tenantId, rows), total };
  }

  async getDeduction(tenantId: string, id: string) {
    const row = await this.prisma.db().whtDeductions.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapDeductions(tenantId, [row]))[0]! : null;
  }

  async sectionSummary(tenantId: string, period: string): Promise<WhtSectionRow[]> {
    const rows = await this.prisma.db().$queryRaw<{ direction: string; whtSection: string; n: bigint; taxable: Prisma.Decimal; rates: (Prisma.Decimal | null)[]; tax: Prisma.Decimal; unpaid: Prisma.Decimal }[]>`
      select direction, "whtSection", count(*) as n, sum("taxableAmount") as taxable, array_agg(distinct "taxRate") as rates, sum("taxAmount") as tax,
             coalesce(sum("taxAmount") filter (where status = 'UNPAID'), 0) as unpaid
        from "Tax"."WhtDeductions"
       where "tenantId" = ${tenantId}::uuid and "periodMonth" = ${d(period)} and status <> 'CANCELLED' and direction in ('DEDUCTED', 'COLLECTED')
       group by direction, "whtSection" order by direction desc, "whtSection"`;
    return rows.map((r) => ({
      direction: r.direction, whtSection: r.whtSection, transactions: Number(r.n), taxableAmount: Number(r.taxable), taxAmount: Number(r.tax), unpaid: Number(r.unpaid),
      rates: r.rates.filter((x): x is Prisma.Decimal => x !== null).map((x) => Number(x)),
    }));
  }

  async sufferedTotal(tenantId: string, period: string) {
    const a = await this.prisma.db().whtDeductions.aggregate({ where: { tenantId, periodMonth: d(period), direction: 'SUFFERED', status: { not: 'CANCELLED' } }, _sum: { taxAmount: true } });
    return num(a._sum.taxAmount);
  }

  private deductionData(input: WhtDeductionInput) {
    const date = d(input.deductionDate);
    return {
      direction: input.direction, deductionDate: date, periodMonth: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
      whtSection: input.whtSection, taxCodeId: input.taxCodeId ?? null,
      vendorId: input.direction === 'DEDUCTED' ? (input.vendorId ?? null) : null,
      employeeId: input.direction === 'DEDUCTED' ? (input.employeeId ?? null) : null,
      customerId: input.direction !== 'DEDUCTED' ? (input.customerId ?? null) : null,
      partyName: input.partyName, partyNtnCnic: input.partyNtnCnic, taxableAmount: new Prisma.Decimal(input.taxableAmount),
      taxRate: input.taxRate === null || input.taxRate === undefined ? null : new Prisma.Decimal(input.taxRate), taxAmount: new Prisma.Decimal(input.taxAmount),
      branchId: input.branchId ?? null,
    };
  }

  async createDeduction(tenantId: string, input: WhtDeductionInput) {
    const taxCodeId = input.taxCodeId ?? (await this.fn('select "Tax"."whtTaxCodeFor"($1::uuid, $2, $3)::text as id', tenantId, input.whtSection, input.direction))[0]?.id as string | null;
    return (await this.prisma.db().whtDeductions.create({ data: { tenantId, ...this.deductionData({ ...input, taxCodeId }), status: 'UNPAID' }, select: { id: true } })).id;
  }

  async updateDeduction(tenantId: string, id: string, rowVersion: number, input: WhtDeductionInput) {
    return (await this.prisma.db().whtDeductions.updateMany({ where: { tenantId, id, rowVersion, sourceDocId: null, status: 'UNPAID', whtCertificateId: null }, data: this.deductionData(input) })).count > 0;
  }

  async deleteDeduction(tenantId: string, id: string, rowVersion: number) {
    return (await this.prisma.db().whtDeductions.deleteMany({ where: { tenantId, id, rowVersion, sourceDocId: null, status: 'UNPAID', whtCertificateId: null } })).count > 0;
  }

  // ---------------------------------------------------------------- challans
  private async mapChallans(tenantId: string, rows: Prisma.WhtChallansGetPayload<object>[]): Promise<WhtChallan[]> {
    const db = this.prisma.db();
    const [banks, vouchers, counts] = await Promise.all([
      bankNames(db, tenantId, rows.map((r) => r.bankAccountId)), voucherRefs(db, tenantId, rows.map((r) => r.journalEntryId)),
      rows.length ? db.whtDeductions.groupBy({ by: ['whtPaymentId'], where: { tenantId, whtPaymentId: { in: rows.map((r) => r.id) } }, _count: true }) : [],
    ]);
    return rows.map((r) => {
      const v = r.journalEntryId ? vouchers.get(r.journalEntryId) : null;
      return {
        id: r.id, docNo: r.docNo, cprNo: r.cprNo, periodMonth: day(r.periodMonth)!, sections: r.sections, paymentDate: day(r.paymentDate)!,
        bankAccount: banks.get(r.bankAccountId) ?? null, amount: num(r.amount), status: r.status, journal: v ? { id: v.id, docNo: v.docNo } : null,
        deductions: counts.find((c) => c.whtPaymentId === r.id)?._count ?? 0, remarks: r.remarks, createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
      };
    });
  }

  async listChallans(tenantId: string, from: string | null, to: string | null) {
    const rows = await this.prisma.db().whtChallans.findMany({
      where: { tenantId, ...((from || to) && { periodMonth: { ...(from && { gte: d(from) }), ...(to && { lte: d(to) }) } }) },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }], take: 200,
    });
    return this.mapChallans(tenantId, rows);
  }

  async getChallan(tenantId: string, id: string) {
    const row = await this.prisma.db().whtChallans.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapChallans(tenantId, [row]))[0]! : null;
  }

  async unpaidTotal(tenantId: string, period: string, sections: string[]) {
    const a = await this.prisma.db().whtDeductions.aggregate({
      where: { tenantId, periodMonth: d(period), status: 'UNPAID', direction: { in: ['DEDUCTED', 'COLLECTED'] }, whtSection: { in: sections } }, _sum: { taxAmount: true },
    });
    return num(a._sum.taxAmount);
  }

  saveChallan(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'whtChallanAddUpdate', data);
  }

  async payChallan(id: string) {
    await this.fn('select "Tax"."whtChallanPay"($1::uuid)::text as id', id);
  }

  async cancelChallan(id: string, reason: string | null) {
    await this.fn('select "Tax"."whtChallanCancel"($1::uuid, $2)::text as id', id, reason);
  }

  async deleteChallan(tenantId: string, id: string, rowVersion: number) {
    return (await this.prisma.db().whtChallans.deleteMany({ where: { tenantId, id, rowVersion, status: 'DRAFT' } })).count > 0;
  }

  // ---------------------------------------------------------------- certificates
  private async mapCertificates(tenantId: string, rows: Prisma.WhtCertificatesGetPayload<object>[]): Promise<WhtCertificate[]> {
    const db = this.prisma.db();
    const [parties, challans, counts] = await Promise.all([
      partyRefs(db, tenantId, rows.map((r) => r.vendorId), rows.map((r) => r.customerId), rows.map((r) => r.employeeId)),
      ids(rows.map((r) => r.whtPaymentId)).length ? db.whtChallans.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.whtPaymentId)) } }, select: { id: true, docNo: true } }) : [],
      rows.length ? db.whtDeductions.groupBy({ by: ['whtCertificateId'], where: { tenantId, whtCertificateId: { in: rows.map((r) => r.id) } }, _count: true }) : [],
    ]);
    return rows.map((r) => ({
      id: r.id, direction: r.direction, certificateNo: r.certificateNo, party: r.partyName, partyNtnCnic: r.partyNtnCnic,
      vendor: parties.vendor(r.vendorId), customer: parties.customer(r.customerId), employee: parties.employee(r.employeeId), whtSection: r.whtSection,
      periodFrom: day(r.periodFrom)!, periodTo: day(r.periodTo)!, taxableAmount: num(r.taxableAmount), taxAmount: num(r.taxAmount), cprNo: r.cprNo,
      challan: challans.find((c) => c.id === r.whtPaymentId) ?? null, issuedOn: day(r.issuedOn), receivedOn: day(r.receivedOn), status: r.status,
      deductions: counts.find((c) => c.whtCertificateId === r.id)?._count ?? 0, rowVersion: r.rowVersion,
    }));
  }

  async listCertificates(tenantId: string, q: WhtCertificateQuery): Promise<WhtCertificateList> {
    const db = this.prisma.db();
    const where: Prisma.WhtCertificatesWhereInput = {
      tenantId, ...(q.direction && { direction: q.direction }), ...(q.status && { status: q.status }),
      ...(q.search && { OR: [{ partyName: { contains: q.search, mode: 'insensitive' } }, { certificateNo: { contains: q.search, mode: 'insensitive' } }] }),
    };
    const [rows, total] = await Promise.all([
      db.whtCertificates.findMany({ where, orderBy: [{ periodTo: 'desc' }, { certificateNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.whtCertificates.count({ where }),
    ]);
    return { items: await this.mapCertificates(tenantId, rows), total };
  }

  async getCertificate(tenantId: string, id: string) {
    const row = await this.prisma.db().whtCertificates.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapCertificates(tenantId, [row]))[0]! : null;
  }

  async certificateDeductions(tenantId: string, id: string) {
    const rows = await this.prisma.db().whtDeductions.findMany({ where: { tenantId, whtCertificateId: id }, orderBy: { deductionDate: 'asc' } });
    return this.mapDeductions(tenantId, rows);
  }

  async generateCertificates(from: string, to: string) {
    return Number((await this.fn('select "Tax"."whtCertificateGenerate"($1::date, $2::date) as n', from, to))[0]!.n);
  }

  async issueCertificate(id: string) {
    await this.fn('select "Tax"."whtCertificateIssue"($1::uuid)::text as id', id);
  }

  async receiveCertificate(data: Record<string, unknown>) {
    return (await this.fn('select "Tax"."whtCertificateReceive"($1::jsonb)::text as id', JSON.stringify(data)))[0]!.id as string;
  }

  async claimCertificate(id: string) {
    await this.fn('select "Tax"."whtCertificateClaim"($1::uuid)::text as id', id);
  }

  async cancelCertificate(id: string, reason: string | null) {
    await this.fn('select "Tax"."whtCertificateCancel"($1::uuid, $2)::text as id', id, reason);
  }

  async deleteCertificate(tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    const row = await db.whtCertificates.findFirst({ where: { tenantId, id, rowVersion, status: 'DRAFT' }, select: { id: true } });
    if (!row) return false;
    await db.whtDeductions.updateMany({ where: { tenantId, whtCertificateId: id }, data: { whtCertificateId: null } });
    await db.whtCertificates.deleteMany({ where: { tenantId, id } });
    return true;
  }

  // ---------------------------------------------------------------- statements
  private async mapStatements(tenantId: string, rows: Prisma.WhtStatementsGetPayload<object>[]): Promise<WhtStatement[]> {
    const users = await userRefs(this.prisma.db(), tenantId, rows.map((r) => r.filedByUserId));
    return rows.map((r) => ({
      id: r.id, returnType: r.returnType, label: r.label, periodFrom: day(r.periodFrom)!, periodTo: day(r.periodTo)!, dueDate: day(r.dueDate)!,
      taxAmount: num(r.taxAmount), status: r.status, filedOn: day(r.filedOn), filedBy: users.get(r.filedByUserId ?? '') ?? null, irisReference: r.irisReference,
      rowVersion: r.rowVersion,
    }));
  }

  async listStatements(tenantId: string) {
    const rows = await this.prisma.db().whtStatements.findMany({ where: { tenantId }, orderBy: [{ periodFrom: 'desc' }, { returnType: 'asc' }], take: 40 });
    return this.mapStatements(tenantId, rows);
  }

  async getStatement(tenantId: string, id: string) {
    const row = await this.prisma.db().whtStatements.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapStatements(tenantId, [row]))[0]! : null;
  }

  async prepareStatement(type: string, from: string, to: string, label: string, dueDate: string) {
    return (await this.fn('select "Tax"."whtStatementPrepare"($1, $2::date, $3::date, $4, $5::date)::text as id', type, from, to, label, dueDate))[0]!.id as string;
  }

  async fileStatement(tenantId: string, id: string, rowVersion: number, filedOn: string, irisReference: string) {
    const n = await this.prisma.db().whtStatements.updateMany({ where: { tenantId, id, rowVersion, status: 'IN_PREPARATION' }, data: { filedOn: d(filedOn), irisReference } });
    if (!n.count) return false;
    await this.fn('select "Tax"."whtStatementFile"($1::uuid)::text as id', id);
    return true;
  }

  // ---------------------------------------------------------------- FBR submissions
  private async configs(where: Prisma.FbrSettingsWhereInput): Promise<FbrTenantConfig[]> {
    const db = this.prisma.db();
    const rows = await db.fbrSettings.findMany({ where });
    const tenants = rows.length ? await db.tenants.findMany({ where: { id: { in: ids(rows.map((r) => r.tenantId)) } }, select: { id: true, code: true } }) : [];
    return rows.map((r) => ({
      tenantId: r.tenantId, tenantCode: tenants.find((t) => t.id === r.tenantId)?.code ?? '', configId: r.id, authority: r.authority, environment: r.environment,
      posId: r.posId, ntn: r.ntn, sendingEnabled: r.sendingEnabled, syncIntervalMinutes: r.syncIntervalMinutes, lastSyncAt: r.lastSyncAt, connectionStatus: r.connectionStatus,
    }));
  }

  async fbrConfig(tenantId: string, authority: string) {
    return (await this.configs({ tenantId, authority }))[0] ?? null;
  }

  sendingConfigs() {
    return this.configs({ sendingEnabled: true, isActive: true });
  }

  private mapSubmission(r: Prisma.FbrInvoiceSubmissionsGetPayload<object>, authority: string): FbrSubmission {
    return {
      id: r.id, authority,
      document: r.invoiceId ? { kind: 'INVOICE', id: r.invoiceId, no: r.documentNo } : { kind: 'CREDIT_NOTE', id: r.creditNoteId!, no: r.documentNo },
      buyerName: r.buyerName, buyerNtnCnic: r.buyerNtnCnic, amount: num(r.amount), status: r.status, attempts: r.attempts,
      firstSubmittedAt: r.firstSubmittedAt?.toISOString() ?? null, lastAttemptAt: r.lastAttemptAt?.toISOString() ?? null, nextRetryAt: r.nextRetryAt?.toISOString() ?? null,
      fbrInvoiceNo: r.fbrInvoiceNo, responseCode: r.responseCode, errorMessage: r.errorMessage, latencyMs: r.latencyMs, createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
    };
  }

  async listSubmissions(tenantId: string, q: FbrSubmissionQuery): Promise<FbrSubmissionList> {
    const db = this.prisma.db();
    const cfg = await db.fbrSettings.findFirst({ where: { tenantId, authority: q.authority }, select: { id: true } });
    if (!cfg) return { items: [], total: 0, counts: { pending: 0, failed: 0, accepted: 0, skipped: 0 }, month: { accepted: 0, total: 0 } };
    const base = { tenantId, fbrConfigId: cfg.id };
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const where: Prisma.FbrInvoiceSubmissionsWhereInput = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, groups, monthGroups] = await Promise.all([
      db.fbrInvoiceSubmissions.findMany({ where, orderBy: [{ createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.fbrInvoiceSubmissions.count({ where }),
      db.fbrInvoiceSubmissions.groupBy({ by: ['status'], where: base, _count: true }),
      db.fbrInvoiceSubmissions.groupBy({ by: ['status'], where: { ...base, createdAt: { gte: monthStart } }, _count: true }),
    ]);
    const c = (g: typeof groups, s: string) => g.find((x) => x.status === s)?._count ?? 0;
    return {
      items: rows.map((r) => this.mapSubmission(r, q.authority)), total,
      counts: { pending: c(groups, 'PENDING'), failed: c(groups, 'FAILED'), accepted: c(groups, 'ACCEPTED'), skipped: c(groups, 'SKIPPED') },
      month: { accepted: c(monthGroups, 'ACCEPTED'), total: monthGroups.filter((g) => g.status !== 'SKIPPED').reduce((s, g) => s + g._count, 0) },
    };
  }

  async getSubmission(tenantId: string, id: string) {
    const db = this.prisma.db();
    const r = await db.fbrInvoiceSubmissions.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    const cfg = await db.fbrSettings.findFirst({ where: { tenantId, id: r.fbrConfigId }, select: { authority: true } });
    return this.mapSubmission(r, cfg?.authority ?? 'FBR');
  }

  async dueSubmissions(tenantId: string, configId: string, limit: number, opts: { ids?: string[]; all?: boolean } = {}): Promise<DueSubmission[]> {
    return this.prisma.db().fbrInvoiceSubmissions.findMany({
      where: {
        tenantId, fbrConfigId: configId, status: { in: OPEN_SUB },
        ...(opts.ids ? { id: { in: opts.ids } } : opts.all ? {} : { OR: [{ nextRetryAt: null, status: 'PENDING' }, { nextRetryAt: { lte: new Date() } }] }),
      },
      orderBy: [{ createdAt: 'asc' }], take: limit,
      select: { id: true, invoiceId: true, creditNoteId: true, documentNo: true, posId: true, attempts: true, rowVersion: true },
    });
  }

  async fbrDocument(tenantId: string, sub: DueSubmission): Promise<FbrDocument | null> {
    const db = this.prisma.db();
    const cs = await db.companySettings.findFirst({ where: { tenantId }, select: { legalName: true, tradingName: true, ntn: true, registeredAddress: true } });
    const seller = { ntn: cs?.ntn ?? '', name: cs?.legalName ?? cs?.tradingName ?? '', address: cs?.registeredAddress ?? null, province: null };
    if (sub.invoiceId) {
      const inv = await db.salesInvoices.findFirst({ where: { tenantId, id: sub.invoiceId } });
      if (!inv) return null;
      const lines = await db.salesInvoiceLines.findMany({ where: { tenantId, invoiceId: inv.id }, orderBy: { lineNo: 'asc' } });
      const fx = num(inv.fxRate) || 1;
      return {
        kind: 'INVOICE', documentNo: inv.docNo, date: day(inv.docDate)!, posId: sub.posId, seller,
        buyer: { ntnCnic: inv.buyerNtn ?? inv.buyerCnic, name: inv.buyerName, address: inv.buyerAddress, province: null, registered: !!inv.buyerStrn },
        originalFbrInvoiceNo: null,
        lines: lines.map((l) => ({
          hsCode: l.hsCode, description: l.description ?? 'Item', uom: 'Numbers, pieces, units', quantity: num(l.baseQty) + num(l.bonusQty), rate: nd(l.taxRate),
          valueExclTax: num(l.taxableAmount) * fx, salesTax: num(l.taxAmount) * fx, furtherTax: num(l.furtherTaxAmount) * fx, discount: num(l.discountAmount) * fx,
          total: num(l.totalAmount) * fx,
        })),
        total: num(inv.netAmount) * fx,
      };
    }
    const cn = await db.creditNotes.findFirst({ where: { tenantId, id: sub.creditNoteId! } });
    if (!cn) return null;
    const [lines, inv] = await Promise.all([
      db.creditNoteLines.findMany({ where: { tenantId, creditNoteId: cn.id }, orderBy: { lineNo: 'asc' } }),
      cn.invoiceId ? db.salesInvoices.findFirst({ where: { tenantId, id: cn.invoiceId }, select: { fbrInvoiceNo: true, buyerNtn: true, buyerCnic: true, buyerName: true, buyerAddress: true, buyerStrn: true } }) : null,
    ]);
    const fx = num(cn.fxRate) || 1;
    return {
      kind: 'CREDIT_NOTE', documentNo: cn.docNo, date: day(cn.docDate)!, posId: sub.posId, seller,
      buyer: { ntnCnic: inv?.buyerNtn ?? inv?.buyerCnic ?? null, name: inv?.buyerName ?? null, address: inv?.buyerAddress ?? null, province: null, registered: !!inv?.buyerStrn },
      originalFbrInvoiceNo: inv?.fbrInvoiceNo ?? null,
      lines: lines.map((l) => ({
        hsCode: null, description: l.description, uom: 'Numbers, pieces, units', quantity: num(l.baseQty), rate: nd(l.taxRate),
        valueExclTax: num(l.valueAmount) * fx, salesTax: num(l.taxAmount) * fx, furtherTax: num(l.furtherTaxAmount) * fx, discount: 0, total: num(l.totalAmount) * fx,
      })),
      total: num(cn.totalAmount) * fx,
    };
  }

  async recordAttempt(tenantId: string, sub: DueSubmission, r: FbrSendResult, nextRetryAt: Date | null) {
    const db = this.prisma.db();
    const now = new Date();
    await db.fbrInvoiceSubmissions.updateMany({
      where: { tenantId, id: sub.id, status: { in: OPEN_SUB } },
      data: {
        attempts: { increment: 1 }, lastAttemptAt: now, status: r.accepted ? 'ACCEPTED' : 'FAILED', fbrInvoiceNo: r.accepted ? r.fbrInvoiceNo : null,
        qrPayload: r.accepted ? r.fbrInvoiceNo : null, responseCode: r.responseCode, errorMessage: r.accepted ? null : (r.message ?? 'FBR rejected the document'),
        latencyMs: r.latencyMs, nextRetryAt: r.accepted ? null : nextRetryAt,
        requestPayload: (r.request ?? Prisma.JsonNull) as Prisma.InputJsonValue, responsePayload: (r.response ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
    await db.fbrInvoiceSubmissions.updateMany({ where: { tenantId, id: sub.id, firstSubmittedAt: null }, data: { firstSubmittedAt: now } });
    if (sub.invoiceId) {
      await db.salesInvoices.updateMany({
        where: { tenantId, id: sub.invoiceId },
        data: r.accepted ? { fbrStatus: 'POSTED', fbrInvoiceNo: r.fbrInvoiceNo, fbrSubmittedAt: now, fbrError: null } : { fbrStatus: 'FAILED', fbrError: r.message ?? 'FBR rejected the invoice' },
      });
    }
  }

  async setRetryNow(tenantId: string, id: string) {
    return (await this.prisma.db().fbrInvoiceSubmissions.updateMany({ where: { tenantId, id, status: 'FAILED' }, data: { nextRetryAt: new Date() } })).count > 0;
  }

  async requeue(tenantId: string, id: string) {
    const db = this.prisma.db();
    const row = await db.fbrInvoiceSubmissions.findFirst({ where: { tenantId, id, status: 'SKIPPED' }, select: { invoiceId: true } });
    if (!row) return false;
    await db.fbrInvoiceSubmissions.updateMany({ where: { tenantId, id }, data: { status: 'PENDING', nextRetryAt: null, errorMessage: null } });
    if (row.invoiceId) await db.salesInvoices.updateMany({ where: { tenantId, id: row.invoiceId }, data: { fbrStatus: 'PENDING' } });
    return true;
  }

  async backlog(tenantId: string, configId: string): Promise<FbrBacklog> {
    const rows = await this.prisma.db().$queryRaw<{ pending: bigint; failed: bigint; oldest: Date | null; newest: Date | null; amount: Prisma.Decimal | null }[]>`
      select count(*) filter (where f.status = 'PENDING') as pending, count(*) filter (where f.status = 'FAILED') as failed,
             min(coalesce(i."docDate", n."docDate")) as oldest, max(coalesce(i."docDate", n."docDate")) as newest, sum(f.amount) as amount
        from "Tax"."FbrInvoiceSubmissions" f
        left join "Sales"."SalesInvoices" i on i."tenantId" = f."tenantId" and i.id = f."invoiceId"
        left join "Sales"."CreditNotes" n on n."tenantId" = f."tenantId" and n.id = f."creditNoteId"
       where f."tenantId" = ${tenantId}::uuid and f."fbrConfigId" = ${configId}::uuid and f.status in ('PENDING', 'FAILED')`;
    const r = rows[0]!;
    return { pending: Number(r.pending), failed: Number(r.failed), oldest: day(r.oldest), newest: day(r.newest), amount: Number(r.amount ?? 0) };
  }

  async skipRange(tenantId: string, configId: string, from: string, to: string) {
    const rows = await this.prisma.db().$queryRaw<{ id: string; invoiceId: string | null }[]>`
      update "Tax"."FbrInvoiceSubmissions" f
         set status = 'SKIPPED', "nextRetryAt" = null, "errorMessage" = null
       where f."tenantId" = ${tenantId}::uuid and f."fbrConfigId" = ${configId}::uuid and f.status in ('PENDING', 'FAILED')
         and coalesce((select i."docDate" from "Sales"."SalesInvoices" i where i."tenantId" = f."tenantId" and i.id = f."invoiceId"),
                      (select n."docDate" from "Sales"."CreditNotes" n where n."tenantId" = f."tenantId" and n.id = f."creditNoteId")) between ${d(from)} and ${d(to)}
      returning f.id::text as id, f."invoiceId"::text as "invoiceId"`;
    const invoices = ids(rows.map((r) => r.invoiceId));
    if (invoices.length) await this.prisma.db().salesInvoices.updateMany({ where: { tenantId, id: { in: invoices } }, data: { fbrStatus: 'NOT_REPORTED', fbrError: null } });
    return rows.length;
  }

  async events(tenantId: string, configId: string, limit: number): Promise<FbrConnectionEvent[]> {
    const db = this.prisma.db();
    const rows = await db.fbrConnectionEvents.findMany({ where: { tenantId, fbrConfigId: configId }, orderBy: { occurredAt: 'desc' }, take: limit });
    const users = await userRefs(db, tenantId, rows.map((r) => r.actorUserId));
    return rows.map((r) => ({
      id: r.id, occurredAt: r.occurredAt.toISOString(), event: r.event, ok: r.ok, latencyMs: r.latencyMs, retriedCount: r.retriedCount,
      actor: users.get(r.actorUserId ?? '') ?? null, details: r.details,
    }));
  }

  async addEvent(tenantId: string, configId: string, e: { event: string; ok: boolean; latencyMs: number | null; retriedCount?: number | null; details: string | null; actorUserId: string | null }) {
    await this.prisma.db().fbrConnectionEvents.create({
      data: { tenantId, fbrConfigId: configId, occurredAt: new Date(), event: e.event, ok: e.ok, latencyMs: e.latencyMs, retriedCount: e.retriedCount ?? null, details: e.details, actorUserId: e.actorUserId },
    });
  }

  async setConnection(tenantId: string, configId: string, data: { connectionStatus?: string; lastHealthCheckAt?: Date; lastLatencyMs?: number | null; lastSyncAt?: Date }) {
    await this.prisma.db().fbrSettings.updateMany({ where: { tenantId, id: configId }, data });
  }
}
