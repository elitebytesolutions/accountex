-- 205-talent.sql
-- Phase 33 rev 2 (talent half: recruitment, performance, training). Split from 204 so two builders don't share one file.
--   1. Row history on the 11 talent tables that had none.
--   2. Stage / status guard: candidates, reviews, enrolments and certifications change stage only through the functions below.
--   3. Job openings (REQ): insert keeps channels / posted date, cancel sets closedOn; submit / approve / return / open / hold / close.
--   4. Candidates: opening must be open; move / reject / hire (hire starts the onboarding and links it to the candidate).
--   5. Performance: reviews for a cycle; submit-self / submit-manager / calibrate / sign-off; feedback request vs give.
--   6. Training: sessions; enrolment seats and auto in-progress; complete (issues the certification); withdraw.
--   7. REQ numbering + the JOB_REQUISITION subject and its default workflow (HR Manager) for every company.
--   8. Error codes.
-- Idempotent: safe to run repeatedly via npm run db:sql.
SELECT set_config('app.actorLabel', '205-talent.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Row history
-- ---------------------------------------------------------------------------
DO $do$
DECLARE "t" text;
BEGIN
  FOREACH "t" IN ARRAY ARRAY['JobOpenings', 'Candidates', 'CandidateActivities', 'Goals', 'PerformanceFeedback', 'OneOnOneMeetings',
                             'CompetencyRatings', 'KeyResults', 'TrainingSessions', 'TrainingEnrolments', 'Certifications'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON "HumanResources".%I', lower(left("t", 1)) || substr("t", 2) || 'Audit', "t");
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON "HumanResources".%I FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"()',
                   lower(left("t", 1)) || substr("t", 2) || 'Audit', "t");
  END LOOP;
END $do$;

-- ---------------------------------------------------------------------------
-- 2. Stage / status guard. The transition functions switch app.talentTransition on for their own writes only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."talentTransition"("pOn" boolean)
  RETURNS void
  LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM set_config('app.talentTransition', CASE WHEN "pOn" THEN 'on' ELSE '' END, true);
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."triggerTalentStageGuard"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vOn" boolean := COALESCE(current_setting('app.talentTransition', true), '') = 'on';
BEGIN
  IF "vOn" THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'Candidates' THEN
    IF (TG_OP = 'INSERT' AND (NEW.stage <> 'APPLIED' OR NEW."hiredEmployeeId" IS NOT NULL))
       OR (TG_OP = 'UPDATE' AND (NEW.stage IS DISTINCT FROM OLD.stage OR NEW."hiredEmployeeId" IS DISTINCT FROM OLD."hiredEmployeeId"
                                 OR NEW."offerStatus" IS DISTINCT FROM OLD."offerStatus")) THEN
      RAISE EXCEPTION 'A candidate''s stage changes only through move, reject or hire' USING ERRCODE = 'check_violation', HINT = 'TALENT_STAGE_ORDER';
    END IF;
  ELSIF TG_TABLE_NAME = 'PerformanceReviews' THEN
    IF (TG_OP = 'INSERT' AND (NEW.stage <> 'SELF_PENDING' OR NEW."selfRating" IS NOT NULL OR NEW."managerRating" IS NOT NULL OR NEW."finalRating" IS NOT NULL))
       OR (TG_OP = 'UPDATE' AND (NEW.stage IS DISTINCT FROM OLD.stage OR NEW."selfRating" IS DISTINCT FROM OLD."selfRating"
                                 OR NEW."managerRating" IS DISTINCT FROM OLD."managerRating" OR NEW."finalRating" IS DISTINCT FROM OLD."finalRating"
                                 OR NEW."selfSubmittedAt" IS DISTINCT FROM OLD."selfSubmittedAt" OR NEW."managerSubmittedAt" IS DISTINCT FROM OLD."managerSubmittedAt"
                                 OR NEW."calibratedAt" IS DISTINCT FROM OLD."calibratedAt" OR NEW."signedOffAt" IS DISTINCT FROM OLD."signedOffAt")) THEN
      RAISE EXCEPTION 'A review''s stage and ratings change only through submit-self, submit-manager, calibrate or sign-off'
        USING ERRCODE = 'check_violation', HINT = 'TALENT_STAGE_ORDER';
    END IF;
  ELSIF TG_TABLE_NAME = 'TrainingEnrolments' THEN
    IF (TG_OP = 'INSERT' AND NEW.status <> 'ENROLLED') OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
        AND NOT (OLD.status = 'ENROLLED' AND NEW.status IN ('IN_PROGRESS', 'BEHIND')) AND NOT (OLD.status IN ('IN_PROGRESS', 'BEHIND') AND NEW.status IN ('IN_PROGRESS', 'BEHIND'))) THEN
      RAISE EXCEPTION 'An enrolment is completed or withdrawn only through its own action' USING ERRCODE = 'check_violation', HINT = 'TALENT_STAGE_ORDER';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('COMPLETED', 'WITHDRAWN') THEN
      RAISE EXCEPTION 'This enrolment is closed' USING ERRCODE = 'check_violation', HINT = 'TALENT_STAGE_ORDER';
    END IF;
  ELSIF TG_TABLE_NAME = 'Certifications' THEN
    IF (TG_OP = 'INSERT' AND NEW.status <> 'ACTIVE') OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
      RAISE EXCEPTION 'A certification''s status is set by the system' USING ERRCODE = 'check_violation', HINT = 'TALENT_STAGE_ORDER';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DO $do$
