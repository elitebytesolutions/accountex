# Phase 29 rev 1 — Period close (split)

## Context
You asked this session to take Phase 29; accountex-c0 handed it over and shared its template and DB surveys. Your decisions (2026-10-08):
- **Messaging:** outbox only.
- **Sign-in:** reset & invites only; MFA later.
- **Reopen approval:** permission-based.
- **Scope:** **split the phase.**

So Phase 29 now covers period reopen, year-end close, payment reminder runs, and P&L / Balance Sheet / Cash Flow. Tasks & notifications, sign-in recovery (reset + invites) and the workspace dashboard move to a **new Phase 44, "Work queue & sign-in recovery"**, entered in the roadmap. MFA moves to a later phase.

**Entities (3, TRANSACTIONAL):** Period Reopen Requests · Year-End Close · Payment Reminder Runs.
**Reports:** Profit & Loss, Balance Sheet, Cash Flow.

## 1. Verified state (live DB, accountex-c0 survey, my checks)
- **Tables exist, no rows:**
  - `Accounting.PeriodReopenRequests`, `YearEndCloses`, `YearEndAdjustments`, `Sales.PaymentReminderLogs`.
  - `PaymentReminderLogs` has no audit trigger.
- **Reopen:** `periodReopenRequestApprove` always fails.
  - It doesn't set `decidedAt`.
  - Its MFA check blocks LOCKED periods.
  - It has no hook that actually reopens the period or its module locks.
  - Its segregation-of-duties check compares `createdBy`.
  - There's no reject function and no auto-reclose.
- **Periods:** close and lock go through `fiscalYearAddUpdate` with `fiscalPeriodGuard`, which blocks closing while drafts remain. Module locks live in `PeriodModuleLocks` and are enforced by `assertPostingAllowed`. The `/periods` page (Phase 16 `periods-screen.tsx`) already closes and locks.
- **Year-end:** only `yearEndCloseAddUpdate` (adjustments[]) and `yearEndCloseCancel` exist.
  - Missing: checklist, dry run, closing entry, year lock.
  - Posting role RETAINED_EARNINGS is mapped.
  - `FiscalYears.closingJournalEntryId` is what P&L excludes.
  - Check constraints: FINAL+COMPLETED needs a closing JE and `ceoApprovedByUserId`; DRY_RUN has no JE.
- **Reminders:**
  - Rules and templates exist (Phase 9).
  - The view `Sales.getPaymentReminderQueue` returns what's due now (customer, invoice, balance, days overdue, rule, channel flags, template).
  - Nothing writes `PaymentReminderLogs` yet.
- **Statements:** `Accounting.getProfitAndLossForPeriod`, `getBalanceSheetAsAt`, `getCashFlowForPeriod` exist. Templates are `45-studios.html:100-102` (finance studio in `96-studio.js`).
- **Permissions:** close:view/approve/post/export, frep:view/export, rcpt:*.

