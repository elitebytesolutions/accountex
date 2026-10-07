# Phase 6 rev 1: Product setup

**Objective:** the inventory masters that products (Phase 8) and stock transactions need first:
- units of measure;
- product companies / brands;
- product classes with their sub types;
- warehouses with their bins;
- stock movement reasons.

Every change is attributed to the user in row history. Nothing posts yet.

**Entities (5, MASTER):** Units of Measure · Brands / Companies · Product Classes · Warehouses & Bins · Stock Movement Reasons

**Status before this plan:** Phases 0–5 `done`; no phase in progress.

**Decisions taken with you:**
- **Own template-styled pages** for Units of Measure (`/inventory/units`) and Stock Movement Reasons (`/inventory/reasons`), as with Asset Categories in Phase 5. The Product Catalogue and Stock Adjustments pages belong to later phases and will link here.
- **Standard sets seeded for every tenant.** System units and system movement reasons are created for each new tenant (and Demo now). System rows can be edited and deactivated, but not deleted. Companies, classes and warehouses start empty.
- **Bins live inside the warehouse drawer:** a Bins section with add / edit / deactivate and a "generate A-01 … A-20" helper.

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Units of Measure | Master | none | Every product has a base unit and pack units (Phase 8) |
| Brands / Companies | Master | none | Products belong to a company / principal (Phase 8) |
| Product Classes | Master | none | Products are classified by class and sub type (Phase 8) |
| Warehouses & Bins | Master | Branches (done), users (done), chart of accounts (done) | Stock lives in a warehouse and bin; every stock transaction needs one |
| Stock Movement Reasons | Master | Chart of accounts (done) | Stock in / out and adjustments (later phases) pick a reason |

## 2. Verified schema (live DB; all 7 tables are empty; all have RLS)

**Units of Measure** (`Inventory.UnitsOfMeasure`; **audit trigger missing → added**)
- `code` `^[A-Z][A-Z0-9_]{0,9}$` (unique), `name`, `nameUrdu`;
- `kind` COUNT / WEIGHT / VOLUME / LENGTH (lookup `UnitOfMeasureKind`), `decimals` 0–3;
- `isSystem`, `isActive`. **No `deletedAt`:** an unused unit is deleted for real, and its code is never reused (`CODE_RETIRED`, from the audit trail).
- DB function `unitOfMeasureAddUpdate`.

**Brands / Companies** (`Inventory.ProductCompanies`; **audit trigger missing → added**)
- `code` `^[A-Z]{2,3}-?\d{2,3}$` (unique; auto `CO-NN` when blank), `name` (unique, case-insensitive), `shortName` ≤ 5 (the logo initials);
- `status` ACTIVE / INACTIVE; `address`, `city`, `country` (Pakistan), `phone`, `email`, `website`, `brandColour` `#RRGGBB`, `notes`, `deletedAt`.
- DB function `productCompanyAddUpdate`.

**Product Classes** (`Inventory.ProductClasses` + `ProductSubclasses`; **audit triggers missing → added on both**)
- **Class:** `code` `^MC-\d{3,4}$` (auto `MC-001`), `name` (unique), `nameUrdu`, `icon`, `isVisible`, `sortOrder`, `deletedAt`.
- **Sub type:** `code` `^ST-\d{3,4}$` (auto `ST-001`, unique across the company), `name` unique within its class, `isVisible`, `sortOrder`, `deletedAt`.
- DB function `productClassAddUpdate` saves sub types as a child array.

**Warehouses & Bins** (`Inventory.Warehouses` audited; `WarehouseBins` **audit trigger missing → added**)
- **Warehouse:**
  - `code` `^[A-Z]{2,3}-[A-Z0-9]{2,6}$` (e.g. `WH-LHR`; suggested from the name), `name` (unique), `description`;
  - `type` WAREHOUSE / SHOP / VAN (VAN needs a vehicle from Distribution, Phase 13+, so **VAN is hidden until then**);
  - `branchId`, `managerUserId`, `address`, `city`, `capacityPallets` > 0, `inventoryAccountId` (GL);
  - `blockNegativeStock` (true), `isPrimary` (one per company), `status`, `deletedAt`.
- **Bin:** `code` `^[A-Z0-9][A-Z0-9-]{0,19}$` (unique per warehouse), `rack`, `shelfRow`, `position`, `zone`, `isActive`, `deletedAt`.
- DB functions `warehouseAddUpdate` and `warehouseBinAddUpdate` (bins saved separately).
- Stock on hand: `Inventory.StockBalances` (empty until stock phases).

