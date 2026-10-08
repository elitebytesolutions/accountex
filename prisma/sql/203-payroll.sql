-- 203-payroll.sql
-- Phase 32 — Payroll: run lifecycle (calculate → review → approval → post → pay → reverse), loans & advances,
-- payslips and tax declarations. Fixes the defects of the generated functions (posting without approval, regular runs
-- numbered as off-cycle, missing PRUN / PS / LN / ADV numbering, taxDeclarationApprove never setting verifiedAt,
-- loanApprove / loanDisburse / loan closing), adds the salary payment (bank / cash voucher), the loan schedule, the
-- attendance hand-over to payroll, row history on PayrollRunBranches, the default PAYROLL_RUN and LOAN approval
-- workflows for every company, error codes and lookup tones.
-- The database calculates nothing: the app computes every line (Phase 12 computeLines / evalFormula / taxOn).
-- Idempotent: safe to run repeatedly via npm run db:sql.
SELECT set_config('app.actorLabel', '203-payroll.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Row history: PayrollRunBranches was the only payroll table without it.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "payrollRunBranchesAudit" ON "Payroll"."PayrollRunBranches";
CREATE TRIGGER "payrollRunBranchesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Payroll"."PayrollRunBranches"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Numbering. Regular runs are PR-YYYY-MM (a re-run after a cancelled / rejected / reversed run gets -R2, -R3 …);
--    off-cycle and bonus runs use the PRUN series (PR-YYYY-OFF-NN). payrollRunAddUpdate numbered every run with PRUN.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Payroll"."getNextPayrollRunNo"("pRunType" text, "pPayrollMonth" date)
  RETURNS text
  LANGUAGE plpgsql
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vBase"   text;
  "vNo"     text;
  "vN"      int := 1;
BEGIN
  IF "pRunType" = 'REGULAR' THEN
    "vBase" := 'PR-' || to_char("pPayrollMonth", 'YYYY-MM');
    "vNo" := "vBase";
    WHILE EXISTS (SELECT 1 FROM "Payroll"."PayrollRuns" r WHERE r."tenantId" = "vTenant" AND r."docNo" = "vNo") LOOP
      "vN" := "vN" + 1;
      "vNo" := "vBase" || '-R' || "vN";
    END LOOP;
    RETURN "vNo";
  ELSIF "pRunType" IN ('OFF_CYCLE', 'BONUS_ONLY') THEN
    RETURN "Company"."getNextDocNo"('PRUN', "pPayrollMonth", NULL);
  END IF;
  RAISE EXCEPTION 'Unknown payroll run type %', "pRunType" USING ERRCODE = 'check_violation';
END $function$;

COMMENT ON FUNCTION "Payroll"."getNextPayrollRunNo"("pRunType" text, "pPayrollMonth" date) IS
  'PR-YYYY-MM for regular runs (-R2, -R3 … for a re-run of the month); PRUN sequence (PR-YYYY-OFF-NN) for off-cycle and bonus runs.';

-- payrollRunAddUpdate: numbered with getNextPayrollRunNo; header, adjustments and lines editable while DRAFT or REVIEW
-- (the guard trigger already allows child rows in both states).
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunAddUpdate"("pData" jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Payroll"."PayrollRuns";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1PayrollAdjustments" "Payroll"."PayrollAdjustments";
  "vC1PayrollRunBranches" "Payroll"."PayrollRunBranches";
  "vC1PayrollRunChecklistItems" "Payroll"."PayrollRunChecklistItems";
  "vC1PayrollRunLines" "Payroll"."PayrollRunLines";
  "vC1SalaryPaymentBatches" "Payroll"."SalaryPaymentBatches";
  "vC2PayrollRunLineComponents" "Payroll"."PayrollRunLineComponents";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
  "vE2" jsonb;  "vO2" bigint;  "vCid2" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Payroll"."PayrollRuns", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Payroll"."getNextPayrollRunNo"(COALESCE("vRec"."runType", 'REGULAR'), "vRec"."payrollMonth");
    END IF;
    INSERT INTO "Payroll"."PayrollRuns" ("tenantId", "docNo", "runType", "payrollMonth", "periodFrom", "periodTo", "payDate", "attendanceCutoffDate", "payGroupId", "salaryPayableAccountId", "includeNoticePeriod", "includeExited", "workingDays", "publicHolidays", "employeeCount", "grossAmount", "taxAmount", "eobiEmployeeAmount", "pfEmployeeAmount", "loanAmount", "deductionAmount", "netAmount", "employerContributionAmount", "wizardStep", "inputsFrozenAt", "calculatedAt", "preparedByUserId", "preparedAt", "checkedByUserId", "checkedAt", "approvalRequestId", "paidAt", "fiscalPeriodId", "emailPayslips", "publishToEss", "smsNetPayAlert", "createDepositReminders", narration, remarks)
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'runType' THEN "vRec"."runType" ELSE 'REGULAR' END, CASE WHEN "pData" ? 'payrollMonth' THEN "vRec"."payrollMonth" ELSE NULL END, CASE WHEN "pData" ? 'periodFrom' THEN "vRec"."periodFrom" ELSE NULL END, CASE WHEN "pData" ? 'periodTo' THEN "vRec"."periodTo" ELSE NULL END, CASE WHEN "pData" ? 'payDate' THEN "vRec"."payDate" ELSE NULL END, CASE WHEN "pData" ? 'attendanceCutoffDate' THEN "vRec"."attendanceCutoffDate" ELSE NULL END, CASE WHEN "pData" ? 'payGroupId' THEN "vRec"."payGroupId" ELSE NULL END, CASE WHEN "pData" ? 'salaryPayableAccountId' THEN "vRec"."salaryPayableAccountId" ELSE NULL END, CASE WHEN "pData" ? 'includeNoticePeriod' THEN "vRec"."includeNoticePeriod" ELSE TRUE END, CASE WHEN "pData" ? 'includeExited' THEN "vRec"."includeExited" ELSE FALSE END, CASE WHEN "pData" ? 'workingDays' THEN "vRec"."workingDays" ELSE NULL END, CASE WHEN "pData" ? 'publicHolidays' THEN "vRec"."publicHolidays" ELSE NULL END, CASE WHEN "pData" ? 'employeeCount' THEN "vRec"."employeeCount" ELSE 0 END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE 0 END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'eobiEmployeeAmount' THEN "vRec"."eobiEmployeeAmount" ELSE 0 END, CASE WHEN "pData" ? 'pfEmployeeAmount' THEN "vRec"."pfEmployeeAmount" ELSE 0 END, CASE WHEN "pData" ? 'loanAmount' THEN "vRec"."loanAmount" ELSE 0 END, CASE WHEN "pData" ? 'deductionAmount' THEN "vRec"."deductionAmount" ELSE 0 END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE 0 END, CASE WHEN "pData" ? 'employerContributionAmount' THEN "vRec"."employerContributionAmount" ELSE 0 END, CASE WHEN "pData" ? 'wizardStep' THEN "vRec"."wizardStep" ELSE 1 END, CASE WHEN "pData" ? 'inputsFrozenAt' THEN "vRec"."inputsFrozenAt" ELSE NULL END, CASE WHEN "pData" ? 'calculatedAt' THEN "vRec"."calculatedAt" ELSE NULL END, CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'preparedAt' THEN "vRec"."preparedAt" ELSE NULL END, CASE WHEN "pData" ? 'checkedByUserId' THEN "vRec"."checkedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'checkedAt' THEN "vRec"."checkedAt" ELSE NULL END, CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE NULL END, CASE WHEN "pData" ? 'paidAt' THEN "vRec"."paidAt" ELSE NULL END, CASE WHEN "pData" ? 'fiscalPeriodId' THEN "vRec"."fiscalPeriodId" ELSE NULL END, CASE WHEN "pData" ? 'emailPayslips' THEN "vRec"."emailPayslips" ELSE TRUE END, CASE WHEN "pData" ? 'publishToEss' THEN "vRec"."publishToEss" ELSE TRUE END, CASE WHEN "pData" ? 'smsNetPayAlert' THEN "vRec"."smsNetPayAlert" ELSE FALSE END, CASE WHEN "pData" ? 'createDepositReminders' THEN "vRec"."createDepositReminders" ELSE TRUE END, CASE WHEN "pData" ? 'narration' THEN "vRec".narration ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Payroll"."PayrollRuns" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS NULL OR "vStatus" NOT IN ('DRAFT', 'REVIEW') THEN
      RAISE EXCEPTION 'PayrollRuns: only DRAFT or REVIEW runs can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Payroll"."PayrollRuns" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "runType" = CASE WHEN "pData" ? 'runType' THEN "vRec"."runType" ELSE t."runType" END,
           "payrollMonth" = CASE WHEN "pData" ? 'payrollMonth' THEN "vRec"."payrollMonth" ELSE t."payrollMonth" END,
           "periodFrom" = CASE WHEN "pData" ? 'periodFrom' THEN "vRec"."periodFrom" ELSE t."periodFrom" END,
           "periodTo" = CASE WHEN "pData" ? 'periodTo' THEN "vRec"."periodTo" ELSE t."periodTo" END,
           "payDate" = CASE WHEN "pData" ? 'payDate' THEN "vRec"."payDate" ELSE t."payDate" END,
           "attendanceCutoffDate" = CASE WHEN "pData" ? 'attendanceCutoffDate' THEN "vRec"."attendanceCutoffDate" ELSE t."attendanceCutoffDate" END,
           "payGroupId" = CASE WHEN "pData" ? 'payGroupId' THEN "vRec"."payGroupId" ELSE t."payGroupId" END,
           "salaryPayableAccountId" = CASE WHEN "pData" ? 'salaryPayableAccountId' THEN "vRec"."salaryPayableAccountId" ELSE t."salaryPayableAccountId" END,
           "includeNoticePeriod" = CASE WHEN "pData" ? 'includeNoticePeriod' THEN "vRec"."includeNoticePeriod" ELSE t."includeNoticePeriod" END,
           "includeExited" = CASE WHEN "pData" ? 'includeExited' THEN "vRec"."includeExited" ELSE t."includeExited" END,
           "workingDays" = CASE WHEN "pData" ? 'workingDays' THEN "vRec"."workingDays" ELSE t."workingDays" END,
           "publicHolidays" = CASE WHEN "pData" ? 'publicHolidays' THEN "vRec"."publicHolidays" ELSE t."publicHolidays" END,
           "employeeCount" = CASE WHEN "pData" ? 'employeeCount' THEN "vRec"."employeeCount" ELSE t."employeeCount" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "eobiEmployeeAmount" = CASE WHEN "pData" ? 'eobiEmployeeAmount' THEN "vRec"."eobiEmployeeAmount" ELSE t."eobiEmployeeAmount" END,
           "pfEmployeeAmount" = CASE WHEN "pData" ? 'pfEmployeeAmount' THEN "vRec"."pfEmployeeAmount" ELSE t."pfEmployeeAmount" END,
           "loanAmount" = CASE WHEN "pData" ? 'loanAmount' THEN "vRec"."loanAmount" ELSE t."loanAmount" END,
           "deductionAmount" = CASE WHEN "pData" ? 'deductionAmount' THEN "vRec"."deductionAmount" ELSE t."deductionAmount" END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "employerContributionAmount" = CASE WHEN "pData" ? 'employerContributionAmount' THEN "vRec"."employerContributionAmount" ELSE t."employerContributionAmount" END,
           "wizardStep" = CASE WHEN "pData" ? 'wizardStep' THEN "vRec"."wizardStep" ELSE t."wizardStep" END,
           "inputsFrozenAt" = CASE WHEN "pData" ? 'inputsFrozenAt' THEN "vRec"."inputsFrozenAt" ELSE t."inputsFrozenAt" END,
           "calculatedAt" = CASE WHEN "pData" ? 'calculatedAt' THEN "vRec"."calculatedAt" ELSE t."calculatedAt" END,
           "preparedByUserId" = CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE t."preparedByUserId" END,
           "preparedAt" = CASE WHEN "pData" ? 'preparedAt' THEN "vRec"."preparedAt" ELSE t."preparedAt" END,
           "checkedByUserId" = CASE WHEN "pData" ? 'checkedByUserId' THEN "vRec"."checkedByUserId" ELSE t."checkedByUserId" END,
           "checkedAt" = CASE WHEN "pData" ? 'checkedAt' THEN "vRec"."checkedAt" ELSE t."checkedAt" END,
           "approvalRequestId" = CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE t."approvalRequestId" END,
           "paidAt" = CASE WHEN "pData" ? 'paidAt' THEN "vRec"."paidAt" ELSE t."paidAt" END,
           "fiscalPeriodId" = CASE WHEN "pData" ? 'fiscalPeriodId' THEN "vRec"."fiscalPeriodId" ELSE t."fiscalPeriodId" END,
           "emailPayslips" = CASE WHEN "pData" ? 'emailPayslips' THEN "vRec"."emailPayslips" ELSE t."emailPayslips" END,
           "publishToEss" = CASE WHEN "pData" ? 'publishToEss' THEN "vRec"."publishToEss" ELSE t."publishToEss" END,
           "smsNetPayAlert" = CASE WHEN "pData" ? 'smsNetPayAlert' THEN "vRec"."smsNetPayAlert" ELSE t."smsNetPayAlert" END,
           "createDepositReminders" = CASE WHEN "pData" ? 'createDepositReminders' THEN "vRec"."createDepositReminders" ELSE t."createDepositReminders" END,
           narration = CASE WHEN "pData" ? 'narration' THEN "vRec".narration ELSE t.narration END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Payroll"."PayrollRuns" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PayrollRuns %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PayrollRuns % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'paymentBatches' THEN
    -- paymentBatches: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."SalaryPaymentBatches"
     WHERE "tenantId" = "vTenant" AND "payrollRunId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'paymentBatches') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'paymentBatches') WITH ORDINALITY t(x, n) LOOP
      "vC1SalaryPaymentBatches" := jsonb_populate_record(NULL::"Payroll"."SalaryPaymentBatches", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Payroll"."SalaryPaymentBatches" t
           SET "paymentMethod" = CASE WHEN "vE1" ? 'paymentMethod' THEN "vC1SalaryPaymentBatches"."paymentMethod" ELSE t."paymentMethod" END,
               "bankAccountId" = CASE WHEN "vE1" ? 'bankAccountId' THEN "vC1SalaryPaymentBatches"."bankAccountId" ELSE t."bankAccountId" END,
               "fileFormat" = CASE WHEN "vE1" ? 'fileFormat' THEN "vC1SalaryPaymentBatches"."fileFormat" ELSE t."fileFormat" END,
               "employeeCount" = CASE WHEN "vE1" ? 'employeeCount' THEN "vC1SalaryPaymentBatches"."employeeCount" ELSE t."employeeCount" END,
               "totalAmount" = CASE WHEN "vE1" ? 'totalAmount' THEN "vC1SalaryPaymentBatches"."totalAmount" ELSE t."totalAmount" END,
               "instructionRef" = CASE WHEN "vE1" ? 'instructionRef' THEN "vC1SalaryPaymentBatches"."instructionRef" ELSE t."instructionRef" END,
               "valueDate" = CASE WHEN "vE1" ? 'valueDate' THEN "vC1SalaryPaymentBatches"."valueDate" ELSE t."valueDate" END,
               "fileAttachmentId" = CASE WHEN "vE1" ? 'fileAttachmentId' THEN "vC1SalaryPaymentBatches"."fileAttachmentId" ELSE t."fileAttachmentId" END,
               "adviceAttachmentId" = CASE WHEN "vE1" ? 'adviceAttachmentId' THEN "vC1SalaryPaymentBatches"."adviceAttachmentId" ELSE t."adviceAttachmentId" END,
               "generatedAt" = CASE WHEN "vE1" ? 'generatedAt' THEN "vC1SalaryPaymentBatches"."generatedAt" ELSE t."generatedAt" END,
               "sentAt" = CASE WHEN "vE1" ? 'sentAt' THEN "vC1SalaryPaymentBatches"."sentAt" ELSE t."sentAt" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1SalaryPaymentBatches".status ELSE t.status END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."payrollRunId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SalaryPaymentBatches: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."SalaryPaymentBatches" ("payrollRunId", "tenantId", "paymentMethod", "bankAccountId", "fileFormat", "employeeCount", "totalAmount", "instructionRef", "valueDate", "fileAttachmentId", "adviceAttachmentId", "generatedAt", "sentAt", status)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'paymentMethod' THEN "vC1SalaryPaymentBatches"."paymentMethod" ELSE NULL END, CASE WHEN "vE1" ? 'bankAccountId' THEN "vC1SalaryPaymentBatches"."bankAccountId" ELSE NULL END, CASE WHEN "vE1" ? 'fileFormat' THEN "vC1SalaryPaymentBatches"."fileFormat" ELSE NULL END, CASE WHEN "vE1" ? 'employeeCount' THEN "vC1SalaryPaymentBatches"."employeeCount" ELSE 0 END, CASE WHEN "vE1" ? 'totalAmount' THEN "vC1SalaryPaymentBatches"."totalAmount" ELSE 0 END, CASE WHEN "vE1" ? 'instructionRef' THEN "vC1SalaryPaymentBatches"."instructionRef" ELSE NULL END, CASE WHEN "vE1" ? 'valueDate' THEN "vC1SalaryPaymentBatches"."valueDate" ELSE NULL END, CASE WHEN "vE1" ? 'fileAttachmentId' THEN "vC1SalaryPaymentBatches"."fileAttachmentId" ELSE NULL END, CASE WHEN "vE1" ? 'adviceAttachmentId' THEN "vC1SalaryPaymentBatches"."adviceAttachmentId" ELSE NULL END, CASE WHEN "vE1" ? 'generatedAt' THEN "vC1SalaryPaymentBatches"."generatedAt" ELSE NULL END, CASE WHEN "vE1" ? 'sentAt' THEN "vC1SalaryPaymentBatches"."sentAt" ELSE NULL END, CASE WHEN "vE1" ? 'status' THEN "vC1SalaryPaymentBatches".status ELSE 'DRAFT' END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'adjustments' THEN
    -- adjustments: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."PayrollAdjustments"
     WHERE "tenantId" = "vTenant" AND "payrollRunId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'adjustments') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'adjustments') WITH ORDINALITY t(x, n) LOOP
      "vC1PayrollAdjustments" := jsonb_populate_record(NULL::"Payroll"."PayrollAdjustments", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Payroll"."PayrollAdjustments" t
           SET "employeeId" = CASE WHEN "vE1" ? 'employeeId' THEN "vC1PayrollAdjustments"."employeeId" ELSE t."employeeId" END,
               "componentId" = CASE WHEN "vE1" ? 'componentId' THEN "vC1PayrollAdjustments"."componentId" ELSE t."componentId" END,
               "inputSource" = CASE WHEN "vE1" ? 'inputSource' THEN "vC1PayrollAdjustments"."inputSource" ELSE t."inputSource" END,
               quantity = CASE WHEN "vE1" ? 'quantity' THEN "vC1PayrollAdjustments".quantity ELSE t.quantity END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1PayrollAdjustments".amount ELSE t.amount END,
               "isTaxable" = CASE WHEN "vE1" ? 'isTaxable' THEN "vC1PayrollAdjustments"."isTaxable" ELSE t."isTaxable" END,
               remarks = CASE WHEN "vE1" ? 'remarks' THEN "vC1PayrollAdjustments".remarks ELSE t.remarks END,
               "sourceDocType" = CASE WHEN "vE1" ? 'sourceDocType' THEN "vC1PayrollAdjustments"."sourceDocType" ELSE t."sourceDocType" END,
               "sourceDocId" = CASE WHEN "vE1" ? 'sourceDocId' THEN "vC1PayrollAdjustments"."sourceDocId" ELSE t."sourceDocId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."payrollRunId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PayrollAdjustments: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."PayrollAdjustments" ("payrollRunId", "tenantId", "employeeId", "componentId", "inputSource", quantity, amount, "isTaxable", remarks, "sourceDocType", "sourceDocId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'employeeId' THEN "vC1PayrollAdjustments"."employeeId" ELSE NULL END, CASE WHEN "vE1" ? 'componentId' THEN "vC1PayrollAdjustments"."componentId" ELSE NULL END, CASE WHEN "vE1" ? 'inputSource' THEN "vC1PayrollAdjustments"."inputSource" ELSE 'MANUAL' END, CASE WHEN "vE1" ? 'quantity' THEN "vC1PayrollAdjustments".quantity ELSE NULL END, CASE WHEN "vE1" ? 'amount' THEN "vC1PayrollAdjustments".amount ELSE NULL END, CASE WHEN "vE1" ? 'isTaxable' THEN "vC1PayrollAdjustments"."isTaxable" ELSE TRUE END, CASE WHEN "vE1" ? 'remarks' THEN "vC1PayrollAdjustments".remarks ELSE NULL END, CASE WHEN "vE1" ? 'sourceDocType' THEN "vC1PayrollAdjustments"."sourceDocType" ELSE NULL END, CASE WHEN "vE1" ? 'sourceDocId' THEN "vC1PayrollAdjustments"."sourceDocId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."PayrollRunLines"
     WHERE "tenantId" = "vTenant" AND "payrollRunId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1PayrollRunLines" := jsonb_populate_record(NULL::"Payroll"."PayrollRunLines", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Payroll"."PayrollRunLines" t
           SET "employeeId" = CASE WHEN "vE1" ? 'employeeId' THEN "vC1PayrollRunLines"."employeeId" ELSE t."employeeId" END,
               "employeeSalaryId" = CASE WHEN "vE1" ? 'employeeSalaryId' THEN "vC1PayrollRunLines"."employeeSalaryId" ELSE t."employeeSalaryId" END,
               "branchId" = CASE WHEN "vE1" ? 'branchId' THEN "vC1PayrollRunLines"."branchId" ELSE t."branchId" END,
               "departmentId" = CASE WHEN "vE1" ? 'departmentId' THEN "vC1PayrollRunLines"."departmentId" ELSE t."departmentId" END,
               "gradeId" = CASE WHEN "vE1" ? 'gradeId' THEN "vC1PayrollRunLines"."gradeId" ELSE t."gradeId" END,
               "costCentreId" = CASE WHEN "vE1" ? 'costCentreId' THEN "vC1PayrollRunLines"."costCentreId" ELSE t."costCentreId" END,
               "structureId" = CASE WHEN "vE1" ? 'structureId' THEN "vC1PayrollRunLines"."structureId" ELSE t."structureId" END,
               "daysInMonth" = CASE WHEN "vE1" ? 'daysInMonth' THEN "vC1PayrollRunLines"."daysInMonth" ELSE t."daysInMonth" END,
               "paidDays" = CASE WHEN "vE1" ? 'paidDays' THEN "vC1PayrollRunLines"."paidDays" ELSE t."paidDays" END,
               "lwpDays" = CASE WHEN "vE1" ? 'lwpDays' THEN "vC1PayrollRunLines"."lwpDays" ELSE t."lwpDays" END,
               "leaveTakenDays" = CASE WHEN "vE1" ? 'leaveTakenDays' THEN "vC1PayrollRunLines"."leaveTakenDays" ELSE t."leaveTakenDays" END,
               "overtimeHours" = CASE WHEN "vE1" ? 'overtimeHours' THEN "vC1PayrollRunLines"."overtimeHours" ELSE t."overtimeHours" END,
               "basicAmount" = CASE WHEN "vE1" ? 'basicAmount' THEN "vC1PayrollRunLines"."basicAmount" ELSE t."basicAmount" END,
               "allowanceAmount" = CASE WHEN "vE1" ? 'allowanceAmount' THEN "vC1PayrollRunLines"."allowanceAmount" ELSE t."allowanceAmount" END,
               "grossAmount" = CASE WHEN "vE1" ? 'grossAmount' THEN "vC1PayrollRunLines"."grossAmount" ELSE t."grossAmount" END,
               "taxAmount" = CASE WHEN "vE1" ? 'taxAmount' THEN "vC1PayrollRunLines"."taxAmount" ELSE t."taxAmount" END,
               "eobiAmount" = CASE WHEN "vE1" ? 'eobiAmount' THEN "vC1PayrollRunLines"."eobiAmount" ELSE t."eobiAmount" END,
               "pfAmount" = CASE WHEN "vE1" ? 'pfAmount' THEN "vC1PayrollRunLines"."pfAmount" ELSE t."pfAmount" END,
               "loanAmount" = CASE WHEN "vE1" ? 'loanAmount' THEN "vC1PayrollRunLines"."loanAmount" ELSE t."loanAmount" END,
               "otherDeductionAmount" = CASE WHEN "vE1" ? 'otherDeductionAmount' THEN "vC1PayrollRunLines"."otherDeductionAmount" ELSE t."otherDeductionAmount" END,
               "deductionAmount" = CASE WHEN "vE1" ? 'deductionAmount' THEN "vC1PayrollRunLines"."deductionAmount" ELSE t."deductionAmount" END,
               "netAmount" = CASE WHEN "vE1" ? 'netAmount' THEN "vC1PayrollRunLines"."netAmount" ELSE t."netAmount" END,
               "employerEobiAmount" = CASE WHEN "vE1" ? 'employerEobiAmount' THEN "vC1PayrollRunLines"."employerEobiAmount" ELSE t."employerEobiAmount" END,
               "employerPessiAmount" = CASE WHEN "vE1" ? 'employerPessiAmount' THEN "vC1PayrollRunLines"."employerPessiAmount" ELSE t."employerPessiAmount" END,
               "employerPfAmount" = CASE WHEN "vE1" ? 'employerPfAmount' THEN "vC1PayrollRunLines"."employerPfAmount" ELSE t."employerPfAmount" END,
               "gratuityProvisionAmount" = CASE WHEN "vE1" ? 'gratuityProvisionAmount' THEN "vC1PayrollRunLines"."gratuityProvisionAmount" ELSE t."gratuityProvisionAmount" END,
               "taxStatus" = CASE WHEN "vE1" ? 'taxStatus' THEN "vC1PayrollRunLines"."taxStatus" ELSE t."taxStatus" END,
               "projectedAnnualSalary" = CASE WHEN "vE1" ? 'projectedAnnualSalary' THEN "vC1PayrollRunLines"."projectedAnnualSalary" ELSE t."projectedAnnualSalary" END,
               "annualExemptAmount" = CASE WHEN "vE1" ? 'annualExemptAmount' THEN "vC1PayrollRunLines"."annualExemptAmount" ELSE t."annualExemptAmount" END,
               "annualTaxableIncome" = CASE WHEN "vE1" ? 'annualTaxableIncome' THEN "vC1PayrollRunLines"."annualTaxableIncome" ELSE t."annualTaxableIncome" END,
               "annualTaxLiability" = CASE WHEN "vE1" ? 'annualTaxLiability' THEN "vC1PayrollRunLines"."annualTaxLiability" ELSE t."annualTaxLiability" END,
               "taxSlabId" = CASE WHEN "vE1" ? 'taxSlabId' THEN "vC1PayrollRunLines"."taxSlabId" ELSE t."taxSlabId" END,
               "prevNetAmount" = CASE WHEN "vE1" ? 'prevNetAmount' THEN "vC1PayrollRunLines"."prevNetAmount" ELSE t."prevNetAmount" END,
               "variancePct" = CASE WHEN "vE1" ? 'variancePct' THEN "vC1PayrollRunLines"."variancePct" ELSE t."variancePct" END,
               "isNewJoiner" = CASE WHEN "vE1" ? 'isNewJoiner' THEN "vC1PayrollRunLines"."isNewJoiner" ELSE t."isNewJoiner" END,
               "isRevised" = CASE WHEN "vE1" ? 'isRevised' THEN "vC1PayrollRunLines"."isRevised" ELSE t."isRevised" END,
               flags = CASE WHEN "vE1" ? 'flags' THEN "vC1PayrollRunLines".flags ELSE t.flags END,
               "varianceExplanation" = CASE WHEN "vE1" ? 'varianceExplanation' THEN "vC1PayrollRunLines"."varianceExplanation" ELSE t."varianceExplanation" END,
               "payMode" = CASE WHEN "vE1" ? 'payMode' THEN "vC1PayrollRunLines"."payMode" ELSE t."payMode" END,
               "bankName" = CASE WHEN "vE1" ? 'bankName' THEN "vC1PayrollRunLines"."bankName" ELSE t."bankName" END,
               "ibanMasked" = CASE WHEN "vE1" ? 'ibanMasked' THEN "vC1PayrollRunLines"."ibanMasked" ELSE t."ibanMasked" END,
               "paymentBatchId" = CASE WHEN "vE1" ? 'paymentBatchId' THEN "vC1PayrollRunLines"."paymentBatchId" ELSE t."paymentBatchId" END,
               "paymentRef" = CASE WHEN "vE1" ? 'paymentRef' THEN "vC1PayrollRunLines"."paymentRef" ELSE t."paymentRef" END,
               "isOnHold" = CASE WHEN "vE1" ? 'isOnHold' THEN "vC1PayrollRunLines"."isOnHold" ELSE t."isOnHold" END,
               "holdReason" = CASE WHEN "vE1" ? 'holdReason' THEN "vC1PayrollRunLines"."holdReason" ELSE t."holdReason" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."payrollRunId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PayrollRunLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."PayrollRunLines" ("payrollRunId", "tenantId", "employeeId", "employeeSalaryId", "branchId", "departmentId", "gradeId", "costCentreId", "structureId", "daysInMonth", "paidDays", "lwpDays", "leaveTakenDays", "overtimeHours", "basicAmount", "allowanceAmount", "grossAmount", "taxAmount", "eobiAmount", "pfAmount", "loanAmount", "otherDeductionAmount", "deductionAmount", "netAmount", "employerEobiAmount", "employerPessiAmount", "employerPfAmount", "gratuityProvisionAmount", "taxStatus", "projectedAnnualSalary", "annualExemptAmount", "annualTaxableIncome", "annualTaxLiability", "taxSlabId", "prevNetAmount", "variancePct", "isNewJoiner", "isRevised", flags, "varianceExplanation", "payMode", "bankName", "ibanMasked", "paymentBatchId", "paymentRef", "isOnHold", "holdReason")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'employeeId' THEN "vC1PayrollRunLines"."employeeId" ELSE NULL END, CASE WHEN "vE1" ? 'employeeSalaryId' THEN "vC1PayrollRunLines"."employeeSalaryId" ELSE NULL END, CASE WHEN "vE1" ? 'branchId' THEN "vC1PayrollRunLines"."branchId" ELSE NULL END, CASE WHEN "vE1" ? 'departmentId' THEN "vC1PayrollRunLines"."departmentId" ELSE NULL END, CASE WHEN "vE1" ? 'gradeId' THEN "vC1PayrollRunLines"."gradeId" ELSE NULL END, CASE WHEN "vE1" ? 'costCentreId' THEN "vC1PayrollRunLines"."costCentreId" ELSE NULL END, CASE WHEN "vE1" ? 'structureId' THEN "vC1PayrollRunLines"."structureId" ELSE NULL END, CASE WHEN "vE1" ? 'daysInMonth' THEN "vC1PayrollRunLines"."daysInMonth" ELSE NULL END, CASE WHEN "vE1" ? 'paidDays' THEN "vC1PayrollRunLines"."paidDays" ELSE NULL END, CASE WHEN "vE1" ? 'lwpDays' THEN "vC1PayrollRunLines"."lwpDays" ELSE 0 END, CASE WHEN "vE1" ? 'leaveTakenDays' THEN "vC1PayrollRunLines"."leaveTakenDays" ELSE 0 END, CASE WHEN "vE1" ? 'overtimeHours' THEN "vC1PayrollRunLines"."overtimeHours" ELSE 0 END, CASE WHEN "vE1" ? 'basicAmount' THEN "vC1PayrollRunLines"."basicAmount" ELSE 0 END, CASE WHEN "vE1" ? 'allowanceAmount' THEN "vC1PayrollRunLines"."allowanceAmount" ELSE 0 END, CASE WHEN "vE1" ? 'grossAmount' THEN "vC1PayrollRunLines"."grossAmount" ELSE NULL END, CASE WHEN "vE1" ? 'taxAmount' THEN "vC1PayrollRunLines"."taxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'eobiAmount' THEN "vC1PayrollRunLines"."eobiAmount" ELSE 0 END, CASE WHEN "vE1" ? 'pfAmount' THEN "vC1PayrollRunLines"."pfAmount" ELSE 0 END, CASE WHEN "vE1" ? 'loanAmount' THEN "vC1PayrollRunLines"."loanAmount" ELSE 0 END, CASE WHEN "vE1" ? 'otherDeductionAmount' THEN "vC1PayrollRunLines"."otherDeductionAmount" ELSE 0 END, CASE WHEN "vE1" ? 'deductionAmount' THEN "vC1PayrollRunLines"."deductionAmount" ELSE NULL END, CASE WHEN "vE1" ? 'netAmount' THEN "vC1PayrollRunLines"."netAmount" ELSE NULL END, CASE WHEN "vE1" ? 'employerEobiAmount' THEN "vC1PayrollRunLines"."employerEobiAmount" ELSE 0 END, CASE WHEN "vE1" ? 'employerPessiAmount' THEN "vC1PayrollRunLines"."employerPessiAmount" ELSE 0 END, CASE WHEN "vE1" ? 'employerPfAmount' THEN "vC1PayrollRunLines"."employerPfAmount" ELSE 0 END, CASE WHEN "vE1" ? 'gratuityProvisionAmount' THEN "vC1PayrollRunLines"."gratuityProvisionAmount" ELSE 0 END, CASE WHEN "vE1" ? 'taxStatus' THEN "vC1PayrollRunLines"."taxStatus" ELSE NULL END, CASE WHEN "vE1" ? 'projectedAnnualSalary' THEN "vC1PayrollRunLines"."projectedAnnualSalary" ELSE NULL END, CASE WHEN "vE1" ? 'annualExemptAmount' THEN "vC1PayrollRunLines"."annualExemptAmount" ELSE NULL END, CASE WHEN "vE1" ? 'annualTaxableIncome' THEN "vC1PayrollRunLines"."annualTaxableIncome" ELSE NULL END, CASE WHEN "vE1" ? 'annualTaxLiability' THEN "vC1PayrollRunLines"."annualTaxLiability" ELSE NULL END, CASE WHEN "vE1" ? 'taxSlabId' THEN "vC1PayrollRunLines"."taxSlabId" ELSE NULL END, CASE WHEN "vE1" ? 'prevNetAmount' THEN "vC1PayrollRunLines"."prevNetAmount" ELSE NULL END, CASE WHEN "vE1" ? 'variancePct' THEN "vC1PayrollRunLines"."variancePct" ELSE NULL END, CASE WHEN "vE1" ? 'isNewJoiner' THEN "vC1PayrollRunLines"."isNewJoiner" ELSE FALSE END, CASE WHEN "vE1" ? 'isRevised' THEN "vC1PayrollRunLines"."isRevised" ELSE FALSE END, CASE WHEN "vE1" ? 'flags' THEN "vC1PayrollRunLines".flags ELSE '{}' END, CASE WHEN "vE1" ? 'varianceExplanation' THEN "vC1PayrollRunLines"."varianceExplanation" ELSE NULL END, CASE WHEN "vE1" ? 'payMode' THEN "vC1PayrollRunLines"."payMode" ELSE 'BANK_TRANSFER' END, CASE WHEN "vE1" ? 'bankName' THEN "vC1PayrollRunLines"."bankName" ELSE NULL END, CASE WHEN "vE1" ? 'ibanMasked' THEN "vC1PayrollRunLines"."ibanMasked" ELSE NULL END, CASE WHEN "vE1" ? 'paymentBatchId' THEN "vC1PayrollRunLines"."paymentBatchId" ELSE NULL END, CASE WHEN "vE1" ? 'paymentRef' THEN "vC1PayrollRunLines"."paymentRef" ELSE NULL END, CASE WHEN "vE1" ? 'isOnHold' THEN "vC1PayrollRunLines"."isOnHold" ELSE FALSE END, CASE WHEN "vE1" ? 'holdReason' THEN "vC1PayrollRunLines"."holdReason" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

  IF "vE1" ? 'components' THEN
    -- components: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."PayrollRunLineComponents"
     WHERE "tenantId" = "vTenant" AND "payrollLineId" = "vCid1"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("vE1" -> 'components') x WHERE x ? 'id');
    FOR "vE2", "vO2" IN SELECT x, n FROM jsonb_array_elements("vE1" -> 'components') WITH ORDINALITY t(x, n) LOOP
      "vC2PayrollRunLineComponents" := jsonb_populate_record(NULL::"Payroll"."PayrollRunLineComponents", "vE2");
      IF "vE2" ? 'id' THEN
        UPDATE "Payroll"."PayrollRunLineComponents" t
           SET "componentId" = CASE WHEN "vE2" ? 'componentId' THEN "vC2PayrollRunLineComponents"."componentId" ELSE t."componentId" END,
               "componentType" = CASE WHEN "vE2" ? 'componentType' THEN "vC2PayrollRunLineComponents"."componentType" ELSE t."componentType" END,
               label = CASE WHEN "vE2" ? 'label' THEN "vC2PayrollRunLineComponents".label ELSE t.label END,
               "basisText" = CASE WHEN "vE2" ? 'basisText' THEN "vC2PayrollRunLineComponents"."basisText" ELSE t."basisText" END,
               quantity = CASE WHEN "vE2" ? 'quantity' THEN "vC2PayrollRunLineComponents".quantity ELSE t.quantity END,
               rate = CASE WHEN "vE2" ? 'rate' THEN "vC2PayrollRunLineComponents".rate ELSE t.rate END,
               amount = CASE WHEN "vE2" ? 'amount' THEN "vC2PayrollRunLineComponents".amount ELSE t.amount END,
               "isTaxable" = CASE WHEN "vE2" ? 'isTaxable' THEN "vC2PayrollRunLineComponents"."isTaxable" ELSE t."isTaxable" END,
               "exemptAmount" = CASE WHEN "vE2" ? 'exemptAmount' THEN "vC2PayrollRunLineComponents"."exemptAmount" ELSE t."exemptAmount" END,
               "loanId" = CASE WHEN "vE2" ? 'loanId' THEN "vC2PayrollRunLineComponents"."loanId" ELSE t."loanId" END,
               "payrollInputId" = CASE WHEN "vE2" ? 'payrollInputId' THEN "vC2PayrollRunLineComponents"."payrollInputId" ELSE t."payrollInputId" END,
               "showOnPayslip" = CASE WHEN "vE2" ? 'showOnPayslip' THEN "vC2PayrollRunLineComponents"."showOnPayslip" ELSE t."showOnPayslip" END,
               "sortOrder" = CASE WHEN "vE2" ? 'sortOrder' THEN "vC2PayrollRunLineComponents"."sortOrder" ELSE t."sortOrder" END
         WHERE t.id = ("vE2" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."payrollLineId" = "vCid1"
        RETURNING t.id INTO "vCid2";
        IF "vCid2" IS NULL THEN
          RAISE EXCEPTION 'PayrollRunLineComponents: row % does not belong to this record', "vE2" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."PayrollRunLineComponents" ("payrollLineId", "tenantId", "componentId", "componentType", label, "basisText", quantity, rate, amount, "isTaxable", "exemptAmount", "loanId", "payrollInputId", "showOnPayslip", "sortOrder")
        VALUES ("vCid1", "vTenant", CASE WHEN "vE2" ? 'componentId' THEN "vC2PayrollRunLineComponents"."componentId" ELSE NULL END, CASE WHEN "vE2" ? 'componentType' THEN "vC2PayrollRunLineComponents"."componentType" ELSE NULL END, CASE WHEN "vE2" ? 'label' THEN "vC2PayrollRunLineComponents".label ELSE NULL END, CASE WHEN "vE2" ? 'basisText' THEN "vC2PayrollRunLineComponents"."basisText" ELSE NULL END, CASE WHEN "vE2" ? 'quantity' THEN "vC2PayrollRunLineComponents".quantity ELSE NULL END, CASE WHEN "vE2" ? 'rate' THEN "vC2PayrollRunLineComponents".rate ELSE NULL END, CASE WHEN "vE2" ? 'amount' THEN "vC2PayrollRunLineComponents".amount ELSE NULL END, CASE WHEN "vE2" ? 'isTaxable' THEN "vC2PayrollRunLineComponents"."isTaxable" ELSE FALSE END, CASE WHEN "vE2" ? 'exemptAmount' THEN "vC2PayrollRunLineComponents"."exemptAmount" ELSE 0 END, CASE WHEN "vE2" ? 'loanId' THEN "vC2PayrollRunLineComponents"."loanId" ELSE NULL END, CASE WHEN "vE2" ? 'payrollInputId' THEN "vC2PayrollRunLineComponents"."payrollInputId" ELSE NULL END, CASE WHEN "vE2" ? 'showOnPayslip' THEN "vC2PayrollRunLineComponents"."showOnPayslip" ELSE TRUE END, CASE WHEN "vE2" ? 'sortOrder' THEN "vC2PayrollRunLineComponents"."sortOrder" ELSE 0 END)
        RETURNING id INTO "vCid2";
      END IF;

    END LOOP;
  END IF;
    END LOOP;
  END IF;

  IF "pData" ? 'branches' THEN
    -- branches: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."PayrollRunBranches"
     WHERE "tenantId" = "vTenant" AND "payrollRunId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'branches') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'branches') WITH ORDINALITY t(x, n) LOOP
      "vC1PayrollRunBranches" := jsonb_populate_record(NULL::"Payroll"."PayrollRunBranches", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Payroll"."PayrollRunBranches" t
           SET "branchId" = CASE WHEN "vE1" ? 'branchId' THEN "vC1PayrollRunBranches"."branchId" ELSE t."branchId" END,
               "employeeCount" = CASE WHEN "vE1" ? 'employeeCount' THEN "vC1PayrollRunBranches"."employeeCount" ELSE t."employeeCount" END,
               "isIncluded" = CASE WHEN "vE1" ? 'isIncluded' THEN "vC1PayrollRunBranches"."isIncluded" ELSE t."isIncluded" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."payrollRunId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PayrollRunBranches: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."PayrollRunBranches" ("payrollRunId", "tenantId", "branchId", "employeeCount", "isIncluded")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'branchId' THEN "vC1PayrollRunBranches"."branchId" ELSE NULL END, CASE WHEN "vE1" ? 'employeeCount' THEN "vC1PayrollRunBranches"."employeeCount" ELSE 0 END, CASE WHEN "vE1" ? 'isIncluded' THEN "vC1PayrollRunBranches"."isIncluded" ELSE TRUE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'checklist' THEN
    -- checklist: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."PayrollRunChecklistItems"
     WHERE "tenantId" = "vTenant" AND "payrollRunId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'checklist') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'checklist') WITH ORDINALITY t(x, n) LOOP
      "vC1PayrollRunChecklistItems" := jsonb_populate_record(NULL::"Payroll"."PayrollRunChecklistItems", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Payroll"."PayrollRunChecklistItems" t
           SET "itemKey" = CASE WHEN "vE1" ? 'itemKey' THEN "vC1PayrollRunChecklistItems"."itemKey" ELSE t."itemKey" END,
               label = CASE WHEN "vE1" ? 'label' THEN "vC1PayrollRunChecklistItems".label ELSE t.label END,
               "sortOrder" = CASE WHEN "vE1" ? 'sortOrder' THEN "vC1PayrollRunChecklistItems"."sortOrder" ELSE t."sortOrder" END,
               "isDone" = CASE WHEN "vE1" ? 'isDone' THEN "vC1PayrollRunChecklistItems"."isDone" ELSE t."isDone" END,
               "doneByUserId" = CASE WHEN "vE1" ? 'doneByUserId' THEN "vC1PayrollRunChecklistItems"."doneByUserId" ELSE t."doneByUserId" END,
               "doneAt" = CASE WHEN "vE1" ? 'doneAt' THEN "vC1PayrollRunChecklistItems"."doneAt" ELSE t."doneAt" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."payrollRunId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PayrollRunChecklistItems: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."PayrollRunChecklistItems" ("payrollRunId", "tenantId", "itemKey", label, "sortOrder", "isDone", "doneByUserId", "doneAt")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'itemKey' THEN "vC1PayrollRunChecklistItems"."itemKey" ELSE NULL END, CASE WHEN "vE1" ? 'label' THEN "vC1PayrollRunChecklistItems".label ELSE NULL END, CASE WHEN "vE1" ? 'sortOrder' THEN "vC1PayrollRunChecklistItems"."sortOrder" ELSE 0 END, CASE WHEN "vE1" ? 'isDone' THEN "vC1PayrollRunChecklistItems"."isDone" ELSE FALSE END, CASE WHEN "vE1" ? 'doneByUserId' THEN "vC1PayrollRunChecklistItems"."doneByUserId" ELSE NULL END, CASE WHEN "vE1" ? 'doneAt' THEN "vC1PayrollRunChecklistItems"."doneAt" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;

COMMENT ON FUNCTION "Payroll"."payrollRunAddUpdate"("pData" jsonb) IS 'Save (insert or update) one PayrollRuns record with its adjustments, lines (+ components), branches, checklist and payment batches; DRAFT or REVIEW only; numbered with getNextPayrollRunNo.';

-- ---------------------------------------------------------------------------
-- 3. Inputs: approved overtime (Phase 30) is pushed to a run as payroll adjustments, and released again when the
--    adjustment is removed or the run is cancelled / rejected / reversed. Attendance is handed over on approval.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunPullOvertime"("pId" uuid, "pEmployees" uuid[])
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRun"    "Payroll"."PayrollRuns";
  "vComp"   uuid;
  "vTax"    boolean;
  "vN"      integer;
BEGIN
  SELECT * INTO "vRun" FROM "Payroll"."PayrollRuns" r WHERE r."tenantId" = "vTenant" AND r.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRun".status NOT IN ('DRAFT', 'REVIEW') THEN
    RAISE EXCEPTION 'Payroll run % is %: inputs are frozen', "vRun"."docNo", "vRun".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PAYROLL_RUN_LOCKED';
  END IF;
  SELECT c.id, c."taxTreatment" IS DISTINCT FROM 'EXEMPT' INTO "vComp", "vTax"
    FROM "Payroll"."SalaryComponents" c
   WHERE c."tenantId" = "vTenant" AND c."systemRole" = 'OVERTIME' AND c."deletedAt" IS NULL AND c.status = 'ACTIVE';
  IF "vComp" IS NULL THEN
    RETURN 0;                                   -- no overtime component: nothing can carry the claims
  END IF;
  WITH c AS (
    SELECT o.id, o."employeeId", o.hours, o.amount, o."docNo"
      FROM "HumanResources"."OvertimeClaims" o
     WHERE o."tenantId" = "vTenant" AND o.status = 'APPROVED' AND NOT o."isCompOff" AND o.amount > 0
       AND o."payrollRunId" IS NULL AND o."payrollMonth" = "vRun"."payrollMonth"
       AND o."employeeId" = ANY ("pEmployees")
       FOR UPDATE
  ), ins AS (
    INSERT INTO "Payroll"."PayrollAdjustments" ("tenantId", "payrollRunId", "employeeId", "componentId", "inputSource", quantity, amount,
                                                "isTaxable", remarks, "sourceDocType", "sourceDocId")
    SELECT "vTenant", "pId", c."employeeId", "vComp", 'OVERTIME', c.hours, c.amount, "vTax", 'Overtime ' || c."docNo", 'OT', c.id FROM c
    RETURNING "sourceDocId"
  )
  UPDATE "HumanResources"."OvertimeClaims" o
     SET status = 'PUSHED', "payrollRunId" = "pId", "pushedAt" = now()
   WHERE o."tenantId" = "vTenant" AND o.id IN (SELECT "sourceDocId" FROM ins);
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  RETURN "vN";
END $function$;

COMMENT ON FUNCTION "Payroll"."payrollRunPullOvertime"(uuid, uuid[]) IS
  'Pushes approved, paid (not comp-off) overtime claims of the run month into the run as OVERTIME adjustments and marks them PUSHED.';

-- Claims whose adjustment is gone (removed from the run, or the run was cancelled / rejected / reversed) are approved
-- again, so the next run picks them up. pAll releases every claim of the run.
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunReleaseInputs"("pId" uuid, "pAll" boolean DEFAULT false)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vN"      integer;
BEGIN
  UPDATE "HumanResources"."OvertimeClaims" o
     SET status = 'APPROVED', "payrollRunId" = NULL, "pushedAt" = NULL
   WHERE o."tenantId" = "vTenant" AND o."payrollRunId" = "pId" AND o.status = 'PUSHED'
     AND ("pAll" OR NOT EXISTS (SELECT 1 FROM "Payroll"."PayrollAdjustments" a
                                 WHERE a."tenantId" = "vTenant" AND a."payrollRunId" = "pId"
                                   AND a."sourceDocType" = 'OT' AND a."sourceDocId" = o.id));
  GET DIAGNOSTICS "vN" = ROW_COUNT;
  IF "pAll" THEN
    -- attendance consumed by the run is released (and unlocked) so it can be corrected before the re-run
    UPDATE "HumanResources"."AttendanceRegister" a
       SET "lockedAt" = NULL, "payrollRunId" = NULL
     WHERE a."tenantId" = "vTenant" AND a."payrollRunId" = "pId";
  END IF;
  RETURN "vN";
END $function$;

-- On approval of a regular run: the attendance days of its employees are locked and marked as consumed by the run,
-- then the rest of the month is locked (Phase 30 attendanceRegisterLock).
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunApproveEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRun"    "Payroll"."PayrollRuns";
BEGIN
  SELECT * INTO "vRun" FROM "Payroll"."PayrollRuns" r WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  IF "vRun"."runType" <> 'REGULAR' THEN
    RETURN;
  END IF;
  UPDATE "HumanResources"."AttendanceRegister" a
     SET "lockedAt" = now(), "payrollRunId" = "pId"
   WHERE a."tenantId" = "vTenant" AND a."lockedAt" IS NULL
     AND a."attDate" BETWEEN "vRun"."periodFrom" AND "vRun"."periodTo"
     AND a."employeeId" IN (SELECT l."employeeId" FROM "Payroll"."PayrollRunLines" l
                             WHERE l."tenantId" = "vTenant" AND l."payrollRunId" = "pId");
  PERFORM "HumanResources"."attendanceRegisterLock"("vRun"."payrollMonth");
END $function$;

COMMENT ON FUNCTION "Payroll"."payrollRunApproveEntries"("pId" uuid) IS
  'Posting hook of Payroll.payrollRunApprove: hands the regular run''s attendance month over to payroll (locked, consumed by the run).';

-- ---------------------------------------------------------------------------
-- 4. Run lifecycle: DRAFT → (calculate) REVIEW → submit → AWAITING_APPROVAL → approve → APPROVED → post → POSTED
--    → pay → PAID. Send back returns to REVIEW; reject ends the run (REJECTED). Reverse from POSTED or PAID.
--    The preparer (who submitted, else who created) never approves the run.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunSubmit"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."PayrollRuns";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."PayrollRuns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PayrollRuns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'AWAITING_APPROVAL' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'REVIEW' OR "vRow"."calculatedAt" IS NULL THEN
    RAISE EXCEPTION 'Payroll run %: calculate the run before submitting it (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PAYROLL_RUN_LOCKED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Payroll"."PayrollRunLines" l WHERE l."tenantId" = "vRow"."tenantId" AND l."payrollRunId" = "pId" AND NOT l."isOnHold") THEN
    RAISE EXCEPTION 'Payroll run % has no employees to pay', "vRow"."docNo" USING ERRCODE = 'check_violation', HINT = 'PAYROLL_NO_LINES';
  END IF;
  UPDATE "Payroll"."PayrollRuns" t
     SET status = 'AWAITING_APPROVAL', "wizardStep" = 4, "inputsFrozenAt" = now(),
         "preparedByUserId" = "Company"."getCurrentUserId"(), "preparedAt" = now()
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Payroll"."payrollRunSendBack"("pId" uuid, "pReason" text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."PayrollRuns";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."PayrollRuns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PayrollRuns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status <> 'AWAITING_APPROVAL' THEN
    RAISE EXCEPTION 'Payroll run % is not awaiting approval (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PAYROLL_RUN_LOCKED';
  END IF;
  UPDATE "Payroll"."PayrollRuns" t
     SET status = 'REVIEW', "wizardStep" = 3, "inputsFrozenAt" = NULL,
         remarks = left(concat_ws(E'\n', t.remarks, 'Sent back: ' || COALESCE("pReason", '—')), 2000)
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Payroll"."payrollRunReject"("pId" uuid, "pReason" text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."PayrollRuns";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."PayrollRuns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PayrollRuns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'REJECTED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'AWAITING_APPROVAL' THEN
    RAISE EXCEPTION 'Payroll run % is not awaiting approval (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PAYROLL_RUN_LOCKED';
  END IF;
  PERFORM "Payroll"."payrollRunReleaseInputs"("pId", true);
  UPDATE "Payroll"."PayrollRuns" t
     SET status = 'REJECTED', remarks = left(concat_ws(E'\n', t.remarks, 'Rejected: ' || COALESCE("pReason", '—')), 2000)
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- Approve: only a run awaiting approval, never by its preparer (was: DRAFT, any user but the creator).
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunApprove"("pId" uuid, "pComment" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."PayrollRuns";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."PayrollRuns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PayrollRuns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'AWAITING_APPROVAL' THEN
    RAISE EXCEPTION 'Payroll run %: submit it for approval first (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PAYROLL_NOT_APPROVED';
  END IF;
  IF COALESCE("vRow"."preparedByUserId", "vRow"."createdBy") = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'Payroll run %: the preparer cannot approve it', "vRow"."docNo"
      USING ERRCODE = 'insufficient_privilege', HINT = 'PAYROLL_PREPARER_APPROVAL';
  END IF;
  PERFORM "Payroll"."payrollRunApproveEntries"("pId");
  UPDATE "Payroll"."PayrollRuns" t
     SET status = 'APPROVED', "wizardStep" = 5, "approvedAt" = now(), "approvedByUserId" = "Company"."getCurrentUserId"(),
         "checkedByUserId" = COALESCE(t."checkedByUserId", "Company"."getCurrentUserId"()), "checkedAt" = COALESCE(t."checkedAt", now())
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- Post: only an APPROVED run (was: DRAFT too). Accrual JV + installments recovered (payrollRunPostEntries), then the
-- payslips (one per line; published to My Profile when the run says so).
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunPost"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."PayrollRuns";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."PayrollRuns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PayrollRuns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status IN ('POSTED', 'PAID') THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Payroll run % must be approved before posting (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PAYROLL_NOT_APPROVED';
  END IF;
  PERFORM "Payroll"."payrollRunPostEntries"("pId");
  UPDATE "Payroll"."PayrollRuns" t SET status = 'POSTED', "postedAt" = now(), "postedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  PERFORM "Payroll"."payrollRunPayslipsGenerate"("pId");
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Payroll"."payrollRunPayslipsGenerate"("pId" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRun"    "Payroll"."PayrollRuns";
  "vL"      record;
  "vN"      integer := 0;
BEGIN
  SELECT * INTO "vRun" FROM "Payroll"."PayrollRuns" r WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  FOR "vL" IN
    SELECT l.id, l."employeeId", l."grossAmount", l."deductionAmount", l."netAmount", l."isOnHold", l."holdReason",
           COALESCE(e."workEmail", e."personalEmail") AS email
      FROM "Payroll"."PayrollRunLines" l
      JOIN "HumanResources"."Employees" e ON e."tenantId" = l."tenantId" AND e.id = l."employeeId"
     WHERE l."tenantId" = "vTenant" AND l."payrollRunId" = "pId"
       AND NOT EXISTS (SELECT 1 FROM "Payroll"."Payslips" p WHERE p."tenantId" = l."tenantId" AND p."payrollLineId" = l.id)
     ORDER BY e.code
  LOOP
    INSERT INTO "Payroll"."Payslips" ("tenantId", "docNo", "payrollRunId", "payrollLineId", "employeeId", "payrollMonth", "grossAmount",
                                      "deductionAmount", "netAmount", status, "generatedAt", "publishedToEssAt", "emailTo", "holdReason")
    VALUES ("vTenant", "Company"."getNextDocNo"('PS', "vRun"."payrollMonth", NULL), "pId", "vL".id, "vL"."employeeId", "vRun"."payrollMonth",
            "vL"."grossAmount", "vL"."deductionAmount", "vL"."netAmount",
            CASE WHEN "vL"."isOnHold" THEN 'ON_HOLD' WHEN "vL".email IS NULL THEN 'NO_EMAIL' ELSE 'GENERATED' END, now(),
            CASE WHEN "vRun"."publishToEss" AND NOT "vL"."isOnHold" THEN now() END, "vL".email,
            CASE WHEN "vL"."isOnHold" THEN "vL"."holdReason" END);
    "vN" := "vN" + 1;
  END LOOP;
  RETURN "vN";
END $function$;

COMMENT ON FUNCTION "Payroll"."payrollRunPayslipsGenerate"("pId" uuid) IS
  'One payslip per line of a posted run (PS series by payroll month); lines on hold get an ON_HOLD payslip, not published.';

-- Pay: one payment batch per call. A bank / IBFT / bulk / cheque batch posts a BPV from the bank account, a cash batch a
-- CPV from the cash account (BankCash.postBankingVoucher; source PRUN + the batch id): Dr salaries payable / Cr bank or
-- cash. pData: {paymentMethod, bankAccountId | cashAccountId, valueDate, instructionRef, fileFormat, lineIds?}.
-- The run is PAID when no unpaid line (not on hold) remains.
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunPay"("pId" uuid, "pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant"  uuid := "Company"."getCurrentTenantId"();
  "vRun"     "Payroll"."PayrollRuns";
  "vMethod"  text := "pData" ->> 'paymentMethod';
  "vBank"    uuid := NULLIF("pData" ->> 'bankAccountId', '')::uuid;
  "vCash"    uuid := NULLIF("pData" ->> 'cashAccountId', '')::uuid;
  "vDate"    date := COALESCE(NULLIF("pData" ->> 'valueDate', '')::date, current_date);
  "vRef"     text := NULLIF(btrim("pData" ->> 'instructionRef'), '');
  "vIds"     uuid[];
  "vGl"      uuid;
  "vBranch"  uuid;
  "vCount"   integer;
  "vTotal"   numeric(18,2);
  "vBatch"   uuid;
  "vJe"      uuid;
  "vJeNo"    text;
BEGIN
  SELECT * INTO "vRun" FROM "Payroll"."PayrollRuns" r WHERE r."tenantId" = "vTenant" AND r.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRun".status <> 'POSTED' THEN
    RAISE EXCEPTION 'Payroll run % must be posted before it is paid (status %)', "vRun"."docNo", "vRun".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PAYROLL_NOT_POSTED';
  END IF;
  IF "vMethod" IS NULL OR "vMethod" NOT IN ('BULK_UPLOAD', 'IBFT', 'CHEQUE', 'CASH') THEN
    RAISE EXCEPTION 'Choose how the salaries are paid' USING ERRCODE = 'check_violation', HINT = 'VALIDATION_FAILED';
  END IF;
  IF "vMethod" = 'CASH' THEN
    SELECT ca."accountId" INTO "vGl" FROM "BankCash"."CashAccounts" ca
     WHERE ca."tenantId" = "vTenant" AND ca.id = "vCash" AND ca."deletedAt" IS NULL AND ca."isActive";
    IF "vGl" IS NULL THEN
      RAISE EXCEPTION 'Choose the cash account the salaries are paid from' USING ERRCODE = 'check_violation', HINT = 'VALIDATION_FAILED';
    END IF;
    "vBank" := NULL;
  ELSE
    SELECT ba."accountId" INTO "vGl" FROM "BankCash"."BankAccounts" ba
     WHERE ba."tenantId" = "vTenant" AND ba.id = "vBank" AND ba."deletedAt" IS NULL AND ba.status = 'ACTIVE';
    IF "vGl" IS NULL THEN
      RAISE EXCEPTION 'Choose the bank account the salaries are paid from' USING ERRCODE = 'check_violation', HINT = 'VALIDATION_FAILED';
    END IF;
  END IF;

  SELECT array_agg(l.id), count(*), COALESCE(sum(l."netAmount"), 0), (array_agg(l."branchId") FILTER (WHERE l."branchId" IS NOT NULL))[1]
    INTO "vIds", "vCount", "vTotal", "vBranch"
    FROM "Payroll"."PayrollRunLines" l
   WHERE l."tenantId" = "vTenant" AND l."payrollRunId" = "pId" AND NOT l."isOnHold" AND l."paymentBatchId" IS NULL
     AND l."netAmount" > 0
     AND (NOT ("pData" ? 'lineIds') OR jsonb_typeof("pData" -> 'lineIds') <> 'array'
          OR l.id IN (SELECT x::uuid FROM jsonb_array_elements_text("pData" -> 'lineIds') x));
  IF "vCount" = 0 OR "vTotal" <= 0 THEN
    RAISE EXCEPTION 'Payroll run % has no unpaid salaries in this selection', "vRun"."docNo"
      USING ERRCODE = 'check_violation', HINT = 'PAYROLL_NO_LINES';
  END IF;

  INSERT INTO "Payroll"."SalaryPaymentBatches" ("tenantId", "payrollRunId", "paymentMethod", "bankAccountId", "fileFormat", "employeeCount",
                                                "totalAmount", "instructionRef", "valueDate", "generatedAt", "sentAt", status)
  VALUES ("vTenant", "pId", "vMethod", "vBank", CASE WHEN "vMethod" IN ('BULK_UPLOAD', 'IBFT') THEN COALESCE(NULLIF("pData" ->> 'fileFormat', ''), 'CSV') END,
          "vCount", "vTotal", "vRef", "vDate", now(), now(), 'CONFIRMED')
  RETURNING id INTO "vBatch";

  "vJe" := "BankCash"."postBankingVoucher"(
             CASE WHEN "vMethod" = 'CASH' THEN 'CPV' ELSE 'BPV' END, "vDate", "vBranch",
             'Salary payment ' || to_char("vRun"."payrollMonth", 'FMMonth YYYY') || ' (' || "vRun"."docNo" || ') · ' || "vCount" || ' employee' || CASE WHEN "vCount" = 1 THEN '' ELSE 's' END,
             "vGl", NULL, CASE WHEN "vMethod" = 'CHEQUE' THEN "vRef" END, CASE WHEN "vMethod" = 'CHEQUE' THEN "vDate" END,
             'PRUN', "vBatch", "vRun"."docNo",
             jsonb_build_array(
               jsonb_build_object('accountId', "vRun"."salaryPayableAccountId", 'debit', "vTotal", 'particulars', 'Net salaries ' || "vRun"."docNo"),
               jsonb_build_object('accountId', "vGl", 'credit', "vTotal", 'particulars', 'Salaries paid · ' || "vRun"."docNo", 'isAutoContra', true)));
  SELECT v."docNo" INTO "vJeNo" FROM "Accounting"."Vouchers" v WHERE v."tenantId" = "vTenant" AND v.id = "vJe";

  UPDATE "Payroll"."PayrollRunLines" l
     SET "paymentBatchId" = "vBatch", "paymentRef" = COALESCE("vRef", "vJeNo"),
         "payMode" = CASE WHEN "vMethod" = 'CASH' THEN 'CASH' WHEN "vMethod" = 'CHEQUE' THEN 'CHEQUE' ELSE 'BANK_TRANSFER' END
   WHERE l."tenantId" = "vTenant" AND l.id = ANY ("vIds");

  IF NOT EXISTS (SELECT 1 FROM "Payroll"."PayrollRunLines" l
                  WHERE l."tenantId" = "vTenant" AND l."payrollRunId" = "pId" AND NOT l."isOnHold" AND l."paymentBatchId" IS NULL AND l."netAmount" > 0) THEN
    UPDATE "Payroll"."PayrollRuns" r SET status = 'PAID', "paidAt" = now() WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  END IF;
  RETURN "vBatch";
END $function$;

COMMENT ON FUNCTION "Payroll"."payrollRunPay"("pId" uuid, "pData" jsonb) IS
  'Salary payment batch of a posted run: BPV / CPV Dr salaries payable, Cr bank or cash (source PRUN + batch id); lines marked paid; run PAID when all are.';

-- Reverse: from POSTED (accrual JV mirrored, installments back to scheduled) or PAID (the payment vouchers are reversed
-- first). Inputs are released, payslips put on hold and taken out of My Profile.
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunReverse"("pId" uuid, "pReason" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."PayrollRuns";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."PayrollRuns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PayrollRuns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'REVERSED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status NOT IN ('POSTED', 'PAID') THEN
    RAISE EXCEPTION 'Payroll run %: only a posted or paid run can be reversed (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PAYROLL_NOT_POSTED';
  END IF;
  PERFORM "Payroll"."payrollRunReverseEntries"("pId");
  UPDATE "Payroll"."PayrollRuns" t
     SET status = 'REVERSED', remarks = left(concat_ws(E'\n', t.remarks, 'Reversed: ' || COALESCE("pReason", '—')), 2000)
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Payroll"."payrollRunReverseEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRun"    "Payroll"."PayrollRuns";
  "vBatch"  uuid;
BEGIN
  SELECT * INTO "vRun" FROM "Payroll"."PayrollRuns" r WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  IF "vRun".status = 'PAID' OR EXISTS (SELECT 1 FROM "Payroll"."SalaryPaymentBatches" b WHERE b."tenantId" = "vTenant" AND b."payrollRunId" = "pId") THEN
    FOR "vBatch" IN SELECT b.id FROM "Payroll"."SalaryPaymentBatches" b WHERE b."tenantId" = "vTenant" AND b."payrollRunId" = "pId" LOOP
      PERFORM "Accounting"."journalReverseForSource"('PRUN', "vBatch", 'OTHER', current_date);
    END LOOP;
    UPDATE "Payroll"."SalaryPaymentBatches" b SET status = 'FAILED' WHERE b."tenantId" = "vTenant" AND b."payrollRunId" = "pId";
  END IF;
  IF "Payroll"."payrollRunUnpost"("pId") IS NULL THEN
    RAISE EXCEPTION 'Payroll run has no posted journal to reverse' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM "Payroll"."payrollRunReleaseInputs"("pId", true);
  UPDATE "Payroll"."Payslips" p
     SET status = 'ON_HOLD', "holdReason" = 'Payroll run reversed', "publishedToEssAt" = NULL
   WHERE p."tenantId" = "vTenant" AND p."payrollRunId" = "pId";
END $function$;

COMMENT ON FUNCTION "Payroll"."payrollRunReverseEntries"("pId" uuid) IS
  'Posting hook of Payroll.payrollRunReverse: payment vouchers reversed (batches FAILED), mirror JV, installments rescheduled, inputs released, payslips on hold.';

-- Cancel: any open state; a posted run is unposted first; a paid run must be reversed instead.
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunCancelEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRun" record;
BEGIN
  SELECT r."docNo", r.status INTO "vRun"
    FROM "Payroll"."PayrollRuns" r
   WHERE r."tenantId" = "Company"."getCurrentTenantId"() AND r.id = "pId";
  IF "vRun".status = 'PAID' THEN
    RAISE EXCEPTION 'Payroll run % is paid: reverse it instead', "vRun"."docNo"
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'PAYROLL_RUN_LOCKED';
  ELSIF "vRun".status = 'POSTED' THEN
    PERFORM "Payroll"."payrollRunUnpost"("pId");
    UPDATE "Payroll"."Payslips" p SET status = 'ON_HOLD', "holdReason" = 'Payroll run cancelled', "publishedToEssAt" = NULL
     WHERE p."tenantId" = "Company"."getCurrentTenantId"() AND p."payrollRunId" = "pId";
  END IF;
  PERFORM "Payroll"."payrollRunReleaseInputs"("pId", true);
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Loans & advances: approve sets the approved amount; disbursement needs a date and a source and posts the
--    voucher; the recovery schedule is generated on disbursement; the installment sync closes a loan when its last
--    installment is recovered.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Payroll"."loanApprove"("pId" uuid, "pComment" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."LoansAndAdvances";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."LoansAndAdvances" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LoansAndAdvances % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'PENDING' THEN
    RAISE EXCEPTION 'Loan %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'LOAN_NOT_ACTIONABLE';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'Loan %: the preparer cannot approve it', "vRow"."docNo"
      USING ERRCODE = 'insufficient_privilege', HINT = 'PAYROLL_PREPARER_APPROVAL';
  END IF;
  UPDATE "Payroll"."LoansAndAdvances" t
     SET status = 'APPROVED', "approvedAmount" = COALESCE(t."approvedAmount", t."requestedAmount"), "approvedAt" = now(),
         "approvedByUserId" = "Company"."getCurrentUserId"(), "decisionComment" = COALESCE("pComment", t."decisionComment")
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Payroll"."loanReject"("pId" uuid, "pReason" text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."LoansAndAdvances";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."LoansAndAdvances" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LoansAndAdvances % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'REJECTED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status NOT IN ('PENDING', 'APPROVED') THEN
    RAISE EXCEPTION 'Loan %: cannot reject from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'LOAN_NOT_ACTIONABLE';
  END IF;
  UPDATE "Payroll"."LoansAndAdvances" t SET status = 'REJECTED', "decisionComment" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- The recovery schedule: installmentCount months from the first deduction month, the last one taking the remainder,
-- so the installments add up to the approved amount exactly (an equal split rounded up overshot it and the loan could
-- never close: recoveredAmount may not exceed the approved amount).
CREATE OR REPLACE FUNCTION "Payroll"."loanScheduleGenerate"("pId" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vLoan"   "Payroll"."LoansAndAdvances";
  "vLeft"   numeric(18,2);
  "vAmt"    numeric(18,2);
  "vI"      integer;
BEGIN
  SELECT * INTO "vLoan" FROM "Payroll"."LoansAndAdvances" n WHERE n."tenantId" = "vTenant" AND n.id = "pId";
  IF EXISTS (SELECT 1 FROM "Payroll"."LoanInstallments" i WHERE i."tenantId" = "vTenant" AND i."loanId" = "pId") THEN
    RETURN 0;
  END IF;
  "vLeft" := COALESCE("vLoan"."approvedAmount", "vLoan"."requestedAmount");
  FOR "vI" IN 1 .. "vLoan"."installmentCount" LOOP
    EXIT WHEN "vLeft" <= 0;
    "vAmt" := CASE WHEN "vI" = "vLoan"."installmentCount" THEN "vLeft" ELSE least("vLoan"."installmentAmount", "vLeft") END;
    "vLeft" := "vLeft" - "vAmt";
    INSERT INTO "Payroll"."LoanInstallments" ("tenantId", "loanId", "installmentNo", "installmentType", "dueMonth", amount, "balanceAfter", status)
    VALUES ("vTenant", "pId", "vI", 'SCHEDULED', ("vLoan"."firstDeductionMonth" + make_interval(months => "vI" - 1))::date, "vAmt", "vLeft", 'SCHEDULED');
  END LOOP;
  RETURN "vLoan"."installmentCount";
END $function$;

-- Disbursement voucher (BPV from a bank account / CPV from a cash account, source LN / ADV) and the schedule. Posted with
-- Accounting.journalCreate (idempotent per source) so the debit carries the employee sub-ledger like the recoveries.
CREATE OR REPLACE FUNCTION "Payroll"."loanDisburseEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant"   uuid := "Company"."getCurrentTenantId"();
  "vLoan"     record;
  "vLoanAcc"  uuid;
  "vCashAcc"  uuid;
  "vType"     text;
  "vJe"       uuid;
BEGIN
  SELECT n.id, n."docNo", n."loanType", n."employeeId", n."approvedAmount", n."requestedAmount",
         n."disbursementDate", n."disbursedFromBankAccountId", n."disbursedFromCashAccountId",
         n."disbursementJournalEntryId", COALESCE(e."displayName", e."firstName" || ' ' || COALESCE(e."lastName", '')) AS name, e."branchId"
    INTO "vLoan"
    FROM "Payroll"."LoansAndAdvances" n
    JOIN "HumanResources"."Employees" e ON e."tenantId" = n."tenantId" AND e.id = n."employeeId"
   WHERE n."tenantId" = "vTenant" AND n.id = "pId";
  IF "vLoan"."disbursementJournalEntryId" IS NULL THEN
    IF "vLoan"."disbursedFromBankAccountId" IS NOT NULL THEN
      SELECT b."accountId" INTO "vCashAcc" FROM "BankCash"."BankAccounts" b
       WHERE b."tenantId" = "vTenant" AND b.id = "vLoan"."disbursedFromBankAccountId";
      "vType" := 'BPV';
    ELSE
      SELECT c."accountId" INTO "vCashAcc" FROM "BankCash"."CashAccounts" c
       WHERE c."tenantId" = "vTenant" AND c.id = "vLoan"."disbursedFromCashAccountId";
      "vType" := 'CPV';
    END IF;
    IF "vCashAcc" IS NULL THEN
      RAISE EXCEPTION 'Choose the bank or cash account the loan is paid from' USING ERRCODE = 'check_violation', HINT = 'VALIDATION_FAILED';
    END IF;
    SELECT s."creditAccountId" INTO "vLoanAcc"
      FROM "Payroll"."SalaryComponents" s
     WHERE s."tenantId" = "vTenant" AND s."deletedAt" IS NULL
       AND s."systemRole" = CASE WHEN "vLoan"."loanType" = 'SALARY_ADVANCE' THEN 'ADVANCE' ELSE 'LOAN' END;
    IF "vLoanAcc" IS NULL THEN
      "vLoanAcc" := "Company"."getAccountForRole"(CASE WHEN "vLoan"."loanType" = 'SALARY_ADVANCE' THEN 'EMPLOYEE_ADVANCES' ELSE 'EMPLOYEE_LOANS' END);
    END IF;
    "vJe" := "Accounting"."journalCreate"(
      jsonb_build_object('voucherType', "vType", 'docDate', "vLoan"."disbursementDate", 'postingDate', "vLoan"."disbursementDate",
                         'branchId', "vLoan"."branchId",
                         'narration', 'Disbursement of ' || "vLoan"."docNo" || ' — ' || "vLoan".name,
                         'partyName', "vLoan".name, 'cashBankAccountId', "vCashAcc",
                         'sourceDocType', CASE WHEN "vLoan"."loanType" = 'SALARY_ADVANCE' THEN 'ADV' ELSE 'LN' END,
                         'sourceDocId', "vLoan".id, 'sourceDocNo', "vLoan"."docNo"),
      jsonb_build_array(
        jsonb_build_object('accountId', "vLoanAcc", 'debit', COALESCE("vLoan"."approvedAmount", "vLoan"."requestedAmount"),
                           'employeeId', "vLoan"."employeeId", 'particulars', "vLoan"."docNo" || ' — ' || "vLoan".name),
        jsonb_build_object('accountId', "vCashAcc", 'credit', COALESCE("vLoan"."approvedAmount", "vLoan"."requestedAmount"),
                           'particulars', 'Disbursed ' || "vLoan"."docNo")));
    UPDATE "Payroll"."LoansAndAdvances" n SET "disbursementJournalEntryId" = "vJe" WHERE n."tenantId" = "vTenant" AND n.id = "vLoan".id;
  END IF;
  PERFORM "Payroll"."loanScheduleGenerate"("pId");
END $function$;

-- Disburse: an APPROVED loan, with its date and exactly one source (bank or cash account).
CREATE OR REPLACE FUNCTION "Payroll"."loanDisburseFrom"("pId" uuid, "pDate" date, "pBankAccountId" uuid, "pCashAccountId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."LoansAndAdvances";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."LoansAndAdvances" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LoansAndAdvances % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'ACTIVE' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Loan %: only an approved loan can be disbursed (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'LOAN_NOT_ACTIONABLE';
  END IF;
  IF num_nonnulls("pBankAccountId", "pCashAccountId") <> 1 THEN
    RAISE EXCEPTION 'Choose one bank or cash account to pay the loan from' USING ERRCODE = 'check_violation', HINT = 'VALIDATION_FAILED';
  END IF;
  UPDATE "Payroll"."LoansAndAdvances" t
     SET "disbursementDate" = COALESCE("pDate", current_date), "disbursedFromBankAccountId" = "pBankAccountId", "disbursedFromCashAccountId" = "pCashAccountId"
   WHERE t.id = "pId";
  RETURN "Payroll"."loanDisburse"("pId");
END $function$;

CREATE OR REPLACE FUNCTION "Payroll"."loanDisburse"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."LoansAndAdvances";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."LoansAndAdvances" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LoansAndAdvances % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'ACTIVE' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Loan %: only an approved loan can be disbursed (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'LOAN_NOT_ACTIONABLE';
  END IF;
  IF "vRow"."disbursementDate" IS NULL OR num_nonnulls("vRow"."disbursedFromBankAccountId", "vRow"."disbursedFromCashAccountId") <> 1 THEN
    RAISE EXCEPTION 'Loan %: give the disbursement date and the bank or cash account (Payroll.loanDisburseFrom)', "vRow"."docNo"
      USING ERRCODE = 'check_violation', HINT = 'VALIDATION_FAILED';
  END IF;
  PERFORM "Payroll"."loanDisburseEntries"("pId");
  UPDATE "Payroll"."LoansAndAdvances" t SET status = 'ACTIVE' WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- The installment sync: recoveredAmount follows the recovered / settled installments; the loan closes when nothing is
-- outstanding and re-opens when a recovery is undone (reversal). SECURITY DEFINER so it works from any caller.
CREATE OR REPLACE FUNCTION "Payroll"."triggerLoanInstallmentSync"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow"       record;
  "vRecovered" numeric(18,2);
BEGIN
  IF TG_OP = 'DELETE' THEN "vRow" := OLD; ELSE "vRow" := NEW; END IF;
  SELECT COALESCE(sum(i.amount), 0) INTO "vRecovered"
    FROM "Payroll"."LoanInstallments" i
   WHERE i."tenantId" = "vRow"."tenantId" AND i."loanId" = "vRow"."loanId"
     AND i.status IN ('RECOVERED', 'SETTLED');
  UPDATE "Payroll"."LoansAndAdvances" l
     SET "recoveredAmount" = least("vRecovered", COALESCE(l."approvedAmount", l."requestedAmount")),
         status = CASE WHEN l.status IN ('ACTIVE', 'SETTLEMENT') AND COALESCE(l."approvedAmount", l."requestedAmount") - "vRecovered" <= 0 THEN 'CLOSED'
                       WHEN l.status = 'CLOSED' AND COALESCE(l."approvedAmount", l."requestedAmount") - "vRecovered" > 0 THEN 'ACTIVE'
                       ELSE l.status END,
         "closedAt" = CASE WHEN l.status IN ('ACTIVE', 'SETTLEMENT') AND COALESCE(l."approvedAmount", l."requestedAmount") - "vRecovered" <= 0 THEN now()
                           WHEN l.status = 'CLOSED' AND COALESCE(l."approvedAmount", l."requestedAmount") - "vRecovered" > 0 THEN NULL
                           ELSE l."closedAt" END
   WHERE l."tenantId" = "vRow"."tenantId" AND l.id = "vRow"."loanId"
     AND (l."recoveredAmount" IS DISTINCT FROM least("vRecovered", COALESCE(l."approvedAmount", l."requestedAmount"))
          OR (l.status IN ('ACTIVE', 'SETTLEMENT') AND COALESCE(l."approvedAmount", l."requestedAmount") - "vRecovered" <= 0)
          OR (l.status = 'CLOSED' AND COALESCE(l."approvedAmount", l."requestedAmount") - "vRecovered" > 0));
  RETURN NULL;
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Tax declarations: submit (with proof → IN_REVIEW, else PENDING), approve (proof required; sets verifiedAt, which
--    taxDeclarationApprovedChk demands and the generated function never set), reject with a reason.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Payroll"."taxDeclarationSubmit"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."TaxDeclarations";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."TaxDeclarations" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TaxDeclarations % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RAISE EXCEPTION 'This declaration is already approved' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TAX_DECLARATION_NOT_ACTIONABLE';
  END IF;
  UPDATE "Payroll"."TaxDeclarations" t
     SET status = CASE WHEN t."proofAttachmentId" IS NOT NULL THEN 'IN_REVIEW' ELSE 'PENDING' END,
         "submittedAt" = now(), "rejectionReason" = NULL, "verifiedAt" = NULL, "verifiedByUserId" = NULL
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Payroll"."taxDeclarationApprove"("pId" uuid, "pComment" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."TaxDeclarations";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."TaxDeclarations" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TaxDeclarations % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status NOT IN ('PENDING', 'IN_REVIEW') THEN
    RAISE EXCEPTION 'This declaration can''t be approved from status %', "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TAX_DECLARATION_NOT_ACTIONABLE';
  END IF;
  IF "vRow"."proofAttachmentId" IS NULL THEN
    RAISE EXCEPTION 'Upload the proof before the declaration is approved' USING ERRCODE = 'check_violation', HINT = 'TAX_PROOF_REQUIRED';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'TaxDeclarations: the preparer cannot approve their own record'
      USING ERRCODE = 'insufficient_privilege', HINT = 'PAYROLL_PREPARER_APPROVAL';
  END IF;
  UPDATE "Payroll"."TaxDeclarations" t
     SET status = 'APPROVED', "verifiedAt" = now(), "verifiedByUserId" = "Company"."getCurrentUserId"(),
         "effectiveFromMonth" = COALESCE(t."effectiveFromMonth", date_trunc('month', current_date)::date), "rejectionReason" = NULL
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "Payroll"."taxDeclarationReject"("pId" uuid, "pReason" text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."TaxDeclarations";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."TaxDeclarations" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TaxDeclarations % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status NOT IN ('PENDING', 'IN_REVIEW') THEN
    RAISE EXCEPTION 'This declaration can''t be rejected from status %', "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'TAX_DECLARATION_NOT_ACTIONABLE';
  END IF;
  UPDATE "Payroll"."TaxDeclarations" t
     SET status = 'REJECTED', "rejectionReason" = COALESCE(NULLIF(btrim("pReason"), ''), 'Rejected'), "verifiedAt" = NULL, "verifiedByUserId" = NULL
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 7. Every company: PRUN / PS / LN / ADV numbering and default PAYROLL_RUN and LOAN workflows (HR manager, then
--    financial accountant). Both editable afterwards; nothing is replaced once it exists.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Payroll"."seedPayrollRunDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vN"   integer;
  "vWf"  uuid;
  "vHr"  uuid;
  "vFa"  uuid;
  "w"    record;
BEGIN
  INSERT INTO "Company"."NumberingSeries" ("tenantId", "docType", "branchId", prefix, pattern, padding, "startValue", "resetPolicy", "isActive")
  SELECT "pTenant", d.code, NULL, d."defaultPrefix", d."defaultPattern", d."defaultPadding", 1, d."defaultResetPolicy", true
    FROM "Company"."DocumentTypes" d
   WHERE d.code IN ('PRUN', 'PS', 'LN', 'ADV')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;

  SELECT r.id INTO "vHr" FROM "Company"."Roles" r WHERE r."tenantId" = "pTenant" AND r."systemKey" = 'HR_MANAGER' LIMIT 1;
  SELECT r.id INTO "vFa" FROM "Company"."Roles" r WHERE r."tenantId" = "pTenant" AND r."systemKey" = 'FINANCIAL_ACCOUNTANT' LIMIT 1;
  IF "vHr" IS NULL OR "vFa" IS NULL THEN
    RETURN "vN";
  END IF;
  FOR "w" IN SELECT * FROM (VALUES
      ('PAYROLL_RUN', 'Payroll runs', 'Default: HR manager, then the financial accountant. The preparer never approves. Edit as needed.'),
      ('LOAN', 'Loans & advances', 'Default: HR manager, then the financial accountant. Edit as needed.')) v(subject, name, description)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM "Company"."ApprovalWorkflows" x WHERE x."tenantId" = "pTenant" AND x.subject = "w".subject AND x."deletedAt" IS NULL) THEN
      INSERT INTO "Company"."ApprovalWorkflows" ("tenantId", name, subject, description, status, version, priority, "onComplete", "onReject",
                                                "notifyPreparer", "notifyInApp", "notifyEmail", "notifyWhatsapp", "publishedAt")
      VALUES ("pTenant", "w".name, "w".subject, "w".description, 'ACTIVE', 1, 100, 'MARK_APPROVED', 'RETURN_TO_PREPARER', true, true, false, false, now())
      RETURNING id INTO "vWf";
      INSERT INTO "Company"."ApprovalWorkflowSteps" ("tenantId", "workflowId", "stepNo", name, "approverType", "approverRoleId", "slaHours", "onSlaBreach",
                                                    "approvalMode", "blockSelfApproval", "allowDelegation", "requireComment")
      VALUES ("pTenant", "vWf", 1, 'HR manager', 'ROLE', "vHr", 48, 'REMIND', 'ANY', true, true, false),
             ("pTenant", "vWf", 2, 'Financial accountant', 'ROLE', "vFa", 48, 'REMIND', 'ANY', true, true, false);
      "vN" := "vN" + 1;
    END IF;
  END LOOP;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "Payroll"."triggerTenantPayrollRunDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Payroll"."seedPayrollRunDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

-- after the tenant's roles exist (provisionTenant creates them in the same transaction): deferred to the end of it
DROP TRIGGER IF EXISTS "tenantsPayrollRunDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsPayrollRunDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "Payroll"."triggerTenantPayrollRunDefaults"();

SELECT set_config('app.actorLabel', 'seedPayrollRunDefaultsFor', false);
SELECT "Payroll"."seedPayrollRunDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '203-payroll.sql', false);

-- ---------------------------------------------------------------------------
-- 8. Lookup tones (system rows) and the error catalogue
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" l SET tone = v.tone
  FROM (VALUES
    ('PayrollRunStatus', 'REVIEW', 'info'), ('PayrollRunStatus', 'AWAITING_APPROVAL', 'warn'), ('PayrollRunStatus', 'POSTED', 'info'),
    ('PayrollRunStatus', 'PAID', 'good'), ('PayrollRunStatus', 'REVERSED', 'neutral'), ('PayrollRunStatus', 'CANCELLED', 'neutral'),
    ('PayslipStatus', 'EMAILED', 'info'), ('PayslipStatus', 'VIEWED', 'good'), ('PayslipStatus', 'NO_EMAIL', 'danger'),
    ('LoanStatus', 'APPROVED', 'info'), ('LoanStatus', 'CLOSED', 'neutral'), ('LoanStatus', 'SETTLEMENT', 'warn'),
    ('LoanInstallmentStatus', 'SCHEDULED', 'neutral'), ('LoanInstallmentStatus', 'REQUESTED', 'info'), ('LoanInstallmentStatus', 'RECOVERED', 'good'),
    ('LoanInstallmentStatus', 'SKIPPED', 'warn'), ('InstallmentType', 'SCHEDULED', 'neutral'),
    ('SalaryPaymentBatchStatus', 'GENERATED', 'info'), ('TaxDeclarationStatus', 'IN_REVIEW', 'info')
  ) AS v("lookupType", code, tone)
 WHERE l."tenantId" IS NULL AND l."lookupType" = v."lookupType" AND l.code = v.code AND l.tone IS DISTINCT FROM v.tone;

INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('PAYROLL_RUN_EXISTS',          409, 'CONFLICT',      'PAYROLL', 'A regular payroll run for this month and pay group already exists.', 'Second open regular run for a month and pay group', true, NULL),
  ('PAYROLL_RUN_LOCKED',          409, 'BUSINESS_RULE', 'PAYROLL', 'This payroll run can''t be changed at its current step.', 'Edit, calculate or status move out of order', true, NULL),
  ('PAYROLL_NOT_APPROVED',        409, 'BUSINESS_RULE', 'PAYROLL', 'This payroll run must be approved before it is posted.', 'Post (or approve) of a run that has not gone through approval', true, NULL),
  ('PAYROLL_NOT_POSTED',          409, 'BUSINESS_RULE', 'PAYROLL', 'This payroll run must be posted first.', 'Pay or reverse of a run that is not posted', true, NULL),
  ('PAYROLL_PREPARER_APPROVAL',   403, 'PERMISSION',    'PAYROLL', 'The person who prepared this can''t approve it.', 'Preparer approving their own payroll run, loan or tax declaration', true, NULL),
  ('PAYROLL_NO_LINES',            409, 'BUSINESS_RULE', 'PAYROLL', 'There is nothing to pay in this payroll run.', 'Submit or pay with no payable lines', true, NULL),
  ('PAYROLL_SETUP_MISSING',       409, 'BUSINESS_RULE', 'PAYROLL', 'Payroll setup is incomplete. Check salary components and tax slabs.', 'Calculation needs a component or tax slab the company has not set up', true, NULL),
  ('LOAN_NOT_ACTIONABLE',         409, 'BUSINESS_RULE', 'PAYROLL', 'This loan can''t be changed at its current step.', 'Approve, reject or disburse out of order', true, NULL),
  ('LOAN_INSTALLMENTS_INVALID',   400, 'VALIDATION',    'PAYROLL', 'The installments don''t cover the loan amount.', 'Installment count or amount out of range', true, NULL),
  ('LOAN_OVER_LIMIT',             400, 'VALIDATION',    'PAYROLL', 'This request is over the loan policy limit.', 'Loan above the eligible limit or installment above the share of gross allowed', true, NULL),
  ('PAYSLIP_NOT_YOURS',           403, 'PERMISSION',    'PAYROLL', 'You can only see your own payslips.', 'Self-service access to another employee''s payslip, loan or declaration', true, NULL),
  ('NO_EMPLOYEE_RECORD',          409, 'BUSINESS_RULE', 'PAYROLL', 'Your user is not linked to an employee record.', 'Self-service payroll action by a user without an employee', true, NULL),
  ('TAX_PROOF_REQUIRED',          400, 'VALIDATION',    'PAYROLL', 'Upload the proof before this declaration is reviewed.', 'Declaration approved or sent for review without a proof file', true, NULL),
  ('TAX_DECLARATION_NOT_ACTIONABLE', 409, 'BUSINESS_RULE', 'PAYROLL', 'This declaration can''t be changed at its current step.', 'Edit, approve or reject out of order', true, NULL),
  ('ATTACHMENT_TYPE_NOT_ALLOWED', 400, 'VALIDATION',    'PAYROLL', 'This file type is not allowed. Use PDF, JPG or PNG.', 'Upload with a content type outside the allow-list', true, NULL),
  ('ATTACHMENT_TOO_LARGE',        400, 'VALIDATION',    'PAYROLL', 'This file is too large.', 'Upload above the size limit', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);
