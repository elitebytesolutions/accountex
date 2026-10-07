-- =============================================================================
-- Finsoft ERP (Full edition) — API: "Inventory"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- UnitsOfMeasure: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Inventory"."unitOfMeasureAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."UnitsOfMeasure";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."UnitsOfMeasure", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Inventory"."UnitsOfMeasure" ("tenantId", code, name, "nameUrdu", kind, decimals, "isSystem", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'nameUrdu' THEN "vRec"."nameUrdu" ELSE NULL END, CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE 'COUNT' END, CASE WHEN "pData" ? 'decimals' THEN "vRec".decimals ELSE 0 END, CASE WHEN "pData" ? 'isSystem' THEN "vRec"."isSystem" ELSE FALSE END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."UnitsOfMeasure" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "nameUrdu" = CASE WHEN "pData" ? 'nameUrdu' THEN "vRec"."nameUrdu" ELSE t."nameUrdu" END,
           kind = CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE t.kind END,
           decimals = CASE WHEN "pData" ? 'decimals' THEN "vRec".decimals ELSE t.decimals END,
           "isSystem" = CASE WHEN "pData" ? 'isSystem' THEN "vRec"."isSystem" ELSE t."isSystem" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."UnitsOfMeasure" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'UnitsOfMeasure %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'UnitsOfMeasure % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."unitOfMeasureAddUpdate"(jsonb) IS 'Save (insert or update) one UnitsOfMeasure record.';

-- UnitsOfMeasure: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Inventory"."getUnitOfMeasureInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('kindLabel', "Lookups"."getLookupLabel"('UnitOfMeasureKind', t.kind) ->> 'label', 'kindTone', "Lookups"."getLookupLabel"('UnitOfMeasureKind', t.kind) ->> 'tone')
    FROM "Inventory"."UnitsOfMeasure" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getUnitOfMeasureInfo"(uuid) IS 'Read one UnitsOfMeasure record (getter for its screens).';

