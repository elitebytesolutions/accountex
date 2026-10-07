-- Phase 2: Access & security (users, roles & permissions, approval workflows, document templates, account & security).
-- Idempotent. Apply with: npm run db:sql

-- ---------------------------------------------------------------------------
-- 1. Audit coverage (row history)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "permissionsAudit" ON "Company"."Permissions";
CREATE TRIGGER "permissionsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Company"."Permissions"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "documentTypesAudit" ON "Company"."DocumentTypes";
CREATE TRIGGER "documentTypesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Company"."DocumentTypes"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "userPreferencesAudit" ON "Company"."UserPreferences";
CREATE TRIGGER "userPreferencesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Company"."UserPreferences"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
-- Sessions: sign-in, revoke and delete only. The once-a-minute lastActiveAt refresh is not history.
DROP TRIGGER IF EXISTS "userSessionsAudit" ON "Company"."UserSessions";
CREATE TRIGGER "userSessionsAudit" AFTER INSERT OR DELETE OR UPDATE OF "revokedAt" ON "Company"."UserSessions"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditRedacted"('tokenHash');

-- ---------------------------------------------------------------------------
-- 2. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged")
VALUES
  ('AUTH_SESSION_REVOKED',          401, 'AUTH',          'SYSTEM', 'You were signed out of this device. Sign in again.', 'Session revoked (sign-out, admin, suspension or password change)', true),
  ('AUTH_SESSION_EXPIRED',          401, 'AUTH',          'SYSTEM', 'Your session expired. Sign in again.', 'Session past expiresAt or idle longer than the user''s timeout', true),
  ('AUTH_OUTSIDE_LOGIN_HOURS',      403, 'AUTH',          'SYSTEM', 'Your account can only sign in during its allowed hours.', 'Sign-in outside Users.loginHours', true),
  ('AUTH_IP_NOT_ALLOWED',           403, 'AUTH',          'SYSTEM', 'Your account can''t sign in from this network.', 'Sign-in from an IP outside Users.ipAllowlist', true),
  ('AUTH_PASSWORD_CHANGE_REQUIRED', 403, 'AUTH',          'SYSTEM', 'Set a new password to continue.', 'mustChangePassword is set', false),
  ('AUTH_ACCOUNT_LOCKED',           423, 'AUTH',          'SYSTEM', 'Too many failed sign-ins. Try again in a few minutes or ask your administrator.', 'Users.lockedUntil in the future', true),
  ('AUTH_PASSWORD_INCORRECT',       422, 'VALIDATION',    'SYSTEM', 'Your current password is not correct.', 'Change password with a wrong current password', true),
  ('PASSWORD_TOO_WEAK',             422, 'VALIDATION',    'SYSTEM', 'Use at least 10 characters with letters and numbers.', 'Password fails the strength policy', false),
  ('USER_SELF_ACTION',              409, 'BUSINESS_RULE', 'SYSTEM', 'You can''t do this to your own account.', 'Suspend/remove/reset on yourself', true),
  ('ROLE_SYSTEM_LOCKED',            409, 'BUSINESS_RULE', 'SYSTEM', 'System roles can''t be renamed or deleted, and the Admin role always keeps every permission.', 'System role rename/delete or Admin grant removal', true),
  ('ROLE_IN_USE',                   409, 'BUSINESS_RULE', 'SYSTEM', 'This role is still assigned to users. Move them to another role first.', 'Delete of a role held by users other than the default user', true),
  ('WORKFLOW_STEPS_REQUIRED',       422, 'VALIDATION',    'SYSTEM', 'Add at least one approval step before publishing.', 'Publish without steps', true),
  ('WORKFLOW_DUPLICATE',            409, 'BUSINESS_RULE', 'SYSTEM', 'Another active workflow already covers this document type with the same conditions.', 'Two active workflows with the same subject and conditions', true),
  ('DOC_TEMPLATE_DEFAULT_LOCKED',   409, 'BUSINESS_RULE', 'SYSTEM', 'The default template must stay active. Make another template the default first.', 'Default template deactivated or deleted', true)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 3. System roles: name and key fixed, never deleted; the Admin role keeps every permission
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."triggerRoleSystemLock"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF NOT OLD."isSystem" THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' OR NEW."deletedAt" IS NOT NULL OR NOT NEW."isSystem"
     OR NEW."name" IS DISTINCT FROM OLD."name" OR NEW."systemKey" IS DISTINCT FROM OLD."systemKey" THEN
    RAISE EXCEPTION 'System role % cannot be renamed or deleted', OLD."name" USING ERRCODE = 'check_violation', HINT = 'ROLE_SYSTEM_LOCKED';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "rolesSystemLock" ON "Company"."Roles";
