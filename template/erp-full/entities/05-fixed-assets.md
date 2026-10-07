# 05 · Fixed Assets — page → entity map (Full)

Schema: `FixedAssets` (`database/schema/05-fa.sql`), cross-module FKs in `database/fk/05-FixedAssets-fks.sql`. Not in Basic.
Screens: 4 — `app/assets`, `app/assets/view`, `app/assets/depreciation`, `app/assets/disposals`. All from `src/42-acc-reports.html`.
Posting rules: `POSTING_RULES.md` §Fixed assets.

---

### Fixed Asset Register — `app/assets`
*Source:* `src/42-acc-reports.html` (section `app/assets`, modal `Reports-new-asset`)
**Purpose.** List every asset with cost, depreciation policy and net book value, and capitalise new assets.
**Tables.** Primary: `FixedAssets.FixedAssets` · Reads: `FixedAssets.FixedAssetCategories`, `Company.Branches`, `HumanResources.Employees`, `Accounting.ChartOfAccounts`, `Purchases.VendorBills` (source document) · Writes: `FixedAssets.FixedAssets`
**Functions.** Save → `FixedAssets.fixedAssetAddUpdate` · Open → `FixedAssets.getFixedAssetInfo`
**Lookups.** `FixedAssets.method` → `FixedAssetMethod` · `FixedAssets.status` → `FixedAssetStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Gross Cost (▲ additions in Q1) | Σ `FixedAssets.FixedAssets.cost` (status ≠ DISPOSED); additions = `acquisitionDate` in range | view `FixedAssets.getFixedAssetRegister` |
| KPI Accumulated Depreciation (Rs 520,000 charged per month) | Σ `accumulatedDepreciation`; last `FixedAssets.DepreciationRuns.totalDepreciation` | |
| KPI Net Book Value (▲ % vs 30 Jun) | Σ `nbv` | |
| KPI Active Assets (4 branches · 9 fully depreciated) | count by `status` | |
| Search code, name, serial or tag | `code`, `name`, `serialNo`, `tagNo` (trigram index) | |
| Category chips (counts) | `categoryId` → `FixedAssets.FixedAssetCategories.name` | |
| Branch select | `branchId` | |
| Code | `FixedAssets.FixedAssets.code` | FA-0012 |
| Asset + sub-line (reg / chassis / plot) | `name`, `description` | |
| Category | `categoryId` | |
| Location | `branchId` | |
| Acquired | `acquisitionDate` | |
| Cost | `cost` | |
| Method (None / SLM / WDV) | `method` | NONE, SLM, WDV |
| Rate | `ratePct` | |
| NBV | `nbv` (generated `cost − accumulatedDepreciation`) | |
| Status (In use, Under repair, New · Q1, Fully depreciated) | `status` | NEW, IN_USE, UNDER_REPAIR, FULLY_DEPRECIATED, DISPOSED |
| Cost by category panel (cost, NBV, method note) | `FixedAssets.getFixedAssetRegister` grouped by category | |
| Needs attention: under repair / insurance expiring / physical verification due | `status = UNDER_REPAIR`; `insuranceExpiry`; `lastVerifiedOn` | |
| Modal: Asset code (readonly FA-0187) | `code` | `Company.getNextDocNo('FA')` |
| Asset name * | `name` | |
| Category * | `categoryId` | defaults method, rate, accounts from `FixedAssets.FixedAssetCategories` |
| Location | `branchId` | |
| Custodian | `custodianEmployeeId` | → `HumanResources.Employees` |
| Acquisition date | `acquisitionDate` | |
| Cost (Rs) * | `cost` | |
| Source document (BILL-2026-000…) | `sourceDocType`, `sourceDocId`, `sourceDocNo` | |
| Method (WDV / SLM / No depreciation) | `method` | |
| Rate % p.a. | `ratePct` | |
| Residual value | `residualValue` | |
| Asset account / Accum. dep. account / Expense account | `costAccountId`, `accumDepAccountId`, `depExpenseAccountId` | |
| Charge full month in month of purchase | `chargeFullMonthOnPurchase` | |

**Statuses.** NEW → IN_USE ⇄ UNDER_REPAIR → FULLY_DEPRECIATED → DISPOSED.
**Actions → effects.** *Save asset* → insert `FixedAssets.FixedAssets` (capitalisation itself is posted by the purchase bill: Dr asset cost / Cr AP; standalone capitalisation via JV) · *Import* → `Company.DataImports` · *Export* · *Run Depreciation* → `app/assets/depreciation`.
**Permission.** `FixedAssets:view`, `FixedAssets:manage` · **Approval.** —

---

### Asset Detail — `app/assets/view`
*Source:* `src/42-acc-reports.html` (section `app/assets/view`, modal `Reports-asset-transfer`)
**Purpose.** One asset's lifecycle: NBV chart, depreciation schedule, details, history, documents; transfer, dispose or edit it.
**Tables.** Primary: `FixedAssets.FixedAssets`, `FixedAssets.DepreciationSchedules`, `FixedAssets.AssetTransfers` · Reads: `FixedAssets.DepreciationRunLines`, `FixedAssets.AssetDisposals`, `Accounting.Vouchers`, `Company.Attachments`, `Company.AuditTrailEntries`, `Purchases.Vendors`, `HumanResources.Employees` · Writes: `FixedAssets.FixedAssets`, `FixedAssets.AssetTransfers`, `Company.Attachments`
**Functions.** Save → `FixedAssets.fixedAssetAddUpdate` · Open → `FixedAssets.getFixedAssetInfo` ‖ Save → `FixedAssets.assetTransferAddUpdate` · Open → `FixedAssets.getAssetTransferInfo` · Actions → `FixedAssets.assetTransferApprove`, `FixedAssets.assetTransferCancel`
**Lookups.** `FixedAssets.method` → `FixedAssetMethod` · `FixedAssets.status` → `FixedAssetStatus` · `AssetTransfers.status` → `AssetTransferStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Title "Toyota Hilux Revo 2.8 V — LEB-21-4587" | `name`, `registrationNo` | |
| FA-0012 · Vehicles · Lahore HQ · Custodian: Usman Ali (Procurement) | `code`, `categoryId`, `branchId`, `custodianEmployeeId` | |
| Chips: In use · WDV 20% · Insured — EFU till 31 Oct 2026 · Tag ALN-VH-0012 | `status`, `method`, `ratePct`, `insurer`, `insuranceExpiry`, `tagNo` | |
| Net Book Value (49.7% of cost) | `nbv`, `cost` | |
| NBV chart (actual to 30 Jun, projected after) | `FixedAssets.DepreciationSchedules.closingNbv` by year | |
| Schedule: Fiscal year, Opening NBV, Months (3 / 12), Depreciation, Accumulated, Closing NBV, Status (Locked / Sep pending / Projected) | `FixedAssets.DepreciationSchedules.fiscalYearId`, `openingNbv`, `monthsPosted` / `months`, `depreciation`, `accumulated`, `closingNbv`, `status` | LOCKED / PENDING / PROJECTED |
| Acquired | `acquisitionDate` | |
| Source BILL-2023-000614 | `sourceDocNo` (+ type/id) | |
| Supplier | `vendorId` | → `Purchases.Vendors` |
| Cost / Accumulated dep. / Residual value | `cost`, `accumulatedDepreciation`, `residualValue` | |
| Engine / Chassis | `engineNo`, `chassisNo` | |
| Asset GL / Accum. GL / Expense GL | `costAccountId`, `accumDepAccountId`, `depExpenseAccountId` | |
| Cost centre | `costCentreId` | |
| Tax WDV (ITO 2001) | `taxWdv` | |
| History: depreciation posted (JV), service, insurance renewed, transferred, capitalised | `FixedAssets.DepreciationRunLines` + journal; `FixedAssets.AssetTransfers`; `Company.AuditTrailEntries`; `insurancePremium`; `capitalisedByUserId` | maintenance/service entries **[simulated]** (no maintenance table on screen besides history) |
| Documents (invoice, registration book, policy, photo) + Upload | `Company.Attachments` (entityType FA) | |
| Transfer modal: From location (readonly), To location *, New custodian, Effective date, Reason | `FixedAssets.AssetTransfers.fromBranchId`, `toBranchId`, `toCustodianEmployeeId`, `effectiveDate`, `reason` | |

