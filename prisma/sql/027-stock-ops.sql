-- Phase 21 — Stock operations: numbering (MI, MO, TRF, ADJ, SC), stock counts approvable from COUNTING / VARIANCE_REVIEW,
-- error codes (insufficient stock carries STOCK_INSUFFICIENT). Idempotent.
SELECT set_config('app.actorLabel', '027-stock-ops.sql', false);

CREATE OR REPLACE FUNCTION "Inventory"."seedStockOpsDefaultsFor"("pTenant" uuid)
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
   WHERE d.code IN ('MI', 'MO', 'TRF', 'ADJ', 'SC')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "Inventory"."triggerTenantStockOpsDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Inventory"."seedStockOpsDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsStockOpsDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsStockOpsDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "Inventory"."triggerTenantStockOpsDefaults"();

SELECT set_config('app.actorLabel', 'seedStockOpsDefaultsFor', false);
SELECT "Inventory"."seedStockOpsDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '027-stock-ops.sql', false);

-- a count is approved after counting (COUNTING / VARIANCE_REVIEW), not only from DRAFT
CREATE OR REPLACE FUNCTION "Inventory"."stockCountApprove"("pId" uuid, "pComment" text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
  IF "vRow".status NOT IN ('DRAFT', 'COUNTING', 'VARIANCE_REVIEW') THEN
    RAISE EXCEPTION 'StockCounts %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'StockCounts: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege', HINT = 'APPROVAL_SELF';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Inventory"."stockCountApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Inventory"."stockCountApproveEntries"') USING "pId";
  END IF;
  UPDATE "Inventory"."StockCounts" t SET status = 'APPROVED', "approvedAt" = now(), "approvalComment" = "pComment" WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- insufficient stock names its catalogue code
CREATE OR REPLACE FUNCTION "Inventory"."triggerStockLedgerApply"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  "vAvg"       numeric(18,4);
  "vBlock"     boolean;
  "vSlotQty"  numeric(18,3);
  "vItemQty"  numeric(18,3);
  "vPrevQty"  numeric(18,3);
  "vNewAvg"   numeric(18,4);
