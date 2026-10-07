# 10 · Inventory (Full)

Schema `Inventory` (`database/schema/09-inv.sql`, cross-module FKs in `database/fk/09-Inventory-fks.sql`).
Stock is **never stored on the item**. Every stock effect is a row in the append-only `Inventory.StockMovements`; `Inventory.StockBalances` (item × warehouse × bin × batch) is kept by trigger, which also blocks negative stock where the warehouse says so and recomputes the moving-average cost `Inventory.Products.avgCost`. In Full, `Inventory.StockReservations` keeps `StockBalances.qtyReserved` and a SALE trigger keeps `Inventory.Products.lastSaleDate`.

Screens (18): the 11 Basic screens (Product Catalogue, Product Detail, Companies & Brands, Product Classes, Warehouses, Whole Stock, Stock In / Out, Stock Transfers, Stock Adjustments, Batches & Expiry, Stock Movements) plus Kits & Bundles, Barcode Labels, Stock In View, Stock Count, Stock Vouchers, Demand & Reorder, Inventory Reports.

Views used here (written in `90-views.sql`): `Inventory.getWholeStock`, `Inventory.getStockValuation`, `Inventory.getStockCard`, `Inventory.getStockInView`, `Inventory.getNearExpiryStock`, `Inventory.getDeadAndSlowStock`, `Inventory.getAbcAnalysis`, `Inventory.getReorderSuggestions`.

Full-only differences on the Basic screens are marked **(Full)**.

---

### Product Catalogue — `app/inventory/items`
*Source:* `src/4B-products.html` (section `pr-cat`, modals `#pr-new`, `#pr-bulkprice`) · `src/9F-products.js` (catalogue, `validate`, `saveForm`, `inlineEdit`, `importSheet`)
**Purpose.** List, filter, create, edit, duplicate, import and (de)activate products, with live stock and inline price editing.
**Tables.** Primary: `Inventory.Products`, `Inventory.ProductBarcodes`, `Inventory.ProductUnits` · Reads: `Inventory.ProductCompanies`, `Inventory.ProductClasses`, `Inventory.ProductSubclasses`, `Inventory.UnitsOfMeasure`, `Purchases.Vendors` (Distributor), `Inventory.getWholeStock` · Writes: `Inventory.Products`, `Inventory.ProductBarcodes`, `Inventory.ProductUnits`, `Company.Attachments` (image), `Company.DataImports` (import)
**Functions.** Save → `Inventory.productAddUpdate` · Open → `Inventory.getProductInfo`
**Lookups.** `Products.status` → `ProductStatus` · `Products.abcClass` → `AbcClass` · `ProductBarcodes.kind` → `ProductBarcodeKind` (values in `Lookups.Lookups`)

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
| **(Full)** Weight, ABC class, Avg / day, Last sale, Lead time | `Inventory.Products.weightKg`, `abcClass`, `avgDailySales`, `lastSaleDate`, `leadDays` | used by Demand, Count scope, Report Studio |
| **(Full)** Bulk price update: Apply to (By company / By class / Selected), Company / Class, Price field (Retail / W. price / Purchase / Retail + W. price), Change % (step 0.5, quick −10 … +10), Round to (Rs 1 / 5 / 10 / none) | `Inventory.BulkPriceUpdates` (`applyTo`, `manufacturerId`, `productClassId`, `priceField`, `changePct`, `roundTo`) | |
| **(Full)** Bulk table: Code, Product, Old, New, Change, Margin; "Apply to n products" | `Inventory.BulkPriceUpdateLines` (`oldValue`, `newValue`, `changeAmount`); `itemCount` | margin computed |

**Actions → effects.** *Save Product / Update Product* → insert/update `Inventory.Products` (+ barcodes) · *Save Draft* → `status = DRAFT` · *Duplicate* → new item prefilled, code/UPC/barcodes cleared · *Inline price edit (double-click)* → update `cost` / `price` / `wprice` + **(Full)** `Inventory.ProductPriceLogs` (source INLINE_EDIT) · *Activate / Deactivate / Delete (bulk)* → `status` / `deletedAt` · *Print labels* → Barcode Labels (`Inventory.BarcodeLabelJobs`) · *Bulk price update → Apply* → `Inventory.BulkPriceUpdates` APPLIED + lines, item prices updated, `Inventory.ProductPriceLogs` (source BULK_UPDATE) · *Undo* → batch UNDONE, old values restored (source UNDO) · *Import* → `Company.DataImports` → `Inventory.Products` · *Export* → file only.
**Permission.** `item:view`, `item:create`, `item:edit`, `item:price`, `item:delete`, `item:import`, `item:bulkprice` · **Approval.** —

