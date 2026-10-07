-- =============================================================================
-- Finsoft ERP (Full edition) — API: "Purchases"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- VendorCategories: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Purchases"."vendorCategoryAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Purchases"."VendorCategories";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Purchases"."VendorCategories", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Purchases"."VendorCategories" ("tenantId", name, "sortOrder", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Purchases"."VendorCategories" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Purchases"."VendorCategories" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'VendorCategories %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'VendorCategories % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Purchases"."vendorCategoryAddUpdate"(jsonb) IS 'Save (insert or update) one VendorCategories record.';

-- VendorCategories: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Purchases"."getVendorCategoryInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "Purchases"."VendorCategories" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Purchases"."getVendorCategoryInfo"(uuid) IS 'Read one VendorCategories record (getter for its screens).';

-- Vendors: insert (no "id") or update (with "id"); child arrays: bankAccounts, contacts
CREATE OR REPLACE FUNCTION "Purchases"."vendorAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Purchases"."Vendors";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1VendorBankAccounts" "Purchases"."VendorBankAccounts";
  "vC1VendorContacts" "Purchases"."VendorContacts";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Purchases"."Vendors", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'code') OR "vRec".code IS NULL THEN
      "vRec".code := "Company"."getNextDocNo"('VEN', current_date, NULL);
    END IF;
    INSERT INTO "Purchases"."Vendors" ("tenantId", code, name, "legalName", "categoryId", ntn, cnic, strn, "atlStatus", "atlVerifiedAt", "defaultWhtSection", "defaultAccountId", "payableAccountId", "paymentTerms", "creditDays", "currencyCode", phone, email, address, city, "bankName", iban, "vendorSince", status, remarks, "countryCode")
    VALUES ("vTenant", "vRec".code, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'legalName' THEN "vRec"."legalName" ELSE NULL END, CASE WHEN "pData" ? 'categoryId' THEN "vRec"."categoryId" ELSE NULL END, CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE NULL END, CASE WHEN "pData" ? 'cnic' THEN "vRec".cnic ELSE NULL END, CASE WHEN "pData" ? 'strn' THEN "vRec".strn ELSE NULL END, CASE WHEN "pData" ? 'atlStatus' THEN "vRec"."atlStatus" ELSE 'UNVERIFIED' END, CASE WHEN "pData" ? 'atlVerifiedAt' THEN "vRec"."atlVerifiedAt" ELSE NULL END, CASE WHEN "pData" ? 'defaultWhtSection' THEN "vRec"."defaultWhtSection" ELSE '153_1_A' END, CASE WHEN "pData" ? 'defaultAccountId' THEN "vRec"."defaultAccountId" ELSE NULL END, CASE WHEN "pData" ? 'payableAccountId' THEN "vRec"."payableAccountId" ELSE NULL END, CASE WHEN "pData" ? 'paymentTerms' THEN "vRec"."paymentTerms" ELSE 'NET_30' END, CASE WHEN "pData" ? 'creditDays' THEN "vRec"."creditDays" ELSE 30 END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'address' THEN "vRec".address ELSE NULL END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'bankName' THEN "vRec"."bankName" ELSE NULL END, CASE WHEN "pData" ? 'iban' THEN "vRec".iban ELSE NULL END, CASE WHEN "pData" ? 'vendorSince' THEN "vRec"."vendorSince" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'countryCode' THEN "vRec"."countryCode" ELSE 'PK' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Purchases"."Vendors" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "legalName" = CASE WHEN "pData" ? 'legalName' THEN "vRec"."legalName" ELSE t."legalName" END,
           "categoryId" = CASE WHEN "pData" ? 'categoryId' THEN "vRec"."categoryId" ELSE t."categoryId" END,
           ntn = CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE t.ntn END,
           cnic = CASE WHEN "pData" ? 'cnic' THEN "vRec".cnic ELSE t.cnic END,
           strn = CASE WHEN "pData" ? 'strn' THEN "vRec".strn ELSE t.strn END,
           "atlStatus" = CASE WHEN "pData" ? 'atlStatus' THEN "vRec"."atlStatus" ELSE t."atlStatus" END,
           "atlVerifiedAt" = CASE WHEN "pData" ? 'atlVerifiedAt' THEN "vRec"."atlVerifiedAt" ELSE t."atlVerifiedAt" END,
           "defaultWhtSection" = CASE WHEN "pData" ? 'defaultWhtSection' THEN "vRec"."defaultWhtSection" ELSE t."defaultWhtSection" END,
           "defaultAccountId" = CASE WHEN "pData" ? 'defaultAccountId' THEN "vRec"."defaultAccountId" ELSE t."defaultAccountId" END,
           "payableAccountId" = CASE WHEN "pData" ? 'payableAccountId' THEN "vRec"."payableAccountId" ELSE t."payableAccountId" END,
           "paymentTerms" = CASE WHEN "pData" ? 'paymentTerms' THEN "vRec"."paymentTerms" ELSE t."paymentTerms" END,
           "creditDays" = CASE WHEN "pData" ? 'creditDays' THEN "vRec"."creditDays" ELSE t."creditDays" END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           phone = CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE t.phone END,
           email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           address = CASE WHEN "pData" ? 'address' THEN "vRec".address ELSE t.address END,
           city = CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE t.city END,
           "bankName" = CASE WHEN "pData" ? 'bankName' THEN "vRec"."bankName" ELSE t."bankName" END,
           iban = CASE WHEN "pData" ? 'iban' THEN "vRec".iban ELSE t.iban END,
           "vendorSince" = CASE WHEN "pData" ? 'vendorSince' THEN "vRec"."vendorSince" ELSE t."vendorSince" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END,
           "countryCode" = CASE WHEN "pData" ? 'countryCode' THEN "vRec"."countryCode" ELSE t."countryCode" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Purchases"."Vendors" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Vendors %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Vendors % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'bankAccounts' THEN
    -- bankAccounts: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Purchases"."VendorBankAccounts"
     WHERE "tenantId" = "vTenant" AND "vendorId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'bankAccounts') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'bankAccounts') WITH ORDINALITY t(x, n) LOOP
      "vC1VendorBankAccounts" := jsonb_populate_record(NULL::"Purchases"."VendorBankAccounts", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Purchases"."VendorBankAccounts" t
           SET "bankName" = CASE WHEN "vE1" ? 'bankName' THEN "vC1VendorBankAccounts"."bankName" ELSE t."bankName" END,
               "branchName" = CASE WHEN "vE1" ? 'branchName' THEN "vC1VendorBankAccounts"."branchName" ELSE t."branchName" END,
               "accountTitle" = CASE WHEN "vE1" ? 'accountTitle' THEN "vC1VendorBankAccounts"."accountTitle" ELSE t."accountTitle" END,
               "accountNo" = CASE WHEN "vE1" ? 'accountNo' THEN "vC1VendorBankAccounts"."accountNo" ELSE t."accountNo" END,
               iban = CASE WHEN "vE1" ? 'iban' THEN "vC1VendorBankAccounts".iban ELSE t.iban END,
               "swiftCode" = CASE WHEN "vE1" ? 'swiftCode' THEN "vC1VendorBankAccounts"."swiftCode" ELSE t."swiftCode" END,
               "currencyCode" = CASE WHEN "vE1" ? 'currencyCode' THEN "vC1VendorBankAccounts"."currencyCode" ELSE t."currencyCode" END,
               "isPrimary" = CASE WHEN "vE1" ? 'isPrimary' THEN "vC1VendorBankAccounts"."isPrimary" ELSE t."isPrimary" END,
               "isActive" = CASE WHEN "vE1" ? 'isActive' THEN "vC1VendorBankAccounts"."isActive" ELSE t."isActive" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."vendorId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'VendorBankAccounts: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Purchases"."VendorBankAccounts" ("vendorId", "tenantId", "bankName", "branchName", "accountTitle", "accountNo", iban, "swiftCode", "currencyCode", "isPrimary", "isActive")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'bankName' THEN "vC1VendorBankAccounts"."bankName" ELSE NULL END, CASE WHEN "vE1" ? 'branchName' THEN "vC1VendorBankAccounts"."branchName" ELSE NULL END, CASE WHEN "vE1" ? 'accountTitle' THEN "vC1VendorBankAccounts"."accountTitle" ELSE NULL END, CASE WHEN "vE1" ? 'accountNo' THEN "vC1VendorBankAccounts"."accountNo" ELSE NULL END, CASE WHEN "vE1" ? 'iban' THEN "vC1VendorBankAccounts".iban ELSE NULL END, CASE WHEN "vE1" ? 'swiftCode' THEN "vC1VendorBankAccounts"."swiftCode" ELSE NULL END, CASE WHEN "vE1" ? 'currencyCode' THEN "vC1VendorBankAccounts"."currencyCode" ELSE 'PKR' END, CASE WHEN "vE1" ? 'isPrimary' THEN "vC1VendorBankAccounts"."isPrimary" ELSE FALSE END, CASE WHEN "vE1" ? 'isActive' THEN "vC1VendorBankAccounts"."isActive" ELSE TRUE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'contacts' THEN
    -- contacts: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Purchases"."VendorContacts"
     WHERE "tenantId" = "vTenant" AND "vendorId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'contacts') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'contacts') WITH ORDINALITY t(x, n) LOOP
      "vC1VendorContacts" := jsonb_populate_record(NULL::"Purchases"."VendorContacts", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Purchases"."VendorContacts" t
           SET "fullName" = CASE WHEN "vE1" ? 'fullName' THEN "vC1VendorContacts"."fullName" ELSE t."fullName" END,
               designation = CASE WHEN "vE1" ? 'designation' THEN "vC1VendorContacts".designation ELSE t.designation END,
               phone = CASE WHEN "vE1" ? 'phone' THEN "vC1VendorContacts".phone ELSE t.phone END,
               mobile = CASE WHEN "vE1" ? 'mobile' THEN "vC1VendorContacts".mobile ELSE t.mobile END,
               email = CASE WHEN "vE1" ? 'email' THEN "vC1VendorContacts".email ELSE t.email END,
               "isPrimary" = CASE WHEN "vE1" ? 'isPrimary' THEN "vC1VendorContacts"."isPrimary" ELSE t."isPrimary" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."vendorId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'VendorContacts: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Purchases"."VendorContacts" ("vendorId", "tenantId", "fullName", designation, phone, mobile, email, "isPrimary")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'fullName' THEN "vC1VendorContacts"."fullName" ELSE NULL END, CASE WHEN "vE1" ? 'designation' THEN "vC1VendorContacts".designation ELSE NULL END, CASE WHEN "vE1" ? 'phone' THEN "vC1VendorContacts".phone ELSE NULL END, CASE WHEN "vE1" ? 'mobile' THEN "vC1VendorContacts".mobile ELSE NULL END, CASE WHEN "vE1" ? 'email' THEN "vC1VendorContacts".email ELSE NULL END, CASE WHEN "vE1" ? 'isPrimary' THEN "vC1VendorContacts"."isPrimary" ELSE FALSE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Purchases"."vendorAddUpdate"(jsonb) IS 'Save (insert or update) one Vendors record with its bankAccounts, contacts.';

-- Vendors: one record as JSON (camelCase keys), with lookup labels and bankAccounts, contacts
CREATE OR REPLACE FUNCTION "Purchases"."getVendorInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('atlStatusLabel', "Lookups"."getLookupLabel"('VendorAtlStatus', t."atlStatus") ->> 'label', 'atlStatusTone', "Lookups"."getLookupLabel"('VendorAtlStatus', t."atlStatus") ->> 'tone', 'defaultWhtSectionLabel', "Lookups"."getLookupLabel"('DefaultWhtSection', t."defaultWhtSection") ->> 'label', 'defaultWhtSectionTone', "Lookups"."getLookupLabel"('DefaultWhtSection', t."defaultWhtSection") ->> 'tone', 'paymentTermsLabel', "Lookups"."getLookupLabel"('PurchaseOrderPaymentTerms', t."paymentTerms") ->> 'label', 'paymentTermsTone', "Lookups"."getLookupLabel"('PurchaseOrderPaymentTerms', t."paymentTerms") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone') ||
         jsonb_build_object('bankAccounts', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Purchases"."VendorBankAccounts" c1 WHERE c1."vendorId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'contacts', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Purchases"."VendorContacts" c1 WHERE c1."vendorId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Purchases"."Vendors" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Purchases"."getVendorInfo"(uuid) IS 'Read one Vendors record (getter for its screens).';

-- PurchaseOrders: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Purchases"."purchaseOrderAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Purchases"."PurchaseOrders";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1PurchaseOrderLines" "Purchases"."PurchaseOrderLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Purchases"."PurchaseOrders", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('PO', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Purchases"."PurchaseOrders" ("tenantId", "docNo", "docDate", "vendorId", "branchId", "warehouseId", "expectedDate", "paymentTerms", "creditDays", "costCentreId", "buyerUserId", "currencyCode", "fxRate", "grossAmount", "discountAmount", "netAmount", "taxAmount", "totalAmount", "sentToVendorAt", remarks, "departmentId", "projectId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'expectedDate' THEN "vRec"."expectedDate" ELSE NULL END, CASE WHEN "pData" ? 'paymentTerms' THEN "vRec"."paymentTerms" ELSE 'NET_30' END, CASE WHEN "pData" ? 'creditDays' THEN "vRec"."creditDays" ELSE 30 END, CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE NULL END, CASE WHEN "pData" ? 'buyerUserId' THEN "vRec"."buyerUserId" ELSE NULL END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE 1 END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE 0 END, CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE 0 END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE 0 END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE 0 END, CASE WHEN "pData" ? 'sentToVendorAt' THEN "vRec"."sentToVendorAt" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE NULL END, CASE WHEN "pData" ? 'projectId' THEN "vRec"."projectId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Purchases"."PurchaseOrders" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'PurchaseOrders: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Purchases"."PurchaseOrders" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "vendorId" = CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE t."vendorId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "expectedDate" = CASE WHEN "pData" ? 'expectedDate' THEN "vRec"."expectedDate" ELSE t."expectedDate" END,
           "paymentTerms" = CASE WHEN "pData" ? 'paymentTerms' THEN "vRec"."paymentTerms" ELSE t."paymentTerms" END,
           "creditDays" = CASE WHEN "pData" ? 'creditDays' THEN "vRec"."creditDays" ELSE t."creditDays" END,
           "costCentreId" = CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE t."costCentreId" END,
           "buyerUserId" = CASE WHEN "pData" ? 'buyerUserId' THEN "vRec"."buyerUserId" ELSE t."buyerUserId" END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "fxRate" = CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE t."fxRate" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "discountAmount" = CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE t."discountAmount" END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "totalAmount" = CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE t."totalAmount" END,
           "sentToVendorAt" = CASE WHEN "pData" ? 'sentToVendorAt' THEN "vRec"."sentToVendorAt" ELSE t."sentToVendorAt" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END,
           "departmentId" = CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE t."departmentId" END,
           "projectId" = CASE WHEN "pData" ? 'projectId' THEN "vRec"."projectId" ELSE t."projectId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Purchases"."PurchaseOrders" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PurchaseOrders %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PurchaseOrders % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Purchases"."PurchaseOrderLines"
     WHERE "tenantId" = "vTenant" AND "purchaseOrderId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1PurchaseOrderLines" := jsonb_populate_record(NULL::"Purchases"."PurchaseOrderLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1PurchaseOrderLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Purchases"."PurchaseOrderLines" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1PurchaseOrderLines"."itemId" ELSE t."itemId" END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1PurchaseOrderLines".description ELSE t.description END,
               "accountId" = CASE WHEN "vE1" ? 'accountId' THEN "vC1PurchaseOrderLines"."accountId" ELSE t."accountId" END,
               "qtyCtn" = CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1PurchaseOrderLines"."qtyCtn" ELSE t."qtyCtn" END,
               "qtyLoose" = CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1PurchaseOrderLines"."qtyLoose" ELSE t."qtyLoose" END,
               "baseQty" = CASE WHEN "vE1" ? 'baseQty' THEN "vC1PurchaseOrderLines"."baseQty" ELSE t."baseQty" END,
               "bonusQty" = CASE WHEN "vE1" ? 'bonusQty' THEN "vC1PurchaseOrderLines"."bonusQty" ELSE t."bonusQty" END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1PurchaseOrderLines".rate ELSE t.rate END,
               "discountPct" = CASE WHEN "vE1" ? 'discountPct' THEN "vC1PurchaseOrderLines"."discountPct" ELSE t."discountPct" END,
               "grossAmount" = CASE WHEN "vE1" ? 'grossAmount' THEN "vC1PurchaseOrderLines"."grossAmount" ELSE t."grossAmount" END,
               "discountAmount" = CASE WHEN "vE1" ? 'discountAmount' THEN "vC1PurchaseOrderLines"."discountAmount" ELSE t."discountAmount" END,
               "netAmount" = CASE WHEN "vE1" ? 'netAmount' THEN "vC1PurchaseOrderLines"."netAmount" ELSE t."netAmount" END,
               "taxCodeId" = CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1PurchaseOrderLines"."taxCodeId" ELSE t."taxCodeId" END,
               "taxRate" = CASE WHEN "vE1" ? 'taxRate' THEN "vC1PurchaseOrderLines"."taxRate" ELSE t."taxRate" END,
               "taxAmount" = CASE WHEN "vE1" ? 'taxAmount' THEN "vC1PurchaseOrderLines"."taxAmount" ELSE t."taxAmount" END,
               "totalAmount" = CASE WHEN "vE1" ? 'totalAmount' THEN "vC1PurchaseOrderLines"."totalAmount" ELSE t."totalAmount" END,
               "receivedQty" = CASE WHEN "vE1" ? 'receivedQty' THEN "vC1PurchaseOrderLines"."receivedQty" ELSE t."receivedQty" END,
               "billedQty" = CASE WHEN "vE1" ? 'billedQty' THEN "vC1PurchaseOrderLines"."billedQty" ELSE t."billedQty" END,
               "costCentreId" = CASE WHEN "vE1" ? 'costCentreId' THEN "vC1PurchaseOrderLines"."costCentreId" ELSE t."costCentreId" END,
               remarks = CASE WHEN "vE1" ? 'remarks' THEN "vC1PurchaseOrderLines".remarks ELSE t.remarks END,
               "lineNo" = "vC1PurchaseOrderLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."purchaseOrderId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PurchaseOrderLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Purchases"."PurchaseOrderLines" ("purchaseOrderId", "tenantId", "lineNo", "itemId", description, "accountId", "qtyCtn", "qtyLoose", "baseQty", "bonusQty", rate, "discountPct", "grossAmount", "discountAmount", "netAmount", "taxCodeId", "taxRate", "taxAmount", "totalAmount", "receivedQty", "billedQty", "costCentreId", remarks)
        VALUES ("vRet", "vTenant", "vC1PurchaseOrderLines"."lineNo", CASE WHEN "vE1" ? 'itemId' THEN "vC1PurchaseOrderLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1PurchaseOrderLines".description ELSE NULL END, CASE WHEN "vE1" ? 'accountId' THEN "vC1PurchaseOrderLines"."accountId" ELSE NULL END, CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1PurchaseOrderLines"."qtyCtn" ELSE 0 END, CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1PurchaseOrderLines"."qtyLoose" ELSE 0 END, CASE WHEN "vE1" ? 'baseQty' THEN "vC1PurchaseOrderLines"."baseQty" ELSE NULL END, CASE WHEN "vE1" ? 'bonusQty' THEN "vC1PurchaseOrderLines"."bonusQty" ELSE 0 END, CASE WHEN "vE1" ? 'rate' THEN "vC1PurchaseOrderLines".rate ELSE NULL END, CASE WHEN "vE1" ? 'discountPct' THEN "vC1PurchaseOrderLines"."discountPct" ELSE 0 END, CASE WHEN "vE1" ? 'grossAmount' THEN "vC1PurchaseOrderLines"."grossAmount" ELSE NULL END, CASE WHEN "vE1" ? 'discountAmount' THEN "vC1PurchaseOrderLines"."discountAmount" ELSE 0 END, CASE WHEN "vE1" ? 'netAmount' THEN "vC1PurchaseOrderLines"."netAmount" ELSE NULL END, CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1PurchaseOrderLines"."taxCodeId" ELSE NULL END, CASE WHEN "vE1" ? 'taxRate' THEN "vC1PurchaseOrderLines"."taxRate" ELSE 0 END, CASE WHEN "vE1" ? 'taxAmount' THEN "vC1PurchaseOrderLines"."taxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'totalAmount' THEN "vC1PurchaseOrderLines"."totalAmount" ELSE NULL END, CASE WHEN "vE1" ? 'receivedQty' THEN "vC1PurchaseOrderLines"."receivedQty" ELSE 0 END, CASE WHEN "vE1" ? 'billedQty' THEN "vC1PurchaseOrderLines"."billedQty" ELSE 0 END, CASE WHEN "vE1" ? 'costCentreId' THEN "vC1PurchaseOrderLines"."costCentreId" ELSE NULL END, CASE WHEN "vE1" ? 'remarks' THEN "vC1PurchaseOrderLines".remarks ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Purchases"."purchaseOrderAddUpdate"(jsonb) IS 'Save (insert or update) one PurchaseOrders record with its lines.';

-- PurchaseOrders: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Purchases"."getPurchaseOrderInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('paymentTermsLabel', "Lookups"."getLookupLabel"('PurchaseOrderPaymentTerms', t."paymentTerms") ->> 'label', 'paymentTermsTone', "Lookups"."getLookupLabel"('PurchaseOrderPaymentTerms', t."paymentTerms") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('PurchaseOrderStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('PurchaseOrderStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Purchases"."PurchaseOrderLines" c1 WHERE c1."purchaseOrderId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Purchases"."PurchaseOrders" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Purchases"."getPurchaseOrderInfo"(uuid) IS 'Read one PurchaseOrders record (getter for its screens).';

-- PurchaseOrders: Approve (status -> APPROVED); allowed from DRAFT
CREATE OR REPLACE FUNCTION "Purchases"."purchaseOrderApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Purchases"."PurchaseOrders";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."PurchaseOrders" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PurchaseOrders % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'PurchaseOrders %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'PurchaseOrders: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."purchaseOrderApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."purchaseOrderApproveEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."PurchaseOrders" t SET status = 'APPROVED', "approvedAt" = now(), "approvedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- PurchaseOrders: Cancel (status -> CANCELLED); allowed from DRAFT, PENDING_L1, PENDING_L2, APPROVED, PARTIALLY_RECEIVED, RECEIVED, BILLED
CREATE OR REPLACE FUNCTION "Purchases"."purchaseOrderCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Purchases"."PurchaseOrders";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."PurchaseOrders" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PurchaseOrders % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_L1', 'PENDING_L2', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'BILLED') THEN
    RAISE EXCEPTION 'PurchaseOrders %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."purchaseOrderCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."purchaseOrderCancelEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."PurchaseOrders" t SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- GoodsReceivedNotes: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Purchases"."goodsReceivedNoteAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Purchases"."GoodsReceivedNotes";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1GoodsReceivedNoteLines" "Purchases"."GoodsReceivedNoteLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Purchases"."GoodsReceivedNotes", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('GRN', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Purchases"."GoodsReceivedNotes" ("tenantId", "docNo", "docDate", "purchaseOrderId", "vendorId", "branchId", "warehouseId", "vendorRef", "qcStatus", "qcNote", "matchStatus", "billStatus", "receivedQty", "acceptedAmount", "rejectedAmount", remarks, "isImport")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'purchaseOrderId' THEN "vRec"."purchaseOrderId" ELSE NULL END, CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'vendorRef' THEN "vRec"."vendorRef" ELSE NULL END, CASE WHEN "pData" ? 'qcStatus' THEN "vRec"."qcStatus" ELSE 'PASSED' END, CASE WHEN "pData" ? 'qcNote' THEN "vRec"."qcNote" ELSE NULL END, CASE WHEN "pData" ? 'matchStatus' THEN "vRec"."matchStatus" ELSE 'TWO_WAY_BILL_AWAITED' END, CASE WHEN "pData" ? 'billStatus' THEN "vRec"."billStatus" ELSE 'AWAITING' END, CASE WHEN "pData" ? 'receivedQty' THEN "vRec"."receivedQty" ELSE 0 END, CASE WHEN "pData" ? 'acceptedAmount' THEN "vRec"."acceptedAmount" ELSE 0 END, CASE WHEN "pData" ? 'rejectedAmount' THEN "vRec"."rejectedAmount" ELSE 0 END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'isImport' THEN "vRec"."isImport" ELSE FALSE END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Purchases"."GoodsReceivedNotes" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'GoodsReceivedNotes: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Purchases"."GoodsReceivedNotes" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "purchaseOrderId" = CASE WHEN "pData" ? 'purchaseOrderId' THEN "vRec"."purchaseOrderId" ELSE t."purchaseOrderId" END,
           "vendorId" = CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE t."vendorId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "vendorRef" = CASE WHEN "pData" ? 'vendorRef' THEN "vRec"."vendorRef" ELSE t."vendorRef" END,
           "qcStatus" = CASE WHEN "pData" ? 'qcStatus' THEN "vRec"."qcStatus" ELSE t."qcStatus" END,
           "qcNote" = CASE WHEN "pData" ? 'qcNote' THEN "vRec"."qcNote" ELSE t."qcNote" END,
           "matchStatus" = CASE WHEN "pData" ? 'matchStatus' THEN "vRec"."matchStatus" ELSE t."matchStatus" END,
           "billStatus" = CASE WHEN "pData" ? 'billStatus' THEN "vRec"."billStatus" ELSE t."billStatus" END,
           "receivedQty" = CASE WHEN "pData" ? 'receivedQty' THEN "vRec"."receivedQty" ELSE t."receivedQty" END,
           "acceptedAmount" = CASE WHEN "pData" ? 'acceptedAmount' THEN "vRec"."acceptedAmount" ELSE t."acceptedAmount" END,
           "rejectedAmount" = CASE WHEN "pData" ? 'rejectedAmount' THEN "vRec"."rejectedAmount" ELSE t."rejectedAmount" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END,
           "isImport" = CASE WHEN "pData" ? 'isImport' THEN "vRec"."isImport" ELSE t."isImport" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Purchases"."GoodsReceivedNotes" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'GoodsReceivedNotes %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'GoodsReceivedNotes % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Purchases"."GoodsReceivedNoteLines"
     WHERE "tenantId" = "vTenant" AND "grnId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1GoodsReceivedNoteLines" := jsonb_populate_record(NULL::"Purchases"."GoodsReceivedNoteLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1GoodsReceivedNoteLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Purchases"."GoodsReceivedNoteLines" t
           SET "purchaseOrderLineId" = CASE WHEN "vE1" ? 'purchaseOrderLineId' THEN "vC1GoodsReceivedNoteLines"."purchaseOrderLineId" ELSE t."purchaseOrderLineId" END,
               "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1GoodsReceivedNoteLines"."itemId" ELSE t."itemId" END,
               "orderedQty" = CASE WHEN "vE1" ? 'orderedQty' THEN "vC1GoodsReceivedNoteLines"."orderedQty" ELSE t."orderedQty" END,
               "prevReceivedQty" = CASE WHEN "vE1" ? 'prevReceivedQty' THEN "vC1GoodsReceivedNoteLines"."prevReceivedQty" ELSE t."prevReceivedQty" END,
               "receivedQty" = CASE WHEN "vE1" ? 'receivedQty' THEN "vC1GoodsReceivedNoteLines"."receivedQty" ELSE t."receivedQty" END,
               "acceptedQty" = CASE WHEN "vE1" ? 'acceptedQty' THEN "vC1GoodsReceivedNoteLines"."acceptedQty" ELSE t."acceptedQty" END,
               "rejectedQty" = CASE WHEN "vE1" ? 'rejectedQty' THEN "vC1GoodsReceivedNoteLines"."rejectedQty" ELSE t."rejectedQty" END,
               "rejectReason" = CASE WHEN "vE1" ? 'rejectReason' THEN "vC1GoodsReceivedNoteLines"."rejectReason" ELSE t."rejectReason" END,
               "batchId" = CASE WHEN "vE1" ? 'batchId' THEN "vC1GoodsReceivedNoteLines"."batchId" ELSE t."batchId" END,
               "batchNo" = CASE WHEN "vE1" ? 'batchNo' THEN "vC1GoodsReceivedNoteLines"."batchNo" ELSE t."batchNo" END,
               "expiryDate" = CASE WHEN "vE1" ? 'expiryDate' THEN "vC1GoodsReceivedNoteLines"."expiryDate" ELSE t."expiryDate" END,
               "unitCost" = CASE WHEN "vE1" ? 'unitCost' THEN "vC1GoodsReceivedNoteLines"."unitCost" ELSE t."unitCost" END,
               "acceptedAmount" = CASE WHEN "vE1" ? 'acceptedAmount' THEN "vC1GoodsReceivedNoteLines"."acceptedAmount" ELSE t."acceptedAmount" END,
               "rejectedAmount" = CASE WHEN "vE1" ? 'rejectedAmount' THEN "vC1GoodsReceivedNoteLines"."rejectedAmount" ELSE t."rejectedAmount" END,
               "billedQty" = CASE WHEN "vE1" ? 'billedQty' THEN "vC1GoodsReceivedNoteLines"."billedQty" ELSE t."billedQty" END,
               "lineNo" = "vC1GoodsReceivedNoteLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."grnId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'GoodsReceivedNoteLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Purchases"."GoodsReceivedNoteLines" ("grnId", "tenantId", "lineNo", "purchaseOrderLineId", "itemId", "orderedQty", "prevReceivedQty", "receivedQty", "acceptedQty", "rejectedQty", "rejectReason", "batchId", "batchNo", "expiryDate", "unitCost", "acceptedAmount", "rejectedAmount", "billedQty")
        VALUES ("vRet", "vTenant", "vC1GoodsReceivedNoteLines"."lineNo", CASE WHEN "vE1" ? 'purchaseOrderLineId' THEN "vC1GoodsReceivedNoteLines"."purchaseOrderLineId" ELSE NULL END, CASE WHEN "vE1" ? 'itemId' THEN "vC1GoodsReceivedNoteLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'orderedQty' THEN "vC1GoodsReceivedNoteLines"."orderedQty" ELSE 0 END, CASE WHEN "vE1" ? 'prevReceivedQty' THEN "vC1GoodsReceivedNoteLines"."prevReceivedQty" ELSE 0 END, CASE WHEN "vE1" ? 'receivedQty' THEN "vC1GoodsReceivedNoteLines"."receivedQty" ELSE NULL END, CASE WHEN "vE1" ? 'acceptedQty' THEN "vC1GoodsReceivedNoteLines"."acceptedQty" ELSE NULL END, CASE WHEN "vE1" ? 'rejectedQty' THEN "vC1GoodsReceivedNoteLines"."rejectedQty" ELSE 0 END, CASE WHEN "vE1" ? 'rejectReason' THEN "vC1GoodsReceivedNoteLines"."rejectReason" ELSE NULL END, CASE WHEN "vE1" ? 'batchId' THEN "vC1GoodsReceivedNoteLines"."batchId" ELSE NULL END, CASE WHEN "vE1" ? 'batchNo' THEN "vC1GoodsReceivedNoteLines"."batchNo" ELSE NULL END, CASE WHEN "vE1" ? 'expiryDate' THEN "vC1GoodsReceivedNoteLines"."expiryDate" ELSE NULL END, CASE WHEN "vE1" ? 'unitCost' THEN "vC1GoodsReceivedNoteLines"."unitCost" ELSE 0 END, CASE WHEN "vE1" ? 'acceptedAmount' THEN "vC1GoodsReceivedNoteLines"."acceptedAmount" ELSE 0 END, CASE WHEN "vE1" ? 'rejectedAmount' THEN "vC1GoodsReceivedNoteLines"."rejectedAmount" ELSE 0 END, CASE WHEN "vE1" ? 'billedQty' THEN "vC1GoodsReceivedNoteLines"."billedQty" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Purchases"."goodsReceivedNoteAddUpdate"(jsonb) IS 'Save (insert or update) one GoodsReceivedNotes record with its lines.';

-- GoodsReceivedNotes: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Purchases"."getGoodsReceivedNoteInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('qcStatusLabel', "Lookups"."getLookupLabel"('QcStatus', t."qcStatus") ->> 'label', 'qcStatusTone', "Lookups"."getLookupLabel"('QcStatus', t."qcStatus") ->> 'tone', 'matchStatusLabel', "Lookups"."getLookupLabel"('GoodsReceivedNoteMatchStatus', t."matchStatus") ->> 'label', 'matchStatusTone', "Lookups"."getLookupLabel"('GoodsReceivedNoteMatchStatus', t."matchStatus") ->> 'tone', 'billStatusLabel', "Lookups"."getLookupLabel"('BillStatus', t."billStatus") ->> 'label', 'billStatusTone', "Lookups"."getLookupLabel"('BillStatus', t."billStatus") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('DraftPostedCancelledStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('DraftPostedCancelledStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Purchases"."GoodsReceivedNoteLines" c1 WHERE c1."grnId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Purchases"."GoodsReceivedNotes" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Purchases"."getGoodsReceivedNoteInfo"(uuid) IS 'Read one GoodsReceivedNotes record (getter for its screens).';

-- GoodsReceivedNotes: Post (status -> POSTED); allowed from DRAFT
CREATE OR REPLACE FUNCTION "Purchases"."goodsReceivedNotePost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Purchases"."GoodsReceivedNotes";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."GoodsReceivedNotes" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GoodsReceivedNotes % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'GoodsReceivedNotes %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."goodsReceivedNotePostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."goodsReceivedNotePostEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."GoodsReceivedNotes" t SET status = 'POSTED', "postedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- GoodsReceivedNotes: Cancel (status -> CANCELLED); allowed from DRAFT, POSTED
CREATE OR REPLACE FUNCTION "Purchases"."goodsReceivedNoteCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Purchases"."GoodsReceivedNotes";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."GoodsReceivedNotes" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GoodsReceivedNotes % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'POSTED') THEN
    RAISE EXCEPTION 'GoodsReceivedNotes %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."goodsReceivedNoteCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."goodsReceivedNoteCancelEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."GoodsReceivedNotes" t SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- VendorBills: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Purchases"."vendorBillAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Purchases"."VendorBills";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1VendorBillLines" "Purchases"."VendorBillLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Purchases"."VendorBills", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"(CASE WHEN "vRec".channel = 'STANDARD' THEN 'BILL' WHEN "vRec".channel = 'COUNTER' THEN 'PV' ELSE 'BILL' END, "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Purchases"."VendorBills" ("tenantId", channel, "docNo", "docDate", "dueDate", "vendorId", "branchId", "warehouseId", "purchaseOrderId", "grnId", "vendorInvoiceNo", "payableAccountId", "currencyCode", "fxRate", "purchaserUserId", "costCentreId", "dealOnSupply", "retailPriceDiscountPct", "captureMethod", "grossAmount", "discountAmount", "netAmount", "taxAmount", "advanceTaxAmount", "totalAmount", "whtAmount", "netPayableAmount", "payMode", "bankAccountId", "cashAccountId", "chequeNo", "chequeId", "paidNowAmount", "matchStatus", "matchVariancePct", "isDisputed", "disputeNote", remarks, "projectId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'channel' THEN "vRec".channel ELSE 'STANDARD' END, "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'dueDate' THEN "vRec"."dueDate" ELSE NULL END, CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'purchaseOrderId' THEN "vRec"."purchaseOrderId" ELSE NULL END, CASE WHEN "pData" ? 'grnId' THEN "vRec"."grnId" ELSE NULL END, CASE WHEN "pData" ? 'vendorInvoiceNo' THEN "vRec"."vendorInvoiceNo" ELSE NULL END, CASE WHEN "pData" ? 'payableAccountId' THEN "vRec"."payableAccountId" ELSE NULL END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE 1 END, CASE WHEN "pData" ? 'purchaserUserId' THEN "vRec"."purchaserUserId" ELSE NULL END, CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE NULL END, CASE WHEN "pData" ? 'dealOnSupply' THEN "vRec"."dealOnSupply" ELSE NULL END, CASE WHEN "pData" ? 'retailPriceDiscountPct' THEN "vRec"."retailPriceDiscountPct" ELSE 0 END, CASE WHEN "pData" ? 'captureMethod' THEN "vRec"."captureMethod" ELSE 'MANUAL' END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE 0 END, CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE 0 END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE 0 END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'advanceTaxAmount' THEN "vRec"."advanceTaxAmount" ELSE 0 END, CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE 0 END, CASE WHEN "pData" ? 'whtAmount' THEN "vRec"."whtAmount" ELSE 0 END, CASE WHEN "pData" ? 'netPayableAmount' THEN "vRec"."netPayableAmount" ELSE 0 END, CASE WHEN "pData" ? 'payMode' THEN "vRec"."payMode" ELSE 'CREDIT' END, CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE NULL END, CASE WHEN "pData" ? 'chequeNo' THEN "vRec"."chequeNo" ELSE NULL END, CASE WHEN "pData" ? 'chequeId' THEN "vRec"."chequeId" ELSE NULL END, CASE WHEN "pData" ? 'paidNowAmount' THEN "vRec"."paidNowAmount" ELSE 0 END, CASE WHEN "pData" ? 'matchStatus' THEN "vRec"."matchStatus" ELSE 'NO_PO' END, CASE WHEN "pData" ? 'matchVariancePct' THEN "vRec"."matchVariancePct" ELSE NULL END, CASE WHEN "pData" ? 'isDisputed' THEN "vRec"."isDisputed" ELSE FALSE END, CASE WHEN "pData" ? 'disputeNote' THEN "vRec"."disputeNote" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'projectId' THEN "vRec"."projectId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Purchases"."VendorBills" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'VendorBills: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Purchases"."VendorBills" t
       SET channel = CASE WHEN "pData" ? 'channel' THEN "vRec".channel ELSE t.channel END,
           "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "dueDate" = CASE WHEN "pData" ? 'dueDate' THEN "vRec"."dueDate" ELSE t."dueDate" END,
           "vendorId" = CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE t."vendorId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "purchaseOrderId" = CASE WHEN "pData" ? 'purchaseOrderId' THEN "vRec"."purchaseOrderId" ELSE t."purchaseOrderId" END,
           "grnId" = CASE WHEN "pData" ? 'grnId' THEN "vRec"."grnId" ELSE t."grnId" END,
           "vendorInvoiceNo" = CASE WHEN "pData" ? 'vendorInvoiceNo' THEN "vRec"."vendorInvoiceNo" ELSE t."vendorInvoiceNo" END,
           "payableAccountId" = CASE WHEN "pData" ? 'payableAccountId' THEN "vRec"."payableAccountId" ELSE t."payableAccountId" END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "fxRate" = CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE t."fxRate" END,
           "purchaserUserId" = CASE WHEN "pData" ? 'purchaserUserId' THEN "vRec"."purchaserUserId" ELSE t."purchaserUserId" END,
           "costCentreId" = CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE t."costCentreId" END,
           "dealOnSupply" = CASE WHEN "pData" ? 'dealOnSupply' THEN "vRec"."dealOnSupply" ELSE t."dealOnSupply" END,
           "retailPriceDiscountPct" = CASE WHEN "pData" ? 'retailPriceDiscountPct' THEN "vRec"."retailPriceDiscountPct" ELSE t."retailPriceDiscountPct" END,
           "captureMethod" = CASE WHEN "pData" ? 'captureMethod' THEN "vRec"."captureMethod" ELSE t."captureMethod" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "discountAmount" = CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE t."discountAmount" END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "advanceTaxAmount" = CASE WHEN "pData" ? 'advanceTaxAmount' THEN "vRec"."advanceTaxAmount" ELSE t."advanceTaxAmount" END,
           "totalAmount" = CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE t."totalAmount" END,
           "whtAmount" = CASE WHEN "pData" ? 'whtAmount' THEN "vRec"."whtAmount" ELSE t."whtAmount" END,
           "netPayableAmount" = CASE WHEN "pData" ? 'netPayableAmount' THEN "vRec"."netPayableAmount" ELSE t."netPayableAmount" END,
           "payMode" = CASE WHEN "pData" ? 'payMode' THEN "vRec"."payMode" ELSE t."payMode" END,
           "bankAccountId" = CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE t."bankAccountId" END,
           "cashAccountId" = CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE t."cashAccountId" END,
           "chequeNo" = CASE WHEN "pData" ? 'chequeNo' THEN "vRec"."chequeNo" ELSE t."chequeNo" END,
           "chequeId" = CASE WHEN "pData" ? 'chequeId' THEN "vRec"."chequeId" ELSE t."chequeId" END,
           "paidNowAmount" = CASE WHEN "pData" ? 'paidNowAmount' THEN "vRec"."paidNowAmount" ELSE t."paidNowAmount" END,
           "matchStatus" = CASE WHEN "pData" ? 'matchStatus' THEN "vRec"."matchStatus" ELSE t."matchStatus" END,
           "matchVariancePct" = CASE WHEN "pData" ? 'matchVariancePct' THEN "vRec"."matchVariancePct" ELSE t."matchVariancePct" END,
           "isDisputed" = CASE WHEN "pData" ? 'isDisputed' THEN "vRec"."isDisputed" ELSE t."isDisputed" END,
           "disputeNote" = CASE WHEN "pData" ? 'disputeNote' THEN "vRec"."disputeNote" ELSE t."disputeNote" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END,
           "projectId" = CASE WHEN "pData" ? 'projectId' THEN "vRec"."projectId" ELSE t."projectId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Purchases"."VendorBills" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'VendorBills %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'VendorBills % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Purchases"."VendorBillLines"
     WHERE "tenantId" = "vTenant" AND "billId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1VendorBillLines" := jsonb_populate_record(NULL::"Purchases"."VendorBillLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1VendorBillLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Purchases"."VendorBillLines" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1VendorBillLines"."itemId" ELSE t."itemId" END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1VendorBillLines".description ELSE t.description END,
               "accountId" = CASE WHEN "vE1" ? 'accountId' THEN "vC1VendorBillLines"."accountId" ELSE t."accountId" END,
               "purchaseOrderLineId" = CASE WHEN "vE1" ? 'purchaseOrderLineId' THEN "vC1VendorBillLines"."purchaseOrderLineId" ELSE t."purchaseOrderLineId" END,
               "grnLineId" = CASE WHEN "vE1" ? 'grnLineId' THEN "vC1VendorBillLines"."grnLineId" ELSE t."grnLineId" END,
               upc = CASE WHEN "vE1" ? 'upc' THEN "vC1VendorBillLines".upc ELSE t.upc END,
               "qtyCtn" = CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1VendorBillLines"."qtyCtn" ELSE t."qtyCtn" END,
               "qtyLoose" = CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1VendorBillLines"."qtyLoose" ELSE t."qtyLoose" END,
               "baseQty" = CASE WHEN "vE1" ? 'baseQty' THEN "vC1VendorBillLines"."baseQty" ELSE t."baseQty" END,
               "bonusQty" = CASE WHEN "vE1" ? 'bonusQty' THEN "vC1VendorBillLines"."bonusQty" ELSE t."bonusQty" END,
               "breakageQty" = CASE WHEN "vE1" ? 'breakageQty' THEN "vC1VendorBillLines"."breakageQty" ELSE t."breakageQty" END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1VendorBillLines".rate ELSE t.rate END,
               "salePrice" = CASE WHEN "vE1" ? 'salePrice' THEN "vC1VendorBillLines"."salePrice" ELSE t."salePrice" END,
               "updateItemSalePrice" = CASE WHEN "vE1" ? 'updateItemSalePrice' THEN "vC1VendorBillLines"."updateItemSalePrice" ELSE t."updateItemSalePrice" END,
               "discountPct" = CASE WHEN "vE1" ? 'discountPct' THEN "vC1VendorBillLines"."discountPct" ELSE t."discountPct" END,
               "grossAmount" = CASE WHEN "vE1" ? 'grossAmount' THEN "vC1VendorBillLines"."grossAmount" ELSE t."grossAmount" END,
               "discountAmount" = CASE WHEN "vE1" ? 'discountAmount' THEN "vC1VendorBillLines"."discountAmount" ELSE t."discountAmount" END,
               "netAmount" = CASE WHEN "vE1" ? 'netAmount' THEN "vC1VendorBillLines"."netAmount" ELSE t."netAmount" END,
               "taxCodeId" = CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1VendorBillLines"."taxCodeId" ELSE t."taxCodeId" END,
               "taxRate" = CASE WHEN "vE1" ? 'taxRate' THEN "vC1VendorBillLines"."taxRate" ELSE t."taxRate" END,
               "taxAmount" = CASE WHEN "vE1" ? 'taxAmount' THEN "vC1VendorBillLines"."taxAmount" ELSE t."taxAmount" END,
               "totalAmount" = CASE WHEN "vE1" ? 'totalAmount' THEN "vC1VendorBillLines"."totalAmount" ELSE t."totalAmount" END,
               "whtSection" = CASE WHEN "vE1" ? 'whtSection' THEN "vC1VendorBillLines"."whtSection" ELSE t."whtSection" END,
               "whtRate" = CASE WHEN "vE1" ? 'whtRate' THEN "vC1VendorBillLines"."whtRate" ELSE t."whtRate" END,
               "whtAmount" = CASE WHEN "vE1" ? 'whtAmount' THEN "vC1VendorBillLines"."whtAmount" ELSE t."whtAmount" END,
               "batchId" = CASE WHEN "vE1" ? 'batchId' THEN "vC1VendorBillLines"."batchId" ELSE t."batchId" END,
               "batchNo" = CASE WHEN "vE1" ? 'batchNo' THEN "vC1VendorBillLines"."batchNo" ELSE t."batchNo" END,
               "expiryDate" = CASE WHEN "vE1" ? 'expiryDate' THEN "vC1VendorBillLines"."expiryDate" ELSE t."expiryDate" END,
               "costCentreId" = CASE WHEN "vE1" ? 'costCentreId' THEN "vC1VendorBillLines"."costCentreId" ELSE t."costCentreId" END,
               "projectId" = CASE WHEN "vE1" ? 'projectId' THEN "vC1VendorBillLines"."projectId" ELSE t."projectId" END,
               "lineNo" = "vC1VendorBillLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."billId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'VendorBillLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Purchases"."VendorBillLines" ("billId", "tenantId", "lineNo", "itemId", description, "accountId", "purchaseOrderLineId", "grnLineId", upc, "qtyCtn", "qtyLoose", "baseQty", "bonusQty", "breakageQty", rate, "salePrice", "updateItemSalePrice", "discountPct", "grossAmount", "discountAmount", "netAmount", "taxCodeId", "taxRate", "taxAmount", "totalAmount", "whtSection", "whtRate", "whtAmount", "batchId", "batchNo", "expiryDate", "costCentreId", "projectId")
        VALUES ("vRet", "vTenant", "vC1VendorBillLines"."lineNo", CASE WHEN "vE1" ? 'itemId' THEN "vC1VendorBillLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1VendorBillLines".description ELSE NULL END, CASE WHEN "vE1" ? 'accountId' THEN "vC1VendorBillLines"."accountId" ELSE NULL END, CASE WHEN "vE1" ? 'purchaseOrderLineId' THEN "vC1VendorBillLines"."purchaseOrderLineId" ELSE NULL END, CASE WHEN "vE1" ? 'grnLineId' THEN "vC1VendorBillLines"."grnLineId" ELSE NULL END, CASE WHEN "vE1" ? 'upc' THEN "vC1VendorBillLines".upc ELSE NULL END, CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1VendorBillLines"."qtyCtn" ELSE 0 END, CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1VendorBillLines"."qtyLoose" ELSE 0 END, CASE WHEN "vE1" ? 'baseQty' THEN "vC1VendorBillLines"."baseQty" ELSE NULL END, CASE WHEN "vE1" ? 'bonusQty' THEN "vC1VendorBillLines"."bonusQty" ELSE 0 END, CASE WHEN "vE1" ? 'breakageQty' THEN "vC1VendorBillLines"."breakageQty" ELSE 0 END, CASE WHEN "vE1" ? 'rate' THEN "vC1VendorBillLines".rate ELSE NULL END, CASE WHEN "vE1" ? 'salePrice' THEN "vC1VendorBillLines"."salePrice" ELSE NULL END, CASE WHEN "vE1" ? 'updateItemSalePrice' THEN "vC1VendorBillLines"."updateItemSalePrice" ELSE FALSE END, CASE WHEN "vE1" ? 'discountPct' THEN "vC1VendorBillLines"."discountPct" ELSE 0 END, CASE WHEN "vE1" ? 'grossAmount' THEN "vC1VendorBillLines"."grossAmount" ELSE NULL END, CASE WHEN "vE1" ? 'discountAmount' THEN "vC1VendorBillLines"."discountAmount" ELSE 0 END, CASE WHEN "vE1" ? 'netAmount' THEN "vC1VendorBillLines"."netAmount" ELSE NULL END, CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1VendorBillLines"."taxCodeId" ELSE NULL END, CASE WHEN "vE1" ? 'taxRate' THEN "vC1VendorBillLines"."taxRate" ELSE 0 END, CASE WHEN "vE1" ? 'taxAmount' THEN "vC1VendorBillLines"."taxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'totalAmount' THEN "vC1VendorBillLines"."totalAmount" ELSE NULL END, CASE WHEN "vE1" ? 'whtSection' THEN "vC1VendorBillLines"."whtSection" ELSE NULL END, CASE WHEN "vE1" ? 'whtRate' THEN "vC1VendorBillLines"."whtRate" ELSE 0 END, CASE WHEN "vE1" ? 'whtAmount' THEN "vC1VendorBillLines"."whtAmount" ELSE 0 END, CASE WHEN "vE1" ? 'batchId' THEN "vC1VendorBillLines"."batchId" ELSE NULL END, CASE WHEN "vE1" ? 'batchNo' THEN "vC1VendorBillLines"."batchNo" ELSE NULL END, CASE WHEN "vE1" ? 'expiryDate' THEN "vC1VendorBillLines"."expiryDate" ELSE NULL END, CASE WHEN "vE1" ? 'costCentreId' THEN "vC1VendorBillLines"."costCentreId" ELSE NULL END, CASE WHEN "vE1" ? 'projectId' THEN "vC1VendorBillLines"."projectId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Purchases"."vendorBillAddUpdate"(jsonb) IS 'Save (insert or update) one VendorBills record with its lines.';

-- VendorBills: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Purchases"."getVendorBillInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('channelLabel', "Lookups"."getLookupLabel"('VendorBillChannel', t.channel) ->> 'label', 'channelTone', "Lookups"."getLookupLabel"('VendorBillChannel', t.channel) ->> 'tone', 'captureMethodLabel', "Lookups"."getLookupLabel"('CaptureMethod', t."captureMethod") ->> 'label', 'captureMethodTone', "Lookups"."getLookupLabel"('CaptureMethod', t."captureMethod") ->> 'tone', 'payModeLabel', "Lookups"."getLookupLabel"('VendorBillPayMode', t."payMode") ->> 'label', 'payModeTone', "Lookups"."getLookupLabel"('VendorBillPayMode', t."payMode") ->> 'tone', 'matchStatusLabel', "Lookups"."getLookupLabel"('VendorBillMatchStatus', t."matchStatus") ->> 'label', 'matchStatusTone', "Lookups"."getLookupLabel"('VendorBillMatchStatus', t."matchStatus") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('VendorBillStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('VendorBillStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Purchases"."VendorBillLines" c1 WHERE c1."billId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Purchases"."VendorBills" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Purchases"."getVendorBillInfo"(uuid) IS 'Read one VendorBills record (getter for its screens).';

-- VendorBills: Approve (status -> APPROVED); allowed from DRAFT
CREATE OR REPLACE FUNCTION "Purchases"."vendorBillApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Purchases"."VendorBills";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."VendorBills" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VendorBills % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'VendorBills %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'VendorBills: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."vendorBillApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."vendorBillApproveEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."VendorBills" t SET status = 'APPROVED', "approvedAt" = now(), "approvedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- VendorBills: Post (status -> POSTED); allowed from DRAFT, APPROVED
CREATE OR REPLACE FUNCTION "Purchases"."vendorBillPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Purchases"."VendorBills";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."VendorBills" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VendorBills % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'APPROVED') THEN
    RAISE EXCEPTION 'VendorBills %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."vendorBillPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."vendorBillPostEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."VendorBills" t SET status = 'POSTED', "postedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- VendorBills: Void (status -> VOID); allowed from DRAFT, AWAITING_APPROVAL, APPROVED, POSTED, PARTIALLY_PAID, PAID
CREATE OR REPLACE FUNCTION "Purchases"."vendorBillVoid"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Purchases"."VendorBills";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."VendorBills" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VendorBills % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'VOID' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'POSTED', 'PARTIALLY_PAID', 'PAID') THEN
    RAISE EXCEPTION 'VendorBills %: cannot void from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."vendorBillVoidEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."vendorBillVoidEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."VendorBills" t SET status = 'VOID', "voidedAt" = now(), "voidReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- DebitNotes: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Purchases"."debitNoteAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Purchases"."DebitNotes";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1DebitNoteLines" "Purchases"."DebitNoteLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Purchases"."DebitNotes", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('DN', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Purchases"."DebitNotes" ("tenantId", "docNo", "docDate", "vendorId", "branchId", "billId", reason, "reasonNote", "warehouseId", settlement, "netAmount", "taxAmount", "totalAmount", "whtAmount", "emailedAt", remarks, "purchaseReturnId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'billId' THEN "vRec"."billId" ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'reasonNote' THEN "vRec"."reasonNote" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'settlement' THEN "vRec".settlement ELSE 'ADJUST_AGAINST_BILL' END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE 0 END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE 0 END, CASE WHEN "pData" ? 'whtAmount' THEN "vRec"."whtAmount" ELSE 0 END, CASE WHEN "pData" ? 'emailedAt' THEN "vRec"."emailedAt" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'purchaseReturnId' THEN "vRec"."purchaseReturnId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Purchases"."DebitNotes" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'DebitNotes: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Purchases"."DebitNotes" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "vendorId" = CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE t."vendorId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "billId" = CASE WHEN "pData" ? 'billId' THEN "vRec"."billId" ELSE t."billId" END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           "reasonNote" = CASE WHEN "pData" ? 'reasonNote' THEN "vRec"."reasonNote" ELSE t."reasonNote" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           settlement = CASE WHEN "pData" ? 'settlement' THEN "vRec".settlement ELSE t.settlement END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "totalAmount" = CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE t."totalAmount" END,
           "whtAmount" = CASE WHEN "pData" ? 'whtAmount' THEN "vRec"."whtAmount" ELSE t."whtAmount" END,
           "emailedAt" = CASE WHEN "pData" ? 'emailedAt' THEN "vRec"."emailedAt" ELSE t."emailedAt" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END,
           "purchaseReturnId" = CASE WHEN "pData" ? 'purchaseReturnId' THEN "vRec"."purchaseReturnId" ELSE t."purchaseReturnId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Purchases"."DebitNotes" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'DebitNotes %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'DebitNotes % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Purchases"."DebitNoteLines"
     WHERE "tenantId" = "vTenant" AND "debitNoteId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1DebitNoteLines" := jsonb_populate_record(NULL::"Purchases"."DebitNoteLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1DebitNoteLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Purchases"."DebitNoteLines" t
           SET "billLineId" = CASE WHEN "vE1" ? 'billLineId' THEN "vC1DebitNoteLines"."billLineId" ELSE t."billLineId" END,
               "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1DebitNoteLines"."itemId" ELSE t."itemId" END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1DebitNoteLines".description ELSE t.description END,
               "billedQty" = CASE WHEN "vE1" ? 'billedQty' THEN "vC1DebitNoteLines"."billedQty" ELSE t."billedQty" END,
               "returnQty" = CASE WHEN "vE1" ? 'returnQty' THEN "vC1DebitNoteLines"."returnQty" ELSE t."returnQty" END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1DebitNoteLines".rate ELSE t.rate END,
               "netAmount" = CASE WHEN "vE1" ? 'netAmount' THEN "vC1DebitNoteLines"."netAmount" ELSE t."netAmount" END,
               "taxCodeId" = CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1DebitNoteLines"."taxCodeId" ELSE t."taxCodeId" END,
               "taxRate" = CASE WHEN "vE1" ? 'taxRate' THEN "vC1DebitNoteLines"."taxRate" ELSE t."taxRate" END,
               "taxAmount" = CASE WHEN "vE1" ? 'taxAmount' THEN "vC1DebitNoteLines"."taxAmount" ELSE t."taxAmount" END,
               "totalAmount" = CASE WHEN "vE1" ? 'totalAmount' THEN "vC1DebitNoteLines"."totalAmount" ELSE t."totalAmount" END,
               "batchId" = CASE WHEN "vE1" ? 'batchId' THEN "vC1DebitNoteLines"."batchId" ELSE t."batchId" END,
               "lineNo" = "vC1DebitNoteLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."debitNoteId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'DebitNoteLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Purchases"."DebitNoteLines" ("debitNoteId", "tenantId", "lineNo", "billLineId", "itemId", description, "billedQty", "returnQty", rate, "netAmount", "taxCodeId", "taxRate", "taxAmount", "totalAmount", "batchId")
        VALUES ("vRet", "vTenant", "vC1DebitNoteLines"."lineNo", CASE WHEN "vE1" ? 'billLineId' THEN "vC1DebitNoteLines"."billLineId" ELSE NULL END, CASE WHEN "vE1" ? 'itemId' THEN "vC1DebitNoteLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1DebitNoteLines".description ELSE NULL END, CASE WHEN "vE1" ? 'billedQty' THEN "vC1DebitNoteLines"."billedQty" ELSE NULL END, CASE WHEN "vE1" ? 'returnQty' THEN "vC1DebitNoteLines"."returnQty" ELSE 0 END, CASE WHEN "vE1" ? 'rate' THEN "vC1DebitNoteLines".rate ELSE 0 END, CASE WHEN "vE1" ? 'netAmount' THEN "vC1DebitNoteLines"."netAmount" ELSE NULL END, CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1DebitNoteLines"."taxCodeId" ELSE NULL END, CASE WHEN "vE1" ? 'taxRate' THEN "vC1DebitNoteLines"."taxRate" ELSE 0 END, CASE WHEN "vE1" ? 'taxAmount' THEN "vC1DebitNoteLines"."taxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'totalAmount' THEN "vC1DebitNoteLines"."totalAmount" ELSE NULL END, CASE WHEN "vE1" ? 'batchId' THEN "vC1DebitNoteLines"."batchId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Purchases"."debitNoteAddUpdate"(jsonb) IS 'Save (insert or update) one DebitNotes record with its lines.';

-- DebitNotes: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Purchases"."getDebitNoteInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('reasonLabel', "Lookups"."getLookupLabel"('DebitNoteReason', t.reason) ->> 'label', 'reasonTone', "Lookups"."getLookupLabel"('DebitNoteReason', t.reason) ->> 'tone', 'settlementLabel', "Lookups"."getLookupLabel"('DebitNoteSettlement', t.settlement) ->> 'label', 'settlementTone', "Lookups"."getLookupLabel"('DebitNoteSettlement', t.settlement) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('DebitNoteStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('DebitNoteStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Purchases"."DebitNoteLines" c1 WHERE c1."debitNoteId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Purchases"."DebitNotes" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Purchases"."getDebitNoteInfo"(uuid) IS 'Read one DebitNotes record (getter for its screens).';

-- DebitNotes: Void (status -> VOID); allowed from DRAFT, OPEN, APPLIED, REFUNDED
CREATE OR REPLACE FUNCTION "Purchases"."debitNoteVoid"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Purchases"."DebitNotes";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."DebitNotes" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DebitNotes % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'VOID' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'OPEN', 'APPLIED', 'REFUNDED') THEN
    RAISE EXCEPTION 'DebitNotes %: cannot void from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."debitNoteVoidEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."debitNoteVoidEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."DebitNotes" t SET status = 'VOID', "voidedAt" = now(), "voidReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- DebitNotes: Post (status -> OPEN); allowed from DRAFT
CREATE OR REPLACE FUNCTION "Purchases"."debitNotePost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Purchases"."DebitNotes";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."DebitNotes" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DebitNotes % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'OPEN' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'DebitNotes %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."debitNotePostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."debitNotePostEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."DebitNotes" t SET status = 'OPEN' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- VendorPayments: insert (no "id") or update (with "id"); child arrays: allocations
CREATE OR REPLACE FUNCTION "Purchases"."vendorPaymentAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Purchases"."VendorPayments";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1VendorPaymentAllocations" "Purchases"."VendorPaymentAllocations";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Purchases"."VendorPayments", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('PAY', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Purchases"."VendorPayments" ("tenantId", "docNo", "docDate", "vendorId", "branchId", method, "bankAccountId", "cashAccountId", "chequeNo", "chequeId", "isCrossed", "currencyCode", "fxRate", amount, "whtTreatment", "whtSection", "whtRate", "whtAmount", "bankChargesAmount", "paymentRunRef", "clearedOn", remarks, "chequeBookId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'method' THEN "vRec".method ELSE NULL END, CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE NULL END, CASE WHEN "pData" ? 'chequeNo' THEN "vRec"."chequeNo" ELSE NULL END, CASE WHEN "pData" ? 'chequeId' THEN "vRec"."chequeId" ELSE NULL END, CASE WHEN "pData" ? 'isCrossed' THEN "vRec"."isCrossed" ELSE TRUE END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE 1 END, CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE NULL END, CASE WHEN "pData" ? 'whtTreatment' THEN "vRec"."whtTreatment" ELSE 'ALREADY_WITHHELD' END, CASE WHEN "pData" ? 'whtSection' THEN "vRec"."whtSection" ELSE NULL END, CASE WHEN "pData" ? 'whtRate' THEN "vRec"."whtRate" ELSE 0 END, CASE WHEN "pData" ? 'whtAmount' THEN "vRec"."whtAmount" ELSE 0 END, CASE WHEN "pData" ? 'bankChargesAmount' THEN "vRec"."bankChargesAmount" ELSE 0 END, CASE WHEN "pData" ? 'paymentRunRef' THEN "vRec"."paymentRunRef" ELSE NULL END, CASE WHEN "pData" ? 'clearedOn' THEN "vRec"."clearedOn" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'chequeBookId' THEN "vRec"."chequeBookId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Purchases"."VendorPayments" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'VendorPayments: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Purchases"."VendorPayments" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "vendorId" = CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE t."vendorId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           method = CASE WHEN "pData" ? 'method' THEN "vRec".method ELSE t.method END,
           "bankAccountId" = CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE t."bankAccountId" END,
           "cashAccountId" = CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE t."cashAccountId" END,
           "chequeNo" = CASE WHEN "pData" ? 'chequeNo' THEN "vRec"."chequeNo" ELSE t."chequeNo" END,
           "chequeId" = CASE WHEN "pData" ? 'chequeId' THEN "vRec"."chequeId" ELSE t."chequeId" END,
           "isCrossed" = CASE WHEN "pData" ? 'isCrossed' THEN "vRec"."isCrossed" ELSE t."isCrossed" END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "fxRate" = CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE t."fxRate" END,
           amount = CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE t.amount END,
           "whtTreatment" = CASE WHEN "pData" ? 'whtTreatment' THEN "vRec"."whtTreatment" ELSE t."whtTreatment" END,
           "whtSection" = CASE WHEN "pData" ? 'whtSection' THEN "vRec"."whtSection" ELSE t."whtSection" END,
           "whtRate" = CASE WHEN "pData" ? 'whtRate' THEN "vRec"."whtRate" ELSE t."whtRate" END,
           "whtAmount" = CASE WHEN "pData" ? 'whtAmount' THEN "vRec"."whtAmount" ELSE t."whtAmount" END,
           "bankChargesAmount" = CASE WHEN "pData" ? 'bankChargesAmount' THEN "vRec"."bankChargesAmount" ELSE t."bankChargesAmount" END,
           "paymentRunRef" = CASE WHEN "pData" ? 'paymentRunRef' THEN "vRec"."paymentRunRef" ELSE t."paymentRunRef" END,
           "clearedOn" = CASE WHEN "pData" ? 'clearedOn' THEN "vRec"."clearedOn" ELSE t."clearedOn" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END,
           "chequeBookId" = CASE WHEN "pData" ? 'chequeBookId' THEN "vRec"."chequeBookId" ELSE t."chequeBookId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Purchases"."VendorPayments" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'VendorPayments %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'VendorPayments % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'allocations' THEN
    -- allocations: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Purchases"."VendorPaymentAllocations"
     WHERE "tenantId" = "vTenant" AND "vendorPaymentId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'allocations') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'allocations') WITH ORDINALITY t(x, n) LOOP
      "vC1VendorPaymentAllocations" := jsonb_populate_record(NULL::"Purchases"."VendorPaymentAllocations", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Purchases"."VendorPaymentAllocations" t
           SET "debitNoteId" = CASE WHEN "vE1" ? 'debitNoteId' THEN "vC1VendorPaymentAllocations"."debitNoteId" ELSE t."debitNoteId" END,
               "billId" = CASE WHEN "vE1" ? 'billId' THEN "vC1VendorPaymentAllocations"."billId" ELSE t."billId" END,
               "allocationDate" = CASE WHEN "vE1" ? 'allocationDate' THEN "vC1VendorPaymentAllocations"."allocationDate" ELSE t."allocationDate" END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1VendorPaymentAllocations".amount ELSE t.amount END,
               "whtAmount" = CASE WHEN "vE1" ? 'whtAmount' THEN "vC1VendorPaymentAllocations"."whtAmount" ELSE t."whtAmount" END,
               "isReversed" = CASE WHEN "vE1" ? 'isReversed' THEN "vC1VendorPaymentAllocations"."isReversed" ELSE t."isReversed" END,
               "reversedAt" = CASE WHEN "vE1" ? 'reversedAt' THEN "vC1VendorPaymentAllocations"."reversedAt" ELSE t."reversedAt" END,
               remarks = CASE WHEN "vE1" ? 'remarks' THEN "vC1VendorPaymentAllocations".remarks ELSE t.remarks END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."vendorPaymentId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'VendorPaymentAllocations: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Purchases"."VendorPaymentAllocations" ("vendorPaymentId", "tenantId", "debitNoteId", "billId", "allocationDate", amount, "whtAmount", "isReversed", "reversedAt", remarks)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'debitNoteId' THEN "vC1VendorPaymentAllocations"."debitNoteId" ELSE NULL END, CASE WHEN "vE1" ? 'billId' THEN "vC1VendorPaymentAllocations"."billId" ELSE NULL END, CASE WHEN "vE1" ? 'allocationDate' THEN "vC1VendorPaymentAllocations"."allocationDate" ELSE NULL END, CASE WHEN "vE1" ? 'amount' THEN "vC1VendorPaymentAllocations".amount ELSE NULL END, CASE WHEN "vE1" ? 'whtAmount' THEN "vC1VendorPaymentAllocations"."whtAmount" ELSE 0 END, CASE WHEN "vE1" ? 'isReversed' THEN "vC1VendorPaymentAllocations"."isReversed" ELSE FALSE END, CASE WHEN "vE1" ? 'reversedAt' THEN "vC1VendorPaymentAllocations"."reversedAt" ELSE NULL END, CASE WHEN "vE1" ? 'remarks' THEN "vC1VendorPaymentAllocations".remarks ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Purchases"."vendorPaymentAddUpdate"(jsonb) IS 'Save (insert or update) one VendorPayments record with its allocations.';

-- VendorPayments: one record as JSON (camelCase keys), with lookup labels and allocations
CREATE OR REPLACE FUNCTION "Purchases"."getVendorPaymentInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('methodLabel', "Lookups"."getLookupLabel"('VendorPaymentMethod', t.method) ->> 'label', 'methodTone', "Lookups"."getLookupLabel"('VendorPaymentMethod', t.method) ->> 'tone', 'whtTreatmentLabel', "Lookups"."getLookupLabel"('WhtTreatment', t."whtTreatment") ->> 'label', 'whtTreatmentTone', "Lookups"."getLookupLabel"('WhtTreatment', t."whtTreatment") ->> 'tone', 'whtSectionLabel', "Lookups"."getLookupLabel"('WhtSection', t."whtSection") ->> 'label', 'whtSectionTone', "Lookups"."getLookupLabel"('WhtSection', t."whtSection") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('VendorPaymentStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('VendorPaymentStatus', t.status) ->> 'tone') ||
         jsonb_build_object('allocations', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Purchases"."VendorPaymentAllocations" c1 WHERE c1."vendorPaymentId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Purchases"."VendorPayments" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Purchases"."getVendorPaymentInfo"(uuid) IS 'Read one VendorPayments record (getter for its screens).';

-- VendorPayments: Post (status -> POSTED); allowed from DRAFT, PENDING_APPROVAL
CREATE OR REPLACE FUNCTION "Purchases"."vendorPaymentPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Purchases"."VendorPayments";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."VendorPayments" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VendorPayments % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'VendorPayments %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."vendorPaymentPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."vendorPaymentPostEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."VendorPayments" t SET status = 'POSTED', "postedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- VendorPayments: Void (status -> VOID); allowed from DRAFT, PENDING_APPROVAL, POSTED, PRESENTED, CLEARED
CREATE OR REPLACE FUNCTION "Purchases"."vendorPaymentVoid"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Purchases"."VendorPayments";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."VendorPayments" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VendorPayments % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'VOID' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'PRESENTED', 'CLEARED') THEN
    RAISE EXCEPTION 'VendorPayments %: cannot void from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."vendorPaymentVoidEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."vendorPaymentVoidEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."VendorPayments" t SET status = 'VOID', "voidedAt" = now(), "voidReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- PurchaseReturns: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Purchases"."purchaseReturnAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Purchases"."PurchaseReturns";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1PurchaseReturnLines" "Purchases"."PurchaseReturnLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Purchases"."PurchaseReturns", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('PR', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Purchases"."PurchaseReturns" ("tenantId", "docNo", "docDate", "vendorId", "branchId", "warehouseId", "billId", "supplierBillNo", settlement, "cashAccountId", reason, "gatePassNo", transporter, "debitNoteNarration", "grossAmount", "discountAmount", "taxAmount", "totalAmount", remarks)
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'billId' THEN "vRec"."billId" ELSE NULL END, CASE WHEN "pData" ? 'supplierBillNo' THEN "vRec"."supplierBillNo" ELSE NULL END, CASE WHEN "pData" ? 'settlement' THEN "vRec".settlement ELSE 'CREDIT' END, CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'gatePassNo' THEN "vRec"."gatePassNo" ELSE NULL END, CASE WHEN "pData" ? 'transporter' THEN "vRec".transporter ELSE NULL END, CASE WHEN "pData" ? 'debitNoteNarration' THEN "vRec"."debitNoteNarration" ELSE NULL END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE 0 END, CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE 0 END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE 0 END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Purchases"."PurchaseReturns" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'PurchaseReturns: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Purchases"."PurchaseReturns" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "vendorId" = CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE t."vendorId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "billId" = CASE WHEN "pData" ? 'billId' THEN "vRec"."billId" ELSE t."billId" END,
           "supplierBillNo" = CASE WHEN "pData" ? 'supplierBillNo' THEN "vRec"."supplierBillNo" ELSE t."supplierBillNo" END,
           settlement = CASE WHEN "pData" ? 'settlement' THEN "vRec".settlement ELSE t.settlement END,
           "cashAccountId" = CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE t."cashAccountId" END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           "gatePassNo" = CASE WHEN "pData" ? 'gatePassNo' THEN "vRec"."gatePassNo" ELSE t."gatePassNo" END,
           transporter = CASE WHEN "pData" ? 'transporter' THEN "vRec".transporter ELSE t.transporter END,
           "debitNoteNarration" = CASE WHEN "pData" ? 'debitNoteNarration' THEN "vRec"."debitNoteNarration" ELSE t."debitNoteNarration" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "discountAmount" = CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE t."discountAmount" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "totalAmount" = CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE t."totalAmount" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Purchases"."PurchaseReturns" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PurchaseReturns %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PurchaseReturns % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Purchases"."PurchaseReturnLines"
     WHERE "tenantId" = "vTenant" AND "purchaseReturnId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1PurchaseReturnLines" := jsonb_populate_record(NULL::"Purchases"."PurchaseReturnLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1PurchaseReturnLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Purchases"."PurchaseReturnLines" t
           SET "billLineId" = CASE WHEN "vE1" ? 'billLineId' THEN "vC1PurchaseReturnLines"."billLineId" ELSE t."billLineId" END,
               "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1PurchaseReturnLines"."itemId" ELSE t."itemId" END,
               "batchId" = CASE WHEN "vE1" ? 'batchId' THEN "vC1PurchaseReturnLines"."batchId" ELSE t."batchId" END,
               "batchNo" = CASE WHEN "vE1" ? 'batchNo' THEN "vC1PurchaseReturnLines"."batchNo" ELSE t."batchNo" END,
               "expiryDate" = CASE WHEN "vE1" ? 'expiryDate' THEN "vC1PurchaseReturnLines"."expiryDate" ELSE t."expiryDate" END,
               "purchasedQty" = CASE WHEN "vE1" ? 'purchasedQty' THEN "vC1PurchaseReturnLines"."purchasedQty" ELSE t."purchasedQty" END,
               "returnQty" = CASE WHEN "vE1" ? 'returnQty' THEN "vC1PurchaseReturnLines"."returnQty" ELSE t."returnQty" END,
               "bonusQty" = CASE WHEN "vE1" ? 'bonusQty' THEN "vC1PurchaseReturnLines"."bonusQty" ELSE t."bonusQty" END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1PurchaseReturnLines".rate ELSE t.rate END,
               "discountPct" = CASE WHEN "vE1" ? 'discountPct' THEN "vC1PurchaseReturnLines"."discountPct" ELSE t."discountPct" END,
               "grossAmount" = CASE WHEN "vE1" ? 'grossAmount' THEN "vC1PurchaseReturnLines"."grossAmount" ELSE t."grossAmount" END,
               "discountAmount" = CASE WHEN "vE1" ? 'discountAmount' THEN "vC1PurchaseReturnLines"."discountAmount" ELSE t."discountAmount" END,
               "taxCodeId" = CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1PurchaseReturnLines"."taxCodeId" ELSE t."taxCodeId" END,
               "taxRate" = CASE WHEN "vE1" ? 'taxRate' THEN "vC1PurchaseReturnLines"."taxRate" ELSE t."taxRate" END,
               "taxAmount" = CASE WHEN "vE1" ? 'taxAmount' THEN "vC1PurchaseReturnLines"."taxAmount" ELSE t."taxAmount" END,
               "totalAmount" = CASE WHEN "vE1" ? 'totalAmount' THEN "vC1PurchaseReturnLines"."totalAmount" ELSE t."totalAmount" END,
               "lineNo" = "vC1PurchaseReturnLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."purchaseReturnId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PurchaseReturnLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Purchases"."PurchaseReturnLines" ("purchaseReturnId", "tenantId", "lineNo", "billLineId", "itemId", "batchId", "batchNo", "expiryDate", "purchasedQty", "returnQty", "bonusQty", rate, "discountPct", "grossAmount", "discountAmount", "taxCodeId", "taxRate", "taxAmount", "totalAmount")
        VALUES ("vRet", "vTenant", "vC1PurchaseReturnLines"."lineNo", CASE WHEN "vE1" ? 'billLineId' THEN "vC1PurchaseReturnLines"."billLineId" ELSE NULL END, CASE WHEN "vE1" ? 'itemId' THEN "vC1PurchaseReturnLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'batchId' THEN "vC1PurchaseReturnLines"."batchId" ELSE NULL END, CASE WHEN "vE1" ? 'batchNo' THEN "vC1PurchaseReturnLines"."batchNo" ELSE NULL END, CASE WHEN "vE1" ? 'expiryDate' THEN "vC1PurchaseReturnLines"."expiryDate" ELSE NULL END, CASE WHEN "vE1" ? 'purchasedQty' THEN "vC1PurchaseReturnLines"."purchasedQty" ELSE NULL END, CASE WHEN "vE1" ? 'returnQty' THEN "vC1PurchaseReturnLines"."returnQty" ELSE NULL END, CASE WHEN "vE1" ? 'bonusQty' THEN "vC1PurchaseReturnLines"."bonusQty" ELSE 0 END, CASE WHEN "vE1" ? 'rate' THEN "vC1PurchaseReturnLines".rate ELSE NULL END, CASE WHEN "vE1" ? 'discountPct' THEN "vC1PurchaseReturnLines"."discountPct" ELSE 0 END, CASE WHEN "vE1" ? 'grossAmount' THEN "vC1PurchaseReturnLines"."grossAmount" ELSE NULL END, CASE WHEN "vE1" ? 'discountAmount' THEN "vC1PurchaseReturnLines"."discountAmount" ELSE 0 END, CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1PurchaseReturnLines"."taxCodeId" ELSE NULL END, CASE WHEN "vE1" ? 'taxRate' THEN "vC1PurchaseReturnLines"."taxRate" ELSE 0 END, CASE WHEN "vE1" ? 'taxAmount' THEN "vC1PurchaseReturnLines"."taxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'totalAmount' THEN "vC1PurchaseReturnLines"."totalAmount" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Purchases"."purchaseReturnAddUpdate"(jsonb) IS 'Save (insert or update) one PurchaseReturns record with its lines.';

-- PurchaseReturns: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Purchases"."getPurchaseReturnInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('settlementLabel', "Lookups"."getLookupLabel"('PurchaseReturnSettlement', t.settlement) ->> 'label', 'settlementTone', "Lookups"."getLookupLabel"('PurchaseReturnSettlement', t.settlement) ->> 'tone', 'reasonLabel', "Lookups"."getLookupLabel"('PurchaseReturnReason', t.reason) ->> 'label', 'reasonTone', "Lookups"."getLookupLabel"('PurchaseReturnReason', t.reason) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('PurchaseReturnStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('PurchaseReturnStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Purchases"."PurchaseReturnLines" c1 WHERE c1."purchaseReturnId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Purchases"."PurchaseReturns" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Purchases"."getPurchaseReturnInfo"(uuid) IS 'Read one PurchaseReturns record (getter for its screens).';

-- PurchaseReturns: Post (status -> POSTED); allowed from DRAFT
CREATE OR REPLACE FUNCTION "Purchases"."purchaseReturnPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Purchases"."PurchaseReturns";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."PurchaseReturns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PurchaseReturns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'PurchaseReturns %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."purchaseReturnPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."purchaseReturnPostEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."PurchaseReturns" t SET status = 'POSTED', "postedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- PurchaseReturns: Cancel (status -> CANCELLED); allowed from DRAFT, POSTED, REFERENCED
CREATE OR REPLACE FUNCTION "Purchases"."purchaseReturnCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Purchases"."PurchaseReturns";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."PurchaseReturns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PurchaseReturns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'POSTED', 'REFERENCED') THEN
    RAISE EXCEPTION 'PurchaseReturns %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."purchaseReturnCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."purchaseReturnCancelEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."PurchaseReturns" t SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- LandedCostShipments: insert (no "id") or update (with "id"); child arrays: charges, items
CREATE OR REPLACE FUNCTION "Purchases"."landedCostShipmentAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Purchases"."LandedCostShipments";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1LandedCostCharges" "Purchases"."LandedCostCharges";
  "vC1LandedCostItems" "Purchases"."LandedCostItems";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Purchases"."LandedCostShipments", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('LC', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Purchases"."LandedCostShipments" ("tenantId", "docNo", "docDate", "vendorId", "branchId", "grnId", "originCountry", "portOfLoading", "portOfDischarge", "shipmentMode", "containerInfo", "billOfLadingNo", "gdNo", "lcRef", "bankAccountId", "currencyCode", "fxRate", eta, "clearedOn", "allocationBasis", "fobAmount", "capitalisedAmount", "claimableAmount", "landedValueAmount", remarks)
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'grnId' THEN "vRec"."grnId" ELSE NULL END, CASE WHEN "pData" ? 'originCountry' THEN "vRec"."originCountry" ELSE NULL END, CASE WHEN "pData" ? 'portOfLoading' THEN "vRec"."portOfLoading" ELSE NULL END, CASE WHEN "pData" ? 'portOfDischarge' THEN "vRec"."portOfDischarge" ELSE NULL END, CASE WHEN "pData" ? 'shipmentMode' THEN "vRec"."shipmentMode" ELSE NULL END, CASE WHEN "pData" ? 'containerInfo' THEN "vRec"."containerInfo" ELSE NULL END, CASE WHEN "pData" ? 'billOfLadingNo' THEN "vRec"."billOfLadingNo" ELSE NULL END, CASE WHEN "pData" ? 'gdNo' THEN "vRec"."gdNo" ELSE NULL END, CASE WHEN "pData" ? 'lcRef' THEN "vRec"."lcRef" ELSE NULL END, CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'USD' END, CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE NULL END, CASE WHEN "pData" ? 'eta' THEN "vRec".eta ELSE NULL END, CASE WHEN "pData" ? 'clearedOn' THEN "vRec"."clearedOn" ELSE NULL END, CASE WHEN "pData" ? 'allocationBasis' THEN "vRec"."allocationBasis" ELSE 'VALUE' END, CASE WHEN "pData" ? 'fobAmount' THEN "vRec"."fobAmount" ELSE 0 END, CASE WHEN "pData" ? 'capitalisedAmount' THEN "vRec"."capitalisedAmount" ELSE 0 END, CASE WHEN "pData" ? 'claimableAmount' THEN "vRec"."claimableAmount" ELSE 0 END, CASE WHEN "pData" ? 'landedValueAmount' THEN "vRec"."landedValueAmount" ELSE 0 END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Purchases"."LandedCostShipments" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "vendorId" = CASE WHEN "pData" ? 'vendorId' THEN "vRec"."vendorId" ELSE t."vendorId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "grnId" = CASE WHEN "pData" ? 'grnId' THEN "vRec"."grnId" ELSE t."grnId" END,
           "originCountry" = CASE WHEN "pData" ? 'originCountry' THEN "vRec"."originCountry" ELSE t."originCountry" END,
           "portOfLoading" = CASE WHEN "pData" ? 'portOfLoading' THEN "vRec"."portOfLoading" ELSE t."portOfLoading" END,
           "portOfDischarge" = CASE WHEN "pData" ? 'portOfDischarge' THEN "vRec"."portOfDischarge" ELSE t."portOfDischarge" END,
           "shipmentMode" = CASE WHEN "pData" ? 'shipmentMode' THEN "vRec"."shipmentMode" ELSE t."shipmentMode" END,
           "containerInfo" = CASE WHEN "pData" ? 'containerInfo' THEN "vRec"."containerInfo" ELSE t."containerInfo" END,
           "billOfLadingNo" = CASE WHEN "pData" ? 'billOfLadingNo' THEN "vRec"."billOfLadingNo" ELSE t."billOfLadingNo" END,
           "gdNo" = CASE WHEN "pData" ? 'gdNo' THEN "vRec"."gdNo" ELSE t."gdNo" END,
           "lcRef" = CASE WHEN "pData" ? 'lcRef' THEN "vRec"."lcRef" ELSE t."lcRef" END,
           "bankAccountId" = CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE t."bankAccountId" END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "fxRate" = CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE t."fxRate" END,
           eta = CASE WHEN "pData" ? 'eta' THEN "vRec".eta ELSE t.eta END,
           "clearedOn" = CASE WHEN "pData" ? 'clearedOn' THEN "vRec"."clearedOn" ELSE t."clearedOn" END,
           "allocationBasis" = CASE WHEN "pData" ? 'allocationBasis' THEN "vRec"."allocationBasis" ELSE t."allocationBasis" END,
           "fobAmount" = CASE WHEN "pData" ? 'fobAmount' THEN "vRec"."fobAmount" ELSE t."fobAmount" END,
           "capitalisedAmount" = CASE WHEN "pData" ? 'capitalisedAmount' THEN "vRec"."capitalisedAmount" ELSE t."capitalisedAmount" END,
           "claimableAmount" = CASE WHEN "pData" ? 'claimableAmount' THEN "vRec"."claimableAmount" ELSE t."claimableAmount" END,
           "landedValueAmount" = CASE WHEN "pData" ? 'landedValueAmount' THEN "vRec"."landedValueAmount" ELSE t."landedValueAmount" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Purchases"."LandedCostShipments" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'LandedCostShipments %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'LandedCostShipments % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'charges' THEN
    -- charges: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Purchases"."LandedCostCharges"
     WHERE "tenantId" = "vTenant" AND "shipmentId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'charges') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'charges') WITH ORDINALITY t(x, n) LOOP
      "vC1LandedCostCharges" := jsonb_populate_record(NULL::"Purchases"."LandedCostCharges", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1LandedCostCharges"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Purchases"."LandedCostCharges" t
           SET "chargeType" = CASE WHEN "vE1" ? 'chargeType' THEN "vC1LandedCostCharges"."chargeType" ELSE t."chargeType" END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1LandedCostCharges".description ELSE t.description END,
               "payeeVendorId" = CASE WHEN "vE1" ? 'payeeVendorId' THEN "vC1LandedCostCharges"."payeeVendorId" ELSE t."payeeVendorId" END,
               "payeeName" = CASE WHEN "vE1" ? 'payeeName' THEN "vC1LandedCostCharges"."payeeName" ELSE t."payeeName" END,
               "ratePct" = CASE WHEN "vE1" ? 'ratePct' THEN "vC1LandedCostCharges"."ratePct" ELSE t."ratePct" END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1LandedCostCharges".amount ELSE t.amount END,
               "isCapitalised" = CASE WHEN "vE1" ? 'isCapitalised' THEN "vC1LandedCostCharges"."isCapitalised" ELSE t."isCapitalised" END,
               "isClaimable" = CASE WHEN "vE1" ? 'isClaimable' THEN "vC1LandedCostCharges"."isClaimable" ELSE t."isClaimable" END,
               "claimAccountId" = CASE WHEN "vE1" ? 'claimAccountId' THEN "vC1LandedCostCharges"."claimAccountId" ELSE t."claimAccountId" END,
               "billId" = CASE WHEN "vE1" ? 'billId' THEN "vC1LandedCostCharges"."billId" ELSE t."billId" END,
               "lineNo" = "vC1LandedCostCharges"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."shipmentId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'LandedCostCharges: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Purchases"."LandedCostCharges" ("shipmentId", "tenantId", "lineNo", "chargeType", description, "payeeVendorId", "payeeName", "ratePct", amount, "isCapitalised", "isClaimable", "claimAccountId", "billId")
        VALUES ("vRet", "vTenant", "vC1LandedCostCharges"."lineNo", CASE WHEN "vE1" ? 'chargeType' THEN "vC1LandedCostCharges"."chargeType" ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1LandedCostCharges".description ELSE NULL END, CASE WHEN "vE1" ? 'payeeVendorId' THEN "vC1LandedCostCharges"."payeeVendorId" ELSE NULL END, CASE WHEN "vE1" ? 'payeeName' THEN "vC1LandedCostCharges"."payeeName" ELSE NULL END, CASE WHEN "vE1" ? 'ratePct' THEN "vC1LandedCostCharges"."ratePct" ELSE NULL END, CASE WHEN "vE1" ? 'amount' THEN "vC1LandedCostCharges".amount ELSE NULL END, CASE WHEN "vE1" ? 'isCapitalised' THEN "vC1LandedCostCharges"."isCapitalised" ELSE TRUE END, CASE WHEN "vE1" ? 'isClaimable' THEN "vC1LandedCostCharges"."isClaimable" ELSE FALSE END, CASE WHEN "vE1" ? 'claimAccountId' THEN "vC1LandedCostCharges"."claimAccountId" ELSE NULL END, CASE WHEN "vE1" ? 'billId' THEN "vC1LandedCostCharges"."billId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'items' THEN
    -- items: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Purchases"."LandedCostItems"
     WHERE "tenantId" = "vTenant" AND "shipmentId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'items') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'items') WITH ORDINALITY t(x, n) LOOP
      "vC1LandedCostItems" := jsonb_populate_record(NULL::"Purchases"."LandedCostItems", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1LandedCostItems"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Purchases"."LandedCostItems" t
           SET "grnLineId" = CASE WHEN "vE1" ? 'grnLineId' THEN "vC1LandedCostItems"."grnLineId" ELSE t."grnLineId" END,
               "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1LandedCostItems"."itemId" ELSE t."itemId" END,
               qty = CASE WHEN "vE1" ? 'qty' THEN "vC1LandedCostItems".qty ELSE t.qty END,
               "weightKg" = CASE WHEN "vE1" ? 'weightKg' THEN "vC1LandedCostItems"."weightKg" ELSE t."weightKg" END,
               "fobUnitFcy" = CASE WHEN "vE1" ? 'fobUnitFcy' THEN "vC1LandedCostItems"."fobUnitFcy" ELSE t."fobUnitFcy" END,
               "fobAmount" = CASE WHEN "vE1" ? 'fobAmount' THEN "vC1LandedCostItems"."fobAmount" ELSE t."fobAmount" END,
               "sharePct" = CASE WHEN "vE1" ? 'sharePct' THEN "vC1LandedCostItems"."sharePct" ELSE t."sharePct" END,
               "allocatedAmount" = CASE WHEN "vE1" ? 'allocatedAmount' THEN "vC1LandedCostItems"."allocatedAmount" ELSE t."allocatedAmount" END,
               "lineNo" = "vC1LandedCostItems"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."shipmentId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'LandedCostItems: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Purchases"."LandedCostItems" ("shipmentId", "tenantId", "lineNo", "grnLineId", "itemId", qty, "weightKg", "fobUnitFcy", "fobAmount", "sharePct", "allocatedAmount")
        VALUES ("vRet", "vTenant", "vC1LandedCostItems"."lineNo", CASE WHEN "vE1" ? 'grnLineId' THEN "vC1LandedCostItems"."grnLineId" ELSE NULL END, CASE WHEN "vE1" ? 'itemId' THEN "vC1LandedCostItems"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'qty' THEN "vC1LandedCostItems".qty ELSE NULL END, CASE WHEN "vE1" ? 'weightKg' THEN "vC1LandedCostItems"."weightKg" ELSE 0 END, CASE WHEN "vE1" ? 'fobUnitFcy' THEN "vC1LandedCostItems"."fobUnitFcy" ELSE NULL END, CASE WHEN "vE1" ? 'fobAmount' THEN "vC1LandedCostItems"."fobAmount" ELSE NULL END, CASE WHEN "vE1" ? 'sharePct' THEN "vC1LandedCostItems"."sharePct" ELSE 0 END, CASE WHEN "vE1" ? 'allocatedAmount' THEN "vC1LandedCostItems"."allocatedAmount" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Purchases"."landedCostShipmentAddUpdate"(jsonb) IS 'Save (insert or update) one LandedCostShipments record with its charges, items.';

-- LandedCostShipments: one record as JSON (camelCase keys), with lookup labels and charges, items
CREATE OR REPLACE FUNCTION "Purchases"."getLandedCostShipmentInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('shipmentModeLabel', "Lookups"."getLookupLabel"('ShipmentMode', t."shipmentMode") ->> 'label', 'shipmentModeTone', "Lookups"."getLookupLabel"('ShipmentMode', t."shipmentMode") ->> 'tone', 'allocationBasisLabel', "Lookups"."getLookupLabel"('AllocationBasis', t."allocationBasis") ->> 'label', 'allocationBasisTone', "Lookups"."getLookupLabel"('AllocationBasis', t."allocationBasis") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('LandedCostShipmentStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('LandedCostShipmentStatus', t.status) ->> 'tone') ||
         jsonb_build_object('charges', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Purchases"."LandedCostCharges" c1 WHERE c1."shipmentId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'items', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Purchases"."LandedCostItems" c1 WHERE c1."shipmentId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Purchases"."LandedCostShipments" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Purchases"."getLandedCostShipmentInfo"(uuid) IS 'Read one LandedCostShipments record (getter for its screens).';

-- LandedCostShipments: Post (status -> POSTED); allowed from IN_TRANSIT, CLEARED
CREATE OR REPLACE FUNCTION "Purchases"."landedCostShipmentPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Purchases"."LandedCostShipments";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."LandedCostShipments" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LandedCostShipments % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('IN_TRANSIT', 'CLEARED') THEN
    RAISE EXCEPTION 'LandedCostShipments %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."landedCostShipmentPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."landedCostShipmentPostEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."LandedCostShipments" t SET status = 'POSTED', "postedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- LandedCostShipments: Cancel (status -> CANCELLED); allowed from IN_TRANSIT, CLEARED, POSTED
CREATE OR REPLACE FUNCTION "Purchases"."landedCostShipmentCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Purchases"."LandedCostShipments";
BEGIN
  SELECT * INTO "vRow" FROM "Purchases"."LandedCostShipments" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LandedCostShipments % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('IN_TRANSIT', 'CLEARED', 'POSTED') THEN
    RAISE EXCEPTION 'LandedCostShipments %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Purchases"."landedCostShipmentCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Purchases"."landedCostShipmentCancelEntries"') USING "pId";
  END IF;
  UPDATE "Purchases"."LandedCostShipments" t SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;
