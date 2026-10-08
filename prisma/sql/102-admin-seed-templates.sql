-- 102-admin-seed-templates.sql
-- Phase 37: Seed templates & tax master (COA templates, tenant seed lists, default role grants, Pakistan tax master,
-- communication templates). Uses the Phase 36 Super Admin foundation (101-admin-plans-catalogue.sql).
-- Idempotent: safe to run repeatedly via npm run db:sql (or: npx prisma db execute --file prisma/sql/102-admin-seed-templates.sql).

SELECT set_config('app.actorLabel', '102-admin-seed-templates.sql', true);

-- ---------------------------------------------------------------------------
-- 1. Row history on the template tables that had none (SystemRoleGrants, the four TaxMaster* tables and
--    CommunicationTemplates are already audited).
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "chartOfAccountsTemplatesAudit" ON "Platform"."ChartOfAccountsTemplates";
CREATE TRIGGER "chartOfAccountsTemplatesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."ChartOfAccountsTemplates"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "chartOfAccountsTemplateAccountsAudit" ON "Platform"."ChartOfAccountsTemplateAccounts";
CREATE TRIGGER "chartOfAccountsTemplateAccountsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."ChartOfAccountsTemplateAccounts"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "templateLeaveTypesAudit" ON "Platform"."TemplateLeaveTypes";
CREATE TRIGGER "templateLeaveTypesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."TemplateLeaveTypes"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "templateSalaryComponentsAudit" ON "Platform"."TemplateSalaryComponents";
CREATE TRIGGER "templateSalaryComponentsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."TemplateSalaryComponents"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "templateTaxCodesAudit" ON "Platform"."TemplateTaxCodes";
CREATE TRIGGER "templateTaxCodesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."TemplateTaxCodes"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- The authority API token (SecretBox ciphertext) never reaches the platform log: shown as [redacted] when it changes.
DROP TRIGGER IF EXISTS "taxMasterAuthoritiesAudit" ON "Platform"."TaxMasterAuthorities";
CREATE TRIGGER "taxMasterAuthoritiesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."TaxMasterAuthorities"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditRedacted"('apiTokenEnc');

-- ---------------------------------------------------------------------------
-- 2. Tax authorities (reference rows: the Tax Master has no "new authority" screen, only their connection settings).
--    Inserted once; the Super Admin's later edits are never overwritten.
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."TaxMasterAuthorities" (code, name, jurisdiction, "levyScope", "sandboxEndpoint", "productionEndpoint")
VALUES
  ('FBR',  'Federal Board of Revenue',              'FEDERAL',     'GOODS_AND_INCOME_TAX',
           'https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb', 'https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata'),
  ('PRA',  'Punjab Revenue Authority',              'PUNJAB',      'SERVICES',
           'https://e-pra.punjab.gov.pk/sandbox/api/v2/invoices', 'https://e-pra.punjab.gov.pk/api/v2/invoices'),
  ('SRB',  'Sindh Revenue Board',                   'SINDH',       'SERVICES', NULL, NULL),
  ('KPRA', 'Khyber Pakhtunkhwa Revenue Authority',  'KPK',         'SERVICES', NULL, NULL),
  ('BRA',  'Balochistan Revenue Authority',         'BALOCHISTAN', 'SERVICES', NULL, NULL)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Published tax-master rates are immutable: once publishedAt is set, only the period end (effectiveTo, closed by a
--    superseding row or reopened when that scheduled row is cancelled) and the stored status may change, and the row
--    can't be deleted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."triggerTaxMasterRateImmutable"()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vFree" text[] := ARRAY['effectiveTo', 'status', 'updatedAt', 'updatedBy', 'rowVersion'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."publishedAt" IS NOT NULL THEN
      RAISE EXCEPTION '%: published rate % can''t be deleted', TG_TABLE_NAME, OLD.id
        USING ERRCODE = 'check_violation', HINT = 'TAX_RATE_PUBLISHED_IMMUTABLE';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."publishedAt" IS NOT NULL AND (to_jsonb(NEW) - "vFree") IS DISTINCT FROM (to_jsonb(OLD) - "vFree") THEN
    RAISE EXCEPTION '%: published rate % can''t be edited, schedule a new rate instead', TG_TABLE_NAME, OLD.id
      USING ERRCODE = 'check_violation', HINT = 'TAX_RATE_PUBLISHED_IMMUTABLE';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "taxMasterSalesTaxRatesImmutable" ON "Platform"."TaxMasterSalesTaxRates";
