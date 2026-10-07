-- Phase 8: Products (products with units, barcodes, suppliers, batches and price log; kits & bundles; barcode label
-- templates and jobs; reorder rules). Idempotent. Apply with: npm run db:sql

-- ---------------------------------------------------------------------------
-- 1. Row history on the tables that had none
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "productUnitsAudit" ON "Inventory"."ProductUnits";
CREATE TRIGGER "productUnitsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."ProductUnits"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "productBarcodesAudit" ON "Inventory"."ProductBarcodes";
CREATE TRIGGER "productBarcodesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."ProductBarcodes"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "productSuppliersAudit" ON "Inventory"."ProductSuppliers";
CREATE TRIGGER "productSuppliersAudit" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."ProductSuppliers"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "productPriceLogsAudit" ON "Inventory"."ProductPriceLogs";
CREATE TRIGGER "productPriceLogsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."ProductPriceLogs"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "kitComponentsAudit" ON "Inventory"."KitComponents";
CREATE TRIGGER "kitComponentsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."KitComponents"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "barcodeLabelTemplatesAudit" ON "Inventory"."BarcodeLabelTemplates";
CREATE TRIGGER "barcodeLabelTemplatesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."BarcodeLabelTemplates"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "barcodeLabelJobsAudit" ON "Inventory"."BarcodeLabelJobs";
CREATE TRIGGER "barcodeLabelJobsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."BarcodeLabelJobs"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "barcodeLabelJobLinesAudit" ON "Inventory"."BarcodeLabelJobLines";
CREATE TRIGGER "barcodeLabelJobLinesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."BarcodeLabelJobLines"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "reorderRulesAudit" ON "Inventory"."ReorderRules";
CREATE TRIGGER "reorderRulesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."ReorderRules"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Child rows saved one at a time (same shape as the generated *AddUpdate functions): editing one unit, barcode or
--    supplier must not rewrite the product row (its version and history).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Inventory"."productUnitAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."ProductUnits";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."ProductUnits", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Inventory"."ProductUnits" ("tenantId", "itemId", "uomId", factor, "isBase", "isPurchaseDefault", "isSalesDefault")
    VALUES ("vTenant", "vRec"."itemId", CASE WHEN "pData" ? 'uomId' THEN "vRec"."uomId" ELSE NULL END,
            CASE WHEN "pData" ? 'factor' THEN "vRec".factor ELSE NULL END,
            CASE WHEN "pData" ? 'isBase' THEN "vRec"."isBase" ELSE FALSE END,
            CASE WHEN "pData" ? 'isPurchaseDefault' THEN "vRec"."isPurchaseDefault" ELSE FALSE END,
            CASE WHEN "pData" ? 'isSalesDefault' THEN "vRec"."isSalesDefault" ELSE FALSE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."ProductUnits" t
       SET "uomId" = CASE WHEN "pData" ? 'uomId' THEN "vRec"."uomId" ELSE t."uomId" END,
           factor = CASE WHEN "pData" ? 'factor' THEN "vRec".factor ELSE t.factor END,
           "isBase" = CASE WHEN "pData" ? 'isBase' THEN "vRec"."isBase" ELSE t."isBase" END,
           "isPurchaseDefault" = CASE WHEN "pData" ? 'isPurchaseDefault' THEN "vRec"."isPurchaseDefault" ELSE t."isPurchaseDefault" END,
           "isSalesDefault" = CASE WHEN "pData" ? 'isSalesDefault' THEN "vRec"."isSalesDefault" ELSE t."isSalesDefault" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."ProductUnits" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ProductUnits %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ProductUnits % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  RETURN "vRet";
END $function$;
GRANT EXECUTE ON FUNCTION "Inventory"."productUnitAddUpdate"(jsonb) TO "finsoftApp";

CREATE OR REPLACE FUNCTION "Inventory"."productBarcodeAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."ProductBarcodes";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."ProductBarcodes", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Inventory"."ProductBarcodes" ("tenantId", "itemId", barcode, kind, "qtyPerScan", "isPrimary")
    VALUES ("vTenant", "vRec"."itemId", CASE WHEN "pData" ? 'barcode' THEN "vRec".barcode ELSE NULL END,
            CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE 'PIECE' END,
            CASE WHEN "pData" ? 'qtyPerScan' THEN "vRec"."qtyPerScan" ELSE 1 END,
            CASE WHEN "pData" ? 'isPrimary' THEN "vRec"."isPrimary" ELSE FALSE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."ProductBarcodes" t
       SET barcode = CASE WHEN "pData" ? 'barcode' THEN "vRec".barcode ELSE t.barcode END,
           kind = CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE t.kind END,
           "qtyPerScan" = CASE WHEN "pData" ? 'qtyPerScan' THEN "vRec"."qtyPerScan" ELSE t."qtyPerScan" END,
           "isPrimary" = CASE WHEN "pData" ? 'isPrimary' THEN "vRec"."isPrimary" ELSE t."isPrimary" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."ProductBarcodes" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ProductBarcodes %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ProductBarcodes % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  RETURN "vRet";
END $function$;
GRANT EXECUTE ON FUNCTION "Inventory"."productBarcodeAddUpdate"(jsonb) TO "finsoftApp";

CREATE OR REPLACE FUNCTION "Inventory"."productSupplierAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."ProductSuppliers";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."ProductSuppliers", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Inventory"."ProductSuppliers" ("tenantId", "itemId", "vendorId", "vendorItemCode", "lastPrice", "lastPurchaseDate", "leadDays", "sharePct", "isPreferred")
    VALUES ("vTenant", "vRec"."itemId", CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE NULL END,
            CASE WHEN "pData" ? 'vendorItemCode' THEN "vRec"."vendorItemCode" ELSE NULL END,
            CASE WHEN "pData" ? 'lastPrice' THEN "vRec"."lastPrice" ELSE NULL END,
            CASE WHEN "pData" ? 'lastPurchaseDate' THEN "vRec"."lastPurchaseDate" ELSE NULL END,
            CASE WHEN "pData" ? 'leadDays' THEN "vRec"."leadDays" ELSE NULL END,
            CASE WHEN "pData" ? 'sharePct' THEN "vRec"."sharePct" ELSE NULL END,
            CASE WHEN "pData" ? 'isPreferred' THEN "vRec"."isPreferred" ELSE FALSE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."ProductSuppliers" t
       SET "vendorId" = CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE t."vendorId" END,
           "vendorItemCode" = CASE WHEN "pData" ? 'vendorItemCode' THEN "vRec"."vendorItemCode" ELSE t."vendorItemCode" END,
           "lastPrice" = CASE WHEN "pData" ? 'lastPrice' THEN "vRec"."lastPrice" ELSE t."lastPrice" END,
           "lastPurchaseDate" = CASE WHEN "pData" ? 'lastPurchaseDate' THEN "vRec"."lastPurchaseDate" ELSE t."lastPurchaseDate" END,
           "leadDays" = CASE WHEN "pData" ? 'leadDays' THEN "vRec"."leadDays" ELSE t."leadDays" END,
           "sharePct" = CASE WHEN "pData" ? 'sharePct' THEN "vRec"."sharePct" ELSE t."sharePct" END,
           "isPreferred" = CASE WHEN "pData" ? 'isPreferred' THEN "vRec"."isPreferred" ELSE t."isPreferred" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."ProductSuppliers" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ProductSuppliers %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ProductSuppliers % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  RETURN "vRet";
END $function$;
GRANT EXECUTE ON FUNCTION "Inventory"."productSupplierAddUpdate"(jsonb) TO "finsoftApp";

-- Price log lines are only ever added (invItemPriceHistoryAppendOnly blocks updates and deletes).
CREATE OR REPLACE FUNCTION "Inventory"."productPriceLogAdd"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."ProductPriceLogs";
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."ProductPriceLogs", "pData");
  INSERT INTO "Inventory"."ProductPriceLogs" ("tenantId", "itemId", "priceField", "oldValue", "newValue", "changedByUserId", source, "priceChangeBatchId")
  VALUES ("vTenant", "vRec"."itemId", "vRec"."priceField", "vRec"."oldValue", "vRec"."newValue", "vRec"."changedByUserId", "vRec".source, "vRec"."priceChangeBatchId")
  RETURNING id INTO "vRet";
  RETURN "vRet";
END $function$;
GRANT EXECUTE ON FUNCTION "Inventory"."productPriceLogAdd"(jsonb) TO "finsoftApp";

-- A printed label job and its lines in one call (lines replace the job's lines).
CREATE OR REPLACE FUNCTION "Inventory"."barcodeLabelJobAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."BarcodeLabelJobs";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vLine" jsonb;
  "vL" "Inventory"."BarcodeLabelJobLines";
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."BarcodeLabelJobs", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Inventory"."BarcodeLabelJobs" ("tenantId", "templateId", "showPrice", "showUrduName", "showBatchExpiry", "showCompany", "useCartonBarcode",
                                                "productCount", "totalLabels", "pageCount", source, status, "printedAt", "printedByUserId")
    VALUES ("vTenant", "vRec"."templateId", COALESCE("vRec"."showPrice", TRUE), COALESCE("vRec"."showUrduName", FALSE), COALESCE("vRec"."showBatchExpiry", FALSE),
            COALESCE("vRec"."showCompany", TRUE), COALESCE("vRec"."useCartonBarcode", FALSE), COALESCE("vRec"."productCount", 0), COALESCE("vRec"."totalLabels", 0),
            "vRec"."pageCount", COALESCE("vRec".source, 'LABELS'), COALESCE("vRec".status, 'QUEUED'), "vRec"."printedAt", "vRec"."printedByUserId")
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."BarcodeLabelJobs" t
       SET status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "printedAt" = CASE WHEN "pData" ? 'printedAt' THEN "vRec"."printedAt" ELSE t."printedAt" END,
           "printedByUserId" = CASE WHEN "pData" ? 'printedByUserId' THEN "vRec"."printedByUserId" ELSE t."printedByUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."BarcodeLabelJobs" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'BarcodeLabelJobs %: record was changed by another user, reload and try again', "vId" USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'BarcodeLabelJobs % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    DELETE FROM "Inventory"."BarcodeLabelJobLines" WHERE "tenantId" = "vTenant" AND "jobId" = "vRet";
    FOR "vLine" IN SELECT x FROM jsonb_array_elements("pData" -> 'lines') x LOOP
      "vL" := jsonb_populate_record(NULL::"Inventory"."BarcodeLabelJobLines", "vLine");
      INSERT INTO "Inventory"."BarcodeLabelJobLines" ("tenantId", "jobId", "itemId", copies, barcode, "batchId", "printedPrice")
      VALUES ("vTenant", "vRet", "vL"."itemId", COALESCE("vL".copies, 1), "vL".barcode, "vL"."batchId", "vL"."printedPrice");
    END LOOP;
  END IF;
  RETURN "vRet";
END $function$;
GRANT EXECUTE ON FUNCTION "Inventory"."barcodeLabelJobAddUpdate"(jsonb) TO "finsoftApp";

-- ---------------------------------------------------------------------------
-- 3. System label templates for every company (the three the template offers). At provisioning, and backfilled now.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Inventory"."seedLabelTemplatesFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE "vCount" integer;
BEGIN
  INSERT INTO "Inventory"."BarcodeLabelTemplates" ("tenantId", code, name, media, "widthMm", "heightMm", "labelsPerSheet", "sheetColumns", "sheetRows", "isSystem", "isActive")
  SELECT "pTenant", v.code, v.name, v.media, v.w, v.h, v.per, v.cols, v.rows, true, true
    FROM (VALUES
      ('THERMAL_2X1', 'Thermal 2×1"', 'ROLL', 50.8, 25.4, NULL::smallint, 1::smallint, NULL::smallint),
      ('ROLL_38X25', '38×25mm', 'ROLL', 38.0, 25.0, NULL, 1, NULL),
      ('A4_40', 'A4 sheet of 40', 'SHEET', 52.5, 29.7, 40, 4, 10)
    ) AS v(code, name, media, w, h, per, cols, rows)
   WHERE NOT EXISTS (SELECT 1 FROM "Inventory"."BarcodeLabelTemplates" t WHERE t."tenantId" = "pTenant" AND t.code = v.code);
  GET DIAGNOSTICS "vCount" = ROW_COUNT;
  RETURN "vCount";
END $function$;

CREATE OR REPLACE FUNCTION "Inventory"."triggerTenantLabelTemplates"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Inventory"."seedLabelTemplatesFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsLabelTemplates" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsLabelTemplates" AFTER INSERT ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "Inventory"."triggerTenantLabelTemplates"();

SELECT set_config('app.actorLabel', 'seedLabelTemplatesFor', true);
SELECT "Inventory"."seedLabelTemplatesFor"(t.id) FROM "Platform"."Tenants" t;

-- ---------------------------------------------------------------------------
-- 4. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('PRODUCT_IN_USE',           409, 'BUSINESS_RULE', 'INVENTORY', 'Stock, kits or documents use this product. Deactivate it instead.', 'Delete of a used product', true, NULL),
  ('KIT_IN_USE',               409, 'BUSINESS_RULE', 'INVENTORY', 'Documents use this kit. Deactivate it instead.', 'Delete of a used kit', true, NULL),
  ('PRODUCT_PRICE_BELOW_COST', 400, 'VALIDATION',    'INVENTORY', 'The retail price is below cost. Save it as a draft or raise the price.', 'Active product priced below cost', true, NULL),
  ('PRODUCT_INCOMPLETE',       400, 'VALIDATION',    'INVENTORY', 'An active product needs a company, a class, a purchase price and a retail price. Complete it or save it as a draft.', 'Active product missing company / class / prices (itemCompleteWhenLiveChk)', true, NULL),
  ('UNIT_IN_USE_BY_PRODUCT',   409, 'BUSINESS_RULE', 'INVENTORY', 'Barcodes or documents use this pack size. Remove them first.', 'Delete of a used product unit', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 5. Readable labels for the Phase 8 selects (codes unchanged)
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" l
   SET "label" = v.label, "tone" = v.tone
  FROM (VALUES
    ('ProductBatchDisposition','SALEABLE','Saleable','good'), ('ProductBatchDisposition','PRIORITY','Priority sale','warn'),
    ('ProductBatchDisposition','QUARANTINE','Quarantine','danger'), ('ProductBatchDisposition','CLEARANCE','Clearance','warn'),
    ('ProductBatchDisposition','RETURN_TO_PRINCIPAL','Return to principal','info'), ('ProductBatchDisposition','WRITTEN_OFF','Written off','neutral'),
    ('ProductPriceLogPriceField','COST','Purchase price','neutral'), ('ProductPriceLogPriceField','PRICE','Retail price','neutral'),
    ('ProductPriceLogPriceField','WPRICE','Wholesale price','neutral'), ('ProductPriceLogPriceField','AVG_COST','Average cost','neutral'),
    ('ProductPriceLogSource','MANUAL','Edited','neutral'), ('ProductPriceLogSource','INLINE_EDIT','Inline edit','neutral'),
    ('ProductPriceLogSource','BULK_UPDATE','Bulk update','info'), ('ProductPriceLogSource','IMPORT','Import','info'), ('ProductPriceLogSource','GRN','Goods received','good'),
    ('ProductPriceLogSource','LANDED_COST','Landed cost','info'), ('ProductPriceLogSource','UNDO','Undo','warn'),
    ('ProductStatus','ACTIVE','Active','good'), ('ProductStatus','DRAFT','Draft','warn'), ('ProductStatus','INACTIVE','Inactive','neutral'),
    ('ProductBarcodeKind','PIECE','Piece','neutral'), ('ProductBarcodeKind','CARTON','Carton','neutral'),
    ('Media','ROLL','Roll','neutral'), ('Media','SHEET','Sheet','neutral')
  ) AS v(type, code, label, tone)
 WHERE l."lookupType" = v.type AND l.code = v.code AND l."tenantId" IS NULL
   AND (l."label" IS DISTINCT FROM v.label OR l."tone" IS DISTINCT FROM v.tone);
