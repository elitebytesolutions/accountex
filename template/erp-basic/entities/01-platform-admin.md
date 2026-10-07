# 01 · Platform Admin (SaaS console) — Basic edition

Schema: `Platform` (global tables, no `tenantId` column on the table itself unless it points *at* a tenant; no RLS).
DDL: `database/schema/01-platform.sql`. The console runs as role `finsoftPlatform`. Its login has BYPASSRLS so it can read tenant-side counts (users, branches).

Basic covers 9 console screens. Analytics, leads, partners, platform invoices, dunning, usage, feature management, support, announcements, comms, system, status, security, integrations and tax master are Full-only (see `erp-full/entities/01-Platform-admin.md`).

Permissions in Basic come from the staff member's role (`Platform.PlatformStaff.role`). Full adds the editable role × permission matrix (`Platform.PlatformStaffRolePermissions`).

| Role code | Can do (Basic) |
|---|---|
| `SUPER_ADMIN` | everything |
| `SUPPORT_LEAD` | view, onboard, impersonate; edit COA templates |
| `SUPPORT_AGENT` | view and impersonate tenants |
| `BILLING` | view tenants; manage plans and subscriptions |
| `ENGINEER` | view (read-only); templates |

---

### Platform Overview — `admin/dashboard`
*Source:* `src/48-dash-stock.html` (section `admin/dashboard`) · `src/92-dash.js` (count-up / heat strip engine)
**Purpose.** Morning overview of Finsoft Cloud: MRR, live tenants, churn, plan mix, tenants needing attention and system health.
**Tables.** View-based. Reads: `Platform.getPlatformOverview`, `Platform.getMrrByPlan`, `Platform.getTenantsNeedingAttention` (built on `Platform.Subscriptions`, `Platform.Tenants`, `Platform.SubscriptionPlans`, `Platform.PlatformStaff`) · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Monthly Recurring Revenue "Rs 3,845,000" | `vAdminDashboard.mrr` | Σ live `Subscriptions.amount`, divided by 12 when `billingCycle = 'ANNUAL'` |
| ARR "Rs 46.1M" | `vAdminDashboard.arr` | mrr × 12 |
| vs August "+3.9%" | `vAdminDashboard.mrrMomPct` | needs month-end MRR history. In Basic it is recomputed from `Subscriptions.startsOn` / `cancelledAt` **[simulated in prototype]** |
| Expansion "+Rs 79,000" | — | needs `SubscriptionEvents` (Full only). Not shown in Basic |
| Active tenants "128" | `vAdminDashboard.activeTenants` | `Tenants.status IN ('ACTIVE','PAST_DUE','READ_ONLY')` |
| Sign-ups · 12 months heat strip | `vAdminDashboard.signupsByMonth` | count of `Tenants.createdAt` per month |
| Net new "+9" | `vAdminDashboard.netNewTenants` | activated − churned in the month |
| Trials "14 running" | `vAdminDashboard.trialsRunning` | `Tenants.status = 'TRIAL'` |
| Plan split Growth 65 / Business 23 / Starter 35 | `vMrrByPlan.tenants` | live subscriptions grouped by `SubscriptionPlans.code` |
| Logo churn "1.8% · last 30 days" | `vAdminDashboard.logoChurn30dPct` | tenants moved to `CHURNED` (or `Subscriptions.cancelledAt`) in 30 d ÷ tenants live 30 d ago |
| Plan mix "42% Growth · Rs 1.62M" | `vMrrByPlan.mrr`, `.mrrSharePct` | |
| Tenants needing attention: Tenant / Plan / Issue / Since / MRR / Owner | `getTenantsNeedingAttention.*` | Issue comes from `Tenants.status` (PAST_DUE, READ_ONLY), `trialEndsOn` (≤ 7 d), `lastActiveAt` (no logins in 21 d) and `healthScore` (< 50). Owner = `Tenants.accountOwnerStaffId → PlatformStaff.fullName` |
| System health list (API gateway, PostgreSQL, workers, FBR IRIS, mail) | — | external monitoring **[simulated]**; no table in Basic |

