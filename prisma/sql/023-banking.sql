-- Phase 17 — Banking: bank transactions generated from posted vouchers, statement-import layout, cheque postings
-- (clearing accounts), numbering series, error codes. Idempotent: safe to run again.
SELECT set_config('app.actorLabel', '023-banking.sql', false);

-- ---------------------------------------------------------------------------
-- 1. The saved CSV column mapping of a bank account's statement files.
-- ---------------------------------------------------------------------------
ALTER TABLE "BankCash"."BankAccounts" ADD COLUMN IF NOT EXISTS "statementLayout" jsonb;
COMMENT ON COLUMN "BankCash"."BankAccounts"."statementLayout" IS 'CSV import mapping: {delimiter, header, dateFormat, columns:{date, description, reference, amount | debit+credit, balance}}';

-- ---------------------------------------------------------------------------
-- 2. Every posted voucher line on a bank account's GL account is a bank transaction.
--    A voucher created from an imported statement line (source BK = that bank transaction) completes it instead.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "BankCash"."triggerVoucherBankTransactions"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  "r"    record;
  "vTxn" uuid;
BEGIN
  FOR "r" IN
    SELECT l.debit, l.credit, l.particulars, ba.id AS "bankAccountId"
      FROM "Accounting"."VoucherLines" l
      JOIN "BankCash"."BankAccounts" ba ON ba."tenantId" = l."tenantId" AND ba."accountId" = l."accountId"
     WHERE l."tenantId" = NEW."tenantId" AND l."journalEntryId" = NEW.id AND (l.debit <> 0 OR l.credit <> 0)
     ORDER BY l."lineNo"
  LOOP
    "vTxn" := NULL;
    IF NEW."sourceDocType" = 'BK' THEN
      UPDATE "BankCash"."BankTransactions" t
         SET "journalEntryId" = NEW.id, status = 'CLEARED', "clearedOn" = t."txnDate"
       WHERE t."tenantId" = NEW."tenantId" AND t.id = NEW."sourceDocId" AND t."bankAccountId" = "r"."bankAccountId"
         AND t."journalEntryId" IS NULL
      RETURNING t.id INTO "vTxn";
      IF "vTxn" IS NOT NULL THEN
        UPDATE "BankCash"."BankStatementLines" s SET "journalEntryId" = NEW.id
         WHERE s."tenantId" = NEW."tenantId" AND s."bankTransactionId" = "vTxn";
        CONTINUE;
      END IF;
    END IF;
    INSERT INTO "BankCash"."BankTransactions"
           ("tenantId", "bankAccountId", "txnDate", "valueDate", description, detail, reference, "paymentMode", category,
            "depositAmount", "withdrawalAmount", "chequeId", "journalEntryId", source, status)
    VALUES (NEW."tenantId", "r"."bankAccountId", NEW."postingDate", NEW."instrumentDate", left(NEW.narration, 300), "r".particulars,
            COALESCE(NEW."instrumentNo", NEW."referenceNo"),
            CASE NEW."instrumentType"
              WHEN 'CHEQUE' THEN 'CHEQUE' WHEN 'CHEQUE_DEPOSIT' THEN 'CHEQUE' WHEN 'IBFT' THEN 'IBFT'
              WHEN 'RTGS' THEN 'BANK_TRANSFER' WHEN 'PAY_ORDER' THEN 'BANK_TRANSFER' WHEN 'CASH_DEPOSIT' THEN 'CASH'
              ELSE CASE WHEN NEW."sourceDocType" = 'CHQ' THEN 'CHEQUE' END END,
            CASE WHEN NEW."voucherType" = 'CON' THEN 'TRANSFER' END,
            "r".debit, "r".credit,
            CASE WHEN NEW."sourceDocType" = 'CHQ' THEN NEW."sourceDocId" END,
            NEW.id, 'VOUCHER',
            CASE WHEN "r".credit > 0 THEN 'UNPRESENTED' ELSE 'UNCLEARED' END);
  END LOOP;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "vouchersBankTransactions" ON "Accounting"."Vouchers";
