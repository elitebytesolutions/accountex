# Phase 17 rev 1 — Banking

**Objective:** Run the bank side of the books: every posted voucher that touches a bank account appears as a bank transaction; bank statements are imported from CSV, de-duplicated, categorised (by bank rules or by hand) into vouchers and matched; month-end bank reconciliations are prepared and closed; received and issued cheques (including post-dated cheques and bulk cheque vouchers) move through their lifecycle with their ledger postings.

**Entities (4, TRANSACTIONAL):** Bank Transactions · Statement Imports · Bank Reconciliation · Cheques & Batches

**Status before this plan:** Phases 0–16 done; no phase in progress.

**Decisions taken (2026-10-07):**
- Cheques post through **clearing accounts**: PDC / cheques in hand and PDC payable are on the balance sheet.
- Bank transactions are **generated, never typed**: from posted vouchers on a bank GL account, and from categorised statement lines (which create a BPV/BRV voucher).
- Statement import: **CSV with a saved column mapping** per bank account. Excel and MT940 are later.
- Cheque / receipt **allocation to invoices and bills is deferred** to Phase 20 (Payables) and Phase 24 (Customer receipts). Cheques post "on account" against the customer or vendor now. `BankCash.ChequeAllocations` moves to Phase 24, and Raast/IBFT invoice matching with it.

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Bank Transactions | Transactional | Bank accounts (P4 ✓), Vouchers (P16 ✓) | Vouchers now post to bank GL accounts; the bank book needs them |
| Statement Imports | Transactional | Bank rules (P5 ✓), Bank accounts (P4 ✓) | Feeds categorisation and reconciliation |
| Bank Reconciliation | Transactional | Bank transactions, Statement imports (this phase) | Month-end control |
| Cheques & Batches | Transactional | Bank accounts, Cheque books (P4 ✓), Customers / Vendors (P7 ✓), Vouchers (P16 ✓) | Cheques are the main payment instrument; PDCs drive the maturity calendar |

## 2. Verified schema
All ten tables exist in `BankCash`, all carry `triggerAudit` + stamp / touch triggers and lookup validation. No rows exist yet in any tenant.

- **BankTransactions:** bankAccountId, txnDate, valueDate, description, detail, reference, paymentMode, category, depositAmount / withdrawalAmount, chequeId, journalEntryId, source (VOUCHER / STATEMENT_IMPORT / MANUAL), statementRef, status (UNCATEGORISED, PENDING, UNPRESENTED, UNCLEARED, CLEARED, RECONCILED), clearedOn, reconciledOn, statementLineId, bankRuleId, reconciliationId. No add/update function and nothing inserts rows today.
- **BankStatementImports / BankStatementLines:** import header (bank account, file name, format BANK_CSV/EXCEL/MT940/CUSTOM, layout, period, opening/closing balance, counts, status UPLOADED/PARSED/MATCHED/FAILED) and lines (txnDate, valueDate, description, reference, amount, direction, runningBalance, channel, `dedupeHash` **unique per bank account**, status UNMATCHED/CATEGORISED/MATCHED/IGNORED, categoryAccountId, costCentreId, bankRuleId, bankTransactionId, journalEntryId, matchedInvoiceId — the last stays unused until Phase 24). `bankStatementImportAddUpdate` exists.
- **BankReconciliations / BankReconciliationMatches:** docNo (doc type REC), bank account, period, statement / book balances, unpresented cheques, deposits in transit, unbooked credits / debits, adjusted balances, difference, status IN_PROGRESS/CLOSED/REOPENED. Matches: statement line ↔ bank transaction / voucher, amounts, difference, status MATCHED/UNMATCHED/SUGGESTED/UNPRESENTED/AMOUNT_DIFFERS, matchMethod AUTO/MANUAL/RULE, confidence, adjustmentJournalEntryId. Trigger `treasuryReconciliationClose` stamps the bank account's `reconciledTo` / last statement balance on close. `bankReconciliationAddUpdate` exists.
- **Cheques:** docNo (CHQ), legacyNo, direction RECEIVED/ISSUED, chequeNo (4–10 digits), customer / vendor / account (at most one; received ⇒ no vendor, issued ⇒ no customer), partyName, drawnOnBankId, bankAccountId (required when issued or deposited), chequeDate ≤ dueDate, receivedOn, amount > 0, isPdc, postingMode DEPOSIT/HOLD_PDC/CLEAR_ON_DEPOSIT (HOLD_PDC ⇒ isPdc), status IN_HAND/DEPOSITED/CLEARED/BOUNCED/ISSUED/PRESENTED/STOPPED/CANCELLED/REPLACED with date checks per status, journalEntryId, clearingJournalEntryId, chequeBookId, crossedAcPayee. Unique issued leaf per bank account; unique received cheque per drawer bank + customer. Trigger `treasuryChequeStatusGuard` enforces the state machine. Functions `chequeAddUpdate`, `chequeDeposit`, `chequePresent`, `chequeClear`, `chequeBounce`, `chequeCancel` exist; they call optional `…Entries` functions for posting, **none of which exist yet**.
- **ChequeBounces:** bounceDate, reason (lookup), bankCharges, recoverCharges, notifyOwner, ownerUserId, creditHold, reversal / charges voucher ids, resolution OPEN/REPRESENTED/REPLACED/RECOVERED/WRITTEN_OFF, replacementChequeId, creditHoldEventId (→ `Sales.CreditHoldEvents`).
- **ChequeBatches / ChequeBatchLines:** docNo (CHB), direction, bank account, postingMode, oldNoRule AUTO_IF_NEW/KEEP_FROM_SHEET/BLANK, source SCREEN/SHEET, row count, total, status DRAFT/VALIDATED/GENERATED/PARTIAL/CANCELLED; lines with party code / name, customer / vendor, chequeNo, dates, amount, legacyNo, validationStatus PENDING/VALID/INVALID/GENERATED, validationErrors jsonb, chequeId. `chequeBatchAddUpdate`, `chequeBatchGenerate`, `chequeBatchCancel` exist.
- **Posting roles available:** CHEQUES_IN_HAND, PDC_PAYABLE, AR_CONTROL, AP_CONTROL, BANK_CHARGES, PROFIT_ON_DEPOSIT, MARKUP_EXPENSE (`Company.DefaultAccountMappings`); `Sales.Customers.receivableAccountId`, `Purchases.Vendors.payableAccountId`.
- **Missing audit triggers:** none.

