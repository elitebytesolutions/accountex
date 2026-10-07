-- =============================================================================
-- Finsoft ERP — API: posting helpers   (identical in erp-basic and erp-full)
-- Hand-written. Used by the module posting hooks (<entity><Action>Entries) that
-- the generated action functions (<entity>Post / Void / Reverse …) call.
--
--   "Company"."getAccountForRole"(role)          account id of a role (Default accounts)
--   "Accounting"."journalCreate"(header, lines)  balanced, POSTED voucher for a source document
--   "Accounting"."journalReverseForSource"(type, id, reason)   reverse it again (Void)
--   "Inventory"."stockMove"(movement)            one row in the stock ledger
--
-- Every journal/stock row carries sourceDocType / sourceDocId / sourceDocNo, so
-- a document's postings can always be found and reversed, and posting the same
-- document twice never creates a second journal (idempotent).
-- =============================================================================

-- Account of a posting role (Company Settings › Default accounts), e.g.
-- 'AR_CONTROL', 'SALES_REVENUE', 'OUTPUT_GST', 'INVENTORY', 'COGS'.
CREATE OR REPLACE FUNCTION "Company"."getAccountForRole"("pRole" text) RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE
  "vAccount" uuid;
BEGIN
  SELECT m."accountId" INTO "vAccount"
    FROM "Company"."DefaultAccountMappings" m
   WHERE m."tenantId" = "Company"."getCurrentTenantId"() AND m.role = "pRole";
  IF "vAccount" IS NULL THEN
    RAISE EXCEPTION 'No default account is set for role % (Company Settings › Default accounts)', "pRole"
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN "vAccount";
END $$;

