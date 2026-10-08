-- 108-admin-platform-ops.sql
-- Phase 43: Platform operations (service incidents, flag change requests + scheduled rollouts, privacy requests,
-- entitlement change log).
-- Idempotent: safe to run repeatedly via npm run db:sql (or: npx prisma db execute --file prisma/sql/108-admin-platform-ops.sql).

SELECT set_config('app.actorLabel', '108-admin-platform-ops.sql', true);

-- ---------------------------------------------------------------------------
-- 1. Row history: the Phase 43 tables that had no audit trigger. FlagAuditLogs and EntitlementChangeLogs stay
--    append-only (their triggerAppendOnly is kept); the audit trigger only records the inserts.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "serviceIncidentUpdatesAudit" ON "Platform"."ServiceIncidentUpdates";
CREATE TRIGGER "serviceIncidentUpdatesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."ServiceIncidentUpdates"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "flagChangeRequestCommentsAudit" ON "Platform"."FlagChangeRequestComments";
CREATE TRIGGER "flagChangeRequestCommentsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."FlagChangeRequestComments"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "entitlementChangeLogsAudit" ON "Platform"."EntitlementChangeLogs";
CREATE TRIGGER "entitlementChangeLogsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Platform"."EntitlementChangeLogs"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Solo approval (decision 2026-10-08). While exactly one ACTIVE platform staff member exists, that person may
--    decide their own flag change request or privacy deletion, recorded with a decision note starting
--    "SOLO APPROVAL:". As soon as a second active staff member exists, strict four-eyes applies again (the checks
--    below call isSoloStaff() at decision time).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."isSoloStaff"()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT count(*) = 1 FROM "Platform"."PlatformStaff" s WHERE s.status = 'ACTIVE' AND s."removedAt" IS NULL
$function$;

-- 2a. Change requests: the decider differs from the requester (was CHECK flagChangeRequestFourEyesChk).
ALTER TABLE "Platform"."FlagChangeRequests" DROP CONSTRAINT IF EXISTS "flagChangeRequestFourEyesChk";
CREATE OR REPLACE FUNCTION "Platform"."triggerCrFourEyes"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW."decidedByStaffId" IS NOT NULL AND NEW."decidedByStaffId" = NEW."requesterStaffId"
     AND (TG_OP = 'INSERT' OR NEW."decidedByStaffId" IS DISTINCT FROM OLD."decidedByStaffId" OR NEW."decisionNote" IS DISTINCT FROM OLD."decisionNote")
     AND NOT ("Platform"."isSoloStaff"() AND COALESCE(NEW."decisionNote", '') LIKE 'SOLO APPROVAL:%') THEN
    RAISE EXCEPTION 'The requester of % cannot decide it: a second platform admin must', NEW."docNo"
      USING ERRCODE = 'check_violation', HINT = 'FOUR_EYES_REQUIRED';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS "flagChangeRequestFourEyes" ON "Platform"."FlagChangeRequests";
CREATE TRIGGER "flagChangeRequestFourEyes" BEFORE INSERT OR UPDATE ON "Platform"."FlagChangeRequests"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerCrFourEyes"();

-- 2b. Approver rows: the requester is not an approver of their own request, unless they are the only staff member.
CREATE OR REPLACE FUNCTION "Platform"."triggerCrApproverNotRequester"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  "vCr" record;
BEGIN
  SELECT c."docNo", c."requesterStaffId" INTO "vCr" FROM "Platform"."FlagChangeRequests" c WHERE c.id = NEW."changeRequestId";
  IF "vCr"."requesterStaffId" = NEW."staffUserId" AND NOT "Platform"."isSoloStaff"() THEN
    RAISE EXCEPTION 'The requester of % cannot approve it', "vCr"."docNo" USING ERRCODE = 'check_violation', HINT = 'FOUR_EYES_REQUIRED';
  END IF;
  RETURN NEW;
END $function$;

-- 2c. Privacy deletions: two different approvers (was CHECK privacyRequestTwoPeopleChk). The decision note is new.
ALTER TABLE "Platform"."PrivacyRequests" ADD COLUMN IF NOT EXISTS "decisionNote" text;
ALTER TABLE "Platform"."PrivacyRequests" ADD COLUMN IF NOT EXISTS "fulfilmentSummary" jsonb;
ALTER TABLE "Platform"."PrivacyRequests" DROP CONSTRAINT IF EXISTS "privacyRequestTwoPeopleChk";
CREATE OR REPLACE FUNCTION "Platform"."triggerPrivacyTwoPeople"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW."approver2StaffId" IS NOT NULL AND NEW."approver2StaffId" = NEW."approver1StaffId"
     AND (TG_OP = 'INSERT' OR NEW."approver2StaffId" IS DISTINCT FROM OLD."approver2StaffId")
     AND NOT ("Platform"."isSoloStaff"() AND COALESCE(NEW."decisionNote", '') LIKE 'SOLO APPROVAL:%') THEN
    RAISE EXCEPTION 'Deletion % needs a second, different approver', NEW."docNo" USING ERRCODE = 'check_violation', HINT = 'FOUR_EYES_REQUIRED';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS "privacyRequestTwoPeople" ON "Platform"."PrivacyRequests";
CREATE TRIGGER "privacyRequestTwoPeople" BEFORE INSERT OR UPDATE ON "Platform"."PrivacyRequests"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerPrivacyTwoPeople"();

