-- =============================================================================
-- Finsoft ERP — API: BankCash (treasury) posting hooks (Basic edition)
-- Hand-written. The generated actions in 04-BankCash-api.sql call
-- "BankCash"."<entity><Action>Entries"(id) BEFORE they change the status, in the
-- same transaction. Rules: POSTING_RULES.md §Treasury. Treasury has no stock effect.
--
--   chequeCancelEntries   reverse the cheque voucher(s); void the receipts it funded
-- Full adds cheque batches, petty cash and expense claims.
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