**Stock Movement Reasons** (`Inventory.StockMovementReasons`; audited)
- `direction` IN / OUT / ADJ; `code` `^[A-Z][A-Z0-9_]{1,39}$` (unique per direction), `label`, `hint`, `icon`;
- `ledgerMovementType` MANUAL_IN / MANUAL_OUT / OPENING / ADJUSTMENT / WRITE_OFF;
- `expenseAccountId` (GL, optional), `isSystem`, `sortOrder`, `isActive`. **No `deletedAt`:** unused custom reasons are deleted for real; codes are never reused.
- DB function `stockMovementReasonAddUpdate`.

**Permissions** (already in the catalogue):
- `item:*` covers units, companies and classes;
- `wh:*` covers warehouses and bins;
- `adj:*` covers reasons (view `adj:view`, change `adj:create` / `adj:edit` / `adj:delete`).

**Unresolved:** none.

## 3. Template → page mapping
| Entity | Template | Page / component | Notes |
|---|---|---|---|
| Brands / Companies | `4B-products.html` `app/inventory/companies` | `/inventory/companies` | **From the template:** the 4 KPI tiles (total, active, inactive, most-used company); search; city / with-products / sort filters; All / Active / Inactive segment; the company cards (initials in the brand colour, code, status, product count, city, updated). **Create / edit:** the right-hand panel, with the code generator, status radios, brand-colour swatches, country, phone, email, website, notes and the live preview. **Omitted:** "Import Companies" (no import yet). Product counts come from `Inventory.Products` (0 until Phase 8). |
| Product Classes | `4B-products.html` `app/inventory/classes` | `/inventory/classes` | **From the template:** "Add Main Class" / "Add Sub Type"; search, main-ID and visibility filters, Reset; the summary chips; one collapsible card per class (icon, MC-code, name, sub type and product counts, Visible switch) with its sub types table (drag to reorder, Visible switch, edit, delete) and "Add sub type to …". **Create / edit:** the template's modal (IDs generated automatically). |
| Warehouses & Bins | `41-acc-trade.html` `app/inventory/warehouses` | `/inventory/warehouses` | **From the template:** KPI tiles; one card per warehouse (name, code, description, Primary / Branch badge, address, capacity, stock value, SKUs, bins / racks, manager, Edit). **Create / edit:** the "Add Warehouse" modal fields (name, code, branch, manager, address, capacity, inventory account, block negative stock), shown in a wide drawer with the added Bins section. **Real figures:** stock value and SKUs come from `StockBalances` (0 for now). **Changed:** utilisation needs pallets in use, which don't exist yet, so the card shows capacity only and the "Avg utilisation" and "Transfers in transit" tiles become "Bins" and "Primary warehouse". **Omitted:** "New transfer" and "View stock" (stock phases). |
| Units of Measure | none | `/inventory/units` | Template-styled page: KPI tiles (units, active, by kind) + table (code, name, Urdu name, kind, decimals, system badge, status) + drawer. |
| Stock Movement Reasons | none (the "by reason" panel on `app/inventory/adjustments` is a report) | `/inventory/reasons` | Template-styled page: In / Out / Adjustment tabs, a table (icon, label, code, ledger movement, expense account, system badge, status) + drawer. The icon and row style follow the template's "Q1 by reason" list. |

**Sidebar:** a new **Inventory** group:
- **Products** › Companies & Brands, Product Classes, Units of Measure;
- **Stock** › Movement Reasons;
- **Warehouses**.

**Pages** use the `Screen` route wrapper so the template's per-screen CSS (`pr-screen`, `pr-co`, `pr-cl`) applies. The template's product CSS sections are copied verbatim into `src/app/styles/` (as with the bank rules CSS in Phase 5).

