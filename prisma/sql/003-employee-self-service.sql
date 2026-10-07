-- Employee role + self-service under "My Profile" (no separate ESS portal; HR modules stay for HR staff work).
-- Idempotent. Apply with: npm run db:sql

-- ---------------------------------------------------------------------------
-- Lookups
-- ---------------------------------------------------------------------------

-- Baseline role every tenant user holds.
INSERT INTO "Lookups"."Lookups" ("lookupType", "code", "label", "description", "tone", "sortOrder", "isActive", "isSystem")
VALUES ('SystemKey', 'EMPLOYEE', 'Employee', 'Self-service: own attendance, leave, payslips, claims and requests. Every user has it.', 'neutral', 10, true, true)
ON CONFLICT ("lookupType", "code", "tenantId") DO UPDATE SET
  "label"       = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "sortOrder"   = EXCLUDED."sortOrder",
  "isActive"    = true,
  "isSystem"    = true;

-- Self-service permissions live in their own PROFILE module ("My Profile"), so ESS is no longer a permission module.
-- (ModuleKey ESS stays: it is the subscription entitlement that switches self-service on for a tenant.)
INSERT INTO "Lookups"."Lookups" ("lookupType", "code", "label", "description", "tone", "sortOrder", "isActive", "isSystem")
VALUES ('PermissionModule', 'PROFILE', 'My Profile', 'The signed-in user''s own screens: attendance, leave, payslips, claims, requests.', 'neutral', 0, true, true)
ON CONFLICT ("lookupType", "code", "tenantId") DO UPDATE SET
  "label"       = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "isActive"    = true,
  "isSystem"    = true;

UPDATE "Lookups"."Lookups" SET "isActive" = false
WHERE "lookupType" = 'PermissionModule' AND "code" = 'ESS' AND "tenantId" IS NULL;

UPDATE "Lookups"."Lookups" SET "label" = 'System'
WHERE "lookupType" = 'PermissionModule' AND "code" = 'SYSTEM' AND "tenantId" IS NULL;

-- ---------------------------------------------------------------------------
-- Self-service permissions (own data only), module PROFILE
-- ---------------------------------------------------------------------------

INSERT INTO "Company"."Permissions" ("code", "module", "resource", "resourceLabel", "action", "sortOrder")
SELECT s.resource || ':' || lower(a.action), 'PROFILE', s.resource, s.label, a.action, s.base + a.ord
FROM (VALUES
  ('myday',   'My day',                   600, ARRAY['VIEW']),
  ('myprof',  'My profile & documents',   610, ARRAY['VIEW', 'EDIT']),
  ('myatt',   'My attendance',            620, ARRAY['VIEW', 'CREATE']),
  ('mylv',    'My leave',                 630, ARRAY['VIEW', 'CREATE']),
  ('myshift', 'My shifts & swaps',        640, ARRAY['VIEW', 'CREATE']),
  ('mypay',   'My payslips',              650, ARRAY['VIEW', 'EXPORT']),
  ('mytax',   'My tax declarations',      660, ARRAY['VIEW', 'CREATE', 'EDIT']),
  ('myloan',  'My loans & advances',      670, ARRAY['VIEW', 'CREATE']),
  ('myexp',   'My expense claims',        680, ARRAY['VIEW', 'CREATE', 'EDIT']),
  ('myreq',   'Letters & requests',       690, ARRAY['VIEW', 'CREATE']),
  ('myhelp',  'Helpdesk',                 700, ARRAY['VIEW', 'CREATE']),
  ('mygoal',  'Goals & reviews',          710, ARRAY['VIEW', 'EDIT']),
  ('mykudos', 'Kudos, polls & pulse',     720, ARRAY['VIEW', 'CREATE']),
  ('myonb',   'Onboarding & policies',    730, ARRAY['VIEW', 'EDIT']),
  ('dir',     'Directory & announcements', 740, ARRAY['VIEW']),
  ('myteam',  'My team',                  750, ARRAY['VIEW', 'APPROVE'])
) AS s(resource, label, base, actions)
CROSS JOIN LATERAL unnest(s.actions) WITH ORDINALITY AS a(action, ord)
ON CONFLICT ("code") DO UPDATE SET
  "module"        = EXCLUDED."module",
  "resourceLabel" = EXCLUDED."resourceLabel",
  "sortOrder"     = EXCLUDED."sortOrder";

-- ---------------------------------------------------------------------------
-- Every user gets the tenant's Employee role
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER: runs past row-level security, so it works whatever app.tenantId is set to.
CREATE OR REPLACE FUNCTION "Company"."triggerUserDefaultEmployeeRole"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog
AS $function$
BEGIN
  -- Not primary: the primary role is the user's job role (Admin, Salesman, ...).
  INSERT INTO "Company"."UserRoles" ("tenantId", "userId", "roleId", "isPrimary")
  SELECT NEW."tenantId", NEW."id", r."id", false
  FROM "Company"."Roles" r
  WHERE r."tenantId" = NEW."tenantId" AND r."systemKey" = 'EMPLOYEE' AND r."deletedAt" IS NULL
  ON CONFLICT ("tenantId", "userId", "roleId") DO NOTHING;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "usersDefaultEmployeeRole" ON "Company"."Users";
CREATE TRIGGER "usersDefaultEmployeeRole" AFTER INSERT ON "Company"."Users"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerUserDefaultEmployeeRole"();

-- The Employee role cannot be taken away from a user who still exists.
CREATE OR REPLACE FUNCTION "Company"."triggerKeepEmployeeRole"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog
AS $function$
BEGIN
  IF EXISTS (
       SELECT 1 FROM "Company"."Roles" r
       WHERE r."tenantId" = OLD."tenantId" AND r."id" = OLD."roleId" AND r."systemKey" = 'EMPLOYEE')
     AND EXISTS (
       SELECT 1 FROM "Company"."Users" u
       WHERE u."tenantId" = OLD."tenantId" AND u."id" = OLD."userId" AND u."deletedAt" IS NULL)
  THEN
    RAISE EXCEPTION 'The Employee role cannot be removed from an active user'
      USING ERRCODE = 'check_violation', HINT = 'USER_EMPLOYEE_ROLE_REQUIRED';
  END IF;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS "userRolesKeepEmployee" ON "Company"."UserRoles";
CREATE TRIGGER "userRolesKeepEmployee" BEFORE DELETE ON "Company"."UserRoles"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerKeepEmployeeRole"();

-- Backfill: existing users in tenants that already have an Employee role.
INSERT INTO "Company"."UserRoles" ("tenantId", "userId", "roleId", "isPrimary")
SELECT u."tenantId", u."id", r."id", false
FROM "Company"."Users" u
JOIN "Company"."Roles" r ON r."tenantId" = u."tenantId" AND r."systemKey" = 'EMPLOYEE' AND r."deletedAt" IS NULL
WHERE u."deletedAt" IS NULL
ON CONFLICT ("tenantId", "userId", "roleId") DO NOTHING;
