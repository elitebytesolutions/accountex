-- =============================================================================
-- Finsoft ERP (Full edition) — API: "FixedAssets"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- FixedAssetCategories: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "FixedAssets"."fixedAssetCategoryAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "FixedAssets"."FixedAssetCategories";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"FixedAssets"."FixedAssetCategories", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "FixedAssets"."FixedAssetCategories" ("tenantId", code, name, "defaultMethod", "defaultRatePct", "costAccountId", "accumDepAccountId", "depExpenseAccountId", "tagPrefix", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'defaultMethod' THEN "vRec"."defaultMethod" ELSE 'WDV' END, CASE WHEN "pData" ? 'defaultRatePct' THEN "vRec"."defaultRatePct" ELSE NULL END, CASE WHEN "pData" ? 'costAccountId' THEN "vRec"."costAccountId" ELSE NULL END, CASE WHEN "pData" ? 'accumDepAccountId' THEN "vRec"."accumDepAccountId" ELSE NULL END, CASE WHEN "pData" ? 'depExpenseAccountId' THEN "vRec"."depExpenseAccountId" ELSE NULL END, CASE WHEN "pData" ? 'tagPrefix' THEN "vRec"."tagPrefix" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "FixedAssets"."FixedAssetCategories" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "defaultMethod" = CASE WHEN "pData" ? 'defaultMethod' THEN "vRec"."defaultMethod" ELSE t."defaultMethod" END,
           "defaultRatePct" = CASE WHEN "pData" ? 'defaultRatePct' THEN "vRec"."defaultRatePct" ELSE t."defaultRatePct" END,
           "costAccountId" = CASE WHEN "pData" ? 'costAccountId' THEN "vRec"."costAccountId" ELSE t."costAccountId" END,
           "accumDepAccountId" = CASE WHEN "pData" ? 'accumDepAccountId' THEN "vRec"."accumDepAccountId" ELSE t."accumDepAccountId" END,
           "depExpenseAccountId" = CASE WHEN "pData" ? 'depExpenseAccountId' THEN "vRec"."depExpenseAccountId" ELSE t."depExpenseAccountId" END,
           "tagPrefix" = CASE WHEN "pData" ? 'tagPrefix' THEN "vRec"."tagPrefix" ELSE t."tagPrefix" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "FixedAssets"."FixedAssetCategories" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'FixedAssetCategories %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'FixedAssetCategories % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "FixedAssets"."fixedAssetCategoryAddUpdate"(jsonb) IS 'Save (insert or update) one FixedAssetCategories record.';

-- FixedAssetCategories: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "FixedAssets"."getFixedAssetCategoryInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('defaultMethodLabel', "Lookups"."getLookupLabel"('DefaultMethod', t."defaultMethod") ->> 'label', 'defaultMethodTone', "Lookups"."getLookupLabel"('DefaultMethod', t."defaultMethod") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone')
    FROM "FixedAssets"."FixedAssetCategories" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "FixedAssets"."getFixedAssetCategoryInfo"(uuid) IS 'Read one FixedAssetCategories record (getter for its screens).';

