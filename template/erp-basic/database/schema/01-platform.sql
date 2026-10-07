-- =============================================================================
-- Finsoft ERP (BASIC) — 01-platform.sql
-- SaaS console tables. GLOBAL: no tenantId, no RLS. Read/written by the
-- platform console (admin/*) and by login/provisioning, which run before a
-- tenant context exists.
--
-- Screens: admin/tenants, admin/tenants/new (Onboard Tenant wizard),
--          admin/tenants/view (Tenant 360), admin/plans, admin/subscriptions,
--          admin/templates (COA template picked during onboarding),
--          admin/staff, admin/audit
-- =============================================================================

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
  industry            text,
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
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0
);
SELECT "Company"."addStandardTriggers"('"Platform"."Tenants"');
CREATE INDEX "tenantStatusIdx" ON "Platform"."Tenants" (status);
CREATE INDEX "tenantNameTrgmIdx" ON "Platform"."Tenants" USING gin ("displayName" gin_trgm_ops);

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
  "tenantScope"     text NOT NULL DEFAULT 'ALL',
  status           text NOT NULL DEFAULT 'INVITED',
  "lastActiveAt"   timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "staffUserActiveNeedsPasswordChk" CHECK (status <> 'ACTIVE' OR "passwordHash" IS NOT NULL)
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
  result           text NOT NULL DEFAULT 'SUCCESS'
);
CREATE INDEX "platformAuditLogTimeIdx"   ON "Platform"."PlatformAuditLogs" ("occurredAt" DESC);
CREATE INDEX "platformAuditLogTenantIdx" ON "Platform"."PlatformAuditLogs" ("tenantId", "occurredAt" DESC);
CREATE TRIGGER "platformAuditLogAppendOnly" BEFORE UPDATE OR DELETE ON "Platform"."PlatformAuditLogs"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();
