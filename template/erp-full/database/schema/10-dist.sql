-- =============================================================================
-- Finsoft ERP (FULL) — 10-dist.sql
-- Wholesale & distribution. FULL EDITION ONLY (no counterpart in erp-basic).
--
-- Screens (all under "Wholesale & Distribution"):
--   app/wholesale/entry       Quick Wholesale Entry   src/4D-wholesale.html  + src/9H-wholesale.js
--   app/wholesale/bulk        Bulk Invoicing          src/4D-wholesale.html  + src/9H-wholesale.js
--   app/wholesale/bookings    Order Bookings          src/4D-wholesale.html  + src/9H-wholesale.js
--   app/wholesale/backorders  Back-orders             src/4D-wholesale.html  + src/9H-wholesale.js
--   app/wholesale/load-sheet  Load Sheets             src/4E-distribution.html + src/9I-distribution.js
--   app/wholesale/settlement  Route Settlement        src/4E-distribution.html + src/9I-distribution.js
--   app/wholesale/recovery    Recovery Sheet          src/4E-distribution.html + src/9I-distribution.js
--   app/wholesale/routes      Routes & Salesmen       src/4E-distribution.html + src/9I-distribution.js
--   Seed data: src/91-data.js (routes, shops, priceTiers, schemes, salesTeam)
--
-- Design decisions (binding, see CONTRACT.md):
--   * Invoices are NOT stored here. Quick Entry, Bulk Invoicing, booking and
--     back-order conversion all write Sales.SalesInvoices (channel 'WHOLESALE',
--     WS-2026-000231) + Sales.SalesInvoiceLines. Load sheets / settlement / recovery
--     reference that one table (INV-2026-001180 on a load sheet is the same table).
--   * A shop (SHP-001) is a Sales.Customers row; Distribution.ShopRouteProfiles carries its
--     distribution profile (route, area, price tier, visit seq, GPS pin, target).
--   * Booker / salesman / driver (deliveryman) / supervisor are HumanResources.Employees FKs;
--     a van is a Distribution.Vans FK. The seed's free-text names become FKs.
--   * Cross-module FKs (sales, inv, purchase, hr, acc, treasury) are added in
--     database/fk/10-dist-fks.sql. Only core/platform/dist FKs are inline here.
--
-- Helper tables added inside dist (not in the contract registry):
--   Distribution.PriceTiers         Retailer ×1.00 / Wholesaler ×0.95 / Distributor ×0.90
--                           (91-data.js priceTiers) + back-order priority rank
--   Distribution.BulkInvoiceRunCells  one shop × product cell of the Bulk Invoicing matrix
-- =============================================================================


-- =============================================================================
-- 1. MASTERS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- priceTier — app/wholesale/entry (tier chip + tier menu "Retailer ×1.00"),
-- app/wholesale/bulk (tier chip per shop), app/wholesale/backorders
-- ("Priority tier" policy ranks Distributor 0, Wholesaler 1, Retailer 2).
-- Source: src/91-data.js D.priceTiers; src/9H-wholesale.js tierRate(), allocPlan().
-- tier rate = item wholesale price × rateFactor.
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."PriceTiers" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code             text NOT NULL,
  name             text NOT NULL,                                  -- Retailer / Wholesaler / Distributor
  "rateFactor"      numeric(7,4) NOT NULL CHECK ("rateFactor" > 0 AND "rateFactor" <= 2),   -- 1.0000 / 0.9500 / 0.9000
  "allocationRank"  smallint NOT NULL CHECK ("allocationRank" >= 0),  -- 0 = served first under PRIORITY policy
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."PriceTiers"', true);
COMMENT ON TABLE  "Distribution"."PriceTiers" IS 'Wholesale price tiers. Rate = item wholesale price × rateFactor. Source: 91-data.js priceTiers; 9H-wholesale.js tierRate().';
COMMENT ON COLUMN "Distribution"."PriceTiers"."allocationRank" IS 'Order used by the back-order "Priority tier" allocation policy (lower first).';

-- ---------------------------------------------------------------------------
-- area — shop area shown everywhere a shop appears ("SHP-004 · DHA · RT-01"):
-- app/wholesale/entry shop card, bookings "Shop" column, recovery sheet,
-- routes board ("Anarkali · Retailer"). Source: 91-data.js areas[].
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."ShopAreas" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "branchId"        uuid,
  code             text,
  name             text NOT NULL,                                  -- Anarkali, Gulberg, DHA, Cantt, Johar Town …
  city             text,                                           -- Lahore
  status           text NOT NULL DEFAULT 'ACTIVE',
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  UNIQUE ("tenantId", id),
  CONSTRAINT "areaBranchIdFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."ShopAreas"');
CREATE UNIQUE INDEX "areaTenantCodeUq" ON "Distribution"."ShopAreas" ("tenantId", code) WHERE code IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "areaTenantNameUq" ON "Distribution"."ShopAreas" ("tenantId", lower(name), lower(COALESCE(city, ''))) WHERE "deletedAt" IS NULL;
COMMENT ON TABLE "Distribution"."ShopAreas" IS 'Sales areas a shop belongs to (Anarkali, Gulberg, DHA …). Source: 91-data.js areas; shown on every shop row in 9H/9I.';

