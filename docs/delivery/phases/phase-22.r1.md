# Phase 22 rev 1 — Stock vouchers & demand

**Objective:** Five pieces of stock work:
- stock vouchers (breakage, gifts, samples, internal use);
- assembly vouchers (build / break kits);
- goods demand (what to buy, from reorder levels) converted into draft purchase orders;
- principal claims and targets;
- bulk price updates (with undo).

**Entities (5, TRANSACTIONAL):** Stock Vouchers · Assembly Vouchers · Goods Demands · Principal Claims & Targets · Bulk Price Updates

**Decisions (2026-10-08):**
- **No template:** Assembly Vouchers, Principal Claims & Targets and Bulk Price Updates are built in the template style (list + form + drawer) and listed as deviations.
- **Convert to PO:** a demand becomes a draft purchase order for its vendor. Normal PO approval applies.
- **Testing:** basic smoke API suite and a quick screenshot per page.

## 1. Verified schema (all tables exist, audited)
- **StockVouchers / Lines:**
  - Header: type, warehouse, breakage reason / recipient / occasion / customer / salesman, returnable + due date, department / cost centre, expense account, totals.
  - Lines: item, batch, lot, UOM factor, qty, rate.
  - DB functions: `stockVoucherAddUpdate / Post / Cancel` (+ entries).
- **AssemblyVouchers / Lines:**
  - Header: kit, direction (build / break), kit qty, warehouse, kit unit cost.
  - Lines: components (qty per kit, qty, cost).
  - DB functions: `assemblyVoucherAddUpdate / Post / Cancel` (+ entries).
- **GoodsDemands / Lines:**
  - Header: manufacturer, vendor, source (reorder / manual), status, totals, linked PO.
  - Lines: item, cartons, base qty, bonus, rate, discount.
  - DB functions: `goodsDemandAddUpdate / Order / Cancel`.
  - Generation from Phase 8 reorder rules is done in the app.
- **PrincipalClaims, PrincipalTargets:**
  - Claims: manufacturer, type, item / batch, qty, amount, status, submitted / settled, linked debit note.
  - Targets: manufacturer, period, basis, target vs achieved.
  - DB functions: `principalClaimAddUpdate / Cancel`, `principalTargetAddUpdate`.
- **BulkPriceUpdates / Lines:**
  - Header: scope (manufacturer / class), price field, change %, rounding, item count, applied / undone.
  - Lines: old → new value per item.
  - DB function: `bulkPriceUpdateAddUpdate`. Apply and undo write ProductPriceLogs in the app's unit of work.
- **Numbering:** series for the document types used (stock voucher, assembly, demand, claim, price batch) are added where missing.

## 2. Pages
| Entity | Template | Page |
|---|---|---|
| Stock Vouchers | `44-purchase-docs.html:429` (`app/inventory/stock-vouchers`) | `/inventory/stock-vouchers` |
| Goods Demands | `4C-stock-ops.html:17` (`app/inventory/demand`) | `/inventory/demand` (the existing reorder page gets the demand tabs, or a separate page if the reorder page already uses this route) |
| Assembly Vouchers | none, template style | `/inventory/assembly` |
| Principal Claims & Targets | none, template style | `/inventory/principal-claims` (tabs: claims, targets) |
| Bulk Price Updates | none, template style | `/inventory/price-updates` |

## 3. Server — extends `src/server/modules/inventory-ops/` (`/api/inventory/...`)
| Entity | Permission | Actions |
|---|---|---|
| Stock vouchers | adj:* | CRUD, post, cancel |
| Assembly vouchers | adj:* | CRUD, post, cancel (consume components ↔ produce kit) |
| Goods demands | item:* | `generate` (from reorder levels), CRUD, `convert-to-po` (draft PO), cancel |
| Principal claims | item:* | CRUD, submit, settle (amount, optional debit-note link), cancel |
| Principal targets | item:* | CRUD; achieved figure from posted bills of that principal |
| Bulk price updates | item:* | create with scope → `preview` lines → `apply` (updates Products and writes ProductPriceLogs) → `undo` |

## 4. Database — `prisma/sql/028-stock-demand.sql`
- Numbering series.
- Error codes where the API shows them.
- Fixes for bugs found in the never-run functions.

## 5. Verification (basic)
- **Smoke API suite:** one happy path per entity:
  - a breakage voucher posts and stock goes down;
  - a kit build consumes components and adds kits;
  - a demand is generated and converted into a draft PO;
  - a claim is submitted and settled;
  - a target is created;
  - a price update is applied and undone.
  - Plus one permission check.
- Typecheck, lint, roadmap check, and a quick screenshot per page.

---
**Approve Phase 22 revision 1?**
