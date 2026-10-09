# Phase 16 rev 1: General ledger

**Objective:** the first transactions. This phase delivers:
- the **approval engine and inbox** that every later document uses;
- **journal vouchers** (JV, CPV, CRV, BPV, BRV, contra): drafts, approval, posting into open periods, and reversal;
- **opening balances** per fiscal year;
- **recurring vouchers** run on a schedule;
- the read-only **Trial Balance, General Ledger and Day Book** reports.

Posted data is never edited or deleted: corrections are reversals. Every change is attributed to the user in row history.

**Entities (4, TRANSACTIONAL):** Approvals Inbox · Journal Vouchers · Opening Balances · Recurring Vouchers

**Status before this plan:**
- Phases 0–12 `done`.
- Phases 13–15 (masters) are `in-progress` in the parallel session.

**Decisions taken with you:**
- **Masters-first exception:** Phase 16 is planned before 13–15 are accepted, because none of its entities depend on them.
- **Test company:** posted vouchers, approval actions, voucher activity and recurring runs can never be deleted. So a separate company **"Test Co" (code `test`)** is provisioned once through `Platform.provisionTenant`, and all posting tests from this phase on run there. Demo's ledger only gets clearly named demo vouchers for the screenshots, which are reversed afterwards.
- **Approval engine:** uses the Phase 2 workflow definitions in full.
  - **Matching:** workflows are matched by their conditions (amount, document type, branch, department, cost centre…).
  - **Steps:** sequential steps by role, user or line manager. Each step needs ANY or ALL of its approvers and can apply only above an amount.
  - **Actions:** delegation, request changes, reject and bulk approve. A requester never approves their own document.
  - **Later:** SLA reminders and escalation wait for the job scheduler's notification work.
- **Recurring scheduler:** an in-app job checks due templates every hour and creates their vouchers (draft or posted, per template), recorded as `system: recurring-vouchers`. Each template also has **Run now**.
- **Posting without a workflow:**
  - if no active workflow matches, a user with `vch:post` posts directly;
  - if one matches, the voucher must be approved first, and a workflow set to *Auto-post* posts on its final approval.

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Approvals Inbox | Transaction | Approval workflows, users, SoD rules (2, done) | Every later document (bills, payments, leave, payroll) routes through it |
| Journal Vouchers | Transaction | Chart of accounts, fiscal periods, cost centres (3, done); numbering (1, done); approvals | The general ledger itself; all later postings create vouchers |
| Opening Balances | Transaction | Chart of accounts, fiscal years (3, done) | Starting balances for the ledger |
| Recurring Vouchers | Transaction | Vouchers | Monthly accruals, rent, depreciation |

## 2. Verified schema (live DB; all 11 tables are empty)

**Approvals** (`Company.Approvals`, audited) + **ApprovalActions** (append-only)
- **Request:**
  - `workflowId`, `entityType` / `entityId`, `docLabel`, title, amount, currency, branch;
  - requested by / at, `currentStepNo`, current step due, escalated;
  - `status`: Pending / Approved / Rejected / Changes requested / Cancelled; `completedAt` is set exactly when no longer pending.
- **Actions:** step, action (Submit, Approve, Reject, Request changes, Delegate, Escalate, Remind, Resubmit, Cancel, Auto-skip), actor, on behalf of, delegate to, reason / comment (required to reject or request changes), bulk, IP.
- **Audit trigger missing on ApprovalActions → added.**
- **DB functions:**
  - `approvalAddUpdate`, `approvalCancel`;
  - `approvalApprove`: single step, and refuses the preparer;
  - `getApprovalStatus`, `assertDocumentApproved`.
  - The multi-step logic is built in the application on top of these.
- **Workflow definitions (Phase 2):**
  - `ApprovalWorkflows`: subject (Voucher, Vendor bill…), status, priority, on complete (Auto-post / Mark approved), on reject (Return to preparer / Cancel);
  - `ApprovalWorkflowConditions`: field, operator, value;
  - `ApprovalWorkflowSteps`: approver role / user / line manager, applies above an amount, ANY / ALL, block self-approval, allow delegation, require comment, SLA;
  - `ApprovalDelegations`.
  - Demo has **6 inactive leftover test workflows** from Phase 2 (named "Vouchers over 500k …") and 6 soft-deleted ones. Cleaning them up is in the tasks.

