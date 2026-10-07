-- =============================================================================
-- Finsoft ERP (FULL) — views/90-dist-views.sql
-- Report views for Wholesale & Distribution (entities/11-wholesale-distribution.md).
-- FULL EDITION ONLY.
--
-- Install order: 00 → 14 schema → fk/* → 90-views (this file) → 91-rls.
-- Every view is  security_invoker = true,  so the caller's RLS policy
-- (tenantId = Company.getCurrentTenantId()) applies to every base table read.
-- Joins between tenant tables still match on tenantId (composite keys).
--
-- Dependencies: base tables only. This file sorts before 90-sales-views.sql,
-- so it must NOT read sales.v_* views; the shop receivable below repeats the
-- open-item rule of Sales.getReceivableOpenItems (same statuses, same columns):
--   + invoice.balanceAmount        invoice POSTED / PARTIALLY_PAID
--   + opening balance − OPENING_BALANCE allocations of live receipts
--   − CreditNotes.balanceAmount    credit note OPEN / APPLIED
--   − receipt.unallocatedAmount    receipt not BOUNCED / VOID
-- Sales counted: Sales.SalesInvoices POSTED / PARTIALLY_PAID / PAID (never DRAFT /
-- VOID); credit notes OPEN / APPLIED as negatives.
--
-- Views (dependency order)
--   Distribution.getRecoveryAgeing        app/wholesale/recovery (collection sheet rows)
--   Distribution.getRouteOutstanding      app/wholesale/recovery, app/wholesale/routes
--   Distribution.getLoadSheetPickList    app/wholesale/load-sheet (consolidated load list)
--   Distribution.getLoadSheetKpis                app/wholesale/load-sheet (KPIs)
--   Distribution.getOrderBookingKpis            app/wholesale/bookings (KPIs)
--   Distribution.getBackOrderSummary      app/wholesale/backorders (KPIs, group heads)
--   Distribution.getBackOrderIncomingStock     app/wholesale/backorders (incoming stock feed)
--   Distribution.getSalesmanPerformance   app/wholesale/routes (person cards, leaderboard)
--   Distribution.getRouteMonthlySales    app/wholesale/routes (route card monthly sales + ▲%)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Distribution.getRecoveryAgeing — one row per shop on a beat (Distribution.ShopRouteProfiles):
-- outstanding with ageing by invoice date 0–30 / 31–60 / 61–90 / 90+.
-- outstandingAmount = GREATEST(balance, 0). Unapplied credits (credit notes,
-- advances) are applied FIFO to the oldest debits, so every bucket is ≥ 0 and
-- the four buckets sum to outstandingAmount (the RecoverySheetLines CHECK).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Distribution"."getRecoveryAgeing"
WITH (security_invoker = true) AS
WITH oi AS (
  SELECT i."tenantId", i."customerId", i."docDate", i."dueDate", i."balanceAmount" AS "openAmount"
    FROM "Sales"."SalesInvoices" i
   WHERE i.status IN ('POSTED','PARTIALLY_PAID') AND i."balanceAmount" <> 0
  UNION ALL
  SELECT cu."tenantId", cu.id, cu."openingBalanceAsOf", cu."openingBalanceAsOf",
         cu."openingBalance" - COALESCE(ob.allocated, 0)
    FROM "Sales"."Customers" cu
    LEFT JOIN (SELECT a."tenantId", a."customerId", sum(a."allocatedAmount") AS allocated
                 FROM "Sales"."CustomerReceiptAllocations" a
                 JOIN "Sales"."CustomerReceipts" r ON r."tenantId" = a."tenantId" AND r.id = a."receiptId"
                WHERE a."targetType" = 'OPENING_BALANCE' AND r.status NOT IN ('BOUNCED','VOID')
                GROUP BY a."tenantId", a."customerId") ob
           ON ob."tenantId" = cu."tenantId" AND ob."customerId" = cu.id
   WHERE cu."openingBalance" <> 0
  UNION ALL
  SELECT cn."tenantId", cn."customerId", cn."docDate", cn."docDate", -cn."balanceAmount"
    FROM "Sales"."CreditNotes" cn
   WHERE cn.status IN ('OPEN','APPLIED') AND cn."balanceAmount" <> 0
  UNION ALL
  SELECT r."tenantId", r."customerId", r."docDate", r."docDate", -r."unallocatedAmount"
    FROM "Sales"."CustomerReceipts" r
   WHERE r.status NOT IN ('BOUNCED','VOID') AND r."unallocatedAmount" <> 0
), agg AS (
  SELECT oi."tenantId", oi."customerId",
         sum(oi."openAmount")                                                                   AS balance,
         COALESCE(sum(oi."openAmount") FILTER (WHERE oi."openAmount" > 0 AND current_date - oi."docDate" <= 30), 0)            AS d0,
         COALESCE(sum(oi."openAmount") FILTER (WHERE oi."openAmount" > 0 AND current_date - oi."docDate" BETWEEN 31 AND 60), 0) AS d31,
         COALESCE(sum(oi."openAmount") FILTER (WHERE oi."openAmount" > 0 AND current_date - oi."docDate" BETWEEN 61 AND 90), 0) AS d61,
         COALESCE(sum(oi."openAmount") FILTER (WHERE oi."openAmount" > 0 AND oi."dueDate" < current_date), 0)                  AS "overdueGross",
         max(current_date - oi."docDate") FILTER (WHERE oi."openAmount" > 0)                     AS "oldestDays",
         max(current_date - oi."dueDate") FILTER (WHERE oi."openAmount" > 0 AND oi."dueDate" < current_date) AS "maxDaysOverdue",
         count(*) FILTER (WHERE oi."openAmount" > 0)                                            AS "openDebitItems"
    FROM oi
   GROUP BY oi."tenantId", oi."customerId"
)
SELECT
  cr."tenantId",
  cr."customerId",
  cu.code                                    AS "customerCode",
  cu.name                                    AS "customerName",
  COALESCE(cu.mobile, cu.phone)              AS phone,
  cr."routeId",
  rt.code                                    AS "routeCode",
  rt.name                                    AS "routeName",
  rt."branchId",
  rt."salesmanEmployeeId",
  se."displayName"                            AS "salesmanName",
  rt."bookerEmployeeId",
  cr."areaId",
  ar.name                                    AS "areaName",
  cr."priceTier",
  cr."visitSeq",
  cr."isActive",
  cu.status                                  AS "customerStatus",
  cu."creditLimit",
  cr."recoveryTargetAmount",
  COALESCE(a.balance, 0)                     AS balance,
  s0.o                                       AS "outstandingAmount",
  s1.a0                                      AS age030,
  s2.a31                                     AS age3160,
  s3.a61                                     AS age6190,
  s0.o - s1.a0 - s2.a31 - s3.a61             AS "age90Plus",
  LEAST(COALESCE(a."overdueGross", 0), s0.o)  AS "overdueAmount",
  a."oldestDays"                              AS "oldestInvoiceDays",
  COALESCE(a."maxDaysOverdue", 0)            AS "maxDaysOverdue",
  COALESCE(a."openDebitItems", 0)            AS "openItems",
  (s0.o > cu."creditLimit")                   AS "overLimit",
  lp."docDate"                                AS "lastPaymentDate",
  lp."amountReceived"                         AS "lastPaymentAmount",
  ptp."promiseToPayDate"
FROM "Distribution"."ShopRouteProfiles" cr
JOIN "Sales"."Customers" cu ON cu."tenantId" = cr."tenantId" AND cu.id = cr."customerId"
JOIN "Distribution"."Routes" rt     ON rt."tenantId" = cr."tenantId" AND rt.id = cr."routeId"
LEFT JOIN "Distribution"."ShopAreas" ar ON ar."tenantId" = cr."tenantId" AND ar.id = cr."areaId"
LEFT JOIN "HumanResources"."Employees" se ON se."tenantId" = rt."tenantId" AND se.id = rt."salesmanEmployeeId"
LEFT JOIN agg a ON a."tenantId" = cr."tenantId" AND a."customerId" = cr."customerId"
CROSS JOIN LATERAL (SELECT GREATEST(COALESCE(a.balance, 0), 0) AS o) s0
CROSS JOIN LATERAL (SELECT LEAST(COALESCE(a.d0, 0),  s0.o)                   AS a0)  s1
CROSS JOIN LATERAL (SELECT LEAST(COALESCE(a.d31, 0), s0.o - s1.a0)           AS a31) s2
CROSS JOIN LATERAL (SELECT LEAST(COALESCE(a.d61, 0), s0.o - s1.a0 - s2.a31)  AS a61) s3
LEFT JOIN LATERAL (
  SELECT r."docDate", r."amountReceived"
    FROM "Sales"."CustomerReceipts" r
   WHERE r."tenantId" = cr."tenantId" AND r."customerId" = cr."customerId"
     AND r.status NOT IN ('BOUNCED','VOID')
   ORDER BY r."docDate" DESC, r."createdAt" DESC
   LIMIT 1
) lp ON true
LEFT JOIN LATERAL (
  SELECT e."promiseToPayDate"
    FROM "Distribution"."RecoverySheetLines" e
   WHERE e."tenantId" = cr."tenantId" AND e."customerId" = cr."customerId"
     AND e.status = 'PROMISED'
   ORDER BY e."createdAt" DESC
   LIMIT 1
) ptp ON true;

COMMENT ON VIEW "Distribution"."getRecoveryAgeing" IS
  'Per shop on a beat: outstanding (≥ 0) aged by invoice date 0–30 / 31–60 / 61–90 / 90+ (credits applied FIFO to the oldest debits; buckets sum to outstanding), overdue, credit limit, recovery target, last payment, open promise to pay. Screen: app/wholesale/recovery (collection sheet rows, chips 61+ / 90+, snapshot into Distribution.RecoverySheetLines).';


-- ---------------------------------------------------------------------------
-- Distribution.getRouteOutstanding — one row per route: shops, outstanding and its
-- ageing, overdue, over-limit shops, recovery target. Sums of
-- Distribution.getRecoveryAgeing over the shops currently assigned to the route.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Distribution"."getRouteOutstanding"
WITH (security_invoker = true) AS
SELECT
  rt."tenantId",
  rt.id                                                      AS "routeId",
  rt.code                                                    AS "routeCode",
  rt.name                                                    AS "routeName",
  rt."branchId",
  rt.status,
  rt."salesmanEmployeeId",
  se."displayName"                                            AS "salesmanName",
  rt."bookerEmployeeId",
  bk."displayName"                                            AS "bookerName",
  rt."vehicleId",
  count(ra."customerId") FILTER (WHERE ra."isActive")          AS "shopCount",
  count(ra."customerId") FILTER (WHERE ra."outstandingAmount" > 0) AS "shopsWithBalance",
  COALESCE(sum(ra."outstandingAmount"), 0)                    AS "outstandingTotal",
  COALESCE(sum(ra.age030), 0)                              AS age030,
  COALESCE(sum(ra.age3160), 0)                             AS age3160,
  COALESCE(sum(ra.age6190), 0)                             AS age6190,
  COALESCE(sum(ra."age90Plus"), 0)                           AS "age90Plus",
  COALESCE(sum(ra."overdueAmount"), 0)                        AS "overdueAmount",
  count(ra."customerId") FILTER (WHERE ra."overLimit")         AS "overLimitShops",
  max(ra."oldestInvoiceDays")                                AS "oldestInvoiceDays",
  COALESCE(sum(ra."recoveryTargetAmount"), 0)                AS "recoveryTargetTotal"
FROM "Distribution"."Routes" rt
LEFT JOIN "Distribution"."getRecoveryAgeing" ra ON ra."tenantId" = rt."tenantId" AND ra."routeId" = rt.id
LEFT JOIN "HumanResources"."Employees" se ON se."tenantId" = rt."tenantId" AND se.id = rt."salesmanEmployeeId"
LEFT JOIN "HumanResources"."Employees" bk ON bk."tenantId" = rt."tenantId" AND bk.id = rt."bookerEmployeeId"
WHERE rt."deletedAt" IS NULL
GROUP BY rt."tenantId", rt.id, rt.code, rt.name, rt."branchId", rt.status, rt."salesmanEmployeeId",
         se."displayName", rt."bookerEmployeeId", bk."displayName", rt."vehicleId";

COMMENT ON VIEW "Distribution"."getRouteOutstanding" IS
  'Per route: shops, outstanding total with 0–30 / 31–60 / 61–90 / 90+ ageing, overdue, over-limit shops, recovery target. Screens: app/wholesale/recovery (route totals, KPIs), app/wholesale/routes (route card / shop board "due").';


-- ---------------------------------------------------------------------------
-- Distribution.getLoadSheetPickList — consolidated pick list of a delivery run from
-- the posted invoices on it (Distribution.LoadSheetInvoices → Sales.SalesInvoiceLines), one row
-- per item × batch. Pieces = baseQty + bonusQty (free goods ride the van).
-- Cartons / loose split on Inventory.Products.ctn; weight = pieces × Inventory.Products.weightKg
-- (kg per piece). Pick state comes from the stored Distribution.LoadSheetLines row
-- when one exists. Invoices released at settlement stay on their run.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Distribution"."getLoadSheetPickList"
WITH (security_invoker = true) AS
SELECT
  r."tenantId",
  r.id                                              AS "deliveryRunId",
  r."docNo"                                          AS "runNo",
  r."docDate",
  r.status                                          AS "runStatus",
  r."routeId",
  r."vehicleId",
  r."sourceWarehouseId",
  l."itemId",
  it.sku,
  it.name                                           AS "itemName",
  l."batchId",
  b."batchNo",
  b."expiryDate",
  COALESCE(ls."shelfCode", it."defaultShelf")         AS "shelfCode",
  it.ctn                                            AS "unitsPerCtn",
  floor(l."totalPcs" / it.ctn)                       AS "qtyCtn",
  l."totalPcs" - floor(l."totalPcs" / it.ctn) * it.ctn AS "qtyLoose",
  l."totalPcs",
  l."bonusPcs",
  round(l."totalPcs" / it.ctn, 3)                    AS "ctnEquiv",
  round(l."totalPcs" * COALESCE(it."weightKg", 0), 3) AS "weightKg",
  l."valueAmount",
  l."invoiceCount",
  l."shopCount",
  ls.id                                             AS "loadSheetLineId",
  COALESCE(ls."isPicked", false)                     AS "isPicked",
  ls."pickedAt",
  ls."pickedByUserId"
FROM (
  SELECT ri."tenantId", ri."deliveryRunId", il."itemId", il."batchId",
         sum(il."baseQty" + il."bonusQty")  AS "totalPcs",
         sum(il."bonusQty")                AS "bonusPcs",
         sum(il."totalAmount")             AS "valueAmount",
         count(DISTINCT ri."invoiceId")    AS "invoiceCount",
         count(DISTINCT ri."customerId")   AS "shopCount"
    FROM "Distribution"."LoadSheetInvoices" ri
    JOIN "Sales"."SalesInvoices" i       ON i."tenantId" = ri."tenantId" AND i.id = ri."invoiceId"
    JOIN "Sales"."SalesInvoiceLines" il ON il."tenantId" = i."tenantId" AND il."invoiceId" = i.id
   WHERE i.status IN ('POSTED','PARTIALLY_PAID','PAID')
     AND il."itemId" IS NOT NULL
   GROUP BY ri."tenantId", ri."deliveryRunId", il."itemId", il."batchId"
) l
JOIN "Distribution"."LoadSheets" r ON r."tenantId" = l."tenantId" AND r.id = l."deliveryRunId"
JOIN "Inventory"."Products" it         ON it."tenantId" = l."tenantId" AND it.id = l."itemId"
LEFT JOIN "Inventory"."ProductBatches" b    ON b."tenantId" = l."tenantId" AND b.id = l."batchId"
LEFT JOIN "Distribution"."LoadSheetLines" ls
       ON ls."tenantId" = l."tenantId" AND ls."deliveryRunId" = l."deliveryRunId"
      AND ls."itemId" = l."itemId" AND ls."batchId" IS NOT DISTINCT FROM l."batchId";

COMMENT ON VIEW "Distribution"."getLoadSheetPickList" IS
  'Consolidated load list per run × item × batch from the posted invoices on the run: shelf, CTN / PCS / total pcs (incl. bonus), carton equivalent, weight, value, pick state. Screen: app/wholesale/load-sheet (Consolidated load list, Print load sheet; source for Distribution.LoadSheetLines).';


-- ---------------------------------------------------------------------------
-- Distribution.getLoadSheetKpis — per day × branch: runs by status, invoices / shops /
-- cartons / kg / value loaded. CANCELLED runs are excluded from the load
-- figures. Uses the run counters stored on Distribution.LoadSheets.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Distribution"."getLoadSheetKpis"
WITH (security_invoker = true) AS
SELECT
  r."tenantId",
  r."docDate",
  r."branchId",
  count(*) FILTER (WHERE r.status <> 'CANCELLED')                    AS "runsTotal",
  count(*) FILTER (WHERE r.status = 'LOADING')                       AS "runsLoading",
  count(*) FILTER (WHERE r.status = 'SCHEDULED')                     AS "runsScheduled",
  count(*) FILTER (WHERE r.status = 'DISPATCHED')                    AS "runsDispatched",
  count(*) FILTER (WHERE r.status = 'SETTLED')                       AS "runsSettled",
  count(*) FILTER (WHERE r.status = 'CANCELLED')                     AS "runsCancelled",
  COALESCE(sum(r."invoiceCount")   FILTER (WHERE r.status <> 'CANCELLED'), 0) AS "invoicesLoaded",
  COALESCE(sum(r."shopCount")      FILTER (WHERE r.status <> 'CANCELLED'), 0) AS shops,
  COALESCE(sum(r."totalCtnEquiv") FILTER (WHERE r.status <> 'CANCELLED'), 0) AS "cartonsLoaded",
  COALESCE(sum(r."totalCtn")       FILTER (WHERE r.status <> 'CANCELLED'), 0) AS "wholeCartons",
  COALESCE(sum(r."totalLoose")     FILTER (WHERE r.status <> 'CANCELLED'), 0) AS "loosePcs",
  COALESCE(sum(r."totalKg")        FILTER (WHERE r.status <> 'CANCELLED'), 0) AS "totalKg",
  COALESCE(sum(r."totalValue")     FILTER (WHERE r.status <> 'CANCELLED'), 0) AS "loadValue",
  round(avg(r."capacityCtnPct")   FILTER (WHERE r.status <> 'CANCELLED'), 2) AS "avgCapacityCtnPct"
FROM "Distribution"."LoadSheets" r
GROUP BY r."tenantId", r."docDate", r."branchId";

COMMENT ON VIEW "Distribution"."getLoadSheetKpis" IS
  'Delivery-run KPIs per day × branch: runs by status, invoices loaded, shops, cartons (equivalent / whole / loose), kg, load value, average van fill. Screen: app/wholesale/load-sheet (KPIs Today''s runs / Invoices loaded / Cartons loaded / Load value).';


-- ---------------------------------------------------------------------------
-- Distribution.getOrderBookingKpis — per day × branch × route × booker. CANCELLED bookings
-- are excluded from orders / value. Awaiting conversion = NEW + CHECKED.
-- gps_verified_pct is for this grain; re-aggregate from the counts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Distribution"."getOrderBookingKpis"
WITH (security_invoker = true) AS
SELECT
  b."tenantId",
  b."docDate",
  b."branchId",
  b."routeId",
  b."bookerEmployeeId",
  count(*) FILTER (WHERE b.status <> 'CANCELLED')                          AS "ordersCount",
  COALESCE(sum(b."netAmount") FILTER (WHERE b.status <> 'CANCELLED'), 0)    AS "bookedValue",
  count(*) FILTER (WHERE b.status = 'NEW')                                 AS "newCount",
  count(*) FILTER (WHERE b.status = 'CHECKED')                             AS "checkedCount",
  count(*) FILTER (WHERE b.status IN ('NEW','CHECKED'))                    AS "awaitingConversionCount",
  COALESCE(sum(b."netAmount") FILTER (WHERE b.status IN ('NEW','CHECKED')), 0) AS "awaitingConversionValue",
  count(*) FILTER (WHERE b.status = 'CONVERTED')                           AS "convertedCount",
  count(*) FILTER (WHERE b.status = 'PARTIAL')                             AS "partialCount",
  count(*) FILTER (WHERE b.status = 'HELD')                                AS "heldCount",
  count(*) FILTER (WHERE b.status = 'CANCELLED')                           AS "cancelledCount",
  COALESCE(sum(b."netAmount") FILTER (WHERE b.status IN ('CONVERTED','PARTIAL')), 0) AS "convertedValue",
  COALESCE(sum(b."shortLineCount") FILTER (WHERE b.status <> 'CANCELLED'), 0) AS "shortLines",
  count(*) FILTER (WHERE b.status <> 'CANCELLED' AND b."gpsVerified")       AS "gpsVerifiedCount",
  round(100.0 * count(*) FILTER (WHERE b.status <> 'CANCELLED' AND b."gpsVerified")
        / NULLIF(count(*) FILTER (WHERE b.status <> 'CANCELLED'), 0), 2)   AS "gpsVerifiedPct"
FROM "Distribution"."OrderBookings" b
GROUP BY b."tenantId", b."docDate", b."branchId", b."routeId", b."bookerEmployeeId";

COMMENT ON VIEW "Distribution"."getOrderBookingKpis" IS
  'Order-booking KPIs per day × branch × route × booker: orders, booked value, status counts, awaiting conversion, converted value, short lines, GPS verified count / %. Screen: app/wholesale/bookings (KPIs Orders today / Booked value / Awaiting conversion / GPS verified %, status chip counts).';


-- ---------------------------------------------------------------------------
-- Distribution.getBackOrderSummary — open back-order lines (WAITING, PART_ALLOCATED,
-- READY) rolled up three ways (group_level):
--   ALL       one row per tenant          (KPIs)
--   ITEM      one row per item            (By item group head, + stock on hand)
--   CUSTOMER  one row per shop            (By customer group head)
-- pending_value = pendingQty × unitRate × (1 + taxRate / 100).
-- on_hand / available = Σ Inventory.StockBalances over non-VAN warehouses (back-
-- order lines carry no warehouse).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Distribution"."getBackOrderSummary"
WITH (security_invoker = true) AS
SELECT
  g."tenantId",
  g."groupLevel",
  g."itemId",
  it.sku,
  it.name                                   AS "itemName",
  it.ctn                                    AS "unitsPerCtn",
  g."customerId",
  cu.code                                   AS "customerCode",
  cu.name                                   AS "customerName",
  g."pendingLines",
  g."pendingQty",
  g."allocatedQty",
  g."pendingValue",
  g."customersWaiting",
  g."oldestBackorderDate",
  (current_date - g."oldestBackorderDate")  AS "oldestPendingDays",
  g."readyLines",
  g."readyValue",
  sb."onHandQty",
  sb."availableQty"
FROM (
  SELECT bl."tenantId",
         CASE WHEN GROUPING(bl."itemId") = 0     THEN 'ITEM'
              WHEN GROUPING(bl."customerId") = 0 THEN 'CUSTOMER'
              ELSE 'ALL' END                                          AS "groupLevel",
         bl."itemId",
         bl."customerId",
         count(*)                                                     AS "pendingLines",
         sum(bl."pendingQty")                                          AS "pendingQty",
         sum(bl."allocatedQty")                                        AS "allocatedQty",
         round(sum(bl."pendingQty" * bl."unitRate" * (1 + bl."taxRate" / 100)), 2) AS "pendingValue",
         count(DISTINCT bl."customerId")                               AS "customersWaiting",
         min(bl."backorderDate")                                       AS "oldestBackorderDate",
         count(*) FILTER (WHERE bl.status = 'READY')                  AS "readyLines",
         COALESCE(round(sum(bl."pendingQty" * bl."unitRate" * (1 + bl."taxRate" / 100))
                        FILTER (WHERE bl.status = 'READY'), 2), 0)    AS "readyValue"
    FROM "Distribution"."BackOrders" bl
   WHERE bl.status IN ('WAITING','PART_ALLOCATED','READY')
   GROUP BY GROUPING SETS ((bl."tenantId"), (bl."tenantId", bl."itemId"), (bl."tenantId", bl."customerId"))
) g
LEFT JOIN "Inventory"."Products" it       ON it."tenantId" = g."tenantId" AND it.id = g."itemId"
LEFT JOIN "Sales"."Customers" cu ON cu."tenantId" = g."tenantId" AND cu.id = g."customerId"
LEFT JOIN LATERAL (
  SELECT sum(s."qtyOnHand") AS "onHandQty", sum(s."qtyAvailable") AS "availableQty"
    FROM "Inventory"."StockBalances" s
    JOIN "Inventory"."Warehouses" w ON w."tenantId" = s."tenantId" AND w.id = s."warehouseId"
   WHERE g."groupLevel" = 'ITEM'
     AND s."tenantId" = g."tenantId" AND s."itemId" = g."itemId"
     AND w.type <> 'VAN'
) sb ON true;

COMMENT ON VIEW "Distribution"."getBackOrderSummary" IS
  'Open back-orders rolled up as ALL / ITEM / CUSTOMER: pending lines, qty, allocated, value incl. GST, customers waiting, oldest pending, ready to invoice, stock on hand (ITEM). Screen: app/wholesale/backorders (KPIs Pending lines / Pending value / Customers waiting / Oldest pending / Ready to invoice; By item / By customer group heads).';


-- ---------------------------------------------------------------------------
-- Distribution.getBackOrderIncomingStock — incoming-stock feed: GRN lines of items that
-- have open back-orders. arrival_status ARRIVED = GRN POSTED (allocatable);
-- IN_TRANSIT = GRN still DRAFT (shown, not allocatable). CANCELLED GRNs never
-- appear. allocatedQty = Σ BackOrderAllocations (ALLOCATED, INVOICED) booked
-- against the GRN line (allocations without grnLineId are not attributed).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Distribution"."getBackOrderIncomingStock"
WITH (security_invoker = true) AS
SELECT
  g."tenantId",
  g.id                                              AS "grnId",
  g."docNo"                                          AS "grnNo",
  g."docDate",
  g.status                                          AS "grnStatus",
  CASE WHEN g.status = 'POSTED' THEN 'ARRIVED' ELSE 'IN_TRANSIT' END AS "arrivalStatus",
  g."vendorId",
  v.name                                            AS "vendorName",
  g."branchId",
  g."warehouseId",
  gl.id                                             AS "grnLineId",
  gl."itemId",
  it.sku,
  it.name                                           AS "itemName",
  it.ctn                                            AS "unitsPerCtn",
  gl."batchId",
  COALESCE(b."batchNo", gl."batchNo")                 AS "batchNo",
  COALESCE(b."expiryDate", gl."expiryDate")           AS "expiryDate",
  gl."acceptedQty",
  COALESCE(al."allocatedQty", 0)                     AS "allocatedQty",
  GREATEST(gl."acceptedQty" - COALESCE(al."allocatedQty", 0), 0) AS "freeQty",
  d."pendingQty"                                     AS "backorderPendingQty",
  d."unallocatedPendingQty"                         AS "backorderUnallocatedQty",
  d."customersWaiting",
  d."oldestBackorderDate"
FROM "Purchases"."GoodsReceivedNotes" g
JOIN "Purchases"."GoodsReceivedNoteLines" gl ON gl."tenantId" = g."tenantId" AND gl."grnId" = g.id
JOIN (
  SELECT bl."tenantId", bl."itemId",
         sum(bl."pendingQty")                      AS "pendingQty",
         sum(bl."pendingQty" - bl."allocatedQty")   AS "unallocatedPendingQty",
         count(DISTINCT bl."customerId")           AS "customersWaiting",
         min(bl."backorderDate")                   AS "oldestBackorderDate"
    FROM "Distribution"."BackOrders" bl
   WHERE bl.status IN ('WAITING','PART_ALLOCATED','READY')
   GROUP BY bl."tenantId", bl."itemId"
) d ON d."tenantId" = gl."tenantId" AND d."itemId" = gl."itemId"
JOIN "Inventory"."Products" it ON it."tenantId" = gl."tenantId" AND it.id = gl."itemId"
LEFT JOIN "Purchases"."Vendors" v ON v."tenantId" = g."tenantId" AND v.id = g."vendorId"
LEFT JOIN "Inventory"."ProductBatches" b       ON b."tenantId" = gl."tenantId" AND b.id = gl."batchId"
LEFT JOIN (
  SELECT ba."tenantId", ba."grnLineId", sum(ba.qty) AS "allocatedQty"
    FROM "Distribution"."BackOrderAllocations" ba
   WHERE ba.status IN ('ALLOCATED','INVOICED') AND ba."grnLineId" IS NOT NULL
   GROUP BY ba."tenantId", ba."grnLineId"
) al ON al."tenantId" = gl."tenantId" AND al."grnLineId" = gl.id
WHERE g.status IN ('POSTED','DRAFT')
  AND gl."acceptedQty" > 0;

COMMENT ON VIEW "Distribution"."getBackOrderIncomingStock" IS
  'Incoming stock for back-ordered items: GRN no, vendor, item, batch / expiry, accepted qty, already allocated, free qty, ARRIVED (posted GRN) / IN_TRANSIT (draft GRN), back-order demand for the item. Screen: app/wholesale/backorders (Incoming stock feed, Allocate arrival).';


-- ---------------------------------------------------------------------------
-- Distribution.getSalesmanPerformance — one row per Distribution.SalesmanTargets (booker or
-- salesman × period): target, stored achievement, strike rate, the slab the
-- achievement falls in, commission (live SalesmanCommissions row, else the
-- projected achieved × slab rate) and leaderboard rank within role × period.
-- invoiced_net_sales recomputes the period from posted invoices (salesman_ /
-- bookerEmployeeId by role) net of posted credit notes against them, as a
-- cross-check of the stored achievedAmount.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Distribution"."getSalesmanPerformance"
WITH (security_invoker = true) AS
SELECT
  t."tenantId",
  t.id                                          AS "salesTargetId",
  t."employeeId",
  e.code                                        AS "employeeCode",
  e."displayName"                                AS "employeeName",
  t.role,
  t."routeId",
  rt.code                                       AS "routeCode",
  t."periodStart",
  t."periodEnd",
  t.status,
  t."targetAmount",
  t."achievedAmount",
  t."achievementPct",
  t.calls,
  t."productiveCalls",
  CASE WHEN t.calls > 0 THEN round(100.0 * t."productiveCalls" / t.calls, 2) END AS "strikeRatePct",
  COALESCE(inv."netSales", 0) - COALESCE(ret."returnsValue", 0) AS "invoicedNetSales",
  COALESCE(inv."invoiceCount", 0)                AS "invoiceCount",
  COALESCE(inv."shopsBilled", 0)                 AS "shopsBilled",
  sl.id                                         AS "commissionSlabId",
  sl.label                                      AS "slabLabel",
  sl."ratePct"                                   AS "slabRatePct",
  sc.id                                         AS "salesmanCommissionId",
  sc.status                                     AS "commissionStatus",
  COALESCE(sc."commissionAmount", round(t."achievedAmount" * sl."ratePct" / 100, 2)) AS "commissionAmount",
  rank() OVER (PARTITION BY t."tenantId", t.role, t."periodStart"
               ORDER BY t."achievementPct" DESC)  AS "leaderboardRank"
FROM "Distribution"."SalesmanTargets" t
JOIN "HumanResources"."Employees" e ON e."tenantId" = t."tenantId" AND e.id = t."employeeId"
LEFT JOIN "Distribution"."Routes" rt ON rt."tenantId" = t."tenantId" AND rt.id = t."routeId"
LEFT JOIN LATERAL (
  SELECT sum(i."taxableAmount")          AS "netSales",
         count(*)                       AS "invoiceCount",
         count(DISTINCT i."customerId")  AS "shopsBilled"
    FROM "Sales"."SalesInvoices" i
   WHERE i."tenantId" = t."tenantId"
     AND i.status IN ('POSTED','PARTIALLY_PAID','PAID')
     AND i."docDate" BETWEEN t."periodStart" AND t."periodEnd"
     AND CASE t.role WHEN 'SALESMAN' THEN i."salesmanEmployeeId" ELSE i."bookerEmployeeId" END = t."employeeId"
) inv ON true
LEFT JOIN LATERAL (
  SELECT sum(cn."valueAmount") AS "returnsValue"
    FROM "Sales"."CreditNotes" cn
    JOIN "Sales"."SalesInvoices" i ON i."tenantId" = cn."tenantId" AND i.id = cn."invoiceId"
   WHERE cn."tenantId" = t."tenantId"
     AND cn.status IN ('OPEN','APPLIED')
     AND cn."docDate" BETWEEN t."periodStart" AND t."periodEnd"
     AND CASE t.role WHEN 'SALESMAN' THEN i."salesmanEmployeeId" ELSE i."bookerEmployeeId" END = t."employeeId"
) ret ON true
LEFT JOIN LATERAL (
  SELECT s.id, s.label, s."ratePct"
    FROM "Distribution"."CommissionSlabs" s
   WHERE s."tenantId" = t."tenantId"
     AND s."deletedAt" IS NULL
     AND t."periodEnd" >= s."effectiveFrom"
     AND (s."effectiveTo" IS NULL OR t."periodEnd" <= s."effectiveTo")
     AND t."achievementPct" >= s."fromPct"
     AND (s."toPct" IS NULL OR t."achievementPct" < s."toPct")
   ORDER BY s."fromPct" DESC
   LIMIT 1
) sl ON true
LEFT JOIN "Distribution"."SalesmanCommissions" sc
       ON sc."tenantId" = t."tenantId" AND sc."salesTargetId" = t.id AND sc.status <> 'CANCELLED';

COMMENT ON VIEW "Distribution"."getSalesmanPerformance" IS
  'Booker / salesman performance per target period: target, achieved, achievement %, calls, productive calls, strike rate, invoiced net sales (cross-check), commission slab and amount, leaderboard rank. Screen: app/wholesale/routes (person cards, Leaderboard, Commission slabs "Who''s here").';


-- ---------------------------------------------------------------------------
-- Distribution.getRouteMonthlySales — route × month: net sales (taxable value of
-- posted invoices − posted credit notes), totals incl. GST, invoices, shops
-- billed, previous month and growth % (only when the previous row is the
-- previous calendar month). Route = invoice.routeId, else the shop's current
-- Distribution.ShopRouteProfiles; credit notes follow their invoice (else the shop).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Distribution"."getRouteMonthlySales"
WITH (security_invoker = true) AS
SELECT
  m."tenantId",
  m."routeId",
  rt.code                                       AS "routeCode",
  rt.name                                       AS "routeName",
  rt."branchId",
  m."periodMonth",
  m."salesValue",
  m."returnsValue",
  m."netSales",
  m."totalAmount",
  m."invoiceCount",
  m."shopsBilled",
  m."prevMonthNetSales",
  CASE WHEN m."prevMonthNetSales" > 0
       THEN round(100 * (m."netSales" - m."prevMonthNetSales") / m."prevMonthNetSales", 2) END AS "growthPct"
FROM (
  SELECT a.*,
         CASE WHEN lag(a."periodMonth") OVER w = (a."periodMonth" - interval '1 month')::date
              THEN lag(a."netSales") OVER w END AS "prevMonthNetSales"
    FROM (
      SELECT s."tenantId", s."routeId", s."periodMonth",
             sum(s."salesValue")               AS "salesValue",
             sum(s."returnsValue")             AS "returnsValue",
             sum(s."salesValue" - s."returnsValue") AS "netSales",
             sum(s."totalAmount")              AS "totalAmount",
             count(s."invoiceId")              AS "invoiceCount",
             count(DISTINCT s."shopId")        AS "shopsBilled"
        FROM (
          SELECT i."tenantId", COALESCE(i."routeId", cr."routeId") AS "routeId",
                 date_trunc('month', i."docDate")::date AS "periodMonth",
                 i."taxableAmount" AS "salesValue", 0::numeric AS "returnsValue",
                 i."netAmount" AS "totalAmount", i.id AS "invoiceId", i."customerId" AS "shopId"
            FROM "Sales"."SalesInvoices" i
            LEFT JOIN "Distribution"."ShopRouteProfiles" cr ON cr."tenantId" = i."tenantId" AND cr."customerId" = i."customerId"
           WHERE i.status IN ('POSTED','PARTIALLY_PAID','PAID')
          UNION ALL
          SELECT cn."tenantId", COALESCE(inv."routeId", cr."routeId"),
                 date_trunc('month', cn."docDate")::date,
                 0, cn."valueAmount",
                 -cn."totalAmount", NULL::uuid, NULL::uuid
            FROM "Sales"."CreditNotes" cn
            LEFT JOIN "Sales"."SalesInvoices" inv      ON inv."tenantId" = cn."tenantId" AND inv.id = cn."invoiceId"
            LEFT JOIN "Distribution"."ShopRouteProfiles" cr ON cr."tenantId" = cn."tenantId" AND cr."customerId" = cn."customerId"
           WHERE cn.status IN ('OPEN','APPLIED')
        ) s
       WHERE s."routeId" IS NOT NULL
       GROUP BY s."tenantId", s."routeId", s."periodMonth"
    ) a
  WINDOW w AS (PARTITION BY a."tenantId", a."routeId" ORDER BY a."periodMonth")
) m
JOIN "Distribution"."Routes" rt ON rt."tenantId" = m."tenantId" AND rt.id = m."routeId";

COMMENT ON VIEW "Distribution"."getRouteMonthlySales" IS
  'Route × month sales: invoiced value, returns, net sales, total incl. GST, invoices, shops billed, previous month and growth %. Screen: app/wholesale/routes (route card Monthly sales + sparkline + ▲%).';

-- End of 90-dist-views.sql: 9 views.
