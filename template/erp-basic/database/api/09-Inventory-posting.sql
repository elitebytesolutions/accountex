-- =============================================================================
-- Finsoft ERP (Basic edition) — API: Inventory posting hooks   (hand-written)
--
-- The generated actions in 09-Inventory-api.sql (<entity>Post / Approve /
-- Cancel) call "Inventory"."<entity><Action>Entries"(id) BEFORE they change the
-- status, so every hook below still sees the document in its old status.
-- Hooks write stock only through "Inventory"."stockMove" and journals only
-- through "Accounting"."journalCreate" / "Accounting"."journalReverseForSource"
-- (api/00-Posting-api.sql). Rules: POSTING_RULES.md › Inventory (inv).
--
-- Shared helpers (also used by api/08-Purchases-posting.sql; PL/pgSQL resolves
-- them at run time, so the install order of the two files does not matter):
--   "Inventory"."getWarehouseInventoryAccount"(warehouse)   warehouse GL account, else role INVENTORY
--   "Inventory"."batchResolve"(item, batch, batchNo, …)     existing batch, or create it from batchNo
--   "Inventory"."stockMoveValue"(movement)                  stockMove + the absolute ledger value
--   "Inventory"."stockIssue"(movement)                      outgoing stock, FEFO over batches; returns cost
--   "Inventory"."stockReverseForSource"(type, id)           mirror rows for every ledger row of a document
--   "Inventory"."batchWriteOffEmptied"(type, id)            batch → WRITTEN_OFF once a write-off empties it
--   "Inventory"."productRevalueAvgCost"(item, amount, qty, source)
--                                                           value-only revaluation of avgCost (bill price variance)
--
-- Hooks:
--   stockInOutEntryPostEntries / CancelEntries      MI / MO   (manual stock in / out)
--   stockTransferPostEntries / CancelEntries        TRF       (dispatch: TRANSFER_OUT, transit JV)
--   stockTransferReceiveEntries                     TRF       (receipt: TRANSFER_IN in full;
--                                                              ready for a Receive action — not generated yet)
--   stockAdjustmentPostEntries / CancelEntries      ADJ
-- Stock counts, stock vouchers and assembly are Full-only (no tables in Basic).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Inventory GL account of a warehouse (Warehouses.inventoryAccountId), else role INVENTORY.
CREATE OR REPLACE FUNCTION "Inventory"."getWarehouseInventoryAccount"("pWarehouseId" uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vAccount" uuid;
BEGIN
  SELECT w."inventoryAccountId" INTO "vAccount"
    FROM "Inventory"."Warehouses" w
   WHERE w."tenantId" = "Company"."getCurrentTenantId"() AND w.id = "pWarehouseId";
  RETURN COALESCE("vAccount", "Company"."getAccountForRole"('INVENTORY'));
END $$;
COMMENT ON FUNCTION "Inventory"."getWarehouseInventoryAccount"(uuid) IS
  'GL inventory account of a warehouse; falls back to the INVENTORY posting role.';

-- The batch of a receipt line: the given batch id, else the item's batch with
-- this number, else a new Inventory.ProductBatches row. NULL when no batch is given.
CREATE OR REPLACE FUNCTION "Inventory"."batchResolve"("pItemId" uuid, "pBatchId" uuid, "pBatchNo" text,
                                                     "pExpiryDate" date DEFAULT NULL, "pUnitCost" numeric DEFAULT NULL,
                                                     "pSourceDocType" text DEFAULT NULL, "pSourceDocId" uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vId"     uuid;
BEGIN
  IF "pBatchId" IS NOT NULL THEN
    RETURN "pBatchId";
  END IF;
  IF NULLIF(btrim("pBatchNo"), '') IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT b.id INTO "vId"
    FROM "Inventory"."ProductBatches" b
   WHERE b."tenantId" = "vTenant" AND b."itemId" = "pItemId" AND b."batchNo" = btrim("pBatchNo");
  IF "vId" IS NULL THEN
    INSERT INTO "Inventory"."ProductBatches"
           ("tenantId", "itemId", "batchNo", "expiryDate", "unitCost", "sourceDocType", "sourceDocId")
    VALUES ("vTenant", "pItemId", btrim("pBatchNo"), "pExpiryDate", "pUnitCost",
            CASE WHEN "pSourceDocId" IS NOT NULL THEN "pSourceDocType" END, "pSourceDocId")
    RETURNING id INTO "vId";
  END IF;
  RETURN "vId";
END $$;

-- stockMove that also returns the absolute value of the ledger row it wrote
-- (outgoing rows are costed by the ledger trigger at the moving average).
CREATE OR REPLACE FUNCTION "Inventory"."stockMoveValue"("pMove" jsonb) RETURNS numeric
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vId"    uuid;
  "vValue" numeric(18,2);
BEGIN
  "vId" := "Inventory"."stockMove"("pMove");
  SELECT abs(m.value) INTO "vValue"
    FROM "Inventory"."StockMovements" m
   WHERE m."tenantId" = "Company"."getCurrentTenantId"() AND m.id = "vId";
  RETURN COALESCE("vValue", 0);
END $$;

-- Outgoing stock. With a batch (or for an item without batch stock) one ledger
-- row; otherwise the quantity is picked FEFO over the item's batches in the
-- warehouse (earliest expiry first, written-off batches skipped). Expiry-tracked
-- items must be covered by batches; other items take the rest from the
-- unbatched slot (the ledger trigger then applies the negative-stock rule).
-- Returns the cost value that left stock.
CREATE OR REPLACE FUNCTION "Inventory"."stockIssue"("pMove" jsonb) RETURNS numeric
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
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
        USING ERRCODE = 'check_violation';
    END IF;
    "vValue" := "vValue" + "Inventory"."stockMoveValue"("pMove" || jsonb_build_object('qtyOut', "vLeft"));
  END IF;
  RETURN "vValue";
END $$;
COMMENT ON FUNCTION "Inventory"."stockIssue"(jsonb) IS
  'Outgoing stock for a document line, FEFO over batches when no batch is given; returns the cost value issued.';

-- Mirror rows (in <-> out, same cost, same movement type) for every ledger row
-- of a document that has not been reversed yet. Used by Void / Cancel hooks.
CREATE OR REPLACE FUNCTION "Inventory"."stockReverseForSource"("pSourceDocType" text, "pSourceDocId" uuid)
RETURNS integer LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    record;
  "vCount"  integer := 0;
BEGIN
  FOR "vRow" IN
    SELECT m.* FROM "Inventory"."StockMovements" m
     WHERE m."tenantId" = "vTenant" AND m."sourceDocType" = "pSourceDocType" AND m."sourceDocId" = "pSourceDocId"
       AND COALESCE(m.remarks, '') NOT LIKE 'Reversal of %'
       AND NOT EXISTS (SELECT 1 FROM "Inventory"."StockMovements" r
                        WHERE r."tenantId" = m."tenantId" AND r."sourceDocType" = m."sourceDocType"
                          AND r."sourceDocId" = m."sourceDocId" AND r.remarks = 'Reversal of ' || m.id::text)
     ORDER BY m.seq DESC
  LOOP
    PERFORM "Inventory"."stockMove"(jsonb_build_object(
      'itemId', "vRow"."itemId", 'warehouseId', "vRow"."warehouseId", 'binId', "vRow"."binId",
      'batchId', "vRow"."batchId", 'qtyIn', "vRow"."qtyOut", 'qtyOut', "vRow"."qtyIn",
      'unitCost', "vRow"."unitCost", 'movementType', "vRow"."movementType", 'movementDate', current_date,
      'sourceDocType', "vRow"."sourceDocType", 'sourceDocId', "vRow"."sourceDocId",
      'sourceDocNo', "vRow"."sourceDocNo", 'sourceLineId', "vRow"."sourceLineId",
      'partyLabel', "vRow"."partyLabel", 'counterWarehouseId', "vRow"."counterWarehouseId",
      'remarks', 'Reversal of ' || "vRow".id::text));
    "vCount" := "vCount" + 1;
  END LOOP;
  RETURN "vCount";
END $$;
COMMENT ON FUNCTION "Inventory"."stockReverseForSource"(text, uuid) IS
  'Writes mirror ledger rows for a voided / cancelled document (append-only ledger; idempotent).';

-- A batch that a write-off emptied becomes WRITTEN_OFF.
CREATE OR REPLACE FUNCTION "Inventory"."batchWriteOffEmptied"("pSourceDocType" text, "pSourceDocId" uuid)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
BEGIN
  UPDATE "Inventory"."ProductBatches" b
     SET disposition = 'WRITTEN_OFF'
   WHERE b."tenantId" = "vTenant" AND b.disposition <> 'WRITTEN_OFF'
     AND b.id IN (SELECT m."batchId" FROM "Inventory"."StockMovements" m
                   WHERE m."tenantId" = "vTenant" AND m."sourceDocType" = "pSourceDocType"
                     AND m."sourceDocId" = "pSourceDocId" AND m."movementType" = 'WRITE_OFF'
                     AND m."batchId" IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM "Inventory"."StockBalances" sb
                      WHERE sb."tenantId" = "vTenant" AND sb."batchId" = b.id AND sb."qtyOnHand" > 0);
END $$;

-- Value-only revaluation of the moving average (bill price variance). The
-- ledger cannot carry value-only rows, so avgCost is updated directly (Basic
-- has no price-history table; pSource is kept for parity with Full).
--   affected = min(on hand, pQty); stock part = pAmount × affected ÷ pQty
--   new avg  = old avg + stock part ÷ on hand
-- Returns the stock part (the caller debits it to inventory and the rest —
-- the share of units already sold — to cost of sales).
CREATE OR REPLACE FUNCTION "Inventory"."productRevalueAvgCost"("pItemId" uuid, "pAmount" numeric, "pQty" numeric,
                                                              "pSource" text)
RETURNS numeric LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vOnHand" numeric(18,3);
  "vOld"    numeric(18,4);
  "vNew"    numeric(18,4);
  "vPart"   numeric(18,2);
BEGIN
  IF COALESCE("pAmount", 0) = 0 OR COALESCE("pQty", 0) <= 0 THEN
    RETURN 0;
  END IF;
  SELECT i."avgCost" INTO "vOld"
    FROM "Inventory"."Products" i
   WHERE i."tenantId" = "vTenant" AND i.id = "pItemId"
     FOR UPDATE;
  SELECT COALESCE(sum(sb."qtyOnHand"), 0) INTO "vOnHand"
    FROM "Inventory"."StockBalances" sb
   WHERE sb."tenantId" = "vTenant" AND sb."itemId" = "pItemId";
  IF "vOnHand" <= 0 THEN
    RETURN 0;
  END IF;
  "vPart" := round("pAmount" * LEAST("vOnHand", "pQty") / "pQty", 2);
  "vNew"  := GREATEST(round("vOld" + "vPart" / "vOnHand", 4), 0);
  IF "vNew" IS DISTINCT FROM "vOld" THEN
    UPDATE "Inventory"."Products" i
       SET "avgCost" = "vNew"
     WHERE i."tenantId" = "vTenant" AND i.id = "pItemId";
  END IF;
  RETURN "vPart";
END $$;
COMMENT ON FUNCTION "Inventory"."productRevalueAvgCost"(uuid, numeric, numeric, text) IS
  'Revalues Products.avgCost by a value (bill price variance); returns the part kept in stock.';

-- ---------------------------------------------------------------------------
-- Manual stock in / out (MI / MO) — Inventory.StockInOut
--   IN : OPENING / MANUAL_IN at the line cost   Dr inventory / Cr reason account (OPENING_BALANCE_EQUITY)
--   OUT: MANUAL_OUT / WRITE_OFF at average      Dr reason account (STOCK_WRITE_OFF) / Cr inventory
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Inventory"."stockInOutEntryPostEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"  uuid := "Company"."getCurrentTenantId"();
  "vDoc"     record;
  "vReason"  record;
  "vLine"    record;
  "vDocType" text;
  "vType"    text;
  "vInv"     uuid;
  "vOffset"  uuid;
  "vBranch"  uuid;
  "vWhName"  text;
  "vBatch"   uuid;
  "vValue"   numeric(18,2) := 0;
  "vJe"      uuid;
BEGIN
  SELECT e.* INTO "vDoc" FROM "Inventory"."StockInOut" e WHERE e."tenantId" = "vTenant" AND e.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock entry % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vDoc"."reasonId" IS NULL THEN
    RAISE EXCEPTION 'Stock entry %: choose a movement reason before posting', "vDoc"."docNo"
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT r.* INTO "vReason" FROM "Inventory"."StockMovementReasons" r
   WHERE r."tenantId" = "vTenant" AND r.id = "vDoc"."reasonId";
  IF "vReason".direction IS DISTINCT FROM "vDoc".mode THEN
    RAISE EXCEPTION 'Stock entry %: reason % is not a stock-% reason', "vDoc"."docNo", "vReason".label, lower("vDoc".mode)
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Inventory"."StockInOutEntryLines" l WHERE l."tenantId" = "vTenant" AND l."entryId" = "pId") THEN
    RAISE EXCEPTION 'Stock entry %: add at least one line before posting', "vDoc"."docNo" USING ERRCODE = 'check_violation';
  END IF;

  "vDocType" := CASE WHEN "vDoc".mode = 'IN' THEN 'MI' ELSE 'MO' END;
  "vType"    := "vReason"."ledgerMovementType";
  "vInv"     := "Inventory"."getWarehouseInventoryAccount"("vDoc"."warehouseId");
  "vOffset"  := COALESCE("vReason"."expenseAccountId",
                         "Company"."getAccountForRole"(CASE "vType" WHEN 'OPENING' THEN 'OPENING_BALANCE_EQUITY'
                                                                    WHEN 'WRITE_OFF' THEN 'STOCK_WRITE_OFF'
                                                                    ELSE 'STOCK_ADJUSTMENT' END));
  SELECT w."branchId", w.name INTO "vBranch", "vWhName"
    FROM "Inventory"."Warehouses" w WHERE w."tenantId" = "vTenant" AND w.id = "vDoc"."warehouseId";

  FOR "vLine" IN
    SELECT l.* FROM "Inventory"."StockInOutEntryLines" l
     WHERE l."tenantId" = "vTenant" AND l."entryId" = "pId" ORDER BY l."lineNo"
  LOOP
    IF "vDoc".mode = 'IN' THEN
      "vBatch" := "Inventory"."batchResolve"("vLine"."itemId", "vLine"."batchId", "vLine"."newBatchNo",
                                             "vLine"."newExpiryDate", "vLine"."unitCost", "vDocType", "pId");
      "vValue" := "vValue" + "Inventory"."stockMoveValue"(jsonb_build_object(
        'itemId', "vLine"."itemId", 'warehouseId', "vDoc"."warehouseId", 'binId', "vDoc"."binId",
        'batchId', "vBatch", 'qtyIn', "vLine".qty, 'unitCost', "vLine"."unitCost",
        'movementType', "vType", 'movementDate', "vDoc"."docDate",
        'sourceDocType', "vDocType", 'sourceDocId', "pId", 'sourceDocNo', "vDoc"."docNo",
        'sourceLineId', "vLine".id, 'partyLabel', "vReason".label, 'remarks', "vDoc"."manualRef"));
    ELSE
      "vValue" := "vValue" + "Inventory"."stockIssue"(jsonb_build_object(
        'itemId', "vLine"."itemId", 'warehouseId', "vDoc"."warehouseId", 'binId', "vDoc"."binId",
        'batchId', "vLine"."batchId", 'qtyOut', "vLine".qty,
        'movementType', "vType", 'movementDate', "vDoc"."docDate",
        'sourceDocType', "vDocType", 'sourceDocId', "pId", 'sourceDocNo', "vDoc"."docNo",
        'sourceLineId', "vLine".id, 'partyLabel', "vReason".label, 'remarks', "vDoc"."manualRef"));
    END IF;
  END LOOP;
  IF "vType" = 'WRITE_OFF' THEN
    PERFORM "Inventory"."batchWriteOffEmptied"("vDocType", "pId");
  END IF;

  IF "vValue" > 0 THEN
    "vJe" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vDoc"."docDate", 'branchId', "vBranch",
                         'narration', CASE WHEN "vDoc".mode = 'IN' THEN 'Manual stock in ' ELSE 'Manual stock out ' END
                                      || "vDoc"."docNo" || ' — ' || "vReason".label || ' · ' || COALESCE("vWhName", ''),
                         'sourceDocType', "vDocType", 'sourceDocId', "pId", 'sourceDocNo', "vDoc"."docNo"),
      jsonb_build_array(
        jsonb_build_object('accountId', CASE WHEN "vDoc".mode = 'IN' THEN "vInv" ELSE "vOffset" END,
                           'debit', "vValue", 'particulars', "vReason".label),
        jsonb_build_object('accountId', CASE WHEN "vDoc".mode = 'IN' THEN "vOffset" ELSE "vInv" END,
                           'credit', "vValue", 'particulars', "vReason".label)));
    UPDATE "Inventory"."StockInOut" e SET "journalEntryId" = "vJe" WHERE e."tenantId" = "vTenant" AND e.id = "pId";
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "Inventory"."stockInOutEntryCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vDoc"     record;
  "vDocType" text;
