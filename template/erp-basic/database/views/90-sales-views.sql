-- =============================================================================
-- Finsoft ERP (BASIC) — views/90-sales-views.sql
-- Report views for Sales & Receivables (entities/08-sales-receivables.md).
--
-- Install order: 00 → 09 schema → fk/* → 90-views (this file) → 91-rls.
-- Every view is  security_invoker = true,  so the caller's RLS policy
-- (tenantId = Company.getCurrentTenantId()) applies to every base table read.
-- Joins between tenant tables still match on tenantId (composite keys).
-- Helper functions are LANGUAGE sql STABLE SECURITY INVOKER (the default).
--
-- What counts (never DRAFT / VOID / CANCELLED):
--   invoice       status POSTED, PARTIALLY_PAID, PAID        (VOID never counts)
--   credit note   status OPEN, APPLIED                        (posted)
--   receipt       status UNALLOCATED, PARTLY_ALLOCATED, ALLOCATED
--                 (BOUNCED / VOID receipts settle nothing; the statement shows
--                  a bounced cheque as receipt + bounce reversal)
--   opening bal.  customer.openingBalance at openingBalanceAsOf, net of
--                 CustomerReceiptAllocations target OPENING_BALANCE
--
-- Customer balance identity (holds for every customer):
--   Σ v_open_items.openAmount
--     = openingBalance + Σ invoice.netAmount − Σ CreditNotes.totalAmount
--       + Σ CreditNotes.refundedAmount − Σ receipt.settledAmount
--     = closing balance of v_customer_statement
--
-- Views (dependency order)
--   Sales.getReceivableOpenItems                 app/receivables/receipts (allocation picker), base of the AR views
--   Sales.getReceivablesAgeing                  app/receivables/ageing (AR Ageing tab), app/receivables/reminders
--   Sales.getCustomerBalances           app/customers, app/customers/view, invoice entry screens
--   Sales.getCustomerCreditPosition   invoice entry credit check; app/wholesale/* (Full)
--   Sales.getCustomerCreditExposure            credit-limit watchlist (Full screen app/receivables/credit)
--   Sales.getCustomerStatement         app/customers/view (Statement tab), app/receivables/ageing (Statement tab)
--   Sales.getSalesRegister             app/receivables/ageing (Sales Register tab)
--   Sales.getSalesByCustomer          app/receivables/ageing (Sales by Customer), app/customers/view (trend)
--   Sales.getSalesByItem              app/receivables/ageing (Sales by Item)
-- Helper functions (as-of / date range)
--   Sales.getReceivableOpenItemsAsOf(asOf)                         open items as they stood on a date
--   Sales.getReceivablesAgeingAsOf(asOf, basis 'DUE'|'DOC')        ageing "As On" + "Ageing basis" filters
--   Sales.getCustomerStatementForPeriod(customer, from, to)    statement for a period with balance b/f
--   Sales.getSalesByCustomerForPeriod(from, to, branch)       totals + share % for a date range
--   Sales.getSalesByItemForPeriod(from, to, branch)           totals + avg rate + margin % for a date range
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Sales.getReceivableOpenItems — every open AR item, current state (trigger-maintained
-- settlement columns). Signed: debits (invoice, opening balance) positive,
-- credits (unused credit note, unallocated receipt = advance) negative.
-- Receipts & Allocation "Allocate to open invoices" grid (open credit notes
-- shown negative); base of v_ar_ageing / v_customer_balance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Sales"."getReceivableOpenItems"
WITH (security_invoker = true) AS
SELECT
  x."tenantId",
  x."customerId",
  cu.code                                   AS "customerCode",
  cu.name                                   AS "customerName",
  COALESCE(x."branchId", cu."branchId")       AS "branchId",
  x."itemType",                              -- INVOICE / OPENING_BALANCE / CREDIT_NOTE / RECEIPT
  x."docId",                                 -- NULL for OPENING_BALANCE
  x."docNo",
  x."docDate",
  x."dueDate",
  x.channel,                                -- invoices only
  x."originalAmount",
  x."settledAmount",
  x."openAmount",
  (current_date - x."dueDate")               AS "daysByDue",
  (current_date - x."docDate")               AS "daysByDoc",
  (x."openAmount" > 0 AND x."dueDate" < current_date) AS "isOverdue"
FROM (
  -- posted invoices with a balance
  SELECT i."tenantId", i."customerId", i."branchId",
         'INVOICE'::text                    AS "itemType",
         i.id                               AS "docId",
         i."docNo", i."docDate", i."dueDate", i.channel,
         i."netAmount"                       AS "originalAmount",
         i."paidAmount" + i."creditAppliedAmount" AS "settledAmount",
         i."balanceAmount"                   AS "openAmount"
    FROM "Sales"."SalesInvoices" i
   WHERE i.status IN ('POSTED','PARTIALLY_PAID')
     AND i."balanceAmount" <> 0
  UNION ALL
  -- opening balance net of its allocations
  SELECT cu."tenantId", cu.id, cu."branchId",
         'OPENING_BALANCE', NULL::uuid, 'OPENING',
         cu."openingBalanceAsOf", cu."openingBalanceAsOf", NULL::text,
         cu."openingBalance",
         COALESCE(ob.allocated, 0),
         cu."openingBalance" - COALESCE(ob.allocated, 0)
    FROM "Sales"."Customers" cu
    LEFT JOIN (SELECT a."tenantId", a."customerId", sum(a."allocatedAmount") AS allocated
                 FROM "Sales"."CustomerReceiptAllocations" a
                 JOIN "Sales"."CustomerReceipts" r ON r."tenantId" = a."tenantId" AND r.id = a."receiptId"
                WHERE a."targetType" = 'OPENING_BALANCE'
                  AND r.status NOT IN ('BOUNCED','VOID')
                GROUP BY a."tenantId", a."customerId") ob
           ON ob."tenantId" = cu."tenantId" AND ob."customerId" = cu.id
   WHERE cu."openingBalance" <> 0
     AND cu."openingBalance" - COALESCE(ob.allocated, 0) <> 0
  UNION ALL
  -- posted credit notes not yet used (customer credit)
  SELECT cn."tenantId", cn."customerId", cn."branchId",
         'CREDIT_NOTE', cn.id, cn."docNo", cn."docDate", cn."docDate", NULL::text,
         -cn."totalAmount",
         -(cn."appliedAmount" + cn."refundedAmount"),
         -cn."balanceAmount"
    FROM "Sales"."CreditNotes" cn
   WHERE cn.status IN ('OPEN','APPLIED')
     AND cn."balanceAmount" <> 0
  UNION ALL
  -- live receipts not fully allocated (customer advance)
  SELECT r."tenantId", r."customerId", r."branchId",
         'RECEIPT', r.id, r."docNo", r."docDate", r."docDate", NULL::text,
         -r."settledAmount",
         -r."allocatedAmount",
         -r."unallocatedAmount"
    FROM "Sales"."CustomerReceipts" r
   WHERE r.status NOT IN ('BOUNCED','VOID')
     AND r."unallocatedAmount" <> 0
) x
JOIN "Sales"."Customers" cu ON cu."tenantId" = x."tenantId" AND cu.id = x."customerId";

COMMENT ON VIEW "Sales"."getReceivableOpenItems" IS
  'Open AR items per customer (current state): posted invoices, opening balance net of allocations (debits, +), unused credit notes and unallocated receipts (credits, −). Screens: app/receivables/receipts (allocation grid), base of v_ar_ageing / v_customer_balance.';


-- ---------------------------------------------------------------------------
-- Sales.getReceivableOpenItemsAsOf(asOf) — the same items as they stood at the end of
-- pAsOf: documents dated ≤ asOf, allocations dated ≤ asOf, receipts that
-- bounced / were voided after asOf still count. Refunds of credit notes have
-- no date column, so refundedAmount is applied regardless of asOf.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."getReceivableOpenItemsAsOf"("pAsOf" date DEFAULT current_date)
RETURNS TABLE (
  "tenantId"        uuid,
  "customerId"      uuid,
  "customerCode"    text,
  "customerName"    text,
  "branchId"        uuid,
  "itemType"        text,
  "docId"           uuid,
  "docNo"           text,
  "docDate"         date,
  "dueDate"         date,
  channel          text,
  "originalAmount"  numeric,
  "settledAmount"   numeric,
  "openAmount"      numeric,
  "daysByDue"      integer,
  "daysByDoc"      integer,
  "isOverdue"       boolean)
LANGUAGE sql STABLE AS $$
  WITH rc AS (            -- receipts live on pAsOf
    SELECT r."tenantId", r.id, r."customerId", r."branchId", r."docNo", r."docDate", r."settledAmount"
      FROM "Sales"."CustomerReceipts" r
     WHERE r."docDate" <= "pAsOf"
       AND (   r.status NOT IN ('BOUNCED','VOID')
            OR (r.status = 'BOUNCED' AND r."bouncedAt"::date > "pAsOf")
            OR (r.status = 'VOID'    AND r."voidedAt"::date  > "pAsOf"))
  ), al AS (              -- their allocations made by pAsOf
    SELECT a."tenantId", a."receiptId", a."customerId", a."targetType", a."invoiceId",
           a."creditNoteId", a."allocatedAmount"
      FROM "Sales"."CustomerReceiptAllocations" a
      JOIN rc ON rc."tenantId" = a."tenantId" AND rc.id = a."receiptId"
     WHERE a."allocationDate" <= "pAsOf"
  ), cn AS (              -- posted credit notes dated by pAsOf
    SELECT c."tenantId", c.id, c."customerId", c."branchId", c."docNo", c."docDate", c."invoiceId",
           c.treatment, c.status, c."totalAmount", c."refundedAmount"
      FROM "Sales"."CreditNotes" c
     WHERE c.status IN ('OPEN','APPLIED')
       AND c."docDate" <= "pAsOf"
  ), x AS (
    SELECT i."tenantId", i."customerId", i."branchId",
           'INVOICE'::text AS "itemType", i.id AS "docId", i."docNo", i."docDate", i."dueDate", i.channel,
           i."netAmount" AS "originalAmount",
           COALESCE(pa.amt, 0) + COALESCE(ca.amt, 0) AS "settledAmount"
      FROM "Sales"."SalesInvoices" i
      LEFT JOIN (SELECT al."tenantId", al."invoiceId", sum(al."allocatedAmount") AS amt
                   FROM al WHERE al."targetType" = 'INVOICE'
                  GROUP BY al."tenantId", al."invoiceId") pa
             ON pa."tenantId" = i."tenantId" AND pa."invoiceId" = i.id
      LEFT JOIN (SELECT cn."tenantId", cn."invoiceId", sum(cn."totalAmount") AS amt
                   FROM cn
                  WHERE cn.treatment = 'APPLY_TO_INVOICE' AND cn.status = 'APPLIED' AND cn."invoiceId" IS NOT NULL
                  GROUP BY cn."tenantId", cn."invoiceId") ca
             ON ca."tenantId" = i."tenantId" AND ca."invoiceId" = i.id
     WHERE i.status IN ('POSTED','PARTIALLY_PAID','PAID')
       AND i."docDate" <= "pAsOf"
    UNION ALL
    SELECT cu."tenantId", cu.id, cu."branchId",
           'OPENING_BALANCE', NULL::uuid, 'OPENING', cu."openingBalanceAsOf", cu."openingBalanceAsOf", NULL::text,
           cu."openingBalance",
           COALESCE(ob.amt, 0)
      FROM "Sales"."Customers" cu
      LEFT JOIN (SELECT al."tenantId", al."customerId", sum(al."allocatedAmount") AS amt
                   FROM al WHERE al."targetType" = 'OPENING_BALANCE'
                  GROUP BY al."tenantId", al."customerId") ob
             ON ob."tenantId" = cu."tenantId" AND ob."customerId" = cu.id
     WHERE cu."openingBalance" <> 0
       AND cu."openingBalanceAsOf" <= "pAsOf"
    UNION ALL
    SELECT c."tenantId", c."customerId", c."branchId",
           'CREDIT_NOTE', c.id, c."docNo", c."docDate", c."docDate", NULL::text,
           -c."totalAmount",
           -LEAST(c."totalAmount",
                  c."refundedAmount"
                  + CASE WHEN c.treatment = 'APPLY_TO_INVOICE' AND c.status = 'APPLIED' THEN c."totalAmount" ELSE 0 END
                  + COALESCE(ua.amt, 0))
      FROM cn c
      LEFT JOIN (SELECT al."tenantId", al."creditNoteId", sum(al."allocatedAmount") AS amt
                   FROM al WHERE al."targetType" = 'CREDIT_NOTE'
                  GROUP BY al."tenantId", al."creditNoteId") ua
             ON ua."tenantId" = c."tenantId" AND ua."creditNoteId" = c.id
    UNION ALL
    SELECT r."tenantId", r."customerId", r."branchId",
           'RECEIPT', r.id, r."docNo", r."docDate", r."docDate", NULL::text,
           -r."settledAmount",
           -COALESCE(ra.amt, 0)
      FROM rc r
      LEFT JOIN (SELECT al."tenantId", al."receiptId",
                        sum(CASE WHEN al."targetType" = 'CREDIT_NOTE' THEN -al."allocatedAmount"
                                 ELSE al."allocatedAmount" END) AS amt
                   FROM al GROUP BY al."tenantId", al."receiptId") ra
             ON ra."tenantId" = r."tenantId" AND ra."receiptId" = r.id
  )
  SELECT x."tenantId", x."customerId", cu.code, cu.name,
         COALESCE(x."branchId", cu."branchId"),
         x."itemType", x."docId", x."docNo", x."docDate", x."dueDate", x.channel,
         x."originalAmount", x."settledAmount",
         x."originalAmount" - x."settledAmount",
         "pAsOf" - x."dueDate",
         "pAsOf" - x."docDate",
         (x."originalAmount" - x."settledAmount" > 0 AND x."dueDate" < "pAsOf")
    FROM x
    JOIN "Sales"."Customers" cu ON cu."tenantId" = x."tenantId" AND cu.id = x."customerId"
   WHERE x."originalAmount" - x."settledAmount" <> 0
$$;

COMMENT ON FUNCTION "Sales"."getReceivableOpenItemsAsOf"(date) IS
  'Open AR items as at the end of pAsOf (historical version of Sales.getReceivableOpenItems). Feeds Sales.getReceivablesAgeingAsOf.';


-- ---------------------------------------------------------------------------
-- Sales.getReceivablesAgeing — AR Ageing tab: one row per customer × branch, buckets
-- by DUE date as of today (Current = not yet due). The "As On" date and the
-- "By invoice date" basis use Sales.getReceivablesAgeingAsOf(asOf, basis).
-- daysByDue / daysByDoc = age of the oldest open debit item.
-- Credits (unused credit notes, advances) sit in the bucket of their own date.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Sales"."getReceivablesAgeing"
WITH (security_invoker = true) AS
SELECT
  o."tenantId",
  o."customerId",
  o."customerCode",
  o."customerName",
  o."branchId",
  b.code                                   AS "branchCode",
  b.name                                   AS "branchName",
  cu."paymentTerms",
  cu."creditDays",
  cu."salesRepUserId",
  current_date                             AS "asOf",
  max(o."daysByDue") FILTER (WHERE o."openAmount" > 0)                         AS "daysByDue",
  max(o."daysByDoc") FILTER (WHERE o."openAmount" > 0)                         AS "daysByDoc",
  COALESCE(sum(o."openAmount") FILTER (WHERE o."daysByDue" <= 0), 0)            AS "bucketCurrent",
  COALESCE(sum(o."openAmount") FILTER (WHERE o."daysByDue" BETWEEN 1 AND 30), 0)  AS bucket130,
  COALESCE(sum(o."openAmount") FILTER (WHERE o."daysByDue" BETWEEN 31 AND 60), 0) AS bucket3160,
  COALESCE(sum(o."openAmount") FILTER (WHERE o."daysByDue" BETWEEN 61 AND 90), 0) AS bucket6190,
  COALESCE(sum(o."openAmount") FILTER (WHERE o."daysByDue" > 90), 0)            AS "bucket90Plus",
  sum(o."openAmount")                                                         AS total,
  count(*) FILTER (WHERE o."itemType" = 'INVOICE')                            AS "openInvoices"
FROM "Sales"."getReceivableOpenItems" o
JOIN "Sales"."Customers" cu ON cu."tenantId" = o."tenantId" AND cu.id = o."customerId"
LEFT JOIN "Company"."Branches" b ON b."tenantId" = o."tenantId" AND b.id = o."branchId"
GROUP BY o."tenantId", o."customerId", o."customerCode", o."customerName", o."branchId", b.code, b.name,
         cu."paymentTerms", cu."creditDays", cu."salesRepUserId";

COMMENT ON VIEW "Sales"."getReceivablesAgeing" IS
  'AR ageing per customer × branch as of today, by due date (Current / 1–30 / 31–60 / 61–90 / 90+ / Total), incl. opening balance net of allocations and unapplied credits. Screens: app/receivables/ageing (AR Ageing tab), app/receivables/reminders (KPI). As-on date / invoice-date basis: Sales.getReceivablesAgeingAsOf.';


-- Sales.getReceivablesAgeingAsOf(asOf, basis) — same columns as v_ar_ageing for any
-- "As On" date; pBasis 'DUE' (by due date) or 'DOC' (by invoice date).
CREATE OR REPLACE FUNCTION "Sales"."getReceivablesAgeingAsOf"("pAsOf" date DEFAULT current_date, "pBasis" text DEFAULT 'DUE')
RETURNS TABLE (
  "tenantId"          uuid,
  "customerId"        uuid,
  "customerCode"      text,
  "customerName"      text,
  "branchId"          uuid,
  "branchCode"        text,
  "branchName"        text,
  "paymentTerms"      text,
  "creditDays"        integer,
  "salesRepUserId"  uuid,
  "asOf"              date,
  "daysByDue"        integer,
  "daysByDoc"        integer,
  "bucketCurrent"     numeric,
  bucket130        numeric,
  bucket3160       numeric,
  bucket6190       numeric,
  "bucket90Plus"     numeric,
  total              numeric,
  "openInvoices"      bigint,
  basis              text)
LANGUAGE sql STABLE AS $$
  SELECT o."tenantId", o."customerId", o."customerCode", o."customerName", o."branchId",
         b.code, b.name, cu."paymentTerms", cu."creditDays", cu."salesRepUserId",
         "pAsOf",
         max(o."daysByDue") FILTER (WHERE o."openAmount" > 0),
         max(o."daysByDoc") FILTER (WHERE o."openAmount" > 0),
         COALESCE(sum(o."openAmount") FILTER (WHERE d.days <= 0), 0),
         COALESCE(sum(o."openAmount") FILTER (WHERE d.days BETWEEN 1 AND 30), 0),
         COALESCE(sum(o."openAmount") FILTER (WHERE d.days BETWEEN 31 AND 60), 0),
         COALESCE(sum(o."openAmount") FILTER (WHERE d.days BETWEEN 61 AND 90), 0),
         COALESCE(sum(o."openAmount") FILTER (WHERE d.days > 90), 0),
         sum(o."openAmount"),
         count(*) FILTER (WHERE o."itemType" = 'INVOICE'),
         CASE WHEN upper("pBasis") = 'DOC' THEN 'DOC' ELSE 'DUE' END
    FROM "Sales"."getReceivableOpenItemsAsOf"("pAsOf") o
    CROSS JOIN LATERAL (SELECT CASE WHEN upper("pBasis") = 'DOC' THEN o."daysByDoc" ELSE o."daysByDue" END AS days) d
    JOIN "Sales"."Customers" cu ON cu."tenantId" = o."tenantId" AND cu.id = o."customerId"
    LEFT JOIN "Company"."Branches" b ON b."tenantId" = o."tenantId" AND b.id = o."branchId"
   GROUP BY o."tenantId", o."customerId", o."customerCode", o."customerName", o."branchId", b.code, b.name,
            cu."paymentTerms", cu."creditDays", cu."salesRepUserId"
$$;

COMMENT ON FUNCTION "Sales"."getReceivablesAgeingAsOf"(date, text) IS
  'AR ageing as on pAsOf; pBasis DUE = by due date, DOC = by invoice date. Screen: app/receivables/ageing filters "As On" and "Ageing basis".';


-- ---------------------------------------------------------------------------
-- Sales.getCustomerBalances — one row per customer: balance, open invoices,
-- overdue, utilisation, available credit, avg days to pay, display badge.
-- display_status: stored status when not ACTIVE (ON_HOLD / DISPUTED /
-- INACTIVE); else NEAR_LIMIT (utilisation ≥ 90 %), else OVERDUE (any overdue
-- debit), else ACTIVE. NEAR_LIMIT wins over OVERDUE (customer detail shows
-- "Near credit limit" for a 91 % customer with overdue invoices).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Sales"."getCustomerBalances"
WITH (security_invoker = true) AS
SELECT
  c."tenantId",
  c.id                                      AS "customerId",
  c.code                                    AS "customerCode",
  c.name                                    AS "customerName",
  c."displayName",
  c."customerGroupId",
  c."salesRepUserId",
  c."branchId",
  c.city,
  c.status,
  c."holdReason",
  c."paymentTerms",
  c."creditDays",
  c."creditLimit",
  c."blockOverLimit",
  c."deletedAt",
  COALESCE(oi.balance, 0)                   AS balance,
  COALESCE(oi."openInvoices", 0)             AS "openInvoices",
  COALESCE(oi."openInvoiceAmount", 0)       AS "openInvoiceAmount",
  COALESCE(oi."unappliedCredit", 0)          AS "unappliedCredit",
  COALESCE(oi."overdueAmount", 0)            AS "overdueAmount",
  COALESCE(oi."overdueItems", 0)             AS "overdueItems",
  od."docId"                                 AS "oldestOverdueDocId",
  od."docNo"                                 AS "oldestOverdueDocNo",
  od."dueDate"                               AS "oldestOverdueDueDate",
  COALESCE(oi."maxDaysOverdue", 0)          AS "maxDaysOverdue",
  u."utilisationPct",
  GREATEST(c."creditLimit" - COALESCE(oi.balance, 0), 0) AS "availableCredit",
  pay."avgDaysToPay",
  CASE WHEN c.status <> 'ACTIVE'                 THEN c.status
       WHEN u."utilisationPct" >= 90              THEN 'NEAR_LIMIT'
       WHEN COALESCE(oi."overdueAmount", 0) > 0   THEN 'OVERDUE'
       ELSE 'ACTIVE' END                    AS "displayStatus"
FROM "Sales"."Customers" c
LEFT JOIN (
  SELECT o."tenantId", o."customerId",
         sum(o."openAmount")                                                     AS balance,
         count(*) FILTER (WHERE o."itemType" = 'INVOICE' AND o."openAmount" > 0)  AS "openInvoices",
         sum(o."openAmount") FILTER (WHERE o."itemType" = 'INVOICE')              AS "openInvoiceAmount",
         -sum(o."openAmount") FILTER (WHERE o."openAmount" < 0)                   AS "unappliedCredit",
         sum(o."openAmount") FILTER (WHERE o."isOverdue")                         AS "overdueAmount",
         count(*) FILTER (WHERE o."isOverdue")                                   AS "overdueItems",
         max(o."daysByDue") FILTER (WHERE o."isOverdue")                         AS "maxDaysOverdue"
    FROM "Sales"."getReceivableOpenItems" o
   GROUP BY o."tenantId", o."customerId"
) oi ON oi."tenantId" = c."tenantId" AND oi."customerId" = c.id
LEFT JOIN (
  SELECT DISTINCT ON (o."tenantId", o."customerId")
         o."tenantId", o."customerId", o."docId", o."docNo", o."dueDate"
    FROM "Sales"."getReceivableOpenItems" o
   WHERE o."isOverdue"
   ORDER BY o."tenantId", o."customerId", o."dueDate", o."docDate", o."docNo"
) od ON od."tenantId" = c."tenantId" AND od."customerId" = c.id
LEFT JOIN (
  -- allocation date − invoice date, weighted by amount (live receipts only)
  SELECT a."tenantId", a."customerId",
         round(sum(a."allocatedAmount" * GREATEST(a."allocationDate" - i."docDate", 0))
               / NULLIF(sum(a."allocatedAmount"), 0), 1)                         AS "avgDaysToPay"
    FROM "Sales"."CustomerReceiptAllocations" a
    JOIN "Sales"."CustomerReceipts" r ON r."tenantId" = a."tenantId" AND r.id = a."receiptId"
    JOIN "Sales"."SalesInvoices" i ON i."tenantId" = a."tenantId" AND i.id = a."invoiceId"
   WHERE a."targetType" = 'INVOICE'
     AND r.status NOT IN ('BOUNCED','VOID')
     AND i.status IN ('POSTED','PARTIALLY_PAID','PAID')
   GROUP BY a."tenantId", a."customerId"
) pay ON pay."tenantId" = c."tenantId" AND pay."customerId" = c.id
CROSS JOIN LATERAL (
  SELECT CASE WHEN c."creditLimit" > 0
              THEN round(GREATEST(COALESCE(oi.balance, 0), 0) * 100 / c."creditLimit", 2) END AS "utilisationPct"
) u;

COMMENT ON VIEW "Sales"."getCustomerBalances" IS
  'Customer AR position: balance, open invoices, overdue (amount, oldest doc, max days), utilisation %, available credit, avg days to pay, display_status (ACTIVE / NEAR_LIMIT ≥ 90 % / OVERDUE / ON_HOLD / DISPUTED / INACTIVE). Screens: app/customers (KPIs, list), app/customers/view (badges, KPIs), app/sales/invoices/new, app/sales/voucher.';


-- ---------------------------------------------------------------------------
-- Sales.getCustomerCreditPosition — compact credit check for document entry.
-- available = effective_limit − balance (signed: negative = over limit by).
-- credit_status: OVER_LIMIT (balance > limit), NEAR_LIMIT (> 80 % used, the
-- wholesale entry threshold), OK. Basic has no temporary limits, so
-- effective_limit = creditLimit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Sales"."getCustomerCreditPosition"
WITH (security_invoker = true) AS
SELECT
  b."tenantId",
  b."customerId",
  b."customerCode",
  b."customerName",
  b.status,
  b."holdReason",
  b."blockOverLimit",
  b."creditDays",
  b."creditLimit",
  b."creditLimit"                             AS "effectiveLimit",
  b.balance,
  b."creditLimit" - b.balance                 AS available,
  b."overdueAmount",
  b."maxDaysOverdue"                         AS "oldestOverdueDays",
  b."utilisationPct",
  CASE WHEN b.balance > b."creditLimit"       THEN 'OVER_LIMIT'
       WHEN b."utilisationPct" > 80           THEN 'NEAR_LIMIT'
       ELSE 'OK' END                         AS "creditStatus"
FROM "Sales"."getCustomerBalances" b;

COMMENT ON VIEW "Sales"."getCustomerCreditPosition" IS
  'Credit check per customer: creditLimit, effective_limit, balance, available (signed), overdue, oldest_overdue_days, credit_status OK / NEAR_LIMIT (> 80 %) / OVER_LIMIT. Screens: app/sales/invoices/new, app/sales/voucher credit warning.';


-- ---------------------------------------------------------------------------
-- Sales.getCustomerCreditExposure — exposure = balance + uninvoiced open sales orders
-- + DRAFT (incl. held) invoices. Uninvoiced share of an order line =
-- totalAmount × (1 − invoicedQty ÷ (baseQty + bonusQty)).
-- watch_status: HOLD_BOUNCED_CHEQUE / HOLD_AUTO (OVER_LIMIT, OVERDUE) /
-- HOLD_MANUAL when ON_HOLD; WATCH when over limit incl. drafts, ≥ 90 %
-- used or overdue; else GOOD.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Sales"."getCustomerCreditExposure"
WITH (security_invoker = true) AS
SELECT
  b."tenantId",
  b."customerId",
  b."customerCode",
  b."customerName",
  b."salesRepUserId",
  au."fullName"                               AS "salesRepName",
  b."branchId",
  b.status,
  b."holdReason",
  cu."onHoldSince",
  b."blockOverLimit",
  b."creditLimit",
  b."creditLimit"                             AS "effectiveLimit",
  b.balance,
  b."overdueAmount",
  b."maxDaysOverdue",
  e."openOrdersAmount",
  e."draftInvoicesAmount",
  e."openOrdersAmount" + e."draftInvoicesAmount"               AS "openOrdersAndDrafts",
  b.balance + e."openOrdersAmount" + e."draftInvoicesAmount"   AS exposure,
  CASE WHEN b."creditLimit" > 0
       THEN round(GREATEST(b.balance + e."openOrdersAmount" + e."draftInvoicesAmount", 0) * 100 / b."creditLimit", 2)
  END                                        AS "utilisationPct",
  (b.balance > b."creditLimit")               AS "overLimitActual",
  (b.balance + e."openOrdersAmount" + e."draftInvoicesAmount" > b."creditLimit") AS "overLimitWithDrafts",
  GREATEST(b.balance + e."openOrdersAmount" + e."draftInvoicesAmount" - b."creditLimit", 0) AS "overLimitAmount",
  CASE WHEN b.status = 'ON_HOLD' AND b."holdReason" = 'BOUNCED_CHEQUE'        THEN 'HOLD_BOUNCED_CHEQUE'
       WHEN b.status = 'ON_HOLD' AND b."holdReason" IN ('OVER_LIMIT','OVERDUE') THEN 'HOLD_AUTO'
       WHEN b.status = 'ON_HOLD'                                             THEN 'HOLD_MANUAL'
       WHEN b.balance + e."openOrdersAmount" + e."draftInvoicesAmount" > b."creditLimit"
         OR (b."creditLimit" > 0 AND b.balance * 100 >= 90 * b."creditLimit")
         OR b."overdueAmount" > 0                                              THEN 'WATCH'
       ELSE 'GOOD' END                       AS "watchStatus"
FROM "Sales"."getCustomerBalances" b
JOIN "Sales"."Customers" cu ON cu."tenantId" = b."tenantId" AND cu.id = b."customerId"
LEFT JOIN "Company"."Users" au ON au."tenantId" = b."tenantId" AND au.id = b."salesRepUserId"
CROSS JOIN LATERAL (
  SELECT
    COALESCE((SELECT sum(round(sl."totalAmount"
                               * GREATEST(1 - sl."invoicedQty" / (sl."baseQty" + sl."bonusQty"), 0), 2))
                FROM "Sales"."SalesOrders" so
                JOIN "Sales"."SalesOrderLines" sl ON sl."tenantId" = so."tenantId" AND sl."salesOrderId" = so.id
               WHERE so."tenantId" = b."tenantId" AND so."customerId" = b."customerId"
                 AND so.status IN ('CONFIRMED','PARTIALLY_DELIVERED','TO_INVOICE','ON_HOLD')), 0) AS "openOrdersAmount",
    COALESCE((SELECT sum(i."netAmount")
                FROM "Sales"."SalesInvoices" i
               WHERE i."tenantId" = b."tenantId" AND i."customerId" = b."customerId"
                 AND i.status = 'DRAFT'), 0)                                                     AS "draftInvoicesAmount"
) e;

COMMENT ON VIEW "Sales"."getCustomerCreditExposure" IS
  'Credit exposure per customer: limit, effective_limit, balance, open orders + draft invoices, exposure, utilisation %, overdue, over_limit_actual / over_limit_with_drafts, watch_status. Screens: app/receivables/credit (Full: exposure watchlist + KPIs); credit checks on order / invoice entry.';


-- ---------------------------------------------------------------------------
-- Sales.getCustomerStatement — every AR movement of a customer with a running
-- balance (Dr +, Cr −): OPENING, INVOICE, CREDIT_NOTE, REFUND (credit-note
-- refund; dated at the credit note: no refund date is stored), RECEIPT (cash
-- + WHT + bank charges), CHEQUE_BOUNCED (reversal of a bounced receipt on the
-- bounce date). VOID receipts / invoices never appear.
-- A period statement with "balance b/f" = Sales.getCustomerStatementForPeriod.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Sales"."getCustomerStatement"
WITH (security_invoker = true) AS
SELECT
  e."tenantId",
  e."customerId",
  e."branchId",
  e."entryDate",
  e."sortKey",
  e."entryType",
  e."docId",
  e."docNo",
  e.narration,
  e.debit,
  e.credit,
  sum(e.debit - e.credit) OVER (PARTITION BY e."tenantId", e."customerId"
                                ORDER BY e."entryDate", e."sortKey", e."docNo", e."docId"
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance,
  row_number() OVER (PARTITION BY e."tenantId", e."customerId"
                     ORDER BY e."entryDate", e."sortKey", e."docNo", e."docId")       AS "lineNo"
FROM (
  SELECT cu."tenantId", cu.id AS "customerId", cu."branchId",
         cu."openingBalanceAsOf" AS "entryDate", 0 AS "sortKey", 'OPENING'::text AS "entryType",
         NULL::uuid AS "docId", 'OPENING'::text AS "docNo", 'Opening balance'::text AS narration,
         GREATEST(cu."openingBalance", 0)  AS debit,
         GREATEST(-cu."openingBalance", 0) AS credit
    FROM "Sales"."Customers" cu
   WHERE cu."openingBalance" <> 0
  UNION ALL
  SELECT i."tenantId", i."customerId", i."branchId",
         i."docDate", 1, 'INVOICE', i.id, i."docNo",
         concat_ws(' · ',
                   CASE i.channel WHEN 'COUNTER' THEN 'Sales voucher' ELSE 'Sales invoice' END,
                   'due ' || to_char(i."dueDate", 'DD Mon YYYY'),
                   NULLIF(i."customerPoNo", '')),
         i."netAmount", 0
    FROM "Sales"."SalesInvoices" i
   WHERE i.status IN ('POSTED','PARTIALLY_PAID','PAID')
  UNION ALL
  SELECT cn."tenantId", cn."customerId", cn."branchId",
         cn."docDate", 2, 'CREDIT_NOTE', cn.id, cn."docNo",
         concat_ws(' · ', 'Credit note', initcap(replace(cn.reason, '_', ' ')),
                   'vs ' || "Inventory"."docNo", NULLIF(cn."reasonNote", '')),
         0, cn."totalAmount"
    FROM "Sales"."CreditNotes" cn
    LEFT JOIN "Sales"."SalesInvoices" inv ON "Inventory"."tenantId" = cn."tenantId" AND "Inventory".id = cn."invoiceId"
   WHERE cn.status IN ('OPEN','APPLIED')
  UNION ALL
  SELECT cn."tenantId", cn."customerId", cn."branchId",
         cn."docDate", 3, 'REFUND', cn.id, cn."docNo",
         concat_ws(' · ', 'Refund of credit note', NULLIF(cn."refundReference", '')),
         cn."refundedAmount", 0
    FROM "Sales"."CreditNotes" cn
   WHERE cn.status IN ('OPEN','APPLIED')
     AND cn."refundedAmount" > 0
  UNION ALL
  SELECT r."tenantId", r."customerId", r."branchId",
         r."docDate", 4, 'RECEIPT', r.id, r."docNo",
         concat_ws(' · ', 'Receipt — ' || r.method, NULLIF(r.reference, ''),
                   CASE WHEN r."whtAmount" > 0 THEN 'WHT ' || to_char(r."whtAmount", 'FM999,999,999,990.00') END,
                   CASE WHEN r."bankCharges" > 0 THEN 'bank charges ' || to_char(r."bankCharges", 'FM999,999,999,990.00') END),
         0, r."settledAmount"
    FROM "Sales"."CustomerReceipts" r
   WHERE r.status <> 'VOID'
  UNION ALL
  SELECT r."tenantId", r."customerId", r."branchId",
         COALESCE(r."bouncedAt"::date, r."docDate"), 5, 'CHEQUE_BOUNCED', r.id, r."docNo",
         concat_ws(' · ', 'Cheque bounced', NULLIF(r."bounceReason", '')),
         r."settledAmount", 0
    FROM "Sales"."CustomerReceipts" r
   WHERE r.status = 'BOUNCED'
) e;

COMMENT ON VIEW "Sales"."getCustomerStatement" IS
  'Customer statement lines (Date / Type / Document / Narration / Debit / Credit / running Balance) from the opening balance onward. Screens: app/customers/view (Statement tab, Email statement), app/receivables/ageing (Customer Statement tab). Period with balance b/f: Sales.getCustomerStatementForPeriod.';


-- Sales.getCustomerStatementForPeriod — one customer, one period: a BALANCE_BF line
-- (all movements before pFrom) then the period lines with running balance;
-- the last balance is the closing balance.
CREATE OR REPLACE FUNCTION "Sales"."getCustomerStatementForPeriod"("pCustomerId" uuid, "pFrom" date, "pTo" date)
RETURNS TABLE (
  "entryDate"  date,
  "entryType"  text,
  "docId"      uuid,
  "docNo"      text,
  narration   text,
  debit       numeric,
  credit      numeric,
  balance     numeric)
LANGUAGE sql STABLE AS $$
  SELECT e."entryDate", e."entryType", e."docId", e."docNo", e.narration, e.debit, e.credit,
         sum(e.debit - e.credit) OVER (ORDER BY e.ord, e."entryDate", e."sortKey", e."docNo", e."docId"
                                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    FROM (
      SELECT 0 AS ord, "pFrom" AS "entryDate", -1 AS "sortKey", 'BALANCE_BF'::text AS "entryType",
             NULL::uuid AS "docId", NULL::text AS "docNo", 'Balance brought forward'::text AS narration,
             GREATEST(bf.amt, 0) AS debit, GREATEST(-bf.amt, 0) AS credit
        FROM (SELECT COALESCE(sum(s.debit - s.credit), 0) AS amt
                FROM "Sales"."getCustomerStatement" s
               WHERE s."customerId" = "pCustomerId" AND s."entryDate" < "pFrom") bf
      UNION ALL
      SELECT 1, s."entryDate", s."sortKey", s."entryType", s."docId", s."docNo", s.narration, s.debit, s.credit
        FROM "Sales"."getCustomerStatement" s
       WHERE s."customerId" = "pCustomerId"
         AND s."entryDate" BETWEEN "pFrom" AND "pTo"
    ) e
   ORDER BY e.ord, e."entryDate", e."sortKey", e."docNo", e."docId"
$$;

COMMENT ON FUNCTION "Sales"."getCustomerStatementForPeriod"(uuid, date, date) IS
  'Customer statement for a period: balance brought forward + period lines with running balance. Screens: app/customers/view (Statement tab period select), app/receivables/ageing (Customer Statement tab).';


-- ---------------------------------------------------------------------------
-- Sales.getSalesRegister — posted invoices (+) and posted credit notes (−),
-- one row per document. taxableAmount = "Net", taxAmount = "GST",
-- netAmount = "Total". other_tax_amount = advance tax + FBR POS fee.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Sales"."getSalesRegister"
WITH (security_invoker = true) AS
SELECT
  i."tenantId",
  'INVOICE'::text                          AS "docType",
  i.id                                     AS "docId",
  i."docNo",
  i."docDate",
  i.channel,
  i."taxInvoiceNo",
  i."customerId",
  cu.code                                  AS "customerCode",
  cu.name                                  AS "customerName",
  i."buyerNtn",
  i."buyerStrn",
  i."branchId",
  i."warehouseId",
  i."salesRepUserId",
  i."salesmanName",
  NULL::uuid                               AS "againstInvoiceId",
  NULL::text                               AS "againstInvoiceNo",
  NULL::text                               AS reason,
  i."grossAmount",
  i."discountAmount",
  i."taxableAmount",
  i."taxAmount",
  i."furtherTaxAmount",
  i."advanceTaxAmount" + i."fbrServiceFee" AS "otherTaxAmount",
  i."netAmount",
  i."costAmount",
  i."taxableAmount" - i."costAmount"         AS "grossMargin",
  i.status,
  i."postedAt"
FROM "Sales"."SalesInvoices" i
JOIN "Sales"."Customers" cu ON cu."tenantId" = i."tenantId" AND cu.id = i."customerId"
WHERE i.status IN ('POSTED','PARTIALLY_PAID','PAID')
UNION ALL
SELECT
  cn."tenantId",
  'CREDIT_NOTE',
  cn.id,
  cn."docNo",
  cn."docDate",
  "Inventory".channel,
  NULL::text,
  cn."customerId",
  cu.code,
  cu.name,
  cu.ntn,
  cu.strn,
  COALESCE(cn."branchId", "Inventory"."branchId", cu."branchId"),
  cn."returnWarehouseId",
  COALESCE("Inventory"."salesRepUserId", cu."salesRepUserId"),
  "Inventory"."salesmanName",
  cn."invoiceId",
  "Inventory"."docNo",
  cn.reason,
  -cn."valueAmount",
  0::numeric,
  -cn."valueAmount",
  -cn."taxAmount",
  -cn."furtherTaxAmount",
  0::numeric,
  -cn."totalAmount",
  -cn."costAmount",
  -(cn."valueAmount" - cn."costAmount"),
  cn.status,
  cn."postedAt"
FROM "Sales"."CreditNotes" cn
JOIN "Sales"."Customers" cu ON cu."tenantId" = cn."tenantId" AND cu.id = cn."customerId"
LEFT JOIN "Sales"."SalesInvoices" inv ON "Inventory"."tenantId" = cn."tenantId" AND "Inventory".id = cn."invoiceId"
WHERE cn.status IN ('OPEN','APPLIED');

COMMENT ON VIEW "Sales"."getSalesRegister" IS
  'Sales register: posted invoices (all channels) and posted credit notes as negatives; Net (taxableAmount) / GST (taxAmount) / Total (netAmount), cost and margin. Screens: app/receivables/ageing (Sales Register tab).';


-- ---------------------------------------------------------------------------
-- Sales.getSalesByCustomer — customer × branch × day (sale_date), with
-- periodMonth and fy_label for monthly / FY roll-ups.
--   netSales = invoice taxable value − credit-note value     ("Net Sales")
--   gstAmount = sales tax + further tax (net of credit notes)  ("GST")
--   grossAmount = document totals incl. all taxes             ("Gross")
--   collectedAmount = Σ receipt.amountReceived (live receipts)
-- Share % for a range: Sales.getSalesByCustomerForPeriod.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Sales"."getSalesByCustomer"
WITH (security_invoker = true) AS
SELECT
  d."tenantId",
  d."customerId",
  cu.code                                         AS "customerCode",
  cu.name                                         AS "customerName",
  d."branchId",
  d."saleDate",
  date_trunc('month', d."saleDate")::date          AS "periodMonth",
  "Company"."getFiscalYearLabel"(d."saleDate")                      AS "fyLabel",
  sum(d."invoiceCount")::bigint                    AS "invoiceCount",
  sum(d."creditNoteCount")::bigint                AS "creditNoteCount",
  sum(d."salesValue")                              AS "salesValue",
  sum(d."returnsValue")                            AS "returnsValue",
  sum(d."netSales")                                AS "netSales",
  sum(d."gstAmount")                               AS "gstAmount",
  sum(d."otherTaxAmount")                         AS "otherTaxAmount",
  sum(d."grossAmount")                             AS "grossAmount",
  sum(d."costAmount")                              AS "costAmount",
  sum(d."netSales") - sum(d."costAmount")           AS "grossMargin",
  sum(d."collectedAmount")                         AS "collectedAmount"
FROM (
  SELECT r."tenantId", r."customerId", r."branchId", r."docDate" AS "saleDate",
         count(*) FILTER (WHERE r."docType" = 'INVOICE')                         AS "invoiceCount",
         count(*) FILTER (WHERE r."docType" = 'CREDIT_NOTE')                     AS "creditNoteCount",
         COALESCE(sum(r."taxableAmount") FILTER (WHERE r."docType" = 'INVOICE'), 0)      AS "salesValue",
         COALESCE(-sum(r."taxableAmount") FILTER (WHERE r."docType" = 'CREDIT_NOTE'), 0) AS "returnsValue",
         sum(r."taxableAmount")                                                 AS "netSales",
         sum(r."taxAmount" + r."furtherTaxAmount")                              AS "gstAmount",
         sum(r."otherTaxAmount")                                               AS "otherTaxAmount",
         sum(r."netAmount")                                                     AS "grossAmount",
         sum(r."costAmount")                                                    AS "costAmount",
         0::numeric                                                            AS "collectedAmount"
    FROM "Sales"."getSalesRegister" r
   GROUP BY r."tenantId", r."customerId", r."branchId", r."docDate"
  UNION ALL
  SELECT rc."tenantId", rc."customerId", COALESCE(rc."branchId", cu2."branchId"), rc."docDate",
         0, 0, 0, 0, 0, 0, 0, 0, 0,
         sum(rc."amountReceived")
    FROM "Sales"."CustomerReceipts" rc
    JOIN "Sales"."Customers" cu2 ON cu2."tenantId" = rc."tenantId" AND cu2.id = rc."customerId"
   WHERE rc.status NOT IN ('BOUNCED','VOID')
   GROUP BY rc."tenantId", rc."customerId", COALESCE(rc."branchId", cu2."branchId"), rc."docDate"
) d
JOIN "Sales"."Customers" cu ON cu."tenantId" = d."tenantId" AND cu.id = d."customerId"
GROUP BY d."tenantId", d."customerId", cu.code, cu.name, d."branchId", d."saleDate";

COMMENT ON VIEW "Sales"."getSalesByCustomer" IS
  'Sales by customer per day (periodMonth, fy_label for roll-ups): invoices, credit notes, net sales, GST, gross, cost, margin, collected. Screens: app/receivables/ageing (Sales by Customer tab), app/customers/view (sales trend, Sales YTD / Collected YTD). Range totals + share: Sales.getSalesByCustomerForPeriod.';


-- Sales.getSalesByCustomerForPeriod — "Customer / Invoices / Net Sales / GST / Gross / Share" for a range.
CREATE OR REPLACE FUNCTION "Sales"."getSalesByCustomerForPeriod"("pFrom" date, "pTo" date, "pBranchId" uuid DEFAULT NULL)
RETURNS TABLE (
  "customerId"        uuid,
  "customerCode"      text,
  "customerName"      text,
  "invoiceCount"      bigint,
  "creditNoteCount"  bigint,
  "netSales"          numeric,
  "gstAmount"         numeric,
  "grossAmount"       numeric,
  "costAmount"        numeric,
  "grossMargin"       numeric,
  "collectedAmount"   numeric,
  "sharePct"          numeric)
LANGUAGE sql STABLE AS $$
  SELECT v."customerId", v."customerCode", v."customerName",
         sum(v."invoiceCount")::bigint, sum(v."creditNoteCount")::bigint,
         sum(v."netSales"), sum(v."gstAmount"), sum(v."grossAmount"), sum(v."costAmount"),
         sum(v."grossMargin"), sum(v."collectedAmount"),
         round(100 * sum(v."netSales") / NULLIF(sum(sum(v."netSales")) OVER (), 0), 2)
    FROM "Sales"."getSalesByCustomer" v
   WHERE v."saleDate" BETWEEN "pFrom" AND "pTo"
     AND ("pBranchId" IS NULL OR v."branchId" = "pBranchId")
   GROUP BY v."customerId", v."customerCode", v."customerName"
$$;

COMMENT ON FUNCTION "Sales"."getSalesByCustomerForPeriod"(date, date, uuid) IS
  'Sales by customer for a date range with share % of net sales. Screen: app/receivables/ageing (Sales by Customer tab).';


-- ---------------------------------------------------------------------------
-- Sales.getSalesByItem — item × branch × day from posted invoice lines (+)
-- and posted credit-note lines (−). netSales = taxable value; cost =
-- invoice-line COGS − cost of goods credited back; margin = net − cost.
-- Free-text / service lines are grouped under itemId NULL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Sales"."getSalesByItem"
WITH (security_invoker = true) AS
SELECT
  l."tenantId",
  l."itemId",
  it.sku,
  COALESCE(it.name, 'Non-stock / service lines')  AS "itemName",
  it."manufacturerId",
  it."productClassId",
  l."branchId",
  l."saleDate",
  date_trunc('month', l."saleDate")::date          AS "periodMonth",
  "Company"."getFiscalYearLabel"(l."saleDate")                      AS "fyLabel",
  sum(l."qtySold")                                 AS "qtySold",
  sum(l."qtyReturned")                             AS "qtyReturned",
  sum(l."qtySold") - sum(l."qtyReturned")           AS "netQty",
  sum(l."bonusQty")                                AS "bonusQty",
  sum(l."grossAmount")                             AS "grossAmount",
  sum(l."discountAmount")                          AS "discountAmount",
  sum(l."netSales")                                AS "netSales",
  sum(l."gstAmount")                               AS "gstAmount",
  sum(l."totalAmount")                             AS "totalAmount",
  sum(l."costAmount")                              AS "costAmount",
  sum(l."netSales") - sum(l."costAmount")           AS "grossMargin",
  count(DISTINCT l."invoiceId")                    AS "invoiceCount"
FROM (
  SELECT i."tenantId", il."itemId", i."branchId", i."docDate" AS "saleDate",
         il."baseQty" AS "qtySold", 0::numeric AS "qtyReturned", il."bonusQty",
         il."grossAmount", il."discountAmount", il."taxableAmount" AS "netSales",
         il."taxAmount" + il."furtherTaxAmount" AS "gstAmount", il."totalAmount",
         il."costAmount", i.id AS "invoiceId"
    FROM "Sales"."SalesInvoiceLines" il
    JOIN "Sales"."SalesInvoices" i ON i."tenantId" = il."tenantId" AND i.id = il."invoiceId"
   WHERE i.status IN ('POSTED','PARTIALLY_PAID','PAID')
  UNION ALL
  SELECT cn."tenantId", cl."itemId", COALESCE(cn."branchId", "Inventory"."branchId", cu."branchId"), cn."docDate",
         0, cl."baseQty", 0,
         -cl."valueAmount", 0, -cl."valueAmount",
         -(cl."taxAmount" + cl."furtherTaxAmount"), -cl."totalAmount",
         -cl."costAmount", NULL::uuid
    FROM "Sales"."CreditNoteLines" cl
    JOIN "Sales"."CreditNotes" cn ON cn."tenantId" = cl."tenantId" AND cn.id = cl."creditNoteId"
    JOIN "Sales"."Customers" cu ON cu."tenantId" = cn."tenantId" AND cu.id = cn."customerId"
    LEFT JOIN "Sales"."SalesInvoices" inv ON "Inventory"."tenantId" = cn."tenantId" AND "Inventory".id = cn."invoiceId"
   WHERE cn.status IN ('OPEN','APPLIED')
) l
LEFT JOIN "Inventory"."Products" it ON it."tenantId" = l."tenantId" AND it.id = l."itemId"
GROUP BY l."tenantId", l."itemId", it.sku, it.name, it."manufacturerId", it."productClassId", l."branchId", l."saleDate";

COMMENT ON VIEW "Sales"."getSalesByItem" IS
  'Sales by item per day: qty sold / returned / bonus, net sales, GST, cost (COGS net of credited cost), gross margin. Screens: app/receivables/ageing (Sales by Item tab: SKU / Item / Qty Sold / Avg Rate / Net Sales / Gross Margin). Range totals: Sales.getSalesByItemForPeriod.';


-- Sales.getSalesByItemForPeriod — "SKU / Item / Qty Sold / Avg Rate / Net Sales / Gross Margin" for a range.
CREATE OR REPLACE FUNCTION "Sales"."getSalesByItemForPeriod"("pFrom" date, "pTo" date, "pBranchId" uuid DEFAULT NULL)
RETURNS TABLE (
  "itemId"        uuid,
  sku            text,
  "itemName"      text,
  "qtySold"       numeric,
  "qtyReturned"   numeric,
  "netQty"        numeric,
  "bonusQty"      numeric,
  "avgRate"       numeric,
  "netSales"      numeric,
  "costAmount"    numeric,
  "grossMargin"   numeric,
  "marginPct"     numeric,
  "sharePct"      numeric)
LANGUAGE sql STABLE AS $$
  SELECT v."itemId", v.sku, v."itemName",
         sum(v."qtySold"), sum(v."qtyReturned"), sum(v."netQty"), sum(v."bonusQty"),
         round(sum(v."netSales") / NULLIF(sum(v."netQty"), 0), 4),
         sum(v."netSales"), sum(v."costAmount"), sum(v."grossMargin"),
         round(100 * sum(v."grossMargin") / NULLIF(sum(v."netSales"), 0), 2),
         round(100 * sum(v."netSales") / NULLIF(sum(sum(v."netSales")) OVER (), 0), 2)
    FROM "Sales"."getSalesByItem" v
   WHERE v."saleDate" BETWEEN "pFrom" AND "pTo"
     AND ("pBranchId" IS NULL OR v."branchId" = "pBranchId")
   GROUP BY v."itemId", v.sku, v."itemName"
$$;

COMMENT ON FUNCTION "Sales"."getSalesByItemForPeriod"(date, date, uuid) IS
  'Sales by item for a date range: quantities, avg rate (net sales ÷ net qty), net sales, cost, margin and margin %. Screen: app/receivables/ageing (Sales by Item tab).';

-- End of 90-sales-views.sql (BASIC): 9 views, 5 functions.