CREATE TRIGGER "vouchersBankTransactions" AFTER UPDATE OF status ON "Accounting"."Vouchers"
  FOR EACH ROW WHEN (NEW.status = 'POSTED' AND OLD.status IS DISTINCT FROM 'POSTED')
  EXECUTE FUNCTION "BankCash"."triggerVoucherBankTransactions"();

-- Backfill: vouchers posted before this trigger existed (each voucher line on a bank GL account once).
INSERT INTO "BankCash"."BankTransactions"
       ("tenantId", "bankAccountId", "txnDate", "valueDate", description, detail, reference, "paymentMode", category,
        "depositAmount", "withdrawalAmount", "journalEntryId", source, status)
SELECT v."tenantId", ba.id, v."postingDate", v."instrumentDate", left(v.narration, 300), l.particulars, COALESCE(v."instrumentNo", v."referenceNo"),
       CASE v."instrumentType" WHEN 'CHEQUE' THEN 'CHEQUE' WHEN 'CHEQUE_DEPOSIT' THEN 'CHEQUE' WHEN 'IBFT' THEN 'IBFT'
         WHEN 'RTGS' THEN 'BANK_TRANSFER' WHEN 'PAY_ORDER' THEN 'BANK_TRANSFER' WHEN 'CASH_DEPOSIT' THEN 'CASH' END,
       CASE WHEN v."voucherType" = 'CON' THEN 'TRANSFER' END,
       l.debit, l.credit, v.id, 'VOUCHER', CASE WHEN l.credit > 0 THEN 'UNPRESENTED' ELSE 'UNCLEARED' END
  FROM "Accounting"."Vouchers" v
  JOIN "Accounting"."VoucherLines" l ON l."tenantId" = v."tenantId" AND l."journalEntryId" = v.id AND (l.debit <> 0 OR l.credit <> 0)
  JOIN "BankCash"."BankAccounts" ba ON ba."tenantId" = l."tenantId" AND ba."accountId" = l."accountId"
 WHERE v.status IN ('POSTED', 'REVERSED')
   AND NOT EXISTS (SELECT 1 FROM "BankCash"."BankTransactions" t WHERE t."tenantId" = v."tenantId" AND t."journalEntryId" = v.id AND t."bankAccountId" = ba.id);

-- A new cheque starts in hand (received) or issued; the lifecycle functions move it on.
CREATE OR REPLACE FUNCTION "BankCash"."triggerChequeInitialStatus"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.status := COALESCE(NEW.status, CASE WHEN NEW.direction = 'ISSUED' THEN 'ISSUED' ELSE 'IN_HAND' END);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "chequesInitialStatus" ON "BankCash"."Cheques";
CREATE TRIGGER "chequesInitialStatus" BEFORE INSERT ON "BankCash"."Cheques"
  FOR EACH ROW EXECUTE FUNCTION "BankCash"."triggerChequeInitialStatus"();

