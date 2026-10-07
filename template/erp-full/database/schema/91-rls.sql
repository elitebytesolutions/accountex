-- =============================================================================
-- Finsoft ERP — 91-rls.sql   (identical in erp-basic and erp-full)
-- Row-level security + grants. Runs after every schema, fk, view and api file.
--
-- Discovery is automatic: every table (ordinary, partitioned parent AND each
-- partition) in a tenant schema that has a "tenantId" column gets
--   ENABLE + FORCE row level security
--   policy "tenantIsolation":  "tenantId" = "Company"."getCurrentTenantId"()
-- so a module added later is protected without editing this file.
-- "Lookups"."Lookups" is special: global rows ("tenantId" NULL) are visible to
-- every tenant, tenant rows only to their tenant.
--
-- Grants — ONE write path:
--   "finsoftApp"       SELECT on tables/views + EXECUTE on functions. No INSERT,
--                      UPDATE or DELETE: every write goes through the
--                      <entity>AddUpdate / <entity><Action> functions
--                      (SECURITY DEFINER, database/api/*), which still run under
--                      the forced RLS policies of the caller's tenant.
--   "finsoftReadOnly"  SELECT only.
--   "finsoftPlatform"  console: SELECT + EXECUTE on "Platform"; reads tenant data
--                      only through a login with BYPASSRLS.
-- =============================================================================

DO $$
DECLARE
  r record;
  "vTenantSchemas" text[] := ARRAY['Company','Accounting','BankCash','FixedAssets','Tax','Sales','Purchases',
                                   'Inventory','Distribution','HumanResources','Payroll','EmployeeSelfService',
                                   'Reports'];
BEGIN
  FOR r IN
    SELECT n.nspname AS "schemaName", c.relname AS "tableName"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenantId' AND NOT a.attisdropped
     WHERE n.nspname = ANY ("vTenantSchemas")
       AND c.relkind IN ('r','p')          -- tables, partitioned parents and their partitions
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r."schemaName", r."tableName");
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',  r."schemaName", r."tableName");
    EXECUTE format('DROP POLICY IF EXISTS "tenantIsolation" ON %I.%I', r."schemaName", r."tableName");
    EXECUTE format('CREATE POLICY "tenantIsolation" ON %I.%I '
                   'USING ("tenantId" = "Company"."getCurrentTenantId"()) '
                   'WITH CHECK ("tenantId" = "Company"."getCurrentTenantId"())',
                   r."schemaName", r."tableName");
  END LOOP;
END $$;

-- Lookups: global values for everyone, tenant values for their tenant only.
ALTER TABLE "Lookups"."Lookups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lookups"."Lookups" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lookupsVisibility" ON "Lookups"."Lookups";
CREATE POLICY "lookupsVisibility" ON "Lookups"."Lookups"
  USING ("tenantId" IS NULL OR "tenantId" = NULLIF(current_setting('app.tenantId', true), '')::uuid)
  -- a tenant session can only write its own values; global values are written
  -- only without a tenant context (seed scripts, platform console)
  WITH CHECK (("tenantId" IS NOT NULL AND "tenantId" = NULLIF(current_setting('app.tenantId', true), '')::uuid)
              OR ("tenantId" IS NULL AND NULLIF(current_setting('app.tenantId', true), '') IS NULL));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA "Platform", "Company", "Accounting", "BankCash", "FixedAssets", "Tax", "Sales",
                      "Purchases", "Inventory", "Distribution", "HumanResources", "Payroll",
                      "EmployeeSelfService", "Reports", "Lookups"
  TO "finsoftApp", "finsoftReadOnly", "finsoftPlatform";

-- tenant application: read + call functions. Writes only through functions.
GRANT SELECT ON ALL TABLES IN SCHEMA "Company", "Accounting", "BankCash", "FixedAssets", "Tax", "Sales",
                                    "Purchases", "Inventory", "Distribution", "HumanResources", "Payroll",
                                    "EmployeeSelfService", "Reports", "Lookups"
  TO "finsoftApp";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "Company", "Accounting", "BankCash", "FixedAssets", "Tax", "Sales",
                                         "Purchases", "Inventory", "Distribution", "HumanResources", "Payroll",
                                         "EmployeeSelfService", "Reports", "Lookups"
  TO "finsoftApp";
-- login & provisioning read the tenant registry and plans before a tenant context exists
GRANT SELECT ON "Platform"."Tenants", "Platform"."SubscriptionPlans", "Platform"."SubscriptionPlanFeatures",
                "Platform"."TenantModules", "Platform"."Subscriptions"
  TO "finsoftApp";
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA "Company", "Accounting", "BankCash",
       "FixedAssets", "Tax", "Sales", "Purchases", "Inventory", "Distribution", "HumanResources", "Payroll",
       "EmployeeSelfService", "Reports", "Lookups", "Platform"
  FROM "finsoftApp";

-- read-only (auditors, BI)
GRANT SELECT ON ALL TABLES IN SCHEMA "Company", "Accounting", "BankCash", "FixedAssets", "Tax", "Sales",
                                    "Purchases", "Inventory", "Distribution", "HumanResources", "Payroll",
                                    "EmployeeSelfService", "Reports", "Lookups"
  TO "finsoftReadOnly";

-- platform console: read everything in Platform, write through its functions
GRANT SELECT ON ALL TABLES IN SCHEMA "Platform", "Lookups" TO "finsoftPlatform";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "Platform", "Lookups" TO "finsoftPlatform";
GRANT SELECT ON ALL TABLES IN SCHEMA "Company", "Accounting", "Sales", "Purchases", "Inventory"
  TO "finsoftPlatform";      -- Tenant 360 usage figures (needs a BYPASSRLS login)
