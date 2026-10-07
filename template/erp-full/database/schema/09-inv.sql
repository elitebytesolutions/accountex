-- =============================================================================
-- Finsoft ERP (FULL) — 09-inv.sql
-- Inventory: catalogue (items, manufacturers, classes, units, barcodes),
-- locations (warehouses, bins), batches, the append-only stock ledger with its
-- trigger-maintained balances, and the stock documents (manual in/out,
-- transfers, adjustments).
--
-- FULL = the Basic file verbatim, plus (contract §1):
--   * appended columns: item (weightKg, abcClass, avgDailySales,
--     lastSaleDate, leadDays), warehouse (vehicleId), StockInOut
--     (requestedByEmployeeId), StockTransfers (driverEmployeeId, vehicleId)
--   * added enum value: warehouse.type 'VAN'
--   * Full-only tables after the "FULL EDITION" banner: principals, suppliers,
--     price history / bulk price, kits & assembly, labels, reservations,
--     transfer receipts, stock counts, stock vouchers, reorder rules, demand.
--
-- Screens (Full only):
--   app/inventory/kits             Kits & Bundles           src/4B-products.html · src/9F-products.js
--   app/inventory/labels           Barcode Labels           src/4B-products.html · src/9F-products.js
--   app/inventory/stock-view       Stock In View            src/4C-stock-ops.html · src/9G-stock-ops.js
--   app/inventory/count            Stock Count              src/4C-stock-ops.html · src/9G-stock-ops.js
--   app/inventory/stock-vouchers   Stock Vouchers           src/44-purchase-docs.html · src/94-purchase-docs.js
--   app/inventory/demand           Demand & Reorder         src/4C-stock-ops.html · src/9G-stock-ops.js
--   app/inventory/reports          Inventory Reports        src/45-studios.html · src/96-studio.js
--
-- Screens (Basic):
--   app/inventory/items            Product Catalogue        src/4B-products.html · src/9F-products.js
--   app/inventory/products/view    Product Detail           src/4B-products.html · src/9F-products.js
--   app/inventory/companies        Companies & Brands       src/4B-products.html · src/9F-products.js
--   app/inventory/classes          Product Classes          src/4B-products.html · src/9F-products.js
--   app/inventory/warehouses       Warehouses               src/41-acc-trade.html
--   app/inventory/stock            Whole Stock              src/48-dash-stock.html · src/92-dash.js
--   app/inventory/stock-in-out     Stock In / Out           src/4C-stock-ops.html · src/9G-stock-ops.js
--   app/inventory/transfer         Stock Transfers          src/4C-stock-ops.html · src/9G-stock-ops.js
--   app/inventory/adjustments      Stock Adjustments        src/41-acc-trade.html
--   app/inventory/batches          Batches & Expiry         src/4C-stock-ops.html · src/9G-stock-ops.js
--   app/inventory/movements        Stock Movements          src/4C-stock-ops.html · src/9G-stock-ops.js
--
-- Stock integrity (Bhatti CL_DPOST / AVCOST, made safe):
--   * Inventory.StockMovements is APPEND-ONLY. Every stock effect of every document
--     (GRN, sale, return, transfer, adjustment, …) is one or more ledger rows.
--   * Inventory.StockBalances (item × warehouse × bin × batch) is maintained by the
--     AFTER INSERT trigger on the ledger, which also
--       - rejects negative stock when warehouse.blockNegativeStock, and
--       - recomputes item.avgCost (moving weighted average) on costed receipts.
--   * Quantities are base (loose) units, numeric(18,3). Cartons are
--     qtyCtn × item.ctn + qtyLoose.
--   * Batches are picked FEFO (earliest expiry first); see v_near_expiry and
--     the batch register (app/inventory/batches).
--
-- Cross-module FKs (Accounting.ChartOfAccounts, Accounting.Vouchers, Accounting.CostCentres,
-- Purchases.Vendors, Purchases.PurchaseOrders, Purchases.DebitNotes, Tax.TaxCodes,
-- Sales.Customers, Sales.SalesOrders(_line), HumanResources.Employees, HumanResources.Departments,
-- Distribution.Vans) are added in database/fk/09-inv-fks.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- uom — loose units offered by the product form "Loose *" select
-- (Pcs / Pack / Box / Roll / Btl / Ream / Coil / Kg / Ltr) plus CTN for cartons.
-- Route: app/inventory/items (New / Edit product) · src/4B-products.html
-- Seeded per tenant at provisioning.
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."UnitsOfMeasure" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code             text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{0,9}$'),   -- PCS, PACK, BOX, ROLL, BTL, REAM, COIL, KG, LTR, CTN
  name             text NOT NULL,                                          -- Pcs, Pack, Btl …
  "nameUrdu"        text,
  kind             text NOT NULL DEFAULT 'COUNT',
  decimals         smallint NOT NULL DEFAULT 0 CHECK (decimals BETWEEN 0 AND 3),  -- Kg / Ltr allow 3 dp
  "isSystem"        boolean NOT NULL DEFAULT false,
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "uomCodeUk" UNIQUE ("tenantId", code)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."UnitsOfMeasure"');
COMMENT ON TABLE "Inventory"."UnitsOfMeasure" IS 'Units of measure (loose unit of an item, carton). Product form "Loose" select. Seeded per tenant.';

-- ---------------------------------------------------------------------------
-- manufacturer — "Companies & Brands" (principals): CO-07 Habib Packaging …
-- Route: app/inventory/companies (card grid, Create New Company panel, drawer)
--        src/4B-products.html · src/9F-products.js (saveCO, coDrawer)
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."ProductCompanies" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code             text NOT NULL CHECK (code ~ '^[A-Z]{2,3}-?\d{2,3}$'),   -- CO-07, SU07 ("Use a code like CO-13")
  name             text NOT NULL CHECK (btrim(name) <> ''),                -- Habib Packaging
  "shortName"       text CHECK (char_length("shortName") <= 5),              -- HBP (logo text)
  status           text NOT NULL DEFAULT 'ACTIVE',
  address          text,                                                   -- Gulberg, Lahore
  city             text,                                                   -- Lahore / Karachi …
  country          text NOT NULL DEFAULT 'Pakistan',
  phone            text CHECK (phone IS NULL OR phone ~ '^[0-9+\-\s()]{7,16}$'),
  email            citext CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$'),
  website          text,
  "brandColour"     text NOT NULL DEFAULT '#1F5F45' CHECK ("brandColour" ~ '^#[0-9A-Fa-f]{6}$'),
  notes            text,
  "deletedAt"       timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "manufacturerCodeUk" UNIQUE ("tenantId", code)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."ProductCompanies"');
-- "A company with this name exists" (case-insensitive, live rows only)
CREATE UNIQUE INDEX "manufacturerNameUk" ON "Inventory"."ProductCompanies" ("tenantId", lower(name)) WHERE "deletedAt" IS NULL;
CREATE INDEX "manufacturerTenantStatusCityIdx" ON "Inventory"."ProductCompanies" ("tenantId", status, city);
CREATE INDEX "manufacturerNameTrgmIdx" ON "Inventory"."ProductCompanies" USING gin (name gin_trgm_ops);
COMMENT ON TABLE "Inventory"."ProductCompanies" IS 'Product companies / brands / principals (Companies & Brands). Code sequence MFR -> CO-NN.';

-- ---------------------------------------------------------------------------
-- ProductClasses / ProductSubclasses — "Product Classes": main class MC-001
-- Packaging with sub types ST-001 Cartons … (drag to reorder, visibility)
-- Route: app/inventory/classes · src/4B-products.html · src/9F-products.js (clSave)
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."ProductClasses" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code             text NOT NULL CHECK (code ~ '^MC-\d{3,4}$'),             -- MC-001 (auto-generated)
  name             text NOT NULL CHECK (btrim(name) <> ''),                 -- Packaging
  "nameUrdu"        text,                                                    -- پیکنگ کا سامان (labels)
  icon             text NOT NULL DEFAULT 'package',                         -- lucide icon from the icon picker
  "isVisible"       boolean NOT NULL DEFAULT true,                           -- "Visible in sales & purchase screens"
  "sortOrder"       integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "productClassCodeUk" UNIQUE ("tenantId", code)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."ProductClasses"');
CREATE UNIQUE INDEX "productClassNameUk" ON "Inventory"."ProductClasses" ("tenantId", lower(name)) WHERE "deletedAt" IS NULL;
COMMENT ON TABLE "Inventory"."ProductClasses" IS 'Main product classes MC-NNN (Product Classes screen).';

CREATE TABLE "Inventory"."ProductSubclasses" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "productClassId" uuid NOT NULL,
  code             text NOT NULL CHECK (code ~ '^ST-\d{3,4}$'),             -- ST-001 (auto-generated)
  name             text NOT NULL CHECK (btrim(name) <> ''),                 -- Cartons
  "isVisible"       boolean NOT NULL DEFAULT true,
  "sortOrder"       integer NOT NULL DEFAULT 0,                              -- drag & drop order within the class
  "deletedAt"       timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "productClassId", id),                                 -- lets item prove sub type ∈ class
  CONSTRAINT "productSubclassCodeUk" UNIQUE ("tenantId", code),
  CONSTRAINT "productSubclassClassFk" FOREIGN KEY ("tenantId", "productClassId")
    REFERENCES "Inventory"."ProductClasses" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."ProductSubclasses"');
-- "Already in <class>" — unique sub type name inside its class
CREATE UNIQUE INDEX "productSubclassNameUk" ON "Inventory"."ProductSubclasses" ("tenantId", "productClassId", lower(name))
  WHERE "deletedAt" IS NULL;
CREATE INDEX "productSubclassClassSortIdx" ON "Inventory"."ProductSubclasses" ("tenantId", "productClassId", "sortOrder");
COMMENT ON TABLE "Inventory"."ProductSubclasses" IS 'Sub types ST-NNN under a main class; ordered by drag & drop (sortOrder).';

-- ---------------------------------------------------------------------------
-- item — the product master (PK-1001 …).
-- Routes: app/inventory/items (catalogue, New/Edit/Duplicate product modal,
--         inline price edit, import, bulk activate/deactivate),
--         app/inventory/products/view (hero, KPIs, tabs)
--         src/4B-products.html · src/9F-products.js (validate, saveForm)
-- Bhatti: CL_PRODUCT (RE_ORDER_LEVEL/HIGH_LEVEL, AVCOST, NARCO, SHORT, EXPIRY).
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."Products" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  -- identity (Basic Information)
  sku                  text NOT NULL CHECK (sku ~ '^[A-Z0-9][A-Z0-9-]{1,11}$'),   -- "Product Code *" PK-1001
  upc                  text CHECK (upc ~ '^(\d{8}|\d{12}|\d{13})$'),              -- "UPC must be 8, 12 or 13 digits"
  name                 text NOT NULL CHECK (btrim(name) <> ''),                    -- "Product Name *"
  "nameUrdu"            text,                                                       -- label option "Urdu name"
  description          text,                                                       -- Whole Stock sub-line ("5-ply export shipping box")
  "imageUrl"            text,                                                       -- "Drop a product image here" (PNG/JPG ≤ 2 MB)
  status               text NOT NULL DEFAULT 'ACTIVE',
  -- classification
  "manufacturerId"      uuid,                                                       -- "Company *"
  "distributorVendorId" uuid,                                                      -- "Distributor" (Purchases.Vendors; FK in fk file)
  "productClassId"     uuid,                                                       -- "Class *"
  "productSubclassId"  uuid,                                                       -- "Sub Type"
  -- units
  "uomId"               uuid NOT NULL,                                              -- "Loose *" unit
  ctn                  integer NOT NULL DEFAULT 1 CHECK (ctn >= 1),                -- "Pack (CTN size)": loose units per carton
  "defaultShelf"        text CHECK ("defaultShelf" ~ '^[A-Z]{1,2}\d{1,3}$'),         -- "Shelf #" A1, PR12 (hint only; real slot = Inventory.WarehouseBins)
  -- prices
  cost                 numeric(18,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),         -- "Purchase Price *"
  "avgCost"             numeric(18,4) NOT NULL DEFAULT 0 CHECK ("avgCost" >= 0),     -- moving weighted average (trigger-maintained, Bhatti AVCOST)
  "costPerUnit"        numeric(18,2) CHECK ("costPerUnit" >= 0),                   -- "Cost / Unit" (defaults to purchase price)
  price                numeric(18,2) NOT NULL DEFAULT 0 CHECK (price >= 0),        -- "Retail Price *"
  wprice               numeric(18,2) CHECK (wprice >= 0),                          -- "W. Price" (wholesale)
  "gstRate"             numeric(7,4) NOT NULL DEFAULT 18 CHECK ("gstRate" BETWEEN 0 AND 100),
  "taxCodeId"          uuid,                                                       -- Tax.TaxCodes (FK in fk file)
  "finDiscPct"         numeric(7,4) NOT NULL DEFAULT 0 CHECK ("finDiscPct" BETWEEN 0 AND 100),  -- "% Fin Disc."
  -- reorder levels (base units)
  "lowLevel"            numeric(18,3) NOT NULL DEFAULT 0 CHECK ("lowLevel" >= 0),    -- "Low Level" (reorder level)
  "highLevel"           numeric(18,3) NOT NULL DEFAULT 0 CHECK ("highLevel" >= 0),   -- "High Level" (max level)
  -- special attributes
  "isShort"             boolean NOT NULL DEFAULT false,   -- Short Item: no discount during sale (Bhatti SHORT)
  "trackExpiry"         boolean NOT NULL DEFAULT false,   -- Required Expiry: batch + expiry on every purchase (Bhatti EXPIRY)
  "isControlled"        boolean NOT NULL DEFAULT false,   -- Controlled Item (Bhatti NARCO)
  "isPrecious"          boolean NOT NULL DEFAULT false,   -- Precious Item (Bhatti PRECIOUS)
  "hsCode"              text CHECK ("hsCode" ~ '^\d{4}(\.?\d{2,4}){0,2}$'),         -- PCT / HS code for FBR
  -- FULL: planning attributes (Demand & Reorder, ABC count scope, Report Studio)
  "weightKg"            numeric(12,3) CHECK ("weightKg" >= 0),                       -- van capacity planning (load sheets)
  "abcClass"            char(1),                 -- refreshed from v_abc_analysis
  "avgDailySales"      numeric(18,3) CHECK ("avgDailySales" >= 0),                 -- "Avg / day" [simulated in prototype]
  "lastSaleDate"       date,                                                       -- maintained by inv_stock_ledger_last_sale
  "leadDays"            integer CHECK ("leadDays" BETWEEN 0 AND 365),                -- "Lead time" (default 14 when NULL)
  "deletedAt"           timestamptz,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "itemSkuUk" UNIQUE ("tenantId", sku),
  CONSTRAINT "itemLevelsChk" CHECK ("lowLevel" <= "highLevel"),                     -- "Low level is above high level"
  CONSTRAINT "itemRetailVsCostChk" CHECK (status = 'DRAFT' OR price >= cost),   -- "Retail is below purchase price"
  CONSTRAINT "itemCompleteWhenLiveChk" CHECK (status = 'DRAFT' OR
    ("manufacturerId" IS NOT NULL AND "productClassId" IS NOT NULL AND cost > 0 AND price > 0)),
  CONSTRAINT "itemSubclassNeedsClassChk" CHECK ("productSubclassId" IS NULL OR "productClassId" IS NOT NULL),
  CONSTRAINT "itemManufacturerFk" FOREIGN KEY ("tenantId", "manufacturerId") REFERENCES "Inventory"."ProductCompanies" ("tenantId", id),
  CONSTRAINT "itemClassFk" FOREIGN KEY ("tenantId", "productClassId") REFERENCES "Inventory"."ProductClasses" ("tenantId", id),
  CONSTRAINT "itemSubclassFk" FOREIGN KEY ("tenantId", "productClassId", "productSubclassId")
    REFERENCES "Inventory"."ProductSubclasses" ("tenantId", "productClassId", id),
  CONSTRAINT "itemUomFk" FOREIGN KEY ("tenantId", "uomId") REFERENCES "Inventory"."UnitsOfMeasure" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."Products"', true);
