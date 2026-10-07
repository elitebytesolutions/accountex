-- Phase 0 rev 2: the tenant is the main record. Creating a tenant creates its system roles and its default user,
-- and the default user always holds every role of the tenant and stays active (locked).
-- Idempotent. Apply with: npm run db:sql   New tenants: select "Platform"."provisionTenant"(...)

-- ---------------------------------------------------------------------------
-- 1. Tenant → default user link (deferred: tenant and user are created in one transaction)
-- ---------------------------------------------------------------------------
ALTER TABLE "Platform"."Tenants" ADD COLUMN IF NOT EXISTS "defaultUserId" uuid;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenantDefaultUserFk') THEN
    ALTER TABLE "Platform"."Tenants" ADD CONSTRAINT "tenantDefaultUserFk"
      FOREIGN KEY ("id", "defaultUserId") REFERENCES "Company"."Users" ("tenantId", "id")
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $do$;

-- ---------------------------------------------------------------------------
-- 2. Default grants per system role (filled from prisma/catalog.ts by the seed), so the DB can provision alone
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Platform"."SystemRoleGrants" (
  "systemKey"      text        NOT NULL,
  "permissionCode" text        NOT NULL REFERENCES "Company"."Permissions" ("code"),
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "createdBy"      uuid,
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedBy"      uuid,
  "rowVersion"     integer     NOT NULL DEFAULT 0,
  CONSTRAINT "SystemRoleGrants_pkey" PRIMARY KEY ("systemKey", "permissionCode")
);
INSERT INTO "Lookups"."LookupColumns" ("schemaName", "tableName", "columnName", "lookupType", "allowTenantValues")
SELECT 'Platform', 'SystemRoleGrants', 'systemKey', 'SystemKey', false
WHERE NOT EXISTS (SELECT 1 FROM "Lookups"."LookupColumns" WHERE "schemaName" = 'Platform' AND "tableName" = 'SystemRoleGrants' AND "columnName" = 'systemKey');

