-- Phase 13: Talent & policy setup (onboarding templates, performance cycles, training programs, company policies).
-- Idempotent: safe to run repeatedly via npm run db:sql (or: npx prisma db execute --file prisma/sql/019-talent-setup.sql).

-- ---------------------------------------------------------------------------
-- 1. Row history on the tables that had none (TrainingPrograms and CompanyPolicies are already audited)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "onboardingTemplatesAudit" ON "HumanResources"."OnboardingTemplates";
CREATE TRIGGER "onboardingTemplatesAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."OnboardingTemplates"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "onboardingTemplateTasksAudit" ON "HumanResources"."OnboardingTemplateTasks";
CREATE TRIGGER "onboardingTemplateTasksAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."OnboardingTemplateTasks"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "performanceCyclesAudit" ON "HumanResources"."PerformanceCycles";
CREATE TRIGGER "performanceCyclesAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."PerformanceCycles"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. A published policy version is immutable: the only change allowed is retiring it (status -> RETIRED, plus the
--    row stamps). Anything else, from the app or from direct SQL, raises POLICY_PUBLISHED_IMMUTABLE.
--    Named so it fires before "companyPoliciesTouch" (BEFORE triggers run in name order); stamps are ignored anyway.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."triggerCompanyPolicyImmutable"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vStamps" text[] := ARRAY['status', 'updatedAt', 'updatedBy', 'rowVersion'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'PUBLISHED' THEN
      RAISE EXCEPTION 'Policy % v% is published and can''t be deleted; retire it instead', OLD.code, OLD.version
        USING ERRCODE = 'check_violation', HINT = 'POLICY_PUBLISHED_IMMUTABLE';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'PUBLISHED' THEN
    IF (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'RETIRED')
       OR (to_jsonb(NEW) - "vStamps") IS DISTINCT FROM (to_jsonb(OLD) - "vStamps") THEN
      RAISE EXCEPTION 'Policy % v% is published and can''t be changed; create a new version instead', OLD.code, OLD.version
        USING ERRCODE = 'check_violation', HINT = 'POLICY_PUBLISHED_IMMUTABLE';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "companyPoliciesImmutable" ON "EmployeeSelfService"."CompanyPolicies";
CREATE TRIGGER "companyPoliciesImmutable" BEFORE UPDATE OR DELETE ON "EmployeeSelfService"."CompanyPolicies"
  FOR EACH ROW EXECUTE FUNCTION "EmployeeSelfService"."triggerCompanyPolicyImmutable"();

-- ---------------------------------------------------------------------------
-- 3. Every company's default onboarding checklist (template app/hr/onboarding, "Checklist Template" panel).
--    At provisioning, and backfilled now. Existing rows are never overwritten.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."seedTalentDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vCount" integer := 0;
  "vTemplate" uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "HumanResources"."OnboardingTemplates" WHERE "tenantId" = "pTenant" AND name = 'Standard Staff Onboarding') THEN
    INSERT INTO "HumanResources"."OnboardingTemplates" ("tenantId", name, track, "isDefault", "isActive")
    VALUES ("pTenant", 'Standard Staff Onboarding', 'NEW_JOINER',
            NOT EXISTS (SELECT 1 FROM "HumanResources"."OnboardingTemplates" WHERE "tenantId" = "pTenant" AND track = 'NEW_JOINER' AND "isDefault" AND "deletedAt" IS NULL),
            true)
    RETURNING id INTO "vTemplate";
    "vCount" := 1;

    INSERT INTO "HumanResources"."OnboardingTemplateTasks" ("tenantId", "templateId", "taskGroup", title, "ownerFunction", "dueOffsetDays", "actionKind", "sortOrder")
    SELECT "pTenant", "vTemplate", v.grp, v.title, v.owner, v.due, v.act, v.ord
      FROM (VALUES
        ('DOCUMENTS',         'CNIC copy, 2 photos, degrees verified',             'HR',      -3, 'UPLOAD',     1),
        ('DOCUMENTS',         'Signed offer & appointment letter',                 'HR',      -3, 'UPLOAD',     2),
        ('DOCUMENTS',         'Experience & police character certificate',         'HR',       7, 'UPLOAD',     3),
        ('STATUTORY_FINANCE', 'EOBI registration (PR-02) within 15 days',          'HR',      15, 'NONE',       4),
        ('STATUTORY_FINANCE', 'PESSI / SESSI card',                                'HR',      15, 'NONE',       5),
        ('STATUTORY_FINANCE', 'Bank account & IBAN (Meezan salary account)',       'FINANCE',  7, 'NONE',       6),
        ('STATUTORY_FINANCE', 'NTN / ATL status & PF nomination',                  'FINANCE',  7, 'NONE',       7),
        ('IT_ADMIN',          'Laptop, email, Finsoft ESS login',                  'IT',       0, 'NONE',       8),
        ('IT_ADMIN',          'Biometric enrolment & ID card',                     'ADMIN',    0, 'NONE',       9),
        ('ORIENTATION',       'Day-1 induction & HR policies',                     'HR',       0, 'POLICY_ACK', 10),
        ('ORIENTATION',       'Department orientation & buddy intro',              'MANAGER',  1, 'BOOK_BUDDY', 11),
        ('ORIENTATION',       '30-day check-in with manager',                      'MANAGER', 30, 'NONE',       12)
      ) AS v(grp, title, owner, due, act, ord);
    "vCount" := "vCount" + 12;
  END IF;
  RETURN "vCount";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."triggerTenantTalentDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "HumanResources"."seedTalentDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsTalentDefaults" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsTalentDefaults" AFTER INSERT ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "HumanResources"."triggerTenantTalentDefaults"();

