-- =============================================================================
-- Finsoft ERP (BASIC) — fk/07-sales-fks.sql
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
