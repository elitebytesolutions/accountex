import { Injectable } from '@nestjs/common';
import type {
  AdminSession,
  AlertRuleVersion,
  AuditAlertRuleCreate,
  AuditAlertRuleUpdate,
  PlatformAuditLogQuery,
  UsageAlertRuleCreate,
  UsageAlertRuleUpdate,
} from '../../../../../shared/index.js';
import { adminActorContext } from '../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, NotFoundError } from '../../../../core/domain/errors.js';
import { AuditAlertRuleStore, UsageAlertRuleStore } from './alerting-stores.js';

const stale = () => new ConcurrencyError('Someone else changed this rule. Reload and try again.');

/**
 * Usage alert rules (Usage & Quotas). Stored only: evaluation against meters comes with usage metering (Phase 40).
 * Action details that don't apply to the chosen action are cleared.
 */
@Injectable()
export class UsageAlertRulesService {
  constructor(
    private readonly store: UsageAlertRuleStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list() {
    return this.store.list();
  }

  options() {
    return this.store.options();
  }

  async get(id: string) {
    const r = await this.store.get(id);
    if (!r) throw new NotFoundError('Alert rule not found');
    return r;
  }

  async create(admin: AdminSession, meta: RequestMeta, input: UsageAlertRuleCreate) {
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save(clean(input)));
    return this.get(id);
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: UsageAlertRuleUpdate) {
    const cur = await this.get(id);
    if (cur.rowVersion !== input.rowVersion) throw stale();
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...clean(input), id, rowVersion: input.rowVersion }));
    return this.get(id);
  }

  async setEnabled(admin: AdminSession, meta: RequestMeta, id: string, isEnabled: boolean, input: AlertRuleVersion) {
    const cur = await this.get(id);
    if (cur.rowVersion !== input.rowVersion) throw stale();
    if (cur.isEnabled === isEnabled) return cur;
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion: input.rowVersion, isEnabled }));
    return this.get(id);
  }

  async delete(admin: AdminSession, meta: RequestMeta, id: string) {
    await this.get(id);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.delete(id));
  }
}

function clean(r: UsageAlertRuleCreate) {
  return {
    usageMeterId: r.usageMeterId, thresholdPct: r.thresholdPct, planId: r.planId, action: r.action, actionDetail: r.actionDetail,
    throttleRps: r.action === 'THROTTLE' ? r.throttleRps : null, offerAddonId: r.action === 'OFFER_ADDON' ? r.offerAddonId : null,
    isEnabled: r.isEnabled, evalIntervalMinutes: r.evalIntervalMinutes,
  };
}

/** Audit alert rules (Platform Audit Log › Alert rules). Stored only: sending comes with email delivery (Phase 29). */
@Injectable()
export class AuditAlertRulesService {
  constructor(
    private readonly store: AuditAlertRuleStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list() {
    return this.store.list();
  }

  auditLog(q: PlatformAuditLogQuery) {
    return this.store.auditLog(q);
  }

  async get(id: string) {
    const r = await this.store.get(id);
    if (!r) throw new NotFoundError('Alert rule not found');
    return r;
  }

  async create(admin: AdminSession, meta: RequestMeta, input: AuditAlertRuleCreate) {
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...input }));
    return this.get(id);
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: AuditAlertRuleUpdate) {
    const cur = await this.get(id);
    if (cur.rowVersion !== input.rowVersion) throw stale();
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...input, id }));
    return this.get(id);
  }

  async setActive(admin: AdminSession, meta: RequestMeta, id: string, isActive: boolean, input: AlertRuleVersion) {
    const cur = await this.get(id);
    if (cur.rowVersion !== input.rowVersion) throw stale();
    if (cur.isActive === isActive) return cur;
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion: input.rowVersion, isActive }));
    return this.get(id);
  }

  async delete(admin: AdminSession, meta: RequestMeta, id: string) {
    await this.get(id);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.delete(id));
  }
}
