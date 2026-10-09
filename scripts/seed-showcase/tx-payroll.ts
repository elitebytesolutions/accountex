import { soft, type Ctx, type Step } from './ctx.ts';
import { monthEnd, today } from './rng.ts';
import { finalSettlement, steps as extraSteps } from './tx-payroll-extra.ts';
import { EXIT, walkApproval } from './tx-hr-common.ts';

/**
 * Payroll, one regular run per completed month (Apr 2025 → last month): the admin creates, calculates and submits it,
 * the workflow's approvers act on it (HR manager Ayesha Malik, then financial accountant Sana Iqbal; self-approval is refused), then the admin posts it (GL voucher + payslips
 * published to self-service) and pays it by bulk upload from the MCB payroll account. Approving locks the month's
 * attendance, so each month runs after that month's tx.hr step. State: ids.payroll.runs[YYYY-MM] = { id, docNo, status }.
 */

const payrollBank = (ctx: Ctx) => (ctx.state.ids.company.bankAccounts as any[]).find((b) => b.purpose === 'PAYROLL')!;

async function existingRun(ctx: Ctx, month: string): Promise<any | null> {
  const list: any = await ctx.admin.get(`/payroll/runs?year=${month.slice(0, 4)}&pageSize=100`);
  return (list.items ?? list).find((r: any) => String(r.payrollMonth).slice(0, 7) === month && r.runType === 'REGULAR' && !['CANCELLED', 'REVERSED'].includes(r.status)) ?? null;
}

/** Moves a run through its life to PAID, continuing from whatever state a previous attempt left it in. */
async function runMonth(ctx: Ctx, month: string) {
  const payDate = monthEnd(`${month}-01`);
  let run = await existingRun(ctx, month);
  if (!run) {
    const opts: any = await ctx.admin.get('/payroll/runs/options');
    run = await ctx.admin.post('/payroll/runs', {
      runType: 'REGULAR', payrollMonth: month, payDate, salaryPayableAccountId: opts.defaultPayableAccountId, branchIds: [],
      narration: `Salaries for ${new Date(`${month}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`,
    });
  }
  const get = async () => (run = await ctx.admin.get(`/payroll/runs/${run.id}`));
  await get();
  if (['DRAFT', 'REVIEW'].includes(run.status) && !run.calculatedAt) {
    await soft(ctx, 'push overtime', () => ctx.admin.post('/payroll/runs/push-overtime', { month }));
    await ctx.admin.post(`/payroll/runs/${run.id}/calculate`);
    await get();
  }
  if (run.status === 'REVIEW') {
    for (const c of run.checklist ?? []) if (!c.isDone) await soft(ctx, `checklist ${c.itemKey}`, () => ctx.admin.put(`/payroll/runs/${run.id}/checklist`, { itemKey: c.itemKey, isDone: true }));
    await ctx.admin.post(`/payroll/runs/${run.id}/submit`);
    await get();
  }
  if (run.status === 'AWAITING_APPROVAL') {
    // HR manager step, then the financial accountant step (the preparer may not approve).
    await walkApproval(ctx, `/payroll/runs/${run.id}`, (api) => api.post(`/payroll/runs/${run.id}/approve`, { comment: 'Checked against attendance and salary changes. Approved.' }), (d) => d.status === 'AWAITING_APPROVAL');
    await get();
  }
  if (run.status === 'APPROVED') { await ctx.admin.post(`/payroll/runs/${run.id}/post`, { publishToEss: true, createDepositReminders: true }); await get(); }
  if (run.status === 'POSTED') {
    await ctx.admin.post(`/payroll/runs/${run.id}/pay`, { paymentMethod: 'BULK_UPLOAD', bankAccountId: payrollBank(ctx).id, valueDate: payDate, instructionRef: `SAL-${month}`, fileFormat: 'CSV' });
    await get();
  }
  const runs = (ctx.state.ids.payroll ??= { runs: {} }).runs;
  runs[month] = { id: run.id, docNo: run.docNo, status: run.status };
  ctx.save();
  ctx.log(`  ${month}: ${run.docNo} ${run.status} · ${run.employeeCount} employees · gross ${run.grossAmount} · net ${run.netAmount}`);
  // The resignation is settled once its last month is paid, so later runs no longer include the employee.
  if (month === EXIT.exitDate.slice(0, 7)) await finalSettlement(ctx);
}

/**
 * The month's payroll step (only for months that have ended). tx-hr.ts places it right after that month's attendance,
 * so the exit month's settlement (employee EXITED) happens before later months' attendance is built.
 */
export const payrollStep = (month: string): Step | null =>
  monthEnd(month) < today() ? { name: `tx.payroll.${month.slice(0, 7)}`, run: (ctx) => runMonth(ctx, month.slice(0, 7)) } : null;

/** Payroll extras (loans, settlement safety net, self-service); the monthly runs are interleaved in tx-hr.ts. */
export const steps: Step[] = extraSteps;
