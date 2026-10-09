-- Phase 44 — Work queue & sign-in recovery: row history on tasks / notifications / preferences / password resets /
-- trusted devices; Company.notify (the one writer of in-app notifications, honouring IN_APP preferences) with
-- notifyPermission (everyone holding a permission); task assignment, completion with repeat and reminder
-- notifications; daily due-item notifications (overdue invoices, bills and cheques due); password reset / invite
-- tokens (sha256 stored, single use) issued, looked up and consumed; error codes. Idempotent.
SELECT set_config('app.actorLabel', '305-work-queue.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Row history on the tables that had none (token hashes redacted)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Tasks', 'Notifications', 'NotificationPreferences'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON "Company".%I', lower(left(t, 1)) || substr(t, 2) || 'Audit', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON "Company".%I FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"()',
                   lower(left(t, 1)) || substr(t, 2) || 'Audit', t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS "passwordResetsAudit" ON "Company"."PasswordResets";
CREATE TRIGGER "passwordResetsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Company"."PasswordResets"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditRedacted"('tokenHash');
DROP TRIGGER IF EXISTS "trustedDevicesAudit" ON "Company"."TrustedDevices";
CREATE TRIGGER "trustedDevicesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Company"."TrustedDevices"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditRedacted"('deviceFingerprintHash', 'pushToken');

-- Tasks are referenced by their notifications (entity pair → DocumentTypes)
INSERT INTO "Company"."DocumentTypes" (code, name, module, "tableName", "defaultPrefix", "defaultPattern", "defaultPadding", "defaultResetPolicy", "sortOrder")
VALUES ('TASK', 'Task', 'core', '"Company"."Tasks"', 'TASK', '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', 990)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Notifications
-- ---------------------------------------------------------------------------
-- The one writer of in-app notifications. Skipped (NULL) when the user is the actor, is not an active user, or switched
-- the event (or ALL_EVENTS) off for IN_APP (or set a minimum amount above this one). Same event + document + user within pDedupHours → skipped.
CREATE OR REPLACE FUNCTION "Company"."notify"(
  "pTenant" uuid, "pUserId" uuid, "pEventCode" text, "pCategory" text, "pTitle" text, "pBody" text DEFAULT NULL,
  "pLinkRoute" text DEFAULT NULL, "pEntityType" text DEFAULT NULL, "pEntityId" uuid DEFAULT NULL, "pAmount" numeric DEFAULT NULL,
  "pSeverity" text DEFAULT 'INFO', "pNeedsAction" boolean DEFAULT false, "pActorUserId" uuid DEFAULT NULL, "pDedupHours" integer DEFAULT NULL)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vId" uuid;
  "vType" text := CASE WHEN "pEntityId" IS NOT NULL AND EXISTS (SELECT 1 FROM "Company"."DocumentTypes" d WHERE d.code = "pEntityType") THEN "pEntityType" END;
BEGIN
  IF "pUserId" IS NULL OR "pUserId" = "pActorUserId" THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Company"."Users" u WHERE u."tenantId" = "pTenant" AND u.id = "pUserId" AND u.status = 'ACTIVE' AND u."deletedAt" IS NULL) THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM "Company"."NotificationPreferences" p
              WHERE p."tenantId" = "pTenant" AND p."userId" = "pUserId" AND p."eventCode" IN ("pEventCode", 'ALL_EVENTS') AND p.channel = 'IN_APP'
                AND (NOT p."isEnabled" OR (p."minAmount" IS NOT NULL AND COALESCE("pAmount", 0) < p."minAmount"))) THEN
    RETURN NULL;
  END IF;
  IF "pDedupHours" IS NOT NULL AND "pEntityId" IS NOT NULL AND EXISTS (
       SELECT 1 FROM "Company"."Notifications" n
        WHERE n."tenantId" = "pTenant" AND n."userId" = "pUserId" AND n."eventCode" = "pEventCode" AND n."entityId" = "pEntityId"
          AND n."createdAt" > now() - make_interval(hours => "pDedupHours")) THEN
    RETURN NULL;
  END IF;
  INSERT INTO "Company"."Notifications" ("tenantId", "userId", category, "eventCode", title, body, "linkRoute", "entityType", "entityId",
                                         "actorUserId", amount, severity, "needsAction", channels)
  VALUES ("pTenant", "pUserId", "pCategory", "pEventCode", left("pTitle", 200), "pBody", "pLinkRoute", "vType", CASE WHEN "vType" IS NOT NULL THEN "pEntityId" END,
          "pActorUserId", "pAmount", COALESCE("pSeverity", 'INFO'), COALESCE("pNeedsAction", false), ARRAY['IN_APP'])
  RETURNING id INTO "vId";
  RETURN "vId";
