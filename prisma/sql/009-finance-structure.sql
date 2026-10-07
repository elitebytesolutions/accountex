-- Phase 3: Finance structure (fiscal years & periods, chart of accounts, cost centres & projects, account mappings).
-- Idempotent. Apply with: npm run db:sql

-- ---------------------------------------------------------------------------
-- 1. Audit coverage (row history)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "savedLedgerViewsAudit" ON "Accounting"."SavedLedgerViews";
CREATE TRIGGER "savedLedgerViewsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Accounting"."SavedLedgerViews"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "costCentresAudit" ON "Accounting"."CostCentres";
CREATE TRIGGER "costCentresAudit" AFTER INSERT OR UPDATE OR DELETE ON "Accounting"."CostCentres"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "projectTagsAudit" ON "Accounting"."ProjectTags";
CREATE TRIGGER "projectTagsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Accounting"."ProjectTags"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "postingRolesAudit" ON "Company"."PostingRoles";
CREATE TRIGGER "postingRolesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Company"."PostingRoles"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('ACCOUNT_STRUCTURE_LOCKED',  409, 'BUSINESS_RULE', 'FINANCE', 'An account''s code, parent, level, class and kind can''t change after it is created.', 'accountGuard: structure change', true, NULL),
  ('ACCOUNT_OPENING_LOCKED',    409, 'BUSINESS_RULE', 'FINANCE', 'Opening balances are entered on the Opening Balances screen.', 'accountGuard: opening balance change', true, NULL),
  ('ACCOUNT_PARENT_INVALID',    422, 'VALIDATION',    'FINANCE', 'This code does not belong under the chosen parent account.', 'accountGuard: parent missing, postable or not the code''s parent', true, NULL),
  ('ACCOUNT_HAS_CHILDREN',      409, 'BUSINESS_RULE', 'FINANCE', 'This account has sub-accounts. Move or delete them first.', 'accountGuard: delete with children', true, NULL),
  ('ACCOUNT_HAS_POSTINGS',      409, 'BUSINESS_RULE', 'FINANCE', 'This account has postings and can''t be deleted. Deactivate it instead.', 'accountGuard: delete with voucher lines', true, NULL),
  ('ACCOUNT_CODE_INVALID',      422, 'VALIDATION',    'FINANCE', 'Use a code like 1110 (group) or 1110-01 (postable account) in the parent''s range.', 'Account code format / range', true, NULL),
  ('ACCOUNT_NOT_POSTABLE',      422, 'VALIDATION',    'FINANCE', 'Choose an active postable account.', 'Mapping or line to a header/group or inactive account', true, NULL),
  ('COA_NOT_EMPTY',             409, 'BUSINESS_RULE', 'FINANCE', 'A template can only be applied to an empty chart of accounts.', 'applyChartTemplate on a chart with accounts', true, NULL),
  ('FISCAL_YEAR_OVERLAP',       409, 'CONFLICT',      'FINANCE', 'These dates overlap an existing fiscal year or period.', 'Exclusion constraint on fiscal years / periods', true, '23P01'),
  ('PERIOD_OUTSIDE_YEAR',       422, 'VALIDATION',    'FINANCE', 'The period must lie inside its fiscal year.', 'fiscalPeriodGuard', true, NULL),
  ('PERIOD_ADJUSTMENT_DISABLED',422, 'VALIDATION',    'FINANCE', 'This fiscal year has no adjustment period (P13).', 'fiscalPeriodGuard', true, NULL),
  ('PERIOD_HAS_OPEN_VOUCHERS',  409, 'BUSINESS_RULE', 'FINANCE', 'Post or move the draft and pending vouchers of this period first.', 'fiscalPeriodGuard: close/lock with open vouchers', true, NULL),
  ('PERIOD_LOCKED',             409, 'BUSINESS_RULE', 'FINANCE', 'A locked period can only be reopened through an approved reopen request.', 'Reopen of a LOCKED period', true, NULL),
  ('ALLOCATION_NOT_100',        422, 'VALIDATION',    'FINANCE', 'Allocation splits must total exactly 100%.', 'allocationSplitTotal', true, NULL),
  ('COST_CENTRE_CYCLE',         422, 'VALIDATION',    'FINANCE', 'A cost centre can''t sit under itself or one of its own sub-centres.', 'Cost centre parent cycle', true, NULL),
  ('COST_CENTRE_HAS_CHILDREN',  409, 'BUSINESS_RULE', 'FINANCE', 'This cost centre has sub-centres. Move or delete them first.', 'Delete of a cost centre with sub-centres', true, NULL),
  ('PERIOD_NOT_CLOSED',         409, 'BUSINESS_RULE', 'FINANCE', 'Close every module of the period before locking it.', 'Lock of a period that is not CLOSED', true, NULL),
  ('CODE_RETIRED',              409, 'CONFLICT',      'FINANCE', 'This code belonged to a deleted record. Codes are never reused; choose another.', 'Create with the code of a soft-deleted row', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 3. Existing finance guards: same logic, now with error codes (HINT). Originals in prisma/sql/backup/.
--    Coded raises use check_violation: @prisma/adapter-pg drops the HINT of foreign_key/unique/not-null violations.
-- ---------------------------------------------------------------------------
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
        USING ERRCODE = 'check_violation', HINT = 'ACCOUNT_STRUCTURE_LOCKED';
    END IF;
    IF NEW."openingBalance" IS DISTINCT FROM OLD."openingBalance"
       OR NEW."openingAsOf" IS DISTINCT FROM OLD."openingAsOf" THEN
      RAISE EXCEPTION 'Account %: opening balance is locked after creation (use Opening Balances)', OLD.code
        USING ERRCODE = 'check_violation', HINT = 'ACCOUNT_OPENING_LOCKED';
    END IF;
    IF NEW."deletedAt" IS NOT NULL AND OLD."deletedAt" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Accounting"."ChartOfAccounts" c
                  WHERE c."tenantId" = NEW."tenantId" AND c."parentAccountId" = NEW.id AND c."deletedAt" IS NULL) THEN
        RAISE EXCEPTION 'Account % has sub-accounts. Move or delete them first.', NEW.code
          USING ERRCODE = 'check_violation', HINT = 'ACCOUNT_HAS_CHILDREN';
      END IF;
      IF EXISTS (SELECT 1 FROM "Accounting"."VoucherLines" l
                  WHERE l."tenantId" = NEW."tenantId" AND l."accountId" = NEW.id) THEN
        RAISE EXCEPTION 'Account % has postings and cannot be deleted; deactivate it instead.', NEW.code
          USING ERRCODE = 'check_violation', HINT = 'ACCOUNT_HAS_POSTINGS';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT
  IF NEW."parentAccountId" IS NOT NULL THEN
    SELECT code, level, "accountClass", kind, "deletedAt" INTO "vParent"
      FROM "Accounting"."ChartOfAccounts" WHERE "tenantId" = NEW."tenantId" AND id = NEW."parentAccountId";
    IF NOT FOUND OR "vParent"."deletedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Parent account not found' USING ERRCODE = 'check_violation', HINT = 'ACCOUNT_PARENT_INVALID';
    END IF;
    IF "vParent".kind = 'POSTABLE' THEN
      RAISE EXCEPTION 'Postable accounts cannot have sub-accounts (%)', "vParent".code USING ERRCODE = 'check_violation', HINT = 'ACCOUNT_PARENT_INVALID';
    END IF;
    IF "vParent".code <> "Accounting"."getParentAccountCode"(NEW.code) OR "vParent".level <> NEW.level - 1
       OR "vParent"."accountClass" <> NEW."accountClass" THEN
      RAISE EXCEPTION 'Account code % does not belong under parent %', NEW.code, "vParent".code
        USING ERRCODE = 'check_violation', HINT = 'ACCOUNT_PARENT_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

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
      RAISE EXCEPTION 'Allocation splits must total 100%% (now %)', "vTotal" USING ERRCODE = 'check_violation', HINT = 'ALLOCATION_NOT_100';
    END IF;
  END IF;
  RETURN NULL;
