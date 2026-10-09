import { soft, type Ctx, type Step } from './ctx.ts';
import { as, empByCode, EXIT, walkApproval } from './tx-hr-common.ts';

/**
 * Payroll extras. `tx.payroll.pre.*` steps run before the monthly runs (loans are recovered by the runs that follow);
 * the others run after them. State: ids.payroll.loans = [{ id, docNo, employeeCode, status }].
 */

const primaryBank = (ctx: Ctx) => (ctx.state.ids.company.bankAccounts as any[]).find((b) => b.purpose === 'PRIMARY')!;

/**
 * Two staff loans: requested by HR, approved through the loan workflow, disbursed from the Meezan account. Recovery can't
 * start in a past month (LOAN_INSTALLMENTS_INVALID), so both are current loans recovered from Oct / Nov 2026 runs.
 */
const loans: Step = {
  name: 'tx.payroll.pre.loans',
  async run(ctx) {
    const plan = [
      { code: 'EMP-0013', loanType: 'LOAN', purpose: 'HOUSE', purposeDetail: 'Roof repair before the monsoon', requestedAmount: 150_000, installmentCount: 12, firstDeductionMonth: '2026-10', disburse: '2026-10-02' },
      { code: 'EMP-0019', loanType: 'SALARY_ADVANCE', purpose: 'EDUCATION', purposeDetail: 'Daughter’s school admission fee', requestedAmount: 40_000, installmentCount: 4, firstDeductionMonth: '2026-11', disburse: '2026-10-06' },
    ];
    const existing: any = await ctx.admin.get('/payroll/loans?pageSize=100');
    const out: any[] = [];
    for (const p of plan) {
      const e = empByCode(ctx, p.code);
      let loan = (existing.items ?? existing).find((l: any) => (l.employee?.id ?? l.employeeId) === e.id);
      if (!loan) {
        const { code, disburse, ...body } = p;
        loan = await ctx.admin.post('/payroll/loans', { employeeId: e.id, ...body, remarks: null });
      }
      loan = await walkApproval(ctx, `/payroll/loans/${loan.id}`, (api) => api.post(`/payroll/loans/${loan.id}/approve`, { comment: 'Within policy limits. Approved.' }), (d) => d.status === 'PENDING');
      if (loan.status === 'APPROVED') {
        await ctx.admin.post(`/payroll/loans/${loan.id}/disburse`, { disbursementDate: p.disburse, bankAccountId: primaryBank(ctx).id });
        loan = await ctx.admin.get(`/payroll/loans/${loan.id}`);
      }
      out.push({ id: loan.id, docNo: loan.docNo, employeeCode: p.code, status: loan.status });
      ctx.log(`  loan ${loan.docNo} ${e.name}: ${loan.status}`);
    }
    (ctx.state.ids.payroll ??= { runs: {} }).loans = out;
    ctx.save();
  },
};

/** A self-service medical loan request waiting in the approvals inbox, and tax-credit declarations (pending proof). */
const selfService: Step = {
  name: 'tx.payroll.self-service',
  async run(ctx) {
    const ali = await as(ctx, 'EMP-0008');
    const mine: any = await ali.get('/me/loans');
    if (!(mine.items ?? mine).length) {
      const next = new Date();
      next.setUTCMonth(next.getUTCMonth() + 1);
      await soft(ctx, 'self-service loan', () => ali.post('/me/loans', {
        loanType: 'MEDICAL', purpose: 'MEDICAL', purposeDetail: 'Father’s cataract surgery', requestedAmount: 60_000, installmentCount: 6,
        firstDeductionMonth: next.toISOString().slice(0, 7), remarks: 'Hospital estimate attached',
      }));
    }
    const decl = [
      { code: 'EMP-0003', declarationType: 'VPS_PENSION', amount: 120_000, paidTo: 'Meezan Tahaffuz Pension Fund' },
      { code: 'EMP-0005', declarationType: 'DONATION', amount: 25_000, paidTo: 'Shaukat Khanum Memorial Trust' },
      { code: 'EMP-0016', declarationType: 'HEALTH_INSURANCE', amount: 48_000, paidTo: 'Jubilee Life Insurance' },
      { code: 'EMP-0023', declarationType: 'ZAKAT', amount: 35_000, paidTo: 'Deducted by Meezan Bank' },
    ];
    for (const d of decl) {
      const api = await as(ctx, d.code);
      const have: any = await api.get('/me/tax-declarations');
      if ((have.declarations as any[]).some((x) => x.declarationType === d.declarationType)) continue;
      // Approval needs an uploaded proof (TAX_PROOF_REQUIRED), so these wait in Payroll › Tax declarations.
      await soft(ctx, `tax declaration ${d.code}`, () => api.post('/me/tax-declarations', { declarationType: d.declarationType, amount: d.amount, paidTo: d.paidTo }));
    }
    ctx.log('  self-service loan request and tax declarations');
  },
};

