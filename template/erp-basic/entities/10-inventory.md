# 10 · Inventory (Basic)

Schema `Inventory` (`database/schema/09-inv.sql`, cross-module FKs in `database/fk/09-Inventory-fks.sql`).
Stock is **never stored on the item**. Every stock effect is a row in the append-only `Inventory.StockMovements`; `Inventory.StockBalances` (item × warehouse × bin × batch) is kept by trigger, which also blocks negative stock where the warehouse says so and recomputes the moving-average cost `Inventory.Products.avgCost`.

Basic screens (11): Product Catalogue, Product Detail, Companies & Brands, Product Classes, Warehouses, Whole Stock, Stock In / Out, Stock Transfers, Stock Adjustments, Batches & Expiry, Stock Movements.

Views used here (written in `90-views.sql`): `Inventory.getWholeStock`, `Inventory.getStockValuation`, `Inventory.getStockCard`, `Inventory.getNearExpiryStock`.

---

### Product Catalogue — `app/inventory/items`
*Source:* `src/4B-products.html` (section `pr-cat`, modals `#pr-new`, `#pr-bulkprice`) · `src/9F-products.js` (catalogue, `validate`, `saveForm`, `inlineEdit`, `importSheet`)
**Purpose.** List, filter, create, edit, duplicate, import and (de)activate products, with live stock and inline price editing.
**Tables.** Primary: `Inventory.Products`, `Inventory.ProductBarcodes`, `Inventory.ProductUnits` · Reads: `Inventory.ProductCompanies`, `Inventory.ProductClasses`, `Inventory.ProductSubclasses`, `Inventory.UnitsOfMeasure`, `Purchases.Vendors` (Distributor), `Inventory.getWholeStock` · Writes: `Inventory.Products`, `Inventory.ProductBarcodes`, `Inventory.ProductUnits`, `Company.Attachments` (image), `Company.DataImports` (import)
**Functions.** Save → `Inventory.productAddUpdate` · Open → `Inventory.getProductInfo`
**Lookups.** `Products.status` → `ProductStatus` · `ProductBarcodes.kind` → `ProductBarcodeKind` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Product Code * | `Inventory.Products.sku` | `^[A-Z0-9][A-Z0-9-]{1,11}$`, unique per tenant ("PK-1001 already exists") |
| UPC (Generate EAN-13) | `Inventory.Products.upc` | 8, 12 or 13 digits; unique per tenant when set |
| Product Name * | `Inventory.Products.name` | trigram-indexed for search |
| Pack (CTN size) * | `Inventory.Products.ctn` | ≥ 1; `baseQty = qtyCtn × ctn + qtyLoose` everywhere |
| Loose * (Pcs / Pack / Box / Roll / Btl / Ream / Coil / Kg / Ltr) | `Inventory.Products.uomId` → `Inventory.UnitsOfMeasure` | |
| Company * | `Inventory.Products.manufacturerId` | required unless DRAFT |
| Distributor | `Inventory.Products.distributorVendorId` → `Purchases.Vendors` | |
| Shelf # | `Inventory.Products.defaultShelf` | `^[A-Z]{1,2}\d{1,3}$` (A1, PR12). Hint only; real slot is `Inventory.WarehouseBins` |
| Multi-UoM preview | `Inventory.ProductUnits` (CTN factor = ctn) | display computed |
| Piece barcode / Carton barcode | `Inventory.ProductBarcodes` (`kind` PIECE / CARTON, `qtyPerScan` 1 / ctn) | unique per tenant |
| Purchase Price * | `Inventory.Products.cost` | > 0 unless DRAFT |
| Retail Price * | `Inventory.Products.price` | ≥ cost unless DRAFT ("Retail is below purchase price") |
| W. Price | `Inventory.Products.wprice` | |
| Cost / Unit | `Inventory.Products.costPerUnit` | defaults to purchase price |
| Margin chips (Retail margin, W. margin, Markup, Net after % disc) | computed | (price−cost)/price etc. |
| High Level / Low Level | `Inventory.Products.highLevel` / `lowLevel` | CHECK low ≤ high |
| % Fin Disc. | `Inventory.Products.finDiscPct` | 0–100 |
| Class * / Sub Type | `Inventory.Products.productClassId` / `productSubclassId` | composite FK proves sub type ∈ class |
| Short Item / Required Expiry / Controlled / Precious | `Inventory.Products.isShort` / `trackExpiry` / `isControlled` / `isPrecious` | Bhatti SHORT / EXPIRY / NARCO / PRECIOUS |
| Product image | `Inventory.Products.imageUrl` (+ `Company.Attachments`) | PNG/JPG ≤ 2 MB |
| GST % (detail) | `Inventory.Products.gstRate`, `Inventory.Products.taxCodeId` | default 18 |
| Filters: Product Scope (Active / Drafts / Inactive / Low Stock) | `Inventory.Products.status`; low = on hand ≤ `lowLevel` | |
| Filters: Company, Class, Shelf, Special Attributes, Stock Range, Search (code, name, UPC) | item columns, `Inventory.ProductBarcodes.barcode`, `Inventory.getWholeStock.qtyOnHand` | |
| Tabs: All, By Company, By Class, Shelf, Short Items, Expiry Required, Precious, Controlled, Stock List | groupings over `Inventory.Products` | |
| Columns: Code, Product Name, UPC, Company, Class, Pack, Shelf, High, Low, Purchase, Retail, W. Price, Stock | `Inventory.Products.*`, `Inventory.getWholeStock` | Stock pill red/amber/green vs low level |
| Stock List: Cost / Unit, CTN + Loose, Stock Value | `Inventory.getStockValuation` | `Company.formatCartonsLoose()` |

