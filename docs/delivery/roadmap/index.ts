import { admin } from "./admin";
import { masters } from "./masters";
import { transactions } from "./transactions";
import type { Phase } from "./types";

export * from "./types";

/** Phase 0: infrastructure every later phase relies on (approved exception: no business entities). */
export const foundation: Phase = {
  no: 0, title: "Foundation", portal: "foundation", kind: "FOUNDATION", status: "done",
  objective: "User-attributed row history for every insert/update/delete from the application, error catalogue and log, shared CRUD contracts, permission guard and the template-faithful workspace shell.",
  entities: [],
};

export const FOUNDATION_TASKS = [
  "Who changed it: PrismaService.withContext({ userId, tenantId, correlationId, clientIp, userAgent, sessionId }) runs every insert/update/delete from the application in one transaction after setting those values as app.* session settings. The user always comes from the verified session (JWT), never from the request body. Seed/maintenance scripts set app.actorLabel and are logged as 'system: <script>'.",
  "Row history (prisma/sql/005-row-history.sql): Company.AuditTrailEntries gains rowData (the complete row after the change; the old row for DELETE), rowVersion, actorName, correlationId, with actorEmail/userAgent/sessionId now filled. Company.triggerAudit (same name, so all existing triggers pick it up) snapshots the user's name and email from Company.Users at the moment of the change, keeps field-level before/after in changes, and no longer skips rows without tenantId (tenantId becomes nullable). Platform.PlatformAuditLogs gets the same rowData/actor snapshot. Company.getRecordHistory(schema, table, recordId) returns every version newest-first (who, when, action, changed fields, full row). Audit rows are append-only.",
  "History in the app: GET …/:id/history on every entity and a History tab on each detail page; Settings › Audit Trail filters by user, table, record and date (indexes auditLogUserTimeIdx, auditLogRecordIdx).",
  "Error catalogue Platform.ErrorCodes (code, httpStatus, ErrorCategory lookup, module, userMessage, isLogged) and append-only Platform.ErrorLogs (user, correlationId, status, code, path, SQLSTATE, redacted details); the exception filter maps SQLSTATE and trigger HINT codes; every error response carries correlationId.",
  "Audit coverage: every table an entity uses must have Company.triggerAudit before its phase is done (ROADMAP.md lists the missing ones per entity); attach it to Lookups in Phase 0.",
  "Shared contracts: list query (search, filters, page, pageSize, sort) and { items, total } response schemas; rowVersion optimistic concurrency (409 on stale); @RequirePermission API guard reading Company.Permissions codes.",
  "Workspace shell in Tailwind, faithful to template/src: 20-shell-open.html, 10-styles.css, 15-polish.css, 95-ui.js; sidebar, topbar (search, create, notifications, user menu), page head, data table, drawer, form fields, badges, tabs, toasts, empty/loading/error states; 404 / unauthorised / states screens (60-settings-ess.html).",
  "Fix: server-side session calls over loopback must not share one rate-limit bucket.",
  "Tenant-first provisioning (rev 2, prisma/sql/006-tenant-provisioning.sql): the tenant is the main record and no user exists without one. Platform.provisionTenant creates tenant → system roles with default grants (Platform.SystemRoleGrants, synced from prisma/catalog.ts) → the default user (Tenants.defaultUserId) holding every role. Locked by triggers: the default user keeps all roles (new roles are auto-assigned), stays ACTIVE, cannot be deleted; error TENANT_DEFAULT_USER_LOCKED (409).",
];

export const phases: Phase[] = [foundation, ...masters, ...transactions, ...admin];

/** Tables deliberately not delivered as entities, with the reason. Every other table belongs to an entity. */
export const NOT_ENTITIES: Record<string, string> = {
  "Company.AuditTrailEntries": "audit log written by DB triggers (read through each entity's History tab and the Audit Trail screen)",
  "Company.AuditTrailSeals": "audit log integrity seals (system)",
  "Platform.PlatformAuditLogs": "platform audit log written by DB triggers",
  "Platform.FlagAuditLogs": "written by feature-flag changes",
  "Inventory.StockMovements": "stock ledger produced by posting documents",
  "Inventory.StockBalances": "stock balance maintained by posting",
  "Inventory.StockReservations": "maintained by sales order approval",
  "Company.CalculatorSettings": "UI utility (topbar calculator), per user",
  "Company.CalculatorTapeLines": "UI utility (topbar calculator), per user",
  "Platform.PlatformDocumentCounters": "platform numbering counters (system)",
  "Platform.JobQueueSamples": "system health telemetry",
  "Platform.FlagDailyEvaluations": "flag evaluation telemetry",
  "Platform.FlagCodeReferences": "flag code-reference scan results (system)",
  "Platform.PlatformAdmin": "Super Admin login table: already implemented (single row)",
  "Platform.ErrorCodes": "error catalogue: built in Phase 0 (foundation); each phase adds its codes via SQL",
  "Platform.ErrorLogs": "append-only error log written by the API exception filter (Phase 0)",
  "Platform.PlatformStaff": "not used: the Super Admin portal has exactly one user",
  "Platform.PlatformStaffRoles": "not used: no platform staff roles",
  "Platform.PlatformStaffRolePermissions": "not used: no platform staff roles",
  "Platform.PlatformStaffSessions": "not used: no platform staff",
  "Platform.PlatformStaffTenantScopes": "not used: no platform staff",
};
