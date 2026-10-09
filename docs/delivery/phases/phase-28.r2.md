# Phase 28 rev 2 — Tax compliance

**Changes from rev 1:** FBR sending is **off by default** (no FBR connection for months): submissions stay Pending, nothing fake is written to invoices, the simulator is used only for tests in Test Co, and going live offers "send backlog" or "mark not reported". Posting is never blocked unless the user opts in (block-if-unreachable setting, off by default) or files a return.

**Objective:** Turn posted documents into tax compliance:
- **Sales tax returns:** monthly return prepared from posted sales and purchases (Annex-C / Annex-A), validated, filed (locks the period) and paid with a CPR.
- **WHT deductions & challans:** one register of income tax deducted, collected and suffered, filled automatically when documents post; challans pay a period's deductions to FBR.
- **WHT certificates & statements:** deduction certificates issued to vendors/employees, certificates received from customers claimed; quarterly / annual statements prepared and filed.
- **FBR submissions:** the queue that Phase 23 fills is sent to FBR / PRA, retried, and the FBR invoice no. + QR stored on the invoice; test connection and sync now go live.

**Entities (4, TRANSACTIONAL):** Sales Tax Returns · WHT Deductions & Challans · WHT Certificates & Statements · FBR Submissions.

**Status before this plan:**
- Dependencies all done: sales invoices (P23), vendor bills (P19), vendor payments (P20), receipts / credit notes (P24), FBR settings (P5).
- In progress elsewhere: 26 (peer, SQL 030), 27 (SQL 303), 32 (payroll, SQL 203), 41–43 (admin). Phase 28 touches none of their tables; it adds triggers on posted Phase 19/20/23/24 documents only.
- SQL range 3xx (this session): `304-tax-compliance.sql`.

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| FBR Submissions | Transactional | sales invoices ✓, FBR settings ✓ | Phase 23 already queues PENDING rows that nobody sends |
| WHT Deductions & Challans | Transactional | vendor payments ✓, receipts ✓, invoices ✓ | GL already carries WHT payable/receivable; the register is empty |
| WHT Certificates & Statements | Transactional | WHT deductions (this phase) | Built on paid deductions |
| Sales Tax Returns | Transactional | sales invoices ✓, vendor bills ✓, credit/debit notes ✓ | All GST sources are posted documents now |

## 2. Verified schema (live DB; all 8 tables empty)
- **Tables exist** with stamp / touch / lookup-validation triggers and RLS. Audit triggers present on 7 of 8; **missing on `Tax.FbrConnectionEvents`** (append-only) → add.
- **Lookups (system):** return status DRAFT/VALIDATED/FILED/PAID/REVISED; annex A/C/H; match MATCHED/UNMATCHED; deduction direction DEDUCTED/COLLECTED/SUFFERED, status UNPAID/PAID/CLAIMED/CANCELLED; challan DRAFT/PAID/CANCELLED; certificate direction ISSUED/RECEIVED, status DRAFT/ISSUED/RECEIVED/CLAIMED/CANCELLED; statement type QUARTERLY_165/ANNUAL_149/ANNUAL_165, status IN_PREPARATION/FILED/REVISED; FBR submission PENDING/ACCEPTED/FAILED; connection event HEALTH_CHECK/TEST/TIMEOUT/RECOVERED/TOKEN_RENEWED/ERROR/SYNC.
- **Key constraints:** one return per (authority, month, revision); `netPayable`, `totalOutputTax`, `admissibleInputTax` are generated; PAID needs CPR + paidOn + amount; Annex-A lines are vendor-side, Annex-C customer-side; deduction PAID ⇔ `whtPaymentId`; challan PAID needs a journal; CPR unique; one FBR submission per invoice / credit note; ACCEPTED ⇔ `fbrInvoiceNo`.
- **Existing template functions:** `salesTaxReturnAddUpdate|File|Pay`, `whtChallanAddUpdate|Pay|Cancel(+Entries)`, `whtCertificateAddUpdate|Cancel(+Entries)`, `whtStatementAddUpdate|File`, `get*Info`.
  Gaps: no prepare functions; no `salesTaxReturnPayEntries` / `whtChallanPayEntries` (no GL on pay); `salesTaxReturnFile` doesn't stamp filedOn / user; no deduction writers except sales-invoice advance tax (COLLECTED, Phase 23).
