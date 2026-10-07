-- =============================================================================
-- Finsoft ERP (FULL) — views/90-acc-views.sql
-- Accounting report views and period functions over the single ledger
-- (Accounting.Vouchers + Accounting.VoucherLines). Nothing here is stored.
--
-- Install order: 00 → 09 schema → fk/* → views/90-* (this file first) → 91-rls → 95-seed.
-- Every view is WITH (security_invoker = true) so tenant RLS on the base tables
-- applies to the caller; every function is SECURITY INVOKER (the default) and
-- STABLE, so the same RLS applies inside it.
--
-- LEDGER RULES USED BY EVERY VIEW
--   * "In the books" = Accounting.Vouchers.status IN ('POSTED','REVERSED').
--     A REVERSED original stays in the books together with its POSTED mirror
--     (Accounting.voucherReverse), so the pair nets to zero — exactly what the Account
--     Ledger shows ("both legs of a reversal show"). DRAFT and PENDING_APPROVAL
--     vouchers never count.
--   * net_dr = debit − credit. Balances shown "signed" follow Accounting.ChartOfAccounts.nature:
--     DR-nature accounts = debit − credit, CR-nature accounts = credit − debit.
--   * Opening: lines of OB vouchers (Accounting.openingBalancePost) are the opening
--     trial balance. In the plain (all-dates) views "opening" = OB lines; in the
--     range functions "opening" = everything dated before pFrom PLUS any OB
--     voucher dated inside the range (brought-forward position), and the
--     movement columns exclude OB vouchers.
--   * Year-end closing journals (Accounting.FiscalYears.closingJournalEntryId) are
--     excluded from P&L figures (otherwise a closed year would show zero) but
--     included in balances (they move the result into retained earnings).
--
-- PERIOD PATTERN
--   Plain views cover all dates (fiscal-year based where a statement needs a
--   period). When a screen needs an arbitrary date range it calls the function:
--     Accounting.getAccountBalancesForPeriod(pFrom, pTo, pBranchId)          roll-up balances
--     Accounting.getTrialBalanceForPeriod(pFrom, pTo, pBranchId, pLevel)   app/reports/trial-balance
--     Accounting.getGeneralLedgerForPeriod(pFrom, pTo, pAccountId, pBranchId)  app/reports/gl, app/accounting/ledger
--     Accounting.getProfitAndLossForPeriod(pFrom, pTo, pCmpFrom, pCmpTo, pBranchId)  app/reports/pnl
--     Accounting.getBalanceSheetAsAt(pAsAt, pCmpAsAt, pBranchId)    app/reports/balance-sheet
--   pFrom NULL = from the beginning; pBranchId NULL = all branches
--   (consolidated).
--
-- Object order (dependencies first):
--   Accounting.getLedgerLines, Accounting.getAccountTree
--   Accounting.getAccountBalances, Accounting.getAccountBalancesForPeriod
--   Accounting.getTrialBalance, Accounting.getTrialBalanceForPeriod
--   Accounting.getGeneralLedger, Accounting.getGeneralLedgerForPeriod
--   Accounting.getDayBook, Accounting.getVoucherRegister, Accounting.getFiscalPeriodSummary
--   Accounting.getProfitAndLossForPeriod, Accounting.getProfitAndLoss
--   Accounting.getBalanceSheetAsAt, Accounting.getBalanceSheet
-- Full-only (end of this file):
--   Accounting.getCashFlowForPeriod, Accounting.getCashFlow        app/reports/cash-flow
--   Accounting.getBudgetVsActual                   app/budgets, app/budgets/variance
--   Accounting.getCostCentreActuals                 app/accounting/cost-centres
--   Accounting.getProjectProfitAndLoss                        app/accounting/cost-centres
-- The views shared with Basic are identical except for appended Full columns:
--   v_ledger_line / v_general_ledger (+ projectId, employeeId,
--   allocationRuleId[, recurringTemplateId]), v_voucher_register
--   (+ recurringTemplateId), v_period_summary (+ module_locks).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Accounting.getLedgerLines — helper: one row per journal line that is in the books,
-- with its header and account attributes. Base of every report below.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Accounting"."getLedgerLines"
WITH (security_invoker = true) AS
SELECT
  l."tenantId",
  e.id                                        AS "journalEntryId",
  l.id                                        AS "journalLineId",
  l."lineNo",
  e."postingDate",
  e."docDate",
  e."docNo",
  COALESCE(e."sourceDocNo", e."docNo")         AS "displayDocNo",
  e."voucherType",
  e.status,
  e."sourceDocType",
  e."sourceDocId",
  e."sourceDocNo",
  e."referenceNo",
  e."instrumentNo",
  e."fiscalPeriodId",
  e."branchId"                                 AS "entryBranchId",
  l."branchId",
  l."accountId",
  a.code                                      AS "accountCode",
  a.name                                      AS "accountName",
  a."accountClass",
  a.nature,
  a."subType",
  a."parentAccountId",
  l.particulars,
  e.narration,
  COALESCE(l.particulars, e.narration)        AS description,
  l.debit,
  l.credit,
  (l.debit - l.credit)                        AS "netDr",
  CASE WHEN a.nature = 'DR' THEN l.debit - l.credit
       ELSE l.credit - l.debit END            AS "signedAmount",
  l."costCentreId",
  l."customerId",
  l."vendorId",
  l."isAutoContra",
  (e."voucherType" = 'OB')                     AS "isOpening",
  EXISTS (SELECT 1 FROM "Accounting"."FiscalYears" fy
           WHERE fy."tenantId" = e."tenantId"
             AND fy."closingJournalEntryId" = e.id) AS "isClosingEntry",
  e."postedAt",
  -- FULL
  l."projectId",
  l."employeeId",
  l."allocationRuleId",
  e."recurringTemplateId"
FROM "Accounting"."VoucherLines"  l
JOIN "Accounting"."Vouchers" e ON e."tenantId" = l."tenantId" AND e.id = l."journalEntryId"
JOIN "Accounting"."ChartOfAccounts"       a ON a."tenantId" = l."tenantId" AND a.id = l."accountId"
WHERE e.status IN ('POSTED','REVERSED');

COMMENT ON VIEW "Accounting"."getLedgerLines" IS
  'Helper for all ledger reports: journal lines of POSTED/REVERSED entries with header and account attributes; net_dr = debit − credit, signed_amount by account nature, is_opening (OB voucher), is_closing_entry (year-end closing JV). Screens: app/reports/* (via the report views), app/reports/studio "GL transactions".';


-- ---------------------------------------------------------------------------
-- Accounting.getAccountTree — helper: every POSTABLE account paired with itself and
-- each ancestor (HEADER/GROUP) — drives roll-up to parents.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Accounting"."getAccountTree"
WITH (security_invoker = true) AS
WITH RECURSIVE t AS (
  SELECT a."tenantId", a.id AS "accountId", a.id AS "ancestorId",
         a."parentAccountId" AS "nextParentId", 0 AS depth
    FROM "Accounting"."ChartOfAccounts" a
   WHERE a.kind = 'POSTABLE'
  UNION ALL
  SELECT t."tenantId", t."accountId", p.id, p."parentAccountId", t.depth + 1
    FROM t
    JOIN "Accounting"."ChartOfAccounts" p ON p."tenantId" = t."tenantId" AND p.id = t."nextParentId"
   WHERE t.depth < 4
)
SELECT t."tenantId", t."accountId", t."ancestorId", t.depth
  FROM t;

COMMENT ON VIEW "Accounting"."getAccountTree" IS
  'Helper: (postable account, ancestor) pairs including the account itself (depth 0). Used for HEADER/GROUP roll-ups in Accounting.getAccountBalances / Accounting.getAccountBalancesForPeriod. Screen: app/accounting/coa.';


-- ---------------------------------------------------------------------------
-- Accounting.getAccountBalances — app/accounting/coa "Balance" column (roll-up of
-- children for HEADER/GROUP), app/accounting/ledger account picker.
-- One row per account per branch with postings + one consolidated row per
-- account (branchId NULL, is_consolidated = true). All dates.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Accounting"."getAccountBalances"
WITH (security_invoker = true) AS
WITH mv AS (
  SELECT ll."tenantId", ll."accountId", ll."branchId",
         sum(CASE WHEN ll."isOpening" THEN ll."netDr" ELSE 0 END)  AS "openingDr",
         sum(CASE WHEN ll."isOpening" THEN 0 ELSE ll.debit END)   AS debit,
         sum(CASE WHEN ll."isOpening" THEN 0 ELSE ll.credit END)  AS credit,
         count(*) FILTER (WHERE NOT ll."isOpening")               AS "lineCount",
         max(ll."postingDate")                                    AS "lastPostingDate"
    FROM "Accounting"."getLedgerLines" ll
   GROUP BY ll."tenantId", ll."accountId", ll."branchId"
),
roll AS (
  SELECT t."tenantId", t."ancestorId" AS "accountId", mv."branchId",
         sum(mv."openingDr")        AS "openingDr",
         sum(mv.debit)             AS debit,
         sum(mv.credit)            AS credit,
         sum(mv."lineCount")        AS "lineCount",
         max(mv."lastPostingDate") AS "lastPostingDate"
    FROM "Accounting"."getAccountTree" t
    JOIN mv ON mv."tenantId" = t."tenantId" AND mv."accountId" = t."accountId"
   GROUP BY GROUPING SETS ((t."tenantId", t."ancestorId", mv."branchId"),
                           (t."tenantId", t."ancestorId"))
),
b AS (
  SELECT a."tenantId", a.id AS "accountId", a.code, a.name, a.level, a."accountClass", a.nature,
         a.kind, a."subType", a."parentAccountId", a.status, a."currencyCode",
         r."branchId",
         COALESCE(r."openingDr", 0)  AS "openingNetDr",
         COALESCE(r.debit, 0)       AS debit,
         COALESCE(r.credit, 0)      AS credit,
         COALESCE(r."lineCount", 0)  AS "lineCount",
         r."lastPostingDate"
    FROM "Accounting"."ChartOfAccounts" a
    LEFT JOIN roll r ON r."tenantId" = a."tenantId" AND r."accountId" = a.id
   WHERE a."deletedAt" IS NULL
)
SELECT b."tenantId",
       b."accountId",
       b.code,
       b.name,
       b.level,
       b."accountClass",
       b.nature,
       b.kind,
       b."subType",
       b."parentAccountId",
       b.status,
       b."currencyCode",
       b."branchId",                                                -- NULL = all branches
       (b."branchId" IS NULL)                                       AS "isConsolidated",
       CASE WHEN b.nature = 'DR' THEN b."openingNetDr" ELSE -b."openingNetDr" END AS opening,
       b.debit,
       b.credit,
       CASE WHEN b.nature = 'DR' THEN b."openingNetDr" + b.debit - b.credit
            ELSE -(b."openingNetDr" + b.debit - b.credit) END    AS closing,
       b."openingNetDr",
       (b."openingNetDr" + b.debit - b.credit)                     AS "closingNetDr",
       CASE WHEN b."openingNetDr" + b.debit - b.credit > 0 THEN 'DR'
            WHEN b."openingNetDr" + b.debit - b.credit < 0 THEN 'CR' END AS "closingSide",
       b."lineCount",
       b."lastPostingDate"
  FROM b;

COMMENT ON VIEW "Accounting"."getAccountBalances" IS
  'Account balances, all dates (opening = OB vouchers; debit/credit = all other posted movement; closing signed by account nature; *_net_dr = debit-positive). HEADER/GROUP rows roll up their postable descendants. Rows per branch plus a consolidated row (branchId NULL). Screens: app/accounting/coa (Balance column), app/accounting/ledger (account picker). For a date range use Accounting.getAccountBalancesForPeriod.';


-- Accounting.getAccountBalancesForPeriod — same figures for a date range and one branch (or all).
CREATE OR REPLACE FUNCTION "Accounting"."getAccountBalancesForPeriod"("pFrom" date, "pTo" date, "pBranchId" uuid DEFAULT NULL)
RETURNS TABLE ("tenantId" uuid, "accountId" uuid, code text, name text, level smallint, "accountClass" smallint,
               nature text, kind text, "subType" text, "parentAccountId" uuid, status text,
               opening numeric, debit numeric, credit numeric, closing numeric,
               "openingNetDr" numeric, "closingNetDr" numeric, "lineCount" bigint)
LANGUAGE sql STABLE AS $$
  WITH mv AS (
    SELECT ll."tenantId", ll."accountId",
           COALESCE(sum(ll."netDr") FILTER (WHERE ll."isOpening"
                                              OR ll."postingDate" < COALESCE("pFrom", '-infinity'::date)), 0) AS "openingDr",
           COALESCE(sum(ll.debit)  FILTER (WHERE NOT ll."isOpening"
                                              AND ll."postingDate" >= COALESCE("pFrom", '-infinity'::date)), 0) AS debit,
           COALESCE(sum(ll.credit) FILTER (WHERE NOT ll."isOpening"
                                              AND ll."postingDate" >= COALESCE("pFrom", '-infinity'::date)), 0) AS credit,
           count(*) FILTER (WHERE NOT ll."isOpening"
                              AND ll."postingDate" >= COALESCE("pFrom", '-infinity'::date))             AS "lineCount"
      FROM "Accounting"."getLedgerLines" ll
     WHERE ll."postingDate" <= COALESCE("pTo", 'infinity'::date)
       AND ("pBranchId" IS NULL OR ll."branchId" = "pBranchId")
     GROUP BY ll."tenantId", ll."accountId"
  ),
  roll AS (
    SELECT t."tenantId", t."ancestorId" AS "accountId",
           sum(mv."openingDr") AS "openingDr", sum(mv.debit) AS debit,
           sum(mv.credit) AS credit, sum(mv."lineCount") AS "lineCount"
      FROM "Accounting"."getAccountTree" t
      JOIN mv ON mv."tenantId" = t."tenantId" AND mv."accountId" = t."accountId"
     GROUP BY t."tenantId", t."ancestorId"
  )
  SELECT a."tenantId", a.id, a.code, a.name, a.level, a."accountClass", a.nature::text, a.kind, a."subType",
         a."parentAccountId", a.status,
         CASE WHEN a.nature = 'DR' THEN COALESCE(r."openingDr", 0) ELSE -COALESCE(r."openingDr", 0) END,
         COALESCE(r.debit, 0),
         COALESCE(r.credit, 0),
         CASE WHEN a.nature = 'DR' THEN COALESCE(r."openingDr", 0) + COALESCE(r.debit, 0) - COALESCE(r.credit, 0)
              ELSE -(COALESCE(r."openingDr", 0) + COALESCE(r.debit, 0) - COALESCE(r.credit, 0)) END,
         COALESCE(r."openingDr", 0),
         COALESCE(r."openingDr", 0) + COALESCE(r.debit, 0) - COALESCE(r.credit, 0),
         COALESCE(r."lineCount", 0)::bigint
    FROM "Accounting"."ChartOfAccounts" a
    LEFT JOIN roll r ON r."tenantId" = a."tenantId" AND r."accountId" = a.id
   WHERE a."deletedAt" IS NULL
$$;

COMMENT ON FUNCTION "Accounting"."getAccountBalancesForPeriod"(date, date, uuid) IS
  'Account balances for a range, rolled up to HEADER/GROUP accounts. opening = posted lines before pFrom + OB vouchers dated up to pTo; debit/credit = non-OB movement from pFrom to pTo; pFrom NULL = from the beginning; pBranchId NULL = consolidated. Screens: app/accounting/coa, app/accounting/ledger, app/reports/trial-balance.';


-- ---------------------------------------------------------------------------
-- Accounting.getTrialBalance — app/reports/trial-balance, app/reports (TB difference
-- status), app/periods/close (pre-close check). All dates. Filter level = 4
-- for the posting-level TB (Σ closingDr = Σ closingCr); level 2/3 for the
-- "Account Level" option. branchId NULL = consolidated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Accounting"."getTrialBalance"
WITH (security_invoker = true) AS
SELECT b."tenantId",
       b."accountId",
       b.code,
       b.name,
       b."accountClass",
       CASE b."accountClass" WHEN 1 THEN 'Assets' WHEN 2 THEN 'Liabilities' WHEN 3 THEN 'Equity'
                            WHEN 4 THEN 'Income' ELSE 'Expenses' END AS "className",
       b.level,
       b.kind,
       b.nature,
       b."parentAccountId",
       b."branchId",
       b."isConsolidated",
       GREATEST(b."openingNetDr", 0)        AS "openingDr",
       GREATEST(-b."openingNetDr", 0)       AS "openingCr",
       b.debit                              AS "movementDr",
       b.credit                             AS "movementCr",
       GREATEST(b."closingNetDr", 0)        AS "closingDr",
       GREATEST(-b."closingNetDr", 0)       AS "closingCr"
  FROM "Accounting"."getAccountBalances" b;

COMMENT ON VIEW "Accounting"."getTrialBalance" IS
  'Trial balance, all dates: opening Dr/Cr (OB vouchers), movement Dr/Cr, closing Dr/Cr (net shown on its side), every level (filter level = 4 to prove Dr = Cr). Screens: app/reports/trial-balance, app/reports (books balanced status), app/periods/close. Date range: Accounting.getTrialBalanceForPeriod.';


-- Accounting.getTrialBalanceForPeriod — app/reports/trial-balance for a period / branch / level.
CREATE OR REPLACE FUNCTION "Accounting"."getTrialBalanceForPeriod"("pFrom" date, "pTo" date, "pBranchId" uuid DEFAULT NULL,
                                                "pLevel" integer DEFAULT 4)
RETURNS TABLE ("tenantId" uuid, "accountId" uuid, code text, name text, "accountClass" smallint, "className" text,
               level smallint, kind text, nature text, "parentAccountId" uuid,
               "openingDr" numeric, "openingCr" numeric, "movementDr" numeric, "movementCr" numeric,
               "closingDr" numeric, "closingCr" numeric)
LANGUAGE sql STABLE AS $$
  SELECT f."tenantId", f."accountId", f.code, f.name, f."accountClass",
         CASE f."accountClass" WHEN 1 THEN 'Assets' WHEN 2 THEN 'Liabilities' WHEN 3 THEN 'Equity'
                              WHEN 4 THEN 'Income' ELSE 'Expenses' END,
         f.level, f.kind, f.nature, f."parentAccountId",
         GREATEST(f."openingNetDr", 0), GREATEST(-f."openingNetDr", 0),
         f.debit, f.credit,
         GREATEST(f."closingNetDr", 0), GREATEST(-f."closingNetDr", 0)
    FROM "Accounting"."getAccountBalancesForPeriod"("pFrom", "pTo", "pBranchId") f
   WHERE f.level = COALESCE("pLevel", 4)
   ORDER BY f."tenantId", f.code
$$;

COMMENT ON FUNCTION "Accounting"."getTrialBalanceForPeriod"(date, date, uuid, integer) IS
  'Trial balance for a period (opening = before pFrom + OB vouchers; movement in range; closing at pTo) at account level pLevel (default 4 = posting accounts). Screen: app/reports/trial-balance (Period, Branch, Account Level controls).';


-- ---------------------------------------------------------------------------
-- Accounting.getGeneralLedger — app/reports/gl, app/accounting/ledger (rows, Contra
-- account filter), app/accounting/coa drawer "Recent postings".
-- balance / balanceNetDr = running balance of the account after this line
-- over ALL history and all branches (window by postingDate, OB first,
-- docNo, lineNo), so filtering a date range keeps correct balances.
-- For an opening row and branch-filtered running balances use
-- Accounting.getGeneralLedgerForPeriod.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Accounting"."getGeneralLedger"
WITH (security_invoker = true) AS
SELECT ll."tenantId",
       ll."journalEntryId",
       ll."journalLineId",
       ll."lineNo",
       ll."postingDate",
       ll."docDate",
       ll."docNo",
       ll."displayDocNo",
       ll."voucherType",
       ll.status,
       ll."sourceDocType",
       ll."sourceDocId",
       ll."sourceDocNo",
       ll."referenceNo",
       ll."instrumentNo",
       ll."fiscalPeriodId",
       ll."entryBranchId",
       ll."branchId",
       ll."accountId",
       ll."accountCode",
       ll."accountName",
       ll."accountClass",
       ll.nature,
       ll."subType",
       ll.particulars,
       ll.narration,
       ll.description,
       ll.debit,
       ll.credit,
       CASE WHEN ll.debit > 0 THEN 'DR' ELSE 'CR' END              AS side,
       ll."costCentreId",
       ll."customerId",
       ll."vendorId",
       ll."isOpening",
       ll."isAutoContra",
       c."contraAccountIds",
       c."contraAccounts",
       sum(ll."netDr") OVER w                                       AS "balanceNetDr",
       CASE WHEN ll.nature = 'DR' THEN sum(ll."netDr") OVER w
            ELSE -sum(ll."netDr") OVER w END                        AS balance,
       CASE WHEN sum(ll."netDr") OVER w > 0 THEN 'DR'
            WHEN sum(ll."netDr") OVER w < 0 THEN 'CR' END           AS "balanceSide",
       -- FULL
       ll."projectId",
       ll."employeeId",
       ll."allocationRuleId"
  FROM "Accounting"."getLedgerLines" ll
  LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT l2."accountId")                               AS "contraAccountIds",
           string_agg(DISTINCT a2.code || ' ' || a2.name, ' · ')          AS "contraAccounts"
      FROM "Accounting"."VoucherLines" l2
      JOIN "Accounting"."ChartOfAccounts" a2 ON a2."tenantId" = l2."tenantId" AND a2.id = l2."accountId"
     WHERE l2."tenantId" = ll."tenantId"
       AND l2."journalEntryId" = ll."journalEntryId"
       AND l2.id <> ll."journalLineId"
       AND (l2.debit > 0) <> (ll.debit > 0)
  ) c ON true
WINDOW w AS (PARTITION BY ll."tenantId", ll."accountId"
             ORDER BY ll."postingDate", ll."isOpening" DESC, ll."docNo", ll."lineNo", ll."journalLineId"
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW);

COMMENT ON VIEW "Accounting"."getGeneralLedger" IS
  'General ledger lines (POSTED + REVERSED entries) with contra accounts and running balance per account (signed by nature; balance_side Dr/Cr). Screens: app/reports/gl, app/accounting/ledger, app/accounting/coa (Recent postings drawer), app/reports/studio (GL transactions). Opening row / branch-filtered running balance: Accounting.getGeneralLedgerForPeriod.';


-- Accounting.getGeneralLedgerForPeriod — ledger for a range with an OPENING row per account.
CREATE OR REPLACE FUNCTION "Accounting"."getGeneralLedgerForPeriod"("pFrom" date, "pTo" date,
                                                 "pAccountId" uuid DEFAULT NULL, "pBranchId" uuid DEFAULT NULL)
RETURNS TABLE ("tenantId" uuid, "rowKind" text, "accountId" uuid, "accountCode" text, "accountName" text, nature text,
               "postingDate" date, "journalEntryId" uuid, "journalLineId" uuid, "lineNo" smallint,
               "docNo" text, "displayDocNo" text, "voucherType" text, "sourceDocType" text,
               description text, "referenceNo" text, "instrumentNo" text, "branchId" uuid, "costCentreId" uuid,
               debit numeric, credit numeric, "balanceNetDr" numeric, balance numeric)
LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT ll.*
      FROM "Accounting"."getLedgerLines" ll
     WHERE ll."postingDate" <= COALESCE("pTo", 'infinity'::date)
       AND ("pAccountId" IS NULL OR ll."accountId" = "pAccountId")
       AND ("pBranchId"  IS NULL OR ll."branchId"  = "pBranchId")
  ),
  opening AS (
    SELECT b."tenantId", b."accountId", b."accountCode", b."accountName", b.nature,
           COALESCE(sum(b."netDr") FILTER (WHERE b."isOpening"
                                            OR b."postingDate" < COALESCE("pFrom", '-infinity'::date)), 0) AS "netDr"
      FROM base b
     GROUP BY b."tenantId", b."accountId", b."accountCode", b."accountName", b.nature
  ),
  entries AS (
    SELECT b.*,
           o."netDr" + sum(b."netDr") OVER (PARTITION BY b."tenantId", b."accountId"
                                          ORDER BY b."postingDate", b."docNo", b."lineNo", b."journalLineId"
                                          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "runDr"
      FROM base b
      JOIN opening o ON o."tenantId" = b."tenantId" AND o."accountId" = b."accountId"
     WHERE NOT b."isOpening"
       AND b."postingDate" >= COALESCE("pFrom", '-infinity'::date)
  )
  SELECT u."tenantId", u."rowKind", u."accountId", u."accountCode", u."accountName", u.nature,
         u."postingDate", u."journalEntryId", u."journalLineId", u."lineNo",
         u."docNo", u."displayDocNo", u."voucherType", u."sourceDocType",
         u.description, u."referenceNo", u."instrumentNo", u."branchId", u."costCentreId",
         u.debit, u.credit, u."balanceNetDr", u.balance
    FROM (
      SELECT o."tenantId", 'OPENING'::text AS "rowKind", o."accountId", o."accountCode", o."accountName",
             o.nature::text AS nature, "pFrom" AS "postingDate", NULL::uuid AS "journalEntryId",
             NULL::uuid AS "journalLineId", NULL::smallint AS "lineNo", NULL::text AS "docNo",
             NULL::text AS "displayDocNo", NULL::text AS "voucherType", NULL::text AS "sourceDocType",
             'Opening balance'::text AS description, NULL::text AS "referenceNo", NULL::text AS "instrumentNo",
             "pBranchId" AS "branchId", NULL::uuid AS "costCentreId",
             0::numeric AS debit, 0::numeric AS credit, o."netDr" AS "balanceNetDr",
             CASE WHEN o.nature = 'DR' THEN o."netDr" ELSE -o."netDr" END AS balance
        FROM opening o
      UNION ALL
      SELECT e."tenantId", 'ENTRY'::text, e."accountId", e."accountCode", e."accountName",
             e.nature::text, e."postingDate", e."journalEntryId", e."journalLineId", e."lineNo", e."docNo",
             e."displayDocNo", e."voucherType", e."sourceDocType", e.description, e."referenceNo",
             e."instrumentNo", e."branchId", e."costCentreId", e.debit, e.credit, e."runDr",
             CASE WHEN e.nature = 'DR' THEN e."runDr" ELSE -e."runDr" END
        FROM entries e
    ) u
   ORDER BY u."tenantId", u."accountCode", u."rowKind" DESC, u."postingDate", u."docNo", u."lineNo"
$$;

COMMENT ON FUNCTION "Accounting"."getGeneralLedgerForPeriod"(date, date, uuid, uuid) IS
  'General ledger for a range: one OPENING row per account (posted lines before pFrom + OB vouchers) followed by ENTRY rows with a running balance starting from that opening, optionally for one account and/or one branch. Screens: app/accounting/ledger (KPIs Opening/Debits/Credits/Closing), app/reports/gl.';


-- ---------------------------------------------------------------------------
-- Accounting.getDayBook — app/reports/day-book: one row per posted voucher.
-- book: CPV/CRV → CASH; BPV/BRV/CON → BANK; purchase documents → PURCHASES;
-- sales documents → SALES; everything else → JOURNAL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Accounting"."getDayBook"
WITH (security_invoker = true) AS
SELECT e."tenantId",
       e.id                                                    AS "journalEntryId",
       e."postingDate",
       e."docDate",
       e."postedAt",
       (e."postedAt" AT TIME ZONE COALESCE(cp.timezone, 'Asia/Karachi'))::time AS "postedTimeLocal",
       e."docNo",
       COALESCE(e."sourceDocNo", e."docNo")                     AS "displayDocNo",
       e."voucherType",
       e."sourceDocType",
       e."sourceDocId",
       e."sourceDocNo",
       CASE WHEN e."voucherType" IN ('CPV','CRV')                  THEN 'CASH'
            WHEN e."voucherType" IN ('BPV','BRV','CON')            THEN 'BANK'
            WHEN e."sourceDocType" IN ('BILL','PV','GRN','DN','PR','LC') THEN 'PURCHASES'
            WHEN e."sourceDocType" IN ('INV','SV','WS','POS','CN','SR','RCPT') THEN 'SALES'
            ELSE 'JOURNAL' END                                 AS book,
       x."debitAccounts",
       x."creditAccounts",
       x."lineCount",
       e.narration,
       e."referenceNo",
       e."branchId",
       e."preparedByUserId",
       pu."fullName"                                            AS "preparedByName",
       e."postedByUserId",
       qu."fullName"                                            AS "postedByName",
       e."totalDebit",
       e."totalCredit",
       (e."totalDebit" = e."totalCredit")                        AS "isBalanced",
       e.status
  FROM "Accounting"."Vouchers" e
  LEFT JOIN "Company"."CompanySettings" cp ON cp."tenantId" = e."tenantId"
  LEFT JOIN "Company"."Users" pu ON pu."tenantId" = e."tenantId" AND pu.id = e."preparedByUserId"
  LEFT JOIN "Company"."Users" qu ON qu."tenantId" = e."tenantId" AND qu.id = e."postedByUserId"
  LEFT JOIN LATERAL (
    SELECT string_agg(a.code || ' ' || a.name, ' · ' ORDER BY l."lineNo") FILTER (WHERE l.debit > 0)  AS "debitAccounts",
           string_agg(a.code || ' ' || a.name, ' · ' ORDER BY l."lineNo") FILTER (WHERE l.credit > 0) AS "creditAccounts",
           count(*)                                                                                  AS "lineCount"
      FROM "Accounting"."VoucherLines" l
      JOIN "Accounting"."ChartOfAccounts" a ON a."tenantId" = l."tenantId" AND a.id = l."accountId"
     WHERE l."tenantId" = e."tenantId" AND l."journalEntryId" = e.id
  ) x ON true
 WHERE e.status IN ('POSTED','REVERSED');

COMMENT ON VIEW "Accounting"."getDayBook" IS
  'Day book: every posted voucher (POSTED + REVERSED) with book (CASH/BANK/PURCHASES/SALES/JOURNAL), debit and credit account lists, preparer/poster and totals; filter postingDate for one day. Screen: app/reports/day-book.';


-- ---------------------------------------------------------------------------
-- Accounting.getVoucherRegister — app/accounting/vouchers (register rows, chips,
-- KPIs: total vouchers, total debit, pending approval, drafts oldest n days;
-- filters Amount above, Has attachments, Created by me). All statuses.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Accounting"."getVoucherRegister"
WITH (security_invoker = true) AS
SELECT e."tenantId",
       e.id                                             AS "journalEntryId",
       e."docNo",
       e."docDate",
       e."postingDate",
       e."voucherType",
       e.status,
       e."referenceNo",
       e.tags,
       COALESCE(e."referenceNo", e.tags[1])              AS "subLabel",
       e.narration,
       e.department,
       e."sourceDocType",
       e."sourceDocId",
       e."sourceDocNo",
       e."cashBankAccountId",
       cb.code                                          AS "cashBankAccountCode",
       cb.name                                          AS "cashBankAccountName",
       e."instrumentType",
       e."instrumentNo",
       e."instrumentDate",
       e."partyName",
       e."branchId",
       br.code                                          AS "branchCode",
       br.name                                          AS "branchName",
       (COALESCE(ls."branchCount", 0) > 1)               AS "spansBranches",
       COALESCE(ls."lineCount", 0)                       AS "lineCount",
       e."totalDebit",
       e."totalCredit",
       (e."totalDebit" = e."totalCredit" AND e."totalDebit" > 0) AS "isBalanced",
       e."currencyCode",
       e."preparedByUserId",
       pu."fullName"                                     AS "preparedByName",
       e."submittedAt",
       e."approvedByUserId",
       au."fullName"                                     AS "approvedByName",
       e."approvedAt",
       e."postedByUserId",
       e."postedAt",
       e."fiscalPeriodId",
       fp.code                                          AS "fiscalPeriodCode",
       e."reversalOfId",
       ro."docNo"                                        AS "reversalOfDocNo",
       e."reversedById",
       rb."docNo"                                        AS "reversedByDocNo",
       e."reversalDate",
       e."reversalReason",
       e."autoReverseOn",
       COALESCE(att."attachmentCount", 0)                AS "attachmentCount",
       (COALESCE(att."attachmentCount", 0) > 0)          AS "hasAttachments",
       CASE WHEN e.status = 'DRAFT' THEN current_date - e."createdAt"::date END AS "draftAgeDays",
       e."createdAt",
       e."updatedAt",
       -- FULL
       e."recurringTemplateId"
  FROM "Accounting"."Vouchers" e
  LEFT JOIN "Company"."Branches"      br ON br."tenantId" = e."tenantId" AND br.id = e."branchId"
  LEFT JOIN "Accounting"."ChartOfAccounts"      cb ON cb."tenantId" = e."tenantId" AND cb.id = e."cashBankAccountId"
  LEFT JOIN "Company"."Users"    pu ON pu."tenantId" = e."tenantId" AND pu.id = e."preparedByUserId"
  LEFT JOIN "Company"."Users"    au ON au."tenantId" = e."tenantId" AND au.id = e."approvedByUserId"
  LEFT JOIN "Accounting"."FiscalPeriods" fp ON fp."tenantId" = e."tenantId" AND fp.id = e."fiscalPeriodId"
  LEFT JOIN "Accounting"."Vouchers" ro ON ro."tenantId" = e."tenantId" AND ro.id = e."reversalOfId"
  LEFT JOIN "Accounting"."Vouchers" rb ON rb."tenantId" = e."tenantId" AND rb.id = e."reversedById"
  LEFT JOIN LATERAL (
    SELECT count(*) AS "lineCount", count(DISTINCT l."branchId") AS "branchCount"
      FROM "Accounting"."VoucherLines" l
     WHERE l."tenantId" = e."tenantId" AND l."journalEntryId" = e.id
  ) ls ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS "attachmentCount"
      FROM "Company"."Attachments" t
     WHERE t."tenantId" = e."tenantId" AND t."entityId" = e.id AND t."deletedAt" IS NULL
  ) att ON true;

COMMENT ON VIEW "Accounting"."getVoucherRegister" IS
  'Voucher register: every journal (all statuses) with branch, preparer/approver, period, reversal links, line and attachment counts, draft age. Screen: app/accounting/vouchers (rows, type chips, KPIs, filters).';


-- ---------------------------------------------------------------------------
-- Accounting.getFiscalPeriodSummary — app/periods "Periods" table: Vouchers / Drafts per
-- period, status, closed/locked by.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Accounting"."getFiscalPeriodSummary"
WITH (security_invoker = true) AS
SELECT fp."tenantId",
       fp.id                                     AS "fiscalPeriodId",
       fp."fiscalYearId",
       fy.code                                   AS "fiscalYearCode",
       fy.status                                 AS "fiscalYearStatus",
       fy."isLocked"                              AS "fiscalYearLocked",
       fp."periodNo",
       fp.code,
       fp."startDate",
       fp."endDate",
       fp."isAdjustment",
       fp.status,
       (NOT fp."isAdjustment" AND current_date BETWEEN fp."startDate" AND fp."endDate") AS "isCurrent",
       fp."closeTargetDate",
       fp."closedAt",
       fp."closedByUserId",
       cu."fullName"                              AS "closedByName",
       fp."lockedAt",
       fp."lockedByUserId",
       lu."fullName"                              AS "lockedByName",
       COALESCE(s."voucherCount", 0)              AS "voucherCount",
       COALESCE(s."draftCount", 0)                AS "draftCount",
       COALESCE(s."pendingCount", 0)              AS "pendingCount",
       COALESCE(s."postedDebit", 0)               AS "postedDebit",
       -- FULL: "Modules (All locked · AR, AP, GL closed …)" — {"GL":"CLOSED","AR":"OPEN",…}
       ml."moduleLocks"
  FROM "Accounting"."FiscalPeriods" fp
  JOIN "Accounting"."FiscalYears" fy ON fy."tenantId" = fp."tenantId" AND fy.id = fp."fiscalYearId"
  LEFT JOIN "Company"."Users" cu ON cu."tenantId" = fp."tenantId" AND cu.id = fp."closedByUserId"
  LEFT JOIN "Company"."Users" lu ON lu."tenantId" = fp."tenantId" AND lu.id = fp."lockedByUserId"
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE je.status IN ('POSTED','REVERSED') AND je."fiscalPeriodId" = fp.id) AS "voucherCount",
           count(*) FILTER (WHERE je.status = 'DRAFT'
                              AND (je."fiscalPeriodId" = fp.id
                                   OR (je."fiscalPeriodId" IS NULL AND NOT fp."isAdjustment")))  AS "draftCount",
           count(*) FILTER (WHERE je.status = 'PENDING_APPROVAL'
                              AND (je."fiscalPeriodId" = fp.id
                                   OR (je."fiscalPeriodId" IS NULL AND NOT fp."isAdjustment")))  AS "pendingCount",
           sum(je."totalDebit") FILTER (WHERE je.status IN ('POSTED','REVERSED') AND je."fiscalPeriodId" = fp.id) AS "postedDebit"
      FROM "Accounting"."Vouchers" je
     WHERE je."tenantId" = fp."tenantId"
       AND (je."fiscalPeriodId" = fp.id
            OR (je."fiscalPeriodId" IS NULL AND je."postingDate" BETWEEN fp."startDate" AND fp."endDate"))
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_object_agg(m."moduleCode", m.status ORDER BY m."moduleCode") AS "moduleLocks"
      FROM "Accounting"."PeriodModuleLocks" m
     WHERE m."tenantId" = fp."tenantId" AND m."fiscalPeriodId" = fp.id
  ) ml ON true;

COMMENT ON VIEW "Accounting"."getFiscalPeriodSummary" IS
  'Fiscal periods with posted voucher count (by resolved fiscalPeriodId), draft and pending-approval counts (by postingDate while unresolved), posted debit total, current-period flag, closed/locked by and (Full) module locks. Screens: app/periods, app/periods/close.';


-- ---------------------------------------------------------------------------
-- Accounting.getProfitAndLossForPeriod / Accounting.getProfitAndLoss — app/reports/pnl, app/reports
-- (Revenue YTD, Net profit), app/periods (Profit to date), app/periods/close.
-- Sections from Accounting.ChartOfAccounts.subType:
--   SALES → REVENUE · COST_OF_SALES → COST_OF_SALES ·
--   EMPLOYEE_COST, PREMISES, DEPRECIATION, GENERAL_EXPENSE → OPERATING_EXPENSES ·
--   OTHER_INCOME, FINANCE_INCOME → OTHER_INCOME · FINANCE_COST → FINANCE_COST ·
--   TAXATION → TAXATION.
-- amount_* are shown on the section's natural side (income: credit − debit,
-- expense: debit − credit); contra accounts (class 4 Dr-nature, e.g. sales
-- returns & discounts) come out negative and are labelled "Less: …".
-- profit_effect_* = credit − debit: Σ over all lines = net profit.
-- variance = cy − py; varianceFavourable is positive when favourable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Accounting"."getProfitAndLossForPeriod"("pFrom" date, "pTo" date,
                                              "pCmpFrom" date DEFAULT NULL, "pCmpTo" date DEFAULT NULL,
                                              "pBranchId" uuid DEFAULT NULL)
RETURNS TABLE ("tenantId" uuid, section text, "sectionOrder" integer, "sectionLabel" text, "isIncomeSection" boolean,
               "accountId" uuid, code text, name text, "lineLabel" text, "isContra" boolean, "subType" text,
               "groupAccountId" uuid, "groupCode" text, "groupName" text,
               "amountCy" numeric, "amountPy" numeric, variance numeric, "varianceFavourable" numeric,
               "pctOfRevenue" numeric, "pctOfRevenuePy" numeric,
               "profitEffectCy" numeric, "profitEffectPy" numeric)
LANGUAGE sql STABLE AS $$
  WITH rng AS (
    SELECT "pFrom" AS "cyFrom", "pTo" AS "cyTo",
           COALESCE("pCmpFrom", ("pFrom" - interval '1 year')::date) AS "pyFrom",
           COALESCE("pCmpTo",   ("pTo"   - interval '1 year')::date) AS "pyTo"
  ),
  mv AS (
    SELECT ll."tenantId", ll."accountId",
           COALESCE(sum(ll.credit - ll.debit) FILTER (WHERE ll."postingDate" BETWEEN r."cyFrom" AND r."cyTo"), 0) AS "cyCr",
           COALESCE(sum(ll.credit - ll.debit) FILTER (WHERE ll."postingDate" BETWEEN r."pyFrom" AND r."pyTo"), 0) AS "pyCr"
      FROM "Accounting"."getLedgerLines" ll
     CROSS JOIN rng r
     WHERE ll."accountClass" IN (4, 5)
       AND NOT ll."isClosingEntry"
       AND ("pBranchId" IS NULL OR ll."branchId" = "pBranchId")
       AND (ll."postingDate" BETWEEN r."cyFrom" AND r."cyTo" OR ll."postingDate" BETWEEN r."pyFrom" AND r."pyTo")
     GROUP BY ll."tenantId", ll."accountId"
  ),
  lines AS (
    SELECT a."tenantId", a.id AS "accountId", a.code, a.name, a."subType",
           ((a."accountClass" = 4 AND a.nature = 'DR') OR (a."accountClass" = 5 AND a.nature = 'CR')) AS "isContra",
           g.id AS "groupAccountId", g.code AS "groupCode", g.name AS "groupName",
           s.section, s."sectionOrder", s."sectionLabel", s."isIncome",
           COALESCE(mv."cyCr", 0) AS "cyCr",
           COALESCE(mv."pyCr", 0) AS "pyCr"
      FROM "Accounting"."ChartOfAccounts" a
      LEFT JOIN mv ON mv."tenantId" = a."tenantId" AND mv."accountId" = a.id
      LEFT JOIN "Accounting"."ChartOfAccounts" g ON g."tenantId" = a."tenantId" AND g.id = a."parentAccountId"
     CROSS JOIN LATERAL (
       SELECT CASE WHEN a."subType" = 'SALES'                     THEN 'REVENUE'
                   WHEN a."subType" = 'COST_OF_SALES'             THEN 'COST_OF_SALES'
                   WHEN a."subType" IN ('OTHER_INCOME','FINANCE_INCOME') THEN 'OTHER_INCOME'
                   WHEN a."subType" = 'FINANCE_COST'              THEN 'FINANCE_COST'
                   WHEN a."subType" = 'TAXATION'                  THEN 'TAXATION'
                   WHEN a."accountClass" = 4                      THEN 'OTHER_INCOME'
                   ELSE 'OPERATING_EXPENSES' END AS section,
              CASE WHEN a."subType" = 'SALES'                     THEN 1
                   WHEN a."subType" = 'COST_OF_SALES'             THEN 2
                   WHEN a."subType" IN ('OTHER_INCOME','FINANCE_INCOME') THEN 4
                   WHEN a."subType" = 'FINANCE_COST'              THEN 5
                   WHEN a."subType" = 'TAXATION'                  THEN 6
                   WHEN a."accountClass" = 4                      THEN 4
                   ELSE 3 END AS "sectionOrder",
              CASE WHEN a."subType" = 'SALES'                     THEN 'Revenue'
                   WHEN a."subType" = 'COST_OF_SALES'             THEN 'Cost of sales'
                   WHEN a."subType" IN ('OTHER_INCOME','FINANCE_INCOME') THEN 'Other income'
                   WHEN a."subType" = 'FINANCE_COST'              THEN 'Finance cost'
                   WHEN a."subType" = 'TAXATION'                  THEN 'Taxation'
                   WHEN a."accountClass" = 4                      THEN 'Other income'
                   ELSE 'Operating expenses' END AS "sectionLabel",
              (a."accountClass" = 4) AS "isIncome"
     ) s
     WHERE a.kind = 'POSTABLE'
       AND a."accountClass" IN (4, 5)
       AND (a."deletedAt" IS NULL OR mv."accountId" IS NOT NULL)
  ),
  signed AS (
    SELECT l.*,
           CASE WHEN l."isIncome" THEN l."cyCr" ELSE -l."cyCr" END AS "amtCy",
           CASE WHEN l."isIncome" THEN l."pyCr" ELSE -l."pyCr" END AS "amtPy"
      FROM lines l
  )
  SELECT s."tenantId", s.section, s."sectionOrder", s."sectionLabel", s."isIncome",
         s."accountId", s.code, s.name,
         CASE WHEN s."isContra" THEN 'Less: ' || s.name ELSE s.name END,
         s."isContra", s."subType", s."groupAccountId", s."groupCode", s."groupName",
         s."amtCy", s."amtPy",
         s."amtCy" - s."amtPy",
         CASE WHEN s."isIncome" THEN s."amtCy" - s."amtPy" ELSE s."amtPy" - s."amtCy" END,
         round(100 * s."amtCy" / NULLIF(sum(s."amtCy") FILTER (WHERE s.section = 'REVENUE')
                                       OVER (PARTITION BY s."tenantId"), 0), 2),
         round(100 * s."amtPy" / NULLIF(sum(s."amtPy") FILTER (WHERE s.section = 'REVENUE')
                                       OVER (PARTITION BY s."tenantId"), 0), 2),
         s."cyCr", s."pyCr"
    FROM signed s
   ORDER BY s."tenantId", s."sectionOrder", s.code
$$;

COMMENT ON FUNCTION "Accounting"."getProfitAndLossForPeriod"(date, date, date, date, uuid) IS
  'Profit & loss lines (postable class 4–5 accounts) for pFrom..p_to vs a comparative range (default: same range one year earlier): section, lineLabel, amountCy, amountPy, variance, varianceFavourable, % of net revenue. Excludes year-end closing journals. Screen: app/reports/pnl (Period, Comparison, Branch controls); app/periods/close (closing entries preview).';

CREATE OR REPLACE VIEW "Accounting"."getProfitAndLoss"
WITH (security_invoker = true) AS
SELECT fy."tenantId",
       fy.id              AS "fiscalYearId",
       fy.code            AS "fiscalYearCode",
       r."periodFrom",
       r."periodTo",
       r."comparativeFrom",
       r."comparativeTo",
       f.section,
       f."sectionOrder",
       f."sectionLabel",
       f."isIncomeSection",
       f."accountId",
       f.code,
       f.name,
       f."lineLabel",
       f."isContra",
       f."subType",
       f."groupAccountId",
       f."groupCode",
       f."groupName",
       f."amountCy",
       f."amountPy",
       f.variance,
       f."varianceFavourable",
       f."pctOfRevenue",
       f."pctOfRevenuePy",
       f."profitEffectCy",
       f."profitEffectPy"
  FROM "Accounting"."FiscalYears" fy
 CROSS JOIN LATERAL (
   SELECT fy."startDate"                                         AS "periodFrom",
          LEAST(fy."endDate", current_date)                      AS "periodTo",
          (fy."startDate" - interval '1 year')::date             AS "comparativeFrom",
          (LEAST(fy."endDate", current_date) - interval '1 year')::date AS "comparativeTo"
 ) r
 CROSS JOIN LATERAL "Accounting"."getProfitAndLossForPeriod"(r."periodFrom", r."periodTo", r."comparativeFrom", r."comparativeTo") f
 WHERE f."tenantId" = fy."tenantId";

COMMENT ON VIEW "Accounting"."getProfitAndLoss" IS
  'Profit & loss per fiscal year: amountCy = fiscal year to date (to today for the current year, full year once ended), amountPy = the same span one year earlier. Σ profitEffectCy = net profit. Screens: app/reports/pnl, app/reports (Revenue YTD, Net profit), app/periods (Profit to date), app/periods/close. Arbitrary ranges: Accounting.getProfitAndLossForPeriod.';


-- ---------------------------------------------------------------------------
-- Accounting.getBalanceSheetAsAt / Accounting.getBalanceSheet — app/reports/balance-sheet,
-- app/reports (Total assets / liabilities).
-- Sections: class 1 FIXED_ASSET, DEPOSIT → NON_CURRENT_ASSETS, other class 1 →
-- CURRENT_ASSETS · class 3 → EQUITY · class 2 BORROWING →
-- NON_CURRENT_LIABILITIES, other class 2 → CURRENT_LIABILITIES.
-- Assets = debit − credit; equity & liabilities = credit − debit.
-- Plus one EQUITY line "Profit for the period": Σ (credit − debit) of class
-- 4–5 to the date, closing journals included = result not yet transferred
-- to retained earnings, so Assets = Equity + Liabilities.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Accounting"."getBalanceSheetAsAt"("pAsAt" date, "pCmpAsAt" date DEFAULT NULL,
                                                "pBranchId" uuid DEFAULT NULL)
RETURNS TABLE ("tenantId" uuid, side text, section text, "sectionOrder" integer, "sectionLabel" text, "lineOrder" integer,
               "accountId" uuid, code text, name text, "lineLabel" text, "subType" text,
               "groupAccountId" uuid, "groupCode" text, "groupName" text,
               "amountCy" numeric, "amountPy" numeric, change numeric, "comparativeAsAt" date)
LANGUAGE sql STABLE AS $$
  WITH rng AS (
    SELECT "pAsAt" AS "cyAt",
           COALESCE("pCmpAsAt",
                    (SELECT max(fy."endDate") FROM "Accounting"."FiscalYears" fy WHERE fy."endDate" < "pAsAt"),
                    ("pAsAt" - interval '1 year')::date) AS "pyAt"
  ),
  mv AS (
    SELECT ll."tenantId", ll."accountId", ll."accountClass",
           COALESCE(sum(ll."netDr") FILTER (WHERE ll."postingDate" <= r."cyAt"), 0) AS "cyDr",
           COALESCE(sum(ll."netDr") FILTER (WHERE ll."postingDate" <= r."pyAt"), 0) AS "pyDr"
      FROM "Accounting"."getLedgerLines" ll
     CROSS JOIN rng r
     WHERE ll."postingDate" <= GREATEST(r."cyAt", r."pyAt")
       AND ("pBranchId" IS NULL OR ll."branchId" = "pBranchId")
     GROUP BY ll."tenantId", ll."accountId", ll."accountClass"
  ),
  accts AS (
    SELECT a."tenantId", a.id AS "accountId", a.code, a.name, a."subType",
           g.id AS "groupAccountId", g.code AS "groupCode", g.name AS "groupName",
           s.side, s.section, s."sectionOrder", s."sectionLabel", (a."accountClass" = 1) AS "isAsset",
           COALESCE(mv."cyDr", 0) AS "cyDr",
           COALESCE(mv."pyDr", 0) AS "pyDr"
      FROM "Accounting"."ChartOfAccounts" a
      LEFT JOIN mv ON mv."tenantId" = a."tenantId" AND mv."accountId" = a.id
      LEFT JOIN "Accounting"."ChartOfAccounts" g ON g."tenantId" = a."tenantId" AND g.id = a."parentAccountId"
     CROSS JOIN LATERAL (
       SELECT CASE WHEN a."accountClass" = 1 THEN 'ASSETS' ELSE 'EQUITY_AND_LIABILITIES' END AS side,
              CASE WHEN a."accountClass" = 1 AND a."subType" IN ('FIXED_ASSET','DEPOSIT') THEN 'NON_CURRENT_ASSETS'
                   WHEN a."accountClass" = 1                                         THEN 'CURRENT_ASSETS'
                   WHEN a."accountClass" = 3                                         THEN 'EQUITY'
                   WHEN a."subType" = 'BORROWING'                                    THEN 'NON_CURRENT_LIABILITIES'
                   ELSE 'CURRENT_LIABILITIES' END AS section,
              CASE WHEN a."accountClass" = 1 AND a."subType" IN ('FIXED_ASSET','DEPOSIT') THEN 1
                   WHEN a."accountClass" = 1                                         THEN 2
                   WHEN a."accountClass" = 3                                         THEN 3
                   WHEN a."subType" = 'BORROWING'                                    THEN 4
                   ELSE 5 END AS "sectionOrder",
              CASE WHEN a."accountClass" = 1 AND a."subType" IN ('FIXED_ASSET','DEPOSIT') THEN 'Non-current assets'
                   WHEN a."accountClass" = 1                                         THEN 'Current assets'
                   WHEN a."accountClass" = 3                                         THEN 'Equity'
                   WHEN a."subType" = 'BORROWING'                                    THEN 'Non-current liabilities'
                   ELSE 'Current liabilities' END AS "sectionLabel"
     ) s
     WHERE a.kind = 'POSTABLE'
       AND a."accountClass" IN (1, 2, 3)
       AND (a."deletedAt" IS NULL OR mv."accountId" IS NOT NULL)
  ),
  profit AS (
    SELECT mv."tenantId", -sum(mv."cyDr") AS "cyCr", -sum(mv."pyDr") AS "pyCr"
      FROM mv
     WHERE mv."accountClass" IN (4, 5)
     GROUP BY mv."tenantId"
  )
  SELECT u."tenantId", u.side, u.section, u."sectionOrder", u."sectionLabel", u."lineOrder",
         u."accountId", u.code, u.name, u."lineLabel", u."subType",
         u."groupAccountId", u."groupCode", u."groupName",
         u."amountCy", u."amountPy", u."amountCy" - u."amountPy", r."pyAt"
    FROM (
      SELECT ac."tenantId", ac.side, ac.section, ac."sectionOrder", ac."sectionLabel", 1 AS "lineOrder",
             ac."accountId", ac.code, ac.name, ac.name AS "lineLabel", ac."subType",
             ac."groupAccountId", ac."groupCode", ac."groupName",
             CASE WHEN ac."isAsset" THEN ac."cyDr" ELSE -ac."cyDr" END AS "amountCy",
             CASE WHEN ac."isAsset" THEN ac."pyDr" ELSE -ac."pyDr" END AS "amountPy"
        FROM accts ac
      UNION ALL
      SELECT p."tenantId", 'EQUITY_AND_LIABILITIES'::text, 'EQUITY'::text, 3, 'Equity'::text, 2,
             NULL::uuid, NULL::text, NULL::text, 'Profit for the period'::text, NULL::text,
             NULL::uuid, NULL::text, NULL::text,
             p."cyCr", p."pyCr"
        FROM profit p
    ) u
   CROSS JOIN rng r
   ORDER BY u."tenantId", u."sectionOrder", u."lineOrder", u.code
$$;

COMMENT ON FUNCTION "Accounting"."getBalanceSheetAsAt"(date, date, uuid) IS
  'Balance sheet as at pAsAt vs pCmpAsAt (default: last fiscal year end before pAsAt): section, lineLabel, amountCy, amountPy, change; includes the unclosed "Profit for the period" equity line so Assets = Equity + Liabilities. Screen: app/reports/balance-sheet (as-at date, Comparison, Branch).';

CREATE OR REPLACE VIEW "Accounting"."getBalanceSheet"
WITH (security_invoker = true) AS
SELECT fy."tenantId",
       fy.id                     AS "fiscalYearId",
       fy.code                   AS "fiscalYearCode",
       r."asAt",
       r."comparativeAsAt",
       f.side,
       f.section,
       f."sectionOrder",
       f."sectionLabel",
       f."lineOrder",
       f."accountId",
       f.code,
       f.name,
       f."lineLabel",
       f."subType",
       f."groupAccountId",
       f."groupCode",
       f."groupName",
       f."amountCy",
       f."amountPy",
       f.change
  FROM "Accounting"."FiscalYears" fy
 CROSS JOIN LATERAL (
   SELECT LEAST(fy."endDate", current_date)  AS "asAt",
          (fy."startDate" - 1)               AS "comparativeAsAt"
 ) r
 CROSS JOIN LATERAL "Accounting"."getBalanceSheetAsAt"(r."asAt", r."comparativeAsAt") f
 WHERE f."tenantId" = fy."tenantId";

COMMENT ON VIEW "Accounting"."getBalanceSheet" IS
  'Balance sheet per fiscal year: amountCy as at today (current year) or the year end, amountPy as at the previous year end (day before the year starts), change. Screens: app/reports/balance-sheet, app/reports (Total Assets / Total Liabilities). Any as-at date: Accounting.getBalanceSheetAsAt.';


-- =============================================================================
-- FULL-ONLY VIEWS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Accounting.getCashFlowForPeriod / Accounting.getCashFlow — app/reports/cash-flow (indirect method).
-- Movements in the range exclude OB vouchers and year-end closing journals.
--   OPERATING: profit before tax (class 4–5 except TAXATION), add back
--     DEPRECIATION and FINANCE_COST, working-capital changes = Σ (credit −
--     debit) on INVENTORY / RECEIVABLE / PREPAYMENT+DEPOSIT / PAYABLE /
--     ACCRUAL / TAX+STATUTORY accounts, finance cost paid, income tax paid
--     (= TAXATION expense; the provision sits in the TAX payable change), and
--     "Other non-cash items" = the balancing figure so the statement always
--     reconciles to the cash & bank balances (gain/loss on disposal, accumulated
--     depreciation released, reserve movements …).
--   INVESTING: additions = debits to Dr-nature FIXED_ASSET accounts; disposal
--     proceeds from FixedAssets.AssetDisposals (POSTED, by disposalDate).
--   FINANCING: Σ (credit − debit) on BORROWING and CAPITAL + DRAWINGS.
--   CASH: net increase = Σ (debit − credit) on CASH + BANK accounts; opening =
--     cash & bank before pFrom (+ OB vouchers); closing = opening + increase.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Accounting"."getCashFlowForPeriod"("pFrom" date, "pTo" date, "pBranchId" uuid DEFAULT NULL)
RETURNS TABLE ("tenantId" uuid, activity text, "activityOrder" integer, "activityLabel" text,
               "lineOrder" integer, "lineLabel" text, amount numeric, subtotal numeric)
LANGUAGE sql STABLE AS $$
  WITH mv AS (
    SELECT ll."tenantId",
           COALESCE(sum(ll.credit - ll.debit) FILTER (WHERE ll."accountClass" IN (4, 5)
                                                        AND ll."subType" IS DISTINCT FROM 'TAXATION'), 0) AS pbt,
           COALESCE(sum(ll.debit - ll.credit) FILTER (WHERE ll."subType" = 'DEPRECIATION'), 0)          AS depreciation,
           COALESCE(sum(ll.debit - ll.credit) FILTER (WHERE ll."subType" = 'FINANCE_COST'), 0)          AS "financeCost",
           COALESCE(sum(ll.debit - ll.credit) FILTER (WHERE ll."subType" = 'TAXATION'), 0)              AS "taxExpense",
           COALESCE(sum(ll.credit - ll.debit) FILTER (WHERE ll."subType" = 'INVENTORY'), 0)             AS "wcInventory",
           COALESCE(sum(ll.credit - ll.debit) FILTER (WHERE ll."subType" = 'RECEIVABLE'), 0)            AS "wcReceivable",
           COALESCE(sum(ll.credit - ll.debit) FILTER (WHERE ll."subType" IN ('PREPAYMENT','DEPOSIT')), 0) AS "wcAdvances",
           COALESCE(sum(ll.credit - ll.debit) FILTER (WHERE ll."subType" = 'PAYABLE'), 0)               AS "wcPayable",
           COALESCE(sum(ll.credit - ll.debit) FILTER (WHERE ll."subType" = 'ACCRUAL'), 0)               AS "wcAccrual",
           COALESCE(sum(ll.credit - ll.debit) FILTER (WHERE ll."subType" IN ('TAX','STATUTORY')), 0)    AS "wcTax",
           COALESCE(sum(-ll.debit) FILTER (WHERE ll."subType" = 'FIXED_ASSET' AND ll.nature = 'DR'), 0) AS capex,
           COALESCE(sum(ll.credit - ll.debit) FILTER (WHERE ll."subType" = 'BORROWING'), 0)             AS borrowing,
           COALESCE(sum(ll.credit - ll.debit) FILTER (WHERE ll."subType" IN ('CAPITAL','DRAWINGS')), 0) AS equity,
           COALESCE(sum(ll.debit - ll.credit) FILTER (WHERE ll."subType" IN ('CASH','BANK')), 0)        AS "cashDelta"
      FROM "Accounting"."getLedgerLines" ll
     WHERE ll."postingDate" BETWEEN "pFrom" AND "pTo"
       AND NOT ll."isOpening"
       AND NOT ll."isClosingEntry"
       AND ("pBranchId" IS NULL OR ll."branchId" = "pBranchId")
     GROUP BY ll."tenantId"
  ),
  "cashOpen" AS (
    SELECT ll."tenantId", sum(ll."netDr") AS "openingCash"
      FROM "Accounting"."getLedgerLines" ll
     WHERE ll."subType" IN ('CASH','BANK')
       AND (ll."postingDate" < "pFrom" OR (ll."isOpening" AND ll."postingDate" <= "pTo"))
       AND ("pBranchId" IS NULL OR ll."branchId" = "pBranchId")
     GROUP BY ll."tenantId"
  ),
  disp AS (
    SELECT d."tenantId", sum(d.proceeds) AS proceeds
      FROM "FixedAssets"."AssetDisposals" d
      JOIN "FixedAssets"."FixedAssets" "faA" ON "faA"."tenantId" = d."tenantId" AND "faA".id = d."assetId"
     WHERE d.status = 'POSTED'
       AND d."disposalDate" BETWEEN "pFrom" AND "pTo"
       AND ("pBranchId" IS NULL OR "faA"."branchId" = "pBranchId")
     GROUP BY d."tenantId"
  ),
  t AS (
    SELECT mv."tenantId" FROM mv
    UNION
    SELECT co."tenantId" FROM "cashOpen" co
  ),
  b AS (
    SELECT t."tenantId",
           COALESCE(mv.pbt, 0)           AS pbt,
           COALESCE(mv.depreciation, 0)  AS depreciation,
           COALESCE(mv."financeCost", 0)  AS "financeCost",
           COALESCE(mv."taxExpense", 0)   AS "taxExpense",
           COALESCE(mv."wcInventory", 0)  AS "wcInventory",
           COALESCE(mv."wcReceivable", 0) AS "wcReceivable",
           COALESCE(mv."wcAdvances", 0)   AS "wcAdvances",
           COALESCE(mv."wcPayable", 0)    AS "wcPayable",
           COALESCE(mv."wcAccrual", 0)    AS "wcAccrual",
           COALESCE(mv."wcTax", 0)        AS "wcTax",
           COALESCE(mv.capex, 0)         AS capex,
           COALESCE(dp.proceeds, 0)      AS proceeds,
           COALESCE(mv.borrowing, 0)     AS borrowing,
           COALESCE(mv.equity, 0)        AS equity,
           COALESCE(mv."cashDelta", 0)    AS "cashDelta",
           COALESCE(co."openingCash", 0)  AS "openingCash"
      FROM t
      LEFT JOIN mv           ON mv."tenantId" = t."tenantId"
      LEFT JOIN "cashOpen" co ON co."tenantId" = t."tenantId"
      LEFT JOIN disp dp      ON dp."tenantId" = t."tenantId"
  ),
  lines AS (
    SELECT b."tenantId", x.activity, x."activityOrder", x."activityLabel", x."lineOrder", x."lineLabel", x.amount
      FROM b
     CROSS JOIN LATERAL (VALUES
       ('OPERATING', 1, 'A. Cash flows from operating activities', 10, 'Profit before tax',                         b.pbt),
       ('OPERATING', 1, 'A. Cash flows from operating activities', 20, 'Add: depreciation',                         b.depreciation),
       ('OPERATING', 1, 'A. Cash flows from operating activities', 30, 'Add: finance cost',                         b."financeCost"),
       ('OPERATING', 1, 'A. Cash flows from operating activities', 40, '(Increase) / decrease in stock-in-trade',   b."wcInventory"),
       ('OPERATING', 1, 'A. Cash flows from operating activities', 41, '(Increase) / decrease in trade debts',      b."wcReceivable"),
       ('OPERATING', 1, 'A. Cash flows from operating activities', 42, '(Increase) / decrease in advances, deposits & prepayments', b."wcAdvances"),
       ('OPERATING', 1, 'A. Cash flows from operating activities', 43, 'Increase / (decrease) in trade & other payables', b."wcPayable"),
       ('OPERATING', 1, 'A. Cash flows from operating activities', 44, 'Increase / (decrease) in accrued liabilities', b."wcAccrual"),
       ('OPERATING', 1, 'A. Cash flows from operating activities', 45, 'Increase / (decrease) in sales tax, WHT & statutory payables', b."wcTax"),
       ('OPERATING', 1, 'A. Cash flows from operating activities', 50, 'Finance cost paid',                         -b."financeCost"),
       ('OPERATING', 1, 'A. Cash flows from operating activities', 60, 'Income tax paid',                           -b."taxExpense"),
       ('OPERATING', 1, 'A. Cash flows from operating activities', 70, 'Other non-cash items (disposal gain / loss, other movements)',
          b."cashDelta" - (b.pbt + b.depreciation + b."wcInventory" + b."wcReceivable" + b."wcAdvances"
                          + b."wcPayable" + b."wcAccrual" + b."wcTax" - b."taxExpense"
                          + b.capex + b.proceeds + b.borrowing + b.equity)),
       ('INVESTING', 2, 'B. Cash flows from investing activities', 10, 'Purchase of property, plant & equipment / CWIP', b.capex),
       ('INVESTING', 2, 'B. Cash flows from investing activities', 20, 'Proceeds from disposal of fixed assets',    b.proceeds),
       ('FINANCING', 3, 'C. Cash flows from financing activities', 10, 'Long-term financing & running finance (net)', b.borrowing),
       ('FINANCING', 3, 'C. Cash flows from financing activities', 20, 'Capital introduced / (drawings)',           b.equity),
       ('CASH',      4, 'Cash & cash equivalents',                 10, 'Net increase / (decrease) in cash (A + B + C)', b."cashDelta"),
       ('CASH',      4, 'Cash & cash equivalents',                 20, 'Cash & cash equivalents at start of period', b."openingCash"),
       ('CASH',      4, 'Cash & cash equivalents',                 30, 'Cash & cash equivalents at end of period', b."openingCash" + b."cashDelta")
     ) AS x (activity, "activityOrder", "activityLabel", "lineOrder", "lineLabel", amount)
  )
  SELECT l."tenantId", l.activity::text, l."activityOrder"::integer, l."activityLabel"::text,
         l."lineOrder"::integer, l."lineLabel"::text, l.amount::numeric,
         CASE WHEN l.activity <> 'CASH'
              THEN sum(l.amount) OVER (PARTITION BY l."tenantId", l.activity) END::numeric
    FROM lines l
   ORDER BY l."tenantId", l."activityOrder", l."lineOrder"
$$;

COMMENT ON FUNCTION "Accounting"."getCashFlowForPeriod"(date, date, uuid) IS
  'Statement of cash flows (indirect) for pFrom..p_to: activity OPERATING / INVESTING / FINANCING / CASH, lineLabel, amount, subtotal per activity; reconciles to the CASH + BANK account balances by construction ("Other non-cash items" balances). Screen: app/reports/cash-flow.';

CREATE OR REPLACE VIEW "Accounting"."getCashFlow"
WITH (security_invoker = true) AS
SELECT fy."tenantId",
       fy.id                 AS "fiscalYearId",
       fy.code               AS "fiscalYearCode",
       r."periodFrom",
       r."periodTo",
       f.activity,
       f."activityOrder",
       f."activityLabel",
       f."lineOrder",
       f."lineLabel",
       f.amount,
       f.subtotal
  FROM "Accounting"."FiscalYears" fy
 CROSS JOIN LATERAL (
   SELECT fy."startDate"                    AS "periodFrom",
          LEAST(fy."endDate", current_date) AS "periodTo"
 ) r
 CROSS JOIN LATERAL "Accounting"."getCashFlowForPeriod"(r."periodFrom", r."periodTo") f
 WHERE f."tenantId" = fy."tenantId";

COMMENT ON VIEW "Accounting"."getCashFlow" IS
  'Cash flow statement per fiscal year to date (indirect method; see Accounting.getCashFlowForPeriod for line rules). Screen: app/reports/cash-flow. Other ranges / branch: Accounting.getCashFlowForPeriod.';


-- ---------------------------------------------------------------------------
-- Accounting.getBudgetVsActual — app/budgets/variance, app/budgets (Utilised),
-- app/reports (Comparison = Budget). One row per budget version line per
-- fiscal month (m01 = first month of the budget's fiscal year).
-- Actual = posted lines on the line's account in that month, restricted to
-- the line's cost centre (else the budget's), the budget's project and
-- branch when set. Income accounts (class 4): actual = credit − debit, others
-- debit − credit. variance is favourable-positive (income: actual − budget;
-- costs: budget − actual).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Accounting"."getBudgetVsActual"
WITH (security_invoker = true) AS
WITH act AS (
  SELECT ll."tenantId", ll."accountId", ll."costCentreId", ll."projectId", ll."branchId",
         date_trunc('month', ll."postingDate")::date AS "monthStart",
         sum(ll.debit - ll.credit)                  AS "netDr"
    FROM "Accounting"."getLedgerLines" ll
   WHERE NOT ll."isOpening"
     AND NOT ll."isClosingEntry"
   GROUP BY ll."tenantId", ll."accountId", ll."costCentreId", ll."projectId", ll."branchId",
            date_trunc('month', ll."postingDate")::date
),
base AS (
  SELECT b."tenantId", b.id AS "budgetId", b.code AS "budgetCode", b.name AS "budgetName", b."budgetType",
         b.status AS "budgetStatus", b."fiscalYearId", fy.code AS "fiscalYearCode",
         bv.id AS "budgetVersionId", bv."versionNo", bv.status AS "versionStatus",
         (bv.id = b."currentVersionId") AS "isCurrentVersion",
         bl.id AS "budgetLineId", bl."accountId", a.code AS "accountCode", a.name AS "accountName",
         a."accountClass", a."subType", a."parentAccountId" AS "groupAccountId",
         g.code AS "groupCode", g.name AS "groupName",
         COALESCE(bl."costCentreId", b."costCentreId") AS "costCentreId",
         b."projectId", b."branchId", b.department,
         m."monthNo", m."monthStart",
         m."budgetAmount"
    FROM "Accounting"."Budgets" b
    JOIN "Accounting"."FiscalYears"    fy ON fy."tenantId" = b."tenantId" AND fy.id = b."fiscalYearId"
    JOIN "Accounting"."BudgetVersions" bv ON bv."tenantId" = b."tenantId" AND bv."budgetId" = b.id
    JOIN "Accounting"."BudgetVersionLines"    bl ON bl."tenantId" = bv."tenantId" AND bl."budgetVersionId" = bv.id
    JOIN "Accounting"."ChartOfAccounts"        a  ON a."tenantId" = bl."tenantId" AND a.id = bl."accountId"
    LEFT JOIN "Accounting"."ChartOfAccounts"   g  ON g."tenantId" = a."tenantId" AND g.id = a."parentAccountId"
   CROSS JOIN LATERAL (
     SELECT k AS "monthNo",
            (date_trunc('month', fy."startDate") + make_interval(months => k - 1))::date AS "monthStart",
            (ARRAY[bl.m01, bl.m02, bl.m03, bl.m04, bl.m05, bl.m06,
                   bl.m07, bl.m08, bl.m09, bl.m10, bl.m11, bl.m12])[k] AS "budgetAmount"
       FROM generate_series(1, 12) AS k
   ) m
)
SELECT x."tenantId",
       x."budgetId",
       x."budgetCode",
       x."budgetName",
       x."budgetType",
       x."budgetStatus",
       x."fiscalYearId",
       x."fiscalYearCode",
       x."budgetVersionId",
       x."versionNo",
       x."versionStatus",
       x."isCurrentVersion",
       x."budgetLineId",
       x."accountId",
       x."accountCode",
       x."accountName",
       x."accountClass",
       x."subType",
       x."groupAccountId",
       x."groupCode",
       x."groupName",
       x."costCentreId",
       cc.code                                                       AS "costCentreCode",
       cc.name                                                       AS "costCentreName",
       x."projectId",
       x."branchId",
       x.department,
       x."monthNo",
       ((x."monthNo" - 1) / 3 + 1)                                    AS "quarterNo",
       x."monthStart",
       (x."monthStart" + interval '1 month' - interval '1 day')::date AS "monthEnd",
       x."budgetAmount",
       COALESCE(y."actualAmount", 0)                                  AS "actualAmount",
       CASE WHEN x."accountClass" = 4 THEN COALESCE(y."actualAmount", 0) - x."budgetAmount"
            ELSE x."budgetAmount" - COALESCE(y."actualAmount", 0) END  AS variance,
       round(100 * (CASE WHEN x."accountClass" = 4 THEN COALESCE(y."actualAmount", 0) - x."budgetAmount"
                         ELSE x."budgetAmount" - COALESCE(y."actualAmount", 0) END)
                 / NULLIF(x."budgetAmount", 0), 2)                    AS "variancePct",
       round(100 * COALESCE(y."actualAmount", 0) / NULLIF(x."budgetAmount", 0), 2) AS "utilisationPct",
       (x."accountClass" <> 4 AND COALESCE(y."actualAmount", 0) > x."budgetAmount") AS "isOverBudget"
  FROM base x
  LEFT JOIN "Accounting"."CostCentres" cc ON cc."tenantId" = x."tenantId" AND cc.id = x."costCentreId"
  LEFT JOIN LATERAL (
    SELECT sum(CASE WHEN x."accountClass" = 4 THEN -act."netDr" ELSE act."netDr" END) AS "actualAmount"
      FROM act
     WHERE act."tenantId"   = x."tenantId"
       AND act."accountId"  = x."accountId"
       AND act."monthStart" = x."monthStart"
       AND (x."costCentreId" IS NULL OR act."costCentreId" = x."costCentreId")
       AND (x."projectId"     IS NULL OR act."projectId"     = x."projectId")
       AND (x."branchId"      IS NULL OR act."branchId"      = x."branchId")
  ) y ON true;

COMMENT ON VIEW "Accounting"."getBudgetVsActual" IS
  'Budget vs actual per budget version line per fiscal month: budgetAmount (m01..m12), actual_amount (posted ledger), variance (favourable positive), variancePct, utilisation_pct, is_over_budget; is_current_version marks the version shown. Screens: app/budgets/variance (KPIs, by department, by month, variance by account), app/budgets (Utilised bar), app/reports studio comparison "Budget (v3)".';


-- ---------------------------------------------------------------------------
-- Accounting.getCostCentreActuals — app/accounting/cost-centres (Budget YTD / Actual
-- to date / Remaining KPIs, budget vs actual by category, burn chart).
-- One row per cost centre × account × month. actual_amount rolls up all
-- descendant cost centres (branch node = Σ departments); direct_amount =
-- lines tagged to the centre itself. Amounts are debit − credit (spend
-- positive; income tagged to a centre comes out negative).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Accounting"."getCostCentreActuals"
WITH (security_invoker = true) AS
WITH RECURSIVE "ccTree" AS (
  SELECT c."tenantId", c.id AS "costCentreId", c.id AS "ancestorId", 0 AS depth
    FROM "Accounting"."CostCentres" c
  UNION ALL
  SELECT t."tenantId", t."costCentreId", p."parentCostCentreId", t.depth + 1
    FROM "ccTree" t
    JOIN "Accounting"."CostCentres" p ON p."tenantId" = t."tenantId" AND p.id = t."ancestorId"
   WHERE p."parentCostCentreId" IS NOT NULL
     AND t.depth < 10
),
act AS (
  SELECT ll."tenantId", ll."costCentreId", ll."accountId",
         date_trunc('month', ll."postingDate")::date                                  AS "monthStart",
         sum(ll.debit - ll.credit)                                                   AS "netDr",
         COALESCE(sum(ll.debit - ll.credit) FILTER (WHERE ll."allocationRuleId" IS NOT NULL), 0) AS "allocatedDr",
         count(*)                                                                    AS "lineCount"
    FROM "Accounting"."getLedgerLines" ll
   WHERE ll."costCentreId" IS NOT NULL
     AND NOT ll."isOpening"
     AND NOT ll."isClosingEntry"
   GROUP BY ll."tenantId", ll."costCentreId", ll."accountId", date_trunc('month', ll."postingDate")::date
)
SELECT c."tenantId",
       c.id                         AS "costCentreId",
       c.code                       AS "costCentreCode",
       c.name                       AS "costCentreName",
       c."centreType",
       c."parentCostCentreId",
       c."branchId",
       c."annualBudget",
       c.status                     AS "costCentreStatus",
       a.id                         AS "accountId",
       a.code                       AS "accountCode",
       a.name                       AS "accountName",
       a."accountClass",
       a."subType",
       g.id                         AS "groupAccountId",
       g.code                       AS "groupCode",
       g.name                       AS "groupName",
       fy.id                        AS "fiscalYearId",
       fy.code                      AS "fiscalYearCode",
       act."monthStart",
       sum(act."netDr")                                              AS "actualAmount",
       COALESCE(sum(act."netDr") FILTER (WHERE t."costCentreId" = c.id), 0) AS "directAmount",
       sum(act."allocatedDr")                                        AS "allocatedAmount",
       sum(act."lineCount")                                          AS "lineCount"
  FROM "Accounting"."CostCentres" c
  JOIN "ccTree" t           ON t."tenantId" = c."tenantId" AND t."ancestorId" = c.id
  JOIN act                 ON act."tenantId" = t."tenantId" AND act."costCentreId" = t."costCentreId"
  JOIN "Accounting"."ChartOfAccounts" a       ON a."tenantId" = act."tenantId" AND a.id = act."accountId"
  LEFT JOIN "Accounting"."ChartOfAccounts" g  ON g."tenantId" = a."tenantId" AND g.id = a."parentAccountId"
  LEFT JOIN "Accounting"."FiscalYears" fy ON fy."tenantId" = c."tenantId"
                              AND act."monthStart" BETWEEN fy."startDate" AND fy."endDate"
 WHERE c."deletedAt" IS NULL
 GROUP BY c."tenantId", c.id, c.code, c.name, c."centreType", c."parentCostCentreId", c."branchId",
          c."annualBudget", c.status, a.id, a.code, a.name, a."accountClass", a."subType",
          g.id, g.code, g.name, fy.id, fy.code, act."monthStart";

COMMENT ON VIEW "Accounting"."getCostCentreActuals" IS
  'Actual spend per cost centre × account × month (posted ledger, debit − credit), rolled up to parent centres (actual_amount) with direct_amount and allocation-rule share (allocatedAmount); annualBudget from Accounting.CostCentres, monthly budgets in Accounting.getBudgetVsActual. Screen: app/accounting/cost-centres (KPIs, budget vs actual by category, burn chart). Category mapping on screen is [simulated].';


-- ---------------------------------------------------------------------------
-- Accounting.getProjectProfitAndLoss — app/accounting/cost-centres "Project P&L".
-- Revenue = class 4 (credit − debit), direct cost = class 5 (debit − credit),
-- capex = FIXED_ASSET debits net, on lines tagged with the project.
-- Allocated overheads (6%) and the 18% target margin are [simulated] in the
-- prototype and not stored.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "Accounting"."getProjectProfitAndLoss"
WITH (security_invoker = true) AS
WITH act AS (
  SELECT ll."tenantId", ll."projectId",
         COALESCE(sum(ll.credit - ll.debit) FILTER (WHERE ll."accountClass" = 4), 0)                 AS revenue,
         COALESCE(sum(ll.debit - ll.credit) FILTER (WHERE ll."accountClass" = 5), 0)                 AS "directCost",
         COALESCE(sum(ll.debit - ll.credit) FILTER (WHERE ll."subType" = 'FIXED_ASSET'), 0)          AS capex,
         COALESCE(sum(ll.debit - ll.credit) FILTER (WHERE ll."allocationRuleId" IS NOT NULL), 0)    AS "allocatedCost",
         min(ll."postingDate")                                                                       AS "firstPostingDate",
         max(ll."postingDate")                                                                       AS "lastPostingDate",
         count(*)                                                                                   AS "lineCount"
    FROM "Accounting"."getLedgerLines" ll
   WHERE ll."projectId" IS NOT NULL
     AND NOT ll."isOpening"
     AND NOT ll."isClosingEntry"
   GROUP BY ll."tenantId", ll."projectId"
)
SELECT p."tenantId",
       p.id                                                       AS "projectId",
       p.code,
       p.name,
       p.status,
       p.colour,
       p."startDate",
       p."endDate",
       p."ownerEmployeeId",
       e."displayName"                                             AS "ownerName",
       tg.tags,
       p."budgetAmount",
       p."expectedRevenue",
       COALESCE(x.revenue, 0)                                     AS revenue,
       COALESCE(x."directCost", 0)                                 AS "directCost",
       COALESCE(x."allocatedCost", 0)                              AS "allocatedCost",
       COALESCE(x.revenue, 0) - COALESCE(x."directCost", 0)        AS margin,
       round(100 * (COALESCE(x.revenue, 0) - COALESCE(x."directCost", 0))
                 / NULLIF(COALESCE(x.revenue, 0), 0), 2)          AS "marginPct",
       COALESCE(x.capex, 0)                                       AS capex,
       COALESCE(x."directCost", 0) + COALESCE(x.capex, 0)          AS "spendToDate",
       p."budgetAmount" - (COALESCE(x."directCost", 0) + COALESCE(x.capex, 0)) AS "budgetRemaining",
       round(100 * (COALESCE(x."directCost", 0) + COALESCE(x.capex, 0))
                 / NULLIF(p."budgetAmount", 0), 2)                 AS "budgetUsedPct",
       x."firstPostingDate",
       x."lastPostingDate",
       COALESCE(x."lineCount", 0)                                  AS "lineCount"
  FROM "Accounting"."Projects" p
  LEFT JOIN act x ON x."tenantId" = p."tenantId" AND x."projectId" = p.id
  LEFT JOIN "HumanResources"."Employees" e ON e."tenantId" = p."tenantId" AND e.id = p."ownerEmployeeId"
  LEFT JOIN LATERAL (
    SELECT array_agg(pt.tag ORDER BY pt.tag) AS tags
      FROM "Accounting"."ProjectTags" pt
     WHERE pt."tenantId" = p."tenantId" AND pt."projectId" = p.id
  ) tg ON true
 WHERE p."deletedAt" IS NULL;

COMMENT ON VIEW "Accounting"."getProjectProfitAndLoss" IS
  'Project P&L from posted lines tagged with projectId: revenue, direct cost, margin, margin %, capex, spend vs budgetAmount, expectedRevenue; allocated_cost = lines created by allocation rules. Overhead 6% and target margin 18% are [simulated] (not stored). Screen: app/accounting/cost-centres (Project P&L, project KPIs).';
