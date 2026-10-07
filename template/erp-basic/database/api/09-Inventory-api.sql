-- =============================================================================
-- Finsoft ERP (Basic edition) — API: "Inventory"
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

-- Products: insert (no "id") or update (with "id"); child arrays: barcodes, units
CREATE OR REPLACE FUNCTION "Inventory"."productAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."Products";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1ProductBarcodes" "Inventory"."ProductBarcodes";
  "vC1ProductUnits" "Inventory"."ProductUnits";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."Products", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'sku') OR "vRec".sku IS NULL THEN
      "vRec".sku := "Company"."getNextDocNo"('ITEM', current_date, NULL);
    END IF;
    INSERT INTO "Inventory"."Products" ("tenantId", sku, upc, name, "nameUrdu", description, "imageUrl", status, "manufacturerId", "distributorVendorId", "productClassId", "productSubclassId", "uomId", ctn, "defaultShelf", cost, "avgCost", "costPerUnit", price, wprice, "gstRate", "taxCodeId", "finDiscPct", "lowLevel", "highLevel", "isShort", "trackExpiry", "isControlled", "isPrecious", "hsCode")
    VALUES ("vTenant", "vRec".sku, CASE WHEN "pData" ? 'upc' THEN "vRec".upc ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'nameUrdu' THEN "vRec"."nameUrdu" ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'imageUrl' THEN "vRec"."imageUrl" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'manufacturerId' THEN "vRec"."manufacturerId" ELSE NULL END, CASE WHEN "pData" ? 'distributorVendorId' THEN "vRec"."distributorVendorId" ELSE NULL END, CASE WHEN "pData" ? 'productClassId' THEN "vRec"."productClassId" ELSE NULL END, CASE WHEN "pData" ? 'productSubclassId' THEN "vRec"."productSubclassId" ELSE NULL END, CASE WHEN "pData" ? 'uomId' THEN "vRec"."uomId" ELSE NULL END, CASE WHEN "pData" ? 'ctn' THEN "vRec".ctn ELSE 1 END, CASE WHEN "pData" ? 'defaultShelf' THEN "vRec"."defaultShelf" ELSE NULL END, CASE WHEN "pData" ? 'cost' THEN "vRec".cost ELSE 0 END, CASE WHEN "pData" ? 'avgCost' THEN "vRec"."avgCost" ELSE 0 END, CASE WHEN "pData" ? 'costPerUnit' THEN "vRec"."costPerUnit" ELSE NULL END, CASE WHEN "pData" ? 'price' THEN "vRec".price ELSE 0 END, CASE WHEN "pData" ? 'wprice' THEN "vRec".wprice ELSE NULL END, CASE WHEN "pData" ? 'gstRate' THEN "vRec"."gstRate" ELSE 18 END, CASE WHEN "pData" ? 'taxCodeId' THEN "vRec"."taxCodeId" ELSE NULL END, CASE WHEN "pData" ? 'finDiscPct' THEN "vRec"."finDiscPct" ELSE 0 END, CASE WHEN "pData" ? 'lowLevel' THEN "vRec"."lowLevel" ELSE 0 END, CASE WHEN "pData" ? 'highLevel' THEN "vRec"."highLevel" ELSE 0 END, CASE WHEN "pData" ? 'isShort' THEN "vRec"."isShort" ELSE FALSE END, CASE WHEN "pData" ? 'trackExpiry' THEN "vRec"."trackExpiry" ELSE FALSE END, CASE WHEN "pData" ? 'isControlled' THEN "vRec"."isControlled" ELSE FALSE END, CASE WHEN "pData" ? 'isPrecious' THEN "vRec"."isPrecious" ELSE FALSE END, CASE WHEN "pData" ? 'hsCode' THEN "vRec"."hsCode" ELSE NULL END)
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
           "hsCode" = CASE WHEN "pData" ? 'hsCode' THEN "vRec"."hsCode" ELSE t."hsCode" END
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
COMMENT ON FUNCTION "Inventory"."productAddUpdate"(jsonb) IS 'Save (insert or update) one Products record with its barcodes, units.';

