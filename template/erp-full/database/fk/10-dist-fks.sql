-- =============================================================================
-- Finsoft ERP (FULL) — fk/10-dist-fks.sql
-- Cross-module foreign keys for schema dist (see CONTRACT.md §3).
-- Runs after every schema file (00 … 14), so all targets exist.
-- All tenant FKs are composite (tenantId, x_id) -> (tenantId, id).
-- Targets: Sales.Customers, Sales.SalesInvoices, Sales.SalesInvoiceLines, Sales.CustomerReceipts,
--          Sales.SalesReturns, Sales.SalesSchemes, Sales.CreditOverrides,
--          Inventory.Products, Inventory.Warehouses, Inventory.ProductBatches, Inventory.StockTransfers,
--          Purchases.GoodsReceivedNotes, Purchases.GoodsReceivedNoteLines, HumanResources.Employees, Accounting.Vouchers,
--          Accounting.FiscalPeriods, BankCash.Banks, BankCash.BankAccounts,
--          BankCash.CashAccounts, BankCash.Cheques
-- =============================================================================

-- ---------------------------------------------------------------------------
-- vehicle / route
-- ---------------------------------------------------------------------------
ALTER TABLE "Distribution"."Vans"
  ADD CONSTRAINT "vehicleWarehouseIdFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  ADD CONSTRAINT "vehicleDefaultDriverEmployeeIdFk" FOREIGN KEY ("tenantId", "defaultDriverEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id);

