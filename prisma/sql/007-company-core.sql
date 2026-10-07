-- Phase 1: Company core (branches, currencies & exchange rates, company settings & setup guide, numbering series).
-- Idempotent. Apply with: npm run db:sql

-- ---------------------------------------------------------------------------
-- 1. Audit coverage (row history). NumberingSeriesCounters is deliberately NOT audited: it changes on every
--    document, and each document keeps its own history.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "currenciesAudit" ON "Company"."Currencies";
CREATE TRIGGER "currenciesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Company"."Currencies"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "setupGuideStepsAudit" ON "Company"."SetupGuideSteps";
CREATE TRIGGER "setupGuideStepsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Company"."SetupGuideSteps"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Error catalogue: SQLSTATEs raised by the existing *AddUpdate functions, plus Phase 1 business rules
-- ---------------------------------------------------------------------------
UPDATE "Platform"."ErrorCodes" SET "sqlState" = '40001' WHERE "code" = 'CONCURRENCY_CONFLICT' AND "sqlState" IS DISTINCT FROM '40001';
UPDATE "Platform"."ErrorCodes" SET "sqlState" = 'P0002' WHERE "code" = 'NOT_FOUND' AND "sqlState" IS DISTINCT FROM 'P0002';

INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged")
VALUES
  ('BRANCH_DEFAULT_REQUIRED',  409, 'BUSINESS_RULE', 'SYSTEM', 'The default branch must stay active. Make another branch the default first.', 'Default branch deactivated or deleted', true),
  ('BRANCH_LAST_ACTIVE',       409, 'BUSINESS_RULE', 'SYSTEM', 'At least one branch must stay active.', 'Last active branch deactivated', true),
  ('BRANCH_INACTIVE',          409, 'BUSINESS_RULE', 'SYSTEM', 'An inactive branch cannot be the default. Activate it first.', 'Inactive branch made default', true),
  ('COMPANY_PROFILE_REQUIRED', 409, 'BUSINESS_RULE', 'SYSTEM', 'Complete and save the company profile first.', 'Settings section saved before the profile row exists', true),
  ('NUMBERING_IN_USE',         409, 'BUSINESS_RULE', 'SYSTEM', 'This series has already issued numbers, so its format cannot change and it cannot be deleted.', 'Prefix/pattern/padding/type/branch changed or delete after first number', true),
  ('NUMBERING_SERIES_MISSING', 409, 'BUSINESS_RULE', 'SYSTEM', 'No active numbering series exists for this document type.', 'nextDocumentNumber found no series', true),
  ('FX_BASE_CURRENCY',         422, 'VALIDATION',    'FINANCE', 'The base currency does not need an exchange rate.', 'Exchange rate entered for the base currency', true)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 3. Branch rules
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."triggerBranchGuard"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."isDefault" THEN
      RAISE EXCEPTION 'The default branch cannot be deleted' USING ERRCODE = 'check_violation', HINT = 'BRANCH_DEFAULT_REQUIRED';
    END IF;
    RETURN OLD;
  END IF;

  -- Leaving the active set: deactivated or soft-deleted.
  IF OLD."status" = 'ACTIVE' AND OLD."deletedAt" IS NULL AND (NEW."status" <> 'ACTIVE' OR NEW."deletedAt" IS NOT NULL) THEN
    IF NEW."isDefault" THEN
      RAISE EXCEPTION 'The default branch must stay active' USING ERRCODE = 'check_violation', HINT = 'BRANCH_DEFAULT_REQUIRED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "Company"."Branches" b
                    WHERE b."tenantId" = NEW."tenantId" AND b."id" <> NEW."id" AND b."status" = 'ACTIVE' AND b."deletedAt" IS NULL) THEN
      RAISE EXCEPTION 'At least one branch must stay active' USING ERRCODE = 'check_violation', HINT = 'BRANCH_LAST_ACTIVE';
    END IF;
  END IF;

  IF NEW."isDefault" AND NOT OLD."isDefault" AND (NEW."status" <> 'ACTIVE' OR NEW."deletedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'An inactive branch cannot be the default' USING ERRCODE = 'check_violation', HINT = 'BRANCH_INACTIVE';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "branchesGuard" ON "Company"."Branches";
CREATE TRIGGER "branchesGuard" BEFORE UPDATE OF "status", "deletedAt", "isDefault" OR DELETE ON "Company"."Branches"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerBranchGuard"();

-- Moves the default flag to one branch (two statements, so the one-default index never sees two).
CREATE OR REPLACE FUNCTION "Company"."branchMakeDefault"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Company"."Branches" WHERE "id" = "pId" AND "tenantId" = "vTenant" AND "deletedAt" IS NULL) THEN
    RAISE EXCEPTION 'Branch % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE "Company"."Branches" SET "isDefault" = false WHERE "tenantId" = "vTenant" AND "isDefault" AND "id" <> "pId";
  UPDATE "Company"."Branches" SET "isDefault" = true WHERE "id" = "pId" AND "tenantId" = "vTenant" AND NOT "isDefault";
END $function$;

-- Every new tenant starts with a default Head Office branch.
CREATE OR REPLACE FUNCTION "Company"."triggerTenantHeadOffice"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO "Company"."Branches" ("tenantId", "code", "name", "description", "isHeadOffice", "isDefault", "status")
  VALUES (NEW."id", 'HO', 'Head Office', 'Created with the company', true, true, 'ACTIVE');
  RETURN NULL;
END $function$;
DROP TRIGGER IF EXISTS "tenantsHeadOffice" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsHeadOffice" AFTER INSERT ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerTenantHeadOffice"();

-- Backfill: tenants without any branch get the Head Office.
INSERT INTO "Company"."Branches" ("tenantId", "code", "name", "description", "isHeadOffice", "isDefault", "status")
SELECT t."id", 'HO', 'Head Office', 'Created with the company', true, true, 'ACTIVE'
  FROM "Platform"."Tenants" t
 WHERE NOT EXISTS (SELECT 1 FROM "Company"."Branches" b WHERE b."tenantId" = t."id");

-- ---------------------------------------------------------------------------
-- 4. Company settings: saving the profile (creating the row) completes setup step PROFILE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."triggerSettingsProfileStep"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO "Company"."SetupGuideSteps" ("tenantId", "stepKey", "isDone", "doneAt", "doneByUserId", "autoDetected")
  VALUES (NEW."tenantId", 'PROFILE', true, now(), "Company"."getCurrentUserId"(), true)
  ON CONFLICT ("tenantId", "stepKey") DO UPDATE
    SET "isDone" = true, "doneAt" = COALESCE("SetupGuideSteps"."doneAt", now()), "autoDetected" = true
    WHERE NOT "SetupGuideSteps"."isDone";
  RETURN NULL;
END $function$;
DROP TRIGGER IF EXISTS "companySettingsProfileStep" ON "Company"."CompanySettings";
CREATE TRIGGER "companySettingsProfileStep" AFTER INSERT ON "Company"."CompanySettings"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerSettingsProfileStep"();

-- ---------------------------------------------------------------------------
-- 5. Numbering series
-- ---------------------------------------------------------------------------
-- Once a series has issued a number, its format is fixed and it cannot be deleted.
CREATE OR REPLACE FUNCTION "Company"."triggerNumberingGuard"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM "Company"."NumberingSeriesCounters" c WHERE c."tenantId" = OLD."tenantId" AND c."sequenceId" = OLD."id") THEN
    IF TG_OP = 'DELETE'
       OR NEW."prefix" IS DISTINCT FROM OLD."prefix" OR NEW."pattern" IS DISTINCT FROM OLD."pattern"
       OR NEW."padding" IS DISTINCT FROM OLD."padding" OR NEW."docType" IS DISTINCT FROM OLD."docType"
       OR NEW."branchId" IS DISTINCT FROM OLD."branchId" THEN
      RAISE EXCEPTION 'Numbering series % has issued numbers', OLD."id" USING ERRCODE = 'check_violation', HINT = 'NUMBERING_IN_USE';
    END IF;
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $function$;
DROP TRIGGER IF EXISTS "numberingSeriesGuard" ON "Company"."NumberingSeries";
CREATE TRIGGER "numberingSeriesGuard" BEFORE UPDATE OR DELETE ON "Company"."NumberingSeries"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerNumberingGuard"();

