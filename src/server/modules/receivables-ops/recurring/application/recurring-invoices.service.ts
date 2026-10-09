import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { lineAmounts, termDays, type ReceivablesQuery, type RecurringInvoiceInput, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type AuditContext, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { salesLines } from '../../../sales/common/application/sales-lines.js';
import { SalesStore } from '../../../sales/common/application/sales-store.js';
import { ReceivablesStore } from '../../common/application/receivables-store.js';

const HOUR = 60 * 60 * 1000;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const changed = () => new ConcurrencyError('This recurring invoice was changed. Reload and try again.');
const notActive = () => new ConflictError('This recurring invoice is not active.', undefined, { code: 'RECURRING_NOT_ACTIVE' });
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const addMonths = (d: string, n: number) => {
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(dd, last))).toISOString().slice(0, 10);
};
/** The run after `d` for a frequency (WEEKLY, MONTHLY, QUARTERLY, CUSTOM every N days). */
export function nextRun(d: string, frequency: string, everyDays: number | null) {
  if (frequency === 'WEEKLY') return addDays(d, 7);
  if (frequency === 'QUARTERLY') return addMonths(d, 3);
  if (frequency === 'CUSTOM') return addDays(d, everyDays || 30);
  return addMonths(d, 1);
}

/**
 * Recurring invoices: a profile (customer, lines, schedule) that creates a STANDARD sales invoice on each run date —
 * posted, or kept as a draft when the profile says so. An hourly job runs every due profile (actor
 * "recurring-invoices"); Run now creates the next one immediately. Pause / resume; the profile ends on its end date
 * or after its number of invoices. Lines with "use current price" take the product's price on the run date.
 */
