-- 107-admin-growth-support.sql
-- Phase 42: Growth & support (leads CRM, support tickets, platform announcements & broadcasts, communication logs).
-- Idempotent: safe to run repeatedly via npm run db:sql (or: npx prisma db execute --file prisma/sql/107-admin-growth-support.sql).

-- ---------------------------------------------------------------------------
-- 1. Row history of Platform tables written by a company user (support tickets raised in the workspace, announcement
--    receipts): Platform.PlatformAuditLogs.staffUserId references PlatformStaff, so it is only set for platform staff;
--    a company user is named in actorLabel / actorDetail (name, email) with the row's tenant. Same function as
--    105-admin-tenant-lifecycle.sql otherwise.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."writeAuditEntry"("pOp" text, "pSchema" text, "pTable" text, "pOld" jsonb, "pNew" jsonb, "pSecret" text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vOld"     jsonb := "pOld" - COALESCE("pSecret", '{}'::text[]);
  "vNew"     jsonb := "pNew" - COALESCE("pSecret", '{}'::text[]);
  "vDiff"    jsonb := '{}'::jsonb;
  "vKey"     text;
  "vRow"     jsonb;
  "vChanges" jsonb;
  "vUserId"  uuid := "Company"."getCurrentUserId"();
  "vName"    text;
  "vEmail"   text;
  "vLabel"   text;
  "vId"      text;
  "vIp"      inet := NULLIF(current_setting('app.clientIp', true), '')::inet;
  "vCorr"    text := NULLIF(current_setting('app.correlationId', true), '');
  "vAgent"   text := NULLIF(current_setting('app.userAgent', true), '');
  "vSession" text := NULLIF(current_setting('app.sessionId', true), '');
BEGIN
  -- Secrets never reach the log: removed from the row, shown as [redacted] when they change.
  IF "pSecret" IS NOT NULL THEN
    FOREACH "vKey" IN ARRAY "pSecret" LOOP
      IF "pNew" ? "vKey" THEN "vNew" := "vNew" || jsonb_build_object("vKey", '[redacted]'); END IF;
      IF "pOld" ? "vKey" THEN "vOld" := "vOld" || jsonb_build_object("vKey", '[redacted]'); END IF;
    END LOOP;
  END IF;

  IF "pOp" = 'UPDATE' THEN
    FOR "vKey" IN SELECT jsonb_object_keys("pNew") LOOP
      CONTINUE WHEN "vKey" IN ('updatedAt', 'updatedBy', 'rowVersion');
      IF ("pOld" -> "vKey") IS DISTINCT FROM ("pNew" -> "vKey") THEN
        "vDiff" := "vDiff" || jsonb_build_object("vKey",
                     jsonb_build_object('before', "vOld" -> "vKey", 'after', "vNew" -> "vKey"));
      END IF;
    END LOOP;
    IF "vDiff" = '{}'::jsonb THEN RETURN; END IF;
  END IF;

  "vRow"     := CASE "pOp" WHEN 'DELETE' THEN "vOld" ELSE "vNew" END;
  "vChanges" := CASE "pOp" WHEN 'UPDATE' THEN "vDiff" ELSE "vRow" END;

  -- Who: snapshot of the user's name/email now, so history stays right after renames or removal.
  IF "vUserId" IS NOT NULL THEN
    SELECT u."fullName", u."email"::text INTO "vName", "vEmail" FROM "Company"."Users" u WHERE u."id" = "vUserId";
  END IF;
  -- Phase 40: support access. A change made while a Super Admin impersonates a user names both identities.
  IF "vUserId" IS NOT NULL AND NULLIF(current_setting('app.impersonatedBy', true), '') IS NOT NULL THEN
    "vName" := current_setting('app.impersonatedBy', true) || ' as ' || COALESCE("vName", 'user');
  END IF;
  IF "vName" IS NULL THEN
    "vName" := COALESCE(NULLIF(current_setting('app.actorLabel', true), ''), CASE WHEN "vUserId" IS NULL THEN 'system' END);
    IF "vUserId" IS NULL AND "vName" <> 'system' THEN "vName" := 'system: ' || "vName"; END IF;
  END IF;

  "vLabel" := COALESCE("vRow" ->> 'name', "vRow" ->> 'fullName', "vRow" ->> 'displayName', "vRow" ->> 'title', "vRow" ->> 'code', "vRow" ->> 'label');
  "vId"    := "vRow" ->> 'id';

  IF "pSchema" = 'Platform' THEN
    INSERT INTO "Platform"."PlatformAuditLogs"
      ("occurredAt", "staffUserId", "actorLabel", "actorDetail", action, "tenantId", details, payload, "rowData",
       "ipAddress", "correlationId", "userAgent", result)
    VALUES (now(), CASE WHEN EXISTS (SELECT 1 FROM "Platform"."PlatformStaff" s WHERE s.id = "vUserId") THEN "vUserId" END, COALESCE("vName", 'system'), "vEmail", "pTable" || '.' || lower("pOp"),
            ("vRow" ->> 'tenantId')::uuid, "pSchema" || '.' || "pTable" || ' ' || COALESCE("vId", ''),
            "vChanges", "vRow", "vIp", "vCorr", "vAgent", 'RECORDED');
    RETURN;
  END IF;

  INSERT INTO "Company"."AuditTrailEntries"
    ("tenantId", "occurredAt", "userId", "actorName", "actorEmail", action, "schemaName", "tableName",
     "recordId", "recordLabel", changes, "rowData", "rowVersion", "ipAddress", "userAgent", "sessionId",
     "correlationId", "hashVersion")
  VALUES (("vRow" ->> 'tenantId')::uuid, now(), "vUserId", "vName", "vEmail", "pOp", "pSchema", "pTable",
          CASE WHEN "vId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN "vId"::uuid END,
          left("vLabel", 200), "vChanges", "vRow", NULLIF("vRow" ->> 'rowVersion', '')::integer,
          "vIp", "vAgent",
          CASE WHEN "vSession" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN "vSession"::uuid END,
          "vCorr", 2);
END $function$;


SELECT set_config('app.actorLabel', '107-admin-growth-support.sql', true);

-- ---------------------------------------------------------------------------
-- 2. Announcement receipts: one row per company user and announcement (first view, click, dismissal). No column of
--    Company.UserPreferences fits a per-announcement dismissal, so the dismissals live here; views and clicks are
--    counted once per user on Platform.Announcements.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Platform"."AnnouncementReceipts" (
  "id"             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "announcementId" uuid        NOT NULL REFERENCES "Platform"."Announcements"("id"),
  "tenantId"       uuid        NOT NULL REFERENCES "Platform"."Tenants"("id"),
  "userId"         uuid        NOT NULL,
  "viewedAt"       timestamptz NOT NULL DEFAULT now(),
  "clickedAt"      timestamptz,
  "dismissedAt"    timestamptz,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "createdBy"      uuid,
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedBy"      uuid,
  "rowVersion"     integer     NOT NULL DEFAULT 0,
  CONSTRAINT "announcementReceiptUserFk" FOREIGN KEY ("tenantId", "userId") REFERENCES "Company"."Users"("tenantId", "id"),
  CONSTRAINT "announcementReceiptUq" UNIQUE ("announcementId", "userId")
);
CREATE INDEX IF NOT EXISTS "announcementReceiptTenantIdx" ON "Platform"."AnnouncementReceipts" ("tenantId", "userId");
DROP TRIGGER IF EXISTS "announcementReceiptsStamp" ON "Platform"."AnnouncementReceipts";
CREATE TRIGGER "announcementReceiptsStamp" BEFORE INSERT ON "Platform"."AnnouncementReceipts"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerStampInsert"();
DROP TRIGGER IF EXISTS "announcementReceiptsTouch" ON "Platform"."AnnouncementReceipts";
CREATE TRIGGER "announcementReceiptsTouch" BEFORE UPDATE ON "Platform"."AnnouncementReceipts"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerTouch"();

