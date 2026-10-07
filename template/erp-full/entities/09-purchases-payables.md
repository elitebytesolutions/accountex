# 09 — Purchases & Payables

Full edition. The `Purchases` schema covers vendors, PO → GRN → bill, the purchase voucher, debit notes, vendor payments and allocations. Its tables are defined in `database/schema/08-purchase.sql`, its cross-module FKs in `database/fk/08-Purchases-fks.sql`, and its posting in POSTING_RULES §Purchases & payables.

| Route | Screen |
|---|---|
| `app/vendors` | Vendors |
| `app/vendors/view` | Vendor Detail |
| `app/purchases/orders` | Purchase Orders |
| `app/purchases/grn` | Goods Received (GRN) |
| `app/purchases/bills` | Vendor Bills |
| `app/purchases/bills/new` | New Vendor Bill |
| `app/purchases/voucher` | Purchase Voucher |
| `app/purchases/debit-notes` | Debit Notes |
| `app/payables/payments` | Payments & Allocation |
| `app/payables/ageing` | AP Ageing & Reports |
| `app/purchases/returns` | Purchase Returns (Full) |
| `app/purchases/landed-cost` | Landed Cost (Full) |

---

### Vendors — `app/vendors`
*Source:* `src/41-acc-trade.html` (section `app/vendors`, modal `#trd-new-vendor`) · seed `src/91-data.js` (`FS_DATA.vendors`)
**Purpose.** The supplier master list, with FBR filer (ATL) status, WHT profile and payable balances, plus the New Vendor form.
**Tables.** Primary: `Purchases.Vendors`, `Purchases.VendorContacts` · Reads: `Purchases.VendorCategories`, `Accounting.ChartOfAccounts`, view `Purchases.getVendorBalances` · Writes: `Purchases.Vendors`, `Purchases.VendorContacts`, `Company.AuditTrailEntries`
**Functions.** Save → `Purchases.vendorAddUpdate` · Open → `Purchases.getVendorInfo`
**Lookups.** `Vendors.atlStatus` → `VendorAtlStatus` · `Vendors.defaultWhtSection` → `DefaultWhtSection` · `Vendors.paymentTerms` → `PurchaseOrderPaymentTerms` · `Vendors.status` → `ActiveInactiveStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Active Vendors / categories | `Vendors.status`, `Vendors.categoryId` | count of `ACTIVE` / distinct categories |
| KPI Total Payable (net of WHT), Overdue, vendors overdue | `vVendorBalance.payableBalance`, `.overdueAmount` | derived |
| KPI Not on ATL | `Vendors.atlStatus = 'NOT_ON_ATL'` | "WHT at double rate" |
| Search vendor, NTN, category | `Vendors.name` (trigram), `Vendors.ntn`, `VendorCategories.name` | |
| Filter Category | `Vendors.categoryId` | |
| Chips All / Active Taxpayer / Not on ATL / With balance | `Vendors.atlStatus`, `vVendorBalance.payableBalance > 0` | |
| Vendor (avatar, name, VEN-0003) | `Vendors.name`, `Vendors.code` | |
| Category | `VendorCategories.name` | |
| NTN (or "CNIC 35102-…") | `Vendors.ntn` / `Vendors.cnic` | |
| City | `Vendors.city` | |
| Filer status | `Vendors.atlStatus` | Active Taxpayer / Not on ATL |
| WHT | `Vendors.defaultWhtSection` + rate from the tax master | "153(1)(a) 5%", doubled to 10% when not on the ATL; "Exempt" |
| Payable (Rs) / Overdue | `vVendorBalance.payableBalance` / `.overdueAmount` | |
| New Vendor: number VEN-0067 | `Vendors.code` | `Company.getNextDocNo('VEN')` |
| Vendor name * | `Vendors.name` (+ `legalName`) | |
| Category | `Vendors.categoryId` → `VendorCategories` | |
| NTN / CNIC | `Vendors.ntn` / `Vendors.cnic` | format CHECKs |
| STRN | `Vendors.strn` | |
| Default WHT section | `Vendors.defaultWhtSection` | 153_1_A / 153_1_B / 153_1_C / EXEMPT |
| Expense / inventory a/c | `Vendors.defaultAccountId` | → `Accounting.ChartOfAccounts` |
| Contact person / Phone / Email | `VendorContacts.fullName` (isPrimary), `Vendors.phone`, `Vendors.email` | |
| Payment terms | `Vendors.paymentTerms`, `Vendors.creditDays` | Net 30 / Net 15 / Advance |
| Bank / IBAN | `Vendors.bankName`, `Vendors.iban` | PK IBAN CHECK; further accounts in `Purchases.VendorBankAccounts` (Full) |
| (foreign supplier) | `Vendors.countryCode` | Full; landed-cost vendors |

**Statuses.** Vendor `ACTIVE` / `INACTIVE` · ATL `ACTIVE` / `NOT_ON_ATL` / `UNVERIFIED`
**Actions → effects.**
- *Verify ATL* → FBR ATL lookup; updates `Vendors.atlStatus` and `atlVerifiedAt` for every vendor.
- *Save vendor* → INSERT into `vendor` and `VendorContacts`; the ATL check runs on save; audited.
- *Export* → Excel of the list.

**Permission.** `ven:view`, `ven:create`, `ven:edit`, `ven:verifyAtl` · **Approval.** —

### Vendor Detail — `app/vendors/view`
*Source:* `src/41-acc-trade.html` (section `app/vendors/view`, tabs ov / bills / pays / stmt / docs)
**Purpose.** Vendor 360: identity and compliance, KPIs, bills, payments, statement and documents.
**Tables.** Primary: `Purchases.Vendors` · Reads: `Purchases.VendorContacts`, `Purchases.VendorBills`, `Purchases.VendorPayments`, `Purchases.VendorPaymentAllocations`, `Company.Attachments`, views `Purchases.getVendorBalances`, `Purchases.getVendorStatement` · Writes: `Purchases.Vendors` (Edit), `Company.Attachments` (Upload document)
**Functions.** Save → `Purchases.vendorAddUpdate` · Open → `Purchases.getVendorInfo`
**Lookups.** `Vendors.atlStatus` → `VendorAtlStatus` · `Vendors.defaultWhtSection` → `DefaultWhtSection` · `Vendors.paymentTerms` → `PurchaseOrderPaymentTerms` · `Vendors.status` → `ActiveInactiveStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Name / legal name | `Vendors.name`, `Vendors.legalName` | "Siemens Pakistan Engineering Co. Ltd" |
| VEN-0003 · category · address · Vendor since | `Vendors.code`, `VendorCategories.name`, `Vendors.address`, `Vendors.city`, `Vendors.vendorSince` | |
| Badges Active Taxpayer / STRN registered / WHT 153(1)(a) 5% / 1 overdue bill | `Vendors.atlStatus`, `Vendors.strn IS NOT NULL`, `Vendors.defaultWhtSection`, `vVendorBalance.overdueBillsCount` | |
| KPI Payable Balance · open bills | `vVendorBalance.payableBalance`, `.openBillsCount` | |
| KPI Overdue · oldest bill · days | `getVendorBalances.overdueAmount`, `.oldestOverdueDays` | |
| KPI Purchases YTD · bills | `vVendorBalance.purchasesYtd`, `.billsYtd` | fiscal year July–June |
| KPI WHT Deducted YTD · certificates | `vVendorBalance.whtYtd` | certificates issued from `Tax.WhtCertificates` (Full) |
| Overview: NTN, STRN, Payment terms, Payable a/c, Bank | `Vendors.ntn`, `.strn`, `.paymentTerms`, `.payableAccountId`, `.bankName` + `.iban` | |
| Primary contact: Name, Role, Phone, Email | `VendorContacts.fullName`, `.designation`, `.phone` / `.mobile`, `.email` | `isPrimary` |
| Performance: On-time delivery %, Price variance incidents, Avg days we pay | derived: `GoodsReceivedNotes.docDate` vs `PurchaseOrders.expectedDate`; `VendorBills.matchStatus = 'PRICE_VARIANCE'`; allocation date − bill date | **[simulated]** in the prototype; computed by a view |
| Bills tab: Bill #, Date, Due, Amount, WHT, Balance, Status | `VendorBills.docNo`, `.docDate`, `.dueDate`, `.totalAmount`, `.whtAmount`, `.balanceAmount`, `.status` | Overdue is derived |
| Payments tab: Payment #, Date, Method (Cheque #), Bank, Against, Amount | `VendorPayments.docNo`, `.docDate`, `.method`, `.chequeNo`, `.bankAccountId`, allocations → `VendorBills.docNo` (or `.remarks` such as "Opening balance"), `.amount` | |
| Statement tab: period, Date, Document, Narration, Debit, Credit, Balance (Cr) | `getVendorStatement` | opening balance from `Accounting.OpeningBalanceLines` (vendorId) |
| Documents: NTN Certificate, STRN, Supply Agreement (expires), WHT Certificate | `Company.Attachments` (entityType `VEN`) | expiry and verified dates are stored as attachment metadata |