CREATE TRIGGER "rolesSystemLock" BEFORE UPDATE OR DELETE ON "Company"."Roles"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerRoleSystemLock"();

CREATE OR REPLACE FUNCTION "Company"."triggerAdminGrantsLock"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM "Company"."Roles" r WHERE r."tenantId" = OLD."tenantId" AND r."id" = OLD."roleId" AND r."systemKey" = 'ADMIN')
     -- a permission retired from the catalogue may still take its grants with it
     AND EXISTS (SELECT 1 FROM "Company"."Permissions" p WHERE p."code" = OLD."permissionCode") THEN
    RAISE EXCEPTION 'The Admin role keeps every permission' USING ERRCODE = 'check_violation', HINT = 'ROLE_SYSTEM_LOCKED';
  END IF;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS "rolePermissionsAdminLock" ON "Company"."RolePermissions";
CREATE TRIGGER "rolePermissionsAdminLock" BEFORE DELETE ON "Company"."RolePermissions"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAdminGrantsLock"();

-- ---------------------------------------------------------------------------
-- 4. Document templates: one default per category / document type / letter kind, and it stays active
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."setDefaultDocumentTemplate"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "t" "Company"."DocumentTemplates";
BEGIN
  SELECT * INTO "t" FROM "Company"."DocumentTemplates" d
   WHERE d."tenantId" = "vTenant" AND d."id" = "pId" AND d."deletedAt" IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document template % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE "Company"."DocumentTemplates" d SET "isDefault" = false
   WHERE d."tenantId" = "vTenant" AND d."isDefault" AND d."deletedAt" IS NULL AND d."id" <> "pId"
     AND d."category" = "t"."category" AND d."docType" IS NOT DISTINCT FROM "t"."docType"
     AND d."letterKind" IS NOT DISTINCT FROM "t"."letterKind";
  UPDATE "Company"."DocumentTemplates" d SET "isDefault" = true, "status" = 'ACTIVE'
   WHERE d."tenantId" = "vTenant" AND d."id" = "pId" AND NOT d."isDefault";
END $function$;

CREATE OR REPLACE FUNCTION "Company"."triggerDocumentTemplateDefaultLock"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF OLD."isDefault" AND (TG_OP = 'DELETE' OR NEW."deletedAt" IS NOT NULL OR (NEW."isDefault" AND NEW."status" <> 'ACTIVE')) THEN
    RAISE EXCEPTION 'The default template must stay active' USING ERRCODE = 'check_violation', HINT = 'DOC_TEMPLATE_DEFAULT_LOCKED';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $function$;

DROP TRIGGER IF EXISTS "documentTemplatesDefaultLock" ON "Company"."DocumentTemplates";
CREATE TRIGGER "documentTemplatesDefaultLock" BEFORE UPDATE OF "status", "deletedAt", "isDefault" OR DELETE ON "Company"."DocumentTemplates"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerDocumentTemplateDefaultLock"();

