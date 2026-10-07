-- =============================================================================
-- Finsoft ERP (FULL) — 06-tax.sql
-- Tax codes (sales tax, further tax, withholding, advance-tax collection) and
-- their effective-dated rates.
--
-- Basic part (TaxCodes, TaxCodeRates, Tax.getTaxRateOnDate) is identical to
-- erp-basic/database/schema/06-tax.sql; Full-only tables follow.
--
-- Screens:
--   app/tax/codes      src/42-acc-reports.html  "Tax Codes" table + "New tax code" modal
--   app/tax/sales-tax  src/42-acc-reports.html  "Sales Tax Return" (Annex-A/C, summary, IRIS export)
--   app/tax/wht        src/42-acc-reports.html  "Withholding Tax Statements" (sections, CPR, u/s 165)
--   app/tax/fbr        src/42-acc-reports.html  "FBR Integration" (credentials, sync log)
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

-- =============================================================================
-- FULL EDITION — tables below are not in erp-basic.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SalesTaxReturns — monthly sales tax return (STR) under the Sales Tax Act
-- 1990, filed on FBR IRIS.
-- Screen: app/tax/sales-tax, src/42-acc-reports.html — header "Sales Tax
-- Return — September 2026 · STRN 32-77-8761-234-55 · due 18 Oct 2026",
-- period select (Sep 2026 / Aug 2026 (filed)); KPIs Output tax (Annex-C)
-- "GST 5,841,000 + further tax 74,000", Input tax (Annex-A) "Admissible after
-- 90% cap check", Net sales tax payable, Return status Draft "17 days to due
-- date"; Return summary tab (sales tax @18%, further tax @4%, total output,
-- input on purchases & imports, inadmissible input u/s 8 / 8B, admissible
-- input, carry-forward, net payable; "Section 8B check: input claimed is
-- 67.5% of output tax — within the 90% limit"); Validation checks; Filing
-- history (Period, Filed 15 Sep, Paid, CPR ST20260915-0021-48812);
-- "Export for FBR IRIS" modal (Annex-A, Annex-C, Annex-H quarterly, Format
-- IRIS CSV / Excel, Exclude unmatched input).
-- ---------------------------------------------------------------------------
CREATE TABLE "Tax"."SalesTaxReturns" (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                   text NOT NULL,                                -- Company.getNextDocNo('STR')
  authority                text NOT NULL DEFAULT 'FBR',
  "periodMonth"             date NOT NULL CHECK (extract(day FROM "periodMonth") = 1),   -- 2026-09-01
  "fiscalPeriodId"         uuid,                                         -- → Accounting.FiscalPeriods (fk file)
  "revisionNo"              smallint NOT NULL DEFAULT 0 CHECK ("revisionNo" >= 0),
  strn                     text NOT NULL,                                -- snapshot 32-77-8761-234-55
  "dueDate"                 date NOT NULL,                                -- 18 Oct 2026
  "outputTax"               numeric(18,2) NOT NULL DEFAULT 0 CHECK ("outputTax" >= 0),        -- Annex-C sales tax
  "furtherTax"              numeric(18,2) NOT NULL DEFAULT 0 CHECK ("furtherTax" >= 0),       -- 4% to unregistered
  "inputTax"                numeric(18,2) NOT NULL DEFAULT 0 CHECK ("inputTax" >= 0),         -- Annex-A
  "inadmissibleInput"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("inadmissibleInput" >= 0),-- u/s 8 / 8B
  "carryForwardIn"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("carryForwardIn" >= 0),  -- from previous period
  "totalOutputTax"         numeric(18,2) GENERATED ALWAYS AS ("outputTax" + "furtherTax") STORED,
  "admissibleInputTax"     numeric(18,2) GENERATED ALWAYS AS ("inputTax" - "inadmissibleInput") STORED,
  "netPayable"              numeric(18,2) GENERATED ALWAYS AS
                             ("outputTax" + "furtherTax" - ("inputTax" - "inadmissibleInput") - "carryForwardIn") STORED,  -- < 0 = carry forward
  "inputCapPct"            numeric(7,4) NOT NULL DEFAULT 90 CHECK ("inputCapPct" BETWEEN 0 AND 100),  -- section 8B
  "annexCCount"            integer NOT NULL DEFAULT 0 CHECK ("annexCCount" >= 0),
  "annexACount"            integer NOT NULL DEFAULT 0 CHECK ("annexACount" >= 0),
  "includeAnnexH"          boolean NOT NULL DEFAULT false,               -- quarterly stock annex
  "excludeUnmatchedInput"  boolean NOT NULL DEFAULT false,               -- IRIS export option
  status                   text NOT NULL DEFAULT 'DRAFT',
  "irisExportedAt"         timestamptz,
  "irisExportAttachmentId" uuid,                                        -- STR_SEP2026_ALNOOR.zip
  "filedOn"                 date,
  "filedByUserId"         uuid,
  "cprNo"                   text,                                         -- ST20260915-0021-48812
  "paidOn"                  date,
  "paidAmount"              numeric(18,2) CHECK ("paidAmount" IS NULL OR "paidAmount" >= 0),
  "paidFromBankAccountId" uuid,                                        -- → BankCash.BankAccounts (fk file)
  "paymentJournalEntryId" uuid,                                         -- BPV → Accounting.Vouchers (fk file)
  remarks                  text,
  "createdAt"               timestamptz NOT NULL DEFAULT now(),
  "createdBy"               uuid,
  "updatedAt"               timestamptz NOT NULL DEFAULT now(),
  "updatedBy"               uuid,
  "rowVersion"              integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  UNIQUE ("tenantId", authority, "periodMonth", "revisionNo"),
  FOREIGN KEY ("tenantId", "irisExportAttachmentId") REFERENCES "Company"."Attachments" ("tenantId", id),
  FOREIGN KEY ("tenantId", "filedByUserId")          REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "salesTaxReturnInadmChk" CHECK ("inadmissibleInput" <= "inputTax"),
  CONSTRAINT "salesTaxReturnFiledChk" CHECK (status NOT IN ('FILED','PAID') OR "filedOn" IS NOT NULL),
  CONSTRAINT "salesTaxReturnPaidChk"  CHECK (status <> 'PAID' OR ("cprNo" IS NOT NULL AND "paidOn" IS NOT NULL AND "paidAmount" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Tax"."SalesTaxReturns"', true);
CREATE INDEX "salesTaxReturnTenantPeriodIdx" ON "Tax"."SalesTaxReturns" ("tenantId", "periodMonth" DESC);
CREATE UNIQUE INDEX "salesTaxReturnCprUq" ON "Tax"."SalesTaxReturns" ("tenantId", "cprNo") WHERE "cprNo" IS NOT NULL;
COMMENT ON TABLE "Tax"."SalesTaxReturns" IS
  'Monthly sales tax return snapshot (output / further / input tax, 8B cap, CPR payment, IRIS export). Screen: app/tax/sales-tax.';

-- ---------------------------------------------------------------------------
-- SalesTaxReturnLines — the frozen annex rows of a return.
-- Annex-C (sales): Buyer, NTN / CNIC, Invoice, Date, Value excl. tax, Sales
-- tax 18%, Further tax; "Unregistered" badge; summary rows "Other registered
-- buyers (142 invoices)". Annex-A (purchases): Supplier, STRN, Document
-- (BILL-2026-000188 or "Utility bill · Sep"), Date, Value excl. tax, Input
-- tax, Match (Matched / Unmatched). Annex-H (stock, quarterly): item,
-- quantities and value.
-- ---------------------------------------------------------------------------
CREATE TABLE "Tax"."SalesTaxReturnLines" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "returnId"          uuid NOT NULL,
  annex              char(1) NOT NULL,
  "lineNo"            integer NOT NULL CHECK ("lineNo" > 0),
  -- party (A / C)
  "customerId"        uuid,                                               -- → Sales.Customers (fk file)
  "vendorId"          uuid,                                               -- → Purchases.Vendors (fk file)
  "partyName"         text,
  "partyNtnCnic"     text,                                               -- 0786543-2 / 35202-4417823-1
  "partyStrn"         text,
  "isRegistered"      boolean,                                            -- false → further tax
  -- document (A / C)
  "invoiceId"         uuid,                                               -- → Sales.SalesInvoices (fk file)
  "creditNoteId"     uuid,                                               -- → Sales.CreditNotes (fk file)
  "billId"            uuid,                                               -- → Purchases.VendorBills (fk file)
  "debitNoteId"      uuid,                                               -- → Purchases.DebitNotes (fk file)
  "documentNo"        text,                                               -- INV-2026-000301 / "Utility bill · Sep"
  "documentDate"      date,
  "taxCodeId"        uuid,
  "taxRate"           numeric(7,4),
  "valueExclTax"     numeric(18,2),
  "salesTax"          numeric(18,2),                                      -- sales tax (C) or input tax (A)
  "furtherTax"        numeric(18,2) NOT NULL DEFAULT 0 CHECK ("furtherTax" >= 0),
  "matchStatus"       text,   -- Annex-A vs supplier's Annex-C
  "isAdmissible"      boolean NOT NULL DEFAULT true,
  -- stock (H)
  "itemId"            uuid,                                               -- → Inventory.Products (fk file)
  "hsCode"            text,
  "openingQty"        numeric(18,3),
  "purchasedQty"      numeric(18,3),
  "soldQty"           numeric(18,3),
  "closingQty"        numeric(18,3),
  "closingValue"      numeric(18,2),
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "returnId", annex, "lineNo"),
  FOREIGN KEY ("tenantId", "returnId")   REFERENCES "Tax"."SalesTaxReturns" ("tenantId", id),
  FOREIGN KEY ("tenantId", "taxCodeId") REFERENCES "Tax"."TaxCodes" ("tenantId", id),
  CONSTRAINT "salesTaxAnnexLineCChk" CHECK (annex <> 'C' OR ("vendorId" IS NULL AND "billId" IS NULL AND "debitNoteId" IS NULL
                                               AND "valueExclTax" IS NOT NULL AND "salesTax" IS NOT NULL AND "matchStatus" IS NULL)),
  CONSTRAINT "salesTaxAnnexLineAChk" CHECK (annex <> 'A' OR ("customerId" IS NULL AND "invoiceId" IS NULL AND "creditNoteId" IS NULL
                                               AND "valueExclTax" IS NOT NULL AND "salesTax" IS NOT NULL AND "furtherTax" = 0
                                               AND "matchStatus" IS NOT NULL)),
  CONSTRAINT "salesTaxAnnexLineHChk" CHECK (annex <> 'H' OR ("itemId" IS NOT NULL AND "closingQty" IS NOT NULL)),
  CONSTRAINT "salesTaxAnnexLineDocChk" CHECK (num_nonnulls("invoiceId", "creditNoteId", "billId", "debitNoteId") <= 1)
);
SELECT "Company"."addStandardTriggers"('"Tax"."SalesTaxReturnLines"', true);
CREATE INDEX "salesTaxAnnexLineTenantReturnIdx" ON "Tax"."SalesTaxReturnLines" ("tenantId", "returnId", annex);
CREATE INDEX "salesTaxAnnexLineUnmatchedIdx"     ON "Tax"."SalesTaxReturnLines" ("tenantId", "returnId") WHERE "matchStatus" = 'UNMATCHED';
COMMENT ON TABLE "Tax"."SalesTaxReturnLines" IS
  'Frozen Annex-A (purchases, with supplier match), Annex-C (sales, with further tax) and Annex-H (stock) rows of a sales tax return. Live pre-filing figures come from Tax.getSalesTaxAnnexA / _c. Screen: app/tax/sales-tax.';

-- ---------------------------------------------------------------------------
-- WhtChallans — a WHT challan paid to FBR (CPR).
-- Screen: app/tax/wht "Challans (CPR)" (CPR number IT20260915-0042-77812 +
-- sections "153 · 236G/H", Period, Paid on, Bank, Amount; "Deposited Q1 to
-- date") and "Record WHT challan" modal (Period, Sections "153 · 236G/H (Rs
-- 1,391,400)" / "149 salary", CPR number *, Payment date, Paid from, Amount;
-- toast "Challan recorded and BPV created").
-- ---------------------------------------------------------------------------
CREATE TABLE "Tax"."WhtChallans" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"             text NOT NULL,                                      -- Company.getNextDocNo('WHT')
  "cprNo"             text NOT NULL,                                      -- IT20260915-0042-77812
  "periodMonth"       date NOT NULL CHECK (extract(day FROM "periodMonth") = 1),
  sections           text[] NOT NULL CHECK (cardinality(sections) > 0),  -- {153,236G,236H} / {149}
  "paymentDate"       date NOT NULL,
  "bankAccountId"    uuid NOT NULL,                                      -- Paid from → BankCash.BankAccounts (fk file)
  amount             numeric(18,2) NOT NULL CHECK (amount > 0),
  status             text NOT NULL DEFAULT 'PAID',
  "journalEntryId"   uuid,                                               -- BPV Dr 2230/2231/2232 · Cr bank → Accounting.Vouchers (fk file)
  remarks            text,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  UNIQUE ("tenantId", "cprNo"),
  CONSTRAINT "whtPaymentPostedChk" CHECK (status <> 'PAID' OR "journalEntryId" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Tax"."WhtChallans"', true);
CREATE INDEX "whtPaymentTenantPeriodIdx" ON "Tax"."WhtChallans" ("tenantId", "periodMonth" DESC);
COMMENT ON TABLE "Tax"."WhtChallans" IS
  'WHT challans (CPR) deposited with FBR; settles WhtDeductions rows. Screen: app/tax/wht.';

-- ---------------------------------------------------------------------------
-- WhtCertificates — deduction certificates. ISSUED: we deducted from a
-- vendor / employee ("Deduction certificates" → "14 PDFs"). RECEIVED: a
-- customer withheld from our receipt u/s 153(1)(a) and sent us a certificate
-- (claimed as advance income tax).
-- Screen: app/tax/wht.
-- ---------------------------------------------------------------------------
CREATE TABLE "Tax"."WhtCertificates" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  direction          text NOT NULL,
  "certificateNo"     text NOT NULL,
  "vendorId"          uuid,                                               -- → Purchases.Vendors (fk file)
  "customerId"        uuid,                                               -- → Sales.Customers (fk file)
  "employeeId"        uuid,                                               -- → HumanResources.Employees (fk file)
  "partyName"         text NOT NULL,
  "partyNtnCnic"     text,
  "whtSection"        text NOT NULL,                                      -- 153(1)(a)
  "periodFrom"        date NOT NULL,
  "periodTo"          date NOT NULL,
  "taxableAmount"     numeric(18,2) NOT NULL CHECK ("taxableAmount" >= 0),
  "taxAmount"         numeric(18,2) NOT NULL CHECK ("taxAmount" >= 0),
  "whtPaymentId"     uuid,                                               -- CPR quoted on an issued certificate
  "cprNo"             text,                                               -- CPR quoted on a received certificate
  "issuedOn"          date,
  "receivedOn"        date,
  "attachmentId"      uuid,                                               -- PDF
  status             text NOT NULL DEFAULT 'ISSUED',
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", direction, "certificateNo"),
  FOREIGN KEY ("tenantId", "whtPaymentId") REFERENCES "Tax"."WhtChallans" ("tenantId", id),
  FOREIGN KEY ("tenantId", "attachmentId")  REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "whtCertificatePartyChk"  CHECK (num_nonnulls("vendorId", "customerId", "employeeId") <= 1),
  CONSTRAINT "whtCertificateSideChk"   CHECK ((direction = 'ISSUED' AND "customerId" IS NULL)
                                            OR (direction = 'RECEIVED' AND "vendorId" IS NULL AND "employeeId" IS NULL)),
  CONSTRAINT "whtCertificatePeriodChk" CHECK ("periodTo" >= "periodFrom"),
  CONSTRAINT "whtCertificateDateChk"   CHECK ((direction = 'ISSUED' AND (status = 'DRAFT' OR "issuedOn" IS NOT NULL))
                                            OR (direction = 'RECEIVED' AND "receivedOn" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Tax"."WhtCertificates"', true);
CREATE INDEX "whtCertificateTenantPartyIdx" ON "Tax"."WhtCertificates" ("tenantId", direction, "periodTo" DESC);
COMMENT ON TABLE "Tax"."WhtCertificates" IS
  'WHT certificates issued to deductees and received from customers who withheld u/s 153(1)(a). Screen: app/tax/wht.';

-- ---------------------------------------------------------------------------
-- WhtDeductions — every withholding event, one per source document line.
-- Screen: app/tax/wht "Deductions by section — September 2026" (Section,
-- Nature, Transactions, Taxable amount, Rate, Tax deducted, Status Unpaid;
-- "Posted to 2230 / 2231 / 2232"); KPIs Deducted, Due to FBR by 15 Oct.
-- DEDUCTED = we withheld (153 on vendor payments, 149 salary, 155 rent);
-- COLLECTED = we collected (236G / 236H on sales); SUFFERED = a customer
-- withheld from our receipt (adjustable advance tax).
-- ---------------------------------------------------------------------------
CREATE TABLE "Tax"."WhtDeductions" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  direction          text NOT NULL,
  "deductionDate"     date NOT NULL,
  "periodMonth"       date NOT NULL CHECK (extract(day FROM "periodMonth") = 1),
  "branchId"          uuid,
  "taxCodeId"        uuid NOT NULL,
  "whtSection"        text NOT NULL,                                      -- snapshot 153(1)(a)
  "vendorId"          uuid,                                               -- → Purchases.Vendors (fk file)
  "customerId"        uuid,                                               -- → Sales.Customers (fk file)
  "employeeId"        uuid,                                               -- → HumanResources.Employees (fk file)
  "partyName"         text NOT NULL,
  "partyNtnCnic"     text,
  "isAtl"             boolean,                                            -- ATL status at deduction time
  "sourceDocType"    text REFERENCES "Company"."DocumentTypes"(code),                -- PAY / BILL / INV / RCPT / PRUN
  "sourceDocId"      uuid,
  "taxableAmount"     numeric(18,2) NOT NULL CHECK ("taxableAmount" >= 0),
  "taxRate"           numeric(7,4) CHECK ("taxRate" IS NULL OR "taxRate" BETWEEN 0 AND 100),   -- NULL for slab (149)
  "taxAmount"         numeric(18,2) NOT NULL CHECK ("taxAmount" >= 0),
  "journalEntryId"   uuid,                                               -- → Accounting.Vouchers (fk file)
  "whtPaymentId"     uuid,
  "whtCertificateId" uuid,
  status             text NOT NULL DEFAULT 'UNPAID',
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId")          REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "taxCodeId")        REFERENCES "Tax"."TaxCodes" ("tenantId", id),
  FOREIGN KEY ("tenantId", "whtPaymentId")     REFERENCES "Tax"."WhtChallans" ("tenantId", id),
  FOREIGN KEY ("tenantId", "whtCertificateId") REFERENCES "Tax"."WhtCertificates" ("tenantId", id),
  CONSTRAINT "whtDeductionPartyChk"   CHECK (num_nonnulls("vendorId", "customerId", "employeeId") <= 1),
  CONSTRAINT "whtDeductionSideChk"    CHECK ((direction = 'DEDUCTED' AND "customerId" IS NULL)
                                           OR (direction IN ('COLLECTED','SUFFERED') AND "vendorId" IS NULL AND "employeeId" IS NULL)),
  CONSTRAINT "whtDeductionSourceChk"  CHECK (("sourceDocType" IS NULL) = ("sourceDocId" IS NULL)),
  CONSTRAINT "whtDeductionPaidChk"    CHECK ((status = 'PAID') = ("whtPaymentId" IS NOT NULL)),
  CONSTRAINT "whtDeductionClaimedChk" CHECK (status <> 'CLAIMED' OR direction = 'SUFFERED'),
  CONSTRAINT "whtDeductionSufferedChk" CHECK (direction <> 'SUFFERED' OR status IN ('UNPAID','CLAIMED','CANCELLED'))
);
SELECT "Company"."addStandardTriggers"('"Tax"."WhtDeductions"', true);
CREATE INDEX "whtDeductionTenantPeriodIdx"  ON "Tax"."WhtDeductions" ("tenantId", "periodMonth", "whtSection", status);
CREATE INDEX "whtDeductionTenantSourceIdx"  ON "Tax"."WhtDeductions" ("tenantId", "sourceDocType", "sourceDocId");
CREATE INDEX "whtDeductionTenantPaymentIdx" ON "Tax"."WhtDeductions" ("tenantId", "whtPaymentId") WHERE "whtPaymentId" IS NOT NULL;
CREATE INDEX "whtDeductionTenantVendorIdx"  ON "Tax"."WhtDeductions" ("tenantId", "vendorId", "periodMonth") WHERE "vendorId" IS NOT NULL;
COMMENT ON TABLE "Tax"."WhtDeductions" IS
  'Withholding / collection events per source document (deducted, collected or suffered), settled by a CPR. Screen: app/tax/wht.';
COMMENT ON COLUMN "Tax"."WhtDeductions".status IS
  'UNPAID until a CPR (WhtChallans) settles it → PAID. SUFFERED rows move to CLAIMED when adjusted in the income tax return.';

-- ---------------------------------------------------------------------------
-- WhtStatements — quarterly withholding statements u/s 165 and the annual
-- salary statement u/s 149, filed on IRIS.
-- Screen: app/tax/wht "Quarterly statements u/s 165" (Quarter "Q1 FY 2026-27
-- Jul–Sep 2026", Due date 20 Oct 2026, Tax, Status In preparation / Filed 17
-- Jul); "Annual statement u/s 149 · FY 2025-26 salary · 31 Aug 2026"; KPI
-- "Q1 statement u/s 165 · Due 20 Oct".
-- ---------------------------------------------------------------------------
CREATE TABLE "Tax"."WhtStatements" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "returnType"        text NOT NULL,
  label              text NOT NULL,                                      -- Q1 FY 2026-27
  "fiscalYearId"     uuid,                                               -- → Accounting.FiscalYears (fk file)
  "periodFrom"        date NOT NULL,
  "periodTo"          date NOT NULL,
  "dueDate"           date NOT NULL,
  "taxAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  status             text NOT NULL DEFAULT 'IN_PREPARATION',
  "filedOn"           date,
  "filedByUserId"   uuid,
  "irisReference"     text,
  "attachmentId"      uuid,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "returnType", "periodFrom"),
  FOREIGN KEY ("tenantId", "filedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "attachmentId")    REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "whtReturnPeriodChk" CHECK ("periodTo" >= "periodFrom"),
  CONSTRAINT "whtReturnFiledChk"  CHECK (status = 'IN_PREPARATION' OR "filedOn" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Tax"."WhtStatements"', true);
CREATE INDEX "whtReturnTenantDueIdx" ON "Tax"."WhtStatements" ("tenantId", "dueDate" DESC);
COMMENT ON TABLE "Tax"."WhtStatements" IS
  'WHT statements filed on IRIS: quarterly u/s 165 and annual u/s 149 (salary). Screen: app/tax/wht.';

-- ---------------------------------------------------------------------------
-- FbrSettings — FBR (PRAL) real-time invoice reporting credentials and
-- behaviour, one per tax authority per tenant.
-- Screen: app/tax/fbr "Credentials — Issued by FBR / PRAL · Live":
-- Environment {Production, Sandbox}, POS ID 128734, NTN, STRN (read-only),
-- API security token (password), Branch mapping "All branches → POS 128734";
-- Behaviour: Report invoices on posting, Print FBR QR code on invoices, Block
-- posting if FBR is unreachable; KPIs Connection "Connected · Production ·
-- token valid till 31 Dec 2026", Last sync "09:42 AM · auto every 5 min".
-- The token itself is never stored here: apiTokenSecretRef points into the
-- secret store (KMS / vault); only a hint is kept for display.
-- ---------------------------------------------------------------------------
CREATE TABLE "Tax"."FbrSettings" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  authority              text NOT NULL DEFAULT 'FBR',
  environment            text NOT NULL DEFAULT 'SANDBOX',
  "posId"                 text NOT NULL CHECK ("posId" ~ '^[0-9]{4,10}$'),  -- default POS (128734)
  ntn                    text NOT NULL,                                   -- snapshot of company NTN
  strn                   text,
  "apiTokenSecretRef"   text,                                            -- vault key, never the token
  "apiTokenHint"         text,                                            -- last 4 chars for display
  "tokenExpiresOn"       date,                                            -- "token valid till 31 Dec 2026"
  "reportOnPosting"      boolean NOT NULL DEFAULT true,
  "printQr"               boolean NOT NULL DEFAULT true,
  "blockIfUnreachable"   boolean NOT NULL DEFAULT false,
  "syncIntervalMinutes"  smallint NOT NULL DEFAULT 5 CHECK ("syncIntervalMinutes" BETWEEN 1 AND 1440),
  "connectionStatus"      text NOT NULL DEFAULT 'NOT_CONFIGURED',
  "lastHealthCheckAt"   timestamptz,
  "lastLatencyMs"        integer CHECK ("lastLatencyMs" IS NULL OR "lastLatencyMs" >= 0),   -- 412 ms
  "lastSyncAt"           timestamptz,
  "isActive"              boolean NOT NULL DEFAULT true,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", authority),
  CONSTRAINT "fbrConfigLiveTokenChk" CHECK ("connectionStatus" = 'NOT_CONFIGURED' OR "apiTokenSecretRef" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Tax"."FbrSettings"', true);
COMMENT ON TABLE "Tax"."FbrSettings" IS
  'FBR / PRA real-time invoicing settings per tenant. The API token is held in the secret store (apiTokenSecretRef). Screen: app/tax/fbr.';

-- FbrBranchMappings — "Branch mapping": branch → FBR POS ID (NULL branch =
-- "All branches").
CREATE TABLE "Tax"."FbrBranchMappings" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "fbrConfigId"    uuid NOT NULL,
  "branchId"        uuid,                                                  -- NULL = all branches
  "posId"           text NOT NULL CHECK ("posId" ~ '^[0-9]{4,10}$'),
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "fbrConfigId") REFERENCES "Tax"."FbrSettings" ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId")     REFERENCES "Company"."Branches" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Tax"."FbrBranchMappings"', true);
CREATE UNIQUE INDEX "fbrPosMappingBranchUq" ON "Tax"."FbrBranchMappings" ("tenantId", "fbrConfigId", "branchId") NULLS NOT DISTINCT;
COMMENT ON TABLE "Tax"."FbrBranchMappings" IS
  'Branch → FBR POS ID mapping ("All branches → POS 128734"). Screen: app/tax/fbr.';

-- ---------------------------------------------------------------------------
-- FbrInvoiceSubmissions — one reporting attempt chain of an invoice / credit note /
-- POS sale to FBR.
-- Screen: app/tax/fbr "Invoice sync log" (Time, Invoice INV-2026-000489 /
-- "Draft POS-01-0091" / CN-2026-000021, Buyer, Amount, FBR invoice no.
-- 128734261001094215112, Status Accepted / Failed "Invalid CNIC format" /
-- Pending; chips Failed 1 · Pending 3; "Sync now — 3 pending invoices
-- queued"); app/tax/sales-tax validation "Digital invoices synced with FBR
-- 188 / 188".
-- ---------------------------------------------------------------------------
CREATE TABLE "Tax"."FbrInvoiceSubmissions" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "fbrConfigId"      uuid NOT NULL,
  "invoiceId"         uuid,                                               -- → Sales.SalesInvoices (all channels incl. POS) (fk file)
  "creditNoteId"     uuid,                                               -- → Sales.CreditNotes (fk file)
  "documentNo"        text NOT NULL,                                      -- INV-2026-000489 / POS-01-0091
  "branchId"          uuid,
  "posId"             text NOT NULL,
  "buyerName"         text,
  "buyerNtnCnic"     text,
  amount             numeric(18,2) NOT NULL,
  status             text NOT NULL DEFAULT 'PENDING',
  attempts           smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  "firstSubmittedAt" timestamptz,
  "lastAttemptAt"    timestamptz,
  "nextRetryAt"      timestamptz,
  "fbrInvoiceNo"     text,                                               -- IRN 128734261001094215112
  "qrPayload"         text,
  "responseCode"      text,
  "errorMessage"      text,                                               -- "Invalid CNIC format"
  "latencyMs"         integer CHECK ("latencyMs" IS NULL OR "latencyMs" >= 0),
  "requestPayload"    jsonb,
  "responsePayload"   jsonb,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "fbrConfigId") REFERENCES "Tax"."FbrSettings" ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId")     REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "fbrSubmissionDocChk"      CHECK (num_nonnulls("invoiceId", "creditNoteId") = 1),
  CONSTRAINT "fbrSubmissionAcceptedChk" CHECK ((status = 'ACCEPTED') = ("fbrInvoiceNo" IS NOT NULL)),
  CONSTRAINT "fbrSubmissionFailedChk"   CHECK (status <> 'FAILED' OR "errorMessage" IS NOT NULL),
  CONSTRAINT "fbrSubmissionAttemptChk"  CHECK (status = 'PENDING' OR attempts > 0)
);
SELECT "Company"."addStandardTriggers"('"Tax"."FbrInvoiceSubmissions"');
CREATE INDEX "fbrSubmissionTenantStatusIdx" ON "Tax"."FbrInvoiceSubmissions" ("tenantId", status, "lastAttemptAt" DESC);
CREATE INDEX "fbrSubmissionRetryIdx"         ON "Tax"."FbrInvoiceSubmissions" ("nextRetryAt") WHERE status IN ('PENDING','FAILED');
CREATE UNIQUE INDEX "fbrSubmissionIrnUq"     ON "Tax"."FbrInvoiceSubmissions" ("tenantId", "fbrInvoiceNo") WHERE "fbrInvoiceNo" IS NOT NULL;
CREATE UNIQUE INDEX "fbrSubmissionInvoiceUq" ON "Tax"."FbrInvoiceSubmissions" ("tenantId", "invoiceId") WHERE "invoiceId" IS NOT NULL;
CREATE UNIQUE INDEX "fbrSubmissionCnUq"      ON "Tax"."FbrInvoiceSubmissions" ("tenantId", "creditNoteId") WHERE "creditNoteId" IS NOT NULL;
COMMENT ON TABLE "Tax"."FbrInvoiceSubmissions" IS
  'FBR real-time reporting of each invoice / credit note: IRN, status, retries, request/response. One row per document (retries update it). Screen: app/tax/fbr.';

-- ---------------------------------------------------------------------------
-- FbrConnectionEvents — helper (not in the contract registry): "Connection
-- history" timeline on app/tax/fbr (Health check OK · 412 ms; FBR endpoint
-- timeout (recovered) · 6 invoices retried; Token renewed by Sana Javed) and
-- the "Test connection" button. Append-only.
-- ---------------------------------------------------------------------------
CREATE TABLE "Tax"."FbrConnectionEvents" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "fbrConfigId"    uuid NOT NULL,
  "occurredAt"      timestamptz NOT NULL DEFAULT now(),
  event            text NOT NULL,
  ok               boolean NOT NULL,
  "latencyMs"       integer CHECK ("latencyMs" IS NULL OR "latencyMs" >= 0),
  "retriedCount"    integer CHECK ("retriedCount" IS NULL OR "retriedCount" >= 0),
  "actorUserId"    uuid,
  details          text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "fbrConfigId") REFERENCES "Tax"."FbrSettings" ("tenantId", id),
  FOREIGN KEY ("tenantId", "actorUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Tax"."FbrConnectionEvents"');
CREATE TRIGGER "taxFbrConnectionLogAppendOnly" BEFORE UPDATE OR DELETE ON "Tax"."FbrConnectionEvents"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();
CREATE INDEX "fbrConnectionLogTenantTimeIdx" ON "Tax"."FbrConnectionEvents" ("tenantId", "occurredAt" DESC);
COMMENT ON TABLE "Tax"."FbrConnectionEvents" IS
  'Helper: FBR connection health / token events for the Connection history timeline. Screen: app/tax/fbr.';
