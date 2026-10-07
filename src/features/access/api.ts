import type {
  Delegation,
  DelegationSaveFields,
  DocumentTemplate,
  DocumentTemplateSaveFields,
  PermissionModule,
  ResetPassword,
  Role,
  RoleCreateFields,
  RoleDetail,
  RoleLimits,
  SodRule,
  SodRuleCreateFields,
  UserActivity,
  UserCreateFields,
  UserDetail,
  UserListItem,
  UserSession,
  UserSummary,
  Workflow,
  WorkflowDryRunResult,
  WorkflowSaveFields,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Browser clients for Settings › Users, Roles & Permissions, Approval Workflows and Document Templates. */

// Users
export const listUsers = () => apiRequest<UserListItem[]>("/settings/users");
export const getUserSummary = () => apiRequest<UserSummary>("/settings/users/summary");
export const getUser = (id: string) => apiRequest<UserDetail>(`/settings/users/${id}`);
export const createUser = (body: UserCreateFields) => apiRequest<UserDetail>("/settings/users", { method: "POST", body });
export const updateUser = (id: string, body: Partial<UserCreateFields> & { rowVersion: number }) =>
  apiRequest<UserDetail>(`/settings/users/${id}`, { method: "PATCH", body });
export const userAction = (id: string, action: "suspend" | "reactivate", rowVersion: number) =>
  apiRequest<UserDetail>(`/settings/users/${id}/${action}`, { method: "POST", body: { rowVersion } });
export const removeUser = (id: string, rowVersion: number) => apiRequest<void>(`/settings/users/${id}/remove`, { method: "POST", body: { rowVersion } });
export const resetUserPassword = (id: string, body: ResetPassword) =>
  apiRequest<UserDetail>(`/settings/users/${id}/reset-password`, { method: "POST", body });
export const listUserSessions = (id: string) => apiRequest<UserSession[]>(`/settings/users/${id}/sessions`);
export const revokeUserSessions = (id: string, sessionId?: string) =>
  apiRequest<void>(`/settings/users/${id}/sessions${sessionId ? `/${sessionId}` : ""}`, { method: "DELETE" });
export const listUserActivity = (id: string) => apiRequest<UserActivity[]>(`/settings/users/${id}/activity`);

// Roles & permissions
export const getPermissionCatalogue = () => apiRequest<PermissionModule[]>("/settings/permissions");
export const listRoles = () => apiRequest<Role[]>("/settings/roles");
export const getRole = (id: string) => apiRequest<RoleDetail>(`/settings/roles/${id}`);
export const createRole = (body: RoleCreateFields) => apiRequest<RoleDetail>("/settings/roles", { method: "POST", body });
export const updateRole = (
  id: string,
  body: { name?: string; description?: string | null; icon?: string | null; tone?: string | null; branchRestricted?: boolean; permissions?: string[]; limits?: RoleLimits; rowVersion: number },
) => apiRequest<RoleDetail>(`/settings/roles/${id}`, { method: "PATCH", body });
export const deleteRole = (id: string, rowVersion: number) => apiRequest<void>(`/settings/roles/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

// Approval workflows & delegations
export const listWorkflows = () => apiRequest<Workflow[]>("/settings/approval-workflows");
export const createWorkflow = (body: WorkflowSaveFields) => apiRequest<Workflow>("/settings/approval-workflows", { method: "POST", body });
export const updateWorkflow = (id: string, body: WorkflowSaveFields & { rowVersion: number }) =>
  apiRequest<Workflow>(`/settings/approval-workflows/${id}`, { method: "PATCH", body });
export const workflowAction = (id: string, action: "publish" | "deactivate", rowVersion: number) =>
  apiRequest<Workflow>(`/settings/approval-workflows/${id}/${action}`, { method: "POST", body: { rowVersion } });
export const deleteWorkflow = (id: string, rowVersion: number) =>
  apiRequest<void>(`/settings/approval-workflows/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });
export const testWorkflow = (id: string, values: Record<string, number | string>) =>
  apiRequest<WorkflowDryRunResult>(`/settings/approval-workflows/${id}/test`, { method: "POST", body: { values } });
export const listApprovers = () => apiRequest<{ roles: { id: string; name: string }[]; users: { id: string; name: string }[] }>("/settings/approval-workflows/approvers");
export const listDelegations = () => apiRequest<Delegation[]>("/settings/approval-delegations");
export const createDelegation = (body: DelegationSaveFields) => apiRequest<Delegation>("/settings/approval-delegations", { method: "POST", body });
export const updateDelegation = (id: string, body: DelegationSaveFields & { rowVersion: number }) =>
  apiRequest<Delegation>(`/settings/approval-delegations/${id}`, { method: "PATCH", body });
export const deleteDelegation = (id: string, rowVersion: number) =>
  apiRequest<void>(`/settings/approval-delegations/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

// Document templates
export const listTemplates = () => apiRequest<DocumentTemplate[]>("/settings/document-templates");
export const createTemplate = (body: DocumentTemplateSaveFields) => apiRequest<DocumentTemplate>("/settings/document-templates", { method: "POST", body });
export const updateTemplate = (id: string, body: DocumentTemplateSaveFields & { rowVersion: number }) =>
  apiRequest<DocumentTemplate>(`/settings/document-templates/${id}`, { method: "PATCH", body });
export const templateAction = (id: string, action: "set-default" | "activate" | "deactivate", rowVersion: number) =>
  apiRequest<DocumentTemplate>(`/settings/document-templates/${id}/${action}`, { method: "POST", body: { rowVersion } });
export const deleteTemplate = (id: string, rowVersion: number) =>
  apiRequest<void>(`/settings/document-templates/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

// Segregation-of-duties rules (Phase 5)
export const listSodRules = () => apiRequest<SodRule[]>("/settings/sod-rules");
export const createSodRule = (body: SodRuleCreateFields) => apiRequest<SodRule>("/settings/sod-rules", { method: "POST", body });
export const updateSodRule = (id: string, body: Partial<SodRuleCreateFields> & { rowVersion: number }) => apiRequest<SodRule>(`/settings/sod-rules/${id}`, { method: "PATCH", body });
export const setSodRuleActive = (id: string, on: boolean, rowVersion: number) =>
  apiRequest<SodRule>(`/settings/sod-rules/${id}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
export const deleteSodRule = (id: string, rowVersion: number) => apiRequest<void>(`/settings/sod-rules/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });
