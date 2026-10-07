-- =============================================================================
-- Finsoft ERP (BASIC) — 04-treasury.sql
-- Bank and cash: bank master, bank accounts, bank transactions, cash accounts,
-- cheques (received / issued, PDC), cheque allocation and bounce, the quick
-- cash-book entry header and the daily cash count / day close.
--
-- Screens (all in the Basic scope):
--   app/bank/accounts         src/40-acc-core.html  "Bank Accounts" + "Add bank account" modal
--   app/bank/transactions     src/40-acc-core.html  "Bank Transactions" + "Import bank statement" modal
--   app/bank/cheques          src/40-acc-core.html  "Receive & Issue Cheques" + "Record cheque" panel
--   app/bank/cheque-register  src/40-acc-core.html  "Cheque Register & PDC" + "Mark cheque as bounced" modal
--   app/bank/book             src/47-books.html + src/98-books.js (BANK BOOK engine)
--   app/cash/book             src/47-books.html + src/98-books.js (CASH BOOK engine: Cash In/Out,
--                             Bank Only, Transfer, Cheque quick entry; Cash Count + close day)
--   seed data                 src/91-data.js  banks[] (1120-01..04), cashAccounts[] (1110-01..04)
--
-- Money truth lives in Accounting.Vouchers / Accounting.VoucherLines (single ledger).
-- The Cash Book and Bank Book screens are VIEWS over the journal
-- (BankCash.getCashBook / BankCash.getBankBook in 90-views.sql). The tables
-- below hold what the journal cannot: bank/cheque master data, statement-side
-- bank lines, cheque lifecycle, and the quick-entry metadata (category,
-- payment mode, time, party text) the cash book captures per voucher.
--
-- Cross-module FKs (acc.*, sales.*, purchase.*) are added in
-- database/fk/04-treasury-fks.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- bank — bank master (the institution, not our account).
-- Screens: app/bank/accounts "Add bank account" → Bank * select (Bank Al Habib,
-- MCB Bank, Allied Bank, Faysal Bank, Standard Chartered); app/bank/cheques
-- "Drawn on bank" (HBL, MCB Bank, Meezan Bank, UBL, Allied Bank);
-- src/98-books.js DRAWN[] (… Bank Alfalah, Faysal Bank, Bank Al Habib,
-- Standard Chartered). Also used as the drawee bank of customers' cheques.
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."Banks" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code             text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,19}$'),   -- MEEZAN, HBL, UBL, ALFALAH, BAHL, MCB, ABL
  name             text NOT NULL,                                          -- Meezan Bank
  "shortName"       text,                                                   -- Meezan
  "swiftBic"        text CHECK ("swiftBic" IS NULL OR "swiftBic" ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
  "ibanBankCode"   char(4) CHECK ("ibanBankCode" IS NULL OR "ibanBankCode" ~ '^[A-Z]{4}$'),  -- MEZN (PK36MEZN…)
  "isIslamic"       boolean NOT NULL DEFAULT false,                         -- Meezan: PLS profit, not interest
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."Banks"');
CREATE INDEX "bankTenantNameIdx" ON "BankCash"."Banks" ("tenantId", name) WHERE "deletedAt" IS NULL;
COMMENT ON TABLE "BankCash"."Banks" IS
  'Bank master (Meezan, HBL, UBL, Bank Alfalah, Bank Al Habib, MCB, Allied …). Our accounts and the drawee bank of received cheques point here. Screens: app/bank/accounts, app/bank/cheques.';

-- ---------------------------------------------------------------------------
-- BankAccounts — one of our accounts at a bank, linked 1:1 to a GL account
-- under 1120 Banks.
-- Screens: app/bank/accounts (cards + "All bank accounts" table: Bank, Account
-- title, Account no., GL code, Branch, Book balance, Statement balance,
-- Reconciled to, Status) and the "Add bank account" modal (Bank, Account type,
-- Account title, Account number, IBAN, Bank branch, GL code, Opening balance,
-- Enable statement import (CSV / MT940), Use for payroll disbursement).
-- Card badges: Primary / Running finance (Limit Rs 50,000,000) / Vendor
-- payments / Payroll. Bank Book labels: "HBL - Main Account", "UBL - Collections".
-- Book balance = GL balance (view); statement balance = last imported statement.
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."BankAccounts" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "bankId"                uuid NOT NULL,
  "branchId"              uuid NOT NULL,                                   -- our branch that owns it (Lahore HQ, Karachi …)
  "accountType"           text NOT NULL DEFAULT 'CURRENT',
  "accountTitle"          text NOT NULL,                                   -- Al-Noor Enterprises (Pvt) Ltd
  "accountNo"             text NOT NULL CHECK ("accountNo" ~ '^[0-9][0-9 -]{3,33}$'),  -- 0000-0000000-0
  "accountLast4"          text GENERATED ALWAYS AS (right(regexp_replace("accountNo", '[^0-9]', '', 'g'), 4)) STORED,  -- •••• 0123
  iban                   text CHECK (iban IS NULL OR iban ~ '^PK[0-9]{2}[A-Z]{4}[0-9]{16}$'),   -- PK36MEZN0002…0123
  "bankBranch"            text,                                            -- Gulberg III, Lahore
  "accountId"             uuid NOT NULL,                                   -- GL code 1120-01 → Accounting.ChartOfAccounts (fk file)
  "currencyCode"          char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),
  "openingBalance"        numeric(18,2) NOT NULL DEFAULT 0,
  "openingBalanceDate"   date,
  "creditLimit"           numeric(18,2) CHECK ("creditLimit" IS NULL OR "creditLimit" > 0),  -- running finance limit
  "markupTerms"           text,                                            -- "KIBOR + 1.75%"
  purpose                text NOT NULL DEFAULT 'GENERAL',
  "statementImportEnabled" boolean NOT NULL DEFAULT true,                 -- "Enable statement import (CSV / MT940)"
  "statementFormat"       text,  -- Meezan CSV / HBL Excel / MT940 / Custom mapping
  "useForPayroll"        boolean NOT NULL DEFAULT false,                  -- "Use for payroll disbursement"
  "reconciledTo"          date,                                            -- "Reconciled to 31 Aug 2026"
  "lastStatementBalance" numeric(18,2),                                   -- "Statement balance"
  "lastStatementDate"    date,
  status                 text NOT NULL DEFAULT 'ACTIVE',
  "closedOn"              date,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  "deletedAt"             timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "bankId", "accountNo"),
  UNIQUE ("tenantId", "accountId"),                                         -- one bank account per GL account
  FOREIGN KEY ("tenantId", "bankId")   REFERENCES "BankCash"."Banks" ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "bankAccountRfLimitChk" CHECK ("accountType" <> 'RUNNING_FINANCE' OR "creditLimit" IS NOT NULL),
  CONSTRAINT "bankAccountClosedChk"   CHECK ((status = 'CLOSED') = ("closedOn" IS NOT NULL)),
  CONSTRAINT "bankAccountFcyChk"      CHECK ("accountType" <> 'FOREIGN_CURRENCY' OR "currencyCode" <> 'PKR')
);
SELECT "Company"."addStandardTriggers"('"BankCash"."BankAccounts"', true);
CREATE INDEX "bankAccountTenantStatusIdx" ON "BankCash"."BankAccounts" ("tenantId", status) WHERE "deletedAt" IS NULL;
CREATE INDEX "bankAccountTenantBranchIdx" ON "BankCash"."BankAccounts" ("tenantId", "branchId");
CREATE UNIQUE INDEX "bankAccountOnePrimaryIdx" ON "BankCash"."BankAccounts" ("tenantId")
  WHERE purpose = 'PRIMARY' AND "deletedAt" IS NULL;
