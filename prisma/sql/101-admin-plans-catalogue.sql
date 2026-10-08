-- 101-admin-plans-catalogue.sql
-- Phase 36: Plans & catalogue, plus the Super Admin foundation shared by Phases 37-39.
-- Idempotent: safe to run repeatedly via npm run db:sql (or: npx prisma db execute --file prisma/sql/101-admin-plans-catalogue.sql).

-- ===========================================================================
-- PART 1: Super Admin foundation
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1.1 The Super Admin is mirrored as a Platform.PlatformStaff row, so platform history (PlatformAuditLogs.staffUserId)
--     and staff-owned rows (e.g. FeatureFlags.ownerStaffId) get a real id. The admin keeps signing in through
--     Platform.PlatformAdmin; the mirror row never signs in ("!" password marker, never a valid bcrypt hash).
-- ---------------------------------------------------------------------------
ALTER TABLE "Platform"."PlatformAdmin" ADD COLUMN IF NOT EXISTS "staffId" uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlatformAdmin_staffId_fkey') THEN
    ALTER TABLE "Platform"."PlatformAdmin"
      ADD CONSTRAINT "PlatformAdmin_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Platform"."PlatformStaff"(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlatformAdmin_staffId_key') THEN
    ALTER TABLE "Platform"."PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_staffId_key" UNIQUE ("staffId");
  END IF;
END $$;

-- Keeps the mirror in step with the admin: creates it on first use, follows email / name changes.
CREATE OR REPLACE FUNCTION "Platform"."triggerPlatformAdminStaffMirror"()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF NEW."staffId" IS NULL THEN
    SELECT s.id INTO NEW."staffId" FROM "Platform"."PlatformStaff" s WHERE s.email = NEW.email;
  END IF;
  IF NEW."staffId" IS NULL THEN
    INSERT INTO "Platform"."PlatformStaff"
      (email, "fullName", role, "passwordHash", "tenantScope", status, "ipRestricted", "mfaRequired")
    VALUES (NEW.email, NEW."fullName", 'SUPER_ADMIN', '!mirror:PlatformAdmin', 'ALL', 'ACTIVE', false, false)
    RETURNING id INTO NEW."staffId";
  ELSE
    UPDATE "Platform"."PlatformStaff" s
       SET email = NEW.email, "fullName" = NEW."fullName"
     WHERE s.id = NEW."staffId" AND (s.email IS DISTINCT FROM NEW.email OR s."fullName" IS DISTINCT FROM NEW."fullName");
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "platformAdminStaffMirror" ON "Platform"."PlatformAdmin";
CREATE TRIGGER "platformAdminStaffMirror" BEFORE INSERT OR UPDATE OF email, "fullName", "staffId" ON "Platform"."PlatformAdmin"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerPlatformAdminStaffMirror"();

-- Backfill the existing admin (the trigger creates or links the mirror row).
UPDATE "Platform"."PlatformAdmin" SET "staffId" = NULL WHERE "staffId" IS NULL;

-- ---------------------------------------------------------------------------
-- 1.2 Platform record history. Company.writeAuditEntry routes Platform-schema rows to Platform.PlatformAuditLogs
--     (action "<Table>.<insert|update|delete>", rowData = the row version, payload = the changes).
--     Returns one record's versions, newest first, plus the rows of its child tables found through their parent FK
--     (pChildFk = '{"SubscriptionPlanFeatures.planId", ...}').
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "platformAuditLogRecordIdx" ON "Platform"."PlatformAuditLogs" (("rowData" ->> 'id'));

DROP FUNCTION IF EXISTS "Platform"."getPlatformRecordHistory"(text, uuid, text[], integer, integer);
CREATE FUNCTION "Platform"."getPlatformRecordHistory"(
  "pTable" text, "pId" uuid, "pChildFk" text[] DEFAULT '{}'::text[], "pLimit" integer DEFAULT 50, "pOffset" integer DEFAULT 0)
 RETURNS TABLE("entryId" bigint, "occurredAt" timestamp with time zone, "tableName" text, "recordId" text, action text,
               version integer, "actorId" uuid, "actorName" text, "actorEmail" text, changes jsonb, "rowData" jsonb,
               "ipAddress" inet, "userAgent" text, "correlationId" text, total bigint)
 LANGUAGE sql
 STABLE
AS $function$
  WITH hits AS (
    SELECT l.*, "pTable" AS tbl
      FROM "Platform"."PlatformAuditLogs" l
     WHERE l."rowData" ->> 'id' = "pId"::text AND split_part(l.action, '.', 1) = "pTable"
    UNION ALL
    SELECT l.*, split_part(c.fk, '.', 1)
      FROM unnest(COALESCE("pChildFk", '{}'::text[])) AS c(fk)
      JOIN "Platform"."PlatformAuditLogs" l
        ON split_part(l.action, '.', 1) = split_part(c.fk, '.', 1)
       AND l."rowData" ->> split_part(c.fk, '.', 2) = "pId"::text
  )
  -- version = 1, 2, 3 … per row in the order its changes happened.
  SELECT h.id, h."occurredAt", h.tbl, h."rowData" ->> 'id', upper(split_part(h.action, '.', 2)),
         (row_number() OVER (PARTITION BY h.tbl, h."rowData" ->> 'id' ORDER BY h."occurredAt", h.id))::integer,
         h."staffUserId", h."actorLabel", COALESCE(h."actorDetail", s.email::text), h.payload, h."rowData",
         h."ipAddress", h."userAgent", h."correlationId", count(*) OVER ()
    FROM hits h
    LEFT JOIN "Platform"."PlatformStaff" s ON s.id = h."staffUserId"
   ORDER BY h."occurredAt" DESC, h.id DESC
   LIMIT "pLimit" OFFSET "pOffset"
$function$;

-- ===========================================================================
-- PART 2: Plans & catalogue
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 2.1 Row history on the catalogue tables that had none (SubscriptionPlanLimits, PlatformModules, PlatformModulePlans,
--     Addons, SubscriptionCoupons and SubscriptionCouponRedemptions are already audited).
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "subscriptionPlansAudit" ON "Platform"."SubscriptionPlans";
CREATE TRIGGER "subscriptionPlansAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."SubscriptionPlans"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "subscriptionPlanFeaturesAudit" ON "Platform"."SubscriptionPlanFeatures";
CREATE TRIGGER "subscriptionPlanFeaturesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."SubscriptionPlanFeatures"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "addonPlansAudit" ON "Platform"."AddonPlans";
CREATE TRIGGER "addonPlansAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."AddonPlans"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "subscriptionCouponPlansAudit" ON "Platform"."SubscriptionCouponPlans";
CREATE TRIGGER "subscriptionCouponPlansAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."SubscriptionCouponPlans"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2.2 Error codes (duplicate codes use the existing DB_UNIQUE_VIOLATION, stale rows CONCURRENCY_CONFLICT).
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('PLAN_IN_USE',        409, 'BUSINESS_RULE', 'PLATFORM', 'Subscriptions, invoices or other records use this plan, or it is the last public plan. Retire it instead.', 'Delete or retire of a plan that is in use / the last active public plan', true, NULL),
  ('MODULE_CORE_LOCKED', 400, 'BUSINESS_RULE', 'PLATFORM', 'Core modules are always on and can''t be disabled.', 'Disable of a core platform module', true, NULL),
  ('MODULE_IN_USE',      409, 'BUSINESS_RULE', 'PLATFORM', 'Add-ons, feature flags or entitlement history use this module. Disable it instead.', 'Delete of a platform module that is in use', true, NULL),
  ('ADDON_IN_USE',       409, 'BUSINESS_RULE', 'PLATFORM', 'Tenants, invoices or alert rules use this add-on. Deactivate it instead.', 'Delete of an add-on that is in use', true, NULL),
  ('COUPON_IN_USE',      409, 'BUSINESS_RULE', 'PLATFORM', 'This coupon has been redeemed or invoiced. Pause it instead.', 'Delete of a coupon with redemptions', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;