---

### Product Detail — `app/inventory/products/view`
*Source:* `src/4B-products.html` (section `pr-pd`) · `src/9F-products.js` (`pdHTML`, `paneHTML`, `adjustSheet`)
**Purpose.** One product's 360°: stock by location, reorder status, pricing, stock card, batches, barcodes, open orders and activity.
**Tables.** Primary: `Inventory.Products` · Reads: `Inventory.getWholeStock`, `Inventory.StockBalances`, `Inventory.Warehouses`, `Inventory.StockMovements` (via `Inventory.getStockCard`), `Inventory.ProductBatches`, `Inventory.ProductBarcodes`, `Sales.SalesOrderLines`, `Purchases.PurchaseOrderLines`, `Company.AuditTrailEntries` · Writes: `Inventory.StockAdjustments` (+line) via *Adjust stock*, `Purchases.PurchaseOrders` via *Create PO*
**Functions.** Save → `Inventory.productAddUpdate` · Open → `Inventory.getProductInfo`
**Lookups.** `Products.status` → `ProductStatus` · `Products.abcClass` → `AbcClass` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Hero: code · UPC · company, name, badges (status, class · sub type, attributes) | `Inventory.Products.*`, `Inventory.ProductCompanies.name`, `Inventory.ProductClasses`, `Inventory.ProductSubclasses` | |
| On hand (CTN + loose) | Σ `Inventory.StockBalances.qtyOnHand` | `Company.formatCartonsLoose(qty, ctn)` |
| Available / Reserved ("On n open sales orders") | Σ `qtyAvailable` / Σ `qtyReserved` | **(Full)** kept by `Inventory.StockReservations` (ACTIVE rows) **[simulated]** in prototype |
| Stock value "At weighted average cost" | on hand × `Inventory.Products.avgCost` | `Inventory.getStockValuation` |
| Days of cover, "Selling ~n a day" | on hand ÷ average daily sales from `Inventory.StockMovements` SALE rows | **[simulated]** in prototype |
| Overview · Stock by location | `Inventory.getWholeStock` grouped by `warehouseId` | **[simulated]** split in prototype |
| Overview · Reorder settings (Low, High, Suggested order CTN, Lead time, Shelf, Pack) | `Inventory.Products.lowLevel`, `highLevel`, `ctn`, `defaultShelf`, **(Full)** `Inventory.Products.leadDays` / `Inventory.ReorderRules` | suggested = ceil((high − on hand)/ctn); lead time **[simulated]** |
| Overview · Pricing (Purchase, W. price, Retail, CTN prices, price tiers, scheme / GST · Fin. discount) | `Inventory.Products.cost`, `wprice`, `price`, `gstRate`, `finDiscPct`; tiers from `Sales.PriceListItems`; **(Full)** active scheme from `Sales.SalesSchemeItems` | |
| Stock Card: Opening, In, Out, Closing; Date, Document, Type, Location, In, Out, Balance | `Inventory.getStockCard` (`movementDate`, `sourceDocNo`, `movementType`, `warehouseId`, `qtyIn`, `qtyOut`, running balance) | filter All / In / Out |
| Price History (12 months): Sale price, Purchase price, Avg margin, Last purchase change, Price changes | **(Full)** `Inventory.ProductPriceLogs` (`priceField` PRICE / COST, `newValue`, `changedAt`) | monthly series = last value per month |
| Suppliers: Supplier, Last price, vs current, Lead time, Last purchase, Share of buying, Preferred | **(Full)** `Inventory.ProductSuppliers` (`vendorId`, `lastPrice`, `leadDays`, `lastPurchaseDate`, `sharePct`, `isPreferred`) | |
| Batches & Expiry: #, Batch, Expiry, Days left, Qty, Cost, Value, Status (Pick next / Expiring soon / Watch / Fresh) | `Inventory.ProductBatches.batchNo`, `expiryDate`, `unitCost`; qty from `Inventory.StockBalances` | FEFO order; empty state "Not expiry-tracked" |
| Enable expiry tracking | `Inventory.Products.trackExpiry = true` | |
| Barcodes & Labels: Piece / Carton barcode, Copy, Print, "Printed 3 times this month" | `Inventory.ProductBarcodes`; **(Full)** count of `Inventory.BarcodeLabelJobLines` this month | |
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
| **(Full)** Drawer · Claims pending (Rs, n claims, oldest n days) / Claims settled (YTD, via credit notes) | `Inventory.PrincipalClaims` (`amount`, `status` PENDING/SUBMITTED vs SETTLED, `claimDate`, `settledAmount`, `debitNoteId`) | |
| **(Full)** Drawer · Quarterly target % (Rs achieved of Rs target purchased) | `Inventory.PrincipalTargets` (`targetAmount`, `achievedAmount`, `periodType` QUARTER) | |
| **(Full)** Drawer · Active trade schemes | `Sales.SalesSchemes`, `Sales.SalesSchemeItems` for the principal's items | |
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
| Type (Warehouse / Shop / **(Full)** Van) | `Inventory.Warehouses.type`; **(Full)** `vehicleId` → `Distribution.Vans` for VAN | |
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
| Current Stock / Reserved / Available | `qtyOnHand`, `qtyReserved`, `qtyAvailable` | reserved from `Inventory.StockReservations` |
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
| Requested By | **(Full)** `requestedByEmployeeId` → `HumanResources.Employees` (`requestedByName` kept as free text) | |
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
| Incoming transfers: status, route, progress, lines, qty, value, Dispatched, ETA, driver · vehicle | `status`, `dispatchedAt`, `etaAt`, `carrier`; **(Full)** `driverEmployeeId` → `HumanResources.Employees`, `vehicleId` → `Distribution.Vans` (text `driverName` / `vehicleNo` kept) | progress bar **[simulated]** |
| Receive sheet: Product, Batch, Sent, Received, Difference (Short / Excess / Matched); totals Sent / Received / Shortage / Excess; Receiving note | **(Full)** `Inventory.StockTransferReceiptLines` (`sentQty`, `receivedQty`, `varianceQty`, `varianceKind`, `note`); header `receivedAt`, `receivedByUserId`, `receiptNote` | "Receive all as sent" fills received = sent |