COMMENT ON TABLE "BankCash"."BankAccounts" IS
  'Our bank accounts (Meezan 0123, HBL 8721, UBL 2294, Alfalah 5510), each linked 1:1 to a GL account under 1120. Screens: app/bank/accounts, app/bank/book, app/bank/transactions.';
COMMENT ON COLUMN "BankCash"."BankAccounts"."reconciledTo" IS
  'Date up to which the account is reconciled. Set when a reconciliation is closed (Full) or manually (Basic).';
COMMENT ON COLUMN "BankCash"."BankAccounts"."lastStatementBalance" IS
  'Closing balance of the latest imported statement ("Statement balance" column). Book balance comes from the GL view.';

-- ---------------------------------------------------------------------------
-- CashAccounts — a cash drawer / counter / petty imprest, linked 1:1 to a GL
-- account under 1110 Cash in hand.
-- Screens: app/cash/book (KPI cards "Main Cash Drawer · Lahore HQ",
-- "Petty Cash · Imprest Rs 30,000"; Account select); src/91-data.js
-- cashAccounts[]: 1110-01 Cash in Hand — Lahore HQ (Lahore HQ drawer),
-- 1110-02 Petty Cash — Karachi, 1110-03 Cash Counter — Islamabad,
-- 1110-04 Imprest — Faisalabad. Custodian shown on app/cash/ledger.
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."CashAccounts" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                 text NOT NULL CHECK (code ~ '^[0-9]{4}(-[0-9]{2,3})?$'),   -- 1110-01 (same as GL code)
  name                 text NOT NULL,                                     -- Cash in Hand — Lahore HQ
  "shortName"           text,                                              -- Lahore HQ drawer
  kind                 text NOT NULL DEFAULT 'DRAWER',
  "branchId"            uuid NOT NULL,
  "custodianUserId"    uuid,                                              -- "Custodian Hira Ali"
  "accountId"           uuid NOT NULL,                                     -- GL 1110-01 → Accounting.ChartOfAccounts (fk file)
  "openingBalance"      numeric(18,2) NOT NULL DEFAULT 0,
  "openingBalanceDate" date,
  "imprestAmount"       numeric(18,2) CHECK ("imprestAmount" IS NULL OR "imprestAmount" > 0),  -- "Imprest Rs 30,000"
  "varianceTolerance"   numeric(18,2) NOT NULL DEFAULT 1000 CHECK ("varianceTolerance" >= 0), -- "±Rs 1,000 tolerance" at day close
  "isActive"            boolean NOT NULL DEFAULT true,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  "deletedAt"           timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  UNIQUE ("tenantId", "accountId"),
  FOREIGN KEY ("tenantId", "branchId")         REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "custodianUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "cashAccountImprestChk" CHECK (kind NOT IN ('PETTY','IMPREST') OR "imprestAmount" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."CashAccounts"', true);
