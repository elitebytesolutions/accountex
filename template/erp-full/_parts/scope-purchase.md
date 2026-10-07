## Purchases & payables

**Schema:** `Purchases`
**Tables (Full, 19):** the 13 Basic tables (VendorCategories, vendor, VendorContacts, PurchaseOrders, PurchaseOrderLines, grn, GoodsReceivedNoteLines, bill, VendorBillLines, DebitNotes, DebitNoteLines, VendorPayments, VendorPaymentAllocations) + VendorBankAccounts, PurchaseReturns, PurchaseReturnLines, LandedCostShipments, LandedCostItems, LandedCostCharges
**Screens (12):** app/vendors, app/vendors/view, app/purchases/orders, app/purchases/grn, app/purchases/bills, app/purchases/bills/new, app/purchases/voucher, app/purchases/debit-notes, app/purchases/returns, app/purchases/landed-cost, app/payables/payments, app/payables/ageing

### Features (Basic, unchanged)
- **Vendor master** (`VEN-0001`):
  - Tax and FBR: legal name, category, NTN or CNIC, STRN, FBR Active Taxpayer (ATL) status with "Verify ATL", default WHT section (153(1)(a) goods / (b) services / (c) contracts / Exempt).
  - Accounts and terms: expense or inventory account, payable account, payment terms and credit days.
  - Contacts and banking: phone, email, address, city, primary bank and IBAN, and contacts.
  - **Vendor 360** has tabs Overview, Bills, Payments, Statement and Documents.
- **Purchase orders** (`PO-2026-000001`): two-level approval (`PENDING_L1` → `PENDING_L2`) above the company threshold. Approval emails the PO to the vendor. Receipt and billing progress roll up from the lines.
- **Goods received (GRN):**
  - Received against an approved PO: ordered, previously received, received now, accepted, rejected with a reason, then batch, expiry and cost.
  - Records QC and the receiving warehouse, and shows a live 3-way match. Posting stocks the goods in and accrues GRNI.
- **Vendor bills** (`BILL-`):
  - The system warns on a duplicate vendor invoice number. PO and GRN lines are pulled through.
  - Lines carry GST/SST and a WHT section each. Matching gives a 3-way match state with the variance %.
  - Bills go through a 2-level approval route, can be captured with OCR, and can be marked disputed.
- **Purchase voucher** (`PV-`): a counter purchase (`VendorBills.channel = COUNTER`).
  - The grid has Ps-Qty / Bonus / Brk / T-Qty and a markup helper.
  - Pay mode: credit, cash, bank or cheque, with an amount paid now. WHT u/s 153 % and advance tax 236G are applied.
- **Debit notes** (`DN-`): four reasons, input GST reversal and WHT adjustment. Settled by adjusting against the bill or by a refund.
- **Payments** (`PAY-`):
  - **Payment run:** one payment per vendor, by IBFT, cheque, pay order or cash. Cheque number series and crossing, bank charges, and the bulk-IBFT file.
  - **Allocation:** on-account allocation, manual or FIFO, with debit notes usable as credits. WHT is either already withheld at the bill or withheld now.
- **AP ageing and reports** (views): ageing, purchase register, vendor statement, WHT deducted, and purchases by vendor.

### Full additions
- **Vendor banks** (`Purchases.VendorBankAccounts`): several accounts per vendor, with IBAN or SWIFT and currency (for foreign suppliers paid by TT). `Vendors.countryCode` marks foreign suppliers.
- **Purchase returns** (`PR-2026-000001`, app/purchases/returns):
  - Header: supplier, return date, reference purchase (PV or bill), supplier bill number.
  - Payment type: Credit or Cash refund.
  - Reason: expired, damaged, wrong item or quality.
  - Dispatch details: gate pass number, transporter and debit-note narration.
  - Lines: batch, expiry, rate, return qty (limited to the purchased qty), bonus, disc % and GST.
  - Tabs: Effect (stock, payable and GST tiles plus the reversal journal preview) and Additional Information.
  - Statuses: `DRAFT` → `POSTED` → `REFERENCED` (once a debit note is raised from it) · `CANCELLED`.
  - On a Credit return, posting raises the debit note that settles the referenced bill.
