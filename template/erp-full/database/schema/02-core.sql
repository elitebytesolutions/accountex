-- =============================================================================
-- Finsoft ERP (FULL) — 02-core.sql
-- Tenant organisation: company profile & settings, branches, users, roles &
-- permissions, sessions, document numbering, attachments, notifications and
-- the partitioned audit log; plus (Full only) approvals, collaboration
-- (comments, mentions, reactions, activity), tasks, setup guide, data import,
-- document templates, integrations/API keys/webhooks, backup & restore and the
-- business calculator tape.
--
-- BASIC ⊂ FULL: every Basic table below is identical to erp-basic; Full only
-- appends columns (just before the standard audit columns), adds CHECK values
-- and adds the tables in the "FULL EDITION" section at the end.
--
-- Screens (Basic + Full):
--   login, login/forgot, login/mfa           src/30-entry-admin.html
--   app/dashboard                            src/48-dash-stock.html + src/92-dash.js (views only)
--   app/settings  (Company Settings)         src/60-settings-ess.html
--   app/settings/users, app/settings/roles   src/49-cash-users.html + src/9E-cash-users.js
--   app/settings/audit                       src/60-settings-ess.html
--   app/notifications                        src/40-acc-core.html
--   app/profile                              src/60-settings-ess.html
--   app/unauthorized, app/404                src/60-settings-ess.html (no own data)
-- Full only:
--   chooser, mobile                          src/30-entry-admin.html, src/70-mobile.html + src/9D-mobile.js
--   app/today (incl. calculator, tax calc)   src/40-acc-core.html + src/9K-calc.js
--   app/approvals, app/setup, app/import,
--   app/activity                             src/4A-company-plus.html + src/9A-company-plus.js
--   app/settings/approvals, /templates,
--   /integrations, /backup                   src/60-settings-ess.html
--   app/states                               src/60-settings-ess.html (no own data)
--
-- Inline FKs go only to platform.* and core.*. Cross-module FKs
-- (Accounting.ChartOfAccounts, BankCash.BankAccounts, Inventory.Warehouses, Tax.TaxCodes,
-- HumanResources.Employees) are in database/fk/02-core-fks.sql.
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
  -- Full
  "managerEmployeeId" uuid,                                                        -- Manager as employee → HumanResources.Employees (fk file)
  latitude            numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),             -- branch location for ESS geofence
  longitude           numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
  "geofenceRadiusM"   integer CHECK ("geofenceRadiusM" BETWEEN 25 AND 5000),       -- "Geo-fence ESS punches to branch location (200 m)"
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
  -- Full
  "employeeId"           uuid,                                       -- "Linked employee EMP-0007" / wizard "Link existing employee" → HumanResources.Employees (fk file)
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
CREATE UNIQUE INDEX "appUserEmployeeUidx" ON "Company"."Users" ("tenantId", "employeeId") WHERE "employeeId" IS NOT NULL AND status <> 'REMOVED';
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
  -- Full: files attached to activity-feed posts and comments (FKs added at the end of this file)
  "activityEventId"   uuid,
  "commentId"          uuid,
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
  -- Full: Tax › FBR POS & withholding defaults
  "fbrRealtimeReporting"          boolean NOT NULL DEFAULT false,    -- "Report invoices to FBR POS / Digital Invoicing in real time"
  "printFbrQr"                    boolean NOT NULL DEFAULT false,    -- "Print FBR invoice number & QR on sales invoices"
  -- Full: HR & Payroll › Payroll
  "payDayRule"                    text NOT NULL DEFAULT 'LAST_WORKING_DAY',
  "payrollCutoff"                  text NOT NULL DEFAULT 'DAY_25',
  "workingDaysBasis"              text NOT NULL DEFAULT 'CALENDAR_DAYS',
  "eobiEmployerAmount"            numeric(18,2) CHECK ("eobiEmployerAmount" >= 0),        -- "Rs 1,850 / month"
  "pfRatePct"                     numeric(7,4) CHECK ("pfRatePct" BETWEEN 0 AND 100),      -- "8.33% of basic"
  "autoDeductSalaryTax"          boolean NOT NULL DEFAULT true,     -- "Deduct income tax u/s 149 automatically"
  "publishPayslipsToEss"         boolean NOT NULL DEFAULT true,
  -- Full: HR & Payroll › Attendance & late policy
  "workingWeek"                    text NOT NULL DEFAULT 'MON_SAT_HALF_SAT',
  "graceMinutes"                   smallint NOT NULL DEFAULT 15 CHECK ("graceMinutes" BETWEEN 0 AND 120),
  "lateMarksPerLeave"            smallint NOT NULL DEFAULT 3 CHECK ("lateMarksPerLeave" BETWEEN 1 AND 31),
  "halfDayBelowHours"            numeric(4,2) NOT NULL DEFAULT 5 CHECK ("halfDayBelowHours" BETWEEN 0 AND 24),
  "overtimeMultiplier"             numeric(4,2) NOT NULL DEFAULT 2 CHECK ("overtimeMultiplier" IN (1.5, 2)),   -- "2× hourly (Factories Act)"
  "attendanceSource"               text NOT NULL DEFAULT 'BIOMETRIC_AND_ESS',
  "geofenceEssPunch"              boolean NOT NULL DEFAULT true,
  "allowOffsitePersonalPunch"    boolean NOT NULL DEFAULT false,
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
                                                            'NEW_SIGN_IN','SYSTEM',
                                                            'MENTION','LEAVE_REQUEST','PAYROLL','DEVICE_OFFLINE','BACKUP']),
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
LANGUAGE plpgsql SET search_path = "Company", public, pg_temp AS $$
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
  IF to_regclass('"Company".' || "vName") IS NULL THEN
    EXECUTE format('CREATE TABLE "Company".%I PARTITION OF "Company"."AuditTrailEntries" FOR VALUES FROM (%L) TO (%L)',
                   "vName",
                   ("vFrom"::timestamp AT TIME ZONE 'Asia/Karachi'),
                   ("vTo"::timestamp   AT TIME ZONE 'Asia/Karachi'));
  END IF;
  RETURN '"Company".' || "vName";
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
RETURNS bigint LANGUAGE plpgsql SET search_path = "Company", public, pg_temp AS $$
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = "Company", pg_temp AS $$
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

-- #############################################################################
-- FULL EDITION — tables below exist only in erp-full
-- #############################################################################

-- ---------------------------------------------------------------------------
-- fxRate — Company Settings › Finance "Exchange rate source: State Bank of
-- Pakistan (daily) / Manual" + "Allow multi-currency transactions (USD, AED, EUR)".
-- src/60-settings-ess.html (set-finance)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."ExchangeRates" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "currencyCode"    char(3) NOT NULL REFERENCES "Company"."Currencies"(code),
  "rateDate"        date NOT NULL,
  rate             numeric(18,6) NOT NULL CHECK (rate > 0),          -- units of base currency per 1 unit of currencyCode
  source           text NOT NULL DEFAULT 'SBP',
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "currencyCode", "rateDate")
);
SELECT "Company"."addStandardTriggers"('"Company"."ExchangeRates"', true);
COMMENT ON TABLE "Company"."ExchangeRates" IS 'Daily exchange rates (SBP feed or manual) for multi-currency documents; rate = base currency per unit of foreign currency.';

