# Phase 8 rev 1: Products

**Objective:** the product catalogue that every sales, purchase and stock document picks from:
- products with their units (pack sizes), barcodes, suppliers and batches;
- a price log written on every price change;
- kits and bundles (a kit is itself a product, built from components);
- barcode label templates and printed label jobs;
- reorder rules per product and warehouse.

Every change is attributed to the user in row history. Nothing posts and no stock moves yet.

**Entities (4, MASTER):** Products · Kits & Bundles · Barcode Labels · Reorder Rules

**Status before this plan:** Phases 0–7 `done`; no phase in progress.

**Decisions taken with you:**
- **Labels print from the browser.** The live preview is printed with the browser's print dialog using print-only CSS sized to the label template. Each print is recorded as a label job (template, options, products, copies, who printed). No server PDF; the roadmap's `GET /label-jobs/:id/pdf` is dropped.
- **Batches: register + manual add.** `/inventory/batches` shows the template's register from real batches. Batches can be added by hand (e.g. for opening stock), and a batch's disposition changed. Stock values read 0 until stock exists; "Move stock" is disabled until the stock phases.
- **Reorder rules on the product detail, plus the suggestions tab.** Rules are edited in the product detail's "Reorder settings" panel. `/inventory/demand` shows only the template's "Reorder Suggestions" tab, computed live from rules against stock. "Send to demand" and "Create POs" stay disabled until Phases 19 / 22; the "Demand of Goods" tab comes with Phase 22.
- **No product images yet.** Products show their class icon, as the template does without a photo. Image upload comes with a later shared file-storage feature.

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Products | Master | Units, companies, classes (Phase 6, done); vendors (Phase 7, done); tax codes (Phase 4, done) | Every document line is a product |
| Kits & Bundles | Master | Products (this phase) | Kits sell as one line and are assembled from stock (Phase 22) |
| Barcode Labels | Master | Products (this phase) | Shelf and carton labels before goods arrive |
| Reorder Rules | Master | Products (this phase), warehouses (Phase 6, done) | Purchase planning (Phases 19, 22) reads them |

## 2. Verified schema (live DB; all 12 tables are empty; all have RLS)

**Products** (`Inventory.Products`; audited) and children
- **Identity:** `sku` `^[A-Z0-9][A-Z0-9-]{1,11}$` (unique), `upc` 8 / 12 / 13 digits (unique among live rows), `name`, `nameUrdu`, `description`, `status` ACTIVE / DRAFT / INACTIVE.
- **Classification:** `manufacturerId` (company), `distributorVendorId` (vendor), `productClassId` + `productSubclassId` (the sub type must belong to the class), `defaultShelf` `^[A-Z]{1,2}\d{1,3}$`.
- **Units:** `uomId` (base unit, required), `ctn` ≥ 1 (pieces per carton).
- **Pricing:** `cost`, `avgCost`, `costPerUnit`, `price`, `wprice` (all ≥ 0); **price ≥ cost unless DRAFT**; `gstRate` 0–100; `taxCodeId`; `finDiscPct` 0–100.
- **Stock:** `lowLevel` ≤ `highLevel` (both ≥ 0).
- **Flags:** `isShort`, `trackExpiry`, `isControlled`, `isPrecious`.
- **Other:** `hsCode`, `weightKg`, `leadDays` 0–365.
- **Filled by later phases:** `abcClass`, `avgDailySales`, `lastSaleDate`.
- **No images yet:** `imageUrl` unused. `deletedAt` for soft delete.
- **Children:**
  - `ProductUnits`: unit, `factor` > 0; one base unit with factor 1; purchase / sales default flags; unique per unit. **Audit trigger missing → added.**
  - `ProductBarcodes`: 8–14 digits, unique per company; kind PIECE / CARTON; `qtyPerScan`; one primary per kind. **Audit trigger missing → added.**
  - `ProductSuppliers`: vendor (unique per product), vendor item code, last price, lead days, share %, one preferred. **Audit trigger missing → added.**
  - `ProductBatches` (audited): batch no. (unique per product, ≤ 40), expiry ≥ manufacture date, unit cost, disposition SALEABLE / PRIORITY / QUARANTINE / CLEARANCE / RETURN_TO_PRINCIPAL / WRITTEN_OFF; DB checks in `invBatchCheck`.
  - `ProductPriceLogs`: field COST / PRICE / WPRICE / AVG_COST, old → new, source MANUAL / INLINE_EDIT / … ; **append-only** (DB trigger). **Audit trigger missing → added.**
- **DB functions:** `productAddUpdate` (units, barcodes and suppliers as arrays); `productBatchAddUpdate`.