**Statuses.** DRAFT (Save Draft: only code + name required) → ACTIVE → INACTIVE (Deactivate) → ACTIVE. Delete = soft delete (`deletedAt`); "Stock history is kept".
**Actions → effects.** *Save Product / Update Product* → insert/update `Inventory.Products` (+ barcodes) · *Save Draft* → `status = DRAFT` · *Duplicate* → new item prefilled, code/UPC/barcodes cleared · *Inline price edit (double-click)* → update `cost` / `price` / `wprice` (audited by `Company.AuditTrailEntries`) · *Activate / Deactivate / Delete (bulk)* → `status` / `deletedAt` · *Print labels* → Barcode Labels (Full) · *Bulk price update* → Full only (`Inventory.BulkPriceUpdates`); in Basic the inline edit is the price tool · *Import* → `Company.DataImports` → `Inventory.Products` · *Export* → file only.
**Permission.** `item:view`, `item:create`, `item:edit`, `item:price`, `item:delete`, `item:import` · **Approval.** —

---

### Product Detail — `app/inventory/products/view`
*Source:* `src/4B-products.html` (section `pr-pd`) · `src/9F-products.js` (`pdHTML`, `paneHTML`, `adjustSheet`)
**Purpose.** One product's 360°: stock by location, reorder status, pricing, stock card, batches, barcodes, open orders and activity.
**Tables.** Primary: `Inventory.Products` · Reads: `Inventory.getWholeStock`, `Inventory.StockBalances`, `Inventory.Warehouses`, `Inventory.StockMovements` (via `Inventory.getStockCard`), `Inventory.ProductBatches`, `Inventory.ProductBarcodes`, `Sales.SalesOrderLines`, `Purchases.PurchaseOrderLines`, `Company.AuditTrailEntries` · Writes: `Inventory.StockAdjustments` (+line) via *Adjust stock*, `Purchases.PurchaseOrders` via *Create PO*
**Functions.** Save → `Inventory.productAddUpdate` · Open → `Inventory.getProductInfo`
**Lookups.** `Products.status` → `ProductStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Hero: code · UPC · company, name, badges (status, class · sub type, attributes) | `Inventory.Products.*`, `Inventory.ProductCompanies.name`, `Inventory.ProductClasses`, `Inventory.ProductSubclasses` | |
| On hand (CTN + loose) | Σ `Inventory.StockBalances.qtyOnHand` | `Company.formatCartonsLoose(qty, ctn)` |
| Available / Reserved | Σ `qtyAvailable` / Σ `qtyReserved` | reserved stays 0 in Basic (no reservations) **[simulated]** |
| Stock value "At weighted average cost" | on hand × `Inventory.Products.avgCost` | `Inventory.getStockValuation` |
| Days of cover, "Selling ~n a day" | on hand ÷ average daily sales from `Inventory.StockMovements` SALE rows | **[simulated]** in prototype |
| Overview · Stock by location | `Inventory.getWholeStock` grouped by `warehouseId` | **[simulated]** split in prototype |
| Overview · Reorder settings (Low, High, Suggested order CTN, Lead time, Shelf, Pack) | `Inventory.Products.lowLevel`, `highLevel`, `ctn`, `defaultShelf` | suggested = ceil((high − on hand)/ctn); lead time **[simulated]** |
| Overview · Pricing (Purchase, W. price, Retail, CTN prices, price tiers, scheme / GST · Fin. discount) | `Inventory.Products.cost`, `wprice`, `price`, `gstRate`, `finDiscPct`; tiers from `Sales.PriceListItems` | schemes are Full (`Sales.SalesSchemeItems`) |
| Stock Card: Opening, In, Out, Closing; Date, Document, Type, Location, In, Out, Balance | `Inventory.getStockCard` (`movementDate`, `sourceDocNo`, `movementType`, `warehouseId`, `qtyIn`, `qtyOut`, running balance) | filter All / In / Out |
| Price History (12 months) | Full: `Inventory.ProductPriceLogs`; Basic derives purchase price from `Purchases.VendorBillLines` and sale price from `Sales.SalesInvoiceLines` | |
| Suppliers tab | Full: `Inventory.ProductSuppliers`; Basic derives from `Purchases.VendorBillLines` by vendor | |
| Batches & Expiry: #, Batch, Expiry, Days left, Qty, Cost, Value, Status (Pick next / Expiring soon / Watch / Fresh) | `Inventory.ProductBatches.batchNo`, `expiryDate`, `unitCost`; qty from `Inventory.StockBalances` | FEFO order; empty state "Not expiry-tracked" |
| Enable expiry tracking | `Inventory.Products.trackExpiry = true` | |
| Barcodes & Labels: Piece / Carton barcode, Copy, Print | `Inventory.ProductBarcodes` | |
| Open Orders: Type (SO/PO), Order, Party, Date, Due, Qty, Progress, Status | `Sales.SalesOrderLines`, `Purchases.PurchaseOrderLines` | read-only |
| Activity timeline | `Company.AuditTrailEntries` (table `Inventory.Products`), `Inventory.StockMovements` | |
| Adjust stock sheet: Stock in / Stock out, Cartons, Loose, Reason, Location | `Inventory.StockAdjustments` (`warehouseId`, `reasonId` direction ADJ) + one `Inventory.StockAdjustmentLines` (`qtyOnHand`, `qtyCounted` = on hand ± qty) | reasons: Physical count, Damaged / breakage, Found stock, Free sample, Opening correction |

**Statuses.** As item.
**Actions → effects.** *Edit* → Product Catalogue form · *Print label* → Barcode Labels (Full) · *Adjust stock* → `Inventory.StockAdjustments` POSTED (or PENDING_APPROVAL above the limit) → `Inventory.StockMovements` ADJUSTMENT rows + JV (POSTING_RULES §Stock adjustment) · *Create PO* → draft `Purchases.PurchaseOrders` for ceil(max(high − on hand, ctn)/ctn) cartons from the preferred supplier.
**Permission.** `item:view`, `adj:create`, `po:create` · **Approval.** Adjustment above Rs 25,000 → Finance Manager.

---

### Companies & Brands — `app/inventory/companies`
*Source:* `src/4B-products.html` (section `pr-co`) · `src/9F-products.js` (`renderCO`, `saveCO`, `coDrawer`)
**Purpose.** Maintain product companies / principals and see their products and stock.
**Tables.** Primary: `Inventory.ProductCompanies` · Reads: `Inventory.Products`, `Inventory.getStockValuation` · Writes: `Inventory.ProductCompanies`
**Functions.** Save → `Inventory.productCompanyAddUpdate` · Open → `Inventory.getProductCompanyInfo`
**Lookups.** `ProductCompanies.status` → `ActiveInactiveStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs: Total / Active / Inactive companies, Most Used Company | count of `Inventory.ProductCompanies` by `status`; top by item count | |
| Company Code * (generate next) | `Inventory.ProductCompanies.code` | `^[A-Z]{2,3}-?\d{2,3}$` (CO-13); sequence MFR |
| Company Name * | `Inventory.ProductCompanies.name` | unique case-insensitive |
| Status (Active / Inactive) | `Inventory.ProductCompanies.status` | |
| Address / City / Country | `address`, `city`, `country` | city datalist |
| Brand colour (swatches) | `brandColour` | `#RRGGBB` |
| Phone / Email / Website / Notes | `phone`, `email`, `website`, `notes` | validated |
| Logo short text | `shortName` | ≤ 5 chars |
| Card: n Products, City, Country, Updated | count `Inventory.Products`; `updatedAt` | |
| Filters: search (code, name, city), City, With / No products, Sort, Status segment | | |
| Drawer stats: Products, Stock value, Low stock | `Inventory.Products`, `Inventory.getStockValuation` | |
| Drawer · Principal claims & targets | Full only (`Inventory.PrincipalClaims`, `Inventory.PrincipalTargets`) | |
| Drawer · Products table | `Inventory.Products` (code, name, retail, stock) | |

