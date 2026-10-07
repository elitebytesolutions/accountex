## Platform Admin (SaaS console) — Full

**Portal & personas.** The Finsoft Cloud console (`admin/*`) is used by Finsoft staff only, with roles Super Admin (locked to all permissions), Support Lead, Support Agent, Billing and Engineer. It runs without a tenant context (schema `Platform`, no RLS, role `finsoftPlatform` with a BYPASSRLS login for cross-tenant counts). Access requires SSO (SAML/Okta or Google Workspace), 2FA and the IP allow-list. Break-glass password login is for the Super Admin only.

**Screens (28).** Overview, All Tenants, Onboard Tenant, Tenant 360, Templates · SaaS Analytics, Leads CRM, Partners & Coupons · Plans & Pricing, Subscriptions, Platform Invoices, Dunning & Collections, Usage & Quotas · Feature Flags, Flag Detail, Segments, Plan Entitlements, Change Requests · Support Tickets, Announcements, Communications · System Health, Platform Audit Log, Status & Incidents, Security & Privacy, API & Webhooks, Tax Master · Platform Team.

Everything in the Basic platform scope applies, plus the sections below.

### Features
**Tenants & onboarding**
- Health score from six hourly signals: logins, modules adopted, invoices/week, payment status, support tickets and NPS (`Tenants.healthFactors`).
- Internal notes. Impersonation sessions are recorded, time-boxed and linked to a ticket.
- Tenant data export (ZIP / CSV / JSON, encrypted, link valid 24 h).
- Provisioning also seeds leave types and salary components from the master seed lists, raises the first platform invoice and sends the welcome message.

**Growth**
- SaaS analytics: MRR/ARR, MRR movement (new / expansion / contraction / churn), NRR, GRR, logo churn, ARPU, LTV:CAC, CAC payback, trial→paid funnel, MRR by plan, churn reasons, cohort retention M0–M11.
- Leads CRM Kanban: Lead → Demo → Trial → Paid → Churned. Sources: website, referral, partner, Facebook, LinkedIn, expo. Shows trial engagement and a win rate.
- Partners: Bronze/Silver/Gold/Platinum tiers, commission 10/15/20%, monthly statements with WHT 12% u/s 233, IBFT payout.
- Coupons: % or flat, duration once/3/6/12 months/forever, redemption cap, plan scope, new-customers-only, stackable with partner, schedule/pause/expire.

**Billing**
- Platform invoices `FS-INV-YYYY-NNNNN` with provincial sales tax on services (PRA 16%, SRB, KPRA, BRA by tenant province). Proration, add-on, overage and manual invoices.
- Payments by card, JazzCash, Easypaisa, Raast, direct debit and bank transfer, plus manual "Mark paid" and refunds.
- Dunning: grace (default 7 d) → read-only (7 d) → suspended (31 d) → cancel. Data is archived 90 d.
- Smart retries at 10:00 on salary-credit days (1st, 10th): card → JazzCash wallet → Raast request-to-pay. Promise-to-pay pauses retries.
- Reminders by email / SMS / WhatsApp at D−3…D+14 in English or Urdu.
- Usage & quotas: meters for users, branches, invoices/month, storage, API calls/day and /month, SMS, FBR submissions. Bars turn amber at 80% and red at 100%. Per-tenant overrides have an expiry and an overage choice. Alert rules are evaluated every 15 minutes (notify AM, email owner, throttle, block, offer add-on).

**Feature management**
- Flags typed release / kill switch / ops / experiment / entitlement, with category, lifecycle (define → develop → production → cleanup → archived), owner, tags, temporary + expiry, and boolean or multivariate variations.
- Three environments (Dev, Staging, Production).
- Targeting order: prerequisites → off → individual tenant targets → ordered rules (segment, plan, region, city, industry, tenant age, user role, app version, platform; in / not in / > / <) → default (percentage rollout or fixed variation).
- Sticky bucketing `hash(Tenants.code + '.' + key) % 100`.
- Scheduled ramps, evaluation insights (14 days), code references from a nightly scan of 3 repos, full audit with JSON diff, SDK keys per environment (server / client / mobile; rotation keeps the old key valid for 24 h).
- Segments: AND rules plus include/exclude lists, reused across flags.
- Plan entitlements: module/feature × plan matrix, limits (blank = unlimited), add-ons (POS terminal, WhatsApp + Rs 1.20/message, extra company, payroll per employee). An impact preview counts tenants gaining, losing or over a limit; options are grandfather until renewal, email owners, post to changelog.
- Change requests (`CR-NNNN`) for every Production change.

**Support & comms**
- Support tickets `TCK-NNNN`: Kanban by status, priority SLA, internal notes, attachments, CSAT.
- Announcements (release note, maintenance, compliance, billing) with severity, audience by plan / module / tenant, scheduled publish, banner and/or admin email, views and clicks.
- Communications: six lifecycle templates in English and Urdu (RTL) across email, SMS and WhatsApp, with merge variables, versions, test send, segment broadcasts and a delivery log with retry.

