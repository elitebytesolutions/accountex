-- =============================================================================
-- Finsoft ERP (BASIC) — 02-core.sql
-- Tenant organisation: company profile & settings, branches, users, roles &
-- permissions, sessions, document numbering, attachments, notifications and
-- the partitioned audit log.
--
-- Screens (Basic):
--   login, login/forgot, login/mfa           src/30-entry-admin.html
--   app/dashboard                            src/48-dash-stock.html + src/92-dash.js (views only)
--   app/settings  (Company Settings)         src/60-settings-ess.html
--   app/settings/users, app/settings/roles   src/49-cash-users.html + src/9E-cash-users.js
--   app/settings/audit                       src/60-settings-ess.html
--   app/notifications                        src/40-acc-core.html
--   app/profile                              src/60-settings-ess.html
--   app/unauthorized, app/404                src/60-settings-ess.html (no own data)
--
-- Inline FKs go only to platform.* and core.*. Cross-module FKs
-- (Accounting.ChartOfAccounts, BankCash.BankAccounts, Inventory.Warehouses, Tax.TaxCodes) are in
-- database/fk/02-core-fks.sql.
-- =============================================================================

-- ===========================================================================
-- GLOBAL REFERENCE TABLES (no tenantId, no RLS; seeded by 95-seed-reference)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- currency — Company Settings › Finance "Base currency: PKR — Pakistani Rupee",
-- "Allow multi-currency transactions (USD, AED, EUR)"; Today › Tax Calculator
-- currency select (PKR/USD/AED/SAR).  src/60-settings-ess.html, src/40-acc-core.html
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."Currencies" (
  code             char(3) PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),          -- PKR, USD, AED, EUR, SAR
  name             text NOT NULL,                                          -- Pakistani Rupee
  symbol           text NOT NULL,                                          -- Rs, $, AED
  "minorUnits"      smallint NOT NULL DEFAULT 2 CHECK ("minorUnits" BETWEEN 0 AND 4),
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0
);
SELECT "Company"."addStandardTriggers"('"Company"."Currencies"');
COMMENT ON TABLE "Company"."Currencies" IS 'GLOBAL ISO-4217 currency catalogue. Base currency and multi-currency options on Company Settings › Finance.';

-- ---------------------------------------------------------------------------
-- docType — every numbered document / master code in the product (contract §6).
-- Drives Company Settings › Numbering Series ("Document type" column) and is the
-- controlled vocabulary for polymorphic (entityType, entityId) references
-- (attachments, notifications, sourceDocType on journals).
-- src/60-settings-ess.html (set-numbering)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."DocumentTypes" (
  code                 text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_-]{0,9}$'),   -- JV, INV, SV, CUST, EMP
  name                 text NOT NULL,                                          -- Journal Voucher, Sales Invoice
  module               text NOT NULL,
  "tableName"           text CHECK ("tableName" ~ '^"[A-Z][A-Za-z0-9]*"\."[A-Z][A-Za-z0-9]*"$'),           -- Sales.SalesInvoices
  "defaultPrefix"       text NOT NULL CHECK ("defaultPrefix" ~ '^[A-Z][A-Z0-9-]{0,9}$'),
  "defaultPattern"      text NOT NULL DEFAULT '{PREFIX}-{YYYY}-{SEQ6}' CHECK ("defaultPattern" LIKE '%{SEQ%'),
  "defaultPadding"      smallint NOT NULL DEFAULT 6 CHECK ("defaultPadding" BETWEEN 1 AND 12),
  "defaultResetPolicy" text NOT NULL DEFAULT 'YEARLY',
  "isPostingDoc"       boolean NOT NULL DEFAULT false,      -- creates a journal entry when posted
  "isMaster"            boolean NOT NULL DEFAULT false,      -- CUST, VEN, ITEM, EMP … (code, not docNo)
  "supportsApproval"    boolean NOT NULL DEFAULT false,      -- can be routed through an approval workflow (Full)
  "sortOrder"           integer NOT NULL DEFAULT 0,
  "isActive"            boolean NOT NULL DEFAULT true,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0
);
SELECT "Company"."addStandardTriggers"('"Company"."DocumentTypes"');
CREATE INDEX "docTypeModuleIdx" ON "Company"."DocumentTypes" (module, "sortOrder");
COMMENT ON TABLE "Company"."DocumentTypes" IS 'GLOBAL catalogue of document / master codes (contract §6). FK target of NumberingSeries.docType and every polymorphic entityType / sourceDocType.';

-- ---------------------------------------------------------------------------
-- permission — the Roles & Permissions matrix: module rows (coa, vch, sinv …)
-- × actions V/C/E/A/P/D/X (View, Create, Edit, Approve, Post, Delete, Export).
-- A cell shown as "—" (not applicable) simply has no permission row.
-- code = resource || ':' || lower(action), e.g. 'sinv:post'.
-- src/9E-cash-users.js (GROUPS, ACT)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."Permissions" (
  code             text PRIMARY KEY,                                         -- sinv:post
  module           text NOT NULL,
  resource         text NOT NULL CHECK (resource ~ '^[a-z][a-z0-9_]{1,30}$'),  -- sinv
  "resourceLabel"   text NOT NULL,                                            -- Sales invoices
  action           text NOT NULL,
  description      text,
  "sortOrder"       integer NOT NULL DEFAULT 0,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE (resource, action),
  CONSTRAINT "permissionCodeChk" CHECK (code = resource || ':' || lower(action))
);
SELECT "Company"."addStandardTriggers"('"Company"."Permissions"');
CREATE INDEX "permissionModuleIdx" ON "Company"."Permissions" (module, "sortOrder");
COMMENT ON TABLE "Company"."Permissions" IS 'GLOBAL permission catalogue: resource × action (V/C/E/A/P/D/X) cells of the Roles & Permissions matrix. code like sinv:post.';

-- ===========================================================================
-- COMPANY
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- branch — Company Settings › Branches (Code, Branch, Manager, Address, Sales
-- tax authority, Employees, Status). Codes LHR / KHI / ISB / FSD / MUL feed the
-- {BR} numbering token (CRV-LHR-0381).  src/60-settings-ess.html (set-branches)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."Branches" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                text NOT NULL CHECK (code ~ '^[A-Z]{2,5}$'),                -- LHR
  name                text NOT NULL,                                               -- Lahore HQ
  description         text,                                                        -- "Head office · default", "Sales & warehouse"
  "isHeadOffice"      boolean NOT NULL DEFAULT false,
  "isDefault"          boolean NOT NULL DEFAULT false,
  "managerUserId"     uuid,                                                        -- Manager (FK added after Company.Users)
  address             text,                                                        -- Gulberg III, Lahore
  city                text,
  province            text,
  "salesTaxAuthority" text,  -- "Punjab (PRA)", "Sindh (SRB)", "ICT"
  phone               text,
  email               citext,
  "openingDate"        date,                                                        -- "Planned Q4" (MUL)
  status              text NOT NULL DEFAULT 'ACTIVE',
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  "deletedAt"          timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code)
);
SELECT "Company"."addStandardTriggers"('"Company"."Branches"', true);
CREATE UNIQUE INDEX "branchOneDefaultIdx" ON "Company"."Branches" ("tenantId") WHERE "isDefault" AND "deletedAt" IS NULL;
CREATE INDEX "branchTenantStatusIdx" ON "Company"."Branches" ("tenantId", status) WHERE "deletedAt" IS NULL;
COMMENT ON TABLE "Company"."Branches" IS 'Company Settings › Branches. Branch code (LHR/KHI/ISB/FSD) is the {BR} numbering token and the unit of branch-wise reporting and user access.';
COMMENT ON COLUMN "Company"."Branches"."salesTaxAuthority" IS 'Provincial sales-tax-on-services authority shown per branch: PRA (Punjab), SRB (Sindh), KPRA, BRA, ICT; FBR for goods.';