-- ProductCompanies: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Inventory"."productCompanyAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."ProductCompanies";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."ProductCompanies", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'code') OR "vRec".code IS NULL THEN
      "vRec".code := "Company"."getNextDocNo"('MFR', current_date, NULL);
    END IF;
    INSERT INTO "Inventory"."ProductCompanies" ("tenantId", code, name, "shortName", status, address, city, country, phone, email, website, "brandColour", notes)
    VALUES ("vTenant", "vRec".code, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'shortName' THEN "vRec"."shortName" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'address' THEN "vRec".address ELSE NULL END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'country' THEN "vRec".country ELSE 'Pakistan' END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'website' THEN "vRec".website ELSE NULL END, CASE WHEN "pData" ? 'brandColour' THEN "vRec"."brandColour" ELSE '#1F5F45' END, CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."ProductCompanies" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "shortName" = CASE WHEN "pData" ? 'shortName' THEN "vRec"."shortName" ELSE t."shortName" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           address = CASE WHEN "pData" ? 'address' THEN "vRec".address ELSE t.address END,
           city = CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE t.city END,
           country = CASE WHEN "pData" ? 'country' THEN "vRec".country ELSE t.country END,
           phone = CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE t.phone END,
           email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           website = CASE WHEN "pData" ? 'website' THEN "vRec".website ELSE t.website END,
           "brandColour" = CASE WHEN "pData" ? 'brandColour' THEN "vRec"."brandColour" ELSE t."brandColour" END,
           notes = CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE t.notes END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."ProductCompanies" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ProductCompanies %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ProductCompanies % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."productCompanyAddUpdate"(jsonb) IS 'Save (insert or update) one ProductCompanies record.';

-- ProductCompanies: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Inventory"."getProductCompanyInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone')
    FROM "Inventory"."ProductCompanies" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getProductCompanyInfo"(uuid) IS 'Read one ProductCompanies record (getter for its screens).';

-- ProductClasses: insert (no "id") or update (with "id"); child arrays: subclasses
CREATE OR REPLACE FUNCTION "Inventory"."productClassAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."ProductClasses";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1ProductSubclasses" "Inventory"."ProductSubclasses";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."ProductClasses", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Inventory"."ProductClasses" ("tenantId", code, name, "nameUrdu", icon, "isVisible", "sortOrder")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'nameUrdu' THEN "vRec"."nameUrdu" ELSE NULL END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE 'package' END, CASE WHEN "pData" ? 'isVisible' THEN "vRec"."isVisible" ELSE TRUE END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."ProductClasses" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "nameUrdu" = CASE WHEN "pData" ? 'nameUrdu' THEN "vRec"."nameUrdu" ELSE t."nameUrdu" END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END,
           "isVisible" = CASE WHEN "pData" ? 'isVisible' THEN "vRec"."isVisible" ELSE t."isVisible" END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."ProductClasses" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ProductClasses %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ProductClasses % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'subclasses' THEN
    -- subclasses: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Inventory"."ProductSubclasses"
     WHERE "tenantId" = "vTenant" AND "productClassId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'subclasses') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'subclasses') WITH ORDINALITY t(x, n) LOOP
      "vC1ProductSubclasses" := jsonb_populate_record(NULL::"Inventory"."ProductSubclasses", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Inventory"."ProductSubclasses" t
           SET code = CASE WHEN "vE1" ? 'code' THEN "vC1ProductSubclasses".code ELSE t.code END,
               name = CASE WHEN "vE1" ? 'name' THEN "vC1ProductSubclasses".name ELSE t.name END,
               "isVisible" = CASE WHEN "vE1" ? 'isVisible' THEN "vC1ProductSubclasses"."isVisible" ELSE t."isVisible" END,
               "sortOrder" = CASE WHEN "vE1" ? 'sortOrder' THEN "vC1ProductSubclasses"."sortOrder" ELSE t."sortOrder" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."productClassId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ProductSubclasses: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Inventory"."ProductSubclasses" ("productClassId", "tenantId", code, name, "isVisible", "sortOrder")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'code' THEN "vC1ProductSubclasses".code ELSE NULL END, CASE WHEN "vE1" ? 'name' THEN "vC1ProductSubclasses".name ELSE NULL END, CASE WHEN "vE1" ? 'isVisible' THEN "vC1ProductSubclasses"."isVisible" ELSE TRUE END, CASE WHEN "vE1" ? 'sortOrder' THEN "vC1ProductSubclasses"."sortOrder" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."productClassAddUpdate"(jsonb) IS 'Save (insert or update) one ProductClasses record with its subclasses.';

-- ProductClasses: one record as JSON (camelCase keys), with lookup labels and subclasses
CREATE OR REPLACE FUNCTION "Inventory"."getProductClassInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('subclasses', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."sortOrder") FROM "Inventory"."ProductSubclasses" c1 WHERE c1."productClassId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Inventory"."ProductClasses" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getProductClassInfo"(uuid) IS 'Read one ProductClasses record (getter for its screens).';

-- Products: insert (no "id") or update (with "id"); child arrays: barcodes, suppliers, units
CREATE OR REPLACE FUNCTION "Inventory"."productAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."Products";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1ProductBarcodes" "Inventory"."ProductBarcodes";
  "vC1ProductSuppliers" "Inventory"."ProductSuppliers";
  "vC1ProductUnits" "Inventory"."ProductUnits";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."Products", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'sku') OR "vRec".sku IS NULL THEN
      "vRec".sku := "Company"."getNextDocNo"('ITEM', current_date, NULL);
    END IF;
    INSERT INTO "Inventory"."Products" ("tenantId", sku, upc, name, "nameUrdu", description, "imageUrl", status, "manufacturerId", "distributorVendorId", "productClassId", "productSubclassId", "uomId", ctn, "defaultShelf", cost, "avgCost", "costPerUnit", price, wprice, "gstRate", "taxCodeId", "finDiscPct", "lowLevel", "highLevel", "isShort", "trackExpiry", "isControlled", "isPrecious", "hsCode", "weightKg", "abcClass", "avgDailySales", "lastSaleDate", "leadDays")
    VALUES ("vTenant", "vRec".sku, CASE WHEN "pData" ? 'upc' THEN "vRec".upc ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'nameUrdu' THEN "vRec"."nameUrdu" ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'imageUrl' THEN "vRec"."imageUrl" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'manufacturerId' THEN "vRec"."manufacturerId" ELSE NULL END, CASE WHEN "pData" ? 'distributorVendorId' THEN "vRec"."distributorVendorId" ELSE NULL END, CASE WHEN "pData" ? 'productClassId' THEN "vRec"."productClassId" ELSE NULL END, CASE WHEN "pData" ? 'productSubclassId' THEN "vRec"."productSubclassId" ELSE NULL END, CASE WHEN "pData" ? 'uomId' THEN "vRec"."uomId" ELSE NULL END, CASE WHEN "pData" ? 'ctn' THEN "vRec".ctn ELSE 1 END, CASE WHEN "pData" ? 'defaultShelf' THEN "vRec"."defaultShelf" ELSE NULL END, CASE WHEN "pData" ? 'cost' THEN "vRec".cost ELSE 0 END, CASE WHEN "pData" ? 'avgCost' THEN "vRec"."avgCost" ELSE 0 END, CASE WHEN "pData" ? 'costPerUnit' THEN "vRec"."costPerUnit" ELSE NULL END, CASE WHEN "pData" ? 'price' THEN "vRec".price ELSE 0 END, CASE WHEN "pData" ? 'wprice' THEN "vRec".wprice ELSE NULL END, CASE WHEN "pData" ? 'gstRate' THEN "vRec"."gstRate" ELSE 18 END, CASE WHEN "pData" ? 'taxCodeId' THEN "vRec"."taxCodeId" ELSE NULL END, CASE WHEN "pData" ? 'finDiscPct' THEN "vRec"."finDiscPct" ELSE 0 END, CASE WHEN "pData" ? 'lowLevel' THEN "vRec"."lowLevel" ELSE 0 END, CASE WHEN "pData" ? 'highLevel' THEN "vRec"."highLevel" ELSE 0 END, CASE WHEN "pData" ? 'isShort' THEN "vRec"."isShort" ELSE FALSE END, CASE WHEN "pData" ? 'trackExpiry' THEN "vRec"."trackExpiry" ELSE FALSE END, CASE WHEN "pData" ? 'isControlled' THEN "vRec"."isControlled" ELSE FALSE END, CASE WHEN "pData" ? 'isPrecious' THEN "vRec"."isPrecious" ELSE FALSE END, CASE WHEN "pData" ? 'hsCode' THEN "vRec"."hsCode" ELSE NULL END, CASE WHEN "pData" ? 'weightKg' THEN "vRec"."weightKg" ELSE NULL END, CASE WHEN "pData" ? 'abcClass' THEN "vRec"."abcClass" ELSE NULL END, CASE WHEN "pData" ? 'avgDailySales' THEN "vRec"."avgDailySales" ELSE NULL END, CASE WHEN "pData" ? 'lastSaleDate' THEN "vRec"."lastSaleDate" ELSE NULL END, CASE WHEN "pData" ? 'leadDays' THEN "vRec"."leadDays" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."Products" t
       SET sku = CASE WHEN "pData" ? 'sku' THEN "vRec".sku ELSE t.sku END,
           upc = CASE WHEN "pData" ? 'upc' THEN "vRec".upc ELSE t.upc END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "nameUrdu" = CASE WHEN "pData" ? 'nameUrdu' THEN "vRec"."nameUrdu" ELSE t."nameUrdu" END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "imageUrl" = CASE WHEN "pData" ? 'imageUrl' THEN "vRec"."imageUrl" ELSE t."imageUrl" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "manufacturerId" = CASE WHEN "pData" ? 'manufacturerId' THEN "vRec"."manufacturerId" ELSE t."manufacturerId" END,
           "distributorVendorId" = CASE WHEN "pData" ? 'distributorVendorId' THEN "vRec"."distributorVendorId" ELSE t."distributorVendorId" END,
           "productClassId" = CASE WHEN "pData" ? 'productClassId' THEN "vRec"."productClassId" ELSE t."productClassId" END,
           "productSubclassId" = CASE WHEN "pData" ? 'productSubclassId' THEN "vRec"."productSubclassId" ELSE t."productSubclassId" END,
           "uomId" = CASE WHEN "pData" ? 'uomId' THEN "vRec"."uomId" ELSE t."uomId" END,
           ctn = CASE WHEN "pData" ? 'ctn' THEN "vRec".ctn ELSE t.ctn END,
           "defaultShelf" = CASE WHEN "pData" ? 'defaultShelf' THEN "vRec"."defaultShelf" ELSE t."defaultShelf" END,
           cost = CASE WHEN "pData" ? 'cost' THEN "vRec".cost ELSE t.cost END,
           "avgCost" = CASE WHEN "pData" ? 'avgCost' THEN "vRec"."avgCost" ELSE t."avgCost" END,
           "costPerUnit" = CASE WHEN "pData" ? 'costPerUnit' THEN "vRec"."costPerUnit" ELSE t."costPerUnit" END,
           price = CASE WHEN "pData" ? 'price' THEN "vRec".price ELSE t.price END,
           wprice = CASE WHEN "pData" ? 'wprice' THEN "vRec".wprice ELSE t.wprice END,
           "gstRate" = CASE WHEN "pData" ? 'gstRate' THEN "vRec"."gstRate" ELSE t."gstRate" END,
           "taxCodeId" = CASE WHEN "pData" ? 'taxCodeId' THEN "vRec"."taxCodeId" ELSE t."taxCodeId" END,
           "finDiscPct" = CASE WHEN "pData" ? 'finDiscPct' THEN "vRec"."finDiscPct" ELSE t."finDiscPct" END,
           "lowLevel" = CASE WHEN "pData" ? 'lowLevel' THEN "vRec"."lowLevel" ELSE t."lowLevel" END,
           "highLevel" = CASE WHEN "pData" ? 'highLevel' THEN "vRec"."highLevel" ELSE t."highLevel" END,
           "isShort" = CASE WHEN "pData" ? 'isShort' THEN "vRec"."isShort" ELSE t."isShort" END,
           "trackExpiry" = CASE WHEN "pData" ? 'trackExpiry' THEN "vRec"."trackExpiry" ELSE t."trackExpiry" END,
           "isControlled" = CASE WHEN "pData" ? 'isControlled' THEN "vRec"."isControlled" ELSE t."isControlled" END,
           "isPrecious" = CASE WHEN "pData" ? 'isPrecious' THEN "vRec"."isPrecious" ELSE t."isPrecious" END,
           "hsCode" = CASE WHEN "pData" ? 'hsCode' THEN "vRec"."hsCode" ELSE t."hsCode" END,
           "weightKg" = CASE WHEN "pData" ? 'weightKg' THEN "vRec"."weightKg" ELSE t."weightKg" END,
           "abcClass" = CASE WHEN "pData" ? 'abcClass' THEN "vRec"."abcClass" ELSE t."abcClass" END,
           "avgDailySales" = CASE WHEN "pData" ? 'avgDailySales' THEN "vRec"."avgDailySales" ELSE t."avgDailySales" END,
           "lastSaleDate" = CASE WHEN "pData" ? 'lastSaleDate' THEN "vRec"."lastSaleDate" ELSE t."lastSaleDate" END,
           "leadDays" = CASE WHEN "pData" ? 'leadDays' THEN "vRec"."leadDays" ELSE t."leadDays" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."Products" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Products %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Products % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'barcodes' THEN
    -- barcodes: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Inventory"."ProductBarcodes"
     WHERE "tenantId" = "vTenant" AND "itemId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'barcodes') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'barcodes') WITH ORDINALITY t(x, n) LOOP
      "vC1ProductBarcodes" := jsonb_populate_record(NULL::"Inventory"."ProductBarcodes", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Inventory"."ProductBarcodes" t
           SET barcode = CASE WHEN "vE1" ? 'barcode' THEN "vC1ProductBarcodes".barcode ELSE t.barcode END,
               kind = CASE WHEN "vE1" ? 'kind' THEN "vC1ProductBarcodes".kind ELSE t.kind END,
               "qtyPerScan" = CASE WHEN "vE1" ? 'qtyPerScan' THEN "vC1ProductBarcodes"."qtyPerScan" ELSE t."qtyPerScan" END,
               "isPrimary" = CASE WHEN "vE1" ? 'isPrimary' THEN "vC1ProductBarcodes"."isPrimary" ELSE t."isPrimary" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."itemId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ProductBarcodes: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Inventory"."ProductBarcodes" ("itemId", "tenantId", barcode, kind, "qtyPerScan", "isPrimary")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'barcode' THEN "vC1ProductBarcodes".barcode ELSE NULL END, CASE WHEN "vE1" ? 'kind' THEN "vC1ProductBarcodes".kind ELSE NULL END, CASE WHEN "vE1" ? 'qtyPerScan' THEN "vC1ProductBarcodes"."qtyPerScan" ELSE 1 END, CASE WHEN "vE1" ? 'isPrimary' THEN "vC1ProductBarcodes"."isPrimary" ELSE FALSE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'suppliers' THEN
    -- suppliers: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Inventory"."ProductSuppliers"
     WHERE "tenantId" = "vTenant" AND "itemId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'suppliers') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'suppliers') WITH ORDINALITY t(x, n) LOOP
      "vC1ProductSuppliers" := jsonb_populate_record(NULL::"Inventory"."ProductSuppliers", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Inventory"."ProductSuppliers" t
           SET "vendorId" = CASE WHEN "vE1" ? 'vendorId' THEN "vC1ProductSuppliers"."vendorId" ELSE t."vendorId" END,
               "vendorItemCode" = CASE WHEN "vE1" ? 'vendorItemCode' THEN "vC1ProductSuppliers"."vendorItemCode" ELSE t."vendorItemCode" END,
               "lastPrice" = CASE WHEN "vE1" ? 'lastPrice' THEN "vC1ProductSuppliers"."lastPrice" ELSE t."lastPrice" END,
               "lastPurchaseDate" = CASE WHEN "vE1" ? 'lastPurchaseDate' THEN "vC1ProductSuppliers"."lastPurchaseDate" ELSE t."lastPurchaseDate" END,
               "leadDays" = CASE WHEN "vE1" ? 'leadDays' THEN "vC1ProductSuppliers"."leadDays" ELSE t."leadDays" END,
               "sharePct" = CASE WHEN "vE1" ? 'sharePct' THEN "vC1ProductSuppliers"."sharePct" ELSE t."sharePct" END,
               "isPreferred" = CASE WHEN "vE1" ? 'isPreferred' THEN "vC1ProductSuppliers"."isPreferred" ELSE t."isPreferred" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."itemId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ProductSuppliers: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Inventory"."ProductSuppliers" ("itemId", "tenantId", "vendorId", "vendorItemCode", "lastPrice", "lastPurchaseDate", "leadDays", "sharePct", "isPreferred")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'vendorId' THEN "vC1ProductSuppliers"."vendorId" ELSE NULL END, CASE WHEN "vE1" ? 'vendorItemCode' THEN "vC1ProductSuppliers"."vendorItemCode" ELSE NULL END, CASE WHEN "vE1" ? 'lastPrice' THEN "vC1ProductSuppliers"."lastPrice" ELSE NULL END, CASE WHEN "vE1" ? 'lastPurchaseDate' THEN "vC1ProductSuppliers"."lastPurchaseDate" ELSE NULL END, CASE WHEN "vE1" ? 'leadDays' THEN "vC1ProductSuppliers"."leadDays" ELSE NULL END, CASE WHEN "vE1" ? 'sharePct' THEN "vC1ProductSuppliers"."sharePct" ELSE NULL END, CASE WHEN "vE1" ? 'isPreferred' THEN "vC1ProductSuppliers"."isPreferred" ELSE FALSE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'units' THEN
    -- units: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Inventory"."ProductUnits"
     WHERE "tenantId" = "vTenant" AND "itemId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'units') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'units') WITH ORDINALITY t(x, n) LOOP
      "vC1ProductUnits" := jsonb_populate_record(NULL::"Inventory"."ProductUnits", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Inventory"."ProductUnits" t
           SET "uomId" = CASE WHEN "vE1" ? 'uomId' THEN "vC1ProductUnits"."uomId" ELSE t."uomId" END,
               factor = CASE WHEN "vE1" ? 'factor' THEN "vC1ProductUnits".factor ELSE t.factor END,
               "isBase" = CASE WHEN "vE1" ? 'isBase' THEN "vC1ProductUnits"."isBase" ELSE t."isBase" END,
               "isPurchaseDefault" = CASE WHEN "vE1" ? 'isPurchaseDefault' THEN "vC1ProductUnits"."isPurchaseDefault" ELSE t."isPurchaseDefault" END,
               "isSalesDefault" = CASE WHEN "vE1" ? 'isSalesDefault' THEN "vC1ProductUnits"."isSalesDefault" ELSE t."isSalesDefault" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."itemId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ProductUnits: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Inventory"."ProductUnits" ("itemId", "tenantId", "uomId", factor, "isBase", "isPurchaseDefault", "isSalesDefault")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'uomId' THEN "vC1ProductUnits"."uomId" ELSE NULL END, CASE WHEN "vE1" ? 'factor' THEN "vC1ProductUnits".factor ELSE NULL END, CASE WHEN "vE1" ? 'isBase' THEN "vC1ProductUnits"."isBase" ELSE FALSE END, CASE WHEN "vE1" ? 'isPurchaseDefault' THEN "vC1ProductUnits"."isPurchaseDefault" ELSE FALSE END, CASE WHEN "vE1" ? 'isSalesDefault' THEN "vC1ProductUnits"."isSalesDefault" ELSE FALSE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."productAddUpdate"(jsonb) IS 'Save (insert or update) one Products record with its barcodes, suppliers, units.';

-- Products: one record as JSON (camelCase keys), with lookup labels and barcodes, suppliers, units
CREATE OR REPLACE FUNCTION "Inventory"."getProductInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('ProductStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ProductStatus', t.status) ->> 'tone', 'abcClassLabel', "Lookups"."getLookupLabel"('AbcClass', t."abcClass") ->> 'label', 'abcClassTone', "Lookups"."getLookupLabel"('AbcClass', t."abcClass") ->> 'tone') ||
         jsonb_build_object('barcodes', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Inventory"."ProductBarcodes" c1 WHERE c1."itemId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'suppliers', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Inventory"."ProductSuppliers" c1 WHERE c1."itemId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'units', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Inventory"."ProductUnits" c1 WHERE c1."itemId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Inventory"."Products" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getProductInfo"(uuid) IS 'Read one Products record (getter for its screens).';

-- Warehouses: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Inventory"."warehouseAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."Warehouses";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."Warehouses", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'code') OR "vRec".code IS NULL THEN
      "vRec".code := "Company"."getNextDocNo"('WH', current_date, "vRec"."branchId");
    END IF;
    INSERT INTO "Inventory"."Warehouses" ("tenantId", code, name, description, type, "branchId", "managerUserId", address, city, "capacityPallets", "inventoryAccountId", "blockNegativeStock", "isPrimary", status, "vehicleId")
    VALUES ("vTenant", "vRec".code, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'type' THEN "vRec".type ELSE 'WAREHOUSE' END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'managerUserId' THEN "vRec"."managerUserId" ELSE NULL END, CASE WHEN "pData" ? 'address' THEN "vRec".address ELSE NULL END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'capacityPallets' THEN "vRec"."capacityPallets" ELSE NULL END, CASE WHEN "pData" ? 'inventoryAccountId' THEN "vRec"."inventoryAccountId" ELSE NULL END, CASE WHEN "pData" ? 'blockNegativeStock' THEN "vRec"."blockNegativeStock" ELSE TRUE END, CASE WHEN "pData" ? 'isPrimary' THEN "vRec"."isPrimary" ELSE FALSE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'vehicleId' THEN "vRec"."vehicleId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."Warehouses" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           type = CASE WHEN "pData" ? 'type' THEN "vRec".type ELSE t.type END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "managerUserId" = CASE WHEN "pData" ? 'managerUserId' THEN "vRec"."managerUserId" ELSE t."managerUserId" END,
           address = CASE WHEN "pData" ? 'address' THEN "vRec".address ELSE t.address END,
           city = CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE t.city END,
           "capacityPallets" = CASE WHEN "pData" ? 'capacityPallets' THEN "vRec"."capacityPallets" ELSE t."capacityPallets" END,
           "inventoryAccountId" = CASE WHEN "pData" ? 'inventoryAccountId' THEN "vRec"."inventoryAccountId" ELSE t."inventoryAccountId" END,
           "blockNegativeStock" = CASE WHEN "pData" ? 'blockNegativeStock' THEN "vRec"."blockNegativeStock" ELSE t."blockNegativeStock" END,
           "isPrimary" = CASE WHEN "pData" ? 'isPrimary' THEN "vRec"."isPrimary" ELSE t."isPrimary" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "vehicleId" = CASE WHEN "pData" ? 'vehicleId' THEN "vRec"."vehicleId" ELSE t."vehicleId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."Warehouses" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Warehouses %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Warehouses % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."warehouseAddUpdate"(jsonb) IS 'Save (insert or update) one Warehouses record.';

-- Warehouses: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Inventory"."getWarehouseInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('typeLabel', "Lookups"."getLookupLabel"('WarehouseType', t.type) ->> 'label', 'typeTone', "Lookups"."getLookupLabel"('WarehouseType', t.type) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone')
    FROM "Inventory"."Warehouses" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getWarehouseInfo"(uuid) IS 'Read one Warehouses record (getter for its screens).';

-- WarehouseBins: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Inventory"."warehouseBinAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."WarehouseBins";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."WarehouseBins", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Inventory"."WarehouseBins" ("tenantId", "warehouseId", code, rack, "shelfRow", position, zone, "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'rack' THEN "vRec".rack ELSE NULL END, CASE WHEN "pData" ? 'shelfRow' THEN "vRec"."shelfRow" ELSE NULL END, CASE WHEN "pData" ? 'position' THEN "vRec".position ELSE NULL END, CASE WHEN "pData" ? 'zone' THEN "vRec".zone ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."WarehouseBins" t
       SET "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           rack = CASE WHEN "pData" ? 'rack' THEN "vRec".rack ELSE t.rack END,
           "shelfRow" = CASE WHEN "pData" ? 'shelfRow' THEN "vRec"."shelfRow" ELSE t."shelfRow" END,
           position = CASE WHEN "pData" ? 'position' THEN "vRec".position ELSE t.position END,
           zone = CASE WHEN "pData" ? 'zone' THEN "vRec".zone ELSE t.zone END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."WarehouseBins" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'WarehouseBins %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'WarehouseBins % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."warehouseBinAddUpdate"(jsonb) IS 'Save (insert or update) one WarehouseBins record.';

-- WarehouseBins: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Inventory"."getWarehouseBinInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "Inventory"."WarehouseBins" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getWarehouseBinInfo"(uuid) IS 'Read one WarehouseBins record (getter for its screens).';

-- ProductBatches: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Inventory"."productBatchAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."ProductBatches";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."ProductBatches", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Inventory"."ProductBatches" ("tenantId", "itemId", "batchNo", "expiryDate", "mfgDate", "unitCost", disposition, "dispositionAt", "dispositionByUserId", "sourceDocType", "sourceDocId", notes)
    VALUES ("vTenant", CASE WHEN "pData" ? 'itemId' THEN "vRec"."itemId" ELSE NULL END, CASE WHEN "pData" ? 'batchNo' THEN "vRec"."batchNo" ELSE NULL END, CASE WHEN "pData" ? 'expiryDate' THEN "vRec"."expiryDate" ELSE NULL END, CASE WHEN "pData" ? 'mfgDate' THEN "vRec"."mfgDate" ELSE NULL END, CASE WHEN "pData" ? 'unitCost' THEN "vRec"."unitCost" ELSE NULL END, CASE WHEN "pData" ? 'disposition' THEN "vRec".disposition ELSE 'SALEABLE' END, CASE WHEN "pData" ? 'dispositionAt' THEN "vRec"."dispositionAt" ELSE NULL END, CASE WHEN "pData" ? 'dispositionByUserId' THEN "vRec"."dispositionByUserId" ELSE NULL END, CASE WHEN "pData" ? 'sourceDocType' THEN "vRec"."sourceDocType" ELSE NULL END, CASE WHEN "pData" ? 'sourceDocId' THEN "vRec"."sourceDocId" ELSE NULL END, CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."ProductBatches" t
       SET "itemId" = CASE WHEN "pData" ? 'itemId' THEN "vRec"."itemId" ELSE t."itemId" END,
           "batchNo" = CASE WHEN "pData" ? 'batchNo' THEN "vRec"."batchNo" ELSE t."batchNo" END,
           "expiryDate" = CASE WHEN "pData" ? 'expiryDate' THEN "vRec"."expiryDate" ELSE t."expiryDate" END,
           "mfgDate" = CASE WHEN "pData" ? 'mfgDate' THEN "vRec"."mfgDate" ELSE t."mfgDate" END,
           "unitCost" = CASE WHEN "pData" ? 'unitCost' THEN "vRec"."unitCost" ELSE t."unitCost" END,
           disposition = CASE WHEN "pData" ? 'disposition' THEN "vRec".disposition ELSE t.disposition END,
           "dispositionAt" = CASE WHEN "pData" ? 'dispositionAt' THEN "vRec"."dispositionAt" ELSE t."dispositionAt" END,
           "dispositionByUserId" = CASE WHEN "pData" ? 'dispositionByUserId' THEN "vRec"."dispositionByUserId" ELSE t."dispositionByUserId" END,
           "sourceDocType" = CASE WHEN "pData" ? 'sourceDocType' THEN "vRec"."sourceDocType" ELSE t."sourceDocType" END,
           "sourceDocId" = CASE WHEN "pData" ? 'sourceDocId' THEN "vRec"."sourceDocId" ELSE t."sourceDocId" END,
           notes = CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE t.notes END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."ProductBatches" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ProductBatches %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ProductBatches % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."productBatchAddUpdate"(jsonb) IS 'Save (insert or update) one ProductBatches record.';

-- ProductBatches: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Inventory"."getProductBatchInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('dispositionLabel', "Lookups"."getLookupLabel"('ProductBatchDisposition', t.disposition) ->> 'label', 'dispositionTone', "Lookups"."getLookupLabel"('ProductBatchDisposition', t.disposition) ->> 'tone')
    FROM "Inventory"."ProductBatches" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getProductBatchInfo"(uuid) IS 'Read one ProductBatches record (getter for its screens).';

-- StockMovementReasons: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Inventory"."stockMovementReasonAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."StockMovementReasons";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."StockMovementReasons", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Inventory"."StockMovementReasons" ("tenantId", direction, code, label, hint, icon, "ledgerMovementType", "expenseAccountId", "isSystem", "sortOrder", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'direction' THEN "vRec".direction ELSE NULL END, CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'label' THEN "vRec".label ELSE NULL END, CASE WHEN "pData" ? 'hint' THEN "vRec".hint ELSE NULL END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE NULL END, CASE WHEN "pData" ? 'ledgerMovementType' THEN "vRec"."ledgerMovementType" ELSE NULL END, CASE WHEN "pData" ? 'expenseAccountId' THEN "vRec"."expenseAccountId" ELSE NULL END, CASE WHEN "pData" ? 'isSystem' THEN "vRec"."isSystem" ELSE FALSE END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."StockMovementReasons" t
       SET direction = CASE WHEN "pData" ? 'direction' THEN "vRec".direction ELSE t.direction END,
           code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           label = CASE WHEN "pData" ? 'label' THEN "vRec".label ELSE t.label END,
           hint = CASE WHEN "pData" ? 'hint' THEN "vRec".hint ELSE t.hint END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END,
           "ledgerMovementType" = CASE WHEN "pData" ? 'ledgerMovementType' THEN "vRec"."ledgerMovementType" ELSE t."ledgerMovementType" END,
           "expenseAccountId" = CASE WHEN "pData" ? 'expenseAccountId' THEN "vRec"."expenseAccountId" ELSE t."expenseAccountId" END,
           "isSystem" = CASE WHEN "pData" ? 'isSystem' THEN "vRec"."isSystem" ELSE t."isSystem" END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."StockMovementReasons" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'StockMovementReasons %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'StockMovementReasons % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."stockMovementReasonAddUpdate"(jsonb) IS 'Save (insert or update) one StockMovementReasons record.';

-- StockMovementReasons: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Inventory"."getStockMovementReasonInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('directionLabel', "Lookups"."getLookupLabel"('StockMovementReasonDirection', t.direction) ->> 'label', 'directionTone', "Lookups"."getLookupLabel"('StockMovementReasonDirection', t.direction) ->> 'tone', 'ledgerMovementTypeLabel', "Lookups"."getLookupLabel"('StockMovementReasonLedgerMovementType', t."ledgerMovementType") ->> 'label', 'ledgerMovementTypeTone', "Lookups"."getLookupLabel"('StockMovementReasonLedgerMovementType', t."ledgerMovementType") ->> 'tone')
    FROM "Inventory"."StockMovementReasons" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getStockMovementReasonInfo"(uuid) IS 'Read one StockMovementReasons record (getter for its screens).';

-- StockInOut: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Inventory"."stockInOutEntryAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."StockInOut";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1StockInOutEntryLines" "Inventory"."StockInOutEntryLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."StockInOut", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"(CASE WHEN "vRec".mode = 'IN' THEN 'MI' WHEN "vRec".mode = 'OUT' THEN 'MO' ELSE 'MI' END, "vRec"."docDate", NULL);
    END IF;
    INSERT INTO "Inventory"."StockInOut" ("tenantId", "docNo", mode, "docDate", "manualRef", "reasonId", "warehouseId", "binId", "requestedByName", "enteredByUserId", notes, "totalItems", "totalQty", "totalValue", "requestedByEmployeeId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'mode' THEN "vRec".mode ELSE NULL END, CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'manualRef' THEN "vRec"."manualRef" ELSE NULL END, CASE WHEN "pData" ? 'reasonId' THEN "vRec"."reasonId" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'binId' THEN "vRec"."binId" ELSE NULL END, CASE WHEN "pData" ? 'requestedByName' THEN "vRec"."requestedByName" ELSE NULL END, CASE WHEN "pData" ? 'enteredByUserId' THEN "vRec"."enteredByUserId" ELSE NULL END, CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE NULL END, CASE WHEN "pData" ? 'totalItems' THEN "vRec"."totalItems" ELSE 0 END, CASE WHEN "pData" ? 'totalQty' THEN "vRec"."totalQty" ELSE 0 END, CASE WHEN "pData" ? 'totalValue' THEN "vRec"."totalValue" ELSE 0 END, CASE WHEN "pData" ? 'requestedByEmployeeId' THEN "vRec"."requestedByEmployeeId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Inventory"."StockInOut" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'StockInOut: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Inventory"."StockInOut" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           mode = CASE WHEN "pData" ? 'mode' THEN "vRec".mode ELSE t.mode END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "manualRef" = CASE WHEN "pData" ? 'manualRef' THEN "vRec"."manualRef" ELSE t."manualRef" END,
           "reasonId" = CASE WHEN "pData" ? 'reasonId' THEN "vRec"."reasonId" ELSE t."reasonId" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "binId" = CASE WHEN "pData" ? 'binId' THEN "vRec"."binId" ELSE t."binId" END,
           "requestedByName" = CASE WHEN "pData" ? 'requestedByName' THEN "vRec"."requestedByName" ELSE t."requestedByName" END,
           "enteredByUserId" = CASE WHEN "pData" ? 'enteredByUserId' THEN "vRec"."enteredByUserId" ELSE t."enteredByUserId" END,
           notes = CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE t.notes END,
           "totalItems" = CASE WHEN "pData" ? 'totalItems' THEN "vRec"."totalItems" ELSE t."totalItems" END,
           "totalQty" = CASE WHEN "pData" ? 'totalQty' THEN "vRec"."totalQty" ELSE t."totalQty" END,
           "totalValue" = CASE WHEN "pData" ? 'totalValue' THEN "vRec"."totalValue" ELSE t."totalValue" END,
           "requestedByEmployeeId" = CASE WHEN "pData" ? 'requestedByEmployeeId' THEN "vRec"."requestedByEmployeeId" ELSE t."requestedByEmployeeId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."StockInOut" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'StockInOut %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'StockInOut % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Inventory"."StockInOutEntryLines"
     WHERE "tenantId" = "vTenant" AND "entryId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1StockInOutEntryLines" := jsonb_populate_record(NULL::"Inventory"."StockInOutEntryLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1StockInOutEntryLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Inventory"."StockInOutEntryLines" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1StockInOutEntryLines"."itemId" ELSE t."itemId" END,
               "batchId" = CASE WHEN "vE1" ? 'batchId' THEN "vC1StockInOutEntryLines"."batchId" ELSE t."batchId" END,
               "newBatchNo" = CASE WHEN "vE1" ? 'newBatchNo' THEN "vC1StockInOutEntryLines"."newBatchNo" ELSE t."newBatchNo" END,
               "newExpiryDate" = CASE WHEN "vE1" ? 'newExpiryDate' THEN "vC1StockInOutEntryLines"."newExpiryDate" ELSE t."newExpiryDate" END,
               qty = CASE WHEN "vE1" ? 'qty' THEN "vC1StockInOutEntryLines".qty ELSE t.qty END,
               "unitCost" = CASE WHEN "vE1" ? 'unitCost' THEN "vC1StockInOutEntryLines"."unitCost" ELSE t."unitCost" END,
               "lineNo" = "vC1StockInOutEntryLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."entryId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'StockInOutEntryLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Inventory"."StockInOutEntryLines" ("entryId", "tenantId", "lineNo", "itemId", "batchId", "newBatchNo", "newExpiryDate", qty, "unitCost")
        VALUES ("vRet", "vTenant", "vC1StockInOutEntryLines"."lineNo", CASE WHEN "vE1" ? 'itemId' THEN "vC1StockInOutEntryLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'batchId' THEN "vC1StockInOutEntryLines"."batchId" ELSE NULL END, CASE WHEN "vE1" ? 'newBatchNo' THEN "vC1StockInOutEntryLines"."newBatchNo" ELSE NULL END, CASE WHEN "vE1" ? 'newExpiryDate' THEN "vC1StockInOutEntryLines"."newExpiryDate" ELSE NULL END, CASE WHEN "vE1" ? 'qty' THEN "vC1StockInOutEntryLines".qty ELSE NULL END, CASE WHEN "vE1" ? 'unitCost' THEN "vC1StockInOutEntryLines"."unitCost" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."stockInOutEntryAddUpdate"(jsonb) IS 'Save (insert or update) one StockInOut record with its lines.';

-- StockInOut: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Inventory"."getStockInOutEntryInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('modeLabel', "Lookups"."getLookupLabel"('StockInOutEntryMode', t.mode) ->> 'label', 'modeTone', "Lookups"."getLookupLabel"('StockInOutEntryMode', t.mode) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('DraftPostedCancelledStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('DraftPostedCancelledStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Inventory"."StockInOutEntryLines" c1 WHERE c1."entryId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Inventory"."StockInOut" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getStockInOutEntryInfo"(uuid) IS 'Read one StockInOut record (getter for its screens).';

-- StockInOut: Post (status -> POSTED); allowed from DRAFT
CREATE OR REPLACE FUNCTION "Inventory"."stockInOutEntryPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."StockInOut";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."StockInOut" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'StockInOut % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'StockInOut %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."stockInOutEntryPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."stockInOutEntryPostEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."StockInOut" t SET status = 'POSTED', "postedAt" = now(), "postedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- StockInOut: Cancel (status -> CANCELLED); allowed from DRAFT, POSTED
CREATE OR REPLACE FUNCTION "Inventory"."stockInOutEntryCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."StockInOut";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."StockInOut" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'StockInOut % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'POSTED') THEN
    RAISE EXCEPTION 'StockInOut %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."stockInOutEntryCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."stockInOutEntryCancelEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."StockInOut" t SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- StockTransfers: insert (no "id") or update (with "id"); child arrays: receiptLines
CREATE OR REPLACE FUNCTION "Inventory"."stockTransferAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."StockTransfers";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1StockTransferReceiptLines" "Inventory"."StockTransferReceiptLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."StockTransfers", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('TRF', "vRec"."docDate", NULL);
    END IF;
    INSERT INTO "Inventory"."StockTransfers" ("tenantId", "docNo", "docDate", "transferAt", "fromWarehouseId", "toWarehouseId", "preparedByUserId", remarks, carrier, "driverName", "vehicleNo", "dispatchedAt", "etaAt", "receivedAt", "receivedByUserId", "receiptNote", "totalItems", "totalQty", "totalValue", "receiptJournalEntryId", "driverEmployeeId", "vehicleId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'transferAt' THEN "vRec"."transferAt" ELSE now() END, CASE WHEN "pData" ? 'fromWarehouseId' THEN "vRec"."fromWarehouseId" ELSE NULL END, CASE WHEN "pData" ? 'toWarehouseId' THEN "vRec"."toWarehouseId" ELSE NULL END, CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'carrier' THEN "vRec".carrier ELSE NULL END, CASE WHEN "pData" ? 'driverName' THEN "vRec"."driverName" ELSE NULL END, CASE WHEN "pData" ? 'vehicleNo' THEN "vRec"."vehicleNo" ELSE NULL END, CASE WHEN "pData" ? 'dispatchedAt' THEN "vRec"."dispatchedAt" ELSE NULL END, CASE WHEN "pData" ? 'etaAt' THEN "vRec"."etaAt" ELSE NULL END, CASE WHEN "pData" ? 'receivedAt' THEN "vRec"."receivedAt" ELSE NULL END, CASE WHEN "pData" ? 'receivedByUserId' THEN "vRec"."receivedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'receiptNote' THEN "vRec"."receiptNote" ELSE NULL END, CASE WHEN "pData" ? 'totalItems' THEN "vRec"."totalItems" ELSE 0 END, CASE WHEN "pData" ? 'totalQty' THEN "vRec"."totalQty" ELSE 0 END, CASE WHEN "pData" ? 'totalValue' THEN "vRec"."totalValue" ELSE 0 END, CASE WHEN "pData" ? 'receiptJournalEntryId' THEN "vRec"."receiptJournalEntryId" ELSE NULL END, CASE WHEN "pData" ? 'driverEmployeeId' THEN "vRec"."driverEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'vehicleId' THEN "vRec"."vehicleId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Inventory"."StockTransfers" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'StockTransfers: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Inventory"."StockTransfers" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "transferAt" = CASE WHEN "pData" ? 'transferAt' THEN "vRec"."transferAt" ELSE t."transferAt" END,
           "fromWarehouseId" = CASE WHEN "pData" ? 'fromWarehouseId' THEN "vRec"."fromWarehouseId" ELSE t."fromWarehouseId" END,
           "toWarehouseId" = CASE WHEN "pData" ? 'toWarehouseId' THEN "vRec"."toWarehouseId" ELSE t."toWarehouseId" END,
           "preparedByUserId" = CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE t."preparedByUserId" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END,
           carrier = CASE WHEN "pData" ? 'carrier' THEN "vRec".carrier ELSE t.carrier END,
           "driverName" = CASE WHEN "pData" ? 'driverName' THEN "vRec"."driverName" ELSE t."driverName" END,
           "vehicleNo" = CASE WHEN "pData" ? 'vehicleNo' THEN "vRec"."vehicleNo" ELSE t."vehicleNo" END,
           "dispatchedAt" = CASE WHEN "pData" ? 'dispatchedAt' THEN "vRec"."dispatchedAt" ELSE t."dispatchedAt" END,
           "etaAt" = CASE WHEN "pData" ? 'etaAt' THEN "vRec"."etaAt" ELSE t."etaAt" END,
           "receivedAt" = CASE WHEN "pData" ? 'receivedAt' THEN "vRec"."receivedAt" ELSE t."receivedAt" END,
           "receivedByUserId" = CASE WHEN "pData" ? 'receivedByUserId' THEN "vRec"."receivedByUserId" ELSE t."receivedByUserId" END,
           "receiptNote" = CASE WHEN "pData" ? 'receiptNote' THEN "vRec"."receiptNote" ELSE t."receiptNote" END,
           "totalItems" = CASE WHEN "pData" ? 'totalItems' THEN "vRec"."totalItems" ELSE t."totalItems" END,
           "totalQty" = CASE WHEN "pData" ? 'totalQty' THEN "vRec"."totalQty" ELSE t."totalQty" END,
           "totalValue" = CASE WHEN "pData" ? 'totalValue' THEN "vRec"."totalValue" ELSE t."totalValue" END,
           "receiptJournalEntryId" = CASE WHEN "pData" ? 'receiptJournalEntryId' THEN "vRec"."receiptJournalEntryId" ELSE t."receiptJournalEntryId" END,
           "driverEmployeeId" = CASE WHEN "pData" ? 'driverEmployeeId' THEN "vRec"."driverEmployeeId" ELSE t."driverEmployeeId" END,
           "vehicleId" = CASE WHEN "pData" ? 'vehicleId' THEN "vRec"."vehicleId" ELSE t."vehicleId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."StockTransfers" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'StockTransfers %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'StockTransfers % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'receiptLines' THEN
    -- receiptLines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Inventory"."StockTransferReceiptLines"
     WHERE "tenantId" = "vTenant" AND "transferId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'receiptLines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'receiptLines') WITH ORDINALITY t(x, n) LOOP
      "vC1StockTransferReceiptLines" := jsonb_populate_record(NULL::"Inventory"."StockTransferReceiptLines", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Inventory"."StockTransferReceiptLines" t
           SET "transferLineId" = CASE WHEN "vE1" ? 'transferLineId' THEN "vC1StockTransferReceiptLines"."transferLineId" ELSE t."transferLineId" END,
               "sentQty" = CASE WHEN "vE1" ? 'sentQty' THEN "vC1StockTransferReceiptLines"."sentQty" ELSE t."sentQty" END,
               "receivedQty" = CASE WHEN "vE1" ? 'receivedQty' THEN "vC1StockTransferReceiptLines"."receivedQty" ELSE t."receivedQty" END,
               note = CASE WHEN "vE1" ? 'note' THEN "vC1StockTransferReceiptLines".note ELSE t.note END,
               "receivedAt" = CASE WHEN "vE1" ? 'receivedAt' THEN "vC1StockTransferReceiptLines"."receivedAt" ELSE t."receivedAt" END,
               "receivedByUserId" = CASE WHEN "vE1" ? 'receivedByUserId' THEN "vC1StockTransferReceiptLines"."receivedByUserId" ELSE t."receivedByUserId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."transferId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'StockTransferReceiptLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Inventory"."StockTransferReceiptLines" ("transferId", "tenantId", "transferLineId", "sentQty", "receivedQty", note, "receivedAt", "receivedByUserId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'transferLineId' THEN "vC1StockTransferReceiptLines"."transferLineId" ELSE NULL END, CASE WHEN "vE1" ? 'sentQty' THEN "vC1StockTransferReceiptLines"."sentQty" ELSE NULL END, CASE WHEN "vE1" ? 'receivedQty' THEN "vC1StockTransferReceiptLines"."receivedQty" ELSE NULL END, CASE WHEN "vE1" ? 'note' THEN "vC1StockTransferReceiptLines".note ELSE NULL END, CASE WHEN "vE1" ? 'receivedAt' THEN "vC1StockTransferReceiptLines"."receivedAt" ELSE now() END, CASE WHEN "vE1" ? 'receivedByUserId' THEN "vC1StockTransferReceiptLines"."receivedByUserId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."stockTransferAddUpdate"(jsonb) IS 'Save (insert or update) one StockTransfers record with its receiptLines.';

-- StockTransfers: one record as JSON (camelCase keys), with lookup labels and receiptLines
CREATE OR REPLACE FUNCTION "Inventory"."getStockTransferInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('StockTransferStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('StockTransferStatus', t.status) ->> 'tone') ||
         jsonb_build_object('receiptLines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Inventory"."StockTransferReceiptLines" c1 WHERE c1."transferId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Inventory"."StockTransfers" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getStockTransferInfo"(uuid) IS 'Read one StockTransfers record (getter for its screens).';

-- StockTransfers: Post (status -> POSTED); allowed from DRAFT
CREATE OR REPLACE FUNCTION "Inventory"."stockTransferPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."StockTransfers";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."StockTransfers" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'StockTransfers % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'StockTransfers %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."stockTransferPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."stockTransferPostEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."StockTransfers" t SET status = 'POSTED', "postedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- StockTransfers: Cancel (status -> CANCELLED); allowed from DRAFT, POSTED, DISPATCHED, IN_TRANSIT, RECEIVED
CREATE OR REPLACE FUNCTION "Inventory"."stockTransferCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."StockTransfers";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."StockTransfers" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'StockTransfers % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'POSTED', 'DISPATCHED', 'IN_TRANSIT', 'RECEIVED') THEN
    RAISE EXCEPTION 'StockTransfers %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."stockTransferCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."stockTransferCancelEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."StockTransfers" t SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- StockTransfers: Receive (status -> RECEIVED); allowed from DISPATCHED, IN_TRANSIT, POSTED
CREATE OR REPLACE FUNCTION "Inventory"."stockTransferReceive"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."StockTransfers";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."StockTransfers" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'StockTransfers % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'RECEIVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DISPATCHED', 'IN_TRANSIT', 'POSTED') THEN
    RAISE EXCEPTION 'StockTransfers %: cannot receive from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."stockTransferReceiveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."stockTransferReceiveEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."StockTransfers" t SET status = 'RECEIVED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- StockAdjustments: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Inventory"."stockAdjustmentAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."StockAdjustments";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1StockAdjustmentLines" "Inventory"."StockAdjustmentLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."StockAdjustments", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('ADJ', "vRec"."docDate", NULL);
    END IF;
    INSERT INTO "Inventory"."StockAdjustments" ("tenantId", "docNo", "docDate", "warehouseId", "reasonId", "offsetAccountId", remarks, "lineCount", "netValue", "approvalRequired", "preparedByUserId", "rejectionReason", "sourceDocType", "sourceDocId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'reasonId' THEN "vRec"."reasonId" ELSE NULL END, CASE WHEN "pData" ? 'offsetAccountId' THEN "vRec"."offsetAccountId" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'lineCount' THEN "vRec"."lineCount" ELSE 0 END, CASE WHEN "pData" ? 'netValue' THEN "vRec"."netValue" ELSE 0 END, CASE WHEN "pData" ? 'approvalRequired' THEN "vRec"."approvalRequired" ELSE FALSE END, CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE NULL END, CASE WHEN "pData" ? 'sourceDocType' THEN "vRec"."sourceDocType" ELSE NULL END, CASE WHEN "pData" ? 'sourceDocId' THEN "vRec"."sourceDocId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Inventory"."StockAdjustments" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'StockAdjustments: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Inventory"."StockAdjustments" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "reasonId" = CASE WHEN "pData" ? 'reasonId' THEN "vRec"."reasonId" ELSE t."reasonId" END,
           "offsetAccountId" = CASE WHEN "pData" ? 'offsetAccountId' THEN "vRec"."offsetAccountId" ELSE t."offsetAccountId" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END,
           "lineCount" = CASE WHEN "pData" ? 'lineCount' THEN "vRec"."lineCount" ELSE t."lineCount" END,
           "netValue" = CASE WHEN "pData" ? 'netValue' THEN "vRec"."netValue" ELSE t."netValue" END,
           "approvalRequired" = CASE WHEN "pData" ? 'approvalRequired' THEN "vRec"."approvalRequired" ELSE t."approvalRequired" END,
           "preparedByUserId" = CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE t."preparedByUserId" END,
           "rejectionReason" = CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE t."rejectionReason" END,
           "sourceDocType" = CASE WHEN "pData" ? 'sourceDocType' THEN "vRec"."sourceDocType" ELSE t."sourceDocType" END,
           "sourceDocId" = CASE WHEN "pData" ? 'sourceDocId' THEN "vRec"."sourceDocId" ELSE t."sourceDocId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."StockAdjustments" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'StockAdjustments %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'StockAdjustments % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Inventory"."StockAdjustmentLines"
     WHERE "tenantId" = "vTenant" AND "adjustmentId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1StockAdjustmentLines" := jsonb_populate_record(NULL::"Inventory"."StockAdjustmentLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1StockAdjustmentLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Inventory"."StockAdjustmentLines" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1StockAdjustmentLines"."itemId" ELSE t."itemId" END,
               "batchId" = CASE WHEN "vE1" ? 'batchId' THEN "vC1StockAdjustmentLines"."batchId" ELSE t."batchId" END,
               "qtyOnHand" = CASE WHEN "vE1" ? 'qtyOnHand' THEN "vC1StockAdjustmentLines"."qtyOnHand" ELSE t."qtyOnHand" END,
               "qtyCounted" = CASE WHEN "vE1" ? 'qtyCounted' THEN "vC1StockAdjustmentLines"."qtyCounted" ELSE t."qtyCounted" END,
               "unitCost" = CASE WHEN "vE1" ? 'unitCost' THEN "vC1StockAdjustmentLines"."unitCost" ELSE t."unitCost" END,
               "lineNo" = "vC1StockAdjustmentLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."adjustmentId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'StockAdjustmentLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Inventory"."StockAdjustmentLines" ("adjustmentId", "tenantId", "lineNo", "itemId", "batchId", "qtyOnHand", "qtyCounted", "unitCost")
        VALUES ("vRet", "vTenant", "vC1StockAdjustmentLines"."lineNo", CASE WHEN "vE1" ? 'itemId' THEN "vC1StockAdjustmentLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'batchId' THEN "vC1StockAdjustmentLines"."batchId" ELSE NULL END, CASE WHEN "vE1" ? 'qtyOnHand' THEN "vC1StockAdjustmentLines"."qtyOnHand" ELSE NULL END, CASE WHEN "vE1" ? 'qtyCounted' THEN "vC1StockAdjustmentLines"."qtyCounted" ELSE NULL END, CASE WHEN "vE1" ? 'unitCost' THEN "vC1StockAdjustmentLines"."unitCost" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."stockAdjustmentAddUpdate"(jsonb) IS 'Save (insert or update) one StockAdjustments record with its lines.';

-- StockAdjustments: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Inventory"."getStockAdjustmentInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('StockAdjustmentStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('StockAdjustmentStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Inventory"."StockAdjustmentLines" c1 WHERE c1."adjustmentId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Inventory"."StockAdjustments" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getStockAdjustmentInfo"(uuid) IS 'Read one StockAdjustments record (getter for its screens).';

-- StockAdjustments: Post (status -> POSTED); allowed from DRAFT, PENDING_APPROVAL
CREATE OR REPLACE FUNCTION "Inventory"."stockAdjustmentPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."StockAdjustments";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."StockAdjustments" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'StockAdjustments % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'StockAdjustments %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."stockAdjustmentPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."stockAdjustmentPostEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."StockAdjustments" t SET status = 'POSTED', "postedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- StockAdjustments: Cancel (status -> CANCELLED); allowed from DRAFT, PENDING_APPROVAL, POSTED, REJECTED
CREATE OR REPLACE FUNCTION "Inventory"."stockAdjustmentCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."StockAdjustments";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."StockAdjustments" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'StockAdjustments % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'REJECTED') THEN
    RAISE EXCEPTION 'StockAdjustments %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."stockAdjustmentCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."stockAdjustmentCancelEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."StockAdjustments" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- PrincipalClaims: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Inventory"."principalClaimAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."PrincipalClaims";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."PrincipalClaims", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Inventory"."PrincipalClaims" ("tenantId", "claimNo", "manufacturerId", "claimDate", "claimType", description, "itemId", "batchId", qty, amount, "settledDate", "debitNoteId", remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'claimNo' THEN "vRec"."claimNo" ELSE NULL END, CASE WHEN "pData" ? 'manufacturerId' THEN "vRec"."manufacturerId" ELSE NULL END, CASE WHEN "pData" ? 'claimDate' THEN "vRec"."claimDate" ELSE NULL END, CASE WHEN "pData" ? 'claimType' THEN "vRec"."claimType" ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'itemId' THEN "vRec"."itemId" ELSE NULL END, CASE WHEN "pData" ? 'batchId' THEN "vRec"."batchId" ELSE NULL END, CASE WHEN "pData" ? 'qty' THEN "vRec".qty ELSE NULL END, CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE NULL END, CASE WHEN "pData" ? 'settledDate' THEN "vRec"."settledDate" ELSE NULL END, CASE WHEN "pData" ? 'debitNoteId' THEN "vRec"."debitNoteId" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."PrincipalClaims" t
       SET "claimNo" = CASE WHEN "pData" ? 'claimNo' THEN "vRec"."claimNo" ELSE t."claimNo" END,
           "manufacturerId" = CASE WHEN "pData" ? 'manufacturerId' THEN "vRec"."manufacturerId" ELSE t."manufacturerId" END,
           "claimDate" = CASE WHEN "pData" ? 'claimDate' THEN "vRec"."claimDate" ELSE t."claimDate" END,
           "claimType" = CASE WHEN "pData" ? 'claimType' THEN "vRec"."claimType" ELSE t."claimType" END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "itemId" = CASE WHEN "pData" ? 'itemId' THEN "vRec"."itemId" ELSE t."itemId" END,
           "batchId" = CASE WHEN "pData" ? 'batchId' THEN "vRec"."batchId" ELSE t."batchId" END,
           qty = CASE WHEN "pData" ? 'qty' THEN "vRec".qty ELSE t.qty END,
           amount = CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE t.amount END,
           "settledDate" = CASE WHEN "pData" ? 'settledDate' THEN "vRec"."settledDate" ELSE t."settledDate" END,
           "debitNoteId" = CASE WHEN "pData" ? 'debitNoteId' THEN "vRec"."debitNoteId" ELSE t."debitNoteId" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."PrincipalClaims" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PrincipalClaims %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PrincipalClaims % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."principalClaimAddUpdate"(jsonb) IS 'Save (insert or update) one PrincipalClaims record.';

-- PrincipalClaims: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Inventory"."getPrincipalClaimInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('claimTypeLabel', "Lookups"."getLookupLabel"('ClaimType', t."claimType") ->> 'label', 'claimTypeTone', "Lookups"."getLookupLabel"('ClaimType', t."claimType") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('PrincipalClaimStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('PrincipalClaimStatus', t.status) ->> 'tone')
    FROM "Inventory"."PrincipalClaims" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getPrincipalClaimInfo"(uuid) IS 'Read one PrincipalClaims record (getter for its screens).';

-- PrincipalClaims: Cancel (status -> CANCELLED); allowed from PENDING, SUBMITTED, SETTLED, REJECTED
CREATE OR REPLACE FUNCTION "Inventory"."principalClaimCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."PrincipalClaims";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."PrincipalClaims" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PrincipalClaims % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING', 'SUBMITTED', 'SETTLED', 'REJECTED') THEN
    RAISE EXCEPTION 'PrincipalClaims %: cannot cancel from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."principalClaimCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."principalClaimCancelEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."PrincipalClaims" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- PrincipalTargets: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Inventory"."principalTargetAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."PrincipalTargets";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."PrincipalTargets", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Inventory"."PrincipalTargets" ("tenantId", "manufacturerId", "periodType", "periodStart", "periodEnd", basis, "targetAmount", "achievedAmount", "achievedAt", notes)
    VALUES ("vTenant", CASE WHEN "pData" ? 'manufacturerId' THEN "vRec"."manufacturerId" ELSE NULL END, CASE WHEN "pData" ? 'periodType' THEN "vRec"."periodType" ELSE 'QUARTER' END, CASE WHEN "pData" ? 'periodStart' THEN "vRec"."periodStart" ELSE NULL END, CASE WHEN "pData" ? 'periodEnd' THEN "vRec"."periodEnd" ELSE NULL END, CASE WHEN "pData" ? 'basis' THEN "vRec".basis ELSE 'PURCHASE' END, CASE WHEN "pData" ? 'targetAmount' THEN "vRec"."targetAmount" ELSE NULL END, CASE WHEN "pData" ? 'achievedAmount' THEN "vRec"."achievedAmount" ELSE 0 END, CASE WHEN "pData" ? 'achievedAt' THEN "vRec"."achievedAt" ELSE NULL END, CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."PrincipalTargets" t
       SET "manufacturerId" = CASE WHEN "pData" ? 'manufacturerId' THEN "vRec"."manufacturerId" ELSE t."manufacturerId" END,
           "periodType" = CASE WHEN "pData" ? 'periodType' THEN "vRec"."periodType" ELSE t."periodType" END,
           "periodStart" = CASE WHEN "pData" ? 'periodStart' THEN "vRec"."periodStart" ELSE t."periodStart" END,
           "periodEnd" = CASE WHEN "pData" ? 'periodEnd' THEN "vRec"."periodEnd" ELSE t."periodEnd" END,
           basis = CASE WHEN "pData" ? 'basis' THEN "vRec".basis ELSE t.basis END,
           "targetAmount" = CASE WHEN "pData" ? 'targetAmount' THEN "vRec"."targetAmount" ELSE t."targetAmount" END,
           "achievedAmount" = CASE WHEN "pData" ? 'achievedAmount' THEN "vRec"."achievedAmount" ELSE t."achievedAmount" END,
           "achievedAt" = CASE WHEN "pData" ? 'achievedAt' THEN "vRec"."achievedAt" ELSE t."achievedAt" END,
           notes = CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE t.notes END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."PrincipalTargets" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PrincipalTargets %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PrincipalTargets % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."principalTargetAddUpdate"(jsonb) IS 'Save (insert or update) one PrincipalTargets record.';

-- PrincipalTargets: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Inventory"."getPrincipalTargetInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('periodTypeLabel', "Lookups"."getLookupLabel"('PrincipalTargetPeriodType', t."periodType") ->> 'label', 'periodTypeTone', "Lookups"."getLookupLabel"('PrincipalTargetPeriodType', t."periodType") ->> 'tone', 'basisLabel', "Lookups"."getLookupLabel"('PrincipalTargetBasis', t.basis) ->> 'label', 'basisTone', "Lookups"."getLookupLabel"('PrincipalTargetBasis', t.basis) ->> 'tone')
    FROM "Inventory"."PrincipalTargets" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getPrincipalTargetInfo"(uuid) IS 'Read one PrincipalTargets record (getter for its screens).';

-- BulkPriceUpdates: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Inventory"."bulkPriceUpdateAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."BulkPriceUpdates";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1BulkPriceUpdateLines" "Inventory"."BulkPriceUpdateLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."BulkPriceUpdates", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('PCB', current_date, NULL);
    END IF;
    INSERT INTO "Inventory"."BulkPriceUpdates" ("tenantId", "docNo", "applyTo", "manufacturerId", "productClassId", "priceField", "changePct", "roundTo", "itemCount", "appliedAt", "appliedByUserId", "undoneAt")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'applyTo' THEN "vRec"."applyTo" ELSE NULL END, CASE WHEN "pData" ? 'manufacturerId' THEN "vRec"."manufacturerId" ELSE NULL END, CASE WHEN "pData" ? 'productClassId' THEN "vRec"."productClassId" ELSE NULL END, CASE WHEN "pData" ? 'priceField' THEN "vRec"."priceField" ELSE NULL END, CASE WHEN "pData" ? 'changePct' THEN "vRec"."changePct" ELSE NULL END, CASE WHEN "pData" ? 'roundTo' THEN "vRec"."roundTo" ELSE 1 END, CASE WHEN "pData" ? 'itemCount' THEN "vRec"."itemCount" ELSE 0 END, CASE WHEN "pData" ? 'appliedAt' THEN "vRec"."appliedAt" ELSE NULL END, CASE WHEN "pData" ? 'appliedByUserId' THEN "vRec"."appliedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'undoneAt' THEN "vRec"."undoneAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Inventory"."BulkPriceUpdates" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'BulkPriceUpdates: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Inventory"."BulkPriceUpdates" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "applyTo" = CASE WHEN "pData" ? 'applyTo' THEN "vRec"."applyTo" ELSE t."applyTo" END,
           "manufacturerId" = CASE WHEN "pData" ? 'manufacturerId' THEN "vRec"."manufacturerId" ELSE t."manufacturerId" END,
           "productClassId" = CASE WHEN "pData" ? 'productClassId' THEN "vRec"."productClassId" ELSE t."productClassId" END,
           "priceField" = CASE WHEN "pData" ? 'priceField' THEN "vRec"."priceField" ELSE t."priceField" END,
           "changePct" = CASE WHEN "pData" ? 'changePct' THEN "vRec"."changePct" ELSE t."changePct" END,
           "roundTo" = CASE WHEN "pData" ? 'roundTo' THEN "vRec"."roundTo" ELSE t."roundTo" END,
           "itemCount" = CASE WHEN "pData" ? 'itemCount' THEN "vRec"."itemCount" ELSE t."itemCount" END,
           "appliedAt" = CASE WHEN "pData" ? 'appliedAt' THEN "vRec"."appliedAt" ELSE t."appliedAt" END,
           "appliedByUserId" = CASE WHEN "pData" ? 'appliedByUserId' THEN "vRec"."appliedByUserId" ELSE t."appliedByUserId" END,
           "undoneAt" = CASE WHEN "pData" ? 'undoneAt' THEN "vRec"."undoneAt" ELSE t."undoneAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."BulkPriceUpdates" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'BulkPriceUpdates %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'BulkPriceUpdates % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Inventory"."BulkPriceUpdateLines"
     WHERE "tenantId" = "vTenant" AND "batchId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1BulkPriceUpdateLines" := jsonb_populate_record(NULL::"Inventory"."BulkPriceUpdateLines", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Inventory"."BulkPriceUpdateLines" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1BulkPriceUpdateLines"."itemId" ELSE t."itemId" END,
               "priceField" = CASE WHEN "vE1" ? 'priceField' THEN "vC1BulkPriceUpdateLines"."priceField" ELSE t."priceField" END,
               "oldValue" = CASE WHEN "vE1" ? 'oldValue' THEN "vC1BulkPriceUpdateLines"."oldValue" ELSE t."oldValue" END,
               "newValue" = CASE WHEN "vE1" ? 'newValue' THEN "vC1BulkPriceUpdateLines"."newValue" ELSE t."newValue" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."batchId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'BulkPriceUpdateLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Inventory"."BulkPriceUpdateLines" ("batchId", "tenantId", "itemId", "priceField", "oldValue", "newValue")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'itemId' THEN "vC1BulkPriceUpdateLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'priceField' THEN "vC1BulkPriceUpdateLines"."priceField" ELSE NULL END, CASE WHEN "vE1" ? 'oldValue' THEN "vC1BulkPriceUpdateLines"."oldValue" ELSE NULL END, CASE WHEN "vE1" ? 'newValue' THEN "vC1BulkPriceUpdateLines"."newValue" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."bulkPriceUpdateAddUpdate"(jsonb) IS 'Save (insert or update) one BulkPriceUpdates record with its lines.';

-- BulkPriceUpdates: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Inventory"."getBulkPriceUpdateInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('applyToLabel', "Lookups"."getLookupLabel"('ApplyTo', t."applyTo") ->> 'label', 'applyToTone', "Lookups"."getLookupLabel"('ApplyTo', t."applyTo") ->> 'tone', 'priceFieldLabel', "Lookups"."getLookupLabel"('BulkPriceUpdatePriceField', t."priceField") ->> 'label', 'priceFieldTone', "Lookups"."getLookupLabel"('BulkPriceUpdatePriceField', t."priceField") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('BulkPriceUpdateStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('BulkPriceUpdateStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Inventory"."BulkPriceUpdateLines" c1 WHERE c1."batchId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Inventory"."BulkPriceUpdates" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getBulkPriceUpdateInfo"(uuid) IS 'Read one BulkPriceUpdates record (getter for its screens).';

-- KitsAndBundles: insert (no "id") or update (with "id"); child arrays: components
CREATE OR REPLACE FUNCTION "Inventory"."kitAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."KitsAndBundles";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1KitComponents" "Inventory"."KitComponents";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."KitsAndBundles", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'code') OR "vRec".code IS NULL THEN
      "vRec".code := "Company"."getNextDocNo"('KIT', current_date, NULL);
    END IF;
    INSERT INTO "Inventory"."KitsAndBundles" ("tenantId", code, name, icon, tone, "kitItemId", "sellingPrice", "targetMarginPct", status)
    VALUES ("vTenant", "vRec".code, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE 'package-plus' END, CASE WHEN "pData" ? 'tone' THEN "vRec".tone ELSE 'green' END, CASE WHEN "pData" ? 'kitItemId' THEN "vRec"."kitItemId" ELSE NULL END, CASE WHEN "pData" ? 'sellingPrice' THEN "vRec"."sellingPrice" ELSE 0 END, CASE WHEN "pData" ? 'targetMarginPct' THEN "vRec"."targetMarginPct" ELSE 25 END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."KitsAndBundles" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END,
           tone = CASE WHEN "pData" ? 'tone' THEN "vRec".tone ELSE t.tone END,
           "kitItemId" = CASE WHEN "pData" ? 'kitItemId' THEN "vRec"."kitItemId" ELSE t."kitItemId" END,
           "sellingPrice" = CASE WHEN "pData" ? 'sellingPrice' THEN "vRec"."sellingPrice" ELSE t."sellingPrice" END,
           "targetMarginPct" = CASE WHEN "pData" ? 'targetMarginPct' THEN "vRec"."targetMarginPct" ELSE t."targetMarginPct" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."KitsAndBundles" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'KitsAndBundles %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'KitsAndBundles % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'components' THEN
    -- components: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Inventory"."KitComponents"
     WHERE "tenantId" = "vTenant" AND "kitId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'components') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'components') WITH ORDINALITY t(x, n) LOOP
      "vC1KitComponents" := jsonb_populate_record(NULL::"Inventory"."KitComponents", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Inventory"."KitComponents" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1KitComponents"."itemId" ELSE t."itemId" END,
               "qtyPerKit" = CASE WHEN "vE1" ? 'qtyPerKit' THEN "vC1KitComponents"."qtyPerKit" ELSE t."qtyPerKit" END,
               "sortOrder" = CASE WHEN "vE1" ? 'sortOrder' THEN "vC1KitComponents"."sortOrder" ELSE t."sortOrder" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."kitId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'KitComponents: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Inventory"."KitComponents" ("kitId", "tenantId", "itemId", "qtyPerKit", "sortOrder")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'itemId' THEN "vC1KitComponents"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'qtyPerKit' THEN "vC1KitComponents"."qtyPerKit" ELSE NULL END, CASE WHEN "vE1" ? 'sortOrder' THEN "vC1KitComponents"."sortOrder" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."kitAddUpdate"(jsonb) IS 'Save (insert or update) one KitsAndBundles record with its components.';

-- KitsAndBundles: one record as JSON (camelCase keys), with lookup labels and components
CREATE OR REPLACE FUNCTION "Inventory"."getKitInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('toneLabel', "Lookups"."getLookupLabel"('KitTone', t.tone) ->> 'label', 'toneTone', "Lookups"."getLookupLabel"('KitTone', t.tone) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone') ||
         jsonb_build_object('components', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."sortOrder") FROM "Inventory"."KitComponents" c1 WHERE c1."kitId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Inventory"."KitsAndBundles" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getKitInfo"(uuid) IS 'Read one KitsAndBundles record (getter for its screens).';

-- AssemblyVouchers: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Inventory"."assemblyVoucherAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."AssemblyVouchers";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1AssemblyVoucherLines" "Inventory"."AssemblyVoucherLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."AssemblyVouchers", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('ASM', "vRec"."docDate", NULL);
    END IF;
    INSERT INTO "Inventory"."AssemblyVouchers" ("tenantId", "docNo", "docDate", "kitId", direction, "kitQty", "warehouseId", "kitUnitCost", "totalCost", remarks)
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'kitId' THEN "vRec"."kitId" ELSE NULL END, CASE WHEN "pData" ? 'direction' THEN "vRec".direction ELSE NULL END, CASE WHEN "pData" ? 'kitQty' THEN "vRec"."kitQty" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'kitUnitCost' THEN "vRec"."kitUnitCost" ELSE 0 END, CASE WHEN "pData" ? 'totalCost' THEN "vRec"."totalCost" ELSE 0 END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Inventory"."AssemblyVouchers" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'AssemblyVouchers: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Inventory"."AssemblyVouchers" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "kitId" = CASE WHEN "pData" ? 'kitId' THEN "vRec"."kitId" ELSE t."kitId" END,
           direction = CASE WHEN "pData" ? 'direction' THEN "vRec".direction ELSE t.direction END,
           "kitQty" = CASE WHEN "pData" ? 'kitQty' THEN "vRec"."kitQty" ELSE t."kitQty" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "kitUnitCost" = CASE WHEN "pData" ? 'kitUnitCost' THEN "vRec"."kitUnitCost" ELSE t."kitUnitCost" END,
           "totalCost" = CASE WHEN "pData" ? 'totalCost' THEN "vRec"."totalCost" ELSE t."totalCost" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."AssemblyVouchers" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'AssemblyVouchers %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'AssemblyVouchers % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Inventory"."AssemblyVoucherLines"
     WHERE "tenantId" = "vTenant" AND "voucherId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1AssemblyVoucherLines" := jsonb_populate_record(NULL::"Inventory"."AssemblyVoucherLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1AssemblyVoucherLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Inventory"."AssemblyVoucherLines" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1AssemblyVoucherLines"."itemId" ELSE t."itemId" END,
               "batchId" = CASE WHEN "vE1" ? 'batchId' THEN "vC1AssemblyVoucherLines"."batchId" ELSE t."batchId" END,
               "qtyPerKit" = CASE WHEN "vE1" ? 'qtyPerKit' THEN "vC1AssemblyVoucherLines"."qtyPerKit" ELSE t."qtyPerKit" END,
               qty = CASE WHEN "vE1" ? 'qty' THEN "vC1AssemblyVoucherLines".qty ELSE t.qty END,
               "unitCost" = CASE WHEN "vE1" ? 'unitCost' THEN "vC1AssemblyVoucherLines"."unitCost" ELSE t."unitCost" END,
               "lineNo" = "vC1AssemblyVoucherLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."voucherId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'AssemblyVoucherLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Inventory"."AssemblyVoucherLines" ("voucherId", "tenantId", "lineNo", "itemId", "batchId", "qtyPerKit", qty, "unitCost")
        VALUES ("vRet", "vTenant", "vC1AssemblyVoucherLines"."lineNo", CASE WHEN "vE1" ? 'itemId' THEN "vC1AssemblyVoucherLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'batchId' THEN "vC1AssemblyVoucherLines"."batchId" ELSE NULL END, CASE WHEN "vE1" ? 'qtyPerKit' THEN "vC1AssemblyVoucherLines"."qtyPerKit" ELSE NULL END, CASE WHEN "vE1" ? 'qty' THEN "vC1AssemblyVoucherLines".qty ELSE NULL END, CASE WHEN "vE1" ? 'unitCost' THEN "vC1AssemblyVoucherLines"."unitCost" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."assemblyVoucherAddUpdate"(jsonb) IS 'Save (insert or update) one AssemblyVouchers record with its lines.';

-- AssemblyVouchers: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Inventory"."getAssemblyVoucherInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('directionLabel', "Lookups"."getLookupLabel"('AssemblyVoucherDirection', t.direction) ->> 'label', 'directionTone', "Lookups"."getLookupLabel"('AssemblyVoucherDirection', t.direction) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('DraftPostedCancelledStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('DraftPostedCancelledStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Inventory"."AssemblyVoucherLines" c1 WHERE c1."voucherId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Inventory"."AssemblyVouchers" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getAssemblyVoucherInfo"(uuid) IS 'Read one AssemblyVouchers record (getter for its screens).';

-- AssemblyVouchers: Post (status -> POSTED); allowed from DRAFT
CREATE OR REPLACE FUNCTION "Inventory"."assemblyVoucherPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."AssemblyVouchers";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."AssemblyVouchers" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AssemblyVouchers % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'AssemblyVouchers %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."assemblyVoucherPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."assemblyVoucherPostEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."AssemblyVouchers" t SET status = 'POSTED', "postedAt" = now(), "postedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- AssemblyVouchers: Cancel (status -> CANCELLED); allowed from DRAFT, POSTED
CREATE OR REPLACE FUNCTION "Inventory"."assemblyVoucherCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."AssemblyVouchers";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."AssemblyVouchers" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AssemblyVouchers % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'POSTED') THEN
    RAISE EXCEPTION 'AssemblyVouchers %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."assemblyVoucherCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."assemblyVoucherCancelEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."AssemblyVouchers" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- BarcodeLabelTemplates: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Inventory"."barcodeLabelTemplateAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."BarcodeLabelTemplates";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."BarcodeLabelTemplates", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Inventory"."BarcodeLabelTemplates" ("tenantId", code, name, media, "widthMm", "heightMm", "labelsPerSheet", "sheetColumns", "sheetRows", "isSystem", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'media' THEN "vRec".media ELSE NULL END, CASE WHEN "pData" ? 'widthMm' THEN "vRec"."widthMm" ELSE NULL END, CASE WHEN "pData" ? 'heightMm' THEN "vRec"."heightMm" ELSE NULL END, CASE WHEN "pData" ? 'labelsPerSheet' THEN "vRec"."labelsPerSheet" ELSE NULL END, CASE WHEN "pData" ? 'sheetColumns' THEN "vRec"."sheetColumns" ELSE NULL END, CASE WHEN "pData" ? 'sheetRows' THEN "vRec"."sheetRows" ELSE NULL END, CASE WHEN "pData" ? 'isSystem' THEN "vRec"."isSystem" ELSE FALSE END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."BarcodeLabelTemplates" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           media = CASE WHEN "pData" ? 'media' THEN "vRec".media ELSE t.media END,
           "widthMm" = CASE WHEN "pData" ? 'widthMm' THEN "vRec"."widthMm" ELSE t."widthMm" END,
           "heightMm" = CASE WHEN "pData" ? 'heightMm' THEN "vRec"."heightMm" ELSE t."heightMm" END,
           "labelsPerSheet" = CASE WHEN "pData" ? 'labelsPerSheet' THEN "vRec"."labelsPerSheet" ELSE t."labelsPerSheet" END,
           "sheetColumns" = CASE WHEN "pData" ? 'sheetColumns' THEN "vRec"."sheetColumns" ELSE t."sheetColumns" END,
           "sheetRows" = CASE WHEN "pData" ? 'sheetRows' THEN "vRec"."sheetRows" ELSE t."sheetRows" END,
           "isSystem" = CASE WHEN "pData" ? 'isSystem' THEN "vRec"."isSystem" ELSE t."isSystem" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."BarcodeLabelTemplates" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'BarcodeLabelTemplates %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'BarcodeLabelTemplates % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."barcodeLabelTemplateAddUpdate"(jsonb) IS 'Save (insert or update) one BarcodeLabelTemplates record.';

-- BarcodeLabelTemplates: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Inventory"."getBarcodeLabelTemplateInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('mediaLabel', "Lookups"."getLookupLabel"('Media', t.media) ->> 'label', 'mediaTone', "Lookups"."getLookupLabel"('Media', t.media) ->> 'tone')
    FROM "Inventory"."BarcodeLabelTemplates" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getBarcodeLabelTemplateInfo"(uuid) IS 'Read one BarcodeLabelTemplates record (getter for its screens).';

-- StockCounts: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Inventory"."stockCountAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."StockCounts";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1StockCountLines" "Inventory"."StockCountLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."StockCounts", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('SC', "vRec"."docDate", NULL);
    END IF;
    INSERT INTO "Inventory"."StockCounts" ("tenantId", "docNo", name, "docDate", "warehouseId", "scopeClassIds", "scopeLabel", "abcAOnly", "isBlind", "frozenAt", "ownerUserId", "lineCount", "countedCount", "shortageValue", "excessValue", "approverUserId", "approvalComment")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'scopeClassIds' THEN "vRec"."scopeClassIds" ELSE '{}' END, CASE WHEN "pData" ? 'scopeLabel' THEN "vRec"."scopeLabel" ELSE NULL END, CASE WHEN "pData" ? 'abcAOnly' THEN "vRec"."abcAOnly" ELSE FALSE END, CASE WHEN "pData" ? 'isBlind' THEN "vRec"."isBlind" ELSE FALSE END, CASE WHEN "pData" ? 'frozenAt' THEN "vRec"."frozenAt" ELSE NULL END, CASE WHEN "pData" ? 'ownerUserId' THEN "vRec"."ownerUserId" ELSE NULL END, CASE WHEN "pData" ? 'lineCount' THEN "vRec"."lineCount" ELSE 0 END, CASE WHEN "pData" ? 'countedCount' THEN "vRec"."countedCount" ELSE 0 END, CASE WHEN "pData" ? 'shortageValue' THEN "vRec"."shortageValue" ELSE 0 END, CASE WHEN "pData" ? 'excessValue' THEN "vRec"."excessValue" ELSE 0 END, CASE WHEN "pData" ? 'approverUserId' THEN "vRec"."approverUserId" ELSE NULL END, CASE WHEN "pData" ? 'approvalComment' THEN "vRec"."approvalComment" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Inventory"."StockCounts" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'StockCounts: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Inventory"."StockCounts" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "scopeClassIds" = CASE WHEN "pData" ? 'scopeClassIds' THEN "vRec"."scopeClassIds" ELSE t."scopeClassIds" END,
           "scopeLabel" = CASE WHEN "pData" ? 'scopeLabel' THEN "vRec"."scopeLabel" ELSE t."scopeLabel" END,
           "abcAOnly" = CASE WHEN "pData" ? 'abcAOnly' THEN "vRec"."abcAOnly" ELSE t."abcAOnly" END,
           "isBlind" = CASE WHEN "pData" ? 'isBlind' THEN "vRec"."isBlind" ELSE t."isBlind" END,
           "frozenAt" = CASE WHEN "pData" ? 'frozenAt' THEN "vRec"."frozenAt" ELSE t."frozenAt" END,
           "ownerUserId" = CASE WHEN "pData" ? 'ownerUserId' THEN "vRec"."ownerUserId" ELSE t."ownerUserId" END,
           "lineCount" = CASE WHEN "pData" ? 'lineCount' THEN "vRec"."lineCount" ELSE t."lineCount" END,
           "countedCount" = CASE WHEN "pData" ? 'countedCount' THEN "vRec"."countedCount" ELSE t."countedCount" END,
           "shortageValue" = CASE WHEN "pData" ? 'shortageValue' THEN "vRec"."shortageValue" ELSE t."shortageValue" END,
           "excessValue" = CASE WHEN "pData" ? 'excessValue' THEN "vRec"."excessValue" ELSE t."excessValue" END,
           "approverUserId" = CASE WHEN "pData" ? 'approverUserId' THEN "vRec"."approverUserId" ELSE t."approverUserId" END,
           "approvalComment" = CASE WHEN "pData" ? 'approvalComment' THEN "vRec"."approvalComment" ELSE t."approvalComment" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."StockCounts" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'StockCounts %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'StockCounts % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Inventory"."StockCountLines"
     WHERE "tenantId" = "vTenant" AND "countId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1StockCountLines" := jsonb_populate_record(NULL::"Inventory"."StockCountLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1StockCountLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Inventory"."StockCountLines" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1StockCountLines"."itemId" ELSE t."itemId" END,
               "batchId" = CASE WHEN "vE1" ? 'batchId' THEN "vC1StockCountLines"."batchId" ELSE t."batchId" END,
               "expectedQty" = CASE WHEN "vE1" ? 'expectedQty' THEN "vC1StockCountLines"."expectedQty" ELSE t."expectedQty" END,
               "countedQty" = CASE WHEN "vE1" ? 'countedQty' THEN "vC1StockCountLines"."countedQty" ELSE t."countedQty" END,
               "unitCost" = CASE WHEN "vE1" ? 'unitCost' THEN "vC1StockCountLines"."unitCost" ELSE t."unitCost" END,
               reason = CASE WHEN "vE1" ? 'reason' THEN "vC1StockCountLines".reason ELSE t.reason END,
               "wasUncounted" = CASE WHEN "vE1" ? 'wasUncounted' THEN "vC1StockCountLines"."wasUncounted" ELSE t."wasUncounted" END,
               "countedAt" = CASE WHEN "vE1" ? 'countedAt' THEN "vC1StockCountLines"."countedAt" ELSE t."countedAt" END,
               "countedByUserId" = CASE WHEN "vE1" ? 'countedByUserId' THEN "vC1StockCountLines"."countedByUserId" ELSE t."countedByUserId" END,
               "lineNo" = "vC1StockCountLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."countId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'StockCountLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Inventory"."StockCountLines" ("countId", "tenantId", "lineNo", "itemId", "batchId", "expectedQty", "countedQty", "unitCost", reason, "wasUncounted", "countedAt", "countedByUserId")
        VALUES ("vRet", "vTenant", "vC1StockCountLines"."lineNo", CASE WHEN "vE1" ? 'itemId' THEN "vC1StockCountLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'batchId' THEN "vC1StockCountLines"."batchId" ELSE NULL END, CASE WHEN "vE1" ? 'expectedQty' THEN "vC1StockCountLines"."expectedQty" ELSE NULL END, CASE WHEN "vE1" ? 'countedQty' THEN "vC1StockCountLines"."countedQty" ELSE NULL END, CASE WHEN "vE1" ? 'unitCost' THEN "vC1StockCountLines"."unitCost" ELSE NULL END, CASE WHEN "vE1" ? 'reason' THEN "vC1StockCountLines".reason ELSE NULL END, CASE WHEN "vE1" ? 'wasUncounted' THEN "vC1StockCountLines"."wasUncounted" ELSE FALSE END, CASE WHEN "vE1" ? 'countedAt' THEN "vC1StockCountLines"."countedAt" ELSE NULL END, CASE WHEN "vE1" ? 'countedByUserId' THEN "vC1StockCountLines"."countedByUserId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."stockCountAddUpdate"(jsonb) IS 'Save (insert or update) one StockCounts record with its lines.';

-- StockCounts: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Inventory"."getStockCountInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('StockCountStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('StockCountStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Inventory"."StockCountLines" c1 WHERE c1."countId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Inventory"."StockCounts" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getStockCountInfo"(uuid) IS 'Read one StockCounts record (getter for its screens).';

-- StockCounts: Approve (status -> APPROVED); allowed from DRAFT
CREATE OR REPLACE FUNCTION "Inventory"."stockCountApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."StockCounts";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."StockCounts" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'StockCounts % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'StockCounts %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'StockCounts: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."stockCountApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."stockCountApproveEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."StockCounts" t SET status = 'APPROVED', "approvedAt" = now(), "approvalComment" = "pComment" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- StockCounts: Cancel (status -> CANCELLED); allowed from DRAFT, COUNTING, VARIANCE_REVIEW, APPROVED
CREATE OR REPLACE FUNCTION "Inventory"."stockCountCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."StockCounts";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."StockCounts" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'StockCounts % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'COUNTING', 'VARIANCE_REVIEW', 'APPROVED') THEN
    RAISE EXCEPTION 'StockCounts %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."stockCountCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."stockCountCancelEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."StockCounts" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- StockVouchers: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Inventory"."stockVoucherAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."StockVouchers";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1StockVoucherLines" "Inventory"."StockVoucherLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."StockVouchers", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"("vRec"."voucherType", "vRec"."docDate", NULL);
    END IF;
    INSERT INTO "Inventory"."StockVouchers" ("tenantId", "voucherType", "docNo", "docDate", "warehouseId", "referenceNo", "breakageReason", "employeeId", "recipientName", occasion, "customerId", "salesmanEmployeeId", "isReturnable", "returnDueDate", "departmentId", "costCentreId", "requestedByEmployeeId", "expenseAccountId", remarks, "totalItems", "totalQty", "totalAmount")
    VALUES ("vTenant", CASE WHEN "pData" ? 'voucherType' THEN "vRec"."voucherType" ELSE NULL END, "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'referenceNo' THEN "vRec"."referenceNo" ELSE NULL END, CASE WHEN "pData" ? 'breakageReason' THEN "vRec"."breakageReason" ELSE NULL END, CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'recipientName' THEN "vRec"."recipientName" ELSE NULL END, CASE WHEN "pData" ? 'occasion' THEN "vRec".occasion ELSE NULL END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'salesmanEmployeeId' THEN "vRec"."salesmanEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'isReturnable' THEN "vRec"."isReturnable" ELSE FALSE END, CASE WHEN "pData" ? 'returnDueDate' THEN "vRec"."returnDueDate" ELSE NULL END, CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE NULL END, CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE NULL END, CASE WHEN "pData" ? 'requestedByEmployeeId' THEN "vRec"."requestedByEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'expenseAccountId' THEN "vRec"."expenseAccountId" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'totalItems' THEN "vRec"."totalItems" ELSE 0 END, CASE WHEN "pData" ? 'totalQty' THEN "vRec"."totalQty" ELSE 0 END, CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE 0 END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Inventory"."StockVouchers" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'StockVouchers: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Inventory"."StockVouchers" t
       SET "voucherType" = CASE WHEN "pData" ? 'voucherType' THEN "vRec"."voucherType" ELSE t."voucherType" END,
           "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "referenceNo" = CASE WHEN "pData" ? 'referenceNo' THEN "vRec"."referenceNo" ELSE t."referenceNo" END,
           "breakageReason" = CASE WHEN "pData" ? 'breakageReason' THEN "vRec"."breakageReason" ELSE t."breakageReason" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "recipientName" = CASE WHEN "pData" ? 'recipientName' THEN "vRec"."recipientName" ELSE t."recipientName" END,
           occasion = CASE WHEN "pData" ? 'occasion' THEN "vRec".occasion ELSE t.occasion END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           "salesmanEmployeeId" = CASE WHEN "pData" ? 'salesmanEmployeeId' THEN "vRec"."salesmanEmployeeId" ELSE t."salesmanEmployeeId" END,
           "isReturnable" = CASE WHEN "pData" ? 'isReturnable' THEN "vRec"."isReturnable" ELSE t."isReturnable" END,
           "returnDueDate" = CASE WHEN "pData" ? 'returnDueDate' THEN "vRec"."returnDueDate" ELSE t."returnDueDate" END,
           "departmentId" = CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE t."departmentId" END,
           "costCentreId" = CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE t."costCentreId" END,
           "requestedByEmployeeId" = CASE WHEN "pData" ? 'requestedByEmployeeId' THEN "vRec"."requestedByEmployeeId" ELSE t."requestedByEmployeeId" END,
           "expenseAccountId" = CASE WHEN "pData" ? 'expenseAccountId' THEN "vRec"."expenseAccountId" ELSE t."expenseAccountId" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END,
           "totalItems" = CASE WHEN "pData" ? 'totalItems' THEN "vRec"."totalItems" ELSE t."totalItems" END,
           "totalQty" = CASE WHEN "pData" ? 'totalQty' THEN "vRec"."totalQty" ELSE t."totalQty" END,
           "totalAmount" = CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE t."totalAmount" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."StockVouchers" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'StockVouchers %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'StockVouchers % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Inventory"."StockVoucherLines"
     WHERE "tenantId" = "vTenant" AND "voucherId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1StockVoucherLines" := jsonb_populate_record(NULL::"Inventory"."StockVoucherLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1StockVoucherLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Inventory"."StockVoucherLines" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1StockVoucherLines"."itemId" ELSE t."itemId" END,
               "batchId" = CASE WHEN "vE1" ? 'batchId' THEN "vC1StockVoucherLines"."batchId" ELSE t."batchId" END,
               "lotNo" = CASE WHEN "vE1" ? 'lotNo' THEN "vC1StockVoucherLines"."lotNo" ELSE t."lotNo" END,
               "expiryMonth" = CASE WHEN "vE1" ? 'expiryMonth' THEN "vC1StockVoucherLines"."expiryMonth" ELSE t."expiryMonth" END,
               "uomId" = CASE WHEN "vE1" ? 'uomId' THEN "vC1StockVoucherLines"."uomId" ELSE t."uomId" END,
               "uomFactor" = CASE WHEN "vE1" ? 'uomFactor' THEN "vC1StockVoucherLines"."uomFactor" ELSE t."uomFactor" END,
               qty = CASE WHEN "vE1" ? 'qty' THEN "vC1StockVoucherLines".qty ELSE t.qty END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1StockVoucherLines".rate ELSE t.rate END,
               remark = CASE WHEN "vE1" ? 'remark' THEN "vC1StockVoucherLines".remark ELSE t.remark END,
               "lineNo" = "vC1StockVoucherLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."voucherId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'StockVoucherLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Inventory"."StockVoucherLines" ("voucherId", "tenantId", "lineNo", "itemId", "batchId", "lotNo", "expiryMonth", "uomId", "uomFactor", qty, rate, remark)
        VALUES ("vRet", "vTenant", "vC1StockVoucherLines"."lineNo", CASE WHEN "vE1" ? 'itemId' THEN "vC1StockVoucherLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'batchId' THEN "vC1StockVoucherLines"."batchId" ELSE NULL END, CASE WHEN "vE1" ? 'lotNo' THEN "vC1StockVoucherLines"."lotNo" ELSE NULL END, CASE WHEN "vE1" ? 'expiryMonth' THEN "vC1StockVoucherLines"."expiryMonth" ELSE NULL END, CASE WHEN "vE1" ? 'uomId' THEN "vC1StockVoucherLines"."uomId" ELSE NULL END, CASE WHEN "vE1" ? 'uomFactor' THEN "vC1StockVoucherLines"."uomFactor" ELSE 1 END, CASE WHEN "vE1" ? 'qty' THEN "vC1StockVoucherLines".qty ELSE NULL END, CASE WHEN "vE1" ? 'rate' THEN "vC1StockVoucherLines".rate ELSE NULL END, CASE WHEN "vE1" ? 'remark' THEN "vC1StockVoucherLines".remark ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."stockVoucherAddUpdate"(jsonb) IS 'Save (insert or update) one StockVouchers record with its lines.';

-- StockVouchers: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Inventory"."getStockVoucherInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('voucherTypeLabel', "Lookups"."getLookupLabel"('StockVoucherType', t."voucherType") ->> 'label', 'voucherTypeTone', "Lookups"."getLookupLabel"('StockVoucherType', t."voucherType") ->> 'tone', 'breakageReasonLabel', "Lookups"."getLookupLabel"('BreakageReason', t."breakageReason") ->> 'label', 'breakageReasonTone', "Lookups"."getLookupLabel"('BreakageReason', t."breakageReason") ->> 'tone', 'occasionLabel', "Lookups"."getLookupLabel"('Occasion', t.occasion) ->> 'label', 'occasionTone', "Lookups"."getLookupLabel"('Occasion', t.occasion) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('DraftPostedCancelledStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('DraftPostedCancelledStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Inventory"."StockVoucherLines" c1 WHERE c1."voucherId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Inventory"."StockVouchers" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getStockVoucherInfo"(uuid) IS 'Read one StockVouchers record (getter for its screens).';

-- StockVouchers: Post (status -> POSTED); allowed from DRAFT
CREATE OR REPLACE FUNCTION "Inventory"."stockVoucherPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."StockVouchers";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."StockVouchers" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'StockVouchers % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'StockVouchers %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."stockVoucherPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."stockVoucherPostEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."StockVouchers" t SET status = 'POSTED', "postedAt" = now(), "postedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- StockVouchers: Cancel (status -> CANCELLED); allowed from DRAFT, POSTED
CREATE OR REPLACE FUNCTION "Inventory"."stockVoucherCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."StockVouchers";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."StockVouchers" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'StockVouchers % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'POSTED') THEN
    RAISE EXCEPTION 'StockVouchers %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."stockVoucherCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."stockVoucherCancelEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."StockVouchers" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- ReorderRules: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Inventory"."reorderRuleAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."ReorderRules";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."ReorderRules", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Inventory"."ReorderRules" ("tenantId", "itemId", "warehouseId", "lowLevel", "highLevel", "leadDays", "safetyDays", "coverAlertDays", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'itemId' THEN "vRec"."itemId" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'lowLevel' THEN "vRec"."lowLevel" ELSE NULL END, CASE WHEN "pData" ? 'highLevel' THEN "vRec"."highLevel" ELSE NULL END, CASE WHEN "pData" ? 'leadDays' THEN "vRec"."leadDays" ELSE 14 END, CASE WHEN "pData" ? 'safetyDays' THEN "vRec"."safetyDays" ELSE 14 END, CASE WHEN "pData" ? 'coverAlertDays' THEN "vRec"."coverAlertDays" ELSE 21 END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."ReorderRules" t
       SET "itemId" = CASE WHEN "pData" ? 'itemId' THEN "vRec"."itemId" ELSE t."itemId" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "lowLevel" = CASE WHEN "pData" ? 'lowLevel' THEN "vRec"."lowLevel" ELSE t."lowLevel" END,
           "highLevel" = CASE WHEN "pData" ? 'highLevel' THEN "vRec"."highLevel" ELSE t."highLevel" END,
           "leadDays" = CASE WHEN "pData" ? 'leadDays' THEN "vRec"."leadDays" ELSE t."leadDays" END,
           "safetyDays" = CASE WHEN "pData" ? 'safetyDays' THEN "vRec"."safetyDays" ELSE t."safetyDays" END,
           "coverAlertDays" = CASE WHEN "pData" ? 'coverAlertDays' THEN "vRec"."coverAlertDays" ELSE t."coverAlertDays" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."ReorderRules" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ReorderRules %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ReorderRules % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."reorderRuleAddUpdate"(jsonb) IS 'Save (insert or update) one ReorderRules record.';

-- ReorderRules: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Inventory"."getReorderRuleInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "Inventory"."ReorderRules" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getReorderRuleInfo"(uuid) IS 'Read one ReorderRules record (getter for its screens).';

-- GoodsDemands: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Inventory"."goodsDemandAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."GoodsDemands";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1GoodsDemandLines" "Inventory"."GoodsDemandLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."GoodsDemands", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('DMD', "vRec"."docDate", NULL);
    END IF;
    INSERT INTO "Inventory"."GoodsDemands" ("tenantId", "docNo", "docDate", "manufacturerId", "vendorId", "preparedByUserId", source, notes, "totalItems", "totalQty", "totalBonus", "grossAmount", "discountAmount", "netAmount", "purchaseOrderId", "orderedAt")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'manufacturerId' THEN "vRec"."manufacturerId" ELSE NULL END, CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE NULL END, CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE 'MANUAL' END, CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE NULL END, CASE WHEN "pData" ? 'totalItems' THEN "vRec"."totalItems" ELSE 0 END, CASE WHEN "pData" ? 'totalQty' THEN "vRec"."totalQty" ELSE 0 END, CASE WHEN "pData" ? 'totalBonus' THEN "vRec"."totalBonus" ELSE 0 END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE 0 END, CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE 0 END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE 0 END, CASE WHEN "pData" ? 'purchaseOrderId' THEN "vRec"."purchaseOrderId" ELSE NULL END, CASE WHEN "pData" ? 'orderedAt' THEN "vRec"."orderedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Inventory"."GoodsDemands" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'GoodsDemands: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Inventory"."GoodsDemands" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "manufacturerId" = CASE WHEN "pData" ? 'manufacturerId' THEN "vRec"."manufacturerId" ELSE t."manufacturerId" END,
           "vendorId" = CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE t."vendorId" END,
           "preparedByUserId" = CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE t."preparedByUserId" END,
           source = CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE t.source END,
           notes = CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE t.notes END,
           "totalItems" = CASE WHEN "pData" ? 'totalItems' THEN "vRec"."totalItems" ELSE t."totalItems" END,
           "totalQty" = CASE WHEN "pData" ? 'totalQty' THEN "vRec"."totalQty" ELSE t."totalQty" END,
           "totalBonus" = CASE WHEN "pData" ? 'totalBonus' THEN "vRec"."totalBonus" ELSE t."totalBonus" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "discountAmount" = CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE t."discountAmount" END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "purchaseOrderId" = CASE WHEN "pData" ? 'purchaseOrderId' THEN "vRec"."purchaseOrderId" ELSE t."purchaseOrderId" END,
           "orderedAt" = CASE WHEN "pData" ? 'orderedAt' THEN "vRec"."orderedAt" ELSE t."orderedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."GoodsDemands" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'GoodsDemands %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'GoodsDemands % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Inventory"."GoodsDemandLines"
     WHERE "tenantId" = "vTenant" AND "demandId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1GoodsDemandLines" := jsonb_populate_record(NULL::"Inventory"."GoodsDemandLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1GoodsDemandLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Inventory"."GoodsDemandLines" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1GoodsDemandLines"."itemId" ELSE t."itemId" END,
               "manufacturerId" = CASE WHEN "vE1" ? 'manufacturerId' THEN "vC1GoodsDemandLines"."manufacturerId" ELSE t."manufacturerId" END,
               "ctnSize" = CASE WHEN "vE1" ? 'ctnSize' THEN "vC1GoodsDemandLines"."ctnSize" ELSE t."ctnSize" END,
               "qtyCtn" = CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1GoodsDemandLines"."qtyCtn" ELSE t."qtyCtn" END,
               "baseQty" = CASE WHEN "vE1" ? 'baseQty' THEN "vC1GoodsDemandLines"."baseQty" ELSE t."baseQty" END,
               "bonusQty" = CASE WHEN "vE1" ? 'bonusQty' THEN "vC1GoodsDemandLines"."bonusQty" ELSE t."bonusQty" END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1GoodsDemandLines".rate ELSE t.rate END,
               "discountPct" = CASE WHEN "vE1" ? 'discountPct' THEN "vC1GoodsDemandLines"."discountPct" ELSE t."discountPct" END,
               "lineNo" = "vC1GoodsDemandLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."demandId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'GoodsDemandLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Inventory"."GoodsDemandLines" ("demandId", "tenantId", "lineNo", "itemId", "manufacturerId", "ctnSize", "qtyCtn", "baseQty", "bonusQty", rate, "discountPct")
        VALUES ("vRet", "vTenant", "vC1GoodsDemandLines"."lineNo", CASE WHEN "vE1" ? 'itemId' THEN "vC1GoodsDemandLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'manufacturerId' THEN "vC1GoodsDemandLines"."manufacturerId" ELSE NULL END, CASE WHEN "vE1" ? 'ctnSize' THEN "vC1GoodsDemandLines"."ctnSize" ELSE NULL END, CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1GoodsDemandLines"."qtyCtn" ELSE 0 END, CASE WHEN "vE1" ? 'baseQty' THEN "vC1GoodsDemandLines"."baseQty" ELSE NULL END, CASE WHEN "vE1" ? 'bonusQty' THEN "vC1GoodsDemandLines"."bonusQty" ELSE 0 END, CASE WHEN "vE1" ? 'rate' THEN "vC1GoodsDemandLines".rate ELSE 0 END, CASE WHEN "vE1" ? 'discountPct' THEN "vC1GoodsDemandLines"."discountPct" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."goodsDemandAddUpdate"(jsonb) IS 'Save (insert or update) one GoodsDemands record with its lines.';

-- GoodsDemands: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Inventory"."getGoodsDemandInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('sourceLabel', "Lookups"."getLookupLabel"('GoodsDemandSource', t.source) ->> 'label', 'sourceTone', "Lookups"."getLookupLabel"('GoodsDemandSource', t.source) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('GoodsDemandStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('GoodsDemandStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Inventory"."GoodsDemandLines" c1 WHERE c1."demandId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Inventory"."GoodsDemands" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Inventory"."getGoodsDemandInfo"(uuid) IS 'Read one GoodsDemands record (getter for its screens).';

-- GoodsDemands: Cancel (status -> CANCELLED); allowed from DRAFT, SAVED, ORDERED
CREATE OR REPLACE FUNCTION "Inventory"."goodsDemandCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."GoodsDemands";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."GoodsDemands" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GoodsDemands % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'SAVED', 'ORDERED') THEN
    RAISE EXCEPTION 'GoodsDemands %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."goodsDemandCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."goodsDemandCancelEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."GoodsDemands" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- GoodsDemands: Order (status -> ORDERED); allowed from DRAFT, SAVED
CREATE OR REPLACE FUNCTION "Inventory"."goodsDemandOrder"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Inventory"."GoodsDemands";
BEGIN
  SELECT * INTO "vRow" FROM "Inventory"."GoodsDemands" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GoodsDemands % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'ORDERED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'SAVED') THEN
    RAISE EXCEPTION 'GoodsDemands %: cannot order from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."goodsDemandOrderEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."goodsDemandOrderEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."GoodsDemands" t SET status = 'ORDERED' WHERE t.id = "pId";
  RETURN "pId";
END $$;
