-- =============================================================================
-- Finsoft ERP (BASIC) — views/90-inv-views.sql
-- Inventory report views (install order: … → fk/* → 90-views → 91-rls → 95-seed).
--
-- Views named by entities/10-inventory.md (Basic):
--   Inventory.getWholeStock        Whole Stock, Product Catalogue, Product Detail, Stock Transfers
--   Inventory.getStockValuation      Whole Stock, Product Catalogue (Stock List), Product Detail,
--                              Companies & Brands, Warehouses
--     + Inventory.getStockValuationAsOfDate(pAsOf date)   Whole Stock "Stock As On Date"
--   Inventory.getStockCard           Product Detail (Stock Card), Stock Movements
--   Inventory.getNearExpiryStock          Batches & Expiry
--
-- Rules
--   * Every view is WITH (security_invoker = true): RLS on the base tables
--     (tenantId = Company.getCurrentTenantId(), 91-rls.sql) applies to the caller.
--     The functions are SECURITY INVOKER (the default) for the same reason.
--   * Quantities are base (loose) units; Company.formatCartonsLoose() gives "n CTN + m".
--   * Only tables of the Basic edition are used here.
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
       cu."fullName"                            AS "createdByName"
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
  'Product Detail (stock by location), Stock Transfers (location cards).';

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
  'Companies & Brands (drawer Stock value), Warehouses (Stock value, SKUs, Total Stock Value KPI).';

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
                          ORDER BY d."expiryDate", d."batchNo") AS "fefoRank"
  FROM d
  JOIN "Inventory"."Products" i              ON i."tenantId" = d."tenantId" AND i.id = d."itemId"
  JOIN "Inventory"."Warehouses" w         ON w."tenantId" = d."tenantId" AND w.id = d."warehouseId"
  LEFT JOIN "Inventory"."ProductCompanies" m ON m."tenantId" = i."tenantId" AND m.id = i."manufacturerId";

COMMENT ON VIEW "Inventory"."getNearExpiryStock" IS
  'On-hand batches with an expiry date per warehouse: days left, value at batch cost, band '
  '(EXPIRED / DAYS_30 / DAYS_90 / DAYS_183 / LATER), suggested disposition and FEFO rank. '
  'Screen: Batches & Expiry (app/inventory/batches: window cards, timeline, calendar, register).';
