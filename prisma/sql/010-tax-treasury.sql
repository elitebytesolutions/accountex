-- Phase 4: Tax & treasury setup (tax codes, banks & bank accounts, cash accounts & categories, cheque books,
-- expense categories). Idempotent. Apply with: npm run db:sql

-- ---------------------------------------------------------------------------
-- 1. Audit coverage (row history)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "banksAudit" ON "BankCash"."Banks";
CREATE TRIGGER "banksAudit" AFTER INSERT OR UPDATE OR DELETE ON "BankCash"."Banks"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "cashCategoriesAudit" ON "BankCash"."CashCategories";
CREATE TRIGGER "cashCategoriesAudit" AFTER INSERT OR UPDATE OR DELETE ON "BankCash"."CashCategories"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Cheque leaf ranges may not overlap within a bank account (cancelled books excluded).
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chequeBookNoOverlap') THEN
    ALTER TABLE "BankCash"."ChequeBooks" ADD CONSTRAINT "chequeBookNoOverlap"
      EXCLUDE USING gist ("tenantId" WITH =, "bankAccountId" WITH =, int8range("firstLeafNo", "lastLeafNo", '[]') WITH &&)
      WHERE (status <> 'CANCELLED');
  END IF;
END $do$;

-- ---------------------------------------------------------------------------
-- 2b. "Is this row used anywhere?" for delete-vs-deactivate decisions. Follows the real foreign keys that point at
--     the table's id (single or composite with tenantId), so tables added later are covered without code changes.
--     pIgnore lists child tables owned by the row itself (e.g. a tax code's own rates). Soft-deleted children
--     (deletedAt set) don't count: they are kept only for history.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."isReferenced"("pTable" regclass, "pId" uuid, "pIgnore" regclass[] DEFAULT '{}')
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vFk" record;
  "vHit" boolean;
BEGIN
  FOR "vFk" IN
    SELECT c.conrelid::regclass AS child, a.attname AS col,
           EXISTS (SELECT 1 FROM pg_attribute d WHERE d.attrelid = c.conrelid AND d.attname = 'deletedAt' AND NOT d.attisdropped) AS soft
      FROM pg_constraint c
      JOIN LATERAL unnest(c.confkey, c.conkey) AS k(pk, ck) ON true
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = k.pk AND pa.attname = 'id'
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.ck
     WHERE c.contype = 'f' AND c.confrelid = "pTable" AND c.conrelid <> ALL ("pIgnore")
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1%s)', "vFk".child, "vFk".col,
                   CASE WHEN "vFk".soft THEN ' AND "deletedAt" IS NULL' ELSE '' END) INTO "vHit" USING "pId";
    IF "vHit" THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $function$;

