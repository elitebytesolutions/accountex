-- Phase 28 — Tax compliance: numbering (STR returns, WHT challans, WHTC certificates), row history on FBR connection
-- events, the WHT register filled by posting (vendor payments / purchase vouchers DEDUCTED, receipts SUFFERED, sales
-- advance tax COLLECTED), challans paying a period's deductions with a BPV, certificates issued / received / claimed,
-- WHT statements, sales tax returns prepared from posted documents (Annex-C / Annex-A), filed (locks the month) and
-- paid with a BPV, FBR submission queue for credit notes, "Sending enabled" (off by default), SKIPPED / NOT_REPORTED
-- for invoices not reported at go-live, and the opt-in "block posting if FBR is unreachable". Idempotent.
SELECT set_config('app.actorLabel', '304-tax-compliance.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Numbering: STR, WHT (challans), WHTC (deduction certificates) for every company and every new one
-- ---------------------------------------------------------------------------
INSERT INTO "Company"."DocumentTypes" (code, name, module, "tableName", "defaultPrefix", "defaultPattern", "defaultPadding", "defaultResetPolicy", "sortOrder")
VALUES ('WHTC', 'WHT deduction certificate', 'tax', '"Tax"."WhtCertificates"', 'WHTC', '{PREFIX}-{YYYY}-{SEQ5}', 5, 'YEARLY', 90)
ON CONFLICT (code) DO NOTHING;
UPDATE "Company"."DocumentTypes" SET name = 'WHT challan', "tableName" = '"Tax"."WhtChallans"' WHERE code = 'WHT' AND name <> 'WHT challan';

CREATE OR REPLACE FUNCTION "Tax"."seedTaxComplianceDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vN" integer;
BEGIN
  INSERT INTO "Company"."NumberingSeries" ("tenantId", "docType", "branchId", prefix, pattern, padding, "startValue", "resetPolicy", "isActive")
  SELECT "pTenant", d.code, NULL, d."defaultPrefix", d."defaultPattern", d."defaultPadding", 1, d."defaultResetPolicy", true
    FROM "Company"."DocumentTypes" d
   WHERE d.code IN ('STR', 'WHT', 'WHTC')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "Tax"."triggerTenantTaxComplianceDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Tax"."seedTaxComplianceDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsTaxComplianceDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsTaxComplianceDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "Tax"."triggerTenantTaxComplianceDefaults"();

SELECT set_config('app.actorLabel', 'seedTaxComplianceDefaultsFor', false);
SELECT "Tax"."seedTaxComplianceDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '304-tax-compliance.sql', false);

-- ---------------------------------------------------------------------------
-- 2. Row history on FBR connection events (append-only); schema adjustments
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "fbrConnectionEventsAudit" ON "Tax"."FbrConnectionEvents";
CREATE TRIGGER "fbrConnectionEventsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Tax"."FbrConnectionEvents"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- A deduction whose section has no tax code set up is still registered.
ALTER TABLE "Tax"."WhtDeductions" ALTER COLUMN "taxCodeId" DROP NOT NULL;

-- Sending to FBR is off until the company switches it on (credentials entered, going live).
ALTER TABLE "Tax"."FbrSettings" ADD COLUMN IF NOT EXISTS "sendingEnabled" boolean NOT NULL DEFAULT false;

-- Invoices not reported at go-live: SKIPPED submissions / NOT_REPORTED invoices (never attempted).
INSERT INTO "Lookups"."Lookups" ("lookupType", code, label, description, tone, "sortOrder", "isActive", "isSystem")
SELECT x.t, x.c, x.l, x.d, x.tone, x.s, true, true
  FROM (VALUES ('FbrInvoiceSubmissionStatus', 'SKIPPED', 'Not reported', 'Marked as not reported to FBR (before go-live)', 'neutral', 40),
               ('FbrStatus', 'NOT_REPORTED', 'Not reported', 'Posted before FBR reporting went live; not reported', 'neutral', 50)) x(t, c, l, d, tone, s)
 WHERE NOT EXISTS (SELECT 1 FROM "Lookups"."Lookups" l WHERE l."lookupType" = x.t AND l.code = x.c AND l."tenantId" IS NULL);

ALTER TABLE "Tax"."FbrInvoiceSubmissions" DROP CONSTRAINT IF EXISTS "fbrSubmissionAttemptChk";
ALTER TABLE "Tax"."FbrInvoiceSubmissions" ADD CONSTRAINT "fbrSubmissionAttemptChk" CHECK (status IN ('PENDING', 'SKIPPED') OR attempts > 0);

-- A challan starts as a draft; paying it (whtChallanPay) posts the BPV and marks it PAID.
ALTER TABLE "Tax"."WhtChallans" ALTER COLUMN status SET DEFAULT 'DRAFT';

-- Challan numbers from the WHT series when the app doesn't give one.
CREATE OR REPLACE FUNCTION "Tax"."triggerWhtChallanDocNo"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF NEW."docNo" IS NULL OR NEW."docNo" = '' THEN
    NEW."docNo" := "Company"."getNextDocNo"('WHT', COALESCE(NEW."paymentDate", current_date), NULL);
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "whtChallansDocNo" ON "Tax"."WhtChallans";
CREATE TRIGGER "whtChallansDocNo" BEFORE INSERT ON "Tax"."WhtChallans"
  FOR EACH ROW EXECUTE FUNCTION "Tax"."triggerWhtChallanDocNo"();

-- ---------------------------------------------------------------------------
-- 3. WHT register: one row per tax deducted / collected / suffered, written when documents post
-- ---------------------------------------------------------------------------
-- The tax code for a section (WITHHOLDING for deducted / suffered, COLLECTION for collected); NULL when none is set up.
CREATE OR REPLACE FUNCTION "Tax"."whtTaxCodeFor"("pTenant" uuid, "pSection" text, "pDirection" text)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT tc.id
    FROM "Tax"."TaxCodes" tc
   WHERE tc."tenantId" = "pTenant" AND tc."isActive" AND tc."deletedAt" IS NULL
     AND tc."taxType" = CASE WHEN "pDirection" = 'COLLECTED' THEN 'COLLECTION' ELSE 'WITHHOLDING' END
     AND ("pSection" IS NULL OR tc."whtSection" = "pSection" OR "pSection" LIKE tc."whtSection" || '%')
   ORDER BY (tc."whtSection" = "pSection") DESC NULLS LAST, tc."isSystem" DESC, tc.code
   LIMIT 1
$function$;

-- Registers a deduction (also the entry point for payroll u/s 149, Phase 32). One live row per source document and
-- direction: a second call for the same source returns the existing row.
CREATE OR REPLACE FUNCTION "Tax"."whtRegister"("pTenant" uuid, "pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vDir"     text := "pData" ->> 'direction';
  "vSection" text := COALESCE(NULLIF("pData" ->> 'whtSection', ''), CASE WHEN "pData" ->> 'direction' = 'COLLECTED' THEN '236G' ELSE '153_1_A' END);
  "vSrcType" text := NULLIF("pData" ->> 'sourceDocType', '');
  "vSrcId"   uuid := NULLIF("pData" ->> 'sourceDocId', '')::uuid;
  "vDate"    date := ("pData" ->> 'deductionDate')::date;
  "vId"      uuid;
BEGIN
  IF COALESCE(("pData" ->> 'taxAmount')::numeric, 0) <= 0 THEN
    RETURN NULL;
  END IF;
  IF "vSrcId" IS NOT NULL THEN
    SELECT w.id INTO "vId" FROM "Tax"."WhtDeductions" w
     WHERE w."tenantId" = "pTenant" AND w."sourceDocType" = "vSrcType" AND w."sourceDocId" = "vSrcId"
       AND w.direction = "vDir" AND w.status <> 'CANCELLED'
     LIMIT 1;
    IF FOUND THEN
      RETURN "vId";
    END IF;
  END IF;
  INSERT INTO "Tax"."WhtDeductions"
         ("tenantId", direction, "deductionDate", "periodMonth", "branchId", "taxCodeId", "whtSection",
          "vendorId", "customerId", "employeeId", "partyName", "partyNtnCnic", "isAtl", "sourceDocType", "sourceDocId",
          "taxableAmount", "taxRate", "taxAmount", "journalEntryId", status)
  VALUES ("pTenant", "vDir", "vDate", date_trunc('month', "vDate")::date, NULLIF("pData" ->> 'branchId', '')::uuid,
          COALESCE(NULLIF("pData" ->> 'taxCodeId', '')::uuid, "Tax"."whtTaxCodeFor"("pTenant", "vSection", "vDir")), "vSection",
          NULLIF("pData" ->> 'vendorId', '')::uuid, NULLIF("pData" ->> 'customerId', '')::uuid, NULLIF("pData" ->> 'employeeId', '')::uuid,
          "pData" ->> 'partyName', NULLIF("pData" ->> 'partyNtnCnic', ''), ("pData" ->> 'isAtl')::boolean, "vSrcType", "vSrcId",
          GREATEST(COALESCE(("pData" ->> 'taxableAmount')::numeric, 0), 0), NULLIF("pData" ->> 'taxRate', '')::numeric,
          ("pData" ->> 'taxAmount')::numeric, NULLIF("pData" ->> 'journalEntryId', '')::uuid, 'UNPAID')
  RETURNING id INTO "vId";
  RETURN "vId";
END $function$;

-- A voided / cancelled source document cancels its unpaid deductions; a deposited one can't be voided.
CREATE OR REPLACE FUNCTION "Tax"."whtCancelForSource"("pTenant" uuid, "pSourceId" uuid, "pDocNo" text)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM "Tax"."WhtDeductions" w
              WHERE w."tenantId" = "pTenant" AND w."sourceDocId" = "pSourceId" AND w.status IN ('PAID', 'CLAIMED')) THEN
    RAISE EXCEPTION '%: its withholding tax is already deposited with FBR or claimed; cancel the challan / certificate first', "pDocNo"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'WHT_DEDUCTION_PAID';
  END IF;
  UPDATE "Tax"."WhtDeductions" w SET status = 'CANCELLED'
   WHERE w."tenantId" = "pTenant" AND w."sourceDocId" = "pSourceId" AND w.status = 'UNPAID';
END $function$;

-- Vendor payments: tax withheld at payment (WITHHOLD_NOW) is DEDUCTED when the payment's journal is created.
CREATE OR REPLACE FUNCTION "Tax"."triggerVendorPaymentWht"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vWht" numeric(18,2);
  "vV"   record;
BEGIN
  IF NEW.status = 'VOID' AND OLD.status <> 'VOID' THEN
    PERFORM "Tax"."whtCancelForSource"(NEW."tenantId", NEW.id, NEW."docNo");
    RETURN NEW;
  END IF;
  IF OLD."journalEntryId" IS NULL AND NEW."journalEntryId" IS NOT NULL AND NEW."whtTreatment" = 'WITHHOLD_NOW' THEN
    SELECT COALESCE(sum(a."whtAmount"), 0) INTO "vWht" FROM "Purchases"."VendorPaymentAllocations" a
     WHERE a."tenantId" = NEW."tenantId" AND a."vendorPaymentId" = NEW.id AND NOT a."isReversed";
    IF "vWht" > 0 THEN
      SELECT v.name, COALESCE(v.ntn, v.cnic) AS tid, v."atlStatus" = 'ACTIVE' AS atl, v."defaultWhtSection" AS sec INTO "vV"
        FROM "Purchases"."Vendors" v WHERE v."tenantId" = NEW."tenantId" AND v.id = NEW."vendorId";
      PERFORM "Tax"."whtRegister"(NEW."tenantId", jsonb_build_object(
        'direction', 'DEDUCTED', 'deductionDate', NEW."docDate", 'branchId', NEW."branchId", 'whtSection', COALESCE(NEW."whtSection", "vV".sec),
        'vendorId', NEW."vendorId", 'partyName', "vV".name, 'partyNtnCnic', "vV".tid, 'isAtl', "vV".atl,
        'sourceDocType', 'PAY', 'sourceDocId', NEW.id, 'taxableAmount', round((NEW.amount + "vWht") * COALESCE(NULLIF(NEW."fxRate", 0), 1), 2),
        'taxRate', NEW."whtRate", 'taxAmount', round("vWht" * COALESCE(NULLIF(NEW."fxRate", 0), 1), 2), 'journalEntryId', NEW."journalEntryId"));
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "vendorPaymentsWht" ON "Purchases"."VendorPayments";
CREATE TRIGGER "vendorPaymentsWht" AFTER UPDATE OF "journalEntryId", status ON "Purchases"."VendorPayments"
  FOR EACH ROW EXECUTE FUNCTION "Tax"."triggerVendorPaymentWht"();

-- Vendor bills / purchase vouchers: WHT withheld on the bill is DEDUCTED when its journal is created.
CREATE OR REPLACE FUNCTION "Tax"."triggerVendorBillWht"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vV"  record;
  "vFx" numeric := COALESCE(NULLIF(NEW."fxRate", 0), 1);
BEGIN
  IF NEW.status = 'VOID' AND OLD.status <> 'VOID' THEN
    PERFORM "Tax"."whtCancelForSource"(NEW."tenantId", NEW.id, NEW."docNo");
    RETURN NEW;
  END IF;
  IF OLD."journalEntryId" IS NULL AND NEW."journalEntryId" IS NOT NULL AND NEW."whtAmount" > 0 THEN
    SELECT v.name, COALESCE(v.ntn, v.cnic) AS tid, v."atlStatus" = 'ACTIVE' AS atl, v."defaultWhtSection" AS sec INTO "vV"
      FROM "Purchases"."Vendors" v WHERE v."tenantId" = NEW."tenantId" AND v.id = NEW."vendorId";
    PERFORM "Tax"."whtRegister"(NEW."tenantId", jsonb_build_object(
      'direction', 'DEDUCTED', 'deductionDate', NEW."docDate", 'branchId', NEW."branchId", 'whtSection', "vV".sec,
      'vendorId', NEW."vendorId", 'partyName', "vV".name, 'partyNtnCnic', "vV".tid, 'isAtl', "vV".atl,
      'sourceDocType', CASE WHEN NEW.channel = 'COUNTER' THEN 'PV' ELSE 'BILL' END, 'sourceDocId', NEW.id,
      'taxableAmount', round(NEW."netAmount" * "vFx", 2),
      'taxRate', CASE WHEN NEW."netAmount" > 0 THEN round(NEW."whtAmount" / NEW."netAmount" * 100, 2) END,
      'taxAmount', round(NEW."whtAmount" * "vFx", 2), 'journalEntryId', NEW."journalEntryId"));
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "vendorBillsWht" ON "Purchases"."VendorBills";
CREATE TRIGGER "vendorBillsWht" AFTER UPDATE OF "journalEntryId", status ON "Purchases"."VendorBills"
  FOR EACH ROW EXECUTE FUNCTION "Tax"."triggerVendorBillWht"();

-- Customer receipts: tax the customer withheld from us is SUFFERED (claimed later against their certificate).
CREATE OR REPLACE FUNCTION "Tax"."triggerCustomerReceiptWht"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vC"  record;
  "vFx" numeric := COALESCE(NULLIF(NEW."fxRate", 0), 1);
BEGIN
  IF OLD."journalEntryId" IS NULL AND NEW."journalEntryId" IS NOT NULL AND NEW."whtAmount" > 0 THEN
    SELECT COALESCE(c."displayName", c.name) AS name, COALESCE(c.ntn, c.cnic) AS tid, c."atlStatus" = 'ACTIVE' AS atl INTO "vC"
      FROM "Sales"."Customers" c WHERE c."tenantId" = NEW."tenantId" AND c.id = NEW."customerId";
    PERFORM "Tax"."whtRegister"(NEW."tenantId", jsonb_build_object(
      'direction', 'SUFFERED', 'deductionDate', NEW."docDate", 'branchId', NEW."branchId", 'whtSection', NEW."whtSection",
      'customerId', NEW."customerId", 'partyName', "vC".name, 'partyNtnCnic', "vC".tid, 'isAtl', "vC".atl,
      'sourceDocType', 'RCPT', 'sourceDocId', NEW.id, 'taxableAmount', round((NEW."amountReceived" + NEW."whtAmount") * "vFx", 2),
      'taxAmount', round(NEW."whtAmount" * "vFx", 2), 'journalEntryId', NEW."journalEntryId"));
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "customerReceiptsWht" ON "Sales"."CustomerReceipts";
CREATE TRIGGER "customerReceiptsWht" AFTER UPDATE OF "journalEntryId" ON "Sales"."CustomerReceipts"
  FOR EACH ROW EXECUTE FUNCTION "Tax"."triggerCustomerReceiptWht"();

-- Sales invoices: advance tax u/s 236G / 236H is COLLECTED. salesInvoicePostEntries registers it when a COLLECTION
-- tax code exists; this catches the rest once the invoice is posted, and cancels unpaid rows when it is voided.
CREATE OR REPLACE FUNCTION "Tax"."triggerSalesInvoiceWht"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vC"    record;
  "vFx"   numeric := COALESCE(NULLIF(NEW."fxRate", 0), 1);
  "vType" text := split_part(NEW."docNo", '-', 1);
BEGIN
  IF NEW.status = 'VOID' AND OLD.status <> 'VOID' THEN
    PERFORM "Tax"."whtCancelForSource"(NEW."tenantId", NEW.id, NEW."docNo");
    RETURN NEW;
  END IF;
  IF OLD.status = 'DRAFT' AND NEW.status IN ('POSTED', 'PARTIALLY_PAID', 'PAID') AND NEW."advanceTaxAmount" > 0
     AND NOT EXISTS (SELECT 1 FROM "Tax"."WhtDeductions" w
                      WHERE w."tenantId" = NEW."tenantId" AND w."sourceDocId" = NEW.id AND w.direction = 'COLLECTED' AND w.status <> 'CANCELLED') THEN
    SELECT c."atlStatus" = 'ACTIVE' AS atl INTO "vC" FROM "Sales"."Customers" c WHERE c."tenantId" = NEW."tenantId" AND c.id = NEW."customerId";
    PERFORM "Tax"."whtRegister"(NEW."tenantId", jsonb_build_object(
      'direction', 'COLLECTED', 'deductionDate', NEW."docDate", 'branchId', NEW."branchId", 'whtSection', '236G',
      'customerId', NEW."customerId", 'partyName', NEW."buyerName", 'partyNtnCnic', COALESCE(NEW."buyerNtn", NEW."buyerCnic"), 'isAtl', "vC".atl,
      'sourceDocType', CASE WHEN EXISTS (SELECT 1 FROM "Company"."DocumentTypes" d WHERE d.code = "vType") THEN "vType" ELSE 'INV' END,
      'sourceDocId', NEW.id, 'taxableAmount', round((NEW."netAmount" - NEW."advanceTaxAmount") * "vFx", 2), 'taxRate', NEW."advanceTaxRate",
      'taxAmount', round(NEW."advanceTaxAmount" * "vFx", 2), 'journalEntryId', NEW."journalEntryId"));
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "salesInvoicesWht" ON "Sales"."SalesInvoices";
CREATE TRIGGER "salesInvoicesWht" AFTER UPDATE OF status ON "Sales"."SalesInvoices"
  FOR EACH ROW EXECUTE FUNCTION "Tax"."triggerSalesInvoiceWht"();

-- Backfill: documents posted before this phase
SELECT set_config('app.actorLabel', 'whtRegister backfill', false);
SELECT "Tax"."whtRegister"(p."tenantId", jsonb_build_object(
         'direction', 'DEDUCTED', 'deductionDate', p."docDate", 'branchId', p."branchId", 'whtSection', COALESCE(p."whtSection", v."defaultWhtSection"),
         'vendorId', p."vendorId", 'partyName', v.name, 'partyNtnCnic', COALESCE(v.ntn, v.cnic), 'isAtl', v."atlStatus" = 'ACTIVE',
         'sourceDocType', 'PAY', 'sourceDocId', p.id, 'taxableAmount', round((p.amount + a.wht) * COALESCE(NULLIF(p."fxRate", 0), 1), 2),
         'taxRate', p."whtRate", 'taxAmount', round(a.wht * COALESCE(NULLIF(p."fxRate", 0), 1), 2), 'journalEntryId', p."journalEntryId"))
  FROM "Purchases"."VendorPayments" p
  JOIN "Purchases"."Vendors" v ON v."tenantId" = p."tenantId" AND v.id = p."vendorId"
  JOIN LATERAL (SELECT COALESCE(sum(x."whtAmount"), 0) AS wht FROM "Purchases"."VendorPaymentAllocations" x
                 WHERE x."tenantId" = p."tenantId" AND x."vendorPaymentId" = p.id AND NOT x."isReversed") a ON true
 WHERE p."journalEntryId" IS NOT NULL AND p.status <> 'VOID' AND p."whtTreatment" = 'WITHHOLD_NOW' AND a.wht > 0;
SELECT "Tax"."whtRegister"(b."tenantId", jsonb_build_object(
         'direction', 'DEDUCTED', 'deductionDate', b."docDate", 'branchId', b."branchId", 'whtSection', v."defaultWhtSection",
         'vendorId', b."vendorId", 'partyName', v.name, 'partyNtnCnic', COALESCE(v.ntn, v.cnic), 'isAtl', v."atlStatus" = 'ACTIVE',
         'sourceDocType', CASE WHEN b.channel = 'COUNTER' THEN 'PV' ELSE 'BILL' END, 'sourceDocId', b.id,
         'taxableAmount', round(b."netAmount" * COALESCE(NULLIF(b."fxRate", 0), 1), 2),
         'taxRate', CASE WHEN b."netAmount" > 0 THEN round(b."whtAmount" / b."netAmount" * 100, 2) END,
         'taxAmount', round(b."whtAmount" * COALESCE(NULLIF(b."fxRate", 0), 1), 2), 'journalEntryId', b."journalEntryId"))
  FROM "Purchases"."VendorBills" b
  JOIN "Purchases"."Vendors" v ON v."tenantId" = b."tenantId" AND v.id = b."vendorId"
 WHERE b."journalEntryId" IS NOT NULL AND b.status <> 'VOID' AND b."whtAmount" > 0;
SELECT "Tax"."whtRegister"(r."tenantId", jsonb_build_object(
         'direction', 'SUFFERED', 'deductionDate', r."docDate", 'branchId', r."branchId", 'whtSection', r."whtSection",
         'customerId', r."customerId", 'partyName', COALESCE(c."displayName", c.name), 'partyNtnCnic', COALESCE(c.ntn, c.cnic), 'isAtl', c."atlStatus" = 'ACTIVE',
         'sourceDocType', 'RCPT', 'sourceDocId', r.id, 'taxableAmount', round((r."amountReceived" + r."whtAmount") * COALESCE(NULLIF(r."fxRate", 0), 1), 2),
         'taxAmount', round(r."whtAmount" * COALESCE(NULLIF(r."fxRate", 0), 1), 2), 'journalEntryId', r."journalEntryId"))
  FROM "Sales"."CustomerReceipts" r
  JOIN "Sales"."Customers" c ON c."tenantId" = r."tenantId" AND c.id = r."customerId"
 WHERE r."journalEntryId" IS NOT NULL AND r.status <> 'VOID' AND r."whtAmount" > 0;
SELECT "Tax"."whtRegister"(i."tenantId", jsonb_build_object(
         'direction', 'COLLECTED', 'deductionDate', i."docDate", 'branchId', i."branchId", 'whtSection', '236G',
         'customerId', i."customerId", 'partyName', i."buyerName", 'partyNtnCnic', COALESCE(i."buyerNtn", i."buyerCnic"), 'isAtl', c."atlStatus" = 'ACTIVE',
         'sourceDocType', CASE WHEN EXISTS (SELECT 1 FROM "Company"."DocumentTypes" d WHERE d.code = split_part(i."docNo", '-', 1)) THEN split_part(i."docNo", '-', 1) ELSE 'INV' END,
         'sourceDocId', i.id, 'taxableAmount', round((i."netAmount" - i."advanceTaxAmount") * COALESCE(NULLIF(i."fxRate", 0), 1), 2), 'taxRate', i."advanceTaxRate",
         'taxAmount', round(i."advanceTaxAmount" * COALESCE(NULLIF(i."fxRate", 0), 1), 2), 'journalEntryId', i."journalEntryId"))
  FROM "Sales"."SalesInvoices" i
  LEFT JOIN "Sales"."Customers" c ON c."tenantId" = i."tenantId" AND c.id = i."customerId"
 WHERE i.status IN ('POSTED', 'PARTIALLY_PAID', 'PAID') AND i."advanceTaxAmount" > 0
   AND NOT EXISTS (SELECT 1 FROM "Tax"."WhtDeductions" w WHERE w."tenantId" = i."tenantId" AND w."sourceDocId" = i.id AND w.direction = 'COLLECTED' AND w.status <> 'CANCELLED');
SELECT set_config('app.actorLabel', '304-tax-compliance.sql', false);

-- ---------------------------------------------------------------------------
-- 4. WHT challans: pay a period's sections to FBR (BPV: Dr the section's payable, Cr bank)
-- ---------------------------------------------------------------------------
-- The payable account role a deduction sits in.
CREATE OR REPLACE FUNCTION "Tax"."whtPayableRole"("pDirection" text, "pSection" text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
AS $function$
  SELECT CASE
           WHEN "pDirection" = 'COLLECTED' THEN 'ADVANCE_TAX_COLLECTED'
           WHEN "pSection" LIKE '149%' THEN 'SALARY_TAX_PAYABLE'
           WHEN "pSection" LIKE '153%' THEN 'WHT_PAYABLE_153'
           ELSE 'WHT_PAYABLE'
         END
$function$;

CREATE OR REPLACE FUNCTION "Tax"."whtChallanPayEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vC"      "Tax"."WhtChallans";
  "vSum"    numeric(18,2);
  "vLines"  jsonb;
  "vNarr"   text;
  "vJe"     uuid;
BEGIN
  SELECT * INTO "vC" FROM "Tax"."WhtChallans" w WHERE w."tenantId" = "vTenant" AND w.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WHT challan % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  SELECT COALESCE(sum(d."taxAmount"), 0) INTO "vSum"
    FROM "Tax"."WhtDeductions" d
   WHERE d."tenantId" = "vTenant" AND d.status = 'UNPAID' AND d.direction IN ('DEDUCTED', 'COLLECTED')
     AND d."periodMonth" = "vC"."periodMonth" AND d."whtSection" = ANY ("vC".sections);
  IF "vSum" = 0 THEN
    RAISE EXCEPTION 'Challan %: there are no unpaid deductions for % in these sections', "vC"."docNo", to_char("vC"."periodMonth", 'Mon YYYY')
      USING ERRCODE = 'check_violation', HINT = 'WHT_CHALLAN_AMOUNT_MISMATCH';
  END IF;
  IF "vSum" <> "vC".amount THEN
    RAISE EXCEPTION 'Challan %: amount % does not match the unpaid deductions of %', "vC"."docNo", "vC".amount, "vSum"
      USING ERRCODE = 'check_violation', HINT = 'WHT_CHALLAN_AMOUNT_MISMATCH';
  END IF;
  "vNarr" := 'WHT challan ' || "vC"."docNo" || ' · CPR ' || "vC"."cprNo" || ' · ' || to_char("vC"."periodMonth", 'Mon YYYY');
  SELECT jsonb_agg(jsonb_build_object('accountRole', x.role, 'debit', x.amt, 'particulars', 'WHT deposited ' || x.secs))
    INTO "vLines"
    FROM (SELECT "Tax"."whtPayableRole"(d.direction, d."whtSection") AS role, sum(d."taxAmount") AS amt,
                 string_agg(DISTINCT d."whtSection", ', ') AS secs
            FROM "Tax"."WhtDeductions" d
           WHERE d."tenantId" = "vTenant" AND d.status = 'UNPAID' AND d.direction IN ('DEDUCTED', 'COLLECTED')
             AND d."periodMonth" = "vC"."periodMonth" AND d."whtSection" = ANY ("vC".sections)
           GROUP BY 1) x;
  "vLines" := "vLines" || jsonb_build_array(jsonb_build_object(
    'accountId', "Purchases"."getPaymentSourceAccount"(NULL, "vC"."bankAccountId"), 'credit', "vC".amount, 'particulars', "vNarr"));
  "vJe" := "Accounting"."journalCreate"(
    jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vC"."paymentDate", 'narration', "vNarr",
                       'sourceDocType', 'WHT', 'sourceDocId', "pId", 'sourceDocNo', "vC"."docNo", 'partyName', 'FBR'),
    "vLines");
  UPDATE "Tax"."WhtDeductions" d SET status = 'PAID', "whtPaymentId" = "pId"
   WHERE d."tenantId" = "vTenant" AND d.status = 'UNPAID' AND d.direction IN ('DEDUCTED', 'COLLECTED')
     AND d."periodMonth" = "vC"."periodMonth" AND d."whtSection" = ANY ("vC".sections);
  UPDATE "Tax"."WhtChallans" w SET "journalEntryId" = "vJe" WHERE w."tenantId" = "vTenant" AND w.id = "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 5. WHT certificates and statements
