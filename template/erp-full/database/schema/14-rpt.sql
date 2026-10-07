-- =============================================================================
-- Finsoft ERP (FULL) — 14-rpt.sql
-- Report Studio: saved report definitions (custom builder reports and saved
-- presets of the built-in studios), their columns, sharing, email schedules
-- and run history. Full edition only.
--
-- Screens:
--   app/reports/studio   Report Studio builder (1. Data source, 2. Columns,
--                        3. Filters, 4. Group & sort, Run, Table/Chart, "Save &
--                        schedule" modal)                     src/42-acc-reports.html
--   Built-in studios     Financial / Inventory / Receivables / Payables / Payroll /
--                        HR studios: presets ("Board pack · Q1", "Month-end TB"),
--                        Generate (PDF / Excel / Print)          src/45-studios.html + src/96-studio.js
--   app/reports          Reports Centre "Recent runs" and "Scheduled reports"
--                        (Report, Frequency, Next run, Recipients, Format, Status)
--
-- The report data itself always comes from live views (90-views.sql) and the
-- module tables; nothing here stores report rows.
-- Inline FKs: rpt.* and core.* only (no cross-module FKs; 14-rpt-fks.sql is empty).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SavedReports — a saved report.
--   kind CUSTOM : built in Report Studio (Source "Sales invoices / Vendor bills /
--                 GL transactions / Customers / Stock movements / Payroll lines",
--                 Date range, Filters, Group by, Sort by, Limit "Top 8 / Top 20 /
--                 All rows", Show totals row, Table / Chart (Bar / Line / Donut)).
--   kind PRESET : a saved view of a built-in studio tab (studio + tab such as
--                 FINANCE/pnl, view Detail/Summary, options, filter values),
--                 e.g. "Board pack · Q1 — Profit & Loss · Comparative".
-- "Save & schedule" modal: Report name *, Folder, Visibility, Add to my favourites.
-- src/42-acc-reports.html (app/reports/studio, rpt-studio-save), src/96-studio.js (STUDIOS.presets, snapshot)
-- ---------------------------------------------------------------------------
CREATE TABLE "Reports"."SavedReports" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name               text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),   -- Sales by customer & branch — quarterly
  description        text,                                             -- subtitle "Profit & Loss · Comparative"
  folder             text NOT NULL DEFAULT 'GENERAL',
  kind               text NOT NULL,
  -- PRESET: which built-in studio tab
  studio             text,
  "studioTab"         text CHECK ("studioTab" ~ '^[a-z0-9]{2,20}$'),     -- tb, pnl, bs, cf, gl, daybook, ledger, ratio, current, ageing, register …
  -- CUSTOM: data source
  "sourceEntity"      text,
  -- shared parameters
  "dateRange"         text NOT NULL DEFAULT 'THIS_QUARTER',
  "dateFrom"          date,
  "dateTo"            date,
  "branchId"          uuid,                                             -- NULL = all branches (consolidated)
  filters            jsonb NOT NULL DEFAULT '[]'::jsonb,               -- [{"field":"status","op":"EQ","value":"POSTED"},{"field":"netSales","op":"GTE","value":1000000}]
  "groupBy"           text[] NOT NULL DEFAULT '{}',                     -- {customer} / {branch} / {month} / {salesperson}
  "sortField"         text,                                             -- netSales
  "sortDir"           text NOT NULL DEFAULT 'DESC',
  "rowLimit"          integer CHECK ("rowLimit" BETWEEN 1 AND 100000),   -- Top 8 / Top 20; NULL = All rows
  "showTotals"        boolean NOT NULL DEFAULT true,
  "viewMode"          text NOT NULL DEFAULT 'DETAIL',
  display            text NOT NULL DEFAULT 'TABLE',
  "chartType"         text,
  options            jsonb NOT NULL DEFAULT '{}'::jsonb,               -- studio toggles: {"value":true,"zero":false,"group":true,"desc":true}
  "defaultFormat"     text NOT NULL DEFAULT 'PDF',
  visibility         text NOT NULL DEFAULT 'PRIVATE',   -- Only me / roles / Everyone
  "ownerUserId"      uuid NOT NULL,
  "isFavourite"       boolean NOT NULL DEFAULT false,                   -- owner's star ("Add to my favourites")
  "isSystem"          boolean NOT NULL DEFAULT false,                   -- shipped preset, read-only
  status             text NOT NULL DEFAULT 'ACTIVE',
  "lastRunAt"        timestamptz,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  "deletedAt"         timestamptz,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "ownerUserId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId")     REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "reportDefinitionKindChk" CHECK (
       (kind = 'PRESET' AND studio IS NOT NULL AND "studioTab" IS NOT NULL AND "sourceEntity" IS NULL)
    OR (kind = 'CUSTOM' AND "sourceEntity" IS NOT NULL AND studio IS NULL AND "studioTab" IS NULL)),
  CONSTRAINT "reportDefinitionCustomRangeChk" CHECK ("dateRange" <> 'CUSTOM' OR ("dateFrom" IS NOT NULL AND "dateTo" IS NOT NULL AND "dateTo" >= "dateFrom")),
  CONSTRAINT "reportDefinitionAsOnChk" CHECK ("dateRange" <> 'AS_ON' OR "dateTo" IS NOT NULL),
  CONSTRAINT "reportDefinitionChartChk" CHECK (display <> 'CHART' OR "chartType" IS NOT NULL),
  CONSTRAINT "reportDefinitionFiltersChk" CHECK (jsonb_typeof(filters) = 'array'),
  CONSTRAINT "reportDefinitionOptionsChk" CHECK (jsonb_typeof(options) = 'object')
);
SELECT "Company"."addStandardTriggers"('"Reports"."SavedReports"', true);
CREATE UNIQUE INDEX "reportDefinitionOwnerNameUidx" ON "Reports"."SavedReports" ("tenantId", "ownerUserId", name) WHERE "deletedAt" IS NULL;
CREATE INDEX "reportDefinitionFolderIdx" ON "Reports"."SavedReports" ("tenantId", folder, name) WHERE "deletedAt" IS NULL AND status = 'ACTIVE';
CREATE INDEX "reportDefinitionStudioIdx" ON "Reports"."SavedReports" ("tenantId", studio, "studioTab") WHERE kind = 'PRESET' AND "deletedAt" IS NULL;
CREATE INDEX "reportDefinitionFavIdx"    ON "Reports"."SavedReports" ("tenantId", "ownerUserId") WHERE "isFavourite" AND "deletedAt" IS NULL;
COMMENT ON TABLE "Reports"."SavedReports" IS 'Saved reports: CUSTOM (Report Studio builder over a data source) or PRESET (saved view of a built-in studio tab).';
COMMENT ON COLUMN "Reports"."SavedReports".visibility IS 'PRIVATE = Only me; SHARED = roles/users listed in Reports.SavedReportShares ("Finance & Sales roles"); EVERYONE = all users with the module permission.';