END $function$;

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
      USING ERRCODE = 'check_violation', HINT = 'PERIOD_OUTSIDE_YEAR';
  END IF;
  IF NEW."isAdjustment" AND NOT "vYear"."hasAdjustmentPeriod" THEN
    RAISE EXCEPTION 'Fiscal year has no adjustment period (P13) enabled' USING ERRCODE = 'check_violation', HINT = 'PERIOD_ADJUSTMENT_DISABLED';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'OPEN' AND NEW.status IN ('CLOSED','LOCKED') THEN
    SELECT count(*) INTO "vOpen"
      FROM "Accounting"."Vouchers" j
     WHERE j."tenantId" = NEW."tenantId"
       AND j.status IN ('DRAFT','PENDING_APPROVAL')
       AND j."postingDate" BETWEEN NEW."startDate" AND NEW."endDate";
    IF "vOpen" > 0 THEN
      RAISE EXCEPTION '% draft/pending vouchers in %: post them or move them to the next period first', "vOpen", NEW.code
        USING ERRCODE = 'check_violation', HINT = 'PERIOD_HAS_OPEN_VOUCHERS';
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
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Standard chart of accounts template: Pakistan trading & distribution.
--    Level, class and parent come from the code (same functions as the account checks).
-- ---------------------------------------------------------------------------
SELECT set_config('app.actorLabel', '009-finance-structure.sql', true);

