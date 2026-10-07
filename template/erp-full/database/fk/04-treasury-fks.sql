-- =============================================================================
-- Finsoft ERP (FULL) — fk/04-treasury-fks.sql
-- Cross-module foreign keys of the treasury schema (contract §3).
-- Runs after every schema file (00 … 14), before 90-views.
-- The Basic block is identical to erp-basic; Full-only FKs follow it.
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

-- =============================================================================
-- FULL EDITION
-- =============================================================================

-- Columns appended to Basic tables ----------------------------------------
ALTER TABLE "BankCash"."ChequeBounces"
  ADD CONSTRAINT "chequeBounceCreditHoldEventIdFk" FOREIGN KEY ("tenantId", "creditHoldEventId") REFERENCES "Sales"."CreditHoldEvents" ("tenantId", id);
ALTER TABLE "BankCash"."CashBookEntries"
  ADD CONSTRAINT "cashbookEntryEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id);

-- Bulk cheque voucher -----------------------------------------------------
ALTER TABLE "BankCash"."ChequeBatchLines"
  ADD CONSTRAINT "chequeBatchLineCustomerIdFk" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Sales"."Customers" ("tenantId", id);
ALTER TABLE "BankCash"."ChequeBatchLines"
  ADD CONSTRAINT "chequeBatchLineVendorIdFk" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "Purchases"."Vendors" ("tenantId", id);

-- Statement import, rules, reconciliation ---------------------------------
ALTER TABLE "BankCash"."BankStatementLines"
  ADD CONSTRAINT "statementLineCategoryAccountIdFk" FOREIGN KEY ("tenantId", "categoryAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "BankCash"."BankStatementLines"
  ADD CONSTRAINT "statementLineCostCentreIdFk" FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id);
ALTER TABLE "BankCash"."BankStatementLines"
  ADD CONSTRAINT "statementLineMatchedInvoiceIdFk" FOREIGN KEY ("tenantId", "matchedInvoiceId") REFERENCES "Sales"."SalesInvoices" ("tenantId", id);
ALTER TABLE "BankCash"."BankStatementLines"
  ADD CONSTRAINT "statementLineJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "BankCash"."BankRules"
  ADD CONSTRAINT "bankRuleAccountIdFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "BankCash"."BankRules"
  ADD CONSTRAINT "bankRuleCostCentreIdFk" FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id);
ALTER TABLE "BankCash"."BankReconciliationMatches"
  ADD CONSTRAINT "reconciliationMatchJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "BankCash"."BankReconciliationMatches"
  ADD CONSTRAINT "reconciliationMatchAdjustmentJournalEntryIdFk" FOREIGN KEY ("tenantId", "adjustmentJournalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);

-- Petty cash ----------------------------------------------------------------
ALTER TABLE "BankCash"."ExpenseCategories"
  ADD CONSTRAINT "expenseCategoryAccountIdFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "BankCash"."PettyCashFunds"
  ADD CONSTRAINT "pettyCashFundCustodianEmployeeIdFk" FOREIGN KEY ("tenantId", "custodianEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "BankCash"."PettyCashReplenishments"
  ADD CONSTRAINT "pettyReplenishmentJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "BankCash"."PettyCashVouchers"
  ADD CONSTRAINT "pettyCashVoucherAccountIdFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "BankCash"."PettyCashVouchers"
  ADD CONSTRAINT "pettyCashVoucherCostCentreIdFk" FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id);

-- Expense claims ------------------------------------------------------------
ALTER TABLE "BankCash"."ExpenseClaims"
  ADD CONSTRAINT "expenseClaimEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "BankCash"."ExpenseClaims"
  ADD CONSTRAINT "expenseClaimCostCentreIdFk" FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id);
ALTER TABLE "BankCash"."ExpenseClaims"
  ADD CONSTRAINT "expenseClaimProjectIdFk" FOREIGN KEY ("tenantId", "projectId") REFERENCES "Accounting"."Projects" ("tenantId", id);
ALTER TABLE "BankCash"."ExpenseClaims"
  ADD CONSTRAINT "expenseClaimCustomerIdFk" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Sales"."Customers" ("tenantId", id);
ALTER TABLE "BankCash"."ExpenseClaims"
  ADD CONSTRAINT "expenseClaimChargeAccountIdFk" FOREIGN KEY ("tenantId", "chargeAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "BankCash"."ExpenseClaims"
  ADD CONSTRAINT "expenseClaimPayrollRunIdFk" FOREIGN KEY ("tenantId", "payrollRunId") REFERENCES "Payroll"."PayrollRuns" ("tenantId", id);
ALTER TABLE "BankCash"."ExpenseClaims"
  ADD CONSTRAINT "expenseClaimApprovalJournalEntryIdFk" FOREIGN KEY ("tenantId", "approvalJournalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "BankCash"."ExpenseClaims"
  ADD CONSTRAINT "expenseClaimPaymentJournalEntryIdFk" FOREIGN KEY ("tenantId", "paymentJournalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "BankCash"."ExpenseClaimLines"
  ADD CONSTRAINT "expenseClaimLineAccountIdFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "BankCash"."ExpenseClaimLines"
  ADD CONSTRAINT "expenseClaimLineCostCentreIdFk" FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id);
