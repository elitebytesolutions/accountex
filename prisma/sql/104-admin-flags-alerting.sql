-- 104-admin-flags-alerting.sql
-- Phase 39: Feature flags & alerting (feature flags, maintenance windows, usage alert rules, audit alert rules).
-- Idempotent: safe to run repeatedly via npm run db:sql (or: npx prisma db execute --file prisma/sql/104-admin-flags-alerting.sql).

-- ---------------------------------------------------------------------------
-- 1. featureFlagAddUpdate: prerequisites belong to the flag ("flagId" = the saved flag) and point at another flag
--    ("prerequisiteFlagId", from the element) or a platform module. The generated version keyed them on
--    "prerequisiteFlagId" = the saved flag, so it deleted / matched the wrong rows and inserted self-references.
--    Environments, scheduled changes and variations are unchanged. Rules, targets and default rules are written by the
--    service per environment (same transaction).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."featureFlagAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRec" "Platform"."FeatureFlags";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1FlagEnvironments" "Platform"."FlagEnvironments";
  "vC1FlagPrerequisites" "Platform"."FlagPrerequisites";
  "vC1FlagScheduledChanges" "Platform"."FlagScheduledChanges";
  "vC1FlagVariations" "Platform"."FlagVariations";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."FeatureFlags", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."FeatureFlags" (key, name, description, "flagType", "secondaryType", category, stage, "ownerStaffId", tags, "variationKind", "isTemporary", "expiresOn", "staleReason", "staleSince", "archivedAt")
    VALUES (CASE WHEN "pData" ? 'key' THEN "vRec".key ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'flagType' THEN "vRec"."flagType" ELSE NULL END, CASE WHEN "pData" ? 'secondaryType' THEN "vRec"."secondaryType" ELSE NULL END, CASE WHEN "pData" ? 'category' THEN "vRec".category ELSE NULL END, CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE 'DEFINE' END, CASE WHEN "pData" ? 'ownerStaffId' THEN "vRec"."ownerStaffId" ELSE NULL END, CASE WHEN "pData" ? 'tags' THEN "vRec".tags ELSE '{}' END, CASE WHEN "pData" ? 'variationKind' THEN "vRec"."variationKind" ELSE 'BOOLEAN' END, CASE WHEN "pData" ? 'isTemporary' THEN "vRec"."isTemporary" ELSE TRUE END, CASE WHEN "pData" ? 'expiresOn' THEN "vRec"."expiresOn" ELSE NULL END, CASE WHEN "pData" ? 'staleReason' THEN "vRec"."staleReason" ELSE NULL END, CASE WHEN "pData" ? 'staleSince' THEN "vRec"."staleSince" ELSE NULL END, CASE WHEN "pData" ? 'archivedAt' THEN "vRec"."archivedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."FeatureFlags" t
       SET key = CASE WHEN "pData" ? 'key' THEN "vRec".key ELSE t.key END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "flagType" = CASE WHEN "pData" ? 'flagType' THEN "vRec"."flagType" ELSE t."flagType" END,
           "secondaryType" = CASE WHEN "pData" ? 'secondaryType' THEN "vRec"."secondaryType" ELSE t."secondaryType" END,
           category = CASE WHEN "pData" ? 'category' THEN "vRec".category ELSE t.category END,
           stage = CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE t.stage END,
           "ownerStaffId" = CASE WHEN "pData" ? 'ownerStaffId' THEN "vRec"."ownerStaffId" ELSE t."ownerStaffId" END,
           tags = CASE WHEN "pData" ? 'tags' THEN "vRec".tags ELSE t.tags END,
           "variationKind" = CASE WHEN "pData" ? 'variationKind' THEN "vRec"."variationKind" ELSE t."variationKind" END,
           "isTemporary" = CASE WHEN "pData" ? 'isTemporary' THEN "vRec"."isTemporary" ELSE t."isTemporary" END,
           "expiresOn" = CASE WHEN "pData" ? 'expiresOn' THEN "vRec"."expiresOn" ELSE t."expiresOn" END,
           "staleReason" = CASE WHEN "pData" ? 'staleReason' THEN "vRec"."staleReason" ELSE t."staleReason" END,
           "staleSince" = CASE WHEN "pData" ? 'staleSince' THEN "vRec"."staleSince" ELSE t."staleSince" END,
           "archivedAt" = CASE WHEN "pData" ? 'archivedAt' THEN "vRec"."archivedAt" ELSE t."archivedAt" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."FeatureFlags" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'FeatureFlags %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'FeatureFlags % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'environments' THEN
    -- environments: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."FlagEnvironments"
     WHERE "flagId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'environments') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'environments') WITH ORDINALITY t(x, n) LOOP
      "vC1FlagEnvironments" := jsonb_populate_record(NULL::"Platform"."FlagEnvironments", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."FlagEnvironments" t
           SET environment = CASE WHEN "vE1" ? 'environment' THEN "vC1FlagEnvironments".environment ELSE t.environment END,
               "isOn" = CASE WHEN "vE1" ? 'isOn' THEN "vC1FlagEnvironments"."isOn" ELSE t."isOn" END,
               "lastEvaluatedAt" = CASE WHEN "vE1" ? 'lastEvaluatedAt' THEN "vC1FlagEnvironments"."lastEvaluatedAt" ELSE t."lastEvaluatedAt" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."flagId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'FlagEnvironments: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."FlagEnvironments" ("flagId", environment, "isOn", "lastEvaluatedAt")
        VALUES ("vRet", CASE WHEN "vE1" ? 'environment' THEN "vC1FlagEnvironments".environment ELSE NULL END, CASE WHEN "vE1" ? 'isOn' THEN "vC1FlagEnvironments"."isOn" ELSE FALSE END, CASE WHEN "vE1" ? 'lastEvaluatedAt' THEN "vC1FlagEnvironments"."lastEvaluatedAt" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'prerequisites' THEN
    -- prerequisites (of every environment): rows missing from the array are removed, rows with "id" are updated,
    -- others inserted. Each element names its environment ("flagEnvironmentId") and either "prerequisiteFlagId" +
    -- "requiredVariationIdx" or "prerequisiteModuleId".
    DELETE FROM "Platform"."FlagPrerequisites"
     WHERE "flagId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'prerequisites') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'prerequisites') WITH ORDINALITY t(x, n) LOOP
      "vC1FlagPrerequisites" := jsonb_populate_record(NULL::"Platform"."FlagPrerequisites", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."FlagPrerequisites" t
           SET "flagEnvironmentId" = CASE WHEN "vE1" ? 'flagEnvironmentId' THEN "vC1FlagPrerequisites"."flagEnvironmentId" ELSE t."flagEnvironmentId" END,
               "prerequisiteFlagId" = CASE WHEN "vE1" ? 'prerequisiteFlagId' THEN "vC1FlagPrerequisites"."prerequisiteFlagId" ELSE t."prerequisiteFlagId" END,
               "requiredVariationIdx" = CASE WHEN "vE1" ? 'requiredVariationIdx' THEN "vC1FlagPrerequisites"."requiredVariationIdx" ELSE t."requiredVariationIdx" END,
               "prerequisiteModuleId" = CASE WHEN "vE1" ? 'prerequisiteModuleId' THEN "vC1FlagPrerequisites"."prerequisiteModuleId" ELSE t."prerequisiteModuleId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."flagId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'FlagPrerequisites: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."FlagPrerequisites" ("flagId", "flagEnvironmentId", "prerequisiteFlagId", "requiredVariationIdx", "prerequisiteModuleId")
        VALUES ("vRet", CASE WHEN "vE1" ? 'flagEnvironmentId' THEN "vC1FlagPrerequisites"."flagEnvironmentId" ELSE NULL END, CASE WHEN "vE1" ? 'prerequisiteFlagId' THEN "vC1FlagPrerequisites"."prerequisiteFlagId" ELSE NULL END, CASE WHEN "vE1" ? 'requiredVariationIdx' THEN "vC1FlagPrerequisites"."requiredVariationIdx" ELSE NULL END, CASE WHEN "vE1" ? 'prerequisiteModuleId' THEN "vC1FlagPrerequisites"."prerequisiteModuleId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'scheduledChanges' THEN
    -- scheduledChanges: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."FlagScheduledChanges"
     WHERE "flagId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'scheduledChanges') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'scheduledChanges') WITH ORDINALITY t(x, n) LOOP
      "vC1FlagScheduledChanges" := jsonb_populate_record(NULL::"Platform"."FlagScheduledChanges", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."FlagScheduledChanges" t
           SET environment = CASE WHEN "vE1" ? 'environment' THEN "vC1FlagScheduledChanges".environment ELSE t.environment END,
               "stepDate" = CASE WHEN "vE1" ? 'stepDate' THEN "vC1FlagScheduledChanges"."stepDate" ELSE t."stepDate" END,
               "rolloutPct" = CASE WHEN "vE1" ? 'rolloutPct' THEN "vC1FlagScheduledChanges"."rolloutPct" ELSE t."rolloutPct" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1FlagScheduledChanges".status ELSE t.status END,
               "changeRequestId" = CASE WHEN "vE1" ? 'changeRequestId' THEN "vC1FlagScheduledChanges"."changeRequestId" ELSE t."changeRequestId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."flagId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'FlagScheduledChanges: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."FlagScheduledChanges" ("flagId", environment, "stepDate", "rolloutPct", status, "changeRequestId")
        VALUES ("vRet", CASE WHEN "vE1" ? 'environment' THEN "vC1FlagScheduledChanges".environment ELSE 'PRODUCTION' END, CASE WHEN "vE1" ? 'stepDate' THEN "vC1FlagScheduledChanges"."stepDate" ELSE NULL END, CASE WHEN "vE1" ? 'rolloutPct' THEN "vC1FlagScheduledChanges"."rolloutPct" ELSE NULL END, CASE WHEN "vE1" ? 'status' THEN "vC1FlagScheduledChanges".status ELSE 'PLANNED' END, CASE WHEN "vE1" ? 'changeRequestId' THEN "vC1FlagScheduledChanges"."changeRequestId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'variations' THEN
    -- variations: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."FlagVariations"
     WHERE "flagId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'variations') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'variations') WITH ORDINALITY t(x, n) LOOP
      "vC1FlagVariations" := jsonb_populate_record(NULL::"Platform"."FlagVariations", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."FlagVariations" t
           SET idx = CASE WHEN "vE1" ? 'idx' THEN "vC1FlagVariations".idx ELSE t.idx END,
               name = CASE WHEN "vE1" ? 'name' THEN "vC1FlagVariations".name ELSE t.name END,
               value = CASE WHEN "vE1" ? 'value' THEN "vC1FlagVariations".value ELSE t.value END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."flagId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'FlagVariations: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."FlagVariations" ("flagId", idx, name, value)
        VALUES ("vRet", CASE WHEN "vE1" ? 'idx' THEN "vC1FlagVariations".idx ELSE NULL END, CASE WHEN "vE1" ? 'name' THEN "vC1FlagVariations".name ELSE NULL END, CASE WHEN "vE1" ? 'value' THEN "vC1FlagVariations".value ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $function$;

-- ---------------------------------------------------------------------------
-- 2. getFeatureFlagInfo: prerequisites keyed on "flagId" (was "prerequisiteFlagId"); also returns the per-environment
--    rules, targets and default rules so the record reads back whole.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."getFeatureFlagInfo"("pId" uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('flagTypeLabel', "Lookups"."getLookupLabel"('FlagType', t."flagType") ->> 'label', 'flagTypeTone', "Lookups"."getLookupLabel"('FlagType', t."flagType") ->> 'tone', 'secondaryTypeLabel', "Lookups"."getLookupLabel"('SecondaryType', t."secondaryType") ->> 'label', 'secondaryTypeTone', "Lookups"."getLookupLabel"('SecondaryType', t."secondaryType") ->> 'tone', 'categoryLabel', "Lookups"."getLookupLabel"('FeatureFlagCategory', t.category) ->> 'label', 'categoryTone', "Lookups"."getLookupLabel"('FeatureFlagCategory', t.category) ->> 'tone', 'stageLabel', "Lookups"."getLookupLabel"('FeatureFlagStage', t.stage) ->> 'label', 'stageTone', "Lookups"."getLookupLabel"('FeatureFlagStage', t.stage) ->> 'tone', 'variationKindLabel', "Lookups"."getLookupLabel"('VariationKind', t."variationKind") ->> 'label', 'variationKindTone', "Lookups"."getLookupLabel"('VariationKind', t."variationKind") ->> 'tone') ||
         jsonb_build_object(
           'environments', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."FlagEnvironments" c1 WHERE c1."flagId" = t.id), '[]'::jsonb),
           'prerequisites', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."FlagPrerequisites" c1 WHERE c1."flagId" = t.id), '[]'::jsonb),
           'scheduledChanges', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."FlagScheduledChanges" c1 WHERE c1."flagId" = t.id), '[]'::jsonb),
           'variations', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1.idx) FROM "Platform"."FlagVariations" c1 WHERE c1."flagId" = t.id), '[]'::jsonb),
           'rules', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."flagEnvironmentId", c1."position") FROM "Platform"."FlagRules" c1 WHERE c1."flagId" = t.id), '[]'::jsonb),
           'targets', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."FlagTargets" c1 WHERE c1."flagId" = t.id), '[]'::jsonb),
           'defaultRules', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."FlagDefaultRules" c1 WHERE c1."flagId" = t.id), '[]'::jsonb))
    FROM "Platform"."FeatureFlags" t
   WHERE t.id = "pId"
