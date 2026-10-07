## Tax: sales tax and withholding lines (Full)

Tax lines are posted **inside the source document's voucher**; the tax module owns the codes and rates (`Tax.TaxCodes`, `Tax.TaxCodeRates`). In Full, every withholding / collection line also writes a `Tax.WhtDeductions` row (direction DEDUCTED / COLLECTED / SUFFERED) and the only vouchers the tax module raises itself are the CPR settlements below. The tax account is `Tax.TaxCodes.accountId`, and `inputAccountId` for recoverable input tax. The rate is `Tax.getTaxRateOnDate(taxCodeId, docDate, isAtl)`, snapshotted on the document line as `taxRate`. Roles marked † are proposed additions to `Company.DefaultAccountMappings.role`. Tax has no stock effect.

### Output sales tax (sales invoice, counter sale, credit note)
| Event | Dr | Cr | Base / rule |
|---|---|---|---|
| Standard-rated sale (GST-18) | AR_CONTROL / Cash (gross) | SALES_REVENUE (value excl. tax) · OUTPUT_GST 2210 (18%) | `calcOnExclSalesTax`: rate × value excl. tax |
| Further tax to an unregistered buyer (FT-4) | AR_CONTROL (+4%) | FURTHER_TAX_PAYABLE 2211 | applies when the buyer has no STRN; 4% of value excl. tax |
| Zero-rated (GST-0) | AR_CONTROL | SALES_REVENUE | tax line at 0%; still reported in Annex-C |
| Exempt (EXEMPT) | AR_CONTROL | SALES_REVENUE | no tax line ("Not posted") |
| Reduced rate (GST-RED, Eighth Schedule) | AR_CONTROL | SALES_REVENUE · OUTPUT_GST (10%) | |
| Credit note | reverse of the above lines | | |

### Input sales tax (vendor bill, purchase voucher, debit note)
| Event | Dr | Cr | Base / rule |
|---|---|---|---|
| Standard-rated purchase (GST-18) | INVENTORY / expense (value excl. tax) · INPUT_GST 1410 (18%) | AP_CONTROL / Cash (gross) | `TaxCodes.inputAccountId` |
| Exempt / unregistered supplier | INVENTORY / expense (gross) | AP_CONTROL | no input claimed |
| Debit note | reverse of the above lines | | |

### Advance tax collected on sales (ADV-236G / ADV-236H)
| Event | Dr | Cr | Base / rule |
|---|---|---|---|
| Sale to a distributor / dealer / wholesaler (236G 0.1%) or retailer (236H 0.5%) | AR_CONTROL (+ tax) | ADVANCE_TAX_COLLECTED† 2232 | on gross value incl. sales tax unless `calcOnExclSalesTax`; non-ATL buyers use `nonAtlRate` |

### Withholding on vendor payments (WHT-153A/B/C, WHT-155)
| Event | Dr | Cr | Base / rule |
|---|---|---|---|
| Payment / bill with withholding | AP_CONTROL (gross due) | Bank / Cash (net) · WHT_PAYABLE 2230 (tax) | 153(1)(a) goods 5.5% (non-ATL 11%), 153(1)(b) services 9%, 153(1)(c) contracts 7%, 155 rent 15%; base excl. sales tax when `calcOnExclSalesTax`; non-ATL rate when `checkAtl` and the vendor is not on ATL |

### Withholding suffered on customer receipts (153(1)(a) on our sales)
| Event | Dr | Cr | Base / rule |
|---|---|---|---|
| Customer pays net of WHT | Bank / Cash (net) · ADVANCE_INCOME_TAX† 1420 (tax) | AR_CONTROL (gross) | `appliesTo = CUSTOMER_RECEIPTS`; adjustable against our income tax |

### Salary withholding (WHT-149)
Posted by the payroll run (payroll module): Dr SALARIES expense / Cr SALARIES_PAYABLE (net) · SALARY_TAX_PAYABLE† 2231 (slab tax).

### WHT register rows (Full)
| Source event | `Tax.WhtDeductions` | Notes |
|---|---|---|
| Vendor payment / bill with 153 / 155 | direction DEDUCTED, `vendorId`, `sourceDocType` PAY / BILL, status UNPAID | `journalEntryId` = the payment / bill voucher |
| Sale with 236G / 236H | direction COLLECTED, `customerId`, `sourceDocType` INV | |
| Receipt net of customer WHT | direction SUFFERED, `customerId`, `sourceDocType` RCPT | → CLAIMED when the certificate is received (`WhtCertificates` RECEIVED) and adjusted |
| Payroll run 149 | direction DEDUCTED, `employeeId`, `sourceDocType` PRUN | one row per employee |

### WHT deposit with FBR (CPR, `Tax.WhtChallans`)
| Event | Voucher | Dr | Cr | Notes |
|---|---|---|---|---|
| Record challan 153 · 236G/H | BPV | WHT_PAYABLE 2230 · ADVANCE_TAX_COLLECTED† 2232 | Bank (`WhtChallans.bankAccountId`) | settles the UNPAID `WhtDeductions` rows of the period and sections → PAID |
| Record challan 149 salary | BPV | SALARY_TAX_PAYABLE† 2231 | Bank | |

### Sales tax settlement (`Tax.SalesTaxReturns`)
| Event | Voucher | Dr | Cr | Notes |
|---|---|---|---|---|
| Return filed (month-end transfer, optional) | JV | OUTPUT_GST 2210 · FURTHER_TAX_PAYABLE 2211 | INPUT_GST 1410 (admissible) · SALES_TAX_SETTLEMENT† (net payable) | inadmissible input u/s 8 / 8B: Dr expense / Cr INPUT_GST |
| CPR payment | BPV | SALES_TAX_SETTLEMENT† (or OUTPUT_GST directly when no settlement JV is used) | Bank (`paidFromBankAccountId`) | `paymentJournalEntryId`, `cprNo`, status PAID |
| Net refundable / negative | — | — | — | carried forward as `carryForwardIn` of the next return |

### FBR real-time reporting
No GL effect. `Tax.FbrInvoiceSubmissions` stores the IRN; when `blockIfUnreachable` is set, posting an invoice is refused while FBR cannot be reached (otherwise the submission is queued as PENDING and retried).
