import { Injectable } from '@nestjs/common';
import type { AccountMapping, AccountMappingSave, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ValidationError } from '../../../../core/domain/errors.js';
import { MappingStore } from './mapping-store.js';

/** Settings › Finance › Default account mapping: which postable account each posting role uses. */
@Injectable()
export class MappingsService {
  constructor(
    private readonly store: MappingStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, all: boolean): Promise<AccountMapping[]> {
    return this.store.list(user.tenantId, all);
  }

  /** Saves every role sent in one transaction (all or nothing). */
  async save(user: SessionUser, meta: RequestMeta, input: AccountMappingSave): Promise<AccountMapping[]> {
    const accountIds = [...new Set(input.mappings.map((m) => m.accountId).filter((a): a is string => !!a))];
    const valid = new Set(await this.store.postableAccounts(user.tenantId, accountIds));
    const errors: Record<string, string[]> = {};
    for (const m of input.mappings) {
      if (!(await this.store.roleExists(m.role))) errors[m.role] = ['Unknown posting role'];
      else if (m.accountId && !valid.has(m.accountId)) errors[m.role] = ['Choose an active postable account'];
    }
    if (Object.keys(errors).length) throw new ValidationError('Choose an active postable account', errors, { code: 'ACCOUNT_NOT_POSTABLE' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const m of input.mappings) await this.store.set(user.tenantId, m.role, m.accountId);
    });
    return this.store.list(user.tenantId, false);
  }
}
