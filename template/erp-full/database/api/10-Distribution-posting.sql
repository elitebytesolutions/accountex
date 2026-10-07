-- =============================================================================
-- Finsoft ERP (Full edition) — API: Distribution posting hooks
-- Hand-written. Rules: POSTING_RULES.md › Wholesale & distribution.
--
--   loadSheetDispatchEntries     LS   Inventory.StockTransfers warehouse → van (TRANSFER_OUT / IN,
--                                     source TRF), the run's AT_DISPATCH invoices issued from the van
--                                     (SALE, source LS); JV: Dr STOCK_VAN / Cr INVENTORY (when split),
--                                     Dr COGS / Cr STOCK_VAN
--   loadSheetCancelEntries       LS   (called by the generated Cancel) mirror stock moves, reverse JV,
--                                     release the run's invoices; a SETTLED run is refused
--   routeSettlementPostEntries   RS   one JV: receipts (cash counted / cheques in hand vs debtors),
--                                     returns (sales returns + GST share vs debtors, stock back at
--                                     cost), cash short / over, van stock variance; stock moves,
--                                     cheque register rows, customer receipts; run → SETTLED
--   recoverySheetPostEntries     RCPT one receipt + voucher per READY recovery line, FIFO allocation
--
-- The generated API (10-Distribution-api.sql) only has Cancel actions for load sheets
-- and order bookings: loadSheetCancelEntries is wired today. The Dispatch, settlement
-- Post and recovery Post hooks follow the same "<entity><Action>Entries"(uuid)
-- contract and are picked up as soon as those actions exist (or are called by the
-- screen service). Order booking cancel has no GL / stock effect.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers (not SECURITY DEFINER: only usable from the posting hooks)
-- ---------------------------------------------------------------------------

-- GL account of van stock: role STOCK_VAN, else the warehouse stock account (INVENTORY).
CREATE OR REPLACE FUNCTION "Distribution"."getVanStockAccountId"() RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vAccount" uuid;
BEGIN
  SELECT m."accountId" INTO "vAccount"
    FROM "Company"."DefaultAccountMappings" m
   WHERE m."tenantId" = "Company"."getCurrentTenantId"() AND m.role = 'STOCK_VAN';
  RETURN COALESCE("vAccount", "Company"."getAccountForRole"('INVENTORY'));
END $$;

