import { Injectable } from '@nestjs/common';
import type { MyEngagement, Poll, PulseSurvey } from '../../../../../shared/self-service/engagement.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import type { EmployeePlacement } from '../../announcements/application/announcement-store.js';
import { EngagementStore } from '../application/engagement-store.js';

const day = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class PrismaEngagementStore extends EngagementStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private async departmentNames(tenantId: string, ids: (string | null)[]) {
    const u = [...new Set(ids.filter((x): x is string => !!x))];
    return u.length ? this.prisma.db().departments.findMany({ where: { tenantId, id: { in: u } }, select: { id: true, name: true } }) : [];
  }

  async polls(tenantId: string): Promise<Poll[]> {
    const db = this.prisma.db();
    const rows = await db.polls.findMany({ where: { tenantId }, orderBy: [{ opensAt: 'desc' }, { createdAt: 'desc' }] });
    const options = await db.pollOptions.findMany({ where: { tenantId, pollId: { in: rows.map((r) => r.id) } }, orderBy: { seq: 'asc' } });
    // Votes (Phase 34) have no Prisma model yet: a read-only count by poll.
    const votes = await db.$queryRaw<{ pollId: string; n: number }[]>`
      select "pollId"::text as "pollId", count(*)::int as n from "EmployeeSelfService"."PollVotes" where "tenantId" = ${tenantId}::uuid group by "pollId"`;
    const depts = await this.departmentNames(tenantId, rows.map((r) => r.departmentId));
    return rows.map((p) => ({
      id: p.id, question: p.question, createdByEmployeeId: p.createdByEmployeeId, department: depts.find((d) => d.id === p.departmentId) ?? null,
      opensAt: p.opensAt.toISOString(), closesAt: p.closesAt.toISOString(), showResultsAfterVote: p.showResultsAfterVote, status: p.status,
      options: options.filter((o) => o.pollId === p.id).map((o) => ({ id: o.id, seq: o.seq, label: o.label })),
      voteCount: votes.find((v) => v.pollId === p.id)?.n ?? 0, rowVersion: p.rowVersion,
    }));
  }

  async surveys(tenantId: string): Promise<PulseSurvey[]> {
    const db = this.prisma.db();
    const rows = await db.pulseSurveys.findMany({ where: { tenantId }, orderBy: [{ periodFrom: 'desc' }, { createdAt: 'desc' }] });
    const questions = await db.pulseSurveyQuestions.findMany({ where: { tenantId, surveyId: { in: rows.map((r) => r.id) } }, orderBy: { seq: 'asc' } });
    const responses = await db.$queryRaw<{ surveyId: string; n: number }[]>`
      select "surveyId"::text as "surveyId", count(*)::int as n from "EmployeeSelfService"."PulseSurveyResponses" where "tenantId" = ${tenantId}::uuid group by "surveyId"`;
    const depts = await this.departmentNames(tenantId, rows.map((r) => r.departmentId));
    return rows.map((s) => ({
      id: s.id, title: s.title, periodFrom: day(s.periodFrom), periodTo: day(s.periodTo), department: depts.find((d) => d.id === s.departmentId) ?? null,
      isAnonymous: s.isAnonymous, status: s.status,
      questions: questions.filter((q) => q.surveyId === s.id).map((q) => ({ id: q.id, seq: q.seq, questionText: q.questionText, lowLabel: q.lowLabel, highLabel: q.highLabel, metricKey: q.metricKey })),
      responseCount: responses.find((r) => r.surveyId === s.id)?.n ?? 0, rowVersion: s.rowVersion,
    }));
  }

  departments(tenantId: string) {
    return this.prisma.db().departments.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  async activeDepartment(tenantId: string, id: string) {
    return (await this.prisma.db().departments.count({ where: { tenantId, id, deletedAt: null, isActive: true } })) === 1;
  }

  savePoll(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'pollAddUpdate', data);
  }

  saveSurvey(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'pulseSurveyAddUpdate', data);
  }

  async deletePoll(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().polls.deleteMany({ where: { tenantId, id, rowVersion, status: 'DRAFT' } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this poll. Reload and try again.');
  }

  async deleteSurvey(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().pulseSurveys.deleteMany({ where: { tenantId, id, rowVersion, status: 'DRAFT' } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this survey. Reload and try again.');
  }

  async placement(tenantId: string, userId: string): Promise<EmployeePlacement> {
    return (await this.prisma.db().employees.findFirst({ where: { tenantId, appUserId: userId, deletedAt: null }, select: { branchId: true, departmentId: true } })) ?? null;
  }

  async openFor(tenantId: string, placement: EmployeePlacement, now: Date): Promise<MyEngagement> {
    const forMe = (deptId: string | null) => !deptId || deptId === placement?.departmentId;
    const today = day(now);
    const [polls, surveys] = await Promise.all([this.polls(tenantId), this.surveys(tenantId)]);
    return {
      polls: polls
        .filter((p) => p.status === 'OPEN' && p.opensAt <= now.toISOString() && p.closesAt > now.toISOString() && forMe(p.department?.id ?? null))
        .map((p) => ({ id: p.id, question: p.question, closesAt: p.closesAt, showResultsAfterVote: p.showResultsAfterVote, options: p.options, department: p.department?.name ?? null })),
      surveys: surveys
        .filter((s) => s.status === 'OPEN' && s.periodFrom <= today && s.periodTo >= today && forMe(s.department?.id ?? null))
        .map((s) => ({ id: s.id, title: s.title, periodFrom: s.periodFrom, periodTo: s.periodTo, isAnonymous: s.isAnonymous, questions: s.questions, department: s.department?.name ?? null })),
    };
  }
}
