# Finsoft database naming (Full edition)

Every object follows one convention, so a table can be found from the screen that shows it.

| Object | Style | Example |
|---|---|---|
| Schema (module) | PascalCase full name | `"Sales"`, `"FixedAssets"`, `"BankCash"` |
| Table | PascalCase, plural, named after its screen | `"Sales"."SalesInvoices"`, `"Company"."UserRoles"` |
| Column | camelCase | `"customerId"`, `"docNo"`, `status` |
| View (report read model) | camelCase `get<Report>` | `"Accounting"."getTrialBalance"` |
| Save function (insert + update) | `<entity>AddUpdate(jsonb)` | `"Sales"."salesInvoiceAddUpdate"` |
| Read function | `get<Entity>Info(uuid)` | `"Sales"."getSalesInvoiceInfo"` |
| Action function (screen button) | `<entity><Action>` | `"Sales"."salesInvoicePost"` |
| Trigger function | `trigger<What>` | `"Inventory"."triggerStockLedgerApply"` |
| Index / constraint / trigger | camelCase | `"salesInvoicesDocNoKey"` |
| Enumeration value | a row in `"Lookups"."Lookups"` — never a CHECK list | type `SalesInvoiceStatus`, code `POSTED`, label "Posted" |

No name contains an underscore. Names with capitals are always written in double quotes in SQL:

```sql
SELECT i."docNo", c."displayName", i.status
  FROM "Sales"."SalesInvoices" i
  JOIN "Sales"."Customers" c ON c.id = i."customerId"
 WHERE i."tenantId" = "Company"."getCurrentTenantId"();
```

Enumeration codes (`POSTED`, `PARTIALLY_PAID`) are **data**, not names: they are the values stored in the
columns and compared by the posting logic; each has a readable label and badge tone in `"Lookups"."Lookups"`.

Full old → new map (every schema, table, column, view and function): [`naming/rename-map.csv`](naming/rename-map.csv).

## Platform

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `addon` | **Addons** | `addonAddUpdate` · `getAddonInfo` | MASTER | billingUnit→BillingUnit |
| `addon_plan` | **AddonPlans** | via `Addons` (plans) | JOIN | availability→Availability |
| `announcement` | **Announcements** | `announcementAddUpdate` · `getAnnouncementInfo` | MASTER | announcementType→AnnouncementType, severity→AnnouncementSeverity, audience→AnnouncementAudience, status→AnnouncementStatus |
| `announcement_target` | **AnnouncementTargets** | via `Announcements` (targets) | CHILD | moduleKey→ModuleKey |
| `api_key` | **PlatformApiKeys** | `platformApiKeyAddUpdate` · `getPlatformApiKeyInfo` | MASTER | environment→PlatformApiKeyEnvironment, keyPrefix→KeyPrefix, status→PlatformApiKeyStatus |
| `audit_alert_rule` | **AuditAlertRules** | `auditAlertRuleAddUpdate` · `getAuditAlertRuleInfo` | MASTER | resultFilter→ResultFilter |
| `audit_log` | **PlatformAuditLogs** | — | LOG | result→PlatformAuditLogResult, category→PlatformAuditLogCategory |
| `backup_run` | **BackupRuns** | — | LOG | backupType→BackupType, exportFormat→ExportFormat, verification→Verification, status→BackupRunStatus |
| `coa_template` | **ChartOfAccountsTemplates** | `chartOfAccountsTemplateAddUpdate` · `getChartOfAccountsTemplateInfo` | MASTER | status→ChartOfAccountsTemplateStatus |
| `coa_template_account` | **ChartOfAccountsTemplateAccounts** | via `ChartOfAccountsTemplates` (accounts) | CHILD | nature→Nature |
| `comm_broadcast` | **TenantBroadcasts** | `tenantBroadcastAddUpdate` · `getTenantBroadcastInfo` | MASTER | audience→TenantBroadcastAudience, languageMode→LanguageMode, status→TenantBroadcastStatus |
| `comm_log` | **CommunicationLogs** | — | LOG | channel→CommunicationLogChannel, language→EnUrLanguage, status→CommunicationLogStatus, relatedDocType→RelatedDocType |
| `comm_template` | **CommunicationTemplates** | `communicationTemplateAddUpdate` · `getCommunicationTemplateInfo` | MASTER |  |
| `coupon` | **SubscriptionCoupons** | `subscriptionCouponAddUpdate` · `getSubscriptionCouponInfo` | MASTER | discountType→DiscountType, duration→SubscriptionCouponDuration, status→SubscriptionCouponStatus |
| `coupon_plan` | **SubscriptionCouponPlans** | via `SubscriptionCoupons` (plans) | JOIN |  |
| `coupon_redemption` | **SubscriptionCouponRedemptions** | — | LEDGER | status→SubscriptionCouponRedemptionStatus |
| `cr_approver` | **FlagChangeRequestApprovers** | via `FlagChangeRequests` (approvers) | CHILD | decision→Decision |
| `cr_comment` | **FlagChangeRequestComments** | via `FlagChangeRequests` (comments) | CHILD |  |
| `doc_counter` | **PlatformDocumentCounters** | — | HELPER | docType→PlatformDocumentCounterDocType |
| `dunning_attempt` | **DunningAttempts** | via `DunningCases` (attempts) | CHILD | method→DunningAttemptMethod, status→DunningAttemptStatus, triggeredBy→TriggeredBy |
| `dunning_case` | **DunningCases** | `dunningCaseAddUpdate` · `getDunningCaseInfo` | MASTER | stage→DunningCaseStage, paymentMethod→DunningCasePaymentMethod, nextRetryMethod→NextRetryMethod, promiseSource→PromiseSource |
| `dunning_policy` | **DunningPolicies** | `dunningPolicyAddUpdate` · `getDunningPolicyInfo` | MASTER |  |
| `entitlement_change_log` | **EntitlementChangeLogs** | — | LOG | changeKind→ChangeKind, impactTone→ImpactTone |
| `feature_flag` | **FeatureFlags** | `featureFlagAddUpdate` · `getFeatureFlagInfo` | MASTER | flagType→FlagType, secondaryType→SecondaryType, category→FeatureFlagCategory, stage→FeatureFlagStage, variationKind→VariationKind |
| `flag_audit` | **FlagAuditLogs** | — | LOG | environment→FlagAuditLogEnvironment, eventKind→EventKind |
| `flag_change_request` | **FlagChangeRequests** | `flagChangeRequestAddUpdate` · `getFlagChangeRequestInfo` | DOCUMENT | environment→DevStagingProductionEnvironment, source→FlagChangeRequestSource, status→LeaveRequestStatus |
| `flag_code_ref` | **FlagCodeReferences** | — | LOG |  |
| `flag_environment` | **FlagEnvironments** | via `FeatureFlags` (environments) | CHILD | environment→DevStagingProductionEnvironment |
| `flag_eval_daily` | **FlagDailyEvaluations** | — | LOG | environment→DevStagingProductionEnvironment |
| `flag_prerequisite` | **FlagPrerequisites** | via `FeatureFlags` (prerequisites) | CHILD |  |
| `flag_rule` | **FlagRules** | — | CHILD | attribute→FlagRuleAttribute, operator→FlagRuleOperator |
| `flag_schedule_step` | **FlagScheduledChanges** | via `FeatureFlags` (scheduledChanges) | CHILD | environment→DevStagingProductionEnvironment, status→FlagScheduledChangeStatus |
| `flag_target` | **FlagTargets** | — | CHILD |  |
| `flag_targeting` | **FlagDefaultRules** | — | CHILD | defaultRule→DefaultRule, bucketBy→BucketBy |
| `flag_variation` | **FlagVariations** | via `FeatureFlags` (variations) | CHILD |  |
| `impersonation_session` | **ImpersonationSessions** | — | LOG | endReason→EndReason |
| `incident` | **ServiceIncidents** | `serviceIncidentAddUpdate` · `getServiceIncidentInfo` | DOCUMENT | impact→Impact, stage→ServiceIncidentStage |
| `incident_update` | **ServiceIncidentUpdates** | via `ServiceIncidents` (updates) | CHILD | stage→ServiceIncidentStage |
| `ip_allowlist` | **PlatformAllowedIps** | `platformAllowedIpAddUpdate` · `getPlatformAllowedIpInfo` | MASTER |  |
| `job_queue_stat` | **JobQueueSamples** | — | LOG | status→JobQueueSampleStatus |
| `lead` | **PlatformLeads** | `platformLeadAddUpdate` · `getPlatformLeadInfo` | MASTER | source→PlatformLeadSource, stage→PlatformLeadStage |
| `lead_activity` | **PlatformLeadActivities** | — | LOG | activityType→PlatformLeadActivityType, fromStage→FromStage, toStage→ToStage |
| `maintenance_window` | **MaintenanceWindows** | `maintenanceWindowAddUpdate` · `getMaintenanceWindowInfo` | MASTER | status→MaintenanceWindowStatus |
| `partner` | **Resellers** | `resellerAddUpdate` · `getResellerInfo` | MASTER | tier→Tier, payoutMethod→PayoutMethod, status→ResellerStatus |
| `partner_payout` | **ResellerPayouts** | `resellerPayoutAddUpdate` · `getResellerPayoutInfo` | MASTER | status→ResellerPayoutStatus |
| `partner_tenant` | **ResellerTenants** | via `Resellers` (tenants) | JOIN |  |
| `plan` | **SubscriptionPlans** | `subscriptionPlanAddUpdate` · `getSubscriptionPlanInfo` | MASTER | status→SubscriptionPlanStatus, supportChannel→SupportChannel |
| `plan_feature` | **SubscriptionPlanFeatures** | via `SubscriptionPlans` (features) | JOIN | moduleKey→ModuleKey, inclusion→Inclusion |
| `plan_limit` | **SubscriptionPlanLimits** | via `SubscriptionPlans` (limits) | CHILD |  |
| `platform_invoice` | **PlatformInvoices** | `platformInvoiceAddUpdate` · `getPlatformInvoiceInfo` | DOCUMENT | invoiceKind→InvoiceKind, status→PlatformInvoiceStatus |
| `platform_invoice_line` | **PlatformInvoiceLines** | via `PlatformInvoices` (lines) | LINE | lineKind→LineKind |
| `platform_module` | **PlatformModules** | `platformModuleAddUpdate` · `getPlatformModuleInfo` | MASTER | kind→PlatformModuleKind, entGroup→EntGroup, moduleKey→ModuleKey |
| `platform_module_plan` | **PlatformModulePlans** | via `PlatformModules` (plans) | JOIN |  |
| `platform_payment` | **PlatformPayments** | — | LEDGER | paymentMethod→DunningCasePaymentMethod, status→PlatformPaymentStatus |
| `privacy_request` | **PrivacyRequests** | `privacyRequestAddUpdate` · `getPrivacyRequestInfo` | DOCUMENT | requestType→PrivacyRequestType, step→Step |
| `sdk_key` | **FlagSdkKeys** | `flagSdkKeyAddUpdate` · `getFlagSdkKeyInfo` | MASTER | environment→DevStagingProductionEnvironment, kind→FlagSdkKeyKind, status→FlagSdkKeyStatus |
| `security_setting` | **PlatformSecuritySettings** | `platformSecuritySettingAddUpdate` · `getPlatformSecuritySettingInfo` | CONFIG | ssoProvider→PlatformSecuritySettingSsoProvider, samlNameIdFormat→SamlNameIdFormat, mfaEnforcement→MfaEnforcement |
| `seed_leave_type` | **TemplateLeaveTypes** | `templateLeaveTypeAddUpdate` · `getTemplateLeaveTypeInfo` | MASTER | genderRestriction→GenderRestriction |
| `seed_salary_component` | **TemplateSalaryComponents** | `templateSalaryComponentAddUpdate` · `getTemplateSalaryComponentInfo` | MASTER | componentKind→TemplateSalaryComponentKind, calcMethod→TemplateSalaryComponentCalcMethod, statutoryCode→StatutoryCode |
| `seed_tax_code` | **TemplateTaxCodes** | `templateTaxCodeAddUpdate` · `getTemplateTaxCodeInfo` | MASTER | taxKind→TaxKind |
| `segment` | **TenantSegments** | `tenantSegmentAddUpdate` · `getTenantSegmentInfo` | MASTER | tone→TenantSegmentTone |
| `segment_rule` | **TenantSegmentRules** | via `TenantSegments` (rules) | CHILD | attribute→TenantSegmentRuleAttribute, operator→FlagRuleOperator |
| `segment_tenant` | **SegmentTenants** | via `TenantSegments` (tenants) | JOIN | membership→Membership |
| `staff_role` | **PlatformStaffRoles** | `platformStaffRoleAddUpdate` · `getPlatformStaffRoleInfo` | MASTER | code→PlatformStaffRoleCode |
| `staff_role_permission` | **PlatformStaffRolePermissions** | via `PlatformStaffRoles` (permissions) | CHILD | permissionKey→PermissionKey, permissionGroup→PermissionGroup |
| `staff_session` | **PlatformStaffSessions** | — | LOG | authMethod→PlatformStaffSessionAuthMethod, mfaMethod→PlatformStaffSessionMfaMethod |
| `staff_tenant_scope` | **PlatformStaffTenantScopes** | via `PlatformStaff` (tenantScopes) | JOIN |  |
| `staff_user` | **PlatformStaff** | `platformStaffMemberAddUpdate` · `getPlatformStaffMemberInfo` | MASTER | role→PlatformStaffMemberRole, mfaType→MfaType, tenantScope→TenantScope, status→PlatformStaffMemberStatus |
| `subscription` | **Subscriptions** | `subscriptionAddUpdate` · `getSubscriptionInfo` | MASTER | billingCycle→BillingCycle, paymentMethod→DunningCasePaymentMethod, status→SubscriptionStatus |
| `subscription_event` | **SubscriptionEvents** | — | LEDGER | eventType→SubscriptionEventType, movement→Movement |
| `support_ticket` | **SupportTickets** | `supportTicketAddUpdate` · `getSupportTicketInfo` | DOCUMENT | category→SupportTicketCategory, priority→SupportTicketPriority, status→SupportTicketStatus, channel→SupportTicketChannel |
| `tax_authority` | **TaxMasterAuthorities** | `taxMasterAuthorityAddUpdate` · `getTaxMasterAuthorityInfo` | MASTER | code→TaxMasterAuthorityCode, jurisdiction→Jurisdiction, levyScope→LevyScope, activeEnvironment→ActiveEnvironment, onFailure→OnFailure |
| `tax_master_salary_slab` | **TaxMasterSalarySlabs** | `taxMasterSalarySlabAddUpdate` · `getTaxMasterSalarySlabInfo` | MASTER |  |
| `tax_master_sales_tax` | **TaxMasterSalesTaxRates** | `taxMasterSalesTaxRateAddUpdate` · `getTaxMasterSalesTaxRateInfo` | MASTER | status→TaxMasterSalesTaxRateStatus |
| `tax_master_wht` | **TaxMasterWithholdingRates** | `taxMasterWithholdingRateAddUpdate` · `getTaxMasterWithholdingRateInfo` | MASTER | status→TaxMasterSalesTaxRateStatus |
| `tenant` | **Tenants** | `tenantAddUpdate` · `getTenantInfo` | MASTER | industry→TenantIndustry, province→Province, numberFormat→NumberFormat, dataResidency→DataResidency, defaultLanguage→DefaultLanguage, status→TenantStatus, churnReason→ChurnReason |
| `tenant_addon` | **TenantAddons** | — | JOIN | status→TenantAddonStatus |
| `tenant_contact` | **TenantContacts** | — | CHILD | contactRole→ContactRole, language→EnUrLanguage |
| `tenant_module` | **TenantModules** | — | CHILD | moduleKey→ModuleKey, source→TenantModuleSource |
| `tenant_note` | **TenantNotes** | — | CHILD |  |
| `ticket_message` | **SupportTicketMessages** | via `SupportTickets` (messages) | CHILD | authorKind→AuthorKind |
| `usage_limit_override` | **UsageLimitOverrides** | `usageLimitOverrideAddUpdate` · `getUsageLimitOverrideInfo` | MASTER | expiryMode→ExpiryMode, billOverage→BillOverage |
| `usage_meter` | **UsageMeters** | `usageMeterAddUpdate` · `getUsageMeterInfo` | MASTER | code→UsageMeterCode, resetPeriod→ResetPeriod |
| `usage_rule` | **UsageAlertRules** | `usageAlertRuleAddUpdate` · `getUsageAlertRuleInfo` | MASTER | action→UsageAlertRuleAction |
| `usage_snapshot` | **UsageSnapshots** | — | LOG |  |
| `webhook_delivery` | **WebhookDeliveries** | — | LOG | eventType→WebhookDeliveryEventType, status→WebhookDeliveryStatus |
| `webhook_endpoint` | **WebhookEndpoints** | `webhookEndpointAddUpdate` · `getWebhookEndpointInfo` | MASTER |  |