**Vouchers** (`Accounting.Vouchers` + `VoucherLines` audited; `VoucherActivities` append-only)
- **Header:**
  - type (JV, CPV, CRV, BPV, BRV, CON, OB, SYSTEM), `docNo` (unique), doc / posting date, fiscal period, reference, branch, department, currency / fx rate;
  - narration (1–300, required), remarks, tags;
  - cash / bank account (required exactly for CPV / CRV / BPV / BRV), party name, instrument (type / no / date), auto-reverse on (JV only, after the posting date);
  - totals;
  - status: Draft → Pending approval → Posted → Reversed;
  - prepared / submitted / approved / posted by and at;
  - source document, reversal links and reason (Incorrect amount, Wrong account, Duplicate, Wrong period, Other);
  - recurring template.
- **Lines:** line no, account, particulars, debit xor credit (> 0), cost centre, branch, customer / vendor / employee (one at most), auto-contra flag, project.
- **DB guards:**
  - only drafts can be deleted;
  - posted / reversed vouchers can't change;
  - posting needs ≥ 2 lines, balanced, > 0, active postable accounts, and an open period;
  - totals are kept by trigger.
- **Activities:** Created, Edited, Submitted, Approved, Sent back, Posted, Reversed, Comment, Printed, Duplicated.
- **Audit trigger missing on VoucherActivities → added.**
- **DB functions:** `voucherAddUpdate`, `voucherPost` (idempotent), `voucherReverse` (mirror voucher, posted; marks the original Reversed), `journalCreate`, `getVoucherInfo`.

**Opening Balances** (`OpeningBalances` + `OpeningBalanceLines`, audited)
- **Batch:** one per fiscal year; as-at date, branch, suspense account, totals / difference, Draft / Posted, the posted voucher.
- **Lines:** account, branch, debit xor credit, customer / vendor, remarks; unique per account / branch / party.
- **DB functions:** `openingBalanceAddUpdate`, `openingBalancePost` (creates the OB voucher).

**Recurring Vouchers** (`RecurringVoucherTemplates` + lines audited; `RecurringVoucherRuns` append-only)
- **Template:**
  - name (unique), description, type (JV / BPV / CPV), narration, branch, cash / bank account (BPV / CPV), party, amount;
  - **schedule:** None / Weekly / Monthly / Quarterly / Yearly, run day / last day / weekday / month, start date;
  - **end:** Never / after N / on date;
  - auto-post, notify on failure (user), next / last run, occurrences;
  - status Active / Paused / Failed, last error, source voucher.
  - Frequency None = a voucher template used by "Import from template" / "Save as template".
- **Runs:** scheduled date, trigger (Schedule / Manual), Success / Failed / Skipped, the voucher, error.
- **Audit trigger missing on runs → added.**
- **DB functions:** `recurringVoucherTemplateAddUpdate`, `recurringVoucherTemplateRun`, `getRecurringVoucherNextDate`.

**Reports:** `getTrialBalanceForPeriod(from, to, branch, level)` and `getGeneralLedgerForPeriod(from, to, account, branch)`. The Day Book reads posted vouchers for a day.

**Periods:** FY 2026-27 has 12 open periods; FY 2027-28 onward have their periods locked or open as set up in Phase 3.

**Numbering:** document types JV / CPV / CRV / BPV / BRV / CON (`{PREFIX}-{YYYY}-{SEQ6}`, yearly) and OB (`{SEQ4}`) exist, but Demo has **no series** for them, so they are seeded.

**Unresolved questions:** none.

