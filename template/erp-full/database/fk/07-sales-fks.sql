-- =============================================================================
-- Finsoft ERP (FULL) — fk/07-sales-fks.sql  (= Basic file + FULL section at the end)
-- Cross-module foreign keys for the sales schema (contract §3).
-- Runs after every schema file: targets inv.*, acc.*, tax.*, treasury.*.
-- All composite (tenantId, x_id) → (tenantId, id).
-- =============================================================================

-- PriceListItems ------------------------------------------------------------
ALTER TABLE "Sales"."PriceListItems"
  ADD CONSTRAINT "priceListItemItemIdFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id);

-- customer ---------------------------------------------------------------------
ALTER TABLE "Sales"."Customers"
  ADD CONSTRAINT "customerReceivableAccountIdFk" FOREIGN KEY ("tenantId", "receivableAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);

-- QuotationLines -----------------------------------------------------------------
ALTER TABLE "Sales"."QuotationLines"
  ADD CONSTRAINT "quotationLineItemIdFk"     FOREIGN KEY ("tenantId", "itemId")     REFERENCES "Inventory"."Products" ("tenantId", id),
  ADD CONSTRAINT "quotationLineTaxCodeIdFk" FOREIGN KEY ("tenantId", "taxCodeId") REFERENCES "Tax"."TaxCodes" ("tenantId", id);

-- SalesOrders / SalesOrderLines -------------------------------------------------
ALTER TABLE "Sales"."SalesOrders"
  ADD CONSTRAINT "salesOrderWarehouseIdFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id);

ALTER TABLE "Sales"."SalesOrderLines"
  ADD CONSTRAINT "salesOrderLineItemIdFk"     FOREIGN KEY ("tenantId", "itemId")     REFERENCES "Inventory"."Products" ("tenantId", id),
  ADD CONSTRAINT "salesOrderLineTaxCodeIdFk" FOREIGN KEY ("tenantId", "taxCodeId") REFERENCES "Tax"."TaxCodes" ("tenantId", id);

-- invoice / SalesInvoiceLines -------------------------------------------------------
ALTER TABLE "Sales"."SalesInvoices"
  ADD CONSTRAINT "invoiceWarehouseIdFk"              FOREIGN KEY ("tenantId", "warehouseId")              REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  ADD CONSTRAINT "invoiceJournalEntryIdFk"          FOREIGN KEY ("tenantId", "journalEntryId")          REFERENCES "Accounting"."Vouchers" ("tenantId", id),
  ADD CONSTRAINT "invoiceReversalJournalEntryIdFk" FOREIGN KEY ("tenantId", "reversalJournalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);

ALTER TABLE "Sales"."SalesInvoiceLines"
  ADD CONSTRAINT "invoiceLineItemIdFk"            FOREIGN KEY ("tenantId", "itemId")            REFERENCES "Inventory"."Products" ("tenantId", id),
  ADD CONSTRAINT "invoiceLineBatchIdFk"           FOREIGN KEY ("tenantId", "batchId")           REFERENCES "Inventory"."ProductBatches" ("tenantId", id),
  ADD CONSTRAINT "invoiceLineTaxCodeIdFk"        FOREIGN KEY ("tenantId", "taxCodeId")        REFERENCES "Tax"."TaxCodes" ("tenantId", id),
  ADD CONSTRAINT "invoiceLineRevenueAccountIdFk" FOREIGN KEY ("tenantId", "revenueAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);

-- CreditNotes / CreditNoteLines --------------------------------------------------
ALTER TABLE "Sales"."CreditNotes"
  ADD CONSTRAINT "creditNoteReturnWarehouseIdFk" FOREIGN KEY ("tenantId", "returnWarehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  ADD CONSTRAINT "creditNoteJournalEntryIdFk"    FOREIGN KEY ("tenantId", "journalEntryId")    REFERENCES "Accounting"."Vouchers" ("tenantId", id);

ALTER TABLE "Sales"."CreditNoteLines"
  ADD CONSTRAINT "creditNoteLineItemIdFk"     FOREIGN KEY ("tenantId", "itemId")     REFERENCES "Inventory"."Products" ("tenantId", id),
  ADD CONSTRAINT "creditNoteLineBatchIdFk"    FOREIGN KEY ("tenantId", "batchId")    REFERENCES "Inventory"."ProductBatches" ("tenantId", id),
  ADD CONSTRAINT "creditNoteLineTaxCodeIdFk" FOREIGN KEY ("tenantId", "taxCodeId") REFERENCES "Tax"."TaxCodes" ("tenantId", id);

-- receipt ------------------------------------------------------------------------
ALTER TABLE "Sales"."CustomerReceipts"
  ADD CONSTRAINT "receiptBankAccountIdFk"         FOREIGN KEY ("tenantId", "bankAccountId")         REFERENCES "BankCash"."BankAccounts" ("tenantId", id),
  ADD CONSTRAINT "receiptCashAccountIdFk"         FOREIGN KEY ("tenantId", "cashAccountId")         REFERENCES "BankCash"."CashAccounts" ("tenantId", id),
  ADD CONSTRAINT "receiptChequeIdFk"               FOREIGN KEY ("tenantId", "chequeId")               REFERENCES "BankCash"."Cheques" ("tenantId", id),
  ADD CONSTRAINT "receiptJournalEntryIdFk"        FOREIGN KEY ("tenantId", "journalEntryId")        REFERENCES "Accounting"."Vouchers" ("tenantId", id),
  ADD CONSTRAINT "receiptBounceJournalEntryIdFk" FOREIGN KEY ("tenantId", "bounceJournalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);

-- Supporting indexes for the FK columns not already indexed in 07-sales.sql
CREATE INDEX IF NOT EXISTS "invoiceJournalEntryIdx"     ON "Sales"."SalesInvoices" ("tenantId", "journalEntryId") WHERE "journalEntryId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "creditNoteJournalEntryIdx" ON "Sales"."CreditNotes" ("tenantId", "journalEntryId") WHERE "journalEntryId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "receiptJournalEntryIdx"     ON "Sales"."CustomerReceipts" ("tenantId", "journalEntryId") WHERE "journalEntryId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "customerReceivableAcctIdx"  ON "Sales"."Customers" ("tenantId", "receivableAccountId");

-- #############################################################################
-- FULL-ONLY cross-module FKs (HumanResources.Employees, Distribution.Routes, Distribution.Vans, and the
-- Full sales tables' inv / tax / treasury / acc targets)
-- #############################################################################

-- invoice: distribution & sales team
ALTER TABLE "Sales"."SalesInvoices"
  ADD CONSTRAINT "invoiceRouteIdFk"                FOREIGN KEY ("tenantId", "routeId")                REFERENCES "Distribution"."Routes" ("tenantId", id),
  ADD CONSTRAINT "invoiceBookerEmployeeIdFk"      FOREIGN KEY ("tenantId", "bookerEmployeeId")      REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "invoiceDeliverymanEmployeeIdFk" FOREIGN KEY ("tenantId", "deliverymanEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "invoiceSalesmanEmployeeIdFk"    FOREIGN KEY ("tenantId", "salesmanEmployeeId")    REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "invoiceSupervisorEmployeeIdFk"  FOREIGN KEY ("tenantId", "supervisorEmployeeId")  REFERENCES "HumanResources"."Employees" ("tenantId", id);

-- PriceListQuantityBreaks / SalesSchemeItems
ALTER TABLE "Sales"."PriceListQuantityBreaks"
  ADD CONSTRAINT "quantityBreakItemIdFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id);
ALTER TABLE "Sales"."SalesSchemeItems"
  ADD CONSTRAINT "schemeItemItemIdFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id);

-- DeliveryChallans / DeliveryChallanLines
ALTER TABLE "Sales"."DeliveryChallans"
  ADD CONSTRAINT "deliveryChallanWarehouseIdFk"       FOREIGN KEY ("tenantId", "warehouseId")       REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  ADD CONSTRAINT "deliveryChallanVehicleIdFk"         FOREIGN KEY ("tenantId", "vehicleId")         REFERENCES "Distribution"."Vans" ("tenantId", id),
  ADD CONSTRAINT "deliveryChallanDriverEmployeeIdFk" FOREIGN KEY ("tenantId", "driverEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "deliveryChallanJournalEntryIdFk"   FOREIGN KEY ("tenantId", "journalEntryId")   REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "Sales"."DeliveryChallanLines"
  ADD CONSTRAINT "deliveryChallanLineItemIdFk"  FOREIGN KEY ("tenantId", "itemId")  REFERENCES "Inventory"."Products" ("tenantId", id),
  ADD CONSTRAINT "deliveryChallanLineBatchIdFk" FOREIGN KEY ("tenantId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", id);

-- SalesReturns / SalesReturnLines
ALTER TABLE "Sales"."SalesReturns"
  ADD CONSTRAINT "salesReturnWarehouseIdFk"            FOREIGN KEY ("tenantId", "warehouseId")            REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  ADD CONSTRAINT "salesReturnBookerEmployeeIdFk"      FOREIGN KEY ("tenantId", "bookerEmployeeId")      REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "salesReturnDeliverymanEmployeeIdFk" FOREIGN KEY ("tenantId", "deliverymanEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  ADD CONSTRAINT "salesReturnJournalEntryIdFk"        FOREIGN KEY ("tenantId", "journalEntryId")        REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "Sales"."SalesReturnLines"
  ADD CONSTRAINT "salesReturnLineItemIdFk"     FOREIGN KEY ("tenantId", "itemId")     REFERENCES "Inventory"."Products" ("tenantId", id),
  ADD CONSTRAINT "salesReturnLineBatchIdFk"    FOREIGN KEY ("tenantId", "batchId")    REFERENCES "Inventory"."ProductBatches" ("tenantId", id),
  ADD CONSTRAINT "salesReturnLineTaxCodeIdFk" FOREIGN KEY ("tenantId", "taxCodeId") REFERENCES "Tax"."TaxCodes" ("tenantId", id);

-- POS
ALTER TABLE "Sales"."PosShifts"
  ADD CONSTRAINT "posShiftWarehouseIdFk"     FOREIGN KEY ("tenantId", "warehouseId")     REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  ADD CONSTRAINT "posShiftCashAccountIdFk"  FOREIGN KEY ("tenantId", "cashAccountId")  REFERENCES "BankCash"."CashAccounts" ("tenantId", id),
  ADD CONSTRAINT "posShiftJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);

-- credit control
ALTER TABLE "Sales"."CreditHoldEvents"
  ADD CONSTRAINT "creditHoldEventChequeIdFk" FOREIGN KEY ("tenantId", "chequeId") REFERENCES "BankCash"."Cheques" ("tenantId", id);

-- recurring invoices
ALTER TABLE "Sales"."RecurringInvoices"
  ADD CONSTRAINT "recurringInvoiceProfileWarehouseIdFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id);
ALTER TABLE "Sales"."RecurringInvoiceLines"
  ADD CONSTRAINT "recurringInvoiceLineItemIdFk"     FOREIGN KEY ("tenantId", "itemId")     REFERENCES "Inventory"."Products" ("tenantId", id),
  ADD CONSTRAINT "recurringInvoiceLineTaxCodeIdFk" FOREIGN KEY ("tenantId", "taxCodeId") REFERENCES "Tax"."TaxCodes" ("tenantId", id);

CREATE INDEX IF NOT EXISTS "deliveryChallanDriverIdx" ON "Sales"."DeliveryChallans" ("tenantId", "driverEmployeeId") WHERE "driverEmployeeId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "creditHoldEventChequeIdx" ON "Sales"."CreditHoldEvents" ("tenantId", "chequeId") WHERE "chequeId" IS NOT NULL;