-- Cash account (BankCash.CashAccounts) that receives van / recovery cash: the one
-- mapped to CASH_IN_HAND, else the branch's first active drawer.
CREATE OR REPLACE FUNCTION "Distribution"."getDefaultCashAccountId"("pBranchId" uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vId"     uuid;
BEGIN
  SELECT c.id INTO "vId"
    FROM "BankCash"."CashAccounts" c
    LEFT JOIN "Company"."DefaultAccountMappings" m
           ON m."tenantId" = c."tenantId" AND m.role = 'CASH_IN_HAND' AND m."accountId" = c."accountId"
   WHERE c."tenantId" = "vTenant" AND c."isActive" AND c."deletedAt" IS NULL
   ORDER BY (m.id IS NOT NULL) DESC, (c."branchId" = "pBranchId") DESC, c.code
   LIMIT 1;
  IF "vId" IS NULL THEN
    RAISE EXCEPTION 'No active cash account to receive the collection (Cash › Cash accounts)'
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN "vId";
END $$;

-- Default branch of the tenant (journalCreate rule).
CREATE OR REPLACE FUNCTION "Distribution"."getDefaultBranchId"() RETURNS uuid
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT b.id FROM "Company"."Branches" b
   WHERE b."tenantId" = "Company"."getCurrentTenantId"()
   ORDER BY b."isDefault" DESC, b."isHeadOffice" DESC
   LIMIT 1
$$;

-- Completed stock transfer (TRF) between two warehouses: header RECEIVED, one line
-- per element of pLines [{itemId, batchId?, qty, unitsPerCtn?, unitCost?}], and the
-- TRANSFER_OUT / TRANSFER_IN ledger rows (source TRF). Returns the transfer id.
CREATE OR REPLACE FUNCTION "Distribution"."createVanTransfer"("pFromWarehouseId" uuid, "pToWarehouseId" uuid,
                                                            "pDate" date, "pBranchId" uuid, "pRemarks" text,
                                                            "pDriverEmployeeId" uuid, "pVehicleId" uuid,
                                                            "pPreparedByUserId" uuid, "pLines" jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vUser"   uuid := COALESCE("pPreparedByUserId", "Company"."getCurrentUserId"());
  "vId"     uuid;
  "vNo"     text;
  "vLine"   record;
  "vLineId" uuid;
  "vCost"   numeric(18,4);
  "vCtn"    integer;
BEGIN
  IF "vUser" IS NULL THEN
    RAISE EXCEPTION 'A stock transfer needs the preparing user (session app.userId)' USING ERRCODE = 'not_null_violation';
  END IF;
  "vNo" := "Company"."getNextDocNo"('TRF', "pDate", "pBranchId");
  INSERT INTO "Inventory"."StockTransfers"
         ("tenantId", "docNo", "docDate", "transferAt", "fromWarehouseId", "toWarehouseId", "preparedByUserId",
          remarks, status, "dispatchedAt", "receivedAt", "receivedByUserId", "postedAt", "driverEmployeeId", "vehicleId")
  VALUES ("vTenant", "vNo", "pDate", now(), "pFromWarehouseId", "pToWarehouseId", "vUser",
          left("pRemarks", 500), 'RECEIVED', now(), now(), "vUser", now(), "pDriverEmployeeId", "pVehicleId")
  RETURNING id INTO "vId";

  FOR "vLine" IN
    SELECT (x ->> 'itemId')::uuid AS "itemId", (x ->> 'batchId')::uuid AS "batchId",
           (x ->> 'qty')::numeric AS qty, COALESCE((x ->> 'unitsPerCtn')::numeric, 1) AS "unitsPerCtn",
           (x ->> 'unitCost')::numeric AS "unitCost", n AS "lineNo"
      FROM jsonb_array_elements("pLines") WITH ORDINALITY AS t(x, n)
     WHERE (x ->> 'qty')::numeric > 0
  LOOP
    SELECT COALESCE("vLine"."unitCost", p."avgCost", 0) INTO "vCost"
      FROM "Inventory"."Products" p
     WHERE p."tenantId" = "vTenant" AND p.id = "vLine"."itemId";
    -- whole cartons only when the pack size is a whole number and divides the quantity
    "vCtn" := CASE WHEN "vLine"."unitsPerCtn" >= 1 AND "vLine"."unitsPerCtn" = trunc("vLine"."unitsPerCtn")
                   THEN "vLine"."unitsPerCtn"::integer ELSE 1 END;
    INSERT INTO "Inventory"."StockTransferLines"
           ("tenantId", "transferId", "fromWarehouseId", "toWarehouseId", "lineNo", "itemId", "batchId",
            "ctnSize", "qtyCtn", "qtyLoose", "unitCost")
    VALUES ("vTenant", "vId", "pFromWarehouseId", "pToWarehouseId", "vLine"."lineNo", "vLine"."itemId", "vLine"."batchId",
            "vCtn", trunc("vLine".qty / "vCtn"), "vLine".qty - trunc("vLine".qty / "vCtn") * "vCtn", COALESCE("vCost", 0))
    RETURNING id INTO "vLineId";

    PERFORM "Inventory"."stockMove"(jsonb_build_object(
      'itemId', "vLine"."itemId", 'warehouseId', "pFromWarehouseId", 'batchId', "vLine"."batchId",
      'qtyOut', "vLine".qty, 'unitCost', COALESCE("vCost", 0), 'movementType', 'TRANSFER_OUT', 'movementDate', "pDate",
      'sourceDocType', 'TRF', 'sourceDocId', "vId", 'sourceDocNo', "vNo", 'sourceLineId', "vLineId",
      'counterWarehouseId', "pToWarehouseId", 'remarks', "pRemarks"));
    PERFORM "Inventory"."stockMove"(jsonb_build_object(
      'itemId', "vLine"."itemId", 'warehouseId', "pToWarehouseId", 'batchId', "vLine"."batchId",
      'qtyIn', "vLine".qty, 'unitCost', COALESCE("vCost", 0), 'movementType', 'TRANSFER_IN', 'movementDate', "pDate",
      'sourceDocType', 'TRF', 'sourceDocId', "vId", 'sourceDocNo', "vNo", 'sourceLineId', "vLineId",
      'counterWarehouseId', "pFromWarehouseId", 'remarks', "pRemarks"));
  END LOOP;

  UPDATE "Inventory"."StockTransfers" t
     SET ("totalItems", "totalQty", "totalValue") =
         (SELECT count(*), COALESCE(sum(l."baseQty"), 0), COALESCE(sum(l.value), 0)
            FROM "Inventory"."StockTransferLines" l
           WHERE l."tenantId" = "vTenant" AND l."transferId" = "vId")
   WHERE t."tenantId" = "vTenant" AND t.id = "vId";
  RETURN "vId";
END $$;

-- Customer receipt (RCPT) for a collection, allocated to pData.invoiceId first and
-- then FIFO (oldest due date, then date, then number) to the customer's open invoices.
--   pData: {customerId, docDate, branchId?, method, cashAccountId?, bankAccountId?, chequeId?,
--           amount, invoiceId?, reference?, memo?, journalEntryId?}
CREATE OR REPLACE FUNCTION "Distribution"."createCustomerReceipt"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"   uuid := "Company"."getCurrentTenantId"();
  "vId"       uuid;
  "vCustomer" uuid := ("pData" ->> 'customerId')::uuid;
  "vInvoice"  uuid := ("pData" ->> 'invoiceId')::uuid;
  "vDate"     date := COALESCE(("pData" ->> 'docDate')::date, current_date);
  "vLeft"     numeric(18,2) := ("pData" ->> 'amount')::numeric;
  "vInv"      record;
  "vAlloc"    numeric(18,2);
BEGIN
  INSERT INTO "Sales"."CustomerReceipts"
         ("tenantId", "docNo", "docDate", "customerId", "branchId", method, "bankAccountId", "cashAccountId",
          "chequeId", reference, "amountReceived", memo, "emailReceipt", "journalEntryId")
  VALUES ("vTenant", "Company"."getNextDocNo"('RCPT', "vDate", ("pData" ->> 'branchId')::uuid), "vDate", "vCustomer",
          ("pData" ->> 'branchId')::uuid, "pData" ->> 'method', ("pData" ->> 'bankAccountId')::uuid,
          ("pData" ->> 'cashAccountId')::uuid, ("pData" ->> 'chequeId')::uuid, "pData" ->> 'reference',
          "vLeft", "pData" ->> 'memo', false, ("pData" ->> 'journalEntryId')::uuid)
  RETURNING id INTO "vId";

  FOR "vInv" IN
    SELECT i.id, i."balanceAmount"
      FROM "Sales"."SalesInvoices" i
     WHERE i."tenantId" = "vTenant" AND i."customerId" = "vCustomer"
       AND i.status IN ('POSTED', 'PARTIALLY_PAID') AND i."balanceAmount" > 0
     ORDER BY (i.id = "vInvoice") DESC NULLS LAST, i."dueDate", i."docDate", i."docNo"
  LOOP
    EXIT WHEN "vLeft" <= 0;
    "vAlloc" := LEAST("vLeft", "vInv"."balanceAmount");
    INSERT INTO "Sales"."CustomerReceiptAllocations"
           ("tenantId", "receiptId", "customerId", "targetType", "invoiceId", "allocatedAmount", "allocationDate", "isAutoFifo")
    VALUES ("vTenant", "vId", "vCustomer", 'INVOICE', "vInv".id, "vAlloc", "vDate", "vInv".id IS DISTINCT FROM "vInvoice");
    "vLeft" := "vLeft" - "vAlloc";
  END LOOP;
  RETURN "vId";
END $$;


-- ---------------------------------------------------------------------------
-- Van dispatch — Distribution.LoadSheets → DISPATCHED
--   1. load: StockTransfers source warehouse → van (TRANSFER_OUT / TRANSFER_IN)
--      Dr STOCK_VAN / Cr INVENTORY at cost (no GL line when STOCK_VAN = INVENTORY)
--   2. issue the run's AT_DISPATCH invoices from the van (SALE, base + bonus qty)
--      Dr COGS / Cr STOCK_VAN
-- One JV, source LS. Sets LoadSheets.stockTransferId / dispatchedAt.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Distribution"."loadSheetDispatchEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"  uuid := "Company"."getCurrentTenantId"();
  "vLs"      record;
  "vVanWh"   uuid;
  "vBranch"  uuid;
  "vTr"      uuid;
  "vTrLines" jsonb;
  "vTrValue" numeric(18,2) := 0;
  "vCogs"    numeric(18,2) := 0;
  "vMoveId"  uuid;
  "vRow"     record;
  "vVanAcc"  uuid;
  "vInvAcc"  uuid;
  "vLines"   jsonb := '[]'::jsonb;
BEGIN
  SELECT s.id, s."docNo", s."docDate", s."branchId", s."sourceWarehouseId", s."vanWarehouseId", s."vehicleId",
         s."driverEmployeeId", s."preparedByUserId", s."stockTransferId", v."warehouseId" AS "vehicleWarehouseId"
    INTO "vLs"
    FROM "Distribution"."LoadSheets" s
    JOIN "Distribution"."Vans" v ON v."tenantId" = s."tenantId" AND v.id = s."vehicleId"
   WHERE s."tenantId" = "vTenant" AND s.id = "pId"
     FOR UPDATE OF s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Load sheet % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vLs"."stockTransferId" IS NOT NULL THEN
    RETURN;                                   -- already dispatched (idempotent)
  END IF;
  "vVanWh" := COALESCE("vLs"."vanWarehouseId", "vLs"."vehicleWarehouseId");
  IF "vVanWh" IS NULL THEN
    RAISE EXCEPTION 'Load sheet %: the van has no VAN warehouse', "vLs"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  "vBranch" := COALESCE("vLs"."branchId", "Distribution"."getDefaultBranchId"());

  -- 1. warehouse → van
  SELECT jsonb_agg(jsonb_build_object('itemId', l."itemId", 'batchId', l."batchId", 'qty', l."baseQty",
                                      'unitsPerCtn', l."unitsPerCtn") ORDER BY l."shelfCode", l.id)
    INTO "vTrLines"
    FROM "Distribution"."LoadSheetLines" l
   WHERE l."tenantId" = "vTenant" AND l."deliveryRunId" = "vLs".id;
  IF "vTrLines" IS NULL THEN
    RAISE EXCEPTION 'Load sheet % has no load lines', "vLs"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  "vTr" := "Distribution"."createVanTransfer"("vLs"."sourceWarehouseId", "vVanWh", "vLs"."docDate", "vBranch",
                                              'Van load ' || "vLs"."docNo", "vLs"."driverEmployeeId", "vLs"."vehicleId",
                                              "vLs"."preparedByUserId", "vTrLines");
  SELECT COALESCE(sum(m.value), 0) INTO "vTrValue"
    FROM "Inventory"."StockMovements" m
   WHERE m."tenantId" = "vTenant" AND m."sourceDocType" = 'TRF' AND m."sourceDocId" = "vTr"
     AND m."movementType" = 'TRANSFER_IN';

  -- 2. the run's invoices leave the van (stock issue deferred to dispatch)
  FOR "vRow" IN
    SELECT il.id AS "lineId", il."itemId", il."batchId", il."baseQty" + il."bonusQty" AS qty,
           i.id AS "invoiceId", i."docNo", c.name AS "customerName"
      FROM "Distribution"."LoadSheetInvoices" li
      JOIN "Sales"."SalesInvoices" i ON i."tenantId" = li."tenantId" AND i.id = li."invoiceId"
      JOIN "Sales"."SalesInvoiceLines" il ON il."tenantId" = i."tenantId" AND il."invoiceId" = i.id
      JOIN "Sales"."Customers" c ON c."tenantId" = i."tenantId" AND c.id = i."customerId"
     WHERE li."tenantId" = "vTenant" AND li."deliveryRunId" = "vLs".id AND li."releasedAt" IS NULL
       AND i."stockIssueMode" = 'AT_DISPATCH' AND i."stockIssuedAt" IS NULL AND i.status <> 'VOID'
       AND il."itemId" IS NOT NULL
     ORDER BY i."docNo", il.id
  LOOP
    "vMoveId" := "Inventory"."stockMove"(jsonb_build_object(
      'itemId', "vRow"."itemId", 'warehouseId', "vVanWh", 'batchId', "vRow"."batchId", 'qtyOut', "vRow".qty,
      'movementType', 'SALE', 'movementDate', "vLs"."docDate",
      'sourceDocType', 'LS', 'sourceDocId', "vLs".id, 'sourceDocNo', "vLs"."docNo", 'sourceLineId', "vRow"."lineId",
      'partyLabel', "vRow"."customerName", 'remarks', 'Issued on dispatch — ' || "vRow"."docNo"));
    "vCogs" := "vCogs" + (SELECT -m.value FROM "Inventory"."StockMovements" m
                           WHERE m."tenantId" = "vTenant" AND m.id = "vMoveId");
  END LOOP;
  UPDATE "Sales"."SalesInvoices" i
     SET "stockIssuedAt" = now()
   WHERE i."tenantId" = "vTenant" AND i."stockIssueMode" = 'AT_DISPATCH' AND i."stockIssuedAt" IS NULL
     AND i.status <> 'VOID'
     AND i.id IN (SELECT li."invoiceId" FROM "Distribution"."LoadSheetInvoices" li
                   WHERE li."tenantId" = "vTenant" AND li."deliveryRunId" = "vLs".id AND li."releasedAt" IS NULL);

  -- 3. one JV (source LS)
  "vVanAcc" := "Distribution"."getVanStockAccountId"();
  "vInvAcc" := "Company"."getAccountForRole"('INVENTORY');
  IF "vVanAcc" <> "vInvAcc" AND "vTrValue" > 0 THEN
    "vLines" := "vLines" || jsonb_build_array(
      jsonb_build_object('accountId', "vVanAcc", 'debit', "vTrValue", 'particulars', 'Van load ' || "vLs"."docNo"),
      jsonb_build_object('accountId', "vInvAcc", 'credit', "vTrValue", 'particulars', 'Van load ' || "vLs"."docNo"));
  END IF;
  IF "vCogs" > 0 THEN
    "vLines" := "vLines" || jsonb_build_array(
      jsonb_build_object('accountRole', 'COGS', 'debit', "vCogs", 'particulars', 'Cost of run invoices ' || "vLs"."docNo"),
      jsonb_build_object('accountId', "vVanAcc", 'credit', "vCogs", 'particulars', 'Issued from van ' || "vLs"."docNo"));
  END IF;
  IF jsonb_array_length("vLines") > 0 THEN
    PERFORM "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'JV', 'docDate', "vLs"."docDate", 'postingDate', "vLs"."docDate",
                         'branchId', "vBranch", 'narration', 'Van dispatch ' || "vLs"."docNo",
                         'sourceDocType', 'LS', 'sourceDocId', "vLs".id, 'sourceDocNo', "vLs"."docNo"),
      "vLines");
  END IF;

  UPDATE "Distribution"."LoadSheets" s
     SET "stockTransferId" = "vTr",
         "dispatchedAt" = COALESCE(s."dispatchedAt", now()),
         "dispatchedByUserId" = COALESCE(s."dispatchedByUserId", "Company"."getCurrentUserId"())
   WHERE s."tenantId" = "vTenant" AND s.id = "vLs".id;
