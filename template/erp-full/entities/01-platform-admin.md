# 01 · Platform Admin (SaaS console) — Full edition

Schema: `Platform` (global; no RLS). DDL: `database/schema/01-platform.sql` (Part A = Basic tables + [FULL] columns, Part B = Full-only tables).
The console runs as `finsoftPlatform`. Its BYPASSRLS login reads tenant-side counts (users, invoices, storage).
Platform document numbers come from `Platform.getNextPlatformDocumentNo()`: `FS-INV-2026-01842`, `TCK-2304`, `INC-2026-018`, `PRV-2026-029`, `CR-1042`.

**Permission keys** (`Platform.PlatformStaffRolePermissions.permissionKey`, granted per `Platform.PlatformStaffRoles`):
`tenant.view`, `tenant.provision`, `tenant.suspend`, `tenant.impersonate`, `plan.manage`, `invoice.issue_void`, `dunning.run`, `flag.manage`, `template.edit`, `system.manage`, `ticket.manage`, `announcement.publish`, `staff.manage`, `privacy.approve`. Super Admin is locked to all.

Routes (28): dashboard · tenants · tenants/new · tenants/view · templates · analytics · leads · partners · plans · subscriptions · invoices · dunning · usage · features · features/view · segments · entitlements · change-requests · support · announcements · comms · system · audit · status · security · integrations · tax-master · staff.

---

## Overview & tenants

### Platform Overview — `admin/dashboard`
*Source:* `src/48-dash-stock.html` (section `admin/dashboard`) · `src/92-dash.js`
**Purpose.** Morning overview: MRR and growth, live tenants, churn, plan mix, tenants needing attention, system health.
**Tables.** View-based. Reads: `Platform.getPlatformOverview`, `Platform.getMrrByPlan`, `Platform.getMrrMovement`, `Platform.getTenantsNeedingAttention`, `Platform.getSystemHealth` · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Monthly Recurring Revenue · period select (Sep / Aug 2026) | `vAdminDashboard.mrr` (Σ `Subscriptions.mrrAmount` of live subs) | month-end values come from `getMrrByMonth` |
| ARR Rs 46.1M | `vAdminDashboard.arr` | |
| vs August +3.9% / Expansion +Rs 79,000 | `vMrrMovement.expansion`, `vAdminDashboard.mrrMomPct` | from `SubscriptionEvents.movement`, `mrrDelta` |
| Active tenants 128 · sign-ups heat strip (12 months) | `vAdminDashboard.activeTenants`, `.signupsByMonth` | |
| Net new +9 · Trials 14 running · Growth 65 / Business 23 / Starter 35 | `.netNewTenants`, `.trialsRunning`, `vMrrByPlan.tenants` | |
| Logo churn 1.8% (30 d) · vs Aug +0.4 pts · Lost 2 tenants · Ceiling 2.5% | `.logoChurn30dPct`, `.churned30d` | CHURN events in `SubscriptionEvents` |
| MRR Flow (New / Expansion, Monthly / Quarterly) | `getMrrMovement` | |
| Plan mix (42% Growth · Rs 1.62M …) | `vMrrByPlan.mrr`, `.mrrSharePct` | |
| Tenants needing attention: Tenant / Plan / Issue / Since / MRR / Owner | `getTenantsNeedingAttention` | Issues come from: an open `DunningCases` ("Payment failed (2nd attempt)" = `attemptsCount`), the latest `UsageSnapshots` ≥ 80% ("Storage 92% of 100 GB"), `Tenants.lastActiveAt` (21 d), `Tenants.trialEndsOn` |
| System health (API gateway, PostgreSQL, workers, FBR IRIS, mail) | `getSystemHealth` | queue rows come from `JobQueueSamples`; FBR from open `incident`. Latency and uptime are external monitoring **[simulated]** |

**Statuses.** —
**Actions → effects.** Links to `admin/system`, `admin/tenants/new`, `admin/tenants`.
**Permission.** `tenant.view` · **Approval.** —

### All Tenants — `admin/tenants`
*Source:* `src/3A-admin-plus.html` (section `admin/tenants`) · `src/9B-admin-plus.js` §1
**Purpose.** Every organisation with lifecycle, health, revenue and seats; bulk extend trial / change plan / send notice / suspend.
**Tables.** Primary: `Platform.Tenants` · Reads: `Platform.getAllTenants`, `Platform.Subscriptions`, `Platform.SubscriptionPlans`, `Platform.TenantModules`, `Platform.TenantContacts`, `Platform.PlatformStaff`, `Platform.PlatformAuditLogs`, `Company.Users` · Writes: `Platform.Tenants`, `Platform.Subscriptions`, `Platform.SubscriptionEvents`, `Platform.TenantBroadcasts`, `Platform.CommunicationLogs`, `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.tenantAddUpdate` · Open → `Platform.getTenantInfo`
**Lookups.** `Tenants.industry` → `TenantIndustry` · `Tenants.province` → `Province` · `Tenants.numberFormat` → `NumberFormat` · `Tenants.dataResidency` → `DataResidency` · `Tenants.defaultLanguage` → `DefaultLanguage` · `Tenants.status` → `TenantStatus` · `Tenants.churnReason` → `ChurnReason` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Live tenants / In trial / At risk / Past due "Rs 142,996 · 4 tenants · oldest 19 d" / Seats in use | `getAllTenants` aggregates | Past due = Σ `PlatformInvoices.balanceAmount` of overdue invoices. Oldest = max days overdue |
| Portfolio health stack bar + legend | `Tenants.healthScore` buckets 75+ / 50–74 / < 50 | |
| Region counts | `Tenants.province` | |
| Views All / At risk / Trials ending / Past due / Enterprise | `healthScore < 50`, `status = 'TRIAL'`, `status IN ('PAST_DUE','READ_ONLY')`, `SubscriptionPlans.code = 'ENTERPRISE'` | |
| Search, Plan, Status, Region, City filters | `Tenants.displayName/code/city`, owner `TenantContacts.fullName`, `Subscriptions.planId`, `Tenants.status`, `Tenants.province`, `Tenants.city` | index `tenantProvinceCityIdx`, `tenantNameTrgmIdx` |
| Columns Tenant · Plan · Health · MRR · Seats · Modules · Status · Renewal | `tenant.*`, `SubscriptionPlans.name`, `Tenants.healthScore`, `Subscriptions.mrrAmount`, active users / `Subscriptions.seats`, `TenantModules`, `Tenants.status`, `Subscriptions.nextRenewalOn` / `Tenants.trialEndsOn` | |
| Quick view: health breakdown (Logins, Modules adopted, Invoices/week, Payment status, Support tickets, NPS) | `Tenants.healthFactors` (jsonb, hourly), `Tenants.healthUpdatedAt` | |
| Quick view contacts / last activity | `TenantContacts`, `Tenants.accountOwnerStaffId`, `PlatformAuditLogs` + `PlatformPayments` | |

**Statuses.** PROVISIONING → TRIAL → ACTIVE ⇄ PAST_DUE → READ_ONLY → SUSPENDED → CHURNED.
**Actions → effects.**
- *Extend trial* (7/14/30 d, internal note, email owner) → `Subscriptions.trialEndsOn`, `Tenants.trialEndsOn`, `SubscriptionEvents` TRIAL_EXTENDED (`trialDaysAdded`). Tenants not on trial are skipped.
- *Change plan* → `subscription` + `SubscriptionEvents` PLAN_CHANGED (EXPANSION/CONTRACTION), and a prorated `PlatformInvoices` (kind PRORATION).
- *Send notice* (template, message with `{{ownerName}}`, channels Email/SMS/WhatsApp/In-app) → `TenantBroadcasts` (audience SELECTED_TENANTS) expanding to `CommunicationLogs`.
- *Suspend* / *Reactivate* → `Tenants.status`, `Tenants.suspendedAt`, `Tenants.suspensionReason`, `SubscriptionEvents` SUSPENDED / REACTIVATED, `PlatformAuditLogs`.
- *Export CSV* → `PlatformAuditLogs`.

**Permission.** `tenant.view`; `tenant.suspend`; `plan.manage` (plan change) · **Approval.** —

