-- =============================================================================
-- Finsoft ERP (FULL) — fk/05-fa-fks.sql
-- Cross-module foreign keys for the fa schema: GL accounts, cost centres,
-- fiscal periods/years and journals (acc), employees (hr), vendors (purchase),
-- customers (sales) and tax codes (tax).
-- =============================================================================

-- FixedAssetCategories: default GL accounts
ALTER TABLE "FixedAssets"."FixedAssetCategories"
  ADD CONSTRAINT "assetCategoryCostAccountIdFk" FOREIGN KEY ("tenantId", "costAccountId")
      REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "FixedAssets"."FixedAssetCategories"
  ADD CONSTRAINT "assetCategoryAccumDepAccountIdFk" FOREIGN KEY ("tenantId", "accumDepAccountId")
      REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "FixedAssets"."FixedAssetCategories"
  ADD CONSTRAINT "assetCategoryDepExpenseAccountIdFk" FOREIGN KEY ("tenantId", "depExpenseAccountId")
      REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);

-- asset
ALTER TABLE "FixedAssets"."FixedAssets"
  ADD CONSTRAINT "assetCustodianEmployeeIdFk" FOREIGN KEY ("tenantId", "custodianEmployeeId")
      REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "FixedAssets"."FixedAssets"
  ADD CONSTRAINT "assetCostCentreIdFk" FOREIGN KEY ("tenantId", "costCentreId")
      REFERENCES "Accounting"."CostCentres" ("tenantId", id);
ALTER TABLE "FixedAssets"."FixedAssets"
  ADD CONSTRAINT "assetVendorIdFk" FOREIGN KEY ("tenantId", "vendorId")
      REFERENCES "Purchases"."Vendors" ("tenantId", id);
ALTER TABLE "FixedAssets"."FixedAssets"
  ADD CONSTRAINT "assetCostAccountIdFk" FOREIGN KEY ("tenantId", "costAccountId")
      REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "FixedAssets"."FixedAssets"
  ADD CONSTRAINT "assetAccumDepAccountIdFk" FOREIGN KEY ("tenantId", "accumDepAccountId")
      REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "FixedAssets"."FixedAssets"
  ADD CONSTRAINT "assetDepExpenseAccountIdFk" FOREIGN KEY ("tenantId", "depExpenseAccountId")
      REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);

-- AssetTransfers: custodians
ALTER TABLE "FixedAssets"."AssetTransfers"
  ADD CONSTRAINT "assetTransferFromCustodianEmployeeIdFk" FOREIGN KEY ("tenantId", "fromCustodianEmployeeId")
      REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "FixedAssets"."AssetTransfers"
  ADD CONSTRAINT "assetTransferToCustodianEmployeeIdFk" FOREIGN KEY ("tenantId", "toCustodianEmployeeId")
      REFERENCES "HumanResources"."Employees" ("tenantId", id);

-- DepreciationRuns: period + journal
ALTER TABLE "FixedAssets"."DepreciationRuns"
  ADD CONSTRAINT "depreciationRunFiscalPeriodIdFk" FOREIGN KEY ("tenantId", "fiscalPeriodId")
      REFERENCES "Accounting"."FiscalPeriods" ("tenantId", id);
ALTER TABLE "FixedAssets"."DepreciationRuns"
  ADD CONSTRAINT "depreciationRunJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId")
      REFERENCES "Accounting"."Vouchers" ("tenantId", id);

-- DepreciationRunLines: accounts + cost centre
ALTER TABLE "FixedAssets"."DepreciationRunLines"
  ADD CONSTRAINT "depreciationRunLineCostCentreIdFk" FOREIGN KEY ("tenantId", "costCentreId")
      REFERENCES "Accounting"."CostCentres" ("tenantId", id);
ALTER TABLE "FixedAssets"."DepreciationRunLines"
  ADD CONSTRAINT "depreciationRunLineExpenseAccountIdFk" FOREIGN KEY ("tenantId", "expenseAccountId")
      REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "FixedAssets"."DepreciationRunLines"
  ADD CONSTRAINT "depreciationRunLineAccumDepAccountIdFk" FOREIGN KEY ("tenantId", "accumDepAccountId")
      REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);

-- DepreciationSchedules: fiscal year
ALTER TABLE "FixedAssets"."DepreciationSchedules"
  ADD CONSTRAINT "depreciationScheduleFiscalYearIdFk" FOREIGN KEY ("tenantId", "fiscalYearId")
      REFERENCES "Accounting"."FiscalYears" ("tenantId", id);

-- AssetDisposals: buyer, GST code, accounts, journal
ALTER TABLE "FixedAssets"."AssetDisposals"
  ADD CONSTRAINT "assetDisposalCustomerIdFk" FOREIGN KEY ("tenantId", "customerId")
      REFERENCES "Sales"."Customers" ("tenantId", id);
ALTER TABLE "FixedAssets"."AssetDisposals"
  ADD CONSTRAINT "assetDisposalTaxCodeIdFk" FOREIGN KEY ("tenantId", "taxCodeId")
      REFERENCES "Tax"."TaxCodes" ("tenantId", id);
ALTER TABLE "FixedAssets"."AssetDisposals"
  ADD CONSTRAINT "assetDisposalReceiveIntoAccountIdFk" FOREIGN KEY ("tenantId", "receiveIntoAccountId")
      REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "FixedAssets"."AssetDisposals"
  ADD CONSTRAINT "assetDisposalGainAccountIdFk" FOREIGN KEY ("tenantId", "gainAccountId")
      REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "FixedAssets"."AssetDisposals"
  ADD CONSTRAINT "assetDisposalLossAccountIdFk" FOREIGN KEY ("tenantId", "lossAccountId")
      REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "FixedAssets"."AssetDisposals"
  ADD CONSTRAINT "assetDisposalOutputTaxAccountIdFk" FOREIGN KEY ("tenantId", "outputTaxAccountId")
      REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "FixedAssets"."AssetDisposals"
  ADD CONSTRAINT "assetDisposalJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId")
      REFERENCES "Accounting"."Vouchers" ("tenantId", id);
