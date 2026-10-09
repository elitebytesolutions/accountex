-- Phase 20 — Payables: numbering, cheque payments through PDC payable (vendor payments and the purchase voucher's
-- pay-now), the cheque ↔ payment link (cleared cheques clear the payment; register bounce / cancel of a payment's
-- cheque is blocked), debit-note refunds received, error codes. Idempotent.
SELECT set_config('app.actorLabel', '026-payables.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Numbering: PR, DN, PAY for every company and every new one
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."seedPayablesDefaultsFor"("pTenant" uuid)
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
   WHERE d.code IN ('PR', 'DN', 'PAY')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "Purchases"."triggerTenantPayablesDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Purchases"."seedPayablesDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsPayablesDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsPayablesDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerTenantPayablesDefaults"();

SELECT set_config('app.actorLabel', 'seedPayablesDefaultsFor', false);
SELECT "Purchases"."seedPayablesDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '026-payables.sql', false);

-- ---------------------------------------------------------------------------
-- 2. Cheques through PDC payable (Phase 17 clearing route): vendor payments and the purchase voucher's pay-now.
--    Bank charges still hit the bank.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."vendorPaymentPostEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vDoc"    record;
  "vVendor" record;
  "vFx"     numeric;
  "vAp"     uuid;
  "vSrc"    uuid;
  "vChg"    uuid;
  "vWht"    numeric(18,2) := 0;
  "vLines"  jsonb;
  "vDiff"   numeric(18,2);
  "vNarr"   text;
  "vCheque" uuid;
  "vJe"     uuid;
BEGIN
  SELECT p.* INTO "vDoc" FROM "Purchases"."VendorPayments" p WHERE p."tenantId" = "vTenant" AND p.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor payment % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  SELECT v.* INTO "vVendor" FROM "Purchases"."Vendors" v WHERE v."tenantId" = "vTenant" AND v.id = "vDoc"."vendorId";
  "vChg" := "Purchases"."getPaymentSourceAccount"(CASE WHEN "vDoc".method = 'CASH' THEN "vDoc"."cashAccountId" END,
                                                  CASE WHEN "vDoc".method <> 'CASH' THEN "vDoc"."bankAccountId" END);
  -- a cheque credits PDC payable until it clears in the cheque register (Dr PDC payable / Cr bank)
  "vSrc" := CASE WHEN "vDoc".method = 'CHEQUE' THEN "Company"."getAccountForRole"('PDC_PAYABLE') ELSE "vChg" END;
  IF "vDoc"."whtTreatment" = 'WITHHOLD_NOW' THEN
    SELECT COALESCE(sum(a."whtAmount"), 0) INTO "vWht"
      FROM "Purchases"."VendorPaymentAllocations" a
     WHERE a."tenantId" = "vTenant" AND a."vendorPaymentId" = "pId" AND NOT a."isReversed";
    IF "vWht" = 0 AND "vDoc"."whtRate" > 0 THEN
      RAISE EXCEPTION 'Payment %: WHT is to be withheld now but no allocation carries a WHT amount', "vDoc"."docNo"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  "vFx"   := COALESCE(NULLIF("vDoc"."fxRate", 0), 1);
  "vAp"   := COALESCE("vVendor"."payableAccountId", "Company"."getAccountForRole"('AP_CONTROL'));
  "vNarr" := 'Vendor payment ' || "vDoc"."docNo" || ' — ' || "vVendor".name || COALESCE(' · ' || "vDoc".remarks, '');

  "vLines" := jsonb_build_array(
    jsonb_build_object('accountId', "vAp", 'debit', round(("vDoc".amount + "vWht") * "vFx", 2),
                       'vendorId', "vDoc"."vendorId", 'particulars', "vNarr"),
    jsonb_build_object('accountId', "vSrc", 'credit', round("vDoc".amount * "vFx", 2),
                       'particulars', 'Paid to ' || "vVendor".name || COALESCE(' · cheque ' || "vDoc"."chequeNo", '')),
    jsonb_build_object('accountRole', 'WHT_PAYABLE_153', 'credit', round("vWht" * "vFx", 2),
                       'particulars', 'WHT withheld ' || COALESCE("vDoc"."whtSection", '')),
    jsonb_build_object('accountRole', 'BANK_CHARGES', 'debit', round("vDoc"."bankChargesAmount" * "vFx", 2),
                       'particulars', 'Bank charges'),
    jsonb_build_object('accountId', "vChg", 'credit', round("vDoc"."bankChargesAmount" * "vFx", 2),
                       'particulars', 'Bank charges'));
  IF "vFx" <> 1 THEN
    SELECT COALESCE(sum(COALESCE((x ->> 'debit')::numeric, 0) - COALESCE((x ->> 'credit')::numeric, 0)), 0)
      INTO "vDiff" FROM jsonb_array_elements("vLines") x;
    IF "vDiff" <> 0 THEN
      "vLines" := "vLines" || jsonb_build_object('accountRole', 'ROUNDING', 'credit', "vDiff", 'particulars', 'FX rounding');
    END IF;
  END IF;

  "vJe" := "Accounting"."journalCreate"(
    jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vDoc"."docDate", 'branchId', "vDoc"."branchId",
                       'narration', "vNarr", 'sourceDocType', 'PAY', 'sourceDocId', "pId",
                       'sourceDocNo', "vDoc"."docNo", 'partyName', "vVendor".name),
    "vLines");

  IF "vDoc".method = 'CHEQUE' AND "vDoc"."chequeId" IS NULL THEN
    "vCheque" := "Purchases"."chequeIssue"("vDoc"."docDate", "vDoc"."branchId", "vDoc"."vendorId", "vVendor".name,
                                           "vDoc"."bankAccountId", "vDoc"."chequeNo", "vDoc".amount, "vJe", "vNarr");
    UPDATE "BankCash"."Cheques" c
       SET "chequeBookId" = "vDoc"."chequeBookId", "crossedAcPayee" = "vDoc"."isCrossed"
     WHERE c."tenantId" = "vTenant" AND c.id = "vCheque";
  END IF;
  UPDATE "Purchases"."VendorPayments" p
     SET "journalEntryId" = "vJe", "chequeId" = COALESCE("vCheque", p."chequeId")
   WHERE p."tenantId" = "vTenant" AND p.id = "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Purchases"."vendorBillPostEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant"    uuid := "Company"."getCurrentTenantId"();
  "vBill"      record;
  "vVendor"    record;
  "vLine"      record;
  "vGrnLine"   record;
  "vMatched"   boolean;
  "vDocType"   text;
  "vFx"        numeric;
  "vAp"        uuid;
  "vInv"       uuid;
  "vAcc"       uuid;
  "vPayAcc"    uuid;
  "vLines"     jsonb := '[]'::jsonb;
  "vNet"       numeric(18,2);
  "vGrni"      numeric(18,2);
  "vVar"       numeric(18,2);
  "vPart"      numeric(18,2);
  "vQty"       numeric(18,3);
  "vCost"      numeric(18,4);
  "vBatch"     uuid;
  "vCount"     integer;
  "vSumNet"    numeric(18,2);
  "vSumTax"    numeric(18,2);
  "vDiff"      numeric(18,2);
  "vOldPrice"  numeric(18,2);
  "vItemCost"  numeric(18,2);
  "vItemState" text;
  "vNarr"      text;
  "vCheque"    uuid;
  "vJe"        uuid;
