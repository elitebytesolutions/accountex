-- Phase 25 — Wholesale: numbering (BK order bookings, WS wholesale invoices), audit triggers, booking stock check /
-- hold / conversion with back-orders, booking cancel limited to open bookings, held bill recall / discard, back-order
-- allocation from goods receipts (oldest first / price-tier priority / pro-rata), invoicing and cancellation, error
-- codes. Wholesale invoices themselves are Sales.SalesInvoices (channel WHOLESALE) posted by Sales.salesInvoicePost.
-- Idempotent.
SELECT set_config('app.actorLabel', '302-wholesale.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Numbering: BK, WS for every company and every new one
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Distribution"."seedWholesaleDefaultsFor"("pTenant" uuid)
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
   WHERE d.code IN ('BK', 'WS')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "Distribution"."triggerTenantWholesaleDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Distribution"."seedWholesaleDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsWholesaleDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsWholesaleDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerTenantWholesaleDefaults"();

SELECT set_config('app.actorLabel', 'seedWholesaleDefaultsFor', false);
SELECT "Distribution"."seedWholesaleDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '302-wholesale.sql', false);

-- ---------------------------------------------------------------------------
-- 2. Row history on the tables that had none
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['OrderBookingLines', 'OrderTemplates', 'OrderTemplateLines', 'HeldBills', 'HeldBillLines', 'BulkInvoiceRunCells', 'BulkInvoiceSkippedShops'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON "Distribution".%I', lower(left(t, 1)) || substr(t, 2) || 'Audit', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON "Distribution".%I FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"()',
                   lower(left(t, 1)) || substr(t, 2) || 'Audit', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Order bookings: stock check (first booked, first served across the selection), hold, conversion, cancel
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Distribution"."orderBookingCheckStock"("pIds" uuid[])
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vBk"     record;
  "vLine"   record;
  "vUsed"   jsonb := '{}'::jsonb;        -- warehouse:item → qty already promised to earlier bookings in this check
  "vKey"    text;
  "vAvail"  numeric(18,3);
  "vGive"   numeric(18,3);
  "vShort"  jsonb;
  "vCount"  integer;
BEGIN
  FOR "vBk" IN
    SELECT b.* FROM "Distribution"."OrderBookings" b
     WHERE b."tenantId" = "vTenant" AND b.id = ANY ("pIds")
     ORDER BY b."bookedAt", b."docNo"
     FOR UPDATE
  LOOP
    IF "vBk".status NOT IN ('NEW', 'CHECKED', 'HELD') THEN
      RAISE EXCEPTION 'Booking %: only a new, checked or held booking can be stock-checked (status %)', "vBk"."docNo", "vBk".status
        USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'BOOKING_NOT_OPEN';
    END IF;
    IF "vBk"."warehouseId" IS NULL THEN
      RAISE EXCEPTION 'Booking %: choose the warehouse the goods leave from', "vBk"."docNo" USING ERRCODE = 'not_null_violation';
    END IF;
    "vShort" := '[]'::jsonb;
    "vCount" := 0;
    FOR "vLine" IN
      SELECT l.id, l."itemId", l."baseQty", p.sku FROM "Distribution"."OrderBookingLines" l
        JOIN "Inventory"."Products" p ON p."tenantId" = l."tenantId" AND p.id = l."itemId"
       WHERE l."tenantId" = "vTenant" AND l."orderBookingId" = "vBk".id ORDER BY l."lineNo"
    LOOP
      "vKey" := "vBk"."warehouseId"::text || ':' || "vLine"."itemId"::text;
      SELECT COALESCE(sum(sb."qtyAvailable"), 0) INTO "vAvail"
        FROM "Inventory"."StockBalances" sb
       WHERE sb."tenantId" = "vTenant" AND sb."itemId" = "vLine"."itemId" AND sb."warehouseId" = "vBk"."warehouseId";
      "vAvail" := GREATEST("vAvail" - COALESCE(("vUsed" ->> "vKey")::numeric, 0), 0);
      "vGive" := LEAST("vAvail", "vLine"."baseQty");
      "vUsed" := "vUsed" || jsonb_build_object("vKey", COALESCE(("vUsed" ->> "vKey")::numeric, 0) + "vGive");
      UPDATE "Distribution"."OrderBookingLines" l SET "availableQty" = "vGive", "shortQty" = "vLine"."baseQty" - "vGive"
       WHERE l."tenantId" = "vTenant" AND l.id = "vLine".id;
      IF "vGive" < "vLine"."baseQty" THEN
        "vCount" := "vCount" + 1;
        "vShort" := "vShort" || jsonb_build_array(jsonb_build_object('itemId', "vLine"."itemId", 'sku', "vLine".sku, 'need', "vLine"."baseQty", 'have', "vGive"));
      END IF;
    END LOOP;
    UPDATE "Distribution"."OrderBookings" b
       SET status = CASE WHEN b.status = 'HELD' THEN 'HELD' ELSE 'CHECKED' END, "stockCheckedAt" = now(),
           "stockCheck" = jsonb_build_object('short', "vShort"), "shortLineCount" = "vCount"
     WHERE b."tenantId" = "vTenant" AND b.id = "vBk".id;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION "Distribution"."orderBookingHold"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Distribution"."OrderBookings";
BEGIN
  SELECT * INTO "vRow" FROM "Distribution"."OrderBookings" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OrderBookings % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status NOT IN ('CHECKED', 'HELD') THEN
    RAISE EXCEPTION 'Booking %: check stock before holding it', "vRow"."docNo" USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'BOOKING_STOCK_NOT_CHECKED';
  END IF;
  UPDATE "Distribution"."OrderBookings" t SET status = 'HELD' WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- After its wholesale invoice posted: invoiced / back-ordered split per line, back-orders for the shortages, status.
CREATE OR REPLACE FUNCTION "Distribution"."orderBookingConverted"("pId" uuid, "pInvoiceId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    "Distribution"."OrderBookings";
  "vShort"  integer;
BEGIN
  SELECT * INTO "vRow" FROM "Distribution"."OrderBookings" t WHERE t.id = "pId" AND t."tenantId" = "vTenant" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OrderBookings % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status NOT IN ('CHECKED', 'HELD') THEN
    RAISE EXCEPTION 'Booking %: only a checked or held booking can be converted (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'BOOKING_NOT_OPEN';
  END IF;
  UPDATE "Distribution"."OrderBookingLines" l
     SET "invoicedQty" = COALESCE(l."availableQty", 0), "backorderQty" = l."baseQty" - COALESCE(l."availableQty", 0)
   WHERE l."tenantId" = "vTenant" AND l."orderBookingId" = "pId";
  INSERT INTO "Distribution"."BackOrders" ("tenantId", "branchId", "sourceDocType", "sourceOrderBookingId", "sourceBookingLineId", "customerId", "routeId", "itemId",
                                           "backorderDate", "originalQty", "unitRate", "taxRate", status)
  SELECT "vTenant", "vRow"."branchId", 'BK', "pId", l.id, "vRow"."customerId", "vRow"."routeId", l."itemId", current_date, l."backorderQty", l.rate, l."taxRate", 'WAITING'
    FROM "Distribution"."OrderBookingLines" l
   WHERE l."tenantId" = "vTenant" AND l."orderBookingId" = "pId" AND l."backorderQty" > 0;
  GET DIAGNOSTICS "vShort" = ROW_COUNT;
  UPDATE "Distribution"."OrderBookings" t
     SET status = CASE WHEN "vShort" > 0 THEN 'PARTIAL' ELSE 'CONVERTED' END, "invoiceId" = "pInvoiceId", "convertedAt" = now(),
         "convertedByUserId" = "Company"."getCurrentUserId"()
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Distribution"."orderBookingCancel"("pId" uuid, "pReason" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Distribution"."OrderBookings";
BEGIN
  SELECT * INTO "vRow" FROM "Distribution"."OrderBookings" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OrderBookings % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status NOT IN ('NEW', 'CHECKED', 'HELD') THEN
    RAISE EXCEPTION 'Booking % is already invoiced (status %); void the invoice instead', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'BOOKING_NOT_OPEN';
  END IF;
  UPDATE "Distribution"."OrderBookings" t SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Held bills: recall into Quick Wholesale Entry, or discard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Distribution"."heldBillClose"("pId" uuid, "pStatus" text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Distribution"."HeldBills";
BEGIN
  IF "pStatus" NOT IN ('RECALLED', 'DISCARDED') THEN
    RAISE EXCEPTION 'A held bill is closed as RECALLED or DISCARDED' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT * INTO "vRow" FROM "Distribution"."HeldBills" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HeldBills % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status <> 'HELD' THEN
    RAISE EXCEPTION 'This held bill was already % ', lower("vRow".status) USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'HELD_BILL_NOT_OPEN';
  END IF;
  UPDATE "Distribution"."HeldBills" t
     SET status = "pStatus",
         "recalledAt" = CASE WHEN "pStatus" = 'RECALLED' THEN now() END,
         "recalledByUserId" = CASE WHEN "pStatus" = 'RECALLED' THEN "Company"."getCurrentUserId"() END
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Back-orders: allocate a goods receipt line, invoiced, cancelled
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Distribution"."triggerBackOrderStatus"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  "vPending" numeric := NEW."originalQty" - NEW."invoicedQty" - NEW."cancelledQty";
BEGIN
  NEW.status := CASE
    WHEN "vPending" = 0 AND NEW."cancelledQty" > 0 THEN 'CANCELLED'
    WHEN "vPending" = 0 THEN 'INVOICED'
    WHEN NEW."allocatedQty" = 0 THEN 'WAITING'
    WHEN NEW."allocatedQty" < "vPending" THEN 'PART_ALLOCATED'
    ELSE 'READY' END;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "backOrderStatus" ON "Distribution"."BackOrders";
CREATE TRIGGER "backOrderStatus" BEFORE INSERT OR UPDATE OF "originalQty", "invoicedQty", "cancelledQty", "allocatedQty" ON "Distribution"."BackOrders"
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerBackOrderStatus"();

-- Splits the free quantity of a goods receipt line over the item's open back-orders. Policy OLDEST (stored as FEFO:
-- oldest back-order first, earliest batch), PRIORITY (price tier allocation rank, then age) or PRO_RATA (share of the
-- unallocated pending quantity). pIds limits it to chosen back-orders. Returns the quantity allocated.
CREATE OR REPLACE FUNCTION "Distribution"."backOrderAllocate"("pGrnLineId" uuid, "pPolicy" text, "pIds" uuid[] DEFAULT NULL)
  RETURNS numeric
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vGl"     record;
  "vFree"   numeric(18,3);
  "vNeed"   numeric(18,3);
  "vLeft"   numeric(18,3);
  "vGive"   numeric(18,3);
  "vBo"     record;
  "vGroup"  uuid := gen_random_uuid();
  "vTotal"  numeric(18,3) := 0;
BEGIN
  IF "pPolicy" NOT IN ('FEFO', 'PRIORITY', 'PRO_RATA') THEN
    RAISE EXCEPTION 'Allocation policy must be FEFO, PRIORITY or PRO_RATA' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT gl.id, gl."grnId", gl."itemId", gl."batchId", gl."acceptedQty", g.status, g."docNo"
    INTO "vGl"
    FROM "Purchases"."GoodsReceivedNoteLines" gl
    JOIN "Purchases"."GoodsReceivedNotes" g ON g."tenantId" = gl."tenantId" AND g.id = gl."grnId"
   WHERE gl."tenantId" = "vTenant" AND gl.id = "pGrnLineId"
   FOR UPDATE OF gl;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goods receipt line % not found', "pGrnLineId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vGl".status <> 'POSTED' THEN
    RAISE EXCEPTION 'Goods receipt % is not posted yet: allocate once the stock has arrived', "vGl"."docNo"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'ALLOCATION_EXCEEDS_FREE_STOCK';
  END IF;
  SELECT "vGl"."acceptedQty" - COALESCE(sum(a.qty), 0) INTO "vFree"
    FROM "Distribution"."BackOrderAllocations" a
   WHERE a."tenantId" = "vTenant" AND a."grnLineId" = "pGrnLineId" AND a.status IN ('ALLOCATED', 'INVOICED');
  IF "vFree" <= 0 THEN
    RAISE EXCEPTION 'Nothing left to allocate on goods receipt %', "vGl"."docNo" USING ERRCODE = 'check_violation', HINT = 'ALLOCATION_EXCEEDS_FREE_STOCK';
  END IF;
  SELECT COALESCE(sum(b."pendingQty" - b."allocatedQty"), 0) INTO "vNeed"
    FROM "Distribution"."BackOrders" b
   WHERE b."tenantId" = "vTenant" AND b."itemId" = "vGl"."itemId" AND b.status IN ('WAITING', 'PART_ALLOCATED')
     AND ("pIds" IS NULL OR b.id = ANY ("pIds"));
  IF "vNeed" <= 0 THEN
    RETURN 0;
  END IF;
  "vLeft" := LEAST("vFree", "vNeed");
  FOR "vBo" IN
    SELECT b.id, b."pendingQty" - b."allocatedQty" AS want
      FROM "Distribution"."BackOrders" b
      LEFT JOIN "Distribution"."ShopRouteProfiles" sp ON sp."tenantId" = b."tenantId" AND sp."customerId" = b."customerId"
      LEFT JOIN "Distribution"."PriceTiers" pt ON pt."tenantId" = b."tenantId" AND pt.code = sp."priceTier"
     WHERE b."tenantId" = "vTenant" AND b."itemId" = "vGl"."itemId" AND b.status IN ('WAITING', 'PART_ALLOCATED')
       AND ("pIds" IS NULL OR b.id = ANY ("pIds"))
     ORDER BY CASE WHEN "pPolicy" = 'PRIORITY' THEN COALESCE(pt."allocationRank", 999) ELSE 0 END, b."backorderDate", b."createdAt"
     FOR UPDATE OF b
  LOOP
    EXIT WHEN "vLeft" <= 0;
    "vGive" := CASE WHEN "pPolicy" = 'PRO_RATA'
                    THEN LEAST("vBo".want, floor(LEAST("vFree", "vNeed") * "vBo".want / "vNeed"))
                    ELSE LEAST("vBo".want, "vLeft") END;
    IF "vGive" > 0 THEN
      INSERT INTO "Distribution"."BackOrderAllocations" ("tenantId", "backorderLineId", "allocationGroupId", "grnId", "grnLineId", "batchId", qty, policy, status, "allocatedByUserId")
      VALUES ("vTenant", "vBo".id, "vGroup", "vGl"."grnId", "pGrnLineId", "vGl"."batchId", "vGive", "pPolicy", 'ALLOCATED', "Company"."getCurrentUserId"());
      UPDATE "Distribution"."BackOrders" b SET "allocatedQty" = b."allocatedQty" + "vGive" WHERE b."tenantId" = "vTenant" AND b.id = "vBo".id;
      "vLeft" := "vLeft" - "vGive";
      "vTotal" := "vTotal" + "vGive";
    END IF;
  END LOOP;
  RETURN "vTotal";
END $function$;

-- After the back-order's allocated quantity was invoiced on pInvoiceId.
CREATE OR REPLACE FUNCTION "Distribution"."backOrderInvoiced"("pId" uuid, "pInvoiceId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    "Distribution"."BackOrders";
BEGIN
  SELECT * INTO "vRow" FROM "Distribution"."BackOrders" t WHERE t.id = "pId" AND t."tenantId" = "vTenant" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BackOrders % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow"."allocatedQty" <= 0 THEN
    RAISE EXCEPTION 'Nothing is allocated to this back-order yet' USING ERRCODE = 'check_violation', HINT = 'BACKORDER_NOTHING_ALLOCATED';
  END IF;
  UPDATE "Distribution"."BackOrderAllocations" a SET status = 'INVOICED', "invoiceId" = "pInvoiceId", "invoicedAt" = now()
   WHERE a."tenantId" = "vTenant" AND a."backorderLineId" = "pId" AND a.status = 'ALLOCATED';
  UPDATE "Distribution"."BackOrders" t
     SET "invoicedQty" = t."invoicedQty" + t."allocatedQty", "allocatedQty" = 0, "lastInvoiceId" = "pInvoiceId"
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Distribution"."backOrderCancel"("pId" uuid, "pReason" text, "pNote" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    "Distribution"."BackOrders";
BEGIN
  SELECT * INTO "vRow" FROM "Distribution"."BackOrders" t WHERE t.id = "pId" AND t."tenantId" = "vTenant" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BackOrders % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status NOT IN ('WAITING', 'PART_ALLOCATED', 'READY') THEN
    RAISE EXCEPTION 'This back-order is already %', lower("vRow".status) USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'BACKORDER_NOT_OPEN';
  END IF;
  UPDATE "Distribution"."BackOrderAllocations" a SET status = 'RELEASED', "releasedAt" = now()
   WHERE a."tenantId" = "vTenant" AND a."backorderLineId" = "pId" AND a.status = 'ALLOCATED';
  INSERT INTO "Distribution"."BackOrderCancellations" ("tenantId", "backorderLineId", "cancelledQty", reason, note, "cancelledByUserId")
  VALUES ("vTenant", "pId", "vRow"."pendingQty", "pReason", NULLIF(btrim("pNote"), ''), "Company"."getCurrentUserId"());
  UPDATE "Distribution"."BackOrders" t SET "allocatedQty" = 0, "cancelledQty" = t."cancelledQty" + t."pendingQty" WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('BOOKING_NOT_OPEN',              409, 'BUSINESS_RULE', 'SALES', 'This booking is no longer open.', 'Edit / check / convert / cancel of a converted or cancelled booking', true, NULL),
  ('BOOKING_STOCK_NOT_CHECKED',     409, 'BUSINESS_RULE', 'SALES', 'Check stock for this booking first.', 'Convert / hold before the stock check', true, NULL),
  ('BOOKING_NOT_YOURS',             403, 'PERMISSION',    'SALES', 'This booking is on a route you don''t book for.', 'Order booker acting on another route''s booking', true, NULL),
  ('HELD_BILL_NOT_OPEN',            409, 'BUSINESS_RULE', 'SALES', 'This held bill was already recalled or discarded.', 'Recall / discard of a closed held bill', true, NULL),
  ('BULK_RUN_NOT_DRAFT',            409, 'BUSINESS_RULE', 'SALES', 'This bulk invoice run was already generated.', 'Edit / generate of a completed run', true, NULL),
  ('BACKORDER_NOT_OPEN',            409, 'BUSINESS_RULE', 'SALES', 'This back-order is already invoiced or cancelled.', 'Cancel / invoice of a closed back-order', true, NULL),
  ('BACKORDER_NOTHING_ALLOCATED',   409, 'BUSINESS_RULE', 'SALES', 'Allocate arriving stock to these back-orders before invoicing them.', 'Invoice of back-orders with no allocation', true, NULL),
  ('ALLOCATION_EXCEEDS_FREE_STOCK', 409, 'BUSINESS_RULE', 'SALES', 'There is no free stock left on this goods receipt.', 'Allocation above the receipt''s free quantity', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