**System**
- System health: services, job queues, backups (nightly full + 15-min WAL, 35-day retention, AES-256, restore-tested).
- Status page: 8 components, 90-day uptime, incidents `INC-YYYY-NNN` (Investigating → Identified → Monitoring → Resolved, post-mortem within 5 working days), planned maintenance with in-app banner.
- Security & privacy: SSO, 2FA policy, IP allow-list, password policy (HIBP), admin sessions, privacy requests `PRV-YYYY-NNN` (export / delete, 30-day deadline, deletion needs two approvers, PECA 2016 / PDPB draft).
- API & webhooks: tenant API keys (live/test, scopes, rotation, revoke) and webhook endpoints (HMAC-SHA256 signed, 8 events, 6 attempts at 1m/5m/30m/2h/6h, replay, payload inspector).
- Tax master: sales tax by authority (FBR 18% goods; PRA/SRB/KPRA/BRA on services) with future-dated changes and legal reference, WHT sections with ATL / non-ATL rates and thresholds, salary slabs u/s 149 per tax year, FBR DI / PRA e-invoicing endpoints (sandbox / production), publish to tenants.
- Platform team: editable role × permission matrix (14 permissions); tenant scope all / by region / specific tenants.

### Business rules
- Four eyes in Production: every Production flag change needs one approval from a chosen approver. The requester can never approve (CHECK + trigger). Only one pending CR per flag × environment. Kill switches bypass approval after typing the key, are logged as emergency, and page on-call.
- A flag key is snake_case, 3–60 characters, unique and immutable. Temporary flags need an expiry. Stale = 100% for 60 days, past expiry, or no evaluations. Archived flags stop evaluating.
- Entitlements are commercial and never driven by release rollouts. Saving the entitlement matrix rewrites the plan rule of the linked entitlement flags.
- Invoice arithmetic: net = gross − discount; total = net + tax; balance = total − paid. Payments keep `paidAmount` / status in step (trigger). Invoices are never deleted (VOID with reason). OVERDUE is derived.
- One dunning case per unpaid invoice. A promise-to-pay needs a date and source. Recovery closes the case and restores access.
- Partner payout: net = gross − WHT (12% u/s 233).
- Coupons: code 4–24 chars `[A-Z0-9-]`, case-insensitive unique; percent ≤ 100; one redemption per tenant per coupon.
- Usage overrides need a reason; only one live override per tenant × meter. "Never" means no expiry date.
- Privacy deletion needs two distinct approvers and typing the tenant code; a completion certificate is issued.
- Tax master rate ranges never overlap per authority × nature (exclusion constraint). Changes need a legal reference (Finance Act / SRO).
- API keys and SDK secrets are stored hashed (shown once). Revealing a stored secret is audited. Rotation grace is 24 h.
- Impersonation: one live session per staff member, reason required, 30/60 min, read-only by default.

### Statuses
- Platform invoice: DRAFT → OPEN → PARTIALLY_PAID → PAID · OVERDUE (derived) · VOID · UNCOLLECTIBLE.
- Platform payment: PENDING → SUCCEEDED / FAILED; SUCCEEDED → PARTIALLY_REFUNDED / REFUNDED.
- Dunning case: GRACE → READ_ONLY → SUSPENDED → COLLECTIONS; PROMISE; closed RECOVERED / CANCELLED / WRITTEN_OFF.
- Lead: LEAD → DEMO → TRIAL → PAID / CHURNED. Partner payout DUE → PAID. Coupon SCHEDULED → ACTIVE ⇄ PAUSED → EXPIRED.
- Flag stage DEFINE → DEVELOP → PRODUCTION → CLEANUP → ARCHIVED. Change request PENDING → APPROVED / REJECTED / CANCELLED. SDK key ACTIVE → GRACE → REVOKED.
- Ticket NEW → IN_PROGRESS ⇄ WAITING_ON_CUSTOMER → RESOLVED → CLOSED. Announcement DRAFT → SCHEDULED → PUBLISHED → ARCHIVED.
- Incident INVESTIGATING → IDENTIFIED → MONITORING → RESOLVED. Maintenance SCHEDULED → IN_PROGRESS → COMPLETED / CANCELLED.
- Privacy request RECEIVED → VERIFIED → APPROVED → PROCESSING → DONE / REJECTED. Backup RUNNING → COMPLETED / FAILED.

### Integrations
- Payments: card gateway (3-D Secure), JazzCash, Easypaisa, Raast request-to-pay, bank direct-debit mandates (Meezan, UBL), IBFT for partner payouts.
- Messaging: email (SES + backup SMTP), SMS (Jazz with Telenor failover), WhatsApp Business API.
- Identity: SAML 2.0 (Okta), Google Workspace OAuth, WebAuthn hardware keys, TOTP, HIBP breached-password check.
- Tax: FBR Digital Invoicing (PRAL IRIS) and PRA e-invoicing, sandbox and production; FBR ATL lookup.
- Monitoring: job queues (Sidekiq/BullMQ), backups to the PK-Karachi DR site, status.finsoft.pk subscribers.
- Feature-flag SDKs: `@finsoft/flags-node` (server), browser client ID, mobile key (Android, iOS, booker app).