### Onboard Tenant — `admin/tenants/new`
*Source:* `src/30-entry-admin.html` (section `admin/tenants/new`)
**Purpose.** 5-step wizard: company & legal → plan & modules → admin user → configuration → review & provision.
**Tables.** Primary: `Platform.Tenants`, `Platform.TenantContacts`, `Platform.TenantModules`, `Platform.Subscriptions` · Reads: `Platform.SubscriptionPlans`, `Platform.SubscriptionPlanFeatures`, `Platform.PlatformModulePlans`, `Platform.ChartOfAccountsTemplates`, `Platform.ChartOfAccountsTemplateAccounts`, `Platform.TemplateTaxCodes`, `Platform.TemplateLeaveTypes`, `Platform.TemplateSalaryComponents`, `platform.taxMaster*` · Writes: `Platform.SubscriptionEvents` (CREATED / TRIAL_STARTED, movement NEW), `Platform.TenantAddons`, `Platform.PlatformInvoices` (+ lines, "Generate first invoice Rs 249,990 + 16% PST"), `Platform.PlatformLeads.tenantId` (when from a lead), `Platform.ResellerTenants` (partner-sourced), `Platform.SubscriptionCouponRedemptions`, `Platform.PlatformAuditLogs`; tenant side: `Company.CompanySettings`, `Company.Branches`, `Company.Users`, `Company.UserInvites`, `Company.NumberingSeries`, `Accounting.ChartOfAccounts`, `Accounting.FiscalYears`, `Accounting.FiscalPeriods`, `Tax.TaxCodes`, `HumanResources.LeaveTypes`, `Payroll.SalaryComponents`
**Functions.** Save → `Platform.tenantAddUpdate` · Open → `Platform.getTenantInfo` ‖ Save → `Platform.subscriptionAddUpdate` · Open → `Platform.getSubscriptionInfo`
**Lookups.** `Tenants.industry` → `TenantIndustry` · `Tenants.province` → `Province` · `Tenants.numberFormat` → `NumberFormat` · `Tenants.dataResidency` → `DataResidency` · `Tenants.defaultLanguage` → `DefaultLanguage` · `Tenants.status` → `TenantStatus` · `Tenants.churnReason` → `ChurnReason` · `Subscriptions.billingCycle` → `BillingCycle` · `Subscriptions.paymentMethod` → `DunningCasePaymentMethod` · `Subscriptions.status` → `SubscriptionStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Step 1 Display / Legal name, NTN, STRN, SECP #, Industry, Country, City, Address, Phone, Email | `Tenants.displayName`, `.legalName`, `.ntn`, `.strn`, `.secpRegNo`, `.industry`, `.country`, `.city`, `.province`, `.address`, `.phone`, `.email` | FBR ATL verification **[simulated]**. STRN on file ⇒ `Tenants.salesTaxRegistered` (generated) |
| Tenant code (4–10, permanent) / Subdomain | `Tenants.code`, `Tenants.subdomain` | |
| Step 2 Plan card / module switches / Billing cycle / Start with trial | `Subscriptions.planId`, `TenantModules`, `Subscriptions.billingCycle`, `.amount`, `.trialEndsOn` | add-on modules → `TenantAddons` (e.g. Fixed Assets Rs 2,500) |
| HR modules "Billed per active employee above 50" | `addon` PAYROLL (`billingUnit` EMPLOYEE_MONTH) | |
| Step 3 Owner name, designation, email, mobile, CNIC, language; MFA, invite, SSO | `TenantContacts` OWNER, `Tenants.requireMfa`, `Tenants.allowSso`, `Company.UserInvites` (72 h) | |
| Step 4 Fiscal year start, currency, timezone, number/date format, COA template, data residency | `Tenants.fiscalYearStartMonth`, `.baseCurrency`, `.timezone`, `.numberFormat`, `.dateFormat`, `.coaTemplateId`, `.dataResidency` | |
| Seed tax codes / leave types & salary components | `TemplateTaxCodes`, `TemplateLeaveTypes`, `TemplateSalaryComponents` (latest `seedVersion`) | |
| Number series preview | `Company.NumberingSeries` | |
| Step 5 Review / provisioning checklist | job steps **[simulated]** | |

**Statuses.** PROVISIONING → TRIAL / ACTIVE.
**Actions → effects.** *Provision tenant* → rows above, `PlatformAuditLogs` `tenant.provision`, first `PlatformInvoices` (status OPEN; not for trials), welcome `CommunicationLogs` (template WELCOME).
**Permission.** `tenant.provision` · **Approval.** —

### Tenant 360 — `admin/tenants/view`
*Source:* `src/3A-admin-plus.html` (section `admin/tenants/view`) · `src/9B-admin-plus.js` §2
**Purpose.** One tenant: health, users, usage, billing, flags, integrations, activity; impersonate, change plan, export, suspend.
**Tables.** Primary: `Platform.Tenants` · Reads: `Platform.Subscriptions`, `Platform.TenantAddons`, `Platform.UsageSnapshots`, `Platform.SubscriptionPlanLimits`, `Platform.UsageLimitOverrides`, `Platform.PlatformInvoices`, `Platform.PlatformPayments`, `Platform.DunningCases`, `Platform.DunningPolicies`, `Platform.PlatformModules`, `Platform.FlagTargets`, `Platform.PlatformApiKeys`, `Platform.WebhookEndpoints`, `Platform.WebhookDeliveries`, `Platform.TenantNotes`, `Platform.PlatformAuditLogs`, `Company.Users`, `Company.Roles`, `Company.Branches` · Writes: `Platform.ImpersonationSessions`, `Platform.TenantNotes`, `Platform.Subscriptions` (+ `SubscriptionEvents`), `Platform.BackupRuns` (TENANT_EXPORT), `Platform.Tenants`, `Platform.TenantModules`, `Platform.FlagTargets`, `Platform.PlatformAuditLogs`, `Company.Users`, `Company.UserInvites`
**Functions.** Save → `Platform.tenantAddUpdate` · Open → `Platform.getTenantInfo`
**Lookups.** `Tenants.industry` → `TenantIndustry` · `Tenants.province` → `Province` · `Tenants.numberFormat` → `NumberFormat` · `Tenants.dataResidency` → `DataResidency` · `Tenants.defaultLanguage` → `DefaultLanguage` · `Tenants.status` → `TenantStatus` · `Tenants.churnReason` → `ChurnReason` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Impersonation bar (user, read-only, countdown, End session) | `ImpersonationSessions.targetUserLabel`, `.isReadOnly`, `.expiresAt`, `.endedAt` | |
| Profile meta: Region, NTN, STRN, Created, Workspace, Account manager | `Tenants.province/city`, `.ntn`, `.strn`, `.createdAt`, `.subdomain`, `accountOwnerStaffId` | |
| Health ring + "Likely to expand" + six factor bars | `Tenants.healthScore`, `Tenants.healthFactors` | |
| Usage this cycle (Users, Invoices/month, Storage, API calls) | latest `UsageSnapshots.usedValue` / `limitValue` | `getCurrentUsage` |
| Subscription card: price, next renewal, seats, add-ons, payment, lifetime value | `subscription.*`, `TenantAddons` (+ `Addons.name`, `unitPrice`), `Subscriptions.paymentRef`, Σ paid `PlatformPayments` | |
| Notes (add) | `TenantNotes.body`, `.authorStaffId`, `.createdAt` | |
| Users tab: User / Role / Branch / MFA (On / Re-enrol / Pending / Off) / Last sign-in / Status | `Company.Users`, `Company.UserRoles`, `Company.UserBranches`, `Company.UserMfaMethods`, `Company.UserSessions` | |
| Invite drawer: name, email, role, branch, language, send now, MFA, copy owner | `Company.UserInvites` / `Company.Users` | over the seat limit, bills `SubscriptionPlans.extraSeatPrice` (Rs 499/mo) |
| Usage tab: 6 meters with 6-month bars (Users, Invoices/month, Storage, API calls, SMS, FBR submissions) | `UsageSnapshots` per `UsageMeters` | |
| Billing tab: Invoice / Period / Issued / Amount / PST 16% / Status | `PlatformInvoices.docNo`, `periodStart..end`, `issuedOn`, `netAmount`, `taxAmount`, `status` | |
| Payment methods (Primary / Backup) | `Subscriptions.paymentMethod/paymentRef` + the wallet used by `DunningAttempts` | backup method list **[simulated]** |
| Dunning state Paid → Grace → Read-only → Suspended; balance, due, failed attempts | `DunningCases.stage`, `PlatformInvoices.balanceAmount`, `.dueOn`, `DunningCases.attemptsCount`, `DunningPolicies` | |
| Feature flags tab: Modules (Included / Add-on / Upgrade lock) | `PlatformModules` + `PlatformModulePlans` + `TenantModules` + `TenantAddons` | |
| Beta & rollouts toggles | `FlagTargets` (tenant pinned to a variation, PRODUCTION) | |
| Integrations tab: API keys (masked, scopes, created, last used, Reveal / Copy) and webhooks with success % | `PlatformApiKeys.*`, `WebhookEndpoints.url/events`, success % from `WebhookDeliveries` | |
| Activity & audit (Admin / Tenant / Billing / Security) | `PlatformAuditLogs` (`category`) for the tenant | |

**Statuses.** tenant ACTIVE ⇄ SUSPENDED; impersonation live → ended (MANUAL / EXPIRED / REVOKED).
**Actions → effects.**
- *Impersonate* (reason required, ticket, 30/60 min, read-only) → `ImpersonationSessions` and `PlatformAuditLogs` `impersonation.start` (RECORDED); owner email. *End session* → `endedAt`, `PlatformAuditLogs` `impersonation.end`.
- *Change plan* → `subscription` + `SubscriptionEvents` + PRORATION invoice ("Credit for unused Growth − Rs 111,775 · Due today Rs 157,820").
- *Export data* → `BackupRuns` (TENANT_EXPORT, ZIP/CSV/JSON, `downloadExpiresAt` +24 h, `notifyOwner`).
- *Suspend* (type ALNOOR) → `Tenants.status`, `suspendedAt`, `PlatformAuditLogs`; sessions revoked.
- *Reveal key* → `PlatformAuditLogs` `apiKey.reveal`.
- *Module / beta toggle* → `TenantModules` / `FlagTargets` (+ `FlagAuditLogs`).
- *Add note* → `TenantNotes`.

**Permission.** `tenant.view`, `tenant.impersonate`, `tenant.suspend`, `plan.manage` · **Approval.** —

### Templates — `admin/templates`
*Source:* `src/30-entry-admin.html` (section `admin/templates`)
**Purpose.** COA templates and Pakistan master seeds (tax codes, leave types, salary components) copied at provisioning.
**Tables.** Primary: `Platform.ChartOfAccountsTemplates`, `Platform.ChartOfAccountsTemplateAccounts`, `Platform.TemplateTaxCodes`, `Platform.TemplateLeaveTypes`, `Platform.TemplateSalaryComponents` · Reads: `Platform.Tenants` · Writes: same + `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.chartOfAccountsTemplateAddUpdate` · Open → `Platform.getChartOfAccountsTemplateInfo` ‖ Save → `Platform.templateTaxCodeAddUpdate` · Open → `Platform.getTemplateTaxCodeInfo` ‖ Save → `Platform.templateLeaveTypeAddUpdate` · Open → `Platform.getTemplateLeaveTypeInfo` ‖ Save → `Platform.templateSalaryComponentAddUpdate` · Open → `Platform.getTemplateSalaryComponentInfo`
**Lookups.** `ChartOfAccountsTemplates.status` → `ChartOfAccountsTemplateStatus` · `ChartOfAccountsTemplateAccounts.nature` → `Nature` · `TemplateTaxCodes.taxKind` → `TaxKind` · `TemplateLeaveTypes.genderRestriction` → `GenderRestriction` · `TemplateSalaryComponents.componentKind` → `TemplateSalaryComponentKind` · `TemplateSalaryComponents.calcMethod` → `TemplateSalaryComponentCalcMethod` · `TemplateSalaryComponents.statutoryCode` → `StatutoryCode` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Template card: icon, name, version · accounts, badge, description, tenants, Preview | `ChartOfAccountsTemplates.icon`, `.name`, `.version`, count of accounts, `.status`, `.description`, count of `Tenants.coaTemplateId` | |
| Preview tree | `ChartOfAccountsTemplateAccounts.code/name/level/getParentAccountCode/nature` | |
| Tax codes tab: code, description, rate | `TemplateTaxCodes.code`, `.description`, `.rate` / `.rateNote` | GST-18, GST-0, GST-EX, FT-4, WHT-153A/B/C, ADV-236G/H |
| Leave types tab: name, rule, days | `TemplateLeaveTypes.name`, `accrualPerMonth` / `carryForwardMax` / `ruleNote`, `daysPerYear` | |
| Salary tab: name, rule, Earning / Deduction | `TemplateSalaryComponents.name`, `pctOfBasic` / `ruleNote`, `componentKind` | |
| "Pakistan · v2026.2" | `seedVersion` | |

**Statuses.** ChartOfAccountsTemplates DRAFT → PUBLISHED → DEFAULT → RETIRED.
**Actions → effects.** *Import from Excel* → `ChartOfAccountsTemplateAccounts` · *New template* → DRAFT copy · *Edit* · all write `PlatformAuditLogs`.
**Permission.** `template.edit` · **Approval.** —

---

## Growth

### SaaS Analytics — `admin/analytics`
*Source:* `src/3A-admin-plus.html` (section `admin/analytics`) · `src/9B-admin-plus.js` §4
**Purpose.** Recurring revenue, retention, acquisition efficiency and cohorts (PKR, excl. tax); 1M / 3M / 6M / 12M periods.
**Tables.** View-based. Reads: `Platform.getMrrByMonth`, `Platform.getMrrMovement`, `Platform.getSaasKpis`, `Platform.getTrialFunnel`, `Platform.getChurnReasons`, `Platform.getCohortRetention` (over `subscription`, `SubscriptionEvents`, `tenant`, `lead`, `PlatformLeadActivities`, `plan`) · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Hero MRR · ARR · Net new · sparkline | `vMrrMonthly.mrr` (12 months) | |
| NRR / GRR | `vSaasKpi.nrrPct`, `.grrPct` | (start + expansion − contraction − churn) ÷ start, annualised |
| Logo churn / ARPU / LTV : CAC / CAC payback | `vSaasKpi.logoChurnPct`, `.arpu`, `.ltv`, `.cac`, `.cacPaybackMonths` | CAC needs sales & marketing spend, which is not modelled **[simulated]**. LTV = ARPU × 82% gross margin ÷ churn (margin is a constant) |
| MRR movement waterfall (Starting, New, Expansion, Contraction, Churn, Ending) | `getMrrMovement` | `SubscriptionEvents.movement`, `mrrDelta` |
| Trial → paid funnel (visitors, sign-ups, trials, engaged, paid) | `getTrialFunnel` | website visitors are external analytics **[simulated]**. Sign-ups = `lead` created, trials = TRIAL stage reached, engaged = `trialEngagementScore ≥ 60`, paid = PAID |
| MRR by plan stacked bars | `getMrrByMonth` by `planCode` | |
| Why tenants churn donut | `getChurnReasons` from `Tenants.churnReason` | |
| Cohort retention heatmap (M0–M11) | `getCohortRetention` (cohort = month of `Tenants.activatedAt`) | |

**Statuses.** —
**Actions → effects.** *Board pack* → PDF export.
**Permission.** `tenant.view` (Super Admin, Billing in practice) · **Approval.** —

### Leads CRM — `admin/leads`
*Source:* `src/3A-admin-plus.html` (section `admin/leads`) · `src/9B-admin-plus.js` §8
**Purpose.** Drag-and-drop pipeline Lead → Demo booked → Trial → Paid → Churned with expected MRR.
**Tables.** Primary: `Platform.PlatformLeads`, `Platform.PlatformLeadActivities` · Reads: `Platform.PlatformStaff`, `Platform.SubscriptionPlans`, `Platform.Resellers` · Writes: `Platform.PlatformLeads`, `Platform.PlatformLeadActivities`
**Functions.** Save → `Platform.platformLeadAddUpdate` · Open → `Platform.getPlatformLeadInfo`
**Lookups.** `PlatformLeads.source` → `PlatformLeadSource` · `PlatformLeads.stage` → `PlatformLeadStage` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Stats: Pipeline value, Leads / Demos / Trials / Paid with step conversion, Win rate | `getPlatformLeadPipeline` | from `PlatformLeads.stage` and stage history in `PlatformLeadActivities` |
| Owner avatar filter · search company or city | `PlatformLeads.ownerStaffId`, `PlatformLeads.companyName`, `PlatformLeads.city` | |
| Column header count + "Rs …/mo" | count, Σ `PlatformLeads.expectedMrr` per `stage` | |
| Card: company, city, source, note, owner, plan pill, value | `PlatformLeads.companyName`, `.city`, `.source`, `.notes` / `.lostReason`, `.ownerStaffId`, `.planInterestId`, `.expectedMrr` | |
| Trial card: engagement score, days left | `PlatformLeads.trialEngagementScore`, `PlatformLeads.trialEndsOn` | |
| New lead modal: Company *, Contact person, Phone, City, Source, Owner, Plan interest, Expected MRR, Notes | `PlatformLeads.companyName`, `.contactPerson`, `.phone`, `.city`, `.source`, `.ownerStaffId`, `.planInterestId`, `.expectedMrr`, `.notes` | |

**Statuses.** LEAD → DEMO → TRIAL → PAID; any → CHURNED (undo allowed).
**Actions → effects.** *Drag / Move to …* → `PlatformLeads.stage`, `PlatformLeads.boardPosition`, and `PlatformLeadActivities` STAGE_CHANGE. TRIAL sets `trialStartedOn/endsOn`, PAID sets `wonAt` and prompts *Onboard* (→ `admin/tenants/new`, which links `PlatformLeads.tenantId`). *Delete lead* → `PlatformLeads.deletedAt`.
**Permission.** `tenant.view` · **Approval.** —

### Partners & Coupons — `admin/partners`
*Source:* `src/3A-admin-plus.html` (section `admin/partners`) · `src/9B-admin-plus.js` §7
**Purpose.** Reseller network with commission payouts, and campaign discount codes.
**Tables.** Primary: `Platform.Resellers`, `Platform.ResellerTenants`, `Platform.ResellerPayouts`, `Platform.SubscriptionCoupons`, `Platform.SubscriptionCouponPlans` · Reads: `Platform.SubscriptionCouponRedemptions`, `Platform.Subscriptions`, `Platform.Tenants`, `Platform.SubscriptionPlans` · Writes: same + `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.resellerAddUpdate` · Open → `Platform.getResellerInfo` ‖ Save → `Platform.resellerPayoutAddUpdate` · Open → `Platform.getResellerPayoutInfo` ‖ Save → `Platform.subscriptionCouponAddUpdate` · Open → `Platform.getSubscriptionCouponInfo`
**Lookups.** `Resellers.tier` → `Tier` · `Resellers.payoutMethod` → `PayoutMethod` · `Resellers.status` → `ResellerStatus` · `ResellerPayouts.status` → `ResellerPayoutStatus` · `SubscriptionCoupons.discountType` → `DiscountType` · `SubscriptionCoupons.duration` → `SubscriptionCouponDuration` · `SubscriptionCoupons.status` → `SubscriptionCouponStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Partners / Tenants via partners / Partner-sourced MRR / Commission due "payout run on 05 Oct · WHT 12% u/s 233" | counts by `Resellers.tier`, count `ResellerTenants`, Σ `Subscriptions.mrrAmount`, Σ `partnerPayout.net/gross` DUE | `getResellerCommissions` |
| Partner card: name, city, tier, tenants, commission %, their MRR, progress to next tier, payout due | `Resellers.name`, `.city`, `.tier`, count `ResellerTenants`, `.commissionPct`, MRR, `.nextTierTenants`, `ResellerPayouts.grossAmount` | |
| Statement drawer: gross, WHT 12% u/s 233, net; lines Tenant/Plan/MRR/Commission; Pay to IBAN; IBFT; NTN | `ResellerPayouts.grossAmount`, `.whtRate`, `.whtAmount`, `.netAmount`, `.statementLines`, `Resellers.ibanMasked`, `.payoutMethod`, `.ntn`, `.isActiveTaxpayer` | |
| Coupon generator: Code (Shuffle), Percent / Flat, Value, Duration, Redemption cap, Starts, Expires, Applies to plans, New customers only, Stackable with partner | `SubscriptionCoupons.code`, `.discountType`, `.discountValue`, `.duration`, `.redemptionCap`, `.startsOn`, `.expiresOn`, `SubscriptionCouponPlans`, `.newCustomersOnly`, `.stackableWithPartner` | code 4–24 `[A-Z0-9-]`, unique case-insensitive |
| Ticket preview + "Est. discount cost at 35% redemption" | computed in UI | **[simulated]** |
| All coupons: Code / Discount / Duration / Plans / Redemptions n / cap / Expires / Status | `coupon.*`, count `SubscriptionCouponRedemptions`, `SubscriptionCoupons.status` | |

