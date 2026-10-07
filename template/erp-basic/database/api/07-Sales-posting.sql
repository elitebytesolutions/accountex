-- =============================================================================
-- Finsoft ERP — API: Sales posting hooks (Basic edition)
-- Hand-written. The generated actions in 07-Sales-api.sql call
-- "Sales"."<entity><Action>Entries"(id) BEFORE they change the status, so every
-- hook still sees the document as DRAFT / POSTED / OPEN … and runs inside the
-- same transaction (a RAISE here rolls the whole action back).
--
-- Rules: POSTING_RULES.md §Sales & receivables, §Tax (WHT register rows).
-- Helpers: 00-Posting-api.sql (journalCreate, journalReverseForSource, stockMove,
-- getAccountForRole). All journals are SYSTEM vouchers in base currency (PKR):
-- document amounts × fxRate.
--
--   salesInvoicePostEntries      INV / SV: Dr AR · Cr revenue, GST, further tax, advance tax,
--                                FBR fee · Dr COGS / Cr Inventory · stock OUT
--   salesInvoiceVoidEntries      mirror journal + mirror stock rows, order roll-back
--   creditNoteCancelEntries      reverse the CN journal + restocked quantities
--   customerReceiptVoidEntries   reverse the RCPT journal
-- Not implemented (no journal or stock effect): quotationCancel, salesOrderCancel.
-- Full adds challans, sales returns, POS / wholesale channels and the WHT register.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Sales document type of an invoice (journal / stock sourceDocType) by channel.
CREATE OR REPLACE FUNCTION "Sales"."getInvoiceDocType"("pChannel" text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE "pChannel" WHEN 'COUNTER' THEN 'SV' ELSE 'INV' END
$$;

-- FEFO default batch: the saleable, unexpired batch with enough stock in the
-- warehouse that expires first (NULL when none qualifies).
CREATE OR REPLACE FUNCTION "Sales"."getFefoBatch"("pItemId" uuid, "pWarehouseId" uuid, "pQty" numeric)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT b."batchId"
    FROM "Inventory"."StockBalances" b
    JOIN "Inventory"."ProductBatches" pb ON pb."tenantId" = b."tenantId" AND pb.id = b."batchId"
   WHERE b."tenantId" = "Company"."getCurrentTenantId"()
     AND b."itemId" = "pItemId" AND b."warehouseId" = "pWarehouseId"
     AND b."batchId" IS NOT NULL AND b."qtyOnHand" >= "pQty"
     AND pb.disposition = 'SALEABLE'
     AND (pb."expiryDate" IS NULL OR pb."expiryDate" >= current_date)
   ORDER BY pb."expiryDate" NULLS LAST, pb."batchNo"
   LIMIT 1
$$;

-- Writes the opposite of every stock row a source document still holds (net per
-- item × warehouse × bin × batch × cost × movement type × line), at the original
-- unit cost. Issues are given back before receipts are taken back, so the
-- negative-stock guard sees the restored quantity first. Idempotent: once
-- mirrored, the net is zero and nothing more is written.
CREATE OR REPLACE FUNCTION "Sales"."stockReverseForSource"("pSourceDocType" text, "pSourceDocId" uuid,
                                                          "pDate" date DEFAULT current_date,
                                                          "pRemarks" text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    record;
  "vCount"  integer := 0;
BEGIN
  FOR "vRow" IN
    SELECT m."itemId", m."warehouseId", m."binId", m."batchId", m."unitCost", m."movementType",
           m."sourceLineId", max(m."sourceDocNo") AS "sourceDocNo", max(m."partyLabel") AS "partyLabel",
           sum(m."qtyIn" - m."qtyOut") AS "netQty"
      FROM "Inventory"."StockMovements" m
     WHERE m."tenantId" = "vTenant" AND m."sourceDocType" = "pSourceDocType" AND m."sourceDocId" = "pSourceDocId"
     GROUP BY m."itemId", m."warehouseId", m."binId", m."batchId", m."unitCost", m."movementType", m."sourceLineId"
    HAVING sum(m."qtyIn" - m."qtyOut") <> 0
     ORDER BY sum(m."qtyIn" - m."qtyOut")
  LOOP
    PERFORM "Inventory"."stockMove"(jsonb_build_object(
      'itemId', "vRow"."itemId", 'warehouseId', "vRow"."warehouseId", 'binId', "vRow"."binId",
      'batchId', "vRow"."batchId",
      'qtyIn',  CASE WHEN "vRow"."netQty" < 0 THEN -"vRow"."netQty" END,
      'qtyOut', CASE WHEN "vRow"."netQty" > 0 THEN "vRow"."netQty" END,
      'unitCost', "vRow"."unitCost", 'movementType', "vRow"."movementType", 'movementDate', "pDate",
      'sourceDocType', "pSourceDocType", 'sourceDocId', "pSourceDocId", 'sourceDocNo', "vRow"."sourceDocNo",
      'sourceLineId', "vRow"."sourceLineId", 'partyLabel', "vRow"."partyLabel",
      'remarks', COALESCE("pRemarks", 'Reversal')));
    "vCount" := "vCount" + 1;
  END LOOP;
  RETURN "vCount";
END $$;
COMMENT ON FUNCTION "Sales"."stockReverseForSource"(text, uuid, date, text) IS
  'Mirror stock rows of a source document (Void / Cancel): opposite quantity at the original cost. Idempotent.';

-- Reverses one voucher if it is still POSTED and not itself a reversal (journals
-- referenced by journalEntryId but not tagged with the document as source).
CREATE OR REPLACE FUNCTION "Sales"."voucherReverseIfPosted"("pVoucherId" uuid, "pDate" date, "pRemarks" text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF "pVoucherId" IS NULL OR NOT EXISTS (
       SELECT 1 FROM "Accounting"."Vouchers" v
        WHERE v."tenantId" = "Company"."getCurrentTenantId"() AND v.id = "pVoucherId"
          AND v.status = 'POSTED' AND v."reversalOfId" IS NULL) THEN
    RETURN NULL;
  END IF;
  RETURN "Accounting"."voucherReverse"("pVoucherId", "pDate", 'OTHER', "pRemarks");
END $$;

-- -----------------------------------------------------------------------------
-- Sales invoice — Post (INV / SV)
--   Dr AR_CONTROL (customer.receivableAccountId)      netAmount
--   Cr revenue (line revenueAccountId | SALES_REVENUE) Σ line taxableAmount
--   Cr GST (TaxCodes.accountId | OUTPUT_GST)           Σ line taxAmount
--   Cr FURTHER_TAX_PAYABLE / ADVANCE_TAX_COLLECTED / FBR_POS_FEE   header amounts
--   Dr COGS · Cr INVENTORY                             Σ line costAmount (moving average)
--   Stock OUT baseQty + bonusQty from the invoice warehouse (FEFO batch).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."salesInvoicePostEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"     uuid := "Company"."getCurrentTenantId"();
  "vInv"        record;
  "vCust"       record;
  "vLine"       record;
  "vRow"        record;
  "vDocType"    text;
  "vFx"         numeric(18,6);
  "vLines"      jsonb := '[]'::jsonb;
  "vRevenue"    numeric(18,2) := 0;
  "vAmount"     numeric(18,2);
  "vCogs"       numeric(18,2) := 0;
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

  -- credit control (credit sales)
  IF "vInv".channel = 'STANDARD' THEN
    IF "vCust".status = 'ON_HOLD' THEN
      RAISE EXCEPTION 'Customer % is on credit hold (%): release the hold to post %',
        "vCust".name, COALESCE("vCust"."holdReason", 'hold'), "vInv"."docNo"
        USING ERRCODE = 'check_violation';
    END IF;
    IF "vCust"."blockOverLimit" THEN
      SELECT cp."effectiveLimit", cp.balance INTO "vRow"
        FROM "Sales"."getCustomerCreditPosition" cp
       WHERE cp."tenantId" = "vTenant" AND cp."customerId" = "vInv"."customerId";
      IF COALESCE("vRow"."effectiveLimit", 0) > 0
         AND COALESCE("vRow".balance, 0) + round("vInv"."netAmount" * "vFx", 2) > "vRow"."effectiveLimit" THEN
        RAISE EXCEPTION 'Credit limit exceeded for %: balance % + invoice % > limit %',
          "vCust".name, COALESCE("vRow".balance, 0), round("vInv"."netAmount" * "vFx", 2), "vRow"."effectiveLimit"
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- 2. stock and cost per line ---------------------------------------------------
  "vWarehouse" := "vInv"."warehouseId";

  FOR "vLine" IN
    SELECT l.id, l."lineNo", l."itemId", l."batchId", l."baseQty", l."bonusQty",
           p.name AS "itemName", p."trackExpiry"
      FROM "Sales"."SalesInvoiceLines" l
      LEFT JOIN "Inventory"."Products" p ON p."tenantId" = l."tenantId" AND p.id = l."itemId"
     WHERE l."tenantId" = "vTenant" AND l."invoiceId" = "pId" AND l."itemId" IS NOT NULL
     ORDER BY l."lineNo"
  LOOP
    "vQty" := "vLine"."baseQty" + "vLine"."bonusQty";
    IF "vWarehouse" IS NULL THEN
      RAISE EXCEPTION 'Sales invoice %: choose the warehouse the goods leave from', "vInv"."docNo"
        USING ERRCODE = 'not_null_violation';
    END IF;
    "vBatch" := "vLine"."batchId";
    IF "vBatch" IS NULL AND "vLine"."trackExpiry" THEN
      "vBatch" := "Sales"."getFefoBatch"("vLine"."itemId", "vWarehouse", "vQty");
      IF "vBatch" IS NULL THEN
        RAISE EXCEPTION 'Sales invoice % line %: no saleable batch of % has % in stock; pick the batch',
          "vInv"."docNo", "vLine"."lineNo", "vLine"."itemName", "vQty" USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    "vMoveId" := "Inventory"."stockMove"(jsonb_build_object(
      'itemId', "vLine"."itemId", 'warehouseId', "vWarehouse", 'batchId', "vBatch", 'qtyOut', "vQty",
      'movementType', 'SALE', 'movementDate', "vInv"."docDate",
      'sourceDocType', "vDocType", 'sourceDocId', "pId", 'sourceDocNo', "vInv"."docNo",
      'sourceLineId', "vLine".id, 'partyLabel', "vParty"));
    SELECT m."unitCost" INTO "vUnitCost"
      FROM "Inventory"."StockMovements" m WHERE m."tenantId" = "vTenant" AND m.id = "vMoveId";
    "vCost" := round("vQty" * "vUnitCost", 2);
    "vCogs" := "vCogs" + "vCost";
    UPDATE "Sales"."SalesInvoiceLines" l
       SET "unitCost" = "vUnitCost", "costAmount" = "vCost", "batchId" = "vBatch"
     WHERE l."tenantId" = "vTenant" AND l.id = "vLine".id;
  END LOOP;

  UPDATE "Sales"."SalesInvoices" i SET "costAmount" = "vCogs"
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
  IF "vCogs" > 0 THEN
    "vLines" := "vLines" || jsonb_build_array(
      jsonb_build_object('accountRole', 'COGS', 'debit', "vCogs", 'particulars', 'Cost of sales ' || "vInv"."docNo"),
      jsonb_build_object('accountRole', 'INVENTORY', 'credit', "vCogs", 'particulars', 'Stock issued ' || "vInv"."docNo"));
  END IF;

  IF "vRevenue" + "vCogs" > 0 THEN
    "vJournal" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vInv"."docDate", 'postingDate', "vInv"."docDate",
                         'branchId', "vInv"."branchId", 'narration', 'Sales invoice ' || "vInv"."docNo" || ' · ' || "vParty",
                         'sourceDocType', "vDocType", 'sourceDocId', "pId", 'sourceDocNo', "vInv"."docNo",
                         'partyName', "vParty", 'currencyCode', "vInv"."currencyCode", 'fxRate', "vFx"),
      "vLines");
    UPDATE "Sales"."SalesInvoices" i SET "journalEntryId" = "vJournal"
     WHERE i."tenantId" = "vTenant" AND i.id = "pId";
  END IF;

  -- 4. sales order roll-up (Basic: delivery = invoicing)
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
                 sum(CASE WHEN l."itemId" IS NOT NULL THEN l."baseQty" + l."bonusQty" ELSE 0 END) AS "deliverQty"
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

END $$;
COMMENT ON FUNCTION "Sales"."salesInvoicePostEntries"(uuid) IS
  'Posting hook of Sales.salesInvoicePost: credit control, stock OUT (FEFO), COGS, invoice journal (INV/SV), order roll-up.';

-- -----------------------------------------------------------------------------
-- Sales invoice — Void: mirror journal, mirror stock rows (same cost), order roll-back.
-- Allowed only while nothing is settled against the invoice.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."salesInvoiceVoidEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"  uuid := "Company"."getCurrentTenantId"();
  "vInv"     record;
  "vDocType" text;
  "vRef"     text;
BEGIN
  SELECT i.* INTO "vInv" FROM "Sales"."SalesInvoices" i WHERE i."tenantId" = "vTenant" AND i.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales invoice % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vInv".status = 'DRAFT' THEN
    RETURN;                                           -- nothing was posted
  END IF;
  "vDocType" := "Sales"."getInvoiceDocType"("vInv".channel);

  IF "vInv"."paidAmount" > 0 OR "vInv"."creditAppliedAmount" > 0 THEN
    RAISE EXCEPTION 'Sales invoice % has % settled (receipts / credit notes): remove those first, then void',
      "vInv"."docNo", "vInv"."paidAmount" + "vInv"."creditAppliedAmount" USING ERRCODE = 'check_violation';
  END IF;
  SELECT r."docNo" INTO "vRef"
    FROM "Sales"."CustomerReceiptAllocations" a
    JOIN "Sales"."CustomerReceipts" r ON r."tenantId" = a."tenantId" AND r.id = a."receiptId"
   WHERE a."tenantId" = "vTenant" AND a."invoiceId" = "pId" AND r.status NOT IN ('BOUNCED','VOID')
   LIMIT 1;
  IF "vRef" IS NOT NULL THEN
    RAISE EXCEPTION 'Sales invoice % is allocated in receipt %: un-allocate it first', "vInv"."docNo", "vRef"
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT c."docNo" INTO "vRef" FROM "Sales"."CreditNotes" c
   WHERE c."tenantId" = "vTenant" AND c."invoiceId" = "pId" AND c.status <> 'CANCELLED' LIMIT 1;
  IF "vRef" IS NOT NULL THEN
    RAISE EXCEPTION 'Sales invoice % has credit note %: cancel it first', "vInv"."docNo", "vRef"
      USING ERRCODE = 'check_violation';
  END IF;
  -- journal(s) and stock
  PERFORM "Accounting"."journalReverseForSource"("vDocType", "pId", 'OTHER', current_date);
  PERFORM "Sales"."voucherReverseIfPosted"("vInv"."journalEntryId", current_date, 'Void of ' || "vInv"."docNo");
  UPDATE "Sales"."SalesInvoices" i
     SET "reversalJournalEntryId" = (SELECT v.id FROM "Accounting"."Vouchers" v
                                      WHERE v."tenantId" = "vTenant" AND v."reversalOfId" = "vInv"."journalEntryId"
                                      LIMIT 1)
   WHERE i."tenantId" = "vTenant" AND i.id = "pId" AND "vInv"."journalEntryId" IS NOT NULL;
  PERFORM "Sales"."stockReverseForSource"("vDocType", "pId", current_date, 'Void of ' || "vInv"."docNo");

  -- sales order roll-back
  UPDATE "Sales"."SalesOrderLines" ol
     SET "invoicedQty"  = GREATEST(ol."invoicedQty" - x.qty, 0),
         "deliveredQty" = GREATEST(ol."deliveredQty" - x."deliverQty", 0)
    FROM (SELECT l."salesOrderLineId", sum(l."baseQty" + l."bonusQty") AS qty,
                 sum(CASE WHEN l."itemId" IS NOT NULL THEN l."baseQty" + l."bonusQty" ELSE 0 END) AS "deliverQty"
            FROM "Sales"."SalesInvoiceLines" l
           WHERE l."tenantId" = "vTenant" AND l."invoiceId" = "pId" AND l."salesOrderLineId" IS NOT NULL
           GROUP BY l."salesOrderLineId") x
   WHERE ol."tenantId" = "vTenant" AND ol.id = x."salesOrderLineId";
  UPDATE "Sales"."SalesOrders" o
     SET status = CASE
                    WHEN NOT EXISTS (SELECT 1 FROM "Sales"."SalesOrderLines" z
                                      WHERE z."tenantId" = o."tenantId" AND z."salesOrderId" = o.id
                                        AND z."deliveredQty" < z."baseQty" + z."bonusQty") THEN 'TO_INVOICE'
                    WHEN EXISTS (SELECT 1 FROM "Sales"."SalesOrderLines" z
                                  WHERE z."tenantId" = o."tenantId" AND z."salesOrderId" = o.id
                                    AND z."deliveredQty" > 0) THEN 'PARTIALLY_DELIVERED'
                    ELSE 'CONFIRMED' END
   WHERE o."tenantId" = "vTenant" AND o.status = 'INVOICED'
     AND o.id IN (SELECT ol."salesOrderId"
                    FROM "Sales"."SalesInvoiceLines" l
                    JOIN "Sales"."SalesOrderLines" ol ON ol."tenantId" = l."tenantId" AND ol.id = l."salesOrderLineId"
                   WHERE l."tenantId" = "vTenant" AND l."invoiceId" = "pId");

END $$;
COMMENT ON FUNCTION "Sales"."salesInvoiceVoidEntries"(uuid) IS
  'Posting hook of Sales.salesInvoiceVoid: blocks settled invoices, reverses the journal, mirrors stock, rolls back the sales order.';

-- -----------------------------------------------------------------------------
-- Credit note — Cancel: reverse the CN journal (Dr returns / GST · Cr AR) and the
-- restocked quantities. Drafts carry no postings.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."creditNoteCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vCn"     record;
  "vRef"    text;
BEGIN
  SELECT c.* INTO "vCn" FROM "Sales"."CreditNotes" c WHERE c."tenantId" = "vTenant" AND c.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit note % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vCn".status IN ('DRAFT','PENDING_APPROVAL') THEN
    RETURN;
  END IF;

  IF "vCn"."refundedAmount" > 0 THEN
    RAISE EXCEPTION 'Credit note % has been refunded (%): reverse the refund voucher first', "vCn"."docNo", "vCn"."refundedAmount"
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT r."docNo" INTO "vRef"
    FROM "Sales"."CustomerReceiptAllocations" a
    JOIN "Sales"."CustomerReceipts" r ON r."tenantId" = a."tenantId" AND r.id = a."receiptId"
   WHERE a."tenantId" = "vTenant" AND a."creditNoteId" = "pId" AND r.status NOT IN ('BOUNCED','VOID')
   LIMIT 1;
  IF "vRef" IS NOT NULL THEN
    RAISE EXCEPTION 'Credit note % is used in receipt %: remove that allocation first', "vCn"."docNo", "vRef"
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM "Accounting"."journalReverseForSource"('CN', "pId", 'OTHER', current_date);
  PERFORM "Sales"."voucherReverseIfPosted"("vCn"."journalEntryId", current_date, 'Cancel of ' || "vCn"."docNo");
  PERFORM "Sales"."stockReverseForSource"('CN', "pId", current_date, 'Cancel of ' || "vCn"."docNo");
END $$;
COMMENT ON FUNCTION "Sales"."creditNoteCancelEntries"(uuid) IS
  'Posting hook of Sales.creditNoteCancel: blocks used / refunded credit, reverses the CN journal and restocked quantities.';

-- -----------------------------------------------------------------------------
-- Customer receipt — Void: reverse the RCPT journal (Dr bank / cash / WHT /
-- charges · Cr AR). A BOUNCED receipt was already reversed by the bounce entry.
-- Allocations stop counting through receiptStatusSync once the status is VOID.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."customerReceiptVoidEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRc"     record;
BEGIN
  SELECT r.* INTO "vRc" FROM "Sales"."CustomerReceipts" r WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer receipt % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;

  IF "vRc".status <> 'BOUNCED' THEN
    PERFORM "Accounting"."journalReverseForSource"('RCPT', "pId", 'OTHER', current_date);
    PERFORM "Sales"."voucherReverseIfPosted"("vRc"."journalEntryId", current_date, 'Void of ' || "vRc"."docNo");
  END IF;

END $$;
COMMENT ON FUNCTION "Sales"."customerReceiptVoidEntries"(uuid) IS
  'Posting hook of Sales.customerReceiptVoid: reverses the receipt journal.';
