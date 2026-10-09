import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import type {
  AnnouncementRead, KudosCreate, KudosItem, KudosReaction, MyEngagementState, MyKudos, PollResult, PresenceInput, PulseRespond,
} from '../../../../../shared/self-service/engagement-actions.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { EngagementActionsStore, type EssEmployee } from './engagement-actions-store.js';

/** Hashes pulse answers per survey and employee so responses can't be traced back in the app (see respond). */
export abstract class RespondentSecret {
  abstract value(): string;
}

/**
 * Engagement on My Profile (Phase 34): kudos and reactions, one vote per poll, one set of answers per pulse survey,
 * announcement read receipts / RSVP and the employee's presence. Every write runs in one audited unit of work.
 */
@Injectable()
export class EngagementActionsService {
  constructor(
    private readonly store: EngagementActionsStore,
    private readonly unitOfWork: UnitOfWork,
    private readonly secret: RespondentSecret,
  ) {}

  private async me(user: SessionUser): Promise<EssEmployee> {
    const e = await this.store.employeeOfUser(user.tenantId, user.id);
    if (!e) throw new ConflictError('Your user is not linked to an employee record. Ask HR to link it.', undefined, { code: 'ESS_NO_EMPLOYEE_RECORD' });
    return e;
  }

  private hash(tenantId: string, surveyId: string, employeeId: string) {
    return createHash('sha256').update(`${tenantId}:${surveyId}:${employeeId}:${this.secret.value()}`).digest('hex');
  }

  // ---------------------------------------------------------------- kudos
  async kudos(user: SessionUser): Promise<MyKudos> {
    const me = await this.me(user);
    const yearStart = `${(await this.store.today(user.tenantId)).slice(0, 4)}-01-01`;
    const [ref, wall, received, given, badges] = await Promise.all([
      this.store.employeeRef(user.tenantId, me.id),
      this.store.wall(user.tenantId, me.id, 50),
      this.store.received(user.tenantId, me.id, yearStart),
      this.store.givenCount(user.tenantId, me.id, yearStart),
      this.store.badges(user.tenantId),
    ]);
    const earned: Record<string, number> = {};
    for (const k of received) earned[k.badge] = (earned[k.badge] ?? 0) + 1;
    return {
      me: ref!, wall, received, given: given.count, earned, badges,
      points: received.reduce((n, k) => n + k.pointsToRecipient, 0) + given.points,
    };
  }

  async colleagues(user: SessionUser, search: string | undefined) {
    const me = await this.me(user);
    return this.store.colleagues(user.tenantId, me.id, search);
  }