-- ===========================================================================
-- USERS & ACCESS (Full)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- UserInvites — Users › "Pending invites" (email, role, branch, via Email /
-- WhatsApp, by, sent, "Expires today / Expires 4 Oct", Resend (cool-down),
-- Copy invite link, Revoke); wizard step "Method" (Invite by email / WhatsApp).
-- The one-time link token lives in Company.PasswordResets (purpose INVITE).
-- src/9E-cash-users.js (INVITES, renderInvites, wzMethod)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."UserInvites" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "userId"             uuid NOT NULL,                              -- the INVITED Company.Users row
  email               citext NOT NULL,
  "fullName"           text,
  phone               text,
  "roleId"             uuid NOT NULL,
  "branchId"           uuid,
  "employeeId"         uuid,                                       -- linked employee → HumanResources.Employees (fk file)
  channels            text[] NOT NULL DEFAULT ARRAY['EMAIL']
                      CHECK (cardinality(channels) > 0 AND channels <@ ARRAY['EMAIL','WHATSAPP']),
  "passwordResetId"   uuid,                                       -- current link token (purpose INVITE)
  "invitedByUserId"  uuid NOT NULL,
  "sentAt"             timestamptz NOT NULL DEFAULT now(),
  "expiresAt"          timestamptz NOT NULL,                       -- sentAt + 7 days
  "resendCount"        smallint NOT NULL DEFAULT 0 CHECK ("resendCount" >= 0),
  "lastResentAt"      timestamptz,
  status              text NOT NULL DEFAULT 'PENDING',
  "acceptedAt"         timestamptz,
  "revokedAt"          timestamptz,
  "revokedByUserId"  uuid,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "userId")            REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "roleId")            REFERENCES "Company"."Roles" ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId")          REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "passwordResetId")  REFERENCES "Company"."PasswordResets" ("tenantId", id),
  FOREIGN KEY ("tenantId", "invitedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "revokedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "userInviteExpiryChk"   CHECK ("expiresAt" > "sentAt"),
  CONSTRAINT "userInviteAcceptedChk" CHECK ((status = 'ACCEPTED') = ("acceptedAt" IS NOT NULL)),
  CONSTRAINT "userInviteRevokedChk"  CHECK ((status = 'REVOKED') = ("revokedAt" IS NOT NULL)),
  CONSTRAINT "userInviteWhatsappPhoneChk" CHECK (NOT ('WHATSAPP' = ANY (channels)) OR phone IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Company"."UserInvites"', true);
CREATE UNIQUE INDEX "userInviteOnePendingIdx" ON "Company"."UserInvites" ("tenantId", email) WHERE status = 'PENDING';
CREATE INDEX "userInviteStatusIdx" ON "Company"."UserInvites" ("tenantId", status, "expiresAt");
COMMENT ON TABLE "Company"."UserInvites" IS 'Invitations (Users › Pending invites). Expire after 7 days; resend issues a new INVITE token in Company.PasswordResets.';

-- ---------------------------------------------------------------------------
-- UserMfaMethods — additional second factors beyond the primary TOTP seed on
-- Users: SMS fallback ("Code to +92 300 ••• 4521"), WebAuthn, and the mobile
-- apps' "Face ID / fingerprint unlock". Users › "Reset MFA" revokes them all.
-- src/30-entry-admin.html (login/mfa), src/9D-mobile.js (Biometric login),
-- src/9E-cash-users.js (resetMfa)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."UserMfaMethods" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "userId"          uuid NOT NULL,
  "factorType"      text NOT NULL,
  label            text,                                         -- "Google Authenticator", "iPhone 15"
  "secretEnc"       bytea,                                        -- TOTP seed / WebAuthn public key (encrypted)
  phone            text,                                         -- SMS factor
  "isPrimary"       boolean NOT NULL DEFAULT false,
  "verifiedAt"      timestamptz,
  "lastUsedAt"     timestamptz,
  status           text NOT NULL DEFAULT 'PENDING',
  "revokedAt"       timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "userId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "userMfaSmsPhoneChk" CHECK ("factorType" <> 'SMS' OR phone IS NOT NULL),
  CONSTRAINT "userMfaRevokedChk"  CHECK ((status = 'REVOKED') = ("revokedAt" IS NOT NULL)),
  CONSTRAINT "userMfaActiveChk"   CHECK (status <> 'ACTIVE' OR "verifiedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Company"."UserMfaMethods"');
CREATE TRIGGER "coreUserMfaAudit" AFTER INSERT OR UPDATE OR DELETE ON "Company"."UserMfaMethods"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditRedacted"('secretEnc');
CREATE UNIQUE INDEX "userMfaOnePrimaryIdx" ON "Company"."UserMfaMethods" ("tenantId", "userId") WHERE "isPrimary" AND status = 'ACTIVE';
COMMENT ON TABLE "Company"."UserMfaMethods" IS 'Enrolled second factors per user (SMS fallback, WebAuthn, mobile biometric) in addition to the TOTP seed on Company.Users.';

-- ---------------------------------------------------------------------------
-- TrustedDevices — devices that skip MFA ("Trust this device for 30 days") and
-- the mobile apps' registered phones (push token, Face ID unlock, offline sync).
-- src/30-entry-admin.html (login/mfa), src/70-mobile.html + src/9D-mobile.js
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."TrustedDevices" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "userId"                 uuid NOT NULL,
  "deviceFingerprintHash" bytea NOT NULL CHECK (octet_length("deviceFingerprintHash") = 32),
  "deviceLabel"            text,                                   -- "iPhone 15", "Pixel 7", "Edge · Windows 11"
  platform                text NOT NULL,
  "appVersion"             text,                                   -- "Finsoft 4.2"
  "pushToken"              text,                                   -- APNs / FCM token for mobile alerts
  "biometricUnlock"        boolean NOT NULL DEFAULT false,         -- "Face ID / fingerprint unlock"
  "trustedUntil"           timestamptz NOT NULL,
  "lastSeenAt"            timestamptz,
  "lastIp"                 inet,
  "revokedAt"              timestamptz,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "userId", "deviceFingerprintHash"),
  FOREIGN KEY ("tenantId", "userId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "trustedDeviceBiometricChk" CHECK (NOT "biometricUnlock" OR platform IN ('IOS','ANDROID'))
);
SELECT "Company"."addStandardTriggers"('"Company"."TrustedDevices"');
CREATE INDEX "trustedDeviceUserIdx" ON "Company"."TrustedDevices" ("tenantId", "userId") WHERE "revokedAt" IS NULL;
COMMENT ON TABLE "Company"."TrustedDevices" IS 'Remembered devices: MFA skip window and mobile app registration (push token, biometric unlock).';

-- ---------------------------------------------------------------------------
-- RoleLimits — Roles & Permissions › "Data limits: caps applied on top of the
-- matrix" (Max voucher amount, Max discount, Back-dated posting, Salary
-- visibility). Disabled for Owner.  src/9E-cash-users.js (renderLimits, META)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."RoleLimits" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "roleId"             uuid NOT NULL,
  "maxVoucherAmount"  numeric(18,2) NOT NULL DEFAULT 0 CHECK ("maxVoucherAmount" >= 0),   -- 0 = "No approvals"
  "maxDiscountPct"    numeric(7,4) NOT NULL DEFAULT 0 CHECK ("maxDiscountPct" BETWEEN 0 AND 100),
  "backdateDays"       smallint NOT NULL DEFAULT 0 CHECK ("backdateDays" IN (0, 3, 7, 30, 365)),   -- 365 = "Any open period"
  "salaryVisibility"   text NOT NULL DEFAULT 'HIDDEN',
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "roleId"),
  FOREIGN KEY ("tenantId", "roleId") REFERENCES "Company"."Roles" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Company"."RoleLimits"', true);
COMMENT ON TABLE "Company"."RoleLimits" IS 'Per-role caps: max voucher amount a member may approve, max discount %, back-dated posting window, salary visibility (HIDDEN / MASKED except own / FULL).';

-- ---------------------------------------------------------------------------
-- SegregationOfDutiesRules — live segregation-of-duties checks on Roles & Permissions
-- ("Create & approve · Journal vouchers", "Create & post · Cash book",
-- "Create users & edit roles" = privilege escalation; "Remove Approve" fix).
-- src/9E-cash-users.js (SOD_CA, SOD_CP, conflicts)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."SegregationOfDutiesRules" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code             text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{2,40}$'),       -- VCH_CREATE_APPROVE
  name             text NOT NULL,
  kind             text NOT NULL,
  "permissionA"     text NOT NULL REFERENCES "Company"."Permissions"(code),               -- vch:create
  "permissionB"     text NOT NULL REFERENCES "Company"."Permissions"(code),               -- vch:approve
  description      text,                                                         -- "The same person could raise and approve …"
  severity         text NOT NULL DEFAULT 'WARN',
  "ownerExempt"     boolean NOT NULL DEFAULT true,                                -- "Owner bypasses segregation-of-duties checks"
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  UNIQUE ("tenantId", "permissionA", "permissionB"),
  CONSTRAINT "sodRuleDistinctChk" CHECK ("permissionA" <> "permissionB")
);
SELECT "Company"."addStandardTriggers"('"Company"."SegregationOfDutiesRules"', true);
COMMENT ON TABLE "Company"."SegregationOfDutiesRules" IS 'Pairs of permissions one role should not hold together. Evaluated when a role''s matrix is edited; BLOCK rules reject the save.';