## 3. Template → page mapping
| Entity | Template · route | Page / component | Notes |
|---|---|---|---|
| Approvals Inbox | `app/approvals` (`4A-company-plus.html`, behaviour `9A-company-plus.js`) | `/approvals` → `ApprovalsInboxScreen` | **From the template:**<br>• the KPIs (waiting on you, value pending, SLA breached, approved today);<br>• type chips with counts, cards / list toggle, select all, keyboard shortcuts (J/K, A, R, X, ↵);<br>• the cards (doc, title, amount, SLA chip, requester, age, approval-chain avatars) and the list table;<br>• the bulk bar (count, total, Clear / Reject / Bulk approve) and the bulk-reject confirm;<br>• the detail drawer: document lines, approval chain, comments, Delegate / Request changes (presets) / Reject (presets) / Approve;<br>• undo toast and the "Inbox zero" state.<br>**Real now:** vouchers only, since other types arrive with their phases. |
| Voucher Register | `app/accounting/vouchers` (`40-acc-core.html`) | `/accounting/vouchers` → `VouchersScreen` | **From the template:** period menu, KPIs, type chips, search, status / branch / more filters, the table with page total and pager, the ⋯ menu (open, post / reverse, duplicate, print), the post / reverse modal (date, period, reason, remarks, balance and approval-chain banners), Export (CSV). |
| New / edit voucher | `app/accounting/vouchers/new` (`44-purchase-docs.html`, `94-purchase-docs.js`) | `/accounting/vouchers/new` (and edit of drafts) → `VoucherEditor` | **From the template:**<br>• the `pd-*` editor: type tiles and a More menu (Contra, Opening balance links to Opening Balances);<br>• number preview, the details card, the narration counter;<br>• the panel that changes with the type: cash account and pay-to; bank account with instrument, cheque no / date and payee; JV auto-reverse;<br>• the lines grid: account picker grouped by class, auto code, description, Dr / Cr or a single amount with an auto-contra row, cost centre, duplicate / delete with undo, drag reorder;<br>• the totals bar and balance pill;<br>• tags and comments;<br>• action bar: Save as template, Cancel, Save draft, **Save & Post** or **Save & Submit** when a workflow applies; Save & New, Save & Print; Ctrl+Enter.<br>**Disabled until Phase 35 (file storage):** attachments.<br>**Disabled until later:** "Recurring monthly" on the JV panel links to Recurring templates instead. |
| Voucher view | `app/accounting/vouchers/view` (`40-acc-core.html`) | `/accounting/vouchers/[id]` → `VoucherViewScreen` | **From the template:**<br>• the header definition lists and narration;<br>• ledger entries (with "View in ledger");<br>• the audit trail, from VoucherActivities and row history;<br>• side panels: amount KPI, the approval timeline with comment / Send back / Approve, related items;<br>• actions: Register, Print (browser), Duplicate, Reverse (modal with auto number, reason, remarks), Approve, plus Edit / Submit / Post / Delete for drafts.<br>**Disabled until Phase 35:** attachments. |
| Opening Balances | `app/accounting/opening` (`40-acc-core.html`) | `/accounting/opening` → `OpeningBalancesScreen` | **From the template:**<br>• the out-of-balance banner (difference parked in the suspense account) and the KPIs;<br>• search, class chips and branch filter;<br>• the editable opening trial balance (code, account, type, debit, credit, remove); add account; zero rows hidden;<br>• Totals and Difference;<br>• Discard / Save draft / Post;<br>• the CSV import modal (as-at date, on duplicate, validate codes), parsed in the browser;<br>• the "Template" download. |
| Recurring Vouchers | `app/accounting/recurring` (`40-acc-core.html`) | `/accounting/recurring` → `RecurringScreen` | **From the template:**<br>• KPIs, frequency chips and search;<br>• the table (template, type, frequency, next / last run, amount, auto-post switch, status, ⋯);<br>• the wide new-template modal (name, type, frequency, day, start, end, branch, lines grid, auto-post, notify);<br>• Run due now.<br>**Added:** pause / resume, run now, the run history per template, History. |
| Trial Balance · General Ledger · Day Book | `app/reports/trial-balance`, `app/reports/gl`, `app/reports/day-book` (studio shell `45-studios.html`, `96-studio.js` "finance") | `/reports/trial-balance`, `/reports/gl`, `/reports/day-book` | **From the template's studio shell:** filter panel (period presets / range, branch, account level, zero balances, search), report tabs, the columns and stats listed for each report, CSV download and browser print.<br>**Not built:** the page-thumbnail viewer and presets (simplified to a single scrolling sheet). Account Ledger already exists (Phase 3). |

Every page has loading, empty, validation, success, error and permission states.

