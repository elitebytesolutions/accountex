import { Injectable } from '@nestjs/common';
import { DEFAULT_CLEARANCE, type ExitInterviewInput, type OffboardingCreate, type OffboardingUpdate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { SessionStore } from '../../../../core/application/ports/session-store.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { OffboardingStore } from './offboarding-store.js';

const closed = () => new ConflictError('This exit is closed or withdrawn.', undefined, { code: 'OFFBOARDING_CLOSED' });
const OPEN = ['SERVING_NOTICE', 'RETENTION_TALK', 'SETTLEMENT'];

/**
 * Offboardings (OFF-): record a resignation / termination with the four default clearance areas, clear or waive each
 * item, save the exit interview, then complete — the database refuses while clearance is pending, marks the employee
 * EXITED and suspends their login, and never touches the company's default user (409). Sessions of a suspended login
 * are revoked in the same transaction. Final settlement is Phase 33.
 */
@Injectable()
export class OffboardingsService {
  constructor(
    private readonly store: OffboardingStore,
    private readonly sessions: SessionStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async board(user: SessionUser, status: string) {
    return this.store.board(user.tenantId, { status, today: await this.store.today(user.tenantId) });
  }

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  async get(user: SessionUser, id: string) {
    const o = await this.store.get(user.tenantId, id);
    if (!o) throw new NotFoundError('Exit not found');
    return o;
  }

  async create(user: SessionUser, meta: RequestMeta, input: OffboardingCreate) {
    const emp = await this.store.employee(user.tenantId, input.employeeId);
    if (!emp || emp.status === 'EXITED') throw new ValidationError('Choose an active employee', { employeeId: ['Not an active employee'] });
    if (await this.store.hasOpen(user.tenantId, emp.id)) throw new ConflictError('This employee already has an exit in progress.', undefined, { code: 'OFFBOARDING_OPEN_EXISTS' });
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({
      ...input, noticeDaysRequired: input.noticeDaysRequired ?? emp.noticeDays,
      clearanceItems: DEFAULT_CLEARANCE.map((c) => ({ clearanceArea: c.area, description: c.description, ...(c.area === 'LINE_MANAGER' && emp.reportingManagerId && { ownerEmployeeId: emp.reportingManagerId }) })),
    }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: OffboardingUpdate) {
    const o = await this.open(user, id, input.rowVersion);
    const exitType = input.exitType ?? o.exitType, resignationDate = input.resignationDate !== undefined ? input.resignationDate : o.resignationDate;
    if (exitType === 'RESIGNATION' && !resignationDate) throw new ValidationError('Give the resignation date', { resignationDate: ['Required for a resignation'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save(Object.fromEntries(Object.entries({ ...input, id }).filter(([, v]) => v !== undefined))));
    return this.get(user, id);
  }

  async clear(user: SessionUser, meta: RequestMeta, id: string, itemId: string, status: 'CLEARED' | 'WAIVED', remarks: string | null) {
    const item = await this.store.clearanceOf(user.tenantId, itemId);
    if (!item || item.offboardingId !== id) throw new NotFoundError('Clearance item not found');
    if (status === 'WAIVED' && !remarks) throw new ValidationError('Say why the item is waived', { remarks: ['Required to waive'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.clear(itemId, status, remarks));
    return this.get(user, id);
  }

  async saveInterview(user: SessionUser, meta: RequestMeta, id: string, input: ExitInterviewInput) {
    const o = await this.open(user, id, input.rowVersion);
    const { rowVersion, ...fields } = input;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, exitInterviews: [{ ...(o.interview && { id: o.interview.id }), ...fields }] }));
    return this.get(user, id);
  }

  async complete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    await this.open(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const r = await this.store.complete(id);
      for (const u of r.suspendedUserIds) await this.sessions.revokeAllForUser(user.tenantId, u, 'SUSPENDED', user.id);
    });
    return this.get(user, id);
  }

  async withdraw(user: SessionUser, meta: RequestMeta, id: string, reason: string | null, rowVersion: number) {
    await this.open(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.withdraw(id, reason));
    return this.get(user, id);
  }

  private async open(user: SessionUser, id: string, rowVersion: number) {
    const o = await this.get(user, id);
    if (!OPEN.includes(o.status)) throw closed();
    if (o.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this exit. Reload and try again.');
    return o;
  }
}