-- ---------------------------------------------------------------------------
-- 3. Audit: the Phase 42 tables that had no row history (Platform tables log to Platform.PlatformAuditLogs).
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "platformLeadsAudit" ON "Platform"."PlatformLeads";
CREATE TRIGGER "platformLeadsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."PlatformLeads"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "platformLeadActivitiesAudit" ON "Platform"."PlatformLeadActivities";
CREATE TRIGGER "platformLeadActivitiesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."PlatformLeadActivities"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "supportTicketMessagesAudit" ON "Platform"."SupportTicketMessages";
CREATE TRIGGER "supportTicketMessagesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."SupportTicketMessages"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "announcementTargetsAudit" ON "Platform"."AnnouncementTargets";
CREATE TRIGGER "announcementTargetsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."AnnouncementTargets"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "communicationLogsAudit" ON "Platform"."CommunicationLogs";
CREATE TRIGGER "communicationLogsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."CommunicationLogs"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "announcementReceiptsAudit" ON "Platform"."AnnouncementReceipts";
CREATE TRIGGER "announcementReceiptsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."AnnouncementReceipts"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 4. platformLeadAddUpdate: leads are platform rows (no tenant). "tenantId" is the conversion link, taken from the
--    payload; the generated version scoped by the session tenant (null for the Super Admin) and never matched.
--    Soft delete = an update of "deletedAt"; deleted leads are not found.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."platformLeadAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRec" "Platform"."PlatformLeads";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."PlatformLeads", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."PlatformLeads" ("tenantId", "companyName", "contactPerson", phone, email, city, source, "partnerId", "ownerStaffId", "planInterestId", "expectedMrr", stage, "boardPosition", notes, "demoAt", "trialStartedOn", "trialEndsOn", "trialEngagementScore", "wonAt", "churnedAt", "lostReason")
    VALUES ("vRec"."tenantId", "vRec"."companyName", "vRec"."contactPerson", "vRec".phone, "vRec".email, "vRec".city, "vRec".source, "vRec"."partnerId", "vRec"."ownerStaffId", "vRec"."planInterestId",
            CASE WHEN "pData" ? 'expectedMrr' THEN "vRec"."expectedMrr" ELSE 0 END, CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE 'LEAD' END,
            CASE WHEN "pData" ? 'boardPosition' THEN "vRec"."boardPosition" ELSE 0 END, "vRec".notes, "vRec"."demoAt", "vRec"."trialStartedOn", "vRec"."trialEndsOn",
            "vRec"."trialEngagementScore", "vRec"."wonAt", "vRec"."churnedAt", "vRec"."lostReason")
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."PlatformLeads" t
       SET "tenantId" = CASE WHEN "pData" ? 'tenantId' THEN "vRec"."tenantId" ELSE t."tenantId" END,
           "companyName" = CASE WHEN "pData" ? 'companyName' THEN "vRec"."companyName" ELSE t."companyName" END,
           "contactPerson" = CASE WHEN "pData" ? 'contactPerson' THEN "vRec"."contactPerson" ELSE t."contactPerson" END,
           phone = CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE t.phone END,
           email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           city = CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE t.city END,
           source = CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE t.source END,
           "partnerId" = CASE WHEN "pData" ? 'partnerId' THEN "vRec"."partnerId" ELSE t."partnerId" END,
           "ownerStaffId" = CASE WHEN "pData" ? 'ownerStaffId' THEN "vRec"."ownerStaffId" ELSE t."ownerStaffId" END,
           "planInterestId" = CASE WHEN "pData" ? 'planInterestId' THEN "vRec"."planInterestId" ELSE t."planInterestId" END,
           "expectedMrr" = CASE WHEN "pData" ? 'expectedMrr' THEN "vRec"."expectedMrr" ELSE t."expectedMrr" END,
           stage = CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE t.stage END,
           "boardPosition" = CASE WHEN "pData" ? 'boardPosition' THEN "vRec"."boardPosition" ELSE t."boardPosition" END,
           notes = CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE t.notes END,
           "demoAt" = CASE WHEN "pData" ? 'demoAt' THEN "vRec"."demoAt" ELSE t."demoAt" END,
           "trialStartedOn" = CASE WHEN "pData" ? 'trialStartedOn' THEN "vRec"."trialStartedOn" ELSE t."trialStartedOn" END,
           "trialEndsOn" = CASE WHEN "pData" ? 'trialEndsOn' THEN "vRec"."trialEndsOn" ELSE t."trialEndsOn" END,
           "trialEngagementScore" = CASE WHEN "pData" ? 'trialEngagementScore' THEN "vRec"."trialEngagementScore" ELSE t."trialEngagementScore" END,
           "wonAt" = CASE WHEN "pData" ? 'wonAt' THEN "vRec"."wonAt" ELSE t."wonAt" END,
           "churnedAt" = CASE WHEN "pData" ? 'churnedAt' THEN "vRec"."churnedAt" ELSE t."churnedAt" END,
           "lostReason" = CASE WHEN "pData" ? 'lostReason' THEN "vRec"."lostReason" ELSE t."lostReason" END,
           "deletedAt" = CASE WHEN "pData" ? 'deletedAt' THEN "vRec"."deletedAt" ELSE t."deletedAt" END
     WHERE t.id = "vId" AND t."deletedAt" IS NULL
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."PlatformLeads" t WHERE t.id = "vId" AND t."deletedAt" IS NULL) THEN
        RAISE EXCEPTION 'PlatformLeads %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PlatformLeads % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  RETURN "vRet";
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Lead stage moves and conversion. Every stage change writes a STAGE_CHANGE activity (the pipeline view reads
--    them); PAID stamps wonAt, TRIAL the trial dates (plan trial days, else 14), CHURNED churnedAt and the reason.
--    A converted lead (tenantId set) can only move to CHURNED.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."leadMoveStage"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vId"    uuid := ("pData" ->> 'leadId')::uuid;
  "vTo"    text := "pData" ->> 'toStage';
  "vLead"  "Platform"."PlatformLeads";
  "vDays"  integer;
