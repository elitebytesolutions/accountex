-- Phase 35 — Data & collaboration: numbering for data imports (IMP), row history on the tables that had none
-- (import errors, backups, report runs, activity events, comments, mentions, reactions, tags, tagged records,
-- attachments), one running tenant backup at a time, error codes. The workflow itself runs in the app (imports call
-- each master's own use case; backups use the platform tenant-export runner; report runs reuse the Phase 15 query
-- builder). API keys are Super Admin only (decided 2026-10-08): nothing here writes Company.ApiKeys. Idempotent.
SELECT set_config('app.actorLabel', '304-data-collaboration.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Numbering: IMP for every company and every new one
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."seedDataDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vN" integer;
BEGIN
  INSERT INTO "Company"."NumberingSeries" ("tenantId", "docType", "branchId", prefix, pattern, padding, "startValue", "resetPolicy", "isActive")
  SELECT "pTenant", d.code, NULL, d."defaultPrefix", d."defaultPattern", d."defaultPadding", 1, d."defaultResetPolicy", true
    FROM "Company"."DocumentTypes" d
   WHERE d.code IN ('IMP')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "Company"."triggerTenantDataDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Company"."seedDataDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsDataDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsDataDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerTenantDataDefaults"();

SELECT set_config('app.actorLabel', 'seedDataDefaultsFor', false);
SELECT "Company"."seedDataDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '304-data-collaboration.sql', false);

-- ---------------------------------------------------------------------------
-- 2. Row history on the tables that had none (webhook deliveries stay an append-only log)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
      ('Company', 'DataImportErrors'), ('Company', 'Backups'), ('Reports', 'ReportRuns'), ('Company', 'ActivityEvents'),
      ('Company', 'Comments'), ('Company', 'Mentions'), ('Company', 'Reactions'), ('Company', 'Tags'), ('Company', 'TaggedRecords'),
      ('Company', 'Attachments')) v(s, n)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', lower(left(t.n, 1)) || substr(t.n, 2) || 'Audit', t.s, t.n);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"()',
                   lower(left(t.n, 1)) || substr(t.n, 2) || 'Audit', t.s, t.n);
  END LOOP;
END $$;

-- one tenant backup running at a time
CREATE UNIQUE INDEX IF NOT EXISTS "backupOneRunningUk" ON "Company"."Backups" ("tenantId") WHERE status = 'RUNNING';

-- ---------------------------------------------------------------------------
-- 3. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('IMPORT_NOT_OPEN',          409, 'BUSINESS_RULE', 'SYSTEM', 'This import is already finished or cancelled.', 'Validate / run of a closed import', true, NULL),
  ('IMPORT_NOT_VALIDATED',     409, 'BUSINESS_RULE', 'SYSTEM', 'Validate the file before importing it.', 'Run before validation', true, NULL),
  ('IMPORT_HAS_ERRORS',        409, 'BUSINESS_RULE', 'SYSTEM', 'Fix the rows with errors, or choose to skip them.', 'Run with errors and skip off', true, NULL),
  ('BACKUP_RUNNING',           409, 'CONFLICT',      'SYSTEM', 'A backup is already running. Try again when it finishes.', 'Second concurrent tenant backup', true, NULL),
  ('BACKUP_NOT_AVAILABLE',     409, 'BUSINESS_RULE', 'SYSTEM', 'This backup did not complete and can''t be downloaded or restored.', 'Download / restore of a failed or running backup', true, NULL),
  ('RESTORE_CONFIRM_MISMATCH', 400, 'VALIDATION',    'SYSTEM', 'Type the company code exactly to confirm the restore.', 'Restore confirmation text mismatch', true, NULL),
  ('RESTORE_ALREADY_OPEN',     409, 'CONFLICT',      'SYSTEM', 'A restore request is already open.', 'Second open restore request', true, NULL),
  ('RESTORE_NOT_OPEN',         409, 'BUSINESS_RULE', 'SYSTEM', 'This restore request is no longer open.', 'Cancel of a closed restore request', true, NULL),
  ('WEBHOOK_TEST_FAILED',      409, 'BUSINESS_RULE', 'SYSTEM', 'The endpoint didn''t accept the test event.', 'Webhook test delivery failed', false, NULL),
  ('REPORT_RUN_FAILED',        409, 'BUSINESS_RULE', 'SYSTEM', 'The report couldn''t be generated.', 'Report run failed', true, NULL),
  ('COLLAB_NOT_YOURS',         403, 'PERMISSION',    'SYSTEM', 'Only the author can change or remove this.', 'Edit / delete another user''s post or comment', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- Webhook endpoints: the delivery log is append-only, so an endpoint with deliveries is soft-deleted; its URL can be added again.
ALTER TABLE "Company"."IntegrationWebhooks" ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz;
ALTER TABLE "Company"."IntegrationWebhooks" DROP CONSTRAINT IF EXISTS "IntegrationWebhooks_tenantId_url_key";
CREATE UNIQUE INDEX IF NOT EXISTS "integrationWebhooksLiveUrlUk" ON "Company"."IntegrationWebhooks" ("tenantId", "url") WHERE "deletedAt" IS NULL;

SELECT set_config('app.actorLabel', '', false);
