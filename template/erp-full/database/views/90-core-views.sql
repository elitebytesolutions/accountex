-- =============================================================================
-- Finsoft ERP (FULL) — views/90-core-views.sql
-- Dashboard KPI views (app/dashboard) and settings / user / audit /
-- notification helper views named in entities/02-auth-workspace-settings.md.
--
-- Install after all schema + fk files (views/90-*), before 91-rls.
-- Every view is WITH (security_invoker = true): tenant RLS on the base tables
-- applies to the caller. These views read base tables only (no dependency on
-- the acc report views), so file order within views/ does not matter.
--
-- Ledger rule (same as views/90-acc-views.sql): an entry counts when
-- Accounting.Vouchers.status IN ('POSTED','REVERSED'); OB vouchers are not
-- revenue/expense movement; year-end closing journals
-- (Accounting.FiscalYears.closingJournalEntryId) are excluded from income /
-- expense figures.
--
-- Dates: "this month", "MTD", "last month" use current_date of the session
-- (the API sets the session time zone to Company.CompanySettings.timezone).
--
-- Full re-declares the Basic core views unchanged (every Basic table and column
-- exists in Full). The Full-only dashboard cards (Budget Remaining, Pending
-- approvals, Payroll) are not named as views in the entity docs.
--
-- Objects:
--   Company.getDashboardCashAndBank            app/dashboard  Cash & Bank card
--   Company.getDashboardMonthlyRevenue        app/dashboard  Revenue card
--   Company.getDashboardDailyRevenue        app/dashboard  daily heat strip
--   Company.getDashboardMonthlyExpenses        app/dashboard  Total expenses card
--   Company.getDashboardMoneyFlow           app/dashboard  Money Flow chart
--   Company.getDashboardRecentTransactions  app/dashboard  Transaction History
--   Company.getNumberingSeriesPreview      app/settings   Numbering Series tab
--   Company.getUserKpis                 app/settings/users KPIs, security posture
--   Company.getUserEffectivePermissions app/settings/users drawer, app/unauthorized
--   Company.getAuditTrail               app/settings/audit
--   Company.getNotificationSummary      app/notifications
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Company.getDashboardCashAndBank — one row per tenant.
-- total_balance = GL balance of all CASH + BANK sub-type accounts (posted).
-- inflow_* / outflow_* = debits / credits on those accounts, excluding OB
-- and CON (contra transfers between own cash/bank accounts).
-- Quarters follow the calendar (FY starts in Jan/Apr/Jul, so fiscal quarters
-- coincide); fy_start = first day of the current fiscal year from
-- Company.CompanySettings.fyStartMonth.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getDashboardCashAndBank"
WITH (security_invoker = true) AS
SELECT cp."tenantId",
       d."monthStart",
       d."fyStart",
       COALESCE(g."totalBalance", 0)       AS "totalBalance",
       COALESCE(g."bankBalance", 0)        AS "bankBalance",
       COALESCE(g."cashBalance", 0)        AS "cashBalance",
       (SELECT count(*) FROM "BankCash"."BankAccounts" ba
         WHERE ba."tenantId" = cp."tenantId" AND ba.status = 'ACTIVE' AND ba."deletedAt" IS NULL) AS "bankAccountCount",
       (SELECT count(*) FROM "BankCash"."CashAccounts" ca
         WHERE ca."tenantId" = cp."tenantId" AND ca."isActive" AND ca."deletedAt" IS NULL)         AS "cashAccountCount",
       COALESCE(g."inflowMtd", 0)          AS "inflowMtd",
       COALESCE(g."outflowMtd", 0)         AS "outflowMtd",
       COALESCE(g."inflowQtd", 0)          AS "inflowQtd",
       COALESCE(g."outflowQtd", 0)         AS "outflowQtd",
       COALESCE(g."inflowFytd", 0)         AS "inflowFytd",
       COALESCE(g."outflowFytd", 0)        AS "outflowFytd",
       COALESCE(r."earnedLastMonth", 0)   AS "earnedLastMonth",
       COALESCE(c."collectionsMtd", 0)     AS "collectionsMtd"
  FROM "Company"."CompanySettings" cp
 CROSS JOIN LATERAL (
   SELECT date_trunc('month', current_date)::date   AS "monthStart",
          date_trunc('quarter', current_date)::date AS "quarterStart",
          (date_trunc('month', current_date)
             - make_interval(months => ((extract(month FROM current_date)::int - cp."fyStartMonth" + 12) % 12)))::date AS "fyStart"
 ) d
  LEFT JOIN LATERAL (
    SELECT sum(l.debit - l.credit)                                            AS "totalBalance",
           sum(l.debit - l.credit) FILTER (WHERE a."subType" = 'BANK')         AS "bankBalance",
           sum(l.debit - l.credit) FILTER (WHERE a."subType" = 'CASH')         AS "cashBalance",
           sum(l.debit)  FILTER (WHERE e."voucherType" NOT IN ('OB','CON') AND e."postingDate" >= d."monthStart")   AS "inflowMtd",
           sum(l.credit) FILTER (WHERE e."voucherType" NOT IN ('OB','CON') AND e."postingDate" >= d."monthStart")   AS "outflowMtd",
           sum(l.debit)  FILTER (WHERE e."voucherType" NOT IN ('OB','CON') AND e."postingDate" >= d."quarterStart") AS "inflowQtd",
           sum(l.credit) FILTER (WHERE e."voucherType" NOT IN ('OB','CON') AND e."postingDate" >= d."quarterStart") AS "outflowQtd",
           sum(l.debit)  FILTER (WHERE e."voucherType" NOT IN ('OB','CON') AND e."postingDate" >= d."fyStart")      AS "inflowFytd",
           sum(l.credit) FILTER (WHERE e."voucherType" NOT IN ('OB','CON') AND e."postingDate" >= d."fyStart")      AS "outflowFytd"
      FROM "Accounting"."VoucherLines" l
      JOIN "Accounting"."Vouchers" e ON e."tenantId" = l."tenantId" AND e.id = l."journalEntryId"
      JOIN "Accounting"."ChartOfAccounts" a       ON a."tenantId" = l."tenantId" AND a.id = l."accountId"
     WHERE l."tenantId" = cp."tenantId"
       AND e.status IN ('POSTED','REVERSED')
       AND a."subType" IN ('CASH','BANK')
       AND e."postingDate" <= current_date
  ) g ON true
  LEFT JOIN LATERAL (
    SELECT sum(l.credit - l.debit) AS "earnedLastMonth"
      FROM "Accounting"."VoucherLines" l
      JOIN "Accounting"."Vouchers" e ON e."tenantId" = l."tenantId" AND e.id = l."journalEntryId"
      JOIN "Accounting"."ChartOfAccounts" a       ON a."tenantId" = l."tenantId" AND a.id = l."accountId"
     WHERE l."tenantId" = cp."tenantId"
       AND e.status IN ('POSTED','REVERSED')
       AND e."voucherType" <> 'OB'
       AND a."accountClass" = 4
       AND e."postingDate" >= (d."monthStart" - interval '1 month')::date
       AND e."postingDate" <  d."monthStart"
       AND NOT EXISTS (SELECT 1 FROM "Accounting"."FiscalYears" fy
                        WHERE fy."tenantId" = e."tenantId" AND fy."closingJournalEntryId" = e.id)
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT sum(rc."amountReceived" * rc."fxRate") AS "collectionsMtd"
      FROM "Sales"."CustomerReceipts" rc
     WHERE rc."tenantId" = cp."tenantId"
       AND rc.status NOT IN ('VOID','BOUNCED')
       AND rc."docDate" >= d."monthStart"
       AND rc."docDate" <= current_date
  ) c ON true;

COMMENT ON VIEW "Company"."getDashboardCashAndBank" IS
  'Dashboard Cash & Bank card: total / bank / cash GL balance (CASH + BANK sub-type accounts), active bank and cash account counts, inflow/outflow this month / quarter / fiscal year (movement pills), revenue earned last month (class 4, credit − debit), collections MTD (Sales.CustomerReceipts, not void/bounced). Screen: app/dashboard.';


