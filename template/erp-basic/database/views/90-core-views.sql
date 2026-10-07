-- =============================================================================
-- Finsoft ERP (BASIC) — views/90-core-views.sql
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