**Statuses.** Transfer PENDING_APPROVAL → APPROVED → COMPLETED (asset moved by trigger) · REJECTED / CANCELLED.
**Actions → effects.** *Print tag* → label printer (`tagNo`) · *Transfer* → `FixedAssets.AssetTransfers` ("Transfer request sent for approval") · *Dispose* → `app/assets/disposals` · *Edit* → `FixedAssets.FixedAssets` · *Excel* (schedule export).
**Permission.** `FixedAssets:view`, `FixedAssets:manage`, `FixedAssets:transfer` · **Approval.** asset transfer (`Company.Approvals`).

---

### Run Depreciation — `app/assets/depreciation`
*Source:* `src/42-acc-reports.html` (section `app/assets/depreciation`, modal `Reports-post-dep`)
**Purpose.** Compute the monthly charge for all active assets, review the journal and post it.
**Tables.** Primary: `FixedAssets.DepreciationRuns`, `FixedAssets.DepreciationRunLines` · Reads: `FixedAssets.FixedAssets`, `FixedAssets.FixedAssetCategories`, `Accounting.FiscalPeriods`, `Accounting.ChartOfAccounts` · Writes: run + lines; on post `Accounting.Vouchers` / `Accounting.VoucherLines`, `FixedAssets.FixedAssets` (accumulated depreciation, status), `FixedAssets.DepreciationSchedules`
**Functions.** Save → `FixedAssets.depreciationRunAddUpdate` · Open → `FixedAssets.getDepreciationRunInfo` · Actions → `FixedAssets.depreciationRunPost`, `FixedAssets.depreciationRunCancel`
**Lookups.** `DepreciationRuns.status` → `DraftPostedCancelledStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Period (SEP-2026 (01–30 Sep 2026)) | `DepreciationRuns.fiscalPeriodId` | |
| Branch (All branches …) | `DepreciationRuns.branchId` | NULL = all |
| Category (All categories …) | `DepreciationRuns.categoryId` | NULL = all |
| Posting date | `DepreciationRuns.postingDate` | |
| Recompute · "Last computed 01 Oct 2026, 09:15 AM by Hira Ali · JUL and AUG already posted" | `computedAt`, `computedByUserId`; posted runs of earlier periods | lines rebuilt while DRAFT |
| KPI Assets in run (9 fully depreciated skipped) | `assetsCount`, `skippedCount` | |
| KPI Depreciation — Sep | `totalDepreciation` | |
| KPI YTD after posting | Σ posted runs in the FY + this run | |
| KPI NBV after posting (from …) | `nbvAfter`, `nbvBefore` | |
| Computed table: Asset / Category, Method, Opening NBV, Charge, Closing NBV; category subtotals; total | `DepreciationRunLines.assetId`, `categoryId`, `method`, `ratePct`, `openingNbv`, `charge`, `closingNbv` | one line per asset per period (unique) |
| Journal preview JV-2026-000412 · Draft (Dr 6107 Depreciation Expense "cost centre split by branch"; Cr Acc. Dep. per category) | `expenseAccountId`, `accumDepAccountId`, `costCentreId`, `branchId` aggregated | |
| "Journal is balanced · Period SEP-2026 is open" | posting guard | |
| Run history (AUG-2026 · Rs 520,000 · JV-2026-000331 · posted 31 Aug by Hira Ali) | posted `FixedAssets.DepreciationRuns` (`journalEntryId`, `postedAt`, `postedByUserId`) | |
| Post modal: Period, Posting date, Debit/Credit totals, Email summary to Sana Javed | `emailSummary`, `notifyUserId` | |

**Statuses.** DRAFT → POSTED · CANCELLED (lines deleted, assets released).
**Actions → effects.** *Recompute* → rebuild lines (WDV: opening NBV × rate ÷ 12; SLM: cost × rate ÷ 12; capped at NBV − residual; skip NONE / fully depreciated) · *Post journal* → `FixedAssets.depreciationRunPost(run)` (POSTING_RULES §Depreciation) · *Run history* · *Export*.
**Permission.** `fa.dep:run`, `fa.dep:post` · **Approval.** —

---

### Asset Disposals — `app/assets/disposals`
*Source:* `src/42-acc-reports.html` (section `app/assets/disposals`, modal `Reports-dispose`)
**Purpose.** Sell, scrap, write off or trade in assets with automatic gain/loss and derecognition journal.
**Tables.** Primary: `FixedAssets.AssetDisposals` · Reads: `FixedAssets.FixedAssets`, `Tax.TaxCodes`, `Accounting.ChartOfAccounts` (bank/cash), `Sales.Customers` · Writes: `FixedAssets.AssetDisposals`; on post `Accounting.Vouchers` / `Accounting.VoucherLines`, `FixedAssets.FixedAssets` (DISPOSED)
**Functions.** Save → `FixedAssets.assetDisposalAddUpdate` · Open → `FixedAssets.getAssetDisposalInfo` · Actions → `FixedAssets.assetDisposalPost`, `FixedAssets.assetDisposalCancel`
**Lookups.** `AssetDisposals.disposalType` → `DisposalType` · `AssetDisposals.status` → `AssetDisposalStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Disposals FY (3 posted · 1 pending · 1 draft) / NBV derecognised (cost) / Sale proceeds / Net gain on disposal | aggregates on `FixedAssets.AssetDisposals` by FY | |
| Chips All / Sold / Scrapped / Written off · FY select | `disposalType`, `disposalDate` | |
| Disposal # | `docNo` | DSP-2026-0009 (`Company.getNextDocNo('DSP')`) |
| Asset (FA-0087 + name/reg) | `assetId` | |
| Date | `disposalDate` | |
| Type (Sale, Trade-in, Scrapped, Written off) | `disposalType` | SALE, TRADE_IN, SCRAPPED, WRITTEN_OFF |
| Buyer | `buyerName` (+ optional `customerId`) | |
| Cost / Acc. Dep. / NBV | `cost`, `accumulatedDepreciation`, `nbv` (generated) | snapshot at disposal |
| Proceeds | `proceeds` (excl. GST) | |
| Gain / (Loss) | `gainLoss` (generated `proceeds − NBV`) | |
| Status (Posted, Pending approval, Draft) | `status` | DRAFT, PENDING_APPROVAL, POSTED, CANCELLED |
| Modal: Asset *, Disposal type, Disposal date, Buyer, Sale proceeds (Rs) * | as above | |
| GST on sale (GST 18% — Rs 243,000 / Exempt) | `taxCodeId`, `gstRate`, `gstAmount` | |
| Receive into (Meezan Bank — 0123, HBL — 8721, Cash in hand) | `receiveIntoAccountId` | |
| Computed result (original cost, accumulated depreciation to date, NBV, proceeds, Gain → 4910 Other Income) | `cost`, `accumulatedDepreciation`, `gainLoss`, `gainAccountId` / `lossAccountId` | "Depreciation charged up to the month before disposal" |

**Statuses.** DRAFT → PENDING_APPROVAL → POSTED · CANCELLED (posted rows frozen).
**Actions → effects.** *Save draft* · *Submit for approval* ("DSP-2026-0014 sent for approval") · on approval *Post* → `FixedAssets.assetDisposalPost(id)` (POSTING_RULES §Disposal) → asset DISPOSED · *Export*.
**Permission.** `FixedAssets:dispose`, `fa.dispose:approve` · **Approval.** disposal (`Company.Approvals`).