## 4. Clean Architecture
| Layer | Module | Responsibility |
|---|---|---|
| Contracts | `src/shared/inventory/{unit,company,product-class,warehouse,movement-reason}.ts` | Zod mirrors of the DB checks (code patterns, decimals 0–3, colour, phone / email, capacity > 0, bin code); `patchFields` for PATCH bodies |
| Domain | `warehouses/domain/bins.ts` | Pure "generate bins" helper (prefix, from / to, zero-padding) used by the UI and the API |
| Application | one service per entity | Auto codes (CO-NN, MC-NNN, ST-NNN); retired-code checks; GL checks via `GlLinks` (inventory account = asset class; expense account = class 5); one primary warehouse (making another primary moves the flag in the same unit of work); no deactivating a warehouse with stock on hand; system rows can't be deleted; in-use checks (`isReferenced`) |
| Infrastructure | Prisma stores via the `*AddUpdate` functions | Persistence |
| Server adapter | `/api/inventory/units`, `/companies`, `/classes`, `/warehouses`, `/movement-reasons` | Guards, Zod, unit of work |
| UI | `src/features/inventory/*` | Screens above |

## 5. API contracts (under `/api`, tenant from the session)
| Method & path | Notes | Permission | Errors |
|---|---|---|---|
| `GET/POST /inventory/units`, `PATCH/DELETE /:id`, `POST /:id/activate`, `/deactivate` | | `item:*` | 409 `UNIT_IN_USE`; 409 `SYSTEM_ROW_LOCKED` on deleting a system unit; 409 `CODE_RETIRED` |
| `GET/POST /inventory/companies`, `PATCH/DELETE /:id`, `POST /:id/activate`, `/deactivate`, `GET /inventory/companies/next-code` | Code auto-assigned when blank; list carries product counts | `item:*` | 400 code / phone / email / colour; 409 duplicate name; 409 `PRODUCT_COMPANY_IN_USE` |
| `GET/POST /inventory/classes`, `PATCH/DELETE /:id`; `POST /inventory/classes/:id/subclasses`, `PATCH/DELETE /inventory/subclasses/:id`; `PUT /inventory/classes/:id/subclass-order` | Visibility via PATCH; drag order → sortOrder 10, 20, … | `item:*` | 409 duplicate name (sub type: within its class); 409 `PRODUCT_CLASS_IN_USE` (class with sub types or products; sub type with products) |
| `GET/POST /inventory/warehouses`, `PATCH/DELETE /:id`, `POST /:id/activate`, `/deactivate`; `GET/POST /inventory/warehouses/:id/bins`, `POST /inventory/warehouses/:id/bins/generate`, `PATCH/DELETE /inventory/bins/:id` | The list carries bins / racks counts, stock value and SKUs | `wh:*` | 422 `ACCOUNT_NOT_POSTABLE` (inventory account); 422 inactive branch / manager; 409 `WAREHOUSE_HAS_STOCK` on deactivate; 409 `WAREHOUSE_IN_USE`; 409 `BIN_IN_USE`; 409 duplicate bin code |
| `GET/POST /inventory/movement-reasons`, `PATCH/DELETE /:id`, `POST /:id/activate`, `/deactivate` | `?direction=IN\|OUT\|ADJ` | view `adj:view`; change `adj:create/edit/delete` | 422 `ACCOUNT_NOT_POSTABLE` (expense account); 409 `MOVEMENT_REASON_IN_USE`; 409 `SYSTEM_ROW_LOCKED` |

- **Delete vs deactivate:** delete only when unused (`isReferenced`). Soft delete where `deletedAt` exists (companies, classes, sub types, warehouses, bins). Otherwise deactivate (or hide, for classes). Codes are never reused.
- **Concurrency:** `rowVersion` everywhere (409 when stale).
- **Lists:** small; loaded whole, filtered and sorted in the page (companies paginate client-side like the template).
- **Option endpoints:** none new; branches, users and GL accounts use the existing ones.

## 6. Database changes: `prisma/sql/012-product-setup.sql` (idempotent, added to `db:sql`)
1. **Audit triggers** (`triggerAudit`) on `UnitsOfMeasure`, `ProductCompanies`, `ProductClasses`, `ProductSubclasses`, `WarehouseBins`.
2. **Seed defaults:**
   - `Inventory.seedInventoryDefaultsFor(pTenant)`, called by an `AFTER INSERT` trigger on `Platform.Tenants` (as the SoD seed); Demo backfilled. Rows are `isSystem`.
   - **Units:** PCS, PKT, BOX, CTN, DZN (count, 0 dp); KG, G (weight, 3 / 0 dp); L, ML (volume, 3 / 0 dp); M (length, 2 dp).
   - **Reasons:**
     - IN: Opening stock (OPENING), Found in count (ADJUSTMENT), Received – other (MANUAL_IN);
     - OUT: Damaged, Expired, Theft / loss (WRITE_OFF), Internal consumption, Free samples (MANUAL_OUT);
     - ADJ: Cycle count variance (ADJUSTMENT).
     - Expense accounts are left blank; you set them before the first adjustment.
