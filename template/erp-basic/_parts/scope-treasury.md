## Bank & Cash (treasury) — Basic

**Screens (6).** Bank Accounts (`app/bank/accounts`), Bank Transactions (`app/bank/transactions`), Receive & Issue Cheques (`app/bank/cheques`), Cheque Register & PDC (`app/bank/cheque-register`), Bank Book (`app/bank/book`), Cash Book (`app/cash/book`).

**Tables (11).** `BankCash.Banks`, `BankAccounts`, `CashAccounts`, `CashCategories`†, `cheque`, `ChequeAllocations`, `ChequeBounces`*, `BankTransactions`, `CashBookEntries`†, `CashDayCloses`*, `CashDayCloseDenominations`*.
† helper table not in the contract registry. * registry lists it as Full; it is in Basic because a Basic screen uses it (bounce modal, Cash Count / close day).

### Features
- **Bank accounts.** Our accounts at Meezan, HBL, UBL, Bank Alfalah, Bank Al Habib, MCB, Allied and others. Each has a type (Current, Savings / PLS, Running finance with limit, Foreign currency), a title, an account number, an IBAN, a bank branch, an owning branch and an opening balance. Each is linked 1:1 to a GL account under 1120. A purpose tag (Primary, Collections, Vendor payments, Payroll) and a payroll-disbursement flag are kept. Statement import is enabled per account, with a CSV / Excel / MT940 format.
- **Book vs statement.** Book balance comes from the GL. Statement balance and "reconciled to" are kept on the account and drive the open-items badge.
- **Bank transactions.** Each bank voucher leg and each imported statement line is a `BankTransactions` with a mode (Cash, Card, IBFT, RAAST, Bank transfer, Debit card, Cheque). Unbooked statement lines can be categorised as Bank charges, Profit on deposit, Markup expense, Customer receipt or Vendor payment; categorising posts the voucher.
- **Cheques.** Received and issued cheques, including post-dated ones. Each cheque carries:
  - the cheque no., party, drawee bank and deposit / issue account;
  - the cheque, due and received dates and the amount;
  - a PDC flag and a posting mode (Deposit, Hold as PDC, Clear on deposit);
  - allocation against invoices or bills.

  Lifecycle actions: Deposit, Clear, Bounce (reason, bank charges, recovery from customer, notify owner, credit hold), Re-present, Replace, Stop and Reverse. A PDC maturity calendar and register show the cheques due.
- **Cash Book quick entry.** Cash In / Cash Out, Bank Only, Transfer and Cheque modes post CRV / CPV / BRV / BPV / contra JV in one step. Each entry records:
  - date and time;
  - party (free text or picked customer / vendor);
  - category (with a default contra account);
  - payment mode, reference, narration and an attachment.
- **Daily cash count.** Count the denominations (5,000 … 10, plus coins), compare with the book balance and close the day. Any variance posts to Cash over / short, and a locked day is read-only.
- **Books.** The Cash Book and Bank Book are running-balance views over the journal.

### Business rules
- Every bank and cash account maps to exactly one GL account. Money truth is always `Accounting.VoucherLines`.
- A received cheque is unique per drawee bank + cheque no. + customer. An issued leaf is unique per bank account.
- Cheque status follows its direction and only moves along the allowed transitions (trigger `triggerChequeStatusGuard`). Each status requires its date (depositedOn, clearedOn, bouncedOn, stoppedOn).
- Issued cheques require the issuing bank account. A HOLD_PDC posting mode requires the PDC flag.
- A bank line has exactly one of deposit / withdrawal. An UNCATEGORISED line has no voucher; every other status has one.
- Transfers need different from / to accounts. The payment mode must fit the entry kind (cash: Cash/Card; bank: IBFT/RAAST/Bank transfer/Debit card; cheque: Cheque).
- A day close is unique per cash account and date. A LOCKED close with a variance must have its variance JV, and it can only be reopened, not edited.
- One PRIMARY bank account per tenant. Running finance accounts need a limit.

### Statuses
- Cheque (received): IN_HAND → DEPOSITED → CLEARED; BOUNCED; CANCELLED; REPLACED.
- Cheque (issued): ISSUED → PRESENTED → CLEARED; BOUNCED; STOPPED; CANCELLED; REPLACED.
- Bank transaction: UNCATEGORISED, PENDING, UNPRESENTED, UNCLEARED, CLEARED, RECONCILED.
- Cash day close: COUNTED → LOCKED → REOPENED.
- Bank account: ACTIVE, DORMANT, CLOSED.

### Integrations
Bank statement files (bank CSV, Excel, MT940); Raast / IBFT references in descriptions.

### Doc types
CHQ (cheque voucher). Cash-book vouchers use the accounting types CRV / CPV / BRV / BPV / CON / JV.
