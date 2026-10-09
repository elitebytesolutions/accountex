-- Phase 29 — Period close: period reopen requests (approve fixed: decided / approver / SoD against the requester,
-- reopens the period or one module; reject; auto-reclose after the window; locked periods need MFA, a later phase),
-- year-end close (final close posts the closing JE — income and expenses to retained earnings — and locks every
-- period; cancel reverses and unlocks), document type YE, audit on PaymentReminderLogs, error codes. Idempotent.
SELECT set_config('app.actorLabel', '031-period-close.sql', false);

INSERT INTO "Company"."DocumentTypes" (code, name, module, "tableName", "defaultPrefix", "defaultPattern", "defaultPadding", "defaultResetPolicy", "isPostingDoc", "sortOrder")
VALUES ('YE', 'Year-end close', 'acc', '"Accounting"."YearEndCloses"', 'YE', '{PREFIX}-{YYYY}-{SEQ4}', 4, 'YEARLY', true, 120)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. Period reopen requests
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Accounting"."periodReopenRequestApproveEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "r"       "Accounting"."PeriodReopenRequests";
  "vStatus" text;
BEGIN
  SELECT * INTO "r" FROM "Accounting"."PeriodReopenRequests" t WHERE t."tenantId" = "vTenant" AND t.id = "pId";
  SELECT p.status INTO "vStatus" FROM "Accounting"."FiscalPeriods" p WHERE p."tenantId" = "vTenant" AND p.id = "r"."fiscalPeriodId" FOR UPDATE;
  IF "vStatus" = 'LOCKED' OR EXISTS (SELECT 1 FROM "Accounting"."PeriodModuleLocks" m WHERE m."tenantId" = "vTenant" AND m."fiscalPeriodId" = "r"."fiscalPeriodId"
                AND ("r"."moduleCode" IS NULL OR m."moduleCode" = "r"."moduleCode") AND m.status = 'LOCKED') THEN
    RAISE EXCEPTION 'A locked period can only be reopened with multi-factor verification (not available yet)'
      USING ERRCODE = 'check_violation', HINT = 'PERIOD_LOCKED_NEEDS_MFA';
  END IF;
  -- the requested module (or every module) opens; the period opens so postings reach the module check
  UPDATE "Accounting"."PeriodModuleLocks" SET status = 'OPEN', "closedAt" = NULL, "closedByUserId" = NULL
   WHERE "tenantId" = "vTenant" AND "fiscalPeriodId" = "r"."fiscalPeriodId" AND ("r"."moduleCode" IS NULL OR "moduleCode" = "r"."moduleCode");
  IF "vStatus" <> 'OPEN' THEN
    UPDATE "Accounting"."FiscalPeriods" SET status = 'OPEN' WHERE "tenantId" = "vTenant" AND id = "r"."fiscalPeriodId";
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION "Accounting"."periodReopenRequestApprove"("pId" uuid, "pComment" text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Accounting"."PeriodReopenRequests";
  "vMe"  uuid := "Company"."getCurrentUserId"();
BEGIN
  SELECT * INTO "vRow" FROM "Accounting"."PeriodReopenRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PeriodReopenRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'PENDING' THEN
    RAISE EXCEPTION 'This reopen request is % already', lower("vRow".status) USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REOPEN_NOT_PENDING';
  END IF;
  IF "vRow"."requestedByUserId" = "vMe" THEN
    RAISE EXCEPTION 'You can''t approve your own reopen request' USING ERRCODE = 'insufficient_privilege', HINT = 'REOPEN_SELF_APPROVAL';
  END IF;
  IF "vRow"."previousStatus" = 'LOCKED' THEN
    RAISE EXCEPTION 'A locked period can only be reopened with multi-factor verification (not available yet)'
      USING ERRCODE = 'check_violation', HINT = 'PERIOD_LOCKED_NEEDS_MFA';
  END IF;
  PERFORM "Accounting"."periodReopenRequestApproveEntries"("pId");
  UPDATE "Accounting"."PeriodReopenRequests" t
     SET status = 'APPROVED', "approverUserId" = "vMe", "decidedAt" = now()
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Accounting"."periodReopenRequestReject"("pId" uuid, "pComment" text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Accounting"."PeriodReopenRequests";
  "vMe"  uuid := "Company"."getCurrentUserId"();
BEGIN
  SELECT * INTO "vRow" FROM "Accounting"."PeriodReopenRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PeriodReopenRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status <> 'PENDING' THEN
    RAISE EXCEPTION 'This reopen request is % already', lower("vRow".status) USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REOPEN_NOT_PENDING';
  END IF;
  IF "vRow"."requestedByUserId" = "vMe" THEN
    RAISE EXCEPTION 'Cancel your own request instead of rejecting it' USING ERRCODE = 'insufficient_privilege', HINT = 'REOPEN_SELF_APPROVAL';
  END IF;
  UPDATE "Accounting"."PeriodReopenRequests" t
     SET status = 'REJECTED', "approverUserId" = "vMe", "decidedAt" = now(), reason = t.reason || COALESCE(' · Rejected: ' || "pComment", '')
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- Re-closes an approved request: the period (or module) goes back to CLOSED. Draft vouchers left in the period block it
-- (the period guard raises PERIOD_HAS_OPEN_VOUCHERS).
CREATE OR REPLACE FUNCTION "Accounting"."periodReopenReclose"("pId" uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "r"       "Accounting"."PeriodReopenRequests";
BEGIN
  SELECT * INTO "r" FROM "Accounting"."PeriodReopenRequests" t WHERE t."tenantId" = "vTenant" AND t.id = "pId" FOR UPDATE;
  IF "r".status = 'RECLOSED' THEN
    RETURN "pId";
  END IF;
  IF "r".status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Only an approved reopen can be closed again' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REOPEN_NOT_PENDING';
  END IF;
  UPDATE "Accounting"."PeriodModuleLocks" SET status = 'CLOSED', "closedAt" = now(), "closedByUserId" = "Company"."getCurrentUserId"()
   WHERE "tenantId" = "vTenant" AND "fiscalPeriodId" = "r"."fiscalPeriodId" AND status = 'OPEN'
     AND ("r"."moduleCode" IS NULL OR "moduleCode" = "r"."moduleCode");
  -- the period closes again once none of its modules is open (a module without a lock row counts as open)
  IF NOT EXISTS (SELECT 1 FROM "Accounting"."PeriodModuleLocks" m WHERE m."tenantId" = "vTenant" AND m."fiscalPeriodId" = "r"."fiscalPeriodId" AND m.status = 'OPEN')
     AND (SELECT count(*) FROM "Accounting"."PeriodModuleLocks" m WHERE m."tenantId" = "vTenant" AND m."fiscalPeriodId" = "r"."fiscalPeriodId") >= 5 THEN
    UPDATE "Accounting"."FiscalPeriods" SET status = 'CLOSED' WHERE "tenantId" = "vTenant" AND id = "r"."fiscalPeriodId" AND status = 'OPEN';
  END IF;
  UPDATE "Accounting"."PeriodReopenRequests" t SET status = 'RECLOSED', "reclosedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 2. Year-end close. Final close: every period closed / locked; the last period opens for the closing JE (each
--    income and expense account's year balance reversed into retained earnings), then every period locks and the
--    fiscal year is CLOSED with its closing JE (the P&L excludes it). Cancel reverses the JE and reopens the periods
--    as CLOSED.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Accounting"."yearEndClosePost"("pId" uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "c"       "Accounting"."YearEndCloses";
  "y"       "Accounting"."FiscalYears";
  "vLast"   uuid;
  "vRe"     uuid;
  "vLines"  jsonb := '[]'::jsonb;
  "vNet"    numeric(18,2) := 0;
  "vOpening" numeric(18,2);
  "vJe"     uuid;
  "a"       record;
  "vOpen"   text;
BEGIN
  SELECT * INTO "c" FROM "Accounting"."YearEndCloses" t WHERE t."tenantId" = "vTenant" AND t.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Year-end close % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "c".status <> 'DRAFT' OR "c"."runMode" <> 'FINAL' THEN
    RAISE EXCEPTION 'Only a draft final close can be run' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'YEAR_END_NOT_DRAFT';
  END IF;
  SELECT * INTO "y" FROM "Accounting"."FiscalYears" f WHERE f."tenantId" = "vTenant" AND f.id = "c"."fiscalYearId" FOR UPDATE;
  IF "y".status = 'CLOSED' THEN
    RAISE EXCEPTION 'Fiscal year % is already closed', "y".code USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'YEAR_END_ALREADY_CLOSED';
  END IF;
  SELECT string_agg(p.code, ', ' ORDER BY p."periodNo") INTO "vOpen"
    FROM "Accounting"."FiscalPeriods" p WHERE p."tenantId" = "vTenant" AND p."fiscalYearId" = "y".id AND p.status = 'OPEN';
  IF "vOpen" IS NOT NULL THEN
    RAISE EXCEPTION 'Close every period first (still open: %)', "vOpen" USING ERRCODE = 'check_violation', HINT = 'YEAR_END_PERIODS_OPEN';
  END IF;
  "vRe" := COALESCE("c"."retainedEarningsAccountId", "Company"."getAccountForRole"('RETAINED_EARNINGS'));

  FOR "a" IN
    SELECT ll."accountId", round(sum(ll.credit - ll.debit), 2) AS net
      FROM "Accounting"."getLedgerLines" ll
     WHERE ll."tenantId" = "vTenant" AND ll."accountClass" IN (4, 5) AND NOT ll."isClosingEntry"
       AND ll."postingDate" BETWEEN "y"."startDate" AND "y"."endDate"
     GROUP BY ll."accountId"
    HAVING round(sum(ll.credit - ll.debit), 2) <> 0
  LOOP
    "vNet" := "vNet" + "a".net;
    "vLines" := "vLines" || jsonb_build_array(jsonb_build_object('accountId', "a"."accountId",
                 'debit', GREATEST("a".net, 0), 'credit', GREATEST(-"a".net, 0), 'particulars', 'Year-end close ' || "y".code));
  END LOOP;
  SELECT COALESCE(round(sum(ll.credit - ll.debit), 2), 0) INTO "vOpening"
    FROM "Accounting"."getLedgerLines" ll
   WHERE ll."tenantId" = "vTenant" AND ll."accountId" = "vRe" AND ll."postingDate" < "y"."startDate";

  IF jsonb_array_length("vLines") > 0 THEN
    "vLines" := "vLines" || jsonb_build_array(jsonb_build_object('accountId', "vRe",
                 'debit', GREATEST(-"vNet", 0), 'credit', GREATEST("vNet", 0), 'particulars', 'Profit for ' || "y".code || ' to retained earnings'));
    -- the closing entry is dated the year's last day: that period opens for it, then everything locks
    SELECT p.id INTO "vLast" FROM "Accounting"."FiscalPeriods" p
     WHERE p."tenantId" = "vTenant" AND p."fiscalYearId" = "y".id AND NOT p."isAdjustment" ORDER BY p."endDate" DESC LIMIT 1;
    UPDATE "Accounting"."FiscalPeriods" SET status = 'OPEN' WHERE "tenantId" = "vTenant" AND id = "vLast";
    UPDATE "Accounting"."PeriodModuleLocks" SET status = 'OPEN', "closedAt" = NULL, "closedByUserId" = NULL WHERE "tenantId" = "vTenant" AND "fiscalPeriodId" = "vLast";
    "vJe" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', 'SYSTEM', 'docDate', "y"."endDate", 'postingDate', "y"."endDate",
                         'narration', 'Year-end close ' || "y".code || ': income and expenses to retained earnings',
                         'sourceDocType', 'YE', 'sourceDocId', "pId", 'sourceDocNo', 'YE ' || "y".code),
      "vLines");
  END IF;

  UPDATE "Accounting"."FiscalPeriods" SET status = 'LOCKED' WHERE "tenantId" = "vTenant" AND "fiscalYearId" = "y".id AND status <> 'LOCKED';
  INSERT INTO "Accounting"."PeriodModuleLocks" ("tenantId", "fiscalPeriodId", "moduleCode", status, "closedAt", "closedByUserId")
  SELECT "vTenant", p.id, m.code, 'LOCKED', now(), "Company"."getCurrentUserId"()
    FROM "Accounting"."FiscalPeriods" p CROSS JOIN (VALUES ('GL'), ('AR'), ('AP'), ('INV'), ('PAY')) m(code)
   WHERE p."tenantId" = "vTenant" AND p."fiscalYearId" = "y".id
  ON CONFLICT ("tenantId", "fiscalPeriodId", "moduleCode") DO UPDATE SET status = 'LOCKED', "closedAt" = now(), "closedByUserId" = "Company"."getCurrentUserId"();
  UPDATE "Accounting"."FiscalYears"
     SET status = 'CLOSED', "isLocked" = true, "closedAt" = now(), "closedByUserId" = "Company"."getCurrentUserId"(),
         "closingJournalEntryId" = "vJe", "netProfitTransferred" = "vNet"
   WHERE "tenantId" = "vTenant" AND id = "y".id;
  UPDATE "Accounting"."YearEndCloses" t
     SET status = 'COMPLETED', "runAt" = now(), "runByUserId" = "Company"."getCurrentUserId"(), "ceoApprovedByUserId" = "Company"."getCurrentUserId"(),
         "closingJournalEntryId" = "vJe", "retainedEarningsAccountId" = "vRe", "retainedOpening" = "vOpening", "netProfit" = "vNet",
         "retainedClosing" = "vOpening" + "vNet", "lockPeriods" = true
   WHERE t.id = "pId";
  RETURN "vJe";