CREATE INDEX "cashAccountTenantBranchIdx" ON "BankCash"."CashAccounts" ("tenantId", "branchId") WHERE "deletedAt" IS NULL;
COMMENT ON TABLE "BankCash"."CashAccounts" IS
  'Cash drawers, counters and imprest/petty floats (GL 1110-xx). Screens: app/cash/book, app/cash/ledger (Full), app/cash/petty (Full).';

-- ---------------------------------------------------------------------------
-- CashCategories — helper lookup: the "Category" select of the Cash Book quick
-- entry and the category chips of the Cash Ledger. Each maps to a default
-- contra GL account and a voucher type.
-- Screens: app/cash/book — src/98-books.js CAT_IN (Sales receipts, Customer
-- receipts, Other income, Loan / capital, Refund received), CAT_OUT (Office
-- supplies, Utilities, Courier & postage, Staff welfare, Salary advance,
-- Fuel & conveyance, Repairs & maintenance, Vendor payment), plus Bank
-- deposit / Transfer / Reversal; app/cash/ledger — src/9E-cash-users.js CATS
-- (Walk-in sales→4110, Collections→1130, Bank withdrawal, Bank deposit,
-- Petty expenses→6150, Salary advance→1160, Utilities→6210, Courier→6320,
-- Fuel→6330, Vendor payment→2110).
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."CashCategories" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,29}$'),   -- WALKIN_SALES, SALARY_ADVANCE …
  name                text NOT NULL,                                           -- Walk-in sales
  direction           text NOT NULL,
  "voucherType"        text NOT NULL,
  "defaultAccountId"  uuid,                                                    -- contra GL (4110 Sales — Counter …)
  "partyKind"          text NOT NULL DEFAULT 'NONE',
  icon                text,                                                    -- lucide icon key
  "colorToken"         text,                                                    -- var(--good) …
  "sortOrder"          integer NOT NULL DEFAULT 0,
  "isSystem"           boolean NOT NULL DEFAULT false,
  "isActive"           boolean NOT NULL DEFAULT true,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  "deletedAt"          timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."CashCategories"');
COMMENT ON TABLE "BankCash"."CashCategories" IS
  'Helper lookup (not in the contract registry): cash-book / cash-ledger categories with default contra account and voucher type. Screens: app/cash/book, app/cash/ledger.';

-- ---------------------------------------------------------------------------
-- cheque — every cheque received from a customer or issued to a vendor,
-- including post-dated cheques (PDC). Also the single "Cheque Voucher"
-- (R-CHQ-0001 / I-CHQ-0001) of app/bank/cheque-voucher (Full screen).
-- Screens: app/bank/cheques ("Record cheque": Receive / Issue, Customer * /
-- Payee (vendor) *, Cheque no. *, Drawn on bank / Issue from, Cheque date *,
-- Received on, Amount (Rs) *, Deposit into, Against invoices, Remarks,
-- "Post-dated cheque (PDC) — hold until maturity"; tables Received / Issued:
-- Cheque #, Customer/Payee, Drawn on/Bank, Cheque date, Amount, Status
-- In hand / Deposited / Cleared / Bounced / Issued);
-- app/bank/cheque-register (Direction, Party, Bank "HBL → Meezan 0123",
-- Cheque date, Days, Amount, Status; actions Deposit, Clear, Bounce, Stop,
-- Reverse, Re-present, Replace); app/cash/book Cheque mode (Cheque No.,
-- Cheque Date, Drawn On, PDC toggle).
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."Cheques" (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                   text NOT NULL,                                 -- R-CHQ-0001 / I-CHQ-0001 — Company.getNextDocNo('CHQ')
  "legacyNo"                text,                                          -- "Old No."
  "docDate"                 date NOT NULL,                                 -- voucher date
  "branchId"                uuid NOT NULL,
  direction                text NOT NULL,
  "chequeNo"                text NOT NULL CHECK ("chequeNo" ~ '^[0-9]{4,10}$'),
  -- party (at most one); partyName is the printed / displayed name
  "customerId"              uuid,                                          -- → Sales.Customers (fk file)
  "vendorId"                uuid,                                          -- → Purchases.Vendors (fk file)
  "accountId"               uuid,                                          -- GL party for non-trade cheques (office rent) → Accounting.ChartOfAccounts
  "partyName"               text NOT NULL,
  "drawnOnBankId"         uuid,                                          -- RECEIVED: customer's bank; ISSUED: our bank
  "bankAccountId"          uuid,                                          -- RECEIVED: deposit into; ISSUED: issue from
  "chequeDate"              date NOT NULL,
  "dueDate"                 date,
  "receivedOn"              date,
  amount                   numeric(18,2) NOT NULL CHECK (amount > 0),
  "currencyCode"            char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),
  "isPdc"                   boolean NOT NULL DEFAULT false,                -- "Post-dated cheque (PDC) — hold until maturity"
  "postingMode"             text NOT NULL DEFAULT 'DEPOSIT',
  status                   text NOT NULL,
  "depositedOn"             date,
  "presentedOn"             date,
  "clearedOn"               date,
  "bouncedOn"               date,                                          -- latest bounce (history in ChequeBounces)
  "bounceCount"             smallint NOT NULL DEFAULT 0 CHECK ("bounceCount" >= 0),
  "stoppedOn"               date,
  "replacedByChequeId"    uuid,                                          -- "Replace" → replacement cheque
  "journalEntryId"         uuid,                                          -- voucher that recorded the cheque (CRV/BRV/BPV) → Accounting.Vouchers
  "clearingJournalEntryId" uuid,                                         -- BRV/JV posted on clearing (HOLD_PDC / CLEAR_ON_DEPOSIT)
  remarks                  text,                                          -- "Post-dated — collected by Bilal Khan"
  narration                text,                                          -- "Additional Notes"
  "createdAt"               timestamptz NOT NULL DEFAULT now(),
  "createdBy"               uuid,
  "updatedAt"               timestamptz NOT NULL DEFAULT now(),
  "updatedBy"               uuid,
  "rowVersion"              integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  FOREIGN KEY ("tenantId", "branchId")             REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "drawnOnBankId")      REFERENCES "BankCash"."Banks" ("tenantId", id),
  FOREIGN KEY ("tenantId", "bankAccountId")       REFERENCES "BankCash"."BankAccounts" ("tenantId", id),
  FOREIGN KEY ("tenantId", "replacedByChequeId") REFERENCES "BankCash"."Cheques" ("tenantId", id),
  CONSTRAINT "chequeOnePartyChk"      CHECK (num_nonnulls("customerId", "vendorId", "accountId") <= 1),
  CONSTRAINT "chequePartySideChk"     CHECK ((direction = 'RECEIVED' AND "vendorId" IS NULL)
                                          OR (direction = 'ISSUED'   AND "customerId" IS NULL)),
  CONSTRAINT "chequeIssuedBankChk"    CHECK (direction <> 'ISSUED' OR "bankAccountId" IS NOT NULL),
  CONSTRAINT "chequeDueChk"            CHECK ("dueDate" IS NULL OR "dueDate" >= "chequeDate"),
  CONSTRAINT "chequeDepositChk"        CHECK (status <> 'DEPOSITED' OR ("depositedOn" IS NOT NULL AND "bankAccountId" IS NOT NULL)),
  CONSTRAINT "chequeClearedChk"        CHECK (status <> 'CLEARED'  OR "clearedOn" IS NOT NULL),
  CONSTRAINT "chequeBouncedChk"        CHECK (status <> 'BOUNCED'  OR ("bouncedOn" IS NOT NULL AND "bounceCount" > 0)),
  CONSTRAINT "chequeStoppedChk"        CHECK (status <> 'STOPPED'  OR "stoppedOn" IS NOT NULL),
  CONSTRAINT "chequeReplacedChk"       CHECK (status <> 'REPLACED' OR "replacedByChequeId" IS NOT NULL),
  CONSTRAINT "chequePdcModeChk"       CHECK ("postingMode" <> 'HOLD_PDC' OR "isPdc"),
  CONSTRAINT "chequeNotSelfReplaceChk" CHECK ("replacedByChequeId" IS DISTINCT FROM id)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."Cheques"', true);