-- ---------------------------------------------------------------------------
-- SavedReportColumns — "2. Columns: click to toggle" (Customer, Branch, Invoice
-- count, Net sales, GST, Gross total, Salesperson, City, Further tax, Margin %,
-- Due date) and the studios' hideable value columns.
-- src/42-acc-reports.html (app/reports/studio), src/96-studio.js (column factory C(k, l, flags))
-- ---------------------------------------------------------------------------
CREATE TABLE "Reports"."SavedReportColumns" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "reportId"        uuid NOT NULL,
  seq              smallint NOT NULL CHECK (seq BETWEEN 1 AND 200),
  "fieldKey"        text NOT NULL CHECK ("fieldKey" ~ '^[a-z][A-Za-z0-9]{0,40}$'),   -- customer, netSales, marginPct
  label            text NOT NULL,                                                -- "Net sales"
  "isVisible"       boolean NOT NULL DEFAULT true,
  aggregate        text NOT NULL DEFAULT 'NONE',
  format           text NOT NULL DEFAULT 'TEXT',
  "widthPx"         smallint CHECK ("widthPx" BETWEEN 40 AND 800),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "reportId", seq),
  UNIQUE ("tenantId", "reportId", "fieldKey"),
  FOREIGN KEY ("tenantId", "reportId") REFERENCES "Reports"."SavedReports" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Reports"."SavedReportColumns"');
COMMENT ON TABLE "Reports"."SavedReportColumns" IS 'Ordered columns of a saved report (field key from the source entity''s field catalogue, label, aggregate, format).';