| View | New name |
|---|---|
| `v_admin_dashboard` | **getPlatformOverview** |
| `v_billing_kpi` | **getPlatformBillingByMonth** |
| `v_churn_reasons` | **getChurnReasons** |
| `v_cohort_retention` | **getCohortRetention** |
| `v_cr_kpi` | **getFlagChangeRequestKpis** |
| `v_dunning_kpi` | **getDunningKpis** |
| `v_dunning_queue` | **getCollectionsQueue** |
| `v_flag_summary` | **getFeatureFlagSummary** |
| `v_lead_pipeline` | **getPlatformLeadPipeline** |
| `v_mrr_by_plan` | **getMrrByPlan** |
| `v_mrr_monthly` | **getMrrByMonth** |
| `v_mrr_movement` | **getMrrMovement** |
| `v_partner_commission` | **getResellerCommissions** |
| `v_saas_kpi` | **getSaasKpis** |
| `v_service_health` | **getSystemHealth** |
| `v_status_component_daily` | **getStatusComponentHistory** |
| `v_subscription_kpi` | **getSubscriptionKpis** |
| `v_support_kpi` | **getSupportTicketKpis** |
| `v_tenant_attention` | **getTenantsNeedingAttention** |
| `v_tenant_overview` | **getAllTenants** |
| `v_trial_funnel` | **getTrialFunnel** |
| `v_usage_current` | **getCurrentUsage** |

