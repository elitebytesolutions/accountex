-- =============================================================================
-- Finsoft ERP (FULL) — fk/02-core-fks.sql
-- Cross-module foreign keys of the core schema (contract §3). Runs after all
-- module schema files (00 → 14), so every referenced table exists.
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

-- ---------------------------------------------------------------------------
-- Full only
-- ---------------------------------------------------------------------------

-- My Profile "Linked employee EMP-0007" / Users wizard "Link existing employee"
ALTER TABLE "Company"."Users"
  ADD CONSTRAINT "appUserEmployeeIdFk"
  FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id);

-- Company Settings › Branches "Manager" as an employee
ALTER TABLE "Company"."Branches"
  ADD CONSTRAINT "branchManagerEmployeeIdFk"
  FOREIGN KEY ("tenantId", "managerEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id);

-- Pending invite created from an employee record
ALTER TABLE "Company"."UserInvites"
  ADD CONSTRAINT "userInviteEmployeeIdFk"
  FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id);

-- Integrations › HBL / Meezan bank feed → bank account
ALTER TABLE "Company"."Integrations"
  ADD CONSTRAINT "integrationBankAccountIdFk"
  FOREIGN KEY ("tenantId", "bankAccountId") REFERENCES "BankCash"."BankAccounts" ("tenantId", id);
