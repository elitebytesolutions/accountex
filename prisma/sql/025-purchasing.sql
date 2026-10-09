-- Phase 19 — Purchasing: numbering series, approval states, posting pre-checks that carry error codes (over-receipt,
-- batch / expiry, PO not open, landed-cost GRN / allocation), duplicate vendor invoice guard, error codes. Idempotent.
SELECT set_config('app.actorLabel', '025-purchasing.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Numbering: PO, GRN, BILL, PV (counter purchase voucher), LC for every company and every new one
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."seedPurchasingDefaultsFor"("pTenant" uuid)
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
   WHERE d.code IN ('PO', 'GRN', 'BILL', 'PV', 'LC')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "Purchases"."triggerTenantPurchasingDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Purchases"."seedPurchasingDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsPurchasingDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsPurchasingDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerTenantPurchasingDefaults"();

SELECT set_config('app.actorLabel', 'seedPurchasingDefaultsFor', false);
SELECT "Purchases"."seedPurchasingDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '025-purchasing.sql', false);

-- ---------------------------------------------------------------------------
-- 2. Approval: a PO / bill waiting in the approval engine (PENDING_L1 / PENDING_L2, AWAITING_APPROVAL) can be approved;
--    the preparer never approves their own document (APPROVAL_SELF)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."purchaseOrderApprove"("pId" uuid, "pComment" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Purchases"."PurchaseOrders";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."PurchaseOrders" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PurchaseOrders % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_L1', 'PENDING_L2') THEN
    RAISE EXCEPTION 'PurchaseOrders %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PO_NOT_EDITABLE';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'PurchaseOrders: the preparer cannot approve their own record'
      USING ERRCODE = 'insufficient_privilege', HINT = 'APPROVAL_SELF';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Purchases"."PurchaseOrderLines" l WHERE l."tenantId" = "vRow"."tenantId" AND l."purchaseOrderId" = "pId") THEN
    RAISE EXCEPTION 'Purchase order %: add at least one line', "vRow"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  IF to_regprocedure('"Purchases"."purchaseOrderApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."purchaseOrderApproveEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."PurchaseOrders" t SET status = 'APPROVED', "approvedAt" = now(), "approvedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Purchases"."vendorBillApprove"("pId" uuid, "pComment" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Purchases"."VendorBills";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."VendorBills" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VendorBills % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'AWAITING_APPROVAL') THEN
    RAISE EXCEPTION 'VendorBills %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'BILL_NOT_EDITABLE';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'VendorBills: the preparer cannot approve their own record'
      USING ERRCODE = 'insufficient_privilege', HINT = 'APPROVAL_SELF';
  END IF;
  IF to_regprocedure('"Purchases"."vendorBillApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."vendorBillApproveEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."VendorBills" t SET status = 'APPROVED', "approvedAt" = now(), "approvedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 3. GRN posting pre-checks with error codes: the PO is approved and open (GRN_PO_NOT_OPEN), nothing above the open
--    PO quantity (OVER_RECEIPT), batch no. and expiry for expiry-tracked products (BATCH_REQUIRED)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."goodsReceivedNotePost"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow"  "Purchases"."GoodsReceivedNotes";
  "vPo"   text;
  "vOver" record;
  "vLine" record;
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."GoodsReceivedNotes" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GoodsReceivedNotes % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'GoodsReceivedNotes %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'GRN_NOT_EDITABLE';
  END IF;
  IF "vRow"."purchaseOrderId" IS NOT NULL THEN
    SELECT po.status INTO "vPo" FROM "Purchases"."PurchaseOrders" po
     WHERE po."tenantId" = "vRow"."tenantId" AND po.id = "vRow"."purchaseOrderId" FOR UPDATE;
    IF "vPo" IS DISTINCT FROM 'APPROVED' AND "vPo" IS DISTINCT FROM 'PARTIALLY_RECEIVED' THEN
      RAISE EXCEPTION 'GRN %: the purchase order is %; goods can only be received against an approved, open order', "vRow"."docNo", "vPo"
        USING ERRCODE = 'check_violation', HINT = 'GRN_PO_NOT_OPEN';
    END IF;
  END IF;
  SELECT s."poLineNo", s.accepted, s."openQty" INTO "vOver"
    FROM (SELECT pl."lineNo" AS "poLineNo", sum(gl."acceptedQty") AS accepted,
                 pl."baseQty" + pl."bonusQty" - pl."receivedQty" AS "openQty"
            FROM "Purchases"."GoodsReceivedNoteLines" gl
            JOIN "Purchases"."PurchaseOrderLines" pl ON pl."tenantId" = gl."tenantId" AND pl.id = gl."purchaseOrderLineId"
           WHERE gl."tenantId" = "vRow"."tenantId" AND gl."grnId" = "pId"
           GROUP BY pl.id, pl."lineNo", pl."baseQty", pl."bonusQty", pl."receivedQty") s
   WHERE s.accepted > s."openQty"
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'GRN % accepts % on PO line % but only % is still open', "vRow"."docNo", "vOver".accepted, "vOver"."poLineNo", "vOver"."openQty"
      USING ERRCODE = 'check_violation', HINT = 'OVER_RECEIPT';
  END IF;
  SELECT gl."lineNo", i.name INTO "vLine"
    FROM "Purchases"."GoodsReceivedNoteLines" gl
    JOIN "Inventory"."Products" i ON i."tenantId" = gl."tenantId" AND i.id = gl."itemId"
   WHERE gl."tenantId" = "vRow"."tenantId" AND gl."grnId" = "pId" AND gl."acceptedQty" > 0 AND i."trackExpiry"
     AND gl."batchId" IS NULL AND (NULLIF(btrim(gl."batchNo"), '') IS NULL OR gl."expiryDate" IS NULL)
   ORDER BY gl."lineNo" LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'GRN % line % (%): enter the batch no. and expiry date', "vRow"."docNo", "vLine"."lineNo", "vLine".name
      USING ERRCODE = 'check_violation', HINT = 'BATCH_REQUIRED';
  END IF;
  IF to_regprocedure('"Purchases"."goodsReceivedNotePostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."goodsReceivedNotePostEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."GoodsReceivedNotes" t SET status = 'POSTED', "postedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Bill posting pre-check: stock received on the bill itself (no GRN) needs batch no. and expiry for expiry-tracked
--    products (BATCH_REQUIRED)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."vendorBillPost"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow"  "Purchases"."VendorBills";
  "vLine" record;
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."VendorBills" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VendorBills % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'APPROVED') THEN
    RAISE EXCEPTION 'VendorBills %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'BILL_NOT_EDITABLE';
  END IF;
  SELECT l."lineNo", i.name INTO "vLine"
    FROM "Purchases"."VendorBillLines" l
    JOIN "Inventory"."Products" i ON i."tenantId" = l."tenantId" AND i.id = l."itemId"
   WHERE l."tenantId" = "vRow"."tenantId" AND l."billId" = "pId" AND i."trackExpiry" AND l."totalQty" > 0
     AND l."grnLineId" IS NULL AND "vRow"."grnId" IS NULL
     AND l."batchId" IS NULL AND (NULLIF(btrim(l."batchNo"), '') IS NULL OR l."expiryDate" IS NULL)
   ORDER BY l."lineNo" LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Bill % line % (%): enter the batch no. and expiry date', "vRow"."docNo", "vLine"."lineNo", "vLine".name
      USING ERRCODE = 'check_violation', HINT = 'BATCH_REQUIRED';
  END IF;
  IF to_regprocedure('"Purchases"."vendorBillPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."vendorBillPostEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."VendorBills" t SET status = 'POSTED', "postedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Landed-cost posting pre-checks: the import GRN is posted (LANDED_COST_GRN_NOT_POSTED) and the allocation equals
--    the capitalised charges (LANDED_COST_UNALLOCATED)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."landedCostShipmentPost"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow"   "Purchases"."LandedCostShipments";
  "vAlloc" numeric;
  "vCap"   numeric;
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."LandedCostShipments" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LandedCostShipments % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('IN_TRANSIT', 'CLEARED') THEN
    RAISE EXCEPTION 'LandedCostShipments %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."grnId" IS NULL OR NOT EXISTS (SELECT 1 FROM "Purchases"."GoodsReceivedNotes" g
                                            WHERE g."tenantId" = "vRow"."tenantId" AND g.id = "vRow"."grnId" AND g.status = 'POSTED') THEN
    RAISE EXCEPTION 'Shipment %: link a posted import GRN before posting the landed cost', "vRow"."docNo"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'LANDED_COST_GRN_NOT_POSTED';
  END IF;
  SELECT COALESCE(sum(i."allocatedAmount"), 0) INTO "vAlloc"
    FROM "Purchases"."LandedCostItems" i WHERE i."tenantId" = "vRow"."tenantId" AND i."shipmentId" = "pId";
  SELECT COALESCE(sum(c.amount), 0) INTO "vCap"
    FROM "Purchases"."LandedCostCharges" c WHERE c."tenantId" = "vRow"."tenantId" AND c."shipmentId" = "pId" AND c."isCapitalised";
  IF "vAlloc" <> "vCap" THEN
    RAISE EXCEPTION 'Shipment %: allocated % differs from the capitalised charges %; re-run the allocation', "vRow"."docNo", "vAlloc", "vCap"
      USING ERRCODE = 'check_violation', HINT = 'LANDED_COST_UNALLOCATED';
  END IF;
  -- the journal date is the clearing date; posting needs one (landedCostShipmentClearedChk)
  IF "vRow"."clearedOn" IS NULL THEN
    UPDATE "Purchases"."LandedCostShipments" t SET "clearedOn" = t."docDate" WHERE t.id = "pId";
  END IF;
  IF to_regprocedure('"Purchases"."landedCostShipmentPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."landedCostShipmentPostEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."LandedCostShipments" t SET status = 'POSTED', "postedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 6. One vendor invoice no. per vendor (void bills excepted): BILL_DUPLICATE_INVOICE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."triggerBillDuplicateInvoice"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  "vDoc" text;
BEGIN
  IF NEW.status = 'VOID' THEN
    RETURN NEW;
  END IF;
  SELECT b."docNo" INTO "vDoc" FROM "Purchases"."VendorBills" b
   WHERE b."tenantId" = NEW."tenantId" AND b."vendorId" = NEW."vendorId" AND b.id <> NEW.id AND b.status <> 'VOID'
     AND upper(btrim(b."vendorInvoiceNo")) = upper(btrim(NEW."vendorInvoiceNo"))
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Invoice % from this vendor is already entered on %', NEW."vendorInvoiceNo", "vDoc"
      USING ERRCODE = 'unique_violation', HINT = 'BILL_DUPLICATE_INVOICE';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "billDuplicateInvoice" ON "Purchases"."VendorBills";
CREATE TRIGGER "billDuplicateInvoice" BEFORE INSERT OR UPDATE OF "vendorInvoiceNo", "vendorId", status ON "Purchases"."VendorBills"
  FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerBillDuplicateInvoice"();

-- ---------------------------------------------------------------------------
-- 7. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('OVER_RECEIPT',               409, 'BUSINESS_RULE', 'PURCHASES', 'This receipt is more than is still open on the purchase order.', 'GRN accepted quantity above the open PO quantity', true, NULL),
  ('BATCH_REQUIRED',             400, 'VALIDATION',    'PURCHASES', 'Enter the batch no. and expiry date for expiry-tracked products.', 'Stock in of an expiry-tracked product without batch / expiry', true, NULL),
  ('GRN_PO_NOT_OPEN',            409, 'BUSINESS_RULE', 'PURCHASES', 'Goods can only be received against an approved, open purchase order.', 'GRN against a draft, cancelled or fully received PO', true, NULL),
  ('GRN_NOT_EDITABLE',           409, 'BUSINESS_RULE', 'PURCHASES', 'Only a draft goods receipt can be changed. Cancel a posted one instead.', 'Edit of a posted GRN', true, NULL),
  ('PO_NOT_EDITABLE',            409, 'BUSINESS_RULE', 'PURCHASES', 'Only a draft purchase order can be changed.', 'Edit of a submitted / approved PO', true, NULL),
  ('PO_APPROVAL_REQUIRED',       409, 'BUSINESS_RULE', 'PURCHASES', 'An approval workflow covers this purchase order. Submit it for approval.', 'Direct approval of a PO a workflow routes', true, NULL),
  ('BILL_NOT_EDITABLE',          409, 'BUSINESS_RULE', 'PURCHASES', 'Only a draft bill can be changed. Void a posted bill instead.', 'Edit of a submitted / posted bill', true, NULL),
  ('BILL_APPROVAL_REQUIRED',     409, 'BUSINESS_RULE', 'PURCHASES', 'An approval workflow covers this bill. Submit it for approval before posting.', 'Posting / direct approval of a bill a workflow routes', true, NULL),
  ('BILL_DUPLICATE_INVOICE',     409, 'CONFLICT',      'PURCHASES', 'This vendor invoice number is already entered on another bill.', 'Duplicate vendor invoice no. for the same vendor', true, NULL),
  ('APPROVAL_NO_WORKFLOW',       409, 'BUSINESS_RULE', 'PURCHASES', 'No approval workflow covers this document. Approve it directly.', 'Submit with no matching workflow', true, NULL),
  ('LANDED_COST_GRN_NOT_POSTED', 409, 'BUSINESS_RULE', 'PURCHASES', 'Link a posted import goods receipt before posting the landed cost.', 'Landed cost without a posted import GRN', true, NULL),
  ('LANDED_COST_UNALLOCATED',    409, 'BUSINESS_RULE', 'PURCHASES', 'The allocation doesn''t match the charges in cost. Re-run the allocation.', 'Landed cost allocation differs from capitalised charges', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
