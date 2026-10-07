-- =============================================================================
-- Finsoft ERP (BASIC) — fk/03-acc-fks.sql
-- Cross-module foreign keys for the acc schema (run after every schema file).
-- Sub-ledger parties on journal lines and opening-balance lines.
-- =============================================================================

-- VoucherLines: party sub-ledger (at most one set — journal_line_one_party_chk)
ALTER TABLE "Accounting"."VoucherLines"
  ADD CONSTRAINT "journalLineCustomerIdFk" FOREIGN KEY ("tenantId", "customerId")
      REFERENCES "Sales"."Customers" ("tenantId", id);
ALTER TABLE "Accounting"."VoucherLines"
  ADD CONSTRAINT "journalLineVendorIdFk" FOREIGN KEY ("tenantId", "vendorId")
      REFERENCES "Purchases"."Vendors" ("tenantId", id);

-- OpeningBalanceLines: optional party for AR/AP control-account openings
ALTER TABLE "Accounting"."OpeningBalanceLines"
  ADD CONSTRAINT "openingBalanceLineCustomerIdFk" FOREIGN KEY ("tenantId", "customerId")
      REFERENCES "Sales"."Customers" ("tenantId", id);
ALTER TABLE "Accounting"."OpeningBalanceLines"
  ADD CONSTRAINT "openingBalanceLineVendorIdFk" FOREIGN KEY ("tenantId", "vendorId")
      REFERENCES "Purchases"."Vendors" ("tenantId", id);