INSERT INTO "Platform"."ChartOfAccountsTemplates" ("code", "name", "industry", "version", "status", "description", "icon")
VALUES ('PK_TRADING', 'Pakistan trading & distribution', 'TRADING_DISTRIBUTION', 1, 'DEFAULT',
        'Standard chart for trading and distribution companies in Pakistan: sales tax, withholding and statutory accounts, with every posting role mapped.', 'list-tree')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "industry" = EXCLUDED."industry", "description" = EXCLUDED."description", "icon" = EXCLUDED."icon";

WITH t AS (SELECT id FROM "Platform"."ChartOfAccountsTemplates" WHERE "code" = 'PK_TRADING'),
rows ("code", "name", "nature", "subType", "defaultRole") AS (VALUES
  ('1000','Assets','DR',NULL,NULL),
  ('1100','Current assets','DR',NULL,NULL),
  ('1110','Cash & bank','DR',NULL,NULL),
  ('1110-01','Cash in hand','DR','CASH','CASH_IN_HAND'),
  ('1110-02','Petty cash','DR','CASH','PETTY_CASH'),
  ('1110-03','Cheques in hand','DR','CASH','CHEQUES_IN_HAND'),
  ('1110-10','Bank: current account','DR','BANK','DEFAULT_BANK'),
  ('1110-11','Bank: salary account','DR','BANK','SALARY_BANK'),
  ('1110-20','POS card clearing','DR','BANK','POS_CARD_CLEARING'),
  ('1110-21','Card payments clearing','DR','BANK','CARD_CLEARING'),
  ('1110-22','Mobile wallet clearing (JazzCash / Easypaisa / Raast)','DR','BANK','WALLET_CLEARING'),
  ('1120','Trade receivables','DR',NULL,NULL),
  ('1120-01','Trade debtors','DR','RECEIVABLE','AR_CONTROL'),
  ('1120-02','Salesman receivable (cash short)','DR','RECEIVABLE','SALESMAN_RECEIVABLE'),
  ('1120-03','Provision for doubtful debts','CR','RECEIVABLE',NULL),
  ('1130','Inventory','DR',NULL,NULL),
  ('1130-01','Stock in trade','DR','INVENTORY','INVENTORY'),
  ('1130-02','Stock on vans','DR','INVENTORY','STOCK_VAN'),
  ('1130-03','Stock in transit (transfers)','DR','INVENTORY','STOCK_IN_TRANSIT'),
  ('1130-04','Goods in transit (purchases)','DR','INVENTORY','GOODS_IN_TRANSIT'),
  ('1130-05','Goods delivered not invoiced','DR','INVENTORY','GDNI'),
  ('1140','Advances, deposits & prepayments','DR',NULL,NULL),
  ('1140-01','Advances to suppliers','DR','PREPAYMENT','VENDOR_ADVANCES'),
  ('1140-02','Employee advances','DR','PREPAYMENT','EMPLOYEE_ADVANCES'),
  ('1140-03','Employee loans','DR','PREPAYMENT','EMPLOYEE_LOANS'),
  ('1140-04','Prepaid rent','DR','PREPAYMENT',NULL),
  ('1140-05','Prepaid insurance','DR','PREPAYMENT',NULL),
  ('1140-06','Short-term security deposits','DR','DEPOSIT',NULL),
  ('1150','Tax receivables','DR',NULL,NULL),
  ('1150-01','Input sales tax','DR','RECEIVABLE','INPUT_GST'),
  ('1150-02','Input sales tax on imports','DR','RECEIVABLE','IMPORT_INPUT_ST'),
  ('1150-03','WHT deducted by customers','DR','RECEIVABLE','WHT_RECEIVABLE'),
  ('1150-04','Advance income tax','DR','RECEIVABLE','ADVANCE_INCOME_TAX'),
  ('1150-05','Advance tax on imports u/s 148','DR','RECEIVABLE','ADVANCE_TAX_148'),
  ('1200','Non-current assets','DR',NULL,NULL),
  ('1210','Property, plant & equipment','DR',NULL,NULL),
  ('1210-01','Land','DR','FIXED_ASSET',NULL),
  ('1210-02','Buildings','DR','FIXED_ASSET',NULL),
  ('1210-03','Plant & machinery','DR','FIXED_ASSET',NULL),
  ('1210-04','Furniture & fixtures','DR','FIXED_ASSET',NULL),
  ('1210-05','Office equipment','DR','FIXED_ASSET',NULL),
  ('1210-06','Computers & IT equipment','DR','FIXED_ASSET',NULL),
  ('1210-07','Vehicles','DR','FIXED_ASSET',NULL),
  ('1220','Accumulated depreciation','CR',NULL,NULL),
  ('1220-01','Accumulated depreciation','CR','FIXED_ASSET','ACCUMULATED_DEPRECIATION'),
  ('1230','Long-term deposits','DR',NULL,NULL),
  ('1230-01','Long-term security deposits','DR','DEPOSIT',NULL),
  ('1230-02','Utility deposits','DR','DEPOSIT',NULL),
  ('2000','Liabilities','CR',NULL,NULL),
  ('2100','Current liabilities','CR',NULL,NULL),
  ('2110','Trade payables','CR',NULL,NULL),
  ('2110-01','Trade creditors','CR','PAYABLE','AP_CONTROL'),
  ('2110-02','Goods received not invoiced','CR','PAYABLE','GRNI'),
  ('2110-03','Customer advances','CR','PAYABLE','CUSTOMER_ADVANCES'),
  ('2110-04','Post-dated cheques issued','CR','PAYABLE','PDC_PAYABLE'),
  ('2110-05','Landed cost clearing','CR','PAYABLE','LANDED_COST_CLEARING'),
  ('2120','Accrued liabilities','CR',NULL,NULL),
  ('2120-01','Salaries payable','CR','ACCRUAL','SALARIES_PAYABLE'),
  ('2120-02','Employee expense claims payable','CR','ACCRUAL','EMPLOYEE_CLAIMS_PAYABLE'),
  ('2120-03','Commission payable','CR','ACCRUAL','COMMISSION_PAYABLE'),
  ('2120-04','Accrued expenses','CR','ACCRUAL',NULL),
  ('2120-05','Utilities payable','CR','ACCRUAL',NULL),
  ('2130','Sales tax','CR',NULL,NULL),
  ('2130-01','Output sales tax','CR','TAX','OUTPUT_GST'),
  ('2130-02','Further tax payable','CR','TAX','FURTHER_TAX_PAYABLE'),
  ('2130-03','Sales tax settlement','CR','TAX','SALES_TAX_SETTLEMENT'),
  ('2140','Income tax withheld','CR',NULL,NULL),
  ('2140-01','WHT payable','CR','TAX','WHT_PAYABLE'),
  ('2140-02','WHT payable u/s 153','CR','TAX','WHT_PAYABLE_153'),
  ('2140-03','Income tax on salaries u/s 149','CR','TAX','INCOME_TAX_PAYABLE_SALARY'),
  ('2140-04','Advance tax collected','CR','TAX','ADVANCE_TAX_COLLECTED'),
  ('2140-05','Advance tax u/s 236G','CR','TAX','ADVANCE_TAX_236G'),
  ('2140-06','Provision for taxation','CR','TAX',NULL),
  ('2150','Statutory dues','CR',NULL,NULL),
  ('2150-01','EOBI payable','CR','STATUTORY','EOBI_PAYABLE'),
  ('2150-02','PESSI / SESSI payable','CR','STATUTORY','PESSI_PAYABLE'),
  ('2150-03','Provident fund payable','CR','STATUTORY','PF_PAYABLE'),
  ('2150-04','Workers'' welfare fund payable','CR','STATUTORY',NULL),
  ('2160','Short-term borrowings','CR',NULL,NULL),
  ('2160-01','Running finance','CR','BORROWING',NULL),
  ('2160-02','Short-term loans','CR','BORROWING',NULL),
  ('2200','Non-current liabilities','CR',NULL,NULL),
  ('2210','Long-term financing','CR',NULL,NULL),
  ('2210-01','Long-term loans','CR','BORROWING',NULL),
  ('2210-02','Lease liabilities','CR','BORROWING',NULL),
  ('2220','Deferred liabilities','CR',NULL,NULL),
  ('2220-01','Gratuity payable','CR','ACCRUAL',NULL),
  ('2220-02','Deferred tax liability','CR','TAX',NULL),
  ('3000','Equity','CR',NULL,NULL),
  ('3100','Capital & reserves','CR',NULL,NULL),
  ('3110','Share capital','CR',NULL,NULL),
  ('3110-01','Paid-up capital','CR','CAPITAL',NULL),
  ('3110-02','Owner''s capital','CR','CAPITAL',NULL),
  ('3120','Reserves','CR',NULL,NULL),
  ('3120-01','Retained earnings','CR','RESERVE','RETAINED_EARNINGS'),
  ('3120-02','Opening balance equity','CR','RESERVE','OPENING_BALANCE_EQUITY'),
  ('3120-03','Opening balance suspense','CR','RESERVE','OB_SUSPENSE'),
  ('3130','Drawings','DR',NULL,NULL),
  ('3130-01','Owner''s drawings','DR','DRAWINGS',NULL),
  ('4000','Revenue','CR',NULL,NULL),
  ('4100','Sales','CR',NULL,NULL),
  ('4110','Sales of goods & services','CR',NULL,NULL),
  ('4110-01','Local sales','CR','SALES','SALES_REVENUE'),
  ('4110-02','Export sales','CR','SALES',NULL),
  ('4110-03','Service income','CR','SALES',NULL),
  ('4120','Sales deductions','DR',NULL,NULL),
  ('4120-01','Sales returns','DR','SALES','SALES_RETURNS'),
  ('4120-02','Discount allowed','DR','SALES','DISCOUNT_ALLOWED'),
  ('4120-03','Trade scheme discount','DR','SALES','SCHEME_DISCOUNT'),
  ('4200','Other income','CR',NULL,NULL),
  ('4210','Other income','CR',NULL,NULL),
  ('4210-01','Discount received','CR','OTHER_INCOME','DISCOUNT_RECEIVED'),
  ('4210-02','Gain on disposal of fixed assets','CR','OTHER_INCOME','FA_GAIN'),
  ('4210-03','Inventory gain (count excess)','CR','OTHER_INCOME','INVENTORY_GAIN'),
  ('4210-04','Stock gain','CR','OTHER_INCOME','STOCK_GAIN'),
  ('4210-05','Exchange gain / loss','CR','OTHER_INCOME','FX_GAIN_LOSS'),
  ('4210-06','Miscellaneous income','CR','OTHER_INCOME',NULL),
  ('4220','Finance income','CR',NULL,NULL),
  ('4220-01','Profit on bank deposits','CR','FINANCE_INCOME','PROFIT_ON_DEPOSIT'),
  ('5000','Expenses','DR',NULL,NULL),
  ('5100','Cost of sales','DR',NULL,NULL),
  ('5110','Cost of goods sold','DR',NULL,NULL),
  ('5110-01','Cost of goods sold','DR','COST_OF_SALES','COGS'),
  ('5110-02','Purchase returns','CR','COST_OF_SALES','PURCHASE_RETURNS'),
  ('5110-03','Freight inward','DR','COST_OF_SALES',NULL),
  ('5110-04','Stock adjustment','DR','COST_OF_SALES','STOCK_ADJUSTMENT'),
  ('5110-05','Inventory shrinkage (count shortage)','DR','COST_OF_SALES','INVENTORY_SHRINKAGE'),
  ('5110-06','Inventory write-off','DR','COST_OF_SALES','INVENTORY_WRITE_OFF'),
  ('5110-07','Stock write-off (expired / damaged)','DR','COST_OF_SALES','STOCK_WRITE_OFF'),
  ('5200','Operating expenses','DR',NULL,NULL),
  ('5210','Employee costs','DR',NULL,NULL),
  ('5210-01','Salaries & wages','DR','EMPLOYEE_COST','SALARY_EXPENSE'),
  ('5210-02','Overtime','DR','EMPLOYEE_COST',NULL),
  ('5210-03','Bonus','DR','EMPLOYEE_COST',NULL),
  ('5210-04','EOBI: employer contribution','DR','EMPLOYEE_COST',NULL),
  ('5210-05','PESSI / SESSI: employer contribution','DR','EMPLOYEE_COST',NULL),
  ('5210-06','Provident fund: employer contribution','DR','EMPLOYEE_COST',NULL),
  ('5210-07','Gratuity','DR','EMPLOYEE_COST',NULL),
  ('5210-08','Staff welfare','DR','EMPLOYEE_COST',NULL),
  ('5210-09','Sales commission','DR','EMPLOYEE_COST','SALES_COMMISSION_EXPENSE'),
  ('5220','Premises','DR',NULL,NULL),
  ('5220-01','Rent','DR','PREMISES',NULL),
  ('5220-02','Electricity','DR','PREMISES',NULL),
  ('5220-03','Gas & water','DR','PREMISES',NULL),
  ('5220-04','Repairs & maintenance','DR','PREMISES',NULL),
  ('5220-05','Security services','DR','PREMISES',NULL),
  ('5230','Selling & distribution','DR',NULL,NULL),
  ('5230-01','Freight outward','DR','GENERAL_EXPENSE',NULL),
  ('5230-02','Vehicle running & fuel','DR','GENERAL_EXPENSE',NULL),
  ('5230-03','Advertising & promotion','DR','GENERAL_EXPENSE',NULL),
  ('5230-04','Cash over / short','DR','GENERAL_EXPENSE','CASH_OVER_SHORT'),
  ('5240','Administrative expenses','DR',NULL,NULL),
  ('5240-01','Telephone & internet','DR','GENERAL_EXPENSE',NULL),
  ('5240-02','Printing & stationery','DR','GENERAL_EXPENSE',NULL),
  ('5240-03','Travelling & conveyance','DR','GENERAL_EXPENSE',NULL),
  ('5240-04','Entertainment','DR','GENERAL_EXPENSE',NULL),
  ('5240-05','Insurance','DR','GENERAL_EXPENSE',NULL),
  ('5240-06','Legal & professional','DR','GENERAL_EXPENSE',NULL),
  ('5240-07','Audit fee','DR','GENERAL_EXPENSE',NULL),
  ('5240-08','Fees & subscriptions','DR','GENERAL_EXPENSE',NULL),
  ('5240-09','Software & IT services','DR','GENERAL_EXPENSE',NULL),
  ('5240-10','FBR POS service fee','DR','GENERAL_EXPENSE','FBR_POS_FEE'),
  ('5240-11','Bad debts','DR','GENERAL_EXPENSE',NULL),
  ('5240-12','Rounding difference','DR','GENERAL_EXPENSE','ROUNDING'),
  ('5240-13','Miscellaneous expenses','DR','GENERAL_EXPENSE',NULL),
  ('5250','Depreciation & disposals','DR',NULL,NULL),
  ('5250-01','Depreciation expense','DR','DEPRECIATION','DEPRECIATION_EXPENSE'),
  ('5250-02','Loss on disposal of fixed assets','DR','DEPRECIATION','FA_LOSS'),
  ('5300','Finance cost','DR',NULL,NULL),
  ('5310','Finance cost','DR',NULL,NULL),
  ('5310-01','Mark-up on borrowings','DR','FINANCE_COST','MARKUP_EXPENSE'),
  ('5310-02','Bank charges','DR','FINANCE_COST','BANK_CHARGES'),
  ('5400','Taxation','DR',NULL,NULL),
  ('5410','Income tax','DR',NULL,NULL),
  ('5410-01','Income tax: current year','DR','TAXATION',NULL),
  ('5410-02','Income tax: prior years','DR','TAXATION',NULL),
  ('5410-03','Deferred tax','DR','TAXATION',NULL)
)
INSERT INTO "Platform"."ChartOfAccountsTemplateAccounts"
  ("templateId", "code", "name", "parentCode", "level", "accountClass", "nature", "subType", "isPostable", "defaultRole")
