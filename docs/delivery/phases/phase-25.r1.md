# Phase 25 rev 1 — Wholesale

**Objective:** Move volume through the wholesale counter and the field:
- **Order bookings:** orders taken by bookers, stock-checked and converted into wholesale invoices; shortages become back-orders.
- **Quick wholesale entry:** a keyboard-first wholesale invoice with tier pricing, schemes, credit control, hold / recall and order templates.
- **Bulk invoicing:** a whole route billed in one run, one invoice per shop; over-limit shops are skipped and recorded.
- **Back-orders:** pending quantities allocated as goods arrive (posted GRNs), then invoiced.

**Entities (5, TRANSACTIONAL):** Order Bookings · Order Templates · Held Bills (Quick Wholesale Entry) · Bulk Invoice Runs · Back-orders.

**Status before this plan:**
- Phases 0–23 done; 24 is in progress in the parallel session (receipts, credit notes, returns, POS).
- Phase 25 depends only on 23 (sales invoices, done), 19 (GRN, done) and 14 (routes, price tiers, done).
- Claimed with the parallel session. SQL range 3xx: `302-wholesale.sql`.

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Order Templates | Transactional | customers, products ✓ | Needed by bookings and quick entry |
| Held Bills / Quick Wholesale Entry | Transactional | sales invoices (P23 ✓), price tiers ✓, schemes ✓ | Main wholesale billing screen |
| Order Bookings | Transactional | routes (P14 ✓), templates, price tiers | Field orders → invoices |
| Bulk Invoice Runs | Transactional | routes, sales invoices ✓ | Route billing in one go |
| Back-orders | Transactional | bookings, GRN (P19 ✓) | Shortages from bookings |

## 2. Verified schema (live DB; all 12 tables empty)
- **All tables exist**, with stamp / touch triggers, lookup validation and RLS. They were generated from the template, like Phase 23's.
- **Missing audit triggers (to add):** OrderBookingLines, OrderTemplates, OrderTemplateLines, HeldBills, HeldBillLines, BulkInvoiceRunCells, BulkInvoiceSkippedShops.
- **Numbering:** doc types `BK` (booking) and `WS` (wholesale invoice) exist, but no company has their series → seed them for all tenants and new ones.
- **Template function gaps to fix:**
  - `orderBookingAddUpdate` leaves `bookedAt` NULL (NOT NULL column) and can't change status. There are no check-stock / convert / hold transitions.
  - `orderBookingCancel` allows cancelling converted bookings → restrict to NEW / CHECKED / HELD.
  - `heldBillAddUpdate` has no recall / discard and doesn't default `heldByUserId`.
  - `bulkInvoiceRunAddUpdate` needs every cell amount from the app; there is no generate step.
  - There are no back-order functions at all.
  - `backorderLineStatusChk` rejects a line that is part-invoiced and then has the rest cancelled → relax it so INVOICED allows cancelled > 0.
  - Child lines are renumbered in place, so a reorder can hit a duplicate line number → the app always sends lines in order and replaces them.
- **Stock and credit:** availability comes from `Inventory.StockBalances.qtyAvailable` (on hand − reserved); credit from `Sales.getCustomerCreditPosition`. Views already exist for the back-order summary, incoming stock (posted GRN lines with free quantity) and booking KPIs.
- **Invoices:** `Sales.SalesInvoices` already carries channel WHOLESALE (→ WS number), price tier, route, booker / salesman. Posting does the WHOLESALE credit check (`301-sales-documents.sql`).

**Decisions proposed (recommended defaults):**
1. **Booking flow:** NEW → *Check stock* (CHECKED; per line available / short qty recorded) → *Convert*.
   - Convert creates and posts one WHOLESALE invoice per booking for the available quantity.
   - With *Allow partial* on, each shortage becomes a back-order (source BK) and the booking is PARTIAL. With it off, a short booking is HELD.
   - Cancel only before conversion. Booking `approve` = convert.
2. **Booker scope:** a user without `booking:approve` sees only bookings where they are the booker or that are on routes they book for (user → employee → `Routes.bookerEmployeeId`).
3. **Quick entry:**
   - Save posts a WHOLESALE invoice (WS number) through the Phase 23 invoice service.
   - Hold stores a held bill; recall restores it into the entry screen; discard closes it.
   - Credit block: the save fails with CREDIT_LIMIT_EXCEEDED; the screen offers *Hold bill*. The template's manager-PIN override is replaced by the Phase 26 credit-override workflow (not built here).
   - Template lines merge into the bill; *Save as template* stores the bill's lines.
