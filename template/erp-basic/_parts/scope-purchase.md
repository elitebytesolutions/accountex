## Purchases & payables

**Schema:** `Purchases`
**Tables (Basic, 13):** VendorCategories (helper lookup), vendor, VendorContacts, PurchaseOrders, PurchaseOrderLines, grn, GoodsReceivedNoteLines, bill, VendorBillLines, DebitNotes, DebitNoteLines, VendorPayments, VendorPaymentAllocations
**Screens:** app/vendors, app/vendors/view, app/purchases/orders, app/purchases/grn, app/purchases/bills, app/purchases/bills/new, app/purchases/voucher, app/purchases/debit-notes, app/payables/payments, app/payables/ageing

### Features
- **Vendor master** (`VEN-0001`):
  - Tax and FBR: legal name, category, NTN or CNIC, STRN, FBR Active Taxpayer (ATL) status with "Verify ATL", default WHT section (153(1)(a) goods / (b) services / (c) contracts / Exempt).
  - Accounts and terms: expense or inventory account, payable account, payment terms and credit days.
  - Contacts and banking: phone, email, address, city, primary bank and IBAN, and contacts.
  - **Vendor 360** has tabs Overview, Bills, Payments, Statement and Documents (NTN certificate, STRN, supply agreement and WHT certificates are stored as `Company.Attachments`).
- **Purchase orders** (`PO-2026-000001`):
  - Vendor, order and expected dates, deliver-to branch (and warehouse), terms, department (cost centre), buyer, and lines with GST.
  - **Approval:** two levels (`PENDING_L1` → `PENDING_L2`). Thresholds come from company settings ("routed for approval above Rs 500,000"). Approval emails the PO to the vendor.
  - Receipt and billing progress roll up from the lines.
- **Goods received (GRN)** (`GRN-2026-000001`):
  - Received against an approved PO, line by line: ordered, previously received, received now, accepted, rejected with a reason, then batch, expiry and cost.
  - Records a QC note and QC result (`PASSED` / `PARTIAL_REJECT`) and the receiving warehouse.
  - A live 3-way match badge shows the match state.
  - Posting stocks the goods in and accrues GRNI.
- **Vendor bills** (`BILL-2026-000001`):
  - Header: vendor invoice number (the system warns on a duplicate for the same vendor), PO and GRN pull-through, payable account, currency and fx.
  - Lines: item or expense account, GST/SST tax code, and a WHT section per line.
  - Matching: a 3-way match state (`MATCHED`, `QTY_VARIANCE`, `PRICE_VARIANCE`, `NO_PO`) with the variance %.
  - Approval route: prepared → Finance Manager (above Rs 1,000,000) → CEO (above Rs 2,500,000). Bills can also be scanned with OCR, and can be marked disputed.
- **Purchase voucher** (`PV-2026-000001`): a counter purchase in one flow, stored on the same `bill` table with `channel = COUNTER`.
  - Supplier, supplier bill number, purchaser, due date, deal on supply, and retail-price discount %.
  - A barcode or UPC grid with Ps-Qty / Bonus / Brk / T-Qty, purchase and sale price (with a markup helper), and GST % and discount %.
  - Pay mode On Credit, Cash, Bank or Cheque, with an amount paid now.
  - WHT u/s 153 % (filer or non-filer rate) and advance tax 236G.
  - Review checklist and a journal preview before posting.
- **Debit notes** (`DN-2026-000001`):
  - Raised against a bill for one of four reasons: purchase return, price variance, short supply or quality rejection.
  - Return-from warehouse, input GST reversal, and WHT adjustment.
  - Settled by adjusting against the bill or by requesting a refund.