BEGIN
  SELECT * INTO "vLead" FROM "Platform"."PlatformLeads" WHERE id = "vId" AND "deletedAt" IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PlatformLeads % not found', "vId" USING ERRCODE = 'no_data_found'; END IF;
  IF "pData" ? 'rowVersion' AND "vLead"."rowVersion" <> ("pData" ->> 'rowVersion')::int THEN
    RAISE EXCEPTION 'PlatformLeads %: record was changed by another user, reload and try again', "vId" USING ERRCODE = 'serialization_failure';
  END IF;
  IF "vLead".stage = "vTo" THEN
    UPDATE "Platform"."PlatformLeads" SET "boardPosition" = COALESCE(("pData" ->> 'boardPosition')::int, "boardPosition") WHERE id = "vId";
    RETURN "vId";
  END IF;
  IF "vLead"."tenantId" IS NOT NULL AND "vTo" <> 'CHURNED' THEN
    RAISE EXCEPTION 'This lead is already a paying company; it can only be marked churned.' USING HINT = 'LEAD_ALREADY_CONVERTED';
  END IF;
  IF "vTo" = 'TRIAL' THEN
    SELECT p."trialDays" INTO "vDays" FROM "Platform"."SubscriptionPlans" p WHERE p.id = "vLead"."planInterestId";
  END IF;
  UPDATE "Platform"."PlatformLeads"
     SET stage = "vTo",
         "boardPosition" = COALESCE(("pData" ->> 'boardPosition')::int, "boardPosition"),
         "wonAt" = CASE WHEN "vTo" = 'PAID' THEN COALESCE("wonAt", now()) WHEN "tenantId" IS NULL THEN NULL ELSE "wonAt" END,
         "churnedAt" = CASE WHEN "vTo" = 'CHURNED' THEN now() ELSE NULL END,
         "lostReason" = CASE WHEN "vTo" = 'CHURNED' THEN COALESCE(NULLIF("pData" ->> 'lostReason', ''), "lostReason") ELSE NULL END,
         "trialStartedOn" = CASE WHEN "vTo" = 'TRIAL' THEN COALESCE("trialStartedOn", current_date) ELSE "trialStartedOn" END,
         "trialEndsOn" = CASE WHEN "vTo" = 'TRIAL' THEN COALESCE("trialEndsOn", current_date + COALESCE(NULLIF("vDays", 0), 14)) ELSE "trialEndsOn" END
   WHERE id = "vId";
  INSERT INTO "Platform"."PlatformLeadActivities" ("leadId", "activityType", "fromStage", "toStage", note, "staffUserId")
  VALUES ("vId", 'STAGE_CHANGE', "vLead".stage, "vTo", NULLIF("pData" ->> 'note', ''), NULLIF("pData" ->> 'staffUserId', '')::uuid);
  RETURN "vId";
