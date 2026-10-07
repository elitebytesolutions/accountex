-- =============================================================================
-- Finsoft ERP (FULL) — 04-treasury.sql
-- Bank and cash: bank master, bank accounts, bank transactions, cash accounts,
-- cheques (received / issued, PDC), cheque allocation and bounce, the quick
-- cash-book entry header and the daily cash count / day close.
--
-- Basic part: identical to erp-basic/database/schema/04-treasury.sql except
-- the columns marked "[Full]" (appended after the Basic business columns).
-- Full-only tables follow after the Basic part (cheque books, bulk cheque
-- vouchers, statement import + rules + reconciliation, petty cash, expense
-- claims).
--
-- Basic screens:
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
  -- [Full] app/cash/ledger: entries of Rs 50,000+ are approved by the Finance Manager (Sana Javed)
  "approvalThreshold"   numeric(18,2) NOT NULL DEFAULT 50000 CHECK ("approvalThreshold" >= 0),
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
  -- [Full] cheque books (app/bank/cheque-voucher)
  "chequeBookId"           uuid,                                          -- leaf taken from this book (FK added below)
  "crossedAcPayee"         boolean NOT NULL DEFAULT true,                 -- printed crossing "A/C payee only"
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
  -- [Full] credit hold raised by the bounce → Sales.CreditHoldEvents (fk file)
  "creditHoldEventId"        uuid,
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
  -- [Full] statement import, bank rules, reconciliation (FKs added below)
  "statementLineId"  uuid,
  "bankRuleId"       uuid,
  "reconciliationId"  uuid,
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
  -- [Full] salary advance / staff party → HumanResources.Employees (fk file)
  "employeeId"              uuid,
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

-- [Full] one party at most, now including the employee party
ALTER TABLE "BankCash"."CashBookEntries"
  ADD CONSTRAINT "cashbookEntryOnePartyFullChk" CHECK (num_nonnulls("customerId", "vendorId", "employeeId") <= 1);
CREATE INDEX "cashbookEntryTenantEmployeeIdx" ON "BankCash"."CashBookEntries" ("tenantId", "employeeId") WHERE "employeeId" IS NOT NULL;
CREATE INDEX "bankTransactionTenantReconIdx" ON "BankCash"."BankTransactions" ("tenantId", "reconciliationId") WHERE "reconciliationId" IS NOT NULL;

-- =============================================================================
-- FULL EDITION — tables below are not in erp-basic.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ChequeBooks — cheque books issued by the bank for one of our accounts.
-- Screens: app/bank/cheque-voucher (Issue Cheque → bank account, cheque
-- preview MICR "⑈000000⑈ 0123⑆ 0045", "Authorised signatory"); app/bank/cheques
-- Issue mode "Issue from"; app/cash/ledger courier line "TCS overnight —
-- cheque book". Leaves are numeric with leading zeros (00451207).
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."ChequeBooks" (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"         uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "bankAccountId"   uuid NOT NULL,
  "bookRef"          text,                                                -- bank's book serial
  "firstLeafNo"     bigint NOT NULL CHECK ("firstLeafNo" > 0),
  "lastLeafNo"      bigint NOT NULL,
  "nextLeafNo"      bigint NOT NULL,
  "leafDigits"       smallint NOT NULL DEFAULT 8 CHECK ("leafDigits" BETWEEN 4 AND 10),
  leaves            integer GENERATED ALWAYS AS (("lastLeafNo" - "firstLeafNo" + 1)::integer) STORED,
  "crossedAcPayee"  boolean NOT NULL DEFAULT true,                       -- default crossing printed on leaves
  "receivedOn"       date,
  status            text NOT NULL DEFAULT 'ACTIVE',
  remarks           text,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "createdBy"        uuid,
  "updatedAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedBy"        uuid,
  "rowVersion"       integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "bankAccountId", "firstLeafNo"),
  FOREIGN KEY ("tenantId", "bankAccountId") REFERENCES "BankCash"."BankAccounts" ("tenantId", id),
  CONSTRAINT "chequeBookRangeChk" CHECK ("lastLeafNo" >= "firstLeafNo"),
  CONSTRAINT "chequeBookNextChk"  CHECK ("nextLeafNo" BETWEEN "firstLeafNo" AND "lastLeafNo" + 1),
  CONSTRAINT "chequeBookWidthChk" CHECK (length("lastLeafNo"::text) <= "leafDigits")
);
SELECT "Company"."addStandardTriggers"('"BankCash"."ChequeBooks"', true);
CREATE INDEX "chequeBookTenantAccountIdx" ON "BankCash"."ChequeBooks" ("tenantId", "bankAccountId", status);
-- one active book per bank account at a time
CREATE UNIQUE INDEX "chequeBookOneActiveIdx" ON "BankCash"."ChequeBooks" ("tenantId", "bankAccountId") WHERE status = 'ACTIVE';
COMMENT ON TABLE "BankCash"."ChequeBooks" IS
  'Cheque books per bank account: leaf range, next leaf, default crossing. Issued cheques take the next leaf. Screens: app/bank/cheque-voucher, app/bank/cheques.';

ALTER TABLE "BankCash"."Cheques"
  ADD CONSTRAINT "chequeChequeBookIdFk" FOREIGN KEY ("tenantId", "chequeBookId") REFERENCES "BankCash"."ChequeBooks" ("tenantId", id);