-- ---------------------------------------------------------------------------
-- 3. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('TAX_RATE_OVERLAP',             422, 'VALIDATION',    'FINANCE', 'Rate periods of a tax code can''t overlap.', 'Tax code rates with overlapping effective dates', true, NULL),
  ('CHEQUE_BOOK_OVERLAP',          422, 'VALIDATION',    'FINANCE', 'These leaf numbers overlap another cheque book of this bank account.', 'Cheque book leaf range overlap', true, NULL),
  ('PRIMARY_BANK_EXISTS',          409, 'CONFLICT',      'FINANCE', 'Another bank account is already the primary account.', 'Second PRIMARY bank account', true, NULL),
  ('GL_ACCOUNT_LINKED',            422, 'VALIDATION',    'FINANCE', 'This GL account is already linked to another bank or cash account.', 'GL account used by another bank/cash account', true, NULL),
  ('BANK_ACCOUNT_HAS_ACTIVE_BOOK', 409, 'BUSINESS_RULE', 'FINANCE', 'Cancel or finish the active cheque book before closing this bank account.', 'Close bank account with an active cheque book', true, NULL),
  ('TAX_CODE_IN_USE',              409, 'BUSINESS_RULE', 'FINANCE', 'This tax code is used on documents or settings. Deactivate it instead.', 'Delete of a referenced tax code', true, NULL),
  ('BANK_IN_USE',                  409, 'BUSINESS_RULE', 'FINANCE', 'This bank has accounts or cheques. Deactivate it instead.', 'Delete of a referenced bank', true, NULL),
  ('BANK_ACCOUNT_IN_USE',          409, 'BUSINESS_RULE', 'FINANCE', 'This bank account has cheque books or transactions. Mark it dormant or close it instead.', 'Delete of a referenced bank account', true, NULL),
  ('CHEQUE_BOOK_IN_USE',           409, 'BUSINESS_RULE', 'FINANCE', 'Cheques were written from this book. Cancel it instead.', 'Delete of a used cheque book', true, NULL),
  ('CASH_ACCOUNT_IN_USE',          409, 'BUSINESS_RULE', 'FINANCE', 'This cash account has entries. Deactivate it instead.', 'Delete of a referenced cash account', true, NULL),
  ('CASH_CATEGORY_IN_USE',         409, 'BUSINESS_RULE', 'FINANCE', 'This category is used by cash book entries, or is a system category. Deactivate it instead.', 'Delete of a used or system cash category', true, NULL),
  ('EXPENSE_CATEGORY_IN_USE',      409, 'BUSINESS_RULE', 'FINANCE', 'This category is used by claims or petty cash vouchers. Deactivate it instead.', 'Delete of a used expense category', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 4. Common Pakistani banks for every company: at provisioning, and backfilled now.
--    Reference data (SWIFT / IBAN bank code); inserts only the codes a company doesn't have yet.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "BankCash"."seedBanksFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE "vCount" integer;
BEGIN
  INSERT INTO "BankCash"."Banks" ("tenantId", code, name, "shortName", "swiftBic", "ibanBankCode", "isIslamic")
  SELECT "pTenant", v.code, v.name, v.short, v.swift, v.iban, v.islamic
    FROM (VALUES
      ('HBL',         'Habib Bank Limited',                 'HBL',          'HABBPKKA', 'HABB', false),
      ('MCB',         'MCB Bank Limited',                   'MCB',          'MUCBPKKA', 'MUCB', false),
      ('UBL',         'United Bank Limited',                'UBL',          'UNILPKKA', 'UNIL', false),
      ('ABL',         'Allied Bank Limited',                'ABL',          'ABPAPKKA', 'ABPA', false),
      ('NBP',         'National Bank of Pakistan',          'NBP',          'NBPAPKKA', 'NBPA', false),
      ('MEEZAN',      'Meezan Bank Limited',                'Meezan Bank',  'MEZNPKKA', 'MEZN', true),
      ('ALFALAH',     'Bank Alfalah Limited',               'Bank Alfalah', 'ALFHPKKA', 'ALFH', false),
      ('FAYSAL',      'Faysal Bank Limited',                'Faysal Bank',  'FAYSPKKA', 'FAYS', true),
      ('BAHL',        'Bank AL Habib Limited',              'Bank AL Habib','BAHLPKKA', 'BAHL', false),
      ('ASKARI',      'Askari Bank Limited',                'Askari Bank',  'ASCMPKKA', 'ASCM', false),
      ('JS',          'JS Bank Limited',                    'JS Bank',      'JSBLPKKA', 'JSBL', false),
      ('SONERI',      'Soneri Bank Limited',                'Soneri Bank',  'SONEPKKA', 'SONE', false),
      ('SCB',         'Standard Chartered Bank (Pakistan)', 'Standard Chartered', 'SCBLPKKX', 'SCBL', false),
      ('HMB',         'Habib Metropolitan Bank',            'Habib Metro',  'MPBLPKKA', 'MPBL', false),
      ('DIB',         'Dubai Islamic Bank Pakistan',        'DIB Pakistan', 'DUIBPKKA', 'DUIB', true),
      ('BANKISLAMI',  'BankIslami Pakistan Limited',        'BankIslami',   'BKIPPKKA', 'BKIP', true),
      ('ALBARAKA',    'Al Baraka Bank (Pakistan)',          'Al Baraka',    'AIINPKKA', 'AIIN', true),
      ('MCB_ISLAMIC', 'MCB Islamic Bank',                   'MCB Islamic',  'MCIBPKKA', 'MCIB', true),
      ('BOP',         'The Bank of Punjab',                 'Bank of Punjab','BPUNPKKA', 'BPUN', false),
      ('SINDH',       'Sindh Bank Limited',                 'Sindh Bank',   'SINDPKKA', 'SIND', false),
      ('BOK',         'The Bank of Khyber',                 'Bank of Khyber','KHYBPKKA', 'KHYB', false),
      ('SILK',        'Silkbank Limited',                   'Silkbank',     'SAUDPKKA', 'SAUD', false),
      ('SUMMIT',      'Summit Bank Limited',                'Summit Bank',  'SUMBPKKA', 'SUMB', false),
      ('SAMBA',       'Samba Bank Limited',                 'Samba Bank',   'SAMBPKKA', 'SAMB', false),
      ('FWBL',        'First Women Bank Limited',           'First Women Bank', 'FWOMPKKA', 'FWOM', false),
      ('CITI',        'Citibank N.A. Pakistan',             'Citibank',     'CITIPKKX', 'CITI', false)
    ) AS v(code, name, short, swift, iban, islamic)
   WHERE NOT EXISTS (SELECT 1 FROM "BankCash"."Banks" b WHERE b."tenantId" = "pTenant" AND b.code = v.code);
  GET DIAGNOSTICS "vCount" = ROW_COUNT;
  RETURN "vCount";
END $function$;

CREATE OR REPLACE FUNCTION "BankCash"."triggerTenantBanks"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "BankCash"."seedBanksFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsBanks" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsBanks" AFTER INSERT ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "BankCash"."triggerTenantBanks"();

SELECT set_config('app.actorLabel', '010-tax-treasury.sql', true);
SELECT "BankCash"."seedBanksFor"(t.id) FROM "Platform"."Tenants" t;

-- ---------------------------------------------------------------------------
-- 5. Readable labels for the Phase 4 selects (template wording). Labels only; codes unchanged.
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" l
   SET "label" = v.label
  FROM (VALUES
    ('AccountType','SAVINGS_PLS','Savings / PLS'),
    ('TaxCodeAppliesTo','SALES_AND_PURCHASES','Sales & purchases'), ('TaxCodeAppliesTo','SALES','Sales invoices'),
    ('RateBasis','PERCENT','Percentage'), ('RateBasis','SLAB','Slab rates'), ('RateBasis','NONE','Not taxed'),
    ('CashAccountKind','DRAWER','Cash drawer'), ('CashAccountKind','COUNTER','Cash counter'), ('CashAccountKind','PETTY','Petty cash'),
    ('CashCategoryVoucherType','CRV','Cash receipt (CRV)'), ('CashCategoryVoucherType','CPV','Cash payment (CPV)'),
    ('CashCategoryVoucherType','BRV','Bank receipt (BRV)'), ('CashCategoryVoucherType','BPV','Bank payment (BPV)'),
    ('CashCategoryVoucherType','JV','Journal (JV)'),
    ('ExpenseCategoryAppliesTo','PETTY','Petty cash'), ('ExpenseCategoryAppliesTo','CLAIM','Expense claims'),
    ('StatementFormat','BANK_CSV','Bank CSV')
  ) AS v(type, code, label)
 WHERE l."lookupType" = v.type AND l.code = v.code AND l."tenantId" IS NULL AND l."label" IS DISTINCT FROM v.label;
