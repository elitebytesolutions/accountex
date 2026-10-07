-- Tenant workspace system roles: the SystemKey lookup behind Company.Roles."systemKey".
-- Idempotent. Apply with: npx prisma db execute --file prisma/sql/002-tenant-role-lookups.sql

INSERT INTO "Lookups"."Lookups" ("lookupType", "code", "label", "description", "tone", "sortOrder", "isActive", "isSystem")
VALUES
  ('SystemKey', 'ADMIN',                'Admin',                'Full access to the workspace, users, roles and settings.',          'neutral', 1, true, true),
  ('SystemKey', 'FINANCIAL_ACCOUNTANT', 'Financial Accountant', 'Vouchers, bank, cash, tax, receivables, payables and reports.',     'neutral', 2, true, true),
  ('SystemKey', 'HR_MANAGER',           'HR Manager',           'People, attendance, leave, payroll and talent.',                    'neutral', 3, true, true),
  ('SystemKey', 'SALESMAN',             'Salesman',             'Sales documents, own customers, receipts and route recovery.',      'neutral', 4, true, true),
  ('SystemKey', 'DELIVERYMAN',          'Deliveryman',          'Load sheets, delivery challans and delivery confirmation.',         'neutral', 5, true, true),
  ('SystemKey', 'STOREKEEPER',          'Storekeeper',          'Receives goods, adjusts and transfers stock.',                      'neutral', 6, true, true),
  ('SystemKey', 'CASHIER',              'Cashier',              'Cash book, petty cash, receipts and route cash counts.',            'neutral', 7, true, true),
  ('SystemKey', 'ORDER_BOOKER',         'Order Booker',         'Order bookings on assigned routes.',                                'neutral', 8, true, true),
  ('SystemKey', 'AUDITOR',              'Auditor (read-only)',  'Views and exports everything, changes nothing.',                    'neutral', 9, true, true)
ON CONFLICT ("lookupType", "code", "tenantId") DO UPDATE SET
  "label"       = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "tone"        = EXCLUDED."tone",
  "sortOrder"   = EXCLUDED."sortOrder",
  "isActive"    = true,
  "isSystem"    = true;

-- Prototype role keys that are not part of the workspace role list: kept for history, no longer offered.
UPDATE "Lookups"."Lookups"
SET "isActive" = false
WHERE "lookupType" = 'SystemKey'
  AND "tenantId" IS NULL
  AND "code" IN ('OWNER', 'FINANCE_MANAGER', 'ACCOUNTANT', 'PAYROLL_OFFICER', 'SALES_EXECUTIVE');
