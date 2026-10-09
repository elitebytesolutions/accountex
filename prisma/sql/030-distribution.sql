-- Phase 26 — Distribution: numbering (LS, RS, RCV, CO); paperwork-only load sheets (dispatch / cancel move no stock:
-- invoices issue stock at posting, decided 2026-10-08); route settlement posting = cash short / over JV (receipts and
-- returns are created by the application through the Phase 24 services before posting); recovery sheet posting =
-- totals of the receipts the application created; commission accrual JV; audit on LoadSheetLines; error codes. Idempotent.
SELECT set_config('app.actorLabel', '030-distribution.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Numbering for every company and every new one
-- ---------------------------------------------------------------------------
INSERT INTO "Company"."DocumentTypes" (code, name, module, "tableName", "defaultPrefix", "defaultPattern", "defaultPadding", "defaultResetPolicy", "isPostingDoc", "sortOrder")
VALUES ('SCM', 'Salesman commission', 'sales', '"Distribution"."SalesmanCommissions"', 'SCM', '{PREFIX}-{YYYY}-{SEQ4}', 4, 'YEARLY', true, 430)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION "Distribution"."seedDistributionOpsDefaultsFor"("pTenant" uuid)
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
   WHERE d.code IN ('LS', 'RS', 'RCV', 'CO', 'GP')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "Distribution"."triggerTenantDistributionOpsDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Distribution"."seedDistributionOpsDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsDistributionOpsDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsDistributionOpsDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerTenantDistributionOpsDefaults"();

SELECT set_config('app.actorLabel', 'seedDistributionOpsDefaultsFor', false);
SELECT "Distribution"."seedDistributionOpsDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '030-distribution.sql', false);

-- ---------------------------------------------------------------------------
-- 2. Load sheets are paperwork: dispatch stamps the run (gate pass) and moves no stock; cancel releases the invoices
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Distribution"."loadSheetDispatchEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vLs"     "Distribution"."LoadSheets";
  "vBad"    text;
BEGIN
  SELECT * INTO "vLs" FROM "Distribution"."LoadSheets" s WHERE s."tenantId" = "vTenant" AND s.id = "pId" FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM "Distribution"."LoadSheetInvoices" li
                  WHERE li."tenantId" = "vTenant" AND li."deliveryRunId" = "pId" AND li."releasedAt" IS NULL) THEN
    RAISE EXCEPTION 'Load sheet % has no invoices', "vLs"."docNo" USING ERRCODE = 'check_violation', HINT = 'LOAD_SHEET_EMPTY';
  END IF;
  SELECT i."docNo" INTO "vBad"
    FROM "Distribution"."LoadSheetInvoices" li
    JOIN "Sales"."SalesInvoices" i ON i."tenantId" = li."tenantId" AND i.id = li."invoiceId"
   WHERE li."tenantId" = "vTenant" AND li."deliveryRunId" = "pId" AND li."releasedAt" IS NULL
     AND i.status NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID')
   LIMIT 1;
  IF "vBad" IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice % on load sheet % is no longer posted; remove it first', "vBad", "vLs"."docNo"
      USING ERRCODE = 'check_violation', HINT = 'LOAD_SHEET_INVOICE_NOT_POSTED';
  END IF;
  UPDATE "Distribution"."LoadSheets" s
     SET "dispatchedAt" = COALESCE(s."dispatchedAt", now()),
         "dispatchedByUserId" = COALESCE(s."dispatchedByUserId", "Company"."getCurrentUserId"()),
         "gatePassNo" = COALESCE(s."gatePassNo", "Company"."getNextDocNo"('GP', s."docDate", s."branchId")),
         "gatePassPrintedAt" = COALESCE(s."gatePassPrintedAt", now()),
         "loadSheetNo" = COALESCE(s."loadSheetNo", s."docNo")
   WHERE s."tenantId" = "vTenant" AND s.id = "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Distribution"."loadSheetCancelEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vLs"     record;
BEGIN
  SELECT s.id, s."docNo", s.status INTO "vLs" FROM "Distribution"."LoadSheets" s WHERE s."tenantId" = "vTenant" AND s.id = "pId" FOR UPDATE;
  IF "vLs".status = 'SETTLED' THEN
    RAISE EXCEPTION 'Load sheet % is settled: its route settlement is posted', "vLs"."docNo"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'LOAD_SHEET_NOT_EDITABLE';
  END IF;
  IF EXISTS (SELECT 1 FROM "Distribution"."RouteSettlements" r WHERE r."tenantId" = "vTenant" AND r."deliveryRunId" = "pId") THEN
    RAISE EXCEPTION 'Load sheet % has a route settlement; delete it first', "vLs"."docNo"
      USING ERRCODE = 'check_violation', HINT = 'LOAD_SHEET_NOT_EDITABLE';
  END IF;
  UPDATE "Distribution"."LoadSheetInvoices" li
     SET "releasedAt" = now()
   WHERE li."tenantId" = "vTenant" AND li."deliveryRunId" = "pId" AND li."releasedAt" IS NULL;
