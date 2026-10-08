-- 106-admin-billing.sql
-- Phase 41: Platform billing (platform invoices, payments, dunning cases, reseller payouts).
-- Idempotent: safe to run repeatedly via npm run db:sql (or: npx prisma db execute --file prisma/sql/106-admin-billing.sql).
-- All seven Phase 41 tables already carry triggerAudit (Platform rows log to Platform.PlatformAuditLogs).

SELECT set_config('app.actorLabel', '106-admin-billing.sql', true);

-- ---------------------------------------------------------------------------
-- 1. A draft invoice has no number yet: platformInvoiceIssue assigns FS-INV-YYYY-NNNNN when it is issued.
--    (docNo stays unique and keeps its format check; only a DRAFT may have none.)
-- ---------------------------------------------------------------------------
ALTER TABLE "Platform"."PlatformInvoices" ALTER COLUMN "docNo" DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platformInvoiceDocNoChk' AND conrelid = '"Platform"."PlatformInvoices"'::regclass) THEN
    ALTER TABLE "Platform"."PlatformInvoices" ADD CONSTRAINT "platformInvoiceDocNoChk" CHECK (status = 'DRAFT' OR "docNo" IS NOT NULL);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. platformInvoiceAddUpdate: the Super Admin has no session tenant (app.tenantId is blank, which
--    Company.getCurrentTenantId can't cast), so the company comes from the payload (or the
--    row being edited). New invoices are created DRAFT without a number; only a DRAFT can be edited.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."platformInvoiceAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vTenant" uuid := COALESCE(NULLIF(current_setting('app.tenantId', true), '')::uuid, NULLIF("pData" ->> 'tenantId', '')::uuid,
                             (SELECT t."tenantId" FROM "Platform"."PlatformInvoices" t WHERE t.id = NULLIF("pData" ->> 'id', '')::uuid));
  "vRec" "Platform"."PlatformInvoices";
  "vRet" uuid;
  "vStatus" text;
  "vC1PlatformInvoiceLines" "Platform"."PlatformInvoiceLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."PlatformInvoices", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."PlatformInvoices" ("tenantId", "docNo", status, "subscriptionId", "invoiceKind", description, "periodStart", "periodEnd", "issuedOn", "dueOn", "currencyCode", "grossAmount", "discountAmount", "netAmount", "taxAuthorityId", "taxRate", "taxAmount", "totalAmount", "couponId", "emailedAt", "lastReminderAt")
    VALUES ("vTenant", NULL, 'DRAFT', CASE WHEN "pData" ? 'subscriptionId' THEN "vRec"."subscriptionId" ELSE NULL END, CASE WHEN "pData" ? 'invoiceKind' THEN "vRec"."invoiceKind" ELSE 'SUBSCRIPTION' END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'periodStart' THEN "vRec"."periodStart" ELSE NULL END, CASE WHEN "pData" ? 'periodEnd' THEN "vRec"."periodEnd" ELSE NULL END, CASE WHEN "pData" ? 'issuedOn' THEN "vRec"."issuedOn" ELSE NULL END, CASE WHEN "pData" ? 'dueOn' THEN "vRec"."dueOn" ELSE NULL END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE NULL END, CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE 0 END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE NULL END, CASE WHEN "pData" ? 'taxAuthorityId' THEN "vRec"."taxAuthorityId" ELSE NULL END, CASE WHEN "pData" ? 'taxRate' THEN "vRec"."taxRate" ELSE 0 END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE NULL END, CASE WHEN "pData" ? 'couponId' THEN "vRec"."couponId" ELSE NULL END, CASE WHEN "pData" ? 'emailedAt' THEN "vRec"."emailedAt" ELSE NULL END, CASE WHEN "pData" ? 'lastReminderAt' THEN "vRec"."lastReminderAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Platform"."PlatformInvoices" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PlatformInvoices % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'PlatformInvoices: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'INVOICE_NOT_DRAFT';
    END IF;
    UPDATE "Platform"."PlatformInvoices" t
       SET "subscriptionId" = CASE WHEN "pData" ? 'subscriptionId' THEN "vRec"."subscriptionId" ELSE t."subscriptionId" END,
           "invoiceKind" = CASE WHEN "pData" ? 'invoiceKind' THEN "vRec"."invoiceKind" ELSE t."invoiceKind" END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "periodStart" = CASE WHEN "pData" ? 'periodStart' THEN "vRec"."periodStart" ELSE t."periodStart" END,
           "periodEnd" = CASE WHEN "pData" ? 'periodEnd' THEN "vRec"."periodEnd" ELSE t."periodEnd" END,
           "issuedOn" = CASE WHEN "pData" ? 'issuedOn' THEN "vRec"."issuedOn" ELSE t."issuedOn" END,
           "dueOn" = CASE WHEN "pData" ? 'dueOn' THEN "vRec"."dueOn" ELSE t."dueOn" END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "discountAmount" = CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE t."discountAmount" END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "taxAuthorityId" = CASE WHEN "pData" ? 'taxAuthorityId' THEN "vRec"."taxAuthorityId" ELSE t."taxAuthorityId" END,
           "taxRate" = CASE WHEN "pData" ? 'taxRate' THEN "vRec"."taxRate" ELSE t."taxRate" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "totalAmount" = CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE t."totalAmount" END,
           "couponId" = CASE WHEN "pData" ? 'couponId' THEN "vRec"."couponId" ELSE t."couponId" END,
           "emailedAt" = CASE WHEN "pData" ? 'emailedAt' THEN "vRec"."emailedAt" ELSE t."emailedAt" END,
           "lastReminderAt" = CASE WHEN "pData" ? 'lastReminderAt' THEN "vRec"."lastReminderAt" ELSE t."lastReminderAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      RAISE EXCEPTION 'PlatformInvoices %: record was changed by another user, reload and try again', "vId"
        USING ERRCODE = 'serialization_failure';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."PlatformInvoiceLines"
     WHERE "platformInvoiceId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1PlatformInvoiceLines" := jsonb_populate_record(NULL::"Platform"."PlatformInvoiceLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1PlatformInvoiceLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."PlatformInvoiceLines" t
           SET "lineKind" = CASE WHEN "vE1" ? 'lineKind' THEN "vC1PlatformInvoiceLines"."lineKind" ELSE t."lineKind" END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1PlatformInvoiceLines".description ELSE t.description END,
               "planId" = CASE WHEN "vE1" ? 'planId' THEN "vC1PlatformInvoiceLines"."planId" ELSE t."planId" END,
               "addonId" = CASE WHEN "vE1" ? 'addonId' THEN "vC1PlatformInvoiceLines"."addonId" ELSE t."addonId" END,
               "usageMeterId" = CASE WHEN "vE1" ? 'usageMeterId' THEN "vC1PlatformInvoiceLines"."usageMeterId" ELSE t."usageMeterId" END,
               quantity = CASE WHEN "vE1" ? 'quantity' THEN "vC1PlatformInvoiceLines".quantity ELSE t.quantity END,
               "unitPrice" = CASE WHEN "vE1" ? 'unitPrice' THEN "vC1PlatformInvoiceLines"."unitPrice" ELSE t."unitPrice" END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1PlatformInvoiceLines".amount ELSE t.amount END,
               "periodStart" = CASE WHEN "vE1" ? 'periodStart' THEN "vC1PlatformInvoiceLines"."periodStart" ELSE t."periodStart" END,
               "periodEnd" = CASE WHEN "vE1" ? 'periodEnd' THEN "vC1PlatformInvoiceLines"."periodEnd" ELSE t."periodEnd" END,
               "lineNo" = "vC1PlatformInvoiceLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."platformInvoiceId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PlatformInvoiceLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."PlatformInvoiceLines" ("platformInvoiceId", "lineNo", "lineKind", description, "planId", "addonId", "usageMeterId", quantity, "unitPrice", amount, "periodStart", "periodEnd")
        VALUES ("vRet", "vC1PlatformInvoiceLines"."lineNo", CASE WHEN "vE1" ? 'lineKind' THEN "vC1PlatformInvoiceLines"."lineKind" ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1PlatformInvoiceLines".description ELSE NULL END, CASE WHEN "vE1" ? 'planId' THEN "vC1PlatformInvoiceLines"."planId" ELSE NULL END, CASE WHEN "vE1" ? 'addonId' THEN "vC1PlatformInvoiceLines"."addonId" ELSE NULL END, CASE WHEN "vE1" ? 'usageMeterId' THEN "vC1PlatformInvoiceLines"."usageMeterId" ELSE NULL END, CASE WHEN "vE1" ? 'quantity' THEN "vC1PlatformInvoiceLines".quantity ELSE 1 END, CASE WHEN "vE1" ? 'unitPrice' THEN "vC1PlatformInvoiceLines"."unitPrice" ELSE NULL END, CASE WHEN "vE1" ? 'amount' THEN "vC1PlatformInvoiceLines".amount ELSE NULL END, CASE WHEN "vE1" ? 'periodStart' THEN "vC1PlatformInvoiceLines"."periodStart" ELSE NULL END, CASE WHEN "vE1" ? 'periodEnd' THEN "vC1PlatformInvoiceLines"."periodEnd" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;
    END LOOP;
  END IF;
  RETURN "vRet";
END $function$;

-- ---------------------------------------------------------------------------
-- 3. platformInvoiceIssue: DRAFT → OPEN (or PAID when the total is 0). Checks the totals against the lines and the
--    tax rate, then assigns the next FS-INV number of the issue year. Returns the number.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."platformInvoiceIssue"("pId" uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow"   "Platform"."PlatformInvoices";
  "vLines" integer;
  "vSum"   numeric(18,2);
  "vDoc"   text;
BEGIN
  SELECT * INTO "vRow" FROM "Platform"."PlatformInvoices" t WHERE t.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PlatformInvoices % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Invoice % is % and can no longer be issued', COALESCE("vRow"."docNo", "pId"::text), "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'INVOICE_NOT_DRAFT';
  END IF;
  SELECT count(*), COALESCE(sum(l.amount), 0) INTO "vLines", "vSum" FROM "Platform"."PlatformInvoiceLines" l WHERE l."platformInvoiceId" = "pId";
  IF "vLines" = 0 OR "vSum" <> "vRow"."grossAmount" OR "vRow"."taxAmount" <> round("vRow"."netAmount" * "vRow"."taxRate" / 100, 2) THEN
    RAISE EXCEPTION 'Invoice totals do not match its lines (% lines, lines %, gross %, tax %)', "vLines", "vSum", "vRow"."grossAmount", "vRow"."taxAmount"
      USING ERRCODE = 'check_violation', HINT = 'INVOICE_TOTALS_MISMATCH';
  END IF;
  "vDoc" := "Platform"."getNextPlatformDocumentNo"('FS-INV', "vRow"."issuedOn");
  UPDATE "Platform"."PlatformInvoices" t
     SET "docNo" = "vDoc", status = CASE WHEN t."totalAmount" = 0 THEN 'PAID' ELSE 'OPEN' END
   WHERE t.id = "pId";
  RETURN "vDoc";
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Dunning → company access. The worst open case of a company sets Platform.Tenants.status (and its live
--    subscription's status): GRACE → PAST_DUE, READ_ONLY → READ_ONLY, SUSPENDED / COLLECTIONS → SUSPENDED; a PROMISE
--    keeps at most READ_ONLY (PAST_DUE when the promise lifts read-only). No open case → ACTIVE again.
--    Trial, churned and provisioning companies are never touched, nor a company suspended by hand (only a suspension
--    whose reason starts with "Dunning:" is lifted here). Returns { before, after }.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."dunningTenantSync"("pTenantId" uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vT"     record;
  "vLevel" integer;
  "vDoc"   text;
  "vNew"   text;
BEGIN
  SELECT t.status, t."suspensionReason" INTO "vT" FROM "Platform"."Tenants" t WHERE t.id = "pTenantId" FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF "vT".status NOT IN ('ACTIVE', 'PAST_DUE', 'READ_ONLY', 'SUSPENDED')
     OR ("vT".status = 'SUSPENDED' AND COALESCE("vT"."suspensionReason", '') NOT LIKE 'Dunning:%') THEN
    RETURN jsonb_build_object('before', "vT".status, 'after', "vT".status);
  END IF;

  SELECT x.lvl, x."docNo" INTO "vLevel", "vDoc" FROM (
    SELECT i."docNo",
           CASE dc.stage
             WHEN 'GRACE' THEN 1
             WHEN 'READ_ONLY' THEN 2
             WHEN 'SUSPENDED' THEN 3
             WHEN 'COLLECTIONS' THEN 3
             WHEN 'PROMISE' THEN CASE WHEN dc."promiseLiftReadOnly" OR (CURRENT_DATE - i."dueOn") <= p."graceDays" THEN 1 ELSE 2 END
           END AS lvl
      FROM "Platform"."DunningCases" dc
      JOIN "Platform"."PlatformInvoices" i ON i.id = dc."platformInvoiceId"
      JOIN "Platform"."DunningPolicies" p ON p.id = dc."dunningPolicyId"
     WHERE dc."tenantId" = "pTenantId" AND dc."closedAt" IS NULL) x
   ORDER BY x.lvl DESC NULLS LAST LIMIT 1;

  "vNew" := CASE "vLevel" WHEN 1 THEN 'PAST_DUE' WHEN 2 THEN 'READ_ONLY' WHEN 3 THEN 'SUSPENDED' ELSE 'ACTIVE' END;
  IF "vNew" <> "vT".status THEN
    UPDATE "Platform"."Tenants" t
       SET status = "vNew",
           "suspendedAt" = CASE WHEN "vNew" = 'SUSPENDED' THEN now() ELSE NULL END,
           "suspensionReason" = CASE WHEN "vNew" = 'SUSPENDED' THEN left('Dunning: ' || COALESCE("vDoc", 'overdue invoice') || ' overdue', 300) ELSE NULL END
     WHERE t.id = "pTenantId";
  END IF;
  UPDATE "Platform"."Subscriptions" s
     SET status = CASE "vNew" WHEN 'ACTIVE' THEN 'ACTIVE' WHEN 'SUSPENDED' THEN 'SUSPENDED' ELSE 'PAST_DUE' END
   WHERE s."tenantId" = "pTenantId" AND s.status IN ('ACTIVE', 'PAST_DUE', 'SUSPENDED')
     AND s.status <> CASE "vNew" WHEN 'ACTIVE' THEN 'ACTIVE' WHEN 'SUSPENDED' THEN 'SUSPENDED' ELSE 'PAST_DUE' END;
  RETURN jsonb_build_object('before', "vT".status, 'after', "vNew");
END $function$;

-- ---------------------------------------------------------------------------
-- 5. platformInvoiceVoid: the company comes from the invoice when there is no session tenant; an invoice with money
--    allocated can't be voided (refund first); its open dunning case is cancelled and the company's access re-synced.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."platformInvoiceVoid"("pId" uuid, "pReason" text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow"    "Platform"."PlatformInvoices";
  "vTenant" uuid := NULLIF(current_setting('app.tenantId', true), '')::uuid;
BEGIN
  SELECT * INTO "vRow" FROM "Platform"."PlatformInvoices" t WHERE t.id = "pId" AND ("vTenant" IS NULL OR t."tenantId" = "vTenant") FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PlatformInvoices % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'VOID' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'UNCOLLECTIBLE') THEN
    RAISE EXCEPTION 'PlatformInvoices %: cannot void from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."paidAmount" > 0 THEN
    RAISE EXCEPTION 'Invoice % has payments allocated: refund them before voiding', COALESCE("vRow"."docNo", "pId"::text)
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'INVOICE_HAS_PAYMENTS';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Platform"."platformInvoiceVoidEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Platform"."platformInvoiceVoidEntries"') USING "pId";
  END IF;
  UPDATE "Platform"."PlatformInvoices" t
     SET status = 'VOID', "voidedAt" = now(), "voidReason" = "pReason",
         "voidedByStaffId" = (SELECT s.id FROM "Platform"."PlatformStaff" s WHERE s.id = "Company"."getCurrentUserId"())
   WHERE t.id = "pId";
  UPDATE "Platform"."DunningAttempts" a SET status = 'CANCELLED'
   WHERE a.status = 'SCHEDULED' AND a."dunningCaseId" IN (SELECT dc.id FROM "Platform"."DunningCases" dc WHERE dc."platformInvoiceId" = "pId" AND dc."closedAt" IS NULL);
  UPDATE "Platform"."DunningCases" dc SET stage = 'CANCELLED', "closedAt" = now(), "nextRetryAt" = NULL, "nextRetryMethod" = NULL
   WHERE dc."platformInvoiceId" = "pId" AND dc."closedAt" IS NULL;
  IF FOUND THEN
    PERFORM "Platform"."dunningTenantSync"("vRow"."tenantId");
  END IF;
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 6. dunningCaseAddUpdate: the company comes from the payload (or the case) when there is no session tenant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."dunningCaseAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vTenant" uuid := COALESCE(NULLIF(current_setting('app.tenantId', true), '')::uuid, NULLIF("pData" ->> 'tenantId', '')::uuid,
                             (SELECT t."tenantId" FROM "Platform"."DunningCases" t WHERE t.id = NULLIF("pData" ->> 'id', '')::uuid));
  "vRec" "Platform"."DunningCases";
  "vRet" uuid;
  "vC1DunningAttempts" "Platform"."DunningAttempts";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."DunningCases", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."DunningCases" ("tenantId", "platformInvoiceId", "dunningPolicyId", "openedAt", stage, "amountDue", "paymentMethod", "attemptsCount", "lastFailureReason", "nextRetryAt", "nextRetryMethod", "retriesPaused", "promiseDate", "promiseAmount", "promiseSource", "promiseNote", "promiseLiftReadOnly", "promiseRemindOwner", "promiseLoggedByStaffId", "recoveredAt", "recoveredPaymentId", "closedAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'platformInvoiceId' THEN "vRec"."platformInvoiceId" ELSE NULL END, CASE WHEN "pData" ? 'dunningPolicyId' THEN "vRec"."dunningPolicyId" ELSE NULL END, CASE WHEN "pData" ? 'openedAt' THEN "vRec"."openedAt" ELSE now() END, CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE 'GRACE' END, CASE WHEN "pData" ? 'amountDue' THEN "vRec"."amountDue" ELSE NULL END, CASE WHEN "pData" ? 'paymentMethod' THEN "vRec"."paymentMethod" ELSE NULL END, CASE WHEN "pData" ? 'attemptsCount' THEN "vRec"."attemptsCount" ELSE 0 END, CASE WHEN "pData" ? 'lastFailureReason' THEN "vRec"."lastFailureReason" ELSE NULL END, CASE WHEN "pData" ? 'nextRetryAt' THEN "vRec"."nextRetryAt" ELSE NULL END, CASE WHEN "pData" ? 'nextRetryMethod' THEN "vRec"."nextRetryMethod" ELSE NULL END, CASE WHEN "pData" ? 'retriesPaused' THEN "vRec"."retriesPaused" ELSE FALSE END, CASE WHEN "pData" ? 'promiseDate' THEN "vRec"."promiseDate" ELSE NULL END, CASE WHEN "pData" ? 'promiseAmount' THEN "vRec"."promiseAmount" ELSE NULL END, CASE WHEN "pData" ? 'promiseSource' THEN "vRec"."promiseSource" ELSE NULL END, CASE WHEN "pData" ? 'promiseNote' THEN "vRec"."promiseNote" ELSE NULL END, CASE WHEN "pData" ? 'promiseLiftReadOnly' THEN "vRec"."promiseLiftReadOnly" ELSE FALSE END, CASE WHEN "pData" ? 'promiseRemindOwner' THEN "vRec"."promiseRemindOwner" ELSE TRUE END, CASE WHEN "pData" ? 'promiseLoggedByStaffId' THEN "vRec"."promiseLoggedByStaffId" ELSE NULL END, CASE WHEN "pData" ? 'recoveredAt' THEN "vRec"."recoveredAt" ELSE NULL END, CASE WHEN "pData" ? 'recoveredPaymentId' THEN "vRec"."recoveredPaymentId" ELSE NULL END, CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."DunningCases" t
       SET "platformInvoiceId" = CASE WHEN "pData" ? 'platformInvoiceId' THEN "vRec"."platformInvoiceId" ELSE t."platformInvoiceId" END,
           "dunningPolicyId" = CASE WHEN "pData" ? 'dunningPolicyId' THEN "vRec"."dunningPolicyId" ELSE t."dunningPolicyId" END,
           "openedAt" = CASE WHEN "pData" ? 'openedAt' THEN "vRec"."openedAt" ELSE t."openedAt" END,
           stage = CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE t.stage END,
           "amountDue" = CASE WHEN "pData" ? 'amountDue' THEN "vRec"."amountDue" ELSE t."amountDue" END,
           "paymentMethod" = CASE WHEN "pData" ? 'paymentMethod' THEN "vRec"."paymentMethod" ELSE t."paymentMethod" END,
           "attemptsCount" = CASE WHEN "pData" ? 'attemptsCount' THEN "vRec"."attemptsCount" ELSE t."attemptsCount" END,
           "lastFailureReason" = CASE WHEN "pData" ? 'lastFailureReason' THEN "vRec"."lastFailureReason" ELSE t."lastFailureReason" END,
           "nextRetryAt" = CASE WHEN "pData" ? 'nextRetryAt' THEN "vRec"."nextRetryAt" ELSE t."nextRetryAt" END,
           "nextRetryMethod" = CASE WHEN "pData" ? 'nextRetryMethod' THEN "vRec"."nextRetryMethod" ELSE t."nextRetryMethod" END,
           "retriesPaused" = CASE WHEN "pData" ? 'retriesPaused' THEN "vRec"."retriesPaused" ELSE t."retriesPaused" END,
           "promiseDate" = CASE WHEN "pData" ? 'promiseDate' THEN "vRec"."promiseDate" ELSE t."promiseDate" END,
           "promiseAmount" = CASE WHEN "pData" ? 'promiseAmount' THEN "vRec"."promiseAmount" ELSE t."promiseAmount" END,
           "promiseSource" = CASE WHEN "pData" ? 'promiseSource' THEN "vRec"."promiseSource" ELSE t."promiseSource" END,
           "promiseNote" = CASE WHEN "pData" ? 'promiseNote' THEN "vRec"."promiseNote" ELSE t."promiseNote" END,
           "promiseLiftReadOnly" = CASE WHEN "pData" ? 'promiseLiftReadOnly' THEN "vRec"."promiseLiftReadOnly" ELSE t."promiseLiftReadOnly" END,
           "promiseRemindOwner" = CASE WHEN "pData" ? 'promiseRemindOwner' THEN "vRec"."promiseRemindOwner" ELSE t."promiseRemindOwner" END,
           "promiseLoggedByStaffId" = CASE WHEN "pData" ? 'promiseLoggedByStaffId' THEN "vRec"."promiseLoggedByStaffId" ELSE t."promiseLoggedByStaffId" END,
           "recoveredAt" = CASE WHEN "pData" ? 'recoveredAt' THEN "vRec"."recoveredAt" ELSE t."recoveredAt" END,
           "recoveredPaymentId" = CASE WHEN "pData" ? 'recoveredPaymentId' THEN "vRec"."recoveredPaymentId" ELSE t."recoveredPaymentId" END,
           "closedAt" = CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE t."closedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."DunningCases" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'DunningCases %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'DunningCases % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'attempts' THEN
    -- attempts: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Platform"."DunningAttempts"
     WHERE "dunningCaseId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'attempts') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'attempts') WITH ORDINALITY t(x, n) LOOP
      "vC1DunningAttempts" := jsonb_populate_record(NULL::"Platform"."DunningAttempts", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."DunningAttempts" t
           SET "attemptNo" = CASE WHEN "vE1" ? 'attemptNo' THEN "vC1DunningAttempts"."attemptNo" ELSE t."attemptNo" END,
               "planDay" = CASE WHEN "vE1" ? 'planDay' THEN "vC1DunningAttempts"."planDay" ELSE t."planDay" END,
               label = CASE WHEN "vE1" ? 'label' THEN "vC1DunningAttempts".label ELSE t.label END,
               method = CASE WHEN "vE1" ? 'method' THEN "vC1DunningAttempts".method ELSE t.method END,
               "scheduledAt" = CASE WHEN "vE1" ? 'scheduledAt' THEN "vC1DunningAttempts"."scheduledAt" ELSE t."scheduledAt" END,
               "attemptedAt" = CASE WHEN "vE1" ? 'attemptedAt' THEN "vC1DunningAttempts"."attemptedAt" ELSE t."attemptedAt" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1DunningAttempts".status ELSE t.status END,
               "triggeredBy" = CASE WHEN "vE1" ? 'triggeredBy' THEN "vC1DunningAttempts"."triggeredBy" ELSE t."triggeredBy" END,
               "platformPaymentId" = CASE WHEN "vE1" ? 'platformPaymentId' THEN "vC1DunningAttempts"."platformPaymentId" ELSE t."platformPaymentId" END,
               "failureReason" = CASE WHEN "vE1" ? 'failureReason' THEN "vC1DunningAttempts"."failureReason" ELSE t."failureReason" END,
               "staffUserId" = CASE WHEN "vE1" ? 'staffUserId' THEN "vC1DunningAttempts"."staffUserId" ELSE t."staffUserId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."dunningCaseId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'DunningAttempts: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."DunningAttempts" ("dunningCaseId", "attemptNo", "planDay", label, method, "scheduledAt", "attemptedAt", status, "triggeredBy", "platformPaymentId", "failureReason", "staffUserId")
        VALUES ("vRet", CASE WHEN "vE1" ? 'attemptNo' THEN "vC1DunningAttempts"."attemptNo" ELSE NULL END, CASE WHEN "vE1" ? 'planDay' THEN "vC1DunningAttempts"."planDay" ELSE NULL END, CASE WHEN "vE1" ? 'label' THEN "vC1DunningAttempts".label ELSE NULL END, CASE WHEN "vE1" ? 'method' THEN "vC1DunningAttempts".method ELSE NULL END, CASE WHEN "vE1" ? 'scheduledAt' THEN "vC1DunningAttempts"."scheduledAt" ELSE NULL END, CASE WHEN "vE1" ? 'attemptedAt' THEN "vC1DunningAttempts"."attemptedAt" ELSE NULL END, CASE WHEN "vE1" ? 'status' THEN "vC1DunningAttempts".status ELSE 'SCHEDULED' END, CASE WHEN "vE1" ? 'triggeredBy' THEN "vC1DunningAttempts"."triggeredBy" ELSE 'SCHEDULE' END, CASE WHEN "vE1" ? 'platformPaymentId' THEN "vC1DunningAttempts"."platformPaymentId" ELSE NULL END, CASE WHEN "vE1" ? 'failureReason' THEN "vC1DunningAttempts"."failureReason" ELSE NULL END, CASE WHEN "vE1" ? 'staffUserId' THEN "vC1DunningAttempts"."staffUserId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;
    END LOOP;
  END IF;
  RETURN "vRet";
END $function$;

-- ---------------------------------------------------------------------------
-- 7. resellerAddUpdate: the tenants branch attributes each element's own tenantId (it used an undeclared "vTenant").
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."resellerAddUpdate"("pData" jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRec" "Platform"."Resellers";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1ResellerTenants" "Platform"."ResellerTenants";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Platform"."Resellers", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Platform"."Resellers" (name, city, tier, "commissionPct", "nextTierTenants", "contactName", email, phone, ntn, "isActiveTaxpayer", "bankName", "ibanMasked", "ibanEnc", "payoutMethod", "inviteCode", status)
    VALUES (CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'tier' THEN "vRec".tier ELSE 'BRONZE' END, CASE WHEN "pData" ? 'commissionPct' THEN "vRec"."commissionPct" ELSE NULL END, CASE WHEN "pData" ? 'nextTierTenants' THEN "vRec"."nextTierTenants" ELSE NULL END, CASE WHEN "pData" ? 'contactName' THEN "vRec"."contactName" ELSE NULL END, CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE NULL END, CASE WHEN "pData" ? 'isActiveTaxpayer' THEN "vRec"."isActiveTaxpayer" ELSE FALSE END, CASE WHEN "pData" ? 'bankName' THEN "vRec"."bankName" ELSE NULL END, CASE WHEN "pData" ? 'ibanMasked' THEN "vRec"."ibanMasked" ELSE NULL END, CASE WHEN "pData" ? 'ibanEnc' THEN "vRec"."ibanEnc" ELSE NULL END, CASE WHEN "pData" ? 'payoutMethod' THEN "vRec"."payoutMethod" ELSE 'IBFT' END, CASE WHEN "pData" ? 'inviteCode' THEN "vRec"."inviteCode" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Platform"."Resellers" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           city = CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE t.city END,
           tier = CASE WHEN "pData" ? 'tier' THEN "vRec".tier ELSE t.tier END,
           "commissionPct" = CASE WHEN "pData" ? 'commissionPct' THEN "vRec"."commissionPct" ELSE t."commissionPct" END,
           "nextTierTenants" = CASE WHEN "pData" ? 'nextTierTenants' THEN "vRec"."nextTierTenants" ELSE t."nextTierTenants" END,
           "contactName" = CASE WHEN "pData" ? 'contactName' THEN "vRec"."contactName" ELSE t."contactName" END,
           email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           phone = CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE t.phone END,
           ntn = CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE t.ntn END,
           "isActiveTaxpayer" = CASE WHEN "pData" ? 'isActiveTaxpayer' THEN "vRec"."isActiveTaxpayer" ELSE t."isActiveTaxpayer" END,
           "bankName" = CASE WHEN "pData" ? 'bankName' THEN "vRec"."bankName" ELSE t."bankName" END,
           "ibanMasked" = CASE WHEN "pData" ? 'ibanMasked' THEN "vRec"."ibanMasked" ELSE t."ibanMasked" END,
           "ibanEnc" = CASE WHEN "pData" ? 'ibanEnc' THEN "vRec"."ibanEnc" ELSE t."ibanEnc" END,
           "payoutMethod" = CASE WHEN "pData" ? 'payoutMethod' THEN "vRec"."payoutMethod" ELSE t."payoutMethod" END,
           "inviteCode" = CASE WHEN "pData" ? 'inviteCode' THEN "vRec"."inviteCode" ELSE t."inviteCode" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Platform"."Resellers" t WHERE t.id = "vId") THEN
        RAISE EXCEPTION 'Resellers %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Resellers % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'tenants' THEN
    -- tenants: rows missing from the array are removed, rows with "id" are updated, others inserted (each element names its tenantId)
    DELETE FROM "Platform"."ResellerTenants"
     WHERE "partnerId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'tenants') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'tenants') WITH ORDINALITY t(x, n) LOOP
      "vC1ResellerTenants" := jsonb_populate_record(NULL::"Platform"."ResellerTenants", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Platform"."ResellerTenants" t
           SET "attributedOn" = CASE WHEN "vE1" ? 'attributedOn' THEN "vC1ResellerTenants"."attributedOn" ELSE t."attributedOn" END,
               "commissionPctOverride" = CASE WHEN "vE1" ? 'commissionPctOverride' THEN "vC1ResellerTenants"."commissionPctOverride" ELSE t."commissionPctOverride" END,
               "endedOn" = CASE WHEN "vE1" ? 'endedOn' THEN "vC1ResellerTenants"."endedOn" ELSE t."endedOn" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."partnerId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ResellerTenants: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Platform"."ResellerTenants" ("partnerId", "tenantId", "attributedOn", "commissionPctOverride", "endedOn")
        VALUES ("vRet", "vC1ResellerTenants"."tenantId", CASE WHEN "vE1" ? 'attributedOn' THEN "vC1ResellerTenants"."attributedOn" ELSE CURRENT_DATE END, CASE WHEN "vE1" ? 'commissionPctOverride' THEN "vC1ResellerTenants"."commissionPctOverride" ELSE NULL END, CASE WHEN "vE1" ? 'endedOn' THEN "vC1ResellerTenants"."endedOn" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;
    END LOOP;
  END IF;
  RETURN "vRet";
END $function$;

-- ---------------------------------------------------------------------------
-- 8. Payment allocation (unchanged rule) names its catalogue code when payments would exceed the invoice total.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."triggerPlatformPaymentApply"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  "vInvoiceId" uuid := COALESCE(NEW."platformInvoiceId", OLD."platformInvoiceId");
  "vInv"        record;
  "vPaid"       numeric(18,2);
BEGIN
  SELECT i.id, i.status, i."totalAmount" INTO "vInv"
    FROM "Platform"."PlatformInvoices" i WHERE i.id = "vInvoiceId" FOR UPDATE;

  SELECT COALESCE(sum(p.amount - p."refundedAmount"), 0) INTO "vPaid"
    FROM "Platform"."PlatformPayments" p
   WHERE p."platformInvoiceId" = "vInvoiceId"
     AND p.status IN ('SUCCEEDED','PARTIALLY_REFUNDED');

  IF "vPaid" > "vInv"."totalAmount" THEN
    RAISE EXCEPTION 'Payments (%) exceed the invoice total (%)', "vPaid", "vInv"."totalAmount"
      USING ERRCODE = 'check_violation', HINT = 'PAYMENT_EXCEEDS_BALANCE';
  END IF;

  UPDATE "Platform"."PlatformInvoices" i
     SET "paidAmount" = "vPaid",
         status = CASE
                    WHEN i.status IN ('VOID','DRAFT','UNCOLLECTIBLE') THEN i.status
                    WHEN "vPaid" >= i."totalAmount" AND i."totalAmount" > 0 THEN 'PAID'
                    WHEN "vPaid" > 0 THEN 'PARTIALLY_PAID'
                    ELSE 'OPEN'
                  END
   WHERE i.id = "vInvoiceId";
  RETURN NULL;
END $function$;

-- ---------------------------------------------------------------------------
-- 9. platformInvoiceGenerate(tenant, periodStart[, coupon]): a DRAFT subscription invoice for the period starting on
--    periodStart (one month or one year by the cycle), from the company's live paid subscription:
--      PLAN line (the subscription price) · SEATS line (seats above the plan's, at its extra-seat price) · one ADDON line
--      per active add-on (monthly price × 12 on an annual cycle) · the coupon discount · provincial sales tax on services.
--    A coupon passed in is redeemed first (SubscriptionCouponRedemptions); the active redemption then gives the discount
--    and counts down its months (12 for an annual invoice). Tax: the authority of the company's province (ICT → FBR)
--    and its ACTIVE sales-tax rate on the issue date. Issued on periodStart, due 14 days later. Idempotent per
--    subscription and period (returns the existing non-void invoice).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."platformInvoiceGenerate"("pTenantId" uuid, "pPeriodStart" date, "pCouponId" uuid DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant"  record;
  "vSub"     record;
  "vPlan"    record;
  "vAddon"   record;
  "vCoupon"  record;
  "vRed"     record;
  "vId"      uuid;
  "vEnd"     date;
  "vMult"    integer;
  "vLabel"   text;
  "vLineNo"  integer := 0;
  "vGross"   numeric(18,2) := 0;
  "vDisc"    numeric(18,2) := 0;
  "vNet"     numeric(18,2);
  "vTax"     numeric(18,2);
  "vAuth"    uuid;
  "vRate"    numeric(7,4) := 0;
  "vQty"     numeric(18,3);
  "vUnit"    numeric(18,4);
  "vAmt"     numeric(18,2);
  "vMonths"  smallint;
  "vLines"   jsonb := '[]'::jsonb;
  "vL"       jsonb;
BEGIN
  SELECT t.id, t.province INTO "vTenant" FROM "Platform"."Tenants" t WHERE t.id = "pTenantId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company % not found', "pTenantId" USING ERRCODE = 'no_data_found';
  END IF;
  SELECT s.* INTO "vSub" FROM "Platform"."Subscriptions" s
   WHERE s."tenantId" = "pTenantId" AND s.status IN ('ACTIVE', 'PAST_DUE', 'SUSPENDED')
   ORDER BY s."startsOn" DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company % has no paid live subscription to invoice', "pTenantId"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'INVOICE_NO_SUBSCRIPTION';
  END IF;

  SELECT i.id INTO "vId" FROM "Platform"."PlatformInvoices" i
   WHERE i."subscriptionId" = "vSub".id AND i."invoiceKind" = 'SUBSCRIPTION' AND i."periodStart" = "pPeriodStart" AND i.status <> 'VOID'
   LIMIT 1;
  IF "vId" IS NOT NULL THEN RETURN "vId"; END IF;

  SELECT p.* INTO "vPlan" FROM "Platform"."SubscriptionPlans" p WHERE p.id = "vSub"."planId";
  "vMult" := CASE WHEN "vSub"."billingCycle" = 'ANNUAL' THEN 12 ELSE 1 END;
  "vEnd" := ("pPeriodStart" + CASE WHEN "vMult" = 12 THEN interval '1 year' ELSE interval '1 month' END - interval '1 day')::date;
  "vLabel" := CASE WHEN "vMult" = 12 THEN to_char("pPeriodStart", 'Mon YYYY') || ' – ' || to_char("vEnd", 'Mon YYYY') ELSE to_char("pPeriodStart", 'Mon YYYY') END;

  -- lines
  "vLineNo" := "vLineNo" + 1;
  "vLines" := "vLines" || jsonb_build_object('lineNo', "vLineNo", 'lineKind', 'PLAN', 'description', "vPlan".name || ' · ' || "vLabel",
                'planId', "vPlan".id, 'quantity', 1, 'unitPrice', "vSub".amount, 'amount', round("vSub".amount, 2));
  IF "vSub".seats IS NOT NULL AND "vPlan"."userSeats" IS NOT NULL AND "vSub".seats > "vPlan"."userSeats" AND COALESCE("vPlan"."extraSeatPrice", 0) > 0 THEN
    "vQty" := "vSub".seats - "vPlan"."userSeats";
    "vUnit" := "vPlan"."extraSeatPrice" * "vMult";
    "vLineNo" := "vLineNo" + 1;
    "vLines" := "vLines" || jsonb_build_object('lineNo', "vLineNo", 'lineKind', 'SEATS', 'description', 'Extra users above ' || "vPlan"."userSeats" || ' · ' || "vLabel",
                  'planId', "vPlan".id, 'quantity', "vQty", 'unitPrice', "vUnit", 'amount', round("vQty" * "vUnit", 2));
  END IF;
  FOR "vAddon" IN
    SELECT ta."addonId", ta.quantity, ta."unitPrice", a.name
      FROM "Platform"."TenantAddons" ta JOIN "Platform"."Addons" a ON a.id = ta."addonId"
     WHERE ta."tenantId" = "pTenantId" AND ta.status = 'ACTIVE' AND ta."startedOn" <= "vEnd" AND (ta."endedOn" IS NULL OR ta."endedOn" >= "pPeriodStart")
     ORDER BY a.name
  LOOP
    "vUnit" := "vAddon"."unitPrice" * "vMult";
    "vLineNo" := "vLineNo" + 1;
    "vLines" := "vLines" || jsonb_build_object('lineNo', "vLineNo", 'lineKind', 'ADDON', 'description', "vAddon".name || ' · ' || "vLabel",
                  'addonId', "vAddon"."addonId", 'quantity', "vAddon".quantity, 'unitPrice', "vUnit", 'amount', round("vAddon".quantity * "vUnit", 2));
  END LOOP;
  SELECT COALESCE(sum((x ->> 'amount')::numeric), 0) INTO "vGross" FROM jsonb_array_elements("vLines") x;

  -- coupon: redeem the one passed in (once per company), then apply the active redemption
  IF "pCouponId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Platform"."SubscriptionCouponRedemptions" r WHERE r."couponId" = "pCouponId" AND r."tenantId" = "pTenantId") THEN
    SELECT c.* INTO "vCoupon" FROM "Platform"."SubscriptionCoupons" c WHERE c.id = "pCouponId" AND c."deletedAt" IS NULL;
    IF NOT FOUND OR "vCoupon".status <> 'ACTIVE' OR "vCoupon"."startsOn" > CURRENT_DATE OR ("vCoupon"."expiresOn" IS NOT NULL AND "vCoupon"."expiresOn" < CURRENT_DATE)
       OR ("vCoupon"."redemptionCap" IS NOT NULL AND (SELECT count(*) FROM "Platform"."SubscriptionCouponRedemptions" r WHERE r."couponId" = "pCouponId") >= "vCoupon"."redemptionCap")
       OR (EXISTS (SELECT 1 FROM "Platform"."SubscriptionCouponPlans" cp WHERE cp."couponId" = "pCouponId")
           AND NOT EXISTS (SELECT 1 FROM "Platform"."SubscriptionCouponPlans" cp WHERE cp."couponId" = "pCouponId" AND cp."planId" = "vSub"."planId"))
       OR ("vCoupon"."newCustomersOnly" AND EXISTS (SELECT 1 FROM "Platform"."PlatformInvoices" i WHERE i."tenantId" = "pTenantId" AND i.status NOT IN ('DRAFT', 'VOID'))) THEN
      RAISE EXCEPTION 'This coupon can''t be applied to this company''s subscription'
        USING ERRCODE = 'check_violation', HINT = 'COUPON_NOT_APPLICABLE';
    END IF;
    "vMonths" := CASE "vCoupon".duration WHEN 'ONCE' THEN 1 WHEN 'MONTHS_3' THEN 3 WHEN 'MONTHS_6' THEN 6 WHEN 'MONTHS_12' THEN 12 ELSE NULL END;
    INSERT INTO "Platform"."SubscriptionCouponRedemptions" ("couponId", "tenantId", "subscriptionId", "discountPerInvoice", "monthsRemaining", status)
    VALUES ("pCouponId", "pTenantId", "vSub".id,
            CASE WHEN "vCoupon"."discountType" = 'PERCENT' THEN round("vGross" * "vCoupon"."discountValue" / 100, 2) ELSE LEAST("vCoupon"."discountValue", "vGross") END,
            "vMonths", 'ACTIVE');
  END IF;
  SELECT r.id, r."couponId", r."monthsRemaining", r."firstInvoiceId", c."discountType", c."discountValue" INTO "vRed"
    FROM "Platform"."SubscriptionCouponRedemptions" r JOIN "Platform"."SubscriptionCoupons" c ON c.id = r."couponId"
   WHERE r."tenantId" = "pTenantId" AND r.status = 'ACTIVE' AND (r."subscriptionId" IS NULL OR r."subscriptionId" = "vSub".id)
     AND (r."monthsRemaining" IS NULL OR r."monthsRemaining" > 0)
   ORDER BY r."redeemedAt" LIMIT 1;
  IF FOUND THEN
    "vDisc" := LEAST("vGross", CASE WHEN "vRed"."discountType" = 'PERCENT' THEN round("vGross" * "vRed"."discountValue" / 100, 2) ELSE "vRed"."discountValue" * "vMult" END);
  END IF;

  -- tax: the company's provincial authority (ICT → FBR) and its active sales-tax rate on services
  SELECT a.id INTO "vAuth" FROM "Platform"."TaxMasterAuthorities" a
   WHERE a.jurisdiction = CASE "vTenant".province WHEN 'PUNJAB' THEN 'PUNJAB' WHEN 'SINDH' THEN 'SINDH' WHEN 'KPK' THEN 'KPK'
                                                  WHEN 'BALOCHISTAN' THEN 'BALOCHISTAN' WHEN 'ICT' THEN 'FEDERAL' END
   LIMIT 1;
  IF "vAuth" IS NOT NULL THEN
    SELECT r.rate INTO "vRate" FROM "Platform"."TaxMasterSalesTaxRates" r
     WHERE r."taxAuthorityId" = "vAuth" AND r.status = 'ACTIVE' AND r."effectiveFrom" <= "pPeriodStart" AND (r."effectiveTo" IS NULL OR r."effectiveTo" >= "pPeriodStart")
     ORDER BY (r."appliesTo" ~* '(software|computer|\mIT\M|services)') DESC, r."effectiveFrom" DESC
     LIMIT 1;
    "vRate" := COALESCE("vRate", 0);
  END IF;
  "vNet" := "vGross" - "vDisc";
  "vTax" := round("vNet" * "vRate" / 100, 2);

  INSERT INTO "Platform"."PlatformInvoices" ("tenantId", "docNo", status, "subscriptionId", "invoiceKind", description, "periodStart", "periodEnd", "issuedOn", "dueOn",
                                             "grossAmount", "discountAmount", "netAmount", "taxAuthorityId", "taxRate", "taxAmount", "totalAmount", "couponId")
  VALUES ("pTenantId", NULL, 'DRAFT', "vSub".id, 'SUBSCRIPTION', "vPlan".name || ' · ' || "vLabel", "pPeriodStart", "vEnd", "pPeriodStart", "pPeriodStart" + 14,
          "vGross", "vDisc", "vNet", "vAuth", "vRate", "vTax", "vNet" + "vTax", CASE WHEN "vDisc" > 0 THEN "vRed"."couponId" END)
  RETURNING id INTO "vId";
  FOR "vL" IN SELECT x FROM jsonb_array_elements("vLines") x LOOP
    INSERT INTO "Platform"."PlatformInvoiceLines" ("platformInvoiceId", "lineNo", "lineKind", description, "planId", "addonId", quantity, "unitPrice", amount, "periodStart", "periodEnd")
    VALUES ("vId", ("vL" ->> 'lineNo')::smallint, "vL" ->> 'lineKind', "vL" ->> 'description', NULLIF("vL" ->> 'planId', '')::uuid, NULLIF("vL" ->> 'addonId', '')::uuid,
            ("vL" ->> 'quantity')::numeric, ("vL" ->> 'unitPrice')::numeric, ("vL" ->> 'amount')::numeric, "pPeriodStart", "vEnd");
  END LOOP;
  IF "vDisc" > 0 THEN
    UPDATE "Platform"."SubscriptionCouponRedemptions" r
       SET "firstInvoiceId" = COALESCE(r."firstInvoiceId", "vId"),
           "monthsRemaining" = CASE WHEN r."monthsRemaining" IS NULL THEN NULL ELSE GREATEST(r."monthsRemaining" - "vMult", 0) END,
           status = CASE WHEN r."monthsRemaining" IS NOT NULL AND r."monthsRemaining" - "vMult" <= 0 THEN 'EXHAUSTED' ELSE r.status END
     WHERE r.id = "vRed".id;
  END IF;
  RETURN "vId";
END $function$;

-- ---------------------------------------------------------------------------
-- 10. dunningCaseAdvance(case, asOf[, escalate]): moves an open case by its policy's day counts (days past the
--     invoice's due date): 1..grace GRACE → READ_ONLY → SUSPENDED → COLLECTIONS (archive / churn stays manual). Stages
--     only move forward; a PROMISE holds until its date passes, then the case resumes by days. Escalate moves one
--     stage now. A paid / void / uncollectible invoice closes the case (RECOVERED / CANCELLED / WRITTEN_OFF). Then the
--     company's status follows (dunningTenantSync). Returns { caseId, tenantId, stageBefore, stage, tenantBefore, tenantStatus }.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."dunningCaseAdvance"("pId" uuid, "pAsOf" date DEFAULT CURRENT_DATE, "pEscalate" boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vC"       record;
  "vDays"    integer;
  "vByDays"  integer;
  "vCur"     integer;
  "vRank"    integer;
  "vStage"   text;
  "vPaused"  boolean;
  "vPay"     uuid;
  "vNext"    record;
  "vSync"    jsonb;
  "STAGES"   text[] := ARRAY['GRACE', 'READ_ONLY', 'SUSPENDED', 'COLLECTIONS'];
BEGIN
  SELECT dc.id, dc."tenantId", dc.stage, dc."closedAt", dc."retriesPaused", dc."promiseDate", dc."platformInvoiceId",
         i.status AS "invStatus", i."dueOn", p."graceDays", p."readOnlyDays", p."suspendedDays"
    INTO "vC"
    FROM "Platform"."DunningCases" dc
    JOIN "Platform"."PlatformInvoices" i ON i.id = dc."platformInvoiceId"
    JOIN "Platform"."DunningPolicies" p ON p.id = dc."dunningPolicyId"
   WHERE dc.id = "pId"
     FOR UPDATE OF dc;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DunningCases % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vC"."closedAt" IS NOT NULL THEN
    IF "pEscalate" THEN
      RAISE EXCEPTION 'This dunning case is closed (%)', "vC".stage USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'DUNNING_CASE_CLOSED';
    END IF;
    RETURN jsonb_build_object('caseId', "pId", 'tenantId', "vC"."tenantId", 'stageBefore', "vC".stage, 'stage', "vC".stage);
  END IF;

  IF "vC"."invStatus" IN ('PAID', 'VOID', 'UNCOLLECTIBLE') THEN
    "vStage" := CASE "vC"."invStatus" WHEN 'PAID' THEN 'RECOVERED' WHEN 'VOID' THEN 'CANCELLED' ELSE 'WRITTEN_OFF' END;
    IF "vStage" = 'RECOVERED' THEN
      SELECT p.id INTO "vPay" FROM "Platform"."PlatformPayments" p
       WHERE p."platformInvoiceId" = "vC"."platformInvoiceId" AND p.status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED')
       ORDER BY p."paidAt" DESC NULLS LAST, p."createdAt" DESC LIMIT 1;
    END IF;
    UPDATE "Platform"."DunningAttempts" a SET status = 'CANCELLED' WHERE a."dunningCaseId" = "pId" AND a.status = 'SCHEDULED';
    UPDATE "Platform"."DunningCases" dc
       SET stage = "vStage", "closedAt" = now(), "nextRetryAt" = NULL, "nextRetryMethod" = NULL, "retriesPaused" = false,
           "recoveredAt" = CASE WHEN "vStage" = 'RECOVERED' THEN now() ELSE dc."recoveredAt" END,
           "recoveredPaymentId" = CASE WHEN "vStage" = 'RECOVERED' THEN "vPay" ELSE dc."recoveredPaymentId" END
     WHERE dc.id = "pId";
  ELSE
    "vDays" := "pAsOf" - "vC"."dueOn";
    "vByDays" := CASE WHEN "vDays" <= "vC"."graceDays" THEN 1
                      WHEN "vDays" <= "vC"."graceDays" + "vC"."readOnlyDays" THEN 2
                      WHEN "vDays" <= "vC"."graceDays" + "vC"."readOnlyDays" + "vC"."suspendedDays" THEN 3
                      ELSE 4 END;
    "vCur" := array_position("STAGES", "vC".stage);       -- NULL for PROMISE
    "vPaused" := "vC"."retriesPaused";
    IF "vC".stage = 'PROMISE' THEN
      IF "pEscalate" THEN
        "vRank" := LEAST("vByDays" + 1, 4); "vPaused" := false;
      ELSIF "vC"."promiseDate" >= "pAsOf" THEN
        "vRank" := NULL;                                  -- the promise holds
      ELSE
        "vRank" := "vByDays"; "vPaused" := false;         -- broken promise: resume by days
      END IF;
    ELSIF "pEscalate" THEN
      "vRank" := LEAST(GREATEST("vCur", "vByDays") + 1, 4);
    ELSE
      "vRank" := GREATEST("vCur", "vByDays");
    END IF;
    "vStage" := CASE WHEN "vRank" IS NULL THEN "vC".stage ELSE "STAGES"["vRank"] END;
    SELECT a."scheduledAt", a.method INTO "vNext" FROM "Platform"."DunningAttempts" a
     WHERE a."dunningCaseId" = "pId" AND a.status = 'SCHEDULED' ORDER BY a."scheduledAt", a."attemptNo" LIMIT 1;
    UPDATE "Platform"."DunningCases" dc
       SET stage = "vStage", "retriesPaused" = "vPaused",
           "nextRetryAt" = CASE WHEN "vPaused" THEN NULL ELSE "vNext"."scheduledAt" END,
           "nextRetryMethod" = CASE WHEN "vPaused" THEN NULL ELSE "vNext".method END
     WHERE dc.id = "pId"
       AND (dc.stage, dc."retriesPaused", dc."nextRetryAt", dc."nextRetryMethod")
           IS DISTINCT FROM ("vStage", "vPaused", CASE WHEN "vPaused" THEN NULL ELSE "vNext"."scheduledAt" END, CASE WHEN "vPaused" THEN NULL ELSE "vNext".method END);
  END IF;

  "vSync" := "Platform"."dunningTenantSync"("vC"."tenantId");
  RETURN jsonb_build_object('caseId', "pId", 'tenantId', "vC"."tenantId", 'stageBefore', "vC".stage, 'stage', "vStage",
                            'tenantBefore', "vSync" ->> 'before', 'tenantStatus', "vSync" ->> 'after');
END $function$;

-- ---------------------------------------------------------------------------
-- 11. resellerPayoutCalculate(month): one DUE payout per active partner with commission in getResellerCommissions
--     (MRR × commission % of its current attributions), WHT 12% u/s 233, net = gross − WHT, and its statement lines.
--     Partners that already have the month are skipped; when every one has, PAYOUT_PERIOD_EXISTS. Returns the count.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Platform"."resellerPayoutCalculate"("pPeriodMonth" date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vMonth" date := date_trunc('month', "pPeriodMonth")::date;
  "vR"     record;
  "vLines" jsonb;
  "vWht"   numeric(18,2);
  "vCount" integer := 0;
  "vSkip"  integer := 0;
BEGIN
  FOR "vR" IN SELECT c.* FROM "Platform"."getResellerCommissions" c WHERE c.status = 'ACTIVE' AND c.tenants > 0 AND c."expectedCommission" > 0 ORDER BY c.name LOOP
    IF EXISTS (SELECT 1 FROM "Platform"."ResellerPayouts" po WHERE po."partnerId" = "vR"."partnerId" AND po."periodMonth" = "vMonth") THEN
      "vSkip" := "vSkip" + 1;
      CONTINUE;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'tenantId', t.id, 'tenantCode', t.code::text, 'tenantName', t."displayName", 'planCode', sp.code, 'planName', sp.name,
             'mrr', COALESCE(s."mrrAmount", 0), 'commissionPct', COALESCE(pt."commissionPctOverride", "vR"."commissionPct"),
             'commission', round(COALESCE(s."mrrAmount", 0) * COALESCE(pt."commissionPctOverride", "vR"."commissionPct") / 100, 2))
             ORDER BY t."displayName"), '[]'::jsonb)
      INTO "vLines"
      FROM "Platform"."ResellerTenants" pt
      JOIN "Platform"."Tenants" t ON t.id = pt."tenantId"
      LEFT JOIN "Platform"."Subscriptions" s ON s."tenantId" = pt."tenantId" AND s.status IN ('ACTIVE', 'PAST_DUE')
      LEFT JOIN "Platform"."SubscriptionPlans" sp ON sp.id = s."planId"
     WHERE pt."partnerId" = "vR"."partnerId" AND pt."endedOn" IS NULL;
    "vWht" := round("vR"."expectedCommission" * 12 / 100, 2);
    INSERT INTO "Platform"."ResellerPayouts" ("partnerId", "periodMonth", "tenantsCount", "sourcedMrr", "commissionPct", "grossAmount", "whtSection", "whtRate",
                                              "whtAmount", "netAmount", "statementLines", status)
    VALUES ("vR"."partnerId", "vMonth", "vR".tenants, "vR"."sourcedMrr", "vR"."commissionPct", "vR"."expectedCommission", '233', 12,
            "vWht", "vR"."expectedCommission" - "vWht", "vLines", 'DUE');
    "vCount" := "vCount" + 1;
  END LOOP;
  IF "vCount" = 0 AND "vSkip" > 0 THEN
    RAISE EXCEPTION 'Payouts for % are already calculated', to_char("vMonth", 'Mon YYYY')
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PAYOUT_PERIOD_EXISTS';
  END IF;
  RETURN "vCount";
END $function$;

-- ---------------------------------------------------------------------------
-- 12. FS-INV counter for the current year (getNextPlatformDocumentNo creates later years on first use).
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."PlatformDocumentCounters" ("docType", "periodKey", "nextValue")
VALUES ('FS-INV', to_char(CURRENT_DATE, 'YYYY'), 1)
ON CONFLICT ("docType", "periodKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 13. Error codes (Phase 41)
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('INVOICE_NOT_DRAFT',          409, 'BUSINESS_RULE', 'PLATFORM', 'Only a draft invoice can be changed or issued. Void it and issue a new one instead.', 'Edit / issue of an issued platform invoice', true, NULL),
  ('INVOICE_HAS_PAYMENTS',       409, 'BUSINESS_RULE', 'PLATFORM', 'This invoice has payments allocated. Refund them before voiding it.', 'Void of a platform invoice with paidAmount > 0', true, NULL),
  ('INVOICE_TOTALS_MISMATCH',    400, 'VALIDATION',    'PLATFORM', 'The invoice totals don''t match its lines and tax. Check the amounts.', 'Issue with gross <> sum(lines), or tax <> net × rate', true, NULL),
  ('INVOICE_NOT_PAYABLE',        409, 'BUSINESS_RULE', 'PLATFORM', 'Payments can only be recorded against an open or partially paid invoice.', 'Payment on a draft / paid / void / uncollectible invoice', true, NULL),
  ('INVOICE_NO_SUBSCRIPTION',    409, 'BUSINESS_RULE', 'PLATFORM', 'This company has no paid live subscription to invoice.', 'platformInvoiceGenerate without an ACTIVE / PAST_DUE / SUSPENDED subscription', true, NULL),
  ('COUPON_NOT_APPLICABLE',      400, 'VALIDATION',    'PLATFORM', 'This coupon can''t be applied to this company''s subscription.', 'Inactive, expired, capped, plan-restricted or new-customers-only coupon', true, NULL),
  ('PAYMENT_EXCEEDS_BALANCE',    409, 'BUSINESS_RULE', 'PLATFORM', 'The payment is more than the invoice''s balance.', 'Over-payment of a platform invoice', true, NULL),
  ('REFUND_EXCEEDS_PAID',        400, 'VALIDATION',    'PLATFORM', 'The refund is more than what is left of the payment.', 'Refund above amount − refundedAmount', true, NULL),
  ('PAYMENT_NOT_REFUNDABLE',     409, 'BUSINESS_RULE', 'PLATFORM', 'Only a succeeded payment can be refunded.', 'Refund of a pending / failed / fully refunded payment', true, NULL),
  ('DUNNING_CASE_CLOSED',        409, 'BUSINESS_RULE', 'PLATFORM', 'This dunning case is closed.', 'Action on a recovered / cancelled / written-off case', true, NULL),
  ('DUNNING_NO_ACTIVE_POLICY',   409, 'BUSINESS_RULE', 'PLATFORM', 'There is no active dunning policy. Activate one under Dunning & Collections first.', 'Opening a dunning case without an active policy', true, NULL),
  ('PAYOUT_ALREADY_PAID',        409, 'BUSINESS_RULE', 'PLATFORM', 'This payout is already paid (or cancelled).', 'Pay / cancel of a payout that is not DUE', true, NULL),
  ('PAYOUT_PERIOD_EXISTS',       409, 'CONFLICT',      'PLATFORM', 'Payouts for this month are already calculated.', 'resellerPayoutCalculate for a month every partner already has', true, NULL),
  ('RESELLER_TENANT_ATTRIBUTED', 409, 'CONFLICT',      'PLATFORM', 'This company is already attributed to another reseller. End that attribution first.', 'One partner per tenant (ResellerTenants.tenantId unique)', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 14. Lookup labels and tones of the billing statuses (template admin/invoices, admin/dunning, admin/partners).
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" l
   SET label = v.label, tone = v.tone
  FROM (VALUES
    ('PlatformInvoiceStatus', 'DRAFT', 'Draft', 'neutral'),
    ('PlatformInvoiceStatus', 'OPEN', 'Open', 'info'),
    ('PlatformInvoiceStatus', 'PARTIALLY_PAID', 'Partially paid', 'warn'),
    ('PlatformInvoiceStatus', 'PAID', 'Paid', 'good'),
    ('PlatformInvoiceStatus', 'VOID', 'Void', 'neutral'),
    ('PlatformInvoiceStatus', 'UNCOLLECTIBLE', 'Uncollectible', 'danger'),
    ('InvoiceKind', 'ADDON', 'Add-on', 'neutral'),
    ('LineKind', 'ADDON', 'Add-on', 'neutral'),
    ('PlatformPaymentStatus', 'PENDING', 'Pending', 'warn'),
    ('PlatformPaymentStatus', 'SUCCEEDED', 'Succeeded', 'good'),
    ('PlatformPaymentStatus', 'FAILED', 'Failed', 'danger'),
    ('PlatformPaymentStatus', 'REFUNDED', 'Refunded', 'neutral'),
    ('PlatformPaymentStatus', 'PARTIALLY_REFUNDED', 'Partially refunded', 'warn'),
    ('DunningCasePaymentMethod', 'JAZZCASH', 'JazzCash', 'neutral'),
    ('DunningCasePaymentMethod', 'RAAST', 'Raast', 'neutral'),
    ('DunningAttemptMethod', 'JAZZCASH', 'JazzCash', 'neutral'),
    ('DunningAttemptMethod', 'RAAST', 'Raast', 'neutral'),
    ('NextRetryMethod', 'JAZZCASH', 'JazzCash', 'neutral'),
    ('NextRetryMethod', 'RAAST', 'Raast', 'neutral'),
    ('DunningCaseStage', 'GRACE', 'Grace', 'info'),
    ('DunningCaseStage', 'READ_ONLY', 'Read-only', 'warn'),
    ('DunningCaseStage', 'SUSPENDED', 'Suspended', 'danger'),
    ('DunningCaseStage', 'COLLECTIONS', 'Collections', 'neutral'),
    ('DunningCaseStage', 'PROMISE', 'Promise', 'violet'),
    ('DunningCaseStage', 'RECOVERED', 'Recovered', 'good'),
    ('DunningCaseStage', 'CANCELLED', 'Cancelled', 'neutral'),
    ('DunningCaseStage', 'WRITTEN_OFF', 'Written off', 'danger'),
    ('DunningAttemptStatus', 'SCHEDULED', 'Scheduled', 'info'),
    ('DunningAttemptStatus', 'FAILED', 'Failed', 'danger'),
    ('DunningAttemptStatus', 'SUCCEEDED', 'Succeeded', 'good'),
    ('DunningAttemptStatus', 'SKIPPED', 'Skipped', 'neutral'),
    ('DunningAttemptStatus', 'CANCELLED', 'Cancelled', 'neutral'),
    ('PromiseSource', 'PHONE', 'Phone call with owner', 'neutral'),
    ('PromiseSource', 'WHATSAPP', 'WhatsApp message', 'neutral'),
    ('PromiseSource', 'EMAIL', 'Email reply', 'neutral'),
    ('PromiseSource', 'VISIT', 'Account manager visit', 'neutral'),
    ('ResellerPayoutStatus', 'DUE', 'Due', 'warn'),
    ('ResellerPayoutStatus', 'PAID', 'Paid', 'good'),
    ('ResellerPayoutStatus', 'CANCELLED', 'Cancelled', 'neutral')
  ) AS v("lookupType", code, label, tone)
 WHERE l."lookupType" = v."lookupType" AND l.code = v.code AND l."tenantId" IS NULL
   AND (l.label, l.tone) IS DISTINCT FROM (v.label, v.tone);
