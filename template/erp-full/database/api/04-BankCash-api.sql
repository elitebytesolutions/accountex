-- =============================================================================
-- Finsoft ERP (Full edition) — API: "BankCash"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- Banks: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "BankCash"."bankAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."Banks";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."Banks", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "BankCash"."Banks" ("tenantId", code, name, "shortName", "swiftBic", "ibanBankCode", "isIslamic", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'shortName' THEN "vRec"."shortName" ELSE NULL END, CASE WHEN "pData" ? 'swiftBic' THEN "vRec"."swiftBic" ELSE NULL END, CASE WHEN "pData" ? 'ibanBankCode' THEN "vRec"."ibanBankCode" ELSE NULL END, CASE WHEN "pData" ? 'isIslamic' THEN "vRec"."isIslamic" ELSE FALSE END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "BankCash"."Banks" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "shortName" = CASE WHEN "pData" ? 'shortName' THEN "vRec"."shortName" ELSE t."shortName" END,
           "swiftBic" = CASE WHEN "pData" ? 'swiftBic' THEN "vRec"."swiftBic" ELSE t."swiftBic" END,
           "ibanBankCode" = CASE WHEN "pData" ? 'ibanBankCode' THEN "vRec"."ibanBankCode" ELSE t."ibanBankCode" END,
           "isIslamic" = CASE WHEN "pData" ? 'isIslamic' THEN "vRec"."isIslamic" ELSE t."isIslamic" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."Banks" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Banks %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Banks % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."bankAddUpdate"(jsonb) IS 'Save (insert or update) one Banks record.';

-- Banks: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "BankCash"."getBankInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "BankCash"."Banks" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getBankInfo"(uuid) IS 'Read one Banks record (getter for its screens).';