END $function$;

-- Notifies every active user holding a permission (through any role). Returns how many were notified.
CREATE OR REPLACE FUNCTION "Company"."notifyPermission"(
  "pTenant" uuid, "pPermission" text, "pEventCode" text, "pCategory" text, "pTitle" text, "pBody" text DEFAULT NULL,
  "pLinkRoute" text DEFAULT NULL, "pEntityType" text DEFAULT NULL, "pEntityId" uuid DEFAULT NULL, "pAmount" numeric DEFAULT NULL,
  "pSeverity" text DEFAULT 'INFO', "pNeedsAction" boolean DEFAULT false, "pActorUserId" uuid DEFAULT NULL, "pDedupHours" integer DEFAULT NULL)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vUser" uuid;
  "vN" integer := 0;
BEGIN
  FOR "vUser" IN
    SELECT DISTINCT ur."userId"
      FROM "Company"."UserRoles" ur
      JOIN "Company"."RolePermissions" rp ON rp."tenantId" = ur."tenantId" AND rp."roleId" = ur."roleId" AND rp."permissionCode" = "pPermission"
     WHERE ur."tenantId" = "pTenant"
  LOOP
    IF "Company"."notify"("pTenant", "vUser", "pEventCode", "pCategory", "pTitle", "pBody", "pLinkRoute", "pEntityType", "pEntityId",
                          "pAmount", "pSeverity", "pNeedsAction", "pActorUserId", "pDedupHours") IS NOT NULL THEN
      "vN" := "vN" + 1;
    END IF;
  END LOOP;
  RETURN "vN";
END $function$;

-- Daily: overdue sales invoices (to receivables), bills due today (to payables), cheques maturing today (to banking).
-- One notification per document and user per day.
CREATE OR REPLACE FUNCTION "Company"."notifyDueItems"("pTenant" uuid, "pDate" date)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vR" record;
  "vN" integer := 0;
BEGIN
  FOR "vR" IN
    SELECT i.id, i."docNo", COALESCE(i."buyerName", c.name) AS party, round(i."balanceAmount" * COALESCE(NULLIF(i."fxRate", 0), 1), 2) AS amt,
           ("pDate" - i."dueDate") AS days, split_part(i."docNo", '-', 1) AS dt
      FROM "Sales"."SalesInvoices" i
      LEFT JOIN "Sales"."Customers" c ON c."tenantId" = i."tenantId" AND c.id = i."customerId"
     WHERE i."tenantId" = "pTenant" AND i.status IN ('POSTED', 'PARTIALLY_PAID') AND i."balanceAmount" > 0 AND i."dueDate" < "pDate"
  LOOP
    "vN" := "vN" + "Company"."notifyPermission"("pTenant", 'rcpt:create', 'INVOICE_OVERDUE', 'FINANCE',
      'Invoice overdue · ' || "vR"."docNo", "vR".party || ' · ' || "vR".days || ' day' || CASE WHEN "vR".days = 1 THEN '' ELSE 's' END || ' overdue',
      '/sales/invoices/' || "vR".id, "vR".dt, "vR".id, "vR".amt, 'DANGER', true, NULL, 20);
  END LOOP;
  FOR "vR" IN
    SELECT b.id, b."docNo", v.name AS party, round(b."balanceAmount" * COALESCE(NULLIF(b."fxRate", 0), 1), 2) AS amt,
           CASE WHEN b.channel = 'COUNTER' THEN 'PV' ELSE 'BILL' END AS dt
      FROM "Purchases"."VendorBills" b
      JOIN "Purchases"."Vendors" v ON v."tenantId" = b."tenantId" AND v.id = b."vendorId"
     WHERE b."tenantId" = "pTenant" AND b.status IN ('POSTED', 'PARTIALLY_PAID') AND b."balanceAmount" > 0 AND b."dueDate" = "pDate"
  LOOP
    "vN" := "vN" + "Company"."notifyPermission"("pTenant", 'vpay:create', 'BILL_DUE', 'FINANCE',
      'Bill due today · ' || "vR"."docNo", "vR".party, '/purchases/bills/' || "vR".id, "vR".dt, "vR".id, "vR".amt, 'WARN', true, NULL, 20);
  END LOOP;
  FOR "vR" IN
    SELECT q.id, q."chequeNo", q."partyName" AS party, q.amount AS amt, q.direction
      FROM "BankCash"."Cheques" q
     WHERE q."tenantId" = "pTenant" AND q.status IN ('IN_HAND', 'ISSUED') AND COALESCE(q."dueDate", q."chequeDate") = "pDate"
  LOOP
    "vN" := "vN" + "Company"."notifyPermission"("pTenant", 'bank:edit', 'CHEQUE_MATURING', 'FINANCE',
      'Cheque maturing today · ' || COALESCE("vR"."chequeNo", ''), COALESCE("vR".party, ''), '/bank/cheques', NULL, NULL, "vR".amt, 'INFO', false, NULL, NULL);
  END LOOP;
  RETURN "vN";
