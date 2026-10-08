/**
 * Platform tables whose history GET /api/admin/history/:table/:id serves (Phase 36 foundation), with the child tables
 * whose rows are shown in the same History tab, as "<ChildTable>.<parentFkColumn>". Each admin phase adds its own
 * entities here (add only; one line per table).
 */
export const ADMIN_HISTORY_TABLES: Record<string, { children?: string[] }> = {
  // Phase 36: plans & catalogue
  SubscriptionPlans: { children: ['SubscriptionPlanFeatures.planId', 'SubscriptionPlanLimits.planId'] },
  PlatformModules: { children: ['PlatformModulePlans.platformModuleId'] },
  Addons: { children: ['AddonPlans.addonId'] },
  SubscriptionCoupons: { children: ['SubscriptionCouponPlans.couponId'] },
  // Phase 39: feature flags & alerting
  FeatureFlags: { children: ['FlagEnvironments.flagId', 'FlagVariations.flagId', 'FlagRules.flagId', 'FlagTargets.flagId', 'FlagPrerequisites.flagId', 'FlagDefaultRules.flagId'] },
  FlagSdkKeys: {},
  MaintenanceWindows: {},
  UsageAlertRules: {},
  AuditAlertRules: {},
  // Phase 38: platform configuration (PlatformSecuritySettings has a smallint id = 1, so it is not served here)
  DunningPolicies: {},
  TenantSegments: { children: ['TenantSegmentRules.segmentId', 'SegmentTenants.segmentId'] },
  Resellers: {},
  PlatformAllowedIps: {},
  PlatformApiKeys: {},
  WebhookEndpoints: { children: ['WebhookDeliveries.webhookEndpointId'] },
  BackupRuns: {},
  // Phase 37: seed templates & tax master (SystemRoleGrants has no id: its history is served by /api/admin/seed/role-grants)
  ChartOfAccountsTemplates: { children: ['ChartOfAccountsTemplateAccounts.templateId'] },
  TemplateLeaveTypes: {},
  TemplateSalaryComponents: {},
  TemplateTaxCodes: {},
  TaxMasterAuthorities: {},
  TaxMasterSalesTaxRates: {},
  TaxMasterWithholdingRates: {},
  TaxMasterSalarySlabs: {},
  CommunicationTemplates: {},
  // Phase 40: tenant lifecycle
  Tenants: { children: ['TenantContacts.tenantId', 'TenantModules.tenantId', 'TenantNotes.tenantId', 'TenantAddons.tenantId'] },
  Subscriptions: { children: ['SubscriptionEvents.subscriptionId'] },
  UsageMeters: {},
  UsageLimitOverrides: {},
  ImpersonationSessions: {},
  // Phase 42: growth & support
  PlatformLeads: { children: ['PlatformLeadActivities.leadId'] },
  SupportTickets: { children: ['SupportTicketMessages.ticketId'] },
  Announcements: { children: ['AnnouncementTargets.announcementId'] },
  TenantBroadcasts: { children: ['CommunicationLogs.commBroadcastId'] },
  CommunicationLogs: {},
  AnnouncementReceipts: {},
  // Phase 41: platform billing
  PlatformInvoices: { children: ['PlatformInvoiceLines.platformInvoiceId', 'PlatformPayments.platformInvoiceId'] },
  DunningCases: { children: ['DunningAttempts.dunningCaseId'] },
  ResellerPayouts: {},
  ResellerTenants: {},
  // Phase 43: platform operations
  ServiceIncidents: { children: ['ServiceIncidentUpdates.incidentId'] },
  FlagChangeRequests: { children: ['FlagChangeRequestApprovers.changeRequestId', 'FlagChangeRequestComments.changeRequestId'] },
  FlagScheduledChanges: {},
  PrivacyRequests: {},
  EntitlementChangeLogs: {},
};
