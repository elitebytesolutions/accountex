## Purchases & payables

Every journal below is one `Accounting.Vouchers` with `sourceDocType` = the purchase doc type (`GRN`, `BILL`, `PV`, `DN`, `PAY`) and `sourceDocId` = the document id. The document stores the id in `journalEntryId`. Every AP line carries the sub-ledger party `vendorId`. Every line carries the document's `branchId` and the line's `costCentreId`. Accounts are resolved in this order: the line's or document's explicit account, then the vendor's (`Vendors.payableAccountId`, `Vendors.defaultAccountId`), then the item's inventory account, then the company role in `Company.DefaultAccountMappings`. Roles used:

| Role | Prototype account | Used by |
|---|---|---|
| `INVENTORY` | 1310 Inventory — IT Hardware / 1140-01 Finished Goods | GRN, PV, bill price variance, DN |
| `GRNI` | 2115-01 GRN clearing (goods received not invoiced) | GRN, bill |
| `INPUT_GST` | 1250 Input Tax Recoverable (PV preview: 2130-01 Input sales tax) | bill, PV, DN |
| `AP_CONTROL` | 2110 / 2110-01 Trade Creditors | bill, PV, DN, payment |
| `WHT_PAYABLE_153` | 2230 WHT Payable — 153 (PV preview: 2130-02) | bill, PV, DN, payment |
| `ADVANCE_TAX_236G` | 1150-04 Advance Income Tax (236G) | PV |
| `BANK_CHARGES` | 5410-01 Bank charges | payment |
| cash / bank | the GL account of `BankCash.CashAccounts` / `BankCash.BankAccounts` | PV paid-now, payment, DN refund |

Common rules:
- Posting runs in one transaction. The document is inserted as `DRAFT` and posted by a status `UPDATE`.
- The `Accounting` guards reject an unbalanced entry, a closed fiscal period and a date before the company lock date.
- Stock lines write append-only rows to `Inventory.StockMovements` (`sourceDocType` / `sourceDocId` / `sourceLineId`).
  - Receipts (GRN, PV, a bill without a GRN) use `movementType = 'GRN'`. The inv trigger `Inventory.triggerStockLedgerApply` then recomputes `Inventory.Products.avgCost` (Bhatti `AVCOST`) and `Inventory.StockBalances`.
  - Returns to the vendor (DN, PR) use `movementType = 'PURCHASE_RETURN'` at the current average cost.
- Purchasing never writes `Inventory.Products.cost` or `avgCost` directly; the GRN → stock-ledger path owns them. The PV / bill flag `updateItemSalePrice` writes only `Inventory.Products.price`, and only when the new price ≥ `Products.cost`, because inv enforces CHECK `price >= cost` unless the item is DRAFT.
- Reversal: void or cancel posts a mirror journal through acc's reversal mechanism and mirror stock-ledger rows. The document is never edited or deleted.

### Goods received note — `GRN` (app/purchases/grn → *Post GRN*)
| Dr | Cr | Amount |
|---|---|---|
| `INVENTORY` (per item) | `GRNI` | Σ `GoodsReceivedNoteLines.acceptedAmount` (= acceptedQty × unitCost, the PO rate) |

- **Stock:** IN into `GoodsReceivedNotes.warehouseId` for `acceptedQty` per line. Each row carries batchNo and expiryDate (the `Inventory.ProductBatches` row is created if missing) and the unit cost.
- **Rejected quantity** (`rejectedQty`, with its reason) does not enter stock. It is shown as "Rejected (debit note)" and is claimed through a debit note if the vendor bills it.
- **Roll-ups (trigger):**
  - `PurchaseOrderLines.receivedQty += acceptedQty`.
  - The PO moves to `PARTIALLY_RECEIVED`, `RECEIVED` or `BILLED`.
  - A receipt larger than the open PO quantity is rejected (`OVER_RECEIPT`).
- **Cancel:** reverses the journal and the stock. It is allowed only while `GoodsReceivedNoteLines.billedQty = 0`.

### Vendor bill — `BILL` (app/purchases/bills/new → *Submit for approval* → *Approve*; posting happens on final approval)
| Dr | Cr | Amount |
|---|---|---|
| `GRNI` | | Lines that have a `grnLineId`: billed qty × the GRN unit cost (clears the accrual) |
| `INVENTORY` (± price variance) | | Same lines: `netAmount` − GRN value. This revalues the moving average. Any part of the variance whose quantity has already been sold goes to cost of sales. |
| `INVENTORY` | | Stock lines without a GRN (direct receipt): `netAmount`. Stock IN at `netUnitCost` into `VendorBills.warehouseId`. |
| line `accountId` (expense) | | Non-stock lines, e.g. 5420 Freight Inward and 5310 IT Support, with their cost centre |
| `INPUT_GST` | | Σ `taxAmount` (GST + SST) when the tax code is claimable. Otherwise the tax is added to the line cost. |
| | `AP_CONTROL` (vendor) | `netPayableAmount` = total − WHT |
| | `WHT_PAYABLE_153` | `whtAmount` (per line: `netAmount × whtRate`, by section). It is deposited by the 15th through CPR. |

Prototype example: BILL-2026-000088 / PO-063 / GRN-0412.

| Account | Dr | Cr |
|---|---|---|
| 1310 Inventory | 2,554,000 | |
| 5420 Freight Inward | 18,000 | |
| 5310 IT Support | 120,000 | |
| 1250 Input Tax | 480,960 | |
| 2110 Trade Creditors | | 3,034,760 |
| 2230 WHT 153 | | 138,200 |
| **Total** | **3,172,960** | **3,172,960** |