**Statuses.** Vendor `ACTIVE` / `INACTIVE`; bills as on Vendor Bills.
**Actions → effects.**
- *Edit* → UPDATE `vendor`.
- *New Bill* → `app/purchases/bills/new` prefilled.
- *Pay vendor* → `app/payables/payments` filtered to this vendor.
- *PDF* (statement) → rendered from `getVendorStatement`.
- *Upload document* → `Company.Attachments`.

**Permission.** `ven:view`, `ven:edit`, `ap:statement` · **Approval.** —

### Purchase Orders — `app/purchases/orders`
*Source:* `src/41-acc-trade.html` (section `app/purchases/orders`, modal `#trd-new-po`)
**Purpose.** Orders issued to vendors, with an approval workflow, goods-receipt progress and billing status.
**Tables.** Primary: `Purchases.PurchaseOrders`, `Purchases.PurchaseOrderLines` · Reads: `Purchases.Vendors`, `Inventory.Products`, `Tax.TaxCodes`, `Company.Branches`, `Accounting.CostCentres`, `Purchases.GoodsReceivedNotes`, `Purchases.VendorBills` · Writes: `Purchases.PurchaseOrders(Line)`, `Company.Notifications`, `Company.AuditTrailEntries`
**Functions.** Save → `Purchases.purchaseOrderAddUpdate` · Open → `Purchases.getPurchaseOrderInfo` · Actions → `Purchases.purchaseOrderApprove`, `Purchases.purchaseOrderCancel`
**Lookups.** `PurchaseOrders.paymentTerms` → `PurchaseOrderPaymentTerms` · `PurchaseOrders.status` → `PurchaseOrderStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Open POs · not fully received | Σ `PurchaseOrders.totalAmount` where status IN (APPROVED, PARTIALLY_RECEIVED) | |
| KPI Pending Approval · approver | status IN (PENDING_L1, PENDING_L2) | approver comes from company approval settings |
| KPI Awaiting Receipt · expected today | status IN (APPROVED, PARTIALLY_RECEIVED), `expectedDate` | |
| KPI Spend FY 26-27 · within budget | Σ `totalAmount` for the FY vs `Accounting.BudgetVersionLines` | Full |
| Search PO #, vendor / filter vendor | `docNo`, `Vendors.name` / `vendorId` | |
| Chips All / Draft / Pending Approval / Approved / Billed / Cancelled | `PurchaseOrders.status` | |
| PO # | `PurchaseOrders.docNo` | PO-2026-000065 |
| Buyer avatar (Usman Ali / Kashif Ali) | `PurchaseOrders.buyerUserId` | → `Company.Users` |
| Vendor · category | `Vendors.name`, `VendorCategories.name` | |
| Order Date / Expected | `docDate` / `expectedDate` | |
| Deliver to | `branchId` (+ `warehouseId`) | |
| Received ("10 of 15 laptops · GRN-0412", "Not sent", "Short 1,600 cartons", BILL-…) | `PurchaseOrderLines.receivedQty` vs `baseQty`, `sentToVendorAt`, the latest `GoodsReceivedNotes.docNo` / `VendorBills.docNo` | derived (`getThreeWayMatch`) |
| Amount (Rs) | `PurchaseOrders.totalAmount` | |
| Approval (Draft / Pending · L1 / L2 / Approved / Billed) | `PurchaseOrders.status` | |
| New PO: number | `docNo` | `Company.getNextDocNo('PO')` |
| Vendor * / Order date / Expected delivery | `vendorId` / `docDate` / `expectedDate` | |
| Deliver to | `branchId` | |
| Payment terms | `paymentTerms`, `creditDays` | Net 30 / Net 45 / Advance |
| Department | `costCentreId` + `departmentId` (Full → `HumanResources.Departments`) | Procurement / IT / Warehouse / Administration |
| Lines: Item, Qty, Rate, Tax, Amount | `PurchaseOrderLines.itemId`, `.baseQty`, `.rate`, `.taxCodeId` + `.taxRate`, `.netAmount` | |
| Subtotal / GST 18% / PO total | `PurchaseOrders.netAmount` / `.taxAmount` / `.totalAmount` | |
| Budget (IT Hardware, Q2) remaining | `projectId` / account + cost centre vs `Accounting.BudgetVersionLines` | Full |

**Statuses.** DRAFT → PENDING_L1 → PENDING_L2 → APPROVED → PARTIALLY_RECEIVED → RECEIVED → BILLED · CANCELLED. Receipt and billing states are set by `Purchases.refreshPurchaseOrderStatus()` from the GRN and bill posting triggers.
**Actions → effects.**
- *Save draft* → INSERT `DRAFT`.
- *Submit for approval* → `PENDING_L1` (or `APPROVED` below the threshold); sets `submittedAt` and notifies the approver.
- *Approve* → `PENDING_L2` / `APPROVED`; sets `approvedByUserId` and `approvedAt`; the PO PDF is emailed and `sentToVendorAt` is set.
- *Nudge* → `Company.Notifications` to the pending approver.
- *Receive* → `app/purchases/grn` for this PO.
- *Bill* → `app/purchases/bills/new` with the PO and lines.
- *Debit note* → `app/purchases/debit-notes`.
- *Cancel* → `CANCELLED` (`cancelledAt`, `cancelReason`).

**Permission.** `po:view`, `po:create`, `po:approve`, `po:cancel` · **Approval.** Above Rs 500,000, L1 then L2, through `Company.ApprovalWorkflows` / `Company.Approvals` (Nudge = reminder on the pending step).

### Goods Received (GRN) — `app/purchases/grn`
*Source:* `src/44-purchase-docs.html` (section `pd-grn`) · `src/94-purchase-docs.js` (GRN engine: `grnLoad`, `grnCalc`, `grnPost`)
**Purpose.** Receive against purchase orders, record QC results and keep PO ↔ GRN ↔ Bill in step.
**Tables.** Primary: `Purchases.GoodsReceivedNotes`, `Purchases.GoodsReceivedNoteLines` · Reads: `Purchases.PurchaseOrders(Line)`, `Purchases.Vendors`, `Purchases.VendorBillLines`, `Inventory.Products`, `Inventory.Warehouses` · Writes: `Purchases.GoodsReceivedNotes(Line)`, `Purchases.PurchaseOrderLines.receivedQty`, `Inventory.ProductBatches`, `Inventory.StockMovements`, `Accounting.Vouchers`
**Functions.** Save → `Purchases.goodsReceivedNoteAddUpdate` · Open → `Purchases.getGoodsReceivedNoteInfo` · Actions → `Purchases.goodsReceivedNotePost`, `Purchases.goodsReceivedNoteCancel`
**Lookups.** `GoodsReceivedNotes.qcStatus` → `QcStatus` · `GoodsReceivedNotes.matchStatus` → `GoodsReceivedNoteMatchStatus` · `GoodsReceivedNotes.billStatus` → `BillStatus` · `GoodsReceivedNotes.status` → `DraftPostedCancelledStatus` · `GoodsReceivedNoteLines.rejectReason` → `RejectReason` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI GRNs this month | count of `grn` (POSTED) in the month | |
| KPI Open PO lines · across POs | `PurchaseOrderLines` with `receivedQty < baseQty + bonusQty` on open POs | |
| KPI QC rejection rate | Σ `GoodsReceivedNoteLines.rejectedQty` / Σ `receivedQty` | |
| KPI Received, not billed · GRNs awaiting bill | Σ `GoodsReceivedNotes.acceptedAmount` where `billStatus <> 'BILLED'` | |
| Purchase order select | `GoodsReceivedNotes.purchaseOrderId` | only APPROVED / PARTIALLY_RECEIVED POs |
| Meta: Vendor, PO date, Expected, Vendor bill, Lines | `PurchaseOrders.vendorId`, `.docDate`, `.expectedDate`, `GoodsReceivedNotes.vendorRef` | |
| Item (sku · unit · cost) | `GoodsReceivedNoteLines.itemId`, `.unitCost` | |
| Ordered / Prev. recv. | `GoodsReceivedNoteLines.orderedQty`, `.prevReceivedQty` | snapshots of the PO line |
| Received now / Accepted / Rejected | `GoodsReceivedNoteLines.receivedQty`, `.acceptedQty`, `.rejectedQty` | CHECK received = accepted + rejected |
| Reason | `GoodsReceivedNoteLines.rejectReason` | DAMAGED_IN_TRANSIT / SHORT_EXPIRY / WRONG_ITEM / FAILED_QC / EXCESS_OVER_PO; required when rejected > 0 |
| Progress "prev + accepted / ordered · complete" | derived from the line quantities | |
| (batch, expiry, cost for the stock ledger) | `GoodsReceivedNoteLines.batchNo`, `.expiryDate`, `.batchId`, `.unitCost` | |
| QC note | `GoodsReceivedNotes.qcNote` | |
| 3-way match nodes PO / GRN / Bill + badge | `GoodsReceivedNotes.matchStatus` | MATCHED / QTY_VARIANCE / TWO_WAY_BILL_AWAITED / OVER_RECEIPT |
| Units received now / Accepted value / Rejected (debit note) | `GoodsReceivedNotes.receivedQty`, `.acceptedAmount`, `.rejectedAmount` | |
| Receive into | `GoodsReceivedNotes.warehouseId` | |
| Register: GRN #, Date, Purchase Order, Vendor, Warehouse, Units, Value, QC, Bill | `GoodsReceivedNotes.docNo`, `.docDate`, `PurchaseOrders.docNo`, `Vendors.name`, `warehouse`, `.receivedQty`, `.acceptedAmount`, `.qcStatus`, `.billStatus` | QC Passed / Partial reject; Bill Billed / Awaiting |

**Statuses.** GRN DRAFT → POSTED · CANCELLED · QC `PASSED` / `PARTIAL_REJECT` · bill `AWAITING` / `PARTIALLY_BILLED` / `BILLED`.
**Actions → effects.**
- *Receive all remaining* → fills received = ordered − previous.
- *Post GRN* → validates (at least one unit, no over-receipt, a reason for every rejection), then:
  - `grn` → `POSTED`;
  - `Inventory.StockMovements` IN for the accepted qty, with batch and expiry;
  - journal Dr Inventory / Cr GRNI (POSTING_RULES §GRN);
  - PO line `receivedQty` and PO status updated by trigger.
- The toast's *Create bill* → `app/purchases/bills/new`.
- *Export* register.

**Permission.** `grn:view`, `grn:post`, `grn:cancel` · **Approval.** —

### Vendor Bills — `app/purchases/bills`
*Source:* `src/41-acc-trade.html` (section `app/purchases/bills`, modal `#po-bill-pay`)
**Purpose.** Supplier invoices with input tax, withholding at source and 3-way match. Bulk pay from the list.
**Tables.** Primary: `Purchases.VendorBills` · Reads: `Purchases.Vendors`, `Purchases.PurchaseOrders`, `Purchases.VendorPaymentAllocations`, `BankCash.BankAccounts` · Writes: `Purchases.VendorBills` (approve), `Purchases.VendorPayments` + `Purchases.VendorPaymentAllocations` (Pay selected), `Company.Attachments` (OCR)
**Functions.** Save → `Purchases.vendorBillAddUpdate` · Open → `Purchases.getVendorBillInfo` · Actions → `Purchases.vendorBillApprove`, `Purchases.vendorBillPost`, `Purchases.vendorBillVoid`
**Lookups.** `VendorBills.channel` → `VendorBillChannel` · `VendorBills.captureMethod` → `CaptureMethod` · `VendorBills.payMode` → `VendorBillPayMode` · `VendorBills.matchStatus` → `VendorBillMatchStatus` · `VendorBills.status` → `VendorBillStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Total Payable (net of WHT) · open bills | Σ `VendorBills.balanceAmount` (POSTED / PARTIALLY_PAID) | |
| KPI Overdue · vendors | `balanceAmount` where `dueDate < today` | derived |
| KPI Due Next 7 Days | `dueDate` between today and today + 7 | |
| KPI WHT Deducted (Sep) · deposit by 15 Oct (CPR) | Σ `VendorBills.whtAmount` (+ `VendorPayments.whtAmount`) for the month | |
| Search bill #, vendor ref, vendor | `VendorBills.docNo`, `VendorBills.vendorInvoiceNo` (trigram), `Vendors.name` | |
| Filter match state | `VendorBills.matchStatus` | |
| Chips All / Awaiting Approval / Approved / Partially Paid / Overdue / Paid | `VendorBills.status`; Overdue derived | |
| Bill # · vendor ref | `VendorBills.docNo`, `VendorBills.vendorInvoiceNo` | |
| Vendor · PO / "Telecom", "Karachi branch" | `Vendors.name`, `PurchaseOrders.docNo` or `VendorBills.remarks` | |
| Bill Date / Due | `VendorBills.docDate` / `VendorBills.dueDate` | |
| Amount / WHT / Balance | `VendorBills.totalAmount` / `.whtAmount` / `.balanceAmount` | |
| 3-way match (Matched / Qty variance −8% / Price variance +4% / No PO) | `VendorBills.matchStatus`, `VendorBills.matchVariancePct` | |
| Status (Approved / Awaiting Approval / Partially Paid / Paid / Overdue / Due today) | `VendorBills.status`; Overdue and Due today derived from `dueDate` | |
| Pay selected modal: bills, total, Payment date, Method, Pay from | creates one `VendorPayments` per vendor (`docDate`, `method`, `bankAccountId`) plus a `VendorPaymentAllocations` per bill | "WHT already withheld at bill" → `whtTreatment = ALREADY_WITHHELD` |

**Statuses.** DRAFT → AWAITING_APPROVAL → APPROVED → POSTED → PARTIALLY_PAID → PAID · VOID · OVERDUE / DUE_TODAY derived (`dueDate` vs today with `balanceAmount > 0`).
**Actions → effects.**
- *Scan bill (OCR)* → `Company.Attachments` plus a draft bill with `captureMethod = 'OCR'`.
- *Approve* → `approvedByUserId` and `approvedAt`; final approval posts the bill (journal, per POSTING_RULES §Vendor bill).
- *Pay selected / Confirm payment* → `VendorPayments` (one per vendor) + `VendorPaymentAllocations` → the bill balance and status are updated by trigger.
- *Export*.

**Permission.** `bill:view`, `bill:approve`, `pay:create` · **Approval.** Finance Manager above Rs 1,000,000; CEO above Rs 2,500,000 (company settings).

### New Vendor Bill — `app/purchases/bills/new`
*Source:* `src/41-acc-trade.html` (section `app/purchases/bills/new`)
**Purpose.** Record a supplier invoice, claim input tax and deduct WHT at source, pulling lines from a PO and GRN.
**Tables.** Primary: `Purchases.VendorBills`, `Purchases.VendorBillLines` · Reads: `Purchases.Vendors`, `Purchases.PurchaseOrders(Line)`, `Purchases.GoodsReceivedNotes(Line)`, `Inventory.Products`, `Accounting.ChartOfAccounts`, `Accounting.CostCentres`, `Tax.TaxCodes`, `Company.Branches` · Writes: `Purchases.VendorBills(Line)`, `Company.Attachments`, `Accounting.Vouchers` (on post), `Inventory.StockMovements` (stock lines without GRN)
**Functions.** Save → `Purchases.vendorBillAddUpdate` · Open → `Purchases.getVendorBillInfo` · Actions → `Purchases.vendorBillApprove`, `Purchases.vendorBillPost`, `Purchases.vendorBillVoid`
**Lookups.** `VendorBills.channel` → `VendorBillChannel` · `VendorBills.captureMethod` → `CaptureMethod` · `VendorBills.payMode` → `VendorBillPayMode` · `VendorBills.matchStatus` → `VendorBillMatchStatus` · `VendorBills.status` → `VendorBillStatus` · `VendorBillLines.whtSection` → `WhtSection` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| BILL-2026-000088 | `VendorBills.docNo` | `Company.getNextDocNo('BILL')`; `channel = 'STANDARD'` |
| Vendor * | `VendorBills.vendorId` | |
| Purchase order (· amount / — none —) | `VendorBills.purchaseOrderId` | NULL → `matchStatus = 'NO_PO'` |
| GRN | `VendorBills.grnId` | |
| Vendor invoice # * | `VendorBills.vendorInvoiceNo` | duplicate warning through `billVendorInvoiceIdx` |
| Bill date * / Due date | `VendorBills.docDate` / `VendorBills.dueDate` | due date defaults to the vendor's creditDays |
| Branch | `VendorBills.branchId` | |
| Payable account | `VendorBills.payableAccountId` | defaults to `Vendors.payableAccountId` |
| Currency | `VendorBills.currencyCode`, `VendorBills.fxRate` | |
| ATL banner: NTN · STRN · input tax claimable · WHT rates | `Vendors.atlStatus`, `.ntn`, `.strn`, `.defaultWhtSection` | |
| "3-way match: PO ✓ · GRN ✓ · price ✓" | `VendorBills.matchStatus`, `.matchVariancePct` | computed on save / submit |
| Line: Item / description | `VendorBillLines.itemId` / `.description` | |
| Account | `VendorBillLines.accountId` | 1310 Inventory / 5420 Freight Inward / 5310 IT Support |
| Qty / Rate | `VendorBillLines.baseQty` / `.rate` | |
| Tax (GST 18% / SST 15%) | `VendorBillLines.taxCodeId`, `.taxRate`, `.taxAmount` | |
| WHT section (153(1)(a) 5% / (b) 8%) | `VendorBillLines.whtSection`, `.whtRate`, `.whtAmount` | |
| Amount | `VendorBillLines.netAmount` | |
| PO ✓ | `VendorBillLines.purchaseOrderLineId` / `.grnLineId` | |
| Cost centre: IT · Project: Branch refresh 2026 | `VendorBills.costCentreId` / `VendorBills.projectId`, `VendorBillLines.costCentreId` / `VendorBillLines.projectId` | project → `Accounting.Projects` (Full) |
| Attachments (vendor invoice, GRN) | `Company.Attachments` (entityType `BILL`) | |
| Internal memo | `VendorBills.remarks` | |
| Goods value / Services value | Σ `VendorBillLines.netAmount` by stock vs non-stock | |
| Input GST 18% / Input SST 15% (Sindh) | Σ `VendorBillLines.taxAmount` by tax code | header `VendorBills.taxAmount` |
| Bill total | `VendorBills.totalAmount` | |
| WHT u/s 153(1)(a) @5% / 153(1)(b) @8% | Σ `VendorBillLines.whtAmount` by section | header `VendorBills.whtAmount` |
| Net payable to vendor | `VendorBills.netPayableAmount` | |
| Posting preview | built from POSTING_RULES §Vendor bill | |
| Approval route (Prepared → Finance Manager → CEO) | `VendorBills.status`, `approvedByUserId`; thresholds in company settings | |

**Statuses.** DRAFT → AWAITING_APPROVAL → APPROVED → POSTED (then PARTIALLY_PAID → PAID) · VOID.
**Actions → effects.**
- *Load from PO* → `VendorBillLines` rows from the open `PurchaseOrderLines` / `GoodsReceivedNoteLines` quantities.
- *Add line* / remove line.
- *Save draft* → `DRAFT`.
- *Submit for approval* → `AWAITING_APPROVAL`.
- Final approval → `POSTED`: journal; `billedQty` roll-ups on the PO and GRN lines; `GoodsReceivedNotes.billStatus` and `matchStatus`.
- *Cancel* → leaves the page.

**Permission.** `bill:create`, `bill:submit`, `bill:approve`, `bill:post` · **Approval.** Bills above Rs 1,000,000 (Finance Manager) and above Rs 2,500,000 (CEO).

### Purchase Voucher — `app/purchases/voucher`
*Source:* `src/44-purchase-docs.html` (section `pd-pv`) · `src/94-purchase-docs.js` (PV engine: `pvCalc`, `pvTotals`, `pvReview`, `pvPost`)
**Purpose.** Record a counter purchase in one flow: update inventory and settle the supplier (on credit or paid now), with WHT u/s 153 deducted automatically.
**Tables.** Primary: `Purchases.VendorBills` (`channel = 'COUNTER'`), `Purchases.VendorBillLines` · Reads: `Purchases.Vendors`, `Inventory.Products`, `Inventory.ProductBarcodes`, `Inventory.StockBalances`, `BankCash.BankAccounts`, `BankCash.CashAccounts`, `Sales.SalesInvoiceLines` (Previous Sale) · Writes: `Purchases.VendorBills(Line)`, `Purchases.Vendors` (Quick add supplier), `Inventory.StockMovements`, `Inventory.ProductBatches`, `Inventory.Products` (sale price), `BankCash.Cheques`, `Accounting.Vouchers`
**Functions.** Save → `Purchases.vendorBillAddUpdate` · Open → `Purchases.getVendorBillInfo` · Actions → `Purchases.vendorBillApprove`, `Purchases.vendorBillPost`, `Purchases.vendorBillVoid`
**Lookups.** `VendorBills.channel` → `VendorBillChannel` · `VendorBills.captureMethod` → `CaptureMethod` · `VendorBills.payMode` → `VendorBillPayMode` · `VendorBills.matchStatus` → `VendorBillMatchStatus` · `VendorBills.status` → `VendorBillStatus` · `VendorBillLines.whtSection` → `WhtSection` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Ref. No. PV-2026-000318 (gear: auto / manual number) | `VendorBills.docNo` | `Company.getNextDocNo('PV')`; manual override allowed |
| Purchase Type Shop / Warehouse | `VendorBills.warehouseId` | the location is filtered by `Inventory.Warehouses.type` (SHOP / WAREHOUSE) |
| Product Purchase on Retail Price (%) | `VendorBills.retailPriceDiscountPct` | discount off MRP |
| Deal on Supply | `VendorBills.dealOnSupply` | |
| Supplier * (+ quick add: name, NTN, city, ATL filer) | `VendorBills.vendorId`; quick add → `Vendors.name`, `.ntn`, `.city`, `.atlStatus` | |
| Supplier Bill # * | `VendorBills.vendorInvoiceNo` | |
| Salesman Code (SM-001 · Usman Ali) | `VendorBills.purchaserUserId` | our purchaser (Bhatti DPMAN) |
| Due Date | `VendorBills.dueDate` | |
| If Credit — Yes | `VendorBills.payMode = 'CREDIT'` | |
| Grid: UPC | `VendorBillLines.upc` (snapshot of `Inventory.ProductBarcodes`) | scan or search adds a line |
| Product Name * | `VendorBillLines.itemId` | |
| LS / Shelf / S/W | — | read-only stock hints from `Inventory.StockBalances` / `Inventory.Products`; **[simulated]** |
| Pur. Price / Sale Price | `VendorBillLines.rate` / `VendorBillLines.salePrice` (+ `updateItemSalePrice`) | |
| Ps-Qty / Bonus / Brk / T-Qty | `VendorBillLines.baseQty` / `.bonusQty` / `.breakageQty` / `.totalQty` (generated) | T = Ps + Bonus − Brk |
| %GST / %Disc | `VendorBillLines.taxRate` (+ `taxCodeId`) / `.discountPct` | |
| Cost / Amount | `VendorBillLines.grossAmount` / `.totalAmount` | cost = price × Ps-Qty; amount = cost − disc + GST |
| (batch / expiry) | `VendorBillLines.batchNo`, `.expiryDate`, `.batchId` | lesson from Bhatti DPURCHASE |
| Sale Price is X% greater than Purchase Price | UI helper → `VendorBillLines.salePrice` | not stored |
| More info: Previous Sale, History (purchases from supplier), Available Stock (Location / Stock / Reserved / Avail.) | `Sales.SalesInvoiceLines`, `Purchases.VendorBills`, `Inventory.StockBalances` | per-location split and reserved are **[simulated]** |
| Payment Mode On Credit / Cash / Bank Transfer / Cheque | `VendorBills.payMode` | CREDIT / CASH / BANK / CHEQUE |
| Bank / Cash Account (Payable account when on credit) | `VendorBills.bankAccountId` / `VendorBills.cashAccountId` (/ `payableAccountId`) | |
| Cheque No. | `VendorBills.chequeNo` → `BankCash.Cheques` (`VendorBills.chequeId`) | |
| WHT u/s 153(1)(a) deduction % (5.5 filer / 11 non-filer) | `VendorBillLines.whtSection = '153_1_A'`, `.whtRate`; header `VendorBills.whtAmount` | |
| Amount paid now (Full / 50% / None) | `VendorBills.paidNowAmount` | ≤ net payable |
| Settlement bar: Paid now / WHT withheld / Balance payable | `VendorBills.paidNowAmount` / `.whtAmount` / `.balanceAmount` | |
| Review & Post checklist | validation | supplier, bill #, lines, prices, payment within payable |
| Journal preview | POSTING_RULES §Purchase voucher | |
| Ticket: Supplier, Supplier Bill #, Date, Due Date, Purchase Type, Total, DRAFT/POSTED | `bill.*`, `VendorBills.status` | |
| Totals: Total Items, Total Quantity, Stock After Posting | count of lines, Σ `totalQty`, `Inventory.StockBalances` + qty | derived |
| Gross Amount / Total Discount / Sales Tax (GST) | `VendorBills.grossAmount` / `.discountAmount` / `.taxAmount` | |
| Advance Tax u/s 236G | `VendorBills.advanceTaxAmount` | |
| Net Amount | `VendorBills.totalAmount` | |
| Tax Summary: Taxable, Input Sales Tax, Advance Tax 236G, WHT 153 withheld, Total Tax | `VendorBills.netAmount`, `.taxAmount`, `.advanceTaxAmount`, `.whtAmount` | |
| Notes | `VendorBills.remarks` | |

**Statuses.** DRAFT → POSTED / PARTIALLY_PAID / PAID (set at post from paid now) · VOID. Posting locks the voucher; corrections go through a Purchase Return (`app/purchases/returns`).
**Actions → effects.**
- *Save as Draft* → `DRAFT`.
- *Save & Post* → `POSTED`, which:
  - writes stock IN of `totalQty` at `netUnitCost` to `Inventory.StockMovements`;
  - recomputes the moving-average cost;
  - posts the journal;
  - issues the cheque, if any;
  - updates the item sale prices that were flagged.
- *Print*.
- *Import* lines from Excel.
- *First Receipt* (print).
- *Price Comparison* → drawer over `VendorBillLines` history by vendor.
- Quick links: New Product, Bulk Payment, Cash Payment, Pending PO.

**Permission.** `pv:create`, `pv:post` · **Approval.** —

### Debit Notes — `app/purchases/debit-notes`
*Source:* `src/41-acc-trade.html` (section `app/purchases/debit-notes`, modal `#trd-new-dn`)
**Purpose.** Purchase returns and claims raised on vendors, with automatic input tax reversal.
**Tables.** Primary: `Purchases.DebitNotes`, `Purchases.DebitNoteLines` · Reads: `Purchases.VendorBills(Line)`, `Purchases.Vendors`, `Inventory.Warehouses` · Writes: `Purchases.DebitNotes(Line)`, `Purchases.VendorPaymentAllocations`, `Inventory.StockMovements`, `Accounting.Vouchers`, `Company.Notifications` (email)
**Functions.** Save → `Purchases.debitNoteAddUpdate` · Open → `Purchases.getDebitNoteInfo` · Actions → `Purchases.debitNoteVoid`, `Purchases.debitNotePost`
**Lookups.** `DebitNotes.reason` → `DebitNoteReason` · `DebitNotes.settlement` → `DebitNoteSettlement` · `DebitNotes.status` → `DebitNoteStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Raised FY · count | Σ `DebitNotes.totalAmount` for the FY | |
| KPI Open Claims | Σ `DebitNotes.balanceAmount` where status `OPEN` | |
| KPI Input Tax Reversed · reported in return | Σ `DebitNotes.taxAmount` | |
| Search DN #, bill, vendor / chips All, Open, Applied, Refunded | `docNo`, `VendorBills.docNo`, `Vendors.name` / `status` | |
| Debit Note # | `DebitNotes.docNo` | DN-2026-000012 |
| Vendor · branch | `Vendors.name`, `DebitNotes.branchId` | |
| Date | `DebitNotes.docDate` | |
| Against Bill | `DebitNotes.billId` → `VendorBills.docNo` | |
| Reason ("Short supply — 1,600 cartons") | `DebitNotes.reason` + `.reasonNote` | |
| Value / Tax / Total | `.netAmount` / `.taxAmount` / `.totalAmount` | |
| Status | `DebitNotes.status` | Open / Applied / Refunded |
| New: DN number | `docNo` | `Company.getNextDocNo('DN')` |
| Vendor * / Against bill * / Date | `vendorId` / `billId` / `docDate` | |
| Reason | `reason` | PURCHASE_RETURN / PRICE_VARIANCE / SHORT_SUPPLY / QUALITY_REJECTION |
| Return from warehouse | `warehouseId` | required for a return or QC rejection |
| Settlement | `settlement` | ADJUST_AGAINST_BILL / REQUEST_REFUND |
| Lines: Item, Billed qty, Return qty, Rate, Tax, Amount | `DebitNoteLines.itemId`, `.billedQty`, `.returnQty`, `.rate`, `.taxCodeId` + `.taxAmount`, `.netAmount` | |
| Value / Input GST reversed / WHT adjustment (5%) / Debit note total | `DebitNotes.netAmount` / `.taxAmount` / `.whtAmount` / `.totalAmount` | `creditAmount = total − wht` |

**Statuses.** DRAFT → OPEN → APPLIED or REFUNDED · VOID.
**Actions → effects.**
- *Create debit note* → INSERT `DRAFT` + lines, then post:
  - `OPEN`, with the journal per POSTING_RULES §Debit note;
  - stock OUT for a return or QC rejection;
  - with settlement Adjust: a `VendorPaymentAllocations` to the bill, after which the DN becomes `APPLIED` by trigger;
  - the DN is emailed to the vendor (`emailedAt`).
- Row *send* / *print*.
- *Export*.

**Permission.** `dn:view`, `dn:create`, `dn:post` · **Approval.** —

### Payments & Allocation — `app/payables/payments`
*Source:* `src/41-acc-trade.html` (section `app/payables/payments`, modal `#po-pay-alloc`)
**Purpose.** A payment run: select approved bills, choose the paying bank and generate payments, cheques and WHT entries in one go. Also allocates on-account payments.
**Tables.** Primary: `Purchases.VendorPayments`, `Purchases.VendorPaymentAllocations` · Reads: `Purchases.VendorBills`, `Purchases.DebitNotes`, `Purchases.Vendors`, `BankCash.BankAccounts`, `BankCash.CashAccounts`, `BankCash.Cheques` · Writes: `Purchases.VendorPayments`, `Purchases.VendorPaymentAllocations`, `BankCash.Cheques`, `Accounting.Vouchers`
**Functions.** Save → `Purchases.vendorPaymentAddUpdate` · Open → `Purchases.getVendorPaymentInfo` · Actions → `Purchases.vendorPaymentPost`, `Purchases.vendorPaymentVoid`
**Lookups.** `VendorPayments.method` → `VendorPaymentMethod` · `VendorPayments.whtTreatment` → `WhtTreatment` · `VendorPayments.whtSection` → `WhtSection` · `VendorPayments.status` → `VendorPaymentStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Filter Due by / All due / Overdue only; vendor | `VendorBills.dueDate`, `VendorBills.vendorId` | open bills = POSTED / PARTIALLY_PAID |
| Bill # · overdue / due badge | `VendorBills.docNo`, derived from `dueDate` | "Awaiting approval" rows are disabled (status AWAITING_APPROVAL) |
| Vendor / Due / Bill amount | `Vendors.name` / `VendorBills.dueDate` / `VendorBills.totalAmount` | |
| WHT withheld | `VendorBills.whtAmount` | already withheld at the bill |
| Pay now | `VendorPaymentAllocations.amount` | defaults to `VendorBills.balanceAmount` |
| Selected (n bills) totals | Σ of the above | |
| Payment numbers "PAY-2026-000064 → 000067" | `VendorPayments.docNo` (one per vendor) + `.paymentRunRef` | |
| Payment date | `VendorPayments.docDate` | |
| Method IBFT / Cheque / Pay order / Cash | `VendorPayments.method` | |
| Pay from (bank · available) | `VendorPayments.bankAccountId` (or `cashAccountId`) | balance from treasury |
| Cheque book / First cheque # | `VendorPayments.chequeBookId` (→ `BankCash.ChequeBooks`), `VendorPayments.chequeNo` (incremented per payment) → `BankCash.Cheques` | |
| Crossed — "A/C Payee only" | `VendorPayments.isCrossed` | |
| Gross bills settled / WHT withheld at bill / Bank charges (est.) / Total payment / Bank balance after | Σ (amount + bill WHT) / Σ `VendorBills.whtAmount` / `VendorPayments.bankChargesAmount` / Σ `amount` + charges / treasury balance − total | |
| WHT challan due 15 Oct (CPR) | Σ WHT of the month | deposited by the tax module (Full) |
| Recent payments: Payment #, Vendor, Date, Method, Bank, Against, Amount, Status | `VendorPayments.docNo`, `Vendors.name`, `.docDate`, `.method` (+ `chequeNo`), `BankAccounts`, allocations → `VendorBills.docNo` (part) or `.remarks`, `.amount`, `.status` | Cleared / Presented |
| Allocate modal: PAY-2026-000061 · cheque · paid on account | `VendorPayments.docNo`, `.chequeNo`, `.unallocatedAmount` | |
| Payment amount / Allocation date | `VendorPayments.amount` / `VendorPaymentAllocations.allocationDate` | |
| WHT treatment (Already withheld at bill / Withhold now · 153(1)(a) 5.5%) | `VendorPayments.whtTreatment`, `.whtSection`, `.whtRate`; `VendorPaymentAllocations.whtAmount` | |
| Bill rows: Open balance / Allocate | `VendorBills.balanceAmount` / `VendorPaymentAllocations.amount` | |
| DN-2026-000012 Open debit note −22,500 | `VendorPaymentAllocations.debitNoteId` (source DN → bill) | credit used inside the allocation |
| Allocated / Left on account | `VendorPayments.allocatedAmount` / `.unallocatedAmount` | maintained by trigger |

**Statuses.** Payment DRAFT → PENDING_APPROVAL → POSTED → PRESENTED → CLEARED · VOID. Allocation: live or reversed (`isReversed`).
**Actions → effects.**
- *Create payment* → one `VendorPayments` per vendor (`PENDING_APPROVAL`, "sent for approval") + `VendorPaymentAllocations` rows. On approval → `POSTED`: journal; the cheque is issued; bill balances and statuses update by trigger.
- *Print advices* → PDF.
- *Bank upload file* → bulk-IBFT file from the payments of the run (`paymentRunRef`).
- *Allocate on-account* / *Auto-allocate (FIFO)* / *Apply allocation* → `VendorPaymentAllocations` rows, oldest due first. Over-allocation is blocked (trigger plus the UI "Allocated more than the amount received").
- *Cheque register* → `app/bank/cheque-register`.

**Permission.** `pay:view`, `pay:create`, `pay:approve`, `ap:allocate` · **Approval.** Payments are "sent for approval" (Finance Manager).

### AP Ageing & Reports — `app/payables/ageing`
*Source:* `src/45-studios.html` (`data-studio="payables"`) · `src/96-studio.js` (`payables` studio: tabs ageing / register / statement / wht / byvendor)
**Purpose.** The Purchases & Payables report studio: vendor ageing, purchase register, vendor statement, WHT deducted and purchases by vendor, all net of WHT withheld.
**Tables.** Views only: `Purchases.getPayablesAgeing`, `Purchases.getPurchaseRegister`, `Purchases.getVendorStatement`, `Purchases.getVendorBalances`, `Purchases.getVendorWhtDeducted` · Reads: `Purchases.VendorBills`, `Purchases.VendorPayments`, `Purchases.VendorPaymentAllocations`, `Purchases.DebitNotes`, `Purchases.Vendors`, `Company.Branches` · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Filter As On (date / range) | view parameter `asOf` | |
| Filter Vendor / Branch | `vendorId` / `branchId` | |
| Ageing Basis By due date / By bill date | `getPayablesAgeing.daysPastDue` / `.daysSinceBill` | |
| Options: ageing and tax columns, include zero balances, group by branch, terms and notes | presentation | |
| AP Ageing: Vendor, Terms, Current, 1–30, 31–60, 61–90, 90+, Total | `getPayablesAgeing.vendorName`, `.paymentTerms`, `.bucketCurrent` … `.bucket90Plus`, `.balanceAmount` | grouped by branch |
| Note "Disputed — wrong part supplied" / stat "Disputed 90+" | `VendorBills.isDisputed`, `VendorBills.disputeNote` | |
| Stats Vendors / Total Payable / DPO | `getVendorBalances` | DPO is derived |
| Purchase Register: Date, Bill, Vendor, Net, Input Tax, Total | `getPurchaseRegister.docDate`, `.docNo`, `.vendorName`, `.netAmount`, `.taxAmount`, `.totalAmount` | |
| Vendor Statement: Date, Document, Particulars, Debit, Credit, Balance | `getVendorStatement` | |
| WHT Deducted: Payment, Vendor, Section, Gross, Rate, Tax Withheld, Net Paid | `getVendorWhtDeducted` (bill and payment WHT by section) | "CPR status Pending" (Full tax module) |
| Purchases by Vendor: Vendor, Bills, Net, Input Tax, Gross, Share | `getPurchaseRegister` grouped by vendor | |
| Presets (Payment run prep, Karachi vendors, WHT return · Sep, Spend summary) | `Reports.SavedReports` (saved views) | |

**Statuses.** —
**Actions → effects.** Filter, group, export (Excel / PDF), print. No writes.
**Permission.** `ap:reports` · **Approval.** —

### Purchase Returns — `app/purchases/returns`
*Source:* `src/44-purchase-docs.html` (section `pd-pr`) · `src/94-purchase-docs.js` (purchase returns engine: `prRender`, `prDetail`, `prCalc`, `prEffect`, `prSave`)
**Purpose.** View and manage everything sent back to suppliers, with its stock, payable and GST effect. Create a return against a posted purchase.
**Tables.** Primary: `Purchases.PurchaseReturns`, `Purchases.PurchaseReturnLines` · Reads: `Purchases.Vendors`, `Purchases.VendorBills(Line)` (reference purchase, purchased qty), `Inventory.Products`, `Inventory.ProductBatches`, `BankCash.CashAccounts` · Writes: `Purchases.PurchaseReturns(Line)`, `Purchases.DebitNotes` (Credit settlement), `Purchases.VendorPaymentAllocations`, `Inventory.StockMovements` (PURCHASE_RETURN), `Accounting.Vouchers`
**Functions.** Save → `Purchases.purchaseReturnAddUpdate` · Open → `Purchases.getPurchaseReturnInfo` · Actions → `Purchases.purchaseReturnPost`, `Purchases.purchaseReturnCancel`
**Lookups.** `PurchaseReturns.settlement` → `PurchaseReturnSettlement` · `PurchaseReturns.reason` → `PurchaseReturnReason` · `PurchaseReturns.status` → `PurchaseReturnStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Search return #, supplier, reference, bill # | `PurchaseReturns.docNo`, `Vendors.name`, `VendorBills.docNo`, `.supplierBillNo` | |
| From Date / To Date | `PurchaseReturns.docDate` | |
| Supplier / Payment Type (Cash, Credit) | `vendorId` / `settlement` | Credit → CREDIT, Cash → CASH_REFUND |
| Chips All / Draft / Posted / Referenced / Cancelled · "Returned value" | `status`; Σ `totalAmount` excluding CANCELLED | |
| # · Return # · Date | row no · `docNo` · `docDate` | PR-000013 is normalised to PR-2026-000013 |
| Supplier | `Vendors.name` | |
| Reference # (PV-2026-000300 / —) | `billId` → `VendorBills.docNo` | NULL shows as "—" |
| Supplier Bill # | `supplierBillNo` | SB-1180 |
| Items / Amount | count of lines / `totalAmount` | |
| Status / Payment | `status` / `settlement` | |
| Expanded row: Supplier, Reference #, Supplier Bill #, Return Date, Payment Type, Remarks, Total Items, Total Amount | header columns, `remarks` | |
| Expanded items: Product Name, Pack, Batch No., Expiry, Rate, Returned Qty, Amount | `PurchaseReturnLines.itemId` (pack from `Inventory.Products`), `.batchNo`, `.expiryDate`, `.rate`, `.returnQty`, `.grossAmount` | |
| Editor: Supplier * | `vendorId` | |
| Return Date * | `docDate` | |
| Reference Purchase (Select purchase voucher…) | `billId` | the supplier's posted PVs / bills |
| Supplier Bill # | `supplierBillNo` | filled from the reference |
| Remarks | `remarks` | |
| Payment Type Credit / Cash refund | `settlement` (+ `cashAccountId` for a refund) | |
| Purchase Return # / Generate | `docNo` | `Company.getNextDocNo('PR')` |
| Summary Total Items / Total Amount / Status | derived / `totalAmount` / `status` | |
| Line: Product Name * | `PurchaseReturnLines.itemId` (+ `billLineId`) | |
| Pack | `Inventory.Products` (pack / ctn) | display only |
| Batch No. | `batchNo`, `batchId` | |
| Rate | `rate` | defaults to the purchase rate |
| Ret. Qty "of N" | `returnQty` / `purchasedQty` | CHECK return + bonus ≤ purchased |
| Bonus / Disc % / Disc. | `bonusQty` / `discountPct` / `discountAmount` | |
| % GST / GST Amount / Amount | `taxRate` (+ `taxCodeId`) / `taxAmount` / `totalAmount` | |
| Effect tiles: Stock (−units, leaves warehouse at cost), Supplier payable (balance → after) or Cash refund, GST reversal | `warehouseId`, Σ qty and value; `getVendorBalances`; `taxAmount` | derived |
| Reversal journal preview | POSTING_RULES §Purchase return | |
| Additional info: Return reason | `reason` | EXPIRED / DAMAGED / WRONG_ITEM / QUALITY |
| Gate pass # | `gatePassNo` | GP-2026-… |
| Transporter | `transporter` | TCS Logistics / Supplier vehicle / Own fleet |
| Debit note narration | `debitNoteNarration` | copied to the generated DN's `remarks` |
| Totals: Sub Total, Total Discount, Total GST, Net Amount | `grossAmount`, `discountAmount`, `taxAmount`, `totalAmount` | |

