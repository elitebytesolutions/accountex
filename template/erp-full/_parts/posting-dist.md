## Wholesale & distribution (`Distribution`) — FULL edition

Accounts are resolved through `Company.DefaultAccountMappings.role` (codes shown are the Trading & Distribution (PK) template defaults used on the screens). Every journal is one `Accounting.Vouchers` with `sourceDocType` / `sourceDocId` pointing at the dist document. AR lines carry `customerId`; salesman lines carry `employeeId`.

Account roles used here:

| Role | Default account |
|---|---|
| `CASH_IN_HAND` | 1110-01 Cash in Hand (from `RouteSettlements.cashAccountId` when set) |
| `CHEQUES_IN_HAND` | 1130-02 Cheques in Hand |
| `AR_CONTROL` | 1140-01 Trade Debtors |
| `SALESMAN_RECEIVABLE` | 1150-07 Salesman Receivable |
| `STOCK` | 1310-01 Stock in Hand (warehouse) |
| `STOCK_VAN` | Stock in Hand — Van (sub-account of 1310; same account as STOCK if not split) |
| `SALES_RETURNS` | 4100-03 Sales Returns & Allowances |
| `OUTPUT_GST` | Output sales tax (returns reverse their GST share) |
| `COGS` | 5100-01 Cost of Goods Sold |
| `CASH_OVER_SHORT` | 4900-02 Cash Over / Short |
| `STOCK_GAIN` | 4900-03 Stock Gain |
| `SALES_COMMISSION_EXPENSE` | Sales commission expense |
| `COMMISSION_PAYABLE` | Commission payable (or salaries payable if paid through payroll) |

### Wholesale invoice (Quick Entry, Bulk Invoicing, booking / back-order conversion)
These are ordinary `Sales.SalesInvoices` rows (channel WHOLESALE). Use **§Sales invoice**: Dr AR_CONTROL (net) / Cr SALES (gross − discount) / Cr OUTPUT_GST. Scheme free goods carry zero revenue; their cost goes to COGS with the paid lines.
- **Stock and COGS timing.** An invoice that is **not** put on a delivery run issues stock from `SalesInvoices.warehouseId` when it is posted (Dr COGS / Cr STOCK).
- **Run invoices** are posted with stock issue deferred (`Sales.SalesInvoices.stockIssueMode = 'AT_DISPATCH'`). Only the stock is *reserved* (`Inventory.StockReservations`) until dispatch.
- **Credit override** (`Distribution.CreditOverrideLogs`) has no GL effect.

### Van dispatch — `Distribution.LoadSheets` DISPATCHED
| Step | Dr | Cr | Stock effect |
|---|---|---|---|
| 1. Transfer the load | STOCK_VAN (at moving-avg cost) | STOCK | `Inventory.StockTransfers` source warehouse → van warehouse: TR OUT from the warehouse, TR IN to the van for each `LoadSheetLines` (batch FEFO). No GL entry when STOCK_VAN = STOCK. |
| 2. Issue the run's invoices | COGS | STOCK_VAN | StockMovements OUT from the van warehouse for each invoice line's base + bonus qty. The reservation is released. |

### Route settlement — `Distribution.RouteSettlements` SETTLED (one JV)
Amounts come from the settlement totals. The screen's journal preview groups the lines as Receipts, Returns, Cash short and Stock variance.