**Statuses.** DRAFT → POSTED ("Pending") → DISPATCHED → IN_TRANSIT → RECEIVED · CANCELLED.
**Actions → effects.** *Save Draft* → DRAFT · *Save & Post* → POSTED (+ DISPATCHED when sent now): `Inventory.StockMovements` TRANSFER_OUT at source (`counterWarehouseId` = destination) · *Receive / Confirm Receipt* → RECEIVED: `Inventory.StockTransferReceiptLines` per line, TRANSFER_IN of the **received** qty at destination; shortage written off from transit, excess taken in as a gain (POSTING_RULES §Transfer receipt variance) · GL only if the two warehouses use different inventory accounts or a variance exists.
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
| KPIs: Net Write-down (Q1), Pending Approval, Last Full Count | Σ `netValue`; count PENDING_APPROVAL; last APPROVED `Inventory.StockCounts` | |
| Q1 by reason | Σ `netValue` group by `reasonId` | |
| "Above Rs 25,000 needs Finance Manager approval" | `approvalRequired` | limit from `Company.CompanySettingValues` |

**Statuses.** DRAFT → PENDING_APPROVAL → POSTED · REJECTED · CANCELLED (DRAFT → POSTED directly when no approval is required).
**Actions → effects.** *Save draft* → DRAFT · *Submit for approval* → PENDING_APPROVAL (`Company.Approvals`) or POSTED below the limit · *Approve* → POSTED: `Inventory.StockMovements` ADJUSTMENT rows (WRITE_OFF for write-off reasons), JV Dr/Cr offset vs inventory (POSTING_RULES §Stock adjustment) · *Start stock count* → Stock Count.
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
**Actions → effects.** *Move to clearance / Restore disposition* → update `Inventory.ProductBatches.disposition` (audited) · *Return to principal* → disposition RETURN_TO_PRINCIPAL + **(Full)** draft `Inventory.PrincipalClaims` (type EXPIRY, batch) and `Purchases.PurchaseReturns` · *Write off…* → `Inventory.StockAdjustments` (reason Expired write-off) POSTED → `Inventory.StockMovements` WRITE_OFF + JV Dr 5095 / Cr inventory; `disposition = WRITTEN_OFF` · *Transfer to another location* → Stock Transfers · *Export register* → CSV.
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

---