END $function$;

-- ---------------------------------------------------------------------------
-- 3. Tasks
-- ---------------------------------------------------------------------------
-- A task given to someone else notifies them (insert, or the assignee changes).
CREATE OR REPLACE FUNCTION "Company"."triggerTaskAssigned"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vActor" uuid := COALESCE(NEW."assignedByUserId", "Company"."getCurrentUserId"());
BEGIN
  IF NEW.status IN ('PENDING', 'IN_PROGRESS') AND NEW."assigneeUserId" IS DISTINCT FROM "vActor"
     AND (TG_OP = 'INSERT' OR NEW."assigneeUserId" IS DISTINCT FROM OLD."assigneeUserId") THEN
    PERFORM "Company"."notify"(NEW."tenantId", NEW."assigneeUserId", 'TASK_ASSIGNED', 'SYSTEM', 'Task assigned · ' || NEW.title,
      'Due ' || to_char(NEW."dueDate", 'DD Mon YYYY') || COALESCE(' ' || to_char(NEW."dueTime", 'HH24:MI'), '') ||
      COALESCE(' · by ' || (SELECT u."fullName" FROM "Company"."Users" u WHERE u."tenantId" = NEW."tenantId" AND u.id = "vActor"), ''),
      '/today', 'TASK', NEW.id, NULL, CASE NEW.priority WHEN 'HIGH' THEN 'WARN' ELSE 'INFO' END, true, "vActor", NULL);
  END IF;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tasksAssigned" ON "Company"."Tasks";
CREATE TRIGGER "tasksAssigned" AFTER INSERT OR UPDATE OF "assigneeUserId" ON "Company"."Tasks"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerTaskAssigned"();

-- Done: stamps completedAt; a repeating task gets its next occurrence (same time, next day / week / month). Returns the
-- next task's id (NULL when it doesn't repeat).
CREATE OR REPLACE FUNCTION "Company"."taskComplete"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vT"      "Company"."Tasks";
  "vNext"   uuid;
BEGIN
  SELECT * INTO "vT" FROM "Company"."Tasks" t WHERE t."tenantId" = "vTenant" AND t.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vT".status NOT IN ('PENDING', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'This task is already %', lower("vT".status) USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TASK_NOT_OPEN';
  END IF;
  UPDATE "Company"."Tasks" t SET status = 'DONE', "completedAt" = now() WHERE t.id = "pId";
  IF "vT"."repeatRule" <> 'NEVER' THEN
    INSERT INTO "Company"."Tasks" ("tenantId", kind, title, notes, module, "assigneeUserId", "assignedByUserId", participants, "dueDate", "dueTime",
                                   priority, status, "repeatRule", "remindBeforeMin", source, "linkRoute", "entityType", "entityId")
    VALUES ("vTenant", "vT".kind, "vT".title, "vT".notes, "vT".module, "vT"."assigneeUserId", "vT"."assignedByUserId", "vT".participants,
            ("vT"."dueDate" + CASE "vT"."repeatRule" WHEN 'DAILY' THEN interval '1 day' WHEN 'WEEKLY' THEN interval '7 days' ELSE interval '1 month' END)::date,
            "vT"."dueTime", "vT".priority, 'PENDING', "vT"."repeatRule", "vT"."remindBeforeMin", "vT".source, "vT"."linkRoute", "vT"."entityType", "vT"."entityId")
    RETURNING id INTO "vNext";
  END IF;
  RETURN "vNext";
END $function$;

