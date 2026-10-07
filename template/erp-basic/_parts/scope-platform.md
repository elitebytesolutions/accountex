## Platform Admin (SaaS console) — Basic

**Portal & personas.** The Finsoft Cloud console (`admin/*`) is used by Finsoft staff only: Super Admin, Support Lead, Support Agent, Billing, Engineer. It works across all tenants and runs without a tenant context (schema `Platform`, no RLS, role `finsoftPlatform`).

**Screens (9).** Platform Overview (`admin/dashboard`), All Tenants, Onboard Tenant, Tenant 360, Plans & Pricing, Subscriptions, Templates, Platform Team, Platform Audit Log.

### Features
- **Tenant registry.** Code (4–10 characters, permanent, unique), subdomain `<code>.finsoft.pk`, legal identity (NTN, STRN, SECP #), industry, city/province, configuration (fiscal-year start Jul/Jan/Apr, PKR, Asia/Karachi, number/date format, data residency PK-Lahore or UAE-Dubai), COA template, MFA / SSO flags, health score, account manager.
- **Onboarding wizard** (5 steps). Company & legal → plan & modules (12 module codes; add-ons) → first administrator (tenant owner, invite valid 72 h) → configuration → review & provision. Provisioning creates the tenant's company, branch, owner user, chart of accounts (copied from `ChartOfAccountsTemplateAccounts`), FY 2026-27 with 12 periods, Pakistani tax codes and number series (`{PREFIX}-{YYYY}-{SEQ6}`, yearly reset).
- **Tenant list and Tenant 360.** Views (at risk, trials ending, past due, enterprise), filters by plan, status, region and city, MRR, seats used vs bought, modules. Bulk extend trial, change plan, send notice, suspend. Tenant 360 adds impersonation (recorded in the audit log), plan change with proration, data export, suspend/reactivate, and tenant user admin (invite, MFA reset, password reset, deactivate).
- **Plans & pricing.** Starter Rs 9,999 · Growth Rs 24,999 · Business Rs 49,999 · Enterprise (custom, list 180,000) per month; annual = 2 months free; seats, storage, trial 14/30 days, plan × module matrix (Included / Add-on with price / Not available).
- **Subscriptions.** Monthly / annual cycle, amount, seats, period, next renewal, payment method (card, JazzCash, Easypaisa, Raast, bank transfer, direct debit, invoice), auto-renew. KPIs: MRR, annual share, renewals due in 30 days, past due.
- **COA templates.** Versioned (v2026.2), 4-level tree with Dr/Cr nature and default account roles.
- **Platform team.** Staff, role, 2FA type, tenant scope, status.
- **Platform audit log.** Append-only, 7-year retention, actor/tenant/period filters, CSV export.

### Business rules
- One live subscription per tenant (TRIAL / ACTIVE / PAST_DUE / SUSPENDED).
- Plan price changes apply to new subscriptions and renewals only. Existing tenants are grandfathered.
- Tenant code and subdomain are unique and never change.
- Exactly one primary OWNER contact per tenant. The owner user cannot be deactivated (transfer ownership first).
- Suspending a tenant signs all its users out. Data is retained, and scheduled jobs (payroll, recurring vouchers) pause until reactivation.
- Impersonation requires a reason, is time-boxed (30/60 min), read-only by default and visible to the tenant. Start and end are written to `Platform.PlatformAuditLogs`.
- An active staff member must have a password hash (or SSO). Every console action is audited, and the audit log rejects UPDATE/DELETE.
- Subscription changes are field-audited into `Company.AuditTrailEntries` (generic trigger).

### Statuses
- Tenant: PROVISIONING → TRIAL → ACTIVE ⇄ PAST_DUE → READ_ONLY → SUSPENDED → CHURNED.
- Subscription: TRIAL → ACTIVE ⇄ PAST_DUE → SUSPENDED → CANCELLED / EXPIRED.
- Plan: ACTIVE / RETIRED. COA template: DRAFT → PUBLISHED → DEFAULT → RETIRED. Staff: INVITED → ACTIVE → SUSPENDED / DISABLED.
- Audit result: SUCCESS / FAILED / BLOCKED / RECORDED.

### Integrations
- FBR Active Taxpayer List lookup for NTN/STRN at onboarding **[simulated]**.
- Transactional email for invitations and notices (`no-reply@finsoft.pk`).
- DNS/TLS for `<code>.finsoft.pk` at provisioning.

### Not in Basic (Full only)
SaaS analytics, leads CRM, partners & coupons, platform invoices, payments and dunning, usage & quotas, feature management (flags, segments, entitlements, change requests), support tickets, announcements, communications, system health, status & incidents, security & privacy, API keys & webhooks, tax master, master seed lists, role-permission matrix, tenant notes.