-- ---------------------------------------------------------------------------
-- Company.getDashboardMonthlyRevenue — one row per tenant per month (first posting
-- month … current month, gaps filled with 0).
-- total_revenue = class 4 credit − debit (net of contra revenue).
-- services = taxable value of posted sales invoice lines without an item
-- (free-text service lines), in base currency; sales_goods = SALES sub-type
-- revenue − services; other_income = OTHER_INCOME + FINANCE_INCOME.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getDashboardMonthlyRevenue"
WITH (security_invoker = true) AS
WITH gl AS (
  SELECT l."tenantId",
         date_trunc('month', e."postingDate")::date                                        AS "monthStart",
         sum(l.credit - l.debit)                                                          AS "totalRevenue",
         COALESCE(sum(l.credit - l.debit) FILTER (WHERE a."subType" = 'SALES'), 0)         AS "salesRevenue",
         COALESCE(sum(l.credit - l.debit) FILTER (WHERE a."subType" IN ('OTHER_INCOME','FINANCE_INCOME')), 0) AS "otherIncome"
    FROM "Accounting"."VoucherLines" l
    JOIN "Accounting"."Vouchers" e ON e."tenantId" = l."tenantId" AND e.id = l."journalEntryId"
    JOIN "Accounting"."ChartOfAccounts" a       ON a."tenantId" = l."tenantId" AND a.id = l."accountId"
   WHERE e.status IN ('POSTED','REVERSED')
     AND e."voucherType" <> 'OB'
     AND a."accountClass" = 4
     AND NOT EXISTS (SELECT 1 FROM "Accounting"."FiscalYears" fy
                      WHERE fy."tenantId" = e."tenantId" AND fy."closingJournalEntryId" = e.id)
   GROUP BY l."tenantId", date_trunc('month', e."postingDate")::date
),
svc AS (
  SELECT il."tenantId",
         date_trunc('month', i."docDate")::date      AS "monthStart",
         sum(round(il."taxableAmount" * i."fxRate", 2)) AS services
    FROM "Sales"."SalesInvoiceLines" il
    JOIN "Sales"."SalesInvoices" i ON i."tenantId" = il."tenantId" AND i.id = il."invoiceId"
   WHERE il."itemId" IS NULL
     AND i.status IN ('POSTED','PARTIALLY_PAID','PAID')
   GROUP BY il."tenantId", date_trunc('month', i."docDate")::date
),
months AS (
  SELECT f."tenantId", gs::date AS "monthStart"
    FROM (SELECT gl."tenantId", min(gl."monthStart") AS "firstMonth" FROM gl GROUP BY gl."tenantId") f
   CROSS JOIN LATERAL generate_series(f."firstMonth"::timestamp,
                                      GREATEST(f."firstMonth", date_trunc('month', current_date)::date)::timestamp,
                                      interval '1 month') AS gs
),
m AS (
  SELECT mo."tenantId", mo."monthStart",
         COALESCE(gl."totalRevenue", 0)                              AS "totalRevenue",
         COALESCE(gl."salesRevenue", 0) - COALESCE(svc.services, 0)  AS "salesGoods",
         COALESCE(svc.services, 0)                                  AS services,
         COALESCE(gl."otherIncome", 0)                               AS "otherIncome"
    FROM months mo
    LEFT JOIN gl  ON gl."tenantId" = mo."tenantId" AND gl."monthStart" = mo."monthStart"
    LEFT JOIN svc ON svc."tenantId" = mo."tenantId" AND svc."monthStart" = mo."monthStart"
)
SELECT m."tenantId",
       m."monthStart",
       (m."monthStart" + interval '1 month' - interval '1 day')::date AS "monthEnd",
       m."totalRevenue",
       m."salesGoods",
       m.services,
       m."otherIncome",
       COALESCE(p."totalRevenue", 0)                                  AS "prevMonthTotal",
       round(100 * (m."totalRevenue" - p."totalRevenue") / NULLIF(p."totalRevenue", 0), 1) AS "momChangePct",
       (m."monthStart" = date_trunc('month', current_date)::date)     AS "isCurrentMonth"
  FROM m
  LEFT JOIN m p ON p."tenantId" = m."tenantId"
               AND p."monthStart" = (m."monthStart" - interval '1 month')::date;

COMMENT ON VIEW "Company"."getDashboardMonthlyRevenue" IS
  'Dashboard Revenue card per month: total_revenue (class 4 GL, net), sales_goods, services (invoice lines without item), other_income, prev_month_total, mom_change_pct; is_current_month marks the card month. Screen: app/dashboard.';


-- ---------------------------------------------------------------------------
-- Company.getDashboardDailyRevenue — revenue per posting day (heat strip).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getDashboardDailyRevenue"
WITH (security_invoker = true) AS
SELECT l."tenantId",
       e."postingDate"                                                        AS day,
       sum(l.credit - l.debit)                                               AS revenue,
       COALESCE(sum(l.credit - l.debit) FILTER (WHERE a."subType" = 'SALES'), 0) AS "salesRevenue",
       count(DISTINCT e.id)                                                  AS "voucherCount"
  FROM "Accounting"."VoucherLines" l
  JOIN "Accounting"."Vouchers" e ON e."tenantId" = l."tenantId" AND e.id = l."journalEntryId"
  JOIN "Accounting"."ChartOfAccounts" a       ON a."tenantId" = l."tenantId" AND a.id = l."accountId"
 WHERE e.status IN ('POSTED','REVERSED')
   AND e."voucherType" <> 'OB'
   AND a."accountClass" = 4
   AND NOT EXISTS (SELECT 1 FROM "Accounting"."FiscalYears" fy
                    WHERE fy."tenantId" = e."tenantId" AND fy."closingJournalEntryId" = e.id)
 GROUP BY l."tenantId", e."postingDate";

COMMENT ON VIEW "Company"."getDashboardDailyRevenue" IS
  'Daily revenue (class 4 GL, credit − debit) per posting date for the dashboard heat strip; days without revenue have no row. Screen: app/dashboard.';


-- ---------------------------------------------------------------------------
-- Company.getDashboardMonthlyExpenses — class 5 debit − credit per month (gaps 0).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getDashboardMonthlyExpenses"
WITH (security_invoker = true) AS
WITH gl AS (
  SELECT l."tenantId",
         date_trunc('month', e."postingDate")::date                                         AS "monthStart",
         sum(l.debit - l.credit)                                                           AS "totalExpenses",
         COALESCE(sum(l.debit - l.credit) FILTER (WHERE a."subType" = 'COST_OF_SALES'), 0)  AS "costOfSales",
         COALESCE(sum(l.debit - l.credit) FILTER (WHERE a."subType" IN
                    ('EMPLOYEE_COST','PREMISES','DEPRECIATION','GENERAL_EXPENSE')), 0)     AS "operatingExpenses",
         COALESCE(sum(l.debit - l.credit) FILTER (WHERE a."subType" IN ('FINANCE_COST','TAXATION')), 0) AS "financeAndTax"
    FROM "Accounting"."VoucherLines" l
    JOIN "Accounting"."Vouchers" e ON e."tenantId" = l."tenantId" AND e.id = l."journalEntryId"
    JOIN "Accounting"."ChartOfAccounts" a       ON a."tenantId" = l."tenantId" AND a.id = l."accountId"
   WHERE e.status IN ('POSTED','REVERSED')
     AND e."voucherType" <> 'OB'
     AND a."accountClass" = 5
     AND NOT EXISTS (SELECT 1 FROM "Accounting"."FiscalYears" fy
                      WHERE fy."tenantId" = e."tenantId" AND fy."closingJournalEntryId" = e.id)
   GROUP BY l."tenantId", date_trunc('month', e."postingDate")::date
),
months AS (
  SELECT f."tenantId", gs::date AS "monthStart"
    FROM (SELECT gl."tenantId", min(gl."monthStart") AS "firstMonth" FROM gl GROUP BY gl."tenantId") f
   CROSS JOIN LATERAL generate_series(f."firstMonth"::timestamp,
                                      GREATEST(f."firstMonth", date_trunc('month', current_date)::date)::timestamp,
                                      interval '1 month') AS gs
),
m AS (
  SELECT mo."tenantId", mo."monthStart",
         COALESCE(gl."totalExpenses", 0)     AS "totalExpenses",
         COALESCE(gl."costOfSales", 0)      AS "costOfSales",
         COALESCE(gl."operatingExpenses", 0) AS "operatingExpenses",
         COALESCE(gl."financeAndTax", 0)    AS "financeAndTax"
    FROM months mo
    LEFT JOIN gl ON gl."tenantId" = mo."tenantId" AND gl."monthStart" = mo."monthStart"
)
SELECT m."tenantId",
       m."monthStart",
       (m."monthStart" + interval '1 month' - interval '1 day')::date AS "monthEnd",
       m."totalExpenses",
       m."costOfSales",
       m."operatingExpenses",
       m."financeAndTax",
       COALESCE(p."totalExpenses", 0)                                 AS "prevMonthTotal",
       round(100 * (m."totalExpenses" - p."totalExpenses") / NULLIF(p."totalExpenses", 0), 1) AS "momChangePct",
       (m."monthStart" = date_trunc('month', current_date)::date)     AS "isCurrentMonth"
  FROM m
  LEFT JOIN m p ON p."tenantId" = m."tenantId"
               AND p."monthStart" = (m."monthStart" - interval '1 month')::date;

