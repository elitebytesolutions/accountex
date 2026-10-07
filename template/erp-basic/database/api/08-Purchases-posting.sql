-- =============================================================================
-- Finsoft ERP (Basic edition) — API: Purchases posting hooks   (hand-written)
--
-- The generated actions in 08-Purchases-api.sql (<entity>Post / Void / Cancel)
-- call "Purchases"."<entity><Action>Entries"(id) BEFORE they change the status,
-- so every hook still sees the document as DRAFT / APPROVED (post) or in its
-- posted state (void / cancel). Journals go through "Accounting"."journalCreate"
-- / "journalReverseForSource", stock through "Inventory"."stockMove" (directly
-- or via the Inventory helpers in api/09-Inventory-posting.sql, resolved at run
-- time). Rules: POSTING_RULES.md › Purchases & payables.
--
--   goodsReceivedNotePostEntries / CancelEntries   GRN   stock IN, Dr INVENTORY / Cr GRNI
--   vendorBillPostEntries / VoidEntries            BILL (STANDARD) / PV (COUNTER) incl. paid-now and cheque
--   debitNotePostEntries                           DN    (ready for a Post action — none is generated yet)
--   debitNoteVoidEntries                           DN
--   vendorPaymentPostEntries / VoidEntries         PAY   WHT withheld now, bank charges, issued cheque
-- Purchase returns (PR) and landed cost (LC) are Full-only (no tables in Basic).
-- No financial or stock effect (no hook): purchaseOrderApprove / Cancel, vendorBillApprove.
--
-- Every AP line carries the vendor sub-ledger ("vendorId"). Amounts of a bill or
-- payment in a foreign currency are converted with the document "fxRate"; the
-- rounding difference goes to role ROUNDING.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: an issued cheque (BankCash.Cheques) for a payment / counter purchase.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."chequeIssue"("pDocDate" date, "pBranchId" uuid, "pVendorId" uuid,
                                                    "pPartyName" text, "pBankAccountId" uuid, "pChequeNo" text,
                                                    "pAmount" numeric, "pJournalEntryId" uuid, "pRemarks" text)
RETURNS uuid LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vNo"     text := regexp_replace(COALESCE("pChequeNo", ''), '[^0-9]', '', 'g');
  "vBank"   uuid;
  "vId"     uuid;
BEGIN
  IF "vNo" !~ '^[0-9]{4,10}$' THEN
    RAISE EXCEPTION 'Cheque number "%" is not valid: it needs 4 to 10 digits', "pChequeNo" USING ERRCODE = 'check_violation';
  END IF;
  SELECT ba."bankId" INTO "vBank" FROM "BankCash"."BankAccounts" ba
   WHERE ba."tenantId" = "vTenant" AND ba.id = "pBankAccountId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose the bank account the cheque is issued from' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "BankCash"."Cheques" c
              WHERE c."tenantId" = "vTenant" AND c.direction = 'ISSUED'
                AND c."bankAccountId" = "pBankAccountId" AND c."chequeNo" = "vNo") THEN
    RAISE EXCEPTION 'Cheque % was already issued from this bank account', "vNo" USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO "BankCash"."Cheques"
         ("tenantId", "docNo", "docDate", "branchId", direction, "chequeNo", "vendorId", "partyName",
          "drawnOnBankId", "bankAccountId", "chequeDate", amount, "postingMode", status, "journalEntryId", remarks)
  VALUES ("vTenant", "Company"."getNextDocNo"('CHQ', "pDocDate", "pBranchId"), "pDocDate", "pBranchId", 'ISSUED',
          "vNo", "pVendorId", "pPartyName", "vBank", "pBankAccountId", "pDocDate", "pAmount", 'DEPOSIT', 'ISSUED',
          "pJournalEntryId", left("pRemarks", 300))
  RETURNING id INTO "vId";
  RETURN "vId";
END $$;
COMMENT ON FUNCTION "Purchases"."chequeIssue"(date, uuid, uuid, text, uuid, text, numeric, uuid, text) IS
  'Records the issued cheque of a vendor payment / counter purchase (BankCash.Cheques, status ISSUED).';