END $$;
COMMENT ON FUNCTION "Distribution"."loadSheetDispatchEntries"(uuid) IS
  'Posting hook of a load sheet Dispatch: warehouse → van transfer, run invoices issued from the van, JV (source LS).';


-- ---------------------------------------------------------------------------
-- Load sheet — Cancel (generated action). A DISPATCHED run is undone: every
-- dispatch movement is mirrored (newest first), the dispatch JV reversed, the
-- transfer cancelled and the invoices released for another run. A SETTLED run
-- cannot be cancelled (its settlement has been posted).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Distribution"."loadSheetCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vLs"     record;
  "vMove"   record;
BEGIN
  SELECT s.id, s."docNo", s.status, s."stockTransferId" INTO "vLs"
    FROM "Distribution"."LoadSheets" s
   WHERE s."tenantId" = "vTenant" AND s.id = "pId"
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF "vLs".status = 'SETTLED' THEN
    RAISE EXCEPTION 'Load sheet % is settled: its route settlement is posted and cannot be undone by cancelling the run',
      "vLs"."docNo" USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vLs".status <> 'DISPATCHED' THEN
    RETURN;                                   -- nothing moved before dispatch
  END IF;

  FOR "vMove" IN
    SELECT m.*
      FROM "Inventory"."StockMovements" m
     WHERE m."tenantId" = "vTenant"
       AND ((m."sourceDocType" = 'LS' AND m."sourceDocId" = "vLs".id)
         OR (m."sourceDocType" = 'TRF' AND m."sourceDocId" = "vLs"."stockTransferId"))
     ORDER BY m.seq DESC
  LOOP
    PERFORM "Inventory"."stockMove"(jsonb_build_object(
      'itemId', "vMove"."itemId", 'warehouseId', "vMove"."warehouseId", 'binId', "vMove"."binId",
      'batchId', "vMove"."batchId", 'qtyIn', "vMove"."qtyOut", 'qtyOut', "vMove"."qtyIn",
      'unitCost', "vMove"."unitCost",
      'movementType', CASE "vMove"."movementType" WHEN 'TRANSFER_OUT' THEN 'TRANSFER_IN'
                                                  WHEN 'TRANSFER_IN'  THEN 'TRANSFER_OUT'
                                                  WHEN 'SALE'         THEN 'SALES_RETURN'
                                                  ELSE "vMove"."movementType" END,
      'movementDate', current_date, 'sourceDocType', "vMove"."sourceDocType", 'sourceDocId', "vMove"."sourceDocId",
      'sourceDocNo', "vMove"."sourceDocNo", 'sourceLineId', "vMove"."sourceLineId",
      'counterWarehouseId', "vMove"."counterWarehouseId", 'partyLabel', "vMove"."partyLabel",
      'remarks', 'Cancelled load sheet ' || "vLs"."docNo"));
  END LOOP;

  PERFORM "Accounting"."journalReverseForSource"('LS', "vLs".id, 'OTHER', current_date);

  -- invoices issued on dispatch go back to "awaiting dispatch" and leave the run
  UPDATE "Sales"."SalesInvoices" i
     SET "stockIssuedAt" = NULL
   WHERE i."tenantId" = "vTenant"
     AND i.id IN (SELECT il."invoiceId"
                    FROM "Inventory"."StockMovements" m
                    JOIN "Sales"."SalesInvoiceLines" il ON il."tenantId" = m."tenantId" AND il.id = m."sourceLineId"
                   WHERE m."tenantId" = "vTenant" AND m."sourceDocType" = 'LS' AND m."sourceDocId" = "vLs".id
                     AND m."movementType" = 'SALE');
  UPDATE "Distribution"."LoadSheetInvoices" li
     SET "releasedAt" = now()
   WHERE li."tenantId" = "vTenant" AND li."deliveryRunId" = "vLs".id AND li."releasedAt" IS NULL;

  UPDATE "Inventory"."StockTransfers" t
     SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = 'Load sheet ' || "vLs"."docNo" || ' cancelled'
   WHERE t."tenantId" = "vTenant" AND t.id = "vLs"."stockTransferId" AND t.status <> 'CANCELLED';
