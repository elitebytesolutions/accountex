## Sales & Receivables (sales) — Basic

**Screens (11).** Customers (`app/customers`), Customer Detail (`app/customers/view`), Quotations (`app/sales/quotations`), Sales Orders (`app/sales/orders`), Sales Invoices (`app/sales/invoices`), New Invoice (`app/sales/invoices/new`), Invoice View (`app/sales/invoices/view`), Sales Voucher (`app/sales/voucher`), Credit Notes (`app/sales/credit-notes`), Receipts & Allocation (`app/receivables/receipts`), AR Ageing & Reports (`app/receivables/ageing`).

**Tables (16).** `Sales.CustomerGroups`, `customer`, `CustomerContacts`, `CustomerNotes`†, `PriceLists`, `PriceListItems`, `quotation`, `QuotationLines`, `SalesOrders`, `SalesOrderLines`, `invoice`, `SalesInvoiceLines`, `CreditNotes`, `CreditNoteLines`, `receipt`, `CustomerReceiptAllocations`.
† helper table that is not in the contract registry.

### Features
- **Customer master.** Each customer records:
  - legal and display name, type (Company, Individual, Government, AOP), group, sales rep and branch;
  - FBR identity: NTN, CNIC, STRN, ATL status, sales-tax registered, further tax 4 %, WHT u/s 153 deducted (section and rate), GST exempt / zero-rated;
  - contact, billing and shipping address, area, city and province;
  - credit limit, payment terms and credit days, receivable account, price list, opening balance (as of), block-over-limit and auto-reminder flags;
  - a guarantor block (name, father, CNIC, phone, address) from Bhatti for credit customers.

  The detail page shows KPIs (balance, overdue, limit used, average days to pay), the invoice and receipt history, a running statement with print / PDF / e-mail, contacts and notes.
- **Pricing.** Price lists (code, markup on cost, rounding, default), assigned to customer groups and customers. Each item price is effective-dated.
- **Quotations.** Valid-till date, sales rep, branch and price list; send, remind, revise (new revision) and convert to a sales order with locked prices.
- **Sales orders.** Expected delivery, ship-from warehouse, customer PO ref, reserve-stock flag, line-level delivered and invoiced quantities, and credit hold. KPIs show open orders, value to deliver, value to invoice, late orders and on-time %.
- **Sales invoices (STANDARD).** The New Invoice form shows:
  - the credit check, bill-to / ship-to snapshot and payment terms with due date;
  - lines with item, description, HS code, qty, rate, disc % and tax code;
  - totals: GST, further tax 4 % for unregistered buyers, advance tax 236G / 236H, the FBR POS fee and a WHT u/s 153 estimate;
  - notes and terms, attachments, and a posting preview.

  Posting submits to FBR (IRN + QR), e-mails the PDF, can send a WhatsApp payment link and schedules an auto-reminder.
- **Sales Voucher (COUNTER).** Fast trade / counter entry. It is the same invoice table with `channel = 'COUNTER'` and doc type SV, and it carries:
  - SV no., tax invoice no., bill-book no., customer PO no. and date;
  - area and city, booker / deliveryman / salesman / supervisor, sale type, delivery slot;
  - a batch-wise grid with bonus;
  - Hold / Recall, Estimate, Print;
  - a split-tender Receive Payment modal (Cash, Card, Credit, JazzCash, Easypaisa) with cash tendered and change.
- **Credit notes.** Raised against an invoice. Reason: damaged, sales return, rate difference, short supply or other (with a note). Return warehouse, return qty capped at the invoiced qty, and treatment: apply to invoice, keep as customer credit, or refund. The flow is draft → approval → posting.
- **Receipts & allocation.** Methods IBFT, Cheque, Cash, RAAST, Card, JazzCash and Easypaisa, with deposit-to bank or cash account and reference. Each receipt records:
  - WHT deducted at source (section, certificate status / no.) and bank charges;
  - allocation to invoices, open credit notes or the opening balance, by hand or FIFO;
  - the unallocated remainder as a customer advance (optionally linked to a sales order).
