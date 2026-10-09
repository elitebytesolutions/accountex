-- Phase 16: General ledger (approvals inbox, journal vouchers, opening balances, recurring vouchers). Idempotent.
-- Apply with: npm run db:sql

-- ---------------------------------------------------------------------------
-- 1. Row history on the tables that had none (all three stay append-only; the audit trigger only records inserts)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "approvalActionsAudit" ON "Company"."ApprovalActions";
CREATE TRIGGER "approvalActionsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Company"."ApprovalActions"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "voucherActivitiesAudit" ON "Accounting"."VoucherActivities";
CREATE TRIGGER "voucherActivitiesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Accounting"."VoucherActivities"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "recurringVoucherRunsAudit" ON "Accounting"."RecurringVoucherRuns";
CREATE TRIGGER "recurringVoucherRunsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Accounting"."RecurringVoucherRuns"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Posting into a closed / locked period names its catalogue code (same checks as before, plus HINT).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Accounting"."assertPostingAllowed"("pTenant" uuid, "pDate" date, "pPeriodId" uuid, "pModule" text DEFAULT 'GL'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  "vStatus" text;
  "vCode"   text;
  "vLock"   date;
  "vMod"    text;
BEGIN
  SELECT status, code INTO "vStatus", "vCode" FROM "Accounting"."FiscalPeriods"
   WHERE "tenantId" = "pTenant" AND id = "pPeriodId";
  IF "vStatus" IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'Period % is % — postings dated % are blocked', COALESCE("vCode", '(none)'), lower(COALESCE("vStatus", 'missing')), "pDate"
      USING ERRCODE = 'check_violation', HINT = 'PERIOD_NOT_OPEN';
  END IF;
  SELECT status INTO "vMod" FROM "Accounting"."PeriodModuleLocks"
   WHERE "tenantId" = "pTenant" AND "fiscalPeriodId" = "pPeriodId" AND "moduleCode" = COALESCE("pModule", 'GL');
  IF "vMod" IN ('CLOSED','LOCKED') THEN
    RAISE EXCEPTION 'Module % is % for period %', COALESCE("pModule", 'GL'), lower("vMod"), "vCode"
      USING ERRCODE = 'check_violation', HINT = 'PERIOD_NOT_OPEN';
  END IF;
  SELECT cp."booksLockDate" INTO "vLock" FROM "Company"."CompanySettings" cp WHERE cp."tenantId" = "pTenant";
  IF "vLock" IS NOT NULL AND "pDate" <= "vLock" THEN
    RAISE EXCEPTION 'Books are locked up to %; cannot post on %', "vLock", "pDate"
      USING ERRCODE = 'check_violation', HINT = 'PERIOD_NOT_OPEN';
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION "Accounting"."getFiscalPeriodForDate"("pTenant" uuid, "pDate" date, "pPeriodId" uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  "vId" uuid;
BEGIN
  IF "pPeriodId" IS NOT NULL THEN
    SELECT id INTO "vId" FROM "Accounting"."FiscalPeriods"
     WHERE "tenantId" = "pTenant" AND id = "pPeriodId" AND "pDate" BETWEEN "startDate" AND "endDate";
    IF FOUND THEN RETURN "vId"; END IF;
  END IF;
  SELECT id INTO "vId" FROM "Accounting"."FiscalPeriods"
   WHERE "tenantId" = "pTenant" AND NOT "isAdjustment" AND "pDate" BETWEEN "startDate" AND "endDate";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No fiscal period covers %; create the fiscal year first', "pDate"
      USING ERRCODE = 'check_violation', HINT = 'PERIOD_NOT_OPEN';
  END IF;
  RETURN "vId";
END $function$;

-- ---------------------------------------------------------------------------
-- 3. Every company's voucher numbering series (JV, CPV, CRV, BPV, BRV, CON, OB; company-wide, yearly), from the
--    document types' defaults. At provisioning, and backfilled now. Existing series are never touched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Accounting"."seedGeneralLedgerDefaultsFor"("pTenant" uuid)
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
   WHERE d.code IN ('JV', 'CPV', 'CRV', 'BPV', 'BRV', 'CON', 'OB')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "Accounting"."triggerTenantGeneralLedgerDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Accounting"."seedGeneralLedgerDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsGeneralLedgerDefaults" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsGeneralLedgerDefaults" AFTER INSERT ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "Accounting"."triggerTenantGeneralLedgerDefaults"();

SELECT set_config('app.actorLabel', 'seedGeneralLedgerDefaultsFor', true);
SELECT "Accounting"."seedGeneralLedgerDefaultsFor"(t.id) FROM "Platform"."Tenants" t;

-- ---------------------------------------------------------------------------
-- 4. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('VOUCHER_UNBALANCED',        400, 'VALIDATION',    'GL', 'Debits must equal credits, with at least two lines and an amount above zero.', 'Unbalanced voucher', true, NULL),
  ('VOUCHER_NOT_EDITABLE',      409, 'BUSINESS_RULE', 'GL', 'Only draft vouchers can be changed or deleted. Reverse a posted voucher instead.', 'Edit of a submitted / posted voucher', true, NULL),
  ('VOUCHER_APPROVAL_REQUIRED', 409, 'BUSINESS_RULE', 'GL', 'This voucher needs approval before it can be posted. Submit it for approval.', 'Post without the required approval', true, NULL),
  ('PERIOD_NOT_OPEN',           400, 'BUSINESS_RULE', 'GL', 'The posting date falls in a period that is closed or locked.', 'Posting into a closed / locked period', true, NULL),
  ('APPROVAL_NOT_ELIGIBLE',     403, 'PERMISSION',    'GL', 'You are not an approver for the current step of this document.', 'Approval by a non-approver', true, NULL),
  ('APPROVAL_SELF',             409, 'BUSINESS_RULE', 'GL', 'You can''t approve a document you requested.', 'Self-approval', true, NULL),
  ('APPROVAL_NOT_PENDING',      409, 'BUSINESS_RULE', 'GL', 'This approval request is no longer pending.', 'Action on a closed approval', true, NULL),
  ('OPENING_BALANCE_POSTED',    409, 'BUSINESS_RULE', 'GL', 'Opening balances for this year are already posted. Correct them with a journal voucher.', 'Edit of posted opening balances', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;
