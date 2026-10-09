-- Phase 27 — Assets & budgets: numbering (FA, DEP, DSP), capitalisation from a vendor bill line (reclass journal when
-- the bill posted elsewhere), financial fields frozen once capitalised, monthly depreciation compute (SLM / WDV, one
-- run per period), transfer complete / reject, disposal approve-and-post, budget versions submit / approve, audit
-- trigger on depreciation schedules, error codes. Posting, run reversal and disposal reversal reuse the template's
-- FixedAssets functions. Idempotent.
SELECT set_config('app.actorLabel', '303-assets-budgets.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Numbering: FA, DEP, DSP for every company and every new one
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "FixedAssets"."seedAssetDefaultsFor"("pTenant" uuid)
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
   WHERE d.code IN ('FA', 'DEP', 'DSP')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "FixedAssets"."triggerTenantAssetDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "FixedAssets"."seedAssetDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsAssetDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsAssetDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "FixedAssets"."triggerTenantAssetDefaults"();

SELECT set_config('app.actorLabel', 'seedAssetDefaultsFor', false);
SELECT "FixedAssets"."seedAssetDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '303-assets-budgets.sql', false);

-- ---------------------------------------------------------------------------
-- 2. Schema: row history on schedules, the bill line an asset was capitalised from, one run per period
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "depreciationSchedulesAudit" ON "FixedAssets"."DepreciationSchedules";
CREATE TRIGGER "depreciationSchedulesAudit" AFTER INSERT OR UPDATE OR DELETE ON "FixedAssets"."DepreciationSchedules" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

ALTER TABLE "FixedAssets"."FixedAssets" ADD COLUMN IF NOT EXISTS "sourceDocLineId" uuid;
CREATE UNIQUE INDEX IF NOT EXISTS "assetSourceLineUk" ON "FixedAssets"."FixedAssets" ("tenantId", "sourceDocLineId")
  WHERE "sourceDocLineId" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "depreciationRunOnePerPeriodUk" ON "FixedAssets"."DepreciationRuns" ("tenantId", "fiscalPeriodId")
  WHERE status <> 'CANCELLED';

-- ---------------------------------------------------------------------------
-- 3. Assets: cost, dates, method and accounts are frozen once the asset is capitalised (status other than NEW)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "FixedAssets"."triggerAssetFreeze"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status <> 'NEW' AND (
       NEW.cost IS DISTINCT FROM OLD.cost OR NEW."acquisitionDate" IS DISTINCT FROM OLD."acquisitionDate"
    OR NEW.method IS DISTINCT FROM OLD.method OR NEW."ratePct" IS DISTINCT FROM OLD."ratePct"
    OR NEW."residualValue" IS DISTINCT FROM OLD."residualValue" OR NEW."categoryId" IS DISTINCT FROM OLD."categoryId"
    OR NEW."costAccountId" IS DISTINCT FROM OLD."costAccountId" OR NEW."accumDepAccountId" IS DISTINCT FROM OLD."accumDepAccountId"
    OR NEW."depExpenseAccountId" IS DISTINCT FROM OLD."depExpenseAccountId") THEN
    RAISE EXCEPTION 'Asset %: cost, dates, depreciation policy and accounts can''t change after capitalisation', OLD.code
      USING ERRCODE = 'check_violation', HINT = 'ASSET_NOT_EDITABLE';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "assetFreeze" ON "FixedAssets"."FixedAssets";
CREATE TRIGGER "assetFreeze" BEFORE UPDATE ON "FixedAssets"."FixedAssets" FOR EACH ROW EXECUTE FUNCTION "FixedAssets"."triggerAssetFreeze"();

-- Capitalise: NEW → IN_USE. From a posted vendor bill line: the line is linked once; when the bill posted to another
-- account than the asset's cost account, a journal moves the amount there (Dr asset cost / Cr the bill line account).
CREATE OR REPLACE FUNCTION "FixedAssets"."fixedAssetCapitalise"("pId" uuid, "pBillLineId" uuid DEFAULT NULL)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vA"      "FixedAssets"."FixedAssets";
  "vL"      record;
  "vJe"     uuid;
BEGIN
  SELECT * INTO "vA" FROM "FixedAssets"."FixedAssets" t WHERE t.id = "pId" AND t."tenantId" = "vTenant" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asset % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vA".status <> 'NEW' THEN
    RAISE EXCEPTION 'Asset % is already capitalised', "vA".code USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'ASSET_ALREADY_CAPITALISED';
  END IF;
  IF "pBillLineId" IS NOT NULL THEN
    SELECT l.id, l."accountId", l."netAmount", l."costCentreId", b.id AS "billId", b."docNo", b.status, b."vendorId", b."branchId"
      INTO "vL"
      FROM "Purchases"."VendorBillLines" l
      JOIN "Purchases"."VendorBills" b ON b."tenantId" = l."tenantId" AND b.id = l."billId"
     WHERE l."tenantId" = "vTenant" AND l.id = "pBillLineId";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bill line % not found', "pBillLineId" USING ERRCODE = 'no_data_found';
    END IF;
    IF "vL".status NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID') THEN
      RAISE EXCEPTION 'Bill % is not posted', "vL"."docNo" USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'ASSET_BILL_NOT_POSTED';
    END IF;
    IF EXISTS (SELECT 1 FROM "FixedAssets"."FixedAssets" x WHERE x."tenantId" = "vTenant" AND x."sourceDocLineId" = "pBillLineId" AND x.id <> "pId" AND x."deletedAt" IS NULL) THEN
      RAISE EXCEPTION 'This bill line is already capitalised as another asset' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'ASSET_BILL_LINE_USED';
    END IF;
    IF "vL"."accountId" IS NOT NULL AND "vL"."accountId" <> "vA"."costAccountId" THEN
      "vJe" := "Accounting"."journalCreate"(
        jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vA"."acquisitionDate", 'postingDate', current_date, 'branchId', "vA"."branchId",
                           'narration', left('Capitalisation ' || "vA".code || ' ' || "vA".name || ' from ' || "vL"."docNo", 300),
                           'sourceDocType', 'FA', 'sourceDocId', "pId", 'sourceDocNo', "vA".code),
        jsonb_build_array(
          jsonb_build_object('accountId', "vA"."costAccountId", 'debit', "vA".cost, 'particulars', 'Asset ' || "vA".code, 'costCentreId', "vA"."costCentreId"),
          jsonb_build_object('accountId', "vL"."accountId", 'credit', "vA".cost, 'particulars', 'Reclassified from ' || "vL"."docNo", 'costCentreId', "vL"."costCentreId")));
    END IF;
    UPDATE "FixedAssets"."FixedAssets" t
       SET "sourceDocType" = 'BILL', "sourceDocId" = "vL"."billId", "sourceDocNo" = "vL"."docNo", "sourceDocLineId" = "pBillLineId",
           "vendorId" = COALESCE(t."vendorId", "vL"."vendorId")
     WHERE t.id = "pId";
  END IF;
  UPDATE "FixedAssets"."FixedAssets" t SET status = 'IN_USE', "capitalisedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Depreciation: compute a draft run (one month per active asset; SLM on cost less residual, WDV on net book value;
