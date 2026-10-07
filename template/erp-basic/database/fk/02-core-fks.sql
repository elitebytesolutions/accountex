-- =============================================================================
-- Finsoft ERP (BASIC) — fk/02-core-fks.sql
-- Cross-module foreign keys of the core schema (contract §3). Runs after all
-- module schema files (00 → 09), so every referenced table exists.
-- =============================================================================

-- Company Settings › Finance "Default account mapping" → chart of accounts
ALTER TABLE "Company"."DefaultAccountMappings"
  ADD CONSTRAINT "defaultAccountMapAccountIdFk"
  FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);

-- "Default bank: Meezan Bank — 0123" → treasury bank account
ALTER TABLE "Company"."DefaultAccountMappings"
  ADD CONSTRAINT "defaultAccountMapBankAccountIdFk"
  FOREIGN KEY ("tenantId", "bankAccountId") REFERENCES "BankCash"."BankAccounts" ("tenantId", id);

-- Company Settings › Sales "Default sales tax: GST 18%" → tax code
ALTER TABLE "Company"."CompanySettings"
  ADD CONSTRAINT "companyProfileDefaultSalesTaxCodeIdFk"
  FOREIGN KEY ("tenantId", "defaultSalesTaxCodeId") REFERENCES "Tax"."TaxCodes" ("tenantId", id);

-- Add/Edit user wizard › Access › Warehouses → warehouse
ALTER TABLE "Company"."UserWarehouses"
  ADD CONSTRAINT "userWarehouseWarehouseIdFk"
  FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id);