END $$;
COMMENT ON FUNCTION "Distribution"."loadSheetCancelEntries"(uuid) IS
  'Posting hook of Distribution.loadSheetCancel: mirrors the dispatch stock moves, reverses the LS journal, releases invoices.';


-- ---------------------------------------------------------------------------
-- Route settlement — OPEN → SETTLED (one JV, source RS)
--   Dr cash in hand (counted) + cheques in hand          | Cr AR_CONTROL (cash + cheque, per customer)
--   Dr SALES_RETURNS (ex GST) + OUTPUT_GST (GST share)   | Cr AR_CONTROL (returns, per customer)
--   Dr INVENTORY (return cost)                           | Cr COGS
--   Dr SALESMAN_RECEIVABLE (cash short, employee)        | Cr CASH_OVER_SHORT (cash over)
--   Dr SALESMAN_RECEIVABLE (van stock loss, employee)    | Cr STOCK_VAN
--   Dr INVENTORY (van stock gain)                        | Cr STOCK_GAIN
-- Stock (source RS): returns SALES_RETURN into the van, van → warehouse transfer of
-- the returned qty (counted qty if lower), variance ADJUSTMENT at the van.
-- Credit and unexplained short rows are memo only (the invoice stays open).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Distribution"."routeSettlementPostEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"   uuid := "Company"."getCurrentTenantId"();
  "vRs"       record;
  "vLs"       record;
  "vRow"      record;
  "vVanWh"    uuid;
  "vBranch"   uuid;
  "vSalesman" uuid;
  "vCashAcc"  uuid;
  "vCashGl"   uuid;
  "vVanGl"    uuid;
  "vCashExp"  numeric(18,2);
  "vCheque"   numeric(18,2);
  "vReturns"  numeric(18,2);
  "vShort"    numeric(18,2);
  "vOver"     numeric(18,2);
  "vRetCost"  numeric(18,2);
  "vLoss"     numeric(18,2);
  "vGain"     numeric(18,2);
  "vLines"    jsonb;
  "vJe"       uuid;
  "vTrLines"  jsonb := '[]'::jsonb;
  "vTr"       uuid;
  "vChq"      uuid;
  "vRcpt"     uuid;