DECLARE "t" text;
BEGIN
  FOREACH "t" IN ARRAY ARRAY['Candidates', 'PerformanceReviews', 'TrainingEnrolments', 'Certifications'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS "talentStageGuard" ON "HumanResources".%I', "t");
    EXECUTE format('CREATE TRIGGER "talentStageGuard" BEFORE INSERT OR UPDATE ON "HumanResources".%I FOR EACH ROW EXECUTE FUNCTION "HumanResources"."triggerTalentStageGuard"()', "t");
  END LOOP;
END $do$;

-- ---------------------------------------------------------------------------
-- 3. Job openings (REQ-)
-- ---------------------------------------------------------------------------
-- Insert: number from REQ, keep postedChannels / postedOn, always a DRAFT. Edit: DRAFT only; status never from here.
CREATE OR REPLACE FUNCTION "HumanResources"."jobOpeningAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec"    "HumanResources"."JobOpenings";
  "vId"     uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet"    uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."JobOpenings", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."JobOpenings" ("tenantId", "docNo", title, "designationId", "departmentId", "branchId", openings, "requisitionType",
           "replacesEmployeeId", "hiringMode", "hiringManagerEmployeeId", priority, "salaryMin", "salaryMax", "jobDescription", "postedChannels",
           "postedOn", "targetHireDate", status)
    VALUES ("vTenant", "Company"."getNextDocNo"('REQ', current_date, "vRec"."branchId"), "vRec".title, "vRec"."designationId", "vRec"."departmentId",
            "vRec"."branchId", COALESCE("vRec".openings, 1), COALESCE("vRec"."requisitionType", 'NEW'), "vRec"."replacesEmployeeId",
            COALESCE("vRec"."hiringMode", 'STANDARD'), "vRec"."hiringManagerEmployeeId", COALESCE("vRec".priority, 'NORMAL'), "vRec"."salaryMin",
            "vRec"."salaryMax", "vRec"."jobDescription", COALESCE("vRec"."postedChannels", ARRAY[]::text[]), "vRec"."postedOn", "vRec"."targetHireDate", 'DRAFT')
    RETURNING id INTO "vRet";
    RETURN "vRet";
  END IF;
  SELECT t.status INTO "vStatus" FROM "HumanResources"."JobOpenings" t WHERE t.id = "vId" AND t."tenantId" = "vTenant" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'JobOpenings % not found', "vId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vStatus" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only a draft requisition can be edited (this one is %)', "vStatus" USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'JOB_OPENING_NOT_EDITABLE';
  END IF;
  UPDATE "HumanResources"."JobOpenings" t
     SET title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
         "designationId" = CASE WHEN "pData" ? 'designationId' THEN "vRec"."designationId" ELSE t."designationId" END,
         "departmentId" = CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE t."departmentId" END,
         "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
         openings = CASE WHEN "pData" ? 'openings' THEN "vRec".openings ELSE t.openings END,
         "requisitionType" = CASE WHEN "pData" ? 'requisitionType' THEN "vRec"."requisitionType" ELSE t."requisitionType" END,
         "replacesEmployeeId" = CASE WHEN "pData" ? 'replacesEmployeeId' THEN "vRec"."replacesEmployeeId" ELSE t."replacesEmployeeId" END,
         "hiringMode" = CASE WHEN "pData" ? 'hiringMode' THEN "vRec"."hiringMode" ELSE t."hiringMode" END,
         "hiringManagerEmployeeId" = CASE WHEN "pData" ? 'hiringManagerEmployeeId' THEN "vRec"."hiringManagerEmployeeId" ELSE t."hiringManagerEmployeeId" END,
         priority = CASE WHEN "pData" ? 'priority' THEN "vRec".priority ELSE t.priority END,
         "salaryMin" = CASE WHEN "pData" ? 'salaryMin' THEN "vRec"."salaryMin" ELSE t."salaryMin" END,
         "salaryMax" = CASE WHEN "pData" ? 'salaryMax' THEN "vRec"."salaryMax" ELSE t."salaryMax" END,
         "jobDescription" = CASE WHEN "pData" ? 'jobDescription' THEN "vRec"."jobDescription" ELSE t."jobDescription" END,
         "postedChannels" = CASE WHEN "pData" ? 'postedChannels' THEN COALESCE("vRec"."postedChannels", ARRAY[]::text[]) ELSE t."postedChannels" END,
         "targetHireDate" = CASE WHEN "pData" ? 'targetHireDate' THEN "vRec"."targetHireDate" ELSE t."targetHireDate" END,
         "approvalRequestId" = CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE t."approvalRequestId" END
   WHERE t.id = "vId" AND t."tenantId" = "vTenant"
     AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
  RETURNING t.id INTO "vRet";
  IF "vRet" IS NULL THEN
    RAISE EXCEPTION 'JobOpenings %: record was changed by another user, reload and try again', "vId" USING ERRCODE = 'serialization_failure';
  END IF;
  RETURN "vRet";
END $function$;

-- One status move with its from-states; closedOn follows CLOSED / CANCELLED (jobRequisitionClosedChk).
CREATE OR REPLACE FUNCTION "HumanResources"."jobOpeningSetStatus"("pId" uuid, "pFrom" text[], "pTo" text)
  RETURNS "HumanResources"."JobOpenings"
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "HumanResources"."JobOpenings";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."JobOpenings" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'JobOpenings % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT ("vRow".status = ANY ("pFrom")) THEN
    RAISE EXCEPTION 'Requisition %: can''t move from % to %', "vRow"."docNo", "vRow".status, "pTo"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'JOB_OPENING_STATUS';
  END IF;
  UPDATE "HumanResources"."JobOpenings" t
     SET status = "pTo",
         "closedOn" = CASE WHEN "pTo" IN ('CLOSED', 'CANCELLED') THEN COALESCE(t."closedOn", current_date) ELSE NULL END
   WHERE t.id = "pId"
  RETURNING * INTO "vRow";
  RETURN "vRow";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."jobOpeningSubmit"("pId" uuid, "pApprovalRequestId" uuid DEFAULT NULL)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "HumanResources"."jobOpeningSetStatus"("pId", ARRAY['DRAFT'], 'PENDING_APPROVAL');
  IF "pApprovalRequestId" IS NOT NULL THEN
    UPDATE "HumanResources"."JobOpenings" t SET "approvalRequestId" = "pApprovalRequestId" WHERE t.id = "pId";
  END IF;
  RETURN "pId";
END $function$;

-- Approved (engine or HR directly): open for applicants.
CREATE OR REPLACE FUNCTION "HumanResources"."jobOpeningApprove"("pId" uuid)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "HumanResources"."jobOpeningSetStatus"("pId", ARRAY['PENDING_APPROVAL'], 'OPEN');
  RETURN "pId";
END $function$;

-- Rejected or sent back by the approver: back to draft for changes.
CREATE OR REPLACE FUNCTION "HumanResources"."jobOpeningReturn"("pId" uuid)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "HumanResources"."jobOpeningSetStatus"("pId", ARRAY['PENDING_APPROVAL'], 'DRAFT');
  UPDATE "HumanResources"."JobOpenings" t SET "approvalRequestId" = NULL WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- Open (from hold) or (re)post: channels and the posted date. pChannels NULL keeps the current channels.
CREATE OR REPLACE FUNCTION "HumanResources"."jobOpeningOpen"("pId" uuid, "pChannels" text[] DEFAULT NULL)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "HumanResources"."JobOpenings";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."JobOpenings" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'JobOpenings % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'ON_HOLD' THEN
    -- back to the offer stage when an offer is still out
    PERFORM "HumanResources"."jobOpeningSetStatus"("pId", ARRAY['ON_HOLD'],
      CASE WHEN EXISTS (SELECT 1 FROM "HumanResources"."Candidates" c WHERE c."tenantId" = "vRow"."tenantId" AND c."jobRequisitionId" = "pId" AND c.stage = 'OFFER')
           THEN 'OFFER_STAGE' ELSE 'OPEN' END);
  ELSIF "vRow".status NOT IN ('OPEN', 'OFFER_STAGE') THEN
    RAISE EXCEPTION 'Requisition %: can''t open from %', "vRow"."docNo", "vRow".status USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'JOB_OPENING_STATUS';
  END IF;
  UPDATE "HumanResources"."JobOpenings" t
     SET "postedChannels" = COALESCE("pChannels", t."postedChannels"),
         "postedOn" = CASE WHEN cardinality(COALESCE("pChannels", t."postedChannels")) > 0 THEN COALESCE(t."postedOn", current_date) ELSE t."postedOn" END
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."jobOpeningHold"("pId" uuid)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "HumanResources"."jobOpeningSetStatus"("pId", ARRAY['OPEN', 'OFFER_STAGE'], 'ON_HOLD');
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."jobOpeningClose"("pId" uuid)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "HumanResources"."jobOpeningSetStatus"("pId", ARRAY['OPEN', 'ON_HOLD', 'OFFER_STAGE'], 'CLOSED');
  RETURN "pId";
