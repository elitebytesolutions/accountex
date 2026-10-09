import type { ApprovalInbox } from "@/shared";
import type { MyTeam } from "@/shared/self-service/my-team";
import { apiRequest } from "@/lib/api/client";

/** Browser clients for My Profile › My Team (Phase 34). Decisions reuse the approvals inbox (Phase 16). */
export const myTeam = (month?: string) => apiRequest<MyTeam>(`/me/team${month ? `?month=${month}` : ""}`);
export const teamInbox = () => apiRequest<ApprovalInbox>("/approvals/inbox");
export const decideApproval = (id: string, action: "approve" | "reject", reason: string | null) =>
  apiRequest<unknown>(`/approvals/${id}/${action}`, { method: "POST", body: { reason, comment: null } });