**Statuses.** partner ACTIVE / SUSPENDED / TERMINATED · payout DUE → PAID · coupon SCHEDULED → ACTIVE ⇄ PAUSED → EXPIRED (delete = `deletedAt`).
**Actions → effects.**
- *Mark as paid* → `ResellerPayouts.status = 'PAID'`, `paidOn`, `paymentRef`, `whtCertificateNo`. This is a Finsoft expense, not tenant GL (see posting-platform).
- *Email PDF* → `statementEmailedAt`.
- *Create coupon* → `coupon` + `SubscriptionCouponPlans`.
- *Pause / Resume / Delete* → `SubscriptionCoupons.status` / `deletedAt`. Existing redemptions keep their discount.
- *Partner invite link* → `Resellers.inviteCode`.

**Permission.** `plan.manage` · **Approval.** —

---

## Billing

### Plans & Pricing — `admin/plans`
*Source:* `src/30-entry-admin.html` (section `admin/plans`, modal `adm-edit-plan`)
**Purpose.** Public price book and feature matrix.
**Tables.** Primary: `Platform.SubscriptionPlans`, `Platform.SubscriptionPlanFeatures` · Reads: `Platform.Subscriptions`, `Platform.SubscriptionPlanLimits`, `Platform.PlatformModulePlans` · Writes: `Platform.SubscriptionPlans`, `Platform.SubscriptionPlanFeatures`, `Platform.SubscriptionPlanLimits`, `Platform.EntitlementChangeLogs`, `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.subscriptionPlanAddUpdate` · Open → `Platform.getSubscriptionPlanInfo`
**Lookups.** `SubscriptionPlans.status` → `SubscriptionPlanStatus` · `SubscriptionPlans.supportChannel` → `SupportChannel` · `SubscriptionPlanFeatures.moduleKey` → `ModuleKey` · `SubscriptionPlanFeatures.inclusion` → `Inclusion` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Card name, tenants badge, price, tagline | `SubscriptionPlans.name`, live `subscription` count, `SubscriptionPlans.priceMonthly` / `priceAnnual`, `SubscriptionPlans.tagline` | Enterprise "Custom" = `SubscriptionPlans.isCustomPrice` |
| Bullets: users, storage, support "Email support (48h)", "99.95% SLA" | `SubscriptionPlans.userSeats`, `.storageGb`, `.supportChannel`, `.supportResponseHours`, `.slaUptimePct` | |
| Feature matrix (GL, bank, invoicing, GST/WHT, inventory, payroll, attendance, ESS, fixed assets, recruitment, multi-branch, FBR POS, Report Studio, SAML SSO, dedicated DB) | `SubscriptionPlanFeatures` (module rows) + `PlatformModulePlans` (feature rows) | |
| Edit plan modal: name, monthly, annual, seats, storage, trial, tagline, included modules | `plan.*`, `SubscriptionPlanFeatures.inclusion`; seats and storage are also mirrored into `SubscriptionPlanLimits` (USERS / STORAGE_GB) | |
| Grandfathering banner | `EntitlementChangeLogs.grandfatherUntilRenewal` | |
| Price history | `PlatformAuditLogs` `plan.update` | |

**Statuses.** ACTIVE → RETIRED.
**Actions → effects.** *Save plan* → `plan` / `SubscriptionPlanFeatures`, and `PlatformAuditLogs`. Existing `Subscriptions.amount` is unchanged until renewal.
**Permission.** `plan.manage` · **Approval.** —

