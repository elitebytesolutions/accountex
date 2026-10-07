-- =============================================================================
-- Finsoft ERP (Full edition) — API: Payroll posting hooks
-- Hand-written. The generated actions in 12-Payroll-api.sql call these
-- "<entity><Action>Entries"(id) functions (when they exist) BEFORE they change
-- the document status. Rules: POSTING_RULES.md › Payroll (People).
--
--   payrollRunPostEntries        PRUN  JV: Dr earnings + employer cost / Cr payables,
--                                      loans & advances (employee sub-ledger), net pay;
--                                      loan installments → RECOVERED
--   payrollRunReverseEntries     PRUN  mirror JV, installments back to SCHEDULED
--   payrollRunCancelEntries      PRUN  as Reverse when the run was POSTED
--   loanApproveEntries           LN/ADV BPV/CPV: Dr loans / advances to employees / Cr bank or cash
--   finalSettlementApproveEntries FS   JV per settlement line, Cr final dues (employee);
--                                      recovered installments → SETTLED
--   finalSettlementCancelEntries FS    reverses the settlement voucher(s), installments reopened
--
-- Not posted here (no generated action / no GL effect): payrollRunApprove,
-- taxDeclarationApprove; salary payment batches and statutory deposits have
-- no generated action yet.
-- =============================================================================

-- Reverses the accrual journal of a payroll run (Reverse, or Cancel of a POSTED
-- run) and returns the loan installments it recovered to the schedule.
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunUnpost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"   uuid := "Company"."getCurrentTenantId"();
  "vRun"      record;
  "vReversal" uuid;
BEGIN
  SELECT r.id, r."docNo", r."payDate", r."journalEntryId" INTO "vRun"
    FROM "Payroll"."PayrollRuns" r
   WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;

  -- mirror JV dated the pay date, so the month nets to zero before the re-run
  PERFORM "Accounting"."journalReverseForSource"('PRUN', "vRun".id, 'OTHER', "vRun"."payDate");
  SELECT v.id INTO "vReversal"
    FROM "Accounting"."Vouchers" v
   WHERE v."tenantId" = "vTenant" AND v."reversalOfId" = "vRun"."journalEntryId";

  -- loans closed by this run's recovery are open again
  UPDATE "Payroll"."LoansAndAdvances" n
     SET status = 'ACTIVE', "closedAt" = NULL
   WHERE n."tenantId" = "vTenant" AND n.status = 'CLOSED'
     AND n.id IN (SELECT i."loanId"
                    FROM "Payroll"."LoanInstallments" i
                    JOIN "Payroll"."PayrollRunLines" l ON l."tenantId" = i."tenantId" AND l.id = i."payrollLineId"
                   WHERE i."tenantId" = "vTenant" AND l."payrollRunId" = "vRun".id);

  UPDATE "Payroll"."LoanInstallments" i
     SET status = 'SCHEDULED', "payrollLineId" = NULL, "recoveredAt" = NULL
    FROM "Payroll"."PayrollRunLines" l
   WHERE i."tenantId" = "vTenant" AND l."tenantId" = i."tenantId" AND l.id = i."payrollLineId"
     AND l."payrollRunId" = "vRun".id AND i.status = 'RECOVERED';

  IF "vReversal" IS NOT NULL THEN
    UPDATE "Payroll"."PayrollRuns" r
       SET "reversalJournalEntryId" = "vReversal"
     WHERE r."tenantId" = "vTenant" AND r.id = "vRun".id;
  END IF;
  RETURN "vReversal";
END $$;
COMMENT ON FUNCTION "Payroll"."payrollRunUnpost"(uuid) IS
  'Helper of the payroll run Reverse / Cancel hooks: mirror JV of the PRUN voucher, recovered installments back to SCHEDULED.';