-- ---------------------------------------------------------------------------
-- 5. Readable labels for the Phase 2 selects (template wording). Labels only; codes unchanged.
-- ---------------------------------------------------------------------------
SELECT set_config('app.actorLabel', '008-access-security.sql', true);
UPDATE "Lookups"."Lookups" l
   SET "label" = v.label
  FROM (VALUES
    ('DataScope','OWN','Own records'), ('DataScope','BRANCH','Their branches'), ('DataScope','ALL','All company'),
    ('LoginHours','ANY','Anytime'), ('LoginHours','BUSINESS','Business hours'), ('LoginHours','CUSTOM','Custom window'),
    ('SalaryVisibility','HIDDEN','Hidden'), ('SalaryVisibility','MASKED','Masked'), ('SalaryVisibility','FULL','Full'),
    ('ApprovalMode','ANY','Any one approver'), ('ApprovalMode','ALL','All approvers'),
    ('ApproverType','LINE_MANAGER','Line manager'),
    ('ApprovalWorkflowConditionField','DOC_TYPE','Document type'), ('ApprovalWorkflowConditionField','COST_CENTRE','Cost centre'),
    ('ApprovalWorkflowConditionField','LEAVE_DAYS','Leave days'), ('ApprovalWorkflowConditionField','CREDIT_BREACH_AMOUNT','Credit breach amount'),
    ('ApprovalWorkflowConditionOperator','GT','is greater than'), ('ApprovalWorkflowConditionOperator','GTE','is at least'),
    ('ApprovalWorkflowConditionOperator','LT','is less than'), ('ApprovalWorkflowConditionOperator','LTE','is at most'),
    ('ApprovalWorkflowConditionOperator','EQ','equals'), ('ApprovalWorkflowConditionOperator','NEQ','does not equal'),
    ('ApprovalWorkflowConditionOperator','IN','is one of'), ('ApprovalWorkflowConditionOperator','NOT_IN','is not one of'),
    ('ApprovalWorkflowConditionOperator','BETWEEN','is between'),
    ('OnComplete','AUTO_POST','Post automatically'), ('OnComplete','MARK_APPROVED','Mark as approved'),
    ('OnReject','RETURN_TO_PREPARER','Return to preparer'), ('OnReject','CANCEL','Cancel the document'),
    ('OnSlaBreach','ESCALATE','Escalate to next approver'), ('OnSlaBreach','REMIND','Send a reminder'),
    ('DocumentTemplateCategory','HR_LETTER','HR letter'),
    ('DocumentTemplateLanguage','EN','English'), ('DocumentTemplateLanguage','EN_UR','English + Urdu'),
    ('HeaderLayout','LOGO_LEFT','Logo left'), ('HeaderLayout','CENTERED_LETTERHEAD','Centred letterhead'),
    ('LetterKind','SALARY_CERTIFICATE','Salary certificate'),
    ('Paper','A4_PORTRAIT','A4 portrait'), ('Paper','THERMAL_80MM','Thermal 80 mm'),
    ('ClientType','IOS_APP','iOS app'), ('ClientType','ANDROID_APP','Android app'),
    ('UserSessionAuthMethod','SSO_GOOGLE','Google sign-in'), ('UserSessionAuthMethod','SSO_MICROSOFT','Microsoft sign-in'), ('UserSessionAuthMethod','SSO_SAML','SAML sign-in'),
    ('RevokeReason','SIGN_OUT','Signed out'), ('RevokeReason','USER_REVOKED','Signed out by the user'), ('RevokeReason','ADMIN_REVOKED','Signed out by an admin'),
    ('RevokeReason','PASSWORD_CHANGED','Password changed'), ('RevokeReason','IDLE_TIMEOUT','Idle timeout'),
    ('DateFormat','DD MMM YYYY','01 Oct 2026'), ('DateFormat','DD/MM/YYYY','01/10/2026'), ('DateFormat','YYYY-MM-DD','2026-10-01'),
    ('EnUrLanguage','EN','English'), ('EnUrLanguage','UR','اردو (Urdu)'),
    ('StartRoute','app/dashboard','Dashboard'), ('StartRoute','app/today','Today''s Work'), ('StartRoute','app/accounting/vouchers','Vouchers'),
    ('Theme','SYSTEM','Match system')
  ) AS v("lookupType", code, label)
 WHERE l."lookupType" = v."lookupType" AND l.code = v.code AND l."tenantId" IS NULL AND l."label" IS DISTINCT FROM v.label;

-- ---------------------------------------------------------------------------
-- 6. System roles carry an icon and tone (role pills, Roles & Permissions list). New tenants get them on insert.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."systemRoleLook"("pKey" text, OUT "icon" text, OUT "tone" text)
  LANGUAGE sql IMMUTABLE
AS $function$
  SELECT v.icon, v.tone FROM (VALUES
    ('ADMIN','crown','violet'), ('FINANCIAL_ACCOUNTANT','landmark','green'), ('HR_MANAGER','users','orange'),
    ('SALESMAN','shopping-cart','yellow'), ('ORDER_BOOKER','clipboard-list','red'), ('DELIVERYMAN','truck','teal'),
    ('STOREKEEPER','warehouse','brown'), ('CASHIER','banknote','lime'), ('AUDITOR','eye','neutral'), ('EMPLOYEE','user-round','blue')
  ) AS v(k, icon, tone) WHERE v.k = "pKey"
$function$;

CREATE OR REPLACE FUNCTION "Company"."triggerRoleDefaultLook"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE "l" record;
BEGIN
  IF NEW."systemKey" IS NOT NULL AND (NEW."icon" IS NULL OR NEW."tone" IS NULL) THEN
    SELECT * INTO "l" FROM "Company"."systemRoleLook"(NEW."systemKey");
    NEW."icon" := COALESCE(NEW."icon", "l"."icon");
    NEW."tone" := COALESCE(NEW."tone", "l"."tone");
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "rolesDefaultLook" ON "Company"."Roles";
CREATE TRIGGER "rolesDefaultLook" BEFORE INSERT ON "Company"."Roles"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerRoleDefaultLook"();

UPDATE "Company"."Roles" r
   SET "icon" = COALESCE(r."icon", ("Company"."systemRoleLook"(r."systemKey"))."icon"),
       "tone" = COALESCE(r."tone", ("Company"."systemRoleLook"(r."systemKey"))."tone")
 WHERE r."systemKey" IS NOT NULL AND (r."icon" IS NULL OR r."tone" IS NULL);
