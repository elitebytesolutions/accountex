-- Phase 15: Self-service & reporting setup (helpdesk categories & FAQs, company announcements, polls & pulse surveys,
-- saved reports). Idempotent. Apply with: npx prisma db execute --file prisma/sql/021-self-service-setup.sql

-- ---------------------------------------------------------------------------
-- 1. Row history on the tables that had none (SavedReports, SavedReportShares, ReportSchedules already have it)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "helpdeskCategoriesAudit" ON "EmployeeSelfService"."HelpdeskCategories";
CREATE TRIGGER "helpdeskCategoriesAudit" AFTER INSERT OR UPDATE OR DELETE ON "EmployeeSelfService"."HelpdeskCategories"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "helpdeskFaqsAudit" ON "EmployeeSelfService"."HelpdeskFaqs";
CREATE TRIGGER "helpdeskFaqsAudit" AFTER INSERT OR UPDATE OR DELETE ON "EmployeeSelfService"."HelpdeskFaqs"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "companyAnnouncementsAudit" ON "EmployeeSelfService"."CompanyAnnouncements";
CREATE TRIGGER "companyAnnouncementsAudit" AFTER INSERT OR UPDATE OR DELETE ON "EmployeeSelfService"."CompanyAnnouncements"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "pollsAudit" ON "EmployeeSelfService"."Polls";
CREATE TRIGGER "pollsAudit" AFTER INSERT OR UPDATE OR DELETE ON "EmployeeSelfService"."Polls"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "pollOptionsAudit" ON "EmployeeSelfService"."PollOptions";
CREATE TRIGGER "pollOptionsAudit" AFTER INSERT OR UPDATE OR DELETE ON "EmployeeSelfService"."PollOptions"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "pulseSurveysAudit" ON "EmployeeSelfService"."PulseSurveys";
CREATE TRIGGER "pulseSurveysAudit" AFTER INSERT OR UPDATE OR DELETE ON "EmployeeSelfService"."PulseSurveys"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "pulseSurveyQuestionsAudit" ON "EmployeeSelfService"."PulseSurveyQuestions";
CREATE TRIGGER "pulseSurveyQuestionsAudit" AFTER INSERT OR UPDATE OR DELETE ON "EmployeeSelfService"."PulseSurveyQuestions"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "savedReportColumnsAudit" ON "Reports"."SavedReportColumns";
CREATE TRIGGER "savedReportColumnsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Reports"."SavedReportColumns"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Every company's defaults: the template's four helpdesk desks (HR, Payroll, IT, Admin) with their SLAs, and the
--    template's weekly pulse questions as a DRAFT survey. At provisioning, and backfilled now. Existing rows are kept.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."seedSelfServiceDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vCount" integer := 0;
  "vN" integer;
  "vSurvey" uuid;
