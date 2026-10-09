# Phase 18 rev 1 — Cash

**Objective:** Run the cash side of the books: a Cash Book quick entry that records cash, bank, transfer and cheque movements as vouchers; the Cash Ledger with daily cash count and day close (variance posted to cash over/short, locked days read-only); petty cash expense vouchers and fund top-ups; and expense claims from employees (My Profile) through the approval engine to payment.

**Entities (4, TRANSACTIONAL):** Cash Book Entries · Cash Day Close · Petty Cash Vouchers & Replenishment · Expense Claims

**Status before this plan:** Phases 0–17 done. Phases 36–39 (Super Admin) are in progress in a parallel session; no other workspace phase is in progress.

**Decisions taken (2026-10-07):**
- Expense claims route through the **Phase 16 approval engine**; every company gets a seeded, editable **"Expense claims" workflow: Line manager → Finance** (Financial accountant role).
- **Receipts:** count + Missing / N/A flag now; file upload arrives with document storage (Phase 35). OCR scanning is not built.
- **Claim payment:** cash (CPV) or bank (BPV), singly or as a "Pay approved" batch; "with payroll" is shown disabled until payroll runs exist.
- **Cash Book quick entry:** cash in / out, bank in / out, transfer (contra) and cheque mode (records a Phase 17 cheque).

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Cash Book Entries | Transactional | Cash accounts & categories (P4 ✓), Vouchers (P16 ✓), Cheques (P17 ✓) | Daily cash recording; feeds the cash ledger |
| Cash Day Close | Transactional | Cash book (this phase) | Daily control over the drawer |
| Petty Cash Vouchers & Replenishment | Transactional | Petty cash funds (P5 ✓), Expense categories (P4 ✓) | The petty cash screen's expense and top-up parts were deferred here |
| Expense Claims | Transactional | Expense categories (P4 ✓), Employees (P11 ✓), Approvals (P16 ✓) | Employee reimbursement; My Profile › Expense Claims is a placeholder today |

## 2. Verified schema
All tables exist in `BankCash`; no rows in any tenant.

- **CashBookEntries:** journalEntryId (NOT NULL), branchId, entryKind (CASH_IN, CASH_OUT, BANK_IN, BANK_OUT, CHEQUE_IN, CHEQUE_OUT, TRANSFER), entryDate / entryTime, cash or bank account (+ to-cash / to-bank account for transfers; checks enforce one side per kind), categoryId (cash category), paymentMode (checked per kind), partyName (required except transfers), customer / vendor / employee (at most one), referenceNo, chequeId (required for cheque kinds), amount > 0, narration. Audit trigger ✓. No save function; nothing writes it yet.
- **CashDayCloses + CashDayCloseDenominations:** cash account, close date, book balance, counted amount, variance (generated), status COUNTED / LOCKED / REOPENED, lockedBy / lockedAt, varianceJournalEntryId (required when LOCKED with a variance). Denominations 5000…1 with qty. Guard trigger: a LOCKED day only changes to REOPENED. `cashDayCloseAddUpdate` exists. **Denominations have no audit trigger.**
- **PettyCashVouchers:** docNo, docDate, fund, expense category, description, paid to, amount, GL account, cost centre, receiptStatus ATTACHED / MISSING / NA with receiptCount, status UNREPLENISHED / REPLENISHED / VOID, replenishmentId. `pettyCashVoucherAddUpdate`, `pettyCashVoucherVoid` exist.
- **PettyCashReplenishments:** fund, date, pay from cash **or** bank account, amount, voucher count / total, postTogether, status DRAFT / POSTED / CANCELLED, journalEntryId. `pettyCashReplenishmentPost` with **existing posting** (`…PostEntries`: Dr each expense account per voucher group + Dr imprest for the rest / Cr the paying cash or bank account, as a system voucher; vouchers become REPLENISHED) and `…Cancel` with reversal.
- **ExpenseClaims / ExpenseClaimLines / ExpenseClaimActions:** claim header (docNo, employee, branch, source ESS / ADMIN, title, merchant, trip dates, category, cost centre, project, customer, charge account, totals, receipt count, policy limit / period / over-policy + justification, status DRAFT / PENDING / OVER_POLICY / APPROVED / PAID / REJECTED / WITHDRAWN, workflowStage SENT / MANAGER / FINANCE / PAID, approvalRequestId, approver / approvedAt, rejection reason + comment + allow resubmit, payment method PAYROLL / BANK_TRANSFER / CASH + bank account, paidAt, approval and payment voucher ids), lines (date, description, category, merchant, qty × unit, amount, account, cost centre), actions (append-only: SUBMITTED … PAID, COMMENTED). `expenseClaimAddUpdate`, `expenseClaimApprove` with **existing accrual posting** (`…ApproveEntries`: Dr expense accounts / Cr EMPLOYEE_CLAIMS_PAYABLE) and `expenseClaimPay` whose `…PayEntries` **does not exist yet**. **ExpenseClaimActions has no audit trigger.**
- **Posting roles mapped in companies:** CASH_OVER_SHORT, EMPLOYEE_CLAIMS_PAYABLE, PETTY_CASH; `Accounting.journalCreate` posts system vouchers.
- **Numbering:** PCV (petty cash vouchers) and EXP (claims) document types exist but **no company has their series**.
- **Permissions:** cash:view / create / edit / approve / post / delete / export; myexp:view / create / edit.