**Kits & Bundles** (`Inventory.KitsAndBundles` audited + `KitComponents`)
- `code` `^KIT-\d{3,6}$` (unique; auto), `name`, `icon`, `tone` (green / lime / blue / orange / violet / red), `kitItemId` → the kit's own product (unique), `sellingPrice` ≥ 0, `targetMarginPct` 5–50, `status`, `deletedAt`.
- **Components:** product, `qtyPerKit` > 0, order; unique per kit. **Audit trigger missing → added.** `invKitComponentCheck` stops a kit containing itself.
- DB function `kitAddUpdate` (components as an array).

**Barcode Labels**
- **Templates** (`BarcodeLabelTemplates`): `code` `^[A-Z0-9_]{2,30}$`, name, media ROLL / SHEET, width / height mm > 0, labels per sheet, sheet columns / rows, `isSystem`, `isActive`. DB function `barcodeLabelTemplateAddUpdate`.
- **Jobs** (`BarcodeLabelJobs`): template, options (price, Urdu name, batch / expiry, company, carton barcode), product count, total labels, page count, source LABELS / CATALOGUE / PRODUCT_DETAIL, status QUEUED / PRINTED / FAILED / CANCELLED, printed at / by.
- **Job lines** (`BarcodeLabelJobLines`): product (unique per job), copies 1–500, barcode, batch, printed price.
- **Audit triggers missing on all three → added.** **No save function for jobs → added** (`barcodeLabelJobAddUpdate`, lines as an array).

**Reorder Rules** (`Inventory.ReorderRules`; **audit trigger missing → added**)
- product, `warehouseId` (null = all warehouses), `lowLevel` ≤ `highLevel`, `leadDays` / `safetyDays` / `coverAlertDays` 0–365, `isActive`; one rule per product per warehouse (nulls not distinct).
- There is no separate "reorder point" column: the roadmap's "min ≤ reorder point ≤ max" is the low ≤ high check.
- DB function `reorderRuleAddUpdate`.

**Permissions:** `item:*` for all four (in the catalogue).

**Unresolved:** none.

