-- Phase 23 — Sales documents: numbering (QT, SO, DC, INV, SV), quotation send / accept / reject, sales order
-- approval with credit check and stock reservations, delivery challan dispatch (stock out at cost → GDNI) and delivery,
-- sales invoice posting pre-checks with error codes, FEFO stock issue across batches, challans marked invoiced, order
-- roll-ups, FBR submission queued on posting (sent by Phase 28), audit triggers, error codes. Idempotent.
SELECT set_config('app.actorLabel', '301-sales-documents.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Numbering: QT, SO, DC, INV, SV (counter sales voucher) for every company and every new one
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."seedSalesDocDefaultsFor"("pTenant" uuid)
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
   WHERE d.code IN ('QT', 'SO', 'DC', 'INV', 'SV')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "Sales"."triggerTenantSalesDocDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Sales"."seedSalesDocDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsSalesDocDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsSalesDocDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerTenantSalesDocDefaults"();

SELECT set_config('app.actorLabel', 'seedSalesDocDefaultsFor', false);
SELECT "Sales"."seedSalesDocDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '301-sales-documents.sql', false);

-- ---------------------------------------------------------------------------
-- 2. Row history on the tables that had none
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "quotationLinesAudit" ON "Sales"."QuotationLines";
CREATE TRIGGER "quotationLinesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Sales"."QuotationLines" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "salesOrderLinesAudit" ON "Sales"."SalesOrderLines";
CREATE TRIGGER "salesOrderLinesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Sales"."SalesOrderLines" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "stockReservationsAudit" ON "Inventory"."StockReservations";
CREATE TRIGGER "stockReservationsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."StockReservations" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "fbrInvoiceSubmissionsAudit" ON "Tax"."FbrInvoiceSubmissions";
CREATE TRIGGER "fbrInvoiceSubmissionsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Tax"."FbrInvoiceSubmissions" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 3. Lookups: rejected quotations, orders waiting for approval / closed short, the sales invoice approval subject
-- ---------------------------------------------------------------------------
INSERT INTO "Lookups"."Lookups" ("lookupType", code, label, tone, "sortOrder", "isActive", "isSystem", "tenantId")
SELECT v.t, v.c, v.l, v.tone, v.s, true, true, NULL
  FROM (VALUES ('QuotationStatus', 'REJECTED', 'Rejected', 'danger', 7),
               ('SalesOrderStatus', 'PENDING_APPROVAL', 'Pending approval', 'warn', 2),
               ('SalesOrderStatus', 'CLOSED', 'Closed', 'neutral', 9),
               ('Subject', 'SALES_INVOICE', 'Sales invoice', 'neutral', 20)) v(t, c, l, tone, s)
 WHERE NOT EXISTS (SELECT 1 FROM "Lookups"."Lookups" x WHERE x."lookupType" = v.t AND x.code = v.c AND x."tenantId" IS NULL);

-- a new order starts as a draft (the template default was CONFIRMED, which made it uneditable)
ALTER TABLE "Sales"."SalesOrders" ALTER COLUMN status SET DEFAULT 'DRAFT';

-- ---------------------------------------------------------------------------
-- 4. Quotations: send, accept, reject
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."quotationSend"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Sales"."Quotations";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."Quotations" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotations % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'SENT' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Quotation %: cannot send from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'QUOTATION_NOT_EDITABLE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Sales"."QuotationLines" l WHERE l."tenantId" = "vRow"."tenantId" AND l."quotationId" = "pId") THEN
    RAISE EXCEPTION 'Quotation %: add at least one line', "vRow"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  UPDATE "Sales"."Quotations" t SET status = 'SENT', "sentAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Sales"."quotationAccept"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Sales"."Quotations";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."Quotations" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotations % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status IN ('ACCEPTED', 'CONVERTED') THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'SENT' THEN
    RAISE EXCEPTION 'Quotation %: only a sent quotation can be accepted (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'QUOTATION_NOT_OPEN';
  END IF;
  IF "vRow"."validTill" < current_date THEN
    RAISE EXCEPTION 'Quotation % expired on %: revise it', "vRow"."docNo", "vRow"."validTill"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'QUOTATION_EXPIRED';
  END IF;
  UPDATE "Sales"."Quotations" t SET status = 'ACCEPTED', "acceptedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Sales"."quotationReject"("pId" uuid, "pReason" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Sales"."Quotations";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."Quotations" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotations % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'REJECTED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status NOT IN ('SENT', 'ACCEPTED') THEN
    RAISE EXCEPTION 'Quotation %: only a sent or accepted quotation can be rejected (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'QUOTATION_NOT_OPEN';
  END IF;
  UPDATE "Sales"."Quotations" t
     SET status = 'REJECTED',
         remarks = concat_ws(E'\n', NULLIF(t.remarks, ''), 'Rejected: ' || NULLIF(btrim("pReason"), ''))
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Sales orders: status and stock reservations follow the lines' delivered / invoiced quantities
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."salesOrderRefresh"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vSo"     "Sales"."SalesOrders";
  "vStatus" text;
  "vAllInv" boolean;
  "vAllDel" boolean;
  "vAnyDel" boolean;
BEGIN
  SELECT * INTO "vSo" FROM "Sales"."SalesOrders" o WHERE o."tenantId" = "vTenant" AND o.id = "pId";
  IF NOT FOUND THEN
    RETURN;
  END IF;
  "vStatus" := "vSo".status;
  IF "vSo".status IN ('CONFIRMED', 'PARTIALLY_DELIVERED', 'TO_INVOICE', 'INVOICED') THEN
    SELECT COALESCE(bool_and(l."invoicedQty" >= l."baseQty" + l."bonusQty"), false),
           COALESCE(bool_and(l."deliveredQty" >= l."baseQty" + l."bonusQty"), false),
           COALESCE(bool_or(l."deliveredQty" > 0 OR l."invoicedQty" > 0), false)
      INTO "vAllInv", "vAllDel", "vAnyDel"
      FROM "Sales"."SalesOrderLines" l
     WHERE l."tenantId" = "vTenant" AND l."salesOrderId" = "pId";
    "vStatus" := CASE WHEN "vAllInv" THEN 'INVOICED' WHEN "vAllDel" THEN 'TO_INVOICE'
                      WHEN "vAnyDel" THEN 'PARTIALLY_DELIVERED' ELSE 'CONFIRMED' END;
    IF "vStatus" IS DISTINCT FROM "vSo".status THEN
      UPDATE "Sales"."SalesOrders" o SET status = "vStatus" WHERE o."tenantId" = "vTenant" AND o.id = "pId";
    END IF;
  END IF;
  -- reservations: close the active ones, then reserve what is still to deliver on an open order
  UPDATE "Inventory"."StockReservations" r
     SET status = CASE WHEN l."deliveredQty" >= l."baseQty" + l."bonusQty" THEN 'FULFILLED' ELSE 'RELEASED' END,
         "closedAt" = now()
    FROM "Sales"."SalesOrderLines" l
   WHERE r."tenantId" = "vTenant" AND r."salesOrderId" = "pId" AND r.status = 'ACTIVE'
     AND l."tenantId" = r."tenantId" AND l.id = r."salesOrderLineId";
  UPDATE "Inventory"."StockReservations" r SET status = 'RELEASED', "closedAt" = now()
   WHERE r."tenantId" = "vTenant" AND r."salesOrderId" = "pId" AND r.status = 'ACTIVE';
  IF "vStatus" IN ('CONFIRMED', 'PARTIALLY_DELIVERED') AND "vSo"."reserveStock" AND "vSo"."warehouseId" IS NOT NULL THEN
    INSERT INTO "Inventory"."StockReservations" ("tenantId", "itemId", "warehouseId", qty, "salesOrderId", "salesOrderLineId", status, "reservedAt")
    SELECT "vTenant", l."itemId", "vSo"."warehouseId", l."baseQty" + l."bonusQty" - l."deliveredQty", "pId", l.id, 'ACTIVE', now()
      FROM "Sales"."SalesOrderLines" l
     WHERE l."tenantId" = "vTenant" AND l."salesOrderId" = "pId" AND l."itemId" IS NOT NULL
       AND l."baseQty" + l."bonusQty" - l."deliveredQty" > 0;
  END IF;
END $function$;

-- Confirms an order (direct approval or the approval engine's final step): lines, warehouse, customer active, credit.
CREATE OR REPLACE FUNCTION "Sales"."salesOrderConfirm"("pId" uuid, "pAllowOverLimit" boolean DEFAULT false)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    "Sales"."SalesOrders";
  "vCr"     record;
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."SalesOrders" t WHERE t.id = "pId" AND t."tenantId" = "vTenant" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SalesOrders % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CONFIRMED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'Sales order %: cannot confirm from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'SALES_ORDER_NOT_EDITABLE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Sales"."SalesOrderLines" l WHERE l."tenantId" = "vTenant" AND l."salesOrderId" = "pId") THEN
    RAISE EXCEPTION 'Sales order %: add at least one line', "vRow"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  IF "vRow"."warehouseId" IS NULL THEN
    RAISE EXCEPTION 'Sales order %: choose the warehouse the goods ship from', "vRow"."docNo" USING ERRCODE = 'not_null_violation';
  END IF;
  SELECT e.status, e."holdReason", e."blockOverLimit", e."effectiveLimit", e.balance, e."openOrdersAmount", e."customerName"
    INTO "vCr"
    FROM "Sales"."getCustomerCreditExposure" e
   WHERE e."tenantId" = "vTenant" AND e."customerId" = "vRow"."customerId";
  IF "vCr".status = 'INACTIVE' THEN
    RAISE EXCEPTION 'Customer % is inactive', "vCr"."customerName" USING ERRCODE = 'check_violation', HINT = 'CUSTOMER_INACTIVE';
  END IF;
  IF NOT "pAllowOverLimit" THEN
    IF "vCr".status = 'ON_HOLD' THEN
      RAISE EXCEPTION 'Customer % is on credit hold (%)', "vCr"."customerName", COALESCE("vCr"."holdReason", 'hold')
        USING ERRCODE = 'check_violation', HINT = 'CUSTOMER_ON_HOLD';
    END IF;
    IF "vCr"."blockOverLimit" AND COALESCE("vCr"."effectiveLimit", 0) > 0
       AND COALESCE("vCr".balance, 0) + COALESCE("vCr"."openOrdersAmount", 0) + "vRow"."netAmount" > "vCr"."effectiveLimit" THEN
      RAISE EXCEPTION 'Credit limit exceeded for %: balance % + open orders % + this order % > limit %',
        "vCr"."customerName", COALESCE("vCr".balance, 0), COALESCE("vCr"."openOrdersAmount", 0), "vRow"."netAmount", "vCr"."effectiveLimit"
        USING ERRCODE = 'check_violation', HINT = 'CREDIT_LIMIT_EXCEEDED';
    END IF;
  END IF;
  UPDATE "Sales"."SalesOrders" t SET status = 'CONFIRMED', "confirmedAt" = now() WHERE t.id = "pId";
  PERFORM "Sales"."salesOrderRefresh"("pId");
  RETURN "pId";
END $function$;

-- Closes an open order short: nothing more is delivered, reservations are released.
CREATE OR REPLACE FUNCTION "Sales"."salesOrderClose"("pId" uuid, "pReason" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Sales"."SalesOrders";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."SalesOrders" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SalesOrders % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CLOSED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status NOT IN ('CONFIRMED', 'PARTIALLY_DELIVERED') THEN
    RAISE EXCEPTION 'Sales order %: only a confirmed or partly delivered order can be closed (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'SALES_ORDER_NOT_OPEN';
  END IF;
  IF EXISTS (SELECT 1 FROM "Sales"."DeliveryChallans" d WHERE d."tenantId" = "vRow"."tenantId" AND d."salesOrderId" = "pId" AND d.status = 'PACKED') THEN
    RAISE EXCEPTION 'Sales order %: dispatch or cancel its packed challans first', "vRow"."docNo"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'SALES_ORDER_HAS_OPEN_CHALLANS';
  END IF;
  UPDATE "Sales"."SalesOrders" t
     SET status = 'CLOSED', remarks = concat_ws(E'\n', NULLIF(t.remarks, ''), 'Closed: ' || NULLIF(btrim("pReason"), ''))
   WHERE t.id = "pId";
  PERFORM "Sales"."salesOrderRefresh"("pId");
  RETURN "pId";
END $function$;

-- Called by Sales.salesOrderCancel: an order with deliveries or invoices can't be cancelled; reservations released.
CREATE OR REPLACE FUNCTION "Sales"."salesOrderCancelEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
BEGIN
  IF EXISTS (SELECT 1 FROM "Sales"."SalesOrderLines" l WHERE l."tenantId" = "vTenant" AND l."salesOrderId" = "pId" AND (l."deliveredQty" > 0 OR l."invoicedQty" > 0))
     OR EXISTS (SELECT 1 FROM "Sales"."DeliveryChallans" d WHERE d."tenantId" = "vTenant" AND d."salesOrderId" = "pId" AND d.status <> 'CANCELLED') THEN
    RAISE EXCEPTION 'This sales order has deliveries or invoices; close it instead of cancelling'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'SALES_ORDER_NOT_CANCELLABLE';
  END IF;
  UPDATE "Inventory"."StockReservations" r SET status = 'RELEASED', "closedAt" = now()
   WHERE r."tenantId" = "vTenant" AND r."salesOrderId" = "pId" AND r.status = 'ACTIVE';
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Delivery challans: only against an open order; dispatch issues the stock at cost (Dr GDNI / Cr inventory);
--    the invoice later moves GDNI to cost of sales
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."triggerChallanOrderOpen"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vSo" record;
BEGIN
  SELECT o."docNo", o.status, o."customerId" INTO "vSo"
    FROM "Sales"."SalesOrders" o WHERE o."tenantId" = NEW."tenantId" AND o.id = NEW."salesOrderId";
  IF NOT FOUND OR "vSo".status NOT IN ('CONFIRMED', 'PARTIALLY_DELIVERED') THEN
    RAISE EXCEPTION 'Goods can only be delivered against a confirmed, open sales order (% is %)', COALESCE("vSo"."docNo", '?'), COALESCE("vSo".status, 'missing')
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'CHALLAN_ORDER_NOT_OPEN';
  END IF;
  IF "vSo"."customerId" IS DISTINCT FROM NEW."customerId" THEN
    RAISE EXCEPTION 'The challan customer must be the sales order customer' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "challanOrderOpen" ON "Sales"."DeliveryChallans";
CREATE TRIGGER "challanOrderOpen" BEFORE INSERT OR UPDATE OF "salesOrderId", "customerId" ON "Sales"."DeliveryChallans"
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerChallanOrderOpen"();

CREATE OR REPLACE FUNCTION "Sales"."deliveryChallanDispatchEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vDc"     record;
  "vLine"   record;
  "vCost"   numeric(18,2);
  "vTotal"  numeric(18,2) := 0;
  "vQty"    numeric(18,3) := 0;
  "vJournal" uuid;
BEGIN
  SELECT d.*, c.name AS "customerName" INTO "vDc"
    FROM "Sales"."DeliveryChallans" d
    JOIN "Sales"."Customers" c ON c."tenantId" = d."tenantId" AND c.id = d."customerId"
   WHERE d."tenantId" = "vTenant" AND d.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery challan % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Sales"."DeliveryChallanLines" l WHERE l."tenantId" = "vTenant" AND l."deliveryChallanId" = "pId" AND l."baseQty" > 0) THEN
    RAISE EXCEPTION 'Delivery challan %: nothing to deliver', "vDc"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  FOR "vLine" IN
    SELECT l.id, l."lineNo", l."itemId", l."batchId", l."baseQty", l."salesOrderLineId",
           ol."baseQty" + ol."bonusQty" - ol."deliveredQty" AS "openQty"
      FROM "Sales"."DeliveryChallanLines" l
      JOIN "Sales"."SalesOrderLines" ol ON ol."tenantId" = l."tenantId" AND ol.id = l."salesOrderLineId"
     WHERE l."tenantId" = "vTenant" AND l."deliveryChallanId" = "pId" AND l."baseQty" > 0
     ORDER BY l."lineNo"
     FOR UPDATE OF ol
  LOOP
    IF "vLine"."baseQty" > "vLine"."openQty" THEN
      RAISE EXCEPTION 'Delivery challan % line %: % is more than the % still open on the order', "vDc"."docNo", "vLine"."lineNo", "vLine"."baseQty", "vLine"."openQty"
        USING ERRCODE = 'check_violation', HINT = 'OVER_DELIVERY';
    END IF;
    "vCost" := round("Inventory"."stockIssue"(jsonb_build_object(
      'itemId', "vLine"."itemId", 'warehouseId', "vDc"."warehouseId", 'batchId', "vLine"."batchId", 'qtyOut', "vLine"."baseQty",
      'movementType', 'SALE', 'movementDate', "vDc"."docDate",
      'sourceDocType', 'DC', 'sourceDocId', "pId", 'sourceDocNo', "vDc"."docNo",
      'sourceLineId', "vLine".id, 'partyLabel', "vDc"."customerName")), 2);
    UPDATE "Sales"."DeliveryChallanLines" l
       SET "unitCost" = round("vCost" / "vLine"."baseQty", 4), "costAmount" = "vCost"
     WHERE l."tenantId" = "vTenant" AND l.id = "vLine".id;
    UPDATE "Sales"."SalesOrderLines" ol SET "deliveredQty" = ol."deliveredQty" + "vLine"."baseQty"
     WHERE ol."tenantId" = "vTenant" AND ol.id = "vLine"."salesOrderLineId";
    "vTotal" := "vTotal" + "vCost";
    "vQty" := "vQty" + "vLine"."baseQty";
  END LOOP;
  UPDATE "Sales"."DeliveryChallans" d SET "costAmount" = "vTotal", "totalQty" = "vQty"
   WHERE d."tenantId" = "vTenant" AND d.id = "pId";
  IF "vTotal" > 0 THEN
    "vJournal" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vDc"."docDate", 'postingDate', "vDc"."docDate",
                         'branchId', "vDc"."branchId", 'narration', 'Goods dispatched on ' || "vDc"."docNo" || ' · ' || "vDc"."customerName",
                         'sourceDocType', 'DC', 'sourceDocId', "pId", 'sourceDocNo', "vDc"."docNo", 'partyName', "vDc"."customerName"),
      jsonb_build_array(
        jsonb_build_object('accountRole', 'GDNI', 'debit', "vTotal", 'particulars', 'Delivered not invoiced ' || "vDc"."docNo"),
        jsonb_build_object('accountRole', 'INVENTORY', 'credit', "vTotal", 'particulars', 'Stock dispatched ' || "vDc"."docNo")));
    UPDATE "Sales"."DeliveryChallans" d SET "journalEntryId" = "vJournal" WHERE d."tenantId" = "vTenant" AND d.id = "pId";
  END IF;
  PERFORM "Sales"."salesOrderRefresh"("vDc"."salesOrderId");
END $function$;

CREATE OR REPLACE FUNCTION "Sales"."deliveryChallanDispatch"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Sales"."DeliveryChallans";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."DeliveryChallans" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DeliveryChallans % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'DISPATCHED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'PACKED' THEN
    RAISE EXCEPTION 'Delivery challan %: cannot dispatch from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'CHALLAN_NOT_EDITABLE';
  END IF;
  PERFORM "Sales"."deliveryChallanDispatchEntries"("pId");
  UPDATE "Sales"."DeliveryChallans" t SET status = 'DISPATCHED', "dispatchedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Sales"."deliveryChallanDeliver"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Sales"."DeliveryChallans";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."DeliveryChallans" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DeliveryChallans % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'DELIVERED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'DISPATCHED' THEN
    RAISE EXCEPTION 'Delivery challan %: only a dispatched challan can be marked delivered (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'CHALLAN_NOT_DISPATCHED';
  END IF;
  UPDATE "Sales"."DeliveryChallans" t SET status = 'DELIVERED', "deliveredAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- cancelling a dispatched challan reverses stock / journal / delivered qty (template), then refreshes the order
CREATE OR REPLACE FUNCTION "Sales"."deliveryChallanCancelEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vDc"     record;
  "vRef"    text;
BEGIN
  SELECT d.* INTO "vDc" FROM "Sales"."DeliveryChallans" d WHERE d."tenantId" = "vTenant" AND d.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery challan % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vDc".status = 'INVOICED' THEN
    SELECT i."docNo" INTO "vRef" FROM "Sales"."SalesInvoices" i
     WHERE i."tenantId" = "vTenant" AND i.id = "vDc"."invoiceId" AND i.status <> 'VOID';
    IF "vRef" IS NOT NULL THEN
      RAISE EXCEPTION 'Delivery challan % is invoiced on %: void the invoice first', "vDc"."docNo", "vRef"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF "vDc".status = 'PACKED' AND "vDc"."dispatchedAt" IS NULL THEN
    RETURN;                                           -- nothing left the warehouse
  END IF;

  PERFORM "Accounting"."journalReverseForSource"('DC', "pId", 'OTHER', current_date);
  PERFORM "Sales"."voucherReverseIfPosted"("vDc"."journalEntryId", current_date, 'Cancel of ' || "vDc"."docNo");
  PERFORM "Sales"."stockReverseForSource"('DC', "pId", current_date, 'Cancel of ' || "vDc"."docNo");

  UPDATE "Sales"."SalesOrderLines" ol
     SET "deliveredQty" = GREATEST(ol."deliveredQty" - x.qty, 0)
    FROM (SELECT dl."salesOrderLineId", sum(dl."baseQty") AS qty
            FROM "Sales"."DeliveryChallanLines" dl
           WHERE dl."tenantId" = "vTenant" AND dl."deliveryChallanId" = "pId"
           GROUP BY dl."salesOrderLineId") x
   WHERE ol."tenantId" = "vTenant" AND ol.id = x."salesOrderLineId";
  PERFORM "Sales"."salesOrderRefresh"("vDc"."salesOrderId");   -- Phase 23: order status and reservations follow
END $function$;

-- ---------------------------------------------------------------------------
-- 7. Sales invoices: stock issue across batches (FEFO), posting pre-checks with error codes, challans → INVOICED,
--    order roll-ups, FBR submission queued (PENDING) when the company reports to FBR / PRA on posting
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."salesInvoicePostEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant"     uuid := "Company"."getCurrentTenantId"();
  "vInv"        record;
  "vCust"       record;
  "vPos"        record;
  "vLine"       record;
  "vRow"        record;
  "vTaxCode"    record;
  "vDocType"    text;
  "vFx"         numeric(18,6);
  "vLines"      jsonb := '[]'::jsonb;
  "vRevenue"    numeric(18,2) := 0;
  "vAmount"     numeric(18,2);
  "vCogs"       numeric(18,2) := 0;
  "vGdni"       numeric(18,2) := 0;
  "vIssue"      boolean;
  "vWarehouse"  uuid;
  "vBatch"      uuid;
  "vMoveId"     uuid;
  "vUnitCost"   numeric(18,4);
  "vQty"        numeric(18,3);
  "vCost"       numeric(18,2);
  "vJournal"    uuid;
  "vLineCount"  integer;
  "vSumTaxable" numeric(18,2);
  "vSumTax"     numeric(18,2);
  "vParty"      text;
BEGIN
  SELECT i.* INTO "vInv" FROM "Sales"."SalesInvoices" i WHERE i."tenantId" = "vTenant" AND i.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales invoice % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  "vDocType" := "Sales"."getInvoiceDocType"("vInv".channel);
  "vFx"      := COALESCE("vInv"."fxRate", 1);
  "vParty"   := "vInv"."buyerName";

  -- 1. preconditions -----------------------------------------------------------
  SELECT count(*), COALESCE(sum(l."taxableAmount"), 0), COALESCE(sum(l."taxAmount"), 0)
    INTO "vLineCount", "vSumTaxable", "vSumTax"
    FROM "Sales"."SalesInvoiceLines" l
   WHERE l."tenantId" = "vTenant" AND l."invoiceId" = "pId";
  IF "vLineCount" = 0 THEN
    RAISE EXCEPTION 'Sales invoice %: add at least one line before posting', "vInv"."docNo"
      USING ERRCODE = 'check_violation';
  END IF;
  IF "vSumTaxable" <> "vInv"."taxableAmount" OR "vSumTax" <> "vInv"."taxAmount" THEN
    RAISE EXCEPTION 'Sales invoice %: header totals (taxable %, GST %) do not match the lines (taxable %, GST %); save the invoice again',
      "vInv"."docNo", "vInv"."taxableAmount", "vInv"."taxAmount", "vSumTaxable", "vSumTax"
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.name, c.status, c."holdReason", c."receivableAccountId", c."blockOverLimit", c."atlStatus"
    INTO "vCust"
    FROM "Sales"."Customers" c
   WHERE c."tenantId" = "vTenant" AND c.id = "vInv"."customerId";
  IF "vCust".status = 'INACTIVE' THEN
    RAISE EXCEPTION 'Customer % is inactive: activate the customer before posting %', "vCust".name, "vInv"."docNo"
      USING ERRCODE = 'check_violation';
  END IF;

  -- credit control (credit channels; an APPROVED credit override lets it through)
  IF "vInv"."creditOverrideId" IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM "Sales"."CreditOverrides" co
                    WHERE co."tenantId" = "vTenant" AND co.id = "vInv"."creditOverrideId"
                      AND co."customerId" = "vInv"."customerId" AND co.status = 'APPROVED') THEN
      RAISE EXCEPTION 'Sales invoice %: the linked credit override is not approved', "vInv"."docNo"
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF "vInv".channel IN ('STANDARD','WHOLESALE') THEN
    IF "vCust".status = 'ON_HOLD' THEN
      RAISE EXCEPTION 'Customer % is on credit hold (%): request a credit override to post %',
        "vCust".name, COALESCE("vCust"."holdReason", 'hold'), "vInv"."docNo"
        USING ERRCODE = 'check_violation';
    END IF;
    IF "vCust"."blockOverLimit" THEN
      SELECT cp."effectiveLimit", cp.balance INTO "vRow"
        FROM "Sales"."getCustomerCreditPosition" cp
       WHERE cp."tenantId" = "vTenant" AND cp."customerId" = "vInv"."customerId";
      IF COALESCE("vRow"."effectiveLimit", 0) > 0
         AND COALESCE("vRow".balance, 0) + round("vInv"."netAmount" * "vFx", 2) > "vRow"."effectiveLimit" THEN
        RAISE EXCEPTION 'Credit limit exceeded for %: balance % + invoice % > limit %. Request a credit override.',
          "vCust".name, COALESCE("vRow".balance, 0), round("vInv"."netAmount" * "vFx", 2), "vRow"."effectiveLimit"
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- 2. stock and cost per line ---------------------------------------------------
  "vIssue" := "vInv"."stockIssueMode" IS DISTINCT FROM 'AT_DISPATCH';
  "vWarehouse" := "vInv"."warehouseId";
  IF "vWarehouse" IS NULL AND "vInv"."posShiftId" IS NOT NULL THEN
    SELECT s."warehouseId" INTO "vWarehouse"
      FROM "Sales"."PosShifts" s WHERE s."tenantId" = "vTenant" AND s.id = "vInv"."posShiftId";
  END IF;

  FOR "vLine" IN
    SELECT l.id, l."lineNo", l."itemId", l."batchId", l."baseQty", l."bonusQty", l."deliveryChallanLineId",
           p.name AS "itemName", p."trackExpiry"
      FROM "Sales"."SalesInvoiceLines" l
      LEFT JOIN "Inventory"."Products" p ON p."tenantId" = l."tenantId" AND p.id = l."itemId"
     WHERE l."tenantId" = "vTenant" AND l."invoiceId" = "pId" AND l."itemId" IS NOT NULL
     ORDER BY l."lineNo"
  LOOP
    "vQty" := "vLine"."baseQty" + "vLine"."bonusQty";
    IF "vLine"."deliveryChallanLineId" IS NOT NULL THEN
      -- goods already left with the challan (Dr GDNI at dispatch): only move the cost to COGS
      SELECT COALESCE(dl."unitCost", CASE WHEN dl."baseQty" > 0 THEN dl."costAmount" / dl."baseQty" END, 0)
        INTO "vUnitCost"
        FROM "Sales"."DeliveryChallanLines" dl
       WHERE dl."tenantId" = "vTenant" AND dl.id = "vLine"."deliveryChallanLineId";
      "vUnitCost" := COALESCE("vUnitCost", 0);
      "vCost" := round("vQty" * "vUnitCost", 2);
      "vGdni" := "vGdni" + "vCost";
      UPDATE "Sales"."SalesInvoiceLines" l
         SET "unitCost" = "vUnitCost", "costAmount" = "vCost"
       WHERE l."tenantId" = "vTenant" AND l.id = "vLine".id;
    ELSIF "vIssue" THEN
      IF "vWarehouse" IS NULL THEN
        RAISE EXCEPTION 'Sales invoice %: choose the warehouse the goods leave from', "vInv"."docNo"
          USING ERRCODE = 'not_null_violation';
      END IF;
      -- FEFO across batches (Inventory.stockIssue, Phase 21); a picked batch is issued as is
      "vCost" := round("Inventory"."stockIssue"(jsonb_build_object(
        'itemId', "vLine"."itemId", 'warehouseId', "vWarehouse", 'batchId', "vLine"."batchId", 'qtyOut', "vQty",
        'movementType', 'SALE', 'movementDate', "vInv"."docDate",
        'sourceDocType', "vDocType", 'sourceDocId', "pId", 'sourceDocNo', "vInv"."docNo",
        'sourceLineId', "vLine".id, 'partyLabel', "vParty")), 2);
      "vUnitCost" := round("vCost" / "vQty", 4);
      "vCogs" := "vCogs" + "vCost";
      UPDATE "Sales"."SalesInvoiceLines" l
         SET "unitCost" = "vUnitCost", "costAmount" = "vCost"
       WHERE l."tenantId" = "vTenant" AND l.id = "vLine".id;
    END IF;
  END LOOP;

  UPDATE "Sales"."SalesInvoices" i SET "costAmount" = "vCogs" + "vGdni"
   WHERE i."tenantId" = "vTenant" AND i.id = "pId";

  -- 3. journal -------------------------------------------------------------------
  FOR "vRow" IN
    SELECT l."revenueAccountId" AS "accountId", sum(l."taxableAmount") AS amount
      FROM "Sales"."SalesInvoiceLines" l
     WHERE l."tenantId" = "vTenant" AND l."invoiceId" = "pId"
     GROUP BY l."revenueAccountId"
  LOOP
    "vAmount" := round("vRow".amount * "vFx", 2);
    "vRevenue" := "vRevenue" + "vAmount";
    "vLines" := "vLines" || jsonb_build_array(jsonb_build_object(
      'accountId', "vRow"."accountId", 'accountRole', 'SALES_REVENUE', 'credit', "vAmount",
      'particulars', 'Sales ' || "vInv"."docNo"));
  END LOOP;

  FOR "vRow" IN
    SELECT tc."accountId", sum(l."taxAmount") AS amount
      FROM "Sales"."SalesInvoiceLines" l
      LEFT JOIN "Tax"."TaxCodes" tc ON tc."tenantId" = l."tenantId" AND tc.id = l."taxCodeId"
     WHERE l."tenantId" = "vTenant" AND l."invoiceId" = "pId" AND l."taxAmount" > 0
     GROUP BY tc."accountId"
  LOOP
    "vAmount" := round("vRow".amount * "vFx", 2);
    "vRevenue" := "vRevenue" + "vAmount";
    "vLines" := "vLines" || jsonb_build_array(jsonb_build_object(
      'accountId', "vRow"."accountId", 'accountRole', 'OUTPUT_GST', 'credit', "vAmount",
      'particulars', 'Output sales tax ' || "vInv"."docNo"));
  END LOOP;

  "vAmount" := round("vInv"."furtherTaxAmount" * "vFx", 2);
  IF "vAmount" > 0 THEN
    "vRevenue" := "vRevenue" + "vAmount";
    "vLines" := "vLines" || jsonb_build_array(jsonb_build_object(
      'accountRole', 'FURTHER_TAX_PAYABLE', 'credit', "vAmount", 'particulars', 'Further tax ' || "vInv"."docNo"));
  END IF;
  "vAmount" := round("vInv"."advanceTaxAmount" * "vFx", 2);
  IF "vAmount" > 0 THEN
    "vRevenue" := "vRevenue" + "vAmount";
    "vLines" := "vLines" || jsonb_build_array(jsonb_build_object(
      'accountRole', 'ADVANCE_TAX_COLLECTED', 'credit', "vAmount", 'particulars', 'Advance tax collected ' || "vInv"."docNo"));
  END IF;
  "vAmount" := round("vInv"."fbrServiceFee" * "vFx", 2);
  IF "vAmount" > 0 THEN
    "vRevenue" := "vRevenue" + "vAmount";
    "vLines" := "vLines" || jsonb_build_array(jsonb_build_object(
      'accountRole', 'FBR_POS_FEE', 'credit', "vAmount", 'particulars', 'FBR POS service fee ' || "vInv"."docNo"));
  END IF;

  -- AR = sum of the credits (base-currency rounding stays balanced)
  IF "vRevenue" > 0 THEN
    "vLines" := jsonb_build_array(jsonb_build_object(
      'accountId', "vCust"."receivableAccountId", 'accountRole', 'AR_CONTROL', 'debit', "vRevenue",
      'customerId', "vInv"."customerId", 'particulars', "vInv"."docNo" || ' · ' || "vParty")) || "vLines";
  END IF;
  IF "vCogs" + "vGdni" > 0 THEN
    "vLines" := "vLines" || jsonb_build_array(
      jsonb_build_object('accountRole', 'COGS', 'debit', "vCogs" + "vGdni", 'particulars', 'Cost of sales ' || "vInv"."docNo"),
      jsonb_build_object('accountRole', 'INVENTORY', 'credit', "vCogs", 'particulars', 'Stock issued ' || "vInv"."docNo"),
      jsonb_build_object('accountRole', 'GDNI', 'credit', "vGdni", 'particulars', 'Delivered on challan ' || "vInv"."docNo"));
  END IF;

  IF "vRevenue" + "vCogs" + "vGdni" > 0 THEN
    "vJournal" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vInv"."docDate", 'postingDate', "vInv"."docDate",
                         'branchId', "vInv"."branchId", 'narration', 'Sales invoice ' || "vInv"."docNo" || ' · ' || "vParty",
                         'sourceDocType', "vDocType", 'sourceDocId', "pId", 'sourceDocNo', "vInv"."docNo",
                         'partyName', "vParty", 'currencyCode', "vInv"."currencyCode", 'fxRate', "vFx"),
      "vLines");
    UPDATE "Sales"."SalesInvoices" i SET "journalEntryId" = "vJournal"
     WHERE i."tenantId" = "vTenant" AND i.id = "pId";
  END IF;

  -- 4. sales order roll-up (invoiced; delivered when this invoice issued the goods)
  IF EXISTS (
      SELECT 1
        FROM (SELECT l."salesOrderLineId", sum(l."baseQty" + l."bonusQty") AS qty
                FROM "Sales"."SalesInvoiceLines" l
               WHERE l."tenantId" = "vTenant" AND l."invoiceId" = "pId" AND l."salesOrderLineId" IS NOT NULL
               GROUP BY l."salesOrderLineId") x
        JOIN "Sales"."SalesOrderLines" ol ON ol."tenantId" = "vTenant" AND ol.id = x."salesOrderLineId"
       WHERE ol."invoicedQty" + x.qty > ol."baseQty" + ol."bonusQty") THEN
    RAISE EXCEPTION 'Sales invoice %: a line invoices more than the open quantity of its sales order line', "vInv"."docNo"
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE "Sales"."SalesOrderLines" ol
     SET "invoicedQty"  = ol."invoicedQty" + x.qty,
         "deliveredQty" = LEAST(ol."deliveredQty" + x."deliverQty", ol."baseQty" + ol."bonusQty")
    FROM (SELECT l."salesOrderLineId", sum(l."baseQty" + l."bonusQty") AS qty,
                 sum(CASE WHEN "vIssue" AND l."deliveryChallanLineId" IS NULL
                          THEN l."baseQty" + l."bonusQty" ELSE 0 END) AS "deliverQty"
            FROM "Sales"."SalesInvoiceLines" l
           WHERE l."tenantId" = "vTenant" AND l."invoiceId" = "pId" AND l."salesOrderLineId" IS NOT NULL
           GROUP BY l."salesOrderLineId") x
   WHERE ol."tenantId" = "vTenant" AND ol.id = x."salesOrderLineId";
  UPDATE "Sales"."SalesOrders" o SET status = 'INVOICED'
   WHERE o."tenantId" = "vTenant"
     AND o.id IN (SELECT ol."salesOrderId"
                    FROM "Sales"."SalesInvoiceLines" l
                    JOIN "Sales"."SalesOrderLines" ol ON ol."tenantId" = l."tenantId" AND ol.id = l."salesOrderLineId"
                   WHERE l."tenantId" = "vTenant" AND l."invoiceId" = "pId")
     AND o.status NOT IN ('CANCELLED','INVOICED')
     AND NOT EXISTS (SELECT 1 FROM "Sales"."SalesOrderLines" z
                      WHERE z."tenantId" = o."tenantId" AND z."salesOrderId" = o.id
                        AND z."invoicedQty" < z."baseQty" + z."bonusQty");

  -- 5. WHT register: advance tax collected u/s 236G / 236H (direction COLLECTED)
  IF "vInv"."advanceTaxAmount" > 0
     AND NOT EXISTS (SELECT 1 FROM "Tax"."WhtDeductions" w
                      WHERE w."tenantId" = "vTenant" AND w."sourceDocType" = "vDocType" AND w."sourceDocId" = "pId"
                        AND w.direction = 'COLLECTED' AND w.status <> 'CANCELLED') THEN
    SELECT tc.id, tc."whtSection" INTO "vTaxCode"
      FROM "Tax"."TaxCodes" tc
     WHERE tc."tenantId" = "vTenant" AND tc."taxType" = 'COLLECTION' AND tc."isActive" AND tc."deletedAt" IS NULL
       AND tc."appliesTo" IN ('SALES','SALES_AND_PURCHASES')
     ORDER BY tc."isSystem" DESC, tc.code
     LIMIT 1;
    IF FOUND THEN
      INSERT INTO "Tax"."WhtDeductions"
             ("tenantId", direction, "deductionDate", "periodMonth", "branchId", "taxCodeId", "whtSection",
              "customerId", "partyName", "partyNtnCnic", "isAtl", "sourceDocType", "sourceDocId",
              "taxableAmount", "taxRate", "taxAmount", "journalEntryId", status)
      VALUES ("vTenant", 'COLLECTED', "vInv"."docDate", date_trunc('month', "vInv"."docDate")::date, "vInv"."branchId",
              "vTaxCode".id, "vTaxCode"."whtSection", "vInv"."customerId", "vParty",
              COALESCE("vInv"."buyerNtn", "vInv"."buyerCnic"), "vCust"."atlStatus" = 'ACTIVE', "vDocType", "pId",
              round(("vInv"."netAmount" - "vInv"."advanceTaxAmount") * "vFx", 2), "vInv"."advanceTaxRate",
              round("vInv"."advanceTaxAmount" * "vFx", 2), "vJournal", 'UNPAID');
    END IF;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION "Sales"."salesInvoicePost"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    "Sales"."SalesInvoices";
  "vCust"   record;
  "vCp"     record;
  "vFbr"    record;
  "vPos"    text;
  "vSo"     uuid;
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."SalesInvoices" t WHERE t.id = "pId" AND t."tenantId" = "vTenant" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SalesInvoices % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Sales invoice %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'INVOICE_NOT_EDITABLE';
  END IF;
  IF "vRow"."isHeld" THEN
    RAISE EXCEPTION 'Sales invoice % is on hold: recall it first', "vRow"."docNo" USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'INVOICE_NOT_EDITABLE';
  END IF;
  -- credit control with error codes (the posting entries repeat it; an approved credit override lets it through)
  SELECT c.name, c.status, c."holdReason", c."blockOverLimit" INTO "vCust"
    FROM "Sales"."Customers" c WHERE c."tenantId" = "vTenant" AND c.id = "vRow"."customerId";
  IF "vCust".status = 'INACTIVE' THEN
    RAISE EXCEPTION 'Customer % is inactive', "vCust".name USING ERRCODE = 'check_violation', HINT = 'CUSTOMER_INACTIVE';
  END IF;
  IF "vRow"."creditOverrideId" IS NULL AND "vRow".channel IN ('STANDARD', 'WHOLESALE') THEN
    IF "vCust".status = 'ON_HOLD' THEN
      RAISE EXCEPTION 'Customer % is on credit hold (%)', "vCust".name, COALESCE("vCust"."holdReason", 'hold')
        USING ERRCODE = 'check_violation', HINT = 'CUSTOMER_ON_HOLD';
    END IF;
    IF "vCust"."blockOverLimit" THEN
      SELECT cp."effectiveLimit", cp.balance INTO "vCp"
        FROM "Sales"."getCustomerCreditPosition" cp WHERE cp."tenantId" = "vTenant" AND cp."customerId" = "vRow"."customerId";
      IF COALESCE("vCp"."effectiveLimit", 0) > 0
         AND COALESCE("vCp".balance, 0) + round("vRow"."netAmount" * COALESCE("vRow"."fxRate", 1), 2) > "vCp"."effectiveLimit" THEN
        RAISE EXCEPTION 'Credit limit exceeded for %: balance % + invoice % > limit %', "vCust".name, COALESCE("vCp".balance, 0),
          round("vRow"."netAmount" * COALESCE("vRow"."fxRate", 1), 2), "vCp"."effectiveLimit"
          USING ERRCODE = 'check_violation', HINT = 'CREDIT_LIMIT_EXCEEDED';
      END IF;
    END IF;
  END IF;
  -- challan-linked lines: the challans are delivered and not invoiced yet
  IF EXISTS (SELECT 1 FROM "Sales"."SalesInvoiceLines" l
               JOIN "Sales"."DeliveryChallanLines" dl ON dl."tenantId" = l."tenantId" AND dl.id = l."deliveryChallanLineId"
               JOIN "Sales"."DeliveryChallans" d ON d."tenantId" = dl."tenantId" AND d.id = dl."deliveryChallanId"
              WHERE l."tenantId" = "vTenant" AND l."invoiceId" = "pId" AND d.status <> 'DELIVERED') THEN
    RAISE EXCEPTION 'Sales invoice %: its delivery challans must be delivered and not invoiced yet', "vRow"."docNo"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'CHALLAN_NOT_DELIVERED';
  END IF;

  PERFORM "Sales"."salesInvoicePostEntries"("pId");
  UPDATE "Sales"."SalesInvoices" t
     SET status = 'POSTED', "postedAt" = now(), "postedByUserId" = "Company"."getCurrentUserId"(),
         "stockIssuedAt" = CASE WHEN t."stockIssueMode" IS DISTINCT FROM 'AT_DISPATCH' THEN now() END
   WHERE t.id = "pId";

  UPDATE "Sales"."DeliveryChallans" d SET status = 'INVOICED', "invoiceId" = "pId"
   WHERE d."tenantId" = "vTenant" AND d.status = 'DELIVERED'
     AND (d.id = "vRow"."deliveryChallanId"
          OR d.id IN (SELECT dl."deliveryChallanId" FROM "Sales"."SalesInvoiceLines" l
                        JOIN "Sales"."DeliveryChallanLines" dl ON dl."tenantId" = l."tenantId" AND dl.id = l."deliveryChallanLineId"
                       WHERE l."tenantId" = "vTenant" AND l."invoiceId" = "pId"));
  FOR "vSo" IN
    SELECT DISTINCT ol."salesOrderId" FROM "Sales"."SalesInvoiceLines" l
      JOIN "Sales"."SalesOrderLines" ol ON ol."tenantId" = l."tenantId" AND ol.id = l."salesOrderLineId"
     WHERE l."tenantId" = "vTenant" AND l."invoiceId" = "pId"
    UNION SELECT "vRow"."salesOrderId" WHERE "vRow"."salesOrderId" IS NOT NULL
  LOOP
    PERFORM "Sales"."salesOrderRefresh"("vSo");
  END LOOP;

  -- FBR / PRA: queue the submission (the Phase 28 client sends it, retries, and stores the FBR invoice no. / QR)
  IF "vRow"."submitToFbr" THEN
    SELECT s.id, s."posId" INTO "vFbr"
      FROM "Tax"."FbrSettings" s
     WHERE s."tenantId" = "vTenant" AND s."isActive" AND s."reportOnPosting"
     ORDER BY (s.authority = 'FBR') DESC, s."createdAt"
     LIMIT 1;
    IF FOUND THEN
      SELECT m."posId" INTO "vPos" FROM "Tax"."FbrBranchMappings" m
       WHERE m."tenantId" = "vTenant" AND m."fbrConfigId" = "vFbr".id AND m."branchId" = "vRow"."branchId" AND m."isActive";
      INSERT INTO "Tax"."FbrInvoiceSubmissions" ("tenantId", "fbrConfigId", "invoiceId", "documentNo", "branchId", "posId", "buyerName", "buyerNtnCnic", amount, status, attempts)
      SELECT "vTenant", "vFbr".id, "pId", "vRow"."docNo", "vRow"."branchId", COALESCE("vPos", "vFbr"."posId"), "vRow"."buyerName",
             COALESCE("vRow"."buyerNtn", "vRow"."buyerCnic"), "vRow"."netAmount", 'PENDING', 0
       WHERE NOT EXISTS (SELECT 1 FROM "Tax"."FbrInvoiceSubmissions" f WHERE f."tenantId" = "vTenant" AND f."invoiceId" = "pId");
      UPDATE "Sales"."SalesInvoices" t SET "fbrStatus" = 'PENDING' WHERE t.id = "pId";
    END IF;
  END IF;
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Sales"."salesInvoiceVoid"("pId" uuid, "pReason" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    "Sales"."SalesInvoices";
  "vSo"     uuid;
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."SalesInvoices" t WHERE t.id = "pId" AND t."tenantId" = "vTenant" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SalesInvoices % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'VOID' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID') THEN
    RAISE EXCEPTION 'Sales invoice %: only a posted invoice can be voided (status %); delete a draft instead', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'INVOICE_NOT_POSTED';
  END IF;
  PERFORM "Sales"."salesInvoiceVoidEntries"("pId");
  UPDATE "Sales"."SalesInvoices" t SET status = 'VOID', "voidedAt" = now(), "voidedByUserId" = "Company"."getCurrentUserId"(), "voidReason" = "pReason" WHERE t.id = "pId";
  FOR "vSo" IN
    SELECT DISTINCT ol."salesOrderId" FROM "Sales"."SalesInvoiceLines" l
      JOIN "Sales"."SalesOrderLines" ol ON ol."tenantId" = l."tenantId" AND ol.id = l."salesOrderLineId"
     WHERE l."tenantId" = "vTenant" AND l."invoiceId" = "pId"
  LOOP
    PERFORM "Sales"."salesOrderRefresh"("vSo");
  END LOOP;
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 8. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('QUOTATION_NOT_EDITABLE',        409, 'BUSINESS_RULE', 'SALES', 'Only a draft quotation can be changed or sent. Revise a sent one instead.', 'Edit / send of a non-draft quotation', true, NULL),
  ('QUOTATION_NOT_OPEN',            409, 'BUSINESS_RULE', 'SALES', 'This quotation is no longer open.', 'Accept / reject / convert of a closed quotation', true, NULL),
  ('QUOTATION_EXPIRED',             409, 'BUSINESS_RULE', 'SALES', 'This quotation has expired. Revise it to send a new one.', 'Accept / convert after the validity date', true, NULL),
  ('SALES_ORDER_NOT_EDITABLE',      409, 'BUSINESS_RULE', 'SALES', 'Only a draft sales order can be changed.', 'Edit / confirm of a non-draft order', true, NULL),
  ('SALES_ORDER_NOT_OPEN',          409, 'BUSINESS_RULE', 'SALES', 'This sales order is not open.', 'Close of an order that is not confirmed / partly delivered', true, NULL),
  ('SALES_ORDER_NOT_CANCELLABLE',   409, 'BUSINESS_RULE', 'SALES', 'Goods were delivered or invoiced on this order. Close it instead of cancelling.', 'Cancel of an order with deliveries', true, NULL),
  ('SALES_ORDER_HAS_OPEN_CHALLANS', 409, 'BUSINESS_RULE', 'SALES', 'Dispatch or cancel the packed delivery challans of this order first.', 'Close with packed challans', true, NULL),
  ('SALES_ORDER_APPROVAL_REQUIRED', 409, 'BUSINESS_RULE', 'SALES', 'An approval workflow covers this sales order. Submit it for approval.', 'Direct confirm of an order a workflow routes', true, NULL),
  ('CUSTOMER_ON_HOLD',              409, 'BUSINESS_RULE', 'SALES', 'This customer is on credit hold.', 'Order / invoice for a customer on hold', true, NULL),
  ('CUSTOMER_INACTIVE',             409, 'BUSINESS_RULE', 'SALES', 'This customer is inactive.', 'Order / invoice for an inactive customer', true, NULL),
  ('CREDIT_LIMIT_EXCEEDED',         409, 'BUSINESS_RULE', 'SALES', 'This document takes the customer over their credit limit.', 'Balance + open orders + document above the effective limit', true, NULL),
  ('CHALLAN_ORDER_NOT_OPEN',        409, 'BUSINESS_RULE', 'SALES', 'Goods can only be delivered against a confirmed, open sales order.', 'Challan against a draft / closed order', true, NULL),
  ('CHALLAN_NOT_EDITABLE',          409, 'BUSINESS_RULE', 'SALES', 'Only a packed challan can be changed or dispatched.', 'Edit / dispatch of a dispatched challan', true, NULL),
  ('CHALLAN_NOT_DISPATCHED',        409, 'BUSINESS_RULE', 'SALES', 'Only a dispatched challan can be marked delivered.', 'Deliver before dispatch', true, NULL),
  ('CHALLAN_NOT_DELIVERED',         409, 'BUSINESS_RULE', 'SALES', 'Only a delivered challan that is not invoiced yet can be invoiced.', 'Invoice from an undelivered / invoiced challan', true, NULL),
  ('OVER_DELIVERY',                 409, 'BUSINESS_RULE', 'SALES', 'This delivery is more than is still open on the sales order.', 'Challan quantity above the open order quantity', true, NULL),
  ('INVOICE_NOT_EDITABLE',          409, 'BUSINESS_RULE', 'SALES', 'Only a draft invoice can be changed or posted. Void a posted invoice instead.', 'Edit / post of a non-draft invoice', true, NULL),
  ('INVOICE_NOT_POSTED',            409, 'BUSINESS_RULE', 'SALES', 'Only a posted invoice can be voided.', 'Void of a draft invoice', true, NULL),
  ('INVOICE_APPROVAL_REQUIRED',     409, 'BUSINESS_RULE', 'SALES', 'An approval workflow covers this invoice. Submit it for approval before posting.', 'Posting an invoice a workflow routes before approval', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