-- Payroll run — Post & Pay step 5: one JV dated the pay date.
--   Dr EARNING components (debitAccountId) per account × branch × cost centre
--   Dr EMPLOYER_CONTRIBUTION components (debitAccountId), Cr their creditAccountId
--   Cr DEDUCTION components (creditAccountId): ITX 149, EOBI, PF …; loan / advance
--      recovery per employee (employeeId sub-ledger)
--   Cr salary payable (PayrollRuns.salaryPayableAccountId) = Σ net pay
-- Lines on hold are excluded (paid in the final settlement).
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunPostEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"   uuid := "Company"."getCurrentTenantId"();
  "vRun"      record;
  "vGross"    numeric(18,2);
  "vDed"      numeric(18,2);
  "vEarnComp" numeric(18,2);
  "vDedComp"  numeric(18,2);
  "vLines"    jsonb;
  "vJe"       uuid;
  "vRec"      record;
  "vInst"     record;
  "vLeft"     numeric(18,2);
BEGIN
  SELECT r.id, r."docNo", r."payrollMonth", r."payDate", r."salaryPayableAccountId", r.narration
    INTO "vRun"
    FROM "Payroll"."PayrollRuns" r
   WHERE r."tenantId" = "vTenant" AND r.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;

  -- the component breakdown must add up to the calculated lines
  SELECT COALESCE(sum(l."grossAmount"), 0), COALESCE(sum(l."deductionAmount"), 0)
    INTO "vGross", "vDed"
    FROM "Payroll"."PayrollRunLines" l
   WHERE l."tenantId" = "vTenant" AND l."payrollRunId" = "vRun".id AND NOT l."isOnHold";
  SELECT COALESCE(sum(c.amount) FILTER (WHERE c."componentType" = 'EARNING'), 0),
         COALESCE(sum(c.amount) FILTER (WHERE c."componentType" = 'DEDUCTION'), 0)
    INTO "vEarnComp", "vDedComp"
    FROM "Payroll"."PayrollRunLineComponents" c
    JOIN "Payroll"."PayrollRunLines" l ON l."tenantId" = c."tenantId" AND l.id = c."payrollLineId"
   WHERE c."tenantId" = "vTenant" AND l."payrollRunId" = "vRun".id AND NOT l."isOnHold";
  IF "vGross" <= 0 THEN
    RAISE EXCEPTION 'Payroll run % has no pay to post', "vRun"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  IF "vEarnComp" <> "vGross" OR "vDedComp" <> "vDed" THEN
    RAISE EXCEPTION 'Payroll run %: components (earnings %, deductions %) do not match the lines (gross %, deductions %); recalculate the run',
      "vRun"."docNo", "vEarnComp", "vDedComp", "vGross", "vDed" USING ERRCODE = 'check_violation';
  END IF;

  WITH x AS (
    SELECT l."employeeId", l."branchId", COALESCE(l."costCentreId", d."costCentreId") AS "costCentreId",
           c."componentType", c."loanId", c.amount, s."debitAccountId", s."creditAccountId", s.name, s."systemRole"
      FROM "Payroll"."PayrollRunLineComponents" c
      JOIN "Payroll"."PayrollRunLines" l ON l."tenantId" = c."tenantId" AND l.id = c."payrollLineId"
      JOIN "Payroll"."SalaryComponents" s ON s."tenantId" = c."tenantId" AND s.id = c."componentId"
      LEFT JOIN "HumanResources"."Departments" d ON d."tenantId" = l."tenantId" AND d.id = l."departmentId"
     WHERE c."tenantId" = "vTenant" AND l."payrollRunId" = "vRun".id AND NOT l."isOnHold" AND c.amount > 0
  ), g AS (
    -- Dr salaries & wages / employer contribution expense per department (cost centre)
    SELECT 1 AS ord, x."debitAccountId" AS "accountId", x."branchId", x."costCentreId", NULL::uuid AS "employeeId",
           min(x.name) AS particulars, sum(x.amount) AS debit, 0::numeric AS credit
      FROM x
     WHERE x."componentType" IN ('EARNING', 'EMPLOYER_CONTRIBUTION')
     GROUP BY x."debitAccountId", x."branchId", x."costCentreId"
    UNION ALL
    -- Cr employer contribution payables (EOBI, PESSI, PF, gratuity provision)
    SELECT 2, x."creditAccountId", x."branchId", NULL::uuid, NULL::uuid,
           min(x.name), 0::numeric, sum(x.amount)
      FROM x
     WHERE x."componentType" = 'EMPLOYER_CONTRIBUTION'
     GROUP BY x."creditAccountId", x."branchId"
    UNION ALL
    -- Cr statutory and other deductions (income tax u/s 149, EOBI, PF …)
    SELECT 3, x."creditAccountId", x."branchId", NULL::uuid, NULL::uuid,
           min(x.name), 0::numeric, sum(x.amount)
      FROM x
     WHERE x."componentType" = 'DEDUCTION' AND x."loanId" IS NULL
       AND x."systemRole" IS DISTINCT FROM 'LOAN' AND x."systemRole" IS DISTINCT FROM 'ADVANCE'
     GROUP BY x."creditAccountId", x."branchId"
    UNION ALL
    -- Cr loans / advances to employees (sub-ledger per employee)
    SELECT 4, x."creditAccountId", x."branchId", NULL::uuid, x."employeeId",
           min(x.name), 0::numeric, sum(x.amount)
      FROM x
     WHERE x."componentType" = 'DEDUCTION'
       AND (x."loanId" IS NOT NULL OR x."systemRole" IN ('LOAN', 'ADVANCE'))
     GROUP BY x."creditAccountId", x."branchId", x."employeeId"
    UNION ALL
    -- Cr salaries payable = net pay
    SELECT 5, "vRun"."salaryPayableAccountId", l."branchId", NULL::uuid, NULL::uuid,
           'Net salaries payable', 0::numeric, sum(l."netAmount")
      FROM "Payroll"."PayrollRunLines" l
     WHERE l."tenantId" = "vTenant" AND l."payrollRunId" = "vRun".id AND NOT l."isOnHold"
     GROUP BY l."branchId"
  )
  SELECT jsonb_agg(jsonb_build_object('accountId', g."accountId", 'debit', g.debit, 'credit', g.credit,
                                      'particulars', g.particulars, 'branchId', g."branchId",
                                      'costCentreId', g."costCentreId", 'employeeId', g."employeeId")
                   ORDER BY g.ord, g.particulars)
    INTO "vLines"
    FROM g;

  "vJe" := "Accounting"."journalCreate"(
    jsonb_build_object('voucherType', 'JV', 'docDate', "vRun"."payDate", 'postingDate', "vRun"."payDate",
                       'narration', COALESCE("vRun".narration,
                                             'Payroll ' || to_char("vRun"."payrollMonth", 'FMMonth YYYY') || ' (' || "vRun"."docNo" || ')'),
                       'sourceDocType', 'PRUN', 'sourceDocId', "vRun".id, 'sourceDocNo', "vRun"."docNo"),
    "vLines");

  UPDATE "Payroll"."PayrollRuns" r
     SET "journalEntryId" = "vJe",
         "fiscalPeriodId" = COALESCE((SELECT v."fiscalPeriodId" FROM "Accounting"."Vouchers" v
                                       WHERE v."tenantId" = "vTenant" AND v.id = "vJe"), r."fiscalPeriodId")
   WHERE r."tenantId" = "vTenant" AND r.id = "vRun".id;

  -- loan / advance installments recovered by this run (oldest first, whole installments)
  FOR "vRec" IN
    SELECT c."loanId", c."payrollLineId", sum(c.amount) AS amount
      FROM "Payroll"."PayrollRunLineComponents" c
      JOIN "Payroll"."PayrollRunLines" l ON l."tenantId" = c."tenantId" AND l.id = c."payrollLineId"
     WHERE c."tenantId" = "vTenant" AND l."payrollRunId" = "vRun".id AND NOT l."isOnHold"
       AND c."loanId" IS NOT NULL AND c."componentType" = 'DEDUCTION'
     GROUP BY c."loanId", c."payrollLineId"
  LOOP
    "vLeft" := "vRec".amount;
    FOR "vInst" IN
      SELECT i.id, i.amount
        FROM "Payroll"."LoanInstallments" i
       WHERE i."tenantId" = "vTenant" AND i."loanId" = "vRec"."loanId" AND i.status IN ('SCHEDULED', 'REQUESTED')
       ORDER BY i."dueMonth", i."installmentNo"
         FOR UPDATE
    LOOP
      EXIT WHEN "vLeft" < "vInst".amount;
      UPDATE "Payroll"."LoanInstallments" i
         SET status = 'RECOVERED', "payrollLineId" = "vRec"."payrollLineId", "recoveredAt" = now()
       WHERE i."tenantId" = "vTenant" AND i.id = "vInst".id;
      "vLeft" := "vLeft" - "vInst".amount;
    END LOOP;
  END LOOP;
