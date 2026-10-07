-- =============================================================================
-- Finsoft ERP (FULL) — 12-payroll.sql
-- Salary components and grade structures, effective-dated employee salaries,
-- monthly / off-cycle payroll runs (5-step wizard), payroll lines and
-- components, payslips, staff loans & salary advances with payroll recovery,
-- full & final settlement, employee tax declarations and the tenant copy of
-- the FBR salaried tax slabs.
--
-- FULL EDITION ONLY (erp-basic has no payroll).
--
-- Screens (source files):
--   app/hr/payroll             Payroll Overview        src/48-dash-stock.html
--   app/hr/payroll/run         Run Payroll wizard      src/51-hr-pay-talent.html
--   app/hr/payroll/structures  Salary Structures       src/51-hr-pay-talent.html
--   app/hr/payroll/payslips    Payslips list           src/51-hr-pay-talent.html
--   app/hr/payroll/payslip     Payslip view            src/51-hr-pay-talent.html
--   app/hr/payroll/reports     Payroll Report Studio   src/45-studios.html + src/96-studio.js (payroll)
--   app/hr/loans               Loans & Advances        src/51-hr-pay-talent.html
--   app/hr/settlement          Final Settlement        src/51-hr-pay-talent.html
--   ess/payslips, ess/tax, ess/loans                   src/6A-ess.html + src/9C-ess.js
--   app/settings (HR & Payroll tab, Numbering)         src/60-settings-ess.html
--
-- Cross-module FKs (hr.*, acc.*, treasury.*) are added in
-- database/fk/12-payroll-fks.sql. Inline FKs here go only to payroll.*,
-- platform.* and core.* (contract §3).
--
-- Doc types (Company.DocumentTypes): PRUN (payroll run), PS (payslip), FS (final
-- settlement), LN (loan, incl. medical loan), ADV (salary advance).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- SalaryComponents — app/hr/payroll/structures, tab "Components" + modal
-- "Salary Component" (Code, Name, Type, Calculation, Percentage, Of component,
-- Formula (advanced), Debit account, Tax treatment, Pro-rate on paid days,
-- Show on payslip, Include in gratuity base, Include in EOBI wage).
-- Seed rows (17): BAS HRA MED UTL CNV FUL COM OVT · ITX EOB PFE LON ADV ·
-- EOR PSI PFR GRT. Chips: Earnings 8 / Deductions 5 / Employer 4.
-- ---------------------------------------------------------------------------
CREATE TABLE "Payroll"."SalaryComponents" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                    text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9]{1,9}$'),       -- BAS, HRA, ITX …
  name                    text NOT NULL,                                             -- House Rent Allowance
  "componentType"          text NOT NULL,        -- badge Earning / Deduction / Employer
  "calcMethod"             text NOT NULL,
                            -- modal: Percentage of component / Fixed amount / Formula / Monthly input;
                            -- SYSTEM = engine-computed ("FBR slab on projected annual taxable",
                            -- "From loan schedule", "From advance schedule")
  "baseBasis"              text,
                            -- "Of component": Basic Salary (BAS) / Gross; EOBI_WAGE = "1% of min. wage Rs 37,000"
  "baseComponentId"       uuid,                                                      -- → SalaryComponents (BAS)
  percent                 numeric(7,4) CHECK (percent >= 0),                         -- 45 (HRA), 10 (MED), 8 (PFE)
  "fixedAmount"            numeric(18,2) CHECK ("fixedAmount" >= 0),                   -- default when not set per grade
  "wageCeiling"            numeric(18,2) CHECK ("wageCeiling" > 0),                    -- Rs 37,000 EOBI/PESSI ceiling
  formula                 text,                                                      -- ROUND(BAS * 0.45, 0) · (BAS / 208) * 2 * OT_HRS
  "calcDescription"        text,                                                      -- list "Calculation" text: "Litres × OGRA price (G3+)"
  "debitAccountId"        uuid,                                                      -- → Accounting.ChartOfAccounts  "Debit account" 5110 / 5115
  "creditAccountId"       uuid,                                                      -- → Accounting.ChartOfAccounts  2152 / 2155 / 1340
  "taxTreatment"           text,
  "exemptLimitPercentOfBasic" numeric(7,4) CHECK ("exemptLimitPercentOfBasic" > 0),  -- "Exempt ≤ 10% basic"
  "exemptLimitAnnualAmount"    numeric(18,2) CHECK ("exemptLimitAnnualAmount" > 0),    -- "Exempt ≤ Rs 150,000 p.a."
  "prorateOnPaidDays"    boolean NOT NULL DEFAULT true,                             -- "Pro-rate on paid days"
  "showOnPayslip"         boolean NOT NULL DEFAULT true,                             -- list column "Payslip"
  "includeInGratuityBase" boolean NOT NULL DEFAULT false,
  "includeInEobiWage"    boolean NOT NULL DEFAULT false,
  "systemRole"             text,
                            -- lets the engine find BAS/ITX/EOB/PFE/LON/ADV/EOR/PSI/PFR/GRT by role
  "sortOrder"              integer NOT NULL DEFAULT 0,
  status                  text NOT NULL DEFAULT 'ACTIVE',
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  "deletedAt"              timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  CONSTRAINT "salaryComponentBaseFk" FOREIGN KEY ("tenantId", "baseComponentId")
    REFERENCES "Payroll"."SalaryComponents" ("tenantId", id),
  CONSTRAINT "salaryComponentPercentChk" CHECK
    ("calcMethod" <> 'PERCENT_OF' OR (percent IS NOT NULL AND "baseBasis" IS NOT NULL)),
  CONSTRAINT "salaryComponentBaseChk" CHECK
    (("baseBasis" IS NOT DISTINCT FROM 'COMPONENT') = ("baseComponentId" IS NOT NULL)),
  CONSTRAINT "salaryComponentNotSelfChk" CHECK ("baseComponentId" IS NULL OR "baseComponentId" <> id),
  CONSTRAINT "salaryComponentFormulaChk" CHECK ("calcMethod" <> 'FORMULA' OR formula IS NOT NULL),
  CONSTRAINT "salaryComponentEarningTaxChk" CHECK
    ("componentType" <> 'EARNING' OR "taxTreatment" IS NOT NULL),
  CONSTRAINT "salaryComponentExemptLimitChk" CHECK
    ("taxTreatment" IS DISTINCT FROM 'EXEMPT_UPTO_LIMIT'
     OR "exemptLimitPercentOfBasic" IS NOT NULL OR "exemptLimitAnnualAmount" IS NOT NULL),
  CONSTRAINT "salaryComponentGlChk" CHECK (
    ("componentType" = 'EARNING'               AND "debitAccountId"  IS NOT NULL) OR
    ("componentType" = 'DEDUCTION'             AND "creditAccountId" IS NOT NULL) OR
    ("componentType" = 'EMPLOYER_CONTRIBUTION' AND "debitAccountId" IS NOT NULL AND "creditAccountId" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Payroll"."SalaryComponents"', true);
CREATE UNIQUE INDEX "salaryComponentSystemRoleUq" ON "Payroll"."SalaryComponents" ("tenantId", "systemRole")
  WHERE "systemRole" IS NOT NULL AND "deletedAt" IS NULL;
CREATE INDEX "salaryComponentTypeIdx" ON "Payroll"."SalaryComponents" ("tenantId", "componentType", "sortOrder")
  WHERE "deletedAt" IS NULL;
COMMENT ON TABLE "Payroll"."SalaryComponents" IS
  'Earnings, deductions and employer contributions with formula, GL mapping and tax treatment (app/hr/payroll/structures › Components).';
COMMENT ON COLUMN "Payroll"."SalaryComponents"."calcMethod" IS
  'PERCENT_OF base × percent; FIXED amount (usually set per grade in SalaryStructureComponents); FORMULA expression; MONTHLY_INPUT entered per run (PayrollAdjustments); SYSTEM computed by the engine (tax slab, loan schedule).';


-- ---------------------------------------------------------------------------
-- SalaryStructures — app/hr/payroll/structures, tab "Structures & Grades":
-- cards G1 Staff — Warehouse & Drivers (Basic Rs 32,000 – 45,000 · 48 employees,
-- Gross (mid) Rs 60,500) … G5 Senior Management (Basic Rs 250,000+), S1 Sales
-- Commission Plan (add-on to G2/G3). "Duplicate structure" → DRAFT copy.
-- ---------------------------------------------------------------------------
CREATE TABLE "Payroll"."SalaryStructures" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                    text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9-]{0,9}$'),       -- G1 … G5, S1
  name                    text NOT NULL,                                             -- Officers & Executives
  "structureKind"          text NOT NULL DEFAULT 'GRADE',
  "gradeId"                uuid,                                                      -- → HumanResources.Grades (NULL for ADDON plans)
  "basicMin"               numeric(18,2) CHECK ("basicMin" >= 0),                      -- 50,000
  "basicMax"               numeric(18,2),                                             -- 90,000; NULL = "250,000+"
  "grossMid"               numeric(18,2) CHECK ("grossMid" >= 0),                      -- "Gross (mid)" 122,000
  "commissionCapPercentOfBasic" numeric(7,4) CHECK ("commissionCapPercentOfBasic" > 0),  -- S1 "Cap 50% of Basic"
  description             text,                                                      -- "Add-on to G2/G3 · 42 sales staff"
  "effectiveFrom"          date NOT NULL DEFAULT current_date,
  "copiedFromStructureId" uuid,                                                     -- "Duplicate structure"
  status                  text NOT NULL DEFAULT 'DRAFT',
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  "deletedAt"              timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  CONSTRAINT "salaryStructureCopiedFromFk" FOREIGN KEY ("tenantId", "copiedFromStructureId")
    REFERENCES "Payroll"."SalaryStructures" ("tenantId", id),
  CONSTRAINT "salaryStructureBasicRangeChk" CHECK ("basicMax" IS NULL OR "basicMin" IS NULL OR "basicMax" >= "basicMin"),
  CONSTRAINT "salaryStructureGradeChk" CHECK ("structureKind" = 'ADDON' OR "gradeId" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Payroll"."SalaryStructures"', true);
CREATE INDEX "salaryStructureGradeIdx" ON "Payroll"."SalaryStructures" ("tenantId", "gradeId") WHERE "deletedAt" IS NULL;
COMMENT ON TABLE "Payroll"."SalaryStructures" IS
  'Grade-wise salary structures (G1–G5) and add-on plans (S1 Sales Commission) — app/hr/payroll/structures.';

-- SalaryStructureComponents — the "dl" rows on each structure card:
-- Basic B · HRA B × 45% · Medical B × 10% · Conveyance Rs 3,000 · Fuel 120 L × OGRA ·
-- Car & Fuel "Company maintained".
CREATE TABLE "Payroll"."SalaryStructureComponents" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "structureId"            uuid NOT NULL,
  "componentId"            uuid NOT NULL,
  "calcMethod"             text,
                            -- NULL = inherit from SalaryComponents
  percent                 numeric(7,4) CHECK (percent >= 0),                         -- 45
  "fixedAmount"            numeric(18,2) CHECK ("fixedAmount" >= 0),                   -- Rs 7,500
  quantity                numeric(18,3) CHECK (quantity >= 0),                       -- 120 (litres of fuel)
  formula                 text,
  "displayText"            text,                                                      -- "B × 45%", "120 L × OGRA", "Company maintained"
  "sortOrder"              integer NOT NULL DEFAULT 0,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "structureId", "componentId"),
  CONSTRAINT "salaryStructureComponentStructureFk" FOREIGN KEY ("tenantId", "structureId")
    REFERENCES "Payroll"."SalaryStructures" ("tenantId", id),
  CONSTRAINT "salaryStructureComponentComponentFk" FOREIGN KEY ("tenantId", "componentId")
    REFERENCES "Payroll"."SalaryComponents" ("tenantId", id),
  CONSTRAINT "salaryStructureComponentFormulaChk" CHECK ("calcMethod" IS DISTINCT FROM 'FORMULA' OR formula IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Payroll"."SalaryStructureComponents"', true);
CREATE INDEX "salaryStructureComponentComponentIdx" ON "Payroll"."SalaryStructureComponents" ("tenantId", "componentId");
COMMENT ON TABLE "Payroll"."SalaryStructureComponents" IS
  'Components of a structure with grade-level overrides (percent, fixed amount, quantity) — structure cards on app/hr/payroll/structures.';

-- SalaryStructureCommissionTiers (helper) — S1 Sales Commission Plan card:
-- "Below 90% target 0% · 90–100% 1.0% of sales · Above 100% 1.5% of sales".
CREATE TABLE "Payroll"."SalaryStructureCommissionTiers" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "structureId"            uuid NOT NULL,
  "achievementFromPct"    numeric(7,4) NOT NULL CHECK ("achievementFromPct" >= 0),   -- 90
  "achievementToPct"      numeric(7,4),                                              -- 100; NULL = and above
  "commissionRatePct"     numeric(7,4) NOT NULL CHECK ("commissionRatePct" >= 0),    -- 1.0 % of sales
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "structureId", "achievementFromPct"),
  CONSTRAINT "structureCommissionTierStructureFk" FOREIGN KEY ("tenantId", "structureId")
    REFERENCES "Payroll"."SalaryStructures" ("tenantId", id),
  CONSTRAINT "structureCommissionTierRangeChk" CHECK ("achievementToPct" IS NULL OR "achievementToPct" > "achievementFromPct")
);
SELECT "Company"."addStandardTriggers"('"Payroll"."SalaryStructureCommissionTiers"', true);
COMMENT ON TABLE "Payroll"."SalaryStructureCommissionTiers" IS
  'Target-achievement commission slabs of an ADDON structure (S1) — app/hr/payroll/structures.';