BEGIN
  SELECT e.* INTO "vDoc" FROM "Inventory"."StockInOut" e
   WHERE e."tenantId" = "Company"."getCurrentTenantId"() AND e.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock entry % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vDoc".status <> 'POSTED' THEN
    RETURN;                                           -- a draft has no postings
  END IF;
  "vDocType" := CASE WHEN "vDoc".mode = 'IN' THEN 'MI' ELSE 'MO' END;
  PERFORM "Accounting"."journalReverseForSource"("vDocType", "pId", 'OTHER', current_date);
  PERFORM "Inventory"."stockReverseForSource"("vDocType", "pId");
END $$;

-- ---------------------------------------------------------------------------
-- Stock transfer (TRF) — Inventory.StockTransfers
--   Post (dispatch): TRANSFER_OUT at the source at average cost;
--                    Dr STOCK_IN_TRANSIT / Cr source inventory only when the two
--                    warehouses use different inventory accounts.
--   Receive: TRANSFER_IN at the destination in full, at the dispatch cost
--            (Basic has no transfer receipt lines, so no shortage / excess).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Inventory"."stockTransferPostEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"  uuid := "Company"."getCurrentTenantId"();
  "vDoc"     record;
  "vLine"    record;
  "vFromAcc" uuid;
  "vToAcc"   uuid;
  "vBranch"  uuid;
  "vToName"  text;
  "vValue"   numeric(18,2) := 0;
  "vJe"      uuid;
