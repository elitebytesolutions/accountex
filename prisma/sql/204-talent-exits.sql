-- 204-talent-exits.sql
-- Phase 33 rev 2 (exits half): final settlements, employee letters (English only) and employee assets.
--  * FS / LTR numbering per company (+ new companies), the FINAL_SETTLEMENT approval subject with a default
--    HR manager → financial accountant workflow, the gratuity rule as a company payroll setting, English HR letter
--    templates per company.
--  * Settlements: finalSettlementStart / Calculate / Submit / SendBack / Approve / Pay; totals refreshed on save and
--    approve; journal / payment / paid fields no longer writable; account fallbacks by posting role; partial loan
--    installments recovered; finalSettlementPayEntries (Dr salaries payable / Cr bank via BankCash.postBankingVoucher).
--  * offboardingComplete refuses while the exit has no APPROVED (or PAID) settlement.
--  * Letters: numbered drafts with a verification code, issue (with the PDF attachment) and void.
--  * Assets: issue / return; issued assets become clearance items of an open exit and returning one clears its item.
--  * Row history on EmployeeAssets; error codes; lookup labels.
-- The calculation needs the employee's salary breakdown, which only the app can evaluate (structure formulas): the app
-- passes it in (Phase 12 computeLines + the Phase 32 calculator); everything else is computed here.
-- Idempotent: safe to run repeatedly via npm run db:sql.

SELECT set_config('app.actorLabel', '204-talent-exits.sql', false);

-- ---------------------------------------------------------------------------
-- 1. Row history: EmployeeAssets was the only table of this half without it.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "employeeAssetsAudit" ON "HumanResources"."EmployeeAssets";
CREATE TRIGGER "employeeAssetsAudit" AFTER INSERT OR UPDATE OR DELETE ON "HumanResources"."EmployeeAssets"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Lookups: the approval subject, two more HR letter kinds, a label fix.
-- ---------------------------------------------------------------------------
INSERT INTO "Lookups"."Lookups" ("lookupType", code, label, tone, "sortOrder", "isActive", "isSystem")
VALUES ('Subject', 'FINAL_SETTLEMENT', 'Final settlement', 'neutral', 16, true, true),
       ('LetterKind', 'APPOINTMENT', 'Appointment', 'neutral', 2, true, true),
       ('LetterKind', 'RELIEVING', 'Relieving', 'neutral', 5, true, true)
ON CONFLICT ("lookupType", code, "tenantId") DO NOTHING;

UPDATE "Lookups"."Lookups" l SET label = 'Notice pay'
 WHERE l."tenantId" IS NULL AND l."lookupType" = 'FinalSettlementLineComponentKind' AND l.code = 'NOTICE_PAY' AND l.label <> 'Notice pay';

-- ---------------------------------------------------------------------------
-- 3. The gratuity rule (Company.CompanySettingValues PAYROLL / gratuity), with its defaults when a company has none:
--    30 days' pay per year of service, from 1 full year, a part-year over 6 months counts as a year, the first
--    Rs 300,000 tax-exempt. Base: the last salary's components flagged "include in gratuity base" (from the app).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Payroll"."gratuityRule"()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT jsonb_build_object('daysPerYear', 30, 'minServiceYears', 1, 'partYearOverMonths', 6, 'taxExemptAmount', 300000)
         || COALESCE((SELECT v.value FROM "Company"."CompanySettingValues" v
                       WHERE v."tenantId" = "Company"."getCurrentTenantId"() AND v."settingGroup" = 'PAYROLL' AND v.key = 'gratuity'), '{}'::jsonb)
$function$;

COMMENT ON FUNCTION "Payroll"."gratuityRule"() IS
  'The company gratuity rule (PAYROLL / gratuity setting over the defaults: 30 days per year from 1 full year, part-year over 6 months counts, Rs 300,000 exempt).';

-- Pakistan's tax: slab tax on income less Zakat, credits for VPS / donations / health insurance at the average rate
-- (mirrors the Phase 32 payrollAnnualTax in src/shared/payroll/tax-declaration.ts).
CREATE OR REPLACE FUNCTION "Payroll"."settlementAnnualTax"("pTenant" uuid, "pTaxYear" text, "pIncome" numeric, "pEmployeeId" uuid, "pAsOf" date)
  RETURNS numeric
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vZakat"   numeric := 0;
  "vVps"     numeric := 0;
  "vDon"     numeric := 0;
  "vHealth"  numeric := 0;
  "vTaxable" numeric;
  "vSlab"    record;
  "vTax"     numeric := 0;
  "vAvg"     numeric;
BEGIN
  SELECT COALESCE(sum(d.amount) FILTER (WHERE d."declarationType" = 'ZAKAT'), 0),
         COALESCE(sum(d.amount) FILTER (WHERE d."declarationType" = 'VPS_PENSION'), 0),
         COALESCE(sum(d.amount) FILTER (WHERE d."declarationType" = 'DONATION'), 0),
         COALESCE(sum(d.amount) FILTER (WHERE d."declarationType" = 'HEALTH_INSURANCE'), 0)
    INTO "vZakat", "vVps", "vDon", "vHealth"
    FROM "Payroll"."TaxDeclarations" d
   WHERE d."tenantId" = "pTenant" AND d."employeeId" = "pEmployeeId" AND d."taxYear" = "pTaxYear" AND d.status = 'APPROVED'
     AND (d."effectiveFromMonth" IS NULL OR d."effectiveFromMonth" <= "pAsOf");
  "vZakat" := least(greatest(0, "vZakat"), greatest(0, "pIncome"));
  "vTaxable" := greatest(0, round("pIncome" - "vZakat"));
  SELECT * INTO "vSlab" FROM "Payroll"."SalaryTaxSlabs" s
   WHERE s."tenantId" = "pTenant" AND s."taxYear" = "pTaxYear" AND "vTaxable" >= s."incomeFrom" AND (s."incomeTo" IS NULL OR "vTaxable" < s."incomeTo")
   ORDER BY s."slabNo" LIMIT 1;
  IF FOUND THEN
    "vTax" := round("vSlab"."fixedTax" + ("vTaxable" - "vSlab"."incomeFrom") * "vSlab"."ratePercent" / 100);
  END IF;
  "vAvg" := CASE WHEN "vTaxable" > 0 THEN "vTax" / "vTaxable" ELSE 0 END;
  RETURN greatest(0, "vTax" - round("vAvg" * least("vVps", "vTaxable" * 0.2)) - round("vAvg" * least("vDon", "vTaxable" * 0.3))
                       - round("vAvg" * least("vHealth", 150000)));
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Final settlements. DRAFT → (submit) PENDING_APPROVAL → (approve: JV) APPROVED → (pay: BPV) PAID; CANCELLED from
--    any state (posted vouchers reversed). The preparer (who submitted, else who created) never approves.
-- ---------------------------------------------------------------------------