BEGIN
  SELECT rs.id, rs."docNo", rs."docDate", rs."branchId", rs."deliveryRunId", rs."salesmanEmployeeId", rs."cashAccountId",
         rs."cashCounted", rs."journalEntryId"
    INTO "vRs"
    FROM "Distribution"."RouteSettlements" rs
   WHERE rs."tenantId" = "vTenant" AND rs.id = "pId"
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Route settlement % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRs"."journalEntryId" IS NOT NULL THEN
    RETURN;                                   -- already posted (idempotent)
  END IF;
  SELECT s.id, s."docNo", s.status, s."branchId", s."sourceWarehouseId", s."vehicleId", s."driverEmployeeId",
         s."salesmanEmployeeId", COALESCE(s."vanWarehouseId", van."warehouseId") AS "vanWarehouseId"
    INTO "vLs"
    FROM "Distribution"."LoadSheets" s
    JOIN "Distribution"."Vans" van ON van."tenantId" = s."tenantId" AND van.id = s."vehicleId"
   WHERE s."tenantId" = "vTenant" AND s.id = "vRs"."deliveryRunId"
     FOR UPDATE OF s;
  IF "vLs".status IS DISTINCT FROM 'DISPATCHED' THEN
    RAISE EXCEPTION 'Route settlement %: the run is % (only a dispatched run can be settled)', "vRs"."docNo", "vLs".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  "vVanWh"    := "vLs"."vanWarehouseId";
  "vBranch"   := COALESCE("vRs"."branchId", "vLs"."branchId", "Distribution"."getDefaultBranchId"());
  "vSalesman" := COALESCE("vRs"."salesmanEmployeeId", "vLs"."salesmanEmployeeId");
  "vCashAcc"  := COALESCE("vRs"."cashAccountId", "Distribution"."getDefaultCashAccountId"("vBranch"));
  SELECT ca."accountId" INTO "vCashGl" FROM "BankCash"."CashAccounts" ca
   WHERE ca."tenantId" = "vTenant" AND ca.id = "vCashAcc";
  "vVanGl" := "Distribution"."getVanStockAccountId"();

  -- amounts from the detail rows (the header totals are display copies)
  SELECT COALESCE(sum(l."cashAmount"), 0), COALESCE(sum(l."chequeAmount"), 0), COALESCE(sum(l."returnAmount"), 0)
    INTO "vCashExp", "vCheque", "vReturns"
    FROM "Distribution"."RouteSettlementLines" l
   WHERE l."tenantId" = "vTenant" AND l."runSettlementId" = "vRs".id;
  "vShort" := GREATEST("vCashExp" - "vRs"."cashCounted", 0);
  "vOver"  := GREATEST("vRs"."cashCounted" - "vCashExp", 0);
  SELECT COALESCE(sum(r."costValue"), 0) INTO "vRetCost"
    FROM "Distribution"."RouteSettlementReturns" r
   WHERE r."tenantId" = "vTenant" AND r."runSettlementId" = "vRs".id;
  SELECT COALESCE(sum(-v."varianceValue") FILTER (WHERE v."varianceValue" < 0), 0),
         COALESCE(sum(v."varianceValue") FILTER (WHERE v."varianceValue" > 0), 0)
    INTO "vLoss", "vGain"
    FROM "Distribution"."VanStockCounts" v
   WHERE v."tenantId" = "vTenant" AND v."runSettlementId" = "vRs".id;
  IF ("vShort" > 0 OR "vLoss" > 0) AND "vSalesman" IS NULL THEN
    RAISE EXCEPTION 'Route settlement %: a cash short or van stock loss needs the salesman', "vRs"."docNo"
      USING ERRCODE = 'check_violation';
  END IF;
  IF "vRs"."cashCounted" + "vCheque" + "vReturns" + "vRetCost" + "vShort" + "vLoss" + "vGain" = 0 THEN
    RAISE EXCEPTION 'Route settlement % has no collection, return or variance to post', "vRs"."docNo"
      USING ERRCODE = 'check_violation';
  END IF;

  WITH sl AS (
    SELECT l."customerId", l."cashAmount", l."chequeAmount", l."returnAmount",
           COALESCE(round(l."returnAmount" * i."taxAmount" / NULLIF(i."netAmount", 0), 2), 0) AS "gstShare"
      FROM "Distribution"."RouteSettlementLines" l
      JOIN "Sales"."SalesInvoices" i ON i."tenantId" = l."tenantId" AND i.id = l."invoiceId"
     WHERE l."tenantId" = "vTenant" AND l."runSettlementId" = "vRs".id
  ), q AS (
    SELECT 1 AS ord, jsonb_build_object('accountId', "vCashGl", 'debit', "vRs"."cashCounted",
                                        'particulars', 'Cash collected (counted)') AS j
    UNION ALL
    SELECT 2, jsonb_build_object('accountRole', 'CHEQUES_IN_HAND', 'debit', "vCheque", 'particulars', 'Cheques collected')
    UNION ALL
    SELECT 3, jsonb_build_object('accountRole', 'AR_CONTROL', 'credit', sum(sl."cashAmount" + sl."chequeAmount"),
                                 'customerId', sl."customerId", 'particulars', 'Receipts — route settlement')
      FROM sl GROUP BY sl."customerId"
    UNION ALL
    SELECT 4, jsonb_build_object('accountRole', 'SALES_RETURNS', 'debit', COALESCE(sum(sl."returnAmount" - sl."gstShare"), 0),
                                 'particulars', 'Van returns')
      FROM sl
    UNION ALL
    SELECT 5, jsonb_build_object('accountRole', 'OUTPUT_GST', 'debit', COALESCE(sum(sl."gstShare"), 0),
                                 'particulars', 'GST on van returns')
      FROM sl
    UNION ALL
    SELECT 6, jsonb_build_object('accountRole', 'AR_CONTROL', 'credit', sum(sl."returnAmount"),
                                 'customerId', sl."customerId", 'particulars', 'Returns — route settlement')
      FROM sl GROUP BY sl."customerId"
    UNION ALL
    SELECT 7, jsonb_build_object('accountRole', 'INVENTORY', 'debit', "vRetCost", 'particulars', 'Returned stock at cost')
    UNION ALL
    SELECT 8, jsonb_build_object('accountRole', 'COGS', 'credit', "vRetCost", 'particulars', 'Cost of returns')
    UNION ALL
    SELECT 9, jsonb_build_object('accountRole', 'SALESMAN_RECEIVABLE', 'debit', "vShort", 'employeeId', "vSalesman",
                                 'particulars', 'Cash short')
    UNION ALL
    SELECT 10, jsonb_build_object('accountRole', 'CASH_OVER_SHORT', 'credit', "vOver", 'particulars', 'Cash over')
    UNION ALL
    SELECT 11, jsonb_build_object('accountRole', 'SALESMAN_RECEIVABLE', 'debit', "vLoss", 'employeeId', "vSalesman",
                                  'particulars', 'Van stock short')
    UNION ALL
    SELECT 12, jsonb_build_object('accountId', "vVanGl", 'credit', "vLoss", 'particulars', 'Van stock short')
    UNION ALL
    SELECT 13, jsonb_build_object('accountRole', 'INVENTORY', 'debit', "vGain", 'particulars', 'Van stock excess')
    UNION ALL
    SELECT 14, jsonb_build_object('accountRole', 'STOCK_GAIN', 'credit', "vGain", 'particulars', 'Van stock excess')
  )
  SELECT jsonb_agg(q.j ORDER BY q.ord) INTO "vLines" FROM q;

  "vJe" := "Accounting"."journalCreate"(
    jsonb_build_object('voucherType', 'JV', 'docDate', "vRs"."docDate", 'postingDate', "vRs"."docDate",
                       'branchId', "vBranch", 'narration', 'Route settlement ' || "vRs"."docNo" || ' (' || "vLs"."docNo" || ')',
                       'sourceDocType', 'RS', 'sourceDocId', "vRs".id, 'sourceDocNo', "vRs"."docNo"),
    "vLines");

  -- returns into the van; the returned qty (counted qty if lower) goes back to the warehouse
  FOR "vRow" IN
    SELECT r.id, r."itemId", r."batchId", r."returnQty", r."unitCost",
           GREATEST(LEAST(r."returnQty",
                          COALESCE(LEAST(v."returnedQty", v."countedQty"), r."returnQty" + 1e15)
                          - (sum(r."returnQty") OVER (PARTITION BY r."itemId" ORDER BY r.id) - r."returnQty")), 0) AS "backQty"
      FROM "Distribution"."RouteSettlementReturns" r
      LEFT JOIN "Distribution"."VanStockCounts" v
             ON v."tenantId" = r."tenantId" AND v."runSettlementId" = r."runSettlementId" AND v."itemId" = r."itemId"
     WHERE r."tenantId" = "vTenant" AND r."runSettlementId" = "vRs".id
     ORDER BY r.id
  LOOP
    PERFORM "Inventory"."stockMove"(jsonb_build_object(
      'itemId', "vRow"."itemId", 'warehouseId', "vVanWh", 'batchId', "vRow"."batchId", 'qtyIn', "vRow"."returnQty",
      'unitCost', "vRow"."unitCost", 'movementType', 'SALES_RETURN', 'movementDate', "vRs"."docDate",
      'sourceDocType', 'RS', 'sourceDocId', "vRs".id, 'sourceDocNo', "vRs"."docNo", 'sourceLineId', "vRow".id,
      'remarks', 'Van return'));
    IF "vRow"."backQty" > 0 THEN
      "vTrLines" := "vTrLines" || jsonb_build_array(jsonb_build_object(
        'itemId', "vRow"."itemId", 'batchId', "vRow"."batchId", 'qty', "vRow"."backQty", 'unitCost', "vRow"."unitCost"));
    END IF;
  END LOOP;
  IF jsonb_array_length("vTrLines") > 0 THEN
    "vTr" := "Distribution"."createVanTransfer"("vVanWh", "vLs"."sourceWarehouseId", "vRs"."docDate", "vBranch",
                                                'Van return ' || "vRs"."docNo", "vLs"."driverEmployeeId", "vLs"."vehicleId",
                                                NULL, "vTrLines");
  END IF;

  -- van stock variance at cost
  FOR "vRow" IN
    SELECT v."itemId", v."varianceQty", v."unitCost",
           (SELECT r."batchId" FROM "Distribution"."RouteSettlementReturns" r
             WHERE r."tenantId" = v."tenantId" AND r."runSettlementId" = v."runSettlementId" AND r."itemId" = v."itemId"
             ORDER BY r.id LIMIT 1) AS "batchId"
      FROM "Distribution"."VanStockCounts" v
     WHERE v."tenantId" = "vTenant" AND v."runSettlementId" = "vRs".id AND v."varianceQty" <> 0
  LOOP
    PERFORM "Inventory"."stockMove"(jsonb_build_object(
      'itemId', "vRow"."itemId", 'warehouseId', "vVanWh", 'batchId', "vRow"."batchId",
      'qtyIn', GREATEST("vRow"."varianceQty", 0), 'qtyOut', GREATEST(-"vRow"."varianceQty", 0),
      'unitCost', "vRow"."unitCost", 'movementType', 'ADJUSTMENT', 'movementDate', "vRs"."docDate",
      'sourceDocType', 'RS', 'sourceDocId', "vRs".id, 'sourceDocNo', "vRs"."docNo",
      'remarks', 'Van stock count variance'));
  END LOOP;

  -- cash receipts per invoice
  FOR "vRow" IN
    SELECT l.id, l."customerId", l."invoiceId", l."cashAmount"
      FROM "Distribution"."RouteSettlementLines" l
     WHERE l."tenantId" = "vTenant" AND l."runSettlementId" = "vRs".id AND l."cashAmount" > 0
     ORDER BY l."lineNo"
  LOOP
    "vRcpt" := "Distribution"."createCustomerReceipt"(jsonb_build_object(
      'customerId', "vRow"."customerId", 'invoiceId', "vRow"."invoiceId", 'docDate', "vRs"."docDate",
      'branchId', "vBranch", 'method', 'CASH', 'cashAccountId', "vCashAcc", 'amount', "vRow"."cashAmount",
      'reference', "vRs"."docNo", 'memo', 'Route settlement ' || "vRs"."docNo", 'journalEntryId', "vJe"));
    UPDATE "Distribution"."RouteSettlementLines" l
       SET "receiptId" = COALESCE(l."receiptId", "vRcpt")
     WHERE l."tenantId" = "vTenant" AND l.id = "vRow".id;
  END LOOP;

  -- cheques: register (cheques in hand, PDC when dated after the settlement) + receipt
  FOR "vRow" IN
    SELECT c.id, c."settlementLineId", c."chequeNo", c."bankId", c."chequeDate", c.amount,
           l."customerId", l."invoiceId", cu.name AS "customerName"
      FROM "Distribution"."RouteSettlementCheques" c
      JOIN "Distribution"."RouteSettlementLines" l ON l."tenantId" = c."tenantId" AND l.id = c."settlementLineId"
      JOIN "Sales"."Customers" cu ON cu."tenantId" = l."tenantId" AND cu.id = l."customerId"
     WHERE c."tenantId" = "vTenant" AND c."runSettlementId" = "vRs".id AND c."chequeId" IS NULL
     ORDER BY l."lineNo", c."chequeNo"
  LOOP
    INSERT INTO "BankCash"."Cheques"
           ("tenantId", "docNo", "docDate", "branchId", direction, "chequeNo", "customerId", "partyName",
            "drawnOnBankId", "chequeDate", "receivedOn", amount, "isPdc", "postingMode", status,
            "journalEntryId", remarks)
    VALUES ("vTenant", "Company"."getNextDocNo"('CHQ', "vRs"."docDate", "vBranch"), "vRs"."docDate", "vBranch",
            'RECEIVED', "vRow"."chequeNo", "vRow"."customerId", "vRow"."customerName",
            "vRow"."bankId", "vRow"."chequeDate", "vRs"."docDate", "vRow".amount, "vRow"."chequeDate" > "vRs"."docDate",
            CASE WHEN "vRow"."chequeDate" > "vRs"."docDate" THEN 'HOLD_PDC' ELSE 'DEPOSIT' END, 'IN_HAND',
            "vJe", 'Collected on route settlement ' || "vRs"."docNo")
    RETURNING id INTO "vChq";
    UPDATE "Distribution"."RouteSettlementCheques" c
       SET "chequeId" = "vChq"
     WHERE c."tenantId" = "vTenant" AND c.id = "vRow".id;

    "vRcpt" := "Distribution"."createCustomerReceipt"(jsonb_build_object(
      'customerId', "vRow"."customerId", 'invoiceId', "vRow"."invoiceId", 'docDate', "vRs"."docDate",
      'branchId', "vBranch", 'method', 'CHEQUE', 'chequeId', "vChq", 'amount', "vRow".amount,
      'reference', "vRow"."chequeNo", 'memo', 'Route settlement ' || "vRs"."docNo", 'journalEntryId', "vJe"));
    UPDATE "Distribution"."RouteSettlementLines" l
       SET "receiptId" = COALESCE(l."receiptId", "vRcpt")
     WHERE l."tenantId" = "vTenant" AND l.id = "vRow"."settlementLineId";
  END LOOP;

  -- not-delivered invoices leave the run (they can go on a later run)
  UPDATE "Distribution"."LoadSheetInvoices" li
     SET "releasedAt" = now()
   WHERE li."tenantId" = "vTenant" AND li."deliveryRunId" = "vLs".id AND li."releasedAt" IS NULL
     AND li."invoiceId" IN (SELECT l."invoiceId" FROM "Distribution"."RouteSettlementLines" l
                             WHERE l."tenantId" = "vTenant" AND l."runSettlementId" = "vRs".id
                               AND l."deliveryState" = 'NONE');

  UPDATE "Distribution"."RouteSettlements" rs
     SET "journalEntryId" = "vJe", "postedAt" = now(), "postedByUserId" = "Company"."getCurrentUserId"(),
         "returnTransferId" = "vTr"
   WHERE rs."tenantId" = "vTenant" AND rs.id = "vRs".id;
  UPDATE "Distribution"."LoadSheets" s
     SET status = 'SETTLED', "returnedAt" = COALESCE(s."returnedAt", now())
   WHERE s."tenantId" = "vTenant" AND s.id = "vLs".id AND s.status = 'DISPATCHED';
