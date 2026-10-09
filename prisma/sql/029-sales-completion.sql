-- Phase 24 — Sales completion: numbering (SR, CN, RCPT, POS, ZR, RP), credit-note and customer-receipt posting,
-- customer cheques through Cheques in hand (cleared in the cheque register; a bounce marks the receipt BOUNCED and
-- re-opens its invoices), allocation limits, return qty ≤ invoiced qty, POS shift close (cash over / short),
-- one open shift per counter / cashier, missing audit triggers, error codes. Idempotent.
SELECT set_config('app.actorLabel', '029-sales-completion.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Numbering: RP (recurring profile) document type; series for every company and every new one
-- ---------------------------------------------------------------------------
INSERT INTO "Company"."DocumentTypes" (code, name, module, "tableName", "defaultPrefix", "defaultPattern", "defaultPadding", "defaultResetPolicy", "isPostingDoc", "sortOrder")
VALUES ('RP', 'Recurring invoice profile', 'sales', '"Sales"."RecurringInvoices"', 'RP', '{PREFIX}-{SEQ4}', 4, 'NEVER', false, 412)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION "Sales"."seedSalesCompletionDefaultsFor"("pTenant" uuid)
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
   WHERE d.code IN ('SR', 'CN', 'RCPT', 'POS', 'ZR', 'RP')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "Sales"."triggerTenantSalesCompletionDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Sales"."seedSalesCompletionDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsSalesCompletionDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsSalesCompletionDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerTenantSalesCompletionDefaults"();

SELECT set_config('app.actorLabel', 'seedSalesCompletionDefaultsFor', false);
SELECT "Sales"."seedSalesCompletionDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '029-sales-completion.sql', false);

-- ---------------------------------------------------------------------------
-- 2. Sales returns: returned qty (all posted returns of an invoice line) ≤ the invoiced qty
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."triggerSalesReturnQtyCheck"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  "vBad" record;
BEGIN
  SELECT p.name, il."baseQty" AS invoiced,
         (SELECT COALESCE(sum(x."baseQty"), 0) FROM "Sales"."SalesReturnLines" x
            JOIN "Sales"."SalesReturns" r ON r."tenantId" = x."tenantId" AND r.id = x."salesReturnId"
           WHERE x."tenantId" = NEW."tenantId" AND x."invoiceLineId" = il.id AND (r.status = 'POSTED' OR r.id = NEW.id)) AS returned
    INTO "vBad"
    FROM "Sales"."SalesReturnLines" l
    JOIN "Sales"."SalesInvoiceLines" il ON il."tenantId" = l."tenantId" AND il.id = l."invoiceLineId"
    JOIN "Inventory"."Products" p ON p."tenantId" = l."tenantId" AND p.id = l."itemId"
   WHERE l."tenantId" = NEW."tenantId" AND l."salesReturnId" = NEW.id
     AND il."baseQty" < (SELECT COALESCE(sum(x."baseQty"), 0) FROM "Sales"."SalesReturnLines" x
                           JOIN "Sales"."SalesReturns" r ON r."tenantId" = x."tenantId" AND r.id = x."salesReturnId"
                          WHERE x."tenantId" = NEW."tenantId" AND x."invoiceLineId" = il.id AND (r.status = 'POSTED' OR r.id = NEW.id))
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Return of % (% in all) is more than the % invoiced', "vBad".name, "vBad".returned, "vBad".invoiced
      USING ERRCODE = 'check_violation', HINT = 'RETURN_EXCEEDS_INVOICED';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "salesReturnQtyCheck" ON "Sales"."SalesReturns";
CREATE TRIGGER "salesReturnQtyCheck" BEFORE UPDATE OF status ON "Sales"."SalesReturns"
  FOR EACH ROW WHEN (NEW.status = 'POSTED' AND OLD.status IS DISTINCT FROM 'POSTED') EXECUTE FUNCTION "Sales"."triggerSalesReturnQtyCheck"();

-- ---------------------------------------------------------------------------
-- 3. Credit notes: posting (Dr sales returns / output tax, Cr receivable; restocked lines back in at cost) and the
--    status after posting: APPLIED when applied to its invoice, OPEN when kept as customer credit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."creditNotePostEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vCn"     "Sales"."CreditNotes";
  "vCust"   record;
  "vInv"    record;
  "vLine"   record;
  "vCount"  integer;
  "vValue"  numeric(18,2);
  "vTax"    numeric(18,2);
  "vUnit"   numeric(18,4);
  "vCost"   numeric(18,2) := 0;
  "vLines"  jsonb;
  "vJe"     uuid;
BEGIN
  SELECT * INTO "vCn" FROM "Sales"."CreditNotes" c WHERE c."tenantId" = "vTenant" AND c.id = "pId";
  SELECT count(*), COALESCE(sum(l."valueAmount"), 0), COALESCE(sum(l."taxAmount"), 0) INTO "vCount", "vValue", "vTax"
    FROM "Sales"."CreditNoteLines" l WHERE l."tenantId" = "vTenant" AND l."creditNoteId" = "pId";
  IF "vCount" = 0 THEN
    RAISE EXCEPTION 'Credit note %: add at least one line', "vCn"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  IF "vValue" <> "vCn"."valueAmount" OR "vTax" <> "vCn"."taxAmount" THEN
    RAISE EXCEPTION 'Credit note %: header totals do not match the lines; save it again', "vCn"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  IF "vCn".treatment = 'APPLY_TO_INVOICE' THEN
    SELECT i."docNo", i.status, i."balanceAmount" INTO "vInv"
      FROM "Sales"."SalesInvoices" i WHERE i."tenantId" = "vTenant" AND i.id = "vCn"."invoiceId";
    IF NOT FOUND OR "vInv".status NOT IN ('POSTED', 'PARTIALLY_PAID') THEN
      RAISE EXCEPTION 'Credit note %: choose an open posted invoice to apply it to', "vCn"."docNo"
        USING ERRCODE = 'check_violation', HINT = 'CREDIT_NOTE_EXCEEDS_BALANCE';
    END IF;
    IF "vCn"."totalAmount" > "vInv"."balanceAmount" THEN
      RAISE EXCEPTION 'Credit note % (%) is more than invoice % still owes (%)', "vCn"."docNo", "vCn"."totalAmount", "vInv"."docNo", "vInv"."balanceAmount"
        USING ERRCODE = 'check_violation', HINT = 'CREDIT_NOTE_EXCEEDS_BALANCE';
    END IF;
  END IF;
  SELECT c.name, COALESCE(c."receivableAccountId", "Company"."getAccountForRole"('AR_CONTROL')) AS ar INTO "vCust"
    FROM "Sales"."Customers" c WHERE c."tenantId" = "vTenant" AND c.id = "vCn"."customerId";

  -- restocked goods back in at the invoice line's cost (else average cost)
  FOR "vLine" IN
    SELECT l.id, l."itemId", l."batchId", l."baseQty", il."unitCost" AS "invCost", p."avgCost"
      FROM "Sales"."CreditNoteLines" l
      JOIN "Inventory"."Products" p ON p."tenantId" = l."tenantId" AND p.id = l."itemId"
      LEFT JOIN "Sales"."SalesInvoiceLines" il ON il."tenantId" = l."tenantId" AND il.id = l."invoiceLineId"
     WHERE l."tenantId" = "vTenant" AND l."creditNoteId" = "pId" AND l.restock AND l."baseQty" > 0
  LOOP
    IF "vCn"."returnWarehouseId" IS NULL THEN
      RAISE EXCEPTION 'Credit note %: choose the warehouse restocked goods return to', "vCn"."docNo" USING ERRCODE = 'check_violation';
    END IF;
    "vUnit" := COALESCE("vLine"."invCost", "vLine"."avgCost", 0);
    PERFORM "Inventory"."stockMove"(jsonb_build_object(
      'itemId', "vLine"."itemId", 'warehouseId', "vCn"."returnWarehouseId", 'batchId', "vLine"."batchId",
      'qtyIn', "vLine"."baseQty", 'unitCost', "vUnit", 'movementType', 'SALES_RETURN',
      'movementDate', "vCn"."docDate", 'sourceDocType', 'CN', 'sourceDocId', "pId", 'sourceDocNo', "vCn"."docNo",
      'sourceLineId', "vLine".id, 'partyLabel', "vCust".name));
    UPDATE "Sales"."CreditNoteLines" SET "unitCost" = "vUnit", "costAmount" = round("vLine"."baseQty" * "vUnit", 2)
     WHERE "tenantId" = "vTenant" AND id = "vLine".id;
    "vCost" := "vCost" + round("vLine"."baseQty" * "vUnit", 2);
  END LOOP;

  "vLines" := jsonb_build_array(
    jsonb_build_object('accountRole', 'SALES_RETURNS', 'debit', "vCn"."valueAmount", 'particulars', 'Credit note ' || "vCn"."docNo"),
    jsonb_build_object('accountRole', 'OUTPUT_GST', 'debit', "vCn"."taxAmount" + "vCn"."furtherTaxAmount", 'particulars', 'Output sales tax reversed ' || "vCn"."docNo"),
    jsonb_build_object('accountId', "vCust".ar, 'credit', "vCn"."totalAmount", 'customerId', "vCn"."customerId", 'particulars', "vCn"."docNo" || ' · ' || "vCust".name));
  IF "vCost" > 0 THEN
    "vLines" := "vLines" || jsonb_build_array(
      jsonb_build_object('accountRole', 'INVENTORY', 'debit', "vCost", 'particulars', 'Restocked ' || "vCn"."docNo"),
      jsonb_build_object('accountRole', 'COGS', 'credit', "vCost", 'particulars', 'Cost of sales reversed ' || "vCn"."docNo"));
  END IF;
  "vJe" := "Accounting"."journalCreate"(
    jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vCn"."docDate", 'postingDate', "vCn"."docDate", 'branchId', "vCn"."branchId",
                       'narration', 'Credit note ' || "vCn"."docNo" || ' · ' || "vCust".name || COALESCE(' · ' || "vCn".narration, ''),
                       'sourceDocType', 'CN', 'sourceDocId', "pId", 'sourceDocNo', "vCn"."docNo", 'partyName', "vCust".name),
    "vLines");
  UPDATE "Sales"."CreditNotes" c
     SET "journalEntryId" = "vJe", "costAmount" = "vCost", "postedAt" = now(), "approvedAt" = COALESCE(c."approvedAt", now()),
         "approvedByUserId" = COALESCE(c."approvedByUserId", "Company"."getCurrentUserId"())
   WHERE c."tenantId" = "vTenant" AND c.id = "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Sales"."creditNotePost"("pId" uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Sales"."CreditNotes";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."CreditNotes" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CreditNotes % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status IN ('OPEN', 'APPLIED') THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'CreditNotes %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'CREDIT_NOTE_NOT_EDITABLE';
  END IF;
  PERFORM "Sales"."creditNotePostEntries"("pId");
  UPDATE "Sales"."CreditNotes" t
     SET status = CASE WHEN t.treatment = 'APPLY_TO_INVOICE' THEN 'APPLIED' ELSE 'OPEN' END
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Customer receipts. Posting: Dr cash / bank (or Cheques in hand for a cheque; card / wallet clearing when no
--    bank is given), Dr WHT receivable, Dr bank charges; Cr the customer's receivable. A cheque receipt records the
--    cheque in the register (IN_HAND) with the receipt's journal; clearing it there moves it to the bank.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."customerReceiptPostEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "r"       "Sales"."CustomerReceipts";
  "vCust"   record;
  "vDr"     uuid;
  "vFx"     numeric;
  "vNarr"   text;
  "vJe"     uuid;
  "vCheque" uuid;
  "vBranch" uuid;
  "vNo"     text;
BEGIN
  SELECT * INTO "r" FROM "Sales"."CustomerReceipts" t WHERE t."tenantId" = "vTenant" AND t.id = "pId";
  IF "r"."journalEntryId" IS NOT NULL THEN
    RETURN;                                          -- posted once
  END IF;
  SELECT c.name, COALESCE(c."receivableAccountId", "Company"."getAccountForRole"('AR_CONTROL')) AS ar, c."branchId" INTO "vCust"
    FROM "Sales"."Customers" c WHERE c."tenantId" = "vTenant" AND c.id = "r"."customerId";
  "vDr" := CASE
             WHEN "r".method = 'CHEQUE' THEN "Company"."getAccountForRole"('CHEQUES_IN_HAND')
             WHEN "r".method = 'CASH' THEN "Purchases"."getPaymentSourceAccount"("r"."cashAccountId", NULL)
             WHEN "r"."bankAccountId" IS NOT NULL THEN "Purchases"."getPaymentSourceAccount"(NULL, "r"."bankAccountId")
             WHEN "r".method = 'CARD' THEN "Company"."getAccountForRole"('POS_CARD_CLEARING')
             WHEN "r".method IN ('JAZZCASH', 'EASYPAISA') THEN "Company"."getAccountForRole"('WALLET_CLEARING')
             ELSE "Purchases"."getPaymentSourceAccount"(NULL, NULL) END;
  "vFx"   := COALESCE(NULLIF("r"."fxRate", 0), 1);
  "vNarr" := 'Receipt ' || "r"."docNo" || ' — ' || "vCust".name || COALESCE(' · ' || "r".memo, '');
  "vJe" := "Accounting"."journalCreate"(
    jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "r"."docDate", 'postingDate', "r"."docDate", 'branchId', "r"."branchId",
                       'narration', "vNarr", 'sourceDocType', 'RCPT', 'sourceDocId', "pId", 'sourceDocNo', "r"."docNo", 'partyName', "vCust".name),
    jsonb_build_array(
      jsonb_build_object('accountId', "vDr", 'debit', round("r"."amountReceived" * "vFx", 2),
                         'particulars', 'Received from ' || "vCust".name || COALESCE(' · ' || "r".reference, '')),
      jsonb_build_object('accountRole', 'WHT_RECEIVABLE', 'debit', round("r"."whtAmount" * "vFx", 2),
                         'particulars', 'Tax withheld by the customer ' || COALESCE("r"."whtSection", '')),
      jsonb_build_object('accountRole', 'BANK_CHARGES', 'debit', round("r"."bankCharges" * "vFx", 2), 'particulars', 'Bank charges'),
      jsonb_build_object('accountId', "vCust".ar, 'credit', round(("r"."amountReceived" + "r"."whtAmount" + "r"."bankCharges") * "vFx", 2),
                         'customerId', "r"."customerId", 'particulars', "vNarr")));

  IF "r".method = 'CHEQUE' AND "r"."chequeId" IS NULL THEN
    "vNo" := regexp_replace(COALESCE("r".reference, ''), '[^0-9]', '', 'g');
    IF "vNo" !~ '^[0-9]{4,10}$' THEN
      RAISE EXCEPTION 'Enter the cheque number (4 to 10 digits) as the reference' USING ERRCODE = 'check_violation', HINT = 'RECEIPT_CHEQUE_REQUIRED';
    END IF;
    "vBranch" := COALESCE("r"."branchId", "vCust"."branchId",
                          (SELECT b.id FROM "Company"."Branches" b WHERE b."tenantId" = "vTenant" ORDER BY b."createdAt" LIMIT 1));
    INSERT INTO "BankCash"."Cheques"
           ("tenantId", "docNo", "docDate", "branchId", direction, "chequeNo", "customerId", "partyName", "bankAccountId",
            "chequeDate", "receivedOn", amount, "postingMode", status, "journalEntryId", remarks)
    VALUES ("vTenant", "Company"."getNextDocNo"('CHQ', "r"."docDate", "vBranch"), "r"."docDate", "vBranch", 'RECEIVED', "vNo",
            "r"."customerId", "vCust".name, "r"."bankAccountId", "r"."docDate", "r"."docDate", "r"."amountReceived", 'DEPOSIT', 'IN_HAND',
            "vJe", left('Receipt ' || "r"."docNo", 300))
    RETURNING id INTO "vCheque";
  END IF;
  UPDATE "Sales"."CustomerReceipts" t SET "journalEntryId" = "vJe", "chequeId" = COALESCE("vCheque", t."chequeId")
   WHERE t."tenantId" = "vTenant" AND t.id = "pId";