BEGIN
  SELECT b.* INTO "vBill" FROM "Purchases"."VendorBills" b WHERE b."tenantId" = "vTenant" AND b.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor bill % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  SELECT count(*), COALESCE(sum(l."netAmount"), 0), COALESCE(sum(l."taxAmount"), 0)
    INTO "vCount", "vSumNet", "vSumTax"
    FROM "Purchases"."VendorBillLines" l WHERE l."tenantId" = "vTenant" AND l."billId" = "pId";
  IF "vCount" = 0 THEN
    RAISE EXCEPTION 'Bill %: add at least one line before posting', "vBill"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  IF "vSumNet" <> "vBill"."netAmount" OR "vSumTax" <> "vBill"."taxAmount" THEN
    RAISE EXCEPTION 'Bill %: line totals (net %, tax %) differ from the header (net %, tax %); recalculate and save',
      "vBill"."docNo", "vSumNet", "vSumTax", "vBill"."netAmount", "vBill"."taxAmount" USING ERRCODE = 'check_violation';
  END IF;

  "vDocType" := CASE WHEN "vBill".channel = 'COUNTER' THEN 'PV' ELSE 'BILL' END;
  SELECT v.* INTO "vVendor" FROM "Purchases"."Vendors" v WHERE v."tenantId" = "vTenant" AND v.id = "vBill"."vendorId";
  "vFx"   := COALESCE(NULLIF("vBill"."fxRate", 0), 1);
  "vAp"   := COALESCE("vBill"."payableAccountId", "vVendor"."payableAccountId", "Company"."getAccountForRole"('AP_CONTROL'));
  "vInv"  := "Inventory"."getWarehouseInventoryAccount"("vBill"."warehouseId");
  "vNarr" := CASE WHEN "vBill".channel = 'COUNTER' THEN 'Purchase voucher ' ELSE 'Vendor bill ' END
             || "vBill"."docNo" || ' — ' || "vVendor".name || ' (' || "vBill"."vendorInvoiceNo" || ')';

  FOR "vLine" IN
    SELECT l.* FROM "Purchases"."VendorBillLines" l
     WHERE l."tenantId" = "vTenant" AND l."billId" = "pId" ORDER BY l."lineNo"
  LOOP
    "vNet" := round("vLine"."netAmount" * "vFx", 2);
    IF "vLine"."itemId" IS NULL THEN
      -- non-stock line: expense account with its cost centre / project
      "vAcc" := COALESCE("vLine"."accountId", "vVendor"."defaultAccountId");
      IF "vAcc" IS NULL THEN
        RAISE EXCEPTION 'Bill %: line % needs an expense account', "vBill"."docNo", "vLine"."lineNo"
          USING ERRCODE = 'check_violation';
      END IF;
      "vLines" := "vLines" || jsonb_build_object('accountId', "vAcc", 'debit', "vNet",
                    'particulars', COALESCE("vLine".description, 'Line ' || "vLine"."lineNo"),
                    'costCentreId', COALESCE("vLine"."costCentreId", "vBill"."costCentreId"),
                    'projectId', COALESCE("vLine"."projectId", "vBill"."projectId"));
    ELSE
      -- stock line: matched to a posted GRN line (explicit, or the bill's GRN by item)?
      SELECT gl.id, gl."unitCost", g."warehouseId", g."isImport" INTO "vGrnLine"
        FROM "Purchases"."GoodsReceivedNoteLines" gl
        JOIN "Purchases"."GoodsReceivedNotes" g ON g."tenantId" = gl."tenantId" AND g.id = gl."grnId"
       WHERE gl."tenantId" = "vTenant" AND g.status = 'POSTED'
         AND (gl.id = "vLine"."grnLineId"
              OR ("vLine"."grnLineId" IS NULL AND gl."grnId" = "vBill"."grnId" AND gl."itemId" = "vLine"."itemId"))
       ORDER BY gl."lineNo"
       LIMIT 1;
      "vMatched" := FOUND;
      IF NOT "vMatched" AND "vLine"."grnLineId" IS NOT NULL THEN
        RAISE EXCEPTION 'Bill %: line % refers to a GRN line that is not posted', "vBill"."docNo", "vLine"."lineNo"
          USING ERRCODE = 'object_not_in_prerequisite_state';
      END IF;

      IF "vMatched" AND "vGrnLine"."isImport" THEN
        -- import bill: FOB into GRN clearing; the landed-cost journal capitalises it
        "vLines" := "vLines" || jsonb_build_object('accountRole', 'GRNI', 'debit', "vNet",
                      'particulars', 'Import goods (FOB) line ' || "vLine"."lineNo");
      ELSIF "vMatched" THEN
        "vQty"  := "vLine"."baseQty" + "vLine"."bonusQty";
        "vGrni" := round("vQty" * "vGrnLine"."unitCost", 2);
        "vLines" := "vLines" || jsonb_build_object('accountRole', 'GRNI', 'debit', "vGrni",
                      'particulars', 'GRN clearing line ' || "vLine"."lineNo");
        "vVar" := "vNet" - "vGrni";
        IF "vVar" <> 0 THEN
          "vPart" := "Inventory"."productRevalueAvgCost"("vLine"."itemId", "vVar", "vQty", 'GRN');
          "vLines" := "vLines"
            || jsonb_build_object('accountId', "Inventory"."getWarehouseInventoryAccount"("vGrnLine"."warehouseId"),
                                  'debit', "vPart", 'particulars', 'Price variance line ' || "vLine"."lineNo")
            || jsonb_build_object('accountRole', 'COGS', 'debit', "vVar" - "vPart",
                                  'particulars', 'Price variance on units already sold, line ' || "vLine"."lineNo");
        END IF;
      ELSE
        -- direct receipt (counter purchase / bill without GRN)
        IF "vBill"."warehouseId" IS NULL THEN
          RAISE EXCEPTION 'Bill %: choose the receiving warehouse for stock line %', "vBill"."docNo", "vLine"."lineNo"
            USING ERRCODE = 'check_violation';
        END IF;
        "vLines" := "vLines" || jsonb_build_object('accountId', COALESCE("vLine"."accountId", "vInv"), 'debit', "vNet",
                      'particulars', COALESCE("vLine".description, 'Stock line ' || "vLine"."lineNo"),
                      'costCentreId', COALESCE("vLine"."costCentreId", "vBill"."costCentreId"));
        IF "vLine"."totalQty" > 0 THEN
          "vCost"  := round("vLine"."netUnitCost" * "vFx", 4);
          "vBatch" := "Inventory"."batchResolve"("vLine"."itemId", "vLine"."batchId", "vLine"."batchNo",
                                                 "vLine"."expiryDate", "vCost", "vDocType", "pId");
          PERFORM "Inventory"."stockMove"(jsonb_build_object(
            'itemId', "vLine"."itemId", 'warehouseId', "vBill"."warehouseId", 'batchId', "vBatch",
            'qtyIn', "vLine"."totalQty", 'unitCost', "vCost", 'movementType', 'GRN',
            'movementDate', "vBill"."docDate", 'sourceDocType', "vDocType", 'sourceDocId', "pId",
            'sourceDocNo', "vBill"."docNo", 'sourceLineId', "vLine".id, 'partyLabel', "vVendor".name));
        END IF;
      END IF;

      -- "Update sale price": Products.price only, never below the purchase price (CHECK price >= cost)
      IF "vLine"."updateItemSalePrice" AND "vLine"."salePrice" IS NOT NULL THEN
        SELECT i.price, i.cost, i.status INTO "vOldPrice", "vItemCost", "vItemState"
          FROM "Inventory"."Products" i WHERE i."tenantId" = "vTenant" AND i.id = "vLine"."itemId";
        IF round("vLine"."salePrice", 2) IS DISTINCT FROM "vOldPrice"
           AND ("vItemState" = 'DRAFT' OR round("vLine"."salePrice", 2) >= "vItemCost") THEN
          UPDATE "Inventory"."Products" i SET price = round("vLine"."salePrice", 2)
           WHERE i."tenantId" = "vTenant" AND i.id = "vLine"."itemId";
          INSERT INTO "Inventory"."ProductPriceLogs"
                 ("tenantId", "itemId", "priceField", "oldValue", "newValue", "changedByUserId", source)
          VALUES ("vTenant", "vLine"."itemId", 'PRICE', "vOldPrice", round("vLine"."salePrice", 2),
                  "Company"."getCurrentUserId"(), 'GRN');
        END IF;
      END IF;
    END IF;

    IF "vLine"."taxAmount" > 0 THEN
      "vLines" := "vLines" || jsonb_build_object(
        'accountId', COALESCE((SELECT tc."inputAccountId" FROM "Tax"."TaxCodes" tc
                                WHERE tc."tenantId" = "vTenant" AND tc.id = "vLine"."taxCodeId"),
                              "Company"."getAccountForRole"('INPUT_GST')),
        'debit', round("vLine"."taxAmount" * "vFx", 2), 'particulars', 'Input tax line ' || "vLine"."lineNo");
    END IF;
  END LOOP;

  "vLines" := "vLines"
    || jsonb_build_object('accountRole', 'ADVANCE_TAX_236G', 'debit', round("vBill"."advanceTaxAmount" * "vFx", 2),
                          'particulars', 'Advance tax u/s 236G')
    || jsonb_build_object('accountId', "vAp", 'credit', round("vBill"."netPayableAmount" * "vFx", 2),
                          'vendorId', "vBill"."vendorId", 'particulars', "vNarr")
    || jsonb_build_object('accountRole', 'WHT_PAYABLE_153', 'credit', round("vBill"."whtAmount" * "vFx", 2),
                          'particulars', 'WHT withheld — ' || "vVendor".name);

  IF "vBill"."paidNowAmount" > 0 THEN
    -- a cheque credits PDC payable until it clears in the cheque register (Dr PDC payable / Cr bank)
    IF "vBill"."payMode" = 'CHEQUE' THEN
      "vPayAcc" := "Company"."getAccountForRole"('PDC_PAYABLE');
    ELSE
      "vPayAcc" := "Purchases"."getPaymentSourceAccount"(
                     CASE WHEN "vBill"."payMode" = 'CASH' THEN "vBill"."cashAccountId" END,
                     CASE WHEN "vBill"."payMode" <> 'CASH' THEN "vBill"."bankAccountId" END);
    END IF;
    "vLines" := "vLines"
      || jsonb_build_object('accountId', "vAp", 'debit', round("vBill"."paidNowAmount" * "vFx", 2),
                            'vendorId', "vBill"."vendorId", 'particulars', 'Paid now')
      || jsonb_build_object('accountId', "vPayAcc", 'credit', round("vBill"."paidNowAmount" * "vFx", 2),
                            'particulars', 'Paid now — ' || "vVendor".name);
  END IF;

  IF "vFx" <> 1 THEN                                   -- foreign currency rounding
    SELECT COALESCE(sum(COALESCE((x ->> 'debit')::numeric, 0) - COALESCE((x ->> 'credit')::numeric, 0)), 0)
      INTO "vDiff" FROM jsonb_array_elements("vLines") x;
    IF "vDiff" <> 0 THEN
      "vLines" := "vLines" || jsonb_build_object('accountRole', 'ROUNDING', 'credit', "vDiff", 'particulars', 'FX rounding');
    END IF;
  END IF;

  "vJe" := "Accounting"."journalCreate"(
    jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vBill"."docDate", 'branchId', "vBill"."branchId",
                       'narration', "vNarr", 'sourceDocType', "vDocType", 'sourceDocId', "pId",
                       'sourceDocNo', "vBill"."docNo", 'partyName', "vVendor".name),
    "vLines");

  IF "vBill"."payMode" = 'CHEQUE' AND "vBill"."paidNowAmount" > 0 AND "vBill"."chequeId" IS NULL THEN
    "vCheque" := "Purchases"."chequeIssue"("vBill"."docDate", "vBill"."branchId", "vBill"."vendorId", "vVendor".name,
                                           "vBill"."bankAccountId", "vBill"."chequeNo", "vBill"."paidNowAmount",
                                           "vJe", "vNarr");
  END IF;
  UPDATE "Purchases"."VendorBills" b
     SET "journalEntryId" = "vJe", "chequeId" = COALESCE("vCheque", b."chequeId")
   WHERE b."tenantId" = "vTenant" AND b.id = "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 3. Voids: blocked once the cheque is presented / cleared; they may cancel their own cheque
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."vendorPaymentVoid"("pId" uuid, "pReason" text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Purchases"."VendorPayments";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."VendorPayments" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VendorPayments % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'VOID' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'PRESENTED', 'CLEARED') THEN
    RAISE EXCEPTION 'VendorPayments %: cannot void from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow".status = 'CLEARED' OR EXISTS (SELECT 1 FROM "BankCash"."Cheques" c WHERE c."tenantId" = "vRow"."tenantId" AND c.id = "vRow"."chequeId" AND c.status IN ('PRESENTED', 'CLEARED')) THEN
    RAISE EXCEPTION 'Payment %: its cheque has been presented / cleared, so it can no longer be voided', "vRow"."docNo"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PAYMENT_CHEQUE_CLEARED';
  END IF;
  -- the void cancels its own cheque (the cheque-link guard lets it)
  PERFORM set_config('app.payablesVoid', 'on', true);
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."vendorPaymentVoidEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."vendorPaymentVoidEntries"') USING "pId";
  END IF;
  PERFORM set_config('app.payablesVoid', '', true);
  UPDATE "Purchases"."VendorPayments" t SET status = 'VOID', "voidedAt" = now(), "voidReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Purchases"."vendorBillVoid"("pId" uuid, "pReason" text DEFAULT NULL::text)
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
  IF "vRow".status = 'VOID' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'POSTED', 'PARTIALLY_PAID', 'PAID') THEN
    RAISE EXCEPTION 'VendorBills %: cannot void from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF EXISTS (SELECT 1 FROM "BankCash"."Cheques" c WHERE c."tenantId" = "vRow"."tenantId" AND c.id = "vRow"."chequeId" AND c.status IN ('PRESENTED', 'CLEARED')) THEN
    RAISE EXCEPTION 'Bill %: its cheque has been presented / cleared, so it can no longer be voided', "vRow"."docNo"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PAYMENT_CHEQUE_CLEARED';
  END IF;
  -- the void cancels its own cheque (the cheque-link guard lets it)
  PERFORM set_config('app.payablesVoid', 'on', true);
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."vendorBillVoidEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."vendorBillVoidEntries"') USING "pId";
  END IF;
  PERFORM set_config('app.payablesVoid', '', true);
  UPDATE "Purchases"."VendorBills" t SET status = 'VOID', "voidedAt" = now(), "voidReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Cheque ↔ payment link: the cheque register presents / clears the payment; bouncing, stopping or cancelling the
