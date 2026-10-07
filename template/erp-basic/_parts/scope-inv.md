## Inventory

**Screens (11).** Product Catalogue, Product Detail, Companies & Brands, Product Classes, Warehouses, Whole Stock, Stock In / Out, Stock Transfers, Stock Adjustments, Batches & Expiry, Stock Movements. Schema `Inventory` (19 tables).

**Features.**
- **Catalogue.** Items (`PK-1001`) with UPC (8 / 12 / 13 digits), Urdu name, image, carton size + loose unit (multi-UoM), shelf hint, purchase / average / retail / wholesale prices, GST %, financial discount %, low / high levels, HS code, and attributes Short (no discount at sale), Required Expiry, Controlled, Precious. Piece and carton barcodes (unique per tenant). Drafts, activation, soft delete, duplicate, import and inline price edit.
- **Principals.** Companies & Brands (`CO-07`) with colour, contacts and notes.
- **Classification.** Main classes `MC-NNN` and sub types `ST-NNN` with icon, visibility and drag-and-drop order.
- **Locations.** Warehouses and shops (`WH-LHR`, `SH-DHA`), each with branch, manager, capacity, its own inventory GL account and a "block negative stock" switch; bins `A-01-01` (rack-row-bin).
- **Batches & expiry.** Batch / expiry / mfg date / cost; FEFO register with expiry windows, timeline and calendar; dispositions Saleable, Priority, Quarantine, Clearance, Return to principal, Written off.
- **Stock ledger.** Append-only `Inventory.StockMovements` (17 movement types) with trigger-maintained balances per item × warehouse × bin × batch (on hand, reserved, available, value, last movement) and moving weighted-average cost.
- **Stock operations.** Manual stock in / out (`MI` / `MO`) by reason; transfers (`TRF-YYYY-NNNNNN`) with dispatch and receipt; adjustments (`ADJ`) with approval above Rs 25,000 (also used for batch write-offs and the Product Detail "Adjust stock").
- **Reporting.** Whole Stock (current / as on date), Stock Movements, stock card on Product Detail; views for stock on hand, valuation, stock card and near expiry.

**Key business rules.**
1. Stock is derived only from the ledger; the ledger is append-only (UPDATE / DELETE / TRUNCATE rejected). Corrections are new documents.
2. Every ledger row has exactly one of `qtyIn` / `qtyOut` > 0, in base units; `baseQty = qtyCtn × ctn + qtyLoose`.
3. A warehouse with `blockNegativeStock` rejects any movement that would take a slot (item × bin × batch) below zero; others allow minus stock.
4. Expiry-tracked items need a batch (with expiry) on every movement; unsaleable batches cannot be sold.
5. Retail price ≥ purchase price, low level ≤ high level; an ACTIVE item must have a company, class and prices.
6. Adjustments above the approval limit (Rs 25,000, `Company.CompanySettingValues`) need Finance Manager approval before posting.
7. Transfers cannot have the same source and destination; stock leaves the source at posting and arrives at receipt.
8. Item codes, UPCs, barcodes, company codes / names, class and sub-type names, batch numbers (per item) and document numbers are unique per tenant.
9. Document numbers come from `Company.getNextDocNo` (MI, MO, TRF, ADJ; masters ITEM, MFR, WH).

**Statuses.**
- Item: DRAFT → ACTIVE ↔ INACTIVE.
- Manual stock entry: DRAFT → POSTED · CANCELLED.
- Transfer: DRAFT → POSTED → DISPATCHED → IN_TRANSIT → RECEIVED · CANCELLED.
- Adjustment: DRAFT → PENDING_APPROVAL → POSTED · REJECTED · CANCELLED.
- Batch disposition: SALEABLE · PRIORITY · QUARANTINE · CLEARANCE · RETURN_TO_PRINCIPAL · WRITTEN_OFF.

**Integrations.** Purchases (GRN in, returns), Sales (SALE out, returns), Accounting (JV per stock document).

**Not in Basic (Full only).** Kits & assembly, barcode labels, bulk price update and price history, principal claims / targets, item suppliers, reservations, per-line transfer receipt variance, stock counts, stock vouchers, reorder rules, demand of goods, Stock In View, Inventory Report Studio, van locations.