END $function$;

-- A dispatched run no longer needs a van stock transfer (paperwork only).
ALTER TABLE "Distribution"."LoadSheets" DROP CONSTRAINT IF EXISTS "deliveryRunDispatchedChk";
ALTER TABLE "Distribution"."LoadSheets" ADD CONSTRAINT "deliveryRunDispatchedChk"
  CHECK (status NOT IN ('DISPATCHED', 'SETTLED') OR ("dispatchedAt" IS NOT NULL AND "invoiceCount" > 0 AND "loadSheetNo" IS NOT NULL));

-- An invoice is on at most one live run.
CREATE OR REPLACE FUNCTION "Distribution"."triggerLoadSheetInvoiceUnique"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  "vNo" text;
BEGIN
  IF NEW."releasedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT s."docNo" INTO "vNo"
    FROM "Distribution"."LoadSheetInvoices" li
    JOIN "Distribution"."LoadSheets" s ON s."tenantId" = li."tenantId" AND s.id = li."deliveryRunId"
   WHERE li."tenantId" = NEW."tenantId" AND li."invoiceId" = NEW."invoiceId" AND li.id <> NEW.id
     AND li."releasedAt" IS NULL AND s.status NOT IN ('CANCELLED', 'SETTLED')
   LIMIT 1;
  IF "vNo" IS NOT NULL THEN
    RAISE EXCEPTION 'This invoice is already on load sheet %', "vNo" USING ERRCODE = 'check_violation', HINT = 'INVOICE_ON_LOAD_SHEET';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "loadSheetInvoiceUnique" ON "Distribution"."LoadSheetInvoices";
CREATE TRIGGER "loadSheetInvoiceUnique" BEFORE INSERT OR UPDATE ON "Distribution"."LoadSheetInvoices"
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerLoadSheetInvoiceUnique"();

-- Settlement lines are edited step by step (the deliveryman marks PARTIAL before the returns are entered), so the
-- per-line delivery rules are checked when the settlement is posted instead of on every row change.
ALTER TABLE "Distribution"."RouteSettlementLines" DROP CONSTRAINT IF EXISTS "settlementLineFullChk";
ALTER TABLE "Distribution"."RouteSettlementLines" DROP CONSTRAINT IF EXISTS "settlementLinePartialChk";
ALTER TABLE "Distribution"."RouteSettlementLines" DROP CONSTRAINT IF EXISTS "settlementLineNoneChk";

-- ---------------------------------------------------------------------------
-- 3. Route settlement posting: receipts (cash / cheque) and sales returns are already created by the application;
--    this books the cash short (Dr salesman receivable) / over (Cr cash over-short) against the counted cash, marks
--    the run SETTLED and releases the invoices that were not delivered.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Distribution"."routeSettlementPostEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRs"     "Distribution"."RouteSettlements";
  "vLs"     "Distribution"."LoadSheets";
  "vCashGl" uuid;
  "vExp"    numeric(18,2);
  "vShort"  numeric(18,2);
  "vOver"   numeric(18,2);
  "vJe"     uuid;
  "vBad"    text;