-- ===========================================================================
-- APPROVALS (Settings › Approval Workflows; Approvals Inbox; Today › Approvals queue)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- approvalWorkflow — workflow cards (Vouchers > Rs 500,000 · JV, CPV, BPV;
-- Vendor payments; Leave requests; Payroll run; Credit override; Purchase
-- orders "Draft · Not published") and the builder (Trigger → Steps → Outcome
-- "Auto-post · Notify preparer"; Notifications In-app / Email / WhatsApp).
-- src/60-settings-ess.html (app/settings/approvals)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."ApprovalWorkflows" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name                 text NOT NULL,                              -- Vouchers > Rs 500,000
  subject              text NOT NULL,
  description          text,
  status               text NOT NULL DEFAULT 'DRAFT',
  version              integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  priority             integer NOT NULL DEFAULT 100,               -- lower = evaluated first when several match
  "onComplete"          text NOT NULL DEFAULT 'AUTO_POST',
  "onReject"            text NOT NULL DEFAULT 'RETURN_TO_PREPARER',
  "notifyPreparer"      boolean NOT NULL DEFAULT true,
  "notifyInApp"        boolean NOT NULL DEFAULT true,
  "notifyEmail"         boolean NOT NULL DEFAULT true,
  "notifyWhatsapp"      boolean NOT NULL DEFAULT false,
  "publishedAt"         timestamptz,
  "publishedByUserId" uuid,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  "deletedAt"           timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", name),
  FOREIGN KEY ("tenantId", "publishedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "approvalWorkflowPublishedChk" CHECK (status = 'DRAFT' OR "publishedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Company"."ApprovalWorkflows"', true);
CREATE INDEX "approvalWorkflowSubjectIdx" ON "Company"."ApprovalWorkflows" ("tenantId", subject, priority) WHERE status = 'ACTIVE' AND "deletedAt" IS NULL;
COMMENT ON TABLE "Company"."ApprovalWorkflows" IS 'Approval chains with conditions and ordered steps. Only ACTIVE (published) workflows route documents.';

-- ApprovalWorkflowConditions — builder "Conditions: all must be true" (Field / Operator / Value):
-- Voucher total > 500,000 · Voucher type is any of JV, CPV, BPV · Branch is any of All branches
CREATE TABLE "Company"."ApprovalWorkflowConditions" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "workflowId"      uuid NOT NULL,
  seq              smallint NOT NULL CHECK (seq >= 1),
  field            text NOT NULL,
  operator         text NOT NULL,
  value            jsonb NOT NULL,                                 -- 500000 · ["JV","CPV","BPV"] · [] (= all branches)
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "workflowId", seq),
  FOREIGN KEY ("tenantId", "workflowId") REFERENCES "Company"."ApprovalWorkflows" ("tenantId", id),
  CONSTRAINT "approvalConditionListChk" CHECK (operator NOT IN ('IN','NOT_IN','BETWEEN') OR jsonb_typeof(value) = 'array')
);
SELECT "Company"."addStandardTriggers"('"Company"."ApprovalWorkflowConditions"', true);
COMMENT ON TABLE "Company"."ApprovalWorkflowConditions" IS 'AND-ed conditions deciding whether a workflow applies to a submitted document.';

