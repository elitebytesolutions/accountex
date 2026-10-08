import { E, POST_RULES, type Phase } from "./types";

// Super Admin portal (/admin/*): own login table and JWT, a single user, no tenant roles, so `perm` is empty.

export const admin: Phase[] = [
  {
    no: 36, title: "Plans & catalogue", portal: "admin", kind: "MASTER", status: "done",
    objective: "What tenants can buy: plans with features/limits, modules, add-ons and coupons.",
    entities: [
      E("subscription-plans", "Subscription Plans", ["Platform.SubscriptionPlans", "Platform.SubscriptionPlanFeatures", "Platform.SubscriptionPlanLimits"], {
        tpl: ["admin/plans"], api: "admin/plans", perm: [],
        x: ["POST /admin/plans/:id/publish|archive", "PUT /admin/plans/:id/features|limits"],
        rules: ["Published plan prices are history: changes create a new version for new subscriptions"],
      }),
      E("platform-modules", "Platform Modules", ["Platform.PlatformModules", "Platform.PlatformModulePlans"], {
        tpl: ["admin/entitlements"], api: "admin/modules", perm: [],
        rules: ["Module keys = ModuleKey lookup codes"], deps: ["subscription-plans"],
      }),
      E("addons", "Add-ons", ["Platform.Addons", "Platform.AddonPlans"], {
        tpl: ["admin/plans"], api: "admin/addons", perm: [], deps: ["subscription-plans"],
      }),
      E("coupons", "Coupons", ["Platform.SubscriptionCoupons", "Platform.SubscriptionCouponPlans", "Platform.SubscriptionCouponRedemptions"], {
        tpl: ["admin/partners"], api: "admin/coupons", perm: [],
        x: ["GET /admin/coupons/:id/redemptions"], rules: ["Redemptions are append-only; limits enforced at redemption"], deps: ["subscription-plans"],
      }),
    ],
  },
  {
    no: 37, title: "Seed templates & tax master", portal: "admin", kind: "MASTER", status: "done",
    objective: "Data copied into a new tenant at onboarding, and the national tax master.",
    entities: [
      E("coa-templates", "COA Templates", ["Platform.ChartOfAccountsTemplates", "Platform.ChartOfAccountsTemplateAccounts"], {
        tpl: ["admin/templates"], api: "admin/coa-templates", perm: [],
        x: ["POST /admin/coa-templates/:id/import (CSV)", "POST /admin/coa-templates/:id/publish"],
      }),
      E("seed-templates", "Tenant Seed Templates", ["Platform.TemplateLeaveTypes", "Platform.TemplateSalaryComponents", "Platform.TemplateTaxCodes", "Platform.SystemRoleGrants"], {
        tpl: ["admin/templates"], api: "admin/seed-templates", perm: [],
      }),
      E("tax-master", "Tax Master", ["Platform.TaxMasterAuthorities", "Platform.TaxMasterSalesTaxRates", "Platform.TaxMasterWithholdingRates", "Platform.TaxMasterSalarySlabs"], {
        tpl: ["admin/tax-master"], api: "admin/tax-master", perm: [],
        x: ["POST /admin/tax-master/publish", "POST /api/tax/codes/import-master: tenants import tax codes from the published master (moved from Phase 4)"],
        rules: ["Effective-dated; published rates never edited, only superseded"],
      }),
      E("communication-templates", "Communication Templates", ["Platform.CommunicationTemplates"], {
        tpl: ["admin/comms"], api: "admin/communication-templates", perm: [],
        x: ["POST /admin/communication-templates/:id/preview|test-send"],
      }),
    ],
  },
  {
    no: 38, title: "Platform configuration", portal: "admin", kind: "MASTER", status: "done",
    objective: "Dunning policy, tenant segments, resellers and platform security/backups.",
    entities: [
      E("dunning-policies", "Dunning Policies", ["Platform.DunningPolicies"], {
        tpl: ["admin/dunning"], api: "admin/dunning-policies", perm: [],
        rules: ["Only one active policy (dunningPolicyOneActive)"],
      }),
      E("tenant-segments", "Tenant Segments", ["Platform.TenantSegments", "Platform.TenantSegmentRules", "Platform.SegmentTenants"], {
        tpl: ["admin/segments"], api: "admin/segments", perm: [],
        x: ["POST /admin/segments/:id/evaluate (refresh membership)"],
      }),
      E("resellers", "Resellers", ["Platform.Resellers"], {
        tpl: ["admin/partners"], api: "admin/resellers", perm: [],
      }),
      E("platform-security", "Platform Security & Backups", ["Platform.PlatformSecuritySettings", "Platform.PlatformAllowedIps", "Platform.PlatformApiKeys", "Platform.WebhookEndpoints", "Platform.WebhookDeliveries", "Platform.BackupRuns"], {
        tpl: ["admin/security", "admin/integrations", "admin/system"], api: "admin/security", perm: [],
        x: ["POST /admin/api-keys (secret shown once)", "POST /admin/webhooks/:id/test", "POST /admin/backups/run"],
        rules: ["Secrets hashed/encrypted; never returned"],
      }),
    ],
  },
  {
    no: 39, title: "Feature flags & alerting", portal: "admin", kind: "MASTER", status: "done",
    objective: "Feature flags with targeting, maintenance windows and alert rules.",
    entities: [
      E("feature-flags", "Feature Flags", ["Platform.FeatureFlags", "Platform.FlagEnvironments", "Platform.FlagVariations", "Platform.FlagRules", "Platform.FlagTargets", "Platform.FlagPrerequisites", "Platform.FlagDefaultRules", "Platform.FlagSdkKeys"], {
        tpl: ["admin/features", "admin/features/view"], api: "admin/flags", perm: [],
        x: ["POST /admin/flags/:id/toggle?env", "GET /admin/flags/:id/evaluate?tenant", "POST /admin/flags/sdk-keys"],
        rules: ["Prerequisites without cycles; every change written to FlagAuditLogs"],
      }),
      E("maintenance-windows", "Maintenance Windows", ["Platform.MaintenanceWindows"], {
        tpl: ["admin/status"], api: "admin/maintenance-windows", perm: [],
      }),
      E("usage-alert-rules", "Usage Alert Rules", ["Platform.UsageAlertRules"], {
        tpl: ["admin/usage"], api: "admin/usage-alert-rules", perm: [],
      }),
      E("audit-alert-rules", "Audit Alert Rules", ["Platform.AuditAlertRules"], {
        tpl: ["admin/audit"], api: "admin/audit-alert-rules", perm: [],
      }),
    ],
  },
  {
    no: 40, title: "Tenant lifecycle", portal: "admin", kind: "TRANSACTIONAL", status: "done",
    objective: "Onboard and manage tenants, their subscriptions and usage, and audited impersonation.",
    reports: ["Platform Overview (admin/dashboard)", "SaaS Analytics"],
    entities: [
      E("tenants", "Tenants", ["Platform.Tenants", "Platform.TenantContacts", "Platform.TenantModules", "Platform.TenantAddons", "Platform.TenantNotes"], {
        tpl: ["admin/tenants", "admin/tenants/new", "admin/tenants/view"], api: "admin/tenants", perm: [],
        x: ["POST /admin/tenants (onboard: calls Platform.provisionTenant → tenant + system roles + default user with every role, then seed templates; one transaction; form asks the default user's name, email, password)", "POST /admin/tenants/:id/suspend|reactivate|churn", "PUT /admin/tenants/:id/modules"],
        rules: ["Code and subdomain unique", "Status follows the TenantStatus lookup lifecycle", "Onboarding is idempotent and fully audited"],
        deps: ["subscription-plans", "coa-templates", "seed-templates"],
      }),
      E("subscriptions", "Subscriptions", ["Platform.Subscriptions", "Platform.SubscriptionEvents"], {
        tpl: ["admin/subscriptions"], api: "admin/subscriptions", perm: [],
        x: ["POST /admin/subscriptions/:id/change-plan|cancel|renew", "Scheduled renewal job (actor = SERVICE)"],
        rules: ["Every change is a SubscriptionEvents row; entitlement changes logged"], deps: ["tenants", "coupons"],
      }),
      E("usage", "Usage", ["Platform.UsageMeters", "Platform.UsageSnapshots", "Platform.UsageLimitOverrides"], {
        tpl: ["admin/usage"], api: "admin/usage", perm: [],
        x: ["GET /admin/usage?tenant (Platform.getCurrentUsage)", "POST /admin/usage/overrides"], deps: ["tenants", "usage-alert-rules"],
      }),
      E("impersonation", "Impersonation Sessions", ["Platform.ImpersonationSessions"], {
        tpl: ["admin/tenants/view"], api: "admin/impersonation", perm: [],
        x: ["POST /admin/tenants/:id/impersonate (time-boxed, reason required)", "POST /admin/impersonation/:id/end"],
        rules: ["Every action during impersonation audited with both identities", "Tenant can see impersonation history"], deps: ["tenants"],
      }),
    ],
  },
  {
    no: 41, title: "Platform billing", portal: "admin", kind: "TRANSACTIONAL", status: "done",
    objective: "Platform invoices and payments, dunning, and reseller payouts.",
    entities: [
      E("platform-invoices", "Platform Invoices", ["Platform.PlatformInvoices", "Platform.PlatformInvoiceLines"], {
        tpl: ["admin/invoices"], api: "admin/invoices", perm: [],
        x: ["POST /admin/invoices/generate?period", "POST /admin/invoices/:id/issue|void", "GET /admin/invoices/:id/pdf"],
        rules: [...POST_RULES], deps: ["subscriptions"],
      }),
      E("platform-payments", "Platform Payments", ["Platform.PlatformPayments"], {
        tpl: ["admin/invoices"], api: "admin/payments", perm: [],
        x: ["POST /admin/payments (record/allocate)", "POST /admin/payments/:id/refund"], deps: ["platform-invoices"],
      }),
      E("dunning-cases", "Dunning Cases", ["Platform.DunningCases", "Platform.DunningAttempts"], {
        tpl: ["admin/dunning"], api: "admin/dunning-cases", perm: [],
        x: ["POST /admin/dunning-cases/:id/attempt|resolve|escalate", "Scheduled dunning job (actor = SERVICE)"], deps: ["platform-invoices", "dunning-policies"],
      }),
      E("reseller-payouts", "Reseller Payouts", ["Platform.ResellerPayouts", "Platform.ResellerTenants"], {
        tpl: ["admin/partners"], api: "admin/reseller-payouts", perm: [],
        x: ["POST /admin/reseller-payouts/calculate?period (Platform.getResellerCommissions)", "POST /admin/reseller-payouts/:id/approve|pay"], deps: ["resellers", "platform-payments"],
      }),
    ],
  },
  {
    no: 42, title: "Growth & support", portal: "admin", kind: "TRANSACTIONAL", status: "done",
    objective: "Leads, support tickets, announcements/broadcasts and the communication log.",
    entities: [
      E("leads", "Leads", ["Platform.PlatformLeads", "Platform.PlatformLeadActivities"], {
        tpl: ["admin/leads"], api: "admin/leads", perm: [],
        x: ["POST /admin/leads/:id/move-stage", "POST /admin/leads/:id/convert (starts tenant onboarding)"], deps: ["tenants"],
      }),
      E("support-tickets", "Support Tickets", ["Platform.SupportTickets", "Platform.SupportTicketMessages"], {
        tpl: ["admin/support"], api: "admin/support-tickets", perm: [],
        x: ["POST /admin/support-tickets/:id/messages", "POST /admin/support-tickets/:id/assign|resolve|reopen"], deps: ["tenants"],
      }),
      E("announcements-admin", "Announcements & Broadcasts", ["Platform.Announcements", "Platform.AnnouncementTargets", "Platform.TenantBroadcasts", "Platform.AnnouncementReceipts"], {
        tpl: ["admin/announcements"], api: "admin/announcements", perm: [],
        x: ["POST /admin/announcements/:id/publish|schedule", "POST /admin/broadcasts"], deps: ["tenant-segments"],
      }),
      E("communication-logs", "Communication Logs", ["Platform.CommunicationLogs"], {
        tpl: ["admin/comms"], api: "admin/communication-logs", perm: [],
        x: ["GET /admin/communication-logs?tenant&channel (read-only)", "POST /admin/communication-logs/:id/resend"],
        rules: ["Append-only"], deps: ["communication-templates"],
      }),
    ],
  },
  {
    no: 43, title: "Platform operations", portal: "admin", kind: "TRANSACTIONAL", status: "done",
    objective: "Incidents and status, flag change requests, privacy requests and the entitlement change log.",
    reports: ["System Health", "Platform Audit Log"],
    entities: [
      E("service-incidents", "Service Incidents", ["Platform.ServiceIncidents", "Platform.ServiceIncidentUpdates"], {
        tpl: ["admin/status"], api: "admin/incidents", perm: [],
        x: ["POST /admin/incidents/:id/updates", "POST /admin/incidents/:id/resolve"],
      }),
      E("flag-change-requests", "Flag Change Requests", ["Platform.FlagChangeRequests", "Platform.FlagChangeRequestApprovers", "Platform.FlagChangeRequestComments", "Platform.FlagScheduledChanges"], {
        tpl: ["admin/change-requests"], api: "admin/flag-change-requests", perm: [],
        x: ["POST /admin/flag-change-requests/:id/approve|reject|apply|schedule"],
        rules: ["Applied changes write FlagAuditLogs"], deps: ["feature-flags"],
      }),
      E("privacy-requests", "Privacy Requests", ["Platform.PrivacyRequests"], {
        tpl: ["admin/security"], api: "admin/privacy-requests", perm: [],
        x: ["POST /admin/privacy-requests/:id/approve|fulfil (export/erase per policy)"],
        rules: ["Erasure respects legal retention of financial records"], deps: ["tenants"],
      }),
      E("entitlement-log", "Entitlement Change Log", ["Platform.EntitlementChangeLogs"], {
        tpl: ["admin/entitlements"], api: "admin/entitlement-changes", perm: [],
        x: ["GET /admin/entitlement-changes?tenant (read-only)"], rules: ["Append-only"], deps: ["subscriptions"],
      }),
    ],
  },
];
