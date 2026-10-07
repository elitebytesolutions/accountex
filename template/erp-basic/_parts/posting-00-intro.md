# Finsoft ERP — Posting Rules (Basic edition)

How every financial and stock event becomes a journal entry and/or stock movement. Accounts are named by **role** (resolved per tenant through `Company.DefaultAccountMappings` → `Accounting.ChartOfAccounts`; the role catalogue is `Company.PostingRoles`). Account codes shown in brackets are the defaults of the *Trading & Distribution (PK)* COA template and match the journal previews in the prototype.

## 0. Mechanics that apply to every event
1. **Single ledger.** Every posting — manual voucher or system document — is one `Accounting.Vouchers` with ≥ 2 `Accounting.VoucherLines` rows. System postings carry `sourceDocType` + `sourceDocId` back to the document, and the document stores `journalEntryId`.
2. **Balanced on post.** Σ debit = Σ credit > 0; each line has exactly one side > 0; only POSTABLE, ACTIVE accounts allowed for the branch.
3. **Period & lock.** `postingDate` must fall in an OPEN fiscal period (and, in Full, the module must not be locked in `Accounting.PeriodModuleLocks`) and be after `Company.CompanySettings.booksLockDate`.
4. **Immutable.** A POSTED entry and its lines can't change. Corrections are reversals (`reversalOfId`), then re-entry.
5. **Idempotent.** One source document produces at most one live journal (unique on source document); re-posting the same document is a no-op.
6. **Sub-ledgers.** Lines on AR / AP / employee-advance control accounts carry `customerId`, `vendorId` or `employeeId` (at most one), so customer, vendor and staff balances are journal-derived.
7. **Stock.** Quantities move only through `Inventory.StockMovements` (append-only; item × warehouse × bin × batch, base units). Receipts update the item's **moving weighted-average cost**; issues are costed at the current average and picked **FEFO**. `Inventory.StockBalances` is maintained by trigger.
8. **Tax lines.** Output/input GST, further tax, advance tax and WHT post to their own role accounts per `Tax.TaxCodes`.
9. **Numbering.** The document number comes from `Company.getNextDocNo(<doc type>)` (row-locked).

---