**Statuses.** ACTIVE ↔ INACTIVE.
**Actions → effects.** *Save Company* → insert `Inventory.ProductCompanies` · *Activate / Deactivate* → `status` · *Open in catalogue* → catalogue filtered by company · *Import Companies* → `Company.DataImports`.
**Permission.** `mfr:view`, `mfr:create`, `mfr:edit` · **Approval.** —

---

### Product Classes — `app/inventory/classes`
*Source:* `src/4B-products.html` (section `pr-cl`, modal `#pr-clmodal`) · `src/9F-products.js` (`renderCL`, `clSave`, drag & drop)
**Purpose.** Maintain main classes and their sub types, visibility and order.
**Tables.** Primary: `Inventory.ProductClasses`, `Inventory.ProductSubclasses` · Reads: `Inventory.Products` (product counts) · Writes: same
**Functions.** Save → `Inventory.productClassAddUpdate` · Open → `Inventory.getProductClassInfo`

| UI field / column | Table.column | Notes |
|---|---|---|
| Main ID (auto) | `Inventory.ProductClasses.code` | MC-NNN |
| Main Class Name * | `Inventory.ProductClasses.name` | unique per tenant |
| Icon (picker) | `Inventory.ProductClasses.icon` | lucide name |
| Visible in sales & purchase screens | `Inventory.ProductClasses.isVisible` | |
| Sub ID (auto) | `Inventory.ProductSubclasses.code` | ST-NNN |
| Parent Main Class * | `Inventory.ProductSubclasses.productClassId` | |
| Sub Type Name * | `Inventory.ProductSubclasses.name` | unique within the class ("Already in Packaging") |
| Visibility toggle | `Inventory.ProductSubclasses.isVisible` | |
| Drag to reorder | `Inventory.ProductSubclasses.sortOrder` | |
| Products / Sub Types counts, hidden count | counts over `Inventory.Products`, `Inventory.ProductSubclasses` | |