-- Reminders: open tasks whose (due date + time − remindBeforeMin), in the company's time zone, has come and whose due
-- moment hasn't passed by more than a day. One reminder per task.
CREATE OR REPLACE FUNCTION "Company"."notifyTaskReminders"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTz" text := COALESCE((SELECT NULLIF(cs.timezone, '') FROM "Company"."CompanySettings" cs WHERE cs."tenantId" = "pTenant"), 'Asia/Karachi');
  "vR"  record;
  "vN"  integer := 0;
BEGIN
  FOR "vR" IN
    SELECT t.id, t.title, t."assigneeUserId", t."dueDate", t."dueTime", t."remindBeforeMin",
           (t."dueDate" + t."dueTime") AT TIME ZONE "vTz" AS due_at
      FROM "Company"."Tasks" t
     WHERE t."tenantId" = "pTenant" AND t.status IN ('PENDING', 'IN_PROGRESS') AND t."dueTime" IS NOT NULL AND t."remindBeforeMin" IS NOT NULL
       AND t."dueDate" BETWEEN current_date - 1 AND current_date + 2
       AND NOT EXISTS (SELECT 1 FROM "Company"."Notifications" n WHERE n."tenantId" = t."tenantId" AND n."eventCode" = 'TASK_REMINDER' AND n."entityId" = t.id)
  LOOP
    IF now() >= "vR".due_at - make_interval(mins => "vR"."remindBeforeMin") AND now() < "vR".due_at + interval '1 day' THEN
      IF "Company"."notify"("pTenant", "vR"."assigneeUserId", 'TASK_REMINDER', 'SYSTEM', 'Reminder · ' || "vR".title,
           'Due ' || to_char("vR"."dueTime", 'HH24:MI') || CASE WHEN "vR"."dueDate" = current_date THEN ' today' ELSE ' on ' || to_char("vR"."dueDate", 'DD Mon') END,
           '/today', 'TASK', "vR".id, NULL, 'WARN', false, NULL, NULL) IS NOT NULL THEN
        "vN" := "vN" + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN "vN";
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Password resets and invites (tokens: 32 random bytes; only their sha256 is stored)
-- ---------------------------------------------------------------------------
-- Issues a token for a user; earlier unused tokens of the same purpose are voided (expired now).
CREATE OR REPLACE FUNCTION "Company"."passwordResetIssue"("pTenant" uuid, "pUserId" uuid, "pPurpose" text, "pChannel" text, "pHash" bytea,
                                                          "pExpiresAt" timestamptz, "pRequestedBy" uuid, "pIp" inet)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vId" uuid;
BEGIN
  UPDATE "Company"."PasswordResets" r SET "expiresAt" = GREATEST(r."createdAt" + interval '1 second', now())
   WHERE r."tenantId" = "pTenant" AND r."userId" = "pUserId" AND r.purpose = "pPurpose" AND r."usedAt" IS NULL AND r."expiresAt" > now();
  INSERT INTO "Company"."PasswordResets" ("tenantId", "userId", purpose, "tokenHash", channel, "requestedIp", "requestedByUserId", "expiresAt")
  VALUES ("pTenant", "pUserId", "pPurpose", "pHash", "pChannel", "pIp", "pRequestedBy", "pExpiresAt")
  RETURNING id INTO "vId";
  RETURN "vId";
END $function$;