BEGIN
  INSERT INTO "EmployeeSelfService"."HelpdeskCategories" ("tenantId", code, name, description, "slaHours", "highPrioritySlaFactor",
    "routingKeywords", icon, "sortOrder", status)
  SELECT "pTenant", v.code, v.name, v.descr, v.sla, 0.5, v.kw, v.icon, v.ord, 'ACTIVE'
    FROM (VALUES
      ('HR', 'HR', 'Policies, insurance, letters, leave rules', 72::numeric, ARRAY['insurance', 'leave', 'letter'], 'users', 1),
      ('PAYROLL', 'Payroll', 'Salary, commission, tax, deductions', 48::numeric, ARRAY['salary', 'commission', 'tax', 'payslip'], 'banknote', 2),
      ('IT', 'IT', 'Laptop, VPN, email, mobile app access', 24::numeric, ARRAY['laptop', 'vpn', 'email', 'password'], 'laptop', 3),
      ('ADMIN', 'Admin', 'Parking, travel desk, stationery, ID cards', 72::numeric, ARRAY['parking', 'card', 'travel'], 'building-2', 4)
    ) AS v(code, name, descr, sla, kw, icon, ord)
   WHERE NOT EXISTS (SELECT 1 FROM "EmployeeSelfService"."HelpdeskCategories" c WHERE c."tenantId" = "pTenant" AND c.code = v.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT; "vCount" := "vCount" + "vN";

  -- The pulse survey only for a company with no surveys yet (surveys have no code to match on).
  IF NOT EXISTS (SELECT 1 FROM "EmployeeSelfService"."PulseSurveys" WHERE "tenantId" = "pTenant") THEN
    INSERT INTO "EmployeeSelfService"."PulseSurveys" ("tenantId", title, "periodFrom", "periodTo", "isAnonymous", status)
    VALUES ("pTenant", 'Weekly pulse', current_date, current_date + 6, true, 'DRAFT')
    RETURNING id INTO "vSurvey";
    INSERT INTO "EmployeeSelfService"."PulseSurveyQuestions" ("tenantId", "surveyId", seq, "questionText", "lowLabel", "highLabel", "metricKey")
    VALUES
      ("pTenant", "vSurvey", 1, 'How manageable was your workload this week?', 'Overwhelming', 'Very manageable', 'WORKLOAD'),
      ("pTenant", "vSurvey", 2, 'Did you get the support you needed from your manager?', 'Not at all', 'Fully', 'MANAGER_SUPPORT'),
      ("pTenant", "vSurvey", 3, 'How likely are you to recommend us as a place to work?', 'Unlikely', 'Very likely', 'ENPS');
    "vCount" := "vCount" + 4;
  END IF;
  RETURN "vCount";
END $function$;

CREATE OR REPLACE FUNCTION "EmployeeSelfService"."triggerTenantSelfServiceDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "EmployeeSelfService"."seedSelfServiceDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsSelfServiceDefaults" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsSelfServiceDefaults" AFTER INSERT ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "EmployeeSelfService"."triggerTenantSelfServiceDefaults"();

SELECT set_config('app.actorLabel', 'seedSelfServiceDefaultsFor', true);
SELECT "EmployeeSelfService"."seedSelfServiceDefaultsFor"(t.id) FROM "Platform"."Tenants" t;

-- ---------------------------------------------------------------------------
-- 3. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('HELPDESK_CATEGORY_IN_USE', 409, 'BUSINESS_RULE', 'HR',     'FAQs or tickets use this helpdesk category. Deactivate it instead.', 'Delete of a used helpdesk category', true, NULL),
  ('ANNOUNCEMENT_NOT_DRAFT',   409, 'BUSINESS_RULE', 'HR',     'Only draft announcements can be edited. Published ones can only be archived.', 'Edit of a published or archived announcement', true, NULL),
  ('POLL_NOT_DRAFT',           409, 'BUSINESS_RULE', 'HR',     'Only draft polls and surveys can be edited or deleted.', 'Edit or delete of an open or closed poll / pulse survey', true, NULL),
  ('POLL_IN_USE',              409, 'BUSINESS_RULE', 'HR',     'Employees have already answered. Close it instead.', 'Delete of a poll / pulse survey with votes or responses', true, NULL),
  ('REPORT_SOURCE_FORBIDDEN',  403, 'PERMISSION',    'SYSTEM', 'You do not have access to this report''s data source.', 'Report preview without the source module''s view permission', true, NULL),
  ('REPORT_FIELD_NOT_ALLOWED', 400, 'VALIDATION',    'SYSTEM', 'This report uses a field its data source does not offer.', 'Report column, filter, group or sort outside the source allow-list', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 4. Tones for the Phase 15 badges (codes and labels unchanged)
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" l
   SET "tone" = v.tone
  FROM (VALUES
    ('CompanyAnnouncementStatus', 'DRAFT', 'neutral'), ('CompanyAnnouncementStatus', 'PUBLISHED', 'good'), ('CompanyAnnouncementStatus', 'ARCHIVED', 'warn'),
    ('DraftOpenClosedStatus', 'DRAFT', 'neutral'), ('DraftOpenClosedStatus', 'OPEN', 'good'), ('DraftOpenClosedStatus', 'CLOSED', 'info'),
    ('CompanyAnnouncementKind', 'GENERAL', 'neutral'), ('CompanyAnnouncementKind', 'EVENT', 'info'), ('CompanyAnnouncementKind', 'POLICY_UPDATE', 'warn'),
    ('CompanyAnnouncementKind', 'BENEFIT', 'good'), ('CompanyAnnouncementKind', 'CELEBRATION', 'violet'),
    ('ReportScheduleStatus', 'ACTIVE', 'good'), ('ReportScheduleStatus', 'PAUSED', 'warn')
  ) AS v(type, code, tone)
 WHERE l."lookupType" = v.type AND l.code = v.code AND l."tenantId" IS NULL
   AND l."tone" IS DISTINCT FROM v.tone;