-- ---------------------------------------------------------------------------
-- vehicle — app/wholesale/load-sheet "Vehicle (van no)" select, van capacity
-- card ("LEA-2290 · Suzuki Ravi · 70 ctn / 850 kg"), gate pass (Vehicle,
-- Model); app/wholesale/routes route card "Van"; New route sheet "Van".
-- Source: 9I-distribution.js VANS{}. Linked to an Inventory.Warehouses of type VAN
-- so van stock is a real stock location.
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."Vans" (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                  uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "branchId"                  uuid,
  "regNo"                     citext NOT NULL CHECK (length(btrim("regNo"::text)) BETWEEN 3 AND 20),  -- LES-4471
  model                      text NOT NULL,                        -- Hyundai Shehzore / Suzuki Ravi / Isuzu NKR 3-ton
  "capacityCtn"               numeric(10,2) NOT NULL CHECK ("capacityCtn" > 0),   -- 80
  "capacityKg"                numeric(10,2) NOT NULL CHECK ("capacityKg" > 0),    -- 1000
  "warehouseId"               uuid,                                 -- Inventory.Warehouses (type VAN) — fk file + trigger
  "defaultDriverEmployeeId" uuid,                                 -- HumanResources.Employees — fk file
  status                     text NOT NULL DEFAULT 'ACTIVE',
  remarks                    text,
  "createdAt"                 timestamptz NOT NULL DEFAULT now(),
  "createdBy"                 uuid,
  "updatedAt"                 timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                 uuid,
  "rowVersion"                integer NOT NULL DEFAULT 0,
  "deletedAt"                 timestamptz,
  UNIQUE ("tenantId", id),
  CONSTRAINT "vehicleBranchIdFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."Vans"', true);
CREATE UNIQUE INDEX "vehicleTenantRegUq" ON "Distribution"."Vans" ("tenantId", "regNo") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "vehicleTenantWarehouseUq" ON "Distribution"."Vans" ("tenantId", "warehouseId") WHERE "warehouseId" IS NOT NULL AND "deletedAt" IS NULL;
COMMENT ON TABLE  "Distribution"."Vans" IS 'Delivery vans. Capacity drives the load-sheet capacity meters (cartons and kg). Source: 9I-distribution.js VANS.';
COMMENT ON COLUMN "Distribution"."Vans"."warehouseId" IS 'The van''s own stock location (Inventory.Warehouses.type = VAN). Dispatch transfers the load into it.';

-- The linked warehouse must be a VAN location. plpgsql + record: Inventory.Warehouses
-- is defined in 09-inv.sql, and the FK itself lives in the fk file.
CREATE OR REPLACE FUNCTION "Distribution"."triggerVehicleVanWarehouse"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vWh" record;
BEGIN
  IF NEW."warehouseId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT w.type INTO "vWh"
    FROM "Inventory"."Warehouses" w
   WHERE w."tenantId" = NEW."tenantId" AND w.id = NEW."warehouseId";
  IF FOUND AND "vWh".type IS DISTINCT FROM 'VAN' THEN
    RAISE EXCEPTION 'Vehicle % must be linked to a warehouse of type VAN (got %)', NEW."regNo", "vWh".type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "distVehicleVanWarehouse" BEFORE INSERT OR UPDATE OF "warehouseId" ON "Distribution"."Vans"
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerVehicleVanWarehouse"();

-- ---------------------------------------------------------------------------
-- route — app/wholesale/routes route cards (RT-01 · Lahore Central, Booker,
-- Salesman, Van, Driver), "New route" sheet (Route code, Route name *,
-- Booker, Salesman, Van, Driver, Visit days); route selects on entry, bulk,
-- bookings, load sheet, recovery. Source: 91-data.js D.routes.
-- Supervisor: src/43-sales-docs.html team block (salesTeam.supervisors).
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."Routes" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "branchId"               uuid,
  code                    text NOT NULL CHECK (code ~ '^RT-[0-9]{2,4}$'),   -- RT-01
  name                    text NOT NULL,                                     -- Lahore Central
  "sourceWarehouseId"     uuid,           -- "Stops in visit order from Lahore HQ Warehouse" — Inventory.Warehouses (fk file)
  "bookerEmployeeId"      uuid,           -- HumanResources.Employees (fk file)
  "salesmanEmployeeId"    uuid,           -- HumanResources.Employees (fk file)
  "driverEmployeeId"      uuid,           -- deliveryman — HumanResources.Employees (fk file)
  "supervisorEmployeeId"  uuid,           -- HumanResources.Employees (fk file)
  "vehicleId"              uuid,
  status                  text NOT NULL DEFAULT 'ACTIVE',
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  "deletedAt"              timestamptz,
  UNIQUE ("tenantId", id),
  CONSTRAINT "routeBranchIdFk"  FOREIGN KEY ("tenantId", "branchId")  REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "routeVehicleIdFk" FOREIGN KEY ("tenantId", "vehicleId") REFERENCES "Distribution"."Vans" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."Routes"', true);
CREATE UNIQUE INDEX "routeTenantCodeUq" ON "Distribution"."Routes" ("tenantId", code) WHERE "deletedAt" IS NULL;
CREATE INDEX "routeTenantSalesmanIdx" ON "Distribution"."Routes" ("tenantId", "salesmanEmployeeId");
CREATE INDEX "routeTenantBookerIdx"   ON "Distribution"."Routes" ("tenantId", "bookerEmployeeId");
COMMENT ON TABLE "Distribution"."Routes" IS 'Distribution beat (RT-01). People are HumanResources.Employees FKs; van is Distribution.Vans. Source: 91-data.js routes; 9I renderRoutes/rtNewRoute.';

-- ---------------------------------------------------------------------------
-- RouteVisitDays — visit days: route card day chips (Mon…Sun toggles, "A route
-- needs at least one visit day"), load sheet "On-beat day / Off-beat",
-- bulk invoicing route pill "Mon · Thu". Source: 91-data.js routes[].days.
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."RouteVisitDays" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "routeId"         uuid NOT NULL,
  weekday          text NOT NULL,
  "isoDow"          smallint GENERATED ALWAYS AS (
                     CASE weekday WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3 WHEN 'THU' THEN 4
                                  WHEN 'FRI' THEN 5 WHEN 'SAT' THEN 6 ELSE 7 END) STORED,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", id, "routeId"),
  UNIQUE ("tenantId", "routeId", weekday),
  CONSTRAINT "routeDayRouteIdFk" FOREIGN KEY ("tenantId", "routeId") REFERENCES "Distribution"."Routes" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."RouteVisitDays"');
COMMENT ON TABLE  "Distribution"."RouteVisitDays" IS 'Visit days of a route (Mon/Thu). isoDow matches extract(isodow from date).';

-- ---------------------------------------------------------------------------
-- ShopRouteProfiles — distribution profile of a shop (a Sales.Customers row).
-- app/wholesale/routes shop board (drag shop between routes: routeId),
-- shop cards "Anarkali · Retailer", map pins; app/wholesale/entry shop card
-- (code · area · route, tier chip); bookings GPS check ("within 25 m of the
-- saved shop pin"); recovery sheet target per shop. Source: 91-data.js shops.
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."ShopRouteProfiles" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "customerId"             uuid NOT NULL,              -- Sales.Customers (fk file) — SHP-001
  "routeId"                uuid NOT NULL,
  "areaId"                 uuid,
  "priceTier"              text NOT NULL DEFAULT 'RETAILER',
  "visitSeq"               integer CHECK ("visitSeq" > 0),        -- default position on the beat
  "geoLat"                 numeric(9,6) CHECK ("geoLat" BETWEEN -90 AND 90),     -- [simulated] pin
  "geoLng"                 numeric(9,6) CHECK ("geoLng" BETWEEN -180 AND 180),
  "gpsToleranceM"         integer NOT NULL DEFAULT 25 CHECK ("gpsToleranceM" > 0),
  "recoveryTargetAmount"  numeric(18,2) CHECK ("recoveryTargetAmount" >= 0),   -- recovery sheet ring "Target"
  "isActive"               boolean NOT NULL DEFAULT true,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "customerId"),                       -- a shop is on exactly one beat
  UNIQUE ("tenantId", "customerId", "routeId"),             -- target of RouteStops FK
  CONSTRAINT "customerRouteRouteIdFk"   FOREIGN KEY ("tenantId", "routeId")   REFERENCES "Distribution"."Routes" ("tenantId", id),
  CONSTRAINT "customerRouteAreaIdFk"    FOREIGN KEY ("tenantId", "areaId")    REFERENCES "Distribution"."ShopAreas" ("tenantId", id),
  CONSTRAINT "customerRoutePriceTierFk" FOREIGN KEY ("tenantId", "priceTier") REFERENCES "Distribution"."PriceTiers" ("tenantId", code),
  CONSTRAINT "customerRouteGeoPairChk"  CHECK (("geoLat" IS NULL) = ("geoLng" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"Distribution"."ShopRouteProfiles"', true);
CREATE INDEX "customerRouteTenantRouteIdx" ON "Distribution"."ShopRouteProfiles" ("tenantId", "routeId", "visitSeq");
CREATE INDEX "customerRouteTenantAreaIdx"  ON "Distribution"."ShopRouteProfiles" ("tenantId", "areaId");
COMMENT ON TABLE  "Distribution"."ShopRouteProfiles" IS 'Distribution profile of a shop (Sales.Customers): route, area, price tier, visit seq, GPS pin, recovery target.';
COMMENT ON COLUMN "Distribution"."ShopRouteProfiles"."priceTier" IS 'Mirrors Sales.Customers.priceTier; the profile value drives wholesale rates.';
COMMENT ON COLUMN "Distribution"."ShopRouteProfiles"."geoLat" IS '[simulated] Saved shop pin. Booking GPS check compares the booker location against it.';

-- ---------------------------------------------------------------------------
-- RouteStops — the sequenced beat: app/wholesale/routes "Route map" stops list
-- ("1 Bismillah Traders … 09:00"), "Optimise stop order". A stop may be
-- specific to one visit day (routeDayId) or apply to every visit day (NULL).
-- The composite FK to ShopRouteProfiles guarantees the stop's route is the shop's
-- assigned route (moving a shop = delete its stops, update ShopRouteProfiles).
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."RouteStops" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "routeId"         uuid NOT NULL,
  "routeDayId"     uuid,
  "customerId"      uuid NOT NULL,
  "stopSeq"         integer NOT NULL CHECK ("stopSeq" > 0),
  "plannedEta"      time,                                            -- 09:00, 09:35 …
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "routeStopRouteIdFk"     FOREIGN KEY ("tenantId", "routeId") REFERENCES "Distribution"."Routes" ("tenantId", id),
  CONSTRAINT "routeStopRouteDayIdFk" FOREIGN KEY ("tenantId", "routeDayId", "routeId") REFERENCES "Distribution"."RouteVisitDays" ("tenantId", id, "routeId"),
  CONSTRAINT "routeStopAssignmentFk"   FOREIGN KEY ("tenantId", "customerId", "routeId") REFERENCES "Distribution"."ShopRouteProfiles" ("tenantId", "customerId", "routeId")
);
SELECT "Company"."addStandardTriggers"('"Distribution"."RouteStops"');
CREATE UNIQUE INDEX "routeStopSeqUq" ON "Distribution"."RouteStops"
  ("tenantId", "routeId", COALESCE("routeDayId", '00000000-0000-0000-0000-000000000000'::uuid), "stopSeq");
CREATE UNIQUE INDEX "routeStopCustomerUq" ON "Distribution"."RouteStops"
  ("tenantId", "routeId", COALESCE("routeDayId", '00000000-0000-0000-0000-000000000000'::uuid), "customerId");
COMMENT ON TABLE "Distribution"."RouteStops" IS 'Ordered stops of a route (map + stop list with ETA). routeDayId NULL = every visit day.';


-- =============================================================================
-- 2. QUICK WHOLESALE ENTRY — app/wholesale/entry
--    (the invoice itself is Sales.SalesInvoices channel WHOLESALE)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- HeldBills — "Hold" / "Recall (1)" buttons and the credit modal's "Hold bill".
-- 9H-wholesale.js hold()/recall(): parks the grid with shop, lines and time
-- ("parked 10:52"); E.held seed carries WS-2026-000229 as the reserved number.
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."HeldBills" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "branchId"             uuid,
  "provisionalNo"        text,                               -- WS-2026-000229 shown when parked (not consumed)
  "docDate"              date NOT NULL,
  "customerId"           uuid NOT NULL,                      -- Sales.Customers (fk file)
  "routeId"              uuid,
  "salesmanEmployeeId"  uuid,                               -- "Salesman / Booker" select — HumanResources.Employees (fk file)
  "warehouseId"          uuid,                               -- Inventory.Warehouses (fk file)
  "priceTier"            text NOT NULL,
  "rateEntryMode"       text NOT NULL DEFAULT 'PCS',   -- Rate CTN/PCS toggle
  "holdReason"           text NOT NULL DEFAULT 'MANUAL',
  "lineCount"            integer NOT NULL DEFAULT 0 CHECK ("lineCount" >= 0),
  "totalCtn"             numeric(18,3) NOT NULL DEFAULT 0 CHECK ("totalCtn" >= 0),
  "totalLoose"           numeric(18,3) NOT NULL DEFAULT 0 CHECK ("totalLoose" >= 0),
  "grossAmount"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("grossAmount" >= 0),
  "schemeAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("schemeAmount" >= 0),
  "discountAmount"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  "taxAmount"            numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "netAmount"            numeric(18,2) NOT NULL DEFAULT 0 CHECK ("netAmount" >= 0),
  status                text NOT NULL DEFAULT 'HELD',
  "heldAt"               timestamptz NOT NULL DEFAULT now(),
  "heldByUserId"       uuid,
  "recalledAt"           timestamptz,
  "recalledByUserId"   uuid,
  remarks               text,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "heldBillBranchIdFk"        FOREIGN KEY ("tenantId", "branchId")           REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "heldBillRouteIdFk"         FOREIGN KEY ("tenantId", "routeId")            REFERENCES "Distribution"."Routes" ("tenantId", id),
  CONSTRAINT "heldBillPriceTierFk"       FOREIGN KEY ("tenantId", "priceTier")          REFERENCES "Distribution"."PriceTiers" ("tenantId", code),
  CONSTRAINT "heldBillHeldByFk"          FOREIGN KEY ("tenantId", "heldByUserId")     REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "heldBillRecalledByFk"      FOREIGN KEY ("tenantId", "recalledByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "heldBillNetChk"             CHECK ("netAmount" = "grossAmount" - "discountAmount" + "taxAmount"),
  CONSTRAINT "heldBillRecalledChk"        CHECK (status <> 'RECALLED' OR "recalledAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."HeldBills"');
CREATE INDEX "heldBillTenantOpenIdx" ON "Distribution"."HeldBills" ("tenantId", "heldByUserId", "heldAt" DESC) WHERE status = 'HELD';
CREATE INDEX "heldBillTenantCustomerIdx" ON "Distribution"."HeldBills" ("tenantId", "customerId");
COMMENT ON TABLE "Distribution"."HeldBills" IS 'Parked (held) wholesale bills: Hold / Recall on Quick Wholesale Entry. Nothing posts; recall reloads the grid.';

-- HeldBillLines — grid columns: SKU / Product, CTN, PCS, Total Pcs, Rate,
-- Scheme, Disc %, GST %, Amount (+ "Manual rate" flag, scheme free line).
CREATE TABLE "Distribution"."HeldBillLines" (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"         uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "heldBillId"      uuid NOT NULL,
  "lineNo"           smallint NOT NULL CHECK ("lineNo" > 0),
  "itemId"           uuid NOT NULL,                          -- Inventory.Products (fk file)
  "unitsPerCtn"     numeric(18,3) NOT NULL DEFAULT 1 CHECK ("unitsPerCtn" >= 1),   -- "Ctn 144"
  "qtyCtn"           numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyCtn" >= 0),
  "qtyLoose"         numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyLoose" >= 0),
  "baseQty"          numeric(18,3) GENERATED ALWAYS AS ("qtyCtn" * "unitsPerCtn" + "qtyLoose") STORED,  -- Total Pcs
  "bonusQty"         numeric(18,3) NOT NULL DEFAULT 0 CHECK ("bonusQty" >= 0),        -- scheme free pieces
  "schemeId"         uuid,                                   -- Sales.SalesSchemes (fk file) "Buy 10 get 1"
  rate              numeric(18,4) NOT NULL CHECK (rate >= 0),                       -- per piece
  "isManualRate"    boolean NOT NULL DEFAULT false,
  "discountPct"      numeric(7,4) NOT NULL DEFAULT 0 CHECK ("discountPct" BETWEEN 0 AND 100),
  "taxRate"          numeric(7,4) NOT NULL DEFAULT 0 CHECK ("taxRate" BETWEEN 0 AND 100),
  "grossAmount"      numeric(18,2) NOT NULL DEFAULT 0 CHECK ("grossAmount" >= 0),
  "discountAmount"   numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  "taxAmount"        numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "netAmount"        numeric(18,2) NOT NULL DEFAULT 0 CHECK ("netAmount" >= 0),
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "createdBy"        uuid,
  "updatedAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedBy"        uuid,
  "rowVersion"       integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "heldBillId", "lineNo"),
  CONSTRAINT "heldBillLineHeldBillIdFk" FOREIGN KEY ("tenantId", "heldBillId") REFERENCES "Distribution"."HeldBills" ("tenantId", id),
  CONSTRAINT "heldBillLineNetChk" CHECK ("netAmount" = "grossAmount" - "discountAmount" + "taxAmount")
);
SELECT "Company"."addStandardTriggers"('"Distribution"."HeldBillLines"');
COMMENT ON TABLE "Distribution"."HeldBillLines" IS 'Lines of a parked wholesale bill. baseQty = qtyCtn × unitsPerCtn + qtyLoose.';

-- ---------------------------------------------------------------------------
-- OrderTemplates — "Templates ▾" menu ("Weekly standard order", "Ramzan pack",
-- "N lines · M ctn") and "Save current as template…" sheet (Template name).
-- Source: 9H-wholesale.js TPL[], saveTemplate().
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."OrderTemplates" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name             text NOT NULL,                                  -- Weekly standard order
  icon             text,                                           -- calendar-sync / moon-star / bookmark
  "customerId"      uuid,                                           -- "Bismillah Traders · weekly"; NULL = any shop
  "ownerUserId"    uuid,
  "isShared"        boolean NOT NULL DEFAULT true,
  status           text NOT NULL DEFAULT 'ACTIVE',
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  UNIQUE ("tenantId", id),
  CONSTRAINT "orderTemplateOwnerFk" FOREIGN KEY ("tenantId", "ownerUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."OrderTemplates"');
CREATE UNIQUE INDEX "orderTemplateNameUq" ON "Distribution"."OrderTemplates"
  ("tenantId", COALESCE("customerId", '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) WHERE "deletedAt" IS NULL;
COMMENT ON TABLE "Distribution"."OrderTemplates" IS 'Reusable order templates for Quick Wholesale Entry (quantities only, rates come from the tier at use).';

CREATE TABLE "Distribution"."OrderTemplateLines" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "orderTemplateId"  uuid NOT NULL,
  "lineNo"            smallint NOT NULL CHECK ("lineNo" > 0),
  "itemId"            uuid NOT NULL,                                -- Inventory.Products (fk file)
  "qtyCtn"            numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyCtn" >= 0),
  "qtyLoose"          numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyLoose" >= 0),
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "orderTemplateId", "lineNo"),
  UNIQUE ("tenantId", "orderTemplateId", "itemId"),
  CONSTRAINT "orderTemplateLineTemplateFk" FOREIGN KEY ("tenantId", "orderTemplateId") REFERENCES "Distribution"."OrderTemplates" ("tenantId", id),
  CONSTRAINT "orderTemplateLineQtyChk" CHECK ("qtyCtn" > 0 OR "qtyLoose" > 0)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."OrderTemplateLines"');

-- ---------------------------------------------------------------------------
-- CreditOverrideLogs — "Credit limit exceeded" modal: Credit limit,
-- Outstanding, This bill, After this bill, Over by, Overdue; "Manager PIN to
-- override" (4 digits, 3 tries, "Too many attempts · request logged for
-- review", 4 s lock-out); toast "Credit override approved by Faisal Qureshi".
-- Source: 9H-wholesale.js openCredit(), pinCheck(). The PIN is never stored.
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."CreditOverrideLogs" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "customerId"           uuid NOT NULL,                     -- Sales.Customers (fk file)
  "invoiceId"            uuid,                              -- Sales.SalesInvoices once saved (fk file)
  "heldBillId"          uuid,                              -- when the user chose "Hold bill"
  "creditOverrideId"    uuid,                              -- Sales.CreditOverrides (CO doc) when approved (fk file)
  "triggerPoint"         text NOT NULL,   -- typing over limit / Save blocked
  "creditLimit"          numeric(18,2) NOT NULL CHECK ("creditLimit" >= 0),
  "outstandingAmount"    numeric(18,2) NOT NULL,
  "billAmount"           numeric(18,2) NOT NULL CHECK ("billAmount" >= 0),
  "usedAmount"           numeric(18,2) GENERATED ALWAYS AS ("outstandingAmount" + "billAmount") STORED,     -- After this bill
  "overByAmount"        numeric(18,2) GENERATED ALWAYS AS (GREATEST("outstandingAmount" + "billAmount" - "creditLimit", 0)) STORED,
  "usedPct"              numeric(9,4) NOT NULL CHECK ("usedPct" >= 0),          -- "112% of limit used"
  "overdueDays"          integer NOT NULL DEFAULT 0 CHECK ("overdueDays" >= 0),
  "requestedByUserId"  uuid,
  "approvedByUserId"   uuid,                              -- manager whose PIN matched (Faisal Qureshi)
  attempts              smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  "lastPinResult"       text,
  outcome               text NOT NULL DEFAULT 'PENDING',
  "lockedUntil"          timestamptz,
  "requestedAt"          timestamptz NOT NULL DEFAULT now(),
  "resolvedAt"           timestamptz,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "creditOverrideLogHeldBillFk"    FOREIGN KEY ("tenantId", "heldBillId")         REFERENCES "Distribution"."HeldBills" ("tenantId", id),
  CONSTRAINT "creditOverrideLogRequestedByFk" FOREIGN KEY ("tenantId", "requestedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "creditOverrideLogApprovedByFk"  FOREIGN KEY ("tenantId", "approvedByUserId")  REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "creditOverrideLogApprovedChk" CHECK (outcome <> 'APPROVED'
                                                     OR ("approvedByUserId" IS NOT NULL AND "lastPinResult" = 'CORRECT')),
  CONSTRAINT "creditOverrideLogLockedChk"   CHECK (outcome <> 'LOCKED' OR "lockedUntil" IS NOT NULL),
  CONSTRAINT "creditOverrideLogResolvedChk" CHECK ((outcome = 'PENDING') = ("resolvedAt" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"Distribution"."CreditOverrideLogs"', true);
CREATE INDEX "creditOverrideLogTenantCustomerIdx" ON "Distribution"."CreditOverrideLogs" ("tenantId", "customerId", "requestedAt" DESC);
CREATE INDEX "creditOverrideLogTenantOutcomeIdx"  ON "Distribution"."CreditOverrideLogs" ("tenantId", outcome, "requestedAt" DESC);
COMMENT ON TABLE "Distribution"."CreditOverrideLogs" IS 'Every credit-limit PIN override attempt on Quick Wholesale Entry (approved, denied or locked). The PIN is never stored.';


-- =============================================================================
-- 3. BULK INVOICING — app/wholesale/bulk
-- =============================================================================

-- ---------------------------------------------------------------------------
-- BulkInvoiceRuns — top bar (Route, Invoice date, Matrix | Same items to
-- many shops), generate bar (Shops billed, Cartons, Credit warnings, Total
-- value, "Generate N invoices"), result modal (Invoices, Total value,
-- Skipped, range "WS-2026-000232 → WS-2026-000239").
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."BulkInvoiceRuns" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "branchId"             uuid,
  "routeId"              uuid NOT NULL,
  "docDate"              date NOT NULL,                       -- Invoice date
  "warehouseId"          uuid,                                -- Inventory.Warehouses (fk file)
  mode                  text NOT NULL,
  "shopsSelected"        integer NOT NULL DEFAULT 0 CHECK ("shopsSelected" >= 0),
  "totalCtn"             numeric(18,3) NOT NULL DEFAULT 0 CHECK ("totalCtn" >= 0),
  "creditWarnings"       integer NOT NULL DEFAULT 0 CHECK ("creditWarnings" >= 0),
  "totalValue"           numeric(18,2) NOT NULL DEFAULT 0 CHECK ("totalValue" >= 0),
  "invoiceCount"         integer NOT NULL DEFAULT 0 CHECK ("invoiceCount" >= 0),
  "invoicedValue"        numeric(18,2) NOT NULL DEFAULT 0 CHECK ("invoicedValue" >= 0),
  "skippedCount"         integer NOT NULL DEFAULT 0 CHECK ("skippedCount" >= 0),
  "firstInvoiceNo"      text,
  "lastInvoiceNo"       text,
  status                text NOT NULL DEFAULT 'DRAFT',
  "generatedAt"          timestamptz,
  "generatedByUserId"  uuid,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "bulkInvoiceBatchBranchIdFk"    FOREIGN KEY ("tenantId", "branchId")            REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "bulkInvoiceBatchRouteIdFk"     FOREIGN KEY ("tenantId", "routeId")             REFERENCES "Distribution"."Routes" ("tenantId", id),
  CONSTRAINT "bulkInvoiceBatchGeneratedByFk" FOREIGN KEY ("tenantId", "generatedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "bulkInvoiceBatchDoneChk" CHECK (status <> 'COMPLETED' OR "generatedAt" IS NOT NULL),
  CONSTRAINT "bulkInvoiceBatchRangeChk" CHECK (("invoiceCount" = 0) = ("firstInvoiceNo" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"Distribution"."BulkInvoiceRuns"', true);
CREATE INDEX "bulkInvoiceBatchTenantRouteIdx" ON "Distribution"."BulkInvoiceRuns" ("tenantId", "routeId", "docDate" DESC);
COMMENT ON TABLE "Distribution"."BulkInvoiceRuns" IS 'One "Generate N invoices" run of Bulk Invoicing for a route and date. Each generated invoice is a Sales.SalesInvoices (WHOLESALE).';

-- BulkInvoiceRunCells — helper: the matrix "Shops × products (CTN)" cells, or the
-- expansion of "Same items to many shops" (items × ticked shops). Keeps the
-- link from each cell to the invoice line it became.
CREATE TABLE "Distribution"."BulkInvoiceRunCells" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "bulkInvoiceBatchId"  uuid NOT NULL,
  "customerId"            uuid NOT NULL,                       -- Sales.Customers (fk file)
  "itemId"                uuid NOT NULL,                       -- Inventory.Products (fk file)
  "qtyCtn"                numeric(18,3) NOT NULL CHECK ("qtyCtn" > 0),
  "unitsPerCtn"          numeric(18,3) NOT NULL DEFAULT 1 CHECK ("unitsPerCtn" >= 1),
  "baseQty"               numeric(18,3) GENERATED ALWAYS AS ("qtyCtn" * "unitsPerCtn") STORED,
  rate                   numeric(18,4) NOT NULL CHECK (rate >= 0),           -- tier rate per piece
  "taxRate"               numeric(7,4) NOT NULL DEFAULT 0 CHECK ("taxRate" BETWEEN 0 AND 100),
  amount                 numeric(18,2) NOT NULL CHECK (amount >= 0),         -- incl. GST (ctnAmt)
  "invoiceId"             uuid,                                -- Sales.SalesInvoices (fk file), set on generate
  "invoiceLineId"        uuid,                                -- Sales.SalesInvoiceLines (fk file)
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "bulkInvoiceBatchId", "customerId", "itemId"),
  CONSTRAINT "bulkInvoiceCellBatchFk" FOREIGN KEY ("tenantId", "bulkInvoiceBatchId") REFERENCES "Distribution"."BulkInvoiceRuns" ("tenantId", id),
  CONSTRAINT "bulkInvoiceCellLineChk" CHECK ("invoiceLineId" IS NULL OR "invoiceId" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."BulkInvoiceRunCells"');
CREATE INDEX "bulkInvoiceCellTenantInvoiceIdx" ON "Distribution"."BulkInvoiceRunCells" ("tenantId", "invoiceId") WHERE "invoiceId" IS NOT NULL;
COMMENT ON TABLE "Distribution"."BulkInvoiceRunCells" IS 'Helper: a shop × product cell (cartons) of a bulk invoicing batch and the invoice line it produced.';

-- BulkInvoiceSkippedShops — result row "Skipped · over limit by Rs 41,200" and the
-- summary "X, Y skipped for credit. Collect payment or raise the limit".
CREATE TABLE "Distribution"."BulkInvoiceSkippedShops" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "bulkInvoiceBatchId"  uuid NOT NULL,
  "customerId"            uuid NOT NULL,                       -- Sales.Customers (fk file)
  "reasonCode"            text NOT NULL DEFAULT 'OVER_CREDIT_LIMIT',
  reason                 text NOT NULL,                       -- "over limit by Rs 41,200"
  "billAmount"            numeric(18,2) NOT NULL CHECK ("billAmount" >= 0),
  "outstandingAmount"     numeric(18,2),
  "creditLimit"           numeric(18,2) CHECK ("creditLimit" >= 0),
  "overByAmount"         numeric(18,2) CHECK ("overByAmount" >= 0),
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "bulkInvoiceBatchId", "customerId"),
  CONSTRAINT "bulkInvoiceSkipBatchFk" FOREIGN KEY ("tenantId", "bulkInvoiceBatchId") REFERENCES "Distribution"."BulkInvoiceRuns" ("tenantId", id),
  CONSTRAINT "bulkInvoiceSkipCreditChk" CHECK ("reasonCode" <> 'OVER_CREDIT_LIMIT' OR "overByAmount" > 0)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."BulkInvoiceSkippedShops"');
COMMENT ON TABLE "Distribution"."BulkInvoiceSkippedShops" IS 'Shops a bulk invoicing batch skipped (credit limit), with the reason shown in the result list.';


-- =============================================================================
-- 4. ORDER BOOKINGS — app/wholesale/bookings
-- =============================================================================

-- ---------------------------------------------------------------------------
-- OrderBookings — table columns: Order (BK-2026-4120, Today · 08:12), Booker,
-- Shop (+ note), Route, Lines, Amount, Location (GPS verified / "0.4 km off"),
-- Stock (Not checked / All in stock / N short), Status (New / Checked /
-- Converted / Partial) + invoice no; drawer (Booker, Booked, Lines, Amount,
-- note, map "Booked at the shop / away from the shop"); filters (status chips,
-- booker, route, date); "Allow partial", "Check stock", "Convert to invoices",
-- "Sync app". Source: 9H-wholesale.js BK[], checkOrders(), bkConvert().
-- HELD = convert with "Allow partial" off and a shortage ("held for stock").
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."OrderBookings" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "branchId"              uuid,
  "docNo"                 text NOT NULL,                       -- BK-2026-4120  (Company.getNextDocNo('BK'))
  "docDate"               date NOT NULL,
  "bookedAt"              timestamptz NOT NULL,                -- 08:12
  "bookerEmployeeId"     uuid NOT NULL,                       -- HumanResources.Employees (fk file)
  "routeId"               uuid NOT NULL,
  "customerId"            uuid NOT NULL,                       -- Sales.Customers (fk file)
  "warehouseId"           uuid,                                -- stock checked against — Inventory.Warehouses (fk file)
  "priceTier"             text NOT NULL,
  "appOrderRef"          text,                                -- booker app's own id
  "syncedAt"              timestamptz,                         -- "Sync app"
  "geoLat"                numeric(9,6) CHECK ("geoLat" BETWEEN -90 AND 90),    -- [simulated] booker location
  "geoLng"                numeric(9,6) CHECK ("geoLng" BETWEEN -180 AND 180),
  "gpsVerified"           boolean NOT NULL DEFAULT false,      -- within ShopRouteProfiles.gpsToleranceM of the pin
  "gpsOffsetM"           numeric(10,1) CHECK ("gpsOffsetM" >= 0),            -- "0.4 km off" = 400.0
  note                   text,                                -- "Deliver before Jumma"
  "lineCount"             integer NOT NULL DEFAULT 0 CHECK ("lineCount" >= 0),
  "grossAmount"           numeric(18,2) NOT NULL DEFAULT 0 CHECK ("grossAmount" >= 0),
  "taxAmount"             numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "netAmount"             numeric(18,2) NOT NULL DEFAULT 0 CHECK ("netAmount" >= 0),   -- Amount (incl. GST)
  status                 text NOT NULL DEFAULT 'NEW',
  "stockCheck"            jsonb,                               -- {"checkedAt":…,"short":[{"itemId":…,"need":…,"have":…}]}
  "stockCheckedAt"       timestamptz,
  "shortLineCount"       integer NOT NULL DEFAULT 0 CHECK ("shortLineCount" >= 0),
  "allowPartial"          boolean,                             -- toggle value used at conversion
  "invoiceId"             uuid,                                -- Sales.SalesInvoices (fk file) WS-2026-000230
  "convertedAt"           timestamptz,
  "convertedByUserId"   uuid,
  "cancelledAt"           timestamptz,
  "cancelReason"          text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "orderBookingBranchIdFk"    FOREIGN KEY ("tenantId", "branchId")            REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "orderBookingRouteIdFk"     FOREIGN KEY ("tenantId", "routeId")             REFERENCES "Distribution"."Routes" ("tenantId", id),
  CONSTRAINT "orderBookingPriceTierFk"   FOREIGN KEY ("tenantId", "priceTier")           REFERENCES "Distribution"."PriceTiers" ("tenantId", code),
  CONSTRAINT "orderBookingConvertedByFk" FOREIGN KEY ("tenantId", "convertedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "orderBookingNetChk"        CHECK ("netAmount" = "grossAmount" + "taxAmount"),
  CONSTRAINT "orderBookingGeoPairChk"   CHECK (("geoLat" IS NULL) = ("geoLng" IS NULL)),
  CONSTRAINT "orderBookingStockJsonChk" CHECK ("stockCheck" IS NULL OR jsonb_typeof("stockCheck") = 'object'),
  CONSTRAINT "orderBookingCheckedChk"    CHECK (status NOT IN ('CHECKED','HELD') OR "stockCheckedAt" IS NOT NULL),
  CONSTRAINT "orderBookingConvertedChk"  CHECK (status NOT IN ('CONVERTED','PARTIAL')
                                                 OR ("invoiceId" IS NOT NULL AND "convertedAt" IS NOT NULL)),
  CONSTRAINT "orderBookingCancelledChk"  CHECK (status <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."OrderBookings"', true);
CREATE INDEX "orderBookingTenantStatusIdx"   ON "Distribution"."OrderBookings" ("tenantId", status, "docDate" DESC);
CREATE INDEX "orderBookingTenantBookerIdx"   ON "Distribution"."OrderBookings" ("tenantId", "bookerEmployeeId", "docDate" DESC);
CREATE INDEX "orderBookingTenantRouteIdx"    ON "Distribution"."OrderBookings" ("tenantId", "routeId", "docDate" DESC);
CREATE INDEX "orderBookingTenantCustomerIdx" ON "Distribution"."OrderBookings" ("tenantId", "customerId", "docDate" DESC);
CREATE UNIQUE INDEX "orderBookingAppRefUq"   ON "Distribution"."OrderBookings" ("tenantId", "appOrderRef") WHERE "appOrderRef" IS NOT NULL;
COMMENT ON TABLE  "Distribution"."OrderBookings" IS 'Field orders from the booker app (BK). Converted to a Sales.SalesInvoices; shortages become Distribution.BackOrders.';
COMMENT ON COLUMN "Distribution"."OrderBookings"."stockCheck" IS 'Snapshot of the last "Check stock": shortages per item, oldest booking served first.';
COMMENT ON COLUMN "Distribution"."OrderBookings"."gpsOffsetM" IS '[simulated] Distance in metres between booking location and the saved shop pin.';

-- OrderBookingLines — drawer table: Item, CTN, PCS, Rate, Amount, Stock.
-- Rate is the tier rate frozen at booking time (9H: l.rate = tierRate()).
CREATE TABLE "Distribution"."OrderBookingLines" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "orderBookingId"   uuid NOT NULL,
  "lineNo"            smallint NOT NULL CHECK ("lineNo" > 0),
  "itemId"            uuid NOT NULL,                              -- Inventory.Products (fk file)
  "unitsPerCtn"      numeric(18,3) NOT NULL DEFAULT 1 CHECK ("unitsPerCtn" >= 1),
  "qtyCtn"            numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyCtn" >= 0),
  "qtyLoose"          numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyLoose" >= 0),
  "baseQty"           numeric(18,3) GENERATED ALWAYS AS ("qtyCtn" * "unitsPerCtn" + "qtyLoose") STORED,
  rate               numeric(18,4) NOT NULL CHECK (rate >= 0),   -- tier rate frozen at booking
  "taxRate"           numeric(7,4) NOT NULL DEFAULT 0 CHECK ("taxRate" BETWEEN 0 AND 100),
  "grossAmount"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("grossAmount" >= 0),
  "taxAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "netAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("netAmount" >= 0),
  "availableQty"      numeric(18,3) CHECK ("availableQty" >= 0),    -- "Only 1 ctn + 3" at last check
  "shortQty"          numeric(18,3) NOT NULL DEFAULT 0 CHECK ("shortQty" >= 0),
  "invoicedQty"       numeric(18,3) NOT NULL DEFAULT 0 CHECK ("invoicedQty" >= 0),
  "backorderQty"      numeric(18,3) NOT NULL DEFAULT 0 CHECK ("backorderQty" >= 0),
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "orderBookingId", "lineNo"),
  UNIQUE ("tenantId", id, "orderBookingId"),
  CONSTRAINT "orderBookingLineBookingFk" FOREIGN KEY ("tenantId", "orderBookingId") REFERENCES "Distribution"."OrderBookings" ("tenantId", id),
  CONSTRAINT "orderBookingLineQtyChk"    CHECK ("qtyCtn" > 0 OR "qtyLoose" > 0),
  CONSTRAINT "orderBookingLineNetChk"    CHECK ("netAmount" = "grossAmount" + "taxAmount"),
  CONSTRAINT "orderBookingLineSplitChk"  CHECK ("invoicedQty" + "backorderQty" <= "qtyCtn" * "unitsPerCtn" + "qtyLoose")
);
SELECT "Company"."addStandardTriggers"('"Distribution"."OrderBookingLines"');
CREATE INDEX "orderBookingLineTenantItemIdx" ON "Distribution"."OrderBookingLines" ("tenantId", "itemId");


-- =============================================================================
-- 5. BACK-ORDERS — app/wholesale/backorders
-- =============================================================================

-- ---------------------------------------------------------------------------
-- BackOrders — KPIs (Pending lines, Pending value at tier rates incl. GST,
-- Customers waiting, Oldest pending, Ready to invoice); grouped "By item /
-- By customer"; row: shop/tier/ref (WS-2026-000214 or BK-2026-4131), pending
-- (ctn + pcs), allocation bar ("36 allocated · SE-2608"), age chip, status
-- (Waiting / Part allocated / Ready). Source: 9H-wholesale.js BO[], boDetail().
-- pendingQty = original − invoiced − cancelled (base units).
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."BackOrders" (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "branchId"                uuid,
  "sourceDocType"          text NOT NULL REFERENCES "Company"."DocumentTypes"(code),
  "sourceInvoiceId"        uuid,                                -- Sales.SalesInvoices (fk file) partial delivery
  "sourceOrderBookingId"  uuid,
  "sourceBookingLineId"   uuid,
  "customerId"              uuid NOT NULL,                       -- Sales.Customers (fk file)
  "routeId"                 uuid,
  "itemId"                  uuid NOT NULL,                       -- Inventory.Products (fk file)
  "backorderDate"           date NOT NULL,                       -- age = today − backorderDate
  "originalQty"             numeric(18,3) NOT NULL CHECK ("originalQty" > 0),
  "invoicedQty"             numeric(18,3) NOT NULL DEFAULT 0 CHECK ("invoicedQty" >= 0),
  "cancelledQty"            numeric(18,3) NOT NULL DEFAULT 0 CHECK ("cancelledQty" >= 0),
  "pendingQty"              numeric(18,3) GENERATED ALWAYS AS ("originalQty" - "invoicedQty" - "cancelledQty") STORED,
  "allocatedQty"            numeric(18,3) NOT NULL DEFAULT 0 CHECK ("allocatedQty" >= 0),
  "unitRate"                numeric(18,4) NOT NULL CHECK ("unitRate" >= 0),        -- tier rate
  "taxRate"                 numeric(7,4) NOT NULL DEFAULT 0 CHECK ("taxRate" BETWEEN 0 AND 100),
  status                   text NOT NULL DEFAULT 'WAITING',
  "lastInvoiceId"          uuid,                                -- Sales.SalesInvoices created from this line (fk file)
  "createdAt"               timestamptz NOT NULL DEFAULT now(),
  "createdBy"               uuid,
  "updatedAt"               timestamptz NOT NULL DEFAULT now(),
  "updatedBy"               uuid,
  "rowVersion"              integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "backorderLineBranchIdFk"    FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "backorderLineRouteIdFk"     FOREIGN KEY ("tenantId", "routeId")  REFERENCES "Distribution"."Routes" ("tenantId", id),
  CONSTRAINT "backorderLineBookingFk"      FOREIGN KEY ("tenantId", "sourceOrderBookingId") REFERENCES "Distribution"."OrderBookings" ("tenantId", id),
  CONSTRAINT "backorderLineBookingLineFk" FOREIGN KEY ("tenantId", "sourceBookingLineId", "sourceOrderBookingId")
                                              REFERENCES "Distribution"."OrderBookingLines" ("tenantId", id, "orderBookingId"),
  CONSTRAINT "backorderLineSourceChk" CHECK (
       ("sourceDocType" IN ('WS','INV') AND "sourceInvoiceId" IS NOT NULL AND "sourceOrderBookingId" IS NULL)
    OR ("sourceDocType" = 'BK' AND "sourceOrderBookingId" IS NOT NULL)),
  CONSTRAINT "backorderLineQtyChk"       CHECK ("invoicedQty" + "cancelledQty" <= "originalQty"),
  CONSTRAINT "backorderLineAllocChk"     CHECK ("allocatedQty" <= "originalQty" - "invoicedQty" - "cancelledQty"),
  CONSTRAINT "backorderLineStatusChk" CHECK (
       (status = 'WAITING'        AND "allocatedQty" = 0 AND "originalQty" - "invoicedQty" - "cancelledQty" > 0)
    OR (status = 'PART_ALLOCATED' AND "allocatedQty" > 0 AND "allocatedQty" < "originalQty" - "invoicedQty" - "cancelledQty")
    OR (status = 'READY'          AND "allocatedQty" > 0 AND "allocatedQty" = "originalQty" - "invoicedQty" - "cancelledQty")
    OR (status = 'INVOICED'       AND "originalQty" - "invoicedQty" - "cancelledQty" = 0 AND "invoicedQty" > 0 AND "cancelledQty" = 0)
    OR (status = 'CANCELLED'      AND "originalQty" - "invoicedQty" - "cancelledQty" = 0 AND "cancelledQty" > 0))
);
SELECT "Company"."addStandardTriggers"('"Distribution"."BackOrders"', true);
CREATE INDEX "backorderLineTenantOpenItemIdx" ON "Distribution"."BackOrders" ("tenantId", "itemId", "backorderDate")
  WHERE status IN ('WAITING','PART_ALLOCATED','READY');
CREATE INDEX "backorderLineTenantCustomerIdx"  ON "Distribution"."BackOrders" ("tenantId", "customerId", status);
CREATE INDEX "backorderLineTenantStatusIdx"    ON "Distribution"."BackOrders" ("tenantId", status, "backorderDate");
COMMENT ON TABLE  "Distribution"."BackOrders" IS 'Quantities owed to a shop after a partial delivery or partial booking conversion. Base units.';
COMMENT ON COLUMN "Distribution"."BackOrders"."pendingQty" IS 'original − invoiced − cancelled. Pending value = pendingQty × unitRate × (1 + taxRate/100).';

-- ---------------------------------------------------------------------------
-- BackOrderAllocations — "Incoming stock" feed (GRN-2026-0187 …, batches) →
-- "Allocate arrival" modal: Policy FEFO + oldest | Priority tier | Pro-rata;
-- preview (Customer, Age, Pending, Allocate, Batch, Still due); summary
-- (Arrived, Waiting, Allocating, To free stock). Source: 9H allocPlan().
-- One row per back-order line × batch slice of one GRN arrival.
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."BackOrderAllocations" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "backorderLineId"     uuid NOT NULL,
  "allocationGroupId"   uuid NOT NULL,                       -- one "Allocate" click (one GRN arrival)
  "grnId"                uuid NOT NULL,                       -- Purchases.GoodsReceivedNotes (fk file) GRN-2026-0187
  "grnLineId"           uuid,                                -- Purchases.GoodsReceivedNoteLines (fk file)
  "batchId"              uuid,                                -- Inventory.ProductBatches (fk file) SE-2608; NULL for non-batch items
  qty                   numeric(18,3) NOT NULL CHECK (qty > 0),
  policy                text NOT NULL,
  status                text NOT NULL DEFAULT 'ALLOCATED',
  "allocatedAt"          timestamptz NOT NULL DEFAULT now(),
  "allocatedByUserId"  uuid,
  "invoiceId"            uuid,                                -- Sales.SalesInvoices (fk file) when converted
  "invoicedAt"           timestamptz,
  "releasedAt"           timestamptz,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "backorderAllocationLineFk"         FOREIGN KEY ("tenantId", "backorderLineId")    REFERENCES "Distribution"."BackOrders" ("tenantId", id),
  CONSTRAINT "backorderAllocationAllocatedByFk" FOREIGN KEY ("tenantId", "allocatedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "backorderAllocationInvoicedChk" CHECK (status <> 'INVOICED' OR ("invoiceId" IS NOT NULL AND "invoicedAt" IS NOT NULL)),
  CONSTRAINT "backorderAllocationReleasedChk" CHECK (status <> 'RELEASED' OR "releasedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."BackOrderAllocations"', true);
CREATE INDEX "backorderAllocationTenantLineIdx"  ON "Distribution"."BackOrderAllocations" ("tenantId", "backorderLineId");
CREATE INDEX "backorderAllocationTenantGrnIdx"   ON "Distribution"."BackOrderAllocations" ("tenantId", "grnId");
CREATE INDEX "backorderAllocationTenantGroupIdx" ON "Distribution"."BackOrderAllocations" ("tenantId", "allocationGroupId");
COMMENT ON TABLE "Distribution"."BackOrderAllocations" IS 'Stock from a GRN arrival reserved for back-order lines (FEFO batches, priority tier or pro-rata).';

-- ---------------------------------------------------------------------------
-- BackOrderCancellations — "Cancel back-order lines" modal: reason radios
-- (Customer no longer needs it / Product discontinued / Supplied by another
-- distributor / Price disagreement), Note (optional), "customers notified by
-- SMS". One row per cancelled line.
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."BackOrderCancellations" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "backorderLineId"     uuid NOT NULL,
  "cancelledQty"         numeric(18,3) NOT NULL CHECK ("cancelledQty" > 0),
  reason                text NOT NULL,
  note                  text,                                -- "Shopkeeper confirmed on call"
  "smsNotified"          boolean NOT NULL DEFAULT false,
  "smsSentAt"           timestamptz,
  "cancelledAt"          timestamptz NOT NULL DEFAULT now(),
  "cancelledByUserId"  uuid,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "backorderLineId"),
  CONSTRAINT "backorderCancellationLineFk"         FOREIGN KEY ("tenantId", "backorderLineId")    REFERENCES "Distribution"."BackOrders" ("tenantId", id),
  CONSTRAINT "backorderCancellationCancelledByFk" FOREIGN KEY ("tenantId", "cancelledByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "backorderCancellationSmsChk" CHECK (NOT "smsNotified" OR "smsSentAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."BackOrderCancellations"', true);


-- =============================================================================
-- 6. DELIVERY RUNS & LOAD SHEETS — app/wholesale/load-sheet
-- =============================================================================

-- ---------------------------------------------------------------------------
-- LoadSheets — Run builder (RUN-2026-0413, status; Route, Vehicle (van no),
-- Driver, Date, Departure; booker/salesman pills; on-beat badge), Van capacity
-- card (cartons/kg meters, % of carton space, Fits / Nearly full / Over
-- capacity; Invoices, Shops, SKU lines, Value), Print load sheet (LS-0412),
-- Gate pass (GP-2026-0412, Seal no SL-xxxxx, Out date·time, Returnable crates),
-- Dispatch van; Runs table (Run, Route, Van·Driver, Date, Departs, Invoices,
-- CTN, Value, Status) with tabs Today/Scheduled/Completed.
-- Source: 9I-distribution.js RUNS[], lsRecalc(), lsGate(), lsDispatch().
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."LoadSheets" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "branchId"               uuid,
  "docNo"                  text NOT NULL,                       -- RUN-2026-0412 (Company.getNextDocNo('RUN'))
  "docDate"                date NOT NULL,                       -- run date
  "routeId"                uuid NOT NULL,
  "vehicleId"              uuid NOT NULL,
  "driverEmployeeId"      uuid NOT NULL,                       -- HumanResources.Employees (fk file)
  "salesmanEmployeeId"    uuid,                                -- snapshot of route salesman — HumanResources.Employees (fk file)
  "sourceWarehouseId"     uuid NOT NULL,                       -- Lahore HQ Warehouse — Inventory.Warehouses (fk file)
  "vanWarehouseId"        uuid,                                -- vehicle's VAN warehouse — Inventory.Warehouses (fk file)
  "departureTime"          time NOT NULL,                       -- 08:40
  "loadSheetNo"           text,                                -- LS-0412 (Company.getNextDocNo('LS'))
  "gatePassNo"            text,                                -- GP-2026-0412 (Company.getNextDocNo('GP'))
  "sealNo"                 text,                                -- SL-48213
  "returnableCrates"       integer NOT NULL DEFAULT 0 CHECK ("returnableCrates" >= 0),
  "invoiceCount"           integer NOT NULL DEFAULT 0 CHECK ("invoiceCount" >= 0),
  "shopCount"              integer NOT NULL DEFAULT 0 CHECK ("shopCount" >= 0),
  "skuCount"               integer NOT NULL DEFAULT 0 CHECK ("skuCount" >= 0),
  "totalCtn"               numeric(18,3) NOT NULL DEFAULT 0 CHECK ("totalCtn" >= 0),          -- whole cartons
  "totalLoose"             numeric(18,3) NOT NULL DEFAULT 0 CHECK ("totalLoose" >= 0),        -- loose pieces
  "totalPcs"               numeric(18,3) NOT NULL DEFAULT 0 CHECK ("totalPcs" >= 0),
  "totalCtnEquiv"         numeric(18,3) NOT NULL DEFAULT 0 CHECK ("totalCtnEquiv" >= 0),    -- equivalent cartons
  "totalKg"                numeric(18,3) NOT NULL DEFAULT 0 CHECK ("totalKg" >= 0),
  "totalValue"             numeric(18,2) NOT NULL DEFAULT 0 CHECK ("totalValue" >= 0),
  "capacityCtn"            numeric(10,2) NOT NULL CHECK ("capacityCtn" > 0),                  -- vehicle snapshot
  "capacityKg"             numeric(10,2) NOT NULL CHECK ("capacityKg" > 0),
  "capacityCtnPct"        numeric(9,4) GENERATED ALWAYS AS (round("totalCtnEquiv" * 100 / "capacityCtn", 4)) STORED,
  "capacityKgPct"         numeric(9,4) GENERATED ALWAYS AS (round("totalKg" * 100 / "capacityKg", 4)) STORED,
  status                  text NOT NULL DEFAULT 'LOADING',
  "preparedByUserId"     uuid,                                -- "Prepared by (Store)"
  "checkedByUserId"      uuid,                                -- "Checked by (Supervisor)"
  "loadSheetPrintedAt"   timestamptz,
  "gatePassPrintedAt"    timestamptz,
  "stockTransferId"       uuid,                                -- Inventory.StockTransfers warehouse → van (fk file)
  "dispatchedAt"           timestamptz,
  "dispatchedByUserId"   uuid,
  "returnedAt"             timestamptz,                         -- settlement "Out → In 08:40 → 17:10"
  "cancelledAt"            timestamptz,
  remarks                 text,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "deliveryRunBranchIdFk"     FOREIGN KEY ("tenantId", "branchId")             REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "deliveryRunRouteIdFk"      FOREIGN KEY ("tenantId", "routeId")              REFERENCES "Distribution"."Routes" ("tenantId", id),
  CONSTRAINT "deliveryRunVehicleIdFk"    FOREIGN KEY ("tenantId", "vehicleId")            REFERENCES "Distribution"."Vans" ("tenantId", id),
  CONSTRAINT "deliveryRunPreparedByFk"   FOREIGN KEY ("tenantId", "preparedByUserId")   REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "deliveryRunCheckedByFk"    FOREIGN KEY ("tenantId", "checkedByUserId")    REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "deliveryRunDispatchedByFk" FOREIGN KEY ("tenantId", "dispatchedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "deliveryRunPcsChk"          CHECK ("totalPcs" >= "totalLoose"),
  CONSTRAINT "deliveryRunDispatchedChk"   CHECK (status NOT IN ('DISPATCHED','SETTLED')
                                                  OR ("dispatchedAt" IS NOT NULL AND "stockTransferId" IS NOT NULL
                                                      AND "invoiceCount" > 0 AND "loadSheetNo" IS NOT NULL)),
  CONSTRAINT "deliveryRunCapacityChk"     CHECK (status NOT IN ('DISPATCHED','SETTLED')
                                                  OR ("totalCtnEquiv" <= "capacityCtn" AND "totalKg" <= "capacityKg")),
  CONSTRAINT "deliveryRunCancelledChk"    CHECK (status <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."LoadSheets"', true);
CREATE UNIQUE INDEX "deliveryRunLoadSheetUq" ON "Distribution"."LoadSheets" ("tenantId", "loadSheetNo") WHERE "loadSheetNo" IS NOT NULL;
CREATE UNIQUE INDEX "deliveryRunGatePassUq"  ON "Distribution"."LoadSheets" ("tenantId", "gatePassNo")  WHERE "gatePassNo" IS NOT NULL;
CREATE UNIQUE INDEX "deliveryRunOneOnRoadPerVan" ON "Distribution"."LoadSheets" ("tenantId", "vehicleId") WHERE status = 'DISPATCHED';
CREATE INDEX "deliveryRunTenantDateIdx"  ON "Distribution"."LoadSheets" ("tenantId", "docDate" DESC, status);
CREATE INDEX "deliveryRunTenantRouteIdx" ON "Distribution"."LoadSheets" ("tenantId", "routeId", "docDate" DESC);
CREATE INDEX "deliveryRunTenantStatusIdx" ON "Distribution"."LoadSheets" ("tenantId", status, "docDate" DESC);
COMMENT ON TABLE  "Distribution"."LoadSheets" IS 'A van trip (RUN) with its load sheet (LS), gate pass (GP) and capacity. Dispatch = Inventory.StockTransfers source warehouse → van.';
COMMENT ON COLUMN "Distribution"."LoadSheets"."totalCtnEquiv" IS 'Σ baseQty / unitsPerCtn over LoadSheetLines. Compared with capacityCtn.';

-- LoadSheetInvoices — Run builder "Open invoices" picker (Invoice, Shop, Lines, CTN,
-- Amount; Select all / Clear) and load sheet "Invoices on this run".
-- An invoice is on at most one live run; a NOT-delivered invoice is released
-- at settlement (releasedAt) and can go on a later run.
CREATE TABLE "Distribution"."LoadSheetInvoices" (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"         uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "deliveryRunId"   uuid NOT NULL,
  "invoiceId"        uuid NOT NULL,                              -- Sales.SalesInvoices (fk file) INV-2026-001180 / WS-…
  "customerId"       uuid NOT NULL,                              -- Sales.Customers (fk file)
  "stopSeq"          integer CHECK ("stopSeq" > 0),
  "lineCount"        integer NOT NULL DEFAULT 0 CHECK ("lineCount" >= 0),
  "ctnEquiv"         numeric(18,3) NOT NULL DEFAULT 0 CHECK ("ctnEquiv" >= 0),
  "invoiceAmount"    numeric(18,2) NOT NULL CHECK ("invoiceAmount" >= 0),
  "releasedAt"       timestamptz,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "createdBy"        uuid,
  "updatedAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedBy"        uuid,
  "rowVersion"       integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "deliveryRunId", "invoiceId"),
  CONSTRAINT "runInvoiceRunFk" FOREIGN KEY ("tenantId", "deliveryRunId") REFERENCES "Distribution"."LoadSheets" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."LoadSheetInvoices"', true);
CREATE UNIQUE INDEX "runInvoiceOneLiveRunUq" ON "Distribution"."LoadSheetInvoices" ("tenantId", "invoiceId") WHERE "releasedAt" IS NULL;
COMMENT ON TABLE "Distribution"."LoadSheetInvoices" IS 'Invoices loaded on a delivery run (M:N run ↔ Sales.SalesInvoices).';

-- LoadSheetLines — "Consolidated load list": ✓ picked, SKU (+ Shelf A1),
-- Product (brand · N per ctn), CTN, PCS, Total pcs, Weight, Value; "Mark all
-- picked", "N of M picked". Source: 9I consolidate().
CREATE TABLE "Distribution"."LoadSheetLines" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "deliveryRunId"    uuid NOT NULL,
  "itemId"            uuid NOT NULL,                             -- Inventory.Products (fk file)
  "batchId"           uuid,                                      -- Inventory.ProductBatches (fk file), FEFO pick if batch-tracked
  "shelfCode"         text,                                      -- item.defaultShelf snapshot "A1"
  "unitsPerCtn"      numeric(18,3) NOT NULL DEFAULT 1 CHECK ("unitsPerCtn" >= 1),
  "qtyCtn"            numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyCtn" >= 0),
  "qtyLoose"          numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyLoose" >= 0),
  "baseQty"           numeric(18,3) GENERATED ALWAYS AS ("qtyCtn" * "unitsPerCtn" + "qtyLoose") STORED,  -- Total pcs
  "ctnEquiv"          numeric(18,3) GENERATED ALWAYS AS (round(("qtyCtn" * "unitsPerCtn" + "qtyLoose") / "unitsPerCtn", 3)) STORED,
  "weightKg"          numeric(18,3) NOT NULL DEFAULT 0 CHECK ("weightKg" >= 0),
  "valueAmount"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("valueAmount" >= 0),
  "isPicked"          boolean NOT NULL DEFAULT false,
  "pickedAt"          timestamptz,
  "pickedByUserId"  uuid,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "loadSheetLineRunFk"       FOREIGN KEY ("tenantId", "deliveryRunId")   REFERENCES "Distribution"."LoadSheets" ("tenantId", id),
  CONSTRAINT "loadSheetLinePickedByFk" FOREIGN KEY ("tenantId", "pickedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "loadSheetLineSplitChk"    CHECK ("unitsPerCtn" = 1 OR "qtyLoose" < "unitsPerCtn"),
  CONSTRAINT "loadSheetLineQtyChk"      CHECK ("qtyCtn" > 0 OR "qtyLoose" > 0),
  CONSTRAINT "loadSheetLinePickedChk"   CHECK (NOT "isPicked" OR "pickedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."LoadSheetLines"');
CREATE UNIQUE INDEX "loadSheetLineItemUq" ON "Distribution"."LoadSheetLines"
  ("tenantId", "deliveryRunId", "itemId", COALESCE("batchId", '00000000-0000-0000-0000-000000000000'::uuid));
COMMENT ON TABLE "Distribution"."LoadSheetLines" IS 'Consolidated pick list of a run: one row per SKU (and batch), cartons + loose for the store keeper.';


-- =============================================================================
-- 7. ROUTE SETTLEMENT — app/wholesale/settlement
-- =============================================================================

-- ---------------------------------------------------------------------------
-- RouteSettlements — run picker, run strip (Van, Driver, Salesman, Out → In,
-- Shops, Load value), KPIs (Collected cash + cheque, Returns, Credit on
-- account, Unexplained), cash count summary (Expected cash, Counted, Short /
-- excess), van stock badge, "Post settlement" journal preview + steps
-- (RCPT…, SRN…, returned stock to warehouse, JV…, run closed).
-- Source: 9I-distribution.js stBuild(), stRecalc(), stJournal(), stPostPreview().
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."RouteSettlements" (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                 uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "branchId"                 uuid,
  "docNo"                    text NOT NULL,                     -- RS-2026-0412 (Company.getNextDocNo('RS'))
  "docDate"                  date NOT NULL,
  "deliveryRunId"           uuid NOT NULL,
  "salesmanEmployeeId"      uuid,                              -- receivable party for shorts — HumanResources.Employees (fk file)
  "cashAccountId"           uuid,                              -- 1110-01 Cash in Hand — BankCash.CashAccounts (fk file)
  "invoiceTotal"             numeric(18,2) NOT NULL DEFAULT 0 CHECK ("invoiceTotal" >= 0),
  "returnTotal"              numeric(18,2) NOT NULL DEFAULT 0 CHECK ("returnTotal" >= 0),
  "returnCostTotal"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("returnCostTotal" >= 0),
  "cashExpected"             numeric(18,2) NOT NULL DEFAULT 0 CHECK ("cashExpected" >= 0),    -- Σ line cash
  "cashCounted"              numeric(18,2) NOT NULL DEFAULT 0 CHECK ("cashCounted" >= 0),     -- Σ RouteSettlementCashCounts
  "cashShortAmount"         numeric(18,2) GENERATED ALWAYS AS (GREATEST("cashExpected" - "cashCounted", 0)) STORED,
  "cashOverAmount"          numeric(18,2) GENERATED ALWAYS AS (GREATEST("cashCounted" - "cashExpected", 0)) STORED,
  "chequeTotal"              numeric(18,2) NOT NULL DEFAULT 0 CHECK ("chequeTotal" >= 0),
  "creditTotal"              numeric(18,2) NOT NULL DEFAULT 0 CHECK ("creditTotal" >= 0),
  "unexplainedShortTotal"   numeric(18,2) NOT NULL DEFAULT 0 CHECK ("unexplainedShortTotal" >= 0),
  "unexplainedExcessTotal"  numeric(18,2) NOT NULL DEFAULT 0 CHECK ("unexplainedExcessTotal" >= 0),
  "stockVarianceLines"      integer NOT NULL DEFAULT 0 CHECK ("stockVarianceLines" >= 0),
  "stockVarianceValue"      numeric(18,2) NOT NULL DEFAULT 0,  -- signed: < 0 loss, > 0 gain (at cost)
  status                    text NOT NULL DEFAULT 'OPEN',
  "returnTransferId"        uuid,                              -- Inventory.StockTransfers van → warehouse (fk file)
  "journalEntryId"          uuid,                              -- Accounting.Vouchers JV (fk file)
  "postedAt"                 timestamptz,
  "postedByUserId"         uuid,
  remarks                   text,
  "createdAt"                timestamptz NOT NULL DEFAULT now(),
  "createdBy"                uuid,
  "updatedAt"                timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                uuid,
  "rowVersion"               integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  UNIQUE ("tenantId", "deliveryRunId"),
  CONSTRAINT "runSettlementBranchIdFk" FOREIGN KEY ("tenantId", "branchId")         REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "runSettlementRunFk"       FOREIGN KEY ("tenantId", "deliveryRunId")   REFERENCES "Distribution"."LoadSheets" ("tenantId", id),
  CONSTRAINT "runSettlementPostedByFk" FOREIGN KEY ("tenantId", "postedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "runSettlementSettledChk"  CHECK (status <> 'SETTLED'
                                                OR ("journalEntryId" IS NOT NULL AND "postedAt" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Distribution"."RouteSettlements"', true);
CREATE INDEX "runSettlementTenantStatusIdx"   ON "Distribution"."RouteSettlements" ("tenantId", status, "docDate" DESC);
CREATE INDEX "runSettlementTenantSalesmanIdx" ON "Distribution"."RouteSettlements" ("tenantId", "salesmanEmployeeId", "docDate" DESC);
COMMENT ON TABLE "Distribution"."RouteSettlements" IS 'End-of-day close of a delivery run: collections, returns, cash bag count, van stock count, one journal.';

-- ---------------------------------------------------------------------------
-- RouteSettlementLines — "Shop settlement" grid: Shop · invoice, Invoice (net after
-- returns), Delivered (Full / Partial / Not delivered + why "Shop closed"),
-- Returns (N pcs · value), Cash, Cheque (#no · bank), Credit ("over limit by"),
-- Difference (Tallied / Short / Excess; click = book as credit).
-- net = max(invoice − returns, 0); difference = net − cash − cheque − credit.
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."RouteSettlementLines" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "runSettlementId"     uuid NOT NULL,
  "lineNo"               smallint NOT NULL CHECK ("lineNo" > 0),
  "invoiceId"            uuid NOT NULL,                         -- Sales.SalesInvoices (fk file)
  "customerId"           uuid NOT NULL,                         -- Sales.Customers (fk file)
  "invoiceAmount"        numeric(18,2) NOT NULL CHECK ("invoiceAmount" >= 0),
  "returnAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("returnAmount" >= 0),
  "netAmount"            numeric(18,2) GENERATED ALWAYS AS (GREATEST("invoiceAmount" - "returnAmount", 0)) STORED,
  "deliveryState"        text NOT NULL DEFAULT 'FULL',
  "nonDeliveryReason"   text,                                  -- "Shop closed"
  "cashAmount"           numeric(18,2) NOT NULL DEFAULT 0 CHECK ("cashAmount" >= 0),
  "chequeAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("chequeAmount" >= 0),
  "creditAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("creditAmount" >= 0),
  "differenceAmount"     numeric(18,2) GENERATED ALWAYS AS
                          (GREATEST("invoiceAmount" - "returnAmount", 0) - "cashAmount" - "chequeAmount" - "creditAmount") STORED,
  "receiptId"            uuid,                                  -- Sales.CustomerReceipts RCPT (fk file)
  "salesReturnId"       uuid,                                  -- Sales.SalesReturns SR (fk file)
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", id, "runSettlementId"),
  UNIQUE ("tenantId", "runSettlementId", "invoiceId"),
  UNIQUE ("tenantId", "runSettlementId", "lineNo"),
  CONSTRAINT "settlementLineSettlementFk" FOREIGN KEY ("tenantId", "runSettlementId") REFERENCES "Distribution"."RouteSettlements" ("tenantId", id),
  CONSTRAINT "settlementLineNoneChk"      CHECK ("deliveryState" <> 'NONE'
                                                  OR ("cashAmount" = 0 AND "chequeAmount" = 0 AND "creditAmount" = 0
                                                      AND "returnAmount" = "invoiceAmount" AND "nonDeliveryReason" IS NOT NULL)),
  CONSTRAINT "settlementLineFullChk"      CHECK ("deliveryState" <> 'FULL' OR "returnAmount" = 0),
  CONSTRAINT "settlementLinePartialChk"   CHECK ("deliveryState" <> 'PARTIAL' OR ("returnAmount" > 0 AND "returnAmount" < "invoiceAmount"))
);
SELECT "Company"."addStandardTriggers"('"Distribution"."RouteSettlementLines"', true);
CREATE INDEX "settlementLineTenantInvoiceIdx"  ON "Distribution"."RouteSettlementLines" ("tenantId", "invoiceId");
CREATE INDEX "settlementLineTenantCustomerIdx" ON "Distribution"."RouteSettlementLines" ("tenantId", "customerId");
COMMENT ON TABLE  "Distribution"."RouteSettlementLines" IS 'Per-invoice outcome of a run: delivered state, returns, cash / cheque / credit, difference.';
COMMENT ON COLUMN "Distribution"."RouteSettlementLines"."creditAmount" IS 'Left on account (memo only: the invoice already debited AR).';

-- RouteSettlementCheques — "Cheque details" sheet: Cheque no, Bank (HBL, Meezan,
-- UBL, MCB, Bank Alfalah, Allied Bank), Amount, Cheque date; "Post-dated
-- cheques sit in Cheques in Hand until deposited". Becomes a BankCash.Cheques.
CREATE TABLE "Distribution"."RouteSettlementCheques" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "runSettlementId"     uuid NOT NULL,
  "settlementLineId"    uuid NOT NULL,
  "chequeNo"             text NOT NULL CHECK (length(btrim("chequeNo")) > 0),   -- 004127
  "bankId"               uuid,                                  -- drawer's bank — BankCash.Banks (fk file)
  "bankName"             text NOT NULL,                         -- as typed/selected: HBL
  "chequeDate"           date NOT NULL,
  amount                numeric(18,2) NOT NULL CHECK (amount > 0),
  "chequeId"             uuid,                                  -- BankCash.Cheques created on posting (fk file)
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "settlementLineId", "chequeNo"),
  CONSTRAINT "settlementChequeSettlementFk" FOREIGN KEY ("tenantId", "runSettlementId") REFERENCES "Distribution"."RouteSettlements" ("tenantId", id),
  CONSTRAINT "settlementChequeLineFk"       FOREIGN KEY ("tenantId", "settlementLineId", "runSettlementId")
                                               REFERENCES "Distribution"."RouteSettlementLines" ("tenantId", id, "runSettlementId")
);
SELECT "Company"."addStandardTriggers"('"Distribution"."RouteSettlementCheques"', true);
COMMENT ON TABLE "Distribution"."RouteSettlementCheques" IS 'Cheques collected on a run. Posted as BankCash.Cheques (Cheques in Hand); PDC when chequeDate > settlement date.';

-- RouteSettlementReturns — "Returns" sheet per invoice line: supplied N (ctn+pcs) ·
-- Rs/pc, return qty stepper (≤ supplied), reason (Damaged in transit /
-- Expired / near expiry / Shop refused / Wrong item / Excess supplied),
-- "Return value". Cost value feeds Dr Stock / Cr COGS.
CREATE TABLE "Distribution"."RouteSettlementReturns" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "runSettlementId"     uuid NOT NULL,
  "settlementLineId"    uuid NOT NULL,
  "invoiceLineId"       uuid NOT NULL,                         -- Sales.SalesInvoiceLines (fk file)
  "itemId"               uuid NOT NULL,                         -- Inventory.Products (fk file)
  "batchId"              uuid,                                  -- Inventory.ProductBatches (fk file)
  "suppliedQty"          numeric(18,3) NOT NULL CHECK ("suppliedQty" > 0),
  "returnQty"            numeric(18,3) NOT NULL CHECK ("returnQty" > 0),
  "unitPrice"            numeric(18,4) NOT NULL CHECK ("unitPrice" >= 0),
  "returnValue"          numeric(18,2) GENERATED ALWAYS AS (round("returnQty" * "unitPrice", 2)) STORED,
  "unitCost"             numeric(18,4) NOT NULL CHECK ("unitCost" >= 0),       -- moving average cost
  "costValue"            numeric(18,2) GENERATED ALWAYS AS (round("returnQty" * "unitCost", 2)) STORED,
  reason                text NOT NULL,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "settlementLineId", "invoiceLineId"),
  CONSTRAINT "settlementReturnSettlementFk" FOREIGN KEY ("tenantId", "runSettlementId") REFERENCES "Distribution"."RouteSettlements" ("tenantId", id),
  CONSTRAINT "settlementReturnLineFk"       FOREIGN KEY ("tenantId", "settlementLineId", "runSettlementId")
                                               REFERENCES "Distribution"."RouteSettlementLines" ("tenantId", id, "runSettlementId"),
  CONSTRAINT "settlementReturnQtyChk" CHECK ("returnQty" <= "suppliedQty")
);
SELECT "Company"."addStandardTriggers"('"Distribution"."RouteSettlementReturns"', true);
CREATE INDEX "settlementReturnTenantItemIdx" ON "Distribution"."RouteSettlementReturns" ("tenantId", "itemId");
COMMENT ON TABLE "Distribution"."RouteSettlementReturns" IS 'Goods brought back on the van, per invoice line, with reason. Posted as a Sales.SalesReturns + stock back.';

-- RouteSettlementCashCounts — "Cash count" panel: denomination steppers 5000 / 1000 /
-- 500 / 100 / 50 / 20 / 10 with sub-totals. Source: 9I DEN[].
CREATE TABLE "Distribution"."RouteSettlementCashCounts" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "runSettlementId"     uuid NOT NULL,
  denomination          integer NOT NULL CHECK (denomination IN (5000, 1000, 500, 100, 50, 20, 10)),
  "noteCount"            integer NOT NULL DEFAULT 0 CHECK ("noteCount" >= 0),
  amount                numeric(18,2) GENERATED ALWAYS AS ((denomination::numeric * "noteCount")) STORED,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "runSettlementId", denomination),
  CONSTRAINT "cashCountLineSettlementFk" FOREIGN KEY ("tenantId", "runSettlementId") REFERENCES "Distribution"."RouteSettlements" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."RouteSettlementCashCounts"', true);
COMMENT ON TABLE "Distribution"."RouteSettlementCashCounts" IS 'Salesman cash bag counted by PKR denomination. Σ amount = RouteSettlements.cashCounted.';

-- VanStockCounts — "Van stock reconciliation": Product, Loaded, Delivered,
-- Returned, Counted in van (stepper), Variance; badge "N variance · Rs X".
-- Expected in van = returnedQty; variance = counted − returned (at cost).
CREATE TABLE "Distribution"."VanStockCounts" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "runSettlementId"     uuid NOT NULL,
  "itemId"               uuid NOT NULL,                         -- Inventory.Products (fk file)
  "unitsPerCtn"         numeric(18,3) NOT NULL DEFAULT 1 CHECK ("unitsPerCtn" >= 1),
  "loadedQty"            numeric(18,3) NOT NULL CHECK ("loadedQty" >= 0),
  "deliveredQty"         numeric(18,3) NOT NULL CHECK ("deliveredQty" >= 0),
  "returnedQty"          numeric(18,3) NOT NULL CHECK ("returnedQty" >= 0),
  "countedQty"           numeric(18,3) NOT NULL CHECK ("countedQty" >= 0),
  "varianceQty"          numeric(18,3) GENERATED ALWAYS AS ("countedQty" - "returnedQty") STORED,
  "unitCost"             numeric(18,4) NOT NULL CHECK ("unitCost" >= 0),
  "varianceValue"        numeric(18,2) GENERATED ALWAYS AS (round(("countedQty" - "returnedQty") * "unitCost", 2)) STORED,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "runSettlementId", "itemId"),
  CONSTRAINT "vanStockCountSettlementFk" FOREIGN KEY ("tenantId", "runSettlementId") REFERENCES "Distribution"."RouteSettlements" ("tenantId", id),
  CONSTRAINT "vanStockCountBalanceChk" CHECK ("deliveredQty" + "returnedQty" = "loadedQty")
);
SELECT "Company"."addStandardTriggers"('"Distribution"."VanStockCounts"', true);
COMMENT ON TABLE "Distribution"."VanStockCounts" IS 'Physical count of goods left in the van vs expected (returned). Variance → salesman receivable or stock gain.';


-- =============================================================================
-- 8. RECOVERY SHEET — app/wholesale/recovery
-- =============================================================================

-- ---------------------------------------------------------------------------
-- RecoverySheets — filters (Salesman, Route, Date, Search, chips All / 61+
-- days / 90+ days / Not collected), target ring (Target, Posted today,
-- Entered not posted, Still to collect), KPIs (Outstanding, 90+ days, Shops
-- collected, Promises to pay), "Print sheet", "Post receipts in bulk (N)".
-- Source: 9I-distribution.js RC, renderRecovery(), rcPost(), rcPrint().
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."RecoverySheets" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "branchId"               uuid,
  "docNo"                  text NOT NULL,                       -- RCV-2026-0001 (Company.getNextDocNo('RCV'))
  "docDate"                date NOT NULL,
  "salesmanEmployeeId"    uuid,                                -- HumanResources.Employees (fk file); NULL = all salesmen
  "routeId"                uuid,                                -- NULL = all routes
  "shopCount"              integer NOT NULL DEFAULT 0 CHECK ("shopCount" >= 0),
  "targetAmount"           numeric(18,2) NOT NULL DEFAULT 0 CHECK ("targetAmount" >= 0),
  "outstandingTotal"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("outstandingTotal" >= 0),
  "collectedTotal"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("collectedTotal" >= 0),
  "postedTotal"            numeric(18,2) NOT NULL DEFAULT 0 CHECK ("postedTotal" >= 0),
  status                  text NOT NULL DEFAULT 'OPEN',
  "printedAt"              timestamptz,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "recoverySheetBranchIdFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "recoverySheetRouteIdFk"  FOREIGN KEY ("tenantId", "routeId")  REFERENCES "Distribution"."Routes" ("tenantId", id),
  CONSTRAINT "recoverySheetPostedChk"   CHECK ("postedTotal" <= "collectedTotal")
);
SELECT "Company"."addStandardTriggers"('"Distribution"."RecoverySheets"', true);
CREATE INDEX "recoverySheetTenantDateIdx"     ON "Distribution"."RecoverySheets" ("tenantId", "docDate" DESC);
CREATE INDEX "recoverySheetTenantSalesmanIdx" ON "Distribution"."RecoverySheets" ("tenantId", "salesmanEmployeeId", "docDate" DESC);
COMMENT ON TABLE "Distribution"."RecoverySheets" IS 'A salesman''s collection round for a date (and route). Lines are Distribution.RecoverySheetLines.';

-- ---------------------------------------------------------------------------
-- RecoverySheetLines — "Collection sheet" row: Shop, Contact (call / WhatsApp
-- reminder, sent dot), Outstanding (limit), Ageing chips 0–30 / 31–60 / 61–90
-- / 90+, Last payment (date, amount), Collected (≤ outstanding), Mode (Cash /
-- Cheque / Online / JazzCash), Remarks (Note / Chq no / bank / Txn ID),
-- Promise to pay (date), Status (Pending / Ready / Promised / RCPT no).
-- Posting creates a Sales.CustomerReceipts allocated FIFO to the oldest invoices.
-- ---------------------------------------------------------------------------
CREATE TABLE "Distribution"."RecoverySheetLines" (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "recoverySheetId"        uuid NOT NULL,
  "lineNo"                  integer NOT NULL CHECK ("lineNo" > 0),
  "customerId"              uuid NOT NULL,                      -- Sales.Customers (fk file)
  "outstandingAmount"       numeric(18,2) NOT NULL CHECK ("outstandingAmount" >= 0),   -- snapshot at sheet time
  age030                 numeric(18,2) NOT NULL DEFAULT 0 CHECK (age030 >= 0),
  age3160                numeric(18,2) NOT NULL DEFAULT 0 CHECK (age3160 >= 0),
  age6190                numeric(18,2) NOT NULL DEFAULT 0 CHECK (age6190 >= 0),
  "age90Plus"              numeric(18,2) NOT NULL DEFAULT 0 CHECK ("age90Plus" >= 0),
  "creditLimit"             numeric(18,2) CHECK ("creditLimit" >= 0),
  "lastPaymentDate"        date,
  "lastPaymentAmount"      numeric(18,2) CHECK ("lastPaymentAmount" >= 0),
  "targetAmount"            numeric(18,2) NOT NULL DEFAULT 0 CHECK ("targetAmount" >= 0),
  "collectedAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("collectedAmount" >= 0),
  mode                     text NOT NULL DEFAULT 'CASH',
  remarks                  text,                               -- note / "chq no / bank" / txn id
  "chequeId"                uuid,                               -- BankCash.Cheques when mode CHEQUE (fk file)
  "depositBankAccountId"  uuid,                               -- ONLINE / JAZZCASH destination — BankCash.BankAccounts (fk file)
  "promiseToPayDate"      date,
  "remindedAt"              timestamptz,                        -- WhatsApp reminder sent
  "reminderLanguage"        text,
  status                   text NOT NULL DEFAULT 'PENDING',
  "receiptId"               uuid,                               -- Sales.CustomerReceipts RCPT-2026-000871 (fk file)
  "postedAt"                timestamptz,
  "postedByUserId"        uuid,
  "createdAt"               timestamptz NOT NULL DEFAULT now(),
  "createdBy"               uuid,
  "updatedAt"               timestamptz NOT NULL DEFAULT now(),
  "updatedBy"               uuid,
  "rowVersion"              integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "recoverySheetId", "customerId"),
  UNIQUE ("tenantId", "recoverySheetId", "lineNo"),
  CONSTRAINT "recoveryEntrySheetFk"     FOREIGN KEY ("tenantId", "recoverySheetId") REFERENCES "Distribution"."RecoverySheets" ("tenantId", id),
  CONSTRAINT "recoveryEntryPostedByFk" FOREIGN KEY ("tenantId", "postedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "recoveryEntryAgeingChk"   CHECK (age030 + age3160 + age6190 + "age90Plus" = "outstandingAmount"),
  CONSTRAINT "recoveryEntryAmountChk"   CHECK ("collectedAmount" <= "outstandingAmount"),
  CONSTRAINT "recoveryEntryReminderChk" CHECK (("remindedAt" IS NULL) = ("reminderLanguage" IS NULL)),
  CONSTRAINT "recoveryEntryStatusChk"   CHECK (
       (status = 'PENDING'  AND "collectedAmount" = 0 AND "promiseToPayDate" IS NULL)
    OR (status = 'PROMISED' AND "collectedAmount" = 0 AND "promiseToPayDate" IS NOT NULL)
    OR (status = 'READY'    AND "collectedAmount" > 0 AND "receiptId" IS NULL)
    OR (status = 'POSTED'   AND "collectedAmount" > 0 AND "receiptId" IS NOT NULL AND "postedAt" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Distribution"."RecoverySheetLines"', true);
CREATE INDEX "recoveryEntryTenantCustomerIdx" ON "Distribution"."RecoverySheetLines" ("tenantId", "customerId");
CREATE INDEX "recoveryEntryTenantPtpIdx"      ON "Distribution"."RecoverySheetLines" ("tenantId", "promiseToPayDate") WHERE status = 'PROMISED';
CREATE INDEX "recoveryEntryTenantReadyIdx"    ON "Distribution"."RecoverySheetLines" ("tenantId", "recoverySheetId") WHERE status = 'READY';
COMMENT ON TABLE  "Distribution"."RecoverySheetLines" IS 'One shop on a recovery sheet: ageing snapshot, amount collected, mode, promise to pay, resulting receipt.';
COMMENT ON COLUMN "Distribution"."RecoverySheetLines"."collectedAmount" IS 'Must not exceed outstanding ("More than the outstanding balance"). Posting allocates FIFO, oldest invoice first.';

-- A posted recovery entry is final (the receipt is the accounting truth).
CREATE OR REPLACE FUNCTION "Distribution"."triggerRecoveryEntryPosted"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'Recovery entry % is posted (receipt %) and cannot be changed', OLD.id, OLD."receiptId"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "distRecoveryEntryPosted" BEFORE UPDATE OR DELETE ON "Distribution"."RecoverySheetLines"
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerRecoveryEntryPosted"();


-- =============================================================================
-- 9. TARGETS & COMMISSION — app/wholesale/routes ("Bookers & salesmen",
--    Leaderboard, Commission slabs). Source: 9I-distribution.js PEOPLE, SLABS.
-- =============================================================================

-- SalesmanTargets — person card: Target achievement %, "Rs 4.51M of Rs 4.2M",
-- Strike rate, Productive calls 171/212 ("September 2026 · month to date").
CREATE TABLE "Distribution"."SalesmanTargets" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"        uuid NOT NULL,                             -- HumanResources.Employees (fk file)
  role               text NOT NULL,
  "routeId"           uuid,
  "periodStart"       date NOT NULL,
  "periodEnd"         date NOT NULL,
  "fiscalPeriodId"   uuid,                                      -- Accounting.FiscalPeriods (fk file)
  "targetAmount"      numeric(18,2) NOT NULL CHECK ("targetAmount" > 0),
  "achievedAmount"    numeric(18,2) NOT NULL DEFAULT 0 CHECK ("achievedAmount" >= 0),
  "achievementPct"    numeric(9,4) GENERATED ALWAYS AS (round("achievedAmount" * 100 / "targetAmount", 4)) STORED,
  calls              integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
  "productiveCalls"   integer NOT NULL DEFAULT 0 CHECK ("productiveCalls" >= 0),
  status             text NOT NULL DEFAULT 'OPEN',
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "employeeId", role, "periodStart"),
  CONSTRAINT "salesTargetRouteIdFk" FOREIGN KEY ("tenantId", "routeId") REFERENCES "Distribution"."Routes" ("tenantId", id),
  CONSTRAINT "salesTargetPeriodChk"  CHECK ("periodEnd" >= "periodStart"),
  CONSTRAINT "salesTargetCallsChk"   CHECK ("productiveCalls" <= calls)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."SalesmanTargets"', true);
CREATE INDEX "salesTargetTenantPeriodIdx" ON "Distribution"."SalesmanTargets" ("tenantId", "periodStart" DESC);
COMMENT ON TABLE "Distribution"."SalesmanTargets" IS 'Monthly sales target per booker/salesman with achievement and call stats (strike rate = productive / calls).';

-- CommissionSlabs — "Commission slabs" table: Achievement band (Below 80% /
-- 80–100% / 100–120% / 120%+), Rate (0.5 / 1.0 / 1.5 / 2.0 %).
-- No two active slabs may overlap in both band and effective dates.
CREATE TABLE "Distribution"."CommissionSlabs" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  label            text NOT NULL,                                -- "80–100%"
  "fromPct"         numeric(9,4) NOT NULL CHECK ("fromPct" >= 0),
  "toPct"           numeric(9,4),                                 -- NULL = open-ended (120%+)
  "ratePct"         numeric(7,4) NOT NULL CHECK ("ratePct" BETWEEN 0 AND 100),
  "effectiveFrom"   date NOT NULL,
  "effectiveTo"     date,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  UNIQUE ("tenantId", id),
  CONSTRAINT "commissionSlabBandChk"  CHECK ("toPct" IS NULL OR "toPct" > "fromPct"),
  CONSTRAINT "commissionSlabDatesChk" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "commissionSlabNoOverlap" EXCLUDE USING gist (
    "tenantId" WITH =,
    daterange("effectiveFrom", "effectiveTo", '[]') WITH &&,
    numrange("fromPct", "toPct", '[)') WITH &&
  ) WHERE ("deletedAt" IS NULL)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."CommissionSlabs"', true);
COMMENT ON TABLE "Distribution"."CommissionSlabs" IS 'Commission rate by target-achievement band: 0–80 0.5%, 80–100 1%, 100–120 1.5%, 120+ 2%. Bands are [from, to).';

-- SalesmanCommissions — person card "Commission Rs X · 1.5% slab", slab table
-- "Who's here" + "Commission" total. commission = achieved × rate / 100.
CREATE TABLE "Distribution"."SalesmanCommissions" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"          uuid NOT NULL,                           -- HumanResources.Employees (fk file)
  "salesTargetId"      uuid NOT NULL,
  "periodStart"         date NOT NULL,
  "periodEnd"           date NOT NULL,
  "targetAmount"        numeric(18,2) NOT NULL CHECK ("targetAmount" > 0),
  "achievedAmount"      numeric(18,2) NOT NULL CHECK ("achievedAmount" >= 0),
  "achievementPct"      numeric(9,4) NOT NULL CHECK ("achievementPct" >= 0),
  "commissionSlabId"   uuid NOT NULL,
  "ratePct"             numeric(7,4) NOT NULL CHECK ("ratePct" BETWEEN 0 AND 100),
  "commissionAmount"    numeric(18,2) NOT NULL CHECK ("commissionAmount" >= 0),
  status               text NOT NULL DEFAULT 'DRAFT',
  "approvedByUserId"  uuid,
  "approvedAt"          timestamptz,
  "journalEntryId"     uuid,                                    -- accrual JV — Accounting.Vouchers (fk file)
  "paidAt"              timestamptz,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "salesmanCommissionTargetFk"      FOREIGN KEY ("tenantId", "salesTargetId")     REFERENCES "Distribution"."SalesmanTargets" ("tenantId", id),
  CONSTRAINT "salesmanCommissionSlabFk"        FOREIGN KEY ("tenantId", "commissionSlabId")  REFERENCES "Distribution"."CommissionSlabs" ("tenantId", id),
  CONSTRAINT "salesmanCommissionApprovedByFk" FOREIGN KEY ("tenantId", "approvedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "salesmanCommissionPeriodChk"     CHECK ("periodEnd" >= "periodStart"),
  CONSTRAINT "salesmanCommissionAmountChk"     CHECK ("commissionAmount" = round("achievedAmount" * "ratePct" / 100, 2)),
  CONSTRAINT "salesmanCommissionApprovedChk"   CHECK (status NOT IN ('APPROVED','ACCRUED','PAID')
                                                       OR ("approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL)),
  CONSTRAINT "salesmanCommissionAccruedChk"    CHECK (status NOT IN ('ACCRUED','PAID') OR "journalEntryId" IS NOT NULL),
  CONSTRAINT "salesmanCommissionPaidChk"       CHECK (status <> 'PAID' OR "paidAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Distribution"."SalesmanCommissions"', true);
CREATE UNIQUE INDEX "salesmanCommissionOneLiveUq" ON "Distribution"."SalesmanCommissions" ("tenantId", "salesTargetId")
  WHERE status <> 'CANCELLED';
CREATE INDEX "salesmanCommissionTenantPeriodIdx" ON "Distribution"."SalesmanCommissions" ("tenantId", "periodStart" DESC, status);
COMMENT ON TABLE "Distribution"."SalesmanCommissions" IS 'Commission earned per target period: achieved × slab rate. Accrued by journal, then paid (payroll or cash).';


-- =============================================================================
-- 10. DOCUMENT LOCKS
--     Once a run is dispatched its load cannot change; once a settlement is
--     SETTLED its detail rows are frozen (corrections go through reversal).
-- =============================================================================

-- Generic guard: blocks a child-row write while the parent is in a locked status.
--   TG_ARGV[0] = FK column on the child (e.g. 'runSettlementId')
--   TG_ARGV[1] = parent table          (e.g. 'Distribution.RouteSettlements')
--   TG_ARGV[2] = comma-separated locked statuses (e.g. 'SETTLED')
CREATE OR REPLACE FUNCTION "Distribution"."triggerParentLocked"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vRow"     jsonb;
  "vStatus"  text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    "vRow" := to_jsonb(OLD);
  ELSE
    "vRow" := to_jsonb(NEW);
  END IF;

  EXECUTE format('SELECT status FROM %s WHERE "tenantId" = $1 AND id = $2', TG_ARGV[1]::regclass)
     INTO "vStatus"
    USING ("vRow" ->> 'tenantId')::uuid, ("vRow" ->> TG_ARGV[0])::uuid;

  IF "vStatus" = ANY (string_to_array(TG_ARGV[2], ',')) THEN
    RAISE EXCEPTION '%.% cannot be changed: parent % is %', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_ARGV[1], "vStatus"
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

-- Delivery run: no invoices/lines added or removed after dispatch; updates are
-- still allowed while DISPATCHED (picking flags, LoadSheetInvoices.releasedAt at settlement).
CREATE TRIGGER "distRunInvoiceLockInsDel" BEFORE INSERT OR DELETE ON "Distribution"."LoadSheetInvoices"
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerParentLocked"('deliveryRunId', '"Distribution"."LoadSheets"', 'DISPATCHED,SETTLED,CANCELLED');
CREATE TRIGGER "distRunInvoiceLockUpd" BEFORE UPDATE ON "Distribution"."LoadSheetInvoices"
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerParentLocked"('deliveryRunId', '"Distribution"."LoadSheets"', 'SETTLED,CANCELLED');
CREATE TRIGGER "distLoadSheetLineLock" BEFORE INSERT OR UPDATE OR DELETE ON "Distribution"."LoadSheetLines"
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerParentLocked"('deliveryRunId', '"Distribution"."LoadSheets"', 'DISPATCHED,SETTLED,CANCELLED');

-- Settlement detail is frozen once SETTLED.
CREATE TRIGGER "distSettlementLineLock" BEFORE INSERT OR UPDATE OR DELETE ON "Distribution"."RouteSettlementLines"
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerParentLocked"('runSettlementId', '"Distribution"."RouteSettlements"', 'SETTLED');
CREATE TRIGGER "distSettlementChequeLock" BEFORE INSERT OR UPDATE OR DELETE ON "Distribution"."RouteSettlementCheques"
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerParentLocked"('runSettlementId', '"Distribution"."RouteSettlements"', 'SETTLED');
CREATE TRIGGER "distSettlementReturnLock" BEFORE INSERT OR UPDATE OR DELETE ON "Distribution"."RouteSettlementReturns"
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerParentLocked"('runSettlementId', '"Distribution"."RouteSettlements"', 'SETTLED');
CREATE TRIGGER "distCashCountLineLock" BEFORE INSERT OR UPDATE OR DELETE ON "Distribution"."RouteSettlementCashCounts"
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerParentLocked"('runSettlementId', '"Distribution"."RouteSettlements"', 'SETTLED');
CREATE TRIGGER "distVanStockCountLock" BEFORE INSERT OR UPDATE OR DELETE ON "Distribution"."VanStockCounts"
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerParentLocked"('runSettlementId', '"Distribution"."RouteSettlements"', 'SETTLED');

-- Booking lines are frozen once the booking is converted or cancelled.
CREATE TRIGGER "distOrderBookingLineLock" BEFORE INSERT OR DELETE ON "Distribution"."OrderBookingLines"
  FOR EACH ROW EXECUTE FUNCTION "Distribution"."triggerParentLocked"('orderBookingId', '"Distribution"."OrderBookings"', 'CONVERTED,PARTIAL,CANCELLED');

-- End of 10-dist.sql (34 tables: 32 contract tables + priceTier + BulkInvoiceRunCells)