-- ---------------------------------------------------------------------------
-- Users — Users screen (User, Email, Role, Branch access, MFA, Last active,
-- Status) and the Add/Edit user wizard (Method, Identity, Role, Access,
-- Security, Review); My Profile (personal details, security).
-- Login = company code (Platform.Tenants.code) + work email + password.
-- src/9E-cash-users.js (USERS, openWizard, wzAccess, wzSecurity),
-- src/30-entry-admin.html (login), src/60-settings-ess.html (app/profile)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."Users" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  email                 citext NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),   -- sana.javed@alnoor.com.pk
  "passwordHash"         text,                                       -- argon2/bcrypt; NULL while INVITED or SSO-only
  "mustChangePassword"  boolean NOT NULL DEFAULT false,             -- "Require a new password at first sign-in"
  "passwordChangedAt"   timestamptz,                                -- "Last changed 64 days ago"
  "firstName"            text,
  "lastName"             text,
  "fullName"             text NOT NULL,                              -- Display name: Sana Javed
  "jobTitle"             text,                                       -- Finance Manager
  department            text,                                       -- Finance
  phone                 text,                                       -- Mobile (+92 321 448 9012) — required for WhatsApp invites
  "avatarAttachmentId"  uuid,                                       -- Change photo (FK added after Company.Attachments)
  "emailSignature"       text,
  "isExternal"           boolean NOT NULL DEFAULT false,             -- "External" chip: auditors, tax consultants
  "externalOrg"          text,                                       -- Audit Partners & Co.
  status                text NOT NULL DEFAULT 'INVITED',
  -- access (wizard step "Where and how much?")
  "defaultBranchId"     uuid,                                       -- Profile › Default branch
  "dataScope"            text NOT NULL DEFAULT 'BRANCH',   -- Own records / Their branches / All company
  "moduleAccess"         text[] NOT NULL DEFAULT '{}'
                        CHECK ("moduleAccess" <@ ARRAY['FINANCE','SALES','PURCHASES','INVENTORY','HR','PAYROLL','REPORTS','SETTINGS']),
  "approvalLimit"        numeric(18,2) NOT NULL DEFAULT 0 CHECK ("approvalLimit" >= 0),   -- "Max single voucher this user may approve"; 0 = no approvals
  -- security (wizard step "Security")
  "mfaEnabled"           boolean NOT NULL DEFAULT false,
  "mfaMethod"            text,  -- Authenticator / SMS
  "mfaSecretEnc"        bytea,                                      -- encrypted TOTP seed (never audited in clear)
  "mfaRecoveryCodes"    text[],                                     -- 10 single-use codes, hashed
  "ipRestricted"         boolean NOT NULL DEFAULT false,             -- "Only allow sign-in from office networks"
  "ipAllowlist"          cidr[],                                     -- 39.32.0.0/16
  "sessionTimeoutMin"   smallint NOT NULL DEFAULT 60 CHECK ("sessionTimeoutMin" IN (15, 30, 60, 240, 720)),
  "loginHours"           text NOT NULL DEFAULT 'ANY',
  "loginFrom"            time,                                       -- custom window (Mon–Sat)
  "loginTo"              time,
  "ssoProvider"          text,   -- "or continue with Google / Microsoft"
  "ssoSubject"           text,
  "failedLoginCount"    smallint NOT NULL DEFAULT 0 CHECK ("failedLoginCount" >= 0),
  "lockedUntil"          timestamptz,
  -- lifecycle
  "invitedByUserId"    uuid,
  "invitedAt"            timestamptz,
  "activatedAt"          timestamptz,                                -- "Member since"
  "suspendedAt"          timestamptz,
  "lastLoginAt"         timestamptz,
  "lastLoginIp"         inet,
  "lastActiveAt"        timestamptz,                                -- "Last active: Today 09:02 · Edge · Windows"
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  "deletedAt"            timestamptz,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "defaultBranchId") REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "invitedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "appUserActiveNeedsCredentialChk" CHECK (status <> 'ACTIVE' OR "passwordHash" IS NOT NULL OR "ssoProvider" IS NOT NULL),
  CONSTRAINT "appUserMfaMethodChk" CHECK (NOT "mfaEnabled" OR "mfaMethod" IS NOT NULL),
  CONSTRAINT "appUserIpAllowlistChk" CHECK (NOT "ipRestricted" OR cardinality("ipAllowlist") > 0),
  CONSTRAINT "appUserLoginWindowChk" CHECK ("loginHours" <> 'CUSTOM' OR ("loginFrom" IS NOT NULL AND "loginTo" IS NOT NULL AND "loginTo" > "loginFrom")),
  CONSTRAINT "appUserExternalOrgChk" CHECK (NOT "isExternal" OR "externalOrg" IS NOT NULL),
  CONSTRAINT "appUserSsoSubjectChk" CHECK (("ssoProvider" IS NULL) = ("ssoSubject" IS NULL))
);
-- audited with secrets redacted (see Company.triggerAuditRedacted below)
SELECT "Company"."addStandardTriggers"('"Company"."Users"');
CREATE UNIQUE INDEX "appUserEmailUidx" ON "Company"."Users" ("tenantId", email) WHERE status <> 'REMOVED';
CREATE UNIQUE INDEX "appUserSsoUidx"   ON "Company"."Users" ("tenantId", "ssoProvider", "ssoSubject") WHERE "ssoProvider" IS NOT NULL;
CREATE INDEX "appUserTenantStatusIdx" ON "Company"."Users" ("tenantId", status);
CREATE INDEX "appUserNameTrgmIdx"     ON "Company"."Users" USING gin ("fullName" gin_trgm_ops);
COMMENT ON TABLE "Company"."Users" IS 'Tenant users (Users screen, Add/Edit user wizard, My Profile). Sign-in = tenant code + email. Status ACTIVE/INVITED/SUSPENDED/REMOVED.';
COMMENT ON COLUMN "Company"."Users"."approvalLimit" IS 'User-level cap: the largest single voucher this user may approve (wizard "Approval limit"). 0 = cannot approve.';
COMMENT ON COLUMN "Company"."Users"."moduleAccess" IS 'Wizard "Modules" switches (Finance, Sales, Purchases, Inventory, HR, Payroll, Reports, Settings); defaults come from the role.';

ALTER TABLE "Company"."Branches"
  ADD CONSTRAINT "branchManagerUserFk" FOREIGN KEY ("tenantId", "managerUserId") REFERENCES "Company"."Users" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- attachment — files behind paperclips across the app (voucher/bill/receipt
-- attachments), the company logo (Company Settings › Profile "Upload new") and
-- user photos (My Profile "Change photo").
-- src/60-settings-ess.html, src/9A-company-plus.js (approval drawer "2 attachments")
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."Attachments" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "entityType"         text REFERENCES "Company"."DocumentTypes"(code),          -- owning document type (INV, JV …); NULL for logo/avatar
  "entityId"           uuid,
  purpose             text NOT NULL DEFAULT 'DOCUMENT',
  "fileName"           text NOT NULL,                                -- Habib_quote_Sep26.pdf
  "contentType"        text NOT NULL,                                -- application/pdf, image/png
  "sizeBytes"          bigint NOT NULL CHECK ("sizeBytes" >= 0 AND "sizeBytes" <= 104857600),   -- 100 MB hard cap
  "storageKey"         text NOT NULL,                                -- object-store key
  sha256              bytea CHECK (sha256 IS NULL OR octet_length(sha256) = 32),
  "uploadedByUserId" uuid,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  "deletedAt"          timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "storageKey"),
  FOREIGN KEY ("tenantId", "uploadedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "attachmentEntityPairChk" CHECK (("entityType" IS NULL) = ("entityId" IS NULL)),
  CONSTRAINT "attachmentLogoSizeChk" CHECK (purpose NOT IN ('LOGO','AVATAR') OR "sizeBytes" <= 2097152)   -- "max 2 MB"
);
SELECT "Company"."addStandardTriggers"('"Company"."Attachments"');
CREATE INDEX "attachmentEntityIdx" ON "Company"."Attachments" ("tenantId", "entityType", "entityId") WHERE "deletedAt" IS NULL;
COMMENT ON TABLE "Company"."Attachments" IS 'File metadata (bytes live in object storage). Polymorphic owner (entityType → Company.DocumentTypes, entityId); logo/avatar are referenced directly.';

ALTER TABLE "Company"."Users"
  ADD CONSTRAINT "appUserAvatarFk" FOREIGN KEY ("tenantId", "avatarAttachmentId") REFERENCES "Company"."Attachments" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- CompanySettings — one row per tenant. Company Settings tabs:
--   Company Profile · Finance (fiscal & currency) · Sales & Purchases · Tax · Branding
-- Default account mapping → Company.DefaultAccountMappings; Numbering Series →
-- Company.NumberingSeries; Branches → Company.Branches. Open-ended values → Company.CompanySettingValues.
-- src/60-settings-ess.html (set-profile, set-finance, set-sales, set-tax, set-branding)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."CompanySettings" (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                       uuid NOT NULL UNIQUE REFERENCES "Platform"."Tenants"(id),
  -- Company Profile
  "legalName"                      text NOT NULL,                     -- Al-Noor Enterprises (Pvt) Ltd
  "tradingName"                    text,                              -- Al-Noor Enterprises
  "secpRegNo"                     text,                              -- 0098234
  ntn                             text NOT NULL CHECK (ntn ~ '^\d{7}-\d$'),             -- 4271839-6
  strn                            text CHECK (strn IS NULL OR strn ~ '^\d{2}-\d{2}-\d{4}-\d{3}-\d{2}$'),  -- 32-77-8761-234-55
  "registeredAddress"              text,
  city                            text,
  province                        text,
  phone                           text,
  email                           citext,
  website                         text,
  industry                        text,
  timezone                        text NOT NULL DEFAULT 'Asia/Karachi',
  "legalStructure"                 text,
  "logoAttachmentId"              uuid,
  -- Finance › Fiscal & currency
  "fyStartMonth"                  smallint NOT NULL DEFAULT 7 CHECK ("fyStartMonth" IN (1, 4, 7)),   -- 1 July / 1 January / 1 April
  "baseCurrencyCode"              char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),
  "amountDecimals"                 smallint NOT NULL DEFAULT 2 CHECK ("amountDecimals" IN (0, 2, 3)),
  "numberFormat"                   text NOT NULL DEFAULT 'WESTERN',  -- 1,245,000.00 / 12,45,000.00
  "booksLockDate"                 date,                              -- "Lock date (no posting before)": acc posting guard
  "fxRateSource"                  text NOT NULL DEFAULT 'SBP_DAILY',
  "allowMultiCurrency"            boolean NOT NULL DEFAULT false,
  "requireCostCentreOnExpense"  boolean NOT NULL DEFAULT false,
  "allowFuturePeriodPosting"     boolean NOT NULL DEFAULT false,
  -- Sales & Purchases › Sales
  "defaultCustomerTermsDays"     smallint NOT NULL DEFAULT 30 CHECK ("defaultCustomerTermsDays" BETWEEN 0 AND 365),  -- Net 30 (0 = due on receipt)
  "quotationValidityDays"         smallint NOT NULL DEFAULT 15 CHECK ("quotationValidityDays" BETWEEN 1 AND 365),
  "defaultSalesTaxCodeId"       uuid,                              -- "Default sales tax: GST 18%" → Tax.TaxCodes (fk file)
  "invoiceTerms"                   text,                              -- Invoice terms & conditions
  "creditLimitAction"             text NOT NULL DEFAULT 'BLOCK_OVERRIDE',
  "overdueToleranceDays"          smallint NOT NULL DEFAULT 15 CHECK ("overdueToleranceDays" >= 0),
  "blockOverdueOver90"           boolean NOT NULL DEFAULT true,     -- "Block customers with invoices overdue more than 90 days"
  -- Sales & Purchases › Purchases
  "defaultVendorTermsDays"       smallint NOT NULL DEFAULT 45 CHECK ("defaultVendorTermsDays" BETWEEN 0 AND 365),
  "threeWayMatchTolerancePct"   numeric(7,4) NOT NULL DEFAULT 2 CHECK ("threeWayMatchTolerancePct" BETWEEN 0 AND 100),
  "billApprovalThreshold"         numeric(18,2) CHECK ("billApprovalThreshold" >= 0),   -- "Bill approval above Rs 250,000"
  "requireApprovedPoForBill"    boolean NOT NULL DEFAULT true,
  "autoDeductWht153"             boolean NOT NULL DEFAULT true,     -- "Auto-deduct WHT u/s 153 on vendor payments"
  "allowPartialGrn"               boolean NOT NULL DEFAULT false,
  "warnDuplicateVendorInvoice"   boolean NOT NULL DEFAULT true,
  -- Inventory controls (inv module: stock adjustments above this value need approval)
  "stockAdjustmentApprovalThreshold" numeric(18,2) NOT NULL DEFAULT 25000 CHECK ("stockAdjustmentApprovalThreshold" >= 0),
  -- Tax › Sales tax registration
  "gstRegistered"                  boolean NOT NULL DEFAULT true,     -- "Yes — Federal (FBR)"
  "salesTaxReturnPeriod"         text NOT NULL DEFAULT 'MONTHLY',
  "standardGstRatePct"           numeric(7,4) NOT NULL DEFAULT 18 CHECK ("standardGstRatePct" BETWEEN 0 AND 100),
  "furtherTaxRatePct"            numeric(7,4) NOT NULL DEFAULT 4 CHECK ("furtherTaxRatePct" BETWEEN 0 AND 100),   -- unregistered buyers
  "provincialTaxAuthority"        text,
  "provincialServicesRatePct"    numeric(7,4) CHECK ("provincialServicesRatePct" BETWEEN 0 AND 100),             -- PRA 16% / SRB 15%
  "atlStatus"                      text NOT NULL DEFAULT 'UNKNOWN',  -- "Active taxpayer — FBR ATL"
  "atlVerifiedAt"                 timestamptz,                       -- "Last verified 28 Sep 2026"
  -- Branding
  "brandPrimaryColour"            text NOT NULL DEFAULT '#15803D' CHECK ("brandPrimaryColour" ~ '^#[0-9A-Fa-f]{6}$'),
  "brandAccentColour"             text NOT NULL DEFAULT '#EFBC61' CHECK ("brandAccentColour" ~ '^#[0-9A-Fa-f]{6}$'),
  "documentFont"                   text NOT NULL DEFAULT 'INTER',
  "paperSize"                      text NOT NULL DEFAULT 'A4',
  "emailFooter"                    text,
  "showPoweredBy"                 boolean NOT NULL DEFAULT true,
  "createdAt"                      timestamptz NOT NULL DEFAULT now(),
  "createdBy"                      uuid,
  "updatedAt"                      timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                      uuid,
  "rowVersion"                     integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "logoAttachmentId") REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "companyProfileStrnWhenGstChk" CHECK (NOT "gstRegistered" OR strn IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Company"."CompanySettings"', true);
COMMENT ON TABLE "Company"."CompanySettings" IS 'One row per tenant: Company Settings profile, finance, sales/purchase, tax and branding fields.';
COMMENT ON COLUMN "Company"."CompanySettings"."booksLockDate" IS 'Company Settings › Finance "Lock date (no posting before)". acc posting guards reject any journal dated on or before this date.';

-- Lock date accessor used by acc/treasury/inv posting guards.
CREATE OR REPLACE FUNCTION "Company"."getBooksLockDate"() RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT cp."booksLockDate" FROM "Company"."CompanySettings" cp WHERE cp."tenantId" = "Company"."getCurrentTenantId"()
$$;
COMMENT ON FUNCTION "Company"."getBooksLockDate"() IS 'Lock date of the current tenant (NULL = no lock). Posting is rejected when docDate <= this value.';

-- ---------------------------------------------------------------------------
-- CompanySettingValues — typed key/value for settings that are not fixed columns
-- (future toggles, per-tenant feature options). Grouped by Company Settings tab.
-- src/60-settings-ess.html
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."CompanySettingValues" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "settingGroup"    text NOT NULL,
  key              text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_.]{1,62}$'),       -- e.g. security.require_mfa_for_approvers
  value            jsonb NOT NULL,
  description      text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "settingGroup", key)
);
SELECT "Company"."addStandardTriggers"('"Company"."CompanySettingValues"', true);
COMMENT ON TABLE "Company"."CompanySettingValues" IS 'Typed key/value company settings grouped by Company Settings tab, for options that are not fixed columns of CompanySettings.';

