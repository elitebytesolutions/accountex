/**
 * Ledger, bank and cash activity for the showcase company (Apr 2025 → today), all through the real API:
 *  - tx.ledger.opening        opening balances (FY 2024-25 batch, as at 2024-07-01): capital, loan, banks, cash, deposits
 *  - tx.ledger.budgets        FY 2025-26 and FY 2026-27 budgets (revenue + expenses per branch), approved
 *  - tx.ledger.recurring      recurring voucher templates (rent, internet)
 *  - tx.ledger.YYYY-MM        monthly vouchers per branch: rent, utilities, fuel, security, telecom, repairs, stationery,
 *                             entertainment, advertising, bank charges/profit, loan mark-up, insurance, audit accrual,
 *                             cash funding (contra), quarterly advance tax, one reversed mistake per quarter
 *  - tx.ledger.petty-YYYY-MM  petty-cash vouchers per fund + month-end replenishment
 *  - tx.ledger.claims-YYYY-MM employee expense claims → approval (approver) → paid
 *  - tx.ledger.bank-rec       (last) bank statements built from posted bank transactions, reconciled month by month
 * Every voucher carries referenceNo `SL-<yyyy-mm>-<key>`, so a month that stopped half-way resumes without duplicates.
 * State: ids.ledger = { openingId, budgets: [{ id, code }], recurring: [{ id, name }] }.
 */
import type { Api } from './client.ts';
import { pool, type Ctx, type Step } from './ctx.ts';
import { monthEnd, months, rngFor, today, workDays, type Rng } from './rng.ts';
import { acct, bank, br, branchBank, cash, cc, dayOf } from './tx-ledger-lib.ts';
import { bankRec, budgets, claims, pettyStep, recurring } from './tx-ledger-extra.ts';

type Line = { accountId: string; debit?: number; credit?: number; particulars?: string | null; costCentreId?: string | null };
type V = {
  key: string; voucherType: 'JV' | 'CPV' | 'CRV' | 'BPV' | 'BRV' | 'CON'; date: string; branch: string; narration: string;
  cashBank?: string | null; party?: string | null; instrument?: string | null; lines: Line[]; reverse?: boolean;
};

const ref = (month: string, key: string) => `SL-${month.slice(0, 7)}-${key}`;

// ------------------------------------------------------------------------------------------------ voucher helper
/** Instrument types are only allowed on bank vouchers (lookup parentCodes): cheque / IBFT / pay order on BPV; IBFT / deposits on BRV. */
const INSTRUMENTS: Record<string, string[]> = { BPV: ['CHEQUE', 'IBFT', 'PAY_ORDER', 'RTGS'], BRV: ['IBFT', 'CHEQUE_DEPOSIT', 'CASH_DEPOSIT'] };
const instrumentFor = (v: V) => (v.instrument && INSTRUMENTS[v.voucherType]?.includes(v.instrument) ? v.instrument : null);
/** Creates and posts a voucher as the UI does (cash / bank vouchers are one-sided; the API adds the contra leg). */
async function postVoucher(ctx: Ctx, api: Api, month: string, v: V): Promise<any> {
  const body = {
    voucherType: v.voucherType, docDate: v.date, postingDate: v.date, referenceNo: ref(month, v.key), branchId: br(ctx, v.branch),
    narration: v.narration, tags: ['seed'], cashBankAccountId: v.cashBank ?? null, partyName: v.party ?? null,
    instrumentType: instrumentFor(v), instrumentNo: null, instrumentDate: null, autoReverseOn: null,
    lines: v.lines.map((l) => ({ accountId: l.accountId, particulars: l.particulars ?? null, debit: l.debit ?? 0, credit: l.credit ?? 0, costCentreId: l.costCentreId ?? null })),
  };
  let vch: any = await api.post('/accounting/vouchers', body);
  vch = await postDraft(ctx, api, vch);
  if (v.reverse) {
    await api.post(`/accounting/vouchers/${vch.id}/reverse`, { reversalDate: v.date, reason: 'WRONG_ACCOUNT', remarks: 'Booked to the wrong expense head; re-entered.', rowVersion: vch.rowVersion });
  }
  return vch;
}

