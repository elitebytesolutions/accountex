-- =============================================================================
-- Finsoft ERP (FULL) — fk/11-hr-fks.sql
-- Cross-module foreign keys for the hr schema. Runs after every schema file
-- (00 … 14), so all target tables exist. Composite (tenantId, x_id) →
-- (tenantId, id) per CONTRACT §3. Inline FKs to hr.*, core.*, platform.* are
-- already in schema/11-hr.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Accounting.CostCentres — employee "Cost centre CC-310 Sales North" (wizard step 2,
-- profile Job tab); department "Cost centre CC-300" (Add department modal).
-- ---------------------------------------------------------------------------
ALTER TABLE "HumanResources"."Employees"
  ADD CONSTRAINT "employeeCostCentreIdFk"
  FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id);

ALTER TABLE "HumanResources"."Departments"
  ADD CONSTRAINT "departmentCostCentreIdFk"
  FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- FixedAssets.FixedAssets — profile Assets tab: tag FA-0187 links to the asset register
-- (optional; fuel / access cards have no fixed-asset row).
-- ---------------------------------------------------------------------------
ALTER TABLE "HumanResources"."EmployeeAssets"
  ADD CONSTRAINT "employeeAssetAssetIdFk"
  FOREIGN KEY ("tenantId", "assetId") REFERENCES "FixedAssets"."FixedAssets" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- BankCash.Banks — wizard step 4 "Bank *" (Meezan Bank / HBL / UBL / Bank
-- Alfalah / MCB). Optional: bankName text is kept for display and for banks
-- not in the tenant's bank master.
-- ---------------------------------------------------------------------------
ALTER TABLE "HumanResources"."EmployeeBankAccounts"
  ADD CONSTRAINT "employeeBankBankIdFk"
  FOREIGN KEY ("tenantId", "bankId") REFERENCES "BankCash"."Banks" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- Payroll.PayrollRuns — the run that consumed HR inputs:
--   attendance register "locked for payroll PR-2026-09";
--   overtime "Push to payroll PR-2026-10";
--   leave year-end "Post encashment to PR-2026-10" and each encashment row.
-- ---------------------------------------------------------------------------
ALTER TABLE "HumanResources"."AttendanceRegister"
  ADD CONSTRAINT "attendanceDayPayrollRunIdFk"
  FOREIGN KEY ("tenantId", "payrollRunId") REFERENCES "Payroll"."PayrollRuns" ("tenantId", id);

ALTER TABLE "HumanResources"."OvertimeClaims"
  ADD CONSTRAINT "overtimeEntryPayrollRunIdFk"
  FOREIGN KEY ("tenantId", "payrollRunId") REFERENCES "Payroll"."PayrollRuns" ("tenantId", id);

ALTER TABLE "HumanResources"."LeaveYearEndClosings"
  ADD CONSTRAINT "leaveYearClosePayrollRunIdFk"
  FOREIGN KEY ("tenantId", "payrollRunId") REFERENCES "Payroll"."PayrollRuns" ("tenantId", id);

ALTER TABLE "HumanResources"."LeaveAdjustments"
  ADD CONSTRAINT "leaveAdjustmentPayrollRunIdFk"
  FOREIGN KEY ("tenantId", "payrollRunId") REFERENCES "Payroll"."PayrollRuns" ("tenantId", id);

-- Supporting indexes for the FK columns used in joins / deletes
CREATE INDEX "employeeCostCentreIdx"       ON "HumanResources"."Employees" ("tenantId", "costCentreId");
CREATE INDEX "departmentCostCentreIdx"     ON "HumanResources"."Departments" ("tenantId", "costCentreId");
CREATE INDEX "attendanceDayPayrollRunIdx" ON "HumanResources"."AttendanceRegister" ("tenantId", "payrollRunId") WHERE "payrollRunId" IS NOT NULL;
CREATE INDEX "overtimeEntryPayrollRunIdx" ON "HumanResources"."OvertimeClaims" ("tenantId", "payrollRunId") WHERE "payrollRunId" IS NOT NULL;