CREATE INDEX "chequeTenantBookIdx" ON "BankCash"."Cheques" ("tenantId", "chequeBookId") WHERE "chequeBookId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- ChequeBatches — "Bulk Sheet Entry" of the Cheque Voucher (CHB): common
-- fields applied to every row, each row generating one cheque voucher.
-- Screen: app/bank/cheque-voucher, src/44-purchase-docs.html pd-cq bulk pane
-- (Voucher Type * Receive / Issue, Voucher Date *, Bank Account *, Posting
-- Mode {Deposit in Bank, Hold as PDC, Clear on deposit}, Old No. Rule {Auto
-- if new, Keep from sheet, Blank}, Default Remarks Prefix "R-Chq # -";
-- Sheet Population .xlsx/.xls/.csv max 1,000 records; Validate Rows,
-- Generate Vouchers "Done — n vouchers created"); src/94-purchase-docs.js
-- cqBValidate / cqGenerate.
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."ChequeBatches" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"             text NOT NULL,                                      -- Company.getNextDocNo('CHB')
  "docDate"           date NOT NULL,                                      -- Voucher Date *
  "branchId"          uuid NOT NULL,
  direction          text NOT NULL,
  "bankAccountId"    uuid NOT NULL,
  "postingMode"       text NOT NULL DEFAULT 'DEPOSIT',
  "oldNoRule"        text NOT NULL DEFAULT 'AUTO_IF_NEW',
  "remarksPrefix"     text,                                               -- "R-Chq # -"
  source             text NOT NULL DEFAULT 'SCREEN',
  "sheetAttachmentId" uuid,                                              -- uploaded populated sheet
  "rowCount"          integer NOT NULL DEFAULT 0 CHECK ("rowCount" BETWEEN 0 AND 1000),
  "totalAmount"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("totalAmount" >= 0),
  status             text NOT NULL DEFAULT 'DRAFT',
  "generatedAt"       timestamptz,
  "preparedByUserId" uuid,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  FOREIGN KEY ("tenantId", "branchId")           REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "bankAccountId")     REFERENCES "BankCash"."BankAccounts" ("tenantId", id),
  FOREIGN KEY ("tenantId", "sheetAttachmentId") REFERENCES "Company"."Attachments" ("tenantId", id),
  FOREIGN KEY ("tenantId", "preparedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "chequeBatchGeneratedChk" CHECK (status NOT IN ('GENERATED','PARTIAL') OR "generatedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."ChequeBatches"', true);
CREATE INDEX "chequeBatchTenantDateIdx" ON "BankCash"."ChequeBatches" ("tenantId", "docDate", status);
COMMENT ON TABLE "BankCash"."ChequeBatches" IS
  'Bulk Cheque Voucher header (CHB): common voucher type/date/bank/posting mode for many rows. Screen: app/bank/cheque-voucher (Bulk Sheet Entry).';

-- ChequeBatchLines — "Bulk Entry Rows": #, Party Code *, Party Name *,
-- Cheque No. *, Cheque Date *, Due Date, Amount *, Remarks, Old No.
CREATE TABLE "BankCash"."ChequeBatchLines" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "batchId"           uuid NOT NULL,
  "lineNo"            integer NOT NULL CHECK ("lineNo" > 0),
  "partyCode"         text NOT NULL,                                      -- CUST-0007 / VEN-0005 as typed or imported
  "partyName"         text NOT NULL,
  "customerId"        uuid,                                               -- resolved party → Sales.Customers (fk file)
  "vendorId"          uuid,                                               -- → Purchases.Vendors (fk file)
  "chequeNo"          text NOT NULL CHECK ("chequeNo" ~ '^[0-9]{6,8}$'),   -- "6–8 digit cheque number"
  "chequeDate"        date NOT NULL,
  "dueDate"           date,
  amount             numeric(18,2) NOT NULL CHECK (amount > 0),
  remarks            text,
  "legacyNo"          text,                                               -- Old No.
  "validationStatus"  text NOT NULL DEFAULT 'PENDING',
  "validationErrors"  jsonb,                                              -- {"chq": "…", "amt": "…"} highlighted cells
  "chequeId"          uuid,                                               -- voucher generated from this row
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "batchId", "lineNo"),
  UNIQUE ("tenantId", "chequeId"),
  FOREIGN KEY ("tenantId", "batchId")  REFERENCES "BankCash"."ChequeBatches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "chequeId") REFERENCES "BankCash"."Cheques" ("tenantId", id),
  CONSTRAINT "chequeBatchLinePartyChk"     CHECK (num_nonnulls("customerId", "vendorId") <= 1),
  CONSTRAINT "chequeBatchLineDueChk"       CHECK ("dueDate" IS NULL OR "dueDate" >= "chequeDate"),
  CONSTRAINT "chequeBatchLineGeneratedChk" CHECK (("validationStatus" = 'GENERATED') = ("chequeId" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"BankCash"."ChequeBatchLines"', true);
COMMENT ON TABLE "BankCash"."ChequeBatchLines" IS
  'Rows of a bulk cheque voucher; each GENERATED row points at the BankCash.Cheques it created. Screen: app/bank/cheque-voucher.';

-- ---------------------------------------------------------------------------
-- BankStatementImports — one uploaded bank statement file.
-- Screens: app/bank/transactions "Import bank statement" (Bank account *,
-- Format {Meezan CSV, HBL Excel, MT940, Custom mapping}, Statement period;
-- "142 lines imported · 128 auto-matched"); app/bank/rules "Import statement"
-- (CSV, Excel or MT940; "Detecting format: MT940 (SWIFT) / CSV · Meezan Bank
-- layout", "Parsing 15 transactions", "Removing 2 duplicates already
-- imported", "15 lines · Meezan 0123 · 26 Sep → 01 Oct 2026");
-- app/bank/reconciliation "Meezan Bank · imported 01 Oct 07:40".
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."BankStatementImports" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "bankAccountId"    uuid NOT NULL,
  "fileName"          text NOT NULL,                                      -- Meezan_0123_Sep2026.csv
  "attachmentId"      uuid,
  format             text NOT NULL,
  layout             text,                                               -- "Meezan Bank layout"
  "periodFrom"        date NOT NULL,
  "periodTo"          date NOT NULL,
  "openingBalance"    numeric(18,2),
  "closingBalance"    numeric(18,2),
  "lineCount"         integer NOT NULL DEFAULT 0 CHECK ("lineCount" >= 0),
  "duplicateCount"    integer NOT NULL DEFAULT 0 CHECK ("duplicateCount" >= 0),
  "matchedCount"      integer NOT NULL DEFAULT 0 CHECK ("matchedCount" >= 0),
  status             text NOT NULL DEFAULT 'UPLOADED',
  "errorMessage"      text,
  "importedAt"        timestamptz NOT NULL DEFAULT now(),
  "importedByUserId" uuid,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "bankAccountId")     REFERENCES "BankCash"."BankAccounts" ("tenantId", id),
  FOREIGN KEY ("tenantId", "attachmentId")       REFERENCES "Company"."Attachments" ("tenantId", id),
  FOREIGN KEY ("tenantId", "importedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "statementImportPeriodChk"  CHECK ("periodTo" >= "periodFrom"),
  CONSTRAINT "statementImportMatchedChk" CHECK ("matchedCount" <= "lineCount"),
  CONSTRAINT "statementImportFailedChk"  CHECK (status <> 'FAILED' OR "errorMessage" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."BankStatementImports"', true);
CREATE INDEX "statementImportTenantAccountIdx" ON "BankCash"."BankStatementImports" ("tenantId", "bankAccountId", "periodTo" DESC);
COMMENT ON TABLE "BankCash"."BankStatementImports" IS
  'An imported bank statement file (CSV / Excel / MT940). Screens: app/bank/transactions, app/bank/rules, app/bank/reconciliation.';

-- ---------------------------------------------------------------------------
-- BankStatementLines — one line of an imported statement, with its rule
-- categorisation or Raast / IBFT invoice match.
-- Screens: app/bank/rules "Statement lines" (Date, Description, Amount (Rs),
-- Category / match: "<account> <code> · Rule BR-05 · Bank charges & FED" or
-- "Match to invoice" / Unmatched) and "Raast & IBFT matching" (RAAST / IBFT
-- tag, amount, ref RAAST-RTP…, → INV-2026-000951 · Shifa International,
-- confidence 99% / 86% / 78%, reason "Invoice ref + exact amount", Match,
-- "Match ≥ 90%"); app/bank/reconciliation "Bank statement" table.
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."BankStatementLines" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "statementImportId"  uuid NOT NULL,
  "bankAccountId"      uuid NOT NULL,
  "lineNo"              integer NOT NULL CHECK ("lineNo" > 0),
  "txnDate"             date NOT NULL,
  "valueDate"           date,
  description          text NOT NULL,                                    -- IBFT IN FROM SHIFA INTL REF INV-2026-000951
  reference            text,                                             -- IBFT-0110-88231 / RAAST-RTP2610010012345
  amount               numeric(18,2) NOT NULL CHECK (amount <> 0),       -- signed: + credit (in) / − debit (out)
  direction            text GENERATED ALWAYS AS (CASE WHEN amount > 0 THEN 'IN' ELSE 'OUT' END) STORED,
  "runningBalance"      numeric(18,2),
  channel              text,
  "dedupeHash"          text NOT NULL,                                    -- date+amount+ref+desc; drops re-imported lines
  status               text NOT NULL DEFAULT 'UNMATCHED',
  "categoryAccountId"  uuid,                                             -- rule / manual category → Accounting.ChartOfAccounts (fk file)
  "costCentreId"       uuid,                                             -- → Accounting.CostCentres (fk file)
  "bankRuleId"         uuid,                                             -- rule that categorised it
  "matchedInvoiceId"   uuid,                                             -- Raast / IBFT match → Sales.SalesInvoices (fk file)
  "matchConfidence"     numeric(5,2) CHECK ("matchConfidence" IS NULL OR "matchConfidence" BETWEEN 0 AND 100),
  "matchReason"         text,                                             -- "Invoice ref + exact amount"
  "bankTransactionId"  uuid,                                             -- book line created / matched
  "journalEntryId"     uuid,                                             -- adjustment / receipt voucher → Accounting.Vouchers (fk file)
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "statementImportId", "lineNo"),
  UNIQUE ("tenantId", "bankAccountId", "dedupeHash"),
  FOREIGN KEY ("tenantId", "statementImportId") REFERENCES "BankCash"."BankStatementImports" ("tenantId", id),
  FOREIGN KEY ("tenantId", "bankAccountId")     REFERENCES "BankCash"."BankAccounts" ("tenantId", id),
  FOREIGN KEY ("tenantId", "bankTransactionId") REFERENCES "BankCash"."BankTransactions" ("tenantId", id),
  CONSTRAINT "statementLineCategorisedChk" CHECK (status <> 'CATEGORISED' OR "categoryAccountId" IS NOT NULL),
  CONSTRAINT "statementLineMatchedChk"     CHECK (status <> 'MATCHED' OR num_nonnulls("matchedInvoiceId", "bankTransactionId") >= 1)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."BankStatementLines"', true);
CREATE INDEX "statementLineTenantAccountDateIdx" ON "BankCash"."BankStatementLines" ("tenantId", "bankAccountId", "txnDate");
CREATE INDEX "statementLineTenantStatusIdx"       ON "BankCash"."BankStatementLines" ("tenantId", status);
CREATE INDEX "statementLineDescTrgmIdx"           ON "BankCash"."BankStatementLines" USING gin (description gin_trgm_ops);
COMMENT ON TABLE "BankCash"."BankStatementLines" IS
  'Imported statement lines with rule categorisation and Raast/IBFT-to-invoice matching. Screens: app/bank/rules, app/bank/reconciliation, app/bank/transactions.';

ALTER TABLE "BankCash"."BankTransactions"
  ADD CONSTRAINT "bankTransactionStatementLineIdFk" FOREIGN KEY ("tenantId", "statementLineId") REFERENCES "BankCash"."BankStatementLines" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- BankRules — "IF <conditions> THEN categorise to <account> · cost centre".
-- Screen: app/bank/rules, src/9A-company-plus.js bankRules(): RULES (id BR-01,
-- name, conds, any, acc, cc, on, hits) — card "BR-05 · 48 hits in 90 days",
-- Active switch; builder drawer: Rule name *, Conditions (Match all / Match
-- any), Then: Categorise to account, Cost centre, "Auto-post when matched (no
-- review)". "Rules run top to bottom; first match wins".
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."BankRules" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code             text NOT NULL CHECK (code ~ '^BR-[0-9]{2,4}$'),       -- BR-01
  name             text NOT NULL,                                        -- K-Electric bills
  priority         integer NOT NULL DEFAULT 100,                         -- lower runs first
  "matchMode"       text NOT NULL DEFAULT 'ALL',
  "bankAccountId"  uuid,                                                 -- NULL = every account
  "accountId"       uuid NOT NULL,                                        -- Categorise to account → Accounting.ChartOfAccounts (fk file)
  "costCentreId"   uuid,                                                 -- → Accounting.CostCentres (fk file)
  "autoPost"        boolean NOT NULL DEFAULT true,                        -- "Auto-post when matched (no review)"
  "isEnabled"       boolean NOT NULL DEFAULT true,
  "hitCount"        integer NOT NULL DEFAULT 0 CHECK ("hitCount" >= 0),    -- "48 hits in 90 days"
  "lastHitAt"      timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  FOREIGN KEY ("tenantId", "bankAccountId") REFERENCES "BankCash"."BankAccounts" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."BankRules"', true);
CREATE INDEX "bankRuleTenantPriorityIdx" ON "BankCash"."BankRules" ("tenantId", priority) WHERE "isEnabled" AND "deletedAt" IS NULL;
COMMENT ON TABLE "BankCash"."BankRules" IS
  'Statement categorisation rules, evaluated by priority (first match wins). Screen: app/bank/rules.';

ALTER TABLE "BankCash"."BankStatementLines"
  ADD CONSTRAINT "statementLineBankRuleIdFk" FOREIGN KEY ("tenantId", "bankRuleId") REFERENCES "BankCash"."BankRules" ("tenantId", id);
ALTER TABLE "BankCash"."BankTransactions"
  ADD CONSTRAINT "bankTransactionBankRuleIdFk" FOREIGN KEY ("tenantId", "bankRuleId") REFERENCES "BankCash"."BankRules" ("tenantId", id);

-- BankRuleConditions — FIELDS {desc Description, amt Amount, ref Reference,
-- type Direction}; OPS desc {contains, starts with, equals}, ref {contains,
-- starts with}, amt {less than, greater than, equals}, type {is} (in / out).
CREATE TABLE "BankCash"."BankRuleConditions" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "bankRuleId"     uuid NOT NULL,
  seq              smallint NOT NULL CHECK (seq > 0),
  field            text NOT NULL,
  operator         text NOT NULL,
  value            text NOT NULL CHECK (length(btrim(value)) > 0),       -- K-ELECTRIC / 5000 / in
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "bankRuleId", seq),
  FOREIGN KEY ("tenantId", "bankRuleId") REFERENCES "BankCash"."BankRules" ("tenantId", id),
  CONSTRAINT "bankRuleConditionAmtChk"  CHECK (field <> 'AMT'  OR value ~ '^[0-9]+(\.[0-9]{1,2})?$'),
  CONSTRAINT "bankRuleConditionTypeChk" CHECK (field <> 'TYPE' OR value IN ('IN','OUT'))
);
SELECT "Company"."addStandardTriggers"('"BankCash"."BankRuleConditions"', true);
COMMENT ON TABLE "BankCash"."BankRuleConditions" IS
  'Conditions of a bank rule (combined by BankRules.matchMode). Screen: app/bank/rules builder.';