END $function$;

-- Defect: the generated cancel never set closedOn, so jobRequisitionClosedChk refused every cancel.
CREATE OR REPLACE FUNCTION "HumanResources"."jobOpeningCancel"("pId" uuid, "pReason" text DEFAULT NULL)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vStatus" text;
BEGIN
  SELECT t.status INTO "vStatus" FROM "HumanResources"."JobOpenings" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"();
  IF "vStatus" = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  PERFORM "HumanResources"."jobOpeningSetStatus"("pId", ARRAY['DRAFT', 'PENDING_APPROVAL', 'OPEN', 'ON_HOLD', 'OFFER_STAGE'], 'CANCELLED');
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Candidates
-- ---------------------------------------------------------------------------
-- New candidates only on an open requisition (or one at the offer stage).
CREATE OR REPLACE FUNCTION "HumanResources"."triggerCandidateOpening"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR NEW."jobRequisitionId" IS DISTINCT FROM OLD."jobRequisitionId" THEN
    IF NOT EXISTS (SELECT 1 FROM "HumanResources"."JobOpenings" j WHERE j."tenantId" = NEW."tenantId" AND j.id = NEW."jobRequisitionId" AND j.status IN ('OPEN', 'OFFER_STAGE')) THEN
      RAISE EXCEPTION 'Candidates can be added only to an open requisition' USING ERRCODE = 'check_violation', HINT = 'JOB_OPENING_NOT_OPEN';
    END IF;
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS "candidateOpening" ON "HumanResources"."Candidates";
CREATE TRIGGER "candidateOpening" BEFORE INSERT OR UPDATE OF "jobRequisitionId" ON "HumanResources"."Candidates"
  FOR EACH ROW EXECUTE FUNCTION "HumanResources"."triggerCandidateOpening"();