-- ApprovalWorkflowSteps — builder steps (Step 1 Finance Manager · SLA 8 h; Step 2 CFO
-- "if > Rs 2,000,000"; Step 3 CEO "if > Rs 5,000,000") and "Step settings"
-- (Approver: Role / Specific user / Preparer's line manager; SLA; On SLA breach;
-- Approval mode Any one / All; Preparer cannot approve own; Allow delegation
-- when on leave; Require comment on approval).
CREATE TABLE "Company"."ApprovalWorkflowSteps" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "workflowId"           uuid NOT NULL,
  "stepNo"               smallint NOT NULL CHECK ("stepNo" BETWEEN 1 AND 20),
  name                  text NOT NULL,                             -- Finance Manager / CFO / CEO
  "approverType"         text NOT NULL,
  "approverRoleId"      uuid,
  "approverUserId"      uuid,
  "appliesAboveAmount"  numeric(18,2) CHECK ("appliesAboveAmount" >= 0),   -- step skipped when amount <= this
  "slaHours"             numeric(6,2) NOT NULL DEFAULT 8 CHECK ("slaHours" > 0),
  "onSlaBreach"         text NOT NULL DEFAULT 'ESCALATE',
  "approvalMode"         text NOT NULL DEFAULT 'ANY',
  "blockSelfApproval"   boolean NOT NULL DEFAULT true,
  "allowDelegation"      boolean NOT NULL DEFAULT true,
  "requireComment"       boolean NOT NULL DEFAULT false,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "workflowId", "stepNo"),
  FOREIGN KEY ("tenantId", "workflowId")      REFERENCES "Company"."ApprovalWorkflows" ("tenantId", id),
  FOREIGN KEY ("tenantId", "approverRoleId") REFERENCES "Company"."Roles" ("tenantId", id),
  FOREIGN KEY ("tenantId", "approverUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "approvalStepRoleChk" CHECK (("approverType" = 'ROLE') = ("approverRoleId" IS NOT NULL)),
  CONSTRAINT "approvalStepUserChk" CHECK (("approverType" = 'USER') = ("approverUserId" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Company"."ApprovalWorkflowSteps"', true);
COMMENT ON TABLE "Company"."ApprovalWorkflowSteps" IS 'Ordered approval steps. LINE_MANAGER resolves through the preparer''s linked HumanResources.Employees manager.';

-- ---------------------------------------------------------------------------
-- Approvals — one routing of one document (Approvals Inbox cards/table:
-- Document, Details, Requested by, Amount, Age, SLA "Due in 4h / SLA breached";
-- KPIs Waiting on you, Value pending, SLA breached, Approved today; Today ›
-- Approvals queue; Dashboard › Pending approvals; mobile Owner app swipe-approve).
-- src/9A-company-plus.js (approvals), src/40-acc-core.html (app/today), src/9D-mobile.js
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."Approvals" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "workflowId"           uuid NOT NULL,
  "entityType"           text NOT NULL REFERENCES "Company"."DocumentTypes"(code),      -- JV, PO, BILL, PAY, LV, EXP, PRUN, CO
  "entityId"             uuid NOT NULL,
  "docLabel"             text NOT NULL,                                     -- JV-2026-000318
  title                 text,                                              -- "Accrued audit fee, Q1 FY27 (over Rs 500k limit)"
  amount                numeric(18,2) CHECK (amount >= 0),                 -- NULL = "No amount" (leave)
  "currencyCode"         char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),
  "branchId"             uuid,
  "requestedByUserId"  uuid NOT NULL,
  "requestedAt"          timestamptz NOT NULL DEFAULT now(),
  "currentStepNo"       smallint,
  "currentStepDueAt"   timestamptz,                                       -- SLA deadline of the current step
  "isEscalated"          boolean NOT NULL DEFAULT false,
  status                text NOT NULL DEFAULT 'PENDING',
  "completedAt"          timestamptz,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "workflowId")          REFERENCES "Company"."ApprovalWorkflows" ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId")            REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "requestedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "approvalRequestDoneChk" CHECK ((status = 'PENDING') = ("completedAt" IS NULL)),
  CONSTRAINT "approvalRequestStepChk" CHECK (status <> 'PENDING' OR "currentStepNo" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Company"."Approvals"', true);
CREATE UNIQUE INDEX "approvalRequestOnePendingIdx" ON "Company"."Approvals" ("tenantId", "entityType", "entityId") WHERE status = 'PENDING';
CREATE INDEX "approvalRequestInboxIdx"     ON "Company"."Approvals" ("tenantId", status, "currentStepDueAt");
CREATE INDEX "approvalRequestEntityIdx"    ON "Company"."Approvals" ("tenantId", "entityType", "entityId", "requestedAt" DESC);
CREATE INDEX "approvalRequestRequesterIdx" ON "Company"."Approvals" ("tenantId", "requestedByUserId", "requestedAt" DESC);
COMMENT ON TABLE "Company"."Approvals" IS 'A document routed through a workflow. At most one PENDING request per document. Posting services call Company.assertDocumentApproved() before posting.';

-- ApprovalActions — the approval chain timeline ("Hira Ali · Senior Accountant ·
-- Approved 29 Sep, 16:40"), Approve / Reject (reason chips "Missing supporting
-- documents", "Over budget" …) / Request changes / Delegate / Bulk approve.
-- Append-only.
CREATE TABLE "Company"."ApprovalActions" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "requestId"            uuid NOT NULL,
  "stepNo"               smallint NOT NULL CHECK ("stepNo" >= 0),          -- 0 = submission
  action                text NOT NULL,
  "actorUserId"         uuid,                                            -- NULL = system (escalation, reminder, auto-skip)
  "onBehalfOfUserId"  uuid,                                            -- approver the delegate acted for
  "delegateToUserId"   uuid,
  reason                text,                                            -- rejection / change reason chip
  comment               text,
  "isBulk"               boolean NOT NULL DEFAULT false,
  "actedAt"              timestamptz NOT NULL DEFAULT now(),
  "ipAddress"            inet,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "requestId")           REFERENCES "Company"."Approvals" ("tenantId", id),
  FOREIGN KEY ("tenantId", "actorUserId")        REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "onBehalfOfUserId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "delegateToUserId")  REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "approvalActionDelegateChk" CHECK ((action = 'DELEGATE') = ("delegateToUserId" IS NOT NULL)),
  CONSTRAINT "approvalActionReasonChk" CHECK (action NOT IN ('REJECT','REQUEST_CHANGES') OR COALESCE(reason, comment) IS NOT NULL),
  CONSTRAINT "approvalActionActorChk" CHECK ("actorUserId" IS NOT NULL OR action IN ('ESCALATE','REMIND','AUTO_SKIP'))
);
SELECT "Company"."addStandardTriggers"('"Company"."ApprovalActions"');
CREATE TRIGGER "approvalActionAppendOnly" BEFORE UPDATE OR DELETE ON "Company"."ApprovalActions"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();
CREATE INDEX "approvalActionRequestIdx" ON "Company"."ApprovalActions" ("tenantId", "requestId", "actedAt");
CREATE INDEX "approvalActionActorIdx"   ON "Company"."ApprovalActions" ("tenantId", "actorUserId", "actedAt" DESC);
COMMENT ON TABLE "Company"."ApprovalActions" IS 'Append-only decision log of an approval request ("Approved today" KPI counts today''s APPROVE rows).';

-- ApprovalDelegations — helper: "Allow delegation when on leave" / inbox
-- "Delegate for HR": approvals of from_user are also routed to to_user.
CREATE TABLE "Company"."ApprovalDelegations" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "fromUserId"     uuid NOT NULL,
  "toUserId"       uuid NOT NULL,
  subject          text,     -- NULL = all subjects
  "startsOn"        date NOT NULL,
  "endsOn"          date NOT NULL,
  reason           text,
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "fromUserId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "toUserId")   REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "approvalDelegationDatesChk" CHECK ("endsOn" >= "startsOn"),
  CONSTRAINT "approvalDelegationSelfChk"  CHECK ("fromUserId" <> "toUserId")
);
SELECT "Company"."addStandardTriggers"('"Company"."ApprovalDelegations"', true);
CREATE INDEX "approvalDelegationToIdx" ON "Company"."ApprovalDelegations" ("tenantId", "toUserId", "startsOn", "endsOn") WHERE "isActive";
COMMENT ON TABLE "Company"."ApprovalDelegations" IS 'Helper: standing delegation of approvals while an approver is away.';

-- Approval gate used by posting services (see POSTING_RULES › Approval gate).
CREATE OR REPLACE FUNCTION "Company"."getApprovalStatus"("pEntityType" text, "pEntityId" uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT r.status FROM "Company"."Approvals" r
      WHERE r."tenantId" = "Company"."getCurrentTenantId"() AND r."entityType" = "pEntityType" AND r."entityId" = "pEntityId"
      ORDER BY r."requestedAt" DESC LIMIT 1),
    'NOT_ROUTED')
$$;
COMMENT ON FUNCTION "Company"."getApprovalStatus"(text, uuid) IS 'Latest approval status of a document: PENDING / APPROVED / REJECTED / CHANGES_REQUESTED / CANCELLED, or NOT_ROUTED.';

