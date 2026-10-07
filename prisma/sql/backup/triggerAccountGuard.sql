CREATE OR REPLACE FUNCTION "Accounting"."triggerAccountGuard"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  "vParent" record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.code IS DISTINCT FROM OLD.code OR NEW."parentAccountId" IS DISTINCT FROM OLD."parentAccountId"
       OR NEW.level IS DISTINCT FROM OLD.level OR NEW."accountClass" IS DISTINCT FROM OLD."accountClass"
       OR NEW.kind IS DISTINCT FROM OLD.kind THEN
      RAISE EXCEPTION 'Account %: code, parent, level, class and kind cannot be changed after creation', OLD.code
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."openingBalance" IS DISTINCT FROM OLD."openingBalance"
       OR NEW."openingAsOf" IS DISTINCT FROM OLD."openingAsOf" THEN
      RAISE EXCEPTION 'Account %: opening balance is locked after creation (use Opening Balances)', OLD.code
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."deletedAt" IS NOT NULL AND OLD."deletedAt" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Accounting"."ChartOfAccounts" c
                  WHERE c."tenantId" = NEW."tenantId" AND c."parentAccountId" = NEW.id AND c."deletedAt" IS NULL) THEN
        RAISE EXCEPTION 'Account % has sub-accounts. Move or delete them first.', NEW.code
          USING ERRCODE = 'foreign_key_violation';
      END IF;
      IF EXISTS (SELECT 1 FROM "Accounting"."VoucherLines" l
                  WHERE l."tenantId" = NEW."tenantId" AND l."accountId" = NEW.id) THEN
        RAISE EXCEPTION 'Account % has postings and cannot be deleted; deactivate it instead.', NEW.code
          USING ERRCODE = 'foreign_key_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT
  IF NEW."parentAccountId" IS NOT NULL THEN
    SELECT code, level, "accountClass", kind, "deletedAt" INTO "vParent"
      FROM "Accounting"."ChartOfAccounts" WHERE "tenantId" = NEW."tenantId" AND id = NEW."parentAccountId";
    IF NOT FOUND OR "vParent"."deletedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Parent account not found' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF "vParent".kind = 'POSTABLE' THEN
      RAISE EXCEPTION 'Postable accounts cannot have sub-accounts (%)', "vParent".code USING ERRCODE = 'check_violation';
    END IF;
    IF "vParent".code <> "Accounting"."getParentAccountCode"(NEW.code) OR "vParent".level <> NEW.level - 1
       OR "vParent"."accountClass" <> NEW."accountClass" THEN
      RAISE EXCEPTION 'Account code % does not belong under parent %', NEW.code, "vParent".code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$

