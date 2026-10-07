-- =============================================================================
-- Finsoft ERP (BASIC) — views/90-tax-views.sql
-- Tax report views (entities/06-tax.md, entities/08-sales-receivables.md).
--
-- Install order: 00 → 14 schema → fk/* → 90-views (this file) → 91-rls.
-- Every view is  security_invoker = true:  the caller's RLS policy
-- (tenantId = Company.getCurrentTenantId()) applies to every base table read.
--
-- Basic has no return / annex tables (Tax.SalesTaxReturns is Full), so the
-- only Basic tax view is the live sales tax output register built from posted
-- invoices and credit notes and their tax codes.
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
  "Inventory"."taxInvoiceNo",
  cn."docDate",
  date_trunc('month', cn."docDate")::date,
  cn."branchId",
  cn."customerId",
  c.code,
  COALESCE("Inventory"."buyerName", c.name),
  COALESCE("Inventory"."buyerNtn", "Inventory"."buyerCnic", c.ntn, c.cnic),
  COALESCE("Inventory"."buyerNtn", c.ntn),
  COALESCE("Inventory"."buyerCnic", c.cnic),
  COALESCE("Inventory"."buyerStrn", c.strn),
  (COALESCE("Inventory"."buyerStrn", c.strn) IS NOT NULL),
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
  ON "Inventory"."tenantId" = cn."tenantId" AND "Inventory".id = cn."invoiceId"
LEFT JOIN "Tax"."TaxCodes" tc
  ON tc."tenantId" = l."tenantId" AND tc.id = l."taxCodeId"
WHERE cn.status IN ('OPEN','APPLIED')
  AND (l."taxCodeId" IS NULL OR tc."taxType" = 'SALES_TAX')
GROUP BY cn."tenantId", cn.id, "Inventory".id, c.id, l."taxCodeId", tc.code, tc."salesTaxKind", l."taxRate";

COMMENT ON VIEW "Tax"."getSalesTaxOutputRegister" IS
  'Output sales tax register (Annex-C basis): posted invoices (all channels) and posted credit notes (negative) per tax code and rate — buyer, NTN/CNIC, STRN, value excl. tax, sales tax, further tax, FBR invoice no. Screens: app/receivables/ageing (GST Output tab: Invoice / Customer / STRN / Value excl. tax / Rate / Sales Tax / Further Tax); Full also app/tax/sales-tax via Tax.getSalesTaxAnnexC.';
