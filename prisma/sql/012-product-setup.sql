-- Phase 6: Product setup (units of measure, product companies, product classes, warehouses & bins,
-- stock movement reasons). Idempotent. Apply with: npm run db:sql

-- ---------------------------------------------------------------------------
-- 1. Row history on the tables that had none
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "unitsOfMeasureAudit" ON "Inventory"."UnitsOfMeasure";
CREATE TRIGGER "unitsOfMeasureAudit" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."UnitsOfMeasure"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "productCompaniesAudit" ON "Inventory"."ProductCompanies";
CREATE TRIGGER "productCompaniesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."ProductCompanies"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "productClassesAudit" ON "Inventory"."ProductClasses";
CREATE TRIGGER "productClassesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."ProductClasses"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "productSubclassesAudit" ON "Inventory"."ProductSubclasses";
CREATE TRIGGER "productSubclassesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."ProductSubclasses"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "warehouseBinsAudit" ON "Inventory"."WarehouseBins";
CREATE TRIGGER "warehouseBinsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."WarehouseBins"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Standard units and stock movement reasons for every company (system rows: editable, never deleted).
--    At provisioning, and backfilled now.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Inventory"."seedInventoryDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE "vUnits" integer; "vReasons" integer;
BEGIN
  INSERT INTO "Inventory"."UnitsOfMeasure" ("tenantId", code, name, kind, decimals, "isSystem", "isActive")
  SELECT "pTenant", v.code, v.name, v.kind, v.decimals, true, true
    FROM (VALUES
      ('PCS', 'Piece', 'COUNT', 0), ('PKT', 'Packet', 'COUNT', 0), ('BOX', 'Box', 'COUNT', 0), ('CTN', 'Carton', 'COUNT', 0),
      ('DZN', 'Dozen', 'COUNT', 0), ('KG', 'Kilogram', 'WEIGHT', 3), ('G', 'Gram', 'WEIGHT', 0), ('L', 'Litre', 'VOLUME', 3),
      ('ML', 'Millilitre', 'VOLUME', 0), ('M', 'Metre', 'LENGTH', 2)
    ) AS v(code, name, kind, decimals)
   WHERE NOT EXISTS (SELECT 1 FROM "Inventory"."UnitsOfMeasure" u WHERE u."tenantId" = "pTenant" AND u.code = v.code);
  GET DIAGNOSTICS "vUnits" = ROW_COUNT;

  INSERT INTO "Inventory"."StockMovementReasons" ("tenantId", direction, code, label, hint, icon, "ledgerMovementType", "isSystem", "sortOrder", "isActive")
  SELECT "pTenant", v.direction, v.code, v.label, v.hint, v.icon, v.ledger, true, v.sort, true
    FROM (VALUES
      ('IN',  'OPENING',        'Opening stock',        'Stock on hand when you start using Accountex', 'package-plus',  'OPENING',    10),
      ('ADJ', 'FOUND_IN_COUNT', 'Found in count',       'More stock counted than the books show',        'search-check',  'ADJUSTMENT', 20),
      ('IN',  'RECEIVED_OTHER', 'Received – other',     'Stock received without a purchase document',    'arrow-down-to-line', 'MANUAL_IN', 30),
      ('OUT', 'DAMAGED',        'Damaged',              'Broken or damaged in the warehouse or transit', 'package-x',     'WRITE_OFF',  10),
      ('OUT', 'EXPIRED',        'Expired',              'Past its expiry date',                          'calendar-x',    'WRITE_OFF',  20),
      ('OUT', 'THEFT_LOSS',     'Theft / loss',         'Missing stock written off',                     'shield-alert',  'WRITE_OFF',  30),
      ('OUT', 'INTERNAL_USE',   'Internal consumption', 'Used by the business itself',                   'utensils',      'MANUAL_OUT', 40),
      ('OUT', 'FREE_SAMPLES',   'Free samples',         'Given away as samples or promotion',            'gift',          'MANUAL_OUT', 50),
      ('ADJ', 'COUNT_VARIANCE', 'Cycle count variance', 'Difference found in a stock count',             'clipboard-check', 'ADJUSTMENT', 10)
    ) AS v(direction, code, label, hint, icon, ledger, sort)
   WHERE NOT EXISTS (SELECT 1 FROM "Inventory"."StockMovementReasons" r
                      WHERE r."tenantId" = "pTenant" AND r.direction = v.direction AND r.code = v.code);
  GET DIAGNOSTICS "vReasons" = ROW_COUNT;
  RETURN "vUnits" + "vReasons";
END $function$;

