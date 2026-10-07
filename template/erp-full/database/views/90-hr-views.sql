-- =============================================================================
-- Finsoft ERP (FULL) — views/90-hr-views.sql
-- HR report views (install order: … → fk/* → 90-views → 91-rls → 95-seed).
--
-- Views named by entities/12-hr.md (+ HumanResources.getBranchHeadcount from
-- entities/02-auth-workspace-settings.md, Branches screen):
--   HumanResources.getHeadcount                    Employees KPIs, HR Reports (Headcount)
--   HumanResources.getBranchHeadcount             Settings › Branches (employee count per branch)
--   HumanResources.getHrDashboard                 Employees, Leave overview
--   HumanResources.getDepartmentSummary           Departments & Designations
--   HumanResources.getDesignationPositions        Departments & Designations, Org Chart
--   HumanResources.getOrganisationChart                    Org Chart (recursive CTE)
--   HumanResources.getAttendanceToday             Attendance (today)
--   HumanResources.getAttendanceRegister  Attendance Register, Employee Profile, Payroll
--   HumanResources.getAttendanceSummary           HR Reports (Attendance summary)
--   HumanResources.getLateArrivals                HR Reports (Late arrivals), Attendance
--   HumanResources.getMonthlyOvertime             Overtime
--   HumanResources.getLeaveCalendar               Leave overview (calendar chips)
--   HumanResources.getCurrentLeaveBalances        Leave Balances, Employee Profile, ESS, HR Reports
--   HumanResources.getOnboardingProgress          Onboarding
--   HumanResources.getMonthlyTurnover             Offboarding, HR Reports (Turnover)
--   HumanResources.getMonthlyDepartmentCost              HR Reports (Department cost) — reads payroll lines
--   HumanResources.getRecruitmentFunnel           Recruitment
--   HumanResources.getPerformanceCycleSummary    Performance
--   HumanResources.getTrainingSummary             Training & Certifications
--
-- Rules
--   * Every view is WITH (security_invoker = true): RLS on the base tables
--     (tenantId = Company.getCurrentTenantId(), 91-rls.sql) applies to the caller.
--   * Every join between tenant tables also matches tenantId (composite keys).
--   * "Active employee" = deletedAt IS NULL AND status <> 'EXITED'
--     (ACTIVE, PROBATION, ON_LEAVE, NOTICE_PERIOD).
--   * The fiscal / leave year starts on Platform.Tenants.fiscalYearStartMonth
--     (HumanResources.getLeaveYearStart(), default July).
--   * Payroll figures come from payroll runs in status POSTED or PAID only, and
--     exclude lines on hold (as Payroll.refreshPayrollRunTotals does).
--   * Self-contained: no view here reads a view from another 90-*.sql file.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- v_headcount — active employees per division × department × branch.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getHeadcount"
WITH (security_invoker = true) AS
SELECT e."tenantId",
       d.division,
       d.id                                                          AS "departmentId",
       d.name                                                        AS department,
       b.id                                                          AS "branchId",
       b.name                                                        AS branch,
       count(*)::integer                                             AS headcount,
       (count(*) FILTER (WHERE e.gender = 'FEMALE'))::integer        AS female,
       round(100.0 * count(*) FILTER (WHERE e.gender = 'FEMALE') / NULLIF(count(*), 0), 1) AS "femalePct",
       current_date                                                  AS "asOf"
  FROM "HumanResources"."Employees" e
  JOIN "HumanResources"."Departments" d ON d."tenantId" = e."tenantId" AND d.id = e."departmentId"
  JOIN "Company"."Branches"   b ON b."tenantId" = e."tenantId" AND b.id = e."branchId"
 WHERE e."deletedAt" IS NULL
   AND e.status <> 'EXITED'
 GROUP BY e."tenantId", d.id, b.id;

COMMENT ON VIEW "HumanResources"."getHeadcount" IS
  'Active headcount and female share per division × department × branch. Screens: app/hr/employees (KPIs), app/hr/reports (Headcount).';


-- ---------------------------------------------------------------------------
-- v_branch_headcount — active employees per branch (all branches listed).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getBranchHeadcount"
WITH (security_invoker = true) AS
SELECT b."tenantId",
       b.id                                                          AS "branchId",
       b.code                                                        AS "branchCode",
       b.name                                                        AS branch,
       count(e.id)::integer                                          AS "employeeCount"
  FROM "Company"."Branches" b
  LEFT JOIN "HumanResources"."Employees" e
         ON e."tenantId" = b."tenantId" AND e."branchId" = b.id
        AND e."deletedAt" IS NULL AND e.status <> 'EXITED'
 WHERE b."deletedAt" IS NULL
 GROUP BY b."tenantId", b.id;

COMMENT ON VIEW "HumanResources"."getBranchHeadcount" IS
  'Count of active HumanResources.Employees per branch. Screen: app/settings/branches ("Employees" column).';


-- ---------------------------------------------------------------------------
-- v_hr_dashboard — one row per tenant.
--   headcount            active employees today
--   net_change_qtr       joiners − exits in the current calendar quarter
--   attrition_ttm_pct    exits in the last 12 months ÷ average of headcount
--                        12 months ago and today × 100
--   on_leave_today       employees with an APPROVED leave covering today
--   pending_*            PENDING leave / regularisation / overtime requests
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getHrDashboard"
WITH (security_invoker = true) AS
WITH t AS (
  SELECT DISTINCT e."tenantId" FROM "HumanResources"."Employees" e
),
k AS (
  SELECT t."tenantId",
         (SELECT count(*) FROM "HumanResources"."Employees" e
           WHERE e."tenantId" = t."tenantId" AND e."deletedAt" IS NULL AND e.status <> 'EXITED')            AS headcount,
         (SELECT count(*) FROM "HumanResources"."Employees" e
           WHERE e."tenantId" = t."tenantId" AND e."deletedAt" IS NULL
             AND e."joiningDate" <= (current_date - interval '12 months')::date
             AND (e."exitDate" IS NULL OR e."exitDate" > (current_date - interval '12 months')::date))     AS "headcount12mAgo",
         (SELECT count(*) FROM "HumanResources"."Employees" e
           WHERE e."tenantId" = t."tenantId" AND e."deletedAt" IS NULL
             AND e."joiningDate" >= date_trunc('quarter', current_date)::date
             AND e."joiningDate" <= current_date)                                                         AS "joinersQtr",
         (SELECT count(*) FROM "HumanResources"."Employees" e
           WHERE e."tenantId" = t."tenantId" AND e."deletedAt" IS NULL
             AND e."exitDate" >= date_trunc('quarter', current_date)::date
             AND e."exitDate" <= current_date)                                                            AS "exitsQtr",
         (SELECT count(*) FROM "HumanResources"."Employees" e
           WHERE e."tenantId" = t."tenantId" AND e."deletedAt" IS NULL
             AND e."joiningDate" >= date_trunc('month', current_date)::date
             AND e."joiningDate" <  (date_trunc('month', current_date) + interval '1 month')::date)        AS "joinersMonth",
         (SELECT count(*) FROM "HumanResources"."Employees" e
           WHERE e."tenantId" = t."tenantId" AND e."deletedAt" IS NULL
             AND e."exitDate" >= date_trunc('month', current_date)::date
             AND e."exitDate" <  (date_trunc('month', current_date) + interval '1 month')::date)           AS "exitsMonth",
         (SELECT count(*) FROM "HumanResources"."Employees" e
           WHERE e."tenantId" = t."tenantId" AND e."deletedAt" IS NULL
             AND e."exitDate" >  (current_date - interval '12 months')::date
             AND e."exitDate" <= current_date)                                                            AS "exitsTtm",
         (SELECT count(DISTINCT lr."employeeId") FROM "HumanResources"."LeaveRequests" lr
           WHERE lr."tenantId" = t."tenantId" AND lr.status = 'APPROVED'
             AND current_date BETWEEN lr."fromDate" AND lr."toDate")                                       AS "onLeaveToday",
         (SELECT count(*) FROM "HumanResources"."LeaveRequests" lr
           WHERE lr."tenantId" = t."tenantId" AND lr.status = 'PENDING')                                   AS "pendingLeave",
         (SELECT count(*) FROM "HumanResources"."RegularisationRequests" ar
           WHERE ar."tenantId" = t."tenantId" AND ar.status = 'PENDING')                                   AS "pendingRegularisation",
         (SELECT count(*) FROM "HumanResources"."OvertimeClaims" ot
           WHERE ot."tenantId" = t."tenantId" AND ot.status = 'PENDING')                                   AS "pendingOt"
    FROM t
)
SELECT k."tenantId",
       k.headcount::integer                                          AS headcount,
       (k."joinersQtr" - k."exitsQtr")::integer                        AS "netChangeQtr",
       k."joinersMonth"::integer                                      AS "joinersMonth",
       k."exitsMonth"::integer                                        AS "exitsMonth",
       round(100.0 * k."exitsTtm" / NULLIF((k.headcount + k."headcount12mAgo") / 2.0, 0), 1) AS "attritionTtmPct",
       k."onLeaveToday"::integer                                     AS "onLeaveToday",
       k."pendingLeave"::integer                                      AS "pendingLeave",
       k."pendingRegularisation"::integer                             AS "pendingRegularisation",
       k."pendingOt"::integer                                         AS "pendingOt"
  FROM k;

COMMENT ON VIEW "HumanResources"."getHrDashboard" IS
  'HR KPI row per tenant: headcount, quarter net change, month joiners/exits, TTM attrition, on leave today, pending leave / regularisation / OT. Screens: app/hr/employees, app/hr/leave (overview).';


-- ---------------------------------------------------------------------------
-- v_department_summary — department card: head, headcount, budget and
-- fiscal-year-to-date payroll cost (gross + employer EOBI/PESSI/PF +
-- gratuity provision) from posted payroll lines.
--   utilisation_pct = ytd_payroll ÷ annualBudget × 100
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getDepartmentSummary"
WITH (security_invoker = true) AS
SELECT d."tenantId",
       d.id                                                          AS "departmentId",
       d.code,
       d.name,
       d.description,
       d."parentId",
       d.division,
       d."headEmployeeId",
       h."displayName"                                                AS "headName",
       COALESCE(hc.headcount, 0)                                     AS headcount,
       d."costCentreId",
       d."annualBudget",
       COALESCE(py."ytdPayroll", 0)::numeric(18,2)                    AS "ytdPayroll",
       round(100.0 * COALESCE(py."ytdPayroll", 0) / NULLIF(d."annualBudget", 0), 1) AS "utilisationPct",
       d."isActive"
  FROM "HumanResources"."Departments" d
  LEFT JOIN "HumanResources"."Employees" h
         ON h."tenantId" = d."tenantId" AND h.id = d."headEmployeeId"
  LEFT JOIN LATERAL (
         SELECT count(*)::integer AS headcount
           FROM "HumanResources"."Employees" e
          WHERE e."tenantId" = d."tenantId" AND e."departmentId" = d.id
            AND e."deletedAt" IS NULL AND e.status <> 'EXITED') hc ON true
  LEFT JOIN LATERAL (
         SELECT sum(l."grossAmount" + l."employerEobiAmount" + l."employerPessiAmount"
                    + l."employerPfAmount" + l."gratuityProvisionAmount") AS "ytdPayroll"
           FROM "Payroll"."PayrollRunLines" l
           JOIN "Payroll"."PayrollRuns" r ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
          WHERE l."tenantId" = d."tenantId" AND l."departmentId" = d.id
            AND NOT l."isOnHold"
            AND r.status IN ('POSTED','PAID')
            AND r."payrollMonth" >= "HumanResources"."getLeaveYearStart"(d."tenantId", current_date)
            AND r."payrollMonth" <= current_date) py ON true
 WHERE d."deletedAt" IS NULL;

COMMENT ON VIEW "HumanResources"."getDepartmentSummary" IS
  'Department card: head, active headcount, cost centre, annual budget, FY-to-date payroll cost (gross + employer contributions) and budget utilisation %. Screen: app/hr/departments.';


-- ---------------------------------------------------------------------------
-- v_designation_positions — approved vs filled positions per designation.
--   open = max(approvedPositions − filled, 0)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getDesignationPositions"
WITH (security_invoker = true) AS
SELECT g."tenantId",
       g.id                                                          AS "designationId",
       g.title,
       g."departmentId",
       g."gradeId",
       g."reportsToDesignationId",
       g."approvedPositions",
       COALESCE(f.filled, 0)                                         AS filled,
       GREATEST(g."approvedPositions" - COALESCE(f.filled, 0), 0)     AS open,
       COALESCE(rq."openRequisitions", 0)                             AS "openRequisitions",
       g."isActive"
  FROM "HumanResources"."Designations" g
  LEFT JOIN LATERAL (
         SELECT count(*)::integer AS filled
           FROM "HumanResources"."Employees" e
          WHERE e."tenantId" = g."tenantId" AND e."designationId" = g.id
            AND e."deletedAt" IS NULL AND e.status <> 'EXITED') f ON true
  LEFT JOIN LATERAL (
         SELECT count(*)::integer AS "openRequisitions"
           FROM "HumanResources"."JobOpenings" jr
          WHERE jr."tenantId" = g."tenantId" AND jr."designationId" = g.id
            AND jr.status IN ('PENDING_APPROVAL','OPEN','ON_HOLD','OFFER_STAGE')) rq ON true
 WHERE g."deletedAt" IS NULL;

COMMENT ON VIEW "HumanResources"."getDesignationPositions" IS
  'Approved positions, filled (active employees), open and open requisitions per designation. Screens: app/hr/departments, app/hr/org (vacant "Hiring" nodes).';


-- ---------------------------------------------------------------------------
-- v_org_chart — reporting tree of active employees (recursive CTE).
--   Roots: no manager, or a manager who is no longer active.
--   path: employee ids from the root down to the node (cycle-guarded).
--   subtree_size: all reports below the node (direct + indirect).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getOrganisationChart"
WITH (security_invoker = true) AS
WITH RECURSIVE emp AS (
  SELECT e."tenantId", e.id, e."reportingManagerId", e."departmentId", e."designationId", e."branchId",
         e."displayName", e.code
    FROM "HumanResources"."Employees" e
   WHERE e."deletedAt" IS NULL AND e.status <> 'EXITED'
),
tree AS (
  SELECT r."tenantId",
         r.id                                     AS "employeeId",
         CASE WHEN EXISTS (SELECT 1 FROM emp m
                            WHERE m."tenantId" = r."tenantId" AND m.id = r."reportingManagerId")
              THEN r."reportingManagerId" END     AS "managerId",
         0                                        AS depth,
         ARRAY[r.id]                              AS path
    FROM emp r
   WHERE r."reportingManagerId" IS NULL
      OR NOT EXISTS (SELECT 1 FROM emp m
                      WHERE m."tenantId" = r."tenantId" AND m.id = r."reportingManagerId")
  UNION ALL
  SELECT c."tenantId",
         c.id,
         c."reportingManagerId",
         t.depth + 1,
         t.path || c.id
    FROM emp c
    JOIN tree t ON t."tenantId" = c."tenantId" AND c."reportingManagerId" = t."employeeId"
   WHERE c.id <> ALL (t.path)
)
SELECT t."tenantId",
       t."employeeId",
       t."managerId",
       t.depth,
       t.path,
       ((SELECT count(*) FROM tree d
          WHERE d."tenantId" = t."tenantId" AND t."employeeId" = ANY (d.path)) - 1)::integer AS "subtreeSize",
       (SELECT count(*) FROM tree d
         WHERE d."tenantId" = t."tenantId" AND d."managerId" = t."employeeId")::integer       AS "directReports",
       e.code                                                        AS "employeeCode",
       e."displayName",
       e."departmentId",
       dp.name                                                       AS department,
       g.title                                                       AS designation,
       e."branchId"
  FROM tree t
  JOIN emp e              ON e."tenantId" = t."tenantId" AND e.id = t."employeeId"
  JOIN "HumanResources"."Departments" dp   ON dp."tenantId" = e."tenantId" AND dp.id = e."departmentId"
  JOIN "HumanResources"."Designations" g   ON g."tenantId" = e."tenantId" AND g.id = e."designationId";

COMMENT ON VIEW "HumanResources"."getOrganisationChart" IS
  'Reporting tree of active employees from HumanResources.Employees.reportingManagerId (recursive CTE): depth, root path, subtree size, direct reports. Max depth / avg span are aggregates of this view. Screen: app/hr/org.';


-- ---------------------------------------------------------------------------
-- v_attendance_today — today's attendance counts per branch × department.
-- Per active employee: today's HumanResources.AttendanceRegister row if processed, otherwise
-- the raw punches and approved leave.
--   present     PRESENT / LATE / WFH / ON_DUTY / HALF_DAY, or punched in
--               but not yet processed (Late and WFH are included in Present)
--   on_leave    LEAVE, or an APPROVED leave request covering today
--   off_day     HOLIDAY / WEEKLY_OFF
--   not_yet_in  no day row, no punch today, not on leave
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getAttendanceToday"
WITH (security_invoker = true) AS
WITH s AS (
  SELECT e."tenantId", e."branchId", e."departmentId", e.id AS "employeeId",
         ad.status,
         EXISTS (SELECT 1 FROM "HumanResources"."LeaveRequests" lr
                  WHERE lr."tenantId" = e."tenantId" AND lr."employeeId" = e.id
                    AND lr.status = 'APPROVED'
                    AND current_date BETWEEN lr."fromDate" AND lr."toDate")            AS "onApprovedLeave",
         EXISTS (SELECT 1 FROM "HumanResources"."AttendancePunches" p
                  WHERE p."tenantId" = e."tenantId" AND p."employeeId" = e.id
                    AND NOT p."isVoid"
                    AND p."punchAt" >= current_date::timestamptz
                    AND p."punchAt" <  (current_date + 1)::timestamptz)               AS "hasPunch"
    FROM "HumanResources"."Employees" e
    LEFT JOIN "HumanResources"."AttendanceRegister" ad
           ON ad."tenantId" = e."tenantId" AND ad."employeeId" = e.id AND ad."attDate" = current_date
   WHERE e."deletedAt" IS NULL AND e.status <> 'EXITED'
)
SELECT s."tenantId",
       current_date                                                  AS "attDate",
       s."branchId",
       s."departmentId",
       (count(*) FILTER (WHERE s.status IN ('PRESENT','LATE','WFH','ON_DUTY','HALF_DAY')
                            OR (s.status IS NULL AND s."hasPunch" AND NOT s."onApprovedLeave")))::integer AS present,
       (count(*) FILTER (WHERE s.status = 'LATE'))::integer          AS late,
       (count(*) FILTER (WHERE s.status = 'WFH'))::integer           AS wfh,
       (count(*) FILTER (WHERE s.status = 'LEAVE'
                            OR (s.status IS NULL AND s."onApprovedLeave")))::integer                   AS "onLeave",
       (count(*) FILTER (WHERE s.status = 'ABSENT'))::integer        AS absent,
       (count(*) FILTER (WHERE s.status IN ('HOLIDAY','WEEKLY_OFF')))::integer                         AS "offDay",
       (count(*) FILTER (WHERE s.status IS NULL AND NOT s."hasPunch" AND NOT s."onApprovedLeave"))::integer AS "notYetIn",
       count(*)::integer                                             AS total
  FROM s
 GROUP BY s."tenantId", s."branchId", s."departmentId";

COMMENT ON VIEW "HumanResources"."getAttendanceToday" IS
  'Today''s attendance per branch × department: present (incl. late & WFH), late, WFH, on leave, absent, off day, not yet in, total. Screen: app/hr/attendance (KPIs + by-department bars).';


-- ---------------------------------------------------------------------------
-- v_attendance_monthly_register — one row per employee × month with the
-- day-by-day register codes (P / A / L / LT / HD / H / W; NULL = no row) and
-- the column totals of the register.
--   codes[n]      register code of day n of the month
--   present       code P (PRESENT, WFH, ON_DUTY); late (LT) is counted apart
--   payable_days  Σ AttendanceRegister.payableFraction
--   isLocked     every day of the month consumed by payroll
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getAttendanceRegister"
WITH (security_invoker = true) AS
WITH m AS (
  SELECT ad."tenantId", ad."employeeId",
         date_trunc('month', ad."attDate")::date                              AS month,
         count(*) FILTER (WHERE ad."registerCode" = 'P')                      AS present,
         count(*) FILTER (WHERE ad."registerCode" = 'A')                      AS absent,
         count(*) FILTER (WHERE ad."registerCode" = 'L')                      AS leave,
         count(*) FILTER (WHERE ad."registerCode" = 'LT')                     AS late,
         count(*) FILTER (WHERE ad."registerCode" = 'HD')                     AS "halfDay",
         count(*) FILTER (WHERE ad."registerCode" = 'W')                      AS "weeklyOff",
         count(*) FILTER (WHERE ad."registerCode" = 'H')                      AS holiday,
         sum(ad."payableFraction")                                            AS "payableDays",
         count(*) FILTER (WHERE ad."isManual")                                AS "manualEntries",
         sum(ad."lateMinutes")                                                AS "lateMinutes",
         sum(ad."overtimeMinutes")                                            AS "overtimeMinutes",
         bool_and(ad."lockedAt" IS NOT NULL)                                  AS "isLocked",
         (array_agg(ad."payrollRunId" ORDER BY ad."attDate" DESC)
            FILTER (WHERE ad."payrollRunId" IS NOT NULL))[1]                 AS "payrollRunId"
    FROM "HumanResources"."AttendanceRegister" ad
   GROUP BY ad."tenantId", ad."employeeId", date_trunc('month', ad."attDate")
)
SELECT m."tenantId",
       m."employeeId",
       m.month,
       c.codes,
       m.present::integer                                            AS present,
       m.absent::integer                                             AS absent,
       m.leave::integer                                              AS leave,
       m.late::integer                                               AS late,
       m."halfDay"::integer                                           AS "halfDay",
       m."weeklyOff"::integer                                         AS "weeklyOff",
       m.holiday::integer                                            AS holiday,
       m."payableDays",
       m."isLocked",
       m."payrollRunId",
       m."manualEntries"::integer                                     AS "manualEntries",
       m."lateMinutes"::integer                                       AS "lateMinutes",
       m."overtimeMinutes"::integer                                   AS "overtimeMinutes",
       round(100.0 * (m.present + m.late + 0.5 * m."halfDay")
             / NULLIF(c."daysInMonth" - m."weeklyOff" - m.holiday, 0), 1) AS "attendancePct",
       e."departmentId",
       e."branchId"
  FROM m
  JOIN "HumanResources"."Employees" e ON e."tenantId" = m."tenantId" AND e.id = m."employeeId"
  CROSS JOIN LATERAL (
         SELECT array_agg(ad."registerCode" ORDER BY g.d)  AS codes,
                count(*)::integer                         AS "daysInMonth"
           FROM generate_series(m.month, (m.month + interval '1 month' - interval '1 day')::date,
                                interval '1 day') AS g(d)
           LEFT JOIN "HumanResources"."AttendanceRegister" ad
                  ON ad."tenantId" = m."tenantId" AND ad."employeeId" = m."employeeId"
                 AND ad."attDate" = g.d::date) c;

COMMENT ON VIEW "HumanResources"."getAttendanceRegister" IS
  'Monthly attendance register per employee: day codes array (P/A/L/LT/HD/H/W), P/A/L/LT/HD/W/H totals, payable days, manual entries, payroll lock and run. Screens: app/hr/attendance/register, app/hr/employees/view (attendance KPI), payroll run step 2.';


-- ---------------------------------------------------------------------------
-- v_attendance_summary — HR report row per employee × month.
--   present          all worked days (PRESENT, WFH, ON_DUTY, LATE, HALF_DAY)
--   late             LATE days (also included in present)
--   ot_hours         Σ AttendanceRegister.overtimeMinutes ÷ 60
--   attendance_pct   (worked days − ½ × half days) ÷ (days with a row
--                    − weekly offs − holidays) × 100
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getAttendanceSummary"
WITH (security_invoker = true) AS
WITH m AS (
  SELECT ad."tenantId", ad."employeeId",
         date_trunc('month', ad."attDate")::date                              AS month,
         count(*)                                                            AS days,
         count(*) FILTER (WHERE ad.status IN ('PRESENT','WFH','ON_DUTY','LATE','HALF_DAY')) AS present,
         count(*) FILTER (WHERE ad.status = 'HALF_DAY')                      AS "halfDay",
         count(*) FILTER (WHERE ad.status = 'ABSENT')                        AS absent,
         count(*) FILTER (WHERE ad.status = 'LEAVE')                         AS leave,
         count(*) FILTER (WHERE ad.status = 'LATE')                          AS late,
         count(*) FILTER (WHERE ad.status IN ('WEEKLY_OFF','HOLIDAY'))       AS "offDays",
         sum(ad."overtimeMinutes")                                            AS "overtimeMinutes"
    FROM "HumanResources"."AttendanceRegister" ad
   GROUP BY ad."tenantId", ad."employeeId", date_trunc('month', ad."attDate")
)
SELECT m."tenantId",
       m."employeeId",
       m.month,
       e.code                                                        AS "employeeCode",
       e."displayName"                                                AS "employeeName",
       e."departmentId",
       d.name                                                        AS department,
       e."branchId",
       b.name                                                        AS branch,
       m.present::integer                                            AS present,
       m.absent::integer                                             AS absent,
       m.leave::integer                                              AS leave,
       m.late::integer                                               AS late,
       round(m."overtimeMinutes" / 60.0, 2)                           AS "otHours",
       round(100.0 * (m.present - 0.5 * m."halfDay") / NULLIF(m.days - m."offDays", 0), 1) AS "attendancePct"
  FROM m
  JOIN "HumanResources"."Employees"   e ON e."tenantId" = m."tenantId" AND e.id = m."employeeId"
  JOIN "HumanResources"."Departments" d ON d."tenantId" = e."tenantId" AND d.id = e."departmentId"
  JOIN "Company"."Branches"   b ON b."tenantId" = e."tenantId" AND b.id = e."branchId";

COMMENT ON VIEW "HumanResources"."getAttendanceSummary" IS
  'Attendance summary per employee × month: present (incl. late), absent, leave, late, OT hours, attendance %. Screen: app/hr/reports (Attendance summary, month filter).';


-- ---------------------------------------------------------------------------
-- v_late_arrivals — late marks per employee × month (waived marks excluded).
--   half_day_deductions = floor(late_marks ÷ shift.lateMarksPerHalfDay)
--                         ("3 lates = ½ day"); shift = the employee's shift,
--                         else the tenant's default shift; NULL rule → 0
--   deductionAmount    = half_day_deductions × ½ × (gross ÷ 30), gross from
--                         the Payroll.EmployeeSalaries row effective that month
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getLateArrivals"
WITH (security_invoker = true) AS
WITH m AS (
  SELECT ad."tenantId", ad."employeeId",
         date_trunc('month', ad."attDate")::date                              AS month,
         count(*)                                                            AS "lateMarks",
         avg(ad."lateMinutes")                                                AS "avgLateMinutes",
         max(ad."attDate")                                                    AS "lastLateDate"
    FROM "HumanResources"."AttendanceRegister" ad
   WHERE ad."lateMinutes" > 0
     AND ad.status IN ('LATE','PRESENT','WFH','ON_DUTY','HALF_DAY')
     AND NOT ad."lateMarkWaived"
   GROUP BY ad."tenantId", ad."employeeId", date_trunc('month', ad."attDate")
)
SELECT m."tenantId",
       m."employeeId",
       m.month,
       e.code                                                        AS "employeeCode",
       e."displayName"                                                AS "employeeName",
       e."departmentId",
       e."branchId",
       m."lateMarks"::integer                                         AS "lateMarks",
       round(m."avgLateMinutes", 1)                                  AS "avgLateMinutes",
       sh."lateMarksPerHalfDay",
       COALESCE(floor(m."lateMarks" / sh."lateMarksPerHalfDay"::numeric), 0)::integer AS "halfDayDeductions",
       round(COALESCE(floor(m."lateMarks" / sh."lateMarksPerHalfDay"::numeric), 0)
             * 0.5 * es."grossAmount" / 30, 2)                        AS "deductionAmount",
       m."lastLateDate"
  FROM m
  JOIN "HumanResources"."Employees" e ON e."tenantId" = m."tenantId" AND e.id = m."employeeId"
  LEFT JOIN LATERAL (
         SELECT s."lateMarksPerHalfDay"
           FROM "HumanResources"."WorkShifts" s
          WHERE s."tenantId" = e."tenantId"
            AND (s.id = e."shiftId" OR (e."shiftId" IS NULL AND s."isDefault"))
            AND s."deletedAt" IS NULL
          ORDER BY (s.id = e."shiftId") DESC
          LIMIT 1) sh ON true
  LEFT JOIN LATERAL (
         SELECT x."grossAmount"
           FROM "Payroll"."EmployeeSalaries" x
          WHERE x."tenantId" = m."tenantId" AND x."employeeId" = m."employeeId"
            AND x."effectiveFrom" <= (m.month + interval '1 month' - interval '1 day')::date
            AND (x."effectiveTo" IS NULL OR x."effectiveTo" >= m.month)
          ORDER BY x."effectiveFrom" DESC
          LIMIT 1) es ON true;

COMMENT ON VIEW "HumanResources"."getLateArrivals" IS
  'Late arrivals per employee × month: late marks, avg late minutes, ½-day deductions ("3 lates = ½ day" from HumanResources.WorkShifts.lateMarksPerHalfDay), deduction amount (gross ÷ 30 basis), last late date. Screens: app/hr/reports (Late arrivals), app/hr/attendance.';


-- ---------------------------------------------------------------------------
-- v_overtime_monthly — overtime per employee × payroll month.
--   hours / amount     APPROVED + PUSHED entries (comp-off rows have amount 0)
--   pending_*          PENDING entries
--   over_cap           approved hours > monthlyCapHours of the overtime
--                      policy in force (latest active policy effective by the
--                      payroll month)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getMonthlyOvertime"
WITH (security_invoker = true) AS
WITH m AS (
  SELECT ot."tenantId", ot."payrollMonth", ot."employeeId",
         COALESCE(sum(ot.hours)  FILTER (WHERE ot.status IN ('APPROVED','PUSHED')), 0) AS hours,
         COALESCE(sum(ot.amount) FILTER (WHERE ot.status IN ('APPROVED','PUSHED')), 0) AS amount,
         COALESCE(sum(ot.hours)  FILTER (WHERE ot.status IN ('APPROVED','PUSHED') AND ot."isCompOff"), 0) AS "compOffHours",
         count(*) FILTER (WHERE ot.status = 'PENDING')                                  AS "pendingCount",
         COALESCE(sum(ot.hours)  FILTER (WHERE ot.status = 'PENDING'), 0)               AS "pendingHours",
         COALESCE(sum(ot.hours * ot."hourlyRate" * ot.multiplier)
                    FILTER (WHERE ot.status = 'PENDING' AND NOT ot."isCompOff"), 0)     AS "pendingAmount"
    FROM "HumanResources"."OvertimeClaims" ot
   WHERE ot.status <> 'CANCELLED'
   GROUP BY ot."tenantId", ot."payrollMonth", ot."employeeId"
)
SELECT m."tenantId",
       m."payrollMonth",
       e."departmentId",
       m."employeeId",
       e."displayName"                                                AS "employeeName",
       m.hours,
       m.amount::numeric(18,2)                                       AS amount,
       m."compOffHours",
       m."pendingCount"::integer                                      AS "pendingCount",
       m."pendingHours",
       round(m."pendingAmount", 2)                                    AS "pendingAmount",
       p."monthlyCapHours",
       (p."monthlyCapHours" IS NOT NULL AND m.hours > p."monthlyCapHours") AS "overCap"
  FROM m
  JOIN "HumanResources"."Employees" e ON e."tenantId" = m."tenantId" AND e.id = m."employeeId"
  LEFT JOIN LATERAL (
         SELECT op."monthlyCapHours"
           FROM "HumanResources"."OvertimePolicies" op
          WHERE op."tenantId" = m."tenantId" AND op."isActive" AND op."deletedAt" IS NULL
            AND op."effectiveFrom" <= (m."payrollMonth" + interval '1 month' - interval '1 day')::date
          ORDER BY op."effectiveFrom" DESC
          LIMIT 1) p ON true;

COMMENT ON VIEW "HumanResources"."getMonthlyOvertime" IS
  'Overtime per employee × payroll month: approved hours/amount, comp-off hours, pending count/hours/amount, monthly cap breach. Department totals = GROUP BY departmentId. Screen: app/hr/overtime (KPIs, OT hours by department).';


-- ---------------------------------------------------------------------------
-- v_leave_calendar — PENDING and APPROVED leave expanded to one row per
-- calendar day. day_fraction = 0.5 for HALF_AM / HALF_PM.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getLeaveCalendar"
WITH (security_invoker = true) AS
SELECT lr."tenantId",
       lr."employeeId",
       g.d::date                                                     AS "leaveDate",
       lr."leaveTypeId",
       lt.code                                                       AS "leaveTypeCode",
       lt.category                                                   AS "leaveCategory",
       lt.colour,
       lr.status,
       lr.duration,
       CASE WHEN lr.duration = 'FULL' THEN 1.0 ELSE 0.5 END          AS "dayFraction",
       lr.id                                                         AS "leaveRequestId",
       lr."docNo",
       e."displayName"                                                AS "employeeName",
       e."departmentId",
       e."branchId",
       e."reportingManagerId"
  FROM "HumanResources"."LeaveRequests" lr
  JOIN "HumanResources"."LeaveTypes" lt ON lt."tenantId" = lr."tenantId" AND lt.id = lr."leaveTypeId"
  JOIN "HumanResources"."Employees"   e  ON e."tenantId"  = lr."tenantId" AND e.id  = lr."employeeId"
  CROSS JOIN LATERAL generate_series(lr."fromDate", lr."toDate", interval '1 day') AS g(d)
 WHERE lr.status IN ('PENDING','APPROVED');

COMMENT ON VIEW "HumanResources"."getLeaveCalendar" IS
  'Leave by date: PENDING + APPROVED HumanResources.LeaveRequests expanded per day (type, status, half-day fraction). Screen: app/hr/leave (calendar chips "Zainab R." / "(pending)").';


-- ---------------------------------------------------------------------------
-- v_leave_balance_current — LeaveBalances rows of the current leave year.
--   encash_value = encashable days × (basic or gross) ÷ 30 per
--                  LeaveTypes.encashBasis, from the current
--                  Payroll.EmployeeSalaries row; 0 when encashment is not allowed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getCurrentLeaveBalances"
WITH (security_invoker = true) AS
SELECT lb."tenantId",
       lb."employeeId",
       lb."leaveTypeId",
       lt.code,
       lt.name                                                       AS "leaveType",
       lt.category,
       lt."isPaid",
       lb."leaveYearStart",
       lb.entitled,
       lb."carriedIn",
       lb.adjusted,
       lb.used,
       lb.booked,
       lb.encashed,
       lb.lapsed,
       lb.balance,
       lb.available,
       lb.encashable,
       lb."carriedExpiresOn",
       CASE WHEN lt."encashmentMode" = 'NOT_ALLOWED' THEN 0
            ELSE round(lb.encashable *
                       CASE lt."encashBasis" WHEN 'GROSS_DIV_30' THEN es."grossAmount"
                                            ELSE es."basicAmount" END / 30, 2)
       END                                                           AS "encashValue"
  FROM "HumanResources"."LeaveBalances" lb
  JOIN "HumanResources"."LeaveTypes" lt ON lt."tenantId" = lb."tenantId" AND lt.id = lb."leaveTypeId"
  LEFT JOIN LATERAL (
         SELECT x."basicAmount", x."grossAmount"
           FROM "Payroll"."EmployeeSalaries" x
          WHERE x."tenantId" = lb."tenantId" AND x."employeeId" = lb."employeeId"
            AND x."effectiveFrom" <= current_date
            AND (x."effectiveTo" IS NULL OR x."effectiveTo" >= current_date)
          ORDER BY x."effectiveFrom" DESC
          LIMIT 1) es ON true
 WHERE lb."leaveYearStart" = "HumanResources"."getLeaveYearStart"(lb."tenantId", current_date);

COMMENT ON VIEW "HumanResources"."getCurrentLeaveBalances" IS
  'Current leave-year balances per employee × leave type (entitled, carried, adjusted, used, booked, balance, available, encashable, encash value = basic|gross ÷ 30 × days). Screens: app/hr/leave/balances, app/hr/employees/view, ess/leave, app/hr/reports (Leave balances).';


-- ---------------------------------------------------------------------------
-- v_onboarding_progress — task progress per onboarding case.
--   tasks_total excludes SKIPPED tasks; tasks_overdue = due before today and
--   not COMPLETED / SKIPPED; week_no = week since joining (1 = joining week,
--   ≤ 0 = pre-joining).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getOnboardingProgress"
WITH (security_invoker = true) AS
SELECT o."tenantId",
       o.id                                                          AS "onboardingId",
       o."docNo",
       o."employeeId",
       e."displayName"                                                AS "employeeName",
       o."designationId",
       o.track,
       o.status,
       o."joiningDate",
       o."targetDate",
       e."confirmationDueOn",
       COALESCE(t."tasksTotal", 0)                                    AS "tasksTotal",
       COALESCE(t."tasksDone", 0)                                     AS "tasksDone",
       COALESCE(t."tasksOverdue", 0)                                  AS "tasksOverdue",
       round(100.0 * COALESCE(t."tasksDone", 0) / NULLIF(t."tasksTotal", 0), 1) AS "progressPct",
       (floor((current_date - o."joiningDate") / 7.0) + 1)::integer   AS "weekNo"
  FROM "HumanResources"."Onboardings" o
  JOIN "HumanResources"."Employees" e ON e."tenantId" = o."tenantId" AND e.id = o."employeeId"
  LEFT JOIN LATERAL (
         SELECT (count(*) FILTER (WHERE ot.status <> 'SKIPPED'))::integer  AS "tasksTotal",
                (count(*) FILTER (WHERE ot.status = 'COMPLETED'))::integer  AS "tasksDone",
                (count(*) FILTER (WHERE ot."dueOn" < current_date
                                    AND ot.status NOT IN ('COMPLETED','SKIPPED')))::integer AS "tasksOverdue"
           FROM "HumanResources"."OnboardingTasks" ot
          WHERE ot."tenantId" = o."tenantId" AND ot."onboardingId" = o.id) t ON true;

COMMENT ON VIEW "HumanResources"."getOnboardingProgress" IS
  'Onboarding progress per case: tasks total/done/overdue, progress %, week since joining, probation due (employee.confirmationDueOn). Screen: app/hr/onboarding.';


-- ---------------------------------------------------------------------------
-- v_turnover_monthly — monthly headcount movement, last 24 months.
--   opening   joined before the month and not exited before it
--   joiners   joiningDate in the month;  exits  exitDate in the month
--   closing   opening + joiners − exits
--   attrition_pct    exits ÷ ((opening + closing) ÷ 2) × 100 (monthly)
--   voluntary_exits  exits whose offboarding case isVoluntary
--                    (or exitType RESIGNATION when no case exists)
--   quarter_label    fiscal quarter, e.g. "Q2 FY 2026-27"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getMonthlyTurnover"
WITH (security_invoker = true) AS
WITH t AS (
  SELECT DISTINCT e."tenantId" FROM "HumanResources"."Employees" e
),
months AS (
  SELECT t."tenantId",
         g.m::date                                                   AS month,
         COALESCE(pt."fiscalYearStartMonth", 7)                     AS "fyStartMonth"
    FROM t
    LEFT JOIN "Platform"."Tenants" pt ON pt.id = t."tenantId"
   CROSS JOIN LATERAL generate_series(date_trunc('month', current_date) - interval '23 months',
                                      date_trunc('month', current_date), interval '1 month') AS g(m)
),
k AS (
  SELECT mo."tenantId", mo.month, mo."fyStartMonth",
         (SELECT count(*) FROM "HumanResources"."Employees" e
           WHERE e."tenantId" = mo."tenantId" AND e."deletedAt" IS NULL
             AND e."joiningDate" < mo.month
             AND (e."exitDate" IS NULL OR e."exitDate" >= mo.month))                       AS opening,
         (SELECT count(*) FROM "HumanResources"."Employees" e
           WHERE e."tenantId" = mo."tenantId" AND e."deletedAt" IS NULL
             AND e."joiningDate" >= mo.month
             AND e."joiningDate" <  (mo.month + interval '1 month')::date)                AS joiners,
         (SELECT count(*) FROM "HumanResources"."Employees" e
           WHERE e."tenantId" = mo."tenantId" AND e."deletedAt" IS NULL
             AND e."exitDate" >= mo.month
             AND e."exitDate" <  (mo.month + interval '1 month')::date)                   AS exits,
         (SELECT count(*) FROM "HumanResources"."Employees" e
           WHERE e."tenantId" = mo."tenantId" AND e."deletedAt" IS NULL
             AND e."exitDate" >= mo.month
             AND e."exitDate" <  (mo.month + interval '1 month')::date
             AND COALESCE((SELECT o."isVoluntary" FROM "HumanResources"."Offboardings" o
                            WHERE o."tenantId" = e."tenantId" AND o."employeeId" = e.id
                              AND o.status <> 'WITHDRAWN'
                            ORDER BY o."lastWorkingDay" DESC LIMIT 1),
                          e."exitType" = 'RESIGNATION'))                                  AS "voluntaryExits"
    FROM months mo
)
SELECT k."tenantId",
       k.month,
       'Q' || (((extract(month FROM k.month)::int - k."fyStartMonth" + 12) % 12) / 3 + 1)
           || ' ' || "Company"."getFiscalYearLabel"(k.month, k."fyStartMonth")        AS "quarterLabel",
       k.opening::integer                                            AS opening,
       k.joiners::integer                                            AS joiners,
       k.exits::integer                                              AS exits,
       (k.opening + k.joiners - k.exits)::integer                    AS closing,
       round(100.0 * k.exits / NULLIF((k.opening + (k.opening + k.joiners - k.exits)) / 2.0, 0), 2) AS "attritionPct",
       k."voluntaryExits"::integer                                    AS "voluntaryExits"
  FROM k;

COMMENT ON VIEW "HumanResources"."getMonthlyTurnover" IS
  'Monthly turnover (last 24 months): opening, joiners, exits, closing, attrition %, voluntary exits, fiscal quarter label. Screens: app/hr/offboarding (KPIs), app/hr/reports (Turnover).';


-- ---------------------------------------------------------------------------
-- v_department_cost — payroll cost per department × payroll month from
-- posted payroll lines (department snapshot on PayrollRunLines).
--   eobi_pessi   employer EOBI + employer PESSI
--   total_ctc    gross + employer EOBI + PESSI + PF + gratuity provision
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getMonthlyDepartmentCost"
WITH (security_invoker = true) AS
SELECT l."tenantId",
       r."payrollMonth"                                               AS month,
       d.division,
       l."departmentId",
       d.name                                                        AS department,
       count(DISTINCT l."employeeId")::integer                        AS headcount,
       sum(l."grossAmount")                                           AS gross,
       sum(l."employerEobiAmount" + l."employerPessiAmount")         AS "eobiPessi",
       sum(l."employerPfAmount")                                     AS "pfEmployer",
       sum(l."gratuityProvisionAmount")                              AS "gratuityProvision",
       sum(l."grossAmount" + l."employerEobiAmount" + l."employerPessiAmount"
           + l."employerPfAmount" + l."gratuityProvisionAmount")     AS "totalCtc",
       round(sum(l."grossAmount" + l."employerEobiAmount" + l."employerPessiAmount"
                 + l."employerPfAmount" + l."gratuityProvisionAmount")
             / NULLIF(count(DISTINCT l."employeeId"), 0), 2)          AS "perEmployee"
  FROM "Payroll"."PayrollRunLines" l
  JOIN "Payroll"."PayrollRuns" r ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
  LEFT JOIN "HumanResources"."Departments" d  ON d."tenantId" = l."tenantId" AND d.id = l."departmentId"
 WHERE r.status IN ('POSTED','PAID')
   AND NOT l."isOnHold"
 GROUP BY l."tenantId", r."payrollMonth", d.division, l."departmentId", d.name;

COMMENT ON VIEW "HumanResources"."getMonthlyDepartmentCost" IS
  'Department cost per payroll month (posted runs): headcount, gross, employer EOBI + PESSI, employer PF, gratuity provision, total CTC, CTC per employee. Screen: app/hr/reports (Department cost).';


-- ---------------------------------------------------------------------------
-- v_recruitment_funnel — candidates per requisition by CURRENT stage.
--   applicants       all candidates
--   days_open        (closedOn or today) − (postedOn or created date)
--   offers_made      candidates with an offerStatus
--   offers_accepted  offerStatus ACCEPTED
--   avg_days_to_hire appliedOn → first STAGE_CHANGE to HIRED
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getRecruitmentFunnel"
WITH (security_invoker = true) AS
SELECT jr."tenantId",
       jr.id                                                         AS "jobRequisitionId",
       jr."docNo",
       jr.title,
       jr."departmentId",
       jr."branchId",
       jr."designationId",
       jr.openings,
       jr.status,
       jr.priority,
       COALESCE(c.applicants, 0)                                     AS applicants,
       COALESCE(c.applied, 0)                                        AS applied,
       COALESCE(c.screening, 0)                                      AS screening,
       COALESCE(c.interview, 0)                                      AS interview,
       COALESCE(c.offer, 0)                                          AS offer,
       COALESCE(c.hired, 0)                                          AS hired,
       COALESCE(c.rejected, 0)                                       AS rejected,
       (COALESCE(jr."closedOn", current_date) - COALESCE(jr."postedOn", jr."createdAt"::date))::integer AS "daysOpen",
       COALESCE(c."offersMade", 0)                                    AS "offersMade",
       COALESCE(c."offersAccepted", 0)                                AS "offersAccepted",
       round(c."avgDaysToHire", 1)                                  AS "avgDaysToHire"
  FROM "HumanResources"."JobOpenings" jr
  LEFT JOIN LATERAL (
         SELECT count(*)::integer                                              AS applicants,
                (count(*) FILTER (WHERE cd.stage = 'APPLIED'))::integer        AS applied,
                (count(*) FILTER (WHERE cd.stage = 'SCREENING'))::integer      AS screening,
                (count(*) FILTER (WHERE cd.stage = 'INTERVIEW'))::integer      AS interview,
                (count(*) FILTER (WHERE cd.stage = 'OFFER'))::integer          AS offer,
                (count(*) FILTER (WHERE cd.stage = 'HIRED'))::integer          AS hired,
                (count(*) FILTER (WHERE cd.stage = 'REJECTED'))::integer       AS rejected,
                (count(*) FILTER (WHERE cd."offerStatus" IS NOT NULL))::integer AS "offersMade",
                (count(*) FILTER (WHERE cd."offerStatus" = 'ACCEPTED'))::integer AS "offersAccepted",
                avg((SELECT min(ca."occurredAt")::date FROM "HumanResources"."CandidateActivities" ca
                      WHERE ca."tenantId" = cd."tenantId" AND ca."candidateId" = cd.id
                        AND ca."toStage" = 'HIRED') - cd."appliedOn")              AS "avgDaysToHire"
           FROM "HumanResources"."Candidates" cd
          WHERE cd."tenantId" = jr."tenantId" AND cd."jobRequisitionId" = jr.id) c ON true;

COMMENT ON VIEW "HumanResources"."getRecruitmentFunnel" IS
  'Recruitment funnel per requisition: applicants by current stage, days open, offers made/accepted, avg days to hire. Screen: app/hr/recruitment (KPIs: open positions, active applicants, time to hire, offer acceptance).';


-- ---------------------------------------------------------------------------
-- v_performance_cycle_summary — one row per appraisal cycle.
--   eligible           review rows in the cycle
--   avg_rating         avg(finalRating, else managerRating)
--   goals_on_track     goals ON_TRACK or ACHIEVED
--   nb_*               9-box counts (PerformanceReviews.nineBox)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getPerformanceCycleSummary"
WITH (security_invoker = true) AS
SELECT pc."tenantId",
       pc.id                                                         AS "cycleId",
       pc.name,
       pc."cycleType",
       pc.stage,
       pc.status,
       pc."periodStart",
       pc."periodEnd",
       pc."selfReviewDue",
       pc."managerReviewDue",
       COALESCE(rv.eligible, 0)                                      AS eligible,
       COALESCE(rv."selfSubmitted", 0)                                AS "selfSubmitted",
       COALESCE(rv."managerSubmitted", 0)                             AS "managerSubmitted",
       rv."avgRating",
       COALESCE(gl."goalsTotal", 0)                                   AS "goalsTotal",
       COALESCE(gl."goalsOnTrack", 0)                                AS "goalsOnTrack",
       COALESCE(rv."nbFutureLeader", 0)                              AS "nbFutureLeader",
       COALESCE(rv."nbGrowthEmployee", 0)                            AS "nbGrowthEmployee",
       COALESCE(rv."nbEnigma", 0)                                     AS "nbEnigma",
       COALESCE(rv."nbHighPerformer", 0)                             AS "nbHighPerformer",
       COALESCE(rv."nbCorePlayer", 0)                                AS "nbCorePlayer",
       COALESCE(rv."nbInconsistentPlayer", 0)                        AS "nbInconsistentPlayer",
       COALESCE(rv."nbTrustedProfessional", 0)                       AS "nbTrustedProfessional",
       COALESCE(rv."nbEffectiveEmployee", 0)                         AS "nbEffectiveEmployee",
       COALESCE(rv."nbRisk", 0)                                       AS "nbRisk",
       COALESCE(rv."pipSuggested", 0)                                 AS "pipSuggested"
  FROM "HumanResources"."PerformanceCycles" pc
  LEFT JOIN LATERAL (
         SELECT count(*)::integer                                                        AS eligible,
                (count(*) FILTER (WHERE r."selfSubmittedAt" IS NOT NULL))::integer       AS "selfSubmitted",
                (count(*) FILTER (WHERE r."managerSubmittedAt" IS NOT NULL))::integer    AS "managerSubmitted",
                round(avg(COALESCE(r."finalRating", r."managerRating")), 2)                AS "avgRating",
                (count(*) FILTER (WHERE r."nineBox" = 'FUTURE_LEADER'))::integer          AS "nbFutureLeader",
                (count(*) FILTER (WHERE r."nineBox" = 'GROWTH_EMPLOYEE'))::integer        AS "nbGrowthEmployee",
                (count(*) FILTER (WHERE r."nineBox" = 'ENIGMA'))::integer                 AS "nbEnigma",
                (count(*) FILTER (WHERE r."nineBox" = 'HIGH_PERFORMER'))::integer         AS "nbHighPerformer",
                (count(*) FILTER (WHERE r."nineBox" = 'CORE_PLAYER'))::integer            AS "nbCorePlayer",
                (count(*) FILTER (WHERE r."nineBox" = 'INCONSISTENT_PLAYER'))::integer    AS "nbInconsistentPlayer",
                (count(*) FILTER (WHERE r."nineBox" = 'TRUSTED_PROFESSIONAL'))::integer   AS "nbTrustedProfessional",
                (count(*) FILTER (WHERE r."nineBox" = 'EFFECTIVE_EMPLOYEE'))::integer     AS "nbEffectiveEmployee",
                (count(*) FILTER (WHERE r."nineBox" = 'RISK'))::integer                   AS "nbRisk",
                (count(*) FILTER (WHERE r."pipSuggested"))::integer                       AS "pipSuggested"
           FROM "HumanResources"."PerformanceReviews" r
          WHERE r."tenantId" = pc."tenantId" AND r."cycleId" = pc.id) rv ON true
  LEFT JOIN LATERAL (
         SELECT (count(*) FILTER (WHERE g.status <> 'DROPPED'))::integer                 AS "goalsTotal",
                (count(*) FILTER (WHERE g.status IN ('ON_TRACK','ACHIEVED')))::integer   AS "goalsOnTrack"
           FROM "HumanResources"."Goals" g
          WHERE g."tenantId" = pc."tenantId" AND g."cycleId" = pc.id) gl ON true;

COMMENT ON VIEW "HumanResources"."getPerformanceCycleSummary" IS
  'Appraisal cycle summary: eligible, self / manager reviews submitted, avg rating, goals total / on track, 9-box counts, PIP suggestions. Screen: app/hr/performance (KPIs).';


-- ---------------------------------------------------------------------------
-- v_training_summary — current fiscal year, one row per tenant.
--   training_hours      Σ TrainingEnrolments.hoursCompleted (enrolled in FY)
--   budget              Σ TrainingPrograms.budget (programs starting in FY,
--                       or undated programs not cancelled)
--   cost_utilised       Σ TrainingEnrolments.cost (enrolled in FY)
--   active_enrolments   ENROLLED / IN_PROGRESS / BEHIND
--   certs_expiring_60d  ACTIVE certifications expiring within 60 days
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "HumanResources"."getTrainingSummary"
WITH (security_invoker = true) AS
WITH t AS (
  SELECT tid."tenantId",
         "HumanResources"."getLeaveYearStart"(tid."tenantId", current_date)                    AS "fyStart",
         COALESCE(pt."fiscalYearStartMonth", 7)                             AS "fyStartMonth"
    FROM (SELECT "tenantId" FROM "HumanResources"."TrainingPrograms"
          UNION SELECT "tenantId" FROM "HumanResources"."Certifications") tid
    LEFT JOIN "Platform"."Tenants" pt ON pt.id = tid."tenantId"
)
SELECT t."tenantId",
       "Company"."getFiscalYearLabel"(t."fyStart", t."fyStartMonth")                   AS "fyLabel",
       t."fyStart",
       (t."fyStart" + interval '1 year' - interval '1 day')::date     AS "fyEnd",
       (SELECT COALESCE(sum(te."hoursCompleted"), 0) FROM "HumanResources"."TrainingEnrolments" te
         WHERE te."tenantId" = t."tenantId"
           AND te."enrolledOn" >= t."fyStart" AND te."enrolledOn" < (t."fyStart" + interval '1 year')::date) AS "trainingHours",
       (SELECT COALESCE(sum(tp.budget), 0) FROM "HumanResources"."TrainingPrograms" tp
         WHERE tp."tenantId" = t."tenantId" AND tp."deletedAt" IS NULL AND tp.status <> 'CANCELLED'
           AND (tp."startDate" IS NULL
                OR (tp."startDate" >= t."fyStart" AND tp."startDate" < (t."fyStart" + interval '1 year')::date))) AS budget,
       (SELECT COALESCE(sum(te.cost), 0) FROM "HumanResources"."TrainingEnrolments" te
         WHERE te."tenantId" = t."tenantId"
           AND te."enrolledOn" >= t."fyStart" AND te."enrolledOn" < (t."fyStart" + interval '1 year')::date) AS "costUtilised",
       (SELECT count(*) FROM "HumanResources"."TrainingEnrolments" te
         WHERE te."tenantId" = t."tenantId"
           AND te.status IN ('ENROLLED','IN_PROGRESS','BEHIND'))::integer                                AS "activeEnrolments",
       (SELECT count(*) FROM "HumanResources"."TrainingEnrolments" te
         WHERE te."tenantId" = t."tenantId" AND te.status = 'COMPLETED'
           AND te."completedOn" >= t."fyStart" AND te."completedOn" < (t."fyStart" + interval '1 year')::date)::integer AS "completedEnrolments",
       (SELECT count(*) FROM "HumanResources"."Certifications" c
         WHERE c."tenantId" = t."tenantId" AND c.status = 'ACTIVE'
           AND c."expiresOn" BETWEEN current_date AND current_date + 60)::integer                        AS "certsExpiring60d"
  FROM t;

COMMENT ON VIEW "HumanResources"."getTrainingSummary" IS
  'Training KPIs for the current fiscal year: hours, budget, cost utilised, active / completed enrolments, certifications expiring in 60 days. Screen: app/hr/training.';
