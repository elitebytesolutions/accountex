import type { ReminderPreview, ReminderRule, ReminderTemplate } from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
type Version = { rowVersion: number };
const del = (path: string, rowVersion: number) => apiRequest<void>(`${path}?rowVersion=${rowVersion}`, { method: "DELETE" });

/** Browser clients for Phase 9 payment-reminder setup. */
export const listReminderTemplates = () => apiRequest<ReminderTemplate[]>("/receivables/reminder-templates");
export const createReminderTemplate = (body: Body) => apiRequest<ReminderTemplate>("/receivables/reminder-templates", { method: "POST", body });
export const updateReminderTemplate = (id: string, body: Body & Version) => apiRequest<ReminderTemplate>(`/receivables/reminder-templates/${id}`, { method: "PATCH", body });
export const deleteReminderTemplate = (id: string, rowVersion: number) => del(`/receivables/reminder-templates/${id}`, rowVersion);
export const previewReminder = (id: string, body: { customerId?: string | null; language: "en" | "ur"; channel: "WHATSAPP" | "SMS" | "EMAIL" }) =>
  apiRequest<ReminderPreview>(`/receivables/reminder-templates/${id}/preview`, { method: "POST", body });

export const listReminderRules = () => apiRequest<ReminderRule[]>("/receivables/reminder-rules");
export const createReminderRule = (body: Body) => apiRequest<ReminderRule>("/receivables/reminder-rules", { method: "POST", body });
export const updateReminderRule = (id: string, body: Body & Version) => apiRequest<ReminderRule>(`/receivables/reminder-rules/${id}`, { method: "PATCH", body });
export const setReminderRuleActive = (id: string, on: boolean, rowVersion: number) =>
  apiRequest<ReminderRule>(`/receivables/reminder-rules/${id}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
export const deleteReminderRule = (id: string, rowVersion: number) => del(`/receivables/reminder-rules/${id}`, rowVersion);
