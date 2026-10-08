import type {
  AttendanceOptions, AttendanceRegisterView, AttendanceToday, MyAttendance, MyShifts, OpenShiftItem, OvertimeClaim, OvertimeClaimList, OvertimeRate,
  RegisterDay, RegularisationDetail, RegularisationList, RosterWeek, SwapItem,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
const qs = (q: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  return p.toString();
};
const post = <T,>(path: string, body: Body = {}) => apiRequest<T>(path, { method: "POST", body });

/** Browser clients for Phase 30: attendance, regularisation, rosters / swaps / open shifts, overtime claims. */
export const attendanceOptions = () => apiRequest<AttendanceOptions>("/hr/attendance/options");
export const attendanceToday = (q: { date?: string; branch?: string } = {}) => apiRequest<AttendanceToday>(`/hr/attendance/today?${qs(q)}`);
export const attendanceRegister = (q: { month: string; search?: string; department?: string; branch?: string }) => apiRequest<AttendanceRegisterView>(`/hr/attendance/register?${qs(q)}`);
export const attendanceDay = (id: string) => apiRequest<RegisterDay>(`/hr/attendance/days/${id}`);
export const waiveLate = (id: string, rowVersion: number) => post<RegisterDay>(`/hr/attendance/days/${id}/waive-late`, { rowVersion });
export const markAttendance = (body: Body) => post<{ marked: number }>("/hr/attendance/manual", body);
export const processAttendance = (q: { date?: string; month?: string }) => post<{ written: number; days: number }>(`/hr/attendance/process?${qs(q)}`);
export const lockRegister = (month: string) => post<{ locked: number }>(`/hr/attendance/register/lock?${qs({ month })}`);
export const unlockRegister = (month: string) => post<{ unlocked: number }>(`/hr/attendance/register/unlock?${qs({ month })}`);

export const myAttendance = (month?: string) => apiRequest<MyAttendance>(`/me/attendance?${qs({ month })}`);
export const punch = (body: Body) => post<MyAttendance>("/me/attendance/punch", body);

export const listRegularisation = (q: { status?: string; type?: string; search?: string; page?: number; pageSize?: number }) => apiRequest<RegularisationList>(`/hr/regularisation-requests?${qs(q)}`);
export const getRegularisation = (id: string) => apiRequest<RegularisationDetail>(`/hr/regularisation-requests/${id}`);
export const approveRegularisation = (id: string, comment: string | null) => post<RegularisationDetail>(`/hr/regularisation-requests/${id}/approve`, { comment });
export const rejectRegularisation = (id: string, body: Body) => post<RegularisationDetail>(`/hr/regularisation-requests/${id}/reject`, body);
export const approveRegularisations = (ids: string[]) => post<{ done: string[]; failed: { id: string; message: string }[] }>("/hr/regularisation-requests/approve-many", { ids });
export const myRegularisation = () => apiRequest<RegularisationList>(`/me/regularisation-requests?${qs({ status: "ALL", pageSize: 50 })}`);
export const fileRegularisation = (body: Body) => post<RegularisationDetail>("/me/regularisation-requests", body);
export const withdrawRegularisation = (id: string, rowVersion: number) => post<RegularisationDetail>(`/me/regularisation-requests/${id}/withdraw`, { rowVersion });

export const rosterWeek = (q: { week: string; department?: string; branch?: string }) => apiRequest<RosterWeek>(`/hr/rosters?${qs(q)}`);
export const saveRoster = (week: string, body: Body) => apiRequest<{ changed: number; week: RosterWeek }>(`/hr/rosters?${qs({ week })}`, { method: "PUT", body });
export const publishRoster = (week: string, department?: string) => post<{ published: number; week: RosterWeek }>(`/hr/rosters/publish?${qs({ week })}`, { department });
export const listSwaps = (status?: string) => apiRequest<SwapItem[]>(`/hr/shift-swaps?${qs({ status })}`);
export const approveSwap = (id: string) => post<SwapItem>(`/hr/shift-swaps/${id}/approve`, { comment: null });
export const rejectSwap = (id: string, reason: string) => post<SwapItem>(`/hr/shift-swaps/${id}/reject`, { reason });
export const listOpenShifts = (status?: string) => apiRequest<OpenShiftItem[]>(`/hr/open-shifts?${qs({ status })}`);
export const postOpenShift = (body: Body) => post<OpenShiftItem>("/hr/open-shifts", body);
export const cancelOpenShift = (id: string, rowVersion: number) => post<OpenShiftItem>(`/hr/open-shifts/${id}/cancel`, { rowVersion });
export const decideOpenClaim = (claimId: string, action: "confirm" | "decline") => post<OpenShiftItem>(`/hr/open-shifts/claims/${claimId}/${action}`);

export const myShifts = (week?: string) => apiRequest<MyShifts>(`/me/shifts?${qs({ week })}`);
export const requestSwap = (body: Body) => post<SwapItem>("/me/shift-swaps", body);
export const answerSwap = (id: string, accept: boolean, reason?: string) => post<SwapItem>(`/me/shift-swaps/${id}/${accept ? "accept" : "decline"}`, accept ? {} : { reason });
export const withdrawSwap = (id: string, rowVersion: number) => post<SwapItem>(`/me/shift-swaps/${id}/withdraw`, { rowVersion });
export const decideTeamSwap = (id: string, approve: boolean, reason?: string) => post<SwapItem>(`/me/shift-swaps/${id}/${approve ? "approve" : "reject"}`, approve ? { comment: null } : { reason });
export const claimOpenShift = (id: string) => post<OpenShiftItem>(`/me/open-shifts/${id}/claim`);
export const withdrawOpenClaim = (id: string) => post<OpenShiftItem>(`/me/open-shifts/${id}/withdraw`);

export const listOvertimeClaims = (q: { month?: string; status?: string; search?: string; page?: number; pageSize?: number }) => apiRequest<OvertimeClaimList>(`/hr/overtime-claims?${qs(q)}`);
export const overtimeRate = (employeeId: string, date: string) => apiRequest<OvertimeRate>(`/hr/overtime-claims/rate?${qs({ employeeId, date })}`);
export const logOvertime = (body: Body) => post<OvertimeClaim>("/hr/overtime-claims", body);
export const updateOvertime = (id: string, body: Body) => apiRequest<OvertimeClaim>(`/hr/overtime-claims/${id}`, { method: "PATCH", body });
export const approveOvertime = (id: string) => post<OvertimeClaim>(`/hr/overtime-claims/${id}/approve`, { comment: null });
export const rejectOvertime = (id: string, reason: string) => post<OvertimeClaim>(`/hr/overtime-claims/${id}/reject`, { reason });
export const cancelOvertime = (id: string, rowVersion: number) => post<OvertimeClaim>(`/hr/overtime-claims/${id}/cancel`, { rowVersion });