DROP TRIGGER IF EXISTS "systemRoleGrantsStamp" ON "Platform"."SystemRoleGrants";
CREATE TRIGGER "systemRoleGrantsStamp" BEFORE INSERT ON "Platform"."SystemRoleGrants" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerStampInsert"();
DROP TRIGGER IF EXISTS "systemRoleGrantsTouch" ON "Platform"."SystemRoleGrants";
CREATE TRIGGER "systemRoleGrantsTouch" BEFORE UPDATE ON "Platform"."SystemRoleGrants" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerTouch"();
DROP TRIGGER IF EXISTS "validateLookups" ON "Platform"."SystemRoleGrants";
CREATE TRIGGER "validateLookups" BEFORE INSERT OR UPDATE ON "Platform"."SystemRoleGrants" FOR EACH ROW EXECUTE FUNCTION "Lookups"."validateLookups"();
DROP TRIGGER IF EXISTS "systemRoleGrantsAudit" ON "Platform"."SystemRoleGrants";
CREATE TRIGGER "systemRoleGrantsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."SystemRoleGrants" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 3. Error code
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "userMessage", "description", "isLogged")
VALUES ('TENANT_DEFAULT_USER_LOCKED', 409, 'BUSINESS_RULE', 'The company''s default user always keeps every role and stays active.',
        'Raised by the tenant default-user lock triggers', true)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "userMessage" = EXCLUDED."userMessage", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 4. Assign every role of the tenant to its default user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."assignAllRolesToDefaultUser"("pTenantId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vUserId" uuid;
BEGIN
  SELECT t."defaultUserId" INTO "vUserId" FROM "Platform"."Tenants" t WHERE t."id" = "pTenantId";
  IF "vUserId" IS NULL THEN RETURN; END IF;
  -- ADMIN is the primary role, unless the user already has a primary role.
  INSERT INTO "Company"."UserRoles" ("tenantId", "userId", "roleId", "isPrimary")
  SELECT "pTenantId", "vUserId", r."id",
         r."systemKey" = 'ADMIN' AND NOT EXISTS (
           SELECT 1 FROM "Company"."UserRoles" p WHERE p."tenantId" = "pTenantId" AND p."userId" = "vUserId" AND p."isPrimary")
    FROM "Company"."Roles" r
   WHERE r."tenantId" = "pTenantId" AND r."deletedAt" IS NULL
  ON CONFLICT ("tenantId", "userId", "roleId") DO NOTHING;
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Provision a tenant: tenant → system roles + grants → default user → all roles. One transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."provisionTenant"(
  "pCode" text, "pName" text, "pLegalName" text, "pAdminEmail" text, "pAdminName" text, "pPasswordHash" text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenantId" uuid;
  "vUserId"   uuid;
BEGIN
  INSERT INTO "Platform"."Tenants" ("code", "subdomain", "displayName", "legalName", "status")
  VALUES (lower("pCode"), lower("pCode"), "pName", COALESCE("pLegalName", "pName"), 'ACTIVE')
  RETURNING "id" INTO "vTenantId";

  -- One role per active system role key, with its default grants.
  INSERT INTO "Company"."Roles" ("tenantId", "systemKey", "name", "description", "isSystem")
  SELECT "vTenantId", l."code", l."label", l."description", true
    FROM "Lookups"."Lookups" l
   WHERE l."lookupType" = 'SystemKey' AND l."tenantId" IS NULL AND l."isActive";

  INSERT INTO "Company"."RolePermissions" ("tenantId", "roleId", "permissionCode")
  SELECT "vTenantId", r."id", g."permissionCode"
    FROM "Company"."Roles" r
    JOIN "Platform"."SystemRoleGrants" g ON g."systemKey" = r."systemKey"
   WHERE r."tenantId" = "vTenantId";

  -- The default user (the Employee trigger adds EMPLOYEE), then every role.
  INSERT INTO "Company"."Users" ("tenantId", "email", "fullName", "passwordHash", "status")
  VALUES ("vTenantId", lower("pAdminEmail"), "pAdminName", "pPasswordHash", 'ACTIVE')
  RETURNING "id" INTO "vUserId";

  UPDATE "Platform"."Tenants" SET "defaultUserId" = "vUserId" WHERE "id" = "vTenantId";
  RETURN "vTenantId";
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Keep "default user has every role" true
-- ---------------------------------------------------------------------------
-- Any new role (system or custom) goes to the default user.
CREATE OR REPLACE FUNCTION "Platform"."triggerRoleToDefaultUser"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Platform"."assignAllRolesToDefaultUser"(NEW."tenantId");
  RETURN NULL;
END $function$;
DROP TRIGGER IF EXISTS "rolesToDefaultUser" ON "Company"."Roles";
CREATE TRIGGER "rolesToDefaultUser" AFTER INSERT ON "Company"."Roles"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerRoleToDefaultUser"();

-- A (new) default user receives every role.
CREATE OR REPLACE FUNCTION "Platform"."triggerTenantDefaultUserRoles"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Platform"."assignAllRolesToDefaultUser"(NEW."id");
  RETURN NULL;
END $function$;
DROP TRIGGER IF EXISTS "tenantsDefaultUserRoles" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsDefaultUserRoles" AFTER UPDATE OF "defaultUserId" ON "Platform"."Tenants"
  FOR EACH ROW WHEN (NEW."defaultUserId" IS NOT NULL AND NEW."defaultUserId" IS DISTINCT FROM OLD."defaultUserId")
  EXECUTE FUNCTION "Platform"."triggerTenantDefaultUserRoles"();

-- ---------------------------------------------------------------------------
-- 7. Locks (HINT TENANT_DEFAULT_USER_LOCKED → 409)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."isDefaultUser"("pTenantId" uuid, "pUserId" uuid)
  RETURNS boolean
  LANGUAGE sql STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM "Platform"."Tenants" t WHERE t."id" = "pTenantId" AND t."defaultUserId" = "pUserId")
$function$;

CREATE OR REPLACE FUNCTION "Platform"."triggerDefaultUserLock"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'UserRoles' THEN
    IF "Platform"."isDefaultUser"(OLD."tenantId", OLD."userId") THEN
      RAISE EXCEPTION 'A role cannot be removed from the company''s default user'
        USING ERRCODE = 'check_violation', HINT = 'TENANT_DEFAULT_USER_LOCKED';
    END IF;
    RETURN OLD;
  END IF;

  -- Company.Users
  IF "Platform"."isDefaultUser"(OLD."tenantId", OLD."id") THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'The company''s default user cannot be deleted'
        USING ERRCODE = 'check_violation', HINT = 'TENANT_DEFAULT_USER_LOCKED';
    END IF;
    IF NEW."status" <> 'ACTIVE' OR NEW."deletedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'The company''s default user must stay active'
        USING ERRCODE = 'check_violation', HINT = 'TENANT_DEFAULT_USER_LOCKED';
    END IF;
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $function$;

DROP TRIGGER IF EXISTS "userRolesDefaultUserLock" ON "Company"."UserRoles";
CREATE TRIGGER "userRolesDefaultUserLock" BEFORE DELETE ON "Company"."UserRoles"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerDefaultUserLock"();
DROP TRIGGER IF EXISTS "usersDefaultUserLock" ON "Company"."Users";
CREATE TRIGGER "usersDefaultUserLock" BEFORE UPDATE OF "status", "deletedAt" OR DELETE ON "Company"."Users"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerDefaultUserLock"();

-- A tenant always keeps a default user once it has one.
CREATE OR REPLACE FUNCTION "Platform"."triggerKeepDefaultUser"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD."defaultUserId" IS NOT NULL AND NEW."defaultUserId" IS NULL THEN
    RAISE EXCEPTION 'A company must keep a default user'
      USING ERRCODE = 'check_violation', HINT = 'TENANT_DEFAULT_USER_LOCKED';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS "tenantsKeepDefaultUser" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsKeepDefaultUser" BEFORE UPDATE OF "defaultUserId" ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerKeepDefaultUser"();

-- ---------------------------------------------------------------------------
-- 8. Backfill: a tenant without a default user takes its first-created active user (Demo Company → its admin).
-- ---------------------------------------------------------------------------
UPDATE "Platform"."Tenants" t
   SET "defaultUserId" = (SELECT u."id" FROM "Company"."Users" u
                           WHERE u."tenantId" = t."id" AND u."status" = 'ACTIVE' AND u."deletedAt" IS NULL
                           ORDER BY u."createdAt", u."id" LIMIT 1)
 WHERE t."defaultUserId" IS NULL
   AND EXISTS (SELECT 1 FROM "Company"."Users" u WHERE u."tenantId" = t."id" AND u."status" = 'ACTIVE' AND u."deletedAt" IS NULL);
