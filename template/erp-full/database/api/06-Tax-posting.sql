-- =============================================================================
-- Finsoft ERP — API: Tax posting hooks (Full edition)
-- Hand-written. The generated actions in 06-Tax-api.sql call
-- "Tax"."<entity><Action>Entries"(id) BEFORE they change the status, in the
-- same transaction. Rules: POSTING_RULES.md §Tax (WHT deposit with FBR, WHT
-- register rows). Tax lines of sales / purchases are posted inside the source
-- document's voucher; the only vouchers the tax module raises are CPR deposits.
--
--   whtChallanCancelEntries      reverse the CPR voucher (Dr WHT payable · Cr bank) and
--                                put the settled WhtDeductions rows back to UNPAID
--   whtCertificateCancelEntries  register only: unlink the deductions it covered
--                                (CLAIMED → UNPAID); no journal
-- The generated Tax API has no Post action for WhtChallans or SalesTaxReturns, so
-- the CPR / settlement vouchers themselves are created elsewhere.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- WHT challan (CPR) — Cancel
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Tax"."whtChallanCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vCpr"    record;
  "vRef"    text;
BEGIN
  SELECT w.* INTO "vCpr" FROM "Tax"."WhtChallans" w WHERE w."tenantId" = "vTenant" AND w.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WHT challan % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;

  SELECT c."certificateNo" INTO "vRef" FROM "Tax"."WhtCertificates" c
   WHERE c."tenantId" = "vTenant" AND c."whtPaymentId" = "pId" AND c.status NOT IN ('DRAFT','CANCELLED')
   LIMIT 1;
  IF "vRef" IS NOT NULL THEN
    RAISE EXCEPTION 'CPR % is quoted on certificate %: cancel the certificate first', "vCpr"."cprNo", "vRef"
      USING ERRCODE = 'check_violation';
  END IF;

  IF "vCpr".status = 'PAID' THEN
    PERFORM "Accounting"."journalReverseForSource"('WHT', "pId", 'OTHER', current_date);
    IF "vCpr"."journalEntryId" IS NOT NULL AND EXISTS (
         SELECT 1 FROM "Accounting"."Vouchers" v
          WHERE v."tenantId" = "vTenant" AND v.id = "vCpr"."journalEntryId"
            AND v.status = 'POSTED' AND v."reversalOfId" IS NULL) THEN
      PERFORM "Accounting"."voucherReverse"("vCpr"."journalEntryId", current_date, 'OTHER',
                                            'CPR ' || "vCpr"."cprNo" || ' cancelled');
    END IF;
  END IF;

  -- the deductions it settled are due again
  UPDATE "Tax"."WhtDeductions" d
     SET status = 'UNPAID', "whtPaymentId" = NULL
   WHERE d."tenantId" = "vTenant" AND d."whtPaymentId" = "pId";
END $$;
COMMENT ON FUNCTION "Tax"."whtChallanCancelEntries"(uuid) IS
  'Posting hook of Tax.whtChallanCancel: reverses the CPR voucher and re-opens the WHT deductions it settled.';

-- -----------------------------------------------------------------------------
-- WHT certificate — Cancel (no journal): deductions covered by the certificate
-- lose the link; SUFFERED rows that were CLAIMED on it are open again.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Tax"."whtCertificateCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Tax"."WhtCertificates" c WHERE c."tenantId" = "vTenant" AND c.id = "pId") THEN
    RAISE EXCEPTION 'WHT certificate % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE "Tax"."WhtDeductions" d
     SET status = CASE WHEN d.status = 'CLAIMED' THEN 'UNPAID' ELSE d.status END,
         "whtCertificateId" = NULL
   WHERE d."tenantId" = "vTenant" AND d."whtCertificateId" = "pId";
END $$;
COMMENT ON FUNCTION "Tax"."whtCertificateCancelEntries"(uuid) IS
  'Posting hook of Tax.whtCertificateCancel: unlinks the WHT deductions it covered (CLAIMED → UNPAID). No journal.';
