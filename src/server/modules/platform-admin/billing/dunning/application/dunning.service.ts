import { Injectable } from '@nestjs/common';
import type {
  AdminSession, BillingRunResult, DunningAttemptInput, DunningCaseDetail, DunningClose, DunningPromise, DunningQueue, TenantDunningState,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type AuditContext, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { TenantStore } from '../../../tenants/tenants/application/tenant-store.js';
import { todayPk } from '../../../tenants/subscriptions/domain/billing.js';
import { PaymentStore } from '../../payments/application/payment-store.js';
import { daysOverdue, retryPlan } from '../domain/dunning-schedule.js';
import { DunningStore, type ActivePolicy, type AdvanceResult, type OverdueInvoice } from './dunning-store.js';

const closed = () => new ConflictError('This dunning case is closed.', undefined, { code: 'DUNNING_CASE_CLOSED' });
const stale = () => new ConcurrencyError('Someone else changed this dunning case. Reload and try again.');
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Dunning cases (Super Admin › Billing › Dunning & Collections). One case per overdue invoice, opened under the active
 * policy with its retry plan; the database moves it GRACE → READ_ONLY → SUSPENDED → COLLECTIONS and sets the company's
 * status (Platform.dunningCaseAdvance / dunningTenantSync). A company that becomes SUSPENDED loses every open session,
 * the same as a manual suspension. No payment gateway exists: a retry records the result of a manual attempt.
 */
@Injectable()
export class DunningService {
  constructor(
    private readonly store: DunningStore,
    private readonly payments: PaymentStore,
    private readonly tenants: TenantStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async queue(): Promise<DunningQueue> {
    const [rows, kpis, policy] = await Promise.all([this.store.queue(todayPk()), this.store.kpis(), this.store.activePolicy()]);
    return { rows, kpis, policy: policy && summary(policy) };
  }

  async get(id: string): Promise<DunningCaseDetail> {
    const c = await this.store.detail(id, todayPk());
    if (!c) throw new NotFoundError('Dunning case not found');
    return c;
  }

  async tenantState(tenantId: string): Promise<TenantDunningState> {
    const t = await this.store.tenantStatus(tenantId);
    if (!t) throw new NotFoundError('Company not found');
    const [caseId, policy] = await Promise.all([this.store.caseForTenant(tenantId), this.store.activePolicy()]);
    return { case: caseId ? await this.store.detail(caseId, todayPk()) : null, policy: policy && summary(policy), tenantStatus: t.status };
  }

  /**
   * The dunning half of a billing run: opens a case for every overdue invoice without one, then advances every open
   * case by the policy. Each case runs in its own transaction (one failure doesn't stop the rest).
   */
  async run(context: AuditContext, asOf: string, result: BillingRunResult): Promise<void> {
    const overdue = await this.store.overdueWithoutCase(asOf);
    const policy = overdue.length ? await this.store.activePolicy() : null;
    if (overdue.length && !policy) {
      result.errors.push({ subject: 'Dunning', message: `No active dunning policy: ${overdue.length} overdue invoice(s) have no dunning case` });
    }
    const opened = new Set<string>();
    if (policy) {
      for (const inv of overdue) {
        try {
          const r = await this.unitOfWork.run(context, async () => this.advanceInTx(await this.openCase(inv, policy), asOf, false));
          opened.add(r.caseId);
          result.casesOpened += 1;
          this.collect(result, r, inv.tenantName);
        } catch (e) {
          result.errors.push({ subject: inv.docNo ?? inv.invoiceId, message: message(e) });
        }
      }
    }
    for (const id of await this.store.openCaseIds()) {
      if (opened.has(id)) continue;
      try {
        const r = await this.unitOfWork.run(context, () => this.advanceInTx(id, asOf, false));
        this.collect(result, r);
      } catch (e) {
        result.errors.push({ subject: `Dunning case ${id}`, message: message(e) });
      }
    }
    for (const s of result.statusChanges) if (!s.tenantName) s.tenantName = (await this.store.tenantStatus(s.tenantId))?.name ?? s.tenantId;
  }

  /** After a payment: advances the invoice's open case inside the caller's transaction (recovered when paid in full). */
  async afterPayment(invoiceId: string): Promise<void> {
    const c = await this.store.caseForInvoice(invoiceId);
    if (c && !c.closed) await this.advanceInTx(c.id, todayPk(), false);
  }

  /** "Retry": records a manual attempt's result as a payment (succeeded or failed) on the case's next scheduled retry. */
  async attempt(admin: AdminSession, meta: RequestMeta, id: string, input: DunningAttemptInput): Promise<DunningCaseDetail> {
    const c = await this.openCase0(id, input.rowVersion);
    if (c.balance <= 0) throw new ConflictError('The invoice has no balance left.', undefined, { code: 'INVOICE_NOT_PAYABLE' });
    const amount = input.result === 'SUCCEEDED' ? (input.amount ?? c.balance) : c.balance;
    if (amount > c.balance) throw new ConflictError('The payment is more than the invoice\'s balance.', { amount: ['At most the balance'] }, { code: 'PAYMENT_EXCEEDS_BALANCE' });
    const today = todayPk();
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      const paymentId = await this.payments.insert({
        tenantId: c.tenantId, invoiceId: c.invoiceId, paymentMethod: input.method, paymentRef: input.paymentRef ?? null, amount, status: input.result,
        paidAt: input.result === 'SUCCEEDED' ? new Date() : null, failureMessage: input.result === 'FAILED' ? input.failureReason : null, staffId: admin.staffId,
      });
      await this.store.recordAttempt(id, {
        method: input.method, status: input.result, paymentId, failureReason: input.result === 'FAILED' ? input.failureReason : null,
        staffId: admin.staffId, planDay: daysOverdue(c.dueOn, today),
      });
      await this.store.save({
        id, rowVersion: input.rowVersion, attemptsCount: c.attemptsCount + 1, paymentMethod: input.method,
        ...(input.result === 'FAILED' && { lastFailureReason: input.failureReason }),
      });
      await this.advanceInTx(id, today, false);
    });
    return this.get(id);
  }

  /** Promise to pay: pauses retries (by default) until the date and can lift read-only meanwhile. */
  async promise(admin: AdminSession, meta: RequestMeta, id: string, input: DunningPromise): Promise<DunningCaseDetail> {
    await this.openCase0(id, input.rowVersion);
    const today = todayPk();
    if (input.promiseDate < today) throw new ValidationError('The promised date can\'t be in the past', { promiseDate: ['Today or later'] });
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      await this.store.save({
        id, rowVersion: input.rowVersion, stage: 'PROMISE', promiseDate: input.promiseDate, promiseAmount: input.promiseAmount ?? null,
        promiseSource: input.promiseSource, promiseNote: input.promiseNote, promiseLiftReadOnly: input.liftReadOnly, promiseRemindOwner: input.remindOwner,
        promiseLoggedByStaffId: admin.staffId, retriesPaused: input.pauseRetries,
      });
      await this.advanceInTx(id, today, false);
    });
    return this.get(id);
  }

  /** Closes the case without collecting (settled outside, disputed, waived): CANCELLED, the company's access is restored. */
  async resolve(admin: AdminSession, meta: RequestMeta, id: string, input: DunningClose): Promise<DunningCaseDetail> {
    return this.close(admin, meta, id, input, 'CANCELLED');
  }

  /** Writes the debt off: the invoice becomes UNCOLLECTIBLE and the case WRITTEN_OFF. */
  async writeOff(admin: AdminSession, meta: RequestMeta, id: string, input: DunningClose): Promise<DunningCaseDetail> {
    return this.close(admin, meta, id, input, 'WRITTEN_OFF');
  }

  /** Moves the case one stage on now (GRACE → READ_ONLY → SUSPENDED → COLLECTIONS). */
  async escalate(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<DunningCaseDetail> {
    const c = await this.openCase0(id, rowVersion);
    if (c.stage === 'COLLECTIONS') throw new ConflictError('The case is already in collections. Archive or churn the company by hand.', undefined, { code: 'DUNNING_CASE_CLOSED' });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.advanceInTx(id, todayPk(), true));
    return this.get(id);
  }

  private async close(admin: AdminSession, meta: RequestMeta, id: string, input: DunningClose, stage: 'CANCELLED' | 'WRITTEN_OFF') {
    const c = await this.openCase0(id, input.rowVersion);
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      await this.store.cancelScheduled(id);
      if (stage === 'WRITTEN_OFF') await this.store.markUncollectible(c.invoiceId);
      await this.store.save({ id, rowVersion: input.rowVersion, stage, closedAt: new Date().toISOString(), nextRetryAt: null, nextRetryMethod: null, retriesPaused: false });
      await this.store.tenantSync(c.tenantId);
      if (admin.staffId) {
        await this.tenants.addNote(c.tenantId, admin.staffId, `Dunning case for ${c.docNo ?? 'invoice'} ${stage === 'WRITTEN_OFF' ? 'written off' : 'resolved'}: ${input.reason}`);
      }
    });
    return this.get(id);
  }

  private async openCase(inv: OverdueInvoice, policy: ActivePolicy): Promise<string> {
    return this.store.open({
      tenantId: inv.tenantId, invoiceId: inv.invoiceId, policyId: policy.id, amountDue: inv.balance, paymentMethod: inv.paymentMethod,
      attempts: retryPlan(inv.dueOn, policy, inv.paymentMethod),
    });
  }

  /** Advances inside the caller's transaction; a company that becomes SUSPENDED loses its open sessions. */
  private async advanceInTx(id: string, asOf: string, escalate: boolean): Promise<AdvanceResult> {
    const r = await this.store.advance(id, asOf, escalate);
    if (r.tenantStatus === 'SUSPENDED' && r.tenantBefore !== 'SUSPENDED') await this.tenants.revokeSessions(r.tenantId, 'TENANT_SUSPENDED');
    return r;
  }

  private collect(result: BillingRunResult, r: AdvanceResult, tenantName = '') {
    if (r.stage !== r.stageBefore) result.casesAdvanced += 1;
    if (r.stage === 'RECOVERED' && r.stageBefore !== 'RECOVERED') result.casesRecovered += 1;
    if (r.tenantBefore && r.tenantStatus && r.tenantBefore !== r.tenantStatus) {
      result.statusChanges.push({ tenantId: r.tenantId, tenantName, before: r.tenantBefore, after: r.tenantStatus });
    }
  }

  private async openCase0(id: string, rowVersion: number) {
    const c = await this.get(id);
    if (c.closedAt) throw closed();
    if (c.rowVersion !== rowVersion) throw stale();
    return c;
  }
}

const summary = (p: ActivePolicy) => ({
  id: p.id, name: p.name, graceDays: p.graceDays, readOnlyDays: p.readOnlyDays, suspendedDays: p.suspendedDays, retryHour: p.retryHour, salaryRetryDays: p.salaryRetryDays,
});
