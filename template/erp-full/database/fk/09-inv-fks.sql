-- =============================================================================
-- Finsoft ERP (FULL) — fk/09-inv-fks.sql
-- Cross-module foreign keys of the inv schema (contract §3). Runs after every
-- schema file (00 … 14), so all target tables exist. All composite
-- (tenantId, x_id) -> (tenantId, id).
-- The first block is identical to erp-basic; Full-only FKs follow.
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

-- #############################################################################
-- FULL EDITION
-- #############################################################################

-- appended columns on Basic tables -------------------------------------------
ALTER TABLE "Inventory"."Warehouses"
  ADD CONSTRAINT "warehouseVehicleIdFk" FOREIGN KEY ("tenantId", "vehicleId")
  REFERENCES "Distribution"."Vans" ("tenantId", id);
ALTER TABLE "Inventory"."StockInOut"
  ADD CONSTRAINT "manualStockEntryRequestedByEmployeeIdFk" FOREIGN KEY ("tenantId", "requestedByEmployeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "Inventory"."StockTransfers"
  ADD CONSTRAINT "stockTransferDriverEmployeeIdFk" FOREIGN KEY ("tenantId", "driverEmployeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "Inventory"."StockTransfers"
  ADD CONSTRAINT "stockTransferVehicleIdFk" FOREIGN KEY ("tenantId", "vehicleId")
  REFERENCES "Distribution"."Vans" ("tenantId", id);

-- PrincipalClaims / ProductSuppliers --------------------------------------------
ALTER TABLE "Inventory"."PrincipalClaims"
  ADD CONSTRAINT "principalClaimDebitNoteIdFk" FOREIGN KEY ("tenantId", "debitNoteId")
  REFERENCES "Purchases"."DebitNotes" ("tenantId", id);
ALTER TABLE "Inventory"."ProductSuppliers"
  ADD CONSTRAINT "itemSupplierVendorIdFk" FOREIGN KEY ("tenantId", "vendorId")
  REFERENCES "Purchases"."Vendors" ("tenantId", id);

-- AssemblyVouchers ------------------------------------------------------------
ALTER TABLE "Inventory"."AssemblyVouchers"
  ADD CONSTRAINT "assemblyVoucherJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId")
  REFERENCES "Accounting"."Vouchers" ("tenantId", id);

-- StockReservations (sales-order demand) -----------------------------------------
ALTER TABLE "Inventory"."StockReservations"
  ADD CONSTRAINT "stockReservationSalesOrderIdFk" FOREIGN KEY ("tenantId", "salesOrderId")
  REFERENCES "Sales"."SalesOrders" ("tenantId", id);
ALTER TABLE "Inventory"."StockReservations"
  ADD CONSTRAINT "stockReservationSalesOrderLineIdFk" FOREIGN KEY ("tenantId", "salesOrderLineId")
  REFERENCES "Sales"."SalesOrderLines" ("tenantId", id);

-- StockCounts -----------------------------------------------------------------
ALTER TABLE "Inventory"."StockCounts"
  ADD CONSTRAINT "stockCountJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId")
  REFERENCES "Accounting"."Vouchers" ("tenantId", id);

-- StockVouchers ---------------------------------------------------------------
ALTER TABLE "Inventory"."StockVouchers"
  ADD CONSTRAINT "stockVoucherExpenseAccountIdFk" FOREIGN KEY ("tenantId", "expenseAccountId")
  REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "Inventory"."StockVouchers"
  ADD CONSTRAINT "stockVoucherJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId")
  REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "Inventory"."StockVouchers"
  ADD CONSTRAINT "stockVoucherEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "Inventory"."StockVouchers"
  ADD CONSTRAINT "stockVoucherSalesmanEmployeeIdFk" FOREIGN KEY ("tenantId", "salesmanEmployeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "Inventory"."StockVouchers"
  ADD CONSTRAINT "stockVoucherRequestedByEmployeeIdFk" FOREIGN KEY ("tenantId", "requestedByEmployeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "Inventory"."StockVouchers"
  ADD CONSTRAINT "stockVoucherCustomerIdFk" FOREIGN KEY ("tenantId", "customerId")
  REFERENCES "Sales"."Customers" ("tenantId", id);
ALTER TABLE "Inventory"."StockVouchers"
  ADD CONSTRAINT "stockVoucherDepartmentIdFk" FOREIGN KEY ("tenantId", "departmentId")
  REFERENCES "HumanResources"."Departments" ("tenantId", id);
ALTER TABLE "Inventory"."StockVouchers"
  ADD CONSTRAINT "stockVoucherCostCentreIdFk" FOREIGN KEY ("tenantId", "costCentreId")
  REFERENCES "Accounting"."CostCentres" ("tenantId", id);

-- demand ----------------------------------------------------------------------
ALTER TABLE "Inventory"."GoodsDemands"
  ADD CONSTRAINT "demandVendorIdFk" FOREIGN KEY ("tenantId", "vendorId")
  REFERENCES "Purchases"."Vendors" ("tenantId", id);
ALTER TABLE "Inventory"."GoodsDemands"
  ADD CONSTRAINT "demandPurchaseOrderIdFk" FOREIGN KEY ("tenantId", "purchaseOrderId")
  REFERENCES "Purchases"."PurchaseOrders" ("tenantId", id);
