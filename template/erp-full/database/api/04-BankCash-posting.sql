-- =============================================================================
-- Finsoft ERP — API: BankCash (treasury) posting hooks (Full edition)
-- Hand-written. The generated actions in 04-BankCash-api.sql call
-- "BankCash"."<entity><Action>Entries"(id) BEFORE they change the status, in the
-- same transaction. Rules: POSTING_RULES.md §Treasury. Treasury has no stock effect.
--
--   chequeCancelEntries                  reverse the cheque voucher(s); void the receipts it funded
--   chequeBatchCancelEntries             cancel every cheque the batch generated
--   pettyCashReplenishmentPostEntries    Dr each unreplenished voucher's expense GL (+ fund float
--                                        change) · Cr pay-from cash / bank GL; vouchers REPLENISHED
--   pettyCashReplenishmentCancelEntries  reverse it; vouchers back to UNREPLENISHED
--   pettyCashVoucherVoidEntries          guard only (a PCV has no journal until replenished)
--   expenseClaimApproveEntries           Dr charge / line expense GL · Cr EMPLOYEE_CLAIMS_PAYABLE (employee)
-- All journals are SYSTEM vouchers (sourceDocType CHQ / PCV / EXP).
-- =============================================================================

-- Reverses one voucher if it is still POSTED and not itself a reversal (journals
-- referenced by a document column but not tagged with the document as source).
CREATE OR REPLACE FUNCTION "BankCash"."voucherReverseIfPosted"("pVoucherId" uuid, "pDate" date, "pRemarks" text)
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
-- Cheque — Cancel / stop: "reverse the issue voucher" (and, for a received
-- cheque, the deposit / PDC / clearing vouchers). Receipts funded by the cheque
-- are voided so their invoices re-open. A BOUNCED cheque's vouchers were already
-- offset by the bounce entry, so nothing is reversed again.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "BankCash"."chequeCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vChq"    record;
  "vRef"    text;
  "vRcpt"   uuid;
BEGIN
  SELECT c.* INTO "vChq" FROM "BankCash"."Cheques" c WHERE c."tenantId" = "vTenant" AND c.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cheque % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vChq".status = 'REPLACED' THEN
    RAISE EXCEPTION 'Cheque % (%) was replaced and cannot be cancelled', "vChq"."chequeNo", "vChq"."docNo"
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p."docNo" INTO "vRef" FROM "Purchases"."VendorPayments" p
   WHERE p."tenantId" = "vTenant" AND p."chequeId" = "pId" AND p.status NOT IN ('DRAFT','VOID')
   LIMIT 1;
  IF "vRef" IS NOT NULL THEN
    RAISE EXCEPTION 'Cheque % pays vendor payment %: void the payment first', "vChq"."chequeNo", "vRef"
      USING ERRCODE = 'check_violation';
  END IF;

  -- customer receipts carried by this cheque stop settling their invoices
  FOR "vRcpt" IN
    SELECT r.id FROM "Sales"."CustomerReceipts" r
     WHERE r."tenantId" = "vTenant" AND r."chequeId" = "pId" AND r.status NOT IN ('VOID','BOUNCED')
  LOOP
    PERFORM "Sales"."customerReceiptVoid"("vRcpt", 'Cheque ' || "vChq"."chequeNo" || ' cancelled');
  END LOOP;

  IF "vChq".status <> 'BOUNCED' THEN
    PERFORM "Accounting"."journalReverseForSource"('CHQ', "pId", 'OTHER', current_date);
    PERFORM "BankCash"."voucherReverseIfPosted"("vChq"."clearingJournalEntryId", current_date,
                                                'Cheque ' || "vChq"."chequeNo" || ' cancelled');
    PERFORM "BankCash"."voucherReverseIfPosted"("vChq"."journalEntryId", current_date,
                                                'Cheque ' || "vChq"."chequeNo" || ' cancelled');
  END IF;
END $$;
COMMENT ON FUNCTION "BankCash"."chequeCancelEntries"(uuid) IS
  'Posting hook of BankCash.chequeCancel: reverses the cheque vouchers and voids the customer receipts it funded.';

-- -----------------------------------------------------------------------------
-- Cheque batch — Cancel: one voucher per generated row, so every generated
-- cheque is cancelled through its own action (same rules as above).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "BankCash"."chequeBatchCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vBatch"  record;
  "vChq"    uuid;