- **AR reports.** Ageing (current, 1–30, 31–60, 61–90, 90+; by due or invoice date), sales register, customer statement, sales by customer and by item, and GST output (Annex-C).

### Business rules
- **Tenancy and integrity.**
  - Every FK is tenant-composite.
  - Allocations, credit notes, override and reminder rows can only point to an invoice of the **same customer** (FK on `(tenantId, id, customerId)`).
  - Document numbers come from `Company.getNextDocNo`: QT, SO, INV, SV, CN, RCPT, and CUST for customers.
- **Arithmetic is enforced by CHECKs.**
  - Line: `baseQty = qtyCtn × ctnFactor + qtyLoose`; taxable = gross − discount; total = taxable + tax (+ further tax).
  - Invoice net = taxable + GST + further tax + advance tax + FBR fee.
  - Credit note total = value + GST + further tax.
  - Balances and the receipt's unallocated amount are generated columns, and none can go negative (no over-payment, over-application or over-allocation).
- **Settlement is automatic.**
  - Triggers recompute `paidAmount` and `creditAppliedAmount` and move the invoice POSTED → PARTIALLY_PAID → PAID.
  - They recompute credit-note `appliedAmount` (OPEN ↔ APPLIED) and receipt `allocatedAmount` (UNALLOCATED / PARTLY_ALLOCATED / ALLOCATED).
  - A bounced or voided receipt automatically re-opens what it settled.
- **Posted documents are immutable.**
  - Once an invoice leaves DRAFT, its customer, dates, terms, warehouse and amounts are frozen. A credit note is frozen once approved, and a receipt always is.
  - Lines are locked with their header. Posting may still set a line's cost and batch.
  - Corrections go through a credit note, VOID with a reversal journal, or a new receipt. Nothing is deleted.
- **Credit control (Basic).** Exposure = balance + new document. With `blockOverLimit`, posting above the limit is refused (Full adds approved overrides).
- **Tax.**
  - An unregistered buyer (no STRN) gets further tax 4 %. GST-exempt customers get exempt / zero-rated codes.
  - The WHT u/s 153 estimate is informational. Actual WHT is booked from the receipt.
  - Credit notes reverse output GST in the Sales Tax Return.
- **Derived, not stored:** customer balance / overdue / utilisation and the Near-limit / Overdue badges; invoice OVERDUE; sales-order LATE and fulfilment %.

### Statuses
- Customer: ACTIVE · ON_HOLD (OVER_LIMIT / OVERDUE / BOUNCED_CHEQUE / MANUAL) · DISPUTED · INACTIVE (+ derived NEAR_LIMIT, OVERDUE).
- Quotation: DRAFT → SENT → ACCEPTED → CONVERTED · EXPIRED · CANCELLED.
- Sales order: DRAFT → CONFIRMED → PARTIALLY_DELIVERED → TO_INVOICE → INVOICED · ON_HOLD · CANCELLED (+ derived LATE).
- Invoice: DRAFT → POSTED ("Sent" when `sentAt`) → PARTIALLY_PAID → PAID · VOID (+ derived OVERDUE). FBR: NOT_REQUIRED / PENDING / POSTED / FAILED.
- Credit note: DRAFT → PENDING_APPROVAL → OPEN / APPLIED · CANCELLED.
- Receipt: UNALLOCATED → PARTLY_ALLOCATED → ALLOCATED · BOUNCED · VOID. WHT certificate: NOT_APPLICABLE / NOT_YET_RECEIVED / RECEIVED.

### Integrations
- FBR POS / Digital Invoicing: IRN, QR, Rs 1 service fee.
- E-mail (invoice PDF, statements, receipts) and WhatsApp payment links (Raast QR).
- Bank / cheque handling through treasury.