-- ---------------------------------------------------------------------------
-- PostingRoles — helper (GLOBAL): the controlled list of posting roles that
-- Company.DefaultAccountMappings maps to GL accounts. A lookup table instead of a
-- CHECK so every module's posting role is added in one place (both editions
-- carry the full list; unused roles simply have no mapping).
-- onSettingsScreen = shown on Company Settings › Finance "Default account mapping".
-- src/60-settings-ess.html (set-finance); POSTING_RULES.md
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."PostingRoles" (
  code               text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{2,40}$'),
  name               text NOT NULL,
  "roleGroup"         text NOT NULL,
  "normalBalance"     char(2) NOT NULL,
  "onSettingsScreen" boolean NOT NULL DEFAULT false,
  "sortOrder"         integer NOT NULL DEFAULT 0,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0
);
SELECT "Company"."addStandardTriggers"('"Company"."PostingRoles"');
COMMENT ON TABLE "Company"."PostingRoles" IS 'GLOBAL helper: posting roles (AR_CONTROL, OUTPUT_GST, INVENTORY, GRNI …) mapped per tenant in Company.DefaultAccountMappings.';

INSERT INTO "Company"."PostingRoles" (code, name, "roleGroup", "normalBalance", "onSettingsScreen", "sortOrder") VALUES
  ('AR_CONTROL', 'Accounts receivable control', 'CONTROL', 'DR', true, 10),
  ('AP_CONTROL', 'Accounts payable control', 'CONTROL', 'CR', true, 20),
  ('SALES_REVENUE', 'Sales revenue', 'REVENUE', 'CR', true, 30),
  ('SALES_RETURNS', 'Sales returns', 'REVENUE', 'DR', true, 40),
  ('OUTPUT_GST', 'Output GST (sales tax payable)', 'TAX', 'CR', true, 50),
  ('INPUT_GST', 'Input GST (sales tax refundable)', 'TAX', 'DR', true, 60),
  ('WHT_PAYABLE', 'WHT payable (income tax withheld)', 'TAX', 'CR', true, 70),
  ('SALARIES_PAYABLE', 'Salaries payable', 'PAYROLL', 'CR', true, 80),
  ('DEFAULT_BANK', 'Default bank', 'CASH_BANK', 'DR', true, 90),
  ('RETAINED_EARNINGS', 'Retained earnings', 'EQUITY', 'CR', true, 100),
  ('ROUNDING', 'Rounding difference', 'OTHER', 'DR', true, 110),
  ('FX_GAIN_LOSS', 'Exchange gain / loss', 'OTHER', 'DR', true, 120),
  ('INVENTORY', 'Inventory (stock in trade)', 'INVENTORY', 'DR', false, 130),
  ('COGS', 'Cost of goods sold', 'INVENTORY', 'DR', false, 140),
  ('STOCK_ADJUSTMENT', 'Stock adjustment', 'INVENTORY', 'DR', false, 150),
  ('INVENTORY_SHRINKAGE', 'Inventory shrinkage (count shortage)', 'INVENTORY', 'DR', false, 160),
  ('INVENTORY_GAIN', 'Inventory gain (count excess)', 'INVENTORY', 'CR', false, 170),
  ('INVENTORY_WRITE_OFF', 'Inventory write-off', 'INVENTORY', 'DR', false, 180),
  ('STOCK_WRITE_OFF', 'Stock write-off (expired / damaged)', 'INVENTORY', 'DR', false, 190),
  ('STOCK_GAIN', 'Stock gain', 'INVENTORY', 'CR', false, 200),
  ('STOCK_VAN', 'Stock on vans', 'INVENTORY', 'DR', false, 210),
  ('STOCK_IN_TRANSIT', 'Stock in transit (transfers)', 'INVENTORY', 'DR', false, 220),
  ('GOODS_IN_TRANSIT', 'Goods in transit (purchases)', 'INVENTORY', 'DR', false, 230),
  ('GRNI', 'Goods received not invoiced', 'PURCHASE', 'CR', false, 240),
  ('PURCHASE_RETURNS', 'Purchase returns', 'PURCHASE', 'CR', false, 250),
  ('LANDED_COST_CLEARING', 'Landed cost clearing', 'PURCHASE', 'CR', false, 260),
  ('IMPORT_INPUT_ST', 'Input sales tax on imports', 'TAX', 'DR', false, 270),
  ('DISCOUNT_ALLOWED', 'Discount allowed', 'REVENUE', 'DR', false, 280),
  ('DISCOUNT_RECEIVED', 'Discount received', 'OTHER', 'CR', false, 290),
  ('SCHEME_DISCOUNT', 'Trade scheme discount', 'REVENUE', 'DR', false, 300),
  ('FURTHER_TAX_PAYABLE', 'Further tax payable', 'TAX', 'CR', false, 310),
  ('WHT_PAYABLE_153', 'WHT payable u/s 153', 'TAX', 'CR', false, 320),
  ('WHT_RECEIVABLE', 'WHT deducted by customers (receivable)', 'TAX', 'DR', false, 330),
  ('ADVANCE_INCOME_TAX', 'Advance income tax', 'TAX', 'DR', false, 340),
  ('ADVANCE_TAX_COLLECTED', 'Advance tax collected (payable)', 'TAX', 'CR', false, 350),
  ('ADVANCE_TAX_236G', 'Advance tax u/s 236G', 'TAX', 'CR', false, 360),
  ('ADVANCE_TAX_148', 'Advance tax on imports u/s 148', 'TAX', 'DR', false, 370),
  ('SALES_TAX_SETTLEMENT', 'Sales tax settlement', 'TAX', 'CR', false, 380),
  ('CASH_IN_HAND', 'Cash in hand', 'CASH_BANK', 'DR', false, 390),
  ('PETTY_CASH', 'Petty cash', 'CASH_BANK', 'DR', false, 400),
  ('CHEQUES_IN_HAND', 'Cheques in hand (PDC received)', 'CASH_BANK', 'DR', false, 410),
  ('PDC_PAYABLE', 'Post-dated cheques issued', 'CASH_BANK', 'CR', false, 420),
  ('BANK_CHARGES', 'Bank charges', 'CASH_BANK', 'DR', false, 430),
  ('POS_CARD_CLEARING', 'POS card clearing', 'CASH_BANK', 'DR', false, 440),
  ('PROFIT_ON_DEPOSIT', 'Profit on bank deposits', 'CASH_BANK', 'CR', false, 450),
  ('MARKUP_EXPENSE', 'Mark-up / finance cost', 'CASH_BANK', 'DR', false, 460),
  ('CUSTOMER_ADVANCES', 'Customer advances', 'CONTROL', 'CR', false, 470),
  ('VENDOR_ADVANCES', 'Vendor advances', 'CONTROL', 'DR', false, 480),
  ('OPENING_BALANCE_EQUITY', 'Opening balance equity', 'EQUITY', 'CR', false, 490),
  ('SALESMAN_RECEIVABLE', 'Salesman receivable (cash short)', 'DISTRIBUTION', 'DR', false, 500),
  ('CASH_OVER_SHORT', 'Cash over / short', 'DISTRIBUTION', 'DR', false, 510),
  ('SALES_COMMISSION_EXPENSE', 'Sales commission expense', 'DISTRIBUTION', 'DR', false, 520),
  ('COMMISSION_PAYABLE', 'Commission payable', 'DISTRIBUTION', 'CR', false, 530),
  ('SALARY_EXPENSE', 'Salaries & wages expense', 'PAYROLL', 'DR', false, 540),
  ('SALARY_BANK', 'Salary disbursement bank', 'PAYROLL', 'DR', false, 550),
  ('EOBI_PAYABLE', 'EOBI payable', 'PAYROLL', 'CR', false, 560),
  ('PESSI_PAYABLE', 'PESSI / SESSI payable', 'PAYROLL', 'CR', false, 570),
  ('PF_PAYABLE', 'Provident fund payable', 'PAYROLL', 'CR', false, 580),
  ('INCOME_TAX_PAYABLE_SALARY', 'Income tax on salaries payable (u/s 149)', 'PAYROLL', 'CR', false, 590),
  ('SALARY_TAX_PAYABLE', 'Salary tax payable', 'PAYROLL', 'CR', false, 600),
  ('EMPLOYEE_ADVANCES', 'Employee advances', 'PAYROLL', 'DR', false, 610),
  ('STAFF_ADVANCES', 'Staff advances', 'PAYROLL', 'DR', false, 620),
  ('EMPLOYEE_LOANS', 'Employee loans', 'PAYROLL', 'DR', false, 630),
  ('EMPLOYEE_CLAIMS_PAYABLE', 'Employee expense claims payable', 'PAYROLL', 'CR', false, 640),
  ('DEPRECIATION_EXPENSE', 'Depreciation expense', 'ASSETS', 'DR', false, 650),
  ('ACCUMULATED_DEPRECIATION', 'Accumulated depreciation', 'ASSETS', 'CR', false, 660),
  ('GAIN_LOSS_ON_DISPOSAL', 'Gain / loss on disposal of assets', 'ASSETS', 'CR', false, 670),
  ('FA_GAIN', 'Gain on disposal of fixed assets', 'ASSETS', 'CR', false, 680),
  ('FA_LOSS', 'Loss on disposal of fixed assets', 'ASSETS', 'DR', false, 690),
  ('FBR_POS_FEE', 'FBR POS service fee', 'TAX', 'DR', false, 700),
  ('GDNI', 'Goods delivered not invoiced', 'INVENTORY', 'DR', false, 710),
  ('CARD_CLEARING', 'Card payments clearing', 'CASH_BANK', 'DR', false, 720),
  ('WALLET_CLEARING', 'Mobile wallet clearing (JazzCash / Easypaisa / Raast)', 'CASH_BANK', 'DR', false, 730),
  ('OB_SUSPENSE', 'Opening balance suspense', 'EQUITY', 'CR', false, 740)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- DefaultAccountMappings — Company Settings › Finance "Default account mapping:
-- used when vouchers are generated automatically by sub-ledgers". One GL account
-- per role. Inventory/cash roles are used by the inv and treasury posting rules.
-- src/60-settings-ess.html (set-finance)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."DefaultAccountMappings" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  role             text NOT NULL REFERENCES "Company"."PostingRoles"(code),   -- AR_CONTROL, OUTPUT_GST, INVENTORY, GRNI …
  "accountId"       uuid NOT NULL,                       -- → Accounting.ChartOfAccounts (fk file)
  "bankAccountId"  uuid,                                -- DEFAULT_BANK / SALARY_BANK: the treasury bank account ("Meezan Bank — 0123") → fk file
  remarks          text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", role),
  CONSTRAINT "defaultAccountMapBankChk" CHECK ("bankAccountId" IS NULL OR role IN ('DEFAULT_BANK','SALARY_BANK'))
);
SELECT "Company"."addStandardTriggers"('"Company"."DefaultAccountMappings"', true);
CREATE INDEX "defaultAccountMapAccountIdx" ON "Company"."DefaultAccountMappings" ("tenantId", "accountId");
COMMENT ON TABLE "Company"."DefaultAccountMappings" IS 'Role → GL account used by automatic postings (AR/AP control, revenue, GST, WHT, inventory, COGS …). "Reset to template" reloads from Platform.ChartOfAccountsTemplateAccounts.defaultRole.';

-- ===========================================================================
-- USERS, ROLES, ACCESS
-- ===========================================================================

-- UserBranches — wizard "Branches" tiles; Users list "Branch access" chips
CREATE TABLE "Company"."UserBranches" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "userId"          uuid NOT NULL,
  "branchId"        uuid NOT NULL,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "userId", "branchId"),
  FOREIGN KEY ("tenantId", "userId")   REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Company"."UserBranches"', true);
CREATE INDEX "userBranchBranchIdx" ON "Company"."UserBranches" ("tenantId", "branchId");
COMMENT ON TABLE "Company"."UserBranches" IS 'Branches a user may work in (Users › Branch access). With dataScope = BRANCH the user sees only these branches.';

-- UserWarehouses — helper: wizard "Warehouses" tiles (Lahore HQ Warehouse, Karachi Depot …)
CREATE TABLE "Company"."UserWarehouses" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "userId"          uuid NOT NULL,
  "warehouseId"     uuid NOT NULL,                       -- → Inventory.Warehouses (fk file)
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "userId", "warehouseId"),
  FOREIGN KEY ("tenantId", "userId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Company"."UserWarehouses"', true);
CREATE INDEX "userWarehouseWhIdx" ON "Company"."UserWarehouses" ("tenantId", "warehouseId");
COMMENT ON TABLE "Company"."UserWarehouses" IS 'Helper: warehouses a user may post stock in (Add user wizard › Access › Warehouses).';

-- ---------------------------------------------------------------------------
-- role — Roles & Permissions list (Owner, Finance Manager, Accountant, HR
-- Manager, Payroll Officer, Sales Executive, Storekeeper, Auditor (read-only));
-- "New role" / "Duplicate role" modal (Role name, Description, Copy permissions
-- from); header switch "Branch-restricted". System roles can be copied, not deleted.
-- src/9E-cash-users.js (ROLES, rolesMount)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."Roles" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name                citext NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  "systemKey"          text,
  description         text,
  icon                text,                                    -- lucide icon (crown, landmark, calculator …)
  tone                text,
  "isSystem"           boolean NOT NULL DEFAULT false,          -- "System" badge: copy only, never delete
  "branchRestricted"   boolean NOT NULL DEFAULT true,           -- "Users only see their own branches"
  "copiedFromRoleId" uuid,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  "deletedAt"          timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", name),
  UNIQUE ("tenantId", "systemKey"),
  FOREIGN KEY ("tenantId", "copiedFromRoleId") REFERENCES "Company"."Roles" ("tenantId", id),
  CONSTRAINT "roleSystemKeyChk" CHECK (NOT "isSystem" OR "systemKey" IS NOT NULL),
  CONSTRAINT "roleSystemNotDeletedChk" CHECK (NOT "isSystem" OR "deletedAt" IS NULL)
);
SELECT "Company"."addStandardTriggers"('"Company"."Roles"', true);
COMMENT ON TABLE "Company"."Roles" IS 'Tenant roles. systemKey marks the seeded system roles; OWNER bypasses segregation-of-duties checks.';

-- RolePermissions — one row per granted matrix cell ("+ Post on Payroll")
CREATE TABLE "Company"."RolePermissions" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "roleId"          uuid NOT NULL,
  "permissionCode"  text NOT NULL REFERENCES "Company"."Permissions"(code),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "roleId", "permissionCode"),
  FOREIGN KEY ("tenantId", "roleId") REFERENCES "Company"."Roles" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Company"."RolePermissions"', true);
CREATE INDEX "rolePermissionPermIdx" ON "Company"."RolePermissions" ("tenantId", "permissionCode");
COMMENT ON TABLE "Company"."RolePermissions" IS 'Granted cells of the permission matrix (role × permission code). Revoking a cell deletes the row; the audit log keeps the history (action PERMISSION).';