BEGIN
  SELECT b.id, b."docNo" INTO "vBatch" FROM "BankCash"."ChequeBatches" b
   WHERE b."tenantId" = "vTenant" AND b.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cheque batch % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  FOR "vChq" IN
    SELECT c.id
      FROM "BankCash"."ChequeBatchLines" l
      JOIN "BankCash"."Cheques" c ON c."tenantId" = l."tenantId" AND c.id = l."chequeId"
     WHERE l."tenantId" = "vTenant" AND l."batchId" = "pId" AND c.status NOT IN ('CANCELLED','REPLACED')
     ORDER BY l."lineNo"
  LOOP
    PERFORM "BankCash"."chequeCancel"("vChq", 'Cheque batch ' || "vBatch"."docNo" || ' cancelled');
  END LOOP;
END $$;
COMMENT ON FUNCTION "BankCash"."chequeBatchCancelEntries"(uuid) IS
  'Posting hook of BankCash.chequeBatchCancel: cancels (and reverses) every cheque generated by the batch.';

-- -----------------------------------------------------------------------------
-- Petty cash replenishment — Post (imprest top-up, CPV / BPV as a SYSTEM voucher)
--   Dr each UNREPLENISHED voucher's accountId (cost centre), grouped   Σ vouchers
--   Dr / Cr fund cash GL (float increase / decrease)                     amount − Σ vouchers
--   Cr pay-from cash GL (payFromCashAccountId) or bank GL (payFromBankAccountId)   amount
-- The vouchers dated on or before the top-up become REPLENISHED.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "BankCash"."pettyCashReplenishmentPostEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"     uuid := "Company"."getCurrentTenantId"();
  "vRep"        record;
  "vFund"       record;
  "vRow"        record;
  "vPayAccount" uuid;
  "vLines"      jsonb := '[]'::jsonb;
  "vTotal"      numeric(18,2) := 0;
  "vCount"      integer := 0;
  "vJournal"    uuid;
  "vRef"        text;
BEGIN
  SELECT r.* INTO "vRep" FROM "BankCash"."PettyCashReplenishments" r WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Petty cash top-up % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  SELECT f.name, f."branchId", f."cashAccountId", f.status, ca."accountId" AS "glAccountId"
    INTO "vFund"
    FROM "BankCash"."PettyCashFunds" f
    JOIN "BankCash"."CashAccounts" ca ON ca."tenantId" = f."tenantId" AND ca.id = f."cashAccountId"
   WHERE f."tenantId" = "vTenant" AND f.id = "vRep"."fundId";
  IF "vFund".status = 'CLOSED' THEN
    RAISE EXCEPTION 'Petty cash fund % is closed', "vFund".name USING ERRCODE = 'check_violation';
  END IF;

  IF "vRep"."payFromCashAccountId" IS NOT NULL THEN
    IF "vRep"."payFromCashAccountId" = "vFund"."cashAccountId" THEN
      RAISE EXCEPTION 'Petty cash top-up: pay from another cash account than the fund itself' USING ERRCODE = 'check_violation';
    END IF;
    SELECT ca."accountId" INTO "vPayAccount" FROM "BankCash"."CashAccounts" ca
     WHERE ca."tenantId" = "vTenant" AND ca.id = "vRep"."payFromCashAccountId";
    "vRef" := 'CPV';
  ELSE
    SELECT ba."accountId" INTO "vPayAccount" FROM "BankCash"."BankAccounts" ba
     WHERE ba."tenantId" = "vTenant" AND ba.id = "vRep"."payFromBankAccountId";
    "vRef" := 'BPV';
  END IF;

  FOR "vRow" IN
    SELECT v."accountId", v."costCentreId", sum(v.amount) AS amount, count(*) AS n
      FROM "BankCash"."PettyCashVouchers" v
     WHERE v."tenantId" = "vTenant" AND v."fundId" = "vRep"."fundId" AND v.status = 'UNREPLENISHED'
       AND v."docDate" <= "vRep"."docDate"
     GROUP BY v."accountId", v."costCentreId"
  LOOP
    "vTotal" := "vTotal" + "vRow".amount;
    "vCount" := "vCount" + "vRow".n;
    "vLines" := "vLines" || jsonb_build_array(jsonb_build_object(
      'accountId', "vRow"."accountId", 'costCentreId', "vRow"."costCentreId", 'debit', "vRow".amount,
      'branchId', "vFund"."branchId", 'particulars', 'Petty cash expenses · ' || "vFund".name));
  END LOOP;

  "vLines" := "vLines" || jsonb_build_array(
    jsonb_build_object('accountId', "vFund"."glAccountId", 'debit', "vRep".amount - "vTotal",
                       'particulars', 'Imprest ' || "vFund".name),
    jsonb_build_object('accountId', "vPayAccount", 'credit', "vRep".amount,
                       'particulars', "vRef" || ' top-up of petty cash ' || "vFund".name));

  "vJournal" := "Accounting"."journalCreate"(
    jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vRep"."docDate", 'postingDate', "vRep"."docDate",
                       'branchId', "vFund"."branchId",
                       'narration', 'Petty cash top-up · ' || "vFund".name || ' · ' || "vCount" || ' vouchers',
                       'sourceDocType', 'PCV', 'sourceDocId', "pId", 'partyName', "vFund".name),
    "vLines");

  UPDATE "BankCash"."PettyCashVouchers" v
     SET status = 'REPLENISHED', "replenishmentId" = "pId"
   WHERE v."tenantId" = "vTenant" AND v."fundId" = "vRep"."fundId" AND v.status = 'UNREPLENISHED'
     AND v."docDate" <= "vRep"."docDate";
  UPDATE "BankCash"."PettyCashReplenishments" r
     SET "journalEntryId" = "vJournal", "voucherCount" = "vCount", "vouchersTotal" = "vTotal"
   WHERE r."tenantId" = "vTenant" AND r.id = "pId";