CREATE INDEX "chequeTenantDirStatusIdx"  ON "BankCash"."Cheques" ("tenantId", direction, status);
CREATE INDEX "chequeTenantMaturityIdx"    ON "BankCash"."Cheques" ("tenantId", "chequeDate")
  WHERE status IN ('IN_HAND','DEPOSITED','ISSUED','PRESENTED');               -- PDC maturity calendar
CREATE INDEX "chequeTenantCustomerIdx"    ON "BankCash"."Cheques" ("tenantId", "customerId") WHERE "customerId" IS NOT NULL;
CREATE INDEX "chequeTenantVendorIdx"      ON "BankCash"."Cheques" ("tenantId", "vendorId")   WHERE "vendorId" IS NOT NULL;
CREATE INDEX "chequeTenantBankAccountIdx" ON "BankCash"."Cheques" ("tenantId", "bankAccountId", status);
CREATE INDEX "chequeTenantChequeNoIdx"   ON "BankCash"."Cheques" ("tenantId", "chequeNo");   -- search "Cheque no., party, bank…"
-- an issued leaf exists once per bank account
CREATE UNIQUE INDEX "chequeIssuedLeafUq"  ON "BankCash"."Cheques" ("tenantId", "bankAccountId", "chequeNo")
  WHERE direction = 'ISSUED';
-- a received cheque is recorded once (re-presenting re-uses the row)
CREATE UNIQUE INDEX "chequeReceivedLeafUq" ON "BankCash"."Cheques" ("tenantId", "drawnOnBankId", "chequeNo", "customerId")
  WHERE direction = 'RECEIVED' AND status <> 'CANCELLED';
COMMENT ON TABLE "BankCash"."Cheques" IS
  'Cheques received and issued, incl. PDC. Status lifecycle per direction (see cheque_status_guard). Screens: app/bank/cheques, app/bank/cheque-register, app/cash/book (Cheque mode), app/bank/cheque-voucher (Full).';
COMMENT ON COLUMN "BankCash"."Cheques"."postingMode" IS
  'DEPOSIT: Dr Bank / Cr party when recorded/deposited. HOLD_PDC: Dr Cheques-in-hand (PDC) / Cr party, then Dr Bank / Cr Cheques-in-hand on clearing. CLEAR_ON_DEPOSIT: nothing posted until cleared. See POSTING_RULES §Treasury.';
COMMENT ON COLUMN "BankCash"."Cheques"."docNo" IS
  'Cheque voucher number. Prototype shows R-CHQ-0001 (received) and I-CHQ-0001 (issued): two Company.NumberingSeries rows for doc type CHQ distinguished by prefix (see open question in report).';

