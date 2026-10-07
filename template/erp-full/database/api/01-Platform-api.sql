-- =============================================================================
-- Finsoft ERP (Full edition) — API: "Platform"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- SubscriptionPlans: insert (no "id") or update (with "id"); child arrays: features, limits
CREATE OR REPLACE FUNCTION "Platform"."subscriptionPlanAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."SubscriptionPlans";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1SubscriptionPlanFeatures" "Platform"."SubscriptionPlanFeatures";
  "vC1SubscriptionPlanLimits" "Platform"."SubscriptionPlanLimits";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."SubscriptionPlans", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."SubscriptionPlans" (code, name, tagline, "priceMonthly", "priceAnnual", "userSeats", "storageGb", "trialDays", "sortOrder", "isPublic", status, "isCustomPrice", "supportChannel", "supportResponseHours", "slaUptimePct", "extraSeatPrice")
    VALUES (CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'tagline' THEN "vRec".tagline ELSE NULL END, CASE WHEN "pData" ? 'priceMonthly' THEN "vRec"."priceMonthly" ELSE NULL END, CASE WHEN "pData" ? 'priceAnnual' THEN "vRec"."priceAnnual" ELSE NULL END, CASE WHEN "pData" ? 'userSeats' THEN "vRec"."userSeats" ELSE NULL END, CASE WHEN "pData" ? 'storageGb' THEN "vRec"."storageGb" ELSE NULL END, CASE WHEN "pData" ? 'trialDays' THEN "vRec"."trialDays" ELSE 14 END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END, CASE WHEN "pData" ? 'isPublic' THEN "vRec"."isPublic" ELSE TRUE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'isCustomPrice' THEN "vRec"."isCustomPrice" ELSE FALSE END, CASE WHEN "pData" ? 'supportChannel' THEN "vRec"."supportChannel" ELSE NULL END, CASE WHEN "pData" ? 'supportResponseHours' THEN "vRec"."supportResponseHours" ELSE NULL END, CASE WHEN "pData" ? 'slaUptimePct' THEN "vRec"."slaUptimePct" ELSE NULL END, CASE WHEN "pData" ? 'extraSeatPrice' THEN "vRec"."extraSeatPrice" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."SubscriptionPlans" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           tagline = CASE WHEN "pData" ? 'tagline' THEN "vRec".tagline ELSE t.tagline END,
           "priceMonthly" = CASE WHEN "pData" ? 'priceMonthly' THEN "vRec"."priceMonthly" ELSE t."priceMonthly" END,
           "priceAnnual" = CASE WHEN "pData" ? 'priceAnnual' THEN "vRec"."priceAnnual" ELSE t."priceAnnual" END,
           "userSeats" = CASE WHEN "pData" ? 'userSeats' THEN "vRec"."userSeats" ELSE t."userSeats" END,
           "storageGb" = CASE WHEN "pData" ? 'storageGb' THEN "vRec"."storageGb" ELSE t."storageGb" END,
           "trialDays" = CASE WHEN "pData" ? 'trialDays' THEN "vRec"."trialDays" ELSE t."trialDays" END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END,
           "isPublic" = CASE WHEN "pData" ? 'isPublic' THEN "vRec"."isPublic" ELSE t."isPublic" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "isCustomPrice" = CASE WHEN "pData" ? 'isCustomPrice' THEN "vRec"."isCustomPrice" ELSE t."isCustomPrice" END,
           "supportChannel" = CASE WHEN "pData" ? 'supportChannel' THEN "vRec"."supportChannel" ELSE t."supportChannel" END,
           "supportResponseHours" = CASE WHEN "pData" ? 'supportResponseHours' THEN "vRec"."supportResponseHours" ELSE t."supportResponseHours" END,
           "slaUptimePct" = CASE WHEN "pData" ? 'slaUptimePct' THEN "vRec"."slaUptimePct" ELSE t."slaUptimePct" END,
           "extraSeatPrice" = CASE WHEN "pData" ? 'extraSeatPrice' THEN "vRec"."extraSeatPrice" ELSE t."extraSeatPrice" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."SubscriptionPlans" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'SubscriptionPlans %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SubscriptionPlans % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'features' THEN
    -- features: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."SubscriptionPlanFeatures"
     WHERE "planId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'features') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'features') WITH ORDINALITY t(x, n) LOOP
      "vC1SubscriptionPlanFeatures" := jsonb_populate_record(NULL::"Platform"."SubscriptionPlanFeatures", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."SubscriptionPlanFeatures" t
           SET "moduleKey" = CASE WHEN "vE1" ? 'moduleKey' THEN "vC1SubscriptionPlanFeatures"."moduleKey" ELSE t."moduleKey" END,
               inclusion = CASE WHEN "vE1" ? 'inclusion' THEN "vC1SubscriptionPlanFeatures".inclusion ELSE t.inclusion END,
               "addonPrice" = CASE WHEN "vE1" ? 'addonPrice' THEN "vC1SubscriptionPlanFeatures"."addonPrice" ELSE t."addonPrice" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."planId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SubscriptionPlanFeatures: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."SubscriptionPlanFeatures" ("planId", "moduleKey", inclusion, "addonPrice")
        VALUES ("vRet", CASE WHEN "vE1" ? 'moduleKey' THEN "vC1SubscriptionPlanFeatures"."moduleKey" ELSE NULL END, CASE WHEN "vE1" ? 'inclusion' THEN "vC1SubscriptionPlanFeatures".inclusion ELSE NULL END, CASE WHEN "vE1" ? 'addonPrice' THEN "vC1SubscriptionPlanFeatures"."addonPrice" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'limits' THEN
    -- limits: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."SubscriptionPlanLimits"
     WHERE "planId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'limits') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'limits') WITH ORDINALITY t(x, n) LOOP
      "vC1SubscriptionPlanLimits" := jsonb_populate_record(NULL::"Platform"."SubscriptionPlanLimits", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."SubscriptionPlanLimits" t
           SET "usageMeterId" = CASE WHEN "vE1" ? 'usageMeterId' THEN "vC1SubscriptionPlanLimits"."usageMeterId" ELSE t."usageMeterId" END,
               "limitValue" = CASE WHEN "vE1" ? 'limitValue' THEN "vC1SubscriptionPlanLimits"."limitValue" ELSE t."limitValue" END,
               "overagePrice" = CASE WHEN "vE1" ? 'overagePrice' THEN "vC1SubscriptionPlanLimits"."overagePrice" ELSE t."overagePrice" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."planId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SubscriptionPlanLimits: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."SubscriptionPlanLimits" ("planId", "usageMeterId", "limitValue", "overagePrice")
        VALUES ("vRet", CASE WHEN "vE1" ? 'usageMeterId' THEN "vC1SubscriptionPlanLimits"."usageMeterId" ELSE NULL END, CASE WHEN "vE1" ? 'limitValue' THEN "vC1SubscriptionPlanLimits"."limitValue" ELSE NULL END, CASE WHEN "vE1" ? 'overagePrice' THEN "vC1SubscriptionPlanLimits"."overagePrice" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."subscriptionPlanAddUpdate"(jsonb) IS 'Save (insert or update) one SubscriptionPlans record with its features, limits.';

-- SubscriptionPlans: one record as JSON (camelCase keys), with lookup labels and features, limits
CREATE OR REPLACE FUNCTION "Platform"."getSubscriptionPlanInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('SubscriptionPlanStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('SubscriptionPlanStatus', t.status) ->> 'tone', 'supportChannelLabel', "Lookups"."getLookupLabel"('SupportChannel', t."supportChannel") ->> 'label', 'supportChannelTone', "Lookups"."getLookupLabel"('SupportChannel', t."supportChannel") ->> 'tone') ||
         jsonb_build_object('features', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."SubscriptionPlanFeatures" c1 WHERE c1."planId" = t.id), '[]'::jsonb), 'limits', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."SubscriptionPlanLimits" c1 WHERE c1."planId" = t.id), '[]'::jsonb))
    FROM "Platform"."SubscriptionPlans" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getSubscriptionPlanInfo"(uuid) IS 'Read one SubscriptionPlans record (getter for its screens).';

-- ChartOfAccountsTemplates: insert (no "id") or update (with "id"); child arrays: accounts
CREATE OR REPLACE FUNCTION "Platform"."chartOfAccountsTemplateAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."ChartOfAccountsTemplates";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1ChartOfAccountsTemplateAccounts" "Platform"."ChartOfAccountsTemplateAccounts";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."ChartOfAccountsTemplates", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."ChartOfAccountsTemplates" (code, name, industry, version, status, description, icon)
    VALUES (CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'industry' THEN "vRec".industry ELSE NULL END, CASE WHEN "pData" ? 'version' THEN "vRec".version ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'DRAFT' END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."ChartOfAccountsTemplates" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           industry = CASE WHEN "pData" ? 'industry' THEN "vRec".industry ELSE t.industry END,
           version = CASE WHEN "pData" ? 'version' THEN "vRec".version ELSE t.version END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."ChartOfAccountsTemplates" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'ChartOfAccountsTemplates %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ChartOfAccountsTemplates % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'accounts' THEN
    -- accounts: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."ChartOfAccountsTemplateAccounts"
     WHERE "templateId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'accounts') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'accounts') WITH ORDINALITY t(x, n) LOOP
      "vC1ChartOfAccountsTemplateAccounts" := jsonb_populate_record(NULL::"Platform"."ChartOfAccountsTemplateAccounts", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."ChartOfAccountsTemplateAccounts" t
           SET code = CASE WHEN "vE1" ? 'code' THEN "vC1ChartOfAccountsTemplateAccounts".code ELSE t.code END,
               name = CASE WHEN "vE1" ? 'name' THEN "vC1ChartOfAccountsTemplateAccounts".name ELSE t.name END,
               "parentCode" = CASE WHEN "vE1" ? 'parentCode' THEN "vC1ChartOfAccountsTemplateAccounts"."parentCode" ELSE t."parentCode" END,
               level = CASE WHEN "vE1" ? 'level' THEN "vC1ChartOfAccountsTemplateAccounts".level ELSE t.level END,
               "accountClass" = CASE WHEN "vE1" ? 'accountClass' THEN "vC1ChartOfAccountsTemplateAccounts"."accountClass" ELSE t."accountClass" END,
               nature = CASE WHEN "vE1" ? 'nature' THEN "vC1ChartOfAccountsTemplateAccounts".nature ELSE t.nature END,
               "subType" = CASE WHEN "vE1" ? 'subType' THEN "vC1ChartOfAccountsTemplateAccounts"."subType" ELSE t."subType" END,
               "isPostable" = CASE WHEN "vE1" ? 'isPostable' THEN "vC1ChartOfAccountsTemplateAccounts"."isPostable" ELSE t."isPostable" END,
               "defaultRole" = CASE WHEN "vE1" ? 'defaultRole' THEN "vC1ChartOfAccountsTemplateAccounts"."defaultRole" ELSE t."defaultRole" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."templateId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ChartOfAccountsTemplateAccounts: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."ChartOfAccountsTemplateAccounts" ("templateId", code, name, "parentCode", level, "accountClass", nature, "subType", "isPostable", "defaultRole")
        VALUES ("vRet", CASE WHEN "vE1" ? 'code' THEN "vC1ChartOfAccountsTemplateAccounts".code ELSE NULL END, CASE WHEN "vE1" ? 'name' THEN "vC1ChartOfAccountsTemplateAccounts".name ELSE NULL END, CASE WHEN "vE1" ? 'parentCode' THEN "vC1ChartOfAccountsTemplateAccounts"."parentCode" ELSE NULL END, CASE WHEN "vE1" ? 'level' THEN "vC1ChartOfAccountsTemplateAccounts".level ELSE NULL END, CASE WHEN "vE1" ? 'accountClass' THEN "vC1ChartOfAccountsTemplateAccounts"."accountClass" ELSE NULL END, CASE WHEN "vE1" ? 'nature' THEN "vC1ChartOfAccountsTemplateAccounts".nature ELSE NULL END, CASE WHEN "vE1" ? 'subType' THEN "vC1ChartOfAccountsTemplateAccounts"."subType" ELSE NULL END, CASE WHEN "vE1" ? 'isPostable' THEN "vC1ChartOfAccountsTemplateAccounts"."isPostable" ELSE FALSE END, CASE WHEN "vE1" ? 'defaultRole' THEN "vC1ChartOfAccountsTemplateAccounts"."defaultRole" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."chartOfAccountsTemplateAddUpdate"(jsonb) IS 'Save (insert or update) one ChartOfAccountsTemplates record with its accounts.';

-- ChartOfAccountsTemplates: one record as JSON (camelCase keys), with lookup labels and accounts
CREATE OR REPLACE FUNCTION "Platform"."getChartOfAccountsTemplateInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('ChartOfAccountsTemplateStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ChartOfAccountsTemplateStatus', t.status) ->> 'tone') ||
         jsonb_build_object('accounts', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."ChartOfAccountsTemplateAccounts" c1 WHERE c1."templateId" = t.id), '[]'::jsonb))
    FROM "Platform"."ChartOfAccountsTemplates" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getChartOfAccountsTemplateInfo"(uuid) IS 'Read one ChartOfAccountsTemplates record (getter for its screens).';

-- Tenants: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."tenantAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."Tenants";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
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
END $$;
COMMENT ON FUNCTION "Platform"."tenantAddUpdate"(jsonb) IS 'Save (insert or update) one Tenants record.';

-- Tenants: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getTenantInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('industryLabel', "Lookups"."getLookupLabel"('TenantIndustry', t.industry) ->> 'label', 'industryTone', "Lookups"."getLookupLabel"('TenantIndustry', t.industry) ->> 'tone', 'provinceLabel', "Lookups"."getLookupLabel"('Province', t.province) ->> 'label', 'provinceTone', "Lookups"."getLookupLabel"('Province', t.province) ->> 'tone', 'numberFormatLabel', "Lookups"."getLookupLabel"('NumberFormat', t."numberFormat") ->> 'label', 'numberFormatTone', "Lookups"."getLookupLabel"('NumberFormat', t."numberFormat") ->> 'tone', 'dataResidencyLabel', "Lookups"."getLookupLabel"('DataResidency', t."dataResidency") ->> 'label', 'dataResidencyTone', "Lookups"."getLookupLabel"('DataResidency', t."dataResidency") ->> 'tone', 'defaultLanguageLabel', "Lookups"."getLookupLabel"('DefaultLanguage', t."defaultLanguage") ->> 'label', 'defaultLanguageTone', "Lookups"."getLookupLabel"('DefaultLanguage', t."defaultLanguage") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('TenantStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('TenantStatus', t.status) ->> 'tone', 'churnReasonLabel', "Lookups"."getLookupLabel"('ChurnReason', t."churnReason") ->> 'label', 'churnReasonTone', "Lookups"."getLookupLabel"('ChurnReason', t."churnReason") ->> 'tone')
    FROM "Platform"."Tenants" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getTenantInfo"(uuid) IS 'Read one Tenants record (getter for its screens).';

-- Subscriptions: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."subscriptionAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Platform"."Subscriptions";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."Subscriptions", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."Subscriptions" ("tenantId", "planId", "billingCycle", amount, seats, "startsOn", "trialEndsOn", "currentPeriodStart", "currentPeriodEnd", "nextRenewalOn", "paymentMethod", "paymentRef", "autoRenew", status, "cancelledAt", "cancelReason", "cancelAtPeriodEnd")
    VALUES ("vTenant", CASE WHEN "pData" ? 'planId' THEN "vRec"."planId" ELSE NULL END, CASE WHEN "pData" ? 'billingCycle' THEN "vRec"."billingCycle" ELSE NULL END, CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE NULL END, CASE WHEN "pData" ? 'seats' THEN "vRec".seats ELSE NULL END, CASE WHEN "pData" ? 'startsOn' THEN "vRec"."startsOn" ELSE NULL END, CASE WHEN "pData" ? 'trialEndsOn' THEN "vRec"."trialEndsOn" ELSE NULL END, CASE WHEN "pData" ? 'currentPeriodStart' THEN "vRec"."currentPeriodStart" ELSE NULL END, CASE WHEN "pData" ? 'currentPeriodEnd' THEN "vRec"."currentPeriodEnd" ELSE NULL END, CASE WHEN "pData" ? 'nextRenewalOn' THEN "vRec"."nextRenewalOn" ELSE NULL END, CASE WHEN "pData" ? 'paymentMethod' THEN "vRec"."paymentMethod" ELSE NULL END, CASE WHEN "pData" ? 'paymentRef' THEN "vRec"."paymentRef" ELSE NULL END, CASE WHEN "pData" ? 'autoRenew' THEN "vRec"."autoRenew" ELSE TRUE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'cancelledAt' THEN "vRec"."cancelledAt" ELSE NULL END, CASE WHEN "pData" ? 'cancelReason' THEN "vRec"."cancelReason" ELSE NULL END, CASE WHEN "pData" ? 'cancelAtPeriodEnd' THEN "vRec"."cancelAtPeriodEnd" ELSE FALSE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."Subscriptions" t
       SET "planId" = CASE WHEN "pData" ? 'planId' THEN "vRec"."planId" ELSE t."planId" END,
           "billingCycle" = CASE WHEN "pData" ? 'billingCycle' THEN "vRec"."billingCycle" ELSE t."billingCycle" END,
           amount = CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE t.amount END,
           seats = CASE WHEN "pData" ? 'seats' THEN "vRec".seats ELSE t.seats END,
           "startsOn" = CASE WHEN "pData" ? 'startsOn' THEN "vRec"."startsOn" ELSE t."startsOn" END,
           "trialEndsOn" = CASE WHEN "pData" ? 'trialEndsOn' THEN "vRec"."trialEndsOn" ELSE t."trialEndsOn" END,
           "currentPeriodStart" = CASE WHEN "pData" ? 'currentPeriodStart' THEN "vRec"."currentPeriodStart" ELSE t."currentPeriodStart" END,
           "currentPeriodEnd" = CASE WHEN "pData" ? 'currentPeriodEnd' THEN "vRec"."currentPeriodEnd" ELSE t."currentPeriodEnd" END,
           "nextRenewalOn" = CASE WHEN "pData" ? 'nextRenewalOn' THEN "vRec"."nextRenewalOn" ELSE t."nextRenewalOn" END,
           "paymentMethod" = CASE WHEN "pData" ? 'paymentMethod' THEN "vRec"."paymentMethod" ELSE t."paymentMethod" END,
           "paymentRef" = CASE WHEN "pData" ? 'paymentRef' THEN "vRec"."paymentRef" ELSE t."paymentRef" END,
           "autoRenew" = CASE WHEN "pData" ? 'autoRenew' THEN "vRec"."autoRenew" ELSE t."autoRenew" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "cancelledAt" = CASE WHEN "pData" ? 'cancelledAt' THEN "vRec"."cancelledAt" ELSE t."cancelledAt" END,
           "cancelReason" = CASE WHEN "pData" ? 'cancelReason' THEN "vRec"."cancelReason" ELSE t."cancelReason" END,
           "cancelAtPeriodEnd" = CASE WHEN "pData" ? 'cancelAtPeriodEnd' THEN "vRec"."cancelAtPeriodEnd" ELSE t."cancelAtPeriodEnd" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."Subscriptions" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Subscriptions %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Subscriptions % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."subscriptionAddUpdate"(jsonb) IS 'Save (insert or update) one Subscriptions record.';

-- Subscriptions: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getSubscriptionInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('billingCycleLabel', "Lookups"."getLookupLabel"('BillingCycle', t."billingCycle") ->> 'label', 'billingCycleTone', "Lookups"."getLookupLabel"('BillingCycle', t."billingCycle") ->> 'tone', 'paymentMethodLabel', "Lookups"."getLookupLabel"('DunningCasePaymentMethod', t."paymentMethod") ->> 'label', 'paymentMethodTone', "Lookups"."getLookupLabel"('DunningCasePaymentMethod', t."paymentMethod") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('SubscriptionStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('SubscriptionStatus', t.status) ->> 'tone')
    FROM "Platform"."Subscriptions" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getSubscriptionInfo"(uuid) IS 'Read one Subscriptions record (getter for its screens).';

-- PlatformStaff: insert (no "id") or update (with "id"); child arrays: tenantScopes
CREATE OR REPLACE FUNCTION "Platform"."platformStaffMemberAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."PlatformStaff";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1PlatformStaffTenantScopes" "Platform"."PlatformStaffTenantScopes";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."PlatformStaff", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."PlatformStaff" (email, "fullName", role, "passwordHash", "mfaType", "tenantScope", status, "lastActiveAt", "scopeRegions", "ipRestricted", "mfaRequired", "mfaEnrolledAt", "invitedAt", "removedAt")
    VALUES (CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'fullName' THEN "vRec"."fullName" ELSE NULL END, CASE WHEN "pData" ? 'role' THEN "vRec".role ELSE NULL END, CASE WHEN "pData" ? 'passwordHash' THEN "vRec"."passwordHash" ELSE NULL END, CASE WHEN "pData" ? 'mfaType' THEN "vRec"."mfaType" ELSE NULL END, CASE WHEN "pData" ? 'tenantScope' THEN "vRec"."tenantScope" ELSE 'ALL' END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'INVITED' END, CASE WHEN "pData" ? 'lastActiveAt' THEN "vRec"."lastActiveAt" ELSE NULL END, CASE WHEN "pData" ? 'scopeRegions' THEN "vRec"."scopeRegions" ELSE NULL END, CASE WHEN "pData" ? 'ipRestricted' THEN "vRec"."ipRestricted" ELSE TRUE END, CASE WHEN "pData" ? 'mfaRequired' THEN "vRec"."mfaRequired" ELSE TRUE END, CASE WHEN "pData" ? 'mfaEnrolledAt' THEN "vRec"."mfaEnrolledAt" ELSE NULL END, CASE WHEN "pData" ? 'invitedAt' THEN "vRec"."invitedAt" ELSE NULL END, CASE WHEN "pData" ? 'removedAt' THEN "vRec"."removedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."PlatformStaff" t
       SET email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           "fullName" = CASE WHEN "pData" ? 'fullName' THEN "vRec"."fullName" ELSE t."fullName" END,
           role = CASE WHEN "pData" ? 'role' THEN "vRec".role ELSE t.role END,
           "passwordHash" = CASE WHEN "pData" ? 'passwordHash' THEN "vRec"."passwordHash" ELSE t."passwordHash" END,
           "mfaType" = CASE WHEN "pData" ? 'mfaType' THEN "vRec"."mfaType" ELSE t."mfaType" END,
           "tenantScope" = CASE WHEN "pData" ? 'tenantScope' THEN "vRec"."tenantScope" ELSE t."tenantScope" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "lastActiveAt" = CASE WHEN "pData" ? 'lastActiveAt' THEN "vRec"."lastActiveAt" ELSE t."lastActiveAt" END,
           "scopeRegions" = CASE WHEN "pData" ? 'scopeRegions' THEN "vRec"."scopeRegions" ELSE t."scopeRegions" END,
           "ipRestricted" = CASE WHEN "pData" ? 'ipRestricted' THEN "vRec"."ipRestricted" ELSE t."ipRestricted" END,
           "mfaRequired" = CASE WHEN "pData" ? 'mfaRequired' THEN "vRec"."mfaRequired" ELSE t."mfaRequired" END,
           "mfaEnrolledAt" = CASE WHEN "pData" ? 'mfaEnrolledAt' THEN "vRec"."mfaEnrolledAt" ELSE t."mfaEnrolledAt" END,
           "invitedAt" = CASE WHEN "pData" ? 'invitedAt' THEN "vRec"."invitedAt" ELSE t."invitedAt" END,
           "removedAt" = CASE WHEN "pData" ? 'removedAt' THEN "vRec"."removedAt" ELSE t."removedAt" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."PlatformStaff" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'PlatformStaff %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PlatformStaff % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'tenantScopes' THEN
    -- tenantScopes: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."PlatformStaffTenantScopes"
     WHERE "tenantId" = "vTenant" AND "staffUserId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'tenantScopes') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'tenantScopes') WITH ORDINALITY t(x, n) LOOP
      "vC1PlatformStaffTenantScopes" := jsonb_populate_record(NULL::"Platform"."PlatformStaffTenantScopes", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."PlatformStaffTenantScopes" t
           SET id = t.id
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."staffUserId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PlatformStaffTenantScopes: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."PlatformStaffTenantScopes" ("staffUserId", "tenantId")
        VALUES ("vRet", "vTenant")
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."platformStaffMemberAddUpdate"(jsonb) IS 'Save (insert or update) one PlatformStaff record with its tenantScopes.';

-- PlatformStaff: one record as JSON (camelCase keys), with lookup labels and tenantScopes
CREATE OR REPLACE FUNCTION "Platform"."getPlatformStaffMemberInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t) - 'passwordHash') ||
         jsonb_build_object('roleLabel', "Lookups"."getLookupLabel"('PlatformStaffMemberRole', t.role) ->> 'label', 'roleTone', "Lookups"."getLookupLabel"('PlatformStaffMemberRole', t.role) ->> 'tone', 'mfaTypeLabel', "Lookups"."getLookupLabel"('MfaType', t."mfaType") ->> 'label', 'mfaTypeTone', "Lookups"."getLookupLabel"('MfaType', t."mfaType") ->> 'tone', 'tenantScopeLabel', "Lookups"."getLookupLabel"('TenantScope', t."tenantScope") ->> 'label', 'tenantScopeTone', "Lookups"."getLookupLabel"('TenantScope', t."tenantScope") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('PlatformStaffMemberStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('PlatformStaffMemberStatus', t.status) ->> 'tone') ||
         jsonb_build_object('tenantScopes', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."PlatformStaffTenantScopes" c1 WHERE c1."staffUserId" = t.id), '[]'::jsonb))
    FROM "Platform"."PlatformStaff" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getPlatformStaffMemberInfo"(uuid) IS 'Read one PlatformStaff record (getter for its screens).';

-- PlatformStaffRoles: insert (no "id") or update (with "id"); child arrays: permissions
CREATE OR REPLACE FUNCTION "Platform"."platformStaffRoleAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."PlatformStaffRoles";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1PlatformStaffRolePermissions" "Platform"."PlatformStaffRolePermissions";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."PlatformStaffRoles", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."PlatformStaffRoles" (code, name, description, "isLocked", "sortOrder")
    VALUES (CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'isLocked' THEN "vRec"."isLocked" ELSE FALSE END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."PlatformStaffRoles" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "isLocked" = CASE WHEN "pData" ? 'isLocked' THEN "vRec"."isLocked" ELSE t."isLocked" END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."PlatformStaffRoles" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'PlatformStaffRoles %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PlatformStaffRoles % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'permissions' THEN
    -- permissions: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."PlatformStaffRolePermissions"
     WHERE "staffRoleId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'permissions') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'permissions') WITH ORDINALITY t(x, n) LOOP
      "vC1PlatformStaffRolePermissions" := jsonb_populate_record(NULL::"Platform"."PlatformStaffRolePermissions", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."PlatformStaffRolePermissions" t
           SET "permissionKey" = CASE WHEN "vE1" ? 'permissionKey' THEN "vC1PlatformStaffRolePermissions"."permissionKey" ELSE t."permissionKey" END,
               "permissionGroup" = CASE WHEN "vE1" ? 'permissionGroup' THEN "vC1PlatformStaffRolePermissions"."permissionGroup" ELSE t."permissionGroup" END,
               "isGranted" = CASE WHEN "vE1" ? 'isGranted' THEN "vC1PlatformStaffRolePermissions"."isGranted" ELSE t."isGranted" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."staffRoleId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PlatformStaffRolePermissions: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."PlatformStaffRolePermissions" ("staffRoleId", "permissionKey", "permissionGroup", "isGranted")
        VALUES ("vRet", CASE WHEN "vE1" ? 'permissionKey' THEN "vC1PlatformStaffRolePermissions"."permissionKey" ELSE NULL END, CASE WHEN "vE1" ? 'permissionGroup' THEN "vC1PlatformStaffRolePermissions"."permissionGroup" ELSE NULL END, CASE WHEN "vE1" ? 'isGranted' THEN "vC1PlatformStaffRolePermissions"."isGranted" ELSE FALSE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."platformStaffRoleAddUpdate"(jsonb) IS 'Save (insert or update) one PlatformStaffRoles record with its permissions.';

-- PlatformStaffRoles: one record as JSON (camelCase keys), with lookup labels and permissions
CREATE OR REPLACE FUNCTION "Platform"."getPlatformStaffRoleInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('codeLabel', "Lookups"."getLookupLabel"('PlatformStaffRoleCode', t.code) ->> 'label', 'codeTone', "Lookups"."getLookupLabel"('PlatformStaffRoleCode', t.code) ->> 'tone') ||
         jsonb_build_object('permissions', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."PlatformStaffRolePermissions" c1 WHERE c1."staffRoleId" = t.id), '[]'::jsonb))
    FROM "Platform"."PlatformStaffRoles" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getPlatformStaffRoleInfo"(uuid) IS 'Read one PlatformStaffRoles record (getter for its screens).';

-- PlatformSecuritySettings: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."platformSecuritySettingAddUpdate"("pData" jsonb) RETURNS smallint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."PlatformSecuritySettings";
  "vId" smallint := NULLIF("pData" ->> 'id', '')::smallint;
  "vRet" smallint;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."PlatformSecuritySettings", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."PlatformSecuritySettings" ("ssoProvider", "samlIdpSsoUrl", "samlIdpEntityId", "samlNameIdFormat", "samlCertFilename", "samlCertPem", "samlCertExpiresOn", "samlAcsUrl", "googleDomain", "googleClientId", "googleAllowedGroups", "requireSso", "breakGlassSuperAdmin", "mfaEnforcement", "mfaAllowWebauthn", "mfaAllowTotp", "mfaAllowSms", "ipAllowlistEnforced", "pwMinLength", "pwRequireMixedCase", "pwRequireNumber", "pwRequireSymbol", "pwBlockBreached", "pwBlockReuse", "pwRotationDays", "lockoutAttempts", "lockoutMinutes")
    VALUES (CASE WHEN "pData" ? 'ssoProvider' THEN "vRec"."ssoProvider" ELSE 'SAML' END, CASE WHEN "pData" ? 'samlIdpSsoUrl' THEN "vRec"."samlIdpSsoUrl" ELSE NULL END, CASE WHEN "pData" ? 'samlIdpEntityId' THEN "vRec"."samlIdpEntityId" ELSE NULL END, CASE WHEN "pData" ? 'samlNameIdFormat' THEN "vRec"."samlNameIdFormat" ELSE 'EMAIL' END, CASE WHEN "pData" ? 'samlCertFilename' THEN "vRec"."samlCertFilename" ELSE NULL END, CASE WHEN "pData" ? 'samlCertPem' THEN "vRec"."samlCertPem" ELSE NULL END, CASE WHEN "pData" ? 'samlCertExpiresOn' THEN "vRec"."samlCertExpiresOn" ELSE NULL END, CASE WHEN "pData" ? 'samlAcsUrl' THEN "vRec"."samlAcsUrl" ELSE NULL END, CASE WHEN "pData" ? 'googleDomain' THEN "vRec"."googleDomain" ELSE NULL END, CASE WHEN "pData" ? 'googleClientId' THEN "vRec"."googleClientId" ELSE NULL END, CASE WHEN "pData" ? 'googleAllowedGroups' THEN "vRec"."googleAllowedGroups" ELSE NULL END, CASE WHEN "pData" ? 'requireSso' THEN "vRec"."requireSso" ELSE TRUE END, CASE WHEN "pData" ? 'breakGlassSuperAdmin' THEN "vRec"."breakGlassSuperAdmin" ELSE TRUE END, CASE WHEN "pData" ? 'mfaEnforcement' THEN "vRec"."mfaEnforcement" ELSE 'EVERYONE' END, CASE WHEN "pData" ? 'mfaAllowWebauthn' THEN "vRec"."mfaAllowWebauthn" ELSE TRUE END, CASE WHEN "pData" ? 'mfaAllowTotp' THEN "vRec"."mfaAllowTotp" ELSE TRUE END, CASE WHEN "pData" ? 'mfaAllowSms' THEN "vRec"."mfaAllowSms" ELSE FALSE END, CASE WHEN "pData" ? 'ipAllowlistEnforced' THEN "vRec"."ipAllowlistEnforced" ELSE TRUE END, CASE WHEN "pData" ? 'pwMinLength' THEN "vRec"."pwMinLength" ELSE 12 END, CASE WHEN "pData" ? 'pwRequireMixedCase' THEN "vRec"."pwRequireMixedCase" ELSE TRUE END, CASE WHEN "pData" ? 'pwRequireNumber' THEN "vRec"."pwRequireNumber" ELSE TRUE END, CASE WHEN "pData" ? 'pwRequireSymbol' THEN "vRec"."pwRequireSymbol" ELSE TRUE END, CASE WHEN "pData" ? 'pwBlockBreached' THEN "vRec"."pwBlockBreached" ELSE TRUE END, CASE WHEN "pData" ? 'pwBlockReuse' THEN "vRec"."pwBlockReuse" ELSE FALSE END, CASE WHEN "pData" ? 'pwRotationDays' THEN "vRec"."pwRotationDays" ELSE NULL END, CASE WHEN "pData" ? 'lockoutAttempts' THEN "vRec"."lockoutAttempts" ELSE 5 END, CASE WHEN "pData" ? 'lockoutMinutes' THEN "vRec"."lockoutMinutes" ELSE 15 END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."PlatformSecuritySettings" t
       SET "ssoProvider" = CASE WHEN "pData" ? 'ssoProvider' THEN "vRec"."ssoProvider" ELSE t."ssoProvider" END,
           "samlIdpSsoUrl" = CASE WHEN "pData" ? 'samlIdpSsoUrl' THEN "vRec"."samlIdpSsoUrl" ELSE t."samlIdpSsoUrl" END,
           "samlIdpEntityId" = CASE WHEN "pData" ? 'samlIdpEntityId' THEN "vRec"."samlIdpEntityId" ELSE t."samlIdpEntityId" END,
           "samlNameIdFormat" = CASE WHEN "pData" ? 'samlNameIdFormat' THEN "vRec"."samlNameIdFormat" ELSE t."samlNameIdFormat" END,
           "samlCertFilename" = CASE WHEN "pData" ? 'samlCertFilename' THEN "vRec"."samlCertFilename" ELSE t."samlCertFilename" END,
           "samlCertPem" = CASE WHEN "pData" ? 'samlCertPem' THEN "vRec"."samlCertPem" ELSE t."samlCertPem" END,
           "samlCertExpiresOn" = CASE WHEN "pData" ? 'samlCertExpiresOn' THEN "vRec"."samlCertExpiresOn" ELSE t."samlCertExpiresOn" END,
           "samlAcsUrl" = CASE WHEN "pData" ? 'samlAcsUrl' THEN "vRec"."samlAcsUrl" ELSE t."samlAcsUrl" END,
           "googleDomain" = CASE WHEN "pData" ? 'googleDomain' THEN "vRec"."googleDomain" ELSE t."googleDomain" END,
           "googleClientId" = CASE WHEN "pData" ? 'googleClientId' THEN "vRec"."googleClientId" ELSE t."googleClientId" END,
           "googleAllowedGroups" = CASE WHEN "pData" ? 'googleAllowedGroups' THEN "vRec"."googleAllowedGroups" ELSE t."googleAllowedGroups" END,
           "requireSso" = CASE WHEN "pData" ? 'requireSso' THEN "vRec"."requireSso" ELSE t."requireSso" END,
           "breakGlassSuperAdmin" = CASE WHEN "pData" ? 'breakGlassSuperAdmin' THEN "vRec"."breakGlassSuperAdmin" ELSE t."breakGlassSuperAdmin" END,
           "mfaEnforcement" = CASE WHEN "pData" ? 'mfaEnforcement' THEN "vRec"."mfaEnforcement" ELSE t."mfaEnforcement" END,
           "mfaAllowWebauthn" = CASE WHEN "pData" ? 'mfaAllowWebauthn' THEN "vRec"."mfaAllowWebauthn" ELSE t."mfaAllowWebauthn" END,
           "mfaAllowTotp" = CASE WHEN "pData" ? 'mfaAllowTotp' THEN "vRec"."mfaAllowTotp" ELSE t."mfaAllowTotp" END,
           "mfaAllowSms" = CASE WHEN "pData" ? 'mfaAllowSms' THEN "vRec"."mfaAllowSms" ELSE t."mfaAllowSms" END,
           "ipAllowlistEnforced" = CASE WHEN "pData" ? 'ipAllowlistEnforced' THEN "vRec"."ipAllowlistEnforced" ELSE t."ipAllowlistEnforced" END,
           "pwMinLength" = CASE WHEN "pData" ? 'pwMinLength' THEN "vRec"."pwMinLength" ELSE t."pwMinLength" END,
           "pwRequireMixedCase" = CASE WHEN "pData" ? 'pwRequireMixedCase' THEN "vRec"."pwRequireMixedCase" ELSE t."pwRequireMixedCase" END,
           "pwRequireNumber" = CASE WHEN "pData" ? 'pwRequireNumber' THEN "vRec"."pwRequireNumber" ELSE t."pwRequireNumber" END,
           "pwRequireSymbol" = CASE WHEN "pData" ? 'pwRequireSymbol' THEN "vRec"."pwRequireSymbol" ELSE t."pwRequireSymbol" END,
           "pwBlockBreached" = CASE WHEN "pData" ? 'pwBlockBreached' THEN "vRec"."pwBlockBreached" ELSE t."pwBlockBreached" END,
           "pwBlockReuse" = CASE WHEN "pData" ? 'pwBlockReuse' THEN "vRec"."pwBlockReuse" ELSE t."pwBlockReuse" END,
           "pwRotationDays" = CASE WHEN "pData" ? 'pwRotationDays' THEN "vRec"."pwRotationDays" ELSE t."pwRotationDays" END,
           "lockoutAttempts" = CASE WHEN "pData" ? 'lockoutAttempts' THEN "vRec"."lockoutAttempts" ELSE t."lockoutAttempts" END,
           "lockoutMinutes" = CASE WHEN "pData" ? 'lockoutMinutes' THEN "vRec"."lockoutMinutes" ELSE t."lockoutMinutes" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."PlatformSecuritySettings" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'PlatformSecuritySettings %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PlatformSecuritySettings % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."platformSecuritySettingAddUpdate"(jsonb) IS 'Save (insert or update) one PlatformSecuritySettings record.';

-- PlatformSecuritySettings: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getPlatformSecuritySettingInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('ssoProviderLabel', "Lookups"."getLookupLabel"('PlatformSecuritySettingSsoProvider', t."ssoProvider") ->> 'label', 'ssoProviderTone', "Lookups"."getLookupLabel"('PlatformSecuritySettingSsoProvider', t."ssoProvider") ->> 'tone', 'samlNameIdFormatLabel', "Lookups"."getLookupLabel"('SamlNameIdFormat', t."samlNameIdFormat") ->> 'label', 'samlNameIdFormatTone', "Lookups"."getLookupLabel"('SamlNameIdFormat', t."samlNameIdFormat") ->> 'tone', 'mfaEnforcementLabel', "Lookups"."getLookupLabel"('MfaEnforcement', t."mfaEnforcement") ->> 'label', 'mfaEnforcementTone', "Lookups"."getLookupLabel"('MfaEnforcement', t."mfaEnforcement") ->> 'tone')
    FROM "Platform"."PlatformSecuritySettings" t
   WHERE t.id = 1
$$;
COMMENT ON FUNCTION "Platform"."getPlatformSecuritySettingInfo"(uuid) IS 'Read one PlatformSecuritySettings record (getter for its screens).';

-- PlatformAllowedIps: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."platformAllowedIpAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."PlatformAllowedIps";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."PlatformAllowedIps", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."PlatformAllowedIps" (cidr, label, "isActive")
    VALUES (CASE WHEN "pData" ? 'cidr' THEN "vRec".cidr ELSE NULL END, CASE WHEN "pData" ? 'label' THEN "vRec".label ELSE 'Custom range' END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."PlatformAllowedIps" t
       SET cidr = CASE WHEN "pData" ? 'cidr' THEN "vRec".cidr ELSE t.cidr END,
           label = CASE WHEN "pData" ? 'label' THEN "vRec".label ELSE t.label END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."PlatformAllowedIps" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'PlatformAllowedIps %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PlatformAllowedIps % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."platformAllowedIpAddUpdate"(jsonb) IS 'Save (insert or update) one PlatformAllowedIps record.';

-- PlatformAllowedIps: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getPlatformAllowedIpInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "Platform"."PlatformAllowedIps" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getPlatformAllowedIpInfo"(uuid) IS 'Read one PlatformAllowedIps record (getter for its screens).';

-- AuditAlertRules: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."auditAlertRuleAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."AuditAlertRules";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."AuditAlertRules", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."AuditAlertRules" (name, "actionPattern", "resultFilter", "thresholdCount", "windowMinutes", channels, recipients, "isActive")
    VALUES (CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'actionPattern' THEN "vRec"."actionPattern" ELSE NULL END, CASE WHEN "pData" ? 'resultFilter' THEN "vRec"."resultFilter" ELSE NULL END, CASE WHEN "pData" ? 'thresholdCount' THEN "vRec"."thresholdCount" ELSE 1 END, CASE WHEN "pData" ? 'windowMinutes' THEN "vRec"."windowMinutes" ELSE NULL END, CASE WHEN "pData" ? 'channels' THEN "vRec".channels ELSE NULL END, CASE WHEN "pData" ? 'recipients' THEN "vRec".recipients ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."AuditAlertRules" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "actionPattern" = CASE WHEN "pData" ? 'actionPattern' THEN "vRec"."actionPattern" ELSE t."actionPattern" END,
           "resultFilter" = CASE WHEN "pData" ? 'resultFilter' THEN "vRec"."resultFilter" ELSE t."resultFilter" END,
           "thresholdCount" = CASE WHEN "pData" ? 'thresholdCount' THEN "vRec"."thresholdCount" ELSE t."thresholdCount" END,
           "windowMinutes" = CASE WHEN "pData" ? 'windowMinutes' THEN "vRec"."windowMinutes" ELSE t."windowMinutes" END,
           channels = CASE WHEN "pData" ? 'channels' THEN "vRec".channels ELSE t.channels END,
           recipients = CASE WHEN "pData" ? 'recipients' THEN "vRec".recipients ELSE t.recipients END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."AuditAlertRules" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'AuditAlertRules %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'AuditAlertRules % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."auditAlertRuleAddUpdate"(jsonb) IS 'Save (insert or update) one AuditAlertRules record.';

-- AuditAlertRules: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getAuditAlertRuleInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('resultFilterLabel', "Lookups"."getLookupLabel"('ResultFilter', t."resultFilter") ->> 'label', 'resultFilterTone', "Lookups"."getLookupLabel"('ResultFilter', t."resultFilter") ->> 'tone')
    FROM "Platform"."AuditAlertRules" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getAuditAlertRuleInfo"(uuid) IS 'Read one AuditAlertRules record (getter for its screens).';

-- TaxMasterAuthorities: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."taxMasterAuthorityAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."TaxMasterAuthorities";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."TaxMasterAuthorities", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."TaxMasterAuthorities" (code, name, jurisdiction, "levyScope", "sandboxEndpoint", "productionEndpoint", "activeEnvironment", "apiTokenEnc", "apiTokenLast4", "platformPosId", "timeoutSeconds", "onFailure", "lastTestAt", "lastTestOk", "lastTestMs")
    VALUES (CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'jurisdiction' THEN "vRec".jurisdiction ELSE NULL END, CASE WHEN "pData" ? 'levyScope' THEN "vRec"."levyScope" ELSE NULL END, CASE WHEN "pData" ? 'sandboxEndpoint' THEN "vRec"."sandboxEndpoint" ELSE NULL END, CASE WHEN "pData" ? 'productionEndpoint' THEN "vRec"."productionEndpoint" ELSE NULL END, CASE WHEN "pData" ? 'activeEnvironment' THEN "vRec"."activeEnvironment" ELSE 'SANDBOX' END, CASE WHEN "pData" ? 'apiTokenEnc' THEN "vRec"."apiTokenEnc" ELSE NULL END, CASE WHEN "pData" ? 'apiTokenLast4' THEN "vRec"."apiTokenLast4" ELSE NULL END, CASE WHEN "pData" ? 'platformPosId' THEN "vRec"."platformPosId" ELSE NULL END, CASE WHEN "pData" ? 'timeoutSeconds' THEN "vRec"."timeoutSeconds" ELSE 20 END, CASE WHEN "pData" ? 'onFailure' THEN "vRec"."onFailure" ELSE 'RETRY_5_MIN' END, CASE WHEN "pData" ? 'lastTestAt' THEN "vRec"."lastTestAt" ELSE NULL END, CASE WHEN "pData" ? 'lastTestOk' THEN "vRec"."lastTestOk" ELSE NULL END, CASE WHEN "pData" ? 'lastTestMs' THEN "vRec"."lastTestMs" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."TaxMasterAuthorities" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           jurisdiction = CASE WHEN "pData" ? 'jurisdiction' THEN "vRec".jurisdiction ELSE t.jurisdiction END,
           "levyScope" = CASE WHEN "pData" ? 'levyScope' THEN "vRec"."levyScope" ELSE t."levyScope" END,
           "sandboxEndpoint" = CASE WHEN "pData" ? 'sandboxEndpoint' THEN "vRec"."sandboxEndpoint" ELSE t."sandboxEndpoint" END,
           "productionEndpoint" = CASE WHEN "pData" ? 'productionEndpoint' THEN "vRec"."productionEndpoint" ELSE t."productionEndpoint" END,
           "activeEnvironment" = CASE WHEN "pData" ? 'activeEnvironment' THEN "vRec"."activeEnvironment" ELSE t."activeEnvironment" END,
           "apiTokenEnc" = CASE WHEN "pData" ? 'apiTokenEnc' THEN "vRec"."apiTokenEnc" ELSE t."apiTokenEnc" END,
           "apiTokenLast4" = CASE WHEN "pData" ? 'apiTokenLast4' THEN "vRec"."apiTokenLast4" ELSE t."apiTokenLast4" END,
           "platformPosId" = CASE WHEN "pData" ? 'platformPosId' THEN "vRec"."platformPosId" ELSE t."platformPosId" END,
           "timeoutSeconds" = CASE WHEN "pData" ? 'timeoutSeconds' THEN "vRec"."timeoutSeconds" ELSE t."timeoutSeconds" END,
           "onFailure" = CASE WHEN "pData" ? 'onFailure' THEN "vRec"."onFailure" ELSE t."onFailure" END,
           "lastTestAt" = CASE WHEN "pData" ? 'lastTestAt' THEN "vRec"."lastTestAt" ELSE t."lastTestAt" END,
           "lastTestOk" = CASE WHEN "pData" ? 'lastTestOk' THEN "vRec"."lastTestOk" ELSE t."lastTestOk" END,
           "lastTestMs" = CASE WHEN "pData" ? 'lastTestMs' THEN "vRec"."lastTestMs" ELSE t."lastTestMs" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."TaxMasterAuthorities" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'TaxMasterAuthorities %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'TaxMasterAuthorities % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."taxMasterAuthorityAddUpdate"(jsonb) IS 'Save (insert or update) one TaxMasterAuthorities record.';

-- TaxMasterAuthorities: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getTaxMasterAuthorityInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t) - 'apiTokenEnc') ||
         jsonb_build_object('codeLabel', "Lookups"."getLookupLabel"('TaxMasterAuthorityCode', t.code) ->> 'label', 'codeTone', "Lookups"."getLookupLabel"('TaxMasterAuthorityCode', t.code) ->> 'tone', 'jurisdictionLabel', "Lookups"."getLookupLabel"('Jurisdiction', t.jurisdiction) ->> 'label', 'jurisdictionTone', "Lookups"."getLookupLabel"('Jurisdiction', t.jurisdiction) ->> 'tone', 'levyScopeLabel', "Lookups"."getLookupLabel"('LevyScope', t."levyScope") ->> 'label', 'levyScopeTone', "Lookups"."getLookupLabel"('LevyScope', t."levyScope") ->> 'tone', 'activeEnvironmentLabel', "Lookups"."getLookupLabel"('ActiveEnvironment', t."activeEnvironment") ->> 'label', 'activeEnvironmentTone', "Lookups"."getLookupLabel"('ActiveEnvironment', t."activeEnvironment") ->> 'tone', 'onFailureLabel', "Lookups"."getLookupLabel"('OnFailure', t."onFailure") ->> 'label', 'onFailureTone', "Lookups"."getLookupLabel"('OnFailure', t."onFailure") ->> 'tone')
    FROM "Platform"."TaxMasterAuthorities" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getTaxMasterAuthorityInfo"(uuid) IS 'Read one TaxMasterAuthorities record (getter for its screens).';

-- TaxMasterSalesTaxRates: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."taxMasterSalesTaxRateAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."TaxMasterSalesTaxRates";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."TaxMasterSalesTaxRates", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."TaxMasterSalesTaxRates" ("taxAuthorityId", "appliesTo", rate, "reducedRatesNote", "effectiveFrom", "effectiveTo", "legalReference", status, "masterVersion", "publishedAt")
    VALUES (CASE WHEN "pData" ? 'taxAuthorityId' THEN "vRec"."taxAuthorityId" ELSE NULL END, CASE WHEN "pData" ? 'appliesTo' THEN "vRec"."appliesTo" ELSE NULL END, CASE WHEN "pData" ? 'rate' THEN "vRec".rate ELSE NULL END, CASE WHEN "pData" ? 'reducedRatesNote' THEN "vRec"."reducedRatesNote" ELSE NULL END, CASE WHEN "pData" ? 'effectiveFrom' THEN "vRec"."effectiveFrom" ELSE NULL END, CASE WHEN "pData" ? 'effectiveTo' THEN "vRec"."effectiveTo" ELSE NULL END, CASE WHEN "pData" ? 'legalReference' THEN "vRec"."legalReference" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'masterVersion' THEN "vRec"."masterVersion" ELSE NULL END, CASE WHEN "pData" ? 'publishedAt' THEN "vRec"."publishedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."TaxMasterSalesTaxRates" t
       SET "taxAuthorityId" = CASE WHEN "pData" ? 'taxAuthorityId' THEN "vRec"."taxAuthorityId" ELSE t."taxAuthorityId" END,
           "appliesTo" = CASE WHEN "pData" ? 'appliesTo' THEN "vRec"."appliesTo" ELSE t."appliesTo" END,
           rate = CASE WHEN "pData" ? 'rate' THEN "vRec".rate ELSE t.rate END,
           "reducedRatesNote" = CASE WHEN "pData" ? 'reducedRatesNote' THEN "vRec"."reducedRatesNote" ELSE t."reducedRatesNote" END,
           "effectiveFrom" = CASE WHEN "pData" ? 'effectiveFrom' THEN "vRec"."effectiveFrom" ELSE t."effectiveFrom" END,
           "effectiveTo" = CASE WHEN "pData" ? 'effectiveTo' THEN "vRec"."effectiveTo" ELSE t."effectiveTo" END,
           "legalReference" = CASE WHEN "pData" ? 'legalReference' THEN "vRec"."legalReference" ELSE t."legalReference" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "masterVersion" = CASE WHEN "pData" ? 'masterVersion' THEN "vRec"."masterVersion" ELSE t."masterVersion" END,
           "publishedAt" = CASE WHEN "pData" ? 'publishedAt' THEN "vRec"."publishedAt" ELSE t."publishedAt" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."TaxMasterSalesTaxRates" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'TaxMasterSalesTaxRates %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'TaxMasterSalesTaxRates % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."taxMasterSalesTaxRateAddUpdate"(jsonb) IS 'Save (insert or update) one TaxMasterSalesTaxRates record.';

-- TaxMasterSalesTaxRates: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getTaxMasterSalesTaxRateInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('TaxMasterSalesTaxRateStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('TaxMasterSalesTaxRateStatus', t.status) ->> 'tone')
    FROM "Platform"."TaxMasterSalesTaxRates" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getTaxMasterSalesTaxRateInfo"(uuid) IS 'Read one TaxMasterSalesTaxRates record (getter for its screens).';

-- TaxMasterWithholdingRates: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."taxMasterWithholdingRateAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."TaxMasterWithholdingRates";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."TaxMasterWithholdingRates", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."TaxMasterWithholdingRates" ("sectionCode", nature, "atlRateCompany", "atlRateOther", "nonAtlRateCompany", "nonAtlRateOther", "rateNote", "thresholdAmount", "thresholdNote", "usesSalarySlabs", "effectiveFrom", "effectiveTo", "legalReference", status, "masterVersion", "publishedAt")
    VALUES (CASE WHEN "pData" ? 'sectionCode' THEN "vRec"."sectionCode" ELSE NULL END, CASE WHEN "pData" ? 'nature' THEN "vRec".nature ELSE NULL END, CASE WHEN "pData" ? 'atlRateCompany' THEN "vRec"."atlRateCompany" ELSE NULL END, CASE WHEN "pData" ? 'atlRateOther' THEN "vRec"."atlRateOther" ELSE NULL END, CASE WHEN "pData" ? 'nonAtlRateCompany' THEN "vRec"."nonAtlRateCompany" ELSE NULL END, CASE WHEN "pData" ? 'nonAtlRateOther' THEN "vRec"."nonAtlRateOther" ELSE NULL END, CASE WHEN "pData" ? 'rateNote' THEN "vRec"."rateNote" ELSE NULL END, CASE WHEN "pData" ? 'thresholdAmount' THEN "vRec"."thresholdAmount" ELSE NULL END, CASE WHEN "pData" ? 'thresholdNote' THEN "vRec"."thresholdNote" ELSE NULL END, CASE WHEN "pData" ? 'usesSalarySlabs' THEN "vRec"."usesSalarySlabs" ELSE FALSE END, CASE WHEN "pData" ? 'effectiveFrom' THEN "vRec"."effectiveFrom" ELSE NULL END, CASE WHEN "pData" ? 'effectiveTo' THEN "vRec"."effectiveTo" ELSE NULL END, CASE WHEN "pData" ? 'legalReference' THEN "vRec"."legalReference" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'masterVersion' THEN "vRec"."masterVersion" ELSE NULL END, CASE WHEN "pData" ? 'publishedAt' THEN "vRec"."publishedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."TaxMasterWithholdingRates" t
       SET "sectionCode" = CASE WHEN "pData" ? 'sectionCode' THEN "vRec"."sectionCode" ELSE t."sectionCode" END,
           nature = CASE WHEN "pData" ? 'nature' THEN "vRec".nature ELSE t.nature END,
           "atlRateCompany" = CASE WHEN "pData" ? 'atlRateCompany' THEN "vRec"."atlRateCompany" ELSE t."atlRateCompany" END,
           "atlRateOther" = CASE WHEN "pData" ? 'atlRateOther' THEN "vRec"."atlRateOther" ELSE t."atlRateOther" END,
           "nonAtlRateCompany" = CASE WHEN "pData" ? 'nonAtlRateCompany' THEN "vRec"."nonAtlRateCompany" ELSE t."nonAtlRateCompany" END,
           "nonAtlRateOther" = CASE WHEN "pData" ? 'nonAtlRateOther' THEN "vRec"."nonAtlRateOther" ELSE t."nonAtlRateOther" END,
           "rateNote" = CASE WHEN "pData" ? 'rateNote' THEN "vRec"."rateNote" ELSE t."rateNote" END,
           "thresholdAmount" = CASE WHEN "pData" ? 'thresholdAmount' THEN "vRec"."thresholdAmount" ELSE t."thresholdAmount" END,
           "thresholdNote" = CASE WHEN "pData" ? 'thresholdNote' THEN "vRec"."thresholdNote" ELSE t."thresholdNote" END,
           "usesSalarySlabs" = CASE WHEN "pData" ? 'usesSalarySlabs' THEN "vRec"."usesSalarySlabs" ELSE t."usesSalarySlabs" END,
           "effectiveFrom" = CASE WHEN "pData" ? 'effectiveFrom' THEN "vRec"."effectiveFrom" ELSE t."effectiveFrom" END,
           "effectiveTo" = CASE WHEN "pData" ? 'effectiveTo' THEN "vRec"."effectiveTo" ELSE t."effectiveTo" END,
           "legalReference" = CASE WHEN "pData" ? 'legalReference' THEN "vRec"."legalReference" ELSE t."legalReference" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "masterVersion" = CASE WHEN "pData" ? 'masterVersion' THEN "vRec"."masterVersion" ELSE t."masterVersion" END,
           "publishedAt" = CASE WHEN "pData" ? 'publishedAt' THEN "vRec"."publishedAt" ELSE t."publishedAt" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."TaxMasterWithholdingRates" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'TaxMasterWithholdingRates %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'TaxMasterWithholdingRates % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."taxMasterWithholdingRateAddUpdate"(jsonb) IS 'Save (insert or update) one TaxMasterWithholdingRates record.';

-- TaxMasterWithholdingRates: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getTaxMasterWithholdingRateInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('TaxMasterSalesTaxRateStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('TaxMasterSalesTaxRateStatus', t.status) ->> 'tone')
    FROM "Platform"."TaxMasterWithholdingRates" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getTaxMasterWithholdingRateInfo"(uuid) IS 'Read one TaxMasterWithholdingRates record (getter for its screens).';

-- TaxMasterSalarySlabs: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."taxMasterSalarySlabAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."TaxMasterSalarySlabs";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."TaxMasterSalarySlabs", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."TaxMasterSalarySlabs" ("taxYear", "slabNo", "incomeFrom", "incomeTo", "fixedTax", "ratePct", "excessOver", "legalReference")
    VALUES (CASE WHEN "pData" ? 'taxYear' THEN "vRec"."taxYear" ELSE NULL END, CASE WHEN "pData" ? 'slabNo' THEN "vRec"."slabNo" ELSE NULL END, CASE WHEN "pData" ? 'incomeFrom' THEN "vRec"."incomeFrom" ELSE NULL END, CASE WHEN "pData" ? 'incomeTo' THEN "vRec"."incomeTo" ELSE NULL END, CASE WHEN "pData" ? 'fixedTax' THEN "vRec"."fixedTax" ELSE 0 END, CASE WHEN "pData" ? 'ratePct' THEN "vRec"."ratePct" ELSE 0 END, CASE WHEN "pData" ? 'excessOver' THEN "vRec"."excessOver" ELSE 0 END, CASE WHEN "pData" ? 'legalReference' THEN "vRec"."legalReference" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."TaxMasterSalarySlabs" t
       SET "taxYear" = CASE WHEN "pData" ? 'taxYear' THEN "vRec"."taxYear" ELSE t."taxYear" END,
           "slabNo" = CASE WHEN "pData" ? 'slabNo' THEN "vRec"."slabNo" ELSE t."slabNo" END,
           "incomeFrom" = CASE WHEN "pData" ? 'incomeFrom' THEN "vRec"."incomeFrom" ELSE t."incomeFrom" END,
           "incomeTo" = CASE WHEN "pData" ? 'incomeTo' THEN "vRec"."incomeTo" ELSE t."incomeTo" END,
           "fixedTax" = CASE WHEN "pData" ? 'fixedTax' THEN "vRec"."fixedTax" ELSE t."fixedTax" END,
           "ratePct" = CASE WHEN "pData" ? 'ratePct' THEN "vRec"."ratePct" ELSE t."ratePct" END,
           "excessOver" = CASE WHEN "pData" ? 'excessOver' THEN "vRec"."excessOver" ELSE t."excessOver" END,
           "legalReference" = CASE WHEN "pData" ? 'legalReference' THEN "vRec"."legalReference" ELSE t."legalReference" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."TaxMasterSalarySlabs" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'TaxMasterSalarySlabs %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'TaxMasterSalarySlabs % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."taxMasterSalarySlabAddUpdate"(jsonb) IS 'Save (insert or update) one TaxMasterSalarySlabs record.';

-- TaxMasterSalarySlabs: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getTaxMasterSalarySlabInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "Platform"."TaxMasterSalarySlabs" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getTaxMasterSalarySlabInfo"(uuid) IS 'Read one TaxMasterSalarySlabs record (getter for its screens).';

-- TemplateTaxCodes: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."templateTaxCodeAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."TemplateTaxCodes";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."TemplateTaxCodes", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."TemplateTaxCodes" ("seedVersion", code, description, "taxKind", rate, "rateNote", "whtSection", "sortOrder", "isActive")
    VALUES (CASE WHEN "pData" ? 'seedVersion' THEN "vRec"."seedVersion" ELSE NULL END, CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'taxKind' THEN "vRec"."taxKind" ELSE NULL END, CASE WHEN "pData" ? 'rate' THEN "vRec".rate ELSE NULL END, CASE WHEN "pData" ? 'rateNote' THEN "vRec"."rateNote" ELSE NULL END, CASE WHEN "pData" ? 'whtSection' THEN "vRec"."whtSection" ELSE NULL END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."TemplateTaxCodes" t
       SET "seedVersion" = CASE WHEN "pData" ? 'seedVersion' THEN "vRec"."seedVersion" ELSE t."seedVersion" END,
           code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "taxKind" = CASE WHEN "pData" ? 'taxKind' THEN "vRec"."taxKind" ELSE t."taxKind" END,
           rate = CASE WHEN "pData" ? 'rate' THEN "vRec".rate ELSE t.rate END,
           "rateNote" = CASE WHEN "pData" ? 'rateNote' THEN "vRec"."rateNote" ELSE t."rateNote" END,
           "whtSection" = CASE WHEN "pData" ? 'whtSection' THEN "vRec"."whtSection" ELSE t."whtSection" END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."TemplateTaxCodes" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'TemplateTaxCodes %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'TemplateTaxCodes % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."templateTaxCodeAddUpdate"(jsonb) IS 'Save (insert or update) one TemplateTaxCodes record.';

-- TemplateTaxCodes: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getTemplateTaxCodeInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('taxKindLabel', "Lookups"."getLookupLabel"('TaxKind', t."taxKind") ->> 'label', 'taxKindTone', "Lookups"."getLookupLabel"('TaxKind', t."taxKind") ->> 'tone')
    FROM "Platform"."TemplateTaxCodes" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getTemplateTaxCodeInfo"(uuid) IS 'Read one TemplateTaxCodes record (getter for its screens).';

-- TemplateLeaveTypes: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."templateLeaveTypeAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."TemplateLeaveTypes";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."TemplateLeaveTypes", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."TemplateLeaveTypes" ("seedVersion", name, "daysPerYear", "accrualPerMonth", "carryForwardMax", "isPaid", "genderRestriction", "onceInService", "medicalCertAfterDays", "ruleNote", "sortOrder")
    VALUES (CASE WHEN "pData" ? 'seedVersion' THEN "vRec"."seedVersion" ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'daysPerYear' THEN "vRec"."daysPerYear" ELSE NULL END, CASE WHEN "pData" ? 'accrualPerMonth' THEN "vRec"."accrualPerMonth" ELSE NULL END, CASE WHEN "pData" ? 'carryForwardMax' THEN "vRec"."carryForwardMax" ELSE NULL END, CASE WHEN "pData" ? 'isPaid' THEN "vRec"."isPaid" ELSE TRUE END, CASE WHEN "pData" ? 'genderRestriction' THEN "vRec"."genderRestriction" ELSE 'ANY' END, CASE WHEN "pData" ? 'onceInService' THEN "vRec"."onceInService" ELSE FALSE END, CASE WHEN "pData" ? 'medicalCertAfterDays' THEN "vRec"."medicalCertAfterDays" ELSE NULL END, CASE WHEN "pData" ? 'ruleNote' THEN "vRec"."ruleNote" ELSE NULL END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."TemplateLeaveTypes" t
       SET "seedVersion" = CASE WHEN "pData" ? 'seedVersion' THEN "vRec"."seedVersion" ELSE t."seedVersion" END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "daysPerYear" = CASE WHEN "pData" ? 'daysPerYear' THEN "vRec"."daysPerYear" ELSE t."daysPerYear" END,
           "accrualPerMonth" = CASE WHEN "pData" ? 'accrualPerMonth' THEN "vRec"."accrualPerMonth" ELSE t."accrualPerMonth" END,
           "carryForwardMax" = CASE WHEN "pData" ? 'carryForwardMax' THEN "vRec"."carryForwardMax" ELSE t."carryForwardMax" END,
           "isPaid" = CASE WHEN "pData" ? 'isPaid' THEN "vRec"."isPaid" ELSE t."isPaid" END,
           "genderRestriction" = CASE WHEN "pData" ? 'genderRestriction' THEN "vRec"."genderRestriction" ELSE t."genderRestriction" END,
           "onceInService" = CASE WHEN "pData" ? 'onceInService' THEN "vRec"."onceInService" ELSE t."onceInService" END,
           "medicalCertAfterDays" = CASE WHEN "pData" ? 'medicalCertAfterDays' THEN "vRec"."medicalCertAfterDays" ELSE t."medicalCertAfterDays" END,
           "ruleNote" = CASE WHEN "pData" ? 'ruleNote' THEN "vRec"."ruleNote" ELSE t."ruleNote" END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."TemplateLeaveTypes" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'TemplateLeaveTypes %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'TemplateLeaveTypes % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."templateLeaveTypeAddUpdate"(jsonb) IS 'Save (insert or update) one TemplateLeaveTypes record.';

-- TemplateLeaveTypes: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getTemplateLeaveTypeInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('genderRestrictionLabel', "Lookups"."getLookupLabel"('GenderRestriction', t."genderRestriction") ->> 'label', 'genderRestrictionTone', "Lookups"."getLookupLabel"('GenderRestriction', t."genderRestriction") ->> 'tone')
    FROM "Platform"."TemplateLeaveTypes" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getTemplateLeaveTypeInfo"(uuid) IS 'Read one TemplateLeaveTypes record (getter for its screens).';

-- TemplateSalaryComponents: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."templateSalaryComponentAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."TemplateSalaryComponents";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."TemplateSalaryComponents", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."TemplateSalaryComponents" ("seedVersion", name, "componentKind", "calcMethod", "pctOfBasic", "isTaxable", "statutoryCode", "ruleNote", "sortOrder")
    VALUES (CASE WHEN "pData" ? 'seedVersion' THEN "vRec"."seedVersion" ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'componentKind' THEN "vRec"."componentKind" ELSE NULL END, CASE WHEN "pData" ? 'calcMethod' THEN "vRec"."calcMethod" ELSE NULL END, CASE WHEN "pData" ? 'pctOfBasic' THEN "vRec"."pctOfBasic" ELSE NULL END, CASE WHEN "pData" ? 'isTaxable' THEN "vRec"."isTaxable" ELSE TRUE END, CASE WHEN "pData" ? 'statutoryCode' THEN "vRec"."statutoryCode" ELSE NULL END, CASE WHEN "pData" ? 'ruleNote' THEN "vRec"."ruleNote" ELSE NULL END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."TemplateSalaryComponents" t
       SET "seedVersion" = CASE WHEN "pData" ? 'seedVersion' THEN "vRec"."seedVersion" ELSE t."seedVersion" END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "componentKind" = CASE WHEN "pData" ? 'componentKind' THEN "vRec"."componentKind" ELSE t."componentKind" END,
           "calcMethod" = CASE WHEN "pData" ? 'calcMethod' THEN "vRec"."calcMethod" ELSE t."calcMethod" END,
           "pctOfBasic" = CASE WHEN "pData" ? 'pctOfBasic' THEN "vRec"."pctOfBasic" ELSE t."pctOfBasic" END,
           "isTaxable" = CASE WHEN "pData" ? 'isTaxable' THEN "vRec"."isTaxable" ELSE t."isTaxable" END,
           "statutoryCode" = CASE WHEN "pData" ? 'statutoryCode' THEN "vRec"."statutoryCode" ELSE t."statutoryCode" END,
           "ruleNote" = CASE WHEN "pData" ? 'ruleNote' THEN "vRec"."ruleNote" ELSE t."ruleNote" END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."TemplateSalaryComponents" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'TemplateSalaryComponents %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'TemplateSalaryComponents % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."templateSalaryComponentAddUpdate"(jsonb) IS 'Save (insert or update) one TemplateSalaryComponents record.';

-- TemplateSalaryComponents: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getTemplateSalaryComponentInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('componentKindLabel', "Lookups"."getLookupLabel"('TemplateSalaryComponentKind', t."componentKind") ->> 'label', 'componentKindTone', "Lookups"."getLookupLabel"('TemplateSalaryComponentKind', t."componentKind") ->> 'tone', 'calcMethodLabel', "Lookups"."getLookupLabel"('TemplateSalaryComponentCalcMethod', t."calcMethod") ->> 'label', 'calcMethodTone', "Lookups"."getLookupLabel"('TemplateSalaryComponentCalcMethod', t."calcMethod") ->> 'tone', 'statutoryCodeLabel', "Lookups"."getLookupLabel"('StatutoryCode', t."statutoryCode") ->> 'label', 'statutoryCodeTone', "Lookups"."getLookupLabel"('StatutoryCode', t."statutoryCode") ->> 'tone')
    FROM "Platform"."TemplateSalaryComponents" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getTemplateSalaryComponentInfo"(uuid) IS 'Read one TemplateSalaryComponents record (getter for its screens).';

-- UsageMeters: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."usageMeterAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."UsageMeters";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."UsageMeters", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."UsageMeters" (code, name, unit, icon, "resetPeriod", "sortOrder", "isActive")
    VALUES (CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'unit' THEN "vRec".unit ELSE NULL END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE NULL END, CASE WHEN "pData" ? 'resetPeriod' THEN "vRec"."resetPeriod" ELSE NULL END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."UsageMeters" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           unit = CASE WHEN "pData" ? 'unit' THEN "vRec".unit ELSE t.unit END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END,
           "resetPeriod" = CASE WHEN "pData" ? 'resetPeriod' THEN "vRec"."resetPeriod" ELSE t."resetPeriod" END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."UsageMeters" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'UsageMeters %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'UsageMeters % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."usageMeterAddUpdate"(jsonb) IS 'Save (insert or update) one UsageMeters record.';

-- UsageMeters: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getUsageMeterInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('codeLabel', "Lookups"."getLookupLabel"('UsageMeterCode', t.code) ->> 'label', 'codeTone', "Lookups"."getLookupLabel"('UsageMeterCode', t.code) ->> 'tone', 'resetPeriodLabel', "Lookups"."getLookupLabel"('ResetPeriod', t."resetPeriod") ->> 'label', 'resetPeriodTone', "Lookups"."getLookupLabel"('ResetPeriod', t."resetPeriod") ->> 'tone')
    FROM "Platform"."UsageMeters" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getUsageMeterInfo"(uuid) IS 'Read one UsageMeters record (getter for its screens).';

-- PlatformModules: insert (no "id") or update (with "id"); child arrays: plans
CREATE OR REPLACE FUNCTION "Platform"."platformModuleAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."PlatformModules";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1PlatformModulePlans" "Platform"."PlatformModulePlans";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."PlatformModules", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."PlatformModules" (key, name, icon, kind, "entGroup", "moduleKey", "featureFlagId", "minPlanId", "isCore", "isEnabled", "sortOrder")
    VALUES (CASE WHEN "pData" ? 'key' THEN "vRec".key ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE NULL END, CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE NULL END, CASE WHEN "pData" ? 'entGroup' THEN "vRec"."entGroup" ELSE NULL END, CASE WHEN "pData" ? 'moduleKey' THEN "vRec"."moduleKey" ELSE NULL END, CASE WHEN "pData" ? 'featureFlagId' THEN "vRec"."featureFlagId" ELSE NULL END, CASE WHEN "pData" ? 'minPlanId' THEN "vRec"."minPlanId" ELSE NULL END, CASE WHEN "pData" ? 'isCore' THEN "vRec"."isCore" ELSE FALSE END, CASE WHEN "pData" ? 'isEnabled' THEN "vRec"."isEnabled" ELSE TRUE END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."PlatformModules" t
       SET key = CASE WHEN "pData" ? 'key' THEN "vRec".key ELSE t.key END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END,
           kind = CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE t.kind END,
           "entGroup" = CASE WHEN "pData" ? 'entGroup' THEN "vRec"."entGroup" ELSE t."entGroup" END,
           "moduleKey" = CASE WHEN "pData" ? 'moduleKey' THEN "vRec"."moduleKey" ELSE t."moduleKey" END,
           "featureFlagId" = CASE WHEN "pData" ? 'featureFlagId' THEN "vRec"."featureFlagId" ELSE t."featureFlagId" END,
           "minPlanId" = CASE WHEN "pData" ? 'minPlanId' THEN "vRec"."minPlanId" ELSE t."minPlanId" END,
           "isCore" = CASE WHEN "pData" ? 'isCore' THEN "vRec"."isCore" ELSE t."isCore" END,
           "isEnabled" = CASE WHEN "pData" ? 'isEnabled' THEN "vRec"."isEnabled" ELSE t."isEnabled" END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."PlatformModules" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'PlatformModules %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PlatformModules % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'plans' THEN
    -- plans: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."PlatformModulePlans"
     WHERE "platformModuleId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'plans') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'plans') WITH ORDINALITY t(x, n) LOOP
      "vC1PlatformModulePlans" := jsonb_populate_record(NULL::"Platform"."PlatformModulePlans", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."PlatformModulePlans" t
           SET "planId" = CASE WHEN "vE1" ? 'planId' THEN "vC1PlatformModulePlans"."planId" ELSE t."planId" END,
               "isIncluded" = CASE WHEN "vE1" ? 'isIncluded' THEN "vC1PlatformModulePlans"."isIncluded" ELSE t."isIncluded" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."platformModuleId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PlatformModulePlans: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."PlatformModulePlans" ("platformModuleId", "planId", "isIncluded")
        VALUES ("vRet", CASE WHEN "vE1" ? 'planId' THEN "vC1PlatformModulePlans"."planId" ELSE NULL END, CASE WHEN "vE1" ? 'isIncluded' THEN "vC1PlatformModulePlans"."isIncluded" ELSE FALSE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."platformModuleAddUpdate"(jsonb) IS 'Save (insert or update) one PlatformModules record with its plans.';

-- PlatformModules: one record as JSON (camelCase keys), with lookup labels and plans
CREATE OR REPLACE FUNCTION "Platform"."getPlatformModuleInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('kindLabel', "Lookups"."getLookupLabel"('PlatformModuleKind', t.kind) ->> 'label', 'kindTone', "Lookups"."getLookupLabel"('PlatformModuleKind', t.kind) ->> 'tone', 'entGroupLabel', "Lookups"."getLookupLabel"('EntGroup', t."entGroup") ->> 'label', 'entGroupTone', "Lookups"."getLookupLabel"('EntGroup', t."entGroup") ->> 'tone', 'moduleKeyLabel', "Lookups"."getLookupLabel"('ModuleKey', t."moduleKey") ->> 'label', 'moduleKeyTone', "Lookups"."getLookupLabel"('ModuleKey', t."moduleKey") ->> 'tone') ||
         jsonb_build_object('plans', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."PlatformModulePlans" c1 WHERE c1."platformModuleId" = t.id), '[]'::jsonb))
    FROM "Platform"."PlatformModules" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getPlatformModuleInfo"(uuid) IS 'Read one PlatformModules record (getter for its screens).';

-- Addons: insert (no "id") or update (with "id"); child arrays: plans
CREATE OR REPLACE FUNCTION "Platform"."addonAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."Addons";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1AddonPlans" "Platform"."AddonPlans";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."Addons", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."Addons" (code, name, icon, price, "billingUnit", "usagePrice", "usageUnit", note, "platformModuleId", "isActive")
    VALUES (CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE NULL END, CASE WHEN "pData" ? 'price' THEN "vRec".price ELSE NULL END, CASE WHEN "pData" ? 'billingUnit' THEN "vRec"."billingUnit" ELSE NULL END, CASE WHEN "pData" ? 'usagePrice' THEN "vRec"."usagePrice" ELSE NULL END, CASE WHEN "pData" ? 'usageUnit' THEN "vRec"."usageUnit" ELSE NULL END, CASE WHEN "pData" ? 'note' THEN "vRec".note ELSE NULL END, CASE WHEN "pData" ? 'platformModuleId' THEN "vRec"."platformModuleId" ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."Addons" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END,
           price = CASE WHEN "pData" ? 'price' THEN "vRec".price ELSE t.price END,
           "billingUnit" = CASE WHEN "pData" ? 'billingUnit' THEN "vRec"."billingUnit" ELSE t."billingUnit" END,
           "usagePrice" = CASE WHEN "pData" ? 'usagePrice' THEN "vRec"."usagePrice" ELSE t."usagePrice" END,
           "usageUnit" = CASE WHEN "pData" ? 'usageUnit' THEN "vRec"."usageUnit" ELSE t."usageUnit" END,
           note = CASE WHEN "pData" ? 'note' THEN "vRec".note ELSE t.note END,
           "platformModuleId" = CASE WHEN "pData" ? 'platformModuleId' THEN "vRec"."platformModuleId" ELSE t."platformModuleId" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."Addons" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'Addons %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Addons % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'plans' THEN
    -- plans: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."AddonPlans"
     WHERE "addonId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'plans') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'plans') WITH ORDINALITY t(x, n) LOOP
      "vC1AddonPlans" := jsonb_populate_record(NULL::"Platform"."AddonPlans", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."AddonPlans" t
           SET "planId" = CASE WHEN "vE1" ? 'planId' THEN "vC1AddonPlans"."planId" ELSE t."planId" END,
               availability = CASE WHEN "vE1" ? 'availability' THEN "vC1AddonPlans".availability ELSE t.availability END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."addonId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'AddonPlans: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."AddonPlans" ("addonId", "planId", availability)
        VALUES ("vRet", CASE WHEN "vE1" ? 'planId' THEN "vC1AddonPlans"."planId" ELSE NULL END, CASE WHEN "vE1" ? 'availability' THEN "vC1AddonPlans".availability ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."addonAddUpdate"(jsonb) IS 'Save (insert or update) one Addons record with its plans.';

-- Addons: one record as JSON (camelCase keys), with lookup labels and plans
CREATE OR REPLACE FUNCTION "Platform"."getAddonInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('billingUnitLabel', "Lookups"."getLookupLabel"('BillingUnit', t."billingUnit") ->> 'label', 'billingUnitTone', "Lookups"."getLookupLabel"('BillingUnit', t."billingUnit") ->> 'tone') ||
         jsonb_build_object('plans', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."AddonPlans" c1 WHERE c1."addonId" = t.id), '[]'::jsonb))
    FROM "Platform"."Addons" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getAddonInfo"(uuid) IS 'Read one Addons record (getter for its screens).';

-- Resellers: insert (no "id") or update (with "id"); child arrays: tenants
CREATE OR REPLACE FUNCTION "Platform"."resellerAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."Resellers";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1ResellerTenants" "Platform"."ResellerTenants";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."Resellers", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."Resellers" (name, city, tier, "commissionPct", "nextTierTenants", "contactName", email, phone, ntn, "isActiveTaxpayer", "bankName", "ibanMasked", "ibanEnc", "payoutMethod", "inviteCode", status)
    VALUES (CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'tier' THEN "vRec".tier ELSE 'BRONZE' END, CASE WHEN "pData" ? 'commissionPct' THEN "vRec"."commissionPct" ELSE NULL END, CASE WHEN "pData" ? 'nextTierTenants' THEN "vRec"."nextTierTenants" ELSE NULL END, CASE WHEN "pData" ? 'contactName' THEN "vRec"."contactName" ELSE NULL END, CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE NULL END, CASE WHEN "pData" ? 'isActiveTaxpayer' THEN "vRec"."isActiveTaxpayer" ELSE FALSE END, CASE WHEN "pData" ? 'bankName' THEN "vRec"."bankName" ELSE NULL END, CASE WHEN "pData" ? 'ibanMasked' THEN "vRec"."ibanMasked" ELSE NULL END, CASE WHEN "pData" ? 'ibanEnc' THEN "vRec"."ibanEnc" ELSE NULL END, CASE WHEN "pData" ? 'payoutMethod' THEN "vRec"."payoutMethod" ELSE 'IBFT' END, CASE WHEN "pData" ? 'inviteCode' THEN "vRec"."inviteCode" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."Resellers" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           city = CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE t.city END,
           tier = CASE WHEN "pData" ? 'tier' THEN "vRec".tier ELSE t.tier END,
           "commissionPct" = CASE WHEN "pData" ? 'commissionPct' THEN "vRec"."commissionPct" ELSE t."commissionPct" END,
           "nextTierTenants" = CASE WHEN "pData" ? 'nextTierTenants' THEN "vRec"."nextTierTenants" ELSE t."nextTierTenants" END,
           "contactName" = CASE WHEN "pData" ? 'contactName' THEN "vRec"."contactName" ELSE t."contactName" END,
           email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           phone = CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE t.phone END,
           ntn = CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE t.ntn END,
           "isActiveTaxpayer" = CASE WHEN "pData" ? 'isActiveTaxpayer' THEN "vRec"."isActiveTaxpayer" ELSE t."isActiveTaxpayer" END,
           "bankName" = CASE WHEN "pData" ? 'bankName' THEN "vRec"."bankName" ELSE t."bankName" END,
           "ibanMasked" = CASE WHEN "pData" ? 'ibanMasked' THEN "vRec"."ibanMasked" ELSE t."ibanMasked" END,
           "ibanEnc" = CASE WHEN "pData" ? 'ibanEnc' THEN "vRec"."ibanEnc" ELSE t."ibanEnc" END,
           "payoutMethod" = CASE WHEN "pData" ? 'payoutMethod' THEN "vRec"."payoutMethod" ELSE t."payoutMethod" END,
           "inviteCode" = CASE WHEN "pData" ? 'inviteCode' THEN "vRec"."inviteCode" ELSE t."inviteCode" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."Resellers" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'Resellers %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Resellers % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'tenants' THEN
    -- tenants: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."ResellerTenants"
     WHERE "tenantId" = "vTenant" AND "partnerId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'tenants') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'tenants') WITH ORDINALITY t(x, n) LOOP
      "vC1ResellerTenants" := jsonb_populate_record(NULL::"Platform"."ResellerTenants", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."ResellerTenants" t
           SET "attributedOn" = CASE WHEN "vE1" ? 'attributedOn' THEN "vC1ResellerTenants"."attributedOn" ELSE t."attributedOn" END,
               "commissionPctOverride" = CASE WHEN "vE1" ? 'commissionPctOverride' THEN "vC1ResellerTenants"."commissionPctOverride" ELSE t."commissionPctOverride" END,
               "endedOn" = CASE WHEN "vE1" ? 'endedOn' THEN "vC1ResellerTenants"."endedOn" ELSE t."endedOn" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."partnerId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ResellerTenants: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."ResellerTenants" ("partnerId", "tenantId", "attributedOn", "commissionPctOverride", "endedOn")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'attributedOn' THEN "vC1ResellerTenants"."attributedOn" ELSE NULL END, CASE WHEN "vE1" ? 'commissionPctOverride' THEN "vC1ResellerTenants"."commissionPctOverride" ELSE NULL END, CASE WHEN "vE1" ? 'endedOn' THEN "vC1ResellerTenants"."endedOn" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."resellerAddUpdate"(jsonb) IS 'Save (insert or update) one Resellers record with its tenants.';

-- Resellers: one record as JSON (camelCase keys), with lookup labels and tenants
CREATE OR REPLACE FUNCTION "Platform"."getResellerInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('tierLabel', "Lookups"."getLookupLabel"('Tier', t.tier) ->> 'label', 'tierTone', "Lookups"."getLookupLabel"('Tier', t.tier) ->> 'tone', 'payoutMethodLabel', "Lookups"."getLookupLabel"('PayoutMethod', t."payoutMethod") ->> 'label', 'payoutMethodTone', "Lookups"."getLookupLabel"('PayoutMethod', t."payoutMethod") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ResellerStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ResellerStatus', t.status) ->> 'tone') ||
         jsonb_build_object('tenants', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."ResellerTenants" c1 WHERE c1."partnerId" = t.id), '[]'::jsonb))
    FROM "Platform"."Resellers" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getResellerInfo"(uuid) IS 'Read one Resellers record (getter for its screens).';

-- ResellerPayouts: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."resellerPayoutAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."ResellerPayouts";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."ResellerPayouts", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."ResellerPayouts" ("partnerId", "periodMonth", "tenantsCount", "sourcedMrr", "commissionPct", "grossAmount", "whtSection", "whtRate", "whtAmount", "netAmount", "statementLines", status, "paidOn", "paymentRef", "whtCertificateNo", "statementEmailedAt")
    VALUES (CASE WHEN "pData" ? 'partnerId' THEN "vRec"."partnerId" ELSE NULL END, CASE WHEN "pData" ? 'periodMonth' THEN "vRec"."periodMonth" ELSE NULL END, CASE WHEN "pData" ? 'tenantsCount' THEN "vRec"."tenantsCount" ELSE 0 END, CASE WHEN "pData" ? 'sourcedMrr' THEN "vRec"."sourcedMrr" ELSE 0 END, CASE WHEN "pData" ? 'commissionPct' THEN "vRec"."commissionPct" ELSE NULL END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE NULL END, CASE WHEN "pData" ? 'whtSection' THEN "vRec"."whtSection" ELSE '233' END, CASE WHEN "pData" ? 'whtRate' THEN "vRec"."whtRate" ELSE 12 END, CASE WHEN "pData" ? 'whtAmount' THEN "vRec"."whtAmount" ELSE NULL END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE NULL END, CASE WHEN "pData" ? 'statementLines' THEN "vRec"."statementLines" ELSE '[]' END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'DUE' END, CASE WHEN "pData" ? 'paidOn' THEN "vRec"."paidOn" ELSE NULL END, CASE WHEN "pData" ? 'paymentRef' THEN "vRec"."paymentRef" ELSE NULL END, CASE WHEN "pData" ? 'whtCertificateNo' THEN "vRec"."whtCertificateNo" ELSE NULL END, CASE WHEN "pData" ? 'statementEmailedAt' THEN "vRec"."statementEmailedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."ResellerPayouts" t
       SET "partnerId" = CASE WHEN "pData" ? 'partnerId' THEN "vRec"."partnerId" ELSE t."partnerId" END,
           "periodMonth" = CASE WHEN "pData" ? 'periodMonth' THEN "vRec"."periodMonth" ELSE t."periodMonth" END,
           "tenantsCount" = CASE WHEN "pData" ? 'tenantsCount' THEN "vRec"."tenantsCount" ELSE t."tenantsCount" END,
           "sourcedMrr" = CASE WHEN "pData" ? 'sourcedMrr' THEN "vRec"."sourcedMrr" ELSE t."sourcedMrr" END,
           "commissionPct" = CASE WHEN "pData" ? 'commissionPct' THEN "vRec"."commissionPct" ELSE t."commissionPct" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "whtSection" = CASE WHEN "pData" ? 'whtSection' THEN "vRec"."whtSection" ELSE t."whtSection" END,
           "whtRate" = CASE WHEN "pData" ? 'whtRate' THEN "vRec"."whtRate" ELSE t."whtRate" END,
           "whtAmount" = CASE WHEN "pData" ? 'whtAmount' THEN "vRec"."whtAmount" ELSE t."whtAmount" END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "statementLines" = CASE WHEN "pData" ? 'statementLines' THEN "vRec"."statementLines" ELSE t."statementLines" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "paidOn" = CASE WHEN "pData" ? 'paidOn' THEN "vRec"."paidOn" ELSE t."paidOn" END,
           "paymentRef" = CASE WHEN "pData" ? 'paymentRef' THEN "vRec"."paymentRef" ELSE t."paymentRef" END,
           "whtCertificateNo" = CASE WHEN "pData" ? 'whtCertificateNo' THEN "vRec"."whtCertificateNo" ELSE t."whtCertificateNo" END,
           "statementEmailedAt" = CASE WHEN "pData" ? 'statementEmailedAt' THEN "vRec"."statementEmailedAt" ELSE t."statementEmailedAt" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."ResellerPayouts" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'ResellerPayouts %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ResellerPayouts % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."resellerPayoutAddUpdate"(jsonb) IS 'Save (insert or update) one ResellerPayouts record.';

-- ResellerPayouts: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getResellerPayoutInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('ResellerPayoutStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ResellerPayoutStatus', t.status) ->> 'tone')
    FROM "Platform"."ResellerPayouts" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getResellerPayoutInfo"(uuid) IS 'Read one ResellerPayouts record (getter for its screens).';

-- SubscriptionCoupons: insert (no "id") or update (with "id"); child arrays: plans
CREATE OR REPLACE FUNCTION "Platform"."subscriptionCouponAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."SubscriptionCoupons";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1SubscriptionCouponPlans" "Platform"."SubscriptionCouponPlans";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."SubscriptionCoupons", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."SubscriptionCoupons" (code, "discountType", "discountValue", duration, "redemptionCap", "startsOn", "expiresOn", "newCustomersOnly", "stackableWithPartner", "partnerId", status)
    VALUES (CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'discountType' THEN "vRec"."discountType" ELSE NULL END, CASE WHEN "pData" ? 'discountValue' THEN "vRec"."discountValue" ELSE NULL END, CASE WHEN "pData" ? 'duration' THEN "vRec".duration ELSE NULL END, CASE WHEN "pData" ? 'redemptionCap' THEN "vRec"."redemptionCap" ELSE NULL END, CASE WHEN "pData" ? 'startsOn' THEN "vRec"."startsOn" ELSE NULL END, CASE WHEN "pData" ? 'expiresOn' THEN "vRec"."expiresOn" ELSE NULL END, CASE WHEN "pData" ? 'newCustomersOnly' THEN "vRec"."newCustomersOnly" ELSE TRUE END, CASE WHEN "pData" ? 'stackableWithPartner' THEN "vRec"."stackableWithPartner" ELSE FALSE END, CASE WHEN "pData" ? 'partnerId' THEN "vRec"."partnerId" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."SubscriptionCoupons" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           "discountType" = CASE WHEN "pData" ? 'discountType' THEN "vRec"."discountType" ELSE t."discountType" END,
           "discountValue" = CASE WHEN "pData" ? 'discountValue' THEN "vRec"."discountValue" ELSE t."discountValue" END,
           duration = CASE WHEN "pData" ? 'duration' THEN "vRec".duration ELSE t.duration END,
           "redemptionCap" = CASE WHEN "pData" ? 'redemptionCap' THEN "vRec"."redemptionCap" ELSE t."redemptionCap" END,
           "startsOn" = CASE WHEN "pData" ? 'startsOn' THEN "vRec"."startsOn" ELSE t."startsOn" END,
           "expiresOn" = CASE WHEN "pData" ? 'expiresOn' THEN "vRec"."expiresOn" ELSE t."expiresOn" END,
           "newCustomersOnly" = CASE WHEN "pData" ? 'newCustomersOnly' THEN "vRec"."newCustomersOnly" ELSE t."newCustomersOnly" END,
           "stackableWithPartner" = CASE WHEN "pData" ? 'stackableWithPartner' THEN "vRec"."stackableWithPartner" ELSE t."stackableWithPartner" END,
           "partnerId" = CASE WHEN "pData" ? 'partnerId' THEN "vRec"."partnerId" ELSE t."partnerId" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."SubscriptionCoupons" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'SubscriptionCoupons %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SubscriptionCoupons % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'plans' THEN
    -- plans: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."SubscriptionCouponPlans"
     WHERE "couponId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'plans') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'plans') WITH ORDINALITY t(x, n) LOOP
      "vC1SubscriptionCouponPlans" := jsonb_populate_record(NULL::"Platform"."SubscriptionCouponPlans", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."SubscriptionCouponPlans" t
           SET "planId" = CASE WHEN "vE1" ? 'planId' THEN "vC1SubscriptionCouponPlans"."planId" ELSE t."planId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."couponId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SubscriptionCouponPlans: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."SubscriptionCouponPlans" ("couponId", "planId")
        VALUES ("vRet", CASE WHEN "vE1" ? 'planId' THEN "vC1SubscriptionCouponPlans"."planId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."subscriptionCouponAddUpdate"(jsonb) IS 'Save (insert or update) one SubscriptionCoupons record with its plans.';

-- SubscriptionCoupons: one record as JSON (camelCase keys), with lookup labels and plans
CREATE OR REPLACE FUNCTION "Platform"."getSubscriptionCouponInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('discountTypeLabel', "Lookups"."getLookupLabel"('DiscountType', t."discountType") ->> 'label', 'discountTypeTone', "Lookups"."getLookupLabel"('DiscountType', t."discountType") ->> 'tone', 'durationLabel', "Lookups"."getLookupLabel"('SubscriptionCouponDuration', t.duration) ->> 'label', 'durationTone', "Lookups"."getLookupLabel"('SubscriptionCouponDuration', t.duration) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('SubscriptionCouponStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('SubscriptionCouponStatus', t.status) ->> 'tone') ||
         jsonb_build_object('plans', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."SubscriptionCouponPlans" c1 WHERE c1."couponId" = t.id), '[]'::jsonb))
    FROM "Platform"."SubscriptionCoupons" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getSubscriptionCouponInfo"(uuid) IS 'Read one SubscriptionCoupons record (getter for its screens).';

-- PlatformLeads: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."platformLeadAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Platform"."PlatformLeads";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."PlatformLeads", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."PlatformLeads" ("tenantId", "companyName", "contactPerson", phone, email, city, source, "partnerId", "ownerStaffId", "planInterestId", "expectedMrr", stage, "boardPosition", notes, "demoAt", "trialStartedOn", "trialEndsOn", "trialEngagementScore", "wonAt", "churnedAt", "lostReason")
    VALUES ("vTenant", CASE WHEN "pData" ? 'companyName' THEN "vRec"."companyName" ELSE NULL END, CASE WHEN "pData" ? 'contactPerson' THEN "vRec"."contactPerson" ELSE NULL END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE NULL END, CASE WHEN "pData" ? 'partnerId' THEN "vRec"."partnerId" ELSE NULL END, CASE WHEN "pData" ? 'ownerStaffId' THEN "vRec"."ownerStaffId" ELSE NULL END, CASE WHEN "pData" ? 'planInterestId' THEN "vRec"."planInterestId" ELSE NULL END, CASE WHEN "pData" ? 'expectedMrr' THEN "vRec"."expectedMrr" ELSE 0 END, CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE 'LEAD' END, CASE WHEN "pData" ? 'boardPosition' THEN "vRec"."boardPosition" ELSE 0 END, CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE NULL END, CASE WHEN "pData" ? 'demoAt' THEN "vRec"."demoAt" ELSE NULL END, CASE WHEN "pData" ? 'trialStartedOn' THEN "vRec"."trialStartedOn" ELSE NULL END, CASE WHEN "pData" ? 'trialEndsOn' THEN "vRec"."trialEndsOn" ELSE NULL END, CASE WHEN "pData" ? 'trialEngagementScore' THEN "vRec"."trialEngagementScore" ELSE NULL END, CASE WHEN "pData" ? 'wonAt' THEN "vRec"."wonAt" ELSE NULL END, CASE WHEN "pData" ? 'churnedAt' THEN "vRec"."churnedAt" ELSE NULL END, CASE WHEN "pData" ? 'lostReason' THEN "vRec"."lostReason" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."PlatformLeads" t
       SET "companyName" = CASE WHEN "pData" ? 'companyName' THEN "vRec"."companyName" ELSE t."companyName" END,
           "contactPerson" = CASE WHEN "pData" ? 'contactPerson' THEN "vRec"."contactPerson" ELSE t."contactPerson" END,
           phone = CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE t.phone END,
           email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           city = CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE t.city END,
           source = CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE t.source END,
           "partnerId" = CASE WHEN "pData" ? 'partnerId' THEN "vRec"."partnerId" ELSE t."partnerId" END,
           "ownerStaffId" = CASE WHEN "pData" ? 'ownerStaffId' THEN "vRec"."ownerStaffId" ELSE t."ownerStaffId" END,
           "planInterestId" = CASE WHEN "pData" ? 'planInterestId' THEN "vRec"."planInterestId" ELSE t."planInterestId" END,
           "expectedMrr" = CASE WHEN "pData" ? 'expectedMrr' THEN "vRec"."expectedMrr" ELSE t."expectedMrr" END,
           stage = CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE t.stage END,
           "boardPosition" = CASE WHEN "pData" ? 'boardPosition' THEN "vRec"."boardPosition" ELSE t."boardPosition" END,
           notes = CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE t.notes END,
           "demoAt" = CASE WHEN "pData" ? 'demoAt' THEN "vRec"."demoAt" ELSE t."demoAt" END,
           "trialStartedOn" = CASE WHEN "pData" ? 'trialStartedOn' THEN "vRec"."trialStartedOn" ELSE t."trialStartedOn" END,
           "trialEndsOn" = CASE WHEN "pData" ? 'trialEndsOn' THEN "vRec"."trialEndsOn" ELSE t."trialEndsOn" END,
           "trialEngagementScore" = CASE WHEN "pData" ? 'trialEngagementScore' THEN "vRec"."trialEngagementScore" ELSE t."trialEngagementScore" END,
           "wonAt" = CASE WHEN "pData" ? 'wonAt' THEN "vRec"."wonAt" ELSE t."wonAt" END,
           "churnedAt" = CASE WHEN "pData" ? 'churnedAt' THEN "vRec"."churnedAt" ELSE t."churnedAt" END,
           "lostReason" = CASE WHEN "pData" ? 'lostReason' THEN "vRec"."lostReason" ELSE t."lostReason" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."PlatformLeads" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PlatformLeads %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PlatformLeads % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."platformLeadAddUpdate"(jsonb) IS 'Save (insert or update) one PlatformLeads record.';

-- PlatformLeads: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getPlatformLeadInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('sourceLabel', "Lookups"."getLookupLabel"('PlatformLeadSource', t.source) ->> 'label', 'sourceTone', "Lookups"."getLookupLabel"('PlatformLeadSource', t.source) ->> 'tone', 'stageLabel', "Lookups"."getLookupLabel"('PlatformLeadStage', t.stage) ->> 'label', 'stageTone', "Lookups"."getLookupLabel"('PlatformLeadStage', t.stage) ->> 'tone')
    FROM "Platform"."PlatformLeads" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getPlatformLeadInfo"(uuid) IS 'Read one PlatformLeads record (getter for its screens).';

-- PlatformInvoices: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Platform"."platformInvoiceAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Platform"."PlatformInvoices";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1PlatformInvoiceLines" "Platform"."PlatformInvoiceLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."PlatformInvoices", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."PlatformInvoices" ("tenantId", "docNo", "subscriptionId", "invoiceKind", description, "periodStart", "periodEnd", "issuedOn", "dueOn", "currencyCode", "grossAmount", "discountAmount", "netAmount", "taxAuthorityId", "taxRate", "taxAmount", "totalAmount", "couponId", "emailedAt", "lastReminderAt", "voidedByStaffId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE NULL END, CASE WHEN "pData" ? 'subscriptionId' THEN "vRec"."subscriptionId" ELSE NULL END, CASE WHEN "pData" ? 'invoiceKind' THEN "vRec"."invoiceKind" ELSE 'SUBSCRIPTION' END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'periodStart' THEN "vRec"."periodStart" ELSE NULL END, CASE WHEN "pData" ? 'periodEnd' THEN "vRec"."periodEnd" ELSE NULL END, CASE WHEN "pData" ? 'issuedOn' THEN "vRec"."issuedOn" ELSE NULL END, CASE WHEN "pData" ? 'dueOn' THEN "vRec"."dueOn" ELSE NULL END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE NULL END, CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE 0 END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE NULL END, CASE WHEN "pData" ? 'taxAuthorityId' THEN "vRec"."taxAuthorityId" ELSE NULL END, CASE WHEN "pData" ? 'taxRate' THEN "vRec"."taxRate" ELSE 0 END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE NULL END, CASE WHEN "pData" ? 'couponId' THEN "vRec"."couponId" ELSE NULL END, CASE WHEN "pData" ? 'emailedAt' THEN "vRec"."emailedAt" ELSE NULL END, CASE WHEN "pData" ? 'lastReminderAt' THEN "vRec"."lastReminderAt" ELSE NULL END, CASE WHEN "pData" ? 'voidedByStaffId' THEN "vRec"."voidedByStaffId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Platform"."PlatformInvoices" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'PlatformInvoices: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Platform"."PlatformInvoices" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "subscriptionId" = CASE WHEN "pData" ? 'subscriptionId' THEN "vRec"."subscriptionId" ELSE t."subscriptionId" END,
           "invoiceKind" = CASE WHEN "pData" ? 'invoiceKind' THEN "vRec"."invoiceKind" ELSE t."invoiceKind" END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "periodStart" = CASE WHEN "pData" ? 'periodStart' THEN "vRec"."periodStart" ELSE t."periodStart" END,
           "periodEnd" = CASE WHEN "pData" ? 'periodEnd' THEN "vRec"."periodEnd" ELSE t."periodEnd" END,
           "issuedOn" = CASE WHEN "pData" ? 'issuedOn' THEN "vRec"."issuedOn" ELSE t."issuedOn" END,
           "dueOn" = CASE WHEN "pData" ? 'dueOn' THEN "vRec"."dueOn" ELSE t."dueOn" END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "discountAmount" = CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE t."discountAmount" END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "taxAuthorityId" = CASE WHEN "pData" ? 'taxAuthorityId' THEN "vRec"."taxAuthorityId" ELSE t."taxAuthorityId" END,
           "taxRate" = CASE WHEN "pData" ? 'taxRate' THEN "vRec"."taxRate" ELSE t."taxRate" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "totalAmount" = CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE t."totalAmount" END,
           "couponId" = CASE WHEN "pData" ? 'couponId' THEN "vRec"."couponId" ELSE t."couponId" END,
           "emailedAt" = CASE WHEN "pData" ? 'emailedAt' THEN "vRec"."emailedAt" ELSE t."emailedAt" END,
           "lastReminderAt" = CASE WHEN "pData" ? 'lastReminderAt' THEN "vRec"."lastReminderAt" ELSE t."lastReminderAt" END,
           "voidedByStaffId" = CASE WHEN "pData" ? 'voidedByStaffId' THEN "vRec"."voidedByStaffId" ELSE t."voidedByStaffId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."PlatformInvoices" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PlatformInvoices %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PlatformInvoices % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."PlatformInvoiceLines"
     WHERE "platformInvoiceId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1PlatformInvoiceLines" := jsonb_populate_record(NULL::"Platform"."PlatformInvoiceLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1PlatformInvoiceLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."PlatformInvoiceLines" t
           SET "lineKind" = CASE WHEN "vE1" ? 'lineKind' THEN "vC1PlatformInvoiceLines"."lineKind" ELSE t."lineKind" END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1PlatformInvoiceLines".description ELSE t.description END,
               "planId" = CASE WHEN "vE1" ? 'planId' THEN "vC1PlatformInvoiceLines"."planId" ELSE t."planId" END,
               "addonId" = CASE WHEN "vE1" ? 'addonId' THEN "vC1PlatformInvoiceLines"."addonId" ELSE t."addonId" END,
               "usageMeterId" = CASE WHEN "vE1" ? 'usageMeterId' THEN "vC1PlatformInvoiceLines"."usageMeterId" ELSE t."usageMeterId" END,
               quantity = CASE WHEN "vE1" ? 'quantity' THEN "vC1PlatformInvoiceLines".quantity ELSE t.quantity END,
               "unitPrice" = CASE WHEN "vE1" ? 'unitPrice' THEN "vC1PlatformInvoiceLines"."unitPrice" ELSE t."unitPrice" END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1PlatformInvoiceLines".amount ELSE t.amount END,
               "periodStart" = CASE WHEN "vE1" ? 'periodStart' THEN "vC1PlatformInvoiceLines"."periodStart" ELSE t."periodStart" END,
               "periodEnd" = CASE WHEN "vE1" ? 'periodEnd' THEN "vC1PlatformInvoiceLines"."periodEnd" ELSE t."periodEnd" END,
               "lineNo" = "vC1PlatformInvoiceLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."platformInvoiceId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PlatformInvoiceLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."PlatformInvoiceLines" ("platformInvoiceId", "lineNo", "lineKind", description, "planId", "addonId", "usageMeterId", quantity, "unitPrice", amount, "periodStart", "periodEnd")
        VALUES ("vRet", "vC1PlatformInvoiceLines"."lineNo", CASE WHEN "vE1" ? 'lineKind' THEN "vC1PlatformInvoiceLines"."lineKind" ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1PlatformInvoiceLines".description ELSE NULL END, CASE WHEN "vE1" ? 'planId' THEN "vC1PlatformInvoiceLines"."planId" ELSE NULL END, CASE WHEN "vE1" ? 'addonId' THEN "vC1PlatformInvoiceLines"."addonId" ELSE NULL END, CASE WHEN "vE1" ? 'usageMeterId' THEN "vC1PlatformInvoiceLines"."usageMeterId" ELSE NULL END, CASE WHEN "vE1" ? 'quantity' THEN "vC1PlatformInvoiceLines".quantity ELSE 1 END, CASE WHEN "vE1" ? 'unitPrice' THEN "vC1PlatformInvoiceLines"."unitPrice" ELSE NULL END, CASE WHEN "vE1" ? 'amount' THEN "vC1PlatformInvoiceLines".amount ELSE NULL END, CASE WHEN "vE1" ? 'periodStart' THEN "vC1PlatformInvoiceLines"."periodStart" ELSE NULL END, CASE WHEN "vE1" ? 'periodEnd' THEN "vC1PlatformInvoiceLines"."periodEnd" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."platformInvoiceAddUpdate"(jsonb) IS 'Save (insert or update) one PlatformInvoices record with its lines.';

-- PlatformInvoices: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Platform"."getPlatformInvoiceInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('invoiceKindLabel', "Lookups"."getLookupLabel"('InvoiceKind', t."invoiceKind") ->> 'label', 'invoiceKindTone', "Lookups"."getLookupLabel"('InvoiceKind', t."invoiceKind") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('PlatformInvoiceStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('PlatformInvoiceStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Platform"."PlatformInvoiceLines" c1 WHERE c1."platformInvoiceId" = t.id), '[]'::jsonb))
    FROM "Platform"."PlatformInvoices" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getPlatformInvoiceInfo"(uuid) IS 'Read one PlatformInvoices record (getter for its screens).';

-- PlatformInvoices: Void (status -> VOID); allowed from DRAFT, OPEN, PARTIALLY_PAID, PAID, UNCOLLECTIBLE
CREATE OR REPLACE FUNCTION "Platform"."platformInvoiceVoid"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Platform"."PlatformInvoices";
BEGIN
  SELECT * INTO "vRow" FROM "Platform"."PlatformInvoices" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PlatformInvoices % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'VOID' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'UNCOLLECTIBLE') THEN
    RAISE EXCEPTION 'PlatformInvoices %: cannot void from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Platform"."platformInvoiceVoidEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Platform"."platformInvoiceVoidEntries"') USING "pId";
  END IF;
  UPDATE "Platform"."PlatformInvoices" t SET status = 'VOID', "voidedAt" = now(), "voidReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- DunningPolicies: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."dunningPolicyAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."DunningPolicies";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."DunningPolicies", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."DunningPolicies" (name, "isActive", "graceDays", "readOnlyDays", "suspendedDays", "archiveDays", "retryHour", "salaryRetryDays", "retrySchedule", "emailEnabled", "emailOffsets", "smsEnabled", "smsOffsets", "whatsappEnabled", "whatsappOffsets", "effectiveFrom")
    VALUES (CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END, CASE WHEN "pData" ? 'graceDays' THEN "vRec"."graceDays" ELSE 7 END, CASE WHEN "pData" ? 'readOnlyDays' THEN "vRec"."readOnlyDays" ELSE 7 END, CASE WHEN "pData" ? 'suspendedDays' THEN "vRec"."suspendedDays" ELSE 31 END, CASE WHEN "pData" ? 'archiveDays' THEN "vRec"."archiveDays" ELSE 90 END, CASE WHEN "pData" ? 'retryHour' THEN "vRec"."retryHour" ELSE 10 END, CASE WHEN "pData" ? 'salaryRetryDays' THEN "vRec"."salaryRetryDays" ELSE '{1,10}' END, CASE WHEN "pData" ? 'retrySchedule' THEN "vRec"."retrySchedule" ELSE NULL END, CASE WHEN "pData" ? 'emailEnabled' THEN "vRec"."emailEnabled" ELSE TRUE END, CASE WHEN "pData" ? 'emailOffsets' THEN "vRec"."emailOffsets" ELSE '{-3,0,3,7,14}' END, CASE WHEN "pData" ? 'smsEnabled' THEN "vRec"."smsEnabled" ELSE TRUE END, CASE WHEN "pData" ? 'smsOffsets' THEN "vRec"."smsOffsets" ELSE '{0,1,7}' END, CASE WHEN "pData" ? 'whatsappEnabled' THEN "vRec"."whatsappEnabled" ELSE FALSE END, CASE WHEN "pData" ? 'whatsappOffsets' THEN "vRec"."whatsappOffsets" ELSE '{0,3}' END, CASE WHEN "pData" ? 'effectiveFrom' THEN "vRec"."effectiveFrom" ELSE CURRENT_DATE END)
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
           "retrySchedule" = CASE WHEN "pData" ? 'retrySchedule' THEN "vRec"."retrySchedule" ELSE t."retrySchedule" END,
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
END $$;
COMMENT ON FUNCTION "Platform"."dunningPolicyAddUpdate"(jsonb) IS 'Save (insert or update) one DunningPolicies record.';

-- DunningPolicies: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getDunningPolicyInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "Platform"."DunningPolicies" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getDunningPolicyInfo"(uuid) IS 'Read one DunningPolicies record (getter for its screens).';

-- DunningCases: insert (no "id") or update (with "id"); child arrays: attempts
CREATE OR REPLACE FUNCTION "Platform"."dunningCaseAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Platform"."DunningCases";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1DunningAttempts" "Platform"."DunningAttempts";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."DunningCases", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."DunningCases" ("tenantId", "platformInvoiceId", "dunningPolicyId", "openedAt", stage, "amountDue", "paymentMethod", "attemptsCount", "lastFailureReason", "nextRetryAt", "nextRetryMethod", "retriesPaused", "promiseDate", "promiseAmount", "promiseSource", "promiseNote", "promiseLiftReadOnly", "promiseRemindOwner", "promiseLoggedByStaffId", "recoveredAt", "recoveredPaymentId", "closedAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'platformInvoiceId' THEN "vRec"."platformInvoiceId" ELSE NULL END, CASE WHEN "pData" ? 'dunningPolicyId' THEN "vRec"."dunningPolicyId" ELSE NULL END, CASE WHEN "pData" ? 'openedAt' THEN "vRec"."openedAt" ELSE now() END, CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE 'GRACE' END, CASE WHEN "pData" ? 'amountDue' THEN "vRec"."amountDue" ELSE NULL END, CASE WHEN "pData" ? 'paymentMethod' THEN "vRec"."paymentMethod" ELSE NULL END, CASE WHEN "pData" ? 'attemptsCount' THEN "vRec"."attemptsCount" ELSE 0 END, CASE WHEN "pData" ? 'lastFailureReason' THEN "vRec"."lastFailureReason" ELSE NULL END, CASE WHEN "pData" ? 'nextRetryAt' THEN "vRec"."nextRetryAt" ELSE NULL END, CASE WHEN "pData" ? 'nextRetryMethod' THEN "vRec"."nextRetryMethod" ELSE NULL END, CASE WHEN "pData" ? 'retriesPaused' THEN "vRec"."retriesPaused" ELSE FALSE END, CASE WHEN "pData" ? 'promiseDate' THEN "vRec"."promiseDate" ELSE NULL END, CASE WHEN "pData" ? 'promiseAmount' THEN "vRec"."promiseAmount" ELSE NULL END, CASE WHEN "pData" ? 'promiseSource' THEN "vRec"."promiseSource" ELSE NULL END, CASE WHEN "pData" ? 'promiseNote' THEN "vRec"."promiseNote" ELSE NULL END, CASE WHEN "pData" ? 'promiseLiftReadOnly' THEN "vRec"."promiseLiftReadOnly" ELSE FALSE END, CASE WHEN "pData" ? 'promiseRemindOwner' THEN "vRec"."promiseRemindOwner" ELSE TRUE END, CASE WHEN "pData" ? 'promiseLoggedByStaffId' THEN "vRec"."promiseLoggedByStaffId" ELSE NULL END, CASE WHEN "pData" ? 'recoveredAt' THEN "vRec"."recoveredAt" ELSE NULL END, CASE WHEN "pData" ? 'recoveredPaymentId' THEN "vRec"."recoveredPaymentId" ELSE NULL END, CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."DunningCases" t
       SET "platformInvoiceId" = CASE WHEN "pData" ? 'platformInvoiceId' THEN "vRec"."platformInvoiceId" ELSE t."platformInvoiceId" END,
           "dunningPolicyId" = CASE WHEN "pData" ? 'dunningPolicyId' THEN "vRec"."dunningPolicyId" ELSE t."dunningPolicyId" END,
           "openedAt" = CASE WHEN "pData" ? 'openedAt' THEN "vRec"."openedAt" ELSE t."openedAt" END,
           stage = CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE t.stage END,
           "amountDue" = CASE WHEN "pData" ? 'amountDue' THEN "vRec"."amountDue" ELSE t."amountDue" END,
           "paymentMethod" = CASE WHEN "pData" ? 'paymentMethod' THEN "vRec"."paymentMethod" ELSE t."paymentMethod" END,
           "attemptsCount" = CASE WHEN "pData" ? 'attemptsCount' THEN "vRec"."attemptsCount" ELSE t."attemptsCount" END,
           "lastFailureReason" = CASE WHEN "pData" ? 'lastFailureReason' THEN "vRec"."lastFailureReason" ELSE t."lastFailureReason" END,
           "nextRetryAt" = CASE WHEN "pData" ? 'nextRetryAt' THEN "vRec"."nextRetryAt" ELSE t."nextRetryAt" END,
           "nextRetryMethod" = CASE WHEN "pData" ? 'nextRetryMethod' THEN "vRec"."nextRetryMethod" ELSE t."nextRetryMethod" END,
           "retriesPaused" = CASE WHEN "pData" ? 'retriesPaused' THEN "vRec"."retriesPaused" ELSE t."retriesPaused" END,
           "promiseDate" = CASE WHEN "pData" ? 'promiseDate' THEN "vRec"."promiseDate" ELSE t."promiseDate" END,
           "promiseAmount" = CASE WHEN "pData" ? 'promiseAmount' THEN "vRec"."promiseAmount" ELSE t."promiseAmount" END,
           "promiseSource" = CASE WHEN "pData" ? 'promiseSource' THEN "vRec"."promiseSource" ELSE t."promiseSource" END,
           "promiseNote" = CASE WHEN "pData" ? 'promiseNote' THEN "vRec"."promiseNote" ELSE t."promiseNote" END,
           "promiseLiftReadOnly" = CASE WHEN "pData" ? 'promiseLiftReadOnly' THEN "vRec"."promiseLiftReadOnly" ELSE t."promiseLiftReadOnly" END,
           "promiseRemindOwner" = CASE WHEN "pData" ? 'promiseRemindOwner' THEN "vRec"."promiseRemindOwner" ELSE t."promiseRemindOwner" END,
           "promiseLoggedByStaffId" = CASE WHEN "pData" ? 'promiseLoggedByStaffId' THEN "vRec"."promiseLoggedByStaffId" ELSE t."promiseLoggedByStaffId" END,
           "recoveredAt" = CASE WHEN "pData" ? 'recoveredAt' THEN "vRec"."recoveredAt" ELSE t."recoveredAt" END,
           "recoveredPaymentId" = CASE WHEN "pData" ? 'recoveredPaymentId' THEN "vRec"."recoveredPaymentId" ELSE t."recoveredPaymentId" END,
           "closedAt" = CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE t."closedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."DunningCases" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'DunningCases %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'DunningCases % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'attempts' THEN
    -- attempts: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."DunningAttempts"
     WHERE "dunningCaseId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'attempts') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'attempts') WITH ORDINALITY t(x, n) LOOP
      "vC1DunningAttempts" := jsonb_populate_record(NULL::"Platform"."DunningAttempts", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."DunningAttempts" t
           SET "attemptNo" = CASE WHEN "vE1" ? 'attemptNo' THEN "vC1DunningAttempts"."attemptNo" ELSE t."attemptNo" END,
               "planDay" = CASE WHEN "vE1" ? 'planDay' THEN "vC1DunningAttempts"."planDay" ELSE t."planDay" END,
               label = CASE WHEN "vE1" ? 'label' THEN "vC1DunningAttempts".label ELSE t.label END,
               method = CASE WHEN "vE1" ? 'method' THEN "vC1DunningAttempts".method ELSE t.method END,
               "scheduledAt" = CASE WHEN "vE1" ? 'scheduledAt' THEN "vC1DunningAttempts"."scheduledAt" ELSE t."scheduledAt" END,
               "attemptedAt" = CASE WHEN "vE1" ? 'attemptedAt' THEN "vC1DunningAttempts"."attemptedAt" ELSE t."attemptedAt" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1DunningAttempts".status ELSE t.status END,
               "triggeredBy" = CASE WHEN "vE1" ? 'triggeredBy' THEN "vC1DunningAttempts"."triggeredBy" ELSE t."triggeredBy" END,
               "platformPaymentId" = CASE WHEN "vE1" ? 'platformPaymentId' THEN "vC1DunningAttempts"."platformPaymentId" ELSE t."platformPaymentId" END,
               "failureReason" = CASE WHEN "vE1" ? 'failureReason' THEN "vC1DunningAttempts"."failureReason" ELSE t."failureReason" END,
               "staffUserId" = CASE WHEN "vE1" ? 'staffUserId' THEN "vC1DunningAttempts"."staffUserId" ELSE t."staffUserId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."dunningCaseId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'DunningAttempts: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."DunningAttempts" ("dunningCaseId", "attemptNo", "planDay", label, method, "scheduledAt", "attemptedAt", status, "triggeredBy", "platformPaymentId", "failureReason", "staffUserId")
        VALUES ("vRet", CASE WHEN "vE1" ? 'attemptNo' THEN "vC1DunningAttempts"."attemptNo" ELSE NULL END, CASE WHEN "vE1" ? 'planDay' THEN "vC1DunningAttempts"."planDay" ELSE NULL END, CASE WHEN "vE1" ? 'label' THEN "vC1DunningAttempts".label ELSE NULL END, CASE WHEN "vE1" ? 'method' THEN "vC1DunningAttempts".method ELSE NULL END, CASE WHEN "vE1" ? 'scheduledAt' THEN "vC1DunningAttempts"."scheduledAt" ELSE NULL END, CASE WHEN "vE1" ? 'attemptedAt' THEN "vC1DunningAttempts"."attemptedAt" ELSE NULL END, CASE WHEN "vE1" ? 'status' THEN "vC1DunningAttempts".status ELSE 'SCHEDULED' END, CASE WHEN "vE1" ? 'triggeredBy' THEN "vC1DunningAttempts"."triggeredBy" ELSE 'SCHEDULE' END, CASE WHEN "vE1" ? 'platformPaymentId' THEN "vC1DunningAttempts"."platformPaymentId" ELSE NULL END, CASE WHEN "vE1" ? 'failureReason' THEN "vC1DunningAttempts"."failureReason" ELSE NULL END, CASE WHEN "vE1" ? 'staffUserId' THEN "vC1DunningAttempts"."staffUserId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."dunningCaseAddUpdate"(jsonb) IS 'Save (insert or update) one DunningCases record with its attempts.';

-- DunningCases: one record as JSON (camelCase keys), with lookup labels and attempts
CREATE OR REPLACE FUNCTION "Platform"."getDunningCaseInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('stageLabel', "Lookups"."getLookupLabel"('DunningCaseStage', t.stage) ->> 'label', 'stageTone', "Lookups"."getLookupLabel"('DunningCaseStage', t.stage) ->> 'tone', 'paymentMethodLabel', "Lookups"."getLookupLabel"('DunningCasePaymentMethod', t."paymentMethod") ->> 'label', 'paymentMethodTone', "Lookups"."getLookupLabel"('DunningCasePaymentMethod', t."paymentMethod") ->> 'tone', 'nextRetryMethodLabel', "Lookups"."getLookupLabel"('NextRetryMethod', t."nextRetryMethod") ->> 'label', 'nextRetryMethodTone', "Lookups"."getLookupLabel"('NextRetryMethod', t."nextRetryMethod") ->> 'tone', 'promiseSourceLabel', "Lookups"."getLookupLabel"('PromiseSource', t."promiseSource") ->> 'label', 'promiseSourceTone', "Lookups"."getLookupLabel"('PromiseSource', t."promiseSource") ->> 'tone') ||
         jsonb_build_object('attempts', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."DunningAttempts" c1 WHERE c1."dunningCaseId" = t.id), '[]'::jsonb))
    FROM "Platform"."DunningCases" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getDunningCaseInfo"(uuid) IS 'Read one DunningCases record (getter for its screens).';

-- UsageLimitOverrides: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."usageLimitOverrideAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Platform"."UsageLimitOverrides";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."UsageLimitOverrides", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."UsageLimitOverrides" ("tenantId", "usageMeterId", "previousLimit", "limitValue", "expiryMode", "expiresOn", "billOverage", "customPrice", reason, "approvedByStaffId", "appliedByStaffId", "revokedAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'usageMeterId' THEN "vRec"."usageMeterId" ELSE NULL END, CASE WHEN "pData" ? 'previousLimit' THEN "vRec"."previousLimit" ELSE NULL END, CASE WHEN "pData" ? 'limitValue' THEN "vRec"."limitValue" ELSE NULL END, CASE WHEN "pData" ? 'expiryMode' THEN "vRec"."expiryMode" ELSE NULL END, CASE WHEN "pData" ? 'expiresOn' THEN "vRec"."expiresOn" ELSE NULL END, CASE WHEN "pData" ? 'billOverage' THEN "vRec"."billOverage" ELSE 'NO' END, CASE WHEN "pData" ? 'customPrice' THEN "vRec"."customPrice" ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'approvedByStaffId' THEN "vRec"."approvedByStaffId" ELSE NULL END, CASE WHEN "pData" ? 'appliedByStaffId' THEN "vRec"."appliedByStaffId" ELSE NULL END, CASE WHEN "pData" ? 'revokedAt' THEN "vRec"."revokedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."UsageLimitOverrides" t
       SET "usageMeterId" = CASE WHEN "pData" ? 'usageMeterId' THEN "vRec"."usageMeterId" ELSE t."usageMeterId" END,
           "previousLimit" = CASE WHEN "pData" ? 'previousLimit' THEN "vRec"."previousLimit" ELSE t."previousLimit" END,
           "limitValue" = CASE WHEN "pData" ? 'limitValue' THEN "vRec"."limitValue" ELSE t."limitValue" END,
           "expiryMode" = CASE WHEN "pData" ? 'expiryMode' THEN "vRec"."expiryMode" ELSE t."expiryMode" END,
           "expiresOn" = CASE WHEN "pData" ? 'expiresOn' THEN "vRec"."expiresOn" ELSE t."expiresOn" END,
           "billOverage" = CASE WHEN "pData" ? 'billOverage' THEN "vRec"."billOverage" ELSE t."billOverage" END,
           "customPrice" = CASE WHEN "pData" ? 'customPrice' THEN "vRec"."customPrice" ELSE t."customPrice" END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           "approvedByStaffId" = CASE WHEN "pData" ? 'approvedByStaffId' THEN "vRec"."approvedByStaffId" ELSE t."approvedByStaffId" END,
           "appliedByStaffId" = CASE WHEN "pData" ? 'appliedByStaffId' THEN "vRec"."appliedByStaffId" ELSE t."appliedByStaffId" END,
           "revokedAt" = CASE WHEN "pData" ? 'revokedAt' THEN "vRec"."revokedAt" ELSE t."revokedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."UsageLimitOverrides" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'UsageLimitOverrides %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'UsageLimitOverrides % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."usageLimitOverrideAddUpdate"(jsonb) IS 'Save (insert or update) one UsageLimitOverrides record.';

-- UsageLimitOverrides: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getUsageLimitOverrideInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('expiryModeLabel', "Lookups"."getLookupLabel"('ExpiryMode', t."expiryMode") ->> 'label', 'expiryModeTone', "Lookups"."getLookupLabel"('ExpiryMode', t."expiryMode") ->> 'tone', 'billOverageLabel', "Lookups"."getLookupLabel"('BillOverage', t."billOverage") ->> 'label', 'billOverageTone', "Lookups"."getLookupLabel"('BillOverage', t."billOverage") ->> 'tone')
    FROM "Platform"."UsageLimitOverrides" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getUsageLimitOverrideInfo"(uuid) IS 'Read one UsageLimitOverrides record (getter for its screens).';

-- UsageAlertRules: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."usageAlertRuleAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."UsageAlertRules";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."UsageAlertRules", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."UsageAlertRules" ("usageMeterId", "thresholdPct", "planId", action, "actionDetail", "throttleRps", "offerAddonId", "isEnabled", "evalIntervalMinutes", "lastEvaluatedAt")
    VALUES (CASE WHEN "pData" ? 'usageMeterId' THEN "vRec"."usageMeterId" ELSE NULL END, CASE WHEN "pData" ? 'thresholdPct' THEN "vRec"."thresholdPct" ELSE NULL END, CASE WHEN "pData" ? 'planId' THEN "vRec"."planId" ELSE NULL END, CASE WHEN "pData" ? 'action' THEN "vRec".action ELSE NULL END, CASE WHEN "pData" ? 'actionDetail' THEN "vRec"."actionDetail" ELSE NULL END, CASE WHEN "pData" ? 'throttleRps' THEN "vRec"."throttleRps" ELSE NULL END, CASE WHEN "pData" ? 'offerAddonId' THEN "vRec"."offerAddonId" ELSE NULL END, CASE WHEN "pData" ? 'isEnabled' THEN "vRec"."isEnabled" ELSE TRUE END, CASE WHEN "pData" ? 'evalIntervalMinutes' THEN "vRec"."evalIntervalMinutes" ELSE 15 END, CASE WHEN "pData" ? 'lastEvaluatedAt' THEN "vRec"."lastEvaluatedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."UsageAlertRules" t
       SET "usageMeterId" = CASE WHEN "pData" ? 'usageMeterId' THEN "vRec"."usageMeterId" ELSE t."usageMeterId" END,
           "thresholdPct" = CASE WHEN "pData" ? 'thresholdPct' THEN "vRec"."thresholdPct" ELSE t."thresholdPct" END,
           "planId" = CASE WHEN "pData" ? 'planId' THEN "vRec"."planId" ELSE t."planId" END,
           action = CASE WHEN "pData" ? 'action' THEN "vRec".action ELSE t.action END,
           "actionDetail" = CASE WHEN "pData" ? 'actionDetail' THEN "vRec"."actionDetail" ELSE t."actionDetail" END,
           "throttleRps" = CASE WHEN "pData" ? 'throttleRps' THEN "vRec"."throttleRps" ELSE t."throttleRps" END,
           "offerAddonId" = CASE WHEN "pData" ? 'offerAddonId' THEN "vRec"."offerAddonId" ELSE t."offerAddonId" END,
           "isEnabled" = CASE WHEN "pData" ? 'isEnabled' THEN "vRec"."isEnabled" ELSE t."isEnabled" END,
           "evalIntervalMinutes" = CASE WHEN "pData" ? 'evalIntervalMinutes' THEN "vRec"."evalIntervalMinutes" ELSE t."evalIntervalMinutes" END,
           "lastEvaluatedAt" = CASE WHEN "pData" ? 'lastEvaluatedAt' THEN "vRec"."lastEvaluatedAt" ELSE t."lastEvaluatedAt" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."UsageAlertRules" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'UsageAlertRules %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'UsageAlertRules % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."usageAlertRuleAddUpdate"(jsonb) IS 'Save (insert or update) one UsageAlertRules record.';

-- UsageAlertRules: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getUsageAlertRuleInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('actionLabel', "Lookups"."getLookupLabel"('UsageAlertRuleAction', t.action) ->> 'label', 'actionTone', "Lookups"."getLookupLabel"('UsageAlertRuleAction', t.action) ->> 'tone')
    FROM "Platform"."UsageAlertRules" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getUsageAlertRuleInfo"(uuid) IS 'Read one UsageAlertRules record (getter for its screens).';

-- TenantSegments: insert (no "id") or update (with "id"); child arrays: rules, tenants
CREATE OR REPLACE FUNCTION "Platform"."tenantSegmentAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
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
           tone = CASE WHEN "pData" ? 'tone' THEN "vRec".tone ELSE t.tone END
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
    -- tenants: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."SegmentTenants"
     WHERE "tenantId" = "vTenant" AND "segmentId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'tenants') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'tenants') WITH ORDINALITY t(x, n) LOOP
      "vC1SegmentTenants" := jsonb_populate_record(NULL::"Platform"."SegmentTenants", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."SegmentTenants" t
           SET membership = CASE WHEN "vE1" ? 'membership' THEN "vC1SegmentTenants".membership ELSE t.membership END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."segmentId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SegmentTenants: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."SegmentTenants" ("segmentId", "tenantId", membership)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'membership' THEN "vC1SegmentTenants".membership ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."tenantSegmentAddUpdate"(jsonb) IS 'Save (insert or update) one TenantSegments record with its rules, tenants.';

-- TenantSegments: one record as JSON (camelCase keys), with lookup labels and rules, tenants
CREATE OR REPLACE FUNCTION "Platform"."getTenantSegmentInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('toneLabel', "Lookups"."getLookupLabel"('TenantSegmentTone', t.tone) ->> 'label', 'toneTone', "Lookups"."getLookupLabel"('TenantSegmentTone', t.tone) ->> 'tone') ||
         jsonb_build_object('rules', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."TenantSegmentRules" c1 WHERE c1."segmentId" = t.id), '[]'::jsonb), 'tenants', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."SegmentTenants" c1 WHERE c1."segmentId" = t.id), '[]'::jsonb))
    FROM "Platform"."TenantSegments" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getTenantSegmentInfo"(uuid) IS 'Read one TenantSegments record (getter for its screens).';

-- FeatureFlags: insert (no "id") or update (with "id"); child arrays: environments, prerequisites, scheduledChanges, variations
CREATE OR REPLACE FUNCTION "Platform"."featureFlagAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
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
    -- prerequisites: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."FlagPrerequisites"
     WHERE "prerequisiteFlagId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'prerequisites') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'prerequisites') WITH ORDINALITY t(x, n) LOOP
      "vC1FlagPrerequisites" := jsonb_populate_record(NULL::"Platform"."FlagPrerequisites", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."FlagPrerequisites" t
           SET "flagEnvironmentId" = CASE WHEN "vE1" ? 'flagEnvironmentId' THEN "vC1FlagPrerequisites"."flagEnvironmentId" ELSE t."flagEnvironmentId" END,
               "flagId" = CASE WHEN "vE1" ? 'flagId' THEN "vC1FlagPrerequisites"."flagId" ELSE t."flagId" END,
               "requiredVariationIdx" = CASE WHEN "vE1" ? 'requiredVariationIdx' THEN "vC1FlagPrerequisites"."requiredVariationIdx" ELSE t."requiredVariationIdx" END,
               "prerequisiteModuleId" = CASE WHEN "vE1" ? 'prerequisiteModuleId' THEN "vC1FlagPrerequisites"."prerequisiteModuleId" ELSE t."prerequisiteModuleId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."prerequisiteFlagId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'FlagPrerequisites: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."FlagPrerequisites" ("prerequisiteFlagId", "flagEnvironmentId", "flagId", "requiredVariationIdx", "prerequisiteModuleId")
        VALUES ("vRet", CASE WHEN "vE1" ? 'flagEnvironmentId' THEN "vC1FlagPrerequisites"."flagEnvironmentId" ELSE NULL END, CASE WHEN "vE1" ? 'flagId' THEN "vC1FlagPrerequisites"."flagId" ELSE NULL END, CASE WHEN "vE1" ? 'requiredVariationIdx' THEN "vC1FlagPrerequisites"."requiredVariationIdx" ELSE NULL END, CASE WHEN "vE1" ? 'prerequisiteModuleId' THEN "vC1FlagPrerequisites"."prerequisiteModuleId" ELSE NULL END)
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
END $$;
COMMENT ON FUNCTION "Platform"."featureFlagAddUpdate"(jsonb) IS 'Save (insert or update) one FeatureFlags record with its environments, prerequisites, scheduledChanges, variations.';

-- FeatureFlags: one record as JSON (camelCase keys), with lookup labels and environments, prerequisites, scheduledChanges, variations
CREATE OR REPLACE FUNCTION "Platform"."getFeatureFlagInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('flagTypeLabel', "Lookups"."getLookupLabel"('FlagType', t."flagType") ->> 'label', 'flagTypeTone', "Lookups"."getLookupLabel"('FlagType', t."flagType") ->> 'tone', 'secondaryTypeLabel', "Lookups"."getLookupLabel"('SecondaryType', t."secondaryType") ->> 'label', 'secondaryTypeTone', "Lookups"."getLookupLabel"('SecondaryType', t."secondaryType") ->> 'tone', 'categoryLabel', "Lookups"."getLookupLabel"('FeatureFlagCategory', t.category) ->> 'label', 'categoryTone', "Lookups"."getLookupLabel"('FeatureFlagCategory', t.category) ->> 'tone', 'stageLabel', "Lookups"."getLookupLabel"('FeatureFlagStage', t.stage) ->> 'label', 'stageTone', "Lookups"."getLookupLabel"('FeatureFlagStage', t.stage) ->> 'tone', 'variationKindLabel', "Lookups"."getLookupLabel"('VariationKind', t."variationKind") ->> 'label', 'variationKindTone', "Lookups"."getLookupLabel"('VariationKind', t."variationKind") ->> 'tone') ||
         jsonb_build_object('environments', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."FlagEnvironments" c1 WHERE c1."flagId" = t.id), '[]'::jsonb), 'prerequisites', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."FlagPrerequisites" c1 WHERE c1."prerequisiteFlagId" = t.id), '[]'::jsonb), 'scheduledChanges', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."FlagScheduledChanges" c1 WHERE c1."flagId" = t.id), '[]'::jsonb), 'variations', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."FlagVariations" c1 WHERE c1."flagId" = t.id), '[]'::jsonb))
    FROM "Platform"."FeatureFlags" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getFeatureFlagInfo"(uuid) IS 'Read one FeatureFlags record (getter for its screens).';

-- FlagChangeRequests: insert (no "id") or update (with "id"); child arrays: approvers, comments
CREATE OR REPLACE FUNCTION "Platform"."flagChangeRequestAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."FlagChangeRequests";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1FlagChangeRequestApprovers" "Platform"."FlagChangeRequestApprovers";
  "vC1FlagChangeRequestComments" "Platform"."FlagChangeRequestComments";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."FlagChangeRequests", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."FlagChangeRequests" ("docNo", "flagId", environment, "requesterStaffId", reason, summary, "beforeState", "afterState", patch, "applyNotBefore", source, "decisionNote", "appliedAt")
    VALUES (CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE NULL END, CASE WHEN "pData" ? 'flagId' THEN "vRec"."flagId" ELSE NULL END, CASE WHEN "pData" ? 'environment' THEN "vRec".environment ELSE 'PRODUCTION' END, CASE WHEN "pData" ? 'requesterStaffId' THEN "vRec"."requesterStaffId" ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'summary' THEN "vRec".summary ELSE NULL END, CASE WHEN "pData" ? 'beforeState' THEN "vRec"."beforeState" ELSE NULL END, CASE WHEN "pData" ? 'afterState' THEN "vRec"."afterState" ELSE NULL END, CASE WHEN "pData" ? 'patch' THEN "vRec".patch ELSE NULL END, CASE WHEN "pData" ? 'applyNotBefore' THEN "vRec"."applyNotBefore" ELSE NULL END, CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE 'MANUAL' END, CASE WHEN "pData" ? 'decisionNote' THEN "vRec"."decisionNote" ELSE NULL END, CASE WHEN "pData" ? 'appliedAt' THEN "vRec"."appliedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."FlagChangeRequests" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "flagId" = CASE WHEN "pData" ? 'flagId' THEN "vRec"."flagId" ELSE t."flagId" END,
           environment = CASE WHEN "pData" ? 'environment' THEN "vRec".environment ELSE t.environment END,
           "requesterStaffId" = CASE WHEN "pData" ? 'requesterStaffId' THEN "vRec"."requesterStaffId" ELSE t."requesterStaffId" END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           summary = CASE WHEN "pData" ? 'summary' THEN "vRec".summary ELSE t.summary END,
           "beforeState" = CASE WHEN "pData" ? 'beforeState' THEN "vRec"."beforeState" ELSE t."beforeState" END,
           "afterState" = CASE WHEN "pData" ? 'afterState' THEN "vRec"."afterState" ELSE t."afterState" END,
           patch = CASE WHEN "pData" ? 'patch' THEN "vRec".patch ELSE t.patch END,
           "applyNotBefore" = CASE WHEN "pData" ? 'applyNotBefore' THEN "vRec"."applyNotBefore" ELSE t."applyNotBefore" END,
           source = CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE t.source END,
           "decisionNote" = CASE WHEN "pData" ? 'decisionNote' THEN "vRec"."decisionNote" ELSE t."decisionNote" END,
           "appliedAt" = CASE WHEN "pData" ? 'appliedAt' THEN "vRec"."appliedAt" ELSE t."appliedAt" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."FlagChangeRequests" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'FlagChangeRequests %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'FlagChangeRequests % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'approvers' THEN
    -- approvers: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."FlagChangeRequestApprovers"
     WHERE "changeRequestId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'approvers') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'approvers') WITH ORDINALITY t(x, n) LOOP
      "vC1FlagChangeRequestApprovers" := jsonb_populate_record(NULL::"Platform"."FlagChangeRequestApprovers", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."FlagChangeRequestApprovers" t
           SET "staffUserId" = CASE WHEN "vE1" ? 'staffUserId' THEN "vC1FlagChangeRequestApprovers"."staffUserId" ELSE t."staffUserId" END,
               decision = CASE WHEN "vE1" ? 'decision' THEN "vC1FlagChangeRequestApprovers".decision ELSE t.decision END,
               "decidedAt" = CASE WHEN "vE1" ? 'decidedAt' THEN "vC1FlagChangeRequestApprovers"."decidedAt" ELSE t."decidedAt" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."changeRequestId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'FlagChangeRequestApprovers: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."FlagChangeRequestApprovers" ("changeRequestId", "staffUserId", decision, "decidedAt")
        VALUES ("vRet", CASE WHEN "vE1" ? 'staffUserId' THEN "vC1FlagChangeRequestApprovers"."staffUserId" ELSE NULL END, CASE WHEN "vE1" ? 'decision' THEN "vC1FlagChangeRequestApprovers".decision ELSE 'WAITING' END, CASE WHEN "vE1" ? 'decidedAt' THEN "vC1FlagChangeRequestApprovers"."decidedAt" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'comments' THEN
    -- comments: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."FlagChangeRequestComments"
     WHERE "changeRequestId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'comments') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'comments') WITH ORDINALITY t(x, n) LOOP
      "vC1FlagChangeRequestComments" := jsonb_populate_record(NULL::"Platform"."FlagChangeRequestComments", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."FlagChangeRequestComments" t
           SET "staffUserId" = CASE WHEN "vE1" ? 'staffUserId' THEN "vC1FlagChangeRequestComments"."staffUserId" ELSE t."staffUserId" END,
               body = CASE WHEN "vE1" ? 'body' THEN "vC1FlagChangeRequestComments".body ELSE t.body END,
               "postedAt" = CASE WHEN "vE1" ? 'postedAt' THEN "vC1FlagChangeRequestComments"."postedAt" ELSE t."postedAt" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."changeRequestId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'FlagChangeRequestComments: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."FlagChangeRequestComments" ("changeRequestId", "staffUserId", body, "postedAt")
        VALUES ("vRet", CASE WHEN "vE1" ? 'staffUserId' THEN "vC1FlagChangeRequestComments"."staffUserId" ELSE NULL END, CASE WHEN "vE1" ? 'body' THEN "vC1FlagChangeRequestComments".body ELSE NULL END, CASE WHEN "vE1" ? 'postedAt' THEN "vC1FlagChangeRequestComments"."postedAt" ELSE now() END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."flagChangeRequestAddUpdate"(jsonb) IS 'Save (insert or update) one FlagChangeRequests record with its approvers, comments.';

-- FlagChangeRequests: one record as JSON (camelCase keys), with lookup labels and approvers, comments
CREATE OR REPLACE FUNCTION "Platform"."getFlagChangeRequestInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('environmentLabel', "Lookups"."getLookupLabel"('DevStagingProductionEnvironment', t.environment) ->> 'label', 'environmentTone', "Lookups"."getLookupLabel"('DevStagingProductionEnvironment', t.environment) ->> 'tone', 'sourceLabel', "Lookups"."getLookupLabel"('FlagChangeRequestSource', t.source) ->> 'label', 'sourceTone', "Lookups"."getLookupLabel"('FlagChangeRequestSource', t.source) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('LeaveRequestStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('LeaveRequestStatus', t.status) ->> 'tone') ||
         jsonb_build_object('approvers', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."FlagChangeRequestApprovers" c1 WHERE c1."changeRequestId" = t.id), '[]'::jsonb), 'comments', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."FlagChangeRequestComments" c1 WHERE c1."changeRequestId" = t.id), '[]'::jsonb))
    FROM "Platform"."FlagChangeRequests" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getFlagChangeRequestInfo"(uuid) IS 'Read one FlagChangeRequests record (getter for its screens).';

-- FlagChangeRequests: Approve (status -> APPROVED); allowed from PENDING
CREATE OR REPLACE FUNCTION "Platform"."flagChangeRequestApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Platform"."FlagChangeRequests";
BEGIN
  SELECT * INTO "vRow" FROM "Platform"."FlagChangeRequests" t WHERE t.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FlagChangeRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING') THEN
    RAISE EXCEPTION 'FlagChangeRequests %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'FlagChangeRequests: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Platform"."flagChangeRequestApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Platform"."flagChangeRequestApproveEntries"') USING "pId";
  END IF;
  UPDATE "Platform"."FlagChangeRequests" t SET status = 'APPROVED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- FlagChangeRequests: Cancel (status -> CANCELLED); allowed from PENDING, APPROVED, REJECTED
CREATE OR REPLACE FUNCTION "Platform"."flagChangeRequestCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Platform"."FlagChangeRequests";
BEGIN
  SELECT * INTO "vRow" FROM "Platform"."FlagChangeRequests" t WHERE t.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FlagChangeRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING', 'APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'FlagChangeRequests %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Platform"."flagChangeRequestCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Platform"."flagChangeRequestCancelEntries"') USING "pId";
  END IF;
  UPDATE "Platform"."FlagChangeRequests" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- FlagSdkKeys: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."flagSdkKeyAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."FlagSdkKeys";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."FlagSdkKeys", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."FlagSdkKeys" (environment, kind, "keyPrefix", "keyHash", "clientId", "keyLast4", status, "validUntil", "rotatedFromId", "rotatedByStaffId")
    VALUES (CASE WHEN "pData" ? 'environment' THEN "vRec".environment ELSE NULL END, CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE NULL END, CASE WHEN "pData" ? 'keyPrefix' THEN "vRec"."keyPrefix" ELSE NULL END, CASE WHEN "pData" ? 'keyHash' THEN "vRec"."keyHash" ELSE NULL END, CASE WHEN "pData" ? 'clientId' THEN "vRec"."clientId" ELSE NULL END, CASE WHEN "pData" ? 'keyLast4' THEN "vRec"."keyLast4" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'validUntil' THEN "vRec"."validUntil" ELSE NULL END, CASE WHEN "pData" ? 'rotatedFromId' THEN "vRec"."rotatedFromId" ELSE NULL END, CASE WHEN "pData" ? 'rotatedByStaffId' THEN "vRec"."rotatedByStaffId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."FlagSdkKeys" t
       SET environment = CASE WHEN "pData" ? 'environment' THEN "vRec".environment ELSE t.environment END,
           kind = CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE t.kind END,
           "keyPrefix" = CASE WHEN "pData" ? 'keyPrefix' THEN "vRec"."keyPrefix" ELSE t."keyPrefix" END,
           "keyHash" = CASE WHEN "pData" ? 'keyHash' THEN "vRec"."keyHash" ELSE t."keyHash" END,
           "clientId" = CASE WHEN "pData" ? 'clientId' THEN "vRec"."clientId" ELSE t."clientId" END,
           "keyLast4" = CASE WHEN "pData" ? 'keyLast4' THEN "vRec"."keyLast4" ELSE t."keyLast4" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "validUntil" = CASE WHEN "pData" ? 'validUntil' THEN "vRec"."validUntil" ELSE t."validUntil" END,
           "rotatedFromId" = CASE WHEN "pData" ? 'rotatedFromId' THEN "vRec"."rotatedFromId" ELSE t."rotatedFromId" END,
           "rotatedByStaffId" = CASE WHEN "pData" ? 'rotatedByStaffId' THEN "vRec"."rotatedByStaffId" ELSE t."rotatedByStaffId" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."FlagSdkKeys" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'FlagSdkKeys %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'FlagSdkKeys % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."flagSdkKeyAddUpdate"(jsonb) IS 'Save (insert or update) one FlagSdkKeys record.';

-- FlagSdkKeys: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getFlagSdkKeyInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t) - 'keyHash') ||
         jsonb_build_object('environmentLabel', "Lookups"."getLookupLabel"('DevStagingProductionEnvironment', t.environment) ->> 'label', 'environmentTone', "Lookups"."getLookupLabel"('DevStagingProductionEnvironment', t.environment) ->> 'tone', 'kindLabel', "Lookups"."getLookupLabel"('FlagSdkKeyKind', t.kind) ->> 'label', 'kindTone', "Lookups"."getLookupLabel"('FlagSdkKeyKind', t.kind) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('FlagSdkKeyStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('FlagSdkKeyStatus', t.status) ->> 'tone')
    FROM "Platform"."FlagSdkKeys" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getFlagSdkKeyInfo"(uuid) IS 'Read one FlagSdkKeys record (getter for its screens).';

-- SupportTickets: insert (no "id") or update (with "id"); child arrays: messages
CREATE OR REPLACE FUNCTION "Platform"."supportTicketAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Platform"."SupportTickets";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1SupportTicketMessages" "Platform"."SupportTicketMessages";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."SupportTickets", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."SupportTickets" ("tenantId", "docNo", subject, category, priority, channel, "requesterUserId", "requesterName", "requesterRole", "requesterEmail", "assigneeStaffId", "openedAt", "firstResponseAt", "slaDueAt", "resolvedAt", "closedAt", "csatRating", "csatComment")
    VALUES ("vTenant", CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE NULL END, CASE WHEN "pData" ? 'subject' THEN "vRec".subject ELSE NULL END, CASE WHEN "pData" ? 'category' THEN "vRec".category ELSE 'GENERAL' END, CASE WHEN "pData" ? 'priority' THEN "vRec".priority ELSE 'NORMAL' END, CASE WHEN "pData" ? 'channel' THEN "vRec".channel ELSE 'PORTAL' END, CASE WHEN "pData" ? 'requesterUserId' THEN "vRec"."requesterUserId" ELSE NULL END, CASE WHEN "pData" ? 'requesterName' THEN "vRec"."requesterName" ELSE NULL END, CASE WHEN "pData" ? 'requesterRole' THEN "vRec"."requesterRole" ELSE NULL END, CASE WHEN "pData" ? 'requesterEmail' THEN "vRec"."requesterEmail" ELSE NULL END, CASE WHEN "pData" ? 'assigneeStaffId' THEN "vRec"."assigneeStaffId" ELSE NULL END, CASE WHEN "pData" ? 'openedAt' THEN "vRec"."openedAt" ELSE now() END, CASE WHEN "pData" ? 'firstResponseAt' THEN "vRec"."firstResponseAt" ELSE NULL END, CASE WHEN "pData" ? 'slaDueAt' THEN "vRec"."slaDueAt" ELSE NULL END, CASE WHEN "pData" ? 'resolvedAt' THEN "vRec"."resolvedAt" ELSE NULL END, CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE NULL END, CASE WHEN "pData" ? 'csatRating' THEN "vRec"."csatRating" ELSE NULL END, CASE WHEN "pData" ? 'csatComment' THEN "vRec"."csatComment" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."SupportTickets" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           subject = CASE WHEN "pData" ? 'subject' THEN "vRec".subject ELSE t.subject END,
           category = CASE WHEN "pData" ? 'category' THEN "vRec".category ELSE t.category END,
           priority = CASE WHEN "pData" ? 'priority' THEN "vRec".priority ELSE t.priority END,
           channel = CASE WHEN "pData" ? 'channel' THEN "vRec".channel ELSE t.channel END,
           "requesterUserId" = CASE WHEN "pData" ? 'requesterUserId' THEN "vRec"."requesterUserId" ELSE t."requesterUserId" END,
           "requesterName" = CASE WHEN "pData" ? 'requesterName' THEN "vRec"."requesterName" ELSE t."requesterName" END,
           "requesterRole" = CASE WHEN "pData" ? 'requesterRole' THEN "vRec"."requesterRole" ELSE t."requesterRole" END,
           "requesterEmail" = CASE WHEN "pData" ? 'requesterEmail' THEN "vRec"."requesterEmail" ELSE t."requesterEmail" END,
           "assigneeStaffId" = CASE WHEN "pData" ? 'assigneeStaffId' THEN "vRec"."assigneeStaffId" ELSE t."assigneeStaffId" END,
           "openedAt" = CASE WHEN "pData" ? 'openedAt' THEN "vRec"."openedAt" ELSE t."openedAt" END,
           "firstResponseAt" = CASE WHEN "pData" ? 'firstResponseAt' THEN "vRec"."firstResponseAt" ELSE t."firstResponseAt" END,
           "slaDueAt" = CASE WHEN "pData" ? 'slaDueAt' THEN "vRec"."slaDueAt" ELSE t."slaDueAt" END,
           "resolvedAt" = CASE WHEN "pData" ? 'resolvedAt' THEN "vRec"."resolvedAt" ELSE t."resolvedAt" END,
           "closedAt" = CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE t."closedAt" END,
           "csatRating" = CASE WHEN "pData" ? 'csatRating' THEN "vRec"."csatRating" ELSE t."csatRating" END,
           "csatComment" = CASE WHEN "pData" ? 'csatComment' THEN "vRec"."csatComment" ELSE t."csatComment" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."SupportTickets" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'SupportTickets %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SupportTickets % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'messages' THEN
    -- messages: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."SupportTicketMessages"
     WHERE "ticketId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'messages') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'messages') WITH ORDINALITY t(x, n) LOOP
      "vC1SupportTicketMessages" := jsonb_populate_record(NULL::"Platform"."SupportTicketMessages", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."SupportTicketMessages" t
           SET "authorKind" = CASE WHEN "vE1" ? 'authorKind' THEN "vC1SupportTicketMessages"."authorKind" ELSE t."authorKind" END,
               "authorStaffId" = CASE WHEN "vE1" ? 'authorStaffId' THEN "vC1SupportTicketMessages"."authorStaffId" ELSE t."authorStaffId" END,
               "authorUserId" = CASE WHEN "vE1" ? 'authorUserId' THEN "vC1SupportTicketMessages"."authorUserId" ELSE t."authorUserId" END,
               "authorName" = CASE WHEN "vE1" ? 'authorName' THEN "vC1SupportTicketMessages"."authorName" ELSE t."authorName" END,
               body = CASE WHEN "vE1" ? 'body' THEN "vC1SupportTicketMessages".body ELSE t.body END,
               "isInternalNote" = CASE WHEN "vE1" ? 'isInternalNote' THEN "vC1SupportTicketMessages"."isInternalNote" ELSE t."isInternalNote" END,
               attachments = CASE WHEN "vE1" ? 'attachments' THEN "vC1SupportTicketMessages".attachments ELSE t.attachments END,
               "postedAt" = CASE WHEN "vE1" ? 'postedAt' THEN "vC1SupportTicketMessages"."postedAt" ELSE t."postedAt" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."ticketId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SupportTicketMessages: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."SupportTicketMessages" ("ticketId", "authorKind", "authorStaffId", "authorUserId", "authorName", body, "isInternalNote", attachments, "postedAt")
        VALUES ("vRet", CASE WHEN "vE1" ? 'authorKind' THEN "vC1SupportTicketMessages"."authorKind" ELSE NULL END, CASE WHEN "vE1" ? 'authorStaffId' THEN "vC1SupportTicketMessages"."authorStaffId" ELSE NULL END, CASE WHEN "vE1" ? 'authorUserId' THEN "vC1SupportTicketMessages"."authorUserId" ELSE NULL END, CASE WHEN "vE1" ? 'authorName' THEN "vC1SupportTicketMessages"."authorName" ELSE NULL END, CASE WHEN "vE1" ? 'body' THEN "vC1SupportTicketMessages".body ELSE NULL END, CASE WHEN "vE1" ? 'isInternalNote' THEN "vC1SupportTicketMessages"."isInternalNote" ELSE FALSE END, CASE WHEN "vE1" ? 'attachments' THEN "vC1SupportTicketMessages".attachments ELSE '[]' END, CASE WHEN "vE1" ? 'postedAt' THEN "vC1SupportTicketMessages"."postedAt" ELSE now() END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."supportTicketAddUpdate"(jsonb) IS 'Save (insert or update) one SupportTickets record with its messages.';

-- SupportTickets: one record as JSON (camelCase keys), with lookup labels and messages
CREATE OR REPLACE FUNCTION "Platform"."getSupportTicketInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('categoryLabel', "Lookups"."getLookupLabel"('SupportTicketCategory', t.category) ->> 'label', 'categoryTone', "Lookups"."getLookupLabel"('SupportTicketCategory', t.category) ->> 'tone', 'priorityLabel', "Lookups"."getLookupLabel"('SupportTicketPriority', t.priority) ->> 'label', 'priorityTone', "Lookups"."getLookupLabel"('SupportTicketPriority', t.priority) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('SupportTicketStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('SupportTicketStatus', t.status) ->> 'tone', 'channelLabel', "Lookups"."getLookupLabel"('SupportTicketChannel', t.channel) ->> 'label', 'channelTone', "Lookups"."getLookupLabel"('SupportTicketChannel', t.channel) ->> 'tone') ||
         jsonb_build_object('messages', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."SupportTicketMessages" c1 WHERE c1."ticketId" = t.id), '[]'::jsonb))
    FROM "Platform"."SupportTickets" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getSupportTicketInfo"(uuid) IS 'Read one SupportTickets record (getter for its screens).';

-- MaintenanceWindows: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."maintenanceWindowAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."MaintenanceWindows";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."MaintenanceWindows", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."MaintenanceWindows" (title, message, "startsAt", "endsAt", components, "bannerLeadHours", "readOnlyMode", status)
    VALUES (CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE 'Planned maintenance' END, CASE WHEN "pData" ? 'message' THEN "vRec".message ELSE NULL END, CASE WHEN "pData" ? 'startsAt' THEN "vRec"."startsAt" ELSE NULL END, CASE WHEN "pData" ? 'endsAt' THEN "vRec"."endsAt" ELSE NULL END, CASE WHEN "pData" ? 'components' THEN "vRec".components ELSE NULL END, CASE WHEN "pData" ? 'bannerLeadHours' THEN "vRec"."bannerLeadHours" ELSE 72 END, CASE WHEN "pData" ? 'readOnlyMode' THEN "vRec"."readOnlyMode" ELSE FALSE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'SCHEDULED' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."MaintenanceWindows" t
       SET title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
           message = CASE WHEN "pData" ? 'message' THEN "vRec".message ELSE t.message END,
           "startsAt" = CASE WHEN "pData" ? 'startsAt' THEN "vRec"."startsAt" ELSE t."startsAt" END,
           "endsAt" = CASE WHEN "pData" ? 'endsAt' THEN "vRec"."endsAt" ELSE t."endsAt" END,
           components = CASE WHEN "pData" ? 'components' THEN "vRec".components ELSE t.components END,
           "bannerLeadHours" = CASE WHEN "pData" ? 'bannerLeadHours' THEN "vRec"."bannerLeadHours" ELSE t."bannerLeadHours" END,
           "readOnlyMode" = CASE WHEN "pData" ? 'readOnlyMode' THEN "vRec"."readOnlyMode" ELSE t."readOnlyMode" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."MaintenanceWindows" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'MaintenanceWindows %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'MaintenanceWindows % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."maintenanceWindowAddUpdate"(jsonb) IS 'Save (insert or update) one MaintenanceWindows record.';

-- MaintenanceWindows: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getMaintenanceWindowInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('MaintenanceWindowStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('MaintenanceWindowStatus', t.status) ->> 'tone')
    FROM "Platform"."MaintenanceWindows" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getMaintenanceWindowInfo"(uuid) IS 'Read one MaintenanceWindows record (getter for its screens).';

-- Announcements: insert (no "id") or update (with "id"); child arrays: targets
CREATE OR REPLACE FUNCTION "Platform"."announcementAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."Announcements";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1AnnouncementTargets" "Platform"."AnnouncementTargets";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."Announcements", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."Announcements" ("announcementType", severity, "releaseLabel", title, message, audience, "publishAt", status, "showBanner", "emailAdmins", "viewCount", "clickCount", "maintenanceWindowId")
    VALUES (CASE WHEN "pData" ? 'announcementType' THEN "vRec"."announcementType" ELSE NULL END, CASE WHEN "pData" ? 'severity' THEN "vRec".severity ELSE 'INFO' END, CASE WHEN "pData" ? 'releaseLabel' THEN "vRec"."releaseLabel" ELSE NULL END, CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE NULL END, CASE WHEN "pData" ? 'message' THEN "vRec".message ELSE NULL END, CASE WHEN "pData" ? 'audience' THEN "vRec".audience ELSE 'ALL' END, CASE WHEN "pData" ? 'publishAt' THEN "vRec"."publishAt" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'DRAFT' END, CASE WHEN "pData" ? 'showBanner' THEN "vRec"."showBanner" ELSE TRUE END, CASE WHEN "pData" ? 'emailAdmins' THEN "vRec"."emailAdmins" ELSE TRUE END, CASE WHEN "pData" ? 'viewCount' THEN "vRec"."viewCount" ELSE 0 END, CASE WHEN "pData" ? 'clickCount' THEN "vRec"."clickCount" ELSE 0 END, CASE WHEN "pData" ? 'maintenanceWindowId' THEN "vRec"."maintenanceWindowId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."Announcements" t
       SET "announcementType" = CASE WHEN "pData" ? 'announcementType' THEN "vRec"."announcementType" ELSE t."announcementType" END,
           severity = CASE WHEN "pData" ? 'severity' THEN "vRec".severity ELSE t.severity END,
           "releaseLabel" = CASE WHEN "pData" ? 'releaseLabel' THEN "vRec"."releaseLabel" ELSE t."releaseLabel" END,
           title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
           message = CASE WHEN "pData" ? 'message' THEN "vRec".message ELSE t.message END,
           audience = CASE WHEN "pData" ? 'audience' THEN "vRec".audience ELSE t.audience END,
           "publishAt" = CASE WHEN "pData" ? 'publishAt' THEN "vRec"."publishAt" ELSE t."publishAt" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "showBanner" = CASE WHEN "pData" ? 'showBanner' THEN "vRec"."showBanner" ELSE t."showBanner" END,
           "emailAdmins" = CASE WHEN "pData" ? 'emailAdmins' THEN "vRec"."emailAdmins" ELSE t."emailAdmins" END,
           "viewCount" = CASE WHEN "pData" ? 'viewCount' THEN "vRec"."viewCount" ELSE t."viewCount" END,
           "clickCount" = CASE WHEN "pData" ? 'clickCount' THEN "vRec"."clickCount" ELSE t."clickCount" END,
           "maintenanceWindowId" = CASE WHEN "pData" ? 'maintenanceWindowId' THEN "vRec"."maintenanceWindowId" ELSE t."maintenanceWindowId" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."Announcements" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'Announcements %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Announcements % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'targets' THEN
    -- targets: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."AnnouncementTargets"
     WHERE "tenantId" = "vTenant" AND "announcementId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'targets') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'targets') WITH ORDINALITY t(x, n) LOOP
      "vC1AnnouncementTargets" := jsonb_populate_record(NULL::"Platform"."AnnouncementTargets", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."AnnouncementTargets" t
           SET "planId" = CASE WHEN "vE1" ? 'planId' THEN "vC1AnnouncementTargets"."planId" ELSE t."planId" END,
               "moduleKey" = CASE WHEN "vE1" ? 'moduleKey' THEN "vC1AnnouncementTargets"."moduleKey" ELSE t."moduleKey" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."announcementId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'AnnouncementTargets: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."AnnouncementTargets" ("announcementId", "tenantId", "planId", "moduleKey")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'planId' THEN "vC1AnnouncementTargets"."planId" ELSE NULL END, CASE WHEN "vE1" ? 'moduleKey' THEN "vC1AnnouncementTargets"."moduleKey" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."announcementAddUpdate"(jsonb) IS 'Save (insert or update) one Announcements record with its targets.';

-- Announcements: one record as JSON (camelCase keys), with lookup labels and targets
CREATE OR REPLACE FUNCTION "Platform"."getAnnouncementInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('announcementTypeLabel', "Lookups"."getLookupLabel"('AnnouncementType', t."announcementType") ->> 'label', 'announcementTypeTone', "Lookups"."getLookupLabel"('AnnouncementType', t."announcementType") ->> 'tone', 'severityLabel', "Lookups"."getLookupLabel"('AnnouncementSeverity', t.severity) ->> 'label', 'severityTone', "Lookups"."getLookupLabel"('AnnouncementSeverity', t.severity) ->> 'tone', 'audienceLabel', "Lookups"."getLookupLabel"('AnnouncementAudience', t.audience) ->> 'label', 'audienceTone', "Lookups"."getLookupLabel"('AnnouncementAudience', t.audience) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('AnnouncementStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('AnnouncementStatus', t.status) ->> 'tone') ||
         jsonb_build_object('targets', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."AnnouncementTargets" c1 WHERE c1."announcementId" = t.id), '[]'::jsonb))
    FROM "Platform"."Announcements" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getAnnouncementInfo"(uuid) IS 'Read one Announcements record (getter for its screens).';

-- CommunicationTemplates: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."communicationTemplateAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."CommunicationTemplates";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."CommunicationTemplates", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."CommunicationTemplates" (code, name, icon, channels, "subjectEn", "bodyEn", "subjectUr", "bodyUr", version, "isActive")
    VALUES (CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE NULL END, CASE WHEN "pData" ? 'channels' THEN "vRec".channels ELSE NULL END, CASE WHEN "pData" ? 'subjectEn' THEN "vRec"."subjectEn" ELSE NULL END, CASE WHEN "pData" ? 'bodyEn' THEN "vRec"."bodyEn" ELSE NULL END, CASE WHEN "pData" ? 'subjectUr' THEN "vRec"."subjectUr" ELSE NULL END, CASE WHEN "pData" ? 'bodyUr' THEN "vRec"."bodyUr" ELSE NULL END, CASE WHEN "pData" ? 'version' THEN "vRec".version ELSE 1 END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."CommunicationTemplates" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END,
           channels = CASE WHEN "pData" ? 'channels' THEN "vRec".channels ELSE t.channels END,
           "subjectEn" = CASE WHEN "pData" ? 'subjectEn' THEN "vRec"."subjectEn" ELSE t."subjectEn" END,
           "bodyEn" = CASE WHEN "pData" ? 'bodyEn' THEN "vRec"."bodyEn" ELSE t."bodyEn" END,
           "subjectUr" = CASE WHEN "pData" ? 'subjectUr' THEN "vRec"."subjectUr" ELSE t."subjectUr" END,
           "bodyUr" = CASE WHEN "pData" ? 'bodyUr' THEN "vRec"."bodyUr" ELSE t."bodyUr" END,
           version = CASE WHEN "pData" ? 'version' THEN "vRec".version ELSE t.version END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."CommunicationTemplates" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'CommunicationTemplates %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CommunicationTemplates % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."communicationTemplateAddUpdate"(jsonb) IS 'Save (insert or update) one CommunicationTemplates record.';

-- CommunicationTemplates: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getCommunicationTemplateInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "Platform"."CommunicationTemplates" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getCommunicationTemplateInfo"(uuid) IS 'Read one CommunicationTemplates record (getter for its screens).';

-- TenantBroadcasts: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."tenantBroadcastAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."TenantBroadcasts";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."TenantBroadcasts", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."TenantBroadcasts" ("commTemplateId", audience, "audienceValue", "segmentId", "tenantIds", "languageMode", channels, "messageOverride", "scheduledAt", status, "recipientsCount", "estimatedSmsCost", "sentByStaffId")
    VALUES (CASE WHEN "pData" ? 'commTemplateId' THEN "vRec"."commTemplateId" ELSE NULL END, CASE WHEN "pData" ? 'audience' THEN "vRec".audience ELSE NULL END, CASE WHEN "pData" ? 'audienceValue' THEN "vRec"."audienceValue" ELSE NULL END, CASE WHEN "pData" ? 'segmentId' THEN "vRec"."segmentId" ELSE NULL END, CASE WHEN "pData" ? 'tenantIds' THEN "vRec"."tenantIds" ELSE NULL END, CASE WHEN "pData" ? 'languageMode' THEN "vRec"."languageMode" ELSE 'TENANT_PREFERENCE' END, CASE WHEN "pData" ? 'channels' THEN "vRec".channels ELSE NULL END, CASE WHEN "pData" ? 'messageOverride' THEN "vRec"."messageOverride" ELSE NULL END, CASE WHEN "pData" ? 'scheduledAt' THEN "vRec"."scheduledAt" ELSE now() END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'SCHEDULED' END, CASE WHEN "pData" ? 'recipientsCount' THEN "vRec"."recipientsCount" ELSE NULL END, CASE WHEN "pData" ? 'estimatedSmsCost' THEN "vRec"."estimatedSmsCost" ELSE NULL END, CASE WHEN "pData" ? 'sentByStaffId' THEN "vRec"."sentByStaffId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."TenantBroadcasts" t
       SET "commTemplateId" = CASE WHEN "pData" ? 'commTemplateId' THEN "vRec"."commTemplateId" ELSE t."commTemplateId" END,
           audience = CASE WHEN "pData" ? 'audience' THEN "vRec".audience ELSE t.audience END,
           "audienceValue" = CASE WHEN "pData" ? 'audienceValue' THEN "vRec"."audienceValue" ELSE t."audienceValue" END,
           "segmentId" = CASE WHEN "pData" ? 'segmentId' THEN "vRec"."segmentId" ELSE t."segmentId" END,
           "tenantIds" = CASE WHEN "pData" ? 'tenantIds' THEN "vRec"."tenantIds" ELSE t."tenantIds" END,
           "languageMode" = CASE WHEN "pData" ? 'languageMode' THEN "vRec"."languageMode" ELSE t."languageMode" END,
           channels = CASE WHEN "pData" ? 'channels' THEN "vRec".channels ELSE t.channels END,
           "messageOverride" = CASE WHEN "pData" ? 'messageOverride' THEN "vRec"."messageOverride" ELSE t."messageOverride" END,
           "scheduledAt" = CASE WHEN "pData" ? 'scheduledAt' THEN "vRec"."scheduledAt" ELSE t."scheduledAt" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "recipientsCount" = CASE WHEN "pData" ? 'recipientsCount' THEN "vRec"."recipientsCount" ELSE t."recipientsCount" END,
           "estimatedSmsCost" = CASE WHEN "pData" ? 'estimatedSmsCost' THEN "vRec"."estimatedSmsCost" ELSE t."estimatedSmsCost" END,
           "sentByStaffId" = CASE WHEN "pData" ? 'sentByStaffId' THEN "vRec"."sentByStaffId" ELSE t."sentByStaffId" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."TenantBroadcasts" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'TenantBroadcasts %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'TenantBroadcasts % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."tenantBroadcastAddUpdate"(jsonb) IS 'Save (insert or update) one TenantBroadcasts record.';

-- TenantBroadcasts: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getTenantBroadcastInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('audienceLabel', "Lookups"."getLookupLabel"('TenantBroadcastAudience', t.audience) ->> 'label', 'audienceTone', "Lookups"."getLookupLabel"('TenantBroadcastAudience', t.audience) ->> 'tone', 'languageModeLabel', "Lookups"."getLookupLabel"('LanguageMode', t."languageMode") ->> 'label', 'languageModeTone', "Lookups"."getLookupLabel"('LanguageMode', t."languageMode") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('TenantBroadcastStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('TenantBroadcastStatus', t.status) ->> 'tone')
    FROM "Platform"."TenantBroadcasts" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getTenantBroadcastInfo"(uuid) IS 'Read one TenantBroadcasts record (getter for its screens).';

-- PrivacyRequests: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."privacyRequestAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Platform"."PrivacyRequests";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."PrivacyRequests", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."PrivacyRequests" ("tenantId", "docNo", "requestType", "requestedByName", "requestedByRole", "requesterEmail", "receivedOn", "dueOn", step, "verifiedByStaffId", "verifiedAt", "approver1StaffId", "approved1At", "approver2StaffId", "approved2At", "rejectedReason", "rejectedAt", "completedAt", "certificateRef", "exportBackupRunId", "exportLinkExpiresAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE NULL END, CASE WHEN "pData" ? 'requestType' THEN "vRec"."requestType" ELSE NULL END, CASE WHEN "pData" ? 'requestedByName' THEN "vRec"."requestedByName" ELSE NULL END, CASE WHEN "pData" ? 'requestedByRole' THEN "vRec"."requestedByRole" ELSE NULL END, CASE WHEN "pData" ? 'requesterEmail' THEN "vRec"."requesterEmail" ELSE NULL END, CASE WHEN "pData" ? 'receivedOn' THEN "vRec"."receivedOn" ELSE NULL END, CASE WHEN "pData" ? 'dueOn' THEN "vRec"."dueOn" ELSE NULL END, CASE WHEN "pData" ? 'step' THEN "vRec".step ELSE 'RECEIVED' END, CASE WHEN "pData" ? 'verifiedByStaffId' THEN "vRec"."verifiedByStaffId" ELSE NULL END, CASE WHEN "pData" ? 'verifiedAt' THEN "vRec"."verifiedAt" ELSE NULL END, CASE WHEN "pData" ? 'approver1StaffId' THEN "vRec"."approver1StaffId" ELSE NULL END, CASE WHEN "pData" ? 'approved1At' THEN "vRec"."approved1At" ELSE NULL END, CASE WHEN "pData" ? 'approver2StaffId' THEN "vRec"."approver2StaffId" ELSE NULL END, CASE WHEN "pData" ? 'approved2At' THEN "vRec"."approved2At" ELSE NULL END, CASE WHEN "pData" ? 'rejectedReason' THEN "vRec"."rejectedReason" ELSE NULL END, CASE WHEN "pData" ? 'rejectedAt' THEN "vRec"."rejectedAt" ELSE NULL END, CASE WHEN "pData" ? 'completedAt' THEN "vRec"."completedAt" ELSE NULL END, CASE WHEN "pData" ? 'certificateRef' THEN "vRec"."certificateRef" ELSE NULL END, CASE WHEN "pData" ? 'exportBackupRunId' THEN "vRec"."exportBackupRunId" ELSE NULL END, CASE WHEN "pData" ? 'exportLinkExpiresAt' THEN "vRec"."exportLinkExpiresAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."PrivacyRequests" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "requestType" = CASE WHEN "pData" ? 'requestType' THEN "vRec"."requestType" ELSE t."requestType" END,
           "requestedByName" = CASE WHEN "pData" ? 'requestedByName' THEN "vRec"."requestedByName" ELSE t."requestedByName" END,
           "requestedByRole" = CASE WHEN "pData" ? 'requestedByRole' THEN "vRec"."requestedByRole" ELSE t."requestedByRole" END,
           "requesterEmail" = CASE WHEN "pData" ? 'requesterEmail' THEN "vRec"."requesterEmail" ELSE t."requesterEmail" END,
           "receivedOn" = CASE WHEN "pData" ? 'receivedOn' THEN "vRec"."receivedOn" ELSE t."receivedOn" END,
           "dueOn" = CASE WHEN "pData" ? 'dueOn' THEN "vRec"."dueOn" ELSE t."dueOn" END,
           step = CASE WHEN "pData" ? 'step' THEN "vRec".step ELSE t.step END,
           "verifiedByStaffId" = CASE WHEN "pData" ? 'verifiedByStaffId' THEN "vRec"."verifiedByStaffId" ELSE t."verifiedByStaffId" END,
           "verifiedAt" = CASE WHEN "pData" ? 'verifiedAt' THEN "vRec"."verifiedAt" ELSE t."verifiedAt" END,
           "approver1StaffId" = CASE WHEN "pData" ? 'approver1StaffId' THEN "vRec"."approver1StaffId" ELSE t."approver1StaffId" END,
           "approved1At" = CASE WHEN "pData" ? 'approved1At' THEN "vRec"."approved1At" ELSE t."approved1At" END,
           "approver2StaffId" = CASE WHEN "pData" ? 'approver2StaffId' THEN "vRec"."approver2StaffId" ELSE t."approver2StaffId" END,
           "approved2At" = CASE WHEN "pData" ? 'approved2At' THEN "vRec"."approved2At" ELSE t."approved2At" END,
           "rejectedReason" = CASE WHEN "pData" ? 'rejectedReason' THEN "vRec"."rejectedReason" ELSE t."rejectedReason" END,
           "rejectedAt" = CASE WHEN "pData" ? 'rejectedAt' THEN "vRec"."rejectedAt" ELSE t."rejectedAt" END,
           "completedAt" = CASE WHEN "pData" ? 'completedAt' THEN "vRec"."completedAt" ELSE t."completedAt" END,
           "certificateRef" = CASE WHEN "pData" ? 'certificateRef' THEN "vRec"."certificateRef" ELSE t."certificateRef" END,
           "exportBackupRunId" = CASE WHEN "pData" ? 'exportBackupRunId' THEN "vRec"."exportBackupRunId" ELSE t."exportBackupRunId" END,
           "exportLinkExpiresAt" = CASE WHEN "pData" ? 'exportLinkExpiresAt' THEN "vRec"."exportLinkExpiresAt" ELSE t."exportLinkExpiresAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."PrivacyRequests" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PrivacyRequests %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PrivacyRequests % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."privacyRequestAddUpdate"(jsonb) IS 'Save (insert or update) one PrivacyRequests record.';

-- PrivacyRequests: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getPrivacyRequestInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('requestTypeLabel', "Lookups"."getLookupLabel"('PrivacyRequestType', t."requestType") ->> 'label', 'requestTypeTone', "Lookups"."getLookupLabel"('PrivacyRequestType', t."requestType") ->> 'tone', 'stepLabel', "Lookups"."getLookupLabel"('Step', t.step) ->> 'label', 'stepTone', "Lookups"."getLookupLabel"('Step', t.step) ->> 'tone')
    FROM "Platform"."PrivacyRequests" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getPrivacyRequestInfo"(uuid) IS 'Read one PrivacyRequests record (getter for its screens).';

-- ServiceIncidents: insert (no "id") or update (with "id"); child arrays: updates
CREATE OR REPLACE FUNCTION "Platform"."serviceIncidentAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."ServiceIncidents";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1ServiceIncidentUpdates" "Platform"."ServiceIncidentUpdates";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."ServiceIncidents", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."ServiceIncidents" ("docNo", title, impact, components, stage, "startedAt", "resolvedAt", "isPublic", "declaredByStaffId", "postmortemDueOn", "postmortemRef")
    VALUES (CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE NULL END, CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE NULL END, CASE WHEN "pData" ? 'impact' THEN "vRec".impact ELSE NULL END, CASE WHEN "pData" ? 'components' THEN "vRec".components ELSE NULL END, CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE 'INVESTIGATING' END, CASE WHEN "pData" ? 'startedAt' THEN "vRec"."startedAt" ELSE now() END, CASE WHEN "pData" ? 'resolvedAt' THEN "vRec"."resolvedAt" ELSE NULL END, CASE WHEN "pData" ? 'isPublic' THEN "vRec"."isPublic" ELSE TRUE END, CASE WHEN "pData" ? 'declaredByStaffId' THEN "vRec"."declaredByStaffId" ELSE NULL END, CASE WHEN "pData" ? 'postmortemDueOn' THEN "vRec"."postmortemDueOn" ELSE NULL END, CASE WHEN "pData" ? 'postmortemRef' THEN "vRec"."postmortemRef" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."ServiceIncidents" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
           impact = CASE WHEN "pData" ? 'impact' THEN "vRec".impact ELSE t.impact END,
           components = CASE WHEN "pData" ? 'components' THEN "vRec".components ELSE t.components END,
           stage = CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE t.stage END,
           "startedAt" = CASE WHEN "pData" ? 'startedAt' THEN "vRec"."startedAt" ELSE t."startedAt" END,
           "resolvedAt" = CASE WHEN "pData" ? 'resolvedAt' THEN "vRec"."resolvedAt" ELSE t."resolvedAt" END,
           "isPublic" = CASE WHEN "pData" ? 'isPublic' THEN "vRec"."isPublic" ELSE t."isPublic" END,
           "declaredByStaffId" = CASE WHEN "pData" ? 'declaredByStaffId' THEN "vRec"."declaredByStaffId" ELSE t."declaredByStaffId" END,
           "postmortemDueOn" = CASE WHEN "pData" ? 'postmortemDueOn' THEN "vRec"."postmortemDueOn" ELSE t."postmortemDueOn" END,
           "postmortemRef" = CASE WHEN "pData" ? 'postmortemRef' THEN "vRec"."postmortemRef" ELSE t."postmortemRef" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."ServiceIncidents" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'ServiceIncidents %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ServiceIncidents % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'updates' THEN
    -- updates: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."ServiceIncidentUpdates"
     WHERE "incidentId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'updates') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'updates') WITH ORDINALITY t(x, n) LOOP
      "vC1ServiceIncidentUpdates" := jsonb_populate_record(NULL::"Platform"."ServiceIncidentUpdates", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."ServiceIncidentUpdates" t
           SET stage = CASE WHEN "vE1" ? 'stage' THEN "vC1ServiceIncidentUpdates".stage ELSE t.stage END,
               message = CASE WHEN "vE1" ? 'message' THEN "vC1ServiceIncidentUpdates".message ELSE t.message END,
               "postedAt" = CASE WHEN "vE1" ? 'postedAt' THEN "vC1ServiceIncidentUpdates"."postedAt" ELSE t."postedAt" END,
               "postedByStaffId" = CASE WHEN "vE1" ? 'postedByStaffId' THEN "vC1ServiceIncidentUpdates"."postedByStaffId" ELSE t."postedByStaffId" END,
               "notifySubscribers" = CASE WHEN "vE1" ? 'notifySubscribers' THEN "vC1ServiceIncidentUpdates"."notifySubscribers" ELSE t."notifySubscribers" END,
               "updateBanner" = CASE WHEN "vE1" ? 'updateBanner' THEN "vC1ServiceIncidentUpdates"."updateBanner" ELSE t."updateBanner" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."incidentId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ServiceIncidentUpdates: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."ServiceIncidentUpdates" ("incidentId", stage, message, "postedAt", "postedByStaffId", "notifySubscribers", "updateBanner")
        VALUES ("vRet", CASE WHEN "vE1" ? 'stage' THEN "vC1ServiceIncidentUpdates".stage ELSE NULL END, CASE WHEN "vE1" ? 'message' THEN "vC1ServiceIncidentUpdates".message ELSE NULL END, CASE WHEN "vE1" ? 'postedAt' THEN "vC1ServiceIncidentUpdates"."postedAt" ELSE now() END, CASE WHEN "vE1" ? 'postedByStaffId' THEN "vC1ServiceIncidentUpdates"."postedByStaffId" ELSE NULL END, CASE WHEN "vE1" ? 'notifySubscribers' THEN "vC1ServiceIncidentUpdates"."notifySubscribers" ELSE TRUE END, CASE WHEN "vE1" ? 'updateBanner' THEN "vC1ServiceIncidentUpdates"."updateBanner" ELSE TRUE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."serviceIncidentAddUpdate"(jsonb) IS 'Save (insert or update) one ServiceIncidents record with its updates.';

-- ServiceIncidents: one record as JSON (camelCase keys), with lookup labels and updates
CREATE OR REPLACE FUNCTION "Platform"."getServiceIncidentInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('impactLabel', "Lookups"."getLookupLabel"('Impact', t.impact) ->> 'label', 'impactTone', "Lookups"."getLookupLabel"('Impact', t.impact) ->> 'tone', 'stageLabel', "Lookups"."getLookupLabel"('ServiceIncidentStage', t.stage) ->> 'label', 'stageTone', "Lookups"."getLookupLabel"('ServiceIncidentStage', t.stage) ->> 'tone') ||
         jsonb_build_object('updates', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."ServiceIncidentUpdates" c1 WHERE c1."incidentId" = t.id), '[]'::jsonb))
    FROM "Platform"."ServiceIncidents" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getServiceIncidentInfo"(uuid) IS 'Read one ServiceIncidents record (getter for its screens).';

-- PlatformApiKeys: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."platformApiKeyAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Platform"."PlatformApiKeys";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."PlatformApiKeys", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."PlatformApiKeys" ("tenantId", name, environment, "keyPrefix", "keyHash", "keyLast4", scopes, "allowedCidrs", "expiresAt", "lastUsedAt", status, "previousKeyHash", "previousValidUntil", "rotatedAt", "revokedAt", "revokedByStaffId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'environment' THEN "vRec".environment ELSE 'LIVE' END, CASE WHEN "pData" ? 'keyPrefix' THEN "vRec"."keyPrefix" ELSE NULL END, CASE WHEN "pData" ? 'keyHash' THEN "vRec"."keyHash" ELSE NULL END, CASE WHEN "pData" ? 'keyLast4' THEN "vRec"."keyLast4" ELSE NULL END, CASE WHEN "pData" ? 'scopes' THEN "vRec".scopes ELSE NULL END, CASE WHEN "pData" ? 'allowedCidrs' THEN "vRec"."allowedCidrs" ELSE NULL END, CASE WHEN "pData" ? 'expiresAt' THEN "vRec"."expiresAt" ELSE NULL END, CASE WHEN "pData" ? 'lastUsedAt' THEN "vRec"."lastUsedAt" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'previousKeyHash' THEN "vRec"."previousKeyHash" ELSE NULL END, CASE WHEN "pData" ? 'previousValidUntil' THEN "vRec"."previousValidUntil" ELSE NULL END, CASE WHEN "pData" ? 'rotatedAt' THEN "vRec"."rotatedAt" ELSE NULL END, CASE WHEN "pData" ? 'revokedAt' THEN "vRec"."revokedAt" ELSE NULL END, CASE WHEN "pData" ? 'revokedByStaffId' THEN "vRec"."revokedByStaffId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."PlatformApiKeys" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           environment = CASE WHEN "pData" ? 'environment' THEN "vRec".environment ELSE t.environment END,
           "keyPrefix" = CASE WHEN "pData" ? 'keyPrefix' THEN "vRec"."keyPrefix" ELSE t."keyPrefix" END,
           "keyHash" = CASE WHEN "pData" ? 'keyHash' THEN "vRec"."keyHash" ELSE t."keyHash" END,
           "keyLast4" = CASE WHEN "pData" ? 'keyLast4' THEN "vRec"."keyLast4" ELSE t."keyLast4" END,
           scopes = CASE WHEN "pData" ? 'scopes' THEN "vRec".scopes ELSE t.scopes END,
           "allowedCidrs" = CASE WHEN "pData" ? 'allowedCidrs' THEN "vRec"."allowedCidrs" ELSE t."allowedCidrs" END,
           "expiresAt" = CASE WHEN "pData" ? 'expiresAt' THEN "vRec"."expiresAt" ELSE t."expiresAt" END,
           "lastUsedAt" = CASE WHEN "pData" ? 'lastUsedAt' THEN "vRec"."lastUsedAt" ELSE t."lastUsedAt" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "previousKeyHash" = CASE WHEN "pData" ? 'previousKeyHash' THEN "vRec"."previousKeyHash" ELSE t."previousKeyHash" END,
           "previousValidUntil" = CASE WHEN "pData" ? 'previousValidUntil' THEN "vRec"."previousValidUntil" ELSE t."previousValidUntil" END,
           "rotatedAt" = CASE WHEN "pData" ? 'rotatedAt' THEN "vRec"."rotatedAt" ELSE t."rotatedAt" END,
           "revokedAt" = CASE WHEN "pData" ? 'revokedAt' THEN "vRec"."revokedAt" ELSE t."revokedAt" END,
           "revokedByStaffId" = CASE WHEN "pData" ? 'revokedByStaffId' THEN "vRec"."revokedByStaffId" ELSE t."revokedByStaffId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."PlatformApiKeys" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PlatformApiKeys %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PlatformApiKeys % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."platformApiKeyAddUpdate"(jsonb) IS 'Save (insert or update) one PlatformApiKeys record.';

-- PlatformApiKeys: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getPlatformApiKeyInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t) - 'keyHash' - 'previousKeyHash') ||
         jsonb_build_object('environmentLabel', "Lookups"."getLookupLabel"('PlatformApiKeyEnvironment', t.environment) ->> 'label', 'environmentTone', "Lookups"."getLookupLabel"('PlatformApiKeyEnvironment', t.environment) ->> 'tone', 'keyPrefixLabel', "Lookups"."getLookupLabel"('KeyPrefix', t."keyPrefix") ->> 'label', 'keyPrefixTone', "Lookups"."getLookupLabel"('KeyPrefix', t."keyPrefix") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('PlatformApiKeyStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('PlatformApiKeyStatus', t.status) ->> 'tone')
    FROM "Platform"."PlatformApiKeys" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getPlatformApiKeyInfo"(uuid) IS 'Read one PlatformApiKeys record (getter for its screens).';

-- WebhookEndpoints: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."webhookEndpointAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Platform"."WebhookEndpoints";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."WebhookEndpoints", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."WebhookEndpoints" ("tenantId", url, "isEnabled", events, "signingSecretEnc", "secretLast4", "pausedAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'url' THEN "vRec".url ELSE NULL END, CASE WHEN "pData" ? 'isEnabled' THEN "vRec"."isEnabled" ELSE TRUE END, CASE WHEN "pData" ? 'events' THEN "vRec".events ELSE NULL END, CASE WHEN "pData" ? 'signingSecretEnc' THEN "vRec"."signingSecretEnc" ELSE NULL END, CASE WHEN "pData" ? 'secretLast4' THEN "vRec"."secretLast4" ELSE NULL END, CASE WHEN "pData" ? 'pausedAt' THEN "vRec"."pausedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."WebhookEndpoints" t
       SET url = CASE WHEN "pData" ? 'url' THEN "vRec".url ELSE t.url END,
           "isEnabled" = CASE WHEN "pData" ? 'isEnabled' THEN "vRec"."isEnabled" ELSE t."isEnabled" END,
           events = CASE WHEN "pData" ? 'events' THEN "vRec".events ELSE t.events END,
           "signingSecretEnc" = CASE WHEN "pData" ? 'signingSecretEnc' THEN "vRec"."signingSecretEnc" ELSE t."signingSecretEnc" END,
           "secretLast4" = CASE WHEN "pData" ? 'secretLast4' THEN "vRec"."secretLast4" ELSE t."secretLast4" END,
           "pausedAt" = CASE WHEN "pData" ? 'pausedAt' THEN "vRec"."pausedAt" ELSE t."pausedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."WebhookEndpoints" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'WebhookEndpoints %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'WebhookEndpoints % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."webhookEndpointAddUpdate"(jsonb) IS 'Save (insert or update) one WebhookEndpoints record.';

-- WebhookEndpoints: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getWebhookEndpointInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t) - 'signingSecretEnc' - 'secretLast4')
    FROM "Platform"."WebhookEndpoints" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getWebhookEndpointInfo"(uuid) IS 'Read one WebhookEndpoints record (getter for its screens).';
