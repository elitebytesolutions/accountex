-- =============================================================================
-- Finsoft ERP — 01a-lookups.sql   (identical in erp-basic and erp-full)
--
-- Every enumeration of the ERP lives in ONE table: "Lookups"."Lookups".
-- There are no hard-coded CHECK (column IN (...)) lists anywhere in the schema.
--
--   "Lookups"."Lookups"        one row per value of every list
--                              (lookupType 'SalesInvoiceStatus', code 'POSTED',
--                               label 'Posted', tone 'good' = badge colour)
--   "Lookups"."LookupColumns"  registry: which column uses which list
--   "Lookups"."validateLookups"()  generic BEFORE INSERT/UPDATE trigger that
--                              checks every registered column of the row
--
-- Global values have "tenantId" NULL and are maintained by Finsoft. Lists whose
-- registry row says "allowTenantValues" (reasons, categories, payment terms…)
-- also accept values a tenant adds for itself ("tenantId" = that tenant).
--
-- The values and the registry rows are generated into 92-lookups.sql.
-- =============================================================================

CREATE TABLE "Lookups"."Lookups" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lookupType"     text NOT NULL CHECK ("lookupType" ~ '^[A-Z][A-Za-z0-9]*$'),   -- SalesInvoiceStatus
  code             text NOT NULL CHECK (length(btrim(code)) > 0),               -- POSTED (stored value)
  label            text NOT NULL,                                               -- "Posted" (screen text)
  "labelUrdu"      text,                                                        -- Urdu screens / prints
  description      text,
  tone             text NOT NULL DEFAULT 'neutral'
                   CHECK (tone ~ '^(good|warn|danger|info|neutral|violet)$'),     -- badge colour on the screens
  "sortOrder"      integer NOT NULL DEFAULT 0,
  "isActive"       boolean NOT NULL DEFAULT true,
  "isSystem"       boolean NOT NULL DEFAULT false,      -- code is used by program logic: cannot be renamed/deleted
  "parentCodes"    text[],                              -- dependent lists: value allowed only when the parent
                                                        -- column holds one of these codes (e.g. sub-type CASH
                                                        -- only for account class '1'); NULL = any parent
  "tenantId"       uuid REFERENCES "Platform"."Tenants"(id),   -- NULL = global value
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "createdBy"      uuid,
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedBy"      uuid,
  "rowVersion"     integer NOT NULL DEFAULT 0,
  CONSTRAINT "lookupsTypeCodeTenantKey" UNIQUE NULLS NOT DISTINCT ("lookupType", code, "tenantId"),
  CONSTRAINT "lookupsSystemIsGlobal" CHECK (NOT "isSystem" OR "tenantId" IS NULL)
);
SELECT "Company"."addStandardTriggers"('"Lookups"."Lookups"');
CREATE INDEX "lookupsTypeIdx"   ON "Lookups"."Lookups" ("lookupType", "sortOrder");
CREATE INDEX "lookupsTenantIdx" ON "Lookups"."Lookups" ("tenantId", "lookupType") WHERE "tenantId" IS NOT NULL;
COMMENT ON TABLE "Lookups"."Lookups" IS
  'Single table for every enumeration value (statuses, types, reasons, …). Replaces hard-coded CHECK lists. tone = badge colour used by the screens.';

CREATE TABLE "Lookups"."LookupColumns" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "schemaName"        text NOT NULL,                      -- Sales
  "tableName"         text NOT NULL,                      -- SalesInvoices
  "columnName"        text NOT NULL,                      -- status
  "lookupType"        text NOT NULL,                      -- SalesInvoiceStatus
  "allowTenantValues" boolean NOT NULL DEFAULT false,     -- tenants may add their own values
  "dependsOnColumn"   text,                               -- dependent list: column holding the parent code
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  CONSTRAINT "lookupColumnsColumnKey" UNIQUE ("schemaName", "tableName", "columnName")
);
SELECT "Company"."addStandardTriggers"('"Lookups"."LookupColumns"');
CREATE INDEX "lookupColumnsTableIdx" ON "Lookups"."LookupColumns" ("schemaName", "tableName");
COMMENT ON TABLE "Lookups"."LookupColumns" IS
  'Registry: which column of which table takes its values from which lookup list. Drives "Lookups"."validateLookups"() and documents every enumeration column.';