async function postDraft(ctx: Ctx, api: Api, vch: any): Promise<any> {
  if (vch.status === 'POSTED' || vch.status === 'REVERSED') return vch;
  try {
    return await api.post(`/accounting/vouchers/${vch.id}/post`, { rowVersion: vch.rowVersion });
  } catch (e: any) {
    if (e.code !== 'VOUCHER_APPROVAL_REQUIRED') throw e;
    // A workflow routes this voucher: submit, approve as the second user, then it posts (or post after approval).
    const sub: any = await api.post(`/accounting/vouchers/${vch.id}/submit`, { rowVersion: vch.rowVersion });
    const reqId = sub.approval?.id;
    if (reqId) await ctx.approver.post(`/approvals/${reqId}/approve`, { reason: null, comment: null });
    const after: any = await api.get(`/accounting/vouchers/${vch.id}`);
    return after.status === 'POSTED' ? after : api.post(`/accounting/vouchers/${vch.id}/post`, { rowVersion: after.rowVersion });
  }
}

/** Existing seeded vouchers of a month by reference (resume support). */
async function existing(api: Api, month: string): Promise<Map<string, any>> {
  const r: any = await api.get(`/accounting/vouchers?from=${month}&to=${monthEnd(month)}&search=SL-${month.slice(0, 7)}&pageSize=500`);
  return new Map((r.items as any[]).filter((v) => v.referenceNo?.startsWith('SL-')).map((v) => [v.referenceNo, v]));
}

// ------------------------------------------------------------------------------------------------ opening balances
const opening: Step = {
  name: 'tx.ledger.opening',
  async run(ctx) {
    const years: any[] = await ctx.admin.get('/accounting/fiscal-years');
    const fy = years.find((y) => String(y.startDate).slice(0, 10) === '2024-07-01');
    if (!fy) throw new Error('FY 2024-25 missing (setup.fiscal-years)');
    const cur: any = await ctx.admin.get(`/accounting/opening-balances?year=${fy.id}`);
    if (cur.status !== 'DRAFT') { ctx.log(`  opening balances already ${cur.status}`); ctx.state.ids.ledger = { ...(ctx.state.ids.ledger ?? {}), openingId: cur.id }; return; }
    const mine = [
      { accountId: bank(ctx, 'PRIMARY'), debit: 60_000_000, remarks: 'Meezan Bank: balance per bank certificate' },
      { accountId: bank(ctx, 'COLLECTIONS'), debit: 10_000_000, remarks: 'HBL collections account' },
      { accountId: bank(ctx, 'PAYROLL'), debit: 5_000_000, remarks: 'MCB payroll account' },
      { accountId: cash(ctx, 'HO'), debit: 500_000, remarks: 'Cash count' },
      { accountId: cash(ctx, 'KHI'), debit: 300_000, remarks: 'Cash count' },
      { accountId: cash(ctx, 'ISB'), debit: 200_000, remarks: 'Cash count' },
      { accountId: acct(ctx, '1230-01'), debit: 1_500_000, remarks: 'Rent security deposits (3 premises)' },
      { accountId: acct(ctx, '1230-02'), debit: 500_000, remarks: 'Electricity and gas deposits' },
      { accountId: acct(ctx, '3110-01'), credit: 50_000_000, remarks: 'Paid-up capital: 5,000,000 shares of Rs 10' },
      { accountId: acct(ctx, '2210-01'), credit: 15_000_000, remarks: 'Meezan Bank diminishing musharakah (5 years)' },
      { accountId: acct(ctx, '3120-01'), credit: 13_000_000, remarks: 'Retained earnings brought forward' },
    ];
    const mineIds = new Set(mine.map((l) => l.accountId));
    // Keep any lines another step already put in this batch (e.g. opening stock), replacing only our accounts.
    const others = (cur.lines ?? []).filter((l: any) => !mineIds.has(l.account?.id ?? l.accountId))
      .map((l: any) => ({ id: l.id, accountId: l.account?.id ?? l.accountId, debit: l.debit, credit: l.credit, remarks: l.remarks ?? null }));
    const keep = new Map((cur.lines ?? []).map((l: any) => [l.account?.id ?? l.accountId, l.id]));
    const saved: any = await ctx.admin.put('/accounting/opening-balances', {
      fiscalYearId: fy.id, branchId: br(ctx, 'HO'), suspenseAccountId: acct(ctx, '3120-03'), remarks: 'Balances taken over from the previous system (audited accounts FY 2023-24).',
      lines: [...others, ...mine.map((l) => ({ ...(keep.get(l.accountId) ? { id: keep.get(l.accountId) } : {}), ...l }))],
      rowVersion: cur.rowVersion ?? null,
    });
    const posted: any = await ctx.admin.post(`/accounting/opening-balances/${saved.id}/post`, { rowVersion: saved.rowVersion });
    ctx.state.ids.ledger = { ...(ctx.state.ids.ledger ?? {}), openingId: posted.id };
    ctx.log(`  opening balances posted (${posted.lines?.length ?? mine.length} lines, difference ${posted.difference ?? 0})`);
  },
};

