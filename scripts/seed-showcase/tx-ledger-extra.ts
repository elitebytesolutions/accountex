/**
 * Ledger extras for the showcase company: petty cash (monthly), recurring vouchers, expense claims, budgets and bank
 * statement reconciliation. See tx-ledger.ts for the step list and the state shape (ids.ledger).
 */
import { loadState, soft, type Ctx, type Step } from './ctx.ts';
import { addDays, monthEnd, months, rngFor, today, workDays } from './rng.ts';
import { C, acct, bank, bankAccountId, br, cash, cc, dayOf } from './tx-ledger-lib.ts';

const itemsOf = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? r?.rows ?? []);
const setLedger = (ctx: Ctx, patch: Record<string, unknown>) => { ctx.state.ids.ledger = { ...(ctx.state.ids.ledger ?? {}), ...patch }; };

// ------------------------------------------------------------------------------------------------ petty cash
const PETTY: Record<string, { desc: string; paidTo: string[]; min: number; max: number }> = {
  STATIONERY: { desc: 'Register, pens and photocopies', paidTo: ['Paper World Stationers', 'Ali Photostat'], min: 400, max: 3_500 },
  MEALS: { desc: 'Tea, biscuits and water for staff', paidTo: ['Rehmat Tea Stall', 'Bismillah General Store'], min: 300, max: 2_800 },
  TRAVEL: { desc: 'Rickshaw / Careem to bank and FBR office', paidTo: ['Careem', 'Local rickshaw'], min: 250, max: 1_800 },
  REPAIRS: { desc: 'Minor repairs: locks, bulbs, fans', paidTo: ['Hardware shop', 'Electrician'], min: 600, max: 4_500 },
  COMMUNICATION: { desc: 'Mobile top-up for delivery staff', paidTo: ['Jazz retailer', 'Telenor franchise'], min: 500, max: 2_000 },
  FUEL: { desc: 'Petrol for motorcycle (bank / market runs)', paidTo: ['PSO station'], min: 700, max: 3_000 },
};

/** Petty vouchers for a month (each fund), then a month-end top-up from the bank for exactly the amount spent. */
export function pettyStep(month: string): Step {
  return {
    name: `tx.ledger.petty-${month.slice(0, 7)}`,
    async run(ctx) {
      const rng = rngFor(`petty-${month}`);
      const days = workDays(month);
      if (!days.length) return;
      const spendDays = days.length > 1 ? days.slice(0, -1) : days;
      const funds: any[] = await ctx.admin.get('/cash/petty-funds');
      const cats = new Map((C(ctx).expenseCategories as any[]).map((c) => [c.code, c.id]));
      let count = 0;
      for (const fund of funds) {
        const b = (ctx.state.ids.branches as any[]).find((x) => x.id === fund.branch.id)!.code as string;
        const payFrom = bankAccountId(ctx, b === 'KHI' ? 'COLLECTIONS' : 'PRIMARY');
        // Float: the first time, top the fund up to its imprest before anything is spent.
        const reps = itemsOf(await ctx.admin.get(`/cash/petty/replenishments?fund=${fund.id}&pageSize=500`));
        if (!reps.some((r) => r.fund?.id === fund.id || !r.fund)) {
          await ctx.admin.post(`/cash/petty/funds/${fund.id}/replenish`, { docDate: days[0], payFromBankAccountId: payFrom, payFromCashAccountId: null, amount: fund.imprestAmount, postTogether: true, remarks: 'Opening float of the petty cash fund' });
        }
        const all: any[] = await ctx.admin.all(`/cash/petty/vouchers?fund=${fund.id}`);
        const have = all.filter((v) => String(v.docDate).slice(0, 7) === month.slice(0, 7) && v.status !== 'VOID').length;
        const n = Math.max(4, Math.round(rng.int(8, 12) * (fund.imprestAmount / 50_000)));
        const cap = fund.imprestAmount * 0.75;
        let spent = 0;
        const plan: any[] = [];
        for (let i = 0; i < n; i++) {
          const code = rng.pick(Object.keys(PETTY));
          const p = PETTY[code];
          const amount = Math.round(rng.int(p.min, p.max) / 10) * 10;
          if (spent + amount > cap) break;
          spent += amount;
          const receipts = true; rng.next();
          plan.push({ fundId: fund.id, docDate: rng.pick(spendDays), categoryId: cats.get(code), description: p.desc, paidTo: rng.pick(p.paidTo), amount,
            accountId: null, costCentreId: cc(ctx, 'ADM', b), receiptStatus: receipts ? 'ATTACHED' : 'MISSING', receiptCount: receipts ? 1 : 0 });
        }
        plan.sort((a, c) => a.docDate.localeCompare(c.docDate));
        for (const v of plan.slice(have)) { await ctx.admin.post('/cash/petty/vouchers', v); count++; }
        // Month-end top-up (posts the month's vouchers as expenses, paid from the bank). The current month stays open.
        if (monthEnd(month) >= today()) continue;
        const pending = itemsOf(await ctx.admin.get(`/cash/petty/vouchers?fund=${fund.id}&status=UNREPLENISHED&pageSize=500`));
        const due = Math.round(pending.reduce((a, v) => a + Number(v.amount), 0) * 100) / 100;
        if (due > 0) await ctx.admin.post(`/cash/petty/funds/${fund.id}/replenish`, { docDate: days[days.length - 1], payFromBankAccountId: payFrom, payFromCashAccountId: null, amount: due, postTogether: true, remarks: `Top-up for ${month.slice(0, 7)} vouchers` });
      }
      ctx.log(`  petty ${month.slice(0, 7)}: ${count} vouchers`);
    },
  };
}

