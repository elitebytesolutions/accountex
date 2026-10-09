-- Phase 22 — Stock vouchers & demand: numbering for stock vouchers (BRK, GFT, SMP, INT), assembly (ASM), goods
-- demand (DMD), price change batches (PCB) and principal claims (CLM); error codes. Idempotent.
SELECT set_config('app.actorLabel', '028-stock-demand.sql', false);

CREATE OR REPLACE FUNCTION "Inventory"."seedStockDemandDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vN" integer;
BEGIN
  INSERT INTO "Company"."NumberingSeries" ("tenantId", "docType", "branchId", prefix, pattern, padding, "startValue", "resetPolicy", "isActive")
  SELECT "pTenant", d.code, NULL, d."defaultPrefix", d."defaultPattern", d."defaultPadding", 1, d."defaultResetPolicy", true
    FROM "Company"."DocumentTypes" d
   WHERE d.code IN ('BRK', 'GFT', 'SMP', 'INT', 'ASM', 'DMD', 'PCB', 'CLM')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "Inventory"."triggerTenantStockDemandDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Inventory"."seedStockDemandDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsStockDemandDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsStockDemandDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "Inventory"."triggerTenantStockDemandDefaults"();

SELECT set_config('app.actorLabel', 'seedStockDemandDefaultsFor', false);
SELECT "Inventory"."seedStockDemandDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '028-stock-demand.sql', false);

INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('DEMAND_ALREADY_ORDERED', 409, 'BUSINESS_RULE', 'INVENTORY', 'This demand is already on a purchase order.', 'Convert of an ordered / cancelled demand', true, NULL),
  ('DEMAND_NOTHING_TO_ORDER', 409, 'BUSINESS_RULE', 'INVENTORY', 'Nothing is below its reorder level for this vendor.', 'Demand generation found no items', true, NULL),
  ('PRICE_UPDATE_NOT_DRAFT', 409, 'BUSINESS_RULE', 'INVENTORY', 'Only a draft price update can be applied; only an applied one can be undone.', 'Wrong state for apply / undo', true, NULL),
  ('PRINCIPAL_CLAIM_NOT_EDITABLE', 409, 'BUSINESS_RULE', 'INVENTORY', 'Only a pending principal claim can be changed.', 'Edit of a submitted / settled principal claim', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