-- ---------------------------------------------------------------------------
-- SavedReportShares — Visibility "Finance & Sales roles": the roles / users a
-- SHARED report is visible to (EVERYONE needs no rows).
-- src/42-acc-reports.html (rpt-studio-save)
-- ---------------------------------------------------------------------------
CREATE TABLE "Reports"."SavedReportShares" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "reportId"        uuid NOT NULL,
  "shareType"       text NOT NULL,
  "roleId"          uuid,
  "userId"          uuid,
  "canEdit"         boolean NOT NULL DEFAULT false,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE NULLS NOT DISTINCT ("tenantId", "reportId", "roleId", "userId"),
  FOREIGN KEY ("tenantId", "reportId") REFERENCES "Reports"."SavedReports" ("tenantId", id),
  FOREIGN KEY ("tenantId", "roleId")   REFERENCES "Company"."Roles" ("tenantId", id),
  FOREIGN KEY ("tenantId", "userId")   REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "reportShareTargetChk" CHECK (
       ("shareType" = 'ROLE' AND "roleId" IS NOT NULL AND "userId" IS NULL)
    OR ("shareType" = 'USER' AND "userId" IS NOT NULL AND "roleId" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"Reports"."SavedReportShares"', true);
CREATE INDEX "reportShareRoleIdx" ON "Reports"."SavedReportShares" ("tenantId", "roleId") WHERE "roleId" IS NOT NULL;
CREATE INDEX "reportShareUserIdx" ON "Reports"."SavedReportShares" ("tenantId", "userId") WHERE "userId" IS NOT NULL;
COMMENT ON TABLE "Reports"."SavedReportShares" IS 'Who may see (or edit) a SHARED report: roles or individual users.';

-- ---------------------------------------------------------------------------
-- ReportSchedules — "Email on a schedule" (Frequency "Monthly · 3rd at 08:00 /
-- Weekly · Monday / Quarterly", Format Excel / PDF / CSV, Recipients) and the
-- Reports Centre "Scheduled reports" table (Report, Frequency "Daily · 19:00 /
-- Weekly · Mon / Monthly · 5th", Next run, Recipients "Ahmed Raza +2", Format,
-- Status Active / Paused / "6 items" for alert reports).
-- src/42-acc-reports.html (rpt-studio-save), src/45-studios.html (app/reports)
-- ---------------------------------------------------------------------------
CREATE TABLE "Reports"."ReportSchedules" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "reportId"           uuid NOT NULL,
  frequency           text NOT NULL,
  "dayOfWeek"         smallint CHECK ("dayOfWeek" BETWEEN 1 AND 7),       -- ISO: 1 = Monday
  "dayOfMonth"        smallint CHECK ("dayOfMonth" BETWEEN 1 AND 28),     -- 3rd / 5th / 10th / 12th
  "runTime"            time NOT NULL DEFAULT '08:00',
  timezone            text NOT NULL DEFAULT 'Asia/Karachi',
  format              text NOT NULL DEFAULT 'XLSX',
  "recipientEmails"    citext[] NOT NULL DEFAULT '{}',                    -- bilal.khan@alnoor.pk, sana.javed@alnoor.pk
  "recipientUserIds"  uuid[] NOT NULL DEFAULT '{}',                      -- internal users (resolved to their emails)
  "onlyIfRows"        boolean NOT NULL DEFAULT false,                    -- alert reports (Minus Stock): send only when rows exist
  status              text NOT NULL DEFAULT 'ACTIVE',
  "nextRunAt"         timestamptz,
  "lastRunAt"         timestamptz,
  "lastRowCount"      integer CHECK ("lastRowCount" >= 0),               -- "6 items"
  "ownerUserId"       uuid NOT NULL,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "reportId")     REFERENCES "Reports"."SavedReports" ("tenantId", id),
  FOREIGN KEY ("tenantId", "ownerUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "reportScheduleRecipientsChk" CHECK (cardinality("recipientEmails") + cardinality("recipientUserIds") > 0),
  CONSTRAINT "reportScheduleWeeklyChk"  CHECK (frequency <> 'WEEKLY' OR "dayOfWeek" IS NOT NULL),
  CONSTRAINT "reportScheduleMonthlyChk" CHECK (frequency NOT IN ('MONTHLY','QUARTERLY') OR "dayOfMonth" IS NOT NULL),
  CONSTRAINT "reportScheduleNextChk"    CHECK (status <> 'ACTIVE' OR "nextRunAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Reports"."ReportSchedules"', true);
CREATE INDEX "reportScheduleDueIdx"    ON "Reports"."ReportSchedules" ("nextRunAt") WHERE status = 'ACTIVE';
CREATE INDEX "reportScheduleReportIdx" ON "Reports"."ReportSchedules" ("tenantId", "reportId");
COMMENT ON TABLE "Reports"."ReportSchedules" IS 'Email delivery schedules of saved reports. The scheduler picks ACTIVE rows with nextRunAt <= now() (cross-tenant job, BYPASSRLS login).';

-- ---------------------------------------------------------------------------
-- ReportRuns — every generation: studio "Generate" (PDF / Excel / Print),
-- Report Studio "Run" / "Export", scheduled deliveries. Reports Centre "Recent
-- runs: generated in the last 7 days" ("Profit & Loss · Q1 FY 2026-27 · 01 Oct
-- 2026, 09:12 AM · Sana Javed · PDF").
-- src/45-studios.html (app/reports), src/96-studio.js (generate, download, doPrint)
-- ---------------------------------------------------------------------------
CREATE TABLE "Reports"."ReportRuns" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "reportId"             uuid,                                           -- NULL = ad-hoc run of a studio tab
  "scheduleId"           uuid,
  studio                text,
  "studioTab"            text CHECK ("studioTab" ~ '^[a-z0-9]{2,20}$'),
  title                 text NOT NULL,                                  -- "Trial Balance · 30 Sep 2026"
  parameters            jsonb NOT NULL DEFAULT '{}'::jsonb,             -- snapshot of period / branch / filters / options used
  format                text NOT NULL,
  "triggerType"          text NOT NULL DEFAULT 'MANUAL',
  "runByUserId"        uuid,                                           -- NULL for scheduled / API runs
  "startedAt"            timestamptz NOT NULL DEFAULT now(),
  "finishedAt"           timestamptz,
  status                text NOT NULL DEFAULT 'RUNNING',
  "rowCount"             integer CHECK ("rowCount" >= 0),
  "outputAttachmentId"  uuid,                                           -- generated file (Company.Attachments, purpose REPORT_OUTPUT)
  "deliveredTo"          citext[],                                       -- scheduled email recipients
  "errorMessage"         text,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "reportId")            REFERENCES "Reports"."SavedReports" ("tenantId", id),
  FOREIGN KEY ("tenantId", "scheduleId")          REFERENCES "Reports"."ReportSchedules" ("tenantId", id),
  FOREIGN KEY ("tenantId", "runByUserId")       REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "outputAttachmentId") REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "reportRunSourceChk"   CHECK ("reportId" IS NOT NULL OR studio IS NOT NULL),
  CONSTRAINT "reportRunTriggerChk"  CHECK (("triggerType" = 'SCHEDULED') = ("scheduleId" IS NOT NULL)),
  CONSTRAINT "reportRunManualChk"   CHECK ("triggerType" <> 'MANUAL' OR "runByUserId" IS NOT NULL),
  CONSTRAINT "reportRunFinishedChk" CHECK (status IN ('QUEUED','RUNNING') OR "finishedAt" IS NOT NULL),
  CONSTRAINT "reportRunTimeChk"     CHECK ("finishedAt" IS NULL OR "finishedAt" >= "startedAt")
);
SELECT "Company"."addStandardTriggers"('"Reports"."ReportRuns"');
CREATE INDEX "reportRunRecentIdx" ON "Reports"."ReportRuns" ("tenantId", "startedAt" DESC);
CREATE INDEX "reportRunReportIdx" ON "Reports"."ReportRuns" ("tenantId", "reportId", "startedAt" DESC);
CREATE INDEX "reportRunUserIdx"   ON "Reports"."ReportRuns" ("tenantId", "runByUserId", "startedAt" DESC);
COMMENT ON TABLE "Reports"."ReportRuns" IS 'Report generation history (Reports Centre › Recent runs); output file in Company.Attachments. Exports are also written to Company.AuditTrailEntries (action EXPORT).';