END $$;
COMMENT ON FUNCTION "Distribution"."routeSettlementPostEntries"(uuid) IS
  'Posting hook of a route settlement Post: one JV (source RS), returns / variance stock moves, cheques, receipts; run SETTLED.';


-- ---------------------------------------------------------------------------
-- Recovery sheet — post the READY lines. Per line: a customer receipt (RCPT)
-- allocated FIFO, and its voucher (source RCPT):
--   CASH      Dr cash in hand (cash account)        | Cr AR_CONTROL (customer)
--   CHEQUE    Dr CHEQUES_IN_HAND                    | Cr AR_CONTROL
--   ONLINE    Dr bank (depositBankAccountId)        | Cr AR_CONTROL
--   JAZZCASH  Dr bank (depositBankAccountId), else WALLET_CLEARING | Cr AR_CONTROL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Distribution"."recoverySheetPostEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"  uuid := "Company"."getCurrentTenantId"();
  "vSheet"   record;
  "vRow"     record;
  "vBranch"  uuid;
  "vCashAcc" uuid;
  "vDebit"   jsonb;
  "vMethod"  text;
  "vRcpt"    uuid;
  "vRcptNo"  text;
  "vJe"      uuid;
  "vPosted"  numeric(18,2);
BEGIN
  SELECT s.id, s."docNo", s."docDate", s."branchId" INTO "vSheet"
    FROM "Distribution"."RecoverySheets" s
   WHERE s."tenantId" = "vTenant" AND s.id = "pId"
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recovery sheet % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  "vBranch" := COALESCE("vSheet"."branchId", "Distribution"."getDefaultBranchId"());

  FOR "vRow" IN
    SELECT l.id, l."customerId", l."collectedAmount", l.mode, l.remarks, l."chequeId", l."depositBankAccountId",
           b."accountId" AS "bankGlId", c.name AS "customerName"
      FROM "Distribution"."RecoverySheetLines" l
      JOIN "Sales"."Customers" c ON c."tenantId" = l."tenantId" AND c.id = l."customerId"
      LEFT JOIN "BankCash"."BankAccounts" b ON b."tenantId" = l."tenantId" AND b.id = l."depositBankAccountId"
     WHERE l."tenantId" = "vTenant" AND l."recoverySheetId" = "vSheet".id
       AND l.status = 'READY' AND l."collectedAmount" > 0
     ORDER BY l."lineNo"
       FOR UPDATE OF l
  LOOP
    IF "vRow".mode = 'CASH' THEN
      "vCashAcc" := COALESCE("vCashAcc", "Distribution"."getDefaultCashAccountId"("vBranch"));
      SELECT jsonb_build_object('accountId', a."accountId") INTO "vDebit"
        FROM "BankCash"."CashAccounts" a WHERE a."tenantId" = "vTenant" AND a.id = "vCashAcc";
      "vMethod" := 'CASH';
    ELSIF "vRow".mode = 'CHEQUE' THEN
      "vDebit"  := jsonb_build_object('accountRole', 'CHEQUES_IN_HAND');
      "vMethod" := 'CHEQUE';
    ELSIF "vRow".mode = 'ONLINE' THEN
      IF "vRow"."bankGlId" IS NULL THEN
        RAISE EXCEPTION 'Recovery %: choose the bank account the online payment of % was received in', "vSheet"."docNo", "vRow"."customerName"
          USING ERRCODE = 'check_violation';
      END IF;
      "vDebit"  := jsonb_build_object('accountId', "vRow"."bankGlId");
      "vMethod" := 'IBFT';
    ELSE                                       -- JAZZCASH
      "vDebit"  := CASE WHEN "vRow"."bankGlId" IS NOT NULL THEN jsonb_build_object('accountId', "vRow"."bankGlId")
                        ELSE jsonb_build_object('accountRole', 'WALLET_CLEARING') END;
      "vMethod" := 'JAZZCASH';
    END IF;

    "vRcpt" := "Distribution"."createCustomerReceipt"(jsonb_build_object(
      'customerId', "vRow"."customerId", 'docDate', "vSheet"."docDate", 'branchId', "vBranch", 'method', "vMethod",
      'cashAccountId', CASE WHEN "vMethod" = 'CASH' THEN "vCashAcc" END,
      'bankAccountId', CASE WHEN "vMethod" IN ('IBFT', 'JAZZCASH') THEN "vRow"."depositBankAccountId" END,
      'chequeId', CASE WHEN "vMethod" = 'CHEQUE' THEN "vRow"."chequeId" END,
      'amount', "vRow"."collectedAmount", 'reference', "vRow".remarks, 'memo', 'Recovery sheet ' || "vSheet"."docNo"));
    SELECT r."docNo" INTO "vRcptNo" FROM "Sales"."CustomerReceipts" r WHERE r."tenantId" = "vTenant" AND r.id = "vRcpt";

    "vJe" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vSheet"."docDate", 'postingDate', "vSheet"."docDate",
                         'branchId', "vBranch", 'partyName', "vRow"."customerName",
                         'narration', 'Recovery ' || "vSheet"."docNo" || ' — ' || "vRow"."customerName",
                         'sourceDocType', 'RCPT', 'sourceDocId', "vRcpt", 'sourceDocNo', "vRcptNo"),
      jsonb_build_array(
        "vDebit" || jsonb_build_object('debit', "vRow"."collectedAmount", 'particulars', "vRcptNo" || ' — ' || "vRow"."customerName"),
        jsonb_build_object('accountRole', 'AR_CONTROL', 'credit', "vRow"."collectedAmount",
                           'customerId', "vRow"."customerId", 'particulars', "vRcptNo")));

    UPDATE "Sales"."CustomerReceipts" r
       SET "journalEntryId" = "vJe"
     WHERE r."tenantId" = "vTenant" AND r.id = "vRcpt";
    UPDATE "Distribution"."RecoverySheetLines" l
       SET status = 'POSTED', "receiptId" = "vRcpt", "postedAt" = now(), "postedByUserId" = "Company"."getCurrentUserId"()
     WHERE l."tenantId" = "vTenant" AND l.id = "vRow".id;
  END LOOP;

  SELECT COALESCE(sum(l."collectedAmount"), 0) INTO "vPosted"
    FROM "Distribution"."RecoverySheetLines" l
   WHERE l."tenantId" = "vTenant" AND l."recoverySheetId" = "vSheet".id AND l.status = 'POSTED';
  UPDATE "Distribution"."RecoverySheets" s
     SET "postedTotal" = "vPosted", "collectedTotal" = GREATEST(s."collectedTotal", "vPosted")
   WHERE s."tenantId" = "vTenant" AND s.id = "vSheet".id;
END $$;
COMMENT ON FUNCTION "Distribution"."recoverySheetPostEntries"(uuid) IS
  'Posting hook of a recovery sheet Post: one receipt (FIFO allocation) and voucher (source RCPT) per READY line.';
