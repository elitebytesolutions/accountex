import { Injectable } from '@nestjs/common';
import {
  LEDGER_TYPES_BY_DIRECTION,
  type MovementReason,
  type MovementReasonCreate,
  type MovementReasonUpdate,
  type ReasonDirection,
  type SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { GlLinks } from '../../../treasury/gl-links/application/gl-links.js';
import { ReasonStore } from './reason-store.js';

/** Stock movement reasons per direction (in / out / adjustment). System reasons can be edited and deactivated, not deleted. */
@Injectable()
export class ReasonsService {
  constructor(
    private readonly store: ReasonStore,
    private readonly gl: GlLinks,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(user: SessionUser, direction?: string) {
    const all = await this.store.list(user.tenantId);
    return direction ? all.filter((r) => r.direction === direction) : all;
  }

  /** Choices for the reason form (no Finance permission needed). */
  expenseAccounts(user: SessionUser) {
    return this.store.expenseAccounts(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: MovementReasonCreate): Promise<MovementReason> {
    await this.checkCode(user, input.direction, input.code);
    if (input.expenseAccountId) await this.gl.postable(user, input.expenseAccountId, 'expenseAccountId', [5]);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, isSystem: false, isActive: true }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: MovementReasonUpdate): Promise<MovementReason> {
    const r = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== r.code) await this.checkCode(user, r.direction, input.code);
    if (input.ledgerMovementType && !LEDGER_TYPES_BY_DIRECTION[r.direction as ReasonDirection]?.includes(input.ledgerMovementType)) {
      throw new ValidationError('This ledger movement does not fit the direction', { ledgerMovementType: ['Not allowed for this direction'] });
    }
    if (input.expenseAccountId) await this.gl.postable(user, input.expenseAccountId, 'expenseAccountId', [5]);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<MovementReason> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, isActive: active }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const r = await this.current(user, id, rowVersion);
    if (r.isSystem) throw new ConflictError('Standard reasons can be edited or deactivated, not deleted.', undefined, { code: 'SYSTEM_ROW_LOCKED' });
    if (await this.store.inUse(id)) throw new ConflictError('Stock movements use this reason. Deactivate it instead.', undefined, { code: 'MOVEMENT_REASON_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.delete(user.tenantId, id, rowVersion));
  }

  /** Codes are unique per direction and never reused once deleted. */
  private async checkCode(user: SessionUser, direction: string, code: string) {
    if ((await this.store.list(user.tenantId)).some((r) => r.direction === direction && r.code === code)) {
      throw new ConflictError(`Code ${code} is already used.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
    if ((await this.store.retiredCodes(user.tenantId, direction)).includes(code)) {
      throw new ConflictError(`Code ${code} belonged to a deleted reason and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' });
    }
  }

  private async get(user: SessionUser, id: string) {
    const r = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!r) throw new NotFoundError('Reason not found');
    return r;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this reason. Reload and try again.');
    return r;
  }
}