COMMENT ON VIEW "Company"."getDashboardMonthlyExpenses" IS
  'Dashboard Total expenses card per month: class 5 GL (debit − credit) split into cost of sales, operating expenses, finance & tax, with previous month. Budget gauge ("below plan") is Full only. Screen: app/dashboard.';


-- ---------------------------------------------------------------------------
-- Company.getDashboardMoneyFlow — income vs expense per MONTH and per QUARTER
-- (grain column), from the GL (P&L basis).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getDashboardMoneyFlow"
WITH (security_invoker = true) AS
SELECT l."tenantId",
       g.grain,
       date_trunc(g.unit, e."postingDate")::date                                       AS "periodStart",
       COALESCE(sum(l.credit - l.debit) FILTER (WHERE a."accountClass" = 4), 0)        AS income,
       COALESCE(sum(l.debit - l.credit) FILTER (WHERE a."accountClass" = 5), 0)        AS expense,
       COALESCE(sum(l.credit - l.debit), 0)                                           AS net
  FROM "Accounting"."VoucherLines" l
  JOIN "Accounting"."Vouchers" e ON e."tenantId" = l."tenantId" AND e.id = l."journalEntryId"
  JOIN "Accounting"."ChartOfAccounts" a       ON a."tenantId" = l."tenantId" AND a.id = l."accountId"
 CROSS JOIN (VALUES ('MONTH', 'month'), ('QUARTER', 'quarter')) AS g (grain, unit)
 WHERE e.status IN ('POSTED','REVERSED')
   AND e."voucherType" <> 'OB'
   AND a."accountClass" IN (4, 5)
   AND NOT EXISTS (SELECT 1 FROM "Accounting"."FiscalYears" fy
                    WHERE fy."tenantId" = e."tenantId" AND fy."closingJournalEntryId" = e.id)
 GROUP BY l."tenantId", g.grain, date_trunc(g.unit, e."postingDate")::date;

COMMENT ON VIEW "Company"."getDashboardMoneyFlow" IS
  'Dashboard Money Flow chart: income (class 4) and expense (class 5) per periodStart at grain MONTH or QUARTER (calendar quarters = fiscal quarters for FY starting Jan/Apr/Jul). Screen: app/dashboard.';


-- ---------------------------------------------------------------------------
-- Company.getDashboardRecentTransactions — union of customer receipts, vendor
-- payments, vendor bills and sales invoices (drafts and held invoices
-- excluded). Order by occurredAt DESC and LIMIT in the query.
-- direction: RECEIPT (money in / receivable) or PAYMENT (money out / payable).
-- status: COMPLETED / PENDING / FAILED from the source document status.
-- amount in base currency (document amount × fxRate).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getDashboardRecentTransactions"
WITH (security_invoker = true) AS
SELECT rc."tenantId",
       'RCPT'::text                                          AS "sourceDocType",
       rc.id                                                 AS "sourceDocId",
       rc."docNo",
       rc."docDate",
       rc."postedAt"                                          AS "occurredAt",
       'CUSTOMER'::text                                      AS "partyType",
       rc."customerId"                                        AS "partyId",
       COALESCE(cu."displayName", cu.name)                    AS "partyName",
       rc.method                                             AS method,
       round(rc."amountReceived" * rc."fxRate", 2)             AS amount,
       'RECEIPT'::text                                       AS direction,
       CASE WHEN rc.status IN ('VOID','BOUNCED') THEN 'FAILED' ELSE 'COMPLETED' END AS status,
       rc.status                                             AS "sourceStatus",
       rc."branchId"
  FROM "Sales"."CustomerReceipts" rc
  JOIN "Sales"."Customers" cu ON cu."tenantId" = rc."tenantId" AND cu.id = rc."customerId"
UNION ALL
SELECT vp."tenantId",
       'PAY'::text,
       vp.id,
       vp."docNo",
       vp."docDate",
       COALESCE(vp."postedAt", vp."approvedAt", vp."createdAt"),
       'VENDOR'::text,
       vp."vendorId",
       ve.name,
       vp.method,
       round(vp.amount * vp."fxRate", 2),
       'PAYMENT'::text,
       CASE WHEN vp.status = 'VOID' THEN 'FAILED'
            WHEN vp.status IN ('PENDING_APPROVAL','PRESENTED') THEN 'PENDING'
            ELSE 'COMPLETED' END,
       vp.status,
       vp."branchId"
  FROM "Purchases"."VendorPayments" vp
  JOIN "Purchases"."Vendors" ve ON ve."tenantId" = vp."tenantId" AND ve.id = vp."vendorId"
 WHERE vp.status <> 'DRAFT'
UNION ALL
SELECT bi."tenantId",
       CASE bi.channel WHEN 'COUNTER' THEN 'PV' ELSE 'BILL' END,
       bi.id,
       bi."docNo",
       bi."docDate",
       COALESCE(bi."postedAt", bi."approvedAt", bi."submittedAt", bi."createdAt"),
       'VENDOR'::text,
       bi."vendorId",
       ve.name,
       bi."payMode",
       round(bi."totalAmount" * bi."fxRate", 2),
       'PAYMENT'::text,
       CASE WHEN bi.status = 'VOID' THEN 'FAILED'
            WHEN bi.status = 'PAID' THEN 'COMPLETED'
            ELSE 'PENDING' END,
       bi.status,
       bi."branchId"
  FROM "Purchases"."VendorBills" bi
  JOIN "Purchases"."Vendors" ve ON ve."tenantId" = bi."tenantId" AND ve.id = bi."vendorId"
 WHERE bi.status <> 'DRAFT'
UNION ALL
SELECT iv."tenantId",
       CASE iv.channel WHEN 'COUNTER' THEN 'SV' WHEN 'WHOLESALE' THEN 'WS' WHEN 'POS' THEN 'POS' ELSE 'INV' END,
       iv.id,
       iv."docNo",
       iv."docDate",
       COALESCE(iv."postedAt", iv."createdAt"),
       'CUSTOMER'::text,
       iv."customerId",
       COALESCE(cu."displayName", cu.name),
       CASE iv.channel WHEN 'STANDARD' THEN iv."paymentTerms" ELSE iv.channel END,
       round(iv."netAmount" * iv."fxRate", 2),
       'RECEIPT'::text,
       CASE WHEN iv.status = 'VOID' THEN 'FAILED'
            WHEN iv.status = 'PAID' THEN 'COMPLETED'
            ELSE 'PENDING' END,
       iv.status,
       iv."branchId"
  FROM "Sales"."SalesInvoices" iv
  JOIN "Sales"."Customers" cu ON cu."tenantId" = iv."tenantId" AND cu.id = iv."customerId"
 WHERE iv.status <> 'DRAFT';

COMMENT ON VIEW "Company"."getDashboardRecentTransactions" IS
  'Dashboard Transaction History: receipts, vendor payments, bills and invoices (non-draft) with party, method, base-currency amount, direction RECEIPT/PAYMENT (filter All / Receipts / Payments) and status COMPLETED/PENDING/FAILED; order by occurredAt DESC. Screen: app/dashboard.';


