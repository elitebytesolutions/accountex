# Phase 23 rev 1 — Sales documents

**Objective:** Quotation → sales order → delivery challan → sales invoice, plus the counter sales voucher.
- Orders are confirmed with a credit check and stock reserved.
- Challans take stock out at dispatch.
- Invoices post receivable, revenue, output tax and cost of sales, and queue the FBR submission.

**Entities (4, TRANSACTIONAL):** Quotations · Sales Orders · Delivery Challans · Sales Invoices (incl. the counter sales voucher).

**Status before this plan:**
- Phases 0–20 done.
- Phases 21–22 belong to the parallel workspace session.
- The user asked for Phase 23 out of order. Its dependencies are done: customers, products, price lists, schemes, tax codes, FBR settings, approvals.

**Decisions taken (2026-10-08, the user said "start phase 23"):**
- **FBR:** posting only *queues* the submission. It creates a `Tax.FbrInvoiceSubmissions` row (PENDING) and sets the invoice's FBR status to PENDING, when an active FBR / PRA setting reports on posting and "Submit to FBR" is ticked. The FBR client, retries, IRN and QR are Phase 28.
- **Print / PDF:** browser print of the document pages. There is no server PDF and no `GET …/pdf` endpoint.
- **Sales voucher:** posts on account (channel COUNTER, SV number). The template's multi-tender *Receive payment* waits for customer receipts in Phase 24.
- **Credit:** confirming an order with the customer on hold or over the effective limit (balance + open orders + this order) returns 409 CREDIT_LIMIT_EXCEEDED / CUSTOMER_ON_HOLD. The exception is an approver with `crovr:approve` who explicitly overrides. The override workflow is Phase 26. Invoice posting keeps the database's own credit control.
- **Approvals:**
  - Sales orders use the engine (subject SALES_ORDER, entity SO, status PENDING_APPROVAL) when a workflow applies; otherwise `quo:approve` confirms directly.
  - Invoices use subject SALES_INVOICE (entity INV). They stay DRAFT while waiting, because the table's posted check forbids other states. With no workflow, `sinv:post` posts directly.
- **SQL file:** `prisma/sql/301-sales-documents.sql`. This session uses the 3xx range; 028 belongs to the parallel session's Phase 22.

## 1. Verified schema
The tables and template functions already existed (all empty). This phase fills these gaps:
- numbering series QT / SO / DC / INV / SV for every company and new ones;
- audit triggers on QuotationLines, SalesOrderLines, StockReservations, FbrInvoiceSubmissions;
- a new order defaulted to CONFIRMED, so it was never editable → the default is now DRAFT;
- no confirm / close / reservation logic existed;
- challan dispatch / deliver didn't set their timestamps and had no stock or GL effect;
- invoice posting issued stock from a single batch → it now uses `Inventory.stockIssue` (FEFO across batches);
- posting never marked challans invoiced or queued FBR;
- there were no sales error codes.

New lookups: QuotationStatus REJECTED, SalesOrderStatus PENDING_APPROVAL / CLOSED, approval subject SALES_INVOICE.

## 2. Template → page mapping
| Entity | Template | Page |
|---|---|---|
| Quotations | `41-acc-trade.html` app/sales/quotations (+ New / Convert modals) | `/sales/quotations` |
| Sales Orders | `41-acc-trade.html` app/sales/orders | `/sales/orders` (create modal + detail drawer in template style: the template has neither) |
| Delivery Challans | `43-sales-docs.html` app/sales/challans + `93-sales-docs.js` | `/sales/challans` |
| Sales Invoices | `41-acc-trade.html` app/sales/invoices, /new, /view; `43-sales-docs.html` app/sales/voucher | `/sales/invoices`, `/sales/invoices/new`, `/sales/invoices/[id]`, `/sales/voucher` |

## 3. Structure
- **DB:** `prisma/sql/301-sales-documents.sql`
  - Quotations: `quotationSend` / `Accept` / `Reject`.
  - Orders: `salesOrderConfirm` / `Refresh` / `Close` / `CancelEntries`.
  - Challans: `triggerChallanOrderOpen`; `deliveryChallanDispatch` + `…DispatchEntries` / `Deliver` / `CancelEntries`.
  - Invoices: `salesInvoicePost` + `…PostEntries` / `Void`.
  - Error codes.
- **Contracts:** `src/shared/sales/documents.ts`.
- **Server:** `src/server/modules/sales` (SalesModule).
  - `SalesStore` port + `PrismaSalesStore`.
  - Services and controllers for quotations, orders, challans, invoices (+ `/sales/vouchers`).
  - `/sales/doc-options` (options, price-list prices, customer credit).
- **UI:** `src/features/sales` (`api.ts`, screens).
- **Registry:** nav "Sales" children; `history-tables.ts`; `add-update.ts`; Prisma models for the 8 document tables + StockReservations + FbrInvoiceSubmissions.

## 4. Posting
- **Challan dispatch:** stock out at cost (`stockIssue`, source DC) → Dr GDNI / Cr Inventory. Order delivered quantities and reservations follow.
- **Invoice post:**
  - Dr receivable / Cr revenue + output tax.
  - Challan lines move GDNI → COGS; other lines issue stock at posting → COGS / Inventory.
  - Order invoiced roll-up; challans → INVOICED.
- **Void:** reverses journal and stock; challans go back to DELIVERED and orders are refreshed.