CREATE UNIQUE INDEX "itemUpcUk" ON "Inventory"."Products" ("tenantId", upc) WHERE upc IS NOT NULL AND "deletedAt" IS NULL;
CREATE INDEX "itemTenantStatusIdx" ON "Inventory"."Products" ("tenantId", status) WHERE "deletedAt" IS NULL;
CREATE INDEX "itemTenantManufacturerIdx" ON "Inventory"."Products" ("tenantId", "manufacturerId");
CREATE INDEX "itemTenantClassIdx" ON "Inventory"."Products" ("tenantId", "productClassId", "productSubclassId");
CREATE INDEX "itemTenantShelfIdx" ON "Inventory"."Products" ("tenantId", "defaultShelf");
CREATE INDEX "itemNameTrgmIdx" ON "Inventory"."Products" USING gin (name gin_trgm_ops);
CREATE INDEX "itemSkuTrgmIdx" ON "Inventory"."Products" USING gin (sku gin_trgm_ops);
COMMENT ON TABLE "Inventory"."Products" IS 'Product master (Product Catalogue / Product Detail). Stock is never stored here: see StockBalances.';
COMMENT ON COLUMN "Inventory"."Products".ctn IS 'Loose units per carton. baseQty = qtyCtn * ctn + qtyLoose everywhere.';
COMMENT ON COLUMN "Inventory"."Products"."avgCost" IS 'Moving weighted-average cost per base unit; maintained by Inventory.triggerStockLedgerApply on GRN/MANUAL_IN/OPENING/ASSEMBLY receipts.';
COMMENT ON COLUMN "Inventory"."Products"."defaultShelf" IS 'Shelf hint printed on labels (A1, PR12). The real storage slot is Inventory.WarehouseBins (A-01-01).';

-- ProductUnits — extra units per item ("Multi-UoM preview": 1 CTN = 24 Pcs)
-- Route: app/inventory/items (New product) · app/inventory/stock-vouchers UOM column (Full)
CREATE TABLE "Inventory"."ProductUnits" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "itemId"          uuid NOT NULL,
  "uomId"           uuid NOT NULL,
  factor           numeric(18,6) NOT NULL CHECK (factor > 0),               -- base (loose) units in one of this unit
  "isBase"          boolean NOT NULL DEFAULT false,
  "isPurchaseDefault" boolean NOT NULL DEFAULT false,
  "isSalesDefault" boolean NOT NULL DEFAULT false,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "itemUomUk" UNIQUE ("tenantId", "itemId", "uomId"),
  CONSTRAINT "itemUomBaseFactorChk" CHECK (NOT "isBase" OR factor = 1),
  CONSTRAINT "itemUomItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "itemUomUomFk" FOREIGN KEY ("tenantId", "uomId") REFERENCES "Inventory"."UnitsOfMeasure" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."ProductUnits"');
CREATE UNIQUE INDEX "itemUomOneBaseUk" ON "Inventory"."ProductUnits" ("tenantId", "itemId") WHERE "isBase";
COMMENT ON TABLE "Inventory"."ProductUnits" IS 'Units an item can be bought/sold in, with the factor to base units (carton = item.ctn).';

-- ProductBarcodes — "Barcodes": Piece (EAN-13) and Carton (ITF / EAN-13) codes
-- Routes: app/inventory/items (form), app/inventory/products/view (Barcodes & Labels tab);
-- scanned on stock-in-out / transfer / count (carton code adds a full carton).
CREATE TABLE "Inventory"."ProductBarcodes" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "itemId"          uuid NOT NULL,
  barcode          text NOT NULL CHECK (barcode ~ '^\d{8,14}$'),
  kind             text NOT NULL,
  "qtyPerScan"     numeric(18,3) NOT NULL DEFAULT 1 CHECK ("qtyPerScan" > 0),  -- 1 for piece, item.ctn for carton
  "isPrimary"       boolean NOT NULL DEFAULT false,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "itemBarcodeUk" UNIQUE ("tenantId", barcode),
  CONSTRAINT "itemBarcodeItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."ProductBarcodes"');
CREATE INDEX "itemBarcodeItemIdx" ON "Inventory"."ProductBarcodes" ("tenantId", "itemId");
CREATE UNIQUE INDEX "itemBarcodeOnePrimaryUk" ON "Inventory"."ProductBarcodes" ("tenantId", "itemId", kind) WHERE "isPrimary";
COMMENT ON TABLE "Inventory"."ProductBarcodes" IS 'Piece / carton barcodes. Unique per tenant so a scan resolves to exactly one item.';

-- ---------------------------------------------------------------------------
-- warehouse — "Warehouses" cards + "Add Warehouse" modal; locations used by
-- every stock screen (WH-LHR Lahore HQ Warehouse, SH-DHA Shop DHA Phase 6 …)
-- Routes: app/inventory/warehouses (src/41-acc-trade.html),
--         app/inventory/transfer (location cards, src/9G-stock-ops.js LOCS)
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."Warehouses" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                 text NOT NULL CHECK (code ~ '^[A-Z]{2,3}-[A-Z0-9]{2,6}$'),   -- WH-LHR, SH-DHA, WH-MUX
  name                 text NOT NULL CHECK (btrim(name) <> ''),                     -- Lahore HQ Warehouse
  description          text,                                                        -- "Main distribution centre"
  type                 text NOT NULL DEFAULT 'WAREHOUSE',
  "branchId"            uuid,                                                        -- "Branch"
  "managerUserId"      uuid,                                                        -- "Manager"
  address              text,                                                        -- 42-B Industrial Estate, Kot Lakhpat, Lahore
  city                 text,
  "capacityPallets"     integer CHECK ("capacityPallets" > 0),                        -- "Capacity (pallets)" 3,000
  "inventoryAccountId" uuid,                                                        -- "Inventory account" 1310 Inventory (Accounting.ChartOfAccounts, fk file)
  "blockNegativeStock" boolean NOT NULL DEFAULT true,                               -- "Block sales when stock is insufficient"
  "isPrimary"           boolean NOT NULL DEFAULT false,                              -- "Primary" badge
  status               text NOT NULL DEFAULT 'ACTIVE',
  -- FULL: a VAN location is bound to a distribution vehicle (Distribution.Vans, fk file)
  "vehicleId"           uuid,
  "deletedAt"           timestamptz,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "warehouseCodeUk" UNIQUE ("tenantId", code),
  CONSTRAINT "warehouseVanVehicleChk" CHECK (type <> 'VAN' OR "vehicleId" IS NOT NULL),
  CONSTRAINT "warehouseBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "warehouseManagerFk" FOREIGN KEY ("tenantId", "managerUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."Warehouses"', true);
CREATE UNIQUE INDEX "warehouseOnePrimaryUk" ON "Inventory"."Warehouses" ("tenantId") WHERE "isPrimary" AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "warehouseNameUk" ON "Inventory"."Warehouses" ("tenantId", lower(name)) WHERE "deletedAt" IS NULL;
CREATE INDEX "warehouseTenantBranchIdx" ON "Inventory"."Warehouses" ("tenantId", "branchId");
COMMENT ON TABLE "Inventory"."Warehouses" IS 'Stock locations: warehouses and shops (Full adds vans). Each maps to an inventory GL account.';

-- bin — the real storage slot (rack-row-bin, A-01-01). "Location / Shelf / Rack"
-- on Stock In/Out; "Bins / racks 640 / 32" on the warehouse card; Whole Stock "Location".
CREATE TABLE "Inventory"."WarehouseBins" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "warehouseId"     uuid NOT NULL,
  code             text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{0,19}$'),   -- A-01-01 (rack A, row 01, bin 01)
  rack             text,                                                     -- A
  "shelfRow"        text,                                                     -- 01
  position         text,                                                     -- 01
  zone             text,                                                     -- Dry, Bay C, Zone F …
  "isActive"        boolean NOT NULL DEFAULT true,
  "deletedAt"       timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "warehouseId", id),                                      -- lets rows prove bin ∈ warehouse
  CONSTRAINT "binCodeUk" UNIQUE ("tenantId", "warehouseId", code),
  CONSTRAINT "binWarehouseFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."WarehouseBins"');
COMMENT ON TABLE "Inventory"."WarehouseBins" IS 'Storage slots inside a warehouse (rack-row-bin A-01-01). item.defaultShelf is only a hint.';

-- ---------------------------------------------------------------------------
-- batch — batch / lot with expiry and FEFO disposition (FD5001A, exp 2026-12-31)
-- Routes: app/inventory/batches (FEFO register, row menu: clearance, return to
--         principal, write off), app/inventory/products/view (Batches & Expiry),
--         app/inventory/stock-in-out ("+ New batch")
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."ProductBatches" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "itemId"          uuid NOT NULL,
  "batchNo"         text NOT NULL CHECK (btrim("batchNo") <> '' AND char_length("batchNo") <= 40),  -- FD5001A
  "expiryDate"      date,                                                   -- required when item.trackExpiry (trigger)
  "mfgDate"         date,
  "unitCost"        numeric(18,4) CHECK ("unitCost" >= 0),                   -- landed cost of the batch
  disposition      text NOT NULL DEFAULT 'SALEABLE',
  "dispositionAt"   timestamptz,
  "dispositionByUserId" uuid,
  "sourceDocType"  text REFERENCES "Company"."DocumentTypes"(code),                   -- GRN / MI that created it
  "sourceDocId"    uuid,
  notes            text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "itemId", id),                                         -- lets rows prove batch ∈ item
  CONSTRAINT "batchNoUk" UNIQUE ("tenantId", "itemId", "batchNo"),
  CONSTRAINT "batchDatesChk" CHECK ("mfgDate" IS NULL OR "expiryDate" IS NULL OR "mfgDate" <= "expiryDate"),
  CONSTRAINT "batchItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "batchDispositionUserFk" FOREIGN KEY ("tenantId", "dispositionByUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."ProductBatches"', true);
CREATE INDEX "batchTenantExpiryIdx" ON "Inventory"."ProductBatches" ("tenantId", "expiryDate") WHERE disposition <> 'WRITTEN_OFF';
CREATE INDEX "batchTenantItemExpiryIdx" ON "Inventory"."ProductBatches" ("tenantId", "itemId", "expiryDate");   -- FEFO pick order
CREATE INDEX "batchNoTrgmIdx" ON "Inventory"."ProductBatches" USING gin ("batchNo" gin_trgm_ops);
COMMENT ON TABLE "Inventory"."ProductBatches" IS 'Batches/lots with expiry and disposition. FEFO: pick the earliest expiryDate first.';
COMMENT ON COLUMN "Inventory"."ProductBatches".disposition IS 'SALEABLE (>90 d) / PRIORITY (≤90 d, sell first) / QUARANTINE (expired) / CLEARANCE / RETURN_TO_PRINCIPAL / WRITTEN_OFF.';