$function$;

-- ---------------------------------------------------------------------------
-- 3. Platform.flagAuditWrite: appends one Platform.FlagAuditLogs row (append-only) for a flag change, attributed to
--    the acting staff member (app.userId = the Super Admin's PlatformStaff mirror). Called by the flags service inside
--    the same transaction as the change. pEnvironment: DEV / STAGING / PRODUCTION / ALL; pEventKind: lookup EventKind.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."flagAuditWrite"(
  "pFlagId" uuid, "pEnvironment" text, "pEventKind" text, "pSummary" text,
  "pBefore" jsonb DEFAULT '{}'::jsonb, "pAfter" jsonb DEFAULT '{}'::jsonb, "pIsEmergency" boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vStaff" uuid := "Company"."getCurrentUserId"();
  "vId" uuid;
BEGIN
  IF "vStaff" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Platform"."PlatformStaff" s WHERE s.id = "vStaff") THEN
    "vStaff" := NULL;
  END IF;
  INSERT INTO "Platform"."FlagAuditLogs"
    ("flagId", environment, "staffUserId", "eventKind", summary, "beforeState", "afterState", "isEmergency")
  VALUES ("pFlagId", "pEnvironment", "vStaff", "pEventKind", left("pSummary", 500),
          COALESCE("pBefore", '{}'::jsonb), COALESCE("pAfter", '{}'::jsonb), COALESCE("pIsEmergency", false))
  RETURNING id INTO "vId";
  RETURN "vId";
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Row history: AuditAlertRules had no audit trigger. FlagSdkKeys keeps its trigger but the key hash is redacted
--    from the platform log (the secret itself is never stored).
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "auditAlertRulesAudit" ON "Platform"."AuditAlertRules";
CREATE TRIGGER "auditAlertRulesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."AuditAlertRules"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

DROP TRIGGER IF EXISTS "flagSdkKeysAudit" ON "Platform"."FlagSdkKeys";
CREATE TRIGGER "flagSdkKeysAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."FlagSdkKeys"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditRedacted"('keyHash');

-- The flag key is immutable (trigger platformFeatureFlagKeyImmutable): name the catalogue code in the error.
CREATE OR REPLACE FUNCTION "Platform"."triggerFlagKeyImmutable"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.key IS DISTINCT FROM OLD.key THEN
    RAISE EXCEPTION 'Flag key % cannot be changed', OLD.key USING ERRCODE = 'check_violation', HINT = 'FLAG_KEY_IMMUTABLE';
  END IF;
  RETURN NEW;
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Error codes (duplicate keys use DB_UNIQUE_VIOLATION, stale rows CONCURRENCY_CONFLICT).
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('FLAG_KEY_IMMUTABLE',         400, 'BUSINESS_RULE', 'PLATFORM', 'A flag''s key can''t be changed once it is created. Create a new flag instead.', 'Update of FeatureFlags.key', true, NULL),
  ('FLAG_PREREQUISITE_CYCLE',    409, 'BUSINESS_RULE', 'PLATFORM', 'These prerequisites would make flags depend on each other in a loop.', 'Saving flag prerequisites that form a cycle in one environment', true, NULL),
  ('FLAG_KILL_CONFIRM_REQUIRED', 400, 'BUSINESS_RULE', 'PLATFORM', 'Type the flag key to confirm flipping a kill switch.', 'Kill switch toggled without the typed key', true, NULL),
  ('FLAG_STAGE_ORDER',           400, 'BUSINESS_RULE', 'PLATFORM', 'A flag moves forward through its lifecycle, or back one stage at a time. Restore an archived flag first.', 'Lifecycle move out of order', true, NULL),
  ('FLAG_ARCHIVED',              409, 'BUSINESS_RULE', 'PLATFORM', 'This flag is archived. Restore it before changing it.', 'Change to an archived flag', true, NULL),
  ('FLAG_SDK_KEY_REVOKED',       409, 'BUSINESS_RULE', 'PLATFORM', 'This SDK key is already revoked.', 'Rotate or revoke of a revoked SDK key', true, NULL),
  ('MAINTENANCE_WINDOW_CLOSED',  409, 'BUSINESS_RULE', 'PLATFORM', 'Completed or cancelled maintenance windows can''t be changed.', 'Edit or cancel of a completed / cancelled maintenance window', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;