- **WHT sources not registered today:** vendor payments with WITHHOLD_NOW and purchase vouchers post `WHT_PAYABLE_153` but write no deduction; customer receipts post `WHT_RECEIVABLE` (receipt void already expects SUFFERED rows).
- **Posting roles exist:** OUTPUT_GST, INPUT_GST, FURTHER_TAX_PAYABLE, WHT_PAYABLE_153, WHT_PAYABLE, WHT_RECEIVABLE, ADVANCE_TAX_COLLECTED, SALARY_TAX_PAYABLE, SALES_TAX_SETTLEMENT.
- **Numbering:** doc types STR, WHT exist; no tenant has a series → seed STR, WHT (challans) and new `WHTC` (deduction certificate) for all tenants + new tenants.
- **Permissions:** `tax:view|create|edit|approve|post|export` exist and are granted to finance roles.
- No xlsx / zip / PDF library in the project.

**Decisions proposed (recommended defaults):**
1. **Return flow:** *Prepare* (period, authority) creates or refreshes the DRAFT:
   - Annex-C from posted sales invoices (+ credit notes negative) with GST in the month; further tax from invoices.
   - Annex-A from posted vendor bills (+ debit notes negative) with input GST; all MATCHED by default, the user can flag lines UNMATCHED (no FBR feed for supplier matching). Unmatched input is inadmissible when *Exclude unmatched* is on.
   - Carry-forward = previous filed return's excess input; the 90% cap (`inputCapPct`) moves the excess into inadmissible.
   - *Validate* → VALIDATED (checks shown in the Validation panel); *File* → FILED with filedOn + user; *Pay* → PAID with CPR, bank, date and a posted BPV: Dr OUTPUT_GST, Dr FURTHER_TAX_PAYABLE, Cr INPUT_GST, Cr bank.
   - Revisions (REVISED) are not built; the template has no revise flow.
