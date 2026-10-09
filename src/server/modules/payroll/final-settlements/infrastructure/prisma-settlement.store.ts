import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { amountInWords, SETTLEMENT_MANUAL_KINDS, type SettlementCalcSummary, type SettlementGlLine, type SettlementList, type SettlementListItem, type SettlementQuery } from '../../../../../shared/index.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { asDate, day, employeeRefs, ids, num, unknownEmp, userNames } from '../../../hr/attendance/infrastructure/hr-refs.js';
import { SettlementStore, type SettlementBase } from '../application/settlement-store.js';
import { settlementServiceLabel, type SettlementSalaryFacts } from '../domain/settlement-facts.js';

type Db = Prisma.TransactionClient;
type Row = Prisma.FinalSettlementsGetPayload<object>;
const RULE = { daysPerYear: 30, minServiceYears: 1, partYearOverMonths: 6, taxExemptAmount: 300000 };
const r2 = (n: number) => Math.round(n * 100) / 100;
const MANUAL = SETTLEMENT_MANUAL_KINDS as readonly string[];

@Injectable()
export class PrismaSettlementStore extends SettlementStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  private async items(db: Db, tenantId: string, rows: Row[]): Promise<SettlementListItem[]> {
    const [refs, offs] = await Promise.all([
      employeeRefs(db, tenantId, rows.map((r) => r.employeeId)),
      db.offboardings.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.offboardingId)) } }, select: { id: true, lastWorkingDay: true, exitType: true } }),
    ]);
    return rows.map((r) => {
      const o = offs.find((x) => x.id === r.offboardingId);
      return {
        id: r.id, docNo: r.docNo, docDate: day(r.docDate)!, employee: refs.get(r.employeeId) ?? unknownEmp(r.employeeId), offboardingId: r.offboardingId,
        lastWorkingDay: day(o?.lastWorkingDay), exitType: o?.exitType ?? null, earningsAmount: num(r.earningsAmount), deductionAmount: num(r.deductionAmount),
        netAmount: num(r.netAmount), status: r.status, paidAt: r.paidAt?.toISOString() ?? null,
      };
    });
  }

  async list(tenantId: string, q: SettlementQuery): Promise<SettlementList> {
    const db = this.db();
    const search = q.search?.trim();
    const emps = search ? await db.employees.findMany({ where: { tenantId, OR: [{ code: { contains: search, mode: 'insensitive' } }, { displayName: { contains: search, mode: 'insensitive' } }, { firstName: { contains: search, mode: 'insensitive' } }] }, select: { id: true } }) : null;
    const where: Prisma.FinalSettlementsWhereInput = {
      tenantId, ...(q.offboardingId && { offboardingId: q.offboardingId }),
      ...(search && { OR: [{ docNo: { contains: search, mode: 'insensitive' } }, { employeeId: { in: emps!.map((e) => e.id) } }] }),
    };
    const [rows, counts] = await Promise.all([
      db.finalSettlements.findMany({ where: { ...where, ...(q.status && q.status !== 'ALL' && { status: q.status }) }, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], take: 200 }),
      db.finalSettlements.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);
    return { items: await this.items(db, tenantId, rows), total: rows.length, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) };
  }

  private async rule(tenantId: string) {
    const r = await this.db().$queryRaw<{ value: Partial<typeof RULE> }[]>`select value from "Company"."CompanySettingValues" where "tenantId" = ${tenantId}::uuid and "settingGroup" = 'PAYROLL' and key = 'gratuity'`;
    const v = { ...RULE, ...(r[0]?.value ?? {}) };
    return { daysPerYear: Number(v.daysPerYear), minServiceYears: Number(v.minServiceYears), partYearOverMonths: Number(v.partYearOverMonths), taxExemptAmount: Number(v.taxExemptAmount) };
  }

  async get(tenantId: string, id: string): Promise<SettlementBase | null> {
    const db = this.db();
    const r = await db.finalSettlements.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    const [[item], lines, off, emp, rule] = await Promise.all([
      this.items(db, tenantId, [r]),
      db.finalSettlementLines.findMany({ where: { tenantId, settlementId: id }, orderBy: { lineNo: 'asc' } }),
      db.offboardings.findFirst({ where: { tenantId, id: r.offboardingId } }),
      db.employees.findFirst({ where: { tenantId, id: r.employeeId }, select: { cnic: true, joiningDate: true } }),
      this.rule(tenantId),
    ]);
    const [loans, accounts, users, interview, clearance, empBank, payBank, vouchers] = await Promise.all([
      db.loansAndAdvances.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.loanId)) } }, select: { id: true, docNo: true } }),
      db.chartOfAccounts.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.accountId)) } }, select: { id: true, code: true, name: true } }),
      userNames(db, tenantId, [r.preparedByUserId, r.approvedByUserId, r.createdBy]),
      db.exitInterviews.findFirst({ where: { tenantId, offboardingId: r.offboardingId }, select: { eligibleForRehire: true } }),
      db.clearanceItems.findMany({ where: { tenantId, offboardingId: r.offboardingId }, orderBy: { createdAt: 'asc' } }),
      r.employeeBankId ? db.employeeBankAccounts.findFirst({ where: { tenantId, id: r.employeeBankId } }) : null,
      r.payFromBankAccountId ? db.bankAccounts.findFirst({ where: { tenantId, id: r.payFromBankAccountId }, select: { id: true, accountTitle: true, accountLast4: true } }) : null,
      db.vouchers.findMany({ where: { tenantId, id: { in: ids([r.journalEntryId, r.paymentJournalEntryId]) } }, select: { id: true, docNo: true } }),
    ]);
    const owners = await employeeRefs(db, tenantId, clearance.map((c) => c.ownerEmployeeId));
    const vno = (x: string | null) => (x ? { id: x, docNo: vouchers.find((v) => v.id === x)?.docNo ?? '?' } : null);
    const joining = day(emp?.joiningDate)!;
    return {
      ...item!, cnic: emp?.cnic ?? null, joiningDate: joining, serviceMonths: r.serviceMonths, serviceLabel: off ? settlementServiceLabel(joining, day(off.lastWorkingDay)!) : '—',
      noticeShortfallDays: r.noticeShortfallDays, lastBasicAmount: num(r.lastBasicAmount), lastGrossAmount: num(r.lastGrossAmount),
      perDayGrossAmount: r.perDayGrossAmount ? num(r.perDayGrossAmount) : null, perDayBasicAmount: r.perDayBasicAmount ? num(r.perDayBasicAmount) : null,
      netAmountWords: r.netAmountWords ?? amountInWords(num(r.netAmount)), pfTrustBalanceAmount: r.pfTrustBalanceAmount ? num(r.pfTrustBalanceAmount) : null, remarks: r.remarks,
      employeeBank: empBank ? { id: empBank.id, label: `${empBank.bankName ?? 'Bank'}${empBank.iban ? ` ••${empBank.iban.slice(-4)}` : ''}` } : null,
      payFromBankAccount: payBank ? { id: payBank.id, label: `${payBank.accountTitle}${payBank.accountLast4 ? ` ••${payBank.accountLast4}` : ''}` } : null,
      journal: vno(r.journalEntryId), payment: vno(r.paymentJournalEntryId),
      preparedBy: users.get(r.preparedByUserId ?? '') ?? null, preparedAt: r.preparedAt?.toISOString() ?? null,
      approvedBy: users.get(r.approvedByUserId ?? '') ?? null, approvedAt: r.approvedAt?.toISOString() ?? null,
      createdBy: users.get(r.createdBy ?? '') ?? null, createdAt: r.createdAt.toISOString(),
      exit: off ? {
        id: off.id, docNo: off.docNo, resignationDate: day(off.resignationDate), lastWorkingDay: day(off.lastWorkingDay)!, noticeDaysRequired: off.noticeDaysRequired,
        noticeDaysServed: off.noticeDaysServed, noticeWaived: off.noticeWaived, reasonCategory: off.reasonCategory, eligibleForRehire: interview?.eligibleForRehire ?? null, status: off.status,
      } : { id: r.offboardingId, docNo: '?', resignationDate: null, lastWorkingDay: '', noticeDaysRequired: 0, noticeDaysServed: null, noticeWaived: false, reasonCategory: 'OTHER', eligibleForRehire: null, status: '?' },
      clearance: clearance.map((c) => ({ id: c.id, clearanceArea: c.clearanceArea, description: c.description, owner: owners.get(c.ownerEmployeeId ?? '')?.name ?? null, status: c.status })),
      lines: lines.map((l) => ({
        id: l.id, lineNo: l.lineNo, componentKind: l.componentKind, direction: l.direction as 'EARNING' | 'DEDUCTION', label: l.label, basisText: l.basisText,
        quantity: l.quantity ? num(l.quantity) : null, rate: l.rate ? num(l.rate) : null, amount: num(l.amount), taxableAmount: l.taxableAmount ? num(l.taxableAmount) : null,
        loan: l.loanId ? { id: l.loanId, docNo: loans.find((x) => x.id === l.loanId)?.docNo ?? '?' } : null,
        account: l.accountId ? accounts.find((a) => a.id === l.accountId) ?? null : null, isManual: MANUAL.includes(l.componentKind),
      })),
      glPreview: await this.glPreview(tenantId, id),
      rule, rowVersion: r.rowVersion,
    };
  }

  /** The approval JV as finalSettlementApproveEntries would post it (same account fallbacks), or the posted one. */
  async glPreview(tenantId: string, id: string): Promise<SettlementGlLine[]> {
    const db = this.db();
    const fs = await db.finalSettlements.findFirst({ where: { tenantId, id }, select: { journalEntryId: true, netAmount: true } });
    if (!fs) return [];
    if (fs.journalEntryId) {
      const vl = await db.voucherLines.findMany({ where: { tenantId, journalEntryId: fs.journalEntryId }, orderBy: { lineNo: 'asc' }, select: { accountId: true, particulars: true, debit: true, credit: true } });
      const acc = await db.chartOfAccounts.findMany({ where: { tenantId, id: { in: ids(vl.map((l) => l.accountId)) } }, select: { id: true, code: true, name: true } });
      return vl.map((l) => { const a = acc.find((x) => x.id === l.accountId); return { account: a ? `${a.code} ${a.name}` : '?', particulars: l.particulars ?? '', debit: num(l.debit), credit: num(l.credit) }; });
    }
    const lines = await db.finalSettlementLines.findMany({ where: { tenantId, settlementId: id, amount: { gt: 0 } }, orderBy: { lineNo: 'asc' } });
    const [comps, loans, roles] = await Promise.all([
      db.salaryComponents.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, systemRole: true, debitAccountId: true, creditAccountId: true } }),
      db.loansAndAdvances.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.loanId)) } }, select: { id: true, loanType: true } }),
      db.defaultAccountMappings.findMany({ where: { tenantId }, select: { role: true, accountId: true } }),
    ]);
    const role = (r: string) => roles.find((x) => x.role === r)?.accountId ?? null;
    const sideAcc = (c: { debitAccountId: string | null; creditAccountId: string | null } | undefined, earning: boolean, kind: string) => (c ? (earning && kind !== 'GRATUITY' ? c.debitAccountId : c.creditAccountId) : null);
    const out = new Map<string, { debit: number; credit: number; parts: string[] }>();
    const add = (acc: string | null, debit: number, credit: number, part: string) => {
      const k = acc ?? '?';
      const x = out.get(k) ?? { debit: 0, credit: 0, parts: [] };
      x.debit += debit; x.credit += credit; if (!x.parts.includes(part)) x.parts.push(part); out.set(k, x);
    };
    for (const l of lines) {
      const earning = l.direction === 'EARNING';
      const loanType = loans.find((x) => x.id === l.loanId)?.loanType;
      const sys = l.componentKind === 'GRATUITY' ? 'GRATUITY' : l.componentKind === 'INCOME_TAX' ? 'INCOME_TAX' : l.componentKind === 'EOBI' ? 'EOBI_EMPLOYEE'
        : ['ADVANCE_RECOVERY', 'LOAN_RECOVERY'].includes(l.componentKind) ? (loanType === 'SALARY_ADVANCE' ? 'ADVANCE' : 'LOAN') : earning ? 'BASIC' : null;
      const fallbackRole = l.componentKind === 'INCOME_TAX' ? 'INCOME_TAX_PAYABLE_SALARY' : l.componentKind === 'EOBI' ? 'EOBI_PAYABLE'
        : ['ADVANCE_RECOVERY', 'LOAN_RECOVERY'].includes(l.componentKind) ? (loanType === 'SALARY_ADVANCE' ? 'EMPLOYEE_ADVANCES' : 'EMPLOYEE_LOANS') : 'SALARY_EXPENSE';
      const acc = l.accountId ?? sideAcc(comps.find((c) => c.id === l.componentId), earning, l.componentKind) ?? sideAcc(comps.find((c) => c.systemRole === sys), earning, l.componentKind) ?? role(fallbackRole);
      add(acc, earning ? num(l.amount) : 0, earning ? 0 : num(l.amount), l.label);
    }
    const net = num(fs.netAmount);
    if (net) add(role('SALARIES_PAYABLE'), net < 0 ? -net : 0, net > 0 ? net : 0, 'Final dues (net payable)');
    const accounts = await db.chartOfAccounts.findMany({ where: { tenantId, id: { in: [...out.keys()].filter((k) => k !== '?') } }, select: { id: true, code: true, name: true } });
    return [...out.entries()].map(([k, x]) => {
      const a = accounts.find((y) => y.id === k);
      return { account: a ? `${a.code} ${a.name}` : 'Account to choose', particulars: x.parts.join(' · '), debit: r2(Math.max(0, x.debit - x.credit)), credit: r2(Math.max(0, x.credit - x.debit)) };
    }).filter((l) => l.debit || l.credit).sort((a, b) => (b.debit ? 1 : 0) - (a.debit ? 1 : 0));
  }

  async options(tenantId: string, id: string) {
    const db = this.db();
    const fs = await db.finalSettlements.findFirst({ where: { tenantId, id }, select: { employeeId: true } });
    const [banks, empBanks, accounts] = await Promise.all([
      db.bankAccounts.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, orderBy: { accountTitle: 'asc' }, select: { id: true, accountTitle: true, accountLast4: true } }),
      fs ? db.employeeBankAccounts.findMany({ where: { tenantId, employeeId: fs.employeeId, isActive: true }, orderBy: [{ isPrimary: 'desc' }] }) : [],
      db.chartOfAccounts.findMany({ where: { tenantId, deletedAt: null, kind: 'POSTABLE', status: 'ACTIVE' }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }),
    ]);
    return {
      bankAccounts: banks.map((b) => ({ id: b.id, label: `${b.accountTitle}${b.accountLast4 ? ` ••${b.accountLast4}` : ''}` })),
      employeeBanks: empBanks.map((b) => ({ id: b.id, label: `${b.paymentMode === 'BANK' ? b.bankName ?? 'Bank' : b.paymentMode}${b.iban ? ` ••${b.iban.slice(-4)}` : ''}` })),
      accounts,
    };
  }

  async salaryOn(tenantId: string, employeeId: string, date: string) {
    const db = this.db();
    const [sal, st] = await Promise.all([
      db.employeeSalaries.findFirst({ where: { tenantId, employeeId, effectiveFrom: { lte: asDate(date) } }, orderBy: { effectiveFrom: 'desc' } }),
      db.employeeStatutoryDetails.findFirst({ where: { tenantId, employeeId } }),
    ]);
    if (!sal) return null;
    return {
      basicAmount: num(sal.basicAmount), structureId: sal.structureId, addonStructureId: sal.addonStructureId,
      statutory: { eobi: st?.eobiApplicable ?? true, pessi: st?.socialSecurityApplicable ?? true, pf: !!st?.pfApplicable && (!st.pfFromDate || day(st.pfFromDate)! <= date) },
    };
  }

  async start(offboardingId: string) {
    const r = await this.db().$queryRaw<{ id: string }[]>`select "Payroll"."finalSettlementStart"(${offboardingId}::uuid)::text as id`;
    return r[0]!.id;
  }

  async calculate(id: string, facts: SettlementSalaryFacts) {
    const r = await this.db().$queryRaw<{ r: SettlementCalcSummary }[]>`select "Payroll"."finalSettlementCalculate"(${id}::uuid, ${JSON.stringify(facts)}::jsonb) as r`;
    return r[0]!.r;
  }

  async save(data: Record<string, unknown>) {
    const r = await this.db().$queryRaw<{ id: string }[]>`select "Payroll"."finalSettlementAddUpdate"(${JSON.stringify(data)}::jsonb)::text as id`;
    return r[0]!.id;
  }

  async setWords(tenantId: string, id: string) {
    const db = this.db();
    const r = await db.finalSettlements.findFirst({ where: { tenantId, id }, select: { netAmount: true, netAmountWords: true, status: true } });
    if (!r || r.status !== 'DRAFT') return;
    const words = num(r.netAmount) < 0 ? `${amountInWords(-num(r.netAmount))} (recoverable from the employee)` : amountInWords(num(r.netAmount));
    if (words !== r.netAmountWords) await this.save({ id, netAmountWords: words });
  }

  async setApprovalRequest(tenantId: string, id: string, requestId: string) {
    await this.db().finalSettlements.updateMany({ where: { tenantId, id }, data: { approvalRequestId: requestId } });
  }

  async call(fn: 'submit' | 'approve' | 'sendBack' | 'cancel', id: string, text: string | null = null) {
    const db = this.db();
    if (fn === 'submit') await db.$queryRaw`select "Payroll"."finalSettlementSubmit"(${id}::uuid)::text`;
    if (fn === 'approve') await db.$queryRaw`select "Payroll"."finalSettlementApprove"(${id}::uuid, ${text})::text`;
    if (fn === 'sendBack') await db.$queryRaw`select "Payroll"."finalSettlementSendBack"(${id}::uuid, ${text})::text`;
    if (fn === 'cancel') await db.$queryRaw`select "Payroll"."finalSettlementCancel"(${id}::uuid, ${text})::text`;
  }

  async pay(id: string, data: Record<string, unknown>) {
    await this.db().$queryRaw`select "Payroll"."finalSettlementPay"(${id}::uuid, ${JSON.stringify(data)}::jsonb)::text`;
  }

  async exitFacts(tenantId: string, offboardingId: string) {
    const db = this.db();
    const o = await db.offboardings.findFirst({ where: { tenantId, id: offboardingId }, select: { employeeId: true, lastWorkingDay: true } });
    if (!o) return null;
    const e = await db.employees.findFirst({ where: { tenantId, id: o.employeeId }, select: { joiningDate: true } });
    return { employeeId: o.employeeId, joiningDate: day(e?.joiningDate)!, lastWorkingDay: day(o.lastWorkingDay)! };
  }

  async ofOffboarding(tenantId: string, offboardingId: string) {
    return this.db().finalSettlements.findFirst({ where: { tenantId, offboardingId, status: { not: 'CANCELLED' } }, select: { id: true, docNo: true, status: true } });
  }
}
