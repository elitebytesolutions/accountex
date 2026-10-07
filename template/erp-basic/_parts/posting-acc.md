## Accounting (acc) — manual vouchers, opening balances, reversal

All postings land in the single ledger `Accounting.Vouchers` + `Accounting.VoucherLines`. Every entry, manual or system, is checked by trigger `journalEntryGuard` when it becomes POSTED:
- ≥ 2 lines, Σ debit = Σ credit > 0, each line has exactly one side > 0;
- every line account is POSTABLE (level 4), ACTIVE, and allowed for the line's branch;
- `postingDate` falls in a fiscal period with status OPEN (`Accounting.getFiscalPeriodForDate` → `Accounting.assertPostingAllowed`) and is after `Company.CompanySettings.booksLockDate`;
- once POSTED the entry and its lines are frozen; corrections are reversals.

Accounts are referenced by role through `Company.DefaultAccountMappings` (role in brackets) or chosen on the screen.

### Journal voucher (JV)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Free-form journal | any postable account(s) | any postable account(s) | optional `customerId` / `vendorId` per line | balanced by the user; cost centre per line |
| JV with "Auto-reverse on <date>" | as entered | as entered | | a job calls `Accounting.voucherReverse(id, autoReverseOn, 'OTHER')` on that date |

### Cash payment (CPV) / Bank payment (BPV)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Pay expense / supplier / liability / asset | each entered line (expense, AP control, liability, asset) | cash account (CPV) or bank account (BPV) = Σ lines — auto contra line (`isAutoContra`) | `vendorId` on AP lines | header `cashBankAccountId`; BPV records instrument (Cheque / IBFT / Pay order / RTGS), cheque no & date |
| WHT deducted on a bank payment | AP / expense (gross) | bank (net) + WHT payable u/s 153 (separate line) | vendor | "WHT u/s 153 … should be posted as a separate line" |

### Cash receipt (CRV) / Bank receipt (BRV)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Receive income / customer / liability / equity / asset | cash (CRV) or bank (BRV) = Σ lines — auto contra line | each entered line (income, AR control, liability, equity, asset) | `customerId` on AR lines | BRV instrument: Cheque deposit / IBFT / Cash deposit |

### Contra (CON)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Cash deposited to bank / bank-to-bank transfer / withdrawal | receiving cash or bank account | paying cash or bank account | — | lines limited to CASH / BANK sub-type accounts |

### Opening balances (OB)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Post opening balances (`Accounting.openingBalancePost`) | every debit line of `Accounting.OpeningBalanceLines` | every credit line | optional customer / vendor on control accounts | one OB journal dated `asAtDate` (01 Jul) |
| Out-of-balance difference | suspense (OB_SUSPENSE, e.g. 3900-01) when credits > debits | suspense when debits > credits | — | difference = `OpeningBalances.difference` |
| Account created with an opening balance | added as a draft line of the FY batch on its normal side | | | "Posted on 01 Jul 2026 against Opening Balance Equity" |

### Reversal (any posted entry)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Reverse voucher (`Accounting.voucherReverse`) | every original credit line | every original debit line | same parties, cost centres, branches | new voucher of the same type (SYSTEM/OB → JV) dated the reversal date, `reversalOfId` + reason; original → REVERSED with `reversedById`; both stay in the register |

### System postings from other modules
Other modules create entries with `voucherType = 'SYSTEM'` (or `JV` when the screen shows a JV number, e.g. payroll accrual, depreciation) and `sourceDocType / sourceDocId / sourceDocNo`; the same guard applies. Their Dr/Cr are documented in each module's section. Module period locks (Full) use `Accounting.getModuleForDocumentType(sourceDocType)`.

Stock effect: none for any accounting voucher.