-- BankAccounts: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "BankCash"."bankAccountAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."BankAccounts";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."BankAccounts", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "BankCash"."BankAccounts" ("tenantId", "bankId", "branchId", "accountType", "accountTitle", "accountNo", iban, "bankBranch", "accountId", "currencyCode", "openingBalance", "openingBalanceDate", "creditLimit", "markupTerms", purpose, "statementImportEnabled", "statementFormat", "useForPayroll", "reconciledTo", "lastStatementBalance", "lastStatementDate", status, "closedOn")
    VALUES ("vTenant", CASE WHEN "pData" ? 'bankId' THEN "vRec"."bankId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'accountType' THEN "vRec"."accountType" ELSE 'CURRENT' END, CASE WHEN "pData" ? 'accountTitle' THEN "vRec"."accountTitle" ELSE NULL END, CASE WHEN "pData" ? 'accountNo' THEN "vRec"."accountNo" ELSE NULL END, CASE WHEN "pData" ? 'iban' THEN "vRec".iban ELSE NULL END, CASE WHEN "pData" ? 'bankBranch' THEN "vRec"."bankBranch" ELSE NULL END, CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE NULL END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'openingBalance' THEN "vRec"."openingBalance" ELSE 0 END, CASE WHEN "pData" ? 'openingBalanceDate' THEN "vRec"."openingBalanceDate" ELSE NULL END, CASE WHEN "pData" ? 'creditLimit' THEN "vRec"."creditLimit" ELSE NULL END, CASE WHEN "pData" ? 'markupTerms' THEN "vRec"."markupTerms" ELSE NULL END, CASE WHEN "pData" ? 'purpose' THEN "vRec".purpose ELSE 'GENERAL' END, CASE WHEN "pData" ? 'statementImportEnabled' THEN "vRec"."statementImportEnabled" ELSE TRUE END, CASE WHEN "pData" ? 'statementFormat' THEN "vRec"."statementFormat" ELSE NULL END, CASE WHEN "pData" ? 'useForPayroll' THEN "vRec"."useForPayroll" ELSE FALSE END, CASE WHEN "pData" ? 'reconciledTo' THEN "vRec"."reconciledTo" ELSE NULL END, CASE WHEN "pData" ? 'lastStatementBalance' THEN "vRec"."lastStatementBalance" ELSE NULL END, CASE WHEN "pData" ? 'lastStatementDate' THEN "vRec"."lastStatementDate" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'closedOn' THEN "vRec"."closedOn" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "BankCash"."BankAccounts" t
       SET "bankId" = CASE WHEN "pData" ? 'bankId' THEN "vRec"."bankId" ELSE t."bankId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "accountType" = CASE WHEN "pData" ? 'accountType' THEN "vRec"."accountType" ELSE t."accountType" END,
           "accountTitle" = CASE WHEN "pData" ? 'accountTitle' THEN "vRec"."accountTitle" ELSE t."accountTitle" END,
           "accountNo" = CASE WHEN "pData" ? 'accountNo' THEN "vRec"."accountNo" ELSE t."accountNo" END,
           iban = CASE WHEN "pData" ? 'iban' THEN "vRec".iban ELSE t.iban END,
           "bankBranch" = CASE WHEN "pData" ? 'bankBranch' THEN "vRec"."bankBranch" ELSE t."bankBranch" END,
           "accountId" = CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE t."accountId" END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "openingBalance" = CASE WHEN "pData" ? 'openingBalance' THEN "vRec"."openingBalance" ELSE t."openingBalance" END,
           "openingBalanceDate" = CASE WHEN "pData" ? 'openingBalanceDate' THEN "vRec"."openingBalanceDate" ELSE t."openingBalanceDate" END,
           "creditLimit" = CASE WHEN "pData" ? 'creditLimit' THEN "vRec"."creditLimit" ELSE t."creditLimit" END,
           "markupTerms" = CASE WHEN "pData" ? 'markupTerms' THEN "vRec"."markupTerms" ELSE t."markupTerms" END,
           purpose = CASE WHEN "pData" ? 'purpose' THEN "vRec".purpose ELSE t.purpose END,
           "statementImportEnabled" = CASE WHEN "pData" ? 'statementImportEnabled' THEN "vRec"."statementImportEnabled" ELSE t."statementImportEnabled" END,
           "statementFormat" = CASE WHEN "pData" ? 'statementFormat' THEN "vRec"."statementFormat" ELSE t."statementFormat" END,
           "useForPayroll" = CASE WHEN "pData" ? 'useForPayroll' THEN "vRec"."useForPayroll" ELSE t."useForPayroll" END,
           "reconciledTo" = CASE WHEN "pData" ? 'reconciledTo' THEN "vRec"."reconciledTo" ELSE t."reconciledTo" END,
           "lastStatementBalance" = CASE WHEN "pData" ? 'lastStatementBalance' THEN "vRec"."lastStatementBalance" ELSE t."lastStatementBalance" END,
           "lastStatementDate" = CASE WHEN "pData" ? 'lastStatementDate' THEN "vRec"."lastStatementDate" ELSE t."lastStatementDate" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "closedOn" = CASE WHEN "pData" ? 'closedOn' THEN "vRec"."closedOn" ELSE t."closedOn" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."BankAccounts" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'BankAccounts %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'BankAccounts % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."bankAccountAddUpdate"(jsonb) IS 'Save (insert or update) one BankAccounts record.';

-- BankAccounts: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "BankCash"."getBankAccountInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('accountTypeLabel', "Lookups"."getLookupLabel"('AccountType', t."accountType") ->> 'label', 'accountTypeTone', "Lookups"."getLookupLabel"('AccountType', t."accountType") ->> 'tone', 'purposeLabel', "Lookups"."getLookupLabel"('BankAccountPurpose', t.purpose) ->> 'label', 'purposeTone', "Lookups"."getLookupLabel"('BankAccountPurpose', t.purpose) ->> 'tone', 'statementFormatLabel', "Lookups"."getLookupLabel"('StatementFormat', t."statementFormat") ->> 'label', 'statementFormatTone', "Lookups"."getLookupLabel"('StatementFormat', t."statementFormat") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('BankAccountStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('BankAccountStatus', t.status) ->> 'tone')
    FROM "BankCash"."BankAccounts" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getBankAccountInfo"(uuid) IS 'Read one BankAccounts record (getter for its screens).';

-- CashAccounts: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "BankCash"."cashAccountAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."CashAccounts";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."CashAccounts", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "BankCash"."CashAccounts" ("tenantId", code, name, "shortName", kind, "branchId", "custodianUserId", "accountId", "openingBalance", "openingBalanceDate", "imprestAmount", "varianceTolerance", "isActive", "approvalThreshold")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'shortName' THEN "vRec"."shortName" ELSE NULL END, CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE 'DRAWER' END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'custodianUserId' THEN "vRec"."custodianUserId" ELSE NULL END, CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE NULL END, CASE WHEN "pData" ? 'openingBalance' THEN "vRec"."openingBalance" ELSE 0 END, CASE WHEN "pData" ? 'openingBalanceDate' THEN "vRec"."openingBalanceDate" ELSE NULL END, CASE WHEN "pData" ? 'imprestAmount' THEN "vRec"."imprestAmount" ELSE NULL END, CASE WHEN "pData" ? 'varianceTolerance' THEN "vRec"."varianceTolerance" ELSE 1000 END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END, CASE WHEN "pData" ? 'approvalThreshold' THEN "vRec"."approvalThreshold" ELSE 50000 END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "BankCash"."CashAccounts" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "shortName" = CASE WHEN "pData" ? 'shortName' THEN "vRec"."shortName" ELSE t."shortName" END,
           kind = CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE t.kind END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "custodianUserId" = CASE WHEN "pData" ? 'custodianUserId' THEN "vRec"."custodianUserId" ELSE t."custodianUserId" END,
           "accountId" = CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE t."accountId" END,
           "openingBalance" = CASE WHEN "pData" ? 'openingBalance' THEN "vRec"."openingBalance" ELSE t."openingBalance" END,
           "openingBalanceDate" = CASE WHEN "pData" ? 'openingBalanceDate' THEN "vRec"."openingBalanceDate" ELSE t."openingBalanceDate" END,
           "imprestAmount" = CASE WHEN "pData" ? 'imprestAmount' THEN "vRec"."imprestAmount" ELSE t."imprestAmount" END,
           "varianceTolerance" = CASE WHEN "pData" ? 'varianceTolerance' THEN "vRec"."varianceTolerance" ELSE t."varianceTolerance" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END,
           "approvalThreshold" = CASE WHEN "pData" ? 'approvalThreshold' THEN "vRec"."approvalThreshold" ELSE t."approvalThreshold" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."CashAccounts" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CashAccounts %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CashAccounts % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."cashAccountAddUpdate"(jsonb) IS 'Save (insert or update) one CashAccounts record.';

-- CashAccounts: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "BankCash"."getCashAccountInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('kindLabel', "Lookups"."getLookupLabel"('CashAccountKind', t.kind) ->> 'label', 'kindTone', "Lookups"."getLookupLabel"('CashAccountKind', t.kind) ->> 'tone')
    FROM "BankCash"."CashAccounts" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getCashAccountInfo"(uuid) IS 'Read one CashAccounts record (getter for its screens).';

-- CashCategories: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "BankCash"."cashCategoryAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."CashCategories";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."CashCategories", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "BankCash"."CashCategories" ("tenantId", code, name, direction, "voucherType", "defaultAccountId", "partyKind", icon, "colorToken", "sortOrder", "isSystem", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'direction' THEN "vRec".direction ELSE NULL END, CASE WHEN "pData" ? 'voucherType' THEN "vRec"."voucherType" ELSE NULL END, CASE WHEN "pData" ? 'defaultAccountId' THEN "vRec"."defaultAccountId" ELSE NULL END, CASE WHEN "pData" ? 'partyKind' THEN "vRec"."partyKind" ELSE 'NONE' END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE NULL END, CASE WHEN "pData" ? 'colorToken' THEN "vRec"."colorToken" ELSE NULL END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END, CASE WHEN "pData" ? 'isSystem' THEN "vRec"."isSystem" ELSE FALSE END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "BankCash"."CashCategories" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           direction = CASE WHEN "pData" ? 'direction' THEN "vRec".direction ELSE t.direction END,
           "voucherType" = CASE WHEN "pData" ? 'voucherType' THEN "vRec"."voucherType" ELSE t."voucherType" END,
           "defaultAccountId" = CASE WHEN "pData" ? 'defaultAccountId' THEN "vRec"."defaultAccountId" ELSE t."defaultAccountId" END,
           "partyKind" = CASE WHEN "pData" ? 'partyKind' THEN "vRec"."partyKind" ELSE t."partyKind" END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END,
           "colorToken" = CASE WHEN "pData" ? 'colorToken' THEN "vRec"."colorToken" ELSE t."colorToken" END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END,
           "isSystem" = CASE WHEN "pData" ? 'isSystem' THEN "vRec"."isSystem" ELSE t."isSystem" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."CashCategories" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CashCategories %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CashCategories % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."cashCategoryAddUpdate"(jsonb) IS 'Save (insert or update) one CashCategories record.';

-- CashCategories: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "BankCash"."getCashCategoryInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('directionLabel', "Lookups"."getLookupLabel"('CashCategoryDirection', t.direction) ->> 'label', 'directionTone', "Lookups"."getLookupLabel"('CashCategoryDirection', t.direction) ->> 'tone', 'voucherTypeLabel', "Lookups"."getLookupLabel"('CashCategoryVoucherType', t."voucherType") ->> 'label', 'voucherTypeTone', "Lookups"."getLookupLabel"('CashCategoryVoucherType', t."voucherType") ->> 'tone', 'partyKindLabel', "Lookups"."getLookupLabel"('PartyKind', t."partyKind") ->> 'label', 'partyKindTone', "Lookups"."getLookupLabel"('PartyKind', t."partyKind") ->> 'tone')
    FROM "BankCash"."CashCategories" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getCashCategoryInfo"(uuid) IS 'Read one CashCategories record (getter for its screens).';

-- Cheques: insert (no "id") or update (with "id"); child arrays: allocations
CREATE OR REPLACE FUNCTION "BankCash"."chequeAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."Cheques";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1ChequeAllocations" "BankCash"."ChequeAllocations";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."Cheques", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('CHQ', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "BankCash"."Cheques" ("tenantId", "docNo", "legacyNo", "docDate", "branchId", direction, "chequeNo", "customerId", "vendorId", "accountId", "partyName", "drawnOnBankId", "bankAccountId", "chequeDate", "dueDate", "receivedOn", amount, "currencyCode", "isPdc", "postingMode", "depositedOn", "presentedOn", "clearedOn", "bouncedOn", "bounceCount", "stoppedOn", "replacedByChequeId", "clearingJournalEntryId", remarks, narration, "chequeBookId", "crossedAcPayee")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'legacyNo' THEN "vRec"."legacyNo" ELSE NULL END, CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'direction' THEN "vRec".direction ELSE NULL END, CASE WHEN "pData" ? 'chequeNo' THEN "vRec"."chequeNo" ELSE NULL END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE NULL END, CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE NULL END, CASE WHEN "pData" ? 'partyName' THEN "vRec"."partyName" ELSE NULL END, CASE WHEN "pData" ? 'drawnOnBankId' THEN "vRec"."drawnOnBankId" ELSE NULL END, CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'chequeDate' THEN "vRec"."chequeDate" ELSE NULL END, CASE WHEN "pData" ? 'dueDate' THEN "vRec"."dueDate" ELSE NULL END, CASE WHEN "pData" ? 'receivedOn' THEN "vRec"."receivedOn" ELSE NULL END, CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE NULL END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'isPdc' THEN "vRec"."isPdc" ELSE FALSE END, CASE WHEN "pData" ? 'postingMode' THEN "vRec"."postingMode" ELSE 'DEPOSIT' END, CASE WHEN "pData" ? 'depositedOn' THEN "vRec"."depositedOn" ELSE NULL END, CASE WHEN "pData" ? 'presentedOn' THEN "vRec"."presentedOn" ELSE NULL END, CASE WHEN "pData" ? 'clearedOn' THEN "vRec"."clearedOn" ELSE NULL END, CASE WHEN "pData" ? 'bouncedOn' THEN "vRec"."bouncedOn" ELSE NULL END, CASE WHEN "pData" ? 'bounceCount' THEN "vRec"."bounceCount" ELSE 0 END, CASE WHEN "pData" ? 'stoppedOn' THEN "vRec"."stoppedOn" ELSE NULL END, CASE WHEN "pData" ? 'replacedByChequeId' THEN "vRec"."replacedByChequeId" ELSE NULL END, CASE WHEN "pData" ? 'clearingJournalEntryId' THEN "vRec"."clearingJournalEntryId" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'narration' THEN "vRec".narration ELSE NULL END, CASE WHEN "pData" ? 'chequeBookId' THEN "vRec"."chequeBookId" ELSE NULL END, CASE WHEN "pData" ? 'crossedAcPayee' THEN "vRec"."crossedAcPayee" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "BankCash"."Cheques" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "legacyNo" = CASE WHEN "pData" ? 'legacyNo' THEN "vRec"."legacyNo" ELSE t."legacyNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           direction = CASE WHEN "pData" ? 'direction' THEN "vRec".direction ELSE t.direction END,
           "chequeNo" = CASE WHEN "pData" ? 'chequeNo' THEN "vRec"."chequeNo" ELSE t."chequeNo" END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           "vendorId" = CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE t."vendorId" END,
           "accountId" = CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE t."accountId" END,
           "partyName" = CASE WHEN "pData" ? 'partyName' THEN "vRec"."partyName" ELSE t."partyName" END,
           "drawnOnBankId" = CASE WHEN "pData" ? 'drawnOnBankId' THEN "vRec"."drawnOnBankId" ELSE t."drawnOnBankId" END,
           "bankAccountId" = CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE t."bankAccountId" END,
           "chequeDate" = CASE WHEN "pData" ? 'chequeDate' THEN "vRec"."chequeDate" ELSE t."chequeDate" END,
           "dueDate" = CASE WHEN "pData" ? 'dueDate' THEN "vRec"."dueDate" ELSE t."dueDate" END,
           "receivedOn" = CASE WHEN "pData" ? 'receivedOn' THEN "vRec"."receivedOn" ELSE t."receivedOn" END,
           amount = CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE t.amount END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "isPdc" = CASE WHEN "pData" ? 'isPdc' THEN "vRec"."isPdc" ELSE t."isPdc" END,
           "postingMode" = CASE WHEN "pData" ? 'postingMode' THEN "vRec"."postingMode" ELSE t."postingMode" END,
           "depositedOn" = CASE WHEN "pData" ? 'depositedOn' THEN "vRec"."depositedOn" ELSE t."depositedOn" END,
           "presentedOn" = CASE WHEN "pData" ? 'presentedOn' THEN "vRec"."presentedOn" ELSE t."presentedOn" END,
           "clearedOn" = CASE WHEN "pData" ? 'clearedOn' THEN "vRec"."clearedOn" ELSE t."clearedOn" END,
           "bouncedOn" = CASE WHEN "pData" ? 'bouncedOn' THEN "vRec"."bouncedOn" ELSE t."bouncedOn" END,
           "bounceCount" = CASE WHEN "pData" ? 'bounceCount' THEN "vRec"."bounceCount" ELSE t."bounceCount" END,
           "stoppedOn" = CASE WHEN "pData" ? 'stoppedOn' THEN "vRec"."stoppedOn" ELSE t."stoppedOn" END,
           "replacedByChequeId" = CASE WHEN "pData" ? 'replacedByChequeId' THEN "vRec"."replacedByChequeId" ELSE t."replacedByChequeId" END,
           "clearingJournalEntryId" = CASE WHEN "pData" ? 'clearingJournalEntryId' THEN "vRec"."clearingJournalEntryId" ELSE t."clearingJournalEntryId" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END,
           narration = CASE WHEN "pData" ? 'narration' THEN "vRec".narration ELSE t.narration END,
           "chequeBookId" = CASE WHEN "pData" ? 'chequeBookId' THEN "vRec"."chequeBookId" ELSE t."chequeBookId" END,
           "crossedAcPayee" = CASE WHEN "pData" ? 'crossedAcPayee' THEN "vRec"."crossedAcPayee" ELSE t."crossedAcPayee" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."Cheques" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Cheques %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Cheques % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'allocations' THEN
    -- allocations: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "BankCash"."ChequeAllocations"
     WHERE "tenantId" = "vTenant" AND "chequeId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'allocations') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'allocations') WITH ORDINALITY t(x, n) LOOP
      "vC1ChequeAllocations" := jsonb_populate_record(NULL::"BankCash"."ChequeAllocations", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "BankCash"."ChequeAllocations" t
           SET "invoiceId" = CASE WHEN "vE1" ? 'invoiceId' THEN "vC1ChequeAllocations"."invoiceId" ELSE t."invoiceId" END,
               "billId" = CASE WHEN "vE1" ? 'billId' THEN "vC1ChequeAllocations"."billId" ELSE t."billId" END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1ChequeAllocations".amount ELSE t.amount END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."chequeId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ChequeAllocations: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "BankCash"."ChequeAllocations" ("chequeId", "tenantId", "invoiceId", "billId", amount)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'invoiceId' THEN "vC1ChequeAllocations"."invoiceId" ELSE NULL END, CASE WHEN "vE1" ? 'billId' THEN "vC1ChequeAllocations"."billId" ELSE NULL END, CASE WHEN "vE1" ? 'amount' THEN "vC1ChequeAllocations".amount ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."chequeAddUpdate"(jsonb) IS 'Save (insert or update) one Cheques record with its allocations.';

-- Cheques: one record as JSON (camelCase keys), with lookup labels and allocations
CREATE OR REPLACE FUNCTION "BankCash"."getChequeInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('directionLabel', "Lookups"."getLookupLabel"('ReceivedIssuedDirection', t.direction) ->> 'label', 'directionTone', "Lookups"."getLookupLabel"('ReceivedIssuedDirection', t.direction) ->> 'tone', 'postingModeLabel', "Lookups"."getLookupLabel"('PostingMode', t."postingMode") ->> 'label', 'postingModeTone', "Lookups"."getLookupLabel"('PostingMode', t."postingMode") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ChequeStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ChequeStatus', t.status) ->> 'tone') ||
         jsonb_build_object('allocations', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "BankCash"."ChequeAllocations" c1 WHERE c1."chequeId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "BankCash"."Cheques" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getChequeInfo"(uuid) IS 'Read one Cheques record (getter for its screens).';

-- Cheques: Cancel (status -> CANCELLED); allowed from IN_HAND, DEPOSITED, CLEARED, BOUNCED, ISSUED, PRESENTED, STOPPED, REPLACED
CREATE OR REPLACE FUNCTION "BankCash"."chequeCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "BankCash"."Cheques";
BEGIN
  SELECT * INTO "vRow" FROM "BankCash"."Cheques" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cheques % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('IN_HAND', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'ISSUED', 'PRESENTED', 'STOPPED', 'REPLACED') THEN
    RAISE EXCEPTION 'Cheques %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"BankCash"."chequeCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"BankCash"."chequeCancelEntries"') USING "pId";
  END IF;
  UPDATE "BankCash"."Cheques" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- Cheques: Deposit (status -> DEPOSITED); allowed from IN_HAND
CREATE OR REPLACE FUNCTION "BankCash"."chequeDeposit"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "BankCash"."Cheques";
BEGIN
  SELECT * INTO "vRow" FROM "BankCash"."Cheques" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cheques % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'DEPOSITED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('IN_HAND') THEN
    RAISE EXCEPTION 'Cheques %: cannot deposit from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"BankCash"."chequeDepositEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"BankCash"."chequeDepositEntries"') USING "pId";
  END IF;
  UPDATE "BankCash"."Cheques" t SET status = 'DEPOSITED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- Cheques: Present (status -> PRESENTED); allowed from ISSUED
CREATE OR REPLACE FUNCTION "BankCash"."chequePresent"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "BankCash"."Cheques";
BEGIN
  SELECT * INTO "vRow" FROM "BankCash"."Cheques" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cheques % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'PRESENTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('ISSUED') THEN
    RAISE EXCEPTION 'Cheques %: cannot present from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"BankCash"."chequePresentEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"BankCash"."chequePresentEntries"') USING "pId";
  END IF;
  UPDATE "BankCash"."Cheques" t SET status = 'PRESENTED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- Cheques: Clear (status -> CLEARED); allowed from DEPOSITED, PRESENTED
CREATE OR REPLACE FUNCTION "BankCash"."chequeClear"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "BankCash"."Cheques";
BEGIN
  SELECT * INTO "vRow" FROM "BankCash"."Cheques" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cheques % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CLEARED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DEPOSITED', 'PRESENTED') THEN
    RAISE EXCEPTION 'Cheques %: cannot clear from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"BankCash"."chequeClearEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"BankCash"."chequeClearEntries"') USING "pId";
  END IF;
  UPDATE "BankCash"."Cheques" t SET status = 'CLEARED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- Cheques: Bounce (status -> BOUNCED); allowed from DEPOSITED, PRESENTED, IN_HAND