-- Products: one record as JSON (camelCase keys), with lookup labels and barcodes, units
CREATE OR REPLACE FUNCTION "Inventory"."getProductInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('ProductStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ProductStatus', t.status) ->> 'tone') ||
         jsonb_build_object('barcodes', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Inventory"."ProductBarcodes" c1 WHERE c1."itemId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'units', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Inventory"."ProductUnits" c1 WHERE c1."itemId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
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
    INSERT INTO "Inventory"."Warehouses" ("tenantId", code, name, description, type, "branchId", "managerUserId", address, city, "capacityPallets", "inventoryAccountId", "blockNegativeStock", "isPrimary", status)
    VALUES ("vTenant", "vRec".code, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'type' THEN "vRec".type ELSE 'WAREHOUSE' END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'managerUserId' THEN "vRec"."managerUserId" ELSE NULL END, CASE WHEN "pData" ? 'address' THEN "vRec".address ELSE NULL END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'capacityPallets' THEN "vRec"."capacityPallets" ELSE NULL END, CASE WHEN "pData" ? 'inventoryAccountId' THEN "vRec"."inventoryAccountId" ELSE NULL END, CASE WHEN "pData" ? 'blockNegativeStock' THEN "vRec"."blockNegativeStock" ELSE TRUE END, CASE WHEN "pData" ? 'isPrimary' THEN "vRec"."isPrimary" ELSE FALSE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
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
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
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
    INSERT INTO "Inventory"."StockInOut" ("tenantId", "docNo", mode, "docDate", "manualRef", "reasonId", "warehouseId", "binId", "requestedByName", "enteredByUserId", notes, "totalItems", "totalQty", "totalValue")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'mode' THEN "vRec".mode ELSE NULL END, CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'manualRef' THEN "vRec"."manualRef" ELSE NULL END, CASE WHEN "pData" ? 'reasonId' THEN "vRec"."reasonId" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'binId' THEN "vRec"."binId" ELSE NULL END, CASE WHEN "pData" ? 'requestedByName' THEN "vRec"."requestedByName" ELSE NULL END, CASE WHEN "pData" ? 'enteredByUserId' THEN "vRec"."enteredByUserId" ELSE NULL END, CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE NULL END, CASE WHEN "pData" ? 'totalItems' THEN "vRec"."totalItems" ELSE 0 END, CASE WHEN "pData" ? 'totalQty' THEN "vRec"."totalQty" ELSE 0 END, CASE WHEN "pData" ? 'totalValue' THEN "vRec"."totalValue" ELSE 0 END)
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
           "totalValue" = CASE WHEN "pData" ? 'totalValue' THEN "vRec"."totalValue" ELSE t."totalValue" END
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

-- StockTransfers: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Inventory"."stockTransferAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."StockTransfers";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."StockTransfers", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('TRF', "vRec"."docDate", NULL);
    END IF;
    INSERT INTO "Inventory"."StockTransfers" ("tenantId", "docNo", "docDate", "transferAt", "fromWarehouseId", "toWarehouseId", "preparedByUserId", remarks, carrier, "driverName", "vehicleNo", "dispatchedAt", "etaAt", "receivedAt", "receivedByUserId", "receiptNote", "totalItems", "totalQty", "totalValue", "receiptJournalEntryId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'transferAt' THEN "vRec"."transferAt" ELSE now() END, CASE WHEN "pData" ? 'fromWarehouseId' THEN "vRec"."fromWarehouseId" ELSE NULL END, CASE WHEN "pData" ? 'toWarehouseId' THEN "vRec"."toWarehouseId" ELSE NULL END, CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'carrier' THEN "vRec".carrier ELSE NULL END, CASE WHEN "pData" ? 'driverName' THEN "vRec"."driverName" ELSE NULL END, CASE WHEN "pData" ? 'vehicleNo' THEN "vRec"."vehicleNo" ELSE NULL END, CASE WHEN "pData" ? 'dispatchedAt' THEN "vRec"."dispatchedAt" ELSE NULL END, CASE WHEN "pData" ? 'etaAt' THEN "vRec"."etaAt" ELSE NULL END, CASE WHEN "pData" ? 'receivedAt' THEN "vRec"."receivedAt" ELSE NULL END, CASE WHEN "pData" ? 'receivedByUserId' THEN "vRec"."receivedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'receiptNote' THEN "vRec"."receiptNote" ELSE NULL END, CASE WHEN "pData" ? 'totalItems' THEN "vRec"."totalItems" ELSE 0 END, CASE WHEN "pData" ? 'totalQty' THEN "vRec"."totalQty" ELSE 0 END, CASE WHEN "pData" ? 'totalValue' THEN "vRec"."totalValue" ELSE 0 END, CASE WHEN "pData" ? 'receiptJournalEntryId' THEN "vRec"."receiptJournalEntryId" ELSE NULL END)
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
           "receiptJournalEntryId" = CASE WHEN "pData" ? 'receiptJournalEntryId' THEN "vRec"."receiptJournalEntryId" ELSE t."receiptJournalEntryId" END
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

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Inventory"."stockTransferAddUpdate"(jsonb) IS 'Save (insert or update) one StockTransfers record.';

-- StockTransfers: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Inventory"."getStockTransferInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('StockTransferStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('StockTransferStatus', t.status) ->> 'tone')
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