-- ---------------------------------------------------------------------------
-- One DRAFT certificate per vendor / employee and section from paid deductions without a certificate. Returns the count.
CREATE OR REPLACE FUNCTION "Tax"."whtCertificateGenerate"("pFrom" date, "pTo" date)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vG"      record;
  "vId"     uuid;
  "vN"      integer := 0;
BEGIN
  FOR "vG" IN
    SELECT d."vendorId", d."employeeId", d."partyName", max(d."partyNtnCnic") AS tid, d."whtSection",
           sum(d."taxableAmount") AS taxable, sum(d."taxAmount") AS tax, array_agg(d.id) AS ids,
           CASE WHEN count(DISTINCT d."whtPaymentId") = 1 THEN min(d."whtPaymentId"::text)::uuid END AS pay
      FROM "Tax"."WhtDeductions" d
     WHERE d."tenantId" = "vTenant" AND d.direction = 'DEDUCTED' AND d.status = 'PAID' AND d."whtCertificateId" IS NULL
       AND d."deductionDate" BETWEEN "pFrom" AND "pTo"
     GROUP BY d."vendorId", d."employeeId", d."partyName", d."whtSection"
  LOOP
    INSERT INTO "Tax"."WhtCertificates" ("tenantId", direction, "certificateNo", "vendorId", "employeeId", "partyName", "partyNtnCnic", "whtSection",
                                         "periodFrom", "periodTo", "taxableAmount", "taxAmount", "whtPaymentId", "cprNo", status)
    VALUES ("vTenant", 'ISSUED', "Company"."getNextDocNo"('WHTC', "pTo", NULL), "vG"."vendorId", "vG"."employeeId", "vG"."partyName", "vG".tid, "vG"."whtSection",
            "pFrom", "pTo", "vG".taxable, "vG".tax, "vG".pay,
            (SELECT c."cprNo" FROM "Tax"."WhtChallans" c WHERE c."tenantId" = "vTenant" AND c.id = "vG".pay), 'DRAFT')
    RETURNING id INTO "vId";
    UPDATE "Tax"."WhtDeductions" d SET "whtCertificateId" = "vId" WHERE d."tenantId" = "vTenant" AND d.id = ANY ("vG".ids);
    "vN" := "vN" + 1;
  END LOOP;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "Tax"."whtCertificateIssue"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Tax"."WhtCertificates";