**Statuses.** Tenant statuses as on `admin/tenants`.
**Actions → effects.** *System health* → `admin/system` (Full) · *Onboard tenant* → `admin/tenants/new` · *All tenants* → `admin/tenants`.
**Permission.** any active staff (`PlatformStaff.status = 'ACTIVE'`) · **Approval.** —

---

### All Tenants — `admin/tenants`
*Source:* `src/3A-admin-plus.html` (section `admin/tenants`) · `src/9B-admin-plus.js` §1 (engine)
**Purpose.** Every organisation on Finsoft Cloud with lifecycle, health, revenue and seats, plus bulk actions.
**Tables.** Primary: `Platform.Tenants` · Reads: `Platform.Subscriptions`, `Platform.SubscriptionPlans`, `Platform.TenantModules`, `Platform.TenantContacts`, `Platform.PlatformStaff`, `Company.Users` (seat count), view `Platform.getAllTenants` · Writes: `Platform.Tenants`, `Platform.Subscriptions`, `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.tenantAddUpdate` · Open → `Platform.getTenantInfo`
**Lookups.** `Tenants.industry` → `TenantIndustry` · `Tenants.province` → `Province` · `Tenants.numberFormat` → `NumberFormat` · `Tenants.dataResidency` → `DataResidency` · `Tenants.defaultLanguage` → `DefaultLanguage` · `Tenants.status` → `TenantStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Live tenants / In trial / At risk / Past due / Seats in use | `getAllTenants` aggregates | At risk = `healthScore < 50`. Past due = Σ open amount for `Subscriptions.status = 'PAST_DUE'` (Basic has no invoice table, so this is the subscription amount) |
| Portfolio health bar (Healthy 75+ / Watch 50–74 / At risk < 50) | `Tenants.healthScore` | |
| Region counts (Punjab, Sindh, KPK, ICT, Balochistan) | `Tenants.province` | |
| Views: All / At risk / Trials ending / Past due / Enterprise | `Tenants.healthScore`, `Tenants.status`, `SubscriptionPlans.code` | Past due view = `status IN ('PAST_DUE','READ_ONLY')` |
| Search "name, code, city or owner" | `Tenants.displayName`, `Tenants.code`, `Tenants.city`, `TenantContacts.fullName` (OWNER) | trigram index `tenantNameTrgmIdx` |
| Filters Plan / Status / Region / City | `Subscriptions.planId`, `Tenants.status`, `Tenants.province`, `Tenants.city` | |
| Tenant (logo, name, code · city) | `Tenants.displayName`, `.code`, `.city` | |
| Plan | `SubscriptionPlans.name` via the live `subscription` | |
| Health ring | `Tenants.healthScore` | |
| MRR (Rs) | `Subscriptions.amount` (÷12 if ANNUAL) | 0 for TRIAL / PROVISIONING |
| Seats "48/50" | count of active `Company.Users` / `Subscriptions.seats` (fallback `SubscriptionPlans.userSeats`) | |
| Modules icons | `TenantModules.moduleKey` where `enabled` | ACC SAL PUR INV FA PAY ATT ESS FBR |
| Status badge | `Tenants.status` | |
| Renewal + "in 164 d" / "Trial ends in 2 d" | `Subscriptions.nextRenewalOn`, `Tenants.trialEndsOn` | |
| Quick view: customer since, owner, contacts, last activity | `Tenants.activatedAt`, `TenantContacts.*`, `Tenants.lastActiveAt`, `PlatformAuditLogs` | health breakdown factors are Full (`Tenants.healthFactors`) |
| Table foot "View MRR" | Σ MRR of filtered rows | |

**Statuses.** PROVISIONING → TRIAL → ACTIVE ⇄ PAST_DUE → READ_ONLY → SUSPENDED → CHURNED; SUSPENDED → ACTIVE (Reactivate).
**Actions → effects.**
- *Extend trial* (7/14/30 d) → `Subscriptions.trialEndsOn` and `Tenants.trialEndsOn` + N days, but only for TRIAL tenants. Also writes `PlatformAuditLogs` (`tenant.trial.extend`).
- *Change plan* → `Subscriptions.planId`, `Subscriptions.amount`, `Subscriptions.seats` (upgrades prorated today; downgrades at renewal) and `PlatformAuditLogs` (`subscription.plan_change`).
- *Send notice* → in Basic, an email is queued through the app mail service and `PlatformAuditLogs` records `tenant.notice` (comm templates/log are Full).
- *Suspend* → `Tenants.status = 'SUSPENDED'` and `Subscriptions.status = 'SUSPENDED'`; tenant sessions are revoked (`Company.UserSessions`); `PlatformAuditLogs` records `tenant.suspend`. *Reactivate* reverses it.
- *Export CSV* → file download; `PlatformAuditLogs` records `tenant.export`.

**Permission.** view: all roles · suspend: `SUPER_ADMIN` · change plan / extend trial: `SUPER_ADMIN`, `BILLING`, `SUPPORT_LEAD` · **Approval.** —

---

### Onboard Tenant — `admin/tenants/new`
*Source:* `src/30-entry-admin.html` (section `admin/tenants/new`, 5-step wizard)
**Purpose.** Create the organisation, choose a plan, invite the first admin and provision an isolated workspace.
**Tables.** Primary: `Platform.Tenants`, `Platform.Subscriptions`, `Platform.TenantContacts`, `Platform.TenantModules` · Reads: `Platform.SubscriptionPlans`, `Platform.SubscriptionPlanFeatures`, `Platform.ChartOfAccountsTemplates` · Writes (provisioning): `Company.CompanySettings`, `Company.Branches`, `Company.Users`, `Company.NumberingSeries`, `Accounting.ChartOfAccounts` (from `Platform.ChartOfAccountsTemplateAccounts`), `Accounting.FiscalYears` / `Accounting.FiscalPeriods`, `Tax.TaxCodes`, `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.tenantAddUpdate` · Open → `Platform.getTenantInfo` ‖ Save → `Platform.subscriptionAddUpdate` · Open → `Platform.getSubscriptionInfo`
**Lookups.** `Tenants.industry` → `TenantIndustry` · `Tenants.province` → `Province` · `Tenants.numberFormat` → `NumberFormat` · `Tenants.dataResidency` → `DataResidency` · `Tenants.defaultLanguage` → `DefaultLanguage` · `Tenants.status` → `TenantStatus` · `Subscriptions.billingCycle` → `BillingCycle` · `Subscriptions.paymentMethod` → `DunningCasePaymentMethod` · `Subscriptions.status` → `SubscriptionStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| **Step 1** Display name * | `Tenants.displayName` | |
| Legal name * | `Tenants.legalName` | |
| NTN * / STRN / SECP registration # | `Tenants.ntn`, `.strn`, `.secpRegNo` | FBR verification panel "Verified" is an ATL lookup **[simulated]** |
| Industry * | `Tenants.industry` | TRADING_DISTRIBUTION, MANUFACTURING, SERVICES, TEXTILES, PHARMACEUTICALS, CONSTRUCTION, NGO |
| Country / City * | `Tenants.country` ('PK'), `Tenants.city` | province is derived from the city into `Tenants.province` |
| Registered address / Phone / Company email | `Tenants.address`, `.phone`, `.email` | |
| Tenant code * (4–10, permanent) | `Tenants.code` | UNIQUE, CHECK `^[A-Za-z][A-Za-z0-9]{3,9}$`. Code is reserved at provisioning |
| Subdomain preview "alnoor.finsoft.pk ✓ Available" | `Tenants.subdomain` | UNIQUE |
| **Step 2** Plan cards Starter / Growth / Business / Enterprise | `Subscriptions.planId` → `plan.*` | Enterprise = "Contact sales" |
| Finance / HR module switches | `TenantModules (moduleKey, enabled, source)` | Accounting is locked on. ADDON modules (Fixed Assets Rs 2,500, Recruitment) use `source = 'ADDON'` per `SubscriptionPlanFeatures.inclusion` |
| Billing cycle "Annual (save Rs 49,998) / Monthly" | `Subscriptions.billingCycle` | amount = `SubscriptionPlans.priceAnnual` or `priceMonthly` |
| Start with trial: No / 14-day / 30-day | `Subscriptions.trialEndsOn`, `Tenants.trialEndsOn`, `Subscriptions.status = 'TRIAL'` | |
| **Step 3** Full name * / Designation / Work email * / Mobile * / CNIC / Language | `TenantContacts (contactRole 'OWNER', isPrimary)` `.fullName`, `.designation`, `.email`, `.mobile`, `.cnic`, `.language` | becomes the tenant owner `Company.Users` |
| Require MFA for all users | `Tenants.requireMfa` | |
| Send invitation email now | — | invite link 72 h (`Company.UserInvites`, Full; in Basic it is a `Company.PasswordResets`-style token) |
| Allow Google / Microsoft SSO | `Tenants.allowSso` | |
| Also invite Sana Javed as Accountant | second `TenantContacts` + `Company.Users` | |
| **Step 4** Fiscal year starts (July/January/April) | `Tenants.fiscalYearStartMonth` (7/1/4) | |
| First fiscal year FY 2026-27 | `Accounting.FiscalYears` created at provisioning | 12 periods |
| Base currency / Timezone / Number format / Date format | `Tenants.baseCurrency`, `.timezone`, `.numberFormat`, `.dateFormat` | |
| Chart of accounts template | `Tenants.coaTemplateId` | copies `ChartOfAccountsTemplateAccounts` into `Accounting.ChartOfAccounts` |
| Data residency | `Tenants.dataResidency` (PK_LAHORE / AE_DUBAI) | |
| Seed Pakistani tax codes / leave types & salary components / import opening balances | provisioning options | seed lists are Full tables (`platform.seed*`). Basic seeds tax codes from a fixed script |
| Number series preview (JV, CPV, BRV, INV, PO, BILL …) | `Company.NumberingSeries` | `{PREFIX}-{YYYY}-{SEQ6}`, yearly reset |
| **Step 5** Review + provisioning checklist | — | checklist steps are job progress **[simulated]** |