-- Opening status follows its candidates: OFFER_STAGE while an offer is out; CLOSED once every opening is hired.
CREATE OR REPLACE FUNCTION "HumanResources"."jobOpeningSyncFromCandidates"("pOpening" uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow"   "HumanResources"."JobOpenings";
  "vHired" integer;
  "vOffer" boolean;
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."JobOpenings" t WHERE t.id = "pOpening" FOR UPDATE;
  SELECT count(*) FILTER (WHERE c.stage = 'HIRED'), bool_or(c.stage = 'OFFER') INTO "vHired", "vOffer"
    FROM "HumanResources"."Candidates" c WHERE c."tenantId" = "vRow"."tenantId" AND c."jobRequisitionId" = "pOpening";
  IF "vRow".status IN ('OPEN', 'OFFER_STAGE') AND "vHired" >= "vRow".openings THEN
    PERFORM "HumanResources"."jobOpeningSetStatus"("pOpening", ARRAY['OPEN', 'OFFER_STAGE'], 'CLOSED');
  ELSIF "vRow".status = 'OPEN' AND COALESCE("vOffer", false) THEN
    PERFORM "HumanResources"."jobOpeningSetStatus"("pOpening", ARRAY['OPEN'], 'OFFER_STAGE');
  ELSIF "vRow".status = 'OFFER_STAGE' AND NOT COALESCE("vOffer", false) THEN
    PERFORM "HumanResources"."jobOpeningSetStatus"("pOpening", ARRAY['OFFER_STAGE'], 'OPEN');
  END IF;
END $function$;

-- Move between APPLIED / SCREENING / INTERVIEW / OFFER (either way). OFFER needs a salary: sets the offer out.
-- pData: { toStage, note, offeredSalary, rowVersion }
CREATE OR REPLACE FUNCTION "HumanResources"."candidateMove"("pId" uuid, "pData" jsonb)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vC"      "HumanResources"."Candidates";
  "vTo"     text := "pData" ->> 'toStage';
  "vSalary" numeric := NULLIF("pData" ->> 'offeredSalary', '')::numeric;
BEGIN
  SELECT * INTO "vC" FROM "HumanResources"."Candidates" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidates % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "pData" ? 'rowVersion' AND "vC"."rowVersion" <> ("pData" ->> 'rowVersion')::int THEN
    RAISE EXCEPTION 'Candidates %: record was changed by another user, reload and try again', "pId" USING ERRCODE = 'serialization_failure';
  END IF;
  IF "vC".stage IN ('HIRED', 'REJECTED') OR "vTo" NOT IN ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER') OR "vTo" = "vC".stage THEN
    RAISE EXCEPTION 'Candidate %: can''t move from % to %', "vC"."fullName", "vC".stage, COALESCE("vTo", '?')
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TALENT_STAGE_ORDER';
  END IF;
  IF "vTo" = 'OFFER' AND COALESCE("vSalary", "vC"."offeredSalary") IS NULL THEN
    RAISE EXCEPTION 'An offer needs the offered salary' USING ERRCODE = 'check_violation', HINT = 'CANDIDATE_OFFER_SALARY';
  END IF;
  PERFORM "HumanResources"."talentTransition"(true);
  UPDATE "HumanResources"."Candidates" t
     SET stage = "vTo",
         "offeredSalary" = CASE WHEN "vTo" = 'OFFER' THEN COALESCE("vSalary", t."offeredSalary") ELSE t."offeredSalary" END,
         "offerStatus" = CASE WHEN "vTo" = 'OFFER' THEN 'AWAITING' WHEN t.stage = 'OFFER' THEN 'WITHDRAWN' ELSE t."offerStatus" END,
         "offerSentOn" = CASE WHEN "vTo" = 'OFFER' THEN current_date ELSE t."offerSentOn" END
   WHERE t.id = "pId";
  PERFORM "HumanResources"."talentTransition"(false);
  INSERT INTO "HumanResources"."CandidateActivities" ("tenantId", "candidateId", "activityType", "fromStage", "toStage", summary, notes)
  VALUES ("vC"."tenantId", "pId", CASE WHEN "vTo" = 'OFFER' THEN 'OFFER' ELSE 'STAGE_CHANGE' END, "vC".stage, "vTo",
          CASE WHEN "vTo" = 'OFFER' THEN 'Offer sent' ELSE 'Moved to ' || initcap(lower("vTo")) END, NULLIF("pData" ->> 'note', ''));
  PERFORM "HumanResources"."jobOpeningSyncFromCandidates"("vC"."jobRequisitionId");
  RETURN "pId";
END $function$;

-- pData: { reason, declined (offer declined by the candidate), rowVersion }
CREATE OR REPLACE FUNCTION "HumanResources"."candidateReject"("pId" uuid, "pData" jsonb)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vC" "HumanResources"."Candidates";
BEGIN
  SELECT * INTO "vC" FROM "HumanResources"."Candidates" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidates % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "pData" ? 'rowVersion' AND "vC"."rowVersion" <> ("pData" ->> 'rowVersion')::int THEN
    RAISE EXCEPTION 'Candidates %: record was changed by another user, reload and try again', "pId" USING ERRCODE = 'serialization_failure';
  END IF;
  IF "vC".stage IN ('HIRED', 'REJECTED') THEN
    RAISE EXCEPTION 'Candidate % is already %', "vC"."fullName", lower("vC".stage) USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TALENT_STAGE_ORDER';
  END IF;
  PERFORM "HumanResources"."talentTransition"(true);
  UPDATE "HumanResources"."Candidates" t
     SET stage = 'REJECTED', "rejectionReason" = NULLIF("pData" ->> 'reason', ''),
         "offerStatus" = CASE WHEN t.stage = 'OFFER' THEN CASE WHEN ("pData" ->> 'declined')::boolean THEN 'DECLINED' ELSE 'WITHDRAWN' END ELSE t."offerStatus" END,
         "nextInterviewAt" = NULL
   WHERE t.id = "pId";
  PERFORM "HumanResources"."talentTransition"(false);
  INSERT INTO "HumanResources"."CandidateActivities" ("tenantId", "candidateId", "activityType", "fromStage", "toStage", summary, notes)
  VALUES ("vC"."tenantId", "pId", 'REJECTION', "vC".stage, 'REJECTED',
          CASE WHEN COALESCE(("pData" ->> 'declined')::boolean, false) THEN 'Offer declined' ELSE 'Rejected' END, NULLIF("pData" ->> 'reason', ''));
  PERFORM "HumanResources"."jobOpeningSyncFromCandidates"("vC"."jobRequisitionId");
  RETURN "pId";
END $function$;

-- Hire an OFFER-stage candidate as the employee the service just created (Phase 11 path, same transaction): starts the
-- onboarding from the template (Phase 31 onboardingFromTemplate) and links it to the candidate. Returns the onboarding id.
-- pData: { employeeId, templateId, joiningDate, buddyEmployeeId, offeredSalary, rowVersion }
CREATE OR REPLACE FUNCTION "HumanResources"."candidateHire"("pId" uuid, "pData" jsonb)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vC"   "HumanResources"."Candidates";
  "vEmp" uuid := NULLIF("pData" ->> 'employeeId', '')::uuid;
  "vOnb" uuid;
BEGIN
  SELECT * INTO "vC" FROM "HumanResources"."Candidates" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidates % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "pData" ? 'rowVersion' AND "vC"."rowVersion" <> ("pData" ->> 'rowVersion')::int THEN
    RAISE EXCEPTION 'Candidates %: record was changed by another user, reload and try again', "pId" USING ERRCODE = 'serialization_failure';
  END IF;
  IF "vC".stage <> 'OFFER' THEN
    RAISE EXCEPTION 'Only a candidate at the offer stage can be hired (% is %)', "vC"."fullName", lower("vC".stage)
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TALENT_STAGE_ORDER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HumanResources"."Employees" e WHERE e."tenantId" = "vC"."tenantId" AND e.id = "vEmp") THEN
    RAISE EXCEPTION 'Employee not found' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM "HumanResources"."talentTransition"(true);
  UPDATE "HumanResources"."Candidates" t
     SET stage = 'HIRED', "hiredEmployeeId" = "vEmp", "offerStatus" = 'ACCEPTED', "nextInterviewAt" = NULL,
         "offeredSalary" = COALESCE(NULLIF("pData" ->> 'offeredSalary', '')::numeric, t."offeredSalary")
   WHERE t.id = "pId";
  PERFORM "HumanResources"."talentTransition"(false);
  "vOnb" := "HumanResources"."onboardingFromTemplate"(jsonb_build_object(
    'employeeId', "vEmp", 'templateId', "pData" ->> 'templateId', 'joiningDate', "pData" ->> 'joiningDate', 'buddyEmployeeId', "pData" ->> 'buddyEmployeeId'));
  UPDATE "HumanResources"."Onboardings" o SET "candidateId" = "pId" WHERE o.id = "vOnb";
  INSERT INTO "HumanResources"."CandidateActivities" ("tenantId", "candidateId", "activityType", "fromStage", "toStage", summary)
  VALUES ("vC"."tenantId", "pId", 'STAGE_CHANGE', 'OFFER', 'HIRED', 'Hired · joins ' || to_char(COALESCE(NULLIF("pData" ->> 'joiningDate', '')::date, current_date), 'DD Mon YYYY'));
  PERFORM "HumanResources"."jobOpeningSyncFromCandidates"("vC"."jobRequisitionId");
  RETURN "vOnb";
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Performance
-- ---------------------------------------------------------------------------
-- One review per eligible employee of the cycle (active staff joined before the period ends; probation excluded when the
-- cycle says so), the line manager as reviewer. Existing reviews are kept. Returns how many were added.
CREATE OR REPLACE FUNCTION "HumanResources"."performanceReviewsGenerate"("pCycle" uuid)
  RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vCycle"  "HumanResources"."PerformanceCycles";
  "vN"      integer;
BEGIN
  SELECT * INTO "vCycle" FROM "HumanResources"."PerformanceCycles" c WHERE c."tenantId" = "vTenant" AND c.id = "pCycle";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PerformanceCycles % not found', "pCycle" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vCycle".status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Open the cycle before starting reviews' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TALENT_STAGE_ORDER';
  END IF;
  INSERT INTO "HumanResources"."PerformanceReviews" ("tenantId", "cycleId", "employeeId", "managerEmployeeId", stage)
  SELECT "vTenant", "pCycle", e.id, e."reportingManagerId", 'SELF_PENDING'
    FROM "HumanResources"."Employees" e
   WHERE e."tenantId" = "vTenant" AND e."deletedAt" IS NULL AND e.status <> 'EXITED'
     AND e."joiningDate" <= "vCycle"."periodEnd"
     AND NOT ("vCycle"."excludeProbation" AND e.status = 'PROBATION')
     AND NOT EXISTS (SELECT 1 FROM "HumanResources"."PerformanceReviews" r WHERE r."tenantId" = "vTenant" AND r."cycleId" = "pCycle" AND r."employeeId" = e.id);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  -- the employee's goals of this cycle belong to their review
  UPDATE "HumanResources"."Goals" g SET "performanceReviewId" = r.id
    FROM "HumanResources"."PerformanceReviews" r
   WHERE g."tenantId" = "vTenant" AND g."cycleId" = "pCycle" AND g."performanceReviewId" IS NULL
     AND r."tenantId" = "vTenant" AND r."cycleId" = "pCycle" AND r."employeeId" = g."employeeId";
  RETURN "vN";
END $function$;

-- Competency ratings of one rater role: replaced as a set. pItems: [{ competency, competencyDescription, rating, evidence }]
CREATE OR REPLACE FUNCTION "HumanResources"."performanceReviewRateCompetencies"("pReview" uuid, "pRole" text, "pItems" jsonb)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
BEGIN
  IF "pItems" IS NULL OR jsonb_typeof("pItems") <> 'array' THEN
    RETURN;
  END IF;
  DELETE FROM "HumanResources"."CompetencyRatings" c
   WHERE c."tenantId" = "vTenant" AND c."performanceReviewId" = "pReview" AND c."raterRole" = "pRole"
     AND c.competency NOT IN (SELECT x ->> 'competency' FROM jsonb_array_elements("pItems") x);
  INSERT INTO "HumanResources"."CompetencyRatings" ("tenantId", "performanceReviewId", competency, "competencyDescription", "raterRole", rating, evidence)
  SELECT "vTenant", "pReview", x ->> 'competency', NULLIF(x ->> 'competencyDescription', ''), "pRole", (x ->> 'rating')::smallint, NULLIF(x ->> 'evidence', '')
    FROM jsonb_array_elements("pItems") x
  ON CONFLICT ("tenantId", "performanceReviewId", competency, "raterRole")
  DO UPDATE SET rating = EXCLUDED.rating, evidence = EXCLUDED.evidence, "competencyDescription" = COALESCE(EXCLUDED."competencyDescription", "CompetencyRatings"."competencyDescription");
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."performanceReviewLock"("pId" uuid, "pData" jsonb, "pStages" text[])
  RETURNS "HumanResources"."PerformanceReviews" LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vR" "HumanResources"."PerformanceReviews";
BEGIN
  SELECT * INTO "vR" FROM "HumanResources"."PerformanceReviews" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PerformanceReviews % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "pData" ? 'rowVersion' AND "vR"."rowVersion" <> ("pData" ->> 'rowVersion')::int THEN
    RAISE EXCEPTION 'PerformanceReviews %: record was changed by another user, reload and try again', "pId" USING ERRCODE = 'serialization_failure';
  END IF;
  IF NOT ("vR".stage = ANY ("pStages")) THEN
    RAISE EXCEPTION 'This review is at the % stage', lower(replace("vR".stage, '_', ' ')) USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TALENT_STAGE_ORDER';
  END IF;
  RETURN "vR";
END $function$;

-- pData: { selfRating, selfComment, competencies[], rowVersion }
CREATE OR REPLACE FUNCTION "HumanResources"."performanceReviewSubmitSelf"("pId" uuid, "pData" jsonb)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "HumanResources"."performanceReviewLock"("pId", "pData", ARRAY['SELF_PENDING']);
  PERFORM "HumanResources"."performanceReviewRateCompetencies"("pId", 'SELF', "pData" -> 'competencies');
  PERFORM "HumanResources"."talentTransition"(true);
  UPDATE "HumanResources"."PerformanceReviews" t
     SET stage = 'AWAITING_MANAGER', "selfRating" = ("pData" ->> 'selfRating')::numeric, "selfComment" = NULLIF("pData" ->> 'selfComment', ''), "selfSubmittedAt" = now()
   WHERE t.id = "pId";
  PERFORM "HumanResources"."talentTransition"(false);
  RETURN "pId";
END $function$;

-- pData: { managerRating, managerComment, goalAchievementPct, performanceBand, potentialBand, pipSuggested, competencies[], rowVersion }
CREATE OR REPLACE FUNCTION "HumanResources"."performanceReviewSubmitManager"("pId" uuid, "pData" jsonb)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "HumanResources"."performanceReviewLock"("pId", "pData", ARRAY['AWAITING_MANAGER']);
  PERFORM "HumanResources"."performanceReviewRateCompetencies"("pId", 'MANAGER', "pData" -> 'competencies');
  PERFORM "HumanResources"."talentTransition"(true);
  UPDATE "HumanResources"."PerformanceReviews" t
     SET stage = 'REVIEWED', "managerRating" = ("pData" ->> 'managerRating')::numeric, "managerComment" = NULLIF("pData" ->> 'managerComment', ''),
         "managerSubmittedAt" = now(),
         "goalAchievementPct" = COALESCE(NULLIF("pData" ->> 'goalAchievementPct', '')::numeric, t."goalAchievementPct"),
         "performanceBand" = COALESCE(NULLIF("pData" ->> 'performanceBand', ''), t."performanceBand"),
         "potentialBand" = COALESCE(NULLIF("pData" ->> 'potentialBand', ''), t."potentialBand"),
         "pipSuggested" = COALESCE(("pData" ->> 'pipSuggested')::boolean, t."pipSuggested")
   WHERE t.id = "pId";
  PERFORM "HumanResources"."talentTransition"(false);
  RETURN "pId";
END $function$;

-- Calibration (HR): final rating, its label and the 9-box bands; can be redone until sign-off.
-- pData: { finalRating, ratingLabel, performanceBand, potentialBand, pipSuggested, incrementPctRecommended, rowVersion }
CREATE OR REPLACE FUNCTION "HumanResources"."performanceReviewCalibrate"("pId" uuid, "pData" jsonb)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vR"     "HumanResources"."PerformanceReviews";
  "vFinal" numeric;
BEGIN
  "vR" := "HumanResources"."performanceReviewLock"("pId", "pData", ARRAY['REVIEWED', 'CALIBRATED']);
  "vFinal" := COALESCE(NULLIF("pData" ->> 'finalRating', '')::numeric, "vR"."managerRating");
  PERFORM "HumanResources"."talentTransition"(true);
  UPDATE "HumanResources"."PerformanceReviews" t
     SET stage = 'CALIBRATED', "finalRating" = "vFinal", "calibratedAt" = now(),
         "ratingLabel" = COALESCE(NULLIF("pData" ->> 'ratingLabel', ''),
                                  CASE WHEN "vFinal" >= 4.5 THEN 'OUTSTANDING' WHEN "vFinal" >= 3.75 THEN 'EXCEEDS' WHEN "vFinal" >= 3 THEN 'MEETS'
                                       WHEN "vFinal" >= 2 THEN 'PARTIALLY_MEETS' ELSE 'BELOW' END),
         "performanceBand" = COALESCE(NULLIF("pData" ->> 'performanceBand', ''), t."performanceBand",
                                      CASE WHEN "vFinal" >= 4 THEN 'HIGH' WHEN "vFinal" >= 3 THEN 'MODERATE' ELSE 'LOW' END),
         "potentialBand" = COALESCE(NULLIF("pData" ->> 'potentialBand', ''), t."potentialBand"),
         "pipSuggested" = COALESCE(("pData" ->> 'pipSuggested')::boolean, t."pipSuggested"),
         "incrementPctRecommended" = COALESCE(NULLIF("pData" ->> 'incrementPctRecommended', '')::numeric, t."incrementPctRecommended")
   WHERE t.id = "pId";
  PERFORM "HumanResources"."talentTransition"(false);
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."performanceReviewSignOff"("pId" uuid, "pData" jsonb DEFAULT '{}'::jsonb)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vR" "HumanResources"."PerformanceReviews";
BEGIN
  "vR" := "HumanResources"."performanceReviewLock"("pId", "pData", ARRAY['CALIBRATED']);
  IF "vR"."finalRating" IS NULL THEN
    RAISE EXCEPTION 'Calibrate the final rating before sign-off' USING ERRCODE = 'check_violation', HINT = 'TALENT_STAGE_ORDER';
  END IF;
  PERFORM "HumanResources"."talentTransition"(true);
  UPDATE "HumanResources"."PerformanceReviews" t SET stage = 'SIGNED_OFF', "signedOffAt" = now() WHERE t.id = "pId";
  PERFORM "HumanResources"."talentTransition"(false);
  RETURN "pId";
END $function$;

-- Defect: insert never set status, so the default GIVEN refused every request (feedbackGivenChk). Status now follows the
-- body: with a body it is GIVEN (givenAt now), without one a REQUESTED ask (requestedAt now). Edits never change status.
CREATE OR REPLACE FUNCTION "HumanResources"."performanceFeedbackAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec"    "HumanResources"."PerformanceFeedback";
  "vId"     uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet"    uuid;
  "vGiven"  boolean;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."PerformanceFeedback", "pData");
  IF "vId" IS NULL THEN
    "vGiven" := NULLIF(btrim("vRec".body), '') IS NOT NULL;
    INSERT INTO "HumanResources"."PerformanceFeedback" ("tenantId", "toEmployeeId", "fromEmployeeId", "requestedByEmployeeId", relationship, tag, body,
           "cycleId", status, "requestedAt", "givenAt")
    VALUES ("vTenant", "vRec"."toEmployeeId", "vRec"."fromEmployeeId", "vRec"."requestedByEmployeeId", "vRec".relationship, "vRec".tag,
            NULLIF(btrim("vRec".body), ''), "vRec"."cycleId", CASE WHEN "vGiven" THEN 'GIVEN' ELSE 'REQUESTED' END,
            CASE WHEN "vGiven" THEN "vRec"."requestedAt" ELSE now() END, CASE WHEN "vGiven" THEN now() END)
    RETURNING id INTO "vRet";
    RETURN "vRet";
  END IF;
  UPDATE "HumanResources"."PerformanceFeedback" t
     SET relationship = CASE WHEN "pData" ? 'relationship' THEN "vRec".relationship ELSE t.relationship END,
         tag = CASE WHEN "pData" ? 'tag' THEN "vRec".tag ELSE t.tag END,
         body = CASE WHEN "pData" ? 'body' AND t.status = 'GIVEN' THEN NULLIF(btrim("vRec".body), '') ELSE t.body END,
         "cycleId" = CASE WHEN "pData" ? 'cycleId' THEN "vRec"."cycleId" ELSE t."cycleId" END
   WHERE t.id = "vId" AND t."tenantId" = "vTenant"
     AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
  RETURNING t.id INTO "vRet";
  IF "vRet" IS NULL THEN
    IF EXISTS (SELECT 1 FROM "HumanResources"."PerformanceFeedback" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
      RAISE EXCEPTION 'PerformanceFeedback %: record was changed by another user, reload and try again', "vId" USING ERRCODE = 'serialization_failure';
    END IF;
    RAISE EXCEPTION 'PerformanceFeedback % not found', "vId" USING ERRCODE = 'no_data_found';
  END IF;
  RETURN "vRet";
END $function$;

-- Answer a request: REQUESTED → GIVEN (body required) or DECLINED. pData: { body, tag, decline, rowVersion }
CREATE OR REPLACE FUNCTION "HumanResources"."performanceFeedbackGive"("pId" uuid, "pData" jsonb)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vF"       "HumanResources"."PerformanceFeedback";
  "vDecline" boolean := COALESCE(("pData" ->> 'decline')::boolean, false);
BEGIN
  SELECT * INTO "vF" FROM "HumanResources"."PerformanceFeedback" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PerformanceFeedback % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vF".status <> 'REQUESTED' THEN
    RAISE EXCEPTION 'This feedback request was already answered' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REQUEST_NOT_PENDING';
  END IF;
  IF NOT "vDecline" AND NULLIF(btrim("pData" ->> 'body'), '') IS NULL THEN
    RAISE EXCEPTION 'Write the feedback' USING ERRCODE = 'check_violation', HINT = 'FEEDBACK_BODY_REQUIRED';
  END IF;
  UPDATE "HumanResources"."PerformanceFeedback" t
     SET status = CASE WHEN "vDecline" THEN 'DECLINED' ELSE 'GIVEN' END,
         body = CASE WHEN "vDecline" THEN t.body ELSE btrim("pData" ->> 'body') END,
         tag = COALESCE(NULLIF("pData" ->> 'tag', ''), t.tag),
         "givenAt" = CASE WHEN "vDecline" THEN NULL ELSE now() END
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Training
-- ---------------------------------------------------------------------------
-- Sessions are a schedule under a programme (enrolments stay at programme level).
CREATE OR REPLACE FUNCTION "HumanResources"."trainingSessionAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec"    "HumanResources"."TrainingSessions";
  "vId"     uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet"    uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."TrainingSessions", "pData");
  IF "vId" IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM "HumanResources"."TrainingPrograms" p WHERE p."tenantId" = "vTenant" AND p.id = "vRec"."programId"
                    AND p."deletedAt" IS NULL AND p.status IN ('PLANNED', 'IN_PROGRESS')) THEN
      RAISE EXCEPTION 'Sessions can be scheduled only for a planned or running programme' USING ERRCODE = 'check_violation', HINT = 'TRAINING_PROGRAM_CLOSED';
    END IF;
    INSERT INTO "HumanResources"."TrainingSessions" ("tenantId", "programId", title, "startsAt", "endsAt", "deliveryMode", venue, "branchId", trainer, seats, "isMandatory", status)
    VALUES ("vTenant", "vRec"."programId", "vRec".title, "vRec"."startsAt", "vRec"."endsAt", COALESCE("vRec"."deliveryMode", 'IN_PERSON'), "vRec".venue,
            "vRec"."branchId", "vRec".trainer, "vRec".seats, COALESCE("vRec"."isMandatory", false), 'SCHEDULED')
    RETURNING id INTO "vRet";
    RETURN "vRet";
  END IF;
  UPDATE "HumanResources"."TrainingSessions" t
     SET title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
         "startsAt" = CASE WHEN "pData" ? 'startsAt' THEN "vRec"."startsAt" ELSE t."startsAt" END,
         "endsAt" = CASE WHEN "pData" ? 'endsAt' THEN "vRec"."endsAt" ELSE t."endsAt" END,
         "deliveryMode" = CASE WHEN "pData" ? 'deliveryMode' THEN "vRec"."deliveryMode" ELSE t."deliveryMode" END,
         venue = CASE WHEN "pData" ? 'venue' THEN "vRec".venue ELSE t.venue END,
         "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
         trainer = CASE WHEN "pData" ? 'trainer' THEN "vRec".trainer ELSE t.trainer END,
         seats = CASE WHEN "pData" ? 'seats' THEN "vRec".seats ELSE t.seats END,
         "isMandatory" = CASE WHEN "pData" ? 'isMandatory' THEN "vRec"."isMandatory" ELSE t."isMandatory" END,
         status = CASE WHEN "pData" ? 'status' AND t.status = 'SCHEDULED' THEN "vRec".status ELSE t.status END
   WHERE t.id = "vId" AND t."tenantId" = "vTenant"
     AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
  RETURNING t.id INTO "vRet";
  IF "vRet" IS NULL THEN
    IF EXISTS (SELECT 1 FROM "HumanResources"."TrainingSessions" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
      RAISE EXCEPTION 'TrainingSessions %: record was changed by another user, reload and try again', "vId" USING ERRCODE = 'serialization_failure';
    END IF;
    RAISE EXCEPTION 'TrainingSessions % not found', "vId" USING ERRCODE = 'no_data_found';
  END IF;
  RETURN "vRet";
END $function$;

-- Enrolment rules: the programme is planned / running and has a free seat; progress > 0 starts it.
CREATE OR REPLACE FUNCTION "HumanResources"."triggerTrainingEnrolmentRules"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vP" "HumanResources"."TrainingPrograms";
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO "vP" FROM "HumanResources"."TrainingPrograms" p WHERE p."tenantId" = NEW."tenantId" AND p.id = NEW."programId" FOR UPDATE;
    IF "vP".id IS NULL OR "vP"."deletedAt" IS NOT NULL OR "vP".status NOT IN ('PLANNED', 'IN_PROGRESS') THEN
      RAISE EXCEPTION 'Enrol only in a planned or running programme' USING ERRCODE = 'check_violation', HINT = 'TRAINING_PROGRAM_CLOSED';
    END IF;
    IF "vP".seats IS NOT NULL AND (SELECT count(*) FROM "HumanResources"."TrainingEnrolments" x
                                    WHERE x."tenantId" = NEW."tenantId" AND x."programId" = NEW."programId" AND x.status <> 'WITHDRAWN') >= "vP".seats THEN
      RAISE EXCEPTION 'All % seats of % are taken', "vP".seats, "vP".name USING ERRCODE = 'check_violation', HINT = 'TRAINING_SEATS_FULL';
    END IF;
    IF NEW.cost = 0 AND "vP"."costPerHead" IS NOT NULL THEN
      NEW.cost := "vP"."costPerHead";
    END IF;
  END IF;
  IF NEW.status = 'ENROLLED' AND NEW."progressPct" > 0 THEN
    NEW.status := 'IN_PROGRESS';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS "trainingEnrolmentRules" ON "HumanResources"."TrainingEnrolments";
-- named to fire after "talentStageGuard" (alphabetical order): the guard sees the caller's status, then progress starts it
CREATE TRIGGER "trainingEnrolmentRules" BEFORE INSERT OR UPDATE ON "HumanResources"."TrainingEnrolments"
  FOR EACH ROW EXECUTE FUNCTION "HumanResources"."triggerTrainingEnrolmentRules"();

-- Complete: progress 100, completed on the date; when the programme grants a certification it is issued (expiry from the
-- programme's validity). Returns the certification id, or NULL when none is granted. pData: { scorePct, completedOn, hoursCompleted, rowVersion }
CREATE OR REPLACE FUNCTION "HumanResources"."trainingEnrolmentComplete"("pId" uuid, "pData" jsonb)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vE"    "HumanResources"."TrainingEnrolments";
  "vP"    "HumanResources"."TrainingPrograms";
  "vOn"   date := COALESCE(NULLIF("pData" ->> 'completedOn', '')::date, current_date);
  "vCert" uuid;
BEGIN
  SELECT * INTO "vE" FROM "HumanResources"."TrainingEnrolments" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TrainingEnrolments % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "pData" ? 'rowVersion' AND "vE"."rowVersion" <> ("pData" ->> 'rowVersion')::int THEN
    RAISE EXCEPTION 'TrainingEnrolments %: record was changed by another user, reload and try again', "pId" USING ERRCODE = 'serialization_failure';
  END IF;
  IF "vE".status IN ('COMPLETED', 'WITHDRAWN') THEN
    RAISE EXCEPTION 'This enrolment is already %', lower("vE".status) USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TALENT_STAGE_ORDER';
  END IF;
  SELECT * INTO "vP" FROM "HumanResources"."TrainingPrograms" p WHERE p."tenantId" = "vE"."tenantId" AND p.id = "vE"."programId";
  PERFORM "HumanResources"."talentTransition"(true);
  UPDATE "HumanResources"."TrainingEnrolments" t
     SET status = 'COMPLETED', "progressPct" = 100, "completedOn" = "vOn",
         "scorePct" = COALESCE(NULLIF("pData" ->> 'scorePct', '')::numeric, t."scorePct"),
         "hoursCompleted" = COALESCE(NULLIF("pData" ->> 'hoursCompleted', '')::numeric, NULLIF(t."hoursCompleted", 0), "vP"."durationHours", 0)
   WHERE t.id = "pId";
  IF "vP"."grantsCertification" IS NOT NULL THEN
    SELECT c.id INTO "vCert" FROM "HumanResources"."Certifications" c WHERE c."tenantId" = "vE"."tenantId" AND c."trainingEnrolmentId" = "pId";
    IF "vCert" IS NULL THEN
      INSERT INTO "HumanResources"."Certifications" ("tenantId", "employeeId", name, issuer, "issuedOn", "expiresOn", "trainingEnrolmentId", status)
      VALUES ("vE"."tenantId", "vE"."employeeId", "vP"."grantsCertification", "vP".provider, "vOn",
              CASE WHEN "vP"."certificationValidityMonths" IS NOT NULL THEN ("vOn" + make_interval(months => "vP"."certificationValidityMonths"))::date END,
              "pId", 'ACTIVE')
      RETURNING id INTO "vCert";
    END IF;
  END IF;
  PERFORM "HumanResources"."talentTransition"(false);
  RETURN "vCert";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."trainingEnrolmentWithdraw"("pId" uuid, "pRowVersion" integer DEFAULT NULL)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vE" "HumanResources"."TrainingEnrolments";
BEGIN
  SELECT * INTO "vE" FROM "HumanResources"."TrainingEnrolments" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TrainingEnrolments % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "pRowVersion" IS NOT NULL AND "vE"."rowVersion" <> "pRowVersion" THEN
    RAISE EXCEPTION 'TrainingEnrolments %: record was changed by another user, reload and try again', "pId" USING ERRCODE = 'serialization_failure';
  END IF;
  IF "vE".status IN ('COMPLETED', 'WITHDRAWN') THEN
    RAISE EXCEPTION 'This enrolment is already %', lower("vE".status) USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TALENT_STAGE_ORDER';
  END IF;
  PERFORM "HumanResources"."talentTransition"(true);
  UPDATE "HumanResources"."TrainingEnrolments" t SET status = 'WITHDRAWN' WHERE t.id = "pId";
  PERFORM "HumanResources"."talentTransition"(false);
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 7. Every company: REQ numbering and the JOB_REQUISITION default workflow (HR Manager). Editable afterwards.
-- ---------------------------------------------------------------------------
INSERT INTO "Lookups"."Lookups" ("lookupType", code, label, tone, "sortOrder", "isActive", "isSystem")
VALUES ('Subject', 'JOB_REQUISITION', 'Job requisition', 'neutral', 21, true, true)
ON CONFLICT ("lookupType", code, "tenantId") DO NOTHING;

CREATE OR REPLACE FUNCTION "HumanResources"."seedTalentDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vN"    integer;
  "vWf"   uuid;
  "vRole" uuid;
BEGIN
  INSERT INTO "Company"."NumberingSeries" ("tenantId", "docType", "branchId", prefix, pattern, padding, "startValue", "resetPolicy", "isActive")
  SELECT "pTenant", d.code, NULL, d."defaultPrefix", d."defaultPattern", d."defaultPadding", 1, d."defaultResetPolicy", true
    FROM "Company"."DocumentTypes" d
   WHERE d.code = 'REQ'
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;

  SELECT r.id INTO "vRole" FROM "Company"."Roles" r WHERE r."tenantId" = "pTenant" AND r."systemKey" = 'HR_MANAGER' LIMIT 1;
  IF "vRole" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM "Company"."ApprovalWorkflows" x WHERE x."tenantId" = "pTenant" AND x.subject = 'JOB_REQUISITION' AND x."deletedAt" IS NULL) THEN
    INSERT INTO "Company"."ApprovalWorkflows" ("tenantId", name, subject, description, status, version, priority, "onComplete", "onReject",
                                              "notifyPreparer", "notifyInApp", "notifyEmail", "notifyWhatsapp", "publishedAt")
    VALUES ("pTenant", 'Job requisitions', 'JOB_REQUISITION', 'Default: the HR Manager approves new and replacement positions. Edit as needed.',
            'ACTIVE', 1, 100, 'MARK_APPROVED', 'RETURN_TO_PREPARER', true, true, false, false, now())
    RETURNING id INTO "vWf";
    INSERT INTO "Company"."ApprovalWorkflowSteps" ("tenantId", "workflowId", "stepNo", name, "approverType", "approverRoleId", "slaHours", "onSlaBreach",
                                                  "approvalMode", "blockSelfApproval", "allowDelegation", "requireComment")
    VALUES ("pTenant", "vWf", 1, 'HR Manager', 'ROLE', "vRole", 48, 'REMIND', 'ANY', true, true, false);
    "vN" := "vN" + 1;
  END IF;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."triggerTenantTalentDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "HumanResources"."seedTalentDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsTalentDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsTalentDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "HumanResources"."triggerTenantTalentDefaults"();

SELECT set_config('app.actorLabel', 'seedTalentDefaultsFor', false);
SELECT "HumanResources"."seedTalentDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '205-talent.sql', false);

-- ---------------------------------------------------------------------------
-- 8. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('TALENT_STAGE_ORDER',        409, 'BUSINESS_RULE', 'HR', 'That step isn''t possible at the current stage.', 'Candidate, review, enrolment or certification stage changed out of order or outside its action', true, NULL),
  ('JOB_OPENING_NOT_EDITABLE',  409, 'BUSINESS_RULE', 'HR', 'Only a draft requisition can be edited.', 'Edit of a submitted, open, closed or cancelled job requisition', true, NULL),
  ('JOB_OPENING_STATUS',        409, 'BUSINESS_RULE', 'HR', 'The requisition can''t move to that status from its current one.', 'Job requisition submit / approve / open / hold / close / cancel out of order', true, NULL),
  ('JOB_OPENING_NOT_OPEN',      409, 'BUSINESS_RULE', 'HR', 'Candidates can be added only to an open requisition.', 'Candidate added to a draft, pending, on-hold, closed or cancelled requisition', true, NULL),
  ('CANDIDATE_DUPLICATE',       409, 'BUSINESS_RULE', 'HR', 'This candidate has already applied for this opening.', 'Second candidate with the same email on one requisition', true, NULL),
  ('CANDIDATE_OFFER_SALARY',    400, 'VALIDATION',    'HR', 'An offer needs the offered salary.', 'Candidate moved to the offer stage without an offered salary', true, NULL),
  ('FEEDBACK_BODY_REQUIRED',    400, 'VALIDATION',    'HR', 'Write the feedback before sending it.', 'Feedback given without a body', true, NULL),
  ('TRAINING_SEATS_FULL',       400, 'VALIDATION',    'HR', 'All seats of this programme are taken.', 'Enrolment beyond the programme''s seats', true, NULL),
  ('TRAINING_ENROLMENT_EXISTS', 409, 'BUSINESS_RULE', 'HR', 'This employee is already enrolled in the programme.', 'Second enrolment of an employee in one programme', true, NULL),
  ('TRAINING_PROGRAM_CLOSED',   409, 'BUSINESS_RULE', 'HR', 'This programme is completed or cancelled.', 'Session or enrolment on a completed, cancelled or deleted programme', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);

-- ---------------------------------------------------------------------------------------------------------------------
-- Badge tones follow the template's recruitment board (Applied grey, Screening/Interview blue, Offer violet, Hired green;
-- an opening at offer stage is blue, a closed one grey). Idempotent.
DO $$
BEGIN
  PERFORM set_config('app.actorLabel', '205-talent.sql: recruitment badge tones', true);
  UPDATE "Lookups"."Lookups" l SET tone = v.tone
    FROM (VALUES ('CandidateStage', 'APPLIED', 'neutral'), ('CandidateStage', 'SCREENING', 'info'), ('CandidateStage', 'INTERVIEW', 'info'),
                 ('CandidateStage', 'OFFER', 'violet'), ('CandidateStage', 'HIRED', 'good'),
                 ('JobOpeningStatus', 'OFFER_STAGE', 'info'), ('JobOpeningStatus', 'CLOSED', 'neutral')) AS v("lookupType", code, tone)
   WHERE l."lookupType" = v."lookupType" AND l.code = v.code AND l."tenantId" IS NULL AND l.tone IS DISTINCT FROM v.tone;
END $$;
