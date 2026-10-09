# Phase 20 rev 1 — Payables

**Objective:** Settle what is owed to vendors:
- purchase returns that send stock back and reduce the payable (or bring cash back);
- debit notes for price / short-supply / quality claims;
- vendor payments (cash, bank transfer, cheque) allocated to bills, with WHT withheld at payment;
- a payment run that pays many bills in one go;
- AP Ageing and Vendor Statement reports.

**Entities (3, TRANSACTIONAL):** Purchase Returns · Debit Notes · Vendor Payments (with allocations). **Final-batch note:** Phase 20 is a 3-entity phase as laid out in the roadmap. No other payables entity is left for later.

**Status before this plan:**
- Phases 0–19 done.
- Phases 30, 31 and 36–40 are owned by the parallel session.

**Decisions taken (2026-10-08):**
- **Approvals:** vendor payments go through the Phase 16 approval engine when the company defines a *Vendor payment* workflow. With none, a user with `vpay:post` posts directly. No workflow is seeded.
- **Cheques:** cheque payments use the Phase 17 clearing route. At issue: Dr payable / Cr *PDC payable*. When the cheque clears in the cheque register: Dr PDC payable / Cr bank.
  - The Phase 19 purchase voucher's cheque pay-now moves to the same route, so the two stay consistent.
- **Pay selected / Payment run:** the template's Payment Run screen. Pick bills of any vendors and one paying bank / cash account; it creates one payment per vendor, with allocations and WHT. The Vendor Bills list's "Pay selected" opens it with those bills ticked.
- **Reports:** AP Ageing and Vendor Statement, on the template's Payables studio page. Its other tabs (Purchase Register, WHT Deducted, Purchases by Vendor) are shown disabled until the reports phase.

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Purchase Returns | Transactional | GRN / Vendor bills (P19 ✓), Warehouses, Cash accounts | Stock out + payable reduction; creates the settling debit note |
| Debit Notes | Transactional | Vendor bills (P19 ✓), Purchase returns (this phase) | Claims on vendors; applied to bills |
| Vendor Payments | Transactional | Vendor bills (P19 ✓), Bank / cash accounts, Cheques (P17 ✓), Approvals (P16 ✓) | Settles bills; feeds ageing and statements |

## 2. Verified schema
All six tables exist in `Purchases`. Every one has stamp / touch / **audit** triggers, lock triggers and lookup validation; none has rows yet.

- **PurchaseReturns / Lines**
  - Header: vendor, branch, warehouse, reference bill, supplier bill no., settlement CREDIT / CASH_REFUND (+ cash account), reason (EXPIRED / DAMAGED / WRONG_ITEM / QUALITY), gate pass, transporter, debit-note narration, totals.
  - Status: DRAFT / POSTED / REFERENCED / CANCELLED.
  - Lines: bill line, item, batch / batch no. / expiry, purchased qty, return qty, bonus, rate, disc %, tax.
  - **Posting exists** (`purchaseReturnPost` → `…Entries`): stock out (`Inventory.stockIssue`, batch-aware); Dr payable (or cash for a cash refund) / Cr inventory and Cr input tax. A CREDIT return against a bill **creates a debit note** and applies it to the bill. `purchaseReturnCancel` reverses.
- **DebitNotes / Lines**
  - Header: vendor, bill (required), reason (PURCHASE_RETURN / PRICE_VARIANCE / SHORT_SUPPLY / QUALITY_REJECTION), warehouse, settlement ADJUST_AGAINST_BILL / REQUEST_REFUND, net / tax / WHT / credit, applied / refunded / balance (generated).
  - Status: DRAFT / OPEN / APPLIED / REFUNDED / VOID.
  - Lines: bill line, item or description, billed / return qty, rate, tax.
  - **Posting exists** (`debitNotePost` → `…Entries`): reverses the bill-line account (or inventory, with stock out for return / quality reasons) and input tax; Dr payable and WHT adjustment. ADJUST_AGAINST_BILL allocates to the bill. `debitNoteVoid` reverses.
- **VendorPayments / VendorPaymentAllocations**
  - Header: vendor, branch, method (IBFT / CHEQUE / PAY_ORDER / CASH / ONLINE), bank or cash account, cheque no. / cheque book / crossed, currency / FX, amount, WHT treatment (ALREADY_WITHHELD / WITHHOLD_NOW) + section / rate / amount, bank charges, allocated / unallocated (generated), payment-run ref.
  - Status: DRAFT / PENDING_APPROVAL / POSTED / PRESENTED / CLEARED / VOID.
  - Allocations: payment *or* debit note → bill, amount, WHT amount, reversed flag. Trigger checks: same vendor, posted bill, no reinstating, and posted allocations are only reversed. Roll-ups keep bill balance / status (PARTIALLY_PAID / PAID), payment allocated amount and debit-note settlement in step.
  - **Posting exists** (`vendorPaymentPost` → `…Entries`): Dr payable (amount + WHT) / Cr bank or cash, Cr WHT 153, bank charges; a cheque is issued via `chequeIssue`. `vendorPaymentVoid` reverses.