**Statuses.** `Tenants.status` PROVISIONING → TRIAL (trial chosen) or ACTIVE.
**Actions → effects.**
- *Save draft* → the tenant row is kept in `PROVISIONING`.
- *Provision tenant* → inserts `tenant`, `TenantContacts`, `TenantModules`, `subscription`, then runs the provisioning job: company, branch, owner user, COA, fiscal year, tax codes and number series. It also writes `PlatformAuditLogs` `tenant.provision` ("Plan Starter · COA Trading") and generates the first invoice (Full).
- *View tenant* → `admin/tenants/view`.

**Permission.** `SUPER_ADMIN`, `SUPPORT_LEAD` · **Approval.** —

---

### Tenant 360 — `admin/tenants/view`
*Source:* `src/3A-admin-plus.html` (section `admin/tenants/view`) · `src/9B-admin-plus.js` §2
**Purpose.** One tenant's health, people, usage, billing, flags, integrations and audit trail.
**Tables.** Primary: `Platform.Tenants` · Reads: `Platform.Subscriptions`, `Platform.SubscriptionPlans`, `Platform.SubscriptionPlanFeatures`, `Platform.TenantModules`, `Platform.TenantContacts`, `Platform.PlatformStaff`, `Platform.PlatformAuditLogs`, `Company.Users`, `Company.Roles`, `Company.UserRoles`, `Company.Branches` · Writes: `Platform.Tenants`, `Platform.Subscriptions`, `Platform.TenantModules`, `Platform.PlatformAuditLogs`, `Company.Users`, `Company.PasswordResets`
**Functions.** Save → `Platform.tenantAddUpdate` · Open → `Platform.getTenantInfo`
**Lookups.** `Tenants.industry` → `TenantIndustry` · `Tenants.province` → `Province` · `Tenants.numberFormat` → `NumberFormat` · `Tenants.dataResidency` → `DataResidency` · `Tenants.defaultLanguage` → `DefaultLanguage` · `Tenants.status` → `TenantStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Profile: name, plan pill, cycle, status, "MFA enforced" | `Tenants.displayName`, `SubscriptionPlans.name`, `Subscriptions.billingCycle`, `Tenants.status`, `Tenants.requireMfa` | |
| Region · city / NTN / STRN / Created / Workspace / Account manager | `Tenants.province`, `.city`, `.ntn`, `.strn`, `.createdAt`, `.subdomain`, `accountOwnerStaffId → PlatformStaff.fullName` | |
| Health ring + "+6 in 30 d" | `Tenants.healthScore` | breakdown factors are Full (`Tenants.healthFactors`) |
| Subscription card: price, per-month effective, next renewal, seats, payment | `Subscriptions.amount`, `.nextRenewalOn`, `.seats`, `.paymentMethod`, `.paymentRef`, `.autoRenew` | |
| Lifetime value | Σ of paid invoices | Full (`PlatformInvoices`). **[simulated]** in Basic |
| Notes "visible to platform staff only" | — | **Not in Basic** (Full helper `Platform.TenantNotes`) |
| Users tab: User / Role / Branch / MFA / Last sign-in / Status | `Company.Users`, `Company.UserRoles → Company.Roles.name`, `Company.UserBranches → Company.Branches.name`, MFA state, `Company.UserSessions` | seats meter = active users ÷ `Subscriptions.seats` |
| Usage / Billing / Feature flags / Integrations tabs | — | **Full only** (`UsageSnapshots`, `PlatformInvoices`, `FeatureFlags`, `PlatformApiKeys`, `WebhookEndpoints`). In Basic, module toggles map to `TenantModules.enabled` |
| Activity tab (Admin / Tenant / Billing / Security) | `Platform.PlatformAuditLogs` where `tenantId = …` | |

**Statuses.** tenant: ACTIVE ⇄ SUSPENDED (Suspend / Reactivate).
**Actions → effects.**
- *Impersonate* (sign in as, ticket, reason, 30/60 min, read-only) → `PlatformAuditLogs` rows `impersonation.start` / `impersonation.end` with result RECORDED / SUCCESS. Basic has no session table, so the payload holds the target user, reason and limit.
- *Change plan* (with proration preview) → `Subscriptions.planId`, `.amount`, `.seats`, and `PlatformAuditLogs`.
- *Export data* (zip / CSV / JSON) → export job (Full logs it in `BackupRuns`), plus `PlatformAuditLogs` `tenant.export`.
- *Suspend* (type the code to confirm) → `Tenants.status = 'SUSPENDED'`, sessions revoked, and `PlatformAuditLogs`.
- *Invite / add user* → `Company.Users` (+ role, branch). An extra seat over the limit is flagged.
- *Reset MFA / Send password reset / Deactivate user* → `Company.Users`, `Company.PasswordResets`. The owner cannot be deactivated.
- *Module toggle* → `TenantModules.enabled` (`source = 'OVERRIDE'`).
- *Reveal key* → Full only.

**Permission.** view: all · impersonate: `SUPER_ADMIN`, `SUPPORT_LEAD`, `SUPPORT_AGENT` · suspend: `SUPER_ADMIN` · change plan: `SUPER_ADMIN`, `BILLING` · **Approval.** —

---

### Plans & Pricing — `admin/plans`
*Source:* `src/30-entry-admin.html` (section `admin/plans`, modal `adm-edit-plan`)
**Purpose.** Public price book and the plan × module feature matrix.
**Tables.** Primary: `Platform.SubscriptionPlans`, `Platform.SubscriptionPlanFeatures` · Reads: `Platform.Subscriptions` (tenant counts) · Writes: `Platform.SubscriptionPlans`, `Platform.SubscriptionPlanFeatures`, `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.subscriptionPlanAddUpdate` · Open → `Platform.getSubscriptionPlanInfo`
**Lookups.** `SubscriptionPlans.status` → `SubscriptionPlanStatus` · `SubscriptionPlanFeatures.moduleKey` → `ModuleKey` · `SubscriptionPlanFeatures.inclusion` → `Inclusion` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Monthly / Annual toggle | `SubscriptionPlans.priceMonthly` / `SubscriptionPlans.priceAnnual` | "2 months free" |
| Card: name, "35 tenants", price, tagline, bullets | `SubscriptionPlans.name`, count of live `subscription`, `SubscriptionPlans.priceMonthly`, `SubscriptionPlans.tagline`, `SubscriptionPlans.userSeats`, `SubscriptionPlans.storageGb` | Enterprise "Custom" (`priceMonthly` holds the list figure, 180,000) |
| Feature matrix rows × Starter/Growth/Business/Enterprise | `SubscriptionPlanFeatures (planId, moduleKey, inclusion, addonPrice)` | ✓ = INCLUDED, "Add-on" = ADDON, ✗ = NOT_AVAILABLE. Non-module rows (multi-branch, SAML SSO, dedicated DB) are fixed copy in Basic |
| Edit plan: Plan name / Monthly price / Annual price / User seats / Storage (GB) / Trial length / Tagline | `SubscriptionPlans.name`, `.priceMonthly`, `.priceAnnual`, `.userSeats`, `.storageGb`, `.trialDays`, `.tagline` | |
| Included modules switches | `SubscriptionPlanFeatures.inclusion` | |
| "Grandfathering … after 01 Nov 2026" | rule | existing `Subscriptions.amount` is unchanged until renewal |
| Price history "last change 12 Aug 2026 (+4.5%)" | `PlatformAuditLogs` (`plan.update` payload) | |

**Statuses.** `SubscriptionPlans.status` ACTIVE → RETIRED.
**Actions → effects.** *New plan / Save plan* → `plan`, `SubscriptionPlanFeatures`, and `PlatformAuditLogs` `plan.update`.
**Permission.** `SUPER_ADMIN`, `BILLING` · **Approval.** —

---

### Subscriptions — `admin/subscriptions`
*Source:* `src/30-entry-admin.html` (section `admin/subscriptions`, row drawer)
**Purpose.** Billing cycles, renewals and payment methods for every tenant.
**Tables.** Primary: `Platform.Subscriptions` · Reads: `Platform.Tenants`, `Platform.SubscriptionPlans`, views `Platform.getSubscriptionKpis`, `Platform.getMrrMovement` · Writes: `Platform.Subscriptions`, `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.subscriptionAddUpdate` · Open → `Platform.getSubscriptionInfo`
**Lookups.** `Subscriptions.billingCycle` → `BillingCycle` · `Subscriptions.paymentMethod` → `DunningCasePaymentMethod` · `Subscriptions.status` → `SubscriptionStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI MRR / Annual contracts % / Renewals in 30 days / Past due | `vSubscriptionKpi.mrr`, `.annualPct`, `.renewals30d`, `.renewals30dAmount`, `.pastDueAmount` | |
| Search tenant · Plan filter · chips All / Monthly / Annual / Past due | `Tenants.displayName`, `Subscriptions.planId`, `.billingCycle`, `.status` | |
| Tenant (name, code) | `Tenants.displayName`, `Tenants.code` | |
| Plan / Cycle | `SubscriptionPlans.name`, `Subscriptions.billingCycle` | |
| Amount (Rs) | `Subscriptions.amount` | per cycle |
| Next renewal | `Subscriptions.nextRenewalOn` | "—" when suspended |
| Payment method "Meezan direct debit", "Visa •••• 9012", "Pending setup" | `Subscriptions.paymentMethod`, `Subscriptions.paymentRef` | NULL ref = "Pending setup" |
| Status Active / Past due / Suspended / New | `Subscriptions.status` | "New" = ACTIVE with no payment method yet (derived) |
| Trials expiring (next 14 days) | `Subscriptions.trialEndsOn` where `status = 'TRIAL'` | users active from `Company.Users` |
| MRR movement — Sep (New / Expansion / Contraction / Churn / Net new) | `getMrrMovement` | Basic derives it from subscription start and cancel dates. Expansion and contraction need `SubscriptionEvents` (Full) |

