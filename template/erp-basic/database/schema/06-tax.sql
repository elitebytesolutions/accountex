-- =============================================================================
-- Finsoft ERP (BASIC) — 06-tax.sql
-- Tax codes (sales tax, further tax, withholding, advance-tax collection) and
-- their effective-dated rates.
--
-- Screens (Basic scope):
--   app/tax/codes   src/42-acc-reports.html  "Tax Codes" table + "New tax code" modal
-- Consumers: Sales.SalesInvoiceLines / Purchases.VendorBillLines / receipts / vendor
-- payments carry taxCodeId + a taxRate snapshot (contract §4).
--
-- Cross-module FKs (Accounting.ChartOfAccounts) are added in database/fk/06-tax-fks.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TaxCodes — app/tax/codes. Table columns: Code, Description, Type (Sales tax
-- / Withholding / Collection), Applies to, Rate, Tax account (+ input account
-- for GST-18: "2210 Sales Tax Payable / 1410 Sales Tax Input"), FBR reference,
-- Active. "New tax code" modal: Code *, Description *, Type, Applies to
-- {Vendor payments, Sales invoices, Purchases, Payroll}, Rate %, Rate for
-- non-ATL %, Tax account *, Effective from, FBR legal reference, "Calculate on
-- amount excluding sales tax", "Check vendor ATL status before applying".
-- Chips: All 13 · Sales tax 5 · Withholding 8 · Inactive 1.
-- Prototype codes: GST-18, GST-0, EXEMPT, FT-4, GST-RED, WHT-153A,
-- WHT-153A-NF, WHT-153B, WHT-153C, WHT-149 (Slab), ADV-236G, ADV-236H, WHT-155.
-- Rates live in TaxCodeRates (effective-dated); use Tax.getTaxRateOnDate().
-- ---------------------------------------------------------------------------
CREATE TABLE "Tax"."TaxCodes" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                    text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$' AND length(code) <= 20),  -- GST-18, WHT-153A-NF
  description             text NOT NULL,                                 -- Sales tax — standard rate
  "taxType"                text NOT NULL,
  "appliesTo"              text NOT NULL,
  "rateBasis"              text NOT NULL DEFAULT 'PERCENT',  -- WHT-149 "Slab"; EXEMPT "—"
  "salesTaxKind"          text,
  "whtSection"             text,                                          -- 153(1)(a), 149, 236G — groups the WHT statement
  "whtNature"              text,                                          -- Supply of goods — ATL filers
  "accountId"              uuid,                                          -- Tax account (payable / output): 2210, 2211, 2230 … → Accounting.ChartOfAccounts
  "inputAccountId"        uuid,                                          -- Input / recoverable side: 1410 Sales Tax Input → Accounting.ChartOfAccounts
  "fbrReference"           text,                                          -- Sec 3, STA 1990 · 153(1)(a) ITO 2001
  "calcOnExclSalesTax"  boolean NOT NULL DEFAULT true,                 -- "Calculate on amount excluding sales tax"
  "checkAtl"               boolean NOT NULL DEFAULT false,                -- "Check vendor ATL status before applying"
  "isSystem"               boolean NOT NULL DEFAULT false,                -- seeded from Platform.TemplateTaxCodes
  "isActive"               boolean NOT NULL DEFAULT true,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  "deletedAt"              timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  CONSTRAINT "taxCodeKindChk"     CHECK (("taxType" = 'SALES_TAX') = ("salesTaxKind" IS NOT NULL)),
  CONSTRAINT "taxCodeSectionChk"  CHECK ("taxType" = 'SALES_TAX' OR "whtSection" IS NOT NULL),
  CONSTRAINT "taxCodeAccountChk"  CHECK ("rateBasis" = 'NONE' OR "accountId" IS NOT NULL),     -- EXEMPT: "Not posted"
  CONSTRAINT "taxCodeNoneChk"     CHECK ("rateBasis" <> 'NONE' OR "salesTaxKind" = 'EXEMPT')
);
SELECT "Company"."addStandardTriggers"('"Tax"."TaxCodes"', true);
CREATE INDEX "taxCodeTenantTypeIdx" ON "Tax"."TaxCodes" ("tenantId", "taxType", "isActive") WHERE "deletedAt" IS NULL;
CREATE INDEX "taxCodeTenantSectionIdx" ON "Tax"."TaxCodes" ("tenantId", "whtSection") WHERE "whtSection" IS NOT NULL;
COMMENT ON TABLE "Tax"."TaxCodes" IS
  'Sales tax, further tax, withholding and advance-tax collection codes mapped to GL accounts. Screen: app/tax/codes.';
