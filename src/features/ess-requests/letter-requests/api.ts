import type { LetterRequestItem, LetterRequestList, MyLetterRequests } from "@/shared/self-service/letter-request";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
const post = <T,>(path: string, body: Body) => apiRequest<T>(path, { method: "POST", body });

/** Browser clients for Phase 34 letter requests: the employee's own (/me) and HR's queue (/hr). */
export const myLetterRequests = () => apiRequest<MyLetterRequests>("/me/letter-requests");
export const createLetterRequest = (body: Body) => post<LetterRequestItem>("/me/letter-requests", body);
export const updateLetterRequest = (id: string, body: Body & { rowVersion: number }) => apiRequest<LetterRequestItem>(`/me/letter-requests/${id}`, { method: "PATCH", body });
export const withdrawLetterRequest = (id: string, rowVersion: number) => post<LetterRequestItem>(`/me/letter-requests/${id}/withdraw`, { rowVersion });

export const listLetterRequests = (status = "OPEN", search?: string) =>
  apiRequest<LetterRequestList>(`/hr/letter-requests?status=${status}${search ? `&search=${encodeURIComponent(search)}` : ""}`);
export const reviewLetterRequest = (id: string, rowVersion: number) => post<LetterRequestItem>(`/hr/letter-requests/${id}/review`, { rowVersion });
export const issueLetterRequest = (id: string, rowVersion: number, signatoryEmployeeId?: string | null) =>
  post<LetterRequestItem>(`/hr/letter-requests/${id}/issue`, { rowVersion, signatoryEmployeeId: signatoryEmployeeId ?? null });
export const rejectLetterRequest = (id: string, rowVersion: number, reason: string) => post<LetterRequestItem>(`/hr/letter-requests/${id}/reject`, { rowVersion, reason });

/** The issued letter's PDF (Phase 33 letters attach it as LTR; the employee may open their own). */
export const letterPdfUrl = (attachmentId: string) => `/api/attachments/${attachmentId}`;