SELECT t.id, r."code", r."name",
       CASE WHEN "Accounting"."getAccountLevel"(r."code") = 1 THEN NULL ELSE "Accounting"."getParentAccountCode"(r."code") END,
       "Accounting"."getAccountLevel"(r."code"), substr(r."code", 1, 1)::smallint, r."nature", r."subType",
       "Accounting"."getAccountLevel"(r."code") = 4, r."defaultRole"
  FROM rows r CROSS JOIN t
ON CONFLICT ("templateId", "code") DO UPDATE SET "name" = EXCLUDED."name", "parentCode" = EXCLUDED."parentCode", "level" = EXCLUDED."level",
  "accountClass" = EXCLUDED."accountClass", "nature" = EXCLUDED."nature", "subType" = EXCLUDED."subType",
  "isPostable" = EXCLUDED."isPostable", "defaultRole" = EXCLUDED."defaultRole";

-- ---------------------------------------------------------------------------
-- 5. Apply a template to the current company: accounts level by level, then the default mappings.
--    Posting roles that duplicate another role (same purpose) share its account.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Accounting"."applyChartTemplate"("pTemplateId" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant"   uuid := "Company"."getCurrentTenantId"();
  "vCurrency" bpchar(3);
  "vCount"    integer := 0;
  "vRows"     integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Platform"."ChartOfAccountsTemplates" WHERE id = "pTemplateId") THEN
    RAISE EXCEPTION 'Chart of accounts template % not found', "pTemplateId" USING ERRCODE = 'no_data_found';
  END IF;
  -- Codes stay unique even for deleted accounts, so any existing row blocks a template.
  IF EXISTS (SELECT 1 FROM "Accounting"."ChartOfAccounts" WHERE "tenantId" = "vTenant") THEN
    RAISE EXCEPTION 'The chart of accounts is not empty' USING ERRCODE = 'check_violation', HINT = 'COA_NOT_EMPTY';
  END IF;
  SELECT COALESCE((SELECT s."baseCurrencyCode" FROM "Company"."CompanySettings" s WHERE s."tenantId" = "vTenant"), 'PKR') INTO "vCurrency";

  FOR "vLevel" IN 1..4 LOOP
    INSERT INTO "Accounting"."ChartOfAccounts"
      ("tenantId", "code", "name", "parentAccountId", "level", "accountClass", "nature", "kind", "subType", "currencyCode", "status")
    SELECT "vTenant", t."code", t."name", p.id, t."level", t."accountClass", t."nature",
           CASE WHEN t."level" <= 2 THEN 'HEADER' WHEN t."level" = 3 THEN 'GROUP' ELSE 'POSTABLE' END,
           CASE WHEN t."level" = 4 THEN t."subType" END, "vCurrency", 'ACTIVE'
      FROM "Platform"."ChartOfAccountsTemplateAccounts" t
      LEFT JOIN "Accounting"."ChartOfAccounts" p ON p."tenantId" = "vTenant" AND p."code" = t."parentCode"
     WHERE t."templateId" = "pTemplateId" AND t."level" = "vLevel"
     ORDER BY t."code";
    GET DIAGNOSTICS "vRows" = ROW_COUNT;
    "vCount" := "vCount" + "vRows";
  END LOOP;

  INSERT INTO "Company"."DefaultAccountMappings" ("tenantId", "role", "accountId")
  SELECT "vTenant", m."role", a.id
    FROM (
      SELECT t."defaultRole" AS "role", t."code" FROM "Platform"."ChartOfAccountsTemplateAccounts" t
       WHERE t."templateId" = "pTemplateId" AND t."defaultRole" IS NOT NULL
      UNION ALL
      SELECT x."role", t."code"
        FROM (VALUES ('GAIN_LOSS_ON_DISPOSAL', 'FA_GAIN'), ('SALARY_TAX_PAYABLE', 'INCOME_TAX_PAYABLE_SALARY'), ('STAFF_ADVANCES', 'EMPLOYEE_ADVANCES')) AS x("role", "sameAs")
        JOIN "Platform"."ChartOfAccountsTemplateAccounts" t ON t."templateId" = "pTemplateId" AND t."defaultRole" = x."sameAs"
    ) m
    JOIN "Accounting"."ChartOfAccounts" a ON a."tenantId" = "vTenant" AND a."code" = m."code"
    JOIN "Company"."PostingRoles" r ON r."code" = m."role"
  ON CONFLICT ("tenantId", "role") DO UPDATE SET "accountId" = EXCLUDED."accountId";

  RETURN "vCount";
