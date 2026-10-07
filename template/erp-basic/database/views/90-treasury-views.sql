-- =============================================================================
-- Finsoft ERP (BASIC) — views/90-treasury-views.sql
-- Report views for Bank & Cash (entities/04-bank-cash.md).
--
-- Install order: 00 → 14 schema → fk/* → 90-views (this file) → 91-rls.
-- Every view is  security_invoker = true,  so the caller's RLS policy
-- (tenantId = Company.getCurrentTenantId()) applies to every base table read.
-- Joins between tenant tables still match on tenantId (composite keys).
--
-- Money truth is the journal: a voucher counts when Accounting.Vouchers.status
-- is POSTED or REVERSED (a reversed voucher stays in the ledger and its mirror
-- voucher, itself POSTED, cancels it). DRAFT / PENDING_APPROVAL vouchers never
-- move a balance.
--
-- Views
--   BankCash.getBankAccountBalances   app/bank/accounts (book balance, KPIs)
--   BankCash.getBankBook              app/bank/book (running balance)
--   BankCash.getCashBook              app/cash/book (running balance)
--   BankCash.getChequeRegister        app/bank/cheque-register, app/bank/cheques
--   BankCash.getPdcMaturity           app/bank/cheque-register (PDC maturity calendar)
-- Helper functions (date ranges)
--   BankCash.getBankAccountBalanceOn(bankAccountId, date)   opening / closing of a range
--   BankCash.getCashAccountBalanceOn(cashAccountId, date)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- BankCash.getBankAccountBalances — one row per bank account.
-- bookBalance = GL balance (Σ debit − credit of posted journal lines on
-- BankAccounts.accountId; opening balances arrive through the OB journal).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "BankCash"."getBankAccountBalances"
WITH (security_invoker = true) AS
SELECT
  ba."tenantId",
  ba.id                                   AS "bankAccountId",
  ba."bankId",
  b.code                                  AS "bankCode",
  b.name                                  AS "bankName",
  b."shortName"                            AS "bankShortName",
  ba."accountType",
  ba."accountTitle",
  ba."accountNo",
  ba."accountLast4",
  ba.iban,
  ba."bankBranch",
  ba."branchId",
  br.name                                 AS "branchName",
  ba."accountId",
  a.code                                  AS "glCode",
  a.name                                  AS "glName",
  ba."currencyCode",
  ba.purpose,
  ba."creditLimit",
  ba.status,
  COALESCE(gl."bookBalance", 0)            AS "bookBalance",
  -- running finance: undrawn limit; other accounts: the book balance
  CASE WHEN ba."accountType" = 'RUNNING_FINANCE'
       THEN ba."creditLimit" + COALESCE(gl."bookBalance", 0)
       ELSE COALESCE(gl."bookBalance", 0) END AS "availableBalance",
  COALESCE(gl."mtdDeposits", 0)            AS "mtdDeposits",
  COALESCE(gl."mtdWithdrawals", 0)         AS "mtdWithdrawals",
  gl."lastTxnDate",
  ba."lastStatementBalance"               AS "statementBalance",
  ba."lastStatementDate",
  ba."lastStatementBalance" - COALESCE(gl."bookBalance", 0) AS "statementDifference",
  ba."reconciledTo",
  COALESCE(oi."openItemsCount", 0)        AS "openItemsCount",
  COALESCE(oi."uncategorisedCount", 0)     AS "uncategorisedCount",
  oi."oldestOpenItemDate"
FROM "BankCash"."BankAccounts" ba
JOIN "BankCash"."Banks" b
  ON b."tenantId" = ba."tenantId" AND b.id = ba."bankId"
JOIN "Company"."Branches" br
  ON br."tenantId" = ba."tenantId" AND br.id = ba."branchId"
JOIN "Accounting"."ChartOfAccounts" a
  ON a."tenantId" = ba."tenantId" AND a.id = ba."accountId"
LEFT JOIN LATERAL (
  SELECT sum(jl.debit - jl.credit) AS "bookBalance",
         sum(jl.debit)  FILTER (WHERE je."postingDate" >= date_trunc('month', current_date)::date
                                  AND je."postingDate" <= current_date) AS "mtdDeposits",
         sum(jl.credit) FILTER (WHERE je."postingDate" >= date_trunc('month', current_date)::date
                                  AND je."postingDate" <= current_date) AS "mtdWithdrawals",
         max(je."postingDate") AS "lastTxnDate"
    FROM "Accounting"."VoucherLines" jl
    JOIN "Accounting"."Vouchers" je
      ON je."tenantId" = jl."tenantId" AND je.id = jl."journalEntryId"
   WHERE jl."tenantId" = ba."tenantId"
     AND jl."accountId" = ba."accountId"
     AND je.status IN ('POSTED','REVERSED')
) gl ON true
LEFT JOIN LATERAL (
  SELECT count(*)                                            AS "openItemsCount",
         count(*) FILTER (WHERE t.status = 'UNCATEGORISED')  AS "uncategorisedCount",
         min(t."txnDate")                                     AS "oldestOpenItemDate"
    FROM "BankCash"."BankTransactions" t
   WHERE t."tenantId" = ba."tenantId"
     AND t."bankAccountId" = ba.id
     AND t.status <> 'RECONCILED'
     AND (ba."reconciledTo" IS NULL OR t."txnDate" > ba."reconciledTo")
) oi ON true
WHERE ba."deletedAt" IS NULL;

COMMENT ON VIEW "BankCash"."getBankAccountBalances" IS
  'Bank account card/table figures: GL book balance, month-to-date deposits/withdrawals, statement balance and difference, open (unreconciled) items. Screens: app/bank/accounts (cards, table, KPIs), app/bank/book (Statement vs Book balance).';

-- ---------------------------------------------------------------------------
-- BankCash.getBankBook — one row per posted journal line on a bank account's
-- GL account, with running balance per bank account. The bank-side line
-- (BankCash.BankTransactions of the same voucher) supplies status, reference,
-- value date and kind. Imported statement lines that are not yet booked
-- (UNCATEGORISED) are not in the book; count them from BankTransactions.
-- runningBalance includes every earlier row of the account, so filtering a
-- date range keeps correct balances: opening = first row's openingBalance,
-- closing = last row's runningBalance (or BankCash.getBankAccountBalanceOn()).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "BankCash"."getBankBook"
WITH (security_invoker = true) AS
SELECT
  ba."tenantId",
  ba.id                                   AS "bankAccountId",
  ba."accountId",
  b.name                                  AS "bankName",
  ba."accountTitle",
  ba."accountNo",
  ba."accountLast4",
  ba.purpose,
  ba."currencyCode",
  je.id                                   AS "journalEntryId",
  jl.id                                   AS "journalLineId",
  jl."lineNo",
  je."docNo"                               AS "voucherNo",
  je."voucherType",
  je.status                               AS "voucherStatus",
  je."postingDate"                         AS "txnDate",
  COALESCE(bt."valueDate", je."postingDate") AS "valueDate",
  je."branchId",
  COALESCE(bt.description, jl.particulars, je.narration) AS description,
  COALESCE(bt.detail, je."partyName")      AS detail,
  COALESCE(bt.reference, je."instrumentNo", je."referenceNo") AS reference,
  je."instrumentType",
  je."sourceDocType",
  je."sourceDocNo",
  bt.id                                   AS "bankTransactionId",
  bt.category,
  bt."paymentMode",
  bt."chequeId",
  CASE
    WHEN bt.category = 'BANK_CHARGES'                                 THEN 'CHARGES'
    WHEN bt.category = 'TAX_PAYMENT'                                  THEN 'TAX'
    WHEN bt.category = 'LOAN'                                         THEN 'LOAN'
    WHEN bt."paymentMode" = 'ATM' OR bt.category = 'CASH_WITHDRAWAL'   THEN 'ATM'
    WHEN bt.category = 'TRANSFER' OR je."voucherType" = 'CON'          THEN 'TRANSFER'
    WHEN bt."paymentMode" = 'CHEQUE' OR bt."chequeId" IS NOT NULL
         OR je."instrumentType" IN ('CHEQUE','CHEQUE_DEPOSIT')         THEN 'CHEQUE'
    WHEN bt.category = 'CUSTOMER_RECEIPT'                             THEN 'RECEIPT'
    WHEN jl.debit > 0                                                 THEN 'DEPOSIT'
    ELSE 'PAYMENT'
  END                                     AS kind,
  jl.debit                                AS deposit,
  jl.credit                               AS withdrawal,
  COALESCE(bt.status, 'PENDING')          AS status,          -- no bank-side line yet = awaiting bank
  (bt.id IS NOT NULL)                     AS "hasBankLine",
  bt."clearedOn",
  bt."reconciledOn",
  sum(jl.debit - jl.credit) OVER w - (jl.debit - jl.credit) AS "openingBalance",   -- balance before this row
  sum(jl.debit - jl.credit) OVER w                          AS "runningBalance"
FROM "BankCash"."BankAccounts" ba
JOIN "BankCash"."Banks" b
  ON b."tenantId" = ba."tenantId" AND b.id = ba."bankId"
JOIN "Accounting"."VoucherLines" jl
  ON jl."tenantId" = ba."tenantId" AND jl."accountId" = ba."accountId"
JOIN "Accounting"."Vouchers" je
  ON je."tenantId" = jl."tenantId" AND je.id = jl."journalEntryId"
 AND je.status IN ('POSTED','REVERSED')
LEFT JOIN LATERAL (
  SELECT t.id, t."valueDate", t.description, t.detail, t.reference, t.category, t."paymentMode",
         t."chequeId", t.status, t."clearedOn", t."reconciledOn"
    FROM "BankCash"."BankTransactions" t
   WHERE t."tenantId" = jl."tenantId"
     AND t."bankAccountId" = ba.id
     AND t."journalEntryId" = je.id
   ORDER BY (t."depositAmount" = jl.debit AND t."withdrawalAmount" = jl.credit) DESC, t."createdAt"
   LIMIT 1
) bt ON true
WINDOW w AS (PARTITION BY ba."tenantId", ba.id
             ORDER BY je."postingDate", je."postedAt", je."docNo", jl."lineNo"
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW);

COMMENT ON VIEW "BankCash"."getBankBook" IS
  'Bank ledger per bank account from posted journal lines on its GL account, with bank-side status/reference and running balance (openingBalance = balance before the row). Screen: app/bank/book (KPIs Opening/Withdrawals/Deposits/Closing, rows, Cleared/Uncleared/Pending).';

-- ---------------------------------------------------------------------------
-- BankCash.getCashBook — one row per journal line on a cash account's GL
-- account. DRAFT / PENDING_APPROVAL vouchers are listed (the screen shows a
-- "Draft" status) but add 0 to runningBalance; only POSTED / REVERSED
-- vouchers move the balance. Quick-entry metadata from CashBookEntries.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "BankCash"."getCashBook"
WITH (security_invoker = true) AS
SELECT
  ca."tenantId",
  ca.id                                   AS "cashAccountId",
  ca.code                                 AS "cashAccountCode",
  ca.name                                 AS "cashAccountName",
  ca."shortName"                           AS "cashAccountShortName",
  ca.kind                                 AS "cashAccountKind",
  ca."branchId",
  ca."accountId",
  ca."imprestAmount",
  je.id                                   AS "journalEntryId",
  jl.id                                   AS "journalLineId",
  jl."lineNo",
  je."docNo"                               AS "voucherNo",
  je."voucherType",
  je.status                               AS "voucherStatus",
  (je.status IN ('POSTED','REVERSED'))    AS "isPosted",
  je."postingDate"                         AS "entryDate",
  ce."entryTime",
  ce.id                                   AS "cashbookEntryId",
  ce."entryKind",
  COALESCE(ce."partyName", je."partyName")  AS "partyName",
  COALESCE(ce."customerId", jl."customerId") AS "customerId",
  COALESCE(ce."vendorId", jl."vendorId")    AS "vendorId",
  ce."categoryId",
  cc.code                                 AS "categoryCode",
  cc.name                                 AS "categoryName",
  ce."paymentMode",
  COALESCE(ce."referenceNo", je."referenceNo") AS "referenceNo",
  ce."chequeId",
  COALESCE(ce.narration, jl.particulars, je.narration) AS narration,
  ct."accountId"                           AS "contraAccountId",
  ct.code                                 AS "contraAccountCode",
  ct.name                                 AS "contraAccountName",
  jl.debit                                AS "receiptAmount",
  jl.credit                               AS "paymentAmount",
  je."preparedByUserId",
  je."approvedByUserId",
  je."reversalOfId",
  je."reversedById",
  sum(CASE WHEN je.status IN ('POSTED','REVERSED') THEN jl.debit - jl.credit ELSE 0 END) OVER w
    - CASE WHEN je.status IN ('POSTED','REVERSED') THEN jl.debit - jl.credit ELSE 0 END AS "openingBalance",
  sum(CASE WHEN je.status IN ('POSTED','REVERSED') THEN jl.debit - jl.credit ELSE 0 END) OVER w AS "runningBalance"
FROM "BankCash"."CashAccounts" ca
JOIN "Accounting"."VoucherLines" jl
  ON jl."tenantId" = ca."tenantId" AND jl."accountId" = ca."accountId"
JOIN "Accounting"."Vouchers" je
  ON je."tenantId" = jl."tenantId" AND je.id = jl."journalEntryId"
LEFT JOIN "BankCash"."CashBookEntries" ce
  ON ce."tenantId" = je."tenantId" AND ce."journalEntryId" = je.id
LEFT JOIN "BankCash"."CashCategories" cc
  ON cc."tenantId" = ce."tenantId" AND cc.id = ce."categoryId"
LEFT JOIN LATERAL (
  SELECT o."accountId", a.code, a.name
    FROM "Accounting"."VoucherLines" o
    JOIN "Accounting"."ChartOfAccounts" a ON a."tenantId" = o."tenantId" AND a.id = o."accountId"
   WHERE o."tenantId" = je."tenantId"
     AND o."journalEntryId" = je.id
     AND o."accountId" <> ca."accountId"
   ORDER BY (o.debit + o.credit) DESC, o."lineNo"
   LIMIT 1
) ct ON true
WINDOW w AS (PARTITION BY ca."tenantId", ca.id
             ORDER BY je."postingDate", ce."entryTime" NULLS LAST, COALESCE(je."postedAt", je."createdAt"),
                      je."docNo", jl."lineNo"
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW);

COMMENT ON VIEW "BankCash"."getCashBook" IS
  'Cash ledger per cash account (drawer / counter / petty / imprest) from journal lines on its GL account, with quick-entry category, time, party, contra account and running balance (posted vouchers only; drafts listed with is_posted = false). Screen: app/cash/book (Cash Ledger list, KPIs, Today at a glance, available-balance check).';

-- ---------------------------------------------------------------------------
-- BankCash.getChequeRegister — every cheque with maturity days, bounce data
-- and the bank route "HBL → Meezan 0123".
-- is_pending_clearance: still awaiting clearing (counts in PDC / clearing KPIs).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "BankCash"."getChequeRegister"
WITH (security_invoker = true) AS
SELECT
  c."tenantId",
  c.id                                    AS "chequeId",
  c."docNo",
  c."legacyNo",
  c."docDate",
  c."branchId",
  br.name                                 AS "branchName",
  c.direction,
  c."chequeNo",
  c."isPdc",
  c."postingMode",
  c."customerId",
  c."vendorId",
  c."accountId",
  c."partyName",
  c."drawnOnBankId",
  db.name                                 AS "drawnOnBankName",
  c."bankAccountId",
  ba."accountTitle"                        AS "bankAccountTitle",
  ba."accountLast4"                        AS "bankAccountLast4",
  ab.name                                 AS "bankAccountBankName",
  concat_ws(' → ',
            COALESCE(db."shortName", db.name),
            CASE WHEN ba.id IS NOT NULL
                 THEN COALESCE(ab."shortName", ab.name) || ' ' || ba."accountLast4" END) AS "bankRoute",
  c."chequeDate",
  c."dueDate",
  c."receivedOn",
  c.amount,
  c."currencyCode",
  CASE WHEN c.direction = 'RECEIVED' THEN c.amount ELSE -c.amount END AS "signedAmount",
  c.status,
  (c.status IN ('IN_HAND','DEPOSITED','ISSUED','PRESENTED')) AS "isPendingClearance",
  (c."chequeDate" - current_date)          AS "daysToMaturity",
  c."depositedOn",
  c."presentedOn",
  c."clearedOn",
  c."bouncedOn",
  c."bounceCount",
  lb."bounceDate"                          AS "lastBounceDate",
  lb.reason                               AS "lastBounceReason",
  lb."bankCharges"                         AS "lastBounceCharges",
  lb.resolution                           AS "lastBounceResolution",
  c."stoppedOn",
  c."replacedByChequeId",
  c."journalEntryId",
  c."clearingJournalEntryId",
  c.remarks
FROM "BankCash"."Cheques" c
JOIN "Company"."Branches" br
  ON br."tenantId" = c."tenantId" AND br.id = c."branchId"
LEFT JOIN "BankCash"."Banks" db
  ON db."tenantId" = c."tenantId" AND db.id = c."drawnOnBankId"
LEFT JOIN "BankCash"."BankAccounts" ba
  ON ba."tenantId" = c."tenantId" AND ba.id = c."bankAccountId"
LEFT JOIN "BankCash"."Banks" ab
  ON ab."tenantId" = ba."tenantId" AND ab.id = ba."bankId"
LEFT JOIN LATERAL (
  SELECT x."bounceDate", x.reason, x."bankCharges", x.resolution
    FROM "BankCash"."ChequeBounces" x
   WHERE x."tenantId" = c."tenantId" AND x."chequeId" = c.id
   ORDER BY x."bounceDate" DESC, x."createdAt" DESC
   LIMIT 1
) lb ON true;

COMMENT ON VIEW "BankCash"."getChequeRegister" IS
  'Cheque lifecycle register (received and issued, incl. PDC): bank route, days_to_maturity (chequeDate − today), bounceCount and latest bounce. Screens: app/bank/cheque-register (table, chips, KPIs), app/bank/cheques (Received / Issued tables).';

-- ---------------------------------------------------------------------------
-- BankCash.getPdcMaturity — cheques still awaiting clearance that are
-- post-dated (isPdc, or dated after receipt / voucher date), bucketed by
-- maturity. Received = + receivable, issued = − payable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "BankCash"."getPdcMaturity"
WITH (security_invoker = true) AS
SELECT
  c."tenantId",
  c.id                                    AS "chequeId",
  c."docNo",
  c.direction,
  c."chequeNo",
  c."isPdc",
  c.status,
  c."branchId",
  c."customerId",
  c."vendorId",
  c."partyName",
  c."drawnOnBankId",
  c."bankAccountId",
  c."chequeDate"                           AS "maturityDate",
  (c."chequeDate" - current_date)          AS "daysToMaturity",
  CASE
    WHEN c."chequeDate" <  current_date      THEN 'OVERDUE'
    WHEN c."chequeDate" =  current_date      THEN 'TODAY'
    WHEN c."chequeDate" <= current_date + 7  THEN 'NEXT_7_DAYS'
    WHEN c."chequeDate" <= current_date + 30 THEN 'NEXT_30_DAYS'
    ELSE 'LATER'
  END                                     AS "maturityBucket",
  c.amount,
  CASE WHEN c.direction = 'RECEIVED' THEN c.amount ELSE 0 END AS "receivableAmount",
  CASE WHEN c.direction = 'ISSUED'   THEN c.amount ELSE 0 END AS "payableAmount",
  CASE WHEN c.direction = 'RECEIVED' THEN c.amount ELSE -c.amount END AS "signedAmount",
  (c.status IN ('DEPOSITED','PRESENTED')) AS "isInClearing"
FROM "BankCash"."Cheques" c
WHERE c.status IN ('IN_HAND','DEPOSITED','ISSUED','PRESENTED')
  AND (c."isPdc" OR c."chequeDate" > COALESCE(c."receivedOn", c."docDate"));

COMMENT ON VIEW "BankCash"."getPdcMaturity" IS
  'Open post-dated cheques by maturity (OVERDUE / TODAY / NEXT_7_DAYS / NEXT_30_DAYS / LATER) with + receivable / − payable amounts. Screen: app/bank/cheque-register ("Maturity" filter, maturity calendar, KPIs PDC receivable / PDC payable / Maturing today / In clearing).';

-- ---------------------------------------------------------------------------
-- Date-range helpers: GL balance of a bank / cash account at the end of a
-- date (posted vouchers only). Opening of a range = balance_on(from − 1).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "BankCash"."getBankAccountBalanceOn"("pBankAccountId" uuid, "pDate" date)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(jl.debit - jl.credit), 0)
    FROM "BankCash"."BankAccounts" ba
    JOIN "Accounting"."VoucherLines" jl
      ON jl."tenantId" = ba."tenantId" AND jl."accountId" = ba."accountId"
    JOIN "Accounting"."Vouchers" je
      ON je."tenantId" = jl."tenantId" AND je.id = jl."journalEntryId"
   WHERE ba."tenantId" = "Company"."getCurrentTenantId"()
     AND ba.id = "pBankAccountId"
     AND je.status IN ('POSTED','REVERSED')
     AND je."postingDate" <= "pDate"
$$;
COMMENT ON FUNCTION "BankCash"."getBankAccountBalanceOn"(uuid, date) IS
  'GL (book) balance of a bank account at the end of pDate. Opening of a Bank Book range = bank_balance_on(id, from - 1). Screen: app/bank/book.';

CREATE OR REPLACE FUNCTION "BankCash"."getCashAccountBalanceOn"("pCashAccountId" uuid, "pDate" date)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(jl.debit - jl.credit), 0)
    FROM "BankCash"."CashAccounts" ca
    JOIN "Accounting"."VoucherLines" jl
      ON jl."tenantId" = ca."tenantId" AND jl."accountId" = ca."accountId"
    JOIN "Accounting"."Vouchers" je
      ON je."tenantId" = jl."tenantId" AND je.id = jl."journalEntryId"
   WHERE ca."tenantId" = "Company"."getCurrentTenantId"()
     AND ca.id = "pCashAccountId"
     AND je.status IN ('POSTED','REVERSED')
     AND je."postingDate" <= "pDate"
$$;
COMMENT ON FUNCTION "BankCash"."getCashAccountBalanceOn"(uuid, date) IS
  'GL balance of a cash account at the end of pDate (posted vouchers). Opening of a Cash Book range; day-close book balance. Screen: app/cash/book.';
