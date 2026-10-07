-- =============================================================================
-- Finsoft ERP (Full edition) — API: Fixed assets posting hooks
-- Hand-written. Posting itself stays in the existing functions of
-- schema/05-fa.sql ("FixedAssets"."depreciationRunPost", "assetDisposalPost");
-- the generated API has no Post action for them, so no wrapper is needed.
-- These hooks undo a POSTED document when the generated Cancel action runs.
-- Rules: POSTING_RULES.md › Fixed assets.
--
--   depreciationRunCancelEntries  DEP  mirror JV, asset accumulated depreciation rolled back,
--                                      run lines released (deleted) so the period can be re-run
--   assetDisposalCancelEntries    DSP  mirror JV, asset back in the register
--
-- No GL effect: assetTransferApprove / assetTransferCancel (transfer = no journal).
-- =============================================================================

-- Depreciation run — Cancel of a POSTED run (the latest charge of each asset only).
CREATE OR REPLACE FUNCTION "FixedAssets"."depreciationRunCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRun"    record;
  "vCode"   text;
BEGIN
  SELECT r.id, r."docNo", r.status, r."postingDate" INTO "vRun"
    FROM "FixedAssets"."DepreciationRuns" r
   WHERE r."tenantId" = "vTenant" AND r.id = "pId"
     FOR UPDATE;
  IF NOT FOUND OR "vRun".status <> 'POSTED' THEN
    RETURN;                                   -- a DRAFT run has posted nothing
  END IF;

  -- a later period already charged on one of these assets would break the NBV chain
  SELECT a.code INTO "vCode"
    FROM "FixedAssets"."DepreciationRunLines" l
    JOIN "Accounting"."FiscalPeriods" p ON p."tenantId" = l."tenantId" AND p.id = l."fiscalPeriodId"
    JOIN "FixedAssets"."DepreciationRunLines" l2 ON l2."tenantId" = l."tenantId" AND l2."assetId" = l."assetId"
                                                 AND l2."depreciationRunId" <> l."depreciationRunId"
    JOIN "FixedAssets"."DepreciationRuns" r2 ON r2."tenantId" = l2."tenantId" AND r2.id = l2."depreciationRunId"
                                             AND r2.status = 'POSTED'
    JOIN "Accounting"."FiscalPeriods" p2 ON p2."tenantId" = l2."tenantId" AND p2.id = l2."fiscalPeriodId"
    JOIN "FixedAssets"."FixedAssets" a ON a."tenantId" = l."tenantId" AND a.id = l."assetId"
   WHERE l."tenantId" = "vTenant" AND l."depreciationRunId" = "vRun".id AND p2."startDate" > p."startDate"
   LIMIT 1;
  IF "vCode" IS NOT NULL THEN
    RAISE EXCEPTION 'Depreciation run %: asset % has a later posted charge; cancel the later run first', "vRun"."docNo", "vCode"
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  SELECT a.code INTO "vCode"
    FROM "FixedAssets"."DepreciationRunLines" l
    JOIN "FixedAssets"."FixedAssets" a ON a."tenantId" = l."tenantId" AND a.id = l."assetId"
   WHERE l."tenantId" = "vTenant" AND l."depreciationRunId" = "vRun".id AND a.status = 'DISPOSED'
   LIMIT 1;
  IF "vCode" IS NOT NULL THEN
    RAISE EXCEPTION 'Depreciation run %: asset % is disposed; cancel the disposal first', "vRun"."docNo", "vCode"
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- mirror JV in the same period: Dr accumulated depreciation / Cr depreciation expense
  PERFORM "Accounting"."journalReverseForSource"('DEP', "vRun".id, 'OTHER', "vRun"."postingDate");

  UPDATE "FixedAssets"."FixedAssets" a
     SET "accumulatedDepreciation" = a."accumulatedDepreciation" - l.charge,
         "depreciatedThrough" = (SELECT max(p2."endDate")
                                   FROM "FixedAssets"."DepreciationRunLines" l2
                                   JOIN "FixedAssets"."DepreciationRuns" r2
                                     ON r2."tenantId" = l2."tenantId" AND r2.id = l2."depreciationRunId" AND r2.status = 'POSTED'
                                   JOIN "Accounting"."FiscalPeriods" p2 ON p2."tenantId" = l2."tenantId" AND p2.id = l2."fiscalPeriodId"
                                  WHERE l2."tenantId" = a."tenantId" AND l2."assetId" = a.id
                                    AND l2."depreciationRunId" <> l."depreciationRunId"),
         status = CASE WHEN a.status = 'FULLY_DEPRECIATED'
                            AND a.cost - (a."accumulatedDepreciation" - l.charge) > a."residualValue"
                       THEN 'IN_USE' ELSE a.status END
    FROM "FixedAssets"."DepreciationRunLines" l
   WHERE l."tenantId" = "vTenant" AND l."depreciationRunId" = "vRun".id
     AND a."tenantId" = l."tenantId" AND a.id = l."assetId";

  -- the run leaves POSTED here (its posted check needs postedAt cleared together with the
  -- status); the generated action then sets CANCELLED again. Lines are released so the
  -- period can be computed again.
  UPDATE "FixedAssets"."DepreciationRuns" r
     SET status = 'CANCELLED', "postedAt" = NULL
   WHERE r."tenantId" = "vTenant" AND r.id = "vRun".id;
  DELETE FROM "FixedAssets"."DepreciationRunLines" l
   WHERE l."tenantId" = "vTenant" AND l."depreciationRunId" = "vRun".id;
END $$;
COMMENT ON FUNCTION "FixedAssets"."depreciationRunCancelEntries"(uuid) IS
  'Posting hook of FixedAssets.depreciationRunCancel: reverses the DEP journal and rolls asset depreciation back.';


-- Asset disposal — Cancel of a POSTED disposal: mirror JV dated the disposal date
-- (Dr asset cost, Dr output GST, Dr gain | Cr proceeds account, Cr accumulated
-- depreciation, Cr loss) and the asset returns to the register.
CREATE OR REPLACE FUNCTION "FixedAssets"."assetDisposalCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vD"      record;
BEGIN
  SELECT d.id, d.status, d."assetId", d."disposalDate" INTO "vD"
    FROM "FixedAssets"."AssetDisposals" d
   WHERE d."tenantId" = "vTenant" AND d.id = "pId";
  IF NOT FOUND OR "vD".status <> 'POSTED' THEN
    RETURN;
  END IF;

  PERFORM "Accounting"."journalReverseForSource"('DSP', "vD".id, 'OTHER', "vD"."disposalDate");

  UPDATE "FixedAssets"."FixedAssets" a
     SET status = CASE WHEN a.cost - a."accumulatedDepreciation" <= a."residualValue" THEN 'FULLY_DEPRECIATED'
                       WHEN a."depreciatedThrough" IS NULL AND a."accumulatedDepreciation" = 0 THEN 'NEW'
                       ELSE 'IN_USE' END,
         "disposedOn" = NULL
   WHERE a."tenantId" = "vTenant" AND a.id = "vD"."assetId" AND a.status = 'DISPOSED';
END $$;
COMMENT ON FUNCTION "FixedAssets"."assetDisposalCancelEntries"(uuid) IS
  'Posting hook of FixedAssets.assetDisposalCancel: reverses the DSP journal and restores the asset.';