// ------------------------------------------------------------------------------------------------ recurring vouchers
/** Three monthly templates, back-filled with one run per month (run-now with the scheduled date). */
export const recurring: Step = {
  name: 'tx.ledger.recurring',
  async run(ctx) {
    const have = itemsOf(await ctx.admin.get('/accounting/recurring-vouchers'));
    const defs = [
      { name: 'Cleaning contract: Head Office', voucherType: 'CPV', runDay: 10 as number | null, last: false, branch: 'HO', cashBankAccountId: cash(ctx, 'HO') as string | null, partyName: 'Sparkle Cleaning Services' as string | null,
        narration: 'Monthly office and warehouse cleaning contract', lines: [{ accountId: acct(ctx, '5220-04'), debit: 42_000, credit: 0, particulars: 'Janitorial staff (3)', costCentreId: cc(ctx, 'ADM', 'HO') }] },
      { name: 'Microsoft 365 and antivirus licences', voucherType: 'BPV', runDay: 1, last: false, branch: 'HO', cashBankAccountId: bank(ctx, 'PRIMARY'), partyName: 'Cloud Solutions Pakistan',
        narration: 'Monthly software licences (35 users)', lines: [{ accountId: acct(ctx, '5240-08'), debit: 58_500, credit: 0, particulars: 'M365 Business Standard + antivirus', costCentreId: cc(ctx, 'FIN', 'HO') }] },
      { name: 'Gratuity provision', voucherType: 'JV', runDay: null, last: true, branch: 'HO', cashBankAccountId: null, partyName: null,
        narration: 'Monthly gratuity provision (actuarial estimate)', lines: [
          { accountId: acct(ctx, '5210-07'), debit: 210_000, credit: 0, particulars: 'Gratuity expense', costCentreId: cc(ctx, 'ADM', 'HO') },
          { accountId: acct(ctx, '2220-01'), debit: 0, credit: 210_000, particulars: 'Gratuity payable', costCentreId: null }] },
    ];
    const out: { id: string; name: string }[] = [];
    for (const d of defs) {
      let t = have.find((x) => x.name === d.name);
      if (!t) {
        t = await ctx.admin.post('/accounting/recurring-vouchers', {
          name: d.name, description: null, voucherType: d.voucherType, frequency: 'MONTHLY', runDay: d.runDay, runOnLastDay: d.last, runWeekday: null, runMonth: null,
          startDate: '2025-04-01', endMode: 'NEVER', endAfterCount: null, endOnDate: null, branchId: br(ctx, d.branch), narration: d.narration,
          cashBankAccountId: d.cashBankAccountId, partyName: d.partyName, autoPost: true, notifyOnFailure: true, lines: d.lines,
        });
      }
      const runs = itemsOf(await ctx.admin.get(`/accounting/recurring-vouchers/${t.id}/runs`));
      const done = new Set(runs.filter((r) => r.voucher).map((r) => String(r.scheduledDate).slice(0, 7)));
      let n = 0;
      for (const m of months()) {
        const date = d.last ? monthEnd(m) : dayOf(m, d.runDay!);
        if (date > today() || done.has(m.slice(0, 7))) continue;
        await ctx.admin.post(`/accounting/recurring-vouchers/${t.id}/run-now`, { date });
        n++;
      }
      out.push({ id: t.id, name: d.name });
      ctx.log(`  recurring "${d.name}": ${n} runs`);
    }
    setLedger(ctx, { recurring: out });
  },
};

