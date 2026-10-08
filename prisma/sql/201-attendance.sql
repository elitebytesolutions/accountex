-- Phase 30 — Time & attendance: row history on punches and rosters, fixed approve / cancel / AddUpdate functions,
-- punch insert, register build / lock / unlock, roster publish, open-shift claim, REG / OT / SW numbering for every
-- company, approval subjects with a default workflow each (line manager, then HR), error codes. Idempotent.
SELECT set_config('app.actorLabel', '201-attendance.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Row history. AttendancePunches is partitioned by month: its row trigger is cloned onto every partition, so the
--    audit entry names the parent table explicitly (TG_TABLE_NAME would be the partition).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."triggerAuditAttendancePunch"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Company"."writeAuditEntry"(TG_OP, 'HumanResources', 'AttendancePunches',
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
    NULL);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "attendancePunchesAudit" ON "HumanResources"."AttendancePunches";
CREATE TRIGGER "attendancePunchesAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."AttendancePunches"
  FOR EACH ROW EXECUTE FUNCTION "HumanResources"."triggerAuditAttendancePunch"();
DROP TRIGGER IF EXISTS "shiftRostersAudit" ON "HumanResources"."ShiftRosters";
CREATE TRIGGER "shiftRostersAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."ShiftRosters"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- The day lock names its catalogue code (locked days change only by unlocking first).
CREATE OR REPLACE FUNCTION "HumanResources"."triggerAttendanceDayLock"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD."lockedAt" IS NOT NULL AND (TG_OP = 'DELETE' OR NEW."lockedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'Attendance for % on % is locked for payroll', OLD."employeeId", OLD."attDate"
      USING ERRCODE = 'check_violation', HINT = 'ATTENDANCE_DAY_LOCKED';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $function$;

-- Open-shift capacity: a claim beyond the slots (or on a shift that is no longer open) names OPEN_SHIFT_FULL.
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."triggerOpenShiftClaimSlots"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  "vShift" record;
  "vTaken" integer;
BEGIN
  IF NEW.status NOT IN ('REQUESTED','CONFIRMED') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'REQUESTED' AND NEW.status = 'CONFIRMED' THEN
    RETURN NEW;                                     -- confirming a held slot takes nothing new
  END IF;
  SELECT s."slotsTotal", s.status INTO "vShift"
    FROM "EmployeeSelfService"."OpenShifts" s
   WHERE s."tenantId" = NEW."tenantId" AND s.id = NEW."openShiftId"
   FOR UPDATE;
  IF "vShift".status <> 'OPEN' THEN
    RAISE EXCEPTION 'This open shift is %, it can no longer be picked up', lower("vShift".status)
      USING ERRCODE = 'check_violation', HINT = 'OPEN_SHIFT_FULL';
  END IF;
  SELECT count(*) INTO "vTaken"
    FROM "EmployeeSelfService"."OpenShiftClaims" c
   WHERE c."tenantId" = NEW."tenantId" AND c."openShiftId" = NEW."openShiftId"
     AND c.status IN ('REQUESTED','CONFIRMED') AND c.id <> NEW.id;
  IF "vTaken" >= "vShift"."slotsTotal" THEN
    RAISE EXCEPTION 'No slots left on this open shift'
      USING ERRCODE = 'check_violation', HINT = 'OPEN_SHIFT_FULL';
  END IF;
  RETURN NEW;
END $function$;

-- ---------------------------------------------------------------------------
-- 2. AddUpdate: only a pending request / claim, an unanswered swap or an unpublished roster day can be edited.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."regularisationRequestAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."RegularisationRequests";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."RegularisationRequests", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('REG', current_date, NULL);
    END IF;
    INSERT INTO "HumanResources"."RegularisationRequests" ("tenantId", "docNo", "employeeId", "requestType", "punchDirection", "attDate", "requestedIn", "requestedOut", reason, "attachmentId", "linkedDeviceId", channel, stage, "currentApproverEmployeeId", "approvalRequestId", "rejectionReason", "decisionComment", "markAbsentIfUnresolved")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'requestType' THEN "vRec"."requestType" ELSE NULL END, CASE WHEN "pData" ? 'punchDirection' THEN "vRec"."punchDirection" ELSE NULL END, CASE WHEN "pData" ? 'attDate' THEN "vRec"."attDate" ELSE NULL END, CASE WHEN "pData" ? 'requestedIn' THEN "vRec"."requestedIn" ELSE NULL END, CASE WHEN "pData" ? 'requestedOut' THEN "vRec"."requestedOut" ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE NULL END, CASE WHEN "pData" ? 'linkedDeviceId' THEN "vRec"."linkedDeviceId" ELSE NULL END, CASE WHEN "pData" ? 'channel' THEN "vRec".channel ELSE 'ESS_WEB' END, CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE 'LINE_MANAGER' END, CASE WHEN "pData" ? 'currentApproverEmployeeId' THEN "vRec"."currentApproverEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE NULL END, CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE NULL END, CASE WHEN "pData" ? 'decisionComment' THEN "vRec"."decisionComment" ELSE NULL END, CASE WHEN "pData" ? 'markAbsentIfUnresolved' THEN "vRec"."markAbsentIfUnresolved" ELSE FALSE END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "HumanResources"."RegularisationRequests" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS NOT NULL AND "vStatus" <> 'PENDING' THEN
      RAISE EXCEPTION 'Only a pending request can be changed (this one is %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REQUEST_NOT_PENDING';
    END IF;
    UPDATE "HumanResources"."RegularisationRequests" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "requestType" = CASE WHEN "pData" ? 'requestType' THEN "vRec"."requestType" ELSE t."requestType" END,
           "punchDirection" = CASE WHEN "pData" ? 'punchDirection' THEN "vRec"."punchDirection" ELSE t."punchDirection" END,
           "attDate" = CASE WHEN "pData" ? 'attDate' THEN "vRec"."attDate" ELSE t."attDate" END,
           "requestedIn" = CASE WHEN "pData" ? 'requestedIn' THEN "vRec"."requestedIn" ELSE t."requestedIn" END,
           "requestedOut" = CASE WHEN "pData" ? 'requestedOut' THEN "vRec"."requestedOut" ELSE t."requestedOut" END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           "attachmentId" = CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE t."attachmentId" END,
           "linkedDeviceId" = CASE WHEN "pData" ? 'linkedDeviceId' THEN "vRec"."linkedDeviceId" ELSE t."linkedDeviceId" END,
           channel = CASE WHEN "pData" ? 'channel' THEN "vRec".channel ELSE t.channel END,
           stage = CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE t.stage END,
           "currentApproverEmployeeId" = CASE WHEN "pData" ? 'currentApproverEmployeeId' THEN "vRec"."currentApproverEmployeeId" ELSE t."currentApproverEmployeeId" END,
           "approvalRequestId" = CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE t."approvalRequestId" END,
           "rejectionReason" = CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE t."rejectionReason" END,
           "decisionComment" = CASE WHEN "pData" ? 'decisionComment' THEN "vRec"."decisionComment" ELSE t."decisionComment" END,
           "markAbsentIfUnresolved" = CASE WHEN "pData" ? 'markAbsentIfUnresolved' THEN "vRec"."markAbsentIfUnresolved" ELSE t."markAbsentIfUnresolved" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."RegularisationRequests" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'RegularisationRequests %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'RegularisationRequests % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."overtimeClaimAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."OvertimeClaims";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."OvertimeClaims", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('OT', current_date, NULL);
    END IF;
    INSERT INTO "HumanResources"."OvertimeClaims" ("tenantId", "docNo", "employeeId", "dateFrom", "dateTo", "dayType", "timeFrom", "timeTo", hours, multiplier, "hourlyRate", "isCompOff", amount, reason, source, "overtimePolicyId", "preApproved", "payrollMonth", "approverEmployeeId", "approvalRequestId", "rejectionReason", "payrollRunId", "pushedAt")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'dateFrom' THEN "vRec"."dateFrom" ELSE NULL END, CASE WHEN "pData" ? 'dateTo' THEN "vRec"."dateTo" ELSE NULL END, CASE WHEN "pData" ? 'dayType' THEN "vRec"."dayType" ELSE NULL END, CASE WHEN "pData" ? 'timeFrom' THEN "vRec"."timeFrom" ELSE NULL END, CASE WHEN "pData" ? 'timeTo' THEN "vRec"."timeTo" ELSE NULL END, CASE WHEN "pData" ? 'hours' THEN "vRec".hours ELSE NULL END, CASE WHEN "pData" ? 'multiplier' THEN "vRec".multiplier ELSE NULL END, CASE WHEN "pData" ? 'hourlyRate' THEN "vRec"."hourlyRate" ELSE NULL END, CASE WHEN "pData" ? 'isCompOff' THEN "vRec"."isCompOff" ELSE FALSE END, CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE 'HR' END, CASE WHEN "pData" ? 'overtimePolicyId' THEN "vRec"."overtimePolicyId" ELSE NULL END, CASE WHEN "pData" ? 'preApproved' THEN "vRec"."preApproved" ELSE FALSE END, CASE WHEN "pData" ? 'payrollMonth' THEN "vRec"."payrollMonth" ELSE NULL END, CASE WHEN "pData" ? 'approverEmployeeId' THEN "vRec"."approverEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE NULL END, CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE NULL END, CASE WHEN "pData" ? 'payrollRunId' THEN "vRec"."payrollRunId" ELSE NULL END, CASE WHEN "pData" ? 'pushedAt' THEN "vRec"."pushedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "HumanResources"."OvertimeClaims" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS NOT NULL AND "vStatus" <> 'PENDING' THEN
      RAISE EXCEPTION 'Only a pending overtime claim can be changed (this one is %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REQUEST_NOT_PENDING';
    END IF;
    UPDATE "HumanResources"."OvertimeClaims" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "dateFrom" = CASE WHEN "pData" ? 'dateFrom' THEN "vRec"."dateFrom" ELSE t."dateFrom" END,
           "dateTo" = CASE WHEN "pData" ? 'dateTo' THEN "vRec"."dateTo" ELSE t."dateTo" END,
           "dayType" = CASE WHEN "pData" ? 'dayType' THEN "vRec"."dayType" ELSE t."dayType" END,
           "timeFrom" = CASE WHEN "pData" ? 'timeFrom' THEN "vRec"."timeFrom" ELSE t."timeFrom" END,
           "timeTo" = CASE WHEN "pData" ? 'timeTo' THEN "vRec"."timeTo" ELSE t."timeTo" END,
           hours = CASE WHEN "pData" ? 'hours' THEN "vRec".hours ELSE t.hours END,
           multiplier = CASE WHEN "pData" ? 'multiplier' THEN "vRec".multiplier ELSE t.multiplier END,
           "hourlyRate" = CASE WHEN "pData" ? 'hourlyRate' THEN "vRec"."hourlyRate" ELSE t."hourlyRate" END,
           "isCompOff" = CASE WHEN "pData" ? 'isCompOff' THEN "vRec"."isCompOff" ELSE t."isCompOff" END,
           amount = CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE t.amount END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           source = CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE t.source END,
           "overtimePolicyId" = CASE WHEN "pData" ? 'overtimePolicyId' THEN "vRec"."overtimePolicyId" ELSE t."overtimePolicyId" END,
           "preApproved" = CASE WHEN "pData" ? 'preApproved' THEN "vRec"."preApproved" ELSE t."preApproved" END,
           "payrollMonth" = CASE WHEN "pData" ? 'payrollMonth' THEN "vRec"."payrollMonth" ELSE t."payrollMonth" END,
           "approverEmployeeId" = CASE WHEN "pData" ? 'approverEmployeeId' THEN "vRec"."approverEmployeeId" ELSE t."approverEmployeeId" END,
           "approvalRequestId" = CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE t."approvalRequestId" END,
           "rejectionReason" = CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE t."rejectionReason" END,
           "payrollRunId" = CASE WHEN "pData" ? 'payrollRunId' THEN "vRec"."payrollRunId" ELSE t."payrollRunId" END,
           "pushedAt" = CASE WHEN "pData" ? 'pushedAt' THEN "vRec"."pushedAt" ELSE t."pushedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."OvertimeClaims" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'OvertimeClaims %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'OvertimeClaims % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $function$;

CREATE OR REPLACE FUNCTION "EmployeeSelfService"."shiftSwapRequestAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "EmployeeSelfService"."ShiftSwapRequests";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"EmployeeSelfService"."ShiftSwapRequests", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('SW', "vRec"."docDate", NULL);
    END IF;
    INSERT INTO "EmployeeSelfService"."ShiftSwapRequests" ("tenantId", "docNo", "docDate", "requesterEmployeeId", "counterpartEmployeeId", "swapDate", "swapMode", "requesterShiftId", "counterpartShiftId", "reasonCategory", reason, "noteToCounterpart", "acceptedAt", "approverEmployeeId", "decisionReason")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE CURRENT_DATE END, CASE WHEN "pData" ? 'requesterEmployeeId' THEN "vRec"."requesterEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'counterpartEmployeeId' THEN "vRec"."counterpartEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'swapDate' THEN "vRec"."swapDate" ELSE NULL END, CASE WHEN "pData" ? 'swapMode' THEN "vRec"."swapMode" ELSE NULL END, CASE WHEN "pData" ? 'requesterShiftId' THEN "vRec"."requesterShiftId" ELSE NULL END, CASE WHEN "pData" ? 'counterpartShiftId' THEN "vRec"."counterpartShiftId" ELSE NULL END, CASE WHEN "pData" ? 'reasonCategory' THEN "vRec"."reasonCategory" ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'noteToCounterpart' THEN "vRec"."noteToCounterpart" ELSE NULL END, CASE WHEN "pData" ? 'acceptedAt' THEN "vRec"."acceptedAt" ELSE NULL END, CASE WHEN "pData" ? 'approverEmployeeId' THEN "vRec"."approverEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'decisionReason' THEN "vRec"."decisionReason" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "EmployeeSelfService"."ShiftSwapRequests" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS NOT NULL AND "vStatus" <> 'REQUESTED' THEN
      RAISE EXCEPTION 'Only a swap request your colleague hasn''t answered yet can be changed (this one is %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'SWAP_NOT_ACTIONABLE';
    END IF;
    UPDATE "EmployeeSelfService"."ShiftSwapRequests" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "requesterEmployeeId" = CASE WHEN "pData" ? 'requesterEmployeeId' THEN "vRec"."requesterEmployeeId" ELSE t."requesterEmployeeId" END,
           "counterpartEmployeeId" = CASE WHEN "pData" ? 'counterpartEmployeeId' THEN "vRec"."counterpartEmployeeId" ELSE t."counterpartEmployeeId" END,
           "swapDate" = CASE WHEN "pData" ? 'swapDate' THEN "vRec"."swapDate" ELSE t."swapDate" END,
           "swapMode" = CASE WHEN "pData" ? 'swapMode' THEN "vRec"."swapMode" ELSE t."swapMode" END,
           "requesterShiftId" = CASE WHEN "pData" ? 'requesterShiftId' THEN "vRec"."requesterShiftId" ELSE t."requesterShiftId" END,
           "counterpartShiftId" = CASE WHEN "pData" ? 'counterpartShiftId' THEN "vRec"."counterpartShiftId" ELSE t."counterpartShiftId" END,
           "reasonCategory" = CASE WHEN "pData" ? 'reasonCategory' THEN "vRec"."reasonCategory" ELSE t."reasonCategory" END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           "noteToCounterpart" = CASE WHEN "pData" ? 'noteToCounterpart' THEN "vRec"."noteToCounterpart" ELSE t."noteToCounterpart" END,
           "acceptedAt" = CASE WHEN "pData" ? 'acceptedAt' THEN "vRec"."acceptedAt" ELSE t."acceptedAt" END,
           "approverEmployeeId" = CASE WHEN "pData" ? 'approverEmployeeId' THEN "vRec"."approverEmployeeId" ELSE t."approverEmployeeId" END,
           "decisionReason" = CASE WHEN "pData" ? 'decisionReason' THEN "vRec"."decisionReason" ELSE t."decisionReason" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "EmployeeSelfService"."ShiftSwapRequests" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ShiftSwapRequests %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ShiftSwapRequests % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."shiftRosterEntryAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."ShiftRosters";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."ShiftRosters", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."ShiftRosters" ("tenantId", "employeeId", "rosterDate", "entryType", "shiftId", "isPublished", "publishedAt", remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'rosterDate' THEN "vRec"."rosterDate" ELSE NULL END, CASE WHEN "pData" ? 'entryType' THEN "vRec"."entryType" ELSE 'SHIFT' END, CASE WHEN "pData" ? 'shiftId' THEN "vRec"."shiftId" ELSE NULL END, CASE WHEN "pData" ? 'isPublished' THEN "vRec"."isPublished" ELSE FALSE END, CASE WHEN "pData" ? 'publishedAt' THEN "vRec"."publishedAt" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    -- a published entry changes only through an explicit republish (the caller sends isPublished)
    IF NOT ("pData" ? 'isPublished') AND EXISTS (SELECT 1 FROM "HumanResources"."ShiftRosters" t WHERE t.id = "vId" AND t."tenantId" = "vTenant" AND t."isPublished") THEN
      RAISE EXCEPTION 'This roster day is published; edit it through a republish'
        USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'ROSTER_PUBLISHED';
    END IF;
    UPDATE "HumanResources"."ShiftRosters" t
       SET "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "rosterDate" = CASE WHEN "pData" ? 'rosterDate' THEN "vRec"."rosterDate" ELSE t."rosterDate" END,
           "entryType" = CASE WHEN "pData" ? 'entryType' THEN "vRec"."entryType" ELSE t."entryType" END,
           "shiftId" = CASE WHEN "pData" ? 'shiftId' THEN "vRec"."shiftId" ELSE t."shiftId" END,
           "isPublished" = CASE WHEN "pData" ? 'isPublished' THEN "vRec"."isPublished" ELSE t."isPublished" END,
           "publishedAt" = CASE WHEN "pData" ? 'publishedAt' THEN "vRec"."publishedAt" ELSE t."publishedAt" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."ShiftRosters" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ShiftRosters %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ShiftRosters % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $function$;


-- ---------------------------------------------------------------------------
-- 3. Tenant clock and month lock helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."attendanceTimezone"("pTenant" uuid)
  RETURNS text
  LANGUAGE sql
  STABLE
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT COALESCE(NULLIF(t.timezone, ''), 'Asia/Karachi') FROM "Platform"."Tenants" t WHERE t.id = "pTenant"
$function$;

/* true when the month of pDate is locked for the tenant (any locked register day in it) */
CREATE OR REPLACE FUNCTION "HumanResources"."attendanceMonthLocked"("pTenant" uuid, "pDate" date)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM "HumanResources"."AttendanceRegister" r
                  WHERE r."tenantId" = "pTenant" AND r."lockedAt" IS NOT NULL
                    AND r."attDate" >= date_trunc('month', "pDate")::date
                    AND r."attDate" < (date_trunc('month', "pDate") + interval '1 month')::date)
