import type { Announcement, AnnouncementOptions, MyAnnouncement } from "@/shared/self-service/announcement";
import type { EngagementOptions, MyEngagement, Poll, PulseSurvey } from "@/shared/self-service/engagement";
import type { HelpdeskCategory, HelpdeskFaq, MyHelpdesk } from "@/shared/self-service/helpdesk";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
type Version = { rowVersion: number };
const del = (path: string, rowVersion: number) => apiRequest<void>(`${path}?rowVersion=${rowVersion}`, { method: "DELETE" });
const post = <T,>(path: string, body: Body) => apiRequest<T>(path, { method: "POST", body });

/** Browser clients for Phase 15 self-service setup and the employee views. */
// ---------------------------------------------------------------- helpdesk
export const listHelpdeskCategories = () => apiRequest<HelpdeskCategory[]>("/helpdesk/categories");
export const createHelpdeskCategory = (body: Body) => post<HelpdeskCategory>("/helpdesk/categories", body);
export const updateHelpdeskCategory = (id: string, body: Body & Version) => apiRequest<HelpdeskCategory>(`/helpdesk/categories/${id}`, { method: "PATCH", body });
export const setHelpdeskCategoryActive = (id: string, on: boolean, rowVersion: number) => post<HelpdeskCategory>(`/helpdesk/categories/${id}/${on ? "activate" : "deactivate"}`, { rowVersion });
export const deleteHelpdeskCategory = (id: string, rv: number) => del(`/helpdesk/categories/${id}`, rv);

export const listHelpdeskFaqs = () => apiRequest<HelpdeskFaq[]>("/helpdesk/faqs");
export const createHelpdeskFaq = (body: Body) => post<HelpdeskFaq>("/helpdesk/faqs", body);
export const updateHelpdeskFaq = (id: string, body: Body & Version) => apiRequest<HelpdeskFaq>(`/helpdesk/faqs/${id}`, { method: "PATCH", body });
export const setHelpdeskFaqPublished = (id: string, on: boolean, rowVersion: number) => post<HelpdeskFaq>(`/helpdesk/faqs/${id}/${on ? "activate" : "deactivate"}`, { rowVersion });
export const deleteHelpdeskFaq = (id: string, rv: number) => del(`/helpdesk/faqs/${id}`, rv);

export const myHelpdesk = () => apiRequest<MyHelpdesk>("/me/helpdesk");

// ---------------------------------------------------------------- announcements
export const listAnnouncements = (status?: string) => apiRequest<Announcement[]>(`/company/announcements${status ? `?status=${encodeURIComponent(status)}` : ""}`);
export const announcementOptions = () => apiRequest<AnnouncementOptions>("/company/announcements/options");
export const createAnnouncement = (body: Body) => post<Announcement>("/company/announcements", body);
export const updateAnnouncement = (id: string, body: Body & Version) => apiRequest<Announcement>(`/company/announcements/${id}`, { method: "PATCH", body });
export const publishAnnouncement = (id: string, body: Body & Version) => post<Announcement>(`/company/announcements/${id}/publish`, body);
export const archiveAnnouncement = (id: string, rowVersion: number) => post<Announcement>(`/company/announcements/${id}/archive`, { rowVersion });
export const pinAnnouncement = (id: string, isPinned: boolean, rowVersion: number) => post<Announcement>(`/company/announcements/${id}/pin`, { isPinned, rowVersion });

export const myAnnouncements = () => apiRequest<MyAnnouncement[]>("/me/announcements");

// ---------------------------------------------------------------- polls & pulse surveys
export const engagementOptions = () => apiRequest<EngagementOptions>("/company/engagement-options");
export const listPolls = () => apiRequest<Poll[]>("/company/polls");
export const createPoll = (body: Body) => post<Poll>("/company/polls", body);
export const updatePoll = (id: string, body: Body & Version) => apiRequest<Poll>(`/company/polls/${id}`, { method: "PATCH", body });
export const movePoll = (id: string, action: "open" | "close", rowVersion: number) => post<Poll>(`/company/polls/${id}/${action}`, { rowVersion });
export const deletePoll = (id: string, rv: number) => del(`/company/polls/${id}`, rv);

export const listPulseSurveys = () => apiRequest<PulseSurvey[]>("/company/pulse-surveys");
export const createPulseSurvey = (body: Body) => post<PulseSurvey>("/company/pulse-surveys", body);
export const updatePulseSurvey = (id: string, body: Body & Version) => apiRequest<PulseSurvey>(`/company/pulse-surveys/${id}`, { method: "PATCH", body });
export const movePulseSurvey = (id: string, action: "open" | "close", rowVersion: number) => post<PulseSurvey>(`/company/pulse-surveys/${id}/${action}`, { rowVersion });
export const deletePulseSurvey = (id: string, rv: number) => del(`/company/pulse-surveys/${id}`, rv);

export const myEngagement = () => apiRequest<MyEngagement>("/me/engagement");
