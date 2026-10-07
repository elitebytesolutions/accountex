-- Phase 5: Treasury rules & compliance setup (bank rules, petty cash funds, fixed asset categories, FBR settings,
-- segregation-of-duties rules). Idempotent. Apply with: npm run db:sql

-- ---------------------------------------------------------------------------
-- 1. Encrypted tenant secrets (FBR / PRA API tokens). The app encrypts with AES-256-GCM (APP_ENCRYPTION_KEY);
--    the database only ever sees ciphertext. Row history redacts the cipher columns.
-- ---------------------------------------------------------------------------
INSERT INTO "Lookups"."Lookups" ("lookupType", "code", "label", "description", "tone", "sortOrder", "isActive", "isSystem")
VALUES
  ('SecretPurpose', 'FBR_API_TOKEN', 'FBR API token', 'FBR POS / Digital Invoicing security token', 'neutral', 1, true, true),
  ('SecretPurpose', 'PRA_API_TOKEN', 'PRA API token', 'Punjab Revenue Authority security token', 'neutral', 2, true, true)
ON CONFLICT ("lookupType", "code", "tenantId") DO UPDATE SET "label" = EXCLUDED."label", "description" = EXCLUDED."description", "isActive" = true, "isSystem" = true;

CREATE TABLE IF NOT EXISTS "Company"."TenantSecrets" (
  "id"         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId"   uuid        NOT NULL REFERENCES "Platform"."Tenants"(id),
  "purpose"    text        NOT NULL,
  "ciphertext" text        NOT NULL,
  "iv"         text        NOT NULL,
  "authTag"    text        NOT NULL,
  "keyVersion" smallint    NOT NULL DEFAULT 1 CHECK ("keyVersion" > 0),
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "createdBy"  uuid,
  "updatedAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedBy"  uuid,
  "rowVersion" integer     NOT NULL DEFAULT 0,
  CONSTRAINT "TenantSecrets_tenantId_id_key" UNIQUE ("tenantId", id),
  CONSTRAINT "TenantSecrets_tenantId_purpose_key" UNIQUE ("tenantId", purpose)
);
COMMENT ON TABLE "Company"."TenantSecrets" IS 'Encrypted per-company secrets (AES-256-GCM, key outside the database). Never returned by the API.';

INSERT INTO "Lookups"."LookupColumns" ("schemaName", "tableName", "columnName", "lookupType", "allowTenantValues")
SELECT 'Company', 'TenantSecrets', 'purpose', 'SecretPurpose', false
WHERE NOT EXISTS (SELECT 1 FROM "Lookups"."LookupColumns" WHERE "schemaName" = 'Company' AND "tableName" = 'TenantSecrets' AND "columnName" = 'purpose');

DROP TRIGGER IF EXISTS "validateLookups" ON "Company"."TenantSecrets";
CREATE TRIGGER "validateLookups" BEFORE INSERT OR UPDATE ON "Company"."TenantSecrets" FOR EACH ROW EXECUTE FUNCTION "Lookups"."validateLookups"();
DROP TRIGGER IF EXISTS "tenantSecretsStamp" ON "Company"."TenantSecrets";
CREATE TRIGGER "tenantSecretsStamp" BEFORE INSERT ON "Company"."TenantSecrets" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerStampInsert"();
DROP TRIGGER IF EXISTS "tenantSecretsTouch" ON "Company"."TenantSecrets";
CREATE TRIGGER "tenantSecretsTouch" BEFORE UPDATE ON "Company"."TenantSecrets" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerTouch"();
DROP TRIGGER IF EXISTS "tenantSecretsAudit" ON "Company"."TenantSecrets";
CREATE TRIGGER "tenantSecretsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Company"."TenantSecrets"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditRedacted"('ciphertext', 'iv', 'authTag');

ALTER TABLE "Company"."TenantSecrets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Company"."TenantSecrets" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenantIsolation" ON "Company"."TenantSecrets";
CREATE POLICY "tenantIsolation" ON "Company"."TenantSecrets"
  USING ("tenantId" = "Company"."getCurrentTenantId"()) WITH CHECK ("tenantId" = "Company"."getCurrentTenantId"());
-- No grant to the read-only roles: secrets stay out of reporting connections.