END $$;
COMMENT ON FUNCTION "BankCash"."pettyCashReplenishmentPostEntries"(uuid) IS
  'Posting hook of BankCash.pettyCashReplenishmentPost: expenses the unreplenished vouchers and restores the imprest.';

-- -----------------------------------------------------------------------------
-- Petty cash replenishment — Cancel: reverse the top-up voucher, vouchers back
-- to UNREPLENISHED.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "BankCash"."pettyCashReplenishmentCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRep"    record;
BEGIN
  SELECT r.* INTO "vRep" FROM "BankCash"."PettyCashReplenishments" r WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Petty cash top-up % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRep".status <> 'POSTED' THEN
    RETURN;
  END IF;
  PERFORM "Accounting"."journalReverseForSource"('PCV', "pId", 'OTHER', current_date);
  PERFORM "BankCash"."voucherReverseIfPosted"("vRep"."journalEntryId", current_date, 'Petty cash top-up cancelled');
  UPDATE "BankCash"."PettyCashVouchers" v
     SET status = 'UNREPLENISHED', "replenishmentId" = NULL
   WHERE v."tenantId" = "vTenant" AND v."replenishmentId" = "pId";
END $$;
COMMENT ON FUNCTION "BankCash"."pettyCashReplenishmentCancelEntries"(uuid) IS
  'Posting hook of BankCash.pettyCashReplenishmentCancel: reverses the top-up journal and re-opens its vouchers.';

-- -----------------------------------------------------------------------------
-- Petty cash voucher — Void. An UNREPLENISHED voucher has no journal (imprest
-- method), so voiding it only removes it from the next top-up. A REPLENISHED
-- voucher is inside the top-up journal: cancel that top-up first.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "BankCash"."pettyCashVoucherVoidEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vPcv"    record;
BEGIN
  SELECT v."docNo", v.status, v."replenishmentId" INTO "vPcv"
    FROM "BankCash"."PettyCashVouchers" v WHERE v."tenantId" = "vTenant" AND v.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Petty cash voucher % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vPcv".status = 'REPLENISHED' THEN
    RAISE EXCEPTION 'Petty cash voucher % is already expensed by a top-up: cancel that top-up first, then void the voucher',
      "vPcv"."docNo" USING ERRCODE = 'check_violation';
  END IF;
END $$;
COMMENT ON FUNCTION "BankCash"."pettyCashVoucherVoidEntries"(uuid) IS
  'Posting hook of BankCash.pettyCashVoucherVoid: blocks voiding a voucher already expensed by a top-up.';