CREATE OR REPLACE FUNCTION "Company"."assertDocumentApproved"("pEntityType" text, "pEntityId" uuid, "pRequired" boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql STABLE AS $$
DECLARE
  "vStatus" text := "Company"."getApprovalStatus"("pEntityType", "pEntityId");
BEGIN
  IF "vStatus" = 'APPROVED' OR ("vStatus" = 'NOT_ROUTED' AND NOT "pRequired") THEN
    RETURN;
  END IF;
  RAISE EXCEPTION '% % cannot be posted: approval status is %', "pEntityType", "pEntityId", "vStatus"
    USING ERRCODE = 'check_violation';
END $$;
COMMENT ON FUNCTION "Company"."assertDocumentApproved"(text, uuid, boolean) IS 'Raises unless the document''s latest approval request is APPROVED. pRequired = true when a matching ACTIVE workflow exists (decided by the posting service at submit).';

-- ===========================================================================
-- COLLABORATION: activity feed, comments, mentions, reactions, tags
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- ActivityEvents — Activity Feed posts ("Zainab Raza created invoice
-- INV-2026-000958" + document card amount/sub/status; "Share an update" composer
-- with module select; tabs All / Mentions / My activity; People and Modules
-- filters). System events and user posts share this table (kind).
-- src/9A-company-plus.js (activity), src/4A-company-plus.html (app/activity)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."ActivityEvents" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "occurredAt"      timestamptz NOT NULL DEFAULT now(),
  kind             text NOT NULL DEFAULT 'SYSTEM',
  "actorUserId"    uuid,
  module           text NOT NULL,
  "eventCode"       text CHECK ("eventCode" ~ '^[A-Z][A-Z0-9_]{2,40}$'),   -- INVOICE_CREATED, PERIOD_CLOSED …
  verb             text,                                                -- "created invoice", "closed period"
  "entityType"      text REFERENCES "Company"."DocumentTypes"(code),
  "entityId"        uuid,
  "entityLabel"     text,                                                -- INV-2026-000958 / "September 2026" / "Bilal Khan"
  "linkRoute"       text,
  amount           numeric(18,2),                                       -- document card amount
  summary          text,                                                -- "Engro Foods · due 31 Oct"
  "statusLabel"     text,                                                -- Sent / Matched / Awaiting you
  "statusTone"      text,
  body             text CHECK (char_length(body) <= 5000),              -- free text of a post / note on the event
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "actorUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "activityEventEntityPairChk" CHECK (("entityType" IS NULL) = ("entityId" IS NULL)),
  CONSTRAINT "activityEventPostActorChk" CHECK (kind <> 'POST' OR "actorUserId" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Company"."ActivityEvents"');
CREATE INDEX "activityEventFeedIdx"   ON "Company"."ActivityEvents" ("tenantId", "occurredAt" DESC) WHERE "deletedAt" IS NULL;
CREATE INDEX "activityEventActorIdx"  ON "Company"."ActivityEvents" ("tenantId", "actorUserId", "occurredAt" DESC);
CREATE INDEX "activityEventModuleIdx" ON "Company"."ActivityEvents" ("tenantId", module, "occurredAt" DESC);
CREATE INDEX "activityEventEntityIdx" ON "Company"."ActivityEvents" ("tenantId", "entityType", "entityId");
COMMENT ON TABLE "Company"."ActivityEvents" IS 'Activity Feed: system events on documents and user posts. Replies are Company.Comments, reactions Company.Reactions, @mentions Company.Mentions.';

-- ---------------------------------------------------------------------------
-- comment — replies under feed posts ("Reply · 1") and comment threads on
-- documents (Approvals drawer "Comments", "Write a comment, @ to mention…").
-- src/9A-company-plus.js (activity replies, approval comments)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."Comments" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "authorUserId"     uuid NOT NULL,
  "entityType"        text REFERENCES "Company"."DocumentTypes"(code),             -- comment on a document
  "entityId"          uuid,
  "activityEventId"  uuid,                                             -- reply to a feed post
  "parentCommentId"  uuid,                                             -- threaded reply
  body               text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  "editedAt"          timestamptz,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  "deletedAt"         timestamptz,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "authorUserId")    REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "activityEventId") REFERENCES "Company"."ActivityEvents" ("tenantId", id),
  FOREIGN KEY ("tenantId", "parentCommentId") REFERENCES "Company"."Comments" ("tenantId", id),
  CONSTRAINT "commentEntityPairChk" CHECK (("entityType" IS NULL) = ("entityId" IS NULL)),
  CONSTRAINT "commentTargetChk" CHECK ("entityId" IS NOT NULL OR "activityEventId" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Company"."Comments"');
CREATE INDEX "commentEntityIdx"   ON "Company"."Comments" ("tenantId", "entityType", "entityId", "createdAt") WHERE "deletedAt" IS NULL;
CREATE INDEX "commentActivityIdx" ON "Company"."Comments" ("tenantId", "activityEventId", "createdAt") WHERE "deletedAt" IS NULL;
COMMENT ON TABLE "Company"."Comments" IS 'Comments on documents and replies to activity-feed posts.';

-- mention — "@Sana Javed" in posts/comments; Activity Feed "Mentions" tab and
-- Notification Centre "Mentions" counter.
CREATE TABLE "Company"."Mentions" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "mentionedUserId"     uuid NOT NULL,
  "mentionedByUserId"  uuid,
  "activityEventId"     uuid,
  "commentId"            uuid,
  "readAt"               timestamptz,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE NULLS NOT DISTINCT ("tenantId", "mentionedUserId", "activityEventId", "commentId"),
  FOREIGN KEY ("tenantId", "mentionedUserId")    REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "mentionedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "activityEventId")    REFERENCES "Company"."ActivityEvents" ("tenantId", id),
  FOREIGN KEY ("tenantId", "commentId")           REFERENCES "Company"."Comments" ("tenantId", id),
  CONSTRAINT "mentionTargetChk" CHECK (num_nonnulls("activityEventId", "commentId") = 1)
);
SELECT "Company"."addStandardTriggers"('"Company"."Mentions"');
CREATE INDEX "mentionUserIdx" ON "Company"."Mentions" ("tenantId", "mentionedUserId", "createdAt" DESC);
COMMENT ON TABLE "Company"."Mentions" IS '@mentions of a user in a feed post or a comment.';

-- reaction — 👍 / 🎉 / "React" on feed posts and replies (one per user per emoji)
CREATE TABLE "Company"."Reactions" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "userId"            uuid NOT NULL,
  emoji              text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  "activityEventId"  uuid,
  "commentId"         uuid,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE NULLS NOT DISTINCT ("tenantId", "userId", emoji, "activityEventId", "commentId"),
  FOREIGN KEY ("tenantId", "userId")           REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "activityEventId") REFERENCES "Company"."ActivityEvents" ("tenantId", id),
  FOREIGN KEY ("tenantId", "commentId")        REFERENCES "Company"."Comments" ("tenantId", id),
  CONSTRAINT "reactionTargetChk" CHECK (num_nonnulls("activityEventId", "commentId") = 1)
);
SELECT "Company"."addStandardTriggers"('"Company"."Reactions"');
CREATE INDEX "reactionEventIdx" ON "Company"."Reactions" ("tenantId", "activityEventId");
COMMENT ON TABLE "Company"."Reactions" IS 'Emoji reactions on feed posts and comments (un-react removes the row via a service-role path; the app role has no DELETE).';

-- tag / TaggedRecords — free labels on any document (plan: polymorphic shared services)
CREATE TABLE "Company"."Tags" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name             citext NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  tone             text NOT NULL DEFAULT 'neutral',
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", name)
);
SELECT "Company"."addStandardTriggers"('"Company"."Tags"');
COMMENT ON TABLE "Company"."Tags" IS 'Tenant tag vocabulary for labelling documents.';

CREATE TABLE "Company"."TaggedRecords" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "tagId"           uuid NOT NULL,
  "entityType"      text NOT NULL REFERENCES "Company"."DocumentTypes"(code),
  "entityId"        uuid NOT NULL,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "tagId", "entityType", "entityId"),
  FOREIGN KEY ("tenantId", "tagId") REFERENCES "Company"."Tags" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Company"."TaggedRecords"');
CREATE INDEX "entityTagEntityIdx" ON "Company"."TaggedRecords" ("tenantId", "entityType", "entityId");
COMMENT ON TABLE "Company"."TaggedRecords" IS 'Tag ↔ document link (polymorphic via Company.DocumentTypes).';

-- Attachments on feed posts / comments (columns appended to Company.Attachments above)
ALTER TABLE "Company"."Attachments"
  ADD CONSTRAINT "attachmentActivityEventFk" FOREIGN KEY ("tenantId", "activityEventId") REFERENCES "Company"."ActivityEvents" ("tenantId", id),
  ADD CONSTRAINT "attachmentCommentFk"        FOREIGN KEY ("tenantId", "commentId")        REFERENCES "Company"."Comments" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- NotificationPreferences — per event × channel subscription overriding the coarse
