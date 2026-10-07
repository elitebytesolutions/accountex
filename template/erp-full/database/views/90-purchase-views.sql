-- =============================================================================
-- Finsoft ERP (FULL) — views/90-purchase-views.sql
-- Report views for Purchases & Payables (entities/09-purchases-payables.md).
-- Re-declares every Basic view (same columns, same order); Full-only columns
-- are appended at the end:
--   v_purchase_register  + projectId; + cash-refund purchase returns (PR) as
--                          negative rows (credit-settled returns already appear
--                          through their debit note)
--   v_wht_deducted       + CPR status from Tax.WhtDeductions / Tax.WhtChallans
-- Full purchase returns with settlement CREDIT reach AP through
-- Purchases.DebitNotes (purchaseReturnId), so ageing / balance / statement
-- are unchanged.
--
-- Install order: 00 → 14 schema → fk/* → 90-views (this file) → 91-rls.
-- Every view is  security_invoker = true:  the caller's RLS policy
-- (tenantId = Company.getCurrentTenantId()) applies to every base table read.
--
-- What counts (same rules as Purchases.refreshVendorBillBalance):
--   bills          status POSTED / PARTIALLY_PAID / PAID     (not DRAFT … APPROVED, not VOID)
--   vendor payment status POSTED / PRESENTED / CLEARED        (not DRAFT / PENDING_APPROVAL / VOID)
--   debit notes    status OPEN / APPLIED / REFUNDED           (not DRAFT / VOID)
--   allocations    NOT isReversed, source counted as above
--   GRN            status POSTED
--   opening        Accounting.OpeningBalanceLines with vendorId of a POSTED batch
-- Payable = opening (Cr − Dr) + Σ open bill balance (net payable − paid now −
-- settled) − unallocated payments − open debit-note credit. All amounts are
-- net of WHT withheld (bill.netPayableAmount = total − WHT).
--
-- Views
--   Purchases.getPayablesAgeing          app/payables/ageing (AP Ageing tab)
--   Purchases.getVendorBalances     app/vendors, app/vendors/view, app/payables/ageing stats
--   Purchases.getVendorStatement   app/vendors/view (Statement tab), app/payables/ageing (Vendor Statement)
--   Purchases.getPurchaseRegister  app/payables/ageing (Purchase Register, Purchases by Vendor)
--   Purchases.getThreeWayMatch    app/purchases/orders ("Received" column), GRN / bill match badges
--   Purchases.getVendorWhtDeducted       app/payables/ageing (WHT Deducted tab)
-- Functions
--   Purchases.getPayablesAgeingAsOf(date)               ageing at any "As On" date (v_ap_ageing = today)
--   Purchases.getVendorBalanceOn(vendorId, date)  statement opening / closing for a period
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Purchases.getPayablesAgeingAsOf — open AP items of every vendor at pAsOf.
-- One row per open item: BILL (balance > 0), OPENING balance line, and
-- unapplied credits PAYMENT (unallocated) / DEBIT_NOTE (unapplied) as
-- negative amounts, aged by their own date. Settlements count only when
-- allocated on or before pAsOf and not reversed by then.
-- Buckets: bucket_* by due date (daysPastDue), bill_bucket_* by bill date
-- (daysSinceBill) for the "Ageing basis: By bill date" option.
-- Limitation: debit-note refunds have no date column; refundedAmount is
-- applied from the debit note date.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."getPayablesAgeingAsOf"("pAsOf" date DEFAULT current_date)
RETURNS TABLE (
  "tenantId"          uuid,
  "asOfDate"         date,
  "vendorId"          uuid,
  "vendorCode"        text,
  "vendorName"        text,
  "paymentTerms"      text,
  "creditDays"        smallint,
  "branchId"          uuid,
  "branchName"        text,
  "docKind"           text,
  "docId"             uuid,
  "docNo"             text,
  "vendorInvoiceNo"  text,
  "docDate"           date,
  "dueDate"           date,
  "originalAmount"    numeric,
  "settledAmount"     numeric,
  "balanceAmount"     numeric,
  "daysSinceBill"    integer,
  "daysPastDue"      integer,
  "bucketCurrent"     numeric,
  bucket130        numeric,
  bucket3160       numeric,
  bucket6190       numeric,
  "bucket90Plus"     numeric,
  "billBucket030"   numeric,
  "billBucket3160"  numeric,
  "billBucket6190"  numeric,
  "billBucket90Plus" numeric,
  "isDisputed"        boolean,
  "disputeNote"       text
)
LANGUAGE sql STABLE AS $$
  WITH items AS (
    -- bills
    SELECT b."tenantId", b."vendorId", b."branchId", 'BILL'::text AS "docKind", b.id AS "docId", b."docNo",
           b."vendorInvoiceNo", b."docDate", b."dueDate",
           b."netPayableAmount" AS "originalAmount",
           b."paidNowAmount" + COALESCE(s.settled, 0) AS "settledAmount",
           b."isDisputed", b."disputeNote"
      FROM "Purchases"."VendorBills" b
      LEFT JOIN LATERAL (
        SELECT sum(a.amount + a."whtAmount") AS settled
          FROM "Purchases"."VendorPaymentAllocations" a
          LEFT JOIN "Purchases"."VendorPayments" p ON p."tenantId" = a."tenantId" AND p.id = a."vendorPaymentId"
          LEFT JOIN "Purchases"."DebitNotes" d     ON d."tenantId" = a."tenantId" AND d.id = a."debitNoteId"
         WHERE a."tenantId" = b."tenantId"
           AND a."billId" = b.id
           AND a."allocationDate" <= "pAsOf"
           AND (NOT a."isReversed" OR a."reversedAt"::date > "pAsOf")
           AND (   (p.id IS NOT NULL AND p."postedAt" IS NOT NULL AND p."docDate" <= "pAsOf"
                    AND p.status IN ('POSTED','PRESENTED','CLEARED','VOID'))
                OR (d.id IS NOT NULL AND d."postedAt" IS NOT NULL AND d."docDate" <= "pAsOf"
                    AND d.status IN ('OPEN','APPLIED','REFUNDED','VOID')))
      ) s ON true
     WHERE b."docDate" <= "pAsOf"
       AND (b.status IN ('POSTED','PARTIALLY_PAID','PAID')
            OR (b.status = 'VOID' AND b."postedAt" IS NOT NULL AND b."voidedAt"::date > "pAsOf"))

    UNION ALL
    -- vendor opening balances (posted opening batch)
    SELECT l."tenantId", l."vendorId", COALESCE(l."branchId", ob."branchId"), 'OPENING', l.id, je."docNo",
           NULL::text, ob."asAtDate", ob."asAtDate",
           l.credit - l.debit, 0::numeric, false, NULL::text
      FROM "Accounting"."OpeningBalanceLines" l
      JOIN "Accounting"."OpeningBalances" ob ON ob."tenantId" = l."tenantId" AND ob.id = l."batchId"
      LEFT JOIN "Accounting"."Vouchers" je    ON je."tenantId" = ob."tenantId" AND je.id = ob."journalEntryId"
     WHERE l."vendorId" IS NOT NULL
       AND ob.status = 'POSTED'
       AND ob."asAtDate" <= "pAsOf"

    UNION ALL
    -- unallocated payments (on account)
    SELECT p."tenantId", p."vendorId", p."branchId", 'PAYMENT', p.id, p."docNo", p."chequeNo",
           p."docDate", p."docDate",
           -p.amount, -COALESCE(s.allocated, 0), false, NULL::text
      FROM "Purchases"."VendorPayments" p
      LEFT JOIN LATERAL (
        SELECT sum(a.amount) AS allocated
          FROM "Purchases"."VendorPaymentAllocations" a
         WHERE a."tenantId" = p."tenantId"
           AND a."vendorPaymentId" = p.id
           AND a."allocationDate" <= "pAsOf"
           AND (NOT a."isReversed" OR a."reversedAt"::date > "pAsOf")
      ) s ON true
     WHERE p."docDate" <= "pAsOf"
       AND p."postedAt" IS NOT NULL
       AND (p.status IN ('POSTED','PRESENTED','CLEARED')
            OR (p.status = 'VOID' AND p."voidedAt"::date > "pAsOf"))

    UNION ALL
    -- unapplied debit notes
    SELECT d."tenantId", d."vendorId", d."branchId", 'DEBIT_NOTE', d.id, d."docNo", NULL::text,
           d."docDate", d."docDate",
           -(d."creditAmount" - d."refundedAmount"), -COALESCE(s.applied, 0), false, NULL::text
      FROM "Purchases"."DebitNotes" d
      LEFT JOIN LATERAL (
        SELECT sum(a.amount) AS applied
          FROM "Purchases"."VendorPaymentAllocations" a
         WHERE a."tenantId" = d."tenantId"
           AND a."debitNoteId" = d.id
           AND a."allocationDate" <= "pAsOf"
           AND (NOT a."isReversed" OR a."reversedAt"::date > "pAsOf")
      ) s ON true
     WHERE d."docDate" <= "pAsOf"
       AND d."postedAt" IS NOT NULL
       AND (d.status IN ('OPEN','APPLIED','REFUNDED')
            OR (d.status = 'VOID' AND d."voidedAt"::date > "pAsOf"))
  ),
  "openItems" AS (
    SELECT i.*,
           i."originalAmount" - i."settledAmount" AS bal,
           ("pAsOf" - i."docDate")               AS "dBill",
           ("pAsOf" - i."dueDate")               AS "dDue"
      FROM items i
     WHERE i."originalAmount" - i."settledAmount" <> 0
  )
  SELECT o."tenantId", "pAsOf", o."vendorId", v.code, v.name, v."paymentTerms", v."creditDays",
         o."branchId", br.name,
         o."docKind", o."docId", o."docNo", o."vendorInvoiceNo", o."docDate", o."dueDate",
         o."originalAmount", o."settledAmount", o.bal,
         o."dBill", o."dDue",
         CASE WHEN o."dDue" <= 0              THEN o.bal ELSE 0 END,
         CASE WHEN o."dDue" BETWEEN 1  AND 30 THEN o.bal ELSE 0 END,
         CASE WHEN o."dDue" BETWEEN 31 AND 60 THEN o.bal ELSE 0 END,
         CASE WHEN o."dDue" BETWEEN 61 AND 90 THEN o.bal ELSE 0 END,
         CASE WHEN o."dDue" > 90              THEN o.bal ELSE 0 END,
         CASE WHEN o."dBill" <= 30            THEN o.bal ELSE 0 END,
         CASE WHEN o."dBill" BETWEEN 31 AND 60 THEN o.bal ELSE 0 END,
         CASE WHEN o."dBill" BETWEEN 61 AND 90 THEN o.bal ELSE 0 END,
         CASE WHEN o."dBill" > 90             THEN o.bal ELSE 0 END,
         o."isDisputed", o."disputeNote"
    FROM "openItems" o
    JOIN "Purchases"."Vendors" v ON v."tenantId" = o."tenantId" AND v.id = o."vendorId"
    LEFT JOIN "Company"."Branches" br ON br."tenantId" = o."tenantId" AND br.id = o."branchId"
$$;

COMMENT ON FUNCTION "Purchases"."getPayablesAgeingAsOf"(date) IS
  'Open AP items (bills, vendor opening balances, unapplied payments / debit notes as negatives) at an "As On" date with due-date and bill-date buckets. Screen: app/payables/ageing (Filter As On). Purchases.getPayablesAgeing = this function at current_date.';

-- ---------------------------------------------------------------------------
-- Purchases.getPayablesAgeing — open AP items today. Group by vendor (and branch)
-- for the AP Ageing tab: Σ bucketCurrent … bucket90Plus, Σ balanceAmount.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Purchases"."getPayablesAgeing"
WITH (security_invoker = true) AS
SELECT * FROM "Purchases"."getPayablesAgeingAsOf"(current_date);

COMMENT ON VIEW "Purchases"."getPayablesAgeing" IS
  'AP ageing at today: one row per open item (BILL / OPENING / unapplied PAYMENT / DEBIT_NOTE) with balanceAmount, daysPastDue, daysSinceBill, bucketCurrent, bucket130, bucket3160, bucket6190, bucket90Plus (by due date), bill_bucket_* (by bill date), isDisputed. Screens: app/payables/ageing (AP Ageing tab, "Disputed 90+" stat), app/payables/payments (due bills).';

-- ---------------------------------------------------------------------------
-- Purchases.getVendorBalances — one row per vendor: payable, overdue and YTD
-- figures. Fiscal year starts on Company.CompanySettings.fyStartMonth
-- (default July). gl_balance = Σ posted journal lines tagged with the vendor
-- (Cr − Dr) for reconciling the sub-ledger to the GL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Purchases"."getVendorBalances"
WITH (security_invoker = true) AS
SELECT
  v."tenantId",
  v.id                                    AS "vendorId",
  v.code                                  AS "vendorCode",
  v.name                                  AS "vendorName",
  v."categoryId",
  v.city,
  v."atlStatus",
  v."defaultWhtSection",
  v."paymentTerms",
  v."creditDays",
  v.status,
  COALESCE(ag."payableBalance", 0)         AS "payableBalance",
  COALESCE(ag."billsBalance", 0)           AS "billsBalance",
  COALESCE(ag."openingBalance", 0)         AS "openingBalance",
  COALESCE(ag."unappliedCredit", 0)        AS "unappliedCredit",
  COALESCE(ag."overdueAmount", 0)          AS "overdueAmount",
  COALESCE(ag."overdueBillsCount", 0)     AS "overdueBillsCount",
  COALESCE(ag."openBillsCount", 0)        AS "openBillsCount",
  ag."oldestOverdueDays",
  COALESCE(ag."disputedAmount", 0)         AS "disputedAmount",
  ag."nextDueDate",
  fy."fyStart"                             AS "ytdFrom",
  COALESCE(y."purchasesYtd", 0)            AS "purchasesYtd",
  COALESCE(y."billsYtd", 0)                AS "billsYtd",
  COALESCE(y."billWhtYtd", 0) + COALESCE(pw."paymentWhtYtd", 0) AS "whtYtd",
  y."lastBillDate",
  pw."lastPaymentDate",
  COALESCE(gl."glBalance", 0)              AS "glBalance"
FROM "Purchases"."Vendors" v
LEFT JOIN "Company"."CompanySettings" cp
  ON cp."tenantId" = v."tenantId"
CROSS JOIN LATERAL (
  SELECT make_date(extract(year FROM current_date)::int
                   - CASE WHEN extract(month FROM current_date) < COALESCE(cp."fyStartMonth", 7) THEN 1 ELSE 0 END,
                   COALESCE(cp."fyStartMonth", 7), 1) AS "fyStart"
) fy
LEFT JOIN (
  SELECT a."tenantId", a."vendorId",
         sum(a."balanceAmount")                                                AS "payableBalance",
         sum(a."balanceAmount") FILTER (WHERE a."docKind" = 'BILL')             AS "billsBalance",
         sum(a."balanceAmount") FILTER (WHERE a."docKind" = 'OPENING')          AS "openingBalance",
         sum(a."balanceAmount") FILTER (WHERE a."docKind" IN ('PAYMENT','DEBIT_NOTE')) AS "unappliedCredit",
         sum(a."balanceAmount") FILTER (WHERE a."docKind" = 'BILL' AND a."daysPastDue" > 0) AS "overdueAmount",
         count(*) FILTER (WHERE a."docKind" = 'BILL' AND a."daysPastDue" > 0)  AS "overdueBillsCount",
         count(*) FILTER (WHERE a."docKind" = 'BILL' AND a."balanceAmount" > 0) AS "openBillsCount",
         max(a."daysPastDue") FILTER (WHERE a."docKind" = 'BILL' AND a."daysPastDue" > 0) AS "oldestOverdueDays",
         sum(a."balanceAmount") FILTER (WHERE a."isDisputed")                   AS "disputedAmount",
         min(a."dueDate") FILTER (WHERE a."docKind" = 'BILL' AND a."daysPastDue" <= 0) AS "nextDueDate"
    FROM "Purchases"."getPayablesAgeing" a
   GROUP BY a."tenantId", a."vendorId"
) ag ON ag."tenantId" = v."tenantId" AND ag."vendorId" = v.id
LEFT JOIN LATERAL (
  SELECT sum(b."totalAmount") AS "purchasesYtd",
         count(*)            AS "billsYtd",
         sum(b."whtAmount")   AS "billWhtYtd",
         max(b."docDate")     AS "lastBillDate"
    FROM "Purchases"."VendorBills" b
   WHERE b."tenantId" = v."tenantId" AND b."vendorId" = v.id
     AND b.status IN ('POSTED','PARTIALLY_PAID','PAID')
     AND b."docDate" >= fy."fyStart" AND b."docDate" <= current_date
) y ON true
LEFT JOIN LATERAL (
  SELECT sum(p."whtAmount") FILTER (WHERE p."docDate" >= fy."fyStart") AS "paymentWhtYtd",
         max(p."docDate")                                            AS "lastPaymentDate"
    FROM "Purchases"."VendorPayments" p
   WHERE p."tenantId" = v."tenantId" AND p."vendorId" = v.id
     AND p.status IN ('POSTED','PRESENTED','CLEARED')
     AND p."docDate" <= current_date
) pw ON true
LEFT JOIN LATERAL (
  SELECT sum(jl.credit - jl.debit) AS "glBalance"
    FROM "Accounting"."VoucherLines" jl
    JOIN "Accounting"."Vouchers" je ON je."tenantId" = jl."tenantId" AND je.id = jl."journalEntryId"
   WHERE jl."tenantId" = v."tenantId" AND jl."vendorId" = v.id
     AND je.status IN ('POSTED','REVERSED')
) gl ON true
WHERE v."deletedAt" IS NULL;

COMMENT ON VIEW "Purchases"."getVendorBalances" IS
  'Per-vendor payable (net of WHT), overdue amount / bills / oldest days, open bills, unapplied credits, disputed amount, purchases / bills / WHT year-to-date and GL balance for reconciliation. Screens: app/vendors (KPIs Total Payable / Overdue, Payable column, "With balance" chip), app/vendors/view (KPIs, overdue badge), app/payables/ageing (stats Vendors / Total Payable / DPO).';

-- ---------------------------------------------------------------------------
-- Purchases.getVendorStatement — vendor ledger (balance Cr = we owe).
-- Rows: OPENING (opening balance line), BILL (Cr total), BILL_WHT (Dr WHT
-- withheld at bill), BILL_PAID_NOW (Dr counter purchase paid at posting),
-- PAYMENT (Dr amount), PAYMENT_WHT (Dr WHT withheld at payment),
-- DEBIT_NOTE (Dr credit to us), DN_REFUND (Cr refund received; dated at the
-- debit note — no refund date column). Voided documents are excluded.
-- runningBalance spans all earlier rows of the vendor, so a period filter
-- keeps correct balances (opening = first row's openingBalance, or
-- Purchases.getVendorBalanceOn(vendor, from − 1)).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Purchases"."getVendorStatement"
WITH (security_invoker = true) AS
WITH entries AS (
  SELECT l."tenantId", l."vendorId", COALESCE(l."branchId", ob."branchId") AS "branchId",
         ob."asAtDate" AS "entryDate", 0 AS "sortSeq", 'OPENING'::text AS "entryKind", 'OB'::text AS "docType",
         ob.id AS "docId", COALESCE(je."docNo", 'Opening') AS "docNo", NULL::text AS reference,
         COALESCE(l.remarks, 'Opening balance') AS particulars,
         l.debit, l.credit
    FROM "Accounting"."OpeningBalanceLines" l
    JOIN "Accounting"."OpeningBalances" ob ON ob."tenantId" = l."tenantId" AND ob.id = l."batchId"
    LEFT JOIN "Accounting"."Vouchers" je    ON je."tenantId" = ob."tenantId" AND je.id = ob."journalEntryId"
   WHERE l."vendorId" IS NOT NULL AND ob.status = 'POSTED'
  UNION ALL
  SELECT b."tenantId", b."vendorId", b."branchId", b."docDate", 1, 'BILL',
         CASE b.channel WHEN 'COUNTER' THEN 'PV' ELSE 'BILL' END,
         b.id, b."docNo", b."vendorInvoiceNo",
         'Bill ' || b."vendorInvoiceNo" || COALESCE(' — ' || b.remarks, ''),
         0::numeric, b."totalAmount"
    FROM "Purchases"."VendorBills" b
   WHERE b.status IN ('POSTED','PARTIALLY_PAID','PAID')
  UNION ALL
  SELECT b."tenantId", b."vendorId", b."branchId", b."docDate", 2, 'BILL_WHT',
         CASE b.channel WHEN 'COUNTER' THEN 'PV' ELSE 'BILL' END,
         b.id, b."docNo", b."vendorInvoiceNo", 'Income tax withheld at bill',
         b."whtAmount", 0::numeric
    FROM "Purchases"."VendorBills" b
   WHERE b.status IN ('POSTED','PARTIALLY_PAID','PAID') AND b."whtAmount" > 0
  UNION ALL
  SELECT b."tenantId", b."vendorId", b."branchId", b."docDate", 3, 'BILL_PAID_NOW',
         CASE b.channel WHEN 'COUNTER' THEN 'PV' ELSE 'BILL' END,
         b.id, b."docNo", b."chequeNo", 'Paid at purchase (' || lower(b."payMode") || ')',
         b."paidNowAmount", 0::numeric
    FROM "Purchases"."VendorBills" b
   WHERE b.status IN ('POSTED','PARTIALLY_PAID','PAID') AND b."paidNowAmount" > 0
  UNION ALL
  SELECT p."tenantId", p."vendorId", p."branchId", p."docDate", 4, 'PAYMENT', 'PAY',
         p.id, p."docNo", p."chequeNo",
         'Payment — ' || replace(lower(p.method), '_', ' ') || COALESCE(' ' || p."chequeNo", '')
           || COALESCE(' — ' || p.remarks, ''),
         p.amount, 0::numeric
    FROM "Purchases"."VendorPayments" p
   WHERE p.status IN ('POSTED','PRESENTED','CLEARED')
  UNION ALL
  SELECT p."tenantId", p."vendorId", p."branchId", p."docDate", 5, 'PAYMENT_WHT', 'PAY',
         p.id, p."docNo", p."chequeNo", 'Income tax withheld at payment',
         p."whtAmount", 0::numeric
    FROM "Purchases"."VendorPayments" p
   WHERE p.status IN ('POSTED','PRESENTED','CLEARED') AND p."whtAmount" > 0
  UNION ALL
  SELECT d."tenantId", d."vendorId", d."branchId", d."docDate", 6, 'DEBIT_NOTE', 'DN',
         d.id, d."docNo", NULL::text,
         'Debit note — ' || replace(lower(d.reason), '_', ' ') || COALESCE(' — ' || d."reasonNote", ''),
         d."creditAmount", 0::numeric
    FROM "Purchases"."DebitNotes" d
   WHERE d.status IN ('OPEN','APPLIED','REFUNDED')
  UNION ALL
  SELECT d."tenantId", d."vendorId", d."branchId", d."docDate", 7, 'DN_REFUND', 'DN',
         d.id, d."docNo", NULL::text, 'Refund received against debit note',
         0::numeric, d."refundedAmount"
    FROM "Purchases"."DebitNotes" d
   WHERE d.status IN ('OPEN','APPLIED','REFUNDED') AND d."refundedAmount" > 0
)
SELECT
  e."tenantId",
  e."vendorId",
  v.code                                  AS "vendorCode",
  v.name                                  AS "vendorName",
  e."branchId",
  e."entryDate",
  e."entryKind",
  e."docType",
  e."docId",
  e."docNo",
  e.reference,
  e.particulars,
  e.debit,
  e.credit,
  sum(e.credit - e.debit) OVER w - (e.credit - e.debit) AS "openingBalance",
  sum(e.credit - e.debit) OVER w                        AS "runningBalance"
FROM entries e
JOIN "Purchases"."Vendors" v ON v."tenantId" = e."tenantId" AND v.id = e."vendorId"
WINDOW w AS (PARTITION BY e."tenantId", e."vendorId"
             ORDER BY e."entryDate", e."sortSeq", e."docNo", e."docId"
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW);

COMMENT ON VIEW "Purchases"."getVendorStatement" IS
  'Vendor statement: Date, Document, Particulars, Debit, Credit and running Balance (Cr) from opening balances, posted bills (with WHT and paid-now legs), payments (with WHT) and debit notes. Screens: app/vendors/view (Statement tab, PDF), app/payables/ageing (Vendor Statement tab).';

CREATE OR REPLACE FUNCTION "Purchases"."getVendorBalanceOn"("pVendorId" uuid, "pDate" date)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(s.credit - s.debit), 0)
    FROM "Purchases"."getVendorStatement" s
   WHERE s."tenantId" = "Company"."getCurrentTenantId"()
     AND s."vendorId" = "pVendorId"
     AND s."entryDate" <= "pDate"
$$;
COMMENT ON FUNCTION "Purchases"."getVendorBalanceOn"(uuid, date) IS
  'Vendor statement balance (Cr) at the end of pDate. Opening of a statement period = vendor_balance_on(vendor, from - 1). Screens: app/vendors/view, app/payables/ageing.';

-- ---------------------------------------------------------------------------
-- Purchases.getPurchaseRegister — posted bills (BILL / PV) and posted debit
-- notes (negative) for the Purchase Register and Purchases by Vendor tabs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Purchases"."getPurchaseRegister"
WITH (security_invoker = true) AS
SELECT
  b."tenantId",
  'BILL'::text                            AS "docKind",
  CASE b.channel WHEN 'COUNTER' THEN 'PV' ELSE 'BILL' END AS "docType",
  b.id                                    AS "docId",
  b.id                                    AS "billId",
  b."docNo",
  b."vendorInvoiceNo",
  b."docDate",
  date_trunc('month', b."docDate")::date   AS "periodMonth",
  b."dueDate",
  b."vendorId",
  v.code                                  AS "vendorCode",
  v.name                                  AS "vendorName",
  COALESCE(v.ntn, v.cnic)                 AS "vendorNtnCnic",
  v.strn                                  AS "vendorStrn",
  v."categoryId"                           AS "vendorCategoryId",
  b."branchId",
  br.name                                 AS "branchName",
  b.channel,
  b."purchaseOrderId",
  b."grnId",
  b."grossAmount",
  b."discountAmount",
  b."netAmount",
  b."taxAmount",
  b."advanceTaxAmount",
  b."totalAmount",
  b."whtAmount",
  b."netPayableAmount",
  b."balanceAmount",
  b.status,
  b."matchStatus",
  b."isDisputed",
  b."journalEntryId",
  b."projectId"                            -- [Full]
FROM "Purchases"."VendorBills" b
JOIN "Purchases"."Vendors" v ON v."tenantId" = b."tenantId" AND v.id = b."vendorId"
JOIN "Company"."Branches" br    ON br."tenantId" = b."tenantId" AND br.id = b."branchId"
WHERE b.status IN ('POSTED','PARTIALLY_PAID','PAID')
UNION ALL
SELECT
  d."tenantId",
  'DEBIT_NOTE',
  'DN',
  d.id,
  d."billId",
  d."docNo",
  ob."vendorInvoiceNo",
  d."docDate",
  date_trunc('month', d."docDate")::date,
  NULL::date,
  d."vendorId",
  v.code,
  v.name,
  COALESCE(v.ntn, v.cnic),
  v.strn,
  v."categoryId",
  d."branchId",
  br.name,
  NULL::text,
  NULL::uuid,
  NULL::uuid,
  -d."netAmount",
  0::numeric,
  -d."netAmount",
  -d."taxAmount",
  0::numeric,
  -d."totalAmount",
  -d."whtAmount",
  -d."creditAmount",
  -d."balanceAmount",
  d.status,
  NULL::text,
  false,
  d."journalEntryId",
  ob."projectId"
FROM "Purchases"."DebitNotes" d
JOIN "Purchases"."Vendors" v ON v."tenantId" = d."tenantId" AND v.id = d."vendorId"
JOIN "Company"."Branches" br    ON br."tenantId" = d."tenantId" AND br.id = d."branchId"
JOIN "Purchases"."VendorBills" ob  ON ob."tenantId" = d."tenantId" AND ob.id = d."billId"
WHERE d.status IN ('OPEN','APPLIED','REFUNDED')
UNION ALL
-- [Full] purchase returns refunded in cash (no debit note, no AP effect)
SELECT
  r."tenantId",
  'PURCHASE_RETURN',
  'PR',
  r.id,
  r."billId",
  r."docNo",
  r."supplierBillNo",
  r."docDate",
  date_trunc('month', r."docDate")::date,
  NULL::date,
  r."vendorId",
  v.code,
  v.name,
  COALESCE(v.ntn, v.cnic),
  v.strn,
  v."categoryId",
  r."branchId",
  br.name,
  NULL::text,
  NULL::uuid,
  NULL::uuid,
  -r."grossAmount",
  -r."discountAmount",
  -(r."grossAmount" - r."discountAmount"),
  -r."taxAmount",
  0::numeric,
  -r."totalAmount",
  0::numeric,
  0::numeric,
  0::numeric,
  r.status,
  NULL::text,
  false,
  r."journalEntryId",
  ob."projectId"
FROM "Purchases"."PurchaseReturns" r
JOIN "Purchases"."Vendors" v ON v."tenantId" = r."tenantId" AND v.id = r."vendorId"
JOIN "Company"."Branches" br    ON br."tenantId" = r."tenantId" AND br.id = r."branchId"
LEFT JOIN "Purchases"."VendorBills" ob ON ob."tenantId" = r."tenantId" AND ob.id = r."billId"
WHERE r.settlement = 'CASH_REFUND'
  AND r.status IN ('POSTED','REFERENCED');

COMMENT ON VIEW "Purchases"."getPurchaseRegister" IS
  'Purchase register: posted bills / counter purchases (BILL, PV), posted debit notes and cash-refund purchase returns (PR) as negatives — net, input tax, advance tax, total, WHT, net payable, balance, project. Screens: app/payables/ageing (Purchase Register tab; Purchases by Vendor = grouped by vendorId), app/purchases/bills (totals).';

-- ---------------------------------------------------------------------------
-- Purchases.getThreeWayMatch — PO line vs GRN (posted) vs bill (posted).
-- Rates compared net of line discount (netAmount / baseQty). Tolerance =
-- Company.CompanySettings.threeWayMatchTolerancePct (default 2%).
-- derived_match_status: NOT_SENT · AWAITING_RECEIPT · OVER_RECEIPT ·
-- PRICE_VARIANCE · QTY_VARIANCE · TWO_WAY_BILL_AWAITED · PARTIALLY_RECEIVED ·
-- MATCHED.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Purchases"."getThreeWayMatch"
WITH (security_invoker = true) AS
SELECT
  q.*,
  CASE
    WHEN q."receivedQty" = 0 AND q."billedQty" = 0 AND q."sentToVendorAt" IS NULL
         AND q."poStatus" NOT IN ('CANCELLED')                                   THEN 'NOT_SENT'
    WHEN q."receivedQty" > q."orderedQty"                                         THEN 'OVER_RECEIPT'
    WHEN q."priceVariancePct" IS NOT NULL
         AND abs(q."priceVariancePct") > q."tolerancePct"                        THEN 'PRICE_VARIANCE'
    WHEN q."billedQty" > 0 AND q."receivedQty" > 0
         AND abs(q."billedQty" - q."receivedQty") * 100 / NULLIF(q."receivedQty", 0) > q."tolerancePct" THEN 'QTY_VARIANCE'
    WHEN q."billedQty" > 0 AND q."receivedQty" = 0                                THEN 'QTY_VARIANCE'
    WHEN q."receivedQty" = 0                                                     THEN 'AWAITING_RECEIPT'
    WHEN q."billedQty" = 0                                                       THEN 'TWO_WAY_BILL_AWAITED'
    WHEN q."receivedQty" < q."orderedQty"                                         THEN 'PARTIALLY_RECEIVED'
    ELSE 'MATCHED'
  END AS "derivedMatchStatus"
FROM (
  SELECT
    po."tenantId",
    po.id                                 AS "purchaseOrderId",
    po."docNo"                             AS "poNo",
    po."docDate"                           AS "poDate",
    po."expectedDate",
    po.status                             AS "poStatus",
    po."sentToVendorAt",
    po."vendorId",
    v.name                                AS "vendorName",
    po."branchId",
    pl.id                                 AS "purchaseOrderLineId",
    pl."lineNo",
    pl."itemId",
    pl.description,
    pl."baseQty" + pl."bonusQty"            AS "orderedQty",
    pl.rate                               AS "poRate",
    round(pl."netAmount" / pl."baseQty", 4) AS "poNetRate",
    pl."netAmount"                         AS "poNetAmount",
    pl."receivedQty",                                        -- maintained by GRN posting
    pl."billedQty",                                          -- maintained by bill posting
    GREATEST(pl."baseQty" + pl."bonusQty" - pl."receivedQty", 0) AS "shortQty",
    pl."receivedQty" - pl."billedQty"       AS "receivedNotBilledQty",
    COALESCE(g."acceptedQty", 0)           AS "grnAcceptedQty",
    COALESCE(g."rejectedQty", 0)           AS "grnRejectedQty",
    COALESCE(g."grnCount", 0)              AS "grnCount",
    g."lastGrnId",
    g."lastGrnNo",
    g."lastGrnDate",
    COALESCE(bl."billCount", 0)            AS "billCount",
    COALESCE(bl."billedNetAmount", 0)     AS "billedNetAmount",
    bl."billNetRate",
    bl."lastBillId",
    bl."lastBillNo",
    bl."lastBillDate",
    CASE WHEN pl."baseQty" + pl."bonusQty" > 0
         THEN round((pl."receivedQty" - (pl."baseQty" + pl."bonusQty")) * 100 / (pl."baseQty" + pl."bonusQty"), 4)
    END                                   AS "qtyVariancePct",
    CASE WHEN bl."billNetRate" IS NOT NULL AND pl."netAmount" > 0
         THEN round((bl."billNetRate" - pl."netAmount" / pl."baseQty") * 100 / (pl."netAmount" / pl."baseQty"), 4)
    END                                   AS "priceVariancePct",
    COALESCE(cp."threeWayMatchTolerancePct", 2) AS "tolerancePct"
  FROM "Purchases"."PurchaseOrders" po
  JOIN "Purchases"."PurchaseOrderLines" pl
    ON pl."tenantId" = po."tenantId" AND pl."purchaseOrderId" = po.id
  JOIN "Purchases"."Vendors" v
    ON v."tenantId" = po."tenantId" AND v.id = po."vendorId"
  LEFT JOIN "Company"."CompanySettings" cp
    ON cp."tenantId" = po."tenantId"
  LEFT JOIN LATERAL (
    SELECT sum(gl."acceptedQty") AS "acceptedQty",
           sum(gl."rejectedQty") AS "rejectedQty",
           count(DISTINCT g.id) AS "grnCount",
           (array_agg(g.id     ORDER BY g."docDate" DESC, g."docNo" DESC))[1] AS "lastGrnId",
           (array_agg(g."docNo" ORDER BY g."docDate" DESC, g."docNo" DESC))[1] AS "lastGrnNo",
           max(g."docDate") AS "lastGrnDate"
      FROM "Purchases"."GoodsReceivedNoteLines" gl
      JOIN "Purchases"."GoodsReceivedNotes" g ON g."tenantId" = gl."tenantId" AND g.id = gl."grnId"
     WHERE gl."tenantId" = pl."tenantId"
       AND gl."purchaseOrderLineId" = pl.id
       AND g.status = 'POSTED'
  ) g ON true
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT b.id)  AS "billCount",
           sum(x."netAmount")     AS "billedNetAmount",
           CASE WHEN sum(x."baseQty") > 0 THEN round(sum(x."netAmount") / sum(x."baseQty"), 4) END AS "billNetRate",
           (array_agg(b.id     ORDER BY b."docDate" DESC, b."docNo" DESC))[1] AS "lastBillId",
           (array_agg(b."docNo" ORDER BY b."docDate" DESC, b."docNo" DESC))[1] AS "lastBillNo",
           max(b."docDate") AS "lastBillDate"
      FROM "Purchases"."VendorBillLines" x
      JOIN "Purchases"."VendorBills" b ON b."tenantId" = x."tenantId" AND b.id = x."billId"
     WHERE x."tenantId" = pl."tenantId"
       AND x."purchaseOrderLineId" = pl.id
       AND b.status IN ('POSTED','PARTIALLY_PAID','PAID')
  ) bl ON true
) q;

COMMENT ON VIEW "Purchases"."getThreeWayMatch" IS
  'PO line ↔ posted GRN ↔ posted bill: ordered / received / billed qty, last GRN and bill numbers, qty and price variance % against the company 3-way tolerance, derived match status. Screens: app/purchases/orders ("Received" column: "10 of 15 · GRN-0412", "Not sent", "Short 1,600"), app/purchases/grn (match nodes), app/purchases/bills (3-way match badge).';

-- ---------------------------------------------------------------------------
-- Purchases.getVendorWhtDeducted — income tax withheld from vendors, by document and
-- section: at bill (VendorBillLines.wht_*) and at payment (VendorPayments
-- WITHHOLD_NOW). Bill rows: taxable = Σ line net (excl. sales tax), gross =
-- Σ line total. Payment rows: gross = amount + WHT, net paid = amount.
-- taxRate is NULL when lines of one section carry different rates.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Purchases"."getVendorWhtDeducted"
WITH (security_invoker = true) AS
SELECT w.*,
       c."deductionStatus",
       c."cprNo"
FROM (
SELECT
  b."tenantId",
  'BILL'::text                            AS "sourceKind",
  CASE b.channel WHEN 'COUNTER' THEN 'PV' ELSE 'BILL' END AS "docType",
  b.id                                    AS "docId",
  b."docNo",
  b."docDate",
  date_trunc('month', b."docDate")::date   AS "periodMonth",
  b."branchId",
  b."vendorId",
  v.code                                  AS "vendorCode",
  v.name                                  AS "vendorName",
  COALESCE(v.ntn, v.cnic)                 AS "vendorNtnCnic",
  v."atlStatus",
  l."whtSection",
  CASE l."whtSection" WHEN '153_1_A' THEN '153(1)(a)' WHEN '153_1_B' THEN '153(1)(b)'
                     WHEN '153_1_C' THEN '153(1)(c)' ELSE l."whtSection" END AS "whtSectionLabel",
  sum(l."netAmount")                       AS "taxableAmount",
  sum(l."totalAmount")                     AS "grossAmount",
  CASE WHEN min(l."whtRate") = max(l."whtRate") THEN max(l."whtRate") END AS "taxRate",
  sum(l."whtAmount")                       AS "taxWithheld",
  sum(l."totalAmount") - sum(l."whtAmount") AS "netPaid",
  b."journalEntryId"
FROM "Purchases"."VendorBills" b
JOIN "Purchases"."VendorBillLines" l ON l."tenantId" = b."tenantId" AND l."billId" = b.id
JOIN "Purchases"."Vendors" v    ON v."tenantId" = b."tenantId" AND v.id = b."vendorId"
WHERE b.status IN ('POSTED','PARTIALLY_PAID','PAID')
  AND l."whtAmount" > 0
GROUP BY b."tenantId", b.id, b.channel, b."docNo", b."docDate", b."branchId", b."vendorId",
         v.code, v.name, v.ntn, v.cnic, v."atlStatus", l."whtSection", b."journalEntryId"
UNION ALL
SELECT
  p."tenantId",
  'PAYMENT',
  'PAY',
  p.id,
  p."docNo",
  p."docDate",
  date_trunc('month', p."docDate")::date,
  p."branchId",
  p."vendorId",
  v.code,
  v.name,
  COALESCE(v.ntn, v.cnic),
  v."atlStatus",
  p."whtSection",
  CASE p."whtSection" WHEN '153_1_A' THEN '153(1)(a)' WHEN '153_1_B' THEN '153(1)(b)'
                     WHEN '153_1_C' THEN '153(1)(c)' ELSE p."whtSection" END,
  p.amount + p."whtAmount",
  p.amount + p."whtAmount",
  p."whtRate",
  p."whtAmount",
  p.amount,
  p."journalEntryId"
FROM "Purchases"."VendorPayments" p
JOIN "Purchases"."Vendors" v ON v."tenantId" = p."tenantId" AND v.id = p."vendorId"
WHERE p.status IN ('POSTED','PRESENTED','CLEARED')
  AND p."whtTreatment" = 'WITHHOLD_NOW'
  AND p."whtAmount" > 0
) w
-- [Full] deposit status of the matching Tax.WhtDeductions rows (same source
-- document and section): UNPAID / PARTIALLY_PAID / PAID, CPR numbers.
LEFT JOIN LATERAL (
  SELECT CASE WHEN count(*) = 0                                  THEN NULL
              WHEN bool_and(wd.status = 'PAID')                  THEN 'PAID'
              WHEN bool_or(wd.status = 'PAID')                   THEN 'PARTIALLY_PAID'
              ELSE 'UNPAID' END                                  AS "deductionStatus",
         string_agg(DISTINCT wp."cprNo", ', ')                    AS "cprNo"
    FROM "Tax"."WhtDeductions" wd
    LEFT JOIN "Tax"."WhtChallans" wp ON wp."tenantId" = wd."tenantId" AND wp.id = wd."whtPaymentId"
   WHERE wd."tenantId" = w."tenantId"
     AND wd."sourceDocId" = w."docId"
     AND wd."sourceDocType" = w."docType"
     AND wd.direction = 'DEDUCTED'
     AND wd.status <> 'CANCELLED'
     AND (wd."whtSection" = w."whtSection" OR wd."whtSection" = w."whtSectionLabel")
) c ON true;

COMMENT ON VIEW "Purchases"."getVendorWhtDeducted" IS
  'WHT withheld from vendors per document and section (bill-time and payment-time): taxable, gross, rate, tax withheld, net paid, and (Full) deposit status / CPR from Tax.WhtDeductions. Screens: app/payables/ageing (WHT Deducted tab, "CPR status"), app/vendors/view (WHT YTD).';