The screen preview shows the inventory debit net of the GRNI clearing.

**Roll-ups (trigger):**
- `PurchaseOrderLines.billedQty` and `GoodsReceivedNoteLines.billedQty` increase.
- `GoodsReceivedNotes.billStatus` and `GoodsReceivedNotes.matchStatus` are refreshed.
- The PO moves to `BILLED` once every line is billed.
- `VendorBills.balanceAmount` starts at `netPayableAmount`.

**Void:** a mirror journal. It is blocked while any live `VendorPaymentAllocations` exists.

### Purchase voucher (counter purchase) — `PV` (app/purchases/voucher → *Save & Post*)
The PV is one `Purchases.VendorBills` row with `channel = COUNTER`. It has no PO or GRN; the PV is itself the receiving document.

| Dr | Cr | Amount |
|---|---|---|
| `INVENTORY` | | taxable amount (gross − discount) |
| `INPUT_GST` | | Σ line GST |
| `ADVANCE_TAX_236G` | | `advanceTaxAmount` (if entered) |
| | `WHT_PAYABLE_153` | `whtAmount` = taxable × "WHT u/s 153(1)(a) %" (5.5% filer, 11% non-filer) |
| | `AP_CONTROL` (vendor) | `netPayableAmount` |
| `AP_CONTROL` (vendor) | | `paidNowAmount` (only when Payment Mode ≠ On Credit) |
| | cash / bank account | `paidNowAmount` |

- The screen preview nets the two AP lines into "A/P = balance payable". We keep both lines so that the vendor ledger shows the full purchase and the payment.
- **Stock:** IN for `totalQty` = Ps-Qty + Bonus − Brk, at `netUnitCost` = taxable ÷ totalQty. Bonus therefore lowers the unit cost (Bhatti `PUR_NETCOST`). Breakage is paid for but never stocked.
- **Status:** `paidNow = netPayable` → `PAID`, `0 < paidNow < netPayable` → `PARTIALLY_PAID`, otherwise `POSTED` (set by trigger).
- **Cheque mode:** a `BankCash.Cheques` (issued) row is created from `chequeNo` and the bank account, and linked in `VendorBills.chequeId`.
- **Prices:** lines with `updateItemSalePrice` write the new sale price to `Inventory.Products`.

### Debit note — `DN` (app/purchases/debit-notes → *Create debit note*)
| Dr | Cr | Amount |
|---|---|---|
| `AP_CONTROL` (vendor) | | `creditAmount` = total − WHT adjustment |
| `WHT_PAYABLE_153` | | `whtAmount` (the WHT adjustment, e.g. 5% of the value) |
| | `INVENTORY` | `netAmount`. Reasons: PURCHASE_RETURN, QUALITY_REJECTION, and PRICE_VARIANCE / SHORT_SUPPLY while the stock is on hand. A non-stock bill line uses its expense account instead. |
| | `INPUT_GST` | `taxAmount` (input tax reversed; reported in the next sales-tax return) |

- **Example:** DN-2026-000013, one Dell Latitude returned. Dr AP 268,940 + Dr WHT 11,900 = Cr Inventory 238,000 + Cr Input GST 42,840 = 280,840.
- **Stock:** OUT from `DebitNotes.warehouseId` for `returnQty` (reasons PURCHASE_RETURN and QUALITY_REJECTION only).
- **Settlement:**
  - `ADJUST_AGAINST_BILL` inserts a `VendorPaymentAllocations` row (`debitNoteId`, `billId`), which lowers the bill balance.
  - `REQUEST_REFUND` leaves the DN `OPEN`. When the vendor refunds: Dr bank / Cr `AP_CONTROL` for `refundedAmount` (a `BankCash.BankTransactions` with source `DN`), then status `REFUNDED`.
  - A DN can also be used as a credit inside a payment allocation; this has no GL effect.

### Vendor payment — `PAY` (app/payables/payments → *Create payment* → approval → post)
| Case | Dr | Cr |
|---|---|---|
| WHT already withheld at bill (default) | `AP_CONTROL` (vendor) `amount` | bank / cash `amount` |
| WHT withheld now (allocation modal "Withhold now · 153(1)(a)") | `AP_CONTROL` `amount + wht` | bank / cash `amount`; `WHT_PAYABLE_153` `wht` |
| Bank charges | `BANK_CHARGES` `bankChargesAmount` | bank |

- **Example (payment run, 4 bills):** Dr AP 1,911,740 / Cr Meezan 1,911,740, plus bank charges 400. The WHT of Rs 130,020 was already withheld at the bills and is paid with the October CPR.
- **Cheque:** `BankCash.Cheques` (issued, crossed "A/C Payee only") linked in `VendorPayments.chequeId`. Status moves `POSTED → PRESENTED → CLEARED` from the bank book or reconciliation. A bounced cheque voids the payment: reversal journal, and its allocations are reversed.
- **Allocation:** each row reduces the bill balance by `amount + whtAmount`. A row only counts once its source payment is posted or its debit note is open. Money not allocated stays on account (`unallocatedAmount`). Allocating it later ("Allocate on-account", "Auto-allocate (FIFO)") has no GL effect unless WHT is withheld at that point. In that case: Dr `AP_CONTROL` / Cr `WHT_PAYABLE_153`.
