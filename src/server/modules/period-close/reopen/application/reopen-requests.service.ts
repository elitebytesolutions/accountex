import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ReopenRequestInput, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, NotFoundError, PermissionDeniedError, ValidationError } from '../../../../core/domain/errors.js';
import { PeriodCloseStore } from '../../common/application/period-close-store.js';

const HOUR = 60 * 60 * 1000;

/**
 * Period reopen requests: a closed period (or one of its modules) reopens only on an approved request — close:approve,
 * never the requester (no workflow engine). Locked periods need multi-factor verification, which comes later. An
 * hourly job closes approved requests again once their reopen-until time passes (when auto re-close is on).
 */
@Injectable()
export class ReopenRequestsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('PeriodReopen');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: PeriodCloseStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), HOUR);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  list(user: SessionUser) {
    return this.store.listReopen(user.tenantId);
  }

  async request(user: SessionUser, meta: RequestMeta, p: ReopenRequestInput) {
    const period = await this.store.period(user.tenantId, p.fiscalPeriodId);
    if (!period) throw new ValidationError('Choose a period', { fiscalPeriodId: ['Choose a period'] });
    const target = p.moduleCode ? period.modules[p.moduleCode] ?? 'OPEN' : period.status;
    if (period.status === 'LOCKED' || target === 'LOCKED') throw new ConflictError('A locked period can only be reopened with multi-factor verification, which isn’t available yet.', undefined, { code: 'PERIOD_LOCKED_NEEDS_MFA' });
    if (target !== 'CLOSED') throw new ConflictError(p.moduleCode ? `${p.moduleCode} is not closed in ${period.code}.` : `${period.code} is not closed.`, undefined, { code: 'REOPEN_PERIOD_NOT_CLOSED' });
    if (p.approverUserId === user.id) throw new ValidationError('Choose someone else to approve', { approverUserId: ['Choose someone else to approve'] });
    const until = p.reopenUntil.length === 10 ? `${p.reopenUntil}T23:59:59+05:00` : p.reopenUntil;
    if (Date.parse(until) <= Date.now()) throw new ValidationError('Reopen until a future time', { reopenUntil: ['Reopen until a future time'] });
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('periodReopenRequestAddUpdate', {
      fiscalPeriodId: p.fiscalPeriodId, moduleCode: p.moduleCode ?? null, previousStatus: 'CLOSED', reopenUntil: until, reason: p.reason,
      requestedByUserId: user.id, approverUserId: p.approverUserId, autoReclose: p.autoReclose ?? true, status: 'PENDING',
    }));
    return (await this.store.getReopen(user.tenantId, id))!;
  }

  async approve(user: SessionUser, meta: RequestMeta, id: string, comment: string | null) {
    await this.pending(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('periodReopenRequestApprove', id, comment));
    return (await this.store.getReopen(user.tenantId, id))!;
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, comment: string | null) {
    await this.pending(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('periodReopenRequestReject', id, comment));
    return (await this.store.getReopen(user.tenantId, id))!;
  }

  /** The requester withdraws a pending request. */
  async cancel(user: SessionUser, meta: RequestMeta, id: string, reason: string | null) {
    const r = await this.store.getReopen(user.tenantId, id);
    if (!r) throw new NotFoundError('Reopen request not found');
    if (r.status !== 'PENDING') throw new ConflictError('Only a pending request can be withdrawn.', undefined, { code: 'REOPEN_NOT_PENDING' });
    if (r.requestedBy?.id !== user.id && !user.permissions.includes('close:approve')) throw new PermissionDeniedError('Only the requester can withdraw this request.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('periodReopenRequestCancel', id, reason));
    return (await this.store.getReopen(user.tenantId, id))!;
  }

  /** Closes an approved reopen again now (the approver or close:approve). */
  async reclose(user: SessionUser, meta: RequestMeta, id: string) {
    const r = await this.store.getReopen(user.tenantId, id);
    if (!r) throw new NotFoundError('Reopen request not found');
    if (r.status !== 'APPROVED') throw new ConflictError('Only an approved reopen can be closed again.', undefined, { code: 'REOPEN_NOT_PENDING' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('periodReopenReclose', id));
    return (await this.store.getReopen(user.tenantId, id))!;
  }

  /** Hourly: approved requests past their reopen-until time close again (drafts left in the period block it; retried next hour). */
  async tick() {
    try {
      const tenants = await this.unitOfWork.run({ userId: null, tenantId: null, correlationId: randomUUID(), actorLabel: 'period-reopen' }, () => this.store.tenants());
      for (const tenantId of tenants) {
        const ctx = () => ({ userId: null, tenantId, correlationId: randomUUID(), actorLabel: 'period-reopen' });
        const due = await this.unitOfWork.run(ctx(), () => this.store.dueReclose(tenantId));
        for (const id of due) {
          try {
            await this.unitOfWork.run(ctx(), () => this.store.run('periodReopenReclose', id));
          } catch (err) {
            this.log.warn(`reopen ${id}: ${(err as Error).message}`);
          }
        }
      }
    } catch (err) {
      this.log.error(`period reopen job: ${(err as Error).message}`);
    }
  }

  private async pending(user: SessionUser, id: string) {
    const r = await this.store.getReopen(user.tenantId, id);
    if (!r) throw new NotFoundError('Reopen request not found');
    if (r.status !== 'PENDING') throw new ConflictError('This reopen request is already decided.', undefined, { code: 'REOPEN_NOT_PENDING' });
    if (r.requestedBy?.id === user.id) throw new ConflictError('You can’t decide your own reopen request.', undefined, { code: 'REOPEN_SELF_APPROVAL' });
    return r;
  }
}