- **Posting roles** (mapped in Test Co and Demo): AP_CONTROL, WHT_PAYABLE_153, BANK_CHARGES, PDC_PAYABLE, INPUT_GST, ROUNDING.
- **Numbering:** document types PR, DN, PAY exist; **no company has their series**.
- **Missing audit triggers:** none.

**Unresolved questions:** none (decisions above).

## 3. Template → page mapping
| Entity / report | Template | Page / component | Pattern |
|---|---|---|---|
| Purchase Returns | `44-purchase-docs.html:325` (`app/purchases/returns`) + `94-purchase-docs.js` | `/purchases/returns` `PurchaseReturnsScreen` | list with KPIs; return editor: vendor, bill (load its lines with returnable qty), warehouse, reason, settlement (credit / cash refund), batch per line, gate pass; Post / Cancel; detail drawer with debit note + journal links, History |
| Debit Notes | `41-acc-trade.html:1435` (`app/purchases/debit-notes`), new-DN modal `#trd-new-dn` | `/purchases/debit-notes` `DebitNotesScreen` | list by status (open / applied / refunded); new DN against a bill (lines from the bill, reason, settlement); Post / Void; "Record refund" for REQUEST_REFUND notes; apply an open balance to another bill of the vendor |
| Vendor Payments | `41-acc-trade.html:1676` (`app/payables/payments`) + allocate modal `#po-pay-alloc` | `/payables/payments` `PaymentRunScreen` + payment drawer | Payment Run: bills to pay (filters due / vendor), select → paying account, method, cheque nos., WHT, preview per vendor → create payments; payment list / drawer with allocations, approve / post / void, cheque link; "Allocate on-account" modal for unallocated payments and open debit notes |
| AP Ageing + Vendor Statement | `45-studios.html:107` (`app/payables/ageing`) + `96-studio.js:723` (payables studio) | `/payables/ageing` using the existing report-studio component (`src/features/ledger/components/report-studio.tsx`) | AP Ageing (as-on date, by due / bill date, buckets current / 1–30 / 31–60 / 61–90 / 90+, by vendor, branch filter); Vendor Statement (period, opening balance, bills / payments / debit notes / returns, running balance) |

- **Phase 19 screens updated:** the Vendor Bills list "Pay selected" and the bill's Pay / Debit note buttons are enabled and link here.
- **Missing templates:** none.
- **Shown disabled:** studio tabs Purchase Register, WHT Deducted, Purchases by Vendor (reports phase); "Bank upload file" (bank file formats come with integrations).

## 4. Clean Architecture
| Layer | Module / file | Responsibility |
|---|---|---|
| Contracts | `src/shared/purchases/payables.ts` | Zod schemas, line maths (reuse Phase 19), WHT at payment, allocation helpers (oldest-first), ageing buckets |
| Application | `src/server/modules/purchasing/{returns,debit-notes,payments,reports}` | use cases; approval subject PAY (workflow subject VENDOR_PAYMENT); payment run = one payment per vendor in one transaction |
| Infrastructure | Prisma stores + the existing DB functions | |
| Server adapter | `/api/purchases/returns`, `/api/purchases/debit-notes`, `/api/payables/...` with `@RequirePermission` (grn, bill, vpay) | |
| UI | `src/features/purchasing/...` + pages | |

## 5. API / action contracts
| Method & path | Permission | Notes / errors |
|---|---|---|
| `GET /purchases/returns?…` · `GET /:id` · `POST` · `PATCH /:id` · `DELETE /:id` (draft) · `POST /:id/post` · `POST /:id/cancel {reason}` | grn:view / create / edit / post | 409 `RETURN_QTY_EXCEEDS` (more than received / billed less already returned); batch required for expiry-tracked items; cash refund needs a cash account |
| `GET /purchases/debit-notes?…` · `GET /:id` · `POST` · `PATCH /:id` · `DELETE /:id` · `POST /:id/post` · `POST /:id/void` · `POST /:id/refund {date, account, amount}` · `POST /:id/apply {billId, amount}` | bill:view / create / edit / post | 409 `DEBIT_NOTE_EXCEEDS_BILL`; apply ≤ note balance and ≤ bill balance |
| `GET /payables/open-items?vendor=` | vpay:view | open bills (balance, due, days overdue, default WHT), unallocated payments, open debit notes |
| `GET /payables/payments?…` · `GET /:id` · `POST` (single payment with allocations) · `PATCH /:id` · `DELETE /:id` (draft) | vpay:view / create / edit | 400 `ALLOCATION_EXCEEDS_BALANCE`; amount = allocations − WHT (+ on-account remainder) |
| `POST /payables/payment-run` {account, method, date, bills[] (amount, WHT)} | vpay:create | one payment per vendor; cheque nos. per vendor for CHEQUE |
| `POST /payables/payments/:id/submit` · `/approve` · `/reject` · `/post` · `/void {reason}` | vpay:create / approve / post | engine when a workflow applies (409 `PAYMENT_APPROVAL_REQUIRED` on a direct post), otherwise direct; void blocked once the cheque has cleared (409 `PAYMENT_CHEQUE_CLEARED`) |
| `PUT /payables/payments/:id/allocations` (on-account → bills) · `POST /payables/allocations/:id/reverse` | vpay:edit | |
| `GET /payables/ageing?asOf&basis&branch&vendor` · `GET /payables/statement?vendor&from&to` | vpay:view | |
| `GET /history/Purchases/<table>/:id` | view permission | |