-- ---------------------------------------------------------------------------
-- Company.getNumberingSeriesPreview — Company Settings › Numbering Series:
-- "Next number" and "Preview" without consuming a number. Mirrors
-- Company.getNextDocNo() (same tokens, same order of replacement) for today's
-- date; the counter row is the one of the current reset period.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getNumberingSeriesPreview"
WITH (security_invoker = true) AS
SELECT s."tenantId",
       s.id                                         AS "sequenceId",
       s."docType",
       dt.name                                      AS "docTypeName",
       dt.module                                    AS "docTypeModule",
       s."branchId",
       b.code                                       AS "branchCode",
       b.name                                       AS "branchName",
       s.prefix,
       s.pattern,
       s.padding,
       s."startValue",
       s."resetPolicy",
       s."isActive",
       k."periodKey",
       COALESCE(c."nextValue", s."startValue")        AS "nextValue",
       regexp_replace(r.filled, '\{SEQ\d*\}',
                      lpad(COALESCE(c."nextValue", s."startValue")::text,
                           COALESCE(substring(r.filled FROM '\{SEQ(\d+)\}')::int, s.padding), '0')) AS preview
  FROM "Company"."NumberingSeries" s
  JOIN "Company"."DocumentTypes" dt ON dt.code = s."docType"
  LEFT JOIN "Company"."Branches" b ON b."tenantId" = s."tenantId" AND b.id = s."branchId"
 CROSS JOIN LATERAL (
   SELECT CASE s."resetPolicy" WHEN 'YEARLY'  THEN to_char(current_date, 'YYYY')
                              WHEN 'MONTHLY' THEN to_char(current_date, 'YYYY-MM')
                              ELSE 'ALL' END AS "periodKey"
 ) k
  LEFT JOIN "Company"."NumberingSeriesCounters" c ON c."tenantId" = s."tenantId"
                                       AND c."sequenceId" = s.id
                                       AND c."periodKey" = k."periodKey"
 CROSS JOIN LATERAL (
   SELECT replace(replace(replace(replace(replace(s.pattern,
            '{PREFIX}', s.prefix),
            '{YYYY}',   to_char(current_date, 'YYYY')),
            '{YY}',     to_char(current_date, 'YY')),
            '{MM}',     to_char(current_date, 'MM')),
            '{BR}',     COALESCE(b.code, '')) AS filled
 ) r;

COMMENT ON VIEW "Company"."getNumberingSeriesPreview" IS
  'Numbering series with the next value of the current reset period and the formatted preview (e.g. JV-2026-000046), computed like Company.getNextDocNo() without consuming a number. Screen: app/settings (Numbering Series tab).';


-- ---------------------------------------------------------------------------
-- Company.getUserKpis — Users screen KPIs, one row per tenant.
-- seats_used = ACTIVE + INVITED users (suspended / removed free their seat);
-- compare with Platform.Subscriptions.seats in the app.
-- pending_invites = INVITED users with an unused, unexpired INVITE token.
-- mfa_by_role = {"<primary role>": {"users": n, "mfa": m}} over active users.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getUserKpis"
WITH (security_invoker = true) AS
WITH u AS (
  SELECT au."tenantId",
         count(*) FILTER (WHERE au.status = 'ACTIVE')                                AS "activeUsers",
         count(*) FILTER (WHERE au.status = 'SUSPENDED')                             AS "suspendedUsers",
         count(*) FILTER (WHERE au.status = 'INVITED')                               AS "invitedUsers",
         count(*) FILTER (WHERE au."isExternal" AND au.status IN ('ACTIVE','INVITED','SUSPENDED')) AS "externalUsers",
         count(*) FILTER (WHERE au.status = 'INVITED'
                            AND EXISTS (SELECT 1 FROM "Company"."PasswordResets" pr
                                         WHERE pr."tenantId" = au."tenantId" AND pr."userId" = au.id
                                           AND pr.purpose = 'INVITE' AND pr."usedAt" IS NULL
                                           AND pr."expiresAt" > now()))               AS "pendingInvites",
         count(*) FILTER (WHERE au.status = 'ACTIVE' AND au."mfaEnabled")             AS "mfaEnabledUsers",
         count(*) FILTER (WHERE au.status = 'ACTIVE' AND NOT au."mfaEnabled")         AS "noMfaUsers",
         count(*) FILTER (WHERE au.status IN ('ACTIVE','INVITED'))                   AS "seatsUsed"
    FROM "Company"."Users" au
   WHERE au."deletedAt" IS NULL
     AND au.status <> 'REMOVED'
   GROUP BY au."tenantId"
),
rr AS (
  SELECT x."tenantId",
         jsonb_object_agg(x."roleName", jsonb_build_object('users', x.users, 'mfa', x.mfa)) AS "mfaByRole"
    FROM (
      SELECT au."tenantId", COALESCE(r.name::text, '(no role)') AS "roleName",
             count(*) AS users, count(*) FILTER (WHERE au."mfaEnabled") AS mfa
        FROM "Company"."Users" au
        LEFT JOIN "Company"."UserRoles" ur ON ur."tenantId" = au."tenantId" AND ur."userId" = au.id AND ur."isPrimary"
        LEFT JOIN "Company"."Roles" r       ON r."tenantId" = ur."tenantId" AND r.id = ur."roleId"
       WHERE au."deletedAt" IS NULL AND au.status = 'ACTIVE'
       GROUP BY au."tenantId", COALESCE(r.name::text, '(no role)')
    ) x
   GROUP BY x."tenantId"
)
SELECT u."tenantId",
       u."activeUsers",
       u."suspendedUsers",
       u."invitedUsers",
       u."externalUsers",
       u."pendingInvites",
       u."mfaEnabledUsers",
       u."noMfaUsers",
       round(100.0 * u."mfaEnabledUsers" / NULLIF(u."activeUsers", 0), 1) AS "mfaCoveragePct",
       u."seatsUsed",
       COALESCE(rr."mfaByRole", '{}'::jsonb)                             AS "mfaByRole"
  FROM u
  LEFT JOIN rr ON rr."tenantId" = u."tenantId";

COMMENT ON VIEW "Company"."getUserKpis" IS
  'Users KPIs per tenant: active / suspended / invited / external users, pending invites (open INVITE token), MFA coverage %, seats used (ACTIVE + INVITED), MFA by primary role. Screen: app/settings/users (KPI cards, Security posture).';


-- ---------------------------------------------------------------------------
-- Company.getUserEffectivePermissions — union of the permissions of every role
-- a user holds (deleted roles ignored), with the granting roles.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getUserEffectivePermissions"
WITH (security_invoker = true) AS
SELECT ur."tenantId",
       ur."userId",
       rp."permissionCode",
       p.module,
       p.resource,
       p."resourceLabel",
       p.action,
       array_agg(DISTINCT r.name::text ORDER BY r.name::text) AS "grantedByRoles",
       array_agg(DISTINCT r.id)                               AS "grantedByRoleIds",
       bool_or(ur."isPrimary")                                 AS "viaPrimaryRole"
  FROM "Company"."UserRoles" ur
  JOIN "Company"."Users" u         ON u."tenantId" = ur."tenantId" AND u.id = ur."userId" AND u."deletedAt" IS NULL
  JOIN "Company"."Roles" r             ON r."tenantId" = ur."tenantId" AND r.id = ur."roleId" AND r."deletedAt" IS NULL
  JOIN "Company"."RolePermissions" rp ON rp."tenantId" = r."tenantId" AND rp."roleId" = r.id
  JOIN "Company"."Permissions" p       ON p.code = rp."permissionCode"
 GROUP BY ur."tenantId", ur."userId", rp."permissionCode", p.module, p.resource, p."resourceLabel", p.action;

COMMENT ON VIEW "Company"."getUserEffectivePermissions" IS
  'Effective permissions per user = union of RolePermissions over the user''s roles, with the roles that grant each code. Screens: app/settings/users (drawer › Permissions "Inherited from role"), app/unauthorized (what is missing / who can grant).';


