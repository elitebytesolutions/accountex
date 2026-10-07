import { Injectable } from '@nestjs/common';
import type { GlLink, SessionUser } from '../../../../../shared/index.js';
import { ValidationError } from '../../../../core/domain/errors.js';
import { nextLinkedCode } from '../domain/next-code.js';
import { GlLinkStore, type GlAccount } from './gl-link-store.js';

type Purpose = { kind: 'bank' | 'cash'; name: string; currencyCode: string };
const ROLE = { bank: 'DEFAULT_BANK', cash: 'CASH_IN_HAND' } as const;
const SUB_TYPE = { bank: 'BANK', cash: 'CASH' } as const;

/** GL accounts behind bank and cash accounts, and the "must be an active postable account" check other masters use. */
@Injectable()
export class GlLinks {
  constructor(private readonly store: GlLinkStore) {}

  /** An active, postable account (optionally of the given classes); `field` names the form field in the error. */
  async postable(user: SessionUser, id: string, field: string, classes?: number[]): Promise<GlAccount> {
    const a = await this.store.account(user.tenantId, id);
    const ok = a && !a.deleted && a.kind === 'POSTABLE' && a.status === 'ACTIVE' && (!classes || classes.includes(a.accountClass));
    if (!ok) {
      const what = classes?.length === 1 && classes[0] === 5 ? 'an active postable expense account' : 'an active postable account';
      throw new ValidationError(`Choose ${what}`, { [field]: [`Choose ${what}`] }, { code: 'ACCOUNT_NOT_POSTABLE' });
    }
    return a!;
  }

  /**
   * The GL account for a new bank / cash account: link an existing unused asset account, or create one under the
   * chosen group (default: the group of the DEFAULT_BANK / CASH_IN_HAND mapping). Call inside the unit of work.
   */
  async resolve(user: SessionUser, link: GlLink, p: Purpose): Promise<GlAccount> {
    if (link.mode === 'link') {
      const a = await this.postable(user, link.accountId, 'gl', [1]);
      if (await this.store.linked(user.tenantId, a.id)) {
        throw new ValidationError('This GL account is already linked', { gl: ['Already linked to a bank or cash account'] }, { code: 'GL_ACCOUNT_LINKED' });
      }
      if (a.currencyCode !== p.currencyCode) {
        throw new ValidationError('The GL account is in another currency', { gl: [`The GL account is in ${a.currencyCode}`] });
      }
      return a;
    }
    const group = link.parentId ? await this.store.account(user.tenantId, link.parentId) : await this.defaultGroup(user, p.kind);
    if (!group || group.deleted || group.level !== 3 || group.accountClass !== 1) {
      throw new ValidationError('Choose an asset group for the new GL account', { gl: ['Choose an asset group (e.g. 1110 Cash & bank)'] });
    }
    const children = await this.store.children(user.tenantId, group.id);
    const code = nextLinkedCode(group.code, children, SUB_TYPE[p.kind], new Set(children.map((c) => c.code)));
    if (!code) throw new ValidationError(`Group ${group.code} is full`, { gl: [`No free code left under ${group.code}`] });
    const id = await this.store.createPostable({ parentId: group.id, code, name: p.name, accountClass: 1, subType: SUB_TYPE[p.kind], currencyCode: p.currencyCode });
    return (await this.store.account(user.tenantId, id))!;
  }

  private async defaultGroup(user: SessionUser, kind: 'bank' | 'cash') {
    const mapped = await this.store.mapped(user.tenantId, ROLE[kind]);
    return mapped?.parentId ? this.store.account(user.tenantId, mapped.parentId) : null;
  }
}