## 2. Templates → pages
| What | Template | Page |
|---|---|---|
| Fiscal periods + reopen modal | `42-acc-reports.html:950` | `/periods` (extend Phase 16 `src/features/finance/components/periods-screen.tsx`: reopen request with reason / until / approver; pending requests list) |
| Year-end close wizard | `42-acc-reports.html:1045` (4 steps) | `/periods/close` |
| Reminder runs | `4A-company-plus.html:83` + `9A-company-plus.js:1386` | `/receivables/reminders` (fill the existing screen's empty Overdue customers / Sent log + "Send due reminders") |
| P&L / BS / CF | `45-studios.html:100-102` finance studio | `/reports/pnl`, `/reports/balance-sheet`, `/reports/cash-flow` (add tabs to `src/features/ledger/components/report-studio.tsx`) |

## 3. Behaviour
- **Reopen request:**
  - Who can request: close:post.
  - What: a CLOSED period, optionally a single module, with a reason and a reopen-until date.
  - Approval: close:approve, never the requester. Approving opens the period (or deletes that module's lock).
  - LOCKED periods can't be reopened in this phase; they will need MFA (error PERIOD_LOCKED_NEEDS_MFA).
  - Reject and cancel are available.
  - An hourly job re-closes approved requests once reopen-until passes (RECLOSED).
- **Year-end close (wizard):**
  1. **Checklist**, computed: all periods closed or locked, no draft or pending vouchers, open sales / purchase / stock / distribution drafts, POS shifts open, settlements open, depreciation posted per period.
  2. **Adjustments:** add / remove lines, which post as JVs.
  3. **Closing entries preview:** income and expense close to retained earnings.
  4. **Confirm:** **Dry run** stores a DRY_RUN record with no JE. **Final close** (close:approve) posts the closing JE (SYSTEM, source YE), sets `FiscalYears.closingJournalEntryId`, and locks every period.
  - Balance sheet balances carry forward naturally.
  - Final close can be reversed only by cancelling it, which reverses the JE and unlocks the periods (close:approve).
- **Reminder runs:**
  - "Send due reminders" (and per customer "Send now") read the due queue.
  - Each reminder is rendered from its template (placeholders filled) and written to `PaymentReminderLogs` as **QUEUED** in the outbox, with channel, recipient, amount and days overdue.
  - An hourly job does the same (actor "reminder-runs").
  - The Sent log shows each message. A notice says "Outbox: no email/SMS provider connected; messages are recorded, not sent". A provider plugs in later behind a `MessageSender` port.
- **Statements:**
  - P&L for a period range with a comparative period.
  - BS as at a date with a comparative date.
  - Cash flow (indirect).
  - Each has a branch filter, CSV export and print.

## 4. Server — new `src/server/modules/period-close/`
- **Endpoints:**
  - `accounting/period-reopen-requests` (+ approve / reject / cancel, hourly reclose)
  - `accounting/year-end/:fiscalYearId` (checklist, dry-run, close, cancel, adjustments)
  - `receivables/reminder-runs` (run now, per customer, log list; hourly job)
  - `reports/financial-statements` (pnl, balance-sheet, cash-flow)
- **Reuse:**
  - `Accounting.journalCreate` for closing and adjustment JEs.
  - The existing statement functions.
  - `getPaymentReminderQueue`.
  - The approval-free permission pattern from Phase 26.
  - `fiscalYearAddUpdate` for period status changes.

## 5. Database — `prisma/sql/031-period-close.sql`
- Fixed `periodReopenRequestApprove`, plus new `periodReopenRequestApproveEntries`, `periodReopenRequestReject` and `periodReopenReclose`.
- `yearEndClosePost` (closing JE + lock) and `yearEndCloseCancelEntries`.
- Document type YE.
- Audit trigger on `PaymentReminderLogs`.
- Error codes.

## 6. Roadmap edits (on approval)
- Phase 29 keeps the 3 entities and 3 reports, with the decisions.
- New **Phase 44 "Work queue & sign-in recovery"**: tasks & notifications, invites + password reset (outbox links), workspace dashboard.
- MFA becomes an open item.
- Then run `npm run delivery:roadmap`.

## 7. Verification (basic, Test Co)
- **Smoke API suite (~18 checks):**
  - Reopen: close a period → reopen request → requester can't approve → another user approves → period OPEN → reject path → reclose.
  - Year-end: checklist lists blockers; dry run gives the same net profit as the P&L; final close posts the JE with P&L for the year 0 after close, and periods are locked; cancel reverses.
    - Final close runs on a throwaway past fiscal year in Test Co. The live FY 2026-27 is not touched; if no suitable year exists, only the dry run is checked.
  - Reminders: run → logs QUEUED for overdue invoices with the template rendered.
  - Statements: P&L net profit equals the balance sheet's profit line, and the balance sheet balances.
  - One permission check.
- Typecheck, lint, roadmap, and a quick screenshot per page.

**Then:** write `docs/delivery/phases/phase-29.r1.md`, mark the phase in progress, implement (SQL → server → UI via fork workers), run the smoke suite, and request acceptance.
