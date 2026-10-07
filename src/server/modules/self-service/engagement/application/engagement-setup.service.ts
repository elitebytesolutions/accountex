import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import type { Poll, PollCreate, PollUpdate, PulseSurvey, PulseSurveyCreate, PulseSurveyUpdate } from '../../../../../shared/self-service/engagement.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { assertEngagementDraft, nextEngagementStatus, syncSeqRows } from '../../domain/rules.js';
import { EngagementStore } from './engagement-store.js';

const today = () => new Date().toISOString().slice(0, 10);

/** Polls and pulse surveys HR sets up: edited while DRAFT, then opened and closed. Votes and responses arrive in Phase 34. */
@Injectable()
export class EngagementSetupService {
  constructor(
    private readonly store: EngagementStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  polls(user: SessionUser) {
    return this.store.polls(user.tenantId);
  }

  surveys(user: SessionUser) {
    return this.store.surveys(user.tenantId);
  }

  async options(user: SessionUser) {
    return { departments: await this.store.departments(user.tenantId) };
  }

  async mine(user: SessionUser) {
    return this.store.openFor(user.tenantId, await this.store.placement(user.tenantId, user.id), new Date());
  }

  // ---------------------------------------------------------------- polls
  async createPoll(user: SessionUser, meta: RequestMeta, input: PollCreate): Promise<Poll> {
    await this.checkDepartment(user, input.departmentId);
    const { options, ...p } = input;
    // The column defaults to OPEN, so a new poll is always sent as DRAFT.
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.savePoll({ ...p, status: 'DRAFT', options: syncSeqRows([], options) }));
    return this.poll(user, id);
  }

  async updatePoll(user: SessionUser, meta: RequestMeta, id: string, input: PollUpdate): Promise<Poll> {
    const cur = await this.currentPoll(user, id, input.rowVersion);
    assertEngagementDraft(cur.status, 'poll');
    const { options, ...p } = input;
    const opensAt = p.opensAt ?? cur.opensAt, closesAt = p.closesAt ?? cur.closesAt;
    if (closesAt <= opensAt) throw new ValidationError('Closes before it opens', { closesAt: ['Closes before it opens'] });
    if (p.departmentId !== undefined) await this.checkDepartment(user, p.departmentId);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.savePoll({ ...p, id, ...(options && { options: syncSeqRows(cur.options, options) }) }));
    return this.poll(user, id);
  }

  async movePoll(user: SessionUser, meta: RequestMeta, id: string, action: 'open' | 'close', rowVersion: number): Promise<Poll> {
    const cur = await this.currentPoll(user, id, rowVersion);
    const status = nextEngagementStatus(cur.status, action);
    if (action === 'open') {
      if (cur.options.length < 2) throw new ValidationError('Give the poll at least 2 options', { options: ['At least 2 options'] });
      if (new Date(cur.closesAt).getTime() <= Date.now()) throw new ValidationError('The closing time has passed. Move it later first.', { closesAt: ['Already past'] });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.savePoll({ id, rowVersion, status }));
    return this.poll(user, id);
  }

  async deletePoll(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const cur = await this.currentPoll(user, id, rowVersion);
    if (cur.voteCount > 0) throw new ConflictError('Employees have already voted. Close it instead.', undefined, { code: 'POLL_IN_USE' });
    assertEngagementDraft(cur.status, 'poll');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deletePoll(user.tenantId, id, rowVersion));
  }

  // ---------------------------------------------------------------- pulse surveys
  async createSurvey(user: SessionUser, meta: RequestMeta, input: PulseSurveyCreate): Promise<PulseSurvey> {
    await this.checkDepartment(user, input.departmentId);
    const { questions, ...s } = input;
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveSurvey({ ...s, status: 'DRAFT', questions: syncSeqRows([], questions) }));
    return this.survey(user, id);
  }

  async updateSurvey(user: SessionUser, meta: RequestMeta, id: string, input: PulseSurveyUpdate): Promise<PulseSurvey> {
    const cur = await this.currentSurvey(user, id, input.rowVersion);
    assertEngagementDraft(cur.status, 'survey');
    const { questions, ...s } = input;
    if ((s.periodTo ?? cur.periodTo) < (s.periodFrom ?? cur.periodFrom)) throw new ValidationError('Ends before it starts', { periodTo: ['Ends before it starts'] });
    if (s.departmentId !== undefined) await this.checkDepartment(user, s.departmentId);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveSurvey({ ...s, id, ...(questions && { questions: syncSeqRows(cur.questions, questions) }) }));
    return this.survey(user, id);
  }

  async moveSurvey(user: SessionUser, meta: RequestMeta, id: string, action: 'open' | 'close', rowVersion: number): Promise<PulseSurvey> {
    const cur = await this.currentSurvey(user, id, rowVersion);
    const status = nextEngagementStatus(cur.status, action);
    if (action === 'open') {
      if (!cur.questions.length) throw new ValidationError('Add a question first', { questions: ['At least 1 question'] });
      if (cur.periodTo < today()) throw new ValidationError('The survey period has ended. Move it later first.', { periodTo: ['Already past'] });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveSurvey({ id, rowVersion, status }));
    return this.survey(user, id);
  }

  async deleteSurvey(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const cur = await this.currentSurvey(user, id, rowVersion);
    if (cur.responseCount > 0) throw new ConflictError('Employees have already answered. Close it instead.', undefined, { code: 'POLL_IN_USE' });
    assertEngagementDraft(cur.status, 'survey');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteSurvey(user.tenantId, id, rowVersion));
  }

  // ---------------------------------------------------------------- helpers
  private async checkDepartment(user: SessionUser, id: string | null | undefined) {
    if (id && !(await this.store.activeDepartment(user.tenantId, id))) throw new ValidationError('Choose an active department', { departmentId: ['Unknown or inactive department'] });
  }

  private async poll(user: SessionUser, id: string) {
    const p = (await this.store.polls(user.tenantId)).find((x) => x.id === id);
    if (!p) throw new NotFoundError('Poll not found');
    return p;
  }

  private async currentPoll(user: SessionUser, id: string, rowVersion: number) {
    const p = await this.poll(user, id);
    if (p.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this poll. Reload and try again.');
    return p;
  }

  private async survey(user: SessionUser, id: string) {
    const s = (await this.store.surveys(user.tenantId)).find((x) => x.id === id);
    if (!s) throw new NotFoundError('Pulse survey not found');
    return s;
  }

  private async currentSurvey(user: SessionUser, id: string, rowVersion: number) {
    const s = await this.survey(user, id);
    if (s.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this survey. Reload and try again.');
    return s;
  }
}