## Company

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `account_role` | **PostingRoles** | — | HELPER | roleGroup→RoleGroup, normalBalance→NormalBalance |
| `activity_event` | **ActivityEvents** | — | LOG | kind→ActivityEventKind, module→ActivityEventModule, statusTone→StatusTone |
| `api_key` | **ApiKeys** | `apiKeyAddUpdate` · `getApiKeyInfo` | MASTER | keyPrefix→KeyPrefix |
| `app_user` | **Users** | `userAddUpdate` · `getUserInfo` | MASTER | status→UserStatus, dataScope→DataScope, mfaMethod→UserMfaMethod, loginHours→LoginHours, ssoProvider→UserSsoProvider |
| `approval_action` | **ApprovalActions** | — | LOG | action→ApprovalAction |
| `approval_condition` | **ApprovalWorkflowConditions** | via `ApprovalWorkflows` (conditions) | CHILD | field→ApprovalWorkflowConditionField, operator→ApprovalWorkflowConditionOperator |
| `approval_delegation` | **ApprovalDelegations** | `approvalDelegationAddUpdate` · `getApprovalDelegationInfo` | MASTER | subject→Subject |
| `approval_request` | **Approvals** | `approvalAddUpdate` · `getApprovalInfo` | DOCUMENT | status→ApprovalStatus |
| `approval_step` | **ApprovalWorkflowSteps** | via `ApprovalWorkflows` (steps) | CHILD | approverType→ApproverType, onSlaBreach→OnSlaBreach, approvalMode→ApprovalMode |
| `approval_workflow` | **ApprovalWorkflows** | `approvalWorkflowAddUpdate` · `getApprovalWorkflowInfo` | MASTER | subject→Subject, status→ApprovalWorkflowStatus, onComplete→OnComplete, onReject→OnReject |
| `attachment` | **Attachments** | — | HELPER | purpose→AttachmentPurpose |
| `audit_log` | **AuditTrailEntries** | — | LOG | action→AuditTrailEntryAction, module→AuditTrailEntryModule |
| `audit_log_default` | **AuditTrailEntriesDefault** | — | PARTITION |  |
| `audit_seal` | **AuditTrailSeals** | — | LOG |  |
| `backup_policy` | **BackupSettings** | `backupSettingAddUpdate` · `getBackupSettingInfo` | CONFIG | frequency→BackupSettingFrequency |
| `backup_snapshot` | **Backups** | — | LOG | kind→BackupKind, status→BackupStatus |
| `branch` | **Branches** | `branchAddUpdate` · `getBranchInfo` | MASTER | province→Province, salesTaxAuthority→SalesTaxAuthority, status→ActiveInactiveStatus |
| `comment` | **Comments** | — | LOG |  |
| `company_profile` | **CompanySettings** | `companySettingAddUpdate` · `getCompanySettingInfo` | CONFIG | province→Province, industry→CompanySettingIndustry, legalStructure→LegalStructure, numberFormat→NumberFormat, fxRateSource→FxRateSource, creditLimitAction→CreditLimitAction, salesTaxReturnPeriod→SalesTaxReturnPeriod, provincialTaxAuthority→ProvincialTaxAuthority, atlStatus→CompanySettingAtlStatus, documentFont→DocumentFont, paperSize→PaperSize, payDayRule→PayDayRule, payrollCutoff→PayrollCutoff, workingDaysBasis→WorkingDaysBasis, workingWeek→WorkingWeek, attendanceSource→AttendanceSource |
| `company_setting` | **CompanySettingValues** | — | HELPER | settingGroup→SettingGroup |
| `currency` | **Currencies** | — | HELPER |  |
| `default_account_map` | **DefaultAccountMappings** | `defaultAccountMappingAddUpdate` · `getDefaultAccountMappingInfo` | MASTER |  |
| `doc_sequence` | **NumberingSeries** | `numberingSeriesAddUpdate` · `getNumberingSeriesInfo` | MASTER | resetPolicy→ResetPolicy |
| `doc_sequence_counter` | **NumberingSeriesCounters** | — | HELPER |  |
| `doc_template` | **DocumentTemplates** | `documentTemplateAddUpdate` · `getDocumentTemplateInfo` | MASTER | category→DocumentTemplateCategory, letterKind→LetterKind, paper→Paper, headerLayout→HeaderLayout, language→DocumentTemplateLanguage, status→DocumentTemplateStatus |
| `doc_type` | **DocumentTypes** | — | HELPER | module→DocumentTypeModule, defaultResetPolicy→DefaultResetPolicy |
| `entity_tag` | **TaggedRecords** | via `Tags` (records) | JOIN |  |
| `fx_rate` | **ExchangeRates** | `exchangeRateAddUpdate` · `getExchangeRateInfo` | MASTER | source→ExchangeRateSource |
| `import_error` | **DataImportErrors** | via `DataImports` (errors) | CHILD |  |
| `import_job` | **DataImports** | `dataImportAddUpdate` · `getDataImportInfo` | DOCUMENT | entity→Entity, sourceSystem→SourceSystem, status→DataImportStatus |
| `integration` | **Integrations** | `integrationAddUpdate` · `getIntegrationInfo` | MASTER | category→IntegrationCategory, provider→Provider, status→IntegrationStatus |
| `mention` | **Mentions** | — | LOG |  |
| `notification` | **Notifications** | — | LOG | category→NotificationCategory, severity→NotificationSeverity |
| `notification_pref` | **NotificationPreferences** | `notificationPreferenceAddUpdate` · `getNotificationPreferenceInfo` | MASTER | channel→NotificationPreferenceChannel, delivery→Delivery |
| `password_reset` | **PasswordResets** | — | HELPER | purpose→PasswordResetPurpose, channel→PasswordResetChannel |
| `permission` | **Permissions** | — | HELPER | module→PermissionModule, action→PermissionAction |
| `reaction` | **Reactions** | — | LOG |  |
| `restore_request` | **BackupRestoreRequests** | `backupRestoreRequestAddUpdate` · `getBackupRestoreRequestInfo` | DOCUMENT | status→BackupRestoreRequestStatus |
| `role` | **Roles** | `roleAddUpdate` · `getRoleInfo` | MASTER | systemKey→SystemKey, tone→RoleTone |
| `role_limit` | **RoleLimits** | via `Roles` (limits) | CHILD | salaryVisibility→SalaryVisibility |
| `role_permission` | **RolePermissions** | via `Roles` (permissions) | JOIN |  |
| `setup_step_state` | **SetupGuideSteps** | — | HELPER | stepKey→StepKey |
| `sod_rule` | **SegregationOfDutiesRules** | `segregationOfDutiesRuleAddUpdate` · `getSegregationOfDutiesRuleInfo` | MASTER | kind→SegregationOfDutiesRuleKind, severity→SegregationOfDutiesRuleSeverity |
| `tag` | **Tags** | `tagAddUpdate` · `getTagInfo` | MASTER | tone→TagTone |
| `task` | **Tasks** | `taskAddUpdate` · `getTaskInfo` | MASTER | kind→TaskKind, module→TaskModule, priority→TaskPriority, status→TaskStatus, repeatRule→RepeatRule, source→TaskSource |
| `trusted_device` | **TrustedDevices** | — | HELPER | platform→Platform |
| `user_branch` | **UserBranches** | via `Users` (branches) | JOIN |  |
| `user_calc_pref` | **CalculatorSettings** | `calculatorSettingAddUpdate` · `getCalculatorSettingInfo` | CONFIG | numberGrouping→NumberGrouping, language→EnUrLanguage |
| `user_calc_tape` | **CalculatorTapeLines** | — | LOG | kind→CalculatorTapeLineKind |
| `user_invite` | **UserInvites** | `userInviteAddUpdate` · `getUserInviteInfo` | MASTER | status→UserInviteStatus |
| `user_mfa` | **UserMfaMethods** | via `Users` (mfaMethods) | CHILD | factorType→FactorType, status→UserMfaMethodStatus |
| `user_preference` | **UserPreferences** | `userPreferenceAddUpdate` · `getUserPreferenceInfo` | CONFIG | language→EnUrLanguage, dateFormat→DateFormat, numberFormat→NumberFormat, startRoute→StartRoute, theme→Theme |
| `user_role` | **UserRoles** | via `Users` (roles) | JOIN |  |
| `user_session` | **UserSessions** | — | LOG | clientType→ClientType, authMethod→UserSessionAuthMethod, revokeReason→RevokeReason |
| `user_warehouse` | **UserWarehouses** | via `Users` (warehouses) | JOIN |  |
| `webhook_delivery` | **IntegrationWebhookDeliveries** | — | LOG |  |
| `webhook_endpoint` | **IntegrationWebhooks** | `integrationWebhookAddUpdate` · `getIntegrationWebhookInfo` | MASTER | healthStatus→HealthStatus |

| View | New name |
|---|---|
| `v_approval_inbox` | **getApprovalsInbox** |
| `v_audit_trail` | **getAuditTrail** |
| `v_dash_budget_remaining` | **getDashboardBudgetRemaining** |
| `v_dash_cash_bank` | **getDashboardCashAndBank** |
| `v_dash_expense_month` | **getDashboardMonthlyExpenses** |
| `v_dash_money_flow` | **getDashboardMoneyFlow** |
| `v_dash_recent_transactions` | **getDashboardRecentTransactions** |
| `v_dash_revenue_daily` | **getDashboardDailyRevenue** |
| `v_dash_revenue_month` | **getDashboardMonthlyRevenue** |
| `v_doc_sequence_preview` | **getNumberingSeriesPreview** |
| `v_notification_summary` | **getNotificationSummary** |
| `v_setup_progress` | **getSetupGuideProgress** |
| `v_today_due` | **getTodayDueItems** |
| `v_today_kpis` | **getTodayKpis** |
| `v_user_effective_permission` | **getUserEffectivePermissions** |
| `v_user_kpis` | **getUserKpis** |

## Accounting

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `account` | **ChartOfAccounts** | `accountAddUpdate` · `getAccountInfo` | MASTER | nature→Nature, kind→AccountKind, subType→AccountSubType, status→ActiveInactiveStatus |
| `account_branch` | **AccountBranches** | via `ChartOfAccounts` (branches) | JOIN |  |
| `allocation_rule` | **CostAllocationRules** | `costAllocationRuleAddUpdate` · `getCostAllocationRuleInfo` | MASTER | basis→CostAllocationRuleBasis, status→ActiveInactiveStatus |
| `allocation_split` | **CostAllocationSplits** | via `CostAllocationRules` (splits) | CHILD |  |
| `budget` | **Budgets** | `budgetAddUpdate` · `getBudgetInfo` | DOCUMENT | budgetType→BudgetType, seedFrom→SeedFrom, status→BudgetStatus |
| `budget_line` | **BudgetVersionLines** | — | LINE |  |
| `budget_version` | **BudgetVersions** | via `Budgets` (versions) | CHILD | status→BudgetVersionStatus |
| `cost_centre` | **CostCentres** | `costCentreAddUpdate` · `getCostCentreInfo` | MASTER | status→ActiveInactiveStatus, centreType→CentreType |
| `fiscal_period` | **FiscalPeriods** | via `FiscalYears` (periods) | CHILD | status→OpenClosedLockedStatus |
| `fiscal_year` | **FiscalYears** | `fiscalYearAddUpdate` · `getFiscalYearInfo` | MASTER | status→OpenClosedStatus |
| `journal_activity` | **VoucherActivities** | — | LOG | action→VoucherActivityAction |
| `journal_entry` | **Vouchers** | `voucherAddUpdate` · `getVoucherInfo` | DOCUMENT | voucherType→VoucherType, instrumentType→VoucherInstrumentType, status→VoucherStatus, reversalReason→ReversalReason |
| `journal_line` | **VoucherLines** | via `Vouchers` (lines) | LINE |  |
| `opening_balance_batch` | **OpeningBalances** | `openingBalanceAddUpdate` · `getOpeningBalanceInfo` | DOCUMENT | status→OpeningBalanceStatus |
| `opening_balance_line` | **OpeningBalanceLines** | via `OpeningBalances` (lines) | LINE |  |
| `period_module_lock` | **PeriodModuleLocks** | via `FiscalPeriods` (moduleLocks) | CHILD | moduleCode→ModuleCode, status→OpenClosedLockedStatus |
| `period_reopen` | **PeriodReopenRequests** | `periodReopenRequestAddUpdate` · `getPeriodReopenRequestInfo` | DOCUMENT | moduleCode→ModuleCode, previousStatus→PreviousStatus, status→PeriodReopenRequestStatus |
| `project` | **Projects** | `projectAddUpdate` · `getProjectInfo` | MASTER | colour→ProjectColour, status→ProjectStatus |
| `project_tag` | **ProjectTags** | via `Projects` (tags) | CHILD |  |
| `recurring_run` | **RecurringVoucherRuns** | — | LOG | triggerType→RecurringVoucherRunTriggerType, status→RecurringVoucherRunStatus |
| `recurring_template` | **RecurringVoucherTemplates** | `recurringVoucherTemplateAddUpdate` · `getRecurringVoucherTemplateInfo` | MASTER | voucherType→RecurringVoucherTemplateVoucherType, frequency→RecurringVoucherTemplateFrequency, endMode→RecurringVoucherTemplateEndMode, status→RecurringVoucherTemplateStatus |
| `recurring_template_line` | **RecurringVoucherTemplateLines** | via `RecurringVoucherTemplates` (lines) | LINE |  |
| `saved_ledger_view` | **SavedLedgerViews** | `savedLedgerViewAddUpdate` · `getSavedLedgerViewInfo` | MASTER |  |
| `year_end_adjustment` | **YearEndAdjustments** | via `YearEndCloses` (adjustments) | CHILD | status→YearEndAdjustmentStatus |
| `year_end_close` | **YearEndCloses** | `yearEndCloseAddUpdate` · `getYearEndCloseInfo` | DOCUMENT | runMode→RunMode, status→YearEndCloseStatus |

