-- Phase 10: Organisation (departments, designations, grades, work shifts, holidays). Idempotent. Apply with: npm run db:sql

-- ---------------------------------------------------------------------------
-- 1. Row history on the tables that had none
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "designationsAudit" ON "HumanResources"."Designations";
CREATE TRIGGER "designationsAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."Designations"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "workShiftsAudit" ON "HumanResources"."WorkShifts";
CREATE TRIGGER "workShiftsAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."WorkShifts"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "holidaysAudit" ON "HumanResources"."Holidays";
CREATE TRIGGER "holidaysAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."Holidays"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "holidayBranchesAudit" ON "HumanResources"."HolidayBranches";
CREATE TRIGGER "holidayBranchesAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."HolidayBranches"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Every company's defaults: the General shift (default) and the FY 2026-27 Pakistan public holidays from the template.
--    At provisioning, and backfilled now. Existing rows are never overwritten.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."seedOrganisationDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vCount" integer := 0;
  "vN" integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "HumanResources"."WorkShifts" WHERE "tenantId" = "pTenant" AND code = 'GEN') THEN
    INSERT INTO "HumanResources"."WorkShifts" ("tenantId", code, name, description, colour, "startTime", "endTime", "crossesMidnight",
      "graceMinutes", "breakStart", "breakEnd", "fridayExtendedBreak", "fridayBreakEnd", "halfDayBelowHours", "lateMarksPerHalfDay", "overtimeAfterMinutes",
      "weeklyOff", "isDefault", status)
    VALUES ("pTenant", 'GEN', 'General', 'Default — offices', 'TEAL', '09:00', '18:00', false, 15, '13:00', '14:00', true, '14:30', 4, 3, 30,
      'SUNDAY', NOT EXISTS (SELECT 1 FROM "HumanResources"."WorkShifts" WHERE "tenantId" = "pTenant" AND "isDefault" AND "deletedAt" IS NULL), 'ACTIVE');
    GET DIAGNOSTICS "vN" = ROW_COUNT; "vCount" := "vCount" + "vN";
  END IF;

  -- Holidays only for a company with no calendar yet (holidays have no code to match on).
  IF NOT EXISTS (SELECT 1 FROM "HumanResources"."Holidays" WHERE "tenantId" = "pTenant") THEN
    INSERT INTO "HumanResources"."Holidays" ("tenantId", name, "fromDate", "toDate", "holidayType", "isMoonDependent", "hijriNote", "eligibilityNote",
      "appliesToAllBranches", status, source, "notifyEss")
    SELECT "pTenant", v.name, v.f::date, v.t::date, v.typ, v.moon, v.hijri, v.elig, true,
           CASE WHEN v.t::date < current_date THEN 'OBSERVED' WHEN v.moon AND v.typ = 'PUBLIC' THEN 'TENTATIVE' ELSE 'UPCOMING' END, 'GAZETTE', true
      FROM (VALUES
        ('Independence Day', '2026-08-14', '2026-08-14', 'PUBLIC', false, NULL, NULL),
        ('Eid Milad-un-Nabi ﷺ', '2026-08-26', '2026-08-26', 'PUBLIC', true, '12 Rabi-ul-Awwal 1448', NULL),
        ('Diwali', '2026-11-08', '2026-11-08', 'OPTIONAL', false, NULL, 'Hindu staff'),
        ('Iqbal Day', '2026-11-09', '2026-11-09', 'PUBLIC', false, NULL, NULL),
        ('Quaid-e-Azam Day / Christmas', '2026-12-25', '2026-12-25', 'PUBLIC', false, NULL, NULL),
        ('Day after Christmas', '2026-12-26', '2026-12-26', 'OPTIONAL', false, NULL, 'Christian staff'),
        ('Kashmir Solidarity Day', '2027-02-05', '2027-02-05', 'PUBLIC', false, NULL, NULL),
        ('Eid-ul-Fitr', '2027-03-10', '2027-03-12', 'PUBLIC', true, '1–3 Shawwal 1448', NULL),
        ('Pakistan Day', '2027-03-23', '2027-03-23', 'PUBLIC', false, NULL, NULL),
        ('Labour Day', '2027-05-01', '2027-05-01', 'PUBLIC', false, NULL, NULL),
        ('Eid-ul-Adha', '2027-05-17', '2027-05-19', 'PUBLIC', true, '10–12 Zil Hajj 1448', NULL),
        ('Ashura (9th & 10th Muharram)', '2027-06-15', '2027-06-16', 'PUBLIC', true, '9–10 Muharram 1449', NULL),
        ('Independence Day', '2027-08-14', '2027-08-14', 'PUBLIC', false, NULL, NULL)
      ) AS v(name, f, t, typ, moon, hijri, elig);
    GET DIAGNOSTICS "vN" = ROW_COUNT; "vCount" := "vCount" + "vN";
  END IF;
  RETURN "vCount";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."triggerTenantOrganisationDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "HumanResources"."seedOrganisationDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsOrganisationDefaults" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsOrganisationDefaults" AFTER INSERT ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "HumanResources"."triggerTenantOrganisationDefaults"();

