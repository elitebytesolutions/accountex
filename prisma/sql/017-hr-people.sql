-- Phase 11: HR policies & people (leave types, overtime policy, biometric devices, employees). Idempotent. Apply with: npm run db:sql

-- ---------------------------------------------------------------------------
-- 1. Row history on the tables that had none. The device comm key never reaches the log.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "leaveEligibilityRulesAudit" ON "HumanResources"."LeaveEligibilityRules";
CREATE TRIGGER "leaveEligibilityRulesAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."LeaveEligibilityRules"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "biometricDevicesAudit" ON "HumanResources"."BiometricDevices";
CREATE TRIGGER "biometricDevicesAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."BiometricDevices"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditRedacted"('commKeySecret');
DROP TRIGGER IF EXISTS "deviceSyncLogsAudit" ON "HumanResources"."DeviceSyncLogs";
CREATE TRIGGER "deviceSyncLogsAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."DeviceSyncLogs"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "employeeDocumentsAudit" ON "HumanResources"."EmployeeDocuments";
CREATE TRIGGER "employeeDocumentsAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."EmployeeDocuments"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "employeePositionHistoryAudit" ON "HumanResources"."EmployeePositionHistory";
CREATE TRIGGER "employeePositionHistoryAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."EmployeePositionHistory"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "branchHrSettingsAudit" ON "HumanResources"."BranchHrSettings";
CREATE TRIGGER "branchHrSettingsAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."BranchHrSettings"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Leave eligibility overrides, replaced as a set per leave type (rows matched by branch / grade keep their id).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."leaveEligibilityReplace"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vType" uuid := ("pData" ->> 'leaveTypeId')::uuid;
  "vRules" jsonb := COALESCE("pData" -> 'rules', '[]'::jsonb);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "HumanResources"."LeaveTypes" WHERE "tenantId" = "vTenant" AND id = "vType") THEN
    RAISE EXCEPTION 'LeaveTypes % not found', "vType" USING ERRCODE = 'no_data_found';
  END IF;
  DELETE FROM "HumanResources"."LeaveEligibilityRules" r
   WHERE r."tenantId" = "vTenant" AND r."leaveTypeId" = "vType"
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements("vRules") x
                      WHERE x ->> 'scope' = r.scope
                        AND (x ->> 'branchId')::uuid IS NOT DISTINCT FROM r."branchId"
                        AND (x ->> 'gradeId')::uuid IS NOT DISTINCT FROM r."gradeId");
  UPDATE "HumanResources"."LeaveEligibilityRules" r
     SET "isIncluded" = COALESCE((x ->> 'isIncluded')::boolean, true), "daysOverride" = (x ->> 'daysOverride')::numeric
    FROM jsonb_array_elements("vRules") x
   WHERE r."tenantId" = "vTenant" AND r."leaveTypeId" = "vType" AND x ->> 'scope' = r.scope
     AND (x ->> 'branchId')::uuid IS NOT DISTINCT FROM r."branchId" AND (x ->> 'gradeId')::uuid IS NOT DISTINCT FROM r."gradeId"
     AND (r."isIncluded" IS DISTINCT FROM COALESCE((x ->> 'isIncluded')::boolean, true) OR r."daysOverride" IS DISTINCT FROM (x ->> 'daysOverride')::numeric);
  INSERT INTO "HumanResources"."LeaveEligibilityRules" ("tenantId", "leaveTypeId", scope, "branchId", "gradeId", "isIncluded", "daysOverride")
  SELECT "vTenant", "vType", x ->> 'scope', (x ->> 'branchId')::uuid, (x ->> 'gradeId')::uuid, COALESCE((x ->> 'isIncluded')::boolean, true), (x ->> 'daysOverride')::numeric
    FROM jsonb_array_elements("vRules") x
   WHERE NOT EXISTS (SELECT 1 FROM "HumanResources"."LeaveEligibilityRules" r
                      WHERE r."tenantId" = "vTenant" AND r."leaveTypeId" = "vType" AND r.scope = x ->> 'scope'
                        AND r."branchId" IS NOT DISTINCT FROM (x ->> 'branchId')::uuid AND r."gradeId" IS NOT DISTINCT FROM (x ->> 'gradeId')::uuid);
  RETURN "vType";
END $function$;

