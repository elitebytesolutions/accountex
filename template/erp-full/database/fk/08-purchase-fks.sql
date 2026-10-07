-- =============================================================================
-- Finsoft ERP (FULL) — fk/08-purchase-fks.sql
-- Cross-module foreign keys for the purchase schema (contract §3). Runs after
-- every NN-*.sql module file. All composite: (tenantId, x_id) → (tenantId, id).
-- Targets: Inventory.Products / Inventory.Warehouses / Inventory.ProductBatches, Accounting.ChartOfAccounts / Accounting.CostCentres /
--          Accounting.Vouchers, Tax.TaxCodes, BankCash.BankAccounts /
--          BankCash.CashAccounts / BankCash.Cheques
-- (Company.Branches, Company.Users, Company.Currencies are referenced inline.)
-- =============================================================================

-- vendor -------------------------------------------------------------------
ALTER TABLE "Purchases"."Vendors"
  ADD CONSTRAINT "vendorDefaultAccountIdFk" FOREIGN KEY ("tenantId", "defaultAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "Purchases"."Vendors"
  ADD CONSTRAINT "vendorPayableAccountIdFk" FOREIGN KEY ("tenantId", "payableAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);

-- PurchaseOrders -----------------------------------------------------------
ALTER TABLE "Purchases"."PurchaseOrders"
  ADD CONSTRAINT "purchaseOrderWarehouseIdFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id);
ALTER TABLE "Purchases"."PurchaseOrders"
  ADD CONSTRAINT "purchaseOrderCostCentreIdFk" FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id);

-- PurchaseOrderLines --------------------------------------------------------
ALTER TABLE "Purchases"."PurchaseOrderLines"
  ADD CONSTRAINT "purchaseOrderLineItemIdFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id);
ALTER TABLE "Purchases"."PurchaseOrderLines"
  ADD CONSTRAINT "purchaseOrderLineAccountIdFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "Purchases"."PurchaseOrderLines"
  ADD CONSTRAINT "purchaseOrderLineTaxCodeIdFk" FOREIGN KEY ("tenantId", "taxCodeId") REFERENCES "Tax"."TaxCodes" ("tenantId", id);
ALTER TABLE "Purchases"."PurchaseOrderLines"
  ADD CONSTRAINT "purchaseOrderLineCostCentreIdFk" FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id);

-- grn ----------------------------------------------------------------------
ALTER TABLE "Purchases"."GoodsReceivedNotes"
  ADD CONSTRAINT "grnWarehouseIdFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id);
ALTER TABLE "Purchases"."GoodsReceivedNotes"
  ADD CONSTRAINT "grnJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);

-- GoodsReceivedNoteLines -----------------------------------------------------------------
ALTER TABLE "Purchases"."GoodsReceivedNoteLines"
  ADD CONSTRAINT "grnLineItemIdFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id);
ALTER TABLE "Purchases"."GoodsReceivedNoteLines"
  ADD CONSTRAINT "grnLineBatchIdFk" FOREIGN KEY ("tenantId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", id);

-- bill ---------------------------------------------------------------------
ALTER TABLE "Purchases"."VendorBills"
  ADD CONSTRAINT "billWarehouseIdFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id);
ALTER TABLE "Purchases"."VendorBills"
  ADD CONSTRAINT "billPayableAccountIdFk" FOREIGN KEY ("tenantId", "payableAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "Purchases"."VendorBills"
  ADD CONSTRAINT "billCostCentreIdFk" FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id);
ALTER TABLE "Purchases"."VendorBills"
  ADD CONSTRAINT "billBankAccountIdFk" FOREIGN KEY ("tenantId", "bankAccountId") REFERENCES "BankCash"."BankAccounts" ("tenantId", id);
ALTER TABLE "Purchases"."VendorBills"
  ADD CONSTRAINT "billCashAccountIdFk" FOREIGN KEY ("tenantId", "cashAccountId") REFERENCES "BankCash"."CashAccounts" ("tenantId", id);
ALTER TABLE "Purchases"."VendorBills"
  ADD CONSTRAINT "billChequeIdFk" FOREIGN KEY ("tenantId", "chequeId") REFERENCES "BankCash"."Cheques" ("tenantId", id);
ALTER TABLE "Purchases"."VendorBills"
  ADD CONSTRAINT "billJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);

-- VendorBillLines ----------------------------------------------------------------
ALTER TABLE "Purchases"."VendorBillLines"
  ADD CONSTRAINT "billLineItemIdFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id);
ALTER TABLE "Purchases"."VendorBillLines"
  ADD CONSTRAINT "billLineAccountIdFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "Purchases"."VendorBillLines"
  ADD CONSTRAINT "billLineTaxCodeIdFk" FOREIGN KEY ("tenantId", "taxCodeId") REFERENCES "Tax"."TaxCodes" ("tenantId", id);
ALTER TABLE "Purchases"."VendorBillLines"
  ADD CONSTRAINT "billLineBatchIdFk" FOREIGN KEY ("tenantId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", id);
ALTER TABLE "Purchases"."VendorBillLines"
  ADD CONSTRAINT "billLineCostCentreIdFk" FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id);

