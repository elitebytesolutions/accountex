-- Phase 0: user-attributed row history and the error catalogue.
-- Every insert/update/delete keeps one audit entry with who (user id + name/email snapshot), what (changed fields
-- before/after + the full row at that version), where (IP, user agent, session, correlation id) and when.
-- The app sets the actor per transaction (PrismaService.withContext):
--   app.userId, app.tenantId, app.correlationId, app.clientIp, app.userAgent, app.sessionId, app.actorLabel (scripts/jobs)
-- Idempotent. Apply with: npm run db:sql   Rollback of the functions: prisma/sql/backup/audit-functions.before-005.sql

-- ---------------------------------------------------------------------------
-- 1. Audit tables: new columns
-- ---------------------------------------------------------------------------
ALTER TABLE "Company"."AuditTrailEntries" ADD COLUMN IF NOT EXISTS "rowData" jsonb;
ALTER TABLE "Company"."AuditTrailEntries" ADD COLUMN IF NOT EXISTS "rowVersion" integer;
ALTER TABLE "Company"."AuditTrailEntries" ADD COLUMN IF NOT EXISTS "actorName" text;
ALTER TABLE "Company"."AuditTrailEntries" ADD COLUMN IF NOT EXISTS "correlationId" text;
-- Existing rows keep hash version 1 (still verifiable); new rows use version 2, which also covers the new columns.
ALTER TABLE "Company"."AuditTrailEntries" ADD COLUMN IF NOT EXISTS "hashVersion" smallint NOT NULL DEFAULT 1;
ALTER TABLE "Company"."AuditTrailEntries" ALTER COLUMN "hashVersion" SET DEFAULT 2;
-- Global rows (no tenant, e.g. Lookups) are now logged too.
ALTER TABLE "Company"."AuditTrailEntries" ALTER COLUMN "tenantId" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "auditLogCorrelationIdx" ON "Company"."AuditTrailEntries" ("correlationId");

ALTER TABLE "Platform"."PlatformAuditLogs" ADD COLUMN IF NOT EXISTS "rowData" jsonb;
ALTER TABLE "Platform"."PlatformAuditLogs" ADD COLUMN IF NOT EXISTS "correlationId" text;
ALTER TABLE "Platform"."PlatformAuditLogs" ADD COLUMN IF NOT EXISTS "userAgent" text;

-- ---------------------------------------------------------------------------
-- 2. One writer used by both audit triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."writeAuditEntry"(
  "pOp" text, "pSchema" text, "pTable" text, "pOld" jsonb, "pNew" jsonb, "pSecret" text[])
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vOld"     jsonb := "pOld" - COALESCE("pSecret", '{}'::text[]);
  "vNew"     jsonb := "pNew" - COALESCE("pSecret", '{}'::text[]);
  "vDiff"    jsonb := '{}'::jsonb;
  "vKey"     text;
  "vRow"     jsonb;
  "vChanges" jsonb;
  "vUserId"  uuid := "Company"."getCurrentUserId"();
  "vName"    text;
  "vEmail"   text;
  "vLabel"   text;
  "vId"      text;
  "vIp"      inet := NULLIF(current_setting('app.clientIp', true), '')::inet;
  "vCorr"    text := NULLIF(current_setting('app.correlationId', true), '');
  "vAgent"   text := NULLIF(current_setting('app.userAgent', true), '');
  "vSession" text := NULLIF(current_setting('app.sessionId', true), '');