-- ---------------------------------------------------------------------------
-- 3. Every company's defaults: the EMP numbering series, the 7 standard leave types and the overtime policy (template
--    values, Shops & Establishments Ordinance 1969 / Maternity & Paternity Leave Act 2023). At provisioning, and
--    backfilled now. Existing rows are never overwritten.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."seedHrPeopleDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vCount" integer := 0;
  "vN" integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" WHERE "tenantId" = "pTenant" AND "docType" = 'EMP') THEN
    INSERT INTO "Company"."NumberingSeries" ("tenantId", "docType", "branchId", prefix, pattern, padding, "startValue", "resetPolicy", "isActive")
    SELECT "pTenant", d.code, NULL, d."defaultPrefix", d."defaultPattern", d."defaultPadding", 1, d."defaultResetPolicy", true
      FROM "Company"."DocumentTypes" d WHERE d.code = 'EMP';
    GET DIAGNOSTICS "vN" = ROW_COUNT; "vCount" := "vCount" + "vN";
  END IF;

  INSERT INTO "HumanResources"."LeaveTypes" ("tenantId", code, name, category, colour, "isPaid", "daysPerYear", description, "statuteNote",
    "accrualMethod", "accrualAmount", "carryForwardMode", "carryForwardMax", "accumulationCap", "carryExpiryMonths",
    "encashmentMode", "encashMaxDays", "encashBasis", "deductionBasis", "sandwichRule", "allowHalfDay", "blockInPayrollLock",
    "attachmentRequired", "attachmentAfterDays", "backdateDays", "minNoticeDays", "maxConsecutiveDays", "maxPerMonth", "maxTimesInService",
    "applyWindowDays", gender, "availableAfter", "probationRule", "approvalWorkflow", "sortOrder")
  SELECT "pTenant", v.* FROM (VALUES
    ('AL', 'Annual (Earned)', 'ANNUAL', 'GREEN', true, 18::numeric, 'Earned leave for planned vacations. Apply at least 7 days in advance.', 'Shops & Establishments Ordinance 1969',
      'MONTHLY', 1.5::numeric, 'CAPPED', 12::numeric, NULL::numeric, 12::smallint, 'YEAR_END', 6::numeric, 'BASIC_DIV_30', NULL, true, true, true,
      false, NULL::numeric, NULL::smallint, 7::smallint, 15::numeric, 10::numeric, NULL::smallint, NULL::smallint, 'ALL', 'CONFIRMATION', 'NOT_ALLOWED', 'MANAGER_HR', 1::smallint),
    ('CL', 'Casual', 'CASUAL', 'BLUE', true, 10, 'Short, unplanned absences. Lapses at year end.', 'Shops & Establishments Ordinance 1969',
      'UPFRONT', NULL, 'NONE', NULL, NULL, NULL, 'NOT_ALLOWED', NULL, NULL, NULL, true, true, false,
      false, NULL, NULL, NULL, 3, NULL, NULL, NULL, 'ALL', 'JOINING', 'PRO_RATA', 'MANAGER', 2),
    ('SL', 'Sick (Medical)', 'SICK', 'AMBER', true, 8, 'Illness or medical treatment. Medical certificate for more than 2 days.', 'Shops & Establishments Ordinance 1969',
      'UPFRONT', NULL, 'UNLIMITED', NULL, 30, NULL, 'NOT_ALLOWED', NULL, NULL, NULL, false, true, false,
      true, 2, 3, NULL, NULL, NULL, NULL, NULL, 'ALL', 'JOINING', 'PRO_RATA', 'MANAGER', 3),
    ('ML', 'Maternity', 'MATERNITY', 'VIOLET', true, 90, 'Paid maternity leave.', 'Maternity & Paternity Leave Act 2023',
      'EVENT_BASED', NULL, 'NONE', NULL, NULL, NULL, 'NOT_ALLOWED', NULL, NULL, NULL, false, false, false,
      false, NULL, NULL, NULL, NULL, NULL, 3, NULL, 'FEMALE', 'JOINING', 'ALLOWED', 'HR', 4),
    ('PL', 'Paternity', 'PATERNITY', 'TEAL', true, 30, 'Paid paternity leave, applied within 15 days of the birth.', 'Maternity & Paternity Leave Act 2023',
      'EVENT_BASED', NULL, 'NONE', NULL, NULL, NULL, 'NOT_ALLOWED', NULL, NULL, NULL, false, false, false,
      false, NULL, NULL, NULL, NULL, NULL, 3, 15, 'MALE', 'JOINING', 'ALLOWED', 'HR', 5),
    ('HJ', 'Hajj / Umrah', 'HAJJ_UMRAH', 'ORANGE', true, 15, 'Once in service. Visa / ticket copy required.', NULL,
      'ONCE_IN_SERVICE', NULL, 'NONE', NULL, NULL, NULL, 'NOT_ALLOWED', NULL, NULL, NULL, false, false, false,
      true, 0, NULL, NULL, NULL, NULL, 1, NULL, 'ALL', 'TWO_YEARS', 'NOT_ALLOWED', 'MANAGER_HR_CEO', 6),
    ('UL', 'Unpaid (LWP)', 'UNPAID', 'GREY', false, 30, 'Leave without pay, once paid leave is exhausted.', NULL,
      'NONE', NULL, 'NONE', NULL, NULL, NULL, 'NOT_ALLOWED', NULL, NULL, 'GROSS_DIV_30', true, true, false,
      false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'ALL', 'JOINING', 'ALLOWED', 'MANAGER_HR', 7)
  ) AS v
   WHERE NOT EXISTS (SELECT 1 FROM "HumanResources"."LeaveTypes" t WHERE t."tenantId" = "pTenant" AND t.code = v.column1);
  GET DIAGNOSTICS "vN" = ROW_COUNT; "vCount" := "vCount" + "vN";

  IF NOT EXISTS (SELECT 1 FROM "HumanResources"."OvertimePolicies" WHERE "tenantId" = "pTenant") THEN
    INSERT INTO "HumanResources"."OvertimePolicies" ("tenantId", name, "statuteNote", "weekdayMultiplier", "weeklyOffMultiplier", "holidayMultiplier",
      "hourlyRateBasis", "minMinutes", "dailyCapHours", "monthlyCapHours", rounding, "requiresPreApproval", "allowCompOff", "isActive")
    VALUES ("pTenant", 'Standard', 'Factories Act 1934 / Punjab Shops Ordinance aligned', 1.5, 2.0, 2.0, 'GROSS_26_8', 30, 4, 48, 'NEAREST_30', true, true, true);
    GET DIAGNOSTICS "vN" = ROW_COUNT; "vCount" := "vCount" + "vN";
  END IF;
  RETURN "vCount";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."triggerTenantHrPeopleDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "HumanResources"."seedHrPeopleDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsHrPeopleDefaults" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsHrPeopleDefaults" AFTER INSERT ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "HumanResources"."triggerTenantHrPeopleDefaults"();