-- Creates and posts one voucher for a source document.
--   pHeader: {"voucherType": "SYSTEM"|"JV"|"CRV"…, "docDate", "postingDate", "branchId", "narration",
--             "sourceDocType", "sourceDocId", "sourceDocNo", "partyName"?, "cashBankAccountId"?, "currencyCode"?, "fxRate"?}
--   pLines:  [{"accountId" | "accountRole", "debit" | "credit", "particulars"?, "customerId"?, "vendorId"?,
--              "employeeId"?, "costCentreId"?, "projectId"?, "branchId"?}, …]
-- Lines with a zero amount are skipped. Returns the voucher id. If the source
-- document already has a POSTED voucher, that one is returned (idempotent).
CREATE OR REPLACE FUNCTION "Accounting"."journalCreate"("pHeader" jsonb, "pLines" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vType"   text := COALESCE("pHeader" ->> 'voucherType', 'SYSTEM');
  "vDate"   date := COALESCE(("pHeader" ->> 'postingDate')::date, ("pHeader" ->> 'docDate')::date, current_date);
  "vBranch" uuid := ("pHeader" ->> 'branchId')::uuid;
  "vId"     uuid;
  "vLine"   jsonb;
  "vNo"     int := 0;
  "vDebit"  numeric(18,2);
  "vCredit" numeric(18,2);
BEGIN
  SELECT v.id INTO "vId" FROM "Accounting"."Vouchers" v
   WHERE v."tenantId" = "vTenant" AND v."sourceDocType" = "pHeader" ->> 'sourceDocType'
     AND v."sourceDocId" = ("pHeader" ->> 'sourceDocId')::uuid AND v.status = 'POSTED'
     AND v."reversalOfId" IS NULL
   LIMIT 1;
  IF "vId" IS NOT NULL THEN
    RETURN "vId";
  END IF;
  IF "vBranch" IS NULL THEN
    SELECT b.id INTO "vBranch" FROM "Company"."Branches" b
     WHERE b."tenantId" = "vTenant" ORDER BY b."isDefault" DESC, b."isHeadOffice" DESC LIMIT 1;
  END IF;

  INSERT INTO "Accounting"."Vouchers"
         ("tenantId", "voucherType", "docNo", "docDate", "postingDate", "branchId", narration,
          "currencyCode", "fxRate", "cashBankAccountId", "partyName", status, "preparedByUserId",
          "sourceDocType", "sourceDocId", "sourceDocNo")
  VALUES ("vTenant", "vType",
          "Company"."getNextDocNo"(CASE WHEN "vType" IN ('SYSTEM','OB') THEN 'JV' ELSE "vType" END, "vDate", "vBranch"),
          COALESCE(("pHeader" ->> 'docDate')::date, "vDate"), "vDate", "vBranch",
          left(COALESCE("pHeader" ->> 'narration', 'Posting of ' || COALESCE("pHeader" ->> 'sourceDocNo', '')), 300),
          COALESCE("pHeader" ->> 'currencyCode', 'PKR'), COALESCE(("pHeader" ->> 'fxRate')::numeric, 1),
          ("pHeader" ->> 'cashBankAccountId')::uuid, "pHeader" ->> 'partyName', 'DRAFT', "Company"."getCurrentUserId"(),
          "pHeader" ->> 'sourceDocType', ("pHeader" ->> 'sourceDocId')::uuid, "pHeader" ->> 'sourceDocNo')
  RETURNING id INTO "vId";

  FOR "vLine" IN SELECT x FROM jsonb_array_elements("pLines") x LOOP
    "vDebit"  := round(COALESCE(("vLine" ->> 'debit')::numeric, 0), 2);
    "vCredit" := round(COALESCE(("vLine" ->> 'credit')::numeric, 0), 2);
    CONTINUE WHEN "vDebit" = 0 AND "vCredit" = 0;
    IF "vDebit" < 0 THEN "vCredit" := "vCredit" - "vDebit"; "vDebit" := 0; END IF;   -- a negative amount flips side
    IF "vCredit" < 0 THEN "vDebit" := "vDebit" - "vCredit"; "vCredit" := 0; END IF;
    IF "vDebit" > 0 AND "vCredit" > 0 THEN                                           -- net one side
      IF "vDebit" >= "vCredit" THEN "vDebit" := "vDebit" - "vCredit"; "vCredit" := 0;
      ELSE "vCredit" := "vCredit" - "vDebit"; "vDebit" := 0; END IF;
      CONTINUE WHEN "vDebit" = 0 AND "vCredit" = 0;
    END IF;
    "vNo" := "vNo" + 1;
    INSERT INTO "Accounting"."VoucherLines"
           ("tenantId", "journalEntryId", "lineNo", "accountId", particulars, debit, credit,
            "costCentreId", "branchId", "customerId", "vendorId", "employeeId", "projectId")
    VALUES ("vTenant", "vId", "vNo",
            COALESCE(("vLine" ->> 'accountId')::uuid, "Company"."getAccountForRole"("vLine" ->> 'accountRole')),
            "vLine" ->> 'particulars', "vDebit", "vCredit",
            ("vLine" ->> 'costCentreId')::uuid, COALESCE(("vLine" ->> 'branchId')::uuid, "vBranch"),
            ("vLine" ->> 'customerId')::uuid, ("vLine" ->> 'vendorId')::uuid,
            ("vLine" ->> 'employeeId')::uuid, ("vLine" ->> 'projectId')::uuid);
  END LOOP;

  -- the voucher guard trigger checks balance, postable accounts, open period and lock date
  UPDATE "Accounting"."Vouchers" SET status = 'POSTED' WHERE "tenantId" = "vTenant" AND id = "vId";
  RETURN "vId";
END $$;
COMMENT ON FUNCTION "Accounting"."journalCreate"(jsonb, jsonb) IS
  'Creates and posts the voucher of a source document (idempotent per source). Used by the module posting hooks.';

-- Reverses the posted voucher(s) of a source document (Void / Cancel / Reverse actions).
CREATE OR REPLACE FUNCTION "Accounting"."journalReverseForSource"("pSourceDocType" text, "pSourceDocId" uuid,
                                                                  "pReason" text DEFAULT 'OTHER',
                                                                  "pDate" date DEFAULT current_date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vId"    uuid;
  "vCount" integer := 0;
BEGIN
  FOR "vId" IN
    SELECT v.id FROM "Accounting"."Vouchers" v
     WHERE v."tenantId" = "Company"."getCurrentTenantId"() AND v."sourceDocType" = "pSourceDocType"
       AND v."sourceDocId" = "pSourceDocId" AND v.status = 'POSTED' AND v."reversalOfId" IS NULL
  LOOP
    PERFORM "Accounting"."voucherReverse"("vId", "pDate", "pReason");
    "vCount" := "vCount" + 1;
  END LOOP;
  RETURN "vCount";
END $$;

-- One stock movement (append-only ledger; the ledger trigger fills cost from the
-- moving average when "unitCost" is omitted, updates balances and blocks negative stock).
--   pMove: {"itemId", "warehouseId", "binId"?, "batchId"?, "qtyIn" | "qtyOut", "unitCost"?, "movementType",
--           "movementDate"?, "sourceDocType", "sourceDocId", "sourceDocNo"?, "sourceLineId"?, "partyLabel"?,
--           "counterWarehouseId"?, "remarks"?}
CREATE OR REPLACE FUNCTION "Inventory"."stockMove"("pMove" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vId" uuid;
BEGIN
  INSERT INTO "Inventory"."StockMovements"
         ("tenantId", "movementDate", "itemId", "warehouseId", "binId", "batchId", "qtyIn", "qtyOut", "unitCost",
          "movementType", "sourceDocType", "sourceDocId", "sourceDocNo", "sourceLineId", "partyLabel",
          "counterWarehouseId", "userId", remarks)
  VALUES ("Company"."getCurrentTenantId"(), COALESCE(("pMove" ->> 'movementDate')::date, current_date),
          ("pMove" ->> 'itemId')::uuid, ("pMove" ->> 'warehouseId')::uuid, ("pMove" ->> 'binId')::uuid,
          ("pMove" ->> 'batchId')::uuid, COALESCE(("pMove" ->> 'qtyIn')::numeric, 0),
          COALESCE(("pMove" ->> 'qtyOut')::numeric, 0), ("pMove" ->> 'unitCost')::numeric,
          "pMove" ->> 'movementType', "pMove" ->> 'sourceDocType', ("pMove" ->> 'sourceDocId')::uuid,
          "pMove" ->> 'sourceDocNo', ("pMove" ->> 'sourceLineId')::uuid, "pMove" ->> 'partyLabel',
          ("pMove" ->> 'counterWarehouseId')::uuid, "Company"."getCurrentUserId"(), "pMove" ->> 'remarks')
  RETURNING id INTO "vId";
  RETURN "vId";
END $$;
COMMENT ON FUNCTION "Inventory"."stockMove"(jsonb) IS
  'Writes one stock ledger row for a source document line (the only way posting hooks move stock).';