/**
 * Final settlement of the resignation (after the exit month's payroll): start it from the offboarding, calculate,
 * submit, approve through the workflow, pay from the Meezan account, then complete the offboarding (employee EXITED).
 */
export async function finalSettlement(ctx: Ctx) {
  const e = empByCode(ctx, EXIT.code);
  const obs: any = await ctx.admin.get('/hr/offboardings?status=ALL');
  const ob = (obs.items ?? obs).find((o: any) => (o.employee?.id ?? o.employeeId) === e.id);
  if (!ob) return ctx.log('  ! no offboarding for the resignation');
  const found: any = await ctx.admin.get(`/payroll/final-settlements/of-offboarding/${ob.id}`).catch(() => null);
  let fs: any = found?.settlement ?? null;
  if (!fs?.id) fs = await ctx.admin.post('/payroll/final-settlements', { offboardingId: ob.id });
  const get = async () => (fs = await ctx.admin.get(`/payroll/final-settlements/${fs.id}`));
  await get();
  if (fs.status === 'DRAFT') {
    await ctx.admin.post(`/payroll/final-settlements/${fs.id}/calculate`, { rowVersion: fs.rowVersion }).catch(() => ctx.admin.post(`/payroll/final-settlements/${fs.id}/calculate`));
    await get();
    await ctx.admin.post(`/payroll/final-settlements/${fs.id}/submit`, { rowVersion: fs.rowVersion }).catch(() => ctx.admin.post(`/payroll/final-settlements/${fs.id}/submit`));
    await get();
  }
  if (fs.status === 'PENDING_APPROVAL') {
    await walkApproval(ctx, `/payroll/final-settlements/${fs.id}`, (api) => api.post(`/payroll/final-settlements/${fs.id}/approve`, { comment: 'Dues verified with clearance.' }), (d) => d.status === 'PENDING_APPROVAL');
    await get();
  }
  if (fs.status === 'APPROVED') {
    await soft(ctx, 'settlement pay', () => ctx.admin.post(`/payroll/final-settlements/${fs.id}/pay`, { bankAccountId: primaryBank(ctx).id, valueDate: '2026-06-10' }));
    await get();
  }
  const cur: any = await ctx.admin.get(`/hr/offboardings/${ob.id}`);
  if (!['COMPLETED', 'CLOSED'].includes(cur.status)) await soft(ctx, 'offboarding complete', () => ctx.admin.post(`/hr/offboardings/${ob.id}/complete`, { rowVersion: cur.rowVersion }));
  ctx.log(`  final settlement ${fs.docNo}: ${fs.status} · net ${fs.netPayable ?? fs.netAmount ?? ''}`);
}

/** Safety net: settles the resignation if the exit month's run didn't finish it. */
const settlement: Step = { name: 'tx.payroll.settlement', run: finalSettlement };

export const steps: Step[] = [loans, settlement, selfService];