END $function$;

-- Void: the receipt's journal is reversed (a cheque receipt cancels its cheque, reversing any clearing too).
CREATE OR REPLACE FUNCTION "Sales"."customerReceiptVoidEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRc"     record;
  "vChq"    record;
BEGIN
  SELECT r.* INTO "vRc" FROM "Sales"."CustomerReceipts" r WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer receipt % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF EXISTS (SELECT 1 FROM "Tax"."WhtDeductions" w
              WHERE w."tenantId" = "vTenant" AND w."sourceDocType" = 'RCPT' AND w."sourceDocId" = "pId" AND w.status = 'CLAIMED') THEN
    RAISE EXCEPTION 'Receipt %: the WHT withheld by the customer is already claimed against a certificate', "vRc"."docNo"
      USING ERRCODE = 'check_violation';
  END IF;
  IF "vRc"."chequeId" IS NOT NULL THEN
    SELECT c.id, c.status INTO "vChq" FROM "BankCash"."Cheques" c WHERE c."tenantId" = "vTenant" AND c.id = "vRc"."chequeId";
    IF "vChq".status <> 'BOUNCED' THEN
      PERFORM "BankCash"."chequeReverseEntries"("vChq".id, current_date, 'Void of receipt ' || "vRc"."docNo");
      PERFORM set_config('app.receivablesVoid', 'on', true);
      UPDATE "BankCash"."Cheques" SET status = 'CANCELLED' WHERE "tenantId" = "vTenant" AND id = "vChq".id AND status NOT IN ('CANCELLED');
      PERFORM set_config('app.receivablesVoid', '', true);
    END IF;
  ELSIF "vRc".status <> 'BOUNCED' THEN
    PERFORM "Accounting"."journalReverseForSource"('RCPT', "pId", 'OTHER', current_date);
  END IF;
  UPDATE "Tax"."WhtDeductions" w SET status = 'CANCELLED'
   WHERE w."tenantId" = "vTenant" AND w."sourceDocType" = 'RCPT' AND w."sourceDocId" = "pId" AND w.status = 'UNPAID';
