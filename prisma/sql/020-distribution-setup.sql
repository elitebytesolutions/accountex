-- Phase 14: Distribution setup (shop areas, routes with visit days / stops / shop assignment, vans, commission slabs).
-- Idempotent: safe to run repeatedly via npm run db:sql (or: npx prisma db execute --file prisma/sql/020-distribution-setup.sql).

-- ---------------------------------------------------------------------------
-- 1. Row history on the tables that had none (Routes, ShopRouteProfiles, Vans and CommissionSlabs already have it)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "shopAreasAudit" ON "Distribution"."ShopAreas";
CREATE TRIGGER "shopAreasAudit" AFTER INSERT OR UPDATE OR DELETE ON "Distribution"."ShopAreas"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "routeVisitDaysAudit" ON "Distribution"."RouteVisitDays";
CREATE TRIGGER "routeVisitDaysAudit" AFTER INSERT OR UPDATE OR DELETE ON "Distribution"."RouteVisitDays"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "routeStopsAudit" ON "Distribution"."RouteStops";
CREATE TRIGGER "routeStopsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Distribution"."RouteStops"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Every company's RT numbering series. routeAddUpdate numbers a new route from it. At provisioning, and backfilled now.
--    Routes are RT-01 … RT-99, RT-100 … RT-9999 (the Routes code check is ^RT-[0-9]{2,4}$): at least two digits,
--    growing without truncation. "Company"."getNextDocNo" pads with lpad, which TRUNCATES a longer number ({SEQ2}
--    turns 100 into "10", so the 100th route would collide with the 10th). The shared function stays as it is: the
--    RT series pads to four digits instead ({SEQ4}: never truncated within the check), and "routesCodeMinWidth"
--    below trims the leading zeros of a four-digit code back to a minimum of two digits (RT-0007 → RT-07,
--    RT-0100 → RT-100). An existing series is never overwritten, except the untouched old {SEQ2} default.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Distribution"."seedDistributionDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vCount" integer := 0;
  "vN" integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" WHERE "tenantId" = "pTenant" AND "docType" = 'RT') THEN
    INSERT INTO "Company"."NumberingSeries" ("tenantId", "docType", "branchId", prefix, pattern, padding, "startValue", "resetPolicy", "isActive")
    SELECT "pTenant", d.code, NULL, d."defaultPrefix", '{PREFIX}-{SEQ4}', 4, 1, d."defaultResetPolicy", true
      FROM "Company"."DocumentTypes" d WHERE d.code = 'RT';
    GET DIAGNOSTICS "vN" = ROW_COUNT; "vCount" := "vCount" + "vN";
  END IF;
  RETURN "vCount";
END $function$;

CREATE OR REPLACE FUNCTION "Distribution"."triggerTenantDistributionDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Distribution"."seedDistributionDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsDistributionDefaults" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsDistributionDefaults" AFTER INSERT ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerTenantDistributionDefaults"();

SELECT set_config('app.actorLabel', 'seedDistributionDefaultsFor', true);
SELECT "Distribution"."seedDistributionDefaultsFor"(t.id) FROM "Platform"."Tenants" t;

-- Series created by an earlier run of this file with the truncating {SEQ2} default move to {SEQ4}; counters are kept.
-- "numberingSeriesGuard" refuses pattern changes once numbers are issued. This one is safe: with "routesCodeMinWidth"
-- every number already issued (1–99) comes out exactly as before. The guard is switched off for this one UPDATE only,
-- inside a single DO statement, so a failure leaves it on. The row-history trigger still records the change.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."docType" = 'RT' AND s.pattern = '{PREFIX}-{SEQ2}' AND s.padding = 2) THEN
    ALTER TABLE "Company"."NumberingSeries" DISABLE TRIGGER "numberingSeriesGuard";
    UPDATE "Company"."NumberingSeries" s
       SET pattern = '{PREFIX}-{SEQ4}', padding = 4
     WHERE s."docType" = 'RT' AND s.pattern = '{PREFIX}-{SEQ2}' AND s.padding = 2;
    ALTER TABLE "Company"."NumberingSeries" ENABLE TRIGGER "numberingSeriesGuard";
  END IF;
END $do$;

-- RT-0007 → RT-07, RT-0100 → RT-100: a four-digit code with a leading zero keeps at least two digits.
CREATE OR REPLACE FUNCTION "Distribution"."triggerRouteCodeMinWidth"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  "vDigits" text;
BEGIN
  IF NEW.code ~ '^RT-0[0-9]{3}$' THEN
    "vDigits" := ltrim(substr(NEW.code, 4), '0');
    NEW.code := 'RT-' || CASE WHEN length("vDigits") < 2 THEN lpad("vDigits", 2, '0') ELSE "vDigits" END;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "routesCodeMinWidth" ON "Distribution"."Routes";