-- Looks a token up (public: no tenant context yet). Valid = not used, not expired, user not removed / suspended,
-- invite still pending.
CREATE OR REPLACE FUNCTION "Company"."passwordResetLookup"("pHash" bytea)
  RETURNS TABLE ("resetId" uuid, "tenantId" uuid, "userId" uuid, purpose text, valid boolean, email text, "fullName" text, "companyName" text, "companyCode" text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT r.id, r."tenantId", r."userId", r.purpose,
         (r."usedAt" IS NULL AND r."expiresAt" > now() AND u.status IN ('ACTIVE', 'INVITED') AND u."deletedAt" IS NULL
          AND (r.purpose <> 'INVITE' OR EXISTS (SELECT 1 FROM "Company"."UserInvites" i WHERE i."tenantId" = r."tenantId" AND i."passwordResetId" = r.id AND i.status = 'PENDING'))),
         u.email::text, u."fullName", COALESCE(cs."tradingName", cs."legalName", t."displayName", t."legalName"), t.code
    FROM "Company"."PasswordResets" r
    JOIN "Company"."Users" u ON u."tenantId" = r."tenantId" AND u.id = r."userId"
    JOIN "Platform"."Tenants" t ON t.id = r."tenantId"
    LEFT JOIN "Company"."CompanySettings" cs ON cs."tenantId" = r."tenantId"
   WHERE r."tokenHash" = "pHash"
$function$;

-- Uses a token (call in the token's tenant context): sets the password, activates an invited user, accepts the invite
-- (and tells the inviter), clears lockout. Raises TOKEN_INVALID_OR_EXPIRED otherwise.
CREATE OR REPLACE FUNCTION "Company"."passwordResetConsume"("pHash" bytea, "pPasswordHash" text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vR"      "Company"."PasswordResets";
  "vU"      "Company"."Users";
  "vInv"    "Company"."UserInvites";
BEGIN
  SELECT * INTO "vR" FROM "Company"."PasswordResets" r WHERE r."tenantId" = "vTenant" AND r."tokenHash" = "pHash" FOR UPDATE;
  IF NOT FOUND OR "vR"."usedAt" IS NOT NULL OR "vR"."expiresAt" <= now() THEN
    RAISE EXCEPTION 'This link is invalid or has expired' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TOKEN_INVALID_OR_EXPIRED';
  END IF;
  SELECT * INTO "vU" FROM "Company"."Users" u WHERE u."tenantId" = "vTenant" AND u.id = "vR"."userId" FOR UPDATE;
  IF "vU".status NOT IN ('ACTIVE', 'INVITED') OR "vU"."deletedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'This link is invalid or has expired' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TOKEN_INVALID_OR_EXPIRED';
  END IF;
  IF "vR".purpose = 'INVITE' THEN
    SELECT * INTO "vInv" FROM "Company"."UserInvites" i WHERE i."tenantId" = "vTenant" AND i."passwordResetId" = "vR".id FOR UPDATE;
    IF NOT FOUND OR "vInv".status <> 'PENDING' THEN
      RAISE EXCEPTION 'This invitation is no longer valid' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TOKEN_INVALID_OR_EXPIRED';
    END IF;
  END IF;
  UPDATE "Company"."PasswordResets" r SET "usedAt" = now() WHERE r.id = "vR".id;
  UPDATE "Company"."Users" u
     SET "passwordHash" = "pPasswordHash", "mustChangePassword" = false, "passwordChangedAt" = now(), "failedLoginCount" = 0, "lockedUntil" = NULL,
         status = 'ACTIVE', "activatedAt" = COALESCE(u."activatedAt", now())
   WHERE u.id = "vU".id;
  IF "vR".purpose = 'INVITE' THEN
    UPDATE "Company"."UserInvites" i SET status = 'ACCEPTED', "acceptedAt" = now() WHERE i.id = "vInv".id;
    PERFORM "Company"."notify"("vTenant", "vInv"."invitedByUserId", 'INVITE_ACCEPTED', 'SYSTEM', COALESCE("vU"."fullName", "vU".email::text) || ' accepted your invitation',
      "vU".email::text || ' can now sign in', '/settings/users', NULL, NULL, NULL, 'GOOD', false, "vU".id, NULL);
  END IF;
  RETURN "vU".id;
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('TASK_NOT_YOURS',           403, 'PERMISSION',    'SYSTEM', 'This task belongs to someone else.', 'Edit / complete of another user''s task', true, NULL),
  ('TASK_NOT_OPEN',            409, 'BUSINESS_RULE', 'SYSTEM', 'This task is already done or cancelled.', 'Complete / edit of a closed task', true, NULL),
  ('TOKEN_INVALID_OR_EXPIRED', 410, 'BUSINESS_RULE', 'ACCESS', 'This link is invalid or has expired. Ask your administrator for a new one.', 'Unknown, used or expired invite / reset token', true, NULL),
  ('INVITE_PENDING_EXISTS',    409, 'BUSINESS_RULE', 'ACCESS', 'This person already has a pending invitation. Resend it instead.', 'Second pending invite for an email', true, NULL),
  ('INVITE_NOT_PENDING',       409, 'BUSINESS_RULE', 'ACCESS', 'This invitation was already accepted, revoked or has expired.', 'Resend / revoke of a closed invite', true, NULL),
  ('USER_NOT_INVITABLE',       409, 'BUSINESS_RULE', 'ACCESS', 'This user can''t get a sign-in link in their current status.', 'Reset link for a removed / suspended user', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