**Statuses.** TRIAL → ACTIVE ⇄ PAST_DUE → SUSPENDED → CANCELLED / EXPIRED.
**Actions → effects.**
- *Run renewals* → for each `nextRenewalOn <= today`: charge, advance `currentPeriodStart/end` and `nextRenewalOn`. A failed charge sets `status = 'PAST_DUE'`. Writes `PlatformAuditLogs` `subscription.renew` and `payment.charge`.
- *Retry charge* → `PlatformAuditLogs` `payment.charge`.
- *Change plan* → link sent to the owner.
- *Cancel* → `autoRenew = false`, cancel at period end. On period end: `status = 'CANCELLED'`, `cancelledAt`, `cancelReason`.
- *Send conversion reminders* → mail to trial owners.
- *Export* → file.

**Permission.** `SUPER_ADMIN`, `BILLING` · **Approval.** —

---

### Templates — `admin/templates`
*Source:* `src/30-entry-admin.html` (section `admin/templates`)
**Purpose.** COA templates and master seeds copied into every new tenant.
**Tables.** Primary: `Platform.ChartOfAccountsTemplates`, `Platform.ChartOfAccountsTemplateAccounts` · Reads: `Platform.Tenants` (tenants per template) · Writes: same + `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.chartOfAccountsTemplateAddUpdate` · Open → `Platform.getChartOfAccountsTemplateInfo`
**Lookups.** `ChartOfAccountsTemplates.status` → `ChartOfAccountsTemplateStatus` · `ChartOfAccountsTemplateAccounts.nature` → `Nature` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Card: name, "v2026.2 · 214 accounts", status badge, "62 tenants" | `ChartOfAccountsTemplates.name`, `.version`, count of `ChartOfAccountsTemplateAccounts`, `.status`, count of `Tenants.coaTemplateId` | Default / Published / Draft |
| Card description | — | Full adds `ChartOfAccountsTemplates.description` |
| Preview tree: code, name, Debit / Credit badge | `ChartOfAccountsTemplateAccounts.code`, `.name`, `.level`, `.parentCode`, `.nature` | levels 1–4 (1 / 11 / 1101 / 1101001) |
| Master seed lists (Tax codes / Leave types / Salary) | — | **Full only** (`Platform.TemplateTaxCodes`, `TemplateLeaveTypes`, `TemplateSalaryComponents`). Basic uses a fixed seed script |

