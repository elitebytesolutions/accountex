-- 103-admin-platform-config.sql
-- Phase 38: Platform configuration (dunning policies, tenant segments, resellers, platform security, API keys,
-- webhooks, backups) and the Super Admin login enforcement columns.
-- Idempotent: safe to run repeatedly via npm run db:sql (or: npx prisma db execute --file prisma/sql/103-admin-platform-config.sql).

-- ===========================================================================
-- 1. Fixes to the generated save / read functions
-- ===========================================================================

-- 1.1 tenantSegmentAddUpdate: the `tenants` (SegmentTenants include / exclude overrides) part used an undeclared
--     "vTenant" (copied from a tenant-scoped template). Each override row carries its own tenantId.
CREATE OR REPLACE FUNCTION "Platform"."tenantSegmentAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRec" "Platform"."TenantSegments";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1SegmentTenants" "Platform"."SegmentTenants";
  "vC1TenantSegmentRules" "Platform"."TenantSegmentRules";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."TenantSegments", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."TenantSegments" (key, name, description, icon, tone)
    VALUES (CASE WHEN "pData" ? 'key' THEN "vRec".key ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE NULL END, CASE WHEN "pData" ? 'tone' THEN "vRec".tone ELSE 'GREEN' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."TenantSegments" t
       SET key = CASE WHEN "pData" ? 'key' THEN "vRec".key ELSE t.key END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END,
           tone = CASE WHEN "pData" ? 'tone' THEN "vRec".tone ELSE t.tone END,
           "deletedAt" = CASE WHEN "pData" ? 'deletedAt' THEN "vRec"."deletedAt" ELSE t."deletedAt" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."TenantSegments" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'TenantSegments %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'TenantSegments % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'rules' THEN
    -- rules: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."TenantSegmentRules"
     WHERE "segmentId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'rules') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'rules') WITH ORDINALITY t(x, n) LOOP
      "vC1TenantSegmentRules" := jsonb_populate_record(NULL::"Platform"."TenantSegmentRules", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."TenantSegmentRules" t
           SET position = CASE WHEN "vE1" ? 'position' THEN "vC1TenantSegmentRules".position ELSE t.position END,
               attribute = CASE WHEN "vE1" ? 'attribute' THEN "vC1TenantSegmentRules".attribute ELSE t.attribute END,
               operator = CASE WHEN "vE1" ? 'operator' THEN "vC1TenantSegmentRules".operator ELSE t.operator END,
               "ruleValues" = CASE WHEN "vE1" ? 'ruleValues' THEN "vC1TenantSegmentRules"."ruleValues" ELSE t."ruleValues" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."segmentId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'TenantSegmentRules: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."TenantSegmentRules" ("segmentId", position, attribute, operator, "ruleValues")
        VALUES ("vRet", CASE WHEN "vE1" ? 'position' THEN "vC1TenantSegmentRules".position ELSE NULL END, CASE WHEN "vE1" ? 'attribute' THEN "vC1TenantSegmentRules".attribute ELSE NULL END, CASE WHEN "vE1" ? 'operator' THEN "vC1TenantSegmentRules".operator ELSE NULL END, CASE WHEN "vE1" ? 'ruleValues' THEN "vC1TenantSegmentRules"."ruleValues" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;
    END LOOP;
  END IF;

  IF "pData" ? 'tenants' THEN
    -- tenants (manual INCLUDE / EXCLUDE overrides): rows missing from the array are removed, rows with "id" are
    -- updated, others inserted. The tenant comes from each element (this is a platform table, not tenant-scoped).
    DELETE FROM "Platform"."SegmentTenants"
     WHERE "segmentId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'tenants') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'tenants') WITH ORDINALITY t(x, n) LOOP
      "vC1SegmentTenants" := jsonb_populate_record(NULL::"Platform"."SegmentTenants", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."SegmentTenants" t
           SET membership = CASE WHEN "vE1" ? 'membership' THEN "vC1SegmentTenants".membership ELSE t.membership END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."segmentId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SegmentTenants: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."SegmentTenants" ("segmentId", "tenantId", membership)
        VALUES ("vRet", "vC1SegmentTenants"."tenantId", CASE WHEN "vE1" ? 'membership' THEN "vC1SegmentTenants".membership ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;
    END LOOP;
  END IF;
  RETURN "vRet";
END $function$;

-- 1.2 getPlatformSecuritySettingInfo(pId uuid) ignored its argument (the table is the single row id = 1):
--     replaced by a no-argument reader of row 1.
DROP FUNCTION IF EXISTS "Platform"."getPlatformSecuritySettingInfo"(uuid);
CREATE OR REPLACE FUNCTION "Platform"."getPlatformSecuritySettingInfo"()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('ssoProviderLabel', "Lookups"."getLookupLabel"('PlatformSecuritySettingSsoProvider', t."ssoProvider") ->> 'label', 'ssoProviderTone', "Lookups"."getLookupLabel"('PlatformSecuritySettingSsoProvider', t."ssoProvider") ->> 'tone', 'samlNameIdFormatLabel', "Lookups"."getLookupLabel"('SamlNameIdFormat', t."samlNameIdFormat") ->> 'label', 'samlNameIdFormatTone', "Lookups"."getLookupLabel"('SamlNameIdFormat', t."samlNameIdFormat") ->> 'tone', 'mfaEnforcementLabel', "Lookups"."getLookupLabel"('MfaEnforcement', t."mfaEnforcement") ->> 'label', 'mfaEnforcementTone', "Lookups"."getLookupLabel"('MfaEnforcement', t."mfaEnforcement") ->> 'tone')
    FROM "Platform"."PlatformSecuritySettings" t
   WHERE t.id = 1
$function$;
COMMENT ON FUNCTION "Platform"."getPlatformSecuritySettingInfo"() IS 'Read the platform security settings (the single row id = 1).';

-- 1.3 WebhookEndpoints_events_check listed '"Payroll".posted' (a schema-qualifier slipped into the literal) instead of
--     payroll.posted (the WebhookDeliveryEventType lookup code). The table is empty, so the constraint is replaced.
ALTER TABLE "Platform"."WebhookEndpoints" DROP CONSTRAINT IF EXISTS "WebhookEndpoints_events_check";
ALTER TABLE "Platform"."WebhookEndpoints" ADD CONSTRAINT "WebhookEndpoints_events_check"
  CHECK (cardinality(events) > 0 AND events <@ ARRAY['invoice.created', 'invoice.paid', 'payment.failed', 'voucher.posted',
    'employee.created', 'payroll.posted', 'fbr.submitted', 'tenant.suspended']::text[]);

-- 1.4 dunningPolicyAddUpdate inserted NULL into the NOT NULL retrySchedule when it was omitted: defaults to [].
CREATE OR REPLACE FUNCTION "Platform"."dunningPolicyAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRec" "Platform"."DunningPolicies";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."DunningPolicies", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."DunningPolicies" (name, "isActive", "graceDays", "readOnlyDays", "suspendedDays", "archiveDays", "retryHour", "salaryRetryDays", "retrySchedule", "emailEnabled", "emailOffsets", "smsEnabled", "smsOffsets", "whatsappEnabled", "whatsappOffsets", "effectiveFrom")
    VALUES (CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END, CASE WHEN "pData" ? 'graceDays' THEN "vRec"."graceDays" ELSE 7 END, CASE WHEN "pData" ? 'readOnlyDays' THEN "vRec"."readOnlyDays" ELSE 7 END, CASE WHEN "pData" ? 'suspendedDays' THEN "vRec"."suspendedDays" ELSE 31 END, CASE WHEN "pData" ? 'archiveDays' THEN "vRec"."archiveDays" ELSE 90 END, CASE WHEN "pData" ? 'retryHour' THEN "vRec"."retryHour" ELSE 10 END, CASE WHEN "pData" ? 'salaryRetryDays' THEN "vRec"."salaryRetryDays" ELSE '{1,10}' END, COALESCE(CASE WHEN "pData" ? 'retrySchedule' THEN "vRec"."retrySchedule" END, '[]'::jsonb), CASE WHEN "pData" ? 'emailEnabled' THEN "vRec"."emailEnabled" ELSE TRUE END, CASE WHEN "pData" ? 'emailOffsets' THEN "vRec"."emailOffsets" ELSE '{-3,0,3,7,14}' END, CASE WHEN "pData" ? 'smsEnabled' THEN "vRec"."smsEnabled" ELSE TRUE END, CASE WHEN "pData" ? 'smsOffsets' THEN "vRec"."smsOffsets" ELSE '{0,1,7}' END, CASE WHEN "pData" ? 'whatsappEnabled' THEN "vRec"."whatsappEnabled" ELSE FALSE END, CASE WHEN "pData" ? 'whatsappOffsets' THEN "vRec"."whatsappOffsets" ELSE '{0,3}' END, CASE WHEN "pData" ? 'effectiveFrom' THEN "vRec"."effectiveFrom" ELSE CURRENT_DATE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."DunningPolicies" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END,
           "graceDays" = CASE WHEN "pData" ? 'graceDays' THEN "vRec"."graceDays" ELSE t."graceDays" END,
           "readOnlyDays" = CASE WHEN "pData" ? 'readOnlyDays' THEN "vRec"."readOnlyDays" ELSE t."readOnlyDays" END,
           "suspendedDays" = CASE WHEN "pData" ? 'suspendedDays' THEN "vRec"."suspendedDays" ELSE t."suspendedDays" END,
           "archiveDays" = CASE WHEN "pData" ? 'archiveDays' THEN "vRec"."archiveDays" ELSE t."archiveDays" END,
           "retryHour" = CASE WHEN "pData" ? 'retryHour' THEN "vRec"."retryHour" ELSE t."retryHour" END,
           "salaryRetryDays" = CASE WHEN "pData" ? 'salaryRetryDays' THEN "vRec"."salaryRetryDays" ELSE t."salaryRetryDays" END,
           "retrySchedule" = CASE WHEN "pData" ? 'retrySchedule' THEN COALESCE("vRec"."retrySchedule", '[]'::jsonb) ELSE t."retrySchedule" END,
           "emailEnabled" = CASE WHEN "pData" ? 'emailEnabled' THEN "vRec"."emailEnabled" ELSE t."emailEnabled" END,
           "emailOffsets" = CASE WHEN "pData" ? 'emailOffsets' THEN "vRec"."emailOffsets" ELSE t."emailOffsets" END,
           "smsEnabled" = CASE WHEN "pData" ? 'smsEnabled' THEN "vRec"."smsEnabled" ELSE t."smsEnabled" END,
           "smsOffsets" = CASE WHEN "pData" ? 'smsOffsets' THEN "vRec"."smsOffsets" ELSE t."smsOffsets" END,
           "whatsappEnabled" = CASE WHEN "pData" ? 'whatsappEnabled' THEN "vRec"."whatsappEnabled" ELSE t."whatsappEnabled" END,
           "whatsappOffsets" = CASE WHEN "pData" ? 'whatsappOffsets' THEN "vRec"."whatsappOffsets" ELSE t."whatsappOffsets" END,
           "effectiveFrom" = CASE WHEN "pData" ? 'effectiveFrom' THEN "vRec"."effectiveFrom" ELSE t."effectiveFrom" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."DunningPolicies" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'DunningPolicies %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'DunningPolicies % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $function$;

-- ===========================================================================
-- 2. Platform security settings: the single row, seeded with SAFE defaults (nothing enforced that could lock the
--    Super Admin out). The column defaults (ipAllowlistEnforced true, mfaEnforcement EVERYONE, SAML required) are not
--    used: the row is inserted explicitly, once; re-runs never overwrite what the Super Admin has saved.
-- ===========================================================================
INSERT INTO "Platform"."PlatformSecuritySettings"
  (id, "ssoProvider", "requireSso", "breakGlassSuperAdmin", "mfaEnforcement", "mfaAllowWebauthn", "mfaAllowTotp", "mfaAllowSms",
   "ipAllowlistEnforced", "pwMinLength", "pwRequireMixedCase", "pwRequireNumber", "pwRequireSymbol", "pwBlockBreached", "pwBlockReuse",
   "pwRotationDays", "lockoutAttempts", "lockoutMinutes")
VALUES (1, 'NONE', false, true, 'OPTIONAL', true, true, false,
        false, 12, true, true, true, true, false,
        NULL, 5, 15)
ON CONFLICT (id) DO NOTHING;

-- ===========================================================================
-- 3. Super Admin login enforcement: failed-attempt counter and lock (Platform.PlatformAdmin has no audit trigger,
--    so counting attempts does not flood history; lastLoginAt already exists and is now written on success).
-- ===========================================================================
ALTER TABLE "Platform"."PlatformAdmin" ADD COLUMN IF NOT EXISTS "failedLoginCount" integer NOT NULL DEFAULT 0;
ALTER TABLE "Platform"."PlatformAdmin" ADD COLUMN IF NOT EXISTS "lockedUntil" timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platformAdminFailedLoginChk') THEN
    ALTER TABLE "Platform"."PlatformAdmin" ADD CONSTRAINT "platformAdminFailedLoginChk" CHECK ("failedLoginCount" >= 0);
  END IF;
END $$;

-- ===========================================================================
-- 4. Segment membership: not excluded AND (included OR every rule matches), the template's segMatch. The same rule as
--    the API's matcher (src/server/modules/platform-admin/config/segments/domain/segment-matcher.ts).
--    Tenant facts: PLAN = code of the live subscription's plan, REGION = province, CITY (case-insensitive),
--    INDUSTRY, AGE_DAYS = whole days since createdAt, SALES_TAX_REGISTERED / BETA / INTERNAL = 'true' | 'false',
--    APP_VERSION (x.y.z, compared numerically), PLATFORM (any of the tenant's platforms).
-- ===========================================================================
CREATE OR REPLACE FUNCTION "Platform"."tenantSegmentRuleMatches"("pAttribute" text, "pOperator" text, "pValues" text[],
  "pPlan" text, "pProvince" text, "pCity" text, "pIndustry" text, "pAgeDays" integer, "pSalesTax" boolean, "pBeta" boolean,
  "pInternal" boolean, "pAppVersion" text, "pPlatforms" text[])
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vActual" text[];
  "vWanted" text[] := "pValues";
BEGIN
  IF "pValues" IS NULL OR cardinality("pValues") = 0 THEN RETURN false; END IF;

  IF "pAttribute" = 'AGE_DAYS' THEN
    IF "pAgeDays" IS NULL THEN RETURN "pOperator" = 'NOT_IN'; END IF;
    RETURN CASE "pOperator"
      WHEN 'GT' THEN "pAgeDays" > "pValues"[1]::numeric
      WHEN 'LT' THEN "pAgeDays" < "pValues"[1]::numeric
      WHEN 'IN' THEN "pAgeDays"::numeric = ANY ("pValues"::numeric[])
      WHEN 'NOT_IN' THEN NOT ("pAgeDays"::numeric = ANY ("pValues"::numeric[]))
      ELSE false END;
  END IF;

  IF "pAttribute" = 'APP_VERSION' THEN
    IF "pAppVersion" IS NULL THEN RETURN "pOperator" = 'NOT_IN'; END IF;
    RETURN CASE "pOperator"
      WHEN 'GT' THEN string_to_array("pAppVersion", '.')::int[] > string_to_array("pValues"[1], '.')::int[]
      WHEN 'LT' THEN string_to_array("pAppVersion", '.')::int[] < string_to_array("pValues"[1], '.')::int[]
      WHEN 'IN' THEN EXISTS (SELECT 1 FROM unnest("pValues") v WHERE string_to_array(v, '.')::int[] = string_to_array("pAppVersion", '.')::int[])
      WHEN 'NOT_IN' THEN NOT EXISTS (SELECT 1 FROM unnest("pValues") v WHERE string_to_array(v, '.')::int[] = string_to_array("pAppVersion", '.')::int[])
      ELSE false END;
  END IF;

  "vActual" := CASE "pAttribute"
    WHEN 'PLAN' THEN ARRAY["pPlan"]
    WHEN 'REGION' THEN ARRAY["pProvince"]
    WHEN 'CITY' THEN ARRAY[lower(btrim("pCity"))]
    WHEN 'INDUSTRY' THEN ARRAY["pIndustry"]
    WHEN 'SALES_TAX_REGISTERED' THEN ARRAY[COALESCE("pSalesTax", false)::text]
    WHEN 'BETA' THEN ARRAY[COALESCE("pBeta", false)::text]
    WHEN 'INTERNAL' THEN ARRAY[COALESCE("pInternal", false)::text]
    WHEN 'PLATFORM' THEN COALESCE("pPlatforms", '{}'::text[])
    END;
  IF "vActual" IS NULL THEN RETURN false; END IF; -- unknown attribute
  IF "pAttribute" = 'CITY' THEN
    "vWanted" := ARRAY(SELECT lower(btrim(v)) FROM unnest("pValues") v);
  END IF;

  RETURN CASE "pOperator"
    WHEN 'IN' THEN COALESCE("vActual" && "vWanted", false)
    WHEN 'NOT_IN' THEN NOT COALESCE("vActual" && "vWanted", false)
    ELSE false END;
END $function$;

CREATE OR REPLACE FUNCTION "Platform"."evaluateTenantSegment"("pSegmentId" uuid)
 RETURNS TABLE ("tenantId" uuid, "matchedBy" text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  WITH facts AS (
    SELECT tn.id, tn.province, tn.city, tn.industry, tn."appVersion", tn.platforms, tn."isBeta", tn."isInternal",
           tn."salesTaxRegistered",
           floor(extract(epoch FROM now() - tn."createdAt") / 86400)::integer AS "ageDays",
           (SELECT p.code FROM "Platform"."Subscriptions" s JOIN "Platform"."SubscriptionPlans" p ON p.id = s."planId"
             WHERE s."tenantId" = tn.id AND s.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED')
             ORDER BY s."startsOn" DESC LIMIT 1) AS plan
      FROM "Platform"."Tenants" tn
  )
  SELECT f.id, CASE WHEN o.membership = 'INCLUDE' THEN 'INCLUDE' ELSE 'RULES' END
    FROM facts f
    JOIN "Platform"."TenantSegments" sg ON sg.id = "pSegmentId"
    LEFT JOIN "Platform"."SegmentTenants" o ON o."segmentId" = sg.id AND o."tenantId" = f.id
   WHERE o.membership IS DISTINCT FROM 'EXCLUDE'
     AND (o.membership = 'INCLUDE'
          OR (EXISTS (SELECT 1 FROM "Platform"."TenantSegmentRules" r WHERE r."segmentId" = sg.id)
              AND NOT EXISTS (SELECT 1 FROM "Platform"."TenantSegmentRules" r
                               WHERE r."segmentId" = sg.id
                                 AND NOT "Platform"."tenantSegmentRuleMatches"(r.attribute, r.operator, r."ruleValues",
                                       f.plan, f.province, f.city, f.industry, f."ageDays", f."salesTaxRegistered", f."isBeta",
                                       f."isInternal", f."appVersion", f.platforms))))
$function$;
COMMENT ON FUNCTION "Platform"."evaluateTenantSegment"(uuid) IS
  'Tenants in a segment: not excluded AND (included OR all rules match). Used by the admin API and broadcasts (Phase 42).';

-- ===========================================================================
-- 5. Row history (audit). Every Phase 38 table carries an audit trigger; secrets never reach rowData / changes:
--    the redacting trigger writes "[redacted]" for them (Company.writeAuditEntry hide list = trigger arguments).
-- ===========================================================================
DROP TRIGGER IF EXISTS "resellersAudit" ON "Platform"."Resellers";
CREATE TRIGGER "resellersAudit" AFTER INSERT OR DELETE OR UPDATE ON "Platform"."Resellers"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditRedacted"('ibanEnc');

DROP TRIGGER IF EXISTS "platformApiKeysAudit" ON "Platform"."PlatformApiKeys";
CREATE TRIGGER "platformApiKeysAudit" AFTER INSERT OR DELETE OR UPDATE ON "Platform"."PlatformApiKeys"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditRedacted"('keyHash', 'previousKeyHash');

DROP TRIGGER IF EXISTS "webhookEndpointsAudit" ON "Platform"."WebhookEndpoints";
CREATE TRIGGER "webhookEndpointsAudit" AFTER INSERT OR DELETE OR UPDATE ON "Platform"."WebhookEndpoints"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditRedacted"('signingSecretEnc');

-- Was missing. The request signature is an HMAC of the payload with the endpoint's secret: kept out of history too.
DROP TRIGGER IF EXISTS "webhookDeliveriesAudit" ON "Platform"."WebhookDeliveries";
CREATE TRIGGER "webhookDeliveriesAudit" AFTER INSERT OR DELETE OR UPDATE ON "Platform"."WebhookDeliveries"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditRedacted"('requestSignature');

-- ===========================================================================
-- 6. Error codes (Platform.ErrorCodes)
-- ===========================================================================
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('DUNNING_POLICY_DAY_ORDER', 400, 'VALIDATION', 'PLATFORM', 'Retry days must run in order and fall before the account is cancelled.', 'Dunning policy retry schedule / salary days out of order or past the cancel day', false, NULL),
  ('DUNNING_POLICY_IN_USE',    409, 'BUSINESS_RULE', 'PLATFORM', 'This policy is active or dunning cases follow it. Activate another policy first.', 'Delete of the active dunning policy or one used by dunning cases', true, NULL),
  ('SEGMENT_RULE_INVALID',     400, 'VALIDATION', 'PLATFORM', 'Greater than / less than only work with tenant age and app version, and take one value.', 'Segment rule with an operator its attribute does not support', false, NULL),
  ('SEGMENT_IN_USE',           409, 'BUSINESS_RULE', 'PLATFORM', 'Feature flags or broadcasts use this segment. Remove it from them first.', 'Delete of a segment referenced by flag rules or broadcasts', true, NULL),
  ('RESELLER_IN_USE',          409, 'BUSINESS_RULE', 'PLATFORM', 'Tenants, payouts, leads or coupons are linked to this reseller. Suspend or terminate it instead.', 'Delete of a reseller that is referenced', true, NULL),
  ('SECURITY_SELF_LOCKOUT',    409, 'BUSINESS_RULE', 'PLATFORM', 'This would lock you out: your current IP address must stay on the enforced allow-list.', 'Allow-list change that would exclude the IP of the request making it', true, NULL),
  ('SECURITY_SSO_INCOMPLETE',  400, 'VALIDATION', 'PLATFORM', 'Fill in the identity provider details for the chosen sign-in method.', 'SAML needs the IdP SSO URL and entity ID; Google needs the domain and client ID', false, NULL),
  ('ADMIN_IP_NOT_ALLOWED',     403, 'AUTH', 'PLATFORM', 'The console can''t be reached from this network.', 'Super Admin sign-in from an IP outside the enforced allow-list', true, NULL),
  ('API_KEY_REVOKED',          409, 'BUSINESS_RULE', 'PLATFORM', 'This API key is already revoked.', 'Rotate or revoke of a revoked API key', false, NULL),
  ('BACKUP_ALREADY_RUNNING',   409, 'BUSINESS_RULE', 'PLATFORM', 'A backup is already running. Wait for it to finish.', 'On-demand backup while another one is RUNNING', false, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;