-- ---------------------------------------------------------------------------
-- payGroup (helper) — Run Payroll step 1 "Pay group": Monthly Salaried —
-- Staff & Management / Monthly — Warehouse Workers / All pay groups. (The
-- Report Studio radio "Management / Staff" is HumanResources.Employees.payGroup, a
-- different, HR-owned classification.)
-- ---------------------------------------------------------------------------
CREATE TABLE "Payroll"."PayGroups" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                    text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,19}$'),     -- MGMT_STAFF, WAREHOUSE
  name                    text NOT NULL,                                             -- Monthly Salaried — Staff & Management
  frequency               text NOT NULL DEFAULT 'MONTHLY',
  status                 text NOT NULL DEFAULT 'ACTIVE',
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  "deletedAt"              timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code)
);
SELECT "Company"."addStandardTriggers"('"Payroll"."PayGroups"');
COMMENT ON TABLE "Payroll"."PayGroups" IS 'Pay groups a payroll run can be scoped to (app/hr/payroll/run step 1).';


-- ---------------------------------------------------------------------------
-- EmployeeSalaries — effective-dated pay setup per employee: structure (grade),
-- optional add-on plan ("G2 + Commission Plan S1"), basic & gross, pay group,
-- pay mode ("Meezan ••4567" / "Cash"). Run step 1 "Salary revisions effective 4";
-- step 2 "Salary revisions · 4 revisions effective 01 Oct 2026 · Applied";
-- ESS profile "Basic salary Rs 92,000 / month", "Gross (Sep 2026)".
-- ---------------------------------------------------------------------------
CREATE TABLE "Payroll"."EmployeeSalaries" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees
  "structureId"            uuid NOT NULL,                                             -- G2
  "addonStructureId"      uuid,                                                      -- S1
  "payGroupId"            uuid,
  "effectiveFrom"          date NOT NULL,
  "effectiveTo"            date,                                                      -- NULL = current
  "basicAmount"            numeric(18,2) NOT NULL CHECK ("basicAmount" > 0),           -- 85,000
  "grossAmount"            numeric(18,2) NOT NULL,                                    -- fixed gross 145,250 (excl. variable)
  "payMode"                text NOT NULL DEFAULT 'BANK_TRANSFER',
  "revisionType"           text NOT NULL DEFAULT 'JOINING',
  "revisionReason"         text,                                                      -- "Increment w.e.f. 01 Sep"
  "approvedByUserId"     uuid,
  "approvedAt"             timestamptz,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "employeeSalaryStructureFk" FOREIGN KEY ("tenantId", "structureId")
    REFERENCES "Payroll"."SalaryStructures" ("tenantId", id),
  CONSTRAINT "employeeSalaryAddonFk" FOREIGN KEY ("tenantId", "addonStructureId")
    REFERENCES "Payroll"."SalaryStructures" ("tenantId", id),
  CONSTRAINT "employeeSalaryPayGroupFk" FOREIGN KEY ("tenantId", "payGroupId")
    REFERENCES "Payroll"."PayGroups" ("tenantId", id),
  CONSTRAINT "employeeSalaryApprovedByFk" FOREIGN KEY ("tenantId", "approvedByUserId")
    REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "employeeSalaryDatesChk" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "employeeSalaryGrossChk" CHECK ("grossAmount" >= "basicAmount"),
  CONSTRAINT "employeeSalaryNoOverlap" EXCLUDE USING gist
    ("tenantId" WITH =, "employeeId" WITH =, daterange("effectiveFrom", "effectiveTo", '[]') WITH &&)
);
SELECT "Company"."addStandardTriggers"('"Payroll"."EmployeeSalaries"', true);
CREATE INDEX "employeeSalaryEmployeeIdx" ON "Payroll"."EmployeeSalaries" ("tenantId", "employeeId", "effectiveFrom" DESC);
CREATE INDEX "employeeSalaryStructureIdx" ON "Payroll"."EmployeeSalaries" ("tenantId", "structureId");
COMMENT ON TABLE "Payroll"."EmployeeSalaries" IS
  'Effective-dated salary of an employee (structure, add-on plan, basic, gross, pay group, pay mode). No overlapping periods.';