CREATE OR REPLACE FUNCTION "BankCash"."chequeBounce"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "BankCash"."Cheques";
BEGIN
  SELECT * INTO "vRow" FROM "BankCash"."Cheques" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cheques % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'BOUNCED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DEPOSITED', 'PRESENTED', 'IN_HAND') THEN
    RAISE EXCEPTION 'Cheques %: cannot bounce from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"BankCash"."chequeBounceEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"BankCash"."chequeBounceEntries"') USING "pId";
  END IF;
  UPDATE "BankCash"."Cheques" t SET status = 'BOUNCED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- CashDayCloses: insert (no "id") or update (with "id"); child arrays: denominations
CREATE OR REPLACE FUNCTION "BankCash"."cashDayCloseAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."CashDayCloses";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1CashDayCloseDenominations" "BankCash"."CashDayCloseDenominations";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."CashDayCloses", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "BankCash"."CashDayCloses" ("tenantId", "cashAccountId", "closeDate", "bookBalance", "countedAmount", "lockedByUserId", "lockedAt", "varianceJournalEntryId", remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE NULL END, CASE WHEN "pData" ? 'closeDate' THEN "vRec"."closeDate" ELSE NULL END, CASE WHEN "pData" ? 'bookBalance' THEN "vRec"."bookBalance" ELSE NULL END, CASE WHEN "pData" ? 'countedAmount' THEN "vRec"."countedAmount" ELSE NULL END, CASE WHEN "pData" ? 'lockedByUserId' THEN "vRec"."lockedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'lockedAt' THEN "vRec"."lockedAt" ELSE NULL END, CASE WHEN "pData" ? 'varianceJournalEntryId' THEN "vRec"."varianceJournalEntryId" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "BankCash"."CashDayCloses" t
       SET "cashAccountId" = CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE t."cashAccountId" END,
           "closeDate" = CASE WHEN "pData" ? 'closeDate' THEN "vRec"."closeDate" ELSE t."closeDate" END,
           "bookBalance" = CASE WHEN "pData" ? 'bookBalance' THEN "vRec"."bookBalance" ELSE t."bookBalance" END,
           "countedAmount" = CASE WHEN "pData" ? 'countedAmount' THEN "vRec"."countedAmount" ELSE t."countedAmount" END,
           "lockedByUserId" = CASE WHEN "pData" ? 'lockedByUserId' THEN "vRec"."lockedByUserId" ELSE t."lockedByUserId" END,
           "lockedAt" = CASE WHEN "pData" ? 'lockedAt' THEN "vRec"."lockedAt" ELSE t."lockedAt" END,
           "varianceJournalEntryId" = CASE WHEN "pData" ? 'varianceJournalEntryId' THEN "vRec"."varianceJournalEntryId" ELSE t."varianceJournalEntryId" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."CashDayCloses" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CashDayCloses %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CashDayCloses % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'denominations' THEN
    -- denominations: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "BankCash"."CashDayCloseDenominations"
     WHERE "tenantId" = "vTenant" AND "dayCloseId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'denominations') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'denominations') WITH ORDINALITY t(x, n) LOOP
      "vC1CashDayCloseDenominations" := jsonb_populate_record(NULL::"BankCash"."CashDayCloseDenominations", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "BankCash"."CashDayCloseDenominations" t
           SET "noteValue" = CASE WHEN "vE1" ? 'noteValue' THEN "vC1CashDayCloseDenominations"."noteValue" ELSE t."noteValue" END,
               qty = CASE WHEN "vE1" ? 'qty' THEN "vC1CashDayCloseDenominations".qty ELSE t.qty END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."dayCloseId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'CashDayCloseDenominations: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "BankCash"."CashDayCloseDenominations" ("dayCloseId", "tenantId", "noteValue", qty)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'noteValue' THEN "vC1CashDayCloseDenominations"."noteValue" ELSE NULL END, CASE WHEN "vE1" ? 'qty' THEN "vC1CashDayCloseDenominations".qty ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."cashDayCloseAddUpdate"(jsonb) IS 'Save (insert or update) one CashDayCloses record with its denominations.';

-- CashDayCloses: one record as JSON (camelCase keys), with lookup labels and denominations
CREATE OR REPLACE FUNCTION "BankCash"."getCashDayCloseInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('CashDayCloseStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('CashDayCloseStatus', t.status) ->> 'tone') ||
         jsonb_build_object('denominations', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "BankCash"."CashDayCloseDenominations" c1 WHERE c1."dayCloseId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "BankCash"."CashDayCloses" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getCashDayCloseInfo"(uuid) IS 'Read one CashDayCloses record (getter for its screens).';

-- ChequeBooks: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "BankCash"."chequeBookAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."ChequeBooks";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."ChequeBooks", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "BankCash"."ChequeBooks" ("tenantId", "bankAccountId", "bookRef", "firstLeafNo", "lastLeafNo", "nextLeafNo", "leafDigits", "crossedAcPayee", "receivedOn", status, remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'bookRef' THEN "vRec"."bookRef" ELSE NULL END, CASE WHEN "pData" ? 'firstLeafNo' THEN "vRec"."firstLeafNo" ELSE NULL END, CASE WHEN "pData" ? 'lastLeafNo' THEN "vRec"."lastLeafNo" ELSE NULL END, CASE WHEN "pData" ? 'nextLeafNo' THEN "vRec"."nextLeafNo" ELSE NULL END, CASE WHEN "pData" ? 'leafDigits' THEN "vRec"."leafDigits" ELSE 8 END, CASE WHEN "pData" ? 'crossedAcPayee' THEN "vRec"."crossedAcPayee" ELSE TRUE END, CASE WHEN "pData" ? 'receivedOn' THEN "vRec"."receivedOn" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "BankCash"."ChequeBooks" t
       SET "bankAccountId" = CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE t."bankAccountId" END,
           "bookRef" = CASE WHEN "pData" ? 'bookRef' THEN "vRec"."bookRef" ELSE t."bookRef" END,
           "firstLeafNo" = CASE WHEN "pData" ? 'firstLeafNo' THEN "vRec"."firstLeafNo" ELSE t."firstLeafNo" END,
           "lastLeafNo" = CASE WHEN "pData" ? 'lastLeafNo' THEN "vRec"."lastLeafNo" ELSE t."lastLeafNo" END,
           "nextLeafNo" = CASE WHEN "pData" ? 'nextLeafNo' THEN "vRec"."nextLeafNo" ELSE t."nextLeafNo" END,
           "leafDigits" = CASE WHEN "pData" ? 'leafDigits' THEN "vRec"."leafDigits" ELSE t."leafDigits" END,
           "crossedAcPayee" = CASE WHEN "pData" ? 'crossedAcPayee' THEN "vRec"."crossedAcPayee" ELSE t."crossedAcPayee" END,
           "receivedOn" = CASE WHEN "pData" ? 'receivedOn' THEN "vRec"."receivedOn" ELSE t."receivedOn" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."ChequeBooks" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ChequeBooks %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ChequeBooks % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."chequeBookAddUpdate"(jsonb) IS 'Save (insert or update) one ChequeBooks record.';

-- ChequeBooks: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "BankCash"."getChequeBookInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('ChequeBookStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ChequeBookStatus', t.status) ->> 'tone')
    FROM "BankCash"."ChequeBooks" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getChequeBookInfo"(uuid) IS 'Read one ChequeBooks record (getter for its screens).';

-- ChequeBatches: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "BankCash"."chequeBatchAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."ChequeBatches";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1ChequeBatchLines" "BankCash"."ChequeBatchLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."ChequeBatches", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('CHB', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "BankCash"."ChequeBatches" ("tenantId", "docNo", "docDate", "branchId", direction, "bankAccountId", "postingMode", "oldNoRule", "remarksPrefix", source, "sheetAttachmentId", "rowCount", "totalAmount", "generatedAt", "preparedByUserId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'direction' THEN "vRec".direction ELSE NULL END, CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'postingMode' THEN "vRec"."postingMode" ELSE 'DEPOSIT' END, CASE WHEN "pData" ? 'oldNoRule' THEN "vRec"."oldNoRule" ELSE 'AUTO_IF_NEW' END, CASE WHEN "pData" ? 'remarksPrefix' THEN "vRec"."remarksPrefix" ELSE NULL END, CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE 'SCREEN' END, CASE WHEN "pData" ? 'sheetAttachmentId' THEN "vRec"."sheetAttachmentId" ELSE NULL END, CASE WHEN "pData" ? 'rowCount' THEN "vRec"."rowCount" ELSE 0 END, CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE 0 END, CASE WHEN "pData" ? 'generatedAt' THEN "vRec"."generatedAt" ELSE NULL END, CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "BankCash"."ChequeBatches" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'ChequeBatches: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "BankCash"."ChequeBatches" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           direction = CASE WHEN "pData" ? 'direction' THEN "vRec".direction ELSE t.direction END,
           "bankAccountId" = CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE t."bankAccountId" END,
           "postingMode" = CASE WHEN "pData" ? 'postingMode' THEN "vRec"."postingMode" ELSE t."postingMode" END,
           "oldNoRule" = CASE WHEN "pData" ? 'oldNoRule' THEN "vRec"."oldNoRule" ELSE t."oldNoRule" END,
           "remarksPrefix" = CASE WHEN "pData" ? 'remarksPrefix' THEN "vRec"."remarksPrefix" ELSE t."remarksPrefix" END,
           source = CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE t.source END,
           "sheetAttachmentId" = CASE WHEN "pData" ? 'sheetAttachmentId' THEN "vRec"."sheetAttachmentId" ELSE t."sheetAttachmentId" END,
           "rowCount" = CASE WHEN "pData" ? 'rowCount' THEN "vRec"."rowCount" ELSE t."rowCount" END,
           "totalAmount" = CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE t."totalAmount" END,
           "generatedAt" = CASE WHEN "pData" ? 'generatedAt' THEN "vRec"."generatedAt" ELSE t."generatedAt" END,
           "preparedByUserId" = CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE t."preparedByUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."ChequeBatches" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ChequeBatches %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ChequeBatches % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "BankCash"."ChequeBatchLines"
     WHERE "tenantId" = "vTenant" AND "batchId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1ChequeBatchLines" := jsonb_populate_record(NULL::"BankCash"."ChequeBatchLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1ChequeBatchLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "BankCash"."ChequeBatchLines" t
           SET "partyCode" = CASE WHEN "vE1" ? 'partyCode' THEN "vC1ChequeBatchLines"."partyCode" ELSE t."partyCode" END,
               "partyName" = CASE WHEN "vE1" ? 'partyName' THEN "vC1ChequeBatchLines"."partyName" ELSE t."partyName" END,
               "customerId" = CASE WHEN "vE1" ? 'customerId' THEN "vC1ChequeBatchLines"."customerId" ELSE t."customerId" END,
               "vendorId" = CASE WHEN "vE1" ? 'vendorId' THEN "vC1ChequeBatchLines"."vendorId" ELSE t."vendorId" END,
               "chequeNo" = CASE WHEN "vE1" ? 'chequeNo' THEN "vC1ChequeBatchLines"."chequeNo" ELSE t."chequeNo" END,
               "chequeDate" = CASE WHEN "vE1" ? 'chequeDate' THEN "vC1ChequeBatchLines"."chequeDate" ELSE t."chequeDate" END,
               "dueDate" = CASE WHEN "vE1" ? 'dueDate' THEN "vC1ChequeBatchLines"."dueDate" ELSE t."dueDate" END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1ChequeBatchLines".amount ELSE t.amount END,
               remarks = CASE WHEN "vE1" ? 'remarks' THEN "vC1ChequeBatchLines".remarks ELSE t.remarks END,
               "legacyNo" = CASE WHEN "vE1" ? 'legacyNo' THEN "vC1ChequeBatchLines"."legacyNo" ELSE t."legacyNo" END,
               "validationStatus" = CASE WHEN "vE1" ? 'validationStatus' THEN "vC1ChequeBatchLines"."validationStatus" ELSE t."validationStatus" END,
               "validationErrors" = CASE WHEN "vE1" ? 'validationErrors' THEN "vC1ChequeBatchLines"."validationErrors" ELSE t."validationErrors" END,
               "chequeId" = CASE WHEN "vE1" ? 'chequeId' THEN "vC1ChequeBatchLines"."chequeId" ELSE t."chequeId" END,
               "lineNo" = "vC1ChequeBatchLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."batchId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ChequeBatchLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "BankCash"."ChequeBatchLines" ("batchId", "tenantId", "lineNo", "partyCode", "partyName", "customerId", "vendorId", "chequeNo", "chequeDate", "dueDate", amount, remarks, "legacyNo", "validationStatus", "validationErrors", "chequeId")
        VALUES ("vRet", "vTenant", "vC1ChequeBatchLines"."lineNo", CASE WHEN "vE1" ? 'partyCode' THEN "vC1ChequeBatchLines"."partyCode" ELSE NULL END, CASE WHEN "vE1" ? 'partyName' THEN "vC1ChequeBatchLines"."partyName" ELSE NULL END, CASE WHEN "vE1" ? 'customerId' THEN "vC1ChequeBatchLines"."customerId" ELSE NULL END, CASE WHEN "vE1" ? 'vendorId' THEN "vC1ChequeBatchLines"."vendorId" ELSE NULL END, CASE WHEN "vE1" ? 'chequeNo' THEN "vC1ChequeBatchLines"."chequeNo" ELSE NULL END, CASE WHEN "vE1" ? 'chequeDate' THEN "vC1ChequeBatchLines"."chequeDate" ELSE NULL END, CASE WHEN "vE1" ? 'dueDate' THEN "vC1ChequeBatchLines"."dueDate" ELSE NULL END, CASE WHEN "vE1" ? 'amount' THEN "vC1ChequeBatchLines".amount ELSE NULL END, CASE WHEN "vE1" ? 'remarks' THEN "vC1ChequeBatchLines".remarks ELSE NULL END, CASE WHEN "vE1" ? 'legacyNo' THEN "vC1ChequeBatchLines"."legacyNo" ELSE NULL END, CASE WHEN "vE1" ? 'validationStatus' THEN "vC1ChequeBatchLines"."validationStatus" ELSE 'PENDING' END, CASE WHEN "vE1" ? 'validationErrors' THEN "vC1ChequeBatchLines"."validationErrors" ELSE NULL END, CASE WHEN "vE1" ? 'chequeId' THEN "vC1ChequeBatchLines"."chequeId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."chequeBatchAddUpdate"(jsonb) IS 'Save (insert or update) one ChequeBatches record with its lines.';

-- ChequeBatches: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "BankCash"."getChequeBatchInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('directionLabel', "Lookups"."getLookupLabel"('ReceivedIssuedDirection', t.direction) ->> 'label', 'directionTone', "Lookups"."getLookupLabel"('ReceivedIssuedDirection', t.direction) ->> 'tone', 'postingModeLabel', "Lookups"."getLookupLabel"('PostingMode', t."postingMode") ->> 'label', 'postingModeTone', "Lookups"."getLookupLabel"('PostingMode', t."postingMode") ->> 'tone', 'oldNoRuleLabel', "Lookups"."getLookupLabel"('OldNoRule', t."oldNoRule") ->> 'label', 'oldNoRuleTone', "Lookups"."getLookupLabel"('OldNoRule', t."oldNoRule") ->> 'tone', 'sourceLabel', "Lookups"."getLookupLabel"('ChequeBatchSource', t.source) ->> 'label', 'sourceTone', "Lookups"."getLookupLabel"('ChequeBatchSource', t.source) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ChequeBatchStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ChequeBatchStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "BankCash"."ChequeBatchLines" c1 WHERE c1."batchId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "BankCash"."ChequeBatches" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getChequeBatchInfo"(uuid) IS 'Read one ChequeBatches record (getter for its screens).';

-- ChequeBatches: Cancel (status -> CANCELLED); allowed from DRAFT, VALIDATED, GENERATED, PARTIAL
CREATE OR REPLACE FUNCTION "BankCash"."chequeBatchCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "BankCash"."ChequeBatches";
BEGIN
  SELECT * INTO "vRow" FROM "BankCash"."ChequeBatches" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ChequeBatches % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'VALIDATED', 'GENERATED', 'PARTIAL') THEN
    RAISE EXCEPTION 'ChequeBatches %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"BankCash"."chequeBatchCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"BankCash"."chequeBatchCancelEntries"') USING "pId";
  END IF;
  UPDATE "BankCash"."ChequeBatches" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- ChequeBatches: Generate (status -> GENERATED); allowed from DRAFT, VALIDATED
CREATE OR REPLACE FUNCTION "BankCash"."chequeBatchGenerate"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "BankCash"."ChequeBatches";
BEGIN
  SELECT * INTO "vRow" FROM "BankCash"."ChequeBatches" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ChequeBatches % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'GENERATED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'VALIDATED') THEN
    RAISE EXCEPTION 'ChequeBatches %: cannot generate from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"BankCash"."chequeBatchGenerateEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"BankCash"."chequeBatchGenerateEntries"') USING "pId";
  END IF;
  UPDATE "BankCash"."ChequeBatches" t SET status = 'GENERATED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- BankStatementImports: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "BankCash"."bankStatementImportAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."BankStatementImports";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1BankStatementLines" "BankCash"."BankStatementLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."BankStatementImports", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "BankCash"."BankStatementImports" ("tenantId", "bankAccountId", "fileName", "attachmentId", format, layout, "periodFrom", "periodTo", "openingBalance", "closingBalance", "lineCount", "duplicateCount", "matchedCount", "errorMessage", "importedAt", "importedByUserId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'fileName' THEN "vRec"."fileName" ELSE NULL END, CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE NULL END, CASE WHEN "pData" ? 'format' THEN "vRec".format ELSE NULL END, CASE WHEN "pData" ? 'layout' THEN "vRec".layout ELSE NULL END, CASE WHEN "pData" ? 'periodFrom' THEN "vRec"."periodFrom" ELSE NULL END, CASE WHEN "pData" ? 'periodTo' THEN "vRec"."periodTo" ELSE NULL END, CASE WHEN "pData" ? 'openingBalance' THEN "vRec"."openingBalance" ELSE NULL END, CASE WHEN "pData" ? 'closingBalance' THEN "vRec"."closingBalance" ELSE NULL END, CASE WHEN "pData" ? 'lineCount' THEN "vRec"."lineCount" ELSE 0 END, CASE WHEN "pData" ? 'duplicateCount' THEN "vRec"."duplicateCount" ELSE 0 END, CASE WHEN "pData" ? 'matchedCount' THEN "vRec"."matchedCount" ELSE 0 END, CASE WHEN "pData" ? 'errorMessage' THEN "vRec"."errorMessage" ELSE NULL END, CASE WHEN "pData" ? 'importedAt' THEN "vRec"."importedAt" ELSE now() END, CASE WHEN "pData" ? 'importedByUserId' THEN "vRec"."importedByUserId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "BankCash"."BankStatementImports" t
       SET "bankAccountId" = CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE t."bankAccountId" END,
           "fileName" = CASE WHEN "pData" ? 'fileName' THEN "vRec"."fileName" ELSE t."fileName" END,
           "attachmentId" = CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE t."attachmentId" END,
           format = CASE WHEN "pData" ? 'format' THEN "vRec".format ELSE t.format END,
           layout = CASE WHEN "pData" ? 'layout' THEN "vRec".layout ELSE t.layout END,
           "periodFrom" = CASE WHEN "pData" ? 'periodFrom' THEN "vRec"."periodFrom" ELSE t."periodFrom" END,
           "periodTo" = CASE WHEN "pData" ? 'periodTo' THEN "vRec"."periodTo" ELSE t."periodTo" END,
           "openingBalance" = CASE WHEN "pData" ? 'openingBalance' THEN "vRec"."openingBalance" ELSE t."openingBalance" END,
           "closingBalance" = CASE WHEN "pData" ? 'closingBalance' THEN "vRec"."closingBalance" ELSE t."closingBalance" END,
           "lineCount" = CASE WHEN "pData" ? 'lineCount' THEN "vRec"."lineCount" ELSE t."lineCount" END,
           "duplicateCount" = CASE WHEN "pData" ? 'duplicateCount' THEN "vRec"."duplicateCount" ELSE t."duplicateCount" END,
           "matchedCount" = CASE WHEN "pData" ? 'matchedCount' THEN "vRec"."matchedCount" ELSE t."matchedCount" END,
           "errorMessage" = CASE WHEN "pData" ? 'errorMessage' THEN "vRec"."errorMessage" ELSE t."errorMessage" END,
           "importedAt" = CASE WHEN "pData" ? 'importedAt' THEN "vRec"."importedAt" ELSE t."importedAt" END,
           "importedByUserId" = CASE WHEN "pData" ? 'importedByUserId' THEN "vRec"."importedByUserId" ELSE t."importedByUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."BankStatementImports" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'BankStatementImports %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'BankStatementImports % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "BankCash"."BankStatementLines"
     WHERE "tenantId" = "vTenant" AND "statementImportId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1BankStatementLines" := jsonb_populate_record(NULL::"BankCash"."BankStatementLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1BankStatementLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "BankCash"."BankStatementLines" t
           SET "bankAccountId" = CASE WHEN "vE1" ? 'bankAccountId' THEN "vC1BankStatementLines"."bankAccountId" ELSE t."bankAccountId" END,
               "txnDate" = CASE WHEN "vE1" ? 'txnDate' THEN "vC1BankStatementLines"."txnDate" ELSE t."txnDate" END,
               "valueDate" = CASE WHEN "vE1" ? 'valueDate' THEN "vC1BankStatementLines"."valueDate" ELSE t."valueDate" END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1BankStatementLines".description ELSE t.description END,
               reference = CASE WHEN "vE1" ? 'reference' THEN "vC1BankStatementLines".reference ELSE t.reference END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1BankStatementLines".amount ELSE t.amount END,
               "runningBalance" = CASE WHEN "vE1" ? 'runningBalance' THEN "vC1BankStatementLines"."runningBalance" ELSE t."runningBalance" END,
               channel = CASE WHEN "vE1" ? 'channel' THEN "vC1BankStatementLines".channel ELSE t.channel END,
               "dedupeHash" = CASE WHEN "vE1" ? 'dedupeHash' THEN "vC1BankStatementLines"."dedupeHash" ELSE t."dedupeHash" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1BankStatementLines".status ELSE t.status END,
               "categoryAccountId" = CASE WHEN "vE1" ? 'categoryAccountId' THEN "vC1BankStatementLines"."categoryAccountId" ELSE t."categoryAccountId" END,
               "costCentreId" = CASE WHEN "vE1" ? 'costCentreId' THEN "vC1BankStatementLines"."costCentreId" ELSE t."costCentreId" END,
               "bankRuleId" = CASE WHEN "vE1" ? 'bankRuleId' THEN "vC1BankStatementLines"."bankRuleId" ELSE t."bankRuleId" END,
               "matchedInvoiceId" = CASE WHEN "vE1" ? 'matchedInvoiceId' THEN "vC1BankStatementLines"."matchedInvoiceId" ELSE t."matchedInvoiceId" END,
               "matchConfidence" = CASE WHEN "vE1" ? 'matchConfidence' THEN "vC1BankStatementLines"."matchConfidence" ELSE t."matchConfidence" END,
               "matchReason" = CASE WHEN "vE1" ? 'matchReason' THEN "vC1BankStatementLines"."matchReason" ELSE t."matchReason" END,
               "bankTransactionId" = CASE WHEN "vE1" ? 'bankTransactionId' THEN "vC1BankStatementLines"."bankTransactionId" ELSE t."bankTransactionId" END,
               "journalEntryId" = CASE WHEN "vE1" ? 'journalEntryId' THEN "vC1BankStatementLines"."journalEntryId" ELSE t."journalEntryId" END,
               "lineNo" = "vC1BankStatementLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."statementImportId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'BankStatementLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "BankCash"."BankStatementLines" ("statementImportId", "tenantId", "bankAccountId", "lineNo", "txnDate", "valueDate", description, reference, amount, "runningBalance", channel, "dedupeHash", status, "categoryAccountId", "costCentreId", "bankRuleId", "matchedInvoiceId", "matchConfidence", "matchReason", "bankTransactionId", "journalEntryId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'bankAccountId' THEN "vC1BankStatementLines"."bankAccountId" ELSE NULL END, "vC1BankStatementLines"."lineNo", CASE WHEN "vE1" ? 'txnDate' THEN "vC1BankStatementLines"."txnDate" ELSE NULL END, CASE WHEN "vE1" ? 'valueDate' THEN "vC1BankStatementLines"."valueDate" ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1BankStatementLines".description ELSE NULL END, CASE WHEN "vE1" ? 'reference' THEN "vC1BankStatementLines".reference ELSE NULL END, CASE WHEN "vE1" ? 'amount' THEN "vC1BankStatementLines".amount ELSE NULL END, CASE WHEN "vE1" ? 'runningBalance' THEN "vC1BankStatementLines"."runningBalance" ELSE NULL END, CASE WHEN "vE1" ? 'channel' THEN "vC1BankStatementLines".channel ELSE NULL END, CASE WHEN "vE1" ? 'dedupeHash' THEN "vC1BankStatementLines"."dedupeHash" ELSE NULL END, CASE WHEN "vE1" ? 'status' THEN "vC1BankStatementLines".status ELSE 'UNMATCHED' END, CASE WHEN "vE1" ? 'categoryAccountId' THEN "vC1BankStatementLines"."categoryAccountId" ELSE NULL END, CASE WHEN "vE1" ? 'costCentreId' THEN "vC1BankStatementLines"."costCentreId" ELSE NULL END, CASE WHEN "vE1" ? 'bankRuleId' THEN "vC1BankStatementLines"."bankRuleId" ELSE NULL END, CASE WHEN "vE1" ? 'matchedInvoiceId' THEN "vC1BankStatementLines"."matchedInvoiceId" ELSE NULL END, CASE WHEN "vE1" ? 'matchConfidence' THEN "vC1BankStatementLines"."matchConfidence" ELSE NULL END, CASE WHEN "vE1" ? 'matchReason' THEN "vC1BankStatementLines"."matchReason" ELSE NULL END, CASE WHEN "vE1" ? 'bankTransactionId' THEN "vC1BankStatementLines"."bankTransactionId" ELSE NULL END, CASE WHEN "vE1" ? 'journalEntryId' THEN "vC1BankStatementLines"."journalEntryId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."bankStatementImportAddUpdate"(jsonb) IS 'Save (insert or update) one BankStatementImports record with its lines.';

-- BankStatementImports: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "BankCash"."getBankStatementImportInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('formatLabel', "Lookups"."getLookupLabel"('BankStatementImportFormat', t.format) ->> 'label', 'formatTone', "Lookups"."getLookupLabel"('BankStatementImportFormat', t.format) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('BankStatementImportStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('BankStatementImportStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "BankCash"."BankStatementLines" c1 WHERE c1."statementImportId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "BankCash"."BankStatementImports" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getBankStatementImportInfo"(uuid) IS 'Read one BankStatementImports record (getter for its screens).';

-- BankRules: insert (no "id") or update (with "id"); child arrays: conditions
CREATE OR REPLACE FUNCTION "BankCash"."bankRuleAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."BankRules";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1BankRuleConditions" "BankCash"."BankRuleConditions";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."BankRules", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "BankCash"."BankRules" ("tenantId", code, name, priority, "matchMode", "bankAccountId", "accountId", "costCentreId", "autoPost", "isEnabled", "hitCount", "lastHitAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'priority' THEN "vRec".priority ELSE 100 END, CASE WHEN "pData" ? 'matchMode' THEN "vRec"."matchMode" ELSE 'ALL' END, CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE NULL END, CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE NULL END, CASE WHEN "pData" ? 'autoPost' THEN "vRec"."autoPost" ELSE TRUE END, CASE WHEN "pData" ? 'isEnabled' THEN "vRec"."isEnabled" ELSE TRUE END, CASE WHEN "pData" ? 'hitCount' THEN "vRec"."hitCount" ELSE 0 END, CASE WHEN "pData" ? 'lastHitAt' THEN "vRec"."lastHitAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "BankCash"."BankRules" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           priority = CASE WHEN "pData" ? 'priority' THEN "vRec".priority ELSE t.priority END,
           "matchMode" = CASE WHEN "pData" ? 'matchMode' THEN "vRec"."matchMode" ELSE t."matchMode" END,
           "bankAccountId" = CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE t."bankAccountId" END,
           "accountId" = CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE t."accountId" END,
           "costCentreId" = CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE t."costCentreId" END,
           "autoPost" = CASE WHEN "pData" ? 'autoPost' THEN "vRec"."autoPost" ELSE t."autoPost" END,
           "isEnabled" = CASE WHEN "pData" ? 'isEnabled' THEN "vRec"."isEnabled" ELSE t."isEnabled" END,
           "hitCount" = CASE WHEN "pData" ? 'hitCount' THEN "vRec"."hitCount" ELSE t."hitCount" END,
           "lastHitAt" = CASE WHEN "pData" ? 'lastHitAt' THEN "vRec"."lastHitAt" ELSE t."lastHitAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."BankRules" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'BankRules %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'BankRules % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'conditions' THEN
    -- conditions: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "BankCash"."BankRuleConditions"
     WHERE "tenantId" = "vTenant" AND "bankRuleId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'conditions') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'conditions') WITH ORDINALITY t(x, n) LOOP
      "vC1BankRuleConditions" := jsonb_populate_record(NULL::"BankCash"."BankRuleConditions", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "BankCash"."BankRuleConditions" t
           SET seq = CASE WHEN "vE1" ? 'seq' THEN "vC1BankRuleConditions".seq ELSE t.seq END,
               field = CASE WHEN "vE1" ? 'field' THEN "vC1BankRuleConditions".field ELSE t.field END,
               operator = CASE WHEN "vE1" ? 'operator' THEN "vC1BankRuleConditions".operator ELSE t.operator END,
               value = CASE WHEN "vE1" ? 'value' THEN "vC1BankRuleConditions".value ELSE t.value END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."bankRuleId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'BankRuleConditions: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "BankCash"."BankRuleConditions" ("bankRuleId", "tenantId", seq, field, operator, value)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'seq' THEN "vC1BankRuleConditions".seq ELSE NULL END, CASE WHEN "vE1" ? 'field' THEN "vC1BankRuleConditions".field ELSE NULL END, CASE WHEN "vE1" ? 'operator' THEN "vC1BankRuleConditions".operator ELSE NULL END, CASE WHEN "vE1" ? 'value' THEN "vC1BankRuleConditions".value ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."bankRuleAddUpdate"(jsonb) IS 'Save (insert or update) one BankRules record with its conditions.';

-- BankRules: one record as JSON (camelCase keys), with lookup labels and conditions
CREATE OR REPLACE FUNCTION "BankCash"."getBankRuleInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('matchModeLabel', "Lookups"."getLookupLabel"('MatchMode', t."matchMode") ->> 'label', 'matchModeTone', "Lookups"."getLookupLabel"('MatchMode', t."matchMode") ->> 'tone') ||
         jsonb_build_object('conditions', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "BankCash"."BankRuleConditions" c1 WHERE c1."bankRuleId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "BankCash"."BankRules" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getBankRuleInfo"(uuid) IS 'Read one BankRules record (getter for its screens).';

-- BankReconciliations: insert (no "id") or update (with "id"); child arrays: matches
CREATE OR REPLACE FUNCTION "BankCash"."bankReconciliationAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."BankReconciliations";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1BankReconciliationMatches" "BankCash"."BankReconciliationMatches";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."BankReconciliations", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('REC', current_date, NULL);
    END IF;
    INSERT INTO "BankCash"."BankReconciliations" ("tenantId", "docNo", "bankAccountId", "periodFrom", "periodTo", "statementImportId", "statementBalance", "unpresentedCheques", "depositsInTransit", "bookBalance", "unbookedCredits", "unbookedDebits", "closedByUserId", "closedAt", remarks)
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'periodFrom' THEN "vRec"."periodFrom" ELSE NULL END, CASE WHEN "pData" ? 'periodTo' THEN "vRec"."periodTo" ELSE NULL END, CASE WHEN "pData" ? 'statementImportId' THEN "vRec"."statementImportId" ELSE NULL END, CASE WHEN "pData" ? 'statementBalance' THEN "vRec"."statementBalance" ELSE NULL END, CASE WHEN "pData" ? 'unpresentedCheques' THEN "vRec"."unpresentedCheques" ELSE 0 END, CASE WHEN "pData" ? 'depositsInTransit' THEN "vRec"."depositsInTransit" ELSE 0 END, CASE WHEN "pData" ? 'bookBalance' THEN "vRec"."bookBalance" ELSE NULL END, CASE WHEN "pData" ? 'unbookedCredits' THEN "vRec"."unbookedCredits" ELSE 0 END, CASE WHEN "pData" ? 'unbookedDebits' THEN "vRec"."unbookedDebits" ELSE 0 END, CASE WHEN "pData" ? 'closedByUserId' THEN "vRec"."closedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "BankCash"."BankReconciliations" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "bankAccountId" = CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE t."bankAccountId" END,
           "periodFrom" = CASE WHEN "pData" ? 'periodFrom' THEN "vRec"."periodFrom" ELSE t."periodFrom" END,
           "periodTo" = CASE WHEN "pData" ? 'periodTo' THEN "vRec"."periodTo" ELSE t."periodTo" END,
           "statementImportId" = CASE WHEN "pData" ? 'statementImportId' THEN "vRec"."statementImportId" ELSE t."statementImportId" END,
           "statementBalance" = CASE WHEN "pData" ? 'statementBalance' THEN "vRec"."statementBalance" ELSE t."statementBalance" END,
           "unpresentedCheques" = CASE WHEN "pData" ? 'unpresentedCheques' THEN "vRec"."unpresentedCheques" ELSE t."unpresentedCheques" END,
           "depositsInTransit" = CASE WHEN "pData" ? 'depositsInTransit' THEN "vRec"."depositsInTransit" ELSE t."depositsInTransit" END,
           "bookBalance" = CASE WHEN "pData" ? 'bookBalance' THEN "vRec"."bookBalance" ELSE t."bookBalance" END,
           "unbookedCredits" = CASE WHEN "pData" ? 'unbookedCredits' THEN "vRec"."unbookedCredits" ELSE t."unbookedCredits" END,
           "unbookedDebits" = CASE WHEN "pData" ? 'unbookedDebits' THEN "vRec"."unbookedDebits" ELSE t."unbookedDebits" END,
           "closedByUserId" = CASE WHEN "pData" ? 'closedByUserId' THEN "vRec"."closedByUserId" ELSE t."closedByUserId" END,
           "closedAt" = CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE t."closedAt" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."BankReconciliations" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'BankReconciliations %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'BankReconciliations % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'matches' THEN
    -- matches: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "BankCash"."BankReconciliationMatches"
     WHERE "tenantId" = "vTenant" AND "reconciliationId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'matches') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'matches') WITH ORDINALITY t(x, n) LOOP
      "vC1BankReconciliationMatches" := jsonb_populate_record(NULL::"BankCash"."BankReconciliationMatches", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "BankCash"."BankReconciliationMatches" t
           SET "statementLineId" = CASE WHEN "vE1" ? 'statementLineId' THEN "vC1BankReconciliationMatches"."statementLineId" ELSE t."statementLineId" END,
               "bankTransactionId" = CASE WHEN "vE1" ? 'bankTransactionId' THEN "vC1BankReconciliationMatches"."bankTransactionId" ELSE t."bankTransactionId" END,
               "journalEntryId" = CASE WHEN "vE1" ? 'journalEntryId' THEN "vC1BankReconciliationMatches"."journalEntryId" ELSE t."journalEntryId" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1BankReconciliationMatches".status ELSE t.status END,
               "statementAmount" = CASE WHEN "vE1" ? 'statementAmount' THEN "vC1BankReconciliationMatches"."statementAmount" ELSE t."statementAmount" END,
               "bookAmount" = CASE WHEN "vE1" ? 'bookAmount' THEN "vC1BankReconciliationMatches"."bookAmount" ELSE t."bookAmount" END,
               "matchMethod" = CASE WHEN "vE1" ? 'matchMethod' THEN "vC1BankReconciliationMatches"."matchMethod" ELSE t."matchMethod" END,
               confidence = CASE WHEN "vE1" ? 'confidence' THEN "vC1BankReconciliationMatches".confidence ELSE t.confidence END,
               "matchedByUserId" = CASE WHEN "vE1" ? 'matchedByUserId' THEN "vC1BankReconciliationMatches"."matchedByUserId" ELSE t."matchedByUserId" END,
               "matchedAt" = CASE WHEN "vE1" ? 'matchedAt' THEN "vC1BankReconciliationMatches"."matchedAt" ELSE t."matchedAt" END,
               "adjustmentJournalEntryId" = CASE WHEN "vE1" ? 'adjustmentJournalEntryId' THEN "vC1BankReconciliationMatches"."adjustmentJournalEntryId" ELSE t."adjustmentJournalEntryId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."reconciliationId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'BankReconciliationMatches: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "BankCash"."BankReconciliationMatches" ("reconciliationId", "tenantId", "statementLineId", "bankTransactionId", "journalEntryId", status, "statementAmount", "bookAmount", "matchMethod", confidence, "matchedByUserId", "matchedAt", "adjustmentJournalEntryId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'statementLineId' THEN "vC1BankReconciliationMatches"."statementLineId" ELSE NULL END, CASE WHEN "vE1" ? 'bankTransactionId' THEN "vC1BankReconciliationMatches"."bankTransactionId" ELSE NULL END, CASE WHEN "vE1" ? 'journalEntryId' THEN "vC1BankReconciliationMatches"."journalEntryId" ELSE NULL END, CASE WHEN "vE1" ? 'status' THEN "vC1BankReconciliationMatches".status ELSE NULL END, CASE WHEN "vE1" ? 'statementAmount' THEN "vC1BankReconciliationMatches"."statementAmount" ELSE NULL END, CASE WHEN "vE1" ? 'bookAmount' THEN "vC1BankReconciliationMatches"."bookAmount" ELSE NULL END, CASE WHEN "vE1" ? 'matchMethod' THEN "vC1BankReconciliationMatches"."matchMethod" ELSE NULL END, CASE WHEN "vE1" ? 'confidence' THEN "vC1BankReconciliationMatches".confidence ELSE NULL END, CASE WHEN "vE1" ? 'matchedByUserId' THEN "vC1BankReconciliationMatches"."matchedByUserId" ELSE NULL END, CASE WHEN "vE1" ? 'matchedAt' THEN "vC1BankReconciliationMatches"."matchedAt" ELSE NULL END, CASE WHEN "vE1" ? 'adjustmentJournalEntryId' THEN "vC1BankReconciliationMatches"."adjustmentJournalEntryId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."bankReconciliationAddUpdate"(jsonb) IS 'Save (insert or update) one BankReconciliations record with its matches.';

-- BankReconciliations: one record as JSON (camelCase keys), with lookup labels and matches
CREATE OR REPLACE FUNCTION "BankCash"."getBankReconciliationInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('BankReconciliationStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('BankReconciliationStatus', t.status) ->> 'tone') ||
         jsonb_build_object('matches', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "BankCash"."BankReconciliationMatches" c1 WHERE c1."reconciliationId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "BankCash"."BankReconciliations" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getBankReconciliationInfo"(uuid) IS 'Read one BankReconciliations record (getter for its screens).';

-- ExpenseCategories: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "BankCash"."expenseCategoryAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."ExpenseCategories";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."ExpenseCategories", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "BankCash"."ExpenseCategories" ("tenantId", code, name, "appliesTo", "accountId", "limitAmount", "limitPeriod", "requiresPreApproval", "receiptRequired", "submitWithinDays", icon, "sortOrder", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'appliesTo' THEN "vRec"."appliesTo" ELSE 'BOTH' END, CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE NULL END, CASE WHEN "pData" ? 'limitAmount' THEN "vRec"."limitAmount" ELSE NULL END, CASE WHEN "pData" ? 'limitPeriod' THEN "vRec"."limitPeriod" ELSE NULL END, CASE WHEN "pData" ? 'requiresPreApproval' THEN "vRec"."requiresPreApproval" ELSE FALSE END, CASE WHEN "pData" ? 'receiptRequired' THEN "vRec"."receiptRequired" ELSE TRUE END, CASE WHEN "pData" ? 'submitWithinDays' THEN "vRec"."submitWithinDays" ELSE NULL END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE NULL END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "BankCash"."ExpenseCategories" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "appliesTo" = CASE WHEN "pData" ? 'appliesTo' THEN "vRec"."appliesTo" ELSE t."appliesTo" END,
           "accountId" = CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE t."accountId" END,
           "limitAmount" = CASE WHEN "pData" ? 'limitAmount' THEN "vRec"."limitAmount" ELSE t."limitAmount" END,
           "limitPeriod" = CASE WHEN "pData" ? 'limitPeriod' THEN "vRec"."limitPeriod" ELSE t."limitPeriod" END,
           "requiresPreApproval" = CASE WHEN "pData" ? 'requiresPreApproval' THEN "vRec"."requiresPreApproval" ELSE t."requiresPreApproval" END,
           "receiptRequired" = CASE WHEN "pData" ? 'receiptRequired' THEN "vRec"."receiptRequired" ELSE t."receiptRequired" END,
           "submitWithinDays" = CASE WHEN "pData" ? 'submitWithinDays' THEN "vRec"."submitWithinDays" ELSE t."submitWithinDays" END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."ExpenseCategories" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ExpenseCategories %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ExpenseCategories % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."expenseCategoryAddUpdate"(jsonb) IS 'Save (insert or update) one ExpenseCategories record.';

-- ExpenseCategories: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "BankCash"."getExpenseCategoryInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('appliesToLabel', "Lookups"."getLookupLabel"('ExpenseCategoryAppliesTo', t."appliesTo") ->> 'label', 'appliesToTone', "Lookups"."getLookupLabel"('ExpenseCategoryAppliesTo', t."appliesTo") ->> 'tone', 'limitPeriodLabel', "Lookups"."getLookupLabel"('LimitPeriod', t."limitPeriod") ->> 'label', 'limitPeriodTone', "Lookups"."getLookupLabel"('LimitPeriod', t."limitPeriod") ->> 'tone')
    FROM "BankCash"."ExpenseCategories" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getExpenseCategoryInfo"(uuid) IS 'Read one ExpenseCategories record (getter for its screens).';

-- PettyCashFunds: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "BankCash"."pettyCashFundAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."PettyCashFunds";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."PettyCashFunds", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "BankCash"."PettyCashFunds" ("tenantId", name, "branchId", "cashAccountId", "custodianEmployeeId", "custodianUserId", "imprestAmount", "lowPct", "criticalPct", "cycleStartedOn", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE NULL END, CASE WHEN "pData" ? 'custodianEmployeeId' THEN "vRec"."custodianEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'custodianUserId' THEN "vRec"."custodianUserId" ELSE NULL END, CASE WHEN "pData" ? 'imprestAmount' THEN "vRec"."imprestAmount" ELSE NULL END, CASE WHEN "pData" ? 'lowPct' THEN "vRec"."lowPct" ELSE 25 END, CASE WHEN "pData" ? 'criticalPct' THEN "vRec"."criticalPct" ELSE 10 END, CASE WHEN "pData" ? 'cycleStartedOn' THEN "vRec"."cycleStartedOn" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'HEALTHY' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "BankCash"."PettyCashFunds" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "cashAccountId" = CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE t."cashAccountId" END,
           "custodianEmployeeId" = CASE WHEN "pData" ? 'custodianEmployeeId' THEN "vRec"."custodianEmployeeId" ELSE t."custodianEmployeeId" END,
           "custodianUserId" = CASE WHEN "pData" ? 'custodianUserId' THEN "vRec"."custodianUserId" ELSE t."custodianUserId" END,
           "imprestAmount" = CASE WHEN "pData" ? 'imprestAmount' THEN "vRec"."imprestAmount" ELSE t."imprestAmount" END,
           "lowPct" = CASE WHEN "pData" ? 'lowPct' THEN "vRec"."lowPct" ELSE t."lowPct" END,
           "criticalPct" = CASE WHEN "pData" ? 'criticalPct' THEN "vRec"."criticalPct" ELSE t."criticalPct" END,
           "cycleStartedOn" = CASE WHEN "pData" ? 'cycleStartedOn' THEN "vRec"."cycleStartedOn" ELSE t."cycleStartedOn" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."PettyCashFunds" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PettyCashFunds %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PettyCashFunds % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."pettyCashFundAddUpdate"(jsonb) IS 'Save (insert or update) one PettyCashFunds record.';

-- PettyCashFunds: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "BankCash"."getPettyCashFundInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('PettyCashFundStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('PettyCashFundStatus', t.status) ->> 'tone')
    FROM "BankCash"."PettyCashFunds" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getPettyCashFundInfo"(uuid) IS 'Read one PettyCashFunds record (getter for its screens).';

-- PettyCashReplenishments: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "BankCash"."pettyCashReplenishmentAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."PettyCashReplenishments";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."PettyCashReplenishments", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "BankCash"."PettyCashReplenishments" ("tenantId", "fundId", "docDate", "payFromCashAccountId", "payFromBankAccountId", amount, "voucherCount", "vouchersTotal", "postTogether", remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'fundId' THEN "vRec"."fundId" ELSE NULL END, CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'payFromCashAccountId' THEN "vRec"."payFromCashAccountId" ELSE NULL END, CASE WHEN "pData" ? 'payFromBankAccountId' THEN "vRec"."payFromBankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE NULL END, CASE WHEN "pData" ? 'voucherCount' THEN "vRec"."voucherCount" ELSE 0 END, CASE WHEN "pData" ? 'vouchersTotal' THEN "vRec"."vouchersTotal" ELSE 0 END, CASE WHEN "pData" ? 'postTogether' THEN "vRec"."postTogether" ELSE TRUE END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "BankCash"."PettyCashReplenishments" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'PettyCashReplenishments: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "BankCash"."PettyCashReplenishments" t
       SET "fundId" = CASE WHEN "pData" ? 'fundId' THEN "vRec"."fundId" ELSE t."fundId" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "payFromCashAccountId" = CASE WHEN "pData" ? 'payFromCashAccountId' THEN "vRec"."payFromCashAccountId" ELSE t."payFromCashAccountId" END,
           "payFromBankAccountId" = CASE WHEN "pData" ? 'payFromBankAccountId' THEN "vRec"."payFromBankAccountId" ELSE t."payFromBankAccountId" END,
           amount = CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE t.amount END,
           "voucherCount" = CASE WHEN "pData" ? 'voucherCount' THEN "vRec"."voucherCount" ELSE t."voucherCount" END,
           "vouchersTotal" = CASE WHEN "pData" ? 'vouchersTotal' THEN "vRec"."vouchersTotal" ELSE t."vouchersTotal" END,
           "postTogether" = CASE WHEN "pData" ? 'postTogether' THEN "vRec"."postTogether" ELSE t."postTogether" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."PettyCashReplenishments" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PettyCashReplenishments %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PettyCashReplenishments % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."pettyCashReplenishmentAddUpdate"(jsonb) IS 'Save (insert or update) one PettyCashReplenishments record.';

-- PettyCashReplenishments: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "BankCash"."getPettyCashReplenishmentInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('DraftPostedCancelledStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('DraftPostedCancelledStatus', t.status) ->> 'tone')
    FROM "BankCash"."PettyCashReplenishments" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getPettyCashReplenishmentInfo"(uuid) IS 'Read one PettyCashReplenishments record (getter for its screens).';

-- PettyCashReplenishments: Post (status -> POSTED); allowed from DRAFT
CREATE OR REPLACE FUNCTION "BankCash"."pettyCashReplenishmentPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "BankCash"."PettyCashReplenishments";
BEGIN
  SELECT * INTO "vRow" FROM "BankCash"."PettyCashReplenishments" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PettyCashReplenishments % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'PettyCashReplenishments %: cannot post from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"BankCash"."pettyCashReplenishmentPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"BankCash"."pettyCashReplenishmentPostEntries"') USING "pId";
  END IF;
  UPDATE "BankCash"."PettyCashReplenishments" t SET status = 'POSTED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- PettyCashReplenishments: Cancel (status -> CANCELLED); allowed from DRAFT, POSTED
CREATE OR REPLACE FUNCTION "BankCash"."pettyCashReplenishmentCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "BankCash"."PettyCashReplenishments";
BEGIN
  SELECT * INTO "vRow" FROM "BankCash"."PettyCashReplenishments" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PettyCashReplenishments % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'POSTED') THEN
    RAISE EXCEPTION 'PettyCashReplenishments %: cannot cancel from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"BankCash"."pettyCashReplenishmentCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"BankCash"."pettyCashReplenishmentCancelEntries"') USING "pId";
  END IF;
  UPDATE "BankCash"."PettyCashReplenishments" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- PettyCashVouchers: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "BankCash"."pettyCashVoucherAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."PettyCashVouchers";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."PettyCashVouchers", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('PCV', "vRec"."docDate", NULL);
    END IF;
    INSERT INTO "BankCash"."PettyCashVouchers" ("tenantId", "docNo", "docDate", "fundId", "categoryId", description, "paidTo", amount, "accountId", "costCentreId", "receiptStatus", "receiptCount", "replenishmentId", "recordedByUserId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'fundId' THEN "vRec"."fundId" ELSE NULL END, CASE WHEN "pData" ? 'categoryId' THEN "vRec"."categoryId" ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'paidTo' THEN "vRec"."paidTo" ELSE NULL END, CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE NULL END, CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE NULL END, CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE NULL END, CASE WHEN "pData" ? 'receiptStatus' THEN "vRec"."receiptStatus" ELSE 'MISSING' END, CASE WHEN "pData" ? 'receiptCount' THEN "vRec"."receiptCount" ELSE 0 END, CASE WHEN "pData" ? 'replenishmentId' THEN "vRec"."replenishmentId" ELSE NULL END, CASE WHEN "pData" ? 'recordedByUserId' THEN "vRec"."recordedByUserId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "BankCash"."PettyCashVouchers" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "fundId" = CASE WHEN "pData" ? 'fundId' THEN "vRec"."fundId" ELSE t."fundId" END,
           "categoryId" = CASE WHEN "pData" ? 'categoryId' THEN "vRec"."categoryId" ELSE t."categoryId" END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "paidTo" = CASE WHEN "pData" ? 'paidTo' THEN "vRec"."paidTo" ELSE t."paidTo" END,
           amount = CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE t.amount END,
           "accountId" = CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE t."accountId" END,
           "costCentreId" = CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE t."costCentreId" END,
           "receiptStatus" = CASE WHEN "pData" ? 'receiptStatus' THEN "vRec"."receiptStatus" ELSE t."receiptStatus" END,
           "receiptCount" = CASE WHEN "pData" ? 'receiptCount' THEN "vRec"."receiptCount" ELSE t."receiptCount" END,
           "replenishmentId" = CASE WHEN "pData" ? 'replenishmentId' THEN "vRec"."replenishmentId" ELSE t."replenishmentId" END,
           "recordedByUserId" = CASE WHEN "pData" ? 'recordedByUserId' THEN "vRec"."recordedByUserId" ELSE t."recordedByUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."PettyCashVouchers" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PettyCashVouchers %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PettyCashVouchers % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."pettyCashVoucherAddUpdate"(jsonb) IS 'Save (insert or update) one PettyCashVouchers record.';

-- PettyCashVouchers: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "BankCash"."getPettyCashVoucherInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('receiptStatusLabel', "Lookups"."getLookupLabel"('ReceiptStatus', t."receiptStatus") ->> 'label', 'receiptStatusTone', "Lookups"."getLookupLabel"('ReceiptStatus', t."receiptStatus") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('PettyCashVoucherStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('PettyCashVoucherStatus', t.status) ->> 'tone')
    FROM "BankCash"."PettyCashVouchers" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getPettyCashVoucherInfo"(uuid) IS 'Read one PettyCashVouchers record (getter for its screens).';

-- PettyCashVouchers: Void (status -> VOID); allowed from UNREPLENISHED, REPLENISHED
CREATE OR REPLACE FUNCTION "BankCash"."pettyCashVoucherVoid"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "BankCash"."PettyCashVouchers";
BEGIN
  SELECT * INTO "vRow" FROM "BankCash"."PettyCashVouchers" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PettyCashVouchers % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'VOID' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('UNREPLENISHED', 'REPLENISHED') THEN
    RAISE EXCEPTION 'PettyCashVouchers %: cannot void from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"BankCash"."pettyCashVoucherVoidEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"BankCash"."pettyCashVoucherVoidEntries"') USING "pId";
  END IF;
  UPDATE "BankCash"."PettyCashVouchers" t SET status = 'VOID' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- ExpenseClaims: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "BankCash"."expenseClaimAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "BankCash"."ExpenseClaims";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1ExpenseClaimLines" "BankCash"."ExpenseClaimLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"BankCash"."ExpenseClaims", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('EXP', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "BankCash"."ExpenseClaims" ("tenantId", "docNo", "docDate", "employeeId", "branchId", source, title, merchant, "tripFrom", "tripTo", "categoryId", "costCentreId", "projectId", "customerId", "chargeAccountId", "travelRequestRef", "totalAmount", "receiptCount", "ocrConfidence", "policyLimitAmount", "policyLimitPeriod", "isOverPolicy", "policyJustification", "workflowStage", "approvalRequestId", "managerUserId", "managerApprovedAt", "rejectionReason", "rejectionComment", "allowResubmit", "resubmittedFromClaimId", "paymentMethod", "paymentBankAccountId", "payrollRunId", "paidAt", "approvalJournalEntryId", "paymentJournalEntryId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE 'ESS' END, CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE NULL END, CASE WHEN "pData" ? 'merchant' THEN "vRec".merchant ELSE NULL END, CASE WHEN "pData" ? 'tripFrom' THEN "vRec"."tripFrom" ELSE NULL END, CASE WHEN "pData" ? 'tripTo' THEN "vRec"."tripTo" ELSE NULL END, CASE WHEN "pData" ? 'categoryId' THEN "vRec"."categoryId" ELSE NULL END, CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE NULL END, CASE WHEN "pData" ? 'projectId' THEN "vRec"."projectId" ELSE NULL END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'chargeAccountId' THEN "vRec"."chargeAccountId" ELSE NULL END, CASE WHEN "pData" ? 'travelRequestRef' THEN "vRec"."travelRequestRef" ELSE NULL END, CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE NULL END, CASE WHEN "pData" ? 'receiptCount' THEN "vRec"."receiptCount" ELSE 0 END, CASE WHEN "pData" ? 'ocrConfidence' THEN "vRec"."ocrConfidence" ELSE NULL END, CASE WHEN "pData" ? 'policyLimitAmount' THEN "vRec"."policyLimitAmount" ELSE NULL END, CASE WHEN "pData" ? 'policyLimitPeriod' THEN "vRec"."policyLimitPeriod" ELSE NULL END, CASE WHEN "pData" ? 'isOverPolicy' THEN "vRec"."isOverPolicy" ELSE FALSE END, CASE WHEN "pData" ? 'policyJustification' THEN "vRec"."policyJustification" ELSE NULL END, CASE WHEN "pData" ? 'workflowStage' THEN "vRec"."workflowStage" ELSE 'SENT' END, CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE NULL END, CASE WHEN "pData" ? 'managerUserId' THEN "vRec"."managerUserId" ELSE NULL END, CASE WHEN "pData" ? 'managerApprovedAt' THEN "vRec"."managerApprovedAt" ELSE NULL END, CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE NULL END, CASE WHEN "pData" ? 'rejectionComment' THEN "vRec"."rejectionComment" ELSE NULL END, CASE WHEN "pData" ? 'allowResubmit' THEN "vRec"."allowResubmit" ELSE TRUE END, CASE WHEN "pData" ? 'resubmittedFromClaimId' THEN "vRec"."resubmittedFromClaimId" ELSE NULL END, CASE WHEN "pData" ? 'paymentMethod' THEN "vRec"."paymentMethod" ELSE NULL END, CASE WHEN "pData" ? 'paymentBankAccountId' THEN "vRec"."paymentBankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'payrollRunId' THEN "vRec"."payrollRunId" ELSE NULL END, CASE WHEN "pData" ? 'paidAt' THEN "vRec"."paidAt" ELSE NULL END, CASE WHEN "pData" ? 'approvalJournalEntryId' THEN "vRec"."approvalJournalEntryId" ELSE NULL END, CASE WHEN "pData" ? 'paymentJournalEntryId' THEN "vRec"."paymentJournalEntryId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "BankCash"."ExpenseClaims" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'ExpenseClaims: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "BankCash"."ExpenseClaims" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           source = CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE t.source END,
           title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
           merchant = CASE WHEN "pData" ? 'merchant' THEN "vRec".merchant ELSE t.merchant END,
           "tripFrom" = CASE WHEN "pData" ? 'tripFrom' THEN "vRec"."tripFrom" ELSE t."tripFrom" END,
           "tripTo" = CASE WHEN "pData" ? 'tripTo' THEN "vRec"."tripTo" ELSE t."tripTo" END,
           "categoryId" = CASE WHEN "pData" ? 'categoryId' THEN "vRec"."categoryId" ELSE t."categoryId" END,
           "costCentreId" = CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE t."costCentreId" END,
           "projectId" = CASE WHEN "pData" ? 'projectId' THEN "vRec"."projectId" ELSE t."projectId" END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           "chargeAccountId" = CASE WHEN "pData" ? 'chargeAccountId' THEN "vRec"."chargeAccountId" ELSE t."chargeAccountId" END,
           "travelRequestRef" = CASE WHEN "pData" ? 'travelRequestRef' THEN "vRec"."travelRequestRef" ELSE t."travelRequestRef" END,
           "totalAmount" = CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE t."totalAmount" END,
           "receiptCount" = CASE WHEN "pData" ? 'receiptCount' THEN "vRec"."receiptCount" ELSE t."receiptCount" END,
           "ocrConfidence" = CASE WHEN "pData" ? 'ocrConfidence' THEN "vRec"."ocrConfidence" ELSE t."ocrConfidence" END,
           "policyLimitAmount" = CASE WHEN "pData" ? 'policyLimitAmount' THEN "vRec"."policyLimitAmount" ELSE t."policyLimitAmount" END,
           "policyLimitPeriod" = CASE WHEN "pData" ? 'policyLimitPeriod' THEN "vRec"."policyLimitPeriod" ELSE t."policyLimitPeriod" END,
           "isOverPolicy" = CASE WHEN "pData" ? 'isOverPolicy' THEN "vRec"."isOverPolicy" ELSE t."isOverPolicy" END,
           "policyJustification" = CASE WHEN "pData" ? 'policyJustification' THEN "vRec"."policyJustification" ELSE t."policyJustification" END,
           "workflowStage" = CASE WHEN "pData" ? 'workflowStage' THEN "vRec"."workflowStage" ELSE t."workflowStage" END,
           "approvalRequestId" = CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE t."approvalRequestId" END,
           "managerUserId" = CASE WHEN "pData" ? 'managerUserId' THEN "vRec"."managerUserId" ELSE t."managerUserId" END,
           "managerApprovedAt" = CASE WHEN "pData" ? 'managerApprovedAt' THEN "vRec"."managerApprovedAt" ELSE t."managerApprovedAt" END,
           "rejectionReason" = CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE t."rejectionReason" END,
           "rejectionComment" = CASE WHEN "pData" ? 'rejectionComment' THEN "vRec"."rejectionComment" ELSE t."rejectionComment" END,
           "allowResubmit" = CASE WHEN "pData" ? 'allowResubmit' THEN "vRec"."allowResubmit" ELSE t."allowResubmit" END,
           "resubmittedFromClaimId" = CASE WHEN "pData" ? 'resubmittedFromClaimId' THEN "vRec"."resubmittedFromClaimId" ELSE t."resubmittedFromClaimId" END,
           "paymentMethod" = CASE WHEN "pData" ? 'paymentMethod' THEN "vRec"."paymentMethod" ELSE t."paymentMethod" END,
           "paymentBankAccountId" = CASE WHEN "pData" ? 'paymentBankAccountId' THEN "vRec"."paymentBankAccountId" ELSE t."paymentBankAccountId" END,
           "payrollRunId" = CASE WHEN "pData" ? 'payrollRunId' THEN "vRec"."payrollRunId" ELSE t."payrollRunId" END,
           "paidAt" = CASE WHEN "pData" ? 'paidAt' THEN "vRec"."paidAt" ELSE t."paidAt" END,
           "approvalJournalEntryId" = CASE WHEN "pData" ? 'approvalJournalEntryId' THEN "vRec"."approvalJournalEntryId" ELSE t."approvalJournalEntryId" END,
           "paymentJournalEntryId" = CASE WHEN "pData" ? 'paymentJournalEntryId' THEN "vRec"."paymentJournalEntryId" ELSE t."paymentJournalEntryId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "BankCash"."ExpenseClaims" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ExpenseClaims %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ExpenseClaims % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "BankCash"."ExpenseClaimLines"
     WHERE "tenantId" = "vTenant" AND "claimId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1ExpenseClaimLines" := jsonb_populate_record(NULL::"BankCash"."ExpenseClaimLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1ExpenseClaimLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "BankCash"."ExpenseClaimLines" t
           SET "expenseDate" = CASE WHEN "vE1" ? 'expenseDate' THEN "vC1ExpenseClaimLines"."expenseDate" ELSE t."expenseDate" END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1ExpenseClaimLines".description ELSE t.description END,
               "categoryId" = CASE WHEN "vE1" ? 'categoryId' THEN "vC1ExpenseClaimLines"."categoryId" ELSE t."categoryId" END,
               merchant = CASE WHEN "vE1" ? 'merchant' THEN "vC1ExpenseClaimLines".merchant ELSE t.merchant END,
               qty = CASE WHEN "vE1" ? 'qty' THEN "vC1ExpenseClaimLines".qty ELSE t.qty END,
               "unitAmount" = CASE WHEN "vE1" ? 'unitAmount' THEN "vC1ExpenseClaimLines"."unitAmount" ELSE t."unitAmount" END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1ExpenseClaimLines".amount ELSE t.amount END,
               "accountId" = CASE WHEN "vE1" ? 'accountId' THEN "vC1ExpenseClaimLines"."accountId" ELSE t."accountId" END,
               "costCentreId" = CASE WHEN "vE1" ? 'costCentreId' THEN "vC1ExpenseClaimLines"."costCentreId" ELSE t."costCentreId" END,
               "receiptAttachmentId" = CASE WHEN "vE1" ? 'receiptAttachmentId' THEN "vC1ExpenseClaimLines"."receiptAttachmentId" ELSE t."receiptAttachmentId" END,
               "isOverPolicy" = CASE WHEN "vE1" ? 'isOverPolicy' THEN "vC1ExpenseClaimLines"."isOverPolicy" ELSE t."isOverPolicy" END,
               "lineNo" = "vC1ExpenseClaimLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."claimId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ExpenseClaimLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "BankCash"."ExpenseClaimLines" ("claimId", "tenantId", "lineNo", "expenseDate", description, "categoryId", merchant, qty, "unitAmount", amount, "accountId", "costCentreId", "receiptAttachmentId", "isOverPolicy")
        VALUES ("vRet", "vTenant", "vC1ExpenseClaimLines"."lineNo", CASE WHEN "vE1" ? 'expenseDate' THEN "vC1ExpenseClaimLines"."expenseDate" ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1ExpenseClaimLines".description ELSE NULL END, CASE WHEN "vE1" ? 'categoryId' THEN "vC1ExpenseClaimLines"."categoryId" ELSE NULL END, CASE WHEN "vE1" ? 'merchant' THEN "vC1ExpenseClaimLines".merchant ELSE NULL END, CASE WHEN "vE1" ? 'qty' THEN "vC1ExpenseClaimLines".qty ELSE NULL END, CASE WHEN "vE1" ? 'unitAmount' THEN "vC1ExpenseClaimLines"."unitAmount" ELSE NULL END, CASE WHEN "vE1" ? 'amount' THEN "vC1ExpenseClaimLines".amount ELSE NULL END, CASE WHEN "vE1" ? 'accountId' THEN "vC1ExpenseClaimLines"."accountId" ELSE NULL END, CASE WHEN "vE1" ? 'costCentreId' THEN "vC1ExpenseClaimLines"."costCentreId" ELSE NULL END, CASE WHEN "vE1" ? 'receiptAttachmentId' THEN "vC1ExpenseClaimLines"."receiptAttachmentId" ELSE NULL END, CASE WHEN "vE1" ? 'isOverPolicy' THEN "vC1ExpenseClaimLines"."isOverPolicy" ELSE FALSE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "BankCash"."expenseClaimAddUpdate"(jsonb) IS 'Save (insert or update) one ExpenseClaims record with its lines.';

-- ExpenseClaims: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "BankCash"."getExpenseClaimInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('sourceLabel', "Lookups"."getLookupLabel"('ExpenseClaimSource', t.source) ->> 'label', 'sourceTone', "Lookups"."getLookupLabel"('ExpenseClaimSource', t.source) ->> 'tone', 'policyLimitPeriodLabel', "Lookups"."getLookupLabel"('PolicyLimitPeriod', t."policyLimitPeriod") ->> 'label', 'policyLimitPeriodTone', "Lookups"."getLookupLabel"('PolicyLimitPeriod', t."policyLimitPeriod") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ExpenseClaimStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ExpenseClaimStatus', t.status) ->> 'tone', 'workflowStageLabel', "Lookups"."getLookupLabel"('WorkflowStage', t."workflowStage") ->> 'label', 'workflowStageTone', "Lookups"."getLookupLabel"('WorkflowStage', t."workflowStage") ->> 'tone', 'rejectionReasonLabel', "Lookups"."getLookupLabel"('ExpenseClaimRejectionReason', t."rejectionReason") ->> 'label', 'rejectionReasonTone', "Lookups"."getLookupLabel"('ExpenseClaimRejectionReason', t."rejectionReason") ->> 'tone', 'paymentMethodLabel', "Lookups"."getLookupLabel"('ExpenseClaimPaymentMethod', t."paymentMethod") ->> 'label', 'paymentMethodTone', "Lookups"."getLookupLabel"('ExpenseClaimPaymentMethod', t."paymentMethod") ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "BankCash"."ExpenseClaimLines" c1 WHERE c1."claimId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "BankCash"."ExpenseClaims" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "BankCash"."getExpenseClaimInfo"(uuid) IS 'Read one ExpenseClaims record (getter for its screens).';

-- ExpenseClaims: Approve (status -> APPROVED); allowed from DRAFT, PENDING
CREATE OR REPLACE FUNCTION "BankCash"."expenseClaimApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "BankCash"."ExpenseClaims";
BEGIN
  SELECT * INTO "vRow" FROM "BankCash"."ExpenseClaims" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ExpenseClaims % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING') THEN
    RAISE EXCEPTION 'ExpenseClaims %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'ExpenseClaims: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"BankCash"."expenseClaimApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"BankCash"."expenseClaimApproveEntries"') USING "pId";
  END IF;
  UPDATE "BankCash"."ExpenseClaims" t SET status = 'APPROVED', "approvedAt" = now(), "approvedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- ExpenseClaims: Pay (status -> PAID); allowed from APPROVED
CREATE OR REPLACE FUNCTION "BankCash"."expenseClaimPay"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "BankCash"."ExpenseClaims";
BEGIN
  SELECT * INTO "vRow" FROM "BankCash"."ExpenseClaims" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ExpenseClaims % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'PAID' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('APPROVED') THEN
    RAISE EXCEPTION 'ExpenseClaims %: cannot pay from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"BankCash"."expenseClaimPayEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"BankCash"."expenseClaimPayEntries"') USING "pId";
  END IF;
  UPDATE "BankCash"."ExpenseClaims" t SET status = 'PAID' WHERE t.id = "pId";
  RETURN "pId";
END $$;
