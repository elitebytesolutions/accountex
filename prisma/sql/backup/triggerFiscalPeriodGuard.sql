CREATE OR REPLACE FUNCTION "Accounting"."triggerFiscalPeriodGuard"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  "vYear" record;
  "vOpen" int;
BEGIN
  SELECT "startDate", "endDate", status, "hasAdjustmentPeriod" INTO "vYear"
    FROM "Accounting"."FiscalYears" WHERE "tenantId" = NEW."tenantId" AND id = NEW."fiscalYearId";
  IF NEW."startDate" < "vYear"."startDate" OR NEW."endDate" > "vYear"."endDate" THEN
    RAISE EXCEPTION 'Period % (% – %) lies outside its fiscal year', NEW.code, NEW."startDate", NEW."endDate"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."isAdjustment" AND NOT "vYear"."hasAdjustmentPeriod" THEN
    RAISE EXCEPTION 'Fiscal year has no adjustment period (P13) enabled' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'OPEN' AND NEW.status IN ('CLOSED','LOCKED') THEN
    SELECT count(*) INTO "vOpen"
      FROM "Accounting"."Vouchers" j
     WHERE j."tenantId" = NEW."tenantId"
       AND j.status IN ('DRAFT','PENDING_APPROVAL')
       AND j."postingDate" BETWEEN NEW."startDate" AND NEW."endDate";
    IF "vOpen" > 0 THEN
      RAISE EXCEPTION '% draft/pending vouchers in %: post them or move them to the next period first', "vOpen", NEW.code
        USING ERRCODE = 'check_violation';
    END IF;
    NEW."closedAt" := COALESCE(NEW."closedAt", now());
    NEW."closedByUserId" := COALESCE(NEW."closedByUserId", "Company"."getCurrentUserId"());
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'LOCKED' AND OLD.status <> 'LOCKED' THEN
    NEW."lockedAt" := COALESCE(NEW."lockedAt", now());
    NEW."lockedByUserId" := COALESCE(NEW."lockedByUserId", "Company"."getCurrentUserId"());
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'OPEN' AND OLD.status <> 'OPEN' THEN   -- Reopen
    NEW."closedAt" := NULL;  NEW."closedByUserId" := NULL;
    NEW."lockedAt" := NULL;  NEW."lockedByUserId" := NULL;
  END IF;
  RETURN NEW;
END $function$

