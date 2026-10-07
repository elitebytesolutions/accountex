-- =============================================================================
-- Finsoft ERP — 95-seed-reference.sql
-- GLOBAL reference data only (no tenant rows). Tenant-level seeds — chart of
-- accounts, tax codes, units, movement reasons, leave types, salary components,
-- document sequences — are copied per tenant by provisioning (Onboard Tenant
-- step "Seed COA, tax codes, leave types, salary components") from the
-- platform templates and Company.DocumentTypes defaults.
--
-- This is the erp-basic copy: Full-only blocks removed.
-- Company.PostingRoles is seeded inside 02-core.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Currencies (Company Settings → multi-currency; Tax Calculator PKR/USD/AED/SAR)
-- ---------------------------------------------------------------------------
INSERT INTO "Company"."Currencies" (code, name, symbol, "minorUnits") VALUES
  ('PKR', 'Pakistani Rupee',   'Rs',  2),
  ('USD', 'US Dollar',         '$',   2),
  ('AED', 'UAE Dirham',        'AED', 2),
  ('SAR', 'Saudi Riyal',       'SAR', 2),
  ('EUR', 'Euro',              '€',   2),
  ('GBP', 'Pound Sterling',    '£',   2),
  ('CNY', 'Chinese Yuan',      '¥',   2)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Document types (contract §6). Defaults copied into Company.NumberingSeries per
