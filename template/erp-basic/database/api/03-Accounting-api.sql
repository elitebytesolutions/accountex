-- =============================================================================
-- Finsoft ERP (Basic edition) — API: "Accounting"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- ChartOfAccounts: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Accounting"."accountAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Accounting"."ChartOfAccounts";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
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

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Accounting"."accountAddUpdate"(jsonb) IS 'Save (insert or update) one ChartOfAccounts record.';

-- ChartOfAccounts: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Accounting"."getAccountInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('natureLabel', "Lookups"."getLookupLabel"('Nature', t.nature) ->> 'label', 'natureTone', "Lookups"."getLookupLabel"('Nature', t.nature) ->> 'tone', 'kindLabel', "Lookups"."getLookupLabel"('AccountKind', t.kind) ->> 'label', 'kindTone', "Lookups"."getLookupLabel"('AccountKind', t.kind) ->> 'tone', 'subTypeLabel', "Lookups"."getLookupLabel"('AccountSubType', t."subType") ->> 'label', 'subTypeTone', "Lookups"."getLookupLabel"('AccountSubType', t."subType") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone')
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
    INSERT INTO "Accounting"."CostCentres" ("tenantId", code, name, "parentCostCentreId", "branchId", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'parentCostCentreId' THEN "vRec"."parentCostCentreId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Accounting"."CostCentres" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "parentCostCentreId" = CASE WHEN "pData" ? 'parentCostCentreId' THEN "vRec"."parentCostCentreId" ELSE t."parentCostCentreId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
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
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone')
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
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
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
         jsonb_build_object('periods', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Accounting"."FiscalPeriods" c1 WHERE c1."fiscalYearId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
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
    INSERT INTO "Accounting"."Vouchers" ("tenantId", "voucherType", "docNo", "docDate", "postingDate", "fiscalPeriodId", "referenceNo", "branchId", department, "currencyCode", "fxRate", narration, remarks, tags, "cashBankAccountId", "partyName", "instrumentType", "instrumentNo", "instrumentDate", "autoReverseOn", "totalDebit", "totalCredit", "preparedByUserId", "sourceDocType", "sourceDocId", "sourceDocNo", "reversalReason", "reversalRemarks", "reversalDate")
    VALUES ("vTenant", CASE WHEN "pData" ? 'voucherType' THEN "vRec"."voucherType" ELSE NULL END, "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'postingDate' THEN "vRec"."postingDate" ELSE NULL END, CASE WHEN "pData" ? 'fiscalPeriodId' THEN "vRec"."fiscalPeriodId" ELSE NULL END, CASE WHEN "pData" ? 'referenceNo' THEN "vRec"."referenceNo" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'department' THEN "vRec".department ELSE NULL END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE 1 END, CASE WHEN "pData" ? 'narration' THEN "vRec".narration ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'tags' THEN "vRec".tags ELSE '{}' END, CASE WHEN "pData" ? 'cashBankAccountId' THEN "vRec"."cashBankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'partyName' THEN "vRec"."partyName" ELSE NULL END, CASE WHEN "pData" ? 'instrumentType' THEN "vRec"."instrumentType" ELSE NULL END, CASE WHEN "pData" ? 'instrumentNo' THEN "vRec"."instrumentNo" ELSE NULL END, CASE WHEN "pData" ? 'instrumentDate' THEN "vRec"."instrumentDate" ELSE NULL END, CASE WHEN "pData" ? 'autoReverseOn' THEN "vRec"."autoReverseOn" ELSE NULL END, CASE WHEN "pData" ? 'totalDebit' THEN "vRec"."totalDebit" ELSE 0 END, CASE WHEN "pData" ? 'totalCredit' THEN "vRec"."totalCredit" ELSE 0 END, CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'sourceDocType' THEN "vRec"."sourceDocType" ELSE NULL END, CASE WHEN "pData" ? 'sourceDocId' THEN "vRec"."sourceDocId" ELSE NULL END, CASE WHEN "pData" ? 'sourceDocNo' THEN "vRec"."sourceDocNo" ELSE NULL END, CASE WHEN "pData" ? 'reversalReason' THEN "vRec"."reversalReason" ELSE NULL END, CASE WHEN "pData" ? 'reversalRemarks' THEN "vRec"."reversalRemarks" ELSE NULL END, CASE WHEN "pData" ? 'reversalDate' THEN "vRec"."reversalDate" ELSE NULL END)
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
           "reversalDate" = CASE WHEN "pData" ? 'reversalDate' THEN "vRec"."reversalDate" ELSE t."reversalDate" END
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
               "lineNo" = "vC1VoucherLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."journalEntryId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'VoucherLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Accounting"."VoucherLines" ("journalEntryId", "tenantId", "lineNo", "accountId", particulars, debit, credit, "costCentreId", "branchId", "customerId", "vendorId", "isAutoContra")
        VALUES ("vRet", "vTenant", "vC1VoucherLines"."lineNo", CASE WHEN "vE1" ? 'accountId' THEN "vC1VoucherLines"."accountId" ELSE NULL END, CASE WHEN "vE1" ? 'particulars' THEN "vC1VoucherLines".particulars ELSE NULL END, CASE WHEN "vE1" ? 'debit' THEN "vC1VoucherLines".debit ELSE 0 END, CASE WHEN "vE1" ? 'credit' THEN "vC1VoucherLines".credit ELSE 0 END, CASE WHEN "vE1" ? 'costCentreId' THEN "vC1VoucherLines"."costCentreId" ELSE NULL END, CASE WHEN "vE1" ? 'branchId' THEN "vC1VoucherLines"."branchId" ELSE NULL END, CASE WHEN "vE1" ? 'customerId' THEN "vC1VoucherLines"."customerId" ELSE NULL END, CASE WHEN "vE1" ? 'vendorId' THEN "vC1VoucherLines"."vendorId" ELSE NULL END, CASE WHEN "vE1" ? 'isAutoContra' THEN "vC1VoucherLines"."isAutoContra" ELSE FALSE END)
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