BEGIN
  -- Secrets never reach the log: removed from the row, shown as [redacted] when they change.
  IF "pSecret" IS NOT NULL THEN
    FOREACH "vKey" IN ARRAY "pSecret" LOOP
      IF "pNew" ? "vKey" THEN "vNew" := "vNew" || jsonb_build_object("vKey", '[redacted]'); END IF;
      IF "pOld" ? "vKey" THEN "vOld" := "vOld" || jsonb_build_object("vKey", '[redacted]'); END IF;
    END LOOP;
  END IF;

  IF "pOp" = 'UPDATE' THEN
    FOR "vKey" IN SELECT jsonb_object_keys("pNew") LOOP
      CONTINUE WHEN "vKey" IN ('updatedAt', 'updatedBy', 'rowVersion');
      IF ("pOld" -> "vKey") IS DISTINCT FROM ("pNew" -> "vKey") THEN
        "vDiff" := "vDiff" || jsonb_build_object("vKey",
                     jsonb_build_object('before', "vOld" -> "vKey", 'after', "vNew" -> "vKey"));
      END IF;
    END LOOP;
    IF "vDiff" = '{}'::jsonb THEN RETURN; END IF;
  END IF;

  "vRow"     := CASE "pOp" WHEN 'DELETE' THEN "vOld" ELSE "vNew" END;
  "vChanges" := CASE "pOp" WHEN 'UPDATE' THEN "vDiff" ELSE "vRow" END;

  -- Who: snapshot of the user's name/email now, so history stays right after renames or removal.
  IF "vUserId" IS NOT NULL THEN
    SELECT u."fullName", u."email"::text INTO "vName", "vEmail" FROM "Company"."Users" u WHERE u."id" = "vUserId";
  END IF;
  IF "vName" IS NULL THEN
    "vName" := COALESCE(NULLIF(current_setting('app.actorLabel', true), ''), CASE WHEN "vUserId" IS NULL THEN 'system' END);
    IF "vUserId" IS NULL AND "vName" <> 'system' THEN "vName" := 'system: ' || "vName"; END IF;
  END IF;

  "vLabel" := COALESCE("vRow" ->> 'name', "vRow" ->> 'fullName', "vRow" ->> 'displayName', "vRow" ->> 'title', "vRow" ->> 'code', "vRow" ->> 'label');
  "vId"    := "vRow" ->> 'id';

  IF "pSchema" = 'Platform' THEN
    INSERT INTO "Platform"."PlatformAuditLogs"
      ("occurredAt", "staffUserId", "actorLabel", "actorDetail", action, "tenantId", details, payload, "rowData",
       "ipAddress", "correlationId", "userAgent", result)
    VALUES (now(), "vUserId", COALESCE("vName", 'system'), "vEmail", "pTable" || '.' || lower("pOp"),
            ("vRow" ->> 'tenantId')::uuid, "pSchema" || '.' || "pTable" || ' ' || COALESCE("vId", ''),
            "vChanges", "vRow", "vIp", "vCorr", "vAgent", 'RECORDED');
    RETURN;
  END IF;

  INSERT INTO "Company"."AuditTrailEntries"
    ("tenantId", "occurredAt", "userId", "actorName", "actorEmail", action, "schemaName", "tableName",
     "recordId", "recordLabel", changes, "rowData", "rowVersion", "ipAddress", "userAgent", "sessionId",
     "correlationId", "hashVersion")
  VALUES (("vRow" ->> 'tenantId')::uuid, now(), "vUserId", "vName", "vEmail", "pOp", "pSchema", "pTable",
          CASE WHEN "vId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN "vId"::uuid END,
          left("vLabel", 200), "vChanges", "vRow", NULLIF("vRow" ->> 'rowVersion', '')::integer,
          "vIp", "vAgent",
          CASE WHEN "vSession" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN "vSession"::uuid END,
          "vCorr", 2);
END $function$;

-- Same names as before, so every existing trigger (299 + 4 redacted) now uses the new writer.
CREATE OR REPLACE FUNCTION "Company"."triggerAudit"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Company"."writeAuditEntry"(TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
    NULL);
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION "Company"."triggerAuditRedacted"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Company"."writeAuditEntry"(TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
    COALESCE(TG_ARGV, '{}'::text[]));
  RETURN NULL;
END $function$;

-- Hash: version 1 = the original 12 fields (existing rows); version 2 adds the new history columns.
CREATE OR REPLACE FUNCTION "Company"."triggerAuditLogHash"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'Company', 'public', 'pg_temp'
AS $function$
DECLARE
  "vBase" text := format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s',
           NEW.id, NEW."tenantId",
           to_char(NEW."occurredAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
           NEW."userId", NEW."actorEmail", NEW.action, NEW."schemaName", NEW."tableName",
           NEW."recordId", NEW."recordLabel", NEW.changes::text, host(NEW."ipAddress"));
BEGIN
  IF NEW."hashVersion" >= 2 THEN
    "vBase" := "vBase" || format('|%s|%s|%s|%s|%s|%s',
           NEW."rowData"::text, NEW."rowVersion", NEW."actorName", NEW."correlationId", NEW."userAgent", NEW."sessionId");
  END IF;
  NEW."entryHash" := digest("vBase", 'sha256');
  RETURN NEW;
END $function$;

-- ---------------------------------------------------------------------------
-- 3. Record history (RLS applies: SECURITY INVOKER, so a tenant sees only its own rows)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."getRecordHistory"(
  "pSchema" text, "pTable" text, "pRecordId" uuid, "pLimit" integer DEFAULT 50, "pOffset" integer DEFAULT 0)
  RETURNS TABLE ("entryId" bigint, "occurredAt" timestamptz, "action" text, "version" integer,
                 "actorId" uuid, "actorName" text, "actorEmail" text, "changes" jsonb, "rowData" jsonb,
                 "ipAddress" inet, "userAgent" text, "correlationId" text, "total" bigint)
  LANGUAGE sql STABLE