4. **Bulk run:**
   - DRAFT (matrix cells or the same items for many shops) → *Generate*: each shop is saved and posted in its own transaction.
   - Over-limit or out-of-stock shops are skipped and recorded with a reason; the run ends COMPLETED.
   - Preview = credit / stock check without posting.
5. **Back-orders:**
   - *Allocate* picks a posted GRN line with free quantity and splits it across waiting lines by policy: oldest first, priority tier, or pro-rata. Batches go earliest expiry first.
   - *Convert* makes one WHOLESALE invoice per shop from allocated quantities. *Cancel* closes the pending rest with a reason.
   - The SMS notice in the template is a later phase (needs an SMS provider).
6. **Left out (template features with no backing yet), listed as deviations:**
   - WhatsApp share, Paste from Excel, scan mode
   - GPS map strip (shows the stored GPS flag / offset only) and "Sync app" (no booker app yet)

## 3. Template → page mapping
| Entity | Template | Page | Pattern |
|---|---|---|---|
| Quick entry + held bills + templates | `4D-wholesale.html:6–153`, `9H-wholesale.js:151–819` | `/wholesale/entry` | keyboard grid (CTN / PCS / total / rate / scheme / disc / GST), shop search with tier and credit gauge, templates menu, hold / recall menu, print preview (browser print); reuses the Phase 23 voucher grid / autocomplete / credit gauge |
| Bulk invoicing | `4D:156–219`, `9H:821–997` | `/wholesale/bulk` | route + date, Matrix (shops × products, CTN) or Same-items mode, preview with credit flags, Generate modal with per-shop progress, skipped shops |
| Order bookings | `4D:222–260`, `9H:999–1170` | `/wholesale/bookings` | KPIs, chips, table with stock / location / status, select + Check stock / Convert, detail drawer (lines, History), new booking drawer (template style: the template has none) |
| Back-orders | `4D:263–321`, `9H:1172–1313` | `/wholesale/backorders` | KPIs, by item / by customer accordion, incoming-stock feed, Allocate modal (policy), Convert, Cancel (reason) |

Nav: new "Wholesale" module (Quick Wholesale Entry, Bulk Invoicing, Order Bookings, Back-orders) beside the existing Distribution module.

## 4. Structure
- **DB** `prisma/sql/302-wholesale.sql`:
  - numbering BK / WS
  - audit triggers
  - fixed save functions
  - `orderBookingCheckStock` / `Convert` / `Hold` / `Cancel`
  - `heldBillRecall` / `Discard`
  - `bulkInvoiceRunGenerate` support (skips recorded in SQL; invoices via the sales functions)
  - `backOrderAllocate` / `Convert` / `Cancel`
  - status check fix
  - error codes: BOOKING_NOT_OPEN, BOOKING_STOCK_NOT_CHECKED, HELD_BILL_NOT_OPEN, BULK_RUN_NOT_DRAFT, BACKORDER_NOT_OPEN, BACKORDER_NOTHING_ALLOCATED, ALLOCATION_EXCEEDS_FREE_STOCK
- **Contracts** `src/shared/sales/wholesale.ts`. `SALES_CHANNELS` gains WHOLESALE (`src/shared/sales/documents.ts`).
- **Server** `src/server/modules/wholesale` (WholesaleModule, imports SalesModule for `SalesInvoicesService` / `SalesStore`):
  - order-templates
  - held-bills (+ `POST /distribution/held-bills/:id/convert-to-invoice` = the quick-entry save)
  - bookings (`/distribution/bookings`: check-stock / convert / hold / cancel)
  - bulk-invoice-runs (preview / generate)
  - back-orders (allocate / convert / cancel; incoming stock)
  - options
- **UI** `src/features/wholesale` + pages `/wholesale/{entry,bulk,bookings,backorders}`.
- **History:** registry for the 12 tables (permissions booking / wsentry / bulkinv / backord).

## 5. Verification (lean)
- **API smoke (~30 checks, Test Co):**
  - template CRUD; quick-entry save → WS invoice posted; hold → recall
  - booking → check → partial convert → back-order; booker scope
  - bulk run with one over-limit shop skipped
  - GRN allocate → convert; cancel
  - permissions; history attribution
- **UI:** screenshots vs template (light + one mobile).
- typecheck / lint / arch.

## 6. Risks
- Test Co has no routes or shop profiles: the suite sets up one route with two shops through the Phase 14 API.
- Phase 24 runs in parallel on shared registry files (add-only).
