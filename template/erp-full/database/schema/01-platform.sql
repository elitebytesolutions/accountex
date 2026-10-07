-- =============================================================================
-- Finsoft ERP (FULL) — 01-platform.sql
-- SaaS console tables. GLOBAL: no tenantId, no RLS. Read/written by the
-- platform console (admin/*) and by login/provisioning, which run before a
-- tenant context exists.
--
-- PART A is the erp-basic 01-platform.sql, table for table. Full-only columns
-- and enum values are marked [FULL] (contract §1: added after Basic's business
-- columns, before the standard audit columns). PART B adds the Full-only tables.
--
-- Screens: admin/dashboard, admin/tenants, admin/tenants/new, admin/tenants/view,
--          admin/templates, admin/analytics, admin/leads, admin/partners,
--          admin/plans, admin/subscriptions, admin/invoices, admin/dunning,
--          admin/usage, admin/features, admin/features/view, admin/segments,
--          admin/entitlements, admin/change-requests, admin/support,
--          admin/announcements, admin/comms, admin/system, admin/audit,
--          admin/status, admin/security, admin/integrations, admin/tax-master,
--          admin/staff
-- Sources: src/30-entry-admin.html, src/3A-admin-plus.html + src/9B-admin-plus.js,
--          src/3B-flags.html + src/9J-flags.js, src/48-dash-stock.html (admin/dashboard)
-- =============================================================================

-- #############################################################################
-- PART A — Basic tables (identical to erp-basic, plus [FULL] additions)
-- #############################################################################

-- ---------------------------------------------------------------------------
-- plan — admin/plans ("Plans & Pricing"): Starter / Growth / Business / Enterprise
-- ---------------------------------------------------------------------------
CREATE TABLE "Platform"."SubscriptionPlans" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_]{1,19}$'),   -- STARTER, GROWTH …
  name             text NOT NULL,
  tagline          text,
  "priceMonthly"    numeric(18,2) NOT NULL CHECK ("priceMonthly" >= 0),             -- 9,999 / 24,999 / 49,999 / 180,000
  "priceAnnual"     numeric(18,2) CHECK ("priceAnnual" >= 0),                       -- "Annual (save Rs 49,998)"
  "userSeats"       integer CHECK ("userSeats" > 0),                                -- 5 / 50 / 200 / 1000; NULL = unlimited
  "storageGb"       integer CHECK ("storageGb" > 0),
  "trialDays"       integer NOT NULL DEFAULT 14 CHECK ("trialDays" IN (0, 14, 30)), -- "14-day trial / 30-day trial"
  "sortOrder"       integer NOT NULL DEFAULT 0,
  "isPublic"        boolean NOT NULL DEFAULT true,
  status           text NOT NULL DEFAULT 'ACTIVE',
  -- [FULL] plan-card detail (admin/plans cards, admin/entitlements plan cards, Tenant 360 invite)
  "isCustomPrice"  boolean NOT NULL DEFAULT false,                                -- Enterprise "Custom · from Rs 145,000"
  "supportChannel"  text,  -- "Email support (48h)", "Named account manager"
  "supportResponseHours" integer CHECK ("supportResponseHours" > 0),             -- 48 / 8 / 4
  "slaUptimePct"   numeric(5,2) CHECK ("slaUptimePct" BETWEEN 90 AND 100),       -- "99.95% SLA"
  "extraSeatPrice" numeric(18,2) CHECK ("extraSeatPrice" >= 0),                  -- "will bill 1 extra seat at Rs 499/mo"
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0
);
SELECT "Company"."addStandardTriggers"('"Platform"."SubscriptionPlans"');

-- SubscriptionPlanFeatures — the plan × module matrix on admin/plans
-- ("Accounting, Sales & AR, … Payroll: Add-on · Rs 2,500/mo")
CREATE TABLE "Platform"."SubscriptionPlanFeatures" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "planId"          uuid NOT NULL REFERENCES "Platform"."SubscriptionPlans"(id),
  "moduleKey"       text NOT NULL,
  inclusion        text NOT NULL,
  "addonPrice"      numeric(18,2) CHECK ("addonPrice" >= 0),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("planId", "moduleKey"),
  CONSTRAINT "planFeatureAddonPriceChk" CHECK (inclusion <> 'ADDON' OR "addonPrice" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Platform"."SubscriptionPlanFeatures"');

-- ---------------------------------------------------------------------------
-- ChartOfAccountsTemplates — admin/templates; chosen in Onboard step 4
-- ("Trading & Distribution (PK) — 214 accounts", v2026.2)
-- ---------------------------------------------------------------------------
CREATE TABLE "Platform"."ChartOfAccountsTemplates" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,
  name             text NOT NULL,
  industry         text,
  version          text NOT NULL,                                   -- v2026.2
  status           text NOT NULL DEFAULT 'DRAFT',
  -- [FULL] template card text (admin/templates)
  description      text,                                            -- "Inventory-led COA with GST input/output, further tax 4% …"
  icon             text,                                            -- store / briefcase / factory / heart-handshake
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0
);
SELECT "Company"."addStandardTriggers"('"Platform"."ChartOfAccountsTemplates"');

CREATE TABLE "Platform"."ChartOfAccountsTemplateAccounts" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "templateId"      uuid NOT NULL REFERENCES "Platform"."ChartOfAccountsTemplates"(id),
  code             text NOT NULL,                                   -- 1000 / 1100 / 1120 / 1120-01
  name             text NOT NULL,
  "parentCode"      text,
  level            smallint NOT NULL CHECK (level BETWEEN 1 AND 4),
  "accountClass"    smallint NOT NULL CHECK ("accountClass" BETWEEN 1 AND 5),  -- 1 Assets … 5 Expenses
  nature           char(2) NOT NULL,
  "subType"         text,
  "isPostable"      boolean NOT NULL DEFAULT false,
  "defaultRole"     text,               -- maps to Company.DefaultAccountMappings.role (AR_CONTROL, OUTPUT_GST …)
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("templateId", code)
);
SELECT "Company"."addStandardTriggers"('"Platform"."ChartOfAccountsTemplateAccounts"');

-- ---------------------------------------------------------------------------
-- tenant — the root of tenancy. admin/tenants, Onboard Tenant steps 1 & 4,
-- Tenant 360. Every tenant-owned table references this.
-- [FULL] also the targeting subject of Feature Management (9J-flags.js ATTRS):
--   plan → subscription.planId, region → province, city, industry,
--   age → current_date - activatedAt, app version, platforms, beta, internal,
--   sales-tax registered (STRN on file).
-- ---------------------------------------------------------------------------
CREATE TABLE "Platform"."Tenants" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                citext NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z][A-Za-z0-9]{3,9}$'),  -- ALNOOR
  subdomain           citext NOT NULL UNIQUE,                       -- alnoor  (alnoor.finsoft.pk)
  "displayName"        text NOT NULL,                                -- Al-Noor Enterprises
  "legalName"          text NOT NULL,                                -- Al-Noor Enterprises (Pvt) Ltd
  ntn                 text,                                         -- 4271839-6
  strn                text,                                         -- 32-77-8761-234-55
  "secpRegNo"         text,
  industry            text,          -- [FULL] FMCG, RETAIL (9J-flags.js INDUSTRIES)
  country             char(2) NOT NULL DEFAULT 'PK',
  city                text,
  province            text,
  address             text,
  phone               text,
  email               citext,
  -- configuration (Onboard step 4)
  "fiscalYearStartMonth" smallint NOT NULL DEFAULT 7 CHECK ("fiscalYearStartMonth" IN (1, 4, 7)),
  "baseCurrency"       char(3) NOT NULL DEFAULT 'PKR',
  timezone            text NOT NULL DEFAULT 'Asia/Karachi',
  "numberFormat"       text NOT NULL DEFAULT 'SOUTH_ASIAN',
  "dateFormat"         text NOT NULL DEFAULT 'DD MMM YYYY',
  "dataResidency"      text NOT NULL DEFAULT 'PK_LAHORE',
  "coaTemplateId"     uuid REFERENCES "Platform"."ChartOfAccountsTemplates"(id),
  "requireMfa"         boolean NOT NULL DEFAULT false,
  "allowSso"           boolean NOT NULL DEFAULT false,
  "defaultLanguage"    text NOT NULL DEFAULT 'EN',
  -- lifecycle & health (admin/tenants list, Tenant 360)
  status              text NOT NULL DEFAULT 'PROVISIONING',
  "healthScore"        smallint CHECK ("healthScore" BETWEEN 0 AND 100),
  "trialEndsOn"       date,
  "activatedAt"        timestamptz,
  "lastActiveAt"      timestamptz,
  "accountOwnerStaffId" uuid,                                      -- platform staff managing the account (FK added below)
  -- [FULL] Feature Management targeting attributes (admin/features rules, admin/segments)
  "appVersion"         text CHECK ("appVersion" ~ '^\d+\.\d+\.\d+$'),                  -- 4.12.1 (last client seen)
  platforms           text[] NOT NULL DEFAULT '{WEB}'
                        CHECK (platforms <@ ARRAY['WEB','ANDROID','IOS','DESKTOP']::text[]),
  "isBeta"             boolean NOT NULL DEFAULT false,                                 -- "Beta opt-in" (tenant Settings)
  "isInternal"         boolean NOT NULL DEFAULT false,                                 -- FSQA / FSDEMO / FSSTAFF
  "salesTaxRegistered" boolean GENERATED ALWAYS AS (strn IS NOT NULL) STORED,         -- "Tenants with an STRN on file"
  -- [FULL] health breakdown + suspension/churn detail (Tenant 360, admin/analytics churn reasons)
  "healthFactors"      jsonb,             -- [{"factor":"LOGINS","score":88,"detail":"…"} …] six weighted signals, updated hourly
  "healthUpdatedAt"   timestamptz,
  "suspendedAt"        timestamptz,
  "suspensionReason"   text,              -- "non-payment (45 days)"
  "churnedAt"          timestamptz,
  "churnReason"        text,     -- "Why tenants churn" exit survey
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0
);
SELECT "Company"."addStandardTriggers"('"Platform"."Tenants"');
CREATE INDEX "tenantStatusIdx" ON "Platform"."Tenants" (status);
CREATE INDEX "tenantNameTrgmIdx" ON "Platform"."Tenants" USING gin ("displayName" gin_trgm_ops);
-- [FULL] list filters on admin/tenants (region/city) and targeting lookups
CREATE INDEX "tenantProvinceCityIdx" ON "Platform"."Tenants" (province, city);
CREATE INDEX "tenantChurnedAtIdx" ON "Platform"."Tenants" ("churnedAt") WHERE "churnedAt" IS NOT NULL;

-- TenantContacts — Onboard step 3 "First administrator" + other named contacts
CREATE TABLE "Platform"."TenantContacts" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "contactRole"     text NOT NULL DEFAULT 'OWNER',
  "fullName"        text NOT NULL,
  designation      text,
  email            citext NOT NULL,
  mobile           text,
  cnic             text CHECK (cnic IS NULL OR cnic ~ '^\d{5}-\d{7}-\d$'),
  language         text NOT NULL DEFAULT 'EN',
  "isPrimary"       boolean NOT NULL DEFAULT false,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0
);
SELECT "Company"."addStandardTriggers"('"Platform"."TenantContacts"');
CREATE UNIQUE INDEX "tenantContactOnePrimaryOwner" ON "Platform"."TenantContacts" ("tenantId")
  WHERE "contactRole" = 'OWNER' AND "isPrimary";

-- TenantModules — modules switched on for a tenant (Onboard step 2, Tenant 360)
CREATE TABLE "Platform"."TenantModules" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "moduleKey"       text NOT NULL,
  enabled          boolean NOT NULL DEFAULT true,
  source           text NOT NULL DEFAULT 'PLAN',
  "enabledAt"       timestamptz NOT NULL DEFAULT now(),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", "moduleKey")
);
SELECT "Company"."addStandardTriggers"('"Platform"."TenantModules"');

-- ---------------------------------------------------------------------------
-- subscription — admin/subscriptions; Onboard step 2 (plan, cycle, trial)
-- ---------------------------------------------------------------------------
CREATE TABLE "Platform"."Subscriptions" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "planId"          uuid NOT NULL REFERENCES "Platform"."SubscriptionPlans"(id),
  "billingCycle"    text NOT NULL,
  amount           numeric(18,2) NOT NULL CHECK (amount >= 0),       -- Rs 249,990 / year
  seats            integer CHECK (seats > 0),
  "startsOn"        date NOT NULL,
  "trialEndsOn"    date,
  "currentPeriodStart" date NOT NULL,
  "currentPeriodEnd"   date NOT NULL,
  "nextRenewalOn"  date,
  "paymentMethod"   text,
  "paymentRef"      text,                                             -- masked display: 'Visa •••• 9012', 'Meezan direct debit', 'Bank transfer · HBL'; NULL = 'Pending setup'
  "autoRenew"       boolean NOT NULL DEFAULT true,
  status           text NOT NULL DEFAULT 'ACTIVE',
  "cancelledAt"     timestamptz,
  "cancelReason"    text,
  -- [FULL] cancel at period end (subscription drawer "Cancel") and normalised MRR for SaaS analytics
  "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false,
  "mrrAmount"       numeric(18,2) GENERATED ALWAYS AS
                     (CASE WHEN "billingCycle" = 'ANNUAL' THEN round(amount / 12, 2) ELSE amount END) STORED,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "subscriptionPeriodChk" CHECK ("currentPeriodEnd" >= "currentPeriodStart")
);
SELECT "Company"."addStandardTriggers"('"Platform"."Subscriptions"', true);
-- one live subscription per tenant
CREATE UNIQUE INDEX "subscriptionOneLivePerTenant" ON "Platform"."Subscriptions" ("tenantId")
  WHERE status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED');
-- [FULL] "Run renewals" / "Renewals in 30 days" and plan filter
CREATE INDEX "subscriptionNextRenewalIdx" ON "Platform"."Subscriptions" ("nextRenewalOn") WHERE status IN ('ACTIVE','PAST_DUE');
CREATE INDEX "subscriptionPlanStatusIdx" ON "Platform"."Subscriptions" ("planId", status);

-- ---------------------------------------------------------------------------
-- PlatformStaff — admin/staff ("Platform Team"). Finsoft's own employees.
-- ---------------------------------------------------------------------------
CREATE TABLE "Platform"."PlatformStaff" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            citext NOT NULL UNIQUE,
  "fullName"        text NOT NULL,
  role             text NOT NULL,
  "passwordHash"    text,
  "mfaType"         text,
  "tenantScope"     text NOT NULL DEFAULT 'ALL',   -- [FULL] "By region"
  status           text NOT NULL DEFAULT 'INVITED',
  "lastActiveAt"   timestamptz,
  -- [FULL] staff drawer (admin/staff): region scope, IP restriction, enrolment dates
  "scopeRegions"    text[] CHECK ("scopeRegions" <@ ARRAY['PUNJAB','SINDH','KPK','ICT','BALOCHISTAN','GB','AJK']::text[]),
  "ipRestricted"    boolean NOT NULL DEFAULT true,                   -- "Restrict to office IP allow-list"
  "mfaRequired"     boolean NOT NULL DEFAULT true,                   -- "Require 2FA (hardware key or authenticator)"
  "mfaEnrolledAt"  timestamptz,
  "invitedAt"       timestamptz,
  "removedAt"       timestamptz,                                     -- "Remove" revokes access; history stays
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "staffUserActiveNeedsPasswordChk" CHECK (status <> 'ACTIVE' OR "passwordHash" IS NOT NULL),
  -- [FULL]
  CONSTRAINT "staffUserRegionScopeChk" CHECK ("tenantScope" <> 'REGION' OR COALESCE(cardinality("scopeRegions"), 0) > 0)
);
SELECT "Company"."addStandardTriggers"('"Platform"."PlatformStaff"');

ALTER TABLE "Platform"."Tenants"
  ADD CONSTRAINT "tenantAccountOwnerFk" FOREIGN KEY ("accountOwnerStaffId") REFERENCES "Platform"."PlatformStaff"(id);

-- ---------------------------------------------------------------------------
-- audit_log — admin/audit ("Platform Audit Log"). Append-only.
-- ---------------------------------------------------------------------------
CREATE TABLE "Platform"."PlatformAuditLogs" (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "occurredAt"      timestamptz NOT NULL DEFAULT now(),
  "staffUserId"    uuid REFERENCES "Platform"."PlatformStaff"(id),
  "actorLabel"      text NOT NULL,                       -- "Saim Javed" / "system"
  action           text NOT NULL,                       -- tenant.suspend, plan.update, impersonate.start …
  "tenantId"        uuid REFERENCES "Platform"."Tenants"(id),
  details          text,
  payload          jsonb,
  "ipAddress"       inet,
  result           text NOT NULL DEFAULT 'SUCCESS',
  -- [FULL] chip filters (Impersonation / Billing / Security), actor sub-label, tamper-evidence hash
  category         text,
  "actorDetail"     text,                                -- "Super Admin" / "billing-worker" / "backup-agent"
  "eventHash"       text                                 -- sha256 of this row + previous hash ("hash": "9f2c…e71a")
);
CREATE INDEX "platformAuditLogTimeIdx"   ON "Platform"."PlatformAuditLogs" ("occurredAt" DESC);
CREATE INDEX "platformAuditLogTenantIdx" ON "Platform"."PlatformAuditLogs" ("tenantId", "occurredAt" DESC);
CREATE TRIGGER "platformAuditLogAppendOnly" BEFORE UPDATE OR DELETE ON "Platform"."PlatformAuditLogs"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();
-- [FULL]
CREATE INDEX "platformAuditLogCategoryIdx" ON "Platform"."PlatformAuditLogs" (category, "occurredAt" DESC);
CREATE INDEX "platformAuditLogActorIdx"    ON "Platform"."PlatformAuditLogs" ("staffUserId", "occurredAt" DESC);

-- #############################################################################
-- PART B — Full-only tables
-- #############################################################################

-- =============================================================================
-- B1. Platform document numbering (FS-INV, TCK, INC, PRV, CR)
-- Company.getNextDocNo needs a tenant context; platform documents are global, so
-- they have their own row-locked counter. Helper table (not in contract §5).
-- =============================================================================

-- PlatformDocumentCounters — numbers FS-INV-2026-01842 (admin/invoices), TCK-2304 (admin/support),
-- INC-2026-018 (admin/status), PRV-2026-029 (admin/security), CR-1042 (admin/change-requests)
CREATE TABLE "Platform"."PlatformDocumentCounters" (
  "docType"         text NOT NULL,
  "periodKey"       text NOT NULL,                                   -- '2026' for yearly series, 'ALL' for running series
  "nextValue"       bigint NOT NULL DEFAULT 1 CHECK ("nextValue" > 0),
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("docType", "periodKey")
);
COMMENT ON TABLE "Platform"."PlatformDocumentCounters" IS 'Row-locked counters for global platform documents (FS-INV, TCK, INC, PRV, CR). Use Platform.getNextPlatformDocumentNo(); never MAX+1.';

CREATE OR REPLACE FUNCTION "Platform"."getNextPlatformDocumentNo"("pDocType" text, "pDate" date DEFAULT current_date)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  "vPeriod" text := CASE WHEN "pDocType" IN ('FS-INV','INC','PRV') THEN to_char("pDate", 'YYYY') ELSE 'ALL' END;
  "vValue"  bigint;
BEGIN
  INSERT INTO "Platform"."PlatformDocumentCounters" ("docType", "periodKey", "nextValue")
  VALUES ("pDocType", "vPeriod", 1)
  ON CONFLICT ("docType", "periodKey") DO NOTHING;

  UPDATE "Platform"."PlatformDocumentCounters" c
     SET "nextValue" = c."nextValue" + 1, "updatedAt" = now()
   WHERE c."docType" = "pDocType" AND c."periodKey" = "vPeriod"
  RETURNING c."nextValue" - 1 INTO "vValue";

  RETURN CASE "pDocType"
           WHEN 'FS-INV' THEN 'FS-INV-' || "vPeriod" || '-' || lpad("vValue"::text, 5, '0')   -- FS-INV-2026-01842
           WHEN 'INC'    THEN 'INC-'    || "vPeriod" || '-' || lpad("vValue"::text, 3, '0')   -- INC-2026-018
           WHEN 'PRV'    THEN 'PRV-'    || "vPeriod" || '-' || lpad("vValue"::text, 3, '0')   -- PRV-2026-029
           WHEN 'TCK'    THEN 'TCK-'    || lpad("vValue"::text, 4, '0')                      -- TCK-2304
           ELSE               'CR-'     || "vValue"::text                                    -- CR-1042
         END;
END $$;
COMMENT ON FUNCTION "Platform"."getNextPlatformDocumentNo"(text, date) IS
  'Next number for a platform document type (FS-INV/INC/PRV reset yearly; TCK/CR run on). Row-locked.';

-- =============================================================================
-- B2. Staff, roles and console security — admin/staff, admin/security, admin/audit
-- =============================================================================

-- PlatformStaffRoles — admin/staff "Role permissions" matrix columns
-- (Super Admin · Support Lead · Support Agent · Billing · Engineer)
CREATE TABLE "Platform"."PlatformStaffRoles" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,
  name             text NOT NULL,
  description      text,
  "isLocked"        boolean NOT NULL DEFAULT false,                  -- "Super Admin is locked": always every permission
  "sortOrder"       smallint NOT NULL DEFAULT 0,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0
);
SELECT "Company"."addStandardTriggers"('"Platform"."PlatformStaffRoles"', true);
COMMENT ON TABLE "Platform"."PlatformStaffRoles" IS 'Platform console roles. PlatformStaff.role holds the same code (join on code).';

-- PlatformStaffRolePermissions — one cell of the role matrix (admin/staff). Saving writes
-- the platform audit log ("Role matrix saved · logged as AUD-PLT-8812").
CREATE TABLE "Platform"."PlatformStaffRolePermissions" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "staffRoleId"    uuid NOT NULL REFERENCES "Platform"."PlatformStaffRoles"(id),
  "permissionKey"   text NOT NULL,
  "permissionGroup" text NOT NULL,
  "isGranted"       boolean NOT NULL DEFAULT false,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("staffRoleId", "permissionKey")
);
SELECT "Company"."addStandardTriggers"('"Platform"."PlatformStaffRolePermissions"', true);
COMMENT ON TABLE "Platform"."PlatformStaffRolePermissions" IS 'Role × permission matrix (14 console permissions). Locked roles cannot lose a permission.';

-- PlatformStaffTenantScopes — helper (not in §5): "Specific tenants" scope picked in the staff drawer
CREATE TABLE "Platform"."PlatformStaffTenantScopes" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "staffUserId"    uuid NOT NULL REFERENCES "Platform"."PlatformStaff"(id),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("staffUserId", "tenantId")
);
SELECT "Company"."addStandardTriggers"('"Platform"."PlatformStaffTenantScopes"');
CREATE INDEX "staffTenantScopeTenantIdx" ON "Platform"."PlatformStaffTenantScopes" ("tenantId");
COMMENT ON TABLE "Platform"."PlatformStaffTenantScopes" IS 'Hand-picked tenants for PlatformStaff.tenantScope = ASSIGNED.';

-- PlatformStaffSessions — admin/security "Admin sessions" (Staff, Device, IP, Location, Started, Last seen, Revoke)
CREATE TABLE "Platform"."PlatformStaffSessions" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "staffUserId"    uuid NOT NULL REFERENCES "Platform"."PlatformStaff"(id),
  "deviceLabel"     text NOT NULL,                                   -- "Edge 129 · Windows 11"
  "userAgent"       text,
  "ipAddress"       inet NOT NULL,
  location         text,                                            -- "Lahore, PK" / "VPN · Islamabad"
  "authMethod"      text NOT NULL DEFAULT 'SSO_SAML',
  "mfaMethod"       text,
  "startedAt"       timestamptz NOT NULL DEFAULT now(),
  "lastSeenAt"     timestamptz NOT NULL DEFAULT now(),
  "revokedAt"       timestamptz,
  "revokedByStaffId" uuid REFERENCES "Platform"."PlatformStaff"(id),
  "revokeReason"    text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "staffSessionSeenChk" CHECK ("lastSeenAt" >= "startedAt")
);
SELECT "Company"."addStandardTriggers"('"Platform"."PlatformStaffSessions"');
CREATE INDEX "staffSessionLiveIdx" ON "Platform"."PlatformStaffSessions" ("staffUserId", "lastSeenAt" DESC) WHERE "revokedAt" IS NULL;
COMMENT ON TABLE "Platform"."PlatformStaffSessions" IS 'Signed-in console sessions. "Revoke all others" sets revokedAt on every live row but the caller''s.';

-- PlatformSecuritySettings — admin/security singleton: SSO (SAML/Okta or Google Workspace),
-- two-factor enforcement, IP allow-list switch, password policy
CREATE TABLE "Platform"."PlatformSecuritySettings" (
  id               smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  "ssoProvider"     text NOT NULL DEFAULT 'SAML',
  "samlIdpSsoUrl" text,                                            -- https://finsoft.okta.com/app/finsoft_console/sso/saml
  "samlIdpEntityId" text,
  "samlNameIdFormat" text NOT NULL DEFAULT 'EMAIL',
  "samlCertFilename" text,                                          -- okta-finsoft-console.pem
  "samlCertPem"    text,
  "samlCertExpiresOn" date,
  "samlAcsUrl"     text,                                            -- https://console.finsoft.pk/sso/acs
  "googleDomain"    text,                                            -- finsoft.pk
  "googleClientId" text,
  "googleAllowedGroups" text,                                       -- platform-team@finsoft.pk
  "requireSso"      boolean NOT NULL DEFAULT true,
  "breakGlassSuperAdmin" boolean NOT NULL DEFAULT true,            -- "Break-glass password login for Super Admin only"
  "mfaEnforcement"  text NOT NULL DEFAULT 'EVERYONE',
  "mfaAllowWebauthn" boolean NOT NULL DEFAULT true,
  "mfaAllowTotp"   boolean NOT NULL DEFAULT true,
  "mfaAllowSms"    boolean NOT NULL DEFAULT false,                  -- "SIM-swap risk"
  "ipAllowlistEnforced" boolean NOT NULL DEFAULT true,
  "pwMinLength"    smallint NOT NULL DEFAULT 12 CHECK ("pwMinLength" BETWEEN 8 AND 24),
  "pwRequireMixedCase" boolean NOT NULL DEFAULT true,
  "pwRequireNumber" boolean NOT NULL DEFAULT true,
  "pwRequireSymbol" boolean NOT NULL DEFAULT true,
  "pwBlockBreached" boolean NOT NULL DEFAULT true,                  -- HIBP
  "pwBlockReuse"   boolean NOT NULL DEFAULT false,                  -- "Block last 5 passwords"
  "pwRotationDays" integer CHECK ("pwRotationDays" IN (90, 180)),   -- NULL = never (NIST)
  "lockoutAttempts" smallint NOT NULL DEFAULT 5 CHECK ("lockoutAttempts" IN (3, 5, 10)),
  "lockoutMinutes"  integer NOT NULL DEFAULT 15 CHECK ("lockoutMinutes" IN (15, 30, 60)),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "securitySettingMfaMethodChk" CHECK ("mfaAllowWebauthn" OR "mfaAllowTotp" OR "mfaAllowSms"),
  CONSTRAINT "securitySettingSamlChk" CHECK ("ssoProvider" <> 'SAML' OR ("samlIdpSsoUrl" IS NOT NULL AND "samlIdpEntityId" IS NOT NULL)),
  CONSTRAINT "securitySettingGoogleChk" CHECK ("ssoProvider" <> 'GOOGLE' OR ("googleDomain" IS NOT NULL AND "googleClientId" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Platform"."PlatformSecuritySettings"', true);
COMMENT ON TABLE "Platform"."PlatformSecuritySettings" IS 'Singleton (id = 1) console security policy. "Save policies" is logged (AUD-PLT-8820).';

-- ipAllowlist — admin/security "IP allow-list" chips (CIDR + label)
CREATE TABLE "Platform"."PlatformAllowedIps" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidr             cidr NOT NULL UNIQUE,                            -- 203.99.180.0/24
  label            text NOT NULL DEFAULT 'Custom range',            -- "Lahore office"
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "ipAllowlistIpv4Chk" CHECK (family(cidr) = 4)
);
SELECT "Company"."addStandardTriggers"('"Platform"."PlatformAllowedIps"', true);
COMMENT ON TABLE "Platform"."PlatformAllowedIps" IS 'Console network allow-list. The app keeps at least one active range while PlatformSecuritySettings.ipAllowlistEnforced.';

-- AuditAlertRules — helper (not in §5): admin/audit "Alert rules" drawer
-- ("3 failed MFA attempts → Email + Slack · Super Admins", "Impersonation started → Slack #support-audit")
CREATE TABLE "Platform"."AuditAlertRules" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  "actionPattern"   text NOT NULL,                                   -- 'auth.login', 'impersonation.start', 'invoice.void'
  "resultFilter"    text,
  "thresholdCount"  smallint NOT NULL DEFAULT 1 CHECK ("thresholdCount" > 0),
  "windowMinutes"   integer CHECK ("windowMinutes" > 0),
  channels         text[] NOT NULL CHECK (cardinality(channels) > 0 AND channels <@ ARRAY['EMAIL','SLACK']::text[]),
  recipients       text NOT NULL,                                   -- 'Super Admins', '#support-audit', 'Billing lead'
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0
);
SELECT "Company"."addStandardTriggers"('"Platform"."AuditAlertRules"');
COMMENT ON TABLE "Platform"."AuditAlertRules" IS 'Notify the security channel when matching Platform.PlatformAuditLogs events occur ("Alert on this").';

-- =============================================================================
-- B3. Tax master and master seeds — admin/tax-master, admin/templates
-- =============================================================================

-- TaxMasterAuthorities — admin/tax-master tiles + "FBR / PRAL connection" tab
-- (FBR federal GST, PRA Punjab, SRB Sindh, KPRA KP, BRA Balochistan)
CREATE TABLE "Platform"."TaxMasterAuthorities" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,
  name             text NOT NULL,
  jurisdiction     text NOT NULL,
  "levyScope"       text NOT NULL,
  -- e-invoicing connection (FBR DI / PRA e-invoicing endpoints)
  "sandboxEndpoint" text,                                            -- https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb
  "productionEndpoint" text,                                         -- https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata
  "activeEnvironment" text NOT NULL DEFAULT 'SANDBOX',
  "apiTokenEnc"    bytea,                                           -- pgp_sym_encrypt; revealing is logged
  "apiTokenLast4"  text,
  "platformPosId"  text,                                            -- 182044
  "timeoutSeconds"  smallint NOT NULL DEFAULT 20 CHECK ("timeoutSeconds" IN (10, 20, 30)),
  "onFailure"       text NOT NULL DEFAULT 'RETRY_5_MIN',
  "lastTestAt"     timestamptz,
  "lastTestOk"     boolean,
  "lastTestMs"     integer CHECK ("lastTestMs" >= 0),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0
);
SELECT "Company"."addStandardTriggers"('"Platform"."TaxMasterAuthorities"', true);
COMMENT ON TABLE "Platform"."TaxMasterAuthorities" IS 'Federal and provincial tax authorities and their e-invoicing gateway settings (sandbox/production switch).';

-- TaxMasterSalesTaxRates — admin/tax-master "Sales tax rates" tab. A future-dated row
-- is a scheduled change ("→ 17% from 01 Jan 2027"); ranges never overlap.
CREATE TABLE "Platform"."TaxMasterSalesTaxRates" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "taxAuthorityId" uuid NOT NULL REFERENCES "Platform"."TaxMasterAuthorities"(id),
  "appliesTo"       text NOT NULL,                                   -- "Supply of goods · Sales Tax Act 1990"
  rate             numeric(7,4) NOT NULL CHECK (rate BETWEEN 0 AND 100),
  "reducedRatesNote" text,                                          -- "0% Fifth Sch. · exempt Sixth Sch."
  "effectiveFrom"   date NOT NULL,
  "effectiveTo"     date,
  "legalReference"  text,                                            -- "SRO 1250(I)/2026", "Finance Act 2026"
  status           text NOT NULL DEFAULT 'ACTIVE',
  "masterVersion"   text,                                            -- v2026.10 when published to tenants
  "publishedAt"     timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "taxMasterSalesTaxDatesChk" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "taxMasterSalesTaxNoOverlap" EXCLUDE USING gist
    ("taxAuthorityId" WITH =, "appliesTo" WITH =, daterange("effectiveFrom", "effectiveTo", '[]') WITH &&)
);
SELECT "Company"."addStandardTriggers"('"Platform"."TaxMasterSalesTaxRates"', true);
COMMENT ON TABLE "Platform"."TaxMasterSalesTaxRates" IS 'Platform sales tax master (federal goods, provincial services). Tenants inherit unless they override; "Publish to tenants" pushes a masterVersion.';

-- TaxMasterWithholdingRates — admin/tax-master "Withholding" tab (ITO 2001 sections, ATL / non-ATL)
CREATE TABLE "Platform"."TaxMasterWithholdingRates" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sectionCode"     text NOT NULL,                                   -- 153(1)(a), 149, 236G, 236H
  nature           text NOT NULL,                                   -- "Sale of goods"
  "atlRateCompany" numeric(7,4) CHECK ("atlRateCompany" BETWEEN 0 AND 100),        -- 5.0
  "atlRateOther"   numeric(7,4) CHECK ("atlRateOther" BETWEEN 0 AND 100),          -- 5.5
  "nonAtlRateCompany" numeric(7,4) CHECK ("nonAtlRateCompany" BETWEEN 0 AND 100),-- 10.0
  "nonAtlRateOther" numeric(7,4) CHECK ("nonAtlRateOther" BETWEEN 0 AND 100),    -- 11.0
  "rateNote"        text,                                            -- "0.1% (fertiliser 0.25%)", "Slabs · 0% to 35%"
  "thresholdAmount" numeric(18,2) CHECK ("thresholdAmount" >= 0),     -- 75,000
  "thresholdNote"   text,                                            -- "/ year per supplier"
  "usesSalarySlabs" boolean NOT NULL DEFAULT false,                 -- section 149 → TaxMasterSalarySlabs
  "effectiveFrom"   date NOT NULL,
  "effectiveTo"     date,
  "legalReference"  text,
  status           text NOT NULL DEFAULT 'ACTIVE',
  "masterVersion"   text,
  "publishedAt"     timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "taxMasterWhtDatesChk" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "taxMasterWhtRateChk" CHECK ("usesSalarySlabs" OR "atlRateCompany" IS NOT NULL OR "atlRateOther" IS NOT NULL),
  CONSTRAINT "taxMasterWhtNoOverlap" EXCLUDE USING gist
    ("sectionCode" WITH =, daterange("effectiveFrom", "effectiveTo", '[]') WITH &&)
);
SELECT "Company"."addStandardTriggers"('"Platform"."TaxMasterWithholdingRates"', true);
COMMENT ON TABLE "Platform"."TaxMasterWithholdingRates" IS 'Withholding sections with ATL / non-ATL rates for companies and others. Rate edits need a Finance Act or SRO reference.';

-- TaxMasterSalarySlabs — admin/tax-master "Section 149 · salary slabs" drawer
-- ("1,200,001 – 2,200,000 → Rs 6,000 + 11% over 1.2M")
CREATE TABLE "Platform"."TaxMasterSalarySlabs" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "taxYear"         smallint NOT NULL CHECK ("taxYear" BETWEEN 2000 AND 2100),   -- 2027 = FY 2026-27
  "slabNo"          smallint NOT NULL CHECK ("slabNo" > 0),
  "incomeFrom"      numeric(18,2) NOT NULL CHECK ("incomeFrom" >= 0),
  "incomeTo"        numeric(18,2),                                   -- NULL = "Above 4,100,000"
  "fixedTax"        numeric(18,2) NOT NULL DEFAULT 0 CHECK ("fixedTax" >= 0),
  "ratePct"         numeric(7,4) NOT NULL DEFAULT 0 CHECK ("ratePct" BETWEEN 0 AND 100),
  "excessOver"      numeric(18,2) NOT NULL DEFAULT 0 CHECK ("excessOver" >= 0),
  "legalReference"  text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("taxYear", "slabNo"),
  CONSTRAINT "taxMasterSalarySlabRangeChk" CHECK ("incomeTo" IS NULL OR "incomeTo" > "incomeFrom")
);
SELECT "Company"."addStandardTriggers"('"Platform"."TaxMasterSalarySlabs"', true);
COMMENT ON TABLE "Platform"."TaxMasterSalarySlabs" IS 'Resident-individual salary slabs u/s 149 per tax year: tax = fixedTax + ratePct% × (income − excessOver). Seeds Payroll.SalaryTaxSlabs.';

-- TemplateTaxCodes — admin/templates "Master seed lists · Tax codes" (GST-18, FT-4, WHT-153A …);
-- copied into Tax.TaxCodes at provisioning when "Seed Pakistani tax codes" is ticked
CREATE TABLE "Platform"."TemplateTaxCodes" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "seedVersion"     text NOT NULL,                                   -- v2026.2
  code             text NOT NULL,                                   -- GST-18
  description      text NOT NULL,                                   -- "Sales tax standard rate"
  "taxKind"         text NOT NULL,
  rate             numeric(7,4) CHECK (rate BETWEEN 0 AND 100),     -- NULL for exempt
  "rateNote"        text,                                            -- "0.5–1%"
  "whtSection"      text,                                            -- 153(1)(a)
  "sortOrder"       smallint NOT NULL DEFAULT 0,
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("seedVersion", code),
  CONSTRAINT "seedTaxCodeRateChk" CHECK ("taxKind" = 'EXEMPT' OR rate IS NOT NULL OR "rateNote" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Platform"."TemplateTaxCodes"');
COMMENT ON TABLE "Platform"."TemplateTaxCodes" IS 'Pakistan tax-code seed list copied into Tax.TaxCodes for new tenants.';

-- TemplateLeaveTypes — admin/templates "Leave types" tab (Annual 20 d, accrual 1.66/month, carry fwd 10 …)
CREATE TABLE "Platform"."TemplateLeaveTypes" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "seedVersion"     text NOT NULL,
  name             text NOT NULL,                                   -- Annual Leave
  "daysPerYear"    numeric(5,1) NOT NULL CHECK ("daysPerYear" >= 0),
  "accrualPerMonth" numeric(6,3) CHECK ("accrualPerMonth" >= 0),    -- 1.66
  "carryForwardMax" numeric(5,1) CHECK ("carryForwardMax" >= 0),    -- 10
  "isPaid"          boolean NOT NULL DEFAULT true,
  "genderRestriction" text NOT NULL DEFAULT 'ANY',
  "onceInService"  boolean NOT NULL DEFAULT false,                  -- Hajj leave
  "medicalCertAfterDays" smallint CHECK ("medicalCertAfterDays" > 0),
  "ruleNote"        text,                                            -- "Paid, per Maternity Benefits Act"
  "sortOrder"       smallint NOT NULL DEFAULT 0,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("seedVersion", name)
);
SELECT "Company"."addStandardTriggers"('"Platform"."TemplateLeaveTypes"');
COMMENT ON TABLE "Platform"."TemplateLeaveTypes" IS 'Leave-type seeds copied into HumanResources.LeaveTypes when "Seed leave types & salary components" is ticked.';

-- TemplateSalaryComponents — admin/templates "Salary" tab (Basic, HRA 45%, Medical 10% exempt, Tax u/s 149, EOBI 1%, PF 8.33%)
CREATE TABLE "Platform"."TemplateSalaryComponents" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "seedVersion"     text NOT NULL,
  name             text NOT NULL,
  "componentKind"   text NOT NULL,
  "calcMethod"      text NOT NULL,
  "pctOfBasic"     numeric(7,4) CHECK ("pctOfBasic" BETWEEN 0 AND 100),
  "isTaxable"       boolean NOT NULL DEFAULT true,
  "statutoryCode"   text,
  "ruleNote"        text,                                            -- "Min wage based"
  "sortOrder"       smallint NOT NULL DEFAULT 0,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("seedVersion", name),
  CONSTRAINT "seedSalaryComponentPctChk" CHECK ("calcMethod" <> 'PCT_OF_BASIC' OR "pctOfBasic" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Platform"."TemplateSalaryComponents"');
COMMENT ON TABLE "Platform"."TemplateSalaryComponents" IS 'Salary-component seeds copied into Payroll.SalaryComponents at provisioning.';

-- =============================================================================
-- B4. Catalog: meters, limits, modules, add-ons — admin/entitlements,
--     admin/features (Core modules tab), admin/usage, admin/plans
-- =============================================================================

-- UsageMeters — the metered dimensions (admin/usage columns, admin/entitlements "Limits")
CREATE TABLE "Platform"."UsageMeters" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,
  name             text NOT NULL,                                   -- "Invoices / month"
  unit             text,                                            -- users / GB / calls
  icon             text,
  "resetPeriod"     text NOT NULL,  -- USERS/STORAGE are point-in-time
  "sortOrder"       smallint NOT NULL DEFAULT 0,
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0
);
SELECT "Company"."addStandardTriggers"('"Platform"."UsageMeters"');
COMMENT ON TABLE "Platform"."UsageMeters" IS 'Catalog of metered usage dimensions shared by SubscriptionPlanLimits, UsageSnapshots, UsageLimitOverrides and UsageAlertRules.';

-- SubscriptionPlanLimits — admin/entitlements "Limits" rows (Users, Branches, Invoices/month,
-- Storage (GB), API calls/day; blank = unlimited) and admin/usage plan limits
CREATE TABLE "Platform"."SubscriptionPlanLimits" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "planId"          uuid NOT NULL REFERENCES "Platform"."SubscriptionPlans"(id),
  "usageMeterId"   uuid NOT NULL REFERENCES "Platform"."UsageMeters"(id),
  "limitValue"      numeric(18,3) CHECK ("limitValue" >= 0),          -- NULL = unlimited ("∞")
  "overagePrice"    numeric(18,4) CHECK ("overagePrice" >= 0),        -- "at plan overage rate"
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("planId", "usageMeterId")
);
SELECT "Company"."addStandardTriggers"('"Platform"."SubscriptionPlanLimits"', true);
COMMENT ON TABLE "Platform"."SubscriptionPlanLimits" IS 'Per-plan limit per meter; NULL = unlimited. USERS and STORAGE_GB are mirrored into plan.userSeats / plan.storageGb by trigger.';

-- PlatformModules — admin/features "Core modules" tab (mod.accounting … mod.ess, hrms_module)
-- and every row of the admin/entitlements feature matrix (mod.* and entitlement-flag keys)
CREATE TABLE "Platform"."PlatformModules" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key              text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_.]{2,59}$'),   -- mod.accounting, hrms_module, fbr_einvoicing_di
  name             text NOT NULL,                                   -- "Accounting & GL"
  icon             text,
  kind             text NOT NULL,            -- MODULE rows appear in the Core modules tab
  "entGroup"        text NOT NULL,
  "moduleKey"       text,  -- link to SubscriptionPlanFeatures / TenantModules
  "featureFlagId"  uuid,                                            -- entitlement flag driven by this row (FK added in B7)
  "minPlanId"      uuid REFERENCES "Platform"."SubscriptionPlans"(id),               -- "Minimum plan"
  "isCore"          boolean NOT NULL DEFAULT false,                  -- "Core" lock (Accounting & GL)
  "isEnabled"       boolean NOT NULL DEFAULT true,                   -- global switch: off hides it for every tenant
  "sortOrder"       smallint NOT NULL DEFAULT 0,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  CONSTRAINT "platformModuleCoreOnChk" CHECK (NOT "isCore" OR "isEnabled")
);
SELECT "Company"."addStandardTriggers"('"Platform"."PlatformModules"', true);
COMMENT ON TABLE "Platform"."PlatformModules" IS 'Commercial catalog of modules and plan-gated features. What a plan includes lives here, never in release flags.';

-- PlatformModulePlans — plan availability cells (Core modules per-plan switches,
-- entitlement matrix check cells). Saving entitlements rewrites the plan rule of the linked flag.
CREATE TABLE "Platform"."PlatformModulePlans" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platformModuleId" uuid NOT NULL REFERENCES "Platform"."PlatformModules"(id),
  "planId"          uuid NOT NULL REFERENCES "Platform"."SubscriptionPlans"(id),
  "isIncluded"      boolean NOT NULL DEFAULT false,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("platformModuleId", "planId")
);
SELECT "Company"."addStandardTriggers"('"Platform"."PlatformModulePlans"', true);
CREATE INDEX "platformModulePlanPlanIdx" ON "Platform"."PlatformModulePlans" ("planId");
COMMENT ON TABLE "Platform"."PlatformModulePlans" IS 'Module/feature × plan inclusion matrix (admin/entitlements, admin/features Core modules).';

-- addon — admin/entitlements "Add-ons" (POS terminal Rs 2,500, WhatsApp Business Rs 3,000 + Rs 1.20/message,
-- Extra company Rs 4,999, Payroll Rs 150 per employee) plus storage / Fixed Assets add-ons billed on invoices
CREATE TABLE "Platform"."Addons" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),  -- POS_TERMINAL, WHATSAPP, EXTRA_COMPANY, PAYROLL
  name             text NOT NULL,
  icon             text,
  price            numeric(18,2) NOT NULL CHECK (price >= 0),
  "billingUnit"     text NOT NULL,
  "usagePrice"      numeric(18,4) CHECK ("usagePrice" >= 0),          -- Rs 1.20
  "usageUnit"       text,                                            -- 'message'
  note             text,                                            -- "Included from Business"
  "platformModuleId" uuid REFERENCES "Platform"."PlatformModules"(id),  -- add-on that unlocks a module (Fixed Assets)
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  CONSTRAINT "addonUsageUnitChk" CHECK ("usagePrice" IS NULL OR "usageUnit" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Platform"."Addons"', true);
COMMENT ON TABLE "Platform"."Addons" IS 'Sellable add-ons on top of a plan. Price changes are logged in EntitlementChangeLogs and apply at next renewal.';

-- AddonPlans — add-on availability letters S/G/B/E on the add-on cards
CREATE TABLE "Platform"."AddonPlans" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "addonId"         uuid NOT NULL REFERENCES "Platform"."Addons"(id),
  "planId"          uuid NOT NULL REFERENCES "Platform"."SubscriptionPlans"(id),
  availability     text NOT NULL,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("addonId", "planId")
);
SELECT "Company"."addStandardTriggers"('"Platform"."AddonPlans"');
COMMENT ON TABLE "Platform"."AddonPlans" IS 'Which plans can buy (or already include) each add-on.';

-- TenantAddons — add-ons a tenant pays for (Tenant 360 "Add-ons: Fixed Assets · Rs 2,500/mo",
-- add-on subscriber counts on admin/entitlements, add-on invoice lines)
CREATE TABLE "Platform"."TenantAddons" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "addonId"         uuid NOT NULL REFERENCES "Platform"."Addons"(id),
  "subscriptionId"  uuid REFERENCES "Platform"."Subscriptions"(id),
  quantity         numeric(18,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),  -- terminals / companies / employees
  "unitPrice"       numeric(18,2) NOT NULL CHECK ("unitPrice" >= 0),         -- grandfathered price
  "startedOn"       date NOT NULL,
  "endedOn"         date,
  status           text NOT NULL DEFAULT 'ACTIVE',
  "enabledByStaffId" uuid REFERENCES "Platform"."PlatformStaff"(id),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "tenantAddonDatesChk" CHECK ("endedOn" IS NULL OR "endedOn" >= "startedOn")
);
SELECT "Company"."addStandardTriggers"('"Platform"."TenantAddons"', true);
CREATE UNIQUE INDEX "tenantAddonOneActive" ON "Platform"."TenantAddons" ("tenantId", "addonId") WHERE status = 'ACTIVE';
CREATE INDEX "tenantAddonAddonIdx" ON "Platform"."TenantAddons" ("addonId", status);
COMMENT ON TABLE "Platform"."TenantAddons" IS 'Active and past add-on subscriptions per tenant, with the price the tenant pays.';

-- =============================================================================
-- B5. Growth: partners, coupons, leads — admin/partners, admin/leads
-- =============================================================================

-- partner — admin/partners "Resellers" cards (tier, commission %, tenants, payout IBAN)
CREATE TABLE "Platform"."Resellers" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL UNIQUE,                            -- Lahore Tech Partners
  city             text,
  tier             text NOT NULL DEFAULT 'BRONZE',
  "commissionPct"   numeric(7,4) NOT NULL CHECK ("commissionPct" BETWEEN 0 AND 100),     -- 20 / 15 / 10
  "nextTierTenants" integer CHECK ("nextTierTenants" > 0),          -- "3 more tenants to Platinum" (12/15)
  "contactName"     text,
  email            citext,
  phone            text,
  ntn              text,
  "isActiveTaxpayer" boolean NOT NULL DEFAULT false,                -- "NTN on file · Yes · active taxpayer"
  "bankName"        text,
  "ibanMasked"      text,                                            -- PK36 MEZN •••• 4471
  "ibanEnc"         bytea,
  "payoutMethod"    text NOT NULL DEFAULT 'IBFT',
  "inviteCode"      text UNIQUE,                                     -- partner portal invite link
  status           text NOT NULL DEFAULT 'ACTIVE',
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz
);
SELECT "Company"."addStandardTriggers"('"Platform"."Resellers"', true);
COMMENT ON TABLE "Platform"."Resellers" IS 'Reseller network. Commission is a % of the MRR of tenants they sourced.';

-- ResellerTenants — tenants sourced by a partner ("Tenants via partners 41")
CREATE TABLE "Platform"."ResellerTenants" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "partnerId"       uuid NOT NULL REFERENCES "Platform"."Resellers"(id),
  "tenantId"        uuid NOT NULL UNIQUE REFERENCES "Platform"."Tenants"(id),   -- one sourcing partner per tenant
  "attributedOn"    date NOT NULL,
  "commissionPctOverride" numeric(7,4) CHECK ("commissionPctOverride" BETWEEN 0 AND 100),
  "endedOn"         date,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "partnerTenantDatesChk" CHECK ("endedOn" IS NULL OR "endedOn" >= "attributedOn")
);
SELECT "Company"."addStandardTriggers"('"Platform"."ResellerTenants"', true);
CREATE INDEX "partnerTenantPartnerIdx" ON "Platform"."ResellerTenants" ("partnerId");
COMMENT ON TABLE "Platform"."ResellerTenants" IS 'Partner attribution of a tenant (drives commission and partner-sourced MRR).';

-- ResellerPayouts — monthly commission statement ("Gross commission · WHT 12% u/s 233 · Net payable", "Mark as paid")
CREATE TABLE "Platform"."ResellerPayouts" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "partnerId"       uuid NOT NULL REFERENCES "Platform"."Resellers"(id),
  "periodMonth"     date NOT NULL CHECK (extract(day FROM "periodMonth") = 1),   -- 2026-09-01
  "tenantsCount"    integer NOT NULL DEFAULT 0 CHECK ("tenantsCount" >= 0),
  "sourcedMrr"      numeric(18,2) NOT NULL DEFAULT 0 CHECK ("sourcedMrr" >= 0),
  "commissionPct"   numeric(7,4) NOT NULL CHECK ("commissionPct" BETWEEN 0 AND 100),
  "grossAmount"     numeric(18,2) NOT NULL CHECK ("grossAmount" >= 0),
  "whtSection"      text NOT NULL DEFAULT '233',
  "whtRate"         numeric(7,4) NOT NULL DEFAULT 12 CHECK ("whtRate" BETWEEN 0 AND 100),
  "whtAmount"       numeric(18,2) NOT NULL CHECK ("whtAmount" >= 0),
  "netAmount"       numeric(18,2) NOT NULL CHECK ("netAmount" >= 0),
  "statementLines"  jsonb NOT NULL DEFAULT '[]',                     -- snapshot [{tenantId, plan, mrr, commission}]
  status           text NOT NULL DEFAULT 'DUE',
  "paidOn"          date,
  "paymentRef"      text,                                            -- IBFT reference
  "whtCertificateNo" text,
  "statementEmailedAt" timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("partnerId", "periodMonth"),
  CONSTRAINT "partnerPayoutNetChk" CHECK ("netAmount" = "grossAmount" - "whtAmount"),
  CONSTRAINT "partnerPayoutPaidChk" CHECK (status <> 'PAID' OR "paidOn" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Platform"."ResellerPayouts"', true);
CREATE INDEX "partnerPayoutStatusIdx" ON "Platform"."ResellerPayouts" (status, "periodMonth");
COMMENT ON TABLE "Platform"."ResellerPayouts" IS 'Partner commission payout per month: gross − WHT u/s 233 = net, paid by IBFT. Finsoft''s own expense, not tenant GL.';

-- coupon — admin/partners "Coupons" tab and coupon generator
CREATE TABLE "Platform"."SubscriptionCoupons" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             citext NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9-]{4,24}$'),   -- FINSOFT-RAMZAN25 (case-insensitive)
  "discountType"    text NOT NULL,
  "discountValue"   numeric(18,2) NOT NULL CHECK ("discountValue" > 0),
  duration         text NOT NULL,
  "redemptionCap"   integer CHECK ("redemptionCap" > 0),              -- NULL = unlimited ("0 = unlimited" on the form)
  "startsOn"        date NOT NULL,
  "expiresOn"       date,
  "newCustomersOnly" boolean NOT NULL DEFAULT true,
  "stackableWithPartner" boolean NOT NULL DEFAULT false,
  "partnerId"       uuid REFERENCES "Platform"."Resellers"(id),            -- PARTNER-LTP20
  status           text NOT NULL DEFAULT 'ACTIVE',
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,                                     -- "Delete": existing redemptions keep their discount
  CONSTRAINT "couponPercentChk" CHECK ("discountType" <> 'PERCENT' OR "discountValue" <= 100),
  CONSTRAINT "couponDatesChk" CHECK ("expiresOn" IS NULL OR "expiresOn" >= "startsOn")
);
SELECT "Company"."addStandardTriggers"('"Platform"."SubscriptionCoupons"', true);
CREATE INDEX "couponStatusIdx" ON "Platform"."SubscriptionCoupons" (status, "expiresOn");
COMMENT ON TABLE "Platform"."SubscriptionCoupons" IS 'Discount codes (Ramzan, 14 August, partner codes). Validated at checkout; SCHEDULED/EXPIRED follow startsOn/expiresOn.';

-- SubscriptionCouponPlans — "Applies to plans" chips
CREATE TABLE "Platform"."SubscriptionCouponPlans" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "couponId"        uuid NOT NULL REFERENCES "Platform"."SubscriptionCoupons"(id),
  "planId"          uuid NOT NULL REFERENCES "Platform"."SubscriptionPlans"(id),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("couponId", "planId")
);
SELECT "Company"."addStandardTriggers"('"Platform"."SubscriptionCouponPlans"');
COMMENT ON TABLE "Platform"."SubscriptionCouponPlans" IS 'Plans a coupon can be redeemed on.';

-- lead — admin/leads Kanban (Lead → Demo booked → Trial → Paid → Churned), values = expected MRR
CREATE TABLE "Platform"."PlatformLeads" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyName"     text NOT NULL,                                   -- "Sialkot Surgical Instruments"
  "contactPerson"   text,
  phone            text,
  email            citext,
  city             text,
  source           text NOT NULL,
  "partnerId"       uuid REFERENCES "Platform"."Resellers"(id),
  "ownerStaffId"   uuid NOT NULL REFERENCES "Platform"."PlatformStaff"(id),
  "planInterestId" uuid REFERENCES "Platform"."SubscriptionPlans"(id),
  "expectedMrr"     numeric(18,2) NOT NULL DEFAULT 0 CHECK ("expectedMrr" >= 0),
  stage            text NOT NULL DEFAULT 'LEAD',
  "boardPosition"   integer NOT NULL DEFAULT 0,                      -- order inside the Kanban column (drag & drop)
  notes            text,                                            -- "Pain points, current software (Tally, QuickBooks, Excel)…"
  "demoAt"          timestamptz,
  "trialStartedOn" date,
  "trialEndsOn"    date,
  "trialEngagementScore" smallint CHECK ("trialEngagementScore" BETWEEN 0 AND 100),
  "wonAt"           timestamptz,
  "churnedAt"       timestamptz,
  "lostReason"      text,                                            -- "Reason: price"
  "tenantId"        uuid REFERENCES "Platform"."Tenants"(id),             -- set when the lead is onboarded
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  CONSTRAINT "leadPartnerSourceChk" CHECK (source <> 'PARTNER' OR "partnerId" IS NOT NULL),
  CONSTRAINT "leadPaidChk" CHECK (stage <> 'PAID' OR "wonAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Platform"."PlatformLeads"');
CREATE INDEX "leadStageIdx" ON "Platform"."PlatformLeads" (stage, "boardPosition") WHERE "deletedAt" IS NULL;
CREATE INDEX "leadOwnerIdx" ON "Platform"."PlatformLeads" ("ownerStaffId", stage);
CREATE INDEX "leadNameTrgmIdx" ON "Platform"."PlatformLeads" USING gin ("companyName" gin_trgm_ops);
COMMENT ON TABLE "Platform"."PlatformLeads" IS 'Sales pipeline for Finsoft Cloud. Moving a card writes PlatformLeadActivities; Paid prompts onboarding.';

-- PlatformLeadActivities — stage moves and notes on a lead (drives funnel conversion %)
CREATE TABLE "Platform"."PlatformLeadActivities" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "leadId"          uuid NOT NULL REFERENCES "Platform"."PlatformLeads"(id),
  "activityType"    text NOT NULL,
  "fromStage"       text,
  "toStage"         text,
  note             text,
  "staffUserId"    uuid REFERENCES "Platform"."PlatformStaff"(id),
  "occurredAt"      timestamptz NOT NULL DEFAULT now(),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "leadActivityStageChk" CHECK ("activityType" <> 'STAGE_CHANGE' OR ("toStage" IS NOT NULL AND "toStage" IS DISTINCT FROM "fromStage"))
);
SELECT "Company"."addStandardTriggers"('"Platform"."PlatformLeadActivities"');
CREATE INDEX "leadActivityLeadIdx" ON "Platform"."PlatformLeadActivities" ("leadId", "occurredAt" DESC);
COMMENT ON TABLE "Platform"."PlatformLeadActivities" IS 'Lead timeline: creation, stage changes (with undo), notes, calls, demos.';

-- =============================================================================
-- B6. Billing: subscription events, platform invoices, payments, dunning —
--     admin/subscriptions, admin/invoices, admin/dunning, Tenant 360 Billing
--     (Finsoft's own revenue — see _parts/posting-platform.md; no tenant GL)
-- =============================================================================

-- SubscriptionEvents — lifecycle log of a subscription; drives "MRR movement"
-- (New / Expansion / Contraction / Churn) on admin/subscriptions, admin/analytics, admin/dashboard
CREATE TABLE "Platform"."SubscriptionEvents" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "subscriptionId"  uuid NOT NULL REFERENCES "Platform"."Subscriptions"(id),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "eventType"       text NOT NULL,
  "occurredAt"      timestamptz NOT NULL DEFAULT now(),
  "effectiveOn"     date NOT NULL DEFAULT current_date,
  "fromPlanId"     uuid REFERENCES "Platform"."SubscriptionPlans"(id),
  "toPlanId"       uuid REFERENCES "Platform"."SubscriptionPlans"(id),
  "fromSeats"       integer CHECK ("fromSeats" > 0),
  "toSeats"         integer CHECK ("toSeats" > 0),
  "mrrBefore"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("mrrBefore" >= 0),
  "mrrAfter"        numeric(18,2) NOT NULL DEFAULT 0 CHECK ("mrrAfter" >= 0),
  "mrrDelta"        numeric(18,2) GENERATED ALWAYS AS ("mrrAfter" - "mrrBefore") STORED,
  movement         text NOT NULL DEFAULT 'NONE',
  "prorationAmount" numeric(18,2),                                   -- "Due today Rs 157,820" (credit − new charge)
  "trialDaysAdded" smallint CHECK ("trialDaysAdded" IN (7, 14, 30)),-- "Extend trial by 7/14/30 days"
  "staffUserId"    uuid REFERENCES "Platform"."PlatformStaff"(id),
  note             text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "subscriptionEventMovementChk" CHECK (
       (movement = 'NEW'          AND "mrrBefore" = 0 AND "mrrAfter" > 0)
    OR (movement = 'REACTIVATION' AND "mrrAfter" > 0)
    OR (movement = 'EXPANSION'    AND "mrrAfter" > "mrrBefore")
    OR (movement = 'CONTRACTION'  AND "mrrAfter" < "mrrBefore" AND "mrrAfter" > 0)
    OR (movement = 'CHURN'        AND "mrrAfter" = 0 AND "mrrBefore" > 0)
    OR (movement = 'NONE'))
);
SELECT "Company"."addStandardTriggers"('"Platform"."SubscriptionEvents"');
CREATE TRIGGER "platformSubscriptionEventAppendOnly" BEFORE UPDATE OR DELETE ON "Platform"."SubscriptionEvents"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();
CREATE INDEX "subscriptionEventTenantIdx" ON "Platform"."SubscriptionEvents" ("tenantId", "occurredAt" DESC);
CREATE INDEX "subscriptionEventMovementIdx" ON "Platform"."SubscriptionEvents" ("effectiveOn", movement);
COMMENT ON TABLE "Platform"."SubscriptionEvents" IS 'Append-only subscription history with MRR before/after. Source of MRR movement, NRR/GRR and churn analytics.';

-- PlatformInvoices — admin/invoices ("FS-INV-2026-01842 · Fixed Assets add-on · Oct"), Tenant 360 Billing tab
CREATE TABLE "Platform"."PlatformInvoices" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "docNo"           text NOT NULL UNIQUE CHECK ("docNo" ~ '^FS-INV-\d{4}-\d{5,}$'),    -- Platform.getNextPlatformDocumentNo('FS-INV')
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "subscriptionId"  uuid REFERENCES "Platform"."Subscriptions"(id),
  "invoiceKind"     text NOT NULL DEFAULT 'SUBSCRIPTION',
  description      text NOT NULL,                                   -- "Growth · Sep 2026", "Extra storage 50 GB"
  "periodStart"     date,
  "periodEnd"       date,
  "issuedOn"        date NOT NULL,
  "dueOn"           date NOT NULL,
  "currencyCode"    char(3) NOT NULL DEFAULT 'PKR',
  "grossAmount"     numeric(18,2) NOT NULL CHECK ("grossAmount" >= 0),   -- sum of lines
  "discountAmount"  numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),  -- coupon
  "netAmount"       numeric(18,2) NOT NULL CHECK ("netAmount" >= 0),     -- "Subtotal" column
  "taxAuthorityId" uuid REFERENCES "Platform"."TaxMasterAuthorities"(id),         -- PRA / SRB / KPRA / BRA by tenant province
  "taxRate"         numeric(7,4) NOT NULL DEFAULT 0 CHECK ("taxRate" BETWEEN 0 AND 100),  -- "PST 16%"
  "taxAmount"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "totalAmount"     numeric(18,2) NOT NULL CHECK ("totalAmount" >= 0),   -- "Total (Rs)"
  "paidAmount"      numeric(18,2) NOT NULL DEFAULT 0 CHECK ("paidAmount" >= 0),
  "balanceAmount"   numeric(18,2) GENERATED ALWAYS AS ("totalAmount" - "paidAmount") STORED,
  status           text NOT NULL DEFAULT 'OPEN',
  "couponId"        uuid REFERENCES "Platform"."SubscriptionCoupons"(id),
  "emailedAt"       timestamptz,                                     -- "emailed to billing contact"
  "lastReminderAt" timestamptz,                                     -- "Remind"
  "voidedAt"        timestamptz,
  "voidReason"      text,                                            -- "FS-INV-2026-01597 duplicate"
  "voidedByStaffId" uuid REFERENCES "Platform"."PlatformStaff"(id),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "platformInvoiceNetChk"   CHECK ("netAmount" = "grossAmount" - "discountAmount"),
  CONSTRAINT "platformInvoiceTotalChk" CHECK ("totalAmount" = "netAmount" + "taxAmount"),
  CONSTRAINT "platformInvoicePaidChk"  CHECK ("paidAmount" <= "totalAmount"),
  CONSTRAINT "platformInvoiceDueChk"   CHECK ("dueOn" >= "issuedOn"),
  CONSTRAINT "platformInvoicePeriodChk" CHECK ("periodEnd" IS NULL OR "periodStart" IS NULL OR "periodEnd" >= "periodStart"),
  CONSTRAINT "platformInvoiceVoidChk"  CHECK (status <> 'VOID' OR ("voidedAt" IS NOT NULL AND "voidReason" IS NOT NULL)),
  CONSTRAINT "platformInvoicePaidStatusChk" CHECK (status <> 'PAID' OR "paidAmount" = "totalAmount")
);
SELECT "Company"."addStandardTriggers"('"Platform"."PlatformInvoices"', true);
CREATE INDEX "platformInvoiceTenantIdx" ON "Platform"."PlatformInvoices" ("tenantId", "issuedOn" DESC);
CREATE INDEX "platformInvoiceStatusIdx" ON "Platform"."PlatformInvoices" (status, "dueOn");
CREATE INDEX "platformInvoiceIssuedIdx" ON "Platform"."PlatformInvoices" ("issuedOn");
COMMENT ON TABLE "Platform"."PlatformInvoices" IS 'Invoices Finsoft Cloud issues to tenants, with provincial sales tax on services. OVERDUE is derived (dueOn < today and balance > 0). Never deleted: VOID.';

-- PlatformInvoiceLines — plan, add-on, proration and overage lines
CREATE TABLE "Platform"."PlatformInvoiceLines" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platformInvoiceId" uuid NOT NULL REFERENCES "Platform"."PlatformInvoices"(id),
  "lineNo"          smallint NOT NULL CHECK ("lineNo" > 0),
  "lineKind"        text NOT NULL,
  description      text NOT NULL,
  "planId"          uuid REFERENCES "Platform"."SubscriptionPlans"(id),
  "addonId"         uuid REFERENCES "Platform"."Addons"(id),
  "usageMeterId"   uuid REFERENCES "Platform"."UsageMeters"(id),
  quantity         numeric(18,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  "unitPrice"       numeric(18,4) NOT NULL,                          -- negative for proration credit
  amount           numeric(18,2) NOT NULL,
  "periodStart"     date,
  "periodEnd"       date,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("platformInvoiceId", "lineNo"),
  CONSTRAINT "platformInvoiceLineAmountChk" CHECK (amount = round(quantity * "unitPrice", 2)),
  CONSTRAINT "platformInvoiceLineCreditChk" CHECK (("lineKind" = 'PRORATION_CREDIT') = (amount < 0) OR amount = 0)
);
SELECT "Company"."addStandardTriggers"('"Platform"."PlatformInvoiceLines"', true);
COMMENT ON TABLE "Platform"."PlatformInvoiceLines" IS 'Lines of a platform invoice; sum(amount) = PlatformInvoices.grossAmount.';

-- PlatformPayments — collections against platform invoices (auto-debit, wallet retries,
-- "Mark paid", refunds). Failed charges are kept: they are dunning evidence.
CREATE TABLE "Platform"."PlatformPayments" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "platformInvoiceId" uuid NOT NULL REFERENCES "Platform"."PlatformInvoices"(id),
  "paymentMethod"   text NOT NULL,
  "paymentRef"      text,                                            -- "Visa •••• 4417", "Wallet 0300•••412"
  "gatewayTxnRef"  text,
  amount           numeric(18,2) NOT NULL CHECK (amount > 0),
  status           text NOT NULL DEFAULT 'PENDING',
  "failureCode"     text,                                            -- do_not_honor, insufficient_funds, expired_card
  "failureMessage"  text,                                            -- "Card declined (do not honour)"
  "attemptedAt"     timestamptz NOT NULL DEFAULT now(),
  "paidAt"          timestamptz,
  "refundedAmount"  numeric(18,2) NOT NULL DEFAULT 0 CHECK ("refundedAmount" >= 0),
  "refundedAt"      timestamptz,
  "recordedByStaffId" uuid REFERENCES "Platform"."PlatformStaff"(id),     -- manual "Mark paid"
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "platformPaymentPaidChk" CHECK (status NOT IN ('SUCCEEDED','REFUNDED','PARTIALLY_REFUNDED') OR "paidAt" IS NOT NULL),
  CONSTRAINT "platformPaymentFailedChk" CHECK (status <> 'FAILED' OR "failureMessage" IS NOT NULL),
  CONSTRAINT "platformPaymentRefundChk" CHECK ("refundedAmount" <= amount
                                                AND (status IN ('REFUNDED','PARTIALLY_REFUNDED')) = ("refundedAmount" > 0)),
  CONSTRAINT "platformPaymentFullRefundChk" CHECK (status <> 'REFUNDED' OR "refundedAmount" = amount)
);
SELECT "Company"."addStandardTriggers"('"Platform"."PlatformPayments"', true);
CREATE INDEX "platformPaymentInvoiceIdx" ON "Platform"."PlatformPayments" ("platformInvoiceId");
CREATE INDEX "platformPaymentTenantIdx" ON "Platform"."PlatformPayments" ("tenantId", "attemptedAt" DESC);
CREATE INDEX "platformPaymentPaidIdx" ON "Platform"."PlatformPayments" ("paidAt") WHERE status IN ('SUCCEEDED','PARTIALLY_REFUNDED');
COMMENT ON TABLE "Platform"."PlatformPayments" IS 'Charge attempts and receipts for platform invoices. Trigger keeps PlatformInvoices.paidAmount / status in step.';

-- SubscriptionCouponRedemptions — "Redemptions 41 / 200" meter, discount on invoices
CREATE TABLE "Platform"."SubscriptionCouponRedemptions" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "couponId"        uuid NOT NULL REFERENCES "Platform"."SubscriptionCoupons"(id),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "subscriptionId"  uuid REFERENCES "Platform"."Subscriptions"(id),
  "firstInvoiceId" uuid REFERENCES "Platform"."PlatformInvoices"(id),
  "redeemedAt"      timestamptz NOT NULL DEFAULT now(),
  "discountPerInvoice" numeric(18,2) NOT NULL CHECK ("discountPerInvoice" >= 0),
  "monthsRemaining" smallint CHECK ("monthsRemaining" >= 0),          -- NULL = forever
  status           text NOT NULL DEFAULT 'ACTIVE',
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("couponId", "tenantId")
);
SELECT "Company"."addStandardTriggers"('"Platform"."SubscriptionCouponRedemptions"', true);
CREATE INDEX "couponRedemptionTenantIdx" ON "Platform"."SubscriptionCouponRedemptions" ("tenantId");
COMMENT ON TABLE "Platform"."SubscriptionCouponRedemptions" IS 'A tenant''s use of a coupon; one redemption per coupon per tenant.';

-- DunningPolicies — admin/dunning "Dunning policy" slider (Grace 7 d → Read-only 7 d →
-- Suspended 31 d → Cancel) and "Reminder channels" (EN/UR, D−3 … D+14)
CREATE TABLE "Platform"."DunningPolicies" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  "isActive"        boolean NOT NULL DEFAULT true,
  "graceDays"       smallint NOT NULL DEFAULT 7  CHECK ("graceDays" BETWEEN 1 AND 20),
  "readOnlyDays"   smallint NOT NULL DEFAULT 7  CHECK ("readOnlyDays" BETWEEN 0 AND 20),
  "suspendedDays"   smallint NOT NULL DEFAULT 31 CHECK ("suspendedDays" BETWEEN 5 AND 40),
  "archiveDays"     smallint NOT NULL DEFAULT 90 CHECK ("archiveDays" > 0),     -- "cancelled, data archived for 90 days"
  "retryHour"       smallint NOT NULL DEFAULT 10 CHECK ("retryHour" BETWEEN 0 AND 23),           -- "Retries land at 10:00"
  "salaryRetryDays" smallint[] NOT NULL DEFAULT '{1,10}',           -- "on salary-credit days (1st and 10th)"
  "retrySchedule"   jsonb NOT NULL,                                  -- [{"day":0,"method":"ORIGINAL","label":"Initial charge"},{"day":3,"method":"JAZZCASH",…}]
  "emailEnabled"    boolean NOT NULL DEFAULT true,
  "emailOffsets"    smallint[] NOT NULL DEFAULT '{-3,0,3,7,14}',
  "smsEnabled"      boolean NOT NULL DEFAULT true,
  "smsOffsets"      smallint[] NOT NULL DEFAULT '{0,1,7}',
  "whatsappEnabled" boolean NOT NULL DEFAULT false,
  "whatsappOffsets" smallint[] NOT NULL DEFAULT '{0,3}',
  "effectiveFrom"   date NOT NULL DEFAULT current_date,              -- "Applies to new failures"
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "dunningPolicyOffsetsChk" CHECK (
        "emailOffsets"    <@ ARRAY[-3,0,1,3,7,14]::smallint[]
    AND "smsOffsets"      <@ ARRAY[-3,0,1,3,7,14]::smallint[]
    AND "whatsappOffsets" <@ ARRAY[-3,0,1,3,7,14]::smallint[]),
  CONSTRAINT "dunningPolicySalaryDaysChk" CHECK ("salaryRetryDays" <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28]::smallint[]),
  CONSTRAINT "dunningPolicyScheduleChk" CHECK (jsonb_typeof("retrySchedule") = 'array')
);
SELECT "Company"."addStandardTriggers"('"Platform"."DunningPolicies"', true);
CREATE UNIQUE INDEX "dunningPolicyOneActive" ON "Platform"."DunningPolicies" ((true)) WHERE "isActive";
COMMENT ON TABLE "Platform"."DunningPolicies" IS 'Grace → read-only → suspend → cancel thresholds (days after due), smart-retry plan and reminder cadence. One active policy.';

-- DunningCases — admin/dunning "Collections queue" row (tenant, invoice, amount, method,
-- attempts · next retry, stage), promise-to-pay modal
CREATE TABLE "Platform"."DunningCases" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "platformInvoiceId" uuid NOT NULL UNIQUE REFERENCES "Platform"."PlatformInvoices"(id),
  "dunningPolicyId" uuid NOT NULL REFERENCES "Platform"."DunningPolicies"(id),
  "openedAt"        timestamptz NOT NULL DEFAULT now(),
  stage            text NOT NULL DEFAULT 'GRACE',
  "amountDue"       numeric(18,2) NOT NULL CHECK ("amountDue" > 0),
  "paymentMethod"   text,
  "attemptsCount"   smallint NOT NULL DEFAULT 0 CHECK ("attemptsCount" >= 0),       -- "2/4"
  "lastFailureReason" text,                                         -- "Mandate rejected by bank"
  "nextRetryAt"    timestamptz,
  "nextRetryMethod" text,
  "retriesPaused"   boolean NOT NULL DEFAULT false,                  -- "Paused · read-only", "Manual only"
  "promiseDate"     date,
  "promiseAmount"   numeric(18,2) CHECK ("promiseAmount" > 0),
  "promiseSource"   text,
  "promiseNote"     text,                                            -- "Cheque from HBL to be deposited Monday"
  "promiseLiftReadOnly" boolean NOT NULL DEFAULT false,
  "promiseRemindOwner" boolean NOT NULL DEFAULT true,
  "promiseLoggedByStaffId" uuid REFERENCES "Platform"."PlatformStaff"(id),
  "recoveredAt"     timestamptz,
  "recoveredPaymentId" uuid REFERENCES "Platform"."PlatformPayments"(id),
  "closedAt"        timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "dunningCasePromiseChk" CHECK (stage <> 'PROMISE' OR ("promiseDate" IS NOT NULL AND "promiseSource" IS NOT NULL)),
  CONSTRAINT "dunningCaseRecoveredChk" CHECK (stage <> 'RECOVERED' OR ("recoveredAt" IS NOT NULL AND "recoveredPaymentId" IS NOT NULL)),
  CONSTRAINT "dunningCaseClosedChk" CHECK ((stage IN ('RECOVERED','CANCELLED','WRITTEN_OFF')) = ("closedAt" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Platform"."DunningCases"', true);
CREATE INDEX "dunningCaseOpenIdx" ON "Platform"."DunningCases" (stage, "nextRetryAt") WHERE "closedAt" IS NULL;
CREATE INDEX "dunningCaseTenantIdx" ON "Platform"."DunningCases" ("tenantId", "openedAt" DESC);
COMMENT ON TABLE "Platform"."DunningCases" IS 'One collections case per unpaid platform invoice. Days overdue and age bucket are derived from the invoice due date.';

-- DunningAttempts — the retry-plan timeline (Day 0 Initial charge · Day 1 Smart retry 10:00 ·
-- Day 3 Fallback to wallet · Day 5 Raast request-to-pay · Day 7 Final retry)
CREATE TABLE "Platform"."DunningAttempts" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dunningCaseId"  uuid NOT NULL REFERENCES "Platform"."DunningCases"(id),
  "attemptNo"       smallint NOT NULL CHECK ("attemptNo" > 0),
  "planDay"         smallint NOT NULL CHECK ("planDay" >= 0),
  label            text NOT NULL,                                   -- "Fallback to wallet"
  method           text NOT NULL,
  "scheduledAt"     timestamptz NOT NULL,
  "attemptedAt"     timestamptz,
  status           text NOT NULL DEFAULT 'SCHEDULED',
  "triggeredBy"     text NOT NULL DEFAULT 'SCHEDULE',  -- Retry / "Retry all due"
  "platformPaymentId" uuid REFERENCES "Platform"."PlatformPayments"(id),
  "failureReason"   text,
  "staffUserId"    uuid REFERENCES "Platform"."PlatformStaff"(id),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("dunningCaseId", "attemptNo"),
  CONSTRAINT "dunningAttemptDoneChk" CHECK (status NOT IN ('FAILED','SUCCEEDED') OR ("attemptedAt" IS NOT NULL AND "platformPaymentId" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Platform"."DunningAttempts"', true);
CREATE INDEX "dunningAttemptDueIdx" ON "Platform"."DunningAttempts" ("scheduledAt") WHERE status = 'SCHEDULED';
COMMENT ON TABLE "Platform"."DunningAttempts" IS 'Scheduled and executed retries of a dunning case; each executed attempt creates a PlatformPayments.';

-- =============================================================================
-- B7. Usage & quotas — admin/usage, Tenant 360 Usage tab
-- =============================================================================

-- UsageSnapshots — daily meter reading per tenant (per-tenant meters, top consumers, 6-month mini bars)
CREATE TABLE "Platform"."UsageSnapshots" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "usageMeterId"   uuid NOT NULL REFERENCES "Platform"."UsageMeters"(id),
  "snapshotDate"    date NOT NULL,
  "periodStart"     date NOT NULL,                                   -- start of the month/day the counter belongs to
  "usedValue"       numeric(18,3) NOT NULL CHECK ("usedValue" >= 0),
  "limitValue"      numeric(18,3) CHECK ("limitValue" >= 0),          -- effective limit incl. override; NULL = unlimited
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", "usageMeterId", "snapshotDate"),
  CONSTRAINT "usageSnapshotPeriodChk" CHECK ("periodStart" <= "snapshotDate")
);
SELECT "Company"."addStandardTriggers"('"Platform"."UsageSnapshots"');
CREATE INDEX "usageSnapshotMeterDateIdx" ON "Platform"."UsageSnapshots" ("usageMeterId", "snapshotDate" DESC);
COMMENT ON TABLE "Platform"."UsageSnapshots" IS 'Daily usage reading per tenant × meter. Bars: amber ≥ 80%, red = 100%, striped > 100%.';

-- UsageLimitOverrides — "Override limit" modal (meter, new limit, expires, bill overage, reason)
CREATE TABLE "Platform"."UsageLimitOverrides" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "usageMeterId"   uuid NOT NULL REFERENCES "Platform"."UsageMeters"(id),
  "previousLimit"   numeric(18,3) CHECK ("previousLimit" >= 0),
  "limitValue"      numeric(18,3) NOT NULL CHECK ("limitValue" > 0),
  "expiryMode"      text NOT NULL,
  "expiresOn"       date,
  "billOverage"     text NOT NULL DEFAULT 'NO',
  "customPrice"     numeric(18,4) CHECK ("customPrice" >= 0),
  reason           text NOT NULL CHECK (length(trim(reason)) > 0),  -- "Year-end FBR filing spike, approved by Danish Ahmed"
  "approvedByStaffId" uuid REFERENCES "Platform"."PlatformStaff"(id),
  "appliedByStaffId" uuid NOT NULL REFERENCES "Platform"."PlatformStaff"(id),
  "revokedAt"       timestamptz,                                     -- set on expiry or manual removal
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "usageLimitOverrideExpiryChk" CHECK (("expiryMode" = 'NEVER') = ("expiresOn" IS NULL)),
  CONSTRAINT "usageLimitOverridePriceChk" CHECK ("billOverage" <> 'CUSTOM' OR "customPrice" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Platform"."UsageLimitOverrides"', true);
CREATE UNIQUE INDEX "usageLimitOverrideOneLive" ON "Platform"."UsageLimitOverrides" ("tenantId", "usageMeterId") WHERE "revokedAt" IS NULL;
COMMENT ON TABLE "Platform"."UsageLimitOverrides" IS 'Per-tenant limit override with expiry and overage billing choice; supersedes SubscriptionPlanLimits while live.';

-- UsageAlertRules — admin/usage "Alert rules · Evaluated every 15 minutes" + "New alert rule" modal
CREATE TABLE "Platform"."UsageAlertRules" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "usageMeterId"   uuid REFERENCES "Platform"."UsageMeters"(id),        -- NULL = "Any meter"
  "thresholdPct"    smallint NOT NULL CHECK ("thresholdPct" BETWEEN 50 AND 150),
  "planId"          uuid REFERENCES "Platform"."SubscriptionPlans"(id),               -- NULL = all plans
  action           text NOT NULL,
  "actionDetail"    text,                                            -- "Throttle to 10 req/s and page on-call engineer"
  "throttleRps"     integer CHECK ("throttleRps" > 0),
  "offerAddonId"   uuid REFERENCES "Platform"."Addons"(id),              -- "Offer 50 GB add-on at Rs 1,999/mo in-app"
  "isEnabled"       boolean NOT NULL DEFAULT true,
  "evalIntervalMinutes" smallint NOT NULL DEFAULT 15 CHECK ("evalIntervalMinutes" > 0),
  "lastEvaluatedAt" timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "usageRuleThrottleChk" CHECK (action <> 'THROTTLE' OR "throttleRps" IS NOT NULL),
  CONSTRAINT "usageRuleOfferChk" CHECK (action <> 'OFFER_ADDON' OR "offerAddonId" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Platform"."UsageAlertRules"', true);
COMMENT ON TABLE "Platform"."UsageAlertRules" IS 'When a meter reaches thresholdPct% of its limit (for a plan) → action.';

-- =============================================================================
-- B8. Feature Management — admin/features, admin/features/view, admin/segments,
--     admin/entitlements, admin/change-requests (src/9J-flags.js)
-- Evaluation order: prerequisites → off → individual targets → rules (first
-- match) → default (rollout % or fixed variation). Sticky bucket =
-- hash(tenant.code || '.' || flag.key) % 100.
-- =============================================================================

-- segment — admin/segments list + editor (Beta tenants, Internal staff, Lahore pilot …)
CREATE TABLE "Platform"."TenantSegments" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key              text NOT NULL UNIQUE CHECK (key ~ '^segment\.[a-z][a-z0-9_]*$'),   -- segment.beta_tenants
  name             citext NOT NULL UNIQUE,                          -- case-insensitive unique name
  description      text,
  icon             text,
  tone             text NOT NULL DEFAULT 'GREEN',
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz                                      -- delete is refused while a flag rule uses it
);
SELECT "Company"."addStandardTriggers"('"Platform"."TenantSegments"', true);
COMMENT ON TABLE "Platform"."TenantSegments" IS 'Reusable tenant groups targeted from flag rules (attribute SEGMENT). Membership = include list, or all rules match, minus exclude list.';

-- TenantSegmentRules — "Membership rules · a tenant is in the segment when it matches all rules"
CREATE TABLE "Platform"."TenantSegmentRules" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "segmentId"       uuid NOT NULL REFERENCES "Platform"."TenantSegments"(id),
  position         smallint NOT NULL CHECK (position >= 0),
  attribute        text NOT NULL,
  operator         text NOT NULL,
  "ruleValues"      text[] NOT NULL CHECK (cardinality("ruleValues") > 0),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "segmentRulePositionUq" UNIQUE ("segmentId", position) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT "segmentRuleScalarChk" CHECK (operator IN ('IN','NOT_IN') OR cardinality("ruleValues") = 1),
  CONSTRAINT "segmentRuleNumericOpChk" CHECK (operator IN ('IN','NOT_IN') OR attribute IN ('AGE_DAYS','APP_VERSION'))
);
SELECT "Company"."addStandardTriggers"('"Platform"."TenantSegmentRules"', true);
COMMENT ON TABLE "Platform"."TenantSegmentRules" IS 'AND-ed membership rules of a segment. Enum attributes use IN/NOT_IN; age and app version also GT/LT.';

-- SegmentTenants — explicit include / exclude lists (evaluated before rules)
CREATE TABLE "Platform"."SegmentTenants" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "segmentId"       uuid NOT NULL REFERENCES "Platform"."TenantSegments"(id),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  membership       text NOT NULL,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("segmentId", "tenantId")
);
SELECT "Company"."addStandardTriggers"('"Platform"."SegmentTenants"', true);
CREATE INDEX "segmentTenantTenantIdx" ON "Platform"."SegmentTenants" ("tenantId");
COMMENT ON TABLE "Platform"."SegmentTenants" IS 'Tenants forced into (INCLUDE) or out of (EXCLUDE) a segment regardless of its rules.';

-- FeatureFlags — admin/features list and New flag wizard (Type · Details · Variations · Ownership · Review)
CREATE TABLE "Platform"."FeatureFlags" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key              text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$' AND length(key) BETWEEN 3 AND 60),  -- immutable (trigger)
  name             text NOT NULL,
  description      text,
  "flagType"        text NOT NULL,
  "secondaryType"   text,   -- fbr_einvoicing_di: entitlement + release
  category         text NOT NULL,
  stage            text NOT NULL DEFAULT 'DEFINE',
  "ownerStaffId"   uuid NOT NULL REFERENCES "Platform"."PlatformStaff"(id),
  tags             text[] NOT NULL DEFAULT '{}',
  "variationKind"   text NOT NULL DEFAULT 'BOOLEAN',
  "isTemporary"     boolean NOT NULL DEFAULT true,                   -- release/experiment: temporary; kill/ops/entitlement: permanent
  "expiresOn"       date,
  "staleReason"     text,                                            -- "At 100% in Production for 121 days. Remove it from code and archive."
  "staleSince"      date,
  "archivedAt"      timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "featureFlagSecondaryChk" CHECK ("secondaryType" IS DISTINCT FROM "flagType"),
  CONSTRAINT "featureFlagTemporaryChk" CHECK (NOT "isTemporary" OR "expiresOn" IS NOT NULL),
  CONSTRAINT "featureFlagArchivedChk" CHECK ((stage = 'ARCHIVED') = ("archivedAt" IS NOT NULL)),
  CONSTRAINT "featureFlagTagsChk" CHECK (cardinality(tags) <= 20)
);
SELECT "Company"."addStandardTriggers"('"Platform"."FeatureFlags"', true);
CREATE INDEX "featureFlagListIdx" ON "Platform"."FeatureFlags" (category, stage);
CREATE INDEX "featureFlagOwnerIdx" ON "Platform"."FeatureFlags" ("ownerStaffId");
CREATE INDEX "featureFlagTagsIdx" ON "Platform"."FeatureFlags" USING gin (tags);
COMMENT ON TABLE "Platform"."FeatureFlags" IS 'Release, kill-switch, ops, experiment and entitlement flags. key is snake_case and can never change. Stale = temporary and at 100% for 60 days, past expiry, or no evaluations.';

ALTER TABLE "Platform"."PlatformModules"
  ADD CONSTRAINT "platformModuleFeatureFlagFk" FOREIGN KEY ("featureFlagId") REFERENCES "Platform"."FeatureFlags"(id);

-- FlagVariations — boolean (On/true, Off/false) or multivariate (Control/control, Bento/bento …)
CREATE TABLE "Platform"."FlagVariations" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "flagId"          uuid NOT NULL REFERENCES "Platform"."FeatureFlags"(id),
  idx              smallint NOT NULL CHECK (idx BETWEEN 0 AND 19),  -- 0-based position; targeting refers to it
  name             text NOT NULL,
  value            text NOT NULL,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("flagId", idx),
  UNIQUE ("flagId", value)
);
SELECT "Company"."addStandardTriggers"('"Platform"."FlagVariations"', true);
COMMENT ON TABLE "Platform"."FlagVariations" IS 'Variations served by a flag; values unique per flag.';

-- FlagEnvironments — flag × Dev/Staging/Production (env dots D·S·P, Production switch)
CREATE TABLE "Platform"."FlagEnvironments" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "flagId"          uuid NOT NULL REFERENCES "Platform"."FeatureFlags"(id),
  environment      text NOT NULL,
  "isOn"            boolean NOT NULL DEFAULT false,                  -- targeting on; off → everyone gets the off variation
  "lastEvaluatedAt" timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("flagId", environment),
  UNIQUE (id, "flagId")                                              -- target for composite FKs below
);
SELECT "Company"."addStandardTriggers"('"Platform"."FlagEnvironments"', true);
COMMENT ON TABLE "Platform"."FlagEnvironments" IS 'Per-environment state of a flag. Production changes go through FlagChangeRequests (kill switches excepted).';

-- FlagDefaultRules — section 3 "Default rule" (percentage rollout or a fixed variation) and "Off variation"
CREATE TABLE "Platform"."FlagDefaultRules" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "flagEnvironmentId" uuid NOT NULL UNIQUE,
  "flagId"          uuid NOT NULL,
  "defaultRule"     text NOT NULL DEFAULT 'ROLLOUT',
  "defaultVariationIdx" smallint,                                   -- when defaultRule = VARIATION
  "rolloutPct"      smallint CHECK ("rolloutPct" BETWEEN 0 AND 100),  -- when defaultRule = ROLLOUT
  "rolloutVariationIdx" smallint NOT NULL DEFAULT 0,                -- variation served to buckets < pct (experiments: 1)
  "rolloutRestVariationIdx" smallint NOT NULL DEFAULT 1,           -- served to the remaining buckets
  "offVariationIdx" smallint NOT NULL DEFAULT 1,
  "bucketBy"        text NOT NULL DEFAULT 'TENANT_CODE',
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "flagTargetingEnvFk" FOREIGN KEY ("flagEnvironmentId", "flagId") REFERENCES "Platform"."FlagEnvironments" (id, "flagId"),
  CONSTRAINT "flagTargetingDefaultVarFk" FOREIGN KEY ("flagId", "defaultVariationIdx") REFERENCES "Platform"."FlagVariations" ("flagId", idx),
  CONSTRAINT "flagTargetingRolloutVarFk" FOREIGN KEY ("flagId", "rolloutVariationIdx") REFERENCES "Platform"."FlagVariations" ("flagId", idx),
  CONSTRAINT "flagTargetingRestVarFk" FOREIGN KEY ("flagId", "rolloutRestVariationIdx") REFERENCES "Platform"."FlagVariations" ("flagId", idx),
  CONSTRAINT "flagTargetingOffVarFk" FOREIGN KEY ("flagId", "offVariationIdx") REFERENCES "Platform"."FlagVariations" ("flagId", idx),
  CONSTRAINT "flagTargetingDefaultChk" CHECK (
       ("defaultRule" = 'ROLLOUT'   AND "rolloutPct" IS NOT NULL)
    OR ("defaultRule" = 'VARIATION' AND "defaultVariationIdx" IS NOT NULL)),
  CONSTRAINT "flagTargetingSplitChk" CHECK ("rolloutVariationIdx" <> "rolloutRestVariationIdx")
);
SELECT "Company"."addStandardTriggers"('"Platform"."FlagDefaultRules"', true);
COMMENT ON TABLE "Platform"."FlagDefaultRules" IS 'Default and off variation of a flag in one environment. Rollout: bucket < rolloutPct → rolloutVariationIdx.';

-- FlagTargets — section 1 "Individual targets" (tenant chips per variation; always win over rules)
CREATE TABLE "Platform"."FlagTargets" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "flagEnvironmentId" uuid NOT NULL,
  "flagId"          uuid NOT NULL,
  "variationIdx"    smallint NOT NULL,
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("flagEnvironmentId", "tenantId"),                          -- a tenant sits in one variation list only
  CONSTRAINT "flagTargetEnvFk" FOREIGN KEY ("flagEnvironmentId", "flagId") REFERENCES "Platform"."FlagEnvironments" (id, "flagId"),
  CONSTRAINT "flagTargetVarFk" FOREIGN KEY ("flagId", "variationIdx") REFERENCES "Platform"."FlagVariations" ("flagId", idx)
);
SELECT "Company"."addStandardTriggers"('"Platform"."FlagTargets"', true);
CREATE INDEX "flagTargetTenantIdx" ON "Platform"."FlagTargets" ("tenantId");
COMMENT ON TABLE "Platform"."FlagTargets" IS 'Tenant pinned to a variation of a flag in one environment (pilots and exceptions).';

-- FlagRules — section 2 "Rules · first match wins, drag to reorder" (IF / ELSE IF … serve variation)
CREATE TABLE "Platform"."FlagRules" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "flagEnvironmentId" uuid NOT NULL,
  "flagId"          uuid NOT NULL,
  position         smallint NOT NULL CHECK (position >= 0),
  attribute        text NOT NULL,
  operator         text NOT NULL,
  "ruleValues"      text[] NOT NULL CHECK (cardinality("ruleValues") > 0), -- SEGMENT values are segment.key
  "serveVariationIdx" smallint NOT NULL,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "flagRulePositionUq" UNIQUE ("flagEnvironmentId", position) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT "flagRuleEnvFk" FOREIGN KEY ("flagEnvironmentId", "flagId") REFERENCES "Platform"."FlagEnvironments" (id, "flagId"),
  CONSTRAINT "flagRuleVarFk" FOREIGN KEY ("flagId", "serveVariationIdx") REFERENCES "Platform"."FlagVariations" ("flagId", idx),
  CONSTRAINT "flagRuleScalarChk" CHECK (operator IN ('IN','NOT_IN') OR cardinality("ruleValues") = 1),
  CONSTRAINT "flagRuleNumericOpChk" CHECK (operator IN ('IN','NOT_IN') OR attribute IN ('AGE_DAYS','APP_VERSION'))
);
SELECT "Company"."addStandardTriggers"('"Platform"."FlagRules"', true);
CREATE INDEX "flagRuleSegmentIdx" ON "Platform"."FlagRules" USING gin ("ruleValues") WHERE attribute = 'SEGMENT';
COMMENT ON TABLE "Platform"."FlagRules" IS 'Ordered targeting rules of a flag in one environment; first matching rule serves its variation.';

-- FlagPrerequisites — "Prerequisites: this flag only evaluates when these flags serve the
-- required variation" (payroll_engine_v2 → hrms_module enabled; whatsapp_payment_reminders → whatsapp_integration = On)
CREATE TABLE "Platform"."FlagPrerequisites" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "flagEnvironmentId" uuid NOT NULL,
  "flagId"          uuid NOT NULL,
  "prerequisiteFlagId" uuid REFERENCES "Platform"."FeatureFlags"(id),
  "requiredVariationIdx" smallint,
  "prerequisiteModuleId" uuid REFERENCES "Platform"."PlatformModules"(id),   -- core module (hrms_module) must be in the tenant's plan
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "flagPrerequisiteEnvFk" FOREIGN KEY ("flagEnvironmentId", "flagId") REFERENCES "Platform"."FlagEnvironments" (id, "flagId"),
  CONSTRAINT "flagPrerequisiteVarFk" FOREIGN KEY ("prerequisiteFlagId", "requiredVariationIdx") REFERENCES "Platform"."FlagVariations" ("flagId", idx),
  CONSTRAINT "flagPrerequisiteOneChk" CHECK (
       ("prerequisiteFlagId" IS NOT NULL AND "requiredVariationIdx" IS NOT NULL AND "prerequisiteModuleId" IS NULL)
    OR ("prerequisiteFlagId" IS NULL AND "requiredVariationIdx" IS NULL AND "prerequisiteModuleId" IS NOT NULL)),
  CONSTRAINT "flagPrerequisiteSelfChk" CHECK ("prerequisiteFlagId" IS DISTINCT FROM "flagId")
);
SELECT "Company"."addStandardTriggers"('"Platform"."FlagPrerequisites"', true);
CREATE UNIQUE INDEX "flagPrerequisiteFlagUq" ON "Platform"."FlagPrerequisites" ("flagEnvironmentId", "prerequisiteFlagId") WHERE "prerequisiteFlagId" IS NOT NULL;
CREATE UNIQUE INDEX "flagPrerequisiteModuleUq" ON "Platform"."FlagPrerequisites" ("flagEnvironmentId", "prerequisiteModuleId") WHERE "prerequisiteModuleId" IS NOT NULL;
COMMENT ON TABLE "Platform"."FlagPrerequisites" IS 'Prerequisite flag (must serve a variation) or core module; failing → off variation. Evaluated first.';

-- FlagChangeRequests — admin/change-requests cards and drawer (CR-1042: diff, reason,
-- approvers "Needs 1 of N", discussion, second-approver note, Approve & apply / Reject)
CREATE TABLE "Platform"."FlagChangeRequests" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "docNo"           text NOT NULL UNIQUE CHECK ("docNo" ~ '^CR-\d+$'),  -- Platform.getNextPlatformDocumentNo('CR')
  "flagId"          uuid NOT NULL REFERENCES "Platform"."FeatureFlags"(id),
  environment      text NOT NULL DEFAULT 'PRODUCTION',
  "requesterStaffId" uuid NOT NULL REFERENCES "Platform"."PlatformStaff"(id),
  reason           text NOT NULL CHECK (length(trim(reason)) > 0),  -- "Why now, what you checked, and how to roll back"
  summary          text NOT NULL,                                   -- "Rollout 50% → 75%", "+1 rule", "Turn targeting ON"
  "beforeState"     jsonb NOT NULL,                                  -- targeting snapshot (targeting.json diff, left)
  "afterState"      jsonb NOT NULL,                                  -- targeting snapshot (right)
  patch            jsonb NOT NULL,                                  -- full new targeting applied on approval
  "applyNotBefore" timestamptz,                                     -- "Apply automatically once approved, but not before 22:00 PKT"
  source           text NOT NULL DEFAULT 'MANUAL',
  status           text NOT NULL DEFAULT 'PENDING',
  "decidedByStaffId" uuid REFERENCES "Platform"."PlatformStaff"(id),
  "decidedAt"       timestamptz,
  "decisionNote"    text,                                            -- second-approver note (required)
  "appliedAt"       timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "flagChangeRequestFourEyesChk" CHECK ("decidedByStaffId" IS DISTINCT FROM "requesterStaffId"),
  CONSTRAINT "flagChangeRequestDecisionChk" CHECK (
       status NOT IN ('APPROVED','REJECTED')
    OR ("decidedByStaffId" IS NOT NULL AND "decidedAt" IS NOT NULL AND length(trim(COALESCE("decisionNote", ''))) > 0)),
  CONSTRAINT "flagChangeRequestAppliedChk" CHECK ("appliedAt" IS NULL OR status = 'APPROVED')
);
SELECT "Company"."addStandardTriggers"('"Platform"."FlagChangeRequests"', true);
CREATE UNIQUE INDEX "flagChangeRequestOnePending" ON "Platform"."FlagChangeRequests" ("flagId", environment) WHERE status = 'PENDING';
CREATE INDEX "flagChangeRequestStatusIdx" ON "Platform"."FlagChangeRequests" (status, "createdAt" DESC);
COMMENT ON TABLE "Platform"."FlagChangeRequests" IS 'Four-eyes approval of a protected-environment change: one pending CR per flag × environment; requester can never decide.';

-- FlagChangeRequestApprovers — reviewers picked in the request modal ("Approvers", avatar stack)
CREATE TABLE "Platform"."FlagChangeRequestApprovers" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "changeRequestId" uuid NOT NULL REFERENCES "Platform"."FlagChangeRequests"(id),
  "staffUserId"    uuid NOT NULL REFERENCES "Platform"."PlatformStaff"(id),
  decision         text NOT NULL DEFAULT 'WAITING',
  "decidedAt"       timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("changeRequestId", "staffUserId"),
  CONSTRAINT "crApproverDecidedChk" CHECK ((decision = 'WAITING') = ("decidedAt" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"Platform"."FlagChangeRequestApprovers"', true);
CREATE INDEX "crApproverStaffIdx" ON "Platform"."FlagChangeRequestApprovers" ("staffUserId", decision);
COMMENT ON TABLE "Platform"."FlagChangeRequestApprovers" IS 'Requested reviewers of a change request; any one approval applies it. The requester cannot be an approver (trigger).';

-- FlagChangeRequestComments — "Discussion" thread in the CR drawer
CREATE TABLE "Platform"."FlagChangeRequestComments" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "changeRequestId" uuid NOT NULL REFERENCES "Platform"."FlagChangeRequests"(id),
  "staffUserId"    uuid NOT NULL REFERENCES "Platform"."PlatformStaff"(id),
  body             text NOT NULL CHECK (length(trim(body)) > 0),
  "postedAt"        timestamptz NOT NULL DEFAULT now(),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0
);
SELECT "Company"."addStandardTriggers"('"Platform"."FlagChangeRequestComments"');
CREATE INDEX "crCommentCrIdx" ON "Platform"."FlagChangeRequestComments" ("changeRequestId", "postedAt");
COMMENT ON TABLE "Platform"."FlagChangeRequestComments" IS 'Comments on a change request.';

-- FlagScheduledChanges — "Scheduled changes" ramp (15 Sep 10% → 24 Sep 50% → 08 Oct 75% → 22 Oct 100%);
-- each step opens a change request on its date
CREATE TABLE "Platform"."FlagScheduledChanges" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "flagId"          uuid NOT NULL REFERENCES "Platform"."FeatureFlags"(id),
  environment      text NOT NULL DEFAULT 'PRODUCTION',
  "stepDate"        date NOT NULL,
  "rolloutPct"      smallint NOT NULL CHECK ("rolloutPct" BETWEEN 0 AND 100),
  status           text NOT NULL DEFAULT 'PLANNED',
  "changeRequestId" uuid REFERENCES "Platform"."FlagChangeRequests"(id),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("flagId", environment, "stepDate"),
  CONSTRAINT "flagScheduleStepCrChk" CHECK (status NOT IN ('REQUESTED','APPLIED') OR "changeRequestId" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Platform"."FlagScheduledChanges"', true);
CREATE INDEX "flagScheduleStepDueIdx" ON "Platform"."FlagScheduledChanges" ("stepDate") WHERE status = 'PLANNED';
COMMENT ON TABLE "Platform"."FlagScheduledChanges" IS 'Planned rollout-percentage ramp; applied steps are locked.';

-- FlagAuditLogs — flag detail "Audit log · every change with a before / after diff". Append-only.
CREATE TABLE "Platform"."FlagAuditLogs" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "flagId"          uuid NOT NULL REFERENCES "Platform"."FeatureFlags"(id),
  environment      text NOT NULL,
  "occurredAt"      timestamptz NOT NULL DEFAULT now(),
  "staffUserId"    uuid REFERENCES "Platform"."PlatformStaff"(id),
  "eventKind"       text NOT NULL,
  summary          text NOT NULL,                                   -- "Rollout 25% → 50%", "Lifecycle Develop → Production"
  "beforeState"     jsonb NOT NULL DEFAULT '{}',
  "afterState"      jsonb NOT NULL DEFAULT '{}',
  "changeRequestId" uuid REFERENCES "Platform"."FlagChangeRequests"(id),   -- "via CR-1042"
  "isEmergency"     boolean NOT NULL DEFAULT false,                  -- kill switch flipped in Production without approval
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0
);
SELECT "Company"."addStandardTriggers"('"Platform"."FlagAuditLogs"');
CREATE TRIGGER "platformFlagAuditAppendOnly" BEFORE UPDATE OR DELETE ON "Platform"."FlagAuditLogs"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();
CREATE INDEX "flagAuditFlagIdx" ON "Platform"."FlagAuditLogs" ("flagId", "occurredAt" DESC);
COMMENT ON TABLE "Platform"."FlagAuditLogs" IS 'Append-only change history of a flag with JSON before/after (rendered as a line diff).';

-- FlagDailyEvaluations — "Evaluation insights · evaluations per day, last 14 days" and "evals / 24h"
CREATE TABLE "Platform"."FlagDailyEvaluations" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "flagId"          uuid NOT NULL REFERENCES "Platform"."FeatureFlags"(id),
  environment      text NOT NULL,
  "evalDate"        date NOT NULL,
  "variationIdx"    smallint NOT NULL,
  "evaluationCount" bigint NOT NULL DEFAULT 0 CHECK ("evaluationCount" >= 0),
  "errorCount"      bigint NOT NULL DEFAULT 0 CHECK ("errorCount" >= 0),
  "p95LatencyMs"   numeric(9,2) CHECK ("p95LatencyMs" >= 0),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("flagId", environment, "evalDate", "variationIdx"),
  CONSTRAINT "flagEvalDailyVarFk" FOREIGN KEY ("flagId", "variationIdx") REFERENCES "Platform"."FlagVariations" ("flagId", idx),
  CONSTRAINT "flagEvalDailyErrorsChk" CHECK ("errorCount" <= "evaluationCount")
);
SELECT "Company"."addStandardTriggers"('"Platform"."FlagDailyEvaluations"');
COMMENT ON TABLE "Platform"."FlagDailyEvaluations" IS 'Daily SDK evaluation counts per flag × environment × variation, rolled up from the evaluation stream.';

-- FlagCodeReferences — "Code references · found by the nightly scan of 3 repos"
CREATE TABLE "Platform"."FlagCodeReferences" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "flagId"          uuid NOT NULL REFERENCES "Platform"."FeatureFlags"(id),
  repository       text NOT NULL,                                   -- finsoft-web / finsoft-api / finsoft-mobile
  "filePath"        text NOT NULL,                                   -- apps/web/src/screens/sales/wholesaleQuickEntryGrid.tsx
  "lineNo"          integer NOT NULL CHECK ("lineNo" > 0),
  snippet          text,                                            -- const on = useFlag('wholesale_quick_entry_grid')
  "scannedAt"       timestamptz NOT NULL DEFAULT now(),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("flagId", repository, "filePath", "lineNo")
);
SELECT "Company"."addStandardTriggers"('"Platform"."FlagCodeReferences"');
COMMENT ON TABLE "Platform"."FlagCodeReferences" IS 'Where a flag key is referenced in code (replaced wholesale by each nightly scan).';

-- FlagSdkKeys — admin/features "SDK keys" tab: Server-side key (secret), Client-side ID, Mobile key per environment;
-- rotation keeps the old key valid for 24 hours
CREATE TABLE "Platform"."FlagSdkKeys" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment      text NOT NULL,
  kind             text NOT NULL,
  "keyPrefix"       text NOT NULL,                                   -- 'sdk-prod-' / 'mob-prod-'
  "keyHash"         text,                                            -- sha256 for SERVER / MOBILE (secret)
  "clientId"        text,                                            -- CLIENT only: safe in the browser bundle
  "keyLast4"        text NOT NULL,
  status           text NOT NULL DEFAULT 'ACTIVE',
  "validUntil"      timestamptz,                                     -- GRACE: old key works until rotation + 24 h
  "rotatedFromId"  uuid REFERENCES "Platform"."FlagSdkKeys"(id),
  "rotatedByStaffId" uuid REFERENCES "Platform"."PlatformStaff"(id),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "sdkKeySecretChk" CHECK ((kind = 'CLIENT' AND "clientId" IS NOT NULL) OR (kind <> 'CLIENT' AND "keyHash" IS NOT NULL)),
  CONSTRAINT "sdkKeyGraceChk" CHECK (status <> 'GRACE' OR "validUntil" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Platform"."FlagSdkKeys"', true);
CREATE UNIQUE INDEX "sdkKeyOneActive" ON "Platform"."FlagSdkKeys" (environment, kind) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX "sdkKeyHashUq" ON "Platform"."FlagSdkKeys" ("keyHash") WHERE "keyHash" IS NOT NULL;
COMMENT ON TABLE "Platform"."FlagSdkKeys" IS 'Flag SDK credentials per environment × kind. Rotation inserts a new ACTIVE key and moves the old one to GRACE for 24 h.';

-- EntitlementChangeLogs — admin/entitlements "Review entitlement changes" drawer
-- (tenants affected, grandfather until renewal, email owners, post to changelog). Append-only.
CREATE TABLE "Platform"."EntitlementChangeLogs" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "changeSetId"    uuid NOT NULL,                                   -- one "Save entitlements" click
  "changeKind"      text NOT NULL,
  "planId"          uuid REFERENCES "Platform"."SubscriptionPlans"(id),
  "platformModuleId" uuid REFERENCES "Platform"."PlatformModules"(id),
  "usageMeterId"   uuid REFERENCES "Platform"."UsageMeters"(id),
  "addonId"         uuid REFERENCES "Platform"."Addons"(id),
  "fromValue"       jsonb,                                           -- true/false, 25, null (= ∞), 2500
  "toValue"         jsonb,
  "tenantsAffected" integer NOT NULL DEFAULT 0 CHECK ("tenantsAffected" >= 0),
  "impactTone"      text,
  "grandfatherUntilRenewal" boolean NOT NULL DEFAULT false,
  "emailOwners"     boolean NOT NULL DEFAULT true,
  "postChangelog"   boolean NOT NULL DEFAULT false,
  "savedByStaffId" uuid NOT NULL REFERENCES "Platform"."PlatformStaff"(id),
  "savedAt"         timestamptz NOT NULL DEFAULT now(),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "entitlementChangeLogTargetChk" CHECK (
       ("changeKind" = 'FEATURE'     AND "planId" IS NOT NULL AND "platformModuleId" IS NOT NULL)
    OR ("changeKind" = 'LIMIT'       AND "planId" IS NOT NULL AND "usageMeterId" IS NOT NULL)
    OR ("changeKind" = 'ADDON_PRICE' AND "addonId" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Platform"."EntitlementChangeLogs"');
CREATE TRIGGER "platformEntitlementChangeLogAppendOnly" BEFORE UPDATE OR DELETE ON "Platform"."EntitlementChangeLogs"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();
CREATE INDEX "entitlementChangeLogSetIdx" ON "Platform"."EntitlementChangeLogs" ("changeSetId");
CREATE INDEX "entitlementChangeLogTimeIdx" ON "Platform"."EntitlementChangeLogs" ("savedAt" DESC);
COMMENT ON TABLE "Platform"."EntitlementChangeLogs" IS 'Append-only record of plan feature / limit / add-on price changes and how affected tenants were handled.';

-- =============================================================================
-- B9. Support, notes, impersonation, announcements, communications —
--     admin/support, admin/tenants/view, admin/announcements, admin/comms
-- =============================================================================

-- SupportTickets — admin/support Kanban (New · In progress · Waiting on customer · Resolved) and ticket drawer
CREATE TABLE "Platform"."SupportTickets" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "docNo"           text NOT NULL UNIQUE CHECK ("docNo" ~ '^TCK-\d{4,}$'),   -- Platform.getNextPlatformDocumentNo('TCK')
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  subject          text NOT NULL,                                   -- "FBR POS invoices not syncing"
  category         text NOT NULL DEFAULT 'GENERAL',
  priority         text NOT NULL DEFAULT 'NORMAL',
  status           text NOT NULL DEFAULT 'NEW',
  channel          text NOT NULL DEFAULT 'PORTAL',
  "requesterUserId" uuid,                                           -- Company.Users.id of the tenant user (no FK: tenant table)
  "requesterName"   text NOT NULL,                                   -- "Sana Javed"
  "requesterRole"   text,                                            -- "Finance Manager"
  "requesterEmail"  citext,
  "assigneeStaffId" uuid REFERENCES "Platform"."PlatformStaff"(id),
  "openedAt"        timestamptz NOT NULL DEFAULT now(),
  "firstResponseAt" timestamptz,
  "slaDueAt"       timestamptz,                                     -- Urgent 2h · High 4h · Normal 8h · Low 24h (trigger)
  "resolvedAt"      timestamptz,
  "closedAt"        timestamptz,
  "csatRating"      smallint CHECK ("csatRating" BETWEEN 1 AND 5),    -- ★★★★★
  "csatComment"     text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "supportTicketResolvedChk" CHECK (status NOT IN ('RESOLVED','CLOSED') OR "resolvedAt" IS NOT NULL),
  CONSTRAINT "supportTicketResponseChk" CHECK ("firstResponseAt" IS NULL OR "firstResponseAt" >= "openedAt")
);
SELECT "Company"."addStandardTriggers"('"Platform"."SupportTickets"', true);
CREATE INDEX "supportTicketBoardIdx" ON "Platform"."SupportTickets" (status, priority, "openedAt" DESC);
CREATE INDEX "supportTicketTenantIdx" ON "Platform"."SupportTickets" ("tenantId", "openedAt" DESC);
CREATE INDEX "supportTicketAssigneeIdx" ON "Platform"."SupportTickets" ("assigneeStaffId", status);
COMMENT ON TABLE "Platform"."SupportTickets" IS 'Customer issues across tenants. SLA due time is set from priority; breach = now() > slaDueAt before first response/resolution.';

-- SupportTicketMessages — conversation in the ticket drawer, incl. "Internal note" and "Attach"
CREATE TABLE "Platform"."SupportTicketMessages" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticketId"        uuid NOT NULL REFERENCES "Platform"."SupportTickets"(id),
  "authorKind"      text NOT NULL,
  "authorStaffId"  uuid REFERENCES "Platform"."PlatformStaff"(id),
  "authorUserId"   uuid,                                            -- Company.Users.id (no FK)
  "authorName"      text NOT NULL,
  body             text NOT NULL,
  "isInternalNote" boolean NOT NULL DEFAULT false,                  -- never shown to the tenant
  attachments      jsonb NOT NULL DEFAULT '[]',                     -- [{"name","size","storageKey"}]
  "postedAt"        timestamptz NOT NULL DEFAULT now(),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "ticketMessageStaffChk" CHECK ("authorKind" <> 'STAFF' OR "authorStaffId" IS NOT NULL),
  CONSTRAINT "ticketMessageNoteChk" CHECK (NOT "isInternalNote" OR "authorKind" = 'STAFF')
);
SELECT "Company"."addStandardTriggers"('"Platform"."SupportTicketMessages"');
CREATE INDEX "ticketMessageTicketIdx" ON "Platform"."SupportTicketMessages" ("ticketId", "postedAt");
COMMENT ON TABLE "Platform"."SupportTicketMessages" IS 'Messages on a support ticket; internal notes are staff-only.';

-- TenantNotes — helper (not in §5): Tenant 360 "Notes · visible to platform staff only"
CREATE TABLE "Platform"."TenantNotes" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "authorStaffId"  uuid NOT NULL REFERENCES "Platform"."PlatformStaff"(id),
  body             text NOT NULL CHECK (length(trim(body)) > 0),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz
);
SELECT "Company"."addStandardTriggers"('"Platform"."TenantNotes"');
CREATE INDEX "tenantNoteTenantIdx" ON "Platform"."TenantNotes" ("tenantId", "createdAt" DESC);
COMMENT ON TABLE "Platform"."TenantNotes" IS 'Internal account notes on a tenant (never visible to the tenant).';

-- ImpersonationSessions — Tenant 360 "Impersonate a user" (sign in as, linked ticket, reason,
-- 30/60-min limit, read-only) and the impersonation bar; mirrored to audit_log impersonation.start/end
CREATE TABLE "Platform"."ImpersonationSessions" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "staffUserId"    uuid NOT NULL REFERENCES "Platform"."PlatformStaff"(id),
  "targetUserId"   uuid NOT NULL,                                   -- Company.Users.id (no FK: tenant table; see report)
  "targetUserLabel" text NOT NULL,                                  -- "Sana Javed · Finance Manager"
  "supportTicketId" uuid REFERENCES "Platform"."SupportTickets"(id),   -- "Linked ticket TCK-2291"
  reason           text NOT NULL CHECK (length(trim(reason)) > 0),
  "timeLimitMinutes" smallint NOT NULL DEFAULT 30 CHECK ("timeLimitMinutes" IN (30, 60)),
  "isReadOnly"     boolean NOT NULL DEFAULT true,                   -- "block posting and deletes"
  "startedAt"       timestamptz NOT NULL DEFAULT now(),
  "expiresAt"       timestamptz NOT NULL,
  "endedAt"         timestamptz,
  "endReason"       text,
  "ownerEmailedAt" timestamptz,                                     -- "The owner also gets an email"
  "recordingRef"    text,                                            -- "session recording saved to audit log"
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "impersonationSessionExpiryChk" CHECK ("expiresAt" > "startedAt"),
  CONSTRAINT "impersonationSessionEndChk" CHECK (("endedAt" IS NULL) = ("endReason" IS NULL) AND ("endedAt" IS NULL OR "endedAt" >= "startedAt"))
);
SELECT "Company"."addStandardTriggers"('"Platform"."ImpersonationSessions"', true);
CREATE INDEX "impersonationSessionTenantIdx" ON "Platform"."ImpersonationSessions" ("tenantId", "startedAt" DESC);
CREATE INDEX "impersonationSessionStaffIdx" ON "Platform"."ImpersonationSessions" ("staffUserId", "startedAt" DESC);
CREATE UNIQUE INDEX "impersonationSessionOneLive" ON "Platform"."ImpersonationSessions" ("staffUserId") WHERE "endedAt" IS NULL;
COMMENT ON TABLE "Platform"."ImpersonationSessions" IS 'Time-boxed, reasoned, recorded staff sign-in as a tenant user. Tenant users see a banner for the whole session.';

-- MaintenanceWindows — admin/status "Schedule maintenance" + "Upcoming windows"; admin/announcements Maintenance
CREATE TABLE "Platform"."MaintenanceWindows" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL DEFAULT 'Planned maintenance',     -- "PostgreSQL 17 upgrade"
  message          text,                                            -- "What tenants should know"
  "startsAt"        timestamptz NOT NULL,
  "endsAt"          timestamptz NOT NULL,
  components       text[] NOT NULL CHECK (cardinality(components) > 0 AND components <@ ARRAY[
                     'WEB_APP','PUBLIC_API','FBR_PRAL_GATEWAY','PRA_SRB_EINVOICING','PAYROLL_ENGINE',
                     'EMAIL_SMS','BANK_FEEDS_RAAST','BACKUPS_DR']::text[]),
  "bannerLeadHours" smallint NOT NULL DEFAULT 72 CHECK ("bannerLeadHours" IN (1, 24, 72)),
  "readOnlyMode"   boolean NOT NULL DEFAULT false,                  -- toggles flag maintenance_read_only_mode
  status           text NOT NULL DEFAULT 'SCHEDULED',
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "maintenanceWindowTimeChk" CHECK ("endsAt" > "startsAt")
);
SELECT "Company"."addStandardTriggers"('"Platform"."MaintenanceWindows"', true);
CREATE INDEX "maintenanceWindowUpcomingIdx" ON "Platform"."MaintenanceWindows" ("startsAt") WHERE status = 'SCHEDULED';
COMMENT ON TABLE "Platform"."MaintenanceWindows" IS 'Planned maintenance; tenants get an in-app banner bannerLeadHours before and an email.';

-- announcement — admin/announcements cards and "Compose announcement" modal
CREATE TABLE "Platform"."Announcements" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "announcementType" text NOT NULL,
  severity         text NOT NULL DEFAULT 'INFO',
  "releaseLabel"    text,                                            -- "Release 4.12"
  title            text NOT NULL,
  message          text NOT NULL,
  audience         text NOT NULL DEFAULT 'ALL',  -- targets in AnnouncementTargets
  "publishAt"       timestamptz,
  status           text NOT NULL DEFAULT 'DRAFT',
  "showBanner"      boolean NOT NULL DEFAULT true,
  "emailAdmins"     boolean NOT NULL DEFAULT true,
  "viewCount"       bigint NOT NULL DEFAULT 0 CHECK ("viewCount" >= 0),     -- "3,128 views"
  "clickCount"      bigint NOT NULL DEFAULT 0 CHECK ("clickCount" >= 0),    -- "842 clicks"
  "maintenanceWindowId" uuid REFERENCES "Platform"."MaintenanceWindows"(id),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "announcementScheduleChk" CHECK (status NOT IN ('SCHEDULED','PUBLISHED') OR "publishAt" IS NOT NULL),
  CONSTRAINT "announcementChannelChk" CHECK ("showBanner" OR "emailAdmins")
);
SELECT "Company"."addStandardTriggers"('"Platform"."Announcements"', true);
CREATE INDEX "announcementStatusIdx" ON "Platform"."Announcements" (status, "publishAt" DESC);
COMMENT ON TABLE "Platform"."Announcements" IS 'In-app banners and emails to tenant users (release notes, maintenance, compliance, billing).';

-- AnnouncementTargets — audience "Growth and above" (plans), "Payroll module users" (module), "Specific tenants…"
CREATE TABLE "Platform"."AnnouncementTargets" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "announcementId"  uuid NOT NULL REFERENCES "Platform"."Announcements"(id),
  "planId"          uuid REFERENCES "Platform"."SubscriptionPlans"(id),
  "moduleKey"       text,
  "tenantId"        uuid REFERENCES "Platform"."Tenants"(id),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "announcementTargetOneChk" CHECK (num_nonnulls("planId", "moduleKey", "tenantId") = 1)
);
SELECT "Company"."addStandardTriggers"('"Platform"."AnnouncementTargets"');
CREATE UNIQUE INDEX "announcementTargetPlanUq" ON "Platform"."AnnouncementTargets" ("announcementId", "planId") WHERE "planId" IS NOT NULL;
CREATE UNIQUE INDEX "announcementTargetModuleUq" ON "Platform"."AnnouncementTargets" ("announcementId", "moduleKey") WHERE "moduleKey" IS NOT NULL;
CREATE UNIQUE INDEX "announcementTargetTenantUq" ON "Platform"."AnnouncementTargets" ("announcementId", "tenantId") WHERE "tenantId" IS NOT NULL;
COMMENT ON TABLE "Platform"."AnnouncementTargets" IS 'One audience element (plan, module or tenant) of an announcement; matching any element includes the tenant.';

-- CommunicationTemplates — admin/comms "Templates · 6 lifecycle messages" editor (EN/UR, subject, body, merge variables)
CREATE TABLE "Platform"."CommunicationTemplates" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),   -- WELCOME, TRIAL_ENDING, INVOICE, PAYMENT_FAILED, PASSWORD_RESET, MAINTENANCE
  name             text NOT NULL,
  icon             text,
  channels         text[] NOT NULL CHECK (cardinality(channels) > 0 AND channels <@ ARRAY['EMAIL','SMS','WHATSAPP']::text[]),
  -- merge variables: {{owner_name}} {{tenant_name}} {{plan}} {{amount}} {{dueDate}} {{trialDays}} {{invoice_no}} {{login_url}}
  "subjectEn"       text NOT NULL,
  "bodyEn"          text NOT NULL,
  "subjectUr"       text,
  "bodyUr"          text,                                            -- rendered right-to-left (Noto Nastaliq Urdu)
  version          integer NOT NULL DEFAULT 1 CHECK (version > 0),  -- "Saved · v12"
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "commTemplateUrduChk" CHECK (("subjectUr" IS NULL) = ("bodyUr" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"Platform"."CommunicationTemplates"', true);
COMMENT ON TABLE "Platform"."CommunicationTemplates" IS 'Lifecycle message templates in English and Urdu for email, SMS and WhatsApp. SMS segments: 160 chars EN, 70 chars UR.';

-- TenantBroadcasts — helper (not in §5): admin/comms "Broadcast to a segment" and the tenants bulk "Send notice"
CREATE TABLE "Platform"."TenantBroadcasts" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "commTemplateId" uuid REFERENCES "Platform"."CommunicationTemplates"(id),
  audience         text NOT NULL,
  "audienceValue"   text,                                            -- plan code / province for PLAN / REGION
  "segmentId"       uuid REFERENCES "Platform"."TenantSegments"(id),
  "tenantIds"       uuid[],                                          -- SELECTED_TENANTS (bulk "Send notice")
  "languageMode"    text NOT NULL DEFAULT 'TENANT_PREFERENCE',
  channels         text[] NOT NULL CHECK (cardinality(channels) > 0 AND channels <@ ARRAY['EMAIL','SMS','WHATSAPP','IN_APP']::text[]),
  "messageOverride" text,                                            -- custom message (Send notice)
  "scheduledAt"     timestamptz NOT NULL DEFAULT now(),              -- Now / Tonight 20:00 PKT / Tomorrow 10:00 PKT
  status           text NOT NULL DEFAULT 'SCHEDULED',
  "recipientsCount" integer CHECK ("recipientsCount" >= 0),
  "estimatedSmsCost" numeric(18,2) CHECK ("estimatedSmsCost" >= 0),
  "sentByStaffId" uuid NOT NULL REFERENCES "Platform"."PlatformStaff"(id),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "commBroadcastAudienceChk" CHECK (
       (audience = 'SEGMENT' AND "segmentId" IS NOT NULL)
    OR (audience = 'SELECTED_TENANTS' AND COALESCE(cardinality("tenantIds"), 0) > 0)
    OR (audience IN ('PLAN','REGION') AND "audienceValue" IS NOT NULL)
    OR audience IN ('ALL_ACTIVE','TRIALS','PAST_DUE','ENTERPRISE_OWNERS')),
  CONSTRAINT "commBroadcastBodyChk" CHECK ("commTemplateId" IS NOT NULL OR "messageOverride" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Platform"."TenantBroadcasts"', true);
CREATE INDEX "commBroadcastStatusIdx" ON "Platform"."TenantBroadcasts" (status, "scheduledAt");
COMMENT ON TABLE "Platform"."TenantBroadcasts" IS 'A bulk send to owners and billing contacts of a tenant audience; expands into CommunicationLogs rows.';

-- CommunicationLogs — admin/comms "Delivery log · last 24 hours" (Time, Template, Tenant, Recipient, Channel, Status, Retry)
CREATE TABLE "Platform"."CommunicationLogs" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "commTemplateId" uuid REFERENCES "Platform"."CommunicationTemplates"(id),
  "commBroadcastId" uuid REFERENCES "Platform"."TenantBroadcasts"(id),
  "tenantId"        uuid REFERENCES "Platform"."Tenants"(id),             -- NULL for staff tests
  recipient        text NOT NULL,                                   -- accounts@alnoor.com.pk / 0300 4412 918
  channel          text NOT NULL,
  language         text NOT NULL DEFAULT 'EN',
  subject          text,
  body             text,                                            -- rendered with merge values
  status           text NOT NULL DEFAULT 'QUEUED',
  provider         text,                                            -- SES / backup SMTP (SES Mumbai) / Jazz / Telenor / WhatsApp Cloud
  "providerMessageId" text,
  "errorMessage"    text,
  "sentAt"          timestamptz,
  "deliveredAt"     timestamptz,
  "openedAt"        timestamptz,
  "costAmount"      numeric(18,4) CHECK ("costAmount" >= 0),          -- "Rs 0.62 blended cost per SMS"
  "isTest"          boolean NOT NULL DEFAULT false,                  -- "Send test"
  "retryOfId"      uuid REFERENCES "Platform"."CommunicationLogs"(id),
  "relatedDocType" text,
  "relatedDocId"   uuid,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "commLogFailedChk" CHECK (status NOT IN ('BOUNCED','FAILED') OR "errorMessage" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Platform"."CommunicationLogs"');
CREATE INDEX "commLogTimeIdx" ON "Platform"."CommunicationLogs" ("createdAt" DESC);
CREATE INDEX "commLogTenantIdx" ON "Platform"."CommunicationLogs" ("tenantId", "createdAt" DESC);
CREATE INDEX "commLogStatusIdx" ON "Platform"."CommunicationLogs" (status, "createdAt" DESC);
COMMENT ON TABLE "Platform"."CommunicationLogs" IS 'Every platform message sent to tenants (dunning reminders, lifecycle, broadcasts, tests) with delivery tracking.';

-- =============================================================================
-- B10. Operations: privacy, incidents, queues, backups, API & webhooks —
--      admin/security, admin/status, admin/system, admin/integrations
-- =============================================================================

-- PrivacyRequests — admin/security "Privacy requests" (PRV-2026-029; Export / Delete;
-- Received → Verified → Approved → Processing → Done; 30-day deadline; deletion needs two approvers)
CREATE TABLE "Platform"."PrivacyRequests" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "docNo"           text NOT NULL UNIQUE CHECK ("docNo" ~ '^PRV-\d{4}-\d{3,}$'),   -- Platform.getNextPlatformDocumentNo('PRV')
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "requestType"     text NOT NULL,
  "requestedByName" text NOT NULL,                                  -- "Haji Rahim"
  "requestedByRole" text,                                           -- "Owner", "Accountant", "Ex-employee"
  "requesterEmail"  citext,
  "receivedOn"      date NOT NULL,
  "dueOn"           date NOT NULL,                                   -- receivedOn + 30 (statutory)
  step             text NOT NULL DEFAULT 'RECEIVED',
  "verifiedByStaffId" uuid REFERENCES "Platform"."PlatformStaff"(id),
  "verifiedAt"      timestamptz,
  "approver1StaffId" uuid REFERENCES "Platform"."PlatformStaff"(id),
  "approved1At"     timestamptz,
  "approver2StaffId" uuid REFERENCES "Platform"."PlatformStaff"(id),
  "approved2At"     timestamptz,
  "rejectedReason"  text,
  "rejectedAt"      timestamptz,
  "completedAt"     timestamptz,
  "certificateRef"  text,                                            -- signed completion / deletion certificate PDF
  "exportBackupRunId" uuid,                                        -- export archive (FK added after BackupRuns)
  "exportLinkExpiresAt" timestamptz,                               -- "link valid 7 days"
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "privacyRequestDueChk" CHECK ("dueOn" >= "receivedOn"),
  CONSTRAINT "privacyRequestTwoPeopleChk" CHECK ("approver2StaffId" IS NULL OR "approver2StaffId" <> "approver1StaffId"),
  CONSTRAINT "privacyRequestVerifiedChk" CHECK (step IN ('RECEIVED','REJECTED') OR "verifiedAt" IS NOT NULL),
  CONSTRAINT "privacyRequestApprovedChk" CHECK (step NOT IN ('APPROVED','PROCESSING','DONE') OR "approver1StaffId" IS NOT NULL),
  CONSTRAINT "privacyRequestDeleteChk" CHECK ("requestType" <> 'DELETE' OR step NOT IN ('APPROVED','PROCESSING','DONE') OR "approver2StaffId" IS NOT NULL),
  CONSTRAINT "privacyRequestDoneChk" CHECK (step <> 'DONE' OR "completedAt" IS NOT NULL),
  CONSTRAINT "privacyRequestRejectedChk" CHECK (step <> 'REJECTED' OR "rejectedReason" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Platform"."PrivacyRequests"', true);
CREATE INDEX "privacyRequestOpenIdx" ON "Platform"."PrivacyRequests" ("dueOn") WHERE step NOT IN ('DONE','REJECTED');
CREATE INDEX "privacyRequestTenantIdx" ON "Platform"."PrivacyRequests" ("tenantId", "receivedOn" DESC);
COMMENT ON TABLE "Platform"."PrivacyRequests" IS 'Tenant data export / deletion requests under PECA 2016 / PDPB draft; deletion requires two distinct approvers.';

-- incident — admin/status incidents list and detail (INC-2026-018, impact, components,
-- Investigating → Identified → Monitoring → Resolved); "Declare incident"
CREATE TABLE "Platform"."ServiceIncidents" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "docNo"           text NOT NULL UNIQUE CHECK ("docNo" ~ '^INC-\d{4}-\d{3,}$'),   -- Platform.getNextPlatformDocumentNo('INC')
  title            text NOT NULL,
  impact           text NOT NULL,
  components       text[] NOT NULL CHECK (cardinality(components) > 0 AND components <@ ARRAY[
                     'WEB_APP','PUBLIC_API','FBR_PRAL_GATEWAY','PRA_SRB_EINVOICING','PAYROLL_ENGINE',
                     'EMAIL_SMS','BANK_FEEDS_RAAST','BACKUPS_DR']::text[]),
  stage            text NOT NULL DEFAULT 'INVESTIGATING',
  "startedAt"       timestamptz NOT NULL DEFAULT now(),
  "resolvedAt"      timestamptz,
  "isPublic"        boolean NOT NULL DEFAULT true,                   -- shown on status.finsoft.pk
  "declaredByStaffId" uuid NOT NULL REFERENCES "Platform"."PlatformStaff"(id),
  "postmortemDueOn" date,                                           -- "Post-incident review due within 5 working days"
  "postmortemRef"   text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "incidentResolvedChk" CHECK ((stage = 'RESOLVED') = ("resolvedAt" IS NOT NULL)),
  CONSTRAINT "incidentTimeChk" CHECK ("resolvedAt" IS NULL OR "resolvedAt" >= "startedAt")
);
SELECT "Company"."addStandardTriggers"('"Platform"."ServiceIncidents"', true);
CREATE INDEX "incidentOpenIdx" ON "Platform"."ServiceIncidents" ("startedAt" DESC) WHERE stage <> 'RESOLVED';
CREATE INDEX "incidentStartedIdx" ON "Platform"."ServiceIncidents" ("startedAt" DESC);
CREATE INDEX "incidentComponentsIdx" ON "Platform"."ServiceIncidents" USING gin (components);
COMMENT ON TABLE "Platform"."ServiceIncidents" IS 'Public incidents; open ones drive the status banner and component state. Uptime bars are derived per component per day.';

-- ServiceIncidentUpdates — "Post an update" composer and the update timeline
CREATE TABLE "Platform"."ServiceIncidentUpdates" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "incidentId"      uuid NOT NULL REFERENCES "Platform"."ServiceIncidents"(id),
  stage            text NOT NULL,
  message          text NOT NULL CHECK (length(trim(message)) > 0),
  "postedAt"        timestamptz NOT NULL DEFAULT now(),
  "postedByStaffId" uuid NOT NULL REFERENCES "Platform"."PlatformStaff"(id),
  "notifySubscribers" boolean NOT NULL DEFAULT true,                 -- "Email & SMS subscribers"
  "updateBanner"    boolean NOT NULL DEFAULT true,                   -- "Update in-app banner"
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0
);
SELECT "Company"."addStandardTriggers"('"Platform"."ServiceIncidentUpdates"');
CREATE INDEX "incidentUpdateIncidentIdx" ON "Platform"."ServiceIncidentUpdates" ("incidentId", "postedAt" DESC);
COMMENT ON TABLE "Platform"."ServiceIncidentUpdates" IS 'Timeline of an incident; posting an update moves incident.stage forward.';

-- JobQueueSamples — admin/system "Job queues · Sidekiq / BullMQ" (Queue, Waiting, Failed, Status)
CREATE TABLE "Platform"."JobQueueSamples" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "queueName"       text NOT NULL,                                   -- payroll, fbr-pos, reports, mail, bank-feeds, biometric-sync
  description      text,                                            -- "month-end runs"
  "sampledAt"       timestamptz NOT NULL DEFAULT now(),
  "waitingCount"    integer NOT NULL CHECK ("waitingCount" >= 0),
  "failedCount"     integer NOT NULL DEFAULT 0 CHECK ("failedCount" >= 0),
  "workerCount"     smallint CHECK ("workerCount" >= 0),
  status           text NOT NULL,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("queueName", "sampledAt")
);
SELECT "Company"."addStandardTriggers"('"Platform"."JobQueueSamples"');
CREATE INDEX "jobQueueStatLatestIdx" ON "Platform"."JobQueueSamples" ("queueName", "sampledAt" DESC);
COMMENT ON TABLE "Platform"."JobQueueSamples" IS 'Periodic samples of background job queues (latest per queue is shown).';

-- BackupRuns — admin/system "Backups" (bk-20261001-0200 Full, PK-Karachi DR, Restore-tested) and
-- Tenant 360 "Export data" (Full backup .zip / CSV per module / JSON, link valid 24 h)
CREATE TABLE "Platform"."BackupRuns" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,                            -- bk-20261001-0200 / tenant-ALNOOR-manual
  "backupType"      text NOT NULL,
  "tenantId"        uuid REFERENCES "Platform"."Tenants"(id),
  "exportFormat"    text,
  "startedAt"       timestamptz NOT NULL DEFAULT now(),
  "finishedAt"      timestamptz,
  "sizeBytes"       bigint CHECK ("sizeBytes" >= 0),
  location         text NOT NULL,                                   -- "PK-Karachi DR" / "Tenant download"
  encryption       text NOT NULL DEFAULT 'AES-256',
  verification     text NOT NULL DEFAULT 'NONE',
  status           text NOT NULL DEFAULT 'RUNNING',
  "failureMessage"  text,
  "retryOfId"      uuid REFERENCES "Platform"."BackupRuns"(id),         -- "Failed · retried 02:40 OK"
  "retentionUntil"  date,                                            -- "retained 35 days"
  "downloadExpiresAt" timestamptz,
  "notifyOwner"     boolean NOT NULL DEFAULT true,                   -- "Notify tenant owner that an export was taken"
  "requestedByStaffId" uuid REFERENCES "Platform"."PlatformStaff"(id),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "backupRunTenantChk" CHECK (("backupType" = 'TENANT_EXPORT') = ("tenantId" IS NOT NULL)),
  CONSTRAINT "backupRunFormatChk" CHECK ("backupType" <> 'TENANT_EXPORT' OR "exportFormat" IS NOT NULL),
  CONSTRAINT "backupRunDoneChk" CHECK (status = 'RUNNING' OR "finishedAt" IS NOT NULL),
  CONSTRAINT "backupRunFailedChk" CHECK (status <> 'FAILED' OR "failureMessage" IS NOT NULL),
  CONSTRAINT "backupRunTimeChk" CHECK ("finishedAt" IS NULL OR "finishedAt" >= "startedAt")
);
SELECT "Company"."addStandardTriggers"('"Platform"."BackupRuns"', true);
CREATE INDEX "backupRunStartedIdx" ON "Platform"."BackupRuns" ("startedAt" DESC);
CREATE INDEX "backupRunTenantIdx" ON "Platform"."BackupRuns" ("tenantId", "startedAt" DESC) WHERE "tenantId" IS NOT NULL;
COMMENT ON TABLE "Platform"."BackupRuns" IS 'Nightly full / WAL backups and per-tenant data exports, with verification state.';

ALTER TABLE "Platform"."PrivacyRequests"
  ADD CONSTRAINT "privacyRequestExportBackupRunFk" FOREIGN KEY ("exportBackupRunId") REFERENCES "Platform"."BackupRuns"(id);

-- api_key — admin/integrations "API keys" per tenant (Name, env live/test, masked key, scopes,
-- created, last used, Rotate (old key valid 24 h), Revoke) and Tenant 360 Integrations tab.
-- Global so the API gateway can authenticate a key before any tenant context exists.
CREATE TABLE "Platform"."PlatformApiKeys" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name             text NOT NULL,                                   -- "Production · ERP sync", "Power BI connector"
  environment      text NOT NULL DEFAULT 'LIVE',
  "keyPrefix"       text NOT NULL,
  "keyHash"         text NOT NULL UNIQUE,                            -- sha256; the key is shown once at creation
  "keyLast4"        text NOT NULL,
  scopes           text[] NOT NULL CHECK (cardinality(scopes) > 0 AND scopes <@ ARRAY[
                     'read:vouchers','write:vouchers','read:invoices','write:invoices','read:payroll',
                     'read:reports','webhooks:manage']::text[]),
  "allowedCidrs"    cidr[],                                          -- "Allowed IPs (optional)"
  "expiresAt"       timestamptz,                                     -- Never / 90 days / 1 year
  "lastUsedAt"     timestamptz,
  status           text NOT NULL DEFAULT 'ACTIVE',
  "previousKeyHash" text,                                           -- after rotation the old key keeps working …
  "previousValidUntil" timestamptz,                                 -- … until here (rotation + 24 h)
  "rotatedAt"       timestamptz,
  "revokedAt"       timestamptz,
  "revokedByStaffId" uuid REFERENCES "Platform"."PlatformStaff"(id),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "apiKeyEnvPrefixChk" CHECK ((environment = 'LIVE') = ("keyPrefix" = 'fs_live_')),
  CONSTRAINT "apiKeyRevokedChk" CHECK ((status = 'REVOKED') = ("revokedAt" IS NOT NULL)),
  CONSTRAINT "apiKeyRotationChk" CHECK (("previousKeyHash" IS NULL) = ("previousValidUntil" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"Platform"."PlatformApiKeys"', true);
CREATE INDEX "apiKeyTenantIdx" ON "Platform"."PlatformApiKeys" ("tenantId", status);
CREATE UNIQUE INDEX "apiKeyPreviousHashUq" ON "Platform"."PlatformApiKeys" ("previousKeyHash") WHERE "previousKeyHash" IS NOT NULL;
COMMENT ON TABLE "Platform"."PlatformApiKeys" IS 'Tenant public-API keys (hashed). Revealing or copying a key is written to Platform.PlatformAuditLogs.';

-- webhook_endpoint — admin/integrations "Webhook endpoints" cards (URL, on/off, signing secret, subscribed events)
CREATE TABLE "Platform"."WebhookEndpoints" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  url              text NOT NULL CHECK (url ~ '^https://[^\s/$.?#].[^\s]*$'),
  "isEnabled"       boolean NOT NULL DEFAULT true,                   -- paused: events are queued for 72 h
  events           text[] NOT NULL CHECK (cardinality(events) > 0 AND events <@ ARRAY[
                     'invoice.created','invoice.paid','payment.failed','voucher.posted','employee.created',
                     '"Payroll".posted','fbr.submitted','tenant.suspended']::text[]),
  "signingSecretEnc" bytea NOT NULL,                                -- whsec_…; HMAC-SHA256 signing key (encrypted)
  "secretLast4"     text NOT NULL,
  "pausedAt"        timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", url),
  CONSTRAINT "webhookEndpointPausedChk" CHECK ("isEnabled" OR "pausedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Platform"."WebhookEndpoints"', true);
CREATE INDEX "webhookEndpointTenantIdx" ON "Platform"."WebhookEndpoints" ("tenantId");
COMMENT ON TABLE "Platform"."WebhookEndpoints" IS 'Tenant webhook subscriptions; success rate (7 d) is derived from webhook_delivery.';

-- webhook_delivery — "Webhook deliveries" (Time, Event, Endpoint, Status, Latency, Attempt n/6, Replay)
-- and payload inspector (request JSON, response, finsoft-signature)
CREATE TABLE "Platform"."WebhookDeliveries" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "webhookEndpointId" uuid NOT NULL REFERENCES "Platform"."WebhookEndpoints"(id),
  "eventId"         text NOT NULL,                                   -- evt_…; same id on replay
  "eventType"       text NOT NULL,
  "requestPayload"  jsonb NOT NULL,
  "requestSignature" text NOT NULL,                                  -- t=…,v1=…
  "responseCode"    smallint CHECK ("responseCode" BETWEEN 100 AND 599),   -- NULL = timeout (no response within 10 s)
  "responseBody"    text,
  "latencyMs"       integer CHECK ("latencyMs" >= 0),
  "attemptNo"       smallint NOT NULL DEFAULT 1 CHECK ("attemptNo" BETWEEN 1 AND 6),   -- retries 1m, 5m, 30m, 2h, 6h
  status           text NOT NULL DEFAULT 'PENDING',
  "nextRetryAt"    timestamptz,
  "replayOfId"     uuid REFERENCES "Platform"."WebhookDeliveries"(id),
  "deliveredAt"     timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "webhookDeliveryDeliveredChk" CHECK (status <> 'DELIVERED' OR ("responseCode" BETWEEN 200 AND 299 AND "deliveredAt" IS NOT NULL)),
  CONSTRAINT "webhookDeliveryTimeoutChk" CHECK (status <> 'TIMEOUT' OR "responseCode" IS NULL)
);
SELECT "Company"."addStandardTriggers"('"Platform"."WebhookDeliveries"');
CREATE INDEX "webhookDeliveryTenantIdx" ON "Platform"."WebhookDeliveries" ("tenantId", "createdAt" DESC);
CREATE INDEX "webhookDeliveryEndpointIdx" ON "Platform"."WebhookDeliveries" ("webhookEndpointId", "createdAt" DESC);
CREATE INDEX "webhookDeliveryRetryIdx" ON "Platform"."WebhookDeliveries" ("nextRetryAt") WHERE status IN ('PENDING','FAILED','TIMEOUT') AND "nextRetryAt" IS NOT NULL;
COMMENT ON TABLE "Platform"."WebhookDeliveries" IS 'Every webhook delivery attempt (incl. replays and test pings), with request and response for inspection.';

-- =============================================================================
-- B11. Module triggers and functions
-- (plpgsql with record, no %ROWTYPE: safe whatever the creation order)
-- =============================================================================

-- A flag key is what engineers type in code: it can never change.
CREATE OR REPLACE FUNCTION "Platform"."triggerFlagKeyImmutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.key IS DISTINCT FROM OLD.key THEN
    RAISE EXCEPTION 'Flag key % cannot be changed', OLD.key USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "platformFeatureFlagKeyImmutable" BEFORE UPDATE OF key ON "Platform"."FeatureFlags"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerFlagKeyImmutable"();

-- "Super Admin always has every permission": a locked role cannot lose a permission.
CREATE OR REPLACE FUNCTION "Platform"."triggerStaffRolePermissionLock"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vRole" record;
BEGIN
  SELECT r.code, r."isLocked" INTO "vRole" FROM "Platform"."PlatformStaffRoles" r WHERE r.id = NEW."staffRoleId";
  IF "vRole"."isLocked" AND NOT NEW."isGranted" THEN
    RAISE EXCEPTION 'Role % is locked and keeps every permission', "vRole".code USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "platformStaffRolePermissionLock" BEFORE INSERT OR UPDATE ON "Platform"."PlatformStaffRolePermissions"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerStaffRolePermissionLock"();

-- Four eyes: the requester of a change request can never be one of its approvers.
CREATE OR REPLACE FUNCTION "Platform"."triggerCrApproverNotRequester"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vCr" record;
BEGIN
  SELECT c."docNo", c."requesterStaffId" INTO "vCr" FROM "Platform"."FlagChangeRequests" c WHERE c.id = NEW."changeRequestId";
  IF "vCr"."requesterStaffId" = NEW."staffUserId" THEN
    RAISE EXCEPTION 'The requester of % cannot approve it', "vCr"."docNo" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "platformCrApproverNotRequester" BEFORE INSERT OR UPDATE ON "Platform"."FlagChangeRequestApprovers"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerCrApproverNotRequester"();

-- Keeps PlatformInvoices.paidAmount and status in step with its payments.
CREATE OR REPLACE FUNCTION "Platform"."triggerPlatformPaymentApply"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vInvoiceId" uuid := COALESCE(NEW."platformInvoiceId", OLD."platformInvoiceId");
  "vInv"        record;
  "vPaid"       numeric(18,2);
BEGIN
  SELECT i.id, i.status, i."totalAmount" INTO "vInv"
    FROM "Platform"."PlatformInvoices" i WHERE i.id = "vInvoiceId" FOR UPDATE;

  SELECT COALESCE(sum(p.amount - p."refundedAmount"), 0) INTO "vPaid"
    FROM "Platform"."PlatformPayments" p
   WHERE p."platformInvoiceId" = "vInvoiceId"
     AND p.status IN ('SUCCEEDED','PARTIALLY_REFUNDED');

  IF "vPaid" > "vInv"."totalAmount" THEN
    RAISE EXCEPTION 'Payments (%) exceed the invoice total (%)', "vPaid", "vInv"."totalAmount" USING ERRCODE = 'check_violation';
  END IF;

  UPDATE "Platform"."PlatformInvoices" i
     SET "paidAmount" = "vPaid",
         status = CASE
                    WHEN i.status IN ('VOID','DRAFT','UNCOLLECTIBLE') THEN i.status
                    WHEN "vPaid" >= i."totalAmount" AND i."totalAmount" > 0 THEN 'PAID'
                    WHEN "vPaid" > 0 THEN 'PARTIALLY_PAID'
                    ELSE 'OPEN'
                  END
   WHERE i.id = "vInvoiceId";
  RETURN NULL;
END $$;
CREATE TRIGGER "platformPlatformPaymentApply" AFTER INSERT OR UPDATE OF status, amount, "refundedAmount" ON "Platform"."PlatformPayments"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerPlatformPaymentApply"();

-- SubscriptionPlanLimits USERS / STORAGE_GB mirror into the Basic plan columns (plan.userSeats / plan.storageGb).
CREATE OR REPLACE FUNCTION "Platform"."triggerPlanLimitSync"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vMeter" record;
BEGIN
  SELECT m.code INTO "vMeter" FROM "Platform"."UsageMeters" m WHERE m.id = NEW."usageMeterId";
  IF "vMeter".code = 'USERS' THEN
    UPDATE "Platform"."SubscriptionPlans" SET "userSeats" = NULLIF(NEW."limitValue", 0)::integer WHERE id = NEW."planId";
  ELSIF "vMeter".code = 'STORAGE_GB' THEN
    UPDATE "Platform"."SubscriptionPlans" SET "storageGb" = NULLIF(ceil(NEW."limitValue"), 0)::integer WHERE id = NEW."planId";
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER "platformPlanLimitSync" AFTER INSERT OR UPDATE OF "limitValue" ON "Platform"."SubscriptionPlanLimits"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerPlanLimitSync"();

-- Ticket SLA from priority: Urgent 2h · High 4h · Normal 8h (screen) · Low 24h (assumed).
CREATE OR REPLACE FUNCTION "Platform"."triggerSupportTicketSla"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.priority IS DISTINCT FROM OLD.priority THEN
    NEW."slaDueAt" := NEW."openedAt" + CASE NEW.priority
                                        WHEN 'URGENT' THEN interval '2 hours'
                                        WHEN 'HIGH'   THEN interval '4 hours'
                                        WHEN 'NORMAL' THEN interval '8 hours'
                                        ELSE               interval '24 hours'
                                      END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "platformSupportTicketSla" BEFORE INSERT OR UPDATE OF priority ON "Platform"."SupportTickets"
  FOR EACH ROW EXECUTE FUNCTION "Platform"."triggerSupportTicketSla"();

-- =============================================================================
-- Table comments for PART A (Basic tables)
-- =============================================================================
COMMENT ON TABLE "Platform"."SubscriptionPlans"                 IS 'Public price book (admin/plans). Price changes apply to new subscriptions and renewals; existing tenants are grandfathered.';
COMMENT ON TABLE "Platform"."SubscriptionPlanFeatures"         IS 'Plan × module inclusion (INCLUDED / ADDON with price / NOT_AVAILABLE) — the Basic feature matrix.';
COMMENT ON TABLE "Platform"."ChartOfAccountsTemplates"         IS 'Chart-of-accounts templates copied into Accounting.ChartOfAccounts at provisioning (Onboard step 4).';
COMMENT ON TABLE "Platform"."ChartOfAccountsTemplateAccounts" IS 'Accounts of a COA template (4 levels, class 1–5, Dr/Cr nature, default account role).';
COMMENT ON TABLE "Platform"."Tenants"               IS 'A customer organisation and the root of tenancy; every tenant-owned row references it. [FULL] also the subject of flag targeting.';
COMMENT ON TABLE "Platform"."TenantContacts"       IS 'Named people at a tenant: owner (first administrator), billing, technical.';
COMMENT ON TABLE "Platform"."TenantModules"        IS 'Modules switched on for a tenant and why (plan, add-on, trial, override).';
COMMENT ON TABLE "Platform"."Subscriptions"         IS 'A tenant''s plan, billing cycle, seats and renewal. One live subscription per tenant.';
COMMENT ON TABLE "Platform"."PlatformStaff"           IS 'Finsoft Cloud staff with console access, their role and tenant scope.';
COMMENT ON TABLE "Platform"."PlatformAuditLogs"            IS 'Immutable record of every staff and system action on the platform (retained 7 years).';