BEGIN
  SELECT * INTO "vRow" FROM "Tax"."WhtCertificates" c WHERE c."tenantId" = "Company"."getCurrentTenantId"() AND c.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WHT certificate % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".direction <> 'ISSUED' OR "vRow".status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Certificate % is not a draft deduction certificate', "vRow"."certificateNo"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'WHT_CERT_INVALID_STATE';
  END IF;
  UPDATE "Tax"."WhtCertificates" c SET status = 'ISSUED', "issuedOn" = current_date WHERE c.id = "pId";
  RETURN "pId";
END $function$;

-- A certificate received from a customer: links that customer's unpaid SUFFERED deductions of the section and period.
CREATE OR REPLACE FUNCTION "Tax"."whtCertificateReceive"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vCust"   uuid := ("pData" ->> 'customerId')::uuid;
  "vSec"    text := "pData" ->> 'whtSection';
  "vFrom"   date := ("pData" ->> 'periodFrom')::date;
  "vTo"     date := ("pData" ->> 'periodTo')::date;
  "vC"      record;
  "vId"     uuid;
  "vTax"    numeric(18,2);
  "vBase"   numeric(18,2);
BEGIN
  SELECT COALESCE(c."displayName", c.name) AS name, COALESCE(c.ntn, c.cnic) AS tid INTO "vC"
    FROM "Sales"."Customers" c WHERE c."tenantId" = "vTenant" AND c.id = "vCust";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer % not found', "vCust" USING ERRCODE = 'no_data_found';
  END IF;
  SELECT COALESCE(sum(d."taxAmount"), 0), COALESCE(sum(d."taxableAmount"), 0) INTO "vTax", "vBase"
    FROM "Tax"."WhtDeductions" d
   WHERE d."tenantId" = "vTenant" AND d.direction = 'SUFFERED' AND d.status = 'UNPAID' AND d."whtCertificateId" IS NULL
     AND d."customerId" = "vCust" AND d."deductionDate" BETWEEN "vFrom" AND "vTo"
     AND ("vSec" IS NULL OR d."whtSection" IS NOT DISTINCT FROM "vSec");
  INSERT INTO "Tax"."WhtCertificates" ("tenantId", direction, "certificateNo", "customerId", "partyName", "partyNtnCnic", "whtSection",
                                       "periodFrom", "periodTo", "taxableAmount", "taxAmount", "cprNo", "receivedOn", status)
  VALUES ("vTenant", 'RECEIVED', "pData" ->> 'certificateNo', "vCust", "vC".name, "vC".tid, COALESCE("vSec", '153_1_A'),
          "vFrom", "vTo", COALESCE(NULLIF("pData" ->> 'taxableAmount', '')::numeric, "vBase"), COALESCE(NULLIF("pData" ->> 'taxAmount', '')::numeric, "vTax"),
          NULLIF("pData" ->> 'cprNo', ''), COALESCE(NULLIF("pData" ->> 'receivedOn', '')::date, current_date), 'RECEIVED')
  RETURNING id INTO "vId";
  UPDATE "Tax"."WhtDeductions" d SET "whtCertificateId" = "vId"
   WHERE d."tenantId" = "vTenant" AND d.direction = 'SUFFERED' AND d.status = 'UNPAID' AND d."whtCertificateId" IS NULL
     AND d."customerId" = "vCust" AND d."deductionDate" BETWEEN "vFrom" AND "vTo"
     AND ("vSec" IS NULL OR d."whtSection" IS NOT DISTINCT FROM "vSec");
  RETURN "vId";
