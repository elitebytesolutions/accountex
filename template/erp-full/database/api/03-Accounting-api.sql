-- =============================================================================
-- Finsoft ERP (Full edition) — API: "Accounting"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- ChartOfAccounts: insert (no "id") or update (with "id"); child arrays: branches
CREATE OR REPLACE FUNCTION "Accounting"."accountAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Accounting"."ChartOfAccounts";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1AccountBranches" "Accounting"."AccountBranches";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Accounting"."ChartOfAccounts", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Accounting"."ChartOfAccounts" ("tenantId", code, name, description, icon, "parentAccountId", level, "accountClass", nature, kind, "subType", "branchId", "currencyCode", "openingBalance", "openingAsOf", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE NULL END, CASE WHEN "pData" ? 'parentAccountId' THEN "vRec"."parentAccountId" ELSE NULL END, CASE WHEN "pData" ? 'level' THEN "vRec".level ELSE NULL END, CASE WHEN "pData" ? 'accountClass' THEN "vRec"."accountClass" ELSE NULL END, CASE WHEN "pData" ? 'nature' THEN "vRec".nature ELSE NULL END, CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE NULL END, CASE WHEN "pData" ? 'subType' THEN "vRec"."subType" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'openingBalance' THEN "vRec"."openingBalance" ELSE 0 END, CASE WHEN "pData" ? 'openingAsOf' THEN "vRec"."openingAsOf" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Accounting"."ChartOfAccounts" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END,
           "parentAccountId" = CASE WHEN "pData" ? 'parentAccountId' THEN "vRec"."parentAccountId" ELSE t."parentAccountId" END,
           level = CASE WHEN "pData" ? 'level' THEN "vRec".level ELSE t.level END,
           "accountClass" = CASE WHEN "pData" ? 'accountClass' THEN "vRec"."accountClass" ELSE t."accountClass" END,
           nature = CASE WHEN "pData" ? 'nature' THEN "vRec".nature ELSE t.nature END,
           kind = CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE t.kind END,
           "subType" = CASE WHEN "pData" ? 'subType' THEN "vRec"."subType" ELSE t."subType" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "openingBalance" = CASE WHEN "pData" ? 'openingBalance' THEN "vRec"."openingBalance" ELSE t."openingBalance" END,
           "openingAsOf" = CASE WHEN "pData" ? 'openingAsOf' THEN "vRec"."openingAsOf" ELSE t."openingAsOf" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Accounting"."ChartOfAccounts" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ChartOfAccounts %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ChartOfAccounts % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'branches' THEN
    -- branches: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Accounting"."AccountBranches"
     WHERE "tenantId" = "vTenant" AND "accountId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'branches') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'branches') WITH ORDINALITY t(x, n) LOOP
      "vC1AccountBranches" := jsonb_populate_record(NULL::"Accounting"."AccountBranches", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Accounting"."AccountBranches" t
           SET "branchId" = CASE WHEN "vE1" ? 'branchId' THEN "vC1AccountBranches"."branchId" ELSE t."branchId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."accountId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'AccountBranches: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Accounting"."AccountBranches" ("accountId", "tenantId", "branchId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'branchId' THEN "vC1AccountBranches"."branchId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Accounting"."accountAddUpdate"(jsonb) IS 'Save (insert or update) one ChartOfAccounts record with its branches.';

-- ChartOfAccounts: one record as JSON (camelCase keys), with lookup labels and branches
CREATE OR REPLACE FUNCTION "Accounting"."getAccountInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('natureLabel', "Lookups"."getLookupLabel"('Nature', t.nature) ->> 'label', 'natureTone', "Lookups"."getLookupLabel"('Nature', t.nature) ->> 'tone', 'kindLabel', "Lookups"."getLookupLabel"('AccountKind', t.kind) ->> 'label', 'kindTone', "Lookups"."getLookupLabel"('AccountKind', t.kind) ->> 'tone', 'subTypeLabel', "Lookups"."getLookupLabel"('AccountSubType', t."subType") ->> 'label', 'subTypeTone', "Lookups"."getLookupLabel"('AccountSubType', t."subType") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone') ||
         jsonb_build_object('branches', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Accounting"."AccountBranches" c1 WHERE c1."accountId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Accounting"."ChartOfAccounts" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Accounting"."getAccountInfo"(uuid) IS 'Read one ChartOfAccounts record (getter for its screens).';

-- CostCentres: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Accounting"."costCentreAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Accounting"."CostCentres";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Accounting"."CostCentres", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Accounting"."CostCentres" ("tenantId", code, name, "parentCostCentreId", "branchId", status, "centreType", "ownerEmployeeId", "annualBudget", icon, tags)
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'parentCostCentreId' THEN "vRec"."parentCostCentreId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'centreType' THEN "vRec"."centreType" ELSE 'DEPARTMENT' END, CASE WHEN "pData" ? 'ownerEmployeeId' THEN "vRec"."ownerEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'annualBudget' THEN "vRec"."annualBudget" ELSE NULL END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE NULL END, CASE WHEN "pData" ? 'tags' THEN "vRec".tags ELSE '{}' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Accounting"."CostCentres" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "parentCostCentreId" = CASE WHEN "pData" ? 'parentCostCentreId' THEN "vRec"."parentCostCentreId" ELSE t."parentCostCentreId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "centreType" = CASE WHEN "pData" ? 'centreType' THEN "vRec"."centreType" ELSE t."centreType" END,
           "ownerEmployeeId" = CASE WHEN "pData" ? 'ownerEmployeeId' THEN "vRec"."ownerEmployeeId" ELSE t."ownerEmployeeId" END,
           "annualBudget" = CASE WHEN "pData" ? 'annualBudget' THEN "vRec"."annualBudget" ELSE t."annualBudget" END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END,
           tags = CASE WHEN "pData" ? 'tags' THEN "vRec".tags ELSE t.tags END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Accounting"."CostCentres" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CostCentres %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CostCentres % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Accounting"."costCentreAddUpdate"(jsonb) IS 'Save (insert or update) one CostCentres record.';

-- CostCentres: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Accounting"."getCostCentreInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone', 'centreTypeLabel', "Lookups"."getLookupLabel"('CentreType', t."centreType") ->> 'label', 'centreTypeTone', "Lookups"."getLookupLabel"('CentreType', t."centreType") ->> 'tone')
    FROM "Accounting"."CostCentres" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Accounting"."getCostCentreInfo"(uuid) IS 'Read one CostCentres record (getter for its screens).';

-- FiscalYears: insert (no "id") or update (with "id"); child arrays: periods
CREATE OR REPLACE FUNCTION "Accounting"."fiscalYearAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Accounting"."FiscalYears";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1FiscalPeriods" "Accounting"."FiscalPeriods";
  "vC2PeriodModuleLocks" "Accounting"."PeriodModuleLocks";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
  "vE2" jsonb;  "vO2" bigint;  "vCid2" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Accounting"."FiscalYears", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Accounting"."FiscalYears" ("tenantId", code, "startDate", "endDate", status, "isLocked", "hasAdjustmentPeriod", "closedAt", "closedByUserId", "closingJournalEntryId", "netProfitTransferred", "auditorName")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'startDate' THEN "vRec"."startDate" ELSE NULL END, CASE WHEN "pData" ? 'endDate' THEN "vRec"."endDate" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'OPEN' END, CASE WHEN "pData" ? 'isLocked' THEN "vRec"."isLocked" ELSE FALSE END, CASE WHEN "pData" ? 'hasAdjustmentPeriod' THEN "vRec"."hasAdjustmentPeriod" ELSE FALSE END, CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE NULL END, CASE WHEN "pData" ? 'closedByUserId' THEN "vRec"."closedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'closingJournalEntryId' THEN "vRec"."closingJournalEntryId" ELSE NULL END, CASE WHEN "pData" ? 'netProfitTransferred' THEN "vRec"."netProfitTransferred" ELSE NULL END, CASE WHEN "pData" ? 'auditorName' THEN "vRec"."auditorName" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Accounting"."FiscalYears" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           "startDate" = CASE WHEN "pData" ? 'startDate' THEN "vRec"."startDate" ELSE t."startDate" END,
           "endDate" = CASE WHEN "pData" ? 'endDate' THEN "vRec"."endDate" ELSE t."endDate" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "isLocked" = CASE WHEN "pData" ? 'isLocked' THEN "vRec"."isLocked" ELSE t."isLocked" END,
           "hasAdjustmentPeriod" = CASE WHEN "pData" ? 'hasAdjustmentPeriod' THEN "vRec"."hasAdjustmentPeriod" ELSE t."hasAdjustmentPeriod" END,
           "closedAt" = CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE t."closedAt" END,
           "closedByUserId" = CASE WHEN "pData" ? 'closedByUserId' THEN "vRec"."closedByUserId" ELSE t."closedByUserId" END,
           "closingJournalEntryId" = CASE WHEN "pData" ? 'closingJournalEntryId' THEN "vRec"."closingJournalEntryId" ELSE t."closingJournalEntryId" END,
           "netProfitTransferred" = CASE WHEN "pData" ? 'netProfitTransferred' THEN "vRec"."netProfitTransferred" ELSE t."netProfitTransferred" END,
           "auditorName" = CASE WHEN "pData" ? 'auditorName' THEN "vRec"."auditorName" ELSE t."auditorName" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Accounting"."FiscalYears" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'FiscalYears %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'FiscalYears % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'periods' THEN
    -- periods: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Accounting"."FiscalPeriods"
     WHERE "tenantId" = "vTenant" AND "fiscalYearId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'periods') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'periods') WITH ORDINALITY t(x, n) LOOP
      "vC1FiscalPeriods" := jsonb_populate_record(NULL::"Accounting"."FiscalPeriods", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Accounting"."FiscalPeriods" t
           SET "periodNo" = CASE WHEN "vE1" ? 'periodNo' THEN "vC1FiscalPeriods"."periodNo" ELSE t."periodNo" END,
               code = CASE WHEN "vE1" ? 'code' THEN "vC1FiscalPeriods".code ELSE t.code END,
               "startDate" = CASE WHEN "vE1" ? 'startDate' THEN "vC1FiscalPeriods"."startDate" ELSE t."startDate" END,
               "endDate" = CASE WHEN "vE1" ? 'endDate' THEN "vC1FiscalPeriods"."endDate" ELSE t."endDate" END,
               "isAdjustment" = CASE WHEN "vE1" ? 'isAdjustment' THEN "vC1FiscalPeriods"."isAdjustment" ELSE t."isAdjustment" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1FiscalPeriods".status ELSE t.status END,
               "closeTargetDate" = CASE WHEN "vE1" ? 'closeTargetDate' THEN "vC1FiscalPeriods"."closeTargetDate" ELSE t."closeTargetDate" END,
               "closedAt" = CASE WHEN "vE1" ? 'closedAt' THEN "vC1FiscalPeriods"."closedAt" ELSE t."closedAt" END,
               "closedByUserId" = CASE WHEN "vE1" ? 'closedByUserId' THEN "vC1FiscalPeriods"."closedByUserId" ELSE t."closedByUserId" END,
               "lockedAt" = CASE WHEN "vE1" ? 'lockedAt' THEN "vC1FiscalPeriods"."lockedAt" ELSE t."lockedAt" END,
               "lockedByUserId" = CASE WHEN "vE1" ? 'lockedByUserId' THEN "vC1FiscalPeriods"."lockedByUserId" ELSE t."lockedByUserId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."fiscalYearId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'FiscalPeriods: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Accounting"."FiscalPeriods" ("fiscalYearId", "tenantId", "periodNo", code, "startDate", "endDate", "isAdjustment", status, "closeTargetDate", "closedAt", "closedByUserId", "lockedAt", "lockedByUserId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'periodNo' THEN "vC1FiscalPeriods"."periodNo" ELSE NULL END, CASE WHEN "vE1" ? 'code' THEN "vC1FiscalPeriods".code ELSE NULL END, CASE WHEN "vE1" ? 'startDate' THEN "vC1FiscalPeriods"."startDate" ELSE NULL END, CASE WHEN "vE1" ? 'endDate' THEN "vC1FiscalPeriods"."endDate" ELSE NULL END, CASE WHEN "vE1" ? 'isAdjustment' THEN "vC1FiscalPeriods"."isAdjustment" ELSE FALSE END, CASE WHEN "vE1" ? 'status' THEN "vC1FiscalPeriods".status ELSE 'OPEN' END, CASE WHEN "vE1" ? 'closeTargetDate' THEN "vC1FiscalPeriods"."closeTargetDate" ELSE NULL END, CASE WHEN "vE1" ? 'closedAt' THEN "vC1FiscalPeriods"."closedAt" ELSE NULL END, CASE WHEN "vE1" ? 'closedByUserId' THEN "vC1FiscalPeriods"."closedByUserId" ELSE NULL END, CASE WHEN "vE1" ? 'lockedAt' THEN "vC1FiscalPeriods"."lockedAt" ELSE NULL END, CASE WHEN "vE1" ? 'lockedByUserId' THEN "vC1FiscalPeriods"."lockedByUserId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

  IF "vE1" ? 'moduleLocks' THEN
    -- moduleLocks: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Accounting"."PeriodModuleLocks"
     WHERE "tenantId" = "vTenant" AND "fiscalPeriodId" = "vCid1"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("vE1" -> 'moduleLocks') x WHERE x ? 'id');
    FOR "vE2", "vO2" IN SELECT x, n FROM jsonb_array_elements("vE1" -> 'moduleLocks') WITH ORDINALITY t(x, n) LOOP
      "vC2PeriodModuleLocks" := jsonb_populate_record(NULL::"Accounting"."PeriodModuleLocks", "vE2");
      IF "vE2" ? 'id' THEN
        UPDATE "Accounting"."PeriodModuleLocks" t
           SET "moduleCode" = CASE WHEN "vE2" ? 'moduleCode' THEN "vC2PeriodModuleLocks"."moduleCode" ELSE t."moduleCode" END,
               status = CASE WHEN "vE2" ? 'status' THEN "vC2PeriodModuleLocks".status ELSE t.status END,
               "closedAt" = CASE WHEN "vE2" ? 'closedAt' THEN "vC2PeriodModuleLocks"."closedAt" ELSE t."closedAt" END,
               "closedByUserId" = CASE WHEN "vE2" ? 'closedByUserId' THEN "vC2PeriodModuleLocks"."closedByUserId" ELSE t."closedByUserId" END
         WHERE t.id = ("vE2" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."fiscalPeriodId" = "vCid1"
        RETURNING t.id INTO "vCid2";
        IF "vCid2" IS NULL THEN
          RAISE EXCEPTION 'PeriodModuleLocks: row % does not belong to this record', "vE2" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Accounting"."PeriodModuleLocks" ("fiscalPeriodId", "tenantId", "moduleCode", status, "closedAt", "closedByUserId")
        VALUES ("vCid1", "vTenant", CASE WHEN "vE2" ? 'moduleCode' THEN "vC2PeriodModuleLocks"."moduleCode" ELSE NULL END, CASE WHEN "vE2" ? 'status' THEN "vC2PeriodModuleLocks".status ELSE 'OPEN' END, CASE WHEN "vE2" ? 'closedAt' THEN "vC2PeriodModuleLocks"."closedAt" ELSE NULL END, CASE WHEN "vE2" ? 'closedByUserId' THEN "vC2PeriodModuleLocks"."closedByUserId" ELSE NULL END)
        RETURNING id INTO "vCid2";
      END IF;

    END LOOP;
  END IF;
    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Accounting"."fiscalYearAddUpdate"(jsonb) IS 'Save (insert or update) one FiscalYears record with its periods.';

-- FiscalYears: one record as JSON (camelCase keys), with lookup labels and periods
CREATE OR REPLACE FUNCTION "Accounting"."getFiscalYearInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('OpenClosedStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('OpenClosedStatus', t.status) ->> 'tone') ||
         jsonb_build_object('periods', COALESCE((SELECT jsonb_agg(to_jsonb(c1) || jsonb_build_object('moduleLocks', COALESCE((SELECT jsonb_agg(to_jsonb(c2) ORDER BY c2."createdAt") FROM "Accounting"."PeriodModuleLocks" c2 WHERE c2."fiscalPeriodId" = c1.id AND c2."tenantId" = c1."tenantId"), '[]'::jsonb)) ORDER BY c1."createdAt") FROM "Accounting"."FiscalPeriods" c1 WHERE c1."fiscalYearId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Accounting"."FiscalYears" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Accounting"."getFiscalYearInfo"(uuid) IS 'Read one FiscalYears record (getter for its screens).';

-- Vouchers: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Accounting"."voucherAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Accounting"."Vouchers";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1VoucherLines" "Accounting"."VoucherLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Accounting"."Vouchers", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"("vRec"."voucherType", "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Accounting"."Vouchers" ("tenantId", "voucherType", "docNo", "docDate", "postingDate", "fiscalPeriodId", "referenceNo", "branchId", department, "currencyCode", "fxRate", narration, remarks, tags, "cashBankAccountId", "partyName", "instrumentType", "instrumentNo", "instrumentDate", "autoReverseOn", "totalDebit", "totalCredit", "preparedByUserId", "sourceDocType", "sourceDocId", "sourceDocNo", "reversalReason", "reversalRemarks", "reversalDate", "recurringTemplateId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'voucherType' THEN "vRec"."voucherType" ELSE NULL END, "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'postingDate' THEN "vRec"."postingDate" ELSE NULL END, CASE WHEN "pData" ? 'fiscalPeriodId' THEN "vRec"."fiscalPeriodId" ELSE NULL END, CASE WHEN "pData" ? 'referenceNo' THEN "vRec"."referenceNo" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'department' THEN "vRec".department ELSE NULL END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE 1 END, CASE WHEN "pData" ? 'narration' THEN "vRec".narration ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'tags' THEN "vRec".tags ELSE '{}' END, CASE WHEN "pData" ? 'cashBankAccountId' THEN "vRec"."cashBankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'partyName' THEN "vRec"."partyName" ELSE NULL END, CASE WHEN "pData" ? 'instrumentType' THEN "vRec"."instrumentType" ELSE NULL END, CASE WHEN "pData" ? 'instrumentNo' THEN "vRec"."instrumentNo" ELSE NULL END, CASE WHEN "pData" ? 'instrumentDate' THEN "vRec"."instrumentDate" ELSE NULL END, CASE WHEN "pData" ? 'autoReverseOn' THEN "vRec"."autoReverseOn" ELSE NULL END, CASE WHEN "pData" ? 'totalDebit' THEN "vRec"."totalDebit" ELSE 0 END, CASE WHEN "pData" ? 'totalCredit' THEN "vRec"."totalCredit" ELSE 0 END, CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'sourceDocType' THEN "vRec"."sourceDocType" ELSE NULL END, CASE WHEN "pData" ? 'sourceDocId' THEN "vRec"."sourceDocId" ELSE NULL END, CASE WHEN "pData" ? 'sourceDocNo' THEN "vRec"."sourceDocNo" ELSE NULL END, CASE WHEN "pData" ? 'reversalReason' THEN "vRec"."reversalReason" ELSE NULL END, CASE WHEN "pData" ? 'reversalRemarks' THEN "vRec"."reversalRemarks" ELSE NULL END, CASE WHEN "pData" ? 'reversalDate' THEN "vRec"."reversalDate" ELSE NULL END, CASE WHEN "pData" ? 'recurringTemplateId' THEN "vRec"."recurringTemplateId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Accounting"."Vouchers" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'Vouchers: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Accounting"."Vouchers" t
       SET "voucherType" = CASE WHEN "pData" ? 'voucherType' THEN "vRec"."voucherType" ELSE t."voucherType" END,
           "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "postingDate" = CASE WHEN "pData" ? 'postingDate' THEN "vRec"."postingDate" ELSE t."postingDate" END,
           "fiscalPeriodId" = CASE WHEN "pData" ? 'fiscalPeriodId' THEN "vRec"."fiscalPeriodId" ELSE t."fiscalPeriodId" END,
           "referenceNo" = CASE WHEN "pData" ? 'referenceNo' THEN "vRec"."referenceNo" ELSE t."referenceNo" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           department = CASE WHEN "pData" ? 'department' THEN "vRec".department ELSE t.department END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "fxRate" = CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE t."fxRate" END,
           narration = CASE WHEN "pData" ? 'narration' THEN "vRec".narration ELSE t.narration END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END,
           tags = CASE WHEN "pData" ? 'tags' THEN "vRec".tags ELSE t.tags END,
           "cashBankAccountId" = CASE WHEN "pData" ? 'cashBankAccountId' THEN "vRec"."cashBankAccountId" ELSE t."cashBankAccountId" END,
           "partyName" = CASE WHEN "pData" ? 'partyName' THEN "vRec"."partyName" ELSE t."partyName" END,
           "instrumentType" = CASE WHEN "pData" ? 'instrumentType' THEN "vRec"."instrumentType" ELSE t."instrumentType" END,
           "instrumentNo" = CASE WHEN "pData" ? 'instrumentNo' THEN "vRec"."instrumentNo" ELSE t."instrumentNo" END,
           "instrumentDate" = CASE WHEN "pData" ? 'instrumentDate' THEN "vRec"."instrumentDate" ELSE t."instrumentDate" END,
           "autoReverseOn" = CASE WHEN "pData" ? 'autoReverseOn' THEN "vRec"."autoReverseOn" ELSE t."autoReverseOn" END,
           "totalDebit" = CASE WHEN "pData" ? 'totalDebit' THEN "vRec"."totalDebit" ELSE t."totalDebit" END,
           "totalCredit" = CASE WHEN "pData" ? 'totalCredit' THEN "vRec"."totalCredit" ELSE t."totalCredit" END,
           "preparedByUserId" = CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE t."preparedByUserId" END,
           "sourceDocType" = CASE WHEN "pData" ? 'sourceDocType' THEN "vRec"."sourceDocType" ELSE t."sourceDocType" END,
           "sourceDocId" = CASE WHEN "pData" ? 'sourceDocId' THEN "vRec"."sourceDocId" ELSE t."sourceDocId" END,
           "sourceDocNo" = CASE WHEN "pData" ? 'sourceDocNo' THEN "vRec"."sourceDocNo" ELSE t."sourceDocNo" END,
           "reversalReason" = CASE WHEN "pData" ? 'reversalReason' THEN "vRec"."reversalReason" ELSE t."reversalReason" END,
           "reversalRemarks" = CASE WHEN "pData" ? 'reversalRemarks' THEN "vRec"."reversalRemarks" ELSE t."reversalRemarks" END,
           "reversalDate" = CASE WHEN "pData" ? 'reversalDate' THEN "vRec"."reversalDate" ELSE t."reversalDate" END,
           "recurringTemplateId" = CASE WHEN "pData" ? 'recurringTemplateId' THEN "vRec"."recurringTemplateId" ELSE t."recurringTemplateId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Accounting"."Vouchers" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Vouchers %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Vouchers % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Accounting"."VoucherLines"
     WHERE "tenantId" = "vTenant" AND "journalEntryId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1VoucherLines" := jsonb_populate_record(NULL::"Accounting"."VoucherLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1VoucherLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Accounting"."VoucherLines" t
           SET "accountId" = CASE WHEN "vE1" ? 'accountId' THEN "vC1VoucherLines"."accountId" ELSE t."accountId" END,
               particulars = CASE WHEN "vE1" ? 'particulars' THEN "vC1VoucherLines".particulars ELSE t.particulars END,
               debit = CASE WHEN "vE1" ? 'debit' THEN "vC1VoucherLines".debit ELSE t.debit END,
               credit = CASE WHEN "vE1" ? 'credit' THEN "vC1VoucherLines".credit ELSE t.credit END,
               "costCentreId" = CASE WHEN "vE1" ? 'costCentreId' THEN "vC1VoucherLines"."costCentreId" ELSE t."costCentreId" END,
               "branchId" = CASE WHEN "vE1" ? 'branchId' THEN "vC1VoucherLines"."branchId" ELSE t."branchId" END,
               "customerId" = CASE WHEN "vE1" ? 'customerId' THEN "vC1VoucherLines"."customerId" ELSE t."customerId" END,
               "vendorId" = CASE WHEN "vE1" ? 'vendorId' THEN "vC1VoucherLines"."vendorId" ELSE t."vendorId" END,
               "isAutoContra" = CASE WHEN "vE1" ? 'isAutoContra' THEN "vC1VoucherLines"."isAutoContra" ELSE t."isAutoContra" END,
               "projectId" = CASE WHEN "vE1" ? 'projectId' THEN "vC1VoucherLines"."projectId" ELSE t."projectId" END,
               "employeeId" = CASE WHEN "vE1" ? 'employeeId' THEN "vC1VoucherLines"."employeeId" ELSE t."employeeId" END,
               "allocationRuleId" = CASE WHEN "vE1" ? 'allocationRuleId' THEN "vC1VoucherLines"."allocationRuleId" ELSE t."allocationRuleId" END,
               "lineNo" = "vC1VoucherLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."journalEntryId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'VoucherLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Accounting"."VoucherLines" ("journalEntryId", "tenantId", "lineNo", "accountId", particulars, debit, credit, "costCentreId", "branchId", "customerId", "vendorId", "isAutoContra", "projectId", "employeeId", "allocationRuleId")
        VALUES ("vRet", "vTenant", "vC1VoucherLines"."lineNo", CASE WHEN "vE1" ? 'accountId' THEN "vC1VoucherLines"."accountId" ELSE NULL END, CASE WHEN "vE1" ? 'particulars' THEN "vC1VoucherLines".particulars ELSE NULL END, CASE WHEN "vE1" ? 'debit' THEN "vC1VoucherLines".debit ELSE 0 END, CASE WHEN "vE1" ? 'credit' THEN "vC1VoucherLines".credit ELSE 0 END, CASE WHEN "vE1" ? 'costCentreId' THEN "vC1VoucherLines"."costCentreId" ELSE NULL END, CASE WHEN "vE1" ? 'branchId' THEN "vC1VoucherLines"."branchId" ELSE NULL END, CASE WHEN "vE1" ? 'customerId' THEN "vC1VoucherLines"."customerId" ELSE NULL END, CASE WHEN "vE1" ? 'vendorId' THEN "vC1VoucherLines"."vendorId" ELSE NULL END, CASE WHEN "vE1" ? 'isAutoContra' THEN "vC1VoucherLines"."isAutoContra" ELSE FALSE END, CASE WHEN "vE1" ? 'projectId' THEN "vC1VoucherLines"."projectId" ELSE NULL END, CASE WHEN "vE1" ? 'employeeId' THEN "vC1VoucherLines"."employeeId" ELSE NULL END, CASE WHEN "vE1" ? 'allocationRuleId' THEN "vC1VoucherLines"."allocationRuleId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Accounting"."voucherAddUpdate"(jsonb) IS 'Save (insert or update) one Vouchers record with its lines.';

-- Vouchers: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Accounting"."getVoucherInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('voucherTypeLabel', "Lookups"."getLookupLabel"('VoucherType', t."voucherType") ->> 'label', 'voucherTypeTone', "Lookups"."getLookupLabel"('VoucherType', t."voucherType") ->> 'tone', 'instrumentTypeLabel', "Lookups"."getLookupLabel"('VoucherInstrumentType', t."instrumentType") ->> 'label', 'instrumentTypeTone', "Lookups"."getLookupLabel"('VoucherInstrumentType', t."instrumentType") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('VoucherStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('VoucherStatus', t.status) ->> 'tone', 'reversalReasonLabel', "Lookups"."getLookupLabel"('ReversalReason', t."reversalReason") ->> 'label', 'reversalReasonTone', "Lookups"."getLookupLabel"('ReversalReason', t."reversalReason") ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Accounting"."VoucherLines" c1 WHERE c1."journalEntryId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Accounting"."Vouchers" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Accounting"."getVoucherInfo"(uuid) IS 'Read one Vouchers record (getter for its screens).';

-- Vouchers: Post (status -> POSTED); allowed from DRAFT, PENDING_APPROVAL
CREATE OR REPLACE FUNCTION "Accounting"."voucherPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Accounting"."Vouchers";
BEGIN
  SELECT * INTO "vRow" FROM "Accounting"."Vouchers" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vouchers % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'Vouchers %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Accounting"."voucherPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Accounting"."voucherPostEntries"') USING "pId";
  END IF;
  UPDATE "Accounting"."Vouchers" t SET status = 'POSTED', "postedAt" = now(), "postedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- OpeningBalances: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Accounting"."openingBalanceAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Accounting"."OpeningBalances";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1OpeningBalanceLines" "Accounting"."OpeningBalanceLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Accounting"."OpeningBalances", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Accounting"."OpeningBalances" ("tenantId", "fiscalYearId", "asAtDate", "branchId", "suspenseAccountId", "totalDebit", "totalCredit", remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'fiscalYearId' THEN "vRec"."fiscalYearId" ELSE NULL END, CASE WHEN "pData" ? 'asAtDate' THEN "vRec"."asAtDate" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'suspenseAccountId' THEN "vRec"."suspenseAccountId" ELSE NULL END, CASE WHEN "pData" ? 'totalDebit' THEN "vRec"."totalDebit" ELSE 0 END, CASE WHEN "pData" ? 'totalCredit' THEN "vRec"."totalCredit" ELSE 0 END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Accounting"."OpeningBalances" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'OpeningBalances: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Accounting"."OpeningBalances" t
       SET "fiscalYearId" = CASE WHEN "pData" ? 'fiscalYearId' THEN "vRec"."fiscalYearId" ELSE t."fiscalYearId" END,
           "asAtDate" = CASE WHEN "pData" ? 'asAtDate' THEN "vRec"."asAtDate" ELSE t."asAtDate" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "suspenseAccountId" = CASE WHEN "pData" ? 'suspenseAccountId' THEN "vRec"."suspenseAccountId" ELSE t."suspenseAccountId" END,
           "totalDebit" = CASE WHEN "pData" ? 'totalDebit' THEN "vRec"."totalDebit" ELSE t."totalDebit" END,
           "totalCredit" = CASE WHEN "pData" ? 'totalCredit' THEN "vRec"."totalCredit" ELSE t."totalCredit" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Accounting"."OpeningBalances" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'OpeningBalances %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'OpeningBalances % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Accounting"."OpeningBalanceLines"
     WHERE "tenantId" = "vTenant" AND "batchId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1OpeningBalanceLines" := jsonb_populate_record(NULL::"Accounting"."OpeningBalanceLines", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Accounting"."OpeningBalanceLines" t
           SET "accountId" = CASE WHEN "vE1" ? 'accountId' THEN "vC1OpeningBalanceLines"."accountId" ELSE t."accountId" END,
               "branchId" = CASE WHEN "vE1" ? 'branchId' THEN "vC1OpeningBalanceLines"."branchId" ELSE t."branchId" END,
               debit = CASE WHEN "vE1" ? 'debit' THEN "vC1OpeningBalanceLines".debit ELSE t.debit END,
               credit = CASE WHEN "vE1" ? 'credit' THEN "vC1OpeningBalanceLines".credit ELSE t.credit END,
               "customerId" = CASE WHEN "vE1" ? 'customerId' THEN "vC1OpeningBalanceLines"."customerId" ELSE t."customerId" END,
               "vendorId" = CASE WHEN "vE1" ? 'vendorId' THEN "vC1OpeningBalanceLines"."vendorId" ELSE t."vendorId" END,
               remarks = CASE WHEN "vE1" ? 'remarks' THEN "vC1OpeningBalanceLines".remarks ELSE t.remarks END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."batchId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'OpeningBalanceLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Accounting"."OpeningBalanceLines" ("batchId", "tenantId", "accountId", "branchId", debit, credit, "customerId", "vendorId", remarks)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'accountId' THEN "vC1OpeningBalanceLines"."accountId" ELSE NULL END, CASE WHEN "vE1" ? 'branchId' THEN "vC1OpeningBalanceLines"."branchId" ELSE NULL END, CASE WHEN "vE1" ? 'debit' THEN "vC1OpeningBalanceLines".debit ELSE 0 END, CASE WHEN "vE1" ? 'credit' THEN "vC1OpeningBalanceLines".credit ELSE 0 END, CASE WHEN "vE1" ? 'customerId' THEN "vC1OpeningBalanceLines"."customerId" ELSE NULL END, CASE WHEN "vE1" ? 'vendorId' THEN "vC1OpeningBalanceLines"."vendorId" ELSE NULL END, CASE WHEN "vE1" ? 'remarks' THEN "vC1OpeningBalanceLines".remarks ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Accounting"."openingBalanceAddUpdate"(jsonb) IS 'Save (insert or update) one OpeningBalances record with its lines.';

-- OpeningBalances: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Accounting"."getOpeningBalanceInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('OpeningBalanceStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('OpeningBalanceStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Accounting"."OpeningBalanceLines" c1 WHERE c1."batchId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Accounting"."OpeningBalances" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Accounting"."getOpeningBalanceInfo"(uuid) IS 'Read one OpeningBalances record (getter for its screens).';

-- Projects: insert (no "id") or update (with "id"); child arrays: tags
CREATE OR REPLACE FUNCTION "Accounting"."projectAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Accounting"."Projects";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1ProjectTags" "Accounting"."ProjectTags";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Accounting"."Projects", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Accounting"."Projects" ("tenantId", code, name, "ownerEmployeeId", "budgetAmount", "expectedRevenue", "startDate", "endDate", colour, status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'ownerEmployeeId' THEN "vRec"."ownerEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'budgetAmount' THEN "vRec"."budgetAmount" ELSE 0 END, CASE WHEN "pData" ? 'expectedRevenue' THEN "vRec"."expectedRevenue" ELSE 0 END, CASE WHEN "pData" ? 'startDate' THEN "vRec"."startDate" ELSE NULL END, CASE WHEN "pData" ? 'endDate' THEN "vRec"."endDate" ELSE NULL END, CASE WHEN "pData" ? 'colour' THEN "vRec".colour ELSE 'blue' END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'PLANNING' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Accounting"."Projects" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "ownerEmployeeId" = CASE WHEN "pData" ? 'ownerEmployeeId' THEN "vRec"."ownerEmployeeId" ELSE t."ownerEmployeeId" END,
           "budgetAmount" = CASE WHEN "pData" ? 'budgetAmount' THEN "vRec"."budgetAmount" ELSE t."budgetAmount" END,
           "expectedRevenue" = CASE WHEN "pData" ? 'expectedRevenue' THEN "vRec"."expectedRevenue" ELSE t."expectedRevenue" END,
           "startDate" = CASE WHEN "pData" ? 'startDate' THEN "vRec"."startDate" ELSE t."startDate" END,
           "endDate" = CASE WHEN "pData" ? 'endDate' THEN "vRec"."endDate" ELSE t."endDate" END,
           colour = CASE WHEN "pData" ? 'colour' THEN "vRec".colour ELSE t.colour END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Accounting"."Projects" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Projects %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Projects % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'tags' THEN
    -- tags: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Accounting"."ProjectTags"
     WHERE "tenantId" = "vTenant" AND "projectId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'tags') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'tags') WITH ORDINALITY t(x, n) LOOP
      "vC1ProjectTags" := jsonb_populate_record(NULL::"Accounting"."ProjectTags", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Accounting"."ProjectTags" t
           SET tag = CASE WHEN "vE1" ? 'tag' THEN "vC1ProjectTags".tag ELSE t.tag END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."projectId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ProjectTags: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Accounting"."ProjectTags" ("projectId", "tenantId", tag)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'tag' THEN "vC1ProjectTags".tag ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Accounting"."projectAddUpdate"(jsonb) IS 'Save (insert or update) one Projects record with its tags.';

-- Projects: one record as JSON (camelCase keys), with lookup labels and tags
CREATE OR REPLACE FUNCTION "Accounting"."getProjectInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('colourLabel', "Lookups"."getLookupLabel"('ProjectColour', t.colour) ->> 'label', 'colourTone', "Lookups"."getLookupLabel"('ProjectColour', t.colour) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ProjectStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ProjectStatus', t.status) ->> 'tone') ||
         jsonb_build_object('tags', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Accounting"."ProjectTags" c1 WHERE c1."projectId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Accounting"."Projects" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Accounting"."getProjectInfo"(uuid) IS 'Read one Projects record (getter for its screens).';

-- CostAllocationRules: insert (no "id") or update (with "id"); child arrays: splits
CREATE OR REPLACE FUNCTION "Accounting"."costAllocationRuleAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Accounting"."CostAllocationRules";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1CostAllocationSplits" "Accounting"."CostAllocationSplits";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Accounting"."CostAllocationRules", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Accounting"."CostAllocationRules" ("tenantId", name, "accountId", basis, tags, status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE NULL END, CASE WHEN "pData" ? 'basis' THEN "vRec".basis ELSE NULL END, CASE WHEN "pData" ? 'tags' THEN "vRec".tags ELSE '{}' END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Accounting"."CostAllocationRules" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "accountId" = CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE t."accountId" END,
           basis = CASE WHEN "pData" ? 'basis' THEN "vRec".basis ELSE t.basis END,
           tags = CASE WHEN "pData" ? 'tags' THEN "vRec".tags ELSE t.tags END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Accounting"."CostAllocationRules" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CostAllocationRules %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CostAllocationRules % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'splits' THEN
    -- splits: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Accounting"."CostAllocationSplits"
     WHERE "tenantId" = "vTenant" AND "allocationRuleId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'splits') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'splits') WITH ORDINALITY t(x, n) LOOP
      "vC1CostAllocationSplits" := jsonb_populate_record(NULL::"Accounting"."CostAllocationSplits", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Accounting"."CostAllocationSplits" t
           SET "costCentreId" = CASE WHEN "vE1" ? 'costCentreId' THEN "vC1CostAllocationSplits"."costCentreId" ELSE t."costCentreId" END,
               percent = CASE WHEN "vE1" ? 'percent' THEN "vC1CostAllocationSplits".percent ELSE t.percent END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."allocationRuleId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'CostAllocationSplits: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Accounting"."CostAllocationSplits" ("allocationRuleId", "tenantId", "costCentreId", percent)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'costCentreId' THEN "vC1CostAllocationSplits"."costCentreId" ELSE NULL END, CASE WHEN "vE1" ? 'percent' THEN "vC1CostAllocationSplits".percent ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Accounting"."costAllocationRuleAddUpdate"(jsonb) IS 'Save (insert or update) one CostAllocationRules record with its splits.';

-- CostAllocationRules: one record as JSON (camelCase keys), with lookup labels and splits
CREATE OR REPLACE FUNCTION "Accounting"."getCostAllocationRuleInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('basisLabel', "Lookups"."getLookupLabel"('CostAllocationRuleBasis', t.basis) ->> 'label', 'basisTone', "Lookups"."getLookupLabel"('CostAllocationRuleBasis', t.basis) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone') ||
         jsonb_build_object('splits', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Accounting"."CostAllocationSplits" c1 WHERE c1."allocationRuleId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Accounting"."CostAllocationRules" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Accounting"."getCostAllocationRuleInfo"(uuid) IS 'Read one CostAllocationRules record (getter for its screens).';

-- PeriodReopenRequests: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Accounting"."periodReopenRequestAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Accounting"."PeriodReopenRequests";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Accounting"."PeriodReopenRequests", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Accounting"."PeriodReopenRequests" ("tenantId", "fiscalPeriodId", "moduleCode", "previousStatus", "reopenUntil", reason, "requestedByUserId", "approverUserId", "autoReclose", "mfaVerifiedAt", "reclosedAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'fiscalPeriodId' THEN "vRec"."fiscalPeriodId" ELSE NULL END, CASE WHEN "pData" ? 'moduleCode' THEN "vRec"."moduleCode" ELSE NULL END, CASE WHEN "pData" ? 'previousStatus' THEN "vRec"."previousStatus" ELSE NULL END, CASE WHEN "pData" ? 'reopenUntil' THEN "vRec"."reopenUntil" ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'requestedByUserId' THEN "vRec"."requestedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'approverUserId' THEN "vRec"."approverUserId" ELSE NULL END, CASE WHEN "pData" ? 'autoReclose' THEN "vRec"."autoReclose" ELSE TRUE END, CASE WHEN "pData" ? 'mfaVerifiedAt' THEN "vRec"."mfaVerifiedAt" ELSE NULL END, CASE WHEN "pData" ? 'reclosedAt' THEN "vRec"."reclosedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Accounting"."PeriodReopenRequests" t
       SET "fiscalPeriodId" = CASE WHEN "pData" ? 'fiscalPeriodId' THEN "vRec"."fiscalPeriodId" ELSE t."fiscalPeriodId" END,
           "moduleCode" = CASE WHEN "pData" ? 'moduleCode' THEN "vRec"."moduleCode" ELSE t."moduleCode" END,
           "previousStatus" = CASE WHEN "pData" ? 'previousStatus' THEN "vRec"."previousStatus" ELSE t."previousStatus" END,
           "reopenUntil" = CASE WHEN "pData" ? 'reopenUntil' THEN "vRec"."reopenUntil" ELSE t."reopenUntil" END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           "requestedByUserId" = CASE WHEN "pData" ? 'requestedByUserId' THEN "vRec"."requestedByUserId" ELSE t."requestedByUserId" END,
           "approverUserId" = CASE WHEN "pData" ? 'approverUserId' THEN "vRec"."approverUserId" ELSE t."approverUserId" END,
           "autoReclose" = CASE WHEN "pData" ? 'autoReclose' THEN "vRec"."autoReclose" ELSE t."autoReclose" END,
           "mfaVerifiedAt" = CASE WHEN "pData" ? 'mfaVerifiedAt' THEN "vRec"."mfaVerifiedAt" ELSE t."mfaVerifiedAt" END,
           "reclosedAt" = CASE WHEN "pData" ? 'reclosedAt' THEN "vRec"."reclosedAt" ELSE t."reclosedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Accounting"."PeriodReopenRequests" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PeriodReopenRequests %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PeriodReopenRequests % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Accounting"."periodReopenRequestAddUpdate"(jsonb) IS 'Save (insert or update) one PeriodReopenRequests record.';

-- PeriodReopenRequests: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Accounting"."getPeriodReopenRequestInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('moduleCodeLabel', "Lookups"."getLookupLabel"('ModuleCode', t."moduleCode") ->> 'label', 'moduleCodeTone', "Lookups"."getLookupLabel"('ModuleCode', t."moduleCode") ->> 'tone', 'previousStatusLabel', "Lookups"."getLookupLabel"('PreviousStatus', t."previousStatus") ->> 'label', 'previousStatusTone', "Lookups"."getLookupLabel"('PreviousStatus', t."previousStatus") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('PeriodReopenRequestStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('PeriodReopenRequestStatus', t.status) ->> 'tone')
    FROM "Accounting"."PeriodReopenRequests" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Accounting"."getPeriodReopenRequestInfo"(uuid) IS 'Read one PeriodReopenRequests record (getter for its screens).';

-- PeriodReopenRequests: Approve (status -> APPROVED); allowed from PENDING
CREATE OR REPLACE FUNCTION "Accounting"."periodReopenRequestApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Accounting"."PeriodReopenRequests";
BEGIN
  SELECT * INTO "vRow" FROM "Accounting"."PeriodReopenRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PeriodReopenRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING') THEN
    RAISE EXCEPTION 'PeriodReopenRequests %: cannot approve from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'PeriodReopenRequests: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Accounting"."periodReopenRequestApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Accounting"."periodReopenRequestApproveEntries"') USING "pId";
  END IF;
  UPDATE "Accounting"."PeriodReopenRequests" t SET status = 'APPROVED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- PeriodReopenRequests: Cancel (status -> CANCELLED); allowed from PENDING, APPROVED, REJECTED, RECLOSED
CREATE OR REPLACE FUNCTION "Accounting"."periodReopenRequestCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Accounting"."PeriodReopenRequests";
BEGIN
  SELECT * INTO "vRow" FROM "Accounting"."PeriodReopenRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PeriodReopenRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING', 'APPROVED', 'REJECTED', 'RECLOSED') THEN
    RAISE EXCEPTION 'PeriodReopenRequests %: cannot cancel from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Accounting"."periodReopenRequestCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Accounting"."periodReopenRequestCancelEntries"') USING "pId";
  END IF;
  UPDATE "Accounting"."PeriodReopenRequests" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- RecurringVoucherTemplates: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Accounting"."recurringVoucherTemplateAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Accounting"."RecurringVoucherTemplates";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1RecurringVoucherTemplateLines" "Accounting"."RecurringVoucherTemplateLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Accounting"."RecurringVoucherTemplates", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Accounting"."RecurringVoucherTemplates" ("tenantId", name, description, "voucherType", frequency, "runDay", "runOnLastDay", "runWeekday", "runMonth", "startDate", "endMode", "endAfterCount", "endOnDate", "branchId", narration, "cashBankAccountId", "partyName", amount, "autoPost", "notifyOnFailure", "notifyUserId", "nextRunDate", "lastRunDate", "occurrencesDone", status, "lastError", "sourceJournalEntryId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'voucherType' THEN "vRec"."voucherType" ELSE NULL END, CASE WHEN "pData" ? 'frequency' THEN "vRec".frequency ELSE NULL END, CASE WHEN "pData" ? 'runDay' THEN "vRec"."runDay" ELSE NULL END, CASE WHEN "pData" ? 'runOnLastDay' THEN "vRec"."runOnLastDay" ELSE FALSE END, CASE WHEN "pData" ? 'runWeekday' THEN "vRec"."runWeekday" ELSE NULL END, CASE WHEN "pData" ? 'runMonth' THEN "vRec"."runMonth" ELSE NULL END, CASE WHEN "pData" ? 'startDate' THEN "vRec"."startDate" ELSE NULL END, CASE WHEN "pData" ? 'endMode' THEN "vRec"."endMode" ELSE 'NEVER' END, CASE WHEN "pData" ? 'endAfterCount' THEN "vRec"."endAfterCount" ELSE NULL END, CASE WHEN "pData" ? 'endOnDate' THEN "vRec"."endOnDate" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'narration' THEN "vRec".narration ELSE NULL END, CASE WHEN "pData" ? 'cashBankAccountId' THEN "vRec"."cashBankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'partyName' THEN "vRec"."partyName" ELSE NULL END, CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE 0 END, CASE WHEN "pData" ? 'autoPost' THEN "vRec"."autoPost" ELSE TRUE END, CASE WHEN "pData" ? 'notifyOnFailure' THEN "vRec"."notifyOnFailure" ELSE TRUE END, CASE WHEN "pData" ? 'notifyUserId' THEN "vRec"."notifyUserId" ELSE NULL END, CASE WHEN "pData" ? 'nextRunDate' THEN "vRec"."nextRunDate" ELSE NULL END, CASE WHEN "pData" ? 'lastRunDate' THEN "vRec"."lastRunDate" ELSE NULL END, CASE WHEN "pData" ? 'occurrencesDone' THEN "vRec"."occurrencesDone" ELSE 0 END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'lastError' THEN "vRec"."lastError" ELSE NULL END, CASE WHEN "pData" ? 'sourceJournalEntryId' THEN "vRec"."sourceJournalEntryId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Accounting"."RecurringVoucherTemplates" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "voucherType" = CASE WHEN "pData" ? 'voucherType' THEN "vRec"."voucherType" ELSE t."voucherType" END,
           frequency = CASE WHEN "pData" ? 'frequency' THEN "vRec".frequency ELSE t.frequency END,
           "runDay" = CASE WHEN "pData" ? 'runDay' THEN "vRec"."runDay" ELSE t."runDay" END,
           "runOnLastDay" = CASE WHEN "pData" ? 'runOnLastDay' THEN "vRec"."runOnLastDay" ELSE t."runOnLastDay" END,
           "runWeekday" = CASE WHEN "pData" ? 'runWeekday' THEN "vRec"."runWeekday" ELSE t."runWeekday" END,
           "runMonth" = CASE WHEN "pData" ? 'runMonth' THEN "vRec"."runMonth" ELSE t."runMonth" END,
           "startDate" = CASE WHEN "pData" ? 'startDate' THEN "vRec"."startDate" ELSE t."startDate" END,
           "endMode" = CASE WHEN "pData" ? 'endMode' THEN "vRec"."endMode" ELSE t."endMode" END,
           "endAfterCount" = CASE WHEN "pData" ? 'endAfterCount' THEN "vRec"."endAfterCount" ELSE t."endAfterCount" END,
           "endOnDate" = CASE WHEN "pData" ? 'endOnDate' THEN "vRec"."endOnDate" ELSE t."endOnDate" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           narration = CASE WHEN "pData" ? 'narration' THEN "vRec".narration ELSE t.narration END,
           "cashBankAccountId" = CASE WHEN "pData" ? 'cashBankAccountId' THEN "vRec"."cashBankAccountId" ELSE t."cashBankAccountId" END,
           "partyName" = CASE WHEN "pData" ? 'partyName' THEN "vRec"."partyName" ELSE t."partyName" END,
           amount = CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE t.amount END,
           "autoPost" = CASE WHEN "pData" ? 'autoPost' THEN "vRec"."autoPost" ELSE t."autoPost" END,
           "notifyOnFailure" = CASE WHEN "pData" ? 'notifyOnFailure' THEN "vRec"."notifyOnFailure" ELSE t."notifyOnFailure" END,
           "notifyUserId" = CASE WHEN "pData" ? 'notifyUserId' THEN "vRec"."notifyUserId" ELSE t."notifyUserId" END,
           "nextRunDate" = CASE WHEN "pData" ? 'nextRunDate' THEN "vRec"."nextRunDate" ELSE t."nextRunDate" END,
           "lastRunDate" = CASE WHEN "pData" ? 'lastRunDate' THEN "vRec"."lastRunDate" ELSE t."lastRunDate" END,
           "occurrencesDone" = CASE WHEN "pData" ? 'occurrencesDone' THEN "vRec"."occurrencesDone" ELSE t."occurrencesDone" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "lastError" = CASE WHEN "pData" ? 'lastError' THEN "vRec"."lastError" ELSE t."lastError" END,
           "sourceJournalEntryId" = CASE WHEN "pData" ? 'sourceJournalEntryId' THEN "vRec"."sourceJournalEntryId" ELSE t."sourceJournalEntryId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Accounting"."RecurringVoucherTemplates" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'RecurringVoucherTemplates %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'RecurringVoucherTemplates % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Accounting"."RecurringVoucherTemplateLines"
     WHERE "tenantId" = "vTenant" AND "recurringTemplateId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1RecurringVoucherTemplateLines" := jsonb_populate_record(NULL::"Accounting"."RecurringVoucherTemplateLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1RecurringVoucherTemplateLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Accounting"."RecurringVoucherTemplateLines" t
           SET "accountId" = CASE WHEN "vE1" ? 'accountId' THEN "vC1RecurringVoucherTemplateLines"."accountId" ELSE t."accountId" END,
               narration = CASE WHEN "vE1" ? 'narration' THEN "vC1RecurringVoucherTemplateLines".narration ELSE t.narration END,
               debit = CASE WHEN "vE1" ? 'debit' THEN "vC1RecurringVoucherTemplateLines".debit ELSE t.debit END,
               credit = CASE WHEN "vE1" ? 'credit' THEN "vC1RecurringVoucherTemplateLines".credit ELSE t.credit END,
               "costCentreId" = CASE WHEN "vE1" ? 'costCentreId' THEN "vC1RecurringVoucherTemplateLines"."costCentreId" ELSE t."costCentreId" END,
               "projectId" = CASE WHEN "vE1" ? 'projectId' THEN "vC1RecurringVoucherTemplateLines"."projectId" ELSE t."projectId" END,
               "branchId" = CASE WHEN "vE1" ? 'branchId' THEN "vC1RecurringVoucherTemplateLines"."branchId" ELSE t."branchId" END,
               "customerId" = CASE WHEN "vE1" ? 'customerId' THEN "vC1RecurringVoucherTemplateLines"."customerId" ELSE t."customerId" END,
               "vendorId" = CASE WHEN "vE1" ? 'vendorId' THEN "vC1RecurringVoucherTemplateLines"."vendorId" ELSE t."vendorId" END,
               "employeeId" = CASE WHEN "vE1" ? 'employeeId' THEN "vC1RecurringVoucherTemplateLines"."employeeId" ELSE t."employeeId" END,
               "lineNo" = "vC1RecurringVoucherTemplateLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."recurringTemplateId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'RecurringVoucherTemplateLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Accounting"."RecurringVoucherTemplateLines" ("recurringTemplateId", "tenantId", "lineNo", "accountId", narration, debit, credit, "costCentreId", "projectId", "branchId", "customerId", "vendorId", "employeeId")
        VALUES ("vRet", "vTenant", "vC1RecurringVoucherTemplateLines"."lineNo", CASE WHEN "vE1" ? 'accountId' THEN "vC1RecurringVoucherTemplateLines"."accountId" ELSE NULL END, CASE WHEN "vE1" ? 'narration' THEN "vC1RecurringVoucherTemplateLines".narration ELSE NULL END, CASE WHEN "vE1" ? 'debit' THEN "vC1RecurringVoucherTemplateLines".debit ELSE 0 END, CASE WHEN "vE1" ? 'credit' THEN "vC1RecurringVoucherTemplateLines".credit ELSE 0 END, CASE WHEN "vE1" ? 'costCentreId' THEN "vC1RecurringVoucherTemplateLines"."costCentreId" ELSE NULL END, CASE WHEN "vE1" ? 'projectId' THEN "vC1RecurringVoucherTemplateLines"."projectId" ELSE NULL END, CASE WHEN "vE1" ? 'branchId' THEN "vC1RecurringVoucherTemplateLines"."branchId" ELSE NULL END, CASE WHEN "vE1" ? 'customerId' THEN "vC1RecurringVoucherTemplateLines"."customerId" ELSE NULL END, CASE WHEN "vE1" ? 'vendorId' THEN "vC1RecurringVoucherTemplateLines"."vendorId" ELSE NULL END, CASE WHEN "vE1" ? 'employeeId' THEN "vC1RecurringVoucherTemplateLines"."employeeId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Accounting"."recurringVoucherTemplateAddUpdate"(jsonb) IS 'Save (insert or update) one RecurringVoucherTemplates record with its lines.';

-- RecurringVoucherTemplates: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Accounting"."getRecurringVoucherTemplateInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('voucherTypeLabel', "Lookups"."getLookupLabel"('RecurringVoucherTemplateVoucherType', t."voucherType") ->> 'label', 'voucherTypeTone', "Lookups"."getLookupLabel"('RecurringVoucherTemplateVoucherType', t."voucherType") ->> 'tone', 'frequencyLabel', "Lookups"."getLookupLabel"('RecurringVoucherTemplateFrequency', t.frequency) ->> 'label', 'frequencyTone', "Lookups"."getLookupLabel"('RecurringVoucherTemplateFrequency', t.frequency) ->> 'tone', 'endModeLabel', "Lookups"."getLookupLabel"('RecurringVoucherTemplateEndMode', t."endMode") ->> 'label', 'endModeTone', "Lookups"."getLookupLabel"('RecurringVoucherTemplateEndMode', t."endMode") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('RecurringVoucherTemplateStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('RecurringVoucherTemplateStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Accounting"."RecurringVoucherTemplateLines" c1 WHERE c1."recurringTemplateId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Accounting"."RecurringVoucherTemplates" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Accounting"."getRecurringVoucherTemplateInfo"(uuid) IS 'Read one RecurringVoucherTemplates record (getter for its screens).';

-- YearEndCloses: insert (no "id") or update (with "id"); child arrays: adjustments
CREATE OR REPLACE FUNCTION "Accounting"."yearEndCloseAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Accounting"."YearEndCloses";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1YearEndAdjustments" "Accounting"."YearEndAdjustments";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Accounting"."YearEndCloses", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Accounting"."YearEndCloses" ("tenantId", "fiscalYearId", "runMode", "asAtDate", "checksTotal", "checksPassed", "checksWarning", checklist, "warningsAcknowledged", "retainedEarningsAccountId", "retainedOpening", "netProfit", "retainedClosing", "closingJournalEntryId", "lockPeriods", "carryForward", "generateAuditPack", "notifyUserIds", "nextOpeningBatchId", "runByUserId", "runAt", "ceoApprovedByUserId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'fiscalYearId' THEN "vRec"."fiscalYearId" ELSE NULL END, CASE WHEN "pData" ? 'runMode' THEN "vRec"."runMode" ELSE NULL END, CASE WHEN "pData" ? 'asAtDate' THEN "vRec"."asAtDate" ELSE NULL END, CASE WHEN "pData" ? 'checksTotal' THEN "vRec"."checksTotal" ELSE 0 END, CASE WHEN "pData" ? 'checksPassed' THEN "vRec"."checksPassed" ELSE 0 END, CASE WHEN "pData" ? 'checksWarning' THEN "vRec"."checksWarning" ELSE 0 END, CASE WHEN "pData" ? 'checklist' THEN "vRec".checklist ELSE CAST('[]' AS jsonb) END, CASE WHEN "pData" ? 'warningsAcknowledged' THEN "vRec"."warningsAcknowledged" ELSE 0 END, CASE WHEN "pData" ? 'retainedEarningsAccountId' THEN "vRec"."retainedEarningsAccountId" ELSE NULL END, CASE WHEN "pData" ? 'retainedOpening' THEN "vRec"."retainedOpening" ELSE NULL END, CASE WHEN "pData" ? 'netProfit' THEN "vRec"."netProfit" ELSE NULL END, CASE WHEN "pData" ? 'retainedClosing' THEN "vRec"."retainedClosing" ELSE NULL END, CASE WHEN "pData" ? 'closingJournalEntryId' THEN "vRec"."closingJournalEntryId" ELSE NULL END, CASE WHEN "pData" ? 'lockPeriods' THEN "vRec"."lockPeriods" ELSE TRUE END, CASE WHEN "pData" ? 'carryForward' THEN "vRec"."carryForward" ELSE TRUE END, CASE WHEN "pData" ? 'generateAuditPack' THEN "vRec"."generateAuditPack" ELSE FALSE END, CASE WHEN "pData" ? 'notifyUserIds' THEN "vRec"."notifyUserIds" ELSE '{}' END, CASE WHEN "pData" ? 'nextOpeningBatchId' THEN "vRec"."nextOpeningBatchId" ELSE NULL END, CASE WHEN "pData" ? 'runByUserId' THEN "vRec"."runByUserId" ELSE NULL END, CASE WHEN "pData" ? 'runAt' THEN "vRec"."runAt" ELSE NULL END, CASE WHEN "pData" ? 'ceoApprovedByUserId' THEN "vRec"."ceoApprovedByUserId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Accounting"."YearEndCloses" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'YearEndCloses: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Accounting"."YearEndCloses" t
       SET "fiscalYearId" = CASE WHEN "pData" ? 'fiscalYearId' THEN "vRec"."fiscalYearId" ELSE t."fiscalYearId" END,
           "runMode" = CASE WHEN "pData" ? 'runMode' THEN "vRec"."runMode" ELSE t."runMode" END,
           "asAtDate" = CASE WHEN "pData" ? 'asAtDate' THEN "vRec"."asAtDate" ELSE t."asAtDate" END,
           "checksTotal" = CASE WHEN "pData" ? 'checksTotal' THEN "vRec"."checksTotal" ELSE t."checksTotal" END,
           "checksPassed" = CASE WHEN "pData" ? 'checksPassed' THEN "vRec"."checksPassed" ELSE t."checksPassed" END,
           "checksWarning" = CASE WHEN "pData" ? 'checksWarning' THEN "vRec"."checksWarning" ELSE t."checksWarning" END,
           checklist = CASE WHEN "pData" ? 'checklist' THEN "vRec".checklist ELSE t.checklist END,
           "warningsAcknowledged" = CASE WHEN "pData" ? 'warningsAcknowledged' THEN "vRec"."warningsAcknowledged" ELSE t."warningsAcknowledged" END,
           "retainedEarningsAccountId" = CASE WHEN "pData" ? 'retainedEarningsAccountId' THEN "vRec"."retainedEarningsAccountId" ELSE t."retainedEarningsAccountId" END,
           "retainedOpening" = CASE WHEN "pData" ? 'retainedOpening' THEN "vRec"."retainedOpening" ELSE t."retainedOpening" END,
           "netProfit" = CASE WHEN "pData" ? 'netProfit' THEN "vRec"."netProfit" ELSE t."netProfit" END,
           "retainedClosing" = CASE WHEN "pData" ? 'retainedClosing' THEN "vRec"."retainedClosing" ELSE t."retainedClosing" END,
           "closingJournalEntryId" = CASE WHEN "pData" ? 'closingJournalEntryId' THEN "vRec"."closingJournalEntryId" ELSE t."closingJournalEntryId" END,
           "lockPeriods" = CASE WHEN "pData" ? 'lockPeriods' THEN "vRec"."lockPeriods" ELSE t."lockPeriods" END,
           "carryForward" = CASE WHEN "pData" ? 'carryForward' THEN "vRec"."carryForward" ELSE t."carryForward" END,
           "generateAuditPack" = CASE WHEN "pData" ? 'generateAuditPack' THEN "vRec"."generateAuditPack" ELSE t."generateAuditPack" END,
           "notifyUserIds" = CASE WHEN "pData" ? 'notifyUserIds' THEN "vRec"."notifyUserIds" ELSE t."notifyUserIds" END,
           "nextOpeningBatchId" = CASE WHEN "pData" ? 'nextOpeningBatchId' THEN "vRec"."nextOpeningBatchId" ELSE t."nextOpeningBatchId" END,
           "runByUserId" = CASE WHEN "pData" ? 'runByUserId' THEN "vRec"."runByUserId" ELSE t."runByUserId" END,
           "runAt" = CASE WHEN "pData" ? 'runAt' THEN "vRec"."runAt" ELSE t."runAt" END,
           "ceoApprovedByUserId" = CASE WHEN "pData" ? 'ceoApprovedByUserId' THEN "vRec"."ceoApprovedByUserId" ELSE t."ceoApprovedByUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Accounting"."YearEndCloses" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'YearEndCloses %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'YearEndCloses % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'adjustments' THEN
    -- adjustments: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Accounting"."YearEndAdjustments"
     WHERE "tenantId" = "vTenant" AND "yearEndCloseId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'adjustments') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'adjustments') WITH ORDINALITY t(x, n) LOOP
      "vC1YearEndAdjustments" := jsonb_populate_record(NULL::"Accounting"."YearEndAdjustments", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Accounting"."YearEndAdjustments" t
           SET description = CASE WHEN "vE1" ? 'description' THEN "vC1YearEndAdjustments".description ELSE t.description END,
               "debitAccountId" = CASE WHEN "vE1" ? 'debitAccountId' THEN "vC1YearEndAdjustments"."debitAccountId" ELSE t."debitAccountId" END,
               "creditAccountId" = CASE WHEN "vE1" ? 'creditAccountId' THEN "vC1YearEndAdjustments"."creditAccountId" ELSE t."creditAccountId" END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1YearEndAdjustments".amount ELSE t.amount END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1YearEndAdjustments".status ELSE t.status END,
               "isIncluded" = CASE WHEN "vE1" ? 'isIncluded' THEN "vC1YearEndAdjustments"."isIncluded" ELSE t."isIncluded" END,
               "journalEntryId" = CASE WHEN "vE1" ? 'journalEntryId' THEN "vC1YearEndAdjustments"."journalEntryId" ELSE t."journalEntryId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."yearEndCloseId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'YearEndAdjustments: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Accounting"."YearEndAdjustments" ("yearEndCloseId", "tenantId", description, "debitAccountId", "creditAccountId", amount, status, "isIncluded", "journalEntryId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'description' THEN "vC1YearEndAdjustments".description ELSE NULL END, CASE WHEN "vE1" ? 'debitAccountId' THEN "vC1YearEndAdjustments"."debitAccountId" ELSE NULL END, CASE WHEN "vE1" ? 'creditAccountId' THEN "vC1YearEndAdjustments"."creditAccountId" ELSE NULL END, CASE WHEN "vE1" ? 'amount' THEN "vC1YearEndAdjustments".amount ELSE NULL END, CASE WHEN "vE1" ? 'status' THEN "vC1YearEndAdjustments".status ELSE 'PROPOSED' END, CASE WHEN "vE1" ? 'isIncluded' THEN "vC1YearEndAdjustments"."isIncluded" ELSE FALSE END, CASE WHEN "vE1" ? 'journalEntryId' THEN "vC1YearEndAdjustments"."journalEntryId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Accounting"."yearEndCloseAddUpdate"(jsonb) IS 'Save (insert or update) one YearEndCloses record with its adjustments.';

-- YearEndCloses: one record as JSON (camelCase keys), with lookup labels and adjustments
CREATE OR REPLACE FUNCTION "Accounting"."getYearEndCloseInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('runModeLabel', "Lookups"."getLookupLabel"('RunMode', t."runMode") ->> 'label', 'runModeTone', "Lookups"."getLookupLabel"('RunMode', t."runMode") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('YearEndCloseStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('YearEndCloseStatus', t.status) ->> 'tone') ||
         jsonb_build_object('adjustments', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Accounting"."YearEndAdjustments" c1 WHERE c1."yearEndCloseId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Accounting"."YearEndCloses" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Accounting"."getYearEndCloseInfo"(uuid) IS 'Read one YearEndCloses record (getter for its screens).';

-- YearEndCloses: Cancel (status -> CANCELLED); allowed from DRAFT, COMPLETED, FAILED
CREATE OR REPLACE FUNCTION "Accounting"."yearEndCloseCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Accounting"."YearEndCloses";
BEGIN
  SELECT * INTO "vRow" FROM "Accounting"."YearEndCloses" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YearEndCloses % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'COMPLETED', 'FAILED') THEN
    RAISE EXCEPTION 'YearEndCloses %: cannot cancel from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Accounting"."yearEndCloseCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Accounting"."yearEndCloseCancelEntries"') USING "pId";
  END IF;
  UPDATE "Accounting"."YearEndCloses" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- Budgets: insert (no "id") or update (with "id"); child arrays: versions
CREATE OR REPLACE FUNCTION "Accounting"."budgetAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Accounting"."Budgets";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1BudgetVersions" "Accounting"."BudgetVersions";
  "vC2BudgetVersionLines" "Accounting"."BudgetVersionLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
  "vE2" jsonb;  "vO2" bigint;  "vCid2" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Accounting"."Budgets", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Accounting"."Budgets" ("tenantId", code, name, "fiscalYearId", "budgetType", "scopeLabel", department, "costCentreId", "projectId", "branchId", "ownerUserId", "seedFrom", "seedUpliftPct", "requiresCeoApproval", "currentVersionId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'fiscalYearId' THEN "vRec"."fiscalYearId" ELSE NULL END, CASE WHEN "pData" ? 'budgetType' THEN "vRec"."budgetType" ELSE NULL END, CASE WHEN "pData" ? 'scopeLabel' THEN "vRec"."scopeLabel" ELSE NULL END, CASE WHEN "pData" ? 'department' THEN "vRec".department ELSE NULL END, CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE NULL END, CASE WHEN "pData" ? 'projectId' THEN "vRec"."projectId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'ownerUserId' THEN "vRec"."ownerUserId" ELSE NULL END, CASE WHEN "pData" ? 'seedFrom' THEN "vRec"."seedFrom" ELSE 'BLANK' END, CASE WHEN "pData" ? 'seedUpliftPct' THEN "vRec"."seedUpliftPct" ELSE NULL END, CASE WHEN "pData" ? 'requiresCeoApproval' THEN "vRec"."requiresCeoApproval" ELSE TRUE END, CASE WHEN "pData" ? 'currentVersionId' THEN "vRec"."currentVersionId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Accounting"."Budgets" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'Budgets: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Accounting"."Budgets" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "fiscalYearId" = CASE WHEN "pData" ? 'fiscalYearId' THEN "vRec"."fiscalYearId" ELSE t."fiscalYearId" END,
           "budgetType" = CASE WHEN "pData" ? 'budgetType' THEN "vRec"."budgetType" ELSE t."budgetType" END,
           "scopeLabel" = CASE WHEN "pData" ? 'scopeLabel' THEN "vRec"."scopeLabel" ELSE t."scopeLabel" END,
           department = CASE WHEN "pData" ? 'department' THEN "vRec".department ELSE t.department END,
           "costCentreId" = CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE t."costCentreId" END,
           "projectId" = CASE WHEN "pData" ? 'projectId' THEN "vRec"."projectId" ELSE t."projectId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "ownerUserId" = CASE WHEN "pData" ? 'ownerUserId' THEN "vRec"."ownerUserId" ELSE t."ownerUserId" END,
           "seedFrom" = CASE WHEN "pData" ? 'seedFrom' THEN "vRec"."seedFrom" ELSE t."seedFrom" END,
           "seedUpliftPct" = CASE WHEN "pData" ? 'seedUpliftPct' THEN "vRec"."seedUpliftPct" ELSE t."seedUpliftPct" END,
           "requiresCeoApproval" = CASE WHEN "pData" ? 'requiresCeoApproval' THEN "vRec"."requiresCeoApproval" ELSE t."requiresCeoApproval" END,
           "currentVersionId" = CASE WHEN "pData" ? 'currentVersionId' THEN "vRec"."currentVersionId" ELSE t."currentVersionId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Accounting"."Budgets" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Budgets %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Budgets % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'versions' THEN
    -- versions: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Accounting"."BudgetVersions"
     WHERE "tenantId" = "vTenant" AND "budgetId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'versions') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'versions') WITH ORDINALITY t(x, n) LOOP
      "vC1BudgetVersions" := jsonb_populate_record(NULL::"Accounting"."BudgetVersions", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Accounting"."BudgetVersions" t
           SET "versionNo" = CASE WHEN "vE1" ? 'versionNo' THEN "vC1BudgetVersions"."versionNo" ELSE t."versionNo" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1BudgetVersions".status ELSE t.status END,
               notes = CASE WHEN "vE1" ? 'notes' THEN "vC1BudgetVersions".notes ELSE t.notes END,
               "approvedByUserId" = CASE WHEN "vE1" ? 'approvedByUserId' THEN "vC1BudgetVersions"."approvedByUserId" ELSE t."approvedByUserId" END,
               "approvedAt" = CASE WHEN "vE1" ? 'approvedAt' THEN "vC1BudgetVersions"."approvedAt" ELSE t."approvedAt" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."budgetId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'BudgetVersions: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Accounting"."BudgetVersions" ("budgetId", "tenantId", "versionNo", status, notes, "approvedByUserId", "approvedAt")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'versionNo' THEN "vC1BudgetVersions"."versionNo" ELSE NULL END, CASE WHEN "vE1" ? 'status' THEN "vC1BudgetVersions".status ELSE 'DRAFT' END, CASE WHEN "vE1" ? 'notes' THEN "vC1BudgetVersions".notes ELSE NULL END, CASE WHEN "vE1" ? 'approvedByUserId' THEN "vC1BudgetVersions"."approvedByUserId" ELSE NULL END, CASE WHEN "vE1" ? 'approvedAt' THEN "vC1BudgetVersions"."approvedAt" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

  IF "vE1" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Accounting"."BudgetVersionLines"
     WHERE "tenantId" = "vTenant" AND "budgetVersionId" = "vCid1"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("vE1" -> 'lines') x WHERE x ? 'id');
    FOR "vE2", "vO2" IN SELECT x, n FROM jsonb_array_elements("vE1" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC2BudgetVersionLines" := jsonb_populate_record(NULL::"Accounting"."BudgetVersionLines", "vE2");
      IF "vE2" ? 'id' THEN
        UPDATE "Accounting"."BudgetVersionLines" t
           SET "accountId" = CASE WHEN "vE2" ? 'accountId' THEN "vC2BudgetVersionLines"."accountId" ELSE t."accountId" END,
               "costCentreId" = CASE WHEN "vE2" ? 'costCentreId' THEN "vC2BudgetVersionLines"."costCentreId" ELSE t."costCentreId" END,
               m01 = CASE WHEN "vE2" ? 'm01' THEN "vC2BudgetVersionLines".m01 ELSE t.m01 END,
               m02 = CASE WHEN "vE2" ? 'm02' THEN "vC2BudgetVersionLines".m02 ELSE t.m02 END,
               m03 = CASE WHEN "vE2" ? 'm03' THEN "vC2BudgetVersionLines".m03 ELSE t.m03 END,
               m04 = CASE WHEN "vE2" ? 'm04' THEN "vC2BudgetVersionLines".m04 ELSE t.m04 END,
               m05 = CASE WHEN "vE2" ? 'm05' THEN "vC2BudgetVersionLines".m05 ELSE t.m05 END,
               m06 = CASE WHEN "vE2" ? 'm06' THEN "vC2BudgetVersionLines".m06 ELSE t.m06 END,
               m07 = CASE WHEN "vE2" ? 'm07' THEN "vC2BudgetVersionLines".m07 ELSE t.m07 END,
               m08 = CASE WHEN "vE2" ? 'm08' THEN "vC2BudgetVersionLines".m08 ELSE t.m08 END,
               m09 = CASE WHEN "vE2" ? 'm09' THEN "vC2BudgetVersionLines".m09 ELSE t.m09 END,
               m10 = CASE WHEN "vE2" ? 'm10' THEN "vC2BudgetVersionLines".m10 ELSE t.m10 END,
               m11 = CASE WHEN "vE2" ? 'm11' THEN "vC2BudgetVersionLines".m11 ELSE t.m11 END,
               m12 = CASE WHEN "vE2" ? 'm12' THEN "vC2BudgetVersionLines".m12 ELSE t.m12 END
         WHERE t.id = ("vE2" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."budgetVersionId" = "vCid1"
        RETURNING t.id INTO "vCid2";
        IF "vCid2" IS NULL THEN
          RAISE EXCEPTION 'BudgetVersionLines: row % does not belong to this record', "vE2" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Accounting"."BudgetVersionLines" ("budgetVersionId", "tenantId", "accountId", "costCentreId", m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12)
        VALUES ("vCid1", "vTenant", CASE WHEN "vE2" ? 'accountId' THEN "vC2BudgetVersionLines"."accountId" ELSE NULL END, CASE WHEN "vE2" ? 'costCentreId' THEN "vC2BudgetVersionLines"."costCentreId" ELSE NULL END, CASE WHEN "vE2" ? 'm01' THEN "vC2BudgetVersionLines".m01 ELSE 0 END, CASE WHEN "vE2" ? 'm02' THEN "vC2BudgetVersionLines".m02 ELSE 0 END, CASE WHEN "vE2" ? 'm03' THEN "vC2BudgetVersionLines".m03 ELSE 0 END, CASE WHEN "vE2" ? 'm04' THEN "vC2BudgetVersionLines".m04 ELSE 0 END, CASE WHEN "vE2" ? 'm05' THEN "vC2BudgetVersionLines".m05 ELSE 0 END, CASE WHEN "vE2" ? 'm06' THEN "vC2BudgetVersionLines".m06 ELSE 0 END, CASE WHEN "vE2" ? 'm07' THEN "vC2BudgetVersionLines".m07 ELSE 0 END, CASE WHEN "vE2" ? 'm08' THEN "vC2BudgetVersionLines".m08 ELSE 0 END, CASE WHEN "vE2" ? 'm09' THEN "vC2BudgetVersionLines".m09 ELSE 0 END, CASE WHEN "vE2" ? 'm10' THEN "vC2BudgetVersionLines".m10 ELSE 0 END, CASE WHEN "vE2" ? 'm11' THEN "vC2BudgetVersionLines".m11 ELSE 0 END, CASE WHEN "vE2" ? 'm12' THEN "vC2BudgetVersionLines".m12 ELSE 0 END)
        RETURNING id INTO "vCid2";
      END IF;

    END LOOP;
  END IF;
    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Accounting"."budgetAddUpdate"(jsonb) IS 'Save (insert or update) one Budgets record with its versions.';

-- Budgets: one record as JSON (camelCase keys), with lookup labels and versions
CREATE OR REPLACE FUNCTION "Accounting"."getBudgetInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('budgetTypeLabel', "Lookups"."getLookupLabel"('BudgetType', t."budgetType") ->> 'label', 'budgetTypeTone', "Lookups"."getLookupLabel"('BudgetType', t."budgetType") ->> 'tone', 'seedFromLabel', "Lookups"."getLookupLabel"('SeedFrom', t."seedFrom") ->> 'label', 'seedFromTone', "Lookups"."getLookupLabel"('SeedFrom', t."seedFrom") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('BudgetStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('BudgetStatus', t.status) ->> 'tone') ||
         jsonb_build_object('versions', COALESCE((SELECT jsonb_agg(to_jsonb(c1) || jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c2) ORDER BY c2."createdAt") FROM "Accounting"."BudgetVersionLines" c2 WHERE c2."budgetVersionId" = c1.id AND c2."tenantId" = c1."tenantId"), '[]'::jsonb)) ORDER BY c1."createdAt") FROM "Accounting"."BudgetVersions" c1 WHERE c1."budgetId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Accounting"."Budgets" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Accounting"."getBudgetInfo"(uuid) IS 'Read one Budgets record (getter for its screens).';

-- Budgets: Approve (status -> APPROVED); allowed from DRAFT, IN_REVIEW
CREATE OR REPLACE FUNCTION "Accounting"."budgetApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Accounting"."Budgets";
BEGIN
  SELECT * INTO "vRow" FROM "Accounting"."Budgets" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Budgets % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'IN_REVIEW') THEN
    RAISE EXCEPTION 'Budgets %: cannot approve from status %', "vRow".code, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'Budgets: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Accounting"."budgetApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Accounting"."budgetApproveEntries"') USING "pId";
  END IF;
  UPDATE "Accounting"."Budgets" t SET status = 'APPROVED', "approvedAt" = now(), "approvedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- SavedLedgerViews: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Accounting"."savedLedgerViewAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Accounting"."SavedLedgerViews";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Accounting"."SavedLedgerViews", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Accounting"."SavedLedgerViews" ("tenantId", "userId", name, "accountId", "rangeLabel", "dateFrom", "dateTo", filters, "isShared")
    VALUES ("vTenant", CASE WHEN "pData" ? 'userId' THEN "vRec"."userId" ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE NULL END, CASE WHEN "pData" ? 'rangeLabel' THEN "vRec"."rangeLabel" ELSE NULL END, CASE WHEN "pData" ? 'dateFrom' THEN "vRec"."dateFrom" ELSE NULL END, CASE WHEN "pData" ? 'dateTo' THEN "vRec"."dateTo" ELSE NULL END, CASE WHEN "pData" ? 'filters' THEN "vRec".filters ELSE CAST('{}' AS jsonb) END, CASE WHEN "pData" ? 'isShared' THEN "vRec"."isShared" ELSE FALSE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Accounting"."SavedLedgerViews" t
       SET "userId" = CASE WHEN "pData" ? 'userId' THEN "vRec"."userId" ELSE t."userId" END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "accountId" = CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE t."accountId" END,
           "rangeLabel" = CASE WHEN "pData" ? 'rangeLabel' THEN "vRec"."rangeLabel" ELSE t."rangeLabel" END,
           "dateFrom" = CASE WHEN "pData" ? 'dateFrom' THEN "vRec"."dateFrom" ELSE t."dateFrom" END,
           "dateTo" = CASE WHEN "pData" ? 'dateTo' THEN "vRec"."dateTo" ELSE t."dateTo" END,
           filters = CASE WHEN "pData" ? 'filters' THEN "vRec".filters ELSE t.filters END,
           "isShared" = CASE WHEN "pData" ? 'isShared' THEN "vRec"."isShared" ELSE t."isShared" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Accounting"."SavedLedgerViews" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'SavedLedgerViews %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SavedLedgerViews % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Accounting"."savedLedgerViewAddUpdate"(jsonb) IS 'Save (insert or update) one SavedLedgerViews record.';

-- SavedLedgerViews: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Accounting"."getSavedLedgerViewInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "Accounting"."SavedLedgerViews" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Accounting"."getSavedLedgerViewInfo"(uuid) IS 'Read one SavedLedgerViews record (getter for its screens).';