END $function$;

-- Allocation limits: a receipt allocates at most what it settled; an invoice takes at most what it still owes.
CREATE OR REPLACE FUNCTION "Sales"."triggerReceiptAllocationCheck"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  "vStatus"    text;
  "vTreatment" text;
  "vOld"       numeric := CASE WHEN TG_OP = 'UPDATE' THEN OLD."allocatedAmount" ELSE 0 END;
  "vRc"        record;
  "vBal"       numeric;
BEGIN
  SELECT r.status, r."settledAmount", r."allocatedAmount" INTO "vRc" FROM "Sales"."CustomerReceipts" r
   WHERE r."tenantId" = NEW."tenantId" AND r.id = NEW."receiptId";
  IF "vRc".status IN ('BOUNCED','VOID') THEN
    RAISE EXCEPTION 'Receipt is %: it cannot be allocated', "vRc".status USING ERRCODE = 'check_violation', HINT = 'RECEIPT_NOT_ALLOCATABLE';
  END IF;

  IF NEW."targetType" = 'INVOICE' THEN
    SELECT i.status, i."balanceAmount" INTO "vStatus", "vBal" FROM "Sales"."SalesInvoices" i
     WHERE i."tenantId" = NEW."tenantId" AND i.id = NEW."invoiceId" AND i."customerId" = NEW."customerId";
    IF "vStatus" IS NULL OR "vStatus" NOT IN ('POSTED','PARTIALLY_PAID','PAID') THEN
      RAISE EXCEPTION 'Only posted invoices of this customer can be allocated (invoice is %)', COALESCE("vStatus", 'not found')
        USING ERRCODE = 'check_violation', HINT = 'ALLOCATION_EXCEEDS_BALANCE';
    END IF;
    IF NEW."allocatedAmount" - "vOld" > "vBal" THEN
      RAISE EXCEPTION 'Allocation % is more than the invoice still owes (%)', NEW."allocatedAmount", "vBal" + "vOld"
        USING ERRCODE = 'check_violation', HINT = 'ALLOCATION_EXCEEDS_BALANCE';
    END IF;
    IF "vRc"."allocatedAmount" + NEW."allocatedAmount" - "vOld" > "vRc"."settledAmount" THEN
      RAISE EXCEPTION 'Allocations (%) are more than the receipt settles (%)', "vRc"."allocatedAmount" + NEW."allocatedAmount" - "vOld", "vRc"."settledAmount"
        USING ERRCODE = 'check_violation', HINT = 'ALLOCATION_EXCEEDS_RECEIPT';
    END IF;
  ELSIF NEW."targetType" = 'CREDIT_NOTE' THEN
    SELECT c.status, c.treatment INTO "vStatus", "vTreatment" FROM "Sales"."CreditNotes" c
     WHERE c."tenantId" = NEW."tenantId" AND c.id = NEW."creditNoteId";
    IF "vTreatment" <> 'KEEP_AS_CREDIT' OR "vStatus" NOT IN ('OPEN','APPLIED') THEN
      RAISE EXCEPTION 'Only open customer-credit notes can be used in a receipt' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- Cheque register ↔ receipt: a bounce marks the receipt BOUNCED (its invoices re-open); cancelling, stopping or
