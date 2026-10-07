-- =============================================================================
-- Finsoft ERP (FULL) — 03-acc.sql
-- Accounting core: chart of accounts, cost centres, fiscal years/periods, the
-- single journal (every voucher type + every system posting) and opening
-- balances.
--
-- This file is the Basic 03-acc.sql verbatim, with Full-only columns appended
-- (before the standard audit columns) and Full-only tables/functions appended
-- in the "FULL EDITION" section at the end. Full-only screens:
--   app/accounting/cost-centres   Cost Centres & Projects  src/4A-company-plus.html + src/9A-company-plus.js
--   app/accounting/recurring      Recurring Templates      src/40-acc-core.html
--   app/periods/close             Year-end Close           src/42-acc-reports.html
--   app/budgets                   Budgets                  src/42-acc-reports.html
--   app/budgets/variance          Budget vs Actual         src/42-acc-reports.html
--
-- Screens (Basic):
--   app/accounting/coa            Chart of Accounts        src/46-coa.html + src/97-coa.js
--   app/accounting/ledger         Account Ledger           src/46-coa.html + src/97-coa.js
--   app/accounting/opening        Opening Balances         src/40-acc-core.html
--   app/accounting/vouchers       Voucher Register         src/40-acc-core.html
--   app/accounting/vouchers/new   New Voucher              src/44-purchase-docs.html + src/94-purchase-docs.js
--   app/accounting/vouchers/view  Voucher Detail           src/40-acc-core.html
--   app/periods                   Fiscal Years & Periods   src/42-acc-reports.html
--   app/reports/*                 statements (views in 90-views.sql) src/45-studios.html + src/96-studio.js
--
-- Integrity rules enforced here (not left to the application):
--   * only POSTABLE (level-4), ACTIVE accounts receive journal lines
--   * a journal can only become POSTED when it has >= 2 lines, is balanced
--     (sum Dr = sum Cr > 0), its posting date falls in an OPEN fiscal period
--     and is after Company.CompanySettings.booksLockDate
--   * a POSTED journal is immutable except POSTED -> REVERSED (+ reversed_by)
--   * lines of a POSTED / REVERSED journal cannot be inserted/updated/deleted
--
-- Cross-module FKs (Sales.Customers, Purchases.Vendors) are in fk/03-acc-fks.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: derive the parent code from an account code (4-level COA)
--   1000 (L1) <- 1100 (L2) <- 1120 (L3) <- 1120-01 (L4)
-- Mirrors levelOf()/parentOf() in src/97-coa.js.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Accounting"."getAccountLevel"("pCode" text) RETURNS smallint
LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE
            WHEN position('-' in "pCode") > 0     THEN 4
            WHEN substr("pCode", 2) = '000'       THEN 1
            WHEN substr("pCode", 3) = '00'        THEN 2
            ELSE 3 END)::smallint
$$;

CREATE OR REPLACE FUNCTION "Accounting"."getParentAccountCode"("pCode" text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE "Accounting"."getAccountLevel"("pCode")
           WHEN 4 THEN split_part("pCode", '-', 1)
           WHEN 3 THEN substr("pCode", 1, 2) || '00'
           WHEN 2 THEN substr("pCode", 1, 1) || '000'
           ELSE NULL END
$$;

COMMENT ON FUNCTION "Accounting"."getParentAccountCode"(text) IS 'Parent account code for a COA code: 1120-01 -> 1120 -> 1100 -> 1000 -> NULL.';

-- ---------------------------------------------------------------------------
-- account — app/accounting/coa (tree, inspector drawer, Add/Edit account modal),
-- app/accounting/ledger (account picker). src/46-coa.html, src/97-coa.js
-- Levels: 1 class header (1000) · 2 header (1100) · 3 group (1120) · 4 postable (1120-01)
-- Classes: 1 Assets (Dr) · 2 Liabilities (Cr) · 3 Equity (Cr) · 4 Income (Cr) · 5 Expenses (Dr)
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."ChartOfAccounts" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                text NOT NULL,                                -- "Account code * (auto-suggested)" 1120-01
  name                text NOT NULL,                                -- "Account name *" Meezan Bank — 0123
  description         text,                                         -- "Description" (row sub-line: "Main operating account")
  icon                text,                                         -- tree icon (lucide name) e.g. landmark
  "parentAccountId"   uuid,                                         -- "Parent account *" (searchable tree select)
  level               smallint NOT NULL CHECK (level BETWEEN 1 AND 4),   -- "Level n of 4" (derived from code)
  "accountClass"       smallint NOT NULL CHECK ("accountClass" BETWEEN 1 AND 5), -- category chips Assets/Liabilities/Equity/Income/Expenses
  nature              char(2) NOT NULL,    -- "Nature: Debit (Dr) / Credit (Cr)"
  kind                text NOT NULL,  -- Type filter Header/Group/Postable
  "subType"            text,                 -- P&L "Total finance cost", "Taxation" (src/96-studio.js)
  "branchId"           uuid,                                         -- inspector "Branch": NULL = All branches (restriction)
  "currencyCode"       char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),  -- "Currency: PKR · Pakistani Rupee"
  "openingBalance"     numeric(18,2) NOT NULL DEFAULT 0 CHECK ("openingBalance" >= 0),  -- "Opening balance (PKR)" — locked after creation
  "openingAsOf"       date,                                         -- "Opening (01 Jul 2026)"
  status              text NOT NULL DEFAULT 'ACTIVE',  -- Activate / Deactivate
  "deletedAt"          timestamptz,                                  -- Delete account (blocked while sub-accounts or balance exist)
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),           -- "Last modified 01 Oct 2026 · S. Javed"
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  CONSTRAINT "accountTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "accountCodeUk" UNIQUE ("tenantId", code),
  CONSTRAINT "accountParentFk" FOREIGN KEY ("tenantId", "parentAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id),
  CONSTRAINT "accountBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "accountCodeFormatChk" CHECK (code ~ '^[1-5][0-9]{3}(-[0-9]{2,3})?$'),
  CONSTRAINT "accountLevelCodeChk" CHECK (level = "Accounting"."getAccountLevel"(code)),
  CONSTRAINT "accountClassCodeChk" CHECK ("accountClass" = substr(code, 1, 1)::smallint),
  CONSTRAINT "accountRootChk" CHECK ((level = 1) = ("parentAccountId" IS NULL)),
  CONSTRAINT "accountKindLevelChk" CHECK (kind = CASE WHEN level <= 2 THEN 'HEADER'
                                                      WHEN level = 3 THEN 'GROUP'
                                                      ELSE 'POSTABLE' END),
  -- only postable accounts carry a sub-type, a balance and a branch restriction
  -- ("Only postable (level 4) accounts carry balances")
  CONSTRAINT "accountPostableAttrsChk" CHECK (kind = 'POSTABLE'
                                               OR ("subType" IS NULL AND "openingBalance" = 0
                                                   AND "openingAsOf" IS NULL AND "branchId" IS NULL)),
  CONSTRAINT "accountPostableSubtypeChk" CHECK (kind <> 'POSTABLE' OR "subType" IS NOT NULL),
  CONSTRAINT "accountOpeningDateChk" CHECK ("openingBalance" = 0 OR "openingAsOf" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Accounting"."ChartOfAccounts"', true);
CREATE INDEX "accountParentIdx"      ON "Accounting"."ChartOfAccounts" ("tenantId", "parentAccountId");
CREATE INDEX "accountClassCodeIdx"  ON "Accounting"."ChartOfAccounts" ("tenantId", "accountClass", code) WHERE "deletedAt" IS NULL;
CREATE INDEX "accountKindStatusIdx" ON "Accounting"."ChartOfAccounts" ("tenantId", kind, status) WHERE "deletedAt" IS NULL;
CREATE INDEX "accountSubTypeIdx"    ON "Accounting"."ChartOfAccounts" ("tenantId", "subType") WHERE "subType" IS NOT NULL;
CREATE INDEX "accountNameTrgmIdx"   ON "Accounting"."ChartOfAccounts" USING gin (name gin_trgm_ops);

COMMENT ON TABLE  "Accounting"."ChartOfAccounts" IS 'Chart of accounts (app/accounting/coa). 4-level tree: L1 class 1000, L2 1100, L3 group 1120, L4 postable 1120-01. Only POSTABLE accounts take journal lines.';
COMMENT ON COLUMN "Accounting"."ChartOfAccounts".nature IS 'Normal balance side. Defaults from the class (Assets/Expenses DR, others CR) but is editable for contra accounts (e.g. accumulated depreciation CR).';
COMMENT ON COLUMN "Accounting"."ChartOfAccounts"."branchId" IS 'Branch restriction for postable accounts; NULL = usable by all branches. Lines on this account must carry the same branch.';
COMMENT ON COLUMN "Accounting"."ChartOfAccounts"."openingBalance" IS 'Opening amount entered when the account is created (on its normal side); feeds the draft opening-balance batch. Immutable afterwards.';

-- Guard: parent must be the derived parent code, one level up, same class, not postable;
-- structural fields are immutable once created (Edit modal disables code/parent).
CREATE OR REPLACE FUNCTION "Accounting"."triggerAccountGuard"() RETURNS trigger
LANGUAGE plpgsql AS $$
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
END $$;

CREATE TRIGGER "accountGuard" BEFORE INSERT OR UPDATE ON "Accounting"."ChartOfAccounts"
  FOR EACH ROW EXECUTE FUNCTION "Accounting"."triggerAccountGuard"();

-- ---------------------------------------------------------------------------
-- CostCentres — "Cost centre" column on voucher lines (app/accounting/vouchers/new,
-- app/accounting/vouchers/view). Simple hierarchy CC-100 Lahore HQ > CC-110 Finance.
-- src/94-purchase-docs.js (CC list), src/40-acc-core.html (Ledger entries table)
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."CostCentres" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                   text NOT NULL,                             -- CC-110
  name                   text NOT NULL,                             -- Finance
  "parentCostCentreId"  uuid,                                      -- CC-100 Lahore HQ
  "branchId"              uuid,                                      -- branch the centre belongs to
  status                 text NOT NULL DEFAULT 'ACTIVE',
  -- FULL: app/accounting/cost-centres (tree "· Branch / · Department", New cost centre modal)
  "centreType"            text NOT NULL DEFAULT 'DEPARTMENT',
  "ownerEmployeeId"      uuid,                                      -- "Owner" (FK → HumanResources.Employees in fk/03-acc-fks.sql)
  "annualBudget"          numeric(18,2) CHECK ("annualBudget" >= 0),  -- "Annual budget (Rs)"
  icon                   text,                                      -- tree icon (building-2 / building)
  tags                   text[] NOT NULL DEFAULT '{}',              -- "Tags" #opex
  "deletedAt"             timestamptz,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  CONSTRAINT "costCentreTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "costCentreCodeUk" UNIQUE ("tenantId", code),
  CONSTRAINT "costCentreParentFk" FOREIGN KEY ("tenantId", "parentCostCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id),
  CONSTRAINT "costCentreBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "costCentreNotSelfChk" CHECK ("parentCostCentreId" IS DISTINCT FROM id),
  CONSTRAINT "costCentreCodeChk" CHECK (code ~ '^[A-Z]{2,4}-[0-9]{2,5}$')
);
SELECT "Company"."addStandardTriggers"('"Accounting"."CostCentres"');
CREATE INDEX "costCentreParentIdx" ON "Accounting"."CostCentres" ("tenantId", "parentCostCentreId");
CREATE INDEX "costCentreBranchIdx" ON "Accounting"."CostCentres" ("tenantId", "branchId") WHERE "deletedAt" IS NULL;

COMMENT ON TABLE "Accounting"."CostCentres" IS 'Cost centres tagged on journal lines (Basic: code, name, parent, branch). Full extends with owner, budget, icon, tags (app/accounting/cost-centres).';

-- ---------------------------------------------------------------------------
-- FiscalYears — app/periods year cards: "FY 2025-26 · 01 Jul 2025 – 30 Jun 2026 ·
-- Closed · Locked", net profit transferred, closing entry, closed by, audited by;
-- "Add adjustment period (P13)". src/42-acc-reports.html
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."FiscalYears" (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                 uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                      text NOT NULL,                          -- FY 2026-27
  "startDate"                date NOT NULL,                          -- 01 Jul 2026
  "endDate"                  date NOT NULL,                          -- 30 Jun 2027
  status                    text NOT NULL DEFAULT 'OPEN',
  "isLocked"                 boolean NOT NULL DEFAULT false,         -- "Closed · Locked"
  "hasAdjustmentPeriod"     boolean NOT NULL DEFAULT false,         -- "Add adjustment period (P13)"
  "closedAt"                 timestamptz,                            -- "Closed by Sana Javed · 15 Aug 2026"
  "closedByUserId"         uuid,
  "closingJournalEntryId"  uuid,                                   -- "Closing entry JV-2026-000188" (FK below)
  "netProfitTransferred"    numeric(18,2),                          -- "Net profit transferred Rs 21,840,000"
  "auditorName"              text,                                   -- "Audited by KPMG Taseer Hadi & Co."
  "createdAt"                timestamptz NOT NULL DEFAULT now(),
  "createdBy"                uuid,
  "updatedAt"                timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                uuid,
  "rowVersion"               integer NOT NULL DEFAULT 0,
  CONSTRAINT "fiscalYearTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "fiscalYearCodeUk" UNIQUE ("tenantId", code),
  CONSTRAINT "fiscalYearClosedByFk" FOREIGN KEY ("tenantId", "closedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "fiscalYearDatesChk" CHECK ("endDate" > "startDate" AND "endDate" - "startDate" BETWEEN 27 AND 549),
  CONSTRAINT "fiscalYearCodeChk" CHECK (code = "Company"."getFiscalYearLabel"("startDate", extract(month FROM "startDate")::int)),
  CONSTRAINT "fiscalYearLockChk" CHECK (NOT "isLocked" OR status = 'CLOSED'),
  CONSTRAINT "fiscalYearClosedChk" CHECK (status <> 'CLOSED' OR "closedAt" IS NOT NULL),
  CONSTRAINT "fiscalYearNoOverlap" EXCLUDE USING gist ("tenantId" WITH =, daterange("startDate", "endDate", '[]') WITH &&)
);
SELECT "Company"."addStandardTriggers"('"Accounting"."FiscalYears"', true);

COMMENT ON TABLE "Accounting"."FiscalYears" IS 'Fiscal years (Pakistan default 01 Jul – 30 Jun). "Not created" years on app/periods are simply absent rows.';

-- ---------------------------------------------------------------------------
-- FiscalPeriods — app/periods "Periods — FY 2026-27" table (Period, From, To,
-- Vouchers, Drafts, Modules, Status, Closed by) + Close/Lock/Reopen actions.
-- Vouchers/Drafts counts are derived from Accounting.Vouchers.
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."FiscalPeriods" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "fiscalYearId"      uuid NOT NULL,
  "periodNo"           smallint NOT NULL CHECK ("periodNo" BETWEEN 1 AND 13),  -- 1 = JUL … 12 = JUN, 13 = adjustment
  code                text NOT NULL,                                -- SEP-2026 · P13-2027
  "startDate"          date NOT NULL,
  "endDate"            date NOT NULL,
  "isAdjustment"       boolean NOT NULL DEFAULT false,               -- P13 adjustment period
  status              text NOT NULL DEFAULT 'OPEN',
  "closeTargetDate"   date,                                         -- "Next close SEP-2026 · target 07 Oct"
  "closedAt"           timestamptz,                                  -- "Closed by Sana Javed 09 Sep 2026"
  "closedByUserId"   uuid,
  "lockedAt"           timestamptz,
  "lockedByUserId"   uuid,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  CONSTRAINT "fiscalPeriodTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "fiscalPeriodCodeUk" UNIQUE ("tenantId", code),
  CONSTRAINT "fiscalPeriodNoUk" UNIQUE ("tenantId", "fiscalYearId", "periodNo"),
  CONSTRAINT "fiscalPeriodYearFk" FOREIGN KEY ("tenantId", "fiscalYearId") REFERENCES "Accounting"."FiscalYears" ("tenantId", id),
  CONSTRAINT "fiscalPeriodClosedByFk" FOREIGN KEY ("tenantId", "closedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "fiscalPeriodLockedByFk" FOREIGN KEY ("tenantId", "lockedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "fiscalPeriodDatesChk" CHECK ("endDate" >= "startDate"),
  CONSTRAINT "fiscalPeriodAdjChk" CHECK ("isAdjustment" = ("periodNo" = 13)),
  CONSTRAINT "fiscalPeriodCodeChk" CHECK (code ~ '^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|P13)-[0-9]{4}$'),
  CONSTRAINT "fiscalPeriodClosedChk" CHECK (status = 'OPEN' OR "closedAt" IS NOT NULL),
  CONSTRAINT "fiscalPeriodLockedChk" CHECK (status <> 'LOCKED' OR "lockedAt" IS NOT NULL),
  -- regular months never overlap; the P13 adjustment period sits on the year-end date
  CONSTRAINT "fiscalPeriodNoOverlap" EXCLUDE USING gist
    ("tenantId" WITH =, daterange("startDate", "endDate", '[]') WITH &&) WHERE (NOT "isAdjustment")
);
SELECT "Company"."addStandardTriggers"('"Accounting"."FiscalPeriods"', true);
CREATE INDEX "fiscalPeriodYearIdx"  ON "Accounting"."FiscalPeriods" ("tenantId", "fiscalYearId", "periodNo");
CREATE INDEX "fiscalPeriodDatesIdx" ON "Accounting"."FiscalPeriods" ("tenantId", "startDate", "endDate");

COMMENT ON TABLE "Accounting"."FiscalPeriods" IS 'Posting control by month (app/periods). OPEN accepts postings; CLOSED blocks them; LOCKED cannot be reopened without CEO approval.';

-- Guard: period inside its year; cannot close/lock while drafts/pending vouchers sit in it
-- ("6 draft vouchers in SEP-2026 — Drafts will be moved to OCT-2026 or must be posted first").
CREATE OR REPLACE FUNCTION "Accounting"."triggerFiscalPeriodGuard"() RETURNS trigger
LANGUAGE plpgsql AS $$
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
END $$;

CREATE TRIGGER "fiscalPeriodGuard" BEFORE INSERT OR UPDATE ON "Accounting"."FiscalPeriods"
  FOR EACH ROW EXECUTE FUNCTION "Accounting"."triggerFiscalPeriodGuard"();

-- ---------------------------------------------------------------------------
-- Vouchers — THE single ledger header for every voucher.
--   Manual vouchers: JV, CPV, CRV, BPV, BRV, CON (contra), OB (opening)
--   System postings from other modules: SYSTEM (+ sourceDocType/_id/_no)
-- Screens: app/accounting/vouchers (register: Voucher #, Date, Type, Narration,
--   Branch, Debit, Credit, Status, Created by), app/accounting/vouchers/new
--   (Voucher Details card + cash/bank "morph" card), app/accounting/vouchers/view
--   (header dl, approval timeline, reverse modal), Post/Reverse modal po-vch-act.
-- Numbers: JV-2026-000045 (tenant-wide), CPV-LHR-0621 (branch cash series) via
--   Company.getNextDocNo(voucherType, docDate, branchId). SYSTEM uses the JV series.
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."Vouchers" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "voucherType"           text NOT NULL,
  "docNo"                 text NOT NULL,                             -- "Auto number: JV-2026-000046"
  "docDate"               date NOT NULL,                             -- "Voucher Date *"
  "postingDate"           date NOT NULL,                             -- "Posting Date *" / Post modal "Posting date"
  "fiscalPeriodId"       uuid,                                      -- "Fiscal period: Sep 2026 · FY 2026-27" (resolved on posting)
  "referenceNo"           text,                                      -- "Reference No." e.g. INV-1024 / PR-2026-09
  "branchId"              uuid NOT NULL,                             -- "Branch *"
  department             text,                                      -- "Department" (Finance, Administration, Sales, Procurement, Operations, Warehouse)
  "currencyCode"          char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),  -- "Currency PKR"
  "fxRate"                numeric(18,6) NOT NULL DEFAULT 1 CHECK ("fxRate" > 0),
  narration              text NOT NULL,                             -- "Narration *" (max 300)
  remarks                text,                                      -- "Comments" (Additional Information)
  tags                   text[] NOT NULL DEFAULT '{}',              -- "Tags" (Additional Information)
  -- cash / bank voucher header (CPV, CRV, BPV, BRV): the auto contra leg
  "cashBankAccountId"   uuid,                                      -- "Cash account *" / "Bank account *" (GL 1110-xx / 1120-xx)
  "partyName"             text,                                      -- "Pay to" / "Received from" / "Payee"
  "instrumentType"        text,
  "instrumentNo"          text,                                      -- "Cheque / Ref No."
  "instrumentDate"        date,                                      -- "Cheque Date"
  "autoReverseOn"        date,                                      -- JV card "Auto-reverse on 01 Nov 2026"
  "totalDebit"            numeric(18,2) NOT NULL DEFAULT 0 CHECK ("totalDebit" >= 0),   -- "Total Debit"
  "totalCredit"           numeric(18,2) NOT NULL DEFAULT 0 CHECK ("totalCredit" >= 0),  -- "Total Credit"
  status                 text NOT NULL DEFAULT 'DRAFT',
  "preparedByUserId"    uuid,                                      -- "Prepared By" / "Created by"
  "submittedAt"           timestamptz,                               -- "Submitted 01 Oct 2026 08:42"
  "approvedByUserId"    uuid,                                      -- "Approved By"
  "approvedAt"            timestamptz,
  "postedByUserId"      uuid,
  "postedAt"              timestamptz,
  "sourceDocType"        text REFERENCES "Company"."DocumentTypes"(code),       -- system postings: INV, BILL, RCPT, PRUN, DEP …
  "sourceDocId"          uuid,
  "sourceDocNo"          text,                                      -- shown in Day Book / register sub-line (INV-2026-000410)
  "reversalOfId"         uuid,                                      -- on the reversing voucher: the original
  "reversalReason"        text,
  "reversalRemarks"       text,                                      -- Reverse modal "Remarks"
  "reversedById"         uuid,                                      -- on the original: "Reversed by JV-2026-000041"
  "reversalDate"          date,                                      -- on the original: "Reversal date *"
  -- FULL
  "recurringTemplateId"  uuid,                                      -- generated by a recurring template (FK added below)
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  CONSTRAINT "journalEntryTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "journalEntryDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "journalEntryPeriodFk" FOREIGN KEY ("tenantId", "fiscalPeriodId") REFERENCES "Accounting"."FiscalPeriods" ("tenantId", id),
  CONSTRAINT "journalEntryBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "journalEntryCashBankFk" FOREIGN KEY ("tenantId", "cashBankAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id),
  CONSTRAINT "journalEntryPreparedByFk" FOREIGN KEY ("tenantId", "preparedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "journalEntryApprovedByFk" FOREIGN KEY ("tenantId", "approvedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "journalEntryPostedByFk" FOREIGN KEY ("tenantId", "postedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "journalEntryReversalOfFk" FOREIGN KEY ("tenantId", "reversalOfId") REFERENCES "Accounting"."Vouchers" ("tenantId", id),
  CONSTRAINT "journalEntryReversedByFk" FOREIGN KEY ("tenantId", "reversedById") REFERENCES "Accounting"."Vouchers" ("tenantId", id),
  CONSTRAINT "journalEntryNarrationChk" CHECK (char_length(btrim(narration)) BETWEEN 1 AND 300),
  -- the cash/bank account is required exactly for the four one-sided voucher types
  CONSTRAINT "journalEntryCashBankChk" CHECK (("cashBankAccountId" IS NOT NULL) = ("voucherType" IN ('CPV','CRV','BPV','BRV'))),
  CONSTRAINT "journalEntryInstrumentChkNull" CHECK (("instrumentType" IS NULL AND "instrumentNo" IS NULL AND "instrumentDate" IS NULL) OR "instrumentType" IS NOT NULL),
  CONSTRAINT "journalEntryAutoReverseChk" CHECK ("autoReverseOn" IS NULL OR ("voucherType" = 'JV' AND "autoReverseOn" > "postingDate")),
  CONSTRAINT "journalEntrySourcePairChk" CHECK (("sourceDocType" IS NULL) = ("sourceDocId" IS NULL)),
  CONSTRAINT "journalEntrySystemSourceChk" CHECK ("voucherType" <> 'SYSTEM' OR "sourceDocType" IS NOT NULL),
  CONSTRAINT "journalEntryReversalChk" CHECK (("reversalOfId" IS NULL) = ("reversalReason" IS NULL) AND "reversalOfId" IS DISTINCT FROM id),
  CONSTRAINT "journalEntryReversedChk" CHECK ((status = 'REVERSED') = ("reversedById" IS NOT NULL)
                                               AND ("reversedById" IS NULL) = ("reversalDate" IS NULL)),
  CONSTRAINT "journalEntrySubmittedChk" CHECK (status <> 'PENDING_APPROVAL' OR "submittedAt" IS NOT NULL),
  CONSTRAINT "journalEntryPostedChk" CHECK (status NOT IN ('POSTED','REVERSED')
                                             OR ("postedAt" IS NOT NULL AND "fiscalPeriodId" IS NOT NULL
                                                 AND "totalDebit" = "totalCredit" AND "totalDebit" > 0))
);
SELECT "Company"."addStandardTriggers"('"Accounting"."Vouchers"', true);
CREATE INDEX "journalEntryPostingIdx"   ON "Accounting"."Vouchers" ("tenantId", "postingDate", status);
CREATE INDEX "journalEntryRegisterIdx"  ON "Accounting"."Vouchers" ("tenantId", "docDate" DESC, "voucherType");
CREATE INDEX "journalEntryStatusIdx"    ON "Accounting"."Vouchers" ("tenantId", status, "docDate" DESC);
CREATE INDEX "journalEntryBranchIdx"    ON "Accounting"."Vouchers" ("tenantId", "branchId", "docDate" DESC);
CREATE INDEX "journalEntryPeriodIdx"    ON "Accounting"."Vouchers" ("tenantId", "fiscalPeriodId");
CREATE INDEX "journalEntrySourceIdx"    ON "Accounting"."Vouchers" ("tenantId", "sourceDocType", "sourceDocId") WHERE "sourceDocId" IS NOT NULL;
CREATE INDEX "journalEntryPreparedIdx"  ON "Accounting"."Vouchers" ("tenantId", "preparedByUserId");   -- "Created by me"
CREATE INDEX "journalEntryNarrationTrgmIdx" ON "Accounting"."Vouchers" USING gin (narration gin_trgm_ops);  -- "Search vouchers, narration…"
CREATE UNIQUE INDEX "journalEntryOneReversalUk" ON "Accounting"."Vouchers" ("tenantId", "reversalOfId") WHERE "reversalOfId" IS NOT NULL;

ALTER TABLE "Accounting"."FiscalYears"
  ADD CONSTRAINT "fiscalYearClosingJeFk" FOREIGN KEY ("tenantId", "closingJournalEntryId")
      REFERENCES "Accounting"."Vouchers" ("tenantId", id);

COMMENT ON TABLE  "Accounting"."Vouchers" IS 'Single ledger header for every voucher (JV/CPV/CRV/BPV/BRV/CON/OB) and every system posting (SYSTEM + source_doc_*). Posted rows are immutable; corrections are reversals.';
COMMENT ON COLUMN "Accounting"."Vouchers"."cashBankAccountId" IS 'CPV/CRV/BPV/BRV: the cash or bank GL account of the auto contra leg (the locked "Auto contra" line is a VoucherLines with isAutoContra = true).';
COMMENT ON COLUMN "Accounting"."Vouchers".department IS 'Free-text department from the New Voucher form (Finance, Administration, Sales, Procurement, Operations, Warehouse).';
COMMENT ON COLUMN "Accounting"."Vouchers"."reversalOfId" IS 'Set on the reversing voucher; the original gets status REVERSED, reversedById and reversalDate.';

-- ---------------------------------------------------------------------------
-- VoucherLines — "Voucher Entries" grid (#, Account, Code, Description / Narration,
-- Debit (PKR), Credit (PKR), Cost Centre) on app/accounting/vouchers/new;
-- "Ledger entries" (#, Account, Particulars, Cost centre, Debit, Credit) on /view.
-- Feeds the Account Ledger, GL, TB, P&L, BS and Day Book views.
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."VoucherLines" (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"         uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "journalEntryId"  uuid NOT NULL,
  "lineNo"           smallint NOT NULL CHECK ("lineNo" > 0),          -- "#" (drag to reorder)
  "accountId"        uuid NOT NULL,                                  -- "Account" (Code shown read-only)
  particulars       text,                                           -- "Description / Narration" / "Particulars"
  debit             numeric(18,2) NOT NULL DEFAULT 0,               -- "Debit (PKR)"
  credit            numeric(18,2) NOT NULL DEFAULT 0,               -- "Credit (PKR)"
  "costCentreId"    uuid,                                           -- "Cost Centre"
  "branchId"         uuid NOT NULL,                                  -- defaults to the voucher branch
  "customerId"       uuid,                                           -- sub-ledger party (FK in fk/03-acc-fks.sql)
  "vendorId"         uuid,                                           -- sub-ledger party (FK in fk/03-acc-fks.sql)
  "isAutoContra"    boolean NOT NULL DEFAULT false,                 -- locked "Auto contra — balancing cash/bank" row
  -- FULL
  "projectId"        uuid,                                           -- project P&L (app/accounting/cost-centres) — FK below
  "employeeId"       uuid,                                           -- employee sub-ledger (FK → HumanResources.Employees in fk file)
  "allocationRuleId" uuid,                                          -- line produced by an allocation rule split — FK below
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "createdBy"        uuid,
  "updatedAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedBy"        uuid,
  "rowVersion"       integer NOT NULL DEFAULT 0,
  CONSTRAINT "journalLineTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "journalLineNoUk" UNIQUE ("tenantId", "journalEntryId", "lineNo") DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT "journalLineEntryFk" FOREIGN KEY ("tenantId", "journalEntryId")
      REFERENCES "Accounting"."Vouchers" ("tenantId", id) ON DELETE CASCADE,
  CONSTRAINT "journalLineAccountFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id),
  CONSTRAINT "journalLineCostCentreFk" FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id),
  CONSTRAINT "journalLineBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  -- exactly one side carries a positive amount
  CONSTRAINT "journalLineAmountChk" CHECK (debit >= 0 AND credit >= 0 AND ((debit > 0) <> (credit > 0))),
  CONSTRAINT "journalLineOnePartyChk" CHECK (num_nonnulls("customerId", "vendorId") <= 1),
  -- FULL: employee joins the "at most one party" rule
  CONSTRAINT "journalLineOnePartyFullChk" CHECK (num_nonnulls("customerId", "vendorId", "employeeId") <= 1)
);
SELECT "Company"."addStandardTriggers"('"Accounting"."VoucherLines"', true);
CREATE INDEX "journalLineEntryIdx"       ON "Accounting"."VoucherLines" ("tenantId", "journalEntryId");
CREATE INDEX "journalLineAccountIdx"     ON "Accounting"."VoucherLines" ("tenantId", "accountId", "journalEntryId");
CREATE INDEX "journalLineCostCentreIdx" ON "Accounting"."VoucherLines" ("tenantId", "costCentreId") WHERE "costCentreId" IS NOT NULL;
CREATE INDEX "journalLineBranchIdx"      ON "Accounting"."VoucherLines" ("tenantId", "branchId", "accountId");
CREATE INDEX "journalLineCustomerIdx"    ON "Accounting"."VoucherLines" ("tenantId", "customerId") WHERE "customerId" IS NOT NULL;
CREATE INDEX "journalLineVendorIdx"      ON "Accounting"."VoucherLines" ("tenantId", "vendorId") WHERE "vendorId" IS NOT NULL;

COMMENT ON TABLE "Accounting"."VoucherLines" IS 'Journal lines. Exactly one of debit/credit > 0. Only POSTABLE, ACTIVE accounts. Frozen once the parent journal is POSTED.';

-- ---------------------------------------------------------------------------
-- OpeningBalances — app/accounting/opening header: "As at 01 Jul 2026
-- (FY 2026-27) · Status: Draft", Total debits / credits / Difference KPIs,
-- "difference will be parked in 3900-01 Opening Balance Suspense",
-- Save draft / Post opening balances. src/40-acc-core.html
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."OpeningBalances" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "fiscalYearId"        uuid NOT NULL,                              -- FY 2026-27
  "asAtDate"            date NOT NULL,                              -- "As at 01 Jul 2026" / Import "As at date"
  "branchId"             uuid NOT NULL,                              -- branch of the OB journal header
  "suspenseAccountId"   uuid,                                       -- 3900-01 Opening Balance Suspense
  "totalDebit"           numeric(18,2) NOT NULL DEFAULT 0 CHECK ("totalDebit" >= 0),   -- "Total debits"
  "totalCredit"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("totalCredit" >= 0),  -- "Total credits"
  difference            numeric(18,2) GENERATED ALWAYS AS ("totalDebit" - "totalCredit") STORED,  -- "Difference · Debit heavy"
  status                text NOT NULL DEFAULT 'DRAFT',
  "journalEntryId"      uuid,                                       -- the OB journal created on posting
  "postedAt"             timestamptz,
  "postedByUserId"     uuid,
  remarks               text,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  CONSTRAINT "openingBalanceBatchTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "openingBalanceBatchYearUk" UNIQUE ("tenantId", "fiscalYearId"),
  CONSTRAINT "openingBalanceBatchYearFk" FOREIGN KEY ("tenantId", "fiscalYearId") REFERENCES "Accounting"."FiscalYears" ("tenantId", id),
  CONSTRAINT "openingBalanceBatchBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "openingBalanceBatchSuspenseFk" FOREIGN KEY ("tenantId", "suspenseAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id),
  CONSTRAINT "openingBalanceBatchJeFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id),
  CONSTRAINT "openingBalanceBatchPostedByFk" FOREIGN KEY ("tenantId", "postedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "openingBalanceBatchPostedChk" CHECK ((status = 'POSTED') = ("journalEntryId" IS NOT NULL AND "postedAt" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Accounting"."OpeningBalances"', true);

COMMENT ON TABLE "Accounting"."OpeningBalances" IS 'Opening trial balance for a fiscal year (app/accounting/opening). Posting creates one OB journal; any difference goes to the suspense account.';

-- ---------------------------------------------------------------------------
-- OpeningBalanceLines — "Opening trial balance" grid (Code, Account, Type, Debit,
-- Credit) and Import CSV (code, debit, credit, branch). Party optional for
-- receivable/payable control accounts.
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."OpeningBalanceLines" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "batchId"         uuid NOT NULL,
  "accountId"       uuid NOT NULL,                                   -- Code / Account (Type badge from accountClass)
  "branchId"        uuid,                                            -- CSV "branch"; NULL = batch branch
  debit            numeric(18,2) NOT NULL DEFAULT 0,                -- "Debit"
  credit           numeric(18,2) NOT NULL DEFAULT 0,                -- "Credit"
  "customerId"      uuid,                                            -- optional party (FK in fk file)
  "vendorId"        uuid,                                            -- optional party (FK in fk file)
  remarks          text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "openingBalanceLineTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "openingBalanceLineBatchFk" FOREIGN KEY ("tenantId", "batchId")
      REFERENCES "Accounting"."OpeningBalances" ("tenantId", id) ON DELETE CASCADE,
  CONSTRAINT "openingBalanceLineAccountFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id),
  CONSTRAINT "openingBalanceLineBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "openingBalanceLineAmountChk" CHECK (debit >= 0 AND credit >= 0 AND ((debit > 0) <> (credit > 0))),
  CONSTRAINT "openingBalanceLineOnePartyChk" CHECK (num_nonnulls("customerId", "vendorId") <= 1),
  -- "On duplicate: Replace / Add to existing / Skip" is applied against this key
  CONSTRAINT "openingBalanceLineUk" UNIQUE NULLS NOT DISTINCT ("tenantId", "batchId", "accountId", "branchId", "customerId", "vendorId")
);
SELECT "Company"."addStandardTriggers"('"Accounting"."OpeningBalanceLines"', true);
CREATE INDEX "openingBalanceLineBatchIdx" ON "Accounting"."OpeningBalanceLines" ("tenantId", "batchId");
CREATE INDEX "openingBalanceLineAccountIdx" ON "Accounting"."OpeningBalanceLines" ("tenantId", "accountId");

COMMENT ON TABLE "Accounting"."OpeningBalanceLines" IS 'Lines of the opening trial balance. Frozen once the batch is POSTED.';

-- =============================================================================
-- Posting rules (functions + triggers)
-- =============================================================================

-- Module that a journal belongs to, for module-level period locks (Full:
-- Accounting.PeriodModuleLocks "Modules: AR, AP, GL closed"). Manual vouchers = GL.
CREATE OR REPLACE FUNCTION "Accounting"."getModuleForDocumentType"("pDocType" text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
           WHEN "pDocType" IN ('QT','SO','DC','INV','SV','WS','POS','SR','CN','RCPT','RP','CO','ZR',
                               'BK','RUN','LS','GP','RS','RCV')                 THEN 'AR'
           WHEN "pDocType" IN ('PO','GRN','BILL','PV','PR','DN','PAY','LC')       THEN 'AP'
           WHEN "pDocType" IN ('MI','MO','TRF','ADJ','SC','BRK','GFT','SMP','INT','ASM','DMD','PCB') THEN 'INV'
           WHEN "pDocType" IN ('PRUN','PS','FS','LN','ADV')                       THEN 'PAY'
           ELSE 'GL' END
$$;

-- Period that a posting date falls in. An explicitly chosen adjustment period
-- (P13) is honoured when the date lies inside it; otherwise the regular month.
CREATE OR REPLACE FUNCTION "Accounting"."getFiscalPeriodForDate"("pTenant" uuid, "pDate" date, "pPeriodId" uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE
  "vId" uuid;
BEGIN
  IF "pPeriodId" IS NOT NULL THEN
    SELECT id INTO "vId" FROM "Accounting"."FiscalPeriods"
     WHERE "tenantId" = "pTenant" AND id = "pPeriodId" AND "pDate" BETWEEN "startDate" AND "endDate";
    IF FOUND THEN RETURN "vId"; END IF;
  END IF;
  SELECT id INTO "vId" FROM "Accounting"."FiscalPeriods"
   WHERE "tenantId" = "pTenant" AND NOT "isAdjustment" AND "pDate" BETWEEN "startDate" AND "endDate";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No fiscal period covers %; create the fiscal year first', "pDate"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN "vId";
END $$;

-- Is posting allowed on this date/period? Basic: the period must be OPEN and
-- the date must be after the company books lock date. (Full replaces this
-- function to add module locks and approved temporary reopenings.)
CREATE OR REPLACE FUNCTION "Accounting"."assertPostingAllowed"("pTenant" uuid, "pDate" date, "pPeriodId" uuid,
                                                      "pModule" text DEFAULT 'GL')
RETURNS void LANGUAGE plpgsql STABLE AS $$
DECLARE
  "vStatus" text;
  "vCode"   text;
  "vLock"   date;
BEGIN
  SELECT status, code INTO "vStatus", "vCode" FROM "Accounting"."FiscalPeriods"
   WHERE "tenantId" = "pTenant" AND id = "pPeriodId";
  IF "vStatus" IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'Period % is % — postings dated % are blocked', "vCode", lower("vStatus"), "pDate"
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT cp."booksLockDate" INTO "vLock" FROM "Company"."CompanySettings" cp WHERE cp."tenantId" = "pTenant";
  IF "vLock" IS NOT NULL AND "pDate" <= "vLock" THEN
    RAISE EXCEPTION 'Books are locked up to %; cannot post on %', "vLock", "pDate"
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- (a) + (b): journal header guard
CREATE OR REPLACE FUNCTION "Accounting"."triggerJournalEntryGuard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vKeep"   text[] := ARRAY['status','reversedById','reversalDate','updatedAt','updatedBy','rowVersion'];
  "vLines"  integer;
  "vDr"     numeric(18,2);
  "vCr"     numeric(18,2);
  "vBad"    text;
  "vRev"    record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Voucher % is % and cannot be deleted', OLD."docNo", OLD.status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  -- (b) posted/reversed journals are immutable; only POSTED -> REVERSED (+ link) is allowed
  IF TG_OP = 'UPDATE' AND OLD.status IN ('POSTED','REVERSED') THEN
    IF OLD.status = 'REVERSED'
       OR NEW.status NOT IN ('POSTED','REVERSED')
       OR (to_jsonb(NEW) - "vKeep") IS DISTINCT FROM (to_jsonb(OLD) - "vKeep") THEN
      RAISE EXCEPTION 'Voucher % is % and cannot be changed; reverse it instead', OLD."docNo", OLD.status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status = 'POSTED' AND (NEW."reversedById" IS NOT NULL OR NEW."reversalDate" IS NOT NULL) THEN
      RAISE EXCEPTION 'Voucher %: reversal link requires status REVERSED', OLD."docNo" USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'REVERSED' THEN
      SELECT status, "reversalOfId" INTO "vRev" FROM "Accounting"."Vouchers"
       WHERE "tenantId" = NEW."tenantId" AND id = NEW."reversedById";
      IF "vRev".status IS DISTINCT FROM 'POSTED' OR "vRev"."reversalOfId" IS DISTINCT FROM NEW.id THEN
        RAISE EXCEPTION 'Voucher % can only be marked REVERSED by its posted reversing voucher', OLD."docNo"
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'REVERSED' THEN
    RAISE EXCEPTION 'Only a POSTED voucher can become REVERSED' USING ERRCODE = 'check_violation';
  END IF;

  -- (a) transition into POSTED
  IF NEW.status = 'POSTED' THEN
    SELECT count(*), COALESCE(sum(l.debit), 0), COALESCE(sum(l.credit), 0)
      INTO "vLines", "vDr", "vCr"
      FROM "Accounting"."VoucherLines" l
     WHERE l."tenantId" = NEW."tenantId" AND l."journalEntryId" = NEW.id;
    IF "vLines" < 2 THEN
      RAISE EXCEPTION 'Voucher % needs at least two lines to post', NEW."docNo" USING ERRCODE = 'check_violation';
    END IF;
    IF "vDr" <> "vCr" OR "vDr" <= 0 THEN
      RAISE EXCEPTION 'Voucher % is unbalanced: debit % vs credit %', NEW."docNo", "vDr", "vCr"
        USING ERRCODE = 'check_violation';
    END IF;
    -- (d) every line account must still be postable and active at posting time
    SELECT a.code INTO "vBad"
      FROM "Accounting"."VoucherLines" l
      JOIN "Accounting"."ChartOfAccounts" a ON a."tenantId" = l."tenantId" AND a.id = l."accountId"
     WHERE l."tenantId" = NEW."tenantId" AND l."journalEntryId" = NEW.id
       AND (a.kind <> 'POSTABLE' OR a.status <> 'ACTIVE' OR a."deletedAt" IS NOT NULL)
     LIMIT 1;
    IF "vBad" IS NOT NULL THEN
      RAISE EXCEPTION 'Account % is not an active postable account', "vBad" USING ERRCODE = 'check_violation';
    END IF;
    -- reversing voucher: the original must still be POSTED
    IF NEW."reversalOfId" IS NOT NULL THEN
      SELECT status INTO "vBad" FROM "Accounting"."Vouchers"
       WHERE "tenantId" = NEW."tenantId" AND id = NEW."reversalOfId";
      IF "vBad" IS DISTINCT FROM 'POSTED' THEN
        RAISE EXCEPTION 'The voucher being reversed is not POSTED' USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    NEW."fiscalPeriodId" := "Accounting"."getFiscalPeriodForDate"(NEW."tenantId", NEW."postingDate", NEW."fiscalPeriodId");
    PERFORM "Accounting"."assertPostingAllowed"(NEW."tenantId", NEW."postingDate", NEW."fiscalPeriodId",
                                       "Accounting"."getModuleForDocumentType"(NEW."sourceDocType"));
    NEW."totalDebit"       := "vDr";
    NEW."totalCredit"      := "vCr";
    NEW."postedAt"         := COALESCE(NEW."postedAt", now());
    NEW."postedByUserId" := COALESCE(NEW."postedByUserId", "Company"."getCurrentUserId"());
  ELSIF NEW.status = 'PENDING_APPROVAL' THEN
    NEW."submittedAt" := COALESCE(NEW."submittedAt", now());
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "journalEntryGuard" BEFORE INSERT OR UPDATE OR DELETE ON "Accounting"."Vouchers"
  FOR EACH ROW EXECUTE FUNCTION "Accounting"."triggerJournalEntryGuard"();

-- (c) + (d): journal line guard
CREATE OR REPLACE FUNCTION "Accounting"."triggerJournalLineGuard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vStatus"  text;
  "vBranch"  uuid;
  "vAcc"     record;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT status INTO "vStatus" FROM "Accounting"."Vouchers"
     WHERE "tenantId" = OLD."tenantId" AND id = OLD."journalEntryId";
    IF "vStatus" IN ('POSTED','REVERSED') THEN
      RAISE EXCEPTION 'Lines of a % voucher cannot be changed', lower("vStatus")
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT status, "branchId" INTO "vStatus", "vBranch" FROM "Accounting"."Vouchers"
   WHERE "tenantId" = NEW."tenantId" AND id = NEW."journalEntryId";
  IF "vStatus" IN ('POSTED','REVERSED') THEN
    RAISE EXCEPTION 'Lines cannot be added to a % voucher', lower("vStatus")
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW."branchId" := COALESCE(NEW."branchId", "vBranch");

  SELECT code, kind, status, "deletedAt", "branchId" INTO "vAcc"
    FROM "Accounting"."ChartOfAccounts" WHERE "tenantId" = NEW."tenantId" AND id = NEW."accountId";
  IF "vAcc".kind IS DISTINCT FROM 'POSTABLE' THEN
    RAISE EXCEPTION 'Account % is a % account; only postable (level 4) accounts take entries',
      COALESCE("vAcc".code, '?'), lower(COALESCE("vAcc".kind, 'unknown')) USING ERRCODE = 'check_violation';
  END IF;
  IF "vAcc".status <> 'ACTIVE' OR "vAcc"."deletedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Account % is inactive', "vAcc".code USING ERRCODE = 'check_violation';
  END IF;
  IF "vAcc"."branchId" IS NOT NULL AND "vAcc"."branchId" <> NEW."branchId" THEN
    RAISE EXCEPTION 'Account % is restricted to another branch', "vAcc".code USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "journalLineGuard" BEFORE INSERT OR UPDATE OR DELETE ON "Accounting"."VoucherLines"
  FOR EACH ROW EXECUTE FUNCTION "Accounting"."triggerJournalLineGuard"();

-- Keep draft header totals in step with the lines (register shows Debit/Credit for drafts too).
CREATE OR REPLACE FUNCTION "Accounting"."triggerJournalLineTotals"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vTenant" uuid := COALESCE(NEW."tenantId", OLD."tenantId");
  "vEntry"  uuid := COALESCE(NEW."journalEntryId", OLD."journalEntryId");
BEGIN
  UPDATE "Accounting"."Vouchers" j
     SET "totalDebit"  = t.dr,
         "totalCredit" = t.cr
    FROM (SELECT COALESCE(sum(debit), 0) AS dr, COALESCE(sum(credit), 0) AS cr
            FROM "Accounting"."VoucherLines" WHERE "tenantId" = "vTenant" AND "journalEntryId" = "vEntry") t
   WHERE j."tenantId" = "vTenant" AND j.id = "vEntry"
     AND j.status IN ('DRAFT','PENDING_APPROVAL')
     AND (j."totalDebit", j."totalCredit") IS DISTINCT FROM (t.dr, t.cr);
  IF TG_OP = 'UPDATE' AND OLD."journalEntryId" <> NEW."journalEntryId" THEN
    UPDATE "Accounting"."Vouchers" j
       SET "totalDebit"  = (SELECT COALESCE(sum(debit), 0)  FROM "Accounting"."VoucherLines" WHERE "tenantId" = OLD."tenantId" AND "journalEntryId" = OLD."journalEntryId"),
           "totalCredit" = (SELECT COALESCE(sum(credit), 0) FROM "Accounting"."VoucherLines" WHERE "tenantId" = OLD."tenantId" AND "journalEntryId" = OLD."journalEntryId")
     WHERE j."tenantId" = OLD."tenantId" AND j.id = OLD."journalEntryId" AND j.status IN ('DRAFT','PENDING_APPROVAL');
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "journalLineTotals" AFTER INSERT OR UPDATE OR DELETE ON "Accounting"."VoucherLines"
  FOR EACH ROW EXECUTE FUNCTION "Accounting"."triggerJournalLineTotals"();

-- Reverse a posted voucher (Voucher Detail "Reverse", register "Reverse voucher…").
-- Creates a mirror voucher (debits <-> credits) dated pReversalDate, posts it,
-- and marks the original REVERSED. Returns the reversing voucher id.
CREATE OR REPLACE FUNCTION "Accounting"."voucherReverse"("pEntryId" uuid, "pReversalDate" date, "pReason" text,
                                               "pRemarks" text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vOrig"   record;
  "vType"   text;
  "vNew"    uuid;
BEGIN
  SELECT * INTO "vOrig" FROM "Accounting"."Vouchers"
   WHERE "tenantId" = "vTenant" AND id = "pEntryId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF "vOrig".status <> 'POSTED' THEN
    RAISE EXCEPTION 'Only POSTED vouchers can be reversed (% is %)', "vOrig"."docNo", "vOrig".status
      USING ERRCODE = 'check_violation';
  END IF;
  -- system and opening postings are reversed with a JV; manual vouchers keep their type
  "vType" := CASE WHEN "vOrig"."voucherType" IN ('SYSTEM','OB') THEN 'JV' ELSE "vOrig"."voucherType" END;

  INSERT INTO "Accounting"."Vouchers"
         ("tenantId", "voucherType", "docNo", "docDate", "postingDate", "referenceNo", "branchId", department,
          "currencyCode", "fxRate", narration, "cashBankAccountId", "partyName", status, "preparedByUserId",
          "sourceDocType", "sourceDocId", "sourceDocNo", "reversalOfId", "reversalReason", "reversalRemarks")
  VALUES ("vTenant", "vType", "Company"."getNextDocNo"("vType", "pReversalDate", "vOrig"."branchId"),
          "pReversalDate", "pReversalDate", "vOrig"."docNo", "vOrig"."branchId", "vOrig".department,
          "vOrig"."currencyCode", "vOrig"."fxRate",
          left('Reversal of ' || "vOrig"."docNo" || ' — ' || "vOrig".narration, 300),
          CASE WHEN "vType" IN ('CPV','CRV','BPV','BRV') THEN "vOrig"."cashBankAccountId" END,
          "vOrig"."partyName", 'DRAFT', "Company"."getCurrentUserId"(),
          "vOrig"."sourceDocType", "vOrig"."sourceDocId", "vOrig"."sourceDocNo",
          "vOrig".id, "pReason", "pRemarks")
  RETURNING id INTO "vNew";

  INSERT INTO "Accounting"."VoucherLines"
         ("tenantId", "journalEntryId", "lineNo", "accountId", particulars, debit, credit,
          "costCentreId", "branchId", "customerId", "vendorId", "isAutoContra")
  SELECT "tenantId", "vNew", "lineNo", "accountId", particulars, credit, debit,
         "costCentreId", "branchId", "customerId", "vendorId", "isAutoContra"
    FROM "Accounting"."VoucherLines"
   WHERE "tenantId" = "vTenant" AND "journalEntryId" = "pEntryId";

  UPDATE "Accounting"."Vouchers" SET status = 'POSTED' WHERE "tenantId" = "vTenant" AND id = "vNew";
  UPDATE "Accounting"."Vouchers"
     SET status = 'REVERSED', "reversedById" = "vNew", "reversalDate" = "pReversalDate"
   WHERE "tenantId" = "vTenant" AND id = "pEntryId";
  RETURN "vNew";
END $$;

COMMENT ON FUNCTION "Accounting"."voucherReverse"(uuid, date, text, text) IS
  'Posts a mirror voucher (Dr<->Cr) on the reversal date and marks the original REVERSED. "This cannot be undone".';

-- Opening-balance lines: frozen once the batch is POSTED; postable accounts only;
-- keep batch totals current (KPI cards "Total debits / Total credits / Difference").
CREATE OR REPLACE FUNCTION "Accounting"."triggerOpeningBalanceLineGuard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vStatus" text;
  "vKind"   text;
BEGIN
  SELECT status INTO "vStatus" FROM "Accounting"."OpeningBalances"
   WHERE "tenantId" = COALESCE(NEW."tenantId", OLD."tenantId")
     AND id = COALESCE(NEW."batchId", OLD."batchId");
  IF "vStatus" = 'POSTED' THEN
    RAISE EXCEPTION 'Opening balances are posted and cannot be changed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  SELECT kind INTO "vKind" FROM "Accounting"."ChartOfAccounts" WHERE "tenantId" = NEW."tenantId" AND id = NEW."accountId";
  IF "vKind" IS DISTINCT FROM 'POSTABLE' THEN
    RAISE EXCEPTION 'Opening balances can only be entered on postable accounts' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "openingBalanceLineGuard" BEFORE INSERT OR UPDATE OR DELETE ON "Accounting"."OpeningBalanceLines"
  FOR EACH ROW EXECUTE FUNCTION "Accounting"."triggerOpeningBalanceLineGuard"();

CREATE OR REPLACE FUNCTION "Accounting"."triggerOpeningBalanceTotals"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vTenant" uuid := COALESCE(NEW."tenantId", OLD."tenantId");
  "vBatch"  uuid := COALESCE(NEW."batchId", OLD."batchId");
BEGIN
  UPDATE "Accounting"."OpeningBalances" b
     SET "totalDebit"  = t.dr,
         "totalCredit" = t.cr
    FROM (SELECT COALESCE(sum(debit), 0) AS dr, COALESCE(sum(credit), 0) AS cr
            FROM "Accounting"."OpeningBalanceLines" WHERE "tenantId" = "vTenant" AND "batchId" = "vBatch") t
   WHERE b."tenantId" = "vTenant" AND b.id = "vBatch" AND b.status = 'DRAFT';
  RETURN NULL;
END $$;

CREATE TRIGGER "openingBalanceLineTotals" AFTER INSERT OR UPDATE OR DELETE ON "Accounting"."OpeningBalanceLines"
  FOR EACH ROW EXECUTE FUNCTION "Accounting"."triggerOpeningBalanceTotals"();

-- "Post opening balances": one OB journal as at the batch date; a non-zero
-- difference is parked in the suspense account. Returns the journal id.
CREATE OR REPLACE FUNCTION "Accounting"."openingBalancePost"("pBatchId" uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vB"      record;
  "vJe"     uuid;
  "vN"      integer;
  "vDiff"   numeric(18,2);
BEGIN
  SELECT * INTO "vB" FROM "Accounting"."OpeningBalances"
   WHERE "tenantId" = "vTenant" AND id = "pBatchId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opening balance batch not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF "vB".status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Opening balances are already posted' USING ERRCODE = 'check_violation';
  END IF;
  "vDiff" := "vB"."totalDebit" - "vB"."totalCredit";
  IF "vDiff" <> 0 AND "vB"."suspenseAccountId" IS NULL THEN
    RAISE EXCEPTION 'Out of balance by %; choose a suspense account to park the difference', abs("vDiff")
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO "Accounting"."Vouchers" ("tenantId", "voucherType", "docNo", "docDate", "postingDate", "branchId",
                                 narration, status, "preparedByUserId", "sourceDocType", "sourceDocId")
  VALUES ("vTenant", 'OB', "Company"."getNextDocNo"('OB', "vB"."asAtDate", "vB"."branchId"), "vB"."asAtDate", "vB"."asAtDate",
          "vB"."branchId", 'Opening balances as at ' || to_char("vB"."asAtDate", 'DD Mon YYYY'),
          'DRAFT', "Company"."getCurrentUserId"(), 'OB', "vB".id)
  RETURNING id INTO "vJe";

  INSERT INTO "Accounting"."VoucherLines" ("tenantId", "journalEntryId", "lineNo", "accountId", particulars,
                                debit, credit, "branchId", "customerId", "vendorId")
  SELECT "vTenant", "vJe", (row_number() OVER (ORDER BY a.code, l.id))::smallint, l."accountId",
         COALESCE(l.remarks, 'Opening balance'), l.debit, l.credit,
         COALESCE(l."branchId", "vB"."branchId"), l."customerId", l."vendorId"
    FROM "Accounting"."OpeningBalanceLines" l
    JOIN "Accounting"."ChartOfAccounts" a ON a."tenantId" = l."tenantId" AND a.id = l."accountId"
   WHERE l."tenantId" = "vTenant" AND l."batchId" = "pBatchId";
  GET DIAGNOSTICS "vN" = ROW_COUNT;

  IF "vDiff" <> 0 THEN
    INSERT INTO "Accounting"."VoucherLines" ("tenantId", "journalEntryId", "lineNo", "accountId", particulars,
                                  debit, credit, "branchId")
    VALUES ("vTenant", "vJe", ("vN" + 1)::smallint, "vB"."suspenseAccountId", 'Opening balance difference',
            CASE WHEN "vDiff" < 0 THEN -"vDiff" ELSE 0 END,
            CASE WHEN "vDiff" > 0 THEN  "vDiff" ELSE 0 END, "vB"."branchId");
  END IF;

  UPDATE "Accounting"."Vouchers" SET status = 'POSTED' WHERE "tenantId" = "vTenant" AND id = "vJe";
  UPDATE "Accounting"."OpeningBalances"
     SET status = 'POSTED', "journalEntryId" = "vJe", "postedAt" = now(),
         "postedByUserId" = "Company"."getCurrentUserId"()
   WHERE "tenantId" = "vTenant" AND id = "pBatchId";
  RETURN "vJe";
END $$;

COMMENT ON FUNCTION "Accounting"."openingBalancePost"(uuid) IS
  'Posts an opening-balance batch as one OB journal (difference to suspense) and freezes the batch.';

-- #############################################################################
-- FULL EDITION — tables, constraints and function overrides below exist only
-- in erp-full. Nothing above this line differs from Basic except the appended
-- columns/constraints marked "-- FULL".
-- #############################################################################

-- ---------------------------------------------------------------------------
-- AccountBranches — multi-branch restriction of a postable account (Full).
-- COA inspector "Branch"; Basic keeps a single Accounting.ChartOfAccounts.branchId.
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."AccountBranches" (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"       uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "accountId"      uuid NOT NULL,
  "branchId"       uuid NOT NULL,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "createdBy"      uuid,
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedBy"      uuid,
  "rowVersion"     integer NOT NULL DEFAULT 0,
  CONSTRAINT "accountBranchTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "accountBranchUk" UNIQUE ("tenantId", "accountId", "branchId"),
  CONSTRAINT "accountBranchAccountFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id),
  CONSTRAINT "accountBranchBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Accounting"."AccountBranches"', true);
CREATE INDEX "accountBranchBranchIdx" ON "Accounting"."AccountBranches" ("tenantId", "branchId");

COMMENT ON TABLE "Accounting"."AccountBranches" IS 'Branches allowed to post to an account shared by several (not all) branches. No rows = governed by account.branchId.';

-- ---------------------------------------------------------------------------
-- project — app/accounting/cost-centres "Projects" (PRJ-01 Karachi Warehouse
-- Fit-out · budget · owner · status In progress/Planning · Jul 2026 → Dec 2026 ·
-- colour · tags · Project P&L with revenue). src/9A-company-plus.js PROJ[]
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."Projects" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                text NOT NULL,                                -- PRJ-01
  name                text NOT NULL,                                -- Karachi Warehouse Fit-out
  "ownerEmployeeId"   uuid,                                         -- "Owner" (FK → HumanResources.Employees in fk file)
  "budgetAmount"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("budgetAmount" >= 0),     -- "Annual budget (Rs)"
  "expectedRevenue"    numeric(18,2) NOT NULL DEFAULT 0 CHECK ("expectedRevenue" >= 0),  -- Project P&L revenue (Engro contract 31.5M)
  "startDate"          date,                                         -- "Dates: Oct 2026 →"
  "endDate"            date,                                         -- "→ Jun 2027"
  colour              text NOT NULL DEFAULT 'blue',
  status              text NOT NULL DEFAULT 'PLANNING',
  "deletedAt"          timestamptz,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  CONSTRAINT "projectTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "projectCodeUk" UNIQUE ("tenantId", code),
  CONSTRAINT "projectCodeChk" CHECK (code ~ '^PRJ-[0-9]{2,4}$'),
  CONSTRAINT "projectDatesChk" CHECK ("endDate" IS NULL OR "startDate" IS NULL OR "endDate" >= "startDate")
);
SELECT "Company"."addStandardTriggers"('"Accounting"."Projects"', true);
CREATE INDEX "projectStatusIdx" ON "Accounting"."Projects" ("tenantId", status) WHERE "deletedAt" IS NULL;

COMMENT ON TABLE "Accounting"."Projects" IS 'Projects tagged on journal lines for project P&L and budget vs actual (app/accounting/cost-centres).';

-- ProjectTags — "Tags" chips on projects (#capex #karachi)
CREATE TABLE "Accounting"."ProjectTags" (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"       uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "projectId"      uuid NOT NULL,
  tag             text NOT NULL CHECK (tag ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "createdBy"      uuid,
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedBy"      uuid,
  "rowVersion"     integer NOT NULL DEFAULT 0,
  CONSTRAINT "projectTagTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "projectTagUk" UNIQUE ("tenantId", "projectId", tag),
  CONSTRAINT "projectTagProjectFk" FOREIGN KEY ("tenantId", "projectId") REFERENCES "Accounting"."Projects" ("tenantId", id) ON DELETE CASCADE
);
SELECT "Company"."addStandardTriggers"('"Accounting"."ProjectTags"');
CREATE INDEX "projectTagTagIdx" ON "Accounting"."ProjectTags" ("tenantId", tag);

-- ---------------------------------------------------------------------------
-- CostAllocationRules / CostAllocationSplits — "Allocation rules: Shared costs are split
-- automatically when the voucher is posted" (Office rent · 5110-01 Rent · basis
-- Floor area · Finance 25% / Sales 35% / … · tags monthly, auto-post).
-- src/9A-company-plus.js RULES[]
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."CostAllocationRules" (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"       uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name            text NOT NULL,                                    -- Office rent
  "accountId"      uuid NOT NULL,                                    -- shared cost account (5110-01 Rent)
  basis           text NOT NULL,  -- Floor area / Headcount / Km driven / Users
  tags            text[] NOT NULL DEFAULT '{}',                     -- monthly, auto-post, from logbook
  status          text NOT NULL DEFAULT 'ACTIVE',
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "createdBy"      uuid,
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedBy"      uuid,
  "rowVersion"     integer NOT NULL DEFAULT 0,
  CONSTRAINT "allocationRuleTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "allocationRuleNameUk" UNIQUE ("tenantId", name),
  CONSTRAINT "allocationRuleAccountFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Accounting"."CostAllocationRules"', true);
CREATE INDEX "allocationRuleAccountIdx" ON "Accounting"."CostAllocationRules" ("tenantId", "accountId") WHERE status = 'ACTIVE';

CREATE TABLE "Accounting"."CostAllocationSplits" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "allocationRuleId"  uuid NOT NULL,
  "costCentreId"      uuid NOT NULL,                                -- Finance / Sales / Administration / IT
  percent             numeric(7,4) NOT NULL CHECK (percent > 0 AND percent <= 100),   -- 25%
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  CONSTRAINT "allocationSplitTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "allocationSplitUk" UNIQUE ("tenantId", "allocationRuleId", "costCentreId"),
  CONSTRAINT "allocationSplitRuleFk" FOREIGN KEY ("tenantId", "allocationRuleId")
      REFERENCES "Accounting"."CostAllocationRules" ("tenantId", id) ON DELETE CASCADE,
  CONSTRAINT "allocationSplitCcFk" FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Accounting"."CostAllocationSplits"', true);

-- splits of an active rule must add up to exactly 100% (checked at commit)
CREATE OR REPLACE FUNCTION "Accounting"."triggerAllocationSplitTotal"() RETURNS trigger
LANGUAGE plpgsql AS $$
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
END $$;

CREATE CONSTRAINT TRIGGER "allocationSplitTotal" AFTER INSERT OR UPDATE OR DELETE ON "Accounting"."CostAllocationSplits"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "Accounting"."triggerAllocationSplitTotal"();

-- VoucherLines FKs to the Full-only tables above
ALTER TABLE "Accounting"."VoucherLines"
  ADD CONSTRAINT "journalLineProjectFk" FOREIGN KEY ("tenantId", "projectId") REFERENCES "Accounting"."Projects" ("tenantId", id);
ALTER TABLE "Accounting"."VoucherLines"
  ADD CONSTRAINT "journalLineAllocationRuleFk" FOREIGN KEY ("tenantId", "allocationRuleId")
      REFERENCES "Accounting"."CostAllocationRules" ("tenantId", id);
CREATE INDEX "journalLineProjectIdx"  ON "Accounting"."VoucherLines" ("tenantId", "projectId") WHERE "projectId" IS NOT NULL;
CREATE INDEX "journalLineEmployeeIdx" ON "Accounting"."VoucherLines" ("tenantId", "employeeId") WHERE "employeeId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- PeriodModuleLocks — app/periods "Modules" column (All locked · AR, AP, GL
-- closed · AR closed · GL open) and Close modal "Close for modules: All modules
-- (GL, AR, AP, Inventory, Payroll) / Sub-ledgers only".
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."PeriodModuleLocks" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "fiscalPeriodId"    uuid NOT NULL,
  "moduleCode"         text NOT NULL,
  status              text NOT NULL DEFAULT 'OPEN',
  "closedAt"           timestamptz,
  "closedByUserId"   uuid,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  CONSTRAINT "periodModuleLockTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "periodModuleLockUk" UNIQUE ("tenantId", "fiscalPeriodId", "moduleCode"),
  CONSTRAINT "periodModuleLockPeriodFk" FOREIGN KEY ("tenantId", "fiscalPeriodId") REFERENCES "Accounting"."FiscalPeriods" ("tenantId", id),
  CONSTRAINT "periodModuleLockUserFk" FOREIGN KEY ("tenantId", "closedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "periodModuleLockClosedChk" CHECK (status = 'OPEN' OR "closedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Accounting"."PeriodModuleLocks"', true);

COMMENT ON TABLE "Accounting"."PeriodModuleLocks" IS 'Per-module close of a period. A posting is blocked if its period is not OPEN or its module (Accounting.getModuleForDocumentType) is CLOSED/LOCKED.';

-- ---------------------------------------------------------------------------
-- PeriodReopenRequests — app/periods "Reopen period" modal: Period, Reopen until,
-- Reason *, Approver, "Re-close automatically at the end date"; locked periods
-- need the approver's MFA code.
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."PeriodReopenRequests" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "fiscalPeriodId"      uuid NOT NULL,                              -- AUG-2026 (Closed) / JUL-2026 (Locked)
  "moduleCode"           text,  -- NULL = whole period
  "previousStatus"       text NOT NULL,
  "reopenUntil"          date NOT NULL,                              -- "Reopen until"
  reason                text NOT NULL CHECK (char_length(btrim(reason)) > 0),       -- "Reason *"
  "requestedByUserId"  uuid NOT NULL,
  "approverUserId"      uuid NOT NULL,                              -- "Approver: Ahmed Raza (CEO)"
  "autoReclose"          boolean NOT NULL DEFAULT true,              -- "Re-close automatically at the end date"
  status                text NOT NULL DEFAULT 'PENDING',
  "mfaVerifiedAt"       timestamptz,                                -- locked periods: approver MFA
  "decidedAt"            timestamptz,
  "reclosedAt"           timestamptz,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  CONSTRAINT "periodReopenTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "periodReopenPeriodFk" FOREIGN KEY ("tenantId", "fiscalPeriodId") REFERENCES "Accounting"."FiscalPeriods" ("tenantId", id),
  CONSTRAINT "periodReopenRequestedByFk" FOREIGN KEY ("tenantId", "requestedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "periodReopenApproverFk" FOREIGN KEY ("tenantId", "approverUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "periodReopenDecidedChk" CHECK (status IN ('PENDING','CANCELLED') OR "decidedAt" IS NOT NULL),
  CONSTRAINT "periodReopenMfaChk" CHECK ("previousStatus" <> 'LOCKED' OR status NOT IN ('APPROVED','RECLOSED')
                                          OR "mfaVerifiedAt" IS NOT NULL),
  CONSTRAINT "periodReopenReclosedChk" CHECK (status <> 'RECLOSED' OR "reclosedAt" IS NOT NULL),
  CONSTRAINT "periodReopenSodChk" CHECK ("approverUserId" <> "requestedByUserId")
);
SELECT "Company"."addStandardTriggers"('"Accounting"."PeriodReopenRequests"', true);
CREATE INDEX "periodReopenDueIdx" ON "Accounting"."PeriodReopenRequests" ("tenantId", "reopenUntil") WHERE status = 'APPROVED' AND "autoReclose";
CREATE UNIQUE INDEX "periodReopenOneLiveUk" ON "Accounting"."PeriodReopenRequests" ("tenantId", "fiscalPeriodId") WHERE status IN ('PENDING','APPROVED');

COMMENT ON TABLE "Accounting"."PeriodReopenRequests" IS 'Audited reopen requests. Approval sets the period (or the module lock) OPEN; a job re-closes it to previousStatus after reopenUntil when autoReclose.';

-- ---------------------------------------------------------------------------
-- RecurringVoucherTemplates — app/accounting/recurring (Template, Type, Frequency,
-- Next run, Last run, Amount, Auto-post, Status) + "New recurring template"
-- modal; also New Voucher "Save as template" / "Import from template" and the
-- JV "Recurring monthly" switch. src/40-acc-core.html, src/94-purchase-docs.js
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."RecurringVoucherTemplates" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name                    text NOT NULL,                            -- "Template name *"
  description             text,                                     -- row sub-line: "Dr 5220-01 · Cr 2150-01", "Vendor contract SC-22"
  "voucherType"            text NOT NULL,  -- "Voucher type"
  frequency               text NOT NULL,  -- NONE = on-demand voucher template
  "runDay"                 smallint CHECK ("runDay" BETWEEN 1 AND 31), -- "Day of period: 1st / 5th / 15th"
  "runOnLastDay"         boolean NOT NULL DEFAULT false,           -- "Last day"
  "runWeekday"             smallint CHECK ("runWeekday" BETWEEN 1 AND 7),   -- weekly (ISO 1 = Monday)
  "runMonth"               smallint CHECK ("runMonth" BETWEEN 1 AND 12),    -- yearly: "Yearly · 30 Jun"
  "startDate"              date,                                     -- "Start date"
  "endMode"                text NOT NULL DEFAULT 'NEVER',  -- "End after: Never / 12 occurrences / On date…"
  "endAfterCount"         integer CHECK ("endAfterCount" > 0),
  "endOnDate"             date,
  "branchId"               uuid NOT NULL,                            -- "Branch"
  narration               text NOT NULL CHECK (char_length(narration) BETWEEN 1 AND 300),
  "cashBankAccountId"    uuid,                                     -- BPV/CPV paying account
  "partyName"              text,
  amount                  numeric(18,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),   -- "Amount" (voucher value; maintained from lines)
  "autoPost"               boolean NOT NULL DEFAULT true,            -- "Auto-post generated vouchers"
  "notifyOnFailure"       boolean NOT NULL DEFAULT true,            -- "Notify me when a run fails"
  "notifyUserId"          uuid,
  "nextRunDate"           date,                                     -- "Next run"
  "lastRunDate"           date,                                     -- "Last run"
  "occurrencesDone"        integer NOT NULL DEFAULT 0 CHECK ("occurrencesDone" >= 0),
  status                  text NOT NULL DEFAULT 'ACTIVE',
  "lastError"              text,                                     -- "Period locked — Sep"
  "sourceJournalEntryId" uuid,                                     -- voucher it was saved from ("Save as template")
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  CONSTRAINT "recurringTemplateTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "recurringTemplateNameUk" UNIQUE ("tenantId", name),
  CONSTRAINT "recurringTemplateBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "recurringTemplateCashBankFk" FOREIGN KEY ("tenantId", "cashBankAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id),
  CONSTRAINT "recurringTemplateNotifyFk" FOREIGN KEY ("tenantId", "notifyUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "recurringTemplateSourceFk" FOREIGN KEY ("tenantId", "sourceJournalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id),
  CONSTRAINT "recurringTemplateCashBankChk" CHECK (("cashBankAccountId" IS NOT NULL) = ("voucherType" IN ('BPV','CPV'))),
  CONSTRAINT "recurringTemplateScheduleChk" CHECK (
       (frequency = 'NONE' AND "startDate" IS NULL AND "nextRunDate" IS NULL)
    OR (frequency = 'WEEKLY' AND "startDate" IS NOT NULL AND "runWeekday" IS NOT NULL)
    OR (frequency IN ('MONTHLY','QUARTERLY') AND "startDate" IS NOT NULL AND ("runDay" IS NOT NULL OR "runOnLastDay"))
    OR (frequency = 'YEARLY' AND "startDate" IS NOT NULL AND "runMonth" IS NOT NULL AND ("runDay" IS NOT NULL OR "runOnLastDay"))),
  CONSTRAINT "recurringTemplateEndChk" CHECK (
       ("endMode" = 'NEVER'   AND "endAfterCount" IS NULL AND "endOnDate" IS NULL)
    OR ("endMode" = 'AFTER_N' AND "endAfterCount" IS NOT NULL AND "endOnDate" IS NULL)
    OR ("endMode" = 'ON_DATE' AND "endOnDate" IS NOT NULL AND "endAfterCount" IS NULL)),
  CONSTRAINT "recurringTemplateDayChk" CHECK (NOT ("runOnLastDay" AND "runDay" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Accounting"."RecurringVoucherTemplates"', true);
CREATE INDEX "recurringTemplateDueIdx"  ON "Accounting"."RecurringVoucherTemplates" ("tenantId", "nextRunDate") WHERE status = 'ACTIVE';
CREATE INDEX "recurringTemplateFreqIdx" ON "Accounting"."RecurringVoucherTemplates" ("tenantId", frequency, status);

COMMENT ON TABLE "Accounting"."RecurringVoucherTemplates" IS 'Vouchers generated on a schedule (rent, accruals, depreciation, loan instalments). frequency NONE = saved voucher template for "Import from template".';

ALTER TABLE "Accounting"."Vouchers"
  ADD CONSTRAINT "journalEntryRecurringTemplateFk" FOREIGN KEY ("tenantId", "recurringTemplateId")
      REFERENCES "Accounting"."RecurringVoucherTemplates" ("tenantId", id);
CREATE INDEX "journalEntryRecurringIdx" ON "Accounting"."Vouchers" ("tenantId", "recurringTemplateId") WHERE "recurringTemplateId" IS NOT NULL;

-- RecurringVoucherTemplateLines — modal lines grid (Account, Narration, Debit, Credit).
-- For BPV/CPV templates only the debit lines are stored; the bank/cash credit
-- leg is added when the voucher is generated.
CREATE TABLE "Accounting"."RecurringVoucherTemplateLines" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "recurringTemplateId"  uuid NOT NULL,
  "lineNo"                smallint NOT NULL CHECK ("lineNo" > 0),
  "accountId"             uuid NOT NULL,                             -- 5270-01 · Repairs & Maintenance
  narration              text,                                      -- Generator AMC
  debit                  numeric(18,2) NOT NULL DEFAULT 0,
  credit                 numeric(18,2) NOT NULL DEFAULT 0,
  "costCentreId"         uuid,
  "projectId"             uuid,
  "branchId"              uuid,
  "customerId"            uuid,
  "vendorId"              uuid,                                      -- "Cr AP — PTCL"
  "employeeId"            uuid,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  CONSTRAINT "recurringTemplateLineTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "recurringTemplateLineNoUk" UNIQUE ("tenantId", "recurringTemplateId", "lineNo") DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT "recurringTemplateLineTemplateFk" FOREIGN KEY ("tenantId", "recurringTemplateId")
      REFERENCES "Accounting"."RecurringVoucherTemplates" ("tenantId", id) ON DELETE CASCADE,
  CONSTRAINT "recurringTemplateLineAccountFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id),
  CONSTRAINT "recurringTemplateLineCcFk" FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id),
  CONSTRAINT "recurringTemplateLineProjectFk" FOREIGN KEY ("tenantId", "projectId") REFERENCES "Accounting"."Projects" ("tenantId", id),
  CONSTRAINT "recurringTemplateLineBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "recurringTemplateLineAmountChk" CHECK (debit >= 0 AND credit >= 0 AND ((debit > 0) <> (credit > 0))),
  CONSTRAINT "recurringTemplateLineOnePartyChk" CHECK (num_nonnulls("customerId", "vendorId", "employeeId") <= 1)
);
SELECT "Company"."addStandardTriggers"('"Accounting"."RecurringVoucherTemplateLines"', true);
CREATE INDEX "recurringTemplateLineTplIdx" ON "Accounting"."RecurringVoucherTemplateLines" ("tenantId", "recurringTemplateId");

-- keep RecurringVoucherTemplates.amount (= total debits) in step with its lines
CREATE OR REPLACE FUNCTION "Accounting"."triggerRecurringLineAmount"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vTenant" uuid := COALESCE(NEW."tenantId", OLD."tenantId");
  "vTpl"    uuid := COALESCE(NEW."recurringTemplateId", OLD."recurringTemplateId");
BEGIN
  UPDATE "Accounting"."RecurringVoucherTemplates" t
     SET amount = (SELECT COALESCE(sum(l.debit), 0)
                     FROM "Accounting"."RecurringVoucherTemplateLines" l
                    WHERE l."tenantId" = "vTenant" AND l."recurringTemplateId" = "vTpl")
   WHERE t."tenantId" = "vTenant" AND t.id = "vTpl";
  RETURN NULL;
END $$;

CREATE TRIGGER "recurringTemplateLineAmount" AFTER INSERT OR UPDATE OR DELETE ON "Accounting"."RecurringVoucherTemplateLines"
  FOR EACH ROW EXECUTE FUNCTION "Accounting"."triggerRecurringLineAmount"();

-- RecurringVoucherRuns — run history ("Run due now", KPI "Failed runs 1 · Period locked — Sep")
CREATE TABLE "Accounting"."RecurringVoucherRuns" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "recurringTemplateId"  uuid NOT NULL,
  "scheduledDate"         date NOT NULL,
  "runAt"                 timestamptz NOT NULL DEFAULT now(),
  "triggerType"           text NOT NULL,   -- scheduler / "Run due now"
  status                 text NOT NULL,
  "journalEntryId"       uuid,
  "errorMessage"          text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  CONSTRAINT "recurringRunTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "recurringRunTemplateFk" FOREIGN KEY ("tenantId", "recurringTemplateId") REFERENCES "Accounting"."RecurringVoucherTemplates" ("tenantId", id),
  CONSTRAINT "recurringRunJeFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id),
  CONSTRAINT "recurringRunResultChk" CHECK ((status = 'SUCCESS') = ("journalEntryId" IS NOT NULL)
                                             AND (status = 'SUCCESS' OR "errorMessage" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Accounting"."RecurringVoucherRuns"');
CREATE INDEX "recurringRunTemplateIdx" ON "Accounting"."RecurringVoucherRuns" ("tenantId", "recurringTemplateId", "scheduledDate" DESC);
CREATE INDEX "recurringRunFailedIdx"   ON "Accounting"."RecurringVoucherRuns" ("tenantId", "runAt" DESC) WHERE status = 'FAILED';
CREATE UNIQUE INDEX "recurringRunOnceUk" ON "Accounting"."RecurringVoucherRuns" ("tenantId", "recurringTemplateId", "scheduledDate") WHERE status = 'SUCCESS';
CREATE TRIGGER "recurringRunAppendOnly" BEFORE UPDATE OR DELETE ON "Accounting"."RecurringVoucherRuns"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();

-- ---------------------------------------------------------------------------
-- VoucherActivities — Voucher Detail "Audit trail" (When, User, Action, Detail:
-- Submitted / Edited "Line 4 amount 848,000 → 862,000" / Attachment / Created)
-- and the "Approval" timeline (Send back / Approve + Comment). Append-only.
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."VoucherActivities" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "journalEntryId"   uuid NOT NULL,
  "occurredAt"        timestamptz NOT NULL DEFAULT now(),          -- "When"
  "userId"            uuid,                                        -- "User"
  action             text NOT NULL,
  detail             text,                                        -- "Routed to Sana Javed (rule: JV > Rs 500,000)"
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  CONSTRAINT "journalActivityTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "journalActivityJeFk" FOREIGN KEY ("tenantId", "journalEntryId")
      REFERENCES "Accounting"."Vouchers" ("tenantId", id) ON DELETE CASCADE,   -- only DRAFT vouchers can be deleted
  CONSTRAINT "journalActivityUserFk" FOREIGN KEY ("tenantId", "userId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Accounting"."VoucherActivities"');
CREATE INDEX "journalActivityJeIdx" ON "Accounting"."VoucherActivities" ("tenantId", "journalEntryId", "occurredAt" DESC);

-- append-only, except the cascade when a DRAFT voucher itself is deleted
CREATE OR REPLACE FUNCTION "Accounting"."triggerJournalActivityGuard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "Accounting"."Vouchers" j
                                       WHERE j."tenantId" = OLD."tenantId" AND j.id = OLD."journalEntryId") THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Accounting.VoucherActivities is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER "journalActivityAppendOnly" BEFORE UPDATE OR DELETE ON "Accounting"."VoucherActivities"
  FOR EACH ROW EXECUTE FUNCTION "Accounting"."triggerJournalActivityGuard"();

-- status changes on a voucher write their own activity rows
CREATE OR REPLACE FUNCTION "Accounting"."triggerJournalEntryActivity"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "Accounting"."VoucherActivities" ("tenantId", "journalEntryId", "userId", action, detail)
    VALUES (NEW."tenantId", NEW.id, "Company"."getCurrentUserId"(), 'CREATED',
            CASE WHEN NEW."sourceDocNo" IS NOT NULL THEN 'Generated from ' || NEW."sourceDocNo" END);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO "Accounting"."VoucherActivities" ("tenantId", "journalEntryId", "userId", action, detail)
    VALUES (NEW."tenantId", NEW.id, "Company"."getCurrentUserId"(),
            CASE NEW.status WHEN 'PENDING_APPROVAL' THEN 'SUBMITTED'
                            WHEN 'POSTED'           THEN 'POSTED'
                            WHEN 'REVERSED'         THEN 'REVERSED'
                            ELSE 'SENT_BACK' END,
            CASE WHEN NEW.status = 'REVERSED' THEN 'Reversed on ' || NEW."reversalDate"::text END);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "journalEntryActivity" AFTER INSERT OR UPDATE OF status ON "Accounting"."Vouchers"
  FOR EACH ROW EXECUTE FUNCTION "Accounting"."triggerJournalEntryActivity"();

-- ---------------------------------------------------------------------------
-- YearEndCloses — app/periods/close wizard (FY select, Dry run / Final close,
-- 1 Pre-close checklist "9 of 11 checks passed · 2 warnings", 3 Closing entries
-- "Transfer … to 3201 Retained Earnings", 4 Confirm & lock: Lock all 12 periods,
-- Carry forward balance sheet balances, Generate audit pack, Notify …).
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."YearEndCloses" (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                     uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "fiscalYearId"                uuid NOT NULL,                      -- "FY 2026-27"
  "runMode"                      text NOT NULL,
  "asAtDate"                    date NOT NULL,                      -- "dry run as at 30 Sep 2026"
  status                        text NOT NULL DEFAULT 'DRAFT',
  "checksTotal"                  smallint NOT NULL DEFAULT 0 CHECK ("checksTotal" >= 0),
  "checksPassed"                 smallint NOT NULL DEFAULT 0 CHECK ("checksPassed" >= 0),
  "checksWarning"                smallint NOT NULL DEFAULT 0 CHECK ("checksWarning" >= 0),
  checklist                     jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{key,label,detail,result OK|WARN|FAIL,link}]
  "warningsAcknowledged"         smallint NOT NULL DEFAULT 0 CHECK ("warningsAcknowledged" >= 0),
  "retainedEarningsAccountId"  uuid NOT NULL,                      -- 3201 Retained Earnings
  "retainedOpening"              numeric(18,2),                      -- "Retained earnings — opening"
  "netProfit"                    numeric(18,2),                      -- "Add: net profit"
  "retainedClosing"              numeric(18,2),                      -- "Retained earnings — after close"
  "closingJournalEntryId"      uuid,                               -- "JV-2027-CLOSE" (FINAL only)
  "lockPeriods"                  boolean NOT NULL DEFAULT true,      -- "Lock all 12 periods after closing"
  "carryForward"                 boolean NOT NULL DEFAULT true,      -- "Carry forward balance sheet balances"
  "generateAuditPack"           boolean NOT NULL DEFAULT false,     -- "Generate audit pack (TB, GL, statements) as PDF"
  "notifyUserIds"               uuid[] NOT NULL DEFAULT '{}',       -- "Notify Ahmed Raza and Sana Javed"
  "nextOpeningBatchId"         uuid,                               -- "Opening balances FY 2027-28"
  "runByUserId"                uuid,
  "runAt"                        timestamptz,
  "ceoApprovedByUserId"       uuid,                               -- "Final close is irreversible without CEO approval"
  "createdAt"                    timestamptz NOT NULL DEFAULT now(),
  "createdBy"                    uuid,
  "updatedAt"                    timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                    uuid,
  "rowVersion"                   integer NOT NULL DEFAULT 0,
  CONSTRAINT "yearEndCloseTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "yearEndCloseYearFk" FOREIGN KEY ("tenantId", "fiscalYearId") REFERENCES "Accounting"."FiscalYears" ("tenantId", id),
  CONSTRAINT "yearEndCloseReFk" FOREIGN KEY ("tenantId", "retainedEarningsAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id),
  CONSTRAINT "yearEndCloseJeFk" FOREIGN KEY ("tenantId", "closingJournalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id),
  CONSTRAINT "yearEndCloseObFk" FOREIGN KEY ("tenantId", "nextOpeningBatchId") REFERENCES "Accounting"."OpeningBalances" ("tenantId", id),
  CONSTRAINT "yearEndCloseRunByFk" FOREIGN KEY ("tenantId", "runByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "yearEndCloseCeoFk" FOREIGN KEY ("tenantId", "ceoApprovedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "yearEndCloseChecksChk" CHECK ("checksPassed" + "checksWarning" <= "checksTotal"),
  CONSTRAINT "yearEndCloseDryChk" CHECK ("runMode" = 'FINAL' OR "closingJournalEntryId" IS NULL),
  CONSTRAINT "yearEndCloseFinalChk" CHECK ("runMode" <> 'FINAL' OR status <> 'COMPLETED'
                                             OR ("closingJournalEntryId" IS NOT NULL AND "ceoApprovedByUserId" IS NOT NULL)),
  CONSTRAINT "yearEndCloseCompletedChk" CHECK (status <> 'COMPLETED' OR "runAt" IS NOT NULL),
  CONSTRAINT "yearEndCloseReMathChk" CHECK ("retainedClosing" IS NULL OR "retainedClosing" = "retainedOpening" + "netProfit")
);
SELECT "Company"."addStandardTriggers"('"Accounting"."YearEndCloses"', true);
CREATE INDEX "yearEndCloseYearIdx" ON "Accounting"."YearEndCloses" ("tenantId", "fiscalYearId", "createdAt" DESC);
CREATE UNIQUE INDEX "yearEndCloseOneFinalUk" ON "Accounting"."YearEndCloses" ("tenantId", "fiscalYearId")
  WHERE "runMode" = 'FINAL' AND status = 'COMPLETED';

-- YearEndAdjustments — wizard step 2 "Year-end adjustments" (Adjustment, Debit,
-- Credit, Amount, Status Posted / Proposed / Awaiting actuary; tick to include)
CREATE TABLE "Accounting"."YearEndAdjustments" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "yearEndCloseId"   uuid NOT NULL,
  description         text NOT NULL,                                -- "Provision for doubtful debts (50% of >180 days)"
  "debitAccountId"    uuid NOT NULL,                                -- 6111 Bad Debts
  "creditAccountId"   uuid NOT NULL,                                -- 1305 Provision for Doubtful Debts
  amount              numeric(18,2) NOT NULL CHECK (amount > 0),
  status              text NOT NULL DEFAULT 'PROPOSED',
  "isIncluded"         boolean NOT NULL DEFAULT false,               -- checkbox
  "journalEntryId"    uuid,                                         -- JV-2026-000413
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  CONSTRAINT "yearEndAdjustmentTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "yearEndAdjustmentCloseFk" FOREIGN KEY ("tenantId", "yearEndCloseId")
      REFERENCES "Accounting"."YearEndCloses" ("tenantId", id) ON DELETE CASCADE,
  CONSTRAINT "yearEndAdjustmentDrFk" FOREIGN KEY ("tenantId", "debitAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id),
  CONSTRAINT "yearEndAdjustmentCrFk" FOREIGN KEY ("tenantId", "creditAccountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id),
  CONSTRAINT "yearEndAdjustmentJeFk" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "Accounting"."Vouchers" ("tenantId", id),
  CONSTRAINT "yearEndAdjustmentAccountsChk" CHECK ("debitAccountId" <> "creditAccountId"),
  CONSTRAINT "yearEndAdjustmentPostedChk" CHECK ((status = 'POSTED') = ("journalEntryId" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Accounting"."YearEndAdjustments"', true);
CREATE INDEX "yearEndAdjustmentCloseIdx" ON "Accounting"."YearEndAdjustments" ("tenantId", "yearEndCloseId");

-- ---------------------------------------------------------------------------
-- budget — app/budgets "All budgets" (Budget + BUD-2026-01, Type, Scope, Version,
-- Owner, Amount, Utilised (Q1), Status) and "New budget" modal (name, fiscal
-- year, type, department, owner, seed from, CEO approval).
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."Budgets" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                    text NOT NULL,                            -- BUD-2026-01
  name                    text NOT NULL,                            -- FY 2026-27 Operating Budget
  "fiscalYearId"          uuid NOT NULL,                            -- "Fiscal year"
  "budgetType"             text NOT NULL,
  "scopeLabel"             text,                                     -- "Company · all branches", "Operations, Warehouse"
  department              text,                                     -- "Department" (Finance, Human Resources, Sales …)
  "costCentreId"          uuid,
  "projectId"              uuid,
  "branchId"               uuid,                                     -- NULL = all branches
  "ownerUserId"           uuid,                                     -- "Owner"
  "seedFrom"               text NOT NULL DEFAULT 'BLANK',  -- "Seed from"
  "seedUpliftPct"         numeric(7,4),                             -- "+ 10% uplift"
  "requiresCeoApproval"   boolean NOT NULL DEFAULT true,            -- "Require approval from CEO before activation"
  "currentVersionId"      uuid,                                     -- version shown/compared (v3) — FK below
  status                  text NOT NULL DEFAULT 'DRAFT',
  "approvedByUserId"     uuid,
  "approvedAt"             timestamptz,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  CONSTRAINT "budgetTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "budgetCodeUk" UNIQUE ("tenantId", code),
  CONSTRAINT "budgetYearFk" FOREIGN KEY ("tenantId", "fiscalYearId") REFERENCES "Accounting"."FiscalYears" ("tenantId", id),
  CONSTRAINT "budgetCcFk" FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id),
  CONSTRAINT "budgetProjectFk" FOREIGN KEY ("tenantId", "projectId") REFERENCES "Accounting"."Projects" ("tenantId", id),
  CONSTRAINT "budgetBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "budgetOwnerFk" FOREIGN KEY ("tenantId", "ownerUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "budgetApprovedByFk" FOREIGN KEY ("tenantId", "approvedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "budgetCodeChk" CHECK (code ~ '^BUD-[0-9]{4}-[0-9]{2,4}$'),
  CONSTRAINT "budgetTypeScopeChk" CHECK (("budgetType" <> 'PROJECT' OR "projectId" IS NOT NULL)
                                          AND ("budgetType" <> 'DEPARTMENT' OR department IS NOT NULL OR "costCentreId" IS NOT NULL)),
  CONSTRAINT "budgetSeedChk" CHECK ("seedUpliftPct" IS NULL OR "seedFrom" <> 'BLANK'),
  CONSTRAINT "budgetApprovedChk" CHECK (status <> 'APPROVED' OR ("approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Accounting"."Budgets"', true);
CREATE INDEX "budgetYearIdx" ON "Accounting"."Budgets" ("tenantId", "fiscalYearId", "budgetType", status);

-- BudgetVersions — "Version v1/v2/v3", "Save v4", "Version history: v1 (12 May
-- 2026), v2 (03 Jun 2026), v3 approved by Ahmed Raza on 21 Jun 2026"
CREATE TABLE "Accounting"."BudgetVersions" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "budgetId"             uuid NOT NULL,
  "versionNo"            smallint NOT NULL CHECK ("versionNo" > 0),   -- 3 -> "v3"
  status                text NOT NULL DEFAULT 'DRAFT',
  notes                 text,
  "approvedByUserId"   uuid,
  "approvedAt"           timestamptz,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  CONSTRAINT "budgetVersionTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "budgetVersionNoUk" UNIQUE ("tenantId", "budgetId", "versionNo"),
  CONSTRAINT "budgetVersionBudgetFk" FOREIGN KEY ("tenantId", "budgetId") REFERENCES "Accounting"."Budgets" ("tenantId", id),
  CONSTRAINT "budgetVersionApprovedByFk" FOREIGN KEY ("tenantId", "approvedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "budgetVersionApprovedChk" CHECK (status <> 'APPROVED' OR "approvedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Accounting"."BudgetVersions"', true);
CREATE UNIQUE INDEX "budgetVersionOneApprovedUk" ON "Accounting"."BudgetVersions" ("tenantId", "budgetId") WHERE status = 'APPROVED';

ALTER TABLE "Accounting"."Budgets"
  ADD CONSTRAINT "budgetCurrentVersionFk" FOREIGN KEY ("tenantId", "currentVersionId")
      REFERENCES "Accounting"."BudgetVersions" ("tenantId", id);

-- BudgetVersionLines — "Budget editor" grid: Account × Jul … Jun + FY Total (shown in
-- Rs '000; stored in full rupees). m01 = first month of the fiscal year (Jul).
CREATE TABLE "Accounting"."BudgetVersionLines" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "budgetVersionId"   uuid NOT NULL,
  "accountId"          uuid NOT NULL,                                -- 4101 Sales — Goods
  "costCentreId"      uuid,                                         -- department split (Budget vs Actual "By department")
  m01                 numeric(18,2) NOT NULL DEFAULT 0,             -- Jul
  m02                 numeric(18,2) NOT NULL DEFAULT 0,             -- Aug
  m03                 numeric(18,2) NOT NULL DEFAULT 0,             -- Sep
  m04                 numeric(18,2) NOT NULL DEFAULT 0,             -- Oct
  m05                 numeric(18,2) NOT NULL DEFAULT 0,             -- Nov
  m06                 numeric(18,2) NOT NULL DEFAULT 0,             -- Dec
  m07                 numeric(18,2) NOT NULL DEFAULT 0,             -- Jan
  m08                 numeric(18,2) NOT NULL DEFAULT 0,             -- Feb
  m09                 numeric(18,2) NOT NULL DEFAULT 0,             -- Mar
  m10                 numeric(18,2) NOT NULL DEFAULT 0,             -- Apr
  m11                 numeric(18,2) NOT NULL DEFAULT 0,             -- May
  m12                 numeric(18,2) NOT NULL DEFAULT 0,             -- Jun
  "totalAmount"        numeric(18,2) GENERATED ALWAYS AS
                        (m01 + m02 + m03 + m04 + m05 + m06 + m07 + m08 + m09 + m10 + m11 + m12) STORED,  -- "FY Total"
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  CONSTRAINT "budgetLineTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "budgetLineUk" UNIQUE NULLS NOT DISTINCT ("tenantId", "budgetVersionId", "accountId", "costCentreId"),
  CONSTRAINT "budgetLineVersionFk" FOREIGN KEY ("tenantId", "budgetVersionId")
      REFERENCES "Accounting"."BudgetVersions" ("tenantId", id) ON DELETE CASCADE,
  CONSTRAINT "budgetLineAccountFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id),
  CONSTRAINT "budgetLineCcFk" FOREIGN KEY ("tenantId", "costCentreId") REFERENCES "Accounting"."CostCentres" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Accounting"."BudgetVersionLines"', true);
CREATE INDEX "budgetLineVersionIdx" ON "Accounting"."BudgetVersionLines" ("tenantId", "budgetVersionId");
CREATE INDEX "budgetLineAccountIdx" ON "Accounting"."BudgetVersionLines" ("tenantId", "accountId");

-- approved/superseded versions are frozen ("edit cells and save as a new version")
CREATE OR REPLACE FUNCTION "Accounting"."triggerBudgetLineGuard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vStatus" text;
BEGIN
  SELECT status INTO "vStatus" FROM "Accounting"."BudgetVersions"
   WHERE "tenantId" = COALESCE(NEW."tenantId", OLD."tenantId")
     AND id = COALESCE(NEW."budgetVersionId", OLD."budgetVersionId");
  IF "vStatus" IN ('APPROVED','SUPERSEDED') THEN
    RAISE EXCEPTION 'Budget version is % — save changes as a new version', lower("vStatus")
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "budgetLineGuard" BEFORE INSERT OR UPDATE OR DELETE ON "Accounting"."BudgetVersionLines"
  FOR EACH ROW EXECUTE FUNCTION "Accounting"."triggerBudgetLineGuard"();

-- ---------------------------------------------------------------------------
-- SavedLedgerViews — Account Ledger "Saved Views" menu ("Month-end review",
-- "Large debits (≥ Rs 1M)", "Save current view…"). src/97-coa.js LS state.
-- ---------------------------------------------------------------------------
CREATE TABLE "Accounting"."SavedLedgerViews" (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"       uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "userId"         uuid NOT NULL,                                    -- owner
  name            text NOT NULL,                                    -- "Large debits (≥ Rs 1M)"
  "accountId"      uuid,                                             -- NULL = keep the current account
  "rangeLabel"     text,                                             -- "01 Sep 2026 – 30 Sep 2026" / relative ranges
  "dateFrom"       date,
  "dateTo"         date,
  filters         jsonb NOT NULL DEFAULT '{}'::jsonb,               -- {vt, side dr|cr|all, min, contra, q, sort}
  "isShared"       boolean NOT NULL DEFAULT false,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "createdBy"      uuid,
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedBy"      uuid,
  "rowVersion"     integer NOT NULL DEFAULT 0,
  CONSTRAINT "savedLedgerViewTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "savedLedgerViewNameUk" UNIQUE ("tenantId", "userId", name),
  CONSTRAINT "savedLedgerViewUserFk" FOREIGN KEY ("tenantId", "userId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "savedLedgerViewAccountFk" FOREIGN KEY ("tenantId", "accountId") REFERENCES "Accounting"."ChartOfAccounts" ("tenantId", id),
  CONSTRAINT "savedLedgerViewDatesChk" CHECK ("dateTo" IS NULL OR "dateFrom" IS NULL OR "dateTo" >= "dateFrom"),
  CONSTRAINT "savedLedgerViewFiltersChk" CHECK (jsonb_typeof(filters) = 'object')
);
SELECT "Company"."addStandardTriggers"('"Accounting"."SavedLedgerViews"');

-- =============================================================================
-- FULL function overrides (CREATE OR REPLACE of the Basic versions above)
-- =============================================================================

-- Posting check adds module-level locks (PeriodModuleLocks).
CREATE OR REPLACE FUNCTION "Accounting"."assertPostingAllowed"("pTenant" uuid, "pDate" date, "pPeriodId" uuid,
                                                      "pModule" text DEFAULT 'GL')
RETURNS void LANGUAGE plpgsql STABLE AS $$
DECLARE
  "vStatus" text;
  "vCode"   text;
  "vLock"   date;
  "vMod"    text;
BEGIN
  SELECT status, code INTO "vStatus", "vCode" FROM "Accounting"."FiscalPeriods"
   WHERE "tenantId" = "pTenant" AND id = "pPeriodId";
  IF "vStatus" IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'Period % is % — postings dated % are blocked', "vCode", lower("vStatus"), "pDate"
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT status INTO "vMod" FROM "Accounting"."PeriodModuleLocks"
   WHERE "tenantId" = "pTenant" AND "fiscalPeriodId" = "pPeriodId" AND "moduleCode" = COALESCE("pModule", 'GL');
  IF "vMod" IN ('CLOSED','LOCKED') THEN
    RAISE EXCEPTION 'Module % is % for period %', COALESCE("pModule", 'GL'), lower("vMod"), "vCode"
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT cp."booksLockDate" INTO "vLock" FROM "Company"."CompanySettings" cp WHERE cp."tenantId" = "pTenant";
  IF "vLock" IS NOT NULL AND "pDate" <= "vLock" THEN
    RAISE EXCEPTION 'Books are locked up to %; cannot post on %', "vLock", "pDate"
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- Line guard adds the multi-branch restriction (AccountBranches) and closed projects.
CREATE OR REPLACE FUNCTION "Accounting"."triggerJournalLineGuard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vStatus"  text;
  "vBranch"  uuid;
  "vAcc"     record;
  "vPstat"   text;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT status INTO "vStatus" FROM "Accounting"."Vouchers"
     WHERE "tenantId" = OLD."tenantId" AND id = OLD."journalEntryId";
    IF "vStatus" IN ('POSTED','REVERSED') THEN
      RAISE EXCEPTION 'Lines of a % voucher cannot be changed', lower("vStatus")
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT status, "branchId" INTO "vStatus", "vBranch" FROM "Accounting"."Vouchers"
   WHERE "tenantId" = NEW."tenantId" AND id = NEW."journalEntryId";
  IF "vStatus" IN ('POSTED','REVERSED') THEN
    RAISE EXCEPTION 'Lines cannot be added to a % voucher', lower("vStatus")
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW."branchId" := COALESCE(NEW."branchId", "vBranch");

  SELECT code, kind, status, "deletedAt", "branchId" INTO "vAcc"
    FROM "Accounting"."ChartOfAccounts" WHERE "tenantId" = NEW."tenantId" AND id = NEW."accountId";
  IF "vAcc".kind IS DISTINCT FROM 'POSTABLE' THEN
    RAISE EXCEPTION 'Account % is a % account; only postable (level 4) accounts take entries',
      COALESCE("vAcc".code, '?'), lower(COALESCE("vAcc".kind, 'unknown')) USING ERRCODE = 'check_violation';
  END IF;
  IF "vAcc".status <> 'ACTIVE' OR "vAcc"."deletedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Account % is inactive', "vAcc".code USING ERRCODE = 'check_violation';
  END IF;
  IF "vAcc"."branchId" IS NOT NULL AND "vAcc"."branchId" <> NEW."branchId" THEN
    RAISE EXCEPTION 'Account % is restricted to another branch', "vAcc".code USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "Accounting"."AccountBranches" ab
              WHERE ab."tenantId" = NEW."tenantId" AND ab."accountId" = NEW."accountId")
     AND NOT EXISTS (SELECT 1 FROM "Accounting"."AccountBranches" ab
                      WHERE ab."tenantId" = NEW."tenantId" AND ab."accountId" = NEW."accountId"
                        AND ab."branchId" = NEW."branchId") THEN
    RAISE EXCEPTION 'Account % is not enabled for this branch', "vAcc".code USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."projectId" IS NOT NULL THEN
    SELECT status INTO "vPstat" FROM "Accounting"."Projects" WHERE "tenantId" = NEW."tenantId" AND id = NEW."projectId";
    IF "vPstat" IN ('COMPLETED','CANCELLED') THEN
      RAISE EXCEPTION 'Project is % and cannot take new postings', lower("vPstat") USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Reversal copies the Full-only line columns too.
CREATE OR REPLACE FUNCTION "Accounting"."voucherReverse"("pEntryId" uuid, "pReversalDate" date, "pReason" text,
                                               "pRemarks" text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vOrig"   record;
  "vType"   text;
  "vNew"    uuid;
BEGIN
  SELECT * INTO "vOrig" FROM "Accounting"."Vouchers"
   WHERE "tenantId" = "vTenant" AND id = "pEntryId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF "vOrig".status <> 'POSTED' THEN
    RAISE EXCEPTION 'Only POSTED vouchers can be reversed (% is %)', "vOrig"."docNo", "vOrig".status
      USING ERRCODE = 'check_violation';
  END IF;
  "vType" := CASE WHEN "vOrig"."voucherType" IN ('SYSTEM','OB') THEN 'JV' ELSE "vOrig"."voucherType" END;

  INSERT INTO "Accounting"."Vouchers"
         ("tenantId", "voucherType", "docNo", "docDate", "postingDate", "referenceNo", "branchId", department,
          "currencyCode", "fxRate", narration, "cashBankAccountId", "partyName", status, "preparedByUserId",
          "sourceDocType", "sourceDocId", "sourceDocNo", "reversalOfId", "reversalReason", "reversalRemarks")
  VALUES ("vTenant", "vType", "Company"."getNextDocNo"("vType", "pReversalDate", "vOrig"."branchId"),
          "pReversalDate", "pReversalDate", "vOrig"."docNo", "vOrig"."branchId", "vOrig".department,
          "vOrig"."currencyCode", "vOrig"."fxRate",
          left('Reversal of ' || "vOrig"."docNo" || ' — ' || "vOrig".narration, 300),
          CASE WHEN "vType" IN ('CPV','CRV','BPV','BRV') THEN "vOrig"."cashBankAccountId" END,
          "vOrig"."partyName", 'DRAFT', "Company"."getCurrentUserId"(),
          "vOrig"."sourceDocType", "vOrig"."sourceDocId", "vOrig"."sourceDocNo",
          "vOrig".id, "pReason", "pRemarks")
  RETURNING id INTO "vNew";

  INSERT INTO "Accounting"."VoucherLines"
         ("tenantId", "journalEntryId", "lineNo", "accountId", particulars, debit, credit,
          "costCentreId", "branchId", "customerId", "vendorId", "isAutoContra",
          "projectId", "employeeId", "allocationRuleId")
  SELECT "tenantId", "vNew", "lineNo", "accountId", particulars, credit, debit,
         "costCentreId", "branchId", "customerId", "vendorId", "isAutoContra",
         "projectId", "employeeId", "allocationRuleId"
    FROM "Accounting"."VoucherLines"
   WHERE "tenantId" = "vTenant" AND "journalEntryId" = "pEntryId";

  UPDATE "Accounting"."Vouchers" SET status = 'POSTED' WHERE "tenantId" = "vTenant" AND id = "vNew";
  UPDATE "Accounting"."Vouchers"
     SET status = 'REVERSED', "reversedById" = "vNew", "reversalDate" = "pReversalDate"
   WHERE "tenantId" = "vTenant" AND id = "pEntryId";
  RETURN "vNew";
END $$;

-- Next scheduled date after pFrom for a recurring template.
CREATE OR REPLACE FUNCTION "Accounting"."getRecurringVoucherNextDate"("pFrom" date, "pFrequency" text, "pRunDay" smallint,
                                                   "pLastDay" boolean, "pWeekday" smallint, "pMonth" smallint)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  "vStep"  int;
  "vMonth" date;
  "vDim"   int;
BEGIN
  IF "pFrequency" = 'NONE' THEN
    RETURN NULL;
  ELSIF "pFrequency" = 'WEEKLY' THEN
    RETURN "pFrom" + ((("pWeekday" - extract(isodow FROM "pFrom")::int + 6) % 7) + 1);
  END IF;
  "vStep" := CASE "pFrequency" WHEN 'MONTHLY' THEN 1 WHEN 'QUARTERLY' THEN 3 ELSE 12 END;
  IF "pFrequency" = 'YEARLY' THEN
    "vMonth" := make_date(extract(year FROM "pFrom")::int, "pMonth", 1);
    IF "vMonth" <= date_trunc('month', "pFrom")::date THEN
      "vMonth" := ("vMonth" + interval '1 year')::date;
    END IF;
  ELSE
    "vMonth" := (date_trunc('month', "pFrom") + make_interval(months => "vStep"))::date;
  END IF;
  "vDim" := extract(day FROM ("vMonth" + interval '1 month' - interval '1 day'))::int;
  RETURN "vMonth" + ((CASE WHEN "pLastDay" THEN "vDim" ELSE LEAST("pRunDay", "vDim") END) - 1);
END $$;

-- Generate (and optionally post) the voucher for one run of a recurring
-- template. Failures are recorded on RecurringVoucherRuns / the template (status
-- FAILED, lastError) instead of aborting the caller ("Run due now").
CREATE OR REPLACE FUNCTION "Accounting"."recurringVoucherTemplateRun"("pTemplateId" uuid, "pRunDate" date DEFAULT current_date,
                                                      "pTrigger" text DEFAULT 'MANUAL')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vT"      record;
  "vJe"     uuid;
  "vN"      integer;
  "vTotal"  numeric(18,2);
  "vNext"   date;
  "vDone"   boolean;
  "vErr"    text;
BEGIN
  SELECT * INTO "vT" FROM "Accounting"."RecurringVoucherTemplates"
   WHERE "tenantId" = "vTenant" AND id = "pTemplateId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurring template not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF "vT".status = 'PAUSED' OR "vT".frequency = 'NONE' THEN
    INSERT INTO "Accounting"."RecurringVoucherRuns" ("tenantId", "recurringTemplateId", "scheduledDate", "triggerType", status, "errorMessage")
    VALUES ("vTenant", "vT".id, "pRunDate", "pTrigger", 'SKIPPED',
            CASE WHEN "vT".frequency = 'NONE' THEN 'Template has no schedule' ELSE 'Template is paused' END);
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO "Accounting"."Vouchers" ("tenantId", "voucherType", "docNo", "docDate", "postingDate", "branchId",
                                   narration, "cashBankAccountId", "partyName", status,
                                   "preparedByUserId", "recurringTemplateId")
    VALUES ("vTenant", "vT"."voucherType", "Company"."getNextDocNo"("vT"."voucherType", "pRunDate", "vT"."branchId"),
            "pRunDate", "pRunDate", "vT"."branchId", "vT".narration, "vT"."cashBankAccountId", "vT"."partyName",
            'DRAFT', "Company"."getCurrentUserId"(), "vT".id)
    RETURNING id INTO "vJe";

    INSERT INTO "Accounting"."VoucherLines" ("tenantId", "journalEntryId", "lineNo", "accountId", particulars, debit, credit,
                                  "costCentreId", "projectId", "branchId", "customerId", "vendorId", "employeeId")
    SELECT "vTenant", "vJe", l."lineNo", l."accountId", l.narration, l.debit, l.credit,
           l."costCentreId", l."projectId", COALESCE(l."branchId", "vT"."branchId"),
           l."customerId", l."vendorId", l."employeeId"
      FROM "Accounting"."RecurringVoucherTemplateLines" l
     WHERE l."tenantId" = "vTenant" AND l."recurringTemplateId" = "vT".id;
    GET DIAGNOSTICS "vN" = ROW_COUNT;

    -- BPV / CPV: the bank or cash credit leg is added automatically
    IF "vT"."voucherType" IN ('BPV','CPV') THEN
      SELECT COALESCE(sum(debit), 0) - COALESCE(sum(credit), 0) INTO "vTotal"
        FROM "Accounting"."VoucherLines" WHERE "tenantId" = "vTenant" AND "journalEntryId" = "vJe";
      INSERT INTO "Accounting"."VoucherLines" ("tenantId", "journalEntryId", "lineNo", "accountId", particulars,
                                    debit, credit, "branchId", "isAutoContra")
      VALUES ("vTenant", "vJe", ("vN" + 1)::smallint, "vT"."cashBankAccountId", "vT".narration,
              0, "vTotal", "vT"."branchId", true);
    END IF;

    IF "vT"."autoPost" THEN
      UPDATE "Accounting"."Vouchers" SET status = 'POSTED' WHERE "tenantId" = "vTenant" AND id = "vJe";
    END IF;
  EXCEPTION WHEN OTHERS THEN
    "vErr" := SQLERRM;
    INSERT INTO "Accounting"."RecurringVoucherRuns" ("tenantId", "recurringTemplateId", "scheduledDate", "triggerType", status, "errorMessage")
    VALUES ("vTenant", "vT".id, "pRunDate", "pTrigger", 'FAILED', "vErr");
    UPDATE "Accounting"."RecurringVoucherTemplates" SET status = 'FAILED', "lastError" = "vErr"
     WHERE "tenantId" = "vTenant" AND id = "vT".id;
    RETURN NULL;
  END;

  INSERT INTO "Accounting"."RecurringVoucherRuns" ("tenantId", "recurringTemplateId", "scheduledDate", "triggerType", status, "journalEntryId")
  VALUES ("vTenant", "vT".id, "pRunDate", "pTrigger", 'SUCCESS', "vJe");

  "vNext" := "Accounting"."getRecurringVoucherNextDate"("pRunDate", "vT".frequency, "vT"."runDay", "vT"."runOnLastDay",
                                    "vT"."runWeekday", "vT"."runMonth");
  "vDone" := ("vT"."endMode" = 'AFTER_N' AND "vT"."occurrencesDone" + 1 >= "vT"."endAfterCount")
         OR ("vT"."endMode" = 'ON_DATE' AND "vNext" > "vT"."endOnDate");
  UPDATE "Accounting"."RecurringVoucherTemplates"
     SET "lastRunDate"    = "pRunDate",
         "occurrencesDone" = "occurrencesDone" + 1,
         "nextRunDate"    = CASE WHEN "vDone" THEN NULL ELSE "vNext" END,
         status           = CASE WHEN "vDone" THEN 'PAUSED' ELSE 'ACTIVE' END,
         "lastError"       = NULL
   WHERE "tenantId" = "vTenant" AND id = "vT".id;
  RETURN "vJe";
END $$;

COMMENT ON FUNCTION "Accounting"."recurringVoucherTemplateRun"(uuid, date, text) IS
  'Creates (and if autoPost, posts) the voucher for one recurring run; records SUCCESS/FAILED/SKIPPED in Accounting.RecurringVoucherRuns.';