-- ---------------------------------------------------------------------------
-- Company.getAuditTrail — Audit Trail rows + drawer. prev_entry_hash = hash of
-- the previous id of the same tenant (correlated lookup, so date / module
-- filters still prune partitions). module_effective falls back to a module
-- derived from schemaName when the writer did not set module.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getAuditTrail"
WITH (security_invoker = true) AS
SELECT al."tenantId",
       al.id,
       al."occurredAt",
       al."userId",
       COALESCE(u."fullName", al."actorEmail"::text)                   AS "userName",
       pr."roleName",
       al."actorEmail",
       al.action,
       al.module,
       COALESCE(al.module,
                CASE al."schemaName" WHEN 'acc' THEN 'ACCOUNTING' WHEN 'treasury' THEN 'BANKING'
                                    WHEN 'sales' THEN 'SALES' WHEN 'purchase' THEN 'PURCHASES'
                                    WHEN 'inv' THEN 'INVENTORY' WHEN 'tax' THEN 'TAX'
                                    WHEN 'core' THEN 'SETTINGS' ELSE 'SYSTEM' END) AS "moduleEffective",
       al."schemaName",
       al."tableName",
       al."recordId",
       al."recordLabel",
       al.changes,
       CASE WHEN al.action = 'UPDATE' AND jsonb_typeof(al.changes) = 'object'
            THEN ARRAY(SELECT jsonb_object_keys(al.changes)) END     AS "changedFields",
       al."ipAddress",
       al."userAgent",
       al."sessionId",
       al."entryHash",
       (SELECT p."entryHash"
          FROM "Company"."AuditTrailEntries" p
         WHERE p."tenantId" = al."tenantId" AND p.id < al.id
         ORDER BY p.id DESC
         LIMIT 1)                                                    AS "prevEntryHash",
       (SELECT s."blockNo"
          FROM "Company"."AuditTrailSeals" s
         WHERE s."tenantId" = al."tenantId" AND al.id BETWEEN s."firstLogId" AND s."lastLogId"
         LIMIT 1)                                                    AS "sealedBlockNo"
  FROM "Company"."AuditTrailEntries" al
  LEFT JOIN "Company"."Users" u ON u."tenantId" = al."tenantId" AND u.id = al."userId"
  LEFT JOIN LATERAL (
    SELECT r.name::text AS "roleName"
      FROM "Company"."UserRoles" ur
      JOIN "Company"."Roles" r ON r."tenantId" = ur."tenantId" AND r.id = ur."roleId"
     WHERE ur."tenantId" = al."tenantId" AND ur."userId" = al."userId" AND ur."isPrimary"
     LIMIT 1
  ) pr ON true;

COMMENT ON VIEW "Company"."getAuditTrail" IS
  'Audit Trail: Company.AuditTrailEntries with user name, primary role, effective module, changed field list, previous entry hash (hash chain) and sealing block number. Screen: app/settings/audit (table, filters, drawer).';


-- ---------------------------------------------------------------------------
-- Company.getNotificationSummary — the signed-in user's counters (one row; the
-- view is restricted to Company.getCurrentUserId(): "own rows only").
-- Archived notifications are ignored.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getNotificationSummary"
WITH (security_invoker = true) AS
SELECT u."tenantId",
       u.id                AS "userId",
       s.unread,
       s."needsAction",
       s.mentions,
       s.total7d,
       s.total,
       s."countApprovals",
       s."countFinance",
       s."countHr",
       s."countSystem",
       s."unreadApprovals",
       s."unreadFinance",
       s."unreadHr",
       s."unreadSystem"
  FROM "Company"."Users" u
 CROSS JOIN LATERAL (
   SELECT count(*) FILTER (WHERE n."readAt" IS NULL)                                   AS unread,
          count(*) FILTER (WHERE n."needsAction")                                      AS "needsAction",
          count(*) FILTER (WHERE n."isMention")                                        AS mentions,
          count(*) FILTER (WHERE n."createdAt" >= now() - interval '7 days')           AS total7d,
          count(*)                                                                    AS total,
          count(*) FILTER (WHERE n.category = 'APPROVALS')                            AS "countApprovals",
          count(*) FILTER (WHERE n.category = 'FINANCE')                              AS "countFinance",
          count(*) FILTER (WHERE n.category = 'HR')                                   AS "countHr",
          count(*) FILTER (WHERE n.category = 'SYSTEM')                               AS "countSystem",
          count(*) FILTER (WHERE n.category = 'APPROVALS' AND n."readAt" IS NULL)      AS "unreadApprovals",
          count(*) FILTER (WHERE n.category = 'FINANCE'   AND n."readAt" IS NULL)      AS "unreadFinance",
          count(*) FILTER (WHERE n.category = 'HR'        AND n."readAt" IS NULL)      AS "unreadHr",
          count(*) FILTER (WHERE n.category = 'SYSTEM'    AND n."readAt" IS NULL)      AS "unreadSystem"
     FROM "Company"."Notifications" n
    WHERE n."tenantId" = u."tenantId"
      AND n."userId" = u.id
      AND n."archivedAt" IS NULL
 ) s
 WHERE u.id = "Company"."getCurrentUserId"();

COMMENT ON VIEW "Company"."getNotificationSummary" IS
  'Notification counters for the signed-in user (Company.getCurrentUserId()): unread, needs action, mentions, received in the last 7 days, and totals / unread per category tab. Screen: app/notifications.';


-- =============================================================================
-- FULL-ONLY VIEWS
-- Views named in entities/02-auth-workspace-settings.md for Full-only screens.
-- They read base tables only, except Company.getTodayKpis, which reads
-- Company.getApprovalsInbox and Company.getTodayDueItems defined just above it in this
-- file (no dependency on any other view file).
--
-- Objects:
--   Company.getApprovalsInbox         app/approvals, app/dashboard, app/today  pending approvals (+ is_mine)
--   Company.getDashboardBudgetRemaining  app/dashboard  Budget Remaining card (per cost centre)
--   Company.getSetupGuideProgress         app/setup      Setup Guide progress (per group + overall)
--   Company.getTodayDueItems              app/today      Due today / overdue (invoices, bills, cheques, my tasks)
--   Company.getTodayKpis             app/today      KPI tiles for the signed-in user
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Company.getApprovalsInbox — one row per PENDING approval request at its current
-- step. is_mine = the signed-in user (Company.getCurrentUserId()) may act on the
-- current step: step approver USER, holder of the step ROLE, delegate of the
-- current step (latest DELEGATE action), or covered by an active standing
-- Company.ApprovalDelegations (subject NULL or matching) from such an approver;
-- excluded when blockSelfApproval and the user is the requester, or the
-- user already approved this step. LINE_MANAGER steps are not resolved here
-- (needs HumanResources.Employees); the API resolves them.
-- age_hours = now − requestedAt; dueAt = SLA deadline of the current step.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getApprovalsInbox"
WITH (security_invoker = true) AS
SELECT ar."tenantId",
       ar.id                                                              AS "requestId",
       ar."workflowId",
       wf.name                                                            AS "workflowName",
       wf.subject,
       ar."entityType",
       dt.name                                                            AS "docTypeName",
       ar."entityId",
       ar."docLabel",
       ar.title,
       ar.amount,
       ar."currencyCode",
       ar."branchId",
       ar."requestedByUserId",
       rq."fullName"                                                       AS "requestedByName",
       ar."requestedAt",
       ar."currentStepNo",
       st.name                                                            AS "currentStepName",
       st."approverType",
       st."approverRoleId",
       ro.name::text                                                      AS "approverRoleName",
       st."approverUserId",
       au."fullName"                                                       AS "approverUserName",
       dg."delegateToUserId"                                             AS "delegatedToUserId",
       st."approvalMode",
       st."slaHours",
       round((extract(epoch FROM now() - ar."requestedAt") / 3600.0)::numeric, 1)         AS "ageHours",
       ar."currentStepDueAt"                                             AS "dueAt",
       round((extract(epoch FROM ar."currentStepDueAt" - now()) / 3600.0)::numeric, 1)  AS "hoursToDue",
       COALESCE(ar."currentStepDueAt" < now(), false)                    AS "isBreached",
       ar."isEscalated",
       ar.status,
       COALESCE(me."isMine", false)                                        AS "isMine"
  FROM "Company"."Approvals" ar
  JOIN "Company"."ApprovalWorkflows" wf ON wf."tenantId" = ar."tenantId" AND wf.id = ar."workflowId"
  JOIN "Company"."DocumentTypes" dt          ON dt.code = ar."entityType"
  JOIN "Company"."Users" rq          ON rq."tenantId" = ar."tenantId" AND rq.id = ar."requestedByUserId"
  LEFT JOIN "Company"."ApprovalWorkflowSteps" st ON st."tenantId" = ar."tenantId"
                                 AND st."workflowId" = ar."workflowId"
                                 AND st."stepNo" = ar."currentStepNo"
  LEFT JOIN "Company"."Roles" ro          ON ro."tenantId" = st."tenantId" AND ro.id = st."approverRoleId"
  LEFT JOIN "Company"."Users" au      ON au."tenantId" = st."tenantId" AND au.id = st."approverUserId"
  LEFT JOIN LATERAL (
    SELECT aa."delegateToUserId"
      FROM "Company"."ApprovalActions" aa
     WHERE aa."tenantId" = ar."tenantId"
       AND aa."requestId" = ar.id
       AND aa."stepNo" = ar."currentStepNo"
       AND aa.action = 'DELEGATE'
     ORDER BY aa."actedAt" DESC
     LIMIT 1
  ) dg ON true
  LEFT JOIN LATERAL (
    SELECT (c.uid IS NOT NULL
            AND NOT (COALESCE(st."blockSelfApproval", true) AND ar."requestedByUserId" = c.uid)
            AND NOT EXISTS (SELECT 1 FROM "Company"."ApprovalActions" x
                             WHERE x."tenantId" = ar."tenantId" AND x."requestId" = ar.id
                               AND x."stepNo" = ar."currentStepNo"
                               AND x.action = 'APPROVE' AND x."actorUserId" = c.uid)
            AND (   (st."approverType" = 'USER' AND st."approverUserId" = c.uid)
                 OR (st."approverType" = 'ROLE'
                     AND EXISTS (SELECT 1 FROM "Company"."UserRoles" ur
                                  WHERE ur."tenantId" = ar."tenantId" AND ur."userId" = c.uid
                                    AND ur."roleId" = st."approverRoleId"))
                 OR dg."delegateToUserId" = c.uid
                 OR EXISTS (SELECT 1 FROM "Company"."ApprovalDelegations" d
                             WHERE d."tenantId" = ar."tenantId"
                               AND d."toUserId" = c.uid
                               AND d."isActive"
                               AND current_date BETWEEN d."startsOn" AND d."endsOn"
                               AND (d.subject IS NULL OR d.subject = wf.subject)
                               AND (   (st."approverType" = 'USER' AND d."fromUserId" = st."approverUserId")
                                    OR (st."approverType" = 'ROLE'
                                        AND EXISTS (SELECT 1 FROM "Company"."UserRoles" ur2
                                                     WHERE ur2."tenantId" = d."tenantId"
                                                       AND ur2."userId" = d."fromUserId"
                                                       AND ur2."roleId" = st."approverRoleId")))))
           ) AS "isMine"
      FROM (SELECT "Company"."getCurrentUserId"() AS uid) c
  ) me ON true
 WHERE ar.status = 'PENDING';

