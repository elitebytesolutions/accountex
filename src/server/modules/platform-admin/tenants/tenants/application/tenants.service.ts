import { Injectable } from '@nestjs/common';
import {
  SUBSCRIPTION_LIVE, tenantActionError,
  type AdminSession, type TenantAction, type TenantContactInput, type TenantDetail, type TenantList, type TenantListQuery, type TenantModulesInput,
  type TenantOnboard, type TenantOnboardResult, type TenantStatusInput, type TenantUpdate,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { PasswordHasher } from '../../../../../core/application/ports/password-hasher.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { SubscriptionsService } from '../../subscriptions/application/subscriptions.service.js';
import { SubscriptionStore } from '../../subscriptions/application/subscription-store.js';
import { mrrOf, todayPk } from '../../subscriptions/domain/billing.js';
import { TenantStore } from './tenant-store.js';

const statusOrder = (message: string) => new ConflictError(message, undefined, { code: 'TENANT_STATUS_ORDER' });
const stale = () => new ConcurrencyError('Someone else changed this company. Reload and try again.');

/**
 * Tenants (Super Admin › Tenants): onboarding, Tenant 360 edits and the status lifecycle. Onboarding runs in one
 * transaction: Platform.provisionTenant (tenant → system roles with the default grants → default user with every role),
 * then the company's details, owner contact, modules, subscription and seed lists. Suspending or churning a company
 * ends every open session of its users.
 */
@Injectable()
export class TenantsService {
  constructor(
    private readonly store: TenantStore,
    private readonly subscriptions: SubscriptionsService,
    private readonly subscriptionStore: SubscriptionStore,
    private readonly passwords: PasswordHasher,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(q: TenantListQuery): Promise<TenantList> {
    return this.store.list(q);
  }

  async get(id: string): Promise<TenantDetail> {
    const t = await this.store.detail(id);
    if (!t) throw new NotFoundError('Company not found');
    return t;
  }

  async onboard(admin: AdminSession, meta: RequestMeta, input: TenantOnboard): Promise<TenantOnboardResult> {
    if (await this.store.codeTaken(input.code)) {
      throw new ConflictError(`The company code ${input.code} is already taken.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
    if (input.coaTemplateId && !(await this.store.coaTemplateUsable(input.coaTemplateId))) {
      throw new ValidationError('Choose a published chart-of-accounts template', { coaTemplateId: ['Unknown or unpublished template'] });
    }
    const plan = await this.subscriptionStore.plan(input.planId);
    if (!plan || plan.status !== 'ACTIVE') throw new ValidationError('Choose an active plan', { planId: ['Unknown or retired plan'] });
    const features = await this.store.planModules(plan.id);
    const included = new Set(features.filter((f) => f.inclusion === 'INCLUDED').map((f) => f.moduleKey));
    const chosen = new Set(input.modules.length ? input.modules : [...included]);
    const passwordHash = await this.passwords.hash(input.adminPassword);
    const trial = input.startTrial && plan.trialDays > 0;
    const steps: string[] = [];

    const result = await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      const id = await this.store.provision({
        code: input.code, name: input.displayName, legalName: input.legalName, email: input.adminEmail, adminName: input.adminName, passwordHash,
      });
      steps.push('Company, system roles and default user provisioned');
      if (input.fiscalYearStartMonth !== 7) {
        await this.store.resetFiscalYear(id, input.fiscalYearStartMonth);
        steps.push(`Fiscal year starts in month ${input.fiscalYearStartMonth}`);
      }
      // A new company starts with an empty chart: the chosen (or the DEFAULT) template is applied now.
      const tpl = input.coaTemplateId ? { id: input.coaTemplateId, name: 'the chosen template' } : await this.store.defaultCoaTemplate();
      if (tpl) {
        const accounts = await this.store.applyChartTemplate(id, tpl.id);
        steps.push(`Chart of accounts: ${accounts} accounts from ${tpl.name}`);
      }
      await this.store.update(id, null, {
        ntn: input.ntn ?? null, strn: input.strn, secpRegNo: input.secpRegNo, industry: input.industry, city: input.city, province: input.province,
        address: input.address, phone: input.phone, email: input.email ?? null, fiscalYearStartMonth: input.fiscalYearStartMonth, timezone: input.timezone,
        numberFormat: input.numberFormat, dateFormat: input.dateFormat, dataResidency: input.dataResidency, defaultLanguage: input.defaultLanguage,
        coaTemplateId: tpl?.id ?? null, status: trial ? 'TRIAL' : 'ACTIVE', activatedAt: trial ? null : new Date(),
      });
      await this.store.addContact(id, {
        contactRole: 'OWNER', fullName: input.adminName, designation: input.adminDesignation, email: input.adminEmail, mobile: input.adminMobile,
        cnic: input.adminCnic ?? null, language: input.adminLanguage, isPrimary: true,
      });
      await this.store.setModules(id, [...new Set([...chosen, ...included])].map((moduleKey) => ({
        moduleKey, enabled: chosen.has(moduleKey), source: included.has(moduleKey) ? 'PLAN' : trial ? 'TRIAL' : 'OVERRIDE',
      })));
      steps.push(`${chosen.size} modules enabled`);
      const subId = await this.subscriptions.start(admin, { tenantId: id, plan, cycle: input.billingCycle, trial, paymentMethod: null });
      const sub = await this.subscriptionStore.get(subId);
      if (trial && sub?.trialEndsOn) await this.store.update(id, null, { trialEndsOn: sub.trialEndsOn });
      steps.push(trial ? `${plan.name} trial until ${sub?.trialEndsOn}` : `${plan.name} subscription started`);
      return { id };
    });
    // The seed lists are copied after the company commits: their accounts come from the default posting-role mappings,
    // which provisioning's deferred triggers create at commit. A row that can't be mapped is skipped and reported.
    const seeds = input.seedHrLists || input.seedTaxCodes
      ? await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.applySeeds(result.id, input.seedHrLists, input.seedHrLists, input.seedTaxCodes))
      : { seedVersion: null, leaveTypes: 0, salaryComponents: 0, taxCodes: 0, skipped: [] };
    if (input.seedHrLists || input.seedTaxCodes) {
      steps.push(`Seed lists ${seeds.seedVersion ?? '(none published)'}: ${seeds.leaveTypes} leave types, ${seeds.salaryComponents} salary components, ${seeds.taxCodes} tax codes`);
    }
    return { tenant: await this.get(result.id), seeds, steps };
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: TenantUpdate): Promise<TenantDetail> {
    const t = await this.get(id);
    if (t.rowVersion !== input.rowVersion) throw stale();
    const { rowVersion, ...rest } = input;
    const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      if (!(await this.store.update(id, rowVersion, data))) throw stale();
    });
    return this.get(id);
  }

  /** Suspend / reactivate / churn. Suspending and churning revoke every open session; churning cancels the subscription. */
  async setStatus(admin: AdminSession, meta: RequestMeta, id: string, action: TenantAction, input: TenantStatusInput): Promise<TenantDetail> {
    const t = await this.get(id);
    if (t.rowVersion !== input.rowVersion) throw stale();
    const err = tenantActionError(t.status, action);
    if (err) throw statusOrder(err);
    if (action === 'suspend' && !input.reason) throw new ValidationError('Give the reason for suspending', { reason: ['Required'] });
    if (action === 'churn' && !input.churnReason) throw new ValidationError('Choose why the company churned', { churnReason: ['Required'] });
    const sub = await this.subscriptionStore.liveForTenant(id);
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      if (action === 'suspend') {
        if (!(await this.store.update(id, input.rowVersion, { status: 'SUSPENDED', suspendedAt: new Date(), suspensionReason: input.reason ?? null }))) throw stale();
        await this.store.revokeSessions(id, 'TENANT_SUSPENDED');
      } else if (action === 'reactivate') {
        const status = sub?.status === 'TRIAL' ? 'TRIAL' : 'ACTIVE';
        if (!(await this.store.update(id, input.rowVersion, { status, suspendedAt: null, suspensionReason: null, ...(t.activatedAt ? {} : status === 'ACTIVE' && { activatedAt: new Date() }) }))) throw stale();
      } else {
        if (!(await this.store.update(id, input.rowVersion, { status: 'CHURNED', churnedAt: new Date(), churnReason: input.churnReason ?? 'OTHER' }))) throw stale();
        await this.store.revokeSessions(id, 'TENANT_SUSPENDED');
        if (sub && SUBSCRIPTION_LIVE.includes(sub.status)) {
          const before = mrrOf(sub.amount, sub.billingCycle, sub.status);
          if (!(await this.subscriptionStore.update(sub.id, sub.rowVersion, { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: input.reason ?? input.churnReason ?? 'Churned', autoRenew: false, nextRenewalOn: null }))) {
            throw new ConcurrencyError('Someone else changed the subscription. Reload and try again.');
          }
          await this.subscriptionStore.addEvent({
            subscriptionId: sub.id, tenantId: id, eventType: 'CANCELLED', fromPlanId: sub.planId, mrrBefore: before, mrrAfter: 0,
            movement: before > 0 ? 'CHURN' : 'NONE', staffUserId: admin.staffId, note: `Company churned (${input.churnReason})`, effectiveOn: todayPk(),
          });
        }
      }
    });
    return this.get(id);
  }

  async setModules(admin: AdminSession, meta: RequestMeta, id: string, input: TenantModulesInput): Promise<TenantDetail> {
    const t = await this.get(id);
    if (t.rowVersion !== input.rowVersion) throw stale();
    // Module rows are children of the company: their changes show in its History tab.
    await this.unitOfWork.run(adminActorContext(admin, meta), () =>
      this.store.setModules(id, input.modules.map((m) => ({ ...m, source: 'OVERRIDE' }))));
    return this.get(id);
  }

  async addContact(admin: AdminSession, meta: RequestMeta, id: string, input: TenantContactInput): Promise<TenantDetail> {
    const t = await this.get(id);
    if (input.contactRole === 'OWNER' && t.contacts.some((c) => c.contactRole === 'OWNER' && c.email.toLowerCase() === input.email.toLowerCase())) {
      throw new ConflictError('This owner contact already exists', { email: ['Already a contact'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
    await this.unitOfWork.run(adminActorContext(admin, meta), () =>
      this.store.addContact(id, { ...input, designation: input.designation ?? null, mobile: input.mobile ?? null, isPrimary: false }));
    return this.get(id);
  }

  async addNote(admin: AdminSession, meta: RequestMeta, id: string, body: string): Promise<TenantDetail> {
    await this.get(id);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.addNote(id, admin.staffId!, body));
    return this.get(id);
  }
}