**Statuses.** DRAFT → PUBLISHED → DEFAULT (one default template) → RETIRED.
**Actions → effects.** *Import from Excel* → `ChartOfAccountsTemplateAccounts` rows (validated) · *New template* → copy as DRAFT · *Preview* · *Edit* · all write `PlatformAuditLogs` `template.update`.
**Permission.** `SUPER_ADMIN`, `SUPPORT_LEAD`, `ENGINEER` · **Approval.** —

---

### Platform Team — `admin/staff`
*Source:* `src/3A-admin-plus.html` (section `admin/staff`) · `src/9B-admin-plus.js` §3
**Purpose.** Finsoft Cloud staff with console access, their tenant scope and role.
**Tables.** Primary: `Platform.PlatformStaff` · Writes: `Platform.PlatformStaff`, `Platform.PlatformAuditLogs`
**Functions.** Save → `Platform.platformStaffMemberAddUpdate` · Open → `Platform.getPlatformStaffMemberInfo`
**Lookups.** `PlatformStaff.role` → `PlatformStaffMemberRole` · `PlatformStaff.mfaType` → `MfaType` · `PlatformStaff.tenantScope` → `TenantScope` · `PlatformStaff.status` → `PlatformStaffMemberStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Platform staff / 2FA coverage / Active sessions / Impersonations (30 d) | count `PlatformStaff`; share with `mfaType IS NOT NULL`; sessions **[Full]**; count of `PlatformAuditLogs.action = 'impersonation.start'` | |
| Member (name, email) | `PlatformStaff.fullName`, `.email` | `@finsoft.pk` only (app rule) |
| Role | `PlatformStaff.role` | Super Admin / Support Lead / Support Agent / Billing / Engineer |
| 2FA (Hardware key / Authenticator / Not set) | `PlatformStaff.mfaType` (WEBAUTHN / TOTP / NULL) | |
| Tenant scope "All tenants", "Punjab · 54 tenants" | `PlatformStaff.tenantScope` (ALL / ASSIGNED) | Basic stores no region or tenant list (Full: `scopeRegions`, `PlatformStaffTenantScopes`) |
| Last active / Status | `PlatformStaff.lastActiveAt`, `.status` | INVITED / ACTIVE / SUSPENDED / DISABLED |
| Role permissions matrix | — | read-only by role in Basic. The editable matrix is Full (`PlatformStaffRolePermissions`) |

**Statuses.** INVITED → ACTIVE → SUSPENDED / DISABLED.
**Actions → effects.** *Add staff* (send invite) → `PlatformStaff` INVITED · *Edit* → role / scope · *Remove* → `status = 'DISABLED'`, sessions end · all write `PlatformAuditLogs` `staff.*`.
**Permission.** `SUPER_ADMIN` · **Approval.** —

---

### Platform Audit Log — `admin/audit`
*Source:* `src/30-entry-admin.html` (section `admin/audit`, event drawer)
**Purpose.** Immutable record of every action by platform staff and system processes (7-year retention).
**Tables.** Primary: `Platform.PlatformAuditLogs` (append-only) · Reads: `Platform.PlatformStaff`, `Platform.Tenants`

| UI field / column | Table.column | Notes |
|---|---|---|
| Time | `PlatformAuditLogs.occurredAt` | |
| Actor (name + role / process) | `PlatformAuditLogs.actorLabel`, `staffUserId → PlatformStaff.role` | "system · billing-worker" |
| Action + category | `PlatformAuditLogs.action` | category chips (Impersonation / Billing / Security) are derived from the action prefix in Basic |
| Tenant | `PlatformAuditLogs.tenantId → Tenants.code` | |
| Details | `PlatformAuditLogs.details` | |
| IP address | `PlatformAuditLogs.ipAddress` | |
| Result Success / Failed / Blocked / Recorded | `PlatformAuditLogs.result` | chip "Failed 3" |
| Event payload JSON | `PlatformAuditLogs.payload` | |
| Filters actor / tenant / period / search | indexes `platformAuditLogTimeIdx`, `platformAuditLogTenantIdx` | |

**Statuses.** —
**Actions → effects.** *Export CSV* · *Copy JSON* · *Alert rules / Alert on this* → Full (`AuditAlertRules`). No update or delete is possible (trigger `Company.triggerAppendOnly`).
**Permission.** `SUPER_ADMIN`, `SUPPORT_LEAD` · **Approval.** —