Unresolved questions: none (decisions above).

## 3. Template → page mapping
| Entity | Template | Page / component | Pattern | States |
|---|---|---|---|---|
| Cash Book Entries | `47-books.html:2` + `98-books.js` (`app/cash/book`) | `/cash/book` `CashBookScreen` | KPIs, Cash in / Cash out / Transfer / Cheque quick entry, day-grouped ledger with running balance, voucher drawer, reverse, cash count rail | loading, empty, error, permission, locked day |
| Cash Day Close | `49-cash-users.html:2` + `9E-cash-users.js` (`app/cash/ledger`) and the count rail on Cash Book | `/cash/ledger` `CashLedgerScreen` | account cards, period presets, table / timeline / calendar views, day-close panel with denominations, tolerance bar and Lock, variance trend | + locked (read-only) |
| Petty Cash | `40-acc-core.html:1046` (`app/cash/petty`) | existing `/cash/petty` `PettyCashScreen` gains the expenses table, Record expense and Top-up modals, Spend by category | modals | + validation |
| Expense Claims (finance) | `40-acc-core.html:1166` (`app/cash/expenses`) | `/cash/expenses` `ExpenseClaimsScreen` | KPIs, chips, table, detail panel, reject modal, Pay / Pay approved | |
| Expense Claims (employee) | `6A-ess.html:78` + `9C-ess.js:1416` (`app/profile/expenses`) | `/profile/expenses` (replaces the placeholder) `MyExpenseClaimsScreen` | list with step tracker, new-claim sheet (manual entry; scan / camera shown as "coming with document storage"), policy check, detail drawer (withdraw / resubmit), policy sheet | |

Missing templates: none. Template features shown disabled: receipt upload and OCR (Phase 35), "with payroll" payment, sales-tax split on cash sales (Phase 23+).

## 4. Clean Architecture
| Layer | Module / file | Responsibility |
|---|---|---|
| Contracts | `src/shared/treasury/cash-book.ts`, `petty-vouchers.ts`, `expense-claims.ts` | Zod schemas, types, shared validators (entry rules per kind, denomination totals, claim policy check) |
| Domain | `cash/<entity>/domain` | Day-close variance and tolerance, claim policy check and status machine |
| Application | `cash-book`, `day-closes`, `petty-vouchers`, `expense-claims` use cases (new `src/server/modules/cash/`) | entries via the Phase 16 voucher use case (or Phase 17 cheque use case); claims via the approval engine (a new `ApprovalSubject` for EXP) |
| Infrastructure | Prisma stores + DB functions | |
| Server adapter | `/api/cash/...`, `/api/me/expense-claims` | |
| UI | `src/features/cash/...` + pages | |

## 5. API / action contracts
| Method & path | Permission | Notes / errors |
|---|---|---|
| `GET /cash/book?account&from&to` | cash:view | KPIs (liquid cash, main drawer, bank, petty), entries by day with running balance, glance (in / out, top categories) |
| `POST /cash/entries` `{kind, …}` | cash:create | creates the CRV / CPV / BRV / BPV / CON voucher (posted, or submitted when a workflow routes it) + the entry row; cash out above the available balance → 400 `CASH_INSUFFICIENT`; a locked day → 409 `CASH_DAY_LOCKED`; cheque mode records a cheque (Phase 17) |
| `POST /cash/entries/:id/reverse` `{date, reason}` | cash:post | reverses the voucher (locked day → 409) |
| `GET /cash/ledger?account&from&to` | cash:view | opening, receipts, payments, closing, rows with contra account and category, day subtotals open / closed |
| `GET /cash/day-closes?account&from&to` · `PUT /cash/day-closes` `{cashAccountId, closeDate, denominations[]}` | cash:view / cash:create | book balance from the GL; counted from denominations |
| `POST /cash/day-closes/:id/lock` · `/reopen` | cash:post / cash:approve | lock posts the variance JV (Dr / Cr CASH_OVER_SHORT vs the cash account); beyond the account's variance tolerance → needs cash:approve; reopen reverses the variance JV |
| `GET /cash/petty/vouchers?fund&status` · `POST` · `PATCH /:id` · `POST /:id/void` | cash:view / create / edit | voucher amount ≤ fund cash on hand → 400 `PETTY_FUND_SHORT`; only unreplenished vouchers edit / void |
| `POST /cash/petty/funds/:id/replenish` `{date, payFromCashAccountId \| payFromBankAccountId, amount}` · `POST /cash/petty/replenishments/:id/cancel` | cash:post | posts via the existing `pettyCashReplenishmentPost` |
| `GET /cash/expense-claims?status&dept&search` · `GET /:id` | cash:view | finance list, KPIs |
| `POST /cash/expense-claims/:id/approve|reject` | approval engine (inbox eligibility) | reject needs a reason; final approval runs `expenseClaimApprove` (accrual) |
| `POST /cash/expense-claims/:id/pay` `{method, bankAccountId?, cashAccountId?, date}` · `POST /cash/expense-claims/pay-approved` | cash:post | CPV / BPV Dr EMPLOYEE_CLAIMS_PAYABLE / Cr cash or bank |
| `GET/POST/PATCH /me/expense-claims`, `POST /me/expense-claims/:id/submit|withdraw|resubmit` | myexp:view / create / edit | own claims only; policy check (category limit and period) flags OVER_POLICY and needs a justification |
| `GET /history/BankCash/<table>/:id` | view permission | |