Unresolved questions: none (decisions above).

## 3. Template → page mapping
| Entity | Template | Page / component | Pattern | States |
|---|---|---|---|---|
| Bank Transactions | `40-acc-core.html:710` `app/bank/transactions` | `/bank/transactions` `BankTransactionsScreen` | KPIs, chips, filters, table with categorise menu for uncategorised lines, import-statement modal | loading, empty, error, permission |
| Statement Imports | `4A-company-plus.html:129` + `9A-company-plus.js:1976` (`app/bank/rules` import panel) | the existing `/bank/rules` page gains the import panel and statement-lines table; the import modal also opens from Bank Transactions | dropzone → column-mapping step → preview (duplicates flagged) → import; Apply rules | + validation |
| Bank Reconciliation | `40-acc-core.html:946` `app/bank/reconciliation` | `/bank/reconciliation` `ReconciliationScreen` | two matching tables, KPIs, auto-match, create adjustments, summary, finish (lock), history list | + closed (read-only) |
| Cheques | `40-acc-core.html:779` `app/bank/cheques` | `/bank/cheques` `ChequesScreen` | received / issued tabs, chips, record-cheque form, row actions | |
| Cheque register | `40-acc-core.html:858` `app/bank/cheque-register` | `/bank/cheque-register` `ChequeRegisterScreen` | KPIs, 10-day maturity calendar, status actions, bounce modal | |
| Cheque batches | `44-purchase-docs.html:533` + `94-purchase-docs.js:1168` `app/bank/cheque-voucher` | `/bank/cheque-voucher` `ChequeVoucherScreen` | single entry + bulk sheet (CSV upload/download, validate, generate) | + per-row validation |

Missing templates: none. Template text that implies invoice allocation ("Against invoices", "re-opens the customer invoice", "Receipt against INV-…", Raast matching) is shown disabled / omitted until Phase 24.

## 4. Clean Architecture
| Layer | Module / file | Responsibility |
|---|---|---|
| Contracts | `src/shared/treasury/banking.ts` | Zod schemas + types: transactions list/query, statement mapping + lines, categorise, reconciliation + matches, cheque, bounce, batch + lines; shared validators (cheque rules, batch row rules, CSV parsing helpers) |
| Domain | `treasury/<entity>/domain` | Cheque state machine and allowed actions, auto-match scoring (amount + date ± days + reference), CSV dedupe hash, reconciliation summary maths |
| Application | `bank-transactions`, `statement-imports`, `reconciliations`, `cheques` use cases in `src/server/modules/treasury/` | list / categorise; import / apply rules / categorise / ignore; reconcile (open, match, unmatch, auto-match, adjustments, close, reopen); cheque record / deposit / clear / bounce / present / stop / cancel / replace / re-present, batches validate / generate / cancel |
| Infrastructure | Prisma stores + DB functions (`*AddUpdate`, cheque lifecycle, new `…Entries` posting functions) | |
| Server adapter | controllers under `/api/bank/...` with `@RequirePermission` | |
| UI | `src/features/treasury/components/*` + pages under `src/app/(app)/bank/*` | |

