import type { EmpRef } from '../../../../../shared/index.js';
import type {
  AnnouncementRead, Colleague, Directory, KudosItem, KudosReaction, PollResult, PresenceInput,
} from '../../../../../shared/self-service/engagement-actions.js';

export type EssEmployee = { id: string; departmentId: string | null; status: string };
export type PollFacts = { id: string; status: string; closesAt: Date; opensAt: Date; showResultsAfterVote: boolean; optionIds: string[] };
export type SurveyFacts = { id: string; status: string; periodFrom: string; periodTo: string; questionIds: string[] };
export type AnnouncementFacts = { id: string; status: string; requiresRsvp: boolean };

/** Port: Kudos, KudosReactions, PollVotes, PulseSurveyResponses, CompanyAnnouncementReads, PresenceStatuses. */
export abstract class EngagementActionsStore {
  abstract employeeOfUser(tenantId: string, userId: string): Promise<EssEmployee | null>;
  abstract employeeRef(tenantId: string, employeeId: string): Promise<EmpRef | null>;
  abstract today(tenantId: string): Promise<string>;

  // kudos
  abstract wall(tenantId: string, viewerId: string, limit: number): Promise<KudosItem[]>;
  abstract received(tenantId: string, viewerId: string, yearStart: string): Promise<KudosItem[]>;
  abstract givenCount(tenantId: string, employeeId: string, yearStart: string): Promise<{ count: number; points: number }>;
  abstract badges(tenantId: string): Promise<{ code: string; label: string }[]>;
  abstract kudos(tenantId: string, id: string, viewerId: string): Promise<KudosItem | null>;
  abstract colleagues(tenantId: string, excludeId: string, search: string | undefined): Promise<Colleague[]>;
  abstract activeEmployee(tenantId: string, id: string): Promise<boolean>;
  /** kudosAddUpdate (never with reactions[]). */
  abstract saveKudos(data: Record<string, unknown>): Promise<string>;
  /** Toggle: insert the reaction, or flip isActive on the existing row. Returns the new state. */
  abstract toggleReaction(tenantId: string, kudosId: string, employeeId: string, reaction: KudosReaction): Promise<boolean>;

  // polls & pulse
  abstract poll(tenantId: string, id: string): Promise<PollFacts | null>;
  abstract hasVoted(tenantId: string, pollId: string, employeeId: string): Promise<boolean>;
  abstract vote(tenantId: string, pollId: string, optionId: string, employeeId: string): Promise<void>;
  abstract results(tenantId: string, pollId: string): Promise<PollResult>;
  abstract survey(tenantId: string, id: string): Promise<SurveyFacts | null>;
  abstract hasAnswered(tenantId: string, surveyId: string, respondentHash: string): Promise<boolean>;
  abstract answer(tenantId: string, surveyId: string, respondentHash: string, departmentId: string | null, answers: { questionId: string; score: number }[]): Promise<void>;
  abstract myVotes(tenantId: string, employeeId: string): Promise<{ pollId: string; optionId: string; showResults: boolean }[]>;
  abstract answeredSurveys(tenantId: string, hashes: Map<string, string>): Promise<string[]>;
  abstract openSurveyIds(tenantId: string): Promise<string[]>;

  // announcements & presence
  abstract announcement(tenantId: string, id: string): Promise<AnnouncementFacts | null>;
  abstract markRead(tenantId: string, announcementId: string, employeeId: string, rsvp: string | null | undefined): Promise<AnnouncementRead>;
  abstract reads(tenantId: string, employeeId: string): Promise<AnnouncementRead[]>;
  abstract setPresence(tenantId: string, employeeId: string, input: PresenceInput): Promise<void>;
  abstract directory(tenantId: string, viewerId: string | null, q: { search?: string; departmentId?: string }): Promise<Directory>;
}
