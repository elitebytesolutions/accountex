-- Wholesale & distribution: one permission resource per screen, under module DISTRIBUTION.
-- Replaces the single catch-all `dist` resource that sat under SALES_PURCHASES.
-- Idempotent. Apply with: npm run db:sql

INSERT INTO "Company"."Permissions" ("code", "module", "resource", "resourceLabel", "action", "sortOrder")
SELECT s.resource || ':' || lower(a.action), 'DISTRIBUTION', s.resource, s.label, a.action, s.base + a.ord
FROM (VALUES
  ('wsentry',   'Quick wholesale entry',        800, ARRAY['VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT']),
  ('bulkinv',   'Bulk invoicing',               810, ARRAY['VIEW', 'CREATE', 'APPROVE', 'POST', 'EXPORT']),
  ('booking',   'Order bookings',               820, ARRAY['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'DELETE', 'EXPORT']),
  ('backord',   'Back-orders',                  830, ARRAY['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'EXPORT']),
  ('loadsht',   'Load sheets',                  840, ARRAY['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'POST', 'EXPORT']),
  ('delivery',  'Delivery confirmation',        850, ARRAY['VIEW', 'EDIT']),
  ('settle',    'Route settlement',             860, ARRAY['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'POST', 'EXPORT']),
  ('recov',     'Recovery sheets',              870, ARRAY['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'POST', 'EXPORT']),
  ('route',     'Routes & shop areas',          880, ARRAY['VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT']),
  ('van',       'Vans',                         890, ARRAY['VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT']),
  ('target',    'Salesman targets & commission', 900, ARRAY['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'POST', 'EXPORT']),
  ('pricetier', 'Price tiers',                  910, ARRAY['VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT']),
  ('crovr',     'Credit overrides',             920, ARRAY['VIEW', 'APPROVE', 'EXPORT']),
  ('drep',      'Distribution reports',         930, ARRAY['VIEW', 'EXPORT'])
) AS s(resource, label, base, actions)
CROSS JOIN LATERAL unnest(s.actions) WITH ORDINALITY AS a(action, ord)
ON CONFLICT ("code") DO UPDATE SET
  "module"        = EXCLUDED."module",
  "resourceLabel" = EXCLUDED."resourceLabel",
  "sortOrder"     = EXCLUDED."sortOrder";

-- Retire the catch-all resource: grants first (foreign key), then the permissions.
DELETE FROM "Company"."RolePermissions" WHERE "permissionCode" LIKE 'dist:%';
DELETE FROM "Company"."Permissions" WHERE "resource" = 'dist';