-- FixedAssets: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "FixedAssets"."fixedAssetAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "FixedAssets"."FixedAssets";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"FixedAssets"."FixedAssets", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'code') OR "vRec".code IS NULL THEN
      "vRec".code := "Company"."getNextDocNo"('FA', current_date, "vRec"."branchId");
    END IF;
    INSERT INTO "FixedAssets"."FixedAssets" ("tenantId", code, name, description, "categoryId", "branchId", "custodianEmployeeId", "costCentreId", "tagNo", "serialNo", "acquisitionDate", cost, "sourceDocType", "sourceDocId", "sourceDocNo", "vendorId", method, "ratePct", "residualValue", "chargeFullMonthOnPurchase", "costAccountId", "accumDepAccountId", "depExpenseAccountId", "accumulatedDepreciation", "depreciatedThrough", "taxWdv", "registrationNo", "engineNo", "chassisNo", insurer, "insurancePolicyNo", "insurancePremium", "insuranceExpiry", "lastVerifiedOn", status, "disposedOn", "capitalisedByUserId")
    VALUES ("vTenant", "vRec".code, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'categoryId' THEN "vRec"."categoryId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'custodianEmployeeId' THEN "vRec"."custodianEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE NULL END, CASE WHEN "pData" ? 'tagNo' THEN "vRec"."tagNo" ELSE NULL END, CASE WHEN "pData" ? 'serialNo' THEN "vRec"."serialNo" ELSE NULL END, CASE WHEN "pData" ? 'acquisitionDate' THEN "vRec"."acquisitionDate" ELSE NULL END, CASE WHEN "pData" ? 'cost' THEN "vRec".cost ELSE NULL END, CASE WHEN "pData" ? 'sourceDocType' THEN "vRec"."sourceDocType" ELSE NULL END, CASE WHEN "pData" ? 'sourceDocId' THEN "vRec"."sourceDocId" ELSE NULL END, CASE WHEN "pData" ? 'sourceDocNo' THEN "vRec"."sourceDocNo" ELSE NULL END, CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE NULL END, CASE WHEN "pData" ? 'method' THEN "vRec".method ELSE NULL END, CASE WHEN "pData" ? 'ratePct' THEN "vRec"."ratePct" ELSE NULL END, CASE WHEN "pData" ? 'residualValue' THEN "vRec"."residualValue" ELSE 0 END, CASE WHEN "pData" ? 'chargeFullMonthOnPurchase' THEN "vRec"."chargeFullMonthOnPurchase" ELSE TRUE END, CASE WHEN "pData" ? 'costAccountId' THEN "vRec"."costAccountId" ELSE NULL END, CASE WHEN "pData" ? 'accumDepAccountId' THEN "vRec"."accumDepAccountId" ELSE NULL END, CASE WHEN "pData" ? 'depExpenseAccountId' THEN "vRec"."depExpenseAccountId" ELSE NULL END, CASE WHEN "pData" ? 'accumulatedDepreciation' THEN "vRec"."accumulatedDepreciation" ELSE 0 END, CASE WHEN "pData" ? 'depreciatedThrough' THEN "vRec"."depreciatedThrough" ELSE NULL END, CASE WHEN "pData" ? 'taxWdv' THEN "vRec"."taxWdv" ELSE NULL END, CASE WHEN "pData" ? 'registrationNo' THEN "vRec"."registrationNo" ELSE NULL END, CASE WHEN "pData" ? 'engineNo' THEN "vRec"."engineNo" ELSE NULL END, CASE WHEN "pData" ? 'chassisNo' THEN "vRec"."chassisNo" ELSE NULL END, CASE WHEN "pData" ? 'insurer' THEN "vRec".insurer ELSE NULL END, CASE WHEN "pData" ? 'insurancePolicyNo' THEN "vRec"."insurancePolicyNo" ELSE NULL END, CASE WHEN "pData" ? 'insurancePremium' THEN "vRec"."insurancePremium" ELSE NULL END, CASE WHEN "pData" ? 'insuranceExpiry' THEN "vRec"."insuranceExpiry" ELSE NULL END, CASE WHEN "pData" ? 'lastVerifiedOn' THEN "vRec"."lastVerifiedOn" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'NEW' END, CASE WHEN "pData" ? 'disposedOn' THEN "vRec"."disposedOn" ELSE NULL END, CASE WHEN "pData" ? 'capitalisedByUserId' THEN "vRec"."capitalisedByUserId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "FixedAssets"."FixedAssets" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "categoryId" = CASE WHEN "pData" ? 'categoryId' THEN "vRec"."categoryId" ELSE t."categoryId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "custodianEmployeeId" = CASE WHEN "pData" ? 'custodianEmployeeId' THEN "vRec"."custodianEmployeeId" ELSE t."custodianEmployeeId" END,
           "costCentreId" = CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE t."costCentreId" END,
           "tagNo" = CASE WHEN "pData" ? 'tagNo' THEN "vRec"."tagNo" ELSE t."tagNo" END,
           "serialNo" = CASE WHEN "pData" ? 'serialNo' THEN "vRec"."serialNo" ELSE t."serialNo" END,
           "acquisitionDate" = CASE WHEN "pData" ? 'acquisitionDate' THEN "vRec"."acquisitionDate" ELSE t."acquisitionDate" END,
           cost = CASE WHEN "pData" ? 'cost' THEN "vRec".cost ELSE t.cost END,
           "sourceDocType" = CASE WHEN "pData" ? 'sourceDocType' THEN "vRec"."sourceDocType" ELSE t."sourceDocType" END,
           "sourceDocId" = CASE WHEN "pData" ? 'sourceDocId' THEN "vRec"."sourceDocId" ELSE t."sourceDocId" END,
           "sourceDocNo" = CASE WHEN "pData" ? 'sourceDocNo' THEN "vRec"."sourceDocNo" ELSE t."sourceDocNo" END,
           "vendorId" = CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE t."vendorId" END,
           method = CASE WHEN "pData" ? 'method' THEN "vRec".method ELSE t.method END,
           "ratePct" = CASE WHEN "pData" ? 'ratePct' THEN "vRec"."ratePct" ELSE t."ratePct" END,
           "residualValue" = CASE WHEN "pData" ? 'residualValue' THEN "vRec"."residualValue" ELSE t."residualValue" END,
           "chargeFullMonthOnPurchase" = CASE WHEN "pData" ? 'chargeFullMonthOnPurchase' THEN "vRec"."chargeFullMonthOnPurchase" ELSE t."chargeFullMonthOnPurchase" END,
           "costAccountId" = CASE WHEN "pData" ? 'costAccountId' THEN "vRec"."costAccountId" ELSE t."costAccountId" END,
           "accumDepAccountId" = CASE WHEN "pData" ? 'accumDepAccountId' THEN "vRec"."accumDepAccountId" ELSE t."accumDepAccountId" END,
           "depExpenseAccountId" = CASE WHEN "pData" ? 'depExpenseAccountId' THEN "vRec"."depExpenseAccountId" ELSE t."depExpenseAccountId" END,
           "accumulatedDepreciation" = CASE WHEN "pData" ? 'accumulatedDepreciation' THEN "vRec"."accumulatedDepreciation" ELSE t."accumulatedDepreciation" END,
           "depreciatedThrough" = CASE WHEN "pData" ? 'depreciatedThrough' THEN "vRec"."depreciatedThrough" ELSE t."depreciatedThrough" END,
           "taxWdv" = CASE WHEN "pData" ? 'taxWdv' THEN "vRec"."taxWdv" ELSE t."taxWdv" END,
           "registrationNo" = CASE WHEN "pData" ? 'registrationNo' THEN "vRec"."registrationNo" ELSE t."registrationNo" END,
           "engineNo" = CASE WHEN "pData" ? 'engineNo' THEN "vRec"."engineNo" ELSE t."engineNo" END,
           "chassisNo" = CASE WHEN "pData" ? 'chassisNo' THEN "vRec"."chassisNo" ELSE t."chassisNo" END,
           insurer = CASE WHEN "pData" ? 'insurer' THEN "vRec".insurer ELSE t.insurer END,
           "insurancePolicyNo" = CASE WHEN "pData" ? 'insurancePolicyNo' THEN "vRec"."insurancePolicyNo" ELSE t."insurancePolicyNo" END,
           "insurancePremium" = CASE WHEN "pData" ? 'insurancePremium' THEN "vRec"."insurancePremium" ELSE t."insurancePremium" END,
           "insuranceExpiry" = CASE WHEN "pData" ? 'insuranceExpiry' THEN "vRec"."insuranceExpiry" ELSE t."insuranceExpiry" END,
           "lastVerifiedOn" = CASE WHEN "pData" ? 'lastVerifiedOn' THEN "vRec"."lastVerifiedOn" ELSE t."lastVerifiedOn" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "disposedOn" = CASE WHEN "pData" ? 'disposedOn' THEN "vRec"."disposedOn" ELSE t."disposedOn" END,
           "capitalisedByUserId" = CASE WHEN "pData" ? 'capitalisedByUserId' THEN "vRec"."capitalisedByUserId" ELSE t."capitalisedByUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "FixedAssets"."FixedAssets" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'FixedAssets %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'FixedAssets % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "FixedAssets"."fixedAssetAddUpdate"(jsonb) IS 'Save (insert or update) one FixedAssets record.';

-- FixedAssets: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "FixedAssets"."getFixedAssetInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('methodLabel', "Lookups"."getLookupLabel"('FixedAssetMethod', t.method) ->> 'label', 'methodTone', "Lookups"."getLookupLabel"('FixedAssetMethod', t.method) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('FixedAssetStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('FixedAssetStatus', t.status) ->> 'tone')
    FROM "FixedAssets"."FixedAssets" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "FixedAssets"."getFixedAssetInfo"(uuid) IS 'Read one FixedAssets record (getter for its screens).';

-- AssetTransfers: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "FixedAssets"."assetTransferAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "FixedAssets"."AssetTransfers";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"FixedAssets"."AssetTransfers", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "FixedAssets"."AssetTransfers" ("tenantId", "assetId", "fromBranchId", "toBranchId", "fromCustodianEmployeeId", "toCustodianEmployeeId", "effectiveDate", reason, "requestedByUserId", "completedAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'assetId' THEN "vRec"."assetId" ELSE NULL END, CASE WHEN "pData" ? 'fromBranchId' THEN "vRec"."fromBranchId" ELSE NULL END, CASE WHEN "pData" ? 'toBranchId' THEN "vRec"."toBranchId" ELSE NULL END, CASE WHEN "pData" ? 'fromCustodianEmployeeId' THEN "vRec"."fromCustodianEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'toCustodianEmployeeId' THEN "vRec"."toCustodianEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'effectiveDate' THEN "vRec"."effectiveDate" ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'requestedByUserId' THEN "vRec"."requestedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'completedAt' THEN "vRec"."completedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "FixedAssets"."AssetTransfers" t
       SET "assetId" = CASE WHEN "pData" ? 'assetId' THEN "vRec"."assetId" ELSE t."assetId" END,
           "fromBranchId" = CASE WHEN "pData" ? 'fromBranchId' THEN "vRec"."fromBranchId" ELSE t."fromBranchId" END,
           "toBranchId" = CASE WHEN "pData" ? 'toBranchId' THEN "vRec"."toBranchId" ELSE t."toBranchId" END,
           "fromCustodianEmployeeId" = CASE WHEN "pData" ? 'fromCustodianEmployeeId' THEN "vRec"."fromCustodianEmployeeId" ELSE t."fromCustodianEmployeeId" END,
           "toCustodianEmployeeId" = CASE WHEN "pData" ? 'toCustodianEmployeeId' THEN "vRec"."toCustodianEmployeeId" ELSE t."toCustodianEmployeeId" END,
           "effectiveDate" = CASE WHEN "pData" ? 'effectiveDate' THEN "vRec"."effectiveDate" ELSE t."effectiveDate" END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           "requestedByUserId" = CASE WHEN "pData" ? 'requestedByUserId' THEN "vRec"."requestedByUserId" ELSE t."requestedByUserId" END,
           "completedAt" = CASE WHEN "pData" ? 'completedAt' THEN "vRec"."completedAt" ELSE t."completedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "FixedAssets"."AssetTransfers" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'AssetTransfers %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'AssetTransfers % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "FixedAssets"."assetTransferAddUpdate"(jsonb) IS 'Save (insert or update) one AssetTransfers record.';

-- AssetTransfers: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "FixedAssets"."getAssetTransferInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('AssetTransferStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('AssetTransferStatus', t.status) ->> 'tone')
    FROM "FixedAssets"."AssetTransfers" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "FixedAssets"."getAssetTransferInfo"(uuid) IS 'Read one AssetTransfers record (getter for its screens).';

-- AssetTransfers: Approve (status -> APPROVED); allowed from PENDING_APPROVAL
CREATE OR REPLACE FUNCTION "FixedAssets"."assetTransferApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "FixedAssets"."AssetTransfers";
BEGIN
  SELECT * INTO "vRow" FROM "FixedAssets"."AssetTransfers" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AssetTransfers % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'AssetTransfers %: cannot approve from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'AssetTransfers: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"FixedAssets"."assetTransferApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"FixedAssets"."assetTransferApproveEntries"') USING "pId";
  END IF;
  UPDATE "FixedAssets"."AssetTransfers" t SET status = 'APPROVED', "approvedAt" = now(), "approvedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- AssetTransfers: Cancel (status -> CANCELLED); allowed from PENDING_APPROVAL, APPROVED, REJECTED, COMPLETED
CREATE OR REPLACE FUNCTION "FixedAssets"."assetTransferCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "FixedAssets"."AssetTransfers";
BEGIN
  SELECT * INTO "vRow" FROM "FixedAssets"."AssetTransfers" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AssetTransfers % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'COMPLETED') THEN
    RAISE EXCEPTION 'AssetTransfers %: cannot cancel from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"FixedAssets"."assetTransferCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"FixedAssets"."assetTransferCancelEntries"') USING "pId";
  END IF;
  UPDATE "FixedAssets"."AssetTransfers" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- DepreciationRuns: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "FixedAssets"."depreciationRunAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "FixedAssets"."DepreciationRuns";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"FixedAssets"."DepreciationRuns", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('DEP', current_date, "vRec"."branchId");
    END IF;
    INSERT INTO "FixedAssets"."DepreciationRuns" ("tenantId", "docNo", "fiscalPeriodId", "postingDate", "branchId", "categoryId", "assetsCount", "skippedCount", "totalDepreciation", "nbvBefore", "nbvAfter", "computedAt", "computedByUserId", "emailSummary", "notifyUserId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'fiscalPeriodId' THEN "vRec"."fiscalPeriodId" ELSE NULL END, CASE WHEN "pData" ? 'postingDate' THEN "vRec"."postingDate" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'categoryId' THEN "vRec"."categoryId" ELSE NULL END, CASE WHEN "pData" ? 'assetsCount' THEN "vRec"."assetsCount" ELSE 0 END, CASE WHEN "pData" ? 'skippedCount' THEN "vRec"."skippedCount" ELSE 0 END, CASE WHEN "pData" ? 'totalDepreciation' THEN "vRec"."totalDepreciation" ELSE 0 END, CASE WHEN "pData" ? 'nbvBefore' THEN "vRec"."nbvBefore" ELSE NULL END, CASE WHEN "pData" ? 'nbvAfter' THEN "vRec"."nbvAfter" ELSE NULL END, CASE WHEN "pData" ? 'computedAt' THEN "vRec"."computedAt" ELSE NULL END, CASE WHEN "pData" ? 'computedByUserId' THEN "vRec"."computedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'emailSummary' THEN "vRec"."emailSummary" ELSE TRUE END, CASE WHEN "pData" ? 'notifyUserId' THEN "vRec"."notifyUserId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "FixedAssets"."DepreciationRuns" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'DepreciationRuns: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "FixedAssets"."DepreciationRuns" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "fiscalPeriodId" = CASE WHEN "pData" ? 'fiscalPeriodId' THEN "vRec"."fiscalPeriodId" ELSE t."fiscalPeriodId" END,
           "postingDate" = CASE WHEN "pData" ? 'postingDate' THEN "vRec"."postingDate" ELSE t."postingDate" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "categoryId" = CASE WHEN "pData" ? 'categoryId' THEN "vRec"."categoryId" ELSE t."categoryId" END,
           "assetsCount" = CASE WHEN "pData" ? 'assetsCount' THEN "vRec"."assetsCount" ELSE t."assetsCount" END,
           "skippedCount" = CASE WHEN "pData" ? 'skippedCount' THEN "vRec"."skippedCount" ELSE t."skippedCount" END,
           "totalDepreciation" = CASE WHEN "pData" ? 'totalDepreciation' THEN "vRec"."totalDepreciation" ELSE t."totalDepreciation" END,
           "nbvBefore" = CASE WHEN "pData" ? 'nbvBefore' THEN "vRec"."nbvBefore" ELSE t."nbvBefore" END,
           "nbvAfter" = CASE WHEN "pData" ? 'nbvAfter' THEN "vRec"."nbvAfter" ELSE t."nbvAfter" END,
           "computedAt" = CASE WHEN "pData" ? 'computedAt' THEN "vRec"."computedAt" ELSE t."computedAt" END,
           "computedByUserId" = CASE WHEN "pData" ? 'computedByUserId' THEN "vRec"."computedByUserId" ELSE t."computedByUserId" END,
           "emailSummary" = CASE WHEN "pData" ? 'emailSummary' THEN "vRec"."emailSummary" ELSE t."emailSummary" END,
           "notifyUserId" = CASE WHEN "pData" ? 'notifyUserId' THEN "vRec"."notifyUserId" ELSE t."notifyUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "FixedAssets"."DepreciationRuns" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'DepreciationRuns %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'DepreciationRuns % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "FixedAssets"."depreciationRunAddUpdate"(jsonb) IS 'Save (insert or update) one DepreciationRuns record.';

-- DepreciationRuns: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "FixedAssets"."getDepreciationRunInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('DraftPostedCancelledStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('DraftPostedCancelledStatus', t.status) ->> 'tone')
    FROM "FixedAssets"."DepreciationRuns" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "FixedAssets"."getDepreciationRunInfo"(uuid) IS 'Read one DepreciationRuns record (getter for its screens).';

-- DepreciationRuns: Cancel (status -> CANCELLED); allowed from DRAFT, POSTED
CREATE OR REPLACE FUNCTION "FixedAssets"."depreciationRunCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "FixedAssets"."DepreciationRuns";
BEGIN
  SELECT * INTO "vRow" FROM "FixedAssets"."DepreciationRuns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DepreciationRuns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'POSTED') THEN
    RAISE EXCEPTION 'DepreciationRuns %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"FixedAssets"."depreciationRunCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"FixedAssets"."depreciationRunCancelEntries"') USING "pId";
  END IF;
  UPDATE "FixedAssets"."DepreciationRuns" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- AssetDisposals: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "FixedAssets"."assetDisposalAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "FixedAssets"."AssetDisposals";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"FixedAssets"."AssetDisposals", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('DSP', current_date, NULL);
    END IF;
    INSERT INTO "FixedAssets"."AssetDisposals" ("tenantId", "docNo", "assetId", "disposalDate", "disposalType", "buyerName", "customerId", cost, "accumulatedDepreciation", proceeds, "taxCodeId", "gstRate", "gstAmount", "receiveIntoAccountId", "gainAccountId", "lossAccountId", "outputTaxAccountId", remarks)
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'assetId' THEN "vRec"."assetId" ELSE NULL END, CASE WHEN "pData" ? 'disposalDate' THEN "vRec"."disposalDate" ELSE NULL END, CASE WHEN "pData" ? 'disposalType' THEN "vRec"."disposalType" ELSE NULL END, CASE WHEN "pData" ? 'buyerName' THEN "vRec"."buyerName" ELSE NULL END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'cost' THEN "vRec".cost ELSE NULL END, CASE WHEN "pData" ? 'accumulatedDepreciation' THEN "vRec"."accumulatedDepreciation" ELSE NULL END, CASE WHEN "pData" ? 'proceeds' THEN "vRec".proceeds ELSE 0 END, CASE WHEN "pData" ? 'taxCodeId' THEN "vRec"."taxCodeId" ELSE NULL END, CASE WHEN "pData" ? 'gstRate' THEN "vRec"."gstRate" ELSE 0 END, CASE WHEN "pData" ? 'gstAmount' THEN "vRec"."gstAmount" ELSE 0 END, CASE WHEN "pData" ? 'receiveIntoAccountId' THEN "vRec"."receiveIntoAccountId" ELSE NULL END, CASE WHEN "pData" ? 'gainAccountId' THEN "vRec"."gainAccountId" ELSE NULL END, CASE WHEN "pData" ? 'lossAccountId' THEN "vRec"."lossAccountId" ELSE NULL END, CASE WHEN "pData" ? 'outputTaxAccountId' THEN "vRec"."outputTaxAccountId" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "FixedAssets"."AssetDisposals" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'AssetDisposals: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "FixedAssets"."AssetDisposals" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "assetId" = CASE WHEN "pData" ? 'assetId' THEN "vRec"."assetId" ELSE t."assetId" END,
           "disposalDate" = CASE WHEN "pData" ? 'disposalDate' THEN "vRec"."disposalDate" ELSE t."disposalDate" END,
           "disposalType" = CASE WHEN "pData" ? 'disposalType' THEN "vRec"."disposalType" ELSE t."disposalType" END,
           "buyerName" = CASE WHEN "pData" ? 'buyerName' THEN "vRec"."buyerName" ELSE t."buyerName" END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           cost = CASE WHEN "pData" ? 'cost' THEN "vRec".cost ELSE t.cost END,
           "accumulatedDepreciation" = CASE WHEN "pData" ? 'accumulatedDepreciation' THEN "vRec"."accumulatedDepreciation" ELSE t."accumulatedDepreciation" END,
           proceeds = CASE WHEN "pData" ? 'proceeds' THEN "vRec".proceeds ELSE t.proceeds END,
           "taxCodeId" = CASE WHEN "pData" ? 'taxCodeId' THEN "vRec"."taxCodeId" ELSE t."taxCodeId" END,
           "gstRate" = CASE WHEN "pData" ? 'gstRate' THEN "vRec"."gstRate" ELSE t."gstRate" END,
           "gstAmount" = CASE WHEN "pData" ? 'gstAmount' THEN "vRec"."gstAmount" ELSE t."gstAmount" END,
           "receiveIntoAccountId" = CASE WHEN "pData" ? 'receiveIntoAccountId' THEN "vRec"."receiveIntoAccountId" ELSE t."receiveIntoAccountId" END,
           "gainAccountId" = CASE WHEN "pData" ? 'gainAccountId' THEN "vRec"."gainAccountId" ELSE t."gainAccountId" END,
           "lossAccountId" = CASE WHEN "pData" ? 'lossAccountId' THEN "vRec"."lossAccountId" ELSE t."lossAccountId" END,
           "outputTaxAccountId" = CASE WHEN "pData" ? 'outputTaxAccountId' THEN "vRec"."outputTaxAccountId" ELSE t."outputTaxAccountId" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "FixedAssets"."AssetDisposals" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'AssetDisposals %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'AssetDisposals % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "FixedAssets"."assetDisposalAddUpdate"(jsonb) IS 'Save (insert or update) one AssetDisposals record.';

-- AssetDisposals: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "FixedAssets"."getAssetDisposalInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('disposalTypeLabel', "Lookups"."getLookupLabel"('DisposalType', t."disposalType") ->> 'label', 'disposalTypeTone', "Lookups"."getLookupLabel"('DisposalType', t."disposalType") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('AssetDisposalStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('AssetDisposalStatus', t.status) ->> 'tone')
    FROM "FixedAssets"."AssetDisposals" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "FixedAssets"."getAssetDisposalInfo"(uuid) IS 'Read one AssetDisposals record (getter for its screens).';

-- AssetDisposals: Cancel (status -> CANCELLED); allowed from DRAFT, PENDING_APPROVAL, POSTED
CREATE OR REPLACE FUNCTION "FixedAssets"."assetDisposalCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "FixedAssets"."AssetDisposals";
BEGIN
  SELECT * INTO "vRow" FROM "FixedAssets"."AssetDisposals" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AssetDisposals % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_APPROVAL', 'POSTED') THEN
    RAISE EXCEPTION 'AssetDisposals %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"FixedAssets"."assetDisposalCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"FixedAssets"."assetDisposalCancelEntries"') USING "pId";
  END IF;
  UPDATE "FixedAssets"."AssetDisposals" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;
