-- =============================================================================
-- Finsoft ERP (FULL) — views/90-platform-views.sql
-- SaaS console report views (install order: … → fk/* → 90-views → 91-rls → 95-seed).
--
-- Views named by entities/01-platform-admin.md (Full):
--   Platform.getMrrByMonth            SaaS Analytics (MRR hero, MRR by plan), Overview (month-end MRR)
--   Platform.getMrrMovement           Overview (MRR flow), SaaS Analytics (waterfall), Subscriptions
--   Platform.getMrrByPlan            Overview (plan split / plan mix)
--   Platform.getPlatformOverview        Overview (MRR, ARR, tenants, churn)
--   Platform.getTenantsNeedingAttention       Overview (Tenants needing attention)
--   Platform.getAllTenants        All Tenants (list + KPIs)
--   Platform.getSaasKpis               SaaS Analytics (NRR, GRR, churn, ARPU, LTV, CAC)
--   Platform.getCohortRetention       SaaS Analytics (cohort heatmap)
--   Platform.getChurnReasons          SaaS Analytics (Why tenants churn)
--   Platform.getTrialFunnel           SaaS Analytics (Trial → paid funnel)
--   Platform.getSubscriptionKpis       Subscriptions (KPIs)
--   Platform.getPlatformBillingByMonth            Platform Invoices (KPIs)
--   Platform.getCollectionsQueue          Dunning & Collections (queue, age buckets)
--   Platform.getDunningKpis            Dunning & Collections (KPIs)
--   Platform.getCurrentUsage          Usage & Quotas
--   Platform.getFeatureFlagSummary           Feature Flags (KPIs)
--   Platform.getFlagChangeRequestKpis                 Change Requests (KPIs)
--   Platform.getSupportTicketKpis            Support Tickets (KPIs)
--   Platform.getResellerCommissions     Partners & Coupons (KPIs, partner cards)
--   Platform.getPlatformLeadPipeline          Leads CRM (pipeline stats)
--   Platform.getStatusComponentHistory Status & Incidents (90-day component bars)
--   Platform.getSystemHealth         Overview (System health), System Health
--
-- Rules
--   * platform.* is GLOBAL (no tenantId RLS): these are plain views read by
--     the platform console role. No view here reads a tenant-schema table.
--   * Revenue is PKR excluding tax. "Paying" subscription = status ACTIVE or
--     PAST_DUE (trials carry no MRR). Internal tenants (tenant.isInternal:
--     FSQA / FSDEMO / FSSTAFF) are excluded from every revenue and growth metric.
--   * Month-end MRR history comes from Platform.SubscriptionEvents
--     (append-only, mrrBefore / mrrAfter / movement): the MRR of a
--     subscription at a date = mrrAfter of its latest event effective on or
--     before that date.
--   * Values with no data source are returned as NULL and marked [simulated]
--     (website visitors, CAC, latency, monitoring uptime, IRIS state …).
--   * Views that read another view are declared after it in this file.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- v_mrr_monthly — month-end MRR per plan, last 25 months (current month = as
-- of today). plan = toPlanId of the latest plan-changing event, else the
-- subscription's plan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getMrrByMonth" AS
WITH months AS (
  SELECT g.m::date                                   AS month,
         (g.m + interval '1 month')::date            AS "nextMonth"
    FROM generate_series(date_trunc('month', current_date) - interval '24 months',
                         date_trunc('month', current_date), interval '1 month') AS g(m)
),
snap AS (
  SELECT mo.month, s.id AS "subscriptionId", s."tenantId", ev."mrrAfter",
         COALESCE(pl."toPlanId", s."planId")          AS "planId"
    FROM months mo
   CROSS JOIN "Platform"."Subscriptions" s
    JOIN "Platform"."Tenants" t ON t.id = s."tenantId" AND NOT t."isInternal"
    JOIN LATERAL (
           SELECT e."mrrAfter"
             FROM "Platform"."SubscriptionEvents" e
            WHERE e."subscriptionId" = s.id AND e."effectiveOn" < mo."nextMonth"
            ORDER BY e."effectiveOn" DESC, e."occurredAt" DESC
            LIMIT 1) ev ON true
    LEFT JOIN LATERAL (
           SELECT e."toPlanId"
             FROM "Platform"."SubscriptionEvents" e
            WHERE e."subscriptionId" = s.id AND e."effectiveOn" < mo."nextMonth"
              AND e."toPlanId" IS NOT NULL
            ORDER BY e."effectiveOn" DESC, e."occurredAt" DESC
            LIMIT 1) pl ON true
   WHERE ev."mrrAfter" > 0
)
SELECT sn.month,
       sn."planId",
       p.code                                                        AS "planCode",
       p.name                                                        AS "planName",
       sum(sn."mrrAfter")                                             AS mrr,
       sum(sn."mrrAfter") * 12                                        AS arr,
       count(*)::integer                                             AS subscriptions,
       count(DISTINCT sn."tenantId")::integer                         AS tenants
  FROM snap sn
  JOIN "Platform"."SubscriptionPlans" p ON p.id = sn."planId"
 GROUP BY sn.month, sn."planId", p.code, p.name;

COMMENT ON VIEW "Platform"."getMrrByMonth" IS
  'Month-end MRR / ARR / paying subscriptions per plan for the last 25 months, rebuilt from SubscriptionEvents (internal tenants excluded). Totals = SUM over plans. Screens: admin/analytics (MRR hero, MRR by plan), admin/dashboard (month-end values).';


-- ---------------------------------------------------------------------------
-- v_mrr_movement — MRR waterfall per month, last 24 months.
--   new / expansion / reactivation (+), contraction / churn (−) =
--   Σ SubscriptionEvents.mrrDelta by movement; other = deltas of NONE events
--   starting = previous month-end MRR, ending = this month-end MRR
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getMrrMovement" AS
WITH months AS (
  SELECT g.m::date AS month
    FROM generate_series(date_trunc('month', current_date) - interval '23 months',
                         date_trunc('month', current_date), interval '1 month') AS g(m)
),
mv AS (
  SELECT date_trunc('month', e."effectiveOn")::date                                 AS month,
         COALESCE(sum(e."mrrDelta") FILTER (WHERE e.movement = 'NEW'), 0)           AS "newMrr",
         COALESCE(sum(e."mrrDelta") FILTER (WHERE e.movement = 'EXPANSION'), 0)     AS "expansionMrr",
         COALESCE(sum(e."mrrDelta") FILTER (WHERE e.movement = 'REACTIVATION'), 0)  AS "reactivationMrr",
         COALESCE(sum(e."mrrDelta") FILTER (WHERE e.movement = 'CONTRACTION'), 0)   AS "contractionMrr",
         COALESCE(sum(e."mrrDelta") FILTER (WHERE e.movement = 'CHURN'), 0)         AS "churnedMrr",
         COALESCE(sum(e."mrrDelta") FILTER (WHERE e.movement = 'NONE'), 0)          AS "otherMrr",
         count(*) FILTER (WHERE e.movement = 'NEW')                                AS "newCount",
         count(*) FILTER (WHERE e.movement = 'EXPANSION')                          AS "expansionCount",
         count(*) FILTER (WHERE e.movement = 'CONTRACTION')                        AS "contractionCount",
         count(*) FILTER (WHERE e.movement = 'CHURN')                              AS "churnCount"
    FROM "Platform"."SubscriptionEvents" e
    JOIN "Platform"."Tenants" t ON t.id = e."tenantId" AND NOT t."isInternal"
   GROUP BY date_trunc('month', e."effectiveOn")
),
tot AS (
  SELECT m.month, sum(m.mrr) AS mrr FROM "Platform"."getMrrByMonth" m GROUP BY m.month
)
SELECT mo.month,
       date_trunc('quarter', mo.month)::date                         AS "quarterStart",
       COALESCE(prev.mrr, 0)                                         AS "startingMrr",
       COALESCE(mv."newMrr", 0)                                       AS "newMrr",
       COALESCE(mv."expansionMrr", 0)                                 AS "expansionMrr",
       COALESCE(mv."reactivationMrr", 0)                              AS "reactivationMrr",
       COALESCE(mv."contractionMrr", 0)                               AS "contractionMrr",
       COALESCE(mv."churnedMrr", 0)                                   AS "churnedMrr",
       COALESCE(mv."otherMrr", 0)                                     AS "otherMrr",
       COALESCE(mv."newMrr" + mv."expansionMrr" + mv."reactivationMrr"
                + mv."contractionMrr" + mv."churnedMrr", 0)            AS "netNewMrr",
       COALESCE(cur.mrr, 0)                                          AS "endingMrr",
       COALESCE(mv."newCount", 0)::integer                            AS "newCount",
       COALESCE(mv."expansionCount", 0)::integer                      AS "expansionCount",
       COALESCE(mv."contractionCount", 0)::integer                    AS "contractionCount",
       COALESCE(mv."churnCount", 0)::integer                          AS "churnCount"
  FROM months mo
  LEFT JOIN mv        ON mv.month = mo.month
  LEFT JOIN tot cur   ON cur.month = mo.month
  LEFT JOIN tot prev  ON prev.month = (mo.month - interval '1 month')::date;

COMMENT ON VIEW "Platform"."getMrrMovement" IS
  'MRR movement per month (24 months): starting, new, expansion, reactivation, contraction (−), churn (−), other, net new, ending MRR and event counts, from SubscriptionEvents.movement / mrrDelta. Quarterly = GROUP BY quarter_start. Screens: admin/dashboard (MRR flow, Expansion), admin/analytics (waterfall), admin/subscriptions (MRR movement).';


-- ---------------------------------------------------------------------------
-- v_mrr_by_plan — live MRR and tenants per plan (all plans listed).
--   tenants / mrr  paying subscriptions (ACTIVE, PAST_DUE)
--   trials         TRIAL subscriptions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getMrrByPlan" AS
WITH live AS (
  SELECT s."planId", s."tenantId", s.status, s."mrrAmount"
    FROM "Platform"."Subscriptions" s
    JOIN "Platform"."Tenants" t ON t.id = s."tenantId" AND NOT t."isInternal"
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
  'Live paying tenants, MRR and MRR share % per plan, plus running trials (internal tenants excluded). Screen: admin/dashboard (plan split, plan mix).';


-- ---------------------------------------------------------------------------
-- v_admin_dashboard — one row of overview KPIs.
--   mrr                 Σ mrrAmount of paying subscriptions (live)
--   mrr_prev_month      previous month-end MRR (v_mrr_monthly)
--   active_tenants      tenant.status ACTIVE / PAST_DUE / READ_ONLY
--   signups_by_month    jsonb [{month, signups}] last 12 months (tenant.createdAt)
--   net_new_tenants     activated − churned this month
--   logo_churn_30d_pct  tenants churned in 30 d ÷ tenants live 30 d ago
--   logo_churn_prev_30d_pct the same for the 30 days before (vs-last-month delta)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getPlatformOverview" AS
WITH t AS (
  SELECT * FROM "Platform"."Tenants" WHERE NOT "isInternal"
),
cur AS (
  SELECT COALESCE(sum(s."mrrAmount"), 0) AS mrr
    FROM "Platform"."Subscriptions" s
    JOIN t ON t.id = s."tenantId"
   WHERE s.status IN ('ACTIVE','PAST_DUE')
),
prev AS (
  SELECT sum(m.mrr) AS mrr
    FROM "Platform"."getMrrByMonth" m
   WHERE m.month = (date_trunc('month', current_date) - interval '1 month')::date
),
mv AS (
  SELECT * FROM "Platform"."getMrrMovement" WHERE month = date_trunc('month', current_date)::date
),
su AS (
  SELECT jsonb_agg(jsonb_build_object('month', to_char(g.m, 'YYYY-MM'),
                                      'signups', (SELECT count(*) FROM t
                                                   WHERE t."createdAt" >= g.m
                                                     AND t."createdAt" <  g.m + interval '1 month'))
                   ORDER BY g.m) AS "signupsByMonth"
    FROM generate_series(date_trunc('month', current_date) - interval '11 months',
                         date_trunc('month', current_date), interval '1 month') AS g(m)
),
k AS (
  SELECT (SELECT count(*) FROM t WHERE t.status IN ('ACTIVE','PAST_DUE','READ_ONLY'))           AS "activeTenants",
         (SELECT count(*) FROM t WHERE t.status = 'TRIAL')                                       AS "trialsRunning",
         (SELECT count(*) FROM t WHERE t."activatedAt" >= date_trunc('month', current_date))      AS "activatedMonth",
         (SELECT count(*) FROM t WHERE t."churnedAt"  >= date_trunc('month', current_date))       AS "churnedMonth",
         (SELECT count(*) FROM t WHERE t."churnedAt"  >= now() - interval '30 days')              AS churned30d,
         (SELECT count(*) FROM t WHERE t."activatedAt" < now() - interval '30 days'
                                   AND (t."churnedAt" IS NULL OR t."churnedAt" >= now() - interval '30 days')) AS "live30dAgo",
         (SELECT count(*) FROM t WHERE t."churnedAt" >= now() - interval '60 days'
                                   AND t."churnedAt" <  now() - interval '30 days')               AS "churnedPrev30d",
         (SELECT count(*) FROM t WHERE t."activatedAt" < now() - interval '60 days'
                                   AND (t."churnedAt" IS NULL OR t."churnedAt" >= now() - interval '60 days')) AS "live60dAgo"
)
SELECT cur.mrr,
       cur.mrr * 12                                                  AS arr,
       prev.mrr                                                      AS "mrrPrevMonth",
       round(100.0 * (cur.mrr - prev.mrr) / NULLIF(prev.mrr, 0), 1)  AS "mrrMomPct",
       COALESCE(mv."expansionMrr", 0)                                 AS "expansionMtd",
       COALESCE(mv."newMrr", 0)                                       AS "newMrrMtd",
       k."activeTenants"::integer                                     AS "activeTenants",
       su."signupsByMonth",
       (k."activatedMonth" - k."churnedMonth")::integer                AS "netNewTenants",
       k."trialsRunning"::integer                                     AS "trialsRunning",
       k.churned30d::integer                                        AS churned30d,
       round(100.0 * k.churned30d / NULLIF(k."live30dAgo", 0), 2)   AS "logoChurn30dPct",
       round(100.0 * k."churnedPrev30d" / NULLIF(k."live60dAgo", 0), 2) AS "logoChurnPrev30dPct"
  FROM cur CROSS JOIN k CROSS JOIN su
  LEFT JOIN prev ON true
  LEFT JOIN mv   ON true;

COMMENT ON VIEW "Platform"."getPlatformOverview" IS
  'Platform overview KPI row: MRR, ARR, previous month-end MRR and MoM %, expansion / new MRR this month, active tenants, 12-month sign-ups (jsonb), net new tenants, trials running, 30-day logo churn (and prior 30 days). Screen: admin/dashboard.';


-- ---------------------------------------------------------------------------
-- v_tenant_attention — one row per tenant × issue (non-churned, non-internal).
--   PAYMENT_FAILED  open DunningCases ("Payment failed (attempt n)"), since openedAt
--   USAGE_HIGH      latest UsageSnapshots ≥ 80 % of limit, since snapshotDate
--   INACTIVE        lastActiveAt older than 21 days
--   TRIAL_ENDING    TRIAL with trialEndsOn within 7 days
--   LOW_HEALTH      healthScore < 50
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getTenantsNeedingAttention" AS
WITH t AS (
  SELECT tn.*, s."mrrAmount", p.code AS "planCode", p.name AS "planName"
    FROM "Platform"."Tenants" tn
    LEFT JOIN "Platform"."Subscriptions" s
           ON s."tenantId" = tn.id AND s.status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED')
    LEFT JOIN "Platform"."SubscriptionPlans" p ON p.id = s."planId"
   WHERE NOT tn."isInternal" AND tn.status <> 'CHURNED'
),
issues AS (
  SELECT dc."tenantId", 'PAYMENT_FAILED'::text AS "issueKind",
         'Payment failed (attempt ' || dc."attemptsCount" || ')'
           || COALESCE(' · ' || dc."lastFailureReason", '')               AS issue,
         dc."openedAt"                                                     AS since, 1 AS severity
    FROM "Platform"."DunningCases" dc
   WHERE dc.stage NOT IN ('RECOVERED','CANCELLED','WRITTEN_OFF')
  UNION ALL
  SELECT u."tenantId", 'USAGE_HIGH',
         um.name || ' ' || round(100 * u."usedValue" / u."limitValue") || '% of '
           || trim(to_char(u."limitValue", 'FM999999999990.###')) || COALESCE(' ' || um.unit, ''),
         u."snapshotDate"::timestamptz, CASE WHEN u."usedValue" >= u."limitValue" THEN 1 ELSE 2 END
    FROM (SELECT DISTINCT ON (us."tenantId", us."usageMeterId") us.*
            FROM "Platform"."UsageSnapshots" us
           ORDER BY us."tenantId", us."usageMeterId", us."snapshotDate" DESC) u
    JOIN "Platform"."UsageMeters" um ON um.id = u."usageMeterId"
   WHERE u."limitValue" > 0 AND u."usedValue" >= 0.8 * u."limitValue"
  UNION ALL
  SELECT t.id, 'INACTIVE', 'No logins in ' || (current_date - t."lastActiveAt"::date) || ' days',
         t."lastActiveAt", 2
    FROM t
   WHERE t."lastActiveAt" < now() - interval '21 days'
  UNION ALL
  SELECT t.id, 'TRIAL_ENDING', 'Trial ends ' || to_char(t."trialEndsOn", 'DD Mon'),
         t."trialEndsOn"::timestamptz, 2
    FROM t
   WHERE t.status = 'TRIAL' AND t."trialEndsOn" <= current_date + 7
  UNION ALL
  SELECT t.id, 'LOW_HEALTH', 'Health score ' || t."healthScore",
         t."healthUpdatedAt", 3
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
  'Tenants needing attention, one row per issue: failed payment (open dunning case), usage ≥ 80 % of a limit, no logins in 21 days, trial ending within 7 days, health < 50; with plan, MRR and account owner. Screen: admin/dashboard (Tenants needing attention).';


-- ---------------------------------------------------------------------------
-- v_tenant_overview — one row per tenant for the All Tenants list; the KPI
-- strip is an aggregate of it.
--   seats_in_use        latest USERS UsageSnapshots (active users)
--   past_due_amount     Σ balance of OPEN / PARTIALLY_PAID invoices past dueOn
--   oldest_overdue_days max(today − dueOn) of those invoices
--   health_bucket       HEALTHY ≥ 75, WATCH 50–74, AT_RISK < 50
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
       tn."isInternal",
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
       COALESCE(s."mrrAmount", 0)                                     AS mrr,
       s.seats,
       us."usedValue"::integer                                        AS "seatsInUse",
       COALESCE(md."modulesEnabled", 0)                               AS "modulesEnabled",
       md."moduleKeys",
       COALESCE(s."nextRenewalOn", tn."trialEndsOn")                 AS "renewalOn",
       tn."trialEndsOn",
       COALESCE(od."pastDueAmount", 0)                               AS "pastDueAmount",
       od."oldestOverdueDays",
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
         SELECT x."usedValue"
           FROM "Platform"."UsageSnapshots" x
           JOIN "Platform"."UsageMeters" m ON m.id = x."usageMeterId" AND m.code = 'USERS'
          WHERE x."tenantId" = tn.id
          ORDER BY x."snapshotDate" DESC
          LIMIT 1) us ON true
  LEFT JOIN LATERAL (
         SELECT count(*)::integer                         AS "modulesEnabled",
                array_agg(tm."moduleKey" ORDER BY tm."moduleKey") AS "moduleKeys"
           FROM "Platform"."TenantModules" tm
          WHERE tm."tenantId" = tn.id AND tm.enabled) md ON true
  LEFT JOIN LATERAL (
         SELECT sum(i."balanceAmount")                     AS "pastDueAmount",
                max(current_date - i."dueOn")              AS "oldestOverdueDays"
           FROM "Platform"."PlatformInvoices" i
          WHERE i."tenantId" = tn.id AND i.status IN ('OPEN','PARTIALLY_PAID')
            AND i."dueOn" < current_date AND i."balanceAmount" > 0) od ON true
  LEFT JOIN LATERAL (
         SELECT c."fullName", c.email
           FROM "Platform"."TenantContacts" c
          WHERE c."tenantId" = tn.id AND c."contactRole" = 'OWNER'
          ORDER BY c."isPrimary" DESC, c."createdAt"
          LIMIT 1) oc ON true;

COMMENT ON VIEW "Platform"."getAllTenants" IS
  'One row per tenant: status, health (bucket / at risk), plan, MRR, seats and seats in use (USERS usage), modules, renewal, past-due amount and oldest overdue days, owner contact, account owner. KPIs (live, trial, at risk, past due, seats in use) aggregate it. Screen: admin/tenants.';


-- ---------------------------------------------------------------------------
-- v_saas_kpi — one row per look-back period (1, 3, 6, 12 months; the period
-- starts on the 1st of the month period_months − 1 months ago).
--   start_mrr        MRR on the day before the period start
--   nrr_period_pct   (start + expansion + contraction + churn) ÷ start
--                    (contraction / churn are negative deltas)
--   grr_period_pct   (start + contraction + churn) ÷ start
--   nrr_pct/grr_pct  the period ratio annualised: ratio ^ (12 ÷ months)
--   logo_churn_pct   CHURN events in period ÷ paying subscriptions at start
--   arpu             current MRR ÷ paying tenants
--   ltv              arpu × 0.82 gross margin ÷ monthly logo churn rate
--                    (82 % margin is a fixed assumption [simulated])
--   cac, cac_payback_months, ltv_cac_ratio  [simulated]: sales & marketing
--                    spend is not modelled → NULL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getSaasKpis" AS
WITH per AS (
  SELECT p."periodMonths",
         (date_trunc('month', current_date) - (p."periodMonths" - 1) * interval '1 month')::date AS "periodStart"
    FROM unnest(ARRAY[1, 3, 6, 12]) AS p("periodMonths")
),
"startMrr" AS (
  SELECT per."periodMonths",
         COALESCE(sum(ev."mrrAfter"), 0)                    AS "startMrr",
         count(*) FILTER (WHERE ev."mrrAfter" > 0)          AS "startSubscriptions"
    FROM per
   CROSS JOIN "Platform"."Subscriptions" s
    JOIN "Platform"."Tenants" t ON t.id = s."tenantId" AND NOT t."isInternal"
    JOIN LATERAL (
           SELECT e."mrrAfter"
             FROM "Platform"."SubscriptionEvents" e
            WHERE e."subscriptionId" = s.id AND e."effectiveOn" < per."periodStart"
            ORDER BY e."effectiveOn" DESC, e."occurredAt" DESC
            LIMIT 1) ev ON true
   GROUP BY per."periodMonths"
),
mv AS (
  SELECT per."periodMonths",
         COALESCE(sum(e."mrrDelta") FILTER (WHERE e.movement = 'EXPANSION'), 0)   AS expansion,
         COALESCE(sum(e."mrrDelta") FILTER (WHERE e.movement = 'CONTRACTION'), 0) AS contraction,
         COALESCE(sum(e."mrrDelta") FILTER (WHERE e.movement = 'CHURN'), 0)       AS churn,
         COALESCE(sum(e."mrrDelta") FILTER (WHERE e.movement = 'NEW'), 0)         AS "newMrr",
         count(*) FILTER (WHERE e.movement = 'CHURN')                            AS "churnEvents"
    FROM per
    LEFT JOIN ("Platform"."SubscriptionEvents" e
               JOIN "Platform"."Tenants" t ON t.id = e."tenantId" AND NOT t."isInternal")
           ON e."effectiveOn" >= per."periodStart" AND e."effectiveOn" <= current_date
   GROUP BY per."periodMonths"
),
cur AS (
  SELECT COALESCE(sum(s."mrrAmount"), 0)                 AS mrr,
         count(DISTINCT s."tenantId")                    AS "payingTenants"
    FROM "Platform"."Subscriptions" s
    JOIN "Platform"."Tenants" t ON t.id = s."tenantId" AND NOT t."isInternal"
   WHERE s.status IN ('ACTIVE','PAST_DUE')
),
k AS (
  SELECT per."periodMonths", per."periodStart",
         COALESCE(sm."startMrr", 0) AS "startMrr", COALESCE(sm."startSubscriptions", 0) AS "startSubscriptions",
         mv.expansion, mv.contraction, mv.churn, mv."newMrr", mv."churnEvents",
         cur.mrr, cur."payingTenants"
    FROM per
    LEFT JOIN "startMrr" sm ON sm."periodMonths" = per."periodMonths"
    JOIN mv ON mv."periodMonths" = per."periodMonths"
   CROSS JOIN cur
)
SELECT k."periodMonths",
       k."periodStart",
       k."startMrr",
       k."newMrr",
       k.expansion                                                   AS "expansionMrr",
       k.contraction                                                 AS "contractionMrr",
       k.churn                                                       AS "churnedMrr",
       k.mrr                                                         AS "currentMrr",
       k."payingTenants"::integer                                     AS "payingTenants",
       round(100.0 * (k."startMrr" + k.expansion + k.contraction + k.churn) / NULLIF(k."startMrr", 0), 1) AS "nrrPeriodPct",
       round(100.0 * (k."startMrr" + k.contraction + k.churn) / NULLIF(k."startMrr", 0), 1)               AS "grrPeriodPct",
       CASE WHEN k."startMrr" > 0
            THEN round(100.0 * power(GREATEST((k."startMrr" + k.expansion + k.contraction + k.churn) / k."startMrr", 0),
                                     12.0 / k."periodMonths"), 1) END AS "nrrPct",
       CASE WHEN k."startMrr" > 0
            THEN round(100.0 * power(GREATEST((k."startMrr" + k.contraction + k.churn) / k."startMrr", 0),
                                     12.0 / k."periodMonths"), 1) END AS "grrPct",
       round(100.0 * k."churnEvents" / NULLIF(k."startSubscriptions", 0), 2)                              AS "logoChurnPct",
       round(k.mrr / NULLIF(k."payingTenants", 0), 2)                 AS arpu,
       round((k.mrr / NULLIF(k."payingTenants", 0)) * 0.82
             / NULLIF(k."churnEvents"::numeric / NULLIF(k."startSubscriptions", 0) / k."periodMonths", 0), 0) AS ltv,
       NULL::numeric(18,2)                                           AS cac,                -- [simulated] S&M spend not modelled
       NULL::numeric(9,1)                                            AS "cacPaybackMonths", -- [simulated]
       NULL::numeric(9,2)                                            AS "ltvCacRatio"       -- [simulated]
  FROM k;

COMMENT ON VIEW "Platform"."getSaasKpis" IS
  'SaaS KPIs per look-back period (1/3/6/12 months): start MRR, new / expansion / contraction / churn MRR, NRR and GRR (period and annualised), logo churn %, ARPU, LTV (82 % margin constant [simulated]); CAC, CAC payback and LTV:CAC are [simulated] (NULL). Screen: admin/analytics.';


-- ---------------------------------------------------------------------------
-- v_cohort_retention — logo retention by activation cohort (month of
-- tenant.activatedAt), last 12 cohorts, months M0 … M11 that have elapsed.
--   retained = cohort tenants not churned by the end of month k
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getCohortRetention" AS
WITH c AS (
  SELECT tn.id, date_trunc('month', tn."activatedAt")::date AS "cohortMonth", tn."churnedAt"
    FROM "Platform"."Tenants" tn
   WHERE NOT tn."isInternal"
     AND tn."activatedAt" >= date_trunc('month', current_date) - interval '11 months'
),
sz AS (
  SELECT "cohortMonth", count(*) AS "cohortSize" FROM c GROUP BY "cohortMonth"
)
SELECT sz."cohortMonth",
       sz."cohortSize"::integer                                       AS "cohortSize",
       k."monthOffset",
       (SELECT count(*) FROM c
         WHERE c."cohortMonth" = sz."cohortMonth"
           AND (c."churnedAt" IS NULL
                OR c."churnedAt" >= sz."cohortMonth" + (k."monthOffset" + 1) * interval '1 month'))::integer AS retained,
       round(100.0 * (SELECT count(*) FROM c
                       WHERE c."cohortMonth" = sz."cohortMonth"
                         AND (c."churnedAt" IS NULL
                              OR c."churnedAt" >= sz."cohortMonth" + (k."monthOffset" + 1) * interval '1 month'))
             / NULLIF(sz."cohortSize", 0), 1)                         AS "retentionPct"
  FROM sz
 CROSS JOIN generate_series(0, 11) AS k("monthOffset")
 WHERE sz."cohortMonth" + k."monthOffset" * interval '1 month' <= date_trunc('month', current_date);

COMMENT ON VIEW "Platform"."getCohortRetention" IS
  'Logo retention heatmap: activation cohort (month of tenant.activatedAt, last 12) × month offset M0–M11: cohort size, retained tenants, retention %. Screen: admin/analytics (Cohort retention).';


-- ---------------------------------------------------------------------------
-- v_churn_reasons — tenants churned in the last 12 months by exit-survey
-- reason (NULL reason → UNSPECIFIED); lost_mrr = mrrBefore of each tenant's
-- latest CHURN event.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getChurnReasons" AS
WITH ch AS (
  SELECT tn.id, COALESCE(tn."churnReason", 'UNSPECIFIED') AS "churnReason",
         (SELECT e."mrrBefore" FROM "Platform"."SubscriptionEvents" e
           WHERE e."tenantId" = tn.id AND e.movement = 'CHURN'
           ORDER BY e."effectiveOn" DESC, e."occurredAt" DESC LIMIT 1) AS "lostMrr"
    FROM "Platform"."Tenants" tn
   WHERE NOT tn."isInternal"
     AND tn."churnedAt" >= now() - interval '12 months'
)
SELECT ch."churnReason",
       count(*)::integer                                             AS tenants,
       round(100.0 * count(*) / NULLIF(sum(count(*)) OVER (), 0), 1) AS pct,
       COALESCE(sum(ch."lostMrr"), 0)                                 AS "lostMrr"
  FROM ch
 GROUP BY ch."churnReason";

COMMENT ON VIEW "Platform"."getChurnReasons" IS
  'Why tenants churn (last 12 months): tenant.churnReason with count, share % and lost MRR. Screen: admin/analytics (churn donut).';


-- ---------------------------------------------------------------------------
-- v_trial_funnel — per look-back period (1, 3, 6, 12 months), leads created
-- in the period (deleted leads excluded):
--   visitors   website analytics are external [simulated] → NULL
--   signups    leads created;   trials  trialStartedOn set
--   engaged    trialEngagementScore ≥ 60;   paid  wonAt set / stage PAID
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getTrialFunnel" AS
WITH per AS (
  SELECT p."periodMonths",
         (date_trunc('month', current_date) - (p."periodMonths" - 1) * interval '1 month')::date AS "periodStart"
    FROM unnest(ARRAY[1, 3, 6, 12]) AS p("periodMonths")
),
f AS (
  SELECT per."periodMonths", per."periodStart",
         count(l.id)                                                                   AS signups,
         count(l.id) FILTER (WHERE l."trialStartedOn" IS NOT NULL)                     AS trials,
         count(l.id) FILTER (WHERE l."trialEngagementScore" >= 60)                     AS engaged,
         count(l.id) FILTER (WHERE l."wonAt" IS NOT NULL OR l.stage = 'PAID')           AS paid
    FROM per
    LEFT JOIN "Platform"."PlatformLeads" l
           ON l."deletedAt" IS NULL AND l."createdAt" >= per."periodStart"
   GROUP BY per."periodMonths", per."periodStart"
)
SELECT f."periodMonths",
       f."periodStart",
       NULL::bigint                                                  AS visitors,       -- [simulated] website analytics not modelled
       f.signups::integer                                            AS signups,
       f.trials::integer                                             AS trials,
       f.engaged::integer                                            AS engaged,
       f.paid::integer                                               AS paid,
       round(100.0 * f.trials  / NULLIF(f.signups, 0), 1)            AS "signupToTrialPct",
       round(100.0 * f.engaged / NULLIF(f.trials, 0), 1)             AS "trialToEngagedPct",
       round(100.0 * f.paid    / NULLIF(f.trials, 0), 1)             AS "trialToPaidPct",
       round(100.0 * f.paid    / NULLIF(f.signups, 0), 1)            AS "signupToPaidPct"
  FROM f;

COMMENT ON VIEW "Platform"."getTrialFunnel" IS
  'Trial → paid funnel per look-back period: visitors ([simulated], NULL), sign-ups (leads), trials, engaged (score ≥ 60), paid, step conversions. Screen: admin/analytics (Trial → paid funnel).';


-- ---------------------------------------------------------------------------
-- v_subscription_kpi — one row.
--   annual_pct            ANNUAL ÷ paying subscriptions (count)
--   renewals_30d(_amount) paying subscriptions with nextRenewalOn in 30 days
--                         (amount = contract amount at stake)
--   past_due_amount       Σ balance of OPEN / PARTIALLY_PAID invoices past due
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getSubscriptionKpis" AS
WITH s AS (
  SELECT s.*
    FROM "Platform"."Subscriptions" s
    JOIN "Platform"."Tenants" t ON t.id = s."tenantId" AND NOT t."isInternal"
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
       (SELECT count(*) FROM s WHERE status IN ('ACTIVE','PAST_DUE') AND "cancelAtPeriodEnd")::integer AS "cancellingAtPeriodEnd",
       (SELECT COALESCE(sum(i."balanceAmount"), 0)
          FROM "Platform"."PlatformInvoices" i
          JOIN "Platform"."Tenants" t ON t.id = i."tenantId" AND NOT t."isInternal"
         WHERE i.status IN ('OPEN','PARTIALLY_PAID') AND i."dueOn" < current_date)              AS "pastDueAmount",
       (SELECT count(DISTINCT i."tenantId")
          FROM "Platform"."PlatformInvoices" i
          JOIN "Platform"."Tenants" t ON t.id = i."tenantId" AND NOT t."isInternal"
         WHERE i.status IN ('OPEN','PARTIALLY_PAID') AND i."dueOn" < current_date
           AND i."balanceAmount" > 0)::integer                                                   AS "pastDueTenants";

COMMENT ON VIEW "Platform"."getSubscriptionKpis" IS
  'Subscription KPIs: MRR, paying / trial subscriptions, annual contracts % (count and MRR), renewals in 30 days (count, amount at stake), cancelling at period end, past-due amount and tenants. Screen: admin/subscriptions (KPIs).';


-- ---------------------------------------------------------------------------
-- v_billing_kpi — per issue month (last 12), invoices not DRAFT / VOID.
--   billed            Σ totalAmount (incl. tax);  billed_tax Σ taxAmount
--   collected         Σ paidAmount;  collection_rate_pct collected ÷ billed
--   open_*            invoices of the month still OPEN / PARTIALLY_PAID
--   overdueAmount    open balance more than 7 days past dueOn
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getPlatformBillingByMonth" AS
SELECT date_trunc('month', i."issuedOn")::date                        AS month,
       count(*)::integer                                             AS invoices,
       sum(i."totalAmount")                                           AS billed,
       sum(i."netAmount")                                             AS "billedNet",
       sum(i."taxAmount")                                             AS "billedTax",
       sum(i."paidAmount")                                            AS collected,
       round(100.0 * sum(i."paidAmount") / NULLIF(sum(i."totalAmount"), 0), 1) AS "collectionRatePct",
       (count(*) FILTER (WHERE i.status IN ('OPEN','PARTIALLY_PAID') AND i."balanceAmount" > 0))::integer AS "openCount",
       COALESCE(sum(i."balanceAmount") FILTER (WHERE i.status IN ('OPEN','PARTIALLY_PAID')), 0)           AS "openAmount",
       (count(*) FILTER (WHERE i.status IN ('OPEN','PARTIALLY_PAID') AND i."balanceAmount" > 0
                           AND i."dueOn" < current_date - 7))::integer                                   AS "overdueCount",
       COALESCE(sum(i."balanceAmount") FILTER (WHERE i.status IN ('OPEN','PARTIALLY_PAID')
                                                AND i."dueOn" < current_date - 7), 0)                    AS "overdueAmount"
  FROM "Platform"."PlatformInvoices" i
 WHERE i.status NOT IN ('DRAFT','VOID')
   AND i."issuedOn" >= date_trunc('month', current_date) - interval '11 months'
 GROUP BY date_trunc('month', i."issuedOn");

COMMENT ON VIEW "Platform"."getPlatformBillingByMonth" IS
  'Platform billing per issue month (12 months): invoices, billed incl. tax, net, tax, collected, collection rate %, open and overdue (> 7 days) count / amount. Screen: admin/invoices (KPIs).';


-- ---------------------------------------------------------------------------
-- v_dunning_queue — open dunning cases (not RECOVERED / CANCELLED /
-- WRITTEN_OFF) with age bucket by days past the invoice due date.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getCollectionsQueue" AS
SELECT dc.id                                                         AS "dunningCaseId",
       dc."tenantId",
       tn.code                                                       AS "tenantCode",
       tn."displayName"                                               AS "tenantName",
       tn.status                                                     AS "tenantStatus",
       dc."platformInvoiceId",
       i."docNo"                                                      AS "invoiceDocNo",
       i."dueOn",
       dc."amountDue",
       i."balanceAmount",
       GREATEST(current_date - i."dueOn", 0)                          AS "daysOverdue",
       CASE WHEN current_date - i."dueOn" <= 7  THEN '1-7'
            WHEN current_date - i."dueOn" <= 14 THEN '8-14'
            WHEN current_date - i."dueOn" <= 30 THEN '15-30'
            ELSE '30+' END                                           AS "ageBucket",
       dc.stage,
       dc."openedAt",
       dc."paymentMethod",
       dc."attemptsCount",
       (SELECT count(*) FROM "Platform"."DunningAttempts" a
         WHERE a."dunningCaseId" = dc.id AND a.status <> 'CANCELLED')::integer AS "attemptsPlanned",
       dc."lastFailureReason",
       dc."nextRetryAt",
       dc."nextRetryMethod",
       dc."retriesPaused",
       dc."promiseDate",
       dc."promiseAmount",
       dc."dunningPolicyId",
       dp.name                                                       AS "policyName",
       s."mrrAmount"                                                  AS mrr
  FROM "Platform"."DunningCases" dc
  JOIN "Platform"."PlatformInvoices" i ON i.id = dc."platformInvoiceId"
  JOIN "Platform"."Tenants" tn          ON tn.id = dc."tenantId"
  JOIN "Platform"."DunningPolicies" dp  ON dp.id = dc."dunningPolicyId"
  LEFT JOIN "Platform"."Subscriptions" s
         ON s."tenantId" = dc."tenantId" AND s.status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED')
 WHERE dc.stage NOT IN ('RECOVERED','CANCELLED','WRITTEN_OFF');

COMMENT ON VIEW "Platform"."getCollectionsQueue" IS
  'Open dunning cases: tenant, invoice, amount / balance, days overdue and age bucket (1–7 / 8–14 / 15–30 / 30+), stage, attempts (done / planned), next retry, promise to pay, policy, MRR. Screen: admin/dunning (queue, buckets).';


-- ---------------------------------------------------------------------------
-- v_dunning_kpi — one row.
--   recovered_month_*      cases RECOVERED this calendar month (Σ amountDue)
--   recovery_rate_30d_pct  SUCCEEDED ÷ (SUCCEEDED + FAILED) attempts in 30 days
--   in_dunning_*           open cases and their invoice balance
--   churn_saved_mrr        MRR of tenants whose case was recovered this month
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getDunningKpis" AS
SELECT (SELECT COALESCE(sum(dc."amountDue"), 0) FROM "Platform"."DunningCases" dc
         WHERE dc.stage = 'RECOVERED' AND dc."recoveredAt" >= date_trunc('month', now()))           AS "recoveredMonthAmount",
       (SELECT count(*) FROM "Platform"."DunningCases" dc
         WHERE dc.stage = 'RECOVERED' AND dc."recoveredAt" >= date_trunc('month', now()))::integer  AS "recoveredMonthCount",
       (SELECT round(100.0 * count(*) FILTER (WHERE a.status = 'SUCCEEDED') / NULLIF(count(*), 0), 1)
          FROM "Platform"."DunningAttempts" a
         WHERE a.status IN ('SUCCEEDED','FAILED') AND a."attemptedAt" >= now() - interval '30 days') AS "recoveryRate30dPct",
       (SELECT count(*) FROM "Platform"."DunningCases" dc
         WHERE dc.stage NOT IN ('RECOVERED','CANCELLED','WRITTEN_OFF'))::integer                    AS "inDunningCount",
       (SELECT COALESCE(sum(i."balanceAmount"), 0) FROM "Platform"."DunningCases" dc
          JOIN "Platform"."PlatformInvoices" i ON i.id = dc."platformInvoiceId"
         WHERE dc.stage NOT IN ('RECOVERED','CANCELLED','WRITTEN_OFF'))                            AS "inDunningAmount",
       (SELECT COALESCE(sum(s."mrrAmount"), 0) FROM "Platform"."Subscriptions" s
         WHERE s.status IN ('ACTIVE','PAST_DUE')
           AND s."tenantId" IN (SELECT dc."tenantId" FROM "Platform"."DunningCases" dc
                                WHERE dc.stage = 'RECOVERED'
                                  AND dc."recoveredAt" >= date_trunc('month', now())))              AS "churnSavedMrr";

COMMENT ON VIEW "Platform"."getDunningKpis" IS
  'Dunning KPIs: recovered this month (amount, count), recovery rate of executed retries (30 d), in dunning (count, outstanding), churn saved (MRR of recovered tenants). Screen: admin/dunning (KPIs).';


-- ---------------------------------------------------------------------------
-- v_usage_current — latest UsageSnapshots per tenant × meter.
--   pct    used ÷ limit × 100 (NULL limit = unlimited)
--   band   OK < 80, NEAR ≥ 80, AT = 100, OVER > 100
--   worst_pct  highest pct of the tenant (sort / "worst meter")
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getCurrentUsage" AS
WITH u AS (
  SELECT DISTINCT ON (us."tenantId", us."usageMeterId") us.*
    FROM "Platform"."UsageSnapshots" us
   ORDER BY us."tenantId", us."usageMeterId", us."snapshotDate" DESC
)
SELECT u."tenantId",
       tn.code                                                       AS "tenantCode",
       tn."displayName"                                               AS "tenantName",
       s."planId",
       p.code                                                        AS "planCode",
       u."usageMeterId",
       m.code                                                        AS "meterCode",
       m.name                                                        AS "meterName",
       m.unit,
       u."snapshotDate",
       u."periodStart",
       u."usedValue",
       u."limitValue",
       pl."limitValue"                                                AS "planLimitValue",
       ov."limitValue"                                                AS "overrideLimitValue",
       ov."expiresOn"                                                 AS "overrideExpiresOn",
       round(100 * u."usedValue" / NULLIF(u."limitValue", 0), 1)       AS pct,
       CASE WHEN u."limitValue" IS NULL OR u."limitValue" = 0          THEN 'OK'
            WHEN u."usedValue" >  u."limitValue"                       THEN 'OVER'
            WHEN u."usedValue" =  u."limitValue"                       THEN 'AT'
            WHEN u."usedValue" >= 0.8 * u."limitValue"                 THEN 'NEAR'
            ELSE 'OK' END                                            AS band,
       max(round(100 * u."usedValue" / NULLIF(u."limitValue", 0), 1)) OVER (PARTITION BY u."tenantId") AS "worstPct"
  FROM u
  JOIN "Platform"."UsageMeters" m ON m.id = u."usageMeterId"
  JOIN "Platform"."Tenants" tn     ON tn.id = u."tenantId"
  LEFT JOIN "Platform"."Subscriptions" s
         ON s."tenantId" = u."tenantId" AND s.status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED')
  LEFT JOIN "Platform"."SubscriptionPlans" p ON p.id = s."planId"
  LEFT JOIN "Platform"."SubscriptionPlanLimits" pl ON pl."planId" = s."planId" AND pl."usageMeterId" = u."usageMeterId"
  LEFT JOIN LATERAL (
         SELECT o."limitValue", o."expiresOn"
           FROM "Platform"."UsageLimitOverrides" o
          WHERE o."tenantId" = u."tenantId" AND o."usageMeterId" = u."usageMeterId"
            AND o."revokedAt" IS NULL
            AND (o."expiresOn" IS NULL OR o."expiresOn" >= current_date)
          ORDER BY o."createdAt" DESC
          LIMIT 1) ov ON true;

COMMENT ON VIEW "Platform"."getCurrentUsage" IS
  'Current usage per tenant × meter (latest snapshot): used, effective limit, plan limit, live override, % and band (OK / NEAR ≥ 80 / AT / OVER), worst % per tenant. MTD API / SMS totals = SUM by meter_code. Screens: admin/usage, admin/dashboard (usage issues).';


-- ---------------------------------------------------------------------------
-- v_flag_summary — one row of feature-flag KPIs (archived flags excluded).
--   active_in_production  PRODUCTION FlagEnvironments.isOn
--   stale                 staleSince set
--   kill_switches         flagType or secondaryType KILL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getFeatureFlagSummary" AS
SELECT (SELECT count(*) FROM "Platform"."FeatureFlags" f WHERE f.stage <> 'ARCHIVED')::integer                       AS "totalFlags",
       (SELECT count(*) FROM "Platform"."FeatureFlags" f WHERE f.stage <> 'ARCHIVED' AND f."isTemporary")::integer    AS "temporaryFlags",
       (SELECT count(*) FROM "Platform"."FeatureFlags" f WHERE f.stage <> 'ARCHIVED' AND NOT f."isTemporary")::integer AS "permanentFlags",
       (SELECT count(*) FROM "Platform"."FeatureFlags" f
          JOIN "Platform"."FlagEnvironments" fe ON fe."flagId" = f.id AND fe.environment = 'PRODUCTION'
         WHERE f.stage <> 'ARCHIVED' AND fe."isOn")::integer                                                       AS "activeInProduction",
       (SELECT count(*) FROM "Platform"."FeatureFlags" f WHERE f.stage <> 'ARCHIVED' AND f."staleSince" IS NOT NULL)::integer AS "staleFlags",
       (SELECT count(*) FROM "Platform"."FlagChangeRequests" c WHERE c.status = 'PENDING')::integer                 AS "pendingApprovals",
       (SELECT count(*) FROM "Platform"."FeatureFlags" f
         WHERE f.stage <> 'ARCHIVED' AND (f."flagType" = 'KILL' OR f."secondaryType" = 'KILL'))::integer           AS "killSwitches",
       (SELECT count(*) FROM "Platform"."FeatureFlags" f
         WHERE f.stage <> 'ARCHIVED' AND f."isTemporary" AND f."expiresOn" < current_date)::integer                AS "expiredTemporaryFlags",
       (SELECT COALESCE(sum(d."evaluationCount"), 0) FROM "Platform"."FlagDailyEvaluations" d
         WHERE d.environment = 'PRODUCTION' AND d."evalDate" >= current_date - 7)                                 AS evaluations7d;

COMMENT ON VIEW "Platform"."getFeatureFlagSummary" IS
  'Feature-flag KPIs: total (temporary / permanent), active in Production, stale, pending change requests, kill switches, expired temporary flags, Production evaluations in 7 days. Screen: admin/features (KPIs).';


-- ---------------------------------------------------------------------------
-- v_cr_kpi — one row of change-request KPIs.
--   median_hours_to_approve  median(decidedAt − createdAt) of CRs approved
--                            in the last 30 days
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getFlagChangeRequestKpis" AS
SELECT (count(*) FILTER (WHERE c.status = 'PENDING'))::integer                                             AS pending,
       (count(*) FILTER (WHERE c.status = 'APPROVED' AND c."decidedAt" >= now() - interval '30 days'))::integer AS approved30d,
       (count(*) FILTER (WHERE c.status = 'REJECTED' AND c."decidedAt" >= now() - interval '30 days'))::integer AS rejected30d,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (c."decidedAt" - c."createdAt")) / 3600)
              FILTER (WHERE c.status = 'APPROVED' AND c."decidedAt" >= now() - interval '30 days'))::numeric, 1) AS "medianHoursToApprove",
       min(c."createdAt") FILTER (WHERE c.status = 'PENDING')                                               AS "oldestPendingAt"
  FROM "Platform"."FlagChangeRequests" c;

COMMENT ON VIEW "Platform"."getFlagChangeRequestKpis" IS
  'Change-request KPIs: pending, approved / rejected in 30 days, median hours to approve (30 d), oldest pending. Screen: admin/change-requests (KPIs).';


-- ---------------------------------------------------------------------------
-- v_support_kpi — one row of support KPIs.
--   open_tickets        NEW / IN_PROGRESS / WAITING_ON_CUSTOMER
--   breaching_now       open, no first response (or not resolved) and past slaDueAt
--   sla_breaches_30d    tickets opened in 30 d answered after slaDueAt, or
--                       still unanswered past it
--   first response / CSAT over tickets opened in the last 30 days
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getSupportTicketKpis" AS
SELECT (count(*) FILTER (WHERE t.status IN ('NEW','IN_PROGRESS','WAITING_ON_CUSTOMER')))::integer                  AS "openTickets",
       (count(*) FILTER (WHERE t.status IN ('NEW','IN_PROGRESS','WAITING_ON_CUSTOMER')
                           AND t."assigneeStaffId" IS NULL))::integer                                              AS "unassignedOpen",
       (count(*) FILTER (WHERE t.status IN ('NEW','IN_PROGRESS','WAITING_ON_CUSTOMER')
                           AND t."slaDueAt" < now() AND t."firstResponseAt" IS NULL))::integer                     AS "breachingNow",
       (count(*) FILTER (WHERE t."openedAt" >= now() - interval '30 days'
                           AND (t."firstResponseAt" > t."slaDueAt"
                                OR (t."firstResponseAt" IS NULL AND t."slaDueAt" < now()))))::integer               AS "slaBreaches30d",
       round((avg(extract(epoch FROM (t."firstResponseAt" - t."openedAt")) / 60)
              FILTER (WHERE t."openedAt" >= now() - interval '30 days' AND t."firstResponseAt" IS NOT NULL))::numeric, 0) AS "avgFirstResponseMin",
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (t."firstResponseAt" - t."openedAt")) / 60)
              FILTER (WHERE t."openedAt" >= now() - interval '30 days' AND t."firstResponseAt" IS NOT NULL))::numeric, 0) AS "medianFirstResponseMin",
       round(avg(t."csatRating") FILTER (WHERE t."openedAt" >= now() - interval '30 days'), 2)                             AS "csatAvg30d",
       (count(t."csatRating") FILTER (WHERE t."openedAt" >= now() - interval '30 days'))::integer                          AS "csatCount30d",
       round(avg(t."csatRating"), 2)                                                                                      AS "csatAvgAll",
       count(t."csatRating")::integer                                                                                     AS "csatCountAll"
  FROM "Platform"."SupportTickets" t;

COMMENT ON VIEW "Platform"."getSupportTicketKpis" IS
  'Support KPIs: open and unassigned tickets, breaching now, SLA breaches (30 d), avg / median first response minutes (30 d), CSAT avg and ratings (30 d and all time). Screen: admin/support (KPIs).';


-- ---------------------------------------------------------------------------
-- v_partner_commission — one row per partner (deleted partners excluded).
--   tenants          live attributions (ResellerTenants.endedOn NULL)
--   sourcedMrr      Σ mrrAmount of those tenants' paying subscriptions
--   expected_commission  Σ mrr × (override or partner commissionPct) ÷ 100
--   due_*            Σ ResellerPayouts in status DUE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getResellerCommissions" AS
SELECT pa.id                                                         AS "partnerId",
       pa.name,
       pa.city,
       pa.tier,
       pa.status,
       pa."commissionPct",
       pa."nextTierTenants",
       COALESCE(a.tenants, 0)                                        AS tenants,
       GREATEST(pa."nextTierTenants" - COALESCE(a.tenants, 0), 0)    AS "tenantsToNextTier",
       COALESCE(a."sourcedMrr", 0)                                    AS "sourcedMrr",
       COALESCE(a."expectedCommission", 0)                            AS "expectedCommission",
       COALESCE(d."dueGross", 0)                                      AS "dueGross",
       COALESCE(d."dueWht", 0)                                        AS "dueWht",
       COALESCE(d."dueNet", 0)                                        AS "dueNet",
       d."oldestDueMonth",
       lp."lastPaidOn",
       pa."payoutMethod",
       pa."ibanMasked",
       pa.ntn,
       pa."isActiveTaxpayer"
  FROM "Platform"."Resellers" pa
  LEFT JOIN LATERAL (
         SELECT count(DISTINCT pt."tenantId")::integer                               AS tenants,
                COALESCE(sum(s."mrrAmount"), 0)                                      AS "sourcedMrr",
                round(COALESCE(sum(s."mrrAmount" * COALESCE(pt."commissionPctOverride", pa."commissionPct") / 100), 0), 2) AS "expectedCommission"
           FROM "Platform"."ResellerTenants" pt
           LEFT JOIN "Platform"."Subscriptions" s
                  ON s."tenantId" = pt."tenantId" AND s.status IN ('ACTIVE','PAST_DUE')
          WHERE pt."partnerId" = pa.id AND pt."endedOn" IS NULL) a ON true
  LEFT JOIN LATERAL (
         SELECT sum(po."grossAmount") AS "dueGross", sum(po."whtAmount") AS "dueWht",
                sum(po."netAmount") AS "dueNet", min(po."periodMonth") AS "oldestDueMonth"
           FROM "Platform"."ResellerPayouts" po
          WHERE po."partnerId" = pa.id AND po.status = 'DUE') d ON true
  LEFT JOIN LATERAL (
         SELECT max(po."paidOn") AS "lastPaidOn"
           FROM "Platform"."ResellerPayouts" po
          WHERE po."partnerId" = pa.id AND po.status = 'PAID') lp ON true
 WHERE pa."deletedAt" IS NULL;

COMMENT ON VIEW "Platform"."getResellerCommissions" IS
  'Partner card / KPI rows: tier, commission %, sourced tenants and MRR, expected commission, payout due (gross, WHT u/s 233, net), last paid, progress to next tier. KPIs = aggregates (partners by tier, tenants via partners, partner-sourced MRR, commission due). Screen: admin/partners.';


-- ---------------------------------------------------------------------------
-- v_lead_pipeline — one row per stage (deleted leads excluded).
--   current_*        leads now in the stage (count, Σ expectedMrr)
--   reached          leads that ever reached the stage: highest of current
--                    stage, PlatformLeadActivities from/to stages, demoAt / trial /
--                    wonAt markers (LEAD < DEMO < TRIAL < PAID)
--   step_conversion_pct  reached ÷ reached of the previous stage
--   win_rate_pct     reached PAID ÷ all leads (same on every row)
--   pipeline_value   Σ expectedMrr of open leads (LEAD / DEMO / TRIAL)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getPlatformLeadPipeline" AS
WITH rk AS (
  SELECT l.id, l.stage, l."expectedMrr",
         GREATEST(
           CASE l.stage WHEN 'LEAD' THEN 1 WHEN 'DEMO' THEN 2 WHEN 'TRIAL' THEN 3 WHEN 'PAID' THEN 4 ELSE 1 END,
           CASE WHEN l."demoAt" IS NOT NULL THEN 2 ELSE 1 END,
           CASE WHEN l."trialStartedOn" IS NOT NULL THEN 3 ELSE 1 END,
           CASE WHEN l."wonAt" IS NOT NULL THEN 4 ELSE 1 END,
           COALESCE((SELECT max(CASE x.st WHEN 'DEMO' THEN 2 WHEN 'TRIAL' THEN 3 WHEN 'PAID' THEN 4 ELSE 1 END)
                       FROM "Platform"."PlatformLeadActivities" a
                      CROSS JOIN LATERAL (VALUES (a."fromStage"), (a."toStage")) AS x(st)
                      WHERE a."leadId" = l.id), 1)
         ) AS "maxRank"
    FROM "Platform"."PlatformLeads" l
   WHERE l."deletedAt" IS NULL
),
st AS (
  SELECT * FROM (VALUES ('LEAD', 1), ('DEMO', 2), ('TRIAL', 3), ('PAID', 4), ('CHURNED', 5)) AS v(stage, "stageOrder")
),
agg AS (
  SELECT st.stage, st."stageOrder",
         (SELECT count(*) FROM rk WHERE rk.stage = st.stage)                                  AS "currentCount",
         (SELECT COALESCE(sum(rk."expectedMrr"), 0) FROM rk WHERE rk.stage = st.stage)         AS "currentValue",
         CASE WHEN st.stage = 'CHURNED' THEN (SELECT count(*) FROM rk WHERE rk.stage = 'CHURNED')
              ELSE (SELECT count(*) FROM rk WHERE rk."maxRank" >= st."stageOrder") END          AS reached
    FROM st
)
SELECT ag.stage,
       ag."stageOrder",
       ag."currentCount"::integer                                      AS "currentCount",
       ag."currentValue",
       ag.reached::integer                                            AS reached,
       CASE WHEN ag."stageOrder" BETWEEN 2 AND 4
            THEN round(100.0 * ag.reached / NULLIF(lag(ag.reached) OVER (ORDER BY ag."stageOrder"), 0), 1) END AS "stepConversionPct",
       round(100.0 * (SELECT count(*) FROM rk WHERE rk."maxRank" >= 4) / NULLIF((SELECT count(*) FROM rk), 0), 1) AS "winRatePct",
       (SELECT COALESCE(sum(rk."expectedMrr"), 0) FROM rk WHERE rk.stage IN ('LEAD','DEMO','TRIAL')) AS "pipelineValue"
  FROM agg ag;

COMMENT ON VIEW "Platform"."getPlatformLeadPipeline" IS
  'Leads pipeline per stage: current count and expected MRR, leads that reached the stage (stage history in PlatformLeadActivities), step conversion %, win rate %, open pipeline value. Screen: admin/leads (stats, column headers).';


-- ---------------------------------------------------------------------------
-- v_status_component_daily — status-page bars: component × day, last 90 days.
--   worst_impact      worst impact of PUBLIC incidents open during the day
--                     (NONE / MINOR / MAJOR / CRITICAL)
--   in_maintenance    a non-cancelled maintenance window touches the day
--   outage_minutes    minutes of the day covered by MAJOR / CRITICAL incidents
--                     (envelope: earliest start to latest end within the day)
--   uptime_pct        100 − outage_minutes ÷ 1440 × 100, DERIVED from
--                     incidents (not from external monitoring)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getStatusComponentHistory" AS
WITH comp AS (
  SELECT * FROM (VALUES ('WEB_APP', 'Web app', 1), ('PUBLIC_API', 'Public API', 2),
                        ('FBR_PRAL_GATEWAY', 'FBR / PRAL gateway', 3), ('PRA_SRB_EINVOICING', 'PRA & SRB e-invoicing', 4),
                        ('PAYROLL_ENGINE', 'Payroll engine', 5), ('EMAIL_SMS', 'Email & SMS', 6),
                        ('BANK_FEEDS_RAAST', 'Bank feeds & Raast', 7), ('BACKUPS_DR', 'Backups & DR', 8))
         AS v(component, "componentName", "sortOrder")
),
days AS (
  SELECT g.d::date AS day, g.d::timestamptz AS "dayStart", (g.d + interval '1 day')::timestamptz AS "dayEnd"
    FROM generate_series(current_date - 89, current_date, interval '1 day') AS g(d)
),
hit AS (
  SELECT c.component, dy.day, i.impact,
         GREATEST(i."startedAt", dy."dayStart")                       AS "sAt",
         LEAST(COALESCE(i."resolvedAt", now()), dy."dayEnd")          AS "eAt"
    FROM comp c
   CROSS JOIN days dy
    JOIN "Platform"."ServiceIncidents" i
      ON i."isPublic" AND c.component = ANY (i.components)
     AND i."startedAt" < dy."dayEnd" AND COALESCE(i."resolvedAt", now()) > dy."dayStart"
)
SELECT c.component,
       c."componentName",
       c."sortOrder",
       dy.day,
       COALESCE((SELECT CASE max(CASE h.impact WHEN 'CRITICAL' THEN 3 WHEN 'MAJOR' THEN 2 WHEN 'MINOR' THEN 1 END)
                          WHEN 3 THEN 'CRITICAL' WHEN 2 THEN 'MAJOR' WHEN 1 THEN 'MINOR' END
                   FROM hit h WHERE h.component = c.component AND h.day = dy.day), 'NONE')          AS "worstImpact",
       (SELECT count(*) FROM hit h WHERE h.component = c.component AND h.day = dy.day)::integer      AS "incidentCount",
       EXISTS (SELECT 1 FROM "Platform"."MaintenanceWindows" mw
                WHERE mw.status <> 'CANCELLED' AND c.component = ANY (mw.components)
                  AND mw."startsAt" < dy."dayEnd" AND mw."endsAt" > dy."dayStart")                      AS "inMaintenance",
       COALESCE((SELECT round(extract(epoch FROM (max(h."eAt") - min(h."sAt"))) / 60)
                   FROM hit h WHERE h.component = c.component AND h.day = dy.day
                    AND h.impact IN ('MAJOR','CRITICAL')), 0)::integer                               AS "outageMinutes",
       round(100 - COALESCE((SELECT extract(epoch FROM (max(h."eAt") - min(h."sAt"))) / 60
                               FROM hit h WHERE h.component = c.component AND h.day = dy.day
                                AND h.impact IN ('MAJOR','CRITICAL')), 0) / 1440.0 * 100, 3)         AS "uptimePct"
  FROM comp c
 CROSS JOIN days dy;

COMMENT ON VIEW "Platform"."getStatusComponentHistory" IS
  'Status page: component × day (90 days): worst public incident impact, incident count, maintenance flag, outage minutes (MAJOR / CRITICAL span) and uptime % derived from incidents (not monitoring). Subscriber count is [simulated] (not here). Screen: admin/status (component bars).';


-- ---------------------------------------------------------------------------
-- v_service_health — System health cards.
--   kind QUEUE      latest Platform.JobQueueSamples per queue (status OK /
--                   BUSY / RETRYING / STALLED, waiting, failed, workers)
--   kind COMPONENT  status-page components: status from the worst OPEN
--                   incident (OPERATIONAL / DEGRADED / PARTIAL_OUTAGE /
--                   MAJOR_OUTAGE), MAINTENANCE during a live window
--   kind BACKUP     latest FULL BackupRuns
--   latencyMs, uptime_90d_pct  external monitoring [simulated] → NULL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Platform"."getSystemHealth" AS
WITH q AS (
  SELECT DISTINCT ON (j."queueName") j.*
    FROM "Platform"."JobQueueSamples" j
   ORDER BY j."queueName", j."sampledAt" DESC
),
comp AS (
  SELECT * FROM (VALUES ('WEB_APP', 'Web app', 1), ('PUBLIC_API', 'Public API', 2),
                        ('FBR_PRAL_GATEWAY', 'FBR / PRAL gateway', 3), ('PRA_SRB_EINVOICING', 'PRA & SRB e-invoicing', 4),
                        ('PAYROLL_ENGINE', 'Payroll engine', 5), ('EMAIL_SMS', 'Email & SMS', 6),
                        ('BANK_FEEDS_RAAST', 'Bank feeds & Raast', 7), ('BACKUPS_DR', 'Backups & DR', 8))
         AS v(component, "componentName", "sortOrder")
),
b AS (
  SELECT br.*
    FROM "Platform"."BackupRuns" br
   WHERE br."backupType" = 'FULL'
   ORDER BY br."startedAt" DESC
   LIMIT 1
)
SELECT 'QUEUE'::text                                                 AS kind,
       q."queueName"                                                  AS "serviceKey",
       COALESCE(q.description, q."queueName")                         AS "serviceName",
       q.status,
       q."waitingCount"                                               AS "metricValue",
       'waiting'::text                                               AS "metricLabel",
       q."failedCount",
       q."workerCount"::integer                                       AS "workerCount",
       NULL::text                                                    AS "openIncidentDocNo",
       q."sampledAt"                                                  AS "updatedAt",
       NULL::numeric                                                 AS "latencyMs",       -- [simulated] external monitoring
       NULL::numeric                                                 AS "uptime90dPct",   -- [simulated] external monitoring
       100 + row_number() OVER (ORDER BY q."queueName")               AS "sortOrder"
  FROM q
UNION ALL
SELECT 'COMPONENT',
       c.component,
       c."componentName",
       CASE WHEN oi.worst = 3 THEN 'MAJOR_OUTAGE'
            WHEN oi.worst = 2 THEN 'PARTIAL_OUTAGE'
            WHEN oi.worst = 1 THEN 'DEGRADED'
            WHEN mw.live THEN 'MAINTENANCE'
            ELSE 'OPERATIONAL' END,
       oi."openCount",
       'open incidents',
       NULL,
       NULL,
       oi."latestDocNo",
       COALESCE(oi."latestStartedAt", now()),
       NULL,                                                                              -- [simulated]
       NULL,                                                                              -- [simulated]
       c."sortOrder"
  FROM comp c
  LEFT JOIN LATERAL (
         SELECT max(CASE i.impact WHEN 'CRITICAL' THEN 3 WHEN 'MAJOR' THEN 2 ELSE 1 END) AS worst,
                count(*)::integer                                                       AS "openCount",
                (array_agg(i."docNo" ORDER BY i."startedAt" DESC))[1]                     AS "latestDocNo",
                max(i."startedAt")                                                       AS "latestStartedAt"
           FROM "Platform"."ServiceIncidents" i
          WHERE i.stage <> 'RESOLVED' AND c.component = ANY (i.components)) oi ON true
  LEFT JOIN LATERAL (
         SELECT true AS live
           FROM "Platform"."MaintenanceWindows" w
          WHERE w.status = 'IN_PROGRESS' AND c.component = ANY (w.components)
          LIMIT 1) mw ON true
UNION ALL
SELECT 'BACKUP',
       b.code,
       'Nightly full backup',
       b.status,
       b."sizeBytes",
       'bytes',
       NULL,
       NULL,
       NULL,
       COALESCE(b."finishedAt", b."startedAt"),
       NULL,                                                                              -- [simulated]
       NULL,                                                                              -- [simulated]
       200
  FROM b;

COMMENT ON VIEW "Platform"."getSystemHealth" IS
  'System health cards: job queues (latest JobQueueSamples), status-page components (status from open incidents / live maintenance) and the latest full backup; latency and 90-day uptime are external monitoring [simulated] (NULL). Screens: admin/dashboard (System health), admin/system.';