--    cheque of a live vendor payment or bill is blocked (void the payment / bill, which cancels its cheque)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."triggerChequePaymentGuard"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  "vDoc" text;
BEGIN
  IF NEW.direction <> 'ISSUED' OR NEW.status NOT IN ('BOUNCED', 'CANCELLED', 'STOPPED', 'REPLACED')
     OR COALESCE(current_setting('app.payablesVoid', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  SELECT p."docNo" INTO "vDoc" FROM "Purchases"."VendorPayments" p
   WHERE p."tenantId" = NEW."tenantId" AND p."chequeId" = NEW.id AND p.status <> 'VOID' LIMIT 1;
  IF "vDoc" IS NULL THEN
    SELECT b."docNo" INTO "vDoc" FROM "Purchases"."VendorBills" b
     WHERE b."tenantId" = NEW."tenantId" AND b."chequeId" = NEW.id AND b.status <> 'VOID' LIMIT 1;
  END IF;
  IF "vDoc" IS NOT NULL THEN
    RAISE EXCEPTION 'Cheque % pays %; void that document instead (it cancels the cheque and reverses the payment)', NEW."chequeNo", "vDoc"
      USING ERRCODE = 'check_violation', HINT = 'CHEQUE_LINKED_TO_PAYMENT';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "chequesPaymentGuard" ON "BankCash"."Cheques";
CREATE TRIGGER "chequesPaymentGuard" BEFORE UPDATE OF status ON "BankCash"."Cheques"
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION "Purchases"."triggerChequePaymentGuard"();

CREATE OR REPLACE FUNCTION "Purchases"."triggerChequePaymentStatus"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.direction = 'ISSUED' AND NEW.status IN ('PRESENTED', 'CLEARED') THEN
    UPDATE "Purchases"."VendorPayments" p
       SET status = NEW.status,
           "clearedOn" = CASE WHEN NEW.status = 'CLEARED' THEN COALESCE(NEW."clearedOn", current_date) ELSE p."clearedOn" END
     WHERE p."tenantId" = NEW."tenantId" AND p."chequeId" = NEW.id AND p.status IN ('POSTED', 'PRESENTED');
  END IF;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "chequesPaymentStatus" ON "BankCash"."Cheques";
CREATE TRIGGER "chequesPaymentStatus" AFTER UPDATE OF status ON "BankCash"."Cheques"
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION "Purchases"."triggerChequePaymentStatus"();

-- ---------------------------------------------------------------------------
-- 5. Refund received on a debit note: BRV (bank) or CRV (cash) Dr bank / cash, Cr the vendor's payable
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."debitNoteRefund"("pId" uuid, "pDate" date, "pCashAccountId" uuid, "pBankAccountId" uuid, "pAmount" numeric)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "d"       "Purchases"."DebitNotes";
  "vVendor" record;
  "vAp"     uuid;
  "vGl"     uuid;
  "vJe"     uuid;
BEGIN
  SELECT * INTO "d" FROM "Purchases"."DebitNotes" t WHERE t."tenantId" = "vTenant" AND t.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debit note % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "d".status <> 'OPEN' THEN
    RAISE EXCEPTION 'Debit note %: only an open note can be refunded (it is %)', "d"."docNo", "d".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'DEBIT_NOTE_NOT_EDITABLE';
  END IF;
  IF COALESCE("pAmount", 0) <= 0 OR "pAmount" > "d"."balanceAmount" THEN
    RAISE EXCEPTION 'Debit note %: the refund must be more than 0 and at most the open balance %', "d"."docNo", "d"."balanceAmount"
      USING ERRCODE = 'check_violation', HINT = 'ALLOCATION_EXCEEDS_BALANCE';
  END IF;
  SELECT v.name, v."payableAccountId" INTO "vVendor" FROM "Purchases"."Vendors" v WHERE v."tenantId" = "vTenant" AND v.id = "d"."vendorId";
  "vAp" := COALESCE("vVendor"."payableAccountId", "Company"."getAccountForRole"('AP_CONTROL'));
  "vGl" := "Purchases"."getPaymentSourceAccount"("pCashAccountId", CASE WHEN "pCashAccountId" IS NULL THEN "pBankAccountId" END);
  "vJe" := "BankCash"."postBankingVoucher"(CASE WHEN "pCashAccountId" IS NOT NULL THEN 'CRV' ELSE 'BRV' END, "pDate", "d"."branchId",
             'Refund received on debit note ' || "d"."docNo" || ' — ' || "vVendor".name, "vGl", "vVendor".name,
             NULL, NULL, 'DN', "d".id, "d"."docNo",
             jsonb_build_array(
               jsonb_build_object('accountId', "vAp", 'credit', "pAmount", 'particulars', 'Refund — ' || "vVendor".name, 'vendorId', "d"."vendorId"),
               jsonb_build_object('accountId', "vGl", 'debit', "pAmount", 'particulars', 'Refund received', 'isAutoContra', true)));
  UPDATE "Purchases"."DebitNotes" t SET "refundedAmount" = t."refundedAmount" + "pAmount" WHERE t."tenantId" = "vTenant" AND t.id = "pId";
  PERFORM "Purchases"."refreshDebitNoteSettlement"("vTenant", "pId");
  RETURN "vJe";
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('RETURN_QTY_EXCEEDS',         409, 'BUSINESS_RULE', 'PURCHASES', 'You can''t return more than was received on that bill, less what was already returned.', 'Purchase return above the returnable quantity', true, NULL),
  ('RETURN_NOT_EDITABLE',        409, 'BUSINESS_RULE', 'PURCHASES', 'Only a draft purchase return can be changed. Cancel a posted one instead.', 'Edit of a posted purchase return', true, NULL),
  ('DEBIT_NOTE_EXCEEDS_BILL',    409, 'BUSINESS_RULE', 'PURCHASES', 'The debit note is more than the bill it is raised against.', 'Debit note above the bill amount', true, NULL),
  ('DEBIT_NOTE_NOT_EDITABLE',    409, 'BUSINESS_RULE', 'PURCHASES', 'Only a draft debit note can be changed; an open one can be applied or refunded.', 'Edit of a posted debit note', true, NULL),
  ('ALLOCATION_EXCEEDS_BALANCE', 400, 'VALIDATION',    'PURCHASES', 'The amount is more than the open balance.', 'Allocation / refund above the open balance', true, NULL),
  ('PAYMENT_APPROVAL_REQUIRED',  409, 'BUSINESS_RULE', 'PURCHASES', 'An approval workflow covers this payment. Submit it for approval.', 'Direct post of a payment a workflow routes', true, NULL),
  ('PAYMENT_NOT_EDITABLE',       409, 'BUSINESS_RULE', 'PURCHASES', 'Only a draft payment can be changed. Void a posted one instead.', 'Edit of a submitted / posted payment', true, NULL),
  ('PAYMENT_CHEQUE_CLEARED',     409, 'BUSINESS_RULE', 'PURCHASES', 'The cheque has been presented or cleared, so it can''t be voided.', 'Void after the cheque was presented / cleared', true, NULL),
  ('CHEQUE_LINKED_TO_PAYMENT',   409, 'BUSINESS_RULE', 'FINANCE',   'This cheque pays a vendor payment or bill. Void that document instead.', 'Register action on a payment''s cheque', true, NULL),
  ('DB_INVALID_STATE',           409, 'CONFLICT',      NULL,        'This document isn''t in a state that allows this. Reload it and check its status.', 'object_not_in_prerequisite_state raised by a database function', true, '55000')
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;


-- ---------------------------------------------------------------------------
-- 7. Returns and debit notes at stock value: stock leaves at book value (difference to the bill rate → COGS);
--    product claims without stock out revalue average cost (logged as DEBIT_NOTE), and the void takes it back
-- ---------------------------------------------------------------------------
INSERT INTO "Lookups"."Lookups" ("lookupType", code, label, tone, "sortOrder", "isActive", "isSystem", "tenantId")
SELECT 'ProductPriceLogSource', 'DEBIT_NOTE', 'Debit note', 'neutral', 8, true, true, NULL
 WHERE NOT EXISTS (SELECT 1 FROM "Lookups"."Lookups" WHERE "lookupType" = 'ProductPriceLogSource' AND code = 'DEBIT_NOTE' AND "tenantId" IS NULL);

CREATE OR REPLACE FUNCTION "Purchases"."purchaseReturnPostEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant"  uuid := "Company"."getCurrentTenantId"();
  "vDoc"     record;
  "vVendor"  record;
  "vLine"    record;
  "vBill"    record;
  "vInv"     uuid;
  "vDr"      uuid;
  "vBatch"   uuid;
  "vLines"   jsonb := '[]'::jsonb;
  "vNet"     numeric(18,2) := 0;
  "vVal"     numeric(18,2) := 0;
  "vTax"     numeric(18,2) := 0;
  "vAlloc"   numeric(18,2);
  "vDn"      uuid;
  "vJe"      uuid;
BEGIN
  SELECT r.* INTO "vDoc" FROM "Purchases"."PurchaseReturns" r WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase return % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Purchases"."PurchaseReturnLines" l WHERE l."tenantId" = "vTenant" AND l."purchaseReturnId" = "pId") THEN
    RAISE EXCEPTION 'Purchase return %: add at least one line before posting', "vDoc"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  SELECT v.* INTO "vVendor" FROM "Purchases"."Vendors" v WHERE v."tenantId" = "vTenant" AND v.id = "vDoc"."vendorId";
  "vInv" := "Inventory"."getWarehouseInventoryAccount"("vDoc"."warehouseId");

  FOR "vLine" IN
    SELECT l.* FROM "Purchases"."PurchaseReturnLines" l
     WHERE l."tenantId" = "vTenant" AND l."purchaseReturnId" = "pId" ORDER BY l."lineNo"
  LOOP
    "vBatch" := "vLine"."batchId";
    IF "vBatch" IS NULL AND "vLine"."batchNo" IS NOT NULL THEN
      SELECT pb.id INTO "vBatch" FROM "Inventory"."ProductBatches" pb
       WHERE pb."tenantId" = "vTenant" AND pb."itemId" = "vLine"."itemId" AND pb."batchNo" = btrim("vLine"."batchNo");
      IF "vBatch" IS NULL THEN
        RAISE EXCEPTION 'Purchase return %: batch % of line % is not in stock', "vDoc"."docNo", "vLine"."batchNo", "vLine"."lineNo"
          USING ERRCODE = 'no_data_found';
      END IF;
    END IF;
    "vVal" := "vVal" + "Inventory"."stockIssue"(jsonb_build_object(
      'itemId', "vLine"."itemId", 'warehouseId', "vDoc"."warehouseId", 'batchId', "vBatch",
      'qtyOut', "vLine"."returnQty" + "vLine"."bonusQty", 'movementType', 'PURCHASE_RETURN',
      'movementDate', "vDoc"."docDate", 'sourceDocType', 'PR', 'sourceDocId', "pId",
      'sourceDocNo', "vDoc"."docNo", 'sourceLineId', "vLine".id, 'partyLabel', "vVendor".name));
    "vNet" := "vNet" + "vLine"."grossAmount" - "vLine"."discountAmount";
    "vTax" := "vTax" + "vLine"."taxAmount";
    IF "vLine"."taxAmount" > 0 THEN
      "vLines" := "vLines" || jsonb_build_object(
        'accountId', COALESCE((SELECT tc."inputAccountId" FROM "Tax"."TaxCodes" tc
                                WHERE tc."tenantId" = "vTenant" AND tc.id = "vLine"."taxCodeId"),
                              "Company"."getAccountForRole"('INPUT_GST')),
        'credit', "vLine"."taxAmount", 'particulars', 'Input tax reversed, line ' || "vLine"."lineNo");
    END IF;
  END LOOP;
  IF "vNet" + "vTax" <> "vDoc"."totalAmount" THEN
    RAISE EXCEPTION 'Purchase return %: line totals (%) differ from the net amount (%); recalculate and save',
      "vDoc"."docNo", "vNet" + "vTax", "vDoc"."totalAmount" USING ERRCODE = 'check_violation';
  END IF;

  IF "vDoc".settlement = 'CASH_REFUND' THEN
    "vDr" := "Purchases"."getPaymentSourceAccount"("vDoc"."cashAccountId", NULL);
    "vLines" := "vLines" || jsonb_build_object('accountId', "vDr", 'debit', "vDoc"."totalAmount",
                                               'particulars', 'Cash refund — ' || "vVendor".name);
  ELSE
    "vDr" := COALESCE("vVendor"."payableAccountId", "Company"."getAccountForRole"('AP_CONTROL'));
    "vLines" := "vLines" || jsonb_build_object('accountId', "vDr", 'debit', "vDoc"."totalAmount",
                                               'vendorId', "vDoc"."vendorId", 'particulars', 'Purchase return ' || "vDoc"."docNo");
  END IF;
  -- stock leaves at its book value; the difference to the bill rate is a purchase price difference (COGS)
  "vLines" := "vLines" || jsonb_build_object('accountId', "vInv", 'credit', "vVal", 'particulars', 'Goods returned')
                       || jsonb_build_object('accountRole', 'COGS', 'credit', "vNet" - "vVal", 'particulars', 'Price difference on goods returned');

  "vJe" := "Accounting"."journalCreate"(
    jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vDoc"."docDate", 'branchId', "vDoc"."branchId",
                       'narration', 'Purchase return ' || "vDoc"."docNo" || ' — ' || "vVendor".name
                                    || COALESCE(' (' || "vDoc"."supplierBillNo" || ')', ''),
                       'sourceDocType', 'PR', 'sourceDocId', "pId", 'sourceDocNo', "vDoc"."docNo",
                       'partyName', "vVendor".name),
    "vLines");
  UPDATE "Purchases"."PurchaseReturns" r SET "journalEntryId" = "vJe" WHERE r."tenantId" = "vTenant" AND r.id = "pId";

  -- AP sub-ledger: the settlement debit note, allocated to the reference bill
  IF "vDoc".settlement = 'CREDIT' AND "vDoc"."billId" IS NOT NULL THEN
    SELECT b.status, b."balanceAmount" INTO "vBill"
      FROM "Purchases"."VendorBills" b WHERE b."tenantId" = "vTenant" AND b.id = "vDoc"."billId";
    "vAlloc" := CASE WHEN "vBill".status IN ('POSTED', 'PARTIALLY_PAID', 'PAID')
                     THEN LEAST("vDoc"."totalAmount", "vBill"."balanceAmount") ELSE 0 END;
    INSERT INTO "Purchases"."DebitNotes"
           ("tenantId", "docNo", "docDate", "vendorId", "branchId", "billId", reason, "reasonNote", "warehouseId",
            settlement, "netAmount", "taxAmount", "totalAmount", "whtAmount", remarks, "purchaseReturnId")
    VALUES ("vTenant", "Company"."getNextDocNo"('DN', "vDoc"."docDate", "vDoc"."branchId"), "vDoc"."docDate",
            "vDoc"."vendorId", "vDoc"."branchId", "vDoc"."billId", 'PURCHASE_RETURN',
            'Purchase return ' || "vDoc"."docNo", "vDoc"."warehouseId", 'ADJUST_AGAINST_BILL',
            "vNet", "vTax", "vDoc"."totalAmount", 0, "vDoc"."debitNoteNarration", "pId")
    RETURNING id INTO "vDn";
    IF "vAlloc" > 0 THEN
      INSERT INTO "Purchases"."VendorPaymentAllocations"
             ("tenantId", "debitNoteId", "billId", "allocationDate", amount, remarks)
      VALUES ("vTenant", "vDn", "vDoc"."billId", "vDoc"."docDate", "vAlloc", 'Purchase return ' || "vDoc"."docNo");
    END IF;
    -- open it with its applied amount in the same update (the settlement refresh is then a no-op)
    UPDATE "Purchases"."DebitNotes" d
       SET status = CASE WHEN "vAlloc" >= d."totalAmount" THEN 'APPLIED' ELSE 'OPEN' END,
           "appliedAmount" = "vAlloc", "postedAt" = now(), "journalEntryId" = "vJe"
     WHERE d."tenantId" = "vTenant" AND d.id = "vDn";
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION "Purchases"."debitNotePostEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant"  uuid := "Company"."getCurrentTenantId"();
  "vDoc"     record;
  "vVendor"  record;
  "vLine"    record;
  "vAp"      uuid;
  "vInv"     uuid;
  "vAcc"     uuid;
  "vLines"   jsonb := '[]'::jsonb;
  "vSumNet"  numeric(18,2);
  "vSumTax"  numeric(18,2);
  "vBalance" numeric(18,2);
  "vAlloc"   numeric(18,2);
  "vStock"   boolean;
  "vVal"     numeric(18,2);
  "vPart"    numeric(18,2);
  "vJe"      uuid;
BEGIN
  SELECT d.* INTO "vDoc" FROM "Purchases"."DebitNotes" d WHERE d."tenantId" = "vTenant" AND d.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debit note % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vDoc"."purchaseReturnId" IS NOT NULL THEN
    RETURN;                                           -- settlement instrument of a purchase return
  END IF;
  SELECT COALESCE(sum(l."netAmount"), 0), COALESCE(sum(l."taxAmount"), 0) INTO "vSumNet", "vSumTax"
    FROM "Purchases"."DebitNoteLines" l WHERE l."tenantId" = "vTenant" AND l."debitNoteId" = "pId";
  IF "vSumNet" + "vSumTax" = 0 THEN
    RAISE EXCEPTION 'Debit note %: add at least one line with a value', "vDoc"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  IF "vSumNet" <> "vDoc"."netAmount" OR "vSumTax" <> "vDoc"."taxAmount" THEN
    RAISE EXCEPTION 'Debit note %: line totals (net %, tax %) differ from the header (net %, tax %)',
      "vDoc"."docNo", "vSumNet", "vSumTax", "vDoc"."netAmount", "vDoc"."taxAmount" USING ERRCODE = 'check_violation';
  END IF;
  SELECT v.* INTO "vVendor" FROM "Purchases"."Vendors" v WHERE v."tenantId" = "vTenant" AND v.id = "vDoc"."vendorId";
  SELECT COALESCE(b."payableAccountId", "vVendor"."payableAccountId"), b."balanceAmount" INTO "vAp", "vBalance"
    FROM "Purchases"."VendorBills" b WHERE b."tenantId" = "vTenant" AND b.id = "vDoc"."billId";
  "vAp"    := COALESCE("vAp", "Company"."getAccountForRole"('AP_CONTROL'));
  "vInv"   := "Inventory"."getWarehouseInventoryAccount"("vDoc"."warehouseId");
  "vStock" := "vDoc".reason IN ('PURCHASE_RETURN', 'QUALITY_REJECTION');

  FOR "vLine" IN
    SELECT l.*, bl."accountId" AS "billAccountId"
      FROM "Purchases"."DebitNoteLines" l
      LEFT JOIN "Purchases"."VendorBillLines" bl ON bl."tenantId" = l."tenantId" AND bl.id = l."billLineId"
     WHERE l."tenantId" = "vTenant" AND l."debitNoteId" = "pId"
     ORDER BY l."lineNo"
  LOOP
    IF "vLine"."itemId" IS NOT NULL AND "vStock" AND "vLine"."returnQty" > 0 THEN
      -- goods sent back: stock leaves at its book value, the difference to the bill rate goes to COGS
      "vVal" := "Inventory"."stockIssue"(jsonb_build_object(
        'itemId', "vLine"."itemId", 'warehouseId', "vDoc"."warehouseId", 'batchId', "vLine"."batchId",
        'qtyOut', "vLine"."returnQty", 'movementType', 'PURCHASE_RETURN', 'movementDate', "vDoc"."docDate",
        'sourceDocType', 'DN', 'sourceDocId', "pId", 'sourceDocNo', "vDoc"."docNo",
        'sourceLineId', "vLine".id, 'partyLabel', "vVendor".name));
      "vLines" := "vLines"
        || jsonb_build_object('accountId', "vInv", 'credit', "vVal", 'particulars', COALESCE("vLine".description, 'Goods returned, line ' || "vLine"."lineNo"))
        || jsonb_build_object('accountRole', 'COGS', 'credit', "vLine"."netAmount" - "vVal", 'particulars', 'Price difference, line ' || "vLine"."lineNo");
    ELSIF "vLine"."itemId" IS NOT NULL THEN
      -- a claim on a product (price / short supply): average cost comes down for units on hand, the rest to COGS
      "vPart" := -"Inventory"."productRevalueAvgCost"("vLine"."itemId", -"vLine"."netAmount",
                   COALESCE(NULLIF("vLine"."returnQty", 0), NULLIF("vLine"."billedQty", 0), 1), 'DEBIT_NOTE');
      "vLines" := "vLines"
        || jsonb_build_object('accountId', "vInv", 'credit', "vPart", 'particulars', COALESCE("vLine".description, 'Debit note line ' || "vLine"."lineNo"))
        || jsonb_build_object('accountRole', 'COGS', 'credit', "vLine"."netAmount" - "vPart", 'particulars', 'Claim on units already sold, line ' || "vLine"."lineNo");
    ELSE
      "vAcc" := COALESCE("vLine"."billAccountId", "vVendor"."defaultAccountId");
      IF "vAcc" IS NULL THEN
        RAISE EXCEPTION 'Debit note %: line % needs the account of its bill line', "vDoc"."docNo", "vLine"."lineNo"
          USING ERRCODE = 'check_violation';
      END IF;
      "vLines" := "vLines" || jsonb_build_object('accountId', "vAcc", 'credit', "vLine"."netAmount",
                    'particulars', COALESCE("vLine".description, 'Debit note line ' || "vLine"."lineNo"));
    END IF;
    IF "vLine"."taxAmount" > 0 THEN
      "vLines" := "vLines" || jsonb_build_object(
        'accountId', COALESCE((SELECT tc."inputAccountId" FROM "Tax"."TaxCodes" tc
                                WHERE tc."tenantId" = "vTenant" AND tc.id = "vLine"."taxCodeId"),
                              "Company"."getAccountForRole"('INPUT_GST')),
        'credit', "vLine"."taxAmount", 'particulars', 'Input tax reversed, line ' || "vLine"."lineNo");
    END IF;
  END LOOP;
  "vLines" := "vLines"
    || jsonb_build_object('accountId', "vAp", 'debit', "vDoc"."totalAmount" - "vDoc"."whtAmount",
                          'vendorId', "vDoc"."vendorId", 'particulars', 'Debit note ' || "vDoc"."docNo")
    || jsonb_build_object('accountRole', 'WHT_PAYABLE_153', 'debit', "vDoc"."whtAmount",
                          'particulars', 'WHT adjustment');

  "vJe" := "Accounting"."journalCreate"(
    jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vDoc"."docDate", 'branchId', "vDoc"."branchId",
                       'narration', 'Debit note ' || "vDoc"."docNo" || ' — ' || "vVendor".name
                                    || COALESCE(' · ' || "vDoc"."reasonNote", ''),
                       'sourceDocType', 'DN', 'sourceDocId', "pId", 'sourceDocNo', "vDoc"."docNo",
                       'partyName', "vVendor".name),
    "vLines");
  UPDATE "Purchases"."DebitNotes" d SET "journalEntryId" = "vJe" WHERE d."tenantId" = "vTenant" AND d.id = "pId";

  IF "vDoc".settlement = 'ADJUST_AGAINST_BILL' THEN
    "vAlloc" := LEAST("vDoc"."totalAmount" - "vDoc"."whtAmount", COALESCE("vBalance", 0));
    IF "vAlloc" > 0 THEN
      INSERT INTO "Purchases"."VendorPaymentAllocations"
             ("tenantId", "debitNoteId", "billId", "allocationDate", amount, remarks)
      VALUES ("vTenant", "pId", "vDoc"."billId", "vDoc"."docDate", "vAlloc", 'Debit note ' || "vDoc"."docNo");
    END IF;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION "Purchases"."debitNoteVoidEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vDoc"    record;
