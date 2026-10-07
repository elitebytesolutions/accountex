-- =============================================================================
-- Finsoft ERP (BASIC) — fk/09-inv-fks.sql
-- Cross-module foreign keys of the inv schema (contract §3). Runs after every
-- schema file (00 … 09), so all target tables exist. All composite
-- (tenantId, x_id) -> (tenantId, id).
-- =============================================================================

-- item ----------------------------------------------------------------------
-- "Distributor" select on the product form (Purchases.Vendors)
ALTER TABLE "Inventory"."Products"
  ADD CONSTRAINT "itemDistributorVendorIdFk" FOREIGN KEY ("tenantId", "distributorVendorId")
  REFERENCES "Purchases"."Vendors" ("tenantId", id);
-- GST / FBR tax code of the item (optional; gstRate is the screen value)
ALTER TABLE "Inventory"."Products"
  ADD CONSTRAINT "itemTaxCodeIdFk" FOREIGN KEY ("tenantId", "taxCodeId")
  REFERENCES "Tax"."TaxCodes" ("tenantId", id);

-- warehouse -----------------------------------------------------------------
-- "Inventory account" (1310 Inventory) on Add Warehouse
ALTER TABLE "Inventory"."Warehouses"
  ADD CONSTRAINT "warehouseInventoryAccountIdFk" FOREIGN KEY ("tenantId", "inventoryAccountId")
  REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);

-- StockMovementReasons -----------------------------------------------------------
-- offset (expense / income) account of a manual in/out or adjustment reason
ALTER TABLE "Inventory"."StockMovementReasons"
  ADD CONSTRAINT "movementReasonExpenseAccountIdFk" FOREIGN KEY ("tenantId", "expenseAccountId")
  REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);

-- StockInOut --------------------------------------------------------
ALTER TABLE "Inventory"."StockInOut"
  ADD CONSTRAINT "manualStockEntryJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId")
  REFERENCES "Accounting"."Vouchers" ("tenantId", id);

-- StockTransfers ------------------------------------------------------------
ALTER TABLE "Inventory"."StockTransfers"
  ADD CONSTRAINT "stockTransferJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId")
  REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "Inventory"."StockTransfers"
  ADD CONSTRAINT "stockTransferReceiptJournalEntryIdFk" FOREIGN KEY ("tenantId", "receiptJournalEntryId")
  REFERENCES "Accounting"."Vouchers" ("tenantId", id);

-- StockAdjustments ----------------------------------------------------------
-- "Offset account" 5090 Inventory Adjustment / 5095 Inventory Write-off
ALTER TABLE "Inventory"."StockAdjustments"
  ADD CONSTRAINT "stockAdjustmentOffsetAccountIdFk" FOREIGN KEY ("tenantId", "offsetAccountId")
  REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "Inventory"."StockAdjustments"
  ADD CONSTRAINT "stockAdjustmentJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId")
  REFERENCES "Accounting"."Vouchers" ("tenantId", id);
