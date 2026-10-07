# 08 · Sales & Receivables — Full edition

Schema: `Sales`. DDL: `database/schema/07-sales.sql`, cross-module FKs in `database/fk/07-Sales-fks.sql`.

Full covers 18 screens. The 11 Basic screens come first and are identical to the Basic edition, apart from the notes marked **Full:**. The 7 Full-only screens follow: POS / Counter Sale, Delivery Challans, Sales Returns, Recurring Invoices, Price Lists & Schemes, Credit Control and Payment Reminders.

**Tables (35).**
- Basic (16): `CustomerGroups`, `customer`, `CustomerContacts`, `CustomerNotes`†, `PriceLists`, `PriceListItems`, `quotation`, `QuotationLines`, `SalesOrders`, `SalesOrderLines`, `invoice`, `SalesInvoiceLines`, `CreditNotes`, `CreditNoteLines`, `receipt`, `CustomerReceiptAllocations`.
- Full-only (19): `CustomerAddresses`, `PriceListQuantityBreaks`, `scheme`, `SalesSchemeItems`, `SalesSchemeEligibilities`, `DeliveryChallans`, `DeliveryChallanLines`, `SalesReturns`, `SalesReturnLines`, `PosShifts`, `PosShiftDenominations`†, `PosPayments`, `CreditOverrides`, `CreditHoldEvents`, `PaymentReminderTemplates`, `PaymentReminderRules`, `PaymentReminderLogs`, `RecurringInvoices`, `RecurringInvoiceLines`.

† helper table that is not in the contract registry.

**Full columns on Basic tables.**
- `customer`: `customerChannel` (STANDARD / WHOLESALE; a wholesale shop is a customer + `Distribution.ShopRouteProfiles`), `PriceTiers` (RETAILER / WHOLESALER / DISTRIBUTOR), `priceTierFactor` (1 / 0.95 / 0.90).
- `invoice`:
  - `channel` adds WHOLESALE (`WS-`) and POS (`POS-`);
  - `PriceTiers`, `priceTierFactor`, `creditOverrideId`, `routeId`;
  - `bookerEmployeeId`, `deliverymanEmployeeId`, `salesmanEmployeeId`, `supervisorEmployeeId`;
  - `posShiftId`, `recurringProfileId`, `deliveryChallanId`, `shipToAddressId`;
  - `schemeId`, `schemeAmount`, `stockIssueMode` (AT_POSTING / AT_DISPATCH), `stockIssuedAt`.
- `SalesInvoiceLines`: `listRate`, `isManualRate`, `schemeId`, `deliveryChallanLineId`.
- `CreditNotes`: `salesReturnId`.
- `receipt`: `posShiftId`.

Conventions used on every screen below:
- **One invoice table.** A Sales Voucher is a `Sales.SalesInvoices` row with `channel = 'COUNTER'` and doc type `SV`. Standard invoices use `channel = 'STANDARD'` and doc type `INV`.
- **Derived, never stored:**
  - customer balance, overdue, utilisation, "Near limit" and "Overdue" badges (`Sales.getCustomerBalances`);
  - invoice OVERDUE (`dueDate < currentDate AND balanceAmount > 0`);
  - sales-order LATE (`expectedDeliveryDate < currentDate` and not fully delivered).
- **Trigger-maintained settlement.** `SalesInvoices.paidAmount` / `creditAppliedAmount` / `status`, `CreditNotes.appliedAmount` / `status` and `CustomerReceipts.allocatedAmount` / `status` are recomputed from `CustomerReceiptAllocations` and `CreditNotes` by `sales.refresh*`. The columns `balanceAmount` and `unallocatedAmount` are generated.
- **Frozen once posted.** `Sales.triggerFreezeWhenPosted` locks the amounts, customer and dates of a posted invoice, an approved credit note and every receipt. `Sales.triggerLinesEditable` locks their lines. Corrections go through a credit note, VOID + reversal journal, or a new receipt.
- **Quantities.** Every document line stores `qtyCtn`, `qtyLoose`, `ctnFactor` and `baseQty`, with `baseQty = qtyCtn × ctnFactor + qtyLoose` checked. `bonusQty` is free goods.
- **Seed values the prototype only simulates** are marked **[simulated]**.

---

### Customers — `app/customers`
*Source:* `src/41-acc-trade.html` (section `app/customers`, modal `trd-new-customer`) · `src/91-data.js` (`customers[]`)
**Purpose.** Customer master with tax registration, credit limits and live receivable balances.
**Tables.** Primary: `Sales.Customers` · Reads: `Sales.CustomerGroups`, `Sales.PriceLists`, `Company.Users` (sales rep), `Company.Branches`, `Accounting.ChartOfAccounts` (receivable a/c), view `Sales.getCustomerBalances` · Writes: `Sales.Customers`, `Company.AuditTrailEntries`
**Functions.** Save → `Sales.customerAddUpdate` · Open → `Sales.getCustomerInfo`
**Lookups.** `Customers.customerType` → `CustomerType` · `Customers.atlStatus` → `CustomerAtlStatus` · `Customers.province` → `Province` · `Customers.paymentTerms` → `CustomerPaymentTerms` · `Customers.status` → `CustomerStatus` · `Customers.holdReason` → `CustomerHoldReason` · `Customers.customerChannel` → `CustomerChannel` · `Customers.priceTier` → `PriceTier` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Active Customers "118 · ▲ 6 new this quarter" | count `customer` where `status = 'ACTIVE'`; new = `createdAt` in quarter | |
| KPI Total Receivable "Rs 8,925,470 · 37 open invoices" | Σ `getCustomerBalances.balance` | |
| KPI Overdue "Rs 2,070,170 · 6 customers" | Σ `getCustomerBalances.overdueAmount` | |
| KPI On Credit Hold "2 · Al-Fatah Stores, Interloop Ltd" | `Customers.status = 'ON_HOLD'` | |
| Search "name, NTN, code, phone" | `Customers.name`, `.displayName`, `.ntn`, `.code`, `.mobile`, `.phone` | trigram `customerNameTrgmIdx` |
| Filter All cities / All groups | `Customers.city`, `Customers.customerGroupId` | |
| Chips All / Active / Overdue / On Hold / Inactive | `Customers.status`; Overdue = `getCustomerBalances.overdueAmount > 0` | |
| Customer (name, `CUST-0009 · Corporate`) | `Customers.displayName` (else `name`), `.code`, `CustomerGroups.name` | code from `Company.getNextDocNo('CUST')` |
| NTN / City / Terms | `Customers.ntn`, `.city`, `.paymentTerms` (NET_30 → "Net 30") | |
| Credit Limit | `Customers.creditLimit` | |
| Utilisation bar "91%" | `vCustomerBalance.utilisationPct` | balance ÷ limit |
| Balance (Rs) / Overdue | `getCustomerBalances.balance`, `.overdueAmount` | |
| Status Active / Near limit / Overdue / On Hold / Disputed | `vCustomerBalance.displayStatus` | stored `Customers.status` (ACTIVE, ON_HOLD, DISPUTED, INACTIVE) plus derived NEAR_LIMIT (≥ 90 %) and OVERDUE |
| New Customer · Customer name * | `Customers.name` | |
| Display / short name | `Customers.displayName` | |
| Customer type Company / Individual / Government / AOP / Partnership | `Customers.customerType` COMPANY / INDIVIDUAL / GOVERNMENT / AOP | |
| Customer group | `Customers.customerGroupId` | |
| Sales rep | `Customers.salesRepUserId` | |
| Branch | `Customers.branchId` | |
| NTN / CNIC (individuals) / STRN | `Customers.ntn`, `.cnic`, `.strn` | format CHECKs |
| ATL status Active Taxpayer / Not on ATL | `Customers.atlStatus` ACTIVE / NOT_ON_ATL | |
| Sales-tax registered | `Customers.isSalesTaxRegistered` | unregistered → further tax 4 % |
| Apply further tax 4% | `Customers.applyFurtherTax` | |
| Customer deducts WHT u/s 153 | `Customers.deductsWht`, `.whtSection`, `.whtRate` | rate required when ticked |
| GST exempt / zero-rated | `Customers.isGstExempt` | |
| Contact person / Mobile / Accounts email | `Customers.contactPerson`, `.mobile`, `.email` | |
| Billing address / City / Province | `Customers.billingAddress`, `.city`, `.province` | |
| Shipping same as billing | `Customers.shippingSameAsBilling` (+ `.shippingAddress`) | |
| Credit limit (Rs) | `Customers.creditLimit` | |
| Payment terms Net 30 / 15 / 45 / 60 / Due on receipt | `Customers.paymentTerms`, `.creditDays` | |
| Receivable account 1130 / 1131 | `Customers.receivableAccountId` | → `Accounting.ChartOfAccounts` |
| Price list | `Customers.priceListId` | defaults from `CustomerGroups.priceListId` |
| Opening balance (Rs) / As of | `Customers.openingBalance`, `.openingBalanceAsOf` | settled through `CustomerReceiptAllocations` target OPENING_BALANCE |
| Block sales when over limit | `Customers.blockOverLimit` | |
| Send automatic reminders | `Customers.autoReminders` | |
| (not on the form) guarantor block | `Customers.guarantorName`, `FatherName`, `Cnic`, `Phone`, `Address` | Bhatti ACCOUNT. Kept for distribution credit |

**Statuses.** ACTIVE · ON_HOLD (with `holdReason` OVER_LIMIT / OVERDUE / BOUNCED_CHEQUE / MANUAL) · DISPUTED · INACTIVE. NEAR_LIMIT and OVERDUE are derived.
**Actions → effects.** *New Customer → Save* → INSERT `customer` (+ audit) · *Save & new* → same, form stays open · *Import* → bulk INSERT (rows validated) · *Export* → CSV of the list.
**Permission.** `customer:view`, `customer:create`, `customer:edit` · **Approval.** —

