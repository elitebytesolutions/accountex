# Phase 19 rev 1 — Purchasing

**Objective:** Buy stock and services end to end: purchase orders (with approval), goods received notes that put accepted stock into a warehouse (batch / expiry for batch-tracked products) and post it against goods-received-not-invoiced, vendor bills matched three ways to the PO and GRN (input tax, advance tax, withholding), the one-step purchase voucher for counter purchases (stock in + bill + optional payment), and landed cost for imports (charges allocated to the received items, stock revalued).

**Entities (4, TRANSACTIONAL):** Purchase Orders · Goods Received Notes · Vendor Bills (incl. the purchase voucher) · Landed Cost

**Status before this plan:** Phases 0–18 done. Phases 36–39 (Super Admin) are in progress in a parallel session; no other workspace phase is in progress.

**Decisions taken (2026-10-08):**
- **Approvals:** purchase orders and vendor bills route through the Phase 16 approval engine when the company defines a Purchase order / Vendor bill workflow; with none, a user with `po:approve` / `bill:approve` approves directly. Nothing seeded.
- **Purchase voucher:** included, as a vendor bill on the COUNTER channel (stock in + bill + pay-now by cash / bank / cheque, WHT).
- **Batches:** GRN and bill lines capture batch no. and expiry for batch-tracked products only (template deviation).
- **Bill payments:** the Bills list "Pay selected" waits for Phase 20 (Payables); only the purchase voucher's pay-now settles at posting.

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Purchase Orders | Transactional | Vendors (P7 ✓), Products (P8 ✓), Warehouses (P6 ✓), Approvals (P16 ✓) | Start of the purchase cycle |
| Goods Received Notes | Transactional | Purchase orders (this phase), Warehouses | Stock in; feeds bills and landed cost |
| Vendor Bills | Transactional | GRN (this phase), Tax codes (P4 ✓) | The payable; needed by Payables (P20) |
| Landed Cost | Transactional | GRN, Vendor bills (this phase) | Import cost into stock |

## 2. Verified schema
All nine tables exist in `Purchases`, all with stamp / touch / **audit** triggers, lock triggers (posted / approved documents are read-only) and lookup validation; no rows yet.

