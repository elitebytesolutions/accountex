# 11 — Wholesale & Distribution (FULL edition only)

Schema: `Distribution` (`database/schema/10-dist.sql`, cross-module FKs in `database/fk/10-Distribution-fks.sql`).
Invoices made on these screens are `Sales.SalesInvoices` rows with `channel = 'WHOLESALE'` (doc type `WS`, `WS-2026-000231`) and lines in `Sales.SalesInvoiceLines`. A shop (`SHP-001`) is a `Sales.Customers`; its distribution profile is `Distribution.ShopRouteProfiles`. Booker, salesman, driver (deliveryman) and supervisor are `HumanResources.Employees` FKs; a van is `Distribution.Vans`.

Screens: [Quick Wholesale Entry](#quick-wholesale-entry--appwholesaleentry) · [Bulk Invoicing](#bulk-invoicing--appwholesalebulk) · [Order Bookings](#order-bookings--appwholesalebookings) · [Back-orders](#back-orders--appwholesalebackorders) · [Load Sheets](#load-sheets--appwholesaleload-sheet) · [Route Settlement](#route-settlement--appwholesalesettlement) · [Recovery Sheet](#recovery-sheet--appwholesalerecovery) · [Routes & Salesmen](#routes--salesmen--appwholesaleroutes)

---

### Quick Wholesale Entry — `app/wholesale/entry`
*Source:* `src/4D-wholesale.html` (section `ws2-entry`) · `src/9H-wholesale.js` (engine §1, `mountEntry`)
**Purpose.** A keyboard-first wholesale bill (cartons + pieces, tier rates, live schemes, credit control) for one shop, saved as a WHOLESALE sales invoice.
**Tables.** Primary: `Sales.SalesInvoices`, `Sales.SalesInvoiceLines` (channel `WHOLESALE`) · Also writes: `Distribution.HeldBills`, `Distribution.HeldBillLines`, `Distribution.OrderTemplates`, `Distribution.OrderTemplateLines`, `Distribution.CreditOverrideLogs`, `Sales.CreditOverrides` · Reads: `Sales.Customers`, `Distribution.ShopRouteProfiles`, `Distribution.PriceTiers`, `Distribution.Routes`, `HumanResources.Employees`, `Inventory.Warehouses`, `Inventory.Products`, `Inventory.ProductBarcodes`, `Inventory.StockBalances`, `Sales.SalesSchemes`, `Sales.SalesSchemeItems`, view `Sales.getCustomerCreditPosition`
**Functions.** Save → `Sales.salesInvoiceAddUpdate` · Open → `Sales.getSalesInvoiceInfo` · Actions → `Sales.salesInvoicePost`, `Sales.salesInvoiceVoid`
**Lookups.** `SalesInvoices.channel` → `SalesInvoiceChannel` · `SalesInvoices.paymentTerms` → `CustomerPaymentTerms` · `SalesInvoices.saleType` → `SaleType` · `SalesInvoices.deliverySlot` → `DeliverySlot` · `SalesInvoices.status` → `SalesInvoiceStatus` · `SalesInvoices.fbrStatus` → `FbrStatus` · `SalesInvoices.priceTier` → `PriceTier` · `SalesInvoices.stockIssueMode` → `StockIssueMode` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Invoice No `WS-2026-000231` | `Sales.SalesInvoices.docNo` | `Company.getNextDocNo('WS')` |
| Date | `Sales.SalesInvoices.docDate` | |
| Route | `Sales.SalesInvoices.routeId` → `Distribution.Routes` | defaults from `Distribution.ShopRouteProfiles.routeId` |
| Salesman / Booker | `Sales.SalesInvoices.salesmanEmployeeId` | defaults to `Distribution.Routes.salesmanEmployeeId` |
| Warehouse | `Sales.SalesInvoices.warehouseId` | |
| Shop search (name, code, area) · F3 | `Sales.Customers.code/name`, `Distribution.ShopAreas.name` | shop = customer |
| Shop card: code · area · route, phone | `Sales.Customers.code`, `Distribution.ShopRouteProfiles.areaId`, `.routeId`, `Sales.Customers.phone` | |
| Tier chip (Retailer / Wholesaler −5% / Distributor −10%) | `Sales.SalesInvoices.priceTier` (default `Distribution.ShopRouteProfiles.priceTier`) | factor from `Distribution.PriceTiers.rateFactor`; per-bill change allowed |
| Credit limit · Outstanding · This bill · Available · Overdue | `Sales.Customers.creditLimit`, view `Sales.getCustomerCreditPosition` (balance, oldest overdue days), bill = `Sales.SalesInvoices.netAmount` | derived; "Near limit" > 80 %, "Over limit · blocked" > 100 % |
| Grid: SKU / Product | `Sales.SalesInvoiceLines.itemId` | search by name / SKU / barcode / brand / category |
| CTN · PCS · Total Pcs | `Sales.SalesInvoiceLines.qtyCtn`, `.qtyLoose`, `.baseQty` | PCS ≥ pack rolls into CTN |
| Rate (CTN/PCS toggle) | `Sales.SalesInvoiceLines.rate` (per piece), `.isManualRate` | tier rate = `Inventory.Products.wprice × PriceTiers.rateFactor` |
| Scheme ("Buy 10 get 1") + free line | `Sales.SalesInvoiceLines.schemeId`, `.bonusQty` | free qty = floor(base/buy)×free |
| Disc % · GST % · Amount | `Sales.SalesInvoiceLines.discountPct`, `.taxRate`, `.totalAmount` | |
| Totals bar: Items, CTN, PCS, Gross, Scheme value, Discount, GST, Net payable | `Sales.SalesInvoices.grossAmount`, `.schemeAmount`, `.discountAmount`, `.taxAmount`, `.netAmount` | |
| Hold / Recall (count) | `Distribution.HeldBills` (+`Line`), `status` HELD → RECALLED | `provisionalNo` shows the parked number |
| Templates ▾ / Save current as template… | `Distribution.OrderTemplates.name`, `.icon`, `.customerId`; `Distribution.OrderTemplateLines.qtyCtn/qtyLoose` | |
| Repeat last | reads last `Sales.SalesInvoices` for the customer | no table |
| Add many / Paste from Excel / Scan mode | `Inventory.Products`, `Inventory.ProductBarcodes` (piece vs carton barcode) | input helpers only |
| Credit modal: limit, outstanding, this bill, after this bill, over by, overdue | `Distribution.CreditOverrideLogs.creditLimit`, `.outstandingAmount`, `.billAmount`, `.usedAmount`, `.overByAmount`, `.overdueDays` | |
| Manager PIN (4 digits, 3 tries) | `Distribution.CreditOverrideLogs.attempts`, `.lastPinResult`, `.outcome`, `.lockedUntil`, `.approvedByUserId` | PIN never stored; verified against the approver's credential |
| Print preview (Wholesale Tax Invoice, Terms Credit 15 days, Due) | `Sales.SalesInvoices.dueDate`, `Sales.Customers.creditDays` | |

**Statuses.** Invoice: see `08-sales-receivables.md` (DRAFT → POSTED …). Held bill: HELD → RECALLED · DISCARDED. Credit override log: PENDING → APPROVED · DENIED · LOCKED.
**Actions → effects.** *Save / Save & Print (Alt S)* → `Sales.SalesInvoices` POSTED (POSTING_RULES §Sales invoice); if over limit without override → blocked, opens credit modal · *Override* → `Distribution.CreditOverrideLogs` APPROVED + `Sales.CreditOverrides` (CO) · *Hold / Hold bill* → `Distribution.HeldBills` · *Recall* → reload lines, HeldBills RECALLED (current lines are re-held) · *Template* → merge template lines · *WhatsApp* → `Company.Notifications` (invoice PDF to shop phone) · Out-of-stock line → toast "will go to back-order" (`Distribution.BackOrders` on post with partial stock).
**Permission.** `ws:entry`, `ws:post`, `ws:CreditOverrides` (approver), `ws:template` · **Approval.** Credit limit breach → manager PIN override (logged).

---

### Bulk Invoicing — `app/wholesale/bulk`
*Source:* `src/4D-wholesale.html` (section `ws2-bulk`) · `src/9H-wholesale.js` (engine §2, `mountBulk`, `generate`)
**Purpose.** Bill a whole route in one pass, either as a shops × products carton matrix or the same items pushed to many shops.
**Tables.** Primary: `Distribution.BulkInvoiceRuns`, `Distribution.BulkInvoiceRunCells`, `Distribution.BulkInvoiceSkippedShops` · Writes: `Sales.SalesInvoices`, `Sales.SalesInvoiceLines` (WHOLESALE) · Reads: `Distribution.Routes`, `Distribution.RouteVisitDays`, `Distribution.ShopRouteProfiles`, `Distribution.PriceTiers`, `Sales.Customers`, `Inventory.Products`, `Inventory.StockBalances`, `Sales.SalesInvoices` (last orders)
**Functions.** Save → `Distribution.bulkInvoiceRunAddUpdate` · Open → `Distribution.getBulkInvoiceRunInfo`
**Lookups.** `BulkInvoiceRuns.mode` → `BulkInvoiceRunMode` · `BulkInvoiceRuns.status` → `BulkInvoiceRunStatus` · `BulkInvoiceSkippedShops.reasonCode` → `ReasonCode` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Route | `Distribution.BulkInvoiceRuns.routeId` | route pills: `Distribution.RouteVisitDays.weekday`, salesman, van |
| Invoice date | `Distribution.BulkInvoiceRuns.docDate` | |
| Matrix / Same items to many shops | `Distribution.BulkInvoiceRuns.mode` MATRIX / SAME | |
| Matrix cell (shop × SKU, CTN) | `Distribution.BulkInvoiceRunCells.customerId`, `.itemId`, `.qtyCtn` | rate = tier rate, `amount` incl. GST |
| Row Qty / Amount, column totals | sums of `BulkInvoiceRunCells` | derived |
| Credit icon per shop (OK / >80 % / over → will be skipped) | derived from `Sales.getCustomerCreditPosition` | |
| Same mode: items + CTN, shop ticks, Select all, headroom | expands to `Distribution.BulkInvoiceRunCells` | headroom = limit − balance |
| Fill from last orders | reads `Sales.SalesInvoiceLines` history | |
| Generate bar: Shops billed, Cartons, Credit warnings, Total value | `Distribution.BulkInvoiceRuns.shopsSelected`, `.totalCtn`, `.creditWarnings`, `.totalValue` | |
| Result: invoice no per shop | `Distribution.BulkInvoiceRunCells.invoiceId` → `Sales.SalesInvoices.docNo` | |
| "Skipped · over limit by Rs X" | `Distribution.BulkInvoiceSkippedShops.reason`, `.overByAmount`, `.reasonCode` OVER_CREDIT_LIMIT | |
| Summary: Invoices, Total value, Skipped, range `WS-… → WS-…` | `.invoiceCount`, `.invoicedValue`, `.skippedCount`, `.firstInvoiceNo`, `.lastInvoiceNo` | |

**Statuses.** DRAFT → GENERATING → COMPLETED · FAILED.
**Actions → effects.** *Generate N invoices* → one `Sales.SalesInvoices` per shop (POSTED, POSTING_RULES §Sales invoice), credit + stock checked per shop; over-limit shops → `Distribution.BulkInvoiceSkippedShops` · *Build load sheet* → `app/wholesale/load-sheet` with these invoices · *Clear* → deletes DRAFT cells.
**Permission.** `ws:bulk`, `ws:post` · **Approval.** — (over-limit shops are skipped, never overridden in bulk).

---

### Order Bookings — `app/wholesale/bookings`
*Source:* `src/4D-wholesale.html` (section `ws2-book`) · `src/9H-wholesale.js` (engine §3, `BK`, `checkOrders`, `bkConvert`, `bkDrawer`)
**Purpose.** Review field orders synced from the booker app, check stock, and convert them to invoices in bulk; shortages become back-orders.
**Tables.** Primary: `Distribution.OrderBookings`, `Distribution.OrderBookingLines` · Writes: `Sales.SalesInvoices`, `Sales.SalesInvoiceLines`, `Distribution.BackOrders` · Reads: `HumanResources.Employees`, `Distribution.Routes`, `Sales.Customers`, `Distribution.ShopRouteProfiles` (pin, tolerance), `Inventory.Products`, `Inventory.StockBalances`
**Functions.** Save → `Distribution.orderBookingAddUpdate` · Open → `Distribution.getOrderBookingInfo` · Actions → `Distribution.orderBookingCancel`
**Lookups.** `OrderBookings.status` → `OrderBookingStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Orders today / Booked value today / Awaiting conversion / GPS verified % | view `Distribution.getOrderBookingKpis` | derived |
| Status chips All / New / Checked / Converted / Partial (counts) | `Distribution.OrderBookings.status` | HELD and CANCELLED also exist |
| Filters Booker · Route · Date | `.bookerEmployeeId`, `.routeId`, `.docDate` | |
| Order `BK-2026-4120` · "Today · 08:12" | `.docNo`, `.bookedAt` | `Company.getNextDocNo('BK')` |
| Booker | `.bookerEmployeeId` → `HumanResources.Employees` | |
| Shop · area · note ("Deliver before Jumma") | `.customerId`, `Distribution.ShopRouteProfiles.areaId`, `.note` | |
| Route | `.routeId` | |
| Lines · Amount | `.lineCount`, `.netAmount` | Σ lines incl. GST |
| Location: GPS verified / "0.4 km off" | `.gpsVerified`, `.gpsOffsetM`, `.geoLat/.geoLng` | **[simulated]**; tolerance `ShopRouteProfiles.gpsToleranceM` (25 m) |
| Stock: Not checked / All in stock / N short (item −qty) | `.stockCheck` jsonb, `.shortLineCount`, `.stockCheckedAt`; `OrderBookingLines.availableQty/.shortQty` | oldest booking served first |
| Status + invoice code | `.status`, `.invoiceId` → `Sales.SalesInvoices.docNo` | |
| Drawer lines: Item, CTN, PCS, Rate, Amount, Stock | `OrderBookingLines.itemId`, `.qtyCtn`, `.qtyLoose`, `.rate` (tier rate frozen), `.netAmount` | |
| Allow partial (switch) | `.allowPartial` (value used at conversion) | |
| Sync app | `.appOrderRef`, `.syncedAt` | |

**Statuses.** NEW → CHECKED → CONVERTED · PARTIAL (converted with shortages → back-orders) · HELD (shortage and partial not allowed) · CANCELLED.
**Actions → effects.** *Check stock* → fills `stockCheck`, NEW → CHECKED · *Convert to invoices* → `Sales.SalesInvoices` (WS) per booking at the frozen rates, stock re-checked live; short qty → `Distribution.BackOrders` (source BK); booking → CONVERTED / PARTIAL / HELD · *Sync app* → pulls new bookings.
**Permission.** `bk:view`, `bk:convert` · **Approval.** — (off-site GPS bookings notify the supervisor).

---

### Back-orders — `app/wholesale/backorders`
*Source:* `src/4D-wholesale.html` (section `ws2-bo`) · `src/9H-wholesale.js` (engine §4, `BO`, `FEED`, `allocPlan`, `mountBackorders`)
**Purpose.** Track quantities owed after partial deliveries, allocate arriving stock (GRNs) to them, then invoice or cancel.
**Tables.** Primary: `Distribution.BackOrders`, `Distribution.BackOrderAllocations`, `Distribution.BackOrderCancellations` · Writes: `Sales.SalesInvoices`, `Sales.SalesInvoiceLines`, `Company.Notifications` (SMS) · Reads: `Purchases.GoodsReceivedNotes`, `Purchases.GoodsReceivedNoteLines`, `Inventory.ProductBatches`, `Inventory.StockBalances`, `Sales.Customers`, `Distribution.PriceTiers`, `Inventory.Products`

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Pending lines · Pending value · Customers waiting · Oldest pending · Ready to invoice | view `Distribution.getBackOrderSummary` | value = pending × unitRate × (1+GST) |
| By item / By customer grouping | `Distribution.BackOrders.itemId` / `.customerId` | |
| Group head: on hand / pending / customers / value / oldest | `Inventory.StockBalances`, Σ `pendingQty` | |
| Row: shop, tier, ref `WS-2026-000214` / `BK-…` | `.customerId`, `Distribution.ShopRouteProfiles.priceTier`, `.sourceDocType` + `.sourceInvoiceId` / `.sourceOrderBookingId` | |
| Pending (ctn + pcs) | `.pendingQty` (= original − invoiced − cancelled) | base units |
| Allocation bar "36 allocated · SE-2608" | `.allocatedQty`; `BackOrderAllocations.batchId` | |
| Age chip (today / Nd) | today − `.backorderDate` | |
| Status Waiting / Part allocated / Ready | `.status` WAITING / PART_ALLOCATED / READY | |
| Incoming stock feed (GRN no, vendor, qty, batches, arrived / in transit) | `Purchases.GoodsReceivedNotes`, `Purchases.GoodsReceivedNoteLines`, `Inventory.ProductBatches` | view `Distribution.getBackOrderIncomingStock` |
| Allocate modal: Policy FEFO + oldest / Priority tier / Pro-rata | `BackOrderAllocations.policy` FEFO / PRIORITY / PRO_RATA | priority order = `Distribution.PriceTiers.allocationRank` |
| Preview: Customer, Age, Pending, Allocate, Batch, Still due; Arrived / Waiting / Allocating / To free stock | `BackOrderAllocations.qty`, `.batchId`, `.grnId`, `.allocationGroupId` | |
| Cancel modal: reason radios, Note, SMS | `BackOrderCancellations.reason`, `.note`, `.smsNotified`, `.smsSentAt` | |

**Statuses.** WAITING → PART_ALLOCATED → READY → INVOICED · CANCELLED. Allocation: ALLOCATED → INVOICED · RELEASED.
**Actions → effects.** *Allocate* → `Distribution.BackOrderAllocations` rows (reserves stock, `Inventory.StockReservations`), line status recalculated · *Convert to invoices* → one `Sales.SalesInvoices` per shop for allocated qty; allocations INVOICED, `invoicedQty` up · *Cancel lines* → `Distribution.BackOrderCancellations`, line CANCELLED, allocations RELEASED, SMS via `Company.Notifications`.
**Permission.** `bo:view`, `bo:allocate`, `bo:convert`, `bo:cancel` · **Approval.** —

---

### Load Sheets — `app/wholesale/load-sheet`
*Source:* `src/4E-distribution.html` (section shell) · `src/9I-distribution.js` (§1 `renderLoadSheet`, `lsRecalc`, `lsGate`, `lsDispatch`)
**Purpose.** Consolidate a run's invoices into a van pick list, check van capacity, print load sheet and gate pass, and dispatch the van.
**Tables.** Primary: `Distribution.LoadSheets`, `Distribution.LoadSheetInvoices`, `Distribution.LoadSheetLines` · Writes: `Inventory.StockTransfers` (+`Line`) warehouse → van · Reads: `Distribution.Routes`, `Distribution.RouteVisitDays`, `Distribution.Vans`, `HumanResources.Employees`, `Sales.SalesInvoices`, `Sales.SalesInvoiceLines`, `Inventory.Products` (shelf, weight, pack), view `Distribution.getLoadSheetPickList`
**Functions.** Save → `Distribution.loadSheetAddUpdate` · Open → `Distribution.getLoadSheetInfo` · Actions → `Distribution.loadSheetCancel`, `Distribution.loadSheetDispatch`
**Lookups.** `LoadSheets.status` → `LoadSheetStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Today's runs · Invoices loaded · Cartons loaded · Load value | view `Distribution.getLoadSheetKpis` | |
| Run builder no `RUN-2026-0413` + status | `Distribution.LoadSheets.docNo`, `.status` | `Company.getNextDocNo('RUN')` |
| Route · Vehicle (van no) · Driver · Date · Departure | `.routeId`, `.vehicleId`, `.driverEmployeeId`, `.docDate`, `.departureTime` | defaults from `Distribution.Routes` |
| Booker / Salesman pills, day chips, On-beat badge | `Distribution.Routes.bookerEmployeeId/.salesmanEmployeeId`, `Distribution.RouteVisitDays` | derived |
| Open invoices: Invoice, Shop, Lines, CTN, Amount (tick) | `Distribution.LoadSheetInvoices.invoiceId`, `.customerId`, `.lineCount`, `.ctnEquiv`, `.invoiceAmount` | open = posted, undelivered, not on a live run |
| Van capacity: model, ctn / kg caps, meters, % of carton space, Fits / Nearly full / Over capacity | `Distribution.Vans.model`; `LoadSheets.capacityCtn/.capacityKg`, `.totalCtnEquiv`, `.totalKg`, `.capacityCtnPct`, `.capacityKgPct` | ≥ 85 % warn, > 100 % blocks dispatch |
| Stats Invoices · Shops · SKU lines · Value | `.invoiceCount`, `.shopCount`, `.skuCount`, `.totalValue` | |
| Consolidated load list: ✓, SKU, Shelf, Product, CTN, PCS, Total pcs, Weight, Value | `Distribution.LoadSheetLines.isPicked`, `.itemId`, `.shelfCode`, `.qtyCtn`, `.qtyLoose`, `.baseQty`, `.weightKg`, `.valueAmount` | sorted by shelf |
| "N of M picked", Mark all picked | `.isPicked`, `.pickedAt`, `.pickedByUserId` | |
| Load sheet print `LS-0412`, sign lines | `.loadSheetNo`, `.preparedByUserId`, `.checkedByUserId`, `.loadSheetPrintedAt` | |
| Gate pass `GP-2026-0412`, Seal no, Out date·time, Returnable crates | `.gatePassNo`, `.sealNo`, `.returnableCrates`, `.gatePassPrintedAt` | QR encodes GP + run + van |
| Runs table (Today / Scheduled / Completed) | `Distribution.LoadSheets.*` | |

**Statuses.** LOADING → SCHEDULED → DISPATCHED → SETTLED · CANCELLED.
**Actions → effects.** *New run* → `Distribution.LoadSheets` LOADING · *Dispatch van* (blocked over capacity) → `Inventory.StockTransfers` source warehouse → van warehouse (POSTING_RULES §Van dispatch), deferred stock issue of the run's invoices from the van, run DISPATCHED, load locked (trigger) · *Print load sheet / Gate pass* → numbers assigned (`LS`, `GP`) · *Settle* → `app/wholesale/settlement`.
**Permission.** `run:view`, `run:build`, `run:dispatch` · **Approval.** —

---

### Route Settlement — `app/wholesale/settlement`
*Source:* `src/4E-distribution.html` (section shell) · `src/9I-distribution.js` (§2 `renderSettlement`, `stBuild`, `stRecalc`, `stReturns`, `stCheque`, `stJournal`, `stPostPreview`)
**Purpose.** Close a van's day: what was delivered, returned and collected, whether the cash bag and van stock tally, and post one journal.
**Tables.** Primary: `Distribution.RouteSettlements`, `Distribution.RouteSettlementLines`, `Distribution.RouteSettlementCheques`, `Distribution.RouteSettlementReturns`, `Distribution.RouteSettlementCashCounts`, `Distribution.VanStockCounts` · Writes: `Sales.CustomerReceipts`, `Sales.CustomerReceiptAllocations`, `Sales.SalesReturns` (+`Line`), `BankCash.Cheques`, `Inventory.StockTransfers` (van → warehouse), `Accounting.Vouchers`, `Distribution.LoadSheets.status`, `Distribution.LoadSheetInvoices.releasedAt` · Reads: `Distribution.LoadSheets`, `Distribution.LoadSheetInvoices`, `Sales.SalesInvoices(Line)`, `Sales.Customers`, `Inventory.Products` (cost)
**Functions.** Save → `Distribution.routeSettlementAddUpdate` · Open → `Distribution.getRouteSettlementInfo` · Actions → `Distribution.routeSettlementPost`
**Lookups.** `RouteSettlements.status` → `RouteSettlementStatus` · `RouteSettlementLines.deliveryState` → `DeliveryState` · `RouteSettlementReturns.reason` → `RouteSettlementReturnReason` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Run picker | `Distribution.RouteSettlements.deliveryRunId` | dispatched runs |
| Run strip: Van, Driver, Salesman, Out → In, Shops, Load value | `Distribution.LoadSheets.vehicleId/.driverEmployeeId/.departureTime/.returnedAt`, `.salesmanEmployeeId`, `.invoiceTotal` | |
| KPIs Collected · Returns · Credit on account · Unexplained | `.cashExpected + .chequeTotal`, `.returnTotal`, `.creditTotal`, `.unexplainedShortTotal + .unexplainedExcessTotal` | |
| Shop · invoice | `Distribution.RouteSettlementLines.customerId`, `.invoiceId` | |
| Invoice / net | `.invoiceAmount`, `.netAmount` (= max(invoice − returns, 0)) | |
| Delivered chip Full / Partial / Not delivered (+ "Shop closed") | `.deliveryState` FULL / PARTIAL / NONE, `.nonDeliveryReason` | NONE ⇒ full return, zero collection |
| Returns "N pcs · value" | `.returnAmount`; `Distribution.RouteSettlementReturns.returnQty`, `.returnValue` | |
| Returns sheet: supplied, qty (≤ supplied), reason | `RouteSettlementReturns.suppliedQty`, `.returnQty`, `.reason` DAMAGED_IN_TRANSIT / EXPIRED / SHOP_REFUSED / WRONG_ITEM / EXCESS_SUPPLIED | |
| Cash · Cheque (#no · bank) · Credit ("over limit by") | `.cashAmount`, `.chequeAmount`, `.creditAmount` | credit limit check vs `Sales.Customers.creditLimit` |
| Cheque sheet: Cheque no, Bank, Amount, Cheque date | `Distribution.RouteSettlementCheques.chequeNo`, `.bankId/.bankName`, `.amount`, `.chequeDate` | PDC stays in Cheques in Hand |
| Difference (Tallied / Short / Excess; click = book as credit) | `.differenceAmount` | |
| Fill cash = net | sets `cashAmount` = net on cash rows | |
| Cash count: 5000 … 10 notes, sub-totals | `Distribution.RouteSettlementCashCounts.denomination`, `.noteCount`, `.amount` | |
| Expected cash · Counted · Short / excess | `RouteSettlements.cashExpected`, `.cashCounted`, `.cashShortAmount`, `.cashOverAmount` | |
| Van stock: Product, Loaded, Delivered, Returned, Counted in van, Variance | `Distribution.VanStockCounts.loadedQty`, `.deliveredQty`, `.returnedQty`, `.countedQty`, `.varianceQty`, `.varianceValue` | expected in van = returned |
| Journal preview (Receipts, Returns, Cash short, Stock variance, Credit sales memo) | `RouteSettlements.journalEntryId` | see POSTING_RULES §Route settlement |

**Statuses.** OPEN → SETTLED (run DISPATCHED → SETTLED). Detail rows locked once SETTLED (trigger).
**Actions → effects.** *Post settlement* → per invoice with cash/cheque a `Sales.CustomerReceipts` (RCPT) allocated to that invoice; cheques → `BankCash.Cheques`; returns → `Sales.SalesReturns` (SR) + stock back van → warehouse (`Inventory.StockTransfers`); one `Accounting.Vouchers` (JV) for receipts, returns, cash short/over and van stock variance; credit = memo only; NONE invoices released from the run; run SETTLED.
**Permission.** `rs:view`, `rs:edit`, `rs:post` · **Approval.** — (cash short books to Salesman Receivable).

---

### Recovery Sheet — `app/wholesale/recovery`
*Source:* `src/4E-distribution.html` (section shell) · `src/9I-distribution.js` (§3 `renderRecovery`, `rcRowHtml`, `rcPost`, `rcPrint`, `rcWhatsApp`)
**Purpose.** The salesman's collection round: who owes what and for how long, what was collected, promises to pay, then bulk-post receipts.
**Tables.** Primary: `Distribution.RecoverySheets`, `Distribution.RecoverySheetLines` · Writes: `Sales.CustomerReceipts`, `Sales.CustomerReceiptAllocations` (FIFO), `BankCash.Cheques`, `Company.Notifications` (WhatsApp) · Reads: `Sales.Customers`, `Distribution.ShopRouteProfiles`, `Distribution.Routes`, `HumanResources.Employees`, view `Distribution.getRecoveryAgeing`, `Distribution.getRouteOutstanding`
**Functions.** Save → `Distribution.recoverySheetAddUpdate` · Open → `Distribution.getRecoverySheetInfo` · Actions → `Distribution.recoverySheetPost`
**Lookups.** `RecoverySheets.status` → `RecoverySheetStatus` · `RecoverySheetLines.mode` → `RecoverySheetLineMode` · `RecoverySheetLines.reminderLanguage` → `ReminderLanguage` · `RecoverySheetLines.status` → `RecoverySheetLineStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Salesman · Route · Date | `Distribution.RecoverySheets.salesmanEmployeeId`, `.routeId`, `.docDate` | NULL = all |
| Chips All / 61+ days / 90+ days / Not collected; Search | filters on `RecoverySheetLines.age6190/.age90Plus`, `.status` | |
| Ring: Target · Posted today · Entered, not posted · Still to collect | `RecoverySheets.targetAmount`, `.postedTotal`, `.collectedTotal − .postedTotal` | per shop target = `Distribution.ShopRouteProfiles.recoveryTargetAmount` |
| KPIs Outstanding · 90+ days · Shops collected · Promises to pay | `.outstandingTotal`, Σ `age90Plus`, count(collected > 0), count(PROMISED) | |
| Shop (code · area · route) | `RecoverySheetLines.customerId` | |
| Contact: phone, call, WhatsApp reminder (EN / اردو), sent dot | `Sales.Customers.phone`; `.remindedAt`, `.reminderLanguage` | message via `Company.Notifications` |
| Outstanding (limit) | `.outstandingAmount`, `.creditLimit` | snapshot |
| Ageing 0–30 / 31–60 / 61–90 / 90+ | `.age030`, `.age3160`, `.age6190`, `.age90Plus` | sum = outstanding |
| Last payment (date, amount) | `.lastPaymentDate`, `.lastPaymentAmount` | |
| Collected | `.collectedAmount` | ≤ outstanding |
| Mode Cash / Cheque / Online / JazzCash | `.mode` | |
| Remarks (Note / Chq no / bank / Txn ID) | `.remarks`, `.chequeId`, `.depositBankAccountId` | |
| Promise to pay (date) | `.promiseToPayDate` | |
| Status Pending / Ready / Promised / `RCPT-2026-000871` | `.status`, `.receiptId` | |
| Print sheet (blank Collected / Mode / PTP / Shop sign) | `RecoverySheets.printedAt` | |

**Statuses.** Entry: PENDING → PROMISED → READY → POSTED (posted is final, trigger). Sheet: OPEN → POSTED → CLOSED.
**Actions → effects.** *Post receipts in bulk (N)* → one `Sales.CustomerReceipts` per READY entry, allocated FIFO to the oldest open invoices (`Sales.CustomerReceiptAllocations`); POSTING_RULES §Recovery receipt · *WhatsApp reminder* → `Company.Notifications`, `remindedAt` · *Print sheet* → `printedAt`.
**Permission.** `rcv:view`, `rcv:edit`, `rcv:post` · **Approval.** —

---

### Routes & Salesmen — `app/wholesale/routes`
*Source:* `src/4E-distribution.html` (section shell) · `src/9I-distribution.js` (§4 `renderRoutes`, `rtCards`, `rtMap`, `rtBoard`, `rtPeople`, `rtNewRoute`)
**Purpose.** Maintain beats, visit days, people and vans per route, assign shops to routes, and track booker/salesman targets and commission.
**Tables.** Primary: `Distribution.Routes`, `Distribution.RouteVisitDays`, `Distribution.RouteStops`, `Distribution.ShopRouteProfiles`, `Distribution.Vans`, `Distribution.ShopAreas`, `Distribution.SalesmanTargets`, `Distribution.CommissionSlabs`, `Distribution.SalesmanCommissions` · Reads: `HumanResources.Employees`, `Sales.Customers`, `Inventory.Warehouses`, views `Distribution.getSalesmanPerformance`, `Distribution.getRouteMonthlySales`, `Distribution.getRouteOutstanding`
**Functions.** Save → `Distribution.routeAddUpdate` · Open → `Distribution.getRouteInfo` ‖ Save → `Distribution.shopRouteProfileAddUpdate` · Open → `Distribution.getShopRouteProfileInfo` ‖ Save → `Distribution.vanAddUpdate` · Open → `Distribution.getVanInfo` ‖ Save → `Distribution.shopAreaAddUpdate` · Open → `Distribution.getShopAreaInfo` ‖ Save → `Distribution.salesmanTargetAddUpdate` · Open → `Distribution.getSalesmanTargetInfo` ‖ Save → `Distribution.commissionSlabAddUpdate` · Open → `Distribution.getCommissionSlabInfo` ‖ Save → `Distribution.salesmanCommissionAddUpdate` · Open → `Distribution.getSalesmanCommissionInfo`
**Lookups.** `Routes.status` → `ActiveInactiveStatus` · `RouteVisitDays.weekday` → `Weekday` · `Vans.status` → `VanStatus` · `ShopAreas.status` → `ActiveInactiveStatus` · `SalesmanTargets.role` → `SalesmanTargetRole` · `SalesmanTargets.status` → `OpenClosedStatus` · `SalesmanCommissions.status` → `SalesmanCommissionStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Route card: `RT-01` · name | `Distribution.Routes.code`, `.name` | |
| Day chips Mon…Sun (≥ 1 required) | `Distribution.RouteVisitDays.weekday` | |
| Booker · Salesman · Van · Driver | `.bookerEmployeeId`, `.salesmanEmployeeId`, `.vehicleId` → `Distribution.Vans.regNo`, `.driverEmployeeId` | supervisor: `.supervisorEmployeeId` |
| Shops count · Monthly sales + sparkline + ▲% | count `Distribution.ShopRouteProfiles`; view `Distribution.getRouteMonthlySales` | |
| Route menu: Build load sheet / Open recovery sheet / Optimise stop order | navigation; optimise rewrites `Distribution.RouteStops.stopSeq` | |
| Route map + stops list (seq, shop, area, tier, due, ETA) | `Distribution.RouteStops.stopSeq`, `.plannedEta`; `Distribution.ShopRouteProfiles.geoLat/.geoLng` | map is **[simulated]** |
| Shop assignment board (drag between routes, move menu) | `Distribution.ShopRouteProfiles.routeId` (stops on old route removed) | column: days · due |
| New route: code, name *, booker, salesman, van, driver, visit days | `Distribution.Routes.*`, `Distribution.RouteVisitDays` | code `RT-NN` |
| Person card: roles (Booker · RT-01), Target achievement %, achieved of target, Strike rate, Productive calls n/m, Commission + slab | `Distribution.SalesmanTargets.targetAmount`, `.achievedAmount`, `.achievementPct`, `.calls`, `.productiveCalls`; `Distribution.SalesmanCommissions.commissionAmount`, `.ratePct` | strike = productive / calls |
| Leaderboard | view `Distribution.getSalesmanPerformance` ordered by achievement | |
| Commission slabs: Achievement, Rate, Who's here, Commission | `Distribution.CommissionSlabs.label`, `.fromPct`, `.toPct`, `.ratePct`; Σ `SalesmanCommissions.commissionAmount` | 0–80 0.5 %, 80–100 1 %, 100–120 1.5 %, 120+ 2 % |

**Statuses.** Route ACTIVE / INACTIVE · Vehicle ACTIVE / MAINTENANCE / INACTIVE · Target OPEN / CLOSED · Commission DRAFT → APPROVED → ACCRUED → PAID · CANCELLED.
**Actions → effects.** *Toggle visit day* → `Distribution.RouteVisitDays` insert/delete · *Drag shop* → `Distribution.ShopRouteProfiles.routeId` update (audited), load sheets follow · *New route* → `Distribution.Routes` + `Distribution.RouteVisitDays` · *Approve / accrue commission* → `Accounting.Vouchers` (POSTING_RULES §Commission accrual).
**Permission.** `route:view`, `route:edit`, `target:edit`, `commission:approve` · **Approval.** Commission accrual by finance.