### Kits & Bundles — `app/inventory/kits`
*Source:* `src/4B-products.html` (section `pr-kit`) · `src/9F-products.js` (§5 KITS & BUNDLES: `P.kits`, `renderBuilder`, `assembleSheet`)
**Purpose.** Define gift hampers / starter packs as bills of materials, cost them live, price them and assemble or break them down from stock.
**Tables.** Primary: `Inventory.KitsAndBundles`, `Inventory.KitComponents`, `Inventory.AssemblyVouchers`, `Inventory.AssemblyVoucherLines` · Reads: `Inventory.Products` (cost, price, `avgCost`), `Inventory.getWholeStock`, `Inventory.ProductBatches` · Writes: `Inventory.KitsAndBundles(+Component)`, `Inventory.Products` (the kit SKU), `Inventory.AssemblyVouchers(+Line)`, `Inventory.StockMovements`
**Functions.** Save → `Inventory.kitAddUpdate` · Open → `Inventory.getKitInfo` ‖ Save → `Inventory.assemblyVoucherAddUpdate` · Open → `Inventory.getAssemblyVoucherInfo` · Actions → `Inventory.assemblyVoucherPost`, `Inventory.assemblyVoucherCancel`
**Lookups.** `KitsAndBundles.tone` → `KitTone` · `KitsAndBundles.status` → `ActiveInactiveStatus` · `AssemblyVouchers.direction` → `AssemblyVoucherDirection` · `AssemblyVouchers.status` → `DraftPostedCancelledStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Kit card: name, code, n components, margin chip, component thumbs ×qty | `Inventory.KitsAndBundles.name`, `code`, `icon`, `tone`; `Inventory.KitComponents` | KIT-001 |
| Cost / Price / In stock / Can build | Σ component `avgCost × qtyPerKit`; `Inventory.KitsAndBundles.sellingPrice`; on hand of `kitItemId`; min(floor(component on hand ÷ qtyPerKit)) | |
| Builder: kit name | `Inventory.KitsAndBundles.name` (and the kit item name) | |
| Component, Qty per kit, Unit cost, Line cost, On hand (n kits) | `Inventory.KitComponents.itemId`, `qtyPerKit`; `Inventory.Products.avgCost`; `Inventory.getWholeStock` | |
| Add a component… | insert `Inventory.KitComponents` | a kit cannot contain itself (trigger) |
| Total component cost, Bought separately (retail) | Σ cost / Σ `Inventory.Products.price × qty` | |
| Target margin slider (5–50 %) | `Inventory.KitsAndBundles.targetMarginPct` | |
| Suggested price (Use) | ceil(cost ÷ (1 − margin) / 10) × 10 | computed |
| Kit selling price | `Inventory.KitsAndBundles.sellingPrice` (also the kit item's `price`) | |
| Margin, Customer saves | computed | |
| Assemble / Disassemble sheet: Kits to assemble, Component, Per kit, Issue / Return, Before, After, "short n" | `Inventory.AssemblyVouchers` (`direction`, `kitQty`, `warehouseId`) + `Inventory.AssemblyVoucherLines` (`qtyPerKit`, `qty`, `unitCost`) | blocked when a component would go negative |

**Statuses.** Kit ACTIVE / INACTIVE · Assembly voucher DRAFT → POSTED · CANCELLED.
**Actions → effects.** *New kit* → `Inventory.KitsAndBundles` + kit `Inventory.Products` (KIT-NNN) · *Save kit* → update kit/components/price · *Assemble* → `Inventory.AssemblyVouchers` POSTED (ASM-…): ASSEMBLY OUT per component at `avgCost`, ASSEMBLY IN of the kit item at Σ component cost (recomputes kit `avgCost`) · *Disassemble* → reverse (POSTING_RULES §Assembly).
**Permission.** `kit:view`, `kit:edit`, `kit:assemble` · **Approval.** —

---

### Barcode Labels — `app/inventory/labels`
*Source:* `src/4B-products.html` (section `pr-lb`) · `src/9F-products.js` (§6 BARCODE LABELS: `LB`, `TPL`, `labelHTML`)
**Purpose.** Pick products and copies, choose a label template and options, preview and print shelf or carton labels.
**Tables.** Primary: `Inventory.BarcodeLabelJobs`, `Inventory.BarcodeLabelJobLines` · Reads: `Inventory.BarcodeLabelTemplates`, `Inventory.Products`, `Inventory.ProductBarcodes`, `Inventory.ProductCompanies`, `Inventory.ProductBatches` (FEFO first batch) · Writes: `Inventory.BarcodeLabelJobs(+Line)`

| UI field / column | Table.column | Notes |
|---|---|---|
| Products: search (code, name, UPC), tick, copies stepper | `Inventory.BarcodeLabelJobLines.itemId`, `copies` (1–500) | preselected from catalogue / product detail (`source`) |
| Template: Thermal 2×1" / 38×25 mm / A4 sheet of 40 | `Inventory.BarcodeLabelJobs.templateId` → `Inventory.BarcodeLabelTemplates` (`code`, `media`, `widthMm`, `heightMm`, `labelsPerSheet`, `sheetColumns`, `sheetRows`) | seeded THERMAL_2X1, THERMAL_38X25, A4_40 |
| Options: Show price, Urdu name, Batch / expiry, Company, Carton barcode | `showPrice`, `showUrduName`, `showBatchExpiry`, `showCompany`, `useCartonBarcode` | |
| Label content: company (+ CTN n), name, Urdu name, barcode digits, batch · exp / SKU, price (unit or carton) | `Inventory.ProductCompanies.name`, `Inventory.Products.name`, `nameUrdu`, `Inventory.ProductBarcodes.barcode`, `Inventory.ProductBatches.batchNo` / `expiryDate`, `Inventory.Products.price` (× ctn) | stored per line: `barcode`, `batchId`, `printedPrice` |
| Count "n labels · n products", pages / roll length | `totalLabels`, `productCount`, `pageCount` | |

**Statuses.** QUEUED → PRINTED · FAILED · CANCELLED.
**Actions → effects.** *Print labels* → `Inventory.BarcodeLabelJobs` PRINTED (`printedAt`, `printedByUserId`) and the browser print dialog · *Clear* → no write.
**Permission.** `label:print` · **Approval.** —

---

### Stock In View — `app/inventory/stock-view`
*Source:* `src/4C-stock-ops.html` (`data-so="view"`) · `src/9G-stock-ops.js` (§5 STOCK IN VIEW: `VIEW_ROWS`, `groups`, `renderIns`)
**Purpose.** Opening, inward, outward and closing stock for a period, grouped by company, with insights per company.
**Tables.** Primary: view `Inventory.getStockInView` · Reads: `Inventory.StockMovements`, `Inventory.Products`, `Inventory.ProductCompanies`, `Inventory.Warehouses`, `Inventory.ProductBatches`, `Purchases.Vendors` · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Tabs: Stock In (Op-Stock, In Qty, Out Qty, Cl-Stock) / Stock In Out (+ In Value, Out Value, Net) | `Inventory.getStockInView` (`openingQty`, `inQty`, `outQty`, `closingQty`, `inValue`, `outValue`) | net = in − out |
| Filters: Date From, Date To, Upto Date, Company, Supplier, Warehouse, Product Name, Product Code / Ref. #, Batch #, Pack, Show All Companies | view parameters / columns (`manufacturerId`, `warehouseId`, `itemId`, `batchNo`, `ctn`) | supplier via `Inventory.Products.distributorVendorId` / `Inventory.ProductSuppliers` |
| Group row: company (n products) + totals | group by `manufacturerId` | |
| Product rows: name, code, Pack (1×ctn) | `Inventory.Products.name`, `sku`, `ctn` | |
| KPIs: Total Products, Opening Stock, In Qty, Out Qty, Closing Stock (vs previous period) | aggregates | trend % **[simulated]** |
| Insights: Company Totals, Net Increase / Decrease %, Top Inward / Top Outward | per-company aggregates of the view | |

**Statuses.** —
**Actions → effects.** *Apply / Clear filters, Refresh* → re-query · *Export Excel / PDF, Print* → file.
**Permission.** `stock:view`, `stock:value` · **Approval.** —

---

### Stock Count — `app/inventory/count`
*Source:* `src/4C-stock-ops.html` (`data-so="count"`) · `src/9G-stock-ops.js` (§3 STOCK COUNT: sessions, wizard `stepScope` … `stepApprove`)
**Purpose.** Count stock in five steps: choose scope, freeze a snapshot, count with a scanner, explain variances and approve the adjustment journal.
**Tables.** Primary: `Inventory.StockCounts`, `Inventory.StockCountLines` · Reads: `Inventory.Warehouses`, `Inventory.ProductClasses`, `Inventory.Products` (`abcClass`, `avgCost`), `Inventory.ProductBarcodes`, `Inventory.StockBalances`, `Inventory.getAbcAnalysis` · Writes: `Inventory.StockCounts(+Line)`, `Inventory.StockMovements`, `Accounting.Vouchers`
**Functions.** Save → `Inventory.stockCountAddUpdate` · Open → `Inventory.getStockCountInfo` · Actions → `Inventory.stockCountApprove`, `Inventory.stockCountCancel`
**Lookups.** `StockCounts.status` → `StockCountStatus` · `StockCountLines.reason` → `StockCountLineReason` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs: Open sessions, Lines counted (month), Count accuracy, Net variance (quarter) | aggregates of `Inventory.StockCounts` / lines | |
| Sessions: Session (name, no, date, blind), Location, Scope, Progress (counted / lines), Status, Net variance, Owner | `name`, `docNo`, `docDate`, `isBlind`, `warehouseId`, `scopeLabel`, `countedCount` / `lineCount`, `status`, `netVarianceValue`, `ownerUserId` | SC-2026-018 |
| Step 1 Scope: location, product classes (none = all), ABC · A-items only, Blind count; In scope n products, expected units, value at cost | `warehouseId`, `scopeClassIds`, `abcAOnly`, `isBlind` | |
| Step 2 Freeze: "Snapshot frozen at …" | `frozenAt`; lines created with `expectedQty` = on hand, `unitCost` = `avgCost` | status → COUNTING |
| Step 3 Count: scan box (× multiplier), #, Product, Shelf, Barcode, Expected (••• when blind), Counted stepper, Status (Match / Short / Over / Not counted) | `Inventory.StockCountLines.countedQty`, `countedAt`, `countedByUserId`; `Inventory.Products.defaultShelf`, `Inventory.ProductBarcodes` | carton code adds ctn units |
| Step 4 Variance: Expected, Counted, Variance, Variance value, %, Reason; chips All / Variances / Short / Excess; apply reason to all; Shortage / Excess / Net / Line accuracy | `varianceQty`, `varianceValue`, `reason` (MISCOUNT, DAMAGED, THEFT, UNRECORDED_RECEIPT, UNRECORDED_ISSUE, EXPIRED_WRITE_OFF, UOM_ERROR), `wasUncounted` | uncounted lines set to 0; header `shortageValue`, `excessValue` |
| Step 5 Approve: journal preview (5160 / 1201 / 4920), approver, Comment | `approverUserId`, `approvedAt`, `approvalComment`, `journalEntryId` | |

**Statuses.** DRAFT → COUNTING → VARIANCE_REVIEW → APPROVED · CANCELLED.
**Actions → effects.** *New count / Start* → DRAFT · *Freeze snapshot* → COUNTING · *Continue* to Variance → VARIANCE_REVIEW (every variance needs a reason) · *Approve & post adjustment* → APPROVED: `Inventory.StockMovements` COUNT rows (in for excess, out for shortage), JV shortage Dr 5160 / Cr 1201, excess Dr 1201 / Cr 4920 (POSTING_RULES §Stock count variance) · *Export* → file.
**Permission.** `count:view`, `count:create`, `count:count`, `count:approve` · **Approval.** Approver role (Finance Manager) on step 5.

---

### Stock Vouchers — `app/inventory/stock-vouchers`
*Source:* `src/44-purchase-docs.html` (section `pd-sv`) · `src/94-purchase-docs.js` (§4 STOCK VOUCHERS: `SVT`, `svFields`, `svSave`)
**Purpose.** Issue stock as breakage, gifts, samples or internal use; stock and the GL update on posting.
**Tables.** Primary: `Inventory.StockVouchers`, `Inventory.StockVoucherLines` · Reads: `Inventory.Warehouses`, `Inventory.Products`, `Inventory.ProductBatches`, `Inventory.UnitsOfMeasure`, `Inventory.ProductUnits`, `Inventory.StockBalances`, `HumanResources.Employees`, `HumanResources.Departments`, `Sales.Customers`, `Accounting.ChartOfAccounts`, `Accounting.CostCentres` · Writes: `Inventory.StockVouchers(+Line)`, `Inventory.StockMovements`, `Accounting.Vouchers`, `Company.Attachments`
**Functions.** Save → `Inventory.stockVoucherAddUpdate` · Open → `Inventory.getStockVoucherInfo` · Actions → `Inventory.stockVoucherPost`, `Inventory.stockVoucherCancel`
**Lookups.** `StockVouchers.voucherType` → `StockVoucherType` · `StockVouchers.breakageReason` → `BreakageReason` · `StockVouchers.occasion` → `Occasion` · `StockVouchers.status` → `DraftPostedCancelledStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Tabs Breakage / Gift / Sample / Internal Use | `voucherType` BRK / GFT / SMP / INT | |
| Voucher No (gear) | `docNo` | BRK-2026-0005 … per type sequence |
| Date *, Warehouse * | `docDate`, `warehouseId` | |
| BRK: Reason / Type * (Damaged in handling, Expired, Leakage / spillage, Water damage, Pest damage), Employee / Person, Reference No | `breakageReason`, `employeeId`, `referenceNo` | |
| GFT: Guest / Recipient *, Occasion (Promotional, Eid hamper, Corporate gift, Event giveaway), Reference No | `recipientName`, `occasion`, `referenceNo` | |
| SMP: Customer / Prospect *, Salesperson, Returnable ("Expect samples back in 14 days") | `customerId`, `salesmanEmployeeId`, `isReturnable`, `returnDueDate` | |
| INT: Department *, Cost centre, Requested by | `departmentId`, `costCentreId`, `requestedByEmployeeId` | |
| Remarks | `remarks` | |
| Type card: Account Code (5110-03 / 5220-07 / 5220-08 / 5220-03) | `expenseAccountId` | default per type from `Company.DefaultAccountMappings` |
| Items: Product *, Batch / Lot, Expiry, UOM, Qty *, Rate, Amount, Stock after, Remark | `Inventory.StockVoucherLines` (`itemId`, `batchId` / `lotNo`, `expiryMonth`, `uomId`, `uomFactor`, `qty`, `baseQty`, `rate`, `amount`, `remark`); stock after = available − baseQty | |
| Totals: Total Quantity, Total Amount, Stock After Voucher (n SKU short) | `totalQty`, `totalAmount` | |
| Attachments | `Company.Attachments` (entity `StockVouchers`) | |
| Previous Vouchers: Date, Voucher No, Type, Reference, Person / Party, Items, Amount, Status, Remarks, Created By | header columns; person = employee / recipient / customer / department | filters type, status, search |

