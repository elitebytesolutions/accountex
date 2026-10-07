-- =============================================================================
-- Finsoft ERP (FULL) — 05-fa.sql
-- Fixed assets: categories, asset register, transfers, monthly depreciation
-- runs (-> JV), depreciation schedule (FY projection) and disposals.
--
-- Screens (Full only; src/42-acc-reports.html):
--   app/assets               Fixed Asset Register (+ "New fixed asset" modal)
--   app/assets/view          Asset Detail (+ "Transfer asset" modal)
--   app/assets/depreciation  Run Depreciation (+ "Post depreciation" modal)
--   app/assets/disposals     Asset Disposals (+ "Dispose asset" modal)
--
-- FKs into acc.* (accounts, cost centres, fiscal periods/years, journals),
-- HumanResources.Employees, Purchases.Vendors, Sales.Customers and Tax.TaxCodes are
-- cross-module and live in fk/05-fa-fks.sql.
-- Doc types: FA (asset code FA-0012), DEP (depreciation run), DSP (disposal DSP-2026-0009).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- FixedAssetCategories — category chips/filters (Land & Building, Plant & Machinery,
-- Vehicles, Computers, Furniture) and "Cost by category" panel ("NBV … · WDV
-- 10%", "Land not depreciated"); defaults for the New Asset modal (method, rate,
-- Asset account, Accum. dep. account, Expense account).
-- ---------------------------------------------------------------------------
CREATE TABLE "FixedAssets"."FixedAssetCategories" (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                   uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                        text NOT NULL,                        -- VEH
  name                        text NOT NULL,                        -- Vehicles
  "defaultMethod"              text NOT NULL DEFAULT 'WDV',
  "defaultRatePct"            numeric(7,4) CHECK ("defaultRatePct" > 0 AND "defaultRatePct" <= 100),  -- 20
  "costAccountId"             uuid NOT NULL,                        -- 1105 Vehicles — Cost
  "accumDepAccountId"        uuid,                                 -- 1155 Vehicles — Acc. Dep.
  "depExpenseAccountId"      uuid,                                 -- 6107 Depreciation Expense
  "tagPrefix"                  text,                                 -- ALN-VH- (asset tag "Tag ALN-VH-0012")
  status                      text NOT NULL DEFAULT 'ACTIVE',
  "deletedAt"                  timestamptz,
  "createdAt"                  timestamptz NOT NULL DEFAULT now(),
  "createdBy"                  uuid,
  "updatedAt"                  timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                  uuid,
  "rowVersion"                 integer NOT NULL DEFAULT 0,
  CONSTRAINT "assetCategoryTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "assetCategoryCodeUk" UNIQUE ("tenantId", code),
  CONSTRAINT "assetCategoryNameUk" UNIQUE ("tenantId", name),
  -- depreciable categories need a rate and both depreciation accounts
  CONSTRAINT "assetCategoryMethodChk" CHECK (
       ("defaultMethod" = 'NONE' AND "defaultRatePct" IS NULL)
    OR ("defaultMethod" <> 'NONE' AND "defaultRatePct" IS NOT NULL
        AND "accumDepAccountId" IS NOT NULL AND "depExpenseAccountId" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"FixedAssets"."FixedAssetCategories"', true);

COMMENT ON TABLE "FixedAssets"."FixedAssetCategories" IS 'Asset classes with default depreciation policy and GL accounts (cost / accumulated depreciation / expense).';

-- ---------------------------------------------------------------------------
-- asset — app/assets register (Code, Asset + sub-line, Category, Location,
-- Acquired, Cost, Method, Rate, NBV, Status), "New fixed asset" modal and
-- app/assets/view (header chips: In use · WDV 20% · Insured — EFU till
-- 31 Oct 2026 · Tag ALN-VH-0012; "Asset details" panel).
-- ---------------------------------------------------------------------------
CREATE TABLE "FixedAssets"."FixedAssets" (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                   uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                        text NOT NULL,                        -- "Asset code" FA-0187 (readonly, Company.getNextDocNo('FA'))
  name                        text NOT NULL,                        -- "Asset name *" Toyota Hilux Revo 2.8 V
  description                 text,                                 -- register sub-line "LEB-21-4587 · Chassis …", "Plot 14-B, 2 kanal"
  "categoryId"                 uuid NOT NULL,                        -- "Category *"
  "branchId"                   uuid NOT NULL,                        -- "Location" (Lahore HQ / Karachi / …)
  "custodianEmployeeId"       uuid,                                 -- "Custodian" (FK → HumanResources.Employees in fk file)
  "costCentreId"              uuid,                                 -- "Cost centre: Operations"
  "tagNo"                      text,                                 -- "Tag ALN-VH-0012" ("Print tag")
  "serialNo"                   text,                                 -- "Serial 74120988"
  "acquisitionDate"            date NOT NULL,                        -- "Acquisition date" / "Acquired"
  cost                        numeric(18,2) NOT NULL CHECK (cost > 0),  -- "Cost (Rs) *"
  "sourceDocType"             text REFERENCES "Company"."DocumentTypes"(code),  -- "Source document" BILL
  "sourceDocId"               uuid,
  "sourceDocNo"               text,                                 -- BILL-2023-000614
  "vendorId"                   uuid,                                 -- "Supplier: Toyota Garden Motors" (FK in fk file)
  method                      text NOT NULL,  -- "Method"
  "ratePct"                    numeric(7,4) CHECK ("ratePct" > 0 AND "ratePct" <= 100), -- "Rate % p.a."
  "residualValue"              numeric(18,2) NOT NULL DEFAULT 0 CHECK ("residualValue" >= 0),  -- "Residual value"
  "chargeFullMonthOnPurchase" boolean NOT NULL DEFAULT true,     -- "Charge full month in month of purchase"
  "costAccountId"             uuid NOT NULL,                        -- "Asset account" 1105 Vehicles — Cost
  "accumDepAccountId"        uuid,                                 -- "Accum. dep. account" 1155
  "depExpenseAccountId"      uuid,                                 -- "Expense account" 6107
  "accumulatedDepreciation"    numeric(18,2) NOT NULL DEFAULT 0 CHECK ("accumulatedDepreciation" >= 0),  -- "Accumulated dep."
  nbv                         numeric(18,2) GENERATED ALWAYS AS (cost - "accumulatedDepreciation") STORED,  -- "Net Book Value"
  "depreciatedThrough"         date,                                 -- last posted depreciation period end
  "taxWdv"                     numeric(18,2) CHECK ("taxWdv" >= 0),   -- "Tax WDV (ITO 2001)"
  "registrationNo"             text,                                 -- LEB-21-4587
  "engineNo"                   text,                                 -- "Engine / Chassis" 1GD-4501182
  "chassisNo"                  text,                                 -- KUN126-0038812
  insurer                     text,                                 -- "Insured — EFU"
  "insurancePolicyNo"         text,
  "insurancePremium"           numeric(18,2) CHECK ("insurancePremium" >= 0),  -- "premium Rs 228,000"
  "insuranceExpiry"            date,                                 -- "till 31 Oct 2026" / "Insurance expiring" alert
  "lastVerifiedOn"            date,                                 -- "Physical verification due · last count 12 Dec 2025"
  status                      text NOT NULL DEFAULT 'NEW',
  "disposedOn"                 date,
  "capitalisedByUserId"      uuid,                                 -- History "Capitalised · Hira Ali · 15 Aug 2023"
  "deletedAt"                  timestamptz,
  "createdAt"                  timestamptz NOT NULL DEFAULT now(),
  "createdBy"                  uuid,
  "updatedAt"                  timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                  uuid,
  "rowVersion"                 integer NOT NULL DEFAULT 0,
  CONSTRAINT "assetTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "assetCodeUk" UNIQUE ("tenantId", code),
  CONSTRAINT "assetCategoryFk" FOREIGN KEY ("tenantId", "categoryId") REFERENCES "FixedAssets"."FixedAssetCategories" ("tenantId", id),
  CONSTRAINT "assetBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "assetCapitalisedByFk" FOREIGN KEY ("tenantId", "capitalisedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "assetCodeChk" CHECK (code ~ '^FA-[0-9]{4,6}$'),
  CONSTRAINT "assetSourcePairChk" CHECK (("sourceDocType" IS NULL) = ("sourceDocId" IS NULL)),
  CONSTRAINT "assetMethodChk" CHECK (
       (method = 'NONE' AND "ratePct" IS NULL)
    OR (method <> 'NONE' AND "ratePct" IS NOT NULL AND "accumDepAccountId" IS NOT NULL AND "depExpenseAccountId" IS NOT NULL)),
  CONSTRAINT "assetResidualChk" CHECK ("residualValue" < cost),
  CONSTRAINT "assetAccumChk" CHECK ("accumulatedDepreciation" <= cost - "residualValue"),
  CONSTRAINT "assetDisposedChk" CHECK ((status = 'DISPOSED') = ("disposedOn" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"FixedAssets"."FixedAssets"', true);
CREATE UNIQUE INDEX "assetTagUk" ON "FixedAssets"."FixedAssets" ("tenantId", "tagNo") WHERE "tagNo" IS NOT NULL;
CREATE INDEX "assetCategoryIdx"  ON "FixedAssets"."FixedAssets" ("tenantId", "categoryId", status) WHERE "deletedAt" IS NULL;
CREATE INDEX "assetBranchIdx"    ON "FixedAssets"."FixedAssets" ("tenantId", "branchId", status) WHERE "deletedAt" IS NULL;
CREATE INDEX "assetCustodianIdx" ON "FixedAssets"."FixedAssets" ("tenantId", "custodianEmployeeId") WHERE "custodianEmployeeId" IS NOT NULL;
CREATE INDEX "assetInsuranceIdx" ON "FixedAssets"."FixedAssets" ("tenantId", "insuranceExpiry") WHERE "insuranceExpiry" IS NOT NULL AND status <> 'DISPOSED';
CREATE INDEX "assetSearchTrgmIdx" ON "FixedAssets"."FixedAssets" USING gin ((code || ' ' || name || ' ' || COALESCE("serialNo", '') || ' ' || COALESCE("tagNo", '')) gin_trgm_ops);  -- "Search code, name, serial or tag…"

COMMENT ON TABLE  "FixedAssets"."FixedAssets" IS 'Fixed asset register. NBV = cost - accumulatedDepreciation; accumulated depreciation is advanced only by posted depreciation runs (FixedAssets.depreciationRunPost).';
COMMENT ON COLUMN "FixedAssets"."FixedAssets".method IS 'WDV = written down value (rate on opening NBV), SLM = straight line (rate on cost), NONE = not depreciated (land).';

-- ---------------------------------------------------------------------------
-- AssetTransfers — "Transfer asset" modal (From location, To location *, New
-- custodian, Effective date, Reason; "Transfer request sent for approval") and
-- History "Transferred Karachi → Lahore HQ · Custodian Kashif Ali → Usman Ali".
-- ---------------------------------------------------------------------------
CREATE TABLE "FixedAssets"."AssetTransfers" (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                   uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "assetId"                    uuid NOT NULL,
  "fromBranchId"              uuid NOT NULL,                        -- "From location" (readonly)
  "toBranchId"                uuid NOT NULL,                        -- "To location *"
  "fromCustodianEmployeeId"  uuid,
  "toCustodianEmployeeId"    uuid,                                 -- "New custodian"
  "effectiveDate"              date NOT NULL,                        -- "Effective date"
  reason                      text,                                 -- "Reason"
  status                      text NOT NULL DEFAULT 'PENDING_APPROVAL',
  "requestedByUserId"        uuid,
  "approvedByUserId"         uuid,
  "approvedAt"                 timestamptz,
  "completedAt"                timestamptz,
  "createdAt"                  timestamptz NOT NULL DEFAULT now(),
  "createdBy"                  uuid,
  "updatedAt"                  timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                  uuid,
  "rowVersion"                 integer NOT NULL DEFAULT 0,
  CONSTRAINT "assetTransferTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "assetTransferAssetFk" FOREIGN KEY ("tenantId", "assetId") REFERENCES "FixedAssets"."FixedAssets" ("tenantId", id),
  CONSTRAINT "assetTransferFromFk" FOREIGN KEY ("tenantId", "fromBranchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "assetTransferToFk" FOREIGN KEY ("tenantId", "toBranchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "assetTransferRequestedByFk" FOREIGN KEY ("tenantId", "requestedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "assetTransferApprovedByFk" FOREIGN KEY ("tenantId", "approvedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "assetTransferMoveChk" CHECK ("fromBranchId" <> "toBranchId"
                                            OR "toCustodianEmployeeId" IS DISTINCT FROM "fromCustodianEmployeeId"),
  CONSTRAINT "assetTransferApprovedChk" CHECK (status NOT IN ('APPROVED','COMPLETED') OR "approvedAt" IS NOT NULL),
  CONSTRAINT "assetTransferCompletedChk" CHECK ((status = 'COMPLETED') = ("completedAt" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"FixedAssets"."AssetTransfers"', true);
CREATE INDEX "assetTransferAssetIdx" ON "FixedAssets"."AssetTransfers" ("tenantId", "assetId", "effectiveDate" DESC);
CREATE UNIQUE INDEX "assetTransferOneOpenUk" ON "FixedAssets"."AssetTransfers" ("tenantId", "assetId")
  WHERE status IN ('PENDING_APPROVAL','APPROVED');

-- Completing a transfer moves the asset (location + custodian).
CREATE OR REPLACE FUNCTION "FixedAssets"."triggerAssetTransferApply"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND (TG_OP = 'INSERT' OR OLD.status <> 'COMPLETED') THEN
    UPDATE "FixedAssets"."FixedAssets"
       SET "branchId" = NEW."toBranchId",
           "custodianEmployeeId" = COALESCE(NEW."toCustodianEmployeeId", "custodianEmployeeId")
     WHERE "tenantId" = NEW."tenantId" AND id = NEW."assetId" AND status <> 'DISPOSED';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Asset is disposed or missing; transfer cannot complete' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "assetTransferApply" AFTER INSERT OR UPDATE OF status ON "FixedAssets"."AssetTransfers"
  FOR EACH ROW EXECUTE FUNCTION "FixedAssets"."triggerAssetTransferApply"();

-- ---------------------------------------------------------------------------
-- DepreciationRuns — app/assets/depreciation filters (Period, Branch, Category,
-- Posting date), KPIs (Assets in run 177 · 9 fully depreciated skipped ·
-- Depreciation Rs 520,000 · NBV after posting), "Recompute", "Last computed
-- 01 Oct 2026 09:15 by Hira Ali", journal preview JV-2026-000412 (Draft),
-- "Post depreciation" modal (email summary), Run history.
-- ---------------------------------------------------------------------------
CREATE TABLE "FixedAssets"."DepreciationRuns" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                text NOT NULL,                              -- Company.getNextDocNo('DEP')
  "fiscalPeriodId"      uuid NOT NULL,                              -- "Period: SEP-2026 (01–30 Sep 2026)"
  "postingDate"          date NOT NULL,                              -- "Posting date"
  "branchId"             uuid,                                       -- "Branch" (NULL = All branches)
  "categoryId"           uuid,                                       -- "Category" (NULL = All categories)
  status                text NOT NULL DEFAULT 'DRAFT',
  "assetsCount"          integer NOT NULL DEFAULT 0 CHECK ("assetsCount" >= 0),     -- "Assets in run"
  "skippedCount"         integer NOT NULL DEFAULT 0 CHECK ("skippedCount" >= 0),    -- "9 fully depreciated skipped"
  "totalDepreciation"    numeric(18,2) NOT NULL DEFAULT 0 CHECK ("totalDepreciation" >= 0),  -- "Depreciation — Sep"
  "nbvBefore"            numeric(18,2),                              -- "From Rs 96,790,000"
  "nbvAfter"             numeric(18,2),                              -- "NBV after posting"
  "computedAt"           timestamptz,                                -- "Last computed …"
  "computedByUserId"   uuid,
  "emailSummary"         boolean NOT NULL DEFAULT true,              -- "Email summary to Sana Javed (Finance Manager)"
  "notifyUserId"        uuid,
  "journalEntryId"      uuid,                                       -- JV-2026-000412
  "postedAt"             timestamptz,
  "postedByUserId"     uuid,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  CONSTRAINT "depreciationRunTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "depreciationRunPeriodUk" UNIQUE ("tenantId", id, "fiscalPeriodId"),   -- target for run_line composite FK
  CONSTRAINT "depreciationRunDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "depreciationRunBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "depreciationRunCategoryFk" FOREIGN KEY ("tenantId", "categoryId") REFERENCES "FixedAssets"."FixedAssetCategories" ("tenantId", id),
  CONSTRAINT "depreciationRunComputedByFk" FOREIGN KEY ("tenantId", "computedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "depreciationRunNotifyFk" FOREIGN KEY ("tenantId", "notifyUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "depreciationRunPostedByFk" FOREIGN KEY ("tenantId", "postedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "depreciationRunPostedChk" CHECK ((status = 'POSTED') = ("journalEntryId" IS NOT NULL AND "postedAt" IS NOT NULL)),
  CONSTRAINT "depreciationRunNbvChk" CHECK ("nbvBefore" IS NULL OR "nbvAfter" IS NULL
                                             OR "nbvAfter" = "nbvBefore" - "totalDepreciation")
);
SELECT "Company"."addStandardTriggers"('"FixedAssets"."DepreciationRuns"', true);
CREATE INDEX "depreciationRunPeriodIdx" ON "FixedAssets"."DepreciationRuns" ("tenantId", "fiscalPeriodId", status);

COMMENT ON TABLE "FixedAssets"."DepreciationRuns" IS 'Monthly depreciation computation for a period (optionally one branch/category). Posting creates one JV (Dr expense / Cr accumulated depreciation per category).';

-- DepreciationRunLines — "Computed depreciation — SEP-2026" (Asset / Category,
-- Method, Opening NBV, Charge, Closing NBV; grouped by category with subtotals)
CREATE TABLE "FixedAssets"."DepreciationRunLines" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "depreciationRunId"   uuid NOT NULL,
  "fiscalPeriodId"      uuid NOT NULL,                              -- = run period (composite FK) — one charge per asset per period
  "assetId"              uuid NOT NULL,
  "categoryId"           uuid NOT NULL,
  "branchId"             uuid NOT NULL,
  "costCentreId"        uuid,                                       -- "Cost centre split by branch"
  method                text NOT NULL,   -- "WDV 10%"
  "ratePct"              numeric(7,4) NOT NULL CHECK ("ratePct" > 0 AND "ratePct" <= 100),
  months                numeric(5,2) NOT NULL DEFAULT 1 CHECK (months > 0 AND months <= 1),  -- proration within the month
  "openingNbv"           numeric(18,2) NOT NULL CHECK ("openingNbv" >= 0),   -- "Opening NBV"
  charge                numeric(18,2) NOT NULL CHECK (charge > 0),         -- "Charge"
  "closingNbv"           numeric(18,2) GENERATED ALWAYS AS ("openingNbv" - charge) STORED,  -- "Closing NBV"
  "expenseAccountId"    uuid NOT NULL,                              -- 6107 Depreciation Expense
  "accumDepAccountId"  uuid NOT NULL,                              -- 1155 Acc. Dep. — Vehicles
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  CONSTRAINT "depreciationRunLineTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "depreciationRunLineAssetPeriodUk" UNIQUE ("tenantId", "assetId", "fiscalPeriodId"),   -- never depreciate twice
  CONSTRAINT "depreciationRunLineRunFk" FOREIGN KEY ("tenantId", "depreciationRunId", "fiscalPeriodId")
      REFERENCES "FixedAssets"."DepreciationRuns" ("tenantId", id, "fiscalPeriodId") ON DELETE CASCADE,
  CONSTRAINT "depreciationRunLineAssetFk" FOREIGN KEY ("tenantId", "assetId") REFERENCES "FixedAssets"."FixedAssets" ("tenantId", id),
  CONSTRAINT "depreciationRunLineCategoryFk" FOREIGN KEY ("tenantId", "categoryId") REFERENCES "FixedAssets"."FixedAssetCategories" ("tenantId", id),
  CONSTRAINT "depreciationRunLineBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "depreciationRunLineChargeChk" CHECK (charge <= "openingNbv")
);
SELECT "Company"."addStandardTriggers"('"FixedAssets"."DepreciationRunLines"', true);
CREATE INDEX "depreciationRunLineRunIdx" ON "FixedAssets"."DepreciationRunLines" ("tenantId", "depreciationRunId", "categoryId");

-- lines are frozen once the run is POSTED; a CANCELLED run releases its lines by deleting them
CREATE OR REPLACE FUNCTION "FixedAssets"."triggerDepreciationRunLineGuard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vStatus" text;
BEGIN
  SELECT status INTO "vStatus" FROM "FixedAssets"."DepreciationRuns"
   WHERE "tenantId" = COALESCE(NEW."tenantId", OLD."tenantId")
     AND id = COALESCE(NEW."depreciationRunId", OLD."depreciationRunId");
  IF "vStatus" = 'POSTED' THEN
    RAISE EXCEPTION 'Depreciation run is posted; lines cannot change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF "vStatus" = 'CANCELLED' THEN
    RAISE EXCEPTION 'Depreciation run is cancelled' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "depreciationRunLineGuard" BEFORE INSERT OR UPDATE OR DELETE ON "FixedAssets"."DepreciationRunLines"
  FOR EACH ROW EXECUTE FUNCTION "FixedAssets"."triggerDepreciationRunLineGuard"();

-- ---------------------------------------------------------------------------
-- DepreciationSchedules — Asset Detail "Depreciation schedule" (Fiscal year,
-- Opening NBV, Months "3 / 12", Depreciation, Accumulated, Closing NBV, Status
-- Locked / Sep pending / Projected) and the NBV chart (actual vs projected).
-- One row per asset per fiscal year; refreshed by the depreciation engine.
-- ---------------------------------------------------------------------------
CREATE TABLE "FixedAssets"."DepreciationSchedules" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "assetId"           uuid NOT NULL,
  "fiscalYearId"     uuid NOT NULL,                                 -- FY 2026-27
  "openingNbv"        numeric(18,2) NOT NULL CHECK ("openingNbv" >= 0),
  months             smallint NOT NULL CHECK (months BETWEEN 0 AND 12),          -- 12 (11 in the year of purchase)
  "monthsPosted"      smallint NOT NULL DEFAULT 0 CHECK ("monthsPosted" BETWEEN 0 AND 12),  -- "3 / 12"
  depreciation       numeric(18,2) NOT NULL CHECK (depreciation >= 0),
  accumulated        numeric(18,2) NOT NULL CHECK (accumulated >= 0),
  "closingNbv"        numeric(18,2) GENERATED ALWAYS AS ("openingNbv" - depreciation) STORED,
  status             text NOT NULL,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  CONSTRAINT "depreciationScheduleTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "depreciationScheduleUk" UNIQUE ("tenantId", "assetId", "fiscalYearId"),
  CONSTRAINT "depreciationScheduleAssetFk" FOREIGN KEY ("tenantId", "assetId") REFERENCES "FixedAssets"."FixedAssets" ("tenantId", id),
  CONSTRAINT "depreciationScheduleMonthsChk" CHECK ("monthsPosted" <= months),
  CONSTRAINT "depreciationScheduleDepChk" CHECK (depreciation <= "openingNbv"),
  CONSTRAINT "depreciationScheduleLockedChk" CHECK (status <> 'LOCKED' OR "monthsPosted" = months)
);
SELECT "Company"."addStandardTriggers"('"FixedAssets"."DepreciationSchedules"');
CREATE INDEX "depreciationScheduleYearIdx" ON "FixedAssets"."DepreciationSchedules" ("tenantId", "fiscalYearId", status);

-- ---------------------------------------------------------------------------
-- AssetDisposals — app/assets/disposals (Disposal #, Asset, Date, Type, Buyer,
-- Cost, Acc. Dep., NBV, Proceeds, Gain / (Loss), Status) and "Dispose asset"
-- modal (Asset *, Disposal type, Disposal date, Buyer, Sale proceeds *, GST on
-- sale, Receive into; computed result "Gain on disposal → 4910 Other Income").
-- ---------------------------------------------------------------------------
CREATE TABLE "FixedAssets"."AssetDisposals" (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                   uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                      text NOT NULL,                        -- DSP-2026-0009
  "assetId"                    uuid NOT NULL,                        -- "Asset *"
  "disposalDate"               date NOT NULL,                        -- "Disposal date"
  "disposalType"               text NOT NULL,  -- Sold/Scrapped/Written off/Trade-in
  "buyerName"                  text,                                 -- "Buyer" (Faisalabad Motors / Ali Haider (employee))
  "customerId"                 uuid,                                 -- optional AR party when sold on credit (FK in fk file)
  cost                        numeric(18,2) NOT NULL CHECK (cost > 0),                       -- "Original cost"
  "accumulatedDepreciation"    numeric(18,2) NOT NULL CHECK ("accumulatedDepreciation" >= 0),  -- "Accumulated depreciation to 30 Sep 2026"
  nbv                         numeric(18,2) GENERATED ALWAYS AS (cost - "accumulatedDepreciation") STORED,  -- "Net book value"
  proceeds                    numeric(18,2) NOT NULL DEFAULT 0 CHECK (proceeds >= 0),        -- "Sale proceeds (excl. GST)"
  "taxCodeId"                 uuid,                                 -- "GST on sale: GST 18% / Exempt" (FK in fk file)
  "gstRate"                    numeric(7,4) NOT NULL DEFAULT 0 CHECK ("gstRate" >= 0 AND "gstRate" <= 100),
  "gstAmount"                  numeric(18,2) NOT NULL DEFAULT 0 CHECK ("gstAmount" >= 0),      -- "Rs 243,000"
  "gainLoss"                   numeric(18,2) GENERATED ALWAYS AS (proceeds - (cost - "accumulatedDepreciation")) STORED,  -- "Gain / (Loss)"
  "receiveIntoAccountId"     uuid,                                 -- "Receive into: Meezan Bank — 0123 / Cash in hand"
  "gainAccountId"             uuid,                                 -- 4910 Other Income / 4210-02 Gain on Disposal
  "lossAccountId"             uuid,                                 -- loss on disposal expense
  "outputTaxAccountId"       uuid,                                 -- Sales Tax Payable (GST on sale)
  status                      text NOT NULL DEFAULT 'DRAFT',
  "submittedAt"                timestamptz,                          -- "Submit for approval"
  "approvedByUserId"         uuid,
  "approvedAt"                 timestamptz,
  "journalEntryId"            uuid,                                 -- derecognition journal
  "postedAt"                   timestamptz,
  remarks                     text,
  "createdAt"                  timestamptz NOT NULL DEFAULT now(),
  "createdBy"                  uuid,
  "updatedAt"                  timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                  uuid,
  "rowVersion"                 integer NOT NULL DEFAULT 0,
  CONSTRAINT "assetDisposalTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "assetDisposalDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "assetDisposalAssetFk" FOREIGN KEY ("tenantId", "assetId") REFERENCES "FixedAssets"."FixedAssets" ("tenantId", id),
  CONSTRAINT "assetDisposalApprovedByFk" FOREIGN KEY ("tenantId", "approvedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "assetDisposalAccumChk" CHECK ("accumulatedDepreciation" <= cost),
  CONSTRAINT "assetDisposalWriteoffChk" CHECK ("disposalType" <> 'WRITTEN_OFF' OR (proceeds = 0 AND "gstAmount" = 0)),
  CONSTRAINT "assetDisposalReceiveChk" CHECK (proceeds + "gstAmount" = 0 OR "receiveIntoAccountId" IS NOT NULL),
  CONSTRAINT "assetDisposalGstChk" CHECK ("gstAmount" = 0 OR proceeds > 0),
  CONSTRAINT "assetDisposalGstAccountChk" CHECK ("gstAmount" = 0 OR "outputTaxAccountId" IS NOT NULL),
  CONSTRAINT "assetDisposalSubmittedChk" CHECK (status <> 'PENDING_APPROVAL' OR "submittedAt" IS NOT NULL),
  CONSTRAINT "assetDisposalPostedChk" CHECK (status <> 'POSTED' OR ("journalEntryId" IS NOT NULL AND "postedAt" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"FixedAssets"."AssetDisposals"', true);
CREATE INDEX "assetDisposalDateIdx" ON "FixedAssets"."AssetDisposals" ("tenantId", "disposalDate" DESC, "disposalType");
CREATE INDEX "assetDisposalStatusIdx" ON "FixedAssets"."AssetDisposals" ("tenantId", status);
CREATE UNIQUE INDEX "assetDisposalOneLiveUk" ON "FixedAssets"."AssetDisposals" ("tenantId", "assetId") WHERE status <> 'CANCELLED';

COMMENT ON TABLE "FixedAssets"."AssetDisposals" IS 'Asset derecognition: sale, scrap, write-off or trade-in. gainLoss = proceeds - NBV; posting writes one journal and marks the asset DISPOSED.';

-- posted disposals are frozen
CREATE OR REPLACE FUNCTION "FixedAssets"."triggerAssetDisposalGuard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vKeep" text[] := ARRAY['updatedAt','updatedBy','rowVersion'];
BEGIN
  -- a posted disposal can only be cancelled (its journal is reversed by the Cancel action)
  IF TG_OP = 'UPDATE' AND OLD.status IN ('POSTED','CANCELLED')
     AND NOT (OLD.status = 'POSTED' AND NEW.status = 'CANCELLED')
     AND (to_jsonb(NEW) - "vKeep") IS DISTINCT FROM (to_jsonb(OLD) - "vKeep") THEN
    RAISE EXCEPTION 'Disposal % is % and cannot be changed', OLD."docNo", lower(OLD.status)
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status = 'PENDING_APPROVAL' THEN
    NEW."submittedAt" := COALESCE(NEW."submittedAt", now());
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "assetDisposalGuard" BEFORE INSERT OR UPDATE ON "FixedAssets"."AssetDisposals"
  FOR EACH ROW EXECUTE FUNCTION "FixedAssets"."triggerAssetDisposalGuard"();

-- =============================================================================
-- Posting functions
-- =============================================================================

-- "Post journal" (Run Depreciation): one JV, Dr expense per account/branch/cost
-- centre, Cr accumulated depreciation per account/branch; advances each asset's
-- accumulated depreciation; NEW -> IN_USE; NBV <= residual -> FULLY_DEPRECIATED.
CREATE OR REPLACE FUNCTION "FixedAssets"."depreciationRunPost"("pRunId" uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRun"    record;
  "vBranch" uuid;
  "vJe"     uuid;
  "vN"      integer;
  "vTotal"  numeric(18,2);
BEGIN
  SELECT r.*, p.code AS "periodCode" INTO "vRun"
    FROM "FixedAssets"."DepreciationRuns" r
    JOIN "Accounting"."FiscalPeriods" p ON p."tenantId" = r."tenantId" AND p.id = r."fiscalPeriodId"
   WHERE r."tenantId" = "vTenant" AND r.id = "pRunId"
     FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Depreciation run not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRun".status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Depreciation run % is %', "vRun"."docNo", "vRun".status USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(sum(charge), 0) INTO "vTotal"
    FROM "FixedAssets"."DepreciationRunLines" WHERE "tenantId" = "vTenant" AND "depreciationRunId" = "pRunId";
  IF "vTotal" <= 0 THEN
    RAISE EXCEPTION 'Depreciation run % has no charge to post', "vRun"."docNo" USING ERRCODE = 'check_violation';
  END IF;

  -- header branch: the run's branch, else the branch carrying the largest charge
  "vBranch" := "vRun"."branchId";
  IF "vBranch" IS NULL THEN
    SELECT "branchId" INTO "vBranch" FROM "FixedAssets"."DepreciationRunLines"
     WHERE "tenantId" = "vTenant" AND "depreciationRunId" = "pRunId"
     GROUP BY "branchId" ORDER BY sum(charge) DESC LIMIT 1;
  END IF;

  INSERT INTO "Accounting"."Vouchers" ("tenantId", "voucherType", "docNo", "docDate", "postingDate", "fiscalPeriodId",
                                 "branchId", narration, status, "preparedByUserId",
                                 "sourceDocType", "sourceDocId", "sourceDocNo")
  VALUES ("vTenant", 'JV', "Company"."getNextDocNo"('JV', "vRun"."postingDate", NULL), "vRun"."postingDate", "vRun"."postingDate",
          "vRun"."fiscalPeriodId", "vBranch", 'Depreciation run — ' || "vRun"."periodCode",
          'DRAFT', "Company"."getCurrentUserId"(), 'DEP', "vRun".id, "vRun"."docNo")
  RETURNING id INTO "vJe";

  INSERT INTO "Accounting"."VoucherLines" ("tenantId", "journalEntryId", "lineNo", "accountId", particulars,
                                debit, credit, "costCentreId", "branchId")
  SELECT "vTenant", "vJe", (row_number() OVER (ORDER BY g.side, g."accountId", g."branchId"))::smallint,
         g."accountId", g.particulars, g.dr, g.cr, g."costCentreId", g."branchId"
    FROM (SELECT 1 AS side, l."expenseAccountId" AS "accountId", l."branchId", l."costCentreId",
                 'Depreciation — ' || "vRun"."periodCode" AS particulars, sum(l.charge) AS dr, 0::numeric AS cr
            FROM "FixedAssets"."DepreciationRunLines" l
           WHERE l."tenantId" = "vTenant" AND l."depreciationRunId" = "pRunId"
           GROUP BY l."expenseAccountId", l."branchId", l."costCentreId"
          UNION ALL
          SELECT 2, l."accumDepAccountId", l."branchId", NULL::uuid,
                 'Accumulated depreciation — ' || "vRun"."periodCode", 0::numeric, sum(l.charge)
            FROM "FixedAssets"."DepreciationRunLines" l
           WHERE l."tenantId" = "vTenant" AND l."depreciationRunId" = "pRunId"
           GROUP BY l."accumDepAccountId", l."branchId") g;
  GET DIAGNOSTICS "vN" = ROW_COUNT;

  UPDATE "Accounting"."Vouchers" SET status = 'POSTED' WHERE "tenantId" = "vTenant" AND id = "vJe";

  UPDATE "FixedAssets"."FixedAssets" a
     SET "accumulatedDepreciation" = a."accumulatedDepreciation" + l.charge,
         "depreciatedThrough"      = p."endDate",
         status = CASE WHEN a.cost - (a."accumulatedDepreciation" + l.charge) <= a."residualValue" THEN 'FULLY_DEPRECIATED'
                       WHEN a.status = 'NEW' THEN 'IN_USE'
                       ELSE a.status END
    FROM "FixedAssets"."DepreciationRunLines" l
    JOIN "Accounting"."FiscalPeriods" p ON p."tenantId" = l."tenantId" AND p.id = l."fiscalPeriodId"
   WHERE l."tenantId" = "vTenant" AND l."depreciationRunId" = "pRunId"
     AND a."tenantId" = l."tenantId" AND a.id = l."assetId";

  UPDATE "FixedAssets"."DepreciationRuns"
     SET status = 'POSTED', "journalEntryId" = "vJe", "postedAt" = now(),
         "postedByUserId" = "Company"."getCurrentUserId"(), "totalDepreciation" = "vTotal"
   WHERE "tenantId" = "vTenant" AND id = "pRunId";
  RETURN "vJe";
END $$;

COMMENT ON FUNCTION "FixedAssets"."depreciationRunPost"(uuid) IS
  'Posts a DRAFT depreciation run as one JV (source DEP) and advances asset accumulated depreciation.';

-- "Dispose asset" posting: derecognise cost and accumulated depreciation, book
-- proceeds (+ output GST) and the gain or loss; asset -> DISPOSED.
CREATE OR REPLACE FUNCTION "FixedAssets"."assetDisposalPost"("pDisposalId" uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vD"      record;
  "vA"      record;
  "vJe"     uuid;
  "vGl"     numeric(18,2);
BEGIN
  SELECT * INTO "vD" FROM "FixedAssets"."AssetDisposals"
   WHERE "tenantId" = "vTenant" AND id = "pDisposalId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Disposal not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF "vD".status NOT IN ('DRAFT','PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'Disposal % is %', "vD"."docNo", "vD".status USING ERRCODE = 'check_violation';
  END IF;
  IF "vD".status = 'PENDING_APPROVAL' AND "vD"."approvedByUserId" IS NULL THEN
    RAISE EXCEPTION 'Disposal % is awaiting approval', "vD"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO "vA" FROM "FixedAssets"."FixedAssets" WHERE "tenantId" = "vTenant" AND id = "vD"."assetId" FOR UPDATE;
  IF "vA".status = 'DISPOSED' THEN
    RAISE EXCEPTION 'Asset % is already disposed', "vA".code USING ERRCODE = 'check_violation';
  END IF;
  IF "vA".cost <> "vD".cost OR "vA"."accumulatedDepreciation" <> "vD"."accumulatedDepreciation" THEN
    RAISE EXCEPTION 'Asset % cost/depreciation changed since the disposal was computed; recompute it', "vA".code
      USING ERRCODE = 'check_violation';
  END IF;
  "vGl" := "vD".proceeds - ("vD".cost - "vD"."accumulatedDepreciation");
  IF "vGl" > 0 AND "vD"."gainAccountId" IS NULL OR "vGl" < 0 AND "vD"."lossAccountId" IS NULL THEN
    RAISE EXCEPTION 'Choose the gain/loss on disposal account' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO "Accounting"."Vouchers" ("tenantId", "voucherType", "docNo", "docDate", "postingDate", "branchId",
                                 narration, status, "preparedByUserId", "sourceDocType", "sourceDocId", "sourceDocNo")
  VALUES ("vTenant", 'JV', "Company"."getNextDocNo"('JV', "vD"."disposalDate", NULL), "vD"."disposalDate", "vD"."disposalDate",
          "vA"."branchId", left('Disposal ' || "vD"."docNo" || ' — ' || "vA".code || ' ' || "vA".name, 300),
          'DRAFT', "Company"."getCurrentUserId"(), 'DSP', "vD".id, "vD"."docNo")
  RETURNING id INTO "vJe";

  INSERT INTO "Accounting"."VoucherLines" ("tenantId", "journalEntryId", "lineNo", "accountId", particulars,
                                debit, credit, "costCentreId", "branchId", "customerId")
  SELECT "vTenant", "vJe", (row_number() OVER (ORDER BY x.ord))::smallint, x."accountId", x.particulars,
         x.dr, x.cr, "vA"."costCentreId", "vA"."branchId", x."customerId"
    FROM (VALUES
            (1, "vD"."receiveIntoAccountId", 'Sale proceeds' || COALESCE(' — ' || "vD"."buyerName", ''),
                "vD".proceeds + "vD"."gstAmount", 0::numeric, "vD"."customerId"),
            (2, "vA"."accumDepAccountId", 'Accumulated depreciation written back',
                "vD"."accumulatedDepreciation", 0::numeric, NULL::uuid),
            (3, "vD"."lossAccountId", 'Loss on disposal', GREATEST(-"vGl", 0), 0::numeric, NULL::uuid),
            (4, "vA"."costAccountId", 'Asset cost derecognised', 0::numeric, "vD".cost, NULL::uuid),
            (5, "vD"."outputTaxAccountId", 'Output GST on asset sale', 0::numeric, "vD"."gstAmount", NULL::uuid),
            (6, "vD"."gainAccountId", 'Gain on disposal', 0::numeric, GREATEST("vGl", 0), NULL::uuid)
         ) AS x(ord, "accountId", particulars, dr, cr, "customerId")
   WHERE x.dr > 0 OR x.cr > 0;

  UPDATE "Accounting"."Vouchers" SET status = 'POSTED' WHERE "tenantId" = "vTenant" AND id = "vJe";
  UPDATE "FixedAssets"."FixedAssets" SET status = 'DISPOSED', "disposedOn" = "vD"."disposalDate"
   WHERE "tenantId" = "vTenant" AND id = "vA".id;
  UPDATE "FixedAssets"."AssetDisposals" SET status = 'POSTED', "journalEntryId" = "vJe", "postedAt" = now()
   WHERE "tenantId" = "vTenant" AND id = "pDisposalId";
  RETURN "vJe";
END $$;

COMMENT ON FUNCTION "FixedAssets"."assetDisposalPost"(uuid) IS
  'Posts a disposal: Dr bank/cash (proceeds + GST), Dr accumulated depreciation, Dr loss | Cr asset cost, Cr output GST, Cr gain.';