-- Expiry is mandatory for batches of expiry-tracked items ("Required Expiry").
CREATE OR REPLACE FUNCTION "Inventory"."triggerBatchCheck"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vTrack" boolean;
BEGIN
  SELECT i."trackExpiry" INTO "vTrack"
    FROM "Inventory"."Products" i
   WHERE i."tenantId" = NEW."tenantId" AND i.id = NEW."itemId";
  IF "vTrack" AND NEW."expiryDate" IS NULL THEN
    RAISE EXCEPTION 'Batch % needs an expiry date: the item requires expiry', NEW."batchNo"
      USING ERRCODE = 'not_null_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW."dispositionAt" := COALESCE(NEW."dispositionAt", now());
  ELSIF NEW.disposition IS DISTINCT FROM OLD.disposition THEN
    NEW."dispositionAt" := now();
    NEW."dispositionByUserId" := COALESCE("Company"."getCurrentUserId"(), NEW."dispositionByUserId");
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "invBatchCheck" BEFORE INSERT OR UPDATE OF "expiryDate", "itemId", disposition ON "Inventory"."ProductBatches"
  FOR EACH ROW EXECUTE FUNCTION "Inventory"."triggerBatchCheck"();

-- ---------------------------------------------------------------------------
-- StockMovementReasons — "Movement Reasons" tiles on Stock In / Out, the adjustment
-- "Reason *" select and the Adjust-stock sheet on Product Detail.
--   IN : Opening Stock, Adjustment, Damaged Return, Production, Found in Count,
--        Gift Received, Internal Return
--   OUT: Consumption, Sample Issue, Internal Use, Adjustment, Damaged / Breakage,
--        Expired Write-off, Lost / Theft
--   ADJ: Cycle count variance, Damaged, Expired, Theft / loss,
--        Internal consumption, Found in count
-- Routes: app/inventory/stock-in-out (src/9G-stock-ops.js REASONS),
--         app/inventory/adjustments (src/41-acc-trade.html)
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."StockMovementReasons" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  direction            text NOT NULL,
  code                 text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),     -- OPENING_STOCK, LOST_THEFT …
  label                text NOT NULL,                                             -- "Opening Stock"
  hint                 text,                                                      -- "First-time balances"
  icon                 text,                                                      -- lucide icon of the tile
  "ledgerMovementType" text NOT NULL,
  "expenseAccountId"   uuid,                                                      -- offset GL account (Accounting.ChartOfAccounts, fk file)
  "isSystem"            boolean NOT NULL DEFAULT false,
  "sortOrder"           integer NOT NULL DEFAULT 0,
  "isActive"            boolean NOT NULL DEFAULT true,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", direction, id),                                              -- lets documents prove reason direction
  CONSTRAINT "movementReasonCodeUk" UNIQUE ("tenantId", direction, code)

);
SELECT "Company"."addStandardTriggers"('"Inventory"."StockMovementReasons"', true);
COMMENT ON TABLE "Inventory"."StockMovementReasons" IS 'Reasons for manual stock in/out and adjustments; each maps to a ledger movement type and an offset GL account.';

