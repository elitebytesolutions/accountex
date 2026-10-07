-- =============================================================================
-- Finsoft ERP (Full edition) — API: "Tax"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- TaxCodes: insert (no "id") or update (with "id"); child arrays: rates
CREATE OR REPLACE FUNCTION "Tax"."taxCodeAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Tax"."TaxCodes";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1TaxCodeRates" "Tax"."TaxCodeRates";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Tax"."TaxCodes", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Tax"."TaxCodes" ("tenantId", code, description, "taxType", "appliesTo", "rateBasis", "salesTaxKind", "whtSection", "whtNature", "accountId", "inputAccountId", "fbrReference", "calcOnExclSalesTax", "checkAtl", "isSystem", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'taxType' THEN "vRec"."taxType" ELSE NULL END, CASE WHEN "pData" ? 'appliesTo' THEN "vRec"."appliesTo" ELSE NULL END, CASE WHEN "pData" ? 'rateBasis' THEN "vRec"."rateBasis" ELSE 'PERCENT' END, CASE WHEN "pData" ? 'salesTaxKind' THEN "vRec"."salesTaxKind" ELSE NULL END, CASE WHEN "pData" ? 'whtSection' THEN "vRec"."whtSection" ELSE NULL END, CASE WHEN "pData" ? 'whtNature' THEN "vRec"."whtNature" ELSE NULL END, CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE NULL END, CASE WHEN "pData" ? 'inputAccountId' THEN "vRec"."inputAccountId" ELSE NULL END, CASE WHEN "pData" ? 'fbrReference' THEN "vRec"."fbrReference" ELSE NULL END, CASE WHEN "pData" ? 'calcOnExclSalesTax' THEN "vRec"."calcOnExclSalesTax" ELSE TRUE END, CASE WHEN "pData" ? 'checkAtl' THEN "vRec"."checkAtl" ELSE FALSE END, CASE WHEN "pData" ? 'isSystem' THEN "vRec"."isSystem" ELSE FALSE END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Tax"."TaxCodes" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "taxType" = CASE WHEN "pData" ? 'taxType' THEN "vRec"."taxType" ELSE t."taxType" END,
           "appliesTo" = CASE WHEN "pData" ? 'appliesTo' THEN "vRec"."appliesTo" ELSE t."appliesTo" END,
           "rateBasis" = CASE WHEN "pData" ? 'rateBasis' THEN "vRec"."rateBasis" ELSE t."rateBasis" END,
           "salesTaxKind" = CASE WHEN "pData" ? 'salesTaxKind' THEN "vRec"."salesTaxKind" ELSE t."salesTaxKind" END,
           "whtSection" = CASE WHEN "pData" ? 'whtSection' THEN "vRec"."whtSection" ELSE t."whtSection" END,
           "whtNature" = CASE WHEN "pData" ? 'whtNature' THEN "vRec"."whtNature" ELSE t."whtNature" END,
           "accountId" = CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE t."accountId" END,
           "inputAccountId" = CASE WHEN "pData" ? 'inputAccountId' THEN "vRec"."inputAccountId" ELSE t."inputAccountId" END,
           "fbrReference" = CASE WHEN "pData" ? 'fbrReference' THEN "vRec"."fbrReference" ELSE t."fbrReference" END,
           "calcOnExclSalesTax" = CASE WHEN "pData" ? 'calcOnExclSalesTax' THEN "vRec"."calcOnExclSalesTax" ELSE t."calcOnExclSalesTax" END,
           "checkAtl" = CASE WHEN "pData" ? 'checkAtl' THEN "vRec"."checkAtl" ELSE t."checkAtl" END,
           "isSystem" = CASE WHEN "pData" ? 'isSystem' THEN "vRec"."isSystem" ELSE t."isSystem" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Tax"."TaxCodes" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'TaxCodes %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'TaxCodes % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'rates' THEN
    -- rates: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Tax"."TaxCodeRates"
     WHERE "tenantId" = "vTenant" AND "taxCodeId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'rates') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'rates') WITH ORDINALITY t(x, n) LOOP
      "vC1TaxCodeRates" := jsonb_populate_record(NULL::"Tax"."TaxCodeRates", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Tax"."TaxCodeRates" t
           SET "effectiveFrom" = CASE WHEN "vE1" ? 'effectiveFrom' THEN "vC1TaxCodeRates"."effectiveFrom" ELSE t."effectiveFrom" END,
               "effectiveTo" = CASE WHEN "vE1" ? 'effectiveTo' THEN "vC1TaxCodeRates"."effectiveTo" ELSE t."effectiveTo" END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1TaxCodeRates".rate ELSE t.rate END,
               "nonAtlRate" = CASE WHEN "vE1" ? 'nonAtlRate' THEN "vC1TaxCodeRates"."nonAtlRate" ELSE t."nonAtlRate" END,
               "financeAct" = CASE WHEN "vE1" ? 'financeAct' THEN "vC1TaxCodeRates"."financeAct" ELSE t."financeAct" END,
               remarks = CASE WHEN "vE1" ? 'remarks' THEN "vC1TaxCodeRates".remarks ELSE t.remarks END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."taxCodeId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'TaxCodeRates: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Tax"."TaxCodeRates" ("taxCodeId", "tenantId", "effectiveFrom", "effectiveTo", rate, "nonAtlRate", "financeAct", remarks)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'effectiveFrom' THEN "vC1TaxCodeRates"."effectiveFrom" ELSE NULL END, CASE WHEN "vE1" ? 'effectiveTo' THEN "vC1TaxCodeRates"."effectiveTo" ELSE NULL END, CASE WHEN "vE1" ? 'rate' THEN "vC1TaxCodeRates".rate ELSE NULL END, CASE WHEN "vE1" ? 'nonAtlRate' THEN "vC1TaxCodeRates"."nonAtlRate" ELSE NULL END, CASE WHEN "vE1" ? 'financeAct' THEN "vC1TaxCodeRates"."financeAct" ELSE NULL END, CASE WHEN "vE1" ? 'remarks' THEN "vC1TaxCodeRates".remarks ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Tax"."taxCodeAddUpdate"(jsonb) IS 'Save (insert or update) one TaxCodes record with its rates.';

-- TaxCodes: one record as JSON (camelCase keys), with lookup labels and rates
CREATE OR REPLACE FUNCTION "Tax"."getTaxCodeInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('taxTypeLabel', "Lookups"."getLookupLabel"('TaxType', t."taxType") ->> 'label', 'taxTypeTone', "Lookups"."getLookupLabel"('TaxType', t."taxType") ->> 'tone', 'appliesToLabel', "Lookups"."getLookupLabel"('TaxCodeAppliesTo', t."appliesTo") ->> 'label', 'appliesToTone', "Lookups"."getLookupLabel"('TaxCodeAppliesTo', t."appliesTo") ->> 'tone', 'rateBasisLabel', "Lookups"."getLookupLabel"('RateBasis', t."rateBasis") ->> 'label', 'rateBasisTone', "Lookups"."getLookupLabel"('RateBasis', t."rateBasis") ->> 'tone', 'salesTaxKindLabel', "Lookups"."getLookupLabel"('SalesTaxKind', t."salesTaxKind") ->> 'label', 'salesTaxKindTone', "Lookups"."getLookupLabel"('SalesTaxKind', t."salesTaxKind") ->> 'tone') ||
         jsonb_build_object('rates', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Tax"."TaxCodeRates" c1 WHERE c1."taxCodeId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Tax"."TaxCodes" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Tax"."getTaxCodeInfo"(uuid) IS 'Read one TaxCodes record (getter for its screens).';

-- SalesTaxReturns: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Tax"."salesTaxReturnAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Tax"."SalesTaxReturns";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1SalesTaxReturnLines" "Tax"."SalesTaxReturnLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Tax"."SalesTaxReturns", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('STR', current_date, NULL);
    END IF;
    INSERT INTO "Tax"."SalesTaxReturns" ("tenantId", "docNo", authority, "periodMonth", "fiscalPeriodId", "revisionNo", strn, "dueDate", "outputTax", "furtherTax", "inputTax", "inadmissibleInput", "carryForwardIn", "inputCapPct", "annexCCount", "annexACount", "includeAnnexH", "excludeUnmatchedInput", "irisExportedAt", "irisExportAttachmentId", "filedOn", "filedByUserId", "cprNo", "paidOn", "paidFromBankAccountId", "paymentJournalEntryId", remarks)
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'authority' THEN "vRec".authority ELSE 'FBR' END, CASE WHEN "pData" ? 'periodMonth' THEN "vRec"."periodMonth" ELSE NULL END, CASE WHEN "pData" ? 'fiscalPeriodId' THEN "vRec"."fiscalPeriodId" ELSE NULL END, CASE WHEN "pData" ? 'revisionNo' THEN "vRec"."revisionNo" ELSE 0 END, CASE WHEN "pData" ? 'strn' THEN "vRec".strn ELSE NULL END, CASE WHEN "pData" ? 'dueDate' THEN "vRec"."dueDate" ELSE NULL END, CASE WHEN "pData" ? 'outputTax' THEN "vRec"."outputTax" ELSE 0 END, CASE WHEN "pData" ? 'furtherTax' THEN "vRec"."furtherTax" ELSE 0 END, CASE WHEN "pData" ? 'inputTax' THEN "vRec"."inputTax" ELSE 0 END, CASE WHEN "pData" ? 'inadmissibleInput' THEN "vRec"."inadmissibleInput" ELSE 0 END, CASE WHEN "pData" ? 'carryForwardIn' THEN "vRec"."carryForwardIn" ELSE 0 END, CASE WHEN "pData" ? 'inputCapPct' THEN "vRec"."inputCapPct" ELSE 90 END, CASE WHEN "pData" ? 'annexCCount' THEN "vRec"."annexCCount" ELSE 0 END, CASE WHEN "pData" ? 'annexACount' THEN "vRec"."annexACount" ELSE 0 END, CASE WHEN "pData" ? 'includeAnnexH' THEN "vRec"."includeAnnexH" ELSE FALSE END, CASE WHEN "pData" ? 'excludeUnmatchedInput' THEN "vRec"."excludeUnmatchedInput" ELSE FALSE END, CASE WHEN "pData" ? 'irisExportedAt' THEN "vRec"."irisExportedAt" ELSE NULL END, CASE WHEN "pData" ? 'irisExportAttachmentId' THEN "vRec"."irisExportAttachmentId" ELSE NULL END, CASE WHEN "pData" ? 'filedOn' THEN "vRec"."filedOn" ELSE NULL END, CASE WHEN "pData" ? 'filedByUserId' THEN "vRec"."filedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'cprNo' THEN "vRec"."cprNo" ELSE NULL END, CASE WHEN "pData" ? 'paidOn' THEN "vRec"."paidOn" ELSE NULL END, CASE WHEN "pData" ? 'paidFromBankAccountId' THEN "vRec"."paidFromBankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'paymentJournalEntryId' THEN "vRec"."paymentJournalEntryId" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Tax"."SalesTaxReturns" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'SalesTaxReturns: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Tax"."SalesTaxReturns" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           authority = CASE WHEN "pData" ? 'authority' THEN "vRec".authority ELSE t.authority END,
           "periodMonth" = CASE WHEN "pData" ? 'periodMonth' THEN "vRec"."periodMonth" ELSE t."periodMonth" END,
           "fiscalPeriodId" = CASE WHEN "pData" ? 'fiscalPeriodId' THEN "vRec"."fiscalPeriodId" ELSE t."fiscalPeriodId" END,
           "revisionNo" = CASE WHEN "pData" ? 'revisionNo' THEN "vRec"."revisionNo" ELSE t."revisionNo" END,
           strn = CASE WHEN "pData" ? 'strn' THEN "vRec".strn ELSE t.strn END,
           "dueDate" = CASE WHEN "pData" ? 'dueDate' THEN "vRec"."dueDate" ELSE t."dueDate" END,
           "outputTax" = CASE WHEN "pData" ? 'outputTax' THEN "vRec"."outputTax" ELSE t."outputTax" END,
           "furtherTax" = CASE WHEN "pData" ? 'furtherTax' THEN "vRec"."furtherTax" ELSE t."furtherTax" END,
           "inputTax" = CASE WHEN "pData" ? 'inputTax' THEN "vRec"."inputTax" ELSE t."inputTax" END,
           "inadmissibleInput" = CASE WHEN "pData" ? 'inadmissibleInput' THEN "vRec"."inadmissibleInput" ELSE t."inadmissibleInput" END,
           "carryForwardIn" = CASE WHEN "pData" ? 'carryForwardIn' THEN "vRec"."carryForwardIn" ELSE t."carryForwardIn" END,
           "inputCapPct" = CASE WHEN "pData" ? 'inputCapPct' THEN "vRec"."inputCapPct" ELSE t."inputCapPct" END,
           "annexCCount" = CASE WHEN "pData" ? 'annexCCount' THEN "vRec"."annexCCount" ELSE t."annexCCount" END,
           "annexACount" = CASE WHEN "pData" ? 'annexACount' THEN "vRec"."annexACount" ELSE t."annexACount" END,
           "includeAnnexH" = CASE WHEN "pData" ? 'includeAnnexH' THEN "vRec"."includeAnnexH" ELSE t."includeAnnexH" END,
           "excludeUnmatchedInput" = CASE WHEN "pData" ? 'excludeUnmatchedInput' THEN "vRec"."excludeUnmatchedInput" ELSE t."excludeUnmatchedInput" END,
           "irisExportedAt" = CASE WHEN "pData" ? 'irisExportedAt' THEN "vRec"."irisExportedAt" ELSE t."irisExportedAt" END,
           "irisExportAttachmentId" = CASE WHEN "pData" ? 'irisExportAttachmentId' THEN "vRec"."irisExportAttachmentId" ELSE t."irisExportAttachmentId" END,
           "filedOn" = CASE WHEN "pData" ? 'filedOn' THEN "vRec"."filedOn" ELSE t."filedOn" END,
           "filedByUserId" = CASE WHEN "pData" ? 'filedByUserId' THEN "vRec"."filedByUserId" ELSE t."filedByUserId" END,
           "cprNo" = CASE WHEN "pData" ? 'cprNo' THEN "vRec"."cprNo" ELSE t."cprNo" END,
           "paidOn" = CASE WHEN "pData" ? 'paidOn' THEN "vRec"."paidOn" ELSE t."paidOn" END,
           "paidFromBankAccountId" = CASE WHEN "pData" ? 'paidFromBankAccountId' THEN "vRec"."paidFromBankAccountId" ELSE t."paidFromBankAccountId" END,
           "paymentJournalEntryId" = CASE WHEN "pData" ? 'paymentJournalEntryId' THEN "vRec"."paymentJournalEntryId" ELSE t."paymentJournalEntryId" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Tax"."SalesTaxReturns" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'SalesTaxReturns %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SalesTaxReturns % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Tax"."SalesTaxReturnLines"
     WHERE "tenantId" = "vTenant" AND "returnId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1SalesTaxReturnLines" := jsonb_populate_record(NULL::"Tax"."SalesTaxReturnLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1SalesTaxReturnLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Tax"."SalesTaxReturnLines" t
           SET annex = CASE WHEN "vE1" ? 'annex' THEN "vC1SalesTaxReturnLines".annex ELSE t.annex END,
               "customerId" = CASE WHEN "vE1" ? 'customerId' THEN "vC1SalesTaxReturnLines"."customerId" ELSE t."customerId" END,
               "vendorId" = CASE WHEN "vE1" ? 'vendorId' THEN "vC1SalesTaxReturnLines"."vendorId" ELSE t."vendorId" END,
               "partyName" = CASE WHEN "vE1" ? 'partyName' THEN "vC1SalesTaxReturnLines"."partyName" ELSE t."partyName" END,
               "partyNtnCnic" = CASE WHEN "vE1" ? 'partyNtnCnic' THEN "vC1SalesTaxReturnLines"."partyNtnCnic" ELSE t."partyNtnCnic" END,
               "partyStrn" = CASE WHEN "vE1" ? 'partyStrn' THEN "vC1SalesTaxReturnLines"."partyStrn" ELSE t."partyStrn" END,
               "isRegistered" = CASE WHEN "vE1" ? 'isRegistered' THEN "vC1SalesTaxReturnLines"."isRegistered" ELSE t."isRegistered" END,
               "invoiceId" = CASE WHEN "vE1" ? 'invoiceId' THEN "vC1SalesTaxReturnLines"."invoiceId" ELSE t."invoiceId" END,
               "creditNoteId" = CASE WHEN "vE1" ? 'creditNoteId' THEN "vC1SalesTaxReturnLines"."creditNoteId" ELSE t."creditNoteId" END,
               "billId" = CASE WHEN "vE1" ? 'billId' THEN "vC1SalesTaxReturnLines"."billId" ELSE t."billId" END,
               "debitNoteId" = CASE WHEN "vE1" ? 'debitNoteId' THEN "vC1SalesTaxReturnLines"."debitNoteId" ELSE t."debitNoteId" END,
               "documentNo" = CASE WHEN "vE1" ? 'documentNo' THEN "vC1SalesTaxReturnLines"."documentNo" ELSE t."documentNo" END,
               "documentDate" = CASE WHEN "vE1" ? 'documentDate' THEN "vC1SalesTaxReturnLines"."documentDate" ELSE t."documentDate" END,
               "taxCodeId" = CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1SalesTaxReturnLines"."taxCodeId" ELSE t."taxCodeId" END,
               "taxRate" = CASE WHEN "vE1" ? 'taxRate' THEN "vC1SalesTaxReturnLines"."taxRate" ELSE t."taxRate" END,
               "valueExclTax" = CASE WHEN "vE1" ? 'valueExclTax' THEN "vC1SalesTaxReturnLines"."valueExclTax" ELSE t."valueExclTax" END,
               "salesTax" = CASE WHEN "vE1" ? 'salesTax' THEN "vC1SalesTaxReturnLines"."salesTax" ELSE t."salesTax" END,
               "furtherTax" = CASE WHEN "vE1" ? 'furtherTax' THEN "vC1SalesTaxReturnLines"."furtherTax" ELSE t."furtherTax" END,
               "matchStatus" = CASE WHEN "vE1" ? 'matchStatus' THEN "vC1SalesTaxReturnLines"."matchStatus" ELSE t."matchStatus" END,
               "isAdmissible" = CASE WHEN "vE1" ? 'isAdmissible' THEN "vC1SalesTaxReturnLines"."isAdmissible" ELSE t."isAdmissible" END,
               "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1SalesTaxReturnLines"."itemId" ELSE t."itemId" END,
               "hsCode" = CASE WHEN "vE1" ? 'hsCode' THEN "vC1SalesTaxReturnLines"."hsCode" ELSE t."hsCode" END,
               "openingQty" = CASE WHEN "vE1" ? 'openingQty' THEN "vC1SalesTaxReturnLines"."openingQty" ELSE t."openingQty" END,
               "purchasedQty" = CASE WHEN "vE1" ? 'purchasedQty' THEN "vC1SalesTaxReturnLines"."purchasedQty" ELSE t."purchasedQty" END,
               "soldQty" = CASE WHEN "vE1" ? 'soldQty' THEN "vC1SalesTaxReturnLines"."soldQty" ELSE t."soldQty" END,
               "closingQty" = CASE WHEN "vE1" ? 'closingQty' THEN "vC1SalesTaxReturnLines"."closingQty" ELSE t."closingQty" END,
               "closingValue" = CASE WHEN "vE1" ? 'closingValue' THEN "vC1SalesTaxReturnLines"."closingValue" ELSE t."closingValue" END,
               "lineNo" = "vC1SalesTaxReturnLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."returnId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SalesTaxReturnLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Tax"."SalesTaxReturnLines" ("returnId", "tenantId", annex, "lineNo", "customerId", "vendorId", "partyName", "partyNtnCnic", "partyStrn", "isRegistered", "invoiceId", "creditNoteId", "billId", "debitNoteId", "documentNo", "documentDate", "taxCodeId", "taxRate", "valueExclTax", "salesTax", "furtherTax", "matchStatus", "isAdmissible", "itemId", "hsCode", "openingQty", "purchasedQty", "soldQty", "closingQty", "closingValue")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'annex' THEN "vC1SalesTaxReturnLines".annex ELSE NULL END, "vC1SalesTaxReturnLines"."lineNo", CASE WHEN "vE1" ? 'customerId' THEN "vC1SalesTaxReturnLines"."customerId" ELSE NULL END, CASE WHEN "vE1" ? 'vendorId' THEN "vC1SalesTaxReturnLines"."vendorId" ELSE NULL END, CASE WHEN "vE1" ? 'partyName' THEN "vC1SalesTaxReturnLines"."partyName" ELSE NULL END, CASE WHEN "vE1" ? 'partyNtnCnic' THEN "vC1SalesTaxReturnLines"."partyNtnCnic" ELSE NULL END, CASE WHEN "vE1" ? 'partyStrn' THEN "vC1SalesTaxReturnLines"."partyStrn" ELSE NULL END, CASE WHEN "vE1" ? 'isRegistered' THEN "vC1SalesTaxReturnLines"."isRegistered" ELSE NULL END, CASE WHEN "vE1" ? 'invoiceId' THEN "vC1SalesTaxReturnLines"."invoiceId" ELSE NULL END, CASE WHEN "vE1" ? 'creditNoteId' THEN "vC1SalesTaxReturnLines"."creditNoteId" ELSE NULL END, CASE WHEN "vE1" ? 'billId' THEN "vC1SalesTaxReturnLines"."billId" ELSE NULL END, CASE WHEN "vE1" ? 'debitNoteId' THEN "vC1SalesTaxReturnLines"."debitNoteId" ELSE NULL END, CASE WHEN "vE1" ? 'documentNo' THEN "vC1SalesTaxReturnLines"."documentNo" ELSE NULL END, CASE WHEN "vE1" ? 'documentDate' THEN "vC1SalesTaxReturnLines"."documentDate" ELSE NULL END, CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1SalesTaxReturnLines"."taxCodeId" ELSE NULL END, CASE WHEN "vE1" ? 'taxRate' THEN "vC1SalesTaxReturnLines"."taxRate" ELSE NULL END, CASE WHEN "vE1" ? 'valueExclTax' THEN "vC1SalesTaxReturnLines"."valueExclTax" ELSE NULL END, CASE WHEN "vE1" ? 'salesTax' THEN "vC1SalesTaxReturnLines"."salesTax" ELSE NULL END, CASE WHEN "vE1" ? 'furtherTax' THEN "vC1SalesTaxReturnLines"."furtherTax" ELSE 0 END, CASE WHEN "vE1" ? 'matchStatus' THEN "vC1SalesTaxReturnLines"."matchStatus" ELSE NULL END, CASE WHEN "vE1" ? 'isAdmissible' THEN "vC1SalesTaxReturnLines"."isAdmissible" ELSE TRUE END, CASE WHEN "vE1" ? 'itemId' THEN "vC1SalesTaxReturnLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'hsCode' THEN "vC1SalesTaxReturnLines"."hsCode" ELSE NULL END, CASE WHEN "vE1" ? 'openingQty' THEN "vC1SalesTaxReturnLines"."openingQty" ELSE NULL END, CASE WHEN "vE1" ? 'purchasedQty' THEN "vC1SalesTaxReturnLines"."purchasedQty" ELSE NULL END, CASE WHEN "vE1" ? 'soldQty' THEN "vC1SalesTaxReturnLines"."soldQty" ELSE NULL END, CASE WHEN "vE1" ? 'closingQty' THEN "vC1SalesTaxReturnLines"."closingQty" ELSE NULL END, CASE WHEN "vE1" ? 'closingValue' THEN "vC1SalesTaxReturnLines"."closingValue" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Tax"."salesTaxReturnAddUpdate"(jsonb) IS 'Save (insert or update) one SalesTaxReturns record with its lines.';

-- SalesTaxReturns: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Tax"."getSalesTaxReturnInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('authorityLabel', "Lookups"."getLookupLabel"('SalesTaxReturnAuthority', t.authority) ->> 'label', 'authorityTone', "Lookups"."getLookupLabel"('SalesTaxReturnAuthority', t.authority) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('SalesTaxReturnStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('SalesTaxReturnStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Tax"."SalesTaxReturnLines" c1 WHERE c1."returnId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Tax"."SalesTaxReturns" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Tax"."getSalesTaxReturnInfo"(uuid) IS 'Read one SalesTaxReturns record (getter for its screens).';

-- SalesTaxReturns: File (status -> FILED); allowed from DRAFT, VALIDATED
CREATE OR REPLACE FUNCTION "Tax"."salesTaxReturnFile"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Tax"."SalesTaxReturns";
BEGIN
  SELECT * INTO "vRow" FROM "Tax"."SalesTaxReturns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SalesTaxReturns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'FILED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'VALIDATED') THEN
    RAISE EXCEPTION 'SalesTaxReturns %: cannot file from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Tax"."salesTaxReturnFileEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Tax"."salesTaxReturnFileEntries"') USING "pId";
  END IF;
  UPDATE "Tax"."SalesTaxReturns" t SET status = 'FILED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- SalesTaxReturns: Pay (status -> PAID); allowed from FILED
CREATE OR REPLACE FUNCTION "Tax"."salesTaxReturnPay"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Tax"."SalesTaxReturns";
BEGIN
  SELECT * INTO "vRow" FROM "Tax"."SalesTaxReturns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SalesTaxReturns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'PAID' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('FILED') THEN
    RAISE EXCEPTION 'SalesTaxReturns %: cannot pay from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Tax"."salesTaxReturnPayEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Tax"."salesTaxReturnPayEntries"') USING "pId";
  END IF;
  UPDATE "Tax"."SalesTaxReturns" t SET status = 'PAID' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- WhtChallans: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Tax"."whtChallanAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Tax"."WhtChallans";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Tax"."WhtChallans", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Tax"."WhtChallans" ("tenantId", "docNo", "cprNo", "periodMonth", sections, "paymentDate", "bankAccountId", amount, remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE NULL END, CASE WHEN "pData" ? 'cprNo' THEN "vRec"."cprNo" ELSE NULL END, CASE WHEN "pData" ? 'periodMonth' THEN "vRec"."periodMonth" ELSE NULL END, CASE WHEN "pData" ? 'sections' THEN "vRec".sections ELSE NULL END, CASE WHEN "pData" ? 'paymentDate' THEN "vRec"."paymentDate" ELSE NULL END, CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Tax"."WhtChallans" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'WhtChallans: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Tax"."WhtChallans" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "cprNo" = CASE WHEN "pData" ? 'cprNo' THEN "vRec"."cprNo" ELSE t."cprNo" END,
           "periodMonth" = CASE WHEN "pData" ? 'periodMonth' THEN "vRec"."periodMonth" ELSE t."periodMonth" END,
           sections = CASE WHEN "pData" ? 'sections' THEN "vRec".sections ELSE t.sections END,
           "paymentDate" = CASE WHEN "pData" ? 'paymentDate' THEN "vRec"."paymentDate" ELSE t."paymentDate" END,
           "bankAccountId" = CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE t."bankAccountId" END,
           amount = CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE t.amount END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Tax"."WhtChallans" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'WhtChallans %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'WhtChallans % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Tax"."whtChallanAddUpdate"(jsonb) IS 'Save (insert or update) one WhtChallans record.';

-- WhtChallans: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Tax"."getWhtChallanInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('WhtChallanStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('WhtChallanStatus', t.status) ->> 'tone')
    FROM "Tax"."WhtChallans" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Tax"."getWhtChallanInfo"(uuid) IS 'Read one WhtChallans record (getter for its screens).';

-- WhtChallans: Cancel (status -> CANCELLED); allowed from DRAFT, PAID
CREATE OR REPLACE FUNCTION "Tax"."whtChallanCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Tax"."WhtChallans";
BEGIN
  SELECT * INTO "vRow" FROM "Tax"."WhtChallans" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WhtChallans % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PAID') THEN
    RAISE EXCEPTION 'WhtChallans %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Tax"."whtChallanCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Tax"."whtChallanCancelEntries"') USING "pId";
  END IF;
  UPDATE "Tax"."WhtChallans" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- WhtChallans: Pay (status -> PAID); allowed from DRAFT
CREATE OR REPLACE FUNCTION "Tax"."whtChallanPay"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Tax"."WhtChallans";
BEGIN
  SELECT * INTO "vRow" FROM "Tax"."WhtChallans" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WhtChallans % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'PAID' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'WhtChallans %: cannot pay from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Tax"."whtChallanPayEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Tax"."whtChallanPayEntries"') USING "pId";
  END IF;
  UPDATE "Tax"."WhtChallans" t SET status = 'PAID' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- WhtCertificates: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Tax"."whtCertificateAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Tax"."WhtCertificates";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Tax"."WhtCertificates", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Tax"."WhtCertificates" ("tenantId", direction, "certificateNo", "vendorId", "customerId", "employeeId", "partyName", "partyNtnCnic", "whtSection", "periodFrom", "periodTo", "taxableAmount", "taxAmount", "whtPaymentId", "cprNo", "issuedOn", "receivedOn", "attachmentId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'direction' THEN "vRec".direction ELSE NULL END, CASE WHEN "pData" ? 'certificateNo' THEN "vRec"."certificateNo" ELSE NULL END, CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE NULL END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'partyName' THEN "vRec"."partyName" ELSE NULL END, CASE WHEN "pData" ? 'partyNtnCnic' THEN "vRec"."partyNtnCnic" ELSE NULL END, CASE WHEN "pData" ? 'whtSection' THEN "vRec"."whtSection" ELSE NULL END, CASE WHEN "pData" ? 'periodFrom' THEN "vRec"."periodFrom" ELSE NULL END, CASE WHEN "pData" ? 'periodTo' THEN "vRec"."periodTo" ELSE NULL END, CASE WHEN "pData" ? 'taxableAmount' THEN "vRec"."taxableAmount" ELSE NULL END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE NULL END, CASE WHEN "pData" ? 'whtPaymentId' THEN "vRec"."whtPaymentId" ELSE NULL END, CASE WHEN "pData" ? 'cprNo' THEN "vRec"."cprNo" ELSE NULL END, CASE WHEN "pData" ? 'issuedOn' THEN "vRec"."issuedOn" ELSE NULL END, CASE WHEN "pData" ? 'receivedOn' THEN "vRec"."receivedOn" ELSE NULL END, CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Tax"."WhtCertificates" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'WhtCertificates: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Tax"."WhtCertificates" t
       SET direction = CASE WHEN "pData" ? 'direction' THEN "vRec".direction ELSE t.direction END,
           "certificateNo" = CASE WHEN "pData" ? 'certificateNo' THEN "vRec"."certificateNo" ELSE t."certificateNo" END,
           "vendorId" = CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE t."vendorId" END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "partyName" = CASE WHEN "pData" ? 'partyName' THEN "vRec"."partyName" ELSE t."partyName" END,
           "partyNtnCnic" = CASE WHEN "pData" ? 'partyNtnCnic' THEN "vRec"."partyNtnCnic" ELSE t."partyNtnCnic" END,
           "whtSection" = CASE WHEN "pData" ? 'whtSection' THEN "vRec"."whtSection" ELSE t."whtSection" END,
           "periodFrom" = CASE WHEN "pData" ? 'periodFrom' THEN "vRec"."periodFrom" ELSE t."periodFrom" END,
           "periodTo" = CASE WHEN "pData" ? 'periodTo' THEN "vRec"."periodTo" ELSE t."periodTo" END,
           "taxableAmount" = CASE WHEN "pData" ? 'taxableAmount' THEN "vRec"."taxableAmount" ELSE t."taxableAmount" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "whtPaymentId" = CASE WHEN "pData" ? 'whtPaymentId' THEN "vRec"."whtPaymentId" ELSE t."whtPaymentId" END,
           "cprNo" = CASE WHEN "pData" ? 'cprNo' THEN "vRec"."cprNo" ELSE t."cprNo" END,
           "issuedOn" = CASE WHEN "pData" ? 'issuedOn' THEN "vRec"."issuedOn" ELSE t."issuedOn" END,
           "receivedOn" = CASE WHEN "pData" ? 'receivedOn' THEN "vRec"."receivedOn" ELSE t."receivedOn" END,
           "attachmentId" = CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE t."attachmentId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Tax"."WhtCertificates" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'WhtCertificates %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'WhtCertificates % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Tax"."whtCertificateAddUpdate"(jsonb) IS 'Save (insert or update) one WhtCertificates record.';

-- WhtCertificates: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Tax"."getWhtCertificateInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('directionLabel', "Lookups"."getLookupLabel"('WhtCertificateDirection', t.direction) ->> 'label', 'directionTone', "Lookups"."getLookupLabel"('WhtCertificateDirection', t.direction) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('WhtCertificateStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('WhtCertificateStatus', t.status) ->> 'tone')
    FROM "Tax"."WhtCertificates" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Tax"."getWhtCertificateInfo"(uuid) IS 'Read one WhtCertificates record (getter for its screens).';

-- WhtCertificates: Cancel (status -> CANCELLED); allowed from DRAFT, ISSUED, RECEIVED, CLAIMED
CREATE OR REPLACE FUNCTION "Tax"."whtCertificateCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Tax"."WhtCertificates";
BEGIN
  SELECT * INTO "vRow" FROM "Tax"."WhtCertificates" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WhtCertificates % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'ISSUED', 'RECEIVED', 'CLAIMED') THEN
    RAISE EXCEPTION 'WhtCertificates %: cannot cancel from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Tax"."whtCertificateCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Tax"."whtCertificateCancelEntries"') USING "pId";
  END IF;
  UPDATE "Tax"."WhtCertificates" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- WhtStatements: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Tax"."whtStatementAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Tax"."WhtStatements";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Tax"."WhtStatements", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Tax"."WhtStatements" ("tenantId", "returnType", label, "fiscalYearId", "periodFrom", "periodTo", "dueDate", "taxAmount", "filedOn", "filedByUserId", "irisReference", "attachmentId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'returnType' THEN "vRec"."returnType" ELSE NULL END, CASE WHEN "pData" ? 'label' THEN "vRec".label ELSE NULL END, CASE WHEN "pData" ? 'fiscalYearId' THEN "vRec"."fiscalYearId" ELSE NULL END, CASE WHEN "pData" ? 'periodFrom' THEN "vRec"."periodFrom" ELSE NULL END, CASE WHEN "pData" ? 'periodTo' THEN "vRec"."periodTo" ELSE NULL END, CASE WHEN "pData" ? 'dueDate' THEN "vRec"."dueDate" ELSE NULL END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'filedOn' THEN "vRec"."filedOn" ELSE NULL END, CASE WHEN "pData" ? 'filedByUserId' THEN "vRec"."filedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'irisReference' THEN "vRec"."irisReference" ELSE NULL END, CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Tax"."WhtStatements" t
       SET "returnType" = CASE WHEN "pData" ? 'returnType' THEN "vRec"."returnType" ELSE t."returnType" END,
           label = CASE WHEN "pData" ? 'label' THEN "vRec".label ELSE t.label END,
           "fiscalYearId" = CASE WHEN "pData" ? 'fiscalYearId' THEN "vRec"."fiscalYearId" ELSE t."fiscalYearId" END,
           "periodFrom" = CASE WHEN "pData" ? 'periodFrom' THEN "vRec"."periodFrom" ELSE t."periodFrom" END,
           "periodTo" = CASE WHEN "pData" ? 'periodTo' THEN "vRec"."periodTo" ELSE t."periodTo" END,
           "dueDate" = CASE WHEN "pData" ? 'dueDate' THEN "vRec"."dueDate" ELSE t."dueDate" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "filedOn" = CASE WHEN "pData" ? 'filedOn' THEN "vRec"."filedOn" ELSE t."filedOn" END,
           "filedByUserId" = CASE WHEN "pData" ? 'filedByUserId' THEN "vRec"."filedByUserId" ELSE t."filedByUserId" END,
           "irisReference" = CASE WHEN "pData" ? 'irisReference' THEN "vRec"."irisReference" ELSE t."irisReference" END,
           "attachmentId" = CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE t."attachmentId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Tax"."WhtStatements" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'WhtStatements %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'WhtStatements % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Tax"."whtStatementAddUpdate"(jsonb) IS 'Save (insert or update) one WhtStatements record.';

-- WhtStatements: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Tax"."getWhtStatementInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('returnTypeLabel', "Lookups"."getLookupLabel"('WhtStatementReturnType', t."returnType") ->> 'label', 'returnTypeTone', "Lookups"."getLookupLabel"('WhtStatementReturnType', t."returnType") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('WhtStatementStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('WhtStatementStatus', t.status) ->> 'tone')
    FROM "Tax"."WhtStatements" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Tax"."getWhtStatementInfo"(uuid) IS 'Read one WhtStatements record (getter for its screens).';

-- WhtStatements: File (status -> FILED); allowed from IN_PREPARATION
CREATE OR REPLACE FUNCTION "Tax"."whtStatementFile"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Tax"."WhtStatements";
BEGIN
  SELECT * INTO "vRow" FROM "Tax"."WhtStatements" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WhtStatements % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'FILED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('IN_PREPARATION') THEN
    RAISE EXCEPTION 'WhtStatements %: cannot file from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Tax"."whtStatementFileEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Tax"."whtStatementFileEntries"') USING "pId";
  END IF;
  UPDATE "Tax"."WhtStatements" t SET status = 'FILED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- FbrSettings: insert (no "id") or update (with "id"); child arrays: branchMappings
CREATE OR REPLACE FUNCTION "Tax"."fbrSettingAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Tax"."FbrSettings";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1FbrBranchMappings" "Tax"."FbrBranchMappings";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Tax"."FbrSettings", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Tax"."FbrSettings" ("tenantId", authority, environment, "posId", ntn, strn, "apiTokenSecretRef", "apiTokenHint", "tokenExpiresOn", "reportOnPosting", "printQr", "blockIfUnreachable", "syncIntervalMinutes", "connectionStatus", "lastHealthCheckAt", "lastLatencyMs", "lastSyncAt", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'authority' THEN "vRec".authority ELSE 'FBR' END, CASE WHEN "pData" ? 'environment' THEN "vRec".environment ELSE 'SANDBOX' END, CASE WHEN "pData" ? 'posId' THEN "vRec"."posId" ELSE NULL END, CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE NULL END, CASE WHEN "pData" ? 'strn' THEN "vRec".strn ELSE NULL END, CASE WHEN "pData" ? 'apiTokenSecretRef' THEN "vRec"."apiTokenSecretRef" ELSE NULL END, CASE WHEN "pData" ? 'apiTokenHint' THEN "vRec"."apiTokenHint" ELSE NULL END, CASE WHEN "pData" ? 'tokenExpiresOn' THEN "vRec"."tokenExpiresOn" ELSE NULL END, CASE WHEN "pData" ? 'reportOnPosting' THEN "vRec"."reportOnPosting" ELSE TRUE END, CASE WHEN "pData" ? 'printQr' THEN "vRec"."printQr" ELSE TRUE END, CASE WHEN "pData" ? 'blockIfUnreachable' THEN "vRec"."blockIfUnreachable" ELSE FALSE END, CASE WHEN "pData" ? 'syncIntervalMinutes' THEN "vRec"."syncIntervalMinutes" ELSE 5 END, CASE WHEN "pData" ? 'connectionStatus' THEN "vRec"."connectionStatus" ELSE 'NOT_CONFIGURED' END, CASE WHEN "pData" ? 'lastHealthCheckAt' THEN "vRec"."lastHealthCheckAt" ELSE NULL END, CASE WHEN "pData" ? 'lastLatencyMs' THEN "vRec"."lastLatencyMs" ELSE NULL END, CASE WHEN "pData" ? 'lastSyncAt' THEN "vRec"."lastSyncAt" ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Tax"."FbrSettings" t
       SET authority = CASE WHEN "pData" ? 'authority' THEN "vRec".authority ELSE t.authority END,
           environment = CASE WHEN "pData" ? 'environment' THEN "vRec".environment ELSE t.environment END,
           "posId" = CASE WHEN "pData" ? 'posId' THEN "vRec"."posId" ELSE t."posId" END,
           ntn = CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE t.ntn END,
           strn = CASE WHEN "pData" ? 'strn' THEN "vRec".strn ELSE t.strn END,
           "apiTokenSecretRef" = CASE WHEN "pData" ? 'apiTokenSecretRef' THEN "vRec"."apiTokenSecretRef" ELSE t."apiTokenSecretRef" END,
           "apiTokenHint" = CASE WHEN "pData" ? 'apiTokenHint' THEN "vRec"."apiTokenHint" ELSE t."apiTokenHint" END,
           "tokenExpiresOn" = CASE WHEN "pData" ? 'tokenExpiresOn' THEN "vRec"."tokenExpiresOn" ELSE t."tokenExpiresOn" END,
           "reportOnPosting" = CASE WHEN "pData" ? 'reportOnPosting' THEN "vRec"."reportOnPosting" ELSE t."reportOnPosting" END,
           "printQr" = CASE WHEN "pData" ? 'printQr' THEN "vRec"."printQr" ELSE t."printQr" END,
           "blockIfUnreachable" = CASE WHEN "pData" ? 'blockIfUnreachable' THEN "vRec"."blockIfUnreachable" ELSE t."blockIfUnreachable" END,
           "syncIntervalMinutes" = CASE WHEN "pData" ? 'syncIntervalMinutes' THEN "vRec"."syncIntervalMinutes" ELSE t."syncIntervalMinutes" END,
           "connectionStatus" = CASE WHEN "pData" ? 'connectionStatus' THEN "vRec"."connectionStatus" ELSE t."connectionStatus" END,
           "lastHealthCheckAt" = CASE WHEN "pData" ? 'lastHealthCheckAt' THEN "vRec"."lastHealthCheckAt" ELSE t."lastHealthCheckAt" END,
           "lastLatencyMs" = CASE WHEN "pData" ? 'lastLatencyMs' THEN "vRec"."lastLatencyMs" ELSE t."lastLatencyMs" END,
           "lastSyncAt" = CASE WHEN "pData" ? 'lastSyncAt' THEN "vRec"."lastSyncAt" ELSE t."lastSyncAt" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Tax"."FbrSettings" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'FbrSettings %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'FbrSettings % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'branchMappings' THEN
    -- branchMappings: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Tax"."FbrBranchMappings"
     WHERE "tenantId" = "vTenant" AND "fbrConfigId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'branchMappings') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'branchMappings') WITH ORDINALITY t(x, n) LOOP
      "vC1FbrBranchMappings" := jsonb_populate_record(NULL::"Tax"."FbrBranchMappings", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Tax"."FbrBranchMappings" t
           SET "branchId" = CASE WHEN "vE1" ? 'branchId' THEN "vC1FbrBranchMappings"."branchId" ELSE t."branchId" END,
               "posId" = CASE WHEN "vE1" ? 'posId' THEN "vC1FbrBranchMappings"."posId" ELSE t."posId" END,
               "isActive" = CASE WHEN "vE1" ? 'isActive' THEN "vC1FbrBranchMappings"."isActive" ELSE t."isActive" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."fbrConfigId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'FbrBranchMappings: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Tax"."FbrBranchMappings" ("fbrConfigId", "tenantId", "branchId", "posId", "isActive")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'branchId' THEN "vC1FbrBranchMappings"."branchId" ELSE NULL END, CASE WHEN "vE1" ? 'posId' THEN "vC1FbrBranchMappings"."posId" ELSE NULL END, CASE WHEN "vE1" ? 'isActive' THEN "vC1FbrBranchMappings"."isActive" ELSE TRUE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Tax"."fbrSettingAddUpdate"(jsonb) IS 'Save (insert or update) one FbrSettings record with its branchMappings.';

-- FbrSettings: one record as JSON (camelCase keys), with lookup labels and branchMappings
CREATE OR REPLACE FUNCTION "Tax"."getFbrSettingInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t) - 'apiTokenSecretRef') ||
         jsonb_build_object('authorityLabel', "Lookups"."getLookupLabel"('FbrSettingAuthority', t.authority) ->> 'label', 'authorityTone', "Lookups"."getLookupLabel"('FbrSettingAuthority', t.authority) ->> 'tone', 'environmentLabel', "Lookups"."getLookupLabel"('FbrSettingEnvironment', t.environment) ->> 'label', 'environmentTone', "Lookups"."getLookupLabel"('FbrSettingEnvironment', t.environment) ->> 'tone', 'connectionStatusLabel', "Lookups"."getLookupLabel"('ConnectionStatus', t."connectionStatus") ->> 'label', 'connectionStatusTone', "Lookups"."getLookupLabel"('ConnectionStatus', t."connectionStatus") ->> 'tone') ||
         jsonb_build_object('branchMappings', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Tax"."FbrBranchMappings" c1 WHERE c1."fbrConfigId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Tax"."FbrSettings" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Tax"."getFbrSettingInfo"(uuid) IS 'Read one FbrSettings record (getter for its screens).';