END $$;
COMMENT ON FUNCTION "Payroll"."payrollRunPostEntries"(uuid) IS
  'Posting hook of Payroll.payrollRunPost: accrual JV (source PRUN) and loan installment recovery.';


-- Payroll run — Reverse (POSTED → REVERSED): mirror JV, installments rescheduled.
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunReverseEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vStatus" text;
BEGIN
  SELECT r.status INTO "vStatus"
    FROM "Payroll"."PayrollRuns" r
   WHERE r."tenantId" = "Company"."getCurrentTenantId"() AND r.id = "pId";
  IF "vStatus" = 'POSTED' THEN
    IF "Payroll"."payrollRunUnpost"("pId") IS NULL THEN
      RAISE EXCEPTION 'Payroll run has no posted journal to reverse' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
END $$;
COMMENT ON FUNCTION "Payroll"."payrollRunReverseEntries"(uuid) IS
  'Posting hook of Payroll.payrollRunReverse: mirror JV (reversalJournalEntryId), recovered installments back to SCHEDULED.';


-- Payroll run — Cancel: a POSTED run is reversed first; a PAID run must have its
-- salary payments reversed before it can be cancelled.
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRun" record;
BEGIN
  SELECT r."docNo", r.status INTO "vRun"
    FROM "Payroll"."PayrollRuns" r
   WHERE r."tenantId" = "Company"."getCurrentTenantId"() AND r.id = "pId";
  IF "vRun".status = 'PAID' THEN
    RAISE EXCEPTION 'Payroll run % is paid: reverse the salary payments first', "vRun"."docNo"
      USING ERRCODE = 'object_not_in_prerequisite_state';
  ELSIF "vRun".status = 'POSTED' THEN
    PERFORM "Payroll"."payrollRunUnpost"("pId");
  END IF;
