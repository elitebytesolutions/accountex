-- =============================================================================
-- Finsoft ERP (FULL) — 11-hr.sql
-- HR: organisation, employees, time & attendance, leave, lifecycle, talent.
-- FULL EDITION ONLY (erp-basic has no 11-hr.sql).
--
-- Screens (src/50-hr-core.html unless noted):
--   People ........... app/hr/employees, app/hr/employees/new, app/hr/employees/view,
--                      app/hr/departments, app/hr/org
--   Time & attendance  app/hr/attendance, app/hr/attendance/register,
--                      app/hr/attendance/requests, app/hr/devices, app/hr/shifts,
--                      app/hr/holidays, app/hr/overtime
--   Leave ............ app/hr/leave, app/hr/leave/balances, app/hr/leave/policies,
--                      app/hr/leave/requests
--   Lifecycle/talent . app/hr/onboarding, app/hr/offboarding, app/hr/recruitment,
--                      app/hr/performance, app/hr/training   (src/51-hr-pay-talent.html)
--   Reports .......... app/hr/reports (src/45-studios.html + src/96-studio.js → views)
--   ESS shares these tables: ess/attendance (corrections), ess/leave, ess/goals,
--   ess/onboarding (src/9C-ess.js).
--
-- HR posts nothing to the GL. Approved overtime and leave encashment are picked
-- up by payroll (12-payroll.sql) — see _parts/posting-hr.md.
--
-- Cross-module FKs (Accounting.CostCentres, FixedAssets.FixedAssets, BankCash.Banks, Payroll.PayrollRuns)
-- live in database/fk/11-hr-fks.sql. Inline FKs here go only to hr.*, core.*,
-- platform.*.
--
-- Helper tables added inside hr (not in the contract registry):
--   BranchHrSettings, LeaveYearEndClosings, OnboardingTemplates, OnboardingTemplateTasks
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: start date of the leave year that contains pDate. Leave year =
-- the tenant's fiscal year (Finsoft default Jul–Jun: "Leave year Jul 2026 – Jun 2027").
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."getLeaveYearStart"("pTenant" uuid, "pDate" date)
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT make_date(CASE WHEN extract(month FROM "pDate")::int >= s.m
                        THEN extract(year FROM "pDate")::int
                        ELSE extract(year FROM "pDate")::int - 1 END,
                   s.m, 1)
    FROM (SELECT COALESCE((SELECT t."fiscalYearStartMonth"::int
                             FROM "Platform"."Tenants" t WHERE t.id = "pTenant"), 7) AS m) s
$$;
COMMENT ON FUNCTION "HumanResources"."getLeaveYearStart"(uuid, date) IS
  'First day of the leave year (= tenant fiscal year, default July) containing the date.';

-- =============================================================================
-- 1. ORGANISATION
-- =============================================================================

-- ---------------------------------------------------------------------------
-- grade — app/hr/departments, tab "Designations & Grades" → "Grade bands"
-- (Grade · Level · Min / Mid / Max (Rs) · Staff) and modal "Add grade band"
-- (Grade code, Level name, Min, Mid, Max). Profile: "G-5 (Executive) · band
-- Rs 140,000 – 220,000". Staff count is derived (v_designation_positions).
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."Grades" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code             text NOT NULL CHECK (code ~ '^[A-Z]{1,3}-?[0-9]{1,2}$'),   -- G-5
  "levelRank"       smallint NOT NULL CHECK ("levelRank" BETWEEN 1 AND 99),    -- 5 (ordering; "G-1 to G-5")
  "levelName"       text NOT NULL,                                            -- Executive
  "minSalary"       numeric(18,2) NOT NULL CHECK ("minSalary" >= 0),           -- monthly gross band
  "midSalary"       numeric(18,2) NOT NULL,
  "maxSalary"       numeric(18,2) NOT NULL,
  "isActive"        boolean NOT NULL DEFAULT true,
  "deletedAt"       timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  UNIQUE ("tenantId", "levelRank"),
  CONSTRAINT "gradeBandOrderChk" CHECK ("minSalary" <= "midSalary" AND "midSalary" <= "maxSalary")
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."Grades"', true);
COMMENT ON TABLE "HumanResources"."Grades" IS 'Grade bands (G-1 … G-8) with monthly gross min/mid/max. app/hr/departments.';

-- ---------------------------------------------------------------------------
-- department — app/hr/departments tab "Departments" (Department · Code · Head ·
-- Headcount · Cost centre · Annual budget · YTD payroll · Utilisation) and modal
-- "Add department" (name, code, parent, head, cost centre, annual budget,
-- description). Division = HR Report Studio grouping (Commercial / Operations /
-- Support, 96-studio.js DEPTS). Headcount / YTD payroll / utilisation are derived.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."Departments" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code               text NOT NULL CHECK (code ~ '^[A-Z0-9]{2,10}$'),       -- SAL, OPS, WHS
  name               text NOT NULL,                                         -- Sales
  description        text,                                                  -- "North & South regions"
  "parentId"          uuid,                                                  -- "Sales — North Region" under Sales
  division           text,
  "headEmployeeId"   uuid,                                                  -- FK added after HumanResources.Employees
  "costCentreId"     uuid,                                                  -- → Accounting.CostCentres (fk file)
  "annualBudget"      numeric(18,2) CHECK ("annualBudget" >= 0),              -- 96,000,000
  "isActive"          boolean NOT NULL DEFAULT true,
  "deletedAt"         timestamptz,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  CONSTRAINT "departmentParentFk" FOREIGN KEY ("tenantId", "parentId") REFERENCES "HumanResources"."Departments" ("tenantId", id),
  CONSTRAINT "departmentNotOwnParentChk" CHECK ("parentId" IS NULL OR "parentId" <> id)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."Departments"', true);
CREATE INDEX "departmentParentIdx" ON "HumanResources"."Departments" ("tenantId", "parentId");
COMMENT ON TABLE "HumanResources"."Departments" IS 'Departments with head, cost centre and annual budget. app/hr/departments, app/hr/org.';

-- ---------------------------------------------------------------------------
-- designation — tab "Designations & Grades" → "Designations" (Designation ·
-- Department · Grade · Filled · Open) and modal "Add designation" (Title,
-- Department, Grade, Approved positions, Reports to). Filled/Open derived.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."Designations" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  title                  text NOT NULL,                                     -- Sales Executive
  "departmentId"          uuid NOT NULL,
  "gradeId"               uuid,
  "approvedPositions"     integer NOT NULL DEFAULT 1 CHECK ("approvedPositions" >= 0),
  "reportsToDesignationId" uuid,                                           -- Sales Manager
  "isActive"              boolean NOT NULL DEFAULT true,
  "deletedAt"             timestamptz,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "departmentId", title),
  CONSTRAINT "designationDepartmentIdFk" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "HumanResources"."Departments" ("tenantId", id),
  CONSTRAINT "designationGradeIdFk" FOREIGN KEY ("tenantId", "gradeId") REFERENCES "HumanResources"."Grades" ("tenantId", id),
  CONSTRAINT "designationReportsToFk" FOREIGN KEY ("tenantId", "reportsToDesignationId") REFERENCES "HumanResources"."Designations" ("tenantId", id),
  CONSTRAINT "designationNotSelfChk" CHECK ("reportsToDesignationId" IS NULL OR "reportsToDesignationId" <> id)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."Designations"');
CREATE INDEX "designationGradeIdx" ON "HumanResources"."Designations" ("tenantId", "gradeId");
COMMENT ON TABLE "HumanResources"."Designations" IS 'Positions per department with grade and approved (budgeted) headcount. app/hr/departments.';

