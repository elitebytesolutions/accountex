-- Super Admin portal (/admin) login table. Separate from Company.Users and Platform.PlatformStaff.
-- Exactly one row: `singleton` is always true and unique.
-- Apply with: npx prisma db execute --file prisma/sql/001-platform-admin.sql

CREATE TABLE IF NOT EXISTS "Platform"."PlatformAdmin" (
  "id"           uuid        NOT NULL DEFAULT gen_random_uuid(),
  "singleton"    boolean     NOT NULL DEFAULT true,
  "email"        citext      NOT NULL,
  "fullName"     text        NOT NULL,
  "passwordHash" text        NOT NULL,
  "lastLoginAt"  timestamptz,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "createdBy"    uuid,
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedBy"    uuid,
  "rowVersion"   integer     NOT NULL DEFAULT 0,
  CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformAdmin_singleton_key" UNIQUE ("singleton"),
  CONSTRAINT "PlatformAdmin_singleton_check" CHECK ("singleton"),
  CONSTRAINT "PlatformAdmin_email_key" UNIQUE ("email"),
  CONSTRAINT "PlatformAdmin_email_check" CHECK ("email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

DROP TRIGGER IF EXISTS "platformAdminStamp" ON "Platform"."PlatformAdmin";
CREATE TRIGGER "platformAdminStamp" BEFORE INSERT ON "Platform"."PlatformAdmin"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerStampInsert"();

DROP TRIGGER IF EXISTS "platformAdminTouch" ON "Platform"."PlatformAdmin";
CREATE TRIGGER "platformAdminTouch" BEFORE UPDATE ON "Platform"."PlatformAdmin"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerTouch"();