-- DebitNotes ---------------------------------------------------------------
ALTER TABLE "Purchases"."DebitNotes"
  ADD CONSTRAINT "debitNoteWarehouseIdFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id);
ALTER TABLE "Purchases"."DebitNotes"
  ADD CONSTRAINT "debitNoteJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);

-- DebitNoteLines ----------------------------------------------------------
ALTER TABLE "Purchases"."DebitNoteLines"
  ADD CONSTRAINT "debitNoteLineItemIdFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id);
ALTER TABLE "Purchases"."DebitNoteLines"
  ADD CONSTRAINT "debitNoteLineTaxCodeIdFk" FOREIGN KEY ("tenantId", "taxCodeId") REFERENCES "Tax"."TaxCodes" ("tenantId", id);
ALTER TABLE "Purchases"."DebitNoteLines"
  ADD CONSTRAINT "debitNoteLineBatchIdFk" FOREIGN KEY ("tenantId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", id);

-- VendorPayments -----------------------------------------------------------
ALTER TABLE "Purchases"."VendorPayments"
  ADD CONSTRAINT "vendorPaymentBankAccountIdFk" FOREIGN KEY ("tenantId", "bankAccountId") REFERENCES "BankCash"."BankAccounts" ("tenantId", id);
ALTER TABLE "Purchases"."VendorPayments"
  ADD CONSTRAINT "vendorPaymentCashAccountIdFk" FOREIGN KEY ("tenantId", "cashAccountId") REFERENCES "BankCash"."CashAccounts" ("tenantId", id);
ALTER TABLE "Purchases"."VendorPayments"
  ADD CONSTRAINT "vendorPaymentChequeIdFk" FOREIGN KEY ("tenantId", "chequeId") REFERENCES "BankCash"."Cheques" ("tenantId", id);
ALTER TABLE "Purchases"."VendorPayments"
  ADD CONSTRAINT "vendorPaymentJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);

-- =============================================================================
-- FULL-ONLY cross-module FKs (HumanResources.Departments, Accounting.Projects, BankCash.ChequeBooks
-- and the Full-only tables PurchaseReturns / landed_cost_*)
-- =============================================================================
ALTER TABLE "Purchases"."PurchaseOrders"
  ADD CONSTRAINT "purchaseOrderDepartmentIdFk" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "HumanResources"."Departments" ("tenantId", id);
ALTER TABLE "Purchases"."PurchaseOrders"
  ADD CONSTRAINT "purchaseOrderProjectIdFk" FOREIGN KEY ("tenantId", "projectId") REFERENCES "Accounting"."Projects" ("tenantId", id);
ALTER TABLE "Purchases"."VendorBills"
  ADD CONSTRAINT "billProjectIdFk" FOREIGN KEY ("tenantId", "projectId") REFERENCES "Accounting"."Projects" ("tenantId", id);
ALTER TABLE "Purchases"."VendorBillLines"
  ADD CONSTRAINT "billLineProjectIdFk" FOREIGN KEY ("tenantId", "projectId") REFERENCES "Accounting"."Projects" ("tenantId", id);
ALTER TABLE "Purchases"."VendorPayments"
  ADD CONSTRAINT "vendorPaymentChequeBookIdFk" FOREIGN KEY ("tenantId", "chequeBookId") REFERENCES "BankCash"."ChequeBooks" ("tenantId", id);

-- PurchaseReturns ----------------------------------------------------------
ALTER TABLE "Purchases"."PurchaseReturns"
  ADD CONSTRAINT "purchaseReturnWarehouseIdFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id);
ALTER TABLE "Purchases"."PurchaseReturns"
  ADD CONSTRAINT "purchaseReturnCashAccountIdFk" FOREIGN KEY ("tenantId", "cashAccountId") REFERENCES "BankCash"."CashAccounts" ("tenantId", id);
ALTER TABLE "Purchases"."PurchaseReturns"
  ADD CONSTRAINT "purchaseReturnJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "Purchases"."PurchaseReturnLines"
  ADD CONSTRAINT "purchaseReturnLineItemIdFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id);
ALTER TABLE "Purchases"."PurchaseReturnLines"
  ADD CONSTRAINT "purchaseReturnLineBatchIdFk" FOREIGN KEY ("tenantId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", id);
ALTER TABLE "Purchases"."PurchaseReturnLines"
  ADD CONSTRAINT "purchaseReturnLineTaxCodeIdFk" FOREIGN KEY ("tenantId", "taxCodeId") REFERENCES "Tax"."TaxCodes" ("tenantId", id);

-- landed cost ---------------------------------------------------------------
ALTER TABLE "Purchases"."LandedCostShipments"
  ADD CONSTRAINT "landedCostShipmentBankAccountIdFk" FOREIGN KEY ("tenantId", "bankAccountId") REFERENCES "BankCash"."BankAccounts" ("tenantId", id);
ALTER TABLE "Purchases"."LandedCostShipments"
  ADD CONSTRAINT "landedCostShipmentJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "Purchases"."LandedCostItems"
  ADD CONSTRAINT "landedCostItemItemIdFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id);
ALTER TABLE "Purchases"."LandedCostCharges"
  ADD CONSTRAINT "landedCostChargeClaimAccountIdFk" FOREIGN KEY ("tenantId", "claimAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