**Statuses.** visible / hidden; delete = soft delete (`deletedAt`), items keep their main class.
**Actions → effects.** *Add Main Class / Add Sub Type / rename / delete / reorder / toggle visibility* → rows above.
**Permission.** `pclass:view`, `pclass:edit` · **Approval.** —

---

### Warehouses — `app/inventory/warehouses`
*Source:* `src/41-acc-trade.html` (section `app/inventory/warehouses`, modal `#trd-new-warehouse`)
**Purpose.** Storage locations, capacity utilisation, stock held and recent inter-warehouse transfers.
**Tables.** Primary: `Inventory.Warehouses`, `Inventory.WarehouseBins` · Reads: `Inventory.getStockValuation`, `Inventory.StockTransfers`, `Company.Branches`, `Company.Users`, `Accounting.ChartOfAccounts` · Writes: `Inventory.Warehouses`, `Inventory.WarehouseBins`
**Functions.** Save → `Inventory.warehouseAddUpdate` · Open → `Inventory.getWarehouseInfo` ‖ Save → `Inventory.warehouseBinAddUpdate` · Open → `Inventory.getWarehouseBinInfo`
**Lookups.** `Warehouses.type` → `WarehouseType` · `Warehouses.status` → `ActiveInactiveStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Name * | `Inventory.Warehouses.name` | |
| Code * | `Inventory.Warehouses.code` | WH-LHR, SH-DHA |
| Description ("Main distribution centre") | `Inventory.Warehouses.description` | |
| Type (Warehouse / Shop) | `Inventory.Warehouses.type` | Full adds VAN |
| Branch | `Inventory.Warehouses.branchId` → `Company.Branches` | |
| Manager | `Inventory.Warehouses.managerUserId` → `Company.Users` | |
| Address | `Inventory.Warehouses.address`, `city` | |
| Capacity (pallets) | `Inventory.Warehouses.capacityPallets` | utilisation % = pallets used ÷ capacity **[simulated]** (pallets used is not tracked) |
| Inventory account | `Inventory.Warehouses.inventoryAccountId` → `Accounting.ChartOfAccounts` | |
| Block sales when stock is insufficient | `Inventory.Warehouses.blockNegativeStock` | enforced by `Inventory.triggerStockLedgerApply` |
| Primary badge | `Inventory.Warehouses.isPrimary` | one per tenant |
| Stock value, SKUs | `Inventory.getStockValuation` by warehouse | |
| Bins / racks | count of `Inventory.WarehouseBins` / distinct `Inventory.WarehouseBins.rack` | |
| KPIs: Warehouses, Total Stock Value, Avg Utilisation, Transfers in Transit | `Inventory.Warehouses`, `Inventory.getStockValuation`, `Inventory.StockTransfers` status POSTED/DISPATCHED/IN_TRANSIT | |
| Inter-warehouse transfers: Transfer #, From, To, Dispatched, Items, Value, Carrier, Status | `Inventory.StockTransfers` (`docNo`, `fromWarehouseId`, `toWarehouseId`, `dispatchedAt`, lines, `totalValue`, `carrier`, `status`) | |

**Statuses.** ACTIVE / INACTIVE.
**Actions → effects.** *Add Warehouse / Edit* → `Inventory.Warehouses` · *New transfer* → Stock Transfers · *View stock* → Whole Stock filtered.
**Permission.** `wh:view`, `wh:edit` · **Approval.** —

---

### Whole Stock — `app/inventory/stock`
*Source:* `src/48-dash-stock.html` (section `ws-screen`) · `src/92-dash.js` (WHOLE STOCK: `P`, `COLS`, `TC`)
**Purpose.** The whole inventory across locations, current or as on a date, with status chips and selectable columns.
**Tables.** Primary: view `Inventory.getWholeStock` (current) / `Inventory.getStockValuation` (as on date, from `Inventory.StockMovements`) · Reads: `Inventory.Products`, `Inventory.ProductCompanies`, `Inventory.ProductClasses`, `Inventory.ProductSubclasses`, `Inventory.Warehouses`, `Inventory.WarehouseBins`, `Inventory.ProductBatches` · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Stock View: Current / As on Date | current = `Inventory.StockBalances`; as on = Σ `Inventory.StockMovements` up to date | |
| KPIs: Total Products, Total Stock (Units), Total Stock Value (at average cost), Low Stock, Overstock, Out of Stock | aggregates of `Inventory.getWholeStock` | low: on hand ≤ lowLevel; over: > highLevel; out: ≤ 0 |
| Product (name + description) | `Inventory.Products.name`, `description` | |
| SKU / UPC | `Inventory.Products.sku`, `upc` | |
| Company / Class / Sub Class | `Inventory.ProductCompanies.name`, `Inventory.ProductClasses.name`, `Inventory.ProductSubclasses.name` | |
| Warehouse / Location | `Inventory.Warehouses.name`, `Inventory.WarehouseBins.code` | |
| Current Stock / Reserved / Available | `qtyOnHand`, `qtyReserved`, `qtyAvailable` | reserved 0 in Basic |
| Reorder Level | `Inventory.Products.lowLevel` | |
| Unit Cost (PKR) / Stock Value (PKR) | `Inventory.Products.avgCost`; on hand × avg cost | |
| Batch / Expiry | `Inventory.ProductBatches.batchNo`, `expiryDate` | |
| Status (In Stock / Low Stock / Overstock / Out of Stock) | derived | |
| Last Movement | `Inventory.StockBalances.lastMovementAt` | |
| Created By | `Inventory.Products.createdBy` → `Company.Users` | |
| Filters: search, Company / Principal, Category, Sub Category, Warehouse, Location, Stock Status, Stock Count range, Stock Value range, Reorder Level, Stock As On Date, Sort By | view columns | |
| Save View | browser storage today; server-side saved views are an open question | |

**Statuses.** derived stock status only.
**Actions → effects.** *Export / Print* → file · *Add Product* → Product Catalogue.
**Permission.** `stock:view`, `stock:value` (value columns) · **Approval.** —

---

### Stock In / Out — `app/inventory/stock-in-out`
*Source:* `src/4C-stock-ops.html` (`data-so="inout"`) · `src/9G-stock-ops.js` (§1 MANUAL STOCK IN / OUT: `REASONS`, `issues`, `save`)
**Purpose.** Manual stock-in (MI) or stock-out (MO) entries with a reason, outside purchase / sale documents.
**Tables.** Primary: `Inventory.StockInOut`, `Inventory.StockInOutEntryLines` · Reads: `Inventory.StockMovementReasons`, `Inventory.Warehouses`, `Inventory.WarehouseBins`, `Inventory.Products`, `Inventory.ProductBarcodes`, `Inventory.ProductBatches`, `Inventory.StockBalances` · Writes: `Inventory.StockInOut(+Line)`, `Inventory.ProductBatches` (new batch), `Inventory.StockMovements`, `Accounting.Vouchers`
**Functions.** Save → `Inventory.stockInOutEntryAddUpdate` · Open → `Inventory.getStockInOutEntryInfo` · Actions → `Inventory.stockInOutEntryPost`, `Inventory.stockInOutEntryCancel`
**Lookups.** `StockInOut.mode` → `StockInOutEntryMode` · `StockInOut.status` → `DraftPostedCancelledStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Manual Stock In / Manual Stock Out (mode) | `Inventory.StockInOut.mode` IN / OUT | prefix MI- / MO- |
| Entry No. (gear: manual numbering) | `docNo` | `Company.getNextDocNo('MI'|'MO')`, or typed |
| Entry Date | `docDate` | |
| Manual Reference No. | `manualRef` | |
| Movement Reason * (select + tiles) | `reasonId` → `Inventory.StockMovementReasons` | composite FK forces reason direction = mode |
| Warehouse * | `warehouseId` | |
| Location / Shelf / Rack | `binId` → `Inventory.WarehouseBins` (must belong to the warehouse) | A-01-01 |
| Requested By | `requestedByName` (Full: `requestedByEmployeeId`) | |
| Entered By * | `enteredByUserId` | session user |
| Notes (≤ 300) | `notes` | |
| Lines: #, Product, UPC / Barcode, Batch, Quantity, Unit Cost, Total Value | `Inventory.StockInOutEntryLines` (`lineNo`, `itemId`, `batchId` / `newBatchNo` + `newExpiryDate`, `qty`, `unitCost`, `value`) | carton barcode scan adds `ctn` units |
| Avail hint ("Only n available") | `Inventory.StockBalances.qtyAvailable` for item/warehouse/batch | |
| Entry Summary: Total Items / Quantity / Value | `totalItems`, `totalQty`, `totalValue` | |
| Validation box | rules: reason, warehouse, ≥ 1 line, qty > 0, IN needs cost > 0, OUT needs batch for expiry items and qty ≤ available | |
| Recent Manual Entries: Date, Entry No., Type, Reason, Reference No., Items, Quantity, Total Value, Status, Entered By | header columns | |

