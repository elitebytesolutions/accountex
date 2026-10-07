import { Injectable } from '@nestjs/common';
import {
  conditionsKey,
  evaluateConditions,
  type Delegation,
  type DelegationSave,
  type DelegationUpdate,
  type SessionUser,
  type Workflow,
  type WorkflowDryRun,
  type WorkflowDryRunResult,
  type WorkflowSave,
  type WorkflowUpdate,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { WorkflowStore } from './workflow-store.js';

/** Settings › Approval Workflows: draft → publish (active) → deactivate; delegations; dry-run. */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly store: WorkflowStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser): Promise<Workflow[]> {
    return this.store.list(user.tenantId);
  }

  async get(user: SessionUser, id: string): Promise<Workflow> {
    const wf = await this.store.get(user.tenantId, id);
    if (!wf) throw new NotFoundError('Workflow not found');
    return wf;
  }

  /** New workflows start as drafts. */
  async create(user: SessionUser, meta: RequestMeta, input: WorkflowSave): Promise<Workflow> {
    await this.checkApprovers(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save(input));
    return this.get(user, id);
  }

  /** Saving an active workflow keeps it active, so it must still not duplicate another one. */
  async update(user: SessionUser, meta: RequestMeta, id: string, input: WorkflowUpdate): Promise<Workflow> {
    const wf = await this.current(user, id, input.rowVersion);
    await this.checkApprovers(user, input);
    if (wf.status === 'ACTIVE') {
      if (!input.steps.length) throw new ValidationError('An active workflow needs at least one step.', undefined, { code: 'WORKFLOW_STEPS_REQUIRED' });
      await this.checkDuplicate(user, id, input.subject, input.conditions);
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async publish(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<Workflow> {
    const wf = await this.current(user, id, rowVersion);
    if (!wf.steps.length) throw new ValidationError('Add at least one approval step before publishing.', undefined, { code: 'WORKFLOW_STEPS_REQUIRED' });
    await this.checkDuplicate(user, id, wf.subject, wf.conditions);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setStatus(id, rowVersion, 'ACTIVE', user.id));
    return this.get(user, id);
  }

  async deactivate(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<Workflow> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setStatus(id, rowVersion, 'INACTIVE'));
    return this.get(user, id);
  }

  /** Only drafts are deleted; published workflows are deactivated so their history stays meaningful. */
  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const wf = await this.current(user, id, rowVersion);
    if (wf.status !== 'DRAFT') throw new ConflictError('Only draft workflows can be deleted. Deactivate it instead.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(id, rowVersion));
  }

  /** Which steps a sample document would go through. */
  async dryRun(user: SessionUser, id: string, input: WorkflowDryRun): Promise<WorkflowDryRunResult> {
    const wf = await this.get(user, id);
    const { matches, results } = evaluateConditions(wf.conditions, input.values);
    const amount = Number(input.values.AMOUNT ?? 0);
    return {
      matches,
      conditions: results,
      steps: wf.steps.map((s) => ({
        stepNo: s.stepNo,
        name: s.name,
        approverLabel: s.approverLabel,
        applies: matches && (s.appliesAboveAmount === null || amount > s.appliesAboveAmount),
      })),
    };
  }

  approvers(user: SessionUser) {
    return this.store.approvers(user.tenantId);
  }

  delegations(user: SessionUser): Promise<Delegation[]> {
    return this.store.delegations(user.tenantId);
  }

  async createDelegation(user: SessionUser, meta: RequestMeta, input: DelegationSave): Promise<Delegation> {
    await this.checkDelegationUsers(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveDelegation(input));
    return this.delegation(user, id);
  }

  async updateDelegation(user: SessionUser, meta: RequestMeta, id: string, input: DelegationUpdate): Promise<Delegation> {
    const d = await this.delegation(user, id);
    if (d.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this delegation. Reload and try again.');
    await this.checkDelegationUsers(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveDelegation({ ...input, id }));
    return this.delegation(user, id);
  }

  async deleteDelegation(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const d = await this.delegation(user, id);
    if (d.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this delegation. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDelegation(user.tenantId, id));
  }

  private async delegation(user: SessionUser, id: string) {
    const d = await this.store.delegation(user.tenantId, id);
    if (!d) throw new NotFoundError('Delegation not found');
    return d;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const wf = await this.get(user, id);
    if (wf.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this workflow. Reload and try again.');
    return wf;
  }

  private async checkApprovers(user: SessionUser, input: WorkflowSave) {
    const roleIds = input.steps.flatMap((s) => (s.approverType === 'ROLE' && s.approverRoleId ? [s.approverRoleId] : []));
    const userIds = input.steps.flatMap((s) => (s.approverType === 'USER' && s.approverUserId ? [s.approverUserId] : []));
    const valid = await this.store.validApprovers(user.tenantId, roleIds, userIds);
    if (roleIds.some((r) => !valid.roleIds.includes(r)) || userIds.some((u) => !valid.userIds.includes(u))) {
      throw new ValidationError('An approver is not a role or active user of this company', { steps: ['Unknown approver'] });
    }
  }

  private async checkDuplicate(user: SessionUser, id: string, subject: string, conditions: { field: string; operator: string; value: unknown }[]) {
    const key = conditionsKey(conditions);
    const clash = (await this.store.list(user.tenantId)).find(
      (w) => w.id !== id && w.status === 'ACTIVE' && w.subject === subject && conditionsKey(w.conditions) === key,
    );
    if (clash) throw new ConflictError(`"${clash.name}" already routes these documents.`, undefined, { code: 'WORKFLOW_DUPLICATE' });
  }

  private async checkDelegationUsers(user: SessionUser, input: { fromUserId: string; toUserId: string }) {
    const valid = await this.store.validApprovers(user.tenantId, [], [input.fromUserId, input.toUserId]);
    if (valid.userIds.length !== 2) throw new ValidationError('Choose active users of this company', { toUserId: ['Unknown user'] });
  }
}