-- Totals and the amount in words follow the lines (refreshed on save, calculate and approve).
CREATE OR REPLACE FUNCTION "Payroll"."refreshFinalSettlementTotals"("pSettlementId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  t         record;
BEGIN
  SELECT COALESCE(sum(c.amount) FILTER (WHERE c.direction = 'EARNING'), 0)   AS earn,
         COALESCE(sum(c.amount) FILTER (WHERE c.direction = 'DEDUCTION'), 0) AS ded
    INTO t
    FROM "Payroll"."FinalSettlementLines" c
   WHERE c."tenantId" = "vTenant" AND c."settlementId" = "pSettlementId";
  UPDATE "Payroll"."FinalSettlements" s
     SET "earningsAmount" = t.earn, "deductionAmount" = t.ded, "netAmount" = t.earn - t.ded
   WHERE s."tenantId" = "vTenant" AND s.id = "pSettlementId"
     AND (s."earningsAmount", s."deductionAmount", s."netAmount") IS DISTINCT FROM (t.earn, t.ded, t.earn - t.ded);
END $function$;

-- Save (replaces the generated function): header fields that are the preparer's to set, and the lines (rows missing
-- from "lines" are removed, rows with "id" updated, others inserted; direction follows the kind). Status, totals,
-- approval, journal and payment fields are never taken from the payload. Only a DRAFT is edited.
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec"    "Payroll"."FinalSettlements";
  "vId"     uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet"    uuid;
  "vStatus" text;
  "vLine"   "Payroll"."FinalSettlementLines";
  "vE"      jsonb;
  "vN"      bigint;
  "vCid"    uuid;
  "vMax"    smallint;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Payroll"."FinalSettlements", "pData");
  IF "vId" IS NULL THEN
    IF "vRec"."offboardingId" IS NULL THEN
      RAISE EXCEPTION 'A final settlement starts from an exit' USING ERRCODE = 'check_violation', HINT = 'VALIDATION_FAILED';
    END IF;
    RETURN "Payroll"."finalSettlementStart"("vRec"."offboardingId");
  END IF;

  SELECT t.status INTO "vStatus" FROM "Payroll"."FinalSettlements" t WHERE t.id = "vId" AND t."tenantId" = "vTenant" FOR UPDATE;
  IF "vStatus" IS NULL THEN
    RAISE EXCEPTION 'FinalSettlements % not found', "vId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vStatus" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only a draft settlement can be edited (this one is %)', lower(replace("vStatus", '_', ' '))
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'FINAL_SETTLEMENT_LOCKED';
  END IF;
  UPDATE "Payroll"."FinalSettlements" t
     SET "docDate" = CASE WHEN "pData" ? 'docDate' THEN COALESCE("vRec"."docDate", t."docDate") ELSE t."docDate" END,
         "pfTrustBalanceAmount" = CASE WHEN "pData" ? 'pfTrustBalanceAmount' THEN "vRec"."pfTrustBalanceAmount" ELSE t."pfTrustBalanceAmount" END,
         "employeeBankId" = CASE WHEN "pData" ? 'employeeBankId' THEN "vRec"."employeeBankId" ELSE t."employeeBankId" END,
         "payFromBankAccountId" = CASE WHEN "pData" ? 'payFromBankAccountId' THEN "vRec"."payFromBankAccountId" ELSE t."payFromBankAccountId" END,
         "netAmountWords" = CASE WHEN "pData" ? 'netAmountWords' THEN "vRec"."netAmountWords" ELSE t."netAmountWords" END,
         remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
   WHERE t.id = "vId" AND t."tenantId" = "vTenant"
     AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
  RETURNING t.id INTO "vRet";
  IF "vRet" IS NULL THEN
    RAISE EXCEPTION 'FinalSettlements %: record was changed by another user, reload and try again', "vId" USING ERRCODE = 'serialization_failure';
  END IF;

  IF "pData" ? 'lines' THEN
    DELETE FROM "Payroll"."FinalSettlementLines"
     WHERE "tenantId" = "vTenant" AND "settlementId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    -- park the kept rows' numbers out of the way, then number every row in payload order
    UPDATE "Payroll"."FinalSettlementLines" c SET "lineNo" = c."lineNo" + 1000 WHERE c."tenantId" = "vTenant" AND c."settlementId" = "vRet";
    FOR "vE", "vN" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vLine" := jsonb_populate_record(NULL::"Payroll"."FinalSettlementLines", "vE");
      "vLine".direction := CASE WHEN "vLine"."componentKind" IN ('PENDING_SALARY', 'LEAVE_ENCASHMENT', 'GRATUITY', 'NOTICE_PAY', 'BONUS', 'OTHER_EARNING') THEN 'EARNING' ELSE 'DEDUCTION' END;
      IF "vE" ? 'id' THEN
        UPDATE "Payroll"."FinalSettlementLines" t
           SET "lineNo" = "vN", "componentKind" = "vLine"."componentKind", direction = "vLine".direction, label = "vLine".label,
               "basisText" = "vLine"."basisText", quantity = "vLine".quantity, rate = "vLine".rate, amount = "vLine".amount,
               "taxableAmount" = "vLine"."taxableAmount", "componentId" = "vLine"."componentId", "loanId" = "vLine"."loanId", "accountId" = "vLine"."accountId"
         WHERE t.id = ("vE" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."settlementId" = "vRet"
        RETURNING t.id INTO "vCid";
        IF "vCid" IS NULL THEN
          RAISE EXCEPTION 'FinalSettlementLines: row % does not belong to this settlement', "vE" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."FinalSettlementLines" ("tenantId", "settlementId", "lineNo", "componentKind", direction, label, "basisText", quantity, rate, amount,
                                                      "taxableAmount", "componentId", "loanId", "accountId")
        VALUES ("vTenant", "vRet", "vN", "vLine"."componentKind", "vLine".direction, "vLine".label, "vLine"."basisText", "vLine".quantity, "vLine".rate,
                "vLine".amount, "vLine"."taxableAmount", "vLine"."componentId", "vLine"."loanId", "vLine"."accountId");
      END IF;
    END LOOP;
    SELECT max(c."lineNo") INTO "vMax" FROM "Payroll"."FinalSettlementLines" c WHERE c."tenantId" = "vTenant" AND c."settlementId" = "vRet";
  END IF;
  PERFORM "Payroll"."refreshFinalSettlementTotals"("vRet");
  RETURN "vRet";
END $function$;

-- Start: one settlement per exit (and per employee) unless cancelled. Numbered FS, the employee's primary bank account
-- as the payee, the exit moves to its Settlement stage. Amounts follow with finalSettlementCalculate.
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementStart"("pOffboardingId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vOff"    "HumanResources"."Offboardings";
  "vEmp"    "HumanResources"."Employees";
  "vNo"     text;
  "vId"     uuid;
BEGIN
  SELECT * INTO "vOff" FROM "HumanResources"."Offboardings" o WHERE o."tenantId" = "vTenant" AND o.id = "pOffboardingId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exit % not found', "pOffboardingId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vOff".status = 'WITHDRAWN' THEN
    RAISE EXCEPTION 'This exit was withdrawn' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'OFFBOARDING_CLOSED';
  END IF;
  IF EXISTS (SELECT 1 FROM "Payroll"."FinalSettlements" f WHERE f."tenantId" = "vTenant" AND f.status <> 'CANCELLED'
              AND (f."offboardingId" = "pOffboardingId" OR f."employeeId" = "vOff"."employeeId")) THEN
    RAISE EXCEPTION 'This exit already has a final settlement' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'FINAL_SETTLEMENT_EXISTS';
  END IF;
  SELECT * INTO "vEmp" FROM "HumanResources"."Employees" e WHERE e."tenantId" = "vTenant" AND e.id = "vOff"."employeeId";
  "vNo" := "Company"."getNextDocNo"('FS', current_date, "vEmp"."branchId");
  INSERT INTO "Payroll"."FinalSettlements" ("tenantId", "docNo", "docDate", "employeeId", "offboardingId", "lastBasicAmount", "lastGrossAmount", "employeeBankId", status)
  VALUES ("vTenant", "vNo", current_date, "vOff"."employeeId", "vOff".id, 0, 0,
          (SELECT b.id FROM "HumanResources"."EmployeeBankAccounts" b
            WHERE b."tenantId" = "vTenant" AND b."employeeId" = "vOff"."employeeId" AND b."isActive" AND b."paymentMode" = 'BANK'
            ORDER BY b."isPrimary" DESC, b."effectiveFrom" DESC LIMIT 1),
          'DRAFT')
  RETURNING id INTO "vId";
  IF "vOff".status IN ('SERVING_NOTICE', 'RETENTION_TALK') THEN
    UPDATE "HumanResources"."Offboardings" o SET status = 'SETTLEMENT' WHERE o."tenantId" = "vTenant" AND o.id = "vOff".id;
  END IF;
  RETURN "vId";
END $function$;

-- Calculate (DRAFT): replaces the computed lines and keeps the manual ones (bonus, other earnings / deductions).
-- pFacts (from the app, Phase 12 computeLines + Phase 32 calculator on the current salary):
--   {basicAmount, grossAmount, gratuityBaseAmount, basicComponentId, eobiComponentId,
--    pending: {month, days, daysInMonth, grossAmount, taxableAmount, eobiAmount} | null}
--  * pending salary: the days worked in the exit month, unless a regular payroll run already pays that month;
--  * leave encashment: encashable leave types (year-end / exit-only): the balance's encashable days, else the available
--    balance up to the type's encash limit, × basic (or gross) ÷ 30;
--  * gratuity: the company rule × base ÷ 30 per counted year;
--  * notice: shortfall (required − served, unless waived) × gross ÷ 30: recovered from a leaver, paid by the company on
--    a termination;
--  * open loans and advances: the installments still due;
--  * income tax for the final month: annual tax on (taxable income booked this tax year + taxable settlement earnings)
--    less tax already deducted; EOBI for the exit month with the pending salary.
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementCalculate"("pId" uuid, "pFacts" jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant"   uuid := "Company"."getCurrentTenantId"();
  "vFs"       "Payroll"."FinalSettlements";
  "vOff"      "HumanResources"."Offboardings";
  "vEmp"      "HumanResources"."Employees";
  "vRule"     jsonb := "Payroll"."gratuityRule"();
  "vBasic"    numeric(18,2) := COALESCE(("pFacts" ->> 'basicAmount')::numeric, 0);
  "vGross"    numeric(18,2) := COALESCE(("pFacts" ->> 'grossAmount')::numeric, 0);
  "vGBase"    numeric(18,2) := COALESCE(("pFacts" ->> 'gratuityBaseAmount')::numeric, ("pFacts" ->> 'basicAmount')::numeric, 0);
  "vBasicC"   uuid := NULLIF("pFacts" ->> 'basicComponentId', '')::uuid;
  "vEobiC"    uuid := NULLIF("pFacts" ->> 'eobiComponentId', '')::uuid;
  "vPend"     jsonb := CASE WHEN jsonb_typeof("pFacts" -> 'pending') = 'object' THEN "pFacts" -> 'pending' END;
  "vLwd"      date;
  "vAge"      interval;
  "vY"        int;
  "vM"        int;
  "vD"        int;
  "vYears"    int;
  "vMonths"   int;
  "vPerGross" numeric(18,2);
  "vPerBasic" numeric(18,2);
  "vLines"    jsonb := '[]'::jsonb;
  "vManual"   jsonb;
  "vAmt"      numeric(18,2);
  "vReq"      int;
  "vServed"   int;
  "vShort"    int := 0;
  "vRec"      record;
  "vRunPaid"  boolean := false;
  "vTaxYear"  text;
  "vTyStart"  date;
  "vYtdTaxable" numeric(18,2);
  "vYtdTax"   numeric(18,2);
  "vSetTax"   numeric(18,2);
  "vTax"      numeric(18,2) := 0;
  "vTaxC"     uuid;
  "vNo"       int := 0;
  "vE"        jsonb;
  "vMonth"    date;
  "vNotes"    jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO "vFs" FROM "Payroll"."FinalSettlements" f WHERE f."tenantId" = "vTenant" AND f.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FinalSettlements % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vFs".status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only a draft settlement is recalculated (this one is %)', lower(replace("vFs".status, '_', ' '))
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'FINAL_SETTLEMENT_LOCKED';
  END IF;
  SELECT * INTO "vOff" FROM "HumanResources"."Offboardings" o WHERE o."tenantId" = "vTenant" AND o.id = "vFs"."offboardingId";
  SELECT * INTO "vEmp" FROM "HumanResources"."Employees" e WHERE e."tenantId" = "vTenant" AND e.id = "vFs"."employeeId";
  "vLwd" := "vOff"."lastWorkingDay";
  "vPerGross" := round("vGross" / 30, 2);
  "vPerBasic" := round("vBasic" / 30, 2);

  -- service: joining date to the last working day, inclusive
  "vAge" := age("vLwd" + 1, "vEmp"."joiningDate");
  "vY" := extract(year FROM "vAge")::int;
  "vM" := extract(month FROM "vAge")::int;
  -- days after the whole months, counted on the calendar (age() borrows the earlier date's month length)
  "vD" := ("vLwd" + 1) - ("vEmp"."joiningDate" + make_interval(years => "vY", months => "vM"))::date;
  "vMonths" := "vY" * 12 + "vM";

  -- 1. pending salary of the exit month (+ EOBI), unless a regular run already pays it
  IF "vPend" IS NOT NULL AND COALESCE(("vPend" ->> 'days')::numeric, 0) > 0 THEN
    "vMonth" := date_trunc('month', "vLwd")::date;
    SELECT EXISTS (SELECT 1 FROM "Payroll"."PayrollRunLines" l JOIN "Payroll"."PayrollRuns" r ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
                    WHERE l."tenantId" = "vTenant" AND l."employeeId" = "vEmp".id AND NOT l."isOnHold" AND r."runType" = 'REGULAR'
                      AND r."payrollMonth" = "vMonth" AND r.status NOT IN ('CANCELLED', 'REJECTED', 'REVERSED'))
      INTO "vRunPaid";
    IF "vRunPaid" THEN
      "vNotes" := "vNotes" || to_jsonb('Pending salary for ' || to_char("vMonth", 'FMMonth YYYY') || ' is paid by the regular payroll run'::text);
    ELSE
      "vAmt" := round(("vPend" ->> 'grossAmount')::numeric, 2);
      IF "vAmt" > 0 THEN
        "vLines" := "vLines" || jsonb_build_object('componentKind', 'PENDING_SALARY', 'label', 'Pending salary — ' || to_char("vMonth", 'FMMonth YYYY'),
          'basisText', trim_scale(("vPend" ->> 'days')::numeric)::text || ' of ' || ("vPend" ->> 'daysInMonth') || ' days × Rs ' || to_char(round("vGross" / ("vPend" ->> 'daysInMonth')::numeric, 2), 'FM999,999,999,990.00'),
          'quantity', ("vPend" ->> 'days')::numeric, 'rate', round("vGross" / ("vPend" ->> 'daysInMonth')::numeric, 2), 'amount', "vAmt",
          'taxableAmount', least("vAmt", round(COALESCE(("vPend" ->> 'taxableAmount')::numeric, "vAmt"), 2)), 'componentId', "vBasicC");
      END IF;
    END IF;
  END IF;

  -- 2. leave encashment, per encashable leave type of the current leave year
  FOR "vRec" IN
    SELECT t.name, t."encashBasis", t."encashMaxDays",
           CASE WHEN b.encashable > 0 THEN least(b.encashable, greatest(b.available, 0))
                ELSE least(greatest(b.available, 0), COALESCE(t."encashMaxDays", greatest(b.available, 0))) END AS days
      FROM "HumanResources"."LeaveBalances" b
      JOIN "HumanResources"."LeaveTypes" t ON t."tenantId" = b."tenantId" AND t.id = b."leaveTypeId"
     WHERE b."tenantId" = "vTenant" AND b."employeeId" = "vEmp".id AND t."deletedAt" IS NULL
       AND t."encashmentMode" IN ('YEAR_END', 'EXIT_ONLY')
       AND b."leaveYearStart" = (SELECT max(x."leaveYearStart") FROM "HumanResources"."LeaveBalances" x
                                  WHERE x."tenantId" = b."tenantId" AND x."employeeId" = b."employeeId" AND x."leaveYearStart" <= "vLwd")
     ORDER BY t."sortOrder", t.name
  LOOP
    CONTINUE WHEN "vRec".days <= 0;
    "vAmt" := round("vRec".days * CASE WHEN "vRec"."encashBasis" = 'GROSS_DIV_30' THEN "vPerGross" ELSE "vPerBasic" END, 2);
    CONTINUE WHEN "vAmt" <= 0;
    "vLines" := "vLines" || jsonb_build_object('componentKind', 'LEAVE_ENCASHMENT', 'label', 'Leave encashment — ' || "vRec".name,
      'basisText', trim_scale("vRec".days)::text || ' days × Rs ' || to_char(CASE WHEN "vRec"."encashBasis" = 'GROSS_DIV_30' THEN "vPerGross" ELSE "vPerBasic" END, 'FM999,999,990.00')
                   || CASE WHEN "vRec"."encashBasis" = 'GROSS_DIV_30' THEN ' (gross ÷ 30)' ELSE ' (basic ÷ 30)' END,
      'quantity', "vRec".days, 'rate', CASE WHEN "vRec"."encashBasis" = 'GROSS_DIV_30' THEN "vPerGross" ELSE "vPerBasic" END, 'amount', "vAmt", 'taxableAmount', "vAmt");
  END LOOP;

  -- 3. gratuity
  "vYears" := "vY" + CASE WHEN "vM" > ("vRule" ->> 'partYearOverMonths')::int OR ("vM" = ("vRule" ->> 'partYearOverMonths')::int AND "vD" > 0) THEN 1 ELSE 0 END;
  IF "vY" < ("vRule" ->> 'minServiceYears')::int THEN "vYears" := 0; END IF;
  IF "vYears" > 0 AND "vGBase" > 0 THEN
    "vAmt" := round("vGBase" / 30 * ("vRule" ->> 'daysPerYear')::numeric * "vYears", 2);
    "vLines" := "vLines" || jsonb_build_object('componentKind', 'GRATUITY', 'label', 'Gratuity',
      'basisText', "vYears" || ' year' || CASE WHEN "vYears" = 1 THEN '' ELSE 's' END || ' (' || "vY" || ' y ' || "vM" || ' m ' || "vD" || ' d) × '
                   || ("vRule" ->> 'daysPerYear') || ' days × Rs ' || to_char("vGBase", 'FM999,999,999,990.00') || ' ÷ 30',
      'quantity', "vYears", 'rate', round("vGBase" / 30 * ("vRule" ->> 'daysPerYear')::numeric, 2), 'amount', "vAmt",
      'taxableAmount', greatest(0, "vAmt" - COALESCE(("vRule" ->> 'taxExemptAmount')::numeric, 0)),
      'componentId', (SELECT s.id FROM "Payroll"."SalaryComponents" s WHERE s."tenantId" = "vTenant" AND s."deletedAt" IS NULL AND s."systemRole" = 'GRATUITY' LIMIT 1));
  ELSIF "vY" < ("vRule" ->> 'minServiceYears')::int THEN
    "vNotes" := "vNotes" || to_jsonb('No gratuity: less than ' || ("vRule" ->> 'minServiceYears') || ' full year(s) of service'::text);
  END IF;

  -- 4. notice: shortfall recovered from a leaver, paid in lieu on a termination
  "vReq" := COALESCE("vOff"."noticeDaysRequired", 0);
  "vServed" := COALESCE("vOff"."noticeDaysServed",
                        CASE WHEN "vOff"."resignationDate" IS NOT NULL THEN greatest(0, "vLwd" - "vOff"."resignationDate") ELSE "vReq" END);
  IF NOT "vOff"."noticeWaived" AND "vServed" < "vReq" THEN
    "vShort" := "vReq" - "vServed";
    "vAmt" := round("vShort" * "vPerGross", 2);
    IF "vAmt" > 0 THEN
      "vLines" := "vLines" || CASE WHEN "vOff"."exitType" = 'TERMINATION'
        THEN jsonb_build_object('componentKind', 'NOTICE_PAY', 'label', 'Notice pay in lieu',
               'basisText', "vReq" || ' days required, ' || "vServed" || ' given · ' || "vShort" || ' × Rs ' || to_char("vPerGross", 'FM999,999,990.00'),
               'quantity', "vShort", 'rate', "vPerGross", 'amount', "vAmt", 'taxableAmount', "vAmt", 'componentId', "vBasicC")
        ELSE jsonb_build_object('componentKind', 'NOTICE_SHORTFALL', 'label', 'Notice period shortfall',
               'basisText', "vReq" || ' days required, ' || "vServed" || ' served · ' || "vShort" || ' × Rs ' || to_char("vPerGross", 'FM999,999,990.00'),
               'quantity', "vShort", 'rate', "vPerGross", 'amount', "vAmt") END;
    END IF;
  END IF;

  -- 5. manual earnings stay
  SELECT COALESCE(jsonb_agg(jsonb_build_object('componentKind', c."componentKind", 'label', c.label, 'basisText', c."basisText", 'quantity', c.quantity,
           'rate', c.rate, 'amount', c.amount, 'taxableAmount', c."taxableAmount", 'componentId', c."componentId", 'accountId', c."accountId") ORDER BY c."lineNo"), '[]'::jsonb)
    INTO "vManual"
    FROM "Payroll"."FinalSettlementLines" c
   WHERE c."tenantId" = "vTenant" AND c."settlementId" = "pId" AND c."componentKind" IN ('BONUS', 'OTHER_EARNING');
  "vLines" := "vLines" || "vManual";

  -- 6. open loans and advances: the installments still due
  FOR "vRec" IN
    SELECT n.id, n."docNo", n."loanType", sum(i.amount) AS due
      FROM "Payroll"."LoansAndAdvances" n
      JOIN "Payroll"."LoanInstallments" i ON i."tenantId" = n."tenantId" AND i."loanId" = n.id AND i.status IN ('SCHEDULED', 'REQUESTED')
     WHERE n."tenantId" = "vTenant" AND n."employeeId" = "vEmp".id AND n.status IN ('ACTIVE', 'SETTLEMENT')
     GROUP BY n.id, n."docNo", n."loanType"
     ORDER BY n."docNo"
  LOOP
    CONTINUE WHEN "vRec".due <= 0;
    "vLines" := "vLines" || jsonb_build_object('componentKind', CASE WHEN "vRec"."loanType" = 'SALARY_ADVANCE' THEN 'ADVANCE_RECOVERY' ELSE 'LOAN_RECOVERY' END,
      'label', CASE WHEN "vRec"."loanType" = 'SALARY_ADVANCE' THEN 'Advance recovery' ELSE 'Loan recovery' END,
      'basisText', "vRec"."docNo" || ' outstanding', 'amount', "vRec".due, 'loanId', "vRec".id);
  END LOOP;

  -- 7. income tax for the final month
  SELECT COALESCE(sum(COALESCE((x ->> 'taxableAmount')::numeric, CASE WHEN x ->> 'componentKind' IN ('BONUS', 'OTHER_EARNING') THEN (x ->> 'amount')::numeric ELSE 0 END)), 0)
    INTO "vSetTax"
    FROM jsonb_array_elements("vLines") x
   WHERE x ->> 'componentKind' IN ('PENDING_SALARY', 'LEAVE_ENCASHMENT', 'GRATUITY', 'NOTICE_PAY', 'BONUS', 'OTHER_EARNING');
  "vTyStart" := make_date(CASE WHEN extract(month FROM "vLwd") >= 7 THEN extract(year FROM "vLwd")::int ELSE extract(year FROM "vLwd")::int - 1 END, 7, 1);
  "vTaxYear" := extract(year FROM "vTyStart")::int || '-' || lpad(((extract(year FROM "vTyStart")::int + 1) % 100)::text, 2, '0');
  IF "vSetTax" > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM "Payroll"."SalaryTaxSlabs" s WHERE s."tenantId" = "vTenant" AND s."taxYear" = "vTaxYear") THEN
      RAISE EXCEPTION 'No salary tax slabs for tax year %. Add them under Salary structures › Tax slabs.', "vTaxYear"
        USING ERRCODE = 'check_violation', HINT = 'PAYROLL_SETUP_MISSING';
    END IF;
    SELECT COALESCE(sum(c.amount - c."exemptAmount") FILTER (WHERE c."componentType" = 'EARNING' AND c."isTaxable"), 0)
      INTO "vYtdTaxable"
      FROM "Payroll"."PayrollRunLineComponents" c
      JOIN "Payroll"."PayrollRunLines" l ON l."tenantId" = c."tenantId" AND l.id = c."payrollLineId"
      JOIN "Payroll"."PayrollRuns" r ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
     WHERE c."tenantId" = "vTenant" AND l."employeeId" = "vEmp".id AND r.status IN ('POSTED', 'PAID')
       AND r."payrollMonth" >= "vTyStart" AND r."payrollMonth" <= "vLwd";
    SELECT COALESCE(sum(l."taxAmount"), 0) INTO "vYtdTax"
      FROM "Payroll"."PayrollRunLines" l
      JOIN "Payroll"."PayrollRuns" r ON r."tenantId" = l."tenantId" AND r.id = l."payrollRunId"
     WHERE l."tenantId" = "vTenant" AND l."employeeId" = "vEmp".id AND r.status IN ('POSTED', 'PAID')
       AND r."payrollMonth" >= "vTyStart" AND r."payrollMonth" <= "vLwd";
    "vTax" := greatest(0, "Payroll"."settlementAnnualTax"("vTenant", "vTaxYear", "vYtdTaxable" + "vSetTax", "vEmp".id, "vLwd") - "vYtdTax");
    IF "vTax" > 0 THEN
      SELECT s.id INTO "vTaxC" FROM "Payroll"."SalaryComponents" s WHERE s."tenantId" = "vTenant" AND s."deletedAt" IS NULL AND s."systemRole" = 'INCOME_TAX' LIMIT 1;
      "vLines" := "vLines" || jsonb_build_object('componentKind', 'INCOME_TAX', 'label', 'Income tax u/s 149',
        'basisText', 'Tax year ' || "vTaxYear" || ': slabs on Rs ' || to_char("vYtdTaxable" + "vSetTax", 'FM999,999,999,990') || ' less Rs '
                     || to_char("vYtdTax", 'FM999,999,999,990') || ' deducted',
        'amount', "vTax", 'componentId', "vTaxC");
    END IF;
  END IF;

  -- 8. EOBI for the exit month (with the pending salary)
  IF "vPend" IS NOT NULL AND NOT "vRunPaid" AND COALESCE(("vPend" ->> 'eobiAmount')::numeric, 0) > 0 THEN
    "vLines" := "vLines" || jsonb_build_object('componentKind', 'EOBI', 'label', 'EOBI — employee',
      'basisText', to_char(date_trunc('month', "vLwd"), 'FMMonth YYYY') || ' contribution', 'amount', round(("vPend" ->> 'eobiAmount')::numeric, 2), 'componentId', "vEobiC");
  END IF;

  -- 9. manual deductions stay
  SELECT COALESCE(jsonb_agg(jsonb_build_object('componentKind', c."componentKind", 'label', c.label, 'basisText', c."basisText", 'quantity', c.quantity,
           'rate', c.rate, 'amount', c.amount, 'componentId', c."componentId", 'accountId', c."accountId") ORDER BY c."lineNo"), '[]'::jsonb)
    INTO "vManual"
    FROM "Payroll"."FinalSettlementLines" c
   WHERE c."tenantId" = "vTenant" AND c."settlementId" = "pId" AND c."componentKind" = 'OTHER_DEDUCTION';
  "vLines" := "vLines" || "vManual";

  -- replace the lines
  DELETE FROM "Payroll"."FinalSettlementLines" c WHERE c."tenantId" = "vTenant" AND c."settlementId" = "pId";
  FOR "vE" IN SELECT x FROM jsonb_array_elements("vLines") x LOOP
    "vNo" := "vNo" + 1;
    INSERT INTO "Payroll"."FinalSettlementLines" ("tenantId", "settlementId", "lineNo", "componentKind", direction, label, "basisText", quantity, rate, amount,
                                                  "taxableAmount", "componentId", "loanId", "accountId")
    VALUES ("vTenant", "pId", "vNo", "vE" ->> 'componentKind',
            CASE WHEN "vE" ->> 'componentKind' IN ('PENDING_SALARY', 'LEAVE_ENCASHMENT', 'GRATUITY', 'NOTICE_PAY', 'BONUS', 'OTHER_EARNING') THEN 'EARNING' ELSE 'DEDUCTION' END,
            "vE" ->> 'label', "vE" ->> 'basisText', ("vE" ->> 'quantity')::numeric, ("vE" ->> 'rate')::numeric, ("vE" ->> 'amount')::numeric,
            ("vE" ->> 'taxableAmount')::numeric, NULLIF("vE" ->> 'componentId', '')::uuid, NULLIF("vE" ->> 'loanId', '')::uuid, NULLIF("vE" ->> 'accountId', '')::uuid);
  END LOOP;

  UPDATE "Payroll"."FinalSettlements" f
     SET "serviceMonths" = "vMonths", "noticeShortfallDays" = "vShort", "lastBasicAmount" = "vBasic", "lastGrossAmount" = "vGross",
         "perDayGrossAmount" = "vPerGross", "perDayBasicAmount" = "vPerBasic"
   WHERE f."tenantId" = "vTenant" AND f.id = "pId";
  PERFORM "Payroll"."refreshFinalSettlementTotals"("pId");
  RETURN jsonb_build_object('serviceYears', "vY", 'serviceMonths', "vM", 'serviceDays', "vD", 'gratuityYears', "vYears", 'noticeShortfallDays', "vShort",
                            'taxYear', "vTaxYear", 'taxableAmount', "vSetTax", 'tax', "vTax", 'pendingPaidByRun', "vRunPaid", 'notes', "vNotes", 'rule', "vRule");
END $function$;

-- Submit: DRAFT → PENDING_APPROVAL, with lines; the submitter is the preparer.
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementSubmit"("pId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."FinalSettlements";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."FinalSettlements" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FinalSettlements % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'PENDING_APPROVAL' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Settlement %: only a draft is submitted (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'FINAL_SETTLEMENT_LOCKED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Payroll"."FinalSettlementLines" c WHERE c."tenantId" = "vRow"."tenantId" AND c."settlementId" = "pId" AND c.amount > 0) THEN
    RAISE EXCEPTION 'Settlement % has no amounts: calculate it first', "vRow"."docNo" USING ERRCODE = 'check_violation', HINT = 'FINAL_SETTLEMENT_NO_LINES';
  END IF;
  PERFORM "Payroll"."refreshFinalSettlementTotals"("pId");
  UPDATE "Payroll"."FinalSettlements" t
     SET status = 'PENDING_APPROVAL', "preparedByUserId" = "Company"."getCurrentUserId"(), "preparedAt" = now()
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- Send back / reject: PENDING_APPROVAL → DRAFT with the reason in the remarks.
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementSendBack"("pId" uuid, "pReason" text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."FinalSettlements";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."FinalSettlements" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FinalSettlements % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'Settlement % is not awaiting approval (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'FINAL_SETTLEMENT_LOCKED';
  END IF;
  UPDATE "Payroll"."FinalSettlements" t
     SET status = 'DRAFT', remarks = left(concat_ws(E'\n', NULLIF(t.remarks, ''), 'Sent back: ' || COALESCE(NULLIF(btrim("pReason"), ''), '—')), 2000)
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- Approve: only a settlement awaiting approval, never by its preparer; totals refreshed, then the JV.
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementApprove"("pId" uuid, "pComment" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."FinalSettlements";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."FinalSettlements" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FinalSettlements % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'Settlement %: submit it for approval first (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'FINAL_SETTLEMENT_LOCKED';
  END IF;
  IF COALESCE("vRow"."preparedByUserId", "vRow"."createdBy") = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'Settlement %: the preparer cannot approve it', "vRow"."docNo"
      USING ERRCODE = 'insufficient_privilege', HINT = 'FINAL_SETTLEMENT_PREPARER';
  END IF;
  PERFORM "Payroll"."refreshFinalSettlementTotals"("pId");
  PERFORM "Payroll"."finalSettlementApproveEntries"("pId");
  UPDATE "Payroll"."FinalSettlements" t SET status = 'APPROVED', "approvedAt" = now(), "approvedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- Approval JV: earnings Dr, deductions Cr, net final dues Cr salaries payable (Dr when the employee owes). Accounts: the
-- line's, else its component's, else the component of the matching system role, else a posting role (notice
-- shortfall, other deductions and gratuity fall back to salary expense). Loan installments recovered in the settlement
-- are SETTLED; a partial recovery splits the installment.
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementApproveEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
  "vNo"     smallint;
BEGIN
  SELECT f.id, f."docNo", f."docDate", f."employeeId", f."netAmount", e."displayName", e."branchId",
         COALESCE(e."costCentreId", d."costCentreId") AS "costCentreId"
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
           CASE WHEN c.direction = 'EARNING' AND c."componentKind" <> 'GRATUITY' THEN s."debitAccountId" ELSE s."creditAccountId" END AS "componentAccountId",
           n."loanType"
      FROM "Payroll"."FinalSettlementLines" c
      LEFT JOIN "Payroll"."SalaryComponents" s ON s."tenantId" = c."tenantId" AND s.id = c."componentId"
      LEFT JOIN "Payroll"."LoansAndAdvances" n ON n."tenantId" = c."tenantId" AND n.id = c."loanId"
     WHERE c."tenantId" = "vTenant" AND c."settlementId" = "vFs".id AND c.amount > 0
     ORDER BY c."lineNo"
  LOOP
    "vAcc" := COALESCE("vLine"."accountId", "vLine"."componentAccountId");
    IF "vAcc" IS NULL THEN
      SELECT CASE WHEN "vLine".direction = 'EARNING' AND "vLine"."componentKind" <> 'GRATUITY' THEN s."debitAccountId" ELSE s."creditAccountId" END
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
             END
       LIMIT 1;
    END IF;
    IF "vAcc" IS NULL THEN
      "vRole" := CASE
          WHEN "vLine"."componentKind" = 'INCOME_TAX' THEN 'INCOME_TAX_PAYABLE_SALARY'
          WHEN "vLine"."componentKind" = 'EOBI'       THEN 'EOBI_PAYABLE'
          WHEN "vLine"."componentKind" IN ('ADVANCE_RECOVERY', 'LOAN_RECOVERY')
            THEN CASE WHEN "vLine"."loanType" = 'SALARY_ADVANCE' THEN 'EMPLOYEE_ADVANCES' ELSE 'EMPLOYEE_LOANS' END
          ELSE 'SALARY_EXPENSE'          -- earnings, gratuity, notice shortfall and other deductions
        END;
      "vAcc" := "Company"."getAccountForRole"("vRole");
    END IF;

    "vLines" := "vLines" || jsonb_build_array(jsonb_build_object(
      'accountId', "vAcc",
      'debit',  CASE WHEN "vLine".direction = 'EARNING' THEN "vLine".amount ELSE 0 END,
      'credit', CASE WHEN "vLine".direction = 'EARNING' THEN 0 ELSE "vLine".amount END,
      'particulars', "vLine".label,
      'branchId', "vFs"."branchId",
      'costCentreId', CASE WHEN "vLine".direction = 'EARNING' THEN "vFs"."costCentreId" END,
      'employeeId', CASE WHEN "vLine"."componentKind" IN ('ADVANCE_RECOVERY', 'LOAN_RECOVERY') THEN "vFs"."employeeId" END));
  END LOOP;

  IF "vFs"."netAmount" <> 0 THEN
    "vLines" := "vLines" || jsonb_build_array(jsonb_build_object(
      'accountRole', 'SALARIES_PAYABLE', 'credit', "vFs"."netAmount", 'branchId', "vFs"."branchId",
      'employeeId', "vFs"."employeeId", 'particulars', 'Final dues — ' || "vFs"."displayName"));
  END IF;

  "vJe" := "Accounting"."journalCreate"(
    jsonb_build_object('voucherType', 'JV', 'docDate', "vFs"."docDate", 'postingDate', "vFs"."docDate", 'branchId', "vFs"."branchId",
                       'narration', 'Full & final settlement ' || "vFs"."docNo" || ' — ' || "vFs"."displayName",
                       'sourceDocType', 'FS', 'sourceDocId', "vFs".id, 'sourceDocNo', "vFs"."docNo"),
    "vLines");
  UPDATE "Payroll"."FinalSettlements" f SET "journalEntryId" = "vJe" WHERE f."tenantId" = "vTenant" AND f.id = "vFs".id;

  -- installments recovered in the settlement, oldest first; a partial amount splits the installment
  FOR "vLine" IN
    SELECT c."loanId", sum(c.amount) AS amount
      FROM "Payroll"."FinalSettlementLines" c
     WHERE c."tenantId" = "vTenant" AND c."settlementId" = "vFs".id
       AND c."componentKind" IN ('ADVANCE_RECOVERY', 'LOAN_RECOVERY') AND c."loanId" IS NOT NULL
     GROUP BY c."loanId"
  LOOP
    "vLeft" := "vLine".amount;
    FOR "vInst" IN
      SELECT i.id, i.amount, i."balanceAfter"
        FROM "Payroll"."LoanInstallments" i
       WHERE i."tenantId" = "vTenant" AND i."loanId" = "vLine"."loanId" AND i.status IN ('SCHEDULED', 'REQUESTED')
       ORDER BY i."dueMonth", i."installmentNo"
         FOR UPDATE
    LOOP
      EXIT WHEN "vLeft" <= 0;
      IF "vLeft" >= "vInst".amount THEN
        UPDATE "Payroll"."LoanInstallments" i
           SET status = 'SETTLED', "finalSettlementId" = "vFs".id, "recoveredAt" = now()
         WHERE i."tenantId" = "vTenant" AND i.id = "vInst".id;
        "vLeft" := "vLeft" - "vInst".amount;
      ELSE
        SELECT max(i."installmentNo") + 1 INTO "vNo" FROM "Payroll"."LoanInstallments" i WHERE i."tenantId" = "vTenant" AND i."loanId" = "vLine"."loanId";
        UPDATE "Payroll"."LoanInstallments" i SET amount = i.amount - "vLeft" WHERE i."tenantId" = "vTenant" AND i.id = "vInst".id;
        INSERT INTO "Payroll"."LoanInstallments" ("tenantId", "loanId", "installmentNo", "installmentType", "dueMonth", amount, "balanceAfter", status,
                                                  "finalSettlementId", "recoveredAt", remarks)
        VALUES ("vTenant", "vLine"."loanId", "vNo", 'SETTLEMENT_RECOVERY', date_trunc('month', "vFs"."docDate")::date, "vLeft",
                "vInst"."balanceAfter" + ("vInst".amount - "vLeft"), 'SETTLED', "vFs".id, now(), 'Recovered in final settlement ' || "vFs"."docNo");
        "vLeft" := 0;
      END IF;
    END LOOP;
  END LOOP;
END $function$;

-- Payment: an APPROVED settlement with a positive net, from a company bank account (BPV, cheque number optional).
-- pData: {bankAccountId, valueDate, chequeNo}.
DROP FUNCTION IF EXISTS "Payroll"."finalSettlementPay"(uuid);
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementPay"("pId" uuid, "pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    "Payroll"."FinalSettlements";
  "vBank"   uuid := NULLIF("pData" ->> 'bankAccountId', '')::uuid;
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."FinalSettlements" t WHERE t.id = "pId" AND t."tenantId" = "vTenant" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FinalSettlements % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'PAID' THEN
    RETURN "pId";
  END IF;
  IF "vRow".status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Settlement % must be approved before it is paid (status %)', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'FINAL_SETTLEMENT_LOCKED';
  END IF;
  IF "vRow"."netAmount" <= 0 THEN
    RAISE EXCEPTION 'Settlement % has nothing to pay (net %)', "vRow"."docNo", "vRow"."netAmount"
      USING ERRCODE = 'check_violation', HINT = 'FINAL_SETTLEMENT_NOT_PAYABLE';
  END IF;
  IF "vBank" IS NOT NULL THEN
    UPDATE "Payroll"."FinalSettlements" t SET "payFromBankAccountId" = "vBank" WHERE t.id = "pId";
  END IF;
  PERFORM set_config('app.fsPayDate', COALESCE(NULLIF("pData" ->> 'valueDate', ''), ''), true);
  PERFORM set_config('app.fsPayCheque', COALESCE(NULLIF(btrim("pData" ->> 'chequeNo'), ''), ''), true);
  PERFORM "Payroll"."finalSettlementPayEntries"("pId");
  UPDATE "Payroll"."FinalSettlements" t SET status = 'PAID' WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- Payment voucher (BPV, source FS): Dr salaries payable / Cr the bank; paid date and payment voucher recorded.
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementPayEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vFs"     record;
  "vGl"     uuid;
  "vDate"   date := COALESCE(NULLIF(current_setting('app.fsPayDate', true), '')::date, current_date);
  "vChq"    text := NULLIF(current_setting('app.fsPayCheque', true), '');
  "vJe"     uuid;
BEGIN
  SELECT f.id, f."docNo", f."netAmount", f."payFromBankAccountId", f."paymentJournalEntryId", e."displayName", e."branchId"
    INTO "vFs"
    FROM "Payroll"."FinalSettlements" f
    JOIN "HumanResources"."Employees" e ON e."tenantId" = f."tenantId" AND e.id = f."employeeId"
   WHERE f."tenantId" = "vTenant" AND f.id = "pId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Final settlement % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vFs"."paymentJournalEntryId" IS NOT NULL THEN
    RETURN;
  END IF;
  SELECT ba."accountId" INTO "vGl" FROM "BankCash"."BankAccounts" ba
   WHERE ba."tenantId" = "vTenant" AND ba.id = "vFs"."payFromBankAccountId" AND ba."deletedAt" IS NULL AND ba.status = 'ACTIVE';
  IF "vGl" IS NULL THEN
    RAISE EXCEPTION 'Choose the bank account the settlement is paid from' USING ERRCODE = 'check_violation', HINT = 'VALIDATION_FAILED';
  END IF;
  "vJe" := "BankCash"."postBankingVoucher"(
             'BPV', "vDate", "vFs"."branchId", 'Final settlement payment ' || "vFs"."docNo" || ' — ' || "vFs"."displayName",
             "vGl", "vFs"."displayName", "vChq", CASE WHEN "vChq" IS NOT NULL THEN "vDate" END,
             'FS', "vFs".id, "vFs"."docNo",
             jsonb_build_array(
               jsonb_build_object('accountId', "Company"."getAccountForRole"('SALARIES_PAYABLE'), 'debit', "vFs"."netAmount", 'particulars', 'Final dues ' || "vFs"."docNo"),
               jsonb_build_object('accountId', "vGl", 'credit', "vFs"."netAmount", 'particulars', 'Final settlement paid · ' || "vFs"."docNo", 'isAutoContra', true)));
  UPDATE "Payroll"."FinalSettlements" f SET "paymentJournalEntryId" = "vJe", "paidAt" = now() WHERE f."tenantId" = "vTenant" AND f.id = "pId";
END $function$;

COMMENT ON FUNCTION "Payroll"."finalSettlementPayEntries"("pId" uuid) IS
  'Payment hook of a final settlement: BPV Dr salaries payable / Cr the pay-from bank account (BankCash.postBankingVoucher, source FS); sets paidAt and paymentJournalEntryId.';

-- Cancel: any state but PAID-and-kept; posted vouchers (JV and payment) are reversed by the cancel hook.
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementCancel"("pId" uuid, "pReason" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "Payroll"."FinalSettlements";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."FinalSettlements" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FinalSettlements % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";
  END IF;
  IF EXISTS (SELECT 1 FROM "HumanResources"."Offboardings" o WHERE o."tenantId" = "vRow"."tenantId" AND o.id = "vRow"."offboardingId" AND o.status = 'CLOSED') THEN
    RAISE EXCEPTION 'The exit is completed: its settlement can no longer be cancelled' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'FINAL_SETTLEMENT_LOCKED';
  END IF;
  PERFORM "Payroll"."finalSettlementCancelEntries"("pId");
  UPDATE "Payroll"."FinalSettlements" t
     SET status = 'CANCELLED', remarks = left(concat_ws(E'\n', NULLIF(t.remarks, ''), 'Cancelled' || COALESCE(': ' || NULLIF(btrim("pReason"), ''), '')), 2000)
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- Cancel hook: reverse the vouchers of an approved / paid settlement and release its installments (a split one is merged
-- back into the open installment it came from).
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementCancelEntries"("pId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vStatus" text;
  "vSplit"  record;
BEGIN
  SELECT f.status INTO "vStatus" FROM "Payroll"."FinalSettlements" f WHERE f."tenantId" = "vTenant" AND f.id = "pId";
  IF "vStatus" IS NULL OR "vStatus" NOT IN ('APPROVED', 'PAID') THEN
    RETURN;
  END IF;
  PERFORM "Accounting"."journalReverseForSource"('FS', "pId", 'OTHER', current_date);
  FOR "vSplit" IN
    SELECT i.id, i."loanId", i.amount FROM "Payroll"."LoanInstallments" i
     WHERE i."tenantId" = "vTenant" AND i."finalSettlementId" = "pId" AND i.status = 'SETTLED' AND i."installmentType" = 'SETTLEMENT_RECOVERY'
  LOOP
    UPDATE "Payroll"."LoanInstallments" i SET amount = i.amount + "vSplit".amount
     WHERE i.id = (SELECT x.id FROM "Payroll"."LoanInstallments" x
                    WHERE x."tenantId" = "vTenant" AND x."loanId" = "vSplit"."loanId" AND x.status IN ('SCHEDULED', 'REQUESTED')
                    ORDER BY x."dueMonth", x."installmentNo" LIMIT 1);
    IF FOUND THEN
      DELETE FROM "Payroll"."LoanInstallments" i WHERE i.id = "vSplit".id;
    END IF;
  END LOOP;
  UPDATE "Payroll"."LoanInstallments" i
     SET status = 'SCHEDULED', "finalSettlementId" = NULL, "recoveredAt" = NULL
   WHERE i."tenantId" = "vTenant" AND i."finalSettlementId" = "pId" AND i.status = 'SETTLED';
  UPDATE "Payroll"."FinalSettlements" f SET "paidAt" = NULL WHERE f."tenantId" = "vTenant" AND f.id = "pId" AND f.status = 'APPROVED';
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Completing an exit needs its final settlement APPROVED (posted) or PAID.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."offboardingComplete"("pId" uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant"  uuid := "Company"."getCurrentTenantId"();
  "vRow"     "HumanResources"."Offboardings";
  "vEmp"     "HumanResources"."Employees";
  "vPending" integer;
  "vUsers"   uuid[];
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."Offboardings" o WHERE o."tenantId" = "vTenant" AND o.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offboardings % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status IN ('CLOSED', 'WITHDRAWN') THEN
    RAISE EXCEPTION 'This exit is already %', lower("vRow".status) USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'OFFBOARDING_CLOSED';
  END IF;
  SELECT count(*) INTO "vPending" FROM "HumanResources"."ClearanceItems" c WHERE c."tenantId" = "vTenant" AND c."offboardingId" = "pId" AND c.status = 'PENDING';
  IF "vPending" > 0 THEN
    RAISE EXCEPTION '% clearance item(s) are still pending', "vPending" USING ERRCODE = 'check_violation', HINT = 'OFFBOARDING_CLEARANCE_PENDING';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Payroll"."FinalSettlements" f
                  WHERE f."tenantId" = "vTenant" AND f."offboardingId" = "pId" AND f.status IN ('APPROVED', 'PAID')) THEN
    RAISE EXCEPTION 'Approve the final settlement before completing the exit'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'FINAL_SETTLEMENT_NOT_APPROVED';
  END IF;
  SELECT * INTO "vEmp" FROM "HumanResources"."Employees" e WHERE e."tenantId" = "vTenant" AND e.id = "vRow"."employeeId" FOR UPDATE;
  SELECT array_agg(DISTINCT u.id) INTO "vUsers" FROM "Company"."Users" u
   WHERE u."tenantId" = "vTenant" AND u."deletedAt" IS NULL AND (u.id = "vEmp"."appUserId" OR u."employeeId" = "vEmp".id);
  IF EXISTS (SELECT 1 FROM unnest(COALESCE("vUsers", '{}'::uuid[])) x WHERE "Platform"."isDefaultUser"("vTenant", x)) THEN
    RAISE EXCEPTION 'This employee''s login is the company''s default user, which always stays active'
      USING ERRCODE = 'check_violation', HINT = 'TENANT_DEFAULT_USER_LOCKED';
  END IF;
  UPDATE "HumanResources"."Employees" e
     SET status = 'EXITED', "exitDate" = "vRow"."lastWorkingDay", "exitType" = "vRow"."exitType"
   WHERE e."tenantId" = "vTenant" AND e.id = "vEmp".id;
  UPDATE "Company"."Users" u SET status = 'SUSPENDED', "suspendedAt" = now()
   WHERE u."tenantId" = "vTenant" AND u.id = ANY (COALESCE("vUsers", '{}'::uuid[])) AND u.status NOT IN ('SUSPENDED', 'REMOVED');
  UPDATE "HumanResources"."Offboardings" o SET status = 'CLOSED', "closedAt" = now() WHERE o.id = "pId";
  RETURN jsonb_build_object('id', "pId", 'suspendedUserIds', to_jsonb(COALESCE("vUsers", '{}'::uuid[])));
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Employee letters (English only): a numbered DRAFT with a verification code, ISSUED with its PDF, VOID.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."employeeLetterAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec"    "HumanResources"."EmployeeLetters";
  "vId"     uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet"    uuid;
  "vStatus" text;
  "vEmp"    text;
  "vCode"   text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."EmployeeLetters", "pData");
  IF "vId" IS NULL THEN
    SELECT e.status INTO "vEmp" FROM "HumanResources"."Employees" e WHERE e."tenantId" = "vTenant" AND e.id = "vRec"."employeeId" AND e."deletedAt" IS NULL;
    IF "vEmp" IS NULL THEN
      RAISE EXCEPTION 'Employee % not found', "vRec"."employeeId" USING ERRCODE = 'no_data_found';
    END IF;
    LOOP
      "vCode" := upper(substr(md5(gen_random_uuid()::text), 1, 4) || '-' || substr(md5(gen_random_uuid()::text), 1, 4) || '-' || substr(md5(gen_random_uuid()::text), 1, 4));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "HumanResources"."EmployeeLetters" l WHERE l."verificationCode" = "vCode");
    END LOOP;
    INSERT INTO "HumanResources"."EmployeeLetters" ("tenantId", "letterNo", "employeeId", "letterType", "docTemplateId", "addressedTo", "letterDate",
                                                    "signatoryEmployeeId", language, "includeSalary", "emailToEmployee", "verificationCode", status, remarks)
    VALUES ("vTenant", "Company"."getNextDocNo"('LTR', COALESCE("vRec"."letterDate", current_date), NULL), "vRec"."employeeId", "vRec"."letterType",
            "vRec"."docTemplateId", "vRec"."addressedTo", COALESCE("vRec"."letterDate", current_date), "vRec"."signatoryEmployeeId", 'EN',
            COALESCE("vRec"."includeSalary", false), false, "vCode", 'DRAFT', "vRec".remarks)
    RETURNING id INTO "vRet";
    RETURN "vRet";
  END IF;

  SELECT t.status INTO "vStatus" FROM "HumanResources"."EmployeeLetters" t WHERE t.id = "vId" AND t."tenantId" = "vTenant" FOR UPDATE;
  IF "vStatus" IS NULL THEN
    RAISE EXCEPTION 'EmployeeLetters % not found', "vId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vStatus" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only a draft letter can be edited (this one is %)', lower("vStatus")
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'EMPLOYEE_LETTER_NOT_ACTIONABLE';
  END IF;
  UPDATE "HumanResources"."EmployeeLetters" t
     SET "letterType" = CASE WHEN "pData" ? 'letterType' THEN "vRec"."letterType" ELSE t."letterType" END,
         "docTemplateId" = CASE WHEN "pData" ? 'docTemplateId' THEN "vRec"."docTemplateId" ELSE t."docTemplateId" END,
         "addressedTo" = CASE WHEN "pData" ? 'addressedTo' THEN "vRec"."addressedTo" ELSE t."addressedTo" END,
         "letterDate" = CASE WHEN "pData" ? 'letterDate' THEN "vRec"."letterDate" ELSE t."letterDate" END,
         "signatoryEmployeeId" = CASE WHEN "pData" ? 'signatoryEmployeeId' THEN "vRec"."signatoryEmployeeId" ELSE t."signatoryEmployeeId" END,
         "includeSalary" = CASE WHEN "pData" ? 'includeSalary' THEN COALESCE("vRec"."includeSalary", false) ELSE t."includeSalary" END,
         remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END,
         language = 'EN'
   WHERE t.id = "vId" AND t."tenantId" = "vTenant"
     AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
  RETURNING t.id INTO "vRet";
  IF "vRet" IS NULL THEN
    RAISE EXCEPTION 'EmployeeLetters %: record was changed by another user, reload and try again', "vId" USING ERRCODE = 'serialization_failure';
  END IF;
  RETURN "vRet";