BEGIN
  -- 1. serialise movements of the same item (stable "before" quantity)
  SELECT i."avgCost" INTO "vAvg"
    FROM "Inventory"."Products" i
   WHERE i."tenantId" = NEW."tenantId" AND i.id = NEW."itemId"
     FOR UPDATE;

  -- 2. slot balance
  INSERT INTO "Inventory"."StockBalances" AS sb
         ("tenantId", "itemId", "warehouseId", "binId", "batchId", "qtyOnHand", value,
          "lastMovementAt", "lastInDate", "lastOutDate")
  VALUES (NEW."tenantId", NEW."itemId", NEW."warehouseId", NEW."binId", NEW."batchId",
          NEW."qtyIn" - NEW."qtyOut", NEW.value, NEW."movementAt",
          CASE WHEN NEW."qtyIn"  > 0 THEN NEW."movementDate" END,
          CASE WHEN NEW."qtyOut" > 0 THEN NEW."movementDate" END)
  ON CONFLICT ON CONSTRAINT "stockBalanceSlotUk" DO UPDATE
     SET "qtyOnHand"      = sb."qtyOnHand" + EXCLUDED."qtyOnHand",
         value            = sb.value + EXCLUDED.value,
         "lastMovementAt" = GREATEST(sb."lastMovementAt", EXCLUDED."lastMovementAt"),
         "lastInDate"     = GREATEST(sb."lastInDate", EXCLUDED."lastInDate"),
         "lastOutDate"    = GREATEST(sb."lastOutDate", EXCLUDED."lastOutDate")
  RETURNING sb."qtyOnHand" INTO "vSlotQty";

  -- 3. negative stock guard
  IF NEW."qtyOut" > 0 AND "vSlotQty" < 0 THEN
    SELECT w."blockNegativeStock" INTO "vBlock"
      FROM "Inventory"."Warehouses" w
     WHERE w."tenantId" = NEW."tenantId" AND w.id = NEW."warehouseId";
    IF "vBlock" THEN
      RAISE EXCEPTION 'Insufficient stock: % short by % in this warehouse/batch', NEW."itemId", -"vSlotQty"
        USING ERRCODE = 'check_violation', HINT = 'STOCK_INSUFFICIENT';
    END IF;
  END IF;

  -- 4. moving weighted-average cost
  IF NEW."qtyIn" > 0 AND NEW."movementType" IN ('GRN','MANUAL_IN','OPENING','ASSEMBLY') THEN
    SELECT COALESCE(sum(b."qtyOnHand"), 0) INTO "vItemQty"
      FROM "Inventory"."StockBalances" b
     WHERE b."tenantId" = NEW."tenantId" AND b."itemId" = NEW."itemId";
    "vPrevQty" := "vItemQty" - NEW."qtyIn";
    IF "vPrevQty" <= 0 THEN
      "vNewAvg" := NEW."unitCost";
    ELSE
      "vNewAvg" := round(("vPrevQty" * COALESCE("vAvg", 0) + NEW."qtyIn" * NEW."unitCost")
                         / ("vPrevQty" + NEW."qtyIn"), 4);
    END IF;
    UPDATE "Inventory"."Products" i
       SET "avgCost" = "vNewAvg"
     WHERE i."tenantId" = NEW."tenantId" AND i.id = NEW."itemId"
       AND i."avgCost" IS DISTINCT FROM "vNewAvg";
  END IF;

  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION "Inventory"."stockIssue"("pMove" jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vItem"   uuid := ("pMove" ->> 'itemId')::uuid;
  "vWh"     uuid := ("pMove" ->> 'warehouseId')::uuid;
  "vBin"    uuid := ("pMove" ->> 'binId')::uuid;
  "vLeft"   numeric(18,3) := COALESCE(("pMove" ->> 'qtyOut')::numeric, 0);
  "vTake"   numeric(18,3);
  "vValue"  numeric(18,2) := 0;
  "vTrack"  boolean;
  "vSku"    text;
  "vSlot"   record;
BEGIN
  IF "vLeft" <= 0 THEN
    RAISE EXCEPTION 'A stock issue needs a quantity above zero' USING ERRCODE = 'check_violation';
  END IF;
  IF ("pMove" ->> 'batchId') IS NOT NULL THEN
    RETURN "Inventory"."stockMoveValue"("pMove");
  END IF;
  SELECT i."trackExpiry", i.sku INTO "vTrack", "vSku"
    FROM "Inventory"."Products" i
   WHERE i."tenantId" = "vTenant" AND i.id = "vItem";
  FOR "vSlot" IN
    SELECT sb."batchId", sb."binId", sb."qtyOnHand"
      FROM "Inventory"."StockBalances" sb
      JOIN "Inventory"."ProductBatches" b ON b."tenantId" = sb."tenantId" AND b.id = sb."batchId"
     WHERE sb."tenantId" = "vTenant" AND sb."itemId" = "vItem" AND sb."warehouseId" = "vWh"
       AND ("vBin" IS NULL OR sb."binId" = "vBin")
       AND sb."qtyOnHand" > 0 AND b.disposition <> 'WRITTEN_OFF'
     ORDER BY b."expiryDate" NULLS LAST, b."batchNo", sb."binId" NULLS FIRST
  LOOP
    EXIT WHEN "vLeft" <= 0;
    "vTake"  := LEAST("vLeft", "vSlot"."qtyOnHand");
    "vValue" := "vValue" + "Inventory"."stockMoveValue"("pMove" || jsonb_build_object(
                  'batchId', "vSlot"."batchId", 'binId', "vSlot"."binId", 'qtyOut', "vTake"));
    "vLeft"  := "vLeft" - "vTake";
  END LOOP;
  IF "vLeft" > 0 THEN
    IF "vTrack" THEN
      RAISE EXCEPTION 'Item % is expiry-tracked and its batches in this warehouse are short by %', "vSku", "vLeft"
        USING ERRCODE = 'check_violation', HINT = 'STOCK_INSUFFICIENT';
    END IF;
    "vValue" := "vValue" + "Inventory"."stockMoveValue"("pMove" || jsonb_build_object('qtyOut', "vLeft"));
  END IF;
  RETURN "vValue";
END $function$;

INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('STOCK_INSUFFICIENT',           409, 'BUSINESS_RULE', 'INVENTORY', 'There isn''t enough stock in that warehouse / batch for this.', 'Stock out above the quantity on hand', true, NULL),
  ('STOCK_DOC_NOT_EDITABLE',       409, 'BUSINESS_RULE', 'INVENTORY', 'Only a draft can be changed. Cancel a posted document instead.', 'Edit of a posted stock document', true, NULL),
  ('TRANSFER_NOT_DISPATCHED',      409, 'BUSINESS_RULE', 'INVENTORY', 'Only a dispatched transfer can be received.', 'Receive before dispatch', true, NULL),
  ('COUNT_NOT_FROZEN',             409, 'BUSINESS_RULE', 'INVENTORY', 'Freeze the count (snapshot the book quantities) before entering counts.', 'Count entry before freeze', true, NULL),
  ('ADJUSTMENT_APPROVAL_REQUIRED', 409, 'BUSINESS_RULE', 'INVENTORY', 'An approval workflow covers this adjustment. Submit it for approval.', 'Direct post of a routed adjustment', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