$function$;

-- ---------------------------------------------------------------------------
-- 4. Punch insert (device / manual / self-service geo). Refused in a locked month.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."attendancePunchAdd"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec"    "HumanResources"."AttendancePunches";
  "vDate"   date;
  "vId"     uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."AttendancePunches", "pData");
  "vRec"."punchAt" := COALESCE("vRec"."punchAt", now());
  "vDate" := ("vRec"."punchAt" AT TIME ZONE "HumanResources"."attendanceTimezone"("vTenant"))::date;
  IF "HumanResources"."attendanceMonthLocked"("vTenant", "vDate") THEN
    RAISE EXCEPTION 'Attendance for % is locked for payroll', to_char("vDate", 'Mon YYYY')
      USING ERRCODE = 'check_violation', HINT = 'ATTENDANCE_DAY_LOCKED';
  END IF;
  IF to_regclass('"HumanResources".attendance_punch_' || to_char("vRec"."punchAt", 'YYYY_MM')) IS NULL THEN
    BEGIN
      PERFORM "HumanResources"."ensureAttendancePunchPartition"("vRec"."punchAt"::date);
    EXCEPTION WHEN OTHERS THEN
      NULL;                                         -- the default partition takes the row
    END;
  END IF;
  INSERT INTO "HumanResources"."AttendancePunches" ("tenantId", "employeeId", "punchAt", direction, source, "deviceId", "deviceUserId", "verifyMode",
                                                    "workMode", latitude, longitude, "geofenceDistanceM", "insideGeofence", "locationLabel",
                                                    "attendanceRequestId", "manualReason")
  VALUES ("vTenant", "vRec"."employeeId", "vRec"."punchAt", COALESCE("vRec".direction, 'AUTO'), "vRec".source, "vRec"."deviceId", "vRec"."deviceUserId",
          "vRec"."verifyMode", COALESCE("vRec"."workMode", 'OFFICE'), "vRec".latitude, "vRec".longitude, "vRec"."geofenceDistanceM",
          "vRec"."insideGeofence", "vRec"."locationLabel", "vRec"."attendanceRequestId", "vRec"."manualReason")
  RETURNING id INTO "vId";
  RETURN "vId";
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Register build: one row per employee and day from punches, the published roster (else the employee's shift,
--    else the default shift), holidays, weekly off, approved leave and approved regularisation. Idempotent: rows are
--    written only when something changed, and locked or manual rows are never touched. A day in the future is not
--    built; today, an employee who has not punched yet gets no row until the shift has ended.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."attendanceRegisterBuild"("pTenant" uuid, "pDate" date, "pEmployee" uuid DEFAULT NULL)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTz"       text := "HumanResources"."attendanceTimezone"("pTenant");
  "vToday"    date;
  "vDefShift" uuid;
  "e"         record;
  "s"         "HumanResources"."WorkShifts";
  "vRType"    text;  "vRShift" uuid;  "vShiftId" uuid;
  "vHol"      uuid;
  "vLvId"     uuid;  "vLvType" uuid;  "vLvPaid" boolean;  "vLvDur" text;
  "vFirst"    timestamptz;  "vLast" timestamptz;  "vMode" text;  "vLoc" text;
  "vStart"    timestamptz;  "vEnd" timestamptz;  "vFrom" timestamptz;  "vTo" timestamptz;
  "vOff"      boolean;  "vDow" int;
  "vReqId"    uuid;  "vLateOk" boolean;  "vLateBy" uuid;  "vEarlyOk" boolean;  "vDuty" boolean;  "vWfh" boolean;
  "vStatus"   text;  "vLate" int;  "vEarly" int;  "vWorked" int;  "vOt" int;  "vPay" numeric;  "vWaived" boolean;
  "vN"        int := 0;  "vRows" int;
