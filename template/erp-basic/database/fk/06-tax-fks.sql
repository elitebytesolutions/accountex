-- =============================================================================
-- Finsoft ERP (BASIC) — fk/06-tax-fks.sql
-- Cross-module foreign keys of the tax schema (contract §3).
-- =============================================================================

ALTER TABLE "Tax"."TaxCodes"
  ADD CONSTRAINT "taxCodeAccountIdFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "Tax"."TaxCodes"
  ADD CONSTRAINT "taxCodeInputAccountIdFk" FOREIGN KEY ("tenantId", "inputAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