### Subscriptions — `admin/subscriptions`
*Source:* `src/30-entry-admin.html` (section `admin/subscriptions`)
**Purpose.** Billing cycles, renewals and payment methods; trials expiring; MRR movement.
**Tables.** Primary: `Platform.Subscriptions`, `Platform.SubscriptionEvents` · Reads: `Platform.Tenants`, `Platform.SubscriptionPlans`, `Company.Users`, views `Platform.getSubscriptionKpis`, `Platform.getMrrMovement` · Writes: `Platform.Subscriptions`, `Platform.SubscriptionEvents`, `Platform.PlatformInvoices`, `Platform.PlatformPayments`, `Platform.DunningCases`, `Platform.CommunicationLogs`, `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.subscriptionAddUpdate` · Open → `Platform.getSubscriptionInfo`
**Lookups.** `Subscriptions.billingCycle` → `BillingCycle` · `Subscriptions.paymentMethod` → `DunningCasePaymentMethod` · `Subscriptions.status` → `SubscriptionStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs MRR / Annual contracts 71% / Renewals in 30 days (Rs at stake) / Past due | `getSubscriptionKpis` | |
| Tenant / Plan / Cycle / Amount / Next renewal / Payment method / Status | `Tenants.displayName/code`, `SubscriptionPlans.name`, `Subscriptions.billingCycle`, `.amount`, `.nextRenewalOn`, `.paymentMethod` + `.paymentRef`, `.status` | "New" = no payment method yet |
| Trials expiring (14 days) | `Subscriptions.trialEndsOn`, users active | |
| MRR movement — Sep | `getMrrMovement` | |

**Statuses.** TRIAL → ACTIVE ⇄ PAST_DUE → SUSPENDED → CANCELLED / EXPIRED; `cancelAtPeriodEnd`.
**Actions → effects.**
- *Run renewals* → for each due subscription: a `PlatformInvoices` (SUBSCRIPTION) and a charge `PlatformPayments`. Success advances the period and writes `SubscriptionEvents` RENEWED. Failure: subscription PAST_DUE, `DunningCases` opened ("47 renewals processed · 45 charged, 2 retrying").
- *Retry charge* → `PlatformPayments` / `DunningAttempts` (MANUAL).
- *Change plan* → link to owner.
- *Cancel* → `cancelAtPeriodEnd = true`, `SubscriptionEvents` CANCEL_SCHEDULED.
- *Send conversion reminders* → `CommunicationLogs` (TRIAL_ENDING).

**Permission.** `plan.manage`, `dunning.run` · **Approval.** —

### Platform Invoices — `admin/invoices`
*Source:* `src/30-entry-admin.html` (section `admin/invoices`, row drawer)
**Purpose.** Invoices Finsoft Cloud issues to tenants, with provincial sales tax on services.
**Tables.** Primary: `Platform.PlatformInvoices`, `Platform.PlatformInvoiceLines` · Reads: `Platform.Tenants`, `Platform.TaxMasterAuthorities`, `Platform.PlatformPayments`, view `Platform.getPlatformBillingByMonth` · Writes: `Platform.PlatformInvoices`, `Platform.PlatformPayments`, `Platform.CommunicationLogs`, `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.platformInvoiceAddUpdate` · Open → `Platform.getPlatformInvoiceInfo` · Actions → `Platform.platformInvoiceVoid`
**Lookups.** `PlatformInvoices.invoiceKind` → `InvoiceKind` · `PlatformInvoices.status` → `PlatformInvoiceStatus` · `PlatformInvoiceLines.lineKind` → `LineKind` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Billed (Sep) incl. tax / Collected 94.3% / Open (12) / Overdue > 7 days | `vBillingKpi.billed`, `.billedTax`, `.collected`, `.collectionRatePct`, `.openAmount`, `.overdueAmount` | |
| Search invoice # / tenant · month select · chips All / Paid / Open / Overdue / Void | `PlatformInvoices.docNo`, `Tenants.displayName`, `issuedOn`, `status` (Overdue derived) | |
| Invoice # | `PlatformInvoices.docNo` | FS-INV-YYYY-NNNNN |
| Tenant / Description | `Tenants.displayName`, `PlatformInvoices.description` | |
| Issued / Due | `.issuedOn`, `.dueOn` | |
| Subtotal / Tax / Total | `.netAmount`, `.taxAmount` (rate `.taxRate` per `TaxMasterAuthorities`), `.totalAmount` | |
| Status Open / Paid / Partially paid / Overdue / Void | `.status` + derived OVERDUE (`dueOn < today AND balanceAmount > 0`) | |
| Drawer timeline Issued (emailed) / Due | `.issuedOn`, `.emailedAt`, `.dueOn` | |

**Statuses.** DRAFT → OPEN → PARTIALLY_PAID → PAID · OVERDUE (derived) · VOID · UNCOLLECTIBLE.
**Actions → effects.**
- *Manual invoice* → DRAFT `PlatformInvoices` (kind MANUAL) + lines.
- *PDF* → download.
- *Remind* → `CommunicationLogs` (template INVOICE / PAYMENT_FAILED), `lastReminderAt`.
- *Mark paid* → `PlatformPayments` SUCCEEDED (manual, `recordedByStaffId`). A trigger updates `paidAmount` / `status`.
- *Void* → `status = 'VOID'`, `voidReason`, and `PlatformAuditLogs` `invoice.void`.
- *Export* → file.

**Permission.** `invoice.issue_void` · **Approval.** —

### Dunning & Collections — `admin/dunning`
*Source:* `src/3A-admin-plus.html` (section `admin/dunning`) · `src/9B-admin-plus.js` §5
**Purpose.** Failed payments, smart retries (card → JazzCash → Raast), promise-to-pay, grace → read-only → suspend policy and reminder channels.
**Tables.** Primary: `Platform.DunningCases`, `Platform.DunningAttempts`, `Platform.DunningPolicies` · Reads: `Platform.PlatformInvoices`, `Platform.Tenants`, `Platform.CommunicationTemplates`, view `Platform.getCollectionsQueue` · Writes: `Platform.DunningCases`, `Platform.DunningAttempts`, `Platform.PlatformPayments`, `Platform.DunningPolicies`, `Platform.Tenants` (READ_ONLY / SUSPENDED), `Platform.Subscriptions`, `Platform.CommunicationLogs`, `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.dunningCaseAddUpdate` · Open → `Platform.getDunningCaseInfo` ‖ Save → `Platform.dunningPolicyAddUpdate` · Open → `Platform.getDunningPolicyInfo`
**Lookups.** `DunningCases.stage` → `DunningCaseStage` · `DunningCases.paymentMethod` → `DunningCasePaymentMethod` · `DunningCases.nextRetryMethod` → `NextRetryMethod` · `DunningCases.promiseSource` → `PromiseSource` · `DunningAttempts.method` → `DunningAttemptMethod` · `DunningAttempts.status` → `DunningAttemptStatus` · `DunningAttempts.triggeredBy` → `TriggeredBy` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Recovered this month / Recovery rate (30 d) / In dunning (n, outstanding) / Churn saved | `getDunningKpis` | recovered = Σ `DunningCases.amountDue` RECOVERED this month; rate = SUCCEEDED ÷ executed `DunningAttempts` |
| Bucket seg 1–7 / 8–14 / 15–30 / 30+ days | `getCollectionsQueue.daysOverdue` (today − `PlatformInvoices.dueOn`) | |
| Tenant · invoice · days overdue | `Tenants.displayName`, `PlatformInvoices.docNo`, derived | |
| Amount / Method | `DunningCases.amountDue`, `DunningCases.paymentMethod` | |
| Attempts n/4 · next retry | `DunningCases.attemptsCount`, `.nextRetryAt`, `.nextRetryMethod`, `.retriesPaused` | |
| Stage Grace / Read-only / Suspended / Collections / Promise · date / Recovered | `DunningCases.stage` | stage follows `DunningPolicies` thresholds |
| Retry plan timeline (Day 0 … Day 7) | `DunningAttempts.planDay`, `.label`, `.method`, `.status` | |
| Policy: Grace (days), Read-only (days), Suspended before cancel, sentence | `DunningPolicies.graceDays`, `.readOnlyDays`, `.suspendedDays`, `.archiveDays` | |
| Reminder channels Email / SMS / WhatsApp, D−3 … D+14 chips, EN/UR text | `DunningPolicies.emailEnabled/offsets`, `sms*`, `whatsapp*`; text from `CommunicationTemplates` PAYMENT_FAILED | |
| Promise modal: date, amount, logged from, note, pause retries, lift read-only, remind owner | `DunningCases.promiseDate`, `.promiseAmount`, `.promiseSource`, `.promiseNote`, `.retriesPaused`, `.promiseLiftReadOnly`, `.promiseRemindOwner` | |

**Statuses.** GRACE → READ_ONLY → SUSPENDED → COLLECTIONS; PROMISE (any open stage); RECOVERED / CANCELLED / WRITTEN_OFF (closed).
**Actions → effects.**
- *Retry* / *Retry all due* → `DunningAttempts` (MANUAL / BATCH) + `PlatformPayments`.
- Success → case RECOVERED (`recoveredPaymentId`), invoice PAID (trigger), tenant back to ACTIVE, `PlatformAuditLogs` `payment.charge`.
- Failure → `attemptsCount`+1, `lastFailureReason`.
- *Log promise* → stage PROMISE.
- *Save policy* → new active `DunningPolicies` (applies to new failures).
- Stage escalation → `Tenants.status` READ_ONLY / SUSPENDED + `Subscriptions.status`.

**Permission.** `dunning.run` · **Approval.** —

### Usage & Quotas — `admin/usage`
*Source:* `src/3A-admin-plus.html` (section `admin/usage`) · `src/9B-admin-plus.js` §6
**Purpose.** Metered usage against plan limits for every tenant; overrides; alert rules.
**Tables.** Primary: `Platform.UsageSnapshots`, `Platform.UsageLimitOverrides`, `Platform.UsageAlertRules` · Reads: `Platform.UsageMeters`, `Platform.SubscriptionPlanLimits`, `Platform.Tenants`, `Platform.Subscriptions`, `Platform.Addons`, view `Platform.getCurrentUsage` · Writes: `Platform.UsageLimitOverrides`, `Platform.UsageAlertRules`, `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.usageLimitOverrideAddUpdate` · Open → `Platform.getUsageLimitOverrideInfo` ‖ Save → `Platform.usageAlertRuleAddUpdate` · Open → `Platform.getUsageAlertRuleInfo`
**Lookups.** `UsageLimitOverrides.expiryMode` → `ExpiryMode` · `UsageLimitOverrides.billOverage` → `BillOverage` · `UsageAlertRules.action` → `UsageAlertRuleAction` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Over quota / Near limit (≥ 80%) / API calls MTD / SMS sent MTD (Rs 0.62 per SMS) | `getCurrentUsage` worst meter per tenant; Σ `UsageSnapshots` API_CALLS_MONTH / SMS_MONTH; SMS cost from `CommunicationLogs.costAmount` | |
| Chips All / Near limit / At-over limit; sortable meter columns | `vUsageCurrent.pct` | |
| Per-tenant meters Users / Invoices/mo / Storage / API calls / SMS / FBR submissions, override tag | `UsageSnapshots.usedValue` ÷ effective limit (`UsageLimitOverrides.limitValue` else `SubscriptionPlanLimits.limitValue`) | amber ≥ 80%, red 100%, striped > 100% |
| Top consumers (API / Storage / SMS / Invoices) with share % | `UsageSnapshots` ranked | |
| Override modal: Meter, Current limit, New limit *, Expires, Bill overage, Reason * | `UsageLimitOverrides.usageMeterId`, `.previousLimit`, `.limitValue`, `.expiryMode`/`.expiresOn`, `.billOverage`/`.customPrice`, `.reason` | |
| Alert rules list (condition, action, on/off) + New rule (Meter, Threshold 50–150%, Plans, Action) | `UsageAlertRules.usageMeterId`, `.thresholdPct`, `.planId`, `.action`, `.actionDetail`, `.isEnabled` | "Would fire for n tenants today" = live preview |

**Statuses.** override live → revoked/expired · rule enabled ⇄ paused.
**Actions → effects.** *Apply override* → `UsageLimitOverrides` (the previous live one is revoked) · *Create rule* / toggle → `UsageAlertRules`. The rule engine every 15 min → `CommunicationLogs` / throttle / in-app offer.
**Permission.** `plan.manage` · **Approval.** —

---

## Feature management

### Feature Flags — `admin/features`
*Source:* `src/3B-flags.html` (section `admin/features`) · `src/9J-flags.js` §1 (+ Core modules tab, SDK keys tab, New flag wizard)
**Purpose.** Release / kill / ops / experiment / entitlement flags across Dev, Staging, Production; core module switches; SDK keys.
**Tables.** Primary: `Platform.FeatureFlags`, `Platform.FlagVariations`, `Platform.FlagEnvironments`, `Platform.FlagDefaultRules`, `Platform.PlatformModules`, `Platform.PlatformModulePlans`, `Platform.FlagSdkKeys` · Reads: `Platform.FlagChangeRequests`, `Platform.FlagPrerequisites`, `Platform.FlagDailyEvaluations`, `Platform.PlatformStaff`, view `Platform.getFeatureFlagSummary` · Writes: same + `Platform.FlagAuditLogs`, `Platform.FlagChangeRequests`, `Platform.FlagChangeRequestApprovers`, `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.featureFlagAddUpdate` · Open → `Platform.getFeatureFlagInfo` ‖ Save → `Platform.platformModuleAddUpdate` · Open → `Platform.getPlatformModuleInfo` ‖ Save → `Platform.flagSdkKeyAddUpdate` · Open → `Platform.getFlagSdkKeyInfo`
**Lookups.** `FeatureFlags.flagType` → `FlagType` · `FeatureFlags.secondaryType` → `SecondaryType` · `FeatureFlags.category` → `FeatureFlagCategory` · `FeatureFlags.stage` → `FeatureFlagStage` · `FeatureFlags.variationKind` → `VariationKind` · `FlagEnvironments.environment` → `DevStagingProductionEnvironment` · `PlatformModules.kind` → `PlatformModuleKind` · `PlatformModules.entGroup` → `EntGroup` · `PlatformModules.moduleKey` → `ModuleKey` · `FlagSdkKeys.environment` → `DevStagingProductionEnvironment` · `FlagSdkKeys.kind` → `FlagSdkKeyKind` · `FlagSdkKeys.status` → `FlagSdkKeyStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Total flags (temporary · permanent) / Active in Production / Stale / Pending approvals / Kill switches | `getFeatureFlagSummary` aggregates; `FeatureFlags.isTemporary`, `FlagEnvironments.isOn`, `.staleReason`, `FlagChangeRequests` PENDING, `flagType = 'KILL'` | |
| Environment switch Dev / Staging / Production · "n of N serving" · server SDK key pill | `FlagEnvironments.environment/isOn`; `FlagSdkKeys` (SERVER, ACTIVE) masked | |
| Filters: search key/name/tag, type, owner, stale only, category chips, lifecycle chips | `FeatureFlags.key`, `.name`, `.description`, `.tags`, `.flagType`/`.secondaryType`, `.ownerStaffId`, `.staleReason`, `.category`, `.stage` | archived hidden unless chosen |
| Flag cell: icon, key, Pending badge, Stale, name, description | `FeatureFlags.*`, pending CR | |
| Type (+ secondary) · category | `.flagType`, `.secondaryType`, `.category` | |
| Lifecycle | `.stage` | |
| Envs D·S·P dots | `FlagEnvironments.isOn` × 3 + pending CR | |
| Rollout bar % / "By plan" / "n tenants" / "Global" + segment tag | `FlagDefaultRules.rolloutPct` (when ROLLOUT), entitlement → `PlatformModulePlans`, `FlagTargets` count, segment rule | |
| Prerequisites chips | `FlagPrerequisites.prerequisiteFlagId → key` / `prerequisiteModuleId → PlatformModules.key` | |
| Owner / Last evaluated · evals/24h | `.ownerStaffId`, `FlagEnvironments.lastEvaluatedAt`, Σ `FlagDailyEvaluations` | |
| Production switch | `FlagEnvironments.isOn` | |
| Core modules tab: Module, Key, Tenants using, Minimum plan, per-plan switches, Enabled | `PlatformModules.name`, `.key`, count `TenantModules`, `.minPlanId`, `PlatformModulePlans.isIncluded`, `.isEnabled`, `.isCore` | |
| SDK keys tab: Server key (secret) / Client-side ID / Mobile key per env, evaluations today, rotated n days ago | `FlagSdkKeys.kind`, `.keyPrefix…keyLast4` / `.clientId`, `.status`, `.createdAt`; evals from `FlagDailyEvaluations` | |
| New flag wizard: Type → Name, Key (snake_case, unique, immutable), Category, Tags, Description → Boolean / Multivariate variations → Owner, Expiry, Temporary → Review | `FeatureFlags.flagType`, `.name`, `.key`, `.category`, `.tags`, `.description`, `FlagVariations (idx, name, value)`, `.ownerStaffId`, `.expiresOn`, `.isTemporary` | created OFF in all 3 envs (`FlagEnvironments` × 3, `FlagDefaultRules` × 3) |