-- Status transitions shown on the screens (Deposit, Clear, Bounce, Re-present,
-- Replace, Stop, Reverse). CANCELLED and REPLACED are terminal.
CREATE OR REPLACE FUNCTION "BankCash"."triggerChequeStatusGuard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT (
       (OLD.status = 'IN_HAND'   AND NEW.status IN ('DEPOSITED','CLEARED','CANCELLED','REPLACED'))
    OR (OLD.status = 'DEPOSITED' AND NEW.status IN ('CLEARED','BOUNCED','CANCELLED'))
    OR (OLD.status = 'BOUNCED'   AND NEW.status IN ('DEPOSITED','PRESENTED','REPLACED','CANCELLED'))
    OR (OLD.status = 'CLEARED'   AND NEW.status IN ('BOUNCED','CANCELLED'))
    OR (OLD.status = 'ISSUED'    AND NEW.status IN ('PRESENTED','CLEARED','BOUNCED','STOPPED','CANCELLED'))
    OR (OLD.status = 'PRESENTED' AND NEW.status IN ('CLEARED','BOUNCED'))
    OR (OLD.status = 'STOPPED'   AND NEW.status IN ('REPLACED','CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Cheque % cannot move from % to %', OLD."docNo", OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "treasuryChequeStatusGuard" BEFORE UPDATE OF status ON "BankCash"."Cheques"
  FOR EACH ROW EXECUTE FUNCTION "BankCash"."triggerChequeStatusGuard"();

-- ---------------------------------------------------------------------------
-- ChequeAllocations — which invoices (received) or bills (issued) the cheque
-- settles. Screen: app/bank/cheques "Against invoices"
-- (INV-2026-000395 · Rs 1,640,000; INV-2026-000402 · Rs 700,000).
-- When the cheque is deposited/cleared the generated Sales.CustomerReceipts (whose
-- chequeId points back here) copies these into Sales.CustomerReceiptAllocations, so
-- AR is settled in one place. Issued cheques: Purchases.VendorPayments.chequeId.
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."ChequeAllocations" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "chequeId"        uuid NOT NULL,
  "invoiceId"       uuid,                                                  -- → Sales.SalesInvoices (fk file)
  "billId"          uuid,                                                  -- → Purchases.VendorBills (fk file)
  amount           numeric(18,2) NOT NULL CHECK (amount > 0),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "chequeId", "invoiceId"),
  UNIQUE ("tenantId", "chequeId", "billId"),
  FOREIGN KEY ("tenantId", "chequeId") REFERENCES "BankCash"."Cheques" ("tenantId", id),
  CONSTRAINT "chequeAllocationOneDocChk" CHECK (num_nonnulls("invoiceId", "billId") = 1)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."ChequeAllocations"', true);
CREATE INDEX "chequeAllocationTenantInvoiceIdx" ON "BankCash"."ChequeAllocations" ("tenantId", "invoiceId") WHERE "invoiceId" IS NOT NULL;
CREATE INDEX "chequeAllocationTenantBillIdx"    ON "BankCash"."ChequeAllocations" ("tenantId", "billId")    WHERE "billId" IS NOT NULL;
COMMENT ON TABLE "BankCash"."ChequeAllocations" IS
  'Invoices (received cheque) or bills (issued cheque) the cheque settles. Screen: app/bank/cheques "Against invoices".';

-- ---------------------------------------------------------------------------
-- ChequeBounces — one row per bounce event (a cheque can be re-presented and
-- bounce again). Screen: app/bank/cheque-register "Mark cheque as bounced"
-- modal (Bounce date *, Return reason * {Insufficient funds, Signature
-- mismatch, Payment stopped by drawer, Account closed, Stale / post-dated},
-- Bank charges (Rs), Recover charges from customer {Yes — debit note, No},
-- "Notify Bilal Khan (account owner) and put customer on credit hold").
-- Toast: "Cheque marked bounced · reversal BRV posted".
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."ChequeBounces" (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                   uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "chequeId"                   uuid NOT NULL,
  "bounceDate"                 date NOT NULL,
  reason                      text NOT NULL,
  "bankCharges"                numeric(18,2) NOT NULL DEFAULT 0 CHECK ("bankCharges" >= 0),
  "recoverCharges"             boolean NOT NULL DEFAULT false,             -- "Yes — debit note"
  "notifyOwner"                boolean NOT NULL DEFAULT true,
  "ownerUserId"               uuid,                                       -- account owner notified (Bilal Khan)
  "creditHold"                 boolean NOT NULL DEFAULT false,             -- "put customer on credit hold"
  "reversalJournalEntryId"   uuid,                                       -- reversal BRV → Accounting.Vouchers
  "chargesJournalEntryId"    uuid,                                       -- bank charges (and recovery) JV
  resolution                  text NOT NULL DEFAULT 'OPEN',
  "resolvedOn"                 date,
  "replacementChequeId"       uuid,
  remarks                     text,
  "createdAt"                  timestamptz NOT NULL DEFAULT now(),
  "createdBy"                  uuid,
  "updatedAt"                  timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                  uuid,
  "rowVersion"                 integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "chequeId")             REFERENCES "BankCash"."Cheques" ("tenantId", id),
  FOREIGN KEY ("tenantId", "replacementChequeId") REFERENCES "BankCash"."Cheques" ("tenantId", id),
  FOREIGN KEY ("tenantId", "ownerUserId")         REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "chequeBounceResolvedChk" CHECK ((resolution = 'OPEN') = ("resolvedOn" IS NULL)),
  CONSTRAINT "chequeBounceReplacedChk" CHECK (resolution <> 'REPLACED' OR "replacementChequeId" IS NOT NULL),
  CONSTRAINT "chequeBounceRecoverChk"  CHECK (NOT "recoverCharges" OR "bankCharges" > 0)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."ChequeBounces"', true);
CREATE INDEX "chequeBounceTenantChequeIdx" ON "BankCash"."ChequeBounces" ("tenantId", "chequeId", "bounceDate");
CREATE INDEX "chequeBounceTenantDateIdx"   ON "BankCash"."ChequeBounces" ("tenantId", "bounceDate");    -- "Bounced (FY)" KPI
COMMENT ON TABLE "BankCash"."ChequeBounces" IS
  'Bounce events of a cheque (reason, bank charges, recovery, credit hold, reversal voucher). Helper table promoted to Basic because the bounce modal is on the Basic Cheque Register. Screen: app/bank/cheque-register.';

-- ---------------------------------------------------------------------------
-- BankTransactions — a line on a bank account: the bank-side view of a
-- posted voucher, or a statement line not yet booked ("Uncategorised").
-- Screens: app/bank/transactions ("Statement lines": Date, Bank, Description
-- (+ sub-text), Cheque / Ref, Voucher, Deposit, Withdrawal, Status
-- Reconciled / Uncategorised / Unpresented; Categorise → Bank charges /
-- Profit on deposit / Markup expense / Customer receipt / Vendor payment;
-- "Import bank statement" modal: Bank account *, Format, Statement period);
-- app/bank/book (Withdrawals, Deposits, Running balance, Status Cleared /
-- Uncleared / Pending; "Mark as cleared"); src/98-books.js MODES.bank
-- (Online / IBFT, RAAST, Bank transfer, Debit card), MODES.cheque.
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."BankTransactions" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "bankAccountId"    uuid NOT NULL,
  "txnDate"           date NOT NULL,
  "valueDate"         date,
  description        text NOT NULL,                                       -- IBFT from Packages Ltd
  detail             text,                                                -- "Against INV-2026-000377"
  reference          text,                                                -- Cheque / Ref: FT26273PKG, 00451209, DS-55118
  "paymentMode"       text,
  category           text,
  "depositAmount"     numeric(18,2) NOT NULL DEFAULT 0 CHECK ("depositAmount" >= 0),
  "withdrawalAmount"  numeric(18,2) NOT NULL DEFAULT 0 CHECK ("withdrawalAmount" >= 0),
  "chequeId"          uuid,
  "journalEntryId"   uuid,                                                -- Voucher: BRV-2026-000188 → Accounting.Vouchers (fk file)
  source             text NOT NULL DEFAULT 'VOUCHER',
  "statementRef"      text,                                                -- import batch / file the line came from
  status             text NOT NULL,
  "clearedOn"         date,
  "reconciledOn"      date,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "bankAccountId") REFERENCES "BankCash"."BankAccounts" ("tenantId", id),
  FOREIGN KEY ("tenantId", "chequeId")       REFERENCES "BankCash"."Cheques" ("tenantId", id),
  CONSTRAINT "bankTransactionOneSideChk" CHECK (("depositAmount" > 0) <> ("withdrawalAmount" > 0)),
  CONSTRAINT "bankTransactionBookedChk"   CHECK (status = 'UNCATEGORISED' OR "journalEntryId" IS NOT NULL),
  CONSTRAINT "bankTransactionUncatChk"    CHECK (status <> 'UNCATEGORISED' OR "journalEntryId" IS NULL),
  CONSTRAINT "bankTransactionReconChk"    CHECK (status <> 'RECONCILED' OR "reconciledOn" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."BankTransactions"', true);
CREATE INDEX "bankTransactionTenantAcctDateIdx" ON "BankCash"."BankTransactions" ("tenantId", "bankAccountId", "txnDate");
CREATE INDEX "bankTransactionTenantStatusIdx"    ON "BankCash"."BankTransactions" ("tenantId", status, "txnDate");
CREATE INDEX "bankTransactionTenantJournalIdx"   ON "BankCash"."BankTransactions" ("tenantId", "journalEntryId") WHERE "journalEntryId" IS NOT NULL;
CREATE INDEX "bankTransactionTenantChequeIdx"    ON "BankCash"."BankTransactions" ("tenantId", "chequeId") WHERE "chequeId" IS NOT NULL;
CREATE INDEX "bankTransactionDescTrgmIdx"        ON "BankCash"."BankTransactions" USING gin (description gin_trgm_ops);
COMMENT ON TABLE "BankCash"."BankTransactions" IS
  'Bank-side lines per bank account: one per posted bank voucher leg, plus imported statement lines awaiting categorisation. Screens: app/bank/transactions, app/bank/book.';
COMMENT ON COLUMN "BankCash"."BankTransactions".status IS
  'UNCATEGORISED (imported, no voucher) · PENDING (posted, awaiting bank) · UNPRESENTED (issued cheque not yet presented) · UNCLEARED (deposit in transit) · CLEARED (seen on statement / marked cleared in Bank Book) · RECONCILED (locked by a reconciliation).';

-- ---------------------------------------------------------------------------
-- CashBookEntries — helper: the quick-entry header the Cash Book writes for
-- every voucher it creates (CRV / CPV / BRV / BPV / JV contra). The journal
-- holds the money; this row holds what the journal has no column for.
-- Screen: app/cash/book — src/98-books.js panelHTML / trHTML / save():
-- When (Date *, Time *), Who (Received From / Paid To / Party *, Customer /
-- Vendor pick), What (Category *, Account / Bank Account *, Payment Mode *
-- {Cash, Card | Online / IBFT, RAAST, Bank transfer, Debit card | Cheque},
-- Reference No.), Cheque (Cheque No. *, Cheque Date *, Drawn On, PDC),
-- Amount *, Notes / Narration, Receipt / Attachment; Transfer (From account,
-- To account, Date *, Reference No., Amount *, Narration). Status Posted /
-- Draft / PDC comes from the journal / cheque.
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."CashBookEntries" (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "journalEntryId"         uuid NOT NULL,                                 -- the voucher (any status) → Accounting.Vouchers
  "branchId"                uuid NOT NULL,
  "entryKind"               text NOT NULL,
  "entryDate"               date NOT NULL,
  "entryTime"               time,                                          -- "Time *"
  "cashAccountId"          uuid,                                          -- cash side / transfer "From account"
  "bankAccountId"          uuid,                                          -- bank side / transfer "From account"
  "toCashAccountId"       uuid,                                          -- transfer "To account"
  "toBankAccountId"       uuid,
  "categoryId"              uuid,
  "paymentMode"             text,
  "partyName"               text,                                          -- Walk-in Customer / Daraz Business
  "customerId"              uuid,                                          -- → Sales.Customers (fk file)
  "vendorId"                uuid,                                          -- → Purchases.Vendors (fk file)
  "referenceNo"             text,                                          -- INV-2026-000123 / Deposit slip 55102
  "chequeId"                uuid,                                          -- Cheque mode
  amount                   numeric(18,2) NOT NULL CHECK (amount > 0),
  narration                text,
  "createdAt"               timestamptz NOT NULL DEFAULT now(),
  "createdBy"               uuid,
  "updatedAt"               timestamptz NOT NULL DEFAULT now(),
  "updatedBy"               uuid,
  "rowVersion"              integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "journalEntryId"),
  FOREIGN KEY ("tenantId", "branchId")          REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "cashAccountId")    REFERENCES "BankCash"."CashAccounts" ("tenantId", id),
  FOREIGN KEY ("tenantId", "bankAccountId")    REFERENCES "BankCash"."BankAccounts" ("tenantId", id),
  FOREIGN KEY ("tenantId", "toCashAccountId") REFERENCES "BankCash"."CashAccounts" ("tenantId", id),
  FOREIGN KEY ("tenantId", "toBankAccountId") REFERENCES "BankCash"."BankAccounts" ("tenantId", id),
  FOREIGN KEY ("tenantId", "categoryId")        REFERENCES "BankCash"."CashCategories" ("tenantId", id),
  FOREIGN KEY ("tenantId", "chequeId")          REFERENCES "BankCash"."Cheques" ("tenantId", id),
  CONSTRAINT "cashbookEntryOnePartyChk" CHECK (num_nonnulls("customerId", "vendorId") <= 1),
  CONSTRAINT "cashbookEntryAccountsChk"  CHECK (
       ("entryKind" IN ('CASH_IN','CASH_OUT')
          AND "cashAccountId" IS NOT NULL AND "bankAccountId" IS NULL
          AND "toCashAccountId" IS NULL AND "toBankAccountId" IS NULL)
    OR ("entryKind" IN ('BANK_IN','BANK_OUT','CHEQUE_IN','CHEQUE_OUT')
          AND "bankAccountId" IS NOT NULL AND "cashAccountId" IS NULL
          AND "toCashAccountId" IS NULL AND "toBankAccountId" IS NULL)
    OR ("entryKind" = 'TRANSFER'
          AND num_nonnulls("cashAccountId", "bankAccountId") = 1
          AND num_nonnulls("toCashAccountId", "toBankAccountId") = 1
          AND ("cashAccountId" IS NULL OR "cashAccountId" IS DISTINCT FROM "toCashAccountId")
          AND ("bankAccountId" IS NULL OR "bankAccountId" IS DISTINCT FROM "toBankAccountId"))),
  CONSTRAINT "cashbookEntryChequeChk"    CHECK (("entryKind" IN ('CHEQUE_IN','CHEQUE_OUT')) = ("chequeId" IS NOT NULL)),
  CONSTRAINT "cashbookEntryPartyChk"     CHECK ("entryKind" = 'TRANSFER' OR "partyName" IS NOT NULL),
  CONSTRAINT "cashbookEntryModeChk"      CHECK (
       "entryKind" = 'TRANSFER'
    OR ("entryKind" IN ('CASH_IN','CASH_OUT')     AND "paymentMode" IN ('CASH','CARD'))
    OR ("entryKind" IN ('BANK_IN','BANK_OUT')     AND "paymentMode" IN ('IBFT','RAAST','BANK_TRANSFER','DEBIT_CARD'))
    OR ("entryKind" IN ('CHEQUE_IN','CHEQUE_OUT') AND "paymentMode" = 'CHEQUE'))
);
SELECT "Company"."addStandardTriggers"('"BankCash"."CashBookEntries"', true);
CREATE INDEX "cashbookEntryTenantCashDateIdx" ON "BankCash"."CashBookEntries" ("tenantId", "cashAccountId", "entryDate", "entryTime");
CREATE INDEX "cashbookEntryTenantBankDateIdx" ON "BankCash"."CashBookEntries" ("tenantId", "bankAccountId", "entryDate");
CREATE INDEX "cashbookEntryTenantCategoryIdx"  ON "BankCash"."CashBookEntries" ("tenantId", "categoryId", "entryDate");
COMMENT ON TABLE "BankCash"."CashBookEntries" IS
  'Helper (not in the contract registry): 1:1 metadata for vouchers created by the Cash Book quick entry (kind, time, category, payment mode, party text, transfer legs). Screens: app/cash/book, app/cash/ledger (Full).';

