-- =============================================================================
-- Finsoft ERP (FULL) — views/90-payroll-views.sql
-- Payroll report views (install order: … → fk/* → 90-views → 91-rls → 95-seed).
--
-- Views named by entities/13-payroll.md and 14-ess.md (+ Payroll.getNextPayrollRun
-- from entities/02-auth-workspace-settings.md, Home dashboard):
--   Payroll.getPayrollRegister          Run Payroll (register XLSX), Payroll Reports
--   Payroll.getSalaryBankAdvice               Payroll Reports (Bank Advice)
--   Payroll.getEobiStatement            Payroll Overview (EOBI KPI), Payroll Reports (EOBI PR-01)
--   Payroll.getPessiStatement           Payroll Reports (PESSI)
--   Payroll.getSalaryTaxStatement      Payroll Reports (Salary Tax u/s 149)
--   Payroll.getProvidentFundRegister               Payroll Reports (PF), Payslip view, Loans, ESS Payslips
--   Payroll.getOutstandingLoans          Loans & Advances (Outstanding vs GL)
--   Payroll.getEmployeePayYearToDate              Payslip view, ESS Payslips
--   Payroll.getMonthlyPayrollCost      Payroll Overview (12-month cost vs budget)
--   Payroll.getPayrollCostByDepartment Payroll Overview (Cost by department)
--   Payroll.getPayslipDeliverySummary  Payslips (KPIs)
--   Payroll.getSalaryTaxProjection            ESS Tax declaration / projection
--   Payroll.getSalaryTaxCertificate    ESS Payslips (tax certificates)
--   Payroll.getNextPayrollRun          Home dashboard (Payroll card)
--
-- Rules
--   * Every view is WITH (security_invoker = true): RLS on the base tables
--     (tenantId = Company.getCurrentTenantId(), 91-rls.sql) applies to the caller.
--   * "Posted" payroll = PayrollRuns.status IN ('POSTED','PAID'). Lines on hold
--     (PayrollRunLines.isOnHold) are excluded from money totals, exactly as
--     Payroll.refreshPayrollRunTotals does.
--   * Tax year = Pakistan tax year July–June: Company.getFiscalYearLabel(month) with the
--     default start month 7 ('FY 2026-27'); taxYear text '2026-27' matches
--     Payroll.TaxDeclarations.taxYear / SalaryTaxSlabs.taxYear.
--   * Statutory deposit due date = 15th of the month after the payroll month.
--   * Self-contained: no view here reads a view from another 90-*.sql file.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- v_payroll_register — one row per payroll line (employee × run).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Payroll"."getPayrollRegister"
WITH (security_invoker = true) AS
SELECT l."tenantId",
       l."payrollRunId",
       r."docNo"                                                      AS "runDocNo",
       r."runType",
       r."payrollMonth",
       r.status                                                      AS "runStatus",
       l.id                                                          AS "payrollLineId",
       l."employeeId",
       e.code                                                        AS "employeeCode",
       e."displayName"                                                AS "employeeName",
       g.title                                                       AS designation,
       e."payGroup",
       l."departmentId",
       d.name                                                        AS department,
       l."branchId",
       b.name                                                        AS branch,
       l."gradeId",
       l."daysInMonth",
       l."paidDays",
       l."lwpDays",
       l."overtimeHours",
       l."basicAmount",
       l."allowanceAmount",
       l."grossAmount",
       l."taxAmount",
       l."eobiAmount",
       l."pfAmount",
       l."loanAmount",
       l."otherDeductionAmount",
       l."deductionAmount",
       l."netAmount",
       l."employerEobiAmount",
       l."employerPessiAmount",
       l."employerPfAmount",
       l."gratuityProvisionAmount",
       (l."grossAmount" + l."employerEobiAmount" + l."employerPessiAmount"
        + l."employerPfAmount" + l."gratuityProvisionAmount")       AS "ctcAmount",
       l."variancePct",
       l.flags,
       l."isNewJoiner",
       l."isRevised",
       l."isOnHold",
       l."holdReason",
       l."payMode"
  FROM "Payroll"."PayrollRunLines" l
  JOIN "Payroll"."PayrollRuns" r  ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
  JOIN "HumanResources"."Employees" e          ON e."tenantId" = l."tenantId" AND e.id = l."employeeId"
  LEFT JOIN "HumanResources"."Designations" g  ON g."tenantId" = e."tenantId" AND g.id = e."designationId"
  LEFT JOIN "HumanResources"."Departments" d   ON d."tenantId" = l."tenantId" AND d.id = l."departmentId"
  LEFT JOIN "Company"."Branches" b     ON b."tenantId" = l."tenantId" AND b.id = l."branchId";

COMMENT ON VIEW "Payroll"."getPayrollRegister" IS
  'Payroll register: one row per payroll line with basic, allowances, gross, tax, EOBI, PF, loans, net, employer contributions and CTC (department / branch snapshot). Screens: app/hr/payroll/run (Payroll register XLSX), app/hr/payroll/reports (Payroll Register).';


-- ---------------------------------------------------------------------------
-- v_bank_advice — net pay per employee with bank snapshot and payment batch.
-- Lines on hold are excluded (they are not paid in the run).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Payroll"."getSalaryBankAdvice"
WITH (security_invoker = true) AS
SELECT l."tenantId",
       l."payrollRunId",
       r."docNo"                                                      AS "runDocNo",
       r."payrollMonth",
       r."payDate",
       l."employeeId",
       e.code                                                        AS "employeeCode",
       e."displayName"                                                AS "employeeName",
       l."departmentId",
       l."branchId",
       l."payMode",
       COALESCE(l."bankName", CASE l."payMode" WHEN 'CASH' THEN 'Cash' WHEN 'CHEQUE' THEN 'Cheque' END) AS "bankName",
       l."ibanMasked",
       l."netAmount"                                                  AS amount,
       l."paymentRef",
       l."paymentBatchId",
       pb."paymentMethod",
       pb."instructionRef",
       pb."generatedAt",
       pb."sentAt",
       pb."valueDate",
       pb.status                                                     AS "batchStatus"
  FROM "Payroll"."PayrollRunLines" l
  JOIN "Payroll"."PayrollRuns" r       ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
  JOIN "HumanResources"."Employees" e               ON e."tenantId" = l."tenantId" AND e.id = l."employeeId"
  LEFT JOIN "Payroll"."SalaryPaymentBatches" pb ON pb."tenantId" = l."tenantId" AND pb.id = l."paymentBatchId"
 WHERE NOT l."isOnHold"
   AND r.status NOT IN ('REJECTED','CANCELLED','REVERSED');

COMMENT ON VIEW "Payroll"."getSalaryBankAdvice" IS
  'Bank advice: net pay per employee with bank / mode / masked IBAN and the payment batch (instruction ref, sent, value date); group by bankName. Screen: app/hr/payroll/reports (Bank Advice).';


-- ---------------------------------------------------------------------------
-- v_eobi_statement — EOBI PR-01 rows per employee × run.
--   wages        Σ earning components with SalaryComponents.includeInEobiWage,
--                else basicAmount
--   min_wage     wageCeiling of the tenant's EOBI_EMPLOYER component (the
--                statutory minimum-wage base, "Rs 37,000")
--   dueDate     15th of the following month
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Payroll"."getEobiStatement"
WITH (security_invoker = true) AS
SELECT l."tenantId",
       l."payrollRunId",
       r."docNo"                                                      AS "runDocNo",
       r."payrollMonth",
       l."branchId",
       b.name                                                        AS branch,
       l."employeeId",
       e.code                                                        AS "employeeCode",
       e."displayName"                                                AS "employeeName",
       e.cnic,
       st."eobiNo",
       l."paidDays"                                                   AS days,
       COALESCE(w."eobiWage", l."basicAmount")                         AS wages,
       l."eobiAmount"                                                 AS "employeeAmount",
       l."employerEobiAmount"                                        AS "employerAmount",
       (l."eobiAmount" + l."employerEobiAmount")                      AS "totalAmount",
       mw."minWage",
       (r."payrollMonth" + interval '1 month' + interval '14 days')::date AS "dueDate"
  FROM "Payroll"."PayrollRunLines" l
  JOIN "Payroll"."PayrollRuns" r          ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
  JOIN "HumanResources"."Employees" e                  ON e."tenantId" = l."tenantId" AND e.id = l."employeeId"
  LEFT JOIN "HumanResources"."EmployeeStatutoryDetails" st  ON st."tenantId" = l."tenantId" AND st."employeeId" = l."employeeId"
  LEFT JOIN "Company"."Branches" b             ON b."tenantId" = l."tenantId" AND b.id = l."branchId"
  LEFT JOIN LATERAL (
         SELECT sum(c.amount) AS "eobiWage"
           FROM "Payroll"."PayrollRunLineComponents" c
           JOIN "Payroll"."SalaryComponents" sc ON sc."tenantId" = c."tenantId" AND sc.id = c."componentId"
          WHERE c."tenantId" = l."tenantId" AND c."payrollLineId" = l.id
            AND c."componentType" = 'EARNING' AND sc."includeInEobiWage") w ON true
  LEFT JOIN LATERAL (
         SELECT sc."wageCeiling" AS "minWage"
           FROM "Payroll"."SalaryComponents" sc
          WHERE sc."tenantId" = l."tenantId" AND sc."systemRole" = 'EOBI_EMPLOYER' AND sc."deletedAt" IS NULL
          LIMIT 1) mw ON true
 WHERE r.status IN ('POSTED','PAID')
   AND NOT l."isOnHold"
   AND (l."eobiAmount" > 0 OR l."employerEobiAmount" > 0);

COMMENT ON VIEW "Payroll"."getEobiStatement" IS
  'EOBI PR-01 statement per employee × posted run: EOBI no., CNIC, days, wages, employee 1%, employer 5%, total; minimum wage (EOBI component wage ceiling) and due date; group by branch. Screens: app/hr/payroll (EOBI KPI), app/hr/payroll/reports (EOBI PR-01).';


-- ---------------------------------------------------------------------------
-- v_pessi_statement — provincial social security (PESSI / SESSI / KPESSI /
-- BESSI) per employee × run, where an employer contribution was booked.
--   scheme               EmployeeStatutoryDetails scheme, else the branch scheme
--   wages                as EOBI wages (includeInEobiWage components, else basic)
--   contributory_wages   wages capped at the PESSI_EMPLOYER component wageCeiling
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Payroll"."getPessiStatement"
WITH (security_invoker = true) AS
SELECT l."tenantId",
       l."payrollRunId",
       r."docNo"                                                      AS "runDocNo",
       r."payrollMonth",
       l."branchId",
       b.name                                                        AS branch,
       COALESCE(st."socialSecurityScheme", bs."socialSecurityScheme") AS scheme,
       l."employeeId",
       e.code                                                        AS "employeeCode",
       e."displayName"                                                AS "employeeName",
       e.cnic,
       st."socialSecurityNo",
       COALESCE(w.wage, l."basicAmount")                              AS wages,
       LEAST(COALESCE(w.wage, l."basicAmount"), COALESCE(cl."wageCeiling", COALESCE(w.wage, l."basicAmount"))) AS "contributoryWages",
       cl."wageCeiling",
       l."employerPessiAmount"                                       AS "employerAmount",
       (r."payrollMonth" + interval '1 month' + interval '14 days')::date AS "dueDate"
  FROM "Payroll"."PayrollRunLines" l
  JOIN "Payroll"."PayrollRuns" r            ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
  JOIN "HumanResources"."Employees" e                    ON e."tenantId" = l."tenantId" AND e.id = l."employeeId"
  LEFT JOIN "HumanResources"."EmployeeStatutoryDetails" st    ON st."tenantId" = l."tenantId" AND st."employeeId" = l."employeeId"
  LEFT JOIN "HumanResources"."BranchHrSettings" bs     ON bs."tenantId" = l."tenantId" AND bs."branchId" = l."branchId"
  LEFT JOIN "Company"."Branches" b               ON b."tenantId" = l."tenantId" AND b.id = l."branchId"
  LEFT JOIN LATERAL (
         SELECT sum(c.amount) AS wage
           FROM "Payroll"."PayrollRunLineComponents" c
           JOIN "Payroll"."SalaryComponents" sc ON sc."tenantId" = c."tenantId" AND sc.id = c."componentId"
          WHERE c."tenantId" = l."tenantId" AND c."payrollLineId" = l.id
            AND c."componentType" = 'EARNING' AND sc."includeInEobiWage") w ON true
  LEFT JOIN LATERAL (
         SELECT sc."wageCeiling"
           FROM "Payroll"."SalaryComponents" sc
          WHERE sc."tenantId" = l."tenantId" AND sc."systemRole" = 'PESSI_EMPLOYER' AND sc."deletedAt" IS NULL
          LIMIT 1) cl ON true
 WHERE r.status IN ('POSTED','PAID')
   AND NOT l."isOnHold"
   AND l."employerPessiAmount" > 0;

COMMENT ON VIEW "Payroll"."getPessiStatement" IS
  'Social security (PESSI / SESSI …) statement per employee × posted run: scheme, PESSI no., contributory wages, employer 6%. Punjab branches = PESSI, Karachi = SESSI (scheme column). Screen: app/hr/payroll/reports (PESSI).';


-- ---------------------------------------------------------------------------
-- v_salary_tax_statement — income tax u/s 149 per employee × run.
--   taxable_salary   Σ (amount − exemptAmount) of taxable EARNING components
--   tax_ytd          tax of posted runs in the same tax year up to this month
--   cpr_*            latest PAID Tax.WhtChallans for the month covering '149'
--   iris_status      not modelled (FBR IRIS filing) [simulated] → NULL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Payroll"."getSalaryTaxStatement"
WITH (security_invoker = true) AS
WITH x AS (
  SELECT l."tenantId", l."payrollRunId", r."docNo" AS "runDocNo", r."payrollMonth",
         l.id AS "payrollLineId", l."employeeId", l."departmentId", l."branchId",
         l."taxStatus", l."grossAmount", l."projectedAnnualSalary", l."annualExemptAmount",
         l."annualTaxableIncome", l."annualTaxLiability", l."taxSlabId", l."taxAmount",
         "Company"."getFiscalYearLabel"(r."payrollMonth")                              AS "taxYearLabel"
    FROM "Payroll"."PayrollRunLines" l
    JOIN "Payroll"."PayrollRuns" r ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
   WHERE r.status IN ('POSTED','PAID')
     AND NOT l."isOnHold"
)
SELECT x."tenantId",
       x."payrollRunId",
       x."runDocNo",
       x."payrollMonth",
       x."taxYearLabel",
       x."employeeId",
       e.code                                                        AS "employeeCode",
       e."displayName"                                                AS "employeeName",
       e.cnic,
       st.ntn,
       COALESCE(x."taxStatus", st."atlStatus")                         AS "taxStatus",
       x."departmentId",
       x."branchId",
       COALESCE(ts."taxableSalary", x."grossAmount")                   AS "taxableSalary",
       x."projectedAnnualSalary",
       x."annualExemptAmount",
       x."annualTaxableIncome"                                       AS "annualProjection",
       x."annualTaxLiability",
       x."taxSlabId",
       x."taxAmount"                                                  AS "taxMonth",
       sum(x."taxAmount") OVER (PARTITION BY x."tenantId", x."employeeId", x."taxYearLabel"
                               ORDER BY x."payrollMonth"
                               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "taxYtd",
       NULL::text                                                    AS "irisStatus",      -- [simulated] FBR IRIS filing state is not modelled
       cpr."cprNo",
       cpr."paymentDate"                                              AS "cprPaidOn",
       cpr.amount                                                    AS "cprAmount",
       (x."payrollMonth" + interval '1 month' + interval '14 days')::date AS "cprDueDate"
  FROM x
  JOIN "HumanResources"."Employees" e                 ON e."tenantId" = x."tenantId" AND e.id = x."employeeId"
  LEFT JOIN "HumanResources"."EmployeeStatutoryDetails" st ON st."tenantId" = x."tenantId" AND st."employeeId" = x."employeeId"
  LEFT JOIN LATERAL (
         SELECT sum(c.amount - c."exemptAmount") AS "taxableSalary"
           FROM "Payroll"."PayrollRunLineComponents" c
          WHERE c."tenantId" = x."tenantId" AND c."payrollLineId" = x."payrollLineId"
            AND c."componentType" = 'EARNING' AND c."isTaxable") ts ON true
  LEFT JOIN LATERAL (
         SELECT w."cprNo", w."paymentDate", w.amount
           FROM "Tax"."WhtChallans" w
          WHERE w."tenantId" = x."tenantId" AND w."periodMonth" = x."payrollMonth"
            AND w.status = 'PAID' AND '149' = ANY (w.sections)
          ORDER BY w."paymentDate" DESC
          LIMIT 1) cpr ON true;

COMMENT ON VIEW "Payroll"."getSalaryTaxStatement" IS
  'Salary tax u/s 149 per employee × posted run: CNIC / NTN, taxable salary, annual projection, tax for the month, tax YTD, CPR (Tax.WhtChallans) and CPR due date. iris_status is [simulated] (NULL). Screen: app/hr/payroll/reports (Salary Tax u/s 149).';


-- ---------------------------------------------------------------------------
-- v_pf_register — provident fund per employee × payroll month (posted runs).
--   opening    cumulative employee + employer PF before the month
--   closing    opening + employee + employer (+ profit)
--   profit     PF trust profit is not modelled [simulated] → NULL (closing
--              excludes it)
-- The latest row per employee is the current PF balance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Payroll"."getProvidentFundRegister"
WITH (security_invoker = true) AS
WITH m AS (
  SELECT l."tenantId", l."employeeId", r."payrollMonth",
         sum(l."pfAmount")          AS "employeeContribution",
         sum(l."employerPfAmount") AS "employerContribution"
    FROM "Payroll"."PayrollRunLines" l
    JOIN "Payroll"."PayrollRuns" r ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
   WHERE r.status IN ('POSTED','PAID')
     AND NOT l."isOnHold"
     AND (l."pfAmount" > 0 OR l."employerPfAmount" > 0)
   GROUP BY l."tenantId", l."employeeId", r."payrollMonth"
),
c AS (
  SELECT m.*,
         sum(m."employeeContribution" + m."employerContribution")
           OVER (PARTITION BY m."tenantId", m."employeeId" ORDER BY m."payrollMonth"
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)     AS cumulative,
         row_number() OVER (PARTITION BY m."tenantId", m."employeeId"
                            ORDER BY m."payrollMonth" DESC)             AS "rnDesc"
    FROM m
)
SELECT c."tenantId",
       c."employeeId",
       e.code                                                        AS "employeeCode",
       e."displayName"                                                AS "employeeName",
       e."departmentId",
       e."branchId",
       c."payrollMonth",
       "Company"."getFiscalYearLabel"(c."payrollMonth")                                AS "taxYearLabel",
       (c.cumulative - c."employeeContribution" - c."employerContribution") AS opening,
       c."employeeContribution",
       c."employerContribution",
       NULL::numeric(18,2)                                           AS profit,          -- [simulated] PF trust profit not modelled
       c.cumulative                                                  AS closing,
       (c."rnDesc" = 1)                                               AS "isLatest"
  FROM c
  JOIN "HumanResources"."Employees" e ON e."tenantId" = c."tenantId" AND e.id = c."employeeId";

COMMENT ON VIEW "Payroll"."getProvidentFundRegister" IS
  'PF register per employee × payroll month: opening, employee 8%, employer 8%, profit ([simulated], NULL), closing; is_latest row = current PF balance (emp + er). Screens: app/hr/payroll/reports (PF Register), app/hr/payroll/payslip, app/hr/loans, ess/payslips.';


-- ---------------------------------------------------------------------------
-- v_loan_outstanding — open loans / advances with recovery progress.
--   receivableAccountId  credit account of the LOAN (loans, medical) or
--                          ADVANCE (salary advances) deduction component — the
--                          GL 1340 / 1341 line the KPI is reconciled against
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Payroll"."getOutstandingLoans"
WITH (security_invoker = true) AS
SELECT ln."tenantId",
       ln.id                                                         AS "loanId",
       ln."docNo",
       ln."docDate",
       ln."employeeId",
       e.code                                                        AS "employeeCode",
       e."displayName"                                                AS "employeeName",
       e."departmentId",
       ln."loanType",
       ln.purpose,
       COALESCE(ln."approvedAmount", ln."requestedAmount")             AS "principalAmount",
       ln."recoveredAmount",
       ln."outstandingAmount",
       ln."installmentAmount",
       ln."installmentCount",
       COALESCE(i."installmentsRecovered", 0)                         AS "installmentsRecovered",
       i."nextDueMonth",
       i."nextInstallmentAmount",
       ln."disbursementDate",
       ln.status,
       ga."receivableAccountId"
  FROM "Payroll"."LoansAndAdvances" ln
  JOIN "HumanResources"."Employees" e ON e."tenantId" = ln."tenantId" AND e.id = ln."employeeId"
  LEFT JOIN LATERAL (
         SELECT (count(*) FILTER (WHERE li.status IN ('RECOVERED','SETTLED')))::integer   AS "installmentsRecovered",
                min(li."dueMonth") FILTER (WHERE li.status IN ('SCHEDULED','REQUESTED'))   AS "nextDueMonth",
                (array_agg(li.amount ORDER BY li."dueMonth")
                   FILTER (WHERE li.status IN ('SCHEDULED','REQUESTED')))[1]               AS "nextInstallmentAmount"
           FROM "Payroll"."LoanInstallments" li
          WHERE li."tenantId" = ln."tenantId" AND li."loanId" = ln.id) i ON true
  LEFT JOIN LATERAL (
         SELECT sc."creditAccountId" AS "receivableAccountId"
           FROM "Payroll"."SalaryComponents" sc
          WHERE sc."tenantId" = ln."tenantId" AND sc."deletedAt" IS NULL
            AND sc."systemRole" = CASE ln."loanType" WHEN 'SALARY_ADVANCE' THEN 'ADVANCE' ELSE 'LOAN' END
          LIMIT 1) ga ON true
 WHERE ln.status IN ('APPROVED','ACTIVE','SETTLEMENT')
   AND ln."outstandingAmount" > 0;

COMMENT ON VIEW "Payroll"."getOutstandingLoans" IS
  'Open loans and salary advances: principal, recovered, outstanding, installments recovered, next due month/amount, receivable GL account (1340 / 1341) for the "GL reconciled" check. Screen: app/hr/loans (Outstanding Balance KPI).';


-- ---------------------------------------------------------------------------
-- v_employee_ytd — tax-year-to-date totals per employee, as at each posted
-- payroll month (cumulative within the July–June tax year). Pick the row of
-- the payslip month, or is_latest for "FY to date".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Payroll"."getEmployeePayYearToDate"
WITH (security_invoker = true) AS
WITH m AS (
  SELECT l."tenantId", l."employeeId", r."payrollMonth",
         "Company"."getFiscalYearLabel"(r."payrollMonth")          AS "taxYearLabel",
         sum(l."grossAmount")                     AS gross,
         sum(l."taxAmount")                       AS tax,
         sum(l."eobiAmount")                      AS eobi,
         sum(l."pfAmount")                        AS pf,
         sum(l."employerPfAmount")               AS "employerPf",
         sum(l."loanAmount")                      AS "loanRecovered",
         sum(l."deductionAmount")                 AS deductions,
         sum(l."netAmount")                       AS net
    FROM "Payroll"."PayrollRunLines" l
    JOIN "Payroll"."PayrollRuns" r ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
   WHERE r.status IN ('POSTED','PAID')
     AND NOT l."isOnHold"
   GROUP BY l."tenantId", l."employeeId", r."payrollMonth"
)
SELECT m."tenantId",
       m."employeeId",
       m."taxYearLabel",
       substr(m."taxYearLabel", 4)                                   AS "taxYear",
       m."payrollMonth"                                               AS "asOfMonth",
       sum(m.gross)          OVER w                                  AS "grossYtd",
       sum(m.tax)            OVER w                                  AS "taxYtd",
       sum(m.eobi)           OVER w                                  AS "eobiYtd",
       sum(m.pf)             OVER w                                  AS "pfYtd",
       sum(m."employerPf")    OVER w                                  AS "employerPfYtd",
       sum(m."loanRecovered") OVER w                                  AS "loanRecoveredYtd",
       sum(m.deductions)     OVER w                                  AS "deductionsYtd",
       sum(m.net)            OVER w                                  AS "netYtd",
       count(*)              OVER w                                  AS "monthsPaid",
       (m."payrollMonth" = max(m."payrollMonth") OVER (PARTITION BY m."tenantId", m."employeeId", m."taxYearLabel")) AS "isLatest"
  FROM m
WINDOW w AS (PARTITION BY m."tenantId", m."employeeId", m."taxYearLabel"
             ORDER BY m."payrollMonth" ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW);

COMMENT ON VIEW "Payroll"."getEmployeePayYearToDate" IS
  'Tax-year-to-date gross, tax, EOBI, PF (emp / er), loan recovered, deductions and net per employee as at each posted payroll month; is_latest = FY to date. Screens: app/hr/payroll/payslip (Year-to-Date), ess/payslips (FY to date).';


-- ---------------------------------------------------------------------------
-- v_payroll_cost_monthly — 12-month payroll cost series vs budget.
--   salaries            Σ basicAmount
--   allowances_bonus    Σ (gross − basic)
--   employer_cost       employer EOBI + PESSI + PF + gratuity provision
--   budget              Σ Accounting.BudgetVersionLines month amounts on the GL accounts
--                       debited by EARNING / EMPLOYER_CONTRIBUTION salary
--                       components, from the current version of APPROVED
--                       OPERATING budgets (m01 = first month of the budget's
--                       fiscal year). DEPARTMENT budgets are left out so a
--                       company budget is not double counted.
-- Months with a budget but no payroll yet (future months) are included.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Payroll"."getMonthlyPayrollCost"
WITH (security_invoker = true) AS
WITH pay AS (
  SELECT l."tenantId", r."payrollMonth",
         count(DISTINCT l."employeeId")                                      AS "employeeCount",
         sum(l."basicAmount")                                                AS salaries,
         sum(l."grossAmount" - l."basicAmount")                               AS "allowancesBonus",
         sum(l."grossAmount")                                                AS gross,
         sum(l."employerEobiAmount" + l."employerPessiAmount"
             + l."employerPfAmount" + l."gratuityProvisionAmount")          AS "employerCost",
         sum(l."netAmount")                                                  AS net
    FROM "Payroll"."PayrollRunLines" l
    JOIN "Payroll"."PayrollRuns" r ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
   WHERE r.status IN ('POSTED','PAID')
     AND NOT l."isOnHold"
   GROUP BY l."tenantId", r."payrollMonth"
),
"salaryAccounts" AS (
  SELECT DISTINCT sc."tenantId", sc."debitAccountId" AS "accountId"
    FROM "Payroll"."SalaryComponents" sc
   WHERE sc."componentType" IN ('EARNING','EMPLOYER_CONTRIBUTION')
     AND sc."debitAccountId" IS NOT NULL
     AND sc."deletedAt" IS NULL
),
bud AS (
  SELECT bl."tenantId",
         (fy."startDate" + (u.n - 1) * interval '1 month')::date             AS "payrollMonth",
         sum(u.amount)                                                      AS budget
    FROM "Accounting"."Budgets" bg
    JOIN "Accounting"."FiscalYears" fy   ON fy."tenantId" = bg."tenantId" AND fy.id = bg."fiscalYearId"
    JOIN "Accounting"."BudgetVersionLines" bl   ON bl."tenantId" = bg."tenantId" AND bl."budgetVersionId" = bg."currentVersionId"
    JOIN "salaryAccounts" sa   ON sa."tenantId" = bl."tenantId" AND sa."accountId" = bl."accountId"
   CROSS JOIN LATERAL unnest(ARRAY[bl.m01, bl.m02, bl.m03, bl.m04, bl.m05, bl.m06,
                                   bl.m07, bl.m08, bl.m09, bl.m10, bl.m11, bl.m12])
                      WITH ORDINALITY AS u(amount, n)
   WHERE bg.status = 'APPROVED'
     AND bg."budgetType" = 'OPERATING'
   GROUP BY bl."tenantId", (fy."startDate" + (u.n - 1) * interval '1 month')::date
)
SELECT COALESCE(p."tenantId", b."tenantId")                            AS "tenantId",
       COALESCE(p."payrollMonth", b."payrollMonth")                    AS "payrollMonth",
       date_trunc('quarter', COALESCE(p."payrollMonth", b."payrollMonth"))::date AS "quarterStart",
       COALESCE(p."employeeCount", 0)::integer                        AS "employeeCount",
       COALESCE(p.salaries, 0)                                       AS salaries,
       COALESCE(p."allowancesBonus", 0)                               AS "allowancesBonus",
       COALESCE(p.gross, 0)                                          AS gross,
       COALESCE(p."employerCost", 0)                                  AS "employerCost",
       COALESCE(p.gross, 0) + COALESCE(p."employerCost", 0)           AS ctc,
       COALESCE(p.net, 0)                                            AS net,
       b.budget
  FROM pay p
  FULL JOIN bud b ON b."tenantId" = p."tenantId" AND b."payrollMonth" = p."payrollMonth";

COMMENT ON VIEW "Payroll"."getMonthlyPayrollCost" IS
  'Monthly payroll cost (salaries = basic, allowances & bonus = gross − basic, employer cost, CTC, net) vs budget from Accounting.BudgetVersionLines on salary GL accounts (approved operating budget, current version). Quarterly = GROUP BY quarter_start. Screen: app/hr/payroll (Payroll cost · 12 months).';


-- ---------------------------------------------------------------------------
-- v_payroll_cost_by_department — per run × department (snapshot on the line).
--   sharePct = department gross ÷ run gross × 100
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Payroll"."getPayrollCostByDepartment"
WITH (security_invoker = true) AS
WITH d AS (
  SELECT l."tenantId", l."payrollRunId", r."docNo" AS "runDocNo", r."payrollMonth", r.status AS "runStatus",
         l."departmentId",
         count(DISTINCT l."employeeId")                                      AS heads,
         sum(l."grossAmount")                                                AS gross,
         sum(l."netAmount")                                                  AS net,
         sum(l."grossAmount" + l."employerEobiAmount" + l."employerPessiAmount"
             + l."employerPfAmount" + l."gratuityProvisionAmount")          AS ctc
    FROM "Payroll"."PayrollRunLines" l
    JOIN "Payroll"."PayrollRuns" r ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
   WHERE NOT l."isOnHold"
     AND r.status NOT IN ('REJECTED','CANCELLED','REVERSED')
   GROUP BY l."tenantId", l."payrollRunId", r."docNo", r."payrollMonth", r.status, l."departmentId"
)
SELECT d."tenantId",
       d."payrollRunId",
       d."runDocNo",
       d."payrollMonth",
       d."runStatus",
       d."departmentId",
       dp.code                                                       AS "departmentCode",
       dp.name                                                       AS department,
       d.heads::integer                                              AS heads,
       d.gross,
       d.net,
       d.ctc,
       round(d.gross / NULLIF(d.heads, 0), 2)                        AS "avgGross",
       round(100.0 * d.gross / NULLIF(sum(d.gross) OVER (PARTITION BY d."tenantId", d."payrollRunId"), 0), 1) AS "sharePct"
  FROM d
  LEFT JOIN "HumanResources"."Departments" dp ON dp."tenantId" = d."tenantId" AND dp.id = d."departmentId";

COMMENT ON VIEW "Payroll"."getPayrollCostByDepartment" IS
  'Payroll cost per run × department: heads, gross, net, CTC, average gross, share % of run gross. Screen: app/hr/payroll (Cost by department).';


-- ---------------------------------------------------------------------------
-- v_payslip_delivery_summary — payslip delivery KPIs per run.
--   emailed       EMAILED or VIEWED (or emailedAt set)
--   not_sent      GENERATED + NO_EMAIL
--   delivered_pct emailed ÷ generated;  open_rate_pct viewed ÷ emailed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Payroll"."getPayslipDeliverySummary"
WITH (security_invoker = true) AS
SELECT ps."tenantId",
       ps."payrollRunId",
       r."docNo"                                                      AS "runDocNo",
       r."payrollMonth",
       r."postedAt",
       r."paidAt",
       count(*)::integer                                             AS generated,
       (count(*) FILTER (WHERE ps.status IN ('EMAILED','VIEWED') OR ps."emailedAt" IS NOT NULL))::integer AS emailed,
       (count(*) FILTER (WHERE ps.status = 'VIEWED' OR ps."viewedAt" IS NOT NULL))::integer            AS viewed,
       (count(*) FILTER (WHERE ps.status = 'BOUNCED'))::integer      AS bounced,
       (count(*) FILTER (WHERE ps.status = 'NO_EMAIL'))::integer     AS "noEmail",
       (count(*) FILTER (WHERE ps.status = 'ON_HOLD'))::integer      AS "onHold",
       (count(*) FILTER (WHERE ps.status IN ('GENERATED','NO_EMAIL')))::integer AS "notSent",
       (count(*) FILTER (WHERE ps."publishedToEssAt" IS NOT NULL))::integer  AS "publishedToEss",
       (count(*) FILTER (WHERE ps."printedAt" IS NOT NULL))::integer  AS printed,
       round(100.0 * count(*) FILTER (WHERE ps.status IN ('EMAILED','VIEWED') OR ps."emailedAt" IS NOT NULL)
             / NULLIF(count(*), 0), 1)                               AS "deliveredPct",
       round(100.0 * count(*) FILTER (WHERE ps.status = 'VIEWED' OR ps."viewedAt" IS NOT NULL)
             / NULLIF(count(*) FILTER (WHERE ps.status IN ('EMAILED','VIEWED') OR ps."emailedAt" IS NOT NULL), 0), 1) AS "openRatePct"
  FROM "Payroll"."Payslips" ps
  JOIN "Payroll"."PayrollRuns" r ON r."tenantId" = ps."tenantId" AND r.id = ps."payrollRunId"
 GROUP BY ps."tenantId", ps."payrollRunId", r."docNo", r."payrollMonth", r."postedAt", r."paidAt";

COMMENT ON VIEW "Payroll"."getPayslipDeliverySummary" IS
  'Payslip delivery per run: generated, emailed (% delivered), viewed in ESS (open rate), bounced, no email, on hold, not sent, published, printed. Screen: app/hr/payroll/payslips (KPIs).';


-- ---------------------------------------------------------------------------
-- v_tax_projection — salary tax projection per employee × tax year, from the
-- latest posted payroll line of that year plus declarations and slabs.
--   projected_taxable_income  PayrollRunLines.annualTaxableIncome (gross − exempt)
--   annual_tax                PayrollRunLines.annualTaxLiability
--   zakat_deduction           APPROVED ZAKAT declarations (deductible allowance, s.60)
--   slab_tax_after_zakat      fixedTax + rate% × (income − zakat − incomeFrom)
--                             from Payroll.SalaryTaxSlabs of the tax year
--   tax_credits               APPROVED estimatedTaxSaving of TAX_CREDIT rows
--   monthly_tax_remaining     (annual tax after reliefs − deducted) ÷ months left
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Payroll"."getSalaryTaxProjection"
WITH (security_invoker = true) AS
WITH lines AS (
  SELECT l."tenantId", l."employeeId", r."payrollMonth",
         substr("Company"."getFiscalYearLabel"(r."payrollMonth"), 4)                          AS "taxYear",
         l."taxStatus", l."projectedAnnualSalary", l."annualExemptAmount",
         l."annualTaxableIncome", l."annualTaxLiability", l."taxSlabId", l."taxAmount"
    FROM "Payroll"."PayrollRunLines" l
    JOIN "Payroll"."PayrollRuns" r ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
   WHERE r.status IN ('POSTED','PAID')
     AND NOT l."isOnHold"
),
latest AS (
  SELECT DISTINCT ON ("tenantId", "employeeId", "taxYear") *
    FROM lines
   ORDER BY "tenantId", "employeeId", "taxYear", "payrollMonth" DESC
),
agg AS (
  SELECT "tenantId", "employeeId", "taxYear",
         sum("taxAmount")                                                    AS "taxDeductedYtd",
         count(DISTINCT "payrollMonth")                                      AS "monthsPaid"
    FROM lines
   GROUP BY "tenantId", "employeeId", "taxYear"
),
decl AS (
  SELECT td."tenantId", td."employeeId", td."taxYear",
         (count(*) FILTER (WHERE td.status <> 'NOT_DECLARED'))::integer     AS "declaredCount",
         (count(*) FILTER (WHERE td.status = 'APPROVED'))::integer          AS "approvedCount",
         COALESCE(sum(td.amount) FILTER (WHERE td.status = 'APPROVED'
                                          AND td."reliefKind" = 'DEDUCTIBLE_ALLOWANCE'), 0) AS "zakatDeduction",
         COALESCE(sum(td."estimatedTaxSaving") FILTER (WHERE td.status = 'APPROVED'
                                                        AND td."reliefKind" = 'TAX_CREDIT'), 0) AS "taxCredits",
         COALESCE(sum(td."estimatedTaxSaving") FILTER (WHERE td.status = 'APPROVED'), 0) AS "taxSaved",
         COALESCE(sum(td."estimatedTaxSaving") FILTER (WHERE td.status IN ('PENDING','IN_REVIEW')), 0) AS "taxSavingPending"
    FROM "Payroll"."TaxDeclarations" td
   GROUP BY td."tenantId", td."employeeId", td."taxYear"
),
base AS (
  SELECT lt.*, a."taxDeductedYtd", a."monthsPaid",
         COALESCE(d."declaredCount", 0)                                      AS "declaredCount",
         COALESCE(d."approvedCount", 0)                                      AS "approvedCount",
         COALESCE(d."zakatDeduction", 0)                                     AS "zakatDeduction",
         COALESCE(d."taxCredits", 0)                                         AS "taxCredits",
         COALESCE(d."taxSaved", 0)                                           AS "taxSaved",
         COALESCE(d."taxSavingPending", 0)                                  AS "taxSavingPending",
         12 - ((extract(month FROM lt."payrollMonth")::int - 7 + 12) % 12 + 1) AS "monthsRemaining"
    FROM latest lt
    JOIN agg a ON a."tenantId" = lt."tenantId" AND a."employeeId" = lt."employeeId" AND a."taxYear" = lt."taxYear"
    LEFT JOIN decl d ON d."tenantId" = lt."tenantId" AND d."employeeId" = lt."employeeId" AND d."taxYear" = lt."taxYear"
)
SELECT b."tenantId",
       b."employeeId",
       b."taxYear",
       'FY ' || b."taxYear"                                           AS "taxYearLabel",
       b."payrollMonth"                                               AS "asOfMonth",
       b."taxStatus",
       b."projectedAnnualSalary",
       b."annualExemptAmount",
       b."annualTaxableIncome"                                       AS "projectedTaxableIncome",
       b."annualTaxLiability"                                        AS "annualTax",
       round(100.0 * b."annualTaxLiability" / NULLIF(b."annualTaxableIncome", 0), 2) AS "effectiveRatePct",
       b."taxSlabId",
       b."taxDeductedYtd",
       b."monthsPaid"::integer                                        AS "monthsPaid",
       b."monthsRemaining",
       b."declaredCount",
       4                                                             AS "declarableCount",   -- ZAKAT, VPS_PENSION, DONATION, HEALTH_INSURANCE
       b."approvedCount",
       b."zakatDeduction",
       sl."slabTaxAfterZakat",
       b."taxCredits",
       b."taxSaved",
       b."taxSavingPending",
       GREATEST(COALESCE(sl."slabTaxAfterZakat", b."annualTaxLiability") - b."taxCredits", 0) AS "annualTaxAfterReliefs",
       CASE WHEN b."monthsRemaining" > 0
            THEN round(GREATEST(GREATEST(COALESCE(sl."slabTaxAfterZakat", b."annualTaxLiability") - b."taxCredits", 0)
                                - b."taxDeductedYtd", 0) / b."monthsRemaining", 0)
            ELSE 0 END                                               AS "monthlyTaxRemaining"
  FROM base b
  LEFT JOIN LATERAL (
         SELECT round(s."fixedTax" + s."ratePercent" / 100
                      * (GREATEST(b."annualTaxableIncome" - b."zakatDeduction", 0) - s."incomeFrom"), 0) AS "slabTaxAfterZakat"
           FROM "Payroll"."SalaryTaxSlabs" s
          WHERE s."tenantId" = b."tenantId" AND s."taxYear" = b."taxYear"
            AND GREATEST(b."annualTaxableIncome" - b."zakatDeduction", 0) >= s."incomeFrom"
            AND (s."incomeTo" IS NULL OR GREATEST(b."annualTaxableIncome" - b."zakatDeduction", 0) < s."incomeTo")
          LIMIT 1) sl ON true;

COMMENT ON VIEW "Payroll"."getSalaryTaxProjection" IS
  'Salary tax projection per employee × tax year: projected taxable income, annual tax, effective rate, deducted so far, months remaining, declarations n/4, zakat deduction, tax credits / saved, annual tax after reliefs (slab), monthly tax from next payroll. Screen: ess/tax (FY projection, tax saved, deduction schedule).';


-- ---------------------------------------------------------------------------
-- v_salary_tax_certificate — tax certificate data per employee × tax year ×
-- quarter (Q1 = Jul–Sep). CPR numbers are the employer's PAID u/s 149
-- deposits (Tax.WhtChallans) for the months of the quarter.
--   is_final   the tax year has ended (certificate can be issued)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Payroll"."getSalaryTaxCertificate"
WITH (security_invoker = true) AS
WITH q AS (
  SELECT l."tenantId", l."employeeId",
         substr("Company"."getFiscalYearLabel"(r."payrollMonth"), 4)                          AS "taxYear",
         ((extract(month FROM r."payrollMonth")::int - 7 + 12) % 12) / 3 + 1 AS "quarterNo",
         min(r."payrollMonth")                                               AS "firstMonth",
         max(r."payrollMonth")                                               AS "lastMonth",
         array_agg(DISTINCT r."payrollMonth")                                AS months,
         sum(l."grossAmount")                                                AS "grossSalary",
         sum(COALESCE(ts.taxable, l."grossAmount"))                          AS "taxableSalary",
         sum(l."taxAmount")                                                  AS "taxDeducted"
    FROM "Payroll"."PayrollRunLines" l
    JOIN "Payroll"."PayrollRuns" r ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
    LEFT JOIN LATERAL (
           SELECT sum(c.amount - c."exemptAmount") AS taxable
             FROM "Payroll"."PayrollRunLineComponents" c
            WHERE c."tenantId" = l."tenantId" AND c."payrollLineId" = l.id
              AND c."componentType" = 'EARNING' AND c."isTaxable") ts ON true
   WHERE r.status IN ('POSTED','PAID')
     AND NOT l."isOnHold"
   GROUP BY l."tenantId", l."employeeId", substr("Company"."getFiscalYearLabel"(r."payrollMonth"), 4),
            ((extract(month FROM r."payrollMonth")::int - 7 + 12) % 12) / 3 + 1
)
SELECT q."tenantId",
       q."employeeId",
       e.code                                                        AS "employeeCode",
       e."displayName"                                                AS "employeeName",
       e.cnic,
       st.ntn,
       q."taxYear",
       'FY ' || q."taxYear"                                           AS "taxYearLabel",
       q."quarterNo",
       q."firstMonth",
       q."lastMonth",
       q."grossSalary",
       q."taxableSalary",
       q."taxDeducted",
       sum(q."taxDeducted") OVER (PARTITION BY q."tenantId", q."employeeId", q."taxYear") AS "taxDeductedYear",
       cpr."cprNos",
       cpr."lastDepositedOn",
       cpr."depositedAmount",
       (make_date(left(q."taxYear", 4)::int + 1, 6, 30) < current_date) AS "isFinal"
  FROM q
  JOIN "HumanResources"."Employees" e                 ON e."tenantId" = q."tenantId" AND e.id = q."employeeId"
  LEFT JOIN "HumanResources"."EmployeeStatutoryDetails" st ON st."tenantId" = q."tenantId" AND st."employeeId" = q."employeeId"
  LEFT JOIN LATERAL (
         SELECT array_agg(w."cprNo" ORDER BY w."paymentDate") AS "cprNos",
                max(w."paymentDate")                         AS "lastDepositedOn",
                sum(w.amount)                               AS "depositedAmount"
           FROM "Tax"."WhtChallans" w
          WHERE w."tenantId" = q."tenantId" AND w.status = 'PAID'
            AND '149' = ANY (w.sections)
            AND w."periodMonth" = ANY (q.months)) cpr ON true;

COMMENT ON VIEW "Payroll"."getSalaryTaxCertificate" IS
  'Salary tax certificate per employee × tax year × quarter: gross, taxable salary, tax deducted, year total, employer CPR numbers / deposit date / deposited amount (Tax.WhtChallans u/s 149; deposited_amount is the employer''s whole deposit, not the employee share). Screen: ess/payslips (tax certificates).';


-- ---------------------------------------------------------------------------
-- v_payroll_next_run — the next REGULAR run per tenant for the Home card.
--   The earliest REGULAR run not yet POSTED/PAID; if none exists, a virtual
--   row for the month after the last posted run (status NOT_STARTED).
--   est_net_pay      run net once calculated, else the last posted run's net
--   employeeCount   run count once calculated, else active employees
--   steps_done/total run checklist items; when the run has none, the wizard
--                    step reached out of 5
--   dueDate         payDate, else the last day of the payroll month
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Payroll"."getNextPayrollRun"
WITH (security_invoker = true) AS
WITH "openRun" AS (
  SELECT DISTINCT ON (r."tenantId") r.*
    FROM "Payroll"."PayrollRuns" r
   WHERE r."runType" = 'REGULAR'
     AND r.status IN ('DRAFT','REVIEW','AWAITING_APPROVAL','APPROVED')
   ORDER BY r."tenantId", r."payrollMonth"
),
"lastRun" AS (
  SELECT DISTINCT ON (r."tenantId") r.*
    FROM "Payroll"."PayrollRuns" r
   WHERE r."runType" = 'REGULAR'
     AND r.status IN ('POSTED','PAID')
   ORDER BY r."tenantId", r."payrollMonth" DESC
),
t AS (
  SELECT "tenantId" FROM "openRun" UNION SELECT "tenantId" FROM "lastRun"
)
SELECT t."tenantId",
       o.id                                                          AS "payrollRunId",
       COALESCE(o."docNo", 'PR-' || to_char(lr."payrollMonth" + interval '1 month', 'YYYY-MM')) AS "docNo",
       COALESCE(o."payrollMonth", (lr."payrollMonth" + interval '1 month')::date)             AS "payrollMonth",
       COALESCE(o.status, 'NOT_STARTED')                             AS status,
       CASE WHEN o."calculatedAt" IS NOT NULL THEN o."netAmount" ELSE lr."netAmount" END        AS "estNetPay",
       CASE WHEN o."calculatedAt" IS NOT NULL THEN o."employeeCount"
            ELSE (SELECT count(*)::integer FROM "HumanResources"."Employees" e
                   WHERE e."tenantId" = t."tenantId" AND e."deletedAt" IS NULL AND e.status <> 'EXITED') END AS "employeeCount",
       CASE WHEN ck.total > 0 THEN ck.done ELSE COALESCE(o."wizardStep" - 1, 0) END           AS "stepsDone",
       CASE WHEN ck.total > 0 THEN ck.total ELSE 5 END                                       AS "stepsTotal",
       COALESCE(o."payDate",
                (COALESCE(o."payrollMonth", (lr."payrollMonth" + interval '1 month')::date)
                 + interval '1 month' - interval '1 day')::date)     AS "dueDate",
       lr."docNo"                                                     AS "lastPostedDocNo"
  FROM t
  LEFT JOIN "openRun" o  ON o."tenantId" = t."tenantId"
  LEFT JOIN "lastRun" lr ON lr."tenantId" = t."tenantId"
  LEFT JOIN LATERAL (
         SELECT (count(*))::integer                       AS total,
                (count(*) FILTER (WHERE c."isDone"))::integer AS done
           FROM "Payroll"."PayrollRunChecklistItems" c
          WHERE c."tenantId" = o."tenantId" AND c."payrollRunId" = o.id) ck ON true;

COMMENT ON VIEW "Payroll"."getNextPayrollRun" IS
  'Next regular payroll run per tenant: doc no, month, status (NOT_STARTED when no run exists yet), estimated net pay, employees, steps done / total, due (pay) date. Screen: app/dashboard (Home · Payroll card).';
