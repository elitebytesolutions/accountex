# Phase 24 rev 1 — Sales completion

**Objective:** Finish the sales cycle on top of Phase 23's invoices:
- sales returns (stock back in);
- credit notes;
- customer receipts allocated to invoices (cash, bank, cheque);
- recurring invoices on a schedule;
- the POS: shifts, sales and payments.

It also adds the AR Ageing and Customer Statement reports.

**Entities (5, TRANSACTIONAL):** Sales Returns · Credit Notes · Customer Receipts (+ allocations, cheque allocations) · Recurring Invoices · POS Shifts & Payments

**Status / ownership:**
- Phase 23 (Sales documents) is owned by session accountex-c0. It's implemented (smoke tests 36/36) and awaiting your acceptance.
- This phase builds on its invoices read-only: `salesInvoicePost`, `salesInvoiceVoid`, `salesOrderRefresh`, `SalesInvoice` contracts. It doesn't edit Phase 23 files, except wiring the invoice page's disabled "Record payment" / "Credit note" buttons, coordinated with accountex-c0.

**Decisions (2026-10-08):**
- **Customer cheques:** they go to *cheques in hand* (Phase 17 route) and move to the bank when cleared in the cheque register. A bounce reverses the receipt's settlement.
- **Recurring invoices:** an hourly scheduled job (like the Phase 16 recurring vouchers; actor = system) creates invoices when due. Each template says whether they post or stay draft. "Run now", pause and resume are on the page.
- **POS:** full scope:
  - open / close shift with a cash count;
  - a sale is an invoice plus payment in one step (cash / card / wallet / split);
  - hold / resume a sale;
  - shift report.
- **Receipts:** no approval engine. `rcpt:post` posts. You can say so if you want approval.
- **Testing:** basic smoke API suite and a quick screenshot per page.

## 1. Verified schema (all tables exist, audited, no rows)
- **SalesReturns / Lines:**
  - Header: against an invoice, warehouse, reason, settlement.
  - Lines: invoice line, item, batch, qty, rate, tax.
  - DB functions: `salesReturnAddUpdate / Post / Cancel` (+ entries).
- **CreditNotes / Lines:**
  - Against an invoice or a return.
  - DB functions: `creditNoteAddUpdate / Post / Cancel` (+ entries).
- **CustomerReceipts / CustomerReceiptAllocations / BankCash.ChequeAllocations:**
  - Receipt: method, bank / cash account, cheque, WHT deducted by the customer, amount.
  - Allocations go to invoices; cheque allocations go to invoices.
  - DB functions: `customerReceiptAddUpdate / Post / Void` (+ entries).
- **RecurringInvoices / Lines:**
  - Schedule (frequency, next run, end), customer, lines, auto-post flag.
  - Only `recurringInvoiceAddUpdate` exists; the app creates the invoices through Phase 23's invoice save and post.
- **PosShifts / PosShiftDenominations / PosPayments:**
  - DB functions: `posShiftAddUpdate`, `posShiftClose`.
  - The sale (invoice + payments) is built in the app.
- **Numbering:** document types SR, CN, RCV, POS exist; series are added.

## 2. Templates → pages
| Entity / report | Template | Page |
|---|---|---|
| Sales Returns | `43-sales-docs.html:156` (`app/sales/returns`) | `/sales/returns` |
| Credit Notes | `41-acc-trade.html:662` (`app/sales/credit-notes`) | `/sales/credit-notes` |
| Customer Receipts | `41-acc-trade.html:985` (`app/receivables/receipts`) | `/receivables/receipts` |
| Recurring Invoices | `4A-company-plus.html:52` (`app/sales/recurring`) | `/sales/recurring` |
| POS | `43-sales-docs.html:288` (`app/sales/pos`) | `/sales/pos` |
| AR Ageing + Customer Statement | `45-studios.html:106` (`app/receivables/ageing`), receivables studio | `/receivables/ageing` |

## 3. Server — new `src/server/modules/receivables-ops/` (`/api/sales/...`, `/api/receivables/...`)
| Entity | Permission | Actions |
|---|---|---|
| Sales returns | sinv:* | CRUD, returnable lines of an invoice, post (stock back in), cancel |
| Credit notes | sinv:* | CRUD, post (applied to the invoice), void |
| Customer receipts | rcpt:* | CRUD, `open-items?customer=`, post, void, allocate on-account, reverse allocation. Cheques: in hand → cleared in the register |
| Recurring invoices | sinv:* | CRUD, run-now / pause / resume, plus the hourly job |
| POS | pos:* | shifts open / close (denominations), sale (invoice + payments in one transaction), hold / resume, shift report |
| AR Ageing, Customer Statement | rcpt:view | report studio tabs |

## 4. Database — `prisma/sql/029-sales-completion.sql`
- Numbering series.
- Cheque-in-hand route for receipts.
- Error codes (return over invoiced quantity, allocation over balance, shift already open, and so on).
- Fixes for bugs found in the never-run functions.

## 5. Verification (basic)
- **Smoke API suite in Test Co, one happy path per entity:**
  - a return against a posted invoice brings stock back;
  - a credit note reduces the invoice balance;
  - a receipt (bank) is allocated to two invoices, and a cheque receipt is cleared in the register;
  - a recurring template runs and creates an invoice;
  - a POS shift is opened, a cash sale and a split sale are made, and the shift is closed with a count;
  - ageing and statement totals.
  - Plus one permission check.
- Typecheck, lint, roadmap check, and a quick screenshot per page.

---
**Approve Phase 24 revision 1?**