-- ---------------------------------------------------------------------------
-- CashDayCloses — the daily cash count and lock of a cash account.
-- Screens: app/cash/book "Cash Count" card (Counted, Book balance,
-- Over / Short, "Reconcile & close day"; toast "Day closed with a shortage
-- of Rs … · posted to Cash Over/Short"); app/cash/ledger (Full) "Day Close"
-- rail (day select open/closed, "Closed by Sana Javed at 17:24",
-- ±Rs 1,000 tolerance, "Lock 30 Sep", variance JV to 6990 Cash over / short,
-- "Variance trend · last 14 days").
-- Promoted to Basic (registry lists it as Full) because the Basic Cash Book
-- screen performs the count and the close.
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."CashDayCloses" (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                  uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "cashAccountId"            uuid NOT NULL,
  "closeDate"                 date NOT NULL,
  "bookBalance"               numeric(18,2) NOT NULL,                      -- closing GL balance of the day
  "countedAmount"             numeric(18,2) NOT NULL CHECK ("countedAmount" >= 0),
  "varianceAmount"            numeric(18,2) GENERATED ALWAYS AS ("countedAmount" - "bookBalance") STORED,  -- + over / − short
  status                     text NOT NULL DEFAULT 'COUNTED',
  "lockedByUserId"          uuid,
  "lockedAt"                  timestamptz,
  "varianceJournalEntryId"  uuid,                                        -- JV Dr/Cr 6990 Cash over / short → Accounting.Vouchers
  remarks                    text,
  "createdAt"                 timestamptz NOT NULL DEFAULT now(),
  "createdBy"                 uuid,
  "updatedAt"                 timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                 uuid,
  "rowVersion"                integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "cashAccountId", "closeDate"),
  FOREIGN KEY ("tenantId", "cashAccountId")   REFERENCES "BankCash"."CashAccounts" ("tenantId", id),
  FOREIGN KEY ("tenantId", "lockedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "cashDayCloseLockedChk"   CHECK (status <> 'LOCKED' OR ("lockedByUserId" IS NOT NULL AND "lockedAt" IS NOT NULL)),
  CONSTRAINT "cashDayCloseVarianceChk" CHECK (status <> 'LOCKED' OR "countedAmount" = "bookBalance"
                                                OR "varianceJournalEntryId" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."CashDayCloses"', true);
CREATE INDEX "cashDayCloseTenantDateIdx" ON "BankCash"."CashDayCloses" ("tenantId", "closeDate");
COMMENT ON TABLE "BankCash"."CashDayCloses" IS
  'Daily cash count + lock per cash account; a non-zero variance posts a JV to Cash over/short. Screens: app/cash/book, app/cash/ledger (Full).';

-- A locked day is read-only; it can only be re-opened (Period Close unlock).
CREATE OR REPLACE FUNCTION "BankCash"."triggerCashDayCloseGuard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'LOCKED' THEN
    IF NEW.status <> 'REOPENED'
       OR NEW."countedAmount" IS DISTINCT FROM OLD."countedAmount"
       OR NEW."bookBalance"   IS DISTINCT FROM OLD."bookBalance" THEN
      RAISE EXCEPTION 'Cash day % is locked; reopen it before changing the count', OLD."closeDate"
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "treasuryCashDayCloseGuard" BEFORE UPDATE ON "BankCash"."CashDayCloses"
  FOR EACH ROW EXECUTE FUNCTION "BankCash"."triggerCashDayCloseGuard"();

-- ---------------------------------------------------------------------------
-- CashDayCloseDenominations — the notes counted at day close.
-- Screens: app/cash/book Cash Count (5,000 · 1,000 · 500 · 100 · 50 · 20 ·
-- 10 · Coins); app/cash/ledger Day Close (same notes + "Coins" amount).
-- Coins are stored as noteValue 1 with qty = rupee amount.
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."CashDayCloseDenominations" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "dayCloseId"     uuid NOT NULL,
  "noteValue"       integer NOT NULL CHECK ("noteValue" IN (5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1)),
  qty              integer NOT NULL DEFAULT 0 CHECK (qty >= 0),
  amount           numeric(18,2) GENERATED ALWAYS AS (("noteValue"::numeric * qty)) STORED,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "dayCloseId", "noteValue"),
  FOREIGN KEY ("tenantId", "dayCloseId") REFERENCES "BankCash"."CashDayCloses" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."CashDayCloseDenominations"');
COMMENT ON TABLE "BankCash"."CashDayCloseDenominations" IS
  'Denomination lines of a cash day close. Screens: app/cash/book, app/cash/ledger (Full).';