-- replacing a live receipt's cheque is blocked (void the receipt instead), and a bounced receipt cheque is not re-presented.
CREATE OR REPLACE FUNCTION "Sales"."triggerChequeReceiptGuard"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  "vDoc" text;
BEGIN
  IF NEW.direction <> 'RECEIVED' OR COALESCE(current_setting('app.receivablesVoid', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  SELECT r."docNo" INTO "vDoc" FROM "Sales"."CustomerReceipts" r
   WHERE r."tenantId" = NEW."tenantId" AND r."chequeId" = NEW.id AND r.status <> 'VOID' LIMIT 1;
  IF "vDoc" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('CANCELLED', 'STOPPED', 'REPLACED') OR (OLD.status = 'BOUNCED' AND NEW.status <> 'BOUNCED') THEN
    RAISE EXCEPTION 'Cheque % belongs to receipt %; void the receipt (or record a new one) instead', NEW."chequeNo", "vDoc"
      USING ERRCODE = 'check_violation', HINT = 'CHEQUE_LINKED_TO_RECEIPT';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "chequesReceiptGuard" ON "BankCash"."Cheques";
CREATE TRIGGER "chequesReceiptGuard" BEFORE UPDATE OF status ON "BankCash"."Cheques"
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION "Sales"."triggerChequeReceiptGuard"();

CREATE OR REPLACE FUNCTION "Sales"."triggerChequeReceiptStatus"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.direction = 'RECEIVED' AND NEW.status = 'BOUNCED' THEN
    UPDATE "Sales"."CustomerReceipts" r
       SET status = 'BOUNCED', "bouncedAt" = now(), "bounceReason" = COALESCE(r."bounceReason", 'Cheque ' || NEW."chequeNo" || ' bounced')
     WHERE r."tenantId" = NEW."tenantId" AND r."chequeId" = NEW.id AND r.status NOT IN ('VOID', 'BOUNCED');
  END IF;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "chequesReceiptStatus" ON "BankCash"."Cheques";
CREATE TRIGGER "chequesReceiptStatus" AFTER UPDATE OF status ON "BankCash"."Cheques"
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION "Sales"."triggerChequeReceiptStatus"();

-- ---------------------------------------------------------------------------
-- 5. POS: one open shift per counter and per cashier; closing posts the cash over / short against the shift's cash account
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "posShiftsOneOpenPerCounter" ON "Sales"."PosShifts" ("tenantId", "branchId", lower("counterName")) WHERE status = 'OPEN';
CREATE UNIQUE INDEX IF NOT EXISTS "posShiftsOneOpenPerCashier" ON "Sales"."PosShifts" ("tenantId", "cashierUserId") WHERE status = 'OPEN';

CREATE OR REPLACE FUNCTION "Sales"."posShiftCloseEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "s"       "Sales"."PosShifts";
  "vCash"   uuid;
  "vJe"     uuid;
BEGIN
  SELECT * INTO "s" FROM "Sales"."PosShifts" t WHERE t."tenantId" = "vTenant" AND t.id = "pId";
  IF "s"."countedCash" IS NULL THEN
    RAISE EXCEPTION 'Count the cash in the drawer before closing the shift' USING ERRCODE = 'check_violation', HINT = 'POS_SHIFT_COUNT_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM "Sales"."SalesInvoices" i WHERE i."tenantId" = "vTenant" AND i."posShiftId" = "pId" AND i.status = 'DRAFT') THEN
    RAISE EXCEPTION 'Complete or discard the held sales before closing the shift' USING ERRCODE = 'check_violation', HINT = 'POS_HELD_SALES';
  END IF;
  IF COALESCE("s"."overShort", 0) <> 0 THEN
    "vCash" := "Purchases"."getPaymentSourceAccount"("s"."cashAccountId", NULL);
    "vJe" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'SYSTEM', 'docDate', ("s"."openedAt" AT TIME ZONE 'Asia/Karachi')::date, 'branchId', "s"."branchId",
                         'narration', 'POS shift ' || COALESCE("s"."zReportNo", '') || ' · ' || "s"."counterName" || ' cash ' || CASE WHEN "s"."overShort" > 0 THEN 'over' ELSE 'short' END,
                         'sourceDocType', 'ZR', 'sourceDocId', "pId", 'sourceDocNo', COALESCE("s"."zReportNo", "s"."counterName")),
      jsonb_build_array(
        jsonb_build_object('accountId', "vCash", 'debit', GREATEST("s"."overShort", 0), 'credit', GREATEST(-"s"."overShort", 0), 'particulars', 'Drawer count'),
        jsonb_build_object('accountRole', 'CASH_OVER_SHORT', 'debit', GREATEST(-"s"."overShort", 0), 'credit', GREATEST("s"."overShort", 0), 'particulars', 'Cash over / short')));
    UPDATE "Sales"."PosShifts" SET "journalEntryId" = "vJe" WHERE "tenantId" = "vTenant" AND id = "pId";
  END IF;
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Row history on the line / count tables that had none
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "posShiftDenominationsAudit" ON "Sales"."PosShiftDenominations";
CREATE TRIGGER "posShiftDenominationsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Sales"."PosShiftDenominations" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "recurringInvoiceLinesAudit" ON "Sales"."RecurringInvoiceLines";
CREATE TRIGGER "recurringInvoiceLinesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Sales"."RecurringInvoiceLines" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 7. Error codes
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('RETURN_EXCEEDS_INVOICED', 409, 'BUSINESS_RULE', 'SALES', 'You can’t return more than was invoiced.', 'Returned qty over the invoiced qty of a line', true, NULL),
  ('SALES_RETURN_NOT_EDITABLE', 409, 'BUSINESS_RULE', 'SALES', 'Only a draft return can be changed or posted. Cancel a posted return instead.', 'Edit / post of a posted return', true, NULL),
  ('CREDIT_NOTE_NOT_EDITABLE', 409, 'BUSINESS_RULE', 'SALES', 'Only a draft credit note can be changed or posted.', 'Edit / post of a posted credit note', true, NULL),
  ('CREDIT_NOTE_EXCEEDS_BALANCE', 409, 'BUSINESS_RULE', 'SALES', 'A credit note applied to an invoice can’t be more than the invoice still owes.', 'Credit note over the invoice balance', true, NULL),
  ('ALLOCATION_EXCEEDS_BALANCE', 409, 'BUSINESS_RULE', 'SALES', 'An allocation can’t be more than the invoice still owes.', 'Receipt allocation over the invoice balance', true, NULL),
  ('ALLOCATION_EXCEEDS_RECEIPT', 409, 'BUSINESS_RULE', 'SALES', 'Allocations can’t be more than the receipt settles.', 'Receipt over-allocated', true, NULL),
  ('RECEIPT_NOT_ALLOCATABLE', 409, 'BUSINESS_RULE', 'SALES', 'A void or bounced receipt can’t be allocated.', 'Allocation on a void / bounced receipt', true, NULL),
  ('RECEIPT_CHEQUE_REQUIRED', 400, 'VALIDATION', 'SALES', 'Enter the cheque number (4 to 10 digits).', 'Cheque receipt without a valid cheque number', true, NULL),
  ('CHEQUE_LINKED_TO_RECEIPT', 409, 'BUSINESS_RULE', 'SALES', 'This cheque belongs to a customer receipt. Void the receipt instead.', 'Register cancel / stop / re-present of a receipt cheque', true, NULL),
  ('POS_SHIFT_ALREADY_OPEN', 409, 'BUSINESS_RULE', 'SALES', 'A shift is already open for this counter or cashier.', 'Second open shift', true, NULL),
  ('POS_SHIFT_NOT_OPEN', 409, 'BUSINESS_RULE', 'SALES', 'Open a shift before selling.', 'POS sale without an open shift', true, NULL),
  ('POS_SHIFT_COUNT_REQUIRED', 400, 'VALIDATION', 'SALES', 'Count the cash in the drawer before closing the shift.', 'Shift close without a cash count', true, NULL),
  ('POS_HELD_SALES', 409, 'BUSINESS_RULE', 'SALES', 'Complete or discard the held sales before closing the shift.', 'Shift close with held sales', true, NULL),
  ('POS_PAYMENT_MISMATCH', 400, 'VALIDATION', 'SALES', 'The payments must add up to the bill total.', 'POS tenders do not cover the bill', true, NULL),
  ('RECURRING_NOT_ACTIVE', 409, 'BUSINESS_RULE', 'SALES', 'This recurring invoice is not active.', 'Run / pause of a paused or ended profile', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