**Statuses.** DRAFT → POSTED → REFERENCED (a debit note was raised from it) · CANCELLED
**Actions → effects.**
- *Save as Draft* / *Save & Print* → `DRAFT` (+ print).
- *Save & Post* → `POSTED`, which:
  - writes stock OUT (`PURCHASE_RETURN`) per batch;
  - posts the journal per POSTING_RULES §Purchase return;
  - for Credit, raises a `DebitNotes` (`purchaseReturnId`, reason PURCHASE_RETURN) allocated to the reference bill → PR `REFERENCED`.
- Toast *Debit note* → `app/purchases/debit-notes`.
- Row *View* / *Print* / *Edit Return* (draft) / *Duplicate as new return* / *Download PDF* / *Cancel return* → `CANCELLED` (reversal if posted).
- *Export*.

**Permission.** `pr:view`, `pr:create`, `pr:post`, `pr:cancel` · **Approval.** —

### Landed Cost — `app/purchases/landed-cost`
*Source:* `src/4A-company-plus.html` (section `app/purchases/landed-cost`) · `src/9A-company-plus.js` (§8 LANDED COST: `SH`, `COSTS`, `alloc`, `journal`, `post`)
**Purpose.** Spread customs duty, freight, clearing and insurance across imported items so that stock carries its true cost. Import sales tax and Section 148 tax stay claimable.
**Tables.** Primary: `Purchases.LandedCostShipments`, `Purchases.LandedCostItems`, `Purchases.LandedCostCharges` · Reads: `Purchases.GoodsReceivedNotes(Line)`, `Purchases.Vendors`, `Inventory.Products` (`weightKg`), `Inventory.StockBalances`, `BankCash.BankAccounts` · Writes: the three tables above, `Accounting.Vouchers`, `Inventory.Products.avgCost` + `Inventory.ProductPriceLogs`, `Inventory.ProductBatches.unitCost`
**Functions.** Save → `Purchases.landedCostShipmentAddUpdate` · Open → `Purchases.getLandedCostShipmentInfo` · Actions → `Purchases.landedCostShipmentPost`, `Purchases.landedCostShipmentCancel`
**Lookups.** `LandedCostShipments.shipmentMode` → `ShipmentMode` · `LandedCostShipments.allocationBasis` → `AllocationBasis` · `LandedCostShipments.status` → `LandedCostShipmentStatus` · `LandedCostCharges.chargeType` → `ChargeType` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Shipment card: flag, "Shipment CN-2026-014", from China · Sea · 1 × 40ft HC, port route, status badge, FOB total, items | `LandedCostShipments.originCountry`, `.docNo`, `.shipmentMode` + `.containerInfo`, `.portOfLoading` → `.portOfDischarge`, `.status`, `.fobAmount`, count of `LandedCostItems` | `CN-` is replaced by `LC-2026-014` |
| Doc head: GRN · vendor | `grnId` → `GoodsReceivedNotes.docNo`, `vendorId` | |
| Bill of lading | `billOfLadingNo` | COSU6382104950 |
| Goods declaration (WeBOC) | `gdNo` | NULL shows "Pending filing" |
| LC / TT | `lcRef` (+ `bankAccountId`) | Meezan LC 0123/26/114 |
| Exchange rate (USD 1 = Rs 278.40) | `currencyCode`, `ExchangeRates` | |
| Route | `portOfLoading`, `portOfDischarge` | |
| Status (Cleared 29 Sep / ETA 06 Oct / Posted · JV) | `status`, `clearedOn`, `eta`, `journalEntryId` | |
| Allocate by Value / Qty / Weight | `allocationBasis` | |
| Item (sku · USD/unit) | `LandedCostItems.itemId`, `.fobUnitFcy` | |
| Qty / Weight | `.qty` / `.weightKg` | weight defaults to qty × `Inventory.Products.weightKg` (Full) |
| Base cost | `.fobAmount` | qty × USD × fx |
| Share | `.sharePct` | |
| Allocated | `.allocatedAmount` | rounding goes to the last line |
| Landed unit cost (+% on base) | `.landedUnitCost` (generated) | uplift % derived |
| Totals row | Σ qty, weight, FOB, allocated | |
| Cost composition stacked bar: Goods (FOB), Customs & duties, Freight & haulage, Clearing & port, Insurance, Claimable taxes | Σ `LandedCostCharges.amount` grouped by `chargeType` family | |
| Total landed value | `landedValueAmount` = FOB + capitalised | |
| Cost lines: Cost label · payee | `LandedCostCharges.description`, `.payeeName` (+ `payeeVendorId`) | |
| Claimable badge | `.isClaimable` (+ `claimAccountId`) | import ST → 1350-01; s.148 → 1360-03 |
| Amount (Rs) | `.amount` (+ `.ratePct` for duties) | |
| In cost switch | `.isCapitalised` | warning if a claimable tax is switched in |
| Add: Demurrage / Container detention / Bank LC charges / Excise cess / Lab testing (PSQCA) | new `LandedCostCharges` rows (`chargeType` DEMURRAGE / CONTAINER_DETENTION / BANK_CHARGES / EXCISE_CESS / LAB_TESTING) | |
| Capitalised to stock / Claimable taxes (not in cost) / Uplift on FOB | `capitalisedAmount` / `claimableAmount` / capitalised ÷ FOB | |
| Post sheet: journal preview, basis, "units affected" | POSTING_RULES §Landed cost | |

**Statuses.** IN_TRANSIT → CLEARED → POSTED · CANCELLED
**Actions → effects.**
- Select shipment; change basis → re-allocation.
- Edit amount / toggle *In cost* / remove / *Add* cost line.
- *Post landed cost* → *Post journal*:
  - `POSTED` with `journalEntryId` and `postedAt`;
  - GRNI is cleared, and each payee is credited in AP;
  - item `avgCost` is revalued and logged in `Inventory.ProductPriceLogs`.
- *GRNs* → `app/purchases/grn`.
- *View* → `app/accounting/vouchers/view`.

**Permission.** `lc:view`, `lc:edit`, `lc:post` · **Approval.** —