**Statuses.** stage DEFINE → DEVELOP → PRODUCTION → CLEANUP → ARCHIVED (restore → CLEANUP).
**Actions → effects.**
- *Toggle* in Dev/Staging → `FlagEnvironments.isOn` and `FlagAuditLogs`.
- *Toggle* in Production → `FlagChangeRequests` (PENDING) + `FlagChangeRequestApprovers`.
- *Kill switch* (type the key) → `isOn` immediately and `FlagAuditLogs` with `isEmergency`. On-call is paged.
- *Duplicate* → new flag `<key>Copy`, OFF everywhere.
- *Archive* → `stage = 'ARCHIVED'`, `archivedAt`, and `FlagAuditLogs`.
- *Module plan switch / minimum plan / global enable* → `PlatformModulePlans` / `PlatformModules`.
- *Rotate key* → new ACTIVE `FlagSdkKeys`; the old one goes to GRACE for 24 h.

**Permission.** `flag.manage` · **Approval.** Production changes: second approver (change request). Kill switches are exempt.

### Flag Detail — `admin/features/view`
*Source:* `src/3B-flags.html` (section `admin/features/view`) · `src/9J-flags.js` §2
**Purpose.** Targeting of one flag per environment: individual targets, ordered rules, default rule / rollout, off variation, prerequisites, scheduled ramp, insights, audit, code references.
**Tables.** Primary: `Platform.FlagDefaultRules`, `Platform.FlagTargets`, `Platform.FlagRules`, `Platform.FlagPrerequisites`, `Platform.FlagScheduledChanges` · Reads: `Platform.FeatureFlags`, `Platform.FlagVariations`, `Platform.FlagEnvironments`, `Platform.FlagDailyEvaluations`, `Platform.FlagAuditLogs`, `Platform.FlagCodeReferences`, `Platform.TenantSegments`, `Platform.Tenants` · Writes: targeting tables, `Platform.FlagEnvironments`, `Platform.FeatureFlags` (stage), `Platform.FlagAuditLogs`, `Platform.FlagChangeRequests`, `Platform.FlagChangeRequestApprovers`
**Functions.** Save → `Platform.featureFlagAddUpdate` · Open → `Platform.getFeatureFlagInfo`
**Lookups.** `FlagScheduledChanges.environment` → `DevStagingProductionEnvironment` · `FlagScheduledChanges.status` → `FlagScheduledChangeStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Header: name, key (copy), type badges, Temporary / Permanent, Stale | `FeatureFlags.name`, `.key`, `.flagType`, `.secondaryType`, `.isTemporary`, `.staleReason` | |
| Lifecycle stepper | `FeatureFlags.stage` | |
| Env tabs with on / % / pending dot · "n of 128 tenants get On" | `FlagEnvironments.isOn`, `FlagDefaultRules.rolloutPct`, pending CR; served count = live evaluation | |
| Targeting On/Off switch | `FlagEnvironments.isOn` | |
| 1 Individual targets per variation (tenant chips, add tenant…) | `FlagTargets (variationIdx, tenantId)` | one variation per tenant |
| 2 Rules: IF / ELSE IF attribute, operator, values, serve; tenants matched; drag to reorder | `FlagRules.position`, `.attribute` (SEGMENT, PLAN, REGION, CITY, INDUSTRY, AGE_DAYS, USER_ROLE, APP_VERSION, PLATFORM), `.operator` (IN, NOT_IN, GT, LT), `.ruleValues`, `.serveVariationIdx` | attributes resolve to `tenant.*` / `segment` |
| 3 Default rule: Percentage rollout or Serve X; slider, 100 buckets, "Sticky by tenant ID" | `FlagDefaultRules.defaultRule`, `.rolloutPct`, `.rolloutVariationIdx`, `.rolloutRestVariationIdx`, `.defaultVariationIdx`, `.bucketBy` | bucket = hash(tenant.code ‖ '.' ‖ key) % 100 |
| Off variation | `FlagDefaultRules.offVariationIdx` | |
| Prerequisites (flag must serve variation / core module enabled) | `FlagPrerequisites.*` | |
| Scheduled changes ramp (date → %), applied / next | `FlagScheduledChanges.stepDate`, `.rolloutPct`, `.status` | |
| Evaluation insights (14 days, on vs off, errors, p95) | `FlagDailyEvaluations` | |
| Audit log with Show diff | `FlagAuditLogs.summary`, `.environment`, `.changeRequestId`, `.staffUserId`, `.occurredAt`, `.beforeState`, `.afterState` | |
| About: owner, category, created, expiry, last evaluated, tags | `FeatureFlags.*`, `FlagEnvironments.lastEvaluatedAt` | |
| Variations with tenant counts | `FlagVariations` | counts are live evaluation |
| Tenants served (why: target / rule n / rollout bucket / default) | live evaluation over `tenant` | |
| Code references (repo, path:line, snippet) | `FlagCodeReferences` | |
| Save bar "Applies to Dev immediately" / "Review & request approval" | — | |

**Statuses.** flag stage as above; change request PENDING → APPROVED / REJECTED.
**Actions → effects.**
- *Save* (Dev/Staging) → targeting tables + `FlagAuditLogs` TARGETING.
- *Save* (Production) → `FlagChangeRequests` with `beforeState` / `afterState` / `patch`, a reason, approvers and `applyNotBefore`.
- *Stage move* → `FeatureFlags.stage` + `FlagAuditLogs` LIFECYCLE.
- *Add step* → `FlagScheduledChanges`. On its date it opens a CR (`source = 'SCHEDULE_STEP'`).
- *Kill switch* → immediate + `FlagAuditLogs` (`isEmergency` in Production).

**Permission.** `flag.manage` · **Approval.** Production: 1 of N approvers, requester excluded.

### Segments — `admin/segments`
*Source:* `src/3B-flags.html` (section `admin/segments`) · `src/9J-flags.js` §3
**Purpose.** Reusable tenant groups (AND rules, include/exclude) targeted from any flag.
**Tables.** Primary: `Platform.TenantSegments`, `Platform.TenantSegmentRules`, `Platform.SegmentTenants` · Reads: `Platform.Tenants`, `Platform.Subscriptions`, `Platform.FlagRules` (flags using it), `Platform.FeatureFlags` · Writes: same + `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.tenantSegmentAddUpdate` · Open → `Platform.getTenantSegmentInfo`
**Lookups.** `TenantSegments.tone` → `TenantSegmentTone` · `TenantSegmentRules.attribute` → `TenantSegmentRuleAttribute` · `TenantSegmentRules.operator` → `FlagRuleOperator` · `SegmentTenants.membership` → `Membership` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| List card: icon/tone, name, description, member bar + count, flags using | `TenantSegments.icon`, `.tone`, `.name`, `.description`; member count = live evaluation; flags = `FlagRules` where attribute SEGMENT contains `TenantSegments.key` | |
| Editor header: name, description, key `segment.<snake>` | `TenantSegments.name`, `.description`, `.key` | |
| Membership rules (all must match): attribute, operator, values | `TenantSegmentRules.attribute` (PLAN, REGION, CITY, INDUSTRY, AGE_DAYS, SALES_TAX_REGISTERED, BETA, INTERNAL, APP_VERSION, PLATFORM), `.operator`, `.ruleValues`, `.position` | |
| Ring "n of 128 tenants", plan breakdown, matching tenants preview | live evaluation over `tenant` (+ `SegmentTenants` include/exclude) | |
| Flags using this segment | `FlagRules` → `FeatureFlags` | |
| New / Edit modal: name, key (read-only), description, icon & colour, start from Blank / City / Plan | `segment.*`, initial `TenantSegmentRules` | name unique (case-insensitive) |

**Statuses.** active → deleted (`deletedAt`, refused while used by a flag).
**Actions → effects.** *Save segment* (confirm when Production flags use it) → `TenantSegmentRules` replaced. Every flag using it changes audience at once. *Duplicate / Copy key / Delete*.
**Permission.** `flag.manage` · **Approval.** —

### Plan Entitlements — `admin/entitlements`
*Source:* `src/3B-flags.html` (section `admin/entitlements`) · `src/9J-flags.js` §4
**Purpose.** What each plan includes (modules, features, limits, add-ons), kept separate from release flags; impact preview before saving.
**Tables.** Primary: `Platform.PlatformModulePlans`, `Platform.SubscriptionPlanLimits`, `Platform.Addons`, `Platform.AddonPlans`, `Platform.EntitlementChangeLogs` · Reads: `Platform.SubscriptionPlans`, `Platform.PlatformModules`, `Platform.UsageMeters`, `Platform.FeatureFlags`, `Platform.Tenants`, `Platform.Subscriptions`, `Platform.UsageSnapshots`, `Platform.TenantAddons` · Writes: same + `Platform.FlagRules` (plan rule of linked entitlement flags), `Platform.TenantBroadcasts`, `Platform.Announcements`
**Functions.** Save → `Platform.platformModuleAddUpdate` · Open → `Platform.getPlatformModuleInfo` ‖ Save → `Platform.subscriptionPlanAddUpdate` · Open → `Platform.getSubscriptionPlanInfo` ‖ Save → `Platform.addonAddUpdate` · Open → `Platform.getAddonInfo`
**Lookups.** `Addons.billingUnit` → `BillingUnit` · `AddonPlans.availability` → `Availability` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Plan cards: tenants, price, n features, users limit | `plan`, count live subs, `SubscriptionPlans.priceMonthly`, count `PlatformModulePlans.isIncluded`, `SubscriptionPlanLimits` USERS | |
| Feature matrix groups (Core modules, Compliance, Sales & distribution, Inventory, Finance, HR, Platform): feature, key link, ✓ per plan, Core lock | `PlatformModules.entGroup`, `.name`, `.key` / `.featureFlagId`, `PlatformModulePlans.isIncluded`, `.isCore` | |
| Limits (blank = unlimited): Users, Branches, Invoices/month, Storage (GB), API calls/day | `SubscriptionPlanLimits.limitValue` per `UsageMeters` (USERS, BRANCHES, INVOICES_MONTH, STORAGE_GB, API_CALLS_DAY) | |
| Add-ons: price, unit, subscribers, plan availability letters, note | `Addons.price`, `.billingUnit`, `.usagePrice/usageUnit`, count `TenantAddons`, `AddonPlans.availability`, `.note` | |
| Review drawer: n changes, tenants affected, per-change impact (gain / loss / over new limit), Grandfather / Email owners / Post to changelog | `EntitlementChangeLogs` rows of one `changeSetId` (`fromValue`, `toValue`, `tenantsAffected`, `impactTone`, flags) | over-limit tenants come from `UsageSnapshots` |

**Statuses.** —
**Actions → effects.** *Save entitlements* → `PlatformModulePlans` / `SubscriptionPlanLimits` / `addon` updated, one `EntitlementChangeLogs` row per change. The linked entitlement flags get their PLAN rule values rewritten (`FlagRules`, plus `FlagAuditLogs`). Optional owner email (`TenantBroadcasts`) and changelog (`announcement`). Grandfathered tenants keep access until `Subscriptions.nextRenewalOn`.
**Permission.** `plan.manage` · **Approval.** —

### Change Requests — `admin/change-requests`
*Source:* `src/3B-flags.html` (section `admin/change-requests`) · `src/9J-flags.js` §5
**Purpose.** Four-eyes review of Production flag changes: diff, discussion, approve & apply or reject.
**Tables.** Primary: `Platform.FlagChangeRequests`, `Platform.FlagChangeRequestApprovers`, `Platform.FlagChangeRequestComments` · Reads: `Platform.FeatureFlags`, `Platform.PlatformStaff` · Writes: same + targeting tables (on apply), `Platform.FlagEnvironments`, `Platform.FlagAuditLogs`
**Functions.** Save → `Platform.flagChangeRequestAddUpdate` · Open → `Platform.getFlagChangeRequestInfo` · Actions → `Platform.flagChangeRequestApprove`, `Platform.flagChangeRequestCancel`
**Lookups.** `FlagChangeRequests.environment` → `DevStagingProductionEnvironment` · `FlagChangeRequests.source` → `FlagChangeRequestSource` · `FlagChangeRequests.status` → `LeaveRequestStatus` · `FlagChangeRequestApprovers.decision` → `Decision` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Pending / Approved 30 d / Rejected 30 d / Median time to approve | counts by `status`; median(`decidedAt − createdAt`) | `getFlagChangeRequestKpis` |
| Tabs Pending / Approved / Rejected / All | `FlagChangeRequests.status` | |
| Card: CR id, key, env, status, created, requester, summary, flag name, reason, +/− diff, approvers "Needs 1 of N", comments, type | `.docNo`, `FeatureFlags.key`, `.environment`, `.status`, `.createdAt`, `.requesterStaffId`, `.summary`, `.reason`, diff of `beforeState`/`afterState`, `FlagChangeRequestApprovers`, count `FlagChangeRequestComments` | |
| Drawer: diff (targeting.json), approvals list, decision note, discussion, comment box | `.beforeState`, `.afterState`, `FlagChangeRequestApprovers.decision/decidedAt`, `.decidedByStaffId`, `.decisionNote`, `FlagChangeRequestComments.*` | |
| Second-approver note * | `FlagChangeRequests.decisionNote` | required for approve and reject |

**Statuses.** PENDING → APPROVED (applied at once or at `applyNotBefore`) / REJECTED; CANCELLED.
**Actions → effects.** *Approve & apply* → `status`, `decidedBy/at`, `decisionNote`, then `patch` is written into `FlagEnvironments` / `FlagDefaultRules` / `FlagTargets` / `FlagRules` / `FlagPrerequisites`, `appliedAt`, `FlagAuditLogs` CR_APPLIED (via CR). *Reject* → `FlagAuditLogs` CR_REJECTED and the requester is notified. *Post comment* → `FlagChangeRequestComments`.
**Permission.** `flag.manage` · **Approval.** The requester can never approve (CHECK + trigger). One pending CR per flag × environment.

---

## Support

### Support Tickets — `admin/support`
*Source:* `src/30-entry-admin.html` (section `admin/support`, drawer `adm-ticket`)
**Purpose.** Customer issues across tenants, Kanban by status, with SLA (Urgent 2h · High 4h · Normal 8h).
**Tables.** Primary: `Platform.SupportTickets`, `Platform.SupportTicketMessages` · Reads: `Platform.Tenants`, `Platform.Subscriptions`, `Platform.SubscriptionPlans`, `Platform.PlatformStaff`, view `Platform.getSupportTicketKpis` · Writes: same + `Platform.ImpersonationSessions` (via Tenant 360), `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.supportTicketAddUpdate` · Open → `Platform.getSupportTicketInfo`
**Lookups.** `SupportTickets.category` → `SupportTicketCategory` · `SupportTickets.priority` → `SupportTicketPriority` · `SupportTickets.status` → `SupportTicketStatus` · `SupportTickets.channel` → `SupportTicketChannel` · `SupportTicketMessages.authorKind` → `AuthorKind` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Open tickets (unassigned) / First response 38 min / SLA breaches / CSAT 4.7 / 5 (118 ratings) | `getSupportTicketKpis` | `firstResponseAt − openedAt`; breach = past `slaDueAt`; `csatRating` |
| Board / List · search · agent filter · chips All / Urgent / Billing / Payroll / Tax-FBR | `assigneeStaffId`, `priority`, `category` | |
| Columns New / In progress / Waiting on customer / Resolved with counts | `SupportTickets.status` | |
| Card: priority, TCK no, subject, tenant · age or assignee, progress, stars | `.priority`, `.docNo`, `.subject`, `Tenants.displayName`, `.openedAt`, `.assigneeStaffId`, `.csatRating` | |
| Drawer: title, tenant · opened, priority, status, category, "SLA 1h 12m left" | `.docNo`, `.subject`, `.openedAt`, `.priority`, `.status`, `.category`, `.slaDueAt` | |
| Requester · role / Assignee / Plan | `.requesterName`, `.requesterRole`, `.assigneeStaffId`, `SubscriptionPlans.name` | |
| Conversation (author, time, text, internal note) | `SupportTicketMessages.authorName`, `.postedAt`, `.body`, `.isInternalNote` | |
| Reply box · Internal note · Attach | `SupportTicketMessages.body`, `.isInternalNote`, `.attachments` | |

**Statuses.** NEW → IN_PROGRESS ⇄ WAITING_ON_CUSTOMER → RESOLVED → CLOSED.
**Actions → effects.** *New ticket* → `SupportTickets` (`docNo` from `nextDocNo('TCK')`, SLA by trigger) · *Send reply* → `SupportTicketMessages`, the first staff reply sets `firstResponseAt` · *Resolve* → `status`, `resolvedAt`.
**Permission.** `ticket.manage` · **Approval.** —

### Announcements — `admin/announcements`
*Source:* `src/30-entry-admin.html` (section `admin/announcements`, modal `adm-compose`)
**Purpose.** In-app banners and emails to tenant users, targeted by plan, module or tenant.
**Tables.** Primary: `Platform.Announcements`, `Platform.AnnouncementTargets` · Reads: `Platform.SubscriptionPlans`, `Platform.Tenants`, `Platform.MaintenanceWindows` · Writes: same + `Platform.CommunicationLogs` (admin emails)
**Functions.** Save → `Platform.announcementAddUpdate` · Open → `Platform.getAnnouncementInfo`
**Lookups.** `Announcements.announcementType` → `AnnouncementType` · `Announcements.severity` → `AnnouncementSeverity` · `Announcements.audience` → `AnnouncementAudience` · `Announcements.status` → `AnnouncementStatus` · `AnnouncementTargets.moduleKey` → `ModuleKey` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Chips All / Published / Scheduled / Draft · type filter | `Announcements.status`, `.announcementType` | |
| Card: type/release badge, status, date · audience, title, message, views, clicks | `.releaseLabel`, `.announcementType`, `.status`, `.publishAt`, targets, `.title`, `.message`, `.viewCount`, `.clickCount` | |
| Drafts list (edited by · when) | `status = 'DRAFT'`, `updatedBy`, `updatedAt` | |
| Engagement (30 d) bars | `.viewCount`, `.clickCount` | |
| Compose: Type, Severity, Title, Message, Audience (All / Growth and above / Payroll module users / Specific tenants), Publish date-time, In-app banner, Email tenant admins | `.announcementType`, `.severity`, `.title`, `.message`, `.audience` + `AnnouncementTargets` (plan / moduleKey / tenant), `.publishAt`, `.showBanner`, `.emailAdmins` | |

**Statuses.** DRAFT → SCHEDULED → PUBLISHED → ARCHIVED.
**Actions → effects.** *Save draft* · *Schedule* → `status = 'SCHEDULED'`. At `publishAt`: PUBLISHED, banners shown, admin emails → `CommunicationLogs`.
**Permission.** `announcement.publish` · **Approval.** —

### Communications — `admin/comms`
*Source:* `src/3A-admin-plus.html` (section `admin/comms`) · `src/9B-admin-plus.js` §9
**Purpose.** Lifecycle templates in English and Urdu across email, SMS and WhatsApp; broadcasts; delivery log.
**Tables.** Primary: `Platform.CommunicationTemplates`, `Platform.TenantBroadcasts`, `Platform.CommunicationLogs` · Reads: `Platform.Tenants`, `Platform.TenantContacts`, `Platform.TenantSegments` · Writes: same
**Functions.** Save → `Platform.communicationTemplateAddUpdate` · Open → `Platform.getCommunicationTemplateInfo` ‖ Save → `Platform.tenantBroadcastAddUpdate` · Open → `Platform.getTenantBroadcastInfo`
**Lookups.** `TenantBroadcasts.audience` → `TenantBroadcastAudience` · `TenantBroadcasts.languageMode` → `LanguageMode` · `TenantBroadcasts.status` → `TenantBroadcastStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Template list: name, sent (30 d), channels | `CommunicationTemplates.name`, count `CommunicationLogs`, `.channels` | Welcome, Trial ending, Invoice, Payment failed, Password reset, Maintenance |
| Editor: English / اردو, Subject, Message (chars · SMS segments), Insert variable, "Saved · v12" | `.subjectEn/.bodyEn`, `.subjectUr/.bodyUr`, `.version` | vars `{{ownerName}} {{tenantName}} {{plan}} {{amount}} {{dueDate}} {{trialDays}} {{invoiceNo}} {{loginUrl}}` |
| Live preview Email / SMS / WhatsApp | rendered from template + sample data | |
| Send test | `CommunicationLogs` with `isTest = true` | |
| Broadcast: segment (All active / Trials / Past due / Starter / Sindh / Enterprise owners), template, language, send time, channels, estimate | `TenantBroadcasts.audience/audienceValue/segmentId`, `.commTemplateId`, `.languageMode`, `.scheduledAt`, `.channels`, `.recipientsCount`, `.estimatedSmsCost` | |
| Delivery log: Time / Template / Tenant / Recipient / Channel / Status / Retry | `CommunicationLogs.sentAt`, `.commTemplateId`, `.tenantId`, `.recipient`, `.channel`, `.status` | chips All / Delivered / Failed |