END $$;
COMMENT ON FUNCTION "Payroll"."payrollRunCancelEntries"(uuid) IS
  'Posting hook of Payroll.payrollRunCancel: reverses the accrual of a POSTED run; refuses a PAID run.';


-- Loan / salary advance — Approve: when the disbursement source (bank or cash)
-- is set, posts the disbursement voucher:
--   Dr loans to employees (LOAN, MEDICAL) / advances to employees (SALARY_ADVANCE), employeeId
--   Cr bank (BPV) or cash (CPV)
-- The loan account is the credit account of the LOAN / ADVANCE salary component
-- (the account payroll recovery credits), else role EMPLOYEE_LOANS / EMPLOYEE_ADVANCES.
CREATE OR REPLACE FUNCTION "Payroll"."loanApproveEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant"   uuid := "Company"."getCurrentTenantId"();
  "vLoan"     record;
  "vLoanAcc"  uuid;
  "vCashAcc"  uuid;
  "vType"     text;
  "vDate"     date;
  "vJe"       uuid;
BEGIN
  SELECT n.id, n."docNo", n."loanType", n."employeeId", n."approvedAmount", n."requestedAmount",
         n."disbursementDate", n."disbursedFromBankAccountId", n."disbursedFromCashAccountId",
         n."disbursementJournalEntryId", e."displayName", e."branchId"
    INTO "vLoan"
    FROM "Payroll"."LoansAndAdvances" n
    JOIN "HumanResources"."Employees" e ON e."tenantId" = n."tenantId" AND e.id = n."employeeId"
   WHERE n."tenantId" = "vTenant" AND n.id = "pId";
  IF NOT FOUND OR "vLoan"."disbursementJournalEntryId" IS NOT NULL THEN
    RETURN;
  END IF;
  IF "vLoan"."disbursedFromBankAccountId" IS NOT NULL THEN
    SELECT b."accountId" INTO "vCashAcc" FROM "BankCash"."BankAccounts" b
     WHERE b."tenantId" = "vTenant" AND b.id = "vLoan"."disbursedFromBankAccountId";
    "vType" := 'BPV';
  ELSIF "vLoan"."disbursedFromCashAccountId" IS NOT NULL THEN
    SELECT c."accountId" INTO "vCashAcc" FROM "BankCash"."CashAccounts" c
     WHERE c."tenantId" = "vTenant" AND c.id = "vLoan"."disbursedFromCashAccountId";
    "vType" := 'CPV';
  ELSE
    RETURN;                                   -- not disbursed yet: no voucher
  END IF;

  SELECT s."creditAccountId" INTO "vLoanAcc"
    FROM "Payroll"."SalaryComponents" s
   WHERE s."tenantId" = "vTenant" AND s."deletedAt" IS NULL
     AND s."systemRole" = CASE WHEN "vLoan"."loanType" = 'SALARY_ADVANCE' THEN 'ADVANCE' ELSE 'LOAN' END;
  IF "vLoanAcc" IS NULL THEN
    "vLoanAcc" := "Company"."getAccountForRole"(
      CASE WHEN "vLoan"."loanType" = 'SALARY_ADVANCE' THEN 'EMPLOYEE_ADVANCES' ELSE 'EMPLOYEE_LOANS' END);
  END IF;

  "vDate" := COALESCE("vLoan"."disbursementDate", current_date);
  "vJe" := "Accounting"."journalCreate"(
    jsonb_build_object('voucherType', "vType", 'docDate', "vDate", 'postingDate', "vDate",
                       'branchId', "vLoan"."branchId",
                       'narration', 'Disbursement of ' || "vLoan"."docNo" || ' — ' || "vLoan"."displayName",
                       'partyName', "vLoan"."displayName", 'cashBankAccountId', "vCashAcc",
                       'sourceDocType', CASE WHEN "vLoan"."loanType" = 'SALARY_ADVANCE' THEN 'ADV' ELSE 'LN' END,
                       'sourceDocId', "vLoan".id, 'sourceDocNo', "vLoan"."docNo"),
    jsonb_build_array(
      jsonb_build_object('accountId', "vLoanAcc", 'debit', COALESCE("vLoan"."approvedAmount", "vLoan"."requestedAmount"),
                         'employeeId', "vLoan"."employeeId", 'particulars', "vLoan"."docNo" || ' — ' || "vLoan"."displayName"),
      jsonb_build_object('accountId', "vCashAcc", 'credit', COALESCE("vLoan"."approvedAmount", "vLoan"."requestedAmount"),
                         'particulars', 'Disbursed ' || "vLoan"."docNo")));

  UPDATE "Payroll"."LoansAndAdvances" n
     SET "disbursementJournalEntryId" = "vJe", "disbursementDate" = "vDate"
   WHERE n."tenantId" = "vTenant" AND n.id = "vLoan".id;
