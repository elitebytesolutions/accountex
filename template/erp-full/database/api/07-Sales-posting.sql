-- =============================================================================
-- Finsoft ERP — API: Sales posting hooks (Full edition)
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
--   salesInvoicePostEntries      INV / SV / WS / POS: Dr AR · Cr revenue, GST, further tax,
--                                advance tax, FBR fee · Dr COGS / Cr Inventory (or GDNI) · stock OUT
--   salesInvoiceVoidEntries      mirror journal + mirror stock rows, order roll-back
--   creditNoteCancelEntries      reverse the CN journal + restocked quantities
--   customerReceiptVoidEntries   reverse the RCPT journal, cancel the SUFFERED WHT row
--   deliveryChallanCancelEntries reverse the DC (GDNI) journal + stock, order roll-back
--   salesReturnPostEntries       SR: stock IN by disposition, Dr Inventory / shrinkage · Cr COGS;
--                                raises + posts the credit note (Dr returns, GST · Cr AR)
--   salesReturnCancelEntries     reverse SR + its credit note, mirror stock
-- Not implemented (no journal or stock effect): quotationCancel, salesOrderCancel,
-- creditOverrideApprove (POSTING_RULES: "Credit override / hold / reminders — no journal").
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Sales document type of an invoice (journal / stock sourceDocType) by channel.
CREATE OR REPLACE FUNCTION "Sales"."getInvoiceDocType"("pChannel" text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE "pChannel" WHEN 'COUNTER'   THEN 'SV'
                         WHEN 'WHOLESALE' THEN 'WS'
                         WHEN 'POS'       THEN 'POS'
                         ELSE 'INV' END
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
-- Sales invoice — Post (INV / SV / WS / POS)
--   Dr AR_CONTROL (customer.receivableAccountId)      netAmount
--   Cr revenue (line revenueAccountId | SALES_REVENUE) Σ line taxableAmount
--   Cr GST (TaxCodes.accountId | OUTPUT_GST)           Σ line taxAmount
--   Cr FURTHER_TAX_PAYABLE / ADVANCE_TAX_COLLECTED / FBR_POS_FEE   header amounts
--   Dr COGS · Cr INVENTORY (stock issued now) / Cr GDNI (lines delivered by a challan)
--   Stock OUT baseQty + bonusQty unless stockIssueMode = 'AT_DISPATCH'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."salesInvoicePostEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
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
END $$;
COMMENT ON FUNCTION "Sales"."salesInvoicePostEntries"(uuid) IS
  'Posting hook of Sales.salesInvoicePost: credit control, stock OUT (FEFO), COGS, invoice journal (INV/SV/WS/POS), order roll-up, 236G/H register row.';

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
  "vDelivered" boolean;
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
  SELECT r."docNo" INTO "vRef" FROM "Sales"."SalesReturns" r
   WHERE r."tenantId" = "vTenant" AND (r."invoiceId" = "pId" OR r."replacementInvoiceId" = "pId") AND r.status = 'POSTED'
   LIMIT 1;
  IF "vRef" IS NOT NULL THEN
    RAISE EXCEPTION 'Sales invoice % has posted sales return %: cancel the return first', "vInv"."docNo", "vRef"
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

  -- challans converted into this invoice go back to DELIVERED
  UPDATE "Sales"."DeliveryChallans" d SET status = 'DELIVERED', "invoiceId" = NULL
   WHERE d."tenantId" = "vTenant" AND d."invoiceId" = "pId" AND d.status = 'INVOICED';

  -- sales order roll-back
  "vDelivered" := "vInv"."stockIssueMode" IS DISTINCT FROM 'AT_DISPATCH' OR "vInv"."stockIssuedAt" IS NOT NULL;
  UPDATE "Sales"."SalesOrderLines" ol
     SET "invoicedQty"  = GREATEST(ol."invoicedQty" - x.qty, 0),
         "deliveredQty" = GREATEST(ol."deliveredQty" - x."deliverQty", 0)
    FROM (SELECT l."salesOrderLineId", sum(l."baseQty" + l."bonusQty") AS qty,
                 sum(CASE WHEN "vDelivered" AND l."itemId" IS NOT NULL AND l."deliveryChallanLineId" IS NULL
                          THEN l."baseQty" + l."bonusQty" ELSE 0 END) AS "deliverQty"
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

  -- WHT register: the 236G / 236H collection no longer exists (deposited rows stay PAID)
  UPDATE "Tax"."WhtDeductions" w SET status = 'CANCELLED'
   WHERE w."tenantId" = "vTenant" AND w."sourceDocType" = "vDocType" AND w."sourceDocId" = "pId"
     AND w.status = 'UNPAID';
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

  IF "vCn"."salesReturnId" IS NOT NULL THEN
    SELECT r."docNo" INTO "vRef" FROM "Sales"."SalesReturns" r
     WHERE r."tenantId" = "vTenant" AND r.id = "vCn"."salesReturnId" AND r.status = 'POSTED';
    IF "vRef" IS NOT NULL THEN
      RAISE EXCEPTION 'Credit note % was raised by sales return %: cancel the return instead', "vCn"."docNo", "vRef"
        USING ERRCODE = 'check_violation';
    END IF;
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

  IF EXISTS (SELECT 1 FROM "Tax"."WhtDeductions" w
              WHERE w."tenantId" = "vTenant" AND w."sourceDocType" = 'RCPT' AND w."sourceDocId" = "pId"
                AND w.status = 'CLAIMED') THEN
    RAISE EXCEPTION 'Receipt %: the WHT withheld by the customer is already claimed against a certificate', "vRc"."docNo"
      USING ERRCODE = 'check_violation';
  END IF;

  IF "vRc".status <> 'BOUNCED' THEN
    PERFORM "Accounting"."journalReverseForSource"('RCPT', "pId", 'OTHER', current_date);
    PERFORM "Sales"."voucherReverseIfPosted"("vRc"."journalEntryId", current_date, 'Void of ' || "vRc"."docNo");
  END IF;

  UPDATE "Tax"."WhtDeductions" w SET status = 'CANCELLED'
   WHERE w."tenantId" = "vTenant" AND w."sourceDocType" = 'RCPT' AND w."sourceDocId" = "pId"
     AND w.status = 'UNPAID';
END $$;
COMMENT ON FUNCTION "Sales"."customerReceiptVoidEntries"(uuid) IS
  'Posting hook of Sales.customerReceiptVoid: reverses the receipt journal and cancels the SUFFERED WHT register row.';

-- -----------------------------------------------------------------------------
-- Delivery challan — Cancel after dispatch: Dr INVENTORY / Cr GDNI (reverse of the
-- dispatch entry) + stock IN (mirror rows), delivered quantity back on the order.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."deliveryChallanCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
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
END $$;
COMMENT ON FUNCTION "Sales"."deliveryChallanCancelEntries"(uuid) IS
  'Posting hook of Sales.deliveryChallanCancel: reverses the GDNI dispatch entry and stock, reduces delivered quantity.';

-- -----------------------------------------------------------------------------
-- Sales return — Post (SR)
--   stock IN to SalesReturns.warehouseId at the original issue cost (invoice line
--   unitCost, else the item's moving average); WRITE_OFF lines go IN then OUT.
--   Dr INVENTORY (RESTOCK / QUARANTINE) · Dr INVENTORY_SHRINKAGE (WRITE_OFF) · Cr COGS
--   + the credit note it raises (restock = false):
--   Dr SALES_RETURNS (value) · Dr OUTPUT_GST (tax) · Cr AR_CONTROL (customer, total)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."salesReturnPostEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"    uuid := "Company"."getCurrentTenantId"();
  "vSr"        record;
  "vInvNo"     text;
  "vInvStatus" text;
  "vInvBalance" numeric(18,2);
  "vInvCurrency" text;
  "vCust"      record;
  "vLine"      record;
  "vUnitCost"  numeric(18,4);
  "vCost"      numeric(18,2);
  "vStock"     numeric(18,2) := 0;
  "vWriteOff"  numeric(18,2) := 0;
  "vJournal"   uuid;
  "vCnId"      uuid;
  "vCnNo"      text;
  "vCnJournal" uuid;
  "vTreatment" text;
  "vCount"     integer;
  "vSumValue"  numeric(18,2);
  "vSumTax"    numeric(18,2);
BEGIN
  SELECT r.* INTO "vSr" FROM "Sales"."SalesReturns" r WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales return % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  SELECT count(*), COALESCE(sum(l."valueAmount"), 0), COALESCE(sum(l."taxAmount"), 0)
    INTO "vCount", "vSumValue", "vSumTax"
    FROM "Sales"."SalesReturnLines" l WHERE l."tenantId" = "vTenant" AND l."salesReturnId" = "pId";
  IF "vCount" = 0 THEN
    RAISE EXCEPTION 'Sales return %: add the returned items before posting', "vSr"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  IF "vSumValue" <> "vSr"."valueAmount" OR "vSumTax" <> "vSr"."taxAmount" THEN
    RAISE EXCEPTION 'Sales return %: header totals do not match the lines; save the return again', "vSr"."docNo"
      USING ERRCODE = 'check_violation';
  END IF;
  IF "vSr"."invoiceId" IS NOT NULL THEN
    SELECT i."docNo", i.status, i."balanceAmount", i."currencyCode"
      INTO "vInvNo", "vInvStatus", "vInvBalance", "vInvCurrency"
      FROM "Sales"."SalesInvoices" i WHERE i."tenantId" = "vTenant" AND i.id = "vSr"."invoiceId";
    IF "vInvStatus" NOT IN ('POSTED','PARTIALLY_PAID','PAID') THEN
      RAISE EXCEPTION 'Sales return %: invoice % is % (only posted invoices can take a return)',
        "vSr"."docNo", "vInvNo", "vInvStatus" USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  SELECT c.name, c."receivableAccountId" INTO "vCust"
    FROM "Sales"."Customers" c WHERE c."tenantId" = "vTenant" AND c.id = "vSr"."customerId";

  -- 1. goods back by disposition ------------------------------------------------------
  FOR "vLine" IN
    SELECT l.id, l."itemId", l."batchId", l."baseQty", l.disposition, il."unitCost" AS "invoiceUnitCost",
           p."avgCost"
      FROM "Sales"."SalesReturnLines" l
      JOIN "Inventory"."Products" p ON p."tenantId" = l."tenantId" AND p.id = l."itemId"
      LEFT JOIN "Sales"."SalesInvoiceLines" il ON il."tenantId" = l."tenantId" AND il.id = l."invoiceLineId"
     WHERE l."tenantId" = "vTenant" AND l."salesReturnId" = "pId"
     ORDER BY l."lineNo"
  LOOP
    "vUnitCost" := COALESCE("vLine"."invoiceUnitCost", "vLine"."avgCost", 0);
    "vCost" := round("vLine"."baseQty" * "vUnitCost", 2);
    PERFORM "Inventory"."stockMove"(jsonb_build_object(
      'itemId', "vLine"."itemId", 'warehouseId', "vSr"."warehouseId", 'batchId', "vLine"."batchId",
      'qtyIn', "vLine"."baseQty", 'unitCost', "vUnitCost", 'movementType', 'SALES_RETURN',
      'movementDate', "vSr"."docDate", 'sourceDocType', 'SR', 'sourceDocId', "pId", 'sourceDocNo', "vSr"."docNo",
      'sourceLineId', "vLine".id, 'partyLabel', "vCust".name,
      'remarks', CASE WHEN "vLine".disposition = 'QUARANTINE' THEN 'Quarantine — not for sale' END));
    IF "vLine".disposition = 'WRITE_OFF' THEN
      PERFORM "Inventory"."stockMove"(jsonb_build_object(
        'itemId', "vLine"."itemId", 'warehouseId', "vSr"."warehouseId", 'batchId', "vLine"."batchId",
        'qtyOut', "vLine"."baseQty", 'unitCost', "vUnitCost", 'movementType', 'WRITE_OFF',
        'movementDate', "vSr"."docDate", 'sourceDocType', 'SR', 'sourceDocId', "pId", 'sourceDocNo', "vSr"."docNo",
        'sourceLineId', "vLine".id, 'partyLabel', "vCust".name, 'remarks', 'Returned goods written off'));
      "vWriteOff" := "vWriteOff" + "vCost";
    ELSE
      "vStock" := "vStock" + "vCost";
    END IF;
    UPDATE "Sales"."SalesReturnLines" l SET "unitCost" = "vUnitCost", "costAmount" = "vCost"
     WHERE l."tenantId" = "vTenant" AND l.id = "vLine".id;
  END LOOP;

  IF "vStock" + "vWriteOff" > 0 THEN
    "vJournal" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vSr"."docDate", 'postingDate', "vSr"."docDate",
                         'branchId', "vSr"."branchId", 'narration', 'Sales return ' || "vSr"."docNo" || ' · ' || "vCust".name,
                         'sourceDocType', 'SR', 'sourceDocId', "pId", 'sourceDocNo', "vSr"."docNo", 'partyName', "vCust".name),
      jsonb_build_array(
        jsonb_build_object('accountRole', 'INVENTORY', 'debit', "vStock", 'particulars', 'Returned to stock ' || "vSr"."docNo"),
        jsonb_build_object('accountRole', 'INVENTORY_SHRINKAGE', 'debit', "vWriteOff", 'particulars', 'Returned goods written off ' || "vSr"."docNo"),
        jsonb_build_object('accountRole', 'COGS', 'credit', "vStock" + "vWriteOff", 'particulars', 'Cost of sales reversed ' || "vSr"."docNo")));
  END IF;

  -- 2. the credit note (AR + GST side) --------------------------------------------------
  IF "vSr"."totalAmount" > 0 THEN
    "vTreatment" := CASE WHEN "vInvStatus" IN ('POSTED','PARTIALLY_PAID')
                              AND "vInvBalance" >= "vSr"."totalAmount"
                         THEN 'APPLY_TO_INVOICE' ELSE 'KEEP_AS_CREDIT' END;
    "vCnNo" := "Company"."getNextDocNo"('CN', "vSr"."docDate", "vSr"."branchId");
    INSERT INTO "Sales"."CreditNotes"
           ("tenantId", "docNo", "docDate", "customerId", "invoiceId", "branchId", reason, "reasonNote",
            "returnWarehouseId", treatment, "currencyCode", "valueAmount", "taxAmount", "furtherTaxAmount",
            "totalAmount", narration, status, "salesReturnId")
    VALUES ("vTenant", "vCnNo", "vSr"."docDate", "vSr"."customerId", "vSr"."invoiceId", "vSr"."branchId",
            'SALES_RETURN', 'Sales return ' || "vSr"."docNo", "vSr"."warehouseId", "vTreatment",
            COALESCE("vInvCurrency", 'PKR'), "vSr"."valueAmount", "vSr"."taxAmount", 0,
            "vSr"."totalAmount", COALESCE("vSr".remarks, 'Raised by sales return ' || "vSr"."docNo"), 'DRAFT', "pId")
    RETURNING id INTO "vCnId";
    INSERT INTO "Sales"."CreditNoteLines"
           ("tenantId", "creditNoteId", "lineNo", "invoiceLineId", "itemId", description, "batchId", "invoicedQty",
            "qtyCtn", "qtyLoose", "ctnFactor", "baseQty", rate, "valueAmount", "taxCodeId", "taxRate", "taxAmount",
            "furtherTaxAmount", "totalAmount", restock, "unitCost", "costAmount")
    SELECT "vTenant", "vCnId", l."lineNo", l."invoiceLineId", l."itemId", p.name, l."batchId", l."soldQty",
           l."qtyCtn", l."qtyLoose", l."ctnFactor", l."baseQty", l.rate, l."valueAmount", l."taxCodeId", l."taxRate",
           l."taxAmount", 0, l."totalAmount", false, l."unitCost", 0
      FROM "Sales"."SalesReturnLines" l
      JOIN "Inventory"."Products" p ON p."tenantId" = l."tenantId" AND p.id = l."itemId"
     WHERE l."tenantId" = "vTenant" AND l."salesReturnId" = "pId";

    "vCnJournal" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vSr"."docDate", 'postingDate', "vSr"."docDate",
                         'branchId', "vSr"."branchId", 'narration', 'Credit note ' || "vCnNo" || ' for sales return ' || "vSr"."docNo",
                         'sourceDocType', 'CN', 'sourceDocId', "vCnId", 'sourceDocNo', "vCnNo", 'partyName', "vCust".name),
      jsonb_build_array(
        jsonb_build_object('accountRole', 'SALES_RETURNS', 'debit', "vSr"."valueAmount", 'particulars', 'Sales return ' || "vSr"."docNo"),
        jsonb_build_object('accountRole', 'OUTPUT_GST', 'debit', "vSr"."taxAmount", 'particulars', 'Output sales tax reversed ' || "vCnNo"),
        jsonb_build_object('accountId', "vCust"."receivableAccountId", 'accountRole', 'AR_CONTROL',
                           'credit', "vSr"."totalAmount", 'customerId', "vSr"."customerId",
                           'particulars', "vCnNo" || ' · ' || "vCust".name)));

    UPDATE "Sales"."CreditNotes" c
       SET status = CASE WHEN "vTreatment" = 'APPLY_TO_INVOICE' THEN 'APPLIED' ELSE 'OPEN' END,
           "postedAt" = now(), "approvedAt" = now(), "approvedByUserId" = "Company"."getCurrentUserId"(),
           "journalEntryId" = "vCnJournal"
     WHERE c."tenantId" = "vTenant" AND c.id = "vCnId";
  END IF;

  UPDATE "Sales"."SalesReturns" r
     SET "journalEntryId" = "vJournal", "creditNoteId" = "vCnId", "costAmount" = "vStock" + "vWriteOff"
   WHERE r."tenantId" = "vTenant" AND r.id = "pId";
