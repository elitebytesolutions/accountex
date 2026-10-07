-- =============================================================================
-- Finsoft ERP (FULL) — views/90-inv-views.sql
-- Inventory report views (install order: … → fk/* → 90-views → 91-rls → 95-seed).
--
-- Views named by entities/10-inventory.md (Full):
--   Re-declared from Basic (same columns in the same order; Full appends):
--   Inventory.getWholeStock        Whole Stock, Product Catalogue, Product Detail, Stock Transfers,
--                              Kits & Bundles, Demand & Reorder, Inventory Reports
--                              (+ Full: abcClass, avgDailySales, lastSaleDate, leadDays,
--                               warehouse_vehicle_id)
--   Inventory.getStockValuation      Whole Stock, Product Catalogue, Product Detail, Companies & Brands,
--                              Warehouses, Inventory Reports (identical to Basic)
--     + Inventory.getStockValuationAsOfDate(pAsOf date)   Whole Stock "As on Date" (identical)
--   Inventory.getStockCard           Product Detail, Stock Movements (identical)
--   Inventory.getNearExpiryStock          Batches & Expiry, Inventory Reports (+ Full: report_band)
--   Full only:
--   Inventory.getStockInViewForPeriod(pFrom, pTo) + Inventory.getStockInView (month to date)
--                              Stock In View, Inventory Reports (Stock As On Date, Movement)
--   Inventory.getDeadAndSlowStock      Inventory Reports (Dead / Slow)
--   Inventory.getAbcAnalysis         Inventory Reports (ABC), Stock Count (ABC scope)
--   Inventory.getReorderSuggestions   Demand & Reorder (Reorder Suggestions)
--
-- Rules
--   * Every view is WITH (security_invoker = true): RLS on the base tables
--     (tenantId = Company.getCurrentTenantId(), 91-rls.sql) applies to the caller.
--     The functions are SECURITY INVOKER (the default) for the same reason.
--   * Quantities are base (loose) units; Company.formatCartonsLoose() gives "n CTN + m".
--   * Sales velocity comes from Inventory.StockMovements SALE rows net of SALES_RETURN.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- v_stock_on_hand — one row per stock slot (item × warehouse × bin × batch).
-- Items with no balance row yet appear once with NULL location and qty 0, so
-- "Total Products" and "Out of Stock" count them.
-- stock_status is judged on the ITEM total across all slots (low / high levels
-- are item-wide), following the catalogue stock pill:
--   OUT        item on hand <= max(1, lowLevel / 4)      (red)
--   LOW        item on hand <= lowLevel                  (amber)
--   OVERSTOCK  item on hand >  highLevel (highLevel > 0)
--   IN_STOCK   otherwise                                  (green)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Inventory"."getWholeStock"
WITH (security_invoker = true) AS
WITH slot AS (
  SELECT i."tenantId",
         i.id                               AS "itemId",
         sb.id                              AS "stockBalanceId",
         sb."warehouseId",
         sb."binId",
         sb."batchId",
         COALESCE(sb."qtyOnHand", 0)        AS "qtyOnHand",
         COALESCE(sb."qtyReserved", 0)       AS "qtyReserved",
         COALESCE(sb."qtyAvailable", 0)      AS "qtyAvailable",
         COALESCE(sb.value, 0)              AS "bookValue",
         sb."lastMovementAt",
         sb."lastInDate",
         sb."lastOutDate"
    FROM "Inventory"."Products" i
    LEFT JOIN "Inventory"."StockBalances" sb
           ON sb."tenantId" = i."tenantId" AND sb."itemId" = i.id
   WHERE i."deletedAt" IS NULL OR sb.id IS NOT NULL
), s AS (
  SELECT slot.*,
         sum(slot."qtyOnHand") OVER (PARTITION BY slot."tenantId", slot."itemId") AS "itemQtyOnHand"
    FROM slot
), st AS (
  SELECT s.*,
         CASE
           WHEN s."itemQtyOnHand" <= GREATEST(1, i."lowLevel" / 4)          THEN 'OUT'
           WHEN s."itemQtyOnHand" <= i."lowLevel"                           THEN 'LOW'
           WHEN i."highLevel" > 0 AND s."itemQtyOnHand" > i."highLevel"      THEN 'OVERSTOCK'
           ELSE 'IN_STOCK'
         END AS "stockStatus"
    FROM s
    JOIN "Inventory"."Products" i ON i."tenantId" = s."tenantId" AND i.id = s."itemId"
)
SELECT st."tenantId",
       st."itemId",
       i.sku,
       i.upc,
       i.name                                  AS "itemName",
       i.description                           AS "itemDescription",
       i.status                                AS "itemStatus",
       i."manufacturerId",
       m.code                                  AS "manufacturerCode",
       m.name                                  AS "manufacturerName",
       i."productClassId",
       pc.name                                 AS "className",
       i."productSubclassId",
       psc.name                                AS "subclassName",
       st."stockBalanceId",
       st."warehouseId",
       w.code                                  AS "warehouseCode",
       w.name                                  AS "warehouseName",
       w.type                                  AS "warehouseType",
       w."branchId",
       st."binId",
       bn.code                                 AS "binCode",
       st."batchId",
       b."batchNo",
       b."expiryDate",
       b.disposition                           AS "batchDisposition",
       i.ctn,
       i."defaultShelf",
       st."qtyOnHand",
       "Company"."formatCartonsLoose"(st."qtyOnHand", i.ctn)   AS "qtyCtnLoose",
       st."qtyReserved",
       st."qtyAvailable",
       st."itemQtyOnHand",
       i."lowLevel",
       i."highLevel",
       st."stockStatus",
       CASE st."stockStatus" WHEN 'OUT' THEN 'red' WHEN 'LOW' THEN 'amber' ELSE 'green' END AS "stockTone",
       i."avgCost",
       round(st."qtyOnHand" * i."avgCost", 2)   AS "stockValue",
       st."bookValue",
       st."lastMovementAt",
       st."lastInDate",
       st."lastOutDate",
       i."createdBy",
       cu."fullName"                            AS "createdByName",
       -- FULL: planning attributes
       i."abcClass",
       i."avgDailySales",
       i."lastSaleDate",
       COALESCE(i."leadDays", 14)               AS "leadDays",
       w."vehicleId"                            AS "warehouseVehicleId"
  FROM st
  JOIN "Inventory"."Products" i               ON i."tenantId" = st."tenantId" AND i.id = st."itemId"
  LEFT JOIN "Inventory"."ProductCompanies" m  ON m."tenantId" = i."tenantId" AND m.id = i."manufacturerId"
  LEFT JOIN "Inventory"."ProductClasses" pc     ON pc."tenantId" = i."tenantId" AND pc.id = i."productClassId"
  LEFT JOIN "Inventory"."ProductSubclasses" psc ON psc."tenantId" = i."tenantId" AND psc.id = i."productSubclassId"
  LEFT JOIN "Inventory"."Warehouses" w     ON w."tenantId" = st."tenantId" AND w.id = st."warehouseId"
  LEFT JOIN "Inventory"."WarehouseBins" bn          ON bn."tenantId" = st."tenantId" AND bn.id = st."binId"
  LEFT JOIN "Inventory"."ProductBatches" b         ON b."tenantId" = st."tenantId" AND b.id = st."batchId"
  LEFT JOIN "Company"."Users" cu    ON cu."tenantId" = i."tenantId" AND cu.id = i."createdBy";

COMMENT ON VIEW "Inventory"."getWholeStock" IS
  'Current stock per slot (item × warehouse × bin × batch) with item status OUT / LOW / OVERSTOCK / IN_STOCK. '
  'Screens: Whole Stock (app/inventory/stock, Current view + KPIs), Product Catalogue (Stock pill, Low Stock filter), '
  'Product Detail (stock by location), Stock Transfers (location cards), Kits & Bundles (on hand / can build), '
  'Demand & Reorder (Available Stock), Inventory Reports (Over Stock).';

-- ---------------------------------------------------------------------------
-- v_stock_valuation — current value per item × warehouse at weighted-average
-- cost (Inventory.Products.avgCost). pctOfTotal is the share of the tenant's total
-- stock value. bookValue = Σ StockBalances.value (ledger cost) for reconciling.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Inventory"."getStockValuation"
WITH (security_invoker = true) AS
WITH q AS (
  SELECT sb."tenantId",
         sb."itemId",
         sb."warehouseId",
         sum(sb."qtyOnHand")        AS qty,
         sum(sb.value)              AS "bookValue",
         max(sb."lastMovementAt")   AS "lastMovementAt"
    FROM "Inventory"."StockBalances" sb
   GROUP BY sb."tenantId", sb."itemId", sb."warehouseId"
), v AS (
  SELECT q.*,
         i."avgCost",
         round(q.qty * i."avgCost", 2) AS value
    FROM q
    JOIN "Inventory"."Products" i ON i."tenantId" = q."tenantId" AND i.id = q."itemId"
)
SELECT v."tenantId",
       v."itemId",
       i.sku,
       i.name                               AS "itemName",
       i.status                             AS "itemStatus",
       i."manufacturerId",
       m.name                               AS "manufacturerName",
       i."productClassId",
       pc.name                              AS "className",
       i."productSubclassId",
       psc.name                             AS "subclassName",
       u.code                               AS "uomCode",
       i.ctn,
       i."lowLevel",
       v."warehouseId",
       w.code                               AS "warehouseCode",
       w.name                               AS "warehouseName",
       v.qty,
       "Company"."formatCartonsLoose"(v.qty, i.ctn)         AS "qtyCtnLoose",
       v."avgCost",
       v.value,
       round(100 * v.value / NULLIF(sum(v.value) OVER (PARTITION BY v."tenantId"), 0), 4) AS "pctOfTotal",
       v."bookValue",
       i.price                              AS "retailPrice",
       round(v.qty * i.price, 2)            AS "saleValue",          -- Report Studio "Stock Basis: Sale"
       v."lastMovementAt"
  FROM v
  JOIN "Inventory"."Products" i               ON i."tenantId" = v."tenantId" AND i.id = v."itemId"
  JOIN "Inventory"."UnitsOfMeasure" u                ON u."tenantId" = i."tenantId" AND u.id = i."uomId"
  JOIN "Inventory"."Warehouses" w          ON w."tenantId" = v."tenantId" AND w.id = v."warehouseId"
  LEFT JOIN "Inventory"."ProductCompanies" m  ON m."tenantId" = i."tenantId" AND m.id = i."manufacturerId"
  LEFT JOIN "Inventory"."ProductClasses" pc     ON pc."tenantId" = i."tenantId" AND pc.id = i."productClassId"
  LEFT JOIN "Inventory"."ProductSubclasses" psc ON psc."tenantId" = i."tenantId" AND psc.id = i."productSubclassId";

COMMENT ON VIEW "Inventory"."getStockValuation" IS
  'Current stock value per item × warehouse at weighted-average cost, with % of total. '
  'Screens: Whole Stock (Total Stock Value), Product Catalogue (Stock List tab), Product Detail (Stock value), '
  'Companies & Brands (drawer Stock value), Warehouses (Stock value, SKUs, Total Stock Value KPI), '
  'Inventory Reports (Current Stock, Value).';

-- ---------------------------------------------------------------------------
-- fn_stock_valuation(pAsOf) — the same shape rebuilt from Inventory.StockMovements
-- for movements dated <= pAsOf (Whole Stock "Stock View: As on Date").
-- avgCost = ledger carrying value / qty as of the date (moving-average cost
-- of what was on hand); when qty <= 0 the current item.avgCost is used.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Inventory"."getStockValuationAsOfDate"("pAsOf" date)
RETURNS TABLE (
  "tenantId"          uuid,
  "itemId"            uuid,
  sku                text,
  "itemName"          text,
  "manufacturerId"    uuid,
  "manufacturerName"  text,
  "productClassId"   uuid,
  "className"         text,
  ctn                integer,
  "warehouseId"       uuid,
  "warehouseCode"     text,
  "warehouseName"     text,
  qty                numeric,
  "qtyCtnLoose"      text,
  "avgCost"           numeric,
  value              numeric,
  "pctOfTotal"       numeric,
  "bookValue"         numeric,
  "lastMovementDate" date
)
LANGUAGE sql STABLE AS $$
  WITH l AS (
    SELECT sl."tenantId",
           sl."itemId",
           sl."warehouseId",
           sum(sl."qtyIn" - sl."qtyOut")  AS qty,
           sum(sl.value)                AS "bookValue",
           max(sl."movementDate")        AS "lastMovementDate"
      FROM "Inventory"."StockMovements" sl
     WHERE sl."movementDate" <= "pAsOf"
     GROUP BY sl."tenantId", sl."itemId", sl."warehouseId"
  ), v AS (
    SELECT l.*,
           CASE WHEN l.qty > 0 THEN round(l."bookValue" / l.qty, 4) ELSE i."avgCost" END AS "avgCost"
      FROM l
      JOIN "Inventory"."Products" i ON i."tenantId" = l."tenantId" AND i.id = l."itemId"
  ), x AS (
    SELECT v.*,
           round(v.qty * v."avgCost", 2) AS value
      FROM v
  )
  SELECT x."tenantId",
         x."itemId",
         i.sku,
         i.name,
         i."manufacturerId",
         m.name,
         i."productClassId",
         pc.name,
         i.ctn,
         x."warehouseId",
         w.code,
         w.name,
         x.qty,
         "Company"."formatCartonsLoose"(x.qty, i.ctn),
         x."avgCost",
         x.value,
         round(100 * x.value / NULLIF(sum(x.value) OVER (PARTITION BY x."tenantId"), 0), 4),
         x."bookValue",
         x."lastMovementDate"
    FROM x
    JOIN "Inventory"."Products" i               ON i."tenantId" = x."tenantId" AND i.id = x."itemId"
    JOIN "Inventory"."Warehouses" w          ON w."tenantId" = x."tenantId" AND w.id = x."warehouseId"
    LEFT JOIN "Inventory"."ProductCompanies" m  ON m."tenantId" = i."tenantId" AND m.id = i."manufacturerId"
    LEFT JOIN "Inventory"."ProductClasses" pc ON pc."tenantId" = i."tenantId" AND pc.id = i."productClassId"
$$;

COMMENT ON FUNCTION "Inventory"."getStockValuationAsOfDate"(date) IS
  'Stock quantity and value per item × warehouse as on a date, rebuilt from Inventory.StockMovements (movementDate <= pAsOf). '
  'Screen: Whole Stock (app/inventory/stock, Stock View "As on Date"). SECURITY INVOKER: RLS applies.';

-- ---------------------------------------------------------------------------
-- v_stock_card — ledger rows with running balances.
--   runningBalance       per item × warehouse (Stock Card for one location)
--   item_running_balance  per item across all warehouses (Stock Card "all")
-- Ordered by movementDate, then seq (identity: deterministic insert order).
-- Filter by item / warehouse (pushed below the window); filter dates in the
-- outer query so the balance still includes earlier movements.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Inventory"."getStockCard"
WITH (security_invoker = true) AS
SELECT sl."tenantId",
       sl.id                                   AS "ledgerId",
       sl.seq,
       sl."movementDate",
       sl."movementAt",
       sl."itemId",
       i.sku,
       i.name                                  AS "itemName",
       i.ctn,
       sl."warehouseId",
       w.code                                  AS "warehouseCode",
       w.name                                  AS "warehouseName",
       sl."binId",
       bn.code                                 AS "binCode",
       sl."batchId",
       b."batchNo",
       sl."expiryDate",
       sl."movementType",
       CASE WHEN sl."qtyIn" > 0 THEN 'IN' ELSE 'OUT' END AS direction,
       sl."qtyIn",
       sl."qtyOut",
       sl."qtyIn" - sl."qtyOut"                  AS "qtyChange",
       sl."unitCost",
       sl.value,
       sum(sl."qtyIn" - sl."qtyOut") OVER "wSlot" AS "runningBalance",
       sum(sl.value)               OVER "wSlot" AS "runningValue",
       sum(sl."qtyIn" - sl."qtyOut") OVER "wItem" AS "itemRunningBalance",
       sl."reasonId",
       mr.label                                AS "reasonLabel",
       sl."sourceDocType",
       sl."sourceDocId",
       sl."sourceDocNo",
       sl."sourceLineId",
       sl."counterWarehouseId",
       cw.code                                 AS "counterWarehouseCode",
       cw.name                                 AS "counterWarehouseName",
       sl."partyLabel",
       sl."userId",
       u."fullName"                             AS "userName",
       sl.remarks
  FROM "Inventory"."StockMovements" sl
  JOIN "Inventory"."Products" i                 ON i."tenantId" = sl."tenantId" AND i.id = sl."itemId"
  JOIN "Inventory"."Warehouses" w            ON w."tenantId" = sl."tenantId" AND w.id = sl."warehouseId"
  LEFT JOIN "Inventory"."WarehouseBins" bn            ON bn."tenantId" = sl."tenantId" AND bn.id = sl."binId"
  LEFT JOIN "Inventory"."ProductBatches" b           ON b."tenantId" = sl."tenantId" AND b.id = sl."batchId"
  LEFT JOIN "Inventory"."StockMovementReasons" mr ON mr."tenantId" = sl."tenantId" AND mr.id = sl."reasonId"
  LEFT JOIN "Inventory"."Warehouses" cw      ON cw."tenantId" = sl."tenantId" AND cw.id = sl."counterWarehouseId"
  LEFT JOIN "Company"."Users" u       ON u."tenantId" = sl."tenantId" AND u.id = sl."userId"
WINDOW "wSlot" AS (PARTITION BY sl."tenantId", sl."itemId", sl."warehouseId"
                  ORDER BY sl."movementDate", sl.seq ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
       "wItem" AS (PARTITION BY sl."tenantId", sl."itemId"
                  ORDER BY sl."movementDate", sl.seq ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW);

COMMENT ON VIEW "Inventory"."getStockCard" IS
  'Stock ledger rows with running balance per item × warehouse (and per item), ordered by movementDate, seq; '
  'with user, reason, batch and counter-warehouse names. '
  'Screens: Product Detail (Stock Card tab), Stock Movements (app/inventory/movements).';

-- ---------------------------------------------------------------------------
-- v_near_expiry — on-hand stock per batch × warehouse for dated batches,
-- FEFO ranked. band: EXPIRED (< today) / DAYS_30 / DAYS_90 / DAYS_183 / LATER.
-- suggested_disposition (default rule from the Batches & Expiry screen):
--   expired -> QUARANTINE, <= 90 days -> PRIORITY, else SALEABLE;
--   manual dispositions (CLEARANCE, RETURN_TO_PRINCIPAL, WRITTEN_OFF) are kept.
-- value = qty × batch.unitCost (falls back to item.avgCost).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Inventory"."getNearExpiryStock"
WITH (security_invoker = true) AS
WITH q AS (
  SELECT sb."tenantId",
         sb."itemId",
         sb."warehouseId",
         sb."batchId",
         sum(sb."qtyOnHand")    AS qty,
         sum(sb."qtyAvailable")  AS "qtyAvailable"
    FROM "Inventory"."StockBalances" sb
   WHERE sb."batchId" IS NOT NULL
   GROUP BY sb."tenantId", sb."itemId", sb."warehouseId", sb."batchId"
  HAVING sum(sb."qtyOnHand") > 0
), d AS (
  SELECT q.*,
         b."batchNo",
         b."mfgDate",
         b."expiryDate",
         b.disposition,
         (b."expiryDate" - current_date)          AS "daysLeft",
         COALESCE(b."unitCost", i."avgCost")       AS "unitCost"
    FROM q
    JOIN "Inventory"."ProductBatches" b ON b."tenantId" = q."tenantId" AND b.id = q."batchId"
    JOIN "Inventory"."Products"  i ON i."tenantId" = q."tenantId" AND i.id = q."itemId"
   WHERE b."expiryDate" IS NOT NULL
)
SELECT d."tenantId",
       d."itemId",
       i.sku,
       i.name                                  AS "itemName",
       i."manufacturerId",
       m.name                                  AS "manufacturerName",
       d."batchId",
       d."batchNo",
       d."warehouseId",
       w.code                                  AS "warehouseCode",
       w.name                                  AS "warehouseName",
       d."mfgDate",
       d."expiryDate",
       date_trunc('month', d."expiryDate")::date AS "expiryMonth",
       d."daysLeft",
       d.qty,
       "Company"."formatCartonsLoose"(d.qty, i.ctn)            AS "qtyCtnLoose",
       d."qtyAvailable",
       d."unitCost",
       round(d.qty * d."unitCost", 2)           AS value,
       CASE
         WHEN d."daysLeft" < 0    THEN 'EXPIRED'
         WHEN d."daysLeft" <= 30  THEN 'DAYS_30'
         WHEN d."daysLeft" <= 90  THEN 'DAYS_90'
         WHEN d."daysLeft" <= 183 THEN 'DAYS_183'
         ELSE 'LATER'
       END                                     AS band,
       d.disposition,
       CASE
         WHEN d.disposition IN ('CLEARANCE','RETURN_TO_PRINCIPAL','WRITTEN_OFF') THEN d.disposition
         WHEN d."daysLeft" < 0   THEN 'QUARANTINE'
         WHEN d."daysLeft" <= 90 THEN 'PRIORITY'
         ELSE 'SALEABLE'
       END                                     AS "suggestedDisposition",
       row_number() OVER (PARTITION BY d."tenantId", d."itemId", d."warehouseId"
                          ORDER BY d."expiryDate", d."batchNo") AS "fefoRank",
       -- FULL: Inventory Reports near-expiry bands (≤ 90 / 91–180 / 181–365)
       CASE
         WHEN d."daysLeft" < 0    THEN 'EXPIRED'
         WHEN d."daysLeft" <= 90  THEN 'D0_90'
         WHEN d."daysLeft" <= 180 THEN 'D91_180'
         WHEN d."daysLeft" <= 365 THEN 'D181_365'
         ELSE 'OVER_365'
       END                                     AS "reportBand"
  FROM d
  JOIN "Inventory"."Products" i              ON i."tenantId" = d."tenantId" AND i.id = d."itemId"
  JOIN "Inventory"."Warehouses" w         ON w."tenantId" = d."tenantId" AND w.id = d."warehouseId"
  LEFT JOIN "Inventory"."ProductCompanies" m ON m."tenantId" = i."tenantId" AND m.id = i."manufacturerId";

COMMENT ON VIEW "Inventory"."getNearExpiryStock" IS
  'On-hand batches with an expiry date per warehouse: days left, value at batch cost, band '
  '(EXPIRED / DAYS_30 / DAYS_90 / DAYS_183 / LATER), suggested disposition and FEFO rank. '
  'Screens: Batches & Expiry (app/inventory/batches: window cards, timeline, calendar, register), '
  'Inventory Reports (Near Expiry, report_band).';

-- #############################################################################
-- FULL EDITION — everything below is not in erp-basic.
-- #############################################################################

-- ---------------------------------------------------------------------------
-- fn_stock_in_view(pFrom, pTo) — opening / in / out / closing per
-- manufacturer × item × warehouse × batch for a period (Stock In View).
--   openingQty = Σ(in − out) dated  < pFrom
--   inQty / outQty / inValue / outValue = movements pFrom … pTo
--   closingQty = opening + in − out
-- Values are at ledger cost (qty × unitCost). Transfers count as in / out of
-- the warehouse they touch. Rows with no opening and no movement are skipped.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Inventory"."getStockInViewForPeriod"("pFrom" date, "pTo" date)
RETURNS TABLE (
  "tenantId"             uuid,
  "manufacturerId"       uuid,
  "manufacturerCode"     text,
  "manufacturerName"     text,
  "itemId"               uuid,
  sku                   text,
  "itemName"             text,
  ctn                   integer,
  "distributorVendorId" uuid,
  "warehouseId"          uuid,
  "warehouseCode"        text,
  "warehouseName"        text,
  "batchId"              uuid,
  "batchNo"              text,
  "openingQty"           numeric,
  "inQty"                numeric,
  "outQty"               numeric,
  "closingQty"           numeric,
  "inValue"              numeric,
  "outValue"             numeric,
  "netValue"             numeric,
  "lastMovementDate"    date
)
LANGUAGE sql STABLE AS $$
  WITH a AS (
    SELECT sl."tenantId",
           sl."itemId",
           sl."warehouseId",
           sl."batchId",
           COALESCE(sum(sl."qtyIn" - sl."qtyOut") FILTER (WHERE sl."movementDate" < "pFrom"), 0)                AS "openingQty",
           COALESCE(sum(sl."qtyIn")  FILTER (WHERE sl."movementDate" >= "pFrom"), 0)                           AS "inQty",
           COALESCE(sum(sl."qtyOut") FILTER (WHERE sl."movementDate" >= "pFrom"), 0)                           AS "outQty",
           COALESCE(round(sum(sl."qtyIn"  * sl."unitCost") FILTER (WHERE sl."movementDate" >= "pFrom"), 2), 0)  AS "inValue",
           COALESCE(round(sum(sl."qtyOut" * sl."unitCost") FILTER (WHERE sl."movementDate" >= "pFrom"), 2), 0)  AS "outValue",
           max(sl."movementDate")                                                                            AS "lastMovementDate"
      FROM "Inventory"."StockMovements" sl
     WHERE sl."movementDate" <= "pTo"
     GROUP BY sl."tenantId", sl."itemId", sl."warehouseId", sl."batchId"
  )
  SELECT a."tenantId",
         i."manufacturerId",
         m.code,
         m.name,
         a."itemId",
         i.sku,
         i.name,
         i.ctn,
         i."distributorVendorId",
         a."warehouseId",
         w.code,
         w.name,
         a."batchId",
         b."batchNo",
         a."openingQty",
         a."inQty",
         a."outQty",
         a."openingQty" + a."inQty" - a."outQty",
         a."inValue",
         a."outValue",
         a."inValue" - a."outValue",
         a."lastMovementDate"
    FROM a
    JOIN "Inventory"."Products" i              ON i."tenantId" = a."tenantId" AND i.id = a."itemId"
    JOIN "Inventory"."Warehouses" w         ON w."tenantId" = a."tenantId" AND w.id = a."warehouseId"
    LEFT JOIN "Inventory"."ProductCompanies" m ON m."tenantId" = i."tenantId" AND m.id = i."manufacturerId"
    LEFT JOIN "Inventory"."ProductBatches" b        ON b."tenantId" = a."tenantId" AND b.id = a."batchId"
   WHERE a."openingQty" <> 0 OR a."inQty" <> 0 OR a."outQty" <> 0
$$;

COMMENT ON FUNCTION "Inventory"."getStockInViewForPeriod"(date, date) IS
  'Opening, in, out and closing stock (qty and value) per manufacturer × item × warehouse × batch for pFrom … pTo, '
  'from Inventory.StockMovements. Screens: Stock In View (app/inventory/stock-view, Stock In / Stock In Out tabs), '
  'Inventory Reports (Stock As On Date, Movement). SECURITY INVOKER: RLS applies.';

-- v_stock_in_view — the period report for the current month to date (the
-- name the entity doc reads). For any other period call Inventory.getStockInViewForPeriod.
CREATE OR REPLACE VIEW "Inventory"."getStockInView"
WITH (security_invoker = true) AS
SELECT date_trunc('month', current_date)::date AS "periodFrom",
       current_date                            AS "periodTo",
       f.*
  FROM "Inventory"."getStockInViewForPeriod"(date_trunc('month', current_date)::date, current_date) AS f;

COMMENT ON VIEW "Inventory"."getStockInView" IS
  'Stock In View for the current month to date (wraps Inventory.getStockInViewForPeriod; use the function for any other period). '
  'Screens: Stock In View (app/inventory/stock-view), Inventory Reports (Stock As On Date, Movement).';

-- ---------------------------------------------------------------------------
-- v_dead_slow_stock — items with stock on hand and the days since their last
-- sale (Inventory.Products.lastSaleDate, kept by the SALE ledger trigger). Items never
-- sold are measured from their first ledger movement (never_sold = true).
--   DEAD 180+ · SLOW 90+ · WATCH 60+ · MOVING otherwise
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Inventory"."getDeadAndSlowStock"
WITH (security_invoker = true) AS
WITH oh AS (
  SELECT sb."tenantId",
         sb."itemId",
         sum(sb."qtyOnHand")        AS "qtyOnHand",
         max(sb."lastMovementAt")   AS "lastMovementAt",
         max(sb."lastInDate")       AS "lastInDate"
    FROM "Inventory"."StockBalances" sb
   GROUP BY sb."tenantId", sb."itemId"
  HAVING sum(sb."qtyOnHand") > 0
), r AS (
  SELECT oh.*,
         i."lastSaleDate",
         (i."lastSaleDate" IS NULL) AS "neverSold",
         COALESCE(i."lastSaleDate",
                  (SELECT min(sl."movementDate")
                     FROM "Inventory"."StockMovements" sl
                    WHERE sl."tenantId" = oh."tenantId" AND sl."itemId" = oh."itemId")) AS "referenceDate"
    FROM oh
    JOIN "Inventory"."Products" i ON i."tenantId" = oh."tenantId" AND i.id = oh."itemId"
), d AS (
  SELECT r.*, (current_date - r."referenceDate") AS "daysSinceLastSale"
    FROM r
)
SELECT d."tenantId",
       d."itemId",
       i.sku,
       i.name                                  AS "itemName",
       i."manufacturerId",
       m.name                                  AS "manufacturerName",
       i."productClassId",
       pc.name                                 AS "className",
       d."qtyOnHand",
       "Company"."formatCartonsLoose"(d."qtyOnHand", i.ctn)    AS "qtyCtnLoose",
       i."avgCost"                              AS "unitCost",
       round(d."qtyOnHand" * i."avgCost", 2)    AS "valueLocked",
       d."lastSaleDate",
       d."neverSold",
       d."referenceDate",
       d."daysSinceLastSale",
       CASE
         WHEN d."daysSinceLastSale" >= 180 THEN 'DEAD'
         WHEN d."daysSinceLastSale" >= 90  THEN 'SLOW'
         WHEN d."daysSinceLastSale" >= 60  THEN 'WATCH'
         ELSE 'MOVING'
       END                                     AS status,
       d."lastInDate",
       d."lastMovementAt"
  FROM d
  JOIN "Inventory"."Products" i                ON i."tenantId" = d."tenantId" AND i.id = d."itemId"
  LEFT JOIN "Inventory"."ProductCompanies" m   ON m."tenantId" = i."tenantId" AND m.id = i."manufacturerId"
  LEFT JOIN "Inventory"."ProductClasses" pc ON pc."tenantId" = i."tenantId" AND pc.id = i."productClassId";

COMMENT ON VIEW "Inventory"."getDeadAndSlowStock" IS
  'Items with stock: days since last sale, value locked at average cost, status WATCH (60+) / SLOW (90+) / DEAD (180+) / MOVING. '
  'Screen: Inventory Reports (app/inventory/reports, Dead / Slow tab).';

-- ---------------------------------------------------------------------------
-- v_abc_analysis — Pareto classification on the trailing 365 days.
--   annual_units        = SALE qtyOut − SALES_RETURN qtyIn (floored at 0)
--   annual_usage_value  = annual_units × item.avgCost
--   cumulative_pct      = running share, highest usage value first
--   class A: cumulative <= 80 % (the top item is always A) · B: <= 95 % · C: rest
--   (items with no usage are C). The window is per tenant: filtering the view
--   does not recompute classes for the subset. stored_abc_class = Inventory.Products.abcClass.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Inventory"."getAbcAnalysis"
WITH (security_invoker = true) AS
WITH u AS (
  SELECT sl."tenantId",
         sl."itemId",
         COALESCE(sum(sl."qtyOut") FILTER (WHERE sl."movementType" = 'SALE'), 0)
       - COALESCE(sum(sl."qtyIn")  FILTER (WHERE sl."movementType" = 'SALES_RETURN'), 0) AS units
    FROM "Inventory"."StockMovements" sl
   WHERE sl."movementType" IN ('SALE','SALES_RETURN')
     AND sl."movementDate" >  current_date - 365
     AND sl."movementDate" <= current_date
   GROUP BY sl."tenantId", sl."itemId"
), oh AS (
  SELECT sb."tenantId", sb."itemId", sum(sb."qtyOnHand") AS "qtyOnHand"
    FROM "Inventory"."StockBalances" sb
   GROUP BY sb."tenantId", sb."itemId"
), base AS (
  SELECT i."tenantId",
         i.id                                                      AS "itemId",
         GREATEST(COALESCE(u.units, 0), 0)                         AS "annualUnits",
         i."avgCost"                                                AS "unitCost",
         round(GREATEST(COALESCE(u.units, 0), 0) * i."avgCost", 2)  AS "annualUsageValue",
         COALESCE(oh."qtyOnHand", 0)                               AS "qtyOnHand"
    FROM "Inventory"."Products" i
    LEFT JOIN u  ON u."tenantId"  = i."tenantId" AND u."itemId"  = i.id
    LEFT JOIN oh ON oh."tenantId" = i."tenantId" AND oh."itemId" = i.id
   WHERE i."deletedAt" IS NULL
     AND i.status <> 'DRAFT'
), r AS (
  SELECT base.*,
         row_number() OVER "wRank"                                        AS "usageRank",
         sum(base."annualUsageValue") OVER (PARTITION BY base."tenantId") AS "totalUsageValue",
         sum(base."annualUsageValue") OVER "wCum"                         AS "cumulativeValue"
    FROM base
  WINDOW "wRank" AS (PARTITION BY base."tenantId" ORDER BY base."annualUsageValue" DESC, base."itemId"),
         "wCum"  AS (PARTITION BY base."tenantId" ORDER BY base."annualUsageValue" DESC, base."itemId"
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
), p AS (
  SELECT r.*,
         round(100 * r."annualUsageValue" / NULLIF(r."totalUsageValue", 0), 4) AS "pctOfTotal",
         round(100 * r."cumulativeValue"   / NULLIF(r."totalUsageValue", 0), 4) AS "cumulativePct"
    FROM r
)
SELECT p."tenantId",
       p."itemId",
       i.sku,
       i.name                                  AS "itemName",
       i."manufacturerId",
       m.name                                  AS "manufacturerName",
       i."productClassId",
       pc.name                                 AS "className",
       p."annualUnits",
       p."unitCost",
       p."annualUsageValue",
       p."pctOfTotal",
       p."cumulativePct",
       p."usageRank",
       CASE
         WHEN p."annualUsageValue" <= 0                  THEN 'C'
         WHEN p."usageRank" = 1 OR p."cumulativePct" <= 80 THEN 'A'
         WHEN p."cumulativePct" <= 95                     THEN 'B'
         ELSE 'C'
       END                                     AS "abcClass",
       i."abcClass"                             AS "storedAbcClass",
       p."qtyOnHand",
       round(p."qtyOnHand" * p."unitCost", 2)   AS "stockValue",
       (current_date - 364)                    AS "periodFrom",
       current_date                            AS "periodTo"
  FROM p
  JOIN "Inventory"."Products" i                ON i."tenantId" = p."tenantId" AND i.id = p."itemId"
  LEFT JOIN "Inventory"."ProductCompanies" m   ON m."tenantId" = i."tenantId" AND m.id = i."manufacturerId"
  LEFT JOIN "Inventory"."ProductClasses" pc ON pc."tenantId" = i."tenantId" AND pc.id = i."productClassId";

COMMENT ON VIEW "Inventory"."getAbcAnalysis" IS
  'ABC classification on trailing-365-day sales usage value (A <= 80 % cumulative, B <= 95 %, C rest); '
  'source for refreshing Inventory.Products.abcClass. Screens: Inventory Reports (ABC tab), Stock Count (scope "ABC · A-items only").';

-- ---------------------------------------------------------------------------
-- v_reorder_suggestion — one row per ACTIVE item (all warehouses together).
--   low / high     = active item-wide Inventory.ReorderRules (warehouseId NULL), else item levels
--   leadDays      = item.leadDays, else rule.leadDays, else 14
--   safetyDays    = rule.safetyDays, else 14;  coverAlertDays = rule, else 21
--   ads            = item.avgDailySales, else net sales of the last 90 days / 90
--   cover_days     = stock / ads
--   need_qty       = max(high − stock, ceil(ads × (lead + safety) − stock))
--   suggested_ctn  = max(1, ceil(need / ctn)) for flagged rows or need > 0, else 0
--   is_flagged     = stock <= low OR cover_days < coverAlertDays
-- Supplier = preferred Inventory.ProductSuppliers (then highest share / latest purchase),
-- else item.distributorVendorId. Group the result by supplier_vendor_id;
-- supplier_* window columns give per-supplier totals of the flagged rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Inventory"."getReorderSuggestions"
WITH (security_invoker = true) AS
WITH oh AS (
  SELECT sb."tenantId", sb."itemId",
         sum(sb."qtyOnHand")   AS "qtyOnHand",
         sum(sb."qtyAvailable") AS "qtyAvailable"
    FROM "Inventory"."StockBalances" sb
   GROUP BY sb."tenantId", sb."itemId"
), s90 AS (
  SELECT sl."tenantId", sl."itemId",
         COALESCE(sum(sl."qtyOut") FILTER (WHERE sl."movementType" = 'SALE'), 0)
       - COALESCE(sum(sl."qtyIn")  FILTER (WHERE sl."movementType" = 'SALES_RETURN'), 0) AS units
    FROM "Inventory"."StockMovements" sl
   WHERE sl."movementType" IN ('SALE','SALES_RETURN')
     AND sl."movementDate" >  current_date - 90
     AND sl."movementDate" <= current_date
   GROUP BY sl."tenantId", sl."itemId"
), sup AS (
  SELECT DISTINCT ON (isup."tenantId", isup."itemId")
         isup."tenantId", isup."itemId", isup."vendorId", isup."lastPrice", isup."isPreferred"
    FROM "Inventory"."ProductSuppliers" isup
   ORDER BY isup."tenantId", isup."itemId", isup."isPreferred" DESC,
            isup."sharePct" DESC NULLS LAST, isup."lastPurchaseDate" DESC NULLS LAST
), p AS (
  SELECT i."tenantId",
         i.id                                                   AS "itemId",
         COALESCE(rr."lowLevel",  i."lowLevel")                   AS "lowLevel",
         COALESCE(rr."highLevel", i."highLevel")                  AS "highLevel",
         COALESCE(i."leadDays", rr."leadDays", 14)                AS "leadDays",
         COALESCE(rr."safetyDays", 14)                           AS "safetyDays",
         COALESCE(rr."coverAlertDays", 21)                      AS "coverAlertDays",
         COALESCE(oh."qtyOnHand", 0)                            AS "qtyOnHand",
         COALESCE(oh."qtyAvailable", 0)                          AS "qtyAvailable",
         COALESCE(i."avgDailySales", round(GREATEST(s90.units, 0) / 90.0, 3), 0) AS "avgDailySales",
         (i."avgDailySales" IS NULL)                            AS "adsFromLedger",
         sup."vendorId"                                          AS "itemSupplierVendorId",
         sup."isPreferred",
         sup."lastPrice",
         (rr.id IS NOT NULL)                                    AS "hasReorderRule"
    FROM "Inventory"."Products" i
    LEFT JOIN "Inventory"."ReorderRules" rr ON rr."tenantId" = i."tenantId" AND rr."itemId" = i.id
                                 AND rr."warehouseId" IS NULL AND rr."isActive"
    LEFT JOIN oh  ON oh."tenantId"  = i."tenantId" AND oh."itemId"  = i.id
    LEFT JOIN s90 ON s90."tenantId" = i."tenantId" AND s90."itemId" = i.id
    LEFT JOIN sup ON sup."tenantId" = i."tenantId" AND sup."itemId" = i.id
   WHERE i."deletedAt" IS NULL
     AND i.status = 'ACTIVE'
), n AS (
  SELECT p.*,
         CASE WHEN p."avgDailySales" > 0 THEN round(p."qtyOnHand" / p."avgDailySales", 1) END AS "coverDays",
         GREATEST(p."highLevel" - p."qtyOnHand",
                  ceil(p."avgDailySales" * (p."leadDays" + p."safetyDays") - p."qtyOnHand"))    AS "needQty"
    FROM p
), f AS (
  SELECT n.*,
         (n."qtyOnHand" <= n."lowLevel"
          OR (n."coverDays" IS NOT NULL AND n."coverDays" < n."coverAlertDays")) AS "isFlagged"
    FROM n
), g AS (
  SELECT f.*,
         i.ctn,
         CASE WHEN f."isFlagged" OR f."needQty" > 0
              THEN GREATEST(1, ceil(f."needQty" / i.ctn))::integer
              ELSE 0 END                                              AS "suggestedCtn",
         COALESCE(f."lastPrice", i.cost)                               AS "unitPrice",
         COALESCE(f."itemSupplierVendorId", i."distributorVendorId") AS "supplierVendorId",
         CASE WHEN f."itemSupplierVendorId" IS NOT NULL AND f."isPreferred" THEN 'PREFERRED'
              WHEN f."itemSupplierVendorId" IS NOT NULL THEN 'ITEM_SUPPLIER'
              WHEN i."distributorVendorId" IS NOT NULL   THEN 'DISTRIBUTOR'
              ELSE 'NONE' END                                         AS "supplierSource"
    FROM f
    JOIN "Inventory"."Products" i ON i."tenantId" = f."tenantId" AND i.id = f."itemId"
), v AS (
  SELECT g.*,
         g."suggestedCtn" * g.ctn                                  AS "suggestedQty",
         round(g."suggestedCtn" * g.ctn * g."unitPrice", 2)         AS "suggestedValue"
    FROM g
)
SELECT v."tenantId",
       v."supplierVendorId",
       vd.code                                 AS "supplierCode",
       vd.name                                 AS supplier,
       v."supplierSource",
       v."itemId",
       i.sku,
       i.name                                  AS "itemName",
       i."manufacturerId",
       m.name                                  AS "manufacturerName",
       v.ctn,
       v."qtyOnHand",
       "Company"."formatCartonsLoose"(v."qtyOnHand", v.ctn)    AS "qtyCtnLoose",
       v."qtyAvailable",
       v."lowLevel",
       v."highLevel",
       v."avgDailySales",
       v."adsFromLedger",
       v."coverDays",
       v."leadDays",
       v."safetyDays",
       v."coverAlertDays",
       v."needQty",
       v."suggestedCtn",
       v."suggestedQty",
       v."unitPrice",
       v."suggestedValue",
       v."isFlagged",
       v."hasReorderRule",
       count(*)               FILTER (WHERE v."isFlagged") OVER "wSup" AS "supplierFlaggedItems",
       sum(v."suggestedValue") FILTER (WHERE v."isFlagged") OVER "wSup" AS "supplierFlaggedValue"
  FROM v
  JOIN "Inventory"."Products" i               ON i."tenantId" = v."tenantId" AND i.id = v."itemId"
  LEFT JOIN "Inventory"."ProductCompanies" m  ON m."tenantId" = i."tenantId" AND m.id = i."manufacturerId"
  LEFT JOIN "Purchases"."Vendors" vd  ON vd."tenantId" = v."tenantId" AND vd.id = v."supplierVendorId"
WINDOW "wSup" AS (PARTITION BY v."tenantId", v."supplierVendorId");

COMMENT ON VIEW "Inventory"."getReorderSuggestions" IS
  'Reorder suggestions per active item, grouped by preferred supplier: on hand, low / high, avg per day, cover days, '
  'need = max(high − stock, ceil(ads × (lead + 14) − stock)), suggested CTN = max(1, ceil(need / ctn)), '
  'flagged when stock <= low or cover < 21 days. Screen: Demand & Reorder (app/inventory/demand, Reorder Suggestions).';