// ------------------------------------------------------------------------------------------------ expense claims
/**
 * Claims are filed by the two users with employee records (a claim takes today's date, so these are recent), approved
 * through the approvals inbox by whoever can act, then most are paid by bank transfer. The last one stays pending.
 */
export const claims: Step = {
  name: 'tx.ledger.claims',
  async run(ctx) {
    const rng = rngFor('claims');
    const A = ctx.admin, B = ctx.approver;
    const plan: { by: typeof A; other: typeof A; title: string; cat: string; lines: [string, number, string][] }[] = [
      { by: A, other: B, title: 'Karachi branch visit: air fare and hotel', cat: 'TRAVEL', lines: [['PIA return ticket LHE-KHI', 38_500, 'PIA'], ['Hotel, 2 nights', 27_000, 'Avari Towers'], ['Airport taxi', 3_200, 'Careem']] },
      { by: A, other: B, title: 'Distributor dinner with Nestle team', cat: 'MEALS', lines: [['Dinner for 6', 18_600, 'Village Restaurant']] },
      { by: B, other: A, title: 'Islamabad audit visit: travel', cat: 'TRAVEL', lines: [['Daewoo bus LHE-ISB return', 7_400, 'Daewoo Express'], ['Hotel, 1 night', 14_500, 'Hotel One'], ['Local travel', 2_100, 'inDrive']] },
      { by: B, other: A, title: 'Printer cartridges for accounts', cat: 'STATIONERY', lines: [['HP 85A toner x2', 16_800, 'Hafeez Centre']] },
      { by: A, other: B, title: 'Mobile bill: September', cat: 'COMMUNICATION', lines: [['Postpaid mobile bill', 4_850, 'Jazz']] },
      { by: B, other: A, title: 'Fuel: bank visits', cat: 'FUEL', lines: [['Petrol', 6_200, 'Shell Gulberg']] },
      { by: A, other: B, title: 'Car repair after route visit', cat: 'REPAIRS', lines: [['Tyre change and alignment', 21_000, 'Ghazi Tyres']] },
      { by: B, other: A, title: 'Team lunch: quarter close', cat: 'MEALS', lines: [['Lunch for finance team (5)', 11_400, 'Cafe Aylanto']] },
    ];
    await ensureApproverFinanceRole(ctx);
    const cats = new Map((C(ctx).expenseCategories as any[]).map((c) => [c.code, c.id]));
    const filed = new Map([...itemsOf(await A.get('/me/expense-claims?pageSize=200')), ...itemsOf(await B.get('/me/expense-claims?pageSize=200'))].map((c) => [c.title, c]));
    let made = 0, paid = 0;
    for (const [i, p] of plan.entries()) {
      const body = {
        title: p.title, merchant: null, categoryId: cats.get(p.cat), costCentreId: cc(ctx, p.cat === 'TRAVEL' ? 'ADM' : 'FIN', 'HO'), tripFrom: null, tripTo: null, customerId: null,
        travelRequestRef: null, receiptCount: p.lines.length,
        // Travel and meals can exceed the per-trip limit; the policy then asks for a reason.
        policyJustification: 'Approved business trip / client meeting; actual costs as per attached receipts.',
        lines: p.lines.map(([description, amount, merchant]) => ({ expenseDate: addDays(today(), -rng.int(2, 12)), description, categoryId: cats.get(p.cat), merchant, amount, costCentreId: null })),
      };
      const prev = filed.get(p.title);
      let created: any = prev;
      if (!prev || prev.status === 'DRAFT') {
        if (prev) created = await p.by.patch(`/me/expense-claims/${prev.id}`, { ...body, rowVersion: prev.rowVersion });
        else created = await p.by.post('/me/expense-claims', body);
        await p.by.post(`/me/expense-claims/${created.id}/submit`, { rowVersion: created.rowVersion });
        made++;
      }
      if (i === plan.length - 1) continue; // stays waiting for approval (shows in the inbox)
      if (prev && !['DRAFT', 'SUBMITTED', 'PENDING', 'PENDING_APPROVAL', 'IN_REVIEW', 'APPROVED'].includes(prev.status)) continue;
      for (let step = 0; step < 4; step++) {
        let acted = false;
        for (const u of [p.other, p.by]) {
          const inbox: any = await u.get('/approvals/inbox');
          const item = itemsOf(inbox).find((x) => x.entityId === created.id && x.canAct);
          if (item) { await u.post(`/approvals/${item.id}/approve`, { reason: null, comment: 'Receipts checked.' }); acted = true; break; }
        }
        if (!acted) break;
      }
      const cl: any = await A.get(`/cash/expense-claims/${created.id}`);
      if (cl.status !== 'APPROVED') { ctx.log(`  ! claim "${p.title}" is ${cl.status} after approvals`); continue; }
      if (i % 3 === 2) continue; // approved, not yet paid
      const payer = p.by === A ? B : A;
      const ok = await soft(ctx, `pay claim "${p.title}"`, () => payer.post(`/cash/expense-claims/${created.id}/pay`, { method: 'BANK_TRANSFER', cashAccountId: null, bankAccountId: bankAccountId(ctx, 'PRIMARY'), date: today() }));
      if (ok) paid++;
    }
    ctx.log(`  ${made} expense claims (${paid} paid)`);
  },
};