BEGIN
  SELECT t.* INTO "vDoc" FROM "Inventory"."StockTransfers" t WHERE t."tenantId" = "vTenant" AND t.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock transfer % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Inventory"."StockTransferLines" l WHERE l."tenantId" = "vTenant" AND l."transferId" = "pId") THEN
    RAISE EXCEPTION 'Stock transfer %: add at least one line before posting', "vDoc"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  SELECT w."branchId" INTO "vBranch" FROM "Inventory"."Warehouses" w
   WHERE w."tenantId" = "vTenant" AND w.id = "vDoc"."fromWarehouseId";
  SELECT w.name INTO "vToName" FROM "Inventory"."Warehouses" w
   WHERE w."tenantId" = "vTenant" AND w.id = "vDoc"."toWarehouseId";
  "vFromAcc" := "Inventory"."getWarehouseInventoryAccount"("vDoc"."fromWarehouseId");
  "vToAcc"   := "Inventory"."getWarehouseInventoryAccount"("vDoc"."toWarehouseId");

  FOR "vLine" IN
    SELECT l.* FROM "Inventory"."StockTransferLines" l
     WHERE l."tenantId" = "vTenant" AND l."transferId" = "pId" ORDER BY l."lineNo"
  LOOP
    "vValue" := "vValue" + "Inventory"."stockIssue"(jsonb_build_object(
      'itemId', "vLine"."itemId", 'warehouseId', "vDoc"."fromWarehouseId", 'binId', "vLine"."fromBinId",
      'batchId', "vLine"."batchId", 'qtyOut', "vLine"."baseQty", 'movementType', 'TRANSFER_OUT',
      'movementDate', "vDoc"."docDate", 'counterWarehouseId', "vDoc"."toWarehouseId",
      'sourceDocType', 'TRF', 'sourceDocId', "pId", 'sourceDocNo', "vDoc"."docNo",
      'sourceLineId', "vLine".id, 'partyLabel', "vToName"));
  END LOOP;

  IF "vFromAcc" <> "vToAcc" AND "vValue" > 0 THEN
    "vJe" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vDoc"."docDate", 'branchId', "vBranch",
                         'narration', 'Stock transfer ' || "vDoc"."docNo" || ' dispatched to ' || COALESCE("vToName", ''),
                         'sourceDocType', 'TRF', 'sourceDocId', "pId", 'sourceDocNo', "vDoc"."docNo"),
      jsonb_build_array(
        jsonb_build_object('accountRole', 'STOCK_IN_TRANSIT', 'debit', "vValue", 'particulars', 'Stock in transit'),
        jsonb_build_object('accountId', "vFromAcc", 'credit', "vValue", 'particulars', 'Transfer out')));
    UPDATE "Inventory"."StockTransfers" t SET "journalEntryId" = "vJe" WHERE t."tenantId" = "vTenant" AND t.id = "pId";
  END IF;