Categorising a statement line or creating reconciliation adjustments uses the Phase 16 voucher use case, so vouchers keep their numbering, approval routing and audit. When an approval workflow routes the voucher, the line stays "Categorised · awaiting approval" until it is posted.

## 5. API / action contracts
| Method & path | Permission | Notes / errors |
|---|---|---|
| `GET /bank/transactions?account&from&to&status&type&search&page` | bank:view | KPIs (deposits, withdrawals, uncategorised, bank charges) |
| `POST /bank/transactions/:id/categorise` `{category, accountId, costCentreId?}` | bank:create | only UNCATEGORISED statement-sourced lines; creates and posts (or submits) a BPV/BRV |
| `GET /bank/statement-imports?account` · `GET /:id` (with lines) | bank:view | |
| `POST /bank/statement-imports` `{bankAccountId, fileName, layout, lines[]}` | bank:create | CSV parsed and mapped in the browser; server re-validates, computes `dedupeHash` (date + amount + reference + description), skips duplicates, saves the layout for next time; 400 `STATEMENT_EMPTY` |
| `POST /bank/statement-imports/:id/apply-rules` | bank:edit | first matching active rule per line; returns counts |
| `POST /bank/statement-lines/:id/categorise | ignore | restore` | bank:create / bank:edit | |
| `GET /bank/reconciliations?account` · `POST /bank/reconciliations` `{bankAccountId, periodTo, statementBalance, statementImportId?}` | recon:view / recon:create | one open reconciliation per account; period starts after `reconciledTo` |
| `GET /bank/reconciliations/:id` | recon:view | statement lines, book transactions, matches, live summary |
| `POST /:id/match` `{statementLineIds[], transactionIds[]}` · `POST /:id/unmatch` `{matchId}` · `POST /:id/auto-match` · `POST /:id/adjustments` `{statementLineIds[]}` | recon:edit | 400 `RECON_AMOUNT_MISMATCH` (match totals differ beyond 0.00 unless accepted as AMOUNT_DIFFERS) |
| `POST /:id/complete` · `POST /:id/reopen` | recon:post / recon:approve | 409 `RECON_NOT_BALANCED` when difference ≠ 0; closed is read-only; reopen only the latest |
| `GET /bank/cheques?direction&status&pdc&maturing&search&page` · `GET /:id` | bank:view | register KPIs + 10-day maturity calendar |
| `POST /bank/cheques` · `PATCH /:id` (IN_HAND / ISSUED only, not yet posted) | bank:create / bank:edit | issued leaf from an active cheque book of the bank account |
| `POST /bank/cheques/:id/deposit | clear | present | stop | cancel` `{date, bankAccountId?}` | bank:post | 409 `CHEQUE_STATE` for an illegal move |
| `POST /bank/cheques/:id/bounce` `{bounceDate, reason, bankCharges, recoverCharges, creditHold, remarks}` | bank:post | |
| `POST /bank/cheques/:id/re-present` · `POST /:id/replace` `{new cheque}` | bank:post | |
| `GET/POST/PATCH /bank/cheque-batches` · `POST /:id/validate` · `POST /:id/generate` · `POST /:id/cancel` | bank:create / bank:post | generate creates one cheque per valid row; failed rows leave the batch PARTIAL |
| `GET /history/BankCash/<table>/:id` | view permission | |

- **Delete vs deactivate:** draft batches and unposted cheques (IN_HAND with no voucher yet, ISSUED before posting) can be cancelled; nothing posted is deleted. Statement imports with no categorised / matched line can be deleted; otherwise lines are ignored.
- **Concurrency:** rowVersion on every write.
- **Pagination / filters / sort:** server-side for transactions, cheques, statement lines.