/**
 * The approver (Finance & HR manager) also needs the Financial Accountant role: the claim workflow's Finance step routes
 * to that role, and the admin can't approve his own claims (self-approval is blocked).
 */
async function ensureApproverFinanceRole(ctx: Ctx): Promise<void> {
  const users: any[] = await ctx.admin.all('/settings/users');
  const u = users.find((x) => String(x.email).startsWith('approver@'));
  if (!u) return;
  const detail: any = await ctx.admin.get(`/settings/users/${u.id}`);
  const roles: any[] = await ctx.admin.all('/settings/roles');
  const fa = roles.find((r) => r.name === 'Financial Accountant');
  const current: string[] = (detail.roles ?? []).map((r: any) => r.id ?? r.roleId).filter(Boolean);
  if (!fa || current.includes(fa.id)) return;
  const employee = roles.find((r) => r.name === 'Employee')?.id;
  const roleIds = [...current.filter((id) => id !== employee), fa.id];
  const branchIds = (detail.branches ?? []).map((b: any) => b.id ?? b.branchId).filter(Boolean);
  await ctx.admin.patch(`/settings/users/${u.id}`, { roleIds, ...(branchIds.length ? { branchIds } : {}), rowVersion: detail.rowVersion });
  ctx.log('  approver: added Financial Accountant role (claim approvals)');
}