- **Payments** (`PAY-2026-000001`):
  - **Payment run:** pick approved bills due by a date. One payment is created per vendor, by IBFT, cheque, pay order or cash, from a bank or cash account.
  - **Cheques:** cheque number series and crossing ("A/C Payee only").
  - **Other run outputs:** bank charges, the bulk-IBFT bank upload file and payment advices. Bills can also be paid with "Pay selected" from the bills list.
  - **Allocation:** on-account payments are allocated later, manually or FIFO, and open debit notes can be used as credits. WHT is either already withheld at the bill or withheld now.
- **AP ageing and reports** (`app/payables/ageing`, views):
  - **Ageing:** by due date or bill date, in buckets Current, 1–30, 31–60, 61–90 and 90+, with disputed amounts.
  - **Other reports:** purchase register, vendor statement, WHT deducted by section, and purchases by vendor.

### Key business rules
- **Numbering:** document numbers come from `Company.getNextDocNo()` for doc types PO, GRN, BILL, PV, DN and PAY. Vendor codes use the VEN sequence `VEN-{SEQ4}`.
- **Quantities** are in base units. Cartons + loose → base through `Inventory.Products.ctn`. Bonus is free; on the PV, breakage (Brk) is paid for but not stocked. `netUnitCost` = taxable ÷ (qty + bonus − breakage) feeds the moving-average cost.
- **Posting:** documents are inserted as `DRAFT` and posted by a status change.
  - Posted documents are locked by trigger. Only settlement and roll-up columns may change afterwards.
  - Corrections go through void or cancel with a reversal journal.
- **Receipts against POs:**
  - Goods can only be received against an `APPROVED` or `PARTIALLY_RECEIVED` PO.
  - An over-receipt is rejected (PO line `receivedQty ≤ ordered + bonus`).
  - A rejected quantity must have a reason.
- **Bill balance** = net payable (total − WHT) − paid now − effective allocations. It is maintained by trigger and drives the status (`POSTED` → `PARTIALLY_PAID` → `PAID`). `OVERDUE` and `DUE_TODAY` are derived from `dueDate`, never stored.
- **Settlement:**
  - A payment or debit note can only settle posted bills of the same vendor.
  - Over-allocation is rejected.
  - Allocations of a posted source are reversed, never deleted.
- **WHT u/s 153:**
  - The section comes from the vendor default or the line. The rate is taken from the tax master at posting and doubled for vendors not on the ATL.
  - WHT withheld at the bill is deposited through CPR by the 15th of the next month.
- **Input tax** from bills and PVs is claimable. A debit note reverses it, and the reversal is reported in the next sales-tax return.

### Statuses
| Document | Statuses |
|---|---|
| Vendor | ACTIVE, INACTIVE · ATL: ACTIVE, NOT_ON_ATL, UNVERIFIED |
| Purchase order | DRAFT → PENDING_L1 → PENDING_L2 → APPROVED → PARTIALLY_RECEIVED → RECEIVED → BILLED · CANCELLED |
| GRN | DRAFT → POSTED · CANCELLED · QC: PASSED / PARTIAL_REJECT · bill: AWAITING / PARTIALLY_BILLED / BILLED · match: MATCHED / QTY_VARIANCE / TWO_WAY_BILL_AWAITED / OVER_RECEIPT |
| Bill / PV | DRAFT → AWAITING_APPROVAL → APPROVED → POSTED → PARTIALLY_PAID → PAID · VOID (OVERDUE, DUE_TODAY derived) · match: MATCHED / QTY_VARIANCE / PRICE_VARIANCE / NO_PO |
| Debit note | DRAFT → OPEN → APPLIED or REFUNDED · VOID |
| Vendor payment | DRAFT → PENDING_APPROVAL → POSTED → PRESENTED → CLEARED · VOID |

### Integrations
- **FBR ATL check:** an online check on vendor save and with "Verify ATL".
- **Bank file:** a bulk-IBFT upload file (Meezan format).
- **Cheques:** issued through `BankCash.Cheques` (cheque register).
- **OCR:** bill capture from an image or PDF.
- **Email:** the PO and the debit note are emailed to the vendor.