-- ---------------------------------------------------------------------------
-- reconciliation — a bank reconciliation of one account as at a date (REC).
-- Screen: app/bank/reconciliation — header (account select, Import,
-- Auto-match, Finish "Reconciliation saved — Sep 2026"); KPIs Statement lines
-- 142 / Matched 90% / Unmatched statement / Unmatched book; "Reconciliation
-- summary — As at 30 Sep 2026": Balance per bank statement, Less: unpresented
-- cheques, Add: deposits in transit, Adjusted bank balance; Balance per books
-- (1120-01), Add: PLS profit not booked, Less: bank charges not booked,
-- Adjusted book balance; "Difference Rs 0.00"; History (August 2026 · Sana
-- Javed · 04 Sep · Closed). Bank Book "Reconciliation Progress".
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."BankReconciliations" (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                   uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                      text NOT NULL,                              -- Company.getNextDocNo('REC')
  "bankAccountId"             uuid NOT NULL,
  "periodFrom"                 date NOT NULL,
  "periodTo"                   date NOT NULL,                              -- "As at 30 Sep 2026"
  "statementImportId"         uuid,
  "statementBalance"           numeric(18,2) NOT NULL,
  "unpresentedCheques"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("unpresentedCheques" >= 0),
  "depositsInTransit"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("depositsInTransit" >= 0),
  "adjustedBankBalance"       numeric(18,2) GENERATED ALWAYS AS ("statementBalance" - "unpresentedCheques" + "depositsInTransit") STORED,
  "bookBalance"                numeric(18,2) NOT NULL,
  "unbookedCredits"            numeric(18,2) NOT NULL DEFAULT 0 CHECK ("unbookedCredits" >= 0),   -- PLS profit not booked
  "unbookedDebits"             numeric(18,2) NOT NULL DEFAULT 0 CHECK ("unbookedDebits" >= 0),    -- bank charges not booked
  "adjustedBookBalance"       numeric(18,2) GENERATED ALWAYS AS ("bookBalance" + "unbookedCredits" - "unbookedDebits") STORED,
  difference                  numeric(18,2) GENERATED ALWAYS AS
                                (("statementBalance" - "unpresentedCheques" + "depositsInTransit")
                                 - ("bookBalance" + "unbookedCredits" - "unbookedDebits")) STORED,
  status                      text NOT NULL DEFAULT 'IN_PROGRESS',
  "closedByUserId"           uuid,
  "closedAt"                   timestamptz,
  remarks                     text,
  "createdAt"                  timestamptz NOT NULL DEFAULT now(),
  "createdBy"                  uuid,
  "updatedAt"                  timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                  uuid,
  "rowVersion"                 integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  UNIQUE ("tenantId", "bankAccountId", "periodTo"),
  FOREIGN KEY ("tenantId", "bankAccountId")     REFERENCES "BankCash"."BankAccounts" ("tenantId", id),
  FOREIGN KEY ("tenantId", "statementImportId") REFERENCES "BankCash"."BankStatementImports" ("tenantId", id),
  FOREIGN KEY ("tenantId", "closedByUserId")   REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "reconciliationPeriodChk" CHECK ("periodTo" >= "periodFrom"),
  CONSTRAINT "reconciliationClosedChk" CHECK (status <> 'CLOSED' OR ("closedByUserId" IS NOT NULL AND "closedAt" IS NOT NULL)),
  CONSTRAINT "reconciliationZeroChk"   CHECK (status <> 'CLOSED' OR
                                         ("statementBalance" - "unpresentedCheques" + "depositsInTransit")
                                         = ("bookBalance" + "unbookedCredits" - "unbookedDebits"))
);
SELECT "Company"."addStandardTriggers"('"BankCash"."BankReconciliations"', true);
CREATE INDEX "reconciliationTenantAccountIdx" ON "BankCash"."BankReconciliations" ("tenantId", "bankAccountId", "periodTo" DESC);
COMMENT ON TABLE "BankCash"."BankReconciliations" IS
  'Bank reconciliation of one account as at periodTo; can only close at zero difference. Closing moves BankAccounts.reconciledTo. Screen: app/bank/reconciliation.';