---

### Customer Detail — `app/customers/view`
*Source:* `src/41-acc-trade.html` (section `app/customers/view`, tabs overview / invoices / receipts / statement / contacts / notes)
**Purpose.** One customer's account: profile, KPIs, invoices, receipts, running statement, contacts and notes.
**Tables.** Primary: `Sales.Customers` · Reads: `Sales.SalesInvoices`, `Sales.CustomerReceipts`, `Sales.CustomerReceiptAllocations`, `Sales.CreditNotes`, `Sales.CustomerContacts`, `Sales.CustomerNotes`, `BankCash.BankAccounts`, views `Sales.getCustomerBalances`, `Sales.getCustomerStatement`, `Sales.getSalesByCustomer` · Writes: `Sales.CustomerNotes`, `Sales.CustomerContacts`, `Company.Notifications` (statement e-mail)
**Functions.** Save → `Sales.customerAddUpdate` · Open → `Sales.getCustomerInfo`
**Lookups.** `Customers.customerType` → `CustomerType` · `Customers.atlStatus` → `CustomerAtlStatus` · `Customers.province` → `Province` · `Customers.paymentTerms` → `CustomerPaymentTerms` · `Customers.status` → `CustomerStatus` · `Customers.holdReason` → `CustomerHoldReason` · `Customers.customerChannel` → `CustomerChannel` · `Customers.priceTier` → `PriceTier` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Header "City Mart Superstores (Pvt) Ltd" | `Customers.name` | |
| "CUST-0002 · Retail Chain · Customer since 14 Mar 2021 · address" | `Customers.code`, `CustomerGroups.name`, `.customerSince`, `.billingAddress` | |
| Badges Near credit limit / Active Taxpayer / STRN registered / Sales rep | `vCustomerBalance.displayStatus`, `Customers.atlStatus`, `.strn`, `salesRepUserId → Users.fullName` | |
| KPI Balance "Rs 1,369,100 · 2 open invoices" | `getCustomerBalances.balance`, `.openInvoices` | |
| KPI Overdue "Rs 189,100 · INV-2026-000138 · 12 days" | `getCustomerBalances.overdueAmount`, `.oldestOverdueDocNo`, `.maxDaysOverdue` | |
| KPI Credit Limit Used "91% · Rs 130,900 of Rs 1,500,000 available" | `vCustomerBalance.utilisationPct`, `.availableCredit`, `Customers.creditLimit` | |
| KPI Avg Days to Pay "41 days" | `vCustomerBalance.avgDaysToPay` | allocation date − invoice date, weighted by amount |
| Overview: NTN / STRN / Payment terms / Credit limit / Price list / Receivable a/c / WHT deduction "u/s 153(1)(a) @ 5%" | `Customers.ntn`, `.strn`, `.paymentTerms`, `.creditLimit`, `PriceLists.name`, `ChartOfAccounts.code + name`, `.whtSection`, `.whtRate` | |
| Sales trend (FY 26-27) bars; Sales YTD / Collected YTD / Sales FY 25-26 | `getSalesByCustomer` (monthly) | |
| Recent activity timeline | `Company.AuditTrailEntries` + `Sales.SalesInvoices` / `Sales.CustomerReceipts` events | "Level 1 reminder sent" comes from the Full reminder log; in Basic it is the auto-reminder notification |
| Invoices tab: Invoice # / Date / Due / Amount / Balance / Status | `SalesInvoices.docNo`, `.docDate`, `.dueDate`, `.netAmount`, `.balanceAmount`, `.status` (+ derived OVERDUE) | |
| Receipts tab: Receipt # / Date / Method / Bank / Allocated to / Amount | `CustomerReceipts.docNo`, `.docDate`, `.method` (+ `Cheques.chequeNo`), `BankAccounts` name, `CustomerReceiptAllocations → SalesInvoices.docNo` or "Opening balance", `.amountReceived` | |
| Statement tab: period select; Date / Type (Opening, Invoice, Receipt, Credit Note) / Document # / Narration / Debit / Credit / Balance | `getCustomerStatement.*` | running balance; closing line |
| Contacts: name, role, Primary, mobile / phone, email | `CustomerContacts.fullName`, `.designation`, `.isPrimary`, `.mobile`, `.phone`, `.email` | |
| Notes: add note; author · text · date | `CustomerNotes.authorUserId`, `.note`, `.createdAt` | |

**Statuses.** As on Customers.
**Actions → effects.** *Email statement* → `Company.Notifications` with the `getCustomerStatement` PDF · *New Invoice* → `app/sales/invoices/new` (customer prefilled) · *Receive payment* → `app/receivables/receipts` · *Edit* → UPDATE `customer` (audited) · *Add note* → INSERT `CustomerNotes` · *Print / PDF* (statement) → rendered from the view.
**Permission.** `customer:view`; `customer:edit` for edit / notes · **Approval.** —

---

### Quotations — `app/sales/quotations`
*Source:* `src/41-acc-trade.html` (section `app/sales/quotations`, modals `trd-new-quote`, `trd-convert-quote`)
**Purpose.** Price offers to customers; accepted quotes convert into sales orders in one click.
**Tables.** Primary: `Sales.Quotations`, `Sales.QuotationLines` · Reads: `Sales.Customers`, `Sales.PriceLists(Item)`, `Inventory.Products`, `Tax.TaxCodes`, `Company.Users`, `Company.Branches` · Writes: `Sales.Quotations(Line)`, `Sales.SalesOrders(Line)` (convert)
**Functions.** Save → `Sales.quotationAddUpdate` · Open → `Sales.getQuotationInfo` · Actions → `Sales.quotationCancel`
**Lookups.** `Quotations.status` → `QuotationStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Open Quotations "Rs 18,640,500 · 23 awaiting" | Σ `Quotations.netAmount` where `status = 'SENT'` | |
| KPI Win Rate (FY) | (ACCEPTED + CONVERTED) ÷ decided quotes in the FY | |
| KPI Converted This Month | Σ `netAmount` where `status = 'CONVERTED'` and the SO was created in the month | via `SalesOrders.quotationId` |
| KPI Expiring in 7 Days | `status = 'SENT' AND validTill <= currentDate + 7` | |
| Filters customer / sales rep; chips Draft / Sent / Accepted / Expired | `Quotations.customerId`, `.salesRepUserId`, `.status` | Accepted chip = ACCEPTED + CONVERTED |
| Quotation # + subtitle "IT hardware refresh" | `Quotations.docNo`, `.subject` | QT-2026-000086 |
| Customer (name · city) | `Customers.displayName`, `.city` | |
| Date / Valid Till / Sales Rep / Amount (Rs) | `Quotations.docDate`, `.validTill`, `salesRepUserId`, `.netAmount` | |
| Status Draft / Sent / Accepted / Expired + "SO-2026-000094" | `Quotations.status` (CONVERTED shows "Accepted" + the SO number) | |
| New Quotation: Customer * / Quote date / Valid till / Sales rep / Branch / Price list | `Quotations.customerId`, `.docDate`, `.validTill`, `.salesRepUserId`, `.branchId`, `.priceListId` | |
| Lines: Item / Qty / Rate / Tax / Amount | `QuotationLines.itemId` + `.description`, `.baseQty`, `.rate`, `.taxCodeId` / `.taxRate`, `.taxableAmount` | |
| Subtotal / GST 18% / Total | `Quotations.grossAmount − discountAmount`, `.taxAmount`, `.netAmount` | |
| Convert: Order date / Expected delivery / Ship from warehouse / Customer PO reference / Reserve stock / Email confirmation | `SalesOrders.docDate`, `.expectedDeliveryDate`, `.warehouseId`, `.customerPoRef`, `.reserveStock`, `.emailConfirmation` | lines copied with prices locked |

**Statuses.** DRAFT → SENT → ACCEPTED → CONVERTED · EXPIRED (a nightly job sets it when `validTill` passes while SENT) · CANCELLED.
**Actions → effects.** *Save draft* → INSERT DRAFT · *Save & send* → status SENT, `sentAt`, e-mail via `Company.Notifications` · *Convert / Convert to SO* → INSERT `SalesOrders` (+ lines with `quotationLineId`), quotation → CONVERTED · *Revise* → copy as a new DRAFT with `revisionOfId` · *Remind* → `Company.Notifications` · *Export*.
**Permission.** `quote:view`, `quote:create`, `quote:send`, `quote:convert` · **Approval.** —

---

### Sales Orders — `app/sales/orders`
*Source:* `src/41-acc-trade.html` (section `app/sales/orders`)
**Purpose.** Confirmed customer orders with fulfilment and invoicing progress.
**Tables.** Primary: `Sales.SalesOrders`, `Sales.SalesOrderLines` · Reads: `Sales.Customers`, `Sales.Quotations`, `Inventory.Warehouses`, `Sales.SalesInvoices` · Writes: `Sales.SalesOrders(Line)`, `Inventory.StockReservations` (Full; Basic keeps `reserveStock` as a flag)
**Functions.** Save → `Sales.salesOrderAddUpdate` · Open → `Sales.getSalesOrderInfo` · Actions → `Sales.salesOrderCancel`
**Lookups.** `SalesOrders.paymentTerms` → `CustomerPaymentTerms` · `SalesOrders.status` → `SalesOrderStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Open Orders "31 · Rs 24,816,300" | count / Σ `netAmount` where status in CONFIRMED, PARTIALLY_DELIVERED, TO_INVOICE, ON_HOLD | |
| KPI To Deliver "14 · 6 due this week" | lines with `deliveredQty < baseQty + bonusQty` | |
| KPI To Invoice "Rs 7,420,800" | value of `deliveredQty − invoicedQty` | |
| KPI Late Deliveries | derived LATE | |
| KPI On-time Fulfilment % | orders fully delivered on or before `expectedDeliveryDate` ÷ all fully delivered **[simulated]** (needs delivery dates; Full challans give `deliveredAt`) | |
| Search "SO #, customer, PO ref"; warehouse filter | `SalesOrders.docNo`, customer name, `.customerPoRef`, `.warehouseId` | |
| Chips Confirmed / Partially Delivered / To Invoice / Invoiced / Cancelled | `SalesOrders.status` | |
| Order # + "PO: SIH/IT/0912" / "From QT-2026-000082" | `SalesOrders.docNo`, `.customerPoRef`, `Quotations.docNo` | |
| Customer + rep | `Customers.displayName`, `salesRepUserId` | |
| Order Date / Delivery Date / Warehouse | `.docDate`, `.expectedDeliveryDate`, `.warehouseId` | |
| Fulfilment bar "62% delivered", "6 of 15 laptops", "3 days late", "Blocked — credit hold" | Σ `SalesOrderLines.deliveredQty` ÷ Σ `baseQty`; LATE derived; `.holdReason` | |
| Amount (Rs) / Status | `.netAmount`, `.status` (+ derived LATE badge) | |