END $$;

-- Receipt at the destination. No generated action calls it yet (the API has
-- only Post / Cancel); wire it into the transfer Receive action when it exists.
-- journalCreate keeps one live voucher per source document, so a dispatch JV is
-- reversed here and replaced by a single receipt JV (Dr destination / Cr source,
-- shortage and excess lines) — the in-transit balance is cleared either way.
CREATE OR REPLACE FUNCTION "Inventory"."stockTransferReceiveEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"   uuid := "Company"."getCurrentTenantId"();
  "vDoc"      record;
  "vLine"     record;
  "vOut"      record;
  "vFromAcc"  uuid;
  "vToAcc"    uuid;
  "vBranch"   uuid;
  "vFromName" text;
  "vLeft"     numeric(18,3);
  "vTake"     numeric(18,3);
  "vLastCost" numeric(18,4);
  "vLastBatch" uuid;
  "vIn"       numeric(18,2) := 0;
  "vShort"    numeric(18,2) := 0;
  "vExcess"   numeric(18,2) := 0;
  "vMoveAmt"  numeric(18,2);
  "vJe"       uuid;
BEGIN
  SELECT t.* INTO "vDoc" FROM "Inventory"."StockTransfers" t WHERE t."tenantId" = "vTenant" AND t.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock transfer % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vDoc".status NOT IN ('POSTED', 'DISPATCHED', 'IN_TRANSIT') THEN
    RAISE EXCEPTION 'Stock transfer % is %; only a dispatched transfer can be received', "vDoc"."docNo", "vDoc".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF EXISTS (SELECT 1 FROM "Inventory"."StockMovements" m
              WHERE m."tenantId" = "vTenant" AND m."sourceDocType" = 'TRF' AND m."sourceDocId" = "pId"
                AND m."movementType" = 'TRANSFER_IN' AND m."qtyIn" > 0) THEN
    RETURN;                                           -- already received
  END IF;
  SELECT w."branchId" INTO "vBranch" FROM "Inventory"."Warehouses" w
   WHERE w."tenantId" = "vTenant" AND w.id = "vDoc"."toWarehouseId";
  SELECT w.name INTO "vFromName" FROM "Inventory"."Warehouses" w
   WHERE w."tenantId" = "vTenant" AND w.id = "vDoc"."fromWarehouseId";
  "vFromAcc" := "Inventory"."getWarehouseInventoryAccount"("vDoc"."fromWarehouseId");
  "vToAcc"   := "Inventory"."getWarehouseInventoryAccount"("vDoc"."toWarehouseId");

  FOR "vLine" IN
    SELECT l.id, l."itemId", l."toBinId", l."baseQty", l."baseQty" AS "receivedQty"
      FROM "Inventory"."StockTransferLines" l
     WHERE l."tenantId" = "vTenant" AND l."transferId" = "pId"
     ORDER BY l."lineNo"
  LOOP
    "vLeft" := "vLine"."receivedQty";
    "vLastCost" := NULL;
    "vLastBatch" := NULL;
    FOR "vOut" IN
      SELECT m."batchId", m."qtyOut", m."unitCost"
        FROM "Inventory"."StockMovements" m
       WHERE m."tenantId" = "vTenant" AND m."sourceDocType" = 'TRF' AND m."sourceDocId" = "pId"
         AND m."sourceLineId" = "vLine".id AND m."movementType" = 'TRANSFER_OUT' AND m."qtyOut" > 0
         AND COALESCE(m.remarks, '') NOT LIKE 'Reversal of %'
       ORDER BY m.seq
    LOOP
      "vTake" := LEAST("vLeft", "vOut"."qtyOut");
      IF "vTake" > 0 THEN
        "vIn" := "vIn" + "Inventory"."stockMoveValue"(jsonb_build_object(
          'itemId', "vLine"."itemId", 'warehouseId', "vDoc"."toWarehouseId", 'binId', "vLine"."toBinId",
          'batchId', "vOut"."batchId", 'qtyIn', "vTake", 'unitCost', "vOut"."unitCost",
          'movementType', 'TRANSFER_IN', 'movementDate', current_date, 'counterWarehouseId', "vDoc"."fromWarehouseId",
          'sourceDocType', 'TRF', 'sourceDocId', "pId", 'sourceDocNo', "vDoc"."docNo",
          'sourceLineId', "vLine".id, 'partyLabel', "vFromName"));
      END IF;
      "vShort" := "vShort" + round(("vOut"."qtyOut" - "vTake") * "vOut"."unitCost", 2);
      "vLeft" := "vLeft" - "vTake";
      "vLastCost" := "vOut"."unitCost";
      "vLastBatch" := "vOut"."batchId";
    END LOOP;
    IF "vLastCost" IS NULL THEN
      RAISE EXCEPTION 'Stock transfer %: line % was never dispatched', "vDoc"."docNo", "vLine".id
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF "vLeft" > 0 THEN                               -- more arrived than was sent
      "vExcess" := "vExcess" + "Inventory"."stockMoveValue"(jsonb_build_object(
        'itemId', "vLine"."itemId", 'warehouseId', "vDoc"."toWarehouseId", 'binId', "vLine"."toBinId",
        'batchId', "vLastBatch", 'qtyIn', "vLeft", 'unitCost', "vLastCost",
        'movementType', 'TRANSFER_IN', 'movementDate', current_date, 'counterWarehouseId', "vDoc"."fromWarehouseId",
        'sourceDocType', 'TRF', 'sourceDocId', "pId", 'sourceDocNo', "vDoc"."docNo",
        'sourceLineId', "vLine".id, 'partyLabel', "vFromName", 'remarks', 'Transfer receipt excess'));
    END IF;
  END LOOP;

  "vMoveAmt" := CASE WHEN "vFromAcc" <> "vToAcc" THEN "vIn" ELSE 0 END;
  IF "vMoveAmt" + "vShort" + "vExcess" > 0 THEN
    PERFORM "Accounting"."journalReverseForSource"('TRF', "pId", 'OTHER', current_date);   -- dispatch JV, if any
    "vJe" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'SYSTEM', 'docDate', current_date, 'branchId', "vBranch",
                         'narration', 'Stock transfer ' || "vDoc"."docNo" || ' received from ' || COALESCE("vFromName", ''),
                         'sourceDocType', 'TRF', 'sourceDocId', "pId", 'sourceDocNo', "vDoc"."docNo"),
      jsonb_build_array(
        jsonb_build_object('accountId', "vToAcc", 'debit', "vMoveAmt", 'particulars', 'Transfer in'),
        jsonb_build_object('accountRole', 'INVENTORY_SHRINKAGE', 'debit', "vShort", 'particulars', 'Transfer receipt shortage'),
        jsonb_build_object('accountId', "vFromAcc", 'credit', "vMoveAmt" + "vShort", 'particulars', 'Transfer out'),
        jsonb_build_object('accountId', "vToAcc", 'debit', "vExcess", 'particulars', 'Transfer receipt excess'),
        jsonb_build_object('accountRole', 'INVENTORY_GAIN', 'credit', "vExcess", 'particulars', 'Transfer receipt excess')));
    UPDATE "Inventory"."StockTransfers" t SET "receiptJournalEntryId" = "vJe" WHERE t."tenantId" = "vTenant" AND t.id = "pId";
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "Inventory"."stockTransferCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vDoc" record;
BEGIN
  SELECT t.* INTO "vDoc" FROM "Inventory"."StockTransfers" t
   WHERE t."tenantId" = "Company"."getCurrentTenantId"() AND t.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock transfer % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vDoc".status = 'DRAFT' THEN
    RETURN;
  END IF;
  -- live dispatch / receipt JV, then every TRANSFER_OUT / TRANSFER_IN row (receipt first)
  PERFORM "Accounting"."journalReverseForSource"('TRF', "pId", 'OTHER', current_date);
  PERFORM "Inventory"."stockReverseForSource"('TRF', "pId");