COMMENT ON VIEW "Company"."getApprovalsInbox" IS
  'Pending approval requests at their current step: document (entityType, doc_type_name, docLabel, title, amount), requester, step name and eligible approver (role / user / delegate), age_hours, dueAt (step SLA), hours_to_due, is_breached, status; is_mine = the signed-in user can act now (filter on it for "Waiting on you"). Screens: app/approvals, app/dashboard (Pending approvals), app/today (Approvals queue).';


-- ---------------------------------------------------------------------------
-- Company.getDashboardBudgetRemaining — one row per tenant per cost centre for the
-- fiscal year containing current_date.
-- Budget = expense (class 5) lines of the APPROVED version of each budget of
-- that year (Accounting.Budgets.currentVersionId when approved, else the highest
-- approved versionNo). Cost centre = BudgetVersionLines.costCentreId, else the
-- budget header's costCentreId; NULL = "Unallocated".
-- Actual = posted GL (POSTED/REVERSED, no OB, no closing JV) debit − credit
-- from FY start to today on the same account + cost centre pairs.
-- budget_ytd_amount = budget months m01.. up to the current fiscal month.
-- total_* / remaining_pct = tenant totals (same on every row).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getDashboardBudgetRemaining"
WITH (security_invoker = true) AS
WITH fy AS (
  SELECT f."tenantId", f.id AS "fiscalYearId", f.code AS "fiscalYearCode", f."startDate", f."endDate",
         ((extract(year FROM current_date)::int - extract(year FROM f."startDate")::int) * 12
          + extract(month FROM current_date)::int - extract(month FROM f."startDate")::int + 1) AS "monthsElapsed"
    FROM "Accounting"."FiscalYears" f
   WHERE current_date BETWEEN f."startDate" AND f."endDate"
),
ver AS (
  SELECT DISTINCT ON (bv."tenantId", bv."budgetId")
         bv."tenantId", bv.id AS "budgetVersionId", b."costCentreId" AS "headerCostCentreId",
         fy."fiscalYearId", fy."monthsElapsed"
    FROM "Accounting"."BudgetVersions" bv
    JOIN "Accounting"."Budgets" b ON b."tenantId" = bv."tenantId" AND b.id = bv."budgetId"
    JOIN fy           ON fy."tenantId" = b."tenantId" AND fy."fiscalYearId" = b."fiscalYearId"
   WHERE bv.status = 'APPROVED'
   ORDER BY bv."tenantId", bv."budgetId", (bv.id = b."currentVersionId") DESC, bv."versionNo" DESC
),
bud AS (
  SELECT bl."tenantId",
         bl."accountId",
         COALESCE(bl."costCentreId", v."headerCostCentreId") AS "costCentreId",
         sum(bl."totalAmount")                                  AS "budgetAmount",
         sum((SELECT COALESCE(sum(m), 0)
                FROM unnest((ARRAY[bl.m01, bl.m02, bl.m03, bl.m04, bl.m05, bl.m06,
                                   bl.m07, bl.m08, bl.m09, bl.m10, bl.m11, bl.m12])[1:v."monthsElapsed"]) AS m)) AS "budgetYtdAmount"
    FROM "Accounting"."BudgetVersionLines" bl
    JOIN ver v         ON v."tenantId" = bl."tenantId" AND v."budgetVersionId" = bl."budgetVersionId"
    JOIN "Accounting"."ChartOfAccounts" a ON a."tenantId" = bl."tenantId" AND a.id = bl."accountId"
   WHERE a."accountClass" = 5
   GROUP BY bl."tenantId", bl."accountId", COALESCE(bl."costCentreId", v."headerCostCentreId")
),
act AS (
  SELECT l."tenantId", l."accountId", l."costCentreId",
         sum(l.debit - l.credit) AS "actualAmount"
    FROM "Accounting"."VoucherLines" l
    JOIN "Accounting"."Vouchers" e ON e."tenantId" = l."tenantId" AND e.id = l."journalEntryId"
    JOIN fy                  ON fy."tenantId" = e."tenantId"
   WHERE e.status IN ('POSTED','REVERSED')
     AND e."voucherType" <> 'OB'
     AND e."postingDate" >= fy."startDate"
     AND e."postingDate" <= LEAST(fy."endDate", current_date)
     AND NOT EXISTS (SELECT 1 FROM "Accounting"."FiscalYears" cf
                      WHERE cf."tenantId" = e."tenantId" AND cf."closingJournalEntryId" = e.id)
   GROUP BY l."tenantId", l."accountId", l."costCentreId"
),
cc AS (
  SELECT bud."tenantId",
         bud."costCentreId",
         sum(bud."budgetAmount")                 AS "budgetAmount",
         sum(bud."budgetYtdAmount")             AS "budgetYtdAmount",
         COALESCE(sum(act."actualAmount"), 0)    AS "actualAmount"
    FROM bud
    LEFT JOIN act ON act."tenantId" = bud."tenantId"
                 AND act."accountId" = bud."accountId"
                 AND act."costCentreId" IS NOT DISTINCT FROM bud."costCentreId"
   GROUP BY bud."tenantId", bud."costCentreId"
)
SELECT cc."tenantId",
       fy."fiscalYearId",
       fy."fiscalYearCode",
       cc."costCentreId",
       c.code                                                                   AS "costCentreCode",
       COALESCE(c.name, 'Unallocated')                                          AS "costCentreName",
       cc."budgetAmount",
       cc."budgetYtdAmount",
       cc."actualAmount",
       cc."budgetAmount" - cc."actualAmount"                                      AS "remainingAmount",
       round(100 * cc."actualAmount" / NULLIF(cc."budgetAmount", 0), 1)           AS "usedPct",
       sum(cc."budgetAmount") OVER w                                             AS "totalBudgetAmount",
       sum(cc."actualAmount") OVER w                                             AS "totalActualAmount",
       round(100 * (sum(cc."budgetAmount") OVER w - sum(cc."actualAmount") OVER w)
                 / NULLIF(sum(cc."budgetAmount") OVER w, 0), 1)                  AS "remainingPct"
  FROM cc
  JOIN fy ON fy."tenantId" = cc."tenantId"
  LEFT JOIN "Accounting"."CostCentres" c ON c."tenantId" = cc."tenantId" AND c.id = cc."costCentreId"
