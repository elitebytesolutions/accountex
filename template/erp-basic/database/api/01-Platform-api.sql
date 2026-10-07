-- =============================================================================
-- Finsoft ERP (Basic edition) — API: "Platform"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- SubscriptionPlans: insert (no "id") or update (with "id"); child arrays: features
CREATE OR REPLACE FUNCTION "Platform"."subscriptionPlanAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."SubscriptionPlans";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1SubscriptionPlanFeatures" "Platform"."SubscriptionPlanFeatures";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."SubscriptionPlans", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."SubscriptionPlans" (code, name, tagline, "priceMonthly", "priceAnnual", "userSeats", "storageGb", "trialDays", "sortOrder", "isPublic", status)
    VALUES (CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'tagline' THEN "vRec".tagline ELSE NULL END, CASE WHEN "pData" ? 'priceMonthly' THEN "vRec"."priceMonthly" ELSE NULL END, CASE WHEN "pData" ? 'priceAnnual' THEN "vRec"."priceAnnual" ELSE NULL END, CASE WHEN "pData" ? 'userSeats' THEN "vRec"."userSeats" ELSE NULL END, CASE WHEN "pData" ? 'storageGb' THEN "vRec"."storageGb" ELSE NULL END, CASE WHEN "pData" ? 'trialDays' THEN "vRec"."trialDays" ELSE 14 END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END, CASE WHEN "pData" ? 'isPublic' THEN "vRec"."isPublic" ELSE TRUE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
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
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
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
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."subscriptionPlanAddUpdate"(jsonb) IS 'Save (insert or update) one SubscriptionPlans record with its features.';

-- SubscriptionPlans: one record as JSON (camelCase keys), with lookup labels and features
CREATE OR REPLACE FUNCTION "Platform"."getSubscriptionPlanInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('SubscriptionPlanStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('SubscriptionPlanStatus', t.status) ->> 'tone') ||
         jsonb_build_object('features', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Platform"."SubscriptionPlanFeatures" c1 WHERE c1."planId" = t.id), '[]'::jsonb))
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
    INSERT INTO "Platform"."ChartOfAccountsTemplates" (code, name, industry, version, status)
    VALUES (CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'industry' THEN "vRec".industry ELSE NULL END, CASE WHEN "pData" ? 'version' THEN "vRec".version ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'DRAFT' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."ChartOfAccountsTemplates" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           industry = CASE WHEN "pData" ? 'industry' THEN "vRec".industry ELSE t.industry END,
           version = CASE WHEN "pData" ? 'version' THEN "vRec".version ELSE t.version END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
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
    INSERT INTO "Platform"."Tenants" (code, subdomain, "displayName", "legalName", ntn, strn, "secpRegNo", industry, country, city, province, address, phone, email, "fiscalYearStartMonth", "baseCurrency", timezone, "numberFormat", "dateFormat", "dataResidency", "coaTemplateId", "requireMfa", "allowSso", "defaultLanguage", status, "healthScore", "trialEndsOn", "activatedAt", "lastActiveAt", "accountOwnerStaffId")
    VALUES (CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'subdomain' THEN "vRec".subdomain ELSE NULL END, CASE WHEN "pData" ? 'displayName' THEN "vRec"."displayName" ELSE NULL END, CASE WHEN "pData" ? 'legalName' THEN "vRec"."legalName" ELSE NULL END, CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE NULL END, CASE WHEN "pData" ? 'strn' THEN "vRec".strn ELSE NULL END, CASE WHEN "pData" ? 'secpRegNo' THEN "vRec"."secpRegNo" ELSE NULL END, CASE WHEN "pData" ? 'industry' THEN "vRec".industry ELSE NULL END, CASE WHEN "pData" ? 'country' THEN "vRec".country ELSE 'PK' END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'province' THEN "vRec".province ELSE NULL END, CASE WHEN "pData" ? 'address' THEN "vRec".address ELSE NULL END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'fiscalYearStartMonth' THEN "vRec"."fiscalYearStartMonth" ELSE 7 END, CASE WHEN "pData" ? 'baseCurrency' THEN "vRec"."baseCurrency" ELSE 'PKR' END, CASE WHEN "pData" ? 'timezone' THEN "vRec".timezone ELSE 'Asia/Karachi' END, CASE WHEN "pData" ? 'numberFormat' THEN "vRec"."numberFormat" ELSE 'SOUTH_ASIAN' END, CASE WHEN "pData" ? 'dateFormat' THEN "vRec"."dateFormat" ELSE 'DD MMM YYYY' END, CASE WHEN "pData" ? 'dataResidency' THEN "vRec"."dataResidency" ELSE 'PK_LAHORE' END, CASE WHEN "pData" ? 'coaTemplateId' THEN "vRec"."coaTemplateId" ELSE NULL END, CASE WHEN "pData" ? 'requireMfa' THEN "vRec"."requireMfa" ELSE FALSE END, CASE WHEN "pData" ? 'allowSso' THEN "vRec"."allowSso" ELSE FALSE END, CASE WHEN "pData" ? 'defaultLanguage' THEN "vRec"."defaultLanguage" ELSE 'EN' END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'PROVISIONING' END, CASE WHEN "pData" ? 'healthScore' THEN "vRec"."healthScore" ELSE NULL END, CASE WHEN "pData" ? 'trialEndsOn' THEN "vRec"."trialEndsOn" ELSE NULL END, CASE WHEN "pData" ? 'activatedAt' THEN "vRec"."activatedAt" ELSE NULL END, CASE WHEN "pData" ? 'lastActiveAt' THEN "vRec"."lastActiveAt" ELSE NULL END, CASE WHEN "pData" ? 'accountOwnerStaffId' THEN "vRec"."accountOwnerStaffId" ELSE NULL END)
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
           "accountOwnerStaffId" = CASE WHEN "pData" ? 'accountOwnerStaffId' THEN "vRec"."accountOwnerStaffId" ELSE t."accountOwnerStaffId" END
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
         jsonb_build_object('industryLabel', "Lookups"."getLookupLabel"('TenantIndustry', t.industry) ->> 'label', 'industryTone', "Lookups"."getLookupLabel"('TenantIndustry', t.industry) ->> 'tone', 'provinceLabel', "Lookups"."getLookupLabel"('Province', t.province) ->> 'label', 'provinceTone', "Lookups"."getLookupLabel"('Province', t.province) ->> 'tone', 'numberFormatLabel', "Lookups"."getLookupLabel"('NumberFormat', t."numberFormat") ->> 'label', 'numberFormatTone', "Lookups"."getLookupLabel"('NumberFormat', t."numberFormat") ->> 'tone', 'dataResidencyLabel', "Lookups"."getLookupLabel"('DataResidency', t."dataResidency") ->> 'label', 'dataResidencyTone', "Lookups"."getLookupLabel"('DataResidency', t."dataResidency") ->> 'tone', 'defaultLanguageLabel', "Lookups"."getLookupLabel"('DefaultLanguage', t."defaultLanguage") ->> 'label', 'defaultLanguageTone', "Lookups"."getLookupLabel"('DefaultLanguage', t."defaultLanguage") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('TenantStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('TenantStatus', t.status) ->> 'tone')
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
    INSERT INTO "Platform"."Subscriptions" ("tenantId", "planId", "billingCycle", amount, seats, "startsOn", "trialEndsOn", "currentPeriodStart", "currentPeriodEnd", "nextRenewalOn", "paymentMethod", "paymentRef", "autoRenew", status, "cancelledAt", "cancelReason")
    VALUES ("vTenant", CASE WHEN "pData" ? 'planId' THEN "vRec"."planId" ELSE NULL END, CASE WHEN "pData" ? 'billingCycle' THEN "vRec"."billingCycle" ELSE NULL END, CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE NULL END, CASE WHEN "pData" ? 'seats' THEN "vRec".seats ELSE NULL END, CASE WHEN "pData" ? 'startsOn' THEN "vRec"."startsOn" ELSE NULL END, CASE WHEN "pData" ? 'trialEndsOn' THEN "vRec"."trialEndsOn" ELSE NULL END, CASE WHEN "pData" ? 'currentPeriodStart' THEN "vRec"."currentPeriodStart" ELSE NULL END, CASE WHEN "pData" ? 'currentPeriodEnd' THEN "vRec"."currentPeriodEnd" ELSE NULL END, CASE WHEN "pData" ? 'nextRenewalOn' THEN "vRec"."nextRenewalOn" ELSE NULL END, CASE WHEN "pData" ? 'paymentMethod' THEN "vRec"."paymentMethod" ELSE NULL END, CASE WHEN "pData" ? 'paymentRef' THEN "vRec"."paymentRef" ELSE NULL END, CASE WHEN "pData" ? 'autoRenew' THEN "vRec"."autoRenew" ELSE TRUE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'cancelledAt' THEN "vRec"."cancelledAt" ELSE NULL END, CASE WHEN "pData" ? 'cancelReason' THEN "vRec"."cancelReason" ELSE NULL END)
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
           "cancelReason" = CASE WHEN "pData" ? 'cancelReason' THEN "vRec"."cancelReason" ELSE t."cancelReason" END
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

-- PlatformStaff: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Platform"."platformStaffMemberAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRec" "Platform"."PlatformStaff";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."PlatformStaff", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."PlatformStaff" (email, "fullName", role, "passwordHash", "mfaType", "tenantScope", status, "lastActiveAt")
    VALUES (CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'fullName' THEN "vRec"."fullName" ELSE NULL END, CASE WHEN "pData" ? 'role' THEN "vRec".role ELSE NULL END, CASE WHEN "pData" ? 'passwordHash' THEN "vRec"."passwordHash" ELSE NULL END, CASE WHEN "pData" ? 'mfaType' THEN "vRec"."mfaType" ELSE NULL END, CASE WHEN "pData" ? 'tenantScope' THEN "vRec"."tenantScope" ELSE 'ALL' END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'INVITED' END, CASE WHEN "pData" ? 'lastActiveAt' THEN "vRec"."lastActiveAt" ELSE NULL END)
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
           "lastActiveAt" = CASE WHEN "pData" ? 'lastActiveAt' THEN "vRec"."lastActiveAt" ELSE t."lastActiveAt" END
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

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Platform"."platformStaffMemberAddUpdate"(jsonb) IS 'Save (insert or update) one PlatformStaff record.';

-- PlatformStaff: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Platform"."getPlatformStaffMemberInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t) - 'passwordHash') ||
         jsonb_build_object('roleLabel', "Lookups"."getLookupLabel"('PlatformStaffMemberRole', t.role) ->> 'label', 'roleTone', "Lookups"."getLookupLabel"('PlatformStaffMemberRole', t.role) ->> 'tone', 'mfaTypeLabel', "Lookups"."getLookupLabel"('MfaType', t."mfaType") ->> 'label', 'mfaTypeTone', "Lookups"."getLookupLabel"('MfaType', t."mfaType") ->> 'tone', 'tenantScopeLabel', "Lookups"."getLookupLabel"('TenantScope', t."tenantScope") ->> 'label', 'tenantScopeTone', "Lookups"."getLookupLabel"('TenantScope', t."tenantScope") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('PlatformStaffMemberStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('PlatformStaffMemberStatus', t.status) ->> 'tone')
    FROM "Platform"."PlatformStaff" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Platform"."getPlatformStaffMemberInfo"(uuid) IS 'Read one PlatformStaff record (getter for its screens).';