END $$;

-- ---------------------------------------------------------------------------
-- Stock adjustment (ADJ) — counted vs book at weighted average
--   increase: ADJUSTMENT in   Dr inventory / Cr offset (5090)
--   decrease: ADJUSTMENT / WRITE_OFF out   Dr offset (5090 / 5095) / Cr inventory
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Inventory"."stockAdjustmentPostEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"  uuid := "Company"."getCurrentTenantId"();
  "vDoc"     record;
  "vReason"  record;
  "vLine"    record;
  "vOutType" text;
  "vInv"     uuid;
  "vOffset"  uuid;
  "vBranch"  uuid;
  "vIn"      numeric(18,2) := 0;
  "vOut"     numeric(18,2) := 0;
  "vJe"      uuid;
BEGIN
  SELECT a.* INTO "vDoc" FROM "Inventory"."StockAdjustments" a WHERE a."tenantId" = "vTenant" AND a.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock adjustment % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vDoc"."approvalRequired" AND "vDoc"."approvedAt" IS NULL THEN
    RAISE EXCEPTION 'Stock adjustment % (Rs %) needs approval before posting', "vDoc"."docNo", abs("vDoc"."netValue")
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Inventory"."StockAdjustmentLines" l
                  WHERE l."tenantId" = "vTenant" AND l."adjustmentId" = "pId" AND l."qtyChange" <> 0) THEN
    RAISE EXCEPTION 'Stock adjustment %: no line changes the stock', "vDoc"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  SELECT r.* INTO "vReason" FROM "Inventory"."StockMovementReasons" r
   WHERE r."tenantId" = "vTenant" AND r.id = "vDoc"."reasonId";
  "vOutType" := CASE WHEN "vReason"."ledgerMovementType" = 'WRITE_OFF' THEN 'WRITE_OFF' ELSE 'ADJUSTMENT' END;
  "vInv"     := "Inventory"."getWarehouseInventoryAccount"("vDoc"."warehouseId");
  "vOffset"  := COALESCE("vDoc"."offsetAccountId", "vReason"."expenseAccountId",
                         "Company"."getAccountForRole"(CASE WHEN "vOutType" = 'WRITE_OFF' THEN 'STOCK_WRITE_OFF'
                                                            ELSE 'STOCK_ADJUSTMENT' END));
  SELECT w."branchId" INTO "vBranch" FROM "Inventory"."Warehouses" w
   WHERE w."tenantId" = "vTenant" AND w.id = "vDoc"."warehouseId";

  FOR "vLine" IN
    SELECT l.* FROM "Inventory"."StockAdjustmentLines" l
     WHERE l."tenantId" = "vTenant" AND l."adjustmentId" = "pId" AND l."qtyChange" <> 0
     ORDER BY l."lineNo"
  LOOP
    IF "vLine"."qtyChange" > 0 THEN
      "vIn" := "vIn" + "Inventory"."stockMoveValue"(jsonb_build_object(
        'itemId', "vLine"."itemId", 'warehouseId', "vDoc"."warehouseId", 'batchId', "vLine"."batchId",
        'qtyIn', "vLine"."qtyChange", 'unitCost', "vLine"."unitCost", 'movementType', 'ADJUSTMENT',
        'movementDate', "vDoc"."docDate", 'sourceDocType', 'ADJ', 'sourceDocId', "pId",
        'sourceDocNo', "vDoc"."docNo", 'sourceLineId', "vLine".id, 'partyLabel', "vReason".label,
        'remarks', "vDoc".remarks));
    ELSE
      "vOut" := "vOut" + "Inventory"."stockIssue"(jsonb_build_object(
        'itemId', "vLine"."itemId", 'warehouseId', "vDoc"."warehouseId", 'batchId', "vLine"."batchId",
        'qtyOut', -"vLine"."qtyChange", 'movementType', "vOutType",
        'movementDate', "vDoc"."docDate", 'sourceDocType', 'ADJ', 'sourceDocId', "pId",
        'sourceDocNo', "vDoc"."docNo", 'sourceLineId', "vLine".id, 'partyLabel', "vReason".label,
        'remarks', "vDoc".remarks));
    END IF;
  END LOOP;
  IF "vOutType" = 'WRITE_OFF' THEN
    PERFORM "Inventory"."batchWriteOffEmptied"('ADJ', "pId");
  END IF;

  IF "vIn" + "vOut" > 0 THEN
    "vJe" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vDoc"."docDate", 'branchId', "vBranch",
                         'narration', 'Stock adjustment ' || "vDoc"."docNo" || ' — ' || COALESCE("vReason".label, ''),
                         'sourceDocType', 'ADJ', 'sourceDocId', "pId", 'sourceDocNo', "vDoc"."docNo"),
      jsonb_build_array(
        jsonb_build_object('accountId', "vInv", 'debit', "vIn", 'particulars', 'Stock increase'),
        jsonb_build_object('accountId', "vOffset", 'credit', "vIn", 'particulars', 'Stock increase'),
        jsonb_build_object('accountId', "vOffset", 'debit', "vOut", 'particulars', 'Stock decrease'),
        jsonb_build_object('accountId', "vInv", 'credit', "vOut", 'particulars', 'Stock decrease')));
    UPDATE "Inventory"."StockAdjustments" a SET "journalEntryId" = "vJe" WHERE a."tenantId" = "vTenant" AND a.id = "pId";
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "Inventory"."stockAdjustmentCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vDoc" record;
BEGIN
  SELECT a.* INTO "vDoc" FROM "Inventory"."StockAdjustments" a
   WHERE a."tenantId" = "Company"."getCurrentTenantId"() AND a.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock adjustment % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vDoc".status <> 'POSTED' THEN
    RETURN;
  END IF;
  PERFORM "Accounting"."journalReverseForSource"('ADJ', "pId", 'OTHER', current_date);
  PERFORM "Inventory"."stockReverseForSource"('ADJ', "pId");
END $$;