-- UserRoles — the user's role (wizard step "Choose a role"); one primary role
CREATE TABLE "Company"."UserRoles" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "userId"          uuid NOT NULL,
  "roleId"          uuid NOT NULL,
  "isPrimary"       boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "userId", "roleId"),
  FOREIGN KEY ("tenantId", "userId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "roleId") REFERENCES "Company"."Roles" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Company"."UserRoles"', true);
CREATE UNIQUE INDEX "userRoleOnePrimaryIdx" ON "Company"."UserRoles" ("tenantId", "userId") WHERE "isPrimary";
CREATE INDEX "userRoleRoleIdx" ON "Company"."UserRoles" ("tenantId", "roleId");
COMMENT ON TABLE "Company"."UserRoles" IS 'Roles held by a user; the primary role is the one shown on Users and My Profile. Effective permissions = union of RolePermissions.';

-- ---------------------------------------------------------------------------
-- UserSessions — My Profile › Security "Active sessions" (Device, Location, IP,
-- Signed in, Last active, Revoke / Revoke all others); Users › user drawer
-- "Sessions" (Unusual location badge, Sign out of all devices); login
-- "Remember me for 30 days"; login/mfa "Trust this device for 30 days".
-- src/60-settings-ess.html (prof-security), src/9E-cash-users.js (sessionsFor)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."UserSessions" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "userId"             uuid NOT NULL,
  "tokenHash"          bytea NOT NULL CHECK (octet_length("tokenHash") = 32),   -- sha-256 of the session token
  "clientType"         text NOT NULL DEFAULT 'WEB',
  "deviceLabel"        text,                                    -- "Edge · Windows 11", "Finsoft iOS app · iPhone 15"
  "userAgent"          text,
  "ipAddress"          inet,
  "locationLabel"      text,                                    -- "Lahore, PK"
  "isUnusualLocation" boolean NOT NULL DEFAULT false,          -- "Unusual location" badge
  "authMethod"         text NOT NULL DEFAULT 'PASSWORD',
  "mfaVerifiedAt"     timestamptz,
  "rememberMe"         boolean NOT NULL DEFAULT false,
  "trustedUntil"       timestamptz,                             -- skip MFA on this device until …
  "signedInAt"        timestamptz NOT NULL DEFAULT now(),
  "lastActiveAt"      timestamptz NOT NULL DEFAULT now(),
  "expiresAt"          timestamptz NOT NULL,
  "revokedAt"          timestamptz,
  "revokedByUserId"  uuid,
  "revokeReason"       text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tokenHash"),
  FOREIGN KEY ("tenantId", "userId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "revokedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "userSessionExpiryChk" CHECK ("expiresAt" > "signedInAt"),
  CONSTRAINT "userSessionRevokeChk" CHECK (("revokedAt" IS NULL) = ("revokeReason" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"Company"."UserSessions"');
CREATE INDEX "userSessionActiveIdx" ON "Company"."UserSessions" ("tenantId", "userId", "lastActiveAt" DESC) WHERE "revokedAt" IS NULL;
COMMENT ON TABLE "Company"."UserSessions" IS 'Signed-in sessions per device. Revocation (sign out, admin revoke, suspend, password change) sets revokedAt; rows are kept for the audit trail.';

-- ---------------------------------------------------------------------------
-- PasswordResets — one-time links: login/forgot "Send reset link" (valid 30
-- minutes, single use, admin notified); Users › "Send password reset";
-- Users › Add user "Invite by email / WhatsApp" (link valid 7 days).
-- src/30-entry-admin.html (login/forgot), src/9E-cash-users.js (wzMethod, userMenu)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."PasswordResets" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "userId"              uuid NOT NULL,
  purpose              text NOT NULL DEFAULT 'RESET',
  "tokenHash"           bytea NOT NULL CHECK (octet_length("tokenHash") = 32),
  channel              text NOT NULL DEFAULT 'EMAIL',
  "requestedIp"         inet,
  "requestedByUserId" uuid,                                   -- admin who triggered it (NULL = self-service)
  "expiresAt"           timestamptz NOT NULL,
  "usedAt"              timestamptz,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tokenHash"),
  FOREIGN KEY ("tenantId", "userId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "requestedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "passwordResetExpiryChk" CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '8 days'),
  CONSTRAINT "passwordResetUsedChk" CHECK ("usedAt" IS NULL OR "usedAt" <= "expiresAt")
);
SELECT "Company"."addStandardTriggers"('"Company"."PasswordResets"');
CREATE INDEX "passwordResetUserIdx" ON "Company"."PasswordResets" ("tenantId", "userId", "createdAt" DESC);
COMMENT ON TABLE "Company"."PasswordResets" IS 'Single-use tokens for password reset (30 min) and invitations (7 days). Only the sha-256 of the token is stored.';

-- ---------------------------------------------------------------------------
-- UserPreferences — My Profile › Preferences (Language, Date format, Number
-- format, Start page, Theme, Compact tables, Show account codes) and the
-- notification toggles; Notifications › "Delivery channels".
-- src/60-settings-ess.html (prof-prefs), src/40-acc-core.html (app/notifications)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."UserPreferences" (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                   uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "userId"                     uuid NOT NULL,
  language                    text NOT NULL DEFAULT 'EN',
  "dateFormat"                 text NOT NULL DEFAULT 'DD MMM YYYY',
  "numberFormat"               text NOT NULL DEFAULT 'WESTERN',
  "startRoute"                 text NOT NULL DEFAULT 'app/dashboard',
  theme                       text NOT NULL DEFAULT 'SYSTEM',
  "compactTables"              boolean NOT NULL DEFAULT true,
  "showAccountCodes"          boolean NOT NULL DEFAULT false,
  -- delivery channels (Notifications screen)
  "notifyInApp"               boolean NOT NULL DEFAULT true,
  "notifyEmailDigest"         boolean NOT NULL DEFAULT true,     -- "Email digest (daily 08:00)"
  "emailDigestTime"           time NOT NULL DEFAULT '08:00',
  "notifySmsApprovalsAbove"  numeric(18,2) CHECK ("notifySmsApprovalsAbove" >= 0),   -- "SMS for approvals above Rs 1M"; NULL = off
  "notifyWhatsapp"             boolean NOT NULL DEFAULT false,    -- "WhatsApp alerts" / "WhatsApp cheque maturity alerts"
  -- subscribed events (My Profile › Notifications toggles)
  "notifyEvents"               text[] NOT NULL DEFAULT ARRAY['APPROVAL_ASSIGNED','DOC_REJECTED','BANK_ALERT','CREDIT_BREACH','TAX_DUE']
                              CHECK ("notifyEvents" <@ ARRAY['APPROVAL_ASSIGNED','DOC_REJECTED','BANK_ALERT','CREDIT_BREACH',
                                                            'DAILY_CASH_POSITION','TAX_DUE','PDC_MATURING','LOW_STOCK',
                                                            'NEW_SIGN_IN','SYSTEM']),
  "createdAt"                  timestamptz NOT NULL DEFAULT now(),
  "createdBy"                  uuid,
  "updatedAt"                  timestamptz NOT NULL DEFAULT now(),
  "updatedBy"                  uuid,
  "rowVersion"                 integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "userId"),
  FOREIGN KEY ("tenantId", "userId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Company"."UserPreferences"');
COMMENT ON TABLE "Company"."UserPreferences" IS 'Per-user display and notification preferences (My Profile › Preferences; Notifications › Delivery channels).';

-- ===========================================================================
-- DOCUMENT NUMBERING (used by Company.getNextDocNo in 00-foundation.sql)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- NumberingSeries — Company Settings › Numbering Series (Document type, Prefix,
-- Padding, Next number, Preview, Reset yearly; "Add series"). Tokens {YYYY}
-- {YY} {MM} {BR} {SEQn}. A branch-scoped series (branchId set) wins over the
-- tenant-wide one.  src/60-settings-ess.html (set-numbering)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."NumberingSeries" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docType"         text NOT NULL REFERENCES "Company"."DocumentTypes"(code),
  "branchId"        uuid,
  prefix           text NOT NULL CHECK (prefix ~ '^[A-Z][A-Z0-9-]{0,9}$'),              -- JV, INV, BILL
  pattern          text NOT NULL DEFAULT '{PREFIX}-{YYYY}-{SEQ6}' CHECK (pattern LIKE '%{SEQ%' AND char_length(pattern) <= 60),
  padding          integer NOT NULL DEFAULT 6 CHECK (padding BETWEEN 1 AND 12),          -- used when the pattern has a bare {SEQ}
  "startValue"      bigint NOT NULL DEFAULT 1 CHECK ("startValue" >= 1),
  "resetPolicy"     text NOT NULL DEFAULT 'YEARLY',   -- "Reset yearly" switch
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE NULLS NOT DISTINCT ("tenantId", "docType", "branchId"),
  FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Company"."NumberingSeries"', true);
COMMENT ON TABLE "Company"."NumberingSeries" IS 'Numbering series per document type (optionally per branch). Company.getNextDocNo() picks the branch series first, then the tenant-wide one.';

-- NumberingSeriesCounters — the running counter per series and reset period
-- ("Next number" column). Row-locked by Company.getNextDocNo(); never MAX+1.
CREATE TABLE "Company"."NumberingSeriesCounters" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "sequenceId"      uuid NOT NULL,
  "periodKey"       text NOT NULL CHECK ("periodKey" ~ '^(ALL|\d{4}|\d{4}-\d{2})$'),   -- ALL / 2026 / 2026-10
  "nextValue"       bigint NOT NULL CHECK ("nextValue" >= 1),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "sequenceId", "periodKey"),
  FOREIGN KEY ("tenantId", "sequenceId") REFERENCES "Company"."NumberingSeries" ("tenantId", id)
);
COMMENT ON TABLE "Company"."NumberingSeriesCounters" IS 'Next value per (series, reset period). Updated only by Company.getNextDocNo() under a row lock. No std triggers: it is touched on every numbered document.';

-- ===========================================================================
-- NOTIFICATIONS
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- notification — Notification Centre (tabs All / Approvals / Finance / HR /
-- System; Today / Yesterday / Earlier; Unread / Read; Summary: Unread, Needs
-- action, Mentions, Total). Also the target of app/unauthorized "Request access".
-- src/40-acc-core.html (app/notifications), src/60-settings-ess.html (app/unauthorized)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."Notifications" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "userId"          uuid NOT NULL,                                  -- recipient
  category         text NOT NULL,
  "eventCode"       text NOT NULL CHECK ("eventCode" ~ '^[A-Z][A-Z0-9_]{2,40}$'),   -- APPROVAL_REQUESTED, PDC_MATURING, ACCESS_REQUEST …
  title            text NOT NULL,                                  -- "Hira Ali submitted JV-2026-000045 for approval"
  body             text,                                           -- "Payroll accrual · Rs 14,620,000 · 08:42 AM"
  "linkRoute"       text,                                           -- app/accounting/vouchers/view
  "entityType"      text REFERENCES "Company"."DocumentTypes"(code),
  "entityId"        uuid,
  "actorUserId"    uuid,
  amount           numeric(18,2),
  severity         text NOT NULL DEFAULT 'INFO',
  "needsAction"     boolean NOT NULL DEFAULT false,                 -- "Needs action" counter
  "isMention"       boolean NOT NULL DEFAULT false,                 -- "Mentions" counter
  channels         text[] NOT NULL DEFAULT ARRAY['IN_APP']
                   CHECK (cardinality(channels) > 0 AND channels <@ ARRAY['IN_APP','EMAIL','SMS','WHATSAPP','PUSH']),
  "readAt"          timestamptz,
  "archivedAt"      timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "userId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "actorUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "notificationEntityPairChk" CHECK (("entityType" IS NULL) = ("entityId" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"Company"."Notifications"');
CREATE INDEX "notificationInboxIdx"  ON "Company"."Notifications" ("tenantId", "userId", "createdAt" DESC) WHERE "archivedAt" IS NULL;
CREATE INDEX "notificationUnreadIdx" ON "Company"."Notifications" ("tenantId", "userId", category) WHERE "readAt" IS NULL AND "archivedAt" IS NULL;
CREATE INDEX "notificationEntityIdx" ON "Company"."Notifications" ("tenantId", "entityType", "entityId");
COMMENT ON TABLE "Company"."Notifications" IS 'In-app notification per recipient (Notification Centre). Mark read sets readAt; "Mark all read" updates all unread rows of the user.';

-- ===========================================================================
-- AUDIT TRAIL (partitioned, append-only, hash-chained)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- audit_log — Settings › Audit Trail (Timestamp, User, Module, Action, Record,
-- IP address, Change; filters module/user/period/action chips Create/Edit/
-- Post/Delete/Login; Change detail drawer: User, IP/device, Session, Entry hash,
-- Previous hash, Field/Before/After; "Verify chain"; "Export CSV").
-- Written by Company.triggerAudit / Company.triggerAuditRedacted (row changes) and by the
-- API for app actions (LOGIN, LOGIN_FAILED, POST, PERMISSION, EXPORT …).
-- Partitioned by month on occurredAt; DEFAULT partition catches stragglers.
-- id comes from an explicit sequence (portable to PG16 partitioned tables).
-- src/60-settings-ess.html (app/settings/audit)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE "Company"."AuditLogIdSeq" AS bigint;

CREATE TABLE "Company"."AuditTrailEntries" (
  id               bigint NOT NULL DEFAULT nextval('"Company"."AuditLogIdSeq"'),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "occurredAt"      timestamptz NOT NULL DEFAULT now(),
  "userId"          uuid,                                   -- Company.Users.id (not FK'd: append-only log; NULL = system / unknown)
  "actorEmail"      citext,                                 -- failed logins: "nida.shah@alnoor.com.pk"
  action           text NOT NULL,
  "schemaName"      text,                                   -- sales
  "tableName"       text,                                   -- invoice
  "recordId"        uuid,
  "recordLabel"     text,                                   -- JV-2026-000045 / "Lock date" / "Finance Manager"
  module           text,
  changes          jsonb,                                  -- {"field": {"before": x, "after": y}} on UPDATE; full row on INSERT/DELETE
  "ipAddress"       inet,
  "userAgent"       text,                                   -- "Edge / Windows 11"
  "sessionId"       uuid,                                   -- Company.UserSessions.id ("sess_8f21…a90c")
  "entryHash"       bytea,                                  -- sha-256 of this entry (set by trigger)
  PRIMARY KEY (id, "occurredAt")
) PARTITION BY RANGE ("occurredAt");
ALTER SEQUENCE "Company"."AuditLogIdSeq" OWNED BY "Company"."AuditTrailEntries".id;

CREATE TABLE "Company"."AuditTrailEntriesDefault" PARTITION OF "Company"."AuditTrailEntries" DEFAULT;

CREATE INDEX "auditLogTenantTimeIdx"   ON "Company"."AuditTrailEntries" ("tenantId", "occurredAt" DESC);
CREATE INDEX "auditLogTenantIdIdx"     ON "Company"."AuditTrailEntries" ("tenantId", id);
CREATE INDEX "auditLogUserTimeIdx"     ON "Company"."AuditTrailEntries" ("tenantId", "userId", "occurredAt" DESC);
CREATE INDEX "auditLogRecordIdx"        ON "Company"."AuditTrailEntries" ("tenantId", "tableName", "recordId");
CREATE INDEX "auditLogModuleTimeIdx"   ON "Company"."AuditTrailEntries" ("tenantId", module, "occurredAt" DESC);
CREATE INDEX "auditLogActionTimeIdx"   ON "Company"."AuditTrailEntries" ("tenantId", action, "occurredAt" DESC);

COMMENT ON TABLE "Company"."AuditTrailEntries" IS 'Immutable audit trail (Settings › Audit Trail). Monthly range partitions on occurredAt + DEFAULT partition. Append-only; hash-sealed in blocks by Company.sealAuditTrailBlock().';
COMMENT ON COLUMN "Company"."AuditTrailEntries"."entryHash" IS 'sha-256 over the entry''s canonical fields. "Previous hash" in the drawer = entryHash of the previous id of the same tenant; blocks are chained in Company.AuditTrailSeals.';

-- Append-only: no UPDATE / DELETE through any path (BEFORE ROW triggers on a
-- partitioned table are cloned to every partition, PG13+).
CREATE TRIGGER "auditLogAppendOnly" BEFORE UPDATE OR DELETE ON "Company"."AuditTrailEntries"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();

-- Per-entry hash, computed on insert (no locking: chaining happens in seal blocks).
CREATE OR REPLACE FUNCTION "Company"."triggerAuditLogHash"() RETURNS trigger
LANGUAGE plpgsql SET search_path = core, public, pg_temp AS $$
BEGIN
  NEW."entryHash" := digest(
    format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s',
           NEW.id, NEW."tenantId",
           to_char(NEW."occurredAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
           NEW."userId", NEW."actorEmail", NEW.action, NEW."schemaName", NEW."tableName",
           NEW."recordId", NEW."recordLabel", NEW.changes::text, host(NEW."ipAddress")),
    'sha256');
  RETURN NEW;
END $$;

CREATE TRIGGER "auditLogHash" BEFORE INSERT ON "Company"."AuditTrailEntries"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditLogHash"();

-- Monthly partition helper. Bounds are calendar months in Asia/Karachi so a
-- month's activity lands in one partition. Run ahead of time (scheduler):
--   SELECT Company.ensureAuditTrailPartitions(3);
-- If rows for a month already sit in the DEFAULT partition, move them out
-- before creating that month's partition (PostgreSQL refuses otherwise).
CREATE OR REPLACE FUNCTION "Company"."ensureAuditTrailPartition"("pMonth" date)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  "vFrom" date := date_trunc('month', "pMonth")::date;
  "vTo"   date := (date_trunc('month', "pMonth") + interval '1 month')::date;
  "vName" text := format('audit_log_y%sm%s', to_char("vFrom", 'YYYY'), to_char("vFrom", 'MM'));
BEGIN
  IF to_regclass('core.' || "vName") IS NULL THEN
    EXECUTE format('CREATE TABLE core.%I PARTITION OF core.audit_log FOR VALUES FROM (%L) TO (%L)',
                   "vName",
                   ("vFrom"::timestamp AT TIME ZONE 'Asia/Karachi'),
                   ("vTo"::timestamp   AT TIME ZONE 'Asia/Karachi'));
  END IF;
  RETURN 'core.' || "vName";
END $$;
COMMENT ON FUNCTION "Company"."ensureAuditTrailPartition"(date) IS 'Creates the monthly partition of Company.AuditTrailEntries containing pMonth if it does not exist; returns its name.';

CREATE OR REPLACE FUNCTION "Company"."ensureAuditTrailPartitions"("pMonthsAhead" integer DEFAULT 3)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  i integer;
BEGIN
  IF "pMonthsAhead" < 0 OR "pMonthsAhead" > 36 THEN
    RAISE EXCEPTION 'pMonthsAhead must be between 0 and 36';
  END IF;
  FOR i IN 0 .. "pMonthsAhead" LOOP
    PERFORM "Company"."ensureAuditTrailPartition"((date_trunc('month', now() AT TIME ZONE 'Asia/Karachi') + make_interval(months => i))::date);
  END LOOP;
  RETURN "pMonthsAhead" + 1;
END $$;
COMMENT ON FUNCTION "Company"."ensureAuditTrailPartitions"(integer) IS 'Ensures partitions for the current month and the next N months. Call monthly from the scheduler.';

SELECT "Company"."ensureAuditTrailPartitions"(3);

-- ---------------------------------------------------------------------------
-- AuditTrailSeals — helper: hash-chained blocks over audit_log entries ("Hash chain
-- verified — 1,482,906 entries · last block #1482906 · SHA-256 verified").
-- sealHash = sha256(prevSealHash || entryHash of every entry in the block, id order).
-- src/60-settings-ess.html (app/settings/audit banner, "Verify chain")
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."AuditTrailSeals" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "blockNo"         bigint NOT NULL CHECK ("blockNo" >= 1),
  "firstLogId"     bigint NOT NULL,
  "lastLogId"      bigint NOT NULL,
  "entryCount"      integer NOT NULL CHECK ("entryCount" > 0),
  "prevSealHash"   bytea,
  "sealHash"        bytea NOT NULL CHECK (octet_length("sealHash") = 32),
  "sealedAt"        timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "blockNo"),
  CONSTRAINT "auditSealRangeChk" CHECK ("lastLogId" >= "firstLogId"),
  CONSTRAINT "auditSealPrevChk" CHECK (("blockNo" = 1) = ("prevSealHash" IS NULL))
);
CREATE TRIGGER "auditSealAppendOnly" BEFORE UPDATE OR DELETE ON "Company"."AuditTrailSeals"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();
COMMENT ON TABLE "Company"."AuditTrailSeals" IS 'Helper: append-only chain of sealed audit blocks per tenant. Re-computing the chain detects any tampering with Company.AuditTrailEntries.';

-- Seals every not-yet-sealed audit entry of the current tenant older than pLag
-- (the lag lets in-flight transactions commit first). Returns the new blockNo,
-- or NULL when there is nothing to seal. Run by the scheduler per tenant.
CREATE OR REPLACE FUNCTION "Company"."sealAuditTrailBlock"("pLag" interval DEFAULT interval '5 minutes')
RETURNS bigint LANGUAGE plpgsql SET search_path = core, public, pg_temp AS $$
DECLARE
  "vTenant"  uuid := "Company"."getCurrentTenantId"();
  "vBlock"   bigint;
  "vAfter"   bigint;
  "vPrev"    bytea;
  "vFirst"   bigint;
  "vLast"    bigint;
  "vCount"   integer;
  "vHash"    bytea;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('core.audit_seal:' || "vTenant"::text, 0));

  SELECT s."blockNo", s."lastLogId", s."sealHash"
    INTO "vBlock", "vAfter", "vPrev"
    FROM "Company"."AuditTrailSeals" s
   WHERE s."tenantId" = "vTenant"
   ORDER BY s."blockNo" DESC
   LIMIT 1;

  SELECT min(a.id), max(a.id), count(*),
         digest(COALESCE("vPrev", ''::bytea) || string_agg(a."entryHash", ''::bytea ORDER BY a.id), 'sha256')
    INTO "vFirst", "vLast", "vCount", "vHash"
    FROM "Company"."AuditTrailEntries" a
   WHERE a."tenantId" = "vTenant"
     AND a.id > COALESCE("vAfter", 0)
     AND a."occurredAt" < now() - "pLag";

  IF COALESCE("vCount", 0) = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO "Company"."AuditTrailSeals" ("tenantId", "blockNo", "firstLogId", "lastLogId", "entryCount", "prevSealHash", "sealHash")
  VALUES ("vTenant", COALESCE("vBlock", 0) + 1, "vFirst", "vLast", "vCount", "vPrev", "vHash");
  RETURN COALESCE("vBlock", 0) + 1;
END $$;
COMMENT ON FUNCTION "Company"."sealAuditTrailBlock"(interval) IS 'Seals pending audit entries of the current tenant into the next hash-chained block (Company.AuditTrailSeals).';

-- ---------------------------------------------------------------------------
-- Redacting audit trigger: like Company.triggerAudit but drops secret columns (named
-- as trigger arguments) from the stored row; a change to a secret is recorded
-- as {"col": {"before": "[redacted]", "after": "[redacted]"}}.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."triggerAuditRedacted"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = core, pg_temp AS $$
DECLARE
  "vSecret"  text[] := COALESCE(TG_ARGV, '{}'::text[]);
  "vOldRaw" jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
  "vNewRaw" jsonb := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END;
  "vOld"     jsonb;
  "vNew"     jsonb;
  "vDiff"    jsonb := '{}'::jsonb;
  "vKey"     text;
  "vRow"     jsonb;
BEGIN
  "vOld" := "vOldRaw" - "vSecret";
  "vNew" := "vNewRaw" - "vSecret";
  "vRow" := COALESCE("vNew", "vOld");
  IF TG_OP = 'UPDATE' THEN
    FOR "vKey" IN SELECT jsonb_object_keys("vNew") LOOP
      CONTINUE WHEN "vKey" IN ('updatedAt','updatedBy','rowVersion');
      IF ("vOld" -> "vKey") IS DISTINCT FROM ("vNew" -> "vKey") THEN
        "vDiff" := "vDiff" || jsonb_build_object("vKey",
                    jsonb_build_object('before', "vOld" -> "vKey", 'after', "vNew" -> "vKey"));
      END IF;
    END LOOP;
    FOREACH "vKey" IN ARRAY "vSecret" LOOP
      IF ("vOldRaw" -> "vKey") IS DISTINCT FROM ("vNewRaw" -> "vKey") THEN
        "vDiff" := "vDiff" || jsonb_build_object("vKey",
                    jsonb_build_object('before', '[redacted]', 'after', '[redacted]'));
      END IF;
    END LOOP;
    IF "vDiff" = '{}'::jsonb THEN RETURN NULL; END IF;
  END IF;

  INSERT INTO "Company"."AuditTrailEntries" ("tenantId", "occurredAt", "userId", action, "schemaName", "tableName",
                              "recordId", changes, "ipAddress")
  VALUES (("vRow" ->> 'tenantId')::uuid, now(), "Company"."getCurrentUserId"(), TG_OP,
          TG_TABLE_SCHEMA, TG_TABLE_NAME, ("vRow" ->> 'id')::uuid,
          CASE TG_OP WHEN 'UPDATE' THEN "vDiff" WHEN 'INSERT' THEN "vNew" ELSE "vOld" END,
          NULLIF(current_setting('app.clientIp', true), '')::inet);
  RETURN NULL;
END $$;
COMMENT ON FUNCTION "Company"."triggerAuditRedacted"() IS 'Row audit that never stores the secret columns passed as trigger arguments (password hashes, MFA seeds, key hashes).';

CREATE TRIGGER "coreAppUserAudit" AFTER INSERT OR UPDATE OR DELETE ON "Company"."Users"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditRedacted"('passwordHash', 'mfaSecretEnc', 'mfaRecoveryCodes');