ALTER TABLE "BankCash"."BankTransactions"
  ADD CONSTRAINT "bankTransactionReconciliationIdFk" FOREIGN KEY ("tenantId", "reconciliationId") REFERENCES "BankCash"."BankReconciliations" ("tenantId", id);

-- Closing a reconciliation advances BankAccounts.reconciledTo.
CREATE OR REPLACE FUNCTION "BankCash"."triggerReconciliationClose"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'CLOSED' AND OLD.status IS DISTINCT FROM 'CLOSED' THEN
    UPDATE "BankCash"."BankAccounts" a
       SET "reconciledTo" = GREATEST(COALESCE(a."reconciledTo", NEW."periodTo"), NEW."periodTo"),
           "lastStatementBalance" = NEW."statementBalance",
           "lastStatementDate" = NEW."periodTo"
     WHERE a."tenantId" = NEW."tenantId" AND a.id = NEW."bankAccountId";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "treasuryReconciliationClose" AFTER UPDATE OF status ON "BankCash"."BankReconciliations"
  FOR EACH ROW EXECUTE FUNCTION "BankCash"."triggerReconciliationClose"();

-- ---------------------------------------------------------------------------
-- BankReconciliationMatches — a statement line and/or a book entry inside a
-- reconciliation, with its match state.
-- Screen: app/bank/reconciliation "Bank statement" (Date, Description,
-- Amount, Matched / Unmatched) and "Book entries" (Date, Voucher, Amount,
-- Matched / Suggested / Unpresented / Amount differs); banner "3 suggestions
-- ready … Create adjustments".
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."BankReconciliationMatches" (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                   uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "reconciliationId"           uuid NOT NULL,
  "statementLineId"           uuid,
  "bankTransactionId"         uuid,                                       -- book side
  "journalEntryId"            uuid,                                       -- book voucher (BRV-2026-000188) → Accounting.Vouchers (fk file)
  status                      text NOT NULL,
  "statementAmount"            numeric(18,2),
  "bookAmount"                 numeric(18,2),
  difference                  numeric(18,2) GENERATED ALWAYS AS (COALESCE("statementAmount", 0) - COALESCE("bookAmount", 0)) STORED,
  "matchMethod"                text,
  confidence                  numeric(5,2) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
  "matchedByUserId"          uuid,
  "matchedAt"                  timestamptz,
  "adjustmentJournalEntryId" uuid,                                       -- "Create adjustments" voucher → Accounting.Vouchers (fk file)
  "createdAt"                  timestamptz NOT NULL DEFAULT now(),
  "createdBy"                  uuid,
  "updatedAt"                  timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                  uuid,
  "rowVersion"                 integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "reconciliationId")   REFERENCES "BankCash"."BankReconciliations" ("tenantId", id),
  FOREIGN KEY ("tenantId", "statementLineId")   REFERENCES "BankCash"."BankStatementLines" ("tenantId", id),
  FOREIGN KEY ("tenantId", "bankTransactionId") REFERENCES "BankCash"."BankTransactions" ("tenantId", id),
  FOREIGN KEY ("tenantId", "matchedByUserId")  REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "reconciliationMatchSideChk"      CHECK (num_nonnulls("statementLineId", "bankTransactionId", "journalEntryId") >= 1),
  CONSTRAINT "reconciliationMatchPairChk"      CHECK (status NOT IN ('MATCHED','SUGGESTED','AMOUNT_DIFFERS')
                                                       OR ("statementLineId" IS NOT NULL
                                                           AND num_nonnulls("bankTransactionId", "journalEntryId") >= 1)),
  CONSTRAINT "reconciliationMatchUnpresentedChk" CHECK (status <> 'UNPRESENTED' OR "statementLineId" IS NULL),
  CONSTRAINT "reconciliationMatchMatchedChk"   CHECK (status <> 'MATCHED' OR "statementAmount" = "bookAmount")
);
SELECT "Company"."addStandardTriggers"('"BankCash"."BankReconciliationMatches"', true);
CREATE INDEX "reconciliationMatchTenantRecIdx" ON "BankCash"."BankReconciliationMatches" ("tenantId", "reconciliationId", status);
CREATE UNIQUE INDEX "reconciliationMatchStmtUq" ON "BankCash"."BankReconciliationMatches" ("tenantId", "reconciliationId", "statementLineId")
  WHERE "statementLineId" IS NOT NULL;