-- toggles of Company.UserPreferences (e.g. "SMS for approvals above Rs 1M",
-- "WhatsApp cheque maturity alerts", "Daily cash position email (08:00)").
-- src/60-settings-ess.html (prof-prefs), src/40-acc-core.html (Delivery channels)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."NotificationPreferences" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "userId"          uuid NOT NULL,
  "eventCode"       text NOT NULL CHECK ("eventCode" ~ '^[A-Z][A-Z0-9_]{2,40}$'),
  channel          text NOT NULL,
  "isEnabled"       boolean NOT NULL DEFAULT true,
  "minAmount"       numeric(18,2) CHECK ("minAmount" >= 0),          -- only when the amount exceeds this
  delivery         text NOT NULL DEFAULT 'INSTANT',
  "digestTime"      time,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "userId", "eventCode", channel),
  FOREIGN KEY ("tenantId", "userId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "notificationPrefDigestChk" CHECK (delivery <> 'DAILY_DIGEST' OR "digestTime" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Company"."NotificationPreferences"');
COMMENT ON TABLE "Company"."NotificationPreferences" IS 'Fine-grained notification routing per event and channel; rows override Company.UserPreferences defaults.';

-- ===========================================================================
-- WORKSPACE: tasks, setup guide, data import
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- task — Today's Work › "My task list" (Task, Module, Priority, Due, Status;
-- chips All / Pending / In progress / Done; KPIs Tasks due today, Overdue,
-- Daily progress), "Add task" modal (Title, Module, Assign to, Due date, Due
-- time, Priority, Repeat, Notes, Remind me 30 minutes before) and the Agenda
-- ("09:30 · Finance stand-up"). OVERDUE is derived (due passed, not done).
-- src/40-acc-core.html (app/today, acc-new-task)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."Tasks" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  kind                 text NOT NULL DEFAULT 'TASK',
  title                text NOT NULL,                                  -- "Reconcile Meezan Bank — 0123"
  notes                text,                                           -- "14 unmatched statement lines"
  module               text NOT NULL DEFAULT 'ACCOUNTING',
  "assigneeUserId"     uuid NOT NULL,
  "assignedByUserId"  uuid,
  participants         text,                                           -- meetings: "With Hira Ali & Ahmed Raza"
  "dueDate"             date NOT NULL,
  "dueTime"             time,
  priority             text NOT NULL DEFAULT 'MEDIUM',
  status               text NOT NULL DEFAULT 'PENDING',
  "repeatRule"          text NOT NULL DEFAULT 'NEVER',
  "remindBeforeMin"    smallint CHECK ("remindBeforeMin" BETWEEN 0 AND 1440),
  source               text NOT NULL DEFAULT 'MANUAL',   -- SYSTEM: generated (period close, PDC deposit …)
  "linkRoute"           text,
  "entityType"          text REFERENCES "Company"."DocumentTypes"(code),
  "entityId"            uuid,
  "completedAt"         timestamptz,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "assigneeUserId")    REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "assignedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "taskDoneChk" CHECK ((status = 'DONE') = ("completedAt" IS NOT NULL)),
  CONSTRAINT "taskEntityPairChk" CHECK (("entityType" IS NULL) = ("entityId" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"Company"."Tasks"');
CREATE INDEX "taskAssigneeIdx" ON "Company"."Tasks" ("tenantId", "assigneeUserId", status, "dueDate");
CREATE INDEX "taskDueIdx"      ON "Company"."Tasks" ("tenantId", "dueDate") WHERE status IN ('PENDING','IN_PROGRESS');
COMMENT ON TABLE "Company"."Tasks" IS 'Personal / delegated tasks, meetings and reminders (Today''s Work). Overdue = due date/time passed and status not DONE/CANCELLED.';

-- ---------------------------------------------------------------------------
-- SetupGuideSteps — Setup Guide checklist (Company profile, Chart of accounts,
-- Opening balances, Import items, Connect bank, Tax & FBR, Invite team, First
-- invoice, Payroll setup) with "Mark done / Mark as not done"; progress ring =
-- sum of the done steps' weights (10/14/14/10/10/10/8/10/14 %).
-- src/9A-company-plus.js (setup)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."SetupGuideSteps" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "stepKey"         text NOT NULL,
  "isDone"          boolean NOT NULL DEFAULT false,
  "doneAt"          timestamptz,
  "doneByUserId"  uuid,
  "autoDetected"    boolean NOT NULL DEFAULT false,               -- ticked by the system (e.g. first invoice posted)
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "stepKey"),
  FOREIGN KEY ("tenantId", "doneByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "setupStepStateDoneChk" CHECK ("isDone" = ("doneAt" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Company"."SetupGuideSteps"');
COMMENT ON TABLE "Company"."SetupGuideSteps" IS 'Onboarding checklist state per tenant. Step metadata (title, weight %, minutes, route) is product configuration.';

-- ---------------------------------------------------------------------------
-- DataImports — Data Import wizard (Choose data → Upload file → Map columns →
-- Validate → Import): entity, file (.xlsx/.xls/.csv ≤ 10 MB, rows/columns
-- detected), column mapping with confidence %, "Skip rows with errors",
-- result Created / Updated / Skipped / Speed, job number IMP-2026-0….
-- src/9A-company-plus.js (dataImport), src/4A-company-plus.html (app/import)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."DataImports" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "jobNo"               text NOT NULL,                                 -- IMP-2026-0041
  entity               text NOT NULL,
  "fileAttachmentId"   uuid,
  "fileName"            text NOT NULL,                                 -- customers_alnoor_tally.xlsx
  "fileSizeBytes"      bigint CHECK ("fileSizeBytes" BETWEEN 0 AND 10485760),
  "sourceSystem"        text,
  "totalRows"           integer CHECK ("totalRows" >= 0),
  "columnMap"           jsonb NOT NULL DEFAULT '{}'::jsonb,            -- {"ntn": {"source": "NTN No.", "confidence": 96}}
  "skipErrorRows"      boolean NOT NULL DEFAULT true,
  status               text NOT NULL DEFAULT 'UPLOADED',
  "errorCount"          integer NOT NULL DEFAULT 0 CHECK ("errorCount" >= 0),
  "rowsCreated"         integer NOT NULL DEFAULT 0 CHECK ("rowsCreated" >= 0),
  "rowsUpdated"         integer NOT NULL DEFAULT 0 CHECK ("rowsUpdated" >= 0),
  "rowsSkipped"         integer NOT NULL DEFAULT 0 CHECK ("rowsSkipped" >= 0),
  "startedByUserId"   uuid,
  "startedAt"           timestamptz,
  "finishedAt"          timestamptz,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "jobNo"),
  FOREIGN KEY ("tenantId", "fileAttachmentId") REFERENCES "Company"."Attachments" ("tenantId", id),
  FOREIGN KEY ("tenantId", "startedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "importJobCountsChk" CHECK ("totalRows" IS NULL OR "rowsCreated" + "rowsUpdated" + "rowsSkipped" <= "totalRows"),
  CONSTRAINT "importJobFinishChk" CHECK ("finishedAt" IS NULL OR ("startedAt" IS NOT NULL AND "finishedAt" >= "startedAt")),
  CONSTRAINT "importJobSkipChk" CHECK (status <> 'IMPORTING' OR "skipErrorRows" OR "errorCount" = 0)
);
SELECT "Company"."addStandardTriggers"('"Company"."DataImports"', true);
CREATE INDEX "importJobRecentIdx" ON "Company"."DataImports" ("tenantId", "createdAt" DESC);
COMMENT ON TABLE "Company"."DataImports" IS 'One run of the Data Import wizard. jobNo from Company.getNextDocNo(''IMP''). Imported rows land in the target module tables (Sales.Customers, Purchases.Vendors, Inventory.Products, Accounting.OpeningBalanceLines, HumanResources.Employees, Accounting.ChartOfAccounts).';

-- DataImportErrors — validation grid ("NTN must look like 1234567-8", "Duplicate SKU in file"), inline fix, "Download error rows"
CREATE TABLE "Company"."DataImportErrors" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "jobId"           uuid NOT NULL,
  "rowNo"           integer NOT NULL CHECK ("rowNo" >= 1),          -- spreadsheet row (header = 1)
  "fieldKey"        text,                                          -- ntn / sku / cnic
  "badValue"        text,
  message          text NOT NULL,
  "isFixed"         boolean NOT NULL DEFAULT false,
  "fixedValue"      text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "jobId") REFERENCES "Company"."DataImports" ("tenantId", id),
  CONSTRAINT "importErrorFixedChk" CHECK (NOT "isFixed" OR "fixedValue" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Company"."DataImportErrors"');
CREATE INDEX "importErrorJobIdx" ON "Company"."DataImportErrors" ("tenantId", "jobId", "rowNo");
COMMENT ON TABLE "Company"."DataImportErrors" IS 'Row-level validation errors of an import job; fixed inline or skipped.';

-- ===========================================================================
-- SETTINGS (Full): document templates, integrations, API keys, webhooks, backup
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- DocumentTemplates — Settings › Document Templates (filters All / Finance / Payroll
-- / HR letters; cards Sales Invoice "Standard GST · A4 · Default", Payment
-- Voucher "BPV / CPV", Payslip "Monthly · bilingual", Offer / Experience /
-- Salary Certificate letters v1–v3) and the Editor (Template name, Paper,
-- Header, Language, Show on document checkboxes, merge fields, HTML).
-- src/60-settings-ess.html (app/settings/templates)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."DocumentTemplates" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name                   text NOT NULL,                              -- Sales Invoice — Standard GST
  category               text NOT NULL,
  "docType"               text REFERENCES "Company"."DocumentTypes"(code),        -- INV, BPV, CPV, PS …
  "letterKind"            text,
  paper                  text NOT NULL DEFAULT 'A4_PORTRAIT',
  "headerLayout"          text NOT NULL DEFAULT 'LOGO_LEFT',
  language               text NOT NULL DEFAULT 'EN',
  "showNtnStrn"          boolean NOT NULL DEFAULT true,
  "showFbrQr"            boolean NOT NULL DEFAULT true,
  "showHsCodes"          boolean NOT NULL DEFAULT true,
  "showItemImages"       boolean NOT NULL DEFAULT false,
  "showAmountInWords"   boolean NOT NULL DEFAULT true,
  "showBankDetails"      boolean NOT NULL DEFAULT true,
  "bodyHtml"              text,                                       -- layout with {{customer.name}} {{invoice.number}} {{fbr.irn}} …
  version                integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  "isDefault"             boolean NOT NULL DEFAULT false,
  status                 text NOT NULL DEFAULT 'DRAFT',
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  "deletedAt"             timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", name),
  CONSTRAINT "docTemplateLetterChk" CHECK ((category = 'HR_LETTER') = ("letterKind" IS NOT NULL)),
  CONSTRAINT "docTemplateDefaultActiveChk" CHECK (NOT "isDefault" OR status = 'ACTIVE')
);
SELECT "Company"."addStandardTriggers"('"Company"."DocumentTemplates"', true);
CREATE UNIQUE INDEX "docTemplateOneDefaultIdx" ON "Company"."DocumentTemplates" ("tenantId", category, "docType", "letterKind") NULLS NOT DISTINCT
  WHERE "isDefault" AND "deletedAt" IS NULL;