  async giveKudos(user: SessionUser, meta: RequestMeta, input: KudosCreate): Promise<KudosItem> {
    const me = await this.me(user);
    if (input.toEmployeeId === me.id) throw new ValidationError('You can’t give kudos to yourself.', { toEmployeeId: ['Pick a colleague'] }, { code: 'KUDOS_SELF' });
    if (!(await this.store.activeEmployee(user.tenantId, input.toEmployeeId))) throw new ValidationError('Pick an active colleague', { toEmployeeId: ['Not an active employee'] });
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveKudos({
      fromEmployeeId: me.id, toEmployeeId: input.toEmployeeId, badge: input.badge, message: input.message, shareOnWall: input.shareOnWall,
    }));
    return (await this.store.kudos(user.tenantId, id, me.id))!;
  }

  async react(user: SessionUser, meta: RequestMeta, kudosId: string, reaction: KudosReaction): Promise<KudosItem> {
    const me = await this.me(user);
    const k = await this.store.kudos(user.tenantId, kudosId, me.id);
    if (!k) throw new NotFoundError('Kudos not found');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.toggleReaction(user.tenantId, kudosId, me.id, reaction));
    return (await this.store.kudos(user.tenantId, kudosId, me.id))!;
  }

  // ---------------------------------------------------------------- polls & pulse
  async vote(user: SessionUser, meta: RequestMeta, pollId: string, optionId: string): Promise<{ pollId: string; optionId: string; results: PollResult | null }> {
    const me = await this.me(user);
    const p = await this.store.poll(user.tenantId, pollId);
    if (!p) throw new NotFoundError('Poll not found');
    const now = new Date();
    if (p.status !== 'OPEN' || now >= p.closesAt || now < p.opensAt) throw new ConflictError('This poll is closed.', undefined, { code: 'POLL_CLOSED' });
    if (!p.optionIds.includes(optionId)) throw new ValidationError('Choose one of the poll’s options', { optionId: ['Not an option of this poll'] });
    const voted = () => new ConflictError('You have already voted in this poll.', undefined, { code: 'POLL_ALREADY_VOTED' });
    if (await this.store.hasVoted(user.tenantId, pollId, me.id)) throw voted();
    try {
      await this.unitOfWork.run(actorContext(user, meta), () => this.store.vote(user.tenantId, pollId, optionId, me.id));
    } catch (e) {
      // the unique (poll, employee) index: a vote raced in from another tab
      if (await this.store.hasVoted(user.tenantId, pollId, me.id)) throw voted();
      throw e;
    }
    return { pollId, optionId, results: p.showResultsAfterVote ? await this.store.results(user.tenantId, pollId) : null };
  }

  /**
   * Pulse answers are stored against a hash of (tenant, survey, employee, server secret) with the department only, so
   * HR reports can't link an answer to a person. The database's row history still records who saved them.
   */
  async respond(user: SessionUser, meta: RequestMeta, surveyId: string, input: PulseRespond) {
    const me = await this.me(user);
    const s = await this.store.survey(user.tenantId, surveyId);
    if (!s) throw new NotFoundError('Survey not found');
    const today = await this.store.today(user.tenantId);
    if (s.status !== 'OPEN' || today < s.periodFrom || today > s.periodTo) throw new ConflictError('This survey is closed.', undefined, { code: 'PULSE_CLOSED' });
    const given = new Map(input.answers.map((a) => [a.questionId, a.score]));
    if (given.size !== input.answers.length || given.size !== s.questionIds.length || s.questionIds.some((q) => !given.has(q))) {
      throw new ValidationError('Answer every question once', { answers: ['Answer every question of the survey once'] });
    }
    const hash = this.hash(user.tenantId, surveyId, me.id);
    const answered = () => new ConflictError('You have already answered this survey.', undefined, { code: 'PULSE_ALREADY_ANSWERED' });
    if (await this.store.hasAnswered(user.tenantId, surveyId, hash)) throw answered();
    try {
      await this.unitOfWork.run(actorContext(user, meta), () => this.store.answer(user.tenantId, surveyId, hash, me.departmentId, s.questionIds.map((q) => ({ questionId: q, score: given.get(q)! }))));
    } catch (e) {
      if (await this.store.hasAnswered(user.tenantId, surveyId, hash)) throw answered();
      throw e;
    }
    return { surveyId, answered: true };
  }

  async state(user: SessionUser): Promise<MyEngagementState> {
    const me = await this.store.employeeOfUser(user.tenantId, user.id);
    if (!me) return { votes: [], answeredSurveyIds: [] };
    const [votes, open] = await Promise.all([this.store.myVotes(user.tenantId, me.id), this.store.openSurveyIds(user.tenantId)]);
    return {
      votes: await Promise.all(votes.map(async (v) => ({ pollId: v.pollId, optionId: v.optionId, results: v.showResults ? await this.store.results(user.tenantId, v.pollId) : null }))),
      answeredSurveyIds: await this.store.answeredSurveys(user.tenantId, new Map(open.map((id) => [this.hash(user.tenantId, id, me.id), id]))),
    };
  }

  // ---------------------------------------------------------------- announcements & presence
  async markRead(user: SessionUser, meta: RequestMeta, announcementId: string, rsvp: string | null | undefined): Promise<AnnouncementRead> {
    const me = await this.me(user);
    const a = await this.store.announcement(user.tenantId, announcementId);
    if (!a || a.status !== 'PUBLISHED') throw new NotFoundError('Announcement not found');
    if (rsvp && !a.requiresRsvp) throw new ValidationError('This announcement takes no RSVP', { rsvp: ['No RSVP for this announcement'] });
    return this.unitOfWork.run(actorContext(user, meta), () => this.store.markRead(user.tenantId, announcementId, me.id, a.requiresRsvp ? rsvp : undefined));
  }

  async reads(user: SessionUser) {
    const me = await this.store.employeeOfUser(user.tenantId, user.id);
    return me ? this.store.reads(user.tenantId, me.id) : [];
  }

  async setPresence(user: SessionUser, meta: RequestMeta, input: PresenceInput) {
    const me = await this.me(user);
    if (input.untilAt && new Date(input.untilAt) <= new Date()) throw new ValidationError('Pick a time in the future', { untilAt: ['Already past'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setPresence(user.tenantId, me.id, input));
    return (await this.store.directory(user.tenantId, me.id, {})).mine;
  }

  async directory(user: SessionUser, q: { search?: string; departmentId?: string }) {
    const me = await this.store.employeeOfUser(user.tenantId, user.id);
    return this.store.directory(user.tenantId, me?.id ?? null, q);
  }
}