CREATE OR REPLACE FUNCTION "Inventory"."triggerTenantInventoryDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Inventory"."seedInventoryDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsInventoryDefaults" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsInventoryDefaults" AFTER INSERT ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "Inventory"."triggerTenantInventoryDefaults"();

SELECT set_config('app.actorLabel', 'seedInventoryDefaultsFor', true);
SELECT "Inventory"."seedInventoryDefaultsFor"(t.id) FROM "Platform"."Tenants" t;

-- ---------------------------------------------------------------------------
-- 3. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('UNIT_IN_USE',            409, 'BUSINESS_RULE', 'INVENTORY', 'Products or documents use this unit. Deactivate it instead.', 'Delete of a used unit of measure', true, NULL),
  ('PRODUCT_COMPANY_IN_USE', 409, 'BUSINESS_RULE', 'INVENTORY', 'Products belong to this company. Deactivate it instead.', 'Delete of a used product company', true, NULL),
  ('PRODUCT_CLASS_IN_USE',   409, 'BUSINESS_RULE', 'INVENTORY', 'This class still has sub types or products. Hide it instead.', 'Delete of a used product class or sub type', true, NULL),
  ('WAREHOUSE_IN_USE',       409, 'BUSINESS_RULE', 'INVENTORY', 'Stock or documents use this warehouse. Deactivate it instead.', 'Delete of a used warehouse', true, NULL),
  ('WAREHOUSE_HAS_STOCK',    409, 'BUSINESS_RULE', 'INVENTORY', 'This warehouse still holds stock. Move or write it off first.', 'Deactivate of a warehouse with stock on hand', true, NULL),
  ('BIN_IN_USE',             409, 'BUSINESS_RULE', 'INVENTORY', 'Stock or documents use this bin. Deactivate it instead.', 'Delete of a used bin', true, NULL),
  ('MOVEMENT_REASON_IN_USE', 409, 'BUSINESS_RULE', 'INVENTORY', 'Stock movements use this reason. Deactivate it instead.', 'Delete of a used stock movement reason', true, NULL),
  ('SYSTEM_ROW_LOCKED',      409, 'BUSINESS_RULE', 'INVENTORY', 'Standard entries can be edited or deactivated, not deleted.', 'Delete of a system (seeded) row', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 4. Readable labels for the Phase 6 selects. Labels only; codes unchanged.
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" l
   SET "label" = v.label
  FROM (VALUES
    ('UnitOfMeasureKind','COUNT','Count'), ('UnitOfMeasureKind','WEIGHT','Weight'), ('UnitOfMeasureKind','VOLUME','Volume'),
    ('UnitOfMeasureKind','LENGTH','Length'),
    ('WarehouseType','WAREHOUSE','Warehouse'), ('WarehouseType','SHOP','Shop'), ('WarehouseType','VAN','Van'),
    ('StockMovementReasonDirection','IN','Stock in'), ('StockMovementReasonDirection','OUT','Stock out'),
    ('StockMovementReasonDirection','ADJ','Adjustment'),
    ('StockMovementReasonLedgerMovementType','MANUAL_IN','Manual in'), ('StockMovementReasonLedgerMovementType','MANUAL_OUT','Manual out'),
    ('StockMovementReasonLedgerMovementType','OPENING','Opening'), ('StockMovementReasonLedgerMovementType','ADJUSTMENT','Adjustment'),
    ('StockMovementReasonLedgerMovementType','WRITE_OFF','Write-off')
  ) AS v(type, code, label)
 WHERE l."lookupType" = v.type AND l.code = v.code AND l."tenantId" IS NULL AND l."label" IS DISTINCT FROM v.label;

-- ---------------------------------------------------------------------------
-- 5. Sub types saved on their own (same shape as the other *AddUpdate functions). productClassAddUpdate's
--    child array would update the class row too (its rowVersion and history) on every sub type change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Inventory"."productSubclassAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Inventory"."ProductSubclasses";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Inventory"."ProductSubclasses", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Inventory"."ProductSubclasses" ("tenantId", "productClassId", code, name, "isVisible", "sortOrder")
    VALUES ("vTenant", "vRec"."productClassId", "vRec".code, "vRec".name,
            CASE WHEN "pData" ? 'isVisible' THEN "vRec"."isVisible" ELSE TRUE END,
            CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Inventory"."ProductSubclasses" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "isVisible" = CASE WHEN "pData" ? 'isVisible' THEN "vRec"."isVisible" ELSE t."isVisible" END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Inventory"."ProductSubclasses" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ProductSubclasses %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ProductSubclasses % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  RETURN "vRet";
END $function$;
GRANT EXECUTE ON FUNCTION "Inventory"."productSubclassAddUpdate"(jsonb) TO "finsoftApp";