- **Landed cost** (`LC-2026-001`, app/purchases/landed-cost; the prototype used a country prefix such as `CN-2026-014`, which is replaced):
  - **Import shipment:** origin, ports, mode and container, B/L, WeBOC GD, LC or TT reference, fx, ETA and cleared date.
  - **Cost lines:** customs duty, ACD, RD, import sales tax, s.148 income tax, freight, haulage, clearing, port, insurance, demurrage, detention, LC charges, excise cess and PSQCA testing. Each has a payee, an "In cost" switch and a "Claimable" flag.
  - **Allocation** by Value, Qty or Weight onto the GRN lines gives the landed unit cost and the % uplift.
  - **Post** creates the journal and revalues the moving-average cost.
  - **Statuses:** `IN_TRANSIT` → `CLEARED` → `POSTED` · `CANCELLED`.
- **Dimensions:** `PurchaseOrders.departmentId` (HumanResources.Departments) and `projectId`, plus `VendorBills.projectId` and `VendorBillLines.projectId` (Accounting.Projects). Budget availability on the PO is read from acc budgets.
- **Payments:** `VendorPayments.chequeBookId` (BankCash.ChequeBooks), so cheque numbers are issued from a registered book.
- **Approvals engine:** the PO, bill and payment approvals run through `Company.Approvals` (polymorphic), which adds the "Nudge" reminders.
- **Tax:** WHT on bills and payments feeds `Tax.WhtDeductions`, `Tax.WhtChallans` (CPR) and `Tax.WhtCertificates`. Input tax and its reversal feed `Tax.SalesTaxReturnLines` (Annex-A).

### Key business rules
All the Basic rules apply: numbering through `Company.getNextDocNo()`, base-unit quantities, insert as DRAFT then post by status change, trigger locks on posted documents, no over-receipt, bill balance maintained from `VendorPaymentAllocations`, same-vendor settlement only, and WHT u/s 153 doubled for vendors not on the ATL. Full adds:
- **Purchase returns:**
  - A return line cannot exceed the purchased qty ("of 24").
  - A Cash refund needs a cash account.
  - A Credit return settles through its debit note.
- **Landed cost shipments:**
  - A shipment can be posted only once it is `CLEARED` and linked to its GRN. Only one live shipment is allowed per GRN.
  - The capitalised total equals the sum of the allocated amounts. Rounding goes to the last line.
  - Import sales tax and s.148 tax are claimable, not cost, unless switched in (the UI warns "will overstate stock cost").
- **Import GRNs** (`GoodsReceivedNotes.isImport`) post stock at the provisional FOB cost and no GL. The landed-cost journal brings the goods into inventory at the full landed value.

### Statuses
| Document | Statuses |
|---|---|
| Vendor | ACTIVE, INACTIVE · ATL: ACTIVE, NOT_ON_ATL, UNVERIFIED |
| Purchase order | DRAFT → PENDING_L1 → PENDING_L2 → APPROVED → PARTIALLY_RECEIVED → RECEIVED → BILLED · CANCELLED |
| GRN | DRAFT → POSTED · CANCELLED · QC PASSED / PARTIAL_REJECT · bill AWAITING / PARTIALLY_BILLED / BILLED · match MATCHED / QTY_VARIANCE / TWO_WAY_BILL_AWAITED / OVER_RECEIPT |
| Bill / PV | DRAFT → AWAITING_APPROVAL → APPROVED → POSTED → PARTIALLY_PAID → PAID · VOID (OVERDUE, DUE_TODAY derived) |
| Debit note | DRAFT → OPEN → APPLIED or REFUNDED · VOID |
| Vendor payment | DRAFT → PENDING_APPROVAL → POSTED → PRESENTED → CLEARED · VOID |
| Purchase return | DRAFT → POSTED → REFERENCED · CANCELLED |
| Landed cost shipment | IN_TRANSIT → CLEARED → POSTED · CANCELLED |

### Integrations
- **FBR ATL check.**
- **Bank:** the bulk-IBFT file.
- **Cheques:** cheque book and cheque register.
- **OCR:** bill capture.
- **Email:** the PO and debit note go to the vendor.
- **Imports:** WeBOC GD and B/L references, and LC or TT through the bank account.
