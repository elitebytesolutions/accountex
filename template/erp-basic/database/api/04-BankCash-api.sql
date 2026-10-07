-- =============================================================================
-- Finsoft ERP (Basic edition) — API: "BankCash"
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
    INSERT INTO "BankCash"."CashAccounts" ("tenantId", code, name, "shortName", kind, "branchId", "custodianUserId", "accountId", "openingBalance", "openingBalanceDate", "imprestAmount", "varianceTolerance", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'shortName' THEN "vRec"."shortName" ELSE NULL END, CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE 'DRAWER' END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'custodianUserId' THEN "vRec"."custodianUserId" ELSE NULL END, CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE NULL END, CASE WHEN "pData" ? 'openingBalance' THEN "vRec"."openingBalance" ELSE 0 END, CASE WHEN "pData" ? 'openingBalanceDate' THEN "vRec"."openingBalanceDate" ELSE NULL END, CASE WHEN "pData" ? 'imprestAmount' THEN "vRec"."imprestAmount" ELSE NULL END, CASE WHEN "pData" ? 'varianceTolerance' THEN "vRec"."varianceTolerance" ELSE 1000 END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
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
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
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
    INSERT INTO "BankCash"."Cheques" ("tenantId", "docNo", "legacyNo", "docDate", "branchId", direction, "chequeNo", "customerId", "vendorId", "accountId", "partyName", "drawnOnBankId", "bankAccountId", "chequeDate", "dueDate", "receivedOn", amount, "currencyCode", "isPdc", "postingMode", "depositedOn", "presentedOn", "clearedOn", "bouncedOn", "bounceCount", "stoppedOn", "replacedByChequeId", "clearingJournalEntryId", remarks, narration)
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'legacyNo' THEN "vRec"."legacyNo" ELSE NULL END, CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'direction' THEN "vRec".direction ELSE NULL END, CASE WHEN "pData" ? 'chequeNo' THEN "vRec"."chequeNo" ELSE NULL END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE NULL END, CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE NULL END, CASE WHEN "pData" ? 'partyName' THEN "vRec"."partyName" ELSE NULL END, CASE WHEN "pData" ? 'drawnOnBankId' THEN "vRec"."drawnOnBankId" ELSE NULL END, CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'chequeDate' THEN "vRec"."chequeDate" ELSE NULL END, CASE WHEN "pData" ? 'dueDate' THEN "vRec"."dueDate" ELSE NULL END, CASE WHEN "pData" ? 'receivedOn' THEN "vRec"."receivedOn" ELSE NULL END, CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE NULL END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'isPdc' THEN "vRec"."isPdc" ELSE FALSE END, CASE WHEN "pData" ? 'postingMode' THEN "vRec"."postingMode" ELSE 'DEPOSIT' END, CASE WHEN "pData" ? 'depositedOn' THEN "vRec"."depositedOn" ELSE NULL END, CASE WHEN "pData" ? 'presentedOn' THEN "vRec"."presentedOn" ELSE NULL END, CASE WHEN "pData" ? 'clearedOn' THEN "vRec"."clearedOn" ELSE NULL END, CASE WHEN "pData" ? 'bouncedOn' THEN "vRec"."bouncedOn" ELSE NULL END, CASE WHEN "pData" ? 'bounceCount' THEN "vRec"."bounceCount" ELSE 0 END, CASE WHEN "pData" ? 'stoppedOn' THEN "vRec"."stoppedOn" ELSE NULL END, CASE WHEN "pData" ? 'replacedByChequeId' THEN "vRec"."replacedByChequeId" ELSE NULL END, CASE WHEN "pData" ? 'clearingJournalEntryId' THEN "vRec"."clearingJournalEntryId" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'narration' THEN "vRec".narration ELSE NULL END)
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
           narration = CASE WHEN "pData" ? 'narration' THEN "vRec".narration ELSE t.narration END
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