| Event | Dr | Cr | Party / notes |
|---|---|---|---|
| Receipts — cash | CASH_IN_HAND **counted** (`cashCounted`) | — | |
| Receipts — cheques | CHEQUES_IN_HAND (`chequeTotal`) | — | one `BankCash.Cheques` per `RouteSettlementCheques`; PDC if chequeDate > docDate |
| Receipts — AR | — | AR_CONTROL (`cashExpected + chequeTotal`) | per customer, matched by a `Sales.CustomerReceipts` (RCPT) per invoice and allocated to that invoice |
| Returns — revenue | SALES_RETURNS (`returnTotal`, excl. GST share) + OUTPUT_GST (GST share) | AR_CONTROL (`returnTotal`) | per customer, via `Sales.SalesReturns` (SR) per invoice |
| Returns — stock | STOCK (`returnCostTotal`) | COGS | stock IN to the van, then `Inventory.StockTransfers` van → warehouse for returned qty (counted qty if lower) |
| Cash short (counted < expected) | SALESMAN_RECEIVABLE (`cashShortAmount`) | — | employeeId = settlement salesman. It balances the receipt (AR credited in full, cash debited as counted). |
| Cash over (counted > expected) | — | CASH_OVER_SHORT (`cashOverAmount`) | |
| Van stock loss (variance < 0) | SALESMAN_RECEIVABLE (\|varianceValue\|) | STOCK_VAN | StockMovements ADJ OUT at the van for missing qty |
| Van stock gain (variance > 0) | STOCK (varianceValue) | STOCK_GAIN | StockMovements ADJ IN at the van for the extra qty |
| Credit sales (`creditAmount`) | — | — | **Memo only.** The invoice already debited AR, so the balance just stays open and keeps ageing from the invoice date. |
| Unexplained short rows (`differenceAmount > 0`) | — | — | **No posting.** They stay as an open AR balance on the invoice. The UI warns before posting. |
| Not delivered (state NONE) | SALES_RETURNS + OUTPUT_GST | AR_CONTROL | Same as a full return. Stock returns as above, and the invoice is released from the run (`LoadSheetInvoices.releasedAt`). Alternative: void the invoice if it is unpaid and in the same period. |

Balance check: Dr = counted cash + cheques + returns + return cost + short + loss; Cr = AR(receipts + returns) + COGS + over + van stock. Receipts balance because the AR credit uses the *expected* cash, and the gap between expected and counted goes to short or over.

### Recovery receipt — `Distribution.RecoverySheetLines` POSTED
| Mode | Dr | Cr | Notes |
|---|---|---|---|
| CASH | CASH_IN_HAND | AR_CONTROL | `Sales.CustomerReceipts` (RCPT), customerId set |
| CHEQUE | CHEQUES_IN_HAND | AR_CONTROL | creates `BankCash.Cheques` (from remarks: cheque no / bank) |
| ONLINE / JAZZCASH | BANK (`depositBankAccountId` → its GL account) | AR_CONTROL | the remarks carry the transaction id |

**Allocation:** FIFO. `Sales.CustomerReceiptAllocations` rows are created against the customer's open invoices, oldest due date first (then docDate, then docNo), until the amount is used. `collectedAmount ≤ outstandingAmount` is enforced, so the receipt never leaves an unapplied balance.

### Back-orders
- **Allocation** (`Distribution.BackOrderAllocations`) has no GL effect. It creates an `Inventory.StockReservations` against the GRN batch.
- **Conversion** produces a normal wholesale invoice (above).
- **Cancellation** has no GL or stock effect.

### Commission accrual — `Distribution.SalesmanCommissions` ACCRUED
| Event | Dr | Cr | Notes |
|---|---|---|---|
| Accrue (period close) | SALES_COMMISSION_EXPENSE | COMMISSION_PAYABLE | employeeId on the payable line. Amount = achieved × slab rate / 100. Cost centre = route's branch. |
| Pay through payroll | COMMISSION_PAYABLE | (payroll run clears it via salaries payable) | `Payroll.PayrollAdjustments` earning line (see open question) |
| Pay in cash | COMMISSION_PAYABLE | CASH_IN_HAND / BANK | |

### Settlement of salesman receivable
A shortage booked to SALESMAN_RECEIVABLE is recovered by:
- **Cash deposit:** Dr CASH_IN_HAND / Cr SALESMAN_RECEIVABLE.
- **Payroll deduction:** Dr SALARIES_PAYABLE / Cr SALESMAN_RECEIVABLE (payroll module).
