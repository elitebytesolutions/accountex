-- =============================================================================
-- Finsoft ERP (FULL) — views/90-tax-views.sql
-- Tax report views (entities/06-tax.md, entities/08-sales-receivables.md).
--
-- Install order: 00 → 14 schema → fk/* → 90-views (this file) → 91-rls.
-- Every view is  security_invoker = true:  the caller's RLS policy
-- (tenantId = Company.getCurrentTenantId()) applies to every base table read.
--
-- Re-declares the Basic view Tax.getSalesTaxOutputRegister unchanged and adds the
-- Full-only return views (Annex-C, Annex-A, WHT by section). Live figures are
-- built from posted documents; frozen annex rows live in Tax.SalesTaxReturnLines.
--
-- What counts
--   Sales.SalesInvoices      status POSTED / PARTIALLY_PAID / PAID   (not DRAFT, not VOID)
--   Sales.CreditNotes  status OPEN / APPLIED                   (posted; not DRAFT / PENDING_APPROVAL / CANCELLED)
--   lines whose tax code is a SALES_TAX code, or that carry no tax code
--   (untaxed / exempt value still belongs in Annex-C); withholding /
--   collection codes are excluded.
--
-- Views
--   Tax.getSalesTaxOutputRegister   app/receivables/ageing (GST Output tab)
--   Tax.getSalesTaxAnnexC  [Full] app/tax/sales-tax (Annex-C, output tax KPI)
--   Tax.getSalesTaxAnnexA  [Full] app/tax/sales-tax (Annex-A, input tax KPI)
--   Tax.getWhtBySection     [Full] app/tax/wht (Deductions by section)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tax.getSalesTaxOutputRegister — Annex-C style output tax register. One row per
-- document × tax code × rate. Credit notes are negative. Buyer identity is the
-- invoice snapshot (FBR requires the buyer as at invoice date); a credit note
-- uses the snapshot of the invoice it reverses, else the customer master.
-- isRegistered = buyer STRN present (unregistered buyers attract further tax).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Tax"."getSalesTaxOutputRegister"
WITH (security_invoker = true) AS
SELECT
  i."tenantId",
  'INVOICE'::text                         AS "docKind",
  CASE i.channel WHEN 'COUNTER' THEN 'SV' WHEN 'WHOLESALE' THEN 'WS' WHEN 'POS' THEN 'POS'
                 ELSE 'INV' END           AS "docType",
  i.id                                    AS "docId",
  i.id                                    AS "invoiceId",
  NULL::uuid                              AS "creditNoteId",
  i."docNo",
  i."taxInvoiceNo",
  i."docDate",
  date_trunc('month', i."docDate")::date   AS "periodMonth",
  i."branchId",
  i."customerId",
  c.code                                  AS "customerCode",
  i."buyerName",
  COALESCE(i."buyerNtn", i."buyerCnic")     AS "buyerNtnCnic",
  i."buyerNtn",
  i."buyerCnic",
  i."buyerStrn",
  (i."buyerStrn" IS NOT NULL)              AS "isRegistered",
  l."taxCodeId",
  tc.code                                 AS "taxCode",
  tc."salesTaxKind",
  l."taxRate",
  sum(l."taxableAmount")                   AS "valueExclTax",
  sum(l."taxAmount")                       AS "salesTax",
  sum(l."furtherTaxAmount")               AS "furtherTax",
  sum(l."taxAmount" + l."furtherTaxAmount") AS "totalTax",
  sum(l."totalAmount")                     AS "valueInclTax",
  i.status,
  i."fbrStatus",
  i."fbrInvoiceNo",
  i."journalEntryId"
FROM "Sales"."SalesInvoices" i
JOIN "Sales"."SalesInvoiceLines" l
  ON l."tenantId" = i."tenantId" AND l."invoiceId" = i.id
JOIN "Sales"."Customers" c
  ON c."tenantId" = i."tenantId" AND c.id = i."customerId"
LEFT JOIN "Tax"."TaxCodes" tc
  ON tc."tenantId" = l."tenantId" AND tc.id = l."taxCodeId"
WHERE i.status IN ('POSTED','PARTIALLY_PAID','PAID')
  AND (l."taxCodeId" IS NULL OR tc."taxType" = 'SALES_TAX')
GROUP BY i."tenantId", i.id, c.code, l."taxCodeId", tc.code, tc."salesTaxKind", l."taxRate"
UNION ALL
SELECT
  cn."tenantId",
  'CREDIT_NOTE',
  'CN',
  cn.id,
  cn."invoiceId",
  cn.id,
  cn."docNo",
  inv."taxInvoiceNo",
  cn."docDate",
  date_trunc('month', cn."docDate")::date,
  cn."branchId",
  cn."customerId",
  c.code,
  COALESCE(inv."buyerName", c.name),
  COALESCE(inv."buyerNtn", inv."buyerCnic", c.ntn, c.cnic),
  COALESCE(inv."buyerNtn", c.ntn),
  COALESCE(inv."buyerCnic", c.cnic),
  COALESCE(inv."buyerStrn", c.strn),
  (COALESCE(inv."buyerStrn", c.strn) IS NOT NULL),
  l."taxCodeId",
  tc.code,
  tc."salesTaxKind",
  l."taxRate",
  -sum(l."valueAmount"),
  -sum(l."taxAmount"),
  -sum(l."furtherTaxAmount"),
  -sum(l."taxAmount" + l."furtherTaxAmount"),
  -sum(l."totalAmount"),
  cn.status,
  NULL::text,
  NULL::text,
  cn."journalEntryId"
FROM "Sales"."CreditNotes" cn
JOIN "Sales"."CreditNoteLines" l
  ON l."tenantId" = cn."tenantId" AND l."creditNoteId" = cn.id
JOIN "Sales"."Customers" c
  ON c."tenantId" = cn."tenantId" AND c.id = cn."customerId"
LEFT JOIN "Sales"."SalesInvoices" inv
  ON inv."tenantId" = cn."tenantId" AND inv.id = cn."invoiceId"
LEFT JOIN "Tax"."TaxCodes" tc
  ON tc."tenantId" = l."tenantId" AND tc.id = l."taxCodeId"
WHERE cn.status IN ('OPEN','APPLIED')
  AND (l."taxCodeId" IS NULL OR tc."taxType" = 'SALES_TAX')
GROUP BY cn."tenantId", cn.id, inv.id, c.id, l."taxCodeId", tc.code, tc."salesTaxKind", l."taxRate";

COMMENT ON VIEW "Tax"."getSalesTaxOutputRegister" IS
  'Output sales tax register (Annex-C basis): posted invoices (all channels) and posted credit notes (negative) per tax code and rate — buyer, NTN/CNIC, STRN, value excl. tax, sales tax, further tax, FBR invoice no. Screens: app/receivables/ageing (GST Output tab: Invoice / Customer / STRN / Value excl. tax / Rate / Sales Tax / Further Tax); Full also app/tax/sales-tax via Tax.getSalesTaxAnnexC.';

-- =============================================================================
-- FULL EDITION — views below are not in erp-basic.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tax.getSalesTaxAnnexC — live Annex-C: one row per posted invoice / credit
-- note (credit notes negative) of Tax.getSalesTaxOutputRegister, with the return it
-- was frozen into (latest non-REVISED Tax.SalesTaxReturns holding an annex C
-- line for the document) and the FBR digital-invoice submission status.
-- taxRate is NULL when a document mixes rates (tax_codes lists them).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Tax"."getSalesTaxAnnexC"
WITH (security_invoker = true) AS
SELECT
  d.*,
  fz."returnId",
  fz."returnStatus",
  (fz."returnId" IS NOT NULL)              AS "isInReturn",
  fs.status                               AS "fbrSubmissionStatus",
  fs."errorMessage"                        AS "fbrErrorMessage"
FROM (
  SELECT
    o."tenantId",
    o."periodMonth",
    o."docKind",
    o."docType",
    o."docId",
    o."invoiceId",
    o."creditNoteId",
    o."docNo",
    o."taxInvoiceNo",
    o."docDate",
    o."branchId",
    o."customerId",
    o."customerCode",
    o."buyerName",
    o."buyerNtnCnic",
    o."buyerStrn",
    o."isRegistered",
    CASE WHEN count(DISTINCT o."taxRate") = 1 THEN max(o."taxRate") END AS "taxRate",
    string_agg(DISTINCT o."taxCode", ', ')   AS "taxCodes",
    sum(o."valueExclTax")                   AS "valueExclTax",
    sum(o."salesTax")                        AS "salesTax",
    sum(o."furtherTax")                      AS "furtherTax",
    sum(o."totalTax")                        AS "totalTax",
    o."fbrStatus",
    o."fbrInvoiceNo"
  FROM "Tax"."getSalesTaxOutputRegister" o
  GROUP BY o."tenantId", o."periodMonth", o."docKind", o."docType", o."docId", o."invoiceId", o."creditNoteId",
           o."docNo", o."taxInvoiceNo", o."docDate", o."branchId", o."customerId", o."customerCode",
           o."buyerName", o."buyerNtnCnic", o."buyerStrn", o."isRegistered", o."fbrStatus", o."fbrInvoiceNo"
) d
LEFT JOIN LATERAL (
  SELECT r.id AS "returnId", r.status AS "returnStatus"
    FROM "Tax"."SalesTaxReturnLines" al
    JOIN "Tax"."SalesTaxReturns" r ON r."tenantId" = al."tenantId" AND r.id = al."returnId"
   WHERE al."tenantId" = d."tenantId"
     AND al.annex = 'C'
     AND (   (d."creditNoteId" IS NULL     AND al."invoiceId" = d."invoiceId")
          OR (d."creditNoteId" IS NOT NULL AND al."creditNoteId" = d."creditNoteId"))
     AND r.status <> 'REVISED'
   ORDER BY r."revisionNo" DESC
   LIMIT 1
) fz ON true
LEFT JOIN LATERAL (
  SELECT s.status, s."errorMessage"
    FROM "Tax"."FbrInvoiceSubmissions" s
   WHERE s."tenantId" = d."tenantId"
     AND (   (d."creditNoteId" IS NULL     AND s."invoiceId" = d."invoiceId")
          OR (d."creditNoteId" IS NOT NULL AND s."creditNoteId" = d."creditNoteId"))
   LIMIT 1
) fs ON true;

COMMENT ON VIEW "Tax"."getSalesTaxAnnexC" IS
  'Live Annex-C of the sales tax return: per posted invoice / credit note — buyer, NTN/CNIC, STRN, registered flag, value excl. tax, sales tax, further tax, return it is frozen in, FBR submission status. Screen: app/tax/sales-tax (Annex-C tab, KPI Output tax, banner "Further tax applied on n invoices", validation "Digital invoices synced with FBR").';

-- ---------------------------------------------------------------------------
-- Tax.getSalesTaxAnnexA — live Annex-A (input tax): posted bills and posted
-- debit notes (negative) per tax code and rate, plus claimable import sales
-- tax of posted landed-cost shipments not booked through a bill
-- (LandedCostCharges IMPORT_SALES_TAX; value excl. tax derived from the
-- charge rate). matchStatus / isAdmissible come from the frozen annex line
-- once the document is in a return; before that matchStatus is NULL and
-- isAdmissible = supplier has an STRN (customs input is always admissible).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Tax"."getSalesTaxAnnexA"
WITH (security_invoker = true) AS
SELECT
  a.*,
  fz."matchStatus",
  COALESCE(fz."isAdmissible", a."isRegistered") AS "isAdmissible",
  fz."returnId",
  fz."returnStatus",
  (fz."returnId" IS NOT NULL)              AS "isInReturn"
FROM (
  SELECT
    b."tenantId",
    'BILL'::text                          AS "docKind",
    CASE b.channel WHEN 'COUNTER' THEN 'PV' ELSE 'BILL' END AS "docType",
    b.id                                  AS "docId",
    b.id                                  AS "billId",
    NULL::uuid                            AS "debitNoteId",
    NULL::uuid                            AS "landedCostChargeId",
    b."docNo",
    b."vendorInvoiceNo"                   AS "supplierDocNo",
    b."docDate",
    date_trunc('month', b."docDate")::date AS "periodMonth",
    b."branchId",
    b."vendorId",
    v.name                                AS "supplierName",
    COALESCE(v.ntn, v.cnic)               AS "supplierNtnCnic",
    v.strn                                AS "supplierStrn",
    (v.strn IS NOT NULL)                  AS "isRegistered",
    l."taxCodeId",
    tc.code                               AS "taxCode",
    l."taxRate",
    sum(l."netAmount")                     AS "valueExclTax",
    sum(l."taxAmount")                     AS "inputTax"
  FROM "Purchases"."VendorBills" b
  JOIN "Purchases"."VendorBillLines" l ON l."tenantId" = b."tenantId" AND l."billId" = b.id
  JOIN "Purchases"."Vendors" v    ON v."tenantId" = b."tenantId" AND v.id = b."vendorId"
  LEFT JOIN "Tax"."TaxCodes" tc ON tc."tenantId" = l."tenantId" AND tc.id = l."taxCodeId"
  WHERE b.status IN ('POSTED','PARTIALLY_PAID','PAID')
    AND l."taxAmount" > 0
    AND (l."taxCodeId" IS NULL OR tc."taxType" = 'SALES_TAX')
  GROUP BY b."tenantId", b.id, v.id, l."taxCodeId", tc.code, l."taxRate"
  UNION ALL
  SELECT
    d."tenantId",
    'DEBIT_NOTE',
    'DN',
    d.id,
    d."billId",
    d.id,
    NULL::uuid,
    d."docNo",
    ob."vendorInvoiceNo",
    d."docDate",
    date_trunc('month', d."docDate")::date,
    d."branchId",
    d."vendorId",
    v.name,
    COALESCE(v.ntn, v.cnic),
    v.strn,
    (v.strn IS NOT NULL),
    l."taxCodeId",
    tc.code,
    l."taxRate",
    -sum(l."netAmount"),
    -sum(l."taxAmount")
  FROM "Purchases"."DebitNotes" d
  JOIN "Purchases"."DebitNoteLines" l ON l."tenantId" = d."tenantId" AND l."debitNoteId" = d.id
  JOIN "Purchases"."VendorBills" ob           ON ob."tenantId" = d."tenantId" AND ob.id = d."billId"
  JOIN "Purchases"."Vendors" v          ON v."tenantId" = d."tenantId" AND v.id = d."vendorId"
  LEFT JOIN "Tax"."TaxCodes" tc       ON tc."tenantId" = l."tenantId" AND tc.id = l."taxCodeId"
  WHERE d.status IN ('OPEN','APPLIED','REFUNDED')
    AND l."taxAmount" > 0
    AND (l."taxCodeId" IS NULL OR tc."taxType" = 'SALES_TAX')
  GROUP BY d."tenantId", d.id, ob.id, v.id, l."taxCodeId", tc.code, l."taxRate"
  UNION ALL
  SELECT
    s."tenantId",
    'IMPORT',
    'LC',
    s.id,
    NULL::uuid,
    NULL::uuid,
    ch.id,
    s."docNo",
    COALESCE(s."gdNo", s."billOfLadingNo"),
    COALESCE(s."clearedOn", s."docDate"),
    date_trunc('month', COALESCE(s."clearedOn", s."docDate"))::date,
    s."branchId",
    ch."payeeVendorId",
    ch."payeeName",
    COALESCE(pv.ntn, pv.cnic),
    pv.strn,
    true,
    NULL::uuid,
    NULL::text,
    ch."ratePct",
    CASE WHEN ch."ratePct" > 0 THEN round(ch.amount * 100 / ch."ratePct", 2) END,
    ch.amount
  FROM "Purchases"."LandedCostCharges" ch
  JOIN "Purchases"."LandedCostShipments" s ON s."tenantId" = ch."tenantId" AND s.id = ch."shipmentId"
  LEFT JOIN "Purchases"."Vendors" pv         ON pv."tenantId" = ch."tenantId" AND pv.id = ch."payeeVendorId"
  WHERE ch."chargeType" = 'IMPORT_SALES_TAX'
    AND ch."isClaimable"
    AND ch."billId" IS NULL
    AND ch.amount > 0
    AND s.status = 'POSTED'
) a
LEFT JOIN LATERAL (
  SELECT al."matchStatus", al."isAdmissible", r.id AS "returnId", r.status AS "returnStatus"
    FROM "Tax"."SalesTaxReturnLines" al
    JOIN "Tax"."SalesTaxReturns" r ON r."tenantId" = al."tenantId" AND r.id = al."returnId"
   WHERE al."tenantId" = a."tenantId"
     AND al.annex = 'A'
     AND (   (a."docKind" = 'BILL'       AND al."billId" = a."billId" AND al."debitNoteId" IS NULL)
          OR (a."docKind" = 'DEBIT_NOTE' AND al."debitNoteId" = a."debitNoteId"))
     AND al."taxRate" IS NOT DISTINCT FROM a."taxRate"
     AND r.status <> 'REVISED'
   ORDER BY r."revisionNo" DESC
   LIMIT 1
) fz ON true;

COMMENT ON VIEW "Tax"."getSalesTaxAnnexA" IS
  'Live Annex-A of the sales tax return: input tax on posted bills, debit notes (negative) and claimable import sales tax (landed cost) — supplier, STRN, document, value excl. tax, input tax, match status and admissibility (frozen annex line once filed). Screen: app/tax/sales-tax (Annex-A tab, KPI Input tax, banner "purchase invoice not matched", Section 8B check).';

-- ---------------------------------------------------------------------------
-- Tax.getWhtBySection — withholding events (Tax.WhtDeductions, not
-- CANCELLED) per month, direction and section / tax code. taxRate is NULL
-- for slab sections (149) or mixed rates. derived_status: UNPAID /
-- PARTIALLY_PAID / PAID (deducted and collected) or CLAIMED (suffered).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Tax"."getWhtBySection"
WITH (security_invoker = true) AS
SELECT
  wd."tenantId",
  wd."periodMonth",
  wd.direction,
  wd."whtSection",
  wd."taxCodeId",
  tc.code                                 AS "taxCode",
  tc.description                          AS "taxCodeDescription",
  tc."whtNature",
  tc."accountId",
  a.code                                  AS "accountCode",
  a.name                                  AS "accountName",
  count(*)                                AS transactions,
  count(DISTINCT COALESCE(wd."vendorId", wd."customerId", wd."employeeId")) AS parties,
  sum(wd."taxableAmount")                  AS "taxableAmount",
  CASE WHEN min(wd."taxRate") = max(wd."taxRate") AND count(wd."taxRate") = count(*)
       THEN max(wd."taxRate") END          AS "taxRate",
  min(wd."taxRate")                        AS "minRate",
  max(wd."taxRate")                        AS "maxRate",
  sum(wd."taxAmount")                      AS "taxAmount",
  COALESCE(sum(wd."taxAmount") FILTER (WHERE wd.status = 'UNPAID'), 0)  AS "unpaidAmount",
  COALESCE(sum(wd."taxAmount") FILTER (WHERE wd.status = 'PAID'), 0)    AS "paidAmount",
  COALESCE(sum(wd."taxAmount") FILTER (WHERE wd.status = 'CLAIMED'), 0) AS "claimedAmount",
  CASE
    WHEN bool_and(wd.status = 'CLAIMED')                         THEN 'CLAIMED'
    WHEN bool_and(wd.status IN ('PAID','CLAIMED'))               THEN 'PAID'
    WHEN bool_or(wd.status IN ('PAID','CLAIMED'))                THEN 'PARTIALLY_PAID'
    ELSE 'UNPAID'
  END                                     AS "derivedStatus",
  string_agg(DISTINCT wd."sourceDocType", ', ') AS "sourceDocTypes",
  min(wd."deductionDate")                  AS "firstDeductionDate",
  max(wd."deductionDate")                  AS "lastDeductionDate"
FROM "Tax"."WhtDeductions" wd
JOIN "Tax"."TaxCodes" tc
  ON tc."tenantId" = wd."tenantId" AND tc.id = wd."taxCodeId"
LEFT JOIN "Accounting"."ChartOfAccounts" a
  ON a."tenantId" = tc."tenantId" AND a.id = tc."accountId"
WHERE wd.status <> 'CANCELLED'
GROUP BY wd."tenantId", wd."periodMonth", wd.direction, wd."whtSection", wd."taxCodeId",
         tc.code, tc.description, tc."whtNature", tc."accountId", a.code, a.name;

COMMENT ON VIEW "Tax"."getWhtBySection" IS
  'Withholding deducted / collected / suffered per month, section and tax code: transactions, taxable amount, rate, tax, unpaid / paid / claimed split, GL account posted to (2230 / 2231 / 2232). Screen: app/tax/wht (Deductions by section, KPIs Deducted / Due to FBR, Record WHT challan section totals).';