COMMENT ON COLUMN "Tax"."TaxCodes"."checkAtl" IS
  'When true the posting engine reads the party ATL status and applies TaxCodeRates.nonAtlRate for non-filers.';

-- ---------------------------------------------------------------------------
-- TaxCodeRates — effective-dated rate of a tax code.
-- Screen: app/tax/codes ("Rates effective 01 Jul 2026 (Finance Act 2026)";
-- modal Rate %, Rate for non-ATL %, Effective from; "Check FBR rates").
-- Periods may not overlap (btree_gist exclusion).
-- ---------------------------------------------------------------------------
CREATE TABLE "Tax"."TaxCodeRates" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "taxCodeId"      uuid NOT NULL,
  "effectiveFrom"   date NOT NULL,
  "effectiveTo"     date,                                                  -- NULL = open-ended
  rate             numeric(7,4) CHECK (rate IS NULL OR rate BETWEEN 0 AND 100),          -- 18.0000 / 5.5000 / 0.1000
  "nonAtlRate"     numeric(7,4) CHECK ("nonAtlRate" IS NULL OR "nonAtlRate" BETWEEN 0 AND 100),  -- 11.0000 (double rate)
  "financeAct"      text,                                                  -- Finance Act 2026
  remarks          text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "taxCodeId", "effectiveFrom"),
  FOREIGN KEY ("tenantId", "taxCodeId") REFERENCES "Tax"."TaxCodes" ("tenantId", id),
  CONSTRAINT "taxCodeRatePeriodChk" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "taxCodeRateNoOverlap" EXCLUDE USING gist (
    "tenantId" WITH =,
    "taxCodeId" WITH =,
    daterange("effectiveFrom", "effectiveTo", '[]') WITH &&)
);
SELECT "Company"."addStandardTriggers"('"Tax"."TaxCodeRates"', true);
CREATE INDEX "taxCodeRateLookupIdx" ON "Tax"."TaxCodeRates" ("tenantId", "taxCodeId", "effectiveFrom" DESC);
COMMENT ON TABLE "Tax"."TaxCodeRates" IS
  'Effective-dated rates of a tax code (ATL and non-ATL). NULL rate = slab-based (WHT-149) or not applicable (EXEMPT). Screen: app/tax/codes.';

-- ---------------------------------------------------------------------------
-- Tax.getTaxRateOnDate — the rate of a tax code on a date for a filer / non-filer.
-- Returns NULL for slab / exempt codes or when no rate covers the date.
-- Documents snapshot the result into their own taxRate column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Tax"."getTaxRateOnDate"("pTaxCodeId" uuid, "pDate" date DEFAULT current_date,
                                       "pIsAtl" boolean DEFAULT true)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN "pIsAtl" OR r."nonAtlRate" IS NULL THEN r.rate ELSE r."nonAtlRate" END
    FROM "Tax"."TaxCodeRates" r
   WHERE r."tenantId" = "Company"."getCurrentTenantId"()
     AND r."taxCodeId" = "pTaxCodeId"
     AND r."effectiveFrom" <= "pDate"
     AND (r."effectiveTo" IS NULL OR r."effectiveTo" >= "pDate")
   ORDER BY r."effectiveFrom" DESC
   LIMIT 1
$$;
COMMENT ON FUNCTION "Tax"."getTaxRateOnDate"(uuid, date, boolean) IS
  'Rate (percent) of a tax code on a date; non-ATL rate when pIsAtl is false and one is defined.';