- **Delete vs deactivate:** draft claims and unreplenished petty vouchers can be deleted / voided; posted entries are reversed, never deleted.
- **Concurrency:** rowVersion on every write. **Pagination:** server-side on lists.

## 6. Database changes — `prisma/sql/024-cash.sql` (idempotent, added to `db:sql`)
- Audit triggers on `CashDayCloseDenominations` and `ExpenseClaimActions`.
- `BankCash.expenseClaimPayEntries` (CPV / BPV Dr EMPLOYEE_CLAIMS_PAYABLE / Cr cash or bank).
- A guard so a voucher dated on a LOCKED cash day for that cash account can't be posted (HINT `CASH_DAY_LOCKED`).
- PCV and EXP numbering series for every company (backfill + provisioning trigger).
- A seeded "Expense claims" approval workflow per company (Line manager → Finance role; editable, not system-locked) and its provisioning trigger.
- Error codes: `CASH_DAY_LOCKED`, `CASH_INSUFFICIENT`, `CASH_VARIANCE_APPROVAL`, `PETTY_FUND_SHORT`, `CLAIM_NOT_EDITABLE`, `CLAIM_POLICY_JUSTIFICATION`.

## 7. Audit (row history)
- **Tables:** all eight; the two missing audit triggers are added in 024.
- **Attribution:** every action runs in `UnitOfWork.run(actorContext(user, meta))`; DB-generated rows inherit the user. Approval actions are also recorded as `ApprovalActions` and mirrored to `ExpenseClaimActions`.
- **History view:** History tab on the cash entry voucher drawer, day close, petty voucher / top-up and claim detail; tables registered in `history-tables.ts` (`cash:view`).

## 8. Ordered tasks
1. SQL 024, Prisma models, registrations.
2. Shared contracts.
3. Server: cash book entries + ledger, day closes, petty vouchers + top-ups, expense claims (finance + My Profile) with the approval subject.
4. Pages from templates: Cash Book, Cash Ledger, Petty Cash (extend), Expense Claims, My Profile › Expense Claims.
5. Nav: Cash › Cash Book, Cash Ledger, Petty Cash, Expense Claims, Cash Setup.
6. Verification.

## 9. Verification
- **Functional (API suite in Test Co):**
  - each entry kind creates its voucher + entry and moves the cash / bank balance; cash out above balance → 400; transfer between cash accounts and cash ↔ bank; cheque mode records a cheque; reverse;
  - day close: count by denominations, lock with and without variance (variance JV), beyond tolerance needs cash:approve, entries on a locked day → 409, reopen reverses the variance;
  - petty: voucher > fund cash → 400, void, top-up posts (expenses + imprest), cancel top-up reverses and re-opens vouchers;
  - claims: employee drafts, over-policy needs justification, submit → line manager → finance (inbox), reject with reason and resubmit, approve posts the accrual, pay cash / bank posts the settlement, pay approved batch, employee sees only own claims;
  - permissions (accountant, auditor, salesman, plain employee), history rows with the real user, trial balance still balances.
- **Visual:** each page vs its template at 1400 light / dark and 390 mobile.

## 10. Acceptance criteria, risks, blockers
- **Acceptance:** section 9 passes; deviations listed honestly.
- **Risks:** the locked-day guard touches voucher posting (Phase 16 / 17 suites re-run); line-manager approval needs employees linked to users (P11) — claims of employees without a manager go straight to Finance.
- **Blockers:** none.

---
**Approve Phase 18 revision 1 for implementation?**