END $function$;

CREATE OR REPLACE FUNCTION "Platform"."leadConvert"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vId"     uuid := ("pData" ->> 'leadId')::uuid;
  "vTenant" uuid := ("pData" ->> 'tenantId')::uuid;
  "vLead"   "Platform"."PlatformLeads";
  "vName"   text;
BEGIN
  SELECT * INTO "vLead" FROM "Platform"."PlatformLeads" WHERE id = "vId" AND "deletedAt" IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PlatformLeads % not found', "vId" USING ERRCODE = 'no_data_found'; END IF;
  IF "vLead"."tenantId" IS NOT NULL THEN
    RAISE EXCEPTION 'This lead has already been converted to a company.' USING HINT = 'LEAD_ALREADY_CONVERTED';
  END IF;
  SELECT "displayName" INTO "vName" FROM "Platform"."Tenants" WHERE id = "vTenant";
  IF "vName" IS NULL THEN RAISE EXCEPTION 'Tenants % not found', "vTenant" USING ERRCODE = 'no_data_found'; END IF;
  UPDATE "Platform"."PlatformLeads"
     SET "tenantId" = "vTenant", stage = 'PAID', "wonAt" = COALESCE("wonAt", now()), "churnedAt" = NULL, "lostReason" = NULL
   WHERE id = "vId";
  INSERT INTO "Platform"."PlatformLeadActivities" ("leadId", "activityType", "fromStage", "toStage", note, "staffUserId")
  VALUES ("vId", CASE WHEN "vLead".stage = 'PAID' THEN 'NOTE' ELSE 'STAGE_CHANGE' END,
          CASE WHEN "vLead".stage = 'PAID' THEN NULL ELSE "vLead".stage END, CASE WHEN "vLead".stage = 'PAID' THEN NULL ELSE 'PAID' END,
          'Converted: onboarded as ' || "vName", NULLIF("pData" ->> 'staffUserId', '')::uuid);
  RETURN "vId";