**Statuses.** CommunicationLogs QUEUED → SENT → DELIVERED → OPENED / READ; BOUNCED / FAILED (retry). Broadcast SCHEDULED → QUEUED → SENT.
**Actions → effects.** *Save template* → `version`+1 · *Retry* → new `CommunicationLogs` with `retryOfId` (backup SMTP / Jazz gateway) · *Send broadcast* → `TenantBroadcasts` → n `CommunicationLogs`.
**Permission.** `announcement.publish` · **Approval.** —

---

## System

### System Health — `admin/system`
*Source:* `src/30-entry-admin.html` (section `admin/system`)
**Purpose.** Live status of services, queues and backups (PK-Lahore primary, PK-Karachi DR).
**Tables.** Primary: `Platform.JobQueueSamples`, `Platform.BackupRuns` · Reads: `Platform.ServiceIncidents`, view `Platform.getSystemHealth` · Writes: `Platform.BackupRuns`, `Platform.PlatformAuditLogs`

| UI field / column | Table.column | Notes |
|---|---|---|
| Degraded banner "FBR gateway degraded" | open `incident` on FBR_PRAL_GATEWAY | |
| Service cards API / Workers / Database / Redis / Mail / FBR gateway (status, metric, sparkline, uptime 90 d) | `getSystemHealth` | metrics come from external monitoring **[simulated]**; status follows open incidents |
| Error rate chart (5xx/min, 24 h) | — | external metrics **[simulated]** |
| Job queues: Queue / Waiting / Failed / Status | latest `JobQueueSamples` per `queueName` | |
| Backups: Backup / Type / Started / Duration / Size / Location / Verified / Status | `BackupRuns.code`, `.backupType`, `.startedAt`, `finishedAt − startedAt`, `.sizeBytes`, `.location`, `.verification`, `.status` (+ `retryOfId`) | |