-- Helper: GL account of a cash / bank source (BankCash.CashAccounts / BankAccounts).
CREATE OR REPLACE FUNCTION "Purchases"."getPaymentSourceAccount"("pCashAccountId" uuid, "pBankAccountId" uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"  uuid := "Company"."getCurrentTenantId"();
  "vAccount" uuid;
BEGIN
  IF "pCashAccountId" IS NOT NULL THEN
    SELECT ca."accountId" INTO "vAccount" FROM "BankCash"."CashAccounts" ca
     WHERE ca."tenantId" = "vTenant" AND ca.id = "pCashAccountId";
  ELSIF "pBankAccountId" IS NOT NULL THEN
    SELECT ba."accountId" INTO "vAccount" FROM "BankCash"."BankAccounts" ba
     WHERE ba."tenantId" = "vTenant" AND ba.id = "pBankAccountId";
  END IF;
  IF "vAccount" IS NULL THEN
    RAISE EXCEPTION 'Choose the cash or bank account the money is paid from / received into'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN "vAccount";
END $$;

-- ---------------------------------------------------------------------------
-- Goods received note (GRN): stock IN for acceptedQty at the PO rate
--   Dr INVENTORY (warehouse account) Σ acceptedAmount / Cr GRNI
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."goodsReceivedNotePostEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vDoc"    record;
  "vLine"   record;
  "vOver"   record;
  "vVendor" text;
  "vInv"    uuid;
  "vBatch"  uuid;
  "vTotal"  numeric(18,2) := 0;
  "vLines"  jsonb := '[]'::jsonb;
  "vJe"     uuid;
BEGIN
  SELECT g.* INTO "vDoc" FROM "Purchases"."GoodsReceivedNotes" g WHERE g."tenantId" = "vTenant" AND g.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRN % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Purchases"."GoodsReceivedNoteLines" gl
                  WHERE gl."tenantId" = "vTenant" AND gl."grnId" = "pId" AND gl."acceptedQty" > 0) THEN
    RAISE EXCEPTION 'GRN %: no accepted quantity to receive', "vDoc"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  SELECT s."poLineNo", s.accepted, s."openQty" INTO "vOver"
    FROM (SELECT pl."lineNo" AS "poLineNo", sum(gl."acceptedQty") AS accepted,
                 pl."baseQty" + pl."bonusQty" - pl."receivedQty" AS "openQty"
            FROM "Purchases"."GoodsReceivedNoteLines" gl
            JOIN "Purchases"."PurchaseOrderLines" pl ON pl."tenantId" = gl."tenantId" AND pl.id = gl."purchaseOrderLineId"
           WHERE gl."tenantId" = "vTenant" AND gl."grnId" = "pId"
           GROUP BY pl.id, pl."lineNo", pl."baseQty", pl."bonusQty", pl."receivedQty") s
   WHERE s.accepted > s."openQty"
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'OVER_RECEIPT: GRN % accepts % on PO line % but only % is still open',
      "vDoc"."docNo", "vOver".accepted, "vOver"."poLineNo", "vOver"."openQty" USING ERRCODE = 'check_violation';
  END IF;
  SELECT v.name INTO "vVendor" FROM "Purchases"."Vendors" v WHERE v."tenantId" = "vTenant" AND v.id = "vDoc"."vendorId";
  "vInv" := "Inventory"."getWarehouseInventoryAccount"("vDoc"."warehouseId");

  FOR "vLine" IN
    SELECT gl.* FROM "Purchases"."GoodsReceivedNoteLines" gl
     WHERE gl."tenantId" = "vTenant" AND gl."grnId" = "pId" AND gl."acceptedQty" > 0
     ORDER BY gl."lineNo"
  LOOP
    "vBatch" := "Inventory"."batchResolve"("vLine"."itemId", "vLine"."batchId", "vLine"."batchNo",
                                           "vLine"."expiryDate", "vLine"."unitCost", 'GRN', "pId");
    PERFORM "Inventory"."stockMove"(jsonb_build_object(
      'itemId', "vLine"."itemId", 'warehouseId', "vDoc"."warehouseId", 'batchId', "vBatch",
      'qtyIn', "vLine"."acceptedQty", 'unitCost', "vLine"."unitCost", 'movementType', 'GRN',
      'movementDate', "vDoc"."docDate", 'sourceDocType', 'GRN', 'sourceDocId', "pId",
      'sourceDocNo', "vDoc"."docNo", 'sourceLineId', "vLine".id, 'partyLabel', "vVendor"));
    "vLines" := "vLines" || jsonb_build_object('accountId', "vInv", 'debit', "vLine"."acceptedAmount",
                                               'particulars', 'GRN ' || "vDoc"."docNo" || ' line ' || "vLine"."lineNo");
    "vTotal" := "vTotal" + "vLine"."acceptedAmount";
  END LOOP;

  IF "vTotal" > 0 THEN
    "vLines" := "vLines" || jsonb_build_object('accountRole', 'GRNI', 'credit', "vTotal",
                                               'particulars', 'Goods received not invoiced — ' || COALESCE("vVendor", ''));
    "vJe" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vDoc"."docDate", 'branchId', "vDoc"."branchId",
                         'narration', 'GRN ' || "vDoc"."docNo" || ' — ' || COALESCE("vVendor", ''),
                         'sourceDocType', 'GRN', 'sourceDocId', "pId", 'sourceDocNo', "vDoc"."docNo",
                         'partyName', "vVendor"),
      "vLines");
    UPDATE "Purchases"."GoodsReceivedNotes" g SET "journalEntryId" = "vJe" WHERE g."tenantId" = "vTenant" AND g.id = "pId";
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "Purchases"."goodsReceivedNoteCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vDoc"    record;
BEGIN
  SELECT g.* INTO "vDoc" FROM "Purchases"."GoodsReceivedNotes" g WHERE g."tenantId" = "vTenant" AND g.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRN % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vDoc".status <> 'POSTED' THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM "Purchases"."GoodsReceivedNoteLines" gl
              WHERE gl."tenantId" = "vTenant" AND gl."grnId" = "pId" AND gl."billedQty" > 0) THEN
    RAISE EXCEPTION 'GRN % is already billed; void the bill first', "vDoc"."docNo"
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  PERFORM "Accounting"."journalReverseForSource"('GRN', "pId", 'OTHER', current_date);
  PERFORM "Inventory"."stockReverseForSource"('GRN', "pId");
