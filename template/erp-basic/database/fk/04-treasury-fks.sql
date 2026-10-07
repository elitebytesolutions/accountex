-- =============================================================================
-- Finsoft ERP (BASIC) — fk/04-treasury-fks.sql
-- Cross-module foreign keys of the treasury schema (contract §3).
-- Runs after every schema file (00 … 09), before 90-views.
-- All FKs are composite (tenantId, x_id) → (tenantId, id).
-- =============================================================================

-- GL accounts ---------------------------------------------------------------
ALTER TABLE "BankCash"."BankAccounts"
  ADD CONSTRAINT "bankAccountAccountIdFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "BankCash"."CashAccounts"
  ADD CONSTRAINT "cashAccountAccountIdFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "BankCash"."CashCategories"
  ADD CONSTRAINT "cashCategoryDefaultAccountIdFk" FOREIGN KEY ("tenantId", "defaultAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "BankCash"."Cheques"
  ADD CONSTRAINT "chequeAccountIdFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);

-- Journals ------------------------------------------------------------------
ALTER TABLE "BankCash"."Cheques"
  ADD CONSTRAINT "chequeJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "BankCash"."Cheques"
  ADD CONSTRAINT "chequeClearingJournalEntryIdFk" FOREIGN KEY ("tenantId", "clearingJournalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "BankCash"."ChequeBounces"
  ADD CONSTRAINT "chequeBounceReversalJournalEntryIdFk" FOREIGN KEY ("tenantId", "reversalJournalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "BankCash"."ChequeBounces"
  ADD CONSTRAINT "chequeBounceChargesJournalEntryIdFk" FOREIGN KEY ("tenantId", "chargesJournalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "BankCash"."BankTransactions"
  ADD CONSTRAINT "bankTransactionJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "BankCash"."CashBookEntries"
  ADD CONSTRAINT "cashbookEntryJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "BankCash"."CashDayCloses"
  ADD CONSTRAINT "cashDayCloseVarianceJournalEntryIdFk" FOREIGN KEY ("tenantId", "varianceJournalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);

-- Parties -------------------------------------------------------------------
ALTER TABLE "BankCash"."Cheques"
  ADD CONSTRAINT "chequeCustomerIdFk" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Sales"."Customers" ("tenantId", id);
ALTER TABLE "BankCash"."Cheques"
  ADD CONSTRAINT "chequeVendorIdFk" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "Purchases"."Vendors" ("tenantId", id);
ALTER TABLE "BankCash"."CashBookEntries"
  ADD CONSTRAINT "cashbookEntryCustomerIdFk" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Sales"."Customers" ("tenantId", id);
ALTER TABLE "BankCash"."CashBookEntries"
  ADD CONSTRAINT "cashbookEntryVendorIdFk" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "Purchases"."Vendors" ("tenantId", id);

-- Settlement documents ------------------------------------------------------
ALTER TABLE "BankCash"."ChequeAllocations"
  ADD CONSTRAINT "chequeAllocationInvoiceIdFk" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "Sales"."SalesInvoices" ("tenantId", id);
ALTER TABLE "BankCash"."ChequeAllocations"
  ADD CONSTRAINT "chequeAllocationBillIdFk" FOREIGN KEY ("tenantId", "billId") REFERENCES "Purchases"."VendorBills" ("tenantId", id);