AS $function$
  -- version = 1, 2, 3 … in the order the changes happened (entries from before row history have no rowVersion).
  -- Entries without any actor were made by scripts/seeds before attribution existed: shown as "system".
  SELECT a.id, a."occurredAt", a.action,
         (row_number() OVER (ORDER BY a."occurredAt", a.id))::integer,
         a."userId", COALESCE(a."actorName", CASE WHEN a."userId" IS NULL THEN 'system' END), a."actorEmail"::text, a.changes, a."rowData",
         a."ipAddress", a."userAgent", a."correlationId", count(*) OVER ()
    FROM "Company"."AuditTrailEntries" a
   WHERE a."schemaName" = "pSchema" AND a."tableName" = "pTable" AND a."recordId" = "pRecordId"
   ORDER BY a."occurredAt" DESC, a.id DESC
   LIMIT "pLimit" OFFSET "pOffset"
$function$;

-- ---------------------------------------------------------------------------
-- 4. Lookups are audited from now on (global rows, tenantId NULL)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "lookupsAudit" ON "Lookups"."Lookups";
CREATE TRIGGER "lookupsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Lookups"."Lookups"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "lookupColumnsAudit" ON "Lookups"."LookupColumns";
CREATE TRIGGER "lookupColumnsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Lookups"."LookupColumns"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 5. Error catalogue and error log
-- ---------------------------------------------------------------------------
INSERT INTO "Lookups"."Lookups" ("lookupType", "code", "label", "tone", "sortOrder", "isActive", "isSystem")
SELECT 'ErrorCategory', v.c, v.l, v.t, v.o, true, true
FROM (VALUES
  ('VALIDATION', 'Validation', 'warn', 1), ('AUTH', 'Authentication', 'danger', 2), ('PERMISSION', 'Permission', 'danger', 3),
  ('NOT_FOUND', 'Not found', 'neutral', 4), ('CONFLICT', 'Conflict', 'warn', 5), ('BUSINESS_RULE', 'Business rule', 'warn', 6),
  ('RATE_LIMIT', 'Rate limit', 'warn', 7), ('DATABASE', 'Database', 'danger', 8), ('INTERNAL', 'Internal', 'danger', 9)
) AS v(c, l, t, o)
ON CONFLICT ("lookupType", "code", "tenantId") DO UPDATE SET "label" = EXCLUDED."label", "tone" = EXCLUDED."tone", "sortOrder" = EXCLUDED."sortOrder", "isActive" = true;

CREATE TABLE IF NOT EXISTS "Platform"."ErrorCodes" (
  "code"        text        NOT NULL,
  "httpStatus"  smallint    NOT NULL,
  "category"    text        NOT NULL,
  "module"      text,
  "userMessage" text        NOT NULL,
  "description" text,
  "sqlState"    text,
  "isLogged"    boolean     NOT NULL DEFAULT true,
  "isActive"    boolean     NOT NULL DEFAULT true,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "createdBy"   uuid,
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedBy"   uuid,
  "rowVersion"  integer     NOT NULL DEFAULT 0,
  CONSTRAINT "ErrorCodes_pkey" PRIMARY KEY ("code"),
  CONSTRAINT "errorCodeFormatChk" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{2,60}$'),
  CONSTRAINT "errorCodeStatusChk" CHECK ("httpStatus" BETWEEN 400 AND 599),
  CONSTRAINT "errorCodeSqlStateUq" UNIQUE ("sqlState")
);

