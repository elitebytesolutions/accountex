## Wholesale & Distribution (FULL edition only)

**Schema** `Distribution` · **Screens (8)** app/wholesale/entry, /bulk, /bookings, /backorders, /load-sheet, /settlement, /recovery, /routes · **Sources** `src/4D-wholesale.html`, `src/9H-wholesale.js`, `src/4E-distribution.html`, `src/9I-distribution.js`, `src/91-data.js` · **Plan module key** `DIST` · **Release phase** P4

### What it does
It runs the sales side of an FMCG or trading distributor:
- Shops are grouped on beats (routes), and bookers take orders in the field.
- Orders become wholesale invoices, which load onto vans.
- At day end the salesman settles cash, cheques and returns.
- Recovery rounds chase outstanding balances, and the team is paid commission against monthly targets.

### Features
- **Quick Wholesale Entry**
  - Keyboard-first billing: carton + piece qty, piece/carton rate toggle, and price tiers (Retailer ×1.00, Wholesaler ×0.95, Distributor ×0.90).
  - Live schemes add free lines ("Buy 10 get 1").
  - Input tools: barcode scan mode (piece and carton barcodes), Add many, Paste from Excel, Repeat last order, order templates.
  - Hold/recall of parked bills.
  - Live credit panel (limit, outstanding, this bill, available, overdue days). Going over the limit is blocked unless a manager approves it by PIN: 3 attempts then lock-out, and every attempt is logged.
  - Print (A4, 2 copies) and WhatsApp share.
- **Bulk Invoicing**
  - Bill a whole route in two modes: a shops × products carton matrix, or the same items to selected shops.
  - Cells tint with quantity, and you can fill them from last orders.
  - Credit is checked per shop; over-limit shops are **skipped, never overridden**, and their reason is recorded.
  - The result shows the invoice number range and links straight to the load sheet.
- **Order Bookings**
  - Orders sync from the booker app with GPS verification (within 25 m of the shop pin, otherwise "N km off" and the supervisor is notified).
  - Stock check serves the oldest booking first.
  - Bulk convert to invoices, optionally allowing partial delivery. Shortages create back-orders; without "allow partial" the booking is held.
- **Back-orders**
  - Pending quantities are shown by item or by customer, with age and value at tier rates.
  - A live incoming-stock feed comes from GRNs.
  - Allocate an arrival by one of three policies: FEFO + oldest, Priority tier (Distributor first) or Pro-rata. The preview shows allocated qty and batch per shop.
  - Convert allocated lines to invoices, or cancel lines with a reason (customer no longer needs it, discontinued, other distributor, price disagreement). Cancelling notifies the shop by SMS.
- **Load Sheets**
  - The run builder has route, van, driver, date and departure, and shows on-beat/off-beat for the date. You pick the open invoices to load.
  - The consolidated pick list is sorted by shelf, split into cartons and loose pieces, with weight and value and a picked tick.
  - Van capacity meters show cartons and kg against the van's capacity: warn at 85 %, block dispatch over 100 %.
  - Prints a load sheet (LS) and a gate pass (GP, seal no, QR).
  - Dispatch moves the stock into the van.
- **Route Settlement**
  - A per-invoice grid records delivery state (Full / Partial / Not delivered + reason), returns per line with reason, and cash / cheque (no, bank, date) / credit. The difference chip can book a shortfall as credit.
  - Cash bag count by PKR denomination (5000…10) with short/excess.
  - Van stock reconciliation: loaded, delivered, returned, counted, variance.
  - Journal preview, then post: receipts, sales returns, stock back, one JV, run closed.
- **Recovery Sheet**
  - Built per salesman, route and date. Each shop shows outstanding, 0–30 / 31–60 / 61–90 / 90+ ageing, last payment, amount collected, mode (Cash / Cheque / Online / JazzCash), remarks and promise-to-pay date.
  - Target ring and KPIs.
  - WhatsApp reminder in English or Urdu.
  - Printable sheet.
  - Bulk-post receipts, allocated FIFO to the oldest invoices.
- **Routes & Salesmen**
  - Route cards show visit days, booker, salesman, van, driver, shop count and monthly sales trend.
  - Route map with ordered stops and ETA.
  - Drag-and-drop shop assignment between routes.
  - New route wizard.
  - Booker/salesman cards: target achievement, strike rate, productive calls and commission.
  - Leaderboard.
  - Commission slab table.

### Key business rules
1. A shop is a `Sales.Customers` with exactly one `Distribution.ShopRouteProfiles` profile (route, area, tier, pin, recovery target). All AR is in the single sales ledger.
2. **Price rules.**
   - Tier rate = item wholesale price × `PriceTiers.rateFactor`.
   - A booking freezes its rate at booking time. Manual rate edits are flagged on the line.
3. **Carton maths.**
   - `baseQty = qtyCtn × unitsPerCtn + qtyLoose`.
   - Loose pieces ≥ pack size roll into cartons.
   - Load lists always split base qty into whole cartons + loose (< pack).
4. **Credit.**
   - Used = outstanding + this bill. Over 80 % is a warning; over 100 % blocks the save.
   - Override needs a manager PIN; 3 wrong attempts lock the override (logged as LOCKED).
   - Bulk invoicing never overrides.