-- -----------------------------------------------------------------------------
-- Expense claim — Approve (accrual JV)
--   Dr line accountId | line category GL | claim chargeAccountId | claim category GL
--      (cost centre, project)                                  approved amount
--   Cr EMPLOYEE_CLAIMS_PAYABLE (employeeId sub-ledger)          approved amount
-- A partial approval (approvedAmount < total) is charged to the claim's account.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "BankCash"."expenseClaimApproveEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"   uuid := "Company"."getCurrentTenantId"();
  "vClaim"    record;
  "vRow"      record;
  "vAccount"  uuid;
  "vAmount"   numeric(18,2);
  "vLineSum"  numeric(18,2);
  "vLines"    jsonb := '[]'::jsonb;
  "vJournal"  uuid;
BEGIN
  SELECT c.*, cat."accountId" AS "categoryAccountId" INTO "vClaim"
    FROM "BankCash"."ExpenseClaims" c
    JOIN "BankCash"."ExpenseCategories" cat ON cat."tenantId" = c."tenantId" AND cat.id = c."categoryId"
   WHERE c."tenantId" = "vTenant" AND c.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vClaim"."isOverPolicy" AND COALESCE(btrim("vClaim"."policyJustification"), '') = '' THEN
    RAISE EXCEPTION 'Expense claim % is over policy: a justification is required before approval', "vClaim"."docNo"
      USING ERRCODE = 'check_violation';
  END IF;
  "vAmount" := COALESCE("vClaim"."approvedAmount", "vClaim"."totalAmount");
  IF "vAmount" <= 0 THEN
    RAISE EXCEPTION 'Expense claim %: the approved amount must be above zero (reject the claim instead)', "vClaim"."docNo"
      USING ERRCODE = 'check_violation';
  END IF;
  "vAccount" := COALESCE("vClaim"."chargeAccountId", "vClaim"."categoryAccountId");

  SELECT COALESCE(sum(l.amount), 0) INTO "vLineSum"
    FROM "BankCash"."ExpenseClaimLines" l WHERE l."tenantId" = "vTenant" AND l."claimId" = "pId";

  IF "vLineSum" = "vAmount" THEN
    FOR "vRow" IN
      SELECT COALESCE(l."accountId", lc."accountId", "vAccount") AS "accountId",
             COALESCE(l."costCentreId", "vClaim"."costCentreId") AS "costCentreId",
             sum(l.amount) AS amount
        FROM "BankCash"."ExpenseClaimLines" l
        LEFT JOIN "BankCash"."ExpenseCategories" lc ON lc."tenantId" = l."tenantId" AND lc.id = l."categoryId"
       WHERE l."tenantId" = "vTenant" AND l."claimId" = "pId"
       GROUP BY 1, 2
    LOOP
      "vLines" := "vLines" || jsonb_build_array(jsonb_build_object(
        'accountId', "vRow"."accountId", 'costCentreId', "vRow"."costCentreId", 'projectId', "vClaim"."projectId",
        'debit', "vRow".amount, 'particulars', "vClaim"."docNo" || ' · ' || "vClaim".title));
    END LOOP;
  ELSE
    "vLines" := jsonb_build_array(jsonb_build_object(
      'accountId', "vAccount", 'costCentreId', "vClaim"."costCentreId", 'projectId', "vClaim"."projectId",
      'debit', "vAmount", 'particulars', "vClaim"."docNo" || ' · ' || "vClaim".title));
  END IF;
  "vLines" := "vLines" || jsonb_build_array(jsonb_build_object(
    'accountRole', 'EMPLOYEE_CLAIMS_PAYABLE', 'credit', "vAmount", 'employeeId', "vClaim"."employeeId",
    'particulars', 'Payable on claim ' || "vClaim"."docNo"));

  "vJournal" := "Accounting"."journalCreate"(
    jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "vClaim"."docDate", 'postingDate', current_date,
                       'branchId', "vClaim"."branchId", 'narration', 'Expense claim ' || "vClaim"."docNo" || ' · ' || "vClaim".title,
                       'sourceDocType', 'EXP', 'sourceDocId', "pId", 'sourceDocNo', "vClaim"."docNo"),
    "vLines");
  UPDATE "BankCash"."ExpenseClaims" c
     SET "approvalJournalEntryId" = "vJournal", "approvedAmount" = "vAmount"
   WHERE c."tenantId" = "vTenant" AND c.id = "pId";
END $$;
COMMENT ON FUNCTION "BankCash"."expenseClaimApproveEntries"(uuid) IS
  'Posting hook of BankCash.expenseClaimApprove: accrual journal Dr expense / Cr employee claims payable.';