WINDOW w AS (PARTITION BY cc."tenantId");

COMMENT ON VIEW "Company"."getDashboardBudgetRemaining" IS
  'Dashboard Budget Remaining card: per cost centre for the current fiscal year, approved-version expense budget (FY and YTD) vs posted actual (class 5, debit − credit), remaining_amount and usedPct; total_budget_amount, total_actual_amount and remaining_pct are tenant totals. Screen: app/dashboard.';


-- ---------------------------------------------------------------------------
-- Company.getSetupGuideProgress — Setup Guide. Step metadata (order, group, weight %,
-- minutes, route) is product configuration, mirrored here from
-- src/9A-company-plus.js (weights 10/14/14/10/10/10/8/10/14 = 100).
-- A step without a Company.SetupGuideSteps row counts as not done.
-- Rows: one per tenant per group (is_total = false) plus one overall row per
-- tenant (groupName NULL, is_total = true) for the ring "n of 9 done".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getSetupGuideProgress"
WITH (security_invoker = true) AS
WITH cfg ("stepKey", "stepNo", "groupName", "weightPct", "estMinutes", route) AS (
  VALUES ('PROFILE',  1, 'Basics',     10,  3, 'app/settings'),
         ('COA',      2, 'Basics',     14, 10, 'app/accounting/coa'),
         ('OPENING',  3, 'Money',      14, 15, 'app/accounting/opening'),
         ('ITEMS',    4, 'Basics',     10,  8, 'app/import'),
         ('BANK',     5, 'Money',      10,  5, 'app/bank/accounts'),
         ('TAX',      6, 'Compliance', 10,  7, 'app/tax/fbr'),
         ('TEAM',     7, 'People',      8,  4, 'app/settings/users'),
         ('INVOICE',  8, 'Money',      10,  3, 'app/sales/invoices/new'),
         ('PAYROLL',  9, 'People',     14, 20, 'app/hr/payroll/structures')
),
s AS (
  SELECT cp."tenantId", cfg."stepKey", cfg."stepNo", cfg."groupName", cfg."weightPct", cfg."estMinutes", cfg.route,
         COALESCE(ss."isDone", false) AS "isDone",
         ss."doneAt"
    FROM "Company"."CompanySettings" cp
   CROSS JOIN cfg
    LEFT JOIN "Company"."SetupGuideSteps" ss ON ss."tenantId" = cp."tenantId" AND ss."stepKey" = cfg."stepKey"
)
SELECT s."tenantId",
       s."groupName",
       (GROUPING(s."groupName") = 1)                                              AS "isTotal",
       min(s."stepNo")                                                            AS "groupSort",
       count(*)                                                                  AS "totalSteps",
       count(*) FILTER (WHERE s."isDone")                                         AS "doneSteps",
       count(*) FILTER (WHERE NOT s."isDone")                                     AS "todoSteps",
       sum(s."weightPct")                                                         AS "totalWeightPct",
       COALESCE(sum(s."weightPct") FILTER (WHERE s."isDone"), 0)                   AS "doneWeightPct",
       round(100.0 * COALESCE(sum(s."weightPct") FILTER (WHERE s."isDone"), 0)
                   / NULLIF(sum(s."weightPct"), 0), 0)                            AS "progressPct",
       COALESCE(sum(s."estMinutes") FILTER (WHERE NOT s."isDone"), 0)              AS "minutesRemaining",
       (array_agg(s."stepKey" ORDER BY s."stepNo") FILTER (WHERE NOT s."isDone"))[1] AS "nextStepKey",
       (array_agg(s.route ORDER BY s."stepNo") FILTER (WHERE NOT s."isDone"))[1]    AS "nextStepRoute",
       max(s."doneAt")                                                            AS "lastDoneAt"
  FROM s
 GROUP BY GROUPING SETS ((s."tenantId"), (s."tenantId", s."groupName"));

COMMENT ON VIEW "Company"."getSetupGuideProgress" IS
  'Setup Guide progress from Company.SetupGuideSteps: per group (Basics, Money, Compliance, People) and overall (is_total, groupName NULL): done_steps / total_steps, done_weight_pct of total_weight_pct, progressPct (weighted), minutes remaining and next step. Screen: app/setup.';


-- ---------------------------------------------------------------------------
-- Company.getTodayDueItems — items due today or overdue (dueOn <= current_date):
--   INVOICE_DUE      Sales.SalesInvoices POSTED / PARTIALLY_PAID with balance > 0
--   BILL_DUE         Purchases.VendorBills POSTED / PARTIALLY_PAID with balance > 0
--   CHEQUE_MATURING  BankCash.Cheques IN_HAND (received) / ISSUED, maturing on
--                    COALESCE(dueDate, chequeDate)
--   TASK_DUE         the signed-in user's Company.Tasks PENDING / IN_PROGRESS
-- amount = base currency (balance × fxRate); cheques carry no fxRate, so
-- their amount is the cheque amount. direction IN = money to receive, OUT =
-- money to pay; NULL for tasks.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getTodayDueItems"
WITH (security_invoker = true) AS
SELECT iv."tenantId",
       'INVOICE_DUE'::text                                   AS kind,
       CASE iv.channel WHEN 'COUNTER' THEN 'SV' WHEN 'WHOLESALE' THEN 'WS' WHEN 'POS' THEN 'POS' ELSE 'INV' END AS "sourceDocType",
       iv.id                                                 AS "sourceDocId",
       iv."docNo",
       NULL::text                                            AS title,
       iv."dueDate"                                           AS "dueOn",
       NULL::time                                            AS "dueTime",
       (iv."dueDate" < current_date)                          AS "isOverdue",
       (current_date - iv."dueDate")                          AS "daysOverdue",
       'CUSTOMER'::text                                      AS "partyType",
       iv."customerId"                                        AS "partyId",
       COALESCE(cu."displayName", cu.name)                    AS "partyName",
       'IN'::text                                            AS direction,
       round(iv."balanceAmount" * iv."fxRate", 2)              AS amount,
       iv."balanceAmount"                                     AS "docAmount",
       iv."currencyCode",
       iv.status,
       iv."branchId",
       NULL::uuid                                            AS "assigneeUserId",
       'app/sales/invoices/view'::text                       AS "linkRoute"
  FROM "Sales"."SalesInvoices" iv
  JOIN "Sales"."Customers" cu ON cu."tenantId" = iv."tenantId" AND cu.id = iv."customerId"
 WHERE iv.status IN ('POSTED','PARTIALLY_PAID')
   AND iv."balanceAmount" > 0
   AND iv."dueDate" <= current_date
UNION ALL
SELECT bi."tenantId",
       'BILL_DUE'::text,
       CASE bi.channel WHEN 'COUNTER' THEN 'PV' ELSE 'BILL' END,
       bi.id,
       bi."docNo",
       NULL::text,
       bi."dueDate",
       NULL::time,
       (bi."dueDate" < current_date),
       (current_date - bi."dueDate"),
       'VENDOR'::text,
       bi."vendorId",
       ve.name,
       'OUT'::text,
       round(bi."balanceAmount" * bi."fxRate", 2),
       bi."balanceAmount",
       bi."currencyCode",
       bi.status,
       bi."branchId",
       NULL::uuid,
       'app/purchases/bills'::text
  FROM "Purchases"."VendorBills" bi
  JOIN "Purchases"."Vendors" ve ON ve."tenantId" = bi."tenantId" AND ve.id = bi."vendorId"
 WHERE bi.status IN ('POSTED','PARTIALLY_PAID')
   AND bi."balanceAmount" > 0
   AND bi."dueDate" <= current_date