END $function$;

-- Claim: the received certificate's deductions become CLAIMED (adjustable against our income tax).
CREATE OR REPLACE FUNCTION "Tax"."whtCertificateClaim"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    "Tax"."WhtCertificates";
BEGIN
  SELECT * INTO "vRow" FROM "Tax"."WhtCertificates" c WHERE c."tenantId" = "vTenant" AND c.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WHT certificate % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".direction <> 'RECEIVED' OR "vRow".status <> 'RECEIVED' THEN
    RAISE EXCEPTION 'Certificate % is not a received certificate waiting to be claimed', "vRow"."certificateNo"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'WHT_CERT_INVALID_STATE';
  END IF;
  UPDATE "Tax"."WhtDeductions" d SET status = 'CLAIMED'
   WHERE d."tenantId" = "vTenant" AND d."whtCertificateId" = "pId" AND d.status = 'UNPAID';
  UPDATE "Tax"."WhtCertificates" c SET status = 'CLAIMED' WHERE c.id = "pId";
  UPDATE "Sales"."CustomerReceipts" r SET "whtCertificateStatus" = 'RECEIVED', "whtCertificateNo" = "vRow"."certificateNo", "whtCertificateDate" = "vRow"."receivedOn"
   WHERE r."tenantId" = "vTenant"
     AND r.id IN (SELECT d."sourceDocId" FROM "Tax"."WhtDeductions" d WHERE d."tenantId" = "vTenant" AND d."whtCertificateId" = "pId" AND d."sourceDocType" = 'RCPT');
  RETURN "pId";
