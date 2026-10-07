-- =============================================================================
-- Finsoft ERP (FULL) — fk/03-acc-fks.sql
-- Cross-module foreign keys for the acc schema (run after every schema file).
-- First block is identical to erp-basic; Full-only constraints follow.
-- =============================================================================

-- VoucherLines: party sub-ledger (at most one set — journal_line_one_party_full_chk)
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

-- ---------------------------------------------------------------------------
-- FULL only
-- ---------------------------------------------------------------------------

-- VoucherLines: employee sub-ledger (staff advances, payroll payables)
ALTER TABLE "Accounting"."VoucherLines"
  ADD CONSTRAINT "journalLineEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
      REFERENCES "HumanResources"."Employees" ("tenantId", id);

-- CostCentres / project owners ("Owner" select lists employees)
ALTER TABLE "Accounting"."CostCentres"
  ADD CONSTRAINT "costCentreOwnerEmployeeIdFk" FOREIGN KEY ("tenantId", "ownerEmployeeId")
      REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "Accounting"."Projects"
  ADD CONSTRAINT "projectOwnerEmployeeIdFk" FOREIGN KEY ("tenantId", "ownerEmployeeId")
      REFERENCES "HumanResources"."Employees" ("tenantId", id);

-- RecurringVoucherTemplateLines: parties ("Dr 5250-01 · Cr AP — PTCL")
ALTER TABLE "Accounting"."RecurringVoucherTemplateLines"
  ADD CONSTRAINT "recurringTemplateLineCustomerIdFk" FOREIGN KEY ("tenantId", "customerId")
      REFERENCES "Sales"."Customers" ("tenantId", id);
ALTER TABLE "Accounting"."RecurringVoucherTemplateLines"
  ADD CONSTRAINT "recurringTemplateLineVendorIdFk" FOREIGN KEY ("tenantId", "vendorId")
      REFERENCES "Purchases"."Vendors" ("tenantId", id);
ALTER TABLE "Accounting"."RecurringVoucherTemplateLines"
  ADD CONSTRAINT "recurringTemplateLineEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
      REFERENCES "HumanResources"."Employees" ("tenantId", id);
