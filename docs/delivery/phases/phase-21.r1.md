# Phase 21 rev 1 — Stock operations

**Objective:** Move and correct stock outside purchasing and sales. Posting produces the stock ledger (StockMovements / StockBalances) and its journal. The four documents:
- manual stock in / out;
- transfers between warehouses (dispatch → in transit → receive);
- adjustments (write-offs / gains);
- stock counts, whose variance posts as an adjustment.

**Entities (4, TRANSACTIONAL):** Stock In/Out · Stock Transfers · Stock Adjustments · Stock Counts

**Decisions (2026-10-08):**
- Adjustments and count variances go through the approval engine when a *Stock adjustment* workflow exists. Otherwise `adj:post` / `cnt:approve` posts directly. No workflow is seeded.
- Transfers are two-step. Dispatch moves stock out into *stock in transit*. Receipt brings it in; short or excess quantities are a receipt variance written to stock loss / gain.
- **Testing kept basic** (per your note): one API smoke suite and a quick screenshot pass.

## 1. Verified schema (all tables exist, audited, no rows)
- **StockInOut / StockInOutEntryLines:**
  - Header: mode in / out, reason (movement reasons, 27 seeded), warehouse / bin, requested by, totals, status.
  - Lines: item, batch or new batch no. / expiry, qty, unit cost.
  - DB functions: `stockInOutEntryAddUpdate / Post / Cancel` (+ `…Entries`).
- **StockTransfers / StockTransferLines / StockTransferReceiptLines:**
  - Header: from → to warehouse, carrier / driver / vehicle, dispatched / ETA / received.
  - Lines: item, batch, bins, cartons / loose.
  - Receipt lines: sent / received / variance.
  - DB functions: `stockTransferAddUpdate / Post` (dispatch) `/ Receive / Cancel`.
- **StockAdjustments / StockAdjustmentLines:**
  - Header: warehouse, reason, offset account, approval fields, source document (count).
  - Lines: on hand / counted / change, unit cost, value.
  - DB functions: `stockAdjustmentAddUpdate / Post / Cancel`.
- **StockCounts / StockCountLines:**
  - Header: scope (classes, ABC-A only), blind count, freeze snapshot, counted progress, shortage / excess / net variance.
  - Lines: expected (frozen), counted, variance, reason.
  - DB functions: `stockCountAddUpdate / Approve / Cancel`.
- **Numbering:** document types MI / MO / TRF / ADJ / SC exist; no company has their series yet.
- **Posting roles:** STOCK_IN_TRANSIT, GOODS_IN_TRANSIT, INVENTORY_WRITE_OFF, STOCK_GAIN (mapped in Test Co).

## 2. Template → page mapping
| Entity | Template | Page |
|---|---|---|
| Stock In/Out | `4C-stock-ops.html:5` (`app/inventory/stock-in-out`) | `/inventory/stock-in-out` |
| Stock Transfers | `4C-stock-ops.html:7` (`app/inventory/transfer`) | `/inventory/transfer` |
| Stock Adjustments | `41-acc-trade.html:1796` (`app/inventory/adjustments`) | `/inventory/adjustments` |
| Stock Counts | `4C-stock-ops.html:9` (`app/inventory/count`) | `/inventory/count` |

Each page has: list + editor + drawer with History, plus loading / empty / error / permission states.

## 3. Server and API (`src/server/modules/inventory-ops/`, `/api/inventory/...`)
| Endpoints | Permission |
|---|---|
| `stock-in-out`: list / get / create / edit / delete draft / `post` / `cancel` | adj:* |
| `transfers`: list / get / create / edit / delete / `dispatch` / `receive {lines}` / `cancel` | xfer:* |
| `adjustments`: list / get / create / edit / delete / `submit` / `approve` / `reject` / `post` / `cancel` (approval subject ADJ, workflow STOCK_ADJUSTMENT) | adj:* |
| `counts`: list / get / create (scope) / `freeze` / `lines` (enter counts) / `submit` / `approve` (posts the variance adjustment) / `cancel` | cnt:* |
| `options`: warehouses, bins, products with stock, batches, reasons, accounts | any of the above view permissions |

- Insufficient stock → 409.
- Batch required for expiry-tracked items on stock in.

## 4. Database — `prisma/sql/027-stock-ops.sql`
- MI / MO / TRF / ADJ / SC series for every company (backfill + provisioning trigger).
- Error codes with HINTs where the API shows them: `STOCK_INSUFFICIENT`, `TRANSFER_NOT_DISPATCHED`, `COUNT_NOT_FROZEN`, `ADJUSTMENT_APPROVAL_REQUIRED`.
- Fixes for any bugs found in the never-run posting functions.

## 5. Audit
All nine tables are already audited. Every action runs in the user's unit of work, and the History tab is on each drawer.

## 6. Verification (basic)
- **API smoke suite (Test Co), happy path per entity:**
  - stock in / out moves the balance;
  - a transfer dispatches and then receives with a short-receipt variance;
  - an adjustment posts (and is routed when a workflow exists);
  - a count freezes, is counted and approved, and the variance posts.
  - Plus a couple of key errors (insufficient stock, edit after post) and one permission check.
- Typecheck, lint, roadmap check, and a quick screenshot of each page (light plus one of dark / mobile).

---
**Approve Phase 21 revision 1?**