COMMENT ON TABLE "Company"."DocumentTemplates" IS 'Print/PDF layouts for invoices, vouchers, payslips and HR letters; one default per (category, doc type, letter kind).';

-- ---------------------------------------------------------------------------
-- integration — Settings › Integrations cards (FBR IRIS / POS, HBL / Meezan
-- bank feeds, ZKTeco biometric, Google Workspace SSO, Microsoft 365, WhatsApp
-- Business, SMTP Email, Daraz, Shopify) with status Connected / Not connected /
-- Re-auth needed, "Last sync", Sync now / Reconnect / Send test.
-- Secrets are never stored here: secretRef points into the secrets vault.
-- src/60-settings-ess.html (app/settings/integrations)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."Integrations" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  category              text NOT NULL,
  provider              text NOT NULL,
  "displayName"          text NOT NULL,                              -- "HBL Bank Feed"
  "referenceLabel"       text,                                       -- "A/c 8721", "6 devices", "smtp.alnoor.com.pk:587"
  "bankAccountId"       uuid,                                       -- BANK_FEED → BankCash.BankAccounts (fk file)
  status                text NOT NULL DEFAULT 'NOT_CONNECTED',
  config                jsonb NOT NULL DEFAULT '{}'::jsonb,         -- non-secret settings (domain, SAML, host/port/TLS, from address)
  "secretRef"            text,                                       -- vault key of the token / password
  "tokenExpiresAt"      timestamptz,                                -- "Token expired 29 Sep 2026"
  "connectedAt"          timestamptz,
  "connectedByUserId"  uuid,
  "lastSyncAt"          timestamptz,                                -- "Last sync 08:55 today"
  "lastSyncSummary"     text,                                       -- "42 lines imported yesterday"
  "lastError"            text,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE NULLS NOT DISTINCT ("tenantId", provider, "bankAccountId"),
  FOREIGN KEY ("tenantId", "connectedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "integrationBankChk" CHECK ((provider = 'BANK_FEED') = ("bankAccountId" IS NOT NULL)),
  CONSTRAINT "integrationConnectedChk" CHECK (status <> 'CONNECTED' OR "connectedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Company"."Integrations"', true);
CREATE INDEX "integrationStatusIdx" ON "Company"."Integrations" ("tenantId", category, status);
COMMENT ON TABLE "Company"."Integrations" IS 'Connected third-party services. Credentials live in the vault (secretRef); FBR details are in Tax.FbrSettings, biometric devices in HumanResources.BiometricDevices.';

-- ---------------------------------------------------------------------------
-- api_key — Integrations › "API keys: shown once at creation" (Name, Key
-- fs_live_…9c2a, Scopes, Last used) and "Create API key" modal (Key name,
-- Expires 90 days / 1 year / Never, IP allow-list, Scopes).
-- src/60-settings-ess.html (app/settings/integrations, set-new-key)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."ApiKeys" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name                text NOT NULL,                                -- Power BI connector
  "ownerUserId"       uuid NOT NULL,
  "keyPrefix"          text NOT NULL DEFAULT 'fs_live_',
  "keyLast4"           char(4) NOT NULL,                             -- …9c2a
  "keyHash"            bytea NOT NULL CHECK (octet_length("keyHash") = 32),
  scopes              text[] NOT NULL CHECK (cardinality(scopes) > 0 AND scopes <@ ARRAY['reports:read','accounting:write',
                                             'sales:write','inventory:write','hr:read','payroll:read']),
  "ipAllowlist"        cidr[],
  "expiresAt"          timestamptz,                                  -- NULL = Never
  "lastUsedAt"        timestamptz,
  "lastUsedIp"        inet,
  "revokedAt"          timestamptz,
  "revokedByUserId"  uuid,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("keyHash"),
  UNIQUE ("tenantId", name),
  FOREIGN KEY ("tenantId", "ownerUserId")      REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "revokedByUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Company"."ApiKeys"');
CREATE TRIGGER "coreApiKeyAudit" AFTER INSERT OR UPDATE OR DELETE ON "Company"."ApiKeys"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditRedacted"('keyHash');
COMMENT ON TABLE "Company"."ApiKeys" IS 'Scoped REST API keys. Only the sha-256 of the key is stored; the full key is shown once at creation.';

-- webhook_endpoint — Integrations › "Webhooks: signed with HMAC-SHA256"
-- (Endpoint, Events, Success %, Status Healthy / Failing; "Add endpoint")
CREATE TABLE "Company"."IntegrationWebhooks" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  url                 text NOT NULL CHECK (url ~ '^https://[^\s]+$'),
  events              text[] NOT NULL CHECK (cardinality(events) > 0),   -- invoice.posted, employee.created, payment.received
  "signingSecretEnc"  bytea NOT NULL,
  "isActive"           boolean NOT NULL DEFAULT true,
  "healthStatus"       text NOT NULL DEFAULT 'HEALTHY',
  "successRatePct"    numeric(7,4) CHECK ("successRatePct" BETWEEN 0 AND 100),   -- rolling 7-day, from webhook_delivery
  "lastDeliveryAt"    timestamptz,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", url)
);
SELECT "Company"."addStandardTriggers"('"Company"."IntegrationWebhooks"');
CREATE TRIGGER "coreWebhookEndpointAudit" AFTER INSERT OR UPDATE OR DELETE ON "Company"."IntegrationWebhooks"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAuditRedacted"('signingSecretEnc');
COMMENT ON TABLE "Company"."IntegrationWebhooks" IS 'Outbound webhook subscriptions; payloads are HMAC-SHA256 signed with the endpoint secret.';

-- webhook_delivery — helper: delivery attempts behind the "Success %" column. Append-only.
CREATE TABLE "Company"."IntegrationWebhookDeliveries" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "endpointId"      uuid NOT NULL,
  event            text NOT NULL,
  payload          jsonb NOT NULL,
  attempt          smallint NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 20),
  "responseStatus"  smallint CHECK ("responseStatus" BETWEEN 100 AND 599),
  "isSuccess"       boolean NOT NULL,
  error            text,
  "durationMs"      integer CHECK ("durationMs" >= 0),
  "deliveredAt"     timestamptz NOT NULL DEFAULT now(),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "endpointId") REFERENCES "Company"."IntegrationWebhooks" ("tenantId", id)
);
CREATE TRIGGER "webhookDeliveryAppendOnly" BEFORE UPDATE OR DELETE ON "Company"."IntegrationWebhookDeliveries"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();
CREATE INDEX "webhookDeliveryEndpointIdx" ON "Company"."IntegrationWebhookDeliveries" ("tenantId", "endpointId", "deliveredAt" DESC);
COMMENT ON TABLE "Company"."IntegrationWebhookDeliveries" IS 'Helper: one row per webhook delivery attempt (status code, success, latency).';

