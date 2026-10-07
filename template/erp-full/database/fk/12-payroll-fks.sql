-- =============================================================================
-- Finsoft ERP (FULL) — fk/12-payroll-fks.sql
-- Cross-module foreign keys of the payroll schema (contract §3). Runs after
-- every schema file (00 … 14), so hr.*, acc.* and treasury.* already exist.
-- All tenant FKs are composite (tenantId, x_id) → (tenantId, id).
-- Targets: HumanResources.Employees, HumanResources.Grades, HumanResources.Departments, HumanResources.EmployeeBankAccounts,
--          HumanResources.Offboardings, Accounting.ChartOfAccounts, Accounting.CostCentres, Accounting.FiscalPeriods,
--          Accounting.Vouchers, BankCash.BankAccounts, BankCash.CashAccounts
-- =============================================================================

-- ---------------------------------------------------------------------------
-- → HumanResources.Employees
-- ---------------------------------------------------------------------------
ALTER TABLE "Payroll"."EmployeeSalaries"
  ADD CONSTRAINT "employeeSalaryEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "Payroll"."LoansAndAdvances"
  ADD CONSTRAINT "loanEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "Payroll"."PayrollAdjustments"
  ADD CONSTRAINT "payrollInputEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "Payroll"."PayrollRunLines"
  ADD CONSTRAINT "payrollLineEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "Payroll"."Payslips"
  ADD CONSTRAINT "payslipEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "Payroll"."FinalSettlements"
  ADD CONSTRAINT "finalSettlementEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "Payroll"."TaxDeclarations"
  ADD CONSTRAINT "taxDeclarationEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- → HumanResources.Grades / HumanResources.Departments / HumanResources.EmployeeBankAccounts / HumanResources.Offboardings
-- ---------------------------------------------------------------------------
ALTER TABLE "Payroll"."SalaryStructures"
  ADD CONSTRAINT "salaryStructureGradeIdFk" FOREIGN KEY ("tenantId", "gradeId")
  REFERENCES "HumanResources"."Grades" ("tenantId", id);
ALTER TABLE "Payroll"."PayrollRunLines"
  ADD CONSTRAINT "payrollLineGradeIdFk" FOREIGN KEY ("tenantId", "gradeId")
  REFERENCES "HumanResources"."Grades" ("tenantId", id);
ALTER TABLE "Payroll"."PayrollRunLines"
  ADD CONSTRAINT "payrollLineDepartmentIdFk" FOREIGN KEY ("tenantId", "departmentId")
  REFERENCES "HumanResources"."Departments" ("tenantId", id);
ALTER TABLE "Payroll"."FinalSettlements"
  ADD CONSTRAINT "finalSettlementEmployeeBankIdFk" FOREIGN KEY ("tenantId", "employeeBankId")
  REFERENCES "HumanResources"."EmployeeBankAccounts" ("tenantId", id);
ALTER TABLE "Payroll"."FinalSettlements"
  ADD CONSTRAINT "finalSettlementOffboardingIdFk" FOREIGN KEY ("tenantId", "offboardingId")
  REFERENCES "HumanResources"."Offboardings" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- → Accounting.ChartOfAccounts (GL mapping)
-- ---------------------------------------------------------------------------
ALTER TABLE "Payroll"."SalaryComponents"
  ADD CONSTRAINT "salaryComponentDebitAccountIdFk" FOREIGN KEY ("tenantId", "debitAccountId")
  REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "Payroll"."SalaryComponents"
  ADD CONSTRAINT "salaryComponentCreditAccountIdFk" FOREIGN KEY ("tenantId", "creditAccountId")
  REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "Payroll"."PayrollRuns"
  ADD CONSTRAINT "payrollRunSalaryPayableAccountIdFk" FOREIGN KEY ("tenantId", "salaryPayableAccountId")
  REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);