// ------------------------------------------------------------------------------------------------ waiting for the books
/** Waits until the trade and payroll steps (other seeder processes) have finished, so budgets / statements see their postings. */
async function waitForBooks(ctx: Ctx, what: string): Promise<void> {
  const trade = (await import('./tx-trade.ts')).steps.map((s) => s.name);
  const payroll = (await import('./tx-payroll.ts')).steps.map((s) => s.name);
  const deadline = Date.now() + 4 * 60 * 60_000;
  for (;;) {
    const done = new Set(loadState().done);
    const pending = [...trade, ...payroll].filter((n) => !done.has(n));
    if (trade.length && pending.length === 0) return;
    // Not marked done, so the next `npm run seed:showcase` runs it once the books are complete.
    if (Date.now() > deadline) throw new Error(`${what}: ${pending.length} trade/payroll steps still pending after 4 hours; run the seeder again once they finish`);
    ctx.log(`  ${what}: waiting for ${trade.length ? `${pending.length} trade/payroll steps` : 'the trade steps to exist'}…`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

// ------------------------------------------------------------------------------------------------ budgets
/** Revenue and expense actuals per account for each fiscal month (index 0 = July) of one branch, from the trial balance. */
async function actuals(ctx: Ctx, fyStart: string, branchId: string): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(fyStart + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + i);
    const from = d.toISOString().slice(0, 10);
    if (from > today()) break;
    const tb: any = await ctx.admin.get(`/reports/trial-balance?from=${from}&to=${monthEnd(from)}&branch=${branchId}`);
    for (const r of itemsOf(tb)) {
      const id = r.accountId ?? r.account?.id ?? r.id;
      const code = String(r.code ?? r.account?.code ?? '');
      const cls = Number(r.accountClass ?? r.account?.accountClass ?? code[0]);
      if (!id || !(cls >= 4) || r.kind === 'GROUP' || r.isGroup) continue;
      const dr = Number(r.movementDr ?? 0), cr = Number(r.movementCr ?? 0);
      const arr = out.get(id) ?? new Array(12).fill(0);
      arr[i] = Math.abs(dr - cr);
      out.set(id, arr);
    }
  }
  return out;
}

/** Operating budget per branch for FY 2025-26 (≈ actuals ±8%) and FY 2026-27 (+15%), submitted and approved. */
export const budgets: Step = {
  name: 'tx.ledger.budgets',
  async run(ctx) {
    await waitForBooks(ctx, 'budgets');
    const rng = rngFor('budgets');
    const years: any[] = await ctx.admin.get('/accounting/fiscal-years');
    const fy26 = years.find((y) => String(y.startDate).startsWith('2025-07'));
    const fy27 = years.find((y) => String(y.startDate).startsWith('2026-07'));
    const have = itemsOf(await ctx.admin.get('/accounting/budgets?pageSize=200'));
    const out: { id: string; code: string }[] = [];
    for (const b of ['HO', 'KHI', 'ISB']) {
      const base = await actuals(ctx, '2025-07-01', br(ctx, b));
      const bname = (ctx.state.ids.branches as any[]).find((x) => x.code === b).name;
      for (const [fy, label, factor] of [[fy26, 'FY 2025-26', 1], [fy27, 'FY 2026-27', 1.15]] as const) {
        const name = `Operating budget ${label}: ${bname}`;
        let bud = have.find((x) => x.name === name);
        if (!bud) bud = await ctx.admin.post('/accounting/budgets', { name, fiscalYearId: fy.id, budgetType: 'OPERATING', department: null, costCentreId: null, projectId: null, branchId: br(ctx, b), ownerUserId: null, seedFrom: 'BLANK', seedUpliftPct: null, requiresCeoApproval: false });
        let detail: any = await ctx.admin.get(`/accounting/budgets/${bud.id}`);
        out.push({ id: bud.id, code: detail.code });
        if (detail.status === 'APPROVED') continue;
        const v = detail.version;
        if (!v) continue;
        if (v.status === 'DRAFT') {
          const lines = [...base.entries()].filter(([, m]) => m.some((x) => x > 0)).map(([accountId, m]) => {
            const nz = m.filter((x) => x > 0);
            const avg = nz.reduce((a, x) => a + x, 0) / Math.max(1, nz.length);
            return { accountId, costCentreId: null, months: m.map((x) => Math.round(((x > 0 ? x : avg) * factor * (1 + (rng.next() - 0.5) * 0.16)) / 1000) * 1000) };
          });
          if (!lines.length) { ctx.log(`  ! ${name}: no actuals yet, left empty`); continue; }
          await ctx.admin.put(`/accounting/budgets/versions/${v.id}/lines`, { rowVersion: v.rowVersion, lines });
          await ctx.admin.post(`/accounting/budgets/versions/${v.id}/submit`);
        }
        await soft(ctx, `approve ${name}`, () => ctx.approver.post(`/accounting/budgets/versions/${v.id}/approve`));
        detail = await ctx.admin.get(`/accounting/budgets/${bud.id}`);
        ctx.log(`  ${name}: ${detail.status}`);
      }
    }
    setLedger(ctx, { budgets: out });
  },
};

// ------------------------------------------------------------------------------------------------ bank statements + reconciliation
/** GL balance of an account at a date (the reconciliation compares the statement with this, opening balances included). */
async function glBalance(ctx: Ctx, accountId: string, on: string): Promise<number> {
  const tb: any = await ctx.admin.get(`/reports/trial-balance?from=2024-07-01&to=${on}`);
  const r = itemsOf(tb).find((x) => x.accountId === accountId);
  return r ? Math.round((Number(r.closingDr) - Number(r.closingCr)) * 100) / 100 : 0;
}

/**
 * For each bank account and each finished month: a statement built from the posted bank book (cheques clear 1–3 days
 * later; the month's last cheque payment clears next month, so it shows as outstanding), plus a small bank-only fee line
 * booked through the reconciliation's adjustment. The first statement also carries everything before April 2025.
 * Statement closing = GL balance at month end + fee + outstanding cheque. Then: create (auto-matches) → adjust → complete.
 */
export const bankRec: Step = {
  name: 'tx.ledger.bank-rec',
  async run(ctx) {
    // SEED_BANKREC_ONLY=<last4>:<YYYY-MM> limits a run to one account up to one month (for trying the step early).
    const only = process.env.SEED_BANKREC_ONLY?.split(':');
    if (!only) await waitForBooks(ctx, 'bank reconciliation');
    const rng = rngFor('bank-rec');
    const finished = months().filter((m) => monthEnd(m) < today() && (!only || m.slice(0, 7) <= only[1]));
    const opts: any = await ctx.admin.get('/bank/banking-options');
    let recs = 0;
    for (const ba of (opts.bankAccounts as any[]).filter((b) => !only || b.last4 === only[0])) {
      const closed = new Set(itemsOf(await ctx.admin.get(`/bank/reconciliations?account=${ba.id}&pageSize=200`))
        .filter((r) => (r.bankAccount?.id ?? ba.id) === ba.id && r.status === 'CLOSED').map((r) => String(r.periodTo).slice(0, 7)));
      for (const m of finished) {
        if (closed.has(m.slice(0, 7))) continue;
        // Every booked row up to month end that is not on a statement yet (older items clear early in this month).
        const book: any = await ctx.admin.get(`/bank/book?account=${ba.id}&from=2024-07-01&to=${monthEnd(m)}`);
        const rows: any[] = (book.rows ?? []).filter((r: any) => !r.statementLineId);
        const isCheque = (r: any) => /cheque/i.test(String(r.paymentMode ?? '')) || !!r.cheque;
        const lastCheque = [...rows].reverse().find((r) => Number(r.withdrawal) > 0 && isCheque(r) && String(r.txnDate) >= m) ?? null;
        const lines: any[] = [];
        for (const r of rows) {
          if (r === lastCheque) continue;
          const amt = Math.round((Number(r.deposit) - Number(r.withdrawal)) * 100) / 100;
          if (!amt) continue;
          const dt = String(r.txnDate).slice(0, 10);
          let clear = dt < m ? addDays(m, rng.int(0, 3)) : isCheque(r) ? addDays(dt, rng.int(1, 3)) : dt;
          if (clear > monthEnd(m)) clear = monthEnd(m);
          lines.push({ txnDate: clear, valueDate: null, description: String(r.description ?? 'Bank transaction').slice(0, 300), reference: r.cheque?.chequeNo ?? r.reference ?? r.voucher?.docNo ?? null, amount: amt });
        }
        const fee = -rng.int(150, 600);
        lines.push({ txnDate: monthEnd(m), valueDate: null, description: 'SMS alert and e-statement charges', reference: null, amount: fee });
        lines.sort((a, b) => a.txnDate.localeCompare(b.txnDate));
        const outstanding = lastCheque ? Number(lastCheque.withdrawal) : 0;
        const closing = Math.round(((await glBalance(ctx, ba.accountId, monthEnd(m))) + fee + outstanding) * 100) / 100;
        let bal = Math.round((closing - lines.reduce((a, l) => a + l.amount, 0)) * 100) / 100;
        for (const l of lines) { bal = Math.round((bal + l.amount) * 100) / 100; l.runningBalance = bal; }
        await ctx.admin.post('/bank/statement-imports', {
          bankAccountId: ba.id, fileName: `${String(ba.bankName).replace(/s+/g, '-')}-${ba.last4}-${m.slice(0, 7)}.csv`,
          layout: { delimiter: ',', headerRows: 1, dateFormat: 'DD/MM/YYYY', columns: { date: 0, valueDate: null, description: 1, reference: 2, amount: 3, debit: null, credit: null, balance: 4 } },
          lines,
        });
        let rec: any = await ctx.admin.post('/bank/reconciliations', { bankAccountId: ba.id, periodTo: monthEnd(m), statementBalance: closing, remarks: `Statement ${m.slice(0, 7)}` });
        const fees = itemsOf(rec.statement ?? []).filter((l: any) => !l.matchId && /SMS alert/.test(String(l.description)));
        if (fees.length) {
          const r: any = await ctx.admin.post(`/bank/reconciliations/${rec.id}/adjustments`, { statementLineIds: fees.map((l: any) => l.id), accountId: acct(ctx, '5310-02'), rowVersion: rec.rowVersion });
          rec = r.reconciliation ?? r;
        }
        const done = await soft(ctx, `complete reconciliation ${ba.last4} ${m.slice(0, 7)} (difference ${rec.difference})`, () => ctx.admin.post(`/bank/reconciliations/${rec.id}/complete`, { rowVersion: rec.rowVersion }));
        if (!done) { ctx.log(`  ! ${ba.last4}: reconciliation ${m.slice(0, 7)} left open; stopping this account`); break; }
        recs++;
      }
    }
    if (only) throw new Error(`SEED_BANKREC_ONLY run finished (${recs} reconciliations); not marking the step done`);
    ctx.log(`  ${recs} bank reconciliations completed`);
  },
};