UNION ALL
SELECT ch."tenantId",
       'CHEQUE_MATURING'::text,
       'CHQ'::text,
       ch.id,
       ch."docNo",
       ch."chequeNo",
       COALESCE(ch."dueDate", ch."chequeDate"),
       NULL::time,
       (COALESCE(ch."dueDate", ch."chequeDate") < current_date),
       (current_date - COALESCE(ch."dueDate", ch."chequeDate")),
       CASE WHEN ch."customerId" IS NOT NULL THEN 'CUSTOMER'
            WHEN ch."vendorId"   IS NOT NULL THEN 'VENDOR'
            WHEN ch."accountId"  IS NOT NULL THEN 'ACCOUNT' END,
       COALESCE(ch."customerId", ch."vendorId", ch."accountId"),
       ch."partyName",
       CASE ch.direction WHEN 'RECEIVED' THEN 'IN' ELSE 'OUT' END,
       ch.amount,
       ch.amount,
       ch."currencyCode",
       ch.status,
       ch."branchId",
       NULL::uuid,
       'app/bank/cheques'::text
  FROM "BankCash"."Cheques" ch
 WHERE ch.status IN ('IN_HAND','ISSUED')
   AND COALESCE(ch."dueDate", ch."chequeDate") <= current_date
UNION ALL
SELECT t."tenantId",
       'TASK_DUE'::text,
       'TASK'::text,
       t.id,
       NULL::text,
       t.title,
       t."dueDate",
       t."dueTime",
       (t."dueDate" < current_date),
       (current_date - t."dueDate"),
       NULL::text,
       NULL::uuid,
       NULL::text,
       NULL::text,
       NULL::numeric,
       NULL::numeric,
       NULL::char(3),
       t.status,
       NULL::uuid,
       t."assigneeUserId",
       COALESCE(t."linkRoute", 'app/today')
  FROM "Company"."Tasks" t
 WHERE t.status IN ('PENDING','IN_PROGRESS')
   AND t."dueDate" <= current_date
   AND t."assigneeUserId" = "Company"."getCurrentUserId"();

COMMENT ON VIEW "Company"."getTodayDueItems" IS
  'Due today and overdue: open posted sales invoices (INVOICE_DUE) and purchase bills (BILL_DUE) by dueDate and balance, cheques in hand / issued maturing (CHEQUE_MATURING) by due or cheque date, and the signed-in user''s open tasks (TASK_DUE); kind, docNo, partyName, base-currency amount, isOverdue, daysOverdue, linkRoute. Screen: app/today.';


-- ---------------------------------------------------------------------------
-- Company.getTodayKpis — one row for the signed-in user (Company.getCurrentUserId()).
-- Tasks: the user's Company.Tasks rows; overdue = dueDate passed and status not
-- DONE / CANCELLED. Awaiting approval = Company.getApprovalsInbox WHERE is_mine.
-- Money tiles = Company.getTodayDueItems financial rows (tasks excluded):
-- due_today_* = dueOn = today, overdue_* = dueOn < today.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Company"."getTodayKpis"
WITH (security_invoker = true) AS
SELECT u."tenantId",
       u.id                                     AS "userId",
       current_date                             AS today,
       tk."tasksDueToday",
       tk."tasksDoneToday",
       round(100.0 * tk."tasksDoneToday" / NULLIF(tk."tasksDueToday", 0), 0) AS "dailyProgressPct",
       tk."overdueTasks",
       tk."oldestOverdueDate",
       ap."awaitingApprovalCount",
       ap."awaitingApprovalValue",
       ap."approvalsBreached",
       dd."dueTodayAmount",
       dd."invoicesDueTodayCount",
       dd."invoicesDueTodayAmount",
       dd."billsDueTodayCount",
       dd."billsDueTodayAmount",
       dd."chequesMaturingTodayCount",
       dd."chequesMaturingTodayAmount",
       dd."overdueAmount",
       dd."overdueInvoicesCount",
       dd."overdueInvoicesAmount",
       dd."overdueBillsCount",
       dd."overdueBillsAmount",
       dd."overdueChequesCount",
       dd."overdueChequesAmount"
  FROM "Company"."Users" u
 CROSS JOIN LATERAL (
   SELECT count(*) FILTER (WHERE t."dueDate" = current_date AND t.status <> 'CANCELLED')                 AS "tasksDueToday",
          count(*) FILTER (WHERE t."dueDate" = current_date AND t.status = 'DONE')                       AS "tasksDoneToday",
          count(*) FILTER (WHERE t."dueDate" < current_date AND t.status IN ('PENDING','IN_PROGRESS'))   AS "overdueTasks",
          min(t."dueDate") FILTER (WHERE t."dueDate" < current_date AND t.status IN ('PENDING','IN_PROGRESS')) AS "oldestOverdueDate"
     FROM "Company"."Tasks" t
    WHERE t."tenantId" = u."tenantId"
      AND t."assigneeUserId" = u.id
 ) tk
 CROSS JOIN LATERAL (
   SELECT count(*)                                AS "awaitingApprovalCount",
          COALESCE(sum(i.amount), 0)              AS "awaitingApprovalValue",
          count(*) FILTER (WHERE i."isBreached")   AS "approvalsBreached"
     FROM "Company"."getApprovalsInbox" i
    WHERE i."tenantId" = u."tenantId"
      AND i."isMine"
 ) ap
 CROSS JOIN LATERAL (
   SELECT COALESCE(sum(d.amount) FILTER (WHERE NOT d."isOverdue"), 0)                                    AS "dueTodayAmount",
          count(*)               FILTER (WHERE NOT d."isOverdue" AND d.kind = 'INVOICE_DUE')             AS "invoicesDueTodayCount",
          COALESCE(sum(d.amount) FILTER (WHERE NOT d."isOverdue" AND d.kind = 'INVOICE_DUE'), 0)         AS "invoicesDueTodayAmount",
          count(*)               FILTER (WHERE NOT d."isOverdue" AND d.kind = 'BILL_DUE')                AS "billsDueTodayCount",
          COALESCE(sum(d.amount) FILTER (WHERE NOT d."isOverdue" AND d.kind = 'BILL_DUE'), 0)            AS "billsDueTodayAmount",
          count(*)               FILTER (WHERE NOT d."isOverdue" AND d.kind = 'CHEQUE_MATURING')         AS "chequesMaturingTodayCount",
          COALESCE(sum(d.amount) FILTER (WHERE NOT d."isOverdue" AND d.kind = 'CHEQUE_MATURING'), 0)     AS "chequesMaturingTodayAmount",
          COALESCE(sum(d.amount) FILTER (WHERE d."isOverdue"), 0)                                        AS "overdueAmount",
          count(*)               FILTER (WHERE d."isOverdue" AND d.kind = 'INVOICE_DUE')                 AS "overdueInvoicesCount",
          COALESCE(sum(d.amount) FILTER (WHERE d."isOverdue" AND d.kind = 'INVOICE_DUE'), 0)             AS "overdueInvoicesAmount",
          count(*)               FILTER (WHERE d."isOverdue" AND d.kind = 'BILL_DUE')                    AS "overdueBillsCount",
          COALESCE(sum(d.amount) FILTER (WHERE d."isOverdue" AND d.kind = 'BILL_DUE'), 0)                AS "overdueBillsAmount",
          count(*)               FILTER (WHERE d."isOverdue" AND d.kind = 'CHEQUE_MATURING')             AS "overdueChequesCount",
          COALESCE(sum(d.amount) FILTER (WHERE d."isOverdue" AND d.kind = 'CHEQUE_MATURING'), 0)         AS "overdueChequesAmount"
     FROM "Company"."getTodayDueItems" d
    WHERE d."tenantId" = u."tenantId"
      AND d.kind <> 'TASK_DUE'
 ) dd
 WHERE u.id = "Company"."getCurrentUserId"();

COMMENT ON VIEW "Company"."getTodayKpis" IS
  'Today''s Work KPI tiles for the signed-in user: tasks due / done today, daily progress %, overdue tasks and oldest overdue date, approvals awaiting the user (count, value, past SLA) from Company.getApprovalsInbox, and amounts / counts due today and overdue for invoices, bills and maturing cheques from Company.getTodayDueItems. Screen: app/today.';