END $function$;

-- ---------------------------------------------------------------------------
-- 6. supportTicketAddUpdate: the tenant comes from the session (company users) or the payload (the Super Admin, whose
--    app.tenantId is empty, logs a ticket for a company); the docNo is the next TCK number; status is written;
--    messages are append-only (only new rows are inserted, nothing is deleted).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."supportTicketAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vSession" uuid := NULLIF(current_setting('app.tenantId', true), '')::uuid;  -- null for the Super Admin
  "vRec" "Platform"."SupportTickets";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vMsg" "Platform"."SupportTicketMessages";
  "vE" jsonb;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."SupportTickets", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."SupportTickets" ("tenantId", "docNo", subject, category, priority, status, channel, "requesterUserId", "requesterName", "requesterRole", "requesterEmail", "assigneeStaffId", "openedAt")
    VALUES (COALESCE("vSession", "vRec"."tenantId"),
            COALESCE(NULLIF("vRec"."docNo", ''), "Platform"."getNextPlatformDocumentNo"('TCK')),
            "vRec".subject, COALESCE("vRec".category, 'GENERAL'), COALESCE("vRec".priority, 'NORMAL'), COALESCE("vRec".status, 'NEW'),
            COALESCE("vRec".channel, 'PORTAL'), "vRec"."requesterUserId", "vRec"."requesterName", "vRec"."requesterRole", "vRec"."requesterEmail",
            "vRec"."assigneeStaffId", COALESCE("vRec"."openedAt", now()))
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."SupportTickets" t
       SET subject = CASE WHEN "pData" ? 'subject' THEN "vRec".subject ELSE t.subject END,
           category = CASE WHEN "pData" ? 'category' THEN "vRec".category ELSE t.category END,
           priority = CASE WHEN "pData" ? 'priority' THEN "vRec".priority ELSE t.priority END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           channel = CASE WHEN "pData" ? 'channel' THEN "vRec".channel ELSE t.channel END,
           "assigneeStaffId" = CASE WHEN "pData" ? 'assigneeStaffId' THEN "vRec"."assigneeStaffId" ELSE t."assigneeStaffId" END,
           "firstResponseAt" = CASE WHEN "pData" ? 'firstResponseAt' THEN "vRec"."firstResponseAt" ELSE t."firstResponseAt" END,
           "resolvedAt" = CASE WHEN "pData" ? 'resolvedAt' THEN "vRec"."resolvedAt" ELSE t."resolvedAt" END,
           "closedAt" = CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE t."closedAt" END,
           "csatRating" = CASE WHEN "pData" ? 'csatRating' THEN "vRec"."csatRating" ELSE t."csatRating" END,
           "csatComment" = CASE WHEN "pData" ? 'csatComment' THEN "vRec"."csatComment" ELSE t."csatComment" END
     WHERE t.id = "vId" AND ("vSession" IS NULL OR t."tenantId" = "vSession")
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."SupportTickets" t WHERE t.id = "vId" AND ("vSession" IS NULL OR t."tenantId" = "vSession")) THEN
        RAISE EXCEPTION 'SupportTickets %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SupportTickets % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'messages' THEN
    FOR "vE" IN SELECT x FROM jsonb_array_elements("pData" -> 'messages') x WHERE NOT (x ? 'id') LOOP
      "vMsg" := jsonb_populate_record(NULL::"Platform"."SupportTicketMessages", "vE");
      INSERT INTO "Platform"."SupportTicketMessages" ("ticketId", "authorKind", "authorStaffId", "authorUserId", "authorName", body, "isInternalNote", attachments)
      VALUES ("vRet", "vMsg"."authorKind", "vMsg"."authorStaffId", "vMsg"."authorUserId", "vMsg"."authorName", "vMsg".body, COALESCE("vMsg"."isInternalNote", false), '[]');
    END LOOP;
  END IF;
  RETURN "vRet";
