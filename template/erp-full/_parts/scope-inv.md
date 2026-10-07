## Inventory

**Screens (18).** Product Catalogue, Product Detail, Companies & Brands, Product Classes, Kits & Bundles, Barcode Labels, Warehouses, Whole Stock, Stock In / Out, Stock Transfers, Stock Adjustments, Stock Count, Stock Vouchers, Batches & Expiry, Stock In View, Stock Movements, Demand & Reorder, Inventory Reports. Schema `Inventory` (41 tables).

**Features.**
- **Catalogue.** Items (`PK-1001`) with UPC (8 / 12 / 13 digits), Urdu name, image, carton size + loose unit (multi-UoM), shelf hint, purchase / average / retail / wholesale prices, GST %, financial discount %, low / high levels, HS code, and attributes Short (no discount at sale), Required Expiry, Controlled, Precious. Piece and carton barcodes (unique per tenant). Drafts, activation, soft delete, duplicate, import, inline price edit, **bulk price update** (by company / class / selection, % with Rs 1 / 5 / 10 rounding, undo) with full price history.
- **Principals.** Companies & Brands (`CO-07`) with colour, contacts and notes; principal claims (scheme / damage / expiry, settled via vendor credit) and period purchase targets.
- **Classification.** Main classes `MC-NNN` and sub types `ST-NNN` with icon, visibility and drag-and-drop order.
- **Kits & bundles.** Bill of materials (`KIT-NNN`), live cost roll-up, target margin and suggested price, assemble / disassemble vouchers (`ASM`); assembled kits are stocked as their own item.
- **Labels.** Thermal 2×1", 38×25 mm and A4 40-up templates; price, Urdu name, batch / expiry, company and carton-barcode options; print jobs are logged.
- **Locations.** Warehouses, shops and vans (`WH-LHR`, `SH-DHA`), each with branch, manager, capacity, its own inventory GL account and a "block negative stock" switch; bins `A-01-01` (rack-row-bin).
- **Batches & expiry.** Batch / expiry / mfg date / cost; FEFO register with expiry windows, timeline and calendar; dispositions Saleable, Priority, Quarantine, Clearance, Return to principal, Written off.
- **Stock ledger.** Append-only `Inventory.StockMovements` (17 movement types) with trigger-maintained balances per item × warehouse × bin × batch (on hand, reserved, available, value, last movement); moving weighted-average cost; reservations for sales orders.
- **Stock operations.** Manual stock in / out (`MI` / `MO`) by reason; transfers (`TRF-YYYY-NNNNNN`) with dispatch, in-transit tracking, driver / vehicle and per-line receipt variance; adjustments (`ADJ`) with approval above Rs 25,000; physical counts (`SC`) with scope (classes, ABC-A only), blind counting, frozen snapshot, scanner entry, variance reasons and journal; stock vouchers for breakage, gifts, samples and internal use (`BRK / GFT / SMP / INT`).
- **Planning.** Reorder rules, reorder suggestions grouped by preferred supplier, demand of goods (`DMD`) to a principal → purchase orders.
- **Reporting.** Whole Stock (current / as on date), Stock In View (opening / in / out / closing by company), Stock Movements, Report Studio inventory reports (current, as-on, over, minus, list, checking, value, movement, dead / slow, ABC, near expiry).

**Key business rules.**
1. Stock is derived only from the ledger; the ledger is append-only (UPDATE / DELETE / TRUNCATE rejected). Corrections are new documents.
2. Every ledger row has exactly one of `qtyIn` / `qtyOut` > 0, in base units; `baseQty = qtyCtn × ctn + qtyLoose`.
3. A warehouse with `blockNegativeStock` rejects any movement that would take a slot (item × bin × batch) below zero; others allow minus stock (reported).
4. Expiry-tracked items need a batch (with expiry) on every movement; unsaleable batches cannot be sold.
5. Retail price ≥ purchase price, low level ≤ high level; an ACTIVE item must have a company, class and prices.
6. Adjustments above the approval limit (Rs 25,000, `Company.CompanySettingValues`) need Finance Manager approval before posting; count variances need a reason per line and an approver.
7. Transfers cannot have the same source and destination; stock leaves the source at posting and arrives at receipt.
8. Item codes, UPCs, barcodes, company codes / names, class and sub-type names, batch numbers (per item) and document numbers are unique per tenant.
9. Document numbers come from `Company.getNextDocNo` (MI, MO, TRF, ADJ, SC, BRK, GFT, SMP, INT, ASM, DMD, PCB; masters ITEM, MFR, KIT, WH).

**Statuses.**
- Item: DRAFT → ACTIVE ↔ INACTIVE.
- Manual stock entry: DRAFT → POSTED · CANCELLED.
- Transfer: DRAFT → POSTED → DISPATCHED → IN_TRANSIT → RECEIVED · CANCELLED.
- Adjustment: DRAFT → PENDING_APPROVAL → POSTED · REJECTED · CANCELLED.
- Stock count: DRAFT → COUNTING → VARIANCE_REVIEW → APPROVED · CANCELLED.
- Stock voucher / assembly voucher: DRAFT → POSTED · CANCELLED.
- Demand: DRAFT → SAVED → ORDERED · CANCELLED.
- Batch disposition: SALEABLE · PRIORITY · QUARANTINE · CLEARANCE · RETURN_TO_PRINCIPAL · WRITTEN_OFF.
- Bulk price batch: DRAFT → APPLIED → UNDONE. Label job: QUEUED → PRINTED · FAILED.

**Integrations.** Purchases (GRN in, returns, demand → PO, item suppliers, claims via debit notes), Sales (SALE out, returns, reservations, schemes), Distribution (vans as warehouses, vehicles / drivers on transfers), Accounting (JV per stock document), HR (requested by / driver / department), Report Studio.

**Upgrade from Basic.** Add columns `Inventory.Products` (weightKg, abcClass, avgDailySales, lastSaleDate, leadDays), `Inventory.Warehouses.vehicleId` (+ type VAN), `Inventory.StockInOut.requestedByEmployeeId`, `Inventory.StockTransfers` (driverEmployeeId, vehicleId); create the 22 Full tables and the last-sale / reservation / kit triggers; seed label templates.