BEGIN
  SELECT * INTO "vRs" FROM "Distribution"."RouteSettlements" r WHERE r."tenantId" = "vTenant" AND r.id = "pId" FOR UPDATE;
  SELECT * INTO "vLs" FROM "Distribution"."LoadSheets" s WHERE s."tenantId" = "vTenant" AND s.id = "vRs"."deliveryRunId" FOR UPDATE;
  IF "vLs".status IS DISTINCT FROM 'DISPATCHED' THEN
    RAISE EXCEPTION 'Route settlement %: the run is % (only a dispatched run can be settled)', "vRs"."docNo", "vLs".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'SETTLEMENT_NOT_EDITABLE';
  END IF;
  SELECT i."docNo" INTO "vBad"
    FROM "Distribution"."RouteSettlementLines" l
    JOIN "Sales"."SalesInvoices" i ON i."tenantId" = l."tenantId" AND i.id = l."invoiceId"
   WHERE l."tenantId" = "vTenant" AND l."runSettlementId" = "pId"
     AND ((l."deliveryState" = 'FULL' AND l."returnAmount" <> 0)
       OR (l."deliveryState" = 'PARTIAL' AND l."returnAmount" <= 0)
       OR (l."deliveryState" = 'NONE' AND (l."cashAmount" + l."chequeAmount" + l."returnAmount" <> 0 OR l."nonDeliveryReason" IS NULL)))
   LIMIT 1;
  IF "vBad" IS NOT NULL THEN
    RAISE EXCEPTION 'Route settlement %: invoice % — delivered in full takes no returns, partly delivered needs its returns, not delivered needs a reason and no money',
      "vRs"."docNo", "vBad" USING ERRCODE = 'check_violation', HINT = 'SETTLEMENT_LINE_MISMATCH';
  END IF;
  SELECT COALESCE(sum(l."cashAmount"), 0) INTO "vExp"
    FROM "Distribution"."RouteSettlementLines" l WHERE l."tenantId" = "vTenant" AND l."runSettlementId" = "pId";
  "vShort" := GREATEST("vExp" - COALESCE("vRs"."cashCounted", 0), 0);
  "vOver"  := GREATEST(COALESCE("vRs"."cashCounted", 0) - "vExp", 0);
  IF "vShort" > 0 AND COALESCE("vRs"."salesmanEmployeeId", "vLs"."salesmanEmployeeId") IS NULL THEN
    RAISE EXCEPTION 'Route settlement %: a cash short needs the salesman', "vRs"."docNo" USING ERRCODE = 'check_violation', HINT = 'SETTLEMENT_SALESMAN_REQUIRED';
  END IF;
  IF "vShort" + "vOver" > 0 THEN
    SELECT ca."accountId" INTO "vCashGl" FROM "BankCash"."CashAccounts" ca WHERE ca."tenantId" = "vTenant" AND ca.id = "vRs"."cashAccountId";
    "vJe" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vRs"."docDate", 'postingDate', "vRs"."docDate", 'branchId', COALESCE("vRs"."branchId", "vLs"."branchId"),
                         'narration', 'Route settlement ' || "vRs"."docNo" || ' (' || "vLs"."docNo" || ') cash ' || CASE WHEN "vShort" > 0 THEN 'short' ELSE 'over' END,
                         'sourceDocType', 'RS', 'sourceDocId', "pId", 'sourceDocNo', "vRs"."docNo"),
      jsonb_build_array(
        jsonb_build_object('accountRole', 'SALESMAN_RECEIVABLE', 'debit', "vShort", 'employeeId', COALESCE("vRs"."salesmanEmployeeId", "vLs"."salesmanEmployeeId"), 'particulars', 'Cash short'),
        jsonb_build_object('accountId', "vCashGl", 'credit', "vShort", 'debit', "vOver", 'particulars', 'Cash collected vs counted'),
        jsonb_build_object('accountRole', 'CASH_OVER_SHORT', 'credit', "vOver", 'particulars', 'Cash over')));
  END IF;
  UPDATE "Distribution"."RouteSettlements" r
     SET "journalEntryId" = "vJe", "postedAt" = now(), "postedByUserId" = "Company"."getCurrentUserId"(),
         "cashExpected" = "vExp"
   WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  UPDATE "Distribution"."LoadSheetInvoices" li
     SET "releasedAt" = now()
   WHERE li."tenantId" = "vTenant" AND li."deliveryRunId" = "vLs".id AND li."releasedAt" IS NULL
     AND li."invoiceId" IN (SELECT l."invoiceId" FROM "Distribution"."RouteSettlementLines" l
                             WHERE l."tenantId" = "vTenant" AND l."runSettlementId" = "pId" AND l."deliveryState" = 'NONE');
  UPDATE "Distribution"."LoadSheets" s SET status = 'SETTLED', "returnedAt" = COALESCE(s."returnedAt", now())
   WHERE s."tenantId" = "vTenant" AND s.id = "vLs".id;
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Recovery sheet posting: the application records one receipt per collected line first; this rolls up the totals.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Distribution"."recoverySheetPostEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vPosted" numeric(18,2);
BEGIN
  SELECT COALESCE(sum(l."collectedAmount"), 0) INTO "vPosted"
    FROM "Distribution"."RecoverySheetLines" l
   WHERE l."tenantId" = "vTenant" AND l."recoverySheetId" = "pId" AND l.status = 'POSTED';
  UPDATE "Distribution"."RecoverySheets" s
     SET "postedTotal" = "vPosted", "collectedTotal" = GREATEST(COALESCE(s."collectedTotal", 0), "vPosted")
   WHERE s."tenantId" = "vTenant" AND s.id = "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Commission accrual: Dr sales commission expense / Cr commission payable (status ACCRUED)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Distribution"."salesmanCommissionAccrue"("pId" uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "c"       "Distribution"."SalesmanCommissions";
  "vName"   text;
  "vJe"     uuid;
BEGIN
  SELECT * INTO "c" FROM "Distribution"."SalesmanCommissions" t WHERE t."tenantId" = "vTenant" AND t.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commission % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "c".status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Only an approved commission can be posted (it is %)', "c".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'COMMISSION_NOT_APPROVED';
  END IF;
  SELECT e."displayName" INTO "vName" FROM "HumanResources"."Employees" e WHERE e."tenantId" = "vTenant" AND e.id = "c"."employeeId";
  IF "c"."commissionAmount" > 0 THEN
    "vJe" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "c"."periodEnd", 'postingDate', "c"."periodEnd",
                         'narration', 'Sales commission ' || COALESCE("vName", '') || ' ' || "c"."periodStart" || ' – ' || "c"."periodEnd",
                         'sourceDocType', 'SCM', 'sourceDocId', "pId", 'sourceDocNo', left(COALESCE("vName", 'Commission'), 60)),
      jsonb_build_array(
        jsonb_build_object('accountRole', 'SALES_COMMISSION_EXPENSE', 'debit', "c"."commissionAmount", 'employeeId', "c"."employeeId", 'particulars', 'Commission ' || COALESCE("vName", '')),
        jsonb_build_object('accountRole', 'COMMISSION_PAYABLE', 'credit', "c"."commissionAmount", 'employeeId', "c"."employeeId", 'particulars', 'Commission payable ' || COALESCE("vName", ''))));
  END IF;
  UPDATE "Distribution"."SalesmanCommissions" t SET status = 'ACCRUED', "journalEntryId" = "vJe" WHERE t."tenantId" = "vTenant" AND t.id = "pId";
  RETURN "vJe";
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Row history on load sheet lines; error codes
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "loadSheetLinesAudit" ON "Distribution"."LoadSheetLines";
CREATE TRIGGER "loadSheetLinesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Distribution"."LoadSheetLines" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('LOAD_SHEET_EMPTY', 409, 'BUSINESS_RULE', 'SALES', 'Add invoices to the load sheet first.', 'Dispatch of a load sheet without invoices', true, NULL),
  ('LOAD_SHEET_NOT_EDITABLE', 409, 'BUSINESS_RULE', 'SALES', 'This load sheet can no longer be changed.', 'Edit / cancel of a dispatched or settled run', true, NULL),
  ('LOAD_SHEET_INVOICE_NOT_POSTED', 409, 'BUSINESS_RULE', 'SALES', 'An invoice on this load sheet is no longer posted.', 'Voided invoice on a run', true, NULL),
  ('INVOICE_ON_LOAD_SHEET', 409, 'BUSINESS_RULE', 'SALES', 'This invoice is already on another load sheet.', 'Invoice on two live runs', true, NULL),
  ('SETTLEMENT_NOT_EDITABLE', 409, 'BUSINESS_RULE', 'SALES', 'This settlement can no longer be changed.', 'Edit / post of a settled run', true, NULL),
  ('SETTLEMENT_NOT_APPROVED', 409, 'BUSINESS_RULE', 'SALES', 'Approve the settlement before posting it.', 'Post before approval', true, NULL),
  ('SETTLEMENT_SALESMAN_REQUIRED', 409, 'BUSINESS_RULE', 'SALES', 'A cash short needs the salesman it is charged to.', 'Short without salesman', true, NULL),
  ('SETTLEMENT_LINE_MISMATCH', 400, 'VALIDATION', 'SALES', 'Cash, cheques, credit and returns must add up to the invoice amount.', 'Settlement line does not balance', true, NULL),
  ('RECOVERY_NOT_EDITABLE', 409, 'BUSINESS_RULE', 'SALES', 'This recovery sheet is posted.', 'Edit / post of a posted recovery sheet', true, NULL),
  ('COMMISSION_NOT_APPROVED', 409, 'BUSINESS_RULE', 'SALES', 'Only an approved commission can be posted.', 'Post of a draft commission', true, NULL),
  ('COMMISSION_NO_PAYROLL_RUN', 409, 'BUSINESS_RULE', 'SALES', 'There is no draft payroll run for this month yet. Create it, then send the commission to payroll.', 'Send to payroll without a draft run', true, NULL),
  ('CREDIT_OVERRIDE_NOT_PENDING', 409, 'BUSINESS_RULE', 'SALES', 'This override request is already decided.', 'Decide a decided override', true, NULL),
  ('CREDIT_OVERRIDE_SELF_APPROVAL', 403, 'PERMISSION', 'SALES', 'You can’t approve your own override request.', 'Requester approving own override', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