END $function$;

-- Issue: a DRAFT with its generated PDF (an attachment of the LTR document) becomes ISSUED.
CREATE OR REPLACE FUNCTION "HumanResources"."employeeLetterIssue"("pId" uuid, "pAttachmentId" uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    "HumanResources"."EmployeeLetters";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."EmployeeLetters" t WHERE t.id = "pId" AND t."tenantId" = "vTenant" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EmployeeLetters % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Letter % is already %', "vRow"."letterNo", lower("vRow".status)
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'EMPLOYEE_LETTER_NOT_ACTIONABLE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Company"."Attachments" a WHERE a."tenantId" = "vTenant" AND a.id = "pAttachmentId" AND a."contentType" = 'application/pdf') THEN
    RAISE EXCEPTION 'The letter''s PDF is missing' USING ERRCODE = 'check_violation', HINT = 'VALIDATION_FAILED';
  END IF;
  UPDATE "HumanResources"."EmployeeLetters" t SET status = 'ISSUED', "pdfAttachmentId" = "pAttachmentId", language = 'EN' WHERE t.id = "pId";
  RETURN "pId";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."employeeLetterVoid"("pId" uuid, "pReason" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vRow" "HumanResources"."EmployeeLetters";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."EmployeeLetters" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EmployeeLetters % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'VOID' THEN
    RETURN "pId";
  END IF;
  UPDATE "HumanResources"."EmployeeLetters" t
     SET status = 'VOID', remarks = left(concat_ws(E'\n', NULLIF(t.remarks, ''), 'Void' || COALESCE(': ' || NULLIF(btrim("pReason"), ''), '')), 2000)
   WHERE t.id = "pId";
  RETURN "pId";
END $function$;

-- ---------------------------------------------------------------------------
-- 7. Employee assets: issue / return. An asset issued to someone with an open exit, and every asset still issued when an
--    exit is recorded, becomes a clearance item (IT for laptops, phones and SIMs, Administration otherwise); returning
--    the asset clears it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "HumanResources"."employeeAssetClearanceItem"("pTenant" uuid, "pOffboardingId" uuid, "pAssetId" uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "a" "HumanResources"."EmployeeAssets";
BEGIN
  SELECT * INTO "a" FROM "HumanResources"."EmployeeAssets" x WHERE x."tenantId" = "pTenant" AND x.id = "pAssetId";
  IF NOT FOUND OR "a".status <> 'ISSUED'
     OR EXISTS (SELECT 1 FROM "HumanResources"."ClearanceItems" c WHERE c."tenantId" = "pTenant" AND c."offboardingId" = "pOffboardingId" AND c."employeeAssetId" = "pAssetId") THEN
    RETURN;
  END IF;
  INSERT INTO "HumanResources"."ClearanceItems" ("tenantId", "offboardingId", "clearanceArea", description, "employeeAssetId", "recoverableAmount", status)
  VALUES ("pTenant", "pOffboardingId", CASE WHEN "a".category IN ('LAPTOP', 'MOBILE', 'SIM') THEN 'IT' ELSE 'ADMINISTRATION' END,
          left('Return ' || "a"."assetName" || COALESCE(' (' || "a".tag || ')', ''), 300), "a".id, "a"."valueAmount", 'PENDING');
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."employeeAssetIssue"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec"    "HumanResources"."EmployeeAssets";
  "vEmp"    text;
  "vFa"     "FixedAssets"."FixedAssets";
  "vId"     uuid;
  "vOff"    uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."EmployeeAssets", "pData");
  SELECT e.status INTO "vEmp" FROM "HumanResources"."Employees" e WHERE e."tenantId" = "vTenant" AND e.id = "vRec"."employeeId" AND e."deletedAt" IS NULL;
  IF "vEmp" IS NULL THEN
    RAISE EXCEPTION 'Employee % not found', "vRec"."employeeId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vEmp" = 'EXITED' THEN
    RAISE EXCEPTION 'This employee has exited' USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'EMPLOYEE_EXITED';
  END IF;
  IF "vRec"."assetId" IS NOT NULL THEN
    SELECT * INTO "vFa" FROM "FixedAssets"."FixedAssets" f WHERE f."tenantId" = "vTenant" AND f.id = "vRec"."assetId" AND f."deletedAt" IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Fixed asset % not found', "vRec"."assetId" USING ERRCODE = 'no_data_found';
    END IF;
    IF EXISTS (SELECT 1 FROM "HumanResources"."EmployeeAssets" x WHERE x."tenantId" = "vTenant" AND x."assetId" = "vRec"."assetId" AND x.status = 'ISSUED') THEN
      RAISE EXCEPTION 'Asset % is already issued to someone', "vFa".code USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'EMPLOYEE_ASSET_ALREADY_ISSUED';
    END IF;
  END IF;
  INSERT INTO "HumanResources"."EmployeeAssets" ("tenantId", "employeeId", "assetId", category, "assetName", specification, tag, "serialNo", "issuedOn",
                                                 condition, "valueAmount", status, remarks)
  VALUES ("vTenant", "vRec"."employeeId", "vRec"."assetId", "vRec".category, COALESCE(NULLIF(btrim("vRec"."assetName"), ''), "vFa".name),
          "vRec".specification, COALESCE(NULLIF(btrim("vRec".tag), ''), "vFa".code), COALESCE(NULLIF(btrim("vRec"."serialNo"), ''), "vFa"."serialNo"),
          COALESCE("vRec"."issuedOn", current_date), COALESCE("vRec".condition, 'GOOD'), COALESCE("vRec"."valueAmount", "vFa".cost), 'ISSUED', "vRec".remarks)
  RETURNING id INTO "vId";
  SELECT o.id INTO "vOff" FROM "HumanResources"."Offboardings" o
   WHERE o."tenantId" = "vTenant" AND o."employeeId" = "vRec"."employeeId" AND o.status IN ('SERVING_NOTICE', 'RETENTION_TALK', 'SETTLEMENT') LIMIT 1;
  IF "vOff" IS NOT NULL THEN
    PERFORM "HumanResources"."employeeAssetClearanceItem"("vTenant", "vOff", "vId");
  END IF;
  RETURN "vId";
END $function$;

CREATE OR REPLACE FUNCTION "HumanResources"."employeeAssetReturn"("pId" uuid, "pReturnedOn" date, "pCondition" text, "pRemarks" text DEFAULT NULL::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRow"    "HumanResources"."EmployeeAssets";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."EmployeeAssets" a WHERE a."tenantId" = "vTenant" AND a.id = "pId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee asset % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status <> 'ISSUED' THEN
    RAISE EXCEPTION '% is not issued (it is %)', "vRow"."assetName", lower("vRow".status)
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'EMPLOYEE_ASSET_NOT_ISSUED';
  END IF;
  IF COALESCE("pReturnedOn", current_date) < "vRow"."issuedOn" THEN
    RAISE EXCEPTION 'The return date is before the issue date' USING ERRCODE = 'check_violation', HINT = 'VALIDATION_FAILED';
  END IF;
  UPDATE "HumanResources"."EmployeeAssets" a
     SET status = 'RETURNED', "returnedOn" = COALESCE("pReturnedOn", current_date), condition = COALESCE("pCondition", a.condition),
         remarks = COALESCE(NULLIF(btrim("pRemarks"), ''), a.remarks)
   WHERE a.id = "pId";
  UPDATE "HumanResources"."ClearanceItems" c
     SET status = 'CLEARED', "clearedAt" = now(), "clearedByUserId" = "Company"."getCurrentUserId"(),
         remarks = left(concat_ws(' · ', NULLIF(c.remarks, ''), 'Returned ' || to_char(COALESCE("pReturnedOn", current_date), 'DD Mon YYYY')), 300)
   WHERE c."tenantId" = "vTenant" AND c."employeeAssetId" = "pId" AND c.status = 'PENDING'
     AND EXISTS (SELECT 1 FROM "HumanResources"."Offboardings" o WHERE o."tenantId" = c."tenantId" AND o.id = c."offboardingId" AND o.status NOT IN ('CLOSED', 'WITHDRAWN'));
  RETURN "pId";
END $function$;

-- New exit: the employee's issued assets become clearance items. Deferred to the end of the transaction, after
-- offboardingAddUpdate has synced the default clearance items (which removes rows it was not given).
CREATE OR REPLACE FUNCTION "HumanResources"."triggerOffboardingAssetClearance"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "a" record;
BEGIN
  FOR "a" IN SELECT x.id FROM "HumanResources"."EmployeeAssets" x WHERE x."tenantId" = NEW."tenantId" AND x."employeeId" = NEW."employeeId" AND x.status = 'ISSUED' LOOP
    PERFORM "HumanResources"."employeeAssetClearanceItem"(NEW."tenantId", NEW.id, "a".id);
  END LOOP;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "offboardingsAssetClearance" ON "HumanResources"."Offboardings";
CREATE CONSTRAINT TRIGGER "offboardingsAssetClearance" AFTER INSERT ON "HumanResources"."Offboardings"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "HumanResources"."triggerOffboardingAssetClearance"();

-- ---------------------------------------------------------------------------
-- 8. Every company: FS / LTR numbering, the FINAL_SETTLEMENT workflow (HR manager, then financial accountant), the
--    gratuity setting and the English HR letter templates. Editable afterwards; nothing is replaced once it exists.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Payroll"."seedTalentExitsDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vN"   integer;
  "vK"   integer;
  "vWf"  uuid;
  "vHr"  uuid;
  "vFa"  uuid;
  "t"    record;
BEGIN
  INSERT INTO "Company"."NumberingSeries" ("tenantId", "docType", "branchId", prefix, pattern, padding, "startValue", "resetPolicy", "isActive")
  SELECT "pTenant", d.code, NULL, d."defaultPrefix", d."defaultPattern", d."defaultPadding", 1, d."defaultResetPolicy", true
    FROM "Company"."DocumentTypes" d
   WHERE d.code IN ('FS', 'LTR')
     AND NOT EXISTS (SELECT 1 FROM "Company"."NumberingSeries" s WHERE s."tenantId" = "pTenant" AND s."docType" = d.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT;

  INSERT INTO "Company"."CompanySettingValues" ("tenantId", "settingGroup", key, value, description)
  VALUES ("pTenant", 'PAYROLL', 'gratuity', jsonb_build_object('daysPerYear', 30, 'minServiceYears', 1, 'partYearOverMonths', 6, 'taxExemptAmount', 300000),
          'Gratuity on exit: days of pay per year of service, from the minimum full years; a part-year over partYearOverMonths counts as a year; the first taxExemptAmount is tax-free.')
  ON CONFLICT ("tenantId", "settingGroup", key) DO NOTHING;
  GET DIAGNOSTICS "vK" = ROW_COUNT;
  "vN" := "vN" + "vK";

  FOR "t" IN SELECT * FROM (VALUES
    ('Offer letter', 'OFFER',
     '<p>{{letter.date}}</p><p>{{letter.addressedTo}}</p><p><b>Subject: Offer of employment</b></p><p>Dear {{employee.name}},</p>'
     || '<p>We are pleased to offer you the position of {{employee.designation}} in the {{employee.department}} department of {{company.name}}, with effect from {{employee.joiningDate}}.</p>'
     || '<p>{{salary.statement}}</p>'
     || '<p>This offer is subject to the company''s policies and to the verification of your documents. Please sign and return a copy of this letter to confirm your acceptance.</p>'
     || '<p>We look forward to welcoming you to the team.</p>'),
    ('Appointment letter', 'APPOINTMENT',
     '<p>{{letter.date}}</p><p>{{employee.name}}<br>CNIC {{employee.cnic}}</p><p><b>Subject: Letter of appointment</b></p><p>Dear {{employee.name}},</p>'
     || '<p>With reference to your application and the interviews that followed, {{company.name}} is pleased to appoint you as {{employee.designation}} in the {{employee.department}} department, with effect from {{employee.joiningDate}}.</p>'
     || '<p>{{salary.statement}}</p>'
     || '<p>Your employment is governed by the company''s service rules and policies as amended from time to time. Either party may end this employment by giving {{employee.noticeDays}} days'' notice in writing.</p>'
     || '<p>Please sign the duplicate copy of this letter in token of your acceptance.</p>'),
    ('Experience letter', 'EXPERIENCE',
     '<p>{{letter.date}}</p><p><b>TO WHOM IT MAY CONCERN</b></p>'
     || '<p>This is to certify that {{employee.name}}, holding CNIC {{employee.cnic}}, worked with {{company.name}} as {{employee.designation}} in the {{employee.department}} department from {{employee.joiningDate}} to {{employee.exitDate}}.</p>'
     || '<p>During this period we found {{employee.name}} hard-working, honest and dedicated. We wish {{employee.name}} every success in the future.</p>'
     || '<p>This letter is issued on request, without any liability on the part of the company.</p>'),
    ('Salary certificate', 'SALARY_CERTIFICATE',
     '<p>{{letter.date}}</p><p>{{letter.addressedTo}}</p><p><b>Subject: Salary certificate</b></p>'
     || '<p>This is to certify that {{employee.name}}, holding CNIC {{employee.cnic}}, has been employed with {{company.name}} since {{employee.joiningDate}} and is currently working as {{employee.designation}} in the {{employee.department}} department.</p>'
     || '<p>{{salary.statement}}</p>'
     || '<p>This certificate is issued at the request of the employee, without any liability on the part of the company.</p>'),
    ('Relieving letter', 'RELIEVING',
     '<p>{{letter.date}}</p><p>{{employee.name}}<br>CNIC {{employee.cnic}}</p><p><b>Subject: Relieving letter</b></p><p>Dear {{employee.name}},</p>'
     || '<p>This refers to your separation from {{company.name}}. You are relieved of your duties as {{employee.designation}} with effect from the close of business on {{employee.exitDate}}.</p>'
     || '<p>Your clearance has been completed and your final settlement has been processed. We thank you for your contribution and wish you the very best.</p>')
  ) v(name, kind, body)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM "Company"."DocumentTemplates" d WHERE d."tenantId" = "pTenant" AND d.name = "t".name) THEN
      INSERT INTO "Company"."DocumentTemplates" ("tenantId", name, category, "docType", "letterKind", paper, "headerLayout", language, "showNtnStrn", "showFbrQr",
                                                 "showHsCodes", "showItemImages", "showAmountInWords", "showBankDetails", "bodyHtml", version, "isDefault", status)
      VALUES ("pTenant", "t".name, 'HR_LETTER', NULL, "t".kind, 'A4_PORTRAIT', 'LOGO_LEFT', 'EN', false, false, false, false, true, false, "t".body, 1,
              NOT EXISTS (SELECT 1 FROM "Company"."DocumentTemplates" d WHERE d."tenantId" = "pTenant" AND d.category = 'HR_LETTER' AND d."letterKind" = "t".kind
                            AND d."isDefault" AND d."deletedAt" IS NULL),
              'ACTIVE');
      "vN" := "vN" + 1;
    END IF;
  END LOOP;

  SELECT r.id INTO "vHr" FROM "Company"."Roles" r WHERE r."tenantId" = "pTenant" AND r."systemKey" = 'HR_MANAGER' LIMIT 1;
  SELECT r.id INTO "vFa" FROM "Company"."Roles" r WHERE r."tenantId" = "pTenant" AND r."systemKey" = 'FINANCIAL_ACCOUNTANT' LIMIT 1;
  IF "vHr" IS NULL OR "vFa" IS NULL THEN
    RETURN "vN";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Company"."ApprovalWorkflows" x WHERE x."tenantId" = "pTenant" AND x.subject = 'FINAL_SETTLEMENT' AND x."deletedAt" IS NULL) THEN
    INSERT INTO "Company"."ApprovalWorkflows" ("tenantId", name, subject, description, status, version, priority, "onComplete", "onReject",
                                              "notifyPreparer", "notifyInApp", "notifyEmail", "notifyWhatsapp", "publishedAt")
    VALUES ("pTenant", 'Final settlements', 'FINAL_SETTLEMENT', 'Default: HR manager, then the financial accountant. The preparer never approves. Edit as needed.',
            'ACTIVE', 1, 100, 'MARK_APPROVED', 'RETURN_TO_PREPARER', true, true, false, false, now())
    RETURNING id INTO "vWf";
    INSERT INTO "Company"."ApprovalWorkflowSteps" ("tenantId", "workflowId", "stepNo", name, "approverType", "approverRoleId", "slaHours", "onSlaBreach",
                                                  "approvalMode", "blockSelfApproval", "allowDelegation", "requireComment")
    VALUES ("pTenant", "vWf", 1, 'HR manager', 'ROLE', "vHr", 48, 'REMIND', 'ANY', true, true, false),
           ("pTenant", "vWf", 2, 'Financial accountant', 'ROLE', "vFa", 48, 'REMIND', 'ANY', true, true, false);
    "vN" := "vN" + 1;
  END IF;
  RETURN "vN";
END $function$;

CREATE OR REPLACE FUNCTION "Payroll"."triggerTenantTalentExitsDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Payroll"."seedTalentExitsDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

-- after the tenant's roles exist (provisionTenant creates them in the same transaction): deferred to the end of it
DROP TRIGGER IF EXISTS "tenantsTalentExitsDefaults" ON "Platform"."Tenants";
CREATE CONSTRAINT TRIGGER "tenantsTalentExitsDefaults" AFTER INSERT ON "Platform"."Tenants"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "Payroll"."triggerTenantTalentExitsDefaults"();

SELECT set_config('app.actorLabel', 'seedTalentExitsDefaultsFor', false);
SELECT "Payroll"."seedTalentExitsDefaultsFor"(t.id) FROM "Platform"."Tenants" t;
SELECT set_config('app.actorLabel', '204-talent-exits.sql', false);

-- ---------------------------------------------------------------------------
-- 9. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('FINAL_SETTLEMENT_EXISTS',       409, 'CONFLICT',      'PAYROLL', 'This exit already has a final settlement.', 'Second settlement for an exit or employee (one per exit unless cancelled)', true, NULL),
  ('FINAL_SETTLEMENT_LOCKED',       409, 'BUSINESS_RULE', 'PAYROLL', 'This settlement can''t be changed at its current step.', 'Edit, calculate, submit, approve, pay or cancel out of order', true, NULL),
  ('FINAL_SETTLEMENT_NO_LINES',     409, 'BUSINESS_RULE', 'PAYROLL', 'Calculate the settlement before submitting it.', 'Submit of a settlement without amounts', true, NULL),
  ('FINAL_SETTLEMENT_PREPARER',     403, 'PERMISSION',    'PAYROLL', 'The person who prepared this settlement can''t approve it.', 'Preparer approving their own final settlement', true, NULL),
  ('FINAL_SETTLEMENT_NOT_PAYABLE',  409, 'BUSINESS_RULE', 'PAYROLL', 'There is nothing to pay on this settlement.', 'Pay of a settlement whose net is zero or owed by the employee', true, NULL),
  ('FINAL_SETTLEMENT_NO_SALARY',    409, 'BUSINESS_RULE', 'PAYROLL', 'This employee has no salary to settle on. Add their salary first.', 'Calculate for an employee without a salary record', true, NULL),
  ('FINAL_SETTLEMENT_NOT_APPROVED', 409, 'BUSINESS_RULE', 'HR',      'Approve the final settlement before completing the exit.', 'Offboarding completed without an approved (posted) final settlement', true, NULL),
  ('EMPLOYEE_LETTER_NOT_ACTIONABLE',409, 'BUSINESS_RULE', 'HR',      'This letter can''t be changed at its current step.', 'Edit or issue of a letter that is not a draft', true, NULL),
  ('EMPLOYEE_LETTER_NO_TEMPLATE',   409, 'BUSINESS_RULE', 'HR',      'There is no active HR letter template for this letter. Add one under Settings › Document templates.', 'Letter generated without a template', true, NULL),
  ('EMPLOYEE_ASSET_ALREADY_ISSUED', 409, 'CONFLICT',      'HR',      'This asset is already issued to someone.', 'Second issue of a fixed asset that has an ISSUED holder', true, NULL),
  ('EMPLOYEE_ASSET_NOT_ISSUED',     409, 'BUSINESS_RULE', 'HR',      'This asset is not issued.', 'Return of an asset that is returned, lost or written off', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

SELECT set_config('app.actorLabel', '', false);

-- ---------------------------------------------------------------------------------------------------------------------
-- Financial Accountant: step 2 of the default PAYROLL_RUN and FINAL_SETTLEMENT workflows, so it needs view / approve /
-- post / export on prun and fs (HR keeps create / edit). Default grants live in Platform.SystemRoleGrants (the source of
-- truth since Phase 37; prisma/catalog.ts mirrors it) and are applied to every existing company's FINANCIAL_ACCOUNTANT role.
-- Idempotent.
DO $$
DECLARE
  "vPrev" text := current_setting('app.actorLabel', true);
BEGIN
  PERFORM set_config('app.actorLabel', '204-talent-exits.sql: finance approves payroll and settlements', true);

  INSERT INTO "Platform"."SystemRoleGrants" ("systemKey", "permissionCode")
  SELECT 'FINANCIAL_ACCOUNTANT', p.code
    FROM "Company"."Permissions" p
   WHERE p.code IN ('prun:view', 'prun:approve', 'prun:post', 'prun:export', 'fs:view', 'fs:approve', 'fs:post', 'fs:export')
  ON CONFLICT DO NOTHING;

  INSERT INTO "Company"."RolePermissions" ("tenantId", "roleId", "permissionCode")
  SELECT r."tenantId", r.id, g."permissionCode"
    FROM "Company"."Roles" r
    JOIN "Platform"."SystemRoleGrants" g ON g."systemKey" = r."systemKey"
   WHERE r."systemKey" = 'FINANCIAL_ACCOUNTANT'
     AND g."permissionCode" IN ('prun:view', 'prun:approve', 'prun:post', 'prun:export', 'fs:view', 'fs:approve', 'fs:post', 'fs:export')
     AND NOT EXISTS (SELECT 1 FROM "Company"."RolePermissions" rp
                      WHERE rp."tenantId" = r."tenantId" AND rp."roleId" = r.id AND rp."permissionCode" = g."permissionCode");

  PERFORM set_config('app.actorLabel', coalesce("vPrev", ''), true);
END $$;