BEGIN
  IF "pTenant" IS DISTINCT FROM "Company"."getCurrentTenantId"() THEN
    RAISE EXCEPTION 'attendanceRegisterBuild runs for the current company only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  "vToday" := (now() AT TIME ZONE "vTz")::date;
  IF "pDate" > "vToday" THEN
    RAISE EXCEPTION 'Attendance can''t be processed for a future date' USING ERRCODE = 'check_violation';
  END IF;
  IF "HumanResources"."attendanceMonthLocked"("pTenant", "pDate") THEN
    RAISE EXCEPTION 'Attendance for % is locked for payroll', to_char("pDate", 'Mon YYYY')
      USING ERRCODE = 'check_violation', HINT = 'ATTENDANCE_DAY_LOCKED';
  END IF;
  SELECT w.id INTO "vDefShift" FROM "HumanResources"."WorkShifts" w
   WHERE w."tenantId" = "pTenant" AND w."isDefault" AND w."deletedAt" IS NULL ORDER BY w."createdAt" LIMIT 1;
  "vDow" := extract(dow FROM "pDate")::int;

  FOR "e" IN
    SELECT emp.id, emp."branchId", emp."shiftId", emp."weeklyOff"
      FROM "HumanResources"."Employees" emp
     WHERE emp."tenantId" = "pTenant" AND emp."deletedAt" IS NULL
       AND ("pEmployee" IS NULL OR emp.id = "pEmployee")
       AND emp."joiningDate" <= "pDate"
       AND (emp."exitDate" IS NULL OR emp."exitDate" >= "pDate")
       AND (emp.status <> 'EXITED' OR emp."exitDate" IS NOT NULL)
  LOOP
    IF EXISTS (SELECT 1 FROM "HumanResources"."AttendanceRegister" r
                WHERE r."tenantId" = "pTenant" AND r."employeeId" = "e".id AND r."attDate" = "pDate"
                  AND (r."lockedAt" IS NOT NULL OR r."isManual")) THEN
      CONTINUE;
    END IF;

    -- planned shift
    "vRType" := NULL; "vRShift" := NULL;
    SELECT r."entryType", r."shiftId" INTO "vRType", "vRShift"
      FROM "HumanResources"."ShiftRosters" r
     WHERE r."tenantId" = "pTenant" AND r."employeeId" = "e".id AND r."rosterDate" = "pDate" AND r."isPublished";
    "vShiftId" := CASE WHEN "vRType" = 'SHIFT' THEN "vRShift" ELSE COALESCE("e"."shiftId", "vDefShift") END;
    "s" := NULL;
    SELECT * INTO "s" FROM "HumanResources"."WorkShifts" w WHERE w."tenantId" = "pTenant" AND w.id = "vShiftId";

    -- holiday (public / company; optional holidays and events are working days)
    "vHol" := NULL;
    SELECT h.id INTO "vHol" FROM "HumanResources"."Holidays" h
     WHERE h."tenantId" = "pTenant" AND h."deletedAt" IS NULL AND h.status <> 'CANCELLED' AND h."holidayType" IN ('PUBLIC', 'COMPANY')
       AND "pDate" BETWEEN h."fromDate" AND h."toDate"
       AND (h."appliesToAllBranches" OR EXISTS (SELECT 1 FROM "HumanResources"."HolidayBranches" hb
                                                 WHERE hb."tenantId" = "pTenant" AND hb."holidayId" = h.id AND hb."branchId" = "e"."branchId"))
     LIMIT 1;

    -- approved leave (Phase 31 owns the requests; the register only reads them)
    "vLvId" := NULL; "vLvType" := NULL; "vLvPaid" := NULL; "vLvDur" := NULL;
    SELECT lr.id, lr."leaveTypeId", lt."isPaid", lr.duration INTO "vLvId", "vLvType", "vLvPaid", "vLvDur"
      FROM "HumanResources"."LeaveRequests" lr
      JOIN "HumanResources"."LeaveTypes" lt ON lt."tenantId" = lr."tenantId" AND lt.id = lr."leaveTypeId"
     WHERE lr."tenantId" = "pTenant" AND lr."employeeId" = "e".id AND lr.status = 'APPROVED' AND "pDate" BETWEEN lr."fromDate" AND lr."toDate"
     ORDER BY lr."decidedAt" DESC NULLS LAST LIMIT 1;

    -- weekly off: the roster decides when it has the day, else the employee's (or shift's) weekly off
    "vOff" := CASE WHEN "vRType" = 'OFF' THEN true WHEN "vRType" = 'SHIFT' THEN false
                   ELSE CASE COALESCE("e"."weeklyOff", "s"."weeklyOff", 'SUNDAY')
                          WHEN 'SUNDAY' THEN "vDow" = 0 WHEN 'FRIDAY' THEN "vDow" = 5 WHEN 'SATURDAY_SUNDAY' THEN "vDow" IN (0, 6) ELSE false END END;

    -- the shift's window in the company's time zone, and the punches in it
    IF "s".id IS NOT NULL THEN
      "vStart" := ("pDate" + "s"."startTime") AT TIME ZONE "vTz";
      "vEnd"   := ("pDate" + "s"."endTime" + CASE WHEN "s"."crossesMidnight" OR "s"."endTime" <= "s"."startTime" THEN interval '1 day' ELSE interval '0' END) AT TIME ZONE "vTz";
      "vFrom"  := "vStart" - interval '4 hours';
      "vTo"    := "vEnd" + interval '6 hours';
    ELSE
      "vStart" := NULL; "vEnd" := NULL;
      "vFrom"  := "pDate"::timestamp AT TIME ZONE "vTz";
      "vTo"    := ("pDate" + 1)::timestamp AT TIME ZONE "vTz";
    END IF;
    SELECT min(p."punchAt") FILTER (WHERE p.direction IN ('IN', 'AUTO')),
           max(p."punchAt") FILTER (WHERE p.direction IN ('OUT', 'AUTO')),
           (array_agg(p."workMode" ORDER BY p."punchAt"))[1],
           (array_agg(p."locationLabel" ORDER BY p."punchAt") FILTER (WHERE p."locationLabel" IS NOT NULL))[1]
      INTO "vFirst", "vLast", "vMode", "vLoc"
      FROM "HumanResources"."AttendancePunches" p
     WHERE p."tenantId" = "pTenant" AND p."employeeId" = "e".id AND NOT p."isVoid" AND p."punchAt" >= "vFrom" AND p."punchAt" < "vTo";
    IF "vLast" IS NOT NULL AND ("vFirst" IS NULL OR "vLast" <= "vFirst") THEN
      "vLast" := NULL;
    END IF;

    -- approved regularisation of the day
    SELECT (array_agg(q.id ORDER BY q."decidedAt" DESC))[1],
           bool_or(q."requestType" = 'LATE_ARRIVAL'), (array_agg(q."decidedByUserId" ORDER BY q."decidedAt" DESC) FILTER (WHERE q."requestType" = 'LATE_ARRIVAL'))[1],
           bool_or(q."requestType" = 'EARLY_LEAVING'), bool_or(q."requestType" = 'ON_DUTY'), bool_or(q."requestType" = 'WFH')
      INTO "vReqId", "vLateOk", "vLateBy", "vEarlyOk", "vDuty", "vWfh"
      FROM "HumanResources"."RegularisationRequests" q
     WHERE q."tenantId" = "pTenant" AND q."employeeId" = "e".id AND q."attDate" = "pDate" AND q.status = 'APPROVED';

    "vLate" := 0; "vEarly" := 0; "vWorked" := 0; "vOt" := 0; "vPay" := 1; "vWaived" := false;
    IF "vLvId" IS NOT NULL AND "vLvDur" = 'FULL' THEN
      "vStatus" := 'LEAVE'; "vPay" := CASE WHEN "vLvPaid" THEN 1 ELSE 0 END;
    ELSIF "vHol" IS NOT NULL THEN
      "vStatus" := 'HOLIDAY';
    ELSIF "vOff" AND "vFirst" IS NULL THEN
      "vStatus" := 'WEEKLY_OFF';
    ELSIF "vFirst" IS NULL THEN
      IF COALESCE("vDuty", false) THEN "vStatus" := 'ON_DUTY';
      ELSIF COALESCE("vWfh", false) THEN "vStatus" := 'WFH';
      ELSIF "vLvId" IS NOT NULL THEN "vStatus" := 'LEAVE'; "vPay" := CASE WHEN "vLvPaid" THEN 1 ELSE 0.5 END;
      ELSIF "pDate" < "vToday" OR ("vEnd" IS NOT NULL AND now() > "vEnd") THEN "vStatus" := 'ABSENT'; "vPay" := 0;
      ELSE CONTINUE;                                -- today, not in yet
      END IF;
    ELSE
      IF "vLast" IS NOT NULL THEN
        "vWorked" := least(1440, floor(extract(epoch FROM ("vLast" - "vFirst")) / 60))::int;
      END IF;
      IF "vStart" IS NOT NULL THEN
        "vLate" := least(1440, greatest(0, floor(extract(epoch FROM ("vFirst" - "vStart")) / 60)::int - COALESCE("s"."graceMinutes", 0)));
        IF "vLast" IS NOT NULL AND NOT COALESCE("vEarlyOk", false) THEN
          "vEarly" := least(1440, greatest(0, floor(extract(epoch FROM ("vEnd" - "vLast")) / 60)::int));
        END IF;
        IF "vLast" IS NOT NULL AND "vWorked" > round("s"."scheduledHours" * 60) + COALESCE("s"."overtimeAfterMinutes", 0) THEN
          "vOt" := "vWorked" - round("s"."scheduledHours" * 60)::int;
        END IF;
      END IF;
      IF "vLate" > 0 AND COALESCE("vLateOk", false) THEN
        "vWaived" := true;
      END IF;
      IF "vLast" IS NOT NULL AND "s"."halfDayBelowHours" IS NOT NULL AND "vWorked" < "s"."halfDayBelowHours" * 60
         AND NOT COALESCE("vDuty", false) AND NOT COALESCE("vWfh", false) THEN
        "vStatus" := 'HALF_DAY'; "vPay" := 0.5;
      ELSIF "vLate" > 0 AND NOT "vWaived" THEN
        "vStatus" := 'LATE';
      ELSIF COALESCE("vDuty", false) OR "vMode" = 'FIELD' THEN
        "vStatus" := 'ON_DUTY';
      ELSIF COALESCE("vWfh", false) OR "vMode" = 'WFH' THEN
        "vStatus" := 'WFH';
      ELSE
        "vStatus" := 'PRESENT';
      END IF;
    END IF;

    INSERT INTO "HumanResources"."AttendanceRegister" AS r ("tenantId", "employeeId", "attDate", "shiftId", status, "firstIn", "lastOut", "lateMinutes",
           "earlyLeaveMinutes", "workedMinutes", "overtimeMinutes", "payableFraction", "lateMarkWaived", "lateWaivedByUserId", "leaveRequestId", "leaveTypeId",
           "holidayId", "attendanceRequestId", "locationLabel")
    VALUES ("pTenant", "e".id, "pDate", "vShiftId", "vStatus", "vFirst", "vLast", "vLate", "vEarly", "vWorked", "vOt", "vPay",
            "vWaived", CASE WHEN "vWaived" THEN "vLateBy" END, "vLvId", "vLvType", "vHol", "vReqId", "vLoc")
    ON CONFLICT ("tenantId", "employeeId", "attDate") DO UPDATE SET
           "shiftId" = EXCLUDED."shiftId", status = EXCLUDED.status, "firstIn" = EXCLUDED."firstIn", "lastOut" = EXCLUDED."lastOut",
           "lateMinutes" = EXCLUDED."lateMinutes", "earlyLeaveMinutes" = EXCLUDED."earlyLeaveMinutes", "workedMinutes" = EXCLUDED."workedMinutes",
           "overtimeMinutes" = EXCLUDED."overtimeMinutes", "payableFraction" = EXCLUDED."payableFraction", "lateMarkWaived" = EXCLUDED."lateMarkWaived",
           "lateWaivedByUserId" = EXCLUDED."lateWaivedByUserId", "leaveRequestId" = EXCLUDED."leaveRequestId", "leaveTypeId" = EXCLUDED."leaveTypeId",
           "holidayId" = EXCLUDED."holidayId", "attendanceRequestId" = EXCLUDED."attendanceRequestId", "locationLabel" = EXCLUDED."locationLabel"
     WHERE r."lockedAt" IS NULL AND NOT r."isManual"
       AND (r."shiftId", r.status, r."firstIn", r."lastOut", r."lateMinutes", r."earlyLeaveMinutes", r."workedMinutes", r."overtimeMinutes", r."payableFraction",
            r."lateMarkWaived", r."lateWaivedByUserId", r."leaveRequestId", r."leaveTypeId", r."holidayId", r."attendanceRequestId", r."locationLabel")
           IS DISTINCT FROM
           (EXCLUDED."shiftId", EXCLUDED.status, EXCLUDED."firstIn", EXCLUDED."lastOut", EXCLUDED."lateMinutes", EXCLUDED."earlyLeaveMinutes", EXCLUDED."workedMinutes",
            EXCLUDED."overtimeMinutes", EXCLUDED."payableFraction", EXCLUDED."lateMarkWaived", EXCLUDED."lateWaivedByUserId", EXCLUDED."leaveRequestId",
            EXCLUDED."leaveTypeId", EXCLUDED."holidayId", EXCLUDED."attendanceRequestId", EXCLUDED."locationLabel");
    GET DIAGNOSTICS "vRows" = ROW_COUNT;
    "vN" := "vN" + "vRows";
  END LOOP;
  RETURN "vN";
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Register lock / unlock per month (payroll sets payrollRunId later; a consumed month can't be unlocked)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."attendanceRegisterLock"("pMonth" date)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vN" int;
BEGIN
  UPDATE "HumanResources"."AttendanceRegister" r SET "lockedAt" = now()
   WHERE r."tenantId" = "vTenant" AND r."lockedAt" IS NULL
     AND r."attDate" >= date_trunc('month', "pMonth")::date AND r."attDate" < (date_trunc('month', "pMonth") + interval '1 month')::date;
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."attendanceRegisterUnlock"("pMonth" date)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vN" int;
BEGIN
  IF EXISTS (SELECT 1 FROM "HumanResources"."AttendanceRegister" r
              WHERE r."tenantId" = "vTenant" AND r."payrollRunId" IS NOT NULL
                AND r."attDate" >= date_trunc('month', "pMonth")::date AND r."attDate" < (date_trunc('month', "pMonth") + interval '1 month')::date) THEN
    RAISE EXCEPTION 'Payroll has consumed attendance for %; it can''t be unlocked', to_char("pMonth", 'Mon YYYY')
      USING ERRCODE = 'check_violation', HINT = 'ATTENDANCE_DAY_LOCKED';
  END IF;
  UPDATE "HumanResources"."AttendanceRegister" r SET "lockedAt" = NULL
   WHERE r."tenantId" = "vTenant" AND r."lockedAt" IS NOT NULL
     AND r."attDate" >= date_trunc('month', "pMonth")::date AND r."attDate" < (date_trunc('month', "pMonth") + interval '1 month')::date;
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

-- ---------------------------------------------------------------------------
-- 7. Regularisation: approve (fixes the day: punches + rebuild) and reject, both completing the request.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."regularisationRequestApprove"("pId" uuid, "pComment" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    "HumanResources"."RegularisationRequests";
  "vTz"     text;
  "vMode"   text;
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."RegularisationRequests" t WHERE t.id = "pId" AND t."tenantId" = "vTenant" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RegularisationRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status <> 'PENDING' THEN
    RAISE EXCEPTION 'Request %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REQUEST_NOT_PENDING';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'You can''t approve your own request' USING ERRCODE = 'insufficient_privilege', HINT = 'APPROVAL_SELF';
  END IF;
  IF "HumanResources"."attendanceMonthLocked"("vTenant", "vRow"."attDate") THEN
    RAISE EXCEPTION 'Attendance for % is locked for payroll', to_char("vRow"."attDate", 'Mon YYYY')
      USING ERRCODE = 'check_violation', HINT = 'ATTENDANCE_DAY_LOCKED';
  END IF;
  UPDATE "HumanResources"."RegularisationRequests" t
     SET status = 'APPROVED', stage = 'COMPLETED', "decidedAt" = now(), "decidedByUserId" = "Company"."getCurrentUserId"(),
         "decisionComment" = COALESCE("pComment", t."decisionComment")
   WHERE t.id = "pId";
  -- the requested times become punches linked to the request
  "vTz" := "HumanResources"."attendanceTimezone"("vTenant");
  "vMode" := CASE "vRow"."requestType" WHEN 'WFH' THEN 'WFH' WHEN 'ON_DUTY' THEN 'FIELD' ELSE 'OFFICE' END;
  IF "vRow"."requestedIn" IS NOT NULL AND "vRow"."requestType" IN ('MISSED_PUNCH', 'ON_DUTY', 'WFH')
     AND ("vRow"."requestType" <> 'MISSED_PUNCH' OR "vRow"."punchDirection" IN ('IN', 'BOTH')) THEN
    PERFORM "HumanResources"."attendancePunchAdd"(jsonb_build_object('employeeId', "vRow"."employeeId", 'punchAt', ("vRow"."attDate" + "vRow"."requestedIn") AT TIME ZONE "vTz",
              'direction', 'IN', 'source', 'MANUAL', 'workMode', "vMode", 'attendanceRequestId', "vRow".id));
  END IF;
  IF "vRow"."requestedOut" IS NOT NULL AND "vRow"."requestType" IN ('MISSED_PUNCH', 'ON_DUTY', 'WFH')
     AND ("vRow"."requestType" <> 'MISSED_PUNCH' OR "vRow"."punchDirection" IN ('OUT', 'BOTH')) THEN
    PERFORM "HumanResources"."attendancePunchAdd"(jsonb_build_object('employeeId', "vRow"."employeeId",
              'punchAt', ("vRow"."attDate" + "vRow"."requestedOut" + CASE WHEN "vRow"."requestedIn" IS NOT NULL AND "vRow"."requestedOut" < "vRow"."requestedIn" THEN interval '1 day' ELSE interval '0' END) AT TIME ZONE "vTz",
              'direction', 'OUT', 'source', 'MANUAL', 'workMode', "vMode", 'attendanceRequestId', "vRow".id));
  END IF;
  IF "vRow"."attDate" <= (now() AT TIME ZONE "vTz")::date THEN
    PERFORM "HumanResources"."attendanceRegisterBuild"("vTenant", "vRow"."attDate", "vRow"."employeeId");
  END IF;
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."regularisationRequestReject"("pId" uuid, "pReason" text, "pComment" text DEFAULT NULL::text, "pMarkAbsent" boolean DEFAULT false)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "HumanResources"."RegularisationRequests";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."RegularisationRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RegularisationRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status <> 'PENDING' THEN
    RAISE EXCEPTION 'Request %: cannot reject from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REQUEST_NOT_PENDING';
  END IF;
  UPDATE "HumanResources"."RegularisationRequests" t
     SET status = 'REJECTED', stage = 'COMPLETED', "decidedAt" = now(), "decidedByUserId" = "Company"."getCurrentUserId"(),
         "rejectionReason" = COALESCE("pReason", 'OTHER'), "decisionComment" = "pComment", "markAbsentIfUnresolved" = COALESCE("pMarkAbsent", false)
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 8. Overtime claims: approve / reject complete the decision; cancel only a pending or approved (not pushed) claim.
--    A comp-off claim already credited as leave (Phase 31 LeaveAdjustments) can't be cancelled.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."overtimeClaimApprove"("pId" uuid, "pComment" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "HumanResources"."OvertimeClaims";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."OvertimeClaims" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OvertimeClaims % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status <> 'PENDING' THEN
    RAISE EXCEPTION 'Overtime claim %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REQUEST_NOT_PENDING';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'You can''t approve overtime you logged' USING ERRCODE = 'insufficient_privilege', HINT = 'APPROVAL_SELF';
  END IF;
  UPDATE "HumanResources"."OvertimeClaims" t
     SET status = 'APPROVED', "decidedAt" = now(), "decidedByUserId" = "Company"."getCurrentUserId"()
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."overtimeClaimReject"("pId" uuid, "pReason" text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "HumanResources"."OvertimeClaims";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."OvertimeClaims" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OvertimeClaims % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status <> 'PENDING' THEN
    RAISE EXCEPTION 'Overtime claim %: cannot reject from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REQUEST_NOT_PENDING';
  END IF;
  UPDATE "HumanResources"."OvertimeClaims" t
     SET status = 'REJECTED', "decidedAt" = now(), "decidedByUserId" = "Company"."getCurrentUserId"(), "rejectionReason" = "pReason"
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."overtimeClaimCancel"("pId" uuid, "pReason" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "HumanResources"."OvertimeClaims";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."OvertimeClaims" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OvertimeClaims % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING', 'APPROVED') THEN
    RAISE EXCEPTION 'Overtime claim %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REQUEST_NOT_PENDING';
  END IF;
  IF EXISTS (SELECT 1 FROM "HumanResources"."LeaveAdjustments" a WHERE a."tenantId" = "vRow"."tenantId" AND a."overtimeEntryId" = "pId") THEN
    RAISE EXCEPTION 'Overtime claim % is already credited as comp-off leave', "vRow"."docNo"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REQUEST_NOT_PENDING';
  END IF;
  UPDATE "HumanResources"."OvertimeClaims" t
     SET status = 'CANCELLED', "rejectionReason" = COALESCE("pReason", t."rejectionReason")
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 9. Rosters: publish a date range; swaps update the published roster when approved.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."shiftRosterPublish"("pFrom" date, "pTo" date, "pEmployees" uuid[] DEFAULT NULL)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vN" int;
BEGIN
  UPDATE "HumanResources"."ShiftRosters" r SET "isPublished" = true, "publishedAt" = now()
   WHERE r."tenantId" = "Company"."getCurrentTenantId"() AND NOT r."isPublished" AND r."rosterDate" BETWEEN "pFrom" AND "pTo"
     AND ("pEmployees" IS NULL OR r."employeeId" = ANY ("pEmployees"));
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

/* a published roster day set directly (swap approval, open-shift confirmation) */
CREATE OR REPLACE FUNCTION "HumanResources"."shiftRosterSetPublished"("pEmployee" uuid, "pDate" date, "pType" text, "pShift" uuid, "pRemarks" text)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO "HumanResources"."ShiftRosters" AS r ("tenantId", "employeeId", "rosterDate", "entryType", "shiftId", "isPublished", "publishedAt", remarks)
  VALUES ("Company"."getCurrentTenantId"(), "pEmployee", "pDate", "pType", CASE WHEN "pType" = 'SHIFT' THEN "pShift" END, true, now(), "pRemarks")
  ON CONFLICT ("tenantId", "employeeId", "rosterDate") DO UPDATE
     SET "entryType" = EXCLUDED."entryType", "shiftId" = EXCLUDED."shiftId", "isPublished" = true, "publishedAt" = now(), remarks = EXCLUDED.remarks;
END $function$;

CREATE OR REPLACE FUNCTION "EmployeeSelfService"."shiftSwapRequestApprove"("pId" uuid, "pComment" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "EmployeeSelfService"."ShiftSwapRequests";
BEGIN
  SELECT * INTO "vRow" FROM "EmployeeSelfService"."ShiftSwapRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ShiftSwapRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'Swap %: only a swap the colleague has accepted can be approved (this one is %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'SWAP_NOT_ACTIONABLE';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'You can''t approve your own swap' USING ERRCODE = 'insufficient_privilege', HINT = 'APPROVAL_SELF';
  END IF;
  UPDATE "EmployeeSelfService"."ShiftSwapRequests" t
     SET status = 'APPROVED', "decidedAt" = now(), "decidedByUserId" = "Company"."getCurrentUserId"(), "decisionReason" = COALESCE("pComment", t."decisionReason")
   WHERE t.id = "pId";
  -- the roster follows: SWAP exchanges the two shifts, COVER moves the requester's shift to the colleague
  PERFORM "HumanResources"."shiftRosterSetPublished"("vRow"."requesterEmployeeId", "vRow"."swapDate",
            CASE WHEN "vRow"."swapMode" = 'SWAP' THEN 'SHIFT' ELSE 'OFF' END, "vRow"."counterpartShiftId", 'Swap ' || "vRow"."docNo");
  PERFORM "HumanResources"."shiftRosterSetPublished"("vRow"."counterpartEmployeeId", "vRow"."swapDate", 'SHIFT', "vRow"."requesterShiftId", 'Swap ' || "vRow"."docNo");
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "EmployeeSelfService"."shiftSwapRequestReject"("pId" uuid, "pReason" text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "EmployeeSelfService"."ShiftSwapRequests";
BEGIN
  SELECT * INTO "vRow" FROM "EmployeeSelfService"."ShiftSwapRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ShiftSwapRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status NOT IN ('REQUESTED', 'ACCEPTED') THEN
    RAISE EXCEPTION 'Swap %: cannot reject from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'SWAP_NOT_ACTIONABLE';
  END IF;
  UPDATE "EmployeeSelfService"."ShiftSwapRequests" t
     SET status = 'REJECTED', "decidedAt" = now(), "decidedByUserId" = "Company"."getCurrentUserId"(), "decisionReason" = COALESCE(NULLIF(btrim("pReason"), ''), 'Rejected')
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 10. Open shifts: an employee's claim (re-claim after a withdrawal or decline) and the manager's decision.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."openShiftClaim"("pOpenShift" uuid, "pEmployee" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vId" uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM "EmployeeSelfService"."OpenShiftClaims" c
              WHERE c."tenantId" = "vTenant" AND c."openShiftId" = "pOpenShift" AND c."employeeId" = "pEmployee" AND c.status IN ('REQUESTED', 'CONFIRMED')) THEN
    RAISE EXCEPTION 'You have already picked up this shift' USING ERRCODE = 'check_violation', HINT = 'OPEN_SHIFT_CLAIMED';
  END IF;
  INSERT INTO "EmployeeSelfService"."OpenShiftClaims" AS c ("tenantId", "openShiftId", "employeeId", status, "claimedAt")
  VALUES ("vTenant", "pOpenShift", "pEmployee", 'REQUESTED', now())
  ON CONFLICT ("tenantId", "openShiftId", "employeeId") DO UPDATE
     SET status = 'REQUESTED', "claimedAt" = now(), "decidedAt" = NULL, "decidedByUserId" = NULL
   WHERE c.status IN ('WITHDRAWN', 'DECLINED')
  RETURNING id INTO "vId";
  IF "vId" IS NULL THEN
    RAISE EXCEPTION 'You have already picked up this shift' USING ERRCODE = 'check_violation', HINT = 'OPEN_SHIFT_CLAIMED';
  END IF;
  RETURN "vId";
END $function$;

CREATE OR REPLACE FUNCTION "EmployeeSelfService"."openShiftClaimDecide"("pClaim" uuid, "pConfirm" boolean)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "c" "EmployeeSelfService"."OpenShiftClaims";
  "o" "EmployeeSelfService"."OpenShifts";
BEGIN
  SELECT * INTO "c" FROM "EmployeeSelfService"."OpenShiftClaims" t WHERE t."tenantId" = "vTenant" AND t.id = "pClaim" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OpenShiftClaims % not found', "pClaim" USING ERRCODE = 'no_data_found';
  END IF;
  IF "c".status <> 'REQUESTED' THEN
    RAISE EXCEPTION 'Only a requested pick-up can be confirmed or declined (this one is %)', "c".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REQUEST_NOT_PENDING';
  END IF;
  UPDATE "EmployeeSelfService"."OpenShiftClaims" t
     SET status = CASE WHEN "pConfirm" THEN 'CONFIRMED' ELSE 'DECLINED' END, "decidedAt" = now(), "decidedByUserId" = "Company"."getCurrentUserId"()
   WHERE t.id = "pClaim";
  IF "pConfirm" THEN
    SELECT * INTO "o" FROM "EmployeeSelfService"."OpenShifts" s WHERE s."tenantId" = "vTenant" AND s.id = "c"."openShiftId" FOR UPDATE;
    PERFORM "HumanResources"."shiftRosterSetPublished"("c"."employeeId", "o"."shiftDate", 'SHIFT', "o"."shiftId", 'Open shift ' || "o".code);
    IF (SELECT count(*) FROM "EmployeeSelfService"."OpenShiftClaims" x WHERE x."tenantId" = "vTenant" AND x."openShiftId" = "o".id AND x.status = 'CONFIRMED') >= "o"."slotsTotal" THEN
      UPDATE "EmployeeSelfService"."OpenShifts" s SET status = 'FILLED' WHERE s.id = "o".id AND s.status = 'OPEN';
    END IF;
  END IF;
  RETURN "pClaim";
END $function$;

-- ---------------------------------------------------------------------------
-- 11. Every company: REG / OT / SW numbering and one default workflow per subject (line manager, then HR).
--     Both editable afterwards; nothing is replaced once it exists.
-- ---------------------------------------------------------------------------
INSERT INTO "Lookups"."Lookups" ("lookupType", code, label, tone, "sortOrder", "isActive", "isSystem")
VALUES ('Subject', 'ATTENDANCE_REGULARISATION', 'Attendance regularisation', 'neutral', 13, true, true),
       ('Subject', 'OVERTIME_CLAIM', 'Overtime claim', 'neutral', 14, true, true),
       ('Subject', 'SHIFT_SWAP', 'Shift swap', 'neutral', 15, true, true)
ON CONFLICT ("lookupType", code, "tenantId") DO NOTHING;

CREATE OR REPLACE FUNCTION "HumanResources"."seedAttendanceDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vN"    integer;
  "vWf"   uuid;
  "vRole" uuid;
  "w"     record;
BEGIN
  INSERT INTO "Company"."NumberingSeries" ("tenantId", "docType", "branchId", prefix, pattern, padding, "startValue", "resetPolicy", "isActive")
  SELECT "pTenant", d.code, NULL, d."defaultPrefix", d."defaultPattern", d."defaultPadding", 1, d."defaultResetPolicy", true
    FROM "Company"."DocumentTypes" d
   WHERE d.code IN ('REG', 'OT', 'SW')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;

  SELECT r.id INTO "vRole" FROM "Company"."Roles" r WHERE r."tenantId" = "pTenant" AND r."systemKey" = 'HR_MANAGER' LIMIT 1;
  IF "vRole" IS NULL THEN
    RETURN "vN";
  END IF;
  FOR "w" IN SELECT * FROM (VALUES
      ('ATTENDANCE_REGULARISATION', 'Attendance regularisation', 'Default: the employee''s line manager, then HR. Edit as needed.'),
      ('OVERTIME_CLAIM', 'Overtime claims', 'Default: the requester''s line manager, then HR. Edit as needed.'),
      ('SHIFT_SWAP', 'Shift swaps', 'Default: the requester''s line manager, then HR. Edit as needed.')) v(subject, name, description)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM "Company"."ApprovalWorkflows" x WHERE x."tenantId" = "pTenant" AND x.subject = "w".subject AND x."deletedAt" IS NULL) THEN
      INSERT INTO "Company"."ApprovalWorkflows" ("tenantId", name, subject, description, status, version, priority, "onComplete", "onReject",
                                                "notifyPreparer", "notifyInApp", "notifyEmail", "notifyWhatsapp", "publishedAt")
      VALUES ("pTenant", "w".name, "w".subject, "w".description, 'ACTIVE', 1, 100, 'MARK_APPROVED', 'RETURN_TO_PREPARER', true, true, false, false, now())
      RETURNING id INTO "vWf";
      INSERT INTO "Company"."ApprovalWorkflowSteps" ("tenantId", "workflowId", "stepNo", name, "approverType", "approverRoleId", "slaHours", "onSlaBreach",
                                                    "approvalMode", "blockSelfApproval", "allowDelegation", "requireComment")
      VALUES ("pTenant", "vWf", 1, 'Line manager', 'LINE_MANAGER', NULL, 48, 'REMIND', 'ANY', true, true, false),
             ("pTenant", "vWf", 2, 'HR', 'ROLE', "vRole", 48, 'REMIND', 'ANY', true, true, false);
      "vN" := "vN" + 1;
    END IF;
  END LOOP;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."triggerTenantAttendanceDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "HumanResources"."seedAttendanceDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

-- after the tenant's roles exist (provisionTenant creates them in the same transaction): deferred to the end of it
DROP TRIGGER IF EXISTS "tenantsAttendanceDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsAttendanceDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "HumanResources"."triggerTenantAttendanceDefaults"();

SELECT set_config('app.actorLabel', 'seedAttendanceDefaultsFor', false);
SELECT "HumanResources"."seedAttendanceDefaultsFor"(t.id) FROM "Platform"."Tenants" t;

-- ---------------------------------------------------------------------------
-- 12. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('ATTENDANCE_DAY_LOCKED', 409, 'BUSINESS_RULE', 'HR', 'Attendance for that month is locked for payroll. Unlock the month first.', 'Change to a locked attendance day or month', true, NULL),
  ('REQUEST_NOT_PENDING',   409, 'BUSINESS_RULE', 'HR', 'This request is no longer pending.', 'Edit or decision on a request that was already decided, withdrawn or cancelled', true, NULL),
  ('SWAP_NOT_ACTIONABLE',   409, 'BUSINESS_RULE', 'HR', 'This swap can''t be changed at its current step.', 'Swap action out of order (accept, approve, withdraw)', true, NULL),
  ('OPEN_SHIFT_FULL',       409, 'BUSINESS_RULE', 'HR', 'No slots are left on this open shift.', 'Open-shift claim beyond capacity or on a closed shift', true, NULL),
  ('OPEN_SHIFT_CLAIMED',    409, 'BUSINESS_RULE', 'HR', 'You have already picked up this shift.', 'Second claim on the same open shift', true, NULL),
  ('ROSTER_PUBLISHED',      409, 'BUSINESS_RULE', 'HR', 'This roster week is published. Edit it through a republish.', 'Change to a published roster day', true, NULL),
  ('OVERTIME_OVER_LIMIT',   400, 'VALIDATION',    'HR', 'This overtime is over the policy limit.', 'Overtime above the daily or monthly cap, below the minimum or for an ineligible grade', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