-- ---------------------------------------------------------------------------
-- loan — app/hr/loans (list, "New Loan / Advance" modal, review drawer
-- "LN-2026-021 · Loan request") and ess/loans ("Request an advance" sheet:
-- Salary advance / Staff loan / Medical emergency, amount, repay over, purpose).
-- Numbers: LN-2026-014 (loan, medical loan), ADV-2026-… (salary advance; the
-- admin list's "AD-2026-033" is normalised to the ADV prefix).
-- Created before PayrollRunLines because PayrollRunLineComponents points at it.
-- ---------------------------------------------------------------------------
CREATE TABLE "Payroll"."LoansAndAdvances" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                  text NOT NULL,                                             -- LN-2026-014 / ADV-2026-033
  "docDate"                date NOT NULL DEFAULT current_date,                        -- "Req. 28 Sep"
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees
  "loanType"               text NOT NULL,
  purpose                 text NOT NULL DEFAULT 'PERSONAL',                             -- badge sub-text Motorcycle / House / Eid …
  "purposeDetail"          text,                                                      -- "mother's surgery", "Children's school admission fee"
  "requestChannel"         text NOT NULL DEFAULT 'HR',   -- "Requested via ESS"
  "requestedAmount"        numeric(18,2) NOT NULL CHECK ("requestedAmount" > 0),        -- 250,000
  "approvedAmount"         numeric(18,2) CHECK ("approvedAmount" > 0),                  -- drawer "Approved amount"
  "installmentCount"       smallint NOT NULL CHECK ("installmentCount" BETWEEN 1 AND 60),   -- 20
  "installmentAmount"      numeric(18,2) NOT NULL CHECK ("installmentAmount" > 0),      -- 12,500
  "firstDeductionMonth"   date NOT NULL,                                             -- "First deduction: November 2026"
  "markupType"             text NOT NULL DEFAULT 'INTEREST_FREE',
  "markupRate"             numeric(7,4) CHECK ("markupRate" >= 0),
  -- eligibility snapshot shown in the review drawer
  "grossSalarySnapshot"   numeric(18,2) CHECK ("grossSalarySnapshot" >= 0),          -- "Gross salary Rs 88,000"
  "installmentPctOfGross" numeric(7,4) CHECK ("installmentPctOfGross" >= 0),      -- "14.2% (limit 30%)"
  "eligibleLimitAmount"   numeric(18,2) CHECK ("eligibleLimitAmount" >= 0),          -- "Eligible limit (3 × gross)"
  "pfBalanceSnapshot"     numeric(18,2),                                             -- "PF balance (security)"
  "isWithinPolicy"        boolean,                                                   -- banner "Within policy"
  -- disbursement
  "disbursementDate"       date,                                                      -- "Disb. 01 Jul"
  "disbursedFromBankAccountId" uuid,                                               -- → BankCash.BankAccounts "Meezan Bank — 0123"
  "disbursedFromCashAccountId" uuid,                                               -- → BankCash.CashAccounts "Cash in hand"
  "disbursementJournalEntryId"  uuid,                                               -- → Accounting.Vouchers BPV-2026-000061
  -- recovery
  "recoveredAmount"        numeric(18,2) NOT NULL DEFAULT 0 CHECK ("recoveredAmount" >= 0),     -- "Deducted"
  "outstandingAmount"      numeric(18,2) GENERATED ALWAYS AS
                            (COALESCE("approvedAmount", "requestedAmount") - "recoveredAmount") STORED,   -- "Outstanding"
  -- workflow
  status                  text NOT NULL DEFAULT 'PENDING',
  "approvalRequestId"     uuid,                                                      -- Manager → HR → Finance trail
  "decisionComment"        text,                                                      -- drawer "Comment"
  "approvedByUserId"     uuid,
  "approvedAt"             timestamptz,
  "closedAt"               timestamptz,
  remarks                 text,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "loanApprovalRequestFk" FOREIGN KEY ("tenantId", "approvalRequestId")
    REFERENCES "Company"."Approvals" ("tenantId", id),
  CONSTRAINT "loanApprovedByFk" FOREIGN KEY ("tenantId", "approvedByUserId")
    REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "loanFirstMonthChk" CHECK (extract(day FROM "firstDeductionMonth") = 1),
  CONSTRAINT "loanOneSourceChk" CHECK (num_nonnulls("disbursedFromBankAccountId", "disbursedFromCashAccountId") <= 1),
  CONSTRAINT "loanMarkupChk" CHECK (("markupType" = 'MARKUP') = ("markupRate" IS NOT NULL)),
  CONSTRAINT "loanRecoveredChk" CHECK ("recoveredAmount" <= COALESCE("approvedAmount", "requestedAmount")),
  CONSTRAINT "loanActiveChk" CHECK (status NOT IN ('ACTIVE','SETTLEMENT','CLOSED')
                                    OR ("approvedAmount" IS NOT NULL AND "disbursementDate" IS NOT NULL)),
  CONSTRAINT "loanClosedChk" CHECK (status <> 'CLOSED' OR "outstandingAmount" = 0),
  CONSTRAINT "loanScheduleChk" CHECK ("installmentAmount" * "installmentCount" >= COALESCE("approvedAmount", "requestedAmount"))
);
SELECT "Company"."addStandardTriggers"('"Payroll"."LoansAndAdvances"', true);
CREATE INDEX "loanEmployeeIdx" ON "Payroll"."LoansAndAdvances" ("tenantId", "employeeId", status);
CREATE INDEX "loanStatusIdx"   ON "Payroll"."LoansAndAdvances" ("tenantId", status, "loanType", "docDate" DESC);
COMMENT ON TABLE "Payroll"."LoansAndAdvances" IS
  'Staff loans, medical loans and salary advances; recovered through payroll installments (app/hr/loans, ess/loans).';
COMMENT ON COLUMN "Payroll"."LoansAndAdvances"."outstandingAmount" IS
  'Generated: COALESCE(approved, requested) − recovered. recoveredAmount is maintained by Payroll.triggerLoanInstallmentSync.';


-- ---------------------------------------------------------------------------
-- PayrollRuns — app/hr/payroll/run (wizard: Period & Scope → Inputs → Review →
-- Approve → Post & Pay) and Payroll Overview "Recent payroll runs" (Run #,
-- Period, Employees, Gross, Deductions, Net, Journal, Status).
-- Numbers: regular PR-2026-09 (one per month, from Payroll.getNextPayrollRunNo), off-cycle
-- PR-2026-OFF-02 (Company.getNextDocNo('PRUN')).
-- ---------------------------------------------------------------------------
CREATE TABLE "Payroll"."PayrollRuns" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                  text NOT NULL,                                             -- PR-2026-10
  "runType"                text NOT NULL DEFAULT 'REGULAR',
  "payrollMonth"           date NOT NULL,                                             -- "Payroll month *" October 2026 (1st of month)
  "periodFrom"             date NOT NULL,                                             -- 2026-10-01
  "periodTo"               date NOT NULL,                                             -- 2026-10-31
  "payDate"                date NOT NULL,                                             -- "Pay date *"
  "attendanceCutoffDate"  date,                                                      -- "Attendance cut-off" 25th
  "payGroupId"            uuid,                                                      -- NULL = "All pay groups"
  "salaryPayableAccountId" uuid NOT NULL,                                           -- → Accounting.ChartOfAccounts 2140
  "includeNoticePeriod"   boolean NOT NULL DEFAULT true,                             -- "Include employees on notice period"
  "includeExited"          boolean NOT NULL DEFAULT false,                            -- "Include employees exited in period"
  "workingDays"            smallint CHECK ("workingDays" BETWEEN 0 AND 31),            -- Run Summary "Working days 26"
  "publicHolidays"         smallint CHECK ("publicHolidays" BETWEEN 0 AND 31),
  -- totals (refreshed by Payroll.refreshPayrollRunTotals)
  "employeeCount"          integer NOT NULL DEFAULT 0 CHECK ("employeeCount" >= 0),    -- 187
  "grossAmount"            numeric(18,2) NOT NULL DEFAULT 0,                          -- 21,612,400
  "taxAmount"              numeric(18,2) NOT NULL DEFAULT 0,                          -- income tax u/s 149
  "eobiEmployeeAmount"    numeric(18,2) NOT NULL DEFAULT 0,
  "pfEmployeeAmount"      numeric(18,2) NOT NULL DEFAULT 0,
  "loanAmount"             numeric(18,2) NOT NULL DEFAULT 0,                          -- loans & advance recovery
  "deductionAmount"        numeric(18,2) NOT NULL DEFAULT 0,                          -- "Deductions"
  "netAmount"              numeric(18,2) NOT NULL DEFAULT 0,                          -- "Net"
  "employerContributionAmount" numeric(18,2) NOT NULL DEFAULT 0,                     -- "Employer EOBI · PESSI · PF"
  -- workflow
  status                  text NOT NULL DEFAULT 'DRAFT',
  "wizardStep"             smallint NOT NULL DEFAULT 1 CHECK ("wizardStep" BETWEEN 1 AND 5),
  "inputsFrozenAt"        timestamptz,                                               -- "Inputs frozen, 187 employees calculated"
  "calculatedAt"           timestamptz,
  "preparedByUserId"     uuid,                                                      -- "Prepared — Ayesha Noor"
  "preparedAt"             timestamptz,
  "checkedByUserId"      uuid,                                                      -- "Checked — Hira Ali"
  "checkedAt"              timestamptz,
  "approvalRequestId"     uuid,                                                      -- Finance → CEO (> Rs 20M)
  "approvedByUserId"     uuid,
  "approvedAt"             timestamptz,
  "postedByUserId"       uuid,
  "postedAt"               timestamptz,
  "paidAt"                 timestamptz,                                               -- "Paid 30 Sep 2026"
  "fiscalPeriodId"        uuid,                                                      -- → Accounting.FiscalPeriods
  "journalEntryId"        uuid,                                                      -- → Accounting.Vouchers JV-2026-000451
  "reversalJournalEntryId" uuid,                                                    -- → Accounting.Vouchers
  -- "After posting" switches (step 5)
  "emailPayslips"          boolean NOT NULL DEFAULT true,                             -- "Email payslips (PDF, password = CNIC last 5)"
  "publishToEss"          boolean NOT NULL DEFAULT true,
  "smsNetPayAlert"       boolean NOT NULL DEFAULT false,
  "createDepositReminders" boolean NOT NULL DEFAULT true,                            -- "tax & EOBI deposit reminders (15 Nov)"
  narration               text,                                                      -- "Payroll October 2026 (PR-2026-10)"
  remarks                 text,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "payrollRunPayGroupFk" FOREIGN KEY ("tenantId", "payGroupId")
    REFERENCES "Payroll"."PayGroups" ("tenantId", id),
  CONSTRAINT "payrollRunPreparedByFk" FOREIGN KEY ("tenantId", "preparedByUserId")
    REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "payrollRunCheckedByFk" FOREIGN KEY ("tenantId", "checkedByUserId")
    REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "payrollRunApprovedByFk" FOREIGN KEY ("tenantId", "approvedByUserId")
    REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "payrollRunPostedByFk" FOREIGN KEY ("tenantId", "postedByUserId")
    REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "payrollRunApprovalRequestFk" FOREIGN KEY ("tenantId", "approvalRequestId")
    REFERENCES "Company"."Approvals" ("tenantId", id),
  CONSTRAINT "payrollRunMonthChk" CHECK (extract(day FROM "payrollMonth") = 1),
  CONSTRAINT "payrollRunPeriodChk" CHECK ("periodTo" >= "periodFrom"),
  CONSTRAINT "payrollRunCutoffChk" CHECK ("attendanceCutoffDate" IS NULL OR "attendanceCutoffDate" <= "periodTo"),
  CONSTRAINT "payrollRunTotalsChk" CHECK ("netAmount" = "grossAmount" - "deductionAmount"),
  CONSTRAINT "payrollRunDeductionsChk" CHECK
    ("deductionAmount" >= "taxAmount" + "eobiEmployeeAmount" + "pfEmployeeAmount" + "loanAmount"),
  CONSTRAINT "payrollRunPostedChk" CHECK
    (status NOT IN ('POSTED','PAID','REVERSED') OR ("journalEntryId" IS NOT NULL AND "postedAt" IS NOT NULL)),
  CONSTRAINT "payrollRunPaidChk" CHECK (status <> 'PAID' OR "paidAt" IS NOT NULL),
  CONSTRAINT "payrollRunApprovedChk" CHECK
    (status NOT IN ('APPROVED','POSTED','PAID') OR "approvedAt" IS NOT NULL),
  CONSTRAINT "payrollRunReversedChk" CHECK (status <> 'REVERSED' OR "reversalJournalEntryId" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Payroll"."PayrollRuns"', true);
-- one live REGULAR run per month and pay group ("All pay groups" = NULL counts as one value)
CREATE UNIQUE INDEX "payrollRunOneRegularPerMonth" ON "Payroll"."PayrollRuns" ("tenantId", "payrollMonth", "payGroupId")
  NULLS NOT DISTINCT WHERE "runType" = 'REGULAR' AND status NOT IN ('REJECTED','CANCELLED','REVERSED');
CREATE INDEX "payrollRunMonthIdx"  ON "Payroll"."PayrollRuns" ("tenantId", "payrollMonth" DESC, "runType");
CREATE INDEX "payrollRunStatusIdx" ON "Payroll"."PayrollRuns" ("tenantId", status);
COMMENT ON TABLE "Payroll"."PayrollRuns" IS
  'Payroll run header: period & scope, wizard state, approvals, totals and posted journal (app/hr/payroll/run, app/hr/payroll).';
COMMENT ON COLUMN "Payroll"."PayrollRuns"."wizardStep" IS
  '1 Period & Scope · 2 Inputs · 3 Review · 4 Approve · 5 Post & Pay.';

-- PayrollRunBranches — step 1 Scope checkboxes: Lahore HQ (98) · Karachi (41) ·
-- Islamabad (26) · Faisalabad (22).
CREATE TABLE "Payroll"."PayrollRunBranches" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "payrollRunId"          uuid NOT NULL,
  "branchId"               uuid NOT NULL,
  "employeeCount"          integer NOT NULL DEFAULT 0 CHECK ("employeeCount" >= 0),    -- (98)
  "isIncluded"             boolean NOT NULL DEFAULT true,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "payrollRunId", "branchId"),
  CONSTRAINT "payrollRunBranchRunFk" FOREIGN KEY ("tenantId", "payrollRunId")
    REFERENCES "Payroll"."PayrollRuns" ("tenantId", id),
  CONSTRAINT "payrollRunBranchBranchFk" FOREIGN KEY ("tenantId", "branchId")
    REFERENCES "Company"."Branches" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Payroll"."PayrollRunBranches"');