**Statuses.** DRAFT → CONFIRMED → PARTIALLY_DELIVERED → TO_INVOICE → INVOICED · ON_HOLD (credit hold) · CANCELLED · LATE (derived).
**Actions → effects.** *New Order* → INSERT · *From Quotation* → `app/sales/quotations` · *Invoice* → `app/sales/invoices/new` with `salesOrderId`; posting the invoice raises `SalesOrderLines.invoicedQty` · *Truck (challan)* → in Basic, delivery is recorded when the invoice posts (`deliveredQty`); Full creates `Sales.DeliveryChallans` · *Review* (on hold) → `app/receivables/credit` (Full) · *Export*.
**Permission.** `so:view`, `so:create`, `so:cancel` · **Approval.** —

---

### Sales Invoices — `app/sales/invoices`
*Source:* `src/41-acc-trade.html` (section `app/sales/invoices`)
**Purpose.** All customer invoices with FBR status, collections and balances.
**Tables.** Primary: `Sales.SalesInvoices` · Reads: `Sales.Customers`, `Sales.SalesOrders`, `Company.Branches` · Writes: `Company.Notifications` (send / remind), `Sales.SalesInvoices` (import)
**Functions.** Save → `Sales.salesInvoiceAddUpdate` · Open → `Sales.getSalesInvoiceInfo` · Actions → `Sales.salesInvoicePost`, `Sales.salesInvoiceVoid`
**Lookups.** `SalesInvoices.channel` → `SalesInvoiceChannel` · `SalesInvoices.paymentTerms` → `CustomerPaymentTerms` · `SalesInvoices.saleType` → `SaleType` · `SalesInvoices.deliverySlot` → `DeliverySlot` · `SalesInvoices.status` → `SalesInvoiceStatus` · `SalesInvoices.fbrStatus` → `FbrStatus` · `SalesInvoices.priceTier` → `PriceTier` · `SalesInvoices.stockIssueMode` → `StockIssueMode` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Invoiced MTD "Rs 14,862,400 · 48 invoices" | Σ `netAmount` of posted invoices in the month | |
| KPI Outstanding "Rs 8,925,470 · 37 open" | Σ `balanceAmount` where status POSTED / PARTIALLY_PAID | |
| KPI Overdue "Rs 2,070,170 · 23.2%" | same, `dueDate < currentDate` | |
| KPI Avg Days to Pay | from `CustomerReceiptAllocations.allocationDate − SalesInvoices.docDate` | |
| Search "invoice #, customer, FBR #"; branch; period | `SalesInvoices.docNo`, `.buyerName`, `.fbrInvoiceNo`, `.branchId`, `.docDate` | |
| Chips Draft / Sent / Partially Paid / Overdue / Paid | `status` DRAFT; POSTED with `sentAt` ("Sent"); PARTIALLY_PAID; derived OVERDUE; PAID | |
| Bulk bar "3 invoices selected · total · balance due"; Send / Remind / Print / Export | Σ `netAmount`, Σ `balanceAmount` | |
| Invoice # + "SO-2026-000087" | `SalesInvoices.docNo`, `SalesOrders.docNo` | |
| Customer · city / Date / Due | `SalesInvoices.buyerName`, `.buyerCity`, `.docDate`, `.dueDate` | |
| Amount (Rs) / GST / Balance | `.netAmount`, `.taxAmount` (+ `furtherTaxAmount`), `.balanceAmount` | |
| Status + "Credit override pending", "Due in 4 days", "12 days · part paid" | `.status`, derived days | the override flow is Full-only (`Sales.CreditOverrides`); in Basic a blocked draft simply stays DRAFT |
| FBR Posted / — | `SalesInvoices.fbrStatus` (POSTED / NOT_REQUIRED / PENDING / FAILED) | |
| Page total | Σ of the page | |

**Statuses.** DRAFT → POSTED → PARTIALLY_PAID → PAID · OVERDUE (derived) · VOID. "Sent" = POSTED + `sentAt`.
**Actions → effects.** *New Invoice* → `app/sales/invoices/new` · *Import* → bulk INSERT of DRAFT invoices · *Send* → e-mail PDF, sets `sentAt` · *Remind* → `Company.Notifications` · *Print / Export*.
**Permission.** `sinv:view`, `sinv:create`, `sinv:send` · **Approval.** —

---

### New Sales Invoice — `app/sales/invoices/new`
*Source:* `src/41-acc-trade.html` (section `app/sales/invoices/new`)
**Purpose.** Create and post a sales-tax invoice. Posting submits it to FBR (POS-integrated) and e-mails it.
**Tables.** Primary: `Sales.SalesInvoices`, `Sales.SalesInvoiceLines` · Reads: `Sales.Customers`, `Sales.SalesOrders(Line)`, `Sales.PriceListItems`, `Inventory.Products`, `Inventory.ProductBatches`, `Inventory.Warehouses`, `Tax.TaxCodes`, `Company.DefaultAccountMappings`, view `Sales.getCustomerBalances` · Writes: `Sales.SalesInvoices(Line)`, `Accounting.Vouchers/line`, `Inventory.StockMovements`, `Sales.SalesOrderLines.invoicedQty/deliveredQty`, `Company.Attachments`, `Company.Notifications`, `Tax.FbrInvoiceSubmissions` (Full; Basic keeps `invoice.fbr*`)
**Functions.** Save → `Sales.salesInvoiceAddUpdate` · Open → `Sales.getSalesInvoiceInfo` · Actions → `Sales.salesInvoicePost`, `Sales.salesInvoiceVoid`
**Lookups.** `SalesInvoices.channel` → `SalesInvoiceChannel` · `SalesInvoices.paymentTerms` → `CustomerPaymentTerms` · `SalesInvoices.saleType` → `SaleType` · `SalesInvoices.deliverySlot` → `DeliverySlot` · `SalesInvoices.status` → `SalesInvoiceStatus` · `SalesInvoices.fbrStatus` → `FbrStatus` · `SalesInvoices.priceTier` → `PriceTier` · `SalesInvoices.stockIssueMode` → `StockIssueMode` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| "INV-2026-000149" | `SalesInvoices.docNo` | `Company.getNextDocNo('INV')` at save |
| Customer * | `SalesInvoices.customerId`; snapshot `buyerName`, `buyerAddress`, `buyerNtn`, `buyerStrn` | |
| Invoice date * / Payment terms (Net 30 / 15 / 45 / Due on receipt / 50% advance) / Due date | `.docDate`, `.paymentTerms` (NET_30 … ADVANCE_50), `.dueDate` | due = date + terms, editable |
| Branch / Warehouse | `.branchId`, `.warehouseId` | |
| Sales order / Customer PO # / Sales rep | `.salesOrderId`, `.customerPoNo`, `.salesRepUserId` | |
| Credit banner "Limit · Outstanding · Available · after this invoice · Avg 28 days · Sales-tax registered — no further tax" | `getCustomerBalances.*`, `Customers.isSalesTaxRegistered` | if `blockOverLimit` and the new exposure exceeds the limit, posting is refused |
| Bill to / Address / NTN / STRN | `.buyerName`, `.buyerAddress`, `.buyerNtn`, `.buyerStrn` | |
| Ship to / Contact / Email | `.shipToAddress`, `.contactName`, `.contactPhone`, `.contactEmail` | |
| Lines: # / Item / Description / Qty / Rate / Disc % / Tax code (GST 18% / GST 0% / Exempt) / Amount | `SalesInvoiceLines.lineNo`, `.itemId`, `.description`, `.baseQty`, `.rate`, `.discountPct` (+ `.discountAmount`), `.taxCodeId` / `.taxRate`, `.totalAmount` | `PriceListItems` gives the default rate. HS code comes from the item |
| Scan / Bulk add | barcode lookup on `Inventory.ProductBarcodes`; adds `PriceListItems` rows | |
| Customer notes / Terms & conditions | `.customerNotes`, `.termsConditions` | printed |
| Attachments (PO copy, delivery challan) | `Company.Attachments` (`entityType = 'INV'`) | |
| Totals: Subtotal (gross) / Discount / Taxable value / GST 18% / Further tax 4% / Invoice total | `.grossAmount`, `.discountAmount`, `.taxableAmount`, `.taxAmount`, `.furtherTaxAmount`, `.netAmount` | `.advanceTaxAmount` (236G / 236H) when the tax code applies |
| WHT u/s 153(1)(a) @ 5% (est.) / Expected net receipt | `.expectedWhtAmount`; net − WHT | estimate only, not posted |
| Amount in words | from `netAmount` | |
| Posting preview 1130 Dr / 4010 / 4020 / 2210 Cr | see POSTING_RULES §Sales invoice | revenue per line `revenueAccountId` |
| Delivery switches: Email PDF / Submit to FBR / WhatsApp payment link / Auto-reminder 3 days before due | `.emailPdf`, `.submitToFbr`, `.sendWhatsappLink`, `.autoReminder` | |