**Statuses.** backup RUNNING → COMPLETED / FAILED (retried) · queue OK / BUSY / RETRYING / STALLED.
**Actions → effects.** *Back up now* → `BackupRuns` (FULL), `PlatformAuditLogs` · *Post incident* → `admin/status` · *Refresh*.
**Permission.** `system.manage` · **Approval.** —

### Platform Audit Log — `admin/audit`
*Source:* `src/30-entry-admin.html` (section `admin/audit`)
**Purpose.** Immutable record of staff and system actions; alert rules.
**Tables.** Primary: `Platform.PlatformAuditLogs` (append-only), `Platform.AuditAlertRules` · Reads: `Platform.PlatformStaff`, `Platform.Tenants` · Writes: `Platform.AuditAlertRules`
**Functions.** Save → `Platform.auditAlertRuleAddUpdate` · Open → `Platform.getAuditAlertRuleInfo`
**Lookups.** `AuditAlertRules.resultFilter` → `ResultFilter` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Time / Actor (name + role or process) | `PlatformAuditLogs.occurredAt`, `.actorLabel`, `.actorDetail` | |
| Action (code + category) | `.action`, `.category` | chips Impersonation / Billing / Security / Failed |
| Tenant / Details / IP / Result | `.tenantId → Tenants.code`, `.details`, `.ipAddress`, `.result` | |
| Event payload + hash | `.payload`, `.eventHash` | |
| Alert rules drawer (3 failed MFA, Impersonation started, Invoice voided) | `AuditAlertRules.name`, `.actionPattern`, `.resultFilter`, `.thresholdCount`, `.channels`, `.recipients` | |

**Statuses.** —
**Actions → effects.** *Export CSV* · *Copy JSON* · *Add rule / Alert on this* → `AuditAlertRules`.
**Permission.** `staff.manage` (Super Admin), `ticket.manage` read · **Approval.** —

### Status & Incidents — `admin/status`
*Source:* `src/3A-admin-plus.html` (section `admin/status`) · `src/9B-admin-plus.js` §11
**Purpose.** What tenants see on status.finsoft.pk; live incident updates; planned maintenance with in-app banner.
**Tables.** Primary: `Platform.ServiceIncidents`, `Platform.ServiceIncidentUpdates`, `Platform.MaintenanceWindows` · Reads: view `Platform.getStatusComponentHistory` · Writes: same + `Platform.CommunicationLogs` (subscribers), `Platform.Announcements` (maintenance banner)
**Functions.** Save → `Platform.serviceIncidentAddUpdate` · Open → `Platform.getServiceIncidentInfo` ‖ Save → `Platform.maintenanceWindowAddUpdate` · Open → `Platform.getMaintenanceWindowInfo`
**Lookups.** `ServiceIncidents.impact` → `Impact` · `ServiceIncidents.stage` → `ServiceIncidentStage` · `ServiceIncidentUpdates.stage` → `ServiceIncidentStage` · `MaintenanceWindows.status` → `MaintenanceWindowStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Status banner (operational / partial degradation, n open incidents) | `incident` where `stage <> 'RESOLVED'` | |
| Components (Web app, Public API, FBR/PRAL gateway, PRA & SRB e-invoicing, Payroll engine, Email & SMS, Bank feeds & Raast, Backups & DR) with 90-day bars and uptime % | `getStatusComponentHistory` (worst open impact per component per day) | subscriber count "2,418" **[simulated]** |
| Incident detail: title, id · impact · components, stage stepper, updates (stage, message, time, poster) | `ServiceIncidents.title`, `.docNo`, `.impact`, `.components`, `.stage`, `ServiceIncidentUpdates.*` | |
| Post an update: stage, message, Email & SMS subscribers, Update banner | `ServiceIncidentUpdates.stage`, `.message`, `.notifySubscribers`, `.updateBanner` | |
| Incidents list (last 90 days) | `ServiceIncidents.startedAt`, duration `resolvedAt − startedAt` | |
| Declare incident: Title *, Impact, Status, First update *, Components | `incident` + first `ServiceIncidentUpdates` | `docNo` from `nextDocNo('INC')` |
| Schedule maintenance: Date, Start, Duration, Show banner, message, affected components | `MaintenanceWindows.startsAt`, `.endsAt`, `.bannerLeadHours`, `.message`, `.components` | |
| Banner preview / Upcoming windows | `MaintenanceWindows` SCHEDULED | |

**Statuses.** incident INVESTIGATING → IDENTIFIED → MONITORING → RESOLVED · maintenance SCHEDULED → IN_PROGRESS → COMPLETED / CANCELLED.
**Actions → effects.** *Post update* → `ServiceIncidentUpdates` and `ServiceIncidents.stage`. RESOLVED sets `resolvedAt` and `postmortemDueOn`. *Declare* → incident and on-call paged · *Schedule window* → `MaintenanceWindows` (+ MAINTENANCE `announcement`) · *Write post-mortem* → `postmortemRef`.
**Permission.** `system.manage` · **Approval.** —

### Security & Privacy — `admin/security`
*Source:* `src/3A-admin-plus.html` (section `admin/security`) · `src/9B-admin-plus.js` §10
**Purpose.** Console SSO, two-factor, IP allow-list, password policy, admin sessions, tenant data requests.
**Tables.** Primary: `Platform.PlatformSecuritySettings`, `Platform.PlatformAllowedIps`, `Platform.PlatformStaffSessions`, `Platform.PrivacyRequests` · Reads: `Platform.PlatformStaff`, `Platform.Tenants` · Writes: same + `Platform.BackupRuns` (export), `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.platformSecuritySettingAddUpdate` · Open → `Platform.getPlatformSecuritySettingInfo` ‖ Save → `Platform.platformAllowedIpAddUpdate` · Open → `Platform.getPlatformAllowedIpInfo` ‖ Save → `Platform.privacyRequestAddUpdate` · Open → `Platform.getPrivacyRequestInfo`
**Lookups.** `PlatformSecuritySettings.ssoProvider` → `PlatformSecuritySettingSsoProvider` · `PlatformSecuritySettings.samlNameIdFormat` → `SamlNameIdFormat` · `PlatformSecuritySettings.mfaEnforcement` → `MfaEnforcement` · `PrivacyRequests.requestType` → `PrivacyRequestType` · `PrivacyRequests.step` → `Step` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Console security score 86/100 + checklist | derived from `PlatformSecuritySettings`, `PlatformStaff.mfaType`, open `PrivacyRequests` | **[simulated]** weighting |
| SSO: SAML 2.0 (Okta) / Google Workspace; IdP SSO URL, entity ID, Name ID format, certificate (expires), ACS URL; domain, client ID, allowed groups; Require SSO; Break-glass | `PlatformSecuritySettings.ssoProvider`, `saml*`, `google*`, `requireSso`, `breakGlassSuperAdmin` | *Test connection* **[simulated]** |
| Two-factor enforcement Optional / Required for admins / everyone; methods WebAuthn / Authenticator / SMS; enrolment 5 of 6, Nudge | `.mfaEnforcement`, `.mfaAllowWebauthn/totp/sms`; enrolment from `PlatformStaff.mfaType`, `mfaEnrolledAt` | |
| IP allow-list: CIDR, label, Enforce | `PlatformAllowedIps.cidr`, `.label`; `PlatformSecuritySettings.ipAllowlistEnforced` | IPv4 CIDR only; keep at least one |
| Password policy: min length, case, number, symbol, HIBP, last 5, rotate, lockout | `.pwMinLength`, `.pwRequire*`, `.pwBlockBreached`, `.pwBlockReuse`, `.pwRotationDays`, `.lockoutAttempts`, `.lockoutMinutes` | |
| Admin sessions: Staff / Device / IP / Location / Started / Last seen / Revoke | `PlatformStaffSessions.*` | |
| Privacy requests: Request (PRV no, tenant) / Type / Requested by + received / Due (days left) / Workflow / Verify-Approve-Reject-Certificate | `PrivacyRequests.docNo`, `.tenantId`, `.requestType`, `.requestedByName/role`, `.receivedOn`, `.dueOn`, `.step`, `approver1/2`, `.certificateRef` | |

**Statuses.** privacy RECEIVED → VERIFIED → APPROVED (DELETE: 2 approvers) → PROCESSING → DONE; REJECTED · session live → revoked.
**Actions → effects.**
- *Save policies* → `PlatformSecuritySettings` and `PlatformAuditLogs` (AUD-PLT-8820).
- *Add / remove CIDR* → `PlatformAllowedIps`.
- *Revoke / Revoke all others* → `PlatformStaffSessions.revokedAt`.
- *Verify / Approve* → `PrivacyRequests` steps. A DELETE needs two distinct approvers (CHECK) and typing the tenant code; it erases tenant data and issues a certificate. An EXPORT creates a `BackupRuns` with a 7-day link.
- *Reject* → `rejectedReason`.

**Permission.** `staff.manage` (security settings), `privacy.approve` · **Approval.** Deletion: two approvers.

### API & Webhooks — `admin/integrations`
*Source:* `src/3A-admin-plus.html` (section `admin/integrations`) · `src/9B-admin-plus.js` §12
**Purpose.** Per-tenant API keys and scopes, webhook endpoints, and every delivery with replay.
**Tables.** Primary: `Platform.PlatformApiKeys`, `Platform.WebhookEndpoints`, `Platform.WebhookDeliveries` · Reads: `Platform.Tenants` · Writes: same + `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.platformApiKeyAddUpdate` · Open → `Platform.getPlatformApiKeyInfo` ‖ Save → `Platform.webhookEndpointAddUpdate` · Open → `Platform.getWebhookEndpointInfo`
**Lookups.** `PlatformApiKeys.environment` → `PlatformApiKeyEnvironment` · `PlatformApiKeys.keyPrefix` → `KeyPrefix` · `PlatformApiKeys.status` → `PlatformApiKeyStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Tenant picker | `PlatformApiKeys.tenantId` etc. | |
| KPIs API calls 24 h / Error rate / p95 latency / Webhook success | `UsageSnapshots` API meter; gateway metrics **[simulated]**; success % from `WebhookDeliveries` | |
| API keys: Name + env (live/test), masked key (reveal, copy), scopes, created, last used, Rotate, Revoke | `PlatformApiKeys.name`, `.environment`, `.keyPrefix…keyLast4`, `.scopes`, `.createdAt`, `.lastUsedAt`, `.status` | keys shown once at creation |
| Create key: Name *, Environment, Scopes, Expires, Allowed IPs | `.name`, `.environment`, `.scopes`, `.expiresAt`, `.allowedCidrs` | |
| Rotate: "old key keeps working for 24 hours" | `.previousKeyHash`, `.previousValidUntil`, `.rotatedAt` | |
| Webhook card: URL, success 7 d, on/off, signing secret (reveal), events, Send test event | `WebhookEndpoints.url`, `.isEnabled`, `.secretLast4`, `.events` | |
| Deliveries: Time / Event / Endpoint / Status / Latency / Attempt n/6 / Replay | `WebhookDeliveries.createdAt`, `.eventType`, `.webhookEndpointId`, `.responseCode`/`.status`, `.latencyMs`, `.attemptNo` | chips All / 2xx / Failed |
| Payload inspector Request / Response, signature, retry schedule | `.requestPayload`, `.requestSignature`, `.responseCode`, `.responseBody` | retries 1m, 5m, 30m, 2h, 6h |

