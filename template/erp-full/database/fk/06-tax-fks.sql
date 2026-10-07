-- =============================================================================
-- Finsoft ERP (FULL) — fk/06-tax-fks.sql
-- Cross-module foreign keys of the tax schema (contract §3).
-- =============================================================================

ALTER TABLE "Tax"."TaxCodes"
  ADD CONSTRAINT "taxCodeAccountIdFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "Tax"."TaxCodes"
  ADD CONSTRAINT "taxCodeInputAccountIdFk" FOREIGN KEY ("tenantId", "inputAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);

-- =============================================================================
-- FULL EDITION
-- =============================================================================

-- Sales tax return ----------------------------------------------------------
ALTER TABLE "Tax"."SalesTaxReturns"
  ADD CONSTRAINT "salesTaxReturnFiscalPeriodIdFk" FOREIGN KEY ("tenantId", "fiscalPeriodId") REFERENCES "Accounting"."FiscalPeriods" ("tenantId", id);
ALTER TABLE "Tax"."SalesTaxReturns"
  ADD CONSTRAINT "salesTaxReturnPaidFromBankAccountIdFk" FOREIGN KEY ("tenantId", "paidFromBankAccountId") REFERENCES "BankCash"."BankAccounts" ("tenantId", id);
ALTER TABLE "Tax"."SalesTaxReturns"
  ADD CONSTRAINT "salesTaxReturnPaymentJournalEntryIdFk" FOREIGN KEY ("tenantId", "paymentJournalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "Tax"."SalesTaxReturnLines"
  ADD CONSTRAINT "salesTaxAnnexLineCustomerIdFk" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Sales"."Customers" ("tenantId", id);
ALTER TABLE "Tax"."SalesTaxReturnLines"
  ADD CONSTRAINT "salesTaxAnnexLineVendorIdFk" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "Purchases"."Vendors" ("tenantId", id);
ALTER TABLE "Tax"."SalesTaxReturnLines"
  ADD CONSTRAINT "salesTaxAnnexLineInvoiceIdFk" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "Sales"."SalesInvoices" ("tenantId", id);
ALTER TABLE "Tax"."SalesTaxReturnLines"
  ADD CONSTRAINT "salesTaxAnnexLineCreditNoteIdFk" FOREIGN KEY ("tenantId", "creditNoteId") REFERENCES "Sales"."CreditNotes" ("tenantId", id);
ALTER TABLE "Tax"."SalesTaxReturnLines"
  ADD CONSTRAINT "salesTaxAnnexLineBillIdFk" FOREIGN KEY ("tenantId", "billId") REFERENCES "Purchases"."VendorBills" ("tenantId", id);
ALTER TABLE "Tax"."SalesTaxReturnLines"
  ADD CONSTRAINT "salesTaxAnnexLineDebitNoteIdFk" FOREIGN KEY ("tenantId", "debitNoteId") REFERENCES "Purchases"."DebitNotes" ("tenantId", id);
ALTER TABLE "Tax"."SalesTaxReturnLines"
  ADD CONSTRAINT "salesTaxAnnexLineItemIdFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id);

-- Withholding ---------------------------------------------------------------
ALTER TABLE "Tax"."WhtChallans"
  ADD CONSTRAINT "whtPaymentBankAccountIdFk" FOREIGN KEY ("tenantId", "bankAccountId") REFERENCES "BankCash"."BankAccounts" ("tenantId", id);
ALTER TABLE "Tax"."WhtChallans"
  ADD CONSTRAINT "whtPaymentJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "Tax"."WhtCertificates"
  ADD CONSTRAINT "whtCertificateVendorIdFk" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "Purchases"."Vendors" ("tenantId", id);
ALTER TABLE "Tax"."WhtCertificates"
  ADD CONSTRAINT "whtCertificateCustomerIdFk" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Sales"."Customers" ("tenantId", id);
ALTER TABLE "Tax"."WhtCertificates"
  ADD CONSTRAINT "whtCertificateEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "Tax"."WhtDeductions"
  ADD CONSTRAINT "whtDeductionVendorIdFk" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "Purchases"."Vendors" ("tenantId", id);
ALTER TABLE "Tax"."WhtDeductions"
  ADD CONSTRAINT "whtDeductionCustomerIdFk" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Sales"."Customers" ("tenantId", id);
ALTER TABLE "Tax"."WhtDeductions"
  ADD CONSTRAINT "whtDeductionEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "Tax"."WhtDeductions"
  ADD CONSTRAINT "whtDeductionJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "Tax"."WhtStatements"
  ADD CONSTRAINT "whtReturnFiscalYearIdFk" FOREIGN KEY ("tenantId", "fiscalYearId") REFERENCES "Accounting"."FiscalYears" ("tenantId", id);

-- FBR -------------------------------------------------------------------------
ALTER TABLE "Tax"."FbrInvoiceSubmissions"
  ADD CONSTRAINT "fbrSubmissionInvoiceIdFk" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "Sales"."SalesInvoices" ("tenantId", id);
ALTER TABLE "Tax"."FbrInvoiceSubmissions"
  ADD CONSTRAINT "fbrSubmissionCreditNoteIdFk" FOREIGN KEY ("tenantId", "creditNoteId") REFERENCES "Sales"."CreditNotes" ("tenantId", id);