END $function$;

-- Statement for a period: tax deducted / collected (149 only for the annual salary statement). Refreshes one in preparation.
CREATE OR REPLACE FUNCTION "Tax"."whtStatementPrepare"("pType" text, "pFrom" date, "pTo" date, "pLabel" text, "pDue" date)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    "Tax"."WhtStatements";
  "vTax"    numeric(18,2);
  "vId"     uuid;
BEGIN
  SELECT COALESCE(sum(d."taxAmount"), 0) INTO "vTax"
    FROM "Tax"."WhtDeductions" d
   WHERE d."tenantId" = "vTenant" AND d.direction IN ('DEDUCTED', 'COLLECTED') AND d.status <> 'CANCELLED'
     AND d."deductionDate" BETWEEN "pFrom" AND "pTo"
     AND (CASE WHEN "pType" = 'ANNUAL_149' THEN d."whtSection" LIKE '149%' ELSE d."whtSection" NOT LIKE '149%' END);
  SELECT * INTO "vRow" FROM "Tax"."WhtStatements" s WHERE s."tenantId" = "vTenant" AND s."returnType" = "pType" AND s."periodFrom" = "pFrom" FOR UPDATE;
  IF FOUND THEN
    IF "vRow".status <> 'IN_PREPARATION' THEN
      RAISE EXCEPTION 'The % statement for this period is already filed', "vRow".label
        USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'WHT_STATEMENT_EXISTS';
    END IF;
    UPDATE "Tax"."WhtStatements" s SET "taxAmount" = "vTax", "periodTo" = "pTo", "dueDate" = "pDue", label = "pLabel" WHERE s.id = "vRow".id;
    RETURN "vRow".id;
  END IF;
  INSERT INTO "Tax"."WhtStatements" ("tenantId", "returnType", label, "fiscalYearId", "periodFrom", "periodTo", "dueDate", "taxAmount", status)
  VALUES ("vTenant", "pType", "pLabel",
          (SELECT fy.id FROM "Accounting"."FiscalYears" fy WHERE fy."tenantId" = "vTenant" AND "pFrom" BETWEEN fy."startDate" AND fy."endDate" LIMIT 1),
          "pFrom", "pTo", "pDue", "vTax", 'IN_PREPARATION')
  RETURNING id INTO "vId";
  RETURN "vId";
END $function$;

CREATE OR REPLACE FUNCTION "Tax"."whtStatementFileEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  UPDATE "Tax"."WhtStatements" s
     SET "filedOn" = COALESCE(s."filedOn", current_date), "filedByUserId" = COALESCE(s."filedByUserId", "Company"."getCurrentUserId"())
   WHERE s."tenantId" = "Company"."getCurrentTenantId"() AND s.id = "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Sales tax returns
-- ---------------------------------------------------------------------------
-- True when the month of pDate has a filed (or paid) return: its tax documents are locked.
CREATE OR REPLACE FUNCTION "Tax"."taxPeriodFiled"("pTenant" uuid, "pDate" date)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM "Tax"."SalesTaxReturns" r
                  WHERE r."tenantId" = "pTenant" AND r."periodMonth" = date_trunc('month', "pDate")::date AND r.status IN ('FILED', 'PAID'))
$function$;

-- Posting or voiding a sales invoice / credit note / vendor bill / debit note dated in a filed month is refused.
CREATE OR REPLACE FUNCTION "Tax"."triggerTaxPeriodLock"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vPre"    text[];
  "vPosted" text[];
  "vVoid"   text;
  "vHit"    boolean;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'SalesInvoices' THEN "vPre" := ARRAY['DRAFT']; "vPosted" := ARRAY['POSTED', 'PARTIALLY_PAID', 'PAID']; "vVoid" := 'VOID';
    WHEN 'CreditNotes'   THEN "vPre" := ARRAY['DRAFT', 'PENDING_APPROVAL']; "vPosted" := ARRAY['OPEN', 'APPLIED']; "vVoid" := 'CANCELLED';
    WHEN 'VendorBills'   THEN "vPre" := ARRAY['DRAFT', 'AWAITING_APPROVAL', 'APPROVED']; "vPosted" := ARRAY['POSTED', 'PARTIALLY_PAID', 'PAID']; "vVoid" := 'VOID';
    WHEN 'DebitNotes'    THEN "vPre" := ARRAY['DRAFT']; "vPosted" := ARRAY['OPEN', 'APPLIED', 'REFUNDED']; "vVoid" := 'VOID';
  END CASE;
  IF TG_OP = 'INSERT' THEN
    "vHit" := NEW.status = ANY ("vPosted");
  ELSE
    "vHit" := (OLD.status = ANY ("vPre") AND NEW.status = ANY ("vPosted"))
           OR (NEW.status = "vVoid" AND OLD.status <> "vVoid" AND NOT (OLD.status = ANY ("vPre")));
  END IF;
  IF "vHit" AND "Tax"."taxPeriodFiled"(NEW."tenantId", NEW."docDate") THEN
    RAISE EXCEPTION '%: the sales tax return for % is filed; documents dated in that month can''t be posted or voided',
                    NEW."docNo", to_char(NEW."docDate", 'Mon YYYY')
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TAX_PERIOD_FILED';
  END IF;
  RETURN NEW;