END $$;
COMMENT ON FUNCTION "Payroll"."loanApproveEntries"(uuid) IS
  'Posting hook of Payroll.loanApprove: disbursement BPV/CPV (source LN/ADV) when a bank or cash source is set.';


-- Final settlement — Approve: one JV (source FS) dated the settlement date.
--   Dr earnings: pending salary, leave encashment, notice pay, bonus → line / component
--      debit account, else the BASIC component account, else SALARY_EXPENSE;
--      gratuity → the gratuity provision (GRATUITY component credit account)
--   Cr deductions: advance / loan recovery (employee sub-ledger), income tax u/s 149,
--      EOBI, notice shortfall and other deductions (line account required)
--   Cr SALARIES_PAYABLE (employee sub-ledger) = net final dues
-- Recovered installments become SETTLED (the loan closes when fully recovered).
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementApproveEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vFs"     record;
  "vLine"   record;
  "vInst"   record;
  "vAcc"    uuid;
  "vRole"   text;
  "vLines"  jsonb := '[]'::jsonb;
  "vJe"     uuid;
  "vLeft"   numeric(18,2);
BEGIN
  SELECT f.id, f."docNo", f."docDate", f."employeeId", f."netAmount", f."journalEntryId",
         e."displayName", e."branchId", COALESCE(e."costCentreId", d."costCentreId") AS "costCentreId"
    INTO "vFs"
    FROM "Payroll"."FinalSettlements" f
    JOIN "HumanResources"."Employees" e ON e."tenantId" = f."tenantId" AND e.id = f."employeeId"
    LEFT JOIN "HumanResources"."Departments" d ON d."tenantId" = e."tenantId" AND d.id = e."departmentId"
   WHERE f."tenantId" = "vTenant" AND f.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Final settlement % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;

  FOR "vLine" IN
    SELECT c."lineNo", c."componentKind", c.direction, c.label, c.amount, c."loanId", c."accountId",
           CASE WHEN c.direction = 'EARNING' AND c."componentKind" <> 'GRATUITY'
                THEN s."debitAccountId" ELSE s."creditAccountId" END AS "componentAccountId",
           n."loanType"
      FROM "Payroll"."FinalSettlementLines" c
      LEFT JOIN "Payroll"."SalaryComponents" s ON s."tenantId" = c."tenantId" AND s.id = c."componentId"
      LEFT JOIN "Payroll"."LoansAndAdvances" n ON n."tenantId" = c."tenantId" AND n.id = c."loanId"
     WHERE c."tenantId" = "vTenant" AND c."settlementId" = "vFs".id AND c.amount > 0
     ORDER BY c."lineNo"
  LOOP
    "vAcc" := COALESCE("vLine"."accountId", "vLine"."componentAccountId");
    IF "vAcc" IS NULL THEN
      -- fall back to the salary component of the matching system role, then to a posting role
      SELECT CASE WHEN "vLine".direction = 'EARNING' AND "vLine"."componentKind" <> 'GRATUITY'
                  THEN s."debitAccountId" ELSE s."creditAccountId" END
        INTO "vAcc"
        FROM "Payroll"."SalaryComponents" s
       WHERE s."tenantId" = "vTenant" AND s."deletedAt" IS NULL
         AND s."systemRole" = CASE
               WHEN "vLine"."componentKind" = 'GRATUITY'   THEN 'GRATUITY'
               WHEN "vLine"."componentKind" = 'INCOME_TAX' THEN 'INCOME_TAX'
               WHEN "vLine"."componentKind" = 'EOBI'       THEN 'EOBI_EMPLOYEE'
               WHEN "vLine"."componentKind" IN ('ADVANCE_RECOVERY', 'LOAN_RECOVERY')
                 THEN CASE WHEN "vLine"."loanType" = 'SALARY_ADVANCE' THEN 'ADVANCE' ELSE 'LOAN' END
               WHEN "vLine".direction = 'EARNING'         THEN 'BASIC'
             END;
    END IF;
    IF "vAcc" IS NULL THEN
      "vRole" := CASE
          WHEN "vLine"."componentKind" = 'INCOME_TAX' THEN 'INCOME_TAX_PAYABLE_SALARY'
          WHEN "vLine"."componentKind" = 'EOBI'       THEN 'EOBI_PAYABLE'
          WHEN "vLine"."componentKind" IN ('ADVANCE_RECOVERY', 'LOAN_RECOVERY')
            THEN CASE WHEN "vLine"."loanType" = 'SALARY_ADVANCE' THEN 'EMPLOYEE_ADVANCES' ELSE 'EMPLOYEE_LOANS' END
          WHEN "vLine".direction = 'EARNING' AND "vLine"."componentKind" <> 'GRATUITY' THEN 'SALARY_EXPENSE'
        END;
      IF "vRole" IS NULL THEN
        RAISE EXCEPTION 'Final settlement % line % (%): choose the GL account', "vFs"."docNo", "vLine"."lineNo", "vLine".label
          USING ERRCODE = 'check_violation';
      END IF;
      "vAcc" := "Company"."getAccountForRole"("vRole");
    END IF;

    "vLines" := "vLines" || jsonb_build_array(jsonb_build_object(
      'accountId', "vAcc",
      'debit',  CASE WHEN "vLine".direction = 'EARNING' THEN "vLine".amount ELSE 0 END,
      'credit', CASE WHEN "vLine".direction = 'EARNING' THEN 0 ELSE "vLine".amount END,
      'particulars', "vLine".label,
      'branchId', "vFs"."branchId",
      'costCentreId', CASE WHEN "vLine".direction = 'EARNING' THEN "vFs"."costCentreId" END,
      'employeeId', CASE WHEN "vLine"."componentKind" IN ('ADVANCE_RECOVERY', 'LOAN_RECOVERY')
                         THEN "vFs"."employeeId" END));
  END LOOP;

  -- net final dues (a negative net — employee owes — flips to a debit)
  "vLines" := "vLines" || jsonb_build_array(jsonb_build_object(
    'accountRole', 'SALARIES_PAYABLE', 'credit', "vFs"."netAmount", 'branchId', "vFs"."branchId",
    'employeeId', "vFs"."employeeId", 'particulars', 'Final dues — ' || "vFs"."displayName"));

  "vJe" := "Accounting"."journalCreate"(
    jsonb_build_object('voucherType', 'JV', 'docDate', "vFs"."docDate", 'postingDate', "vFs"."docDate",
                       'branchId', "vFs"."branchId",
                       'narration', 'Full & final settlement ' || "vFs"."docNo" || ' — ' || "vFs"."displayName",
                       'sourceDocType', 'FS', 'sourceDocId', "vFs".id, 'sourceDocNo', "vFs"."docNo"),
    "vLines");

  UPDATE "Payroll"."FinalSettlements" f
     SET "journalEntryId" = "vJe"
   WHERE f."tenantId" = "vTenant" AND f.id = "vFs".id;

  -- installments recovered in the settlement
  FOR "vLine" IN
    SELECT c."loanId", sum(c.amount) AS amount
      FROM "Payroll"."FinalSettlementLines" c
     WHERE c."tenantId" = "vTenant" AND c."settlementId" = "vFs".id
       AND c."componentKind" IN ('ADVANCE_RECOVERY', 'LOAN_RECOVERY') AND c."loanId" IS NOT NULL
     GROUP BY c."loanId"
  LOOP
    "vLeft" := "vLine".amount;
    FOR "vInst" IN
      SELECT i.id, i.amount
        FROM "Payroll"."LoanInstallments" i
       WHERE i."tenantId" = "vTenant" AND i."loanId" = "vLine"."loanId" AND i.status IN ('SCHEDULED', 'REQUESTED')
       ORDER BY i."dueMonth", i."installmentNo"
         FOR UPDATE
    LOOP
      EXIT WHEN "vLeft" < "vInst".amount;
      UPDATE "Payroll"."LoanInstallments" i
         SET status = 'SETTLED', "finalSettlementId" = "vFs".id, "recoveredAt" = now()
       WHERE i."tenantId" = "vTenant" AND i.id = "vInst".id;
      "vLeft" := "vLeft" - "vInst".amount;
    END LOOP;
  END LOOP;