3. **Error codes:** `UNIT_IN_USE`, `PRODUCT_COMPANY_IN_USE`, `PRODUCT_CLASS_IN_USE`, `WAREHOUSE_IN_USE`, `WAREHOUSE_HAS_STOCK`, `BIN_IN_USE`, `MOVEMENT_REASON_IN_USE`, `SYSTEM_ROW_LOCKED`.
4. **Readable labels** for the Phase 6 lookups ("Count", "Weight", "Write-off", "Shop", …).

## 7. Audit (row history)
- **Tables covered:** all 7 (5 triggers added here).
- **User attribution:**
  - App changes run in the signed-in user's unit of work.
  - Moving the primary flag, and generating a batch of bins, are each one transaction attributed to the same user and request.
  - The seed runs as `system: seedInventoryDefaultsFor`.
- **History view:** History in each drawer / modal.

## 8. Ordered tasks
1. **Roadmap:**
   - Phase 6 `in-progress`;
   - units and reasons: pages `/inventory/units` and `/inventory/reasons`, template notes;
   - `npm run delivery:roadmap` must pass.
2. **Database:** `012-product-setup.sql` (×2); Prisma models; `addUpdate` map; `isReferenced` tables; history registration.
3. **Contracts and domain** (bin generator).
4. **Server:** services, stores, controllers; an `InventoryModule`.
5. **Pages:**
   - `/inventory/companies`, `/inventory/classes`, `/inventory/warehouses`, `/inventory/units`, `/inventory/reasons`;
   - copy the template's product CSS;
   - sidebar entries.
6. **Wire the flows;** then verification (§9) and the acceptance request.

## 9. Verification
- **API suite `api-p6`:**
  - **Units:** Demo has the 10 system units; create a custom unit; bad code / decimals 4 → 400; deleting a system unit → 409; deleting an unused custom unit works and its code can't be reused; deactivate / activate.
  - **Companies:** auto code `CO-01`; duplicate name → 409; bad phone / email / colour → 400; edit with a stale rowVersion → 409; deactivate; delete unused.
  - **Classes:** auto `MC-001` / `ST-001`; duplicate sub type name in the same class → 409 (allowed in another class); reorder sub types; hide a class; deleting a class that still has sub types → 409.
  - **Warehouses:** create with branch, manager and inventory account; non-asset inventory account → 422; second primary moves the flag; generate bins A-01…A-20; duplicate bin code → 409; delete a bin; delete an unused warehouse. (No stock exists yet, so `WAREHOUSE_HAS_STOCK` is checked in a rolled-back transaction with a test balance row.)
  - **Reasons:** Demo has the 9 system reasons; set an expense account (class 5 OK, other class → 422); custom reason CRUD; deleting a system reason → 409.
  - **Permissions:**
    - auditor views only;
    - storekeeper creates and edits all five (default grants `item` and `wh` view / create / edit, `adj` view / create / edit / post) but can't delete;
    - salesman has no access.
  - **History:** real user and session on every write (psql).
- **Regression:** the Phase 2–5 API suites re-run (shared nav, `isReferenced`, tenant trigger).
- **Visual:**
  - `/inventory/companies`, `/inventory/classes`, `/inventory/warehouses` next to their templates;
  - `/inventory/units` and `/inventory/reasons` checked for consistency;
  - 1400×900 and 390×844, light and dark.
- **Build:** both typechecks, lint + lint:arch, roadmap check, SQL run twice.
- **Cleanup:** test data removed and soft-deleted test rows purged, so no real codes are retired. The seeded system units and reasons stay.

## 10. Acceptance criteria, risks, blockers
- **Acceptance:** §9 passes; deviations are listed in the acceptance request.
- **Risks:**
  - The template's product screens are large, script-driven layouts (companies side panel, class cards with drag-reorder). They're rebuilt in React with the template's CSS copied verbatim; drag-reorder uses native HTML5 drag events (no new library).
  - Warehouse figures (stock value, SKUs) read 0 until the stock phases; utilisation is left out rather than invented.
- **Blockers:** none.

---
**Approve Phase 6 revision 1 for implementation?**