| View | New name |
|---|---|
| `v_account_balance` | **getAccountBalances** |
| `v_account_tree` | **getAccountTree** |
| `v_balance_sheet` | **getBalanceSheet** |
| `v_budget_vs_actual` | **getBudgetVsActual** |
| `v_cash_flow` | **getCashFlow** |
| `v_cost_centre_actual` | **getCostCentreActuals** |
| `v_day_book` | **getDayBook** |
| `v_general_ledger` | **getGeneralLedger** |
| `v_ledger_line` | **getLedgerLines** |
| `v_period_summary` | **getFiscalPeriodSummary** |
| `v_profit_loss` | **getProfitAndLoss** |
| `v_project_pnl` | **getProjectProfitAndLoss** |
| `v_trial_balance` | **getTrialBalance** |
| `v_voucher_register` | **getVoucherRegister** |

## BankCash

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `bank` | **Banks** | `bankAddUpdate` · `getBankInfo` | MASTER |  |
| `bank_account` | **BankAccounts** | `bankAccountAddUpdate` · `getBankAccountInfo` | MASTER | accountType→AccountType, purpose→BankAccountPurpose, statementFormat→StatementFormat, status→BankAccountStatus |
| `bank_rule` | **BankRules** | `bankRuleAddUpdate` · `getBankRuleInfo` | CONFIG | matchMode→MatchMode |
| `bank_rule_condition` | **BankRuleConditions** | via `BankRules` (conditions) | CHILD | field→BankRuleConditionField, operator→BankRuleConditionOperator |
| `bank_transaction` | **BankTransactions** | — | LEDGER | paymentMode→BankTransactionPaymentMode, category→BankTransactionCategory, source→BankTransactionSource, status→BankTransactionStatus |
| `cash_account` | **CashAccounts** | `cashAccountAddUpdate` · `getCashAccountInfo` | MASTER | kind→CashAccountKind |
| `cash_category` | **CashCategories** | `cashCategoryAddUpdate` · `getCashCategoryInfo` | MASTER | direction→CashCategoryDirection, voucherType→CashCategoryVoucherType, partyKind→PartyKind |
| `cash_day_close` | **CashDayCloses** | `cashDayCloseAddUpdate` · `getCashDayCloseInfo` | DOCUMENT | status→CashDayCloseStatus |
| `cash_denomination_count` | **CashDayCloseDenominations** | via `CashDayCloses` (denominations) | CHILD |  |
| `cashbook_entry` | **CashBookEntries** | — | HELPER | entryKind→EntryKind, paymentMode→CashBookEntryPaymentMode |
| `cheque` | **Cheques** | `chequeAddUpdate` · `getChequeInfo` | DOCUMENT | direction→ReceivedIssuedDirection, postingMode→PostingMode, status→ChequeStatus |
| `cheque_allocation` | **ChequeAllocations** | via `Cheques` (allocations) | CHILD |  |
| `cheque_batch` | **ChequeBatches** | `chequeBatchAddUpdate` · `getChequeBatchInfo` | DOCUMENT | direction→ReceivedIssuedDirection, postingMode→PostingMode, oldNoRule→OldNoRule, source→ChequeBatchSource, status→ChequeBatchStatus |
| `cheque_batch_line` | **ChequeBatchLines** | via `ChequeBatches` (lines) | LINE | validationStatus→ValidationStatus |
| `cheque_book` | **ChequeBooks** | `chequeBookAddUpdate` · `getChequeBookInfo` | MASTER | status→ChequeBookStatus |
| `cheque_bounce` | **ChequeBounces** | — | LOG | reason→ChequeBounceReason, resolution→Resolution |
| `expense_category` | **ExpenseCategories** | `expenseCategoryAddUpdate` · `getExpenseCategoryInfo` | MASTER | appliesTo→ExpenseCategoryAppliesTo, limitPeriod→LimitPeriod |
| `expense_claim` | **ExpenseClaims** | `expenseClaimAddUpdate` · `getExpenseClaimInfo` | DOCUMENT | source→ExpenseClaimSource, policyLimitPeriod→PolicyLimitPeriod, status→ExpenseClaimStatus, workflowStage→WorkflowStage, rejectionReason→ExpenseClaimRejectionReason, paymentMethod→ExpenseClaimPaymentMethod |
| `expense_claim_action` | **ExpenseClaimActions** | — | LOG | action→ExpenseClaimAction, stage→ExpenseClaimActionStage |
| `expense_claim_line` | **ExpenseClaimLines** | via `ExpenseClaims` (lines) | LINE |  |
| `petty_cash_fund` | **PettyCashFunds** | `pettyCashFundAddUpdate` · `getPettyCashFundInfo` | MASTER | status→PettyCashFundStatus |
| `petty_cash_voucher` | **PettyCashVouchers** | `pettyCashVoucherAddUpdate` · `getPettyCashVoucherInfo` | DOCUMENT | receiptStatus→ReceiptStatus, status→PettyCashVoucherStatus |
| `petty_replenishment` | **PettyCashReplenishments** | `pettyCashReplenishmentAddUpdate` · `getPettyCashReplenishmentInfo` | DOCUMENT | status→DraftPostedCancelledStatus |
| `reconciliation` | **BankReconciliations** | `bankReconciliationAddUpdate` · `getBankReconciliationInfo` | DOCUMENT | status→BankReconciliationStatus |
| `reconciliation_match` | **BankReconciliationMatches** | via `BankReconciliations` (matches) | CHILD | status→BankReconciliationMatchStatus, matchMethod→MatchMethod |
| `statement_import` | **BankStatementImports** | `bankStatementImportAddUpdate` · `getBankStatementImportInfo` | DOCUMENT | format→BankStatementImportFormat, status→BankStatementImportStatus |
| `statement_line` | **BankStatementLines** | via `BankStatementImports` (lines) | LINE | channel→BankStatementLineChannel, status→BankStatementLineStatus |

| View | New name |
|---|---|
| `v_bank_account_balance` | **getBankAccountBalances** |
| `v_bank_book` | **getBankBook** |
| `v_cash_book` | **getCashBook** |
| `v_cash_ledger` | **getCashLedger** |
| `v_cheque_register` | **getChequeRegister** |
| `v_pdc_maturity` | **getPdcMaturity** |
| `v_petty_fund_position` | **getPettyCashFundPositions** |

## FixedAssets

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `asset` | **FixedAssets** | `fixedAssetAddUpdate` · `getFixedAssetInfo` | MASTER | method→FixedAssetMethod, status→FixedAssetStatus |
| `asset_category` | **FixedAssetCategories** | `fixedAssetCategoryAddUpdate` · `getFixedAssetCategoryInfo` | MASTER | defaultMethod→DefaultMethod, status→ActiveInactiveStatus |
| `asset_disposal` | **AssetDisposals** | `assetDisposalAddUpdate` · `getAssetDisposalInfo` | DOCUMENT | disposalType→DisposalType, status→AssetDisposalStatus |
| `asset_transfer` | **AssetTransfers** | `assetTransferAddUpdate` · `getAssetTransferInfo` | DOCUMENT | status→AssetTransferStatus |
| `depreciation_run` | **DepreciationRuns** | `depreciationRunAddUpdate` · `getDepreciationRunInfo` | DOCUMENT | status→DraftPostedCancelledStatus |
| `depreciation_run_line` | **DepreciationRunLines** | — | LINE | method→DepreciationRunLineMethod |
| `depreciation_schedule` | **DepreciationSchedules** | — | HELPER | status→DepreciationScheduleStatus |

| View | New name |
|---|---|
| `v_asset_register` | **getFixedAssetRegister** |

## Tax

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `fbr_config` | **FbrSettings** | `fbrSettingAddUpdate` · `getFbrSettingInfo` | CONFIG | authority→FbrSettingAuthority, environment→FbrSettingEnvironment, connectionStatus→ConnectionStatus |
| `fbr_connection_log` | **FbrConnectionEvents** | — | LOG | event→Event |
| `fbr_pos_mapping` | **FbrBranchMappings** | via `FbrSettings` (branchMappings) | CHILD |  |
| `fbr_submission` | **FbrInvoiceSubmissions** | — | LOG | status→FbrInvoiceSubmissionStatus |
| `sales_tax_annex_line` | **SalesTaxReturnLines** | via `SalesTaxReturns` (lines) | LINE | annex→Annex, matchStatus→SalesTaxReturnLineMatchStatus |
| `sales_tax_return` | **SalesTaxReturns** | `salesTaxReturnAddUpdate` · `getSalesTaxReturnInfo` | DOCUMENT | authority→SalesTaxReturnAuthority, status→SalesTaxReturnStatus |
| `tax_code` | **TaxCodes** | `taxCodeAddUpdate` · `getTaxCodeInfo` | MASTER | taxType→TaxType, appliesTo→TaxCodeAppliesTo, rateBasis→RateBasis, salesTaxKind→SalesTaxKind |
| `tax_code_rate` | **TaxCodeRates** | via `TaxCodes` (rates) | CHILD |  |
| `wht_certificate` | **WhtCertificates** | `whtCertificateAddUpdate` · `getWhtCertificateInfo` | DOCUMENT | direction→WhtCertificateDirection, status→WhtCertificateStatus |
| `wht_deduction` | **WhtDeductions** | — | LEDGER | direction→WhtDeductionDirection, status→WhtDeductionStatus |
| `wht_payment` | **WhtChallans** | `whtChallanAddUpdate` · `getWhtChallanInfo` | DOCUMENT | status→WhtChallanStatus |
| `wht_return` | **WhtStatements** | `whtStatementAddUpdate` · `getWhtStatementInfo` | DOCUMENT | returnType→WhtStatementReturnType, status→WhtStatementStatus |

| View | New name |
|---|---|
| `v_sales_tax_annex_a` | **getSalesTaxAnnexA** |
| `v_sales_tax_annex_c` | **getSalesTaxAnnexC** |
| `v_sales_tax_output` | **getSalesTaxOutputRegister** |
| `v_wht_by_section` | **getWhtBySection** |

