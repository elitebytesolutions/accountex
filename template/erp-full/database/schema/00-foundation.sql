-- =============================================================================
-- Finsoft ERP — 00-foundation.sql
-- Shared by erp-basic and erp-full (this file is byte-identical in both).
--
-- Target: PostgreSQL 16+
-- Design source: the Finsoft HTML prototype (finsofthtml/src). Every table in
-- the module files cites the screen(s) it comes from.
--
-- NAMING (applies to every object — see database/NAMING.md)
-- ---------------------------------------------------------------------------
--   Schemas   PascalCase full module names   "Sales", "FixedAssets", "BankCash"
--   Tables    PascalCase, plural, named after the screen      "SalesInvoices"
--   Columns   camelCase                                       "customerId"
--   Views     camelCase get<Report>                           "getTrialBalance"
--   Functions camelCase: <entity>AddUpdate, get<Entity>Info, <entity><Action>
--   No underscores in any name. Mixed-case names are always double-quoted:
--       SELECT i."docNo" FROM "Sales"."SalesInvoices" i WHERE i."tenantId" = $1;
--   Enumerations are NOT hard-coded CHECK lists: every value list lives in
--   the single table "Lookups"."Lookups" (01a-lookups.sql, 92-lookups.sql).
--
-- CONVENTIONS
-- ---------------------------------------------------------------------------
-- 1. One Postgres schema per module:
--      "Platform"             SaaS console (GLOBAL — no tenantId, no RLS)
--      "Company"              company, branches, users, roles, numbering,
--                             approvals, attachments, notifications, audit
--      "Accounting"           chart of accounts, vouchers, periods, budgets
--      "BankCash"             bank, cheques, cash, petty cash, expense claims
--      "FixedAssets"          fixed assets
--      "Tax"                  tax codes, GST/WHT returns, FBR
--      "Sales"                customers, quotations → orders → challans → invoices, receipts
--      "Purchases"            vendors, PO → GRN → bills, payments, landed cost
--      "Inventory"            products, warehouses, stock movements and stock operations
--      "Distribution"         routes, vans, bookings, load sheets, settlement, recovery
--      "HumanResources"       employees, attendance, leave, lifecycle, talent
--      "Payroll"              salary structures, payroll runs, payslips, loans
--      "EmployeeSelfService"  ESS extras
--      "Reports"              Report Studio
--      "Lookups"              every enumeration value (single table) + column registry
--
-- 2. Keys: id uuid PRIMARY KEY DEFAULT gen_random_uuid(). Human-readable
--    codes (CUST-0001, INV-2026-000146) live in "code" / "docNo" columns.
--
-- 3. Tenancy (shared schema):
--    * every tenant-owned table has "tenantId" uuid NOT NULL
--      REFERENCES "Platform"."Tenants"(id) and UNIQUE ("tenantId", id)
--    * every FK between tenant tables is COMPOSITE ("tenantId", "xId")
--    * RLS (91-rls.sql): "tenantId" = "Company"."getCurrentTenantId"()
--
-- 4. Standard columns on every table (at the end):
--      "createdAt", "createdBy", "updatedAt", "updatedBy", "rowVersion"
--      (+ "deletedAt" on master data). Documents are never deleted: they are
--      cancelled / voided, and posted ones are reversed.
--
-- 5. Types: money numeric(18,2) · qty numeric(18,3) · rate numeric(18,4)
--           percent numeric(7,4) · fx numeric(18,6) · date / timestamptz
--
-- 6. Writes go through functions only (database/api/*): the application role
--    has SELECT + EXECUTE, never INSERT/UPDATE/DELETE on tables.
--
-- 7. Session context set by the API on every transaction:
--      SET app.tenantId = '<uuid>';  SET app.userId = '<uuid>';  SET app.clientIp = '<ip>';
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid(), digest()
CREATE EXTENSION IF NOT EXISTS citext;       -- case-insensitive emails/codes
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- fuzzy search on names/SKUs
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- exclusion constraints on ranges

-- ---------------------------------------------------------------------------
-- Schemas (all are created in both editions; erp-basic leaves some empty)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS "Platform";
CREATE SCHEMA IF NOT EXISTS "Company";
CREATE SCHEMA IF NOT EXISTS "Accounting";
CREATE SCHEMA IF NOT EXISTS "BankCash";
CREATE SCHEMA IF NOT EXISTS "FixedAssets";
CREATE SCHEMA IF NOT EXISTS "Tax";
CREATE SCHEMA IF NOT EXISTS "Sales";
CREATE SCHEMA IF NOT EXISTS "Purchases";
CREATE SCHEMA IF NOT EXISTS "Inventory";
CREATE SCHEMA IF NOT EXISTS "Distribution";
CREATE SCHEMA IF NOT EXISTS "HumanResources";
CREATE SCHEMA IF NOT EXISTS "Payroll";
CREATE SCHEMA IF NOT EXISTS "EmployeeSelfService";
CREATE SCHEMA IF NOT EXISTS "Reports";
CREATE SCHEMA IF NOT EXISTS "Lookups";

COMMENT ON SCHEMA "Platform"            IS 'SaaS console (admin/*). Global tables: no tenantId, no RLS.';
COMMENT ON SCHEMA "Company"             IS 'Tenant organisation: company settings, branches, users, roles, numbering, approvals, shared services, audit trail.';
COMMENT ON SCHEMA "Accounting"          IS 'Chart of accounts, vouchers (every journal), cost centres, fiscal periods, budgets.';
COMMENT ON SCHEMA "BankCash"            IS 'Bank accounts, bank transactions, cheques/PDC, reconciliation, cash, petty cash, expense claims.';
COMMENT ON SCHEMA "FixedAssets"         IS 'Fixed asset register, depreciation, disposals.';
COMMENT ON SCHEMA "Tax"                 IS 'Tax codes, sales tax / WHT returns, FBR integration.';
COMMENT ON SCHEMA "Sales"               IS 'Customers, pricing, quotations, orders, challans, sales invoices (all channels), returns, receipts.';
COMMENT ON SCHEMA "Purchases"           IS 'Vendors, purchase orders, goods received, vendor bills, returns, debit notes, landed cost, payments.';
COMMENT ON SCHEMA "Inventory"           IS 'Products, classes, companies & brands, warehouses, batches, stock movements and stock operations.';
COMMENT ON SCHEMA "Distribution"        IS 'Wholesale & distribution: routes, vans, bookings, back-orders, load sheets, settlement, recovery.';
COMMENT ON SCHEMA "HumanResources"      IS 'Employees, organisation, attendance, shifts, leave, lifecycle, recruitment, performance, training.';
COMMENT ON SCHEMA "Payroll"             IS 'Salary components/structures, payroll runs, payslips, loans, final settlement, tax declarations.';
COMMENT ON SCHEMA "EmployeeSelfService" IS 'Employee self-service extras: letters, helpdesk, kudos, pulse, polls, shift swaps.';
COMMENT ON SCHEMA "Reports"             IS 'Report Studio: saved report definitions, sharing, schedules, runs.';
COMMENT ON SCHEMA "Lookups"             IS 'Every enumeration value of the ERP in one table ("Lookups"."Lookups") plus the registry of which column uses which list.';

-- ---------------------------------------------------------------------------
-- Database roles (NOLOGIN group roles; real login users are granted these)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finsoftApp') THEN
    CREATE ROLE "finsoftApp" NOLOGIN;          -- tenant application: SELECT + EXECUTE only
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finsoftReadOnly') THEN
    CREATE ROLE "finsoftReadOnly" NOLOGIN;     -- auditors / BI
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finsoftPlatform') THEN
    CREATE ROLE "finsoftPlatform" NOLOGIN;     -- platform console (admin/*)
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Session context helpers
-- ---------------------------------------------------------------------------

-- The tenant of the current request. Raises if not set: a query that reaches a
-- tenant table without a tenant context must fail loudly, never return "no rows".
CREATE OR REPLACE FUNCTION "Company"."getCurrentTenantId"() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.tenantId')::uuid
$$;

-- The signed-in user (NULL for system jobs).
CREATE OR REPLACE FUNCTION "Company"."getCurrentUserId"() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.userId', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------

-- Keeps "updatedAt" / "updatedBy" honest and bumps "rowVersion".
CREATE OR REPLACE FUNCTION "Company"."triggerTouch"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."updatedAt"  := now();
  NEW."updatedBy"  := COALESCE("Company"."getCurrentUserId"(), NEW."updatedBy");
  NEW."rowVersion" := OLD."rowVersion" + 1;
  RETURN NEW;
END $$;

-- Fills "createdBy" / "updatedBy" on insert from the session user.
CREATE OR REPLACE FUNCTION "Company"."triggerStampInsert"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."createdBy" := COALESCE(NEW."createdBy", "Company"."getCurrentUserId"());
  NEW."updatedBy" := COALESCE(NEW."updatedBy", NEW."createdBy");
  RETURN NEW;
END $$;

-- Rejects UPDATE/DELETE: used on append-only ledgers (stock movements, audit trail).
CREATE OR REPLACE FUNCTION "Company"."triggerAppendOnly"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

-- Generic row audit -> "Company"."AuditTrailEntries" (02-core.sql).
-- Stores only the changed fields, as {"field": {"before": x, "after": y}}.
-- Feeds the Audit Trail screen (app/settings/audit) "Field / Before / After".
-- Platform (global) tables are audited into "Platform"."PlatformAuditLogs"
-- instead: they change from the console, where no tenant context exists.
CREATE OR REPLACE FUNCTION "Company"."triggerAudit"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
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
END $$;

-- ---------------------------------------------------------------------------
-- Wiring helper: attach the standard triggers to a table.
--   SELECT "Company"."addStandardTriggers"('"Sales"."SalesInvoices"');        -- touch + stamp
--   SELECT "Company"."addStandardTriggers"('"Sales"."SalesInvoices"', true);  -- + audit
-- Trigger names: <table in camelCase>Stamp / Touch / Audit, e.g. "salesInvoicesTouch".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."addStandardTriggers"("pTable" regclass, "pAudit" boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  "vRel"  text;
  "vBase" text;
BEGIN
  SELECT c.relname INTO "vRel" FROM pg_class c WHERE c.oid = "pTable";
  "vBase" := lower(left("vRel", 1)) || substr("vRel", 2);
  EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION "Company"."triggerStampInsert"()',
                 "vBase" || 'Stamp', "pTable");
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION "Company"."triggerTouch"()',
                 "vBase" || 'Touch', "pTable");
  IF "pAudit" THEN
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"()',
                   "vBase" || 'Audit', "pTable");
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Document numbering ("Company"."NumberingSeries" lives in 02-core.sql)
--
-- Pattern tokens:  {PREFIX} {YYYY} {YY} {MM} {FY} (fiscal year 2026-27)
--                  {BR} (branch code) {SEQn} (zero padded to n digits).
--   INV  '{PREFIX}-{YYYY}-{SEQ6}'  -> INV-2026-000146
--   CRV  '{PREFIX}-{BR}-{SEQ4}'    -> CRV-LHR-0381   (branch cash vouchers)
--   CUST '{PREFIX}-{SEQ4}'         -> CUST-0001
-- The counter row is locked (UPDATE ... RETURNING), so two concurrent posts can
-- never receive the same number. Never MAX(no)+1.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."getNextDocNo"("pDocType" text,
                                                   "pDocDate" date DEFAULT current_date,
                                                   "pBranchId" uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vSeq"    record;     -- a "Company"."NumberingSeries" row
  "vFyStart" int;
  "vPeriod" text;
  "vValue"  bigint;
  "vOut"    text;
  "vBranch" text;
  "vPad"    int;
BEGIN
  -- the most specific series: branch-scoped first, then tenant-wide
  SELECT * INTO "vSeq"
    FROM "Company"."NumberingSeries" s
   WHERE s."tenantId" = "vTenant" AND s."docType" = "pDocType" AND s."isActive"
     AND (s."branchId" = "pBranchId" OR s."branchId" IS NULL)
   ORDER BY (s."branchId" IS NULL)
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No numbering series configured for %', "pDocType";
  END IF;

  SELECT t."fiscalYearStartMonth" INTO "vFyStart" FROM "Platform"."Tenants" t WHERE t.id = "vTenant";

  "vPeriod" := CASE "vSeq"."resetPolicy"
                 -- YEARLY resets per fiscal year when the pattern shows {FY}, else per calendar year
                 WHEN 'YEARLY'  THEN CASE WHEN position('{FY}' IN "vSeq".pattern) > 0
                                          THEN "Company"."getFiscalYearLabel"("pDocDate", "vFyStart")
                                          ELSE to_char("pDocDate", 'YYYY') END
                 WHEN 'MONTHLY' THEN to_char("pDocDate", 'YYYY-MM')
                 ELSE 'ALL' END;

  INSERT INTO "Company"."NumberingSeriesCounters" ("tenantId", "sequenceId", "periodKey", "nextValue")
  VALUES ("vTenant", "vSeq".id, "vPeriod", "vSeq"."startValue")
  ON CONFLICT ("tenantId", "sequenceId", "periodKey") DO NOTHING;

  UPDATE "Company"."NumberingSeriesCounters" c
     SET "nextValue" = c."nextValue" + 1, "updatedAt" = now()
   WHERE c."tenantId" = "vTenant" AND c."sequenceId" = "vSeq".id AND c."periodKey" = "vPeriod"
  RETURNING c."nextValue" - 1 INTO "vValue";

  SELECT b.code INTO "vBranch" FROM "Company"."Branches" b
   WHERE b."tenantId" = "vTenant" AND b.id = "pBranchId";

  "vOut" := "vSeq".pattern;
  "vOut" := replace("vOut", '{PREFIX}', "vSeq".prefix);
  "vOut" := replace("vOut", '{YYYY}',  to_char("pDocDate", 'YYYY'));
  "vOut" := replace("vOut", '{YY}',    to_char("pDocDate", 'YY'));
  "vOut" := replace("vOut", '{MM}',    to_char("pDocDate", 'MM'));
  IF position('{FY}' IN "vOut") > 0 THEN
    "vOut" := replace("vOut", '{FY}', substr("Company"."getFiscalYearLabel"("pDocDate", "vFyStart"), 4));
  END IF;
  "vOut" := replace("vOut", '{BR}',    COALESCE("vBranch", ''));
  "vPad" := COALESCE(substring("vOut" from '\{SEQ(\d+)\}')::int, "vSeq".padding);
  "vOut" := regexp_replace("vOut", '\{SEQ\d*\}', lpad("vValue"::text, "vPad", '0'));
  RETURN "vOut";
END $$;

COMMENT ON FUNCTION "Company"."getNextDocNo"(text, date, uuid) IS
  'Returns the next document number for a document type ("Company"."NumberingSeries"). Row-locked; never MAX+1.';

-- ---------------------------------------------------------------------------
-- Small utilities used by checks and views
-- ---------------------------------------------------------------------------

-- Fiscal year label for a date (FY starts on the given month; Finsoft default
-- July): 2026-10-01 -> 'FY 2026-27'.
CREATE OR REPLACE FUNCTION "Company"."getFiscalYearLabel"("pDate" date, "pStartMonth" int DEFAULT 7)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'FY ' || y || '-' || right((y + 1)::text, 2)
    FROM (SELECT CASE WHEN extract(month FROM "pDate") >= COALESCE("pStartMonth", 7)
                      THEN extract(year FROM "pDate")::int
                      ELSE extract(year FROM "pDate")::int - 1 END AS y) t
$$;

-- Splits a base (piece) quantity into cartons + loose for display:
-- 87 pieces, carton of 36 -> '2 CTN + 15'
CREATE OR REPLACE FUNCTION "Company"."formatCartonsLoose"("pQty" numeric, "pCtn" integer)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN COALESCE("pCtn", 1) <= 1 THEN trim(to_char("pQty", 'FM999999999990.###'))
              ELSE floor("pQty" / "pCtn")::text || ' CTN + ' ||
                   trim(to_char("pQty" - floor("pQty" / "pCtn") * "pCtn", 'FM999999990.###')) END
$$;