CREATE TRIGGER "taxMasterSalesTaxRatesImmutable" BEFORE UPDATE OR DELETE ON "Platform"."TaxMasterSalesTaxRates"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerTaxMasterRateImmutable"();
DROP TRIGGER IF EXISTS "taxMasterWithholdingRatesImmutable" ON "Platform"."TaxMasterWithholdingRates";
CREATE TRIGGER "taxMasterWithholdingRatesImmutable" BEFORE UPDATE OR DELETE ON "Platform"."TaxMasterWithholdingRates"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerTaxMasterRateImmutable"();

-- ---------------------------------------------------------------------------
-- 4. Supersede: schedule a new effective-dated rate. The rate in force on the new start date gets effectiveTo = the
--    day before; the new row is open-ended. A rate that already starts on or after the new date blocks the change
--    (cancel or edit that scheduled row first). The stored status is set at write time; readers derive the current
--    status from the dates (SCHEDULED before effectiveFrom, SUPERSEDED after effectiveTo, otherwise ACTIVE).
--    pData = the row's fields (as for *AddUpdate); id, status, effectiveTo, publishedAt and masterVersion are ignored.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."taxMasterSalesTaxRateSchedule"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vAuth"    uuid := NULLIF("pData" ->> 'taxAuthorityId', '')::uuid;
  "vApplies" text := "pData" ->> 'appliesTo';
  "vFrom"    date := NULLIF("pData" ->> 'effectiveFrom', '')::date;
  "vNext"    date;
BEGIN
  IF "vFrom" IS NULL OR "vFrom" < current_date THEN
    RAISE EXCEPTION 'A rate change takes effect today or later' USING ERRCODE = 'check_violation', HINT = 'TAX_RATE_EFFECTIVE_PAST';
  END IF;
  PERFORM 1 FROM "Platform"."TaxMasterSalesTaxRates" r
   WHERE r."taxAuthorityId" = "vAuth" AND r."appliesTo" = "vApplies" FOR UPDATE;
  SELECT min(r."effectiveFrom") INTO "vNext" FROM "Platform"."TaxMasterSalesTaxRates" r
   WHERE r."taxAuthorityId" = "vAuth" AND r."appliesTo" = "vApplies" AND r."effectiveFrom" >= "vFrom";
  IF "vNext" IS NOT NULL THEN
    RAISE EXCEPTION 'A rate starting % is already scheduled', "vNext" USING ERRCODE = 'exclusion_violation', HINT = 'TAX_MASTER_RATE_OVERLAP';
  END IF;
  UPDATE "Platform"."TaxMasterSalesTaxRates" r
     SET "effectiveTo" = "vFrom" - 1,
         status = CASE WHEN "vFrom" <= current_date THEN 'SUPERSEDED' ELSE r.status END
   WHERE r."taxAuthorityId" = "vAuth" AND r."appliesTo" = "vApplies"
     AND r."effectiveFrom" < "vFrom" AND (r."effectiveTo" IS NULL OR r."effectiveTo" >= "vFrom");
  RETURN "Platform"."taxMasterSalesTaxRateAddUpdate"(
    ("pData" - ARRAY['id', 'status', 'effectiveTo', 'publishedAt', 'masterVersion', 'rowVersion'])
    || jsonb_build_object('status', CASE WHEN "vFrom" > current_date THEN 'SCHEDULED' ELSE 'ACTIVE' END));
END $function$;

CREATE OR REPLACE FUNCTION "Platform"."taxMasterWithholdingRateSchedule"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vSection" text := "pData" ->> 'sectionCode';
  "vFrom"    date := NULLIF("pData" ->> 'effectiveFrom', '')::date;
  "vNext"    date;