CREATE UNIQUE INDEX "reconciliationMatchBookUq" ON "BankCash"."BankReconciliationMatches" ("tenantId", "reconciliationId", "bankTransactionId")
  WHERE "bankTransactionId" IS NOT NULL;
COMMENT ON TABLE "BankCash"."BankReconciliationMatches" IS
  'Statement-vs-book pairs (or singles) within a reconciliation: MATCHED / UNMATCHED / SUGGESTED / UNPRESENTED / AMOUNT_DIFFERS. Screen: app/bank/reconciliation.';

-- ---------------------------------------------------------------------------
-- ExpenseCategories — categories with policy limits, shared by petty cash
-- vouchers and expense claims.
-- Screens: app/cash/petty "Record petty expense" Category {Refreshments,
-- Stationery, Courier, Local travel, Repairs} (+ Office upkeep in list);
-- app/cash/expenses Category column {Travel, Fuel, Lodging, Meals, Telecom,
-- Training, Courier, Office supplies, Other}, "Policy limit Rs 30,000 per
-- trip", "Charge to 5310-01 Travel — Sales"; ess/expenses src/9C-ess.js CAT
-- {Fuel lim 15,000 per month, Client meal 2,500 per meal, Travel pre-approval,
-- Lodging 12,000 per night, Mobile 3,000 per month, Parking & tolls,
-- Stationery} + policy sheet "Submit within 30 days with an FBR POS or
-- itemised receipt".
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."ExpenseCategories" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                  text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,29}$'),   -- FUEL, CLIENT_MEAL, LODGING
  name                  text NOT NULL,                                          -- Client meal
  "appliesTo"            text NOT NULL DEFAULT 'BOTH',
  "accountId"            uuid NOT NULL,                                          -- default expense GL → Accounting.ChartOfAccounts (fk file)
  "limitAmount"          numeric(18,2) CHECK ("limitAmount" IS NULL OR "limitAmount" > 0),
  "limitPeriod"          text,
  "requiresPreApproval" boolean NOT NULL DEFAULT false,                         -- Travel: "needs pre-approval (TR-…)"
  "receiptRequired"      boolean NOT NULL DEFAULT true,
  "submitWithinDays"    smallint CHECK ("submitWithinDays" IS NULL OR "submitWithinDays" > 0),   -- 30
  icon                  text,
  "sortOrder"            integer NOT NULL DEFAULT 0,
  "isActive"             boolean NOT NULL DEFAULT true,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  "deletedAt"            timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  CONSTRAINT "expenseCategoryLimitChk" CHECK (("limitAmount" IS NULL) = ("limitPeriod" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"BankCash"."ExpenseCategories"', true);
COMMENT ON TABLE "BankCash"."ExpenseCategories" IS
  'Expense categories with GL mapping and policy limits for petty cash and expense claims (ESS + admin). Screens: app/cash/petty, app/cash/expenses, ess/expenses.';

-- ---------------------------------------------------------------------------
-- PettyCashFunds — an imprest fund per branch.
-- Screen: app/cash/petty fund cards (Lahore HQ · Custodian: Nida Shah ·
-- Healthy · Rs 61,250 of Rs 100,000 imprest · Spent this cycle Rs 38,750 ·
-- Since 16 Sep; Karachi Topped up; Islamabad Low; Faisalabad Critical);
-- "Imprest position" (Total imprest, Cash on hand, Vouchers pending
-- replenishment). Cash on hand = GL balance of the fund's CashAccounts.
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."PettyCashFunds" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name                   text NOT NULL,                                   -- Lahore HQ
  "branchId"              uuid NOT NULL,
  "cashAccountId"        uuid NOT NULL,                                   -- kind PETTY / IMPREST (GL 1110-xx)
  "custodianEmployeeId"  uuid,                                            -- Nida Shah → HumanResources.Employees (fk file)
  "custodianUserId"      uuid,
  "imprestAmount"         numeric(18,2) NOT NULL CHECK ("imprestAmount" > 0),     -- Rs 100,000
  "lowPct"                numeric(7,4) NOT NULL DEFAULT 25 CHECK ("lowPct" > 0 AND "lowPct" < 100),
  "criticalPct"           numeric(7,4) NOT NULL DEFAULT 10 CHECK ("criticalPct" > 0 AND "criticalPct" < 100),
  "cycleStartedOn"       date,                                            -- "Since 16 Sep"
  status                 text NOT NULL DEFAULT 'HEALTHY',
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  "deletedAt"             timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "cashAccountId"),
  FOREIGN KEY ("tenantId", "branchId")         REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "cashAccountId")   REFERENCES "BankCash"."CashAccounts" ("tenantId", id),
  FOREIGN KEY ("tenantId", "custodianUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "pettyCashFundPctChk" CHECK ("criticalPct" < "lowPct")
);
SELECT "Company"."addStandardTriggers"('"BankCash"."PettyCashFunds"', true);
CREATE INDEX "pettyCashFundTenantBranchIdx" ON "BankCash"."PettyCashFunds" ("tenantId", "branchId") WHERE "deletedAt" IS NULL;
COMMENT ON TABLE "BankCash"."PettyCashFunds" IS
  'Imprest petty cash funds per branch with custodian and health thresholds. status is maintained by the app after each voucher / top-up (HEALTHY / TOPPED_UP / LOW / CRITICAL). Screen: app/cash/petty.';