END $function$;

CREATE OR REPLACE FUNCTION "Accounting"."yearEndCloseCancelEntries"("pId" uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "c"       "Accounting"."YearEndCloses";
  "vLast"   uuid;
BEGIN
  SELECT * INTO "c" FROM "Accounting"."YearEndCloses" t WHERE t."tenantId" = "vTenant" AND t.id = "pId";
  IF "c"."runMode" <> 'FINAL' OR "c".status <> 'COMPLETED' THEN
    RETURN;
  END IF;
  -- the locked periods go back to CLOSED; the last one opens briefly for the reversal
  UPDATE "Accounting"."FiscalPeriods" SET status = 'CLOSED' WHERE "tenantId" = "vTenant" AND "fiscalYearId" = "c"."fiscalYearId" AND status = 'LOCKED';
  UPDATE "Accounting"."PeriodModuleLocks" m SET status = 'CLOSED'
    FROM "Accounting"."FiscalPeriods" p
   WHERE m."tenantId" = "vTenant" AND p."tenantId" = m."tenantId" AND p.id = m."fiscalPeriodId" AND p."fiscalYearId" = "c"."fiscalYearId" AND m.status = 'LOCKED';
  UPDATE "Accounting"."FiscalYears"
     SET status = 'OPEN', "isLocked" = false, "closedAt" = NULL, "closedByUserId" = NULL, "closingJournalEntryId" = NULL, "netProfitTransferred" = NULL
   WHERE "tenantId" = "vTenant" AND id = "c"."fiscalYearId";
  IF "c"."closingJournalEntryId" IS NOT NULL THEN
    SELECT p.id INTO "vLast" FROM "Accounting"."FiscalPeriods" p
     WHERE p."tenantId" = "vTenant" AND p."fiscalYearId" = "c"."fiscalYearId" AND NOT p."isAdjustment" ORDER BY p."endDate" DESC LIMIT 1;
    UPDATE "Accounting"."FiscalPeriods" SET status = 'OPEN' WHERE "tenantId" = "vTenant" AND id = "vLast";
    UPDATE "Accounting"."PeriodModuleLocks" SET status = 'OPEN', "closedAt" = NULL, "closedByUserId" = NULL WHERE "tenantId" = "vTenant" AND "fiscalPeriodId" = "vLast";
    PERFORM "Accounting"."voucherReverse"("c"."closingJournalEntryId",
      (SELECT f."endDate" FROM "Accounting"."FiscalYears" f WHERE f."tenantId" = "vTenant" AND f.id = "c"."fiscalYearId"), 'OTHER', 'Year-end close cancelled');
    UPDATE "Accounting"."PeriodModuleLocks" SET status = 'CLOSED', "closedAt" = now(), "closedByUserId" = "Company"."getCurrentUserId"() WHERE "tenantId" = "vTenant" AND "fiscalPeriodId" = "vLast";
    UPDATE "Accounting"."FiscalPeriods" SET status = 'CLOSED' WHERE "tenantId" = "vTenant" AND id = "vLast";
  END IF;
END $function$;

-- ---------------------------------------------------------------------------
-- 3. Row history on the reminder log; error codes
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "paymentReminderLogsAudit" ON "Sales"."PaymentReminderLogs";
CREATE TRIGGER "paymentReminderLogsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Sales"."PaymentReminderLogs" FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('REOPEN_NOT_PENDING', 409, 'BUSINESS_RULE', 'GL', 'This reopen request is already decided.', 'Decide / reclose in the wrong state', true, NULL),
  ('REOPEN_SELF_APPROVAL', 403, 'PERMISSION', 'GL', 'You can’t decide your own reopen request.', 'Requester approving / rejecting own request', true, NULL),
  ('PERIOD_LOCKED_NEEDS_MFA', 409, 'BUSINESS_RULE', 'GL', 'A locked period can only be reopened with multi-factor verification, which isn’t available yet.', 'Reopen of a locked period', true, NULL),
  ('REOPEN_PERIOD_NOT_CLOSED', 409, 'BUSINESS_RULE', 'GL', 'Only a closed period can be reopened.', 'Reopen request for an open period', true, NULL),
  ('YEAR_END_NOT_DRAFT', 409, 'BUSINESS_RULE', 'GL', 'This year-end close has already run.', 'Run of a completed / cancelled close', true, NULL),
  ('YEAR_END_ALREADY_CLOSED', 409, 'BUSINESS_RULE', 'GL', 'This fiscal year is already closed.', 'Second final close', true, NULL),
  ('YEAR_END_PERIODS_OPEN', 409, 'BUSINESS_RULE', 'GL', 'Close every period of the year before the final close.', 'Final close with open periods', true, NULL),
  ('REOPEN_NEEDS_REQUEST', 409, 'BUSINESS_RULE', 'GL', 'Reopening a closed period needs an approved reopen request.', 'Direct reopen of a closed period', true, NULL),
  ('REMINDER_NOTHING_DUE', 409, 'BUSINESS_RULE', 'SALES', 'No reminder is due right now.', 'Run with an empty queue', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