SELECT set_config('app.actorLabel', 'seedTalentDefaultsFor', true);
SELECT "HumanResources"."seedTalentDefaultsFor"(t.id) FROM "Platform"."Tenants" t;

-- ---------------------------------------------------------------------------
-- 4. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('ONBOARDING_TEMPLATE_IN_USE',      409, 'BUSINESS_RULE', 'HR', 'Onboardings were started from this template. Deactivate it instead.', 'Delete of a used onboarding template', true, NULL),
  ('PERFORMANCE_CYCLE_ACTIVE_EXISTS', 409, 'BUSINESS_RULE', 'HR', 'Another appraisal cycle is already active. Close it before opening this one.', 'Second active performance cycle', true, NULL),
  ('PERFORMANCE_CYCLE_CLOSED',        409, 'BUSINESS_RULE', 'HR', 'This appraisal cycle is closed and can''t be changed.', 'Change to a closed performance cycle', true, NULL),
  ('PERFORMANCE_CYCLE_IN_USE',        409, 'BUSINESS_RULE', 'HR', 'Goals, reviews, feedback or 1:1s belong to this cycle, or it is no longer a draft. Close it instead.', 'Delete of a used or non-draft performance cycle', true, NULL),
  ('TRAINING_PROGRAM_IN_USE',         409, 'BUSINESS_RULE', 'HR', 'Sessions or enrolments use this program. Cancel it instead.', 'Delete of a used training program', true, NULL),
  ('POLICY_PUBLISHED_IMMUTABLE',      409, 'BUSINESS_RULE', 'HR', 'A published policy can''t be changed. Create a new version, or retire it.', 'Change to a published policy version', true, NULL),
  ('POLICY_IN_USE',                   409, 'BUSINESS_RULE', 'HR', 'Acknowledgements, announcements or later versions refer to this policy. Retire it instead.', 'Delete of a used policy', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 5. Readable labels and tones for the Phase 13 selects and badges (codes unchanged; template wording)
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" l
   SET "label" = v.label, "tone" = v.tone
  FROM (VALUES
    ('TaskGroup','STATUTORY_FINANCE','Statutory & Finance','neutral'), ('TaskGroup','IT_ADMIN','IT & Admin','neutral'),
    ('ActionKind','POLICY_ACK','Policy acknowledgement','neutral'),
    ('CycleType','HALF_YEARLY','Half-yearly','neutral'),
    ('PerformanceCycleStage','SIGN_OFF','Sign-off & letters','neutral'),
    ('PerformanceCycleStatus','CLOSED','Closed','neutral'),
    ('TrainingProgramStatus','PLANNED','Planned','info'), ('TrainingProgramStatus','IN_PROGRESS','In progress','info'),
    ('CompanyPolicyStatus','RETIRED','Retired','neutral')
  ) AS v(type, code, label, tone)
 WHERE l."lookupType" = v.type AND l.code = v.code AND l."tenantId" IS NULL
   AND (l."label" IS DISTINCT FROM v.label OR l."tone" IS DISTINCT FROM v.tone);