-- Allocates the next number inside the caller's (posting) transaction. The counter row is locked by the UPDATE,
-- so concurrent postings get consecutive numbers and a rollback returns nothing (no gaps from failed postings).
-- Tokens match Company.getNumberingSeriesPreview: {PREFIX} {YYYY} {YY} {MM} {BR} {SEQ} / {SEQn}.
CREATE OR REPLACE FUNCTION "Company"."nextDocumentNumber"("pDocType" text, "pBranchId" uuid, "pDate" date DEFAULT CURRENT_DATE)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "s"       "Company"."NumberingSeries";
  "vPeriod" text;
  "vSeq"    bigint;
  "vBr"     text;
  "vOut"    text;
BEGIN
  -- A branch-specific series wins over the company-wide one.
  SELECT * INTO "s" FROM "Company"."NumberingSeries" ns
   WHERE ns."tenantId" = "vTenant" AND ns."docType" = "pDocType" AND ns."isActive"
     AND (ns."branchId" = "pBranchId" OR ns."branchId" IS NULL)
   ORDER BY ns."branchId" NULLS LAST
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active numbering series for %', "pDocType" USING ERRCODE = 'check_violation', HINT = 'NUMBERING_SERIES_MISSING';
  END IF;

  "vPeriod" := CASE "s"."resetPolicy" WHEN 'YEARLY' THEN to_char("pDate", 'YYYY') WHEN 'MONTHLY' THEN to_char("pDate", 'YYYY-MM') ELSE 'ALL' END;

  INSERT INTO "Company"."NumberingSeriesCounters" ("tenantId", "sequenceId", "periodKey", "nextValue")
  VALUES ("vTenant", "s"."id", "vPeriod", "s"."startValue")
  ON CONFLICT ("tenantId", "sequenceId", "periodKey") DO NOTHING;

  UPDATE "Company"."NumberingSeriesCounters" c
     SET "nextValue" = c."nextValue" + 1, "updatedAt" = now()
   WHERE c."tenantId" = "vTenant" AND c."sequenceId" = "s"."id" AND c."periodKey" = "vPeriod"
  RETURNING c."nextValue" - 1 INTO "vSeq";

  SELECT b."code" INTO "vBr" FROM "Company"."Branches" b WHERE b."tenantId" = "vTenant" AND b."id" = "pBranchId";
  "vOut" := replace(replace(replace(replace(replace("s"."pattern",
              '{PREFIX}', "s"."prefix"), '{YYYY}', to_char("pDate", 'YYYY')), '{YY}', to_char("pDate", 'YY')),
              '{MM}', to_char("pDate", 'MM')), '{BR}', COALESCE("vBr", ''));
  RETURN regexp_replace("vOut", '\{SEQ\d*\}',
           lpad("vSeq"::text, COALESCE(substring("vOut", '\{SEQ(\d+)\}')::integer, "s"."padding"), '0'));