**Statuses.** DRAFT (Save draft) → POSTED (Save & send).
**Actions → effects.** *Save draft* → INSERT DRAFT · *Save & send* → status POSTED, `postedAt`; `Accounting.Vouchers` (POSTING_RULES §Sales invoice); `Inventory.StockMovements` OUT `baseQty + bonusQty` at moving-average cost (`SalesInvoiceLines.unitCost`, `costAmount`); FBR submission → `fbrStatus`, `fbrInvoiceNo`; e-mail → `sentAt` · *Preview* → `app/sales/invoices/view` · *Discard* → VOID the draft.
**Permission.** `sinv:create`, `sinv:post` · **Approval.** — (over-limit is blocked in Basic; Full routes it to a credit override)

---

### Invoice View — `app/sales/invoices/view`
*Source:* `src/41-acc-trade.html` (section `app/sales/invoices/view`, modals `trd-record-payment`, `trd-send-invoice`)
**Purpose.** Printable sales-tax invoice with FBR QR, payment status, activity and quick payment.
**Tables.** Primary: `Sales.SalesInvoices`, `Sales.SalesInvoiceLines` · Reads: `Company.CompanySettings`, `BankCash.BankAccounts`, `Sales.CustomerReceiptAllocations`, `Sales.CustomerReceipts`, `Accounting.Vouchers`, `Company.AuditTrailEntries` · Writes: `Sales.CustomerReceipts`, `Sales.CustomerReceiptAllocations`, `Company.Notifications`
**Functions.** Save → `Sales.salesInvoiceAddUpdate` · Open → `Sales.getSalesInvoiceInfo` · Actions → `Sales.salesInvoicePost`, `Sales.salesInvoiceVoid`
**Lookups.** `SalesInvoices.channel` → `SalesInvoiceChannel` · `SalesInvoices.paymentTerms` → `CustomerPaymentTerms` · `SalesInvoices.saleType` → `SaleType` · `SalesInvoices.deliverySlot` → `DeliverySlot` · `SalesInvoices.status` → `SalesInvoiceStatus` · `SalesInvoices.fbrStatus` → `FbrStatus` · `SalesInvoices.priceTier` → `PriceTier` · `SalesInvoices.stockIssueMode` → `StockIssueMode` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Header INV # + status badge; "Packages Ltd · issued · due · Lahore HQ" | `SalesInvoices.docNo`, `.status`, `.buyerName`, `.docDate`, `.dueDate`, `Branches.name` | |
| Company block (name, address, NTN, STRN), "SALES TAX INVOICE", FBR QR | `Company.CompanySettings`; `SalesInvoices.fbrInvoiceNo` | |
| Bill to / Address / NTN / STRN | `.buyer*` | |
| Invoice date / Due date (Net 30) / Customer PO / SO / FBR invoice # | `.docDate`, `.dueDate`, `.paymentTerms`, `.customerPoNo`, `SalesOrders.docNo`, `.fbrInvoiceNo` | |
| Lines: # / Description (+ SKU) / HS Code / Qty / Rate / Value excl. tax / GST 18% / Total | `SalesInvoiceLines.lineNo`, `.description`, `Products.sku`, `.hsCode`, `.baseQty`, `.rate`, `.taxableAmount`, `.taxAmount`, `.totalAmount` | |
| Value excl. sales tax / Sales tax / Further tax / Total invoice value | `.taxableAmount`, `.taxAmount`, `.furtherTaxAmount`, `.netAmount` | |
| Received to date (incl. WHT) / Balance due | `.paidAmount`, `.balanceAmount` | trigger-maintained |
| Bank details / Terms / signatory | `BankCash.BankAccounts` (default), `.termsConditions`, `Company.CompanySettings` | |
| Payment status: % settled, Received (bank), WHT withheld, Balance, Due in | `.paidAmount ÷ .netAmount`; Σ allocations split by `CustomerReceipts.amountReceived` / `whtAmount` | |
| Activity: Payment received RCPT-…, Viewed, Emailed, FBR IRN received, Posted JV-… | `CustomerReceiptAllocations → receipt`, `.viewedAt`, `.sentAt`, `.fbrSubmittedAt`, `.postedAt` + `Vouchers.docNo` | |
| Details: Customer / Sales rep / Branch / Warehouse / Sales order / GL voucher | `.customerId`, `.salesRepUserId`, `.branchId`, `.warehouseId`, `.salesOrderId`, `.journalEntryId` | |
| Record payment: Payment date / Method (IBFT / Cheque / Cash / RAAST) / Deposit to / Amount received * / WHT deducted / Reference / Memo / Email receipt | `CustomerReceipts.docDate`, `.method`, `.bankAccountId` / `.cashAccountId`, `.amountReceived`, `.whtAmount`, `.reference`, `.memo`, `.emailReceipt` | one `CustomerReceiptAllocations` to this invoice |
| Email invoice: To / Cc / Subject / Message / Attach PDF / payment link | `Company.Notifications` payload | sets `sentAt` |

**Statuses.** As on Sales Invoices.
**Actions → effects.** *Record payment* → INSERT `receipt` + `CustomerReceiptAllocations` (POSTING_RULES §Receipt); the invoice moves to PARTIALLY_PAID / PAID · *Send* → e-mail, `sentAt` · *Print / PDF* · *Credit note* → `app/sales/credit-notes` with the invoice preselected · *Duplicate* → new DRAFT copy.
**Permission.** `sinv:view`, `rcpt:create`, `sinv:send` · **Approval.** —

---

### Sales Voucher — `app/sales/voucher`
*Source:* `src/43-sales-docs.html` (section `app/sales/voucher`) · `src/93-sales-docs.js` §1 (SV engine, `TENDERS`, `CUSTX`, `AREAS`) · `src/91-data.js` (`salesTeam`, `warehouses`)
**Purpose.** Fast counter / trade sale entry: customer, team, batch-wise items with bonus, split tender receipt, post in one step.
**Tables.** Primary: `Sales.SalesInvoices` (`channel = 'COUNTER'`), `Sales.SalesInvoiceLines` · Reads: `Sales.Customers`, `Inventory.Products`, `Inventory.ProductBatches`, `Inventory.Warehouses`, `Inventory.StockBalances`, view `Sales.getCustomerBalances` · Writes: `Sales.SalesInvoices(Line)`, `Sales.CustomerReceipts` + `Sales.CustomerReceiptAllocations` (one per tender), `Accounting.Vouchers`, `Inventory.StockMovements`
**Functions.** Save → `Sales.salesInvoiceAddUpdate` · Open → `Sales.getSalesInvoiceInfo` · Actions → `Sales.salesInvoicePost`, `Sales.salesInvoiceVoid`
**Lookups.** `SalesInvoices.channel` → `SalesInvoiceChannel` · `SalesInvoices.paymentTerms` → `CustomerPaymentTerms` · `SalesInvoices.saleType` → `SaleType` · `SalesInvoices.deliverySlot` → `DeliverySlot` · `SalesInvoices.status` → `SalesInvoiceStatus` · `SalesInvoices.fbrStatus` → `FbrStatus` · `SalesInvoices.priceTier` → `PriceTier` · `SalesInvoices.stockIssueMode` → `StockIssueMode` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Sale No "SV-2026-000123" | `SalesInvoices.docNo` | `Company.getNextDocNo('SV')` |
| Sale Date / Customer PO No / PO Date | `.docDate`, `.customerPoNo`, `.customerPoDate` | |
| Invoice No "INV-2026-000147" | `.taxInvoiceNo` | printed sales-tax invoice number |
| Bill Book No "BB-01" | `.billBookNo` | Bhatti BILL_BOOKNO |
| Customer / Party *; Customer Name | `.customerId`; `.buyerName` | the walk-in customer (CUST-0010) for cash sales |
| Address card + credit gauge "Credit used %" | `.buyerAddress`, `.contactPhone`, `.contactEmail`; `getCustomerBalances` | |
| Area / City | `.buyerArea`, `.buyerCity` | |
| Booker / Deliveryman / Salesman / Supervisor | `.bookerName`, `.deliverymanName`, `.salesmanName`, `.supervisorName` | free text in Basic (no HR module). Full adds `*EmployeeId` |
| Sale Type Regular / Wholesale / Retail / Distributor | `.saleType` | |
| Payment Terms Net 30 / Net 15 / Cash on delivery / Advance | `.paymentTerms` NET_30 / NET_15 / COD / ADVANCE | |
| Place / Warehouse | `.warehouseId` | |
| Remarks | `.remarks` | |
| Delivery slot Morning / Afternoon / Evening | `.deliverySlot` | |
| Pills LES-4471 / Route LHR-Central 03 / ETA | — | **[simulated]** in Basic; Full: challan `vehicleNo`, `SalesInvoices.routeId` |
| Grid: Product Name * / Pack / Batch / Expiry / Qty / Bonus / Sale Rate / Gross / Disc % / GST % (0/5/10/17/18) / Net Rate / Net Amount | `SalesInvoiceLines.itemId`, `.packLabel`, `.batchId` + `.expiryDate`, `.baseQty`, `.bonusQty`, `.rate`, `.grossAmount`, `.discountPct`, `.taxRate`, total ÷ qty, `.totalAmount` | bonus auto 1 per 10 in the prototype **[simulated scheme]** |
| Stock warning (qty + bonus > stock) | `Inventory.StockBalances.qtyAvailable` | |
| Hold / Held (1) | `.isHeld = true`, `.heldAt` (status DRAFT) | recall = load the draft |
| Totals bar: Items / Qty / Gross / Discount / GST / Net Amount | count lines, Σ `baseQty`, `.grossAmount`, `.discountAmount`, `.taxAmount`, `.netAmount` | |
| Receive Payment modal: Net payable / Received / Remaining; tender rows Cash / Card / Credit / JazzCash / Easypaisa | one `Sales.CustomerReceipts` per non-credit tender (`method` CASH / CARD / JAZZCASH / EASYPAISA) + `CustomerReceiptAllocations` to this invoice | the Credit tender stays as invoice balance |
| Cash tendered by customer / Change due | `.cashTendered`; change = tendered − cash tender | |
| Credit-limit warning "Posting needs Finance Manager approval" | `getCustomerBalances`, `Customers.blockOverLimit` | Full: `Sales.CreditOverrides` |
| Estimate "EST-2026-000041" | `Sales.Quotations` (DRAFT) | the prototype's estimate = a quotation |
| Print preview (sales tax invoice A4) | rendered from `invoice` + lines | |

