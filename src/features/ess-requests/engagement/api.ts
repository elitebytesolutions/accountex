import type {
  AnnouncementRead, Colleague, Directory, KudosItem, KudosReaction, MyEngagementState, MyKudos, PollResult, Presence,
} from "@/shared/self-service/engagement-actions";
import { apiRequest } from "@/lib/api/client";

const post = <T,>(path: string, body: Record<string, unknown>) => apiRequest<T>(path, { method: "POST", body });
const qs = (q: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => !!e[1])).toString();
  return s ? `?${s}` : "";
};

/** Browser clients for Phase 34 engagement on My Profile (kudos, votes, pulse answers, reads, presence). */
export const myKudos = () => apiRequest<MyKudos>("/me/kudos");
export const kudosColleagues = (search?: string) => apiRequest<Colleague[]>(`/me/kudos/colleagues${qs({ search })}`);
export const giveKudos = (body: { toEmployeeId: string; badge: string; message: string; shareOnWall: boolean }) => post<KudosItem>("/me/kudos", body);
export const reactToKudos = (id: string, reaction: KudosReaction) => post<KudosItem>(`/me/kudos/${id}/react`, { reaction });

export const myEngagementState = () => apiRequest<MyEngagementState>("/me/engagement-state");
export const votePoll = (pollId: string, optionId: string) => post<{ pollId: string; optionId: string; results: PollResult | null }>(`/me/polls/${pollId}/vote`, { optionId });
export const answerPulse = (surveyId: string, answers: { questionId: string; score: number }[]) => post<{ surveyId: string; answered: boolean }>(`/me/pulse-surveys/${surveyId}/respond`, { answers });

export const myAnnouncementReads = () => apiRequest<AnnouncementRead[]>("/me/announcement-reads");
export const markAnnouncementRead = (id: string, rsvp?: string | null) => post<AnnouncementRead>(`/company/announcements/${id}/read`, rsvp === undefined ? {} : { rsvp });

export const myDirectory = (q: { search?: string; departmentId?: string }) => apiRequest<Directory>(`/me/directory${qs(q)}`);
export const setMyPresence = (body: { status: string; message: string | null; locationLabel: string | null; untilAt: string | null }) =>
  apiRequest<Presence | null>("/me/presence", { method: "PUT", body });