END $function$;

-- ---------------------------------------------------------------------------------------------------------------
-- Readable labels for the lookups shown on the Settings screens (template wording). Labels only; codes unchanged.
-- ---------------------------------------------------------------------------------------------------------------
SELECT set_config('app.actorLabel', '007-company-core.sql', true);
UPDATE "Lookups"."Lookups" l
   SET "label" = v.label
  FROM (VALUES
    ('FxRateSource','SBP_DAILY','State Bank of Pakistan (daily)'),
    ('ExchangeRateSource','SBP','State Bank of Pakistan'),
    ('NumberFormat','WESTERN','1,245,000.00 (Western)'),
    ('NumberFormat','SOUTH_ASIAN','12,45,000.00 (South Asian)'),
    ('CreditLimitAction','BLOCK_OVERRIDE','Block & request override'),
    ('CreditLimitAction','WARN','Warn only'),
    ('DocumentFont','NOTO_NASTALIQ_URDU','Noto Nastaliq Urdu (bilingual)'),
    ('ProvincialTaxAuthority','PRA','PRA (Punjab)'),
    ('ProvincialTaxAuthority','SRB','SRB (Sindh)'),
    ('ProvincialTaxAuthority','KPRA','KPRA (Khyber Pakhtunkhwa)'),
    ('ProvincialTaxAuthority','BRA','BRA (Balochistan)'),
    ('ProvincialTaxAuthority','ICT','ICT (Islamabad)'),
    ('SalesTaxAuthority','FBR','Federal (FBR)'),
    ('SalesTaxAuthority','PRA','Punjab (PRA)'),
    ('SalesTaxAuthority','SRB','Sindh (SRB)'),
    ('SalesTaxAuthority','KPRA','Khyber Pakhtunkhwa (KPRA)'),
    ('SalesTaxAuthority','BRA','Balochistan (BRA)'),
    ('SalesTaxAuthority','ICT','Islamabad (ICT)'),
    ('Province','KPK','Khyber Pakhtunkhwa'),
    ('Province','ICT','Islamabad Capital Territory'),
    ('Province','GB','Gilgit-Baltistan'),
    ('Province','AJK','Azad Jammu & Kashmir'),
    ('CompanySettingIndustry','TRADING_DISTRIBUTION','Trading & Distribution'),
    ('LegalStructure','PRIVATE_LIMITED','Private Limited Company'),
    ('LegalStructure','PUBLIC_LIMITED','Public Limited Company'),
    ('LegalStructure','AOP_PARTNERSHIP','AOP / Partnership'),
    ('PayDayRule','FIRST_NEXT_MONTH','1st of next month'),
    ('PayDayRule','DAY_25','25th'),
    ('PayrollCutoff','DAY_25','25th of month'),
    ('WorkingDaysBasis','CALENDAR_DAYS','Actual calendar days'),
    ('WorkingDaysBasis','FIXED_30','Fixed 30 days'),
    ('WorkingDaysBasis','WORKING_DAYS','Working days only'),
    ('WorkingWeek','MON_SAT_HALF_SAT','Monday – Saturday (half Sat)'),
    ('WorkingWeek','MON_FRI','Monday – Friday'),
    ('WorkingWeek','MON_SAT','Monday – Saturday'),
    ('AttendanceSource','BIOMETRIC_AND_ESS','Biometric + ESS punch'),
    ('ResetPolicy','NEVER','Never (continuous)')
  ) AS v("lookupType", code, label)
 WHERE l."lookupType" = v."lookupType" AND l.code = v.code AND l."tenantId" IS NULL AND l."label" IS DISTINCT FROM v.label;