-- ---------------------------------------------------------------------------
-- PettyCashReplenishments — "Top-up fund" (CPV/BPV that restores the imprest and
-- books the unreplenished vouchers).
-- Screen: app/cash/petty "Top-up petty cash" modal (Fund *, Date, Pay from
-- {Cash in Hand — Lahore HQ, Meezan Bank — 0123, Bank Alfalah — 5510},
-- Amount (Rs), Replenish vouchers "14 unreplenished vouchers · Rs 37,850",
-- "Post expense vouchers and CPV together"; toast "Faisalabad fund topped up
-- to Rs 40,000").
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."PettyCashReplenishments" (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "fundId"                  uuid NOT NULL,
  "docDate"                 date NOT NULL,
  "payFromCashAccountId" uuid,
  "payFromBankAccountId" uuid,
  amount                   numeric(18,2) NOT NULL CHECK (amount > 0),
  "voucherCount"            integer NOT NULL DEFAULT 0 CHECK ("voucherCount" >= 0),
  "vouchersTotal"           numeric(18,2) NOT NULL DEFAULT 0 CHECK ("vouchersTotal" >= 0),
  "postTogether"            boolean NOT NULL DEFAULT true,                 -- "Post expense vouchers and CPV together"
  status                   text NOT NULL DEFAULT 'DRAFT',
  "journalEntryId"         uuid,                                          -- CPV / BPV → Accounting.Vouchers (fk file)
  remarks                  text,
  "createdAt"               timestamptz NOT NULL DEFAULT now(),
  "createdBy"               uuid,
  "updatedAt"               timestamptz NOT NULL DEFAULT now(),
  "updatedBy"               uuid,
  "rowVersion"              integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "fundId")                  REFERENCES "BankCash"."PettyCashFunds" ("tenantId", id),
  FOREIGN KEY ("tenantId", "payFromCashAccountId") REFERENCES "BankCash"."CashAccounts" ("tenantId", id),
  FOREIGN KEY ("tenantId", "payFromBankAccountId") REFERENCES "BankCash"."BankAccounts" ("tenantId", id),
  CONSTRAINT "pettyReplenishmentSourceChk" CHECK (num_nonnulls("payFromCashAccountId", "payFromBankAccountId") = 1),
  CONSTRAINT "pettyReplenishmentPostedChk" CHECK (status <> 'POSTED' OR "journalEntryId" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."PettyCashReplenishments"', true);
CREATE INDEX "pettyReplenishmentTenantFundIdx" ON "BankCash"."PettyCashReplenishments" ("tenantId", "fundId", "docDate");
COMMENT ON TABLE "BankCash"."PettyCashReplenishments" IS
  'Imprest top-ups: pays the fund back to its imprest and books the unreplenished vouchers. Screen: app/cash/petty.';

-- ---------------------------------------------------------------------------
-- PettyCashVouchers — a small cash expense paid from a fund (PCV).
-- Screen: app/cash/petty "Petty cash expenses" (Date, Ref PC-LHR-0412, Fund,
-- Description, Category, Paid to, Amount, Receipt (paperclip n / Missing /
-- N/A), Status Unreplenished / Replenished; chips All / Unreplenished /
-- Replenished) and "Record petty expense" modal (Fund *, Date, Category,
-- Amount (Rs), Description, Paid to, Attach receipt photo).
-- Doc no pattern {PREFIX}-{BR}-{SEQ4} → PC-LHR-0412.
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."PettyCashVouchers" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"             text NOT NULL,                                      -- Company.getNextDocNo('PCV', date, branch)
  "docDate"           date NOT NULL,
  "fundId"            uuid NOT NULL,
  "categoryId"        uuid NOT NULL,
  description        text NOT NULL,                                      -- Tea, milk & sugar — Sep
  "paidTo"            text NOT NULL,                                      -- Local vendor / TCS Logistics
  amount             numeric(18,2) NOT NULL CHECK (amount > 0),
  "accountId"         uuid NOT NULL,                                      -- expense GL (defaults from category) → Accounting.ChartOfAccounts (fk file)
  "costCentreId"     uuid,                                               -- → Accounting.CostCentres (fk file)
  "receiptStatus"     text NOT NULL DEFAULT 'MISSING',
  "receiptCount"      smallint NOT NULL DEFAULT 0 CHECK ("receiptCount" >= 0),
  status             text NOT NULL DEFAULT 'UNREPLENISHED',
  "replenishmentId"   uuid,
  "recordedByUserId" uuid,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  FOREIGN KEY ("tenantId", "fundId")             REFERENCES "BankCash"."PettyCashFunds" ("tenantId", id),
  FOREIGN KEY ("tenantId", "categoryId")         REFERENCES "BankCash"."ExpenseCategories" ("tenantId", id),
  FOREIGN KEY ("tenantId", "replenishmentId")    REFERENCES "BankCash"."PettyCashReplenishments" ("tenantId", id),
  FOREIGN KEY ("tenantId", "recordedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "pettyCashVoucherReceiptChk"    CHECK (("receiptStatus" = 'ATTACHED') = ("receiptCount" > 0)),
  CONSTRAINT "pettyCashVoucherReplenishChk"  CHECK ((status = 'REPLENISHED') = ("replenishmentId" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"BankCash"."PettyCashVouchers"', true);
CREATE INDEX "pettyCashVoucherTenantFundIdx"   ON "BankCash"."PettyCashVouchers" ("tenantId", "fundId", status, "docDate");
CREATE INDEX "pettyCashVoucherTenantCatIdx"    ON "BankCash"."PettyCashVouchers" ("tenantId", "categoryId", "docDate");
COMMENT ON TABLE "BankCash"."PettyCashVouchers" IS
  'Petty cash expense vouchers (PC-LHR-0412). Expensed when replenished (imprest method). Screen: app/cash/petty.';

-- ---------------------------------------------------------------------------
-- ExpenseClaims — an employee reimbursement claim (EXP). ESS writes the same
-- table (source ESS).
-- Screens: app/cash/expenses (Claim # EXP-0219 + title, Employee + dept,
-- Category, Submitted, Receipts n, Amount, Status Pending / Over policy /
-- Approved / Paid / Rejected; detail: receipts, item lines, Policy limit
-- "Rs 30,000 per trip", Customer "Fatima Group", Charge to "5310-01 Travel —
-- Sales", Line manager "Approved — Ahmed Raza"; Approve / Reject / Pay /
-- "Pay approved" batch; KPI "Policy exceptions"); ess/expenses
-- src/9C-ess.js (Merchant, Date, Amount (Rs), Category, Project / cost
-- centre, Purpose; OCR confidence 97%; tracker Sent → Manager → Finance →
-- Paid; "Reimburse with payroll" / "Paid in PR-2026-08"; Withdraw,
-- Resubmit, Save draft; TR-2026-044 travel request).
-- ---------------------------------------------------------------------------
CREATE TABLE "BankCash"."ExpenseClaims" (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                 uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                    text NOT NULL,                               -- EXP-2026-0219 — Company.getNextDocNo('EXP')
  "docDate"                  date NOT NULL,                               -- expense / receipt date
  "submittedAt"              timestamptz,                                 -- "Submitted 30 Sep 2026"
  "employeeId"               uuid NOT NULL,                               -- → HumanResources.Employees (fk file)
  "branchId"                 uuid NOT NULL,
  source                    text NOT NULL DEFAULT 'ESS',
  title                     text NOT NULL,                               -- "Client visit — Islamabad" / purpose
  merchant                  text,                                        -- PSO Service Station · Ferozepur Rd
  "tripFrom"                 date,                                        -- 26–28 Sep
  "tripTo"                   date,
  "categoryId"               uuid NOT NULL,                               -- primary category
  "costCentreId"            uuid,                                        -- Sales – Lahore North → Accounting.CostCentres (fk file)
  "projectId"                uuid,                                        -- → Accounting.Projects (fk file)
  "customerId"               uuid,                                        -- "Customer: Fatima Group" → Sales.Customers (fk file)
  "chargeAccountId"         uuid,                                        -- "Charge to 5310-01 Travel — Sales" → Accounting.ChartOfAccounts (fk file)
  "travelRequestRef"        text,                                        -- TR-2026-044
  "totalAmount"              numeric(18,2) NOT NULL CHECK ("totalAmount" > 0),
  "approvedAmount"           numeric(18,2) CHECK ("approvedAmount" IS NULL OR "approvedAmount" >= 0),
  "receiptCount"             smallint NOT NULL DEFAULT 0 CHECK ("receiptCount" >= 0),
  "ocrConfidence"            numeric(5,2) CHECK ("ocrConfidence" IS NULL OR "ocrConfidence" BETWEEN 0 AND 100),
  "policyLimitAmount"       numeric(18,2),                               -- snapshot "Rs 30,000 per trip"
  "policyLimitPeriod"       text,
  "isOverPolicy"            boolean NOT NULL DEFAULT false,
  "policyJustification"      text,                                        -- "The excess needs a justification"
  status                    text NOT NULL DEFAULT 'DRAFT',
  "workflowStage"            text NOT NULL DEFAULT 'SENT',
  "approvalRequestId"       uuid,                                        -- Company.Approvals (workflow engine)
  "managerUserId"           uuid,                                        -- line manager (Ahmed Raza / Zainab Raza)
  "managerApprovedAt"       timestamptz,
  "approvedByUserId"       uuid,                                        -- Finance
  "approvedAt"               timestamptz,
  "approvedWithException"   boolean NOT NULL DEFAULT false,              -- "approved with exception"
  "rejectionReason"          text,
  "rejectionComment"         text,                                        -- "Comment to employee"
  "allowResubmit"            boolean NOT NULL DEFAULT true,               -- "Allow employee to resubmit"
  "resubmittedFromClaimId" uuid,
  "paymentMethod"            text,
  "paymentBankAccountId"   uuid,                                        -- "Paid via Bank Alfalah — 5510"
  "payrollRunId"            uuid,                                        -- "paid in PR-2026-08" → Payroll.PayrollRuns (fk file)
  "paidAt"                   timestamptz,
  "approvalJournalEntryId" uuid,                                        -- accrual JV Dr expense / Cr employee payable
  "paymentJournalEntryId"  uuid,                                        -- BPV / CPV on payment
  "createdAt"                timestamptz NOT NULL DEFAULT now(),
  "createdBy"                uuid,
  "updatedAt"                timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                uuid,
  "rowVersion"               integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  FOREIGN KEY ("tenantId", "branchId")                 REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "categoryId")               REFERENCES "BankCash"."ExpenseCategories" ("tenantId", id),
  FOREIGN KEY ("tenantId", "approvalRequestId")       REFERENCES "Company"."Approvals" ("tenantId", id),
  FOREIGN KEY ("tenantId", "managerUserId")           REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "approvedByUserId")       REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "resubmittedFromClaimId") REFERENCES "BankCash"."ExpenseClaims" ("tenantId", id),
  FOREIGN KEY ("tenantId", "paymentBankAccountId")   REFERENCES "BankCash"."BankAccounts" ("tenantId", id),
  CONSTRAINT "expenseClaimTripChk"      CHECK ("tripTo" IS NULL OR "tripFrom" IS NULL OR "tripTo" >= "tripFrom"),
  CONSTRAINT "expenseClaimSubmittedChk" CHECK (status = 'DRAFT' OR "submittedAt" IS NOT NULL),
  CONSTRAINT "expenseClaimOverChk"      CHECK (status <> 'OVER_POLICY' OR "isOverPolicy"),
  CONSTRAINT "expenseClaimApprovedChk"  CHECK (status NOT IN ('APPROVED','PAID') OR ("approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL)),
  CONSTRAINT "expenseClaimRejectedChk"  CHECK ((status = 'REJECTED') = ("rejectionReason" IS NOT NULL)),
  CONSTRAINT "expenseClaimPaidChk"      CHECK (status <> 'PAID' OR ("paidAt" IS NOT NULL AND "paymentMethod" IS NOT NULL)),
  CONSTRAINT "expenseClaimPaySrcChk"   CHECK ("paymentMethod" IS DISTINCT FROM 'BANK_TRANSFER' OR "paymentBankAccountId" IS NOT NULL),
  CONSTRAINT "expenseClaimPayrollChk"   CHECK (status <> 'PAID' OR "paymentMethod" <> 'PAYROLL' OR "payrollRunId" IS NOT NULL),
  CONSTRAINT "expenseClaimApprovedAmtChk" CHECK ("approvedAmount" IS NULL OR "approvedAmount" <= "totalAmount"),
  CONSTRAINT "expenseClaimStageChk"     CHECK (status <> 'PAID' OR "workflowStage" = 'PAID')
);
SELECT "Company"."addStandardTriggers"('"BankCash"."ExpenseClaims"', true);
CREATE INDEX "expenseClaimTenantStatusIdx"   ON "BankCash"."ExpenseClaims" ("tenantId", status, "submittedAt" DESC);
CREATE INDEX "expenseClaimTenantEmployeeIdx" ON "BankCash"."ExpenseClaims" ("tenantId", "employeeId", "docDate" DESC);
CREATE INDEX "expenseClaimTenantCategoryIdx" ON "BankCash"."ExpenseClaims" ("tenantId", "categoryId", "docDate");
COMMENT ON TABLE "BankCash"."ExpenseClaims" IS
  'Employee expense claims (EXP-2026-0219), submitted from ESS or admin; Sent → Manager → Finance → Paid. Screens: app/cash/expenses, ess/expenses, ess/team (approvals).';

-- ExpenseClaimLines — detail items: "Daewoo Express LHR–ISB return 7,800",
-- "Hotel — 2 nights @ Rs 6,500 13,000", "Meals & local transport 3,800";
-- receipt thumbnails "Bus ticket / Hotel bill / Meals".
CREATE TABLE "BankCash"."ExpenseClaimLines" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "claimId"              uuid NOT NULL,
  "lineNo"               smallint NOT NULL CHECK ("lineNo" > 0),
  "expenseDate"          date,
  description           text NOT NULL,
  "categoryId"           uuid,
  merchant              text,
  qty                   numeric(18,3) CHECK (qty IS NULL OR qty > 0),     -- 2 nights
  "unitAmount"           numeric(18,2) CHECK ("unitAmount" IS NULL OR "unitAmount" >= 0),   -- @ Rs 6,500
  amount                numeric(18,2) NOT NULL CHECK (amount > 0),
  "accountId"            uuid,                                             -- → Accounting.ChartOfAccounts (fk file)
  "costCentreId"        uuid,                                             -- → Accounting.CostCentres (fk file)
  "receiptAttachmentId" uuid,
  "isOverPolicy"        boolean NOT NULL DEFAULT false,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "claimId", "lineNo"),
  FOREIGN KEY ("tenantId", "claimId")              REFERENCES "BankCash"."ExpenseClaims" ("tenantId", id),
  FOREIGN KEY ("tenantId", "categoryId")           REFERENCES "BankCash"."ExpenseCategories" ("tenantId", id),
  FOREIGN KEY ("tenantId", "receiptAttachmentId") REFERENCES "Company"."Attachments" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."ExpenseClaimLines"', true);
COMMENT ON TABLE "BankCash"."ExpenseClaimLines" IS
  'Item lines of an expense claim with their receipt. Screens: app/cash/expenses (detail panel), ess/expenses.';

-- ExpenseClaimActions — the approval / payment trail (append-only).
-- ESS tracker subs: Bilal Khan (Sent) · Zainab Raza (Manager) · Hira Ali
-- (Finance) · Payroll (Paid); "Rejected by Zainab Raza"; Withdraw; Resubmit.
CREATE TABLE "BankCash"."ExpenseClaimActions" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "claimId"         uuid NOT NULL,
  action           text NOT NULL,
  stage            text NOT NULL,
  "actorUserId"    uuid,
  "actedAt"         timestamptz NOT NULL DEFAULT now(),
  comment          text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "claimId")      REFERENCES "BankCash"."ExpenseClaims" ("tenantId", id),
  FOREIGN KEY ("tenantId", "actorUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"BankCash"."ExpenseClaimActions"');
CREATE TRIGGER "treasuryExpenseClaimActionAppendOnly" BEFORE UPDATE OR DELETE ON "BankCash"."ExpenseClaimActions"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();
CREATE INDEX "expenseClaimActionTenantClaimIdx" ON "BankCash"."ExpenseClaimActions" ("tenantId", "claimId", "actedAt");
COMMENT ON TABLE "BankCash"."ExpenseClaimActions" IS
  'Append-only trail of an expense claim (submit, approvals, rejection, payment). Screens: app/cash/expenses, ess/expenses.';