BEGIN
  SELECT d.* INTO "vDoc" FROM "Purchases"."DebitNotes" d WHERE d."tenantId" = "vTenant" AND d.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debit note % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vDoc"."refundedAmount" > 0 THEN
    RAISE EXCEPTION 'Debit note %: the vendor already refunded %; reverse the refund before voiding', "vDoc"."docNo",
      "vDoc"."refundedAmount" USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- its settlements against bills are reversed (the void needs appliedAmount = 0)
  UPDATE "Purchases"."VendorPaymentAllocations" a
     SET "isReversed" = true, "reversedAt" = now()
   WHERE a."tenantId" = "vTenant" AND a."debitNoteId" = "pId" AND NOT a."isReversed";
  IF "vDoc".status = 'DRAFT' THEN
    RETURN;
  END IF;
  -- a DN raised by a purchase return has no DN journal / stock of its own (nothing is found here)
  -- take back the average-cost revaluation of product claims (no stock out)
  IF "vDoc".reason NOT IN ('PURCHASE_RETURN', 'QUALITY_REJECTION') OR "vDoc"."purchaseReturnId" IS NULL THEN
    PERFORM "Inventory"."productRevalueAvgCost"(l."itemId", l."netAmount", COALESCE(NULLIF(l."returnQty", 0), NULLIF(l."billedQty", 0), 1), 'DEBIT_NOTE')
       FROM "Purchases"."DebitNoteLines" l
      WHERE l."tenantId" = "vTenant" AND l."debitNoteId" = "pId" AND l."itemId" IS NOT NULL
        AND NOT ("vDoc".reason IN ('PURCHASE_RETURN', 'QUALITY_REJECTION') AND l."returnQty" > 0);
  END IF;
  PERFORM "Accounting"."journalReverseForSource"('DN', "pId", 'OTHER', current_date);
  PERFORM "Inventory"."stockReverseForSource"('DN', "pId");
END $function$;

SELECT set_config('app.actorLabel', '', false);
