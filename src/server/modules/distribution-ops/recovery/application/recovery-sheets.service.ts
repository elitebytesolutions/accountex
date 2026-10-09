import { Injectable } from '@nestjs/common';
import type { DistributionQuery, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { CustomerReceiptsService } from '../../../receivables-ops/receipts/application/customer-receipts.service.js';
import { DistributionOpsStore } from '../../common/application/distribution-ops-store.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notEditable = () => new ConflictError('This recovery sheet is posted.', undefined, { code: 'RECOVERY_NOT_EDITABLE' });
const changed = () => new ConcurrencyError('This recovery sheet was changed. Reload and try again.');
const METHOD: Record<string, string> = { CASH: 'CASH', CHEQUE: 'CHEQUE', ONLINE: 'IBFT', JAZZCASH: 'JAZZCASH' };

/**
 * Recovery sheets: the shops of a route that owe money (with ageing, credit limit and last payment) for the salesman
 * to collect. Each line records what was collected and how, or a promise-to-pay date. Posting (recov:post) records
 * one customer receipt per collected line (oldest invoices first; cheques into Cheques in hand).
 */
@Injectable()
export class RecoverySheetsService {
  constructor(
    private readonly store: DistributionOpsStore,
    private readonly receipts: CustomerReceiptsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: DistributionQuery) {
    return this.store.listRecovery(user.tenantId, q);
  }

  async get(user: SessionUser, id: string) {
    const s = await this.store.getRecovery(user.tenantId, id);
    if (!s) throw new NotFoundError('Recovery sheet not found');
    return s;
  }

  async generate(user: SessionUser, meta: RequestMeta, p: { routeId: string; docDate: string; salesmanEmployeeId?: string | null }) {
    const o = await this.store.options(user.tenantId);
    const route = o.routes.find((r) => r.id === p.routeId);
    if (!route) throw v({ routeId: 'Choose an active route' });
    const c = await this.store.recoveryCandidates(user.tenantId, p.routeId, p.docDate);
    if (!c.length) throw v({ routeId: 'No shop on this route owes anything' });
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('recoverySheetAddUpdate', {
      docDate: p.docDate, routeId: p.routeId, branchId: route.branchId, salesmanEmployeeId: p.salesmanEmployeeId ?? route.salesmanEmployeeId, status: 'OPEN',
      shopCount: c.length, outstandingTotal: r2(c.reduce((t, x) => t + x.outstanding, 0)), targetAmount: r2(c.reduce((t, x) => t + x.target, 0)), collectedTotal: 0,
      lines: c.map((x, n) => ({
        lineNo: n + 1, customerId: x.customerId, outstandingAmount: x.outstanding, age030: x.age030, age3160: x.age3160, age6190: x.age6190, age90Plus: x.age90Plus,
        creditLimit: x.creditLimit, lastPaymentDate: x.lastPaymentDate, lastPaymentAmount: x.lastPaymentAmount, targetAmount: x.target, collectedAmount: 0, status: 'PENDING',
      })),
    }));
    return this.get(user, id);
  }

  async saveLines(user: SessionUser, meta: RequestMeta, id: string, p: { rowVersion: number; lines: { id: string; collectedAmount?: number; mode?: string; reference?: string | null; depositBankAccountId?: string | null; promiseToPayDate?: string | null; remarks?: string | null }[] }) {
    const s = await this.get(user, id);
    if (s.rowVersion !== p.rowVersion) throw changed();
    if (s.status !== 'OPEN') throw notEditable();
    const o = await this.store.options(user.tenantId);
    const modes = new Set(o.lookups.recoveryModes.map((m) => m.code));
    const e: Record<string, string> = {};
    p.lines.forEach((l, i) => {
      const cur = s.lines.find((x) => x.id === l.id);
      const amt = Number(l.collectedAmount ?? 0);
      if (!cur) e[`lines.${i}.id`] = 'Not a line of this sheet';
      else if (cur.status === 'POSTED') e[`lines.${i}.id`] = 'Already posted';
      else if (amt > cur.outstandingAmount) e[`lines.${i}.collectedAmount`] = `At most ${cur.outstandingAmount}`;
      if (amt > 0 && !modes.has(l.mode ?? 'CASH')) e[`lines.${i}.mode`] = 'Choose how it was collected';
      if (amt > 0 && l.mode === 'CHEQUE' && !/^\d{4,10}$/.test((l.reference ?? '').replace(/\D/g, ''))) e[`lines.${i}.reference`] = 'Enter the cheque number';
      if (amt > 0 && l.mode === 'ONLINE' && !l.depositBankAccountId) e[`lines.${i}.depositBankAccountId`] = 'Choose the bank it came into';
    });
    if (Object.keys(e).length) throw v(e);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const l of p.lines) {
        const amt = Number(l.collectedAmount ?? 0);
        const ref = (l.reference ?? '').trim();
        await this.store.set('recoveryLine', user.tenantId, l.id, {
          collectedAmount: amt, mode: amt > 0 ? l.mode ?? 'CASH' : null, depositBankAccountId: l.depositBankAccountId ?? null,
          promiseToPayDate: l.promiseToPayDate ? new Date(`${l.promiseToPayDate}T00:00:00Z`) : null,
          remarks: [ref ? `ref ${ref}` : null, l.remarks ?? null].filter(Boolean).join(' · ') || null,
          status: amt > 0 ? 'READY' : l.promiseToPayDate ? 'PROMISED' : 'PENDING',
        });
      }
      const fresh = await this.store.getRecovery(user.tenantId, id);
      await this.store.set('recovery', user.tenantId, id, { collectedTotal: r2(fresh!.lines.reduce((t, x) => t + x.collectedAmount, 0)) });
    });
    return this.get(user, id);
  }

  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, cashAccountId: string) {
    const s = await this.get(user, id);
    if (s.rowVersion !== rowVersion) throw changed();
    if (s.status !== 'OPEN') throw notEditable();
    const ready = s.lines.filter((l) => l.status === 'READY' && l.collectedAmount > 0);
    if (!ready.length) throw v({ lines: 'Record at least one collection first' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const l of ready) {
        const method = METHOD[l.mode ?? 'CASH'] ?? 'CASH';
        const ref = /ref (\S+)/.exec(l.remarks ?? '')?.[1] ?? null;
        const rid = await this.receipts.createIn(user, {
          docDate: s.docDate, customerId: l.customer.id, method, cashAccountId: method === 'CASH' ? cashAccountId : null,
          bankAccountId: method === 'CASH' || method === 'CHEQUE' ? null : l.depositBankAccountId, reference: method === 'CHEQUE' ? (ref ?? '').replace(/\D/g, '') : ref ?? s.docNo,
          amountReceived: l.collectedAmount, memo: `Recovery sheet ${s.docNo}`, autoAllocate: true,
        });
        const rc = await this.receipts.get(user, rid);
        await this.store.set('recoveryLine', user.tenantId, l.id, { status: 'POSTED', receiptId: rid, chequeId: rc.cheque?.id ?? null, postedAt: new Date(), postedByUserId: user.id });
      }
      await this.store.run('recoverySheetPost', id);
    });
    return this.get(user, id);
  }
}