-- ---------------------------------------------------------------------------
-- 2. Segregation-of-duties rules for every company: the 16 rules that lived in src/shared/access/sod.ts,
--    all WARN (same behaviour). At provisioning, and backfilled now.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."seedSodRulesFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE "vCount" integer;
BEGIN
  INSERT INTO "Company"."SegregationOfDutiesRules" ("tenantId", code, name, kind, "permissionA", "permissionB", description, severity, "ownerExempt", "isActive")
  SELECT "pTenant", v.code, v.name, v.kind, v.a, v.b, v.descr, 'WARN', true, true
    FROM (
      SELECT 'CREATE_APPROVE_' || upper(r) AS code, 'Create & approve · ' || p."resourceLabel" AS name, 'CREATE_APPROVE' AS kind,
             r || ':create' AS a, r || ':approve' AS b,
             'The same person could raise and approve ' || lower(p."resourceLabel") || '. Add a second approver or remove Approve.' AS descr
        FROM unnest(ARRAY['vch','cash','bank','vpay','rcpt','sinv','bill','prun','loan','adj','grn','fa']) AS r
        JOIN "Company"."Permissions" p ON p.code = r || ':approve'
      UNION ALL
      SELECT 'CREATE_POST_' || upper(r), 'Create & post · ' || p."resourceLabel", 'CREATE_POST', r || ':create', r || ':post',
             'Entries could reach the ledger without an independent review. Remove Post or require approval first.'
        FROM unnest(ARRAY['vch','cash','bank']) AS r
        JOIN "Company"."Permissions" p ON p.code = r || ':post'
      UNION ALL
      SELECT 'PRIVILEGE_ESCALATION', 'Create users & edit roles', 'PRIVILEGE_ESCALATION', 'usr:create', 'rol:edit',
             'This role could grant itself more access (privilege escalation).'
    ) v
   WHERE NOT EXISTS (SELECT 1 FROM "Company"."SegregationOfDutiesRules" s
                      WHERE s."tenantId" = "pTenant" AND (s.code = v.code OR (s."permissionA" = v.a AND s."permissionB" = v.b)));
  GET DIAGNOSTICS "vCount" = ROW_COUNT;
  RETURN "vCount";
END $function$;

CREATE OR REPLACE FUNCTION "Company"."triggerTenantSodRules"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Company"."seedSodRulesFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsSodRules" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsSodRules" AFTER INSERT ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerTenantSodRules"();

SELECT set_config('app.actorLabel', '011-treasury-rules.sql', true);
SELECT "Company"."seedSodRulesFor"(t.id) FROM "Platform"."Tenants" t;

-- ---------------------------------------------------------------------------
-- 3. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('BANK_RULE_IN_USE',         409, 'BUSINESS_RULE', 'FINANCE', 'Statement lines were categorised by this rule. Disable it instead.', 'Delete of a used bank rule', true, NULL),
  ('PETTY_FUND_ACCOUNT_TAKEN', 409, 'CONFLICT',      'FINANCE', 'This cash account already has a petty cash fund.', 'Second fund on one cash account', true, NULL),
  ('PETTY_CASH_FUND_IN_USE',   409, 'BUSINESS_RULE', 'FINANCE', 'This fund has vouchers or top-ups. Close it instead.', 'Delete of a used petty cash fund', true, NULL),
  ('ASSET_CATEGORY_IN_USE',    409, 'BUSINESS_RULE', 'FINANCE', 'Assets use this category. Deactivate it instead.', 'Delete of a used asset category', true, NULL),
  ('SOD_CONFLICT_BLOCKED',     422, 'BUSINESS_RULE', 'ACCESS',  'This role breaks a blocking segregation-of-duties rule.', 'Role save against a BLOCK SoD rule', true, NULL),
  ('SOD_RULE_SEEDED',          409, 'BUSINESS_RULE', 'ACCESS',  'Standard segregation-of-duties rules can be deactivated, not deleted.', 'Delete of a seeded SoD rule', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 4. Readable labels for the Phase 5 selects. Labels only; codes unchanged.
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" l
   SET "label" = v.label
  FROM (VALUES
    ('BankRuleConditionField','DESC','Description'), ('BankRuleConditionField','AMT','Amount'), ('BankRuleConditionField','REF','Reference'),
    ('BankRuleConditionField','TYPE','Direction'),
    ('BankRuleConditionOperator','CONTAINS','contains'), ('BankRuleConditionOperator','STARTS_WITH','starts with'), ('BankRuleConditionOperator','EQUALS','equals'),
    ('BankRuleConditionOperator','LT','less than'), ('BankRuleConditionOperator','GT','greater than'), ('BankRuleConditionOperator','IS','is'),
    ('MatchMode','ALL','Match all'), ('MatchMode','ANY','Match any'),
    ('DefaultMethod','WDV','Written-down value (reducing balance)'), ('DefaultMethod','SLM','Straight line'), ('DefaultMethod','NONE','Not depreciated'),
    ('FbrSettingAuthority','FBR','FBR (federal)'), ('FbrSettingAuthority','PRA','PRA (Punjab)'),
    ('SegregationOfDutiesRuleKind','CREATE_APPROVE','Create & approve'), ('SegregationOfDutiesRuleKind','CREATE_POST','Create & post'),
    ('SegregationOfDutiesRuleSeverity','WARN','Warn'), ('SegregationOfDutiesRuleSeverity','BLOCK','Block')
  ) AS v(type, code, label)
 WHERE l."lookupType" = v.type AND l.code = v.code AND l."tenantId" IS NULL AND l."label" IS DISTINCT FROM v.label;
