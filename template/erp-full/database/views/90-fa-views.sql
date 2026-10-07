-- =============================================================================
-- Finsoft ERP (FULL) — views/90-fa-views.sql
-- Fixed-asset register view. Not in Basic (no fa schema tables there).
-- Install after all schema + fk files (views/90-*), before 91-rls.
-- security_invoker = true so tenant RLS on fa.* / core.* / hr.* applies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- FixedAssets.getFixedAssetRegister — app/assets (KPIs Gross Cost / Accumulated
-- Depreciation / Net Book Value / Active Assets, register rows, category
-- chips, cost-by-category panel, "Needs attention" list).
-- additions in a range = acquisitionDate filter; Gross Cost KPI = Σ cost
-- WHERE status <> 'DISPOSED'.
-- est_monthly_charge: WDV nbv × rate ÷ 12, SLM cost × rate ÷ 12, capped at
-- nbv − residual; 0 for NONE / fully depreciated / disposed (same rule as
-- FixedAssets.depreciationRunPost, before month proration).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "FixedAssets"."getFixedAssetRegister"
WITH (security_invoker = true) AS
SELECT a."tenantId",
       a.id                                    AS "assetId",
       a.code,
       a.name,
       a.description,
       a."categoryId",
       c.code                                  AS "categoryCode",
       c.name                                  AS "categoryName",
       a."branchId",
       b.code                                  AS "branchCode",
       b.name                                  AS "branchName",
       a."costCentreId",
       cc.code                                 AS "costCentreCode",
       cc.name                                 AS "costCentreName",
       a."custodianEmployeeId",
       e."displayName"                          AS "custodianName",
       a."tagNo",
       a."serialNo",
       a."registrationNo",
       a."acquisitionDate",
       a.cost,
       a."accumulatedDepreciation",
       a.nbv,
       a."residualValue",
       a.method,
       a."ratePct",
       a."chargeFullMonthOnPurchase",
       a."depreciatedThrough",
       a.status,
       (a.status <> 'DISPOSED')                AS "isActive",
       (a.status = 'FULLY_DEPRECIATED')        AS "isFullyDepreciated",
       a."disposedOn",
       CASE WHEN a.method = 'NONE' OR a.status IN ('FULLY_DEPRECIATED','DISPOSED') THEN 0::numeric
            ELSE LEAST(GREATEST(a.nbv - a."residualValue", 0),
                       round(CASE WHEN a.method = 'WDV' THEN a.nbv ELSE a.cost END
                             * COALESCE(a."ratePct", 0) / 100 / 12, 2))
       END                                     AS "estMonthlyCharge",
       ld."lastCharge",
       ld."lastChargePeriodId",
       ld."lastChargePeriodCode",
       ld."lastChargePostingDate",
       a."vendorId",
       v.name                                  AS "vendorName",
       a."sourceDocType",
       a."sourceDocId",
       a."sourceDocNo",
       a."costAccountId",
       ca.code                                 AS "costAccountCode",
       a."accumDepAccountId",
       ad.code                                 AS "accumDepAccountCode",
       a."depExpenseAccountId",
       de.code                                 AS "depExpenseAccountCode",
       a."taxWdv",
       a.insurer,
       a."insurancePolicyNo",
       a."insuranceExpiry",
       (a.status <> 'DISPOSED' AND a."insuranceExpiry" IS NOT NULL
        AND a."insuranceExpiry" <= current_date + 30)               AS "insuranceExpiring",
       a."lastVerifiedOn",
       (a.status <> 'DISPOSED'
        AND (a."lastVerifiedOn" IS NULL OR a."lastVerifiedOn" < current_date - 365)) AS "verificationDue",
       a."capitalisedByUserId",
       a."createdAt",
       a."updatedAt"
  FROM "FixedAssets"."FixedAssets" a
  JOIN "FixedAssets"."FixedAssetCategories" c   ON c."tenantId" = a."tenantId" AND c.id = a."categoryId"
  JOIN "Company"."Branches" b         ON b."tenantId" = a."tenantId" AND b.id = a."branchId"
  LEFT JOIN "Accounting"."CostCentres" cc ON cc."tenantId" = a."tenantId" AND cc.id = a."costCentreId"
  LEFT JOIN "HumanResources"."Employees" e    ON e."tenantId" = a."tenantId" AND e.id = a."custodianEmployeeId"
  LEFT JOIN "Purchases"."Vendors" v ON v."tenantId" = a."tenantId" AND v.id = a."vendorId"
  LEFT JOIN "Accounting"."ChartOfAccounts" ca   ON ca."tenantId" = a."tenantId" AND ca.id = a."costAccountId"
  LEFT JOIN "Accounting"."ChartOfAccounts" ad   ON ad."tenantId" = a."tenantId" AND ad.id = a."accumDepAccountId"
  LEFT JOIN "Accounting"."ChartOfAccounts" de   ON de."tenantId" = a."tenantId" AND de.id = a."depExpenseAccountId"
  LEFT JOIN LATERAL (
    SELECT rl.charge            AS "lastCharge",
           rl."fiscalPeriodId"  AS "lastChargePeriodId",
           fp.code              AS "lastChargePeriodCode",
           r."postingDate"       AS "lastChargePostingDate"
      FROM "FixedAssets"."DepreciationRunLines" rl
      JOIN "FixedAssets"."DepreciationRuns" r  ON r."tenantId" = rl."tenantId" AND r.id = rl."depreciationRunId"
      JOIN "Accounting"."FiscalPeriods" fp   ON fp."tenantId" = rl."tenantId" AND fp.id = rl."fiscalPeriodId"
     WHERE rl."tenantId" = a."tenantId"
       AND rl."assetId" = a.id
       AND r.status = 'POSTED'
     ORDER BY fp."startDate" DESC
     LIMIT 1
  ) ld ON true
 WHERE a."deletedAt" IS NULL;

COMMENT ON VIEW "FixedAssets"."getFixedAssetRegister" IS
  'Fixed asset register: asset with category, branch, cost centre, custodian, supplier, GL accounts, cost / accumulated depreciation / NBV, method & rate, estimated monthly charge, last posted depreciation charge, insurance-expiring (30 days) and verification-due (no count in 365 days — threshold is a display rule) flags. Screen: app/assets (KPIs, register, cost by category, needs attention).';