END $$;
COMMENT ON FUNCTION "Sales"."salesReturnPostEntries"(uuid) IS
  'Posting hook of Sales.salesReturnPost: stock IN by disposition, SR cost journal, raises and posts the credit note.';

-- -----------------------------------------------------------------------------
-- Sales return — Cancel: reverse SR journal + stock, cancel and reverse its credit note.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."salesReturnCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vSr"     record;
  "vCn"     record;
  "vRef"    text;
BEGIN
  SELECT r.* INTO "vSr" FROM "Sales"."SalesReturns" r WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales return % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vSr".status = 'DRAFT' THEN
    RETURN;
  END IF;

  IF "vSr"."creditNoteId" IS NOT NULL THEN
    SELECT c.* INTO "vCn" FROM "Sales"."CreditNotes" c WHERE c."tenantId" = "vTenant" AND c.id = "vSr"."creditNoteId";
    IF "vCn".status <> 'CANCELLED' THEN
      IF "vCn"."refundedAmount" > 0 THEN
        RAISE EXCEPTION 'Sales return %: its credit note % has been refunded; reverse the refund first', "vSr"."docNo", "vCn"."docNo"
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT r."docNo" INTO "vRef"
        FROM "Sales"."CustomerReceiptAllocations" a
        JOIN "Sales"."CustomerReceipts" r ON r."tenantId" = a."tenantId" AND r.id = a."receiptId"
       WHERE a."tenantId" = "vTenant" AND a."creditNoteId" = "vCn".id AND r.status NOT IN ('BOUNCED','VOID')
       LIMIT 1;
      IF "vRef" IS NOT NULL THEN
        RAISE EXCEPTION 'Sales return %: its credit note % is used in receipt %; remove that allocation first',
          "vSr"."docNo", "vCn"."docNo", "vRef" USING ERRCODE = 'check_violation';
      END IF;
      PERFORM "Accounting"."journalReverseForSource"('CN', "vCn".id, 'OTHER', current_date);
      PERFORM "Sales"."voucherReverseIfPosted"("vCn"."journalEntryId", current_date, 'Cancel of ' || "vSr"."docNo");
      PERFORM "Sales"."stockReverseForSource"('CN', "vCn".id, current_date, 'Cancel of ' || "vSr"."docNo");
      UPDATE "Sales"."CreditNotes" c
         SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = 'Sales return ' || "vSr"."docNo" || ' cancelled'
       WHERE c."tenantId" = "vTenant" AND c.id = "vCn".id;
    END IF;
  END IF;

  PERFORM "Accounting"."journalReverseForSource"('SR', "pId", 'OTHER', current_date);
  PERFORM "Sales"."voucherReverseIfPosted"("vSr"."journalEntryId", current_date, 'Cancel of ' || "vSr"."docNo");
  PERFORM "Sales"."stockReverseForSource"('SR', "pId", current_date, 'Cancel of ' || "vSr"."docNo");
END $$;
COMMENT ON FUNCTION "Sales"."salesReturnCancelEntries"(uuid) IS
  'Posting hook of Sales.salesReturnCancel: reverses the SR cost journal and stock, cancels and reverses its credit note.';