CREATE TRIGGER "routesCodeMinWidth" BEFORE INSERT OR UPDATE OF code ON "Distribution"."Routes"
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerRouteCodeMinWidth"();

-- ---------------------------------------------------------------------------
-- 3. A van's warehouse must be a VAN-type warehouse: same rule, now naming its catalogue code (HINT) so the API
--    answers 400 VAN_WAREHOUSE_TYPE instead of a generic check violation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Distribution"."triggerVehicleVanWarehouse"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  "vWh" record;
BEGIN
  IF NEW."warehouseId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT w.type INTO "vWh"
    FROM "Inventory"."Warehouses" w
   WHERE w."tenantId" = NEW."tenantId" AND w.id = NEW."warehouseId";
  IF FOUND AND "vWh".type IS DISTINCT FROM 'VAN' THEN
    RAISE EXCEPTION 'Vehicle % must be linked to a warehouse of type VAN (got %)', NEW."regNo", "vWh".type
      USING ERRCODE = 'check_violation', HINT = 'VAN_WAREHOUSE_TYPE';
  END IF;
  RETURN NEW;
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('SHOP_AREA_IN_USE',                 409, 'BUSINESS_RULE', 'SALES', 'Shops on routes use this area. Deactivate it instead.', 'Delete of a used shop area', true, NULL),
  ('ROUTE_NO_VISIT_DAY',               400, 'VALIDATION',    'SALES', 'A route needs at least one visit day.', 'Route saved without visit days', true, NULL),
  ('ROUTE_DAY_HAS_STOPS',              409, 'BUSINESS_RULE', 'SALES', 'Stops are planned on this visit day. Move or remove them before dropping the day.', 'Visit day removed while it still has stops', true, NULL),
  ('ROUTE_STAFF_ROLE_MISMATCH',        409, 'BUSINESS_RULE', 'SALES', 'This employee doesn''t hold the role for that seat (order booker, salesman or deliveryman).', 'Route staff without the matching role', true, NULL),
  ('ROUTE_IN_USE',                     409, 'BUSINESS_RULE', 'SALES', 'Shops, bookings, load sheets or invoices use this route. Deactivate it instead.', 'Delete of a used route', true, NULL),
  ('ROUTE_SHOP_NOT_ASSIGNED',          400, 'VALIDATION',    'SALES', 'Only shops assigned to this route can be stops on it. Move the shop onto the route first.', 'Stop for a shop on another route', true, NULL),
  ('VAN_WAREHOUSE_TYPE',               400, 'VALIDATION',    'INVENTORY', 'A van can only be linked to a warehouse of type Van.', 'Van linked to a non-VAN warehouse', true, NULL),
  ('VAN_WAREHOUSE_IN_USE',             409, 'BUSINESS_RULE', 'INVENTORY', 'Another van already uses this van warehouse.', 'Second van on one warehouse', true, NULL),
  ('VAN_IN_USE',                       409, 'BUSINESS_RULE', 'INVENTORY', 'Routes, load sheets, challans, transfers or its stock location use this van. Set it inactive instead.', 'Delete of a used van', true, NULL),
  ('VAN_HAS_STOCK_LOCATION',           409, 'BUSINESS_RULE', 'INVENTORY', 'This van already has a stock location (van warehouse).', 'Create van stock location for a van that already has one', true, NULL),
  ('COMMISSION_SLABS_NOT_CONTIGUOUS',  400, 'VALIDATION',    'SALES', 'Commission bands must start at 0% and follow on without gaps; only the last band may be open-ended.', 'Gap or bad start in commission bands', true, NULL),
  ('COMMISSION_SLAB_OVERLAP',          409, 'BUSINESS_RULE', 'SALES', 'These bands overlap bands of another effective period. Change the dates or the period being replaced.', 'Commission slab overlap (exclusion constraint)', true, NULL),
  ('COMMISSION_SLAB_IN_USE',           409, 'BUSINESS_RULE', 'SALES', 'Salesman commissions were worked out on this band. End the period with an effective-to date instead.', 'Delete of a used commission slab', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 5. Badge tone for vans in the workshop (codes unchanged)
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" l
   SET "tone" = v.tone
  FROM (VALUES ('VanStatus', 'MAINTENANCE', 'warn')) AS v(type, code, tone)
 WHERE l."lookupType" = (SELECT c."lookupType" FROM "Lookups"."LookupColumns" c WHERE c."schemaName" = 'Distribution' AND c."tableName" = 'Vans' AND c."columnName" = 'status')
   AND l.code = v.code AND l."tenantId" IS NULL AND l."tone" IS DISTINCT FROM v.tone;