2. **Period lock:** while a FILED/PAID return exists for a month, posting or voiding sales invoices, credit notes, vendor bills and debit notes dated in that month fails with `TAX_PERIOD_FILED`.
3. **IRIS export:** CSV per annex (the template's "IRIS CSV" format), not `.xlsx` → `GET …/:id/annex-c.csv` and `annex-a.csv`. Avoids a new dependency.
4. **WHT register:** DB triggers write deductions on posting and cancel them on void/reversal:
   - DEDUCTED: vendor payments (WITHHOLD_NOW) and purchase vouchers with WHT, source VPAY / BILL.
   - SUFFERED: customer receipts with WHT, source RCPT.
   - COLLECTED: sales-invoice advance tax (exists).
   - Payroll u/s 149: `Tax.whtRegister(jsonb)` helper for Phase 32 to call; not wired here.
   - Backfill for documents already posted. Manual deductions (e.g. 155 rent) can be added; edit/delete only while UNPAID and not system-generated.
5. **Challans:** DRAFT holds period + sections; amount must equal the UNPAID total for them. *Post* links those deductions (PAID) and posts a BPV: Dr the section's payable role, Cr bank. *Cancel* reverses (existing function).
6. **Certificates:** *Generate* (period range) makes one DRAFT ISSUED certificate per party + section from PAID deductions; *Issue* numbers it (WHTC) and dates it. RECEIVED certificates are recorded against a customer's SUFFERED deductions; *Claim* marks them CLAIMED. PDF = browser print view (as Phase 23 invoices).
7. **Statements:** *Prepare* (type, period) totals the deductions; *File* stores filed date, user and IRIS reference.
8. **FBR client (built, sending off by default):** a `FbrGateway` port with three adapters chosen per tenant:
   - **Off (default):** nothing is sent. Posted invoices / credit notes stay *Pending* in the sync log; *Test connection* and *Sync now* answer "FBR is not connected" (`FBR_NOT_CONNECTED`, logged as a connection event). Invoice numbers / QR are never invented.
   - **HTTP:** PRAL Digital Invoicing (sandbox / production URLs from env), used only when the tenant's FBR settings have POS ID + token and the new **Sending enabled** switch is on.
   - **Simulated:** test only, enabled for tenant codes listed in env `FBR_SIMULATE_TENANTS` (Test Co). Never the default.
   - A job every minute sends due PENDING / FAILED rows for tenants with sending enabled, respecting `syncIntervalMinutes`, with backoff in `nextRetryAt`. Each attempt updates the same row (`attempts`+1) — the unique index allows one row per document — and the audit trail keeps every attempt's version.
   - ACCEPTED writes fbrInvoiceNo / QR back to the invoice; FAILED writes the error.
   - Credit-note posting also queues a submission when the company reports to FBR.
   - **Going live:** when sending is first enabled, the screen shows the backlog (count, oldest date) and offers *Send backlog* or *Mark as not reported* (bulk, by date range) → new status SKIPPED, invoice `fbrStatus` NOT_REPORTED. Skipped rows can be re-queued.
   - *Block posting if FBR unreachable* is enforced only when that switch is on (off by default) **and** sending is enabled; with sending off it never blocks (`FBR_UNREACHABLE`).
   - **Posting impact summary:** WHT register and the FBR queue only record; posting is blocked only by a filed return for that month (decision 2) or the opt-in unreachable switch.

**Open question:** the Sales Register / by Customer / by Item / GST Output studio tabs (left open in Phase 24) stay out of this phase; Annex-C covers GST output. → user decides.

## 3. Template → page mapping (`template/src/42-acc-reports.html`)
| Entity | Template | Page / component | Pattern | States |
|---|---|---|---|---|
| Sales Tax Returns | `app/tax/sales-tax` | `/tax/sales-tax` · `SalesTaxReturnScreen` | Period select, KPIs, banners, tabs Annex-C / Annex-A / Summary, Validation + Filing history side panels; modal `rpt-iris-export`; File / Pay modals in template style | loading, empty (no return → Prepare), validation, success, error, permission |
| WHT Deductions & Challans | `app/tax/wht` | `/tax/wht` · `WhtScreen` | KPIs, "Deductions by section" table (drill to rows drawer), Challans panel, modal `rpt-wht-challan` | same |
| WHT Certificates & Statements | `app/tax/wht` | same page: *Deduction certificates* button → certificates drawer; "Quarterly statements" panel with Prepare / File | drawer + panel | same |
| FBR Submissions | `app/tax/fbr` | `/tax/fbr` (existing `FbrScreen`, Phase 5) | Invoice sync log with chips + pager, live Test connection / Sync now, Connection history timeline, KPIs | same |

Each detail drawer has a **History** tab. Missing templates (built in template style, listed as deviations): return File / Pay modals, certificate list drawer + print view, deduction drill-down drawer, manual deduction form, statement prepare/file modal.

## 4. Clean Architecture
| Layer | Module / file | Responsibility |
|---|---|---|
| Contracts | `src/shared/tax/{returns,wht,fbr-submissions}.ts` | Zod schemas, DTOs, list queries |
| Domain | `src/server/modules/tax/<entity>/domain` | Status transitions, return totals / 90% cap, challan amount match, retry backoff |
| Application | `…/application` | Prepare / validate / file / pay; challan create / post / cancel; certificate generate / issue / receive / claim; statement prepare / file; FBR send / retry / test / sync job; ports incl. `FbrGateway` |
| Infrastructure | `…/infrastructure` | Prisma stores via `prisma.db()`, calls to the Tax.* functions, off / HTTP / simulated FBR gateways |
| Server adapter | `…/presentation` controllers under `/api/tax/*` | Auth, `@RequirePermission`, `withContext` |
| UI | `src/features/tax` + `src/app/(app)/tax/{sales-tax,wht}` | Screens above; FbrScreen moves to `src/features/tax` |

New module `src/server/modules/tax` (FBR settings stay in treasury; the submissions module imports its store).

## 5. API contracts
| Method & path | Permission | Notes / errors |
|---|---|---|
| `GET /api/tax/sales-tax-returns?period&authority&status&page` · `GET …/:id` (with lines) | tax:view | |
| `POST …/prepare {periodMonth, authority}` | tax:create | `TAX_RETURN_NOT_DRAFT` 409, `TAX_STRN_MISSING` 422 |
| `PATCH …/:id` (remarks, exclude unmatched, line match flags; rowVersion) · `DELETE …/:id` | tax:edit | drafts only; stale → 409 |
| `POST …/:id/approve` (validate) · `…/file` · `…/pay {cprNo, paidOn, bankAccountId, amount}` | tax:approve · tax:post | `TAX_RETURN_INVALID_STATE` 409, `TAX_CPR_DUPLICATE` 409 |
| `GET …/:id/annex-c.csv` · `annex-a.csv` | tax:export | |
| `GET /api/tax/wht?period&section&direction&status` · `GET /api/tax/wht/summary?period` | tax:view | |
| `POST /api/tax/wht` · `PATCH/DELETE /api/tax/wht/:id` | tax:create / tax:edit | manual UNPAID only → `WHT_DEDUCTION_LOCKED` 409 |
| `POST /api/tax/wht/challans` · `POST …/challans/:id/post` · `…/cancel` · `GET …/challans` | tax:create / tax:post | `WHT_CHALLAN_AMOUNT_MISMATCH` 422, `WHT_CHALLAN_CERTIFIED` 409 |
| `GET/POST /api/tax/wht/certificates` · `POST …/generate` · `…/:id/issue|claim|cancel` · `GET …/:id/print` | tax:view / create / approve | `WHT_CERT_INVALID_STATE` 409 |
| `GET /api/tax/wht/statements` · `POST …/prepare` · `…/:id/file` | tax:view / create / post | `WHT_STATEMENT_EXISTS` 409 |
| `GET /api/tax/fbr/submissions?status&page` · `GET …/:id` · `POST …/:id/retry` · `POST /api/tax/fbr/sync` | tax:view / tax:edit | `FBR_NOT_CONNECTED` 422, `FBR_SUBMISSION_ACCEPTED` 409 |
| `GET /api/tax/fbr/backlog` · `POST /api/tax/fbr/backlog/send` · `POST /api/tax/fbr/backlog/skip {from, to}` · `POST …/submissions/:id/requeue` | tax:view / tax:edit | `FBR_NOT_CONNECTED` 422 |
| `PUT /api/tax/fbr/:authority` (existing) gains `sendingEnabled` | tax:edit | `FBR_NOT_CONFIGURED` 422 when enabling without POS ID + token |
| `GET /api/tax/fbr/connection-events` · `POST /api/tax/fbr/test-connection` | tax:view / tax:edit | |
| `GET …/:id/history` on each | tax:view | |

Delete vs deactivate: only DRAFT returns / challans / certificates and manual UNPAID deductions are deleted; posted ones are cancelled (reversal). Submissions and connection events are never deleted.
Concurrency: rowVersion on every PATCH / transition. Pagination, search on party / doc no., sort by date.

## 6. Database — `prisma/sql/304-tax-compliance.sql` (idempotent, added to `db:sql`)
- Audit trigger on `Tax.FbrConnectionEvents`.
- `Tax.salesTaxReturnPrepare`, `salesTaxReturnPayEntries`, fixed `salesTaxReturnFile` (filedOn / user), period-lock trigger on invoice / credit note / bill / debit note posting and voiding.
- `Tax.whtRegister`, posting / void triggers for vendor payments, purchase vouchers, customer receipts + backfill; `whtChallanPayEntries`; challan docNo from series.
- `Tax.whtCertificateGenerate|Issue|Claim`, `whtStatementPrepare`.
- FBR: `FbrSettings.sendingEnabled boolean default false`; lookup status SKIPPED on `FbrInvoiceSubmissionStatus` and NOT_REPORTED on `FbrStatus`; relax `fbrSubmissionAttemptChk` to allow SKIPPED with 0 attempts; credit-note queueing on post, `fbrSubmissionRecordAttempt`, posting block when unreachable.
- Numbering series STR / WHT / WHTC (+ doc type WHTC) for all tenants and in `provisionTenant`.
- Error codes listed in §5 + `TAX_PERIOD_FILED`, `FBR_UNREACHABLE`, `FBR_NOT_CONNECTED`, `FBR_NOT_CONFIGURED`.
- Prisma models for the 7 unmapped tables.

## 7. Audit (row history)
- **Covered:** all 8 tables (one trigger added).
- **Attribution:** every mutation runs in `PrismaService.withContext` with the session user; the FBR sync job runs as `system: fbr-sync`; triggers fired by posting inherit the poster.
- **History view:** History tab in each drawer; 8 tables registered in `history-tables.ts` with `tax:view`.

## 8. Ordered tasks
1. Pages from the templates with marked fixtures (sales-tax, wht; FbrScreen live parts).
2. SQL 304, Prisma models, contracts, domain, use cases, stores, controllers, FBR gateways + sync job.
3. Wire pages to the API; remove fixtures.
4. Transitions, cancel / delete rules, period lock.
5. Audit registration and attribution check.
6. Verification.

## 9. Verification
- **Functional (lean smoke, scratchpad `api-p28.mjs`, Test Co):** post an invoice + bill + WHT vendor payment + receipt with WHT → prepare / validate / file / pay return (BPV correct, lock blocks a back-dated invoice); register shows DEDUCTED / SUFFERED / COLLECTED rows; challan post + cancel; certificate generate → issue, received → claim; statement prepare → file; FBR with sending off → invoice stays Pending, no IRN, Sync now / Test connection return FBR_NOT_CONNECTED, posting not blocked; in Test Co with the simulator → ACCEPTED (invoice gets IRN), forced failure → FAILED → retry, backlog skip → SKIPPED / NOT_REPORTED and requeue; denied call without `tax:post`; history rows carry the real user (psql).
- **Visual:** headless Edge screenshots of `/tax/sales-tax`, `/tax/wht`, `/tax/fbr` vs template at the same viewport (light / dark / mobile).
- `tsc` (app + server), `npm run lint`, `npm run delivery:roadmap`.

## 10. Acceptance criteria, risks, blockers
- **Criteria:** the four flows above work end-to-end and persist after reload, with GL effects, error codes, permissions and history.
- **Risks:** no real FBR / PRAL credentials — the HTTP adapter is built to the published DI API but only verified against the simulator (sending stays off until you attach FBR); supplier Annex-C matching is manual; payroll 149 deductions arrive only when Phase 32 calls `whtRegister`; posting triggers touch Phase 19/20/23/24 posting paths (regression run of api-p19/20/23/24 after).
- **Blockers:** none.

---
**Approve Phase 28 revision 2 for implementation?**