COMMENT ON TABLE "Payroll"."PayrollRunBranches" IS 'Branches in scope of a payroll run (app/hr/payroll/run step 1).';

-- PayrollRunChecklistItems (helper) — step 4 "Pre-posting Checklist · 8 of 10 complete":
-- Attendance cut-off applied · Overtime approved · Unpaid leave verified · Loan
-- installments reconciled · Tax computed · EOBI wage ceiling applied · Variances
-- explained · Exit moved to settlement · Missing IBAN · Bank balance sufficient.
CREATE TABLE "Payroll"."PayrollRunChecklistItems" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "payrollRunId"          uuid NOT NULL,
  "itemKey"                text NOT NULL CHECK ("itemKey" ~ '^[A-Z][A-Z0-9_]{2,39}$'),   -- ATTENDANCE_CUTOFF, BANK_BALANCE
  label                   text NOT NULL,                                             -- "Bank balance sufficient (Meezan 0123)"
  "sortOrder"              smallint NOT NULL DEFAULT 0,
  "isDone"                 boolean NOT NULL DEFAULT false,
  "doneByUserId"         uuid,
  "doneAt"                 timestamptz,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "payrollRunId", "itemKey"),
  CONSTRAINT "runChecklistItemRunFk" FOREIGN KEY ("tenantId", "payrollRunId")
    REFERENCES "Payroll"."PayrollRuns" ("tenantId", id),
  CONSTRAINT "runChecklistItemDoneByFk" FOREIGN KEY ("tenantId", "doneByUserId")
    REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "runChecklistItemDoneChk" CHECK (NOT "isDone" OR "doneAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Payroll"."PayrollRunChecklistItems"', true);
COMMENT ON TABLE "Payroll"."PayrollRunChecklistItems" IS 'Pre-posting checklist of a payroll run (app/hr/payroll/run step 4).';

-- SalaryPaymentBatches (helper) — step 5 "Bank Transfer Files": Meezan Bank — 0123 ·
-- 142 employees · Bulk salary upload (.txt) 14,860,200; HBL — 8721 · IBFT 38 ·
-- (.csv); Cheque / Cash 7 · no IBAN. Report Studio "Bank Advice Letter"
-- (Instruction ref BA-2026-09 · Sent 29 Sep 2026 · Value date).
CREATE TABLE "Payroll"."SalaryPaymentBatches" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "payrollRunId"          uuid NOT NULL,
  "paymentMethod"          text NOT NULL,
  "bankAccountId"         uuid,                                                      -- → BankCash.BankAccounts (company account)
  "fileFormat"             text,
  "employeeCount"          integer NOT NULL DEFAULT 0 CHECK ("employeeCount" >= 0),
  "totalAmount"            numeric(18,2) NOT NULL DEFAULT 0 CHECK ("totalAmount" >= 0),
  "instructionRef"         text,                                                      -- BA-2026-09
  "valueDate"              date,                                                      -- "Value date 29 Sep 2026"
  "fileAttachmentId"      uuid,                                                      -- generated upload file
  "adviceAttachmentId"    uuid,                                                      -- printed bank advice letter
  "generatedAt"            timestamptz,
  "sentAt"                 timestamptz,
  status                  text NOT NULL DEFAULT 'DRAFT',
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "paymentBatchRunFk" FOREIGN KEY ("tenantId", "payrollRunId")
    REFERENCES "Payroll"."PayrollRuns" ("tenantId", id),
  CONSTRAINT "paymentBatchFileFk" FOREIGN KEY ("tenantId", "fileAttachmentId")
    REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "paymentBatchAdviceFk" FOREIGN KEY ("tenantId", "adviceAttachmentId")
    REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "paymentBatchBankChk" CHECK ("paymentMethod" NOT IN ('BULK_UPLOAD','IBFT') OR "bankAccountId" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Payroll"."SalaryPaymentBatches"', true);
CREATE INDEX "paymentBatchRunIdx" ON "Payroll"."SalaryPaymentBatches" ("tenantId", "payrollRunId");
COMMENT ON TABLE "Payroll"."SalaryPaymentBatches" IS
  'Net-pay disbursement batch per bank / method: bulk upload file, IBFT file, cheque/cash (app/hr/payroll/run step 5, Bank Advice report).';


-- ---------------------------------------------------------------------------
-- PayrollAdjustments — step 2 "Arrears, Bonuses & One-time Adjustments" (Employee,
-- Component, Type, Amount (Rs), Taxable, Remarks; Import CSV / Add line) plus the
-- auto-pulled inputs listed under "Input Sources" (attendance, overtime, leave
-- without pay, loans & advances, salary revisions, approved expense claims).
-- ---------------------------------------------------------------------------
CREATE TABLE "Payroll"."PayrollAdjustments" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "payrollRunId"          uuid NOT NULL,
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees
  "componentId"            uuid NOT NULL,                                             -- Sales Commission / Salary Arrears / Advance Recovery
  "inputSource"            text NOT NULL DEFAULT 'MANUAL',
  quantity                numeric(18,3),                                             -- OT hours / LWP days
  amount                  numeric(18,2) NOT NULL CHECK (amount > 0),                 -- 31,200
  "isTaxable"              boolean NOT NULL DEFAULT true,                             -- "Taxable" checkbox
  remarks                 text,                                                      -- "Q3 target 112% achieved"
  "sourceDocType"         text REFERENCES "Company"."DocumentTypes" (code),                      -- OT / EXP / LV / HD …
  "sourceDocId"           uuid,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "payrollInputRunFk" FOREIGN KEY ("tenantId", "payrollRunId")
    REFERENCES "Payroll"."PayrollRuns" ("tenantId", id),
  CONSTRAINT "payrollInputComponentFk" FOREIGN KEY ("tenantId", "componentId")
    REFERENCES "Payroll"."SalaryComponents" ("tenantId", id),
  CONSTRAINT "payrollInputSourceChk" CHECK (("sourceDocType" IS NULL) = ("sourceDocId" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"Payroll"."PayrollAdjustments"', true);
CREATE INDEX "payrollInputRunIdx"      ON "Payroll"."PayrollAdjustments" ("tenantId", "payrollRunId", "employeeId");
CREATE INDEX "payrollInputEmployeeIdx" ON "Payroll"."PayrollAdjustments" ("tenantId", "employeeId");
CREATE INDEX "payrollInputSourceIdx"   ON "Payroll"."PayrollAdjustments" ("tenantId", "sourceDocType", "sourceDocId")
  WHERE "sourceDocId" IS NOT NULL;
COMMENT ON TABLE "Payroll"."PayrollAdjustments" IS
  'Per-run variable inputs (one-time earnings/deductions, imported or pulled from OT, LWP, expense claims) — app/hr/payroll/run step 2.';


-- ---------------------------------------------------------------------------
-- PayrollRunLines — one row per employee per run. Step 3 "Employee payroll lines"
-- (Employee, Dept, Paid days, Gross, Tax, EOBI, PF, Loan, Net, vs Sep) with
-- chips Flagged / New / Revised and the warnings banner; also the payslip
-- header block (Days in month, Paid days, Leave taken, LWP, Overtime hrs, Tax
-- status, tax computation) and Payment & Balances (Mode, Bank, IBAN, Transfer ref).
-- ---------------------------------------------------------------------------
CREATE TABLE "Payroll"."PayrollRunLines" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "payrollRunId"          uuid NOT NULL,
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees
  "employeeSalaryId"      uuid,                                                      -- salary row applied
  -- snapshots at calculation time (posting by department, payslip header)
  "branchId"               uuid,
  "departmentId"           uuid,                                                      -- → HumanResources.Departments
  "gradeId"                uuid,                                                      -- → HumanResources.Grades
  "costCentreId"          uuid,                                                      -- → Accounting.CostCentres ("By department (8)")
  "structureId"            uuid,
  -- days
  "daysInMonth"           smallint NOT NULL CHECK ("daysInMonth" BETWEEN 1 AND 31),  -- 30
  "paidDays"               numeric(5,2) NOT NULL CHECK ("paidDays" >= 0),             -- 29 · 18 (new joiner pro-rata)
  "lwpDays"                numeric(5,2) NOT NULL DEFAULT 0 CHECK ("lwpDays" >= 0),     -- "Leave without pay"
  "leaveTakenDays"        numeric(5,2) NOT NULL DEFAULT 0 CHECK ("leaveTakenDays" >= 0),   -- "1 (Casual)"
  "overtimeHours"          numeric(7,2) NOT NULL DEFAULT 0 CHECK ("overtimeHours" >= 0),
  -- money
  "basicAmount"            numeric(18,2) NOT NULL DEFAULT 0 CHECK ("basicAmount" >= 0),
  "allowanceAmount"        numeric(18,2) NOT NULL DEFAULT 0 CHECK ("allowanceAmount" >= 0),  -- Report Studio "Allowances"
  "grossAmount"            numeric(18,2) NOT NULL CHECK ("grossAmount" >= 0),
  "taxAmount"              numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),  -- income tax u/s 149
  "eobiAmount"             numeric(18,2) NOT NULL DEFAULT 0 CHECK ("eobiAmount" >= 0), -- employee 370
  "pfAmount"               numeric(18,2) NOT NULL DEFAULT 0 CHECK ("pfAmount" >= 0),   -- employee 8% of basic
  "loanAmount"             numeric(18,2) NOT NULL DEFAULT 0 CHECK ("loanAmount" >= 0), -- loan + advance installments
  "otherDeductionAmount"  numeric(18,2) NOT NULL DEFAULT 0 CHECK ("otherDeductionAmount" >= 0),
  "deductionAmount"        numeric(18,2) NOT NULL,                                    -- "Total Deductions"
  "netAmount"              numeric(18,2) NOT NULL,                                    -- "Net Pay"
  "employerEobiAmount"    numeric(18,2) NOT NULL DEFAULT 0 CHECK ("employerEobiAmount" >= 0),
  "employerPessiAmount"   numeric(18,2) NOT NULL DEFAULT 0 CHECK ("employerPessiAmount" >= 0),
  "employerPfAmount"      numeric(18,2) NOT NULL DEFAULT 0 CHECK ("employerPfAmount" >= 0),
  "gratuityProvisionAmount" numeric(18,2) NOT NULL DEFAULT 0 CHECK ("gratuityProvisionAmount" >= 0),
  -- tax computation (payslip "Tax Computation FY 2026-27")
  "taxStatus"              text,          -- "Filer (ATL)"
  "projectedAnnualSalary" numeric(18,2),                                             -- 2,232,000
  "annualExemptAmount"    numeric(18,2),                                             -- medical exempt 102,000
  "annualTaxableIncome"   numeric(18,2),                                             -- 2,130,000
  "annualTaxLiability"    numeric(18,2),                                             -- 108,300
  "taxSlabId"             uuid,                                                      -- slab "Rs 1.2M – 2.2M"
  -- variance & review flags (step 3)
  "prevNetAmount"         numeric(18,2),
  "variancePct"            numeric(9,4),                                              -- "+29.6%"
  "isNewJoiner"           boolean NOT NULL DEFAULT false,                            -- chip "New"
  "isRevised"              boolean NOT NULL DEFAULT false,                            -- chip "Revised"
  flags                   text[] NOT NULL DEFAULT '{}' CHECK (flags <@ ARRAY
                            ['VARIANCE_ABOVE_15','MISSING_IBAN','NEGATIVE_NET_RISK','PRO_RATA','MISSING_PUNCH',
                             'ON_NOTICE','EXIT_IN_PERIOD']::text[]),               -- chip "Flagged", warnings banner
  "varianceExplanation"    text,                                                      -- "Variance explained by Mehwish bonus"
  -- payment
  "payMode"                text NOT NULL DEFAULT 'BANK_TRANSFER',
  "bankName"               text,                                                      -- snapshot "Meezan Bank"
  "ibanMasked"             text,                                                      -- "PK36 MEZN •••• •••• 4567"
  "paymentBatchId"        uuid,
  "paymentRef"             text,                                                      -- MZN-SAL-260930-0047
  "isOnHold"              boolean NOT NULL DEFAULT false,                            -- Kashif Ali: "On hold"
  "holdReason"             text,                                                      -- "Paid in final settlement"
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "payrollRunId", "employeeId"),
  CONSTRAINT "payrollLineRunFk" FOREIGN KEY ("tenantId", "payrollRunId")
    REFERENCES "Payroll"."PayrollRuns" ("tenantId", id),
  CONSTRAINT "payrollLineSalaryFk" FOREIGN KEY ("tenantId", "employeeSalaryId")
    REFERENCES "Payroll"."EmployeeSalaries" ("tenantId", id),
  CONSTRAINT "payrollLineStructureFk" FOREIGN KEY ("tenantId", "structureId")
    REFERENCES "Payroll"."SalaryStructures" ("tenantId", id),
  CONSTRAINT "payrollLineBranchFk" FOREIGN KEY ("tenantId", "branchId")
    REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "payrollLinePaymentBatchFk" FOREIGN KEY ("tenantId", "paymentBatchId")
    REFERENCES "Payroll"."SalaryPaymentBatches" ("tenantId", id),
  CONSTRAINT "payrollLinePaidDaysChk" CHECK ("paidDays" <= "daysInMonth"),
  CONSTRAINT "payrollLineDeductionsChk" CHECK
    ("deductionAmount" = "taxAmount" + "eobiAmount" + "pfAmount" + "loanAmount" + "otherDeductionAmount"),
  CONSTRAINT "payrollLineNetChk" CHECK ("netAmount" = "grossAmount" - "deductionAmount"),
  CONSTRAINT "payrollLineHoldChk" CHECK (NOT "isOnHold" OR "holdReason" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Payroll"."PayrollRunLines"', true);
CREATE INDEX "payrollLineEmployeeIdx"   ON "Payroll"."PayrollRunLines" ("tenantId", "employeeId");
CREATE INDEX "payrollLineDepartmentIdx" ON "Payroll"."PayrollRunLines" ("tenantId", "payrollRunId", "departmentId");
CREATE INDEX "payrollLineBranchIdx"     ON "Payroll"."PayrollRunLines" ("tenantId", "payrollRunId", "branchId");
CREATE INDEX "payrollLineFlaggedIdx"    ON "Payroll"."PayrollRunLines" ("tenantId", "payrollRunId") WHERE flags <> '{}';
CREATE INDEX "payrollLineBatchIdx"      ON "Payroll"."PayrollRunLines" ("tenantId", "paymentBatchId") WHERE "paymentBatchId" IS NOT NULL;
COMMENT ON TABLE "Payroll"."PayrollRunLines" IS
  'Calculated pay of one employee in one run: days, gross, statutory deductions, loans, net, employer costs, tax projection, payment (app/hr/payroll/run step 3, payslip).';

-- PayrollRunLineComponents — payslip Earnings / Deductions tables
-- ("House Rent Allowance (45%) 38,250", "Loan Installment (LN-2026-014 · 3/12) 10,000").
CREATE TABLE "Payroll"."PayrollRunLineComponents" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "payrollLineId"         uuid NOT NULL,
  "componentId"            uuid NOT NULL,
  "componentType"          text NOT NULL,  -- snapshot
  label                   text NOT NULL,                                             -- printed label incl. basis
  "basisText"              text,                                                      -- "45%", "3/12", "Aug sales"
  quantity                numeric(18,3),
  rate                    numeric(18,4),
  amount                  numeric(18,2) NOT NULL CHECK (amount >= 0),
  "isTaxable"              boolean NOT NULL DEFAULT false,
  "exemptAmount"           numeric(18,2) NOT NULL DEFAULT 0 CHECK ("exemptAmount" >= 0),
  "loanId"                 uuid,                                                      -- LON / ADV rows
  "payrollInputId"        uuid,                                                      -- one-time inputs
  "showOnPayslip"         boolean NOT NULL DEFAULT true,
  "sortOrder"              smallint NOT NULL DEFAULT 0,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "payrollLineComponentUq" UNIQUE NULLS NOT DISTINCT
    ("tenantId", "payrollLineId", "componentId", "loanId", "payrollInputId"),
  CONSTRAINT "payrollLineComponentLineFk" FOREIGN KEY ("tenantId", "payrollLineId")
    REFERENCES "Payroll"."PayrollRunLines" ("tenantId", id) ON DELETE CASCADE,
  CONSTRAINT "payrollLineComponentComponentFk" FOREIGN KEY ("tenantId", "componentId")
    REFERENCES "Payroll"."SalaryComponents" ("tenantId", id),
  CONSTRAINT "payrollLineComponentLoanFk" FOREIGN KEY ("tenantId", "loanId")
    REFERENCES "Payroll"."LoansAndAdvances" ("tenantId", id),
  CONSTRAINT "payrollLineComponentInputFk" FOREIGN KEY ("tenantId", "payrollInputId")
    REFERENCES "Payroll"."PayrollAdjustments" ("tenantId", id),
  CONSTRAINT "payrollLineComponentExemptChk" CHECK ("exemptAmount" <= amount)
);
SELECT "Company"."addStandardTriggers"('"Payroll"."PayrollRunLineComponents"', true);
CREATE INDEX "payrollLineComponentComponentIdx" ON "Payroll"."PayrollRunLineComponents" ("tenantId", "componentId");
CREATE INDEX "payrollLineComponentLoanIdx"      ON "Payroll"."PayrollRunLineComponents" ("tenantId", "loanId") WHERE "loanId" IS NOT NULL;
COMMENT ON TABLE "Payroll"."PayrollRunLineComponents" IS
  'Component breakdown of a payroll line (payslip earnings/deductions, employer contributions for GL posting).';


-- ---------------------------------------------------------------------------
-- payslip — app/hr/payroll/payslips (KPIs Generated / Emailed / Viewed in ESS /
-- Bounced-No email; list Employee, Department, Bank, Gross, Deductions, Net Pay,
-- Status; modal "Email payslips") and app/hr/payroll/payslip (SALARY SLIP,
-- Slip # PS-2026-09-0047, "Viewed by employee 30 Sep 2026 18:12"); ess/payslips
-- (View / Download PDF / "Share with bank" secure link · expires in 7 days).
-- ---------------------------------------------------------------------------
CREATE TABLE "Payroll"."Payslips" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                  text NOT NULL,                                             -- PS-2026-09-0047
  "payrollRunId"          uuid NOT NULL,
  "payrollLineId"         uuid NOT NULL,
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees
  "payrollMonth"           date NOT NULL,                                             -- "For the month of September 2026"
  "grossAmount"            numeric(18,2) NOT NULL,                                    -- list snapshot
  "deductionAmount"        numeric(18,2) NOT NULL,
  "netAmount"              numeric(18,2) NOT NULL,
  "netAmountWords"        text,                                                      -- "Rupees One Hundred Fifty-Nine Thousand …"
  status                  text NOT NULL DEFAULT 'GENERATED',
  "generatedAt"            timestamptz NOT NULL DEFAULT now(),
  "publishedToEssAt"     timestamptz,                                               -- "Publish to Employee Self-Service"
  "emailTo"                citext,                                                    -- bilal.khan@alnoor.pk
  "emailedAt"              timestamptz,                                               -- "Emailed 30 Sep 08:00"
  "emailCount"             smallint NOT NULL DEFAULT 0 CHECK ("emailCount" >= 0),
  "bounceReason"           text,                                                      -- "Mailbox full"
  "viewedAt"               timestamptz,                                               -- "Viewed 30 Sep 18:12"
  "printedAt"              timestamptz,                                               -- "Printed copy issued"
  "holdReason"             text,                                                      -- "Paid in final settlement"
  "isPasswordProtected"   boolean NOT NULL DEFAULT true,                             -- "PDF protected with last 5 digits of CNIC"
  "pdfAttachmentId"       uuid,
  "shareToken"             text,                                                      -- ESS "Share with bank"
  "shareExpiresAt"        timestamptz,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  UNIQUE ("tenantId", "payrollLineId"),
  CONSTRAINT "payslipRunFk" FOREIGN KEY ("tenantId", "payrollRunId")
    REFERENCES "Payroll"."PayrollRuns" ("tenantId", id),
  CONSTRAINT "payslipLineFk" FOREIGN KEY ("tenantId", "payrollLineId")
    REFERENCES "Payroll"."PayrollRunLines" ("tenantId", id),
  CONSTRAINT "payslipPdfFk" FOREIGN KEY ("tenantId", "pdfAttachmentId")
    REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "payslipMonthChk" CHECK (extract(day FROM "payrollMonth") = 1),
  CONSTRAINT "payslipNetChk" CHECK ("netAmount" = "grossAmount" - "deductionAmount"),
  CONSTRAINT "payslipEmailedChk" CHECK (status NOT IN ('EMAILED','VIEWED','BOUNCED') OR "emailedAt" IS NOT NULL OR "viewedAt" IS NOT NULL),
  CONSTRAINT "payslipViewedChk" CHECK (status <> 'VIEWED' OR "viewedAt" IS NOT NULL),
  CONSTRAINT "payslipBouncedChk" CHECK (status <> 'BOUNCED' OR "bounceReason" IS NOT NULL),
  CONSTRAINT "payslipHoldChk" CHECK (status <> 'ON_HOLD' OR "holdReason" IS NOT NULL),
  CONSTRAINT "payslipShareChk" CHECK (("shareToken" IS NULL) = ("shareExpiresAt" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"Payroll"."Payslips"', true);
CREATE INDEX "payslipEmployeeIdx" ON "Payroll"."Payslips" ("tenantId", "employeeId", "payrollMonth" DESC);
CREATE INDEX "payslipRunStatusIdx" ON "Payroll"."Payslips" ("tenantId", "payrollRunId", status);
CREATE UNIQUE INDEX "payslipShareTokenUq" ON "Payroll"."Payslips" ("shareToken") WHERE "shareToken" IS NOT NULL;
COMMENT ON TABLE "Payroll"."Payslips" IS
  'Issued payslip per payroll line with delivery tracking (emailed/viewed/bounced/on hold) — app/hr/payroll/payslips, ess/payslips.';


-- ---------------------------------------------------------------------------
-- FinalSettlements — app/hr/settlement "Full & Final Settlement — Kashif Ali"
-- (FS-2026-007 · Off-cycle run PR-2026-OFF-02 · Prepared by …; Employee & Exit
-- panel; Settlement Computation; Net payable; Accounting on approval; PF Trust
-- banner; Approvals). Clearance checklist is HumanResources.ClearanceItems (read).
-- ---------------------------------------------------------------------------
CREATE TABLE "Payroll"."FinalSettlements" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                  text NOT NULL,                                             -- FS-2026-007
  "docDate"                date NOT NULL DEFAULT current_date,                        -- prepared on 30 Sep 2026
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees
  "offboardingId"          uuid NOT NULL,                                             -- → HumanResources.Offboardings (OFF-…): exit type
                            -- (badge "Resigned"), resignation date, last working day, notice required /
                            -- served, reason ("Better opportunity") are read from there, not copied;
                            -- "Rehire eligible" from HumanResources.ExitInterviews
  "payrollRunId"          uuid,                                                      -- off-cycle PR-2026-OFF-02
  "serviceMonths"          integer CHECK ("serviceMonths" >= 0),                       -- computation basis "7 yrs 6 mths" = 90
  "noticeShortfallDays"   smallint NOT NULL DEFAULT 0 CHECK ("noticeShortfallDays" >= 0),   -- 10 (snapshot used in the computation)
  "lastBasicAmount"       numeric(18,2) NOT NULL CHECK ("lastBasicAmount" >= 0),     -- 60,000
  "lastGrossAmount"       numeric(18,2) NOT NULL CHECK ("lastGrossAmount" >= 0),     -- 108,000
  "perDayGrossAmount"    numeric(18,2) CHECK ("perDayGrossAmount" >= 0),           -- 3,600
  "perDayBasicAmount"    numeric(18,2) CHECK ("perDayBasicAmount" >= 0),           -- 2,000 (basic ÷ 30)
  "earningsAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("earningsAmount" >= 0),    -- 556,000
  "deductionAmount"        numeric(18,2) NOT NULL DEFAULT 0 CHECK ("deductionAmount" >= 0),  -- 93,820
  "netAmount"              numeric(18,2) NOT NULL DEFAULT 0,                          -- 462,180
  "netAmountWords"        text,
  "pfTrustBalanceAmount" numeric(18,2),                                             -- 512,340 paid by PF Trust (info)
  "employeeBankId"        uuid,                                                      -- → HumanResources.EmployeeBankAccounts "Bank Alfalah ••2210"
  "payFromBankAccountId" uuid,                                                     -- → BankCash.BankAccounts (BPV)
  "journalEntryId"        uuid,                                                      -- → Accounting.Vouchers (JV on approval)
  "paymentJournalEntryId" uuid,                                                     -- → Accounting.Vouchers BPV-2026-000318
  status                  text NOT NULL DEFAULT 'DRAFT',
  "preparedByUserId"     uuid,                                                      -- "HR — Ayesha Noor · Prepared"
  "preparedAt"             timestamptz,
  "approvalRequestId"     uuid,                                                      -- "Finance — Sana Javed · Pending review"
  "approvedByUserId"     uuid,
  "approvedAt"             timestamptz,
  "paidAt"                 timestamptz,
  remarks                 text,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "finalSettlementRunFk" FOREIGN KEY ("tenantId", "payrollRunId")
    REFERENCES "Payroll"."PayrollRuns" ("tenantId", id),
  CONSTRAINT "finalSettlementPreparedByFk" FOREIGN KEY ("tenantId", "preparedByUserId")
    REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "finalSettlementApprovedByFk" FOREIGN KEY ("tenantId", "approvedByUserId")
    REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "finalSettlementApprovalRequestFk" FOREIGN KEY ("tenantId", "approvalRequestId")
    REFERENCES "Company"."Approvals" ("tenantId", id),
  CONSTRAINT "finalSettlementNetChk" CHECK ("netAmount" = "earningsAmount" - "deductionAmount"),
  CONSTRAINT "finalSettlementApprovedChk" CHECK
    (status NOT IN ('APPROVED','PAID') OR ("approvedAt" IS NOT NULL AND "journalEntryId" IS NOT NULL)),
  CONSTRAINT "finalSettlementPaidChk" CHECK (status <> 'PAID' OR ("paidAt" IS NOT NULL AND "paymentJournalEntryId" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Payroll"."FinalSettlements"', true);
-- one live settlement per employee
CREATE UNIQUE INDEX "finalSettlementOnePerEmployee" ON "Payroll"."FinalSettlements" ("tenantId", "employeeId")
  WHERE status <> 'CANCELLED';
CREATE UNIQUE INDEX "finalSettlementOnePerOffboarding" ON "Payroll"."FinalSettlements" ("tenantId", "offboardingId")
  WHERE status <> 'CANCELLED';
CREATE INDEX "finalSettlementStatusIdx" ON "Payroll"."FinalSettlements" ("tenantId", status, "docDate" DESC);
COMMENT ON TABLE "Payroll"."FinalSettlements" IS
  'Full & final settlement of an exiting employee: exit facts, computation totals, approval and accounting (app/hr/settlement).';

-- FinalSettlementLines — "Settlement Computation" rows (Component, Basis,
-- Earnings, Deductions): Pending salary · Leave encashment · Gratuity · Notice
-- period shortfall · Advance recovery (AD-2026-019) · Income tax u/s 149 · EOBI.
CREATE TABLE "Payroll"."FinalSettlementLines" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "settlementId"           uuid NOT NULL,
  "lineNo"                 smallint NOT NULL CHECK ("lineNo" > 0),
  "componentKind"          text NOT NULL,
  direction               text NOT NULL,
  label                   text NOT NULL,                                             -- "Pending salary — September 2026"
  "basisText"              text,                                                      -- "30 days × Rs 3,600"
  quantity                numeric(18,3),                                             -- 30 / 14 / 7 / 10
  rate                    numeric(18,4),                                             -- 3,600 / 2,000 / 60,000
  amount                  numeric(18,2) NOT NULL CHECK (amount >= 0),
  "taxableAmount"          numeric(18,2) CHECK ("taxableAmount" >= 0),                 -- gratuity above Rs 300,000 exemption
  "componentId"            uuid,                                                      -- SalaryComponents when applicable
  "loanId"                 uuid,                                                      -- ADVANCE / LOAN recovery
  "accountId"              uuid,                                                      -- → Accounting.ChartOfAccounts (Dr/Cr side on approval)
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "settlementId", "lineNo"),
  CONSTRAINT "settlementComponentSettlementFk" FOREIGN KEY ("tenantId", "settlementId")
    REFERENCES "Payroll"."FinalSettlements" ("tenantId", id) ON DELETE CASCADE,
  CONSTRAINT "settlementComponentComponentFk" FOREIGN KEY ("tenantId", "componentId")
    REFERENCES "Payroll"."SalaryComponents" ("tenantId", id),
  CONSTRAINT "settlementComponentLoanFk" FOREIGN KEY ("tenantId", "loanId")
    REFERENCES "Payroll"."LoansAndAdvances" ("tenantId", id),
  CONSTRAINT "settlementComponentDirectionChk" CHECK (direction = CASE
      WHEN "componentKind" IN ('PENDING_SALARY','LEAVE_ENCASHMENT','GRATUITY','NOTICE_PAY','BONUS','OTHER_EARNING')
      THEN 'EARNING' ELSE 'DEDUCTION' END),
  CONSTRAINT "settlementComponentLoanChk" CHECK
    ("componentKind" NOT IN ('ADVANCE_RECOVERY','LOAN_RECOVERY') OR "loanId" IS NOT NULL),
  CONSTRAINT "settlementComponentTaxableChk" CHECK ("taxableAmount" IS NULL OR "taxableAmount" <= amount)
);
SELECT "Company"."addStandardTriggers"('"Payroll"."FinalSettlementLines"', true);
COMMENT ON TABLE "Payroll"."FinalSettlementLines" IS
  'Computation lines of a final settlement (earnings and deductions with basis) — app/hr/settlement.';


-- ---------------------------------------------------------------------------
-- LoanInstallments — app/hr/loans "Installment schedule preview" (#, Payroll
-- month, Installment, Balance after), ess/loans repayment schedule (#, Month,
-- Payroll run, Instalment, Balance after, Status Recovered/Next/Scheduled),
-- "Prepay" request, and settlement recovery ("Recover in F&F").
-- ---------------------------------------------------------------------------
CREATE TABLE "Payroll"."LoanInstallments" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "loanId"                 uuid NOT NULL,
  "installmentNo"          smallint NOT NULL CHECK ("installmentNo" > 0),
  "installmentType"        text NOT NULL DEFAULT 'SCHEDULED',
  "dueMonth"               date NOT NULL,                                             -- payroll month (1st)
  amount                  numeric(18,2) NOT NULL CHECK (amount > 0),                 -- 10,000
  "balanceAfter"           numeric(18,2) NOT NULL CHECK ("balanceAfter" >= 0),
  status                  text NOT NULL DEFAULT 'SCHEDULED',
                            -- "Next" is derived: first SCHEDULED row
  "payrollLineId"         uuid,                                                      -- recovered in this payroll line
  "finalSettlementId"     uuid,                                                      -- recovered in F&F
  "recoveredAt"            timestamptz,
  remarks                 text,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "loanId", "installmentNo"),
  CONSTRAINT "loanInstallmentLoanFk" FOREIGN KEY ("tenantId", "loanId")
    REFERENCES "Payroll"."LoansAndAdvances" ("tenantId", id) ON DELETE CASCADE,
  CONSTRAINT "loanInstallmentLineFk" FOREIGN KEY ("tenantId", "payrollLineId")
    REFERENCES "Payroll"."PayrollRunLines" ("tenantId", id),
  CONSTRAINT "loanInstallmentSettlementFk" FOREIGN KEY ("tenantId", "finalSettlementId")
    REFERENCES "Payroll"."FinalSettlements" ("tenantId", id),
  CONSTRAINT "loanInstallmentMonthChk" CHECK (extract(day FROM "dueMonth") = 1),
  CONSTRAINT "loanInstallmentRecoveredChk" CHECK
    (status <> 'RECOVERED' OR ("payrollLineId" IS NOT NULL AND "recoveredAt" IS NOT NULL)),
  CONSTRAINT "loanInstallmentSettledChk" CHECK
    (status <> 'SETTLED' OR ("finalSettlementId" IS NOT NULL AND "recoveredAt" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Payroll"."LoanInstallments"', true);
CREATE INDEX "loanInstallmentDueIdx"  ON "Payroll"."LoanInstallments" ("tenantId", "dueMonth", status);
CREATE INDEX "loanInstallmentLineIdx" ON "Payroll"."LoanInstallments" ("tenantId", "payrollLineId") WHERE "payrollLineId" IS NOT NULL;
COMMENT ON TABLE "Payroll"."LoanInstallments" IS
  'Recovery schedule of a loan/advance; each recovered row links to the payroll line (or final settlement) that deducted it.';


-- ---------------------------------------------------------------------------
-- TaxDeclarations — ess/tax "My declarations": Zakat (u/s 60 · deductible
-- allowance), Pension fund VPS (u/s 63 · tax credit), Donations (u/s 61),
-- Health insurance (u/s 62A); Amount, Paid to, Proof upload, badge Not declared /
-- Pending / In review / Approved, "Verified by Nida Shah · Payroll", "Proof due
-- 15 Oct for October payroll".
-- ---------------------------------------------------------------------------
CREATE TABLE "Payroll"."TaxDeclarations" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees
  "taxYear"                text NOT NULL CHECK ("taxYear" ~ '^\d{4}-\d{2}$'),          -- '2026-27' (FY 2026-27)
  "declarationType"        text NOT NULL,
  "itoSection"             text NOT NULL,
  "reliefKind"             text NOT NULL,
  amount                  numeric(18,2) NOT NULL CHECK (amount >= 0),                -- 45,000
  "paidTo"                 text,                                                      -- "Meezan Tahaffuz Pension Fund"
  "proofAttachmentId"     uuid,                                                      -- MTPF-Contribution-Statement.pdf
  "proofDueDate"          date,                                                      -- 15 Oct 2026
  "estimatedTaxSaving"    numeric(18,2) CHECK ("estimatedTaxSaving" >= 0),           -- "Saves Rs …"
  status                  text NOT NULL DEFAULT 'NOT_DECLARED',
  "submittedAt"            timestamptz,
  "verifiedByUserId"     uuid,                                                      -- Nida Shah · Payroll
  "verifiedAt"             timestamptz,
  "rejectionReason"        text,
  "effectiveFromMonth"    date,                                                      -- "applies from the next payroll"
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "employeeId", "taxYear", "declarationType"),
  CONSTRAINT "taxDeclarationProofFk" FOREIGN KEY ("tenantId", "proofAttachmentId")
    REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "taxDeclarationVerifiedByFk" FOREIGN KEY ("tenantId", "verifiedByUserId")
    REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "taxDeclarationSectionChk" CHECK ("itoSection" = CASE "declarationType"
      WHEN 'ZAKAT' THEN '60' WHEN 'DONATION' THEN '61' WHEN 'HEALTH_INSURANCE' THEN '62A' ELSE '63' END),
  CONSTRAINT "taxDeclarationReliefChk" CHECK
    ("reliefKind" = CASE WHEN "declarationType" = 'ZAKAT' THEN 'DEDUCTIBLE_ALLOWANCE' ELSE 'TAX_CREDIT' END),
  CONSTRAINT "taxDeclarationInReviewChk" CHECK (status NOT IN ('IN_REVIEW','APPROVED') OR "proofAttachmentId" IS NOT NULL),
  CONSTRAINT "taxDeclarationApprovedChk" CHECK (status <> 'APPROVED' OR "verifiedAt" IS NOT NULL),
  CONSTRAINT "taxDeclarationRejectedChk" CHECK (status <> 'REJECTED' OR "rejectionReason" IS NOT NULL),
  CONSTRAINT "taxDeclarationMonthChk" CHECK ("effectiveFromMonth" IS NULL OR extract(day FROM "effectiveFromMonth") = 1)
);
SELECT "Company"."addStandardTriggers"('"Payroll"."TaxDeclarations"', true);
CREATE INDEX "taxDeclarationReviewIdx" ON "Payroll"."TaxDeclarations" ("tenantId", "taxYear", status);
COMMENT ON TABLE "Payroll"."TaxDeclarations" IS
  'Employee declarations reducing salary withholding u/s 149: Zakat (s.60), donations (s.61), health insurance (s.62A), VPS pension (s.63) — ess/tax.';


-- ---------------------------------------------------------------------------
-- SalaryTaxSlabs — tenant copy of the FBR salaried slabs used by the engine
-- and shown on ess/tax ("FBR slabs 2026-27": Rs 0 – 0.6M exempt · 0.6M – 1.2M 1% ·
-- 1.2M – 2.2M Rs 6,000 + 11% of excess · … · Above Rs 4.1M 35%) and the payslip
-- "Slab Rs 1.2M – 2.2M · 6,000 + 11% of excess". Copied from
-- Platform.TaxMasterSalarySlabs at onboarding / budget update.
-- ---------------------------------------------------------------------------
CREATE TABLE "Payroll"."SalaryTaxSlabs" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "taxYear"                text NOT NULL CHECK ("taxYear" ~ '^\d{4}-\d{2}$'),          -- '2026-27'
  "slabNo"                 smallint NOT NULL CHECK ("slabNo" > 0),
  "incomeFrom"             numeric(18,2) NOT NULL CHECK ("incomeFrom" >= 0),           -- 1,200,000
  "incomeTo"               numeric(18,2),                                             -- 2,200,000; NULL = and above
  "fixedTax"               numeric(18,2) NOT NULL DEFAULT 0 CHECK ("fixedTax" >= 0),   -- 6,000
  "ratePercent"            numeric(7,4) NOT NULL CHECK ("ratePercent" BETWEEN 0 AND 100),   -- 11
  "sourceMasterId"        uuid REFERENCES "Platform"."TaxMasterSalarySlabs" (id),
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "taxYear", "slabNo"),
  CONSTRAINT "salaryTaxSlabRangeChk" CHECK ("incomeTo" IS NULL OR "incomeTo" > "incomeFrom"),
  CONSTRAINT "salaryTaxSlabNoOverlap" EXCLUDE USING gist
    ("tenantId" WITH =, "taxYear" WITH =, numrange("incomeFrom", "incomeTo", '[)') WITH &&)
);
SELECT "Company"."addStandardTriggers"('"Payroll"."SalaryTaxSlabs"', true);
COMMENT ON TABLE "Payroll"."SalaryTaxSlabs" IS
  'FBR salaried-individual tax slabs per tax year (tenant copy) used for the u/s 149 projection — ess/tax, payslip tax computation.';

-- PayrollRunLines.taxSlabId points at the slab applied (added now that the table exists)
ALTER TABLE "Payroll"."PayrollRunLines"
  ADD CONSTRAINT "payrollLineTaxSlabFk" FOREIGN KEY ("tenantId", "taxSlabId")
  REFERENCES "Payroll"."SalaryTaxSlabs" ("tenantId", id);


-- =============================================================================
-- Functions & triggers
-- =============================================================================

-- Run number. REGULAR runs are one per month and numbered from the month
-- itself (PR-2026-09, as in the prototype and the Numbering screen
-- "PR-{YYYY}-" pad 2); OFF_CYCLE / BONUS_ONLY runs draw from the PRUN doc
-- sequence, configured with pattern '{PREFIX}-{YYYY}-OFF-{SEQ2}' (PR-2026-OFF-02).
CREATE OR REPLACE FUNCTION "Payroll"."getNextPayrollRunNo"("pRunType" text, "pPayrollMonth" date)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF "pRunType" = 'REGULAR' THEN
    RETURN 'PR-' || to_char("pPayrollMonth", 'YYYY-MM');
  ELSIF "pRunType" IN ('OFF_CYCLE','BONUS_ONLY') THEN
    RETURN "Company"."getNextDocNo"('PRUN', "pPayrollMonth");
  END IF;
  RAISE EXCEPTION 'Unknown payroll run type %', "pRunType";
END $$;
COMMENT ON FUNCTION "Payroll"."getNextPayrollRunNo"(text, date) IS
  'PR-YYYY-MM for regular runs (unique per month by index); PRUN sequence (PR-YYYY-OFF-NN) for off-cycle and bonus runs.';

-- Recomputes run totals from its lines (called after calculation / edits).
CREATE OR REPLACE FUNCTION "Payroll"."refreshPayrollRunTotals"("pRunId" uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  t        record;
BEGIN
  SELECT count(*)                                         AS n,
         COALESCE(sum(l."grossAmount"), 0)                 AS gross,
         COALESCE(sum(l."taxAmount"), 0)                   AS tax,
         COALESCE(sum(l."eobiAmount"), 0)                  AS eobi,
         COALESCE(sum(l."pfAmount"), 0)                    AS pf,
         COALESCE(sum(l."loanAmount"), 0)                  AS loan,
         COALESCE(sum(l."deductionAmount"), 0)             AS ded,
         COALESCE(sum(l."netAmount"), 0)                   AS net,
         COALESCE(sum(l."employerEobiAmount" + l."employerPessiAmount" + l."employerPfAmount"), 0) AS er
    INTO t
    FROM "Payroll"."PayrollRunLines" l
   WHERE l."tenantId" = "vTenant" AND l."payrollRunId" = "pRunId" AND NOT l."isOnHold";

  UPDATE "Payroll"."PayrollRuns" r
     SET "employeeCount"               = t.n,
         "grossAmount"                 = t.gross,
         "taxAmount"                   = t.tax,
         "eobiEmployeeAmount"         = t.eobi,
         "pfEmployeeAmount"           = t.pf,
         "loanAmount"                  = t.loan,
         "deductionAmount"             = t.ded,
         "netAmount"                   = t.net,
         "employerContributionAmount" = t.er,
         "calculatedAt"                = now()
   WHERE r."tenantId" = "vTenant" AND r.id = "pRunId";
END $$;
COMMENT ON FUNCTION "Payroll"."refreshPayrollRunTotals"(uuid) IS
  'Rolls PayrollRunLines amounts (excluding lines on hold) up to PayrollRuns totals.';

-- Recomputes a final settlement's earnings / deductions / net from its lines.
CREATE OR REPLACE FUNCTION "Payroll"."refreshFinalSettlementTotals"("pSettlementId" uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  t        record;
BEGIN
  SELECT COALESCE(sum(c.amount) FILTER (WHERE c.direction = 'EARNING'), 0)   AS earn,
         COALESCE(sum(c.amount) FILTER (WHERE c.direction = 'DEDUCTION'), 0) AS ded
    INTO t
    FROM "Payroll"."FinalSettlementLines" c
   WHERE c."tenantId" = "vTenant" AND c."settlementId" = "pSettlementId";

  UPDATE "Payroll"."FinalSettlements" s
     SET "earningsAmount"  = t.earn,
         "deductionAmount" = t.ded,
         "netAmount"       = t.earn - t.ded
   WHERE s."tenantId" = "vTenant" AND s.id = "pSettlementId";
END $$;

-- Guard: once a run leaves DRAFT/REVIEW its inputs and component lines are
-- frozen; PayrollRunLines may then only change its payment / hold fields.
CREATE OR REPLACE FUNCTION "Payroll"."triggerGuardRunChildren"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vRow"    record;
  "vRunId" uuid;
  "vStatus" text;
BEGIN
  IF TG_OP = 'DELETE' THEN "vRow" := OLD; ELSE "vRow" := NEW; END IF;

  IF TG_TABLE_NAME = 'PayrollRunLineComponents' THEN
    SELECT l."payrollRunId" INTO "vRunId"
      FROM "Payroll"."PayrollRunLines" l
     WHERE l."tenantId" = "vRow"."tenantId" AND l.id = "vRow"."payrollLineId";
  ELSE
    "vRunId" := "vRow"."payrollRunId";
  END IF;

  SELECT r.status INTO "vStatus"
    FROM "Payroll"."PayrollRuns" r
   WHERE r."tenantId" = "vRow"."tenantId" AND r.id = "vRunId";

  IF "vStatus" IS NULL OR "vStatus" IN ('DRAFT','REVIEW') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- nested IF: the inner test names PayrollRunLines columns and must only be
  -- evaluated when the trigger fires on PayrollRunLines
  IF TG_TABLE_NAME = 'PayrollRunLines' AND TG_OP = 'UPDATE' THEN
    IF (OLD."grossAmount", OLD."deductionAmount", OLD."netAmount", OLD."paidDays",
        OLD."taxAmount", OLD."eobiAmount", OLD."pfAmount", OLD."loanAmount",
        OLD."employerEobiAmount", OLD."employerPessiAmount", OLD."employerPfAmount")
       IS NOT DISTINCT FROM
       (NEW."grossAmount", NEW."deductionAmount", NEW."netAmount", NEW."paidDays",
        NEW."taxAmount", NEW."eobiAmount", NEW."pfAmount", NEW."loanAmount",
        NEW."employerEobiAmount", NEW."employerPessiAmount", NEW."employerPfAmount") THEN
      RETURN NEW;   -- payment batch / transfer ref / hold flag may still be set
    END IF;
  END IF;

  RAISE EXCEPTION 'Payroll run is % — % on payroll.% is not allowed (send the run back to REVIEW or reverse it)',
                  "vStatus", TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END $$;

CREATE TRIGGER "payrollInputGuard" BEFORE INSERT OR UPDATE OR DELETE ON "Payroll"."PayrollAdjustments"
  FOR EACH ROW EXECUTE FUNCTION "Payroll"."triggerGuardRunChildren"();
CREATE TRIGGER "payrollLineGuard" BEFORE INSERT OR UPDATE OR DELETE ON "Payroll"."PayrollRunLines"
  FOR EACH ROW EXECUTE FUNCTION "Payroll"."triggerGuardRunChildren"();
CREATE TRIGGER "payrollLineComponentGuard" BEFORE INSERT OR UPDATE OR DELETE ON "Payroll"."PayrollRunLineComponents"
  FOR EACH ROW EXECUTE FUNCTION "Payroll"."triggerGuardRunChildren"();

-- Keeps loan.recoveredAmount / outstandingAmount / status in step with the
-- schedule: RECOVERED (payroll) and SETTLED (final settlement) rows count as
-- recovered; a fully recovered ACTIVE/SETTLEMENT loan becomes CLOSED.
CREATE OR REPLACE FUNCTION "Payroll"."triggerLoanInstallmentSync"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vRow"       record;
  "vRecovered" numeric(18,2);
BEGIN
  IF TG_OP = 'DELETE' THEN "vRow" := OLD; ELSE "vRow" := NEW; END IF;

  SELECT COALESCE(sum(i.amount), 0) INTO "vRecovered"
    FROM "Payroll"."LoanInstallments" i
   WHERE i."tenantId" = "vRow"."tenantId" AND i."loanId" = "vRow"."loanId"
     AND i.status IN ('RECOVERED','SETTLED');

  UPDATE "Payroll"."LoansAndAdvances" l
     SET "recoveredAmount" = "vRecovered",
         status    = CASE WHEN l.status IN ('ACTIVE','SETTLEMENT')
                               AND COALESCE(l."approvedAmount", l."requestedAmount") - "vRecovered" = 0
                          THEN 'CLOSED' ELSE l.status END,
         "closedAt" = CASE WHEN l.status IN ('ACTIVE','SETTLEMENT')
                               AND COALESCE(l."approvedAmount", l."requestedAmount") - "vRecovered" = 0
                          THEN now() ELSE l."closedAt" END
   WHERE l."tenantId" = "vRow"."tenantId" AND l.id = "vRow"."loanId";
  RETURN NULL;
END $$;

CREATE TRIGGER "loanInstallmentSync" AFTER INSERT OR UPDATE OF status, amount OR DELETE ON "Payroll"."LoanInstallments"
  FOR EACH ROW EXECUTE FUNCTION "Payroll"."triggerLoanInstallmentSync"();
