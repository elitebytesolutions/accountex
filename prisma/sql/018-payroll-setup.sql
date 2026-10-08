-- Phase 12: Payroll setup (salary components, structures, pay groups, salary tax slabs, employee salaries). Idempotent.
-- Apply with: npm run db:sql

-- ---------------------------------------------------------------------------
-- 1. Row history on the table that had none
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "payGroupsAudit" ON "Payroll"."PayGroups";
CREATE TRIGGER "payGroupsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Payroll"."PayGroups"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Every company's defaults: the template's 17 salary components (GL accounts looked up by code in the company's own
--    chart; a component whose account is missing is skipped), pay groups STAFF / MANAGEMENT, and the Finance Act 2025
--    salaried tax slabs for 2025-26, copied as 2026-27 for HR to verify. Existing rows are never overwritten.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Payroll"."seedPayrollDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vCount" integer := 0;
  "vN" integer;
  "c" record;
BEGIN
  FOR "c" IN
    SELECT * FROM (VALUES
      (1,  'BAS', 'Basic Salary',              'EARNING',               'FIXED',         NULL,          NULL,  NULL::numeric, NULL::numeric, NULL,                      'Fixed — per grade',                     '5210-01', NULL,      'FULLY_TAXABLE',     NULL::numeric, NULL::numeric, true,  true,  true,  'BASIC'),
      (2,  'HRA', 'House Rent Allowance',      'EARNING',               'PERCENT_OF',    'COMPONENT',   'BAS', 45,            NULL,          NULL,                      '45% of Basic',                          '5210-01', NULL,      'FULLY_TAXABLE',     NULL,          NULL,          true,  false, false, NULL),
      (3,  'MED', 'Medical Allowance',         'EARNING',               'PERCENT_OF',    'COMPONENT',   'BAS', 10,            NULL,          NULL,                      '10% of Basic',                          '5210-01', NULL,      'EXEMPT_UPTO_LIMIT', 10,            NULL,          true,  false, false, NULL),
      (4,  'UTL', 'Utilities Allowance',       'EARNING',               'FIXED',         NULL,          NULL,  NULL,          NULL,          NULL,                      'Fixed — per grade',                     '5210-01', NULL,      'FULLY_TAXABLE',     NULL,          NULL,          true,  false, false, NULL),
      (5,  'CNV', 'Conveyance Allowance',      'EARNING',               'FIXED',         NULL,          NULL,  NULL,          NULL,          NULL,                      'Fixed — per grade',                     '5210-01', NULL,      'FULLY_TAXABLE',     NULL,          NULL,          true,  false, false, NULL),
      (6,  'FUL', 'Fuel Allowance',            'EARNING',               'FORMULA',       NULL,          NULL,  NULL,          NULL,          'LITRES * OGRA_PRICE',     'Litres × OGRA price (G3+)',             '5230-02', NULL,      'FULLY_TAXABLE',     NULL,          NULL,          true,  false, false, NULL),
      (7,  'COM', 'Sales Commission',          'EARNING',               'MONTHLY_INPUT', NULL,          NULL,  NULL,          NULL,          NULL,                      'Variable — monthly input',              '5210-09', NULL,      'FULLY_TAXABLE',     NULL,          NULL,          true,  false, false, 'COMMISSION'),
      (8,  'OVT', 'Overtime',                  'EARNING',               'FORMULA',       NULL,          NULL,  NULL,          NULL,          '(BAS / 208) * 2 * OT_HOURS', '(Basic ÷ 208) × 2 × OT hrs',        '5210-02', NULL,      'FULLY_TAXABLE',     NULL,          NULL,          true,  false, false, 'OVERTIME'),
      (9,  'ITX', 'Income Tax u/s 149',        'DEDUCTION',             'SYSTEM',        NULL,          NULL,  NULL,          NULL,          NULL,                      'FBR slab on projected annual taxable',  NULL,      '2140-03', NULL,                NULL,          NULL,          true,  false, false, 'INCOME_TAX'),
      (10, 'EOB', 'EOBI — Employee',           'DEDUCTION',             'PERCENT_OF',    'EOBI_WAGE',   NULL,  1,             37000,         NULL,                      '1% of min. wage Rs 37,000 = Rs 370',    NULL,      '2150-01', NULL,                NULL,          NULL,          true,  false, false, 'EOBI_EMPLOYEE'),
      (11, 'PFE', 'Provident Fund — Employee', 'DEDUCTION',             'PERCENT_OF',    'COMPONENT',   'BAS', 8,             NULL,          NULL,                      '8% of Basic',                           NULL,      '2150-03', NULL,                NULL,          NULL,          true,  false, false, 'PF_EMPLOYEE'),
      (12, 'LON', 'Loan Installment',          'DEDUCTION',             'SYSTEM',        NULL,          NULL,  NULL,          NULL,          NULL,                      'From loan schedule',                    NULL,      '1140-03', NULL,                NULL,          NULL,          true,  false, false, 'LOAN'),
      (13, 'ADV', 'Salary Advance',            'DEDUCTION',             'SYSTEM',        NULL,          NULL,  NULL,          NULL,          NULL,                      'From advance schedule',                 NULL,      '1140-02', NULL,                NULL,          NULL,          true,  false, false, 'ADVANCE'),
      (14, 'EOR', 'EOBI — Employer',           'EMPLOYER_CONTRIBUTION', 'PERCENT_OF',    'EOBI_WAGE',   NULL,  5,             37000,         NULL,                      '5% of Rs 37,000 = Rs 1,850',            '5210-04', '2150-01', NULL,                NULL,          NULL,          false, false, false, 'EOBI_EMPLOYER'),
      (15, 'PSI', 'PESSI — Employer',          'EMPLOYER_CONTRIBUTION', 'PERCENT_OF',    'GROSS',       NULL,  6,             37000,         NULL,                      '6% of wages ≤ Rs 37,000 (Punjab)',      '5210-05', '2150-02', NULL,                NULL,          NULL,          false, false, false, 'PESSI_EMPLOYER'),
      (16, 'PFR', 'Provident Fund — Employer', 'EMPLOYER_CONTRIBUTION', 'PERCENT_OF',    'COMPONENT',   'BAS', 8,             NULL,          NULL,                      '8% of Basic (matching)',                '5210-06', '2150-03', 'EXEMPT_UPTO_LIMIT', NULL,          150000,        true,  false, false, 'PF_EMPLOYER'),
      (17, 'GRT', 'Gratuity Provision',        'EMPLOYER_CONTRIBUTION', 'FORMULA',       NULL,          NULL,  NULL,          NULL,          'BAS / 12',                '1 month Basic per completed year ÷ 12', '5210-07', '2220-01', NULL,                NULL,          NULL,          false, false, false, 'GRATUITY')
    ) AS v(sort, code, name, typ, calc, basis, basecode, pct, ceiling, formula, descr, dr, cr, tax, exPct, exAnnual, payslip, gratuity, eobi, role)
    ORDER BY sort
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM "Payroll"."SalaryComponents" WHERE "tenantId" = "pTenant" AND code = "c".code);
    CONTINUE WHEN "c".role IS NOT NULL AND EXISTS (SELECT 1 FROM "Payroll"."SalaryComponents" WHERE "tenantId" = "pTenant" AND "systemRole" = "c".role AND "deletedAt" IS NULL);
    CONTINUE WHEN "c".dr IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Accounting"."ChartOfAccounts" WHERE "tenantId" = "pTenant" AND code = "c".dr AND "deletedAt" IS NULL);
    CONTINUE WHEN "c".cr IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Accounting"."ChartOfAccounts" WHERE "tenantId" = "pTenant" AND code = "c".cr AND "deletedAt" IS NULL);
    CONTINUE WHEN "c".basecode IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Payroll"."SalaryComponents" WHERE "tenantId" = "pTenant" AND code = "c".basecode);
    INSERT INTO "Payroll"."SalaryComponents" ("tenantId", code, name, "componentType", "calcMethod", "baseBasis", "baseComponentId", percent, "wageCeiling", formula,
      "calcDescription", "debitAccountId", "creditAccountId", "taxTreatment", "exemptLimitPercentOfBasic", "exemptLimitAnnualAmount", "showOnPayslip",
      "includeInGratuityBase", "includeInEobiWage", "systemRole", "sortOrder", status)
    VALUES ("pTenant", "c".code, "c".name, "c".typ, "c".calc, "c".basis,
      (SELECT id FROM "Payroll"."SalaryComponents" WHERE "tenantId" = "pTenant" AND code = "c".basecode),
      "c".pct, "c".ceiling, "c".formula, "c".descr,
      (SELECT id FROM "Accounting"."ChartOfAccounts" WHERE "tenantId" = "pTenant" AND code = "c".dr AND "deletedAt" IS NULL),
      (SELECT id FROM "Accounting"."ChartOfAccounts" WHERE "tenantId" = "pTenant" AND code = "c".cr AND "deletedAt" IS NULL),
      "c".tax, "c".exPct, "c".exAnnual, "c".payslip, "c".gratuity, "c".eobi, "c".role, "c".sort, 'ACTIVE');
    "vCount" := "vCount" + 1;
  END LOOP;

  INSERT INTO "Payroll"."PayGroups" ("tenantId", code, name, frequency, status)
  SELECT "pTenant", v.code, v.name, 'MONTHLY', 'ACTIVE' FROM (VALUES ('STAFF', 'Staff'), ('MANAGEMENT', 'Management')) AS v(code, name)
   WHERE NOT EXISTS (SELECT 1 FROM "Payroll"."PayGroups" g WHERE g."tenantId" = "pTenant" AND g.code = v.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT; "vCount" := "vCount" + "vN";

  INSERT INTO "Payroll"."SalaryTaxSlabs" ("tenantId", "taxYear", "slabNo", "incomeFrom", "incomeTo", "fixedTax", "ratePercent")
  SELECT "pTenant", y.yr, v.no, v.f, v.t, v.fx, v.r
    FROM (VALUES ('2025-26'), ('2026-27')) AS y(yr)
    CROSS JOIN (VALUES
      (1, 0::numeric,   600000::numeric,  0::numeric,     0::numeric),
      (2, 600000,       1200000,          0,              1),
      (3, 1200000,      2200000,          6000,           11),
      (4, 2200000,      3200000,          116000,         23),
      (5, 3200000,      4100000,          346000,         30),
      (6, 4100000,      NULL,             616000,         35)
    ) AS v(no, f, t, fx, r)
   WHERE NOT EXISTS (SELECT 1 FROM "Payroll"."SalaryTaxSlabs" s WHERE s."tenantId" = "pTenant" AND s."taxYear" = y.yr);
  GET DIAGNOSTICS "vN" = ROW_COUNT; "vCount" := "vCount" + "vN";
  RETURN "vCount";
END $function$;

CREATE OR REPLACE FUNCTION "Payroll"."triggerTenantPayrollDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Payroll"."seedPayrollDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

-- The chart of accounts is created after provisioning, so a new company gets its components by re-running this seed
-- once its chart exists (pay groups and tax slabs are seeded at once).
DROP TRIGGER IF EXISTS "tenantsPayrollDefaults" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsPayrollDefaults" AFTER INSERT ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "Payroll"."triggerTenantPayrollDefaults"();

SELECT set_config('app.actorLabel', 'seedPayrollDefaultsFor', true);
SELECT "Payroll"."seedPayrollDefaultsFor"(t.id) FROM "Platform"."Tenants" t;

-- ---------------------------------------------------------------------------
-- 3. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('COMPONENT_IN_USE',          409, 'BUSINESS_RULE', 'PAYROLL', 'Salary structures, other components or payroll lines use this component. Deactivate it instead.', 'Delete of a used salary component', true, NULL),
  ('COMPONENT_CYCLE',           400, 'VALIDATION',    'PAYROLL', 'This calculation refers back to itself through other components.', 'Salary component dependency loop', true, NULL),
  ('STRUCTURE_IN_USE',          409, 'BUSINESS_RULE', 'PAYROLL', 'Employee salaries use this structure. Retire it instead.', 'Delete of a used salary structure', true, NULL),
  ('PAY_GROUP_IN_USE',          409, 'BUSINESS_RULE', 'PAYROLL', 'Employee salaries or payroll runs use this pay group. Deactivate it instead.', 'Delete of a used pay group', true, NULL),
  ('TAX_SLABS_NOT_CONTIGUOUS',  400, 'VALIDATION',    'PAYROLL', 'Slabs must start at 0, follow on without gaps or overlaps, and only the last may be open-ended.', 'Salary tax slab gaps or overlaps', true, NULL),
  ('SALARY_REVISION_BACKDATED', 409, 'BUSINESS_RULE', 'PAYROLL', 'A revision must start after the current salary started. Past salaries are never overwritten.', 'Backdated salary revision', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 4. Readable labels and tones for the payroll selects and badges (codes unchanged)
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" l
   SET "label" = v.label, "tone" = v.tone
  FROM (VALUES
    ('ComponentType','EARNING','Earning','good'), ('ComponentType','DEDUCTION','Deduction','warn'), ('ComponentType','EMPLOYER_CONTRIBUTION','Employer','violet'),
    ('SalaryComponentCalcMethod','PERCENT_OF','Percentage of','neutral'), ('SalaryComponentCalcMethod','FIXED','Fixed amount','neutral'), ('SalaryComponentCalcMethod','FORMULA','Formula','neutral'),
    ('SalaryComponentCalcMethod','MONTHLY_INPUT','Monthly input','neutral'), ('SalaryComponentCalcMethod','SYSTEM','System (payroll run)','neutral'),
    ('TaxTreatment','EXEMPT_UPTO_LIMIT','Exempt up to limit','info'), ('TaxTreatment','EXEMPT','Exempt','info'), ('TaxTreatment','FULLY_TAXABLE','Fully taxable','neutral'),
    ('SalaryStructureStatus','DRAFT','Draft','warn'), ('SalaryStructureStatus','ACTIVE','Active','good'), ('SalaryStructureStatus','RETIRED','Retired','neutral'),
    ('StructureKind','ADDON','Add-on','good'), ('StructureKind','GRADE','Grade','info'),
    ('RevisionType','INCREMENT','Increment','good'), ('RevisionType','PROMOTION','Promotion','good'),
    ('BaseBasis','COMPONENT','Component','neutral'), ('BaseBasis','GROSS','Gross','neutral'), ('BaseBasis','EOBI_WAGE','EOBI wage (min. wage)','neutral')
  ) AS v(type, code, label, tone)
 WHERE l."lookupType" = v.type AND l.code = v.code AND l."tenantId" IS NULL
   AND (l."label" IS DISTINCT FROM v.label OR l."tone" IS DISTINCT FROM v.tone);