BEGIN
  IF "vFrom" IS NULL OR "vFrom" < current_date THEN
    RAISE EXCEPTION 'A rate change takes effect today or later' USING ERRCODE = 'check_violation', HINT = 'TAX_RATE_EFFECTIVE_PAST';
  END IF;
  PERFORM 1 FROM "Platform"."TaxMasterWithholdingRates" r WHERE r."sectionCode" = "vSection" FOR UPDATE;
  SELECT min(r."effectiveFrom") INTO "vNext" FROM "Platform"."TaxMasterWithholdingRates" r
   WHERE r."sectionCode" = "vSection" AND r."effectiveFrom" >= "vFrom";
  IF "vNext" IS NOT NULL THEN
    RAISE EXCEPTION 'A rate starting % is already scheduled', "vNext" USING ERRCODE = 'exclusion_violation', HINT = 'TAX_MASTER_RATE_OVERLAP';
  END IF;
  UPDATE "Platform"."TaxMasterWithholdingRates" r
     SET "effectiveTo" = "vFrom" - 1,
         status = CASE WHEN "vFrom" <= current_date THEN 'SUPERSEDED' ELSE r.status END
   WHERE r."sectionCode" = "vSection"
     AND r."effectiveFrom" < "vFrom" AND (r."effectiveTo" IS NULL OR r."effectiveTo" >= "vFrom");
  RETURN "Platform"."taxMasterWithholdingRateAddUpdate"(
    ("pData" - ARRAY['id', 'status', 'effectiveTo', 'publishedAt', 'masterVersion', 'rowVersion'])
    || jsonb_build_object('status', CASE WHEN "vFrom" > current_date THEN 'SCHEDULED' ELSE 'ACTIVE' END));
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Error codes (duplicate codes use the existing DB_UNIQUE_VIOLATION, stale rows CONCURRENCY_CONFLICT).
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('COA_TEMPLATE_TREE_INVALID',     400, 'VALIDATION',    'PLATFORM', 'The account tree has errors. Fix the highlighted rows and try again.', 'COA template accounts break the code / level / parent / nature rules', true, NULL),
  ('COA_TEMPLATE_IN_USE',           409, 'BUSINESS_RULE', 'PLATFORM', 'Tenants use this template, or it is not a draft. Retire it instead.', 'Delete of a COA template that is not DRAFT or is linked to tenants', true, NULL),
  ('COA_TEMPLATE_STATUS',           409, 'BUSINESS_RULE', 'PLATFORM', 'This change is not allowed for the template''s current status.', 'Invalid COA template status change (e.g. retiring the default, editing a retired template)', true, NULL),
  ('TAX_RATE_PUBLISHED_IMMUTABLE',  409, 'BUSINESS_RULE', 'PLATFORM', 'Published rates can''t be edited or deleted. Schedule a new rate instead.', 'Edit or delete of a published tax-master rate', true, NULL),
  ('TAX_MASTER_RATE_OVERLAP',       409, 'CONFLICT',      'PLATFORM', 'Another rate already covers that period. Cancel or edit the scheduled change first.', 'Tax-master rate periods would overlap', true, NULL),
  ('TAX_RATE_EFFECTIVE_PAST',       400, 'VALIDATION',    'PLATFORM', 'A rate change takes effect today or later.', 'Tax-master rate scheduled in the past', true, NULL),
  ('TAX_MASTER_NOTHING_TO_PUBLISH', 409, 'BUSINESS_RULE', 'PLATFORM', 'Every rate is already published.', 'Publish with no unpublished tax-master rows', true, NULL),
  ('TAX_MASTER_SLABS_IN_USE',       409, 'BUSINESS_RULE', 'PLATFORM', 'Tenants imported these slabs. Add the next tax year instead of changing this one.', 'Replace of tax-master salary slabs referenced by tenant payroll slabs', true, NULL),
  ('TAX_AUTHORITY_NO_ENDPOINT',     400, 'VALIDATION',    'PLATFORM', 'Set the sandbox endpoint before testing the connection.', 'Connection test without a sandbox endpoint', true, NULL),
  ('COMM_TEMPLATE_IN_USE',          409, 'BUSINESS_RULE', 'PLATFORM', 'Messages or broadcasts were sent with this template. Deactivate it instead.', 'Delete of a communication template with logs or broadcasts', true, NULL),
  ('PERMISSION_UNKNOWN',            400, 'VALIDATION',    'PLATFORM', 'One or more permissions don''t exist. Reload and try again.', 'Role-grant matrix with an unknown permission code', true, NULL),
  ('SYSTEM_ROLE_LOCKED',            409, 'BUSINESS_RULE', 'PLATFORM', 'The Admin role always keeps every permission.', 'Edit of the ADMIN system role grants', true, NULL),
  ('TAX_MASTER_NOT_PUBLISHED',      409, 'BUSINESS_RULE', 'FINANCE',  'The Tax Master has no published rates for that period yet.', 'Workspace import with no published tax-master rows', true, NULL),
  ('TAX_MASTER_ALREADY_IMPORTED',   409, 'CONFLICT',      'FINANCE',  'These Tax Master rates are already imported for that period.', 'Workspace import of tax-master rates that are already present', true, NULL),
  ('TAX_MASTER_ACCOUNT_MISSING',    400, 'VALIDATION',    'FINANCE',  'Map the tax accounts in Settings › Finance › Default accounts first.', 'Workspace tax-code import without the default tax account mappings', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;