-- Staff id of the session (app.userId = the Super Admin's PlatformStaff mirror), or an error.
CREATE OR REPLACE FUNCTION "Platform"."currentStaffId"()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vStaff" uuid := "Company"."getCurrentUserId"();
BEGIN
  IF "vStaff" IS NULL OR NOT EXISTS (SELECT 1 FROM "Platform"."PlatformStaff" s WHERE s.id = "vStaff") THEN
    RAISE EXCEPTION 'A platform staff member must be signed in' USING ERRCODE = 'insufficient_privilege', HINT = 'FORBIDDEN';
  END IF;
  RETURN "vStaff";
END $function$;

-- ---------------------------------------------------------------------------
-- 3. Service incidents. The timeline is append-only: the generated serviceIncidentAddUpdate deleted updates missing
--    from its array, so it no longer touches updates; they are added by serviceIncidentPostUpdate. The stage only
--    moves forward and a resolved incident is closed (only its post-mortem fields change).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."serviceIncidentAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRec" "Platform"."ServiceIncidents";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  IF "pData" ? 'updates' THEN
    RAISE EXCEPTION 'Incident updates are posted one by one (serviceIncidentPostUpdate); the timeline is append-only'
      USING ERRCODE = 'check_violation', HINT = 'VALIDATION_FAILED';
  END IF;
  "vRec" := jsonb_populate_record(NULL::"Platform"."ServiceIncidents", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."ServiceIncidents" ("docNo", title, impact, components, stage, "startedAt", "resolvedAt", "isPublic", "declaredByStaffId", "postmortemDueOn", "postmortemRef")
    VALUES (CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE "Platform"."getNextPlatformDocumentNo"('INC', (now() AT TIME ZONE 'Asia/Karachi')::date) END,
            "vRec".title, "vRec".impact, "vRec".components, COALESCE("vRec".stage, 'INVESTIGATING'), COALESCE("vRec"."startedAt", now()), "vRec"."resolvedAt",
            COALESCE("vRec"."isPublic", TRUE), COALESCE("vRec"."declaredByStaffId", "Platform"."currentStaffId"()), "vRec"."postmortemDueOn", "vRec"."postmortemRef")
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."ServiceIncidents" t
       SET title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
           impact = CASE WHEN "pData" ? 'impact' THEN "vRec".impact ELSE t.impact END,
           components = CASE WHEN "pData" ? 'components' THEN "vRec".components ELSE t.components END,
           "isPublic" = CASE WHEN "pData" ? 'isPublic' THEN "vRec"."isPublic" ELSE t."isPublic" END,
           "postmortemDueOn" = CASE WHEN "pData" ? 'postmortemDueOn' THEN "vRec"."postmortemDueOn" ELSE t."postmortemDueOn" END,
           "postmortemRef" = CASE WHEN "pData" ? 'postmortemRef' THEN "vRec"."postmortemRef" ELSE t."postmortemRef" END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."ServiceIncidents" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'ServiceIncidents %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ServiceIncidents % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  RETURN "vRet";
END $function$;

CREATE OR REPLACE FUNCTION "Platform"."triggerIncidentStageOrder"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  "vOrder" text[] := ARRAY['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'];
BEGIN
  IF OLD.stage = 'RESOLVED' AND (NEW.stage, NEW.title, NEW.impact, NEW.components, NEW."startedAt", NEW."resolvedAt", NEW."isPublic")
       IS DISTINCT FROM (OLD.stage, OLD.title, OLD.impact, OLD.components, OLD."startedAt", OLD."resolvedAt", OLD."isPublic") THEN
    RAISE EXCEPTION 'Incident % is resolved; only its post-mortem can change', OLD."docNo" USING ERRCODE = 'check_violation', HINT = 'INCIDENT_RESOLVED';
  END IF;
  IF array_position("vOrder", NEW.stage) < array_position("vOrder", OLD.stage) THEN
    RAISE EXCEPTION 'Incident % cannot move back from % to %', OLD."docNo", OLD.stage, NEW.stage USING ERRCODE = 'check_violation', HINT = 'INCIDENT_STAGE_ORDER';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS "serviceIncidentStageOrder" ON "Platform"."ServiceIncidents";
CREATE TRIGGER "serviceIncidentStageOrder" BEFORE UPDATE ON "Platform"."ServiceIncidents"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerIncidentStageOrder"();

-- Declare: the incident (INC-YYYY-NNN) and its first update, by the signed-in staff member. pData: title, impact,
-- components[], stage (INVESTIGATING / IDENTIFIED), message, isPublic, notifySubscribers, updateBanner.
CREATE OR REPLACE FUNCTION "Platform"."serviceIncidentDeclare"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vStaff" uuid := "Platform"."currentStaffId"();
  "vStage" text := COALESCE(NULLIF("pData" ->> 'stage', ''), 'INVESTIGATING');
  "vMsg"   text := btrim(COALESCE("pData" ->> 'message', ''));
  "vId"    uuid;
BEGIN
  IF "vStage" NOT IN ('INVESTIGATING', 'IDENTIFIED') THEN
    RAISE EXCEPTION 'A new incident starts as Investigating or Identified' USING ERRCODE = 'check_violation', HINT = 'INCIDENT_STAGE_ORDER';
  END IF;
  IF "vMsg" = '' THEN
    RAISE EXCEPTION 'Write the first update' USING ERRCODE = 'check_violation', HINT = 'VALIDATION_FAILED';
  END IF;
  INSERT INTO "Platform"."ServiceIncidents" ("docNo", title, impact, components, stage, "startedAt", "isPublic", "declaredByStaffId")
  VALUES ("Platform"."getNextPlatformDocumentNo"('INC', (now() AT TIME ZONE 'Asia/Karachi')::date), btrim("pData" ->> 'title'), "pData" ->> 'impact',
          ARRAY(SELECT jsonb_array_elements_text("pData" -> 'components')), "vStage", now(), COALESCE(("pData" ->> 'isPublic')::boolean, TRUE), "vStaff")
  RETURNING id INTO "vId";
  INSERT INTO "Platform"."ServiceIncidentUpdates" ("incidentId", stage, message, "postedByStaffId", "notifySubscribers", "updateBanner")
  VALUES ("vId", "vStage", "vMsg", "vStaff", COALESCE(("pData" ->> 'notifySubscribers')::boolean, TRUE), COALESCE(("pData" ->> 'updateBanner')::boolean, TRUE));
  RETURN "vId";
END $function$;

-- Post an update: appended to the timeline; the incident takes its stage (forward only). RESOLVED stamps resolvedAt
-- and a post-mortem due date (5 working days ≈ 7 calendar days).
CREATE OR REPLACE FUNCTION "Platform"."serviceIncidentPostUpdate"("pIncidentId" uuid, "pStage" text, "pMessage" text, "pNotify" boolean DEFAULT true, "pBanner" boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vStaff" uuid := "Platform"."currentStaffId"();
  "vInc"   "Platform"."ServiceIncidents";
  "vOrder" text[] := ARRAY['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'];
  "vId"    uuid;
BEGIN
  SELECT * INTO "vInc" FROM "Platform"."ServiceIncidents" t WHERE t.id = "pIncidentId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Incident % not found', "pIncidentId" USING ERRCODE = 'no_data_found'; END IF;
  IF "vInc".stage = 'RESOLVED' THEN
    RAISE EXCEPTION 'Incident % is resolved', "vInc"."docNo" USING ERRCODE = 'check_violation', HINT = 'INCIDENT_RESOLVED';
  END IF;
  IF array_position("vOrder", "pStage") IS NULL OR array_position("vOrder", "pStage") < array_position("vOrder", "vInc".stage) THEN
    RAISE EXCEPTION 'Incident % cannot move from % to %', "vInc"."docNo", "vInc".stage, "pStage" USING ERRCODE = 'check_violation', HINT = 'INCIDENT_STAGE_ORDER';
  END IF;
  IF btrim(COALESCE("pMessage", '')) = '' THEN
    RAISE EXCEPTION 'Write a short update first' USING ERRCODE = 'check_violation', HINT = 'VALIDATION_FAILED';
  END IF;
  INSERT INTO "Platform"."ServiceIncidentUpdates" ("incidentId", stage, message, "postedByStaffId", "notifySubscribers", "updateBanner")
  VALUES ("pIncidentId", "pStage", btrim("pMessage"), "vStaff", COALESCE("pNotify", TRUE), COALESCE("pBanner", TRUE))
  RETURNING id INTO "vId";
  IF "pStage" IS DISTINCT FROM "vInc".stage THEN
    UPDATE "Platform"."ServiceIncidents" t
       SET stage = "pStage",
           "resolvedAt" = CASE WHEN "pStage" = 'RESOLVED' THEN GREATEST(now(), t."startedAt") ELSE t."resolvedAt" END,
           "postmortemDueOn" = CASE WHEN "pStage" = 'RESOLVED' THEN COALESCE(t."postmortemDueOn", (now() AT TIME ZONE 'Asia/Karachi')::date + 7) ELSE t."postmortemDueOn" END
     WHERE t.id = "pIncidentId";
  END IF;
  RETURN "vId";
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Flag change requests. Submit numbers the request (CR-1001 up), names the approvers and refuses a second pending
--    request for the same flag and environment. Approve / reject fill the decision fields (a note is required); the
--    app applies an approved change and then calls flagChangeRequestMarkApplied, which writes FlagAuditLogs with the
--    request id. Rejections are logged in FlagAuditLogs too. A scheduled step follows its request.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."flagChangeRequestSubmit"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vStaff" uuid := COALESCE(NULLIF("pData" ->> 'requesterStaffId', '')::uuid, "Platform"."currentStaffId"());
  "vFlag"  uuid := ("pData" ->> 'flagId')::uuid;
  "vEnv"   text := COALESCE(NULLIF("pData" ->> 'environment', ''), 'PRODUCTION');
  "vId"    uuid;
  "vDoc"   text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Platform"."PlatformStaff" s WHERE s.id = "vStaff") THEN
    RAISE EXCEPTION 'Unknown requester' USING ERRCODE = 'insufficient_privilege', HINT = 'FORBIDDEN';
  END IF;
  IF btrim(COALESCE("pData" ->> 'reason', '')) = '' THEN
    RAISE EXCEPTION 'Give the reason for the change' USING ERRCODE = 'check_violation', HINT = 'CR_REASON_REQUIRED';
  END IF;
  SELECT c."docNo" INTO "vDoc" FROM "Platform"."FlagChangeRequests" c WHERE c."flagId" = "vFlag" AND c.environment = "vEnv" AND c.status = 'PENDING';
  IF FOUND THEN
    RAISE EXCEPTION '% is already pending for this flag in %', "vDoc", "vEnv" USING ERRCODE = 'check_violation', HINT = 'CR_PENDING_EXISTS';
  END IF;
  INSERT INTO "Platform"."FlagChangeRequests" ("docNo", "flagId", environment, "requesterStaffId", reason, summary, "beforeState", "afterState", patch, "applyNotBefore", source)
  VALUES ("Platform"."getNextPlatformDocumentNo"('CR', CURRENT_DATE), "vFlag", "vEnv", "vStaff", btrim("pData" ->> 'reason'), left(COALESCE("pData" ->> 'summary', 'Targeting change'), 300),
          COALESCE("pData" -> 'beforeState', '{}'::jsonb), COALESCE("pData" -> 'afterState', '{}'::jsonb), COALESCE("pData" -> 'patch', '{}'::jsonb),
          NULLIF("pData" ->> 'applyNotBefore', '')::timestamptz, COALESCE(NULLIF("pData" ->> 'source', ''), 'MANUAL'))
  RETURNING id INTO "vId";
  -- approvers: every other active staff member; the requester themselves only while they are the only one
  INSERT INTO "Platform"."FlagChangeRequestApprovers" ("changeRequestId", "staffUserId")
  SELECT "vId", s.id FROM "Platform"."PlatformStaff" s WHERE s.status = 'ACTIVE' AND s."removedAt" IS NULL AND s.id <> "vStaff";
  IF NOT FOUND AND "Platform"."isSoloStaff"() THEN
    INSERT INTO "Platform"."FlagChangeRequestApprovers" ("changeRequestId", "staffUserId") VALUES ("vId", "vStaff");
  END IF;
  RETURN "vId";
END $function$;

CREATE OR REPLACE FUNCTION "Platform"."flagChangeRequestDecide"("pId" uuid, "pApprove" boolean, "pNote" text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vStaff" uuid := "Platform"."currentStaffId"();
  "vRow"   "Platform"."FlagChangeRequests";
  "vDec"   text := CASE WHEN "pApprove" THEN 'APPROVED' ELSE 'REJECTED' END;
BEGIN
  SELECT * INTO "vRow" FROM "Platform"."FlagChangeRequests" t WHERE t.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change request % not found', "pId" USING ERRCODE = 'no_data_found'; END IF;
  IF "vRow".status <> 'PENDING' THEN
    RAISE EXCEPTION '% is %, not pending', "vRow"."docNo", lower("vRow".status) USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'CR_NOT_PENDING';
  END IF;
  IF btrim(COALESCE("pNote", '')) = '' THEN
    RAISE EXCEPTION 'A decision needs a note' USING ERRCODE = 'check_violation', HINT = 'CR_NOTE_REQUIRED';
  END IF;
  UPDATE "Platform"."FlagChangeRequests" t
     SET status = "vDec", "decidedByStaffId" = "vStaff", "decidedAt" = now(), "decisionNote" = btrim("pNote")
   WHERE t.id = "pId";
  UPDATE "Platform"."FlagChangeRequestApprovers" a SET decision = "vDec", "decidedAt" = now()
   WHERE a."changeRequestId" = "pId" AND a."staffUserId" = "vStaff";
  IF NOT FOUND THEN
    INSERT INTO "Platform"."FlagChangeRequestApprovers" ("changeRequestId", "staffUserId", decision, "decidedAt") VALUES ("pId", "vStaff", "vDec", now());
  END IF;
  IF NOT "pApprove" THEN
    INSERT INTO "Platform"."FlagAuditLogs" ("flagId", environment, "staffUserId", "eventKind", summary, "beforeState", "afterState", "changeRequestId")
    VALUES ("vRow"."flagId", "vRow".environment, "vStaff", 'CR_REJECTED', left("vRow"."docNo" || ' rejected: ' || "vRow".summary, 500), "vRow"."beforeState", "vRow"."beforeState", "pId");
    UPDATE "Platform"."FlagScheduledChanges" s SET status = 'CANCELLED' WHERE s."changeRequestId" = "pId" AND s.status = 'REQUESTED';
  END IF;
  RETURN "pId";
END $function$;

-- The generated approve / cancel, replaced: approve = decide(true); cancel only while nothing was applied.
CREATE OR REPLACE FUNCTION "Platform"."flagChangeRequestApprove"("pId" uuid, "pComment" text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT "Platform"."flagChangeRequestDecide"("pId", true, "pComment")
$function$;

CREATE OR REPLACE FUNCTION "Platform"."flagChangeRequestReject"("pId" uuid, "pNote" text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT "Platform"."flagChangeRequestDecide"("pId", false, "pNote")
$function$;

CREATE OR REPLACE FUNCTION "Platform"."flagChangeRequestCancel"("pId" uuid, "pReason" text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Platform"."FlagChangeRequests";
BEGIN
  SELECT * INTO "vRow" FROM "Platform"."FlagChangeRequests" t WHERE t.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change request % not found', "pId" USING ERRCODE = 'no_data_found'; END IF;
  IF "vRow".status = 'CANCELLED' THEN RETURN "pId"; END IF;
  IF NOT ("vRow".status = 'PENDING' OR ("vRow".status = 'APPROVED' AND "vRow"."appliedAt" IS NULL)) THEN
    RAISE EXCEPTION '% can no longer be cancelled', "vRow"."docNo" USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'CR_NOT_PENDING';
  END IF;
  UPDATE "Platform"."FlagChangeRequests" t SET status = 'CANCELLED' WHERE t.id = "pId";
  UPDATE "Platform"."FlagScheduledChanges" s SET status = 'CANCELLED' WHERE s."changeRequestId" = "pId" AND s.status = 'REQUESTED';
  RETURN "pId";
END $function$;

-- After the app applied an approved request's change (same transaction): stamps appliedAt, appends the CR_APPLIED
-- FlagAuditLogs row linked to the request and completes its scheduled step. Returns the audit row id.
CREATE OR REPLACE FUNCTION "Platform"."flagChangeRequestMarkApplied"("pId" uuid, "pSummary" text, "pBefore" jsonb, "pAfter" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow"   "Platform"."FlagChangeRequests";
  "vStaff" uuid := "Company"."getCurrentUserId"();
  "vAudit" uuid;
BEGIN
  SELECT * INTO "vRow" FROM "Platform"."FlagChangeRequests" t WHERE t.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change request % not found', "pId" USING ERRCODE = 'no_data_found'; END IF;
  IF "vRow".status <> 'APPROVED' OR "vRow"."appliedAt" IS NOT NULL THEN
    RAISE EXCEPTION '% is not waiting to be applied', "vRow"."docNo" USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'CR_NOT_PENDING';
  END IF;
  IF "vStaff" IS NULL OR NOT EXISTS (SELECT 1 FROM "Platform"."PlatformStaff" s WHERE s.id = "vStaff") THEN "vStaff" := "vRow"."decidedByStaffId"; END IF;
  UPDATE "Platform"."FlagChangeRequests" t SET "appliedAt" = now() WHERE t.id = "pId";
  INSERT INTO "Platform"."FlagAuditLogs" ("flagId", environment, "staffUserId", "eventKind", summary, "beforeState", "afterState", "changeRequestId")
  VALUES ("vRow"."flagId", "vRow".environment, "vStaff", 'CR_APPLIED', left(COALESCE("pSummary", "vRow".summary) || ' (' || "vRow"."docNo" || ')', 500),
          COALESCE("pBefore", "vRow"."beforeState"), COALESCE("pAfter", "vRow"."afterState"), "pId")
  RETURNING id INTO "vAudit";
  UPDATE "Platform"."FlagScheduledChanges" s SET status = 'APPLIED' WHERE s."changeRequestId" = "pId" AND s.status = 'REQUESTED';
  RETURN "vAudit";
END $function$;

-- CR numbering starts at 1001 (template style: CR-1042).
INSERT INTO "Platform"."PlatformDocumentCounters" ("docType", "periodKey", "nextValue") VALUES ('CR', 'ALL', 1001)
ON CONFLICT ("docType", "periodKey") DO NOTHING;
UPDATE "Platform"."PlatformDocumentCounters" SET "nextValue" = 1001
 WHERE "docType" = 'CR' AND "periodKey" = 'ALL' AND "nextValue" < 1001;

-- ---------------------------------------------------------------------------
-- 5. Privacy requests. The generated privacyRequestAddUpdate took the company from app.tenantId (null for the Super
--    Admin): it now comes from the payload (a company session can only touch its own). New requests get PRV-YYYY-NNN
--    and a 30-day due date. Steps: RECEIVED → VERIFIED → APPROVED (EXPORT: one approver; DELETE: two, or one solo
--    approval) → PROCESSING → DONE, or REJECTED before processing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."privacyRequestAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vSession" uuid := NULLIF(current_setting('app.tenantId', true), '')::uuid;  -- empty for the Super Admin
  "vTenant" uuid := COALESCE(NULLIF("pData" ->> 'tenantId', '')::uuid, "vSession");
  "vRec" "Platform"."PrivacyRequests";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vReceived" date;
BEGIN
  IF "vSession" IS NOT NULL AND "vTenant" IS DISTINCT FROM "vSession" THEN
    RAISE EXCEPTION 'A company can only file its own privacy requests' USING ERRCODE = 'insufficient_privilege', HINT = 'FORBIDDEN';
  END IF;
  "vRec" := jsonb_populate_record(NULL::"Platform"."PrivacyRequests", "pData");
  IF "vId" IS NULL THEN
    IF "vTenant" IS NULL THEN RAISE EXCEPTION 'Choose the company' USING ERRCODE = 'not_null_violation', HINT = 'VALIDATION_FAILED'; END IF;
    "vReceived" := COALESCE("vRec"."receivedOn", (now() AT TIME ZONE 'Asia/Karachi')::date);
    INSERT INTO "Platform"."PrivacyRequests" ("tenantId", "docNo", "requestType", "requestedByName", "requestedByRole", "requesterEmail", "receivedOn", "dueOn", step)
    VALUES ("vTenant", COALESCE("vRec"."docNo", "Platform"."getNextPlatformDocumentNo"('PRV', "vReceived")), "vRec"."requestType", "vRec"."requestedByName",
            "vRec"."requestedByRole", "vRec"."requesterEmail", "vReceived", COALESCE("vRec"."dueOn", "vReceived" + 30), 'RECEIVED')
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."PrivacyRequests" t
       SET "requestedByName" = CASE WHEN "pData" ? 'requestedByName' THEN "vRec"."requestedByName" ELSE t."requestedByName" END,
           "requestedByRole" = CASE WHEN "pData" ? 'requestedByRole' THEN "vRec"."requestedByRole" ELSE t."requestedByRole" END,
           "requesterEmail" = CASE WHEN "pData" ? 'requesterEmail' THEN "vRec"."requesterEmail" ELSE t."requesterEmail" END,
           "receivedOn" = CASE WHEN "pData" ? 'receivedOn' THEN "vRec"."receivedOn" ELSE t."receivedOn" END,
           "dueOn" = CASE WHEN "pData" ? 'dueOn' THEN "vRec"."dueOn" ELSE t."dueOn" END
     WHERE t.id = "vId" AND ("vSession" IS NULL OR t."tenantId" = "vSession")
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."PrivacyRequests" t WHERE t.id = "vId" AND ("vSession" IS NULL OR t."tenantId" = "vSession")) THEN
        RAISE EXCEPTION 'PrivacyRequests %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PrivacyRequests % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  RETURN "vRet";
END $function$;

CREATE OR REPLACE FUNCTION "Platform"."privacyRequestLock"("pId" uuid, "pSteps" text[])
 RETURNS "Platform"."PrivacyRequests"
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Platform"."PrivacyRequests";
BEGIN
  SELECT * INTO "vRow" FROM "Platform"."PrivacyRequests" t WHERE t.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Privacy request % not found', "pId" USING ERRCODE = 'no_data_found'; END IF;
  IF NOT ("vRow".step = ANY ("pSteps")) THEN
    RAISE EXCEPTION '% is at step %', "vRow"."docNo", "vRow".step USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PRIVACY_STEP_ORDER';
  END IF;
  RETURN "vRow";
END $function$;

CREATE OR REPLACE FUNCTION "Platform"."privacyRequestVerify"("pId" uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vStaff" uuid := "Platform"."currentStaffId"();
BEGIN
  PERFORM "Platform"."privacyRequestLock"("pId", ARRAY['RECEIVED']);
  UPDATE "Platform"."PrivacyRequests" t SET step = 'VERIFIED', "verifiedByStaffId" = "vStaff", "verifiedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- Approve: EXPORT needs one approver. DELETE needs two different approvers; while the signed-in admin is the only
-- staff member, one call with a "SOLO APPROVAL:" note records them as both. Returns the step after the call.
CREATE OR REPLACE FUNCTION "Platform"."privacyRequestApprove"("pId" uuid, "pNote" text DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vStaff" uuid := "Platform"."currentStaffId"();
  "vRow"   "Platform"."PrivacyRequests" := "Platform"."privacyRequestLock"("pId", ARRAY['VERIFIED']);
  "vNote"  text := NULLIF(btrim(COALESCE("pNote", '')), '');
  "vSolo"  boolean := "Platform"."isSoloStaff"() AND COALESCE("pNote", '') LIKE 'SOLO APPROVAL:%';
BEGIN
  IF "vRow"."requestType" = 'EXPORT' THEN
    UPDATE "Platform"."PrivacyRequests" t SET step = 'APPROVED', "approver1StaffId" = "vStaff", "approved1At" = now(), "decisionNote" = COALESCE("vNote", t."decisionNote") WHERE t.id = "pId";
    RETURN 'APPROVED';
  END IF;
  IF "vRow"."approver1StaffId" IS NULL THEN
    IF "vSolo" THEN
      UPDATE "Platform"."PrivacyRequests" t
         SET "approver1StaffId" = "vStaff", "approved1At" = now(), "approver2StaffId" = "vStaff", "approved2At" = now(), "decisionNote" = "vNote", step = 'APPROVED'
       WHERE t.id = "pId";
      RETURN 'APPROVED';
    END IF;
    UPDATE "Platform"."PrivacyRequests" t SET "approver1StaffId" = "vStaff", "approved1At" = now(), "decisionNote" = COALESCE("vNote", t."decisionNote") WHERE t.id = "pId";
    RETURN 'VERIFIED';
  END IF;
  UPDATE "Platform"."PrivacyRequests" t
     SET "approver2StaffId" = "vStaff", "approved2At" = now(), "decisionNote" = COALESCE("vNote", t."decisionNote"), step = 'APPROVED'
   WHERE t.id = "pId";
  RETURN 'APPROVED';
END $function$;

CREATE OR REPLACE FUNCTION "Platform"."privacyRequestReject"("pId" uuid, "pReason" text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Platform"."currentStaffId"();
  PERFORM "Platform"."privacyRequestLock"("pId", ARRAY['RECEIVED', 'VERIFIED', 'APPROVED']);
  IF btrim(COALESCE("pReason", '')) = '' THEN
    RAISE EXCEPTION 'Tell the requester why' USING ERRCODE = 'check_violation', HINT = 'VALIDATION_FAILED';
  END IF;
  UPDATE "Platform"."PrivacyRequests" t SET step = 'REJECTED', "rejectedReason" = btrim("pReason"), "rejectedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- EXPORT, step 1: an approved export starts processing with its TENANT_EXPORT backup run (written by the app).
CREATE OR REPLACE FUNCTION "Platform"."privacyRequestStartExport"("pId" uuid, "pBackupRunId" uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Platform"."PrivacyRequests" := "Platform"."privacyRequestLock"("pId", ARRAY['APPROVED']);
BEGIN
  IF "vRow"."requestType" <> 'EXPORT' THEN
    RAISE EXCEPTION '% is not an export', "vRow"."docNo" USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PRIVACY_STEP_ORDER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Platform"."BackupRuns" b WHERE b.id = "pBackupRunId" AND b."backupType" = 'TENANT_EXPORT' AND b."tenantId" = "vRow"."tenantId") THEN
    RAISE EXCEPTION 'The export run does not belong to this company' USING ERRCODE = 'check_violation', HINT = 'VALIDATION_FAILED';
  END IF;
  UPDATE "Platform"."PrivacyRequests" t SET step = 'PROCESSING', "exportBackupRunId" = "pBackupRunId" WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- EXPORT, step 2 (when the run finishes): COMPLETED → DONE with the certificate and a 7-day download link;
-- FAILED → back to APPROVED so it can be retried. Returns the step.
CREATE OR REPLACE FUNCTION "Platform"."privacyRequestFulfilExport"("pId" uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Platform"."PrivacyRequests" := "Platform"."privacyRequestLock"("pId", ARRAY['PROCESSING']);
  "vRun" "Platform"."BackupRuns";
BEGIN
  SELECT * INTO "vRun" FROM "Platform"."BackupRuns" b WHERE b.id = "vRow"."exportBackupRunId";
  IF "vRun".status = 'COMPLETED' THEN
    UPDATE "Platform"."PrivacyRequests" t
       SET step = 'DONE', "completedAt" = now(), "certificateRef" = 'CERT-' || t."docNo", "exportLinkExpiresAt" = now() + interval '7 days',
           "fulfilmentSummary" = jsonb_build_object('kind', 'EXPORT', 'backupCode', "vRun".code, 'format', "vRun"."exportFormat", 'sizeBytes', "vRun"."sizeBytes")
     WHERE t.id = "pId";
    UPDATE "Platform"."BackupRuns" b SET "downloadExpiresAt" = now() + interval '7 days' WHERE b.id = "vRun".id;
    RETURN 'DONE';
  ELSIF "vRun".status = 'FAILED' THEN
    UPDATE "Platform"."PrivacyRequests" t SET step = 'APPROVED' WHERE t.id = "pId";
    RETURN 'APPROVED';
  END IF;
  RETURN 'PROCESSING';
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Right to be forgotten: Platform.anonymiseTenant.
--    The reviewed personal-data column list below is the whole routine: each listed column of the company's rows is
--    replaced irreversibly; nothing else changes and no row is deleted (invoices, vouchers and tax records are kept for
--    the retention period with names replaced). Kinds:
--      null        → NULL (a NOT NULL column gets 'Erased' / 1900-01-01)
--      text        → the replacement text ('{code}' = the row's code), e.g. 'Erased customer CUS-0001'
--      email       → erased-<row id>@erased.invalid      phone → 00000000000      date → 1900-01-01
--      iban        → PK00ERAS0000000000000000            code  → the row's code (employee last name)
--      taxid       → CNIC-shaped values only (13 digits) → NULL / 0000000000000; NTNs are kept with the tax records
--      empty_array → '{}'                                cnic_seq → 00000-<n>-0, unique per company (employees)
--    A NULL value stays NULL. Row-history copies of these columns are scrubbed as well (the audit hide list), and
--    the erasure itself is recorded as "system: privacy-erasure" under the request's correlation id, without the
--    erased values.
--    Guard: the Demo and Test companies (codes demo, test) are refused unless app.allowProtectedErasure is set, which
--    the application never sets.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."getErasureColumns"()
 RETURNS TABLE ("schemaName" text, "tableName" text, "columnName" text, kind text, replacement text, "keyColumn" text)
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT * FROM (VALUES
    -- people who sign in
    ('Company', 'Users', 'email', 'email', NULL, 'tenantId'),
    ('Company', 'Users', 'firstName', 'null', NULL, 'tenantId'),
    ('Company', 'Users', 'lastName', 'null', NULL, 'tenantId'),
    ('Company', 'Users', 'fullName', 'text', 'Erased user', 'tenantId'),
    ('Company', 'Users', 'phone', 'null', NULL, 'tenantId'),
    ('Company', 'Users', 'emailSignature', 'null', NULL, 'tenantId'),
    ('Company', 'Users', 'avatarAttachmentId', 'null', NULL, 'tenantId'),
    ('Company', 'Users', 'lastLoginIp', 'null', NULL, 'tenantId'),
    ('Company', 'UserInvites', 'email', 'email', NULL, 'tenantId'),
    ('Company', 'UserInvites', 'fullName', 'text', 'Erased', 'tenantId'),
    ('Company', 'UserInvites', 'phone', 'phone', NULL, 'tenantId'),
    ('Company', 'UserMfaMethods', 'phone', 'phone', NULL, 'tenantId'),
    ('Company', 'UserSessions', 'ipAddress', 'null', NULL, 'tenantId'),
    ('Company', 'UserSessions', 'userAgent', 'null', NULL, 'tenantId'),
    ('Company', 'UserSessions', 'deviceLabel', 'null', NULL, 'tenantId'),
    ('Company', 'UserSessions', 'locationLabel', 'null', NULL, 'tenantId'),
    ('Company', 'TrustedDevices', 'lastIp', 'null', NULL, 'tenantId'),
    ('Company', 'PasswordResets', 'requestedIp', 'null', NULL, 'tenantId'),
    ('Company', 'ApprovalActions', 'ipAddress', 'null', NULL, 'tenantId'),
    -- employees and candidates
    ('HumanResources', 'Employees', 'firstName', 'text', 'Erased', 'tenantId'),
    ('HumanResources', 'Employees', 'lastName', 'code', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'displayName', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'legalName', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'guardianName', 'text', 'Erased', 'tenantId'),
    ('HumanResources', 'Employees', 'cnic', 'cnic_seq', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'cnicIssueDate', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'cnicExpiryDate', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'dateOfBirth', 'date', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'maritalStatus', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'childrenCount', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'religion', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'bloodGroup', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'photoAttachmentId', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'mobile', 'phone', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'personalEmail', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'workEmail', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'currentAddress', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'permanentAddress', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'city', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'emergencyContactName', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'emergencyRelation', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'emergencyPhone', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'emergencyAltName', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'emergencyAltRelation', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'emergencyAltPhone', 'null', NULL, 'tenantId'),
    ('HumanResources', 'Employees', 'biometricId', 'null', NULL, 'tenantId'),
    ('HumanResources', 'EmployeeStatutoryDetails', 'eobiNo', 'null', NULL, 'tenantId'),
    ('HumanResources', 'EmployeeStatutoryDetails', 'socialSecurityNo', 'null', NULL, 'tenantId'),
    ('HumanResources', 'EmployeeStatutoryDetails', 'ntn', 'null', NULL, 'tenantId'),
    ('HumanResources', 'EmployeeBankAccounts', 'accountTitle', 'text', 'Erased', 'tenantId'),
    ('HumanResources', 'EmployeeBankAccounts', 'iban', 'iban', NULL, 'tenantId'),
    ('HumanResources', 'EmployeeBankAccounts', 'branchName', 'null', NULL, 'tenantId'),
    ('HumanResources', 'EmployeeLetters', 'addressedTo', 'text', 'Erased', 'tenantId'),
    ('HumanResources', 'Candidates', 'fullName', 'text', 'Erased candidate', 'tenantId'),
    ('HumanResources', 'Candidates', 'email', 'email', NULL, 'tenantId'),
    ('HumanResources', 'Candidates', 'phone', 'phone', NULL, 'tenantId'),
    ('HumanResources', 'Candidates', 'cnic', 'null', NULL, 'tenantId'),
    ('HumanResources', 'LeaveRequests', 'contactDuringLeave', 'null', NULL, 'tenantId'),
    ('HumanResources', 'AttendancePunches', 'latitude', 'null', NULL, 'tenantId'),
    ('HumanResources', 'AttendancePunches', 'longitude', 'null', NULL, 'tenantId'),
    ('EmployeeSelfService', 'HelpdeskTickets', 'contactValue', 'null', NULL, 'tenantId'),
    ('EmployeeSelfService', 'LetterRequests', 'addressedTo', 'text', 'Erased', 'tenantId'),
    ('EmployeeSelfService', 'PolicyAcknowledgements', 'signatureText', 'text', 'Erased', 'tenantId'),
    ('EmployeeSelfService', 'PolicyAcknowledgements', 'ipAddress', 'null', NULL, 'tenantId'),
    ('Payroll', 'PayrollRunLines', 'ibanMasked', 'null', NULL, 'tenantId'),
    ('Payroll', 'Payslips', 'emailTo', 'null', NULL, 'tenantId'),
    -- customers, vendors and their contacts / addresses
    ('Sales', 'Customers', 'name', 'text', 'Erased customer {code}', 'tenantId'),
    ('Sales', 'Customers', 'displayName', 'null', NULL, 'tenantId'),
    ('Sales', 'Customers', 'cnic', 'null', NULL, 'tenantId'),
    ('Sales', 'Customers', 'contactPerson', 'null', NULL, 'tenantId'),
    ('Sales', 'Customers', 'mobile', 'null', NULL, 'tenantId'),
    ('Sales', 'Customers', 'phone', 'null', NULL, 'tenantId'),
    ('Sales', 'Customers', 'email', 'null', NULL, 'tenantId'),
    ('Sales', 'Customers', 'billingAddress', 'null', NULL, 'tenantId'),
    ('Sales', 'Customers', 'shippingAddress', 'text', 'Erased', 'tenantId'),
    ('Sales', 'Customers', 'guarantorName', 'null', NULL, 'tenantId'),
    ('Sales', 'Customers', 'guarantorFatherName', 'null', NULL, 'tenantId'),
    ('Sales', 'Customers', 'guarantorCnic', 'null', NULL, 'tenantId'),
    ('Sales', 'Customers', 'guarantorPhone', 'null', NULL, 'tenantId'),
    ('Sales', 'Customers', 'guarantorAddress', 'null', NULL, 'tenantId'),
    ('Sales', 'CustomerContacts', 'fullName', 'text', 'Erased', 'tenantId'),
    ('Sales', 'CustomerContacts', 'mobile', 'null', NULL, 'tenantId'),
    ('Sales', 'CustomerContacts', 'phone', 'null', NULL, 'tenantId'),
    ('Sales', 'CustomerContacts', 'email', 'null', NULL, 'tenantId'),
    ('Sales', 'CustomerAddresses', 'addressLine', 'text', 'Erased', 'tenantId'),
    ('Sales', 'CustomerAddresses', 'contactName', 'null', NULL, 'tenantId'),
    ('Sales', 'CustomerAddresses', 'contactPhone', 'null', NULL, 'tenantId'),
    ('Purchases', 'Vendors', 'name', 'text', 'Erased vendor {code}', 'tenantId'),
    ('Purchases', 'Vendors', 'legalName', 'null', NULL, 'tenantId'),
    ('Purchases', 'Vendors', 'cnic', 'null', NULL, 'tenantId'),
    ('Purchases', 'Vendors', 'phone', 'null', NULL, 'tenantId'),
    ('Purchases', 'Vendors', 'email', 'null', NULL, 'tenantId'),
    ('Purchases', 'Vendors', 'address', 'null', NULL, 'tenantId'),
    ('Purchases', 'Vendors', 'bankName', 'null', NULL, 'tenantId'),
    ('Purchases', 'Vendors', 'iban', 'null', NULL, 'tenantId'),
    ('Purchases', 'VendorContacts', 'fullName', 'text', 'Erased', 'tenantId'),
    ('Purchases', 'VendorContacts', 'phone', 'null', NULL, 'tenantId'),
    ('Purchases', 'VendorContacts', 'mobile', 'null', NULL, 'tenantId'),
    ('Purchases', 'VendorContacts', 'email', 'null', NULL, 'tenantId'),
    ('Purchases', 'VendorBankAccounts', 'accountTitle', 'text', 'Erased', 'tenantId'),
    ('Purchases', 'VendorBankAccounts', 'accountNo', 'text', '0000', 'tenantId'),
    ('Purchases', 'VendorBankAccounts', 'iban', 'iban', NULL, 'tenantId'),
    -- names on financial and tax records (rows kept)
    ('Sales', 'SalesInvoices', 'buyerName', 'text', 'Erased', 'tenantId'),
    ('Sales', 'SalesInvoices', 'buyerAddress', 'null', NULL, 'tenantId'),
    ('Sales', 'SalesInvoices', 'buyerCnic', 'null', NULL, 'tenantId'),
    ('Sales', 'SalesInvoices', 'buyerCity', 'null', NULL, 'tenantId'),
    ('Sales', 'SalesInvoices', 'shipToAddress', 'null', NULL, 'tenantId'),
    ('Sales', 'SalesInvoices', 'contactName', 'null', NULL, 'tenantId'),
    ('Sales', 'SalesInvoices', 'contactPhone', 'null', NULL, 'tenantId'),
    ('Sales', 'SalesInvoices', 'contactEmail', 'null', NULL, 'tenantId'),
    ('Sales', 'SalesInvoices', 'bookerName', 'text', 'Erased', 'tenantId'),
    ('Sales', 'SalesInvoices', 'deliverymanName', 'text', 'Erased', 'tenantId'),
    ('Sales', 'SalesInvoices', 'salesmanName', 'text', 'Erased', 'tenantId'),
    ('Sales', 'SalesInvoices', 'supervisorName', 'text', 'Erased', 'tenantId'),
    ('Sales', 'DeliveryChallans', 'driverName', 'text', 'Erased', 'tenantId'),
    ('Sales', 'PaymentReminderLogs', 'recipient', 'text', 'Erased', 'tenantId'),
    ('Accounting', 'Vouchers', 'partyName', 'text', 'Erased', 'tenantId'),
    ('Accounting', 'RecurringVoucherTemplates', 'partyName', 'text', 'Erased', 'tenantId'),
    ('Accounting', 'FiscalYears', 'auditorName', 'text', 'Erased', 'tenantId'),
    ('BankCash', 'CashBookEntries', 'partyName', 'text', 'Erased', 'tenantId'),
    ('BankCash', 'Cheques', 'partyName', 'text', 'Erased', 'tenantId'),
    ('BankCash', 'ChequeBatchLines', 'partyName', 'text', 'Erased', 'tenantId'),
    ('Purchases', 'LandedCostCharges', 'payeeName', 'text', 'Erased', 'tenantId'),
    ('Inventory', 'StockInOut', 'requestedByName', 'text', 'Erased', 'tenantId'),
    ('Inventory', 'StockTransfers', 'driverName', 'text', 'Erased', 'tenantId'),
    ('Inventory', 'StockVouchers', 'recipientName', 'text', 'Erased', 'tenantId'),
    ('FixedAssets', 'AssetDisposals', 'buyerName', 'text', 'Erased', 'tenantId'),
    ('Distribution', 'OrderBookings', 'geoLat', 'null', NULL, 'tenantId'),
    ('Distribution', 'OrderBookings', 'geoLng', 'null', NULL, 'tenantId'),
    ('Tax', 'FbrInvoiceSubmissions', 'buyerName', 'text', 'Erased', 'tenantId'),
    ('Tax', 'FbrInvoiceSubmissions', 'buyerNtnCnic', 'taxid', NULL, 'tenantId'),
    ('Tax', 'SalesTaxReturnLines', 'partyName', 'text', 'Erased', 'tenantId'),
    ('Tax', 'SalesTaxReturnLines', 'partyNtnCnic', 'taxid', NULL, 'tenantId'),
    ('Tax', 'WhtCertificates', 'partyName', 'text', 'Erased', 'tenantId'),
    ('Tax', 'WhtCertificates', 'partyNtnCnic', 'taxid', NULL, 'tenantId'),
    ('Tax', 'WhtDeductions', 'partyName', 'text', 'Erased', 'tenantId'),
    ('Tax', 'WhtDeductions', 'partyNtnCnic', 'taxid', NULL, 'tenantId'),
    ('Reports', 'ReportSchedules', 'recipientEmails', 'empty_array', NULL, 'tenantId'),
    -- the company's people on the platform side
    ('Platform', 'Tenants', 'email', 'null', NULL, 'id'),
    ('Platform', 'Tenants', 'phone', 'null', NULL, 'id'),
    ('Platform', 'TenantContacts', 'fullName', 'text', 'Erased contact', 'tenantId'),
    ('Platform', 'TenantContacts', 'email', 'email', NULL, 'tenantId'),
    ('Platform', 'TenantContacts', 'mobile', 'null', NULL, 'tenantId'),
    ('Platform', 'TenantContacts', 'cnic', 'null', NULL, 'tenantId'),
    ('Platform', 'SupportTickets', 'requesterName', 'text', 'Erased', 'tenantId'),
    ('Platform', 'SupportTickets', 'requesterEmail', 'email', NULL, 'tenantId'),
    ('Platform', 'PlatformLeads', 'contactPerson', 'text', 'Erased', 'tenantId'),
    ('Platform', 'PlatformLeads', 'phone', 'null', NULL, 'tenantId'),
    ('Platform', 'PlatformLeads', 'email', 'null', NULL, 'tenantId'),
    ('Platform', 'CommunicationLogs', 'recipient', 'text', 'Erased', 'tenantId')
  ) AS l("schemaName", "tableName", "columnName", kind, replacement, "keyColumn")
$function$;

CREATE OR REPLACE FUNCTION "Platform"."anonymiseTenant"("pTenantId" uuid, "pRef" text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vCode"    text;
  "vT"       record;
  "vC"       record;
  "vRel"     regclass;
  "vNN"      boolean;
  "vType"    text;
  "vExpr"    text;
  "vSet"     text;
  "vCols"    text[];
  "vN"       bigint;
  "vTables"  jsonb := '[]'::jsonb;
  "vAudit"   bigint := 0;
  "vTotal"   bigint := 0;
  "vCorr"    text := NULLIF(current_setting('app.correlationId', true), '');
  "vStaff"   uuid := "Company"."getCurrentUserId"();
BEGIN
  SELECT t.code INTO "vCode" FROM "Platform"."Tenants" t WHERE t.id = "pTenantId";
  IF NOT FOUND THEN RAISE EXCEPTION 'Company % not found', "pTenantId" USING ERRCODE = 'no_data_found'; END IF;
  -- Guard: Demo and Test Co are never erased by the app (app.allowProtectedErasure is never set by the application).
  IF lower("vCode") IN ('demo', 'test') AND COALESCE(current_setting('app.allowProtectedErasure', true), '') NOT IN ('on', 'true') THEN
    RAISE EXCEPTION 'Company % is protected and cannot be erased', "vCode" USING ERRCODE = 'insufficient_privilege', HINT = 'PRIVACY_PROTECTED_TENANT';
  END IF;
  IF "vStaff" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Platform"."PlatformStaff" s WHERE s.id = "vStaff") THEN "vStaff" := NULL; END IF;

  -- Row triggers are off while the personal data is replaced: posted documents are frozen by triggers, and the
  -- per-row history would copy the erased values. The erasure is recorded once per table below instead.
  PERFORM set_config('session_replication_role', 'replica', true);

  -- personal files (photos, avatars, employee documents): hidden and renamed
  UPDATE "Company"."Attachments" a SET "fileName" = 'erased', "deletedAt" = COALESCE(a."deletedAt", now())
   WHERE a."tenantId" = "pTenantId" AND a.id IN (
     SELECT e."photoAttachmentId" FROM "HumanResources"."Employees" e WHERE e."tenantId" = "pTenantId" AND e."photoAttachmentId" IS NOT NULL
     UNION SELECT u."avatarAttachmentId" FROM "Company"."Users" u WHERE u."tenantId" = "pTenantId" AND u."avatarAttachmentId" IS NOT NULL
     UNION SELECT d."attachmentId" FROM "HumanResources"."EmployeeDocuments" d WHERE d."tenantId" = "pTenantId" AND d."attachmentId" IS NOT NULL);

  -- sign-in data: every login disabled (no password, no SSO, no MFA secret), accounts suspended
  UPDATE "Company"."Users" u
     SET status = CASE WHEN u.status = 'REMOVED' THEN u.status ELSE 'SUSPENDED' END, "suspendedAt" = COALESCE(u."suspendedAt", now()),
         "passwordHash" = NULL, "ssoProvider" = NULL, "ssoSubject" = NULL, "mfaEnabled" = false, "mfaMethod" = NULL, "mfaSecretEnc" = NULL,
         "mfaRecoveryCodes" = NULL, "ipRestricted" = false, "ipAllowlist" = NULL
   WHERE u."tenantId" = "pTenantId";

  -- employee CNICs: unique per company, so numbered
  UPDATE "HumanResources"."Employees" e SET cnic = '00000-' || lpad(x.rn::text, 7, '0') || '-0'
    FROM (SELECT id, row_number() OVER (ORDER BY id) rn FROM "HumanResources"."Employees" WHERE "tenantId" = "pTenantId") x
   WHERE e.id = x.id AND e."tenantId" = "pTenantId";

  FOR "vT" IN SELECT DISTINCT l."schemaName" s, l."tableName" t, l."keyColumn" k FROM "Platform"."getErasureColumns"() l ORDER BY 1, 2 LOOP
    "vRel" := to_regclass(format('%I.%I', "vT".s, "vT".t));
    CONTINUE WHEN "vRel" IS NULL;
    "vSet" := ''; "vCols" := '{}';
    FOR "vC" IN SELECT * FROM "Platform"."getErasureColumns"() l WHERE l."schemaName" = "vT".s AND l."tableName" = "vT".t LOOP
      SELECT a.attnotnull, format_type(a.atttypid, a.atttypmod) INTO "vNN", "vType"
        FROM pg_attribute a WHERE a.attrelid = "vRel" AND a.attname = "vC"."columnName" AND a.attnum > 0 AND NOT a.attisdropped
         AND a.attgenerated = '';   -- generated columns (e.g. a display name) follow their sources
      CONTINUE WHEN NOT FOUND;
      "vCols" := "vCols" || "vC"."columnName";
      CONTINUE WHEN "vC".kind = 'cnic_seq';   -- done above
      "vExpr" := CASE "vC".kind
        WHEN 'null' THEN CASE WHEN NOT "vNN" THEN 'NULL' WHEN "vType" LIKE 'date%' THEN quote_literal('1900-01-01') ELSE quote_literal('Erased') END
        WHEN 'text' THEN CASE WHEN "vC".replacement LIKE '%{code}%'
                              THEN format('replace(%L, ''{code}'', COALESCE(%I::text, ''''))', "vC".replacement, 'code')
                              ELSE quote_literal(COALESCE("vC".replacement, 'Erased')) END
        WHEN 'email' THEN '''erased-'' || replace(id::text, ''-'', '''') || ''@erased.invalid'''
        WHEN 'phone' THEN quote_literal('00000000000')
        WHEN 'date' THEN quote_literal('1900-01-01')
        WHEN 'iban' THEN quote_literal('PK00ERAS0000000000000000')
        WHEN 'code' THEN 'COALESCE("code"::text, ''Erased'')'
        WHEN 'taxid' THEN format('CASE WHEN %I ~ ''^[0-9]{5}-?[0-9]{7}-?[0-9]$'' THEN %s ELSE %I END', "vC"."columnName",
                                 CASE WHEN "vNN" THEN quote_literal('0000000000000') ELSE 'NULL' END, "vC"."columnName")
        WHEN 'empty_array' THEN quote_literal('{}')
      END;
      "vSet" := "vSet" || format('%I = CASE WHEN %I IS NULL THEN NULL ELSE (%s)::%s END, ', "vC"."columnName", "vC"."columnName", "vExpr", "vType");
    END LOOP;
    CONTINUE WHEN cardinality("vCols") = 0;
    "vN" := 0;
    IF "vSet" <> '' THEN
      EXECUTE format('UPDATE %I.%I SET %s WHERE %I = $1', "vT".s, "vT".t, left("vSet", length("vSet") - 2), "vT".k) USING "pTenantId";
      GET DIAGNOSTICS "vN" = ROW_COUNT;
    ELSE
      EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I = $1', "vT".s, "vT".t, "vT".k) INTO "vN" USING "pTenantId";
    END IF;
    "vTotal" := "vTotal" + "vN";
    "vTables" := "vTables" || jsonb_build_object('schema', "vT".s, 'table', "vT".t, 'columns', to_jsonb("vCols"), 'rows', "vN");
  END LOOP;

  -- the audit hide list: the same columns are removed from this company's row-history copies, and the people who
  -- made the changes lose their names, emails, IPs and user agents
  UPDATE "Company"."AuditTrailEntries" a
     SET "rowData" = a."rowData" - l.cols, changes = a.changes - l.cols,
         "recordLabel" = CASE WHEN a."recordLabel" IS NULL THEN NULL ELSE 'Erased' END
    FROM (SELECT g."schemaName" s, g."tableName" t, array_agg(g."columnName") cols FROM "Platform"."getErasureColumns"() g GROUP BY 1, 2) l
   WHERE a."tenantId" = "pTenantId" AND a."schemaName" = l.s AND a."tableName" = l.t;
  GET DIAGNOSTICS "vAudit" = ROW_COUNT;
  UPDATE "Company"."AuditTrailEntries" a
     SET "actorName" = CASE WHEN a."userId" IS NOT NULL THEN 'Erased user' ELSE a."actorName" END, "actorEmail" = NULL, "ipAddress" = NULL, "userAgent" = NULL
   WHERE a."tenantId" = "pTenantId" AND (a."actorEmail" IS NOT NULL OR a."ipAddress" IS NOT NULL OR a."userAgent" IS NOT NULL OR a."userId" IS NOT NULL);
  UPDATE "Platform"."PlatformAuditLogs" p
     SET payload = p.payload - l.cols, "rowData" = p."rowData" - l.cols
    FROM (SELECT g."tableName" t, array_agg(g."columnName") cols FROM "Platform"."getErasureColumns"() g WHERE g."schemaName" = 'Platform' GROUP BY 1) l
   WHERE p."tenantId" = "pTenantId" AND p.action LIKE l.t || '.%';
  UPDATE "Platform"."ErrorLogs" e SET details = e.details - 'attemptedEmail'
   WHERE e."tenantId" = "pTenantId" AND e.details ? 'attemptedEmail';

  PERFORM set_config('session_replication_role', 'origin', true);

  -- the erasure itself, once per table, without values: company tables in the company history, platform tables in
  -- the platform log
  INSERT INTO "Company"."AuditTrailEntries" ("tenantId", "occurredAt", "userId", "actorName", action, "schemaName", "tableName", "recordLabel", changes, "rowData", "correlationId", "hashVersion")
  SELECT "pTenantId", now(), NULL, 'system: privacy-erasure', 'UPDATE', x ->> 'schema', x ->> 'table', left("pRef", 200),
         jsonb_build_object('erasedColumns', x -> 'columns', 'rows', x -> 'rows', 'privacyRequest', "pRef"), '{}'::jsonb, "vCorr", 2
    FROM jsonb_array_elements("vTables") x WHERE x ->> 'schema' <> 'Platform';
  INSERT INTO "Platform"."PlatformAuditLogs" ("occurredAt", "staffUserId", "actorLabel", action, "tenantId", details, payload, "rowData", "correlationId", result)
  SELECT now(), "vStaff", 'system: privacy-erasure', (x ->> 'table') || '.erase', "pTenantId", 'Platform.' || (x ->> 'table') || ' ' || "pRef",
         jsonb_build_object('erasedColumns', x -> 'columns', 'rows', x -> 'rows', 'privacyRequest', "pRef"), '{}'::jsonb, "vCorr", 'RECORDED'
    FROM jsonb_array_elements("vTables") x WHERE x ->> 'schema' = 'Platform';

  RETURN jsonb_build_object('kind', 'DELETE', 'tenantCode', "vCode", 'erasedAt', now(), 'tables', "vTables", 'rowsTouched', "vTotal", 'historyEntriesScrubbed', "vAudit");
END $function$;

-- DELETE fulfilment: typed company code, approved request → anonymise, revoke every session, cancel the live
-- subscription, close the company (CHURNED) and complete the request with its certificate. One transaction.
CREATE OR REPLACE FUNCTION "Platform"."privacyRequestFulfilDelete"("pId" uuid, "pConfirmCode" text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vStaff"   uuid := "Platform"."currentStaffId"();
  "vRow"     "Platform"."PrivacyRequests" := "Platform"."privacyRequestLock"("pId", ARRAY['APPROVED']);
  "vTenant"  "Platform"."Tenants";
  "vSummary" jsonb;
  "vSub"     record;
  "vMrr"     numeric;
  "vRevoked" integer;
BEGIN
  IF "vRow"."requestType" <> 'DELETE' THEN
    RAISE EXCEPTION '% is not a deletion', "vRow"."docNo" USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PRIVACY_STEP_ORDER';
  END IF;
  SELECT * INTO "vTenant" FROM "Platform"."Tenants" t WHERE t.id = "vRow"."tenantId" FOR UPDATE;
  IF lower(btrim(COALESCE("pConfirmCode", ''))) IS DISTINCT FROM lower("vTenant".code::text) THEN
    RAISE EXCEPTION 'Type the company code % to confirm', "vTenant".code USING ERRCODE = 'check_violation', HINT = 'PRIVACY_CONFIRM_REQUIRED';
  END IF;
  UPDATE "Platform"."PrivacyRequests" t SET step = 'PROCESSING' WHERE t.id = "pId";

  "vSummary" := "Platform"."anonymiseTenant"("vRow"."tenantId", "vRow"."docNo");

  UPDATE "Company"."UserSessions" s SET "revokedAt" = now(), "revokeReason" = 'PRIVACY_ERASURE'
   WHERE s."tenantId" = "vRow"."tenantId" AND s."revokedAt" IS NULL;
  GET DIAGNOSTICS "vRevoked" = ROW_COUNT;

  FOR "vSub" IN SELECT * FROM "Platform"."Subscriptions" s WHERE s."tenantId" = "vRow"."tenantId" AND s.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED') FOR UPDATE LOOP
    "vMrr" := CASE WHEN "vSub".status IN ('ACTIVE', 'PAST_DUE', 'SUSPENDED')
                   THEN round(CASE WHEN "vSub"."billingCycle" = 'ANNUAL' THEN "vSub".amount / 12 ELSE "vSub".amount END, 2) ELSE 0 END;
    UPDATE "Platform"."Subscriptions" s
       SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = 'Privacy erasure ' || "vRow"."docNo", "autoRenew" = false, "nextRenewalOn" = NULL
     WHERE s.id = "vSub".id;
    INSERT INTO "Platform"."SubscriptionEvents" ("subscriptionId", "tenantId", "eventType", "fromPlanId", "mrrBefore", "mrrAfter", movement, "staffUserId", note, "effectiveOn")
    VALUES ("vSub".id, "vRow"."tenantId", 'CANCELLED', "vSub"."planId", "vMrr", 0, CASE WHEN "vMrr" > 0 THEN 'CHURN' ELSE 'NONE' END, "vStaff",
            'Company erased (' || "vRow"."docNo" || ')', (now() AT TIME ZONE 'Asia/Karachi')::date);
  END LOOP;

  UPDATE "Platform"."Tenants" t
     SET status = 'CHURNED', "churnedAt" = COALESCE(t."churnedAt", now()), "churnReason" = 'PRIVACY_ERASURE'
   WHERE t.id = "vRow"."tenantId";

  "vSummary" := "vSummary" || jsonb_build_object('sessionsRevoked', "vRevoked", 'companyStatus', 'CHURNED');
  UPDATE "Platform"."PrivacyRequests" t
     SET step = 'DONE', "completedAt" = now(), "certificateRef" = 'CERT-' || t."docNo", "fulfilmentSummary" = "vSummary"
   WHERE t.id = "pId";
  RETURN "vSummary";
END $function$;

-- ---------------------------------------------------------------------------
-- 7. Lookups: tones of the Phase 43 lists (template badges) and the new codes.
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" l SET tone = v.tone
  FROM (VALUES
    ('Impact', 'MINOR', 'warn'), ('Impact', 'MAJOR', 'danger'), ('Impact', 'CRITICAL', 'danger'),
    ('ServiceIncidentStage', 'INVESTIGATING', 'warn'), ('ServiceIncidentStage', 'IDENTIFIED', 'violet'), ('ServiceIncidentStage', 'MONITORING', 'info'), ('ServiceIncidentStage', 'RESOLVED', 'good'),
    ('PrivacyRequestType', 'EXPORT', 'info'), ('PrivacyRequestType', 'DELETE', 'danger'),
    ('Step', 'RECEIVED', 'neutral'), ('Step', 'VERIFIED', 'info'), ('Step', 'APPROVED', 'violet'), ('Step', 'PROCESSING', 'info'), ('Step', 'DONE', 'good'), ('Step', 'REJECTED', 'danger'),
    ('ImpactTone', 'GAIN', 'good'), ('ImpactTone', 'LOSS', 'danger'), ('ImpactTone', 'NEUTRAL', 'neutral'),
    ('ChangeKind', 'FEATURE', 'violet'), ('ChangeKind', 'LIMIT', 'info'), ('ChangeKind', 'ADDON_PRICE', 'warn'),
    ('FlagScheduledChangeStatus', 'PLANNED', 'info'), ('FlagScheduledChangeStatus', 'REQUESTED', 'warn'),
    ('FlagChangeRequestSource', 'SCHEDULE_STEP', 'violet'),
    ('Decision', 'WAITING', 'neutral')
  ) AS v("lookupType", code, tone)
 WHERE l."lookupType" = v."lookupType" AND l.code = v.code AND l."tenantId" IS NULL AND l.tone IS DISTINCT FROM v.tone;

INSERT INTO "Lookups"."Lookups" ("lookupType", "code", "label", "description", "tone", "sortOrder", "isActive", "isSystem")
VALUES
  ('RevokeReason', 'PRIVACY_ERASURE', 'Company erased', 'Ended when the company''s personal data was erased (privacy request)', 'danger', 11, true, true),
  ('ChurnReason', 'PRIVACY_ERASURE', 'Data erased on request', 'Closed after a right-to-be-forgotten request', 'danger', 9, true, true)
ON CONFLICT ("lookupType", "code", "tenantId") DO UPDATE SET "label" = EXCLUDED."label", "description" = EXCLUDED."description", "isActive" = true, "isSystem" = true;

-- ---------------------------------------------------------------------------
-- 8. Error codes (Phase 43).
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('INCIDENT_RESOLVED',            409, 'BUSINESS_RULE', 'PLATFORM', 'This incident is resolved. Only its post-mortem can change.', 'Update of a resolved incident', true, NULL),
  ('INCIDENT_STAGE_ORDER',         409, 'BUSINESS_RULE', 'PLATFORM', 'An incident moves forward: Investigating, Identified, Monitoring, Resolved.', 'Incident stage moved backwards', true, NULL),
  ('FOUR_EYES_REQUIRED',           403, 'BUSINESS_RULE', 'PLATFORM', 'A second platform admin must approve this. You can''t approve your own request.', 'Requester deciding their own request while more than one staff member is active', true, NULL),
  ('SOLO_CONFIRM_REQUIRED',        400, 'BUSINESS_RULE', 'PLATFORM', 'You are the only platform admin. Type the confirmation and a note to approve on your own.', 'Solo approval without the typed key / company code or note', true, NULL),
  ('CR_NOTE_REQUIRED',             400, 'BUSINESS_RULE', 'PLATFORM', 'Add a note: what you checked before approving, or why you reject.', 'Change request decision without a note', true, NULL),
  ('CR_REASON_REQUIRED',           400, 'BUSINESS_RULE', 'PLATFORM', 'Give the reason for the change.', 'Change request without a reason', true, NULL),
  ('CR_PENDING_EXISTS',            409, 'BUSINESS_RULE', 'PLATFORM', 'This flag already has a pending change request in this environment. Decide or cancel it first.', 'Second pending change request for one flag and environment', true, NULL),
  ('CR_NOT_PENDING',               409, 'BUSINESS_RULE', 'PLATFORM', 'This change request is no longer pending.', 'Decision on a decided, applied or cancelled change request', true, NULL),
  ('CR_STALE',                     409, 'BUSINESS_RULE', 'PLATFORM', 'The flag changed since this request was made. Reject it and request the change again.', 'Applying a change request over a changed environment', true, NULL),
  ('FLAG_CHANGE_REQUEST_REQUIRED', 409, 'BUSINESS_RULE', 'PLATFORM', 'Production changes go through a change request. Submit one for approval.', 'Direct Production toggle or targeting save', true, NULL),
  ('SCHEDULE_INVALID',             400, 'BUSINESS_RULE', 'PLATFORM', 'Check the ramp steps: dates after today, each date once, 0 to 100 percent.', 'Invalid scheduled rollout steps', true, NULL),
  ('PRIVACY_STEP_ORDER',           409, 'BUSINESS_RULE', 'PLATFORM', 'This privacy request is not at that step.', 'Privacy request workflow out of order', true, NULL),
  ('PRIVACY_CONFIRM_REQUIRED',     400, 'BUSINESS_RULE', 'PLATFORM', 'Type the company code to confirm the deletion.', 'Deletion without the typed company code', true, NULL),
  ('PRIVACY_PROTECTED_TENANT',     403, 'BUSINESS_RULE', 'PLATFORM', 'This company is protected and can''t be erased.', 'Erasure of the Demo or Test company', true, NULL),
  ('PRIVACY_REQUEST_OPEN',         409, 'BUSINESS_RULE', 'PLATFORM', 'This company already has an open request of this type.', 'Second open privacy request of one type for a company', true, NULL),
  ('PRIVACY_EXPORT_EXPIRED',       410, 'BUSINESS_RULE', 'PLATFORM', 'This export is no longer available. Its download link expired.', 'Export download after exportLinkExpiresAt or without a file', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;