**Statuses.** PlatformApiKeys ACTIVE → REVOKED · delivery PENDING → DELIVERED / FAILED / TIMEOUT (retry up to 6) · endpoint enabled ⇄ paused (queued 72 h).
**Actions → effects.** *Create / Rotate / Revoke key* → `PlatformApiKeys` + `PlatformAuditLogs` · *Add endpoint* → `WebhookEndpoints` + test ping (`WebhookDeliveries` event `ping`) · *Replay* → new delivery with `replayOfId` · *Reveal* → `PlatformAuditLogs`.
**Permission.** `system.manage` · **Approval.** —

### Tax Master — `admin/tax-master`
*Source:* `src/3A-admin-plus.html` (section `admin/tax-master`) · `src/9B-admin-plus.js` §13
**Purpose.** Federal and provincial sales tax, withholding sections, salary slabs and the FBR / PRAL connection used by every tenant.
**Tables.** Primary: `Platform.TaxMasterAuthorities`, `Platform.TaxMasterSalesTaxRates`, `Platform.TaxMasterWithholdingRates`, `Platform.TaxMasterSalarySlabs` · Reads: `Tax.TaxCodes` (tenants using a rate, via platform read) · Writes: same + `Platform.PlatformAuditLogs` (change log)
**Functions.** Save → `Platform.taxMasterAuthorityAddUpdate` · Open → `Platform.getTaxMasterAuthorityInfo` ‖ Save → `Platform.taxMasterSalesTaxRateAddUpdate` · Open → `Platform.getTaxMasterSalesTaxRateInfo` ‖ Save → `Platform.taxMasterWithholdingRateAddUpdate` · Open → `Platform.getTaxMasterWithholdingRateInfo` ‖ Save → `Platform.taxMasterSalarySlabAddUpdate` · Open → `Platform.getTaxMasterSalarySlabInfo`
**Lookups.** `TaxMasterAuthorities.code` → `TaxMasterAuthorityCode` · `TaxMasterAuthorities.jurisdiction` → `Jurisdiction` · `TaxMasterAuthorities.levyScope` → `LevyScope` · `TaxMasterAuthorities.activeEnvironment` → `ActiveEnvironment` · `TaxMasterAuthorities.onFailure` → `OnFailure` · `TaxMasterSalesTaxRates.status` → `TaxMasterSalesTaxRateStatus` · `TaxMasterWithholdingRates.status` → `TaxMasterSalesTaxRateStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Tax year pill "2027" | `TaxMasterSalarySlabs.taxYear` | |
| Tiles Federal GST 18% · PRA 16% · SRB 15% · KPRA 15% · BRA 15% | current `TaxMasterSalesTaxRates.rate` per `TaxMasterAuthorities` | |
| Sales tax: Authority / Applies to / Rate (→ pending) / Reduced-special / Effective from / Tenants / Edit | `TaxMasterAuthorities.code/jurisdiction`, `TaxMasterSalesTaxRates.appliesTo`, `.rate` (+ SCHEDULED row), `.reducedRatesNote`, `.effectiveFrom`, count of tenants **[derived]** | |
| Change rate modal: new rate, effective from, legal reference * | new `TaxMasterSalesTaxRates` row (SCHEDULED), `.legalReference` | no overlapping ranges (EXCLUDE) |
| Withholding: Section / Nature / ATL rate / Non-ATL / Threshold / Effective | `TaxMasterWithholdingRates.sectionCode`, `.nature`, `.atlRateCompany/other`, `.nonAtlRateCompany/other`, `.rateNote`, `.thresholdAmount/note`, `.effectiveFrom` | |
| Section 149 slabs drawer | `TaxMasterSalarySlabs.incomeFrom/to`, `.fixedTax`, `.ratePct`, `.excessOver` | |
| FBR / PRAL: Sandbox / Production, FBR DI endpoint, PRA endpoint, token (reveal), POS ID, Timeout, On failure | `TaxMasterAuthorities.activeEnvironment`, `.sandboxEndpoint/productionEndpoint`, `.apiTokenEnc/last4`, `.platformPosId`, `.timeoutSeconds`, `.onFailure` | |
| Connection test (DNS, TLS, Auth, sample invoice, IRN, ms) | `TaxMasterAuthorities.lastTestAt/ok/ms` | steps **[simulated]** |
| Today: submitted / accepted / queued / rejected | `Tax.FbrInvoiceSubmissions` aggregates (cross-tenant read) | |
| Change log | `PlatformAuditLogs` (`category = 'CONFIG'`, action `Tax.*`) | |

**Statuses.** rate SCHEDULED → ACTIVE → SUPERSEDED · environment SANDBOX ⇄ PRODUCTION (confirm).
**Actions → effects.** *Schedule change* → SCHEDULED row (the old row gets `effectiveTo`) · *Publish to tenants* → `masterVersion`, `publishedAt`; tenants are notified and tenant `Tax.TaxCodes` rates switch on the effective date · *Switch to production* / *Test connection* → `TaxMasterAuthorities` + `PlatformAuditLogs`.
**Permission.** `system.manage` · **Approval.** —

### Platform Team — `admin/staff`
*Source:* `src/3A-admin-plus.html` (section `admin/staff`) · `src/9B-admin-plus.js` §3
**Purpose.** Console staff, tenant scope and the role × permission matrix.
**Tables.** Primary: `Platform.PlatformStaff`, `Platform.PlatformStaffRoles`, `Platform.PlatformStaffRolePermissions`, `Platform.PlatformStaffTenantScopes` · Reads: `Platform.PlatformStaffSessions`, `Platform.ImpersonationSessions`, `Platform.Tenants` · Writes: same + `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.platformStaffMemberAddUpdate` · Open → `Platform.getPlatformStaffMemberInfo` ‖ Save → `Platform.platformStaffRoleAddUpdate` · Open → `Platform.getPlatformStaffRoleInfo`
**Lookups.** `PlatformStaff.role` → `PlatformStaffMemberRole` · `PlatformStaff.mfaType` → `MfaType` · `PlatformStaff.tenantScope` → `TenantScope` · `PlatformStaff.status` → `PlatformStaffMemberStatus` · `PlatformStaffRoles.code` → `PlatformStaffRoleCode` · `PlatformStaffRolePermissions.permissionKey` → `PermissionKey` · `PlatformStaffRolePermissions.permissionGroup` → `PermissionGroup` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Platform staff / 2FA coverage / Active sessions / Impersonations 30 d | count `PlatformStaff`; `mfaType` coverage; live `PlatformStaffSessions`; count `ImpersonationSessions` | |
| Member / Role / 2FA / Tenant scope / Last active / Status | `PlatformStaff.fullName/email`, `.role`, `.mfaType`, `.tenantScope` + `.scopeRegions` / `PlatformStaffTenantScopes`, `.lastActiveAt`, `.status` | |
| Staff drawer: Full name *, Email *@finsoft.pk, Role (+ hint), scope All / By region / Specific tenants, Require 2FA, Restrict to IP allow-list, Email invite | `PlatformStaff.fullName`, `.email`, `.role`, `.tenantScope`, `.scopeRegions`, `PlatformStaffTenantScopes`, `.mfaRequired`, `.ipRestricted`, `.invitedAt` | |
| Role permissions matrix (14 permissions × 5 roles, Super Admin locked, n of 14) | `PlatformStaffRolePermissions.isGranted` (`permissionKey`, `permissionGroup`), `PlatformStaffRoles.isLocked` | |

**Statuses.** INVITED → ACTIVE → SUSPENDED / DISABLED (`removedAt`).
**Actions → effects.** *Add staff* → INVITED + email · *Edit* · *Remove* → DISABLED, sessions revoked · *Save matrix* → `PlatformStaffRolePermissions` + `PlatformAuditLogs` `staff.role.update` (AUD-PLT-8812). A locked role cannot lose a permission (trigger).
**Permission.** `staff.manage` · **Approval.** —
