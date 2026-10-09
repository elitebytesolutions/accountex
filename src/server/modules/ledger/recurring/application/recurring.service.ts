import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ONE_SIDED, recurringErrors, type RecurringInput, type RecurringTemplate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type AuditContext, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { VoucherStore } from '../../vouchers/application/voucher-store.js';
import { RecurringStore } from './recurring-store.js';

const today = () => new Date().toISOString().slice(0, 10);
const nextDay = (d: string) => new Date(Date.parse(d) + 86_400_000).toISOString().slice(0, 10);
const details = (e: Record<string, string>) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]]));
const HOUR = 3_600_000;
/** A template that fell behind (server down) catches up at most this many runs per pass. */
const MAX_CATCH_UP = 24;

/**
 * Recurring vouchers: templates that the hourly job turns into vouchers on their schedule (posted when auto-post is on).
 * The same job reverses posted journal vouchers whose auto-reverse date has come.
 */
@Injectable()
export class RecurringService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('RecurringVouchers');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly store: RecurringStore,
    private readonly vouchers: VoucherStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    if (process.env.RECURRING_JOB === 'off') return;
    setTimeout(() => void this.tick(), 60_000).unref();
    this.timer = setInterval(() => void this.tick(), HOUR);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  async get(user: SessionUser, id: string) {
    const t = await this.store.get(user.tenantId, id);
    if (!t) throw new NotFoundError('Recurring template not found');
    return t;
  }

  async runs(user: SessionUser, id: string) {
    await this.get(user, id);
    return this.store.runs(user.tenantId, id);
  }

  async create(user: SessionUser, meta: RequestMeta, input: RecurringInput) {
    const data = await this.validate(user, input);
    const nextRunDate = input.frequency === 'NONE' ? null : await this.store.firstRun(input.startDate!, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...data, nextRunDate, status: 'ACTIVE' }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: RecurringInput & { rowVersion: number }) {
    const cur = await this.current(user, id, input.rowVersion);
    const data = await this.validate(user, input, cur);
    const from = cur.lastRunDate && nextDay(cur.lastRunDate) > input.startDate! ? nextDay(cur.lastRunDate) : input.startDate!;
    const nextRunDate = input.frequency === 'NONE' ? null : await this.store.firstRun(from, input);
    const status = cur.status === 'FAILED' ? 'ACTIVE' : cur.status;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...data, id, rowVersion: input.rowVersion, nextRunDate, status, lastError: null }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    await this.current(user, id, rowVersion);
    if (await this.store.hasRuns(user.tenantId, id)) throw new ConflictError('This template has already run; its run history is kept. Pause it instead.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.delete(user.tenantId, id, rowVersion));
  }

  async pause(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: 'PAUSED' }));
    return this.get(user, id);
  }

  async resume(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const t = await this.current(user, id, rowVersion);
    if (t.frequency === 'NONE') throw new ValidationError('This template has no schedule; run it manually.');
    const due = t.nextRunDate && t.nextRunDate >= today() ? t.nextRunDate : await this.store.firstRun(today(), t);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: 'ACTIVE', lastError: null, nextRunDate: due }));
    return this.get(user, id);
  }

  /** Creates (and posts, with auto-post) today's voucher now. Paused templates record a skipped run. */
  async runNow(user: SessionUser, meta: RequestMeta, id: string, date?: string) {
    await this.get(user, id);
    const on = date ?? today();
    if ((await this.store.runs(user.tenantId, id)).some((r) => r.status === 'SUCCESS' && r.scheduledDate === on)) throw new ConflictError(`This template has already run for ${on}.`);
    const voucherId = await this.unitOfWork.run(actorContext(user, meta), () => this.store.run(id, on, 'MANUAL'));
    const template = await this.get(user, id);
    const runs = await this.store.runs(user.tenantId, id);
    return { voucherId, template, run: runs[0] ?? null };
  }

  /** Runs this company's due templates and auto-reversals now (the hourly job does the same for every company). */
  async runDue(user: SessionUser, meta: RequestMeta) {
    const r = await this.runDueFor(user.tenantId, (work) => this.unitOfWork.run(actorContext(user, meta), work), 'MANUAL');
    const reversed = await this.autoReverse(user.tenantId, actorContext(user, meta));
    return { ...r, reversed };
  }

  // ---------------------------------------------------------------- job
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      for (const tenantId of await this.store.tenants()) {
        const ctx: AuditContext = { userId: null, tenantId, correlationId: randomUUID(), actorLabel: 'recurring-vouchers' };
        const r = await this.runDueFor(tenantId, (work) => this.unitOfWork.run(ctx, work), 'SCHEDULE');
        const reversed = await this.autoReverse(tenantId, ctx);
        if (r.runs || reversed) this.log.log(`tenant ${tenantId}: ${r.runs} recurring run(s), ${r.failed} failed; ${reversed} auto-reversal(s)`);
      }
    } catch (err) {
      this.log.error(`Recurring voucher job failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async runDueFor(tenantId: string, inTx: <T>(work: () => Promise<T>) => Promise<T>, trigger: 'MANUAL' | 'SCHEDULE') {
    const now = today();
    let runs = 0;
    let failed = 0;
    for (const t of await this.store.due(tenantId, now)) {
      let date: string | null = t.nextRunDate;
      for (let i = 0; date && date <= now && i < MAX_CATCH_UP; i++) {
        const runDate: string = date;
        let voucherId: string | null = null;
        try {
          voucherId = await inTx(() => this.store.run(t.id, runDate, trigger));
        } catch (err) {
          this.log.warn(`Recurring template ${t.id} on ${runDate} failed: ${(err as Error).message}`);
        }
        runs++;
        const after = await this.store.get(tenantId, t.id);
        if (!voucherId) { failed++; break; }
        date = after?.status === 'ACTIVE' ? after.nextRunDate : null;
      }
    }
    return { runs, failed };
  }

  private async autoReverse(tenantId: string, ctx: AuditContext) {
    let n = 0;
    for (const v of await this.vouchers.dueAutoReversals(tenantId, today())) {
      try {
        await this.unitOfWork.run({ ...ctx, correlationId: randomUUID() }, () => this.vouchers.reverse(v.id, v.autoReverseOn, 'OTHER', 'Automatic reversal on the auto-reverse date'));
        n++;
      } catch (err) {
        this.log.warn(`Auto-reversal of voucher ${v.id} failed: ${(err as Error).message}`);
      }
    }
    return n;
  }

  // ---------------------------------------------------------------- helpers
  private async validate(user: SessionUser, input: RecurringInput, cur?: RecurringTemplate) {
    const e = recurringErrors(input);
    const opts = await this.vouchers.options(user.tenantId);
    const postable = new Set(opts.accounts.map((a) => a.id));
    input.lines.forEach((l, i) => {
      if (!postable.has(l.accountId)) e[`lines.${i}.accountId`] = 'Choose an active postable account';
      if (l.costCentreId && !opts.costCentres.some((c) => c.id === l.costCentreId)) e[`lines.${i}.costCentreId`] = 'Choose an active cost centre';
    });
    if (ONE_SIDED[input.voucherType] && input.cashBankAccountId) {
      const list = input.voucherType === 'CPV' ? opts.cashAccounts : opts.bankAccounts;
      if (!list.some((a) => a.accountId === input.cashBankAccountId)) e.cashBankAccountId = input.voucherType === 'CPV' ? 'Choose a cash account' : 'Choose a bank account';
    }
    if (!opts.branches.some((b) => b.id === input.branchId)) e.branchId = 'Choose an active branch';
    if (input.endMode === 'ON_DATE' && input.endOnDate && input.startDate && input.endOnDate < input.startDate) e.endOnDate = 'After the start date';
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, details(e));
    const known = new Set(cur?.lines.map((l) => l.id) ?? []);
    const amount = Math.round(input.lines.reduce((s, l) => s + l.debit, 0) * 100) / 100;
    return {
      name: input.name, description: input.description, voucherType: input.voucherType, frequency: input.frequency,
      runDay: input.runOnLastDay ? null : input.runDay, runOnLastDay: input.runOnLastDay, runWeekday: input.frequency === 'WEEKLY' ? input.runWeekday : null,
      runMonth: input.frequency === 'YEARLY' ? input.runMonth : null, startDate: input.startDate, endMode: input.endMode,
      endAfterCount: input.endMode === 'AFTER_N' ? input.endAfterCount : null, endOnDate: input.endMode === 'ON_DATE' ? input.endOnDate : null,
      branchId: input.branchId, narration: input.narration, cashBankAccountId: ONE_SIDED[input.voucherType] ? input.cashBankAccountId : null,
      partyName: input.partyName, amount, autoPost: input.autoPost, notifyOnFailure: input.notifyOnFailure,
      lines: input.lines.map((l, i) => ({ ...(l.id && known.has(l.id) && { id: l.id }), lineNo: i + 1, accountId: l.accountId, narration: l.particulars, debit: l.debit, credit: l.credit, costCentreId: l.costCentreId })),
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const t = await this.get(user, id);
    if (t.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this template. Reload and try again.');
    return t;
  }
}