CREATE TABLE IF NOT EXISTS "Platform"."ErrorLogs" (
  "id"            bigint      GENERATED ALWAYS AS IDENTITY,
  "occurredAt"    timestamptz NOT NULL DEFAULT now(),
  "tenantId"      uuid,
  "userId"        uuid,
  "correlationId" text,
  "method"        text,
  "path"          text,
  "httpStatus"    smallint    NOT NULL,
  "errorCode"     text        NOT NULL REFERENCES "Platform"."ErrorCodes" ("code"),
  "message"       text,
  "details"       jsonb,
  "sqlState"      text,
  "stackHash"     text,
  CONSTRAINT "ErrorLogs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "errorLogTenantTimeIdx" ON "Platform"."ErrorLogs" ("tenantId", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "errorLogUserTimeIdx" ON "Platform"."ErrorLogs" ("userId", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "errorLogCodeTimeIdx" ON "Platform"."ErrorLogs" ("errorCode", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "errorLogCorrelationIdx" ON "Platform"."ErrorLogs" ("correlationId");

INSERT INTO "Lookups"."LookupColumns" ("schemaName", "tableName", "columnName", "lookupType", "allowTenantValues")
SELECT 'Platform', 'ErrorCodes', 'category', 'ErrorCategory', false
WHERE NOT EXISTS (SELECT 1 FROM "Lookups"."LookupColumns" WHERE "schemaName" = 'Platform' AND "tableName" = 'ErrorCodes' AND "columnName" = 'category');

DROP TRIGGER IF EXISTS "errorCodesStamp" ON "Platform"."ErrorCodes";
CREATE TRIGGER "errorCodesStamp" BEFORE INSERT ON "Platform"."ErrorCodes" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerStampInsert"();
DROP TRIGGER IF EXISTS "errorCodesTouch" ON "Platform"."ErrorCodes";
CREATE TRIGGER "errorCodesTouch" BEFORE UPDATE ON "Platform"."ErrorCodes" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerTouch"();
DROP TRIGGER IF EXISTS "validateLookups" ON "Platform"."ErrorCodes";
CREATE TRIGGER "validateLookups" BEFORE INSERT OR UPDATE ON "Platform"."ErrorCodes" FOR EACH ROW EXECUTE FUNCTION "Lookups"."validateLookups"();
DROP TRIGGER IF EXISTS "errorCodesAudit" ON "Platform"."ErrorCodes";
CREATE TRIGGER "errorCodesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."ErrorCodes" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
-- The error log is itself a log: append-only, not audited again.
DROP TRIGGER IF EXISTS "errorLogsAppendOnly" ON "Platform"."ErrorLogs";
CREATE TRIGGER "errorLogsAppendOnly" BEFORE UPDATE OR DELETE ON "Platform"."ErrorLogs" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();

INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "userMessage", "description", "sqlState", "isLogged")
VALUES
  ('VALIDATION_FAILED',           400, 'VALIDATION',    'Please check the highlighted fields.', 'Request body or query failed schema validation', NULL, true),
  ('AUTH_INVALID_CREDENTIALS',    401, 'AUTH',          'Invalid email or password.', 'Sign-in failed', NULL, true),
  ('UNAUTHORIZED',                401, 'AUTH',          'Please sign in to continue.', 'No or invalid session', NULL, false),
  ('PERMISSION_DENIED',           403, 'PERMISSION',    'You do not have permission to do this.', 'Missing Company.Permissions code', NULL, true),
  ('FORBIDDEN',                   403, 'PERMISSION',    'This action is not allowed.', 'Request rejected (e.g. cross-origin)', NULL, true),
  ('NOT_FOUND',                   404, 'NOT_FOUND',     'The record was not found.', 'Record or route does not exist', NULL, false),
  ('HISTORY_TABLE_UNKNOWN',       404, 'NOT_FOUND',     'History is not available for this record type.', 'Table not registered for the history endpoint', NULL, true),
  ('CONFLICT',                    409, 'CONFLICT',      'This change conflicts with existing data.', 'Generic conflict', NULL, true),
  ('CONCURRENCY_CONFLICT',        409, 'CONFLICT',      'Someone else changed this record. Reload and try again.', 'rowVersion did not match', NULL, true),
  ('USER_EMPLOYEE_ROLE_REQUIRED', 409, 'BUSINESS_RULE', 'The Employee role cannot be removed from an active user.', 'Raised by Company.triggerKeepEmployeeRole', NULL, true),
  ('TOO_MANY_REQUESTS',           429, 'RATE_LIMIT',    'Too many requests. Please wait a moment.', 'Throttler limit reached', NULL, true),
  ('INTERNAL_ERROR',              500, 'INTERNAL',      'Something went wrong. Quote the reference if you contact support.', 'Unhandled exception', NULL, true),
  ('DB_UNIQUE_VIOLATION',         409, 'DATABASE',      'A record with these details already exists.', 'unique_violation', '23505', true),
  ('DB_FOREIGN_KEY_VIOLATION',    409, 'DATABASE',      'This record is linked to other data.', 'foreign_key_violation', '23503', true),
  ('DB_CHECK_VIOLATION',          422, 'DATABASE',      'Some values are not allowed.', 'check_violation (incl. invalid lookup values)', '23514', true),
  ('DB_NOT_NULL_VIOLATION',       422, 'DATABASE',      'A required value is missing.', 'not_null_violation', '23502', true),
  ('DB_APPEND_ONLY',              403, 'DATABASE',      'This record cannot be changed.', 'insufficient_privilege raised by append-only/guard triggers', '42501', true)
ON CONFLICT ("code") DO UPDATE SET
  "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "userMessage" = EXCLUDED."userMessage",
  "description" = EXCLUDED."description", "sqlState" = EXCLUDED."sqlState", "isLogged" = EXCLUDED."isLogged", "isActive" = true;