END $$;
COMMENT ON FUNCTION "Payroll"."finalSettlementApproveEntries"(uuid) IS
  'Posting hook of Payroll.finalSettlementApprove: settlement JV (source FS), recovered installments SETTLED.';


-- Final settlement — Cancel (APPROVED / PAID): reverses every posted voucher of
-- the settlement (accrual and, when sourced FS, the payment) and reopens the
-- installments it settled.
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementCancelEntries"("pId" uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vStatus" text;
BEGIN
  SELECT f.status INTO "vStatus"
    FROM "Payroll"."FinalSettlements" f
   WHERE f."tenantId" = "vTenant" AND f.id = "pId";
  IF "vStatus" IS NULL OR "vStatus" NOT IN ('APPROVED', 'PAID') THEN
    RETURN;
  END IF;

  PERFORM "Accounting"."journalReverseForSource"('FS', "pId", 'OTHER', current_date);

  UPDATE "Payroll"."LoansAndAdvances" n
     SET status = 'ACTIVE', "closedAt" = NULL
   WHERE n."tenantId" = "vTenant" AND n.status = 'CLOSED'
     AND n.id IN (SELECT i."loanId" FROM "Payroll"."LoanInstallments" i
                   WHERE i."tenantId" = "vTenant" AND i."finalSettlementId" = "pId");
  UPDATE "Payroll"."LoanInstallments" i
     SET status = 'SCHEDULED', "finalSettlementId" = NULL, "recoveredAt" = NULL
   WHERE i."tenantId" = "vTenant" AND i."finalSettlementId" = "pId" AND i.status = 'SETTLED';
END $$;
COMMENT ON FUNCTION "Payroll"."finalSettlementCancelEntries"(uuid) IS
  'Posting hook of Payroll.finalSettlementCancel: reverses the FS voucher(s) and reopens settled installments.';
