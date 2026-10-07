## Sales & Receivables (sales) — Full

**Screens (18).** Basic 11: Customers (`app/customers`), Customer Detail (`app/customers/view`), Quotations (`app/sales/quotations`), Sales Orders (`app/sales/orders`), Sales Invoices (`app/sales/invoices`), New Invoice (`app/sales/invoices/new`), Invoice View (`app/sales/invoices/view`), Sales Voucher (`app/sales/voucher`), Credit Notes (`app/sales/credit-notes`), Receipts & Allocation (`app/receivables/receipts`), AR Ageing & Reports (`app/receivables/ageing`).

**Tables (35).** Basic 16: `Sales.CustomerGroups`, `customer`, `CustomerContacts`, `CustomerNotes`†, `PriceLists`, `PriceListItems`, `quotation`, `QuotationLines`, `SalesOrders`, `SalesOrderLines`, `invoice`, `SalesInvoiceLines`, `CreditNotes`, `CreditNoteLines`, `receipt`, `CustomerReceiptAllocations`.
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

### Full additions
**Screens (+7).** POS / Counter Sale (`app/sales/pos`), Delivery Challans (`app/sales/challans`), Sales Returns (`app/sales/returns`), Recurring Invoices (`app/sales/recurring`), Price Lists & Schemes (`app/sales/price-lists`), Credit Control (`app/receivables/credit`), Payment Reminders (`app/receivables/reminders`).

**Tables (+19).** `CustomerAddresses`, `PriceListQuantityBreaks`, `scheme`, `SalesSchemeItems`, `SalesSchemeEligibilities`, `DeliveryChallans`, `DeliveryChallanLines`, `SalesReturns`, `SalesReturnLines`, `PosShifts`, `PosShiftDenominations`†, `PosPayments`, `CreditOverrides`, `CreditHoldEvents`, `PaymentReminderTemplates`, `PaymentReminderRules`, `PaymentReminderLogs`, `RecurringInvoices`, `RecurringInvoiceLines`.

**Columns added to Basic tables.**
- `customer`: `customerChannel` (STANDARD / WHOLESALE), `PriceTiers` (RETAILER / WHOLESALER / DISTRIBUTOR), `priceTierFactor`.
- `invoice`:
  - `channel` adds WHOLESALE (`WS-`) and POS (`POS-`);
  - `PriceTiers`, `priceTierFactor`, `creditOverrideId`, `routeId`;
  - booker / deliveryman / salesman / supervisor `*EmployeeId`;
  - `posShiftId`, `recurringProfileId`, `deliveryChallanId`, `shipToAddressId`;
  - `schemeId`, `schemeAmount`, `stockIssueMode`, `stockIssuedAt`.
- `SalesInvoiceLines`: `listRate`, `isManualRate`, `schemeId`, `deliveryChallanLineId`.
- `CreditNotes`: `salesReturnId`.
- `receipt`: `posShiftId`.

#### Features
- **Channels on one invoice table.** STANDARD (INV), COUNTER (SV), WHOLESALE (WS: quick wholesale entry, bulk invoicing, delivery runs) and POS (POS). Each channel has its own number series, and load sheets, settlement and recovery all point at `Sales.SalesInvoices`.
- **Wholesale pricing.**
  - A shop is a customer with `customerChannel = 'WHOLESALE'` plus a `Distribution.ShopRouteProfiles` profile (route, GPS).
  - The price tier factor (Retailer 1, Wholesaler 0.95, Distributor 0.90) applies to the list rate; a manual rate override is flagged.
  - Booker, salesman, deliveryman and supervisor are `HumanResources.Employees` FKs (commission follows the salesman). Route is a `Distribution.Routes` FK.
  - Delivery-run invoices can issue stock at van dispatch (`stockIssueMode = 'AT_DISPATCH'`).
- **Price lists & schemes.**
  - Price-list editor with live margin on cost, markup + rounding "apply to all", effective-dated save, CSV export.
  - Trade schemes: free goods (buy X get Y), invoice discount above a value, bundle price, line discount (Rs or %), settlement discount (paid within N days) and service promos. Each has dates, eligible groups / customers / tiers, budget cap, max uses per customer, times applied and value given.
  - Quantity-break slabs per item (optionally per list), with no overlapping ranges.