## Sales

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `credit_hold_event` | **CreditHoldEvents** | — | LOG | eventType→CreditHoldEventType, reason→CreditHoldEventReason, source→CreditHoldEventSource |
| `credit_note` | **CreditNotes** | `creditNoteAddUpdate` · `getCreditNoteInfo` | DOCUMENT | reason→CreditNoteReason, treatment→CreditNoteTreatment, status→CreditNoteStatus |
| `credit_note_line` | **CreditNoteLines** | via `CreditNotes` (lines) | LINE |  |
| `credit_override` | **CreditOverrides** | `creditOverrideAddUpdate` · `getCreditOverrideInfo` | DOCUMENT | overrideType→OverrideType, approvalMethod→ApprovalMethod, status→CreditOverrideStatus |
| `customer` | **Customers** | `customerAddUpdate` · `getCustomerInfo` | MASTER | customerType→CustomerType, atlStatus→CustomerAtlStatus, province→Province, paymentTerms→CustomerPaymentTerms, status→CustomerStatus, holdReason→CustomerHoldReason, customerChannel→CustomerChannel, priceTier→PriceTier |
| `customer_address` | **CustomerAddresses** | via `Customers` (addresses) | CHILD | addressType→AddressType, province→Province |
| `customer_contact` | **CustomerContacts** | via `Customers` (contacts) | CHILD |  |
| `customer_group` | **CustomerGroups** | `customerGroupAddUpdate` · `getCustomerGroupInfo` | MASTER |  |
| `customer_note` | **CustomerNotes** | via `Customers` (notes) | CHILD |  |
| `delivery_challan` | **DeliveryChallans** | `deliveryChallanAddUpdate` · `getDeliveryChallanInfo` | DOCUMENT | deliverySlot→DeliverySlot, status→DeliveryChallanStatus |
| `delivery_challan_line` | **DeliveryChallanLines** | via `DeliveryChallans` (lines) | LINE |  |
| `invoice` | **SalesInvoices** | `salesInvoiceAddUpdate` · `getSalesInvoiceInfo` | DOCUMENT | channel→SalesInvoiceChannel, paymentTerms→CustomerPaymentTerms, saleType→SaleType, deliverySlot→DeliverySlot, status→SalesInvoiceStatus, fbrStatus→FbrStatus, priceTier→PriceTier, stockIssueMode→StockIssueMode |
| `invoice_line` | **SalesInvoiceLines** | via `SalesInvoices` (lines) | LINE |  |
| `pos_payment` | **PosPayments** | via `SalesInvoices` (payments) | CHILD | tender→Tender |
| `pos_shift` | **PosShifts** | `posShiftAddUpdate` · `getPosShiftInfo` | DOCUMENT | status→OpenClosedStatus |
| `pos_shift_denomination` | **PosShiftDenominations** | via `PosShifts` (denominations) | CHILD |  |
| `price_list` | **PriceLists** | `priceListAddUpdate` · `getPriceListInfo` | MASTER | status→ActiveInactiveStatus |
| `price_list_item` | **PriceListItems** | via `PriceLists` (items) | CHILD |  |
| `quantity_break` | **PriceListQuantityBreaks** | via `PriceLists` (quantityBreaks) | CHILD |  |
| `quotation` | **Quotations** | `quotationAddUpdate` · `getQuotationInfo` | DOCUMENT | status→QuotationStatus |
| `quotation_line` | **QuotationLines** | via `Quotations` (lines) | LINE |  |
| `receipt` | **CustomerReceipts** | `customerReceiptAddUpdate` · `getCustomerReceiptInfo` | DOCUMENT | method→CustomerReceiptMethod, whtCertificateStatus→WhtCertificateStatus2, status→CustomerReceiptStatus |
| `receipt_allocation` | **CustomerReceiptAllocations** | — | CHILD | targetType→CustomerReceiptAllocationTargetType |
| `recurring_invoice_line` | **RecurringInvoiceLines** | via `RecurringInvoices` (lines) | LINE |  |
| `recurring_invoice_profile` | **RecurringInvoices** | `recurringInvoiceAddUpdate` · `getRecurringInvoiceInfo` | MASTER | paymentTerms→CustomerPaymentTerms, frequency→RecurringInvoiceFrequency, endMode→RecurringInvoiceEndMode, status→RecurringInvoiceStatus |
| `reminder_log` | **PaymentReminderLogs** | — | LOG | channel→PaymentReminderLogChannel, language→EnUrLanguage, triggerMode→TriggerMode, status→PaymentReminderLogStatus |
| `reminder_rule` | **PaymentReminderRules** | `paymentReminderRuleAddUpdate` · `getPaymentReminderRuleInfo` | CONFIG | dunningLevel→DunningLevel, action→PaymentReminderRuleAction |
| `reminder_template` | **PaymentReminderTemplates** | `paymentReminderTemplateAddUpdate` · `getPaymentReminderTemplateInfo` | CONFIG |  |
| `sales_order` | **SalesOrders** | `salesOrderAddUpdate` · `getSalesOrderInfo` | DOCUMENT | paymentTerms→CustomerPaymentTerms, status→SalesOrderStatus |
| `sales_order_line` | **SalesOrderLines** | via `SalesOrders` (lines) | LINE |  |
| `sales_return` | **SalesReturns** | `salesReturnAddUpdate` · `getSalesReturnInfo` | DOCUMENT | returnType→SalesReturnType, status→DraftPostedCancelledStatus |
| `sales_return_line` | **SalesReturnLines** | via `SalesReturns` (lines) | LINE | reason→SalesReturnLineReason, disposition→SalesReturnLineDisposition |
| `scheme` | **SalesSchemes** | `salesSchemeAddUpdate` · `getSalesSchemeInfo` | MASTER | schemeType→SchemeType |
| `scheme_eligibility` | **SalesSchemeEligibilities** | via `SalesSchemes` (eligibility) | CHILD | priceTier→PriceTier |
| `scheme_item` | **SalesSchemeItems** | via `SalesSchemes` (items) | CHILD | itemRole→ItemRole |

| View | New name |
|---|---|
| `v_ar_ageing` | **getReceivablesAgeing** |
| `v_credit_exposure` | **getCustomerCreditExposure** |
| `v_customer_balance` | **getCustomerBalances** |
| `v_customer_credit_position` | **getCustomerCreditPosition** |
| `v_customer_statement` | **getCustomerStatement** |
| `v_open_items` | **getReceivableOpenItems** |
| `v_reminder_queue` | **getPaymentReminderQueue** |
| `v_sales_by_customer` | **getSalesByCustomer** |
| `v_sales_by_item` | **getSalesByItem** |
| `v_sales_register` | **getSalesRegister** |

## Purchases

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `bill` | **VendorBills** | `vendorBillAddUpdate` · `getVendorBillInfo` | DOCUMENT | channel→VendorBillChannel, captureMethod→CaptureMethod, payMode→VendorBillPayMode, matchStatus→VendorBillMatchStatus, status→VendorBillStatus |
| `bill_line` | **VendorBillLines** | via `VendorBills` (lines) | LINE | whtSection→WhtSection |
| `debit_note` | **DebitNotes** | `debitNoteAddUpdate` · `getDebitNoteInfo` | DOCUMENT | reason→DebitNoteReason, settlement→DebitNoteSettlement, status→DebitNoteStatus |
| `debit_note_line` | **DebitNoteLines** | via `DebitNotes` (lines) | LINE |  |
| `grn` | **GoodsReceivedNotes** | `goodsReceivedNoteAddUpdate` · `getGoodsReceivedNoteInfo` | DOCUMENT | qcStatus→QcStatus, matchStatus→GoodsReceivedNoteMatchStatus, billStatus→BillStatus, status→DraftPostedCancelledStatus |
| `grn_line` | **GoodsReceivedNoteLines** | via `GoodsReceivedNotes` (lines) | LINE | rejectReason→RejectReason |
| `landed_cost_charge` | **LandedCostCharges** | via `LandedCostShipments` (charges) | CHILD | chargeType→ChargeType |
| `landed_cost_item` | **LandedCostItems** | via `LandedCostShipments` (items) | CHILD |  |
| `landed_cost_shipment` | **LandedCostShipments** | `landedCostShipmentAddUpdate` · `getLandedCostShipmentInfo` | DOCUMENT | shipmentMode→ShipmentMode, allocationBasis→AllocationBasis, status→LandedCostShipmentStatus |
| `payment_allocation` | **VendorPaymentAllocations** | via `VendorPayments` (allocations) | CHILD |  |
| `purchase_order` | **PurchaseOrders** | `purchaseOrderAddUpdate` · `getPurchaseOrderInfo` | DOCUMENT | paymentTerms→PurchaseOrderPaymentTerms, status→PurchaseOrderStatus |
| `purchase_order_line` | **PurchaseOrderLines** | via `PurchaseOrders` (lines) | LINE |  |
| `purchase_return` | **PurchaseReturns** | `purchaseReturnAddUpdate` · `getPurchaseReturnInfo` | DOCUMENT | settlement→PurchaseReturnSettlement, reason→PurchaseReturnReason, status→PurchaseReturnStatus |
| `purchase_return_line` | **PurchaseReturnLines** | via `PurchaseReturns` (lines) | LINE |  |
| `vendor` | **Vendors** | `vendorAddUpdate` · `getVendorInfo` | MASTER | atlStatus→VendorAtlStatus, defaultWhtSection→DefaultWhtSection, paymentTerms→PurchaseOrderPaymentTerms, status→ActiveInactiveStatus |
| `vendor_bank` | **VendorBankAccounts** | via `Vendors` (bankAccounts) | CHILD |  |
| `vendor_category` | **VendorCategories** | `vendorCategoryAddUpdate` · `getVendorCategoryInfo` | MASTER |  |
| `vendor_contact` | **VendorContacts** | via `Vendors` (contacts) | CHILD |  |
| `vendor_payment` | **VendorPayments** | `vendorPaymentAddUpdate` · `getVendorPaymentInfo` | DOCUMENT | method→VendorPaymentMethod, whtTreatment→WhtTreatment, whtSection→WhtSection, status→VendorPaymentStatus |

| View | New name |
|---|---|
| `v_ap_ageing` | **getPayablesAgeing** |
| `v_purchase_register` | **getPurchaseRegister** |
| `v_three_way_match` | **getThreeWayMatch** |
| `v_vendor_balance` | **getVendorBalances** |
| `v_vendor_statement` | **getVendorStatement** |
| `v_wht_deducted` | **getVendorWhtDeducted** |

