-- 105-admin-tenant-lifecycle.sql
-- Phase 40: Tenant lifecycle (tenants & onboarding, subscriptions, usage, impersonation sessions).
-- Idempotent: safe to run repeatedly via npm run db:sql (or: npx prisma db execute --file prisma/sql/105-admin-tenant-lifecycle.sql).

-- ---------------------------------------------------------------------------
-- 1. Row history names both identities during support access: a change made while the Super Admin impersonates a
--    company user is recorded as "Super Admin <email> as <user>" (app.impersonatedBy, set by the API for those
--    sessions), with userId = the user and sessionId = the support session's UserSessions row. Same function as
--    005-row-history.sql otherwise.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."writeAuditEntry"("pOp" text, "pSchema" text, "pTable" text, "pOld" jsonb, "pNew" jsonb, "pSecret" text[])
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
  -- Phase 40: support access. A change made while a Super Admin impersonates a user names both identities.
  IF "vUserId" IS NOT NULL AND NULLIF(current_setting('app.impersonatedBy', true), '') IS NOT NULL THEN
    "vName" := current_setting('app.impersonatedBy', true) || ' as ' || COALESCE("vName", 'user');
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

-- ---------------------------------------------------------------------------
-- 2. tenantAddUpdate edits a company; it never creates one (Phase 0 rule: only Platform.provisionTenant does).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."tenantAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRec" "Platform"."Tenants";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  -- Phase 40: companies are created only through Platform.provisionTenant (tenant → system roles → default user).
  IF "vId" IS NULL THEN
    RAISE EXCEPTION 'Tenants are created through Platform.provisionTenant (tenant onboarding), not tenantAddUpdate'
      USING ERRCODE = 'check_violation', HINT = 'TENANT_CREATE_VIA_PROVISION';
  END IF;
  "vRec" := jsonb_populate_record(NULL::"Platform"."Tenants", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."Tenants" (code, subdomain, "displayName", "legalName", ntn, strn, "secpRegNo", industry, country, city, province, address, phone, email, "fiscalYearStartMonth", "baseCurrency", timezone, "numberFormat", "dateFormat", "dataResidency", "coaTemplateId", "requireMfa", "allowSso", "defaultLanguage", status, "healthScore", "trialEndsOn", "activatedAt", "lastActiveAt", "accountOwnerStaffId", "appVersion", platforms, "isBeta", "isInternal", "healthFactors", "healthUpdatedAt", "suspendedAt", "suspensionReason", "churnedAt", "churnReason")
    VALUES (CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'subdomain' THEN "vRec".subdomain ELSE NULL END, CASE WHEN "pData" ? 'displayName' THEN "vRec"."displayName" ELSE NULL END, CASE WHEN "pData" ? 'legalName' THEN "vRec"."legalName" ELSE NULL END, CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE NULL END, CASE WHEN "pData" ? 'strn' THEN "vRec".strn ELSE NULL END, CASE WHEN "pData" ? 'secpRegNo' THEN "vRec"."secpRegNo" ELSE NULL END, CASE WHEN "pData" ? 'industry' THEN "vRec".industry ELSE NULL END, CASE WHEN "pData" ? 'country' THEN "vRec".country ELSE 'PK' END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'province' THEN "vRec".province ELSE NULL END, CASE WHEN "pData" ? 'address' THEN "vRec".address ELSE NULL END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'fiscalYearStartMonth' THEN "vRec"."fiscalYearStartMonth" ELSE 7 END, CASE WHEN "pData" ? 'baseCurrency' THEN "vRec"."baseCurrency" ELSE 'PKR' END, CASE WHEN "pData" ? 'timezone' THEN "vRec".timezone ELSE 'Asia/Karachi' END, CASE WHEN "pData" ? 'numberFormat' THEN "vRec"."numberFormat" ELSE 'SOUTH_ASIAN' END, CASE WHEN "pData" ? 'dateFormat' THEN "vRec"."dateFormat" ELSE 'DD MMM YYYY' END, CASE WHEN "pData" ? 'dataResidency' THEN "vRec"."dataResidency" ELSE 'PK_LAHORE' END, CASE WHEN "pData" ? 'coaTemplateId' THEN "vRec"."coaTemplateId" ELSE NULL END, CASE WHEN "pData" ? 'requireMfa' THEN "vRec"."requireMfa" ELSE FALSE END, CASE WHEN "pData" ? 'allowSso' THEN "vRec"."allowSso" ELSE FALSE END, CASE WHEN "pData" ? 'defaultLanguage' THEN "vRec"."defaultLanguage" ELSE 'EN' END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'PROVISIONING' END, CASE WHEN "pData" ? 'healthScore' THEN "vRec"."healthScore" ELSE NULL END, CASE WHEN "pData" ? 'trialEndsOn' THEN "vRec"."trialEndsOn" ELSE NULL END, CASE WHEN "pData" ? 'activatedAt' THEN "vRec"."activatedAt" ELSE NULL END, CASE WHEN "pData" ? 'lastActiveAt' THEN "vRec"."lastActiveAt" ELSE NULL END, CASE WHEN "pData" ? 'accountOwnerStaffId' THEN "vRec"."accountOwnerStaffId" ELSE NULL END, CASE WHEN "pData" ? 'appVersion' THEN "vRec"."appVersion" ELSE NULL END, CASE WHEN "pData" ? 'platforms' THEN "vRec".platforms ELSE '{WEB}' END, CASE WHEN "pData" ? 'isBeta' THEN "vRec"."isBeta" ELSE FALSE END, CASE WHEN "pData" ? 'isInternal' THEN "vRec"."isInternal" ELSE FALSE END, CASE WHEN "pData" ? 'healthFactors' THEN "vRec"."healthFactors" ELSE NULL END, CASE WHEN "pData" ? 'healthUpdatedAt' THEN "vRec"."healthUpdatedAt" ELSE NULL END, CASE WHEN "pData" ? 'suspendedAt' THEN "vRec"."suspendedAt" ELSE NULL END, CASE WHEN "pData" ? 'suspensionReason' THEN "vRec"."suspensionReason" ELSE NULL END, CASE WHEN "pData" ? 'churnedAt' THEN "vRec"."churnedAt" ELSE NULL END, CASE WHEN "pData" ? 'churnReason' THEN "vRec"."churnReason" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."Tenants" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           subdomain = CASE WHEN "pData" ? 'subdomain' THEN "vRec".subdomain ELSE t.subdomain END,
           "displayName" = CASE WHEN "pData" ? 'displayName' THEN "vRec"."displayName" ELSE t."displayName" END,
           "legalName" = CASE WHEN "pData" ? 'legalName' THEN "vRec"."legalName" ELSE t."legalName" END,
           ntn = CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE t.ntn END,
           strn = CASE WHEN "pData" ? 'strn' THEN "vRec".strn ELSE t.strn END,
           "secpRegNo" = CASE WHEN "pData" ? 'secpRegNo' THEN "vRec"."secpRegNo" ELSE t."secpRegNo" END,
           industry = CASE WHEN "pData" ? 'industry' THEN "vRec".industry ELSE t.industry END,
           country = CASE WHEN "pData" ? 'country' THEN "vRec".country ELSE t.country END,
           city = CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE t.city END,
           province = CASE WHEN "pData" ? 'province' THEN "vRec".province ELSE t.province END,
           address = CASE WHEN "pData" ? 'address' THEN "vRec".address ELSE t.address END,
           phone = CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE t.phone END,
           email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           "fiscalYearStartMonth" = CASE WHEN "pData" ? 'fiscalYearStartMonth' THEN "vRec"."fiscalYearStartMonth" ELSE t."fiscalYearStartMonth" END,
           "baseCurrency" = CASE WHEN "pData" ? 'baseCurrency' THEN "vRec"."baseCurrency" ELSE t."baseCurrency" END,
           timezone = CASE WHEN "pData" ? 'timezone' THEN "vRec".timezone ELSE t.timezone END,
           "numberFormat" = CASE WHEN "pData" ? 'numberFormat' THEN "vRec"."numberFormat" ELSE t."numberFormat" END,
           "dateFormat" = CASE WHEN "pData" ? 'dateFormat' THEN "vRec"."dateFormat" ELSE t."dateFormat" END,
           "dataResidency" = CASE WHEN "pData" ? 'dataResidency' THEN "vRec"."dataResidency" ELSE t."dataResidency" END,
           "coaTemplateId" = CASE WHEN "pData" ? 'coaTemplateId' THEN "vRec"."coaTemplateId" ELSE t."coaTemplateId" END,
           "requireMfa" = CASE WHEN "pData" ? 'requireMfa' THEN "vRec"."requireMfa" ELSE t."requireMfa" END,
           "allowSso" = CASE WHEN "pData" ? 'allowSso' THEN "vRec"."allowSso" ELSE t."allowSso" END,
           "defaultLanguage" = CASE WHEN "pData" ? 'defaultLanguage' THEN "vRec"."defaultLanguage" ELSE t."defaultLanguage" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "healthScore" = CASE WHEN "pData" ? 'healthScore' THEN "vRec"."healthScore" ELSE t."healthScore" END,
           "trialEndsOn" = CASE WHEN "pData" ? 'trialEndsOn' THEN "vRec"."trialEndsOn" ELSE t."trialEndsOn" END,
           "activatedAt" = CASE WHEN "pData" ? 'activatedAt' THEN "vRec"."activatedAt" ELSE t."activatedAt" END,
           "lastActiveAt" = CASE WHEN "pData" ? 'lastActiveAt' THEN "vRec"."lastActiveAt" ELSE t."lastActiveAt" END,
           "accountOwnerStaffId" = CASE WHEN "pData" ? 'accountOwnerStaffId' THEN "vRec"."accountOwnerStaffId" ELSE t."accountOwnerStaffId" END,
           "appVersion" = CASE WHEN "pData" ? 'appVersion' THEN "vRec"."appVersion" ELSE t."appVersion" END,
           platforms = CASE WHEN "pData" ? 'platforms' THEN "vRec".platforms ELSE t.platforms END,
           "isBeta" = CASE WHEN "pData" ? 'isBeta' THEN "vRec"."isBeta" ELSE t."isBeta" END,
           "isInternal" = CASE WHEN "pData" ? 'isInternal' THEN "vRec"."isInternal" ELSE t."isInternal" END,
           "healthFactors" = CASE WHEN "pData" ? 'healthFactors' THEN "vRec"."healthFactors" ELSE t."healthFactors" END,
           "healthUpdatedAt" = CASE WHEN "pData" ? 'healthUpdatedAt' THEN "vRec"."healthUpdatedAt" ELSE t."healthUpdatedAt" END,
           "suspendedAt" = CASE WHEN "pData" ? 'suspendedAt' THEN "vRec"."suspendedAt" ELSE t."suspendedAt" END,
           "suspensionReason" = CASE WHEN "pData" ? 'suspensionReason' THEN "vRec"."suspensionReason" ELSE t."suspensionReason" END,
           "churnedAt" = CASE WHEN "pData" ? 'churnedAt' THEN "vRec"."churnedAt" ELSE t."churnedAt" END,
           "churnReason" = CASE WHEN "pData" ? 'churnReason' THEN "vRec"."churnReason" ELSE t."churnReason" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."Tenants" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'Tenants %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Tenants % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $function$;

-- ---------------------------------------------------------------------------
-- 3. Audit: the Phase 40 tables that had no row history (Platform tables log to Platform.PlatformAuditLogs).
-- ---------------------------------------------------------------------------
SELECT set_config('app.actorLabel', '105-admin-tenant-lifecycle.sql', true);

DROP TRIGGER IF EXISTS "tenantsAudit" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "tenantContactsAudit" ON "Platform"."TenantContacts";
CREATE TRIGGER "tenantContactsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."TenantContacts"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "tenantModulesAudit" ON "Platform"."TenantModules";
CREATE TRIGGER "tenantModulesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."TenantModules"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "tenantNotesAudit" ON "Platform"."TenantNotes";
CREATE TRIGGER "tenantNotesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."TenantNotes"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "subscriptionEventsAudit" ON "Platform"."SubscriptionEvents";
CREATE TRIGGER "subscriptionEventsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."SubscriptionEvents"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "usageMetersAudit" ON "Platform"."UsageMeters";
CREATE TRIGGER "usageMetersAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."UsageMeters"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "usageSnapshotsAudit" ON "Platform"."UsageSnapshots";
CREATE TRIGGER "usageSnapshotsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."UsageSnapshots"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 4. Impersonation: the tenant session a support session signs in with, and the lookup codes it needs.
-- ---------------------------------------------------------------------------
ALTER TABLE "Platform"."ImpersonationSessions" ADD COLUMN IF NOT EXISTS "userSessionId" uuid;
CREATE INDEX IF NOT EXISTS "impersonationSessionUserSessionIdx" ON "Platform"."ImpersonationSessions" ("userSessionId");
CREATE INDEX IF NOT EXISTS "impersonationSessionTenantIdx" ON "Platform"."ImpersonationSessions" ("tenantId", "startedAt" DESC);

INSERT INTO "Lookups"."Lookups" ("lookupType", "code", "label", "description", "tone", "sortOrder", "isActive", "isSystem")
VALUES
  ('UserSessionAuthMethod', 'IMPERSONATION', 'Support access', 'Signed in by the Accountex Super Admin through a time-boxed support session', 'violet', 9, true, true),
  ('RevokeReason', 'TENANT_SUSPENDED', 'Company suspended', 'Ended when the company was suspended or churned', 'danger', 9, true, true),
  ('RevokeReason', 'IMPERSONATION_ENDED', 'Support access ended', 'Ended with its support (impersonation) session', 'neutral', 10, true, true)
ON CONFLICT ("lookupType", "code", "tenantId") DO UPDATE SET "label" = EXCLUDED."label", "description" = EXCLUDED."description", "isActive" = true, "isSystem" = true;

-- ---------------------------------------------------------------------------
-- 5. Usage meters (template admin/usage METRICS + the lookup's other codes). Insert-only: admins may rename them.
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."UsageMeters" ("code", "name", "unit", "icon", "resetPeriod", "sortOrder")
VALUES
  ('USERS', 'Users', 'seats', 'users', 'NONE', 1),
  ('INVOICES_MONTH', 'Invoices / month', 'invoices', 'receipt', 'MONTH', 2),
  ('STORAGE_GB', 'Storage', 'GB', 'hard-drive', 'NONE', 3),
  ('API_CALLS_MONTH', 'API calls / month', 'calls', 'plug', 'MONTH', 4),
  ('SMS_MONTH', 'SMS / month', 'messages', 'message-square', 'MONTH', 5),
  ('FBR_SUBMISSIONS_MONTH', 'FBR submissions / month', 'submissions', 'landmark', 'MONTH', 6),
  ('BRANCHES', 'Branches', 'branches', 'building-2', 'NONE', 7),
  ('API_CALLS_DAY', 'API calls / day', 'calls', 'plug', 'DAY', 8)
ON CONFLICT ("code") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Usage snapshots: today's value of every active meter for every company (or one), upserted per day.
--    Counted from the live tables: users, branches, sales invoices and FBR submissions this month, attachment storage.
--    API calls and SMS have no source yet (API keys / messaging phases) and record 0. The limit stored with the snapshot
--    is the one in force: a live override, else the plan limit, else the plan's seats / storage.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."captureUsageSnapshots"("pDate" date DEFAULT CURRENT_DATE, "pTenantId" uuid DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vT"      record;
  "vM"      record;
  "vUsed"   numeric;
  "vLimit"  numeric;
  "vStart"  date;
  "vMonth"  date := date_trunc('month', "pDate")::date;
  "vNext"   date := (date_trunc('month', "pDate") + interval '1 month')::date;
  "vCount"  integer := 0;
BEGIN
  FOR "vT" IN
    SELECT t.id, s."planId", p."userSeats", p."storageGb"
      FROM "Platform"."Tenants" t
      LEFT JOIN "Platform"."Subscriptions" s ON s."tenantId" = t.id AND s.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED')
      LEFT JOIN "Platform"."SubscriptionPlans" p ON p.id = s."planId"
     WHERE t.status NOT IN ('CHURNED', 'PROVISIONING') AND ("pTenantId" IS NULL OR t.id = "pTenantId")
  LOOP
    FOR "vM" IN SELECT m.id, m.code, m."resetPeriod" FROM "Platform"."UsageMeters" m WHERE m."isActive" LOOP
      "vUsed" := CASE "vM".code
        WHEN 'USERS' THEN (SELECT count(*) FROM "Company"."Users" u WHERE u."tenantId" = "vT".id AND u.status <> 'REMOVED' AND u."deletedAt" IS NULL)
        WHEN 'BRANCHES' THEN (SELECT count(*) FROM "Company"."Branches" b WHERE b."tenantId" = "vT".id AND b."deletedAt" IS NULL)
        WHEN 'INVOICES_MONTH' THEN (SELECT count(*) FROM "Sales"."SalesInvoices" i WHERE i."tenantId" = "vT".id AND i."docDate" >= "vMonth" AND i."docDate" < "vNext")
        WHEN 'FBR_SUBMISSIONS_MONTH' THEN (SELECT count(*) FROM "Tax"."FbrInvoiceSubmissions" f WHERE f."tenantId" = "vT".id AND f."createdAt" >= "vMonth" AND f."createdAt" < "vNext")
        WHEN 'STORAGE_GB' THEN (SELECT round(COALESCE(sum(a."sizeBytes"), 0) / 1073741824.0, 3) FROM "Company"."Attachments" a WHERE a."tenantId" = "vT".id AND a."deletedAt" IS NULL)
        ELSE 0
      END;
      "vLimit" := COALESCE(
        (SELECT o."limitValue" FROM "Platform"."UsageLimitOverrides" o
          WHERE o."tenantId" = "vT".id AND o."usageMeterId" = "vM".id AND o."revokedAt" IS NULL AND (o."expiresOn" IS NULL OR o."expiresOn" >= "pDate")
          ORDER BY o."createdAt" DESC LIMIT 1),
        (SELECT l."limitValue" FROM "Platform"."SubscriptionPlanLimits" l WHERE l."planId" = "vT"."planId" AND l."usageMeterId" = "vM".id),
        CASE "vM".code WHEN 'USERS' THEN "vT"."userSeats"::numeric WHEN 'STORAGE_GB' THEN "vT"."storageGb"::numeric END);
      "vStart" := CASE "vM"."resetPeriod" WHEN 'MONTH' THEN "vMonth" ELSE "pDate" END;
      INSERT INTO "Platform"."UsageSnapshots" ("tenantId", "usageMeterId", "snapshotDate", "periodStart", "usedValue", "limitValue")
      VALUES ("vT".id, "vM".id, "pDate", "vStart", "vUsed", "vLimit")
      ON CONFLICT ("tenantId", "usageMeterId", "snapshotDate") DO UPDATE
        SET "usedValue" = EXCLUDED."usedValue", "limitValue" = EXCLUDED."limitValue", "periodStart" = EXCLUDED."periodStart"
        WHERE "UsageSnapshots"."usedValue" IS DISTINCT FROM EXCLUDED."usedValue" OR "UsageSnapshots"."limitValue" IS DISTINCT FROM EXCLUDED."limitValue";
      "vCount" := "vCount" + 1;
    END LOOP;
  END LOOP;
  RETURN "vCount";
END $function$;

-- ---------------------------------------------------------------------------
-- 7. Onboarding: copy the Super Admin's master seed lists (Phase 37) into a new company. Rows the company already has
--    (same leave-type name, salary-component name or tax code) are kept. Accounts come from the company's default
--    posting roles; a row that can't be mapped is skipped and reported, never half-written. Returns
--    { leaveTypes, salaryComponents, taxCodes, skipped: [...] }.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."tenantApplySeedTemplates"("pTenantId" uuid, "pSeedVersion" text, "pLeave" boolean, "pSalary" boolean, "pTax" boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vVersion" text;
  "vR"       record;
  "vCode"    text;
  "vLetters" text;
  "vCand"    text[];
  "vLeave"   integer := 0;
  "vSalary"  integer := 0;
  "vTax"     integer := 0;
  "vSkipped" jsonb := '[]'::jsonb;
  "vAcc"     uuid;
  "vAcc2"    uuid;
  "vBasic"   uuid;
  "vTaxId"   uuid;
  "vType"    text;
  "vKind"    text;
  "vApplies" text;
  "vRole"    text;
  "vMethod"  text;
  "vSys"     text;
  "vCat"     text;
  "i"        integer;
BEGIN
  -- one seed version for all three lists: the given one, else the newest one with any rows
  "vVersion" := COALESCE(NULLIF("pSeedVersion", ''), (
    SELECT v FROM (
      SELECT "seedVersion" v, max("updatedAt") u FROM "Platform"."TemplateLeaveTypes" GROUP BY 1
      UNION ALL SELECT "seedVersion", max("updatedAt") FROM "Platform"."TemplateSalaryComponents" GROUP BY 1
      UNION ALL SELECT "seedVersion", max("updatedAt") FROM "Platform"."TemplateTaxCodes" GROUP BY 1) x
    ORDER BY u DESC LIMIT 1));
  IF "vVersion" IS NULL THEN
    RETURN jsonb_build_object('seedVersion', NULL, 'leaveTypes', 0, 'salaryComponents', 0, 'taxCodes', 0, 'skipped', '[]'::jsonb);
  END IF;

  IF "pLeave" THEN
    FOR "vR" IN SELECT * FROM "Platform"."TemplateLeaveTypes" WHERE "seedVersion" = "vVersion" ORDER BY "sortOrder", name LOOP
      CONTINUE WHEN EXISTS (SELECT 1 FROM "HumanResources"."LeaveTypes" lt WHERE lt."tenantId" = "pTenantId" AND lower(lt.name) = lower("vR".name) AND lt."deletedAt" IS NULL);
      "vLetters" := upper(regexp_replace("vR".name, '[^A-Za-z]', '', 'g'));
      "vCand" := ARRAY[left(upper(regexp_replace(initcap("vR".name), '[^A-Z]', '', 'g')), 4), left("vLetters", 2), left("vLetters", 3), left("vLetters", 4)];
      FOR "i" IN 1..26 LOOP "vCand" := "vCand" || (left("vLetters", 1) || chr(64 + "i")); END LOOP;
      SELECT c INTO "vCode" FROM unnest("vCand") c
       WHERE c ~ '^[A-Z]{2,4}$' AND NOT EXISTS (SELECT 1 FROM "HumanResources"."LeaveTypes" lt WHERE lt."tenantId" = "pTenantId" AND lt.code = c) LIMIT 1;
      "vCat" := CASE
        WHEN "vR".name ~* 'annual|earned|privilege' THEN 'ANNUAL' WHEN "vR".name ~* 'casual' THEN 'CASUAL'
        WHEN "vR".name ~* 'sick|medical' THEN 'SICK' WHEN "vR".name ~* 'maternity' THEN 'MATERNITY'
        WHEN "vR".name ~* 'paternity' THEN 'PATERNITY' WHEN "vR".name ~* 'hajj|umrah' THEN 'HAJJ_UMRAH'
        WHEN "vR".name ~* 'unpaid|without pay|lwp' THEN 'UNPAID' WHEN "vR".name ~* 'comp' THEN 'COMP_OFF' ELSE 'OTHER' END;
      BEGIN
        IF "vCode" IS NULL THEN RAISE EXCEPTION 'no free code'; END IF;
        INSERT INTO "HumanResources"."LeaveTypes"
          ("tenantId", code, name, "seedLeaveTypeId", category, "isPaid", "daysPerYear", description, "accrualMethod", "accrualAmount",
           "carryForwardMode", "carryForwardMax", "maxTimesInService", "attachmentRequired", "attachmentAfterDays", gender, "deductionBasis", "sortOrder")
        VALUES ("pTenantId", "vCode", "vR".name, "vR".id, "vCat", "vR"."isPaid", "vR"."daysPerYear", "vR"."ruleNote",
                CASE WHEN "vR"."accrualPerMonth" IS NOT NULL THEN 'MONTHLY' ELSE 'UPFRONT' END, "vR"."accrualPerMonth",
                CASE WHEN "vR"."carryForwardMax" IS NOT NULL THEN 'CAPPED' ELSE 'NONE' END, "vR"."carryForwardMax",
                CASE WHEN "vR"."onceInService" THEN 1 END, "vR"."medicalCertAfterDays" IS NOT NULL, "vR"."medicalCertAfterDays",
                CASE "vR"."genderRestriction" WHEN 'FEMALE' THEN 'FEMALE' WHEN 'MALE' THEN 'MALE' ELSE 'ALL' END,
                CASE WHEN NOT "vR"."isPaid" THEN 'GROSS_DIV_30' END, "vR"."sortOrder");
        "vLeave" := "vLeave" + 1;
      EXCEPTION WHEN OTHERS THEN
        "vSkipped" := "vSkipped" || jsonb_build_object('list', 'leave-types', 'name', "vR".name, 'reason', SQLERRM);
      END;
    END LOOP;
  END IF;

  IF "pSalary" THEN
    SELECT id INTO "vBasic" FROM "Payroll"."SalaryComponents" WHERE "tenantId" = "pTenantId" AND "systemRole" = 'BASIC' AND "deletedAt" IS NULL;
    FOR "vR" IN SELECT * FROM "Platform"."TemplateSalaryComponents" WHERE "seedVersion" = "vVersion" ORDER BY "sortOrder", name LOOP
      CONTINUE WHEN EXISTS (SELECT 1 FROM "Payroll"."SalaryComponents" sc WHERE sc."tenantId" = "pTenantId" AND lower(sc.name) = lower("vR".name) AND sc."deletedAt" IS NULL);
      "vLetters" := upper(regexp_replace("vR".name, '[^A-Za-z0-9]', '', 'g'));
      "vCand" := ARRAY[left(upper(regexp_replace(initcap("vR".name), '[^A-Z0-9]', '', 'g')), 10), left("vLetters", 4), left("vLetters", 6), left("vLetters", 10)];
      FOR "i" IN 2..9 LOOP "vCand" := "vCand" || (left("vLetters", 8) || "i"::text); END LOOP;
      SELECT c INTO "vCode" FROM unnest("vCand") c
       WHERE c ~ '^[A-Z][A-Z0-9]{1,9}$' AND NOT EXISTS (SELECT 1 FROM "Payroll"."SalaryComponents" sc WHERE sc."tenantId" = "pTenantId" AND sc.code = c) LIMIT 1;
      "vSys" := CASE "vR"."statutoryCode" WHEN 'EOBI' THEN 'EOBI_EMPLOYEE' WHEN 'PROVIDENT_FUND' THEN 'PF_EMPLOYEE' WHEN 'INCOME_TAX_149' THEN 'INCOME_TAX' END;
      "vRole" := CASE WHEN "vR"."componentKind" = 'EARNING' THEN 'SALARY_EXPENSE'
                      ELSE CASE "vR"."statutoryCode" WHEN 'EOBI' THEN 'EOBI_PAYABLE' WHEN 'PESSI' THEN 'PESSI_PAYABLE' WHEN 'PROVIDENT_FUND' THEN 'PF_PAYABLE'
                                                     WHEN 'INCOME_TAX_149' THEN 'SALARY_TAX_PAYABLE' ELSE 'SALARIES_PAYABLE' END END;
      SELECT "accountId" INTO "vAcc" FROM "Company"."DefaultAccountMappings" WHERE "tenantId" = "pTenantId" AND role = "vRole";
      "vMethod" := CASE "vR"."calcMethod" WHEN 'FIXED' THEN 'FIXED' WHEN 'PCT_OF_BASIC' THEN 'PERCENT_OF' WHEN 'SLAB' THEN 'MONTHLY_INPUT' ELSE 'SYSTEM' END;
      BEGIN
        IF "vCode" IS NULL THEN RAISE EXCEPTION 'no free code'; END IF;
        IF "vAcc" IS NULL THEN RAISE EXCEPTION 'posting role % is not mapped', "vRole"; END IF;
        INSERT INTO "Payroll"."SalaryComponents"
          ("tenantId", code, name, "componentType", "calcMethod", "baseBasis", "baseComponentId", percent, "calcDescription",
           "debitAccountId", "creditAccountId", "taxTreatment", "systemRole", "sortOrder")
        VALUES ("pTenantId", "vCode", "vR".name, "vR"."componentKind", "vMethod",
                CASE WHEN "vMethod" = 'PERCENT_OF' THEN CASE WHEN "vBasic" IS NOT NULL THEN 'COMPONENT' ELSE 'GROSS' END END,
                CASE WHEN "vMethod" = 'PERCENT_OF' THEN "vBasic" END, CASE WHEN "vMethod" = 'PERCENT_OF' THEN "vR"."pctOfBasic" END, "vR"."ruleNote",
                CASE WHEN "vR"."componentKind" = 'EARNING' THEN "vAcc" END, CASE WHEN "vR"."componentKind" = 'DEDUCTION' THEN "vAcc" END,
                CASE WHEN "vR"."componentKind" = 'EARNING' THEN CASE WHEN "vR"."isTaxable" THEN 'FULLY_TAXABLE' ELSE 'EXEMPT' END END,
                CASE WHEN "vMethod" = 'SYSTEM' THEN "vSys" END, "vR"."sortOrder");
        "vSalary" := "vSalary" + 1;
      EXCEPTION WHEN OTHERS THEN
        "vSkipped" := "vSkipped" || jsonb_build_object('list', 'salary-components', 'name', "vR".name, 'reason', SQLERRM);
      END;
    END LOOP;
  END IF;

  IF "pTax" THEN
    FOR "vR" IN SELECT * FROM "Platform"."TemplateTaxCodes" WHERE "seedVersion" = "vVersion" AND "isActive" ORDER BY "sortOrder", code LOOP
      CONTINUE WHEN EXISTS (SELECT 1 FROM "Tax"."TaxCodes" tc WHERE tc."tenantId" = "pTenantId" AND tc.code = "vR".code);
      "vType" := CASE "vR"."taxKind" WHEN 'WHT' THEN 'WITHHOLDING' WHEN 'ADVANCE_TAX' THEN 'COLLECTION' ELSE 'SALES_TAX' END;
      "vKind" := CASE "vR"."taxKind" WHEN 'SALES_TAX' THEN 'STANDARD' WHEN 'ZERO_RATED' THEN 'ZERO_RATED' WHEN 'EXEMPT' THEN 'EXEMPT' WHEN 'FURTHER_TAX' THEN 'FURTHER' END;
      "vApplies" := CASE "vR"."taxKind" WHEN 'WHT' THEN 'VENDOR_PAYMENTS' WHEN 'ADVANCE_TAX' THEN 'SALES' WHEN 'FURTHER_TAX' THEN 'SALES' ELSE 'SALES_AND_PURCHASES' END;
      "vRole" := CASE "vR"."taxKind" WHEN 'WHT' THEN CASE WHEN "vR"."whtSection" LIKE '153%' THEN 'WHT_PAYABLE_153' ELSE 'WHT_PAYABLE' END
                 WHEN 'ADVANCE_TAX' THEN 'ADVANCE_TAX_COLLECTED' WHEN 'FURTHER_TAX' THEN 'FURTHER_TAX_PAYABLE' WHEN 'EXEMPT' THEN NULL ELSE 'OUTPUT_GST' END;
      "vAcc" := NULL; "vAcc2" := NULL;
      IF "vRole" IS NOT NULL THEN
        SELECT "accountId" INTO "vAcc" FROM "Company"."DefaultAccountMappings" WHERE "tenantId" = "pTenantId" AND role = "vRole";
        IF "vAcc" IS NULL AND "vRole" = 'WHT_PAYABLE_153' THEN
          SELECT "accountId" INTO "vAcc" FROM "Company"."DefaultAccountMappings" WHERE "tenantId" = "pTenantId" AND role = 'WHT_PAYABLE';
        END IF;
      END IF;
      IF "vType" = 'SALES_TAX' AND "vKind" IN ('STANDARD', 'ZERO_RATED') THEN
        SELECT "accountId" INTO "vAcc2" FROM "Company"."DefaultAccountMappings" WHERE "tenantId" = "pTenantId" AND role = 'INPUT_GST';
      END IF;
      BEGIN
        IF "vRole" IS NOT NULL AND "vAcc" IS NULL THEN RAISE EXCEPTION 'posting role % is not mapped', "vRole"; END IF;
        INSERT INTO "Tax"."TaxCodes" ("tenantId", code, description, "taxType", "appliesTo", "rateBasis", "salesTaxKind", "whtSection", "accountId", "inputAccountId", "checkAtl")
        VALUES ("pTenantId", "vR".code, "vR".description, "vType", "vApplies", CASE WHEN "vKind" = 'EXEMPT' THEN 'NONE' ELSE 'PERCENT' END, "vKind",
                CASE WHEN "vType" <> 'SALES_TAX' THEN COALESCE("vR"."whtSection", "vR".code) END, "vAcc", "vAcc2", "vType" <> 'SALES_TAX')
        RETURNING id INTO "vTaxId";
        IF "vKind" IS DISTINCT FROM 'EXEMPT' THEN
          INSERT INTO "Tax"."TaxCodeRates" ("tenantId", "taxCodeId", "effectiveFrom", rate, remarks)
          VALUES ("pTenantId", "vTaxId", CURRENT_DATE, "vR".rate, left(concat_ws(' · ', 'Seed ' || "vVersion", "vR"."rateNote"), 200));
        END IF;
        "vTax" := "vTax" + 1;
      EXCEPTION WHEN OTHERS THEN
        "vSkipped" := "vSkipped" || jsonb_build_object('list', 'tax-codes', 'name', "vR".code, 'reason', SQLERRM);
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('seedVersion', "vVersion", 'leaveTypes', "vLeave", 'salaryComponents', "vSalary", 'taxCodes', "vTax", 'skipped', "vSkipped");
END $function$;

-- ---------------------------------------------------------------------------
-- 8. Error codes (Phase 40)
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('TENANT_CREATE_VIA_PROVISION', 400, 'BUSINESS_RULE', 'PLATFORM', 'Companies are created through tenant onboarding.', 'tenantAddUpdate called without an id', true, NULL),
  ('TENANT_STATUS_ORDER',         409, 'BUSINESS_RULE', 'PLATFORM', 'This company can''t move to that status from its current one.', 'Suspend / reactivate / churn out of order', true, NULL),
  ('TENANT_SUSPENDED',            403, 'AUTH',          'SYSTEM',     'This company''s account is suspended. Contact your administrator or Accountex support.', 'Sign-in or request for a suspended company', true, NULL),
  ('TENANT_INACTIVE',             403, 'AUTH',          'SYSTEM',     'This company''s account is not active.', 'Sign-in or request for a churned or provisioning company', true, NULL),
  ('TENANT_READ_ONLY',            403, 'AUTH',          'SYSTEM',     'This company''s account is read-only until its subscription is settled.', 'Write request while the company is READ_ONLY', true, NULL),
  ('SUBSCRIPTION_NOT_LIVE',       409, 'BUSINESS_RULE', 'PLATFORM', 'This subscription is no longer live.', 'Change to a cancelled or expired subscription', true, NULL),
  ('SUBSCRIPTION_EXISTS',         409, 'BUSINESS_RULE', 'PLATFORM', 'This company already has a live subscription. Change its plan instead.', 'Second live subscription for one company', true, NULL),
  ('USAGE_OVERRIDE_EXISTS',       409, 'BUSINESS_RULE', 'PLATFORM', 'This meter already has a live override for the company. Revoke it first.', 'Second live usage-limit override', true, NULL),
  ('IMPERSONATION_ACTIVE',        409, 'BUSINESS_RULE', 'PLATFORM', 'You already have a support session open. End it before starting another.', 'Second live impersonation session for the admin', true, NULL),
  ('IMPERSONATION_READ_ONLY',     403, 'AUTH',          'SYSTEM',     'This support session is read-only.', 'Write request in a read-only impersonation session', true, NULL),
  ('IMPERSONATION_ENDED',         401, 'AUTH',          'SYSTEM',     'The support session has ended.', 'Request with an ended or expired impersonation session', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;