END $function$;

-- ---------------------------------------------------------------------------
-- 6. Fiscal years: a year and its monthly periods (+ optional P13 on the last day).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Accounting"."createFiscalYearFor"("pTenant" uuid, "pStartDate" date, "pAdjustment" boolean DEFAULT false)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vEnd"    date := ("pStartDate" + interval '1 year' - interval '1 day')::date;
  "vYearId" uuid;
  "vStart"  date;
  "vMonths" text[] := ARRAY['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
BEGIN
  IF extract(day FROM "pStartDate") <> 1 THEN
    RAISE EXCEPTION 'A fiscal year starts on the first day of a month' USING ERRCODE = 'check_violation', HINT = 'PERIOD_OUTSIDE_YEAR';
  END IF;
  INSERT INTO "Accounting"."FiscalYears" ("tenantId", "code", "startDate", "endDate", "status", "hasAdjustmentPeriod")
  VALUES ("pTenant", "Company"."getFiscalYearLabel"("pStartDate", extract(month FROM "pStartDate")::int), "pStartDate", "vEnd", 'OPEN', "pAdjustment")
  RETURNING id INTO "vYearId";
  FOR "i" IN 0..11 LOOP
    "vStart" := ("pStartDate" + make_interval(months => "i"))::date;
    INSERT INTO "Accounting"."FiscalPeriods" ("tenantId", "fiscalYearId", "periodNo", "code", "startDate", "endDate", "status")
    VALUES ("pTenant", "vYearId", "i" + 1, "vMonths"[extract(month FROM "vStart")::int] || '-' || to_char("vStart", 'YYYY'),
            "vStart", ("vStart" + interval '1 month' - interval '1 day')::date, 'OPEN');
  END LOOP;
  IF "pAdjustment" THEN
    INSERT INTO "Accounting"."FiscalPeriods" ("tenantId", "fiscalYearId", "periodNo", "code", "startDate", "endDate", "isAdjustment", "status")
    VALUES ("pTenant", "vYearId", 13, 'P13-' || to_char("vEnd", 'YYYY'), "vEnd", "vEnd", true, 'OPEN');
  END IF;
  RETURN "vYearId";
END $function$;

CREATE OR REPLACE FUNCTION "Accounting"."createFiscalYear"("pStartDate" date, "pAdjustment" boolean DEFAULT false)
  RETURNS uuid
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT "Accounting"."createFiscalYearFor"("Company"."getCurrentTenantId"(), "pStartDate", "pAdjustment")
$function$;

-- First day of the fiscal year that contains today, for a start month.
CREATE OR REPLACE FUNCTION "Accounting"."currentFiscalYearStart"("pStartMonth" integer)
  RETURNS date
  LANGUAGE sql STABLE
AS $function$
  SELECT make_date(CASE WHEN extract(month FROM CURRENT_DATE)::int >= "pStartMonth"
                        THEN extract(year FROM CURRENT_DATE)::int ELSE extract(year FROM CURRENT_DATE)::int - 1 END,
                   "pStartMonth", 1)
$function$;

-- New companies start with their current fiscal year (like the Head Office branch).
CREATE OR REPLACE FUNCTION "Accounting"."triggerTenantFiscalYear"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Accounting"."createFiscalYearFor"(NEW.id, "Accounting"."currentFiscalYearStart"(COALESCE(NEW."fiscalYearStartMonth", 7)), false);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsFiscalYear" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsFiscalYear" AFTER INSERT ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "Accounting"."triggerTenantFiscalYear"();

-- Backfill: every company without a fiscal year gets its current one (start month from company settings).
SELECT "Accounting"."createFiscalYearFor"(t.id,
         "Accounting"."currentFiscalYearStart"(COALESCE(s."fyStartMonth", t."fiscalYearStartMonth", 7)), false)
  FROM "Platform"."Tenants" t
  LEFT JOIN "Company"."CompanySettings" s ON s."tenantId" = t.id
 WHERE NOT EXISTS (SELECT 1 FROM "Accounting"."FiscalYears" y WHERE y."tenantId" = t.id);