- **POS.**
  - Shift per counter with opening float, barcode / tile cart, held carts and line discount.
  - Multi-tender (cash with change, card, JazzCash, Easypaisa, credit) and the FBR Rs 1 fee.
  - Receipt print, then shift close with a denomination count, expected vs counted over / short, and a Z-report (Z-YYYY-NNNN).
- **Delivery challans.** Created from a sales order with per-line pending qty, vehicle and driver. The flow Packed → Dispatched → Delivered → Invoiced moves stock at dispatch into goods-delivered-not-invoiced, and the challan converts into an invoice without moving stock again.
- **Sales returns.** Against an invoice, without one, or as a replacement. Each line has a reason (expired, damaged, wrong item, customer request) and a disposition (restock, quarantine, write-off) with sensible defaults. The return qty cannot exceed the qty sold. Posting raises the credit note automatically.
- **Recurring invoices.** Weekly / monthly / quarterly / every N days, with start date, end mode (never, on a date, after N runs) and template lines. Auto-send by e-mail and WhatsApp, or save as draft. Actions: Run now, Pause / Resume, Skip next run. MRR is shown.
- **Credit control.**
  - Exposure watchlist: balance + open orders + unposted drafts against the effective limit (limit + approved temporary increase).
  - Override requests: one-time for a document, temporary limit with valid-until, or release of a hold. Each records snapshots, condition and approver, with segregation of duties (requester ≠ approver). The wholesale PIN override is logged in `Distribution.CreditOverrideLogs`.
  - Append-only hold / release log (auto over-limit, overdue, bounced cheque, dunning, manual).
- **Payment reminders / dunning.**
  - Rules by days from the due date (−3, 0, +7, +15, +30 …), mapped to dunning levels (pre-due → final).
  - Channels: WhatsApp, SMS, e-mail. Bilingual EN / UR templates with placeholders.
  - Actions: message, call task, credit hold, legal notice; escalation to a manager, statement attachment, run time 09:00 and quiet hours.
  - Send now / send to all, and a delivery log (queued → sent → delivered → read / failed).

#### Business rules (Full)
- A POS invoice requires an open shift. There is one open shift per branch + counter, and a shift closes only with a counted cash amount and a Z-report number.
- Non-credit POS tenders always produce a `Sales.CustomerReceipts`, so AR stays a single ledger.
- A challan line cannot exceed the pending SO quantity. A challan is INVOICED only with its invoice set.
- `schemeAmount ≤ discountAmount`. Scheme type fields are enforced (e.g. FREE_GOODS needs buy and free qty). `valueGiven ≤ budgetCap`.
- An override needs a decision maker different from the requester. TEMP_LIMIT needs an amount and a valid-until date.
- Credit hold events are append-only. The current state is `Customers.status` / `holdReason`.
- A reminder rule needs at least one channel. Escalation needs a target user. There is one rule per offset day.

#### Statuses (Full)
- Delivery challan: PACKED → DISPATCHED → DELIVERED → INVOICED · CANCELLED.
- Sales return: DRAFT → POSTED · CANCELLED. Line reason / disposition as above.
- POS shift: OPEN → CLOSED. POS tender: CASH / CARD / CREDIT / JAZZCASH / EASYPAISA.
- Credit override: PENDING → APPROVED → USED · REJECTED · EXPIRED.
- Recurring profile: ACTIVE ⇄ PAUSED → ENDED (+ derived "Ends soon").
- Scheme: Live / Off / Scheduled / Ended (derived from `isActive` and dates).
- Reminder log: QUEUED → SENT → DELIVERED → READ · FAILED.

#### Integrations (Full)
- WhatsApp Business API, Jazz SMS gateway and e-mail delivery receipts.
- Card terminals (HBL POS), JazzCash / Easypaisa wallets.
- FBR POS integration per counter (`Tax.FbrBranchMappings`).