-- ---------------------------------------------------------------------------
-- shift — app/hr/shifts "Shift definitions" (Shift · Code · Timing · Hours ·
-- Grace · Break · Half-day after · Weekly off · Employees · Status) and modal
-- "New shift" (name, code, colour, start, end, grace, break start/end, half-day
-- if worked < hrs, late marks for ½-day deduction, weekly off, OT starts after,
-- night shift, extended Friday break for Jumu'ah). Ramzan timings = seasonal
-- shift ("Auto-applies 1–30 Ramadan", "Seasonal · Feb 2027").
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."WorkShifts" (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                     text NOT NULL CHECK (code ~ '^[A-Z0-9]{2,6}$'),  -- GEN, MOR, EVE, NGT, SAT, RMZ
  name                     text NOT NULL,                                   -- General
  description              text,                                            -- "Default — offices"
  colour                   text NOT NULL DEFAULT 'TEAL',
  "startTime"               time NOT NULL,                                   -- 09:00
  "endTime"                 time NOT NULL,                                   -- 18:00
  "crossesMidnight"         boolean NOT NULL DEFAULT false,                  -- "Night shift — crosses midnight" (+1 day)
  "scheduledHours"          numeric(5,2) GENERATED ALWAYS AS (
                             round((extract(epoch FROM ("endTime" - "startTime")) / 3600
                                    + CASE WHEN "endTime" < "startTime" THEN 24 ELSE 0 END)::numeric, 2)) STORED,
  "graceMinutes"            smallint NOT NULL DEFAULT 15 CHECK ("graceMinutes" BETWEEN 0 AND 240),
  "breakStart"              time,                                            -- 13:00
  "breakEnd"                time,                                            -- 14:00
  "fridayExtendedBreak"    boolean NOT NULL DEFAULT false,                  -- Jumu'ah
  "fridayBreakEnd"         time,                                            -- 14:30 ("Fri 13:00 – 14:30")
  "prayerBreakNote"        text,                                            -- "Zuhr 13:15 – 13:35" (Ramzan)
  "halfDayBelowHours"     numeric(4,2) CHECK ("halfDayBelowHours" > 0),   -- 4 hrs
  "lateMarksPerHalfDay"  smallint CHECK ("lateMarksPerHalfDay" > 0),    -- 3 lates = ½ day
  "overtimeAfterMinutes"   smallint NOT NULL DEFAULT 30 CHECK ("overtimeAfterMinutes" >= 0),
  "weeklyOff"               text NOT NULL DEFAULT 'SUNDAY',
  "isDefault"               boolean NOT NULL DEFAULT false,
  "isSeasonal"              boolean NOT NULL DEFAULT false,
  season                   text,
  "validFrom"               date,                                            -- seasonal window
  "validTo"                 date,
  status                   text NOT NULL DEFAULT 'ACTIVE',
  "deletedAt"               timestamptz,
  "createdAt"               timestamptz NOT NULL DEFAULT now(),
  "createdBy"               uuid,
  "updatedAt"               timestamptz NOT NULL DEFAULT now(),
  "updatedBy"               uuid,
  "rowVersion"              integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  CONSTRAINT "shiftTimesChk" CHECK ("startTime" <> "endTime"),
  CONSTRAINT "shiftMidnightChk" CHECK ("crossesMidnight" = ("endTime" < "startTime")),
  CONSTRAINT "shiftBreakPairChk" CHECK (("breakStart" IS NULL) = ("breakEnd" IS NULL)),
  CONSTRAINT "shiftFridayBreakChk" CHECK ("fridayBreakEnd" IS NULL OR "fridayExtendedBreak"),
  CONSTRAINT "shiftSeasonChk" CHECK ("isSeasonal" = (season IS NOT NULL)),
  CONSTRAINT "shiftValidRangeChk" CHECK ("validTo" IS NULL OR "validFrom" IS NULL OR "validTo" >= "validFrom")
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."WorkShifts"');
CREATE UNIQUE INDEX "shiftOneDefault" ON "HumanResources"."WorkShifts" ("tenantId") WHERE "isDefault" AND "deletedAt" IS NULL;
COMMENT ON TABLE "HumanResources"."WorkShifts" IS 'Shift timings, grace, break, half-day and late-mark rules. app/hr/shifts.';

-- =============================================================================
-- 2. EMPLOYEE
-- =============================================================================

-- ---------------------------------------------------------------------------
-- employee — app/hr/employees (cards + table: Employee, EMP code, Department,
-- Designation, Branch, Joining date, Type, Status; chips All/Active/Probation/
-- Notice), app/hr/employees/new (wizard steps 1–2: Identity, Contact, Position,
-- Employment terms), app/hr/employees/view (Personal, Contact & address,
-- Emergency contact, Employment panels; "Edit employee" modal).
-- Field-role flags drive distribution pickers (91-data.js salesTeam: bookers,
-- deliverymen, salesmen, supervisors).
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."Employees" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                   text NOT NULL,                                     -- EMP-0042 (Company.getNextDocNo('EMP'))
  -- identity (wizard step 1 "Must match NADRA CNIC exactly")
  "firstName"             text NOT NULL,                                     -- Bilal
  "lastName"              text NOT NULL,                                     -- Khan
  "displayName"           text GENERATED ALWAYS AS ("firstName" || ' ' || "lastName") STORED,
  "legalName"             text,                                              -- "Muhammad Bilal Khan" (Full name, as per CNIC)
  "guardianName"          text NOT NULL,                                     -- Father / husband name *
  "guardianRelation"      text NOT NULL DEFAULT 'FATHER',
  cnic                   text NOT NULL CHECK (cnic ~ '^\d{5}-\d{7}-\d$'),
  "cnicIssueDate"        date,
  "cnicExpiryDate"       date,
  "dateOfBirth"          date NOT NULL,
  gender                 text NOT NULL,
  "maritalStatus"         text,
  "childrenCount"         smallint CHECK ("childrenCount" >= 0),              -- "Married · 1 child"
  religion               text,
  "bloodGroup"            text,
  nationality            text NOT NULL DEFAULT 'PAKISTANI',
  "photoAttachmentId"    uuid,                                              -- "Passport-size photo"
  -- contact
  mobile                 text NOT NULL,                                     -- +92 302 6658412
  "personalEmail"         citext,
  "workEmail"             citext,
  "currentAddress"        text,
  "permanentAddress"      text,
  city                   text,
  "emergencyContactName" text,                                              -- Saba Bilal
  "emergencyRelation"     text,                                              -- Spouse
  "emergencyPhone"        text,
  "emergencyAltName"     text,                                              -- "Alternate: Muhammad Aslam Khan (Father)"
  "emergencyAltRelation" text,
  "emergencyAltPhone"    text,
  -- job & organisation (wizard step 2 "Position")
  "departmentId"          uuid NOT NULL,
  "designationId"         uuid NOT NULL,
  "gradeId"               uuid,
  "reportingManagerId"   uuid,                                              -- self FK
  "costCentreId"         uuid,                                              -- → Accounting.CostCentres (fk file)
  "branchId"              uuid NOT NULL,
  "shiftId"               uuid,
  "weeklyOff"             text NOT NULL DEFAULT 'SUNDAY',
  "payGroup"              text NOT NULL DEFAULT 'STAFF',  -- HR studio "Pay Group"
  -- employment terms
  "employmentType"        text NOT NULL,
  "workPattern"           text NOT NULL DEFAULT 'FULL_TIME',  -- "Permanent · Full-time"
  "joiningDate"           date NOT NULL,
  "probationMonths"       smallint NOT NULL DEFAULT 3 CHECK ("probationMonths" BETWEEN 0 AND 24),
  "confirmationDueOn"    date,
  "confirmedOn"           date,                                              -- "confirmed 01 Oct 2021"
  "contractEndDate"      date,
  "noticeDays"            smallint NOT NULL DEFAULT 30 CHECK ("noticeDays" BETWEEN 0 AND 365),
  "biometricId"           text,                                              -- ZK-LHR-0042
  -- field roles (distribution: booker / salesman / deliveryman / supervisor FKs)
  "isBooker"              boolean NOT NULL DEFAULT false,
  "isSalesman"            boolean NOT NULL DEFAULT false,
  "isDeliveryman"         boolean NOT NULL DEFAULT false,
  "isSupervisor"          boolean NOT NULL DEFAULT false,
  -- status & exit
  status                 text NOT NULL DEFAULT 'PROBATION',
  "exitDate"              date,
  "exitType"              text,
  -- ESS login ("Create ESS login and send welcome email")
  "appUserId"            uuid,
  "deletedAt"             timestamptz,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  UNIQUE ("tenantId", cnic),                                                  -- import: "Skip rows where CNIC already exists"
  UNIQUE ("tenantId", "biometricId"),
  UNIQUE ("tenantId", "appUserId"),
  CONSTRAINT "employeePhotoFk" FOREIGN KEY ("tenantId", "photoAttachmentId") REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "employeeDepartmentIdFk" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "HumanResources"."Departments" ("tenantId", id),
  CONSTRAINT "employeeDesignationIdFk" FOREIGN KEY ("tenantId", "designationId") REFERENCES "HumanResources"."Designations" ("tenantId", id),
  CONSTRAINT "employeeGradeIdFk" FOREIGN KEY ("tenantId", "gradeId") REFERENCES "HumanResources"."Grades" ("tenantId", id),
  CONSTRAINT "employeeReportingManagerIdFk" FOREIGN KEY ("tenantId", "reportingManagerId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "employeeBranchIdFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "employeeShiftIdFk" FOREIGN KEY ("tenantId", "shiftId") REFERENCES "HumanResources"."WorkShifts" ("tenantId", id),
  CONSTRAINT "employeeAppUserIdFk" FOREIGN KEY ("tenantId", "appUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "employeeNotOwnManagerChk" CHECK ("reportingManagerId" IS NULL OR "reportingManagerId" <> id),
  CONSTRAINT "employeeCnicDatesChk" CHECK ("cnicExpiryDate" IS NULL OR "cnicIssueDate" IS NULL OR "cnicExpiryDate" > "cnicIssueDate"),
  CONSTRAINT "employeeDobChk" CHECK ("dateOfBirth" < "joiningDate"),
  CONSTRAINT "employeeConfirmationChk" CHECK ("confirmationDueOn" IS NULL OR "confirmationDueOn" >= "joiningDate"),
  CONSTRAINT "employeeConfirmedChk" CHECK ("confirmedOn" IS NULL OR "confirmedOn" >= "joiningDate"),
  CONSTRAINT "employeeExitChk" CHECK ((status = 'EXITED') = ("exitDate" IS NOT NULL) AND ("exitDate" IS NULL OR "exitDate" >= "joiningDate")),
  CONSTRAINT "employeeExitTypeChk" CHECK ("exitType" IS NULL OR "exitDate" IS NOT NULL),
  CONSTRAINT "employeeContractEndChk" CHECK ("contractEndDate" IS NULL OR "contractEndDate" >= "joiningDate")
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."Employees"', true);
CREATE INDEX "employeeListIdx"        ON "HumanResources"."Employees" ("tenantId", status, "departmentId", "branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX "employeeManagerIdx"     ON "HumanResources"."Employees" ("tenantId", "reportingManagerId");
CREATE INDEX "employeeDesignationIdx" ON "HumanResources"."Employees" ("tenantId", "designationId");
CREATE INDEX "employeeJoiningIdx"     ON "HumanResources"."Employees" ("tenantId", "joiningDate");
CREATE INDEX "employeeFieldRoleIdx"  ON "HumanResources"."Employees" ("tenantId") WHERE "isBooker" OR "isSalesman" OR "isDeliveryman" OR "isSupervisor";
CREATE INDEX "employeeNameTrgmIdx"   ON "HumanResources"."Employees" USING gin ("displayName" gin_trgm_ops);
COMMENT ON TABLE "HumanResources"."Employees" IS 'Employee master (EMP-0042): identity per CNIC, contact, job, terms, status, field roles. app/hr/employees*.';
COMMENT ON COLUMN "HumanResources"."Employees"."isBooker" IS 'Order booker — eligible for Distribution.Routes / OrderBookings bookerEmployeeId.';
COMMENT ON COLUMN "HumanResources"."Employees".status IS 'ACTIVE / PROBATION / ON_LEAVE (long leave) / NOTICE_PERIOD (offboarding open) / EXITED.';

ALTER TABLE "HumanResources"."Departments"
  ADD CONSTRAINT "departmentHeadEmployeeIdFk" FOREIGN KEY ("tenantId", "headEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- BranchHrSettings (helper) — app/hr/departments tab "Branches" cards
-- (Manager, Social security PESSI/SESSI/n-a, Devices) and modal "Add branch"
-- (Social security scheme, Branch manager, Default shift). Company.Branches owns
-- name/code/address/province; these are the HR-only attributes per branch.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."BranchHrSettings" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "branchId"               uuid NOT NULL,
  "socialSecurityScheme"  text NOT NULL DEFAULT 'NONE',
  "managerEmployeeId"     uuid,
  "defaultShiftId"        uuid,
  "geofenceLat"            numeric(9,6) CHECK ("geofenceLat" BETWEEN -90 AND 90),     -- ESS geofence "Lahore HQ · 150 m radius"
  "geofenceLng"            numeric(9,6) CHECK ("geofenceLng" BETWEEN -180 AND 180),
  "geofenceRadiusM"       integer CHECK ("geofenceRadiusM" > 0),
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "branchId"),
  CONSTRAINT "branchHrSettingBranchIdFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "branchHrSettingManagerFk" FOREIGN KEY ("tenantId", "managerEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "branchHrSettingShiftFk" FOREIGN KEY ("tenantId", "defaultShiftId") REFERENCES "HumanResources"."WorkShifts" ("tenantId", id),
  CONSTRAINT "branchHrSettingGeofenceChk" CHECK (("geofenceLat" IS NULL) = ("geofenceLng" IS NULL)
                                                  AND ("geofenceRadiusM" IS NULL OR "geofenceLat" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."BranchHrSettings"');
COMMENT ON TABLE "HumanResources"."BranchHrSettings" IS 'HR attributes per branch: social security scheme, manager, default shift, ESS geofence.';

-- ---------------------------------------------------------------------------
-- EmployeeStatutoryDetails — profile "Bank & statutory" (EOBI No., PESSI No., NTN,
-- Tax status Filer (ATL)); wizard step 3 toggles (EOBI, PESSI/SESSI, PF 8.33%
-- after confirmation, group life & health insurance, Overtime eligible) and
-- step 4 "Statutory numbers" (EOBI registration no., PESSI no., NTN, ATL status).
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."EmployeeStatutoryDetails" (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"              uuid NOT NULL,
  "eobiApplicable"          boolean NOT NULL DEFAULT true,                   -- 5% employer / 1% employee
  "eobiNo"                  text,                                            -- EOBI-LHR-0847213
  "eobiRegisteredOn"       date,                                            -- onboarding "EOBI registration (PR-02)"
  "socialSecurityApplicable" boolean NOT NULL DEFAULT true,
  "socialSecurityScheme"   text,
  "socialSecurityNo"       text,                                            -- PESSI-0391-77412
  ntn                      text,                                            -- 3520248-7
  "atlStatus"               text NOT NULL DEFAULT 'NON_FILER',
  "pfApplicable"            boolean NOT NULL DEFAULT false,
  "pfFromDate"             date,                                            -- "after confirmation"
  "groupInsurance"          boolean NOT NULL DEFAULT false,
  "overtimeEligible"        boolean NOT NULL DEFAULT false,
  "createdAt"               timestamptz NOT NULL DEFAULT now(),
  "createdBy"               uuid,
  "updatedAt"               timestamptz NOT NULL DEFAULT now(),
  "updatedBy"               uuid,
  "rowVersion"              integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "employeeId"),
  CONSTRAINT "employeeStatutoryEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "employeeStatutorySsChk" CHECK ("socialSecurityNo" IS NULL OR "socialSecurityScheme" IS NOT NULL),
  CONSTRAINT "employeeStatutoryPfChk" CHECK ("pfFromDate" IS NULL OR "pfApplicable")
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."EmployeeStatutoryDetails"', true);
COMMENT ON TABLE "HumanResources"."EmployeeStatutoryDetails" IS 'EOBI, PESSI/SESSI, NTN/ATL, PF, insurance and OT eligibility per employee (1:1).';

-- ---------------------------------------------------------------------------
-- EmployeeBankAccounts — wizard step 4 "Bank account" (Bank, Branch, Account title,
-- IBAN, Payment mode Bank transfer/Cheque/Cash); profile "Bank & statutory".
-- Salary is disbursed via payroll bank advice file.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."EmployeeBankAccounts" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"        uuid NOT NULL,
  "paymentMode"       text NOT NULL DEFAULT 'BANK',
  "bankId"            uuid,                                                  -- → BankCash.Banks (fk file)
  "bankName"          text,                                                  -- Meezan Bank (as shown / when not in BankCash.Banks)
  "branchName"        text,                                                  -- Johar Town Branch
  "accountTitle"      text,
  iban               text CHECK (iban IS NULL OR iban ~ '^PK[0-9]{2}[A-Z]{4}[0-9A-Z]{16}$'),  -- stored without spaces
  "isPrimary"         boolean NOT NULL DEFAULT true,
  "effectiveFrom"     date NOT NULL DEFAULT current_date,
  "isActive"          boolean NOT NULL DEFAULT true,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "employeeBankEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "employeeBankModeChk" CHECK ("paymentMode" <> 'BANK'
                                           OR (iban IS NOT NULL AND "accountTitle" IS NOT NULL
                                               AND ("bankId" IS NOT NULL OR "bankName" IS NOT NULL)))
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."EmployeeBankAccounts"', true);
CREATE UNIQUE INDEX "employeeBankOnePrimary" ON "HumanResources"."EmployeeBankAccounts" ("tenantId", "employeeId") WHERE "isPrimary" AND "isActive";
COMMENT ON TABLE "HumanResources"."EmployeeBankAccounts" IS 'Salary disbursement account (IBAN) and payment mode per employee.';

-- ---------------------------------------------------------------------------
-- EmployeeLetters — profile modal "Generate letter" (Template, Addressed to, Letter
-- date, Signatory, Language, Include salary breakup, Email PDF to employee;
-- toast "Salary certificate generated — HR/LTR/2026/0318"). Also the
-- system-generated "Promotion letter" / "Increment letter" documents.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."EmployeeLetters" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "letterNo"              text NOT NULL,                                     -- HR/LTR/2026/0318
  "employeeId"            uuid NOT NULL,
  "letterType"            text NOT NULL,
  "docTemplateId"        uuid,                                              -- Company.DocumentTemplates ("HR letter templates")
  "addressedTo"           text,                                              -- The Manager, Meezan Bank
  "letterDate"            date NOT NULL DEFAULT current_date,
  "signatoryEmployeeId"  uuid,                                              -- Ayesha Noor — HR Manager
  language               text NOT NULL DEFAULT 'EN',
  "includeSalary"         boolean NOT NULL DEFAULT false,
  "emailToEmployee"      boolean NOT NULL DEFAULT false,
  "emailedAt"             timestamptz,
  "pdfAttachmentId"      uuid,
  "verificationCode"      text,                                              -- QR verification (ess/requests "QR code anyone can verify")
  status                 text NOT NULL DEFAULT 'ISSUED',
  remarks                text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "letterNo"),
  UNIQUE ("tenantId", "verificationCode"),
  CONSTRAINT "hrLetterEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "hrLetterDocTemplateFk" FOREIGN KEY ("tenantId", "docTemplateId") REFERENCES "Company"."DocumentTemplates" ("tenantId", id),
  CONSTRAINT "hrLetterSignatoryFk" FOREIGN KEY ("tenantId", "signatoryEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "hrLetterPdfFk" FOREIGN KEY ("tenantId", "pdfAttachmentId") REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "hrLetterIssuedPdfChk" CHECK (status IN ('DRAFT','VOID') OR "pdfAttachmentId" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."EmployeeLetters"', true);
CREATE INDEX "hrLetterEmployeeIdx" ON "HumanResources"."EmployeeLetters" ("tenantId", "employeeId", "letterDate" DESC);
COMMENT ON TABLE "HumanResources"."EmployeeLetters" IS 'Letters generated from HR templates (salary certificate, experience, NOC, increment…).';

-- ---------------------------------------------------------------------------
-- EmployeeDocuments — profile tab "Documents" (file, category · expiry, badge
-- Verified / Signed / Uploaded / Issued / Missing; "Request" for missing) and
-- wizard step 4 "Documents" (CNIC, degree, experience letters, photo, police
-- certificate "Pending — required within 30 days", signed offer letter).
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."EmployeeDocuments" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"         uuid NOT NULL,
  category            text NOT NULL,
  title               text NOT NULL,                                        -- "CNIC (front & back)"
  "attachmentId"       uuid,                                                 -- Company.Attachments (file name, size)
  "hrLetterId"        uuid,                                                 -- "Letter · system generated"
  "issuedOn"           date,
  "expiresOn"          date,                                                 -- "expires 18 Mar 2031"
  "isRequired"         boolean NOT NULL DEFAULT false,
  "renewalFrequency"   text,  -- "Required annually"
  "dueOn"              date,                                                 -- "due 01 Jul 2026" / "within 30 days"
  status              text NOT NULL DEFAULT 'UPLOADED',
  "verifiedByUserId" uuid,
  "verifiedAt"         timestamptz,
  remarks             text,                                                 -- "HEC attested"
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "employeeDocumentEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "employeeDocumentAttachmentIdFk" FOREIGN KEY ("tenantId", "attachmentId") REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "employeeDocumentHrLetterIdFk" FOREIGN KEY ("tenantId", "hrLetterId") REFERENCES "HumanResources"."EmployeeLetters" ("tenantId", id),
  CONSTRAINT "employeeDocumentVerifiedByFk" FOREIGN KEY ("tenantId", "verifiedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "employeeDocumentFileChk" CHECK (status IN ('PENDING','MISSING') OR "attachmentId" IS NOT NULL),
  CONSTRAINT "employeeDocumentVerifiedChk" CHECK (status <> 'VERIFIED' OR "verifiedAt" IS NOT NULL),
  CONSTRAINT "employeeDocumentDatesChk" CHECK ("expiresOn" IS NULL OR "issuedOn" IS NULL OR "expiresOn" >= "issuedOn")
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."EmployeeDocuments"');
CREATE INDEX "employeeDocumentEmployeeIdx" ON "HumanResources"."EmployeeDocuments" ("tenantId", "employeeId");
CREATE INDEX "employeeDocumentExpiryIdx"   ON "HumanResources"."EmployeeDocuments" ("tenantId", "expiresOn") WHERE "expiresOn" IS NOT NULL;
CREATE INDEX "employeeDocumentOpenIdx"     ON "HumanResources"."EmployeeDocuments" ("tenantId", status) WHERE status IN ('PENDING','MISSING');
COMMENT ON TABLE "HumanResources"."EmployeeDocuments" IS 'Employee document checklist with verification status and expiry. Profile → Documents.';

-- ---------------------------------------------------------------------------
-- EmployeeAssets — profile tab "Assets" (Asset, Tag, Serial, Issued, Condition,
-- Value (Rs); "Assign asset"; "Returned at offboarding clearance"). Tag FA-0187
-- links to FixedAssets.FixedAssets; fuel/access cards (FC-0042, AC-1042) are not fixed assets.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."EmployeeAssets" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"      uuid NOT NULL,
  "assetId"         uuid,                                                    -- → FixedAssets.FixedAssets (fk file), optional
  category         text NOT NULL,
  "assetName"       text NOT NULL,                                           -- Dell Latitude 5440
  specification    text,                                                    -- i5-1335U · 16 GB · 512 GB SSD / "Monthly limit 120 L"
  tag              text,                                                    -- FA-0187 / FC-0042
  "serialNo"        text,
  "issuedOn"        date NOT NULL,
  "returnedOn"      date,
  condition        text,
  "valueAmount"     numeric(18,2) CHECK ("valueAmount" >= 0),                 -- 245,000.00
  status           text NOT NULL DEFAULT 'ISSUED',
  remarks          text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "employeeAssetEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "employeeAssetReturnChk" CHECK ((status = 'RETURNED') = ("returnedOn" IS NOT NULL)
                                              AND ("returnedOn" IS NULL OR "returnedOn" >= "issuedOn"))
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."EmployeeAssets"');
CREATE INDEX "employeeAssetEmployeeIdx" ON "HumanResources"."EmployeeAssets" ("tenantId", "employeeId") WHERE status = 'ISSUED';
-- one open custody per fixed asset
CREATE UNIQUE INDEX "employeeAssetOneHolder" ON "HumanResources"."EmployeeAssets" ("tenantId", "assetId") WHERE "assetId" IS NOT NULL AND status = 'ISSUED';
COMMENT ON TABLE "HumanResources"."EmployeeAssets" IS 'Assets/cards in an employee''s custody; returned during offboarding clearance.';

-- ---------------------------------------------------------------------------
-- EmployeePositionHistory — profile "Position history" timeline (Increment 12% · G-5 ·
-- 01 Jul 2026 · appraisal "Exceeds"; Promoted to Sales Executive from Sales
-- Officer (G-4); Confirmed; Joined as Sales Officer) and the "Reason for change"
-- captured by "Edit employee". One row per job event, before/after values.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."EmployeePositionHistory" (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                 uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"               uuid NOT NULL,
  "effectiveDate"            date NOT NULL,
  "eventType"                text NOT NULL,
  "fromDepartmentId"        uuid,
  "toDepartmentId"          uuid,
  "fromDesignationId"       uuid,
  "toDesignationId"         uuid,
  "fromGradeId"             uuid,
  "toGradeId"               uuid,
  "fromBranchId"            uuid,
  "toBranchId"              uuid,
  "fromManagerId"           uuid,
  "toManagerId"             uuid,
  "fromEmploymentType"      text,
  "toEmploymentType"        text,
  "fromStatus"               text,
  "toStatus"                 text,
  "incrementPct"             numeric(7,4) CHECK ("incrementPct" > -100),      -- 12%
  "appraisalReference"       text,                                           -- 'Annual appraisal "Exceeds"'
  "performanceReviewId"     uuid,                                           -- FK added after HumanResources.PerformanceReviews
  "hrLetterId"              uuid,
  reason                    text,                                           -- "Reason for change" (Edit employee)
  "createdAt"                timestamptz NOT NULL DEFAULT now(),
  "createdBy"                uuid,
  "updatedAt"                timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                uuid,
  "rowVersion"               integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "employeeHistoryEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "employeeHistoryFromDeptFk"  FOREIGN KEY ("tenantId", "fromDepartmentId")  REFERENCES "HumanResources"."Departments" ("tenantId", id),
  CONSTRAINT "employeeHistoryToDeptFk"    FOREIGN KEY ("tenantId", "toDepartmentId")    REFERENCES "HumanResources"."Departments" ("tenantId", id),
  CONSTRAINT "employeeHistoryFromDesigFk" FOREIGN KEY ("tenantId", "fromDesignationId") REFERENCES "HumanResources"."Designations" ("tenantId", id),
  CONSTRAINT "employeeHistoryToDesigFk"   FOREIGN KEY ("tenantId", "toDesignationId")   REFERENCES "HumanResources"."Designations" ("tenantId", id),
  CONSTRAINT "employeeHistoryFromGradeFk" FOREIGN KEY ("tenantId", "fromGradeId")       REFERENCES "HumanResources"."Grades" ("tenantId", id),
  CONSTRAINT "employeeHistoryToGradeFk"   FOREIGN KEY ("tenantId", "toGradeId")         REFERENCES "HumanResources"."Grades" ("tenantId", id),
  CONSTRAINT "employeeHistoryFromBranchFk" FOREIGN KEY ("tenantId", "fromBranchId")     REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "employeeHistoryToBranchFk"   FOREIGN KEY ("tenantId", "toBranchId")       REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "employeeHistoryFromMgrFk"   FOREIGN KEY ("tenantId", "fromManagerId")     REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "employeeHistoryToMgrFk"     FOREIGN KEY ("tenantId", "toManagerId")       REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "employeeHistoryLetterFk"     FOREIGN KEY ("tenantId", "hrLetterId")        REFERENCES "HumanResources"."EmployeeLetters" ("tenantId", id),
  CONSTRAINT "employeeHistoryIncrementChk" CHECK ("eventType" <> 'INCREMENT' OR "incrementPct" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."EmployeePositionHistory"');
CREATE INDEX "employeeHistoryEmployeeIdx" ON "HumanResources"."EmployeePositionHistory" ("tenantId", "employeeId", "effectiveDate" DESC);
CREATE INDEX "employeeHistoryEventIdx"    ON "HumanResources"."EmployeePositionHistory" ("tenantId", "eventType", "effectiveDate");
COMMENT ON TABLE "HumanResources"."EmployeePositionHistory" IS 'Job events (joined, confirmed, promoted, increment, transfer…) with before/after values.';

-- =============================================================================
-- 3. TIME & ATTENDANCE
-- =============================================================================

-- ---------------------------------------------------------------------------
-- roster — app/hr/shifts "Weekly roster" (Employee × Mon…Sun → "MOR 7–3" / OFF /
-- LEAVE; Hrs; "Copy last week"; "Publish roster" to ESS). One row per
-- employee per day.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."ShiftRosters" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"      uuid NOT NULL,
  "rosterDate"      date NOT NULL,
  "entryType"       text NOT NULL DEFAULT 'SHIFT',
  "shiftId"         uuid,
  "isPublished"     boolean NOT NULL DEFAULT false,
  "publishedAt"     timestamptz,
  remarks          text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "employeeId", "rosterDate"),
  CONSTRAINT "rosterEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "rosterShiftIdFk" FOREIGN KEY ("tenantId", "shiftId") REFERENCES "HumanResources"."WorkShifts" ("tenantId", id),
  CONSTRAINT "rosterShiftChk" CHECK (("entryType" = 'SHIFT') = ("shiftId" IS NOT NULL)),
  CONSTRAINT "rosterPublishedChk" CHECK (NOT "isPublished" OR "publishedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."ShiftRosters"');
CREATE INDEX "rosterDateIdx" ON "HumanResources"."ShiftRosters" ("tenantId", "rosterDate", "shiftId");
COMMENT ON TABLE "HumanResources"."ShiftRosters" IS 'Duty roster: employee × date → shift / OFF / LEAVE. app/hr/shifts.';

-- ---------------------------------------------------------------------------
-- holiday — app/hr/holidays (calendar + "Holidays 2026-27" list: name, date(s),
-- Hijri note, badge Observed / Upcoming / Tentative / Optional; legend Public /
-- Optional / Company event) and modal "Add holiday" (name, from, to, type
-- Public (gazetted) / Company holiday / Optional, applies to, moon-sighting
-- dependent, notify on ESS). "Import gazette" = source GAZETTE.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."Holidays" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name               text NOT NULL,                                         -- Iqbal Day
  "fromDate"          date NOT NULL,
  "toDate"            date NOT NULL,
  days               integer GENERATED ALWAYS AS ("toDate" - "fromDate" + 1) STORED,
  "holidayType"       text NOT NULL,  -- EVENT = company event, not a day off
  "isMoonDependent"  boolean NOT NULL DEFAULT false,                        -- "Tentative until Ruet-e-Hilal"
  "hijriNote"         text,                                                  -- 12 Rabi-ul-Awwal 1448
  "eligibilityNote"   text,                                                  -- "optional (Hindu staff)"
  "appliesToAllBranches" boolean NOT NULL DEFAULT true,                    -- else rows in HumanResources.HolidayBranches
  status             text NOT NULL DEFAULT 'UPCOMING',
  source             text NOT NULL DEFAULT 'MANUAL',
  "notifyEss"         boolean NOT NULL DEFAULT true,
  "deletedAt"         timestamptz,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "holidayRangeChk" CHECK ("toDate" >= "fromDate"),
  CONSTRAINT "holidayTentativeChk" CHECK (status <> 'TENTATIVE' OR "isMoonDependent")
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."Holidays"');
CREATE INDEX "holidayDatesIdx" ON "HumanResources"."Holidays" ("tenantId", "fromDate", "toDate") WHERE "deletedAt" IS NULL;
COMMENT ON TABLE "HumanResources"."Holidays" IS 'Gazetted, company and optional holidays (+ company events). Excluded from working days. app/hr/holidays.';
COMMENT ON COLUMN "HumanResources"."Holidays".status IS 'UPCOMING / TENTATIVE (moon-dependent, unconfirmed) / OBSERVED (date passed) / CANCELLED.';

-- HolidayBranches — "Applies to: Lahore HQ / Karachi …", list filter "Sindh only / Punjab only"
CREATE TABLE "HumanResources"."HolidayBranches" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "holidayId"       uuid NOT NULL,
  "branchId"        uuid NOT NULL,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "holidayId", "branchId"),
  CONSTRAINT "holidayBranchHolidayIdFk" FOREIGN KEY ("tenantId", "holidayId") REFERENCES "HumanResources"."Holidays" ("tenantId", id) ON DELETE CASCADE,
  CONSTRAINT "holidayBranchBranchIdFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."HolidayBranches"');
CREATE INDEX "holidayBranchBranchIdx" ON "HumanResources"."HolidayBranches" ("tenantId", "branchId");

-- ---------------------------------------------------------------------------
-- device — app/hr/devices cards (ZK-LHR-01 · Main Gate, model, branch, status
-- Online/Offline/Unstable, IP / Serial, Last sync, Users enrolled (face/finger),
-- Punches today) and modal "Add biometric device" (name, model, serial, branch,
-- connection ADMS push / TCP pull, IP, port, comm key, time zone, punch
-- direction, sync interval; "Test connection" → firmware).
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."BiometricDevices" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                text NOT NULL,                                        -- ZK-LHR-01
  "locationLabel"      text,                                                 -- Main Gate
  brand               text NOT NULL DEFAULT 'ZKTECO',
  model               text NOT NULL,                                        -- SpeedFace-V5L, MB460, K40, uFace 800, iClock 680
  "serialNo"           text NOT NULL,                                        -- CN7H23051882
  "branchId"           uuid NOT NULL,
  "connectionType"     text NOT NULL DEFAULT 'ADMS_PUSH',
  "ipAddress"          inet,
  port                integer NOT NULL DEFAULT 4370 CHECK (port BETWEEN 1 AND 65535),
  "commKeySecret"     text,                                                 -- encrypted by the API before storage; never returned to clients
  timezone            text NOT NULL DEFAULT 'Asia/Karachi',
  "punchDirection"     text NOT NULL DEFAULT 'AUTO',  -- Auto = first in / last out
  "syncIntervalMin"   smallint NOT NULL DEFAULT 5 CHECK ("syncIntervalMin" IN (1, 5, 15, 30, 60)),
  "firmwareVersion"    text,                                                 -- Ver 6.60 Apr 2024
  status              text NOT NULL DEFAULT 'OFFLINE',
  "lastHeartbeatAt"   timestamptz,
  "lastSyncAt"        timestamptz,
  "usersEnrolled"      integer NOT NULL DEFAULT 0 CHECK ("usersEnrolled" >= 0),      -- last reported by device
  "facesEnrolled"      integer NOT NULL DEFAULT 0 CHECK ("facesEnrolled" >= 0),
  "fingersEnrolled"    integer NOT NULL DEFAULT 0 CHECK ("fingersEnrolled" >= 0),
  "isActive"           boolean NOT NULL DEFAULT true,
  "deletedAt"          timestamptz,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  UNIQUE ("tenantId", "serialNo"),
  CONSTRAINT "deviceBranchIdFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "deviceTcpIpChk" CHECK ("connectionType" <> 'TCP_PULL' OR "ipAddress" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."BiometricDevices"');
CREATE INDEX "deviceBranchIdx" ON "HumanResources"."BiometricDevices" ("tenantId", "branchId", status);
COMMENT ON TABLE "HumanResources"."BiometricDevices" IS 'ZKTeco biometric terminals (ADMS push / TCP pull) per branch. app/hr/devices.';

-- ---------------------------------------------------------------------------
-- DeviceSyncLogs — app/hr/devices "Sync logs" (Time, Device, Operation,
-- Records, Duration, Result Success/Failed/Partial, Message). Append-only.
-- deviceId NULL = "All devices" broadcast operation.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."DeviceSyncLogs" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "deviceId"        uuid,
  "occurredAt"      timestamptz NOT NULL DEFAULT now(),
  operation        text NOT NULL,
  records          integer CHECK (records >= 0),
  "durationMs"      integer CHECK ("durationMs" >= 0),
  result           text NOT NULL,
  message          text,                                                    -- "Connection timed out (10.20.1.16:4370)"
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "deviceSyncLogDeviceIdFk" FOREIGN KEY ("tenantId", "deviceId") REFERENCES "HumanResources"."BiometricDevices" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."DeviceSyncLogs"');
CREATE TRIGGER "hrDeviceSyncLogAppendOnly" BEFORE UPDATE OR DELETE ON "HumanResources"."DeviceSyncLogs"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();
CREATE INDEX "deviceSyncLogTimeIdx" ON "HumanResources"."DeviceSyncLogs" ("tenantId", "occurredAt" DESC);
CREATE INDEX "deviceSyncLogDeviceIdx" ON "HumanResources"."DeviceSyncLogs" ("tenantId", "deviceId", "occurredAt" DESC);

-- ---------------------------------------------------------------------------
-- RegularisationRequests — app/hr/attendance/requests "Regularisation Requests"
-- (Request REG-2026-0418, Employee, Type, Date, Requested punch, Reason,
-- Submitted, Status; drawer: shift, recorded punches, attachment auto-linked
-- device log, approval flow line manager → HR, comment; reject modal: reason
-- select + comment + "Mark day as absent if not resolved within 48 hrs").
-- Shared with ESS ess/attendance "Request correction" (missed punch-in / out,
-- late arrival, on-duty, WFH; actual check in/out; attachment; Withdraw).
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."RegularisationRequests" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                 text NOT NULL,                                     -- REG-2026-0418 (Company.getNextDocNo('REG'))
  "employeeId"            uuid NOT NULL,
  "requestType"           text NOT NULL,
  "punchDirection"        text,  -- ESS "Missed punch-in / Missed punch-out"
  "attDate"               date NOT NULL,
  "requestedIn"           time,                                              -- "In 09:00"
  "requestedOut"          time,                                              -- "Out 18:10"
  reason                 text NOT NULL,
  "attachmentId"          uuid,                                              -- visit report, gate pass, photo
  "linkedDeviceId"       uuid,                                              -- "Device log ZK-ISB-01 (auto-linked)"
  channel                text NOT NULL DEFAULT 'ESS_WEB',
  "submittedAt"           timestamptz NOT NULL DEFAULT now(),
  status                 text NOT NULL DEFAULT 'PENDING',
  stage                  text NOT NULL DEFAULT 'LINE_MANAGER',
  "currentApproverEmployeeId" uuid,                                        -- Faisal Qureshi (line manager)
  "approvalRequestId"    uuid,                                              -- core approvals engine
  "decidedByUserId"     uuid,
  "decidedAt"             timestamptz,
  "rejectionReason"       text,
  "decisionComment"       text,
  "markAbsentIfUnresolved" boolean NOT NULL DEFAULT false,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "attendanceRequestEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "attendanceRequestAttachmentFk" FOREIGN KEY ("tenantId", "attachmentId") REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "attendanceRequestDeviceFk" FOREIGN KEY ("tenantId", "linkedDeviceId") REFERENCES "HumanResources"."BiometricDevices" ("tenantId", id),
  CONSTRAINT "attendanceRequestApproverFk" FOREIGN KEY ("tenantId", "currentApproverEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "attendanceRequestApprovalFk" FOREIGN KEY ("tenantId", "approvalRequestId") REFERENCES "Company"."Approvals" ("tenantId", id),
  CONSTRAINT "attendanceRequestDecidedByFk" FOREIGN KEY ("tenantId", "decidedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "attendanceRequestTimeChk" CHECK ("requestedIn" IS NOT NULL OR "requestedOut" IS NOT NULL),
  CONSTRAINT "attendanceRequestMissedChk" CHECK ("requestType" <> 'MISSED_PUNCH' OR "punchDirection" IS NOT NULL),
  CONSTRAINT "attendanceRequestDecisionChk" CHECK ((status IN ('APPROVED','REJECTED')) = ("decidedAt" IS NOT NULL)),
  CONSTRAINT "attendanceRequestRejectChk" CHECK (status <> 'REJECTED' OR "rejectionReason" IS NOT NULL),
  CONSTRAINT "attendanceRequestStageChk" CHECK (status = 'PENDING' OR stage = 'COMPLETED')
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."RegularisationRequests"', true);
CREATE INDEX "attendanceRequestListIdx" ON "HumanResources"."RegularisationRequests" ("tenantId", status, "requestType", "attDate" DESC);
CREATE INDEX "attendanceRequestEmployeeIdx" ON "HumanResources"."RegularisationRequests" ("tenantId", "employeeId", "attDate" DESC);
CREATE INDEX "attendanceRequestApproverIdx" ON "HumanResources"."RegularisationRequests" ("tenantId", "currentApproverEmployeeId") WHERE status = 'PENDING';
COMMENT ON TABLE "HumanResources"."RegularisationRequests" IS 'Regularisation requests (REG-): missed punch, late arrival, on-duty, WFH, early leaving. HR + ESS.';

-- ---------------------------------------------------------------------------
-- AttendancePunches — raw punches. app/hr/attendance "Live check-ins" (time,
-- device · branch, or "ESS mobile · 31.47°N 74.27°E (WFH)"), manual marks
-- (modal "Mark attendance manually", flagged "Manual"), ESS selfie + geofence
-- check-in (face match %, metres inside geofence). Partitioned by month.
-- NOTE: a partitioned table's unique keys must include the partition key, so
-- the PK is (id, punchAt) and the tenant key is (tenantId, id, punchAt).
-- Nothing references this table by FK.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."AttendancePunches" (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"            uuid,                                              -- NULL until device user id is mapped
  "punchAt"               timestamptz NOT NULL,
  direction              text NOT NULL DEFAULT 'AUTO',
  source                 text NOT NULL,
  "deviceId"              uuid,
  "deviceUserId"         text,                                              -- biometric id as sent by the device
  "verifyMode"            text,
  "workMode"              text NOT NULL DEFAULT 'OFFICE',
  latitude               numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
  longitude              numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
  "geofenceDistanceM"    integer CHECK ("geofenceDistanceM" >= 0),           -- "42 m inside geofence"
  "insideGeofence"        boolean,
  "faceMatchPct"         numeric(5,2) CHECK ("faceMatchPct" BETWEEN 0 AND 100),
  "selfieAttachmentId"   uuid,
  "locationLabel"         text,                                              -- "Client site" (manual)
  "attendanceRequestId"  uuid,                                              -- punch added by an approved regularisation
  "manualReason"          text,
  "isVoid"                boolean NOT NULL DEFAULT false,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  PRIMARY KEY (id, "punchAt"),
  UNIQUE ("tenantId", id, "punchAt"),
  CONSTRAINT "attendancePunchEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "attendancePunchDeviceIdFk" FOREIGN KEY ("tenantId", "deviceId") REFERENCES "HumanResources"."BiometricDevices" ("tenantId", id),
  CONSTRAINT "attendancePunchSelfieFk" FOREIGN KEY ("tenantId", "selfieAttachmentId") REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "attendancePunchRequestFk" FOREIGN KEY ("tenantId", "attendanceRequestId") REFERENCES "HumanResources"."RegularisationRequests" ("tenantId", id),
  CONSTRAINT "attendancePunchSourceChk" CHECK (
    (source = 'DEVICE'  AND "deviceId" IS NOT NULL) OR
    (source = 'MANUAL'  AND "employeeId" IS NOT NULL AND ("manualReason" IS NOT NULL OR "attendanceRequestId" IS NOT NULL)) OR
    (source = 'ESS_GEO' AND "employeeId" IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL)),
  CONSTRAINT "attendancePunchGeoPairChk" CHECK ((latitude IS NULL) = (longitude IS NULL))
) PARTITION BY RANGE ("punchAt");
SELECT "Company"."addStandardTriggers"('"HumanResources"."AttendancePunches"');
CREATE INDEX "attendancePunchEmployeeIdx" ON "HumanResources"."AttendancePunches" ("tenantId", "employeeId", "punchAt");
CREATE INDEX "attendancePunchDeviceIdx"   ON "HumanResources"."AttendancePunches" ("tenantId", "deviceId", "punchAt");
-- de-duplicate device re-sends (same device user, same second)
CREATE UNIQUE INDEX "attendancePunchDeviceDedupe" ON "HumanResources"."AttendancePunches" ("tenantId", "deviceId", "deviceUserId", "punchAt")
  WHERE source = 'DEVICE';
COMMENT ON TABLE "HumanResources"."AttendancePunches" IS 'Raw punches (device / manual / ESS geo-selfie), partitioned by month on punchAt.';

-- Creates the monthly partition that holds pMonth (idempotent). Run by a
-- monthly job ahead of time; rows that arrive with no partition go to DEFAULT.
CREATE OR REPLACE FUNCTION "HumanResources"."ensureAttendancePunchPartition"("pMonth" date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  "vFrom" date := date_trunc('month', "pMonth")::date;
  "vTo"   date := (date_trunc('month', "pMonth") + interval '1 month')::date;
  "vName" text := 'attendance_punch_' || to_char("vFrom", 'YYYY_MM');
BEGIN
  IF to_regclass('"HumanResources".' || "vName") IS NULL THEN
    EXECUTE format('CREATE TABLE "HumanResources".%I PARTITION OF "HumanResources"."AttendancePunches" FOR VALUES FROM (%L) TO (%L)',
                   "vName", "vFrom", "vTo");
  END IF;
END $$;
COMMENT ON FUNCTION "HumanResources"."ensureAttendancePunchPartition"(date) IS
  'Creates "HumanResources".attendance_punch_YYYY_MM for the month of the date if missing.';

CREATE TABLE "HumanResources"."AttendancePunchesDefault" PARTITION OF "HumanResources"."AttendancePunches" DEFAULT;

-- FY 2026-27 partitions (Jul 2026 – Jun 2027)
DO $$
DECLARE m date;
BEGIN
  FOR m IN SELECT generate_series(date '2026-07-01', date '2027-06-01', interval '1 month')::date LOOP
    PERFORM "HumanResources"."ensureAttendancePunchPartition"(m);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- OvertimePolicies — app/hr/overtime panel "Overtime policy" and modal (weekday /
-- weekly off / public holiday multipliers, hourly rate basis, daily cap, monthly
-- cap, min minutes to count, rounding, eligible up to grade, require
-- pre-approval via ESS, allow compensatory off). "Changes apply from the next
-- payroll run" → effectiveFrom; one active policy per tenant.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."OvertimePolicies" (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                 uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name                      text NOT NULL DEFAULT 'Standard',
  "statuteNote"              text,                                           -- "Factories Act 1934 / Punjab Shops Ordinance aligned"
  "weekdayMultiplier"        numeric(4,2) NOT NULL DEFAULT 1.50 CHECK ("weekdayMultiplier" >= 1),
  "weeklyOffMultiplier"     numeric(4,2) NOT NULL DEFAULT 2.00 CHECK ("weeklyOffMultiplier" >= 1),
  "holidayMultiplier"        numeric(4,2) NOT NULL DEFAULT 2.00 CHECK ("holidayMultiplier" >= 1),
  "hourlyRateBasis"         text NOT NULL DEFAULT 'GROSS_26_8',
  "minMinutes"               smallint NOT NULL DEFAULT 30 CHECK ("minMinutes" >= 0),
  "dailyCapHours"           numeric(4,2) CHECK ("dailyCapHours" > 0),
  "monthlyCapHours"         numeric(6,2) CHECK ("monthlyCapHours" > 0),
  rounding                  text NOT NULL DEFAULT 'NEAREST_30',
  "eligibleUpToGradeId"   uuid,                                           -- NULL = all grades
  "requiresPreApproval"     boolean NOT NULL DEFAULT true,
  "allowCompOff"            boolean NOT NULL DEFAULT true,
  "effectiveFrom"            date NOT NULL DEFAULT current_date,
  "isActive"                 boolean NOT NULL DEFAULT true,
  "deletedAt"                timestamptz,
  "createdAt"                timestamptz NOT NULL DEFAULT now(),
  "createdBy"                uuid,
  "updatedAt"                timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                uuid,
  "rowVersion"               integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "overtimePolicyGradeFk" FOREIGN KEY ("tenantId", "eligibleUpToGradeId") REFERENCES "HumanResources"."Grades" ("tenantId", id),
  CONSTRAINT "overtimePolicyCapsChk" CHECK ("dailyCapHours" IS NULL OR "monthlyCapHours" IS NULL OR "dailyCapHours" <= "monthlyCapHours")
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."OvertimePolicies"', true);
CREATE UNIQUE INDEX "overtimePolicyOneActive" ON "HumanResources"."OvertimePolicies" ("tenantId") WHERE "isActive" AND "deletedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- OvertimeClaims — app/hr/overtime "Overtime claims" (OT #, Employee, Date,
-- Day type, Hours, Rate, Amount (Rs), Approval "Pending — Faisal Qureshi";
-- chips All/Pending/Approved/Rejected; "Push to payroll") and modal "Log
-- overtime" (employee, date, day type, from, to, reason, comp-off instead of
-- payment; "Estimated amount: 3.5 hrs × Rs 625.00 × 1.5").
-- amount = hours × hourlyRate × multiplier (0 when compensatory off).
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."OvertimeClaims" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                text NOT NULL,                                      -- OT-2026-0214 (Company.getNextDocNo('OT'))
  "employeeId"           uuid NOT NULL,
  "dateFrom"             date NOT NULL,                                      -- "26–30 Sep" ranges
  "dateTo"               date NOT NULL,
  "dayType"              text NOT NULL,
  "timeFrom"             time,
  "timeTo"               time,
  hours                 numeric(6,2) NOT NULL CHECK (hours > 0),
  multiplier            numeric(4,2) NOT NULL CHECK (multiplier >= 1),      -- 1.5× / 2.0×
  "hourlyRate"           numeric(18,4) NOT NULL CHECK ("hourlyRate" >= 0),    -- Rs 625.00 (per policy basis)
  "isCompOff"           boolean NOT NULL DEFAULT false,
  amount                numeric(18,2) NOT NULL,
  reason                text,
  source                text NOT NULL DEFAULT 'HR',
  "overtimePolicyId"    uuid,
  "preApproved"          boolean NOT NULL DEFAULT false,
  "payrollMonth"         date NOT NULL,                                      -- first day of the payroll month ("October 2026 cycle")
  status                text NOT NULL DEFAULT 'PENDING',
  "approverEmployeeId"  uuid,
  "approvalRequestId"   uuid,
  "decidedByUserId"    uuid,
  "decidedAt"            timestamptz,
  "rejectionReason"      text,                                               -- "not pre-approved"
  "payrollRunId"        uuid,                                               -- → Payroll.PayrollRuns (fk file) once pushed
  "pushedAt"             timestamptz,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "overtimeEntryEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "overtimeEntryPolicyFk" FOREIGN KEY ("tenantId", "overtimePolicyId") REFERENCES "HumanResources"."OvertimePolicies" ("tenantId", id),
  CONSTRAINT "overtimeEntryApproverFk" FOREIGN KEY ("tenantId", "approverEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "overtimeEntryApprovalFk" FOREIGN KEY ("tenantId", "approvalRequestId") REFERENCES "Company"."Approvals" ("tenantId", id),
  CONSTRAINT "overtimeEntryDecidedByFk" FOREIGN KEY ("tenantId", "decidedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "overtimeEntryRangeChk" CHECK ("dateTo" >= "dateFrom"),
  CONSTRAINT "overtimeEntryAmountChk" CHECK (amount = CASE WHEN "isCompOff" THEN 0
                                                            ELSE round(hours * "hourlyRate" * multiplier, 2) END),
  CONSTRAINT "overtimeEntryMonthChk" CHECK ("payrollMonth" = date_trunc('month', "payrollMonth")::date),
  CONSTRAINT "overtimeEntryDecisionChk" CHECK (status IN ('PENDING','CANCELLED') OR "decidedAt" IS NOT NULL),
  CONSTRAINT "overtimeEntryPushedChk" CHECK ((status = 'PUSHED') = ("pushedAt" IS NOT NULL)),
  CONSTRAINT "overtimeEntryPushCompoffChk" CHECK (NOT ("isCompOff" AND status = 'PUSHED'))
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."OvertimeClaims"', true);
CREATE INDEX "overtimeEntryListIdx" ON "HumanResources"."OvertimeClaims" ("tenantId", "payrollMonth", status);
CREATE INDEX "overtimeEntryEmployeeIdx" ON "HumanResources"."OvertimeClaims" ("tenantId", "employeeId", "dateFrom");
COMMENT ON TABLE "HumanResources"."OvertimeClaims" IS 'Overtime claims (OT-): hours × hourly rate × multiplier; approved rows are pushed to payroll or granted as comp-off.';

-- =============================================================================
-- 4. LEAVE
-- =============================================================================

-- ---------------------------------------------------------------------------
-- LeaveTypes — app/hr/leave/policies cards + "Policy matrix" (Days, Accrual,
-- Carry forward, Encashment, Sandwich rule, Gender, Probation, Half day,
-- Approval) and modal "Leave type" tabs: General (name, code, colour, paid,
-- days per year, unit, description), Accrual & carry forward (method, per
-- period, pro-rate, carry forward mode/max/expiry, encashment/max/rate), Rules
-- (sandwich, half day, negative balance, block during payroll lock, require
-- attachment, min notice, max consecutive, max per month), Eligibility
-- (gender, employment types, available after, branches, grades, workflow).
-- Card details: "Certificate required > 2 days", "Backdated up to 3 days",
-- "3 times in service", "Apply within birth ± 15 days", "Deduction gross ÷ 30".
-- ESS: Comp-off "Expires 31 Oct 2026"; "HR joins for more than 3 days".
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."LeaveTypes" (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                 uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                      text NOT NULL CHECK (code ~ '^[A-Z]{2,4}$'),    -- AL, CL, SL, ML, PL, HJ, UL, CO
  name                      text NOT NULL,                                  -- Annual (Earned)
  "seedLeaveTypeId"        uuid REFERENCES "Platform"."TemplateLeaveTypes"(id),   -- provisioned from the platform seed
  category                  text NOT NULL,
  colour                    text NOT NULL DEFAULT 'GREEN',
  "isPaid"                   boolean NOT NULL DEFAULT true,
  "daysPerYear"             numeric(6,2) NOT NULL DEFAULT 0 CHECK ("daysPerYear" >= 0),   -- 18
  unit                      text NOT NULL DEFAULT 'DAYS',
  description               text,                                           -- shown on ESS
  "statuteNote"              text,                                           -- "Maternity & Paternity Leave Act 2023"
  -- accrual
  "accrualMethod"            text NOT NULL DEFAULT 'UPFRONT',
  "accrualAmount"            numeric(6,2) CHECK ("accrualAmount" > 0),        -- 1.5 per month
  "prorateNewJoiners"       boolean NOT NULL DEFAULT true,
  -- carry forward
  "carryForwardMode"        text NOT NULL DEFAULT 'NONE',
  "carryForwardMax"         numeric(6,2) CHECK ("carryForwardMax" >= 0),    -- max 12 / "Carry max 8"
  "accumulationCap"          numeric(6,2) CHECK ("accumulationCap" >= 0),     -- Sick "accumulate to 30"
  "carryExpiryMonths"       smallint CHECK ("carryExpiryMonths" > 0),       -- NULL = never
  -- encashment
  "encashmentMode"           text NOT NULL DEFAULT 'NOT_ALLOWED',
  "encashMaxDays"           numeric(6,2) CHECK ("encashMaxDays" >= 0),      -- up to 6
  "encashBasis"              text,
  -- unpaid deduction
  "deductionBasis"           text,
  -- rules
  "sandwichRule"             boolean NOT NULL DEFAULT false,
  "allowHalfDay"            boolean NOT NULL DEFAULT true,
  "allowNegative"            boolean NOT NULL DEFAULT false,
  "blockInPayrollLock"     boolean NOT NULL DEFAULT false,                 -- "25th – month end"
  "attachmentRequired"       boolean NOT NULL DEFAULT false,
  "attachmentAfterDays"     numeric(5,1) CHECK ("attachmentAfterDays" >= 0),-- certificate if > 2 days
  "backdateDays"             smallint CHECK ("backdateDays" >= 0),            -- "Backdated up to 3 days"
  "minNoticeDays"           smallint CHECK ("minNoticeDays" >= 0),          -- 7
  "maxConsecutiveDays"      numeric(6,2) CHECK ("maxConsecutiveDays" > 0),  -- 15 / Casual "max 3 at a time"
  "maxPerMonth"             numeric(6,2) CHECK ("maxPerMonth" > 0),         -- 10
  "maxTimesInService"      smallint CHECK ("maxTimesInService" > 0),      -- Maternity 3, Hajj once
  "applyWindowDays"         smallint CHECK ("applyWindowDays" > 0),         -- Paternity "birth ± 15 days"
  "compOffExpiryDays"      smallint CHECK ("compOffExpiryDays" > 0),      -- comp-off credit validity
  -- eligibility (branch / grade scoping rows live in HumanResources.LeaveEligibilityRules)
  gender                    text NOT NULL DEFAULT 'ALL',
  "employmentTypes"          text[] NOT NULL DEFAULT ARRAY['PERMANENT','CONTRACT']::text[],
  "availableAfter"           text NOT NULL DEFAULT 'JOINING',
  "probationRule"            text NOT NULL DEFAULT 'ALLOWED',
  "approvalWorkflow"         text NOT NULL DEFAULT 'MANAGER_HR',
  "hrApprovalAboveDays"    numeric(5,1) CHECK ("hrApprovalAboveDays" >= 0),  -- ESS "HR joins for more than 3 days"
  "sortOrder"                smallint NOT NULL DEFAULT 0,
  status                    text NOT NULL DEFAULT 'ACTIVE',
  "deletedAt"                timestamptz,
  "createdAt"                timestamptz NOT NULL DEFAULT now(),
  "createdBy"                uuid,
  "updatedAt"                timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                uuid,
  "rowVersion"               integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  CONSTRAINT "leaveTypeEmploymentTypesChk" CHECK (
    cardinality("employmentTypes") > 0 AND
    "employmentTypes" <@ ARRAY['PERMANENT','CONTRACT','PROBATION','INTERNSHIP','DAILY_WAGER']::text[]),
  CONSTRAINT "leaveTypeAccrualChk" CHECK ("accrualMethod" NOT IN ('MONTHLY','QUARTERLY') OR "accrualAmount" IS NOT NULL),
  CONSTRAINT "leaveTypeCarryChk" CHECK ("carryForwardMode" <> 'CAPPED' OR "carryForwardMax" IS NOT NULL),
  CONSTRAINT "leaveTypeEncashChk" CHECK ("encashmentMode" = 'NOT_ALLOWED' OR ("encashBasis" IS NOT NULL AND "isPaid")),
  CONSTRAINT "leaveTypeUnpaidChk" CHECK ("isPaid" OR "deductionBasis" IS NOT NULL),
  CONSTRAINT "leaveTypeAttachChk" CHECK ("attachmentAfterDays" IS NULL OR "attachmentRequired")
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."LeaveTypes"', true);
COMMENT ON TABLE "HumanResources"."LeaveTypes" IS 'Leave types and their full policy (accrual, carry forward, encashment, rules, eligibility). app/hr/leave/policies.';

-- ---------------------------------------------------------------------------
-- LeaveEligibilityRules — modal "Leave type → Eligibility": Branches ("All
-- branches") and Grades ("G-1 to G-8"). No rows = all branches / all grades.
-- A row includes (or excludes) one branch or one grade for the leave type.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."LeaveEligibilityRules" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "leaveTypeId"    uuid NOT NULL,
  scope            text NOT NULL,
  "branchId"        uuid,
  "gradeId"         uuid,
  "isIncluded"      boolean NOT NULL DEFAULT true,
  "daysOverride"    numeric(6,2) CHECK ("daysOverride" >= 0),                  -- optional different entitlement for this scope
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE NULLS NOT DISTINCT ("tenantId", "leaveTypeId", scope, "branchId", "gradeId"),
  CONSTRAINT "leavePolicyRuleTypeFk" FOREIGN KEY ("tenantId", "leaveTypeId") REFERENCES "HumanResources"."LeaveTypes" ("tenantId", id),
  CONSTRAINT "leavePolicyRuleBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "leavePolicyRuleGradeFk" FOREIGN KEY ("tenantId", "gradeId") REFERENCES "HumanResources"."Grades" ("tenantId", id),
  CONSTRAINT "leavePolicyRuleScopeChk" CHECK ((scope = 'BRANCH' AND "branchId" IS NOT NULL AND "gradeId" IS NULL)
                                              OR (scope = 'GRADE' AND "gradeId" IS NOT NULL AND "branchId" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."LeaveEligibilityRules"');

-- ---------------------------------------------------------------------------
-- LeaveYearEndClosings (helper) — app/hr/leave/balances modal "Year-end carry
-- forward" (Closing year, per-type Unused / Carried fwd / Encashed / Lapsed /
-- Encash amount, Post encashment to PR-2026-10 or off-cycle run, email
-- statements; "Run carry forward"). Its effects are HumanResources.LeaveAdjustments rows.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."LeaveYearEndClosings" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "closingYearStart"     date NOT NULL,                                     -- 2025-07-01 (2025-26)
  "openingYearStart"     date NOT NULL,                                     -- 2026-07-01
  "encashmentTarget"      text NOT NULL DEFAULT 'NEXT_PAYROLL',
  "payrollRunId"         uuid,                                              -- → Payroll.PayrollRuns (fk file)
  "employeesCount"        integer CHECK ("employeesCount" >= 0),
  "daysCarried"           numeric(10,2) NOT NULL DEFAULT 0 CHECK ("daysCarried" >= 0),
  "daysEncashed"          numeric(10,2) NOT NULL DEFAULT 0 CHECK ("daysEncashed" >= 0),
  "daysLapsed"            numeric(10,2) NOT NULL DEFAULT 0 CHECK ("daysLapsed" >= 0),
  "encashAmount"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("encashAmount" >= 0),
  "emailStatements"       boolean NOT NULL DEFAULT true,
  status                 text NOT NULL DEFAULT 'DRAFT',
  "completedAt"           timestamptz,
  "completedByUserId"   uuid,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "leaveYearCloseUserFk" FOREIGN KEY ("tenantId", "completedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "leaveYearCloseYearsChk" CHECK ("openingYearStart" > "closingYearStart"),
  CONSTRAINT "leaveYearCloseDoneChk" CHECK ((status = 'DRAFT') = ("completedAt" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."LeaveYearEndClosings"', true);
CREATE UNIQUE INDEX "leaveYearCloseOneDone" ON "HumanResources"."LeaveYearEndClosings" ("tenantId", "closingYearStart") WHERE status = 'COMPLETED';

-- ---------------------------------------------------------------------------
-- LeaveBalances — app/hr/leave/balances (Employee × Annual/Casual/Sick E/T/B,
-- Unpaid taken, Carry-fwd in, Encashable; chips Low balance / Negative),
-- profile "Balances", ESS ring (Used / Booked / free). One row per employee ×
-- leave type × leave year. Maintained by trigger from HumanResources.LeaveRequests and
-- HumanResources.LeaveAdjustments; never edited by hand.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."LeaveBalances" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"        uuid NOT NULL,
  "leaveTypeId"      uuid NOT NULL,
  "leaveYearStart"   date NOT NULL,                                         -- 2026-07-01 = leave year 2026-27
  entitled           numeric(7,2) NOT NULL DEFAULT 0,                       -- accrued / granted (E), pro-rata for joiners
  "carriedIn"         numeric(7,2) NOT NULL DEFAULT 0 CHECK ("carriedIn" >= 0),
  adjusted           numeric(7,2) NOT NULL DEFAULT 0,                       -- manual / comp-off credits (signed)
  used               numeric(7,2) NOT NULL DEFAULT 0 CHECK (used >= 0),     -- approved (T)
  booked             numeric(7,2) NOT NULL DEFAULT 0 CHECK (booked >= 0),   -- pending requests
  encashed           numeric(7,2) NOT NULL DEFAULT 0 CHECK (encashed >= 0),
  lapsed             numeric(7,2) NOT NULL DEFAULT 0 CHECK (lapsed >= 0),
  balance            numeric(7,2) GENERATED ALWAYS AS ("carriedIn" + entitled + adjusted - used - encashed - lapsed) STORED,  -- B
  available          numeric(7,2) GENERATED ALWAYS AS ("carriedIn" + entitled + adjusted - used - encashed - lapsed - booked) STORED,
  encashable         numeric(7,2) NOT NULL DEFAULT 0 CHECK (encashable >= 0),
  "carriedExpiresOn" date,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "employeeId", "leaveTypeId", "leaveYearStart"),
  CONSTRAINT "leaveBalanceEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "leaveBalanceLeaveTypeIdFk" FOREIGN KEY ("tenantId", "leaveTypeId") REFERENCES "HumanResources"."LeaveTypes" ("tenantId", id),
  CONSTRAINT "leaveBalanceYearChk" CHECK (extract(day FROM "leaveYearStart") = 1)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."LeaveBalances"', true);
CREATE INDEX "leaveBalanceYearIdx" ON "HumanResources"."LeaveBalances" ("tenantId", "leaveYearStart", "leaveTypeId");
COMMENT ON TABLE "HumanResources"."LeaveBalances" IS 'Leave ledger summary per employee × type × leave year; balance/available are generated.';

-- ---------------------------------------------------------------------------
-- LeaveAdjustments — app/hr/leave/balances modal "Adjust balance" (employee,
-- leave type, Credit (+) / Debit (−), days, effective date, reason "with audit
-- trail") plus system rows from year-end carry forward (carry / encash / lapse),
-- monthly accrual, opening balances and comp-off credits from overtime.
-- Append-only: corrections are contra rows.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."LeaveAdjustments" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"           uuid NOT NULL,
  "leaveTypeId"         uuid NOT NULL,
  "leaveYearStart"      date NOT NULL,
  kind                  text NOT NULL,
  direction             text NOT NULL,
  days                  numeric(7,2) NOT NULL CHECK (days > 0),
  "effectiveDate"        date NOT NULL,
  reason                text NOT NULL,
  "overtimeEntryId"     uuid,                                               -- comp-off source
  "leaveYearCloseId"   uuid,
  "encashAmount"         numeric(18,2) CHECK ("encashAmount" >= 0),           -- basic ÷ 30 × days
  "payrollRunId"        uuid,                                               -- → Payroll.PayrollRuns (fk file) for encashment
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "leaveAdjustmentEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "leaveAdjustmentLeaveTypeIdFk" FOREIGN KEY ("tenantId", "leaveTypeId") REFERENCES "HumanResources"."LeaveTypes" ("tenantId", id),
  CONSTRAINT "leaveAdjustmentOtFk" FOREIGN KEY ("tenantId", "overtimeEntryId") REFERENCES "HumanResources"."OvertimeClaims" ("tenantId", id),
  CONSTRAINT "leaveAdjustmentCloseFk" FOREIGN KEY ("tenantId", "leaveYearCloseId") REFERENCES "HumanResources"."LeaveYearEndClosings" ("tenantId", id),
  CONSTRAINT "leaveAdjustmentCompOffChk" CHECK (kind <> 'COMP_OFF' OR "overtimeEntryId" IS NOT NULL),
  CONSTRAINT "leaveAdjustmentEncashChk" CHECK ((kind = 'ENCASHMENT') = ("encashAmount" IS NOT NULL)),
  CONSTRAINT "leaveAdjustmentYearChk" CHECK (extract(day FROM "leaveYearStart") = 1)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."LeaveAdjustments"', true);
CREATE TRIGGER "hrLeaveAdjustmentAppendOnly" BEFORE UPDATE OR DELETE ON "HumanResources"."LeaveAdjustments"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();
CREATE INDEX "leaveAdjustmentEmployeeIdx" ON "HumanResources"."LeaveAdjustments" ("tenantId", "employeeId", "leaveTypeId", "leaveYearStart");
CREATE UNIQUE INDEX "leaveAdjustmentOneCompOff" ON "HumanResources"."LeaveAdjustments" ("tenantId", "overtimeEntryId") WHERE kind = 'COMP_OFF';

-- ---------------------------------------------------------------------------
-- LeaveRequests — app/hr/leave/requests (Request # LV-2026-0612, Employee,
-- Type, From – To, Days, Reason, Status, Approver; chips Pending/Approved/
-- Rejected/Cancelled), app/hr/leave "Pending approvals" (Balance after, Stage
-- HR review / Line manager), modals "Apply leave on behalf" (approval chain
-- skipped), "New leave request" (duration Full / Half AM / Half PM, attachment),
-- "Approve leave" (team overlap, handover, comment), "Reject leave" (reason,
-- comment, suggest alternative dates). Shared with ESS ess/leave (handover to,
-- contact during leave, attachment, withdraw/cancel).
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."LeaveRequests" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                  text NOT NULL,                                    -- LV-2026-0612 (Company.getNextDocNo('LV'))
  "employeeId"             uuid NOT NULL,
  "leaveTypeId"           uuid NOT NULL,
  duration                text NOT NULL DEFAULT 'FULL',
  "fromDate"               date NOT NULL,
  "toDate"                 date NOT NULL,
  days                    numeric(6,1) NOT NULL CHECK (days > 0 AND days * 2 = trunc(days * 2)),  -- working days, ½ steps
  "calendarDays"           integer GENERATED ALWAYS AS ("toDate" - "fromDate" + 1) STORED,
  reason                  text,
  "attachmentId"           uuid,                                             -- medical certificate, visa/ticket copy
  "handoverEmployeeId"    uuid,                                             -- "Accounts covered by Mehwish Tariq"
  "contactDuringLeave"    text,
  "balanceBefore"          numeric(7,2),                                     -- snapshot "11 → 8 days annual"
  "balanceAfter"           numeric(7,2),
  channel                 text NOT NULL DEFAULT 'ESS_WEB',
  "appliedOnBehalf"       boolean NOT NULL DEFAULT false,                   -- HR "Apply on behalf" (chain skipped)
  "submittedAt"            timestamptz NOT NULL DEFAULT now(),
  status                  text NOT NULL DEFAULT 'PENDING',
  stage                   text NOT NULL DEFAULT 'LINE_MANAGER',
  "currentApproverEmployeeId" uuid,                                        -- Approver column
  "approvalRequestId"     uuid,
  "decidedByUserId"      uuid,
  "decidedAt"              timestamptz,
  "rejectionReason"        text,
  "decisionComment"        text,
  "suggestAlternative"     boolean NOT NULL DEFAULT false,
  "cancelledAt"            timestamptz,
  "cancelReason"           text,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "leaveRequestEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "leaveRequestLeaveTypeIdFk" FOREIGN KEY ("tenantId", "leaveTypeId") REFERENCES "HumanResources"."LeaveTypes" ("tenantId", id),
  CONSTRAINT "leaveRequestAttachmentFk" FOREIGN KEY ("tenantId", "attachmentId") REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "leaveRequestHandoverFk" FOREIGN KEY ("tenantId", "handoverEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "leaveRequestApproverFk" FOREIGN KEY ("tenantId", "currentApproverEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "leaveRequestApprovalFk" FOREIGN KEY ("tenantId", "approvalRequestId") REFERENCES "Company"."Approvals" ("tenantId", id),
  CONSTRAINT "leaveRequestDecidedByFk" FOREIGN KEY ("tenantId", "decidedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "leaveRequestRangeChk" CHECK ("toDate" >= "fromDate"),
  CONSTRAINT "leaveRequestHalfChk" CHECK (duration = 'FULL' OR ("fromDate" = "toDate" AND days = 0.5)),
  CONSTRAINT "leaveRequestDaysChk" CHECK (days <= "toDate" - "fromDate" + 1),
  CONSTRAINT "leaveRequestHandoverChk" CHECK ("handoverEmployeeId" IS NULL OR "handoverEmployeeId" <> "employeeId"),
  CONSTRAINT "leaveRequestDecisionChk" CHECK ((status IN ('APPROVED','REJECTED')) = ("decidedAt" IS NOT NULL)
                                               OR (status = 'CANCELLED')),
  CONSTRAINT "leaveRequestRejectChk" CHECK (status <> 'REJECTED' OR "rejectionReason" IS NOT NULL),
  CONSTRAINT "leaveRequestCancelChk" CHECK ((status = 'CANCELLED') = ("cancelledAt" IS NOT NULL)),
  CONSTRAINT "leaveRequestStageChk" CHECK (status = 'PENDING' OR stage = 'COMPLETED'),
  -- an employee cannot hold two live requests over the same dates
  CONSTRAINT "leaveRequestNoOverlap" EXCLUDE USING gist (
    "tenantId" WITH =, "employeeId" WITH =, daterange("fromDate", "toDate", '[]') WITH &&
  ) WHERE (status IN ('PENDING','APPROVED'))
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."LeaveRequests"', true);
CREATE INDEX "leaveRequestListIdx" ON "HumanResources"."LeaveRequests" ("tenantId", status, "fromDate" DESC);
CREATE INDEX "leaveRequestTypeIdx" ON "HumanResources"."LeaveRequests" ("tenantId", "leaveTypeId", "fromDate");
CREATE INDEX "leaveRequestEmployeeIdx" ON "HumanResources"."LeaveRequests" ("tenantId", "employeeId", "fromDate" DESC);
CREATE INDEX "leaveRequestApproverIdx" ON "HumanResources"."LeaveRequests" ("tenantId", "currentApproverEmployeeId") WHERE status = 'PENDING';
COMMENT ON TABLE "HumanResources"."LeaveRequests" IS 'Leave applications (LV-) from ESS and HR with approval stage; drives LeaveBalances via trigger.';

-- ---------------------------------------------------------------------------
-- AttendanceRegister — one processed row per employee per date. Feeds
-- app/hr/attendance (today KPIs, late arrivals: check-in, late by, late this
-- month "4th — deduct ½ day", Waive), app/hr/attendance/register (P / A / L /
-- H / W / LT / HD grid, Payable, "locked for payroll PR-2026-09"), profile
-- Attendance tab (month summary), modal "Mark attendance manually" (status
-- Present/Absent/Half day/WFH/On duty, check-in/out, location, reason).
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."AttendanceRegister" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"            uuid NOT NULL,
  "attDate"               date NOT NULL,
  "shiftId"               uuid,
  status                 text NOT NULL,
  "registerCode"          text GENERATED ALWAYS AS (CASE status
                             WHEN 'PRESENT'    THEN 'P'
                             WHEN 'WFH'        THEN 'P'
                             WHEN 'ON_DUTY'    THEN 'P'
                             WHEN 'ABSENT'     THEN 'A'
                             WHEN 'LEAVE'      THEN 'L'
                             WHEN 'HOLIDAY'    THEN 'H'
                             WHEN 'WEEKLY_OFF' THEN 'W'
                             WHEN 'LATE'       THEN 'LT'
                             WHEN 'HALF_DAY'   THEN 'HD' END) STORED,
  "firstIn"               timestamptz,
  "lastOut"               timestamptz,
  "lateMinutes"           smallint NOT NULL DEFAULT 0 CHECK ("lateMinutes" >= 0),       -- after grace
  "earlyLeaveMinutes"    smallint NOT NULL DEFAULT 0 CHECK ("earlyLeaveMinutes" >= 0),
  "workedMinutes"         integer NOT NULL DEFAULT 0 CHECK ("workedMinutes" BETWEEN 0 AND 1440),
  "overtimeMinutes"       integer NOT NULL DEFAULT 0 CHECK ("overtimeMinutes" >= 0),
  "payableFraction"       numeric(3,2) NOT NULL DEFAULT 1 CHECK ("payableFraction" IN (0, 0.5, 1)),  -- Payable = P + paid L + W + ½ HD
  "lateMarkWaived"       boolean NOT NULL DEFAULT false,                    -- "Waive"
  "lateWaivedByUserId" uuid,
  "leaveRequestId"       uuid,
  "leaveTypeId"          uuid,
  "holidayId"             uuid,
  "attendanceRequestId"  uuid,                                              -- regularised day
  "isManual"              boolean NOT NULL DEFAULT false,                    -- flagged "Manual"
  "manualReason"          text,
  "locationLabel"         text,                                              -- Lahore HQ / Client site
  "lockedAt"              timestamptz,                                       -- consumed by payroll
  "payrollRunId"         uuid,                                              -- → Payroll.PayrollRuns (fk file)
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "employeeId", "attDate"),
  CONSTRAINT "attendanceDayEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "attendanceDayShiftIdFk" FOREIGN KEY ("tenantId", "shiftId") REFERENCES "HumanResources"."WorkShifts" ("tenantId", id),
  CONSTRAINT "attendanceDayWaivedByFk" FOREIGN KEY ("tenantId", "lateWaivedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "attendanceDayLeaveRequestFk" FOREIGN KEY ("tenantId", "leaveRequestId") REFERENCES "HumanResources"."LeaveRequests" ("tenantId", id),
  CONSTRAINT "attendanceDayLeaveTypeFk" FOREIGN KEY ("tenantId", "leaveTypeId") REFERENCES "HumanResources"."LeaveTypes" ("tenantId", id),
  CONSTRAINT "attendanceDayHolidayFk" FOREIGN KEY ("tenantId", "holidayId") REFERENCES "HumanResources"."Holidays" ("tenantId", id),
  CONSTRAINT "attendanceDayRequestFk" FOREIGN KEY ("tenantId", "attendanceRequestId") REFERENCES "HumanResources"."RegularisationRequests" ("tenantId", id),
  CONSTRAINT "attendanceDayOutChk" CHECK ("lastOut" IS NULL OR "firstIn" IS NULL OR "lastOut" >= "firstIn"),
  CONSTRAINT "attendanceDayLeaveChk" CHECK (status <> 'LEAVE' OR "leaveTypeId" IS NOT NULL),
  CONSTRAINT "attendanceDayLateChk" CHECK (status <> 'LATE' OR "lateMinutes" > 0),
  CONSTRAINT "attendanceDayHalfChk" CHECK (status <> 'HALF_DAY' OR "payableFraction" = 0.5),
  CONSTRAINT "attendanceDayAbsentChk" CHECK (status <> 'ABSENT' OR "payableFraction" = 0),
  CONSTRAINT "attendanceDayManualChk" CHECK (NOT "isManual" OR "manualReason" IS NOT NULL OR "attendanceRequestId" IS NOT NULL),
  CONSTRAINT "attendanceDayWaiveChk" CHECK (NOT "lateMarkWaived" OR "lateWaivedByUserId" IS NOT NULL),
  CONSTRAINT "attendanceDayLockChk" CHECK ("payrollRunId" IS NULL OR "lockedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."AttendanceRegister"', true);
CREATE INDEX "attendanceDayDateIdx" ON "HumanResources"."AttendanceRegister" ("tenantId", "attDate", status);
CREATE INDEX "attendanceDayLateIdx" ON "HumanResources"."AttendanceRegister" ("tenantId", "attDate") WHERE status = 'LATE';
COMMENT ON TABLE "HumanResources"."AttendanceRegister" IS 'Processed daily attendance per employee (status, in/out, late, worked, OT, payable); locked once payroll consumes it.';
COMMENT ON COLUMN "HumanResources"."AttendanceRegister".status IS 'LATE counts as present (register LT); WFH and ON_DUTY show as P in the register.';

-- Locked days (consumed by payroll) are read-only: "Changes now require an
-- adjustment in October payroll."
CREATE OR REPLACE FUNCTION "HumanResources"."triggerAttendanceDayLock"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."lockedAt" IS NOT NULL AND (TG_OP = 'DELETE' OR NEW."lockedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'Attendance for % on % is locked for payroll', OLD."employeeId", OLD."attDate"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "hrAttendanceDayLock" BEFORE UPDATE OR DELETE ON "HumanResources"."AttendanceRegister"
  FOR EACH ROW EXECUTE FUNCTION "HumanResources"."triggerAttendanceDayLock"();

-- =============================================================================
-- 5. LIFECYCLE — onboarding, offboarding, clearance, exit interview
-- =============================================================================

-- ---------------------------------------------------------------------------
-- OnboardingTemplates (helper) — app/hr/onboarding "Checklist Template:
-- Standard Staff Onboarding (14 tasks)" + "Edit template"; ESS "Team-lead track".
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."OnboardingTemplates" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name             text NOT NULL,                                           -- Standard Staff Onboarding
  track            text NOT NULL DEFAULT 'NEW_JOINER',
  "isDefault"       boolean NOT NULL DEFAULT false,
  "isActive"        boolean NOT NULL DEFAULT true,
  "deletedAt"       timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", name)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."OnboardingTemplates"');
CREATE UNIQUE INDEX "onboardingTemplateOneDefault" ON "HumanResources"."OnboardingTemplates" ("tenantId", track) WHERE "isDefault" AND "deletedAt" IS NULL;

-- OnboardingTemplateTasks (helper) — template checklist groups: Documents,
-- Statutory & Finance, IT & Admin, Orientation (+ ESS: Policies, Buddy, Training)
CREATE TABLE "HumanResources"."OnboardingTemplateTasks" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "templateId"      uuid NOT NULL,
  "taskGroup"       text NOT NULL,
  title            text NOT NULL,                                           -- "EOBI registration (PR-02) within 15 days"
  description      text,
  "ownerFunction"   text NOT NULL,
  "dueOffsetDays"  smallint NOT NULL DEFAULT 0,                             -- relative to joining date (negative = pre-joining)
  "actionKind"      text NOT NULL DEFAULT 'NONE',
  "sortOrder"       smallint NOT NULL DEFAULT 0,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "onboardingTemplateTaskTemplateFk" FOREIGN KEY ("tenantId", "templateId") REFERENCES "HumanResources"."OnboardingTemplates" ("tenantId", id) ON DELETE CASCADE
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."OnboardingTemplateTasks"');
CREATE INDEX "onboardingTemplateTaskTplIdx" ON "HumanResources"."OnboardingTemplateTasks" ("tenantId", "templateId", "sortOrder");

-- ---------------------------------------------------------------------------
-- onboarding — app/hr/onboarding "New Joiners" (Employee, Position, Joining,
-- Buddy, Progress n / 14, Status Pre-joining / Week 3 / n overdue); started by
-- "Add Employee" ("onboarding checklist starts automatically on save"); ESS
-- ess/onboarding (track, buddy, started 15 Sep · target 09 Oct).
-- Progress / overdue / "Week n" are derived from tasks.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."Onboardings" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"             text NOT NULL,                                         -- ONB-2026-0012 (Company.getNextDocNo('ONB'))
  "employeeId"        uuid NOT NULL,
  "templateId"        uuid,
  track              text NOT NULL DEFAULT 'NEW_JOINER',
  "designationId"     uuid,                                                  -- position being onboarded into
  "joiningDate"       date NOT NULL,
  "startDate"         date NOT NULL DEFAULT current_date,
  "targetDate"        date,
  "buddyEmployeeId"  uuid,
  "candidateId"       uuid,                                                  -- FK added after HumanResources.Candidates
  status             text NOT NULL DEFAULT 'PRE_JOINING',
  "completedAt"       timestamptz,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "onboardingEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "onboardingTemplateFk" FOREIGN KEY ("tenantId", "templateId") REFERENCES "HumanResources"."OnboardingTemplates" ("tenantId", id),
  CONSTRAINT "onboardingDesignationFk" FOREIGN KEY ("tenantId", "designationId") REFERENCES "HumanResources"."Designations" ("tenantId", id),
  CONSTRAINT "onboardingBuddyFk" FOREIGN KEY ("tenantId", "buddyEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "onboardingBuddyChk" CHECK ("buddyEmployeeId" IS NULL OR "buddyEmployeeId" <> "employeeId"),
  CONSTRAINT "onboardingTargetChk" CHECK ("targetDate" IS NULL OR "targetDate" >= "startDate"),
  CONSTRAINT "onboardingDoneChk" CHECK ((status = 'COMPLETED') = ("completedAt" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."Onboardings"');
CREATE INDEX "onboardingStatusIdx" ON "HumanResources"."Onboardings" ("tenantId", status, "joiningDate");
CREATE UNIQUE INDEX "onboardingOneOpen" ON "HumanResources"."Onboardings" ("tenantId", "employeeId", track) WHERE status IN ('PRE_JOINING','IN_PROGRESS');

-- ---------------------------------------------------------------------------
-- OnboardingTasks — app/hr/onboarding "Open Tasks" (Task, New joiner, Owner
-- "Ayesha Noor · HR", Due, Status Overdue / In progress / Not started /
-- Scheduled, Complete; chips All / Overdue / Mine) and ESS onboarding items
-- (Upload, Read & agree, Book a slot, Resume training 40%).
-- OVERDUE is derived: dueOn < today and status not COMPLETED/SKIPPED.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."OnboardingTasks" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "onboardingId"         uuid NOT NULL,
  "templateTaskId"      uuid,
  "taskGroup"            text NOT NULL,
  title                 text NOT NULL,
  description           text,
  "ownerFunction"        text NOT NULL,
  "ownerEmployeeId"     uuid,
  "dueOn"                date,
  "actionKind"           text NOT NULL DEFAULT 'NONE',
  "progressPct"          numeric(5,2) NOT NULL DEFAULT 0 CHECK ("progressPct" BETWEEN 0 AND 100),
  status                text NOT NULL DEFAULT 'NOT_STARTED',
  "scheduledAt"          timestamptz,                                        -- "30-day check-in · Scheduled", buddy slot
  "attachmentId"         uuid,
  "completionNote"       text,                                               -- "Verified by HR on 15 Sep"
  "completedAt"          timestamptz,
  "completedByUserId"  uuid,
  "sortOrder"            smallint NOT NULL DEFAULT 0,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "onboardingTaskOnboardingFk" FOREIGN KEY ("tenantId", "onboardingId") REFERENCES "HumanResources"."Onboardings" ("tenantId", id) ON DELETE CASCADE,
  CONSTRAINT "onboardingTaskTemplateTaskFk" FOREIGN KEY ("tenantId", "templateTaskId") REFERENCES "HumanResources"."OnboardingTemplateTasks" ("tenantId", id),
  CONSTRAINT "onboardingTaskOwnerFk" FOREIGN KEY ("tenantId", "ownerEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "onboardingTaskAttachmentFk" FOREIGN KEY ("tenantId", "attachmentId") REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "onboardingTaskCompletedByFk" FOREIGN KEY ("tenantId", "completedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "onboardingTaskDoneChk" CHECK ((status = 'COMPLETED') = ("completedAt" IS NOT NULL)),
  CONSTRAINT "onboardingTaskProgressChk" CHECK (status <> 'COMPLETED' OR "progressPct" = 100),
  CONSTRAINT "onboardingTaskScheduledChk" CHECK (status <> 'SCHEDULED' OR "scheduledAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."OnboardingTasks"');
CREATE INDEX "onboardingTaskOnboardingIdx" ON "HumanResources"."OnboardingTasks" ("tenantId", "onboardingId", "sortOrder");
CREATE INDEX "onboardingTaskOpenIdx" ON "HumanResources"."OnboardingTasks" ("tenantId", "ownerEmployeeId", "dueOn") WHERE status NOT IN ('COMPLETED','SKIPPED');

-- ---------------------------------------------------------------------------
-- offboarding — app/hr/offboarding "Exits in progress" (Employee, Department,
-- Resignation, Last day, Notice "20 / 30 days" / Terminated, Reason, Clearance
-- n / 4, Status Settlement / Serving notice / Retention talk / Closed; F&F
-- link) and "Record resignation"; profile "Offboard" button.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."Offboardings" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                 text NOT NULL,                                     -- OFF-2026-0007 (Company.getNextDocNo('OFF'))
  "employeeId"            uuid NOT NULL,
  "exitType"              text NOT NULL,
  "resignationDate"       date,                                              -- NULL for termination
  "lastWorkingDay"       date NOT NULL,
  "noticeDaysRequired"   smallint NOT NULL CHECK ("noticeDaysRequired" >= 0),     -- 30 / 60
  "noticeDaysServed"     smallint CHECK ("noticeDaysServed" >= 0),               -- 20
  "noticeWaived"          boolean NOT NULL DEFAULT false,
  "reasonCategory"        text NOT NULL,
  "reasonDetail"          text,                                              -- "Relocation (Multan)"
  "isVoluntary"           boolean NOT NULL DEFAULT true,
  status                 text NOT NULL DEFAULT 'SERVING_NOTICE',
  "resignationAttachmentId" uuid,
  "closedAt"              timestamptz,
  remarks                text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "offboardingEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "offboardingAttachmentFk" FOREIGN KEY ("tenantId", "resignationAttachmentId") REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "offboardingResignationChk" CHECK ("exitType" <> 'RESIGNATION' OR "resignationDate" IS NOT NULL),
  CONSTRAINT "offboardingDatesChk" CHECK ("resignationDate" IS NULL OR "lastWorkingDay" >= "resignationDate"),
  CONSTRAINT "offboardingServedChk" CHECK ("noticeDaysServed" IS NULL OR "noticeDaysServed" <= "noticeDaysRequired" OR "noticeWaived"),
  CONSTRAINT "offboardingClosedChk" CHECK ((status = 'CLOSED') = ("closedAt" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."Offboardings"', true);
CREATE INDEX "offboardingStatusIdx" ON "HumanResources"."Offboardings" ("tenantId", status, "lastWorkingDay");
CREATE UNIQUE INDEX "offboardingOneOpen" ON "HumanResources"."Offboardings" ("tenantId", "employeeId") WHERE status NOT IN ('CLOSED','WITHDRAWN');
COMMENT ON TABLE "HumanResources"."Offboardings" IS 'Exit case (OFF-): resignation/termination, notice, reason, status → final settlement in payroll.';

-- ---------------------------------------------------------------------------
-- ClearanceItems — app/hr/offboarding "Clearance by Department" (IT: assets &
-- access revocation; Administration: ID card, keys, SIM, vehicle; Finance:
-- loans, advances, claims; Line manager: knowledge handover) and the n / 4
-- clearance progress per exit.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."ClearanceItems" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "offboardingId"        uuid NOT NULL,
  "clearanceArea"        text NOT NULL,
  "departmentId"         uuid,
  description           text NOT NULL,                                      -- "Assets & access revocation"
  "ownerEmployeeId"     uuid,
  "employeeAssetId"     uuid,                                               -- asset to collect
  "recoverableAmount"    numeric(18,2) CHECK ("recoverableAmount" >= 0),      -- loans / advances outstanding
  status                text NOT NULL DEFAULT 'PENDING',
  "clearedAt"            timestamptz,
  "clearedByUserId"    uuid,
  remarks               text,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "clearanceItemOffboardingFk" FOREIGN KEY ("tenantId", "offboardingId") REFERENCES "HumanResources"."Offboardings" ("tenantId", id) ON DELETE CASCADE,
  CONSTRAINT "clearanceItemDepartmentFk" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "HumanResources"."Departments" ("tenantId", id),
  CONSTRAINT "clearanceItemOwnerFk" FOREIGN KEY ("tenantId", "ownerEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "clearanceItemAssetFk" FOREIGN KEY ("tenantId", "employeeAssetId") REFERENCES "HumanResources"."EmployeeAssets" ("tenantId", id),
  CONSTRAINT "clearanceItemClearedByFk" FOREIGN KEY ("tenantId", "clearedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "clearanceItemDoneChk" CHECK ((status = 'PENDING') = ("clearedAt" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."ClearanceItems"');
CREATE INDEX "clearanceItemOffboardingIdx" ON "HumanResources"."ClearanceItems" ("tenantId", "offboardingId");
CREATE INDEX "clearanceItemOpenIdx" ON "HumanResources"."ClearanceItems" ("tenantId", "clearanceArea") WHERE status = 'PENDING';

-- ---------------------------------------------------------------------------
-- ExitInterviews — app/hr/offboarding modal "Exit Interview" (interview date,
-- conducted by, primary reason, would you rejoin Yes/Maybe/No, satisfaction
-- with role / manager, compensation fairness 1–5, recommend to friends, what
-- did you value, what to improve, eligible for rehire, confidential HR only).
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."ExitInterviews" (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                  uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "offboardingId"             uuid NOT NULL,
  "interviewDate"             date NOT NULL,
  "conductedByEmployeeId"   uuid,
  "primaryReason"             text NOT NULL,
  "wouldRejoin"               text,
  "roleSatisfaction"          smallint CHECK ("roleSatisfaction" BETWEEN 1 AND 5),
  "managerSatisfaction"       smallint CHECK ("managerSatisfaction" BETWEEN 1 AND 5),
  "compensationFairness"      smallint CHECK ("compensationFairness" BETWEEN 1 AND 5),
  "wouldRecommend"            boolean,
  "valuedMost"                text,
  "shouldImprove"             text,
  "eligibleForRehire"        boolean NOT NULL DEFAULT true,
  "isConfidential"            boolean NOT NULL DEFAULT false,               -- HR only
  "createdAt"                 timestamptz NOT NULL DEFAULT now(),
  "createdBy"                 uuid,
  "updatedAt"                 timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                 uuid,
  "rowVersion"                integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "offboardingId"),
  CONSTRAINT "exitInterviewOffboardingFk" FOREIGN KEY ("tenantId", "offboardingId") REFERENCES "HumanResources"."Offboardings" ("tenantId", id),
  CONSTRAINT "exitInterviewConductedByFk" FOREIGN KEY ("tenantId", "conductedByEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."ExitInterviews"');

-- =============================================================================
-- 6. TALENT — recruitment
-- =============================================================================

-- ---------------------------------------------------------------------------
-- JobOpenings — app/hr/recruitment "Job Openings" (Position + REQ-2026-031 ·
-- Posted 08 Sep / "Replacement · Kashif Ali" / "Walk-in drive", Department,
-- Location, Openings, Applicants/Screening/Interview/Offer counts (derived),
-- Hiring manager, Status Open / Offer stage / Urgent; chips Open / On hold /
-- Closed) and "New Job Opening"; org chart "Vacant · Hiring" node.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."JobOpenings" (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                 uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                    text NOT NULL,                                  -- REQ-2026-031 (Company.getNextDocNo('REQ'))
  title                     text NOT NULL,                                  -- Sales Executive
  "designationId"            uuid,
  "departmentId"             uuid NOT NULL,
  "branchId"                 uuid NOT NULL,                                  -- Location
  openings                  smallint NOT NULL DEFAULT 1 CHECK (openings > 0),
  "requisitionType"          text NOT NULL DEFAULT 'NEW',
  "replacesEmployeeId"      uuid,
  "hiringMode"               text NOT NULL DEFAULT 'STANDARD',
  "hiringManagerEmployeeId" uuid,
  priority                  text NOT NULL DEFAULT 'NORMAL',
  "salaryMin"                numeric(18,2) CHECK ("salaryMin" >= 0),
  "salaryMax"                numeric(18,2),
  "jobDescription"           text,
  "postedChannels"           text[] NOT NULL DEFAULT ARRAY[]::text[],        -- ROZEE / LINKEDIN / CAREERS
  "postedOn"                 date,
  "targetHireDate"          date,
  status                    text NOT NULL DEFAULT 'DRAFT',
  "approvalRequestId"       uuid,
  "closedOn"                 date,
  "createdAt"                timestamptz NOT NULL DEFAULT now(),
  "createdBy"                uuid,
  "updatedAt"                timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                uuid,
  "rowVersion"               integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "jobRequisitionDesignationFk" FOREIGN KEY ("tenantId", "designationId") REFERENCES "HumanResources"."Designations" ("tenantId", id),
  CONSTRAINT "jobRequisitionDepartmentFk" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "HumanResources"."Departments" ("tenantId", id),
  CONSTRAINT "jobRequisitionBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "jobRequisitionReplacesFk" FOREIGN KEY ("tenantId", "replacesEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "jobRequisitionManagerFk" FOREIGN KEY ("tenantId", "hiringManagerEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "jobRequisitionApprovalFk" FOREIGN KEY ("tenantId", "approvalRequestId") REFERENCES "Company"."Approvals" ("tenantId", id),
  CONSTRAINT "jobRequisitionReplacementChk" CHECK ("requisitionType" <> 'REPLACEMENT' OR "replacesEmployeeId" IS NOT NULL),
  CONSTRAINT "jobRequisitionSalaryChk" CHECK ("salaryMax" IS NULL OR "salaryMin" IS NULL OR "salaryMax" >= "salaryMin"),
  CONSTRAINT "jobRequisitionChannelsChk" CHECK ("postedChannels" <@ ARRAY['ROZEE','LINKEDIN','CAREERS','REFERRAL','WALK_IN','AGENCY']::text[]),
  CONSTRAINT "jobRequisitionClosedChk" CHECK ((status IN ('CLOSED','CANCELLED')) = ("closedOn" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."JobOpenings"');
CREATE INDEX "jobRequisitionStatusIdx" ON "HumanResources"."JobOpenings" ("tenantId", status, "departmentId");

-- ---------------------------------------------------------------------------
-- candidate — app/hr/recruitment "Candidate Pipeline" kanban (Applied /
-- Screening / Interview / Offer / Hired; name, headline, stars, source chip,
-- "Panel: 03 Oct, 11:00", "Offered Rs 135,000 gross · Awaiting reply", "Joined
-- 14 Oct · EMP-0187") and drawer (email, phone, current employer, experience,
-- current / expected salary, notice period, education, rating 4.6 / 5 from 2
-- reviewers; Reject / CV / Move to Offer).
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."Candidates" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "jobRequisitionId"      uuid NOT NULL,
  "fullName"               text NOT NULL,
  email                   citext,
  phone                   text,
  cnic                    text CHECK (cnic IS NULL OR cnic ~ '^\d{5}-\d{7}-\d$'),
  headline                text,                                             -- "BBA · 2 yrs FMCG sales"
  "currentEmployer"        text,                                             -- Fatima Group
  "currentTitle"           text,                                             -- Key Account Executive
  "experienceYears"        numeric(4,1) CHECK ("experienceYears" >= 0),
  education               text,                                             -- BBA (Hons), IBA Karachi
  source                  text NOT NULL,
  "referredByEmployeeId" uuid,
  "appliedOn"              date NOT NULL DEFAULT current_date,
  stage                   text NOT NULL DEFAULT 'APPLIED',
  "currentSalary"          numeric(18,2) CHECK ("currentSalary" >= 0),
  "expectedSalary"         numeric(18,2) CHECK ("expectedSalary" >= 0),
  "noticeDays"             smallint CHECK ("noticeDays" >= 0),
  rating                  numeric(2,1) CHECK (rating BETWEEN 1 AND 5),      -- avg of reviewer ratings
  "nextInterviewAt"       timestamptz,
  "offeredSalary"          numeric(18,2) CHECK ("offeredSalary" >= 0),
  "offerStatus"            text,
  "offerSentOn"           date,
  "hiredEmployeeId"       uuid,
  "rejectionReason"        text,
  "cvAttachmentId"        uuid,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "jobRequisitionId", email),
  CONSTRAINT "candidateRequisitionFk" FOREIGN KEY ("tenantId", "jobRequisitionId") REFERENCES "HumanResources"."JobOpenings" ("tenantId", id),
  CONSTRAINT "candidateReferredByFk" FOREIGN KEY ("tenantId", "referredByEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "candidateHiredEmployeeFk" FOREIGN KEY ("tenantId", "hiredEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "candidateCvFk" FOREIGN KEY ("tenantId", "cvAttachmentId") REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "candidateReferralChk" CHECK (source <> 'REFERRAL' OR "referredByEmployeeId" IS NOT NULL),
  CONSTRAINT "candidateOfferChk" CHECK (stage NOT IN ('OFFER','HIRED') OR "offeredSalary" IS NOT NULL),
  CONSTRAINT "candidateHiredChk" CHECK ((stage = 'HIRED') = ("hiredEmployeeId" IS NOT NULL)),
  CONSTRAINT "candidateContactChk" CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."Candidates"');
CREATE INDEX "candidatePipelineIdx" ON "HumanResources"."Candidates" ("tenantId", "jobRequisitionId", stage);
CREATE INDEX "candidateNameTrgmIdx" ON "HumanResources"."Candidates" USING gin ("fullName" gin_trgm_ops);

ALTER TABLE "HumanResources"."Onboardings"
  ADD CONSTRAINT "onboardingCandidateFk" FOREIGN KEY ("tenantId", "candidateId") REFERENCES "HumanResources"."Candidates" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- CandidateActivities — drawer "Activity" (Phone screen — Zainab Raza · note;
-- Assessment — 82% · Sales aptitude test; Panel interview 03 Oct 11:00 ·
-- Zainab Raza, Ayesha Noor) + "Add note", stage moves, regret email.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."CandidateActivities" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "candidateId"          uuid NOT NULL,
  "activityType"         text NOT NULL,
  "occurredAt"           timestamptz NOT NULL DEFAULT now(),
  "scheduledAt"          timestamptz,                                        -- upcoming interview
  "byEmployeeId"        uuid,                                               -- reviewer / interviewer
  "panelNote"            text,                                               -- "Zainab Raza, Ayesha Noor"
  "fromStage"            text,
  "toStage"              text,
  "scorePct"             numeric(5,2) CHECK ("scorePct" BETWEEN 0 AND 100),   -- assessment 82%
  rating                smallint CHECK (rating BETWEEN 1 AND 5),            -- reviewer stars
  summary               text,                                               -- "Sales aptitude test"
  notes                 text,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "candidateActivityCandidateFk" FOREIGN KEY ("tenantId", "candidateId") REFERENCES "HumanResources"."Candidates" ("tenantId", id),
  CONSTRAINT "candidateActivityByFk" FOREIGN KEY ("tenantId", "byEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "candidateActivityStageChk" CHECK ("activityType" <> 'STAGE_CHANGE' OR "toStage" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."CandidateActivities"');
CREATE INDEX "candidateActivityCandidateIdx" ON "HumanResources"."CandidateActivities" ("tenantId", "candidateId", "occurredAt" DESC);

-- =============================================================================
-- 7. TALENT — performance
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PerformanceCycles — app/hr/performance hero ("Active cycle · 01 Jul – 31 Dec
-- 2026", "FY 2026-27 H1 Appraisal", eligible excludes probation, manager review
-- closes 15 Oct, calibration 20–24 Oct, increments effective January 2027
-- payroll) and stepper Goal setting → Self review → Manager review →
-- Calibration → Sign-off & letters; ESS goals tracker.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."PerformanceCycles" (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                 uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name                      text NOT NULL,                                  -- FY 2026-27 H1 Appraisal
  "cycleType"                text NOT NULL DEFAULT 'HALF_YEARLY',
  "periodStart"              date NOT NULL,
  "periodEnd"                date NOT NULL,
  "goalSettingDue"          date,
  "selfReviewDue"           date,                                           -- "Due 15 Oct"
  "managerReviewDue"        date,                                           -- closes 15 Oct
  "calibrationStart"         date,
  "calibrationEnd"           date,
  "signOffDue"              date,
  "incrementsEffectiveMonth" date,                                          -- 2027-01-01
  "excludeProbation"         boolean NOT NULL DEFAULT true,
  "ratingScaleMax"          smallint NOT NULL DEFAULT 5 CHECK ("ratingScaleMax" BETWEEN 3 AND 10),
  stage                     text NOT NULL DEFAULT 'GOAL_SETTING',
  status                    text NOT NULL DEFAULT 'DRAFT',
  "createdAt"                timestamptz NOT NULL DEFAULT now(),
  "createdBy"                uuid,
  "updatedAt"                timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                uuid,
  "rowVersion"               integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", name),
  CONSTRAINT "performanceCyclePeriodChk" CHECK ("periodEnd" > "periodStart"),
  CONSTRAINT "performanceCycleCalibChk" CHECK ("calibrationEnd" IS NULL OR "calibrationStart" IS NULL OR "calibrationEnd" >= "calibrationStart"),
  CONSTRAINT "performanceCycleIncrChk" CHECK ("incrementsEffectiveMonth" IS NULL
                                               OR "incrementsEffectiveMonth" = date_trunc('month', "incrementsEffectiveMonth")::date)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."PerformanceCycles"');
CREATE UNIQUE INDEX "performanceCycleOneActive" ON "HumanResources"."PerformanceCycles" ("tenantId") WHERE status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- PerformanceReviews — "Review cycle" table (Employee, Manager, Goals 112%,
-- Self 4.2, Manager 4.0, Stage Reviewed / Awaiting manager / PIP suggested /
-- Self pending), Goals panel "Weighted score 4.0 · Exceeds" + manager comment,
-- 9-Box Talent Grid (performance × potential), ESS self-assessment submit.
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."PerformanceReviews" (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "cycleId"                 uuid NOT NULL,
  "employeeId"              uuid NOT NULL,
  "managerEmployeeId"      uuid,
  "goalAchievementPct"     numeric(6,2) CHECK ("goalAchievementPct" >= 0),  -- 112% (weighted KRA achievement)
  "selfRating"              numeric(3,2) CHECK ("selfRating" BETWEEN 1 AND 5),
  "managerRating"           numeric(3,2) CHECK ("managerRating" BETWEEN 1 AND 5),
  "finalRating"             numeric(3,2) CHECK ("finalRating" BETWEEN 1 AND 5),   -- after calibration
  "ratingLabel"             text,
  "performanceBand"         text,   -- 9-box x
  "potentialBand"           text,     -- 9-box y
  "nineBox"                 text GENERATED ALWAYS AS (CASE
                               WHEN "potentialBand" = 'HIGH'     AND "performanceBand" = 'LOW'      THEN 'ENIGMA'
                               WHEN "potentialBand" = 'HIGH'     AND "performanceBand" = 'MODERATE' THEN 'GROWTH_EMPLOYEE'
                               WHEN "potentialBand" = 'HIGH'     AND "performanceBand" = 'HIGH'     THEN 'FUTURE_LEADER'
                               WHEN "potentialBand" = 'MODERATE' AND "performanceBand" = 'LOW'      THEN 'INCONSISTENT_PLAYER'
                               WHEN "potentialBand" = 'MODERATE' AND "performanceBand" = 'MODERATE' THEN 'CORE_PLAYER'
                               WHEN "potentialBand" = 'MODERATE' AND "performanceBand" = 'HIGH'     THEN 'HIGH_PERFORMER'
                               WHEN "potentialBand" = 'LOW'      AND "performanceBand" = 'LOW'      THEN 'RISK'
                               WHEN "potentialBand" = 'LOW'      AND "performanceBand" = 'MODERATE' THEN 'EFFECTIVE_EMPLOYEE'
                               WHEN "potentialBand" = 'LOW'      AND "performanceBand" = 'HIGH'     THEN 'TRUSTED_PROFESSIONAL'
                             END) STORED,
  "pipSuggested"            boolean NOT NULL DEFAULT false,
  stage                    text NOT NULL DEFAULT 'SELF_PENDING',
  "selfComment"             text,
  "managerComment"          text,                                            -- "Exceeded revenue target with City Mart …"
  "selfSubmittedAt"        timestamptz,
  "managerSubmittedAt"     timestamptz,
  "calibratedAt"            timestamptz,
  "signedOffAt"            timestamptz,
  "incrementPctRecommended" numeric(7,4) CHECK ("incrementPctRecommended" >= 0),
  "createdAt"               timestamptz NOT NULL DEFAULT now(),
  "createdBy"               uuid,
  "updatedAt"               timestamptz NOT NULL DEFAULT now(),
  "updatedBy"               uuid,
  "rowVersion"              integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "cycleId", "employeeId"),
  CONSTRAINT "performanceReviewCycleFk" FOREIGN KEY ("tenantId", "cycleId") REFERENCES "HumanResources"."PerformanceCycles" ("tenantId", id),
  CONSTRAINT "performanceReviewEmployeeFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "performanceReviewManagerFk" FOREIGN KEY ("tenantId", "managerEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "performanceReviewSelfChk" CHECK (("selfRating" IS NULL) = ("selfSubmittedAt" IS NULL)),
  CONSTRAINT "performanceReviewMgrChk" CHECK (("managerRating" IS NULL) = ("managerSubmittedAt" IS NULL)),
  CONSTRAINT "performanceReviewStageChk" CHECK (stage NOT IN ('REVIEWED','CALIBRATED','SIGNED_OFF') OR "managerRating" IS NOT NULL),
  CONSTRAINT "performanceReviewSignedChk" CHECK (stage <> 'SIGNED_OFF' OR ("finalRating" IS NOT NULL AND "signedOffAt" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."PerformanceReviews"', true);
CREATE INDEX "performanceReviewStageIdx" ON "HumanResources"."PerformanceReviews" ("tenantId", "cycleId", stage);
CREATE INDEX "performanceReviewManagerIdx" ON "HumanResources"."PerformanceReviews" ("tenantId", "managerEmployeeId", "cycleId");

ALTER TABLE "HumanResources"."EmployeePositionHistory"
  ADD CONSTRAINT "employeeHistoryReviewFk" FOREIGN KEY ("tenantId", "performanceReviewId") REFERENCES "HumanResources"."PerformanceReviews" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- goal — "Goals & KRAs — Bilal Khan" (title (weight %), actual, progress bar,
-- "112% of target" / "Target 90%"; "Goal library") and ESS ess/goals OKRs
-- (Objective n · weight 50%, status On track / Needs focus / At risk).
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."Goals" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"            uuid NOT NULL,
  "cycleId"               uuid,
  "performanceReviewId"  uuid,
  "goalKind"              text NOT NULL DEFAULT 'KRA',
  title                  text NOT NULL,                                     -- Achieve Rs 18M H1 sales
  description            text,
  "weightPct"             numeric(5,2) NOT NULL CHECK ("weightPct" > 0 AND "weightPct" <= 100),
  unit                   text,
  "targetValue"           numeric(18,2),                                     -- 18,000,000
  "actualValue"           numeric(18,2),                                     -- 20,200,000
  "progressPct"           numeric(6,2) NOT NULL DEFAULT 0 CHECK ("progressPct" >= 0),   -- may exceed 100 (112%)
  status                 text NOT NULL DEFAULT 'ON_TRACK',
  "fromLibrary"           boolean NOT NULL DEFAULT false,
  "sortOrder"             smallint NOT NULL DEFAULT 0,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "goalEmployeeFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "goalCycleFk" FOREIGN KEY ("tenantId", "cycleId") REFERENCES "HumanResources"."PerformanceCycles" ("tenantId", id),
  CONSTRAINT "goalReviewFk" FOREIGN KEY ("tenantId", "performanceReviewId") REFERENCES "HumanResources"."PerformanceReviews" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."Goals"');
CREATE INDEX "goalEmployeeIdx" ON "HumanResources"."Goals" ("tenantId", "employeeId", "cycleId");
COMMENT ON TABLE "HumanResources"."Goals" IS 'KRAs / OKR objectives per employee per cycle with weight and progress. Total weight per employee-cycle should be 100 (validated by the API).';

-- KeyResults — ESS OKR key results (title, progress slider %, "Rs 11.5M of Rs 18M")
CREATE TABLE "HumanResources"."KeyResults" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "goalId"          uuid NOT NULL,
  title            text NOT NULL,                                           -- Book Rs 18M sales in H1
  "weightPct"       numeric(5,2) CHECK ("weightPct" > 0 AND "weightPct" <= 100),  -- NULL = equal weights
  unit             text,
  "startValue"      numeric(18,2),
  "targetValue"     numeric(18,2),
  "currentValue"    numeric(18,2),
  "progressPct"     numeric(6,2) NOT NULL DEFAULT 0 CHECK ("progressPct" BETWEEN 0 AND 100),
  "sortOrder"       smallint NOT NULL DEFAULT 0,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "keyResultGoalFk" FOREIGN KEY ("tenantId", "goalId") REFERENCES "HumanResources"."Goals" ("tenantId", id) ON DELETE CASCADE
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."KeyResults"');
CREATE INDEX "keyResultGoalIdx" ON "HumanResources"."KeyResults" ("tenantId", "goalId", "sortOrder");

-- CompetencyRatings — ESS self-assessment competencies (Customer focus, Sales
-- execution, Team leadership, Communication, Ownership: 1–5 stars + evidence)
CREATE TABLE "HumanResources"."CompetencyRatings" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "performanceReviewId"  uuid NOT NULL,
  competency             text NOT NULL,                                     -- Customer focus
  "competencyDescription" text,                                              -- "Understands and anticipates customer needs"
  "raterRole"             text NOT NULL,
  rating                 smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  evidence               text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "performanceReviewId", competency, "raterRole"),
  CONSTRAINT "competencyRatingReviewFk" FOREIGN KEY ("tenantId", "performanceReviewId") REFERENCES "HumanResources"."PerformanceReviews" ("tenantId", id) ON DELETE CASCADE
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."CompetencyRatings"');

-- OneOnOneMeetings — ESS "1:1 notes" (topic, date, with, notes, action items one per
-- line with done ticks; "Action items show up in both your task lists")
CREATE TABLE "HumanResources"."OneOnOneMeetings" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"           uuid NOT NULL,
  "managerEmployeeId"   uuid NOT NULL,                                      -- "With"
  "meetingDate"          date NOT NULL,
  topic                 text NOT NULL,                                      -- "Q2 pipeline & Metro collections"
  notes                 text,
  "actionItems"          jsonb NOT NULL DEFAULT '[]'::jsonb,                 -- [{"text": "...", "done": true}]
  "cycleId"              uuid,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "oneOnOneEmployeeFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "oneOnOneManagerFk" FOREIGN KEY ("tenantId", "managerEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "oneOnOneCycleFk" FOREIGN KEY ("tenantId", "cycleId") REFERENCES "HumanResources"."PerformanceCycles" ("tenantId", id),
  CONSTRAINT "oneOnOneDistinctChk" CHECK ("employeeId" <> "managerEmployeeId"),
  CONSTRAINT "oneOnOneActionsChk" CHECK (jsonb_typeof("actionItems") = 'array')
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."OneOnOneMeetings"');
CREATE INDEX "oneOnOneEmployeeIdx" ON "HumanResources"."OneOnOneMeetings" ("tenantId", "employeeId", "meetingDate" DESC);

-- feedback — ESS "Feedback received" (from, relationship Manager / Peer · Key
-- Accounts / Finance, tag Strength / Growth, quote, date) and "Request
-- feedback" (up to 3 colleagues → REQUESTED rows)
CREATE TABLE "HumanResources"."PerformanceFeedback" (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "toEmployeeId"           uuid NOT NULL,
  "fromEmployeeId"         uuid NOT NULL,
  "requestedByEmployeeId" uuid,
  relationship             text,
  tag                      text,
  body                     text,
  "cycleId"                 uuid,
  status                   text NOT NULL DEFAULT 'GIVEN',
  "requestedAt"             timestamptz,
  "givenAt"                 timestamptz,
  "createdAt"               timestamptz NOT NULL DEFAULT now(),
  "createdBy"               uuid,
  "updatedAt"               timestamptz NOT NULL DEFAULT now(),
  "updatedBy"               uuid,
  "rowVersion"              integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "feedbackToFk" FOREIGN KEY ("tenantId", "toEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "feedbackFromFk" FOREIGN KEY ("tenantId", "fromEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "feedbackRequestedByFk" FOREIGN KEY ("tenantId", "requestedByEmployeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "feedbackCycleFk" FOREIGN KEY ("tenantId", "cycleId") REFERENCES "HumanResources"."PerformanceCycles" ("tenantId", id),
  CONSTRAINT "feedbackSelfChk" CHECK ("toEmployeeId" <> "fromEmployeeId"),
  CONSTRAINT "feedbackGivenChk" CHECK (status <> 'GIVEN' OR (body IS NOT NULL AND "givenAt" IS NOT NULL)),
  CONSTRAINT "feedbackRequestedChk" CHECK (status <> 'REQUESTED' OR "requestedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."PerformanceFeedback"');
CREATE INDEX "feedbackToIdx" ON "HumanResources"."PerformanceFeedback" ("tenantId", "toEmployeeId", status);
CREATE INDEX "feedbackFromOpenIdx" ON "HumanResources"."PerformanceFeedback" ("tenantId", "fromEmployeeId") WHERE status = 'REQUESTED';

-- =============================================================================
-- 8. TALENT — training
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TrainingPrograms — app/hr/training program cards (name, audience · format ·
-- provider / "Rs 18,000 / head", n / m completed, badge Compliance / In
-- progress / Completed / Starts Oct / Renewals due) and modal "New training
-- program" (name, audience, format 2-day workshop / Online · self-paced /
-- Blended, seats, budget). Header "FY 2026-27 budget Rs 3,600,000".
-- ---------------------------------------------------------------------------
CREATE TABLE "HumanResources"."TrainingPrograms" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                   text,
  name                   text NOT NULL,                                     -- Consultative Selling
  audience               text,                                              -- Sales & Support
  "departmentId"          uuid,                                              -- primary audience department
  format                 text NOT NULL,
  "durationLabel"         text,                                              -- "3-day workshop", "8 modules", "6 hrs"
  "durationHours"         numeric(6,2) CHECK ("durationHours" > 0),
  provider               text,                                              -- Rescue 1122 / LUMS Executive Education / ICAP
  "isMandatory"           boolean NOT NULL DEFAULT false,                    -- "Compliance" / "Mandatory"
  "isCpdCertified"       boolean NOT NULL DEFAULT false,
  seats                  integer CHECK (seats > 0),
  "targetParticipants"    integer CHECK ("targetParticipants" > 0),          -- 72 (49 / 72 completed)
  budget                 numeric(18,2) CHECK (budget >= 0),                 -- 240,000
  "costPerHead"          numeric(18,2) CHECK ("costPerHead" >= 0),          -- 18,000
  "grantsCertification"   text,                                              -- "Forklift Operator Licence"
  "certificationValidityMonths" smallint CHECK ("certificationValidityMonths" > 0),
  "startDate"             date,
  "endDate"               date,
  status                 text NOT NULL DEFAULT 'PLANNED',
  description            text,
  "deletedAt"             timestamptz,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", name),
  CONSTRAINT "trainingProgramDepartmentFk" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "HumanResources"."Departments" ("tenantId", id),
  CONSTRAINT "trainingProgramDatesChk" CHECK ("endDate" IS NULL OR "startDate" IS NULL OR "endDate" >= "startDate"),
  CONSTRAINT "trainingProgramCertChk" CHECK ("certificationValidityMonths" IS NULL OR "grantsCertification" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."TrainingPrograms"', true);
CREATE INDEX "trainingProgramStatusIdx" ON "HumanResources"."TrainingPrograms" ("tenantId", status);

-- TrainingSessions — "Upcoming Sessions" (title, date · time · venue · seats,
-- booked n / m, Mandatory) and modal "Schedule a session" (title, date & time,
-- seats, venue Lahore HQ training room / Karachi office / Microsoft Teams)
CREATE TABLE "HumanResources"."TrainingSessions" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "programId"         uuid NOT NULL,
  title              text NOT NULL,                                         -- Consultative Selling — Day 1
  "startsAt"          timestamptz NOT NULL,
  "endsAt"            timestamptz NOT NULL,
  "deliveryMode"      text NOT NULL DEFAULT 'IN_PERSON',
  venue              text,                                                  -- Karachi office / Microsoft Teams
  "branchId"          uuid,
  trainer            text,                                                  -- Rescue 1122
  seats              integer CHECK (seats > 0),
  "isMandatory"       boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'SCHEDULED',
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "trainingSessionProgramFk" FOREIGN KEY ("tenantId", "programId") REFERENCES "HumanResources"."TrainingPrograms" ("tenantId", id),
  CONSTRAINT "trainingSessionBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "trainingSessionTimeChk" CHECK ("endsAt" > "startsAt")
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."TrainingSessions"');
CREATE INDEX "trainingSessionUpcomingIdx" ON "HumanResources"."TrainingSessions" ("tenantId", "startsAt") WHERE status = 'SCHEDULED';

-- TrainingEnrolments — "Enrolments" (Employee, Program, Enrolled, Progress,
-- Score, Cost (Rs), Status Completed / Enrolled / In progress / Behind; chips
-- In progress / Completed / Not started) and modal "Enrol employees"
CREATE TABLE "HumanResources"."TrainingEnrolments" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "programId"         uuid NOT NULL,
  "employeeId"        uuid NOT NULL,
  "enrolledOn"        date NOT NULL DEFAULT current_date,
  "progressPct"       numeric(5,2) NOT NULL DEFAULT 0 CHECK ("progressPct" BETWEEN 0 AND 100),
  "scorePct"          numeric(5,2) CHECK ("scorePct" BETWEEN 0 AND 100),
  "hoursCompleted"    numeric(6,2) NOT NULL DEFAULT 0 CHECK ("hoursCompleted" >= 0),
  cost               numeric(18,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  status             text NOT NULL DEFAULT 'ENROLLED',
  "completedOn"       date,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "programId", "employeeId"),
  CONSTRAINT "trainingEnrolmentProgramFk" FOREIGN KEY ("tenantId", "programId") REFERENCES "HumanResources"."TrainingPrograms" ("tenantId", id),
  CONSTRAINT "trainingEnrolmentEmployeeFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "trainingEnrolmentDoneChk" CHECK ((status = 'COMPLETED') = ("completedOn" IS NOT NULL)),
  CONSTRAINT "trainingEnrolmentProgressChk" CHECK (status <> 'COMPLETED' OR "progressPct" = 100)
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."TrainingEnrolments"');
CREATE INDEX "trainingEnrolmentEmployeeIdx" ON "HumanResources"."TrainingEnrolments" ("tenantId", "employeeId");
CREATE INDEX "trainingEnrolmentStatusIdx" ON "HumanResources"."TrainingEnrolments" ("tenantId", "programId", status);

-- certification — "Certifications Expiring" (Employee, Certification, Expires,
-- days left; "Send reminders"); ESS "certificate added to your profile"
CREATE TABLE "HumanResources"."Certifications" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"            uuid NOT NULL,
  name                   text NOT NULL,                                     -- Forklift Operator Licence / CCNA / ICAP CPD hours (FY)
  issuer                 text,                                              -- Red Crescent / CIPS
  "certificateNo"         text,
  "issuedOn"              date,
  "expiresOn"             date,
  "trainingEnrolmentId"  uuid,
  "attachmentId"          uuid,
  status                 text NOT NULL DEFAULT 'ACTIVE',
  "reminderSentAt"       timestamptz,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "certificationEmployeeFk" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "HumanResources"."Employees" ("tenantId", id),
  CONSTRAINT "certificationEnrolmentFk" FOREIGN KEY ("tenantId", "trainingEnrolmentId") REFERENCES "HumanResources"."TrainingEnrolments" ("tenantId", id),
  CONSTRAINT "certificationAttachmentFk" FOREIGN KEY ("tenantId", "attachmentId") REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "certificationDatesChk" CHECK ("expiresOn" IS NULL OR "issuedOn" IS NULL OR "expiresOn" > "issuedOn")
);
SELECT "Company"."addStandardTriggers"('"HumanResources"."Certifications"');
CREATE INDEX "certificationExpiryIdx" ON "HumanResources"."Certifications" ("tenantId", "expiresOn") WHERE status = 'ACTIVE' AND "expiresOn" IS NOT NULL;
CREATE INDEX "certificationEmployeeIdx" ON "HumanResources"."Certifications" ("tenantId", "employeeId");

-- =============================================================================
-- 9. LEAVE BALANCE MAINTENANCE (triggers)
-- LeaveBalances is never edited by hand: LeaveRequests status changes move
-- days between booked (PENDING) and used (APPROVED); LeaveAdjustments rows
-- move entitled / carriedIn / adjusted / encashed / lapsed.
-- =============================================================================

-- Adds deltas to the (employee, type, year) balance row, creating it if needed.
CREATE OR REPLACE FUNCTION "HumanResources"."adjustLeaveBalance"("pTenant" uuid, "pEmployee" uuid, "pLeaveType" uuid, "pYear" date,
                                                 "pEntitled" numeric DEFAULT 0, "pCarried" numeric DEFAULT 0,
                                                 "pAdjusted" numeric DEFAULT 0, "pUsed" numeric DEFAULT 0,
                                                 "pBooked" numeric DEFAULT 0, "pEncashed" numeric DEFAULT 0,
                                                 "pLapsed" numeric DEFAULT 0)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "HumanResources"."LeaveBalances" AS b ("tenantId", "employeeId", "leaveTypeId", "leaveYearStart",
                                     entitled, "carriedIn", adjusted, used, booked, encashed, lapsed)
  VALUES ("pTenant", "pEmployee", "pLeaveType", "pYear",
          "pEntitled", "pCarried", "pAdjusted", "pUsed", "pBooked", "pEncashed", "pLapsed")
  ON CONFLICT ("tenantId", "employeeId", "leaveTypeId", "leaveYearStart") DO UPDATE
     SET entitled   = b.entitled   + EXCLUDED.entitled,
         "carriedIn" = b."carriedIn" + EXCLUDED."carriedIn",
         adjusted   = b.adjusted   + EXCLUDED.adjusted,
         used       = b.used       + EXCLUDED.used,
         booked     = b.booked     + EXCLUDED.booked,
         encashed   = b.encashed   + EXCLUDED.encashed,
         lapsed     = b.lapsed     + EXCLUDED.lapsed;
END $$;

CREATE OR REPLACE FUNCTION "HumanResources"."triggerLeaveRequestBalance"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vOldUsed"   numeric := 0;
  "vOldBooked" numeric := 0;
  "vNewUsed"   numeric := 0;
  "vNewBooked" numeric := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    "vOldUsed"   := CASE WHEN OLD.status = 'APPROVED' THEN OLD.days ELSE 0 END;
    "vOldBooked" := CASE WHEN OLD.status = 'PENDING'  THEN OLD.days ELSE 0 END;
    -- undo the old effect on the old (employee, type, year)
    IF "vOldUsed" <> 0 OR "vOldBooked" <> 0 THEN
      PERFORM "HumanResources"."adjustLeaveBalance"(OLD."tenantId", OLD."employeeId", OLD."leaveTypeId",
                                    "HumanResources"."getLeaveYearStart"(OLD."tenantId", OLD."fromDate"),
                                    "pUsed" => -"vOldUsed", "pBooked" => -"vOldBooked");
    END IF;
  END IF;
  "vNewUsed"   := CASE WHEN NEW.status = 'APPROVED' THEN NEW.days ELSE 0 END;
  "vNewBooked" := CASE WHEN NEW.status = 'PENDING'  THEN NEW.days ELSE 0 END;
  IF "vNewUsed" <> 0 OR "vNewBooked" <> 0 THEN
    PERFORM "HumanResources"."adjustLeaveBalance"(NEW."tenantId", NEW."employeeId", NEW."leaveTypeId",
                                  "HumanResources"."getLeaveYearStart"(NEW."tenantId", NEW."fromDate"),
                                  "pUsed" => "vNewUsed", "pBooked" => "vNewBooked");
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER "hrLeaveRequestBalance"
  AFTER INSERT OR UPDATE OF status, days, "leaveTypeId", "employeeId", "fromDate" ON "HumanResources"."LeaveRequests"
  FOR EACH ROW EXECUTE FUNCTION "HumanResources"."triggerLeaveRequestBalance"();

CREATE OR REPLACE FUNCTION "HumanResources"."triggerLeaveAdjustmentBalance"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vSigned" numeric := CASE WHEN NEW.direction = 'CREDIT' THEN NEW.days ELSE -NEW.days END;
BEGIN
  CASE NEW.kind
    WHEN 'ACCRUAL'       THEN PERFORM "HumanResources"."adjustLeaveBalance"(NEW."tenantId", NEW."employeeId", NEW."leaveTypeId", NEW."leaveYearStart", "pEntitled" => "vSigned");
    WHEN 'OPENING'       THEN PERFORM "HumanResources"."adjustLeaveBalance"(NEW."tenantId", NEW."employeeId", NEW."leaveTypeId", NEW."leaveYearStart", "pCarried"  => "vSigned");
    WHEN 'CARRY_FORWARD' THEN PERFORM "HumanResources"."adjustLeaveBalance"(NEW."tenantId", NEW."employeeId", NEW."leaveTypeId", NEW."leaveYearStart", "pCarried"  => "vSigned");
    WHEN 'ENCASHMENT'    THEN PERFORM "HumanResources"."adjustLeaveBalance"(NEW."tenantId", NEW."employeeId", NEW."leaveTypeId", NEW."leaveYearStart", "pEncashed" => NEW.days);
    WHEN 'LAPSE'         THEN PERFORM "HumanResources"."adjustLeaveBalance"(NEW."tenantId", NEW."employeeId", NEW."leaveTypeId", NEW."leaveYearStart", "pLapsed"   => NEW.days);
    ELSE                      PERFORM "HumanResources"."adjustLeaveBalance"(NEW."tenantId", NEW."employeeId", NEW."leaveTypeId", NEW."leaveYearStart", "pAdjusted" => "vSigned");
  END CASE;
  RETURN NULL;
END $$;
CREATE TRIGGER "hrLeaveAdjustmentBalance" AFTER INSERT ON "HumanResources"."LeaveAdjustments"
  FOR EACH ROW EXECUTE FUNCTION "HumanResources"."triggerLeaveAdjustmentBalance"();

-- Negative balances are rejected unless the leave type allows them
-- ("Allow negative balance"; Balances chip "Negative 2").
CREATE OR REPLACE FUNCTION "HumanResources"."triggerLeaveBalanceGuard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vType" record;   -- HumanResources.LeaveTypes row
BEGIN
  IF NEW.balance < 0 THEN
    SELECT lt."allowNegative", lt."isPaid", lt.code INTO "vType"
      FROM "HumanResources"."LeaveTypes" lt WHERE lt."tenantId" = NEW."tenantId" AND lt.id = NEW."leaveTypeId";
    IF "vType"."isPaid" AND NOT "vType"."allowNegative" THEN
      RAISE EXCEPTION 'Leave balance for type % would go negative (%)', "vType".code, NEW.balance
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "hrLeaveBalanceGuard" AFTER INSERT OR UPDATE ON "HumanResources"."LeaveBalances"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "HumanResources"."triggerLeaveBalanceGuard"();
