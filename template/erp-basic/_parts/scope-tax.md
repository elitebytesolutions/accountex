## Tax — Basic

**Screens (1).** Tax Codes (`app/tax/codes`).

**Tables (2).** `Tax.TaxCodes`, `Tax.TaxCodeRates`. Function `Tax.getTaxRateOnDate(taxCodeId, date, isAtl)`.

### Features
- **Tax code catalogue.** Covers:
  - Sales tax: standard 18%, zero-rated, exempt, reduced (Eighth Schedule), further tax 4% to unregistered buyers.
  - Income tax withholding: 153(1)(a) goods with a non-ATL double rate, 153(1)(b) services, 153(1)(c) contracts, 149 salary (slab), 155 rent.
  - Advance tax collection: 236G distributors, 236H retailers.
- **Code attributes.** Each code has a type (Sales tax / Withholding / Collection) and applies to sales, purchases, vendor payments, customer receipts or payroll. It also carries the tax (payable) and input (recoverable) GL accounts, the FBR legal reference, the WHT section and nature, "calculate on amount excluding sales tax", "check ATL status before applying", and an active flag.
- **Effective-dated rates.** Each rate row has a filer rate, a non-ATL rate and the Finance Act reference, so a rate change keeps history (e.g. Finance Act 2026, effective 01 Jul 2026).
- **Rate lookup on documents.** Documents snapshot the rate from `Tax.getTaxRateOnDate` into their `taxRate`.

### Business rules
- Code unique per tenant. Sales-tax codes carry a sales-tax kind. Withholding and collection codes carry a WHT section.
- Every code except exempt ones (rate basis NONE) must have a tax account.
- Rates 0–100%. A tax code's rate periods must not overlap (exclusion constraint). An open-ended period has `effectiveTo` NULL.
- A non-ATL rate applies only when the code checks ATL and the party (`Sales.Customers.atlStatus` / `Purchases.Vendors.atlStatus`) is not on the ATL.

### Statuses
Active / inactive, soft delete.

### Integrations
Reference rates from the platform tax master (`Platform.TemplateTaxCodes` at onboarding).
