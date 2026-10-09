import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import type { MyPolicies, PolicyAcknowledge, PolicyAcknowledgementReport, TeamPolicyStatus } from '../../../../../shared/self-service/policy-ack.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, NotFoundError } from '../../../../core/domain/errors.js';
import { PolicyAckStore } from './policy-ack-store.js';

const noEmployee = () => new ConflictError('Your user is not linked to an employee record. Ask HR to link it.', undefined, { code: 'ESS_NO_EMPLOYEE_RECORD' });

/**
 * Policy acknowledgements (Phase 34). An employee reads the published version of a policy and signs it with their typed
 * name; the acknowledgement keeps the version, time, IP and browser. Acknowledging again is a no-op. When every required
 * policy is acknowledged, the employee's open onboarding "policies" task completes.
 */
@Injectable()
export class PolicyAcksService {
  constructor(private readonly store: PolicyAckStore, private readonly unitOfWork: UnitOfWork) {}

  private async me(user: SessionUser) {
    const id = await this.store.employeeIdOfUser(user.tenantId, user.id);
    if (!id) throw noEmployee();
    return id;
  }

  async mine(user: SessionUser): Promise<MyPolicies> {
    const me = await this.store.employeeIdOfUser(user.tenantId, user.id);
    if (!me) return { employeeName: null, policies: [], summary: { required: 0, acknowledged: 0 } };
    const [policies, employeeName] = await Promise.all([this.store.myPolicies(user.tenantId, me), this.store.employeeName(user.tenantId, me)]);
    const required = policies.filter((p) => p.requiresAcknowledgement);
    return { employeeName, policies, summary: { required: required.length, acknowledged: required.filter((p) => p.acknowledgedAt).length } };
  }

  /** Returns the acknowledgement and whether it was created now (false = already acknowledged). */
  async acknowledge(user: SessionUser, meta: RequestMeta, policyId: string, input: PolicyAcknowledge) {
    const me = await this.me(user);
    const p = await this.store.policy(user.tenantId, policyId);
    if (!p || p.deletedAt) throw new NotFoundError('Policy not found');
    const existing = await this.store.acknowledgement(user.tenantId, policyId, me);
    if (existing) return { created: false, acknowledgement: existing };
    if (p.status !== 'PUBLISHED') throw new ConflictError('Only a published policy can be acknowledged.', undefined, { code: 'POLICY_NOT_PUBLISHED' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const taskId = await this.store.openPolicyTask(user.tenantId, me);
      await this.store.insert({
        policyDocumentId: policyId, employeeId: me, readToEnd: input.readToEnd, signatureText: input.signatureText,
        ipAddress: meta.clientIp ?? null, userAgent: meta.userAgent?.slice(0, 500) ?? null, onboardingTaskId: taskId,
      });
      if (taskId) {
        const left = (await this.store.myPolicies(user.tenantId, me)).filter((x) => x.requiresAcknowledgement && !x.acknowledgedAt);
        if (!left.length) await this.store.completeTask(taskId, 'All company policies acknowledged');
      }
    });
    return { created: true, acknowledgement: (await this.store.acknowledgement(user.tenantId, policyId, me))! };
  }

  async report(user: SessionUser, policyId: string): Promise<PolicyAcknowledgementReport> {
    const p = await this.store.policy(user.tenantId, policyId);
    if (!p || p.deletedAt) throw new NotFoundError('Policy not found');
    const [acknowledged, pending] = await Promise.all([
      this.store.acknowledgements(user.tenantId, policyId),
      p.status === 'PUBLISHED' && p.requiresAcknowledgement ? this.store.pending(user.tenantId, policyId) : Promise.resolve([]),
    ]);
    return {
      policy: { id: p.id, code: p.code, title: p.title, version: p.version, status: p.status, requiresAcknowledgement: p.requiresAcknowledgement },
      acknowledged, pending,
      counts: { acknowledged: acknowledged.length, pending: pending.length, total: acknowledged.length + pending.length },
    };
  }

  async team(user: SessionUser): Promise<TeamPolicyStatus> {
    const me = await this.me(user);
    const reports = await this.store.directReports(user.tenantId, me);
    if (!reports.length) return [];
    const { policies, acked } = await this.store.requiredWithAcks(user.tenantId, reports.map((r) => r.id));
    return reports.map((e) => {
      const missing = policies.filter((p) => !acked.has(`${p.id}:${e.id}`)).map((p) => ({ policyId: p.id, code: p.code, title: p.title, version: p.version }));
      return { employee: e, required: policies.length, acknowledged: policies.length - missing.length, missing };
    });
  }
}