@Injectable()
export class RecurringInvoicesService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('RecurringInvoices');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: ReceivablesStore,
    private readonly sales: SalesStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    setTimeout(() => void this.tick(), 60_000);
    this.timer = setInterval(() => void this.tick(), HOUR);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  list(user: SessionUser, q: ReceivablesQuery) {
    return this.store.listRecurring(user.tenantId, q);
  }

  async get(user: SessionUser, id: string) {
    const r = await this.store.getRecurring(user.tenantId, id);
    if (!r) throw new NotFoundError('Recurring invoice not found');
    return r;
  }

  async create(user: SessionUser, meta: RequestMeta, input: RecurringInvoiceInput) {
    const data = await this.payload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('recurringInvoiceAddUpdate', { ...data, nextRunDate: input.startDate, status: 'ACTIVE' }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: RecurringInvoiceInput & { rowVersion: number }) {
    const r = await this.get(user, id);
    if (r.rowVersion !== input.rowVersion) throw changed();
    if (r.status === 'ENDED') throw notActive();
    const data = await this.payload(user, input);
    const next = r.runsCount === 0 ? input.startDate : r.nextRunDate;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('recurringInvoiceAddUpdate', { ...data, id, rowVersion: input.rowVersion, nextRunDate: next }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('recurring', user.tenantId, id, rowVersion)))) {
      throw new ConflictError('This profile has already created invoices; pause it instead.', undefined, { code: 'RECURRING_NOT_ACTIVE' });
    }
  }

  async pause(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.rowVersion !== rowVersion) throw changed();
    if (r.status !== 'ACTIVE') throw notActive();
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.set('recurring', user.tenantId, id, { status: 'PAUSED' }));
    return this.get(user, id);
  }

  /** Resumes; a run date already past moves to today. */
  async resume(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.rowVersion !== rowVersion) throw changed();
    if (r.status !== 'PAUSED') throw notActive();
    const due = !r.nextRunDate || r.nextRunDate < today() ? today() : r.nextRunDate;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.set('recurring', user.tenantId, id, { status: 'ACTIVE', nextRunDate: new Date(`${due}T00:00:00Z`) }));
    return this.get(user, id);
  }

  /** Creates the next invoice now (dated today) and moves the schedule on. */
  async runNow(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.rowVersion !== rowVersion) throw changed();
    if (r.status !== 'ACTIVE') throw notActive();
    await this.unitOfWork.run(actorContext(user, meta), () => this.runOne(user.tenantId, id, today(), user.id));
    return this.get(user, id);
  }

  /** Hourly: every due profile of every company, each in its own transaction and tenant context. */
  async tick() {
    try {
      const tenants = await this.unitOfWork.run({ userId: null, tenantId: null, correlationId: randomUUID(), actorLabel: 'recurring-invoices' }, () => this.store.tenants());
      let ok = 0;
      let all = 0;
      for (const tenantId of tenants) {
        const ctx = (): AuditContext => ({ userId: null, tenantId, correlationId: randomUUID(), actorLabel: 'recurring-invoices' });
        const due = await this.unitOfWork.run(ctx(), () => this.store.dueRecurring(tenantId, today()));
        for (const d of due) {
          all++;
          try {
            await this.unitOfWork.run(ctx(), () => this.runOne(tenantId, d.id, d.nextRunDate, null));
            ok++;
          } catch (err) {
            this.log.warn(`profile ${d.id}: ${(err as Error).message}`);
          }
        }
      }
      if (all) this.log.log(`${ok} of ${all} recurring invoice(s) created`);
    } catch (err) {
      this.log.error(`recurring invoices: ${(err as Error).message}`);
    }
  }

  /** One run inside the caller's transaction: invoice (STANDARD, linked to the profile), post unless draft, schedule on. */
  private async runOne(tenantId: string, id: string, on: string, userId: string | null) {
    const p = await this.store.getRecurring(tenantId, id);
    if (!p || p.status !== 'ACTIVE') return null;
    const o = await this.sales.options(tenantId);
    const prices = new Map(o.products.map((x) => [x.id, x.price]));
    const e: Record<string, string> = {};
    const { lines, totals } = salesLines(o, p.lines.map((l) => ({
      itemId: l.item?.id ?? null, description: l.description, qtyCtn: 0, qtyLoose: l.qty, bonusQty: 0,
      rate: l.useCurrentPrice && l.item ? prices.get(l.item.id) ?? l.rate : l.rate, discountPct: 0, taxCodeId: null, taxRate: l.taxRate,
    })), e);
    if (Object.keys(e).length) throw v(e);
    const c = o.customers.find((x) => x.id === p.customer.id);
    if (!c) throw new ConflictError('The customer of this profile is no longer active.', undefined, { code: 'RECURRING_NOT_ACTIVE' });
    const invoiceId = await this.sales.save('salesInvoiceAddUpdate', {
      channel: 'STANDARD', docDate: on, customerId: c.id, branchId: p.branch?.id ?? c.branchId ?? o.branches[0]?.id, warehouseId: p.warehouse?.id ?? null,
      salesRepUserId: c.salesRepUserId ?? userId, priceListId: c.priceListId, paymentTerms: p.paymentTerms, dueDate: addDays(on, termDays(p.paymentTerms)), saleType: 'REGULAR',
      buyerName: c.name, buyerAddress: c.address, buyerNtn: c.ntn, buyerStrn: c.strn, buyerCnic: c.cnic, buyerCity: c.city, contactPhone: c.phone, contactEmail: c.email,
      submitToFbr: true, remarks: `Recurring ${p.docNo} · ${p.name}`, recurringProfileId: id,
      grossAmount: totals.grossAmount, discountAmount: totals.discountAmount, taxableAmount: totals.taxableAmount, taxAmount: totals.taxAmount, netAmount: totals.netAmount, lines,
    });
    if (!p.saveAsDraft) await this.sales.run('salesInvoicePost', invoiceId);
    const runs = p.runsCount + 1;
    const next = nextRun(p.nextRunDate && p.nextRunDate > on ? p.nextRunDate : on, p.frequency, p.everyDays);
    const ended = (p.endMode === 'AFTER_RUNS' && p.maxRuns !== null && runs >= p.maxRuns) || (p.endMode === 'ON_DATE' && p.endDate !== null && next > p.endDate);
    await this.store.set('recurring', tenantId, id, {
      runsCount: runs, lastRunAt: new Date(), lastInvoiceId: invoiceId, nextRunDate: ended ? null : new Date(`${next}T00:00:00Z`), ...(ended && { status: 'ENDED' }),
    });
    return invoiceId;
  }

  private async payload(user: SessionUser, p: RecurringInvoiceInput) {
    const o = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    if (!o.customers.some((c) => c.id === p.customerId)) e.customerId = 'Choose an active customer';
    if (!o.branches.some((b) => b.id === p.branchId)) e.branchId = 'Choose an active branch';
    if (p.warehouseId && !o.warehouses.some((w) => w.id === p.warehouseId)) e.warehouseId = 'Choose an active warehouse';
    if (!p.warehouseId && p.lines.some((l) => l.itemId)) e.warehouseId = 'Choose the warehouse the goods leave from';
    if (!o.paymentTerms.some((t) => t.code === p.paymentTerms)) e.paymentTerms = 'Choose payment terms';
    if (!o.lookups.frequencies.some((f) => f.code === p.frequency)) e.frequency = 'Choose how often';
    if (!o.lookups.endModes.some((f) => f.code === (p.endMode ?? 'NEVER'))) e.endMode = 'Choose when it ends';
    const lines = p.lines.map((l, i) => {
      const item = l.itemId ? o.products.find((x) => x.id === l.itemId) : null;
      if (l.itemId && !item) e[`lines.${i}.itemId`] = 'Choose an active product';
      const a = lineAmounts({ baseQty: Number(l.qty), rate: Number(l.rate), discountPct: 0, taxRate: Number(l.taxRate ?? 0) });
      return {
        lineNo: i + 1, itemId: l.itemId ?? null, description: l.description || item?.name || '', qtyCtn: 0, qtyLoose: Number(l.qty), ctnFactor: 1, baseQty: Number(l.qty),
        rate: Number(l.rate), useCurrentPrice: l.useCurrentPrice ?? true, taxCodeId: l.taxCodeId ?? null, taxRate: Number(l.taxRate ?? 0),
        taxableAmount: a.netAmount, taxAmount: a.taxAmount, totalAmount: a.totalAmount,
      };
    });
    if (Object.keys(e).length) throw v(e);
    return {
      name: p.name, customerId: p.customerId, branchId: p.branchId, warehouseId: p.warehouseId ?? null, paymentTerms: p.paymentTerms, frequency: p.frequency,
      everyDays: p.frequency === 'CUSTOM' ? p.everyDays ?? null : null, startDate: p.startDate, endMode: p.endMode ?? 'NEVER',
      endDate: p.endMode === 'ON_DATE' ? p.endDate ?? null : null, maxRuns: p.endMode === 'AFTER_RUNS' ? p.maxRuns ?? null : null,
      amount: r2(lines.reduce((s, l) => s + l.totalAmount, 0)), saveAsDraft: !!p.saveAsDraft, autoSend: false, sendEmail: false, sendWhatsapp: false, lines,
    };
  }
}