ALTER TABLE "Distribution"."Routes"
  ADD CONSTRAINT "routeSourceWarehouseIdFk"    FOREIGN KEY ("tenantId", "sourceWarehouseId")    REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  ADD CONSTRAINT "routeBookerEmployeeIdFk"     FOREIGN KEY ("tenantId", "bookerEmployeeId")     REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "routeSalesmanEmployeeIdFk"   FOREIGN KEY ("tenantId", "salesmanEmployeeId")   REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "routeDriverEmployeeIdFk"     FOREIGN KEY ("tenantId", "driverEmployeeId")     REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "routeSupervisorEmployeeIdFk" FOREIGN KEY ("tenantId", "supervisorEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id);

ALTER TABLE "Distribution"."ShopRouteProfiles"
  ADD CONSTRAINT "customerRouteCustomerIdFk" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Sales"."Customers" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- Quick wholesale entry
-- ---------------------------------------------------------------------------
ALTER TABLE "Distribution"."HeldBills"
  ADD CONSTRAINT "heldBillCustomerIdFk"          FOREIGN KEY ("tenantId", "customerId")          REFERENCES "Sales"."Customers" ("tenantId", id),
  ADD CONSTRAINT "heldBillSalesmanEmployeeIdFk" FOREIGN KEY ("tenantId", "salesmanEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "heldBillWarehouseIdFk"         FOREIGN KEY ("tenantId", "warehouseId")         REFERENCES "Inventory"."Warehouses" ("tenantId", id);

ALTER TABLE "Distribution"."HeldBillLines"
  ADD CONSTRAINT "heldBillLineItemIdFk"   FOREIGN KEY ("tenantId", "itemId")   REFERENCES "Inventory"."Products" ("tenantId", id),
  ADD CONSTRAINT "heldBillLineSchemeIdFk" FOREIGN KEY ("tenantId", "schemeId") REFERENCES "Sales"."SalesSchemes" ("tenantId", id);

ALTER TABLE "Distribution"."OrderTemplates"
  ADD CONSTRAINT "orderTemplateCustomerIdFk" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Sales"."Customers" ("tenantId", id);

ALTER TABLE "Distribution"."OrderTemplateLines"
  ADD CONSTRAINT "orderTemplateLineItemIdFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id);

ALTER TABLE "Distribution"."CreditOverrideLogs"
  ADD CONSTRAINT "creditOverrideLogCustomerIdFk"        FOREIGN KEY ("tenantId", "customerId")        REFERENCES "Sales"."Customers" ("tenantId", id),
  ADD CONSTRAINT "creditOverrideLogInvoiceIdFk"         FOREIGN KEY ("tenantId", "invoiceId")         REFERENCES "Sales"."SalesInvoices" ("tenantId", id),
  ADD CONSTRAINT "creditOverrideLogCreditOverrideIdFk" FOREIGN KEY ("tenantId", "creditOverrideId") REFERENCES "Sales"."CreditOverrides" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- Bulk invoicing
-- ---------------------------------------------------------------------------
ALTER TABLE "Distribution"."BulkInvoiceRuns"
  ADD CONSTRAINT "bulkInvoiceBatchWarehouseIdFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id);

ALTER TABLE "Distribution"."BulkInvoiceRunCells"
  ADD CONSTRAINT "bulkInvoiceCellCustomerIdFk"     FOREIGN KEY ("tenantId", "customerId")     REFERENCES "Sales"."Customers" ("tenantId", id),
  ADD CONSTRAINT "bulkInvoiceCellItemIdFk"         FOREIGN KEY ("tenantId", "itemId")         REFERENCES "Inventory"."Products" ("tenantId", id),
  ADD CONSTRAINT "bulkInvoiceCellInvoiceIdFk"      FOREIGN KEY ("tenantId", "invoiceId")      REFERENCES "Sales"."SalesInvoices" ("tenantId", id),
  ADD CONSTRAINT "bulkInvoiceCellInvoiceLineIdFk" FOREIGN KEY ("tenantId", "invoiceLineId") REFERENCES "Sales"."SalesInvoiceLines" ("tenantId", id);

ALTER TABLE "Distribution"."BulkInvoiceSkippedShops"
  ADD CONSTRAINT "bulkInvoiceSkipCustomerIdFk" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Sales"."Customers" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- Order bookings
-- ---------------------------------------------------------------------------
ALTER TABLE "Distribution"."OrderBookings"
  ADD CONSTRAINT "orderBookingBookerEmployeeIdFk" FOREIGN KEY ("tenantId", "bookerEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "orderBookingCustomerIdFk"        FOREIGN KEY ("tenantId", "customerId")        REFERENCES "Sales"."Customers" ("tenantId", id),
  ADD CONSTRAINT "orderBookingWarehouseIdFk"       FOREIGN KEY ("tenantId", "warehouseId")       REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  ADD CONSTRAINT "orderBookingInvoiceIdFk"         FOREIGN KEY ("tenantId", "invoiceId")         REFERENCES "Sales"."SalesInvoices" ("tenantId", id);

ALTER TABLE "Distribution"."OrderBookingLines"
  ADD CONSTRAINT "orderBookingLineItemIdFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- Back-orders
-- ---------------------------------------------------------------------------
ALTER TABLE "Distribution"."BackOrders"
  ADD CONSTRAINT "backorderLineSourceInvoiceIdFk" FOREIGN KEY ("tenantId", "sourceInvoiceId") REFERENCES "Sales"."SalesInvoices" ("tenantId", id),
  ADD CONSTRAINT "backorderLineCustomerIdFk"       FOREIGN KEY ("tenantId", "customerId")       REFERENCES "Sales"."Customers" ("tenantId", id),
  ADD CONSTRAINT "backorderLineItemIdFk"           FOREIGN KEY ("tenantId", "itemId")           REFERENCES "Inventory"."Products" ("tenantId", id),
  ADD CONSTRAINT "backorderLineLastInvoiceIdFk"   FOREIGN KEY ("tenantId", "lastInvoiceId")   REFERENCES "Sales"."SalesInvoices" ("tenantId", id);

ALTER TABLE "Distribution"."BackOrderAllocations"
  ADD CONSTRAINT "backorderAllocationGrnIdFk"      FOREIGN KEY ("tenantId", "grnId")      REFERENCES "Purchases"."GoodsReceivedNotes" ("tenantId", id),
  ADD CONSTRAINT "backorderAllocationGrnLineIdFk" FOREIGN KEY ("tenantId", "grnLineId") REFERENCES "Purchases"."GoodsReceivedNoteLines" ("tenantId", id),
  ADD CONSTRAINT "backorderAllocationBatchIdFk"    FOREIGN KEY ("tenantId", "batchId")    REFERENCES "Inventory"."ProductBatches" ("tenantId", id),
  ADD CONSTRAINT "backorderAllocationInvoiceIdFk"  FOREIGN KEY ("tenantId", "invoiceId")  REFERENCES "Sales"."SalesInvoices" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- Delivery runs / load sheets
-- ---------------------------------------------------------------------------
ALTER TABLE "Distribution"."LoadSheets"
  ADD CONSTRAINT "deliveryRunDriverEmployeeIdFk"   FOREIGN KEY ("tenantId", "driverEmployeeId")   REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "deliveryRunSalesmanEmployeeIdFk" FOREIGN KEY ("tenantId", "salesmanEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "deliveryRunSourceWarehouseIdFk"  FOREIGN KEY ("tenantId", "sourceWarehouseId")  REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  ADD CONSTRAINT "deliveryRunVanWarehouseIdFk"     FOREIGN KEY ("tenantId", "vanWarehouseId")     REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  ADD CONSTRAINT "deliveryRunStockTransferIdFk"    FOREIGN KEY ("tenantId", "stockTransferId")    REFERENCES "Inventory"."StockTransfers" ("tenantId", id);

ALTER TABLE "Distribution"."LoadSheetInvoices"
  ADD CONSTRAINT "runInvoiceInvoiceIdFk"  FOREIGN KEY ("tenantId", "invoiceId")  REFERENCES "Sales"."SalesInvoices" ("tenantId", id),
  ADD CONSTRAINT "runInvoiceCustomerIdFk" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Sales"."Customers" ("tenantId", id);

ALTER TABLE "Distribution"."LoadSheetLines"
  ADD CONSTRAINT "loadSheetLineItemIdFk"  FOREIGN KEY ("tenantId", "itemId")  REFERENCES "Inventory"."Products" ("tenantId", id),
  ADD CONSTRAINT "loadSheetLineBatchIdFk" FOREIGN KEY ("tenantId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- Route settlement
-- ---------------------------------------------------------------------------
ALTER TABLE "Distribution"."RouteSettlements"
  ADD CONSTRAINT "runSettlementSalesmanEmployeeIdFk" FOREIGN KEY ("tenantId", "salesmanEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "runSettlementCashAccountIdFk"      FOREIGN KEY ("tenantId", "cashAccountId")      REFERENCES "BankCash"."CashAccounts" ("tenantId", id),
  ADD CONSTRAINT "runSettlementReturnTransferIdFk"   FOREIGN KEY ("tenantId", "returnTransferId")   REFERENCES "Inventory"."StockTransfers" ("tenantId", id),
  ADD CONSTRAINT "runSettlementJournalEntryIdFk"     FOREIGN KEY ("tenantId", "journalEntryId")     REFERENCES "Accounting"."Vouchers" ("tenantId", id);

ALTER TABLE "Distribution"."RouteSettlementLines"
  ADD CONSTRAINT "settlementLineInvoiceIdFk"      FOREIGN KEY ("tenantId", "invoiceId")      REFERENCES "Sales"."SalesInvoices" ("tenantId", id),
  ADD CONSTRAINT "settlementLineCustomerIdFk"     FOREIGN KEY ("tenantId", "customerId")     REFERENCES "Sales"."Customers" ("tenantId", id),
  ADD CONSTRAINT "settlementLineReceiptIdFk"      FOREIGN KEY ("tenantId", "receiptId")      REFERENCES "Sales"."CustomerReceipts" ("tenantId", id),
  ADD CONSTRAINT "settlementLineSalesReturnIdFk" FOREIGN KEY ("tenantId", "salesReturnId") REFERENCES "Sales"."SalesReturns" ("tenantId", id);

ALTER TABLE "Distribution"."RouteSettlementCheques"
  ADD CONSTRAINT "settlementChequeBankIdFk"   FOREIGN KEY ("tenantId", "bankId")   REFERENCES "BankCash"."Banks" ("tenantId", id),
  ADD CONSTRAINT "settlementChequeChequeIdFk" FOREIGN KEY ("tenantId", "chequeId") REFERENCES "BankCash"."Cheques" ("tenantId", id);

ALTER TABLE "Distribution"."RouteSettlementReturns"
  ADD CONSTRAINT "settlementReturnInvoiceLineIdFk" FOREIGN KEY ("tenantId", "invoiceLineId") REFERENCES "Sales"."SalesInvoiceLines" ("tenantId", id),
  ADD CONSTRAINT "settlementReturnItemIdFk"         FOREIGN KEY ("tenantId", "itemId")         REFERENCES "Inventory"."Products" ("tenantId", id),
  ADD CONSTRAINT "settlementReturnBatchIdFk"        FOREIGN KEY ("tenantId", "batchId")        REFERENCES "Inventory"."ProductBatches" ("tenantId", id);

ALTER TABLE "Distribution"."VanStockCounts"
  ADD CONSTRAINT "vanStockCountItemIdFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- Recovery
-- ---------------------------------------------------------------------------
ALTER TABLE "Distribution"."RecoverySheets"
  ADD CONSTRAINT "recoverySheetSalesmanEmployeeIdFk" FOREIGN KEY ("tenantId", "salesmanEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id);

ALTER TABLE "Distribution"."RecoverySheetLines"
  ADD CONSTRAINT "recoveryEntryCustomerIdFk"             FOREIGN KEY ("tenantId", "customerId")             REFERENCES "Sales"."Customers" ("tenantId", id),
  ADD CONSTRAINT "recoveryEntryReceiptIdFk"              FOREIGN KEY ("tenantId", "receiptId")              REFERENCES "Sales"."CustomerReceipts" ("tenantId", id),
  ADD CONSTRAINT "recoveryEntryChequeIdFk"               FOREIGN KEY ("tenantId", "chequeId")               REFERENCES "BankCash"."Cheques" ("tenantId", id),
  ADD CONSTRAINT "recoveryEntryDepositBankAccountIdFk" FOREIGN KEY ("tenantId", "depositBankAccountId") REFERENCES "BankCash"."BankAccounts" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- Targets & commission
-- ---------------------------------------------------------------------------
ALTER TABLE "Distribution"."SalesmanTargets"
  ADD CONSTRAINT "salesTargetEmployeeIdFk"      FOREIGN KEY ("tenantId", "employeeId")      REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "salesTargetFiscalPeriodIdFk" FOREIGN KEY ("tenantId", "fiscalPeriodId") REFERENCES "Accounting"."FiscalPeriods" ("tenantId", id);

ALTER TABLE "Distribution"."SalesmanCommissions"
  ADD CONSTRAINT "salesmanCommissionEmployeeIdFk"      FOREIGN KEY ("tenantId", "employeeId")      REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "salesmanCommissionJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);

-- Supporting indexes for FK lookups not already covered in 10-dist.sql
CREATE INDEX "runInvoiceTenantCustomerIdx"       ON "Distribution"."LoadSheetInvoices" ("tenantId", "customerId");
CREATE INDEX "orderBookingTenantInvoiceIdx"      ON "Distribution"."OrderBookings" ("tenantId", "invoiceId") WHERE "invoiceId" IS NOT NULL;
CREATE INDEX "settlementLineTenantReceiptIdx"    ON "Distribution"."RouteSettlementLines" ("tenantId", "receiptId") WHERE "receiptId" IS NOT NULL;
CREATE INDEX "recoveryEntryTenantReceiptIdx"     ON "Distribution"."RecoverySheetLines" ("tenantId", "receiptId") WHERE "receiptId" IS NOT NULL;
CREATE INDEX "backorderLineTenantSrcInvoiceIdx" ON "Distribution"."BackOrders" ("tenantId", "sourceInvoiceId") WHERE "sourceInvoiceId" IS NOT NULL;
CREATE INDEX "salesTargetTenantEmployeeIdx"      ON "Distribution"."SalesmanTargets" ("tenantId", "employeeId", "periodStart" DESC);

-- End of fk/10-dist-fks.sql (69 cross-module FKs)