## Inventory

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `assembly_voucher` | **AssemblyVouchers** | `assemblyVoucherAddUpdate` · `getAssemblyVoucherInfo` | DOCUMENT | direction→AssemblyVoucherDirection, status→DraftPostedCancelledStatus |
| `assembly_voucher_line` | **AssemblyVoucherLines** | via `AssemblyVouchers` (lines) | LINE |  |
| `batch` | **ProductBatches** | `productBatchAddUpdate` · `getProductBatchInfo` | MASTER | disposition→ProductBatchDisposition |
| `bin` | **WarehouseBins** | `warehouseBinAddUpdate` · `getWarehouseBinInfo` | MASTER |  |
| `demand` | **GoodsDemands** | `goodsDemandAddUpdate` · `getGoodsDemandInfo` | DOCUMENT | source→GoodsDemandSource, status→GoodsDemandStatus |
| `demand_line` | **GoodsDemandLines** | via `GoodsDemands` (lines) | LINE |  |
| `item` | **Products** | `productAddUpdate` · `getProductInfo` | MASTER | status→ProductStatus, abcClass→AbcClass |
| `item_barcode` | **ProductBarcodes** | via `Products` (barcodes) | CHILD | kind→ProductBarcodeKind |
| `item_price_history` | **ProductPriceLogs** | — | LOG | priceField→ProductPriceLogPriceField, source→ProductPriceLogSource |
| `item_supplier` | **ProductSuppliers** | via `Products` (suppliers) | JOIN |  |
| `item_uom` | **ProductUnits** | via `Products` (units) | CHILD |  |
| `kit` | **KitsAndBundles** | `kitAddUpdate` · `getKitInfo` | MASTER | tone→KitTone, status→ActiveInactiveStatus |
| `kit_component` | **KitComponents** | via `KitsAndBundles` (components) | CHILD |  |
| `label_job` | **BarcodeLabelJobs** | — | LOG | source→BarcodeLabelJobSource, status→BarcodeLabelJobStatus |
| `label_job_line` | **BarcodeLabelJobLines** | — | LINE |  |
| `label_template` | **BarcodeLabelTemplates** | `barcodeLabelTemplateAddUpdate` · `getBarcodeLabelTemplateInfo` | CONFIG | media→Media |
| `manual_stock_entry` | **StockInOut** | `stockInOutEntryAddUpdate` · `getStockInOutEntryInfo` | DOCUMENT | mode→StockInOutEntryMode, status→DraftPostedCancelledStatus |
| `manual_stock_entry_line` | **StockInOutEntryLines** | via `StockInOut` (lines) | LINE |  |
| `manufacturer` | **ProductCompanies** | `productCompanyAddUpdate` · `getProductCompanyInfo` | MASTER | status→ActiveInactiveStatus |
| `movement_reason` | **StockMovementReasons** | `stockMovementReasonAddUpdate` · `getStockMovementReasonInfo` | CONFIG | direction→StockMovementReasonDirection, ledgerMovementType→StockMovementReasonLedgerMovementType |
| `price_change_batch` | **BulkPriceUpdates** | `bulkPriceUpdateAddUpdate` · `getBulkPriceUpdateInfo` | DOCUMENT | applyTo→ApplyTo, priceField→BulkPriceUpdatePriceField, status→BulkPriceUpdateStatus |
| `price_change_line` | **BulkPriceUpdateLines** | via `BulkPriceUpdates` (lines) | LINE | priceField→BulkPriceUpdateLinePriceField |
| `principal_claim` | **PrincipalClaims** | `principalClaimAddUpdate` · `getPrincipalClaimInfo` | DOCUMENT | claimType→ClaimType, status→PrincipalClaimStatus |
| `principal_target` | **PrincipalTargets** | `principalTargetAddUpdate` · `getPrincipalTargetInfo` | MASTER | periodType→PrincipalTargetPeriodType, basis→PrincipalTargetBasis |
| `product_class` | **ProductClasses** | `productClassAddUpdate` · `getProductClassInfo` | MASTER |  |
| `product_subclass` | **ProductSubclasses** | via `ProductClasses` (subclasses) | CHILD |  |
| `reorder_rule` | **ReorderRules** | `reorderRuleAddUpdate` · `getReorderRuleInfo` | CONFIG |  |
| `stock_adjustment` | **StockAdjustments** | `stockAdjustmentAddUpdate` · `getStockAdjustmentInfo` | DOCUMENT | status→StockAdjustmentStatus |
| `stock_adjustment_line` | **StockAdjustmentLines** | via `StockAdjustments` (lines) | LINE |  |
| `stock_balance` | **StockBalances** | — | HELPER |  |
| `stock_count` | **StockCounts** | `stockCountAddUpdate` · `getStockCountInfo` | DOCUMENT | status→StockCountStatus |
| `stock_count_line` | **StockCountLines** | via `StockCounts` (lines) | LINE | reason→StockCountLineReason |
| `stock_ledger` | **StockMovements** | — | LEDGER | movementType→MovementType |
| `stock_reservation` | **StockReservations** | — | HELPER | status→StockReservationStatus |
| `stock_transfer` | **StockTransfers** | `stockTransferAddUpdate` · `getStockTransferInfo` | DOCUMENT | status→StockTransferStatus |
| `stock_transfer_line` | **StockTransferLines** | — | LINE |  |
| `stock_voucher` | **StockVouchers** | `stockVoucherAddUpdate` · `getStockVoucherInfo` | DOCUMENT | voucherType→StockVoucherType, breakageReason→BreakageReason, occasion→Occasion, status→DraftPostedCancelledStatus |
| `stock_voucher_line` | **StockVoucherLines** | via `StockVouchers` (lines) | LINE |  |
| `transfer_receipt_line` | **StockTransferReceiptLines** | via `StockTransfers` (receiptLines) | CHILD |  |
| `uom` | **UnitsOfMeasure** | `unitOfMeasureAddUpdate` · `getUnitOfMeasureInfo` | MASTER | kind→UnitOfMeasureKind |
| `warehouse` | **Warehouses** | `warehouseAddUpdate` · `getWarehouseInfo` | MASTER | type→WarehouseType, status→ActiveInactiveStatus |

| View | New name |
|---|---|
| `v_abc_analysis` | **getAbcAnalysis** |
| `v_dead_slow_stock` | **getDeadAndSlowStock** |
| `v_near_expiry` | **getNearExpiryStock** |
| `v_reorder_suggestion` | **getReorderSuggestions** |
| `v_stock_card` | **getStockCard** |
| `v_stock_in_view` | **getStockInView** |
| `v_stock_on_hand` | **getWholeStock** |
| `v_stock_valuation` | **getStockValuation** |

## Distribution

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `area` | **ShopAreas** | `shopAreaAddUpdate` · `getShopAreaInfo` | MASTER | status→ActiveInactiveStatus |
| `backorder_allocation` | **BackOrderAllocations** | — | CHILD | policy→BackOrderAllocationPolicy, status→BackOrderAllocationStatus |
| `backorder_cancellation` | **BackOrderCancellations** | — | CHILD | reason→BackOrderCancellationReason |
| `backorder_line` | **BackOrders** | — | HELPER | sourceDocType→SourceDocType, status→BackOrderStatus |
| `bulk_invoice_batch` | **BulkInvoiceRuns** | `bulkInvoiceRunAddUpdate` · `getBulkInvoiceRunInfo` | DOCUMENT | mode→BulkInvoiceRunMode, status→BulkInvoiceRunStatus |
| `bulk_invoice_cell` | **BulkInvoiceRunCells** | via `BulkInvoiceRuns` (cells) | CHILD |  |
| `bulk_invoice_skip` | **BulkInvoiceSkippedShops** | via `BulkInvoiceRuns` (skippedShops) | CHILD | reasonCode→ReasonCode |
| `cash_count_line` | **RouteSettlementCashCounts** | via `RouteSettlements` (cashCounts) | CHILD |  |
| `commission_slab` | **CommissionSlabs** | `commissionSlabAddUpdate` · `getCommissionSlabInfo` | CONFIG |  |
| `credit_override_log` | **CreditOverrideLogs** | — | LOG | triggerPoint→TriggerPoint, lastPinResult→LastPinResult, outcome→CreditOverrideLogOutcome |
| `customer_route` | **ShopRouteProfiles** | `shopRouteProfileAddUpdate` · `getShopRouteProfileInfo` | MASTER |  |
| `delivery_run` | **LoadSheets** | `loadSheetAddUpdate` · `getLoadSheetInfo` | DOCUMENT | status→LoadSheetStatus |
| `held_bill` | **HeldBills** | `heldBillAddUpdate` · `getHeldBillInfo` | DOCUMENT | rateEntryMode→RateEntryMode, holdReason→HeldBillHoldReason, status→HeldBillStatus |
| `held_bill_line` | **HeldBillLines** | via `HeldBills` (lines) | LINE |  |
| `load_sheet_line` | **LoadSheetLines** | via `LoadSheets` (lines) | LINE |  |
| `order_booking` | **OrderBookings** | `orderBookingAddUpdate` · `getOrderBookingInfo` | DOCUMENT | status→OrderBookingStatus |
| `order_booking_line` | **OrderBookingLines** | via `OrderBookings` (lines) | LINE |  |
| `order_template` | **OrderTemplates** | `orderTemplateAddUpdate` · `getOrderTemplateInfo` | MASTER | status→ActiveArchivedStatus |
| `order_template_line` | **OrderTemplateLines** | via `OrderTemplates` (lines) | LINE |  |
| `price_tier` | **PriceTiers** | `priceTierAddUpdate` · `getPriceTierInfo` | CONFIG | code→PriceTierCode |
| `recovery_entry` | **RecoverySheetLines** | via `RecoverySheets` (lines) | LINE | mode→RecoverySheetLineMode, reminderLanguage→ReminderLanguage, status→RecoverySheetLineStatus |
| `recovery_sheet` | **RecoverySheets** | `recoverySheetAddUpdate` · `getRecoverySheetInfo` | DOCUMENT | status→RecoverySheetStatus |
| `route` | **Routes** | `routeAddUpdate` · `getRouteInfo` | MASTER | status→ActiveInactiveStatus |
| `route_day` | **RouteVisitDays** | via `Routes` (visitDays) | CHILD | weekday→Weekday |
| `route_stop` | **RouteStops** | via `Routes` (stops) | CHILD |  |
| `run_invoice` | **LoadSheetInvoices** | via `LoadSheets` (invoices) | JOIN |  |
| `run_settlement` | **RouteSettlements** | `routeSettlementAddUpdate` · `getRouteSettlementInfo` | DOCUMENT | status→RouteSettlementStatus |
| `sales_target` | **SalesmanTargets** | `salesmanTargetAddUpdate` · `getSalesmanTargetInfo` | MASTER | role→SalesmanTargetRole, status→OpenClosedStatus |
| `salesman_commission` | **SalesmanCommissions** | `salesmanCommissionAddUpdate` · `getSalesmanCommissionInfo` | MASTER | status→SalesmanCommissionStatus |
| `settlement_cheque` | **RouteSettlementCheques** | via `RouteSettlements` (cheques) | CHILD |  |
| `settlement_line` | **RouteSettlementLines** | via `RouteSettlements` (lines) | LINE | deliveryState→DeliveryState |
| `settlement_return` | **RouteSettlementReturns** | via `RouteSettlements` (returns) | CHILD | reason→RouteSettlementReturnReason |
| `van_stock_count` | **VanStockCounts** | via `RouteSettlements` (vanStockCounts) | CHILD |  |
| `vehicle` | **Vans** | `vanAddUpdate` · `getVanInfo` | MASTER | status→VanStatus |

