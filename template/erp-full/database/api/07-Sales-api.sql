-- =============================================================================
-- Finsoft ERP (Full edition) — API: "Sales"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- PriceLists: insert (no "id") or update (with "id"); child arrays: items, quantityBreaks
CREATE OR REPLACE FUNCTION "Sales"."priceListAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."PriceLists";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1PriceListItems" "Sales"."PriceListItems";
  "vC1PriceListQuantityBreaks" "Sales"."PriceListQuantityBreaks";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."PriceLists", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Sales"."PriceLists" ("tenantId", code, name, "markupPct", "roundingTo", "isDefault", "currencyCode", "validFrom", "validTo", status, remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'markupPct' THEN "vRec"."markupPct" ELSE NULL END, CASE WHEN "pData" ? 'roundingTo' THEN "vRec"."roundingTo" ELSE 1 END, CASE WHEN "pData" ? 'isDefault' THEN "vRec"."isDefault" ELSE FALSE END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'validFrom' THEN "vRec"."validFrom" ELSE NULL END, CASE WHEN "pData" ? 'validTo' THEN "vRec"."validTo" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Sales"."PriceLists" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "markupPct" = CASE WHEN "pData" ? 'markupPct' THEN "vRec"."markupPct" ELSE t."markupPct" END,
           "roundingTo" = CASE WHEN "pData" ? 'roundingTo' THEN "vRec"."roundingTo" ELSE t."roundingTo" END,
           "isDefault" = CASE WHEN "pData" ? 'isDefault' THEN "vRec"."isDefault" ELSE t."isDefault" END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "validFrom" = CASE WHEN "pData" ? 'validFrom' THEN "vRec"."validFrom" ELSE t."validFrom" END,
           "validTo" = CASE WHEN "pData" ? 'validTo' THEN "vRec"."validTo" ELSE t."validTo" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."PriceLists" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PriceLists %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PriceLists % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'items' THEN
    -- items: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."PriceListItems"
     WHERE "tenantId" = "vTenant" AND "priceListId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'items') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'items') WITH ORDINALITY t(x, n) LOOP
      "vC1PriceListItems" := jsonb_populate_record(NULL::"Sales"."PriceListItems", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."PriceListItems" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1PriceListItems"."itemId" ELSE t."itemId" END,
               price = CASE WHEN "vE1" ? 'price' THEN "vC1PriceListItems".price ELSE t.price END,
               "effectiveFrom" = CASE WHEN "vE1" ? 'effectiveFrom' THEN "vC1PriceListItems"."effectiveFrom" ELSE t."effectiveFrom" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."priceListId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PriceListItems: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."PriceListItems" ("priceListId", "tenantId", "itemId", price, "effectiveFrom")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'itemId' THEN "vC1PriceListItems"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'price' THEN "vC1PriceListItems".price ELSE NULL END, CASE WHEN "vE1" ? 'effectiveFrom' THEN "vC1PriceListItems"."effectiveFrom" ELSE CURRENT_DATE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'quantityBreaks' THEN
    -- quantityBreaks: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."PriceListQuantityBreaks"
     WHERE "tenantId" = "vTenant" AND "priceListId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'quantityBreaks') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'quantityBreaks') WITH ORDINALITY t(x, n) LOOP
      "vC1PriceListQuantityBreaks" := jsonb_populate_record(NULL::"Sales"."PriceListQuantityBreaks", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."PriceListQuantityBreaks" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1PriceListQuantityBreaks"."itemId" ELSE t."itemId" END,
               "tierNo" = CASE WHEN "vE1" ? 'tierNo' THEN "vC1PriceListQuantityBreaks"."tierNo" ELSE t."tierNo" END,
               "minQty" = CASE WHEN "vE1" ? 'minQty' THEN "vC1PriceListQuantityBreaks"."minQty" ELSE t."minQty" END,
               "maxQty" = CASE WHEN "vE1" ? 'maxQty' THEN "vC1PriceListQuantityBreaks"."maxQty" ELSE t."maxQty" END,
               "unitPrice" = CASE WHEN "vE1" ? 'unitPrice' THEN "vC1PriceListQuantityBreaks"."unitPrice" ELSE t."unitPrice" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."priceListId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PriceListQuantityBreaks: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."PriceListQuantityBreaks" ("priceListId", "tenantId", "itemId", "tierNo", "minQty", "maxQty", "unitPrice")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'itemId' THEN "vC1PriceListQuantityBreaks"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'tierNo' THEN "vC1PriceListQuantityBreaks"."tierNo" ELSE NULL END, CASE WHEN "vE1" ? 'minQty' THEN "vC1PriceListQuantityBreaks"."minQty" ELSE NULL END, CASE WHEN "vE1" ? 'maxQty' THEN "vC1PriceListQuantityBreaks"."maxQty" ELSE NULL END, CASE WHEN "vE1" ? 'unitPrice' THEN "vC1PriceListQuantityBreaks"."unitPrice" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."priceListAddUpdate"(jsonb) IS 'Save (insert or update) one PriceLists record with its items, quantityBreaks.';

-- PriceLists: one record as JSON (camelCase keys), with lookup labels and items, quantityBreaks
CREATE OR REPLACE FUNCTION "Sales"."getPriceListInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone') ||
         jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Sales"."PriceListItems" c1 WHERE c1."priceListId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'quantityBreaks', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Sales"."PriceListQuantityBreaks" c1 WHERE c1."priceListId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Sales"."PriceLists" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getPriceListInfo"(uuid) IS 'Read one PriceLists record (getter for its screens).';

-- CustomerGroups: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Sales"."customerGroupAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."CustomerGroups";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."CustomerGroups", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Sales"."CustomerGroups" ("tenantId", code, name, "priceListId", "isActive", remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'priceListId' THEN "vRec"."priceListId" ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Sales"."CustomerGroups" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "priceListId" = CASE WHEN "pData" ? 'priceListId' THEN "vRec"."priceListId" ELSE t."priceListId" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."CustomerGroups" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CustomerGroups %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CustomerGroups % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."customerGroupAddUpdate"(jsonb) IS 'Save (insert or update) one CustomerGroups record.';

-- CustomerGroups: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Sales"."getCustomerGroupInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "Sales"."CustomerGroups" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getCustomerGroupInfo"(uuid) IS 'Read one CustomerGroups record (getter for its screens).';

-- Customers: insert (no "id") or update (with "id"); child arrays: addresses, contacts, notes
CREATE OR REPLACE FUNCTION "Sales"."customerAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."Customers";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1CustomerAddresses" "Sales"."CustomerAddresses";
  "vC1CustomerContacts" "Sales"."CustomerContacts";
  "vC1CustomerNotes" "Sales"."CustomerNotes";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."Customers", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'code') OR "vRec".code IS NULL THEN
      "vRec".code := "Company"."getNextDocNo"(CASE WHEN "vRec"."customerChannel" = 'STANDARD' THEN 'CUST' WHEN "vRec"."customerChannel" = 'WHOLESALE' THEN 'SHP' ELSE 'CUST' END, current_date, "vRec"."branchId");
    END IF;
    INSERT INTO "Sales"."Customers" ("tenantId", code, name, "displayName", "customerType", "customerGroupId", "salesRepUserId", "branchId", "customerSince", ntn, cnic, strn, "atlStatus", "isSalesTaxRegistered", "applyFurtherTax", "deductsWht", "whtSection", "whtRate", "isGstExempt", "contactPerson", mobile, phone, email, "billingAddress", area, city, province, "shippingSameAsBilling", "shippingAddress", "creditLimit", "paymentTerms", "creditDays", "receivableAccountId", "priceListId", "openingBalance", "openingBalanceAsOf", "blockOverLimit", "autoReminders", "guarantorName", "guarantorFatherName", "guarantorCnic", "guarantorPhone", "guarantorAddress", status, "holdReason", "onHoldSince", "customerChannel", "priceTier", "priceTierFactor")
    VALUES ("vTenant", "vRec".code, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'displayName' THEN "vRec"."displayName" ELSE NULL END, CASE WHEN "pData" ? 'customerType' THEN "vRec"."customerType" ELSE 'COMPANY' END, CASE WHEN "pData" ? 'customerGroupId' THEN "vRec"."customerGroupId" ELSE NULL END, CASE WHEN "pData" ? 'salesRepUserId' THEN "vRec"."salesRepUserId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'customerSince' THEN "vRec"."customerSince" ELSE NULL END, CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE NULL END, CASE WHEN "pData" ? 'cnic' THEN "vRec".cnic ELSE NULL END, CASE WHEN "pData" ? 'strn' THEN "vRec".strn ELSE NULL END, CASE WHEN "pData" ? 'atlStatus' THEN "vRec"."atlStatus" ELSE 'NOT_ON_ATL' END, CASE WHEN "pData" ? 'isSalesTaxRegistered' THEN "vRec"."isSalesTaxRegistered" ELSE FALSE END, CASE WHEN "pData" ? 'applyFurtherTax' THEN "vRec"."applyFurtherTax" ELSE FALSE END, CASE WHEN "pData" ? 'deductsWht' THEN "vRec"."deductsWht" ELSE FALSE END, CASE WHEN "pData" ? 'whtSection' THEN "vRec"."whtSection" ELSE NULL END, CASE WHEN "pData" ? 'whtRate' THEN "vRec"."whtRate" ELSE NULL END, CASE WHEN "pData" ? 'isGstExempt' THEN "vRec"."isGstExempt" ELSE FALSE END, CASE WHEN "pData" ? 'contactPerson' THEN "vRec"."contactPerson" ELSE NULL END, CASE WHEN "pData" ? 'mobile' THEN "vRec".mobile ELSE NULL END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'billingAddress' THEN "vRec"."billingAddress" ELSE NULL END, CASE WHEN "pData" ? 'area' THEN "vRec".area ELSE NULL END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'province' THEN "vRec".province ELSE NULL END, CASE WHEN "pData" ? 'shippingSameAsBilling' THEN "vRec"."shippingSameAsBilling" ELSE TRUE END, CASE WHEN "pData" ? 'shippingAddress' THEN "vRec"."shippingAddress" ELSE NULL END, CASE WHEN "pData" ? 'creditLimit' THEN "vRec"."creditLimit" ELSE 0 END, CASE WHEN "pData" ? 'paymentTerms' THEN "vRec"."paymentTerms" ELSE 'NET_30' END, CASE WHEN "pData" ? 'creditDays' THEN "vRec"."creditDays" ELSE 30 END, CASE WHEN "pData" ? 'receivableAccountId' THEN "vRec"."receivableAccountId" ELSE NULL END, CASE WHEN "pData" ? 'priceListId' THEN "vRec"."priceListId" ELSE NULL END, CASE WHEN "pData" ? 'openingBalance' THEN "vRec"."openingBalance" ELSE 0 END, CASE WHEN "pData" ? 'openingBalanceAsOf' THEN "vRec"."openingBalanceAsOf" ELSE NULL END, CASE WHEN "pData" ? 'blockOverLimit' THEN "vRec"."blockOverLimit" ELSE TRUE END, CASE WHEN "pData" ? 'autoReminders' THEN "vRec"."autoReminders" ELSE TRUE END, CASE WHEN "pData" ? 'guarantorName' THEN "vRec"."guarantorName" ELSE NULL END, CASE WHEN "pData" ? 'guarantorFatherName' THEN "vRec"."guarantorFatherName" ELSE NULL END, CASE WHEN "pData" ? 'guarantorCnic' THEN "vRec"."guarantorCnic" ELSE NULL END, CASE WHEN "pData" ? 'guarantorPhone' THEN "vRec"."guarantorPhone" ELSE NULL END, CASE WHEN "pData" ? 'guarantorAddress' THEN "vRec"."guarantorAddress" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'holdReason' THEN "vRec"."holdReason" ELSE NULL END, CASE WHEN "pData" ? 'onHoldSince' THEN "vRec"."onHoldSince" ELSE NULL END, CASE WHEN "pData" ? 'customerChannel' THEN "vRec"."customerChannel" ELSE 'STANDARD' END, CASE WHEN "pData" ? 'priceTier' THEN "vRec"."priceTier" ELSE NULL END, CASE WHEN "pData" ? 'priceTierFactor' THEN "vRec"."priceTierFactor" ELSE 1 END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Sales"."Customers" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "displayName" = CASE WHEN "pData" ? 'displayName' THEN "vRec"."displayName" ELSE t."displayName" END,
           "customerType" = CASE WHEN "pData" ? 'customerType' THEN "vRec"."customerType" ELSE t."customerType" END,
           "customerGroupId" = CASE WHEN "pData" ? 'customerGroupId' THEN "vRec"."customerGroupId" ELSE t."customerGroupId" END,
           "salesRepUserId" = CASE WHEN "pData" ? 'salesRepUserId' THEN "vRec"."salesRepUserId" ELSE t."salesRepUserId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "customerSince" = CASE WHEN "pData" ? 'customerSince' THEN "vRec"."customerSince" ELSE t."customerSince" END,
           ntn = CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE t.ntn END,
           cnic = CASE WHEN "pData" ? 'cnic' THEN "vRec".cnic ELSE t.cnic END,
           strn = CASE WHEN "pData" ? 'strn' THEN "vRec".strn ELSE t.strn END,
           "atlStatus" = CASE WHEN "pData" ? 'atlStatus' THEN "vRec"."atlStatus" ELSE t."atlStatus" END,
           "isSalesTaxRegistered" = CASE WHEN "pData" ? 'isSalesTaxRegistered' THEN "vRec"."isSalesTaxRegistered" ELSE t."isSalesTaxRegistered" END,
           "applyFurtherTax" = CASE WHEN "pData" ? 'applyFurtherTax' THEN "vRec"."applyFurtherTax" ELSE t."applyFurtherTax" END,
           "deductsWht" = CASE WHEN "pData" ? 'deductsWht' THEN "vRec"."deductsWht" ELSE t."deductsWht" END,
           "whtSection" = CASE WHEN "pData" ? 'whtSection' THEN "vRec"."whtSection" ELSE t."whtSection" END,
           "whtRate" = CASE WHEN "pData" ? 'whtRate' THEN "vRec"."whtRate" ELSE t."whtRate" END,
           "isGstExempt" = CASE WHEN "pData" ? 'isGstExempt' THEN "vRec"."isGstExempt" ELSE t."isGstExempt" END,
           "contactPerson" = CASE WHEN "pData" ? 'contactPerson' THEN "vRec"."contactPerson" ELSE t."contactPerson" END,
           mobile = CASE WHEN "pData" ? 'mobile' THEN "vRec".mobile ELSE t.mobile END,
           phone = CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE t.phone END,
           email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           "billingAddress" = CASE WHEN "pData" ? 'billingAddress' THEN "vRec"."billingAddress" ELSE t."billingAddress" END,
           area = CASE WHEN "pData" ? 'area' THEN "vRec".area ELSE t.area END,
           city = CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE t.city END,
           province = CASE WHEN "pData" ? 'province' THEN "vRec".province ELSE t.province END,
           "shippingSameAsBilling" = CASE WHEN "pData" ? 'shippingSameAsBilling' THEN "vRec"."shippingSameAsBilling" ELSE t."shippingSameAsBilling" END,
           "shippingAddress" = CASE WHEN "pData" ? 'shippingAddress' THEN "vRec"."shippingAddress" ELSE t."shippingAddress" END,
           "creditLimit" = CASE WHEN "pData" ? 'creditLimit' THEN "vRec"."creditLimit" ELSE t."creditLimit" END,
           "paymentTerms" = CASE WHEN "pData" ? 'paymentTerms' THEN "vRec"."paymentTerms" ELSE t."paymentTerms" END,
           "creditDays" = CASE WHEN "pData" ? 'creditDays' THEN "vRec"."creditDays" ELSE t."creditDays" END,
           "receivableAccountId" = CASE WHEN "pData" ? 'receivableAccountId' THEN "vRec"."receivableAccountId" ELSE t."receivableAccountId" END,
           "priceListId" = CASE WHEN "pData" ? 'priceListId' THEN "vRec"."priceListId" ELSE t."priceListId" END,
           "openingBalance" = CASE WHEN "pData" ? 'openingBalance' THEN "vRec"."openingBalance" ELSE t."openingBalance" END,
           "openingBalanceAsOf" = CASE WHEN "pData" ? 'openingBalanceAsOf' THEN "vRec"."openingBalanceAsOf" ELSE t."openingBalanceAsOf" END,
           "blockOverLimit" = CASE WHEN "pData" ? 'blockOverLimit' THEN "vRec"."blockOverLimit" ELSE t."blockOverLimit" END,
           "autoReminders" = CASE WHEN "pData" ? 'autoReminders' THEN "vRec"."autoReminders" ELSE t."autoReminders" END,
           "guarantorName" = CASE WHEN "pData" ? 'guarantorName' THEN "vRec"."guarantorName" ELSE t."guarantorName" END,
           "guarantorFatherName" = CASE WHEN "pData" ? 'guarantorFatherName' THEN "vRec"."guarantorFatherName" ELSE t."guarantorFatherName" END,
           "guarantorCnic" = CASE WHEN "pData" ? 'guarantorCnic' THEN "vRec"."guarantorCnic" ELSE t."guarantorCnic" END,
           "guarantorPhone" = CASE WHEN "pData" ? 'guarantorPhone' THEN "vRec"."guarantorPhone" ELSE t."guarantorPhone" END,
           "guarantorAddress" = CASE WHEN "pData" ? 'guarantorAddress' THEN "vRec"."guarantorAddress" ELSE t."guarantorAddress" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "holdReason" = CASE WHEN "pData" ? 'holdReason' THEN "vRec"."holdReason" ELSE t."holdReason" END,
           "onHoldSince" = CASE WHEN "pData" ? 'onHoldSince' THEN "vRec"."onHoldSince" ELSE t."onHoldSince" END,
           "customerChannel" = CASE WHEN "pData" ? 'customerChannel' THEN "vRec"."customerChannel" ELSE t."customerChannel" END,
           "priceTier" = CASE WHEN "pData" ? 'priceTier' THEN "vRec"."priceTier" ELSE t."priceTier" END,
           "priceTierFactor" = CASE WHEN "pData" ? 'priceTierFactor' THEN "vRec"."priceTierFactor" ELSE t."priceTierFactor" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."Customers" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Customers %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Customers % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'addresses' THEN
    -- addresses: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."CustomerAddresses"
     WHERE "tenantId" = "vTenant" AND "customerId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'addresses') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'addresses') WITH ORDINALITY t(x, n) LOOP
      "vC1CustomerAddresses" := jsonb_populate_record(NULL::"Sales"."CustomerAddresses", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."CustomerAddresses" t
           SET "addressType" = CASE WHEN "vE1" ? 'addressType' THEN "vC1CustomerAddresses"."addressType" ELSE t."addressType" END,
               label = CASE WHEN "vE1" ? 'label' THEN "vC1CustomerAddresses".label ELSE t.label END,
               "addressLine" = CASE WHEN "vE1" ? 'addressLine' THEN "vC1CustomerAddresses"."addressLine" ELSE t."addressLine" END,
               area = CASE WHEN "vE1" ? 'area' THEN "vC1CustomerAddresses".area ELSE t.area END,
               city = CASE WHEN "vE1" ? 'city' THEN "vC1CustomerAddresses".city ELSE t.city END,
               province = CASE WHEN "vE1" ? 'province' THEN "vC1CustomerAddresses".province ELSE t.province END,
               "contactName" = CASE WHEN "vE1" ? 'contactName' THEN "vC1CustomerAddresses"."contactName" ELSE t."contactName" END,
               "contactPhone" = CASE WHEN "vE1" ? 'contactPhone' THEN "vC1CustomerAddresses"."contactPhone" ELSE t."contactPhone" END,
               "isDefault" = CASE WHEN "vE1" ? 'isDefault' THEN "vC1CustomerAddresses"."isDefault" ELSE t."isDefault" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."customerId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'CustomerAddresses: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."CustomerAddresses" ("customerId", "tenantId", "addressType", label, "addressLine", area, city, province, "contactName", "contactPhone", "isDefault")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'addressType' THEN "vC1CustomerAddresses"."addressType" ELSE 'SHIPPING' END, CASE WHEN "vE1" ? 'label' THEN "vC1CustomerAddresses".label ELSE NULL END, CASE WHEN "vE1" ? 'addressLine' THEN "vC1CustomerAddresses"."addressLine" ELSE NULL END, CASE WHEN "vE1" ? 'area' THEN "vC1CustomerAddresses".area ELSE NULL END, CASE WHEN "vE1" ? 'city' THEN "vC1CustomerAddresses".city ELSE NULL END, CASE WHEN "vE1" ? 'province' THEN "vC1CustomerAddresses".province ELSE NULL END, CASE WHEN "vE1" ? 'contactName' THEN "vC1CustomerAddresses"."contactName" ELSE NULL END, CASE WHEN "vE1" ? 'contactPhone' THEN "vC1CustomerAddresses"."contactPhone" ELSE NULL END, CASE WHEN "vE1" ? 'isDefault' THEN "vC1CustomerAddresses"."isDefault" ELSE FALSE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'contacts' THEN
    -- contacts: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."CustomerContacts"
     WHERE "tenantId" = "vTenant" AND "customerId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'contacts') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'contacts') WITH ORDINALITY t(x, n) LOOP
      "vC1CustomerContacts" := jsonb_populate_record(NULL::"Sales"."CustomerContacts", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."CustomerContacts" t
           SET "fullName" = CASE WHEN "vE1" ? 'fullName' THEN "vC1CustomerContacts"."fullName" ELSE t."fullName" END,
               designation = CASE WHEN "vE1" ? 'designation' THEN "vC1CustomerContacts".designation ELSE t.designation END,
               "isPrimary" = CASE WHEN "vE1" ? 'isPrimary' THEN "vC1CustomerContacts"."isPrimary" ELSE t."isPrimary" END,
               mobile = CASE WHEN "vE1" ? 'mobile' THEN "vC1CustomerContacts".mobile ELSE t.mobile END,
               phone = CASE WHEN "vE1" ? 'phone' THEN "vC1CustomerContacts".phone ELSE t.phone END,
               email = CASE WHEN "vE1" ? 'email' THEN "vC1CustomerContacts".email ELSE t.email END,
               "receivesInvoices" = CASE WHEN "vE1" ? 'receivesInvoices' THEN "vC1CustomerContacts"."receivesInvoices" ELSE t."receivesInvoices" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."customerId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'CustomerContacts: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."CustomerContacts" ("customerId", "tenantId", "fullName", designation, "isPrimary", mobile, phone, email, "receivesInvoices")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'fullName' THEN "vC1CustomerContacts"."fullName" ELSE NULL END, CASE WHEN "vE1" ? 'designation' THEN "vC1CustomerContacts".designation ELSE NULL END, CASE WHEN "vE1" ? 'isPrimary' THEN "vC1CustomerContacts"."isPrimary" ELSE FALSE END, CASE WHEN "vE1" ? 'mobile' THEN "vC1CustomerContacts".mobile ELSE NULL END, CASE WHEN "vE1" ? 'phone' THEN "vC1CustomerContacts".phone ELSE NULL END, CASE WHEN "vE1" ? 'email' THEN "vC1CustomerContacts".email ELSE NULL END, CASE WHEN "vE1" ? 'receivesInvoices' THEN "vC1CustomerContacts"."receivesInvoices" ELSE FALSE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'notes' THEN
    -- notes: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."CustomerNotes"
     WHERE "tenantId" = "vTenant" AND "customerId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'notes') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'notes') WITH ORDINALITY t(x, n) LOOP
      "vC1CustomerNotes" := jsonb_populate_record(NULL::"Sales"."CustomerNotes", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."CustomerNotes" t
           SET "authorUserId" = CASE WHEN "vE1" ? 'authorUserId' THEN "vC1CustomerNotes"."authorUserId" ELSE t."authorUserId" END,
               note = CASE WHEN "vE1" ? 'note' THEN "vC1CustomerNotes".note ELSE t.note END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."customerId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'CustomerNotes: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."CustomerNotes" ("customerId", "tenantId", "authorUserId", note)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'authorUserId' THEN "vC1CustomerNotes"."authorUserId" ELSE NULL END, CASE WHEN "vE1" ? 'note' THEN "vC1CustomerNotes".note ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."customerAddUpdate"(jsonb) IS 'Save (insert or update) one Customers record with its addresses, contacts, notes.';

-- Customers: one record as JSON (camelCase keys), with lookup labels and addresses, contacts, notes
CREATE OR REPLACE FUNCTION "Sales"."getCustomerInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('customerTypeLabel', "Lookups"."getLookupLabel"('CustomerType', t."customerType") ->> 'label', 'customerTypeTone', "Lookups"."getLookupLabel"('CustomerType', t."customerType") ->> 'tone', 'atlStatusLabel', "Lookups"."getLookupLabel"('CustomerAtlStatus', t."atlStatus") ->> 'label', 'atlStatusTone', "Lookups"."getLookupLabel"('CustomerAtlStatus', t."atlStatus") ->> 'tone', 'provinceLabel', "Lookups"."getLookupLabel"('Province', t.province) ->> 'label', 'provinceTone', "Lookups"."getLookupLabel"('Province', t.province) ->> 'tone', 'paymentTermsLabel', "Lookups"."getLookupLabel"('CustomerPaymentTerms', t."paymentTerms") ->> 'label', 'paymentTermsTone', "Lookups"."getLookupLabel"('CustomerPaymentTerms', t."paymentTerms") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('CustomerStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('CustomerStatus', t.status) ->> 'tone', 'holdReasonLabel', "Lookups"."getLookupLabel"('CustomerHoldReason', t."holdReason") ->> 'label', 'holdReasonTone', "Lookups"."getLookupLabel"('CustomerHoldReason', t."holdReason") ->> 'tone', 'customerChannelLabel', "Lookups"."getLookupLabel"('CustomerChannel', t."customerChannel") ->> 'label', 'customerChannelTone', "Lookups"."getLookupLabel"('CustomerChannel', t."customerChannel") ->> 'tone', 'priceTierLabel', "Lookups"."getLookupLabel"('PriceTier', t."priceTier") ->> 'label', 'priceTierTone', "Lookups"."getLookupLabel"('PriceTier', t."priceTier") ->> 'tone') ||
         jsonb_build_object('addresses', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Sales"."CustomerAddresses" c1 WHERE c1."customerId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'contacts', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Sales"."CustomerContacts" c1 WHERE c1."customerId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'notes', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Sales"."CustomerNotes" c1 WHERE c1."customerId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Sales"."Customers" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getCustomerInfo"(uuid) IS 'Read one Customers record (getter for its screens).';

-- Quotations: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Sales"."quotationAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."Quotations";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1QuotationLines" "Sales"."QuotationLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."Quotations", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('QT', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Sales"."Quotations" ("tenantId", "docNo", "docDate", "validTill", "customerId", subject, "salesRepUserId", "branchId", "priceListId", "revisionOfId", "currencyCode", "fxRate", "grossAmount", "discountAmount", "taxAmount", "netAmount", "acceptedAt", remarks, terms)
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'validTill' THEN "vRec"."validTill" ELSE NULL END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'subject' THEN "vRec".subject ELSE NULL END, CASE WHEN "pData" ? 'salesRepUserId' THEN "vRec"."salesRepUserId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'priceListId' THEN "vRec"."priceListId" ELSE NULL END, CASE WHEN "pData" ? 'revisionOfId' THEN "vRec"."revisionOfId" ELSE NULL END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE 1 END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE 0 END, CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE 0 END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE 0 END, CASE WHEN "pData" ? 'acceptedAt' THEN "vRec"."acceptedAt" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'terms' THEN "vRec".terms ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Sales"."Quotations" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'Quotations: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Sales"."Quotations" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "validTill" = CASE WHEN "pData" ? 'validTill' THEN "vRec"."validTill" ELSE t."validTill" END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           subject = CASE WHEN "pData" ? 'subject' THEN "vRec".subject ELSE t.subject END,
           "salesRepUserId" = CASE WHEN "pData" ? 'salesRepUserId' THEN "vRec"."salesRepUserId" ELSE t."salesRepUserId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "priceListId" = CASE WHEN "pData" ? 'priceListId' THEN "vRec"."priceListId" ELSE t."priceListId" END,
           "revisionOfId" = CASE WHEN "pData" ? 'revisionOfId' THEN "vRec"."revisionOfId" ELSE t."revisionOfId" END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "fxRate" = CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE t."fxRate" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "discountAmount" = CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE t."discountAmount" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "acceptedAt" = CASE WHEN "pData" ? 'acceptedAt' THEN "vRec"."acceptedAt" ELSE t."acceptedAt" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END,
           terms = CASE WHEN "pData" ? 'terms' THEN "vRec".terms ELSE t.terms END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."Quotations" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Quotations %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Quotations % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."QuotationLines"
     WHERE "tenantId" = "vTenant" AND "quotationId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1QuotationLines" := jsonb_populate_record(NULL::"Sales"."QuotationLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1QuotationLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."QuotationLines" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1QuotationLines"."itemId" ELSE t."itemId" END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1QuotationLines".description ELSE t.description END,
               "qtyCtn" = CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1QuotationLines"."qtyCtn" ELSE t."qtyCtn" END,
               "qtyLoose" = CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1QuotationLines"."qtyLoose" ELSE t."qtyLoose" END,
               "ctnFactor" = CASE WHEN "vE1" ? 'ctnFactor' THEN "vC1QuotationLines"."ctnFactor" ELSE t."ctnFactor" END,
               "baseQty" = CASE WHEN "vE1" ? 'baseQty' THEN "vC1QuotationLines"."baseQty" ELSE t."baseQty" END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1QuotationLines".rate ELSE t.rate END,
               "grossAmount" = CASE WHEN "vE1" ? 'grossAmount' THEN "vC1QuotationLines"."grossAmount" ELSE t."grossAmount" END,
               "discountPct" = CASE WHEN "vE1" ? 'discountPct' THEN "vC1QuotationLines"."discountPct" ELSE t."discountPct" END,
               "discountAmount" = CASE WHEN "vE1" ? 'discountAmount' THEN "vC1QuotationLines"."discountAmount" ELSE t."discountAmount" END,
               "taxableAmount" = CASE WHEN "vE1" ? 'taxableAmount' THEN "vC1QuotationLines"."taxableAmount" ELSE t."taxableAmount" END,
               "taxCodeId" = CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1QuotationLines"."taxCodeId" ELSE t."taxCodeId" END,
               "taxRate" = CASE WHEN "vE1" ? 'taxRate' THEN "vC1QuotationLines"."taxRate" ELSE t."taxRate" END,
               "taxAmount" = CASE WHEN "vE1" ? 'taxAmount' THEN "vC1QuotationLines"."taxAmount" ELSE t."taxAmount" END,
               "totalAmount" = CASE WHEN "vE1" ? 'totalAmount' THEN "vC1QuotationLines"."totalAmount" ELSE t."totalAmount" END,
               "lineNo" = "vC1QuotationLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."quotationId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'QuotationLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."QuotationLines" ("quotationId", "tenantId", "lineNo", "itemId", description, "qtyCtn", "qtyLoose", "ctnFactor", "baseQty", rate, "grossAmount", "discountPct", "discountAmount", "taxableAmount", "taxCodeId", "taxRate", "taxAmount", "totalAmount")
        VALUES ("vRet", "vTenant", "vC1QuotationLines"."lineNo", CASE WHEN "vE1" ? 'itemId' THEN "vC1QuotationLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1QuotationLines".description ELSE NULL END, CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1QuotationLines"."qtyCtn" ELSE 0 END, CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1QuotationLines"."qtyLoose" ELSE 0 END, CASE WHEN "vE1" ? 'ctnFactor' THEN "vC1QuotationLines"."ctnFactor" ELSE 1 END, CASE WHEN "vE1" ? 'baseQty' THEN "vC1QuotationLines"."baseQty" ELSE NULL END, CASE WHEN "vE1" ? 'rate' THEN "vC1QuotationLines".rate ELSE NULL END, CASE WHEN "vE1" ? 'grossAmount' THEN "vC1QuotationLines"."grossAmount" ELSE NULL END, CASE WHEN "vE1" ? 'discountPct' THEN "vC1QuotationLines"."discountPct" ELSE 0 END, CASE WHEN "vE1" ? 'discountAmount' THEN "vC1QuotationLines"."discountAmount" ELSE 0 END, CASE WHEN "vE1" ? 'taxableAmount' THEN "vC1QuotationLines"."taxableAmount" ELSE NULL END, CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1QuotationLines"."taxCodeId" ELSE NULL END, CASE WHEN "vE1" ? 'taxRate' THEN "vC1QuotationLines"."taxRate" ELSE 0 END, CASE WHEN "vE1" ? 'taxAmount' THEN "vC1QuotationLines"."taxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'totalAmount' THEN "vC1QuotationLines"."totalAmount" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."quotationAddUpdate"(jsonb) IS 'Save (insert or update) one Quotations record with its lines.';

-- Quotations: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Sales"."getQuotationInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('QuotationStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('QuotationStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Sales"."QuotationLines" c1 WHERE c1."quotationId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Sales"."Quotations" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getQuotationInfo"(uuid) IS 'Read one Quotations record (getter for its screens).';

-- Quotations: Cancel (status -> CANCELLED); allowed from DRAFT, SENT, ACCEPTED, EXPIRED, CONVERTED
CREATE OR REPLACE FUNCTION "Sales"."quotationCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Sales"."Quotations";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."Quotations" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotations % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CONVERTED') THEN
    RAISE EXCEPTION 'Quotations %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Sales"."quotationCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Sales"."quotationCancelEntries"') USING "pId";
  END IF;
  UPDATE "Sales"."Quotations" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- SalesOrders: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Sales"."salesOrderAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."SalesOrders";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1SalesOrderLines" "Sales"."SalesOrderLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."SalesOrders", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('SO', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Sales"."SalesOrders" ("tenantId", "docNo", "docDate", "customerId", "quotationId", "branchId", "warehouseId", "expectedDeliveryDate", "customerPoRef", "customerPoDate", "salesRepUserId", "priceListId", "paymentTerms", "reserveStock", "emailConfirmation", "currencyCode", "fxRate", "grossAmount", "discountAmount", "taxAmount", "netAmount", "holdReason", "confirmedAt", remarks)
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'quotationId' THEN "vRec"."quotationId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'expectedDeliveryDate' THEN "vRec"."expectedDeliveryDate" ELSE NULL END, CASE WHEN "pData" ? 'customerPoRef' THEN "vRec"."customerPoRef" ELSE NULL END, CASE WHEN "pData" ? 'customerPoDate' THEN "vRec"."customerPoDate" ELSE NULL END, CASE WHEN "pData" ? 'salesRepUserId' THEN "vRec"."salesRepUserId" ELSE NULL END, CASE WHEN "pData" ? 'priceListId' THEN "vRec"."priceListId" ELSE NULL END, CASE WHEN "pData" ? 'paymentTerms' THEN "vRec"."paymentTerms" ELSE NULL END, CASE WHEN "pData" ? 'reserveStock' THEN "vRec"."reserveStock" ELSE TRUE END, CASE WHEN "pData" ? 'emailConfirmation' THEN "vRec"."emailConfirmation" ELSE FALSE END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE 1 END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE 0 END, CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE 0 END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE 0 END, CASE WHEN "pData" ? 'holdReason' THEN "vRec"."holdReason" ELSE NULL END, CASE WHEN "pData" ? 'confirmedAt' THEN "vRec"."confirmedAt" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Sales"."SalesOrders" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'SalesOrders: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Sales"."SalesOrders" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           "quotationId" = CASE WHEN "pData" ? 'quotationId' THEN "vRec"."quotationId" ELSE t."quotationId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "expectedDeliveryDate" = CASE WHEN "pData" ? 'expectedDeliveryDate' THEN "vRec"."expectedDeliveryDate" ELSE t."expectedDeliveryDate" END,
           "customerPoRef" = CASE WHEN "pData" ? 'customerPoRef' THEN "vRec"."customerPoRef" ELSE t."customerPoRef" END,
           "customerPoDate" = CASE WHEN "pData" ? 'customerPoDate' THEN "vRec"."customerPoDate" ELSE t."customerPoDate" END,
           "salesRepUserId" = CASE WHEN "pData" ? 'salesRepUserId' THEN "vRec"."salesRepUserId" ELSE t."salesRepUserId" END,
           "priceListId" = CASE WHEN "pData" ? 'priceListId' THEN "vRec"."priceListId" ELSE t."priceListId" END,
           "paymentTerms" = CASE WHEN "pData" ? 'paymentTerms' THEN "vRec"."paymentTerms" ELSE t."paymentTerms" END,
           "reserveStock" = CASE WHEN "pData" ? 'reserveStock' THEN "vRec"."reserveStock" ELSE t."reserveStock" END,
           "emailConfirmation" = CASE WHEN "pData" ? 'emailConfirmation' THEN "vRec"."emailConfirmation" ELSE t."emailConfirmation" END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "fxRate" = CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE t."fxRate" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "discountAmount" = CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE t."discountAmount" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "holdReason" = CASE WHEN "pData" ? 'holdReason' THEN "vRec"."holdReason" ELSE t."holdReason" END,
           "confirmedAt" = CASE WHEN "pData" ? 'confirmedAt' THEN "vRec"."confirmedAt" ELSE t."confirmedAt" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."SalesOrders" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'SalesOrders %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SalesOrders % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."SalesOrderLines"
     WHERE "tenantId" = "vTenant" AND "salesOrderId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1SalesOrderLines" := jsonb_populate_record(NULL::"Sales"."SalesOrderLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1SalesOrderLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."SalesOrderLines" t
           SET "quotationLineId" = CASE WHEN "vE1" ? 'quotationLineId' THEN "vC1SalesOrderLines"."quotationLineId" ELSE t."quotationLineId" END,
               "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1SalesOrderLines"."itemId" ELSE t."itemId" END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1SalesOrderLines".description ELSE t.description END,
               "qtyCtn" = CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1SalesOrderLines"."qtyCtn" ELSE t."qtyCtn" END,
               "qtyLoose" = CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1SalesOrderLines"."qtyLoose" ELSE t."qtyLoose" END,
               "ctnFactor" = CASE WHEN "vE1" ? 'ctnFactor' THEN "vC1SalesOrderLines"."ctnFactor" ELSE t."ctnFactor" END,
               "baseQty" = CASE WHEN "vE1" ? 'baseQty' THEN "vC1SalesOrderLines"."baseQty" ELSE t."baseQty" END,
               "bonusQty" = CASE WHEN "vE1" ? 'bonusQty' THEN "vC1SalesOrderLines"."bonusQty" ELSE t."bonusQty" END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1SalesOrderLines".rate ELSE t.rate END,
               "grossAmount" = CASE WHEN "vE1" ? 'grossAmount' THEN "vC1SalesOrderLines"."grossAmount" ELSE t."grossAmount" END,
               "discountPct" = CASE WHEN "vE1" ? 'discountPct' THEN "vC1SalesOrderLines"."discountPct" ELSE t."discountPct" END,
               "discountAmount" = CASE WHEN "vE1" ? 'discountAmount' THEN "vC1SalesOrderLines"."discountAmount" ELSE t."discountAmount" END,
               "taxableAmount" = CASE WHEN "vE1" ? 'taxableAmount' THEN "vC1SalesOrderLines"."taxableAmount" ELSE t."taxableAmount" END,
               "taxCodeId" = CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1SalesOrderLines"."taxCodeId" ELSE t."taxCodeId" END,
               "taxRate" = CASE WHEN "vE1" ? 'taxRate' THEN "vC1SalesOrderLines"."taxRate" ELSE t."taxRate" END,
               "taxAmount" = CASE WHEN "vE1" ? 'taxAmount' THEN "vC1SalesOrderLines"."taxAmount" ELSE t."taxAmount" END,
               "totalAmount" = CASE WHEN "vE1" ? 'totalAmount' THEN "vC1SalesOrderLines"."totalAmount" ELSE t."totalAmount" END,
               "deliveredQty" = CASE WHEN "vE1" ? 'deliveredQty' THEN "vC1SalesOrderLines"."deliveredQty" ELSE t."deliveredQty" END,
               "invoicedQty" = CASE WHEN "vE1" ? 'invoicedQty' THEN "vC1SalesOrderLines"."invoicedQty" ELSE t."invoicedQty" END,
               "lineNo" = "vC1SalesOrderLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."salesOrderId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SalesOrderLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."SalesOrderLines" ("salesOrderId", "tenantId", "lineNo", "quotationLineId", "itemId", description, "qtyCtn", "qtyLoose", "ctnFactor", "baseQty", "bonusQty", rate, "grossAmount", "discountPct", "discountAmount", "taxableAmount", "taxCodeId", "taxRate", "taxAmount", "totalAmount", "deliveredQty", "invoicedQty")
        VALUES ("vRet", "vTenant", "vC1SalesOrderLines"."lineNo", CASE WHEN "vE1" ? 'quotationLineId' THEN "vC1SalesOrderLines"."quotationLineId" ELSE NULL END, CASE WHEN "vE1" ? 'itemId' THEN "vC1SalesOrderLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1SalesOrderLines".description ELSE NULL END, CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1SalesOrderLines"."qtyCtn" ELSE 0 END, CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1SalesOrderLines"."qtyLoose" ELSE 0 END, CASE WHEN "vE1" ? 'ctnFactor' THEN "vC1SalesOrderLines"."ctnFactor" ELSE 1 END, CASE WHEN "vE1" ? 'baseQty' THEN "vC1SalesOrderLines"."baseQty" ELSE NULL END, CASE WHEN "vE1" ? 'bonusQty' THEN "vC1SalesOrderLines"."bonusQty" ELSE 0 END, CASE WHEN "vE1" ? 'rate' THEN "vC1SalesOrderLines".rate ELSE NULL END, CASE WHEN "vE1" ? 'grossAmount' THEN "vC1SalesOrderLines"."grossAmount" ELSE NULL END, CASE WHEN "vE1" ? 'discountPct' THEN "vC1SalesOrderLines"."discountPct" ELSE 0 END, CASE WHEN "vE1" ? 'discountAmount' THEN "vC1SalesOrderLines"."discountAmount" ELSE 0 END, CASE WHEN "vE1" ? 'taxableAmount' THEN "vC1SalesOrderLines"."taxableAmount" ELSE NULL END, CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1SalesOrderLines"."taxCodeId" ELSE NULL END, CASE WHEN "vE1" ? 'taxRate' THEN "vC1SalesOrderLines"."taxRate" ELSE 0 END, CASE WHEN "vE1" ? 'taxAmount' THEN "vC1SalesOrderLines"."taxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'totalAmount' THEN "vC1SalesOrderLines"."totalAmount" ELSE NULL END, CASE WHEN "vE1" ? 'deliveredQty' THEN "vC1SalesOrderLines"."deliveredQty" ELSE 0 END, CASE WHEN "vE1" ? 'invoicedQty' THEN "vC1SalesOrderLines"."invoicedQty" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."salesOrderAddUpdate"(jsonb) IS 'Save (insert or update) one SalesOrders record with its lines.';

-- SalesOrders: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Sales"."getSalesOrderInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('paymentTermsLabel', "Lookups"."getLookupLabel"('CustomerPaymentTerms', t."paymentTerms") ->> 'label', 'paymentTermsTone', "Lookups"."getLookupLabel"('CustomerPaymentTerms', t."paymentTerms") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('SalesOrderStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('SalesOrderStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Sales"."SalesOrderLines" c1 WHERE c1."salesOrderId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Sales"."SalesOrders" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getSalesOrderInfo"(uuid) IS 'Read one SalesOrders record (getter for its screens).';

-- SalesOrders: Cancel (status -> CANCELLED); allowed from DRAFT, CONFIRMED, PARTIALLY_DELIVERED, TO_INVOICE, INVOICED, ON_HOLD
CREATE OR REPLACE FUNCTION "Sales"."salesOrderCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Sales"."SalesOrders";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."SalesOrders" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SalesOrders % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'CONFIRMED', 'PARTIALLY_DELIVERED', 'TO_INVOICE', 'INVOICED', 'ON_HOLD') THEN
    RAISE EXCEPTION 'SalesOrders %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Sales"."salesOrderCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Sales"."salesOrderCancelEntries"') USING "pId";
  END IF;
  UPDATE "Sales"."SalesOrders" t SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- SalesInvoices: insert (no "id") or update (with "id"); child arrays: lines, payments
CREATE OR REPLACE FUNCTION "Sales"."salesInvoiceAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."SalesInvoices";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1PosPayments" "Sales"."PosPayments";
  "vC1SalesInvoiceLines" "Sales"."SalesInvoiceLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."SalesInvoices", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"(CASE WHEN "vRec".channel = 'STANDARD' THEN 'INV' WHEN "vRec".channel = 'COUNTER' THEN 'SV' WHEN "vRec".channel = 'WHOLESALE' THEN 'WS' WHEN "vRec".channel = 'POS' THEN 'POS' ELSE 'INV' END, "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Sales"."SalesInvoices" ("tenantId", "docNo", channel, "taxInvoiceNo", "docDate", "customerId", "branchId", "warehouseId", "salesOrderId", "quotationId", "customerPoNo", "customerPoDate", "salesRepUserId", "priceListId", "paymentTerms", "dueDate", "buyerName", "buyerAddress", "buyerNtn", "buyerStrn", "buyerCnic", "buyerArea", "buyerCity", "shipToAddress", "contactName", "contactPhone", "contactEmail", "saleType", "billBookNo", "bookerName", "deliverymanName", "salesmanName", "supervisorName", "deliverySlot", "currencyCode", "fxRate", "grossAmount", "discountAmount", "taxableAmount", "taxAmount", "furtherTaxAmount", "advanceTaxRate", "advanceTaxAmount", "fbrServiceFee", "netAmount", "expectedWhtAmount", "cashTendered", "isHeld", "emailPdf", "submitToFbr", "sendWhatsappLink", "autoReminder", "customerNotes", "termsConditions", remarks, "voidedByUserId", "priceTier", "priceTierFactor", "creditOverrideId", "routeId", "bookerEmployeeId", "deliverymanEmployeeId", "salesmanEmployeeId", "supervisorEmployeeId", "posShiftId", "recurringProfileId", "deliveryChallanId", "shipToAddressId", "schemeId", "schemeAmount", "stockIssueMode")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'channel' THEN "vRec".channel ELSE 'STANDARD' END, CASE WHEN "pData" ? 'taxInvoiceNo' THEN "vRec"."taxInvoiceNo" ELSE NULL END, CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'salesOrderId' THEN "vRec"."salesOrderId" ELSE NULL END, CASE WHEN "pData" ? 'quotationId' THEN "vRec"."quotationId" ELSE NULL END, CASE WHEN "pData" ? 'customerPoNo' THEN "vRec"."customerPoNo" ELSE NULL END, CASE WHEN "pData" ? 'customerPoDate' THEN "vRec"."customerPoDate" ELSE NULL END, CASE WHEN "pData" ? 'salesRepUserId' THEN "vRec"."salesRepUserId" ELSE NULL END, CASE WHEN "pData" ? 'priceListId' THEN "vRec"."priceListId" ELSE NULL END, CASE WHEN "pData" ? 'paymentTerms' THEN "vRec"."paymentTerms" ELSE 'NET_30' END, CASE WHEN "pData" ? 'dueDate' THEN "vRec"."dueDate" ELSE NULL END, CASE WHEN "pData" ? 'buyerName' THEN "vRec"."buyerName" ELSE NULL END, CASE WHEN "pData" ? 'buyerAddress' THEN "vRec"."buyerAddress" ELSE NULL END, CASE WHEN "pData" ? 'buyerNtn' THEN "vRec"."buyerNtn" ELSE NULL END, CASE WHEN "pData" ? 'buyerStrn' THEN "vRec"."buyerStrn" ELSE NULL END, CASE WHEN "pData" ? 'buyerCnic' THEN "vRec"."buyerCnic" ELSE NULL END, CASE WHEN "pData" ? 'buyerArea' THEN "vRec"."buyerArea" ELSE NULL END, CASE WHEN "pData" ? 'buyerCity' THEN "vRec"."buyerCity" ELSE NULL END, CASE WHEN "pData" ? 'shipToAddress' THEN "vRec"."shipToAddress" ELSE NULL END, CASE WHEN "pData" ? 'contactName' THEN "vRec"."contactName" ELSE NULL END, CASE WHEN "pData" ? 'contactPhone' THEN "vRec"."contactPhone" ELSE NULL END, CASE WHEN "pData" ? 'contactEmail' THEN "vRec"."contactEmail" ELSE NULL END, CASE WHEN "pData" ? 'saleType' THEN "vRec"."saleType" ELSE 'REGULAR' END, CASE WHEN "pData" ? 'billBookNo' THEN "vRec"."billBookNo" ELSE NULL END, CASE WHEN "pData" ? 'bookerName' THEN "vRec"."bookerName" ELSE NULL END, CASE WHEN "pData" ? 'deliverymanName' THEN "vRec"."deliverymanName" ELSE NULL END, CASE WHEN "pData" ? 'salesmanName' THEN "vRec"."salesmanName" ELSE NULL END, CASE WHEN "pData" ? 'supervisorName' THEN "vRec"."supervisorName" ELSE NULL END, CASE WHEN "pData" ? 'deliverySlot' THEN "vRec"."deliverySlot" ELSE NULL END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE 1 END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE 0 END, CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE 0 END, CASE WHEN "pData" ? 'taxableAmount' THEN "vRec"."taxableAmount" ELSE 0 END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'furtherTaxAmount' THEN "vRec"."furtherTaxAmount" ELSE 0 END, CASE WHEN "pData" ? 'advanceTaxRate' THEN "vRec"."advanceTaxRate" ELSE 0 END, CASE WHEN "pData" ? 'advanceTaxAmount' THEN "vRec"."advanceTaxAmount" ELSE 0 END, CASE WHEN "pData" ? 'fbrServiceFee' THEN "vRec"."fbrServiceFee" ELSE 0 END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE 0 END, CASE WHEN "pData" ? 'expectedWhtAmount' THEN "vRec"."expectedWhtAmount" ELSE 0 END, CASE WHEN "pData" ? 'cashTendered' THEN "vRec"."cashTendered" ELSE NULL END, CASE WHEN "pData" ? 'isHeld' THEN "vRec"."isHeld" ELSE FALSE END, CASE WHEN "pData" ? 'emailPdf' THEN "vRec"."emailPdf" ELSE TRUE END, CASE WHEN "pData" ? 'submitToFbr' THEN "vRec"."submitToFbr" ELSE TRUE END, CASE WHEN "pData" ? 'sendWhatsappLink' THEN "vRec"."sendWhatsappLink" ELSE FALSE END, CASE WHEN "pData" ? 'autoReminder' THEN "vRec"."autoReminder" ELSE TRUE END, CASE WHEN "pData" ? 'customerNotes' THEN "vRec"."customerNotes" ELSE NULL END, CASE WHEN "pData" ? 'termsConditions' THEN "vRec"."termsConditions" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'voidedByUserId' THEN "vRec"."voidedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'priceTier' THEN "vRec"."priceTier" ELSE NULL END, CASE WHEN "pData" ? 'priceTierFactor' THEN "vRec"."priceTierFactor" ELSE NULL END, CASE WHEN "pData" ? 'creditOverrideId' THEN "vRec"."creditOverrideId" ELSE NULL END, CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE NULL END, CASE WHEN "pData" ? 'bookerEmployeeId' THEN "vRec"."bookerEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'deliverymanEmployeeId' THEN "vRec"."deliverymanEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'salesmanEmployeeId' THEN "vRec"."salesmanEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'supervisorEmployeeId' THEN "vRec"."supervisorEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'posShiftId' THEN "vRec"."posShiftId" ELSE NULL END, CASE WHEN "pData" ? 'recurringProfileId' THEN "vRec"."recurringProfileId" ELSE NULL END, CASE WHEN "pData" ? 'deliveryChallanId' THEN "vRec"."deliveryChallanId" ELSE NULL END, CASE WHEN "pData" ? 'shipToAddressId' THEN "vRec"."shipToAddressId" ELSE NULL END, CASE WHEN "pData" ? 'schemeId' THEN "vRec"."schemeId" ELSE NULL END, CASE WHEN "pData" ? 'schemeAmount' THEN "vRec"."schemeAmount" ELSE 0 END, CASE WHEN "pData" ? 'stockIssueMode' THEN "vRec"."stockIssueMode" ELSE 'AT_POSTING' END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Sales"."SalesInvoices" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'SalesInvoices: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Sales"."SalesInvoices" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           channel = CASE WHEN "pData" ? 'channel' THEN "vRec".channel ELSE t.channel END,
           "taxInvoiceNo" = CASE WHEN "pData" ? 'taxInvoiceNo' THEN "vRec"."taxInvoiceNo" ELSE t."taxInvoiceNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "salesOrderId" = CASE WHEN "pData" ? 'salesOrderId' THEN "vRec"."salesOrderId" ELSE t."salesOrderId" END,
           "quotationId" = CASE WHEN "pData" ? 'quotationId' THEN "vRec"."quotationId" ELSE t."quotationId" END,
           "customerPoNo" = CASE WHEN "pData" ? 'customerPoNo' THEN "vRec"."customerPoNo" ELSE t."customerPoNo" END,
           "customerPoDate" = CASE WHEN "pData" ? 'customerPoDate' THEN "vRec"."customerPoDate" ELSE t."customerPoDate" END,
           "salesRepUserId" = CASE WHEN "pData" ? 'salesRepUserId' THEN "vRec"."salesRepUserId" ELSE t."salesRepUserId" END,
           "priceListId" = CASE WHEN "pData" ? 'priceListId' THEN "vRec"."priceListId" ELSE t."priceListId" END,
           "paymentTerms" = CASE WHEN "pData" ? 'paymentTerms' THEN "vRec"."paymentTerms" ELSE t."paymentTerms" END,
           "dueDate" = CASE WHEN "pData" ? 'dueDate' THEN "vRec"."dueDate" ELSE t."dueDate" END,
           "buyerName" = CASE WHEN "pData" ? 'buyerName' THEN "vRec"."buyerName" ELSE t."buyerName" END,
           "buyerAddress" = CASE WHEN "pData" ? 'buyerAddress' THEN "vRec"."buyerAddress" ELSE t."buyerAddress" END,
           "buyerNtn" = CASE WHEN "pData" ? 'buyerNtn' THEN "vRec"."buyerNtn" ELSE t."buyerNtn" END,
           "buyerStrn" = CASE WHEN "pData" ? 'buyerStrn' THEN "vRec"."buyerStrn" ELSE t."buyerStrn" END,
           "buyerCnic" = CASE WHEN "pData" ? 'buyerCnic' THEN "vRec"."buyerCnic" ELSE t."buyerCnic" END,
           "buyerArea" = CASE WHEN "pData" ? 'buyerArea' THEN "vRec"."buyerArea" ELSE t."buyerArea" END,
           "buyerCity" = CASE WHEN "pData" ? 'buyerCity' THEN "vRec"."buyerCity" ELSE t."buyerCity" END,
           "shipToAddress" = CASE WHEN "pData" ? 'shipToAddress' THEN "vRec"."shipToAddress" ELSE t."shipToAddress" END,
           "contactName" = CASE WHEN "pData" ? 'contactName' THEN "vRec"."contactName" ELSE t."contactName" END,
           "contactPhone" = CASE WHEN "pData" ? 'contactPhone' THEN "vRec"."contactPhone" ELSE t."contactPhone" END,
           "contactEmail" = CASE WHEN "pData" ? 'contactEmail' THEN "vRec"."contactEmail" ELSE t."contactEmail" END,
           "saleType" = CASE WHEN "pData" ? 'saleType' THEN "vRec"."saleType" ELSE t."saleType" END,
           "billBookNo" = CASE WHEN "pData" ? 'billBookNo' THEN "vRec"."billBookNo" ELSE t."billBookNo" END,
           "bookerName" = CASE WHEN "pData" ? 'bookerName' THEN "vRec"."bookerName" ELSE t."bookerName" END,
           "deliverymanName" = CASE WHEN "pData" ? 'deliverymanName' THEN "vRec"."deliverymanName" ELSE t."deliverymanName" END,
           "salesmanName" = CASE WHEN "pData" ? 'salesmanName' THEN "vRec"."salesmanName" ELSE t."salesmanName" END,
           "supervisorName" = CASE WHEN "pData" ? 'supervisorName' THEN "vRec"."supervisorName" ELSE t."supervisorName" END,
           "deliverySlot" = CASE WHEN "pData" ? 'deliverySlot' THEN "vRec"."deliverySlot" ELSE t."deliverySlot" END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "fxRate" = CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE t."fxRate" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "discountAmount" = CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE t."discountAmount" END,
           "taxableAmount" = CASE WHEN "pData" ? 'taxableAmount' THEN "vRec"."taxableAmount" ELSE t."taxableAmount" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "furtherTaxAmount" = CASE WHEN "pData" ? 'furtherTaxAmount' THEN "vRec"."furtherTaxAmount" ELSE t."furtherTaxAmount" END,
           "advanceTaxRate" = CASE WHEN "pData" ? 'advanceTaxRate' THEN "vRec"."advanceTaxRate" ELSE t."advanceTaxRate" END,
           "advanceTaxAmount" = CASE WHEN "pData" ? 'advanceTaxAmount' THEN "vRec"."advanceTaxAmount" ELSE t."advanceTaxAmount" END,
           "fbrServiceFee" = CASE WHEN "pData" ? 'fbrServiceFee' THEN "vRec"."fbrServiceFee" ELSE t."fbrServiceFee" END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "expectedWhtAmount" = CASE WHEN "pData" ? 'expectedWhtAmount' THEN "vRec"."expectedWhtAmount" ELSE t."expectedWhtAmount" END,
           "cashTendered" = CASE WHEN "pData" ? 'cashTendered' THEN "vRec"."cashTendered" ELSE t."cashTendered" END,
           "isHeld" = CASE WHEN "pData" ? 'isHeld' THEN "vRec"."isHeld" ELSE t."isHeld" END,
           "emailPdf" = CASE WHEN "pData" ? 'emailPdf' THEN "vRec"."emailPdf" ELSE t."emailPdf" END,
           "submitToFbr" = CASE WHEN "pData" ? 'submitToFbr' THEN "vRec"."submitToFbr" ELSE t."submitToFbr" END,
           "sendWhatsappLink" = CASE WHEN "pData" ? 'sendWhatsappLink' THEN "vRec"."sendWhatsappLink" ELSE t."sendWhatsappLink" END,
           "autoReminder" = CASE WHEN "pData" ? 'autoReminder' THEN "vRec"."autoReminder" ELSE t."autoReminder" END,
           "customerNotes" = CASE WHEN "pData" ? 'customerNotes' THEN "vRec"."customerNotes" ELSE t."customerNotes" END,
           "termsConditions" = CASE WHEN "pData" ? 'termsConditions' THEN "vRec"."termsConditions" ELSE t."termsConditions" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END,
           "voidedByUserId" = CASE WHEN "pData" ? 'voidedByUserId' THEN "vRec"."voidedByUserId" ELSE t."voidedByUserId" END,
           "priceTier" = CASE WHEN "pData" ? 'priceTier' THEN "vRec"."priceTier" ELSE t."priceTier" END,
           "priceTierFactor" = CASE WHEN "pData" ? 'priceTierFactor' THEN "vRec"."priceTierFactor" ELSE t."priceTierFactor" END,
           "creditOverrideId" = CASE WHEN "pData" ? 'creditOverrideId' THEN "vRec"."creditOverrideId" ELSE t."creditOverrideId" END,
           "routeId" = CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE t."routeId" END,
           "bookerEmployeeId" = CASE WHEN "pData" ? 'bookerEmployeeId' THEN "vRec"."bookerEmployeeId" ELSE t."bookerEmployeeId" END,
           "deliverymanEmployeeId" = CASE WHEN "pData" ? 'deliverymanEmployeeId' THEN "vRec"."deliverymanEmployeeId" ELSE t."deliverymanEmployeeId" END,
           "salesmanEmployeeId" = CASE WHEN "pData" ? 'salesmanEmployeeId' THEN "vRec"."salesmanEmployeeId" ELSE t."salesmanEmployeeId" END,
           "supervisorEmployeeId" = CASE WHEN "pData" ? 'supervisorEmployeeId' THEN "vRec"."supervisorEmployeeId" ELSE t."supervisorEmployeeId" END,
           "posShiftId" = CASE WHEN "pData" ? 'posShiftId' THEN "vRec"."posShiftId" ELSE t."posShiftId" END,
           "recurringProfileId" = CASE WHEN "pData" ? 'recurringProfileId' THEN "vRec"."recurringProfileId" ELSE t."recurringProfileId" END,
           "deliveryChallanId" = CASE WHEN "pData" ? 'deliveryChallanId' THEN "vRec"."deliveryChallanId" ELSE t."deliveryChallanId" END,
           "shipToAddressId" = CASE WHEN "pData" ? 'shipToAddressId' THEN "vRec"."shipToAddressId" ELSE t."shipToAddressId" END,
           "schemeId" = CASE WHEN "pData" ? 'schemeId' THEN "vRec"."schemeId" ELSE t."schemeId" END,
           "schemeAmount" = CASE WHEN "pData" ? 'schemeAmount' THEN "vRec"."schemeAmount" ELSE t."schemeAmount" END,
           "stockIssueMode" = CASE WHEN "pData" ? 'stockIssueMode' THEN "vRec"."stockIssueMode" ELSE t."stockIssueMode" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."SalesInvoices" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'SalesInvoices %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SalesInvoices % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."SalesInvoiceLines"
     WHERE "tenantId" = "vTenant" AND "invoiceId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1SalesInvoiceLines" := jsonb_populate_record(NULL::"Sales"."SalesInvoiceLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1SalesInvoiceLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."SalesInvoiceLines" t
           SET "salesOrderLineId" = CASE WHEN "vE1" ? 'salesOrderLineId' THEN "vC1SalesInvoiceLines"."salesOrderLineId" ELSE t."salesOrderLineId" END,
               "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1SalesInvoiceLines"."itemId" ELSE t."itemId" END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1SalesInvoiceLines".description ELSE t.description END,
               "hsCode" = CASE WHEN "vE1" ? 'hsCode' THEN "vC1SalesInvoiceLines"."hsCode" ELSE t."hsCode" END,
               "packLabel" = CASE WHEN "vE1" ? 'packLabel' THEN "vC1SalesInvoiceLines"."packLabel" ELSE t."packLabel" END,
               "batchId" = CASE WHEN "vE1" ? 'batchId' THEN "vC1SalesInvoiceLines"."batchId" ELSE t."batchId" END,
               "expiryDate" = CASE WHEN "vE1" ? 'expiryDate' THEN "vC1SalesInvoiceLines"."expiryDate" ELSE t."expiryDate" END,
               "qtyCtn" = CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1SalesInvoiceLines"."qtyCtn" ELSE t."qtyCtn" END,
               "qtyLoose" = CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1SalesInvoiceLines"."qtyLoose" ELSE t."qtyLoose" END,
               "ctnFactor" = CASE WHEN "vE1" ? 'ctnFactor' THEN "vC1SalesInvoiceLines"."ctnFactor" ELSE t."ctnFactor" END,
               "baseQty" = CASE WHEN "vE1" ? 'baseQty' THEN "vC1SalesInvoiceLines"."baseQty" ELSE t."baseQty" END,
               "bonusQty" = CASE WHEN "vE1" ? 'bonusQty' THEN "vC1SalesInvoiceLines"."bonusQty" ELSE t."bonusQty" END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1SalesInvoiceLines".rate ELSE t.rate END,
               "grossAmount" = CASE WHEN "vE1" ? 'grossAmount' THEN "vC1SalesInvoiceLines"."grossAmount" ELSE t."grossAmount" END,
               "discountPct" = CASE WHEN "vE1" ? 'discountPct' THEN "vC1SalesInvoiceLines"."discountPct" ELSE t."discountPct" END,
               "discountAmount" = CASE WHEN "vE1" ? 'discountAmount' THEN "vC1SalesInvoiceLines"."discountAmount" ELSE t."discountAmount" END,
               "taxableAmount" = CASE WHEN "vE1" ? 'taxableAmount' THEN "vC1SalesInvoiceLines"."taxableAmount" ELSE t."taxableAmount" END,
               "taxCodeId" = CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1SalesInvoiceLines"."taxCodeId" ELSE t."taxCodeId" END,
               "taxRate" = CASE WHEN "vE1" ? 'taxRate' THEN "vC1SalesInvoiceLines"."taxRate" ELSE t."taxRate" END,
               "taxAmount" = CASE WHEN "vE1" ? 'taxAmount' THEN "vC1SalesInvoiceLines"."taxAmount" ELSE t."taxAmount" END,
               "furtherTaxRate" = CASE WHEN "vE1" ? 'furtherTaxRate' THEN "vC1SalesInvoiceLines"."furtherTaxRate" ELSE t."furtherTaxRate" END,
               "furtherTaxAmount" = CASE WHEN "vE1" ? 'furtherTaxAmount' THEN "vC1SalesInvoiceLines"."furtherTaxAmount" ELSE t."furtherTaxAmount" END,
               "totalAmount" = CASE WHEN "vE1" ? 'totalAmount' THEN "vC1SalesInvoiceLines"."totalAmount" ELSE t."totalAmount" END,
               "revenueAccountId" = CASE WHEN "vE1" ? 'revenueAccountId' THEN "vC1SalesInvoiceLines"."revenueAccountId" ELSE t."revenueAccountId" END,
               "unitCost" = CASE WHEN "vE1" ? 'unitCost' THEN "vC1SalesInvoiceLines"."unitCost" ELSE t."unitCost" END,
               "costAmount" = CASE WHEN "vE1" ? 'costAmount' THEN "vC1SalesInvoiceLines"."costAmount" ELSE t."costAmount" END,
               "listRate" = CASE WHEN "vE1" ? 'listRate' THEN "vC1SalesInvoiceLines"."listRate" ELSE t."listRate" END,
               "isManualRate" = CASE WHEN "vE1" ? 'isManualRate' THEN "vC1SalesInvoiceLines"."isManualRate" ELSE t."isManualRate" END,
               "schemeId" = CASE WHEN "vE1" ? 'schemeId' THEN "vC1SalesInvoiceLines"."schemeId" ELSE t."schemeId" END,
               "deliveryChallanLineId" = CASE WHEN "vE1" ? 'deliveryChallanLineId' THEN "vC1SalesInvoiceLines"."deliveryChallanLineId" ELSE t."deliveryChallanLineId" END,
               "lineNo" = "vC1SalesInvoiceLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."invoiceId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SalesInvoiceLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."SalesInvoiceLines" ("invoiceId", "tenantId", "lineNo", "salesOrderLineId", "itemId", description, "hsCode", "packLabel", "batchId", "expiryDate", "qtyCtn", "qtyLoose", "ctnFactor", "baseQty", "bonusQty", rate, "grossAmount", "discountPct", "discountAmount", "taxableAmount", "taxCodeId", "taxRate", "taxAmount", "furtherTaxRate", "furtherTaxAmount", "totalAmount", "revenueAccountId", "unitCost", "costAmount", "listRate", "isManualRate", "schemeId", "deliveryChallanLineId")
        VALUES ("vRet", "vTenant", "vC1SalesInvoiceLines"."lineNo", CASE WHEN "vE1" ? 'salesOrderLineId' THEN "vC1SalesInvoiceLines"."salesOrderLineId" ELSE NULL END, CASE WHEN "vE1" ? 'itemId' THEN "vC1SalesInvoiceLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1SalesInvoiceLines".description ELSE NULL END, CASE WHEN "vE1" ? 'hsCode' THEN "vC1SalesInvoiceLines"."hsCode" ELSE NULL END, CASE WHEN "vE1" ? 'packLabel' THEN "vC1SalesInvoiceLines"."packLabel" ELSE NULL END, CASE WHEN "vE1" ? 'batchId' THEN "vC1SalesInvoiceLines"."batchId" ELSE NULL END, CASE WHEN "vE1" ? 'expiryDate' THEN "vC1SalesInvoiceLines"."expiryDate" ELSE NULL END, CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1SalesInvoiceLines"."qtyCtn" ELSE 0 END, CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1SalesInvoiceLines"."qtyLoose" ELSE 0 END, CASE WHEN "vE1" ? 'ctnFactor' THEN "vC1SalesInvoiceLines"."ctnFactor" ELSE 1 END, CASE WHEN "vE1" ? 'baseQty' THEN "vC1SalesInvoiceLines"."baseQty" ELSE NULL END, CASE WHEN "vE1" ? 'bonusQty' THEN "vC1SalesInvoiceLines"."bonusQty" ELSE 0 END, CASE WHEN "vE1" ? 'rate' THEN "vC1SalesInvoiceLines".rate ELSE NULL END, CASE WHEN "vE1" ? 'grossAmount' THEN "vC1SalesInvoiceLines"."grossAmount" ELSE NULL END, CASE WHEN "vE1" ? 'discountPct' THEN "vC1SalesInvoiceLines"."discountPct" ELSE 0 END, CASE WHEN "vE1" ? 'discountAmount' THEN "vC1SalesInvoiceLines"."discountAmount" ELSE 0 END, CASE WHEN "vE1" ? 'taxableAmount' THEN "vC1SalesInvoiceLines"."taxableAmount" ELSE NULL END, CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1SalesInvoiceLines"."taxCodeId" ELSE NULL END, CASE WHEN "vE1" ? 'taxRate' THEN "vC1SalesInvoiceLines"."taxRate" ELSE 0 END, CASE WHEN "vE1" ? 'taxAmount' THEN "vC1SalesInvoiceLines"."taxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'furtherTaxRate' THEN "vC1SalesInvoiceLines"."furtherTaxRate" ELSE 0 END, CASE WHEN "vE1" ? 'furtherTaxAmount' THEN "vC1SalesInvoiceLines"."furtherTaxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'totalAmount' THEN "vC1SalesInvoiceLines"."totalAmount" ELSE NULL END, CASE WHEN "vE1" ? 'revenueAccountId' THEN "vC1SalesInvoiceLines"."revenueAccountId" ELSE NULL END, CASE WHEN "vE1" ? 'unitCost' THEN "vC1SalesInvoiceLines"."unitCost" ELSE NULL END, CASE WHEN "vE1" ? 'costAmount' THEN "vC1SalesInvoiceLines"."costAmount" ELSE 0 END, CASE WHEN "vE1" ? 'listRate' THEN "vC1SalesInvoiceLines"."listRate" ELSE NULL END, CASE WHEN "vE1" ? 'isManualRate' THEN "vC1SalesInvoiceLines"."isManualRate" ELSE FALSE END, CASE WHEN "vE1" ? 'schemeId' THEN "vC1SalesInvoiceLines"."schemeId" ELSE NULL END, CASE WHEN "vE1" ? 'deliveryChallanLineId' THEN "vC1SalesInvoiceLines"."deliveryChallanLineId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'payments' THEN
    -- payments: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."PosPayments"
     WHERE "tenantId" = "vTenant" AND "invoiceId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'payments') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'payments') WITH ORDINALITY t(x, n) LOOP
      "vC1PosPayments" := jsonb_populate_record(NULL::"Sales"."PosPayments", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."PosPayments" t
           SET "posShiftId" = CASE WHEN "vE1" ? 'posShiftId' THEN "vC1PosPayments"."posShiftId" ELSE t."posShiftId" END,
               tender = CASE WHEN "vE1" ? 'tender' THEN "vC1PosPayments".tender ELSE t.tender END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1PosPayments".amount ELSE t.amount END,
               "tenderedAmount" = CASE WHEN "vE1" ? 'tenderedAmount' THEN "vC1PosPayments"."tenderedAmount" ELSE t."tenderedAmount" END,
               "changeAmount" = CASE WHEN "vE1" ? 'changeAmount' THEN "vC1PosPayments"."changeAmount" ELSE t."changeAmount" END,
               reference = CASE WHEN "vE1" ? 'reference' THEN "vC1PosPayments".reference ELSE t.reference END,
               "receiptId" = CASE WHEN "vE1" ? 'receiptId' THEN "vC1PosPayments"."receiptId" ELSE t."receiptId" END,
               "paidAt" = CASE WHEN "vE1" ? 'paidAt' THEN "vC1PosPayments"."paidAt" ELSE t."paidAt" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."invoiceId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PosPayments: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."PosPayments" ("invoiceId", "tenantId", "posShiftId", tender, amount, "tenderedAmount", "changeAmount", reference, "receiptId", "paidAt")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'posShiftId' THEN "vC1PosPayments"."posShiftId" ELSE NULL END, CASE WHEN "vE1" ? 'tender' THEN "vC1PosPayments".tender ELSE NULL END, CASE WHEN "vE1" ? 'amount' THEN "vC1PosPayments".amount ELSE NULL END, CASE WHEN "vE1" ? 'tenderedAmount' THEN "vC1PosPayments"."tenderedAmount" ELSE NULL END, CASE WHEN "vE1" ? 'changeAmount' THEN "vC1PosPayments"."changeAmount" ELSE 0 END, CASE WHEN "vE1" ? 'reference' THEN "vC1PosPayments".reference ELSE NULL END, CASE WHEN "vE1" ? 'receiptId' THEN "vC1PosPayments"."receiptId" ELSE NULL END, CASE WHEN "vE1" ? 'paidAt' THEN "vC1PosPayments"."paidAt" ELSE now() END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."salesInvoiceAddUpdate"(jsonb) IS 'Save (insert or update) one SalesInvoices record with its lines, payments.';

-- SalesInvoices: one record as JSON (camelCase keys), with lookup labels and lines, payments
CREATE OR REPLACE FUNCTION "Sales"."getSalesInvoiceInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('channelLabel', "Lookups"."getLookupLabel"('SalesInvoiceChannel', t.channel) ->> 'label', 'channelTone', "Lookups"."getLookupLabel"('SalesInvoiceChannel', t.channel) ->> 'tone', 'paymentTermsLabel', "Lookups"."getLookupLabel"('CustomerPaymentTerms', t."paymentTerms") ->> 'label', 'paymentTermsTone', "Lookups"."getLookupLabel"('CustomerPaymentTerms', t."paymentTerms") ->> 'tone', 'saleTypeLabel', "Lookups"."getLookupLabel"('SaleType', t."saleType") ->> 'label', 'saleTypeTone', "Lookups"."getLookupLabel"('SaleType', t."saleType") ->> 'tone', 'deliverySlotLabel', "Lookups"."getLookupLabel"('DeliverySlot', t."deliverySlot") ->> 'label', 'deliverySlotTone', "Lookups"."getLookupLabel"('DeliverySlot', t."deliverySlot") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('SalesInvoiceStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('SalesInvoiceStatus', t.status) ->> 'tone', 'fbrStatusLabel', "Lookups"."getLookupLabel"('FbrStatus', t."fbrStatus") ->> 'label', 'fbrStatusTone', "Lookups"."getLookupLabel"('FbrStatus', t."fbrStatus") ->> 'tone', 'priceTierLabel', "Lookups"."getLookupLabel"('PriceTier', t."priceTier") ->> 'label', 'priceTierTone', "Lookups"."getLookupLabel"('PriceTier', t."priceTier") ->> 'tone', 'stockIssueModeLabel', "Lookups"."getLookupLabel"('StockIssueMode', t."stockIssueMode") ->> 'label', 'stockIssueModeTone', "Lookups"."getLookupLabel"('StockIssueMode', t."stockIssueMode") ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Sales"."SalesInvoiceLines" c1 WHERE c1."invoiceId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'payments', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Sales"."PosPayments" c1 WHERE c1."invoiceId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Sales"."SalesInvoices" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getSalesInvoiceInfo"(uuid) IS 'Read one SalesInvoices record (getter for its screens).';

-- SalesInvoices: Post (status -> POSTED); allowed from DRAFT
CREATE OR REPLACE FUNCTION "Sales"."salesInvoicePost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Sales"."SalesInvoices";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."SalesInvoices" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SalesInvoices % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'SalesInvoices %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Sales"."salesInvoicePostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Sales"."salesInvoicePostEntries"') USING "pId";
  END IF;
  UPDATE "Sales"."SalesInvoices" t SET status = 'POSTED', "postedAt" = now(), "postedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- SalesInvoices: Void (status -> VOID); allowed from DRAFT, POSTED, PARTIALLY_PAID, PAID
CREATE OR REPLACE FUNCTION "Sales"."salesInvoiceVoid"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Sales"."SalesInvoices";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."SalesInvoices" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SalesInvoices % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'VOID' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID') THEN
    RAISE EXCEPTION 'SalesInvoices %: cannot void from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Sales"."salesInvoiceVoidEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Sales"."salesInvoiceVoidEntries"') USING "pId";
  END IF;
  UPDATE "Sales"."SalesInvoices" t SET status = 'VOID', "voidedAt" = now(), "voidedByUserId" = "Company"."getCurrentUserId"(), "voidReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- CreditNotes: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Sales"."creditNoteAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."CreditNotes";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1CreditNoteLines" "Sales"."CreditNoteLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."CreditNotes", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('CN', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Sales"."CreditNotes" ("tenantId", "docNo", "docDate", "customerId", "invoiceId", "branchId", reason, "reasonNote", "returnWarehouseId", treatment, "currencyCode", "fxRate", "valueAmount", "taxAmount", "furtherTaxAmount", "totalAmount", narration, "refundReference", "salesReturnId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'invoiceId' THEN "vRec"."invoiceId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'reasonNote' THEN "vRec"."reasonNote" ELSE NULL END, CASE WHEN "pData" ? 'returnWarehouseId' THEN "vRec"."returnWarehouseId" ELSE NULL END, CASE WHEN "pData" ? 'treatment' THEN "vRec".treatment ELSE 'APPLY_TO_INVOICE' END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE 1 END, CASE WHEN "pData" ? 'valueAmount' THEN "vRec"."valueAmount" ELSE 0 END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'furtherTaxAmount' THEN "vRec"."furtherTaxAmount" ELSE 0 END, CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE 0 END, CASE WHEN "pData" ? 'narration' THEN "vRec".narration ELSE NULL END, CASE WHEN "pData" ? 'refundReference' THEN "vRec"."refundReference" ELSE NULL END, CASE WHEN "pData" ? 'salesReturnId' THEN "vRec"."salesReturnId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Sales"."CreditNotes" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'CreditNotes: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Sales"."CreditNotes" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           "invoiceId" = CASE WHEN "pData" ? 'invoiceId' THEN "vRec"."invoiceId" ELSE t."invoiceId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           "reasonNote" = CASE WHEN "pData" ? 'reasonNote' THEN "vRec"."reasonNote" ELSE t."reasonNote" END,
           "returnWarehouseId" = CASE WHEN "pData" ? 'returnWarehouseId' THEN "vRec"."returnWarehouseId" ELSE t."returnWarehouseId" END,
           treatment = CASE WHEN "pData" ? 'treatment' THEN "vRec".treatment ELSE t.treatment END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "fxRate" = CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE t."fxRate" END,
           "valueAmount" = CASE WHEN "pData" ? 'valueAmount' THEN "vRec"."valueAmount" ELSE t."valueAmount" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "furtherTaxAmount" = CASE WHEN "pData" ? 'furtherTaxAmount' THEN "vRec"."furtherTaxAmount" ELSE t."furtherTaxAmount" END,
           "totalAmount" = CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE t."totalAmount" END,
           narration = CASE WHEN "pData" ? 'narration' THEN "vRec".narration ELSE t.narration END,
           "refundReference" = CASE WHEN "pData" ? 'refundReference' THEN "vRec"."refundReference" ELSE t."refundReference" END,
           "salesReturnId" = CASE WHEN "pData" ? 'salesReturnId' THEN "vRec"."salesReturnId" ELSE t."salesReturnId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."CreditNotes" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CreditNotes %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CreditNotes % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."CreditNoteLines"
     WHERE "tenantId" = "vTenant" AND "creditNoteId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1CreditNoteLines" := jsonb_populate_record(NULL::"Sales"."CreditNoteLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1CreditNoteLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."CreditNoteLines" t
           SET "invoiceLineId" = CASE WHEN "vE1" ? 'invoiceLineId' THEN "vC1CreditNoteLines"."invoiceLineId" ELSE t."invoiceLineId" END,
               "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1CreditNoteLines"."itemId" ELSE t."itemId" END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1CreditNoteLines".description ELSE t.description END,
               "batchId" = CASE WHEN "vE1" ? 'batchId' THEN "vC1CreditNoteLines"."batchId" ELSE t."batchId" END,
               "invoicedQty" = CASE WHEN "vE1" ? 'invoicedQty' THEN "vC1CreditNoteLines"."invoicedQty" ELSE t."invoicedQty" END,
               "qtyCtn" = CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1CreditNoteLines"."qtyCtn" ELSE t."qtyCtn" END,
               "qtyLoose" = CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1CreditNoteLines"."qtyLoose" ELSE t."qtyLoose" END,
               "ctnFactor" = CASE WHEN "vE1" ? 'ctnFactor' THEN "vC1CreditNoteLines"."ctnFactor" ELSE t."ctnFactor" END,
               "baseQty" = CASE WHEN "vE1" ? 'baseQty' THEN "vC1CreditNoteLines"."baseQty" ELSE t."baseQty" END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1CreditNoteLines".rate ELSE t.rate END,
               "valueAmount" = CASE WHEN "vE1" ? 'valueAmount' THEN "vC1CreditNoteLines"."valueAmount" ELSE t."valueAmount" END,
               "taxCodeId" = CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1CreditNoteLines"."taxCodeId" ELSE t."taxCodeId" END,
               "taxRate" = CASE WHEN "vE1" ? 'taxRate' THEN "vC1CreditNoteLines"."taxRate" ELSE t."taxRate" END,
               "taxAmount" = CASE WHEN "vE1" ? 'taxAmount' THEN "vC1CreditNoteLines"."taxAmount" ELSE t."taxAmount" END,
               "furtherTaxAmount" = CASE WHEN "vE1" ? 'furtherTaxAmount' THEN "vC1CreditNoteLines"."furtherTaxAmount" ELSE t."furtherTaxAmount" END,
               "totalAmount" = CASE WHEN "vE1" ? 'totalAmount' THEN "vC1CreditNoteLines"."totalAmount" ELSE t."totalAmount" END,
               restock = CASE WHEN "vE1" ? 'restock' THEN "vC1CreditNoteLines".restock ELSE t.restock END,
               "unitCost" = CASE WHEN "vE1" ? 'unitCost' THEN "vC1CreditNoteLines"."unitCost" ELSE t."unitCost" END,
               "costAmount" = CASE WHEN "vE1" ? 'costAmount' THEN "vC1CreditNoteLines"."costAmount" ELSE t."costAmount" END,
               "lineNo" = "vC1CreditNoteLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."creditNoteId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'CreditNoteLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."CreditNoteLines" ("creditNoteId", "tenantId", "lineNo", "invoiceLineId", "itemId", description, "batchId", "invoicedQty", "qtyCtn", "qtyLoose", "ctnFactor", "baseQty", rate, "valueAmount", "taxCodeId", "taxRate", "taxAmount", "furtherTaxAmount", "totalAmount", restock, "unitCost", "costAmount")
        VALUES ("vRet", "vTenant", "vC1CreditNoteLines"."lineNo", CASE WHEN "vE1" ? 'invoiceLineId' THEN "vC1CreditNoteLines"."invoiceLineId" ELSE NULL END, CASE WHEN "vE1" ? 'itemId' THEN "vC1CreditNoteLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1CreditNoteLines".description ELSE NULL END, CASE WHEN "vE1" ? 'batchId' THEN "vC1CreditNoteLines"."batchId" ELSE NULL END, CASE WHEN "vE1" ? 'invoicedQty' THEN "vC1CreditNoteLines"."invoicedQty" ELSE NULL END, CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1CreditNoteLines"."qtyCtn" ELSE 0 END, CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1CreditNoteLines"."qtyLoose" ELSE 0 END, CASE WHEN "vE1" ? 'ctnFactor' THEN "vC1CreditNoteLines"."ctnFactor" ELSE 1 END, CASE WHEN "vE1" ? 'baseQty' THEN "vC1CreditNoteLines"."baseQty" ELSE 0 END, CASE WHEN "vE1" ? 'rate' THEN "vC1CreditNoteLines".rate ELSE NULL END, CASE WHEN "vE1" ? 'valueAmount' THEN "vC1CreditNoteLines"."valueAmount" ELSE NULL END, CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1CreditNoteLines"."taxCodeId" ELSE NULL END, CASE WHEN "vE1" ? 'taxRate' THEN "vC1CreditNoteLines"."taxRate" ELSE 0 END, CASE WHEN "vE1" ? 'taxAmount' THEN "vC1CreditNoteLines"."taxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'furtherTaxAmount' THEN "vC1CreditNoteLines"."furtherTaxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'totalAmount' THEN "vC1CreditNoteLines"."totalAmount" ELSE NULL END, CASE WHEN "vE1" ? 'restock' THEN "vC1CreditNoteLines".restock ELSE FALSE END, CASE WHEN "vE1" ? 'unitCost' THEN "vC1CreditNoteLines"."unitCost" ELSE NULL END, CASE WHEN "vE1" ? 'costAmount' THEN "vC1CreditNoteLines"."costAmount" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."creditNoteAddUpdate"(jsonb) IS 'Save (insert or update) one CreditNotes record with its lines.';

-- CreditNotes: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Sales"."getCreditNoteInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('reasonLabel', "Lookups"."getLookupLabel"('CreditNoteReason', t.reason) ->> 'label', 'reasonTone', "Lookups"."getLookupLabel"('CreditNoteReason', t.reason) ->> 'tone', 'treatmentLabel', "Lookups"."getLookupLabel"('CreditNoteTreatment', t.treatment) ->> 'label', 'treatmentTone', "Lookups"."getLookupLabel"('CreditNoteTreatment', t.treatment) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('CreditNoteStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('CreditNoteStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Sales"."CreditNoteLines" c1 WHERE c1."creditNoteId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Sales"."CreditNotes" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getCreditNoteInfo"(uuid) IS 'Read one CreditNotes record (getter for its screens).';

-- CreditNotes: Cancel (status -> CANCELLED); allowed from DRAFT, PENDING_APPROVAL, OPEN, APPLIED
CREATE OR REPLACE FUNCTION "Sales"."creditNoteCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Sales"."CreditNotes";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."CreditNotes" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CreditNotes % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_APPROVAL', 'OPEN', 'APPLIED') THEN
    RAISE EXCEPTION 'CreditNotes %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Sales"."creditNoteCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Sales"."creditNoteCancelEntries"') USING "pId";
  END IF;
  UPDATE "Sales"."CreditNotes" t SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- CreditNotes: Post (status -> OPEN); allowed from DRAFT, PENDING_APPROVAL
CREATE OR REPLACE FUNCTION "Sales"."creditNotePost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Sales"."CreditNotes";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."CreditNotes" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CreditNotes % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'OPEN' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'CreditNotes %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Sales"."creditNotePostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Sales"."creditNotePostEntries"') USING "pId";
  END IF;
  UPDATE "Sales"."CreditNotes" t SET status = 'OPEN' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- CustomerReceipts: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Sales"."customerReceiptAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."CustomerReceipts";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."CustomerReceipts", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('RCPT', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Sales"."CustomerReceipts" ("tenantId", "docNo", "docDate", "customerId", "branchId", method, "bankAccountId", "cashAccountId", "chequeId", reference, "currencyCode", "fxRate", "amountReceived", "whtAmount", "whtSection", "whtCertificateStatus", "whtCertificateNo", "whtCertificateDate", "bankCharges", "salesOrderId", memo, "emailReceipt", "bouncedAt", "bounceReason", "bounceJournalEntryId", "posShiftId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'method' THEN "vRec".method ELSE NULL END, CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE NULL END, CASE WHEN "pData" ? 'chequeId' THEN "vRec"."chequeId" ELSE NULL END, CASE WHEN "pData" ? 'reference' THEN "vRec".reference ELSE NULL END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE 1 END, CASE WHEN "pData" ? 'amountReceived' THEN "vRec"."amountReceived" ELSE NULL END, CASE WHEN "pData" ? 'whtAmount' THEN "vRec"."whtAmount" ELSE 0 END, CASE WHEN "pData" ? 'whtSection' THEN "vRec"."whtSection" ELSE NULL END, CASE WHEN "pData" ? 'whtCertificateStatus' THEN "vRec"."whtCertificateStatus" ELSE 'NOT_APPLICABLE' END, CASE WHEN "pData" ? 'whtCertificateNo' THEN "vRec"."whtCertificateNo" ELSE NULL END, CASE WHEN "pData" ? 'whtCertificateDate' THEN "vRec"."whtCertificateDate" ELSE NULL END, CASE WHEN "pData" ? 'bankCharges' THEN "vRec"."bankCharges" ELSE 0 END, CASE WHEN "pData" ? 'salesOrderId' THEN "vRec"."salesOrderId" ELSE NULL END, CASE WHEN "pData" ? 'memo' THEN "vRec".memo ELSE NULL END, CASE WHEN "pData" ? 'emailReceipt' THEN "vRec"."emailReceipt" ELSE TRUE END, CASE WHEN "pData" ? 'bouncedAt' THEN "vRec"."bouncedAt" ELSE NULL END, CASE WHEN "pData" ? 'bounceReason' THEN "vRec"."bounceReason" ELSE NULL END, CASE WHEN "pData" ? 'bounceJournalEntryId' THEN "vRec"."bounceJournalEntryId" ELSE NULL END, CASE WHEN "pData" ? 'posShiftId' THEN "vRec"."posShiftId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Sales"."CustomerReceipts" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           method = CASE WHEN "pData" ? 'method' THEN "vRec".method ELSE t.method END,
           "bankAccountId" = CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE t."bankAccountId" END,
           "cashAccountId" = CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE t."cashAccountId" END,
           "chequeId" = CASE WHEN "pData" ? 'chequeId' THEN "vRec"."chequeId" ELSE t."chequeId" END,
           reference = CASE WHEN "pData" ? 'reference' THEN "vRec".reference ELSE t.reference END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "fxRate" = CASE WHEN "pData" ? 'fxRate' THEN "vRec"."fxRate" ELSE t."fxRate" END,
           "amountReceived" = CASE WHEN "pData" ? 'amountReceived' THEN "vRec"."amountReceived" ELSE t."amountReceived" END,
           "whtAmount" = CASE WHEN "pData" ? 'whtAmount' THEN "vRec"."whtAmount" ELSE t."whtAmount" END,
           "whtSection" = CASE WHEN "pData" ? 'whtSection' THEN "vRec"."whtSection" ELSE t."whtSection" END,
           "whtCertificateStatus" = CASE WHEN "pData" ? 'whtCertificateStatus' THEN "vRec"."whtCertificateStatus" ELSE t."whtCertificateStatus" END,
           "whtCertificateNo" = CASE WHEN "pData" ? 'whtCertificateNo' THEN "vRec"."whtCertificateNo" ELSE t."whtCertificateNo" END,
           "whtCertificateDate" = CASE WHEN "pData" ? 'whtCertificateDate' THEN "vRec"."whtCertificateDate" ELSE t."whtCertificateDate" END,
           "bankCharges" = CASE WHEN "pData" ? 'bankCharges' THEN "vRec"."bankCharges" ELSE t."bankCharges" END,
           "salesOrderId" = CASE WHEN "pData" ? 'salesOrderId' THEN "vRec"."salesOrderId" ELSE t."salesOrderId" END,
           memo = CASE WHEN "pData" ? 'memo' THEN "vRec".memo ELSE t.memo END,
           "emailReceipt" = CASE WHEN "pData" ? 'emailReceipt' THEN "vRec"."emailReceipt" ELSE t."emailReceipt" END,
           "bouncedAt" = CASE WHEN "pData" ? 'bouncedAt' THEN "vRec"."bouncedAt" ELSE t."bouncedAt" END,
           "bounceReason" = CASE WHEN "pData" ? 'bounceReason' THEN "vRec"."bounceReason" ELSE t."bounceReason" END,
           "bounceJournalEntryId" = CASE WHEN "pData" ? 'bounceJournalEntryId' THEN "vRec"."bounceJournalEntryId" ELSE t."bounceJournalEntryId" END,
           "posShiftId" = CASE WHEN "pData" ? 'posShiftId' THEN "vRec"."posShiftId" ELSE t."posShiftId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."CustomerReceipts" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CustomerReceipts %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CustomerReceipts % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."customerReceiptAddUpdate"(jsonb) IS 'Save (insert or update) one CustomerReceipts record.';

-- CustomerReceipts: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Sales"."getCustomerReceiptInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('methodLabel', "Lookups"."getLookupLabel"('CustomerReceiptMethod', t.method) ->> 'label', 'methodTone', "Lookups"."getLookupLabel"('CustomerReceiptMethod', t.method) ->> 'tone', 'whtCertificateStatusLabel', "Lookups"."getLookupLabel"('WhtCertificateStatus2', t."whtCertificateStatus") ->> 'label', 'whtCertificateStatusTone', "Lookups"."getLookupLabel"('WhtCertificateStatus2', t."whtCertificateStatus") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('CustomerReceiptStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('CustomerReceiptStatus', t.status) ->> 'tone')
    FROM "Sales"."CustomerReceipts" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getCustomerReceiptInfo"(uuid) IS 'Read one CustomerReceipts record (getter for its screens).';

-- CustomerReceipts: Void (status -> VOID); allowed from UNALLOCATED, PARTLY_ALLOCATED, ALLOCATED, BOUNCED
CREATE OR REPLACE FUNCTION "Sales"."customerReceiptVoid"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Sales"."CustomerReceipts";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."CustomerReceipts" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CustomerReceipts % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'VOID' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('UNALLOCATED', 'PARTLY_ALLOCATED', 'ALLOCATED', 'BOUNCED') THEN
    RAISE EXCEPTION 'CustomerReceipts %: cannot void from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Sales"."customerReceiptVoidEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Sales"."customerReceiptVoidEntries"') USING "pId";
  END IF;
  UPDATE "Sales"."CustomerReceipts" t SET status = 'VOID', "voidedAt" = now(), "voidReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- CustomerReceipts: Post (status -> unchanged); allowed from UNALLOCATED, PARTLY_ALLOCATED, ALLOCATED
CREATE OR REPLACE FUNCTION "Sales"."customerReceiptPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Sales"."CustomerReceipts";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."CustomerReceipts" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CustomerReceipts % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  -- status is kept; the posting hook itself is idempotent (one journal per source)
  IF "vRow".status NOT IN ('UNALLOCATED', 'PARTLY_ALLOCATED', 'ALLOCATED') THEN
    RAISE EXCEPTION 'CustomerReceipts %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Sales"."customerReceiptPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Sales"."customerReceiptPostEntries"') USING "pId";
  END IF;
  UPDATE "Sales"."CustomerReceipts" t SET "updatedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- SalesSchemes: insert (no "id") or update (with "id"); child arrays: eligibility, items
CREATE OR REPLACE FUNCTION "Sales"."salesSchemeAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."SalesSchemes";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1SalesSchemeEligibilities" "Sales"."SalesSchemeEligibilities";
  "vC1SalesSchemeItems" "Sales"."SalesSchemeItems";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."SalesSchemes", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'code') OR "vRec".code IS NULL THEN
      "vRec".code := "Company"."getNextDocNo"('SCH', current_date, NULL);
    END IF;
    INSERT INTO "Sales"."SalesSchemes" ("tenantId", code, name, description, "schemeType", "validFrom", "validTo", "isActive", "buyQty", "freeQty", "discountPct", "discountAmount", "minInvoiceAmount", "minLineQty", "bundlePrice", "settlementDays", "appliesToAll", "budgetCap", "maxUsesPerCustomer", "usedCount", "valueGiven")
    VALUES ("vTenant", "vRec".code, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'schemeType' THEN "vRec"."schemeType" ELSE NULL END, CASE WHEN "pData" ? 'validFrom' THEN "vRec"."validFrom" ELSE NULL END, CASE WHEN "pData" ? 'validTo' THEN "vRec"."validTo" ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END, CASE WHEN "pData" ? 'buyQty' THEN "vRec"."buyQty" ELSE NULL END, CASE WHEN "pData" ? 'freeQty' THEN "vRec"."freeQty" ELSE NULL END, CASE WHEN "pData" ? 'discountPct' THEN "vRec"."discountPct" ELSE NULL END, CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE NULL END, CASE WHEN "pData" ? 'minInvoiceAmount' THEN "vRec"."minInvoiceAmount" ELSE NULL END, CASE WHEN "pData" ? 'minLineQty' THEN "vRec"."minLineQty" ELSE NULL END, CASE WHEN "pData" ? 'bundlePrice' THEN "vRec"."bundlePrice" ELSE NULL END, CASE WHEN "pData" ? 'settlementDays' THEN "vRec"."settlementDays" ELSE NULL END, CASE WHEN "pData" ? 'appliesToAll' THEN "vRec"."appliesToAll" ELSE FALSE END, CASE WHEN "pData" ? 'budgetCap' THEN "vRec"."budgetCap" ELSE NULL END, CASE WHEN "pData" ? 'maxUsesPerCustomer' THEN "vRec"."maxUsesPerCustomer" ELSE NULL END, CASE WHEN "pData" ? 'usedCount' THEN "vRec"."usedCount" ELSE 0 END, CASE WHEN "pData" ? 'valueGiven' THEN "vRec"."valueGiven" ELSE 0 END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Sales"."SalesSchemes" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "schemeType" = CASE WHEN "pData" ? 'schemeType' THEN "vRec"."schemeType" ELSE t."schemeType" END,
           "validFrom" = CASE WHEN "pData" ? 'validFrom' THEN "vRec"."validFrom" ELSE t."validFrom" END,
           "validTo" = CASE WHEN "pData" ? 'validTo' THEN "vRec"."validTo" ELSE t."validTo" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END,
           "buyQty" = CASE WHEN "pData" ? 'buyQty' THEN "vRec"."buyQty" ELSE t."buyQty" END,
           "freeQty" = CASE WHEN "pData" ? 'freeQty' THEN "vRec"."freeQty" ELSE t."freeQty" END,
           "discountPct" = CASE WHEN "pData" ? 'discountPct' THEN "vRec"."discountPct" ELSE t."discountPct" END,
           "discountAmount" = CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE t."discountAmount" END,
           "minInvoiceAmount" = CASE WHEN "pData" ? 'minInvoiceAmount' THEN "vRec"."minInvoiceAmount" ELSE t."minInvoiceAmount" END,
           "minLineQty" = CASE WHEN "pData" ? 'minLineQty' THEN "vRec"."minLineQty" ELSE t."minLineQty" END,
           "bundlePrice" = CASE WHEN "pData" ? 'bundlePrice' THEN "vRec"."bundlePrice" ELSE t."bundlePrice" END,
           "settlementDays" = CASE WHEN "pData" ? 'settlementDays' THEN "vRec"."settlementDays" ELSE t."settlementDays" END,
           "appliesToAll" = CASE WHEN "pData" ? 'appliesToAll' THEN "vRec"."appliesToAll" ELSE t."appliesToAll" END,
           "budgetCap" = CASE WHEN "pData" ? 'budgetCap' THEN "vRec"."budgetCap" ELSE t."budgetCap" END,
           "maxUsesPerCustomer" = CASE WHEN "pData" ? 'maxUsesPerCustomer' THEN "vRec"."maxUsesPerCustomer" ELSE t."maxUsesPerCustomer" END,
           "usedCount" = CASE WHEN "pData" ? 'usedCount' THEN "vRec"."usedCount" ELSE t."usedCount" END,
           "valueGiven" = CASE WHEN "pData" ? 'valueGiven' THEN "vRec"."valueGiven" ELSE t."valueGiven" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."SalesSchemes" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'SalesSchemes %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SalesSchemes % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'eligibility' THEN
    -- eligibility: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."SalesSchemeEligibilities"
     WHERE "tenantId" = "vTenant" AND "schemeId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'eligibility') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'eligibility') WITH ORDINALITY t(x, n) LOOP
      "vC1SalesSchemeEligibilities" := jsonb_populate_record(NULL::"Sales"."SalesSchemeEligibilities", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."SalesSchemeEligibilities" t
           SET "customerGroupId" = CASE WHEN "vE1" ? 'customerGroupId' THEN "vC1SalesSchemeEligibilities"."customerGroupId" ELSE t."customerGroupId" END,
               "customerId" = CASE WHEN "vE1" ? 'customerId' THEN "vC1SalesSchemeEligibilities"."customerId" ELSE t."customerId" END,
               "priceTier" = CASE WHEN "vE1" ? 'priceTier' THEN "vC1SalesSchemeEligibilities"."priceTier" ELSE t."priceTier" END,
               "isExcluded" = CASE WHEN "vE1" ? 'isExcluded' THEN "vC1SalesSchemeEligibilities"."isExcluded" ELSE t."isExcluded" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."schemeId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SalesSchemeEligibilities: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."SalesSchemeEligibilities" ("schemeId", "tenantId", "customerGroupId", "customerId", "priceTier", "isExcluded")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'customerGroupId' THEN "vC1SalesSchemeEligibilities"."customerGroupId" ELSE NULL END, CASE WHEN "vE1" ? 'customerId' THEN "vC1SalesSchemeEligibilities"."customerId" ELSE NULL END, CASE WHEN "vE1" ? 'priceTier' THEN "vC1SalesSchemeEligibilities"."priceTier" ELSE NULL END, CASE WHEN "vE1" ? 'isExcluded' THEN "vC1SalesSchemeEligibilities"."isExcluded" ELSE FALSE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'items' THEN
    -- items: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."SalesSchemeItems"
     WHERE "tenantId" = "vTenant" AND "schemeId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'items') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'items') WITH ORDINALITY t(x, n) LOOP
      "vC1SalesSchemeItems" := jsonb_populate_record(NULL::"Sales"."SalesSchemeItems", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."SalesSchemeItems" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1SalesSchemeItems"."itemId" ELSE t."itemId" END,
               "itemRole" = CASE WHEN "vE1" ? 'itemRole' THEN "vC1SalesSchemeItems"."itemRole" ELSE t."itemRole" END,
               qty = CASE WHEN "vE1" ? 'qty' THEN "vC1SalesSchemeItems".qty ELSE t.qty END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."schemeId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SalesSchemeItems: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."SalesSchemeItems" ("schemeId", "tenantId", "itemId", "itemRole", qty)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'itemId' THEN "vC1SalesSchemeItems"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'itemRole' THEN "vC1SalesSchemeItems"."itemRole" ELSE NULL END, CASE WHEN "vE1" ? 'qty' THEN "vC1SalesSchemeItems".qty ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."salesSchemeAddUpdate"(jsonb) IS 'Save (insert or update) one SalesSchemes record with its eligibility, items.';

-- SalesSchemes: one record as JSON (camelCase keys), with lookup labels and eligibility, items
CREATE OR REPLACE FUNCTION "Sales"."getSalesSchemeInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('schemeTypeLabel', "Lookups"."getLookupLabel"('SchemeType', t."schemeType") ->> 'label', 'schemeTypeTone', "Lookups"."getLookupLabel"('SchemeType', t."schemeType") ->> 'tone') ||
         jsonb_build_object('eligibility', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Sales"."SalesSchemeEligibilities" c1 WHERE c1."schemeId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'items', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Sales"."SalesSchemeItems" c1 WHERE c1."schemeId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Sales"."SalesSchemes" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getSalesSchemeInfo"(uuid) IS 'Read one SalesSchemes record (getter for its screens).';

-- DeliveryChallans: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Sales"."deliveryChallanAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."DeliveryChallans";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1DeliveryChallanLines" "Sales"."DeliveryChallanLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."DeliveryChallans", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('DC', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Sales"."DeliveryChallans" ("tenantId", "docNo", "docDate", "salesOrderId", "customerId", "branchId", "warehouseId", "vehicleId", "vehicleNo", "driverEmployeeId", "driverName", "deliverySlot", eta, "totalQty", "dispatchedAt", "deliveredAt", "receivedBy", "invoiceId", remarks)
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'salesOrderId' THEN "vRec"."salesOrderId" ELSE NULL END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'vehicleId' THEN "vRec"."vehicleId" ELSE NULL END, CASE WHEN "pData" ? 'vehicleNo' THEN "vRec"."vehicleNo" ELSE NULL END, CASE WHEN "pData" ? 'driverEmployeeId' THEN "vRec"."driverEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'driverName' THEN "vRec"."driverName" ELSE NULL END, CASE WHEN "pData" ? 'deliverySlot' THEN "vRec"."deliverySlot" ELSE NULL END, CASE WHEN "pData" ? 'eta' THEN "vRec".eta ELSE NULL END, CASE WHEN "pData" ? 'totalQty' THEN "vRec"."totalQty" ELSE 0 END, CASE WHEN "pData" ? 'dispatchedAt' THEN "vRec"."dispatchedAt" ELSE NULL END, CASE WHEN "pData" ? 'deliveredAt' THEN "vRec"."deliveredAt" ELSE NULL END, CASE WHEN "pData" ? 'receivedBy' THEN "vRec"."receivedBy" ELSE NULL END, CASE WHEN "pData" ? 'invoiceId' THEN "vRec"."invoiceId" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Sales"."DeliveryChallans" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "salesOrderId" = CASE WHEN "pData" ? 'salesOrderId' THEN "vRec"."salesOrderId" ELSE t."salesOrderId" END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "vehicleId" = CASE WHEN "pData" ? 'vehicleId' THEN "vRec"."vehicleId" ELSE t."vehicleId" END,
           "vehicleNo" = CASE WHEN "pData" ? 'vehicleNo' THEN "vRec"."vehicleNo" ELSE t."vehicleNo" END,
           "driverEmployeeId" = CASE WHEN "pData" ? 'driverEmployeeId' THEN "vRec"."driverEmployeeId" ELSE t."driverEmployeeId" END,
           "driverName" = CASE WHEN "pData" ? 'driverName' THEN "vRec"."driverName" ELSE t."driverName" END,
           "deliverySlot" = CASE WHEN "pData" ? 'deliverySlot' THEN "vRec"."deliverySlot" ELSE t."deliverySlot" END,
           eta = CASE WHEN "pData" ? 'eta' THEN "vRec".eta ELSE t.eta END,
           "totalQty" = CASE WHEN "pData" ? 'totalQty' THEN "vRec"."totalQty" ELSE t."totalQty" END,
           "dispatchedAt" = CASE WHEN "pData" ? 'dispatchedAt' THEN "vRec"."dispatchedAt" ELSE t."dispatchedAt" END,
           "deliveredAt" = CASE WHEN "pData" ? 'deliveredAt' THEN "vRec"."deliveredAt" ELSE t."deliveredAt" END,
           "receivedBy" = CASE WHEN "pData" ? 'receivedBy' THEN "vRec"."receivedBy" ELSE t."receivedBy" END,
           "invoiceId" = CASE WHEN "pData" ? 'invoiceId' THEN "vRec"."invoiceId" ELSE t."invoiceId" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."DeliveryChallans" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'DeliveryChallans %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'DeliveryChallans % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."DeliveryChallanLines"
     WHERE "tenantId" = "vTenant" AND "deliveryChallanId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1DeliveryChallanLines" := jsonb_populate_record(NULL::"Sales"."DeliveryChallanLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1DeliveryChallanLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."DeliveryChallanLines" t
           SET "salesOrderLineId" = CASE WHEN "vE1" ? 'salesOrderLineId' THEN "vC1DeliveryChallanLines"."salesOrderLineId" ELSE t."salesOrderLineId" END,
               "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1DeliveryChallanLines"."itemId" ELSE t."itemId" END,
               "batchId" = CASE WHEN "vE1" ? 'batchId' THEN "vC1DeliveryChallanLines"."batchId" ELSE t."batchId" END,
               "orderedQty" = CASE WHEN "vE1" ? 'orderedQty' THEN "vC1DeliveryChallanLines"."orderedQty" ELSE t."orderedQty" END,
               "previouslyDeliveredQty" = CASE WHEN "vE1" ? 'previouslyDeliveredQty' THEN "vC1DeliveryChallanLines"."previouslyDeliveredQty" ELSE t."previouslyDeliveredQty" END,
               "qtyCtn" = CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1DeliveryChallanLines"."qtyCtn" ELSE t."qtyCtn" END,
               "qtyLoose" = CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1DeliveryChallanLines"."qtyLoose" ELSE t."qtyLoose" END,
               "ctnFactor" = CASE WHEN "vE1" ? 'ctnFactor' THEN "vC1DeliveryChallanLines"."ctnFactor" ELSE t."ctnFactor" END,
               "baseQty" = CASE WHEN "vE1" ? 'baseQty' THEN "vC1DeliveryChallanLines"."baseQty" ELSE t."baseQty" END,
               "unitCost" = CASE WHEN "vE1" ? 'unitCost' THEN "vC1DeliveryChallanLines"."unitCost" ELSE t."unitCost" END,
               "costAmount" = CASE WHEN "vE1" ? 'costAmount' THEN "vC1DeliveryChallanLines"."costAmount" ELSE t."costAmount" END,
               "lineNo" = "vC1DeliveryChallanLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."deliveryChallanId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'DeliveryChallanLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."DeliveryChallanLines" ("deliveryChallanId", "tenantId", "lineNo", "salesOrderLineId", "itemId", "batchId", "orderedQty", "previouslyDeliveredQty", "qtyCtn", "qtyLoose", "ctnFactor", "baseQty", "unitCost", "costAmount")
        VALUES ("vRet", "vTenant", "vC1DeliveryChallanLines"."lineNo", CASE WHEN "vE1" ? 'salesOrderLineId' THEN "vC1DeliveryChallanLines"."salesOrderLineId" ELSE NULL END, CASE WHEN "vE1" ? 'itemId' THEN "vC1DeliveryChallanLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'batchId' THEN "vC1DeliveryChallanLines"."batchId" ELSE NULL END, CASE WHEN "vE1" ? 'orderedQty' THEN "vC1DeliveryChallanLines"."orderedQty" ELSE NULL END, CASE WHEN "vE1" ? 'previouslyDeliveredQty' THEN "vC1DeliveryChallanLines"."previouslyDeliveredQty" ELSE 0 END, CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1DeliveryChallanLines"."qtyCtn" ELSE 0 END, CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1DeliveryChallanLines"."qtyLoose" ELSE 0 END, CASE WHEN "vE1" ? 'ctnFactor' THEN "vC1DeliveryChallanLines"."ctnFactor" ELSE 1 END, CASE WHEN "vE1" ? 'baseQty' THEN "vC1DeliveryChallanLines"."baseQty" ELSE NULL END, CASE WHEN "vE1" ? 'unitCost' THEN "vC1DeliveryChallanLines"."unitCost" ELSE NULL END, CASE WHEN "vE1" ? 'costAmount' THEN "vC1DeliveryChallanLines"."costAmount" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."deliveryChallanAddUpdate"(jsonb) IS 'Save (insert or update) one DeliveryChallans record with its lines.';

-- DeliveryChallans: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Sales"."getDeliveryChallanInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('deliverySlotLabel', "Lookups"."getLookupLabel"('DeliverySlot', t."deliverySlot") ->> 'label', 'deliverySlotTone', "Lookups"."getLookupLabel"('DeliverySlot', t."deliverySlot") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('DeliveryChallanStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('DeliveryChallanStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Sales"."DeliveryChallanLines" c1 WHERE c1."deliveryChallanId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Sales"."DeliveryChallans" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getDeliveryChallanInfo"(uuid) IS 'Read one DeliveryChallans record (getter for its screens).';

-- DeliveryChallans: Cancel (status -> CANCELLED); allowed from PACKED, DISPATCHED, DELIVERED, INVOICED
CREATE OR REPLACE FUNCTION "Sales"."deliveryChallanCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Sales"."DeliveryChallans";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."DeliveryChallans" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DeliveryChallans % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PACKED', 'DISPATCHED', 'DELIVERED', 'INVOICED') THEN
    RAISE EXCEPTION 'DeliveryChallans %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Sales"."deliveryChallanCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Sales"."deliveryChallanCancelEntries"') USING "pId";
  END IF;
  UPDATE "Sales"."DeliveryChallans" t SET status = 'CANCELLED', "cancelledAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- DeliveryChallans: Dispatch (status -> DISPATCHED); allowed from PACKED
CREATE OR REPLACE FUNCTION "Sales"."deliveryChallanDispatch"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Sales"."DeliveryChallans";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."DeliveryChallans" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DeliveryChallans % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'DISPATCHED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PACKED') THEN
    RAISE EXCEPTION 'DeliveryChallans %: cannot dispatch from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Sales"."deliveryChallanDispatchEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Sales"."deliveryChallanDispatchEntries"') USING "pId";
  END IF;
  UPDATE "Sales"."DeliveryChallans" t SET status = 'DISPATCHED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- DeliveryChallans: Deliver (status -> DELIVERED); allowed from DISPATCHED
CREATE OR REPLACE FUNCTION "Sales"."deliveryChallanDeliver"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Sales"."DeliveryChallans";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."DeliveryChallans" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DeliveryChallans % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'DELIVERED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DISPATCHED') THEN
    RAISE EXCEPTION 'DeliveryChallans %: cannot deliver from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Sales"."deliveryChallanDeliverEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Sales"."deliveryChallanDeliverEntries"') USING "pId";
  END IF;
  UPDATE "Sales"."DeliveryChallans" t SET status = 'DELIVERED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- SalesReturns: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Sales"."salesReturnAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."SalesReturns";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1SalesReturnLines" "Sales"."SalesReturnLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."SalesReturns", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('SR', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Sales"."SalesReturns" ("tenantId", "docNo", "docDate", "returnType", "customerId", "invoiceId", "branchId", "warehouseId", "bookerEmployeeId", "deliverymanEmployeeId", remarks, "totalItems", "totalQty", "grossAmount", "discountAmount", "valueAmount", "taxAmount", "totalAmount", "creditNoteId", "replacementInvoiceId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'returnType' THEN "vRec"."returnType" ELSE 'AGAINST_INVOICE' END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'invoiceId' THEN "vRec"."invoiceId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'bookerEmployeeId' THEN "vRec"."bookerEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'deliverymanEmployeeId' THEN "vRec"."deliverymanEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END, CASE WHEN "pData" ? 'totalItems' THEN "vRec"."totalItems" ELSE 0 END, CASE WHEN "pData" ? 'totalQty' THEN "vRec"."totalQty" ELSE 0 END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE 0 END, CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE 0 END, CASE WHEN "pData" ? 'valueAmount' THEN "vRec"."valueAmount" ELSE 0 END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE 0 END, CASE WHEN "pData" ? 'creditNoteId' THEN "vRec"."creditNoteId" ELSE NULL END, CASE WHEN "pData" ? 'replacementInvoiceId' THEN "vRec"."replacementInvoiceId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Sales"."SalesReturns" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'SalesReturns: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Sales"."SalesReturns" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "returnType" = CASE WHEN "pData" ? 'returnType' THEN "vRec"."returnType" ELSE t."returnType" END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           "invoiceId" = CASE WHEN "pData" ? 'invoiceId' THEN "vRec"."invoiceId" ELSE t."invoiceId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "bookerEmployeeId" = CASE WHEN "pData" ? 'bookerEmployeeId' THEN "vRec"."bookerEmployeeId" ELSE t."bookerEmployeeId" END,
           "deliverymanEmployeeId" = CASE WHEN "pData" ? 'deliverymanEmployeeId' THEN "vRec"."deliverymanEmployeeId" ELSE t."deliverymanEmployeeId" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END,
           "totalItems" = CASE WHEN "pData" ? 'totalItems' THEN "vRec"."totalItems" ELSE t."totalItems" END,
           "totalQty" = CASE WHEN "pData" ? 'totalQty' THEN "vRec"."totalQty" ELSE t."totalQty" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "discountAmount" = CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE t."discountAmount" END,
           "valueAmount" = CASE WHEN "pData" ? 'valueAmount' THEN "vRec"."valueAmount" ELSE t."valueAmount" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "totalAmount" = CASE WHEN "pData" ? 'totalAmount' THEN "vRec"."totalAmount" ELSE t."totalAmount" END,
           "creditNoteId" = CASE WHEN "pData" ? 'creditNoteId' THEN "vRec"."creditNoteId" ELSE t."creditNoteId" END,
           "replacementInvoiceId" = CASE WHEN "pData" ? 'replacementInvoiceId' THEN "vRec"."replacementInvoiceId" ELSE t."replacementInvoiceId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."SalesReturns" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'SalesReturns %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SalesReturns % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."SalesReturnLines"
     WHERE "tenantId" = "vTenant" AND "salesReturnId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1SalesReturnLines" := jsonb_populate_record(NULL::"Sales"."SalesReturnLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1SalesReturnLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."SalesReturnLines" t
           SET "invoiceLineId" = CASE WHEN "vE1" ? 'invoiceLineId' THEN "vC1SalesReturnLines"."invoiceLineId" ELSE t."invoiceLineId" END,
               "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1SalesReturnLines"."itemId" ELSE t."itemId" END,
               "packLabel" = CASE WHEN "vE1" ? 'packLabel' THEN "vC1SalesReturnLines"."packLabel" ELSE t."packLabel" END,
               "batchId" = CASE WHEN "vE1" ? 'batchId' THEN "vC1SalesReturnLines"."batchId" ELSE t."batchId" END,
               "expiryDate" = CASE WHEN "vE1" ? 'expiryDate' THEN "vC1SalesReturnLines"."expiryDate" ELSE t."expiryDate" END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1SalesReturnLines".rate ELSE t.rate END,
               "soldQty" = CASE WHEN "vE1" ? 'soldQty' THEN "vC1SalesReturnLines"."soldQty" ELSE t."soldQty" END,
               "qtyCtn" = CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1SalesReturnLines"."qtyCtn" ELSE t."qtyCtn" END,
               "qtyLoose" = CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1SalesReturnLines"."qtyLoose" ELSE t."qtyLoose" END,
               "ctnFactor" = CASE WHEN "vE1" ? 'ctnFactor' THEN "vC1SalesReturnLines"."ctnFactor" ELSE t."ctnFactor" END,
               "baseQty" = CASE WHEN "vE1" ? 'baseQty' THEN "vC1SalesReturnLines"."baseQty" ELSE t."baseQty" END,
               "grossAmount" = CASE WHEN "vE1" ? 'grossAmount' THEN "vC1SalesReturnLines"."grossAmount" ELSE t."grossAmount" END,
               "discountPct" = CASE WHEN "vE1" ? 'discountPct' THEN "vC1SalesReturnLines"."discountPct" ELSE t."discountPct" END,
               "discountAmount" = CASE WHEN "vE1" ? 'discountAmount' THEN "vC1SalesReturnLines"."discountAmount" ELSE t."discountAmount" END,
               "valueAmount" = CASE WHEN "vE1" ? 'valueAmount' THEN "vC1SalesReturnLines"."valueAmount" ELSE t."valueAmount" END,
               "taxCodeId" = CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1SalesReturnLines"."taxCodeId" ELSE t."taxCodeId" END,
               "taxRate" = CASE WHEN "vE1" ? 'taxRate' THEN "vC1SalesReturnLines"."taxRate" ELSE t."taxRate" END,
               "taxAmount" = CASE WHEN "vE1" ? 'taxAmount' THEN "vC1SalesReturnLines"."taxAmount" ELSE t."taxAmount" END,
               "totalAmount" = CASE WHEN "vE1" ? 'totalAmount' THEN "vC1SalesReturnLines"."totalAmount" ELSE t."totalAmount" END,
               reason = CASE WHEN "vE1" ? 'reason' THEN "vC1SalesReturnLines".reason ELSE t.reason END,
               disposition = CASE WHEN "vE1" ? 'disposition' THEN "vC1SalesReturnLines".disposition ELSE t.disposition END,
               "unitCost" = CASE WHEN "vE1" ? 'unitCost' THEN "vC1SalesReturnLines"."unitCost" ELSE t."unitCost" END,
               "costAmount" = CASE WHEN "vE1" ? 'costAmount' THEN "vC1SalesReturnLines"."costAmount" ELSE t."costAmount" END,
               "lineNo" = "vC1SalesReturnLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."salesReturnId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SalesReturnLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."SalesReturnLines" ("salesReturnId", "tenantId", "lineNo", "invoiceLineId", "itemId", "packLabel", "batchId", "expiryDate", rate, "soldQty", "qtyCtn", "qtyLoose", "ctnFactor", "baseQty", "grossAmount", "discountPct", "discountAmount", "valueAmount", "taxCodeId", "taxRate", "taxAmount", "totalAmount", reason, disposition, "unitCost", "costAmount")
        VALUES ("vRet", "vTenant", "vC1SalesReturnLines"."lineNo", CASE WHEN "vE1" ? 'invoiceLineId' THEN "vC1SalesReturnLines"."invoiceLineId" ELSE NULL END, CASE WHEN "vE1" ? 'itemId' THEN "vC1SalesReturnLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'packLabel' THEN "vC1SalesReturnLines"."packLabel" ELSE NULL END, CASE WHEN "vE1" ? 'batchId' THEN "vC1SalesReturnLines"."batchId" ELSE NULL END, CASE WHEN "vE1" ? 'expiryDate' THEN "vC1SalesReturnLines"."expiryDate" ELSE NULL END, CASE WHEN "vE1" ? 'rate' THEN "vC1SalesReturnLines".rate ELSE NULL END, CASE WHEN "vE1" ? 'soldQty' THEN "vC1SalesReturnLines"."soldQty" ELSE NULL END, CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1SalesReturnLines"."qtyCtn" ELSE 0 END, CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1SalesReturnLines"."qtyLoose" ELSE 0 END, CASE WHEN "vE1" ? 'ctnFactor' THEN "vC1SalesReturnLines"."ctnFactor" ELSE 1 END, CASE WHEN "vE1" ? 'baseQty' THEN "vC1SalesReturnLines"."baseQty" ELSE NULL END, CASE WHEN "vE1" ? 'grossAmount' THEN "vC1SalesReturnLines"."grossAmount" ELSE NULL END, CASE WHEN "vE1" ? 'discountPct' THEN "vC1SalesReturnLines"."discountPct" ELSE 0 END, CASE WHEN "vE1" ? 'discountAmount' THEN "vC1SalesReturnLines"."discountAmount" ELSE 0 END, CASE WHEN "vE1" ? 'valueAmount' THEN "vC1SalesReturnLines"."valueAmount" ELSE NULL END, CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1SalesReturnLines"."taxCodeId" ELSE NULL END, CASE WHEN "vE1" ? 'taxRate' THEN "vC1SalesReturnLines"."taxRate" ELSE 0 END, CASE WHEN "vE1" ? 'taxAmount' THEN "vC1SalesReturnLines"."taxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'totalAmount' THEN "vC1SalesReturnLines"."totalAmount" ELSE NULL END, CASE WHEN "vE1" ? 'reason' THEN "vC1SalesReturnLines".reason ELSE NULL END, CASE WHEN "vE1" ? 'disposition' THEN "vC1SalesReturnLines".disposition ELSE NULL END, CASE WHEN "vE1" ? 'unitCost' THEN "vC1SalesReturnLines"."unitCost" ELSE NULL END, CASE WHEN "vE1" ? 'costAmount' THEN "vC1SalesReturnLines"."costAmount" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."salesReturnAddUpdate"(jsonb) IS 'Save (insert or update) one SalesReturns record with its lines.';

-- SalesReturns: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Sales"."getSalesReturnInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('returnTypeLabel', "Lookups"."getLookupLabel"('SalesReturnType', t."returnType") ->> 'label', 'returnTypeTone', "Lookups"."getLookupLabel"('SalesReturnType', t."returnType") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('DraftPostedCancelledStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('DraftPostedCancelledStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Sales"."SalesReturnLines" c1 WHERE c1."salesReturnId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Sales"."SalesReturns" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getSalesReturnInfo"(uuid) IS 'Read one SalesReturns record (getter for its screens).';

-- SalesReturns: Post (status -> POSTED); allowed from DRAFT
CREATE OR REPLACE FUNCTION "Sales"."salesReturnPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Sales"."SalesReturns";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."SalesReturns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SalesReturns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'SalesReturns %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Sales"."salesReturnPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Sales"."salesReturnPostEntries"') USING "pId";
  END IF;
  UPDATE "Sales"."SalesReturns" t SET status = 'POSTED', "postedAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- SalesReturns: Cancel (status -> CANCELLED); allowed from DRAFT, POSTED
CREATE OR REPLACE FUNCTION "Sales"."salesReturnCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Sales"."SalesReturns";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."SalesReturns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SalesReturns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'POSTED') THEN
    RAISE EXCEPTION 'SalesReturns %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Sales"."salesReturnCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Sales"."salesReturnCancelEntries"') USING "pId";
  END IF;
  UPDATE "Sales"."SalesReturns" t SET status = 'CANCELLED', "cancelledAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- PosShifts: insert (no "id") or update (with "id"); child arrays: denominations
CREATE OR REPLACE FUNCTION "Sales"."posShiftAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."PosShifts";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1PosShiftDenominations" "Sales"."PosShiftDenominations";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."PosShifts", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Sales"."PosShifts" ("tenantId", "zReportNo", "branchId", "warehouseId", "counterName", "cashierUserId", "cashAccountId", "openedAt", "closedAt", "openingFloat", "cashSales", "cardSales", "walletSales", "creditSales", "billsCount", "countedCash", "zPrintedAt", remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'zReportNo' THEN "vRec"."zReportNo" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'counterName' THEN "vRec"."counterName" ELSE NULL END, CASE WHEN "pData" ? 'cashierUserId' THEN "vRec"."cashierUserId" ELSE NULL END, CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE NULL END, CASE WHEN "pData" ? 'openedAt' THEN "vRec"."openedAt" ELSE now() END, CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE NULL END, CASE WHEN "pData" ? 'openingFloat' THEN "vRec"."openingFloat" ELSE 0 END, CASE WHEN "pData" ? 'cashSales' THEN "vRec"."cashSales" ELSE 0 END, CASE WHEN "pData" ? 'cardSales' THEN "vRec"."cardSales" ELSE 0 END, CASE WHEN "pData" ? 'walletSales' THEN "vRec"."walletSales" ELSE 0 END, CASE WHEN "pData" ? 'creditSales' THEN "vRec"."creditSales" ELSE 0 END, CASE WHEN "pData" ? 'billsCount' THEN "vRec"."billsCount" ELSE 0 END, CASE WHEN "pData" ? 'countedCash' THEN "vRec"."countedCash" ELSE NULL END, CASE WHEN "pData" ? 'zPrintedAt' THEN "vRec"."zPrintedAt" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Sales"."PosShifts" t
       SET "zReportNo" = CASE WHEN "pData" ? 'zReportNo' THEN "vRec"."zReportNo" ELSE t."zReportNo" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "counterName" = CASE WHEN "pData" ? 'counterName' THEN "vRec"."counterName" ELSE t."counterName" END,
           "cashierUserId" = CASE WHEN "pData" ? 'cashierUserId' THEN "vRec"."cashierUserId" ELSE t."cashierUserId" END,
           "cashAccountId" = CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE t."cashAccountId" END,
           "openedAt" = CASE WHEN "pData" ? 'openedAt' THEN "vRec"."openedAt" ELSE t."openedAt" END,
           "closedAt" = CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE t."closedAt" END,
           "openingFloat" = CASE WHEN "pData" ? 'openingFloat' THEN "vRec"."openingFloat" ELSE t."openingFloat" END,
           "cashSales" = CASE WHEN "pData" ? 'cashSales' THEN "vRec"."cashSales" ELSE t."cashSales" END,
           "cardSales" = CASE WHEN "pData" ? 'cardSales' THEN "vRec"."cardSales" ELSE t."cardSales" END,
           "walletSales" = CASE WHEN "pData" ? 'walletSales' THEN "vRec"."walletSales" ELSE t."walletSales" END,
           "creditSales" = CASE WHEN "pData" ? 'creditSales' THEN "vRec"."creditSales" ELSE t."creditSales" END,
           "billsCount" = CASE WHEN "pData" ? 'billsCount' THEN "vRec"."billsCount" ELSE t."billsCount" END,
           "countedCash" = CASE WHEN "pData" ? 'countedCash' THEN "vRec"."countedCash" ELSE t."countedCash" END,
           "zPrintedAt" = CASE WHEN "pData" ? 'zPrintedAt' THEN "vRec"."zPrintedAt" ELSE t."zPrintedAt" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."PosShifts" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PosShifts %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PosShifts % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'denominations' THEN
    -- denominations: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."PosShiftDenominations"
     WHERE "tenantId" = "vTenant" AND "posShiftId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'denominations') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'denominations') WITH ORDINALITY t(x, n) LOOP
      "vC1PosShiftDenominations" := jsonb_populate_record(NULL::"Sales"."PosShiftDenominations", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."PosShiftDenominations" t
           SET denomination = CASE WHEN "vE1" ? 'denomination' THEN "vC1PosShiftDenominations".denomination ELSE t.denomination END,
               "noteCount" = CASE WHEN "vE1" ? 'noteCount' THEN "vC1PosShiftDenominations"."noteCount" ELSE t."noteCount" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."posShiftId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PosShiftDenominations: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."PosShiftDenominations" ("posShiftId", "tenantId", denomination, "noteCount")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'denomination' THEN "vC1PosShiftDenominations".denomination ELSE NULL END, CASE WHEN "vE1" ? 'noteCount' THEN "vC1PosShiftDenominations"."noteCount" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."posShiftAddUpdate"(jsonb) IS 'Save (insert or update) one PosShifts record with its denominations.';

-- PosShifts: one record as JSON (camelCase keys), with lookup labels and denominations
CREATE OR REPLACE FUNCTION "Sales"."getPosShiftInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('OpenClosedStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('OpenClosedStatus', t.status) ->> 'tone') ||
         jsonb_build_object('denominations', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Sales"."PosShiftDenominations" c1 WHERE c1."posShiftId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Sales"."PosShifts" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getPosShiftInfo"(uuid) IS 'Read one PosShifts record (getter for its screens).';

-- PosShifts: Close (status -> CLOSED); allowed from OPEN
CREATE OR REPLACE FUNCTION "Sales"."posShiftClose"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Sales"."PosShifts";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."PosShifts" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PosShifts % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CLOSED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('OPEN') THEN
    RAISE EXCEPTION 'PosShifts %: cannot close from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Sales"."posShiftCloseEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Sales"."posShiftCloseEntries"') USING "pId";
  END IF;
  UPDATE "Sales"."PosShifts" t SET status = 'CLOSED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- CreditOverrides: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Sales"."creditOverrideAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."CreditOverrides";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."CreditOverrides", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('CO', current_date, NULL);
    END IF;
    INSERT INTO "Sales"."CreditOverrides" ("tenantId", "docNo", "customerId", "overrideType", "invoiceId", "salesOrderId", "documentAmount", "creditLimitSnapshot", "balanceSnapshot", "exposureAfter", "overdueSnapshot", "exceedByAmount", "tempLimitAmount", "validUntil", "requestReason", "conditionComments", "approvalMethod", "requestedByUserId", "requestedAt", "approverUserId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'overrideType' THEN "vRec"."overrideType" ELSE NULL END, CASE WHEN "pData" ? 'invoiceId' THEN "vRec"."invoiceId" ELSE NULL END, CASE WHEN "pData" ? 'salesOrderId' THEN "vRec"."salesOrderId" ELSE NULL END, CASE WHEN "pData" ? 'documentAmount' THEN "vRec"."documentAmount" ELSE NULL END, CASE WHEN "pData" ? 'creditLimitSnapshot' THEN "vRec"."creditLimitSnapshot" ELSE NULL END, CASE WHEN "pData" ? 'balanceSnapshot' THEN "vRec"."balanceSnapshot" ELSE NULL END, CASE WHEN "pData" ? 'exposureAfter' THEN "vRec"."exposureAfter" ELSE NULL END, CASE WHEN "pData" ? 'overdueSnapshot' THEN "vRec"."overdueSnapshot" ELSE 0 END, CASE WHEN "pData" ? 'exceedByAmount' THEN "vRec"."exceedByAmount" ELSE NULL END, CASE WHEN "pData" ? 'tempLimitAmount' THEN "vRec"."tempLimitAmount" ELSE NULL END, CASE WHEN "pData" ? 'validUntil' THEN "vRec"."validUntil" ELSE NULL END, CASE WHEN "pData" ? 'requestReason' THEN "vRec"."requestReason" ELSE NULL END, CASE WHEN "pData" ? 'conditionComments' THEN "vRec"."conditionComments" ELSE NULL END, CASE WHEN "pData" ? 'approvalMethod' THEN "vRec"."approvalMethod" ELSE 'APPROVAL' END, CASE WHEN "pData" ? 'requestedByUserId' THEN "vRec"."requestedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'requestedAt' THEN "vRec"."requestedAt" ELSE now() END, CASE WHEN "pData" ? 'approverUserId' THEN "vRec"."approverUserId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Sales"."CreditOverrides" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           "overrideType" = CASE WHEN "pData" ? 'overrideType' THEN "vRec"."overrideType" ELSE t."overrideType" END,
           "invoiceId" = CASE WHEN "pData" ? 'invoiceId' THEN "vRec"."invoiceId" ELSE t."invoiceId" END,
           "salesOrderId" = CASE WHEN "pData" ? 'salesOrderId' THEN "vRec"."salesOrderId" ELSE t."salesOrderId" END,
           "documentAmount" = CASE WHEN "pData" ? 'documentAmount' THEN "vRec"."documentAmount" ELSE t."documentAmount" END,
           "creditLimitSnapshot" = CASE WHEN "pData" ? 'creditLimitSnapshot' THEN "vRec"."creditLimitSnapshot" ELSE t."creditLimitSnapshot" END,
           "balanceSnapshot" = CASE WHEN "pData" ? 'balanceSnapshot' THEN "vRec"."balanceSnapshot" ELSE t."balanceSnapshot" END,
           "exposureAfter" = CASE WHEN "pData" ? 'exposureAfter' THEN "vRec"."exposureAfter" ELSE t."exposureAfter" END,
           "overdueSnapshot" = CASE WHEN "pData" ? 'overdueSnapshot' THEN "vRec"."overdueSnapshot" ELSE t."overdueSnapshot" END,
           "exceedByAmount" = CASE WHEN "pData" ? 'exceedByAmount' THEN "vRec"."exceedByAmount" ELSE t."exceedByAmount" END,
           "tempLimitAmount" = CASE WHEN "pData" ? 'tempLimitAmount' THEN "vRec"."tempLimitAmount" ELSE t."tempLimitAmount" END,
           "validUntil" = CASE WHEN "pData" ? 'validUntil' THEN "vRec"."validUntil" ELSE t."validUntil" END,
           "requestReason" = CASE WHEN "pData" ? 'requestReason' THEN "vRec"."requestReason" ELSE t."requestReason" END,
           "conditionComments" = CASE WHEN "pData" ? 'conditionComments' THEN "vRec"."conditionComments" ELSE t."conditionComments" END,
           "approvalMethod" = CASE WHEN "pData" ? 'approvalMethod' THEN "vRec"."approvalMethod" ELSE t."approvalMethod" END,
           "requestedByUserId" = CASE WHEN "pData" ? 'requestedByUserId' THEN "vRec"."requestedByUserId" ELSE t."requestedByUserId" END,
           "requestedAt" = CASE WHEN "pData" ? 'requestedAt' THEN "vRec"."requestedAt" ELSE t."requestedAt" END,
           "approverUserId" = CASE WHEN "pData" ? 'approverUserId' THEN "vRec"."approverUserId" ELSE t."approverUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."CreditOverrides" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CreditOverrides %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CreditOverrides % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."creditOverrideAddUpdate"(jsonb) IS 'Save (insert or update) one CreditOverrides record.';

-- CreditOverrides: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Sales"."getCreditOverrideInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('overrideTypeLabel', "Lookups"."getLookupLabel"('OverrideType', t."overrideType") ->> 'label', 'overrideTypeTone', "Lookups"."getLookupLabel"('OverrideType', t."overrideType") ->> 'tone', 'approvalMethodLabel', "Lookups"."getLookupLabel"('ApprovalMethod', t."approvalMethod") ->> 'label', 'approvalMethodTone', "Lookups"."getLookupLabel"('ApprovalMethod', t."approvalMethod") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('CreditOverrideStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('CreditOverrideStatus', t.status) ->> 'tone')
    FROM "Sales"."CreditOverrides" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getCreditOverrideInfo"(uuid) IS 'Read one CreditOverrides record (getter for its screens).';

-- CreditOverrides: Approve (status -> APPROVED); allowed from PENDING
CREATE OR REPLACE FUNCTION "Sales"."creditOverrideApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Sales"."CreditOverrides";
BEGIN
  SELECT * INTO "vRow" FROM "Sales"."CreditOverrides" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CreditOverrides % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING') THEN
    RAISE EXCEPTION 'CreditOverrides %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'CreditOverrides: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Sales"."creditOverrideApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Sales"."creditOverrideApproveEntries"') USING "pId";
  END IF;
  UPDATE "Sales"."CreditOverrides" t SET status = 'APPROVED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- PaymentReminderTemplates: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Sales"."paymentReminderTemplateAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."PaymentReminderTemplates";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."PaymentReminderTemplates", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Sales"."PaymentReminderTemplates" ("tenantId", code, name, "emailSubject", "bodyEn", "bodyUr", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'emailSubject' THEN "vRec"."emailSubject" ELSE NULL END, CASE WHEN "pData" ? 'bodyEn' THEN "vRec"."bodyEn" ELSE NULL END, CASE WHEN "pData" ? 'bodyUr' THEN "vRec"."bodyUr" ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Sales"."PaymentReminderTemplates" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "emailSubject" = CASE WHEN "pData" ? 'emailSubject' THEN "vRec"."emailSubject" ELSE t."emailSubject" END,
           "bodyEn" = CASE WHEN "pData" ? 'bodyEn' THEN "vRec"."bodyEn" ELSE t."bodyEn" END,
           "bodyUr" = CASE WHEN "pData" ? 'bodyUr' THEN "vRec"."bodyUr" ELSE t."bodyUr" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."PaymentReminderTemplates" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PaymentReminderTemplates %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PaymentReminderTemplates % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."paymentReminderTemplateAddUpdate"(jsonb) IS 'Save (insert or update) one PaymentReminderTemplates record.';

-- PaymentReminderTemplates: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Sales"."getPaymentReminderTemplateInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "Sales"."PaymentReminderTemplates" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getPaymentReminderTemplateInfo"(uuid) IS 'Read one PaymentReminderTemplates record (getter for its screens).';

-- PaymentReminderRules: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Sales"."paymentReminderRuleAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."PaymentReminderRules";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."PaymentReminderRules", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Sales"."PaymentReminderRules" ("tenantId", name, "offsetDays", "dunningLevel", "sendWhatsapp", "sendSms", "sendEmail", "templateId", action, "attachStatement", escalate, "escalateToUserId", "applyCreditHold", "runTime", "isActive", "sentCount")
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'offsetDays' THEN "vRec"."offsetDays" ELSE NULL END, CASE WHEN "pData" ? 'dunningLevel' THEN "vRec"."dunningLevel" ELSE NULL END, CASE WHEN "pData" ? 'sendWhatsapp' THEN "vRec"."sendWhatsapp" ELSE FALSE END, CASE WHEN "pData" ? 'sendSms' THEN "vRec"."sendSms" ELSE FALSE END, CASE WHEN "pData" ? 'sendEmail' THEN "vRec"."sendEmail" ELSE TRUE END, CASE WHEN "pData" ? 'templateId' THEN "vRec"."templateId" ELSE NULL END, CASE WHEN "pData" ? 'action' THEN "vRec".action ELSE 'MESSAGE' END, CASE WHEN "pData" ? 'attachStatement' THEN "vRec"."attachStatement" ELSE FALSE END, CASE WHEN "pData" ? 'escalate' THEN "vRec".escalate ELSE FALSE END, CASE WHEN "pData" ? 'escalateToUserId' THEN "vRec"."escalateToUserId" ELSE NULL END, CASE WHEN "pData" ? 'applyCreditHold' THEN "vRec"."applyCreditHold" ELSE FALSE END, CASE WHEN "pData" ? 'runTime' THEN "vRec"."runTime" ELSE '09:00' END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END, CASE WHEN "pData" ? 'sentCount' THEN "vRec"."sentCount" ELSE 0 END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Sales"."PaymentReminderRules" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "offsetDays" = CASE WHEN "pData" ? 'offsetDays' THEN "vRec"."offsetDays" ELSE t."offsetDays" END,
           "dunningLevel" = CASE WHEN "pData" ? 'dunningLevel' THEN "vRec"."dunningLevel" ELSE t."dunningLevel" END,
           "sendWhatsapp" = CASE WHEN "pData" ? 'sendWhatsapp' THEN "vRec"."sendWhatsapp" ELSE t."sendWhatsapp" END,
           "sendSms" = CASE WHEN "pData" ? 'sendSms' THEN "vRec"."sendSms" ELSE t."sendSms" END,
           "sendEmail" = CASE WHEN "pData" ? 'sendEmail' THEN "vRec"."sendEmail" ELSE t."sendEmail" END,
           "templateId" = CASE WHEN "pData" ? 'templateId' THEN "vRec"."templateId" ELSE t."templateId" END,
           action = CASE WHEN "pData" ? 'action' THEN "vRec".action ELSE t.action END,
           "attachStatement" = CASE WHEN "pData" ? 'attachStatement' THEN "vRec"."attachStatement" ELSE t."attachStatement" END,
           escalate = CASE WHEN "pData" ? 'escalate' THEN "vRec".escalate ELSE t.escalate END,
           "escalateToUserId" = CASE WHEN "pData" ? 'escalateToUserId' THEN "vRec"."escalateToUserId" ELSE t."escalateToUserId" END,
           "applyCreditHold" = CASE WHEN "pData" ? 'applyCreditHold' THEN "vRec"."applyCreditHold" ELSE t."applyCreditHold" END,
           "runTime" = CASE WHEN "pData" ? 'runTime' THEN "vRec"."runTime" ELSE t."runTime" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END,
           "sentCount" = CASE WHEN "pData" ? 'sentCount' THEN "vRec"."sentCount" ELSE t."sentCount" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."PaymentReminderRules" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PaymentReminderRules %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PaymentReminderRules % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."paymentReminderRuleAddUpdate"(jsonb) IS 'Save (insert or update) one PaymentReminderRules record.';

-- PaymentReminderRules: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Sales"."getPaymentReminderRuleInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('dunningLevelLabel', "Lookups"."getLookupLabel"('DunningLevel', t."dunningLevel") ->> 'label', 'dunningLevelTone', "Lookups"."getLookupLabel"('DunningLevel', t."dunningLevel") ->> 'tone', 'actionLabel', "Lookups"."getLookupLabel"('PaymentReminderRuleAction', t.action) ->> 'label', 'actionTone', "Lookups"."getLookupLabel"('PaymentReminderRuleAction', t.action) ->> 'tone')
    FROM "Sales"."PaymentReminderRules" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getPaymentReminderRuleInfo"(uuid) IS 'Read one PaymentReminderRules record (getter for its screens).';

-- RecurringInvoices: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Sales"."recurringInvoiceAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Sales"."RecurringInvoices";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1RecurringInvoiceLines" "Sales"."RecurringInvoiceLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Sales"."RecurringInvoices", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('RP', current_date, "vRec"."branchId");
    END IF;
    INSERT INTO "Sales"."RecurringInvoices" ("tenantId", "docNo", "customerId", name, "branchId", "warehouseId", "paymentTerms", frequency, "everyDays", "startDate", "nextRunDate", "runTime", "endMode", "endDate", "maxRuns", "runsCount", amount, "autoSend", "sendEmail", "sendWhatsapp", "saveAsDraft", status, "lastRunAt", "lastInvoiceId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'paymentTerms' THEN "vRec"."paymentTerms" ELSE 'NET_30' END, CASE WHEN "pData" ? 'frequency' THEN "vRec".frequency ELSE NULL END, CASE WHEN "pData" ? 'everyDays' THEN "vRec"."everyDays" ELSE NULL END, CASE WHEN "pData" ? 'startDate' THEN "vRec"."startDate" ELSE NULL END, CASE WHEN "pData" ? 'nextRunDate' THEN "vRec"."nextRunDate" ELSE NULL END, CASE WHEN "pData" ? 'runTime' THEN "vRec"."runTime" ELSE '06:00' END, CASE WHEN "pData" ? 'endMode' THEN "vRec"."endMode" ELSE 'NEVER' END, CASE WHEN "pData" ? 'endDate' THEN "vRec"."endDate" ELSE NULL END, CASE WHEN "pData" ? 'maxRuns' THEN "vRec"."maxRuns" ELSE NULL END, CASE WHEN "pData" ? 'runsCount' THEN "vRec"."runsCount" ELSE 0 END, CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE 0 END, CASE WHEN "pData" ? 'autoSend' THEN "vRec"."autoSend" ELSE TRUE END, CASE WHEN "pData" ? 'sendEmail' THEN "vRec"."sendEmail" ELSE TRUE END, CASE WHEN "pData" ? 'sendWhatsapp' THEN "vRec"."sendWhatsapp" ELSE FALSE END, CASE WHEN "pData" ? 'saveAsDraft' THEN "vRec"."saveAsDraft" ELSE FALSE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'lastRunAt' THEN "vRec"."lastRunAt" ELSE NULL END, CASE WHEN "pData" ? 'lastInvoiceId' THEN "vRec"."lastInvoiceId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Sales"."RecurringInvoices" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "paymentTerms" = CASE WHEN "pData" ? 'paymentTerms' THEN "vRec"."paymentTerms" ELSE t."paymentTerms" END,
           frequency = CASE WHEN "pData" ? 'frequency' THEN "vRec".frequency ELSE t.frequency END,
           "everyDays" = CASE WHEN "pData" ? 'everyDays' THEN "vRec"."everyDays" ELSE t."everyDays" END,
           "startDate" = CASE WHEN "pData" ? 'startDate' THEN "vRec"."startDate" ELSE t."startDate" END,
           "nextRunDate" = CASE WHEN "pData" ? 'nextRunDate' THEN "vRec"."nextRunDate" ELSE t."nextRunDate" END,
           "runTime" = CASE WHEN "pData" ? 'runTime' THEN "vRec"."runTime" ELSE t."runTime" END,
           "endMode" = CASE WHEN "pData" ? 'endMode' THEN "vRec"."endMode" ELSE t."endMode" END,
           "endDate" = CASE WHEN "pData" ? 'endDate' THEN "vRec"."endDate" ELSE t."endDate" END,
           "maxRuns" = CASE WHEN "pData" ? 'maxRuns' THEN "vRec"."maxRuns" ELSE t."maxRuns" END,
           "runsCount" = CASE WHEN "pData" ? 'runsCount' THEN "vRec"."runsCount" ELSE t."runsCount" END,
           amount = CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE t.amount END,
           "autoSend" = CASE WHEN "pData" ? 'autoSend' THEN "vRec"."autoSend" ELSE t."autoSend" END,
           "sendEmail" = CASE WHEN "pData" ? 'sendEmail' THEN "vRec"."sendEmail" ELSE t."sendEmail" END,
           "sendWhatsapp" = CASE WHEN "pData" ? 'sendWhatsapp' THEN "vRec"."sendWhatsapp" ELSE t."sendWhatsapp" END,
           "saveAsDraft" = CASE WHEN "pData" ? 'saveAsDraft' THEN "vRec"."saveAsDraft" ELSE t."saveAsDraft" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "lastRunAt" = CASE WHEN "pData" ? 'lastRunAt' THEN "vRec"."lastRunAt" ELSE t."lastRunAt" END,
           "lastInvoiceId" = CASE WHEN "pData" ? 'lastInvoiceId' THEN "vRec"."lastInvoiceId" ELSE t."lastInvoiceId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Sales"."RecurringInvoices" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'RecurringInvoices %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'RecurringInvoices % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Sales"."RecurringInvoiceLines"
     WHERE "tenantId" = "vTenant" AND "recurringProfileId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1RecurringInvoiceLines" := jsonb_populate_record(NULL::"Sales"."RecurringInvoiceLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1RecurringInvoiceLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Sales"."RecurringInvoiceLines" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1RecurringInvoiceLines"."itemId" ELSE t."itemId" END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1RecurringInvoiceLines".description ELSE t.description END,
               "qtyCtn" = CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1RecurringInvoiceLines"."qtyCtn" ELSE t."qtyCtn" END,
               "qtyLoose" = CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1RecurringInvoiceLines"."qtyLoose" ELSE t."qtyLoose" END,
               "ctnFactor" = CASE WHEN "vE1" ? 'ctnFactor' THEN "vC1RecurringInvoiceLines"."ctnFactor" ELSE t."ctnFactor" END,
               "baseQty" = CASE WHEN "vE1" ? 'baseQty' THEN "vC1RecurringInvoiceLines"."baseQty" ELSE t."baseQty" END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1RecurringInvoiceLines".rate ELSE t.rate END,
               "useCurrentPrice" = CASE WHEN "vE1" ? 'useCurrentPrice' THEN "vC1RecurringInvoiceLines"."useCurrentPrice" ELSE t."useCurrentPrice" END,
               "taxCodeId" = CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1RecurringInvoiceLines"."taxCodeId" ELSE t."taxCodeId" END,
               "taxRate" = CASE WHEN "vE1" ? 'taxRate' THEN "vC1RecurringInvoiceLines"."taxRate" ELSE t."taxRate" END,
               "taxableAmount" = CASE WHEN "vE1" ? 'taxableAmount' THEN "vC1RecurringInvoiceLines"."taxableAmount" ELSE t."taxableAmount" END,
               "taxAmount" = CASE WHEN "vE1" ? 'taxAmount' THEN "vC1RecurringInvoiceLines"."taxAmount" ELSE t."taxAmount" END,
               "totalAmount" = CASE WHEN "vE1" ? 'totalAmount' THEN "vC1RecurringInvoiceLines"."totalAmount" ELSE t."totalAmount" END,
               "lineNo" = "vC1RecurringInvoiceLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."recurringProfileId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'RecurringInvoiceLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Sales"."RecurringInvoiceLines" ("recurringProfileId", "tenantId", "lineNo", "itemId", description, "qtyCtn", "qtyLoose", "ctnFactor", "baseQty", rate, "useCurrentPrice", "taxCodeId", "taxRate", "taxableAmount", "taxAmount", "totalAmount")
        VALUES ("vRet", "vTenant", "vC1RecurringInvoiceLines"."lineNo", CASE WHEN "vE1" ? 'itemId' THEN "vC1RecurringInvoiceLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1RecurringInvoiceLines".description ELSE NULL END, CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1RecurringInvoiceLines"."qtyCtn" ELSE 0 END, CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1RecurringInvoiceLines"."qtyLoose" ELSE 0 END, CASE WHEN "vE1" ? 'ctnFactor' THEN "vC1RecurringInvoiceLines"."ctnFactor" ELSE 1 END, CASE WHEN "vE1" ? 'baseQty' THEN "vC1RecurringInvoiceLines"."baseQty" ELSE NULL END, CASE WHEN "vE1" ? 'rate' THEN "vC1RecurringInvoiceLines".rate ELSE NULL END, CASE WHEN "vE1" ? 'useCurrentPrice' THEN "vC1RecurringInvoiceLines"."useCurrentPrice" ELSE TRUE END, CASE WHEN "vE1" ? 'taxCodeId' THEN "vC1RecurringInvoiceLines"."taxCodeId" ELSE NULL END, CASE WHEN "vE1" ? 'taxRate' THEN "vC1RecurringInvoiceLines"."taxRate" ELSE 0 END, CASE WHEN "vE1" ? 'taxableAmount' THEN "vC1RecurringInvoiceLines"."taxableAmount" ELSE NULL END, CASE WHEN "vE1" ? 'taxAmount' THEN "vC1RecurringInvoiceLines"."taxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'totalAmount' THEN "vC1RecurringInvoiceLines"."totalAmount" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Sales"."recurringInvoiceAddUpdate"(jsonb) IS 'Save (insert or update) one RecurringInvoices record with its lines.';

-- RecurringInvoices: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Sales"."getRecurringInvoiceInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('paymentTermsLabel', "Lookups"."getLookupLabel"('CustomerPaymentTerms', t."paymentTerms") ->> 'label', 'paymentTermsTone', "Lookups"."getLookupLabel"('CustomerPaymentTerms', t."paymentTerms") ->> 'tone', 'frequencyLabel', "Lookups"."getLookupLabel"('RecurringInvoiceFrequency', t.frequency) ->> 'label', 'frequencyTone', "Lookups"."getLookupLabel"('RecurringInvoiceFrequency', t.frequency) ->> 'tone', 'endModeLabel', "Lookups"."getLookupLabel"('RecurringInvoiceEndMode', t."endMode") ->> 'label', 'endModeTone', "Lookups"."getLookupLabel"('RecurringInvoiceEndMode', t."endMode") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('RecurringInvoiceStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('RecurringInvoiceStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Sales"."RecurringInvoiceLines" c1 WHERE c1."recurringProfileId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Sales"."RecurringInvoices" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Sales"."getRecurringInvoiceInfo"(uuid) IS 'Read one RecurringInvoices record (getter for its screens).';