END $function$;

DO $$
DECLARE
  t text[];
BEGIN
  FOREACH t SLICE 1 IN ARRAY ARRAY[['Sales', 'SalesInvoices'], ['Sales', 'CreditNotes'], ['Purchases', 'VendorBills'], ['Purchases', 'DebitNotes']] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS "taxPeriodLock" ON %I.%I', t[1], t[2]);
    EXECUTE format('CREATE TRIGGER "taxPeriodLock" BEFORE INSERT OR UPDATE OF status ON %I.%I FOR EACH ROW EXECUTE FUNCTION "Tax"."triggerTaxPeriodLock"()', t[1], t[2]);
  END LOOP;
END $$;

-- Prepare (or refresh) the draft return of a month: Annex-C from posted sales invoices (credit notes negative),
-- Annex-A from posted vendor bills (debit notes negative), totals, carry-forward and the input cap (section 8B).
-- Annex-A lines a user flagged UNMATCHED keep their flag across refreshes.
CREATE OR REPLACE FUNCTION "Tax"."salesTaxReturnPrepare"("pPeriod" date, "pAuthority" text DEFAULT 'FBR')
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vMonth"  date := date_trunc('month', "pPeriod")::date;
  "vEnd"    date := (date_trunc('month', "pPeriod") + interval '1 month - 1 day')::date;
  "vRow"    "Tax"."SalesTaxReturns";
  "vId"     uuid;
  "vStrn"   text;
  "vFlags"  jsonb := '[]'::jsonb;
  "vPrev"   record;
  "vCf"     numeric(18,2) := 0;
BEGIN
  SELECT * INTO "vRow" FROM "Tax"."SalesTaxReturns" r
   WHERE r."tenantId" = "vTenant" AND r.authority = "pAuthority" AND r."periodMonth" = "vMonth"
   ORDER BY r."revisionNo" DESC LIMIT 1 FOR UPDATE;
  IF FOUND AND "vRow".status NOT IN ('DRAFT', 'VALIDATED') THEN
    RAISE EXCEPTION 'The % return for % is already %', "pAuthority", to_char("vMonth", 'Mon YYYY'), lower("vRow".status)
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TAX_RETURN_NOT_DRAFT';
  END IF;
  SELECT COALESCE(NULLIF(f.strn, ''), NULLIF(cs.strn, '')) INTO "vStrn"
    FROM (SELECT 1) one
    LEFT JOIN "Tax"."FbrSettings" f ON f."tenantId" = "vTenant" AND f.authority = "pAuthority"
    LEFT JOIN "Company"."CompanySettings" cs ON cs."tenantId" = "vTenant";
  IF "vStrn" IS NULL THEN
    RAISE EXCEPTION 'Enter the company''s sales tax registration number (STRN) in Company settings first'
      USING ERRCODE = 'check_violation', HINT = 'TAX_STRN_MISSING';
  END IF;

  -- carry-forward: excess input of the latest filed return before this month
  SELECT r."netPayable" INTO "vPrev" FROM "Tax"."SalesTaxReturns" r
   WHERE r."tenantId" = "vTenant" AND r.authority = "pAuthority" AND r."periodMonth" < "vMonth" AND r.status IN ('FILED', 'PAID')
   ORDER BY r."periodMonth" DESC, r."revisionNo" DESC LIMIT 1;
  IF FOUND AND "vPrev"."netPayable" < 0 THEN
    "vCf" := -"vPrev"."netPayable";
  END IF;

  IF "vRow".id IS NULL THEN
    INSERT INTO "Tax"."SalesTaxReturns" ("tenantId", "docNo", authority, "periodMonth", "fiscalPeriodId", strn, "dueDate", status)
    VALUES ("vTenant", "Company"."getNextDocNo"('STR', "vMonth", NULL), "pAuthority", "vMonth",
            "Accounting"."getFiscalPeriodForDate"("vTenant", "vMonth", NULL), "vStrn", ("vMonth" + interval '1 month 17 days')::date, 'DRAFT')
    RETURNING * INTO "vRow";
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object('billId', l."billId", 'debitNoteId', l."debitNoteId")), '[]'::jsonb) INTO "vFlags"
      FROM "Tax"."SalesTaxReturnLines" l
     WHERE l."tenantId" = "vTenant" AND l."returnId" = "vRow".id AND l.annex = 'A' AND l."matchStatus" = 'UNMATCHED';
    DELETE FROM "Tax"."SalesTaxReturnLines" l WHERE l."tenantId" = "vTenant" AND l."returnId" = "vRow".id;
  END IF;
  "vId" := "vRow".id;

  -- Annex-C: sales invoices and credit notes
  INSERT INTO "Tax"."SalesTaxReturnLines" ("tenantId", "returnId", annex, "lineNo", "customerId", "partyName", "partyNtnCnic", "partyStrn",
                                           "isRegistered", "invoiceId", "creditNoteId", "documentNo", "documentDate", "taxRate",
                                           "valueExclTax", "salesTax", "furtherTax", "isAdmissible")
  SELECT "vTenant", "vId", 'C', row_number() OVER (ORDER BY x.dt, x.no), x.cust, x.party, x.tid, x.strn, x.reg, x.inv, x.cn, x.no, x.dt,
         CASE WHEN x.val <> 0 THEN round(x.tax / x.val * 100, 2) END, x.val, x.tax, x.ft, true
    FROM (SELECT i."customerId" AS cust, i."buyerName" AS party, COALESCE(i."buyerNtn", i."buyerCnic") AS tid, i."buyerStrn" AS strn,
                 (i."buyerStrn" IS NOT NULL OR COALESCE(c."isSalesTaxRegistered", false)) AS reg, i.id AS inv, NULL::uuid AS cn,
                 i."docNo" AS no, i."docDate" AS dt,
                 round(i."taxableAmount" * COALESCE(NULLIF(i."fxRate", 0), 1), 2) AS val,
                 round(i."taxAmount" * COALESCE(NULLIF(i."fxRate", 0), 1), 2) AS tax,
                 round(i."furtherTaxAmount" * COALESCE(NULLIF(i."fxRate", 0), 1), 2) AS ft
            FROM "Sales"."SalesInvoices" i
            LEFT JOIN "Sales"."Customers" c ON c."tenantId" = i."tenantId" AND c.id = i."customerId"
           WHERE i."tenantId" = "vTenant" AND i.status IN ('POSTED', 'PARTIALLY_PAID', 'PAID')
             AND i."docDate" BETWEEN "vMonth" AND "vEnd" AND (i."taxAmount" > 0 OR i."furtherTaxAmount" > 0)
          UNION ALL
          SELECT n."customerId", COALESCE(c."displayName", c.name), COALESCE(c.ntn, c.cnic), c.strn, COALESCE(c."isSalesTaxRegistered", false) OR c.strn IS NOT NULL,
                 NULL, n.id, n."docNo", n."docDate",
                 -round(n."valueAmount" * COALESCE(NULLIF(n."fxRate", 0), 1), 2),
                 -round(n."taxAmount" * COALESCE(NULLIF(n."fxRate", 0), 1), 2), 0
            FROM "Sales"."CreditNotes" n
            LEFT JOIN "Sales"."Customers" c ON c."tenantId" = n."tenantId" AND c.id = n."customerId"
           WHERE n."tenantId" = "vTenant" AND n.status IN ('OPEN', 'APPLIED')
             AND n."docDate" BETWEEN "vMonth" AND "vEnd" AND n."taxAmount" > 0) x;

  -- Annex-A: vendor bills / purchase vouchers and debit notes
  INSERT INTO "Tax"."SalesTaxReturnLines" ("tenantId", "returnId", annex, "lineNo", "vendorId", "partyName", "partyNtnCnic", "partyStrn",
                                           "isRegistered", "billId", "debitNoteId", "documentNo", "documentDate", "taxRate",
                                           "valueExclTax", "salesTax", "furtherTax", "matchStatus", "isAdmissible")
  SELECT "vTenant", "vId", 'A', row_number() OVER (ORDER BY x.dt, x.no), x.ven, x.party, x.tid, x.strn, x.strn IS NOT NULL, x.bill, x.dn,
         x.no, x.dt, CASE WHEN x.val <> 0 THEN round(x.tax / x.val * 100, 2) END, x.val, x.tax, 0,
         CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements("vFlags") f
                            WHERE (f ->> 'billId')::uuid IS NOT DISTINCT FROM x.bill AND (f ->> 'debitNoteId')::uuid IS NOT DISTINCT FROM x.dn)
              THEN 'UNMATCHED' ELSE 'MATCHED' END,
         true
    FROM (SELECT b."vendorId" AS ven, v.name AS party, COALESCE(v.ntn, v.cnic) AS tid, v.strn, b.id AS bill, NULL::uuid AS dn,
                 COALESCE(b."vendorInvoiceNo", b."docNo") AS no, b."docDate" AS dt,
                 round(b."netAmount" * COALESCE(NULLIF(b."fxRate", 0), 1), 2) AS val,
                 round(b."taxAmount" * COALESCE(NULLIF(b."fxRate", 0), 1), 2) AS tax
            FROM "Purchases"."VendorBills" b
            JOIN "Purchases"."Vendors" v ON v."tenantId" = b."tenantId" AND v.id = b."vendorId"
           WHERE b."tenantId" = "vTenant" AND b.status IN ('POSTED', 'PARTIALLY_PAID', 'PAID')
             AND b."docDate" BETWEEN "vMonth" AND "vEnd" AND b."taxAmount" > 0
          UNION ALL
          SELECT d."vendorId", v.name, COALESCE(v.ntn, v.cnic), v.strn, NULL, d.id, d."docNo", d."docDate",
                 -d."netAmount", -d."taxAmount"
            FROM "Purchases"."DebitNotes" d
            JOIN "Purchases"."Vendors" v ON v."tenantId" = d."tenantId" AND v.id = d."vendorId"
           WHERE d."tenantId" = "vTenant" AND d.status IN ('OPEN', 'APPLIED', 'REFUNDED')
             AND d."docDate" BETWEEN "vMonth" AND "vEnd" AND d."taxAmount" > 0) x;

  UPDATE "Tax"."SalesTaxReturns" r SET "carryForwardIn" = "vCf", status = 'DRAFT', strn = "vStrn" WHERE r.id = "vId";
  PERFORM "Tax"."salesTaxReturnRecalc"("vId");
  RETURN "vId";