SELECT set_config('app.actorLabel', 'seedOrganisationDefaultsFor', true);
SELECT "HumanResources"."seedOrganisationDefaultsFor"(t.id) FROM "Platform"."Tenants" t;

-- ---------------------------------------------------------------------------
-- 3. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('DEPARTMENT_IN_USE',             409, 'BUSINESS_RULE', 'HR', 'Sub-departments, designations, employees or documents use this department. Deactivate it instead.', 'Delete of a used department', true, NULL),
  ('DEPARTMENT_CYCLE',              400, 'VALIDATION',    'HR', 'A department can''t sit under one of its own sub-departments.', 'Department hierarchy cycle', true, NULL),
  ('DEPARTMENT_HAS_ACTIVE_CHILDREN',409, 'BUSINESS_RULE', 'HR', 'Deactivate or move its active sub-departments first.', 'Deactivate a department with active children', true, NULL),
  ('DESIGNATION_IN_USE',            409, 'BUSINESS_RULE', 'HR', 'Employees, other designations or job openings use this designation. Deactivate it instead.', 'Delete of a used designation', true, NULL),
  ('DESIGNATION_CYCLE',             400, 'VALIDATION',    'HR', 'A designation can''t report, directly or indirectly, to itself.', 'Designation reporting cycle', true, NULL),
  ('GRADE_IN_USE',                  409, 'BUSINESS_RULE', 'HR', 'Designations, employees or policies use this grade. Deactivate it instead.', 'Delete of a used grade', true, NULL),
  ('SHIFT_IN_USE',                  409, 'BUSINESS_RULE', 'HR', 'Employees, rosters or attendance use this shift. Deactivate it instead.', 'Delete of a used shift', true, NULL),
  ('SHIFT_DEFAULT_REQUIRED',        409, 'BUSINESS_RULE', 'HR', 'This is the default shift. Make another shift the default first.', 'Delete or deactivate the default shift', true, NULL),
  ('HOLIDAY_IN_USE',                409, 'BUSINESS_RULE', 'HR', 'Attendance already uses this holiday. Cancel it instead.', 'Delete of a used holiday', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 4. Readable labels and tones for the Phase 10 selects (codes unchanged)
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" l
   SET "label" = v.label, "tone" = v.tone
  FROM (VALUES
    ('WeeklyOff','SUNDAY','Sunday','neutral'), ('WeeklyOff','FRIDAY','Friday','neutral'), ('WeeklyOff','SATURDAY_SUNDAY','Saturday & Sunday','neutral'), ('WeeklyOff','ROTATING','Rotating','neutral'),
    ('HolidayType','PUBLIC','Public','good'), ('HolidayType','COMPANY','Company','info'), ('HolidayType','OPTIONAL','Optional','violet'), ('HolidayType','EVENT','Company event','info'),
    ('HolidayStatus','UPCOMING','Upcoming','good'), ('HolidayStatus','TENTATIVE','Tentative','warn'), ('HolidayStatus','OBSERVED','Observed','neutral'), ('HolidayStatus','CANCELLED','Cancelled','danger'),
    ('Division','COMMERCIAL','Commercial','info'), ('Division','OPERATIONS','Operations','warn'), ('Division','SUPPORT','Support','violet')
  ) AS v(type, code, label, tone)
 WHERE l."lookupType" = v.type AND l.code = v.code AND l."tenantId" IS NULL
   AND (l."label" IS DISTINCT FROM v.label OR l."tone" IS DISTINCT FROM v.tone);