// ------------------------------------------------------------------------------------------------ monthly vouchers
const RENT: Record<string, number> = { HO: 450_000, KHI: 320_000, ISB: 240_000 };
const SIZE: Record<string, number> = { HO: 1, KHI: 0.75, ISB: 0.55 };
/** Electricity follows Pakistan's seasons (summer peak). */
const SEASON = [0.6, 0.6, 0.75, 0.95, 1.25, 1.4, 1.45, 1.4, 1.2, 0.95, 0.7, 0.6];

function monthVouchers(ctx: Ctx, month: string, rng: Rng): V[] {
  const out: V[] = [];
  const m = Number(month.slice(5, 7));
  const days = workDays(month);
  if (!days.length) return out;
  const last = days[days.length - 1];
  const q = (n: number) => Math.round(n / 10) * 10;
  for (const b of ['HO', 'KHI', 'ISB']) {
    const s = SIZE[b];
    const bk = branchBank(ctx, b);
    const cashAcc = cash(ctx, b);
    const fuelWeeks = days.filter((d) => new Date(d + 'T00:00:00Z').getUTCDay() === 6);
    const cashNeed = q((fuelWeeks.length * 70_000 + 120_000) * s + 60_000);
    // Cash funding from the bank at the start of the month (contra).
    out.push({ key: `${b}-CASHFUND`, voucherType: 'CON', date: days[0], branch: b, narration: `Cash withdrawn for ${b} branch expenses`, instrument: 'CHEQUE',
      lines: [{ accountId: cashAcc, debit: cashNeed, particulars: 'Cash drawn from bank' }, { accountId: bk, credit: cashNeed, particulars: 'Self cheque' }] });
    out.push({ key: `${b}-RENT`, voucherType: 'BPV', date: dayOf(month, 5), branch: b, cashBank: bk, party: b === 'HO' ? 'Gulberg Properties' : b === 'KHI' ? 'SITE Estates (Pvt) Ltd' : 'Markaz Holdings', instrument: 'CHEQUE',
      narration: `Office and warehouse rent for ${month.slice(0, 7)}`, lines: [{ accountId: acct(ctx, '5220-01'), debit: RENT[b], costCentreId: cc(ctx, 'ADM', b) }] });
    out.push({ key: `${b}-ELEC`, voucherType: 'BPV', date: dayOf(month, 12), branch: b, cashBank: bk, party: b === 'HO' ? 'LESCO' : b === 'KHI' ? 'K-Electric' : 'IESCO', instrument: 'IBFT',
      narration: `Electricity bill ${month.slice(0, 7)}`, lines: [
        { accountId: acct(ctx, '5220-02'), debit: q(rng.int(150_000, 190_000) * s * SEASON[m - 1]), particulars: 'Warehouse and office', costCentreId: cc(ctx, 'WHS', b) },
      ] });
    out.push({ key: `${b}-GAS`, voucherType: 'CPV', date: dayOf(month, 14), branch: b, cashBank: cashAcc, party: b === 'KHI' ? 'SSGC' : 'SNGPL',
      narration: `Gas and water charges ${month.slice(0, 7)}`, lines: [{ accountId: acct(ctx, '5220-03'), debit: q(rng.int(12_000, 30_000) * s * (m <= 2 || m === 12 ? 1.8 : 1)), costCentreId: cc(ctx, 'ADM', b) }] });
    out.push({ key: `${b}-SEC`, voucherType: 'BPV', date: dayOf(month, 3), branch: b, cashBank: bk, party: 'Shield Security Services', instrument: 'IBFT',
      narration: `Security guards ${month.slice(0, 7)}`, lines: [{ accountId: acct(ctx, '5220-05'), debit: q(165_000 * s), costCentreId: cc(ctx, 'WHS', b) }] });
    out.push({ key: `${b}-TEL`, voucherType: 'BPV', date: dayOf(month, 8), branch: b, cashBank: bk, party: 'PTCL / Jazz Business', instrument: 'IBFT',
      narration: `Telephone, mobile and internet ${month.slice(0, 7)}`, lines: [{ accountId: acct(ctx, '5240-01'), debit: q(rng.int(38_000, 52_000) * s), costCentreId: cc(ctx, 'ADM', b) }] });
    fuelWeeks.forEach((d, i) => out.push({ key: `${b}-FUEL${i + 1}`, voucherType: 'CPV', date: d, branch: b, cashBank: cashAcc, party: 'PSO / Shell fuel stations',
      narration: `Fuel for delivery vans, week ending ${d}`, lines: [
        { accountId: acct(ctx, '5230-02'), debit: q(rng.int(45_000, 70_000) * s), particulars: 'Diesel: delivery fleet', costCentreId: cc(ctx, 'DST', b) },
        ...(rng.chance(0.5) ? [{ accountId: acct(ctx, '5230-02'), debit: q(rng.int(6_000, 15_000) * s), particulars: 'Tyre puncture, oil change', costCentreId: cc(ctx, 'DST', b) }] : []),
      ] }));
    if (rng.chance(0.8)) out.push({ key: `${b}-REP`, voucherType: 'CPV', date: rng.pick(days), branch: b, cashBank: cashAcc, party: rng.pick(['Al-Madina Electric Works', 'Rehman AC Services', 'City Plumbers']),
      narration: rng.pick(['Repair of warehouse lights', 'AC servicing', 'Shutter repair', 'Plumbing work in washrooms', 'Racking bolt replacement']),
      lines: [{ accountId: acct(ctx, '5220-04'), debit: q(rng.int(8_000, 45_000) * s), costCentreId: cc(ctx, 'WHS', b) }] });
    out.push({ key: `${b}-STAT`, voucherType: 'CPV', date: rng.pick(days), branch: b, cashBank: cashAcc, party: 'Paper World Stationers',
      narration: 'Invoice books, printer toner and stationery', lines: [{ accountId: acct(ctx, '5240-02'), debit: q(rng.int(9_000, 26_000) * s), costCentreId: cc(ctx, 'ADM', b) }] });
    if (rng.chance(0.7)) out.push({ key: `${b}-ENT`, voucherType: 'CPV', date: rng.pick(days), branch: b, cashBank: cashAcc, party: null,
      narration: rng.pick(['Tea and refreshments for retailer meeting', 'Lunch with distributor principal team', 'Staff refreshments: month-end closing']),
      lines: [{ accountId: acct(ctx, '5240-04'), debit: q(rng.int(5_000, 22_000) * s), costCentreId: cc(ctx, 'SAL', b) }] });
    out.push({ key: `${b}-FREIGHT`, voucherType: 'CPV', date: rng.pick(days), branch: b, cashBank: cashAcc, party: 'Local loaders',
      narration: 'Loading / unloading and local cartage', lines: [{ accountId: acct(ctx, '5230-01'), debit: q(rng.int(18_000, 40_000) * s), costCentreId: cc(ctx, 'DST', b) }] });
  }
  // Head-office items.
  const ramadan = month.startsWith('2026-02') || month.startsWith('2026-03') || month.startsWith('2025-03');
  out.push({ key: 'HO-ADV', voucherType: 'BPV', date: dayOf(month, 18), branch: 'HO', cashBank: bank(ctx, 'PRIMARY'), party: rng.pick(['Brandcraft Media', 'Signage Hub', 'Retail Activation Co.']), instrument: 'IBFT',
    narration: ramadan ? 'Ramadan trade campaign: shelf branding and POSM' : 'Retail shelf branding and point-of-sale material',
    lines: [{ accountId: acct(ctx, '5230-03'), debit: q(rng.int(120_000, 260_000) * (ramadan ? 3 : 1)), costCentreId: cc(ctx, 'SAL', 'HO') }] });
  out.push({ key: 'HO-SOFT', voucherType: 'BPV', date: dayOf(month, 2), branch: 'HO', cashBank: bank(ctx, 'PRIMARY'), party: 'Accountex subscription and IT support', instrument: 'IBFT',
    narration: 'ERP subscription, email and IT support', lines: [{ accountId: acct(ctx, '5240-09'), debit: 95_000, costCentreId: cc(ctx, 'FIN', 'HO') }] });
  for (const p of ['PRIMARY', 'COLLECTIONS', 'PAYROLL'] as const) {
    out.push({ key: `BANKCHG-${p}`, voucherType: 'BPV', date: last, branch: p === 'COLLECTIONS' ? 'KHI' : 'HO', cashBank: bank(ctx, p), party: null,
      narration: 'Bank charges, SMS alerts and IBFT fees', lines: [{ accountId: acct(ctx, '5310-02'), debit: q(rng.int(2_500, 9_000)), costCentreId: cc(ctx, 'FIN', 'HO') }] });
  }
  out.push({ key: 'PROFIT', voucherType: 'BRV', date: last, branch: 'HO', cashBank: bank(ctx, 'PRIMARY'), party: 'Meezan Bank',
    narration: 'Profit on PLS balance', lines: [{ accountId: acct(ctx, '4220-01'), credit: q(rng.int(90_000, 180_000)) }] });
  out.push({ key: 'MARKUP', voucherType: 'BPV', date: dayOf(month, 25), branch: 'HO', cashBank: bank(ctx, 'PRIMARY'), party: 'Meezan Bank', instrument: 'IBFT',
    narration: 'Diminishing musharakah: rental (mark-up) for the month', lines: [{ accountId: acct(ctx, '5310-01'), debit: 185_000, costCentreId: cc(ctx, 'FIN', 'HO') }] });
  if (m % 3 === 0) {
    out.push({ key: 'LOANREPAY', voucherType: 'BPV', date: dayOf(month, 25), branch: 'HO', cashBank: bank(ctx, 'PRIMARY'), party: 'Meezan Bank', instrument: 'IBFT',
      narration: 'Diminishing musharakah: quarterly unit purchase', lines: [{ accountId: acct(ctx, '2210-01'), debit: 750_000 }] });
    out.push({ key: 'ADVTAX', voucherType: 'BPV', date: dayOf(month, 15), branch: 'HO', cashBank: bank(ctx, 'PRIMARY'), party: 'Federal Board of Revenue', instrument: 'IBFT',
      narration: 'Advance income tax instalment u/s 147', lines: [{ accountId: acct(ctx, '1150-04'), debit: q(rng.int(900_000, 1_400_000)) }] });
    // One mistake per quarter, reversed (shows reversals in the day book and the audit trail).
    out.push({ key: 'MISTAKE', voucherType: 'CPV', date: rng.pick(days), branch: 'HO', cashBank: cash(ctx, 'HO'), party: 'Paper World Stationers', reverse: true,
      narration: 'Courier charges (booked to the wrong head)', lines: [{ accountId: acct(ctx, '5240-05'), debit: q(rng.int(4_000, 9_000)), costCentreId: cc(ctx, 'ADM', 'HO') }] });
  }
  if (m === 7) out.push({ key: 'INSURE', voucherType: 'BPV', date: dayOf(month, 1), branch: 'HO', cashBank: bank(ctx, 'PRIMARY'), party: 'EFU General Insurance', instrument: 'CHEQUE',
    narration: 'Annual stock, fire and vehicle insurance premium', lines: [{ accountId: acct(ctx, '1140-05'), debit: 1_440_000 }] });
  // Insurance amortisation (the policy taken out before the history started is in the opening deposits / prepaid).
  if (month >= '2025-07-01') out.push({ key: 'INSAMORT', voucherType: 'JV', date: last, branch: 'HO', narration: 'Insurance expense for the month (1/12 of annual premium)',
    lines: [{ accountId: acct(ctx, '5240-05'), debit: 120_000, costCentreId: cc(ctx, 'ADM', 'HO') }, { accountId: acct(ctx, '1140-05'), credit: 120_000 }] });
  out.push({ key: 'AUDITACC', voucherType: 'JV', date: last, branch: 'HO', narration: 'Accrued statutory audit fee for the month',
    lines: [{ accountId: acct(ctx, '5240-07'), debit: 75_000, costCentreId: cc(ctx, 'FIN', 'HO') }, { accountId: acct(ctx, '2120-04'), credit: 75_000 }] });
  if (m === 10) out.push({ key: 'AUDITPAY', voucherType: 'BPV', date: dayOf(month, 20), branch: 'HO', cashBank: bank(ctx, 'PRIMARY'), party: 'Riaz Ahmad & Co., Chartered Accountants', instrument: 'CHEQUE',
    narration: 'Statutory audit fee for the year', lines: [{ accountId: acct(ctx, '2120-04'), debit: 900_000 }] });
  if (m === 8) out.push({ key: 'LEGAL', voucherType: 'BPV', date: dayOf(month, 10), branch: 'HO', cashBank: bank(ctx, 'PRIMARY'), party: 'Hassan & Hassan Advocates', instrument: 'CHEQUE',
    narration: 'Legal retainer and SECP annual return filing', lines: [{ accountId: acct(ctx, '5240-06'), debit: 260_000, costCentreId: cc(ctx, 'FIN', 'HO') }] });
  // Surplus cash from Karachi / Islamabad collections deposited at month end.
  out.push({ key: 'KHI-DEPOSIT', voucherType: 'CON', date: last, branch: 'KHI', narration: 'Cash deposited into HBL collections account', instrument: 'CASH_DEPOSIT',
    lines: [{ accountId: bank(ctx, 'COLLECTIONS'), debit: 50_000 }, { accountId: cash(ctx, 'KHI'), credit: 50_000 }] });
  // Transfer to the payroll account before salaries.
  out.push({ key: 'PAYROLLFUND', voucherType: 'CON', date: dayOf(month, 26), branch: 'HO', narration: 'Funds transferred to MCB payroll account', instrument: 'IBFT',
    lines: [{ accountId: bank(ctx, 'PAYROLL'), debit: 4_500_000 }, { accountId: bank(ctx, 'PRIMARY'), credit: 4_500_000 }] });
  return out.filter((v) => v.date >= '2025-04-01' && v.date <= today());
}

function monthStep(month: string): Step {
  return {
    name: `tx.ledger.${month.slice(0, 7)}`,
    async run(ctx) {
      const rng = rngFor(`ledger-${month}`);
      const list = monthVouchers(ctx, month, rng).sort((a, b) => a.date.localeCompare(b.date));
      const have = await existing(ctx.admin, month);
      let made = 0;
      await pool(list, 5, async (v) => {
        const prev = have.get(ref(month, v.key));
        if (prev) { if (prev.status === 'DRAFT') await postDraft(ctx, ctx.admin, await ctx.admin.get(`/accounting/vouchers/${prev.id}`)); return; }
        await postVoucher(ctx, ctx.admin, month, v);
        made++;
      });
      ctx.log(`  ${month.slice(0, 7)}: ${made} vouchers (${list.length} planned)`);
    },
  };
}

export const steps: Step[] = [opening, ...months().flatMap((m) => [monthStep(m), pettyStep(m)]), recurring, claims, budgets, bankRec];
