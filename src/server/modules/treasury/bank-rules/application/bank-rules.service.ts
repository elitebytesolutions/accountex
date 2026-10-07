import { Injectable } from '@nestjs/common';
import {
  ruleMatches,
  type BankRule,
  type BankRuleSave,
  type BankRuleTest,
  type BankRuleTestResult,
  type BankRuleUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { GlLinks } from '../../gl-links/application/gl-links.js';
import { BankRuleStore } from './bank-rule-store.js';

/** Bank rules: categorise statement lines (applied by the statement import, Phase 17); first matching rule by priority wins. */
@Injectable()
export class BankRulesService {
  constructor(
    private readonly store: BankRuleStore,
    private readonly gl: GlLinks,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: BankRuleSave): Promise<BankRule> {
    const taken = new Set(await this.store.allCodes(user.tenantId));
    let code = input.code;
    if (code && taken.has(code)) {
      throw (await this.store.retiredCodes(user.tenantId)).includes(code)
        ? new ConflictError(`Code ${code} belonged to a deleted rule and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' })
        : new ConflictError(`Code ${code} is already used.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
    if (!code) {
      let n = 1;
      while (taken.has(`BR-${String(n).padStart(2, '0')}`)) n++;
      code = `BR-${String(n).padStart(2, '0')}`;
    }
    await this.check(user, input);
    const rules = await this.store.list(user.tenantId);
    const priority = Math.max(0, ...rules.map((r) => r.priority)) + 10;
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...this.body(input), code, priority }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: BankRuleUpdate): Promise<BankRule> {
    const r = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== r.code) throw new ValidationError("A rule's code doesn't change", { code: ['Fixed once created'] });
    await this.check(user, input);
    // Conditions are replaced as a list (sent without ids: the old ones are removed, the new ones inserted).
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...this.body(input), id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async setEnabled(user: SessionUser, meta: RequestMeta, id: string, isEnabled: boolean, rowVersion: number): Promise<BankRule> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, isEnabled }));
    return this.get(user, id);
  }

  /** Priorities follow the given order (10, 20, …); rules left out keep their place after them. */
  async reorder(user: SessionUser, meta: RequestMeta, ids: string[]): Promise<BankRule[]> {
    const rules = await this.store.list(user.tenantId);
    if (ids.some((id) => !rules.some((r) => r.id === id))) throw new ValidationError('Unknown rule in the order', { ids: ['Reload and try again'] });
    const rest = rules.filter((r) => !ids.includes(r.id)).map((r) => r.id);
    const order = [...ids, ...rest].map((id, i) => ({ id, priority: (i + 1) * 10 }));
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setPriorities(user.tenantId, order));
    return this.store.list(user.tenantId);
  }

  /** Which sample lines a draft (or the enabled saved rules, by priority) would categorise. */
  async test(user: SessionUser, input: BankRuleTest, ruleId?: string): Promise<BankRuleTestResult> {
    let rules: { id: string | null; code: string | null; name: string | null; matchMode: string; conditions: { field: string; operator: string; value: string }[] }[];
    if (input.draft) rules = [{ id: null, code: null, name: null, ...input.draft }];
    else {
      const saved = (await this.store.list(user.tenantId)).sort((a, b) => a.priority - b.priority);
      rules = ruleId ? saved.filter((r) => r.id === ruleId) : saved.filter((r) => r.isEnabled);
      if (ruleId && !rules.length) throw new NotFoundError('Bank rule not found');
    }
    const lines = input.lines.map((line, index) => {
      const hit = rules.find((r) => ruleMatches(r, line));
      return { index, matched: !!hit, ruleId: hit ? hit.id : null, ruleCode: hit?.code ?? null, ruleName: hit?.name ?? null };
    });
    return { lines, matched: lines.filter((l) => l.matched).length };
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Statement lines were categorised by this rule. Disable it instead.', undefined, { code: 'BANK_RULE_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private body(input: BankRuleSave) {
    return {
      name: input.name, matchMode: input.matchMode, bankAccountId: input.bankAccountId, accountId: input.accountId, costCentreId: input.costCentreId,
      autoPost: input.autoPost, isEnabled: input.isEnabled, conditions: input.conditions.map((c, i) => ({ seq: i + 1, ...c })),
    };
  }

  private async check(user: SessionUser, input: BankRuleSave) {
    await this.gl.postable(user, input.accountId, 'accountId');
    if (input.bankAccountId && !(await this.store.activeBankAccount(user.tenantId, input.bankAccountId))) {
      throw new ValidationError('Choose an active bank account', { bankAccountId: ['Unknown or inactive bank account'] });
    }
    if (input.costCentreId && !(await this.store.activeCostCentre(user.tenantId, input.costCentreId))) {
      throw new ValidationError('Choose an active cost centre', { costCentreId: ['Unknown or inactive cost centre'] });
    }
  }

  private async get(user: SessionUser, id: string) {
    const r = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!r) throw new NotFoundError('Bank rule not found');
    return r;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this rule. Reload and try again.');
    return r;
  }
}
