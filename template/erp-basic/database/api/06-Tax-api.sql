-- =============================================================================
-- Finsoft ERP (Basic edition) — API: "Tax"
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
