## Bank & Cash (treasury) — Full

**Screens (12).**
- Basic: Bank Accounts, Bank Transactions, Receive & Issue Cheques, Cheque Register & PDC, Bank Book, Cash Book.
- Full only: Cheque Voucher (`app/bank/cheque-voucher`), Bank Reconciliation (`app/bank/reconciliation`), Bank Rules & Import (`app/bank/rules`), Cash Ledger (`app/cash/ledger`), Petty Cash (`app/cash/petty`), Expense Claims (`app/cash/expenses`; same table as ESS `ess/expenses`).

**Tables (27).**
- Basic 11: bank, BankAccounts, CashAccounts, CashCategories†, cheque, ChequeAllocations, ChequeBounces, BankTransactions, CashBookEntries†, CashDayCloses, CashDayCloseDenominations.
- Full-only 16: ChequeBooks, ChequeBatches, ChequeBatchLines, BankStatementImports, BankStatementLines, BankRules, BankRuleConditions, reconciliation, BankReconciliationMatches, ExpenseCategories, PettyCashFunds, PettyCashReplenishments, PettyCashVouchers, ExpenseClaims, ExpenseClaimLines, ExpenseClaimActions.
- † helper tables not in the contract registry.

**Columns Full adds to Basic tables.**
- `CashAccounts.approvalThreshold` (Rs 50,000).
- `Cheques.chequeBookId`, `Cheques.crossedAcPayee`.
- `ChequeBounces.creditHoldEventId`.
- `BankTransactions.statementLineId`, `bankRuleId`, `reconciliationId`.
- `CashBookEntries.employeeId`.

### Features (in addition to Basic)
- **Cheque books.** Leaf range, next leaf, leaf width and default "A/C payee" crossing per bank account; one active book per account.
- **Cheque Voucher.** A single receive / issue voucher (R-CHQ-0001 / I-CHQ-0001) with:
  - old no., posting preview (Dr / Cr) and a printed cheque preview (amount in words, MICR);
  - a bulk sheet mode: common header (type, date, bank, posting mode, old-no rule, remarks prefix);
  - rows typed on screen or uploaded from Excel / CSV (≤ 1,000), validated cell by cell, each generating one voucher.
- **Statement import.** CSV / Excel / MT940 with format detection, period, opening / closing balance and duplicate removal (dedupe hash).
- **Bank rules.** IF conditions (Description / Amount / Reference / Direction with contains, starts with, equals, less / greater than, is; match all / any) THEN account + cost centre, with auto-post. Rules run by priority (first match wins) and count their hits.
- **Raast / IBFT matching.** Credits are matched to open invoices by reference and amount with a confidence score; "Match ≥ 90%" matches in bulk.
- **Bank reconciliation.** Per account and period, statement vs book lines are marked Matched / Unmatched / Suggested / Unpresented / Amount differs.
  - Summary: statement balance − unpresented cheques + deposits in transit = adjusted bank, against book + unbooked credits − unbooked debits = adjusted book.
  - "Create adjustments" books the unbooked items.
  - The reconciliation closes only at zero difference; closing advances the account's "reconciled to" and shows in the history.
- **Cash Ledger.** Every drawer / counter / imprest with:
  - running balance, category chips, voucher-type and amount filters, table / timeline / heatmap views;
  - day close with denominations and ±tolerance, and a 14-day variance trend;
  - a voucher drawer with journal lines, attachments and audit trail.

  Entries ≥ Rs 50,000 and contra JVs need Finance Manager approval.
- **Petty cash (imprest).** Funds per branch with custodian, imprest amount and health (Healthy / Topped up / Low / Critical).
  - Petty vouchers (PC-LHR-0412) record category, paid to and receipt status (Attached / Missing / N/A).
  - A top-up replenishes the listed vouchers from cash or bank in one voucher.
- **Expense claims.** Employees submit claims from ESS: receipt scan with OCR, merchant, category with policy limits (per month / meal / night / trip), cost centre or project, purpose and travel request.
  - Finance reviews lines and receipts, then approves (with exception when over policy) or rejects with a reason and the option to resubmit.
  - Approved claims are paid by bank, cash or with payroll. Tracker: Sent → Manager → Finance → Paid.

### Business rules (in addition to Basic)
- Cheque book: last ≥ first leaf; next leaf within range; issued cheques take the next leaf.
- Bulk rows: 6–8 digit cheque no., due ≥ cheque date, amount > 0. A row is GENERATED exactly when it points at its cheque.
- Rule conditions: allowed operator per field; amounts numeric; direction IN / OUT.
- Reconciliation match: MATCHED / SUGGESTED / AMOUNT_DIFFERS need both a statement line and a book entry. MATCHED needs equal amounts. UNPRESENTED has no statement line.
- Petty voucher: REPLENISHED exactly when linked to a replenishment. ATTACHED exactly when it has receipts. A replenishment pays from exactly one cash or bank account.
- Expense claim:
  - REJECTED exactly when a reason is set; APPROVED / PAID need an approver.
  - PAID needs a payment method (and a payroll run when paid with payroll).
  - Approved amount ≤ claimed. The action trail is append-only.

### Statuses (in addition to Basic)
- Cheque batch: DRAFT → VALIDATED → GENERATED / PARTIAL · CANCELLED.
- Statement import: UPLOADED → PARSED → MATCHED · FAILED.
- Statement line: UNMATCHED → CATEGORISED / MATCHED · IGNORED.
- Reconciliation: IN_PROGRESS → CLOSED → REOPENED.
- Petty fund: HEALTHY, TOPPED_UP, LOW, CRITICAL, CLOSED.
- Petty voucher: UNREPLENISHED → REPLENISHED · VOID.
- Expense claim: DRAFT → PENDING / OVER_POLICY → APPROVED → PAID · REJECTED · WITHDRAWN.

### Integrations
- Bank statement files (Meezan / HBL / UBL / Alfalah CSV-Excel layouts, MT940).
- Raast and IBFT credit references.
- Payroll (reimburse with payroll).
- ESS (claims, notifications).
- Approvals engine (`Company.Approvals`).

### Doc types
CHQ, CHB (cheque batch), PCV (petty cash voucher), EXP (expense claim), REC (reconciliation).