**Ledger postings (all via vouchers, so they appear in the GL, history and approval rules):**
| Event | Voucher |
|---|---|
| Cheque received | CRV-type JV: Dr Cheques in hand (CHEQUES_IN_HAND) / Cr customer receivable (customer's account, else AR_CONTROL) — or a chosen account when no party |
| Deposited | no entry (status + bank account only) |
| Cleared (received) | BRV: Dr bank account / Cr Cheques in hand → creates the bank transaction |
| Bounced (received, after clearing) | reverses the clearing voucher; optional bank charges BPV Dr BANK_CHARGES / Cr bank; if "recover from customer" a JV Dr customer / Cr BANK_CHARGES; optional credit hold event |
| Bounced (received, before clearing) | reverses the receipt JV |
| Cheque issued | JV: Dr vendor payable (vendor's account, else AP_CONTROL) / Cr PDC payable |
| Cleared (issued) | BPV: Dr PDC payable / Cr bank |
| Stopped / cancelled (issued) | reverses the issue JV |
| Statement line categorised | BPV (withdrawal) or BRV (deposit) against the chosen account |
| Reconciliation adjustment | same as categorise, for unbooked charges / profit |

## 6. Database changes — `prisma/sql/023-banking.sql` (idempotent, added to `db:sql`)
- `Accounting.voucherPost` hook (or `AFTER UPDATE` trigger on `Vouchers` status → POSTED / REVERSED) that writes `BankTransactions` for every line on a GL account linked to a bank account (source VOUCHER, status UNCLEARED, or CLEARED when it came from a statement line), and marks them reversed when the voucher is reversed.
- `BankCash.chequeReceiveEntries / chequeClearEntries / chequeBounceEntries / chequeIssueEntries / chequeCancelEntries / chequeBatchGenerateEntries` posting functions (the existing lifecycle functions already call them).
- Seed the CHQ / CHB / REC numbering series for every company (backfill + provisioning trigger), like Phase 16's voucher series.
- `bankAccounts.statementLayout` jsonb (saved CSV mapping) — new column.
- Error codes: `CHEQUE_STATE` 409, `CHEQUE_LEAF_USED` 409, `STATEMENT_EMPTY` 400, `STATEMENT_LINE_LOCKED` 409, `RECON_OPEN_EXISTS` 409, `RECON_NOT_BALANCED` 409, `RECON_CLOSED` 409, `RECON_AMOUNT_MISMATCH` 400, `POSTING_ROLE_UNMAPPED` 400 (a required posting role has no account).
- Roadmap: move `BankCash.ChequeAllocations` from Phase 17 to Phase 24 (customer receipts), and note Raast/IBFT invoice matching there.

## 7. Audit (row history)
- **Tables:** all ten already have `triggerAudit`; the generated vouchers and voucher lines are audited by Phase 16.
- **Attribution:** every action runs in `UnitOfWork.run(actorContext(user, meta))`; DB-generated rows (bank transactions from posting) inherit the same transaction context, so they show the posting user.
- **History view:** History tab on the cheque drawer, reconciliation and statement import; registered in `history-tables.ts` (`bank:view`, `recon:view`).

## 8. Ordered tasks
1. SQL 023, Prisma models for the ten tables, registrations (add-update, references, history tables).
2. Shared contracts.
3. Server: bank transactions (generation + list + categorise), statement imports (import, rules, categorise / ignore), reconciliations, cheques + bounces + batches.
4. Pages from templates: Bank Transactions, import panel on Bank Rules, Reconciliation, Cheques, Cheque Register (+ bounce modal), Cheque Voucher (single + bulk).
5. Nav: Bank › Bank Transactions, Receive & Issue Cheques, Cheque Voucher (Bulk), Cheque Register & PDC, Bank Reconciliation.
6. Verification.

## 9. Verification
- **Functional (API suite in Test Co):**
  - voucher posting on a bank account creates a bank transaction; reversal marks it;
  - CSV import with mapping, duplicates skipped on re-import, apply rules, categorise (→ posted BPV/BRV, and pending when a workflow routes it), ignore;
  - reconciliation open → auto-match → manual match / unmatch → adjustments → complete (difference 0) → locked, bank account `reconciledTo` updated; complete with a difference → 409; reopen;
  - cheques: receive (JV), deposit, clear (BRV), bounce after clearing (reversal + charges + recovery JV + credit hold), bounce before clearing, issue (JV) / present / clear (BPV), stop, cancel, replace, re-present; illegal moves → 409; issued leaf from cheque book, duplicates → 409; PDC maturity list;
  - batches: validate rows (bad party / cheque no. / dates / duplicates), generate → cheques, partial;
  - permissions: accountant allowed; auditor view-only; salesman 403;
  - history rows with the real user on all ten tables;
  - trial balance still balances.
- **Visual:** each page vs its template at 1400 light / dark and 390 mobile.

## 10. Acceptance criteria, risks, blockers
- **Acceptance:** all of section 9 passes; deviations listed honestly.
- **Risks:**
  - Bank transactions generated by a voucher trigger touch Phase 16's posting path; the Phase 16 suite will be re-run.
  - Bank charges with FED and withholding on profit are not split now (single account); tax splits come with Phase 28.
  - Template invoice-allocation features are visible but disabled until Phase 24.
- **Blockers:** none. Test Co (from Phase 16) is used for posted data; Demo receives no test postings.

---
**Approve Phase 17 revision 1 for implementation?**
