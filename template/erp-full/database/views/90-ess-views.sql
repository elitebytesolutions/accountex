-- =============================================================================
-- Finsoft ERP (FULL) — views/90-ess-views.sql
-- Employee self-service views (install order: … → fk/* → 90-views → 91-rls → 95-seed).
--
-- Views named by entities/14-ess.md:
--   EmployeeSelfService.getMyDay      My Day (ess/dashboard)              — signed-in employee only
--   EmployeeSelfService.getMyTeamToday      My Team (team today groups)         — filter managerEmployeeId
--   EmployeeSelfService.getMyTeamCalendar   My Team (team calendar)             — filter managerEmployeeId
--   EmployeeSelfService.getEmployeeDirectory       Directory (ess/company)
--   EmployeeSelfService.getHelpdeskServiceLevels    Helpdesk (category cards, service levels)
--   EmployeeSelfService.getKudosSummary   Kudos & Pulse (your recognition)
--   EmployeeSelfService.getPulseSurveyResults   Kudos & Pulse (pulse results)       — anonymous aggregates only
--   EmployeeSelfService.getPollResults    Kudos & Pulse (poll results)
--
-- Rules
--   * Every view is WITH (security_invoker = true): RLS on the base tables
--     (tenantId = Company.getCurrentTenantId(), 91-rls.sql) applies to the caller.
--   * "Me" = the HumanResources.Employees whose appUserId = Company.getCurrentUserId().
--   * Team views expose managerEmployeeId (= HumanResources.Employees.reportingManagerId
--     of the team member); the API filters it to the signed-in manager.
--   * Pulse results never expose respondentHash or single responses and are
--     suppressed below 5 respondents (see v_pulse_results).
--   * This file installs before 90-hr-views.sql, so it reads hr / payroll
--     tables directly and never an hr.v_* view.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- v_ess_my_day — one row for the signed-in employee.
--   shift            today's published roster shift, else the employee shift
--   today_*          today's HumanResources.AttendanceRegister, else first / last valid punch
--   pending_requests own PENDING leave, regularisation, OT, loans and OPEN
--                    letter requests
--   leave_*          current leave year, paid leave types
--   latest payslip   most recent payslip published to ESS (or of a PAID run)
--   month_*          HumanResources.AttendanceRegister of the current month so far
--   unread_announcements PUBLISHED, unexpired, audience-matched, not read
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "EmployeeSelfService"."getMyDay"
WITH (security_invoker = true) AS
SELECT e."tenantId",
       e.id                                                          AS "employeeId",
       e.code                                                        AS "employeeCode",
       e."firstName",
       e."displayName",
       e."branchId",
       b.name                                                        AS branch,
       g.title                                                       AS designation,
       sh."shiftId",
       sh."shiftCode",
       sh."shiftName",
       sh."startTime"                                                 AS "shiftStart",
       sh."endTime"                                                   AS "shiftEnd",
       sh."rosterEntryType",
       ad.status                                                     AS "todayStatus",
       COALESCE(ad."firstIn", pu."firstPunch")                         AS "todayCheckIn",
       COALESCE(ad."lastOut", CASE WHEN pu."punchCount" > 1 THEN pu."lastPunch" END) AS "todayCheckOut",
       ad."workedMinutes"                                             AS "todayWorkedMinutes",
       COALESCE(pu."punchCount", 0)                                   AS "todayPunchCount",
       rq."pendingRequests",
       lv."leaveAvailable",
       lv."leaveEntitled",
       lv."annualAvailable",
       lv."casualAvailable",
       lv."sickAvailable",
       hol."nextHolidayName",
       hol."nextHolidayDate",
       ps."payslipId",
       ps."payrollMonth"                                              AS "payslipMonth",
       ps."netAmount"                                                 AS "payslipNet",
       ps."grossAmount"                                               AS "payslipGross",
       ps."deductionAmount"                                           AS "payslipDeductions",
       ps."paidAt"                                                    AS "payslipPaidAt",
       ps."bankName"                                                  AS "payslipBank",
       ps."prevNetAmount"                                            AS "payslipPrevNet",
       ps."basicAmount"                                               AS "payslipBasic",
       ps."commissionAmount"                                          AS "payslipCommission",
       mo."monthPresent",
       mo."monthLate",
       mo."monthLeave",
       mo."monthAbsent",
       mo."monthHoliday",
       mo."monthWeeklyOff",
       mo."monthWorkingDays",
       an."unreadAnnouncements"
  FROM "HumanResources"."Employees" e
  JOIN "Company"."Branches" b      ON b."tenantId" = e."tenantId" AND b.id = e."branchId"
  JOIN "HumanResources"."Designations" g   ON g."tenantId" = e."tenantId" AND g.id = e."designationId"
  LEFT JOIN "HumanResources"."AttendanceRegister" ad
         ON ad."tenantId" = e."tenantId" AND ad."employeeId" = e.id AND ad."attDate" = current_date
  LEFT JOIN LATERAL (
         SELECT s.id AS "shiftId", s.code AS "shiftCode", s.name AS "shiftName", s."startTime", s."endTime",
                ro."entryType" AS "rosterEntryType"
           FROM (SELECT 1) one
           LEFT JOIN "HumanResources"."ShiftRosters" ro
                  ON ro."tenantId" = e."tenantId" AND ro."employeeId" = e.id
                 AND ro."rosterDate" = current_date AND ro."isPublished"
           LEFT JOIN "HumanResources"."WorkShifts" s
                  ON s."tenantId" = e."tenantId" AND s.id = COALESCE(ro."shiftId", e."shiftId")) sh ON true
  LEFT JOIN LATERAL (
         SELECT min(p."punchAt") AS "firstPunch", max(p."punchAt") AS "lastPunch", count(*)::integer AS "punchCount"
           FROM "HumanResources"."AttendancePunches" p
          WHERE p."tenantId" = e."tenantId" AND p."employeeId" = e.id AND NOT p."isVoid"
            AND p."punchAt" >= current_date::timestamptz
            AND p."punchAt" <  (current_date + 1)::timestamptz) pu ON true
  LEFT JOIN LATERAL (
         SELECT ((SELECT count(*) FROM "HumanResources"."LeaveRequests" x
                   WHERE x."tenantId" = e."tenantId" AND x."employeeId" = e.id AND x.status = 'PENDING')
               + (SELECT count(*) FROM "HumanResources"."RegularisationRequests" x
                   WHERE x."tenantId" = e."tenantId" AND x."employeeId" = e.id AND x.status = 'PENDING')
               + (SELECT count(*) FROM "HumanResources"."OvertimeClaims" x
                   WHERE x."tenantId" = e."tenantId" AND x."employeeId" = e.id AND x.status = 'PENDING')
               + (SELECT count(*) FROM "Payroll"."LoansAndAdvances" x
                   WHERE x."tenantId" = e."tenantId" AND x."employeeId" = e.id AND x.status = 'PENDING')
               + (SELECT count(*) FROM "EmployeeSelfService"."LetterRequests" x
                   WHERE x."tenantId" = e."tenantId" AND x."employeeId" = e.id AND x.status = 'OPEN'))::integer AS "pendingRequests") rq ON true
  LEFT JOIN LATERAL (
         SELECT sum(lb.available)                                          AS "leaveAvailable",
                sum(lb.entitled + lb."carriedIn" + lb.adjusted)             AS "leaveEntitled",
                sum(lb.available) FILTER (WHERE lt.category = 'ANNUAL')    AS "annualAvailable",
                sum(lb.available) FILTER (WHERE lt.category = 'CASUAL')    AS "casualAvailable",
                sum(lb.available) FILTER (WHERE lt.category = 'SICK')      AS "sickAvailable"
           FROM "HumanResources"."LeaveBalances" lb
           JOIN "HumanResources"."LeaveTypes" lt ON lt."tenantId" = lb."tenantId" AND lt.id = lb."leaveTypeId"
          WHERE lb."tenantId" = e."tenantId" AND lb."employeeId" = e.id
            AND lb."leaveYearStart" = "HumanResources"."getLeaveYearStart"(e."tenantId", current_date)
            AND lt."isPaid" AND lt.status = 'ACTIVE') lv ON true
  LEFT JOIN LATERAL (
         SELECT h.name AS "nextHolidayName", h."fromDate" AS "nextHolidayDate"
           FROM "HumanResources"."Holidays" h
          WHERE h."tenantId" = e."tenantId" AND h."deletedAt" IS NULL
            AND h.status <> 'CANCELLED' AND h."holidayType" IN ('PUBLIC','COMPANY')
            AND h."toDate" >= current_date
            AND (h."appliesToAllBranches"
                 OR EXISTS (SELECT 1 FROM "HumanResources"."HolidayBranches" hb
                             WHERE hb."tenantId" = h."tenantId" AND hb."holidayId" = h.id
                               AND hb."branchId" = e."branchId"))
          ORDER BY h."fromDate"
          LIMIT 1) hol ON true
  LEFT JOIN LATERAL (
         SELECT s.id AS "payslipId", s."payrollMonth", s."netAmount", s."grossAmount", s."deductionAmount",
                r."paidAt", l."bankName", l."prevNetAmount", l."basicAmount",
                (SELECT sum(c.amount) FROM "Payroll"."PayrollRunLineComponents" c
                   JOIN "Payroll"."SalaryComponents" sc ON sc."tenantId" = c."tenantId" AND sc.id = c."componentId"
                  WHERE c."tenantId" = l."tenantId" AND c."payrollLineId" = l.id
                    AND sc."systemRole" = 'COMMISSION')                    AS "commissionAmount"
           FROM "Payroll"."Payslips" s
           JOIN "Payroll"."PayrollRuns" r  ON r."tenantId" = s."tenantId" AND r.id = s."payrollRunId"
           JOIN "Payroll"."PayrollRunLines" l ON l."tenantId" = s."tenantId" AND l.id = s."payrollLineId"
          WHERE s."tenantId" = e."tenantId" AND s."employeeId" = e.id
            AND (s."publishedToEssAt" IS NOT NULL OR r.status = 'PAID')
          ORDER BY s."payrollMonth" DESC
          LIMIT 1) ps ON true
  LEFT JOIN LATERAL (
         SELECT (count(*) FILTER (WHERE d.status IN ('PRESENT','WFH','ON_DUTY','HALF_DAY')))::integer AS "monthPresent",
                (count(*) FILTER (WHERE d.status = 'LATE'))::integer          AS "monthLate",
                (count(*) FILTER (WHERE d.status = 'LEAVE'))::integer         AS "monthLeave",
                (count(*) FILTER (WHERE d.status = 'ABSENT'))::integer        AS "monthAbsent",
                (count(*) FILTER (WHERE d.status = 'HOLIDAY'))::integer       AS "monthHoliday",
                (count(*) FILTER (WHERE d.status = 'WEEKLY_OFF'))::integer    AS "monthWeeklyOff",
                (count(*) FILTER (WHERE d.status NOT IN ('HOLIDAY','WEEKLY_OFF')))::integer AS "monthWorkingDays"
           FROM "HumanResources"."AttendanceRegister" d
          WHERE d."tenantId" = e."tenantId" AND d."employeeId" = e.id
            AND d."attDate" >= date_trunc('month', current_date)::date
            AND d."attDate" <= current_date) mo ON true
  LEFT JOIN LATERAL (
         SELECT count(*)::integer AS "unreadAnnouncements"
           FROM "EmployeeSelfService"."CompanyAnnouncements" ca
          WHERE ca."tenantId" = e."tenantId" AND ca.status = 'PUBLISHED'
            AND (ca."expiresAt" IS NULL OR ca."expiresAt" > now())
            AND (ca."branchId" IS NULL OR ca."branchId" = e."branchId")
            AND (ca."departmentId" IS NULL OR ca."departmentId" = e."departmentId")
            AND NOT EXISTS (SELECT 1 FROM "EmployeeSelfService"."CompanyAnnouncementReads" ar
                             WHERE ar."tenantId" = ca."tenantId" AND ar."announcementId" = ca.id
                               AND ar."employeeId" = e.id)) an ON true
 WHERE e."appUserId" = "Company"."getCurrentUserId"()
   AND e."deletedAt" IS NULL;

COMMENT ON VIEW "EmployeeSelfService"."getMyDay" IS
  'My Day row for the signed-in employee (appUserId = Company.getCurrentUserId()): greeting/branch/designation/shift, today''s check-in/out, pending requests, leave available (annual/casual/sick), next holiday, latest payslip (net, gross, commission, vs previous), month attendance counts, unread announcements. Screen: ess/dashboard.';


-- ---------------------------------------------------------------------------
-- v_team_today — today's state of every active employee, keyed by manager.
--   team_group  ON_LEAVE  LEAVE day or APPROVED leave covering today
--               LATE      day status LATE
--               IN        worked status, or a valid punch today
--               OFF       HOLIDAY / WEEKLY_OFF
--               NOT_CHECKED_IN otherwise (ABSENT included)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "EmployeeSelfService"."getMyTeamToday"
WITH (security_invoker = true) AS
SELECT e."tenantId",
       e."reportingManagerId"                                        AS "managerEmployeeId",
       e.id                                                          AS "employeeId",
       e.code                                                        AS "employeeCode",
       e."displayName",
       g.title                                                       AS designation,
       e.mobile,
       e."workEmail",
       current_date                                                  AS "attDate",
       CASE WHEN ad.status = 'LEAVE' OR (ad.status IS NULL AND lv."onLeave") THEN 'ON_LEAVE'
            WHEN ad.status = 'LATE'                                          THEN 'LATE'
            WHEN ad.status IN ('PRESENT','WFH','ON_DUTY','HALF_DAY')
              OR (ad.status IS NULL AND pu."firstPunch" IS NOT NULL)          THEN 'IN'
            WHEN ad.status IN ('HOLIDAY','WEEKLY_OFF')                       THEN 'OFF'
            ELSE 'NOT_CHECKED_IN' END                                AS "teamGroup",
       ad.status                                                     AS "dayStatus",
       COALESCE(ad."firstIn", pu."firstPunch")                         AS "checkInAt",
       ad."lateMinutes",
       COALESCE(ad."locationLabel", pu."locationLabel")                AS "locationLabel",
       pu."workMode",
       lv."leaveTypeCode",
       ps.status                                                     AS "presenceStatus",
       ps.message                                                    AS "presenceMessage"
  FROM "HumanResources"."Employees" e
  JOIN "HumanResources"."Designations" g ON g."tenantId" = e."tenantId" AND g.id = e."designationId"
  LEFT JOIN "HumanResources"."AttendanceRegister" ad
         ON ad."tenantId" = e."tenantId" AND ad."employeeId" = e.id AND ad."attDate" = current_date
  LEFT JOIN LATERAL (
         SELECT p."punchAt" AS "firstPunch", p."locationLabel", p."workMode"
           FROM "HumanResources"."AttendancePunches" p
          WHERE p."tenantId" = e."tenantId" AND p."employeeId" = e.id AND NOT p."isVoid"
            AND p."punchAt" >= current_date::timestamptz
            AND p."punchAt" <  (current_date + 1)::timestamptz
          ORDER BY p."punchAt"
          LIMIT 1) pu ON true
  LEFT JOIN LATERAL (
         SELECT true AS "onLeave", lt.code AS "leaveTypeCode"
           FROM "HumanResources"."LeaveRequests" lr
           JOIN "HumanResources"."LeaveTypes" lt ON lt."tenantId" = lr."tenantId" AND lt.id = lr."leaveTypeId"
          WHERE lr."tenantId" = e."tenantId" AND lr."employeeId" = e.id AND lr.status = 'APPROVED'
            AND current_date BETWEEN lr."fromDate" AND lr."toDate"
          LIMIT 1) lv ON true
  LEFT JOIN "EmployeeSelfService"."PresenceStatuses" ps
         ON ps."tenantId" = e."tenantId" AND ps."employeeId" = e.id
 WHERE e."deletedAt" IS NULL
   AND e.status <> 'EXITED';

COMMENT ON VIEW "EmployeeSelfService"."getMyTeamToday" IS
  'Team today per employee (filter managerEmployeeId = me): group IN / LATE / ON_LEAVE / NOT_CHECKED_IN / OFF, check-in time, location, presence, phone for Nudge / Call. Screen: ess/team (Team today).';


-- ---------------------------------------------------------------------------
-- v_team_calendar — calendar entries of active employees, keyed by manager.
--   entryKind  LEAVE (approved), LEAVE_PENDING, SICK (approved SICK category),
--               TRAINING (scheduled / completed sessions of programmes the
--               employee is enrolled in). Weekends are drawn by the UI from
--               HumanResources.Employees.weeklyOff (returned on every row).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "EmployeeSelfService"."getMyTeamCalendar"
WITH (security_invoker = true) AS
SELECT e."tenantId",
       e."reportingManagerId"                                        AS "managerEmployeeId",
       e.id                                                          AS "employeeId",
       e."displayName",
       e."weeklyOff",
       g.d::date                                                     AS "calDate",
       CASE WHEN lr.status = 'PENDING'   THEN 'LEAVE_PENDING'
            WHEN lt.category = 'SICK'    THEN 'SICK'
            ELSE 'LEAVE' END                                         AS "entryKind",
       lt.code                                                       AS "leaveTypeCode",
       lt.name                                                       AS label,
       lr.duration,
       lr.id                                                         AS "sourceId"
  FROM "HumanResources"."LeaveRequests" lr
  JOIN "HumanResources"."Employees" e   ON e."tenantId" = lr."tenantId" AND e.id = lr."employeeId"
  JOIN "HumanResources"."LeaveTypes" lt ON lt."tenantId" = lr."tenantId" AND lt.id = lr."leaveTypeId"
  CROSS JOIN LATERAL generate_series(lr."fromDate", lr."toDate", interval '1 day') AS g(d)
 WHERE lr.status IN ('PENDING','APPROVED')
   AND e."deletedAt" IS NULL AND e.status <> 'EXITED'
UNION ALL
SELECT e."tenantId",
       e."reportingManagerId",
       e.id,
       e."displayName",
       e."weeklyOff",
       g.d::date,
       'TRAINING',
       NULL,
       ts.title,
       NULL,
       ts.id
  FROM "HumanResources"."TrainingEnrolments" te
  JOIN "HumanResources"."Employees" e          ON e."tenantId" = te."tenantId" AND e.id = te."employeeId"
  JOIN "HumanResources"."TrainingSessions" ts ON ts."tenantId" = te."tenantId" AND ts."programId" = te."programId"
  CROSS JOIN LATERAL generate_series(ts."startsAt"::date, ts."endsAt"::date, interval '1 day') AS g(d)
 WHERE te.status <> 'WITHDRAWN'
   AND ts.status <> 'CANCELLED'
   AND e."deletedAt" IS NULL AND e.status <> 'EXITED';

COMMENT ON VIEW "EmployeeSelfService"."getMyTeamCalendar" IS
  'Team calendar entries per employee × date (filter managerEmployeeId = me): approved leave, pending leave, sick leave, training sessions; weeklyOff for weekend shading. Screen: ess/team (Team calendar).';


-- ---------------------------------------------------------------------------
-- v_directory — people directory of active employees.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "EmployeeSelfService"."getEmployeeDirectory"
WITH (security_invoker = true) AS
SELECT e."tenantId",
       e.id                                                          AS "employeeId",
       e.code                                                        AS "employeeCode",
       e."displayName",
       e."firstName",
       e."lastName",
       e."photoAttachmentId",
       g.title                                                       AS designation,
       e."departmentId",
       d.name                                                        AS department,
       e."branchId",
       b.name                                                        AS branch,
       b.city                                                        AS "branchCity",
       e.mobile,
       e."workEmail",
       e."reportingManagerId"                                        AS "managerId",
       m."displayName"                                                AS "managerName",
       (SELECT count(*) FROM "HumanResources"."Employees" r
         WHERE r."tenantId" = e."tenantId" AND r."reportingManagerId" = e.id
           AND r."deletedAt" IS NULL AND r.status <> 'EXITED')::integer AS "directReports",
       COALESCE(ps.status, 'AVAILABLE')                              AS "presenceStatus",
       ps.message                                                    AS "presenceMessage",
       ps."locationLabel"                                             AS "presenceLocation",
       ps."untilAt"                                                   AS "presenceUntil",
       pt.timezone                                                   AS timezone
  FROM "HumanResources"."Employees" e
  JOIN "HumanResources"."Designations" g    ON g."tenantId" = e."tenantId" AND g.id = e."designationId"
  JOIN "HumanResources"."Departments" d     ON d."tenantId" = e."tenantId" AND d.id = e."departmentId"
  JOIN "Company"."Branches" b       ON b."tenantId" = e."tenantId" AND b.id = e."branchId"
  LEFT JOIN "HumanResources"."Employees" m  ON m."tenantId" = e."tenantId" AND m.id = e."reportingManagerId"
  LEFT JOIN "EmployeeSelfService"."PresenceStatuses" ps
         ON ps."tenantId" = e."tenantId" AND ps."employeeId" = e.id
        AND (ps."untilAt" IS NULL OR ps."untilAt" > now())
  LEFT JOIN "Platform"."Tenants" pt ON pt.id = e."tenantId"
 WHERE e."deletedAt" IS NULL
   AND e.status <> 'EXITED';

COMMENT ON VIEW "EmployeeSelfService"."getEmployeeDirectory" IS
  'People directory: name, designation, department, branch, phone / email, manager and direct reports (org tree), presence (expired statuses fall back to AVAILABLE), tenant timezone for local time. Screen: ess/company (Directory, org chart).';


-- ---------------------------------------------------------------------------
-- v_helpdesk_sla — service levels per category plus a company-wide row
-- (categoryId NULL). Rates cover tickets opened in the last 90 days;
-- open_count is all currently OPEN / IN_PROGRESS tickets.
--   on_time_pct        slaMet = true ÷ tickets with slaMet set
--   avg_first_reply_h  openedAt → firstResponseAt, hours
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "EmployeeSelfService"."getHelpdeskServiceLevels"
WITH (security_invoker = true) AS
SELECT c."tenantId",
       c.id                                                          AS "categoryId",
       c.code,
       c.name,
       c.description,
       c."slaHours",
       (count(t.id) FILTER (WHERE t.status IN ('OPEN','IN_PROGRESS')))::integer         AS "openCount",
       (count(t.id) FILTER (WHERE t."openedAt" >= now() - interval '90 days'))::integer   AS tickets90d,
       round(100.0 * count(t.id) FILTER (WHERE t."openedAt" >= now() - interval '90 days' AND t."slaMet")
             / NULLIF(count(t.id) FILTER (WHERE t."openedAt" >= now() - interval '90 days' AND t."slaMet" IS NOT NULL), 0), 1) AS "onTimePct",
       round((avg(extract(epoch FROM (t."firstResponseAt" - t."openedAt")) / 3600)
             FILTER (WHERE t."openedAt" >= now() - interval '90 days' AND t."firstResponseAt" IS NOT NULL))::numeric, 1) AS "avgFirstReplyH",
       round((avg(extract(epoch FROM (t."resolvedAt" - t."openedAt")) / 3600)
             FILTER (WHERE t."openedAt" >= now() - interval '90 days' AND t."resolvedAt" IS NOT NULL))::numeric, 1)       AS "avgResolutionH",
       round(avg(t."csatRating") FILTER (WHERE t."openedAt" >= now() - interval '90 days'), 2)                       AS "avgRating",
       (count(t."csatRating") FILTER (WHERE t."openedAt" >= now() - interval '90 days'))::integer                    AS "ratingCount"
  FROM "EmployeeSelfService"."HelpdeskCategories" c
  LEFT JOIN "EmployeeSelfService"."HelpdeskTickets" t ON t."tenantId" = c."tenantId" AND t."categoryId" = c.id
 WHERE c."deletedAt" IS NULL
 GROUP BY GROUPING SETS ((c."tenantId", c.id, c.code, c.name, c.description, c."slaHours"), (c."tenantId"));

COMMENT ON VIEW "EmployeeSelfService"."getHelpdeskServiceLevels" IS
  'Helpdesk service levels per category (+ company-wide row with categoryId NULL): open count, tickets (90 d), on-time %, avg first reply / resolution hours, avg CSAT and rating count. Screen: ess/helpdesk (category cards, Service levels).';


-- ---------------------------------------------------------------------------
-- v_kudos_summary — recognition totals per active employee (hidden kudos
-- excluded). points = Σ pointsToRecipient received + Σ pointsToGiver given.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "EmployeeSelfService"."getKudosSummary"
WITH (security_invoker = true) AS
SELECT e."tenantId",
       e.id                                                          AS "employeeId",
       COALESCE(r.received, 0)                                       AS received,
       COALESCE(gv.given, 0)                                         AS given,
       COALESCE(r."pointsReceived", 0) + COALESCE(gv."pointsGiven", 0) AS points,
       COALESCE(r."customerHero", 0)                                  AS "badgeCustomerHero",
       COALESCE(r."teamPlayer", 0)                                    AS "badgeTeamPlayer",
       COALESCE(r."goGetter", 0)                                      AS "badgeGoGetter",
       COALESCE(r."problemSolver", 0)                                 AS "badgeProblemSolver",
       COALESCE(r.mentor, 0)                                         AS "badgeMentor",
       r."lastReceivedAt"
  FROM "HumanResources"."Employees" e
  LEFT JOIN LATERAL (
         SELECT count(*)::integer                                              AS received,
                sum(k."pointsToRecipient")::integer                            AS "pointsReceived",
                (count(*) FILTER (WHERE k.badge = 'CUSTOMER_HERO'))::integer   AS "customerHero",
                (count(*) FILTER (WHERE k.badge = 'TEAM_PLAYER'))::integer     AS "teamPlayer",
                (count(*) FILTER (WHERE k.badge = 'GO_GETTER'))::integer       AS "goGetter",
                (count(*) FILTER (WHERE k.badge = 'PROBLEM_SOLVER'))::integer  AS "problemSolver",
                (count(*) FILTER (WHERE k.badge = 'MENTOR'))::integer          AS mentor,
                max(k."givenAt")                                                AS "lastReceivedAt"
           FROM "EmployeeSelfService"."Kudos" k
          WHERE k."tenantId" = e."tenantId" AND k."toEmployeeId" = e.id AND NOT k."isHidden") r ON true
  LEFT JOIN LATERAL (
         SELECT count(*)::integer               AS given,
                sum(k."pointsToGiver")::integer AS "pointsGiven"
           FROM "EmployeeSelfService"."Kudos" k
          WHERE k."tenantId" = e."tenantId" AND k."fromEmployeeId" = e.id AND NOT k."isHidden") gv ON true
 WHERE e."deletedAt" IS NULL
   AND e.status <> 'EXITED';

COMMENT ON VIEW "EmployeeSelfService"."getKudosSummary" IS
  'Recognition per employee: kudos received / given, points, badge counts (Customer Hero, Team Player, Go-Getter, Problem Solver, Mentor). Screen: ess/kudos (Your recognition).';


-- ---------------------------------------------------------------------------
-- v_pulse_results — ANONYMOUS pulse aggregates per survey × question, company
-- wide (departmentId NULL) and per department.
-- Anonymity:
--   * only aggregates (count, average, favourable / unfavourable shares);
--     respondentHash and individual scores are never returned
--   * a group is returned only with ≥ 5 distinct respondents
--   * a department row is also dropped when the rest of the survey
--     (company − department) has 1–4 respondents, so the suppressed group
--     cannot be recovered by subtraction
--   response_rate_pct  respondents ÷ active headcount of the group
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "EmployeeSelfService"."getPulseSurveyResults"
WITH (security_invoker = true) AS
WITH g AS (
  SELECT r."tenantId", r."surveyId", r."questionId", r."departmentId",
         count(DISTINCT r."respondentHash")                     AS respondents,
         avg(r.score)                                          AS "avgScore",
         count(*) FILTER (WHERE r.score >= 4)                  AS favourable,
         count(*) FILTER (WHERE r.score <= 2)                  AS unfavourable,
         count(*)                                              AS responses
    FROM "EmployeeSelfService"."PulseSurveyResponses" r
   GROUP BY r."tenantId", r."surveyId", r."questionId", r."departmentId"
),
co AS (
  SELECT r."tenantId", r."surveyId", r."questionId",
         count(DISTINCT r."respondentHash")                     AS respondents,
         avg(r.score)                                          AS "avgScore",
         count(*) FILTER (WHERE r.score >= 4)                  AS favourable,
         count(*) FILTER (WHERE r.score <= 2)                  AS unfavourable,
         count(*)                                              AS responses
    FROM "EmployeeSelfService"."PulseSurveyResponses" r
   GROUP BY r."tenantId", r."surveyId", r."questionId"
),
res AS (
  SELECT co."tenantId", co."surveyId", co."questionId", NULL::uuid AS "departmentId",
         co.respondents, co."avgScore", co.favourable, co.unfavourable, co.responses
    FROM co
   WHERE co.respondents >= 5
  UNION ALL
  SELECT g."tenantId", g."surveyId", g."questionId", g."departmentId",
         g.respondents, g."avgScore", g.favourable, g.unfavourable, g.responses
    FROM g
    JOIN co ON co."tenantId" = g."tenantId" AND co."surveyId" = g."surveyId" AND co."questionId" = g."questionId"
   WHERE g."departmentId" IS NOT NULL
     AND g.respondents >= 5
     AND (co.respondents - g.respondents = 0 OR co.respondents - g.respondents >= 5)
)
SELECT x."tenantId",
       x."surveyId",
       s.title                                                       AS "surveyTitle",
       s."periodFrom",
       s."periodTo",
       s.status                                                      AS "surveyStatus",
       x."questionId",
       q.seq,
       q."questionText",
       q."metricKey",
       q."lowLabel",
       q."highLabel",
       x."departmentId",
       d.name                                                        AS department,
       x.respondents::integer                                        AS respondents,
       hc.headcount,
       round(100.0 * x.respondents / NULLIF(hc.headcount, 0), 1)     AS "responseRatePct",
       round(x."avgScore", 2)                                         AS "avgScore",
       round(100.0 * x.favourable / NULLIF(x.responses, 0), 1)       AS "favourablePct",
       round(100.0 * x.unfavourable / NULLIF(x.responses, 0), 1)     AS "unfavourablePct"
  FROM res x
  JOIN "EmployeeSelfService"."PulseSurveys" s   ON s."tenantId" = x."tenantId" AND s.id = x."surveyId"
  JOIN "EmployeeSelfService"."PulseSurveyQuestions" q ON q."tenantId" = x."tenantId" AND q.id = x."questionId"
  LEFT JOIN "HumanResources"."Departments" d ON d."tenantId" = x."tenantId" AND d.id = x."departmentId"
  LEFT JOIN LATERAL (
         SELECT count(*)::integer AS headcount
           FROM "HumanResources"."Employees" e
          WHERE e."tenantId" = x."tenantId" AND e."deletedAt" IS NULL AND e.status <> 'EXITED'
            AND e."departmentId" = COALESCE(x."departmentId", s."departmentId", e."departmentId")) hc ON true;

COMMENT ON VIEW "EmployeeSelfService"."getPulseSurveyResults" IS
  'Anonymous pulse results per survey × question, company-wide (departmentId NULL) and per department: respondents, response rate, avg score, favourable (4–5) / unfavourable (1–2) %. Aggregates only; groups with < 5 respondents (or whose complement has 1–4) are suppressed. Screen: ess/kudos (Weekly pulse results, "78% of Sales responded").';


-- ---------------------------------------------------------------------------
-- v_poll_results — votes per poll option with share of the poll's votes.
--   owner_name    poll creator (Company.Users via the standard createdBy)
--   my_choice     the signed-in employee voted for this option
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "EmployeeSelfService"."getPollResults"
WITH (security_invoker = true) AS
SELECT p."tenantId",
       p.id                                                          AS "pollId",
       p.question,
       p."departmentId",
       p.status,
       p."opensAt",
       p."closesAt",
       p."showResultsAfterVote",
       p."createdBy"                                                  AS "ownerUserId",
       u."fullName"                                                   AS "ownerName",
       o.id                                                          AS "optionId",
       o.seq,
       o.label,
       COALESCE(v.votes, 0)                                          AS votes,
       sum(COALESCE(v.votes, 0)) OVER (PARTITION BY p."tenantId", p.id)::integer AS "totalVotes",
       round(100.0 * COALESCE(v.votes, 0)
             / NULLIF(sum(COALESCE(v.votes, 0)) OVER (PARTITION BY p."tenantId", p.id), 0), 1) AS pct,
       COALESCE(v."myChoice", false)                                  AS "myChoice"
  FROM "EmployeeSelfService"."Polls" p
  JOIN "EmployeeSelfService"."PollOptions" o ON o."tenantId" = p."tenantId" AND o."pollId" = p.id
  LEFT JOIN "Company"."Users" u ON u."tenantId" = p."tenantId" AND u.id = p."createdBy"
  LEFT JOIN LATERAL (
         SELECT count(*)::integer AS votes,
                bool_or(EXISTS (SELECT 1 FROM "HumanResources"."Employees" me
                                 WHERE me."tenantId" = pv."tenantId" AND me.id = pv."employeeId"
                                   AND me."appUserId" = "Company"."getCurrentUserId"())) AS "myChoice"
           FROM "EmployeeSelfService"."PollVotes" pv
          WHERE pv."tenantId" = o."tenantId" AND pv."pollId" = o."pollId" AND pv."optionId" = o.id) v ON true;

COMMENT ON VIEW "EmployeeSelfService"."getPollResults" IS
  'Poll results per option: votes, poll total, % share, owner (createdBy → Company.Users), and whether the signed-in employee chose it. Screen: ess/kudos (Poll).';
