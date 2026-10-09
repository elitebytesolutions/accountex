import type { EmployeeAssetItem, EmployeeAssetOptions, EmployeeLetterItem, EmployeeLetterOptions } from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
const post = <T,>(path: string, body: Body = {}) => apiRequest<T>(path, { method: "POST", body });

/** Browser clients for Phase 33 employee letters and assets (employee view). The public letter check is GET /api/letters/verify/:code. */
export const employeeLetters = (employeeId: string) => apiRequest<EmployeeLetterItem[]>(`/hr/employees/${employeeId}/letters`);
export const employeeLetterOptions = () => apiRequest<EmployeeLetterOptions>("/hr/letters/options");
export const generateEmployeeLetter = (employeeId: string, body: Body) => post<EmployeeLetterItem>(`/hr/employees/${employeeId}/letters`, body);
export const voidEmployeeLetter = (id: string, reason: string) => post<EmployeeLetterItem>(`/hr/letters/${id}/void`, { reason });
/** Same-origin link: the browser opens the PDF with the session cookie. */
export const attachmentUrl = (id: string) => `/api/attachments/${id}`;

export const employeeAssets = (employeeId: string) => apiRequest<EmployeeAssetItem[]>(`/hr/employees/${employeeId}/assets`);
export const employeeAssetOptions = () => apiRequest<EmployeeAssetOptions>("/hr/assets/options");
export const issueEmployeeAsset = (employeeId: string, body: Body) => post<EmployeeAssetItem>(`/hr/employees/${employeeId}/assets`, body);
export const returnEmployeeAsset = (id: string, body: Body) => post<EmployeeAssetItem>(`/hr/assets/${id}/return`, body);