ALTER TABLE "Payroll"."FinalSettlementLines"
  ADD CONSTRAINT "settlementComponentAccountIdFk" FOREIGN KEY ("tenantId", "accountId")
  REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- → Accounting.CostCentres / Accounting.FiscalPeriods
-- ---------------------------------------------------------------------------
ALTER TABLE "Payroll"."PayrollRunLines"
  ADD CONSTRAINT "payrollLineCostCentreIdFk" FOREIGN KEY ("tenantId", "costCentreId")
  REFERENCES "Accounting"."CostCentres" ("tenantId", id);
ALTER TABLE "Payroll"."PayrollRuns"
  ADD CONSTRAINT "payrollRunFiscalPeriodIdFk" FOREIGN KEY ("tenantId", "fiscalPeriodId")
  REFERENCES "Accounting"."FiscalPeriods" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- → Accounting.Vouchers (posted vouchers)
-- ---------------------------------------------------------------------------
ALTER TABLE "Payroll"."PayrollRuns"
  ADD CONSTRAINT "payrollRunJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId")
  REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "Payroll"."PayrollRuns"
  ADD CONSTRAINT "payrollRunReversalJournalEntryIdFk" FOREIGN KEY ("tenantId", "reversalJournalEntryId")
  REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "Payroll"."LoansAndAdvances"
  ADD CONSTRAINT "loanDisbursementJournalEntryIdFk" FOREIGN KEY ("tenantId", "disbursementJournalEntryId")
  REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "Payroll"."FinalSettlements"
  ADD CONSTRAINT "finalSettlementJournalEntryIdFk" FOREIGN KEY ("tenantId", "journalEntryId")
  REFERENCES "Accounting"."Vouchers" ("tenantId", id);
ALTER TABLE "Payroll"."FinalSettlements"
  ADD CONSTRAINT "finalSettlementPaymentJournalEntryIdFk" FOREIGN KEY ("tenantId", "paymentJournalEntryId")
  REFERENCES "Accounting"."Vouchers" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- → BankCash.BankAccounts / BankCash.CashAccounts
-- ---------------------------------------------------------------------------
ALTER TABLE "Payroll"."LoansAndAdvances"
  ADD CONSTRAINT "loanDisbursedFromBankAccountIdFk" FOREIGN KEY ("tenantId", "disbursedFromBankAccountId")
  REFERENCES "BankCash"."BankAccounts" ("tenantId", id);
ALTER TABLE "Payroll"."LoansAndAdvances"
  ADD CONSTRAINT "loanDisbursedFromCashAccountIdFk" FOREIGN KEY ("tenantId", "disbursedFromCashAccountId")
  REFERENCES "BankCash"."CashAccounts" ("tenantId", id);
ALTER TABLE "Payroll"."SalaryPaymentBatches"
  ADD CONSTRAINT "paymentBatchBankAccountIdFk" FOREIGN KEY ("tenantId", "bankAccountId")
  REFERENCES "BankCash"."BankAccounts" ("tenantId", id);
ALTER TABLE "Payroll"."FinalSettlements"
  ADD CONSTRAINT "finalSettlementPayFromBankAccountIdFk" FOREIGN KEY ("tenantId", "payFromBankAccountId")
  REFERENCES "BankCash"."BankAccounts" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- Supporting indexes for the FK columns used in joins / reverse lookups
-- ---------------------------------------------------------------------------
CREATE INDEX "payrollRunJournalEntryIdx"       ON "Payroll"."PayrollRuns" ("tenantId", "journalEntryId")
  WHERE "journalEntryId" IS NOT NULL;
CREATE INDEX "finalSettlementJournalEntryIdx"  ON "Payroll"."FinalSettlements" ("tenantId", "journalEntryId")
  WHERE "journalEntryId" IS NOT NULL;
CREATE INDEX "loanDisbursementJournalEntryIdx" ON "Payroll"."LoansAndAdvances" ("tenantId", "disbursementJournalEntryId")
  WHERE "disbursementJournalEntryId" IS NOT NULL;
