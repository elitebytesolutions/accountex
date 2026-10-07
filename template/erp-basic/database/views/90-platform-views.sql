-- =============================================================================
-- Finsoft ERP (BASIC) — views/90-platform-views.sql
-- SaaS console report views (install order: … → fk/* → 90-views → 91-rls → 95-seed).
--
-- Views named by entities/01-platform-admin.md (Basic):
--   Platform.getMrrByPlan       Platform Overview (plan split, plan mix)
--   Platform.getPlatformOverview   Platform Overview (MRR, ARR, tenants, churn)
--   Platform.getTenantsNeedingAttention  Platform Overview (Tenants needing attention)
--   Platform.getAllTenants   All Tenants (list + KPIs)
--   Platform.getSubscriptionKpis  Subscriptions (KPIs)
--   Platform.getMrrMovement      Subscriptions (MRR movement)
--
-- Basic has only the platform tables of Basic 01-platform.sql (plan,
-- SubscriptionPlanFeatures, coa_template(_account), tenant, TenantContacts, TenantModules,
-- subscription, PlatformStaff, audit_log). Consequences:
--   * subscription has no mrrAmount column: MRR is computed inline as
--     amount ÷ 12 for ANNUAL, else amount (same rule as the Full generated column).
--   * There is no SubscriptionEvents / PlatformInvoices / UsageSnapshots /
--     incident table: MRR history is rebuilt from subscription.startsOn /
--     trialEndsOn / cancelledAt with TODAY's amounts (approximation, the
--     prototype simulates it); expansion and contraction need subscription
--     events (Full only) and are returned as NULL; past due = subscription
--     amount of PAST_DUE subscriptions; seats in use need Company.Users (a
--     tenant table under RLS) and are returned as NULL — the API counts them.
--   * tenant has no churnedAt / isInternal: churn = subscription.cancelledAt.
--   * System health is external monitoring [simulated]: no view in Basic.
-- Rules
--   * platform.* is GLOBAL (no tenantId RLS): plain views for the console role.
--   * "Paying" subscription = status ACTIVE or PAST_DUE; trials carry no MRR.
--   * A subscription is paying from COALESCE(trialEndsOn, startsOn) until
--     cancelledAt.
--   * Views that read another view are declared after it in this file.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- v_mrr_by_plan — live paying tenants and MRR per plan (all plans listed).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getMrrByPlan" AS
WITH live AS (
  SELECT s."planId", s."tenantId", s.status,
         CASE WHEN s."billingCycle" = 'ANNUAL' THEN round(s.amount / 12, 2) ELSE s.amount END AS "mrrAmount"
    FROM "Platform"."Subscriptions" s
   WHERE s.status IN ('TRIAL','ACTIVE','PAST_DUE')
)
SELECT p.id                                                          AS "planId",
       p.code                                                        AS "planCode",
       p.name                                                        AS "planName",
       p."sortOrder",
       (count(DISTINCT l."tenantId") FILTER (WHERE l.status IN ('ACTIVE','PAST_DUE')))::integer AS tenants,
       COALESCE(sum(l."mrrAmount") FILTER (WHERE l.status IN ('ACTIVE','PAST_DUE')), 0)         AS mrr,
       round(100.0 * COALESCE(sum(l."mrrAmount") FILTER (WHERE l.status IN ('ACTIVE','PAST_DUE')), 0)
             / NULLIF(sum(sum(l."mrrAmount") FILTER (WHERE l.status IN ('ACTIVE','PAST_DUE'))) OVER (), 0), 1) AS "mrrSharePct",
       (count(DISTINCT l."tenantId") FILTER (WHERE l.status = 'TRIAL'))::integer               AS trials
  FROM "Platform"."SubscriptionPlans" p
  LEFT JOIN live l ON l."planId" = p.id
 GROUP BY p.id, p.code, p.name, p."sortOrder";

COMMENT ON VIEW "Platform"."getMrrByPlan" IS
  'Live paying tenants, MRR (amount, ÷ 12 when ANNUAL) and MRR share % per plan, plus running trials. Screen: admin/dashboard (plan split, plan mix).';


-- ---------------------------------------------------------------------------
-- v_mrr_movement — MRR movement per month, last 12 months (approximation).
--   new_mrr        subscriptions whose paying start (trialEndsOn or
--                  startsOn) falls in the month
--   churned_mrr    subscriptions cancelled in the month (negative)
--   expansion_mrr / contraction_mrr  need SubscriptionEvents (Full) → NULL
--   starting / ending  MRR of subscriptions paying at the month boundaries,
--                  valued at today's amounts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getMrrMovement" AS
WITH s AS (
  SELECT sb.id,
         COALESCE(sb."trialEndsOn", sb."startsOn")                              AS "paidFrom",
         sb."cancelledAt",
         CASE WHEN sb."billingCycle" = 'ANNUAL' THEN round(sb.amount / 12, 2) ELSE sb.amount END AS "mrrAmount"
    FROM "Platform"."Subscriptions" sb
   WHERE sb.status <> 'TRIAL'
),
months AS (
  SELECT g.m::date AS month, (g.m + interval '1 month')::date AS "nextMonth"
    FROM generate_series(date_trunc('month', current_date) - interval '11 months',
                         date_trunc('month', current_date), interval '1 month') AS g(m)
)
SELECT mo.month,
       date_trunc('quarter', mo.month)::date                         AS "quarterStart",
       (SELECT COALESCE(sum(s."mrrAmount"), 0) FROM s
         WHERE s."paidFrom" < mo.month
           AND (s."cancelledAt" IS NULL OR s."cancelledAt" >= mo.month))                     AS "startingMrr",
       (SELECT COALESCE(sum(s."mrrAmount"), 0) FROM s
         WHERE s."paidFrom" >= mo.month AND s."paidFrom" < mo."nextMonth")                    AS "newMrr",
       NULL::numeric(18,2)                                           AS "expansionMrr",     -- Full only (SubscriptionEvents)
       NULL::numeric(18,2)                                           AS "contractionMrr",   -- Full only (SubscriptionEvents)
       -(SELECT COALESCE(sum(s."mrrAmount"), 0) FROM s
          WHERE s."cancelledAt" >= mo.month AND s."cancelledAt" < mo."nextMonth"
            AND s."paidFrom" < mo."nextMonth")                                               AS "churnedMrr",
       (SELECT COALESCE(sum(s."mrrAmount"), 0) FROM s
         WHERE s."paidFrom" >= mo.month AND s."paidFrom" < mo."nextMonth")
       - (SELECT COALESCE(sum(s."mrrAmount"), 0) FROM s
           WHERE s."cancelledAt" >= mo.month AND s."cancelledAt" < mo."nextMonth"
             AND s."paidFrom" < mo."nextMonth")                                              AS "netNewMrr",
       (SELECT COALESCE(sum(s."mrrAmount"), 0) FROM s
         WHERE s."paidFrom" < mo."nextMonth"
           AND (s."cancelledAt" IS NULL OR s."cancelledAt" >= mo."nextMonth"))                AS "endingMrr",
       (SELECT count(*) FROM s
         WHERE s."paidFrom" >= mo.month AND s."paidFrom" < mo."nextMonth")::integer           AS "newCount",
       (SELECT count(*) FROM s
         WHERE s."cancelledAt" >= mo.month AND s."cancelledAt" < mo."nextMonth")::integer     AS "churnCount"
  FROM months mo;

COMMENT ON VIEW "Platform"."getMrrMovement" IS
  'MRR movement per month (12 months) rebuilt from subscription start / trial end / cancel dates at today''s amounts: starting, new, churn (−), net new, ending; expansion and contraction are NULL in Basic (need SubscriptionEvents, Full). Screen: admin/subscriptions (MRR movement).';


-- ---------------------------------------------------------------------------
-- v_admin_dashboard — one row of overview KPIs.
--   mrr / arr            live paying subscriptions
--   mrr_prev_month       ending_mrr of last month in v_mrr_movement
--                        (approximation, [simulated in prototype])
--   active_tenants       tenant.status ACTIVE / PAST_DUE / READ_ONLY
--   signups_by_month     jsonb [{month, signups}] of tenant.createdAt, 12 months
--   net_new_tenants      tenants activated this month − subscriptions
--                        cancelled this month
--   logo_churn_30d_pct   subscriptions cancelled in 30 d ÷ subscriptions
--                        paying 30 d ago
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getPlatformOverview" AS
WITH s AS (
  SELECT sb.*,
         COALESCE(sb."trialEndsOn", sb."startsOn")                              AS "paidFrom",
         CASE WHEN sb."billingCycle" = 'ANNUAL' THEN round(sb.amount / 12, 2) ELSE sb.amount END AS "mrrAmount"
    FROM "Platform"."Subscriptions" sb
),
cur AS (
  SELECT COALESCE(sum(s."mrrAmount"), 0) AS mrr FROM s WHERE s.status IN ('ACTIVE','PAST_DUE')
),
prev AS (
  SELECT m."endingMrr" AS mrr
    FROM "Platform"."getMrrMovement" m
   WHERE m.month = (date_trunc('month', current_date) - interval '1 month')::date
),
su AS (
  SELECT jsonb_agg(jsonb_build_object('month', to_char(g.m, 'YYYY-MM'),
                                      'signups', (SELECT count(*) FROM "Platform"."Tenants" t
                                                   WHERE t."createdAt" >= g.m
                                                     AND t."createdAt" <  g.m + interval '1 month'))
                   ORDER BY g.m) AS "signupsByMonth"
    FROM generate_series(date_trunc('month', current_date) - interval '11 months',
                         date_trunc('month', current_date), interval '1 month') AS g(m)
),
k AS (
  SELECT (SELECT count(*) FROM "Platform"."Tenants" t WHERE t.status IN ('ACTIVE','PAST_DUE','READ_ONLY'))  AS "activeTenants",
         (SELECT count(*) FROM "Platform"."Tenants" t WHERE t.status = 'TRIAL')                              AS "trialsRunning",
         (SELECT count(*) FROM "Platform"."Tenants" t WHERE t."activatedAt" >= date_trunc('month', current_date)) AS "activatedMonth",
         (SELECT count(*) FROM s WHERE s."cancelledAt" >= date_trunc('month', current_date))             AS "cancelledMonth",
         (SELECT count(*) FROM s WHERE s.status <> 'TRIAL'
                                   AND s."cancelledAt" >= now() - interval '30 days')                    AS churned30d,
         (SELECT count(*) FROM s WHERE s.status <> 'TRIAL'
                                   AND s."paidFrom" < (now() - interval '30 days')::date
                                   AND (s."cancelledAt" IS NULL OR s."cancelledAt" >= now() - interval '30 days')) AS "live30dAgo",
         (SELECT count(*) FROM s WHERE s.status <> 'TRIAL'
                                   AND s."cancelledAt" >= now() - interval '60 days'
                                   AND s."cancelledAt" <  now() - interval '30 days')                    AS "churnedPrev30d",
         (SELECT count(*) FROM s WHERE s.status <> 'TRIAL'
                                   AND s."paidFrom" < (now() - interval '60 days')::date
                                   AND (s."cancelledAt" IS NULL OR s."cancelledAt" >= now() - interval '60 days')) AS "live60dAgo"
)
SELECT cur.mrr,
       cur.mrr * 12                                                  AS arr,
       prev.mrr                                                      AS "mrrPrevMonth",
       round(100.0 * (cur.mrr - prev.mrr) / NULLIF(prev.mrr, 0), 1)  AS "mrrMomPct",
       k."activeTenants"::integer                                     AS "activeTenants",
       su."signupsByMonth",
       (k."activatedMonth" - k."cancelledMonth")::integer              AS "netNewTenants",
       k."trialsRunning"::integer                                     AS "trialsRunning",
       k.churned30d::integer                                        AS churned30d,
       round(100.0 * k.churned30d / NULLIF(k."live30dAgo", 0), 2)   AS "logoChurn30dPct",
       round(100.0 * k."churnedPrev30d" / NULLIF(k."live60dAgo", 0), 2) AS "logoChurnPrev30dPct"
  FROM cur CROSS JOIN k CROSS JOIN su
  LEFT JOIN prev ON true;

COMMENT ON VIEW "Platform"."getPlatformOverview" IS
  'Platform overview KPI row (Basic): MRR, ARR, previous month-end MRR and MoM % (rebuilt from subscription dates, [simulated in prototype]), active tenants, 12-month sign-ups (jsonb), net new tenants, trials, 30-day logo churn from subscription.cancelledAt. Screen: admin/dashboard.';


-- ---------------------------------------------------------------------------
-- v_tenant_attention — one row per tenant × issue (Basic sources only).
--   PAST_DUE / READ_ONLY  tenant.status
--   TRIAL_ENDING          TRIAL with trialEndsOn within 7 days
--   INACTIVE              no logins in 21 days (lastActiveAt)
--   LOW_HEALTH            healthScore < 50
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getTenantsNeedingAttention" AS
WITH t AS (
  SELECT tn.*, p.code AS "planCode", p.name AS "planName",
         CASE WHEN s."billingCycle" = 'ANNUAL' THEN round(s.amount / 12, 2) ELSE s.amount END AS "mrrAmount"
    FROM "Platform"."Tenants" tn
    LEFT JOIN "Platform"."Subscriptions" s
           ON s."tenantId" = tn.id AND s.status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED')
    LEFT JOIN "Platform"."SubscriptionPlans" p ON p.id = s."planId"
   WHERE tn.status <> 'CHURNED'
),
issues AS (
  SELECT t.id AS "tenantId", t.status::text AS "issueKind",
         CASE t.status WHEN 'PAST_DUE' THEN 'Payment past due' ELSE 'Read-only (unpaid)' END AS issue,
         t."updatedAt" AS since, 1 AS severity
    FROM t
   WHERE t.status IN ('PAST_DUE','READ_ONLY')
  UNION ALL
  SELECT t.id, 'TRIAL_ENDING', 'Trial ends ' || to_char(t."trialEndsOn", 'DD Mon'),
         t."trialEndsOn"::timestamptz, 2
    FROM t
   WHERE t.status = 'TRIAL' AND t."trialEndsOn" <= current_date + 7
  UNION ALL
  SELECT t.id, 'INACTIVE', 'No logins in ' || (current_date - t."lastActiveAt"::date) || ' days',
         t."lastActiveAt", 2
    FROM t
   WHERE t."lastActiveAt" < now() - interval '21 days'
  UNION ALL
  SELECT t.id, 'LOW_HEALTH', 'Health score ' || t."healthScore", t."updatedAt", 3
    FROM t
   WHERE t."healthScore" < 50
)
SELECT t.id                                                          AS "tenantId",
       t.code,
       t."displayName",
       t.status                                                      AS "tenantStatus",
       t."planCode",
       t."planName",
       i."issueKind",
       i.issue,
       i.since,
       i.severity,
       t."mrrAmount"                                                  AS mrr,
       t."accountOwnerStaffId"                                      AS "ownerStaffId",
       su."fullName"                                                  AS "ownerName"
  FROM issues i
  JOIN t ON t.id = i."tenantId"
  LEFT JOIN "Platform"."PlatformStaff" su ON su.id = t."accountOwnerStaffId";

COMMENT ON VIEW "Platform"."getTenantsNeedingAttention" IS
  'Tenants needing attention (Basic), one row per issue: PAST_DUE / READ_ONLY status, trial ending within 7 days, no logins in 21 days, health < 50; with plan, MRR and account owner. Screen: admin/dashboard (Tenants needing attention).';


-- ---------------------------------------------------------------------------
-- v_tenant_overview — one row per tenant; the KPI strip aggregates it.
--   past_due_amount  subscription amount when the subscription is PAST_DUE
--                    (Basic has no invoice table)
--   seats_in_use     needs Company.Users (tenant table) → NULL; the API fills it
--   health_bucket    HEALTHY ≥ 75, WATCH 50–74, AT_RISK < 50
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getAllTenants" AS
SELECT tn.id                                                         AS "tenantId",
       tn.code,
       tn."displayName",
       tn."legalName",
       tn.city,
       tn.province,
       tn.industry,
       tn.status,
       tn."healthScore",
       CASE WHEN tn."healthScore" >= 75 THEN 'HEALTHY'
            WHEN tn."healthScore" >= 50 THEN 'WATCH'
            WHEN tn."healthScore" IS NOT NULL THEN 'AT_RISK' END      AS "healthBucket",
       (tn."healthScore" < 50)                                        AS "isAtRisk",
       s.id                                                          AS "subscriptionId",
       s."planId",
       p.code                                                        AS "planCode",
       p.name                                                        AS "planName",
       s."billingCycle",
       s.status                                                      AS "subscriptionStatus",
       COALESCE(CASE WHEN s."billingCycle" = 'ANNUAL' THEN round(s.amount / 12, 2) ELSE s.amount END, 0) AS mrr,
       s.seats,
       NULL::integer                                                 AS "seatsInUse",   -- Company.Users count, done by the API
       COALESCE(md."modulesEnabled", 0)                               AS "modulesEnabled",
       md."moduleKeys",
       COALESCE(s."nextRenewalOn", tn."trialEndsOn")                 AS "renewalOn",
       tn."trialEndsOn",
       CASE WHEN s.status = 'PAST_DUE' THEN s.amount ELSE 0 END      AS "pastDueAmount",
       CASE WHEN s.status = 'PAST_DUE' THEN current_date - s."currentPeriodStart" END AS "oldestOverdueDays",
       oc."fullName"                                                  AS "ownerContactName",
       oc.email                                                      AS "ownerContactEmail",
       tn."accountOwnerStaffId",
       st."fullName"                                                  AS "accountOwnerName",
       tn."activatedAt",
       tn."lastActiveAt",
       tn."createdAt"
  FROM "Platform"."Tenants" tn
  LEFT JOIN "Platform"."Subscriptions" s
         ON s."tenantId" = tn.id AND s.status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED')
  LEFT JOIN "Platform"."SubscriptionPlans" p ON p.id = s."planId"
  LEFT JOIN "Platform"."PlatformStaff" st ON st.id = tn."accountOwnerStaffId"
  LEFT JOIN LATERAL (
         SELECT count(*)::integer                               AS "modulesEnabled",
                array_agg(tm."moduleKey" ORDER BY tm."moduleKey") AS "moduleKeys"
           FROM "Platform"."TenantModules" tm
          WHERE tm."tenantId" = tn.id AND tm.enabled) md ON true
  LEFT JOIN LATERAL (
         SELECT c."fullName", c.email
           FROM "Platform"."TenantContacts" c
          WHERE c."tenantId" = tn.id AND c."contactRole" = 'OWNER'
          ORDER BY c."isPrimary" DESC, c."createdAt"
          LIMIT 1) oc ON true;

COMMENT ON VIEW "Platform"."getAllTenants" IS
  'One row per tenant (Basic): status, health (bucket / at risk), plan, MRR, seats (seats in use NULL — Company.Users count by the API), modules, renewal, past due (= subscription amount when PAST_DUE), owner contact, account owner. Screen: admin/tenants (list + KPIs).';


-- ---------------------------------------------------------------------------
-- v_subscription_kpi — one row.
--   annual_pct            ANNUAL ÷ paying subscriptions (count)
--   renewals_30d(_amount) paying subscriptions renewing within 30 days
--   past_due_amount       Σ amount of PAST_DUE subscriptions (no invoices in Basic)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getSubscriptionKpis" AS
WITH s AS (
  SELECT sb.*,
         CASE WHEN sb."billingCycle" = 'ANNUAL' THEN round(sb.amount / 12, 2) ELSE sb.amount END AS "mrrAmount"
    FROM "Platform"."Subscriptions" sb
)
SELECT (SELECT COALESCE(sum("mrrAmount"), 0) FROM s WHERE status IN ('ACTIVE','PAST_DUE'))       AS mrr,
       (SELECT count(*) FROM s WHERE status IN ('ACTIVE','PAST_DUE'))::integer                   AS "payingSubscriptions",
       (SELECT count(*) FROM s WHERE status = 'TRIAL')::integer                                  AS "trialSubscriptions",
       (SELECT round(100.0 * count(*) FILTER (WHERE "billingCycle" = 'ANNUAL') / NULLIF(count(*), 0), 1)
          FROM s WHERE status IN ('ACTIVE','PAST_DUE'))                                         AS "annualPct",
       (SELECT round(100.0 * COALESCE(sum("mrrAmount") FILTER (WHERE "billingCycle" = 'ANNUAL'), 0)
                     / NULLIF(sum("mrrAmount"), 0), 1)
          FROM s WHERE status IN ('ACTIVE','PAST_DUE'))                                         AS "annualMrrPct",
       (SELECT count(*) FROM s WHERE status IN ('ACTIVE','PAST_DUE')
                                 AND "nextRenewalOn" BETWEEN current_date AND current_date + 30)::integer AS renewals30d,
       (SELECT COALESCE(sum(amount), 0) FROM s WHERE status IN ('ACTIVE','PAST_DUE')
                                 AND "nextRenewalOn" BETWEEN current_date AND current_date + 30)          AS "renewals30dAmount",
       (SELECT COALESCE(sum(amount), 0) FROM s WHERE status = 'PAST_DUE')                        AS "pastDueAmount",
       (SELECT count(DISTINCT "tenantId") FROM s WHERE status = 'PAST_DUE')::integer              AS "pastDueTenants";

COMMENT ON VIEW "Platform"."getSubscriptionKpis" IS
  'Subscription KPIs (Basic): MRR, paying / trial subscriptions, annual contracts % (count and MRR), renewals in 30 days (count, amount at stake), past due (= amount of PAST_DUE subscriptions). Screen: admin/subscriptions (KPIs).';
