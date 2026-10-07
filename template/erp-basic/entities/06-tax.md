# 06 · Tax: page → entity map (Basic)

Schema: `Tax` (`database/schema/06-tax.sql`), cross-module FKs in `database/fk/06-Tax-fks.sql`.
Documents (`Sales.SalesInvoiceLines`, `Purchases.VendorBillLines`, receipts, vendor payments) carry `taxCodeId` plus a `taxRate` snapshot taken from `Tax.getTaxRateOnDate(taxCodeId, docDate, isAtl)`.

Permission keys: module `Tax` (Tax & compliance) from the Roles & Permissions matrix (`src/9E-cash-users.js`).

Basic screens: `app/tax/codes`.

---

### Tax Codes — `app/tax/codes`
*Source:* `src/42-acc-reports.html` (section `app/tax/codes`, modal `#Reports-new-taxcode`)
**Purpose.** Maintain sales tax, further tax, withholding and advance-tax collection codes with their effective-dated rates and GL accounts.
**Tables.** Primary: `Tax.TaxCodes`, `Tax.TaxCodeRates` · Reads: `Accounting.ChartOfAccounts` · Writes: `Tax.TaxCodes`, `Tax.TaxCodeRates`
**Functions.** Save → `Tax.taxCodeAddUpdate` · Open → `Tax.getTaxCodeInfo`
**Lookups.** `TaxCodes.taxType` → `TaxType` · `TaxCodes.appliesTo` → `TaxCodeAppliesTo` · `TaxCodes.rateBasis` → `RateBasis` · `TaxCodes.salesTaxKind` → `SalesTaxKind` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Code * | `TaxCodes.code` | GST-18, GST-0, EXEMPT, FT-4, GST-RED, WHT-153A, WHT-153A-NF, WHT-153B, WHT-153C, WHT-149, ADV-236G, ADV-236H, WHT-155, WHT-236Y |
| Description * | `TaxCodes.description` | |
| Type (Sales tax / Withholding / Collection) | `TaxCodes.taxType` | SALES_TAX · WITHHOLDING · COLLECTION |
| (sales tax flavour) | `TaxCodes.salesTaxKind` | STANDARD · ZERO_RATED · EXEMPT · REDUCED · FURTHER |
| Applies to | `TaxCodes.appliesTo` | SALES · PURCHASES · SALES_AND_PURCHASES · VENDOR_PAYMENTS · CUSTOMER_RECEIPTS · PAYROLL ("Sales invoices" = SALES) |
| Rate / Rate % ("Slab", "—") | `TaxCodeRates.rate`; `TaxCodes.rateBasis` | PERCENT · SLAB (WHT-149) · NONE (EXEMPT) |
| Rate for non-ATL % | `TaxCodeRates.nonAtlRate` | 11.00 for 153(1)(a) non-filers |
| Effective from / "Rates effective 01 Jul 2026 (Finance Act 2026)" | `TaxCodeRates.effectiveFrom`, `effectiveTo`, `financeAct` | no overlapping periods (exclusion constraint) |
| Tax account * | `TaxCodes.accountId` → `Accounting.ChartOfAccounts` | 2210 Sales Tax Payable, 2211 Further Tax Payable, 2230 Income Tax Withheld Payable, 2231 Salary Tax Payable, 2232 Advance Tax Collected, 1420 Advance Income Tax |
| (second account "1410 Sales Tax Input") | `TaxCodes.inputAccountId` | input side of GST-18 |
| FBR reference / FBR legal reference | `TaxCodes.fbrReference` | Sec 3, STA 1990 · 153(1)(a) ITO 2001 |
| (WHT section grouping) | `TaxCodes.whtSection`, `whtNature` | feeds the WHT statement (Full) |
| Calculate on amount excluding sales tax | `TaxCodes.calcOnExclSalesTax` | |
| Check vendor ATL status before applying | `TaxCodes.checkAtl` | reads `Purchases.Vendors.atlStatus` / `Sales.Customers.atlStatus` |
| Active switch | `TaxCodes.isActive` | |
| Chips All 13 / Sales tax 5 / Withholding 8 / Inactive 1 | filters on `taxType`, `isActive` | |
| Footer "13 tax codes · 12 active" | counts | |
**Statuses.** Active / inactive (`isActive`); soft delete `deletedAt`.
**Actions → effects.** *New Tax Code / Save* → `TaxCodes` + first `TaxCodeRates` · *Edit* → update; a rate change closes the current `TaxCodeRates` (`effectiveTo`) and opens a new row · *Check FBR rates* → compares with `Platform.TaxMasterSalesTaxRates` / `Platform.TaxMasterWithholdingRates` (Full) and proposes new rate rows.
**Permission.** `Tax:view`, `Tax:create`, `Tax:edit` · **Approval.** —
