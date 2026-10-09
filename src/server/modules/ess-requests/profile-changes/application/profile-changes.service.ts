import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import {
  MASKED_FIELDS, PROFILE_FIELD_KEYS, type MyProfile, type ProfileChangeApprove, type ProfileChangeCreate, type ProfileChangeDecision,
  type ProfileChangeQuery, type ProfileChangeReject, type ProfileChangeRequest,
} from '../../../../../shared/self-service/profile-change.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError } from '../../../../core/domain/errors.js';
import { ProfileChangeStore } from './profile-change-store.js';

const notPending = () => new ConflictError('This change request is no longer pending.', undefined, { code: 'PROFILE_CHANGE_NOT_PENDING' });
const alreadyPending = () => new ConflictError('You already have a pending change for this field.', undefined, { code: 'PROFILE_CHANGE_PENDING' });
/** "••••••••3456": all but the last four characters hidden. */
export const mask = (v: string | null) => (v ? v.replace(/[0-9A-Z](?=[0-9A-Z ]{4})/gi, '•') : v);

/**
 * Profile change requests (Phase 34). An employee never edits the HR master: they request a change of one field,
 * HR approves (the value is written to the employee record in the same transaction) or rejects it. One pending
 * request per field (unique index profileChangeRequestOnePending). The reviewer can't decide their own request.
 */
@Injectable()
export class ProfileChangesService {
  constructor(
    private readonly store: ProfileChangeStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  private async me(user: SessionUser) {
    const id = await this.store.employeeOfUser(user.tenantId, user.id);
    if (!id) throw new ConflictError('Your user is not linked to an employee record. Ask HR to link it.', undefined, { code: 'ESS_NO_EMPLOYEE_RECORD' });
    return id;
  }

  // ---------------------------------------------------------------- my profile
  async myProfile(user: SessionUser): Promise<MyProfile> {
    const empId = await this.me(user);
    const [employee, values, labels, list] = await Promise.all([
      this.store.header(user.tenantId, empId),
      this.store.values(user.tenantId, empId),
      this.store.labels(user.tenantId),
      this.store.list(user.tenantId, { status: 'ALL', page: 1, pageSize: 100, employeeId: empId }),
    ]);
    if (!employee) throw new NotFoundError('Employee not found');
    const display = (key: (typeof PROFILE_FIELD_KEYS)[number], raw: string | null) =>
      raw == null ? null : labels.choices[key]?.find((c) => c.code === raw)?.label ?? raw;
    const requests = list.items.map((r) => this.forEmployee(r));
    return {
      employee,
      fields: PROFILE_FIELD_KEYS.map((key) => {
        const p = list.items.find((r) => r.fieldKey === key && r.status === 'PENDING');
        const masked = MASKED_FIELDS.includes(key);
        return {
          key, label: labels.fields[key] ?? key, raw: values[key], masked,
          value: masked ? values[key] : display(key, values[key]),
          pending: p ? { id: p.id, requestedValue: masked ? mask(p.requestedValue)! : display(key, p.requestedValue)!, createdAt: p.createdAt, rowVersion: p.rowVersion } : null,
        };
      }),
      requests,
      choices: labels.choices,
    };
  }

  private forEmployee(r: ProfileChangeRequest): ProfileChangeRequest {
    return MASKED_FIELDS.includes(r.fieldKey) ? { ...r, currentValue: mask(r.currentValue), requestedValue: mask(r.requestedValue)! } : r;
  }

  async request(user: SessionUser, meta: RequestMeta, input: ProfileChangeCreate) {
    const empId = await this.me(user);
    if (await this.store.hasPending(user.tenantId, empId, input.fieldKey)) throw alreadyPending();
    const [values, labels] = await Promise.all([this.store.values(user.tenantId, empId), this.store.labels(user.tenantId)]);
    let id: string;
    try {
      id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({
        employeeId: empId, fieldKey: input.fieldKey, fieldLabel: labels.fields[input.fieldKey] ?? input.fieldKey, currentValue: values[input.fieldKey],
        requestedValue: input.requestedValue, reason: input.reason, proofAttachmentId: input.proofAttachmentId,
      }));
    } catch (e) {
      // a concurrent request for the same field
      if (String((e as Error)?.message ?? '').includes('profileChangeRequestOnePending') || (e as { code?: string })?.code === 'P2002') throw alreadyPending();
      throw e;
    }
    return this.forEmployee((await this.store.get(user.tenantId, id))!);
  }

  async withdraw(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const empId = await this.me(user);
    const r = await this.store.get(user.tenantId, id);
    if (!r || r.employee.id !== empId) throw new NotFoundError('Change request not found');
    if (r.status !== 'PENDING') throw notPending();
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('This request changed. Reload and try again.');
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.setStatus(user.tenantId, id, rowVersion, 'WITHDRAWN'));
    if (!ok) throw new ConcurrencyError('This request changed. Reload and try again.');
    return this.forEmployee((await this.store.get(user.tenantId, id))!);
  }

  // ---------------------------------------------------------------- HR
  list(user: SessionUser, q: ProfileChangeQuery) {
    return this.store.list(user.tenantId, q);
  }

  async get(user: SessionUser, id: string) {
    const r = await this.store.get(user.tenantId, id);
    if (!r) throw new NotFoundError('Change request not found');
    return r;
  }

  private async decidable(user: SessionUser, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.status !== 'PENDING') throw notPending();
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('This request changed. Reload and try again.');
    const own = await this.store.usersOfEmployee(user.tenantId, r.employee.id);
    if (own.includes(user.id)) throw new ForbiddenError('You can’t approve a change to your own profile.', undefined, { code: 'PROFILE_CHANGE_SELF_APPROVAL' });
    return r;
  }

  async approve(user: SessionUser, meta: RequestMeta, id: string, input: ProfileChangeApprove): Promise<ProfileChangeDecision> {
    const r = await this.decidable(user, id, input.rowVersion);
    const applied = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const ok = await this.store.apply(user.tenantId, r.employee.id, r.fieldKey, r.requestedValue);
      await this.store.save({
        id, rowVersion: input.rowVersion, reviewedByUserId: user.id, reviewedAt: new Date().toISOString(), reviewComment: input.comment,
        ...(ok && { appliedAt: new Date().toISOString() }),
      });
      await this.store.approve(id, input.comment);
      return ok;
    });
    return { ...(await this.get(user, id)), applied };
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, input: ProfileChangeReject): Promise<ProfileChangeDecision> {
    await this.decidable(user, id, input.rowVersion);
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.setStatus(user.tenantId, id, input.rowVersion, 'REJECTED', { userId: user.id, comment: input.comment }));
    if (!ok) throw new ConcurrencyError('This request changed. Reload and try again.');
    return { ...(await this.get(user, id)), applied: false };
  }
}