END $function$;

-- Totals from the lines: output / further tax (Annex-C), input (Annex-A), inadmissible = unmatched input when excluded
-- + input above the cap (inputCapPct of output tax, section 8B).
CREATE OR REPLACE FUNCTION "Tax"."salesTaxReturnRecalc"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vR"      "Tax"."SalesTaxReturns";
  "vOut"    numeric(18,2);
  "vFt"     numeric(18,2);
  "vIn"     numeric(18,2);
  "vUnm"    numeric(18,2);
  "vCap"    numeric(18,2);
  "vInadm"  numeric(18,2);
  "vC"      integer;
  "vA"      integer;
BEGIN
  SELECT * INTO "vR" FROM "Tax"."SalesTaxReturns" r WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  SELECT GREATEST(COALESCE(sum(l."salesTax") FILTER (WHERE l.annex = 'C'), 0), 0),
         GREATEST(COALESCE(sum(l."furtherTax") FILTER (WHERE l.annex = 'C'), 0), 0),
         GREATEST(COALESCE(sum(l."salesTax") FILTER (WHERE l.annex = 'A'), 0), 0),
         GREATEST(COALESCE(sum(l."salesTax") FILTER (WHERE l.annex = 'A' AND l."matchStatus" = 'UNMATCHED'), 0), 0),
         count(*) FILTER (WHERE l.annex = 'C'), count(*) FILTER (WHERE l.annex = 'A')
    INTO "vOut", "vFt", "vIn", "vUnm", "vC", "vA"
    FROM "Tax"."SalesTaxReturnLines" l WHERE l."tenantId" = "vTenant" AND l."returnId" = "pId";
  "vInadm" := CASE WHEN "vR"."excludeUnmatchedInput" THEN LEAST("vUnm", "vIn") ELSE 0 END;
  "vCap"   := round(("vOut" + "vFt") * "vR"."inputCapPct" / 100, 2);
  "vInadm" := LEAST("vIn", "vInadm" + GREATEST(0, ("vIn" - "vInadm") - "vCap"));
  UPDATE "Tax"."SalesTaxReturnLines" l
     SET "isAdmissible" = NOT ("vR"."excludeUnmatchedInput" AND l."matchStatus" = 'UNMATCHED')
   WHERE l."tenantId" = "vTenant" AND l."returnId" = "pId" AND l.annex = 'A'
     AND l."isAdmissible" IS DISTINCT FROM NOT ("vR"."excludeUnmatchedInput" AND l."matchStatus" = 'UNMATCHED');
  UPDATE "Tax"."SalesTaxReturns" r
     SET "outputTax" = "vOut", "furtherTax" = "vFt", "inputTax" = "vIn", "inadmissibleInput" = "vInadm",
         "annexCCount" = "vC", "annexACount" = "vA"
   WHERE r.id = "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Tax"."salesTaxReturnFileEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  UPDATE "Tax"."SalesTaxReturns" r
     SET "filedOn" = COALESCE(r."filedOn", current_date), "filedByUserId" = COALESCE(r."filedByUserId", "Company"."getCurrentUserId"())
   WHERE r."tenantId" = "Company"."getCurrentTenantId"() AND r.id = "pId";
END $function$;

-- Pay: records the CPR and posts the BPV (Dr output GST + further tax, Cr input GST + bank for the net payable).
CREATE OR REPLACE FUNCTION "Tax"."salesTaxReturnRecordPayment"("pId" uuid, "pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vR" "Tax"."SalesTaxReturns";
BEGIN
  SELECT * INTO "vR" FROM "Tax"."SalesTaxReturns" r WHERE r."tenantId" = "Company"."getCurrentTenantId"() AND r.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales tax return % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vR".status <> 'FILED' THEN
    RAISE EXCEPTION 'Return % must be filed before it is paid', "vR"."docNo"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TAX_RETURN_INVALID_STATE';
  END IF;
  IF "vR"."netPayable" <= 0 THEN
    RAISE EXCEPTION 'Return % has nothing payable (excess input is carried forward)', "vR"."docNo"
      USING ERRCODE = 'check_violation', HINT = 'TAX_PAYMENT_MISMATCH';
  END IF;
  IF ("pData" ->> 'paidAmount')::numeric <> "vR"."netPayable" THEN
    RAISE EXCEPTION 'The amount paid must equal the net sales tax payable (%)', "vR"."netPayable"
      USING ERRCODE = 'check_violation', HINT = 'TAX_PAYMENT_MISMATCH';
  END IF;
  UPDATE "Tax"."SalesTaxReturns" r
     SET "cprNo" = "pData" ->> 'cprNo', "paidOn" = ("pData" ->> 'paidOn')::date, "paidAmount" = ("pData" ->> 'paidAmount')::numeric,
         "paidFromBankAccountId" = ("pData" ->> 'bankAccountId')::uuid
   WHERE r.id = "pId";
  RETURN "Tax"."salesTaxReturnPay"("pId");
END $function$;

CREATE OR REPLACE FUNCTION "Tax"."salesTaxReturnPayEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vR"      "Tax"."SalesTaxReturns";
  "vNarr"   text;
  "vJe"     uuid;
BEGIN
  SELECT * INTO "vR" FROM "Tax"."SalesTaxReturns" r WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  "vNarr" := 'Sales tax ' || to_char("vR"."periodMonth", 'Mon YYYY') || ' · ' || "vR"."docNo" || ' · CPR ' || "vR"."cprNo";
  "vJe" := "Accounting"."journalCreate"(
    jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vR"."paidOn", 'narration', "vNarr",
                       'sourceDocType', 'STR', 'sourceDocId', "pId", 'sourceDocNo', "vR"."docNo", 'partyName', "vR".authority),
    jsonb_build_array(
      jsonb_build_object('accountRole', 'OUTPUT_GST', 'debit', "vR"."outputTax", 'particulars', 'Output tax'),
      jsonb_build_object('accountRole', 'FURTHER_TAX_PAYABLE', 'debit', "vR"."furtherTax", 'particulars', 'Further tax'),
      jsonb_build_object('accountRole', 'INPUT_GST', 'credit', "vR"."admissibleInputTax" + "vR"."carryForwardIn", 'particulars', 'Admissible input tax adjusted'),
      jsonb_build_object('accountId', "Purchases"."getPaymentSourceAccount"(NULL, "vR"."paidFromBankAccountId"), 'credit', "vR"."paidAmount", 'particulars', "vNarr")));
  UPDATE "Tax"."SalesTaxReturns" r SET "paymentJournalEntryId" = "vJe" WHERE r.id = "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 7. FBR: credit notes queued like invoices; opt-in "block posting if FBR is unreachable"