| View | New name |
|---|---|
| `v_backorder_incoming` | **getBackOrderIncomingStock** |
| `v_backorder_summary` | **getBackOrderSummary** |
| `v_booking_kpi` | **getOrderBookingKpis** |
| `v_load_sheet_picklist` | **getLoadSheetPickList** |
| `v_recovery_ageing` | **getRecoveryAgeing** |
| `v_route_monthly_sales` | **getRouteMonthlySales** |
| `v_route_outstanding` | **getRouteOutstanding** |
| `v_run_kpi` | **getLoadSheetKpis** |
| `v_salesman_performance` | **getSalesmanPerformance** |

## HumanResources

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `attendance_day` | **AttendanceRegister** | — | LEDGER | status→AttendanceDayStatus |
| `attendance_punch` | **AttendancePunches** | — | LOG | direction→AttendancePunchDirection, source→AttendancePunchSource, verifyMode→VerifyMode, workMode→WorkMode |
| `attendance_punch_default` | **AttendancePunchesDefault** | — | PARTITION |  |
| `attendance_request` | **RegularisationRequests** | `regularisationRequestAddUpdate` · `getRegularisationRequestInfo` | DOCUMENT | requestType→RegularisationRequestType, punchDirection→RegularisationRequestPunchDirection, channel→EssWebEssMobileHrChannel, status→ProfileChangeRequestStatus, stage→RegularisationRequestStage, rejectionReason→RegularisationRequestRejectionReason |
| `branch_hr_setting` | **BranchHrSettings** | `branchHrSettingAddUpdate` · `getBranchHrSettingInfo` | CONFIG | socialSecurityScheme→BranchHrSettingSocialSecurityScheme |
| `candidate` | **Candidates** | `candidateAddUpdate` · `getCandidateInfo` | DOCUMENT | source→CandidateSource, stage→CandidateStage, offerStatus→OfferStatus |
| `candidate_activity` | **CandidateActivities** | via `Candidates` (activities) | CHILD | activityType→CandidateActivityType |
| `certification` | **Certifications** | `certificationAddUpdate` · `getCertificationInfo` | MASTER | status→CertificationStatus |
| `clearance_item` | **ClearanceItems** | via `Offboardings` (clearanceItems) | CHILD | clearanceArea→ClearanceArea, status→ClearanceItemStatus |
| `competency_rating` | **CompetencyRatings** | via `PerformanceReviews` (competencies) | CHILD | raterRole→RaterRole |
| `department` | **Departments** | `departmentAddUpdate` · `getDepartmentInfo` | MASTER | division→Division |
| `designation` | **Designations** | `designationAddUpdate` · `getDesignationInfo` | MASTER |  |
| `device` | **BiometricDevices** | `biometricDeviceAddUpdate` · `getBiometricDeviceInfo` | MASTER | brand→Brand, connectionType→ConnectionType, punchDirection→BiometricDevicePunchDirection, status→BiometricDeviceStatus |
| `device_sync_log` | **DeviceSyncLogs** | — | LOG | operation→Operation, result→DeviceSyncLogResult |
| `employee` | **Employees** | `employeeAddUpdate` · `getEmployeeInfo` | MASTER | guardianRelation→GuardianRelation, gender→EmployeeGender, maritalStatus→MaritalStatus, religion→Religion, bloodGroup→BloodGroup, weeklyOff→WeeklyOff, payGroup→PayGroup, employmentType→EmploymentType, workPattern→WorkPattern, status→EmployeeStatus, exitType→ExitType |
| `employee_asset` | **EmployeeAssets** | via `Employees` (assets) | CHILD | category→EmployeeAssetCategory, condition→Condition, status→EmployeeAssetStatus |
| `employee_bank` | **EmployeeBankAccounts** | via `Employees` (bankAccounts) | CHILD | paymentMode→EmployeeBankAccountPaymentMode |
| `employee_document` | **EmployeeDocuments** | via `Employees` (documents) | CHILD | category→EmployeeDocumentCategory, renewalFrequency→RenewalFrequency, status→EmployeeDocumentStatus |
| `employee_history` | **EmployeePositionHistory** | — | LOG | eventType→PositionChangeEventType |
| `employee_statutory` | **EmployeeStatutoryDetails** | via `Employees` (statutoryDetails) | CHILD | socialSecurityScheme→EmployeeStatutoryDetailSocialSecurityScheme, atlStatus→EmployeeStatutoryDetailAtlStatus |
| `exit_interview` | **ExitInterviews** | via `Offboardings` (exitInterviews) | CHILD | primaryReason→PrimaryReason, wouldRejoin→WouldRejoin |
| `feedback` | **PerformanceFeedback** | `performanceFeedbackAddUpdate` · `getPerformanceFeedbackInfo` | DOCUMENT | relationship→Relationship, tag→Tag, status→PerformanceFeedbackStatus |
| `goal` | **Goals** | `goalAddUpdate` · `getGoalInfo` | MASTER | goalKind→GoalKind, unit→GoalUnit, status→GoalStatus |
| `grade` | **Grades** | `gradeAddUpdate` · `getGradeInfo` | MASTER |  |
| `holiday` | **Holidays** | `holidayAddUpdate` · `getHolidayInfo` | MASTER | holidayType→HolidayType, status→HolidayStatus, source→HolidaySource |
| `holiday_branch` | **HolidayBranches** | via `Holidays` (branches) | JOIN |  |
| `hr_letter` | **EmployeeLetters** | `employeeLetterAddUpdate` · `getEmployeeLetterInfo` | DOCUMENT | letterType→EmployeeLetterType, language→EnUrLanguage, status→EmployeeLetterStatus |
| `job_requisition` | **JobOpenings** | `jobOpeningAddUpdate` · `getJobOpeningInfo` | DOCUMENT | requisitionType→RequisitionType, hiringMode→HiringMode, priority→JobOpeningPriority, status→JobOpeningStatus |
| `key_result` | **KeyResults** | via `Goals` (keyResults) | CHILD | unit→GoalUnit |
| `leave_adjustment` | **LeaveAdjustments** | — | LEDGER | kind→LeaveAdjustmentKind, direction→LeaveAdjustmentDirection |
| `leave_balance` | **LeaveBalances** | — | LEDGER |  |
| `leave_policy_rule` | **LeaveEligibilityRules** | via `LeaveTypes` (eligibilityRules) | CHILD | scope→LeaveEligibilityRuleScope |
| `leave_request` | **LeaveRequests** | `leaveRequestAddUpdate` · `getLeaveRequestInfo` | DOCUMENT | duration→LeaveRequestDuration, channel→EssWebEssMobileHrChannel, status→LeaveRequestStatus, stage→LeaveRequestStage, rejectionReason→LeaveRequestRejectionReason |
| `leave_type` | **LeaveTypes** | `leaveTypeAddUpdate` · `getLeaveTypeInfo` | MASTER | category→LeaveTypeCategory, colour→LeaveTypeColour, unit→LeaveTypeUnit, accrualMethod→AccrualMethod, carryForwardMode→CarryForwardMode, encashmentMode→EncashmentMode, encashBasis→EncashBasis, deductionBasis→DeductionBasis, gender→LeaveTypeGender, availableAfter→AvailableAfter, probationRule→ProbationRule, approvalWorkflow→ApprovalWorkflow, status→ActiveInactiveStatus |
| `leave_year_close` | **LeaveYearEndClosings** | `leaveYearEndClosingAddUpdate` · `getLeaveYearEndClosingInfo` | DOCUMENT | encashmentTarget→EncashmentTarget, status→LeaveYearEndClosingStatus |
| `offboarding` | **Offboardings** | `offboardingAddUpdate` · `getOffboardingInfo` | DOCUMENT | exitType→ExitType, reasonCategory→OffboardingReasonCategory, status→OffboardingStatus |
| `onboarding` | **Onboardings** | `onboardingAddUpdate` · `getOnboardingInfo` | DOCUMENT | track→Track, status→OnboardingStatus |
| `onboarding_task` | **OnboardingTasks** | via `Onboardings` (tasks) | CHILD | taskGroup→TaskGroup, ownerFunction→OwnerFunction, actionKind→ActionKind, status→OnboardingTaskStatus |
| `onboarding_template` | **OnboardingTemplates** | `onboardingTemplateAddUpdate` · `getOnboardingTemplateInfo` | CONFIG | track→Track |
| `onboarding_template_task` | **OnboardingTemplateTasks** | via `OnboardingTemplates` (tasks) | CHILD | taskGroup→TaskGroup, ownerFunction→OwnerFunction, actionKind→ActionKind |
| `one_on_one` | **OneOnOneMeetings** | `oneOnOneMeetingAddUpdate` · `getOneOnOneMeetingInfo` | MASTER |  |
| `overtime_entry` | **OvertimeClaims** | `overtimeClaimAddUpdate` · `getOvertimeClaimInfo` | DOCUMENT | dayType→DayType, source→OvertimeClaimSource, status→OvertimeClaimStatus |
| `overtime_policy` | **OvertimePolicies** | `overtimePolicyAddUpdate` · `getOvertimePolicyInfo` | CONFIG | hourlyRateBasis→HourlyRateBasis, rounding→Rounding |
| `performance_cycle` | **PerformanceCycles** | `performanceCycleAddUpdate` · `getPerformanceCycleInfo` | MASTER | cycleType→CycleType, stage→PerformanceCycleStage, status→PerformanceCycleStatus |
| `performance_review` | **PerformanceReviews** | `performanceReviewAddUpdate` · `getPerformanceReviewInfo` | DOCUMENT | ratingLabel→RatingLabel, performanceBand→PerformanceBand, potentialBand→PotentialBand, stage→PerformanceReviewStage |
| `roster` | **ShiftRosters** | `shiftRosterEntryAddUpdate` · `getShiftRosterEntryInfo` | MASTER | entryType→ShiftRosterEntryType |
| `shift` | **WorkShifts** | `workShiftAddUpdate` · `getWorkShiftInfo` | MASTER | colour→WorkShiftColour, weeklyOff→WeeklyOff, season→Season, status→ActiveInactiveStatus |
| `training_enrolment` | **TrainingEnrolments** | `trainingEnrolmentAddUpdate` · `getTrainingEnrolmentInfo` | MASTER | status→TrainingEnrolmentStatus |
| `training_program` | **TrainingPrograms** | `trainingProgramAddUpdate` · `getTrainingProgramInfo` | MASTER | format→TrainingProgramFormat, status→TrainingProgramStatus |
| `training_session` | **TrainingSessions** | via `TrainingPrograms` (sessions) | CHILD | deliveryMode→DeliveryMode, status→TrainingSessionStatus |