-- ---------------------------------------------------------------------------
-- StockMovements — APPEND-ONLY movement ledger (Bhatti CL_DPOST, WPQTY/WSQTY).
-- Routes: app/inventory/movements (Movement ledger, mix, locations touched),
--         app/inventory/products/view (Stock Card tab), app/inventory/stock
--         (Last Movement), every posting screen writes here.
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."StockMovements" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  seq              bigint GENERATED ALWAYS AS IDENTITY,                     -- deterministic order for running balances
  "movementDate"    date NOT NULL,                                           -- document date
  "movementAt"      timestamptz NOT NULL DEFAULT now(),                      -- "Date / time" on the ledger
  "itemId"          uuid NOT NULL,
  "warehouseId"     uuid NOT NULL,
  "binId"           uuid,
  "batchId"         uuid,
  "expiryDate"      date,                                                    -- copied from the batch (trigger)
  "qtyIn"           numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyIn" >= 0),    -- base units
  "qtyOut"          numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyOut" >= 0),
  "unitCost"        numeric(18,4) NOT NULL CHECK ("unitCost" >= 0),           -- NULL on insert = item.avgCost (trigger)
  value            numeric(18,2) GENERATED ALWAYS AS (round(("qtyIn" - "qtyOut") * "unitCost", 2)) STORED,  -- signed
  "movementType"    text NOT NULL,
  "reasonId"        uuid,
  "sourceDocType"  text NOT NULL REFERENCES "Company"."DocumentTypes"(code),            -- GRN, INV, SV, MI, MO, TRF, ADJ, SC …
  "sourceDocId"    uuid NOT NULL,
  "sourceDocNo"    text,                                                    -- "Reference" GRN-2026-000874
  "sourceLineId"   uuid,
  "counterWarehouseId" uuid,                                                -- other side of a transfer ("Route" from → to)
  "partyLabel"      text,                                                    -- customer / vendor / "Consumption"
  "userId"          uuid,                                                    -- "by Kashif Ali"
  remarks          text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "stockLedgerOneSideChk" CHECK (("qtyIn" > 0) <> ("qtyOut" > 0)),     -- exactly one of in / out
  CONSTRAINT "stockLedgerTransferSideChk" CHECK (
    "movementType" NOT IN ('TRANSFER_OUT','TRANSFER_IN') OR "counterWarehouseId" IS NOT NULL),
  CONSTRAINT "stockLedgerItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "stockLedgerWarehouseFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  CONSTRAINT "stockLedgerBinFk" FOREIGN KEY ("tenantId", "warehouseId", "binId") REFERENCES "Inventory"."WarehouseBins" ("tenantId", "warehouseId", id),
  CONSTRAINT "stockLedgerBatchFk" FOREIGN KEY ("tenantId", "itemId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", "itemId", id),
  CONSTRAINT "stockLedgerReasonFk" FOREIGN KEY ("tenantId", "reasonId") REFERENCES "Inventory"."StockMovementReasons" ("tenantId", id),
  CONSTRAINT "stockLedgerCounterWhFk" FOREIGN KEY ("tenantId", "counterWarehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  CONSTRAINT "stockLedgerUserFk" FOREIGN KEY ("tenantId", "userId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."StockMovements"');
CREATE TRIGGER "invStockLedgerAppendOnly" BEFORE UPDATE OR DELETE ON "Inventory"."StockMovements"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();
CREATE TRIGGER "invStockLedgerNoTruncate" BEFORE TRUNCATE ON "Inventory"."StockMovements"
  FOR EACH STATEMENT EXECUTE FUNCTION "Company"."triggerAppendOnly"();
CREATE INDEX "stockLedgerCardIdx" ON "Inventory"."StockMovements" ("tenantId", "itemId", "warehouseId", "movementDate", seq);   -- stock card
CREATE INDEX "stockLedgerDateIdx" ON "Inventory"."StockMovements" ("tenantId", "movementDate", seq);                         -- movements list
CREATE INDEX "stockLedgerWhDateIdx" ON "Inventory"."StockMovements" ("tenantId", "warehouseId", "movementDate");
CREATE INDEX "stockLedgerTypeDateIdx" ON "Inventory"."StockMovements" ("tenantId", "movementType", "movementDate");
CREATE INDEX "stockLedgerSourceIdx" ON "Inventory"."StockMovements" ("tenantId", "sourceDocType", "sourceDocId");
CREATE INDEX "stockLedgerBatchIdx" ON "Inventory"."StockMovements" ("tenantId", "batchId") WHERE "batchId" IS NOT NULL;
COMMENT ON TABLE "Inventory"."StockMovements" IS 'Append-only stock movement ledger: the single source of truth for stock. Corrections are new rows, never edits.';
COMMENT ON COLUMN "Inventory"."StockMovements".value IS 'Signed value = (qtyIn - qtyOut) * unitCost. Outgoing rows are costed at item.avgCost when unitCost is not supplied.';

-- ---------------------------------------------------------------------------
-- StockBalances — on hand / reserved / available per item × warehouse × bin × batch.
-- Maintained ONLY by Inventory.triggerStockLedgerApply (and, in Full, reservations).
-- Routes: app/inventory/stock (Current / Reserved / Available / Stock Value /
--         Status chips), app/inventory/items ("Stock" pill, Stock List tab),
--         app/inventory/products/view (On hand / Available / Reserved KPIs).
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."StockBalances" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "itemId"          uuid NOT NULL,
  "warehouseId"     uuid NOT NULL,
  "binId"           uuid,
  "batchId"         uuid,
  "qtyOnHand"      numeric(18,3) NOT NULL DEFAULT 0,                          -- may go negative only where the warehouse allows it
  "qtyReserved"     numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyReserved" >= 0),
  "qtyAvailable"    numeric(18,3) GENERATED ALWAYS AS ("qtyOnHand" - "qtyReserved") STORED,
  value            numeric(18,2) NOT NULL DEFAULT 0,                          -- Σ ledger value for the slot
  "lastMovementAt" timestamptz,
  "lastInDate"     date,
  "lastOutDate"    date,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "stockBalanceSlotUk" UNIQUE NULLS NOT DISTINCT ("tenantId", "itemId", "warehouseId", "binId", "batchId"),
  CONSTRAINT "stockBalanceItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "stockBalanceWarehouseFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  CONSTRAINT "stockBalanceBinFk" FOREIGN KEY ("tenantId", "warehouseId", "binId") REFERENCES "Inventory"."WarehouseBins" ("tenantId", "warehouseId", id),
  CONSTRAINT "stockBalanceBatchFk" FOREIGN KEY ("tenantId", "itemId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", "itemId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."StockBalances"');
CREATE INDEX "stockBalanceItemIdx" ON "Inventory"."StockBalances" ("tenantId", "itemId");
CREATE INDEX "stockBalanceWhItemIdx" ON "Inventory"."StockBalances" ("tenantId", "warehouseId", "itemId");
CREATE INDEX "stockBalanceBatchIdx" ON "Inventory"."StockBalances" ("tenantId", "batchId") WHERE "batchId" IS NOT NULL;
CREATE INDEX "stockBalanceNegativeIdx" ON "Inventory"."StockBalances" ("tenantId", "warehouseId") WHERE "qtyOnHand" < 0;  -- Minus Stock
COMMENT ON TABLE "Inventory"."StockBalances" IS 'Derived stock per slot (item × warehouse × bin × batch). Never written by the application.';

-- ---------------------------------------------------------------------------
-- Ledger triggers
-- ---------------------------------------------------------------------------

-- BEFORE INSERT: default the cost of outgoing rows to the moving average,
-- copy batch expiry, insist on a batch for expiry-tracked items, keep
-- unsaleable batches out of sales, stamp the user.
CREATE OR REPLACE FUNCTION "Inventory"."triggerStockLedgerPrepare"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vItem"  record;
  "vBatch" record;
BEGIN
  SELECT i."avgCost", i."trackExpiry", i.sku INTO "vItem"
    FROM "Inventory"."Products" i
   WHERE i."tenantId" = NEW."tenantId" AND i.id = NEW."itemId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown item % for this tenant', NEW."itemId" USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF "vItem"."trackExpiry" AND NEW."batchId" IS NULL THEN
    RAISE EXCEPTION 'Item % is expiry-tracked: every stock movement needs a batch', "vItem".sku
      USING ERRCODE = 'not_null_violation';
  END IF;

  IF NEW."batchId" IS NOT NULL THEN
    SELECT b."expiryDate", b.disposition, b."batchNo" INTO "vBatch"
      FROM "Inventory"."ProductBatches" b
     WHERE b."tenantId" = NEW."tenantId" AND b.id = NEW."batchId";
    NEW."expiryDate" := COALESCE(NEW."expiryDate", "vBatch"."expiryDate");
    IF NEW."movementType" = 'SALE'
       AND "vBatch".disposition IN ('QUARANTINE','RETURN_TO_PRINCIPAL','WRITTEN_OFF') THEN
      RAISE EXCEPTION 'Batch % is % and cannot be sold', "vBatch"."batchNo", "vBatch".disposition
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW."unitCost" IS NULL THEN
    NEW."unitCost" := COALESCE("vItem"."avgCost", 0);
  END IF;
  NEW."userId" := COALESCE(NEW."userId", "Company"."getCurrentUserId"());
  RETURN NEW;
END $$;
CREATE TRIGGER "invStockLedgerPrepare" BEFORE INSERT ON "Inventory"."StockMovements"
  FOR EACH ROW EXECUTE FUNCTION "Inventory"."triggerStockLedgerPrepare"();

-- AFTER INSERT: upsert the slot balance, enforce blockNegativeStock and
-- recompute the moving weighted-average cost on costed receipts.
--   new_avg = (prev_qty * avg + qtyIn * unitCost) / (prev_qty + qtyIn)
--   (prev_qty = item on hand across all warehouses before this row;
--    when prev_qty <= 0 the receipt cost becomes the average)
-- TRANSFER_IN, SALES_RETURN, COUNT and ADJUSTMENT receipts move stock at
-- the existing average and do not change it.
CREATE OR REPLACE FUNCTION "Inventory"."triggerStockLedgerApply"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vAvg"       numeric(18,4);
  "vBlock"     boolean;
  "vSlotQty"  numeric(18,3);
  "vItemQty"  numeric(18,3);
  "vPrevQty"  numeric(18,3);
  "vNewAvg"   numeric(18,4);
BEGIN
  -- 1. serialise movements of the same item (stable "before" quantity)
  SELECT i."avgCost" INTO "vAvg"
    FROM "Inventory"."Products" i
   WHERE i."tenantId" = NEW."tenantId" AND i.id = NEW."itemId"
     FOR UPDATE;

  -- 2. slot balance
  INSERT INTO "Inventory"."StockBalances" AS sb
         ("tenantId", "itemId", "warehouseId", "binId", "batchId", "qtyOnHand", value,
          "lastMovementAt", "lastInDate", "lastOutDate")
  VALUES (NEW."tenantId", NEW."itemId", NEW."warehouseId", NEW."binId", NEW."batchId",
          NEW."qtyIn" - NEW."qtyOut", NEW.value, NEW."movementAt",
          CASE WHEN NEW."qtyIn"  > 0 THEN NEW."movementDate" END,
          CASE WHEN NEW."qtyOut" > 0 THEN NEW."movementDate" END)
  ON CONFLICT ON CONSTRAINT "stockBalanceSlotUk" DO UPDATE
     SET "qtyOnHand"      = sb."qtyOnHand" + EXCLUDED."qtyOnHand",
         value            = sb.value + EXCLUDED.value,
         "lastMovementAt" = GREATEST(sb."lastMovementAt", EXCLUDED."lastMovementAt"),
         "lastInDate"     = GREATEST(sb."lastInDate", EXCLUDED."lastInDate"),
         "lastOutDate"    = GREATEST(sb."lastOutDate", EXCLUDED."lastOutDate")
  RETURNING sb."qtyOnHand" INTO "vSlotQty";

  -- 3. negative stock guard
  IF NEW."qtyOut" > 0 AND "vSlotQty" < 0 THEN
    SELECT w."blockNegativeStock" INTO "vBlock"
      FROM "Inventory"."Warehouses" w
     WHERE w."tenantId" = NEW."tenantId" AND w.id = NEW."warehouseId";
    IF "vBlock" THEN
      RAISE EXCEPTION 'Insufficient stock: % short by % in this warehouse/batch', NEW."itemId", -"vSlotQty"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 4. moving weighted-average cost
  IF NEW."qtyIn" > 0 AND NEW."movementType" IN ('GRN','MANUAL_IN','OPENING','ASSEMBLY') THEN
    SELECT COALESCE(sum(b."qtyOnHand"), 0) INTO "vItemQty"
      FROM "Inventory"."StockBalances" b
     WHERE b."tenantId" = NEW."tenantId" AND b."itemId" = NEW."itemId";
    "vPrevQty" := "vItemQty" - NEW."qtyIn";
    IF "vPrevQty" <= 0 THEN
      "vNewAvg" := NEW."unitCost";
    ELSE
      "vNewAvg" := round(("vPrevQty" * COALESCE("vAvg", 0) + NEW."qtyIn" * NEW."unitCost")
                         / ("vPrevQty" + NEW."qtyIn"), 4);
    END IF;
    UPDATE "Inventory"."Products" i
       SET "avgCost" = "vNewAvg"
     WHERE i."tenantId" = NEW."tenantId" AND i.id = NEW."itemId"
       AND i."avgCost" IS DISTINCT FROM "vNewAvg";
  END IF;

  RETURN NULL;
END $$;
CREATE TRIGGER "invStockLedgerApply" AFTER INSERT ON "Inventory"."StockMovements"
  FOR EACH ROW EXECUTE FUNCTION "Inventory"."triggerStockLedgerApply"();

-- ---------------------------------------------------------------------------
-- StockInOut — "Manual Stock In / Stock Out" (MI-000126 / MO-000022)
-- Route: app/inventory/stock-in-out · src/4C-stock-ops.html · src/9G-stock-ops.js
--   Entry No. · Entry Date · Manual Reference No. · Movement Reason * ·
--   Warehouse * · Location / Shelf / Rack · Requested By · Entered By * · Notes (300)
--   "Recent Manual Entries": Date, Entry No., Type, Reason, Reference No.,
--   Items, Quantity, Total Value, Status (Posted / Draft), Entered By
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."StockInOut" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"               text NOT NULL,                                         -- MI-000126 / MO-000022 (doc types MI / MO)
  mode                 text NOT NULL,
  "docDate"             date NOT NULL,
  "manualRef"           text,                                                  -- "Manual Reference No." OP-2026-01
  "reasonId"            uuid,                                                  -- "Movement Reason *" (required to post)
  "warehouseId"         uuid NOT NULL,
  "binId"               uuid,                                                  -- "Location / Shelf / Rack" A-01-01
  "requestedByName"    text,                                                  -- "Requested By" (Full: employee FK)
  "enteredByUserId"   uuid NOT NULL,                                         -- "Entered By *"
  notes                text CHECK (char_length(notes) <= 300),
  status               text NOT NULL DEFAULT 'DRAFT',
  "totalItems"          integer NOT NULL DEFAULT 0 CHECK ("totalItems" >= 0),
  "totalQty"            numeric(18,3) NOT NULL DEFAULT 0 CHECK ("totalQty" >= 0),
  "totalValue"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("totalValue" >= 0),
  "postedAt"            timestamptz,
  "postedByUserId"    uuid,
  "journalEntryId"     uuid,                                                  -- Accounting.Vouchers (fk file)
  "cancelledAt"         timestamptz,
  "cancelReason"        text,
  -- FULL: "Requested By" as an employee (HumanResources.Employees, fk file)
  "requestedByEmployeeId" uuid,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "manualStockEntryDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "manualStockEntryPostedChk" CHECK (status <> 'POSTED' OR ("postedAt" IS NOT NULL AND "reasonId" IS NOT NULL)),
  CONSTRAINT "manualStockEntryCancelChk" CHECK (status <> 'CANCELLED' OR "cancelledAt" IS NOT NULL),
  CONSTRAINT "manualStockEntryReasonFk" FOREIGN KEY ("tenantId", mode, "reasonId")
    REFERENCES "Inventory"."StockMovementReasons" ("tenantId", direction, id),                -- reason direction must equal mode
  CONSTRAINT "manualStockEntryWarehouseFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  CONSTRAINT "manualStockEntryBinFk" FOREIGN KEY ("tenantId", "warehouseId", "binId") REFERENCES "Inventory"."WarehouseBins" ("tenantId", "warehouseId", id),
  CONSTRAINT "manualStockEntryEnteredByFk" FOREIGN KEY ("tenantId", "enteredByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "manualStockEntryPostedByFk" FOREIGN KEY ("tenantId", "postedByUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."StockInOut"', true);
CREATE INDEX "manualStockEntryListIdx" ON "Inventory"."StockInOut" ("tenantId", "docDate" DESC, mode);
CREATE INDEX "manualStockEntryStatusIdx" ON "Inventory"."StockInOut" ("tenantId", status);
CREATE INDEX "manualStockEntryWhIdx" ON "Inventory"."StockInOut" ("tenantId", "warehouseId", "docDate");
COMMENT ON TABLE "Inventory"."StockInOut" IS 'Manual stock in (MI) / out (MO) documents. Posting writes MANUAL_IN / MANUAL_OUT / OPENING / WRITE_OFF ledger rows per reason.';

CREATE TABLE "Inventory"."StockInOutEntryLines" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "entryId"         uuid NOT NULL,
  "lineNo"          smallint NOT NULL CHECK ("lineNo" > 0),
  "itemId"          uuid NOT NULL,                                             -- "Product" (search / scan)
  "batchId"         uuid,                                                      -- "Batch" (existing)
  "newBatchNo"     text,                                                      -- "+ New batch" on stock in
  "newExpiryDate"  date,
  qty              numeric(18,3) NOT NULL CHECK (qty > 0),                    -- "Quantity" (base units)
  "unitCost"        numeric(18,4) NOT NULL CHECK ("unitCost" >= 0),             -- "Unit Cost (Rs.)"
  value            numeric(18,2) GENERATED ALWAYS AS (round(qty * "unitCost", 2)) STORED,  -- "Total Value (Rs.)"
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "manualStockEntryLineNoUk" UNIQUE ("tenantId", "entryId", "lineNo"),
  CONSTRAINT "manualStockEntryLineBatchChoiceChk" CHECK ("batchId" IS NULL OR "newBatchNo" IS NULL),
  CONSTRAINT "manualStockEntryLineNewExpiryChk" CHECK ("newExpiryDate" IS NULL OR "newBatchNo" IS NOT NULL),
  CONSTRAINT "manualStockEntryLineEntryFk" FOREIGN KEY ("tenantId", "entryId") REFERENCES "Inventory"."StockInOut" ("tenantId", id),
  CONSTRAINT "manualStockEntryLineItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "manualStockEntryLineBatchFk" FOREIGN KEY ("tenantId", "itemId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", "itemId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."StockInOutEntryLines"');
CREATE INDEX "manualStockEntryLineItemIdx" ON "Inventory"."StockInOutEntryLines" ("tenantId", "itemId");

-- ---------------------------------------------------------------------------
-- StockTransfers — "Stock Transfer" (TRF-2026-000124; the prototype's TR-000124
-- and TRF-2026-000043 collapse into one series, doc type TRF).
-- Routes: app/inventory/transfer (header, From/To cards, Transfer Manifest,
--         Transfer Slip, Recent Transfers, Incoming transfers + Receive),
--         app/inventory/warehouses ("Inter-warehouse transfers": Carrier, Status)
-- Status: DRAFT → POSTED (stock leaves source: TRANSFER_OUT) → DISPATCHED →
--         IN_TRANSIT → RECEIVED (TRANSFER_IN at destination) · CANCELLED
--         (prototype "Pending" = POSTED, not yet dispatched)
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."StockTransfers" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"               text NOT NULL,                                         -- TRF-2026-000124
  "docDate"             date NOT NULL,
  "transferAt"          timestamptz NOT NULL DEFAULT now(),                    -- "Date & Time"
  "fromWarehouseId"    uuid NOT NULL,                                         -- "From" source location
  "toWarehouseId"      uuid NOT NULL,                                         -- "To" destination location
  "preparedByUserId"  uuid NOT NULL,                                         -- "Prepared By"
  remarks              text,                                                  -- "Remarks (Optional)"
  status               text NOT NULL DEFAULT 'DRAFT',
  carrier              text,                                                  -- "Carrier": TCS Logistics / Own fleet
  "driverName"          text,                                                  -- "Rafiq Shah" (Full: driverEmployeeId)
  "vehicleNo"           text,                                                  -- "LEA-2290"   (Full: vehicleId)
  "dispatchedAt"        timestamptz,                                           -- "Dispatched 30 Sep · 04:15 PM"
  "etaAt"               timestamptz,                                           -- "ETA Today · 02:00 PM"
  "receivedAt"          timestamptz,
  "receivedByUserId"  uuid,
  "receiptNote"         text,                                                  -- "Receiving note"
  "totalItems"          integer NOT NULL DEFAULT 0 CHECK ("totalItems" >= 0),
  "totalQty"            numeric(18,3) NOT NULL DEFAULT 0 CHECK ("totalQty" >= 0),
  "totalValue"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("totalValue" >= 0),
  "postedAt"            timestamptz,
  "journalEntryId"     uuid,                                                  -- dispatch JV (only when GL accounts differ)
  "receiptJournalEntryId" uuid,                                              -- receipt JV (only when GL accounts differ)
  "cancelledAt"         timestamptz,
  "cancelReason"        text,
  -- FULL: driver / vehicle as FKs (HumanResources.Employees, Distribution.Vans; fk file)
  "driverEmployeeId"   uuid,
  "vehicleId"           uuid,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", id, "fromWarehouseId", "toWarehouseId"),                 -- lines carry both warehouses for bin FKs
  CONSTRAINT "stockTransferDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "stockTransferDistinctWhChk" CHECK ("fromWarehouseId" <> "toWarehouseId"),  -- "Source and destination are the same"
  CONSTRAINT "stockTransferPostedChk" CHECK (status IN ('DRAFT','CANCELLED') OR "postedAt" IS NOT NULL),
  CONSTRAINT "stockTransferDispatchChk" CHECK (status NOT IN ('DISPATCHED','IN_TRANSIT') OR "dispatchedAt" IS NOT NULL),
  CONSTRAINT "stockTransferReceivedChk" CHECK (status <> 'RECEIVED' OR "receivedAt" IS NOT NULL),
  CONSTRAINT "stockTransferEtaChk" CHECK ("etaAt" IS NULL OR "dispatchedAt" IS NULL OR "etaAt" >= "dispatchedAt"),
  CONSTRAINT "stockTransferCancelChk" CHECK (status <> 'CANCELLED' OR "cancelledAt" IS NOT NULL),
  CONSTRAINT "stockTransferFromFk" FOREIGN KEY ("tenantId", "fromWarehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  CONSTRAINT "stockTransferToFk" FOREIGN KEY ("tenantId", "toWarehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  CONSTRAINT "stockTransferPreparedByFk" FOREIGN KEY ("tenantId", "preparedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "stockTransferReceivedByFk" FOREIGN KEY ("tenantId", "receivedByUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."StockTransfers"', true);
CREATE INDEX "stockTransferListIdx" ON "Inventory"."StockTransfers" ("tenantId", "docDate" DESC);
CREATE INDEX "stockTransferStatusIdx" ON "Inventory"."StockTransfers" ("tenantId", status);
CREATE INDEX "stockTransferFromIdx" ON "Inventory"."StockTransfers" ("tenantId", "fromWarehouseId", "docDate");
CREATE INDEX "stockTransferToOpenIdx" ON "Inventory"."StockTransfers" ("tenantId", "toWarehouseId")
  WHERE status IN ('POSTED','DISPATCHED','IN_TRANSIT');                       -- "Incoming transfers"
COMMENT ON TABLE "Inventory"."StockTransfers" IS 'Inter-location transfer (TRF). TRANSFER_OUT on POSTED, TRANSFER_IN on RECEIVED; in between the stock is in transit.';

CREATE TABLE "Inventory"."StockTransferLines" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "transferId"          uuid NOT NULL,
  "fromWarehouseId"    uuid NOT NULL,                                         -- = header (FK below, follows header edits)
  "toWarehouseId"      uuid NOT NULL,
  "lineNo"              smallint NOT NULL CHECK ("lineNo" > 0),
  "itemId"              uuid NOT NULL,
  "batchId"             uuid,                                                  -- "Batch" select (expiry shown from batch)
  "fromBinId"          uuid,
  "toBinId"            uuid,
  "ctnSize"             integer NOT NULL CHECK ("ctnSize" >= 1),                -- item.ctn at the time ("× 24")
  "qtyCtn"              numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyCtn" >= 0), -- "Transfer CTN"
  "qtyLoose"            numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyLoose" >= 0), -- "Loose Qty"
  "baseQty"             numeric(18,3) GENERATED ALWAYS AS ("qtyCtn" * "ctnSize" + "qtyLoose") STORED,
  "unitCost"            numeric(18,4) NOT NULL CHECK ("unitCost" >= 0),         -- "Cost (Rs.)" batch cost or avg cost
  value                numeric(18,2) GENERATED ALWAYS AS (round(("qtyCtn" * "ctnSize" + "qtyLoose") * "unitCost", 2)) STORED,
  "isControlled"        boolean NOT NULL DEFAULT false,                        -- "Controlled item" toggle
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "stockTransferLineNoUk" UNIQUE ("tenantId", "transferId", "lineNo"),
  CONSTRAINT "stockTransferLineQtyChk" CHECK ("qtyCtn" * "ctnSize" + "qtyLoose" > 0),   -- "Line has no quantity"
  CONSTRAINT "stockTransferLineHeaderFk" FOREIGN KEY ("tenantId", "transferId", "fromWarehouseId", "toWarehouseId")
    REFERENCES "Inventory"."StockTransfers" ("tenantId", id, "fromWarehouseId", "toWarehouseId") ON UPDATE CASCADE,
  CONSTRAINT "stockTransferLineItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "stockTransferLineBatchFk" FOREIGN KEY ("tenantId", "itemId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", "itemId", id),
  CONSTRAINT "stockTransferLineFromBinFk" FOREIGN KEY ("tenantId", "fromWarehouseId", "fromBinId") REFERENCES "Inventory"."WarehouseBins" ("tenantId", "warehouseId", id),
  CONSTRAINT "stockTransferLineToBinFk" FOREIGN KEY ("tenantId", "toWarehouseId", "toBinId") REFERENCES "Inventory"."WarehouseBins" ("tenantId", "warehouseId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."StockTransferLines"');
CREATE INDEX "stockTransferLineTransferIdx" ON "Inventory"."StockTransferLines" ("tenantId", "transferId");
CREATE INDEX "stockTransferLineItemIdx" ON "Inventory"."StockTransferLines" ("tenantId", "itemId");

-- ---------------------------------------------------------------------------
-- StockAdjustments — "Stock Adjustments" register + "New stock adjustment"
-- (ADJ-2026-000032 · counted quantities post the difference at weighted
-- average cost; "Above Rs 25,000 needs Finance Manager approval").
-- Also created by Product Detail "Adjust stock" and the Batches screen
-- "Write off…" (reason Expired write-off, ledger WRITE_OFF).
-- Route: app/inventory/adjustments · src/41-acc-trade.html
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."StockAdjustments" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"               text NOT NULL,                                         -- ADJ-2026-000031
  "docDate"             date NOT NULL,                                         -- "Date"
  "warehouseId"         uuid NOT NULL,                                         -- "Warehouse"
  "reasonId"            uuid NOT NULL,                                         -- "Reason *" (direction ADJ)
  "offsetAccountId"    uuid,                                                  -- "Offset account" 5090 / 5095 (Accounting.ChartOfAccounts, fk file)
  remarks              text,                                                  -- "Remarks"
  status               text NOT NULL DEFAULT 'DRAFT',
  "lineCount"           integer NOT NULL DEFAULT 0 CHECK ("lineCount" >= 0),    -- "Lines"
  "netValue"            numeric(18,2) NOT NULL DEFAULT 0,                      -- "Value (Rs)" signed (−18,420.00)
  "approvalRequired"    boolean NOT NULL DEFAULT false,                        -- |netValue| above the approval limit (Rs 25,000)
  "preparedByUserId"  uuid NOT NULL,                                         -- name under ADJ # (Hamza Butt)
  "submittedAt"         timestamptz,
  "approvedByUserId"  uuid,
  "approvedAt"          timestamptz,
  "rejectionReason"     text,
  "postedAt"            timestamptz,
  "journalEntryId"     uuid,                                                  -- Accounting.Vouchers (fk file)
  "sourceDocType"      text REFERENCES "Company"."DocumentTypes"(code),                   -- when raised from a batch write-off etc.
  "sourceDocId"        uuid,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "stockAdjustmentDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "stockAdjustmentApprovalChk" CHECK (status <> 'POSTED' OR NOT "approvalRequired"
                                                  OR ("approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL)),
  CONSTRAINT "stockAdjustmentPostedChk" CHECK (status <> 'POSTED' OR "postedAt" IS NOT NULL),
  CONSTRAINT "stockAdjustmentRejectedChk" CHECK (status <> 'REJECTED' OR "rejectionReason" IS NOT NULL),
  CONSTRAINT "stockAdjustmentWarehouseFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  CONSTRAINT "stockAdjustmentReasonFk" FOREIGN KEY ("tenantId", "reasonId") REFERENCES "Inventory"."StockMovementReasons" ("tenantId", id),
  CONSTRAINT "stockAdjustmentPreparedByFk" FOREIGN KEY ("tenantId", "preparedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "stockAdjustmentApprovedByFk" FOREIGN KEY ("tenantId", "approvedByUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."StockAdjustments"', true);
CREATE INDEX "stockAdjustmentListIdx" ON "Inventory"."StockAdjustments" ("tenantId", "docDate" DESC);
CREATE INDEX "stockAdjustmentStatusIdx" ON "Inventory"."StockAdjustments" ("tenantId", status);
CREATE INDEX "stockAdjustmentReasonIdx" ON "Inventory"."StockAdjustments" ("tenantId", "reasonId", "docDate");   -- "Q1 by reason"
CREATE INDEX "stockAdjustmentWhIdx" ON "Inventory"."StockAdjustments" ("tenantId", "warehouseId", "docDate");
COMMENT ON TABLE "Inventory"."StockAdjustments" IS 'Stock adjustment (ADJ): counted vs on hand at weighted-average cost; approval above the limit; posts ADJUSTMENT / WRITE_OFF rows and a JV.';

CREATE TABLE "Inventory"."StockAdjustmentLines" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "adjustmentId"    uuid NOT NULL,
  "lineNo"          smallint NOT NULL CHECK ("lineNo" > 0),
  "itemId"          uuid NOT NULL,                                             -- "Item"
  "batchId"         uuid,
  "qtyOnHand"      numeric(18,3) NOT NULL,                                    -- "On hand" (book, snapshot)
  "qtyCounted"      numeric(18,3) NOT NULL CHECK ("qtyCounted" >= 0),           -- "Counted"
  "qtyChange"       numeric(18,3) GENERATED ALWAYS AS ("qtyCounted" - "qtyOnHand") STORED,   -- "Change"
  "unitCost"        numeric(18,4) NOT NULL CHECK ("unitCost" >= 0),             -- weighted average at the time
  value            numeric(18,2) GENERATED ALWAYS AS (round(("qtyCounted" - "qtyOnHand") * "unitCost", 2)) STORED,  -- "Value (Rs)"
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "stockAdjustmentLineNoUk" UNIQUE ("tenantId", "adjustmentId", "lineNo"),
  CONSTRAINT "stockAdjustmentLineHeaderFk" FOREIGN KEY ("tenantId", "adjustmentId") REFERENCES "Inventory"."StockAdjustments" ("tenantId", id),
  CONSTRAINT "stockAdjustmentLineItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "stockAdjustmentLineBatchFk" FOREIGN KEY ("tenantId", "itemId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", "itemId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."StockAdjustmentLines"');
CREATE INDEX "stockAdjustmentLineItemIdx" ON "Inventory"."StockAdjustmentLines" ("tenantId", "itemId");

-- #############################################################################
-- FULL EDITION — everything below is not in erp-basic.
-- #############################################################################

-- Full: keep item.lastSaleDate current (dead / slow stock, Report Studio).
CREATE OR REPLACE FUNCTION "Inventory"."triggerStockLedgerLastSale"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "Inventory"."Products" i
     SET "lastSaleDate" = NEW."movementDate"
   WHERE i."tenantId" = NEW."tenantId" AND i.id = NEW."itemId"
     AND (i."lastSaleDate" IS NULL OR i."lastSaleDate" < NEW."movementDate");
  RETURN NULL;
END $$;
CREATE TRIGGER "invStockLedgerLastSale" AFTER INSERT ON "Inventory"."StockMovements"
  FOR EACH ROW WHEN (NEW."movementType" = 'SALE') EXECUTE FUNCTION "Inventory"."triggerStockLedgerLastSale"();

-- ---------------------------------------------------------------------------
-- PrincipalClaims — Companies drawer "Principal claims & schemes":
-- "Claims pending Rs … · 4 claims · oldest 18 days", "Claims settled (YTD)
-- via credit notes". Route: app/inventory/companies · src/9F-products.js (coDrawer)
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."PrincipalClaims" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "claimNo"         text NOT NULL,                                          -- CLM-2026-0041
  "manufacturerId"  uuid NOT NULL,                                          -- the principal claimed against
  "claimDate"       date NOT NULL,
  "claimType"       text NOT NULL,
  description      text,
  "itemId"          uuid,
  "batchId"         uuid,                                                   -- expired / damaged batch returned to principal
  qty              numeric(18,3) CHECK (qty > 0),
  amount           numeric(18,2) NOT NULL CHECK (amount > 0),
  status           text NOT NULL DEFAULT 'PENDING',
  "submittedAt"     timestamptz,
  "settledDate"     date,
  "settledAmount"   numeric(18,2) CHECK ("settledAmount" >= 0),
  "debitNoteId"    uuid,                                                   -- settlement credit (Purchases.DebitNotes, fk file)
  remarks          text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "principalClaimNoUk" UNIQUE ("tenantId", "claimNo"),
  CONSTRAINT "principalClaimSettledChk" CHECK (status <> 'SETTLED' OR ("settledDate" IS NOT NULL AND "settledAmount" IS NOT NULL)),
  CONSTRAINT "principalClaimBatchNeedsItemChk" CHECK ("batchId" IS NULL OR "itemId" IS NOT NULL),
  CONSTRAINT "principalClaimManufacturerFk" FOREIGN KEY ("tenantId", "manufacturerId") REFERENCES "Inventory"."ProductCompanies" ("tenantId", id),
  CONSTRAINT "principalClaimItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "principalClaimBatchFk" FOREIGN KEY ("tenantId", "itemId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", "itemId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."PrincipalClaims"', true);
CREATE INDEX "principalClaimMfrStatusIdx" ON "Inventory"."PrincipalClaims" ("tenantId", "manufacturerId", status, "claimDate");
COMMENT ON TABLE "Inventory"."PrincipalClaims" IS 'Claims against principals (schemes, damages, expiries); settled through a vendor credit (Purchases.DebitNotes).';

-- PrincipalTargets — drawer "Quarterly target 72% · Rs x of Rs y purchased"
CREATE TABLE "Inventory"."PrincipalTargets" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "manufacturerId"  uuid NOT NULL,
  "periodType"      text NOT NULL DEFAULT 'QUARTER',
  "periodStart"     date NOT NULL,
  "periodEnd"       date NOT NULL,
  basis            text NOT NULL DEFAULT 'PURCHASE',
  "targetAmount"    numeric(18,2) NOT NULL CHECK ("targetAmount" > 0),
  "achievedAmount"  numeric(18,2) NOT NULL DEFAULT 0 CHECK ("achievedAmount" >= 0),   -- snapshot refreshed from bills / invoices
  "achievedAt"      timestamptz,
  notes            text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "principalTargetPeriodUk" UNIQUE ("tenantId", "manufacturerId", "periodType", "periodStart"),
  CONSTRAINT "principalTargetPeriodChk" CHECK ("periodEnd" >= "periodStart"),
  CONSTRAINT "principalTargetManufacturerFk" FOREIGN KEY ("tenantId", "manufacturerId") REFERENCES "Inventory"."ProductCompanies" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."PrincipalTargets"', true);
COMMENT ON TABLE "Inventory"."PrincipalTargets" IS 'Purchase (or sales) target per principal per period vs achieved.';

-- ---------------------------------------------------------------------------
-- ProductSuppliers — Product Detail "Suppliers" tab: Supplier, Last price,
-- vs current, Lead time, Last purchase, Share of buying, Preferred.
-- Route: app/inventory/products/view · src/9F-products.js (suppliers)
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."ProductSuppliers" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "itemId"          uuid NOT NULL,
  "vendorId"        uuid NOT NULL,                                          -- Purchases.Vendors (fk file)
  "vendorItemCode" text,
  "lastPrice"       numeric(18,2) CHECK ("lastPrice" >= 0),                  -- "Last price"
  "lastPurchaseDate" date,                                                 -- "Last purchase"
  "leadDays"        integer CHECK ("leadDays" BETWEEN 0 AND 365),            -- "Lead time"
  "sharePct"        numeric(7,4) CHECK ("sharePct" BETWEEN 0 AND 100),       -- "Share of buying"
  "isPreferred"     boolean NOT NULL DEFAULT false,                         -- "Preferred"
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "itemSupplierUk" UNIQUE ("tenantId", "itemId", "vendorId"),
  CONSTRAINT "itemSupplierItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."ProductSuppliers"');
CREATE UNIQUE INDEX "itemSupplierOnePreferredUk" ON "Inventory"."ProductSuppliers" ("tenantId", "itemId") WHERE "isPreferred";
CREATE INDEX "itemSupplierVendorIdx" ON "Inventory"."ProductSuppliers" ("tenantId", "vendorId");
COMMENT ON TABLE "Inventory"."ProductSuppliers" IS 'Vendors that supply an item, with last price, lead time and buying share; one preferred.';

-- ProductPriceLogs — Product Detail "Price History" chart (purchase vs sale,
-- 12 months) and Activity ("Changed retail price to Rs …"). Append-only.
CREATE TABLE "Inventory"."ProductPriceLogs" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "itemId"          uuid NOT NULL,
  "priceField"      text NOT NULL,
  "oldValue"        numeric(18,4),
  "newValue"        numeric(18,4) NOT NULL CHECK ("newValue" >= 0),
  "changedAt"       timestamptz NOT NULL DEFAULT now(),
  "changedByUserId" uuid,
  source           text NOT NULL,
  "priceChangeBatchId" uuid,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "itemPriceHistoryItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "itemPriceHistoryUserFk" FOREIGN KEY ("tenantId", "changedByUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."ProductPriceLogs"');
CREATE TRIGGER "invItemPriceHistoryAppendOnly" BEFORE UPDATE OR DELETE ON "Inventory"."ProductPriceLogs"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();
CREATE INDEX "itemPriceHistoryItemIdx" ON "Inventory"."ProductPriceLogs" ("tenantId", "itemId", "priceField", "changedAt");
COMMENT ON TABLE "Inventory"."ProductPriceLogs" IS 'Every change of cost / retail / wholesale / average cost; feeds the 12-month price chart.';

-- ---------------------------------------------------------------------------
-- BulkPriceUpdates / BulkPriceUpdateLines — "Bulk price update" modal:
-- Apply to (By company / By class / Selected) · Price field (Retail, W. price,
-- Purchase, Retail + W. price) · Change % (quick −10 … +10) · Round to
-- (Rs 1 / 5 / 10 / none) · table Code, Product, Old, New, Change, Margin · Undo.
-- Route: app/inventory/items · src/4B-products.html · src/9F-products.js (bpRender)
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."BulkPriceUpdates" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"           text NOT NULL,                                          -- PCB-2026-000007 (doc type PCB)
  "applyTo"         text NOT NULL,
  "manufacturerId"  uuid,
  "productClassId" uuid,
  "priceField"      text NOT NULL,  -- BOTH = retail + W. price
  "changePct"       numeric(7,4) NOT NULL CHECK ("changePct" <> 0 AND "changePct" > -100),
  "roundTo"         smallint NOT NULL DEFAULT 1 CHECK ("roundTo" IN (0, 1, 5, 10)),           -- 0 = no rounding
  "itemCount"       integer NOT NULL DEFAULT 0 CHECK ("itemCount" >= 0),
  status           text NOT NULL DEFAULT 'DRAFT',
  "appliedAt"       timestamptz,
  "appliedByUserId" uuid,
  "undoneAt"        timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "priceChangeBatchDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "priceChangeBatchTargetChk" CHECK (
       ("applyTo" = 'COMPANY' AND "manufacturerId" IS NOT NULL)
    OR ("applyTo" = 'CLASS'   AND "productClassId" IS NOT NULL)
    OR  "applyTo" = 'SELECTED'),
  CONSTRAINT "priceChangeBatchAppliedChk" CHECK (status = 'DRAFT' OR "appliedAt" IS NOT NULL),
  CONSTRAINT "priceChangeBatchUndoneChk" CHECK (status <> 'UNDONE' OR "undoneAt" IS NOT NULL),
  CONSTRAINT "priceChangeBatchMfrFk" FOREIGN KEY ("tenantId", "manufacturerId") REFERENCES "Inventory"."ProductCompanies" ("tenantId", id),
  CONSTRAINT "priceChangeBatchClassFk" FOREIGN KEY ("tenantId", "productClassId") REFERENCES "Inventory"."ProductClasses" ("tenantId", id),
  CONSTRAINT "priceChangeBatchUserFk" FOREIGN KEY ("tenantId", "appliedByUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."BulkPriceUpdates"', true);
CREATE INDEX "priceChangeBatchListIdx" ON "Inventory"."BulkPriceUpdates" ("tenantId", "createdAt" DESC);
COMMENT ON TABLE "Inventory"."BulkPriceUpdates" IS 'One bulk price update (percentage change with rounding) over a company, a class or a selection.';

ALTER TABLE "Inventory"."ProductPriceLogs"
  ADD CONSTRAINT "itemPriceHistoryBatchFk" FOREIGN KEY ("tenantId", "priceChangeBatchId")
  REFERENCES "Inventory"."BulkPriceUpdates" ("tenantId", id);

CREATE TABLE "Inventory"."BulkPriceUpdateLines" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "batchId"         uuid NOT NULL,
  "itemId"          uuid NOT NULL,
  "priceField"      text NOT NULL,
  "oldValue"        numeric(18,2) NOT NULL CHECK ("oldValue" >= 0),          -- "Old"
  "newValue"        numeric(18,2) NOT NULL CHECK ("newValue" >= 0),          -- "New"
  "changeAmount"    numeric(18,2) GENERATED ALWAYS AS ("newValue" - "oldValue") STORED,   -- "Change"
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "priceChangeLineUk" UNIQUE ("tenantId", "batchId", "itemId", "priceField"),
  CONSTRAINT "priceChangeLineBatchFk" FOREIGN KEY ("tenantId", "batchId") REFERENCES "Inventory"."BulkPriceUpdates" ("tenantId", id),
  CONSTRAINT "priceChangeLineItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."BulkPriceUpdateLines"');
CREATE INDEX "priceChangeLineItemIdx" ON "Inventory"."BulkPriceUpdateLines" ("tenantId", "itemId");

-- ---------------------------------------------------------------------------
-- kit / KitComponents — "Kits & Bundles" (KIT-001 Eid Gift Hamper): bill of
-- materials, component cost roll-up, target margin slider (5–50 %), suggested
-- price, kit selling price, "Can build". Assembled kits are stocked under the
-- kit's own item (kitItemId), so their stock lives in the ledger.
-- Route: app/inventory/kits · src/4B-products.html · src/9F-products.js (P.kits)
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."KitsAndBundles" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code             text NOT NULL CHECK (code ~ '^KIT-\d{3,6}$'),          -- KIT-001 (doc type KIT)
  name             text NOT NULL CHECK (btrim(name) <> ''),                -- "Eid Gift Hamper"
  icon             text NOT NULL DEFAULT 'package-plus',
  tone             text NOT NULL DEFAULT 'green',
  "kitItemId"      uuid NOT NULL,                                          -- sellable SKU holding assembled kits
  "sellingPrice"    numeric(18,2) NOT NULL DEFAULT 0 CHECK ("sellingPrice" >= 0),   -- "Kit selling price"
  "targetMarginPct" numeric(7,4) NOT NULL DEFAULT 25 CHECK ("targetMarginPct" BETWEEN 5 AND 50),   -- "Target margin" slider
  status           text NOT NULL DEFAULT 'ACTIVE',
  "deletedAt"       timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "kitCodeUk" UNIQUE ("tenantId", code),
  CONSTRAINT "kitItemUk" UNIQUE ("tenantId", "kitItemId"),
  CONSTRAINT "kitItemFk" FOREIGN KEY ("tenantId", "kitItemId") REFERENCES "Inventory"."Products" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."KitsAndBundles"', true);
COMMENT ON TABLE "Inventory"."KitsAndBundles" IS 'Kit / bundle definition. Its stock is the stock of kitItemId; cost = Σ component avgCost × qty.';

CREATE TABLE "Inventory"."KitComponents" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "kitId"           uuid NOT NULL,
  "itemId"          uuid NOT NULL,                                          -- "Component"
  "qtyPerKit"      numeric(18,3) NOT NULL CHECK ("qtyPerKit" > 0),         -- "Qty per kit"
  "sortOrder"       integer NOT NULL DEFAULT 0,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "kitComponentUk" UNIQUE ("tenantId", "kitId", "itemId"),
  CONSTRAINT "kitComponentKitFk" FOREIGN KEY ("tenantId", "kitId") REFERENCES "Inventory"."KitsAndBundles" ("tenantId", id),
  CONSTRAINT "kitComponentItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."KitComponents"');
CREATE INDEX "kitComponentItemIdx" ON "Inventory"."KitComponents" ("tenantId", "itemId");

-- A kit cannot contain its own kit item.
CREATE OR REPLACE FUNCTION "Inventory"."triggerKitComponentCheck"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Inventory"."KitsAndBundles" k
              WHERE k."tenantId" = NEW."tenantId" AND k.id = NEW."kitId" AND k."kitItemId" = NEW."itemId") THEN
    RAISE EXCEPTION 'A kit cannot be a component of itself' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "invKitComponentCheck" BEFORE INSERT OR UPDATE OF "kitId", "itemId" ON "Inventory"."KitComponents"
  FOR EACH ROW EXECUTE FUNCTION "Inventory"."triggerKitComponentCheck"();

-- AssemblyVouchers — "Assemble / Disassemble" sheet ("voucher ASM-2026-0311"):
-- Kits to assemble, per component Per kit / Issue (Return) / Before / After.
-- Posting: ASSEMBLE = components ASSEMBLY out + kit ASSEMBLY in at Σ component
-- cost; DISASSEMBLE = the reverse.
CREATE TABLE "Inventory"."AssemblyVouchers" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"           text NOT NULL,                                          -- ASM-2026-000311 (doc type ASM)
  "docDate"         date NOT NULL,
  "kitId"           uuid NOT NULL,
  direction        text NOT NULL,
  "kitQty"          numeric(18,3) NOT NULL CHECK ("kitQty" > 0),             -- "Kits to assemble"
  "warehouseId"     uuid NOT NULL,
  "kitUnitCost"    numeric(18,4) NOT NULL DEFAULT 0 CHECK ("kitUnitCost" >= 0),
  "totalCost"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("totalCost" >= 0),
  status           text NOT NULL DEFAULT 'DRAFT',
  "postedAt"        timestamptz,
  "postedByUserId" uuid,
  "journalEntryId" uuid,                                                   -- only when kit / component GL accounts differ
  remarks          text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "assemblyVoucherDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "assemblyVoucherPostedChk" CHECK (status <> 'POSTED' OR "postedAt" IS NOT NULL),
  CONSTRAINT "assemblyVoucherKitFk" FOREIGN KEY ("tenantId", "kitId") REFERENCES "Inventory"."KitsAndBundles" ("tenantId", id),
  CONSTRAINT "assemblyVoucherWarehouseFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  CONSTRAINT "assemblyVoucherPostedByFk" FOREIGN KEY ("tenantId", "postedByUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."AssemblyVouchers"', true);
CREATE INDEX "assemblyVoucherKitIdx" ON "Inventory"."AssemblyVouchers" ("tenantId", "kitId", "docDate");

CREATE TABLE "Inventory"."AssemblyVoucherLines" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "voucherId"       uuid NOT NULL,
  "lineNo"          smallint NOT NULL CHECK ("lineNo" > 0),
  "itemId"          uuid NOT NULL,                                          -- component
  "batchId"         uuid,
  "qtyPerKit"      numeric(18,3) NOT NULL CHECK ("qtyPerKit" > 0),         -- "Per kit"
  qty              numeric(18,3) NOT NULL CHECK (qty > 0),                 -- "Issue" / "Return" = per kit × kits
  "unitCost"        numeric(18,4) NOT NULL CHECK ("unitCost" >= 0),
  value            numeric(18,2) GENERATED ALWAYS AS (round(qty * "unitCost", 2)) STORED,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "assemblyVoucherLineNoUk" UNIQUE ("tenantId", "voucherId", "lineNo"),
  CONSTRAINT "assemblyVoucherLineHeaderFk" FOREIGN KEY ("tenantId", "voucherId") REFERENCES "Inventory"."AssemblyVouchers" ("tenantId", id),
  CONSTRAINT "assemblyVoucherLineItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "assemblyVoucherLineBatchFk" FOREIGN KEY ("tenantId", "itemId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", "itemId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."AssemblyVoucherLines"');

-- ---------------------------------------------------------------------------
-- BarcodeLabelTemplates / BarcodeLabelJobs / BarcodeLabelJobLines — "Barcode Labels": pick
-- products and copies, template (Thermal 2×1" · 38×25 mm · A4 sheet of 40),
-- options (Show price, Urdu name, Batch / expiry, Company, Carton barcode),
-- Print labels. Route: app/inventory/labels · src/4B-products.html · src/9F-products.js (LB, TPL)
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."BarcodeLabelTemplates" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code             text NOT NULL CHECK (code ~ '^[A-Z0-9_]{2,30}$'),      -- THERMAL_2X1, THERMAL_38X25, A4_40
  name             text NOT NULL,                                          -- "Thermal roll · 2 × 1 inch"
  media            text NOT NULL,
  "widthMm"         numeric(6,2) NOT NULL CHECK ("widthMm" > 0),             -- 50.80 / 38.00 / 52.50
  "heightMm"        numeric(6,2) NOT NULL CHECK ("heightMm" > 0),            -- 25.40 / 25.00 / 29.70
  "labelsPerSheet" smallint CHECK ("labelsPerSheet" > 0),                  -- 40 for A4
  "sheetColumns"    smallint CHECK ("sheetColumns" > 0),                     -- 4
  "sheetRows"       smallint CHECK ("sheetRows" > 0),                        -- 10
  "isSystem"        boolean NOT NULL DEFAULT false,
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "labelTemplateCodeUk" UNIQUE ("tenantId", code),
  CONSTRAINT "labelTemplateSheetChk" CHECK (media <> 'SHEET' OR "labelsPerSheet" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."BarcodeLabelTemplates"');

CREATE TABLE "Inventory"."BarcodeLabelJobs" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "templateId"      uuid NOT NULL,
  "showPrice"       boolean NOT NULL DEFAULT true,                          -- "Show price"
  "showUrduName"   boolean NOT NULL DEFAULT false,                         -- "Urdu name"
  "showBatchExpiry" boolean NOT NULL DEFAULT false,                        -- "Batch / expiry"
  "showCompany"     boolean NOT NULL DEFAULT true,                          -- "Company"
  "useCartonBarcode" boolean NOT NULL DEFAULT false,                       -- "Carton barcode"
  "productCount"    integer NOT NULL DEFAULT 0 CHECK ("productCount" >= 0),
  "totalLabels"     integer NOT NULL DEFAULT 0 CHECK ("totalLabels" >= 0),   -- "24 labels · 3 products"
  "pageCount"       integer CHECK ("pageCount" >= 0),
  source           text NOT NULL DEFAULT 'LABELS',
  status           text NOT NULL DEFAULT 'QUEUED',
  "printedAt"       timestamptz,
  "printedByUserId" uuid,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "labelJobPrintedChk" CHECK (status <> 'PRINTED' OR "printedAt" IS NOT NULL),
  CONSTRAINT "labelJobTemplateFk" FOREIGN KEY ("tenantId", "templateId") REFERENCES "Inventory"."BarcodeLabelTemplates" ("tenantId", id),
  CONSTRAINT "labelJobUserFk" FOREIGN KEY ("tenantId", "printedByUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."BarcodeLabelJobs"');
CREATE INDEX "labelJobListIdx" ON "Inventory"."BarcodeLabelJobs" ("tenantId", "createdAt" DESC);

CREATE TABLE "Inventory"."BarcodeLabelJobLines" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "jobId"           uuid NOT NULL,
  "itemId"          uuid NOT NULL,
  copies           integer NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 500),   -- copies stepper (max 500)
  barcode          text,                                                   -- piece or carton code printed
  "batchId"         uuid,                                                   -- FEFO batch printed when "Batch / expiry" is on
  "printedPrice"    numeric(18,2) CHECK ("printedPrice" >= 0),               -- unit or carton price at print time
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "labelJobLineUk" UNIQUE ("tenantId", "jobId", "itemId"),
  CONSTRAINT "labelJobLineJobFk" FOREIGN KEY ("tenantId", "jobId") REFERENCES "Inventory"."BarcodeLabelJobs" ("tenantId", id),
  CONSTRAINT "labelJobLineItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "labelJobLineBatchFk" FOREIGN KEY ("tenantId", "itemId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", "itemId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."BarcodeLabelJobLines"');
CREATE INDEX "labelJobLineItemIdx" ON "Inventory"."BarcodeLabelJobLines" ("tenantId", "itemId");   -- "Printed 3 times this month"

-- ---------------------------------------------------------------------------
-- StockReservations — stock held for sales-order lines ("Reserved · On 3 open
-- sales orders" on Product Detail; Whole Stock "Reserved" / "Available").
-- Keeps StockBalances.qtyReserved in step (slot: bin NULL, batch as reserved).
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."StockReservations" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "itemId"          uuid NOT NULL,
  "warehouseId"     uuid NOT NULL,
  "batchId"         uuid,
  qty              numeric(18,3) NOT NULL CHECK (qty > 0),
  "salesOrderId"   uuid,                                                   -- Sales.SalesOrders (fk file)
  "salesOrderLineId" uuid,                                                -- Sales.SalesOrderLines (fk file)
  status           text NOT NULL DEFAULT 'ACTIVE',
  "reservedAt"      timestamptz NOT NULL DEFAULT now(),
  "expiresAt"       timestamptz,
  "closedAt"        timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "stockReservationClosedChk" CHECK (status = 'ACTIVE' OR "closedAt" IS NOT NULL),
  CONSTRAINT "stockReservationItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "stockReservationWarehouseFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  CONSTRAINT "stockReservationBatchFk" FOREIGN KEY ("tenantId", "itemId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", "itemId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."StockReservations"');
CREATE INDEX "stockReservationActiveIdx" ON "Inventory"."StockReservations" ("tenantId", "itemId", "warehouseId") WHERE status = 'ACTIVE';
CREATE INDEX "stockReservationSoIdx" ON "Inventory"."StockReservations" ("tenantId", "salesOrderId");
COMMENT ON TABLE "Inventory"."StockReservations" IS 'Reservations of stock for sales-order lines; ACTIVE rows are summed into StockBalances.qtyReserved by trigger.';

CREATE OR REPLACE FUNCTION "Inventory"."triggerStockReservationApply"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    IF OLD.status = 'ACTIVE' THEN
      UPDATE "Inventory"."StockBalances" b
         SET "qtyReserved" = b."qtyReserved" - OLD.qty
       WHERE b."tenantId" = OLD."tenantId" AND b."itemId" = OLD."itemId" AND b."warehouseId" = OLD."warehouseId"
         AND b."binId" IS NULL AND b."batchId" IS NOT DISTINCT FROM OLD."batchId";
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.status = 'ACTIVE' THEN
      INSERT INTO "Inventory"."StockBalances" AS sb ("tenantId", "itemId", "warehouseId", "binId", "batchId", "qtyReserved")
      VALUES (NEW."tenantId", NEW."itemId", NEW."warehouseId", NULL, NEW."batchId", NEW.qty)
      ON CONFLICT ON CONSTRAINT "stockBalanceSlotUk" DO UPDATE
         SET "qtyReserved" = sb."qtyReserved" + EXCLUDED."qtyReserved";
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER "invStockReservationApply" AFTER INSERT OR UPDATE OR DELETE ON "Inventory"."StockReservations"
  FOR EACH ROW EXECUTE FUNCTION "Inventory"."triggerStockReservationApply"();

-- ---------------------------------------------------------------------------
-- StockTransferReceiptLines — "Receive TR-…" sheet: Product, Batch, Sent,
-- Received, Difference (Short n / Excess n / Matched); Sent / Received /
-- Shortage / Excess totals; "variance logged".
-- Route: app/inventory/transfer · src/9G-stock-ops.js (receive)
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."StockTransferReceiptLines" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "transferId"      uuid NOT NULL,
  "transferLineId" uuid NOT NULL,
  "sentQty"         numeric(18,3) NOT NULL CHECK ("sentQty" >= 0),           -- "Sent"
  "receivedQty"     numeric(18,3) NOT NULL CHECK ("receivedQty" >= 0),       -- "Received"
  "varianceQty"     numeric(18,3) GENERATED ALWAYS AS ("receivedQty" - "sentQty") STORED,   -- "Difference"
  "varianceKind"    text GENERATED ALWAYS AS (CASE WHEN "receivedQty" < "sentQty" THEN 'SHORT'
                                                  WHEN "receivedQty" > "sentQty" THEN 'EXCESS'
                                                  ELSE 'MATCHED' END) STORED,
  note             text,
  "receivedAt"      timestamptz NOT NULL DEFAULT now(),
  "receivedByUserId" uuid,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "transferReceiptLineUk" UNIQUE ("tenantId", "transferLineId"),
  CONSTRAINT "transferReceiptLineTransferFk" FOREIGN KEY ("tenantId", "transferId") REFERENCES "Inventory"."StockTransfers" ("tenantId", id),
  CONSTRAINT "transferReceiptLineLineFk" FOREIGN KEY ("tenantId", "transferLineId") REFERENCES "Inventory"."StockTransferLines" ("tenantId", id),
  CONSTRAINT "transferReceiptLineUserFk" FOREIGN KEY ("tenantId", "receivedByUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."StockTransferReceiptLines"', true);
CREATE INDEX "transferReceiptLineTransferIdx" ON "Inventory"."StockTransferReceiptLines" ("tenantId", "transferId");
COMMENT ON TABLE "Inventory"."StockTransferReceiptLines" IS 'Per-line receipt of a transfer: sent vs received; shortages / excesses are adjusted at receipt.';

-- ---------------------------------------------------------------------------
-- StockCounts / StockCountLines — "Stock Count" sessions + 5-step wizard
-- (Scope → Freeze → Count → Variance → Approve). SC-2026-018.
-- Route: app/inventory/count · src/4C-stock-ops.html · src/9G-stock-ops.js
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."StockCounts" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"           text NOT NULL,                                          -- SC-2026-018 (doc type SC)
  name             text NOT NULL,                                          -- "Faisalabad blind count"
  "docDate"         date NOT NULL,
  "warehouseId"     uuid NOT NULL,                                          -- "Where are you counting?"
  "scopeClassIds"  uuid[] NOT NULL DEFAULT '{}',                           -- product classes (empty = all)
  "scopeLabel"      text,                                                   -- "Grocery · Home Care" / "ABC · A items"
  "abcAOnly"       boolean NOT NULL DEFAULT false,                         -- "ABC · A-items only"
  "isBlind"         boolean NOT NULL DEFAULT false,                         -- "Blind count"
  status           text NOT NULL DEFAULT 'DRAFT',
  "frozenAt"        timestamptz,                                            -- "Snapshot frozen at …"
  "ownerUserId"    uuid NOT NULL,                                          -- "Owner"
  "lineCount"       integer NOT NULL DEFAULT 0 CHECK ("lineCount" >= 0),
  "countedCount"    integer NOT NULL DEFAULT 0 CHECK ("countedCount" >= 0),  -- "11/16 lines"
  "shortageValue"   numeric(18,2) NOT NULL DEFAULT 0 CHECK ("shortageValue" >= 0),
  "excessValue"     numeric(18,2) NOT NULL DEFAULT 0 CHECK ("excessValue" >= 0),
  "netVarianceValue" numeric(18,2) GENERATED ALWAYS AS ("excessValue" - "shortageValue") STORED,   -- "Net variance"
  "approverUserId" uuid,
  "approvedAt"      timestamptz,
  "approvalComment" text,                                                   -- "Comment" for the audit trail
  "journalEntryId" uuid,                                                   -- JV-2026-000061 (fk file)
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "stockCountDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "stockCountCountedChk" CHECK ("countedCount" <= "lineCount"),
  CONSTRAINT "stockCountFrozenChk" CHECK (status IN ('DRAFT','CANCELLED') OR "frozenAt" IS NOT NULL),
  CONSTRAINT "stockCountApprovedChk" CHECK (status <> 'APPROVED' OR ("approverUserId" IS NOT NULL AND "approvedAt" IS NOT NULL)),
  CONSTRAINT "stockCountWarehouseFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  CONSTRAINT "stockCountOwnerFk" FOREIGN KEY ("tenantId", "ownerUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "stockCountApproverFk" FOREIGN KEY ("tenantId", "approverUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."StockCounts"', true);
CREATE INDEX "stockCountListIdx" ON "Inventory"."StockCounts" ("tenantId", status, "docDate" DESC);
CREATE INDEX "stockCountWhIdx" ON "Inventory"."StockCounts" ("tenantId", "warehouseId", "docDate");
COMMENT ON TABLE "Inventory"."StockCounts" IS 'Physical stock count session; approval posts COUNT ledger rows and the variance JV (shortage Dr 5160 / Cr 1201, excess Dr 1201 / Cr 4920).';
COMMENT ON COLUMN "Inventory"."StockCounts"."scopeClassIds" IS 'Inventory.ProductClasses ids in scope (array, not FK-checked; validated by the API).';

CREATE TABLE "Inventory"."StockCountLines" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "countId"         uuid NOT NULL,
  "lineNo"          integer NOT NULL CHECK ("lineNo" > 0),
  "itemId"          uuid NOT NULL,
  "batchId"         uuid,
  "expectedQty"     numeric(18,3) NOT NULL,                                 -- "Expected" (frozen book qty; hidden if blind)
  "countedQty"      numeric(18,3) CHECK ("countedQty" >= 0),                 -- "Counted"; NULL = not counted yet
  "varianceQty"     numeric(18,3) GENERATED ALWAYS AS ("countedQty" - "expectedQty") STORED,   -- "Variance"
  "unitCost"        numeric(18,4) NOT NULL CHECK ("unitCost" >= 0),          -- avg cost at freeze
  "varianceValue"   numeric(18,2) GENERATED ALWAYS AS (round(("countedQty" - "expectedQty") * "unitCost", 2)) STORED,   -- "Variance value"
  reason           text,
  "wasUncounted"    boolean NOT NULL DEFAULT false,                         -- "uncounted lines were set to zero"
  "countedAt"       timestamptz,
  "countedByUserId" uuid,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "stockCountLineNoUk" UNIQUE ("tenantId", "countId", "lineNo"),
  CONSTRAINT "stockCountLineSlotUk" UNIQUE NULLS NOT DISTINCT ("tenantId", "countId", "itemId", "batchId"),
  CONSTRAINT "stockCountLineHeaderFk" FOREIGN KEY ("tenantId", "countId") REFERENCES "Inventory"."StockCounts" ("tenantId", id),
  CONSTRAINT "stockCountLineItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "stockCountLineBatchFk" FOREIGN KEY ("tenantId", "itemId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", "itemId", id),
  CONSTRAINT "stockCountLineUserFk" FOREIGN KEY ("tenantId", "countedByUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."StockCountLines"');
CREATE INDEX "stockCountLineItemIdx" ON "Inventory"."StockCountLines" ("tenantId", "itemId");

-- ---------------------------------------------------------------------------
-- StockVouchers / StockVoucherLines — "Stock Vouchers": Breakage (BRK),
-- Gift (GFT), Sample (SMP), Internal Use (INT). Expense account per type
-- (5110-03 Stock Breakage & Write-off · 5220-07 Gifts & Promotions ·
-- 5220-08 Samples & Trials · 5220-03 Stationery & Office Supplies).
-- Route: app/inventory/stock-vouchers · src/44-purchase-docs.html · src/94-purchase-docs.js (SVT)
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."StockVouchers" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "voucherType"     text NOT NULL,
  "docNo"           text NOT NULL,                                          -- BRK-2026-0005 (doc types BRK/GFT/SMP/INT)
  "docDate"         date NOT NULL,                                          -- "Date *"
  "warehouseId"     uuid NOT NULL,                                          -- "Warehouse *"
  "referenceNo"     text,                                                   -- "Reference No" BR-112
  -- BRK
  "breakageReason"  text,   -- "Reason / Type *"
  "employeeId"      uuid,                                                   -- "Employee / Person" (HumanResources.Employees, fk file)
  -- GFT
  "recipientName"   text,                                                   -- "Guest / Recipient *"
  occasion         text,
  -- SMP
  "customerId"      uuid,                                                   -- "Customer / Prospect *" (Sales.Customers, fk file)
  "salesmanEmployeeId" uuid,                                               -- "Salesperson"
  "isReturnable"    boolean NOT NULL DEFAULT false,                         -- "Expect samples back in 14 days"
  "returnDueDate"  date,
  -- INT
  "departmentId"    uuid,                                                   -- "Department *" (HumanResources.Departments, fk file)
  "costCentreId"   uuid,                                                   -- "Cost centre" (Accounting.CostCentres, fk file)
  "requestedByEmployeeId" uuid,                                           -- "Requested by"
  -- common
  "expenseAccountId" uuid NOT NULL,                                        -- "Account Code" for the type (Accounting.ChartOfAccounts, fk file)
  remarks          text,
  status           text NOT NULL DEFAULT 'DRAFT',
  "totalItems"      integer NOT NULL DEFAULT 0 CHECK ("totalItems" >= 0),
  "totalQty"        numeric(18,3) NOT NULL DEFAULT 0 CHECK ("totalQty" >= 0),
  "totalAmount"     numeric(18,2) NOT NULL DEFAULT 0 CHECK ("totalAmount" >= 0),
  "postedAt"        timestamptz,
  "postedByUserId" uuid,
  "journalEntryId" uuid,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "stockVoucherDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "stockVoucherBrkChk" CHECK ("voucherType" <> 'BRK' OR "breakageReason" IS NOT NULL),
  CONSTRAINT "stockVoucherGftChk" CHECK ("voucherType" <> 'GFT' OR "recipientName" IS NOT NULL),
  CONSTRAINT "stockVoucherSmpChk" CHECK ("voucherType" <> 'SMP' OR "customerId" IS NOT NULL),
  CONSTRAINT "stockVoucherIntChk" CHECK ("voucherType" <> 'INT' OR "departmentId" IS NOT NULL),
  CONSTRAINT "stockVoucherReturnChk" CHECK (NOT "isReturnable" OR ("voucherType" = 'SMP' AND "returnDueDate" IS NOT NULL)),
  CONSTRAINT "stockVoucherPostedChk" CHECK (status <> 'POSTED' OR "postedAt" IS NOT NULL),
  CONSTRAINT "stockVoucherWarehouseFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id),
  CONSTRAINT "stockVoucherPostedByFk" FOREIGN KEY ("tenantId", "postedByUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."StockVouchers"', true);
CREATE INDEX "stockVoucherListIdx" ON "Inventory"."StockVouchers" ("tenantId", "docDate" DESC, "voucherType");
CREATE INDEX "stockVoucherStatusIdx" ON "Inventory"."StockVouchers" ("tenantId", status);
COMMENT ON TABLE "Inventory"."StockVouchers" IS 'Breakage / gift / sample / internal-use issues of stock; post BREAKAGE / GIFT / SAMPLE / INTERNAL_USE rows and Dr expense / Cr inventory.';

CREATE TABLE "Inventory"."StockVoucherLines" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "voucherId"       uuid NOT NULL,
  "lineNo"          smallint NOT NULL CHECK ("lineNo" > 0),
  "itemId"          uuid NOT NULL,                                          -- "Product *"
  "batchId"         uuid,                                                   -- resolved batch
  "lotNo"           text,                                                   -- "Batch / Lot" as typed
  "expiryMonth"     date,                                                   -- "Expiry" (month input; first of month)
  "uomId"           uuid NOT NULL,                                          -- "UOM" Pcs / Carton
  "uomFactor"       numeric(18,6) NOT NULL DEFAULT 1 CHECK ("uomFactor" > 0),
  qty              numeric(18,3) NOT NULL CHECK (qty > 0),                 -- "Qty *" in the chosen UOM
  "baseQty"         numeric(18,3) GENERATED ALWAYS AS (round(qty * "uomFactor", 3)) STORED,
  rate             numeric(18,2) NOT NULL CHECK (rate >= 0),               -- "Rate" (cost per UOM)
  amount           numeric(18,2) GENERATED ALWAYS AS (round(qty * rate, 2)) STORED,   -- "Amount"
  remark           text,                                                   -- "Remark"
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "stockVoucherLineNoUk" UNIQUE ("tenantId", "voucherId", "lineNo"),
  CONSTRAINT "stockVoucherLineHeaderFk" FOREIGN KEY ("tenantId", "voucherId") REFERENCES "Inventory"."StockVouchers" ("tenantId", id),
  CONSTRAINT "stockVoucherLineItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "stockVoucherLineBatchFk" FOREIGN KEY ("tenantId", "itemId", "batchId") REFERENCES "Inventory"."ProductBatches" ("tenantId", "itemId", id),
  CONSTRAINT "stockVoucherLineUomFk" FOREIGN KEY ("tenantId", "uomId") REFERENCES "Inventory"."UnitsOfMeasure" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."StockVoucherLines"');
CREATE INDEX "stockVoucherLineItemIdx" ON "Inventory"."StockVoucherLines" ("tenantId", "itemId");

-- ---------------------------------------------------------------------------
-- ReorderRules — per item (optionally per warehouse) planning parameters for
-- "Reorder Suggestions": low / high, lead time (14 d), safety cover (+14 d),
-- alert when cover < 21 days. Route: app/inventory/demand · src/9G-stock-ops.js (REORDER)
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."ReorderRules" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "itemId"          uuid NOT NULL,
  "warehouseId"     uuid,                                                   -- NULL = all locations
  "lowLevel"        numeric(18,3) NOT NULL CHECK ("lowLevel" >= 0),
  "highLevel"       numeric(18,3) NOT NULL CHECK ("highLevel" >= 0),
  "leadDays"        integer NOT NULL DEFAULT 14 CHECK ("leadDays" BETWEEN 0 AND 365),
  "safetyDays"      integer NOT NULL DEFAULT 14 CHECK ("safetyDays" BETWEEN 0 AND 365),
  "coverAlertDays" integer NOT NULL DEFAULT 21 CHECK ("coverAlertDays" BETWEEN 0 AND 365),
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "reorderRuleUk" UNIQUE NULLS NOT DISTINCT ("tenantId", "itemId", "warehouseId"),
  CONSTRAINT "reorderRuleLevelsChk" CHECK ("lowLevel" <= "highLevel"),
  CONSTRAINT "reorderRuleItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "reorderRuleWarehouseFk" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "Inventory"."Warehouses" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."ReorderRules"');
COMMENT ON TABLE "Inventory"."ReorderRules" IS 'Planning overrides; without a rule the item low/high levels, lead 14 d, safety 14 d and alert 21 d apply.';

-- ---------------------------------------------------------------------------
-- demand / GoodsDemandLines — "Demand of Goods" (DNO 12 → DMD-2026-00012):
-- Supplier Name * (the principal), DNO, Date, Prepared By, grid Product Name,
-- Company, CTN, Rate, Qty, Bonus, % Disc., Discount, Amount; Total Items /
-- Quantity / Bonus / Grand Amount; Notes (500); F-keys; Raise PO.
-- Route: app/inventory/demand · src/4C-stock-ops.html · src/9G-stock-ops.js
-- ---------------------------------------------------------------------------
CREATE TABLE "Inventory"."GoodsDemands" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"           text NOT NULL,                                          -- DMD-2026-00012 (doc type DMD)
  "docDate"         date NOT NULL,                                          -- "Date *"
  "manufacturerId"  uuid NOT NULL,                                          -- "Supplier Name *" = principal
  "vendorId"        uuid,                                                   -- filled when it becomes a PO (Purchases.Vendors, fk file)
  "preparedByUserId" uuid NOT NULL,                                       -- "Prepared By"
  source           text NOT NULL DEFAULT 'MANUAL',   -- "Send to demand" / "Import Lines"
  notes            text CHECK (char_length(notes) <= 500),                 -- "Notes" 0/500
  status           text NOT NULL DEFAULT 'DRAFT',
  "totalItems"      integer NOT NULL DEFAULT 0 CHECK ("totalItems" >= 0),
  "totalQty"        numeric(18,3) NOT NULL DEFAULT 0 CHECK ("totalQty" >= 0),
  "totalBonus"      numeric(18,3) NOT NULL DEFAULT 0 CHECK ("totalBonus" >= 0),
  "grossAmount"     numeric(18,2) NOT NULL DEFAULT 0 CHECK ("grossAmount" >= 0),
  "discountAmount"  numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  "netAmount"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("netAmount" >= 0),   -- "Grand Amount"
  "purchaseOrderId" uuid,                                                  -- Purchases.PurchaseOrders (fk file)
  "orderedAt"       timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "demandDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "demandAmountsChk" CHECK ("netAmount" = "grossAmount" - "discountAmount"),
  CONSTRAINT "demandOrderedChk" CHECK (status <> 'ORDERED' OR ("purchaseOrderId" IS NOT NULL AND "orderedAt" IS NOT NULL)),
  CONSTRAINT "demandManufacturerFk" FOREIGN KEY ("tenantId", "manufacturerId") REFERENCES "Inventory"."ProductCompanies" ("tenantId", id),
  CONSTRAINT "demandPreparedByFk" FOREIGN KEY ("tenantId", "preparedByUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."GoodsDemands"', true);
CREATE INDEX "demandListIdx" ON "Inventory"."GoodsDemands" ("tenantId", "docDate" DESC);
CREATE INDEX "demandMfrStatusIdx" ON "Inventory"."GoodsDemands" ("tenantId", "manufacturerId", status);
COMMENT ON TABLE "Inventory"."GoodsDemands" IS 'Demand of goods to a principal; converted into a purchase order.';

CREATE TABLE "Inventory"."GoodsDemandLines" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "demandId"        uuid NOT NULL,
  "lineNo"          smallint NOT NULL CHECK ("lineNo" > 0),
  "itemId"          uuid NOT NULL,                                          -- "Product Name *"
  "manufacturerId"  uuid,                                                   -- "Company" (defaults to item company)
  "ctnSize"         integer NOT NULL CHECK ("ctnSize" >= 1),                 -- item.ctn at the time
  "qtyCtn"          numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyCtn" >= 0),  -- "CTN" (may be fractional: Qty / ctn)
  "baseQty"         numeric(18,3) NOT NULL CHECK ("baseQty" > 0),            -- "Qty" (base units; "Every line needs a quantity")
  "bonusQty"        numeric(18,3) NOT NULL DEFAULT 0 CHECK ("bonusQty" >= 0),   -- "Bonus"
  rate             numeric(18,2) NOT NULL DEFAULT 0 CHECK (rate >= 0),     -- "Rate"
  "discountPct"     numeric(7,4) NOT NULL DEFAULT 0 CHECK ("discountPct" BETWEEN 0 AND 100),   -- "% Disc."
  "grossAmount"     numeric(18,2) GENERATED ALWAYS AS (round(rate * "baseQty", 2)) STORED,
  "discountAmount"  numeric(18,2) GENERATED ALWAYS AS (round(rate * "baseQty" * "discountPct" / 100, 2)) STORED,   -- "Discount"
  "netAmount"       numeric(18,2) GENERATED ALWAYS AS (round(rate * "baseQty", 2) - round(rate * "baseQty" * "discountPct" / 100, 2)) STORED,  -- "Amount"
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "demandLineNoUk" UNIQUE ("tenantId", "demandId", "lineNo"),
  CONSTRAINT "demandLineHeaderFk" FOREIGN KEY ("tenantId", "demandId") REFERENCES "Inventory"."GoodsDemands" ("tenantId", id),
  CONSTRAINT "demandLineItemFk" FOREIGN KEY ("tenantId", "itemId") REFERENCES "Inventory"."Products" ("tenantId", id),
  CONSTRAINT "demandLineMfrFk" FOREIGN KEY ("tenantId", "manufacturerId") REFERENCES "Inventory"."ProductCompanies" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Inventory"."GoodsDemandLines"');
CREATE INDEX "demandLineItemIdx" ON "Inventory"."GoodsDemandLines" ("tenantId", "itemId");
COMMENT ON COLUMN "Inventory"."GoodsDemandLines"."qtyCtn" IS 'Display cartons = baseQty / ctnSize (Qty and CTN are kept in step by the grid).';