-- ---------------------------------------------------------------------------
-- A posted credit note against an invoice that was queued for FBR is queued too (same settings).
CREATE OR REPLACE FUNCTION "Tax"."triggerCreditNoteFbr"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vSub" record;
BEGIN
  IF OLD.status IN ('DRAFT', 'PENDING_APPROVAL') AND NEW.status IN ('OPEN', 'APPLIED') AND NEW."invoiceId" IS NOT NULL THEN
    SELECT f."fbrConfigId", f."posId", f."branchId", f."buyerName", f."buyerNtnCnic" INTO "vSub"
      FROM "Tax"."FbrInvoiceSubmissions" f
      JOIN "Tax"."FbrSettings" s ON s."tenantId" = f."tenantId" AND s.id = f."fbrConfigId" AND s."isActive" AND s."reportOnPosting"
     WHERE f."tenantId" = NEW."tenantId" AND f."invoiceId" = NEW."invoiceId" AND f.status <> 'SKIPPED';
    IF FOUND THEN
      INSERT INTO "Tax"."FbrInvoiceSubmissions" ("tenantId", "fbrConfigId", "creditNoteId", "documentNo", "branchId", "posId", "buyerName", "buyerNtnCnic", amount, status, attempts)
      SELECT NEW."tenantId", "vSub"."fbrConfigId", NEW.id, NEW."docNo", COALESCE(NEW."branchId", "vSub"."branchId"), "vSub"."posId", "vSub"."buyerName",
             "vSub"."buyerNtnCnic", NEW."totalAmount", 'PENDING', 0
       WHERE NOT EXISTS (SELECT 1 FROM "Tax"."FbrInvoiceSubmissions" f WHERE f."tenantId" = NEW."tenantId" AND f."creditNoteId" = NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "creditNotesFbr" ON "Sales"."CreditNotes";
CREATE TRIGGER "creditNotesFbr" AFTER UPDATE OF status ON "Sales"."CreditNotes"
  FOR EACH ROW EXECUTE FUNCTION "Tax"."triggerCreditNoteFbr"();

-- Only when the company switched on both "Sending enabled" and "Block posting if FBR is unreachable", and the last
-- health check / send failed (DISCONNECTED). With sending off this never blocks.
CREATE OR REPLACE FUNCTION "Tax"."triggerFbrPostingBlock"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF OLD.status = 'DRAFT' AND NEW.status IN ('POSTED', 'PARTIALLY_PAID', 'PAID') AND NEW."submitToFbr"
     AND EXISTS (SELECT 1 FROM "Tax"."FbrSettings" s
                  WHERE s."tenantId" = NEW."tenantId" AND s."isActive" AND s."reportOnPosting" AND s."sendingEnabled"
                    AND s."blockIfUnreachable" AND s."connectionStatus" = 'DISCONNECTED') THEN
    RAISE EXCEPTION '%: FBR is unreachable and the company blocks posting until it is back', NEW."docNo"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'FBR_UNREACHABLE';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "salesInvoicesFbrBlock" ON "Sales"."SalesInvoices";
CREATE TRIGGER "salesInvoicesFbrBlock" BEFORE UPDATE OF status ON "Sales"."SalesInvoices"
  FOR EACH ROW EXECUTE FUNCTION "Tax"."triggerFbrPostingBlock"();

-- ---------------------------------------------------------------------------
-- 8. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('TAX_PERIOD_FILED',             409, 'BUSINESS_RULE', 'TAX', 'The sales tax return for this month is filed; its documents can''t be posted or voided.', 'Posting / voiding a tax document dated in a filed month', true, NULL),
  ('TAX_RETURN_NOT_DRAFT',         409, 'BUSINESS_RULE', 'TAX', 'This return is already filed and can''t be prepared again.', 'Prepare / edit of a filed or paid return', true, NULL),
  ('TAX_RETURN_INVALID_STATE',     409, 'BUSINESS_RULE', 'TAX', 'This return can''t do that in its current status.', 'Validate / file / pay out of order', true, NULL),
  ('TAX_STRN_MISSING',             422, 'VALIDATION',    'TAX', 'Enter the company''s sales tax registration number (STRN) first.', 'Prepare without an STRN', true, NULL),
  ('TAX_PAYMENT_MISMATCH',         422, 'VALIDATION',    'TAX', 'The amount paid must equal the net sales tax payable.', 'Return payment amount differs from net payable', true, NULL),
  ('TAX_CPR_DUPLICATE',            409, 'BUSINESS_RULE', 'TAX', 'This CPR number is already recorded.', 'Duplicate CPR on a return or challan', true, NULL),
  ('WHT_DEDUCTION_LOCKED',         409, 'BUSINESS_RULE', 'TAX', 'Only unpaid deductions entered by hand can be changed or deleted.', 'Edit / delete of a system or paid deduction', true, NULL),
  ('WHT_DEDUCTION_PAID',           409, 'BUSINESS_RULE', 'TAX', 'Its withholding tax is already deposited or claimed; cancel the challan or certificate first.', 'Void of a document whose WHT is in a challan / claimed', true, NULL),
  ('WHT_CHALLAN_AMOUNT_MISMATCH',  422, 'VALIDATION',    'TAX', 'The challan amount must equal the unpaid deductions of its period and sections.', 'Challan amount differs from the deductions it pays', true, NULL),
  ('WHT_CHALLAN_NOT_DRAFT',        409, 'BUSINESS_RULE', 'TAX', 'This challan is already paid or cancelled.', 'Edit / pay / delete of a non-draft challan', true, NULL),
  ('WHT_CHALLAN_CERTIFIED',        409, 'BUSINESS_RULE', 'TAX', 'Certificates were issued against this challan; cancel them first.', 'Cancel of a challan with issued certificates', true, NULL),
  ('WHT_CERT_INVALID_STATE',       409, 'BUSINESS_RULE', 'TAX', 'This certificate can''t do that in its current status.', 'Issue / claim / cancel out of order', true, NULL),
  ('WHT_STATEMENT_EXISTS',         409, 'BUSINESS_RULE', 'TAX', 'The statement for this period is already filed.', 'Prepare of a filed statement', true, NULL),
  ('FBR_NOT_CONNECTED',            422, 'BUSINESS_RULE', 'TAX', 'FBR is not connected: sending is switched off for this company.', 'Sync / test / retry while sending is off', true, NULL),
  ('FBR_NOT_CONFIGURED',           422, 'VALIDATION',    'TAX', 'Enter the POS ID and API token before switching sending on.', 'Enable sending without credentials', true, NULL),
  ('FBR_UNREACHABLE',              409, 'BUSINESS_RULE', 'TAX', 'FBR is unreachable and posting is blocked until it is back.', 'Posting while FBR is down with block-if-unreachable on', true, NULL),
  ('FBR_SUBMISSION_ACCEPTED',      409, 'BUSINESS_RULE', 'TAX', 'FBR already accepted this document.', 'Retry / skip of an accepted submission', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
