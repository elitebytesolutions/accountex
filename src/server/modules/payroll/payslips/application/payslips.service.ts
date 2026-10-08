import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../../core/domain/errors.js';
import { PayslipStore, type PayslipQuery } from './payslip-store.js';

/** Payslips: HR sees every payslip of a run; an employee sees only their own published payslips (opening one marks it viewed). */
@Injectable()
export class PayslipsService {
  constructor(
    private readonly store: PayslipStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: PayslipQuery) {
    return this.store.list(user.tenantId, q);
  }

  async get(user: SessionUser, meta: RequestMeta, id: string, print = false) {
    const p = await this.store.get(user.tenantId, id);
    if (!p) throw new NotFoundError('Payslip not found');
    if (print) await this.unitOfWork.run(actorContext(user, meta), () => this.store.markPrinted(user.tenantId, id));
    return p;
  }

  private async me(user: SessionUser) {
    const e = await this.store.employeeOf(user.tenantId, user.id);
    if (!e) throw new ConflictError('Your user is not linked to an employee record.', undefined, { code: 'NO_EMPLOYEE_RECORD' });
    return e.id;
  }

  async mine(user: SessionUser) {
    return this.store.mine(user.tenantId, await this.me(user));
  }

  async myGet(user: SessionUser, meta: RequestMeta, id: string) {
    const employeeId = await this.me(user);
    const p = await this.store.get(user.tenantId, id);
    if (!p) throw new NotFoundError('Payslip not found');
    if (p.employee.id !== employeeId) throw new ForbiddenError('You can only see your own payslips.', undefined, { code: 'PAYSLIP_NOT_YOURS' });
    if (!p.publishedToEssAt) throw new NotFoundError('This payslip is not published yet');
    if (!p.viewedAt) await this.unitOfWork.run(actorContext(user, meta), () => this.store.markViewed(user.tenantId, id));
    return p;
  }
}