5. **Bookings.**
   - The stock check is served in booking-time order.
   - Conversion re-checks stock live.
   - The short qty becomes a back-order (source BK) when partial is allowed; otherwise the booking is HELD.
6. **Back-orders.**
   - `pending = original − invoiced − cancelled`, and `allocated ≤ pending`.
   - The status (WAITING / PART_ALLOCATED / READY / INVOICED / CANCELLED) is enforced by a CHECK against the quantities.
7. **Runs.**
   - An invoice can be on only one live run.
   - Dispatch requires ≥ 1 invoice and capacity ≤ 100 % (cartons and kg).
   - Only one dispatched run per van at a time.
   - After dispatch the load is locked.
8. **Settlement.**
   - Net = max(invoice − returns, 0); difference = net − cash − cheque − credit.
   - Not delivered ⇒ full return and no collection.
   - Return qty ≤ supplied.
   - Van expected = returned qty, and the variance is valued at cost.
   - After SETTLED every detail row is frozen.
9. **Recovery.**
   - Collected ≤ outstanding.
   - The ageing buckets must sum to outstanding.
   - Posting allocates FIFO to the oldest invoices.
   - A posted entry is immutable.
10. **Commission.**
    - The slab is chosen by achievement % (bands [from, to), with no overlapping active slabs).
    - Commission = achieved × rate / 100.
    - Accrued by journal and paid via payroll or cash.

### Statuses
| Document | Statuses |
|---|---|
| Held bill | HELD → RECALLED · DISCARDED |
| Credit override log | PENDING → APPROVED · DENIED · LOCKED |
| Bulk invoice batch | DRAFT → GENERATING → COMPLETED · FAILED |
| Order booking (BK) | NEW → CHECKED → CONVERTED · PARTIAL · HELD · CANCELLED |
| Back-order line | WAITING → PART_ALLOCATED → READY → INVOICED · CANCELLED |
| Back-order allocation | ALLOCATED → INVOICED · RELEASED |
| Delivery run (RUN) | LOADING → SCHEDULED → DISPATCHED → SETTLED · CANCELLED |
| Route settlement (RS) | OPEN → SETTLED |
| Recovery entry | PENDING → PROMISED → READY → POSTED |
| Recovery sheet (RCV) | OPEN → POSTED → CLOSED |
| Sales target | OPEN → CLOSED |
| Salesman commission | DRAFT → APPROVED → ACCRUED → PAID · CANCELLED |

### Document numbers (`Company.NumberingSeries`)
| Doc type | Example | Pattern |
|---|---|---|
| WS (sales) | WS-2026-000231 | `{PREFIX}-{YYYY}-{SEQ6}` |
| BK | BK-2026-4120 | `{PREFIX}-{YYYY}-{SEQ4}` |
| RUN | RUN-2026-0412 | `{PREFIX}-{YYYY}-{SEQ4}` |
| LS | LS-0412 | `{PREFIX}-{SEQ4}` |
| GP | GP-2026-0412 | `{PREFIX}-{YYYY}-{SEQ4}` |
| RS | RS-2026-0412 | `{PREFIX}-{YYYY}-{SEQ4}` |
| RCV | RCV-2026-0001 | `{PREFIX}-{YYYY}-{SEQ4}` |
| RT (route master) | RT-01 | `{PREFIX}-{SEQ2}` |
| SHP (shop customer code) | SHP-001 | `{PREFIX}-{SEQ3}` |

### Integrations
- **Booker mobile app sync:** bookings, GPS.
- **WhatsApp:** invoice share, recovery reminders in EN and UR.
- **SMS:** back-order cancellation notice.
- **Barcode scanners:** piece and carton barcodes.
- **Printing:** A4 invoice, load sheet, gate pass with QR, recovery sheet.

### Permissions
`ws:entry`, `ws:post`, `ws:CreditOverrides`, `ws:template`, `ws:bulk`, `bk:view`, `bk:convert`, `bo:view`, `bo:allocate`, `bo:convert`, `bo:cancel`, `run:view`, `run:build`, `run:dispatch`, `rs:view`, `rs:edit`, `rs:post`, `rcv:view`, `rcv:edit`, `rcv:post`, `route:view`, `route:edit`, `target:edit`, `commission:approve`.

### Personas
- **Booker:** app, bookings.
- **Salesman:** recovery, settlement cash bag.
- **Driver / deliveryman:** run.
- **Store keeper:** pick list, gate pass.
- **Supervisor:** GPS exceptions, load check.
- **Operations head:** credit PIN override.
- **Cashier / accountant:** settlement posting.

### Simulated in the prototype
- GPS pins and offsets.
- The route map geometry.
- Item weight per piece (`WT` table; will come from `Inventory.Products.weightKg`).
- The monthly sales sparklines.
- The booker app sync.

### Out of scope
- Live vehicle tracking and route optimisation (the "Optimise stop order" button only re-sequences stops).
- Van sales without a prior invoice.
- Returnable-crate ledger: only a count is printed on the gate pass.
