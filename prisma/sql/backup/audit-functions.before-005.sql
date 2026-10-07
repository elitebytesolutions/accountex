-- Definitions of the audit functions BEFORE prisma/sql/005-row-history.sql (taken 2026-10-03).
-- To roll back: run this file with: npx prisma db execute --file prisma/sql/backup/audit-functions.before-005.sql

CREATE OR REPLACE FUNCTION "Company"."triggerAudit"()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vOld"  jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
  "vNew"  jsonb := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END;
  "vDiff" jsonb := '{}'::jsonb;
  "vKey"  text;
  "vRow"  jsonb := COALESCE(to_jsonb(NEW), to_jsonb(OLD));
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR "vKey" IN SELECT jsonb_object_keys("vNew") LOOP
      CONTINUE WHEN "vKey" IN ('updatedAt','updatedBy','rowVersion');
      IF ("vOld" -> "vKey") IS DISTINCT FROM ("vNew" -> "vKey") THEN
        "vDiff" := "vDiff" || jsonb_build_object("vKey",
                     jsonb_build_object('before', "vOld" -> "vKey", 'after', "vNew" -> "vKey"));
      END IF;
    END LOOP;
    IF "vDiff" = '{}'::jsonb THEN RETURN NULL; END IF;
  END IF;

  IF TG_TABLE_SCHEMA = 'Platform' THEN
    INSERT INTO "Platform"."PlatformAuditLogs" ("occurredAt", "staffUserId", "actorLabel", action, "tenantId",
                                                details, payload, "ipAddress", result)
    VALUES (now(), "Company"."getCurrentUserId"(), COALESCE("Company"."getCurrentUserId"()::text, 'system'),
            TG_TABLE_NAME || '.' || lower(TG_OP), ("vRow" ->> 'tenantId')::uuid,
            TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || ' ' || COALESCE("vRow" ->> 'id', ''),
            CASE TG_OP WHEN 'UPDATE' THEN "vDiff" WHEN 'INSERT' THEN "vNew" ELSE "vOld" END,
            NULLIF(current_setting('app.clientIp', true), '')::inet, 'RECORDED');
    RETURN NULL;
  END IF;

  -- Global reference rows (no tenant) are not audited per tenant.
  IF ("vRow" ->> 'tenantId') IS NULL THEN RETURN NULL; END IF;

  INSERT INTO "Company"."AuditTrailEntries" ("tenantId", "occurredAt", "userId", action, "schemaName", "tableName",
                                            "recordId", changes, "ipAddress")
  VALUES (("vRow" ->> 'tenantId')::uuid, now(), "Company"."getCurrentUserId"(), TG_OP,
          TG_TABLE_SCHEMA, TG_TABLE_NAME, ("vRow" ->> 'id')::uuid,
          CASE TG_OP WHEN 'UPDATE' THEN "vDiff" WHEN 'INSERT' THEN "vNew" ELSE "vOld" END,
          NULLIF(current_setting('app.clientIp', true), '')::inet);
  RETURN NULL;
END $function$

;

CREATE OR REPLACE FUNCTION "Company"."triggerAuditRedacted"()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'Company', 'pg_temp'
AS $function$
DECLARE
  "vSecret"  text[] := COALESCE(TG_ARGV, '{}'::text[]);
  "vOldRaw" jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
  "vNewRaw" jsonb := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END;
  "vOld"     jsonb;
  "vNew"     jsonb;
  "vDiff"    jsonb := '{}'::jsonb;
  "vKey"     text;
  "vRow"     jsonb;
BEGIN
  "vOld" := "vOldRaw" - "vSecret";
  "vNew" := "vNewRaw" - "vSecret";
  "vRow" := COALESCE("vNew", "vOld");
  IF TG_OP = 'UPDATE' THEN
    FOR "vKey" IN SELECT jsonb_object_keys("vNew") LOOP
      CONTINUE WHEN "vKey" IN ('updatedAt','updatedBy','rowVersion');
      IF ("vOld" -> "vKey") IS DISTINCT FROM ("vNew" -> "vKey") THEN
        "vDiff" := "vDiff" || jsonb_build_object("vKey",
                    jsonb_build_object('before', "vOld" -> "vKey", 'after', "vNew" -> "vKey"));
      END IF;
    END LOOP;
    FOREACH "vKey" IN ARRAY "vSecret" LOOP
      IF ("vOldRaw" -> "vKey") IS DISTINCT FROM ("vNewRaw" -> "vKey") THEN
        "vDiff" := "vDiff" || jsonb_build_object("vKey",
                    jsonb_build_object('before', '[redacted]', 'after', '[redacted]'));
      END IF;
    END LOOP;
    IF "vDiff" = '{}'::jsonb THEN RETURN NULL; END IF;
  END IF;

  INSERT INTO "Company"."AuditTrailEntries" ("tenantId", "occurredAt", "userId", action, "schemaName", "tableName",
                              "recordId", changes, "ipAddress")
  VALUES (("vRow" ->> 'tenantId')::uuid, now(), "Company"."getCurrentUserId"(), TG_OP,
          TG_TABLE_SCHEMA, TG_TABLE_NAME, ("vRow" ->> 'id')::uuid,
          CASE TG_OP WHEN 'UPDATE' THEN "vDiff" WHEN 'INSERT' THEN "vNew" ELSE "vOld" END,
          NULLIF(current_setting('app.clientIp', true), '')::inet);
  RETURN NULL;
END $function$

;

CREATE OR REPLACE FUNCTION "Company"."triggerAuditLogHash"()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'Company', 'public', 'pg_temp'
AS $function$
BEGIN
  NEW."entryHash" := digest(
    format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s',
           NEW.id, NEW."tenantId",
           to_char(NEW."occurredAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
           NEW."userId", NEW."actorEmail", NEW.action, NEW."schemaName", NEW."tableName",
           NEW."recordId", NEW."recordLabel", NEW.changes::text, host(NEW."ipAddress")),
    'sha256');
  RETURN NEW;
END $function$

;

