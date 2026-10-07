## Accounting (acc)

**Screens.** Chart of Accounts · Account Ledger · Opening Balances · Voucher Register · New Voucher · Voucher Detail · Fiscal Years & Periods · financial reports (TB, P&L, Balance Sheet, General Ledger, Day Book, Reports Centre — views only).

**Features.**
- **Chart of accounts**: 4 levels — class (`1000`), header (`1100`), group (`1120`), postable (`1120-01`); classes 1 Assets (Dr), 2 Liabilities (Cr), 3 Equity (Cr), 4 Income (Cr), 5 Expenses (Dr). Codes are auto-suggested under the parent and immutable. Account type (sub-type) per class: Cash, Bank, Receivable, Inventory, Prepayment, Fixed asset, Deposit · Payable, Accrual, Tax, Statutory, Borrowing · Capital, Reserve, Drawings · Sales, Other income, Finance income · Cost of sales, Employee cost, Premises, Depreciation, General expense, Finance cost, Taxation. Nature defaults from the class but can be flipped for contra accounts. Optional branch restriction. Tree, map view, inspector, bulk activate/deactivate/move/delete.
- **Single ledger**: one journal for every manual voucher type (JV, CPV, CRV, BPV, BRV, Contra, Opening) and every system posting from sales, purchases, inventory, treasury and tax. Lines carry account, particulars, cost centre, branch and an optional customer/vendor sub-ledger party.
- **Voucher entry**: one-sided cash/bank vouchers add the cash/bank leg automatically; instrument type, cheque no/date and payee for bank vouchers; department, reference, prepared/approved by, tags, comments, attachments; JV auto-reverse date; 300-character narration.
- **Numbering**: `JV-2026-000045` tenant-wide or branch cash series `CPV-LHR-0621`, from `Company.NumberingSeries` (row-locked, never MAX+1).
- **Opening balances**: opening trial balance per fiscal year with CSV import (replace / add / skip), difference parked in a suspense account, posted as one OB journal.
- **Fiscal periods**: fiscal years (default 01 Jul – 30 Jun, label `FY 2026-27`) with 12 monthly periods (`SEP-2026`) and an optional P13 adjustment period; periods OPEN → CLOSED → LOCKED; no overlaps.
- **Cost centres**: simple hierarchy (`CC-110`) tagged on lines.

**Key business rules.**
- Only postable, active accounts take entries; header/group balances are roll-ups.
- A voucher posts only when balanced with ≥ 2 lines, in an OPEN period, after the company books lock date.
- Posted vouchers are immutable; a reversal posts a mirror voucher and marks the original REVERSED (reasons: incorrect amount, wrong account, duplicate entry, wrong period, other).
- A period cannot close while draft or pending vouchers are dated in it.
- An account cannot be deleted while it has sub-accounts or postings; it can be deactivated.

**Statuses.** Voucher DRAFT → PENDING_APPROVAL → POSTED → REVERSED · Opening batch DRAFT → POSTED · Period OPEN / CLOSED / LOCKED · Year OPEN / CLOSED (+ locked) · Account ACTIVE / INACTIVE.

**Not in Basic** (Full): cost-centre owners/budgets, projects, allocation rules, recurring templates, module-level period locks, audited reopen requests, year-end close wizard, budgets and budget vs actual, saved ledger views, voucher activity log and multi-step approvals, cash flow statement, Report Studio.
