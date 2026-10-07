-- =============================================================================
-- Finsoft ERP (Basic edition) — install.sql
-- Builds the whole database in dependency order. Run from this folder:
--   createdb finsoft && psql -v ON_ERROR_STOP=1 -d finsoft -f install.sql
-- Requires PostgreSQL 16+ and a role allowed to create extensions and roles.
-- =============================================================================
\set ON_ERROR_STOP on
BEGIN;

-- 1. Foundation, platform, the Lookups table, then every module (tables + intra-module FKs)
\ir schema/00-foundation.sql
\ir schema/01-platform.sql
\ir schema/01a-lookups.sql
\ir schema/02-core.sql
\ir schema/03-acc.sql
\ir schema/04-treasury.sql
\ir schema/06-tax.sql
\ir schema/07-sales.sql
\ir schema/08-purchase.sql
\ir schema/09-inv.sql

-- 2. Cross-module foreign keys
\ir fk/02-core-fks.sql
\ir fk/03-acc-fks.sql
\ir fk/04-treasury-fks.sql
\ir fk/06-tax-fks.sql
\ir fk/07-sales-fks.sql
\ir fk/08-purchase-fks.sql
\ir fk/09-inv-fks.sql

-- 3. Report & dashboard views (get…) in dependency order
\ir views/90-core-views.sql
\ir views/90-acc-views.sql
\ir views/90-treasury-views.sql
\ir views/90-tax-views.sql
\ir views/90-sales-views.sql
\ir views/90-purchase-views.sql
\ir views/90-inv-views.sql
\ir views/90-platform-views.sql

-- 4. Data-access functions: shared helpers, then per module <entity>AddUpdate / get<Entity>Info / actions (-api)
--    followed by its posting hooks (-posting: journal entries and stock movements of each action)
\ir api/00-Lookups-api.sql
\ir api/00-Posting-api.sql
\ir api/01-Platform-api.sql
\ir api/02-Company-api.sql
\ir api/03-Accounting-api.sql
\ir api/04-BankCash-api.sql
\ir api/04-BankCash-posting.sql
\ir api/06-Tax-api.sql
\ir api/07-Sales-api.sql
\ir api/07-Sales-posting.sql
\ir api/08-Purchases-api.sql
\ir api/08-Purchases-posting.sql
\ir api/09-Inventory-api.sql
\ir api/09-Inventory-posting.sql

-- 5. Row-level security + grants, every enumeration value (Lookups), reference data
\ir schema/91-rls.sql
\ir schema/92-lookups.sql
\ir schema/95-seed-reference.sql

COMMIT;