SELECT set_config('app.actorLabel', 'seedHrPeopleDefaultsFor', true);
SELECT "HumanResources"."seedHrPeopleDefaultsFor"(t.id) FROM "Platform"."Tenants" t;

-- ---------------------------------------------------------------------------
-- 4. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('EMPLOYEE_IN_USE',               409, 'BUSINESS_RULE', 'HR', 'Other records use this employee (reports, a login, a branch or department head). Exit the employee instead.', 'Delete of a used employee', true, NULL),
  ('EMPLOYEE_MANAGER_CYCLE',        400, 'VALIDATION',    'HR', 'An employee can''t report, directly or indirectly, to themselves.', 'Reporting manager cycle', true, NULL),
  ('EMPLOYEE_USE_POSITION_CHANGE',  400, 'VALIDATION',    'HR', 'Department, designation, grade, branch, manager and type change through Transfer or Promote, so the change is kept in position history.', 'Position fields edited directly', true, NULL),
  ('EMPLOYEE_USER_LINKED',          409, 'BUSINESS_RULE', 'HR', 'This user is already linked to another employee.', 'User linked twice', true, NULL),
  ('EMPLOYEE_EXITED',               409, 'BUSINESS_RULE', 'HR', 'This employee has exited. Rejoin them first.', 'Change on an exited employee', true, NULL),
  ('LEAVE_TYPE_IN_USE',             409, 'BUSINESS_RULE', 'HR', 'Leave requests or balances use this leave type. Deactivate it instead.', 'Delete of a used leave type', true, NULL),
  ('OVERTIME_POLICY_ACTIVE_EXISTS', 409, 'BUSINESS_RULE', 'HR', 'Only one overtime policy can be active. Deactivate the current one first.', 'Second active overtime policy', true, NULL),
  ('DEVICE_IN_USE',                 409, 'BUSINESS_RULE', 'HR', 'Punches or sync logs come from this device. Deactivate it instead.', 'Delete of a used biometric device', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 5. Readable labels and tones for the Phase 11 selects and badges (codes unchanged)
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" l
   SET "label" = v.label, "tone" = v.tone
  FROM (VALUES
    ('BloodGroup','A-','A−','neutral'), ('BloodGroup','B-','B−','neutral'), ('BloodGroup','AB+','AB+','neutral'), ('BloodGroup','AB-','AB−','neutral'), ('BloodGroup','O-','O−','neutral'),
    ('EmployeeStatus','ACTIVE','Active','good'), ('EmployeeStatus','PROBATION','Probation','info'), ('EmployeeStatus','ON_LEAVE','On leave','warn'),
    ('EmployeeStatus','NOTICE_PERIOD','Notice period','danger'), ('EmployeeStatus','EXITED','Exited','neutral'),
    ('EmploymentType','PROBATION','Probation','neutral'), ('EmploymentType','INTERNSHIP','Internship','neutral'),
    ('EmployeeStatutoryDetailAtlStatus','FILER','Filer (Active)','good'), ('EmployeeStatutoryDetailAtlStatus','NON_FILER','Non-filer','warn'),
    ('EmployeeStatutoryDetailSocialSecurityScheme','BESSI','BESSI','neutral'), ('BranchHrSettingSocialSecurityScheme','BESSI','BESSI','neutral'),
    ('EmployeeBankAccountPaymentMode','BANK','Bank transfer','neutral'),
    ('PayGroup','MANAGEMENT','Management','neutral'), ('PayGroup','STAFF','Staff','neutral'),
    ('WorkPattern','FULL_TIME','Full-time','neutral'), ('WorkPattern','PART_TIME','Part-time','neutral'),
    ('ExitType','CONTRACT_END','Contract end','neutral'),
    ('PositionChangeEventType','JOINED','Joined','good'), ('PositionChangeEventType','PROMOTED','Promoted','good'), ('PositionChangeEventType','TRANSFER','Transferred','info'),
    ('PositionChangeEventType','REHIRED','Rejoined','good'),
    ('AccrualMethod','MONTHLY','Monthly','neutral'), ('AccrualMethod','UPFRONT','Upfront','neutral'), ('AccrualMethod','EVENT_BASED','Event-based','neutral'), ('AccrualMethod','ONCE_IN_SERVICE','Once in service','neutral'), ('AccrualMethod','NONE','None','neutral'),
    ('ApprovalWorkflow','MANAGER','Line manager only','neutral'), ('ApprovalWorkflow','HR','HR only','neutral'), ('ApprovalWorkflow','MANAGER_HR','Line manager → HR','neutral'), ('ApprovalWorkflow','MANAGER_HR_CEO','Manager → HR → CEO','neutral'),
    ('AvailableAfter','SIX_MONTHS','6 months','neutral'), ('AvailableAfter','ONE_YEAR','1 year','neutral'), ('AvailableAfter','TWO_YEARS','2 years','neutral'),
    ('ProbationRule','PRO_RATA','Pro-rata','neutral'),
    ('LeaveTypeCategory','HAJJ_UMRAH','Hajj / Umrah','neutral'), ('LeaveTypeCategory','COMP_OFF','Comp-off','neutral'),
    ('LeaveTypeGender','FEMALE','Female only','violet'), ('LeaveTypeGender','MALE','Male only','info'),
    ('EncashmentMode','YEAR_END','At year end','neutral'), ('EncashmentMode','EXIT_ONLY','At exit only','neutral'),
    ('EncashBasis','BASIC_DIV_30','Basic ÷ 30 per day','neutral'), ('EncashBasis','GROSS_DIV_30','Gross ÷ 30 per day','neutral'),
    ('DeductionBasis','GROSS_DIV_30','Gross ÷ 30 per day','neutral'), ('DeductionBasis','BASIC_DIV_30','Basic ÷ 30 per day','neutral'), ('DeductionBasis','GROSS_DIV_26','Gross ÷ 26 per day','neutral'),
    ('HourlyRateBasis','GROSS_26_8','Gross ÷ 26 ÷ 8','neutral'), ('HourlyRateBasis','BASIC_26_8','Basic ÷ 26 ÷ 8','neutral'), ('HourlyRateBasis','GROSS_30_8','Gross ÷ 30 ÷ 8','neutral'),
    ('Rounding','NEAREST_30','Nearest 30 min','neutral'), ('Rounding','NEAREST_15','Nearest 15 min','neutral'),
    ('Brand','ZKTECO','ZKTeco','neutral'), ('ConnectionType','ADMS_PUSH','ADMS push (cloud)','neutral'), ('ConnectionType','TCP_PULL','TCP/IP pull','neutral'),
    ('BiometricDevicePunchDirection','AUTO','Auto (first in / last out)','neutral'),
    ('Operation','TIME_SYNC','Time sync (NTP)','neutral')
  ) AS v(type, code, label, tone)
 WHERE l."lookupType" = v.type AND l.code = v.code AND l."tenantId" IS NULL
   AND (l."label" IS DISTINCT FROM v.label OR l."tone" IS DISTINCT FROM v.tone);