-- ---------------------------------------------------------------------------
-- BackupSettings — Backup & Restore › Schedule (Frequency, Time, Keep daily for,
-- Monthly snapshots, Include attachments & receipts, Email Owner on failure,
-- Copy to my Google Drive); KPI "Next scheduled 02 Oct 02:00 · Daily · Asia/Karachi".
-- src/60-settings-ess.html (app/settings/backup)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."BackupSettings" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL UNIQUE REFERENCES "Platform"."Tenants"(id),
  frequency              text NOT NULL DEFAULT 'DAILY',
  "runAt"                 time NOT NULL DEFAULT '02:00',
  timezone               text NOT NULL DEFAULT 'Asia/Karachi',
  "keepDailyDays"        smallint NOT NULL DEFAULT 35 CHECK ("keepDailyDays" IN (14, 35, 90)),
  "keepMonthlyMonths"    smallint NOT NULL DEFAULT 12 CHECK ("keepMonthlyMonths" IN (12, 24)),
  "includeAttachments"    boolean NOT NULL DEFAULT true,
  "emailOwnerOnFailure" boolean NOT NULL DEFAULT true,
  "copyToGoogleDrive"   boolean NOT NULL DEFAULT false,
  "nextRunAt"            timestamptz,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Company"."BackupSettings"', true);
COMMENT ON TABLE "Company"."BackupSettings" IS 'Tenant backup schedule and retention (one row per tenant).';

-- Backups — Backups table (Snapshot, Type Scheduled / Manual / Monthly /
-- Year-end, Started, Size, Status Completed / Partial / Locked) and KPIs (Last
-- backup, Backup size incl. attachments, Retention).
CREATE TABLE "Company"."Backups" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "snapshotCode"         text NOT NULL CHECK ("snapshotCode" ~ '^snap-[0-9]{8}-[a-z0-9-]+$'),   -- snap-20261001-0200
  kind                  text NOT NULL,
  note                  text,                                       -- "Before PR-2026-09 post", "FY 2026-27 opening"
  "startedAt"            timestamptz NOT NULL,
  "finishedAt"           timestamptz,
  "sizeBytes"            bigint CHECK ("sizeBytes" >= 0),
  "attachmentsBytes"     bigint CHECK ("attachmentsBytes" >= 0),
  status                text NOT NULL DEFAULT 'RUNNING',
  "statusNote"           text,                                       -- "Attachments retry OK"
  "isLocked"             boolean NOT NULL DEFAULT false,             -- "Locked": exempt from retention
  "storageRegions"       text[] NOT NULL DEFAULT ARRAY['PK_KARACHI','SG_SINGAPORE'],
  encryption            text NOT NULL DEFAULT 'AES-256',
  "expiresAt"            timestamptz,                                -- retention end (NULL when locked)
  "requestedByUserId"  uuid,                                       -- manual "Back up now"
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "snapshotCode"),
  FOREIGN KEY ("tenantId", "requestedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "backupSnapshotFinishChk" CHECK ("finishedAt" IS NULL OR "finishedAt" >= "startedAt"),
  CONSTRAINT "backupSnapshotDoneChk" CHECK (status = 'RUNNING' OR "finishedAt" IS NOT NULL),
  CONSTRAINT "backupSnapshotLockedChk" CHECK (NOT "isLocked" OR "expiresAt" IS NULL)
);
SELECT "Company"."addStandardTriggers"('"Company"."Backups"');
CREATE INDEX "backupSnapshotRecentIdx" ON "Company"."Backups" ("tenantId", "startedAt" DESC);
COMMENT ON TABLE "Company"."Backups" IS 'Encrypted tenant snapshots (scheduled, manual, monthly, year-end, pre-restore safety copies).';

-- BackupRestoreRequests — "Restore from backup" modal (Snapshot, Reason *, Type
-- ALNOOR to confirm, Take a safety backup of current data first).
CREATE TABLE "Company"."BackupRestoreRequests" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "snapshotId"           uuid NOT NULL,
  reason                text NOT NULL CHECK (char_length(reason) >= 5),
  "confirmText"          text NOT NULL,                              -- must equal the tenant code (checked by the API)
  "takeSafetyBackup"    boolean NOT NULL DEFAULT true,
  "safetySnapshotId"    uuid,
  "requestedByUserId"  uuid NOT NULL,
  "requestedAt"          timestamptz NOT NULL DEFAULT now(),
  "scheduledFor"         timestamptz,
  status                text NOT NULL DEFAULT 'REQUESTED',
  "startedAt"            timestamptz,
  "completedAt"          timestamptz,
  error                 text,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "snapshotId")          REFERENCES "Company"."Backups" ("tenantId", id),
  FOREIGN KEY ("tenantId", "safetySnapshotId")   REFERENCES "Company"."Backups" ("tenantId", id),
  FOREIGN KEY ("tenantId", "requestedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "restoreRequestDoneChk" CHECK (status NOT IN ('COMPLETED','FAILED') OR "completedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Company"."BackupRestoreRequests"', true);
CREATE UNIQUE INDEX "restoreRequestOneOpenIdx" ON "Company"."BackupRestoreRequests" ("tenantId") WHERE status IN ('REQUESTED','SCHEDULED','RUNNING');
COMMENT ON TABLE "Company"."BackupRestoreRequests" IS 'Point-in-time restore requests (destructive: replaces all tenant data; users signed out ~15 min).';

-- ===========================================================================
-- BUSINESS CALCULATOR (optional server sync of the 9K tape)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- CalculatorTapeLines — the calculator tape per day (expression, result, kind:
-- calc / gst / units / total "Σ Total of n lines"; max 200 lines a day). Today
-- it lives in browser storage (cx-tape-YYYY-MM-DD); this table syncs it across
-- devices. Tax Calculator "To tape" adds GST lines.
-- src/9K-calc.js (addTape, S.tape), src/40-acc-core.html (app/today)
-- ---------------------------------------------------------------------------
CREATE TABLE "Company"."CalculatorTapeLines" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "userId"          uuid NOT NULL,
  "tapeDate"        date NOT NULL,
  seq              smallint NOT NULL CHECK (seq BETWEEN 1 AND 200),
  expression       text NOT NULL CHECK (char_length(expression) <= 500),   -- "1,250×12+18%" / "100,000 + Sales Tax (GST) 18%"
  result           numeric(30,8) NOT NULL,
  kind             text NOT NULL DEFAULT 'CALC',
  "enteredAt"       timestamptz NOT NULL DEFAULT now(),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "userId", "tapeDate", seq),
  FOREIGN KEY ("tenantId", "userId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Company"."CalculatorTapeLines"');
COMMENT ON TABLE "Company"."CalculatorTapeLines" IS 'Optional server copy of the business calculator tape (per user per day). GT = sum of result where kind <> TOTAL.';

-- CalculatorSettings — calculator settings (Rounding none/1/5/10, grouping
-- 12,34,567 lakh vs 1,234,567 intl, GST rate, words language EN/اردو, memory M).
CREATE TABLE "Company"."CalculatorSettings" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "userId"          uuid NOT NULL,
  "roundingStep"    smallint NOT NULL DEFAULT 0 CHECK ("roundingStep" IN (0, 1, 5, 10)),
  "numberGrouping"  text NOT NULL DEFAULT 'INTL',
  "gstRatePct"     numeric(7,4) NOT NULL DEFAULT 18 CHECK ("gstRatePct" BETWEEN 0 AND 100),
  language         text NOT NULL DEFAULT 'EN',
  "memoryValue"     numeric(30,8) NOT NULL DEFAULT 0,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "userId"),
  FOREIGN KEY ("tenantId", "userId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Company"."CalculatorSettings"');
COMMENT ON TABLE "Company"."CalculatorSettings" IS 'Business calculator preferences and memory register per user (optional server sync).';
