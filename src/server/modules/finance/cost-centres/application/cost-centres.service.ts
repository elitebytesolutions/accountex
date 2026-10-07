import { Injectable } from '@nestjs/common';
import type {
  AllocationRule,
  AllocationRuleSave,
  AllocationRuleUpdate,
  CostCentre,
  CostCentreCreate,
  CostCentreUpdate,
  Project,
  ProjectCreate,
  ProjectUpdate,
  SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { CostStore } from './cost-store.js';

/** Cost Centres & Projects: where money is spent or earned, and rules that split shared costs. */
@Injectable()
export class CostCentresService {
  constructor(
    private readonly store: CostStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  centres(user: SessionUser): Promise<CostCentre[]> {
    return this.store.centres(user.tenantId);
  }

  async createCentre(user: SessionUser, meta: RequestMeta, input: CostCentreCreate): Promise<CostCentre> {
    await this.checkRetired(user, 'centre', input.code);
    await this.checkCentreRefs(user, input, null);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveCentre({ ...input, status: 'ACTIVE' }));
    return this.centre(user, id);
  }

  async updateCentre(user: SessionUser, meta: RequestMeta, id: string, input: CostCentreUpdate): Promise<CostCentre> {
    await this.currentCentre(user, id, input.rowVersion);
    await this.checkRetired(user, 'centre', input.code);
    await this.checkCentreRefs(user, input, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveCentre({ ...input, id }));
    return this.centre(user, id);
  }

  async setCentreStatus(user: SessionUser, meta: RequestMeta, id: string, status: 'ACTIVE' | 'INACTIVE', rowVersion: number): Promise<CostCentre> {
    await this.currentCentre(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveCentre({ id, status, rowVersion }));
    return this.centre(user, id);
  }

  async deleteCentre(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.currentCentre(user, id, rowVersion);
    if ((await this.store.centres(user.tenantId)).some((c) => c.parentId === id)) {
      throw new ConflictError('This cost centre has sub-centres. Move or delete them first.', undefined, { code: 'COST_CENTRE_HAS_CHILDREN' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteCentre(user.tenantId, id, rowVersion));
  }

  projects(user: SessionUser): Promise<Project[]> {
    return this.store.projects(user.tenantId);
  }

  async createProject(user: SessionUser, meta: RequestMeta, input: ProjectCreate): Promise<Project> {
    await this.checkRetired(user, 'project', input.code);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveProject(user.tenantId, input));
    return this.project(user, id);
  }

  async updateProject(user: SessionUser, meta: RequestMeta, id: string, input: ProjectUpdate): Promise<Project> {
    const p = await this.project(user, id);
    if (p.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this project. Reload and try again.');
    await this.checkRetired(user, 'project', input.code);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveProject(user.tenantId, { ...input, id }));
    return this.project(user, id);
  }

  async deleteProject(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const p = await this.project(user, id);
    if (p.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this project. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteProject(user.tenantId, id, rowVersion));
  }

  rules(user: SessionUser): Promise<AllocationRule[]> {
    return this.store.rules(user.tenantId);
  }

  async createRule(user: SessionUser, meta: RequestMeta, input: AllocationRuleSave): Promise<AllocationRule> {
    await this.checkRuleRefs(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveRule(input));
    return this.rule(user, id);
  }

  async updateRule(user: SessionUser, meta: RequestMeta, id: string, input: AllocationRuleUpdate): Promise<AllocationRule> {
    const r = await this.rule(user, id);
    if (r.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this rule. Reload and try again.');
    await this.checkRuleRefs(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveRule({ ...input, id }));
    return this.rule(user, id);
  }

  async deleteRule(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const r = await this.rule(user, id);
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this rule. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteRule(user.tenantId, id));
  }

  private async centre(user: SessionUser, id: string) {
    const c = (await this.store.centres(user.tenantId)).find((x) => x.id === id);
    if (!c) throw new NotFoundError('Cost centre not found');
    return c;
  }

  private async currentCentre(user: SessionUser, id: string, rowVersion: number) {
    const c = await this.centre(user, id);
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this cost centre. Reload and try again.');
    return c;
  }

  private async project(user: SessionUser, id: string) {
    const p = (await this.store.projects(user.tenantId)).find((x) => x.id === id);
    if (!p) throw new NotFoundError('Project not found');
    return p;
  }

  private async rule(user: SessionUser, id: string) {
    const r = (await this.store.rules(user.tenantId)).find((x) => x.id === id);
    if (!r) throw new NotFoundError('Allocation rule not found');
    return r;
  }

  /** The parent must be a centre of this company and not the centre itself or one of its descendants. */
  private async checkCentreRefs(user: SessionUser, input: { parentId?: string | null; branchId?: string | null }, selfId: string | null) {
    if (input.branchId && !(await this.store.activeBranch(user.tenantId, input.branchId))) {
      throw new ValidationError('Choose an active branch', { branchId: ['Unknown or inactive branch'] });
    }
    if (!input.parentId) return;
    const all = await this.store.centres(user.tenantId);
    if (!all.some((c) => c.id === input.parentId)) throw new ValidationError('Unknown parent', { parentId: ['Unknown cost centre'] });
    for (let p: string | null = input.parentId; p; p = all.find((c) => c.id === p)?.parentId ?? null) {
      if (p === selfId) throw new ValidationError("A cost centre can't sit under itself.", { parentId: ['Creates a loop'] }, { code: 'COST_CENTRE_CYCLE' });
    }
  }

  private async checkRuleRefs(user: SessionUser, input: AllocationRuleSave) {
    if (!(await this.store.postableAccount(user.tenantId, input.accountId))) {
      throw new ValidationError('Choose an active postable account', { accountId: ['Postable accounts only'] }, { code: 'ACCOUNT_NOT_POSTABLE' });
    }
    const ids = new Set((await this.store.centres(user.tenantId)).filter((c) => c.status === 'ACTIVE').map((c) => c.id));
    if (input.splits.some((s) => !ids.has(s.costCentreId))) throw new ValidationError('Choose active cost centres', { splits: ['Unknown or inactive cost centre'] });
  }

  private async checkRetired(user: SessionUser, kind: 'centre' | 'project', code: string | undefined) {
    if (code && (await this.store.retiredCodes(user.tenantId, kind)).includes(code)) {
      throw new ConflictError(`Code ${code} belonged to a deleted ${kind === 'centre' ? 'cost centre' : 'project'} and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' });
    }
  }
}
