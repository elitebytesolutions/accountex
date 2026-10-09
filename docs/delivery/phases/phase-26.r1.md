# Phase 26 rev 1 — Distribution

**Objective:** Run the route delivery cycle on top of wholesale invoices (Phase 25) and receipts (Phase 24):
- load sheets with pick list, gate pass and delivery status;
- route settlement of cash, cheques and returns per invoice;
- recovery sheets for collecting old dues;
- salesman targets and commissions;
- credit control (holds and overrides).

**Entities (5, TRANSACTIONAL):** Load Sheets & Delivery · Route Settlements · Recovery Sheets · Salesman Targets & Commissions · Credit Control

**Ownership:**
- Phase 26 is claimed by this session; accountex-c0 agreed.
- Phase 25 code is reused read-only. The one exception is the bulk-run result link "Build load sheet", which that session handed over.
- Phase 14's `/wholesale/routes` page gains a Targets & commissions panel. The changes there only add things.

**Decisions (2026-10-08):**
- **Stock: paperwork only.**
  - Invoices keep taking stock out of the warehouse at posting.
  - A load sheet is the pick list, gate pass and delivery tracker. There's no van stock, no van transfer and no van count.
  - Goods returned on the route go back through Phase 24 sales returns, restocked into the load sheet's warehouse.
- **Commissions: journal plus payroll line.**
  - Posting books Dr sales commission expense / Cr commission payable (ACCRUED).
  - "Send to payroll" adds a payroll adjustment (earning component COMMISSION, seeded) to the employee's **draft payroll run for that month**. If no draft run exists yet, it says so and stays ACCRUED.
  - Payroll (Phase 32) belongs to another session, so this only adds the adjustment row.
- **Approvals: permission-based.**
  - Credit overrides are approved by `crovr:approve`, and never by the person who requested them; the database already enforces that. Every override is logged with its approver.
  - Settlements are approved by `settle:approve`, recovery sheets by `recov:post`, and commissions by `target:approve`.
- **Testing:** basic smoke API suite plus a quick screenshot per page.

## 1. Verified schema (all tables exist, no rows)
- **LoadSheets / LoadSheetLines / LoadSheetInvoices** (lines and invoices FK `deliveryRunId`).
  - `loadSheetAddUpdate`, `loadSheetDispatch` / `Cancel`.
  - Their stock entries are replaced so dispatch stamps the run only, with no stock movement.
  - `VanStockCounts` stays unused (the van-stock model wasn't chosen).
- **RouteSettlements / Lines / CashCounts / Cheques / Returns.**
  - `routeSettlementAddUpdate`, `routeSettlementPost`.
  - Posting moves to the app: receipts per invoice through the Phase 24 receipts service (cheques into cheques in hand), returns through Phase 24 sales returns, and a database JV for cash short (Dr salesman receivable) / over (Cr cash over-short).
- **RecoverySheets / Lines.**
  - `recoverySheetAddUpdate`, `recoverySheetPost`.
  - Lines are generated from the route's customers with outstanding balance and ageing.
  - Posting creates one Phase 24 receipt per collected line: cash, cheque, online, or JazzCash, allocated oldest first. Promised lines carry a promise-to-pay date.
- **SalesmanTargets / SalesmanCommissions** with the existing commission slabs (Phase 14).
  - Achievement = posted invoices of the period whose booker / salesman is the employee, net of credit notes.
  - The rate comes from the slab for the achievement %.
- **Credit control:** `Sales.CreditOverrides`, `Sales.CreditHoldEvents`, `Distribution.CreditOverrideLogs`.
  - Place / release hold on a customer.
  - Override request (one-time, temporary limit, release hold) → approve / reject.
  - An approved override on an invoice lets it post (`salesInvoicePost` already honours `creditOverrideId`).
- **Numbering:** LS, RS, RCV, CO document types exist; series are added.

## 2. Templates → pages
| Entity | Template | Page |
|---|---|---|
| Load Sheets | `4E-distribution.html` `app/wholesale/load-sheet` (engine `9I-distribution.js`, styles `1I-distribution.css`) | `/wholesale/load-sheet` |
| Route Settlement | `app/wholesale/settlement` (same files) | `/wholesale/settlement` |
| Recovery Sheet | `app/wholesale/recovery` (same files) | `/wholesale/recovery` |
| Targets & Commissions | `app/wholesale/routes` targets & commission panel | added to `/wholesale/routes` (Phase 14 page) |
| Credit Control | `41-acc-trade.html:1101` `app/receivables/credit` | `/receivables/credit` |

## 3. Server — new `src/server/modules/distribution-ops/`
| Entity | Permission | Actions |
|---|---|---|
| Load sheets | loadsht:*, delivery:edit | Invoices for route + date (posted wholesale, not on a live run) → draft with pick lines summed per item; approve; dispatch (gate pass); per-invoice delivery status (delivered / partial / returned; the deliveryman on their own runs); cancel |
| Route settlements | settle:* | From a dispatched run: per-invoice cash / cheque / credit / returns, cash count by denomination; submit → approve → post (receipts, returns, short/over JV); run → SETTLED |
| Recovery sheets | recov:* | Generate for route + date; per line amount / mode / cheque / promise; post (receipts) |
| Targets & commissions | target:* | Targets per employee + period; refresh achievement; calculate commissions for a period; approve; post (JV); send to payroll |
| Credit control | crovr:*, rcpt:view | Customers on hold / over limit / exposure; place / release hold; override requests → approve / reject (log) |

## 4. Database — `prisma/sql/030-distribution.sql`
- Numbering series (LS, RS, RCV, CO).
- Paperwork-only dispatch: the dispatch and cancel entries replaced with no stock movement.
- Settlement cash short/over JV function.
- COMMISSION salary component per company.
- Missing audit triggers on the Phase 26 tables.
- Error codes.

## 5. Verification (basic)
- **Smoke API in Test Co:**
  - load sheet from posted wholesale invoices → dispatch → delivery status;
  - settlement with cash, a cheque, one returned line and a cash short → post → invoices paid / returned, short booked;
  - recovery sheet → post receipt;
  - target + commission → post → send to payroll;
  - hold blocks an invoice → approved override lets it post (the requester can't approve their own);
  - one permission check.
- Typecheck, lint, roadmap, and a quick screenshot per page.

**Risks:**
- The payroll line depends on a draft payroll run (Phase 32, other session).
- Load sheets only see invoices that carry a route (Phase 25 wholesale invoices).

---
**Approve Phase 26 revision 1?**