-- ---------------------------------------------------------------------------
-- Validation: every registered column of the row must hold a value of its list
-- (global, or the row's own tenant when the list allows tenant values).
-- NULL is allowed here; NOT NULL is the column's own constraint.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Lookups"."validateLookups"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow"    jsonb := to_jsonb(NEW);
  "vOld"    jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
  "vCol"    record;
  "vValue"  text;
  "vTenant" uuid := NULLIF("vRow" ->> 'tenantId', '')::uuid;
BEGIN
  FOR "vCol" IN
    SELECT lc."columnName", lc."lookupType", lc."allowTenantValues", lc."dependsOnColumn"
      FROM "Lookups"."LookupColumns" lc
     WHERE lc."schemaName" = TG_TABLE_SCHEMA AND lc."tableName" = TG_TABLE_NAME
  LOOP
    "vValue" := "vRow" ->> "vCol"."columnName";
    CONTINUE WHEN "vValue" IS NULL;
    CONTINUE WHEN TG_OP = 'UPDATE' AND "vValue" IS NOT DISTINCT FROM ("vOld" ->> "vCol"."columnName");
    IF NOT EXISTS (
      SELECT 1 FROM "Lookups"."Lookups" l
       WHERE l."lookupType" = "vCol"."lookupType" AND l.code = "vValue" AND l."isActive"
         AND (l."tenantId" IS NULL OR ("vCol"."allowTenantValues" AND l."tenantId" = "vTenant"))
         AND ("vCol"."dependsOnColumn" IS NULL OR l."parentCodes" IS NULL
              OR ("vRow" ->> "vCol"."dependsOnColumn") = ANY (l."parentCodes"))
    ) THEN
      RAISE EXCEPTION 'Invalid value "%" for %.%.% (list %)', "vValue", TG_TABLE_SCHEMA, TG_TABLE_NAME,
                      "vCol"."columnName", "vCol"."lookupType"
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION "Lookups"."validateLookups"() IS
  'Generic BEFORE INSERT/UPDATE trigger: validates every column registered in "Lookups"."LookupColumns" against "Lookups"."Lookups".';

-- Attaches "validateLookups" to every table that has a registered column
-- (called at the end of 92-lookups.sql; safe to call again).
CREATE OR REPLACE FUNCTION "Lookups"."attachLookupValidation"() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  "vTable" record;
  "vCount" integer := 0;
BEGIN
  FOR "vTable" IN SELECT DISTINCT "schemaName", "tableName" FROM "Lookups"."LookupColumns" LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS "validateLookups" ON %I.%I', "vTable"."schemaName", "vTable"."tableName");
    EXECUTE format('CREATE TRIGGER "validateLookups" BEFORE INSERT OR UPDATE ON %I.%I '
                   'FOR EACH ROW EXECUTE FUNCTION "Lookups"."validateLookups"()',
                   "vTable"."schemaName", "vTable"."tableName");
    "vCount" := "vCount" + 1;
  END LOOP;
  RETURN "vCount";
END $$;

-- System values are used by program logic (posting, workflows): their code
-- can't be changed and they can't be deleted — deactivate instead.
CREATE OR REPLACE FUNCTION "Lookups"."triggerProtectSystemLookups"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."isSystem" AND (TG_OP = 'DELETE' OR NEW.code <> OLD.code OR NEW."lookupType" <> OLD."lookupType") THEN
    RAISE EXCEPTION 'Lookup %/% is a system value: it cannot be renamed or deleted (set "isActive" = false instead)',
                    OLD."lookupType", OLD.code USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "lookupsProtectSystem" BEFORE UPDATE OR DELETE ON "Lookups"."Lookups"
  FOR EACH ROW EXECUTE FUNCTION "Lookups"."triggerProtectSystemLookups"();

-- ---------------------------------------------------------------------------
-- Readers used by every screen's dropdowns and badges
-- ---------------------------------------------------------------------------
-- Values of one list for the current tenant (global + the tenant's own), in order.
CREATE OR REPLACE FUNCTION "Lookups"."getLookups"("pLookupType" text)
RETURNS TABLE (code text, label text, "labelUrdu" text, tone text, "sortOrder" integer, "isTenantValue" boolean)
LANGUAGE sql STABLE AS $$
  SELECT l.code, l.label, l."labelUrdu", l.tone, l."sortOrder", l."tenantId" IS NOT NULL
    FROM "Lookups"."Lookups" l
   WHERE l."lookupType" = "pLookupType" AND l."isActive"
     AND (l."tenantId" IS NULL OR l."tenantId" = NULLIF(current_setting('app.tenantId', true), '')::uuid)
   ORDER BY l."sortOrder", l.label
$$;

-- Label + tone of one value (used by get<Entity>Info to add "statusLabel"/"statusTone").
CREATE OR REPLACE FUNCTION "Lookups"."getLookupLabel"("pLookupType" text, "pCode" text)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('label', l.label, 'tone', l.tone)
    FROM "Lookups"."Lookups" l
   WHERE l."lookupType" = "pLookupType" AND l.code = "pCode"
     AND (l."tenantId" IS NULL OR l."tenantId" = NULLIF(current_setting('app.tenantId', true), '')::uuid)
   ORDER BY l."tenantId" NULLS LAST
   LIMIT 1
$$;

-- The list a column uses (for generic code: forms, API).
CREATE OR REPLACE FUNCTION "Lookups"."getColumnLookupType"("pSchema" text, "pTable" text, "pColumn" text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT lc."lookupType" FROM "Lookups"."LookupColumns" lc
   WHERE lc."schemaName" = "pSchema" AND lc."tableName" = "pTable" AND lc."columnName" = "pColumn"
$$;
