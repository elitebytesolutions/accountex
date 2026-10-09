import type { MyPolicies, PolicyAcknowledgement, PolicyAcknowledgementReport, TeamPolicyStatus } from "@/shared/self-service/policy-ack";
import { apiRequest } from "@/lib/api/client";

/** Browser clients for Phase 34 policy acknowledgements. */
export const myPolicies = () => apiRequest<MyPolicies>("/me/policies");
export const acknowledgePolicy = (id: string, body: { readToEnd: boolean; signatureText: string }) =>
  apiRequest<PolicyAcknowledgement>(`/me/policies/${id}/acknowledge`, { method: "POST", body });
export const teamPolicyStatus = () => apiRequest<TeamPolicyStatus>("/me/team/policy-status");
export const policyAcknowledgements = (id: string) => apiRequest<PolicyAcknowledgementReport>(`/hr/policies/${id}/acknowledgements`);