-- tenant at provisioning; tenants edit them on Company Settings → Numbering.
-- ---------------------------------------------------------------------------
INSERT INTO "Company"."DocumentTypes" (code, name, module, "tableName", "defaultPrefix", "defaultPattern",
                           "defaultPadding", "defaultResetPolicy", "isPostingDoc", "isMaster",
                           "supportsApproval", "sortOrder") VALUES
  -- core
  ('IMP',  'Data import job',            'core',     '"Company"."DataImports"',            'IMP',  '{PREFIX}-{YYYY}-{SEQ4}', 4, 'YEARLY', false, false, false, 10),
  -- accounting
  ('JV',   'Journal voucher',            'acc',      '"Accounting"."Vouchers"',          'JV',   '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, true,  100),
  ('CPV',  'Cash payment voucher',       'acc',      '"Accounting"."Vouchers"',          'CPV',  '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, true,  101),
  ('CRV',  'Cash receipt voucher',       'acc',      '"Accounting"."Vouchers"',          'CRV',  '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, true,  102),
  ('BPV',  'Bank payment voucher',       'acc',      '"Accounting"."Vouchers"',          'BPV',  '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, true,  103),
  ('BRV',  'Bank receipt voucher',       'acc',      '"Accounting"."Vouchers"',          'BRV',  '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, true,  104),
  ('CON',  'Contra voucher',             'acc',      '"Accounting"."Vouchers"',          'CON',  '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, true,  105),
  ('OB',   'Opening balance',            'acc',      '"Accounting"."OpeningBalances"',  'OB',   '{PREFIX}-{YYYY}-{SEQ4}', 4, 'YEARLY', true,  false, false, 106),
  -- treasury
  ('CHQ',  'Cheque',                     'treasury', '"BankCash"."Cheques"',            'CHQ',  '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, false, 200),
  -- tax
  -- sales
  ('CUST', 'Customer',                   'sales',    '"Sales"."Customers"',             'CUST', '{PREFIX}-{SEQ4}',        4, 'NEVER',  false, true,  false, 400),
  ('QT',   'Quotation',                  'sales',    '"Sales"."Quotations"',            'QT',   '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', false, false, false, 401),
  ('SO',   'Sales order',                'sales',    '"Sales"."SalesOrders"',          'SO',   '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', false, false, true,  402),
  ('INV',  'Sales invoice',              'sales',    '"Sales"."SalesInvoices"',              'INV',  '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, true,  403),
  ('SV',   'Sales voucher (counter)',    'sales',    '"Sales"."SalesInvoices"',              'SV',   '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, false, 404),
  ('CN',   'Credit note',                'sales',    '"Sales"."CreditNotes"',          'CN',   '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, true,  405),
  ('RCPT', 'Customer receipt',           'sales',    '"Sales"."CustomerReceipts"',              'RCPT', '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, false, 406),
  -- purchase
  ('VEN',  'Vendor',                     'purchase', '"Purchases"."Vendors"',            'VEN',  '{PREFIX}-{SEQ4}',        4, 'NEVER',  false, true,  false, 500),
  ('PO',   'Purchase order',             'purchase', '"Purchases"."PurchaseOrders"',    'PO',   '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', false, false, true,  501),
  ('GRN',  'Goods received note',        'purchase', '"Purchases"."GoodsReceivedNotes"',               'GRN',  '{PREFIX}-{YYYY}-{SEQ4}', 4, 'YEARLY', true,  false, false, 502),
  ('BILL', 'Vendor bill',                'purchase', '"Purchases"."VendorBills"',              'BILL', '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, true,  503),
  ('PV',   'Purchase voucher (counter)', 'purchase', '"Purchases"."VendorBills"',              'PV',   '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, false, 504),
  ('DN',   'Debit note',                 'purchase', '"Purchases"."DebitNotes"',        'DN',   '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, true,  505),
  ('PAY',  'Vendor payment',             'purchase', '"Purchases"."VendorPayments"',    'PAY',  '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, true,  506),
  -- inventory
  ('ITEM', 'Item',                       'inv',      '"Inventory"."Products"',                   'PK',   '{PREFIX}-{SEQ4}',        4, 'NEVER',  false, true,  false, 600),
  ('MFR',  'Manufacturer / company',     'inv',      '"Inventory"."ProductCompanies"',           'CO',   '{PREFIX}-{SEQ2}',        2, 'NEVER',  false, true,  false, 601),
  ('WH',   'Warehouse',                  'inv',      '"Inventory"."Warehouses"',              'WH',   '{PREFIX}-{SEQ3}',        3, 'NEVER',  false, true,  false, 602),
  ('MI',   'Manual stock in',            'inv',      '"Inventory"."StockInOut"',     'MI',   '{PREFIX}-{SEQ6}',        6, 'NEVER',  true,  false, false, 603),
  ('MO',   'Manual stock out',           'inv',      '"Inventory"."StockInOut"',     'MO',   '{PREFIX}-{SEQ6}',        6, 'NEVER',  true,  false, false, 604),
  ('TRF',  'Stock transfer',             'inv',      '"Inventory"."StockTransfers"',         'TRF',  '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', false, false, false, 605),
  ('ADJ',  'Stock adjustment',           'inv',      '"Inventory"."StockAdjustments"',       'ADJ',  '{PREFIX}-{YYYY}-{SEQ6}', 6, 'YEARLY', true,  false, true,  606)
ON CONFLICT (code) DO NOTHING;


-- ---------------------------------------------------------------------------
-- Permission catalogue — exactly the matrix on app/settings/roles
-- (src/9E-cash-users.js: resource, label, allowed actions V C E A P D X).
-- One row per resource × allowed action, code '<resource>:<action>'.
-- ---------------------------------------------------------------------------
WITH matrix (grp, resource, label, actions, "sortOrder") AS (
  VALUES
    ('FINANCE',         'coa',   'Chart of accounts',        'VCEDX',   10),
    ('FINANCE',         'vch',   'Journal vouchers',         'VCEAPDX', 11),
    ('FINANCE',         'cash',  'Cash book & petty cash',   'VCEAPDX', 12),
    ('FINANCE',         'bank',  'Bank & cheques',           'VCEAPDX', 13),
    ('FINANCE',         'tax',   'Tax & compliance',         'VCEAPX',  16),
    ('FINANCE',         'close', 'Period close',             'VAPX',    18),
    ('FINANCE',         'frep',  'Financial reports',        'VX',      19),
    ('SALES_PURCHASES', 'quo',   'Quotations & orders',      'VCEADX',  20),
    ('SALES_PURCHASES', 'sinv',  'Sales invoices',           'VCEAPDX', 21),
    ('SALES_PURCHASES', 'rcpt',  'Customer receipts',        'VCEAPDX', 22),
    ('SALES_PURCHASES', 'cust',  'Customers',                'VCEDX',   23),
    ('SALES_PURCHASES', 'po',    'Purchase orders',          'VCEADX',  24),
    ('SALES_PURCHASES', 'bill',  'Vendor bills',             'VCEAPDX', 25),
    ('SALES_PURCHASES', 'vpay',  'Vendor payments',          'VCEAPDX', 26),
    ('SALES_PURCHASES', 'vend',  'Vendors',                  'VCEDX',   27),
    ('INVENTORY',       'item',  'Items & services',         'VCEDX',   30),
    ('INVENTORY',       'grn',   'Goods received (GRN)',     'VCEAPDX', 31),
    ('INVENTORY',       'adj',   'Stock adjustments',        'VCEAPDX', 32),
    ('INVENTORY',       'xfer',  'Stock transfers',          'VCEAPX',  33),
    ('INVENTORY',       'wh',    'Warehouses',               'VCEDX',   34),
    ('INVENTORY',       'irep',  'Inventory reports',        'VX',      35),
    ('SYSTEM',          'comp',  'Company settings',         'VEX',     50),
    ('SYSTEM',          'usr',   'Users',                    'VCEDX',   51),
    ('SYSTEM',          'rol',   'Roles & permissions',      'VCEDX',   52),
    ('SYSTEM',          'aud',   'Audit trail',              'VX',      55),
    ('SYSTEM',          'bak',   'Backup & import',          'VCX',     56)
)
INSERT INTO "Company"."Permissions" (code, module, resource, "resourceLabel", action, "sortOrder")
SELECT m.resource || ':' || lower(a.action), m.grp, m.resource, m.label, a.action,
       m."sortOrder" * 10 + a.ord
  FROM matrix m
  CROSS JOIN LATERAL (
    SELECT CASE ch WHEN 'V' THEN 'VIEW' WHEN 'C' THEN 'CREATE' WHEN 'E' THEN 'EDIT' WHEN 'A' THEN 'APPROVE'
                   WHEN 'P' THEN 'POST' WHEN 'D' THEN 'DELETE' WHEN 'X' THEN 'EXPORT' END AS action,
           ord::int
      FROM regexp_split_to_table(m.actions, '') WITH ORDINALITY AS t(ch, ord)
  ) a
ON CONFLICT (code) DO NOTHING;


-- ---------------------------------------------------------------------------
-- Plans (admin/plans price book). Annual = 10 × monthly ("2 months free").
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."SubscriptionPlans" (code, name, tagline, "priceMonthly", "priceAnnual", "userSeats", "storageGb",
                           "trialDays", "sortOrder") VALUES
  ('STARTER',    'Starter',    'For small traders getting their books in order.',   9999,  99990,    5,  10, 14, 1),
  ('GROWTH',     'Growth',     'Accounting + HR for growing SMEs.',                24999, 249990,   50,  50, 14, 2),
  ('BUSINESS',   'Business',   'Multi-branch companies with approvals.',           49999, 499990,  200, 100, 30, 3),
  ('ENTERPRISE', 'Enterprise', 'Groups, dedicated infra and SLAs.',               180000,1800000, NULL, NULL, 30, 4)
ON CONFLICT (code) DO NOTHING;

-- Plan × module matrix (admin/plans feature matrix; "Fixed assets / Recruitment: Add-on")
INSERT INTO "Platform"."SubscriptionPlanFeatures" ("planId", "moduleKey", inclusion, "addonPrice")
SELECT p.id, f."moduleKey", f.inclusion, f."addonPrice"
  FROM (VALUES
    ('STARTER','ACC','INCLUDED',NULL), ('STARTER','SAL','INCLUDED',NULL), ('STARTER','PUR','INCLUDED',NULL),
    ('STARTER','INV','NOT_AVAILABLE',NULL), ('STARTER','FA','NOT_AVAILABLE',NULL), ('STARTER','PAY','NOT_AVAILABLE',NULL),
    ('STARTER','ATT','NOT_AVAILABLE',NULL), ('STARTER','REC','NOT_AVAILABLE',NULL), ('STARTER','ESS','NOT_AVAILABLE',NULL),
    ('STARTER','FBR','NOT_AVAILABLE',NULL), ('STARTER','DIST','NOT_AVAILABLE',NULL), ('STARTER','POS','NOT_AVAILABLE',NULL),
    ('GROWTH','ACC','INCLUDED',NULL), ('GROWTH','SAL','INCLUDED',NULL), ('GROWTH','PUR','INCLUDED',NULL),
    ('GROWTH','INV','INCLUDED',NULL), ('GROWTH','FA','ADDON',2500), ('GROWTH','PAY','INCLUDED',NULL),
    ('GROWTH','ATT','INCLUDED',NULL), ('GROWTH','REC','ADDON',2500), ('GROWTH','ESS','INCLUDED',NULL),
    ('GROWTH','FBR','NOT_AVAILABLE',NULL), ('GROWTH','DIST','NOT_AVAILABLE',NULL), ('GROWTH','POS','NOT_AVAILABLE',NULL),
    ('BUSINESS','ACC','INCLUDED',NULL), ('BUSINESS','SAL','INCLUDED',NULL), ('BUSINESS','PUR','INCLUDED',NULL),
    ('BUSINESS','INV','INCLUDED',NULL), ('BUSINESS','FA','INCLUDED',NULL), ('BUSINESS','PAY','INCLUDED',NULL),
    ('BUSINESS','ATT','INCLUDED',NULL), ('BUSINESS','REC','INCLUDED',NULL), ('BUSINESS','ESS','INCLUDED',NULL),
    ('BUSINESS','FBR','INCLUDED',NULL), ('BUSINESS','DIST','INCLUDED',NULL), ('BUSINESS','POS','INCLUDED',NULL),
    ('ENTERPRISE','ACC','INCLUDED',NULL), ('ENTERPRISE','SAL','INCLUDED',NULL), ('ENTERPRISE','PUR','INCLUDED',NULL),
    ('ENTERPRISE','INV','INCLUDED',NULL), ('ENTERPRISE','FA','INCLUDED',NULL), ('ENTERPRISE','PAY','INCLUDED',NULL),
    ('ENTERPRISE','ATT','INCLUDED',NULL), ('ENTERPRISE','REC','INCLUDED',NULL), ('ENTERPRISE','ESS','INCLUDED',NULL),
    ('ENTERPRISE','FBR','INCLUDED',NULL), ('ENTERPRISE','DIST','INCLUDED',NULL), ('ENTERPRISE','POS','INCLUDED',NULL)
  ) AS f("planCode", "moduleKey", inclusion, "addonPrice")
  JOIN "Platform"."SubscriptionPlans" p ON p.code = f."planCode"
ON CONFLICT ("planId", "moduleKey") DO NOTHING;
