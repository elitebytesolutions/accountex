-- Phase 31 — Leave & lifecycle: row history on onboardings / tasks / clearance items / exit interviews; fixed leave
-- request AddUpdate / approve / cancel, a reject function; leave adjustments (manual, opening, comp-off), monthly
-- accrual, year-end close (carry forward / encash / lapse) and its reversal; onboardings from a template with task
-- tracking; clearance and offboarding completion (employee EXITED, login suspended, never the company's default user);
-- LV / ONB / OFF numbering and the default leave approval workflows for every company; error codes. Idempotent.
-- Ownership with Phase 30: this file never writes HumanResources.AttendanceRegister (Phase 30 reads approved leave).
SELECT set_config('app.actorLabel', '202-leave-lifecycle.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Row history on the four tables that had none
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "onboardingsAudit" ON "HumanResources"."Onboardings";
CREATE TRIGGER "onboardingsAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."Onboardings"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "onboardingTasksAudit" ON "HumanResources"."OnboardingTasks";
CREATE TRIGGER "onboardingTasksAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."OnboardingTasks"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "clearanceItemsAudit" ON "HumanResources"."ClearanceItems";
CREATE TRIGGER "clearanceItemsAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."ClearanceItems"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "exitInterviewsAudit" ON "HumanResources"."ExitInterviews";
CREATE TRIGGER "exitInterviewsAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."ExitInterviews"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Balance ledger: negative deltas work (see below) and the commit-time guard names its catalogue code.
-- ---------------------------------------------------------------------------
-- Update first, insert only when the balance row doesn't exist yet: INSERT … ON CONFLICT checks the proposed row's
-- CHECKs (booked / used >= 0) before it sees the conflict, so every negative delta (approve, cancel, reject) failed.
CREATE OR REPLACE FUNCTION "HumanResources"."adjustLeaveBalance"("pTenant" uuid, "pEmployee" uuid, "pLeaveType" uuid, "pYear" date,
    "pEntitled" numeric DEFAULT 0, "pCarried" numeric DEFAULT 0, "pAdjusted" numeric DEFAULT 0, "pUsed" numeric DEFAULT 0,
    "pBooked" numeric DEFAULT 0, "pEncashed" numeric DEFAULT 0, "pLapsed" numeric DEFAULT 0)
  RETURNS void
  LANGUAGE plpgsql
AS $function$
BEGIN
  LOOP
    UPDATE "HumanResources"."LeaveBalances" b
       SET entitled = b.entitled + "pEntitled", "carriedIn" = b."carriedIn" + "pCarried", adjusted = b.adjusted + "pAdjusted",
           used = b.used + "pUsed", booked = b.booked + "pBooked", encashed = b.encashed + "pEncashed", lapsed = b.lapsed + "pLapsed"
     WHERE b."tenantId" = "pTenant" AND b."employeeId" = "pEmployee" AND b."leaveTypeId" = "pLeaveType" AND b."leaveYearStart" = "pYear";
    IF FOUND THEN
      RETURN;
    END IF;
    BEGIN
      INSERT INTO "HumanResources"."LeaveBalances" ("tenantId", "employeeId", "leaveTypeId", "leaveYearStart", entitled, "carriedIn", adjusted, used, booked, encashed, lapsed)
      VALUES ("pTenant", "pEmployee", "pLeaveType", "pYear", "pEntitled", "pCarried", "pAdjusted", "pUsed", "pBooked", "pEncashed", "pLapsed");
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      -- a concurrent first write created the row: update it
    END;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."triggerLeaveBalanceGuard"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  "vType" record;   -- HumanResources.LeaveTypes row
BEGIN
  IF NEW.balance < 0 THEN
    SELECT lt."allowNegative", lt."isPaid", lt.code, lt.name INTO "vType"
      FROM "HumanResources"."LeaveTypes" lt WHERE lt."tenantId" = NEW."tenantId" AND lt.id = NEW."leaveTypeId";
    IF "vType"."isPaid" AND NOT "vType"."allowNegative" THEN
      RAISE EXCEPTION 'Leave balance for % would go negative (%)', "vType".name, NEW.balance
        USING ERRCODE = 'check_violation', HINT = 'LEAVE_INSUFFICIENT_BALANCE';
    END IF;
  END IF;
  RETURN NULL;
END $function$;

-- ---------------------------------------------------------------------------
-- 3. Leave requests. AddUpdate edits only a pending request and never its status or decision; approve / reject /
--    cancel complete the request (stage COMPLETED + decision stamps). The employee never decides their own leave;
--    HR may approve a request HR filed on the employee's behalf.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."leaveRequestAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec"    "HumanResources"."LeaveRequests";
  "vId"     uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet"    uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."LeaveRequests", "pData");
  IF "pData" ? 'stage' AND "vRec".stage NOT IN ('LINE_MANAGER', 'HR_REVIEW', 'CEO') THEN
    RAISE EXCEPTION 'A leave request''s stage is set by its approval, not edited' USING ERRCODE = 'check_violation', HINT = 'LEAVE_NOT_PENDING';
  END IF;
  BEGIN
    IF "vId" IS NULL THEN
      INSERT INTO "HumanResources"."LeaveRequests" ("tenantId", "docNo", "employeeId", "leaveTypeId", duration, "fromDate", "toDate", days, reason,
             "attachmentId", "handoverEmployeeId", "contactDuringLeave", "balanceBefore", "balanceAfter", channel, "appliedOnBehalf", stage,
             "currentApproverEmployeeId", "approvalRequestId")
      VALUES ("vTenant", "Company"."getNextDocNo"('LV', current_date, NULL), "vRec"."employeeId", "vRec"."leaveTypeId", COALESCE("vRec".duration, 'FULL'),
             "vRec"."fromDate", "vRec"."toDate", "vRec".days, "vRec".reason, "vRec"."attachmentId", "vRec"."handoverEmployeeId", "vRec"."contactDuringLeave",
             "vRec"."balanceBefore", "vRec"."balanceAfter", COALESCE("vRec".channel, 'ESS_WEB'), COALESCE("vRec"."appliedOnBehalf", false),
             COALESCE("vRec".stage, 'LINE_MANAGER'), "vRec"."currentApproverEmployeeId", "vRec"."approvalRequestId")
      RETURNING id INTO "vRet";
    ELSE
      SELECT t.status INTO "vStatus" FROM "HumanResources"."LeaveRequests" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
      IF "vStatus" IS NULL THEN
        RAISE EXCEPTION 'LeaveRequests % not found', "vId" USING ERRCODE = 'no_data_found';
      END IF;
      IF "vStatus" <> 'PENDING' THEN
        RAISE EXCEPTION 'Only a pending leave request can be changed (this one is %)', lower("vStatus")
          USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'LEAVE_NOT_PENDING';
      END IF;
      UPDATE "HumanResources"."LeaveRequests" t
         SET "leaveTypeId" = CASE WHEN "pData" ? 'leaveTypeId' THEN "vRec"."leaveTypeId" ELSE t."leaveTypeId" END,
             duration = CASE WHEN "pData" ? 'duration' THEN "vRec".duration ELSE t.duration END,
             "fromDate" = CASE WHEN "pData" ? 'fromDate' THEN "vRec"."fromDate" ELSE t."fromDate" END,
             "toDate" = CASE WHEN "pData" ? 'toDate' THEN "vRec"."toDate" ELSE t."toDate" END,
             days = CASE WHEN "pData" ? 'days' THEN "vRec".days ELSE t.days END,
             reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
             "attachmentId" = CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE t."attachmentId" END,
             "handoverEmployeeId" = CASE WHEN "pData" ? 'handoverEmployeeId' THEN "vRec"."handoverEmployeeId" ELSE t."handoverEmployeeId" END,
             "contactDuringLeave" = CASE WHEN "pData" ? 'contactDuringLeave' THEN "vRec"."contactDuringLeave" ELSE t."contactDuringLeave" END,
             "balanceBefore" = CASE WHEN "pData" ? 'balanceBefore' THEN "vRec"."balanceBefore" ELSE t."balanceBefore" END,
             "balanceAfter" = CASE WHEN "pData" ? 'balanceAfter' THEN "vRec"."balanceAfter" ELSE t."balanceAfter" END,
             stage = CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE t.stage END,
             "currentApproverEmployeeId" = CASE WHEN "pData" ? 'currentApproverEmployeeId' THEN "vRec"."currentApproverEmployeeId" ELSE t."currentApproverEmployeeId" END,
             "approvalRequestId" = CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE t."approvalRequestId" END
       WHERE t.id = "vId" AND t."tenantId" = "vTenant" AND t.status = 'PENDING'
         AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
      RETURNING t.id INTO "vRet";
      IF "vRet" IS NULL THEN
        RAISE EXCEPTION 'LeaveRequests %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
    END IF;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'These dates overlap another pending or approved leave of the employee'
      USING ERRCODE = 'exclusion_violation', HINT = 'LEAVE_OVERLAP';
  END;
  RETURN "vRet";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."leaveRequestSelfCheck"("pRow" "HumanResources"."LeaveRequests")
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vUser" uuid := "Company"."getCurrentUserId"();
BEGIN
  IF "vUser" IS NOT NULL AND EXISTS (
       SELECT 1 FROM "HumanResources"."Employees" e
        WHERE e."tenantId" = "pRow"."tenantId" AND e.id = "pRow"."employeeId" AND e."appUserId" = "vUser"
       UNION ALL
       SELECT 1 FROM "Company"."Users" u WHERE u."tenantId" = "pRow"."tenantId" AND u.id = "vUser" AND u."employeeId" = "pRow"."employeeId") THEN
    RAISE EXCEPTION 'You can''t decide your own leave request' USING ERRCODE = 'insufficient_privilege', HINT = 'APPROVAL_SELF';
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."leaveRequestApprove"("pId" uuid, "pComment" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "HumanResources"."LeaveRequests";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."LeaveRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LeaveRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status <> 'PENDING' THEN
    RAISE EXCEPTION 'Leave %: cannot approve from status %', "vRow"."docNo", lower("vRow".status)
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'LEAVE_NOT_PENDING';
  END IF;
  PERFORM "HumanResources"."leaveRequestSelfCheck"("vRow");
  UPDATE "HumanResources"."LeaveRequests" t
     SET status = 'APPROVED', stage = 'COMPLETED', "decidedAt" = now(), "decidedByUserId" = "Company"."getCurrentUserId"(),
         "decisionComment" = COALESCE("pComment", t."decisionComment"), "currentApproverEmployeeId" = NULL
   WHERE t.id = "pId";
  -- refused now (not at commit) when HR reduced the balance after the request was filed
  IF EXISTS (SELECT 1 FROM "HumanResources"."LeaveBalances" b JOIN "HumanResources"."LeaveTypes" lt ON lt."tenantId" = b."tenantId" AND lt.id = b."leaveTypeId"
              WHERE b."tenantId" = "vRow"."tenantId" AND b."employeeId" = "vRow"."employeeId" AND b."leaveTypeId" = "vRow"."leaveTypeId"
                AND b."leaveYearStart" = "HumanResources"."getLeaveYearStart"("vRow"."tenantId", "vRow"."fromDate")
                AND b.balance < 0 AND lt."isPaid" AND NOT lt."allowNegative") THEN
    RAISE EXCEPTION 'Approving % would take the leave balance below zero', "vRow"."docNo" USING ERRCODE = 'check_violation', HINT = 'LEAVE_INSUFFICIENT_BALANCE';
  END IF;
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."leaveRequestReject"("pId" uuid, "pReason" text, "pComment" text DEFAULT NULL::text, "pSuggestAlternative" boolean DEFAULT false)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "HumanResources"."LeaveRequests";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."LeaveRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LeaveRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status <> 'PENDING' THEN
    RAISE EXCEPTION 'Leave %: cannot reject from status %', "vRow"."docNo", lower("vRow".status)
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'LEAVE_NOT_PENDING';
  END IF;
  PERFORM "HumanResources"."leaveRequestSelfCheck"("vRow");
  UPDATE "HumanResources"."LeaveRequests" t
     SET status = 'REJECTED', stage = 'COMPLETED', "decidedAt" = now(), "decidedByUserId" = "Company"."getCurrentUserId"(),
         "rejectionReason" = COALESCE(NULLIF("pReason", ''), 'OTHER'), "decisionComment" = "pComment",
         "suggestAlternative" = COALESCE("pSuggestAlternative", false), "currentApproverEmployeeId" = NULL
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- Cancel: a pending request (withdrawn) or an approved one (balance restored). Leave in a month Phase 30 locked for
-- payroll stays as it is.
CREATE OR REPLACE FUNCTION "HumanResources"."leaveRequestCancel"("pId" uuid, "pReason" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow"    "HumanResources"."LeaveRequests";
  "vLocked" boolean := false;
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."LeaveRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LeaveRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING', 'APPROVED') THEN
    RAISE EXCEPTION 'Leave %: cannot cancel a % request', "vRow"."docNo", lower("vRow".status)
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'LEAVE_NOT_PENDING';
  END IF;
  IF "vRow".status = 'APPROVED' AND to_regprocedure('"HumanResources"."attendanceMonthLocked"(uuid,date)') IS NOT NULL THEN
    EXECUTE 'SELECT "HumanResources"."attendanceMonthLocked"($1, $2) OR "HumanResources"."attendanceMonthLocked"($1, $3)'
       INTO "vLocked" USING "vRow"."tenantId", "vRow"."fromDate", "vRow"."toDate";
    IF "vLocked" THEN
      RAISE EXCEPTION 'Attendance for this leave is locked for payroll' USING ERRCODE = 'check_violation', HINT = 'ATTENDANCE_DAY_LOCKED';
    END IF;
  END IF;
  UPDATE "HumanResources"."LeaveRequests" t
     SET status = 'CANCELLED', stage = 'COMPLETED', "cancelledAt" = now(), "cancelReason" = "pReason", "currentApproverEmployeeId" = NULL
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Leave adjustments (append-only ledger). HR adds MANUAL (credit / debit), OPENING (credit) and COMP_OFF (credit
--    from an approved comp-off overtime claim: Phase 30 approves the claim, Phase 31 credits it, once).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."leaveAdjustmentAdd"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec"    "HumanResources"."LeaveAdjustments";
  "vClaim"  "HumanResources"."OvertimeClaims";
  "vRet"    uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."LeaveAdjustments", "pData");
  IF "vRec".kind IS NULL OR "vRec".kind NOT IN ('MANUAL', 'OPENING', 'COMP_OFF') THEN
    RAISE EXCEPTION 'Only manual, opening and comp-off adjustments are added by hand (not %)', COALESCE("vRec".kind, 'none')
      USING ERRCODE = 'check_violation', HINT = 'LEAVE_ADJUSTMENT_INVALID';
  END IF;
  IF "vRec".direction IS NULL OR ("vRec".kind IN ('OPENING', 'COMP_OFF') AND "vRec".direction <> 'CREDIT') THEN
    RAISE EXCEPTION 'An % adjustment is a credit', lower("vRec".kind) USING ERRCODE = 'check_violation', HINT = 'LEAVE_ADJUSTMENT_INVALID';
  END IF;
  IF NULLIF(btrim("vRec".reason), '') IS NULL THEN
    RAISE EXCEPTION 'Give a reason for the adjustment' USING ERRCODE = 'check_violation', HINT = 'LEAVE_ADJUSTMENT_INVALID';
  END IF;
  IF "vRec".kind = 'COMP_OFF' THEN
    SELECT * INTO "vClaim" FROM "HumanResources"."OvertimeClaims" c WHERE c."tenantId" = "vTenant" AND c.id = "vRec"."overtimeEntryId" FOR SHARE;
    IF NOT FOUND OR NOT "vClaim"."isCompOff" OR "vClaim".status <> 'APPROVED' OR "vClaim"."employeeId" <> "vRec"."employeeId" THEN
      RAISE EXCEPTION 'Comp-off is credited only from the employee''s approved comp-off overtime claim'
        USING ERRCODE = 'check_violation', HINT = 'LEAVE_ADJUSTMENT_INVALID';
    END IF;
    IF EXISTS (SELECT 1 FROM "HumanResources"."LeaveAdjustments" a WHERE a."tenantId" = "vTenant" AND a."overtimeEntryId" = "vClaim".id AND a.kind = 'COMP_OFF') THEN
      RAISE EXCEPTION 'Overtime claim % is already credited as comp-off', "vClaim"."docNo"
        USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'LEAVE_COMP_OFF_USED';
    END IF;
  ELSE
    "vRec"."overtimeEntryId" := NULL;
  END IF;
  INSERT INTO "HumanResources"."LeaveAdjustments" ("tenantId", "employeeId", "leaveTypeId", "leaveYearStart", kind, direction, days, "effectiveDate", reason, "overtimeEntryId")
  VALUES ("vTenant", "vRec"."employeeId", "vRec"."leaveTypeId", "HumanResources"."getLeaveYearStart"("vTenant", "vRec"."effectiveDate"),
          "vRec".kind, "vRec".direction, "vRec".days, "vRec"."effectiveDate", btrim("vRec".reason), "vRec"."overtimeEntryId")
  RETURNING id INTO "vRet";
  -- a debit is refused now (not at commit) when it takes a paid type below zero
  IF "vRec".direction = 'DEBIT' AND EXISTS (
       SELECT 1 FROM "HumanResources"."LeaveBalances" b JOIN "HumanResources"."LeaveTypes" t ON t."tenantId" = b."tenantId" AND t.id = b."leaveTypeId"
        WHERE b."tenantId" = "vTenant" AND b."employeeId" = "vRec"."employeeId" AND b."leaveTypeId" = "vRec"."leaveTypeId"
          AND b."leaveYearStart" = "HumanResources"."getLeaveYearStart"("vTenant", "vRec"."effectiveDate") AND b.balance < 0 AND t."isPaid" AND NOT t."allowNegative") THEN
    RAISE EXCEPTION 'This debit would take the leave balance below zero' USING ERRCODE = 'check_violation', HINT = 'LEAVE_INSUFFICIENT_BALANCE';
  END IF;
  RETURN "vRet";
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Accrual for a month: ACCRUAL credits from each active type's settings (MONTHLY: accrualAmount or days ÷ 12;
--    QUARTERLY: in the first month of each leave-year quarter, accrualAmount or days ÷ 4; UPFRONT: the year's days once
--    per leave year). Eligibility follows the type (gender, branch / grade rules with day overrides); new joiners are
--    pro-rated when the type says so; the accumulation cap holds. Idempotent per employee, type and month.
--    Returns { credited, skipped }.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."leaveAccrueMonth"("pMonth" date, "pEmployee" uuid DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant"   uuid := "Company"."getCurrentTenantId"();
  "vMonth"    date := date_trunc('month', "pMonth")::date;
  "vEnd"      date := (date_trunc('month', "pMonth") + interval '1 month - 1 day')::date;
  "vYear"     date;
  "vT"        record;
  "vE"        record;
  "vRule"     record;
  "vAnnual"   numeric;
  "vAmount"   numeric;
  "vEff"      date;
  "vBal"      numeric;
  "vQStart"   date;
  "vCredited" integer := 0;
  "vSkipped"  integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('leaveAccrueMonth:' || "vTenant"::text));
  "vYear" := "HumanResources"."getLeaveYearStart"("vTenant", "vMonth");
  FOR "vT" IN SELECT * FROM "HumanResources"."LeaveTypes" t
               WHERE t."tenantId" = "vTenant" AND t."deletedAt" IS NULL AND t.status = 'ACTIVE' AND t."accrualMethod" IN ('MONTHLY', 'QUARTERLY', 'UPFRONT')
  LOOP
    -- a quarterly type accrues in months 1, 4, 7 and 10 of the leave year
    IF "vT"."accrualMethod" = 'QUARTERLY' AND ((extract(year FROM age("vMonth", "vYear")) * 12 + extract(month FROM age("vMonth", "vYear")))::int % 3) <> 0 THEN
      CONTINUE;
    END IF;
    FOR "vE" IN SELECT e.* FROM "HumanResources"."Employees" e
                 WHERE e."tenantId" = "vTenant" AND e."deletedAt" IS NULL AND e.status <> 'EXITED' AND e."joiningDate" <= "vEnd"
                   AND ("pEmployee" IS NULL OR e.id = "pEmployee")
                   AND ("vT".gender = 'ALL' OR e.gender = "vT".gender)
    LOOP
      -- branch / grade rules: an excluding rule skips the employee; an including rule may override the days
      SELECT bool_or(NOT r."isIncluded") AS excluded, max(r."daysOverride") FILTER (WHERE r."isIncluded") AS days INTO "vRule"
        FROM "HumanResources"."LeaveEligibilityRules" r
       WHERE r."tenantId" = "vTenant" AND r."leaveTypeId" = "vT".id
         AND ((r.scope = 'BRANCH' AND r."branchId" = "vE"."branchId") OR (r.scope = 'GRADE' AND r."gradeId" = "vE"."gradeId"));
      IF COALESCE("vRule".excluded, false) THEN
        CONTINUE;
      END IF;
      "vAnnual" := COALESCE("vRule".days, "vT"."daysPerYear");
      IF "vT"."accrualMethod" = 'MONTHLY' THEN
        "vEff" := "vMonth";
        "vAmount" := COALESCE("vT"."accrualAmount", round("vAnnual" / 12, 2));
        IF "vT"."prorateNewJoiners" AND "vE"."joiningDate" > "vMonth" THEN
          "vAmount" := round("vAmount" * ("vEnd" - "vE"."joiningDate" + 1) / ("vEnd" - "vMonth" + 1), 2);
        END IF;
        IF EXISTS (SELECT 1 FROM "HumanResources"."LeaveAdjustments" a WHERE a."tenantId" = "vTenant" AND a."employeeId" = "vE".id
                     AND a."leaveTypeId" = "vT".id AND a.kind = 'ACCRUAL' AND a."effectiveDate" = "vEff") THEN
          "vSkipped" := "vSkipped" + 1; CONTINUE;
        END IF;
      ELSIF "vT"."accrualMethod" = 'QUARTERLY' THEN
        "vEff" := "vMonth";
        "vQStart" := "vMonth";
        "vAmount" := COALESCE("vT"."accrualAmount", round("vAnnual" / 4, 2));
        IF "vT"."prorateNewJoiners" AND "vE"."joiningDate" > "vQStart" THEN
          "vAmount" := round("vAmount" * GREATEST(0, ("vQStart" + interval '3 months')::date - "vE"."joiningDate") / (("vQStart" + interval '3 months')::date - "vQStart"), 2);
        END IF;
        IF EXISTS (SELECT 1 FROM "HumanResources"."LeaveAdjustments" a WHERE a."tenantId" = "vTenant" AND a."employeeId" = "vE".id
                     AND a."leaveTypeId" = "vT".id AND a.kind = 'ACCRUAL' AND a."effectiveDate" = "vEff") THEN
          "vSkipped" := "vSkipped" + 1; CONTINUE;
        END IF;
      ELSE -- UPFRONT: once per leave year
        "vEff" := GREATEST("vYear", date_trunc('month', "vE"."joiningDate")::date);
        "vAmount" := "vAnnual";
        IF "vT"."prorateNewJoiners" AND "vE"."joiningDate" > "vYear" THEN
          -- months left in the leave year, counting the joining month; to the nearest half day
          "vAmount" := round("vAnnual" * (12 - (extract(year FROM age(date_trunc('month', "vE"."joiningDate")::date, "vYear")) * 12
                                              + extract(month FROM age(date_trunc('month', "vE"."joiningDate")::date, "vYear")))) / 12 * 2) / 2;
        END IF;
        IF EXISTS (SELECT 1 FROM "HumanResources"."LeaveAdjustments" a WHERE a."tenantId" = "vTenant" AND a."employeeId" = "vE".id
                     AND a."leaveTypeId" = "vT".id AND a.kind = 'ACCRUAL' AND a."leaveYearStart" = "vYear") THEN
          "vSkipped" := "vSkipped" + 1; CONTINUE;
        END IF;
      END IF;
      IF "vT"."accumulationCap" IS NOT NULL THEN
        SELECT COALESCE(b.balance, 0) INTO "vBal" FROM "HumanResources"."LeaveBalances" b
         WHERE b."tenantId" = "vTenant" AND b."employeeId" = "vE".id AND b."leaveTypeId" = "vT".id AND b."leaveYearStart" = "vYear";
        "vAmount" := LEAST("vAmount", "vT"."accumulationCap" - COALESCE("vBal", 0));
      END IF;
      IF "vAmount" IS NULL OR "vAmount" <= 0 THEN
        CONTINUE;
      END IF;
      INSERT INTO "HumanResources"."LeaveAdjustments" ("tenantId", "employeeId", "leaveTypeId", "leaveYearStart", kind, direction, days, "effectiveDate", reason)
      VALUES ("vTenant", "vE".id, "vT".id, "vYear", 'ACCRUAL', 'CREDIT', "vAmount", "vEff",
              CASE "vT"."accrualMethod" WHEN 'UPFRONT' THEN 'Entitlement ' || to_char("vYear", 'YYYY') || '-' || to_char("vYear" + interval '1 year', 'YY')
                                        ELSE 'Accrual ' || to_char("vMonth", 'Mon YYYY') END);
      "vCredited" := "vCredited" + 1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('credited', "vCredited", 'skipped', "vSkipped", 'leaveYearStart', "vYear");
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Year-end close. The plan per employee and type: unused = available (balance less pending days); carry forward
--    (CAPPED at carryForwardMax, UNLIMITED; never above the accumulation cap), encash the rest (YEAR_END, up to
--    encashMaxDays, amount = days × basic or gross ÷ 30 from the salary in force), lapse what is left.
--    Complete: CARRY_FORWARD credits in the opening year, ENCASHMENT / LAPSE debits in the closing year, all linked to
--    the closing. Reverse: compensating MANUAL entries (linked to the closing) for a completed close whose encashment
--    payroll hasn't consumed; payroll ignores encashment of a REVERSED close.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS "HumanResources"."leaveYearEndPlan"(date);
CREATE OR REPLACE FUNCTION "HumanResources"."leaveYearEndPlan"("pClosingYear" date, "pTenant" uuid DEFAULT NULL)
  RETURNS TABLE ("employeeId" uuid, "leaveTypeId" uuid, unused numeric, carry numeric, encash numeric, lapse numeric, "encashAmount" numeric, "carryExpiresOn" date)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  -- the preview runs outside a unit of work (no app.tenantId): the caller passes its tenant
  "vTenant" uuid := COALESCE("pTenant", NULLIF(current_setting('app.tenantId', true), '')::uuid);
  "vEnd"    date := ("pClosingYear" + interval '1 year - 1 day')::date;
BEGIN
  RETURN QUERY
  WITH b AS (
    SELECT lb."employeeId", lb."leaveTypeId", GREATEST(lb.available, 0) AS unused, t."carryForwardMode", t."carryForwardMax", t."accumulationCap",
           t."carryExpiryMonths", t."encashmentMode", t."encashMaxDays", t."encashBasis"
      FROM "HumanResources"."LeaveBalances" lb
      JOIN "HumanResources"."LeaveTypes" t ON t."tenantId" = lb."tenantId" AND t.id = lb."leaveTypeId"
     WHERE lb."tenantId" = "vTenant" AND lb."leaveYearStart" = "pClosingYear" AND lb.available > 0
  ), c AS (
    SELECT b.*, LEAST(b.unused,
             CASE b."carryForwardMode" WHEN 'UNLIMITED' THEN b.unused WHEN 'CAPPED' THEN COALESCE(b."carryForwardMax", 0) ELSE 0 END,
             COALESCE(b."accumulationCap", b.unused)) AS cf
      FROM b
  ), e AS (
    SELECT c.*, CASE WHEN c."encashmentMode" = 'YEAR_END' THEN LEAST(c.unused - c.cf, COALESCE(c."encashMaxDays", c.unused - c.cf)) ELSE 0 END AS en
      FROM c
  )
  SELECT e."employeeId", e."leaveTypeId", e.unused, e.cf, e.en, e.unused - e.cf - e.en,
         round(e.en * COALESCE((SELECT CASE WHEN e."encashBasis" = 'GROSS_DIV_30' THEN s."grossAmount" ELSE s."basicAmount" END
                                  FROM "Payroll"."EmployeeSalaries" s
                                 WHERE s."tenantId" = "vTenant" AND s."employeeId" = e."employeeId" AND s."effectiveFrom" <= "vEnd"
                                   AND (s."effectiveTo" IS NULL OR s."effectiveTo" >= "vEnd")
                                 ORDER BY s."effectiveFrom" DESC LIMIT 1), 0) / 30, 2),
         CASE WHEN e."carryExpiryMonths" IS NOT NULL AND e.cf > 0
              THEN ("pClosingYear" + interval '1 year' + make_interval(months => e."carryExpiryMonths") - interval '1 day')::date END
    FROM e;
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."leaveYearEndClosingComplete"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    "HumanResources"."LeaveYearEndClosings";
  "vP"      record;
  "vLabel"  text;
  "vEmps"   uuid[] := '{}';
  "vCarry"  numeric := 0;
  "vEncash" numeric := 0;
  "vLapse"  numeric := 0;
  "vAmount" numeric := 0;
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."LeaveYearEndClosings" t WHERE t.id = "pId" AND t."tenantId" = "vTenant" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LeaveYearEndClosings % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status <> 'DRAFT' THEN
    RAISE EXCEPTION 'This year-end close is already %', lower("vRow".status) USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'LEAVE_YEAR_CLOSED';
  END IF;
  IF EXISTS (SELECT 1 FROM "HumanResources"."LeaveYearEndClosings" x WHERE x."tenantId" = "vTenant" AND x."closingYearStart" = "vRow"."closingYearStart" AND x.status = 'COMPLETED') THEN
    RAISE EXCEPTION 'Leave year % is already closed', to_char("vRow"."closingYearStart", 'YYYY') USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'LEAVE_YEAR_CLOSED';
  END IF;
  "vLabel" := to_char("vRow"."closingYearStart", 'YYYY') || '-' || to_char("vRow"."openingYearStart", 'YY');
  FOR "vP" IN SELECT * FROM "HumanResources"."leaveYearEndPlan"("vRow"."closingYearStart") LOOP
    "vEmps" := array_append("vEmps", "vP"."employeeId");
    "vCarry" := "vCarry" + "vP".carry; "vEncash" := "vEncash" + "vP".encash; "vLapse" := "vLapse" + "vP".lapse; "vAmount" := "vAmount" + "vP"."encashAmount";
    IF "vP".carry > 0 THEN
      INSERT INTO "HumanResources"."LeaveAdjustments" ("tenantId", "employeeId", "leaveTypeId", "leaveYearStart", kind, direction, days, "effectiveDate", reason, "leaveYearCloseId")
      VALUES ("vTenant", "vP"."employeeId", "vP"."leaveTypeId", "vRow"."openingYearStart", 'CARRY_FORWARD', 'CREDIT', "vP".carry, "vRow"."openingYearStart", 'Carried forward from ' || "vLabel", "pId");
      UPDATE "HumanResources"."LeaveBalances" b SET "carriedExpiresOn" = "vP"."carryExpiresOn"
       WHERE b."tenantId" = "vTenant" AND b."employeeId" = "vP"."employeeId" AND b."leaveTypeId" = "vP"."leaveTypeId" AND b."leaveYearStart" = "vRow"."openingYearStart"
         AND "vP"."carryExpiresOn" IS NOT NULL;
    END IF;
    IF "vP".encash > 0 THEN
      INSERT INTO "HumanResources"."LeaveAdjustments" ("tenantId", "employeeId", "leaveTypeId", "leaveYearStart", kind, direction, days, "effectiveDate", reason, "leaveYearCloseId", "encashAmount", "payrollRunId")
      VALUES ("vTenant", "vP"."employeeId", "vP"."leaveTypeId", "vRow"."closingYearStart", 'ENCASHMENT', 'DEBIT', "vP".encash, "vRow"."openingYearStart" - 1, 'Encashed at year-end ' || "vLabel", "pId", "vP"."encashAmount", "vRow"."payrollRunId");
    END IF;
    IF "vP".lapse > 0 THEN
      INSERT INTO "HumanResources"."LeaveAdjustments" ("tenantId", "employeeId", "leaveTypeId", "leaveYearStart", kind, direction, days, "effectiveDate", reason, "leaveYearCloseId")
      VALUES ("vTenant", "vP"."employeeId", "vP"."leaveTypeId", "vRow"."closingYearStart", 'LAPSE', 'DEBIT', "vP".lapse, "vRow"."openingYearStart" - 1, 'Lapsed at year-end ' || "vLabel", "pId");
    END IF;
  END LOOP;
  UPDATE "HumanResources"."LeaveYearEndClosings" t
     SET status = 'COMPLETED', "completedAt" = now(), "completedByUserId" = "Company"."getCurrentUserId"(),
         "employeesCount" = (SELECT count(DISTINCT x) FROM unnest("vEmps") x),
         "daysCarried" = "vCarry", "daysEncashed" = "vEncash", "daysLapsed" = "vLapse", "encashAmount" = "vAmount"
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."leaveYearEndClosingReverse"("pId" uuid, "pReason" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    "HumanResources"."LeaveYearEndClosings";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."LeaveYearEndClosings" t WHERE t.id = "pId" AND t."tenantId" = "vTenant" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LeaveYearEndClosings % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'REVERSED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Only a completed year-end close can be reversed (this one is a draft)'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'LEAVE_YEAR_CLOSE_NOT_COMPLETED';
  END IF;
  IF EXISTS (SELECT 1 FROM "HumanResources"."LeaveAdjustments" a WHERE a."tenantId" = "vTenant" AND a."leaveYearCloseId" = "pId" AND a.kind = 'ENCASHMENT'
               AND a."payrollRunId" IS NOT NULL AND EXISTS (SELECT 1 FROM "Payroll"."PayrollRuns" r WHERE r."tenantId" = "vTenant" AND r.id = a."payrollRunId" AND r.status NOT IN ('DRAFT'))) THEN
    RAISE EXCEPTION 'Payroll has already processed this close''s encashment' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'LEAVE_YEAR_CLOSE_NOT_COMPLETED';
  END IF;
  -- each kind has a fixed direction (LeaveAdjustmentKind parentCodes), so the compensating entries are MANUAL ones
  INSERT INTO "HumanResources"."LeaveAdjustments" ("tenantId", "employeeId", "leaveTypeId", "leaveYearStart", kind, direction, days, "effectiveDate", reason, "leaveYearCloseId")
  SELECT a."tenantId", a."employeeId", a."leaveTypeId", a."leaveYearStart", 'MANUAL', CASE a.direction WHEN 'CREDIT' THEN 'DEBIT' ELSE 'CREDIT' END, a.days, current_date,
         'Reversal: ' || a.reason || COALESCE(' (' || NULLIF(btrim("pReason"), '') || ')', ''), a."leaveYearCloseId"
    FROM "HumanResources"."LeaveAdjustments" a
   WHERE a."tenantId" = "vTenant" AND a."leaveYearCloseId" = "pId" AND a.kind <> 'MANUAL';
  UPDATE "HumanResources"."LeaveYearEndClosings" t SET status = 'REVERSED' WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 7. Onboardings: start from a template (tasks with due dates from the template offsets, owners from the joiner's
--    manager / buddy / the joiner), task updates that move the onboarding along, cancel only while open.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."onboardingFromTemplate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant"  uuid := "Company"."getCurrentTenantId"();
  "vEmp"     "HumanResources"."Employees";
  "vTpl"     "HumanResources"."OnboardingTemplates";
  "vTrack"   text := NULLIF("pData" ->> 'track', '');
  "vJoin"    date;
  "vStart"   date := COALESCE(NULLIF("pData" ->> 'startDate', '')::date, current_date);
  "vTarget"  date := NULLIF("pData" ->> 'targetDate', '')::date;
  "vBuddy"   uuid := NULLIF("pData" ->> 'buddyEmployeeId', '')::uuid;
  "vId"      uuid;
BEGIN
  SELECT * INTO "vEmp" FROM "HumanResources"."Employees" e WHERE e."tenantId" = "vTenant" AND e.id = NULLIF("pData" ->> 'employeeId', '')::uuid AND e."deletedAt" IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF NULLIF("pData" ->> 'templateId', '') IS NOT NULL THEN
    SELECT * INTO "vTpl" FROM "HumanResources"."OnboardingTemplates" t WHERE t."tenantId" = "vTenant" AND t.id = ("pData" ->> 'templateId')::uuid AND t."deletedAt" IS NULL AND t."isActive";
  ELSE
    SELECT * INTO "vTpl" FROM "HumanResources"."OnboardingTemplates" t WHERE t."tenantId" = "vTenant" AND t.track = COALESCE("vTrack", 'NEW_JOINER') AND t."isDefault" AND t."deletedAt" IS NULL AND t."isActive";
  END IF;
  IF "vTpl".id IS NULL THEN
    RAISE EXCEPTION 'Choose an active onboarding template' USING ERRCODE = 'check_violation', HINT = 'ONBOARDING_TEMPLATE_INVALID';
  END IF;
  "vTrack" := COALESCE("vTrack", "vTpl".track);
  "vJoin" := COALESCE(NULLIF("pData" ->> 'joiningDate', '')::date, "vEmp"."joiningDate");
  IF "vTarget" IS NULL THEN
    SELECT "vJoin" + GREATEST(30, COALESCE(max(x."dueOffsetDays"), 0)) INTO "vTarget"
      FROM "HumanResources"."OnboardingTemplateTasks" x WHERE x."tenantId" = "vTenant" AND x."templateId" = "vTpl".id;
  END IF;
  "vTarget" := GREATEST("vTarget", "vStart");
  BEGIN
    INSERT INTO "HumanResources"."Onboardings" ("tenantId", "docNo", "employeeId", "templateId", track, "designationId", "joiningDate", "startDate", "targetDate", "buddyEmployeeId", status)
    VALUES ("vTenant", "Company"."getNextDocNo"('ONB', current_date, NULL), "vEmp".id, "vTpl".id, "vTrack",
            COALESCE(NULLIF("pData" ->> 'designationId', '')::uuid, "vEmp"."designationId"), "vJoin", "vStart", "vTarget", "vBuddy",
            CASE WHEN "vJoin" > current_date THEN 'PRE_JOINING' ELSE 'IN_PROGRESS' END)
    RETURNING id INTO "vId";
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This employee already has an open onboarding on this track' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'ONBOARDING_OPEN_EXISTS';
  END;
  INSERT INTO "HumanResources"."OnboardingTasks" ("tenantId", "onboardingId", "templateTaskId", "taskGroup", title, description, "ownerFunction", "ownerEmployeeId", "dueOn", "actionKind", "sortOrder")
  SELECT "vTenant", "vId", x.id, x."taskGroup", x.title, x.description, x."ownerFunction",
         CASE x."ownerFunction" WHEN 'MANAGER' THEN "vEmp"."reportingManagerId" WHEN 'BUDDY' THEN "vBuddy" WHEN 'EMPLOYEE' THEN "vEmp".id END,
         "vJoin" + x."dueOffsetDays", x."actionKind", (row_number() OVER (ORDER BY x."sortOrder", x."createdAt"))::smallint
    FROM "HumanResources"."OnboardingTemplateTasks" x
   WHERE x."tenantId" = "vTenant" AND x."templateId" = "vTpl".id;
  RETURN "vId";
END $function$;

-- The onboarding's status follows its tasks: COMPLETED when every task is completed or skipped, else IN_PROGRESS from
-- the joining date (PRE_JOINING before it).
CREATE OR REPLACE FUNCTION "HumanResources"."onboardingRefreshStatus"("pId" uuid)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vNew"    text;
BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM "HumanResources"."OnboardingTasks" k WHERE k."tenantId" = "vTenant" AND k."onboardingId" = o.id)
                   AND NOT EXISTS (SELECT 1 FROM "HumanResources"."OnboardingTasks" k WHERE k."tenantId" = "vTenant" AND k."onboardingId" = o.id AND k.status NOT IN ('COMPLETED', 'SKIPPED'))
              THEN 'COMPLETED'
              WHEN o."joiningDate" <= current_date OR EXISTS (SELECT 1 FROM "HumanResources"."OnboardingTasks" k WHERE k."tenantId" = "vTenant" AND k."onboardingId" = o.id AND k.status <> 'NOT_STARTED')
              THEN 'IN_PROGRESS' ELSE 'PRE_JOINING' END
    INTO "vNew"
    FROM "HumanResources"."Onboardings" o WHERE o."tenantId" = "vTenant" AND o.id = "pId" AND o.status IN ('PRE_JOINING', 'IN_PROGRESS', 'COMPLETED');
  IF "vNew" IS NOT NULL THEN
    UPDATE "HumanResources"."Onboardings" o
       SET status = "vNew", "completedAt" = CASE WHEN "vNew" = 'COMPLETED' THEN COALESCE(o."completedAt", now()) END
     WHERE o."tenantId" = "vTenant" AND o.id = "pId" AND o.status IS DISTINCT FROM "vNew";
  END IF;
  RETURN "vNew";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."onboardingTaskUpdate"("pId" uuid, "pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vTask"   "HumanResources"."OnboardingTasks";
  "vRec"    "HumanResources"."OnboardingTasks";
  "vObStat" text;
  "vStatus" text;
  "vRet"    uuid;
BEGIN
  SELECT * INTO "vTask" FROM "HumanResources"."OnboardingTasks" k WHERE k."tenantId" = "vTenant" AND k.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding task % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  SELECT o.status INTO "vObStat" FROM "HumanResources"."Onboardings" o WHERE o."tenantId" = "vTenant" AND o.id = "vTask"."onboardingId";
  IF "vObStat" = 'COMPLETED' AND "vTask".status = COALESCE("pData" ->> 'status', "vTask".status) THEN
    RETURN "pId";                                   -- idempotent: a done task of a completed onboarding
  END IF;
  IF "vObStat" = 'CANCELLED' OR ("vObStat" = 'COMPLETED' AND NOT ("pData" ? 'status' AND "pData" ->> 'status' NOT IN ('COMPLETED', 'SKIPPED'))) THEN
    RAISE EXCEPTION 'This onboarding is %', lower("vObStat") USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'ONBOARDING_CLOSED';
  END IF;
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."OnboardingTasks", "pData");
  "vStatus" := CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE "vTask".status END;
  UPDATE "HumanResources"."OnboardingTasks" t
     SET status = "vStatus",
         "progressPct" = CASE WHEN "vStatus" = 'COMPLETED' THEN 100
                              WHEN "pData" ? 'progressPct' THEN LEAST(COALESCE("vRec"."progressPct", 0), 99)
                              WHEN t.status = 'COMPLETED' THEN 0 ELSE t."progressPct" END,
         "ownerEmployeeId" = CASE WHEN "pData" ? 'ownerEmployeeId' THEN "vRec"."ownerEmployeeId" ELSE t."ownerEmployeeId" END,
         "dueOn" = CASE WHEN "pData" ? 'dueOn' THEN "vRec"."dueOn" ELSE t."dueOn" END,
         "scheduledAt" = CASE WHEN "pData" ? 'scheduledAt' THEN "vRec"."scheduledAt" ELSE t."scheduledAt" END,
         "attachmentId" = CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE t."attachmentId" END,
         "completionNote" = CASE WHEN "pData" ? 'completionNote' THEN "vRec"."completionNote" ELSE t."completionNote" END,
         "completedAt" = CASE WHEN "vStatus" = 'COMPLETED' THEN COALESCE(t."completedAt", now()) END,
         "completedByUserId" = CASE WHEN "vStatus" = 'COMPLETED' THEN COALESCE(t."completedByUserId", "Company"."getCurrentUserId"()) END
   WHERE t.id = "pId" AND t."tenantId" = "vTenant"
     AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
  RETURNING t.id INTO "vRet";
  IF "vRet" IS NULL THEN
    RAISE EXCEPTION 'OnboardingTasks %: record was changed by another user, reload and try again', "pId" USING ERRCODE = 'serialization_failure';
  END IF;
  PERFORM "HumanResources"."onboardingRefreshStatus"("vTask"."onboardingId");
  RETURN "vRet";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."onboardingCancel"("pId" uuid, "pReason" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "HumanResources"."Onboardings";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."Onboardings" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboardings % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PRE_JOINING', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'Onboarding %: a % onboarding can''t be cancelled', "vRow"."docNo", lower("vRow".status)
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'ONBOARDING_CLOSED';
  END IF;
  UPDATE "HumanResources"."Onboardings" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 8. Offboardings: clear / waive a clearance item; complete (every item cleared or waived → employee EXITED, the
--    linked login suspended — never the company's default user); withdraw while open.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."clearanceItemClear"("pId" uuid, "pStatus" text, "pRemarks" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vItem"   "HumanResources"."ClearanceItems";
  "vStat"   text;
BEGIN
  IF "pStatus" NOT IN ('CLEARED', 'WAIVED') THEN
    RAISE EXCEPTION 'A clearance item is cleared or waived' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO "vItem" FROM "HumanResources"."ClearanceItems" c WHERE c."tenantId" = "vTenant" AND c.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clearance item % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  SELECT o.status INTO "vStat" FROM "HumanResources"."Offboardings" o WHERE o."tenantId" = "vTenant" AND o.id = "vItem"."offboardingId";
  IF "vStat" IN ('CLOSED', 'WITHDRAWN') THEN
    RAISE EXCEPTION 'This exit is %', lower("vStat") USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'OFFBOARDING_CLOSED';
  END IF;
  UPDATE "HumanResources"."ClearanceItems" c
     SET status = "pStatus", "clearedAt" = now(), "clearedByUserId" = "Company"."getCurrentUserId"(), remarks = COALESCE(NULLIF(btrim("pRemarks"), ''), c.remarks)
   WHERE c.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."offboardingComplete"("pId" uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant"  uuid := "Company"."getCurrentTenantId"();
  "vRow"     "HumanResources"."Offboardings";
  "vEmp"     "HumanResources"."Employees";
  "vPending" integer;
  "vUsers"   uuid[];
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."Offboardings" o WHERE o."tenantId" = "vTenant" AND o.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offboardings % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status IN ('CLOSED', 'WITHDRAWN') THEN
    RAISE EXCEPTION 'This exit is already %', lower("vRow".status) USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'OFFBOARDING_CLOSED';
  END IF;
  SELECT count(*) INTO "vPending" FROM "HumanResources"."ClearanceItems" c WHERE c."tenantId" = "vTenant" AND c."offboardingId" = "pId" AND c.status = 'PENDING';
  IF "vPending" > 0 THEN
    RAISE EXCEPTION '% clearance item(s) are still pending', "vPending" USING ERRCODE = 'check_violation', HINT = 'OFFBOARDING_CLEARANCE_PENDING';
  END IF;
  SELECT * INTO "vEmp" FROM "HumanResources"."Employees" e WHERE e."tenantId" = "vTenant" AND e.id = "vRow"."employeeId" FOR UPDATE;
  SELECT array_agg(DISTINCT u.id) INTO "vUsers" FROM "Company"."Users" u
   WHERE u."tenantId" = "vTenant" AND u."deletedAt" IS NULL AND (u.id = "vEmp"."appUserId" OR u."employeeId" = "vEmp".id);
  IF EXISTS (SELECT 1 FROM unnest(COALESCE("vUsers", '{}'::uuid[])) x WHERE "Platform"."isDefaultUser"("vTenant", x)) THEN
    RAISE EXCEPTION 'This employee''s login is the company''s default user, which always stays active'
      USING ERRCODE = 'check_violation', HINT = 'TENANT_DEFAULT_USER_LOCKED';
  END IF;
  UPDATE "HumanResources"."Employees" e
     SET status = 'EXITED', "exitDate" = "vRow"."lastWorkingDay", "exitType" = "vRow"."exitType"
   WHERE e."tenantId" = "vTenant" AND e.id = "vEmp".id;
  UPDATE "Company"."Users" u SET status = 'SUSPENDED', "suspendedAt" = now()
   WHERE u."tenantId" = "vTenant" AND u.id = ANY (COALESCE("vUsers", '{}'::uuid[])) AND u.status NOT IN ('SUSPENDED', 'REMOVED');
  UPDATE "HumanResources"."Offboardings" o SET status = 'CLOSED', "closedAt" = now() WHERE o.id = "pId";
  RETURN jsonb_build_object('id', "pId", 'suspendedUserIds', to_jsonb(COALESCE("vUsers", '{}'::uuid[])));
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."offboardingWithdraw"("pId" uuid, "pReason" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "HumanResources"."Offboardings";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."Offboardings" o WHERE o."tenantId" = "Company"."getCurrentTenantId"() AND o.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offboardings % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'WITHDRAWN' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status = 'CLOSED' THEN
    RAISE EXCEPTION 'A completed exit can''t be withdrawn' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'OFFBOARDING_CLOSED';
  END IF;
  UPDATE "HumanResources"."Offboardings" o
     SET status = 'WITHDRAWN', remarks = concat_ws(E'\n', NULLIF(o.remarks, ''), 'Withdrawn' || COALESCE(': ' || NULLIF(btrim("pReason"), ''), ''))
   WHERE o.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 9. Every company: LV / ONB / OFF numbering and the default leave approval workflows. Each leave type's own chain
--    (LeaveTypes.approvalWorkflow, raised to MANAGER_HR above hrApprovalAboveDays) is the LEAVE_APPROVAL fact the app
--    routes on: one editable workflow per chain. Nothing is replaced once it exists.
-- ---------------------------------------------------------------------------
INSERT INTO "Lookups"."Lookups" ("lookupType", code, label, tone, "sortOrder", "isActive", "isSystem")
VALUES ('ApprovalWorkflowConditionField', 'LEAVE_APPROVAL', 'Leave approval chain', 'neutral', 20, true, true)
ON CONFLICT ("lookupType", code, "tenantId") DO NOTHING;

CREATE OR REPLACE FUNCTION "HumanResources"."seedLeaveLifecycleDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vN"     integer;
  "vWf"    uuid;
  "vHr"    uuid;
  "vAdmin" uuid;
  "w"      record;
BEGIN
  INSERT INTO "Company"."NumberingSeries" ("tenantId", "docType", "branchId", prefix, pattern, padding, "startValue", "resetPolicy", "isActive")
  SELECT "pTenant", d.code, NULL, d."defaultPrefix", d."defaultPattern", d."defaultPadding", 1, d."defaultResetPolicy", true
    FROM "Company"."DocumentTypes" d
   WHERE d.code IN ('LV', 'ONB', 'OFF')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;

  SELECT r.id INTO "vHr" FROM "Company"."Roles" r WHERE r."tenantId" = "pTenant" AND r."systemKey" = 'HR_MANAGER' LIMIT 1;
  SELECT r.id INTO "vAdmin" FROM "Company"."Roles" r WHERE r."tenantId" = "pTenant" AND r."systemKey" = 'ADMIN' LIMIT 1;
  IF "vHr" IS NULL OR "vAdmin" IS NULL
     OR EXISTS (SELECT 1 FROM "Company"."ApprovalWorkflows" x WHERE x."tenantId" = "pTenant" AND x.subject = 'LEAVE_REQUEST' AND x."deletedAt" IS NULL) THEN
    RETURN "vN";
  END IF;
  FOR "w" IN SELECT * FROM (VALUES
      ('MANAGER',        'Leave — line manager',            'Default for leave types approved by the line manager only. Edit as needed.', 1),
      ('MANAGER_HR',     'Leave — line manager, then HR',   'Default for leave types approved by the line manager, then HR (also longer requests of manager-only types).', 2),
      ('MANAGER_HR_CEO', 'Leave — line manager, HR, CEO',   'Default for leave types that end with the CEO (an Admin). Edit as needed.', 3),
      ('HR',             'Leave — HR only',                 'Default for leave types HR approves directly. Edit as needed.', 4)) v(chain, name, description, n)
  LOOP
    IF EXISTS (SELECT 1 FROM "Company"."ApprovalWorkflows" x WHERE x."tenantId" = "pTenant" AND x.name = "w".name) THEN
      CONTINUE;
    END IF;
    INSERT INTO "Company"."ApprovalWorkflows" ("tenantId", name, subject, description, status, version, priority, "onComplete", "onReject",
                                              "notifyPreparer", "notifyInApp", "notifyEmail", "notifyWhatsapp", "publishedAt")
    VALUES ("pTenant", "w".name, 'LEAVE_REQUEST', "w".description, 'ACTIVE', 1, 100 + "w".n, 'MARK_APPROVED', 'RETURN_TO_PREPARER', true, true, false, false, now())
    RETURNING id INTO "vWf";
    INSERT INTO "Company"."ApprovalWorkflowConditions" ("tenantId", "workflowId", seq, field, operator, value)
    VALUES ("pTenant", "vWf", 1, 'LEAVE_APPROVAL', 'EQ', to_jsonb("w".chain));
    INSERT INTO "Company"."ApprovalWorkflowSteps" ("tenantId", "workflowId", "stepNo", name, "approverType", "approverRoleId", "slaHours", "onSlaBreach",
                                                  "approvalMode", "blockSelfApproval", "allowDelegation", "requireComment")
    SELECT "pTenant", "vWf", row_number() OVER (ORDER BY s.n), s.name, s.kind, s.role, s.sla, 'REMIND', 'ANY', true, true, false
      FROM (VALUES (1, 'Line manager', 'LINE_MANAGER', NULL::uuid, 24, "w".chain IN ('MANAGER', 'MANAGER_HR', 'MANAGER_HR_CEO')),
                   (2, 'HR', 'ROLE', "vHr", 48, "w".chain IN ('MANAGER_HR', 'MANAGER_HR_CEO', 'HR')),
                   (3, 'CEO', 'ROLE', "vAdmin", 48, "w".chain = 'MANAGER_HR_CEO')) s(n, name, kind, role, sla, used)
     WHERE s.used;
    "vN" := "vN" + 1;
  END LOOP;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."triggerTenantLeaveLifecycleDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "HumanResources"."seedLeaveLifecycleDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

-- after the tenant's roles exist (provisionTenant creates them in the same transaction): deferred to the end of it
DROP TRIGGER IF EXISTS "tenantsLeaveLifecycleDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsLeaveLifecycleDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "HumanResources"."triggerTenantLeaveLifecycleDefaults"();

SELECT set_config('app.actorLabel', 'seedLeaveLifecycleDefaultsFor', false);
SELECT "HumanResources"."seedLeaveLifecycleDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '202-leave-lifecycle.sql', false);

-- ---------------------------------------------------------------------------
-- 10. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('LEAVE_NOT_PENDING',              409, 'BUSINESS_RULE', 'HR', 'This leave request is no longer pending.', 'Edit or decision on a leave request that was already decided or cancelled', true, NULL),
  ('LEAVE_OVERLAP',                  409, 'BUSINESS_RULE', 'HR', 'These dates overlap another pending or approved leave.', 'Leave request overlapping the employee''s pending / approved leave', true, NULL),
  ('LEAVE_INSUFFICIENT_BALANCE',     400, 'VALIDATION',    'HR', 'Not enough leave balance for this request.', 'Requested (pending) days or an adjustment would take a paid leave type''s balance below zero', true, NULL),
  ('LEAVE_POLICY_VIOLATION',         400, 'VALIDATION',    'HR', 'This request breaks the leave type''s rules.', 'Notice, backdating, half-day, consecutive-days, monthly limit or eligibility rule of the leave type', true, NULL),
  ('LEAVE_ALREADY_ACCRUED',          409, 'BUSINESS_RULE', 'HR', 'Leave for that month is already accrued.', 'Accrual run for a month every eligible employee was already credited for', true, NULL),
  ('LEAVE_ADJUSTMENT_INVALID',       400, 'VALIDATION',    'HR', 'Check the adjustment: kind, direction, reason or comp-off claim.', 'Manual leave adjustment with a kind / direction not allowed by hand, no reason or an invalid comp-off claim', true, NULL),
  ('LEAVE_COMP_OFF_USED',            409, 'BUSINESS_RULE', 'HR', 'That overtime claim is already credited as comp-off.', 'Second comp-off credit for the same overtime claim', true, NULL),
  ('LEAVE_YEAR_CLOSED',              409, 'BUSINESS_RULE', 'HR', 'That leave year is already closed.', 'Year-end close for a year with a completed close, or completing a closed close', true, NULL),
  ('LEAVE_YEAR_CLOSE_NOT_COMPLETED', 409, 'BUSINESS_RULE', 'HR', 'Only a completed year-end close can be reversed.', 'Reversal of a draft close, or of one whose encashment payroll already processed', true, NULL),
  ('ONBOARDING_OPEN_EXISTS',         409, 'BUSINESS_RULE', 'HR', 'This employee already has an open onboarding.', 'Second open onboarding for the same employee and track', true, NULL),
  ('ONBOARDING_TEMPLATE_INVALID',    400, 'VALIDATION',    'HR', 'Choose an active onboarding template.', 'Onboarding started without an active template (or no default for the track)', true, NULL),
  ('ONBOARDING_CLOSED',              409, 'BUSINESS_RULE', 'HR', 'This onboarding is completed or cancelled.', 'Change to a completed / cancelled onboarding or its tasks', true, NULL),
  ('OFFBOARDING_OPEN_EXISTS',        409, 'BUSINESS_RULE', 'HR', 'This employee already has an exit in progress.', 'Second open offboarding for the same employee', true, NULL),
  ('OFFBOARDING_CLOSED',             409, 'BUSINESS_RULE', 'HR', 'This exit is closed or withdrawn.', 'Change to a closed / withdrawn offboarding', true, NULL),
  ('OFFBOARDING_CLEARANCE_PENDING',  409, 'BUSINESS_RULE', 'HR', 'Clear or waive every clearance item before completing the exit.', 'Offboarding completion with pending clearance items', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