END $function$;

-- ---------------------------------------------------------------------------
-- 7. supportTicketReply: one message on a ticket, with its effect on the ticket. A staff reply (not an internal note)
--    stamps the first response and waits on the customer; a customer reply on a waiting or resolved ticket puts it
--    back in progress. An explicit "status" overrides. Closed tickets take no messages (TICKET_CLOSED).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."supportTicketReply"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vSession" uuid := NULLIF(current_setting('app.tenantId', true), '')::uuid;  -- null for the Super Admin
  "vId"      uuid := ("pData" ->> 'ticketId')::uuid;
  "vT"       "Platform"."SupportTickets";
  "vKind"    text := "pData" ->> 'authorKind';
  "vNote"    boolean := COALESCE(("pData" ->> 'isInternalNote')::boolean, false);
  "vStatus"  text;
  "vMsg"     uuid;
BEGIN
  SELECT * INTO "vT" FROM "Platform"."SupportTickets" t WHERE t.id = "vId" AND ("vSession" IS NULL OR t."tenantId" = "vSession") FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SupportTickets % not found', "vId" USING ERRCODE = 'no_data_found'; END IF;
  IF "vT".status = 'CLOSED' THEN
    RAISE EXCEPTION 'This ticket is closed.' USING HINT = 'TICKET_CLOSED';
  END IF;
  INSERT INTO "Platform"."SupportTicketMessages" ("ticketId", "authorKind", "authorStaffId", "authorUserId", "authorName", body, "isInternalNote", attachments)
  VALUES ("vId", "vKind", NULLIF("pData" ->> 'authorStaffId', '')::uuid, NULLIF("pData" ->> 'authorUserId', '')::uuid, "pData" ->> 'authorName',
          "pData" ->> 'body', "vNote", '[]')
  RETURNING id INTO "vMsg";

  "vStatus" := COALESCE(NULLIF("pData" ->> 'status', ''),
                 CASE WHEN "vNote" THEN "vT".status
                      WHEN "vKind" = 'STAFF' THEN 'WAITING_ON_CUSTOMER'
                      WHEN "vKind" = 'CUSTOMER' AND "vT".status IN ('WAITING_ON_CUSTOMER', 'RESOLVED') THEN 'IN_PROGRESS'
                      ELSE "vT".status END);
  UPDATE "Platform"."SupportTickets"
     SET status = "vStatus",
         "firstResponseAt" = CASE WHEN "vKind" = 'STAFF' AND NOT "vNote" THEN COALESCE("firstResponseAt", now()) ELSE "firstResponseAt" END,
         "resolvedAt" = CASE WHEN "vStatus" IN ('RESOLVED', 'CLOSED') THEN COALESCE("resolvedAt", now()) ELSE NULL END,
         "closedAt" = CASE WHEN "vStatus" = 'CLOSED' THEN COALESCE("closedAt", now()) ELSE NULL END
   WHERE id = "vId"
     AND (status IS DISTINCT FROM "vStatus" OR ("vKind" = 'STAFF' AND NOT "vNote" AND "firstResponseAt" IS NULL));
  RETURN "vMsg";
END $function$;

