-- Phase 7: Parties (customer groups, customers with contacts / addresses / notes, vendor categories, vendors with
-- contacts / bank accounts). Idempotent. Apply with: npm run db:sql

-- ---------------------------------------------------------------------------
-- 1. Row history on the tables that had none
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "customerGroupsAudit" ON "Sales"."CustomerGroups";
CREATE TRIGGER "customerGroupsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Sales"."CustomerGroups"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "customerContactsAudit" ON "Sales"."CustomerContacts";
CREATE TRIGGER "customerContactsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Sales"."CustomerContacts"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "customerAddressesAudit" ON "Sales"."CustomerAddresses";
CREATE TRIGGER "customerAddressesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Sales"."CustomerAddresses"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "customerNotesAudit" ON "Sales"."CustomerNotes";
CREATE TRIGGER "customerNotesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Sales"."CustomerNotes"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "vendorCategoriesAudit" ON "Purchases"."VendorCategories";
CREATE TRIGGER "vendorCategoriesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Purchases"."VendorCategories"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "vendorContactsAudit" ON "Purchases"."VendorContacts";
CREATE TRIGGER "vendorContactsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Purchases"."VendorContacts"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Child rows saved one at a time (same shape as the generated *AddUpdate functions). The parents' array saves
--    (customerAddUpdate / vendorAddUpdate) would rewrite the parent row, its version and history, on every child change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."customerContactAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."CustomerContacts";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."CustomerContacts", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Sales"."CustomerContacts" ("tenantId", "customerId", "fullName", designation, "isPrimary", mobile, phone, email, "receivesInvoices")
    VALUES ("vTenant", "vRec"."customerId", CASE WHEN "pData" ? 'fullName' THEN "vRec"."fullName" ELSE NULL END,
            CASE WHEN "pData" ? 'designation' THEN "vRec".designation ELSE NULL END,
            CASE WHEN "pData" ? 'isPrimary' THEN "vRec"."isPrimary" ELSE FALSE END,
            CASE WHEN "pData" ? 'mobile' THEN "vRec".mobile ELSE NULL END,
            CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END,
            CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END,
            CASE WHEN "pData" ? 'receivesInvoices' THEN "vRec"."receivesInvoices" ELSE FALSE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Sales"."CustomerContacts" t
       SET "fullName" = CASE WHEN "pData" ? 'fullName' THEN "vRec"."fullName" ELSE t."fullName" END,
           designation = CASE WHEN "pData" ? 'designation' THEN "vRec".designation ELSE t.designation END,
           "isPrimary" = CASE WHEN "pData" ? 'isPrimary' THEN "vRec"."isPrimary" ELSE t."isPrimary" END,
           mobile = CASE WHEN "pData" ? 'mobile' THEN "vRec".mobile ELSE t.mobile END,
           phone = CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE t.phone END,
           email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           "receivesInvoices" = CASE WHEN "pData" ? 'receivesInvoices' THEN "vRec"."receivesInvoices" ELSE t."receivesInvoices" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."CustomerContacts" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CustomerContacts %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CustomerContacts % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  RETURN "vRet";
END $function$;
GRANT EXECUTE ON FUNCTION "Sales"."customerContactAddUpdate"(jsonb) TO "finsoftApp";

CREATE OR REPLACE FUNCTION "Sales"."customerAddressAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."CustomerAddresses";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."CustomerAddresses", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Sales"."CustomerAddresses" ("tenantId", "customerId", "addressType", label, "addressLine", area, city, province, "contactName", "contactPhone", "isDefault")
    VALUES ("vTenant", "vRec"."customerId", CASE WHEN "pData" ? 'addressType' THEN "vRec"."addressType" ELSE 'SHIPPING' END,
            CASE WHEN "pData" ? 'label' THEN "vRec".label ELSE NULL END,
            CASE WHEN "pData" ? 'addressLine' THEN "vRec"."addressLine" ELSE NULL END,
            CASE WHEN "pData" ? 'area' THEN "vRec".area ELSE NULL END,
            CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END,
            CASE WHEN "pData" ? 'province' THEN "vRec".province ELSE NULL END,
            CASE WHEN "pData" ? 'contactName' THEN "vRec"."contactName" ELSE NULL END,
            CASE WHEN "pData" ? 'contactPhone' THEN "vRec"."contactPhone" ELSE NULL END,
            CASE WHEN "pData" ? 'isDefault' THEN "vRec"."isDefault" ELSE FALSE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Sales"."CustomerAddresses" t
       SET "addressType" = CASE WHEN "pData" ? 'addressType' THEN "vRec"."addressType" ELSE t."addressType" END,
           label = CASE WHEN "pData" ? 'label' THEN "vRec".label ELSE t.label END,
           "addressLine" = CASE WHEN "pData" ? 'addressLine' THEN "vRec"."addressLine" ELSE t."addressLine" END,
           area = CASE WHEN "pData" ? 'area' THEN "vRec".area ELSE t.area END,
           city = CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE t.city END,
           province = CASE WHEN "pData" ? 'province' THEN "vRec".province ELSE t.province END,
           "contactName" = CASE WHEN "pData" ? 'contactName' THEN "vRec"."contactName" ELSE t."contactName" END,
           "contactPhone" = CASE WHEN "pData" ? 'contactPhone' THEN "vRec"."contactPhone" ELSE t."contactPhone" END,
           "isDefault" = CASE WHEN "pData" ? 'isDefault' THEN "vRec"."isDefault" ELSE t."isDefault" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."CustomerAddresses" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CustomerAddresses %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CustomerAddresses % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  RETURN "vRet";
END $function$;
GRANT EXECUTE ON FUNCTION "Sales"."customerAddressAddUpdate"(jsonb) TO "finsoftApp";

CREATE OR REPLACE FUNCTION "Sales"."customerNoteAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."CustomerNotes";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."CustomerNotes", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Sales"."CustomerNotes" ("tenantId", "customerId", "authorUserId", note)
    VALUES ("vTenant", "vRec"."customerId", CASE WHEN "pData" ? 'authorUserId' THEN "vRec"."authorUserId" ELSE NULL END,
            CASE WHEN "pData" ? 'note' THEN "vRec".note ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Sales"."CustomerNotes" t
       SET "authorUserId" = CASE WHEN "pData" ? 'authorUserId' THEN "vRec"."authorUserId" ELSE t."authorUserId" END,
           note = CASE WHEN "pData" ? 'note' THEN "vRec".note ELSE t.note END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."CustomerNotes" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CustomerNotes %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CustomerNotes % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  RETURN "vRet";
END $function$;
GRANT EXECUTE ON FUNCTION "Sales"."customerNoteAddUpdate"(jsonb) TO "finsoftApp";

CREATE OR REPLACE FUNCTION "Purchases"."vendorContactAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Purchases"."VendorContacts";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Purchases"."VendorContacts", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Purchases"."VendorContacts" ("tenantId", "vendorId", "fullName", designation, phone, mobile, email, "isPrimary")
    VALUES ("vTenant", "vRec"."vendorId", CASE WHEN "pData" ? 'fullName' THEN "vRec"."fullName" ELSE NULL END,
            CASE WHEN "pData" ? 'designation' THEN "vRec".designation ELSE NULL END,
            CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END,
            CASE WHEN "pData" ? 'mobile' THEN "vRec".mobile ELSE NULL END,
            CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END,
            CASE WHEN "pData" ? 'isPrimary' THEN "vRec"."isPrimary" ELSE FALSE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Purchases"."VendorContacts" t
       SET "fullName" = CASE WHEN "pData" ? 'fullName' THEN "vRec"."fullName" ELSE t."fullName" END,
           designation = CASE WHEN "pData" ? 'designation' THEN "vRec".designation ELSE t.designation END,
           phone = CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE t.phone END,
           mobile = CASE WHEN "pData" ? 'mobile' THEN "vRec".mobile ELSE t.mobile END,
           email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           "isPrimary" = CASE WHEN "pData" ? 'isPrimary' THEN "vRec"."isPrimary" ELSE t."isPrimary" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Purchases"."VendorContacts" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'VendorContacts %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'VendorContacts % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  RETURN "vRet";
END $function$;
GRANT EXECUTE ON FUNCTION "Purchases"."vendorContactAddUpdate"(jsonb) TO "finsoftApp";

CREATE OR REPLACE FUNCTION "Purchases"."vendorBankAccountAddUpdate"("pData" jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Purchases"."VendorBankAccounts";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Purchases"."VendorBankAccounts", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Purchases"."VendorBankAccounts" ("tenantId", "vendorId", "bankName", "branchName", "accountTitle", "accountNo", iban, "swiftCode", "currencyCode", "isPrimary", "isActive")
    VALUES ("vTenant", "vRec"."vendorId", CASE WHEN "pData" ? 'bankName' THEN "vRec"."bankName" ELSE NULL END,
            CASE WHEN "pData" ? 'branchName' THEN "vRec"."branchName" ELSE NULL END,
            CASE WHEN "pData" ? 'accountTitle' THEN "vRec"."accountTitle" ELSE NULL END,
            CASE WHEN "pData" ? 'accountNo' THEN "vRec"."accountNo" ELSE NULL END,
            CASE WHEN "pData" ? 'iban' THEN "vRec".iban ELSE NULL END,
            CASE WHEN "pData" ? 'swiftCode' THEN "vRec"."swiftCode" ELSE NULL END,
            CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END,
            CASE WHEN "pData" ? 'isPrimary' THEN "vRec"."isPrimary" ELSE FALSE END,
            CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Purchases"."VendorBankAccounts" t
       SET "bankName" = CASE WHEN "pData" ? 'bankName' THEN "vRec"."bankName" ELSE t."bankName" END,
           "branchName" = CASE WHEN "pData" ? 'branchName' THEN "vRec"."branchName" ELSE t."branchName" END,
           "accountTitle" = CASE WHEN "pData" ? 'accountTitle' THEN "vRec"."accountTitle" ELSE t."accountTitle" END,
           "accountNo" = CASE WHEN "pData" ? 'accountNo' THEN "vRec"."accountNo" ELSE t."accountNo" END,
           iban = CASE WHEN "pData" ? 'iban' THEN "vRec".iban ELSE t.iban END,
           "swiftCode" = CASE WHEN "pData" ? 'swiftCode' THEN "vRec"."swiftCode" ELSE t."swiftCode" END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "isPrimary" = CASE WHEN "pData" ? 'isPrimary' THEN "vRec"."isPrimary" ELSE t."isPrimary" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Purchases"."VendorBankAccounts" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'VendorBankAccounts %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'VendorBankAccounts % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  RETURN "vRet";
END $function$;
GRANT EXECUTE ON FUNCTION "Purchases"."vendorBankAccountAddUpdate"(jsonb) TO "finsoftApp";

-- ---------------------------------------------------------------------------
-- 3. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('CUSTOMER_GROUP_IN_USE',         409, 'BUSINESS_RULE', 'SALES',     'Customers belong to this group. Deactivate it instead.', 'Delete of a used customer group', true, NULL),
  ('CUSTOMER_IN_USE',               409, 'BUSINESS_RULE', 'SALES',     'Documents use this customer. Deactivate it instead.', 'Delete of a used customer', true, NULL),
  ('CUSTOMER_HOLD_REASON_REQUIRED', 400, 'VALIDATION',    'SALES',     'Choose why the customer is on hold.', 'Hold without a reason', true, NULL),
  ('VENDOR_CATEGORY_IN_USE',        409, 'BUSINESS_RULE', 'PURCHASES', 'Vendors belong to this category. Deactivate it instead.', 'Delete of a used vendor category', true, NULL),
  ('VENDOR_IN_USE',                 409, 'BUSINESS_RULE', 'PURCHASES', 'Documents use this vendor. Deactivate it instead.', 'Delete of a used vendor', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 4. Readable labels and tones for the Phase 7 selects (codes unchanged)
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" l
   SET "label" = v.label, "tone" = v.tone
  FROM (VALUES
    ('DefaultWhtSection','153_1_A','153(1)(a) — goods','neutral'), ('DefaultWhtSection','153_1_B','153(1)(b) — services','neutral'),
    ('DefaultWhtSection','153_1_C','153(1)(c) — contracts','neutral'), ('DefaultWhtSection','EXEMPT','Exempt','neutral'),
    ('CustomerAtlStatus','ACTIVE','Active Taxpayer','good'), ('CustomerAtlStatus','NOT_ON_ATL','Not on ATL','warn'),
    ('VendorAtlStatus','ACTIVE','Active Taxpayer','good'), ('VendorAtlStatus','NOT_ON_ATL','Not on ATL','danger'), ('VendorAtlStatus','UNVERIFIED','Unverified','warn'),
    ('CustomerType','AOP','AOP / Partnership','neutral'), ('CustomerPaymentTerms','ADVANCE_50','50% advance','neutral'),
    ('CustomerHoldReason','OVER_LIMIT','Over credit limit','warn'), ('CustomerHoldReason','BOUNCED_CHEQUE','Bounced cheque','danger'),
    ('CustomerHoldReason','MANUAL','Manual hold','neutral')
  ) AS v(type, code, label, tone)
 WHERE l."lookupType" = v.type AND l.code = v.code AND l."tenantId" IS NULL
   AND (l."label" IS DISTINCT FROM v.label OR l."tone" IS DISTINCT FROM v.tone);
