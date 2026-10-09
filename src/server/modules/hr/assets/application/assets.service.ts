import { Injectable } from '@nestjs/common';
import type { EmployeeAssetIssue, EmployeeAssetReturn, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { EmployeeAssetStore } from './asset-store.js';

/**
 * Assets issued to employees (Phase 33): issue (optionally a fixed asset, one holder at a time) and return. The
 * database turns an asset still issued at exit into a clearance item and clears it when the asset comes back.
 */
@Injectable()
export class EmployeeAssetsService {
  constructor(
    private readonly store: EmployeeAssetStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  private async employee(user: SessionUser, id: string) {
    const e = await this.store.employee(user.tenantId, id);
    if (!e) throw new NotFoundError('Employee not found');
    return e;
  }

  async list(user: SessionUser, employeeId: string) {
    await this.employee(user, employeeId);
    return this.store.list(user.tenantId, employeeId);
  }

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  async issue(user: SessionUser, meta: RequestMeta, employeeId: string, input: EmployeeAssetIssue) {
    const e = await this.employee(user, employeeId);
    if (e.status === 'EXITED') throw new ConflictError('This employee has exited.', undefined, { code: 'EMPLOYEE_EXITED' });
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.issue({ ...input, employeeId }));
    return this.one(user, id);
  }

  async return(user: SessionUser, meta: RequestMeta, id: string, input: EmployeeAssetReturn) {
    const a = await this.one(user, id);
    if (a.status !== 'ISSUED') throw new ConflictError(`${a.assetName} is not issued.`, undefined, { code: 'EMPLOYEE_ASSET_NOT_ISSUED' });
    if (a.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this asset. Reload and try again.');
    if (input.returnedOn < a.issuedOn) throw new ValidationError('The return date is before the issue date', { returnedOn: ['On or after the issue date'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.return(id, input.returnedOn, input.condition, input.remarks));
    return this.one(user, id);
  }

  private async one(user: SessionUser, id: string) {
    const a = await this.store.get(user.tenantId, id);
    if (!a) throw new NotFoundError('Asset not found');
    return a;
  }
}