**Statuses.** DRAFT → POSTED · CANCELLED (drafts only).
**Actions → effects.** *Save as Draft* → DRAFT · *Save & Post* → POSTED; per line `Inventory.StockMovements` row (MANUAL_IN / OPENING for "Opening Stock" on IN; MANUAL_OUT / WRITE_OFF for "Expired Write-off" on OUT; reason's `ledgerMovementType`), new batches created first; JV per POSTING_RULES §Manual stock in/out.
**Permission.** `mstock:view`, `mstock:create`, `mstock:post` · **Approval.** —

---

### Stock Transfers — `app/inventory/transfer`
*Source:* `src/4C-stock-ops.html` (`data-so="transfer"`) · `src/9G-stock-ops.js` (§2 STOCK TRANSFERS: `T`, `post`, `receive`)
**Purpose.** Move stock between warehouses and shops, dispatch it and receive it at the destination.
**Tables.** Primary: `Inventory.StockTransfers`, `Inventory.StockTransferLines` · Reads: `Inventory.Warehouses`, `Inventory.Products`, `Inventory.ProductBatches`, `Inventory.StockBalances`, `Company.Users` · Writes: `Inventory.StockTransfers(+Line)`, `Inventory.StockMovements`, `Accounting.Vouchers` (only when inventory accounts differ)
**Functions.** Save → `Inventory.stockTransferAddUpdate` · Open → `Inventory.getStockTransferInfo` · Actions → `Inventory.stockTransferPost`, `Inventory.stockTransferCancel`, `Inventory.stockTransferReceive`
**Lookups.** `StockTransfers.status` → `StockTransferStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Transfer No. (locked) | `Inventory.StockTransfers.docNo` | TRF-YYYY-NNNNNN (prototype TR-000124 unified) |
| Date & Time | `transferAt`, `docDate` | |
| Prepared By | `preparedByUserId` | |
| Remarks | `remarks` | |
| From / To location cards (name, address, type, current stock, active products) | `fromWarehouseId`, `toWarehouseId` → `Inventory.Warehouses`; stats from `Inventory.getWholeStock` | CHECK from ≠ to ("Source and destination are the same") |
| Manifest line: product, Batch, Expiry, Company, Available, Transfer CTN, Loose Qty, Cost, Value, Controlled toggle | `Inventory.StockTransferLines` (`itemId`, `batchId`, `ctnSize`, `qtyCtn`, `qtyLoose`, `baseQty`, `unitCost`, `value`, `isControlled`); available from `Inventory.StockBalances` | `baseQty = qtyCtn × ctnSize + qtyLoose` (generated) |
| Footer: Total Items / Quantity / Loose / Value | `totalItems`, `totalQty`, `totalValue` | |
| Transfer slip (print) | header + lines | |
| Recent Transfers | `Inventory.StockTransfers` list | |
| Incoming transfers: status, route, progress, lines, qty, value, Dispatched, ETA, driver · vehicle | `status`, `dispatchedAt`, `etaAt`, `driverName`, `vehicleNo`, `carrier` | progress bar **[simulated]** |
| Receive sheet: Sent, Received, Shortage, Excess, Receiving note | Basic: receive in full; `receivedAt`, `receivedByUserId`, `receiptNote` | per-line variance is Full (`Inventory.StockTransferReceiptLines`) |

**Statuses.** DRAFT → POSTED ("Pending") → DISPATCHED → IN_TRANSIT → RECEIVED · CANCELLED.
**Actions → effects.** *Save Draft* → DRAFT · *Save & Post* → POSTED (+ DISPATCHED when sent now): `Inventory.StockMovements` TRANSFER_OUT at source (`counterWarehouseId` = destination) · *Receive / Confirm Receipt* → RECEIVED: TRANSFER_IN at destination · GL only if the two warehouses use different inventory accounts (POSTING_RULES §Transfer).
**Permission.** `trf:view`, `trf:create`, `trf:post`, `trf:receive` · **Approval.** —

---

### Stock Adjustments — `app/inventory/adjustments`
*Source:* `src/41-acc-trade.html` (section `app/inventory/adjustments`, modal `#po-adj-new`)
**Purpose.** Record count variances, damages, write-offs and internal consumption; posts to inventory and the adjustment account.
**Tables.** Primary: `Inventory.StockAdjustments`, `Inventory.StockAdjustmentLines` · Reads: `Inventory.Warehouses`, `Inventory.StockMovementReasons` (direction ADJ), `Inventory.Products`, `Inventory.StockBalances`, `Accounting.ChartOfAccounts` · Writes: `Inventory.StockAdjustments(+Line)`, `Inventory.StockMovements`, `Accounting.Vouchers`, `Company.Approvals` (Full)
**Functions.** Save → `Inventory.stockAdjustmentAddUpdate` · Open → `Inventory.getStockAdjustmentInfo` · Actions → `Inventory.stockAdjustmentPost`, `Inventory.stockAdjustmentCancel`
**Lookups.** `StockAdjustments.status` → `StockAdjustmentStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Adjustment # (+ preparer) | `docNo`, `preparedByUserId` | ADJ-2026-000031 |
| Date | `docDate` | |
| Warehouse | `warehouseId` | |
| Reason * (Cycle count variance, Damaged, Expired, Theft / loss, Internal consumption, Found in count) | `reasonId` → `Inventory.StockMovementReasons` (ADJ) | |
| Offset account (5090 Inventory Adjustment / 5095 Inventory Write-off) | `offsetAccountId` → `Accounting.ChartOfAccounts` | default from reason |
| Lines: Item, On hand, Counted, Change, Value | `Inventory.StockAdjustmentLines` (`itemId`, `batchId`, `qtyOnHand`, `qtyCounted`, `qtyChange`, `unitCost`, `value`) | change and value generated at weighted-average cost |
| Net adjustment · n lines | `netValue`, `lineCount` | signed |
| Remarks | `remarks` | |
| Register: Adjustment #, Date, Warehouse, Reason, Lines, Value, Status | header | |
| KPIs: Net Write-down (Q1), Pending Approval, Last Full Count | Σ `netValue`; count PENDING_APPROVAL; last full count (Full: `Inventory.StockCounts`) | |
| Q1 by reason | Σ `netValue` group by `reasonId` | |
| "Above Rs 25,000 needs Finance Manager approval" | `approvalRequired` | limit from `Company.CompanySettingValues` |

**Statuses.** DRAFT → PENDING_APPROVAL → POSTED · REJECTED · CANCELLED (DRAFT → POSTED directly when no approval is required).
**Actions → effects.** *Save draft* → DRAFT · *Submit for approval* → PENDING_APPROVAL (or POSTED below the limit) · *Approve* → POSTED: `Inventory.StockMovements` ADJUSTMENT rows (WRITE_OFF for write-off reasons), JV Dr/Cr offset vs inventory (POSTING_RULES §Stock adjustment) · *Start stock count* → Stock Count (Full).
**Permission.** `adj:view`, `adj:create`, `adj:approve`, `adj:post` · **Approval.** |net value| > Rs 25,000 → Finance Manager.

---

### Batches & Expiry — `app/inventory/batches`
*Source:* `src/4C-stock-ops.html` (`data-so="batches"`) · `src/9G-stock-ops.js` (§4 BATCHES & EXPIRY: `BATCHES`, `WINS`, `act`)
**Purpose.** FEFO register of every batch across locations with expiry windows, timeline, calendar and disposition actions.
**Tables.** Primary: `Inventory.ProductBatches` · Reads: `Inventory.getNearExpiryStock`, `Inventory.StockBalances`, `Inventory.Products`, `Inventory.ProductCompanies`, `Inventory.Warehouses` · Writes: `Inventory.ProductBatches.disposition`, `Inventory.StockAdjustments` (write-off), `Inventory.StockMovements`
**Functions.** Save → `Inventory.productBatchAddUpdate` · Open → `Inventory.getProductBatchInfo`
**Lookups.** `ProductBatches.disposition` → `ProductBatchDisposition` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Window cards: Expired, Next 30 days, Next 90 days, Within 6 months, All batches (count, Rs value) | `Inventory.getNearExpiryStock` (`daysLeft`, `value`) | |
| Expiry timeline (value per month) / Expiry calendar (26 weeks) | `Inventory.getNearExpiryStock` grouped by month / day | |
| #, Product, Batch, Location, Expiry, Days remaining, Qty, Value (Rs), Disposition | `Inventory.ProductBatches.batchNo`, `expiryDate`, `disposition`; `Inventory.StockBalances.warehouseId`, `qtyOnHand`; value = qty × `Inventory.ProductBatches.unitCost` | ordered by expiry (FEFO) |
| Disposition badge (Quarantine / Priority sale / Saleable / Clearance / Return to principal / Written off) | `Inventory.ProductBatches.disposition` | default rule: expired → QUARANTINE, ≤ 90 d → PRIORITY, else SALEABLE |
| Search (product / batch), Location filter | | |

**Statuses.** SALEABLE · PRIORITY · QUARANTINE · CLEARANCE · RETURN_TO_PRINCIPAL · WRITTEN_OFF.
**Actions → effects.** *Move to clearance / Return to principal / Restore disposition* → update `Inventory.ProductBatches.disposition` (audited) · *Write off…* → `Inventory.StockAdjustments` (reason Expired write-off) POSTED → `Inventory.StockMovements` WRITE_OFF + JV Dr 5095 / Cr inventory; `disposition = WRITTEN_OFF` · *Transfer to another location* → Stock Transfers · *Export register* → CSV.
**Permission.** `batch:view`, `batch:dispose`, `batch:writeoff` · **Approval.** Write-off above Rs 25,000 (adjustment rule).

---

### Stock Movements — `app/inventory/movements`
*Source:* `src/4C-stock-ops.html` (`data-so="moves"`) · `src/9G-stock-ops.js` (§6 STOCK MOVEMENTS: `MTYPES`, `MOVES`)
**Purpose.** The movement ledger: every unit in and out with filters, KPIs, mix and locations.
**Tables.** Primary: `Inventory.StockMovements` (via `Inventory.getStockCard`) · Reads: `Inventory.Products`, `Inventory.Warehouses`, `Company.Users` · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Date (+ time) | `movementDate`, `movementAt` | |
| Reference (+ "by user") | `sourceDocNo`, `userId` | |
| Type (Purchase, Sales Return, Sale, Purchase Return, Issue, Transfer, Adjustment, Count) | `movementType` (GRN, SALES_RETURN, SALE, PURCHASE_RETURN, MANUAL_OUT…, TRANSFER_OUT/IN, ADJUSTMENT, COUNT) | |
| Product | `itemId` → `Inventory.Products` | |
| Route (from → to / gain · loss) | `warehouseId`, `counterWarehouseId`, `partyLabel` | |
| Qty (± / ⇄) | `qtyIn` − `qtyOut` | |
| Value (Rs) | `value` | |
| KPIs: Movements, Quantity in, Quantity out, Net change, Transferred | aggregates | |
| Filters: search (ref, product, party, user), direction (All / In / Out / Transfer / Adjustment), type, product, location, date range | indexed `(tenantId, movementDate, seq)` | |
| Movement mix / Locations touched | group by `movementType` / `warehouseId` | |

**Statuses.** n/a (ledger rows are immutable).
**Actions → effects.** *Export CSV / Print* → file · *Manual entry* → Stock In / Out.
**Permission.** `stockmv:view` · **Approval.** —
