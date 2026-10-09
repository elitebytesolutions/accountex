-- Phase 18 — Cash: row history on the two tables without it, expense-claim payment posting, locked cash days,
-- petty-cash and claim numbering, the default expense-claim approval workflow, error codes. Idempotent.
SELECT set_config('app.actorLabel', '024-cash.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Row history (ExpenseClaimActions stays append-only; the audit trigger records its inserts)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "cashDayCloseDenominationsAudit" ON "BankCash"."CashDayCloseDenominations";
CREATE TRIGGER "cashDayCloseDenominationsAudit" AFTER INSERT OR UPDATE OR DELETE ON "BankCash"."CashDayCloseDenominations"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "expenseClaimActionsAudit" ON "BankCash"."ExpenseClaimActions";
CREATE TRIGGER "expenseClaimActionsAudit" AFTER INSERT OR UPDATE OR DELETE ON "BankCash"."ExpenseClaimActions"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Paying an approved claim: CPV (cash) or BPV (bank), Dr employee claims payable / Cr cash or bank.
--    expenseClaimPay calls this before marking the claim PAID; the claim carries the payment method and account.
-- ---------------------------------------------------------------------------
ALTER TABLE "BankCash"."ExpenseClaims" ADD COLUMN IF NOT EXISTS "paymentCashAccountId" uuid;
COMMENT ON COLUMN "BankCash"."ExpenseClaims"."paymentCashAccountId" IS 'Cash account a CASH payment came from (bank payments use paymentBankAccountId)';

CREATE OR REPLACE FUNCTION "BankCash"."expenseClaimPayEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
AS $function$
DECLARE
  "c"      "BankCash"."ExpenseClaims";
  "vGl"    uuid;
  "vType"  text;
  "vName"  text;
  "vJe"    uuid;
  "vDate"  date;
BEGIN
  SELECT * INTO "c" FROM "BankCash"."ExpenseClaims" t WHERE t."tenantId" = "Company"."getCurrentTenantId"() AND t.id = "pId";
  IF "c"."paymentMethod" = 'BANK_TRANSFER' THEN
    "vGl" := "BankCash"."getBankGlAccount"("c"."paymentBankAccountId");
    "vType" := 'BPV';
  ELSIF "c"."paymentMethod" = 'CASH' THEN
    SELECT ca."accountId" INTO "vGl" FROM "BankCash"."CashAccounts" ca WHERE ca."tenantId" = "c"."tenantId" AND ca.id = "c"."paymentCashAccountId";
    IF "vGl" IS NULL THEN
      RAISE EXCEPTION 'Choose the cash account the claim is paid from' USING ERRCODE = 'check_violation';
    END IF;
    "vType" := 'CPV';
  ELSE
    RAISE EXCEPTION 'Claims are paid by cash or bank transfer for now (with payroll comes with payroll runs)' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(e."displayName", e."firstName" || ' ' || COALESCE(e."lastName", '')) INTO "vName"
    FROM "HumanResources"."Employees" e WHERE e."tenantId" = "c"."tenantId" AND e.id = "c"."employeeId";
  "vDate" := COALESCE(("c"."paidAt" AT TIME ZONE 'UTC')::date, CURRENT_DATE);
  "vJe" := "BankCash"."postBankingVoucher"("vType", "vDate", "c"."branchId",
             'Expense claim ' || "c"."docNo" || ' paid · ' || COALESCE("vName", ''), "vGl", "vName", NULL, NULL, 'EXP', "c".id, "c"."docNo",
             jsonb_build_array(
               jsonb_build_object('accountId', "Company"."getAccountForRole"('EMPLOYEE_CLAIMS_PAYABLE'), 'debit', COALESCE("c"."approvedAmount", "c"."totalAmount"), 'particulars', "c"."docNo" || ' · ' || "c".title),
               jsonb_build_object('accountId', "vGl", 'credit', COALESCE("c"."approvedAmount", "c"."totalAmount"), 'particulars', COALESCE("vName", "c"."docNo"), 'isAutoContra', true)));
  UPDATE "BankCash"."ExpenseClaims" SET "paymentJournalEntryId" = "vJe", "workflowStage" = 'PAID' WHERE "tenantId" = "c"."tenantId" AND id = "c".id;
END $function$;

-- ---------------------------------------------------------------------------
-- 3. A locked cash day: no voucher on that cash account and date can be posted (reopen the day first).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "BankCash"."triggerCashDayLockedPosting"()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  "vName" text;
BEGIN
  SELECT ca.name INTO "vName"
    FROM "Accounting"."VoucherLines" l
    JOIN "BankCash"."CashAccounts" ca ON ca."tenantId" = l."tenantId" AND ca."accountId" = l."accountId"
    JOIN "BankCash"."CashDayCloses" d ON d."tenantId" = ca."tenantId" AND d."cashAccountId" = ca.id AND d."closeDate" = NEW."postingDate" AND d.status = 'LOCKED'
   WHERE l."tenantId" = NEW."tenantId" AND l."journalEntryId" = NEW.id
   LIMIT 1;
  IF "vName" IS NOT NULL THEN
    RAISE EXCEPTION 'The cash day % of % is closed; reopen it before posting', NEW."postingDate", "vName"
      USING ERRCODE = 'check_violation', HINT = 'CASH_DAY_LOCKED';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS "vouchersCashDayLocked" ON "Accounting"."Vouchers";
CREATE TRIGGER "vouchersCashDayLocked" BEFORE UPDATE OF status ON "Accounting"."Vouchers"
  FOR EACH ROW WHEN (NEW.status = 'POSTED' AND OLD.status IS DISTINCT FROM 'POSTED')
  EXECUTE FUNCTION "BankCash"."triggerCashDayLockedPosting"();

-- ---------------------------------------------------------------------------
-- 4. Every company: PCV and EXP numbering and the default "Expense claims" workflow (line manager, then finance).
--    Both editable afterwards; nothing is replaced once it exists.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "BankCash"."seedCashDefaultsFor"("pTenant" uuid)
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
   WHERE d.code IN ('PCV', 'EXP')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;

  IF NOT EXISTS (SELECT 1 FROM "Company"."ApprovalWorkflows" w WHERE w."tenantId" = "pTenant" AND w.subject = 'EXPENSE_CLAIM' AND w."deletedAt" IS NULL) THEN
    SELECT r.id INTO "vRole" FROM "Company"."Roles" r WHERE r."tenantId" = "pTenant" AND r."systemKey" = 'FINANCIAL_ACCOUNTANT' LIMIT 1;
    IF "vRole" IS NOT NULL THEN
      INSERT INTO "Company"."ApprovalWorkflows" ("tenantId", name, subject, description, status, version, priority, "onComplete", "onReject",
                                                "notifyPreparer", "notifyInApp", "notifyEmail", "notifyWhatsapp", "publishedAt")
      VALUES ("pTenant", 'Expense claims', 'EXPENSE_CLAIM', 'Default: the employee''s line manager, then finance. Edit as needed.', 'ACTIVE', 1, 100,
              'MARK_APPROVED', 'RETURN_TO_PREPARER', true, true, false, false, now())
      RETURNING id INTO "vWf";
      INSERT INTO "Company"."ApprovalWorkflowSteps" ("tenantId", "workflowId", "stepNo", name, "approverType", "approverRoleId", "slaHours", "onSlaBreach",
                                                    "approvalMode", "blockSelfApproval", "allowDelegation", "requireComment")
      VALUES ("pTenant", "vWf", 1, 'Line manager', 'LINE_MANAGER', NULL, 48, 'REMIND', 'ANY', true, true, false),
             ("pTenant", "vWf", 2, 'Finance', 'ROLE', "vRole", 48, 'REMIND', 'ANY', true, true, false);
      "vN" := "vN" + 1;
    END IF;
  END IF;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "BankCash"."triggerTenantCashDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "BankCash"."seedCashDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

-- after the tenant's roles exist (provisionTenant creates them in the same transaction): deferred to the end of it
DROP TRIGGER IF EXISTS "tenantsCashDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsCashDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "BankCash"."triggerTenantCashDefaults"();

SELECT set_config('app.actorLabel', 'seedCashDefaultsFor', false);
SELECT "BankCash"."seedCashDefaultsFor"(t.id) FROM "Platform"."Tenants" t;

-- ---------------------------------------------------------------------------
-- 5. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('CASH_DAY_LOCKED',            409, 'BUSINESS_RULE', 'FINANCE', 'That cash day is closed. Reopen it before posting to it.', 'Posting into a locked cash day', true, NULL),
  ('CASH_INSUFFICIENT',          400, 'BUSINESS_RULE', 'FINANCE', 'The amount is more than the cash available in that account.', 'Cash out above the balance', true, NULL),
  ('CASH_VARIANCE_APPROVAL',     403, 'PERMISSION',    'FINANCE', 'This cash count is outside the allowed variance; someone with cash approval must close the day.', 'Variance beyond tolerance', true, NULL),
  ('PETTY_FUND_SHORT',           400, 'BUSINESS_RULE', 'FINANCE', 'The petty cash fund doesn''t have that much cash. Top it up first.', 'Petty voucher above the fund''s cash', true, NULL),
  ('CLAIM_NOT_EDITABLE',         409, 'BUSINESS_RULE', 'FINANCE', 'Only a draft or returned claim can be changed.', 'Edit of a submitted claim', true, NULL),
  ('CLAIM_POLICY_JUSTIFICATION', 400, 'VALIDATION',    'FINANCE', 'This claim is over the policy limit; add a justification.', 'Over-policy claim without justification', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