## 3. Template → page mapping
| Entity | Template | Page | Notes |
|---|---|---|---|
| Products (catalogue) | `4B-products.html` `app/inventory/items` | `/inventory/items` | **From the template:** the filter panel (scope, company, class, stock range, shelf, special attributes, search, view, sort), quick chips with counts (company, class, shelf, short items, expiry required, precious, controlled), the table / tile views, row menu, double-click inline price edit (writes a price log), New Product modal. Server-paged. **Real but empty until stock:** Stock column. **Omitted:** Import (Phase 35), Export, bulk price update (Phase 22). |
| Products (create / edit) | the catalogue's product modal | modal | Identity, classification, units (base + pack sizes with live multi-unit preview), pricing (with margin), tax, stock levels, flags. Barcodes and suppliers can be added in the modal on create; afterwards on the detail tabs. |
| Products (detail) | `app/inventory/products/view` | `/inventory/products/[id]` | **From the template:** header (SKU, UPC, company, status / class / expiry badges), Edit, Print label, KPI tiles, tabs. **Live:** Overview (pricing with margins, reorder settings, details), Price History (price log), Suppliers, Batches & Expiry, Barcodes & Labels, History. **Placeholders until stock / orders:** stock by location, Stock Card, Open Orders, "Adjust stock", "Create PO". **Added:** Units tab. |
| Batches & Expiry | `4C-stock-ops.html` `app/inventory/batches` | `/inventory/batches` | **From the template:** KPIs by expiry window, expiry timeline, expiry calendar, batch register with search / filters. **Added:** "Add batch" and "Change disposition". **Disabled:** "Move stock" (stock phases). Stock values read 0 until stock exists. |
| Kits & Bundles | `4B-products.html` `app/inventory/kits` | `/inventory/kits` | **From the template:** kit cards (components, cost, price, margin), the bill-of-materials builder (component rows with qty steppers, add component, total component cost, bought-separately total, target-margin slider, suggested price, selling price, margin / saving), Save kit. Creating a kit also creates its kit product (SKU = kit code). **Disabled:** Assemble / Disassemble (Phase 22). "In stock" and "Can build" read 0 until stock exists. |
| Barcode Labels | `4B-products.html` `app/inventory/labels` | `/inventory/labels` | **From the template:** product picker with copies, template options (thermal 2×1", 38×25 mm, A4 sheet of 40; show price / Urdu name / batch-expiry / company / carton barcode), live preview with CSS barcodes, "Print labels". **Added:** recent jobs list with reprint, and a template manager (system templates seeded per company: the three above). |
| Reorder Rules | product detail "Reorder settings" + `app/inventory/demand` (Reorder Suggestions tab) | product detail panel; `/inventory/demand` | Rules per warehouse in a drawer from the panel. The suggestions tab groups products below their low level (or under the cover days) by preferred supplier, with suggested cartons. With no stock yet, every product with a rule and low level > 0 shows as "0 on hand". |

**Sidebar:** Inventory › Products gains **Product Catalogue**, **Kits & Bundles** and **Barcode Labels**; Inventory › Stock gains **Batches & Expiry** and **Demand & Reorder**. Product Detail is reached from the catalogue.

**CSS:** the template's catalogue, product detail, kits and labels sections of `1F-products.css` are added to `finsoft-products.css` verbatim; the batches / demand screens' stock-ops CSS (`4C`'s stylesheet) is ported the same way.

## 4. Clean Architecture
| Layer | Module | Responsibility |
|---|---|---|
| Contracts | `src/shared/inventory/{product,kit,label,reorder,batch}.ts` | Zod mirrors of the DB checks (SKU / UPC / barcode / shelf / HS code formats, price ≥ cost unless draft, low ≤ high, factors > 0, one base unit, copies 1–500, margin 5–50); `patchFields` for PATCH bodies |
| Domain | `inventory/domain/` | Pure helpers shared with the UI: multi-unit conversion and preview, margin and suggested kit price, reorder suggestion maths (cover days, suggested cartons), EAN check digit for generated barcodes |
| Application | services per entity | Auto codes (SKU suggestions per class prefix, KIT-NNN); retired codes; price changes write `ProductPriceLogs` in the same unit of work; one base unit / primary barcode per kind / preferred supplier (flags move); kit product created with the kit; label job recorded on print; in-use checks |
| Infrastructure | Prisma stores via the `*AddUpdate` functions | Persistence |
| Server adapter | `/api/inventory/products` (+ units, barcodes, suppliers, price-log, lookup), `/api/inventory/batches`, `/api/inventory/kits`, `/api/inventory/label-templates`, `/api/inventory/label-jobs`, `/api/inventory/reorder-rules`, `/api/inventory/reorder-suggestions` | Guards, Zod, unit of work |
| UI | `src/features/inventory/products/*` etc. | Screens above |

## 5. API contracts (under `/api`, tenant from the session)
| Method & path | Notes | Permission | Errors |
|---|---|---|---|
| `GET /inventory/products?search&status&company&class&subclass&shelf&attr&min&max&page&pageSize&sort` → `{ items, total }`; `GET /inventory/products/summary` (chip counts); `GET /:id`; `POST`; `PATCH /:id`; `POST /:id/activate`, `/deactivate`; `DELETE /:id` | Create takes optional units, barcodes, suppliers | `item:*` | 400 formats; 409 duplicate SKU / UPC / barcode; 400 price < cost (not draft); 400 sub type of another class; 409 `PRODUCT_IN_USE` |
| `PATCH /inventory/products/:id/price` `{ field, value, source }` | Inline edit; writes the price log | `item:edit` | 400 price < cost |
| `GET /inventory/products/:id/price-log` | Read-only | `item:view` | |
| `GET /inventory/products/lookup?barcode=` | Product + unit + qty per scan (for POS and documents later) | `item:view` | 404 |
| `POST /inventory/products/:id/units`, `PATCH/DELETE /inventory/product-units/:id`; same for `barcodes`, `suppliers` | Flags move | `item:edit` | 409 unit in use by a barcode / document |
| `GET/POST /inventory/batches`, `PATCH /inventory/batches/:id`, `POST /:id/disposition` `{ disposition, notes }` | Register with expiry windows | view `item:view`; change `item:edit` | 409 duplicate batch no. per product; 400 expiry before manufacture |
| `GET/POST /inventory/kits`, `PATCH/DELETE /:id`, `POST /:id/activate`, `/deactivate` | Components replaced as a list; creates / renames the kit product | `item:*` | 400 kit containing itself; 409 `KIT_IN_USE` |
| `GET/POST /inventory/label-templates`, `PATCH/DELETE /:id` | System templates can't be deleted | `item:*` | 409 `SYSTEM_ROW_LOCKED` |
| `GET /inventory/label-jobs`, `POST /inventory/label-jobs` (records a printed job), `GET /:id` | Lines: product, copies, batch, price | `item:view` to print and record | 400 copies 1–500 |
| `GET/POST /inventory/reorder-rules?product=`, `PATCH/DELETE /:id`; `GET /inventory/reorder-suggestions` | One rule per product per warehouse | `item:*` | 409 duplicate rule; 400 low > high |

- **Delete vs deactivate:** delete only when unused (`isReferenced`); soft delete where `deletedAt` exists (products, kits). Otherwise deactivate. Codes are never reused.
- **Concurrency:** `rowVersion` everywhere.

## 6. Database changes: `prisma/sql/014-products.sql` (idempotent, added to `db:sql`)
1. **Audit triggers** on `ProductUnits`, `ProductBarcodes`, `ProductSuppliers`, `ProductPriceLogs`, `KitComponents`, `BarcodeLabelTemplates`, `BarcodeLabelJobs`, `BarcodeLabelJobLines`, `ReorderRules`.
2. **Child save functions** (same shape as the generated ones): `productUnitAddUpdate`, `productBarcodeAddUpdate`, `productSupplierAddUpdate`, `productPriceLogAdd` (insert only), `barcodeLabelJobAddUpdate` (lines as an array). Same reason as sub types and party children: editing one child must not rewrite the parent.
3. **System label templates** per company (trigger on new tenants + Demo backfill): Thermal 2×1" roll, 38×25 mm roll, A4 sheet of 40.
4. **Error codes:** `PRODUCT_IN_USE`, `KIT_IN_USE`, `PRODUCT_PRICE_BELOW_COST`, `UNIT_IN_USE_BY_PRODUCT`.
5. **Readable labels** for the Phase 8 lookups (dispositions, price fields and sources, kit tones, media).

## 7. Audit (row history)
- **Tables covered:** all 12 (9 triggers added here). The price log is itself an append-only record, with its own row history.
- **User attribution:** app changes run in the signed-in user's unit of work. A price change and its log line, a kit and its product, a moved flag, and a label job with its lines are one transaction each. Who printed a label job comes from the session.
- **History view:** History tab on the product detail; History in the kit, batch, rule and template editors.

## 8. Ordered tasks
1. **Roadmap:**
   - Phase 8 `in-progress`;
   - pages and decisions (browser print, batches register, suggestions tab, no images);
   - Demand of Goods tab → Phase 22;
   - `npm run delivery:roadmap` must pass.
2. **Database:** `014-products.sql` (×2); Prisma models; `addUpdate` map; `isReferenced` tables; history registration.
3. **Contracts and domain helpers.**
4. **Server:** products, batches, kits, labels, reorder modules (inside `InventoryModule`).
5. **CSS:** the product / stock-ops sections, ported verbatim.
6. **Pages:**
   - `/inventory/items`, `/inventory/products/[id]`, `/inventory/kits`, `/inventory/labels`, `/inventory/batches`, `/inventory/demand`;
   - sidebar entries.
7. **Wire the flows;** then verification (§9) and the acceptance request.

## 9. Verification
- **API suite `api-p8`:**
  - **Products:**
    - formats (SKU, UPC, shelf, HS code) → 400;
    - duplicate SKU / UPC / barcode → 409;
    - price < cost (active) → 400, allowed as draft;
    - sub type of another class → 400;
    - create with units / barcodes / suppliers;
    - flags move (one base unit, primary barcode per kind, preferred supplier);
    - inline price edit writes the price log, and the log rejects updates (append-only);
    - barcode lookup;
    - paging / filters / chips;
    - stale edit → 409;
    - delete unused; delete in use → 409.
  - **Batches:** add, duplicate batch no. → 409, expiry before manufacture → 400, disposition change, expiry windows.
  - **Kits:**
    - create (KIT-NNN plus its product), component maths;
    - a kit containing itself → 400;
    - margin outside 5–50 → 400;
    - edit components;
    - delete.
  - **Labels:** system templates exist; record a job (lines, totals, printed by); copies > 500 → 400; deleting a system template → 409.
  - **Reorder rules:** create per warehouse and for all warehouses; duplicate → 409; low > high → 400; suggestions list.
  - **Permissions** (default grants):
    - storekeeper creates and edits but doesn't delete;
    - salesman and order booker view only;
    - auditor read-only.
  - **History:** real user and session on every write.
- **Regression:** Phase 2–7 suites (the Phase 6 suite's product-count checks now see products).
- **Visual:**
  - the six pages next to their templates (catalogue table and tiles, product modal, product detail, kits builder, labels preview, batches, reorder suggestions);
  - print preview of a label sheet;
  - 1400×900 and 390×844, light and dark.
- **Build:** typechecks, lint + lint:arch, roadmap check, SQL run twice.
- **Cleanup:** test data removed and purged; seeded label templates stay.

## 10. Acceptance criteria, risks, blockers
- **Acceptance:** §9 passes; deviations are listed in the acceptance request.
- **Risks:**
  - **This is the largest phase so far.** The catalogue and the kit / label screens are big script-driven template screens; they are rebuilt in React with the template CSS copied verbatim. I'll build and verify in this order: products → detail → batches → kits → labels → reorder, so problems surface early.
  - **Browser printing depends on the printer driver's page size.** The print CSS sets the label size, but roll printers need their paper size chosen once in the print dialog.
  - **Stock-dependent figures** (stock column, on hand, stock value, can build, suggestions) read 0 until the stock phases. The pages show real zeros, not sample figures.
- **Blockers:** none.

---
**Approve Phase 8 revision 1 for implementation?**