| View | New name |
|---|---|
| `v_attendance_monthly_register` | **getAttendanceRegister** |
| `v_attendance_summary` | **getAttendanceSummary** |
| `v_attendance_today` | **getAttendanceToday** |
| `v_branch_headcount` | **getBranchHeadcount** |
| `v_department_cost` | **getMonthlyDepartmentCost** |
| `v_department_summary` | **getDepartmentSummary** |
| `v_designation_positions` | **getDesignationPositions** |
| `v_headcount` | **getHeadcount** |
| `v_hr_dashboard` | **getHrDashboard** |
| `v_late_arrivals` | **getLateArrivals** |
| `v_leave_balance_current` | **getCurrentLeaveBalances** |
| `v_leave_calendar` | **getLeaveCalendar** |
| `v_onboarding_progress` | **getOnboardingProgress** |
| `v_org_chart` | **getOrganisationChart** |
| `v_overtime_monthly` | **getMonthlyOvertime** |
| `v_performance_cycle_summary` | **getPerformanceCycleSummary** |
| `v_recruitment_funnel` | **getRecruitmentFunnel** |
| `v_training_summary` | **getTrainingSummary** |
| `v_turnover_monthly` | **getMonthlyTurnover** |

## Payroll

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `employee_salary` | **EmployeeSalaries** | `employeeSalaryAddUpdate` · `getEmployeeSalaryInfo` | MASTER | payMode→BankTransferChequeCashPayMode, revisionType→RevisionType |
| `final_settlement` | **FinalSettlements** | `finalSettlementAddUpdate` · `getFinalSettlementInfo` | DOCUMENT | status→FinalSettlementStatus |
| `loan` | **LoansAndAdvances** | `loanAddUpdate` · `getLoanInfo` | DOCUMENT | loanType→LoanType, purpose→LoanPurpose, requestChannel→RequestChannel, markupType→MarkupType, status→LoanStatus |
| `loan_installment` | **LoanInstallments** | via `LoansAndAdvances` (installments) | CHILD | installmentType→InstallmentType, status→LoanInstallmentStatus |
| `pay_group` | **PayGroups** | `payGroupAddUpdate` · `getPayGroupInfo` | CONFIG | frequency→PayGroupFrequency, status→ActiveInactiveStatus |
| `payment_batch` | **SalaryPaymentBatches** | via `PayrollRuns` (paymentBatches) | CHILD | paymentMethod→SalaryPaymentBatchPaymentMethod, fileFormat→FileFormat, status→SalaryPaymentBatchStatus |
| `payroll_input` | **PayrollAdjustments** | via `PayrollRuns` (adjustments) | CHILD | inputSource→InputSource |
| `payroll_line` | **PayrollRunLines** | via `PayrollRuns` (lines) | LINE | taxStatus→TaxStatus, payMode→BankTransferChequeCashPayMode |
| `payroll_line_component` | **PayrollRunLineComponents** | via `PayrollRunLines` (components) | CHILD | componentType→ComponentType |
| `payroll_run` | **PayrollRuns** | `payrollRunAddUpdate` · `getPayrollRunInfo` | DOCUMENT | runType→RunType, status→PayrollRunStatus |
| `payroll_run_branch` | **PayrollRunBranches** | via `PayrollRuns` (branches) | JOIN |  |
| `payslip` | **Payslips** | `payslipAddUpdate` · `getPayslipInfo` | DOCUMENT | status→PayslipStatus |
| `run_checklist_item` | **PayrollRunChecklistItems** | via `PayrollRuns` (checklist) | CHILD |  |
| `salary_component` | **SalaryComponents** | `salaryComponentAddUpdate` · `getSalaryComponentInfo` | MASTER | componentType→ComponentType, calcMethod→SalaryComponentCalcMethod, baseBasis→BaseBasis, taxTreatment→TaxTreatment, systemRole→SystemRole, status→ActiveInactiveStatus |
| `salary_structure` | **SalaryStructures** | `salaryStructureAddUpdate` · `getSalaryStructureInfo` | MASTER | structureKind→StructureKind, status→SalaryStructureStatus |
| `salary_structure_component` | **SalaryStructureComponents** | via `SalaryStructures` (components) | CHILD | calcMethod→SalaryComponentCalcMethod |
| `salary_tax_slab` | **SalaryTaxSlabs** | `salaryTaxSlabAddUpdate` · `getSalaryTaxSlabInfo` | CONFIG |  |
| `settlement_component` | **FinalSettlementLines** | via `FinalSettlements` (lines) | LINE | componentKind→FinalSettlementLineComponentKind, direction→FinalSettlementLineDirection |
| `structure_commission_tier` | **SalaryStructureCommissionTiers** | via `SalaryStructures` (commissionTiers) | CHILD |  |
| `tax_declaration` | **TaxDeclarations** | `taxDeclarationAddUpdate` · `getTaxDeclarationInfo` | DOCUMENT | declarationType→DeclarationType, itoSection→ItoSection, reliefKind→ReliefKind, status→TaxDeclarationStatus |

| View | New name |
|---|---|
| `v_bank_advice` | **getSalaryBankAdvice** |
| `v_employee_ytd` | **getEmployeePayYearToDate** |
| `v_eobi_statement` | **getEobiStatement** |
| `v_loan_outstanding` | **getOutstandingLoans** |
| `v_payroll_cost_by_department` | **getPayrollCostByDepartment** |
| `v_payroll_cost_monthly` | **getMonthlyPayrollCost** |
| `v_payroll_next_run` | **getNextPayrollRun** |
| `v_payroll_register` | **getPayrollRegister** |
| `v_payslip_delivery_summary` | **getPayslipDeliverySummary** |
| `v_pessi_statement` | **getPessiStatement** |
| `v_pf_register` | **getProvidentFundRegister** |
| `v_salary_tax_certificate` | **getSalaryTaxCertificate** |
| `v_salary_tax_statement` | **getSalaryTaxStatement** |
| `v_tax_projection` | **getSalaryTaxProjection** |

## EmployeeSelfService

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `announcement_read` | **CompanyAnnouncementReads** | via `CompanyAnnouncements` (reads) | JOIN | rsvp→Rsvp |
| `company_announcement` | **CompanyAnnouncements** | `companyAnnouncementAddUpdate` · `getCompanyAnnouncementInfo` | DOCUMENT | kind→CompanyAnnouncementKind, status→CompanyAnnouncementStatus |
| `faq` | **HelpdeskFaqs** | `helpdeskFaqAddUpdate` · `getHelpdeskFaqInfo` | MASTER |  |
| `helpdesk_category` | **HelpdeskCategories** | `helpdeskCategoryAddUpdate` · `getHelpdeskCategoryInfo` | MASTER | status→ActiveInactiveStatus |
| `helpdesk_message` | **HelpdeskTicketMessages** | via `HelpdeskTickets` (messages) | CHILD | authorRole→AuthorRole |
| `helpdesk_ticket` | **HelpdeskTickets** | `helpdeskTicketAddUpdate` · `getHelpdeskTicketInfo` | DOCUMENT | priority→HelpdeskTicketPriority, status→HelpdeskTicketStatus, contactChannel→ContactChannel |
| `kudos` | **Kudos** | `kudosAddUpdate` · `getKudosInfo` | MASTER | badge→Badge |
| `kudos_reaction` | **KudosReactions** | via `Kudos` (reactions) | CHILD | reaction→Reaction |
| `letter_request` | **LetterRequests** | `letterRequestAddUpdate` · `getLetterRequestInfo` | DOCUMENT | letterType→LetterRequestLetterType, outputFormat→OutputFormat, language→EnUrLanguage, stage→LetterRequestStage, status→LetterRequestStatus |
| `open_shift` | **OpenShifts** | `openShiftAddUpdate` · `getOpenShiftInfo` | DOCUMENT | status→OpenShiftStatus |
| `open_shift_claim` | **OpenShiftClaims** | via `OpenShifts` (claims) | CHILD | status→OpenShiftClaimStatus |
| `policy_acknowledgement` | **PolicyAcknowledgements** | via `CompanyPolicies` (acknowledgements) | JOIN |  |
| `policy_document` | **CompanyPolicies** | `companyPolicyAddUpdate` · `getCompanyPolicyInfo` | MASTER | category→CompanyPolicyCategory, status→CompanyPolicyStatus |
| `poll` | **Polls** | `pollAddUpdate` · `getPollInfo` | MASTER | status→DraftOpenClosedStatus |
| `poll_option` | **PollOptions** | via `Polls` (options) | CHILD |  |
| `poll_vote` | **PollVotes** | — | CHILD |  |
| `presence_status` | **PresenceStatuses** | — | HELPER | status→PresenceStatus, source→PresenceStatusSource |
| `profile_change_request` | **ProfileChangeRequests** | `profileChangeRequestAddUpdate` · `getProfileChangeRequestInfo` | DOCUMENT | fieldKey→FieldKey, status→ProfileChangeRequestStatus |
| `pulse_question` | **PulseSurveyQuestions** | via `PulseSurveys` (questions) | CHILD | metricKey→MetricKey |
| `pulse_response` | **PulseSurveyResponses** | — | LOG |  |
| `pulse_survey` | **PulseSurveys** | `pulseSurveyAddUpdate` · `getPulseSurveyInfo` | MASTER | status→DraftOpenClosedStatus |
| `shift_swap` | **ShiftSwapRequests** | `shiftSwapRequestAddUpdate` · `getShiftSwapRequestInfo` | DOCUMENT | swapMode→SwapMode, reasonCategory→ShiftSwapRequestReasonCategory, status→ShiftSwapRequestStatus |

| View | New name |
|---|---|
| `v_directory` | **getEmployeeDirectory** |
| `v_ess_my_day` | **getMyDay** |
| `v_helpdesk_sla` | **getHelpdeskServiceLevels** |
| `v_kudos_summary` | **getKudosSummary** |
| `v_poll_results` | **getPollResults** |
| `v_pulse_results` | **getPulseSurveyResults** |
| `v_team_calendar` | **getMyTeamCalendar** |
| `v_team_today` | **getMyTeamToday** |

## Reports

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `report_column` | **SavedReportColumns** | via `SavedReports` (columns) | CHILD | aggregate→Aggregate, format→SavedReportColumnFormat |
| `report_definition` | **SavedReports** | `savedReportAddUpdate` · `getSavedReportInfo` | MASTER | folder→Folder, kind→SavedReportKind, studio→SavedReportStudio, sourceEntity→SourceEntity, dateRange→DateRange, sortDir→SortDir, viewMode→ViewMode, display→Display, chartType→ChartType, defaultFormat→DefaultFormat, visibility→Visibility, status→ActiveArchivedStatus |
| `report_run` | **ReportRuns** | — | LOG | studio→ReportRunStudio, format→ReportRunFormat, triggerType→ReportRunTriggerType, status→ReportRunStatus |
| `report_schedule` | **ReportSchedules** | `reportScheduleAddUpdate` · `getReportScheduleInfo` | MASTER | frequency→ReportScheduleFrequency, format→ReportScheduleFormat, status→ReportScheduleStatus |
| `report_share` | **SavedReportShares** | via `SavedReports` (shares) | CHILD | shareType→ShareType |