--    a part month in the month of purchase unless the asset charges the full month; never below residual value)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "FixedAssets"."depreciationRunCompute"("pRunId" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRun"    record;
  "vN"      integer;
  "vInScope" integer;
  "vNbv"    numeric(18,2);
  "vTotal"  numeric(18,2);
BEGIN
  SELECT r.*, p."startDate", p."endDate", p.status AS "periodStatus", p.code AS "periodCode" INTO "vRun"
    FROM "FixedAssets"."DepreciationRuns" r
    JOIN "Accounting"."FiscalPeriods" p ON p."tenantId" = r."tenantId" AND p.id = r."fiscalPeriodId"
   WHERE r."tenantId" = "vTenant" AND r.id = "pRunId"
   FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Depreciation run not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRun".status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Depreciation run % is %', "vRun"."docNo", lower("vRun".status) USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'DEPRECIATION_RUN_NOT_DRAFT';
  END IF;
  IF "vRun"."periodStatus" <> 'OPEN' THEN
    RAISE EXCEPTION 'Period % is %', "vRun"."periodCode", lower("vRun"."periodStatus") USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PERIOD_NOT_OPEN';
  END IF;
  DELETE FROM "FixedAssets"."DepreciationRunLines" WHERE "tenantId" = "vTenant" AND "depreciationRunId" = "pRunId";
  WITH scope AS (
    SELECT a.*,
           CASE WHEN a."acquisitionDate" > "vRun"."startDate" AND NOT a."chargeFullMonthOnPurchase"
                THEN round((("vRun"."endDate" - a."acquisitionDate") + 1)::numeric / (("vRun"."endDate" - "vRun"."startDate") + 1), 4)
                ELSE 1 END AS months
      FROM "FixedAssets"."FixedAssets" a
     WHERE a."tenantId" = "vTenant" AND a."deletedAt" IS NULL AND a.status IN ('IN_USE', 'UNDER_REPAIR')
       AND a.method <> 'NONE' AND a."acquisitionDate" <= "vRun"."endDate"
       AND (a."depreciatedThrough" IS NULL OR a."depreciatedThrough" < "vRun"."startDate")
       AND ("vRun"."branchId" IS NULL OR a."branchId" = "vRun"."branchId")
       AND ("vRun"."categoryId" IS NULL OR a."categoryId" = "vRun"."categoryId")
  ), charged AS (
    SELECT s.*, round(LEAST(
             CASE WHEN s.method = 'SLM' THEN (s.cost - s."residualValue") * s."ratePct" / 100 / 12 * s.months
                  ELSE (s.cost - s."accumulatedDepreciation") * s."ratePct" / 100 / 12 * s.months END,
             s.cost - s."accumulatedDepreciation" - s."residualValue"), 2) AS charge
      FROM scope s
  )
  INSERT INTO "FixedAssets"."DepreciationRunLines" ("tenantId", "depreciationRunId", "fiscalPeriodId", "assetId", "categoryId", "branchId", "costCentreId",
                                                    method, "ratePct", months, "openingNbv", charge, "expenseAccountId", "accumDepAccountId")
  SELECT "vTenant", "pRunId", "vRun"."fiscalPeriodId", c.id, c."categoryId", c."branchId", c."costCentreId", c.method, c."ratePct", c.months,
         c.cost - c."accumulatedDepreciation", c.charge, c."depExpenseAccountId", c."accumDepAccountId"
    FROM charged c WHERE c.charge > 0;
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  SELECT count(*), COALESCE(sum(a.cost - a."accumulatedDepreciation"), 0) INTO "vInScope", "vNbv"
    FROM "FixedAssets"."FixedAssets" a
   WHERE a."tenantId" = "vTenant" AND a."deletedAt" IS NULL AND a.status IN ('IN_USE', 'UNDER_REPAIR', 'FULLY_DEPRECIATED')
     AND ("vRun"."branchId" IS NULL OR a."branchId" = "vRun"."branchId")
     AND ("vRun"."categoryId" IS NULL OR a."categoryId" = "vRun"."categoryId");
  SELECT COALESCE(sum(charge), 0) INTO "vTotal" FROM "FixedAssets"."DepreciationRunLines" WHERE "tenantId" = "vTenant" AND "depreciationRunId" = "pRunId";
  UPDATE "FixedAssets"."DepreciationRuns" r
     SET "assetsCount" = "vN", "skippedCount" = GREATEST("vInScope" - "vN", 0), "totalDepreciation" = "vTotal",
         "nbvBefore" = "vNbv", "nbvAfter" = "vNbv" - "vTotal", "computedAt" = now(), "computedByUserId" = "Company"."getCurrentUserId"()
   WHERE r."tenantId" = "vTenant" AND r.id = "pRunId";
  RETURN "vN";
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Transfers: complete (after approval; the template trigger moves branch and custodian), reject, cancel open ones
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "FixedAssets"."assetTransferComplete"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "FixedAssets"."AssetTransfers";
BEGIN
  SELECT * INTO "vRow" FROM "FixedAssets"."AssetTransfers" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'COMPLETED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Only an approved transfer can be completed (status %)', "vRow".status USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TRANSFER_NOT_OPEN';
  END IF;
  UPDATE "FixedAssets"."AssetTransfers" t SET status = 'COMPLETED', "completedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "FixedAssets"."assetTransferReject"("pId" uuid, "pReason" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "FixedAssets"."AssetTransfers";
BEGIN
  SELECT * INTO "vRow" FROM "FixedAssets"."AssetTransfers" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'Only a transfer waiting for approval can be rejected' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TRANSFER_NOT_OPEN';
  END IF;
  UPDATE "FixedAssets"."AssetTransfers" t
     SET status = 'REJECTED', reason = concat_ws(E'\n', NULLIF(t.reason, ''), 'Rejected: ' || NULLIF(btrim("pReason"), ''))
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "FixedAssets"."assetTransferCancel"("pId" uuid, "pReason" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "FixedAssets"."AssetTransfers";
BEGIN
  SELECT * INTO "vRow" FROM "FixedAssets"."AssetTransfers" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status NOT IN ('PENDING_APPROVAL', 'APPROVED') THEN
    RAISE EXCEPTION 'A % transfer can''t be cancelled; transfer the asset back instead', lower("vRow".status)
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TRANSFER_NOT_OPEN';
  END IF;
  UPDATE "FixedAssets"."AssetTransfers" t
     SET status = 'CANCELLED', reason = concat_ws(E'\n', NULLIF(t.reason, ''), 'Cancelled: ' || NULLIF(btrim("pReason"), ''))
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Disposals: submitted for approval, approved by someone else and posted in one step (the template's post)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "FixedAssets"."assetDisposalApprove"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "FixedAssets"."AssetDisposals";
BEGIN
  SELECT * INTO "vRow" FROM "FixedAssets"."AssetDisposals" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Disposal % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'Disposal % is not waiting for approval', "vRow"."docNo" USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'DISPOSAL_NOT_EDITABLE';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'The preparer cannot approve their own disposal' USING ERRCODE = 'insufficient_privilege', HINT = 'APPROVAL_SELF';
  END IF;
  UPDATE "FixedAssets"."AssetDisposals" t SET "approvedByUserId" = "Company"."getCurrentUserId"(), "approvedAt" = now() WHERE t.id = "pId";
  PERFORM "FixedAssets"."assetDisposalPost"("pId");
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 7. Budget versions: submit for review, approve (supersedes the previously approved version; preparer can't approve)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Accounting"."budgetVersionSubmit"("pVersionId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vV" "Accounting"."BudgetVersions";
BEGIN
  SELECT * INTO "vV" FROM "Accounting"."BudgetVersions" v WHERE v.id = "pVersionId" AND v."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Budget version % not found', "pVersionId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vV".status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only a draft budget version can be submitted' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'BUDGET_VERSION_NOT_EDITABLE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Accounting"."BudgetVersionLines" l WHERE l."tenantId" = "vV"."tenantId" AND l."budgetVersionId" = "pVersionId") THEN
    RAISE EXCEPTION 'Add at least one budget line' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE "Accounting"."BudgetVersions" v SET status = 'IN_REVIEW' WHERE v.id = "pVersionId";
  UPDATE "Accounting"."Budgets" b SET status = 'IN_REVIEW', "currentVersionId" = "pVersionId" WHERE b."tenantId" = "vV"."tenantId" AND b.id = "vV"."budgetId" AND b.status <> 'APPROVED';
  RETURN "pVersionId";
END $function$;

CREATE OR REPLACE FUNCTION "Accounting"."budgetVersionApprove"("pVersionId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vV" "Accounting"."BudgetVersions";
BEGIN
  SELECT * INTO "vV" FROM "Accounting"."BudgetVersions" v WHERE v.id = "pVersionId" AND v."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Budget version % not found', "pVersionId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vV".status <> 'IN_REVIEW' THEN
    RAISE EXCEPTION 'Only a budget version in review can be approved' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'BUDGET_NOT_IN_REVIEW';
  END IF;
  IF "vV"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'The preparer cannot approve their own budget' USING ERRCODE = 'insufficient_privilege', HINT = 'APPROVAL_SELF';
  END IF;
  UPDATE "Accounting"."BudgetVersions" v SET status = 'SUPERSEDED'
   WHERE v."tenantId" = "vV"."tenantId" AND v."budgetId" = "vV"."budgetId" AND v.status = 'APPROVED';
  UPDATE "Accounting"."BudgetVersions" v SET status = 'APPROVED', "approvedByUserId" = "Company"."getCurrentUserId"(), "approvedAt" = now() WHERE v.id = "pVersionId";
  UPDATE "Accounting"."Budgets" b
     SET status = 'APPROVED', "currentVersionId" = "pVersionId", "approvedByUserId" = "Company"."getCurrentUserId"(), "approvedAt" = now()
   WHERE b."tenantId" = "vV"."tenantId" AND b.id = "vV"."budgetId";
  RETURN "pVersionId";
END $function$;

-- ---------------------------------------------------------------------------
-- 8. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('ASSET_NOT_EDITABLE',          409, 'BUSINESS_RULE', 'FINANCE', 'Cost, dates, depreciation policy and accounts can''t change after the asset is capitalised.', 'Edit of a capitalised asset''s financial fields', true, NULL),
  ('ASSET_ALREADY_CAPITALISED',   409, 'BUSINESS_RULE', 'FINANCE', 'This asset is already capitalised.', 'Capitalise twice', true, NULL),
  ('ASSET_BILL_NOT_POSTED',       409, 'BUSINESS_RULE', 'FINANCE', 'Capitalise from a posted vendor bill.', 'Capitalisation from a draft bill', true, NULL),
  ('ASSET_BILL_LINE_USED',        409, 'CONFLICT',      'FINANCE', 'This bill line is already capitalised as another asset.', 'Same bill line on two assets', true, NULL),
  ('ASSET_NOT_ACTIVE',            409, 'BUSINESS_RULE', 'FINANCE', 'Only an asset in use can be transferred or disposed.', 'Transfer / dispose a new or disposed asset', true, NULL),
  ('DEPRECIATION_RUN_NOT_DRAFT',  409, 'BUSINESS_RULE', 'FINANCE', 'This depreciation run is already posted or cancelled.', 'Recompute / post a posted run', true, NULL),
  ('DEPRECIATION_PERIOD_HAS_RUN', 409, 'CONFLICT',      'FINANCE', 'This period already has a depreciation run.', 'Second run for a period', true, NULL),
  ('TRANSFER_NOT_OPEN',           409, 'BUSINESS_RULE', 'FINANCE', 'This transfer is no longer open.', 'Approve / reject / cancel of a closed transfer', true, NULL),
  ('DISPOSAL_NOT_EDITABLE',       409, 'BUSINESS_RULE', 'FINANCE', 'Only a draft disposal can be changed.', 'Edit / submit of a non-draft disposal', true, NULL),
  ('BUDGET_VERSION_NOT_EDITABLE', 409, 'BUSINESS_RULE', 'FINANCE', 'Only a draft budget version can be changed. Create a new version instead.', 'Edit of a submitted / approved budget version', true, NULL),
  ('BUDGET_NOT_IN_REVIEW',        409, 'BUSINESS_RULE', 'FINANCE', 'Submit the budget version for review before approving it.', 'Approve a draft budget version', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