-- ---------------------------------------------------------------------------
-- 8. announcementAddUpdate: the generated version referenced an undeclared session tenant for its targets (and the
--    targets' own tenantId is a target, not a scope). Targets are replaced: rows missing from the array are removed,
--    rows with "id" kept, others inserted (exactly one of planId / moduleKey / tenantId each).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."announcementAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRec" "Platform"."Announcements";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vE" jsonb;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."Announcements", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."Announcements" ("announcementType", severity, "releaseLabel", title, message, audience, "publishAt", status, "showBanner", "emailAdmins", "maintenanceWindowId")
    VALUES ("vRec"."announcementType", COALESCE("vRec".severity, 'INFO'), "vRec"."releaseLabel", "vRec".title, "vRec".message, COALESCE("vRec".audience, 'ALL'),
            "vRec"."publishAt", COALESCE("vRec".status, 'DRAFT'), COALESCE("vRec"."showBanner", true), COALESCE("vRec"."emailAdmins", true), "vRec"."maintenanceWindowId")
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."Announcements" t
       SET "announcementType" = CASE WHEN "pData" ? 'announcementType' THEN "vRec"."announcementType" ELSE t."announcementType" END,
           severity = CASE WHEN "pData" ? 'severity' THEN "vRec".severity ELSE t.severity END,
           "releaseLabel" = CASE WHEN "pData" ? 'releaseLabel' THEN "vRec"."releaseLabel" ELSE t."releaseLabel" END,
           title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
           message = CASE WHEN "pData" ? 'message' THEN "vRec".message ELSE t.message END,
           audience = CASE WHEN "pData" ? 'audience' THEN "vRec".audience ELSE t.audience END,
           "publishAt" = CASE WHEN "pData" ? 'publishAt' THEN "vRec"."publishAt" ELSE t."publishAt" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "showBanner" = CASE WHEN "pData" ? 'showBanner' THEN "vRec"."showBanner" ELSE t."showBanner" END,
           "emailAdmins" = CASE WHEN "pData" ? 'emailAdmins' THEN "vRec"."emailAdmins" ELSE t."emailAdmins" END,
           "maintenanceWindowId" = CASE WHEN "pData" ? 'maintenanceWindowId' THEN "vRec"."maintenanceWindowId" ELSE t."maintenanceWindowId" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."Announcements" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'Announcements %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Announcements % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'targets' THEN
    DELETE FROM "Platform"."AnnouncementTargets"
     WHERE "announcementId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'targets') x WHERE x ? 'id');
    FOR "vE" IN SELECT x FROM jsonb_array_elements("pData" -> 'targets') x WHERE NOT (x ? 'id') LOOP
      INSERT INTO "Platform"."AnnouncementTargets" ("announcementId", "planId", "moduleKey", "tenantId")
      VALUES ("vRet", NULLIF("vE" ->> 'planId', '')::uuid, NULLIF("vE" ->> 'moduleKey', ''), NULLIF("vE" ->> 'tenantId', '')::uuid);
    END LOOP;
  END IF;
  RETURN "vRet";
END $function$;

-- ---------------------------------------------------------------------------
-- 9. In-app delivery of a broadcast: one Company.Notifications row for every active admin of the company (users
--    holding the ADMIN system role). Returns how many were delivered.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."deliverInAppNotice"("pTenantId" uuid, "pTitle" text, "pBody" text, "pSeverity" text, "pLinkRoute" text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vN" integer;
BEGIN
  INSERT INTO "Company"."Notifications" ("tenantId", "userId", category, "eventCode", title, body, "linkRoute", severity, channels)
  SELECT DISTINCT u."tenantId", u.id, 'SYSTEM', 'PLATFORM_BROADCAST', left("pTitle", 200), "pBody", "pLinkRoute", COALESCE("pSeverity", 'INFO'), ARRAY['IN_APP']
    FROM "Company"."Users" u
    JOIN "Company"."UserRoles" ur ON ur."tenantId" = u."tenantId" AND ur."userId" = u.id
    JOIN "Company"."Roles" r ON r."tenantId" = ur."tenantId" AND r.id = ur."roleId" AND r."systemKey" = 'ADMIN'
   WHERE u."tenantId" = "pTenantId" AND u.status = 'ACTIVE' AND u."deletedAt" IS NULL;
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

-- ---------------------------------------------------------------------------
-- 10. Lookup labels and tones (template badges: Urgent red, High amber, Normal blue, Low grey; Warning amber).
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" AS l SET tone = v.tone
  FROM (VALUES
    ('SupportTicketPriority', 'HIGH', 'warn'),
    ('SupportTicketPriority', 'LOW', 'neutral'),
    ('AnnouncementSeverity', 'WARNING', 'warn'),
    ('PlatformLeadStage', 'LEAD', 'info'),
    ('PlatformLeadStage', 'DEMO', 'violet'),
    ('CommunicationLogStatus', 'OPENED', 'info'),
    ('CommunicationLogStatus', 'READ', 'good'),
    ('CommunicationLogStatus', 'BOUNCED', 'warn')
  ) AS v("lookupType", code, tone)
 WHERE l."tenantId" IS NULL AND l."lookupType" = v."lookupType" AND l.code = v.code AND l.tone <> v.tone;
UPDATE "Lookups"."Lookups" AS l SET label = v.label
  FROM (VALUES
    ('SupportTicketCategory', 'ACCOUNTING_BANK', 'Accounting / Bank'),
    ('SupportTicketCategory', 'TAX_FBR', 'Tax / FBR'),
    ('SupportTicketChannel', 'WHATSAPP', 'WhatsApp'),
    ('CommunicationLogChannel', 'WHATSAPP', 'WhatsApp'),
    ('CommunicationLogChannel', 'IN_APP', 'In-app'),
    ('PlatformLeadSource', 'LINKEDIN', 'LinkedIn'),
    ('PlatformLeadStage', 'DEMO', 'Demo booked'),
    ('ToStage', 'DEMO', 'Demo booked'),
    ('FromStage', 'DEMO', 'Demo booked'),
    ('AuthorKind', 'SYSTEM', 'System'),
    ('RelatedDocType', 'FS-INV', 'Platform invoice'),
    ('RelatedDocType', 'TCK', 'Support ticket'),
    ('RelatedDocType', 'INC', 'Incident'),
    ('RelatedDocType', 'PRV', 'Privacy request'),
    ('RelatedDocType', 'CR', 'Change request'),
    ('TenantBroadcastAudience', 'ALL_ACTIVE', 'All active companies'),
    ('TenantBroadcastAudience', 'SELECTED_TENANTS', 'Selected companies'),
    ('AnnouncementAudience', 'ALL', 'All companies'),
    ('AnnouncementAudience', 'TENANTS', 'Specific companies'),
    ('LanguageMode', 'TENANT_PREFERENCE', 'Company preference (EN/UR)'),
    ('LanguageMode', 'EN', 'English'),
    ('LanguageMode', 'UR', 'Urdu')
  ) AS v("lookupType", code, label)
 WHERE l."tenantId" IS NULL AND l."lookupType" = v."lookupType" AND l.code = v.code AND l.label <> v.label;

-- ---------------------------------------------------------------------------
-- 11. Error codes (Phase 42)
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('LEAD_PARTNER_REQUIRED',      400, 'VALIDATION',    'PLATFORM', 'Choose the partner for a partner-sourced lead.', 'Lead source PARTNER without partnerId', true, NULL),
  ('LEAD_ALREADY_CONVERTED',     409, 'BUSINESS_RULE', 'PLATFORM', 'This lead has already been converted to a company.', 'Convert or move a lead that is linked to a tenant', true, NULL),
  ('TICKET_CLOSED',              409, 'BUSINESS_RULE', 'PLATFORM', 'This ticket is closed.', 'Change or reply to a CLOSED support ticket', true, NULL),
  ('TICKET_CSAT_NOT_ALLOWED',    409, 'BUSINESS_RULE', 'PLATFORM', 'You can rate a ticket once it is resolved.', 'CSAT on a ticket that is not RESOLVED', true, NULL),
  ('ANNOUNCEMENT_NOT_DRAFT',     409, 'BUSINESS_RULE', 'PLATFORM', 'Only draft or scheduled announcements can be changed; published ones are archived.', 'Edit or delete of a published / archived announcement', true, NULL),
  ('BROADCAST_AUDIENCE_INVALID', 400, 'VALIDATION',    'PLATFORM', 'This audience has no companies to send to.', 'Broadcast audience is incomplete or resolves to no recipients', true, NULL),
  ('BROADCAST_TEMPLATE_INVALID', 400, 'VALIDATION',    'PLATFORM', 'Choose an active template or write a message.', 'Broadcast without a usable template or message', true, NULL),
  ('COMM_LOG_NOT_RETRYABLE',     409, 'BUSINESS_RULE', 'PLATFORM', 'Only queued, failed or bounced messages can be resent.', 'Retry of a delivered communication log row', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;