END $$;

-- ---------------------------------------------------------------------------
-- Vendor bill (BILL, channel STANDARD) / purchase voucher (PV, channel COUNTER)
--   lines with a GRN line : Dr GRNI (billed qty × GRN cost); price variance
--                           Dr INVENTORY (stock on hand, avgCost revalued) / COGS (sold share)
--   stock lines, no GRN   : Dr INVENTORY netAmount; stock IN totalQty at netUnitCost
--   non-stock lines       : Dr line account (expense) with cost centre
--   Dr INPUT_GST (tax code input account) · Dr ADVANCE_TAX_236G
--   Cr AP (vendor) netPayableAmount · Cr WHT_PAYABLE_153 whtAmount
--   PV paid now           : Dr AP (vendor) / Cr cash / bank; cheque mode issues a cheque
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."vendorBillPostEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
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
      -- non-stock line: expense account with its cost centre
      "vAcc" := COALESCE("vLine"."accountId", "vVendor"."defaultAccountId");
      IF "vAcc" IS NULL THEN
        RAISE EXCEPTION 'Bill %: line % needs an expense account', "vBill"."docNo", "vLine"."lineNo"
          USING ERRCODE = 'check_violation';
      END IF;
      "vLines" := "vLines" || jsonb_build_object('accountId', "vAcc", 'debit', "vNet",
                    'particulars', COALESCE("vLine".description, 'Line ' || "vLine"."lineNo"),
                    'costCentreId', COALESCE("vLine"."costCentreId", "vBill"."costCentreId"));
    ELSE
      -- stock line: matched to a posted GRN line (explicit, or the bill's GRN by item)?
      SELECT gl.id, gl."unitCost", g."warehouseId" INTO "vGrnLine"
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

      IF "vMatched" THEN
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
    "vPayAcc" := "Purchases"."getPaymentSourceAccount"(
                   CASE WHEN "vBill"."payMode" = 'CASH' THEN "vBill"."cashAccountId" END,
                   CASE WHEN "vBill"."payMode" <> 'CASH' THEN "vBill"."bankAccountId" END);
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
END $$;

CREATE OR REPLACE FUNCTION "Purchases"."vendorBillVoidEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"  uuid := "Company"."getCurrentTenantId"();
  "vBill"    record;
  "vLine"    record;
  "vDocType" text;
  "vFx"      numeric;
  "vQty"     numeric(18,3);
  "vVar"     numeric(18,2);
BEGIN
  SELECT b.* INTO "vBill" FROM "Purchases"."VendorBills" b WHERE b."tenantId" = "vTenant" AND b.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor bill % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vBill".status NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID') THEN
    RETURN;                                           -- never posted: nothing to reverse
  END IF;
  IF EXISTS (SELECT 1 FROM "Purchases"."VendorPaymentAllocations" a
              WHERE a."tenantId" = "vTenant" AND a."billId" = "pId" AND NOT a."isReversed") THEN
    RAISE EXCEPTION 'Bill % has payments or debit notes allocated; reverse them before voiding', "vBill"."docNo"
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  "vDocType" := CASE WHEN "vBill".channel = 'COUNTER' THEN 'PV' ELSE 'BILL' END;
  "vFx" := COALESCE(NULLIF("vBill"."fxRate", 0), 1);

  PERFORM "Accounting"."journalReverseForSource"("vDocType", "pId", 'OTHER', current_date);
  PERFORM "Inventory"."stockReverseForSource"("vDocType", "pId");

  -- take back the price-variance revaluation of GRN-matched lines
  FOR "vLine" IN
    SELECT l."itemId", l."baseQty", l."bonusQty", l."netAmount", m."grnUnitCost"
      FROM "Purchases"."VendorBillLines" l
      JOIN LATERAL (SELECT gl."unitCost" AS "grnUnitCost"
                      FROM "Purchases"."GoodsReceivedNoteLines" gl
                      JOIN "Purchases"."GoodsReceivedNotes" g ON g."tenantId" = gl."tenantId" AND g.id = gl."grnId"
                     WHERE gl."tenantId" = l."tenantId" AND g.status = 'POSTED'
                       AND (gl.id = l."grnLineId"
                            OR (l."grnLineId" IS NULL AND gl."grnId" = "vBill"."grnId" AND gl."itemId" = l."itemId"))
                     ORDER BY gl."lineNo"
                     LIMIT 1) m ON true
     WHERE l."tenantId" = "vTenant" AND l."billId" = "pId" AND l."itemId" IS NOT NULL
  LOOP
    "vQty" := "vLine"."baseQty" + "vLine"."bonusQty";
    "vVar" := round("vLine"."netAmount" * "vFx", 2) - round("vQty" * "vLine"."grnUnitCost", 2);
    IF "vVar" <> 0 THEN
      PERFORM "Inventory"."productRevalueAvgCost"("vLine"."itemId", -"vVar", "vQty", 'GRN');
    END IF;
  END LOOP;

  IF "vBill"."chequeId" IS NOT NULL THEN
    UPDATE "BankCash"."Cheques" c SET status = 'CANCELLED'
     WHERE c."tenantId" = "vTenant" AND c.id = "vBill"."chequeId" AND c.status IN ('ISSUED', 'STOPPED');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Debit note (DN)
--   Dr AP (vendor) creditAmount · Dr WHT_PAYABLE_153 whtAmount
--   Cr INVENTORY netAmount (non-stock lines: the bill line account) · Cr INPUT_GST taxAmount
--   Stock OUT returnQty for PURCHASE_RETURN / QUALITY_REJECTION (PURCHASE_RETURN at average)
--   ADJUST_AGAINST_BILL: allocation to the bill (VendorPaymentAllocations)
-- No generated action posts a debit note yet (DRAFT → OPEN); this hook is ready
-- for it. Void is wired.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."debitNotePostEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
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
  "vJe"      uuid;
BEGIN
  SELECT d.* INTO "vDoc" FROM "Purchases"."DebitNotes" d WHERE d."tenantId" = "vTenant" AND d.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debit note % not found', "pId" USING ERRCODE = 'no_data_found';
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
    IF "vLine"."itemId" IS NOT NULL THEN
      "vAcc" := "vInv";
      IF "vStock" AND "vLine"."returnQty" > 0 THEN
        PERFORM "Inventory"."stockIssue"(jsonb_build_object(
          'itemId', "vLine"."itemId", 'warehouseId', "vDoc"."warehouseId", 'batchId', "vLine"."batchId",
          'qtyOut', "vLine"."returnQty", 'movementType', 'PURCHASE_RETURN', 'movementDate', "vDoc"."docDate",
          'sourceDocType', 'DN', 'sourceDocId', "pId", 'sourceDocNo', "vDoc"."docNo",
          'sourceLineId', "vLine".id, 'partyLabel', "vVendor".name));
      END IF;
    ELSE
      "vAcc" := COALESCE("vLine"."billAccountId", "vVendor"."defaultAccountId");
      IF "vAcc" IS NULL THEN
        RAISE EXCEPTION 'Debit note %: line % needs the account of its bill line', "vDoc"."docNo", "vLine"."lineNo"
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    "vLines" := "vLines" || jsonb_build_object('accountId', "vAcc", 'credit', "vLine"."netAmount",
                  'particulars', COALESCE("vLine".description, 'Debit note line ' || "vLine"."lineNo"));
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
END $$;

CREATE OR REPLACE FUNCTION "Purchases"."debitNoteVoidEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
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
  PERFORM "Accounting"."journalReverseForSource"('DN', "pId", 'OTHER', current_date);
  PERFORM "Inventory"."stockReverseForSource"('DN', "pId");
END $$;

-- ---------------------------------------------------------------------------
-- Vendor payment (PAY)
--   Dr AP (vendor) amount + WHT withheld now · Cr bank / cash amount · Cr WHT_PAYABLE_153
--   Dr BANK_CHARGES / Cr bank · CHEQUE: issued cheque linked in chequeId
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Purchases"."vendorPaymentPostEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vDoc"    record;
  "vVendor" record;
  "vFx"     numeric;
  "vAp"     uuid;
  "vSrc"    uuid;
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
  "vSrc" := "Purchases"."getPaymentSourceAccount"(CASE WHEN "vDoc".method = 'CASH' THEN "vDoc"."cashAccountId" END,
                                                  CASE WHEN "vDoc".method <> 'CASH' THEN "vDoc"."bankAccountId" END);
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
    jsonb_build_object('accountId', "vSrc", 'credit', round("vDoc"."bankChargesAmount" * "vFx", 2),
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
  END IF;
  UPDATE "Purchases"."VendorPayments" p
     SET "journalEntryId" = "vJe", "chequeId" = COALESCE("vCheque", p."chequeId")
   WHERE p."tenantId" = "vTenant" AND p.id = "pId";
END $$;

CREATE OR REPLACE FUNCTION "Purchases"."vendorPaymentVoidEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vDoc"    record;
BEGIN
  SELECT p.* INTO "vDoc" FROM "Purchases"."VendorPayments" p WHERE p."tenantId" = "vTenant" AND p.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor payment % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  -- allocations are reversed (the void needs allocatedAmount = 0); bill balances follow by trigger
  UPDATE "Purchases"."VendorPaymentAllocations" a
     SET "isReversed" = true, "reversedAt" = now()
   WHERE a."tenantId" = "vTenant" AND a."vendorPaymentId" = "pId" AND NOT a."isReversed";
  IF "vDoc".status NOT IN ('POSTED', 'PRESENTED', 'CLEARED') THEN
    RETURN;
  END IF;
  PERFORM "Accounting"."journalReverseForSource"('PAY', "pId", 'OTHER', current_date);
  IF "vDoc"."chequeId" IS NOT NULL THEN
    UPDATE "BankCash"."Cheques" c SET status = 'CANCELLED'
     WHERE c."tenantId" = "vTenant" AND c.id = "vDoc"."chequeId" AND c.status IN ('ISSUED', 'STOPPED');
  END IF;
END $$;
