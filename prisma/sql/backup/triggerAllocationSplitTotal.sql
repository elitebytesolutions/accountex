CREATE OR REPLACE FUNCTION "Accounting"."triggerAllocationSplitTotal"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  "vTenant" uuid := COALESCE(NEW."tenantId", OLD."tenantId");
  "vRule"   uuid := COALESCE(NEW."allocationRuleId", OLD."allocationRuleId");
  "vTotal"  numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM "Accounting"."CostAllocationRules" WHERE "tenantId" = "vTenant" AND id = "vRule" AND status = 'ACTIVE') THEN
    SELECT COALESCE(sum(percent), 0) INTO "vTotal"
      FROM "Accounting"."CostAllocationSplits" WHERE "tenantId" = "vTenant" AND "allocationRuleId" = "vRule";
    IF "vTotal" <> 100 THEN
      RAISE EXCEPTION 'Allocation splits must total 100%% (now %)', "vTotal" USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END $function$

