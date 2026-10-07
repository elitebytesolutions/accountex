# 06 · Tax: page → entity map (Full)

Schema: `Tax` (`database/schema/06-tax.sql`), cross-module FKs in `database/fk/06-Tax-fks.sql`.
Documents (`Sales.SalesInvoiceLines`, `Purchases.VendorBillLines`, receipts, vendor payments) carry `taxCodeId` plus a `taxRate` snapshot taken from `Tax.getTaxRateOnDate(taxCodeId, docDate, isAtl)`.

Permission keys: module `Tax` (Tax & compliance) from the Roles & Permissions matrix (`src/9E-cash-users.js`).

Screens (4): Basic `app/tax/codes` · Full `app/tax/sales-tax`, `app/tax/wht`, `app/tax/fbr`.

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

---

### Sales Tax Return — `app/tax/sales-tax`
*Source:* `src/42-acc-reports.html` (section `app/tax/sales-tax`, modal `#Reports-iris-export`)
**Purpose.** Prepare, validate, export (IRIS) and record payment of the monthly sales tax return.
**Tables.** Primary: `Tax.SalesTaxReturns`, `Tax.SalesTaxReturnLines` · Reads: views `Tax.getSalesTaxAnnexC`, `Tax.getSalesTaxAnnexA`, `Sales.SalesInvoices`, `Purchases.VendorBills`, `Tax.FbrInvoiceSubmissions`, `Accounting.VoucherLines` (GL 2210 reconciliation) · Writes: `Tax.SalesTaxReturns`, `Tax.SalesTaxReturnLines`, `Company.Attachments` (IRIS zip), `Accounting.Vouchers` (CPR payment BPV)
**Functions.** Save → `Tax.salesTaxReturnAddUpdate` · Open → `Tax.getSalesTaxReturnInfo` · Actions → `Tax.salesTaxReturnFile`, `Tax.salesTaxReturnPay`
**Lookups.** `SalesTaxReturns.authority` → `SalesTaxReturnAuthority` · `SalesTaxReturns.status` → `SalesTaxReturnStatus` · `SalesTaxReturnLines.annex` → `Annex` · `SalesTaxReturnLines.matchStatus` → `SalesTaxReturnLineMatchStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Period select (Sep 2026 / Aug 2026 (filed)) | `SalesTaxReturns.periodMonth`, `status` | |
| STRN, due date | `strn`, `dueDate` | |
| Output tax (Annex-C) "GST 5,841,000 + further tax 74,000" | `outputTax`, `furtherTax`, `totalOutputTax` | |
| Input tax (Annex-A) "Admissible after 90% cap check" | `inputTax`, `inadmissibleInput`, `admissibleInputTax`, `inputCapPct` | |
| Net sales tax payable / "▲ 71.7% vs Aug" | `netPayable` | delta vs previous return derived |
| Return status Draft · 17 days to due date | `status`, `dueDate` | |
| Banner "1 purchase invoice not matched…" | annex A rows with `matchStatus = 'UNMATCHED'` | |
| Banner "Further tax applied on 39 invoices…" | annex C rows with `furtherTax > 0`, `isRegistered = false` | |
| Annex-C: Buyer, NTN / CNIC, Invoice, Date, Value excl. tax, Sales tax 18%, Further tax, Unregistered badge | `SalesTaxReturnLines` (annex C): `customerId`/`partyName`, `partyNtnCnic`, `invoiceId`/`documentNo`, `documentDate`, `valueExclTax`, `salesTax`, `furtherTax`, `isRegistered` | |
| Annex-A: Supplier, STRN, Document, Date, Value excl. tax, Input tax, Match | annex A: `vendorId`/`partyName`, `partyStrn`, `billId`/`documentNo`, `documentDate`, `valueExclTax`, `salesTax`, `matchStatus` | |
| Return summary rows (output, further, input, inadmissible u/s 8 / 8B, carry-forward, net) | header amounts | |
| "Section 8B check: input claimed is 67.5% of output tax" | `admissibleInputTax / totalOutputTax` vs `inputCapPct` | derived |
| Validation list (valid NTN/CNIC, Annex-C reconciles to GL 2210, no blacklisted suppliers, unmatched input, digital invoices synced 188/188) | derived checks; `status` VALIDATED | |
| Filing history: Period, Filed on, Paid, CPR | `periodMonth`, `filedOn`, `paidAmount`, `cprNo` | |
| IRIS export: Annex-A / Annex-C / Annex-H, Format, Exclude unmatched input | `includeAnnexH`, `excludeUnmatchedInput`, `irisExportedAt`, `irisExportAttachmentId` | |
**Statuses.** DRAFT → VALIDATED → FILED → PAID · REVISED (new `revisionNo`).
**Actions → effects.** *Export for FBR IRIS* → annex lines frozen, zip attachment · *Notify supplier* → `Company.Notifications` / email · *Record payment* (CPR) → `cprNo`, `paidOn`, BPV Dr 2210 Sales Tax Payable + 2211 Further Tax / Cr 1410 Input + Bank (POSTING_RULES §Sales tax settlement) · *Print* → document.
**Permission.** `Tax:view`, `Tax:create`, `Tax:post`, `Tax:export` · **Approval.** —

---

### Withholding Tax — `app/tax/wht`
*Source:* `src/42-acc-reports.html` (section `app/tax/wht`, modal `#Reports-wht-challan`)
**Purpose.** Track income tax deducted / collected by section, deposit it with FBR (CPR), issue certificates and file the u/s 165 / 149 statements.
**Tables.** Primary: `Tax.WhtDeductions`, `Tax.WhtChallans`, `Tax.WhtCertificates`, `Tax.WhtStatements` · Reads: view `Tax.getWhtBySection`, `Tax.TaxCodes`, `BankCash.BankAccounts`, `Payroll.PayrollRuns` · Writes: the above, `Accounting.Vouchers` (CPR BPV), `Company.Attachments` (certificate PDFs)
**Functions.** Save → `Tax.whtChallanAddUpdate` · Open → `Tax.getWhtChallanInfo` · Actions → `Tax.whtChallanCancel`, `Tax.whtChallanPay` ‖ Save → `Tax.whtCertificateAddUpdate` · Open → `Tax.getWhtCertificateInfo` · Actions → `Tax.whtCertificateCancel` ‖ Save → `Tax.whtStatementAddUpdate` · Open → `Tax.getWhtStatementInfo` · Actions → `Tax.whtStatementFile`
**Lookups.** `WhtChallans.status` → `WhtChallanStatus` · `WhtCertificates.direction` → `WhtCertificateDirection` · `WhtCertificates.status` → `WhtCertificateStatus` · `WhtStatements.returnType` → `WhtStatementReturnType` · `WhtStatements.status` → `WhtStatementStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Period select | `WhtDeductions.periodMonth` | |
| KPIs Deducted — Sep (214 transactions) / Due to FBR by 15 Oct / Deposited Q1 to date / Q1 statement u/s 165 Due 20 Oct | aggregates of `WhtDeductions`, `WhtChallans`, `WhtStatements` | |
| Deductions by section: Section, Nature, Transactions, Taxable amount, Rate, Tax deducted, Status Unpaid | `getWhtBySection` over `WhtDeductions.whtSection`, `TaxCodes.whtNature`, `taxableAmount`, `taxRate`, `taxAmount`, `status` | 149 row links PR-2026-09 (`sourceDocType = 'PRUN'`) |
| Challans (CPR): CPR number + sections, Period, Paid on, Bank, Amount | `WhtChallans.cprNo`, `sections`, `periodMonth`, `paymentDate`, `bankAccountId`, `amount` | |
| Record WHT challan: Period, Sections, CPR number *, Payment date, Paid from, Amount | `WhtChallans.*`; linked `WhtDeductions.whtPaymentId` | |
| Quarterly statements u/s 165: Quarter, Due date, Tax, Status | `WhtStatements.label`, `periodFrom/to`, `dueDate`, `taxAmount`, `status`, `filedOn` | |
| Annual statement u/s 149 | `WhtStatements.returnType = 'ANNUAL_149'` | |
| Deduction certificates (14 PDFs) | `WhtCertificates` (direction ISSUED) + `Company.Attachments` | |
| (customer-withheld certificates, 153(1)(a) on our sales) | `WhtCertificates` (direction RECEIVED), `WhtDeductions.direction = 'SUFFERED'` | |
**Statuses.** Deduction UNPAID → PAID (CLAIMED for suffered) · CANCELLED. Payment DRAFT → PAID · CANCELLED. Return IN_PREPARATION → FILED → REVISED. Certificate DRAFT → ISSUED / RECEIVED → CLAIMED · CANCELLED.
**Actions → effects.** *Record challan / Save challan* → `WhtChallans` + BPV Dr 2230 / 2231 / 2232 / Cr Bank (toast "Challan recorded and BPV created"), deductions → PAID (POSTING_RULES §WHT deposit) · *Deduction certificates* → `WhtCertificates` rows + PDFs · *Export* → file.
**Permission.** `Tax:view`, `Tax:create`, `Tax:post`, `Tax:export` · **Approval.** —

---

### FBR Integration — `app/tax/fbr`
*Source:* `src/42-acc-reports.html` (section `app/tax/fbr`)
**Purpose.** Configure real-time FBR (PRAL) invoice reporting and monitor the submission log.
**Tables.** Primary: `Tax.FbrSettings`, `Tax.FbrBranchMappings`, `Tax.FbrInvoiceSubmissions`, `Tax.FbrConnectionEvents` · Reads: `Company.CompanySettings` (NTN, STRN), `Company.Branches`, `Sales.SalesInvoices`, `Sales.CreditNotes` · Writes: the above
**Functions.** Save → `Tax.fbrSettingAddUpdate` · Open → `Tax.getFbrSettingInfo`
**Lookups.** `FbrSettings.authority` → `FbrSettingAuthority` · `FbrSettings.environment` → `FbrSettingEnvironment` · `FbrSettings.connectionStatus` → `ConnectionStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Connection "Connected · Production · token valid till 31 Dec 2026" | `FbrSettings.connectionStatus`, `environment`, `tokenExpiresOn` | |
| Last sync 09:42 AM · auto every 5 min | `FbrSettings.lastSyncAt`, `syncIntervalMinutes` | |
| Invoices reported — Sep 188 / 188 · Pending / failed 3 / 1 | counts of `FbrInvoiceSubmissions.status` | |
| Sync log: Time, Invoice, Buyer, Amount, FBR invoice no., Status (+ error) | `FbrInvoiceSubmissions.lastAttemptAt`, `documentNo` / `invoiceId` / `creditNoteId`, `buyerName`, `amount`, `fbrInvoiceNo`, `status`, `errorMessage` | |
| Chips All / Failed / Pending | filter on `status` | |
| Environment Production / Sandbox | `FbrSettings.environment` | |
| POS ID | `FbrSettings.posId` | |
| NTN / STRN (read-only) | `FbrSettings.ntn`, `strn` (snapshot of company profile) | |
| API security token | `FbrSettings.apiTokenSecretRef`, `apiTokenHint` | token kept in the secret store, never in the table |
| Branch mapping "All branches → POS 128734" | `FbrBranchMappings.branchId` (NULL = all), `posId` | |
| Report invoices on posting / Print FBR QR code / Block posting if FBR is unreachable | `reportOnPosting`, `printQr`, `blockIfUnreachable` | |
| Connection history (Health check OK · 412 ms; timeout recovered · 6 retried; Token renewed by Sana Javed) | `FbrConnectionEvents.event`, `ok`, `latencyMs`, `retriedCount`, `actorUserId`, `occurredAt` | |
**Statuses.** Config NOT_CONFIGURED → CONNECTED · DEGRADED · DISCONNECTED. Submission PENDING → ACCEPTED · FAILED (retry → PENDING).
**Actions → effects.** *Test connection* → `FbrConnectionEvents` (TEST) + `FbrSettings.lastLatencyMs` · *Sync now* → queued PENDING submissions sent, `attempts`++, IRN stored on ACCEPTED, invoice gets FBR invoice no / QR · *Save* → `FbrSettings`, `FbrBranchMappings`.
**Permission.** `Tax:view`, `Tax:edit`, `Tax:post` · **Approval.** —