-- ---------------------------------------------------------------------------
-- 3. A posted system voucher for banking events (cheques). Lines: [{accountId, debit, credit, particulars,
--    customerId?, vendorId?, isAutoContra?}]. The voucher guard checks balance, accounts and the open period.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "BankCash"."postBankingVoucher"(
  "pType" text, "pDate" date, "pBranchId" uuid, "pNarration" text, "pCashBankAccountId" uuid, "pPartyName" text,
  "pInstrumentNo" text, "pInstrumentDate" date, "pSourceType" text, "pSourceId" uuid, "pSourceNo" text, "pLines" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vId"     uuid;
BEGIN
  INSERT INTO "Accounting"."Vouchers"
         ("tenantId", "voucherType", "docNo", "docDate", "postingDate", "referenceNo", "branchId", narration, "cashBankAccountId", "partyName",
          "instrumentType", "instrumentNo", "instrumentDate", status, "preparedByUserId", "sourceDocType", "sourceDocId", "sourceDocNo")
  VALUES ("vTenant", "pType", "Company"."getNextDocNo"("pType", "pDate", "pBranchId"), "pDate", "pDate",
          CASE WHEN "pInstrumentNo" IS NOT NULL THEN left('Chq ' || "pInstrumentNo", 60) END, "pBranchId",
          left("pNarration", 300), "pCashBankAccountId", "pPartyName",
          -- instrument types depend on the voucher type: a cheque on a BPV, a cheque deposit on a BRV, none on a JV
          CASE WHEN "pInstrumentNo" IS NULL THEN NULL WHEN "pType" = 'BPV' THEN 'CHEQUE' WHEN "pType" = 'BRV' THEN 'CHEQUE_DEPOSIT' END,
          CASE WHEN "pType" IN ('BPV', 'BRV') THEN "pInstrumentNo" END,
          CASE WHEN "pType" IN ('BPV', 'BRV') AND "pInstrumentNo" IS NOT NULL THEN "pInstrumentDate" END,
          'DRAFT', "Company"."getCurrentUserId"(), "pSourceType", "pSourceId", "pSourceNo")
  RETURNING id INTO "vId";
  INSERT INTO "Accounting"."VoucherLines" ("tenantId", "journalEntryId", "lineNo", "accountId", particulars, debit, credit,
                                          "branchId", "customerId", "vendorId", "isAutoContra")
  SELECT "vTenant", "vId", x.n::smallint, (x.e ->> 'accountId')::uuid, x.e ->> 'particulars',
         COALESCE((x.e ->> 'debit')::numeric, 0), COALESCE((x.e ->> 'credit')::numeric, 0), "pBranchId",
         NULLIF(x.e ->> 'customerId', '')::uuid, NULLIF(x.e ->> 'vendorId', '')::uuid, COALESCE((x.e ->> 'isAutoContra')::boolean, false)
    FROM jsonb_array_elements("pLines") WITH ORDINALITY x(e, n);
  PERFORM "Accounting"."voucherPost"("vId");
  RETURN "vId";
END $function$;

-- The GL account a cheque's party side posts to: the customer's / vendor's own account, else AR / AP control,
-- or the cheque's chosen account.
CREATE OR REPLACE FUNCTION "BankCash"."getChequePartyAccount"("pCheque" "BankCash"."Cheques")
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
AS $function$
DECLARE
  "vAcc" uuid;
BEGIN
  IF "pCheque"."accountId" IS NOT NULL THEN
    RETURN "pCheque"."accountId";
  ELSIF "pCheque"."customerId" IS NOT NULL THEN
    SELECT c."receivableAccountId" INTO "vAcc" FROM "Sales"."Customers" c WHERE c."tenantId" = "pCheque"."tenantId" AND c.id = "pCheque"."customerId";
    RETURN COALESCE("vAcc", "Company"."getAccountForRole"('AR_CONTROL'));
  ELSIF "pCheque"."vendorId" IS NOT NULL THEN
    SELECT v."payableAccountId" INTO "vAcc" FROM "Purchases"."Vendors" v WHERE v."tenantId" = "pCheque"."tenantId" AND v.id = "pCheque"."vendorId";
    RETURN COALESCE("vAcc", "Company"."getAccountForRole"('AP_CONTROL'));
  END IF;
  RETURN CASE WHEN "pCheque".direction = 'RECEIVED' THEN "Company"."getAccountForRole"('AR_CONTROL') ELSE "Company"."getAccountForRole"('AP_CONTROL') END;
END $function$;

CREATE OR REPLACE FUNCTION "BankCash"."getBankGlAccount"("pBankAccountId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
AS $function$
DECLARE
  "vAcc" uuid;
BEGIN
  SELECT ba."accountId" INTO "vAcc" FROM "BankCash"."BankAccounts" ba
   WHERE ba."tenantId" = "Company"."getCurrentTenantId"() AND ba.id = "pBankAccountId";
  IF "vAcc" IS NULL THEN
    RAISE EXCEPTION 'The bank account has no GL account' USING ERRCODE = 'check_violation', HINT = 'POSTING_ROLE_UNMAPPED';
  END IF;
  RETURN "vAcc";
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Cheque postings (clearing accounts). The lifecycle functions (chequeClear / chequeBounce / chequeCancel /
--    chequeBatchGenerate) call the …Entries functions; chequeRecordEntries is called when a cheque is recorded.
-- ---------------------------------------------------------------------------
-- Received: Dr Cheques in hand / Cr customer.  Issued: Dr vendor / Cr PDC payable.  Idempotent while the voucher is posted;
-- after a reversal (bounce) it posts again, dated pDate (re-presentation).
DROP FUNCTION IF EXISTS "BankCash"."chequeRecordEntries"(uuid);
CREATE OR REPLACE FUNCTION "BankCash"."chequeRecordEntries"("pId" uuid, "pDate" date DEFAULT NULL)
  RETURNS uuid
  LANGUAGE plpgsql
AS $function$
DECLARE
  "c"      "BankCash"."Cheques";
  "vParty" uuid;
  "vHold"  uuid;
  "vJe"    uuid;
  "vSt"    text;
BEGIN
  SELECT * INTO "c" FROM "BankCash"."Cheques" t WHERE t."tenantId" = "Company"."getCurrentTenantId"() AND t.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cheque % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "c"."journalEntryId" IS NOT NULL THEN
    SELECT status INTO "vSt" FROM "Accounting"."Vouchers" WHERE "tenantId" = "c"."tenantId" AND id = "c"."journalEntryId";
    IF "vSt" = 'POSTED' THEN
      RETURN "c"."journalEntryId";
    END IF;
  END IF;
  "vParty" := "BankCash"."getChequePartyAccount"("c");
  IF "c".direction = 'RECEIVED' THEN
    "vHold" := "Company"."getAccountForRole"('CHEQUES_IN_HAND');
    "vJe" := "BankCash"."postBankingVoucher"('JV', COALESCE("pDate", "c"."receivedOn", "c"."docDate"), "c"."branchId",
               'Cheque ' || "c"."chequeNo" || ' received from ' || "c"."partyName", NULL, "c"."partyName",
               "c"."chequeNo", "c"."chequeDate", 'CHQ', "c".id, "c"."docNo",
               jsonb_build_array(
                 jsonb_build_object('accountId', "vHold", 'debit', "c".amount, 'particulars', 'Cheque ' || "c"."chequeNo" || ' in hand'),
                 jsonb_build_object('accountId', "vParty", 'credit', "c".amount, 'particulars', "c"."partyName", 'customerId', "c"."customerId")));
  ELSE
    "vHold" := "Company"."getAccountForRole"('PDC_PAYABLE');
    "vJe" := "BankCash"."postBankingVoucher"('JV', COALESCE("pDate", "c"."docDate"), "c"."branchId",
               'Cheque ' || "c"."chequeNo" || ' issued to ' || "c"."partyName", NULL, "c"."partyName",
               "c"."chequeNo", "c"."chequeDate", 'CHQ', "c".id, "c"."docNo",
               jsonb_build_array(
                 jsonb_build_object('accountId', "vParty", 'debit', "c".amount, 'particulars', "c"."partyName", 'vendorId', "c"."vendorId"),
                 jsonb_build_object('accountId', "vHold", 'credit', "c".amount, 'particulars', 'Cheque ' || "c"."chequeNo" || ' issued')));
  END IF;
  UPDATE "BankCash"."Cheques" SET "journalEntryId" = "vJe" WHERE "tenantId" = "c"."tenantId" AND id = "c".id;
  RETURN "vJe";
END $function$;

-- Cleared. Received: BRV Dr bank / Cr Cheques in hand.  Issued: BPV Dr PDC payable / Cr bank.
CREATE OR REPLACE FUNCTION "BankCash"."chequeClearEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
AS $function$
DECLARE
  "c"     "BankCash"."Cheques";
  "vBank" uuid;
  "vJe"   uuid;
BEGIN
  SELECT * INTO "c" FROM "BankCash"."Cheques" t WHERE t."tenantId" = "Company"."getCurrentTenantId"() AND t.id = "pId";
  "vBank" := "BankCash"."getBankGlAccount"("c"."bankAccountId");
  IF "c".direction = 'RECEIVED' THEN
    "vJe" := "BankCash"."postBankingVoucher"('BRV', COALESCE("c"."clearedOn", CURRENT_DATE), "c"."branchId",
               'Cheque ' || "c"."chequeNo" || ' cleared — ' || "c"."partyName", "vBank", "c"."partyName",
               "c"."chequeNo", "c"."chequeDate", 'CHQ', "c".id, "c"."docNo",
               jsonb_build_array(
                 jsonb_build_object('accountId', "Company"."getAccountForRole"('CHEQUES_IN_HAND'), 'credit', "c".amount, 'particulars', 'Cheque ' || "c"."chequeNo"),
                 jsonb_build_object('accountId', "vBank", 'debit', "c".amount, 'particulars', "c"."partyName", 'isAutoContra', true)));
  ELSE
    "vJe" := "BankCash"."postBankingVoucher"('BPV', COALESCE("c"."clearedOn", CURRENT_DATE), "c"."branchId",
               'Cheque ' || "c"."chequeNo" || ' cleared — ' || "c"."partyName", "vBank", "c"."partyName",
               "c"."chequeNo", "c"."chequeDate", 'CHQ', "c".id, "c"."docNo",
               jsonb_build_array(
                 jsonb_build_object('accountId', "Company"."getAccountForRole"('PDC_PAYABLE'), 'debit', "c".amount, 'particulars', 'Cheque ' || "c"."chequeNo"),
                 jsonb_build_object('accountId', "vBank", 'credit', "c".amount, 'particulars', "c"."partyName", 'isAutoContra', true)));
  END IF;
  UPDATE "BankCash"."Cheques" SET "clearingJournalEntryId" = "vJe" WHERE "tenantId" = "c"."tenantId" AND id = "c".id;
END $function$;

-- Bounced (before clearing): the receipt / issue voucher is reversed. The open ChequeBounces row adds bank charges
-- (JV Dr bank charges / Cr bank), their recovery from the customer (Dr customer / Cr bank charges) and a credit hold.
CREATE OR REPLACE FUNCTION "BankCash"."chequeBounceEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
AS $function$
DECLARE
  "c"      "BankCash"."Cheques";
  "b"      "BankCash"."ChequeBounces";
  "vRev"   uuid;
  "vChg"   uuid;
  "vHold"  uuid;
  "vLines" jsonb;
  "vSt"    text;
BEGIN
  SELECT * INTO "c" FROM "BankCash"."Cheques" t WHERE t."tenantId" = "Company"."getCurrentTenantId"() AND t.id = "pId";
  SELECT * INTO "b" FROM "BankCash"."ChequeBounces" x
   WHERE x."tenantId" = "c"."tenantId" AND x."chequeId" = "c".id AND x."reversalJournalEntryId" IS NULL
   ORDER BY x."createdAt" DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record the bounce details first' USING ERRCODE = 'check_violation', HINT = 'CHEQUE_STATE';
  END IF;
  SELECT status INTO "vSt" FROM "Accounting"."Vouchers" WHERE "tenantId" = "c"."tenantId" AND id = "c"."journalEntryId";
  IF "vSt" = 'POSTED' THEN
    "vRev" := "Accounting"."voucherReverse"("c"."journalEntryId", "b"."bounceDate", 'OTHER', 'Cheque ' || "c"."chequeNo" || ' bounced');
  END IF;
  IF "b"."bankCharges" > 0 THEN
    "vLines" := jsonb_build_array(
      jsonb_build_object('accountId', "Company"."getAccountForRole"('BANK_CHARGES'), 'debit', "b"."bankCharges", 'particulars', 'Bounce charges · cheque ' || "c"."chequeNo"),
      jsonb_build_object('accountId', "BankCash"."getBankGlAccount"("c"."bankAccountId"), 'credit', "b"."bankCharges", 'particulars', 'Bounce charges'));
    IF "b"."recoverCharges" AND "c".direction = 'RECEIVED' THEN
      "vLines" := "vLines" || jsonb_build_array(
        jsonb_build_object('accountId', "BankCash"."getChequePartyAccount"("c"), 'debit', "b"."bankCharges", 'particulars', 'Bounce charges recoverable', 'customerId', "c"."customerId"),
        jsonb_build_object('accountId', "Company"."getAccountForRole"('BANK_CHARGES'), 'credit', "b"."bankCharges", 'particulars', 'Recovered from ' || "c"."partyName"));
    END IF;
    "vChg" := "BankCash"."postBankingVoucher"('JV', "b"."bounceDate", "c"."branchId",
                'Bank charges on bounced cheque ' || "c"."chequeNo", NULL, "c"."partyName", NULL, NULL, 'CHQ', "c".id, "c"."docNo", "vLines");
  END IF;
  IF "b"."creditHold" AND "c"."customerId" IS NOT NULL THEN
    INSERT INTO "Sales"."CreditHoldEvents" ("tenantId", "customerId", "eventType", reason, source, "occurredAt", "userId", "chequeId", "exposureAmount", notes)
    VALUES ("c"."tenantId", "c"."customerId", 'HOLD', 'BOUNCED_CHEQUE', 'CHEQUE_BOUNCE', now(), "Company"."getCurrentUserId"(), "c".id, "c".amount,
            'Cheque ' || "c"."chequeNo" || ' bounced')
    RETURNING id INTO "vHold";
    -- the same hold the customer screen sets: ON_HOLD with a reason; an existing hold keeps its reason and date
    UPDATE "Sales"."Customers" SET status = 'ON_HOLD', "holdReason" = 'BOUNCED_CHEQUE', "onHoldSince" = now()
     WHERE "tenantId" = "c"."tenantId" AND id = "c"."customerId" AND status = 'ACTIVE';
  END IF;
  UPDATE "BankCash"."ChequeBounces"
     SET "reversalJournalEntryId" = "vRev", "chargesJournalEntryId" = "vChg", "creditHoldEventId" = "vHold"
   WHERE "tenantId" = "b"."tenantId" AND id = "b".id;
END $function$;

-- Cancelled / stopped / replaced: every voucher of the cheque that is still posted is reversed (clearing first).
CREATE OR REPLACE FUNCTION "BankCash"."chequeReverseEntries"("pId" uuid, "pDate" date, "pRemarks" text)
  RETURNS void
  LANGUAGE plpgsql
AS $function$
DECLARE
  "c"  "BankCash"."Cheques";
  "vJ" uuid;
BEGIN
  SELECT * INTO "c" FROM "BankCash"."Cheques" t WHERE t."tenantId" = "Company"."getCurrentTenantId"() AND t.id = "pId";
  FOREACH "vJ" IN ARRAY ARRAY["c"."clearingJournalEntryId", "c"."journalEntryId"] LOOP
    IF "vJ" IS NOT NULL AND EXISTS (SELECT 1 FROM "Accounting"."Vouchers" WHERE "tenantId" = "c"."tenantId" AND id = "vJ" AND status = 'POSTED') THEN
      PERFORM "Accounting"."voucherReverse"("vJ", "pDate", 'OTHER', "pRemarks");
    END IF;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION "BankCash"."chequeCancelEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM "BankCash"."chequeReverseEntries"("pId", CURRENT_DATE, 'Cheque cancelled');
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Numbering series for cheques (CHQ), cheque batches (CHB) and reconciliations (REC), per company.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "BankCash"."seedBankingDefaultsFor"("pTenant" uuid)
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
   WHERE d.code IN ('CHQ', 'CHB', 'REC')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "BankCash"."triggerTenantBankingDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "BankCash"."seedBankingDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsBankingDefaults" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsBankingDefaults" AFTER INSERT ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "BankCash"."triggerTenantBankingDefaults"();

SELECT set_config('app.actorLabel', 'seedBankingDefaultsFor', false);
SELECT "BankCash"."seedBankingDefaultsFor"(t.id) FROM "Platform"."Tenants" t;

-- ---------------------------------------------------------------------------
-- 6. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('CHEQUE_STATE',          409, 'BUSINESS_RULE', 'FINANCE', 'This cheque can''t move to that status from where it is now.', 'Illegal cheque status change', true, NULL),
  ('CHEQUE_LEAF_USED',      409, 'BUSINESS_RULE', 'FINANCE', 'This cheque number is already used for this bank account.', 'Duplicate issued cheque leaf', true, NULL),
  ('CHEQUE_NOT_MATURE',     409, 'BUSINESS_RULE', 'FINANCE', 'A post-dated cheque can only be deposited on or after its cheque date.', 'Early deposit of a PDC', true, NULL),
  ('STATEMENT_EMPTY',       400, 'VALIDATION',    'FINANCE', 'The statement has no new lines to import.', 'Empty or fully duplicate statement', true, NULL),
  ('STATEMENT_LINE_LOCKED', 409, 'BUSINESS_RULE', 'FINANCE', 'This statement line is already categorised, matched or reconciled.', 'Change of a used statement line', true, NULL),
  ('RECON_OPEN_EXISTS',     409, 'BUSINESS_RULE', 'FINANCE', 'This bank account already has a reconciliation in progress.', 'Second open reconciliation', true, NULL),
  ('RECON_NOT_BALANCED',    409, 'BUSINESS_RULE', 'FINANCE', 'The reconciliation can only be finished when the difference is zero.', 'Close with a difference', true, NULL),
  ('RECON_CLOSED',          409, 'BUSINESS_RULE', 'FINANCE', 'This reconciliation is closed. Reopen it to make changes.', 'Change of a closed reconciliation', true, NULL),
  ('RECON_AMOUNT_MISMATCH', 400, 'VALIDATION',    'FINANCE', 'The statement line and the book entry have different amounts.', 'Match of unequal amounts', true, NULL),
  ('POSTING_ROLE_UNMAPPED', 400, 'BUSINESS_RULE', 'FINANCE', 'A default account needed for this posting is not set (Company Settings › Default accounts).', 'Missing posting role account', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- getAccountForRole names its catalogue code.
CREATE OR REPLACE FUNCTION "Company"."getAccountForRole"("pRole" text)
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
AS $function$
DECLARE
  "vAccount" uuid;
BEGIN
  SELECT m."accountId" INTO "vAccount"
    FROM "Company"."DefaultAccountMappings" m
   WHERE m."tenantId" = "Company"."getCurrentTenantId"() AND m.role = "pRole";
  IF "vAccount" IS NULL THEN
    RAISE EXCEPTION 'No default account is set for role % (Company Settings › Default accounts)', "pRole"
      USING ERRCODE = 'no_data_found', HINT = 'POSTING_ROLE_UNMAPPED';
  END IF;
  RETURN "vAccount";
END $function$;

SELECT set_config('app.actorLabel', '', false);