## 4. Clean Architecture
| Layer | Module / file | Responsibility |
|---|---|---|
| Contracts | `src/shared/finance/{voucher,approval,opening,recurring,gl-reports}.ts` | Zod schemas; helpers `voucherErrors` (balance, one side per line, type rules), `autoContra`, `periodFor`, `nextRunDate` |
| Domain | `src/server/modules/finance/approvals/domain` (approval engine) | Workflow matching by conditions and priority; the steps that apply to an amount; who may act on a step (role members, user, requester's line manager via `Users.employeeId` → reporting manager → linked user, active delegations); ANY / ALL completion; no self-approval |
| Application | `ApprovalsService` (inbox, approve / reject / request changes / delegate / bulk / comment; the generic engine every later document registers a "subject adapter" with), `VouchersService` (draft, submit, post, reverse, duplicate, delete draft), `OpeningBalancesService`, `RecurringService` (CRUD, run now, pause / resume), `RecurringJob` (hourly), `GlReportsService` | Use cases in `UnitOfWork.run(actorContext…)`; the job uses a SERVICE actor |
| Infrastructure | Prisma stores; `voucherAddUpdate` / `voucherPost` / `voucherReverse` / `approval*` / `openingBalance*` / `recurringVoucherTemplate*` through the allow-list; report functions | |
| Server adapter | `/api/approvals/*`, `/api/accounting/vouchers/*`, `/api/accounting/opening-balances/*`, `/api/accounting/recurring-vouchers/*`, `/api/reports/{trial-balance,gl,day-book}` | Zod pipes, `@RequirePermission`, user context |
| UI | `src/features/finance/*` (vouchers, opening, recurring, reports), `src/features/approvals/*` | Nav: **Workspace** › Approvals (with a pending badge); **Finance › Accounts**: Vouchers, Opening Balances, Recurring; **Reports**: Trial Balance, General Ledger, Day Book |

## 5. API contracts
| Method & path | Permission | Notes / errors |
|---|---|---|
| `GET /api/approvals/inbox?type` · `GET /api/approvals/:id` | signed-in (lists only what the user can act on or requested) | KPIs, chain, lines, comments |
| `POST /api/approvals/:id/approve \| reject \| request-changes \| delegate \| comment` · `POST /api/approvals/bulk` | eligible approver of the current step | 403 `APPROVAL_NOT_ELIGIBLE`, 409 `APPROVAL_SELF`, 400 reason required, 409 not pending |
| `GET /api/accounting/vouchers?period&type&status&branch&search&page` · `GET /:id` | `vch:view` | KPIs and page totals |
| `POST /api/accounting/vouchers` · `PATCH /:id` (drafts) · `DELETE /:id` (drafts) | `vch:create` / `vch:edit` / `vch:delete` | 400 `VOUCHER_UNBALANCED`, line rules, cash / bank account; 409 `VOUCHER_NOT_EDITABLE` |
| `POST /:id/submit` | `vch:create` | Routes to the matching workflow; 409 when none applies (post instead) |
| `POST /:id/post` | `vch:post` | 409 `VOUCHER_APPROVAL_REQUIRED`; 400 `PERIOD_NOT_OPEN`, unbalanced, inactive account |
| `POST /:id/reverse` `{date, reason, remarks}` · `POST /:id/duplicate` | `vch:post` / `vch:create` | Only posted vouchers; the reversal is posted at once |
| `GET/PUT /api/accounting/opening-balances?year` · `POST /:id/post` | view `vch:view`; edit `vch:edit`; post `vch:post` | One batch per year; posting a difference needs the suspense account |
| `GET/POST/PATCH/DELETE /api/accounting/recurring-vouchers(/:id)`, `POST /:id/run-now \| pause \| resume`, `POST /run-due`, `GET /:id/runs` | view / create / edit / post: `vch:*` | 400 schedule / end rules; run failures are recorded as failed runs |
| `GET /api/reports/trial-balance?from&to&branch&level&zero` · `GET /api/reports/gl?from&to&account&branch` · `GET /api/reports/day-book?date&branch` | `vch:view` | |
| `GET /api/history/{Accounting,Company}/<table>/:id` | view permission | |

## 6. Database changes: `prisma/sql/022-general-ledger.sql`
Number 022, because 019–021 are used by the parallel phases. Idempotent, added to `npm run db:sql`.
- **Audit triggers:** `ApprovalActions`, `VoucherActivities`, `RecurringVoucherRuns`.
- **Per-tenant seed** (function + tenant trigger, backfilled): numbering series JV, CPV, CRV, BPV, BRV, CON and OB (company-wide, yearly).
- **Error codes:** `VOUCHER_UNBALANCED`, `VOUCHER_NOT_EDITABLE`, `VOUCHER_APPROVAL_REQUIRED`, `PERIOD_NOT_OPEN`, `APPROVAL_NOT_ELIGIBLE`, `APPROVAL_SELF`, `APPROVAL_NOT_PENDING`, `OPENING_BALANCE_POSTED`.
- **Lookup labels.**
- **Test company:** a one-off script, `scripts/provision-test-company.ts`, calls `Platform.provisionTenant('test', 'Test Co', …)`. It then applies the chart of accounts template through the API as Test Co's default user. Its credentials are kept in `.env` as `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` and never printed.
- **Prisma:** models for the 11 tables plus the workflow tables (scalar fields).

## 7. Audit (row history)
- **Tables covered:** all 11 tables, with 3 audit triggers added.
- **Attribution:**
  - every write runs in `UnitOfWork.run(actorContext…)`;
  - the recurring job runs as `system: recurring-vouchers`;
  - seeds run as `system: seedGeneralLedgerDefaultsFor`.
- **History views:** the voucher view shows VoucherActivities (business log) and row history; approvals show their actions; templates show their runs.

## 8. Ordered tasks
1. `022-general-ledger.sql`; Prisma models; registrations; provision **Test Co**; remove the leftover Phase 2 test workflows in Demo (the 12 "Vouchers over 500k / Dup …" rows).
2. Shared contracts and helpers.
3. Approval engine and inbox API.
4. Vouchers API (draft / submit / post / reverse / duplicate) wired to the engine.
5. Opening balances and recurring (with the hourly job); report endpoints.
6. Pages from the templates; nav entries.
7. **Verification:**
   - API suite in **Test Co**: vouchers, approvals (multi-step, ALL / ANY, delegation, self-approval, changes requested), periods, reversal, opening, recurring, reports, permissions, history;
   - visuals in Demo against the templates;
   - Demo's demo vouchers reversed.

   Regressions are **not** run this phase (the next full run is after Phase 14).

## 9. Verification
- **Functional** (`api-p16`, run in Test Co):
  - **Vouchers:**
    - an unbalanced voucher, or one with < 2 lines, can't post;
    - CPV / BPV need their cash / bank account and get an auto-contra line;
    - posting into a locked period is rejected;
    - posted vouchers can't be edited or deleted;
    - reversal mirrors the lines, posts at once, and marks the original Reversed;
    - duplicate creates a draft.
  - **Approvals:**
    - a workflow with 2 steps (role, then user above an amount) routes the voucher;
    - the requester can't approve;
    - an ALL step needs every approver;
    - delegation lets the delegate act;
    - request changes sends the voucher back to draft and resubmitting routes it again;
    - reject;
    - Auto-post posts on final approval;
    - bulk approve;
    - with no matching workflow, `vch:post` posts directly.
  - **Opening balances:** save, out-of-balance posting goes to the suspense account, one batch per year, posting creates the OB voucher.
  - **Recurring vouchers:** create with a schedule and next date; Run now creates a draft or a posted voucher; a failed run is recorded and the template marked Failed; pause / resume; the hourly job picks up due templates.
  - **Reports:** trial balance debits = credits after the postings; the GL shows running balances; the Day Book lists the day's vouchers.
  - **Permissions:** accountant (vch:*), auditor (view only), salesman (403).
  - **History:** rows carry the real user, and the job's runs show `system: recurring-vouchers`.
- **Visual:** each page vs the template in light and dark at 1400 px and 390 px mobile.
- **Checks:** typecheck, lint, architecture and roadmap checks.

## 10. Acceptance criteria, risks, blockers
- **Acceptance:**
  - everything in §9 passes;
  - Demo's ledger is left with only the reversed demo vouchers;
  - deviations listed honestly.
- **Risks:**
  - **Permanent records:** append-only and posted records can't be cleaned. That is why tests run in Test Co, which will keep its test history.
  - **SLA:** SLA timers are shown but not acted on (reminders and escalation come with notifications).
  - **Parallel work:** Phases 13–15 change shared registries and nav at the same time; changes there stay add-only.
- **Blockers:** none.

---
**Approve Phase 16 revision 1 for implementation?**