- **PurchaseOrders / Lines:** vendor, branch, warehouse, expected date, payment terms (lookup), credit days, cost centre, department, project, buyer, currency / FX, totals; status DRAFT / PENDING_L1 / PENDING_L2 / APPROVED / PARTIALLY_RECEIVED / RECEIVED / BILLED / CANCELLED. Lines: item or description + account (services), cartons / loose → base qty (trigger), bonus, rate, discount %, tax code / rate / amount, `receivedQty`, `billedQty`. Functions: `purchaseOrderAddUpdate`, `purchaseOrderApprove`, `purchaseOrderCancel`.
- **GoodsReceivedNotes / Lines:** PO, vendor, warehouse, vendor ref, QC status / note, match status (MATCHED / QTY_VARIANCE / TWO_WAY_BILL_AWAITED / OVER_RECEIPT), bill status (AWAITING / PARTIALLY_BILLED / BILLED), isImport, status DRAFT / POSTED / CANCELLED, journalEntryId. Lines: PO line, item, ordered / previously received / received / accepted / rejected qty, reject reason (lookup), batch / batch no. / expiry, unit cost. **Posting exists** (`goodsReceivedNotePost` → `…Entries`): rejects over-receipt (`OVER_RECEIPT`), resolves batches, moves stock in (`Inventory.stockMove`), posts Dr warehouse inventory / Cr GRNI; `goodsReceivedNoteCancel` reverses. A roll-up trigger updates the PO.
- **VendorBills / Lines:** channel STANDARD / COUNTER, vendor, PO, GRN, vendor invoice no. (unique per vendor), payable account, currency / FX, purchaser, deal on supply, retail-price discount %, capture method, totals incl. advance tax and WHT, net payable, pay mode CREDIT / CASH / BANK / CHEQUE with cash / bank account, cheque no., paid-now and balance, match status (MATCHED / QTY_VARIANCE / PRICE_VARIANCE / NO_PO) + variance %, dispute flag, status DRAFT / AWAITING_APPROVAL / APPROVED / POSTED / PARTIALLY_PAID / PAID / VOID. Lines: item or account, PO / GRN line, UPC, cartons / loose / bonus / breakage → total qty, rate, sale price (+ update item sale price), discount, tax code, WHT section / rate / amount, net unit cost, batch / expiry, cost centre, project. **Posting exists** (`vendorBillPost` → `…Entries`): GRN lines clear GRNI with price variance revaluing average cost (rest to COGS); lines without a GRN (counter purchase) move stock in or hit the expense account; input GST, advance tax 236G, WHT 153 lines; Cr payable; pay-now leg (cash / bank, issuing a cheque for CHEQUE); `vendorBillVoid` reverses. `vendorBillApprove` exists.
- **LandedCostShipments / Items / Charges:** import GRN, origin, ports, mode (SEA_FCL / SEA_LCL / AIR / ROAD), BL / GD / LC refs, FX, ETA / cleared on, allocation basis VALUE / QTY / WEIGHT, FOB / capitalised / claimable / landed totals, status IN_TRANSIT / CLEARED / POSTED / CANCELLED. Items: GRN line, item, qty, weight, FOB unit / amount, share %, allocated, landed unit cost. Charges: type (16 lookup values: duties, import sales tax, s.148 tax, freight, clearing…), payee vendor / name, rate %, amount, in-cost / claimable flags, claim account. **Posting exists** (`landedCostShipmentPost` → `…Entries`): needs the posted import GRN and an allocation matching the capitalised charges; revalues average cost (rest to COGS), claimable taxes to IMPORT_INPUT_ST / ADVANCE_TAX_148, Cr GRNI (FOB) and payees / LANDED_COST_CLEARING.
- **Posting roles** (all mapped in Test Co): GRNI, INVENTORY (or the warehouse's inventory account), INPUT_GST, ADVANCE_TAX_236G, WHT_PAYABLE_153, COGS, IMPORT_INPUT_ST, ADVANCE_TAX_148, LANDED_COST_CLEARING, ROUNDING, AP_CONTROL.
- **Numbering:** document types PO, GRN, BILL, LC exist; **no company has their series**.
- **Missing audit triggers:** none.

Unresolved questions: none (decisions above). Note: Demo has no warehouse yet, so receiving in Demo needs one set up first.

## 3. Template → page mapping
| Entity | Template | Page / component | Pattern | States |
|---|---|---|---|---|
| Purchase Orders | `41-acc-trade.html:1192` (`app/purchases/orders`), New PO modal `#trd-new-po` :1239 | `/purchases/orders` `PurchaseOrdersScreen` | KPIs, chips, table with received progress, row actions by status; new / edit PO modal with line grid; approve / cancel; detail drawer with History | loading, empty, error, permission |
| GRN | `44-purchase-docs.html:250` + `94-purchase-docs.js` 546–673 (`app/purchases/grn`) | `/purchases/grn` `GrnScreen` | receive panel from a PO (receive all remaining, accepted / rejected + reason, batch / expiry for batch items), match card, warehouse, Post; GRN register; cancel | + validation |
| Vendor Bills | `41-acc-trade.html:1266` (`app/purchases/bills`), `:1334` (`app/purchases/bills/new`) | `/purchases/bills` `VendorBillsScreen`, `/purchases/bills/new` + `/purchases/bills/[id]` `VendorBillEditor` | list with match / status filters; editor: vendor, PO, GRN (load from PO / GRN), invoice no., lines with account / tax / WHT, totals, posting preview, approval route; submit / approve / post / void | |
| Purchase Voucher | `44-purchase-docs.html:5` + `94-purchase-docs.js` 127–538 (`app/purchases/voucher`) | `/purchases/voucher` `PurchaseVoucherScreen` | 4-step wizard: details, items grid (cartons / bonus / breakage, sale price, GST, discount), payments & tax (mode, account, cheque, WHT, paid now), review with journal preview; save draft / save & post | |
| Landed Cost | `4A-company-plus.html:114` + `9A-company-plus.js:1798` (`app/purchases/landed-cost`) | `/purchases/landed-cost` `LandedCostScreen` | shipment cards, allocation table (value / qty / weight), cost lines (in cost / claimable), totals, journal preview, Post | |

Missing templates: none. Shown disabled: bill "Pay selected" (Phase 20), bill OCR scan and attachments (Phase 35), debit-note action (Phase 20).

## 4. Clean Architecture
| Layer | Module / file | Responsibility |
|---|---|---|
| Contracts | `src/shared/purchases/*.ts` | Zod schemas, types, line maths (base qty, discount, tax, WHT), three-way match helper |
| Domain | `purchasing/<entity>/domain` | status machines, match status, allocation maths (value / qty / weight, rounding to the last line) |
| Application | `purchase-orders`, `grns`, `vendor-bills`, `landed-cost` use cases (new `src/server/modules/purchasing/`) | approval engine subjects for PO and BILL; posting via the existing DB functions |
| Infrastructure | Prisma stores + DB functions | |
| Server adapter | `/api/purchases/...` with `@RequirePermission` (po, grn, bill) | |
| UI | `src/features/purchasing/...` + pages | |

## 5. API / action contracts
| Method & path | Permission | Notes / errors |
|---|---|---|
| `GET /purchases/options` | po:view | vendors (+ WHT status, payable account, terms), products (unit, cartons factor, batch-tracked, last cost, tax code), warehouses, tax codes, branches, cost centres, departments, accounts, bank / cash accounts |
| `GET /purchases/orders?status&vendor&search&page` · `GET /:id` · `POST` · `PATCH /:id` (draft) · `DELETE /:id` (draft) | po:view / create / edit / delete | KPIs; received / billed progress per line |
| `POST /purchases/orders/:id/submit` · `/approve` · `/cancel` `{reason}` | po:create / po:approve / po:edit | engine when a workflow routes it (409 when none — approve directly); cancel only before receipt |
| `GET /purchases/grns?…` · `POST` (from a PO) · `PATCH /:id` (draft) · `POST /:id/post` · `POST /:id/cancel` | grn:view / create / edit / post | 409 `OVER_RECEIPT`; reject reason required; batch no. + expiry required for batch-tracked items |
| `GET /purchases/bills?match&status&search&page` · `GET /:id` · `POST` · `PATCH /:id` · `DELETE /:id` (draft) · `POST /purchases/bills/from-grn/:grnId` | bill:view / create / edit / delete | 409 duplicate vendor invoice no.; match status and variance computed |
| `POST /purchases/bills/:id/submit` · `/approve` · `/post` · `/void` `{reason}` | bill:create / approve / post | posted bills only voided (reversal) |
| `POST /purchases/vouchers` (counter bill, save & post in one) | bill:create + bill:post | pay-now validation (account, cheque no., amount ≤ total) |
| `GET /purchases/landed-cost?…` · `POST` · `PATCH /:id` · `POST /:id/allocate {basis}` · `POST /:id/post` · `POST /:id/cancel` | bill:view / create / edit / post | 409 when the import GRN isn't posted or the allocation doesn't match the capitalised charges |
| `GET /history/Purchases/<table>/:id` | view permission | |

- **Delete vs deactivate:** drafts can be deleted; posted GRNs / bills / shipments are cancelled or voided (reversal), approved POs are cancelled.
- **Concurrency:** rowVersion on every write. **Pagination:** server-side.

## 6. Database changes — `prisma/sql/025-purchasing.sql` (idempotent, added to `db:sql`)
- PO, GRN, BILL and LC numbering series for every company (backfill + provisioning trigger).
- HINTs on the existing posting errors the API shows by code (`OVER_RECEIPT`, duplicate vendor invoice → `BILL_DUPLICATE_INVOICE`, GRN not posted → `LANDED_COST_GRN_NOT_POSTED`, allocation mismatch → `LANDED_COST_UNALLOCATED`) where the functions raise without one; new error codes for these plus `PO_NOT_EDITABLE`, `PO_APPROVAL_REQUIRED`, `BILL_APPROVAL_REQUIRED`, `BILL_NOT_EDITABLE`, `BATCH_REQUIRED`.
- No new tables or columns expected.

## 7. Audit (row history)
- **Tables:** all nine already audited; the vouchers, stock movements and batches the posting creates are audited by their own tables.
- **Attribution:** every action in `UnitOfWork.run(actorContext(user, meta))`; DB-generated rows inherit the user.
- **History view:** History tab on each document drawer / editor; tables registered in `history-tables.ts` (`po:view`, `grn:view`, `bill:view`).

## 8. Ordered tasks
1. SQL 025, Prisma models, registrations.
2. Shared contracts.
3. Server: options; purchase orders (+ approval subject); GRNs; vendor bills and the purchase voucher (+ approval subject); landed cost.
4. Pages from templates: Purchase Orders, GRN, Vendor Bills (list + editor), Purchase Voucher, Landed Cost.
5. Nav: Purchases & Payables › Purchase Orders, Goods Receipts, Vendor Bills, Purchase Voucher, Landed Cost.
6. Verification.

## 9. Verification
- **Functional (API suite in Test Co; it creates a warehouse, products incl. a batch-tracked one, a tax code and vendors through the app):**
  - PO: create, edit, submit (engine when a workflow exists; direct approval otherwise), cancel; totals and tax;
  - GRN from the PO: partial receipt, rejection with reason, batch / expiry required for batch items, over-receipt → 409, post (stock balance up, Dr inventory / Cr GRNI), PO received progress / status, cancel reverses;
  - bill from the GRN: three-way match, price variance revalues average cost, input GST / WHT / advance tax lines, duplicate invoice → 409, submit / approve / post, void reverses;
  - purchase voucher: counter purchase with stock in and cash / bank / cheque pay-now (cheque issued), credit purchase;
  - landed cost: import GRN, charges, allocation by value / qty / weight, post revalues average cost, claimable taxes;
  - permissions (accountant, storekeeper for GRN, auditor view-only, salesman 403), history rows with the real user, trial balance and stock valuation consistent.
- **Visual:** each page vs its template at 1400 light / dark and 390 mobile.
- **Regression:** Phases 15–19 suites (the every-5-phases round is due after Phase 19).

## 10. Acceptance criteria, risks, blockers
- **Acceptance:** section 9 passes; deviations listed honestly.
- **Risks:**
  - Stock costing and posting depend on database functions written for the schema but never exercised; bugs found there are fixed in 025.
  - Products' units / carton factors and tax codes must be set up for line maths.
- **Blockers:** none for Test Co. Demo needs a warehouse before it can receive.

---
**Approve Phase 19 revision 1 for implementation?**
