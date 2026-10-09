-- Phase 34: self-service requests — letter requests, profile change requests, helpdesk tickets,
-- kudos / poll votes / pulse responses / announcement reads / presence, policy acknowledgements.
-- The tables and their save functions already exist (template build); this adds what the phase needs on top.
-- Idempotent: safe to run repeatedly via npm run db:sql.

SELECT set_config('app.actorLabel', '401-self-service-requests.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Row history on the phase's tables that had none.
-- ---------------------------------------------------------------------------
DO $$
DECLARE "t" text;
BEGIN
  FOREACH "t" IN ARRAY ARRAY['HelpdeskTicketMessages', 'Kudos', 'KudosReactions', 'PollVotes', 'PulseSurveyResponses', 'CompanyAnnouncementReads', 'PresenceStatuses'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON "EmployeeSelfService".%I', lower(left("t", 1)) || substr("t", 2) || 'Audit', "t");
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON "EmployeeSelfService".%I FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"()',
                   lower(left("t", 1)) || substr("t", 2) || 'Audit', "t");
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Numbering: letter requests (RQ-) and helpdesk tickets (HD-) for every tenant, and for new tenants.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."seedSelfServiceRequestDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE "vN" integer;
BEGIN
  INSERT INTO "Company"."NumberingSeries" ("tenantId", "docType", "branchId", prefix, pattern, padding, "startValue", "resetPolicy", "isActive")
  SELECT "pTenant", d.code, NULL, d."defaultPrefix", d."defaultPattern", d."defaultPadding", 1, d."defaultResetPolicy", true
    FROM "Company"."DocumentTypes" d
   WHERE d.code IN ('RQ', 'HD')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "EmployeeSelfService"."triggerTenantSelfServiceRequestDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "EmployeeSelfService"."seedSelfServiceRequestDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsSelfServiceRequestDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsSelfServiceRequestDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "EmployeeSelfService"."triggerTenantSelfServiceRequestDefaults"();

SELECT set_config('app.actorLabel', 'seedSelfServiceRequestDefaultsFor', false);
SELECT "EmployeeSelfService"."seedSelfServiceRequestDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '401-self-service-requests.sql', false);

-- ---------------------------------------------------------------------------
-- 3. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('ESS_NO_EMPLOYEE_RECORD',        409, 'BUSINESS_RULE', 'HR', 'Your user is not linked to an employee record. Ask HR to link it.', 'Self-service action by a user without an employee record', true, NULL),
  ('LETTER_REQUEST_NOT_OPEN',       409, 'BUSINESS_RULE', 'HR', 'This letter request is no longer open.', 'Edit, withdraw or decision on a completed, rejected or withdrawn letter request', true, NULL),
  ('PROFILE_CHANGE_PENDING',        409, 'CONFLICT',      'HR', 'You already have a pending change for this field.', 'Second pending profile change request for the same field', true, NULL),
  ('PROFILE_CHANGE_NOT_PENDING',    409, 'BUSINESS_RULE', 'HR', 'This change request is no longer pending.', 'Decision on or withdrawal of a profile change request that is not pending', true, NULL),
  ('PROFILE_CHANGE_SELF_APPROVAL',  403, 'PERMISSION',    'HR', 'You can''t approve a change to your own profile.', 'Reviewer deciding their own profile change request', true, NULL),
  ('HELPDESK_TICKET_CLOSED',        409, 'BUSINESS_RULE', 'HR', 'This ticket is closed.', 'Message or action on a closed helpdesk ticket', true, NULL),
  ('HELPDESK_TICKET_STATE',         409, 'BUSINESS_RULE', 'HR', 'This ticket can''t do that at its current status.', 'Assign / resolve / reopen / rate out of order', true, NULL),
  ('HELPDESK_NOT_AGENT',            403, 'PERMISSION',    'HR', 'Only HR or the ticket''s agent can do that.', 'Agent action by a requester', true, NULL),
  ('KUDOS_SELF',                    400, 'VALIDATION',    'HR', 'You can''t give kudos to yourself.', 'Kudos to the giver''s own employee record', true, NULL),
  ('POLL_ALREADY_VOTED',            409, 'CONFLICT',      'HR', 'You have already voted in this poll.', 'Second vote by the same employee in a poll', true, NULL),
  ('POLL_CLOSED',                   409, 'BUSINESS_RULE', 'HR', 'This poll is closed.', 'Vote on a poll that is not open', true, NULL),
  ('PULSE_ALREADY_ANSWERED',        409, 'CONFLICT',      'HR', 'You have already answered this survey.', 'Second response by the same respondent to a pulse survey', true, NULL),
  ('PULSE_CLOSED',                  409, 'BUSINESS_RULE', 'HR', 'This survey is closed.', 'Response to a pulse survey that is not open', true, NULL),
  ('POLICY_NOT_PUBLISHED',          409, 'BUSINESS_RULE', 'HR', 'Only a published policy can be acknowledged.', 'Acknowledgement of a draft or retired policy version', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