- **Delete vs deactivate:** drafts can be deleted. Posted returns are cancelled, and posted debit notes / payments are voided (reversal).
- **Concurrency:** rowVersion on every write.
- **Pagination:** server-side.

## 6. Database changes — `prisma/sql/026-payables.sql` (idempotent, added to `db:sql`)
- PR, DN and PAY numbering series for every company (backfill + provisioning trigger).
- **Cheque clearing:**
  - `vendorPaymentPostEntries` and the Phase 19 `vendorBillPostEntries` pay-now credit **PDC_PAYABLE** for cheques (bank for other methods). The issued cheque is linked to that journal, so the Phase 17 cheque register clears it (Dr PDC / Cr bank).
  - Void is blocked once the cheque has cleared.
- **Debit note refund received** (`debitNoteRefundEntries`): Dr bank / cash / Cr payable, raising `refundedAmount`.
- Approval statuses: post from PENDING_APPROVAL only after approval.
- HINTs + error codes: `RETURN_QTY_EXCEEDS`, `DEBIT_NOTE_EXCEEDS_BILL`, `ALLOCATION_EXCEEDS_BALANCE`, `PAYMENT_APPROVAL_REQUIRED`, `PAYMENT_CHEQUE_CLEARED`, `PAYMENT_NOT_EDITABLE`, `RETURN_NOT_EDITABLE`, `DEBIT_NOTE_NOT_EDITABLE`.
- Fixes for bugs found while testing the never-run posting functions (as in Phase 19).
- No new tables or columns expected.

## 7. Audit (row history)
- **Tables:** all six already audited. The vouchers, stock movements, cheques and bank transactions created by posting are audited by their own tables.
- **Attribution:** every action runs in `UnitOfWork.run(actorContext(user, meta))`; rows the database creates inherit the user.
- **History view:** a History tab on each document drawer. Tables are registered in `history-tables.ts` (`grn:view`, `bill:view`, `vpay:view`).

## 8. Ordered tasks
1. SQL 026, Prisma models, registrations.
2. Shared contracts.
3. Server: open items; purchase returns; debit notes (refund, apply); vendor payments (+ approval subject, allocations, payment run); ageing + statement.
4. Pages from templates: Purchase Returns, Debit Notes, Payment Run / payments, Payables studio (ageing, statement). Enable "Pay selected" and the bill's Pay / Debit note actions.
5. Nav: Purchases › Purchase Returns, Debit Notes; Payables › Payments & Allocation, AP Ageing & Reports.
6. Verification.

## 9. Verification
- **Functional** (API suite in Test Co, reusing the Phase 19 masters):
  - **Returns:**
    - against a posted bill: stock out, Dr payable / Cr inventory + input tax, the auto debit note applied to the bill, bill balance down;
    - over-return → 409;
    - cash refund → cash up;
    - cancel reverses.
  - **Debit notes:**
    - price-variance note on a bill: applied, bill balance down;
    - refund-requested note → record refund;
    - apply an open balance to another bill;
    - void reverses.
  - **Payments:**
    - IBFT payment with WHT withheld now, allocated to two bills: bill PAID / PARTIALLY_PAID, Dr payable / Cr bank + Cr WHT;
    - cheque payment: Cr PDC payable, cheque ISSUED, cleared in the cheque register → Dr PDC / Cr bank, then void blocked;
    - on-account remainder allocated later;
    - over-allocation → 400;
    - workflow (≥ threshold) via the engine; direct post blocked when routed;
    - payment run for bills of two vendors → two payments.
  - Purchase voucher cheque pay-now now goes through PDC payable (Phase 19 suite re-run).
  - Ageing buckets and statement running balance agree with bill balances.
  - Permissions: accountant (all), storekeeper (returns only), auditor (view only), salesman (403). History rows show the real user.
- **Visual:** each page vs its template at 1400 light / dark and 390 mobile.
- **Regression:** Phase 19 suite (shared posting functions change); earlier suites in the next 5-phase round (after Phase 24).

## 10. Acceptance criteria, risks, blockers
- **Acceptance:** section 9 passes; deviations listed honestly.
- **Risks:**
  - The posting functions were written for the schema but never run; bugs found there are fixed in 026.
  - The PDC change alters Phase 19's cheque pay-now posting. Existing Test Co cheque vouchers stay as posted.
- **Blockers:** none.

---
**Approve Phase 20 revision 1 for implementation?**