**Statuses.** DRAFT → POSTED · CANCELLED.
**Actions → effects.** *Save as Draft* → DRAFT · *Save & Post* → POSTED: `Inventory.StockMovements` BREAKAGE / GIFT / SAMPLE / INTERNAL_USE OUT at `avgCost`; JV Dr type expense (cost centre on INT) / Cr inventory (POSTING_RULES §Stock voucher) · *Scan Barcode* → adds a line.
**Permission.** `svch:view`, `svch:create`, `svch:post` · **Approval.** —

---

### Demand & Reorder — `app/inventory/demand`
*Source:* `src/4C-stock-ops.html` (`data-so="demand"`) · `src/9G-stock-ops.js` (§7 DEMAND & REORDER: `REORDER`, `ACT`, `createPOs`)
**Purpose.** Key a demand of goods to a principal (F-key grid) and act on reorder suggestions by creating purchase orders.
**Tables.** Primary: `Inventory.GoodsDemands`, `Inventory.GoodsDemandLines` · Reads: `Inventory.getReorderSuggestions`, `Inventory.ReorderRules`, `Inventory.Products`, `Inventory.ProductCompanies`, `Inventory.ProductSuppliers`, `Inventory.getWholeStock` · Writes: `Inventory.GoodsDemands(+Line)`, `Purchases.PurchaseOrders(+Line)`
**Functions.** Save → `Inventory.goodsDemandAddUpdate` · Open → `Inventory.getGoodsDemandInfo` · Actions → `Inventory.goodsDemandCancel`, `Inventory.goodsDemandOrder`
**Lookups.** `GoodsDemands.source` → `GoodsDemandSource` · `GoodsDemands.status` → `GoodsDemandStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Supplier Name * | `Inventory.GoodsDemands.manufacturerId` (the principal) | `vendorId` set when the PO is raised |
| DNO *, Date * | `docNo` (DMD-2026-00012; DNO = sequence), `docDate` | |
| Available Stock (n units · n CTN · below reorder) | `Inventory.getWholeStock` for the focused line | |
| Prepared By | `preparedByUserId` | |
| Grid: #, Product Name *, Company, CTN, Rate, Qty, Bonus, % Disc., Discount, Amount | `Inventory.GoodsDemandLines` (`itemId`, `manufacturerId`, `qtyCtn`, `rate`, `baseQty`, `bonusQty`, `discountPct`, `discountAmount`, `netAmount`) | CTN ↔ Qty kept in step via `ctnSize` |
| Totals: Total Items, Total Quantity, Total Bonus, Grand Amount | `totalItems`, `totalQty`, `totalBonus`, `netAmount` (`grossAmount` − `discountAmount`) | |
| Notes (0/500) | `notes` | |
| F1 New · F2 Clear · F3 Save · F4 Detail Print · F5 Print · F6 Therm Print · Esc Exit | — | prints are read-only |
| Reorder Suggestions: grouped by preferred supplier, On hand, Low, Avg / day, Cover (days), Suggest CTN, Value | `Inventory.getReorderSuggestions` (`qtyOnHand`, `lowLevel`, `avgDailySales`, `coverDays`, `suggestedCtn`, `suggestedValue`, `supplier`) | need = max(high − stock, ceil(ads × (lead + 14) − stock)); flagged if stock ≤ low or cover < 21 d; avg / day **[simulated]** |
| Raised PO badge | `Inventory.GoodsDemands.purchaseOrderId` / PO lines | |

**Statuses.** DRAFT → SAVED → ORDERED · CANCELLED.
**Actions → effects.** *F3 Save* → SAVED ("DMD-2026-00012 saved") · *Raise PO / Create POs* → one `Purchases.PurchaseOrders` per supplier from selected lines; demand ORDERED with `purchaseOrderId`, `orderedAt` · *Send to demand / Import Lines* → `Inventory.GoodsDemandLines` from suggestions (`source = REORDER`).
**Permission.** `dmd:view`, `dmd:create`, `po:create` · **Approval.** PO approval per purchase module.

---

### Inventory Reports — `app/inventory/reports`
*Source:* `src/45-studios.html` (`data-studio="inventory"`) · `src/96-studio.js` (`inventory` studio: tabs current, ason, over, list, minus, check, value, move, slow, abc, nearexp)
**Purpose.** Report Studio for inventory: current stock, stock as on date, over / minus stock, stock list, count checking, valuation, movement, dead / slow, ABC and near-expiry.
**Tables.** Primary: views `Inventory.getWholeStock`, `Inventory.getStockValuation`, `Inventory.getStockInView`, `Inventory.getDeadAndSlowStock`, `Inventory.getAbcAnalysis`, `Inventory.getNearExpiryStock` · Reads: `Inventory.StockCountLines` (Checking), `Purchases.PurchaseOrderLines` (pending GRN on Minus Stock), `Reports.SavedReports` (presets) · Writes: `Reports.SavedReports`, `Reports.ReportRuns` (Report Studio)

| UI field / column | Table.column | Notes |
|---|---|---|
| Filters: Date (As On / Range), Company, Warehouse, Report Scope, Overstock rule, Stock Basis (Cost / Sale), Group By (Class / Warehouse / Company), search, sort; options value columns, zero stock, group, description | view parameters | presets saved in `Reports` |
| Current Stock: SKU, name, class, company, qty, value | `Inventory.getStockValuation` | |
| Stock As On Date: Opening, In, Out, Closing, Value | `Inventory.getStockInView` | |
| Over Stock: On Hand, Max Level, Excess Qty, Excess Value, Cover | `Inventory.getWholeStock` where qty > `highLevel` | |
| Stock List: Class, Company, UoM, Reorder Lvl, Sale Rate, Cost | `Inventory.Products` | |
| Minus Stock: Book Qty, Pending GRN, Shortfall Value, Last Issue | `Inventory.StockBalances` where qty < 0; `Purchases.PurchaseOrderLines` | |
| Checking: Book, Counted, Variance, Variance Value, Status | `Inventory.StockCountLines` | |
| Value: Qty, Avg Cost, Value, % of Total | `Inventory.getStockValuation` | weighted average |
| Movement: Opening, Receipts, Issues, Closing, Turnover, Last Movement | `Inventory.getStockInView`, `Inventory.StockBalances.lastMovementAt` | |
| Dead / Slow: Since Last Sale, On Hand, Unit Cost, Value Locked, Status (Watch 60+ / Slow 90+ / Dead 180+) | `Inventory.getDeadAndSlowStock` | |
| ABC: Annual Units, Unit Cost, Annual Usage Value, % of Total, Cumulative %, Class | `Inventory.getAbcAnalysis` | A ≤ 80 %, B ≤ 95 %, C rest |
| Near Expiry: Batch, Warehouse, Expiry, Days Left, Qty, Value at Cost, Action, band (≤ 90 / 91–180 / 181–365) | `Inventory.getNearExpiryStock` | |

**Statuses.** —
**Actions → effects.** *Generate / Export / Schedule / Save preset* → `Reports.ReportRuns`, `Reports.ReportSchedules`, `Reports.SavedReports`.
**Permission.** `invrpt:view`, `stock:value` · **Approval.** —