**Statuses.** DRAFT (Save Draft / Hold) → POSTED (Save & Post) → PARTIALLY_PAID / PAID (tenders).
**Actions → effects.** *Save & Post* / *Confirm & Post* → POSTING_RULES §Counter cash sale: journal + stock OUT + receipts per tender · *Save Draft / Hold* → DRAFT (`isHeld`) · *Estimate* → quotation · *Print* · *Duplicate voucher* → new DRAFT.
**Permission.** `sv:create`, `sv:post` · **Approval.** —

---

### Credit Notes — `app/sales/credit-notes`
*Source:* `src/41-acc-trade.html` (section `app/sales/credit-notes`, modal `trd-new-cn`)
**Purpose.** Returns, rate differences and adjustments against sales invoices. Output GST is reversed in the Sales Tax Return.
**Tables.** Primary: `Sales.CreditNotes`, `Sales.CreditNoteLines` · Reads: `Sales.SalesInvoices(Line)`, `Sales.Customers`, `Inventory.Warehouses` · Writes: `Sales.CreditNotes(Line)`, `Accounting.Vouchers`, `Inventory.StockMovements` (restock), `Sales.SalesInvoices` settlement (trigger)
**Functions.** Save → `Sales.creditNoteAddUpdate` · Open → `Sales.getCreditNoteInfo` · Actions → `Sales.creditNoteCancel`, `Sales.creditNotePost`
**Lookups.** `CreditNotes.reason` → `CreditNoteReason` · `CreditNotes.treatment` → `CreditNoteTreatment` · `CreditNotes.status` → `CreditNoteStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Issued FY "Rs 1,142,560 · 21" / Applied to Invoices / Open (Unapplied) / Returns Rate | Σ `totalAmount`; Σ `appliedAmount`; Σ `balanceAmount` where OPEN; returns ÷ gross sales | |
| Search; reason filter Sales return / Rate difference / Damaged goods / Short supply | `CreditNotes.docNo`, invoice no, customer; `.reason` | |
| Chips Draft / Pending Approval / Open / Applied | `.status` | |
| Credit Note # / Customer / Date / Against Invoice | `.docNo`, `.customerId`, `.docDate`, `.invoiceId` | CN-2026-000021 |
| Reason "Damaged goods (40 rolls)" | `.reason` + `.reasonNote` | "Disputed pricing" = RATE_DIFFERENCE + note |
| Value / GST / Total (Rs) | `.valueAmount`, `.taxAmount` (+ `furtherTaxAmount`), `.totalAmount` | |
| New: Customer * / Against invoice * / Date / Reason / Return to warehouse / Treatment (Apply to invoice balance / Keep as customer credit / Refund) | `.customerId`, `.invoiceId`, `.docDate`, `.reason`, `.returnWarehouseId`, `.treatment` | the invoice must belong to the customer (composite FK) |
| Lines: Item (from invoice) / Invoiced / Return qty / Rate / Tax / Amount | `CreditNoteLines.invoiceLineId`, `.invoicedQty`, `.baseQty`, `.rate`, `.taxRate`, `.valueAmount` | return qty ≤ invoiced (CHECK). `restock` when goods come back |
| Narration | `.narration` | |
| Value / GST reversed / Credit note total / New invoice balance | `.valueAmount`, `.taxAmount`, `.totalAmount`; `SalesInvoices.balanceAmount − total` | |

**Statuses.** DRAFT → PENDING_APPROVAL → OPEN (customer credit) / APPLIED (applied to invoice or fully used) · CANCELLED.
**Actions → effects.** *Save draft* · *Submit for approval* → PENDING_APPROVAL, `submittedAt` · *Approve* (finance manager) → posts (POSTING_RULES §Credit note); APPLY_TO_INVOICE → APPLIED and the invoice balance drops; KEEP_AS_CREDIT → OPEN, later used in a receipt allocation; REFUND → payment voucher, `refundedAmount`.
**Permission.** `cn:create`, `cn:approve` · **Approval.** single approver in Basic (`approvedByUserId`); Full uses the approvals engine.

---

### Receipts & Allocation — `app/receivables/receipts`
*Source:* `src/41-acc-trade.html` (section `app/receivables/receipts`, panel "Receive Payment", modal `po-rcpt-alloc`)
**Purpose.** Record customer payments, capture WHT deducted at source and allocate against open invoices.
**Tables.** Primary: `Sales.CustomerReceipts`, `Sales.CustomerReceiptAllocations` · Reads: `Sales.SalesInvoices`, `Sales.CreditNotes`, `Sales.Customers`, `BankCash.BankAccounts`, `BankCash.CashAccounts`, `BankCash.Cheques`, view `Sales.getReceivableOpenItems` · Writes: `Sales.CustomerReceipts`, `Sales.CustomerReceiptAllocations`, `Accounting.Vouchers`
**Functions.** Save → `Sales.customerReceiptAddUpdate` · Open → `Sales.getCustomerReceiptInfo` · Actions → `Sales.customerReceiptVoid`, `Sales.customerReceiptPost`
**Lookups.** `CustomerReceipts.method` → `CustomerReceiptMethod` · `CustomerReceipts.whtCertificateStatus` → `WhtCertificateStatus2` · `CustomerReceipts.status` → `CustomerReceiptStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Collected (Sep) | Σ `amountReceived` in the month (not BOUNCED / VOID) | |
| KPI WHT Certificates "Rs 312,400 · claimable" | Σ `whtAmount` | `whtCertificateStatus` tracks receipt of the certificate |
| KPI Unallocated Cash "Rs 500,000 · 1 receipt" | Σ `unallocatedAmount` | customer advances |
| KPI Bounced Cheques | `status = 'BOUNCED'` | |
| Search "receipt, customer, cheque #"; chips Allocated / Unallocated / Bounced | `.docNo`, customer, `Cheques.chequeNo` / `.reference`; `.status` | Allocated chip = ALLOCATED + PARTLY_ALLOCATED |
| Receipt # + "INV-2026-000143" / "Advance vs SO-2026-000094" | `.docNo`; allocations; `.salesOrderId` | |
| Customer + deposit bank | `.customerId`; `.bankAccountId` / `.cashAccountId` | |
| Date / Method (Bank transfer / Cheque #771204 / Online / RAAST / Cash) / Received / WHT / Status | `.docDate`, `.method` (IBFT / CHEQUE / RAAST / CASH …), `.amountReceived`, `.whtAmount`, `.status` | |
| Receive Payment: Customer * / Date / Amount received * / Method seg Cash / Bank / Cheque / Online | `.customerId`, `.docDate`, `.amountReceived`, `.method` | |
| Deposit to / Reference / WHT deducted / Bank charges | `.bankAccountId`, `.reference`, `.whtAmount`, `.bankCharges` | |
| Allocate to open invoices: ☑ / Invoice + "Overdue 30 days" / Due / Allocate; open credit notes shown negative | `getReceivableOpenItems` → `CustomerReceiptAllocations.invoiceId` / `.creditNoteId`, `.allocatedAmount` | |
| Allocated / Unallocated (customer advance) | `.allocatedAmount`, `.unallocatedAmount` | |
| Auto-allocate (FIFO) | oldest `dueDate` first; `isAutoFifo = true` | |
| Allocate advance modal: Receipt amount / Allocation date / WHT certificate (Not yet received / Received · u/s 153(1)(a)) | `.settledAmount`, `CustomerReceiptAllocations.allocationDate`, `.whtCertificateStatus` | |

**Statuses.** UNALLOCATED → PARTLY_ALLOCATED → ALLOCATED · BOUNCED (cheque) · VOID.
**Actions → effects.** *Save receipt* → INSERT `receipt` + allocations; journal (POSTING_RULES §Receipt) · *Apply allocation* → INSERT `CustomerReceiptAllocations` (no journal; AR stays on the same control account) · *Clear* · *Cheques* → `app/bank/cheques` · *Export*. Bounce is recorded in treasury (`BankCash.Cheques`): the receipt moves to BOUNCED and its invoices re-open (trigger).
**Permission.** `rcpt:view`, `rcpt:create`, `rcpt:allocate`, `rcpt:void` · **Approval.** —

---

### AR Ageing & Reports — `app/receivables/ageing`
*Source:* `src/45-studios.html` (section `app/receivables/ageing`, `data-studio="receivables"`) · `src/96-studio.js` (`receivables` studio: tabs ageing / register / statement / bycust / byitem / gst; `arCols`, `srCols`, `csCols`, `sbcCols`, `sbiCols`, `gstCols`)
**Purpose.** Report studio for receivables: ageing, sales register, customer statement, sales by customer and by item, GST output.
**Tables.** View-based. Reads: `Sales.getReceivablesAgeing`, `Sales.getSalesRegister`, `Sales.getCustomerStatement`, `Sales.getSalesByCustomer`, `Sales.getSalesByItem`, `Tax.getSalesTaxOutputRegister` (tax module) · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Filters As On / Date range; Customer; Branch; Ageing basis By due date / By invoice date; search; sort | view parameters: `asOf`, `customerId`, `branchId`; `getReceivablesAgeing.daysByDue` vs `daysByDoc` | |
| Options Show ageing & tax columns / Include zero balances / Group by branch / Show terms & notes | presentation | |
| AR Ageing: Customer / Terms / Current / 1–30 / 31–60 / 61–90 / 90+ / Total | `getReceivablesAgeing.customerName`, `.paymentTerms`, `.bucketCurrent`, `.bucket130`, `.bucket3160`, `.bucket6190`, `.bucket90Plus`, `.total` | grouped by branch |
| Stats Customers / Total Receivable / Overdue 90+; summary Current % / Overdue / DSO | aggregates of `getReceivablesAgeing`; DSO = receivable ÷ (sales ÷ days) | |
| Sales Register: Date / Invoice / Customer / Net / GST 18% / Total | `getSalesRegister.docDate`, `.docNo`, `.customerName`, `.taxableAmount`, `.taxAmount`, `.netAmount` | invoices + credit notes (negative) |
| Customer Statement: Date / Document / Particulars / Debit / Credit / Balance | `getCustomerStatement.*` | |
| Sales by Customer: Customer / Invoices / Net Sales / GST / Gross / Share | `getSalesByCustomer.*` | |
| Sales by Item: SKU / Item / Qty Sold / Avg Rate / Net Sales / Gross Margin | `getSalesByItem.*` | margin = net − `costAmount` |
| GST Output: Invoice / Customer / STRN / Value excl. tax / Rate / Sales Tax / Further Tax | `Tax.getSalesTaxOutputRegister` (Annex-C) | |
| Presets (Month-end ageing, Karachi collections, GST output · Sep, Top customers) | saved filter sets (`Company.UserPreferences`) | Full: `Reports.SavedReports` |

**Statuses.** —
**Actions → effects.** *Export / Print / PDF* (studio) · drill-down to invoice / customer.
**Permission.** `ar:report` · **Approval.** —

---

## Full-only screens

---

### POS / Counter Sale — `app/sales/pos`
*Source:* `src/43-sales-docs.html` (section `app/sales/pos`, overlays `sd-pos-tender`, `sd-pos-closeshift`) · `src/93-sales-docs.js` §4 (`POS`, `POS_FEE`, tender pad, shift close, `DEN`)
**Purpose.** Touch / barcode counter sale with held carts, multi-tender payment, receipt print and shift close with a Z-report.
**Tables.** Primary: `Sales.SalesInvoices` (`channel = 'POS'`), `Sales.SalesInvoiceLines`, `Sales.PosShifts`, `Sales.PosPayments`, `Sales.PosShiftDenominations` · Reads: `Inventory.Products`, `Inventory.ProductBarcodes`, `Inventory.ProductClasses`, `Inventory.StockBalances`, `Sales.Customers` (walk-in default), `Sales.PriceListItems` · Writes: the primary tables plus `Sales.CustomerReceipts` / `CustomerReceiptAllocations` (one per non-credit tender), `Accounting.Vouchers`, `Inventory.StockMovements`, `Tax.FbrInvoiceSubmissions`
**Functions.** Save → `Sales.salesInvoiceAddUpdate` · Open → `Sales.getSalesInvoiceInfo` · Actions → `Sales.salesInvoicePost`, `Sales.salesInvoiceVoid` ‖ Save → `Sales.posShiftAddUpdate` · Open → `Sales.getPosShiftInfo` · Actions → `Sales.posShiftClose`
**Lookups.** `SalesInvoices.channel` → `SalesInvoiceChannel` · `SalesInvoices.paymentTerms` → `CustomerPaymentTerms` · `SalesInvoices.saleType` → `SaleType` · `SalesInvoices.deliverySlot` → `DeliverySlot` · `SalesInvoices.status` → `SalesInvoiceStatus` · `SalesInvoices.fbrStatus` → `FbrStatus` · `SalesInvoices.priceTier` → `PriceTier` · `SalesInvoices.stockIssueMode` → `StockIssueMode` · `PosShifts.status` → `OpenClosedStatus` · `PosPayments.tender` → `Tender` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| "Counter Sale · Lahore HQ · Cashier Sana Javed" | `PosShifts.branchId`, `.cashierUserId` | |
| Shift chip "Shift open since 09:00 · Counter 1" | `PosShifts.openedAt`, `.counterName`, `.status` | one OPEN shift per branch + counter (unique index) |
| Search products / Scan or type barcode | `Inventory.Products.name / sku`, `Inventory.ProductBarcodes.barcode` | |
| Category chips / product tiles (stock out / low) | `Inventory.Products` class; `Inventory.StockBalances.qtyAvailable` | |
| Current sale "POS-2026-004812" | `SalesInvoices.docNo` | `Company.getNextDocNo('POS')` |
| Customer picker | `SalesInvoices.customerId` (walk-in default) | |
| Cart line: qty − / +, Disc %, remove | `SalesInvoiceLines.baseQty`, `.discountPct`, `.rate` | qty capped by stock |
| Subtotal / Line discounts / GST 18% / FBR POS service fee Rs 1 / Total | `SalesInvoices.grossAmount`, `.discountAmount`, `.taxAmount`, `.fbrServiceFee`, `.netAmount` | |
| Hold (F8) / Held (n) | `SalesInvoices.isHeld = true` (DRAFT), `.heldAt` | |
| Take payment: Cash / Card / JazzCash / Easypaisa; Exact / Rs 500 / 1,000 / 5,000; Received; Change due | `PosPayments.tender`, `.amount`, `.tenderedAmount`, `.changeAmount`, `.reference` | non-credit tender → `Sales.CustomerReceipts` + allocation (`PosPayments.receiptId`) |
| Sale complete drawer (receipt, FBR invoice no.) | `SalesInvoices.fbrInvoiceNo` | |
| Close shift: Opening float / Cash sales / Expected in drawer / Counted / Over / Short / Card / Wallets / Bills | `PosShifts.openingFloat`, `.cashSales`, `.expectedCash`, `.countedCash`, `.overShort`, `.cardSales`, `.walletSales`, `.billsCount` | expected / over-short are generated columns |
| Denomination grid Rs 5,000 … Coins Rs 1 × Count = Amount | `PosShiftDenominations.denomination`, `.noteCount`, `.amount` | |
| "Close shift & print Z-report Z-2026-0412" | `PosShifts.zReportNo`, `.closedAt`, `.zPrintedAt`, `.status = 'CLOSED'` | doc type ZR |

**Statuses.** Invoice: DRAFT (held cart) → POSTED → PAID. Shift: OPEN → CLOSED.
**Actions → effects.** *Complete sale* → POSTING_RULES §POS sale (invoice journal + stock OUT + a receipt per tender) · *Hold / Recall* · *Clear* · *Print receipt* · *Open shift* → INSERT `PosShifts` with the float · *Close shift* → denominations, `countedCash`, POSTING_RULES §POS shift close.
**Permission.** `pos:sell`, `pos:discount`, `pos:shiftClose` · **Approval.** —

---

### Delivery Challans — `app/sales/challans`
*Source:* `src/43-sales-docs.html` (section `app/sales/challans`) · `src/93-sales-docs.js` §3 (`DC_ST`, `SOS`, `DC`, new-challan drawer)
**Purpose.** Dispatch goods against sales orders, track them to the customer's door and convert delivered challans into invoices.
**Tables.** Primary: `Sales.DeliveryChallans`, `Sales.DeliveryChallanLines` · Reads: `Sales.SalesOrders(Line)`, `Sales.Customers`, `Inventory.Warehouses`, `Distribution.Vans`, `HumanResources.Employees` · Writes: the primary tables, `Sales.SalesOrderLines.deliveredQty`, `Inventory.StockMovements` (OUT at dispatch), `Accounting.Vouchers` (GDNI), `Sales.SalesInvoices` (convert)
**Functions.** Save → `Sales.deliveryChallanAddUpdate` · Open → `Sales.getDeliveryChallanInfo` · Actions → `Sales.deliveryChallanCancel`, `Sales.deliveryChallanDispatch`, `Sales.deliveryChallanDeliver`
**Lookups.** `DeliveryChallans.deliverySlot` → `DeliverySlot` · `DeliveryChallans.status` → `DeliveryChallanStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Packed · awaiting dispatch / Dispatched / Delivered / Invoiced (count, value) | count / value by `DeliveryChallans.status` | value = Σ SO line value of the challan lines **[simulated]** (`dcVal`) |
| Flow strip (click to filter) | `.status` | |
| Search "challan, SO, customer, vehicle" | `.docNo`, `SalesOrders.docNo`, customer, `.vehicleNo` | |
| Challan # + date | `.docNo`, `.docDate` | DC-2026-000237 |
| Sales Order / Customer / Qty | `.salesOrderId`, `.customerId`, `.totalQty` | |
| Vehicle · Driver "LES-4471 · Rafiq Shah" | `.vehicleNo` / `.vehicleId`, `.driverEmployeeId` / `.driverName` | |
| Progress dots / Status Packed / Dispatched / Delivered / Invoiced | `.status`, `.dispatchedAt`, `.deliveredAt` | |
| New challan: Sales order * / Challan date / From warehouse / Vehicle no * / Driver | `.salesOrderId`, `.docDate`, `.warehouseId`, `.vehicleNo`, `.driverEmployeeId` | |
| Lines ☑ / Item / Ordered / Delivered / Pending / Deliver now | `DeliveryChallanLines.salesOrderLineId`, `.orderedQty`, `.previouslyDeliveredQty`, pending = ordered − delivered, `.baseQty` | CHECK deliver ≤ pending |
| Pills Route / ETA (Sales Voucher) | `.eta`; `SalesInvoices.routeId` | |

**Statuses.** PACKED → DISPATCHED → DELIVERED → INVOICED · CANCELLED.
**Actions → effects.** *New Challan* → INSERT PACKED · *Mark dispatched* → stock OUT, journal (POSTING_RULES §Challan dispatch), `SalesOrderLines.deliveredQty` += · *Mark delivered* → `deliveredAt` · *Convert to invoice* → INSERT `Sales.SalesInvoices` with `deliveryChallanId`, lines with `deliveryChallanLineId` (no second stock movement), challan → INVOICED · *Print run sheet*.
**Permission.** `dc:create`, `dc:dispatch`, `dc:invoice` · **Approval.** —

---

### Sales Returns — `app/sales/returns`
*Source:* `src/43-sales-docs.html` (section `app/sales/returns`) · `src/93-sales-docs.js` §2 (`INVOICES`, `REASONS`, `DISPO`, `dispoFor`, `SR_PREV`)
**Purpose.** Take goods back against an invoice (or without one), choose a reason and disposition per line, and raise the credit note.
**Tables.** Primary: `Sales.SalesReturns`, `Sales.SalesReturnLines` · Reads: `Sales.SalesInvoices(Line)`, `Sales.Customers`, `Inventory.ProductBatches`, `HumanResources.Employees` · Writes: the primary tables, `Sales.CreditNotes(Line)`, `Inventory.StockMovements`, `Inventory.ProductBatches` (disposition), `Accounting.Vouchers`
**Functions.** Save → `Sales.salesReturnAddUpdate` · Open → `Sales.getSalesReturnInfo` · Actions → `Sales.salesReturnPost`, `Sales.salesReturnCancel`
**Lookups.** `SalesReturns.returnType` → `SalesReturnType` · `SalesReturns.status` → `DraftPostedCancelledStatus` · `SalesReturnLines.reason` → `SalesReturnLineReason` · `SalesReturnLines.disposition` → `SalesReturnLineDisposition` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Title "Sales Return - SR-000012" + state badge | `.docNo`, `.status` | normalised to `SR-2026-000012` |
| Search Invoice: Invoice Number, Invoice Date, Customer, Invoice Amount, View Invoice | `.invoiceId` → `SalesInvoices.docNo`, `.docDate`, `.buyerName`, `.netAmount` | |
| Return Date / Return Type (Against invoice / Without invoice / Replacement) / Return # / Invoice # | `.docDate`, `.returnType`, `.docNo`, `.invoiceId` | invoice required unless WITHOUT_INVOICE |
| Remarks (0/500) | `.remarks` | CHECK length ≤ 500 |
| Customer Details (name, address, phone, mail) | `Sales.Customers` | |
| Booker / Deliveryman | `.bookerEmployeeId`, `.deliverymanEmployeeId` | |
| Summary Total Items / Total Quantity / Total Discount / Total Amount (incl. GST) | `.totalItems`, `.totalQty`, `.discountAmount`, `.totalAmount` | |
| Grid: Product / Pack / Batch / Expiry / Rate / Sold / Return Qty / % Disc / Discount / Amount / Reason / Disposition | `SalesReturnLines.itemId`, `.packLabel`, `.batchId`, `.expiryDate`, `.rate`, `.soldQty`, `.baseQty`, `.discountPct`, `.discountAmount`, `.valueAmount`, `.reason`, `.disposition` | return ≤ sold (CHECK). Default disposition: Expired → WRITE_OFF, Damaged → QUARANTINE, else RESTOCK |
| Previous Sales Returns: Return # / Invoice # / Date / Customer / Booker / Deliveryman / Items / Amount / Status | list of `SalesReturns` | status filter Draft / Posted / Cancelled |

**Statuses.** DRAFT → POSTED · CANCELLED.
**Actions → effects.** *Apply From Invoice* → fill return qty = sold · *Clear Rows* · *Save Return* → POSTED: credit note (`CreditNotes.salesReturnId`, its lines with `restock = false`) + stock per disposition (POSTING_RULES §Sales return) · *Cancel*.
**Permission.** `sr:create`, `sr:post` · **Approval.** —

---

### Recurring Invoices — `app/sales/recurring`
*Source:* `src/4A-company-plus.html` (section `app/sales/recurring`) · `src/9A-company-plus.js` §4 (`FREQ`, `P`, `nextDates`, create drawer)
**Purpose.** Retainers, AMCs, rentals and standing orders that raise themselves on schedule and go out by e-mail or WhatsApp.
**Tables.** Primary: `Sales.RecurringInvoices`, `Sales.RecurringInvoiceLines` · Reads: `Sales.Customers`, `Inventory.Products`, `Sales.PriceListItems` · Writes: the primary tables, `Sales.SalesInvoices(Line)` (each run), `Company.Notifications`
**Functions.** Save → `Sales.recurringInvoiceAddUpdate` · Open → `Sales.getRecurringInvoiceInfo`
**Lookups.** `RecurringInvoices.paymentTerms` → `CustomerPaymentTerms` · `RecurringInvoices.frequency` → `RecurringInvoiceFrequency` · `RecurringInvoices.endMode` → `RecurringInvoiceEndMode` · `RecurringInvoices.status` → `RecurringInvoiceStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Active profiles / Monthly recurring revenue / Next 7 days / Auto-send rate | count ACTIVE; MRR = amount normalised (weekly × 52 ÷ 12, quarterly ÷ 3, custom × 30 ÷ N); `nextRunDate ≤ +7`; `autoSend` share | |
| Seg All / Active / Paused | `.status` | |
| Customer & profile "RP-0012 · Office supplies standing order" | `.customerId`, `.docNo`, `.name` | doc type RP |
| Frequency Weekly / Monthly / Quarterly / Every N days; "14 runs · ends Never" | `.frequency`, `.everyDays`, `.runsCount`, `.endMode` / `.endDate` / `.maxRuns` | |
| Next run + "In 2 days" | `.nextRunDate` | |
| Amount (Rs) incl. GST | `.amount` | Σ line totals |
| Auto-send switch + channel icons | `.autoSend`, `.sendEmail`, `.sendWhatsapp` | |
| Status Active / Paused / Ends soon | `.status`; "Ends soon" derived (end within 30 days) | |
| Coming up list "6:00 AM PKT" | `.nextRunDate`, `.runTime` | |
| New profile: Customer * / Profile name * / template lines Item / Qty / Rate / Amount / + GST 18% | `.customerId`, `.name`, `RecurringInvoiceLines.itemId`, `.baseQty`, `.rate`, `.taxableAmount`, `.taxRate` | |
| Schedule seg; Start date; End Never / On a date / After N runs; Every (days) | `.frequency`, `.startDate`, `.endMode`, `.endDate`, `.maxRuns`, `.everyDays` | |
| Next 6 runs timeline | computed from the schedule | |
| Delivery: Email / WhatsApp / Save as draft first | `.sendEmail`, `.sendWhatsapp`, `.saveAsDraft` | |

**Statuses.** ACTIVE ⇄ PAUSED → ENDED.
**Actions → effects.** *Run now* → INSERT `Sales.SalesInvoices` (`recurringProfileId`), posted and sent if `autoSend`, else DRAFT; `runsCount` +1, `nextRunDate` advanced, `lastInvoiceId` · *Pause / Resume* · *Skip next run* → advance `nextRunDate` · *Preview invoice* · *Delete profile* → status ENDED (invoices kept).
**Permission.** `rp:manage`, `sinv:post` · **Approval.** —

---

### Price Lists & Schemes — `app/sales/price-lists`
*Source:* `src/4A-company-plus.html` (section `app/sales/price-lists`) · `src/9A-company-plus.js` §5 (`LISTS`, `SCHEMES`, `QB`, scheme drawer)
**Purpose.** Channel pricing for retail, wholesale, distributors and corporates, trade schemes and quantity-break slabs, with live margin checks.
**Tables.** Primary: `Sales.PriceLists`, `Sales.PriceListItems`, `Sales.SalesSchemes`, `Sales.SalesSchemeItems`, `Sales.SalesSchemeEligibilities`, `Sales.PriceListQuantityBreaks` · Reads: `Inventory.Products` (cost = moving average, class, brand), `Sales.CustomerGroups`, `Sales.Customers` (counts) · Writes: the primary tables
**Functions.** Save → `Sales.priceListAddUpdate` · Open → `Sales.getPriceListInfo` ‖ Save → `Sales.salesSchemeAddUpdate` · Open → `Sales.getSalesSchemeInfo`
**Lookups.** `PriceLists.status` → `ActiveInactiveStatus` · `SalesSchemes.schemeType` → `SchemeType` · `SalesSchemeItems.itemRole` → `ItemRole` · `SalesSchemeEligibilities.priceTier` → `PriceTier` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Price lists: name + Default, "PL-WHS · 86 customers", groups chips, "+20% markup on cost", avg margin badge | `PriceLists.name`, `.isDefault`, `.code`, count customers, `CustomerGroups.priceListId`, `.markupPct`; margin from `PriceListItems.price` vs item cost | |
| Editor: Item (sku · unit · brand) / Cost / Retail / List price / Margin / vs Retail | `Inventory.Products`; default list's price; `PriceListItems.price`; computed | margin colour ≥ 20 / 10–20 / < 10 % |
| Category chips; Markup on cost %; Apply to all (rounded to Rs 5); Save ("effective from tomorrow") | `Inventory.Products` class; `PriceLists.markupPct`, `.roundingTo`; new `PriceListItems` rows with `effectiveFrom = currentDate + 1` | |
| Export (all lists CSV) | read | |
| Schemes strip: live count / discount given FY / uplift | `scheme` aggregates; uplift **[simulated]** | |
| Scheme card: icon, Live / Off / Scheduled / Ended, switch, title, subtitle, dates, eligible, Times applied, Discount given, Budget used %, type, SC-014 | `SalesSchemes.isActive` + dates, `.name`, `.description`, `.validFrom`, `.validTo`, `SalesSchemeEligibilities`, `.usedCount`, `.valueGiven`, `valueGiven ÷ budgetCap`, `.schemeType`, `.code` | |
| New scheme: type (Free goods / Invoice discount / Bundle price / Line discount), Scheme name *, Item, Eligible groups, From, To, Budget cap, Max uses per customer | `.schemeType`, `.name`, `SalesSchemeItems.itemId`, `SalesSchemeEligibilities.customerGroupId`, `.validFrom`, `.validTo`, `.budgetCap`, `.maxUsesPerCustomer` | |
| Quantity breaks: item select; Tier / Min qty / Max qty ("and above") / Unit price / Off base / Margin; Add tier; Save slabs | `PriceListQuantityBreaks.itemId`, `.tierNo`, `.minQty`, `.maxQty`, `.unitPrice` | no overlapping ranges (EXCLUDE constraint) |
| Try it: order quantity → unit price, order total, saving | computed from `PriceListQuantityBreaks` | |

**Statuses.** Price list ACTIVE / INACTIVE · Scheme derived Live / Off / Scheduled / Ended.
**Actions → effects.** *Save* prices · *Apply to all* · *New scheme* → INSERT scheme + items + eligibility · toggle → `SalesSchemes.isActive` · *Save slabs* · *Export*.
**Permission.** `pricing:view`, `pricing:edit`, `scheme:manage` · **Approval.** —

---

### Credit Control — `app/receivables/credit`
*Source:* `src/41-acc-trade.html` (section `app/receivables/credit`, modal `trd-credit-override`)
**Purpose.** Monitor exposure against limits, manage credit holds, dunning reminders and override approvals.
**Tables.** Primary: `Sales.CreditOverrides`, `Sales.CreditHoldEvents` · Reads: view `Sales.getCustomerCreditExposure`, `Sales.Customers`, `Sales.PaymentReminderRules`, `Sales.PaymentReminderLogs`, `BankCash.Cheques` · Writes: `Sales.CreditOverrides`, `Sales.CreditHoldEvents`, `Sales.Customers.status / holdReason`, `Sales.PaymentReminderLogs` (Run dunning now)
**Functions.** Save → `Sales.creditOverrideAddUpdate` · Open → `Sales.getCreditOverrideInfo` · Actions → `Sales.creditOverrideApprove`
**Lookups.** `CreditOverrides.overrideType` → `OverrideType` · `CreditOverrides.approvalMethod` → `ApprovalMethod` · `CreditOverrides.status` → `CreditOverrideStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Over Credit Limit "2 · 1 actual, 1 incl. pending draft" | `vCreditExposure.overLimitActual`, `.overLimitWithDrafts` | |
| KPI On Credit Hold "2 · Rs 1,615,090 exposure" | `Customers.status = 'ON_HOLD'`, Σ exposure | |
| KPI Pending Overrides "3 · Awaiting …" | `CreditOverrides.status = 'PENDING'`, `.approverUserId` | |
| KPI Reminders This Week | `PaymentReminderLogs` / scheduled from `PaymentReminderRules` | |
| Banner "exceeds credit limit by Rs 118,290 … Automatic hold applied 15 Sep 2026" | `getCustomerCreditExposure`; latest `CreditHoldEvents` (HOLD, OVER_LIMIT, AUTO) | |
| Exposure watchlist: Customer + rep / Limit / Balance / Open orders / drafts / Exposure / Utilisation / Overdue / Status (Override requested, Hold — auto, Hold — bounced cheque, Watch, Good) | `getCustomerCreditExposure.creditLimit`, `.effectiveLimit`, `.balance`, `.openOrdersAndDrafts`, `.exposure`, `.utilisationPct`, `.overdueAmount`, `.watchStatus` | |
| Override approvals list: "City Mart — INV-2026-000147 · Rs 486,750 · Exceeds limit by … · requested by · approver" | `CreditOverrides.customerId`, `.invoiceId` / `.salesOrderId`, `.documentAmount`, `.exceedByAmount`, `.requestedByUserId`, `.requestedAt`, `.approverUserId` | |
| Approve modal: Credit limit / Current balance / This invoice / Exposure after posting / Overdue | `.creditLimitSnapshot`, `.balanceSnapshot`, `.documentAmount`, `.exposureAfter`, `.overdueSnapshot` | |
| Override type One-time / Temporary limit increase; Valid until; Condition / comments | `.overrideType` ONE_TIME / TEMP_LIMIT (+ RELEASE_HOLD for holds), `.validUntil`, `.conditionComments` | |
| Dunning schedule ladder (Friendly −3d, Level 1 +7d, Level 2 +21d, Level 3 +45d hold, Final +90d) | `Sales.PaymentReminderRules` (`offsetDays`, `dunningLevel`, `action`) | |
| Next reminders: Date / Customer / Level / Amount | open invoices × active rules → `getPaymentReminderQueue` | |

**Statuses.** Override PENDING → APPROVED → USED · REJECTED · EXPIRED. Hold events HOLD / RELEASE.
**Actions → effects.** *Approve override* → APPROVED, `decided*`; ONE_TIME lets the invoice post (`SalesInvoices.creditOverrideId`, then USED); TEMP_LIMIT raises `effectiveLimit` until `validUntil`; RELEASE_HOLD → `CreditHoldEvents` RELEASE and `Customers.status = 'ACTIVE'` · *Reject* · *Release* (hold) · *Run dunning now* → sends due reminders (`PaymentReminderLogs`, `triggerMode = 'DUNNING_RUN'`) · *Approval rules* → `app/settings/approvals`.
**Permission.** `credit:view`, `credit:overrideApprove`, `credit:hold` · **Approval.** override approval (requester ≠ approver, CHECK `creditOverrideSodChk`); routing via `Company.ApprovalWorkflows`.

---

### Payment Reminders — `app/receivables/reminders`
*Source:* `src/4A-company-plus.html` (section `app/receivables/reminders`) · `src/9A-company-plus.js` §6 (`TPL`, `rules`, `OVER`, `LOG`)
**Purpose.** Automatic WhatsApp / SMS / e-mail reminder ladder in English and Urdu, with live preview, manual send and a delivery log.
**Tables.** Primary: `Sales.PaymentReminderRules`, `Sales.PaymentReminderTemplates`, `Sales.PaymentReminderLogs` · Reads: `Sales.SalesInvoices`, `Sales.Customers`, `Sales.CustomerContacts`, view `Sales.getReceivablesAgeing` · Writes: the primary tables, `Sales.CreditHoldEvents` (final rule), `Company.Tasks` (call task)
**Functions.** Save → `Sales.paymentReminderRuleAddUpdate` · Open → `Sales.getPaymentReminderRuleInfo` ‖ Save → `Sales.paymentReminderTemplateAddUpdate` · Open → `Sales.getPaymentReminderTemplateInfo`
**Lookups.** `PaymentReminderRules.dunningLevel` → `DunningLevel` · `PaymentReminderRules.action` → `PaymentReminderRuleAction` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Overdue receivables / Reminders sent (Q2) / Read rate on WhatsApp / Paid within 3 days of reminder | `getReceivablesAgeing`; count `PaymentReminderLogs`; READ ÷ sent per channel; allocations within 3 days of `sentAt` | |
| Reminder schedule rule: offset chip "−3d / Due / +7d", label, "412 sent this quarter", enable switch | `PaymentReminderRules.offsetDays`, `.name`, `.sentCount`, `.isActive` | |
| Channel toggles WhatsApp / SMS / Email (≥ 1) | `.sendWhatsapp`, `.sendSms`, `.sendEmail` | CHECK at least one for MESSAGE rules |
| Template select | `.templateId` | |
| Escalate "to Zainab Raza (Sales Manager) and place account on credit hold" | `.escalate`, `.escalateToUserId`, `.applyCreditHold` | |
| "Runs every morning at 9:00 AM"; quiet hours note | `.runTime`; quiet hours in `Company.CompanySettingValues` | |
| Add rule (30 days after due, email + statement) | INSERT `PaymentReminderRules` (`attachStatement`) | |
| Live preview: English / اردو; WhatsApp / SMS / Email; customer select; variables {customer} {invoice} {amount} {dueDate} | `PaymentReminderTemplates.bodyEn` / `.bodyUr`, `.emailSubject`; values from `invoice` | |
| Overdue customers: Customer + phone / Invoice + due / Overdue days / Amount / Rule / Last reminder / Send now | `invoice` (overdue), `CustomerContacts.mobile`, rule matched by days; latest `PaymentReminderLogs.sentAt` + channel | |
| Sent log: Time / Customer / Invoice / Channel / Rule / Status (Read / Delivered / Sent / Failed) | `PaymentReminderLogs.sentAt`, `.customerId`, `.invoiceId`, `.channel`, `.reminderRuleId`, `.status` | |

**Statuses.** Log QUEUED → SENT → DELIVERED → READ · FAILED. Rule active / paused (`isActive`).
**Actions → effects.** *Send now / Send to all / Run all* → INSERT `PaymentReminderLogs` per channel (`triggerMode = 'MANUAL'`); provider receipts update `status` · rule edits → UPDATE `PaymentReminderRules` · the final rule with `applyCreditHold` → `CreditHoldEvents` HOLD (DUNNING) and `Customers.status = 'ON_HOLD'`.
**Permission.** `reminder:view`, `reminder:manage`, `reminder:send` · **Approval.** —
