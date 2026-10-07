-- =============================================================================
-- Finsoft ERP (Full edition) — API: "Distribution"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- PriceTiers: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Distribution"."priceTierAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Distribution"."PriceTiers";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Distribution"."PriceTiers", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Distribution"."PriceTiers" ("tenantId", code, name, "rateFactor", "allocationRank", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'rateFactor' THEN "vRec"."rateFactor" ELSE NULL END, CASE WHEN "pData" ? 'allocationRank' THEN "vRec"."allocationRank" ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Distribution"."PriceTiers" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "rateFactor" = CASE WHEN "pData" ? 'rateFactor' THEN "vRec"."rateFactor" ELSE t."rateFactor" END,
           "allocationRank" = CASE WHEN "pData" ? 'allocationRank' THEN "vRec"."allocationRank" ELSE t."allocationRank" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Distribution"."PriceTiers" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PriceTiers %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PriceTiers % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Distribution"."priceTierAddUpdate"(jsonb) IS 'Save (insert or update) one PriceTiers record.';

-- PriceTiers: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Distribution"."getPriceTierInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('codeLabel', "Lookups"."getLookupLabel"('PriceTierCode', t.code) ->> 'label', 'codeTone', "Lookups"."getLookupLabel"('PriceTierCode', t.code) ->> 'tone')
    FROM "Distribution"."PriceTiers" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Distribution"."getPriceTierInfo"(uuid) IS 'Read one PriceTiers record (getter for its screens).';

-- ShopAreas: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Distribution"."shopAreaAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Distribution"."ShopAreas";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Distribution"."ShopAreas", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Distribution"."ShopAreas" ("tenantId", "branchId", code, name, city, status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Distribution"."ShopAreas" t
       SET "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           city = CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE t.city END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Distribution"."ShopAreas" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ShopAreas %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ShopAreas % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Distribution"."shopAreaAddUpdate"(jsonb) IS 'Save (insert or update) one ShopAreas record.';

-- ShopAreas: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Distribution"."getShopAreaInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone')
    FROM "Distribution"."ShopAreas" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Distribution"."getShopAreaInfo"(uuid) IS 'Read one ShopAreas record (getter for its screens).';

-- Vans: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Distribution"."vanAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Distribution"."Vans";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Distribution"."Vans", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Distribution"."Vans" ("tenantId", "branchId", "regNo", model, "capacityCtn", "capacityKg", "warehouseId", "defaultDriverEmployeeId", status, remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'regNo' THEN "vRec"."regNo" ELSE NULL END, CASE WHEN "pData" ? 'model' THEN "vRec".model ELSE NULL END, CASE WHEN "pData" ? 'capacityCtn' THEN "vRec"."capacityCtn" ELSE NULL END, CASE WHEN "pData" ? 'capacityKg' THEN "vRec"."capacityKg" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'defaultDriverEmployeeId' THEN "vRec"."defaultDriverEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Distribution"."Vans" t
       SET "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "regNo" = CASE WHEN "pData" ? 'regNo' THEN "vRec"."regNo" ELSE t."regNo" END,
           model = CASE WHEN "pData" ? 'model' THEN "vRec".model ELSE t.model END,
           "capacityCtn" = CASE WHEN "pData" ? 'capacityCtn' THEN "vRec"."capacityCtn" ELSE t."capacityCtn" END,
           "capacityKg" = CASE WHEN "pData" ? 'capacityKg' THEN "vRec"."capacityKg" ELSE t."capacityKg" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "defaultDriverEmployeeId" = CASE WHEN "pData" ? 'defaultDriverEmployeeId' THEN "vRec"."defaultDriverEmployeeId" ELSE t."defaultDriverEmployeeId" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Distribution"."Vans" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Vans %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Vans % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Distribution"."vanAddUpdate"(jsonb) IS 'Save (insert or update) one Vans record.';

-- Vans: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Distribution"."getVanInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('VanStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('VanStatus', t.status) ->> 'tone')
    FROM "Distribution"."Vans" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Distribution"."getVanInfo"(uuid) IS 'Read one Vans record (getter for its screens).';

-- Routes: insert (no "id") or update (with "id"); child arrays: visitDays, stops
CREATE OR REPLACE FUNCTION "Distribution"."routeAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Distribution"."Routes";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1RouteStops" "Distribution"."RouteStops";
  "vC1RouteVisitDays" "Distribution"."RouteVisitDays";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Distribution"."Routes", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'code') OR "vRec".code IS NULL THEN
      "vRec".code := "Company"."getNextDocNo"('RT', current_date, "vRec"."branchId");
    END IF;
    INSERT INTO "Distribution"."Routes" ("tenantId", "branchId", code, name, "sourceWarehouseId", "bookerEmployeeId", "salesmanEmployeeId", "driverEmployeeId", "supervisorEmployeeId", "vehicleId", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, "vRec".code, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'sourceWarehouseId' THEN "vRec"."sourceWarehouseId" ELSE NULL END, CASE WHEN "pData" ? 'bookerEmployeeId' THEN "vRec"."bookerEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'salesmanEmployeeId' THEN "vRec"."salesmanEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'driverEmployeeId' THEN "vRec"."driverEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'supervisorEmployeeId' THEN "vRec"."supervisorEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'vehicleId' THEN "vRec"."vehicleId" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Distribution"."Routes" t
       SET "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "sourceWarehouseId" = CASE WHEN "pData" ? 'sourceWarehouseId' THEN "vRec"."sourceWarehouseId" ELSE t."sourceWarehouseId" END,
           "bookerEmployeeId" = CASE WHEN "pData" ? 'bookerEmployeeId' THEN "vRec"."bookerEmployeeId" ELSE t."bookerEmployeeId" END,
           "salesmanEmployeeId" = CASE WHEN "pData" ? 'salesmanEmployeeId' THEN "vRec"."salesmanEmployeeId" ELSE t."salesmanEmployeeId" END,
           "driverEmployeeId" = CASE WHEN "pData" ? 'driverEmployeeId' THEN "vRec"."driverEmployeeId" ELSE t."driverEmployeeId" END,
           "supervisorEmployeeId" = CASE WHEN "pData" ? 'supervisorEmployeeId' THEN "vRec"."supervisorEmployeeId" ELSE t."supervisorEmployeeId" END,
           "vehicleId" = CASE WHEN "pData" ? 'vehicleId' THEN "vRec"."vehicleId" ELSE t."vehicleId" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Distribution"."Routes" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Routes %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Routes % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'visitDays' THEN
    -- visitDays: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Distribution"."RouteVisitDays"
     WHERE "tenantId" = "vTenant" AND "routeId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'visitDays') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'visitDays') WITH ORDINALITY t(x, n) LOOP
      "vC1RouteVisitDays" := jsonb_populate_record(NULL::"Distribution"."RouteVisitDays", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Distribution"."RouteVisitDays" t
           SET weekday = CASE WHEN "vE1" ? 'weekday' THEN "vC1RouteVisitDays".weekday ELSE t.weekday END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."routeId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'RouteVisitDays: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Distribution"."RouteVisitDays" ("routeId", "tenantId", weekday)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'weekday' THEN "vC1RouteVisitDays".weekday ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'stops' THEN
    -- stops: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Distribution"."RouteStops"
     WHERE "tenantId" = "vTenant" AND "routeId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'stops') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'stops') WITH ORDINALITY t(x, n) LOOP
      "vC1RouteStops" := jsonb_populate_record(NULL::"Distribution"."RouteStops", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Distribution"."RouteStops" t
           SET "routeDayId" = CASE WHEN "vE1" ? 'routeDayId' THEN "vC1RouteStops"."routeDayId" ELSE t."routeDayId" END,
               "customerId" = CASE WHEN "vE1" ? 'customerId' THEN "vC1RouteStops"."customerId" ELSE t."customerId" END,
               "stopSeq" = CASE WHEN "vE1" ? 'stopSeq' THEN "vC1RouteStops"."stopSeq" ELSE t."stopSeq" END,
               "plannedEta" = CASE WHEN "vE1" ? 'plannedEta' THEN "vC1RouteStops"."plannedEta" ELSE t."plannedEta" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."routeId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'RouteStops: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Distribution"."RouteStops" ("routeId", "tenantId", "routeDayId", "customerId", "stopSeq", "plannedEta")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'routeDayId' THEN "vC1RouteStops"."routeDayId" ELSE NULL END, CASE WHEN "vE1" ? 'customerId' THEN "vC1RouteStops"."customerId" ELSE NULL END, CASE WHEN "vE1" ? 'stopSeq' THEN "vC1RouteStops"."stopSeq" ELSE NULL END, CASE WHEN "vE1" ? 'plannedEta' THEN "vC1RouteStops"."plannedEta" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Distribution"."routeAddUpdate"(jsonb) IS 'Save (insert or update) one Routes record with its visitDays, stops.';

-- Routes: one record as JSON (camelCase keys), with lookup labels and visitDays, stops
CREATE OR REPLACE FUNCTION "Distribution"."getRouteInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone') ||
         jsonb_build_object('visitDays', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Distribution"."RouteVisitDays" c1 WHERE c1."routeId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'stops', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Distribution"."RouteStops" c1 WHERE c1."routeId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Distribution"."Routes" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Distribution"."getRouteInfo"(uuid) IS 'Read one Routes record (getter for its screens).';

-- ShopRouteProfiles: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Distribution"."shopRouteProfileAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Distribution"."ShopRouteProfiles";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Distribution"."ShopRouteProfiles", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Distribution"."ShopRouteProfiles" ("tenantId", "customerId", "routeId", "areaId", "priceTier", "visitSeq", "geoLat", "geoLng", "gpsToleranceM", "recoveryTargetAmount", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE NULL END, CASE WHEN "pData" ? 'areaId' THEN "vRec"."areaId" ELSE NULL END, CASE WHEN "pData" ? 'priceTier' THEN "vRec"."priceTier" ELSE 'RETAILER' END, CASE WHEN "pData" ? 'visitSeq' THEN "vRec"."visitSeq" ELSE NULL END, CASE WHEN "pData" ? 'geoLat' THEN "vRec"."geoLat" ELSE NULL END, CASE WHEN "pData" ? 'geoLng' THEN "vRec"."geoLng" ELSE NULL END, CASE WHEN "pData" ? 'gpsToleranceM' THEN "vRec"."gpsToleranceM" ELSE 25 END, CASE WHEN "pData" ? 'recoveryTargetAmount' THEN "vRec"."recoveryTargetAmount" ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Distribution"."ShopRouteProfiles" t
       SET "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           "routeId" = CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE t."routeId" END,
           "areaId" = CASE WHEN "pData" ? 'areaId' THEN "vRec"."areaId" ELSE t."areaId" END,
           "priceTier" = CASE WHEN "pData" ? 'priceTier' THEN "vRec"."priceTier" ELSE t."priceTier" END,
           "visitSeq" = CASE WHEN "pData" ? 'visitSeq' THEN "vRec"."visitSeq" ELSE t."visitSeq" END,
           "geoLat" = CASE WHEN "pData" ? 'geoLat' THEN "vRec"."geoLat" ELSE t."geoLat" END,
           "geoLng" = CASE WHEN "pData" ? 'geoLng' THEN "vRec"."geoLng" ELSE t."geoLng" END,
           "gpsToleranceM" = CASE WHEN "pData" ? 'gpsToleranceM' THEN "vRec"."gpsToleranceM" ELSE t."gpsToleranceM" END,
           "recoveryTargetAmount" = CASE WHEN "pData" ? 'recoveryTargetAmount' THEN "vRec"."recoveryTargetAmount" ELSE t."recoveryTargetAmount" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Distribution"."ShopRouteProfiles" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ShopRouteProfiles %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ShopRouteProfiles % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Distribution"."shopRouteProfileAddUpdate"(jsonb) IS 'Save (insert or update) one ShopRouteProfiles record.';

-- ShopRouteProfiles: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Distribution"."getShopRouteProfileInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "Distribution"."ShopRouteProfiles" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Distribution"."getShopRouteProfileInfo"(uuid) IS 'Read one ShopRouteProfiles record (getter for its screens).';

-- HeldBills: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Distribution"."heldBillAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Distribution"."HeldBills";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1HeldBillLines" "Distribution"."HeldBillLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Distribution"."HeldBills", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Distribution"."HeldBills" ("tenantId", "branchId", "provisionalNo", "docDate", "customerId", "routeId", "salesmanEmployeeId", "warehouseId", "priceTier", "rateEntryMode", "holdReason", "lineCount", "totalCtn", "totalLoose", "grossAmount", "schemeAmount", "discountAmount", "taxAmount", "netAmount", "heldByUserId", "recalledAt", "recalledByUserId", remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'provisionalNo' THEN "vRec"."provisionalNo" ELSE NULL END, CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE NULL END, CASE WHEN "pData" ? 'salesmanEmployeeId' THEN "vRec"."salesmanEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'priceTier' THEN "vRec"."priceTier" ELSE NULL END, CASE WHEN "pData" ? 'rateEntryMode' THEN "vRec"."rateEntryMode" ELSE 'PCS' END, CASE WHEN "pData" ? 'holdReason' THEN "vRec"."holdReason" ELSE 'MANUAL' END, CASE WHEN "pData" ? 'lineCount' THEN "vRec"."lineCount" ELSE 0 END, CASE WHEN "pData" ? 'totalCtn' THEN "vRec"."totalCtn" ELSE 0 END, CASE WHEN "pData" ? 'totalLoose' THEN "vRec"."totalLoose" ELSE 0 END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE 0 END, CASE WHEN "pData" ? 'schemeAmount' THEN "vRec"."schemeAmount" ELSE 0 END, CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE 0 END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE 0 END, CASE WHEN "pData" ? 'heldByUserId' THEN "vRec"."heldByUserId" ELSE NULL END, CASE WHEN "pData" ? 'recalledAt' THEN "vRec"."recalledAt" ELSE NULL END, CASE WHEN "pData" ? 'recalledByUserId' THEN "vRec"."recalledByUserId" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Distribution"."HeldBills" t
       SET "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "provisionalNo" = CASE WHEN "pData" ? 'provisionalNo' THEN "vRec"."provisionalNo" ELSE t."provisionalNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           "routeId" = CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE t."routeId" END,
           "salesmanEmployeeId" = CASE WHEN "pData" ? 'salesmanEmployeeId' THEN "vRec"."salesmanEmployeeId" ELSE t."salesmanEmployeeId" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "priceTier" = CASE WHEN "pData" ? 'priceTier' THEN "vRec"."priceTier" ELSE t."priceTier" END,
           "rateEntryMode" = CASE WHEN "pData" ? 'rateEntryMode' THEN "vRec"."rateEntryMode" ELSE t."rateEntryMode" END,
           "holdReason" = CASE WHEN "pData" ? 'holdReason' THEN "vRec"."holdReason" ELSE t."holdReason" END,
           "lineCount" = CASE WHEN "pData" ? 'lineCount' THEN "vRec"."lineCount" ELSE t."lineCount" END,
           "totalCtn" = CASE WHEN "pData" ? 'totalCtn' THEN "vRec"."totalCtn" ELSE t."totalCtn" END,
           "totalLoose" = CASE WHEN "pData" ? 'totalLoose' THEN "vRec"."totalLoose" ELSE t."totalLoose" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "schemeAmount" = CASE WHEN "pData" ? 'schemeAmount' THEN "vRec"."schemeAmount" ELSE t."schemeAmount" END,
           "discountAmount" = CASE WHEN "pData" ? 'discountAmount' THEN "vRec"."discountAmount" ELSE t."discountAmount" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "heldByUserId" = CASE WHEN "pData" ? 'heldByUserId' THEN "vRec"."heldByUserId" ELSE t."heldByUserId" END,
           "recalledAt" = CASE WHEN "pData" ? 'recalledAt' THEN "vRec"."recalledAt" ELSE t."recalledAt" END,
           "recalledByUserId" = CASE WHEN "pData" ? 'recalledByUserId' THEN "vRec"."recalledByUserId" ELSE t."recalledByUserId" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Distribution"."HeldBills" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'HeldBills %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'HeldBills % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Distribution"."HeldBillLines"
     WHERE "tenantId" = "vTenant" AND "heldBillId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1HeldBillLines" := jsonb_populate_record(NULL::"Distribution"."HeldBillLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1HeldBillLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Distribution"."HeldBillLines" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1HeldBillLines"."itemId" ELSE t."itemId" END,
               "unitsPerCtn" = CASE WHEN "vE1" ? 'unitsPerCtn' THEN "vC1HeldBillLines"."unitsPerCtn" ELSE t."unitsPerCtn" END,
               "qtyCtn" = CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1HeldBillLines"."qtyCtn" ELSE t."qtyCtn" END,
               "qtyLoose" = CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1HeldBillLines"."qtyLoose" ELSE t."qtyLoose" END,
               "bonusQty" = CASE WHEN "vE1" ? 'bonusQty' THEN "vC1HeldBillLines"."bonusQty" ELSE t."bonusQty" END,
               "schemeId" = CASE WHEN "vE1" ? 'schemeId' THEN "vC1HeldBillLines"."schemeId" ELSE t."schemeId" END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1HeldBillLines".rate ELSE t.rate END,
               "isManualRate" = CASE WHEN "vE1" ? 'isManualRate' THEN "vC1HeldBillLines"."isManualRate" ELSE t."isManualRate" END,
               "discountPct" = CASE WHEN "vE1" ? 'discountPct' THEN "vC1HeldBillLines"."discountPct" ELSE t."discountPct" END,
               "taxRate" = CASE WHEN "vE1" ? 'taxRate' THEN "vC1HeldBillLines"."taxRate" ELSE t."taxRate" END,
               "grossAmount" = CASE WHEN "vE1" ? 'grossAmount' THEN "vC1HeldBillLines"."grossAmount" ELSE t."grossAmount" END,
               "discountAmount" = CASE WHEN "vE1" ? 'discountAmount' THEN "vC1HeldBillLines"."discountAmount" ELSE t."discountAmount" END,
               "taxAmount" = CASE WHEN "vE1" ? 'taxAmount' THEN "vC1HeldBillLines"."taxAmount" ELSE t."taxAmount" END,
               "netAmount" = CASE WHEN "vE1" ? 'netAmount' THEN "vC1HeldBillLines"."netAmount" ELSE t."netAmount" END,
               "lineNo" = "vC1HeldBillLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."heldBillId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'HeldBillLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Distribution"."HeldBillLines" ("heldBillId", "tenantId", "lineNo", "itemId", "unitsPerCtn", "qtyCtn", "qtyLoose", "bonusQty", "schemeId", rate, "isManualRate", "discountPct", "taxRate", "grossAmount", "discountAmount", "taxAmount", "netAmount")
        VALUES ("vRet", "vTenant", "vC1HeldBillLines"."lineNo", CASE WHEN "vE1" ? 'itemId' THEN "vC1HeldBillLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'unitsPerCtn' THEN "vC1HeldBillLines"."unitsPerCtn" ELSE 1 END, CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1HeldBillLines"."qtyCtn" ELSE 0 END, CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1HeldBillLines"."qtyLoose" ELSE 0 END, CASE WHEN "vE1" ? 'bonusQty' THEN "vC1HeldBillLines"."bonusQty" ELSE 0 END, CASE WHEN "vE1" ? 'schemeId' THEN "vC1HeldBillLines"."schemeId" ELSE NULL END, CASE WHEN "vE1" ? 'rate' THEN "vC1HeldBillLines".rate ELSE NULL END, CASE WHEN "vE1" ? 'isManualRate' THEN "vC1HeldBillLines"."isManualRate" ELSE FALSE END, CASE WHEN "vE1" ? 'discountPct' THEN "vC1HeldBillLines"."discountPct" ELSE 0 END, CASE WHEN "vE1" ? 'taxRate' THEN "vC1HeldBillLines"."taxRate" ELSE 0 END, CASE WHEN "vE1" ? 'grossAmount' THEN "vC1HeldBillLines"."grossAmount" ELSE 0 END, CASE WHEN "vE1" ? 'discountAmount' THEN "vC1HeldBillLines"."discountAmount" ELSE 0 END, CASE WHEN "vE1" ? 'taxAmount' THEN "vC1HeldBillLines"."taxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'netAmount' THEN "vC1HeldBillLines"."netAmount" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Distribution"."heldBillAddUpdate"(jsonb) IS 'Save (insert or update) one HeldBills record with its lines.';

-- HeldBills: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Distribution"."getHeldBillInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('rateEntryModeLabel', "Lookups"."getLookupLabel"('RateEntryMode', t."rateEntryMode") ->> 'label', 'rateEntryModeTone', "Lookups"."getLookupLabel"('RateEntryMode', t."rateEntryMode") ->> 'tone', 'holdReasonLabel', "Lookups"."getLookupLabel"('HeldBillHoldReason', t."holdReason") ->> 'label', 'holdReasonTone', "Lookups"."getLookupLabel"('HeldBillHoldReason', t."holdReason") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('HeldBillStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('HeldBillStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Distribution"."HeldBillLines" c1 WHERE c1."heldBillId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Distribution"."HeldBills" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Distribution"."getHeldBillInfo"(uuid) IS 'Read one HeldBills record (getter for its screens).';

-- OrderTemplates: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Distribution"."orderTemplateAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Distribution"."OrderTemplates";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1OrderTemplateLines" "Distribution"."OrderTemplateLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Distribution"."OrderTemplates", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Distribution"."OrderTemplates" ("tenantId", name, icon, "customerId", "ownerUserId", "isShared", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE NULL END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'ownerUserId' THEN "vRec"."ownerUserId" ELSE NULL END, CASE WHEN "pData" ? 'isShared' THEN "vRec"."isShared" ELSE TRUE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Distribution"."OrderTemplates" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           "ownerUserId" = CASE WHEN "pData" ? 'ownerUserId' THEN "vRec"."ownerUserId" ELSE t."ownerUserId" END,
           "isShared" = CASE WHEN "pData" ? 'isShared' THEN "vRec"."isShared" ELSE t."isShared" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Distribution"."OrderTemplates" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'OrderTemplates %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'OrderTemplates % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Distribution"."OrderTemplateLines"
     WHERE "tenantId" = "vTenant" AND "orderTemplateId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1OrderTemplateLines" := jsonb_populate_record(NULL::"Distribution"."OrderTemplateLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1OrderTemplateLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Distribution"."OrderTemplateLines" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1OrderTemplateLines"."itemId" ELSE t."itemId" END,
               "qtyCtn" = CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1OrderTemplateLines"."qtyCtn" ELSE t."qtyCtn" END,
               "qtyLoose" = CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1OrderTemplateLines"."qtyLoose" ELSE t."qtyLoose" END,
               "lineNo" = "vC1OrderTemplateLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."orderTemplateId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'OrderTemplateLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Distribution"."OrderTemplateLines" ("orderTemplateId", "tenantId", "lineNo", "itemId", "qtyCtn", "qtyLoose")
        VALUES ("vRet", "vTenant", "vC1OrderTemplateLines"."lineNo", CASE WHEN "vE1" ? 'itemId' THEN "vC1OrderTemplateLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1OrderTemplateLines"."qtyCtn" ELSE 0 END, CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1OrderTemplateLines"."qtyLoose" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Distribution"."orderTemplateAddUpdate"(jsonb) IS 'Save (insert or update) one OrderTemplates record with its lines.';

-- OrderTemplates: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Distribution"."getOrderTemplateInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('ActiveArchivedStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveArchivedStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Distribution"."OrderTemplateLines" c1 WHERE c1."orderTemplateId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Distribution"."OrderTemplates" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Distribution"."getOrderTemplateInfo"(uuid) IS 'Read one OrderTemplates record (getter for its screens).';

-- BulkInvoiceRuns: insert (no "id") or update (with "id"); child arrays: cells, skippedShops
CREATE OR REPLACE FUNCTION "Distribution"."bulkInvoiceRunAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Distribution"."BulkInvoiceRuns";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1BulkInvoiceRunCells" "Distribution"."BulkInvoiceRunCells";
  "vC1BulkInvoiceSkippedShops" "Distribution"."BulkInvoiceSkippedShops";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Distribution"."BulkInvoiceRuns", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Distribution"."BulkInvoiceRuns" ("tenantId", "branchId", "routeId", "docDate", "warehouseId", mode, "shopsSelected", "totalCtn", "creditWarnings", "totalValue", "invoiceCount", "invoicedValue", "skippedCount", "firstInvoiceNo", "lastInvoiceNo", "generatedAt", "generatedByUserId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE NULL END, CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'mode' THEN "vRec".mode ELSE NULL END, CASE WHEN "pData" ? 'shopsSelected' THEN "vRec"."shopsSelected" ELSE 0 END, CASE WHEN "pData" ? 'totalCtn' THEN "vRec"."totalCtn" ELSE 0 END, CASE WHEN "pData" ? 'creditWarnings' THEN "vRec"."creditWarnings" ELSE 0 END, CASE WHEN "pData" ? 'totalValue' THEN "vRec"."totalValue" ELSE 0 END, CASE WHEN "pData" ? 'invoiceCount' THEN "vRec"."invoiceCount" ELSE 0 END, CASE WHEN "pData" ? 'invoicedValue' THEN "vRec"."invoicedValue" ELSE 0 END, CASE WHEN "pData" ? 'skippedCount' THEN "vRec"."skippedCount" ELSE 0 END, CASE WHEN "pData" ? 'firstInvoiceNo' THEN "vRec"."firstInvoiceNo" ELSE NULL END, CASE WHEN "pData" ? 'lastInvoiceNo' THEN "vRec"."lastInvoiceNo" ELSE NULL END, CASE WHEN "pData" ? 'generatedAt' THEN "vRec"."generatedAt" ELSE NULL END, CASE WHEN "pData" ? 'generatedByUserId' THEN "vRec"."generatedByUserId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Distribution"."BulkInvoiceRuns" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'BulkInvoiceRuns: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Distribution"."BulkInvoiceRuns" t
       SET "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "routeId" = CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE t."routeId" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           mode = CASE WHEN "pData" ? 'mode' THEN "vRec".mode ELSE t.mode END,
           "shopsSelected" = CASE WHEN "pData" ? 'shopsSelected' THEN "vRec"."shopsSelected" ELSE t."shopsSelected" END,
           "totalCtn" = CASE WHEN "pData" ? 'totalCtn' THEN "vRec"."totalCtn" ELSE t."totalCtn" END,
           "creditWarnings" = CASE WHEN "pData" ? 'creditWarnings' THEN "vRec"."creditWarnings" ELSE t."creditWarnings" END,
           "totalValue" = CASE WHEN "pData" ? 'totalValue' THEN "vRec"."totalValue" ELSE t."totalValue" END,
           "invoiceCount" = CASE WHEN "pData" ? 'invoiceCount' THEN "vRec"."invoiceCount" ELSE t."invoiceCount" END,
           "invoicedValue" = CASE WHEN "pData" ? 'invoicedValue' THEN "vRec"."invoicedValue" ELSE t."invoicedValue" END,
           "skippedCount" = CASE WHEN "pData" ? 'skippedCount' THEN "vRec"."skippedCount" ELSE t."skippedCount" END,
           "firstInvoiceNo" = CASE WHEN "pData" ? 'firstInvoiceNo' THEN "vRec"."firstInvoiceNo" ELSE t."firstInvoiceNo" END,
           "lastInvoiceNo" = CASE WHEN "pData" ? 'lastInvoiceNo' THEN "vRec"."lastInvoiceNo" ELSE t."lastInvoiceNo" END,
           "generatedAt" = CASE WHEN "pData" ? 'generatedAt' THEN "vRec"."generatedAt" ELSE t."generatedAt" END,
           "generatedByUserId" = CASE WHEN "pData" ? 'generatedByUserId' THEN "vRec"."generatedByUserId" ELSE t."generatedByUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Distribution"."BulkInvoiceRuns" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'BulkInvoiceRuns %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'BulkInvoiceRuns % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'cells' THEN
    -- cells: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Distribution"."BulkInvoiceRunCells"
     WHERE "tenantId" = "vTenant" AND "bulkInvoiceBatchId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'cells') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'cells') WITH ORDINALITY t(x, n) LOOP
      "vC1BulkInvoiceRunCells" := jsonb_populate_record(NULL::"Distribution"."BulkInvoiceRunCells", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Distribution"."BulkInvoiceRunCells" t
           SET "customerId" = CASE WHEN "vE1" ? 'customerId' THEN "vC1BulkInvoiceRunCells"."customerId" ELSE t."customerId" END,
               "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1BulkInvoiceRunCells"."itemId" ELSE t."itemId" END,
               "qtyCtn" = CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1BulkInvoiceRunCells"."qtyCtn" ELSE t."qtyCtn" END,
               "unitsPerCtn" = CASE WHEN "vE1" ? 'unitsPerCtn' THEN "vC1BulkInvoiceRunCells"."unitsPerCtn" ELSE t."unitsPerCtn" END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1BulkInvoiceRunCells".rate ELSE t.rate END,
               "taxRate" = CASE WHEN "vE1" ? 'taxRate' THEN "vC1BulkInvoiceRunCells"."taxRate" ELSE t."taxRate" END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1BulkInvoiceRunCells".amount ELSE t.amount END,
               "invoiceId" = CASE WHEN "vE1" ? 'invoiceId' THEN "vC1BulkInvoiceRunCells"."invoiceId" ELSE t."invoiceId" END,
               "invoiceLineId" = CASE WHEN "vE1" ? 'invoiceLineId' THEN "vC1BulkInvoiceRunCells"."invoiceLineId" ELSE t."invoiceLineId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."bulkInvoiceBatchId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'BulkInvoiceRunCells: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Distribution"."BulkInvoiceRunCells" ("bulkInvoiceBatchId", "tenantId", "customerId", "itemId", "qtyCtn", "unitsPerCtn", rate, "taxRate", amount, "invoiceId", "invoiceLineId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'customerId' THEN "vC1BulkInvoiceRunCells"."customerId" ELSE NULL END, CASE WHEN "vE1" ? 'itemId' THEN "vC1BulkInvoiceRunCells"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1BulkInvoiceRunCells"."qtyCtn" ELSE NULL END, CASE WHEN "vE1" ? 'unitsPerCtn' THEN "vC1BulkInvoiceRunCells"."unitsPerCtn" ELSE 1 END, CASE WHEN "vE1" ? 'rate' THEN "vC1BulkInvoiceRunCells".rate ELSE NULL END, CASE WHEN "vE1" ? 'taxRate' THEN "vC1BulkInvoiceRunCells"."taxRate" ELSE 0 END, CASE WHEN "vE1" ? 'amount' THEN "vC1BulkInvoiceRunCells".amount ELSE NULL END, CASE WHEN "vE1" ? 'invoiceId' THEN "vC1BulkInvoiceRunCells"."invoiceId" ELSE NULL END, CASE WHEN "vE1" ? 'invoiceLineId' THEN "vC1BulkInvoiceRunCells"."invoiceLineId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'skippedShops' THEN
    -- skippedShops: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Distribution"."BulkInvoiceSkippedShops"
     WHERE "tenantId" = "vTenant" AND "bulkInvoiceBatchId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'skippedShops') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'skippedShops') WITH ORDINALITY t(x, n) LOOP
      "vC1BulkInvoiceSkippedShops" := jsonb_populate_record(NULL::"Distribution"."BulkInvoiceSkippedShops", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Distribution"."BulkInvoiceSkippedShops" t
           SET "customerId" = CASE WHEN "vE1" ? 'customerId' THEN "vC1BulkInvoiceSkippedShops"."customerId" ELSE t."customerId" END,
               "reasonCode" = CASE WHEN "vE1" ? 'reasonCode' THEN "vC1BulkInvoiceSkippedShops"."reasonCode" ELSE t."reasonCode" END,
               reason = CASE WHEN "vE1" ? 'reason' THEN "vC1BulkInvoiceSkippedShops".reason ELSE t.reason END,
               "billAmount" = CASE WHEN "vE1" ? 'billAmount' THEN "vC1BulkInvoiceSkippedShops"."billAmount" ELSE t."billAmount" END,
               "outstandingAmount" = CASE WHEN "vE1" ? 'outstandingAmount' THEN "vC1BulkInvoiceSkippedShops"."outstandingAmount" ELSE t."outstandingAmount" END,
               "creditLimit" = CASE WHEN "vE1" ? 'creditLimit' THEN "vC1BulkInvoiceSkippedShops"."creditLimit" ELSE t."creditLimit" END,
               "overByAmount" = CASE WHEN "vE1" ? 'overByAmount' THEN "vC1BulkInvoiceSkippedShops"."overByAmount" ELSE t."overByAmount" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."bulkInvoiceBatchId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'BulkInvoiceSkippedShops: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Distribution"."BulkInvoiceSkippedShops" ("bulkInvoiceBatchId", "tenantId", "customerId", "reasonCode", reason, "billAmount", "outstandingAmount", "creditLimit", "overByAmount")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'customerId' THEN "vC1BulkInvoiceSkippedShops"."customerId" ELSE NULL END, CASE WHEN "vE1" ? 'reasonCode' THEN "vC1BulkInvoiceSkippedShops"."reasonCode" ELSE 'OVER_CREDIT_LIMIT' END, CASE WHEN "vE1" ? 'reason' THEN "vC1BulkInvoiceSkippedShops".reason ELSE NULL END, CASE WHEN "vE1" ? 'billAmount' THEN "vC1BulkInvoiceSkippedShops"."billAmount" ELSE NULL END, CASE WHEN "vE1" ? 'outstandingAmount' THEN "vC1BulkInvoiceSkippedShops"."outstandingAmount" ELSE NULL END, CASE WHEN "vE1" ? 'creditLimit' THEN "vC1BulkInvoiceSkippedShops"."creditLimit" ELSE NULL END, CASE WHEN "vE1" ? 'overByAmount' THEN "vC1BulkInvoiceSkippedShops"."overByAmount" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Distribution"."bulkInvoiceRunAddUpdate"(jsonb) IS 'Save (insert or update) one BulkInvoiceRuns record with its cells, skippedShops.';

-- BulkInvoiceRuns: one record as JSON (camelCase keys), with lookup labels and cells, skippedShops
CREATE OR REPLACE FUNCTION "Distribution"."getBulkInvoiceRunInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('modeLabel', "Lookups"."getLookupLabel"('BulkInvoiceRunMode', t.mode) ->> 'label', 'modeTone', "Lookups"."getLookupLabel"('BulkInvoiceRunMode', t.mode) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('BulkInvoiceRunStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('BulkInvoiceRunStatus', t.status) ->> 'tone') ||
         jsonb_build_object('cells', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Distribution"."BulkInvoiceRunCells" c1 WHERE c1."bulkInvoiceBatchId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'skippedShops', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Distribution"."BulkInvoiceSkippedShops" c1 WHERE c1."bulkInvoiceBatchId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Distribution"."BulkInvoiceRuns" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Distribution"."getBulkInvoiceRunInfo"(uuid) IS 'Read one BulkInvoiceRuns record (getter for its screens).';

-- OrderBookings: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Distribution"."orderBookingAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Distribution"."OrderBookings";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1OrderBookingLines" "Distribution"."OrderBookingLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Distribution"."OrderBookings", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('BK', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Distribution"."OrderBookings" ("tenantId", "branchId", "docNo", "docDate", "bookedAt", "bookerEmployeeId", "routeId", "customerId", "warehouseId", "priceTier", "appOrderRef", "syncedAt", "geoLat", "geoLng", "gpsVerified", "gpsOffsetM", note, "lineCount", "grossAmount", "taxAmount", "netAmount", "stockCheck", "stockCheckedAt", "shortLineCount", "allowPartial", "invoiceId", "convertedAt", "convertedByUserId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'bookedAt' THEN "vRec"."bookedAt" ELSE NULL END, CASE WHEN "pData" ? 'bookerEmployeeId' THEN "vRec"."bookerEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE NULL END, CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE NULL END, CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE NULL END, CASE WHEN "pData" ? 'priceTier' THEN "vRec"."priceTier" ELSE NULL END, CASE WHEN "pData" ? 'appOrderRef' THEN "vRec"."appOrderRef" ELSE NULL END, CASE WHEN "pData" ? 'syncedAt' THEN "vRec"."syncedAt" ELSE NULL END, CASE WHEN "pData" ? 'geoLat' THEN "vRec"."geoLat" ELSE NULL END, CASE WHEN "pData" ? 'geoLng' THEN "vRec"."geoLng" ELSE NULL END, CASE WHEN "pData" ? 'gpsVerified' THEN "vRec"."gpsVerified" ELSE FALSE END, CASE WHEN "pData" ? 'gpsOffsetM' THEN "vRec"."gpsOffsetM" ELSE NULL END, CASE WHEN "pData" ? 'note' THEN "vRec".note ELSE NULL END, CASE WHEN "pData" ? 'lineCount' THEN "vRec"."lineCount" ELSE 0 END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE 0 END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE 0 END, CASE WHEN "pData" ? 'stockCheck' THEN "vRec"."stockCheck" ELSE NULL END, CASE WHEN "pData" ? 'stockCheckedAt' THEN "vRec"."stockCheckedAt" ELSE NULL END, CASE WHEN "pData" ? 'shortLineCount' THEN "vRec"."shortLineCount" ELSE 0 END, CASE WHEN "pData" ? 'allowPartial' THEN "vRec"."allowPartial" ELSE NULL END, CASE WHEN "pData" ? 'invoiceId' THEN "vRec"."invoiceId" ELSE NULL END, CASE WHEN "pData" ? 'convertedAt' THEN "vRec"."convertedAt" ELSE NULL END, CASE WHEN "pData" ? 'convertedByUserId' THEN "vRec"."convertedByUserId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Distribution"."OrderBookings" t
       SET "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "bookedAt" = CASE WHEN "pData" ? 'bookedAt' THEN "vRec"."bookedAt" ELSE t."bookedAt" END,
           "bookerEmployeeId" = CASE WHEN "pData" ? 'bookerEmployeeId' THEN "vRec"."bookerEmployeeId" ELSE t."bookerEmployeeId" END,
           "routeId" = CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE t."routeId" END,
           "customerId" = CASE WHEN "pData" ? 'customerId' THEN "vRec"."customerId" ELSE t."customerId" END,
           "warehouseId" = CASE WHEN "pData" ? 'warehouseId' THEN "vRec"."warehouseId" ELSE t."warehouseId" END,
           "priceTier" = CASE WHEN "pData" ? 'priceTier' THEN "vRec"."priceTier" ELSE t."priceTier" END,
           "appOrderRef" = CASE WHEN "pData" ? 'appOrderRef' THEN "vRec"."appOrderRef" ELSE t."appOrderRef" END,
           "syncedAt" = CASE WHEN "pData" ? 'syncedAt' THEN "vRec"."syncedAt" ELSE t."syncedAt" END,
           "geoLat" = CASE WHEN "pData" ? 'geoLat' THEN "vRec"."geoLat" ELSE t."geoLat" END,
           "geoLng" = CASE WHEN "pData" ? 'geoLng' THEN "vRec"."geoLng" ELSE t."geoLng" END,
           "gpsVerified" = CASE WHEN "pData" ? 'gpsVerified' THEN "vRec"."gpsVerified" ELSE t."gpsVerified" END,
           "gpsOffsetM" = CASE WHEN "pData" ? 'gpsOffsetM' THEN "vRec"."gpsOffsetM" ELSE t."gpsOffsetM" END,
           note = CASE WHEN "pData" ? 'note' THEN "vRec".note ELSE t.note END,
           "lineCount" = CASE WHEN "pData" ? 'lineCount' THEN "vRec"."lineCount" ELSE t."lineCount" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "stockCheck" = CASE WHEN "pData" ? 'stockCheck' THEN "vRec"."stockCheck" ELSE t."stockCheck" END,
           "stockCheckedAt" = CASE WHEN "pData" ? 'stockCheckedAt' THEN "vRec"."stockCheckedAt" ELSE t."stockCheckedAt" END,
           "shortLineCount" = CASE WHEN "pData" ? 'shortLineCount' THEN "vRec"."shortLineCount" ELSE t."shortLineCount" END,
           "allowPartial" = CASE WHEN "pData" ? 'allowPartial' THEN "vRec"."allowPartial" ELSE t."allowPartial" END,
           "invoiceId" = CASE WHEN "pData" ? 'invoiceId' THEN "vRec"."invoiceId" ELSE t."invoiceId" END,
           "convertedAt" = CASE WHEN "pData" ? 'convertedAt' THEN "vRec"."convertedAt" ELSE t."convertedAt" END,
           "convertedByUserId" = CASE WHEN "pData" ? 'convertedByUserId' THEN "vRec"."convertedByUserId" ELSE t."convertedByUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Distribution"."OrderBookings" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'OrderBookings %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'OrderBookings % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Distribution"."OrderBookingLines"
     WHERE "tenantId" = "vTenant" AND "orderBookingId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1OrderBookingLines" := jsonb_populate_record(NULL::"Distribution"."OrderBookingLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1OrderBookingLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Distribution"."OrderBookingLines" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1OrderBookingLines"."itemId" ELSE t."itemId" END,
               "unitsPerCtn" = CASE WHEN "vE1" ? 'unitsPerCtn' THEN "vC1OrderBookingLines"."unitsPerCtn" ELSE t."unitsPerCtn" END,
               "qtyCtn" = CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1OrderBookingLines"."qtyCtn" ELSE t."qtyCtn" END,
               "qtyLoose" = CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1OrderBookingLines"."qtyLoose" ELSE t."qtyLoose" END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1OrderBookingLines".rate ELSE t.rate END,
               "taxRate" = CASE WHEN "vE1" ? 'taxRate' THEN "vC1OrderBookingLines"."taxRate" ELSE t."taxRate" END,
               "grossAmount" = CASE WHEN "vE1" ? 'grossAmount' THEN "vC1OrderBookingLines"."grossAmount" ELSE t."grossAmount" END,
               "taxAmount" = CASE WHEN "vE1" ? 'taxAmount' THEN "vC1OrderBookingLines"."taxAmount" ELSE t."taxAmount" END,
               "netAmount" = CASE WHEN "vE1" ? 'netAmount' THEN "vC1OrderBookingLines"."netAmount" ELSE t."netAmount" END,
               "availableQty" = CASE WHEN "vE1" ? 'availableQty' THEN "vC1OrderBookingLines"."availableQty" ELSE t."availableQty" END,
               "shortQty" = CASE WHEN "vE1" ? 'shortQty' THEN "vC1OrderBookingLines"."shortQty" ELSE t."shortQty" END,
               "invoicedQty" = CASE WHEN "vE1" ? 'invoicedQty' THEN "vC1OrderBookingLines"."invoicedQty" ELSE t."invoicedQty" END,
               "backorderQty" = CASE WHEN "vE1" ? 'backorderQty' THEN "vC1OrderBookingLines"."backorderQty" ELSE t."backorderQty" END,
               "lineNo" = "vC1OrderBookingLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."orderBookingId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'OrderBookingLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Distribution"."OrderBookingLines" ("orderBookingId", "tenantId", "lineNo", "itemId", "unitsPerCtn", "qtyCtn", "qtyLoose", rate, "taxRate", "grossAmount", "taxAmount", "netAmount", "availableQty", "shortQty", "invoicedQty", "backorderQty")
        VALUES ("vRet", "vTenant", "vC1OrderBookingLines"."lineNo", CASE WHEN "vE1" ? 'itemId' THEN "vC1OrderBookingLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'unitsPerCtn' THEN "vC1OrderBookingLines"."unitsPerCtn" ELSE 1 END, CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1OrderBookingLines"."qtyCtn" ELSE 0 END, CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1OrderBookingLines"."qtyLoose" ELSE 0 END, CASE WHEN "vE1" ? 'rate' THEN "vC1OrderBookingLines".rate ELSE NULL END, CASE WHEN "vE1" ? 'taxRate' THEN "vC1OrderBookingLines"."taxRate" ELSE 0 END, CASE WHEN "vE1" ? 'grossAmount' THEN "vC1OrderBookingLines"."grossAmount" ELSE 0 END, CASE WHEN "vE1" ? 'taxAmount' THEN "vC1OrderBookingLines"."taxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'netAmount' THEN "vC1OrderBookingLines"."netAmount" ELSE 0 END, CASE WHEN "vE1" ? 'availableQty' THEN "vC1OrderBookingLines"."availableQty" ELSE NULL END, CASE WHEN "vE1" ? 'shortQty' THEN "vC1OrderBookingLines"."shortQty" ELSE 0 END, CASE WHEN "vE1" ? 'invoicedQty' THEN "vC1OrderBookingLines"."invoicedQty" ELSE 0 END, CASE WHEN "vE1" ? 'backorderQty' THEN "vC1OrderBookingLines"."backorderQty" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Distribution"."orderBookingAddUpdate"(jsonb) IS 'Save (insert or update) one OrderBookings record with its lines.';

-- OrderBookings: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Distribution"."getOrderBookingInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('OrderBookingStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('OrderBookingStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Distribution"."OrderBookingLines" c1 WHERE c1."orderBookingId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Distribution"."OrderBookings" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Distribution"."getOrderBookingInfo"(uuid) IS 'Read one OrderBookings record (getter for its screens).';

-- OrderBookings: Cancel (status -> CANCELLED); allowed from NEW, CHECKED, CONVERTED, PARTIAL, HELD
CREATE OR REPLACE FUNCTION "Distribution"."orderBookingCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Distribution"."OrderBookings";
BEGIN
  SELECT * INTO "vRow" FROM "Distribution"."OrderBookings" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OrderBookings % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('NEW', 'CHECKED', 'CONVERTED', 'PARTIAL', 'HELD') THEN
    RAISE EXCEPTION 'OrderBookings %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Distribution"."orderBookingCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Distribution"."orderBookingCancelEntries"') USING "pId";
  END IF;
  UPDATE "Distribution"."OrderBookings" t SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- LoadSheets: insert (no "id") or update (with "id"); child arrays: lines, invoices
CREATE OR REPLACE FUNCTION "Distribution"."loadSheetAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Distribution"."LoadSheets";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1LoadSheetInvoices" "Distribution"."LoadSheetInvoices";
  "vC1LoadSheetLines" "Distribution"."LoadSheetLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Distribution"."LoadSheets", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"("pData" ->> 'docType', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Distribution"."LoadSheets" ("tenantId", "branchId", "docNo", "docDate", "routeId", "vehicleId", "driverEmployeeId", "salesmanEmployeeId", "sourceWarehouseId", "vanWarehouseId", "departureTime", "loadSheetNo", "gatePassNo", "sealNo", "returnableCrates", "invoiceCount", "shopCount", "skuCount", "totalCtn", "totalLoose", "totalPcs", "totalCtnEquiv", "totalKg", "totalValue", "capacityCtn", "capacityKg", "preparedByUserId", "checkedByUserId", "loadSheetPrintedAt", "gatePassPrintedAt", "stockTransferId", "dispatchedAt", "dispatchedByUserId", "returnedAt", remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE NULL END, CASE WHEN "pData" ? 'vehicleId' THEN "vRec"."vehicleId" ELSE NULL END, CASE WHEN "pData" ? 'driverEmployeeId' THEN "vRec"."driverEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'salesmanEmployeeId' THEN "vRec"."salesmanEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'sourceWarehouseId' THEN "vRec"."sourceWarehouseId" ELSE NULL END, CASE WHEN "pData" ? 'vanWarehouseId' THEN "vRec"."vanWarehouseId" ELSE NULL END, CASE WHEN "pData" ? 'departureTime' THEN "vRec"."departureTime" ELSE NULL END, CASE WHEN "pData" ? 'loadSheetNo' THEN "vRec"."loadSheetNo" ELSE NULL END, CASE WHEN "pData" ? 'gatePassNo' THEN "vRec"."gatePassNo" ELSE NULL END, CASE WHEN "pData" ? 'sealNo' THEN "vRec"."sealNo" ELSE NULL END, CASE WHEN "pData" ? 'returnableCrates' THEN "vRec"."returnableCrates" ELSE 0 END, CASE WHEN "pData" ? 'invoiceCount' THEN "vRec"."invoiceCount" ELSE 0 END, CASE WHEN "pData" ? 'shopCount' THEN "vRec"."shopCount" ELSE 0 END, CASE WHEN "pData" ? 'skuCount' THEN "vRec"."skuCount" ELSE 0 END, CASE WHEN "pData" ? 'totalCtn' THEN "vRec"."totalCtn" ELSE 0 END, CASE WHEN "pData" ? 'totalLoose' THEN "vRec"."totalLoose" ELSE 0 END, CASE WHEN "pData" ? 'totalPcs' THEN "vRec"."totalPcs" ELSE 0 END, CASE WHEN "pData" ? 'totalCtnEquiv' THEN "vRec"."totalCtnEquiv" ELSE 0 END, CASE WHEN "pData" ? 'totalKg' THEN "vRec"."totalKg" ELSE 0 END, CASE WHEN "pData" ? 'totalValue' THEN "vRec"."totalValue" ELSE 0 END, CASE WHEN "pData" ? 'capacityCtn' THEN "vRec"."capacityCtn" ELSE NULL END, CASE WHEN "pData" ? 'capacityKg' THEN "vRec"."capacityKg" ELSE NULL END, CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'checkedByUserId' THEN "vRec"."checkedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'loadSheetPrintedAt' THEN "vRec"."loadSheetPrintedAt" ELSE NULL END, CASE WHEN "pData" ? 'gatePassPrintedAt' THEN "vRec"."gatePassPrintedAt" ELSE NULL END, CASE WHEN "pData" ? 'stockTransferId' THEN "vRec"."stockTransferId" ELSE NULL END, CASE WHEN "pData" ? 'dispatchedAt' THEN "vRec"."dispatchedAt" ELSE NULL END, CASE WHEN "pData" ? 'dispatchedByUserId' THEN "vRec"."dispatchedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'returnedAt' THEN "vRec"."returnedAt" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Distribution"."LoadSheets" t
       SET "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "routeId" = CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE t."routeId" END,
           "vehicleId" = CASE WHEN "pData" ? 'vehicleId' THEN "vRec"."vehicleId" ELSE t."vehicleId" END,
           "driverEmployeeId" = CASE WHEN "pData" ? 'driverEmployeeId' THEN "vRec"."driverEmployeeId" ELSE t."driverEmployeeId" END,
           "salesmanEmployeeId" = CASE WHEN "pData" ? 'salesmanEmployeeId' THEN "vRec"."salesmanEmployeeId" ELSE t."salesmanEmployeeId" END,
           "sourceWarehouseId" = CASE WHEN "pData" ? 'sourceWarehouseId' THEN "vRec"."sourceWarehouseId" ELSE t."sourceWarehouseId" END,
           "vanWarehouseId" = CASE WHEN "pData" ? 'vanWarehouseId' THEN "vRec"."vanWarehouseId" ELSE t."vanWarehouseId" END,
           "departureTime" = CASE WHEN "pData" ? 'departureTime' THEN "vRec"."departureTime" ELSE t."departureTime" END,
           "loadSheetNo" = CASE WHEN "pData" ? 'loadSheetNo' THEN "vRec"."loadSheetNo" ELSE t."loadSheetNo" END,
           "gatePassNo" = CASE WHEN "pData" ? 'gatePassNo' THEN "vRec"."gatePassNo" ELSE t."gatePassNo" END,
           "sealNo" = CASE WHEN "pData" ? 'sealNo' THEN "vRec"."sealNo" ELSE t."sealNo" END,
           "returnableCrates" = CASE WHEN "pData" ? 'returnableCrates' THEN "vRec"."returnableCrates" ELSE t."returnableCrates" END,
           "invoiceCount" = CASE WHEN "pData" ? 'invoiceCount' THEN "vRec"."invoiceCount" ELSE t."invoiceCount" END,
           "shopCount" = CASE WHEN "pData" ? 'shopCount' THEN "vRec"."shopCount" ELSE t."shopCount" END,
           "skuCount" = CASE WHEN "pData" ? 'skuCount' THEN "vRec"."skuCount" ELSE t."skuCount" END,
           "totalCtn" = CASE WHEN "pData" ? 'totalCtn' THEN "vRec"."totalCtn" ELSE t."totalCtn" END,
           "totalLoose" = CASE WHEN "pData" ? 'totalLoose' THEN "vRec"."totalLoose" ELSE t."totalLoose" END,
           "totalPcs" = CASE WHEN "pData" ? 'totalPcs' THEN "vRec"."totalPcs" ELSE t."totalPcs" END,
           "totalCtnEquiv" = CASE WHEN "pData" ? 'totalCtnEquiv' THEN "vRec"."totalCtnEquiv" ELSE t."totalCtnEquiv" END,
           "totalKg" = CASE WHEN "pData" ? 'totalKg' THEN "vRec"."totalKg" ELSE t."totalKg" END,
           "totalValue" = CASE WHEN "pData" ? 'totalValue' THEN "vRec"."totalValue" ELSE t."totalValue" END,
           "capacityCtn" = CASE WHEN "pData" ? 'capacityCtn' THEN "vRec"."capacityCtn" ELSE t."capacityCtn" END,
           "capacityKg" = CASE WHEN "pData" ? 'capacityKg' THEN "vRec"."capacityKg" ELSE t."capacityKg" END,
           "preparedByUserId" = CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE t."preparedByUserId" END,
           "checkedByUserId" = CASE WHEN "pData" ? 'checkedByUserId' THEN "vRec"."checkedByUserId" ELSE t."checkedByUserId" END,
           "loadSheetPrintedAt" = CASE WHEN "pData" ? 'loadSheetPrintedAt' THEN "vRec"."loadSheetPrintedAt" ELSE t."loadSheetPrintedAt" END,
           "gatePassPrintedAt" = CASE WHEN "pData" ? 'gatePassPrintedAt' THEN "vRec"."gatePassPrintedAt" ELSE t."gatePassPrintedAt" END,
           "stockTransferId" = CASE WHEN "pData" ? 'stockTransferId' THEN "vRec"."stockTransferId" ELSE t."stockTransferId" END,
           "dispatchedAt" = CASE WHEN "pData" ? 'dispatchedAt' THEN "vRec"."dispatchedAt" ELSE t."dispatchedAt" END,
           "dispatchedByUserId" = CASE WHEN "pData" ? 'dispatchedByUserId' THEN "vRec"."dispatchedByUserId" ELSE t."dispatchedByUserId" END,
           "returnedAt" = CASE WHEN "pData" ? 'returnedAt' THEN "vRec"."returnedAt" ELSE t."returnedAt" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Distribution"."LoadSheets" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'LoadSheets %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'LoadSheets % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Distribution"."LoadSheetLines"
     WHERE "tenantId" = "vTenant" AND "deliveryRunId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1LoadSheetLines" := jsonb_populate_record(NULL::"Distribution"."LoadSheetLines", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Distribution"."LoadSheetLines" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1LoadSheetLines"."itemId" ELSE t."itemId" END,
               "batchId" = CASE WHEN "vE1" ? 'batchId' THEN "vC1LoadSheetLines"."batchId" ELSE t."batchId" END,
               "shelfCode" = CASE WHEN "vE1" ? 'shelfCode' THEN "vC1LoadSheetLines"."shelfCode" ELSE t."shelfCode" END,
               "unitsPerCtn" = CASE WHEN "vE1" ? 'unitsPerCtn' THEN "vC1LoadSheetLines"."unitsPerCtn" ELSE t."unitsPerCtn" END,
               "qtyCtn" = CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1LoadSheetLines"."qtyCtn" ELSE t."qtyCtn" END,
               "qtyLoose" = CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1LoadSheetLines"."qtyLoose" ELSE t."qtyLoose" END,
               "weightKg" = CASE WHEN "vE1" ? 'weightKg' THEN "vC1LoadSheetLines"."weightKg" ELSE t."weightKg" END,
               "valueAmount" = CASE WHEN "vE1" ? 'valueAmount' THEN "vC1LoadSheetLines"."valueAmount" ELSE t."valueAmount" END,
               "isPicked" = CASE WHEN "vE1" ? 'isPicked' THEN "vC1LoadSheetLines"."isPicked" ELSE t."isPicked" END,
               "pickedAt" = CASE WHEN "vE1" ? 'pickedAt' THEN "vC1LoadSheetLines"."pickedAt" ELSE t."pickedAt" END,
               "pickedByUserId" = CASE WHEN "vE1" ? 'pickedByUserId' THEN "vC1LoadSheetLines"."pickedByUserId" ELSE t."pickedByUserId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."deliveryRunId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'LoadSheetLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Distribution"."LoadSheetLines" ("deliveryRunId", "tenantId", "itemId", "batchId", "shelfCode", "unitsPerCtn", "qtyCtn", "qtyLoose", "weightKg", "valueAmount", "isPicked", "pickedAt", "pickedByUserId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'itemId' THEN "vC1LoadSheetLines"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'batchId' THEN "vC1LoadSheetLines"."batchId" ELSE NULL END, CASE WHEN "vE1" ? 'shelfCode' THEN "vC1LoadSheetLines"."shelfCode" ELSE NULL END, CASE WHEN "vE1" ? 'unitsPerCtn' THEN "vC1LoadSheetLines"."unitsPerCtn" ELSE 1 END, CASE WHEN "vE1" ? 'qtyCtn' THEN "vC1LoadSheetLines"."qtyCtn" ELSE 0 END, CASE WHEN "vE1" ? 'qtyLoose' THEN "vC1LoadSheetLines"."qtyLoose" ELSE 0 END, CASE WHEN "vE1" ? 'weightKg' THEN "vC1LoadSheetLines"."weightKg" ELSE 0 END, CASE WHEN "vE1" ? 'valueAmount' THEN "vC1LoadSheetLines"."valueAmount" ELSE 0 END, CASE WHEN "vE1" ? 'isPicked' THEN "vC1LoadSheetLines"."isPicked" ELSE FALSE END, CASE WHEN "vE1" ? 'pickedAt' THEN "vC1LoadSheetLines"."pickedAt" ELSE NULL END, CASE WHEN "vE1" ? 'pickedByUserId' THEN "vC1LoadSheetLines"."pickedByUserId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'invoices' THEN
    -- invoices: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Distribution"."LoadSheetInvoices"
     WHERE "tenantId" = "vTenant" AND "deliveryRunId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'invoices') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'invoices') WITH ORDINALITY t(x, n) LOOP
      "vC1LoadSheetInvoices" := jsonb_populate_record(NULL::"Distribution"."LoadSheetInvoices", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Distribution"."LoadSheetInvoices" t
           SET "invoiceId" = CASE WHEN "vE1" ? 'invoiceId' THEN "vC1LoadSheetInvoices"."invoiceId" ELSE t."invoiceId" END,
               "customerId" = CASE WHEN "vE1" ? 'customerId' THEN "vC1LoadSheetInvoices"."customerId" ELSE t."customerId" END,
               "stopSeq" = CASE WHEN "vE1" ? 'stopSeq' THEN "vC1LoadSheetInvoices"."stopSeq" ELSE t."stopSeq" END,
               "lineCount" = CASE WHEN "vE1" ? 'lineCount' THEN "vC1LoadSheetInvoices"."lineCount" ELSE t."lineCount" END,
               "ctnEquiv" = CASE WHEN "vE1" ? 'ctnEquiv' THEN "vC1LoadSheetInvoices"."ctnEquiv" ELSE t."ctnEquiv" END,
               "invoiceAmount" = CASE WHEN "vE1" ? 'invoiceAmount' THEN "vC1LoadSheetInvoices"."invoiceAmount" ELSE t."invoiceAmount" END,
               "releasedAt" = CASE WHEN "vE1" ? 'releasedAt' THEN "vC1LoadSheetInvoices"."releasedAt" ELSE t."releasedAt" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."deliveryRunId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'LoadSheetInvoices: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Distribution"."LoadSheetInvoices" ("deliveryRunId", "tenantId", "invoiceId", "customerId", "stopSeq", "lineCount", "ctnEquiv", "invoiceAmount", "releasedAt")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'invoiceId' THEN "vC1LoadSheetInvoices"."invoiceId" ELSE NULL END, CASE WHEN "vE1" ? 'customerId' THEN "vC1LoadSheetInvoices"."customerId" ELSE NULL END, CASE WHEN "vE1" ? 'stopSeq' THEN "vC1LoadSheetInvoices"."stopSeq" ELSE NULL END, CASE WHEN "vE1" ? 'lineCount' THEN "vC1LoadSheetInvoices"."lineCount" ELSE 0 END, CASE WHEN "vE1" ? 'ctnEquiv' THEN "vC1LoadSheetInvoices"."ctnEquiv" ELSE 0 END, CASE WHEN "vE1" ? 'invoiceAmount' THEN "vC1LoadSheetInvoices"."invoiceAmount" ELSE NULL END, CASE WHEN "vE1" ? 'releasedAt' THEN "vC1LoadSheetInvoices"."releasedAt" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Distribution"."loadSheetAddUpdate"(jsonb) IS 'Save (insert or update) one LoadSheets record with its lines, invoices.';

-- LoadSheets: one record as JSON (camelCase keys), with lookup labels and lines, invoices
CREATE OR REPLACE FUNCTION "Distribution"."getLoadSheetInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('LoadSheetStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('LoadSheetStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Distribution"."LoadSheetLines" c1 WHERE c1."deliveryRunId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'invoices', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Distribution"."LoadSheetInvoices" c1 WHERE c1."deliveryRunId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Distribution"."LoadSheets" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Distribution"."getLoadSheetInfo"(uuid) IS 'Read one LoadSheets record (getter for its screens).';

-- LoadSheets: Cancel (status -> CANCELLED); allowed from LOADING, SCHEDULED, DISPATCHED, SETTLED
CREATE OR REPLACE FUNCTION "Distribution"."loadSheetCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Distribution"."LoadSheets";
BEGIN
  SELECT * INTO "vRow" FROM "Distribution"."LoadSheets" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LoadSheets % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('LOADING', 'SCHEDULED', 'DISPATCHED', 'SETTLED') THEN
    RAISE EXCEPTION 'LoadSheets %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Distribution"."loadSheetCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Distribution"."loadSheetCancelEntries"') USING "pId";
  END IF;
  UPDATE "Distribution"."LoadSheets" t SET status = 'CANCELLED', "cancelledAt" = now() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- LoadSheets: Dispatch (status -> DISPATCHED); allowed from LOADING, SCHEDULED
CREATE OR REPLACE FUNCTION "Distribution"."loadSheetDispatch"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Distribution"."LoadSheets";
BEGIN
  SELECT * INTO "vRow" FROM "Distribution"."LoadSheets" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LoadSheets % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'DISPATCHED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('LOADING', 'SCHEDULED') THEN
    RAISE EXCEPTION 'LoadSheets %: cannot dispatch from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Distribution"."loadSheetDispatchEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Distribution"."loadSheetDispatchEntries"') USING "pId";
  END IF;
  UPDATE "Distribution"."LoadSheets" t SET status = 'DISPATCHED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- RouteSettlements: insert (no "id") or update (with "id"); child arrays: cashCounts, cheques, lines, returns, vanStockCounts
CREATE OR REPLACE FUNCTION "Distribution"."routeSettlementAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Distribution"."RouteSettlements";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1RouteSettlementCashCounts" "Distribution"."RouteSettlementCashCounts";
  "vC1RouteSettlementCheques" "Distribution"."RouteSettlementCheques";
  "vC1RouteSettlementLines" "Distribution"."RouteSettlementLines";
  "vC1RouteSettlementReturns" "Distribution"."RouteSettlementReturns";
  "vC1VanStockCounts" "Distribution"."VanStockCounts";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Distribution"."RouteSettlements", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('RS', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Distribution"."RouteSettlements" ("tenantId", "branchId", "docNo", "docDate", "deliveryRunId", "salesmanEmployeeId", "cashAccountId", "invoiceTotal", "returnTotal", "returnCostTotal", "cashExpected", "cashCounted", "chequeTotal", "creditTotal", "unexplainedShortTotal", "unexplainedExcessTotal", "stockVarianceLines", "stockVarianceValue", "returnTransferId", remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'deliveryRunId' THEN "vRec"."deliveryRunId" ELSE NULL END, CASE WHEN "pData" ? 'salesmanEmployeeId' THEN "vRec"."salesmanEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE NULL END, CASE WHEN "pData" ? 'invoiceTotal' THEN "vRec"."invoiceTotal" ELSE 0 END, CASE WHEN "pData" ? 'returnTotal' THEN "vRec"."returnTotal" ELSE 0 END, CASE WHEN "pData" ? 'returnCostTotal' THEN "vRec"."returnCostTotal" ELSE 0 END, CASE WHEN "pData" ? 'cashExpected' THEN "vRec"."cashExpected" ELSE 0 END, CASE WHEN "pData" ? 'cashCounted' THEN "vRec"."cashCounted" ELSE 0 END, CASE WHEN "pData" ? 'chequeTotal' THEN "vRec"."chequeTotal" ELSE 0 END, CASE WHEN "pData" ? 'creditTotal' THEN "vRec"."creditTotal" ELSE 0 END, CASE WHEN "pData" ? 'unexplainedShortTotal' THEN "vRec"."unexplainedShortTotal" ELSE 0 END, CASE WHEN "pData" ? 'unexplainedExcessTotal' THEN "vRec"."unexplainedExcessTotal" ELSE 0 END, CASE WHEN "pData" ? 'stockVarianceLines' THEN "vRec"."stockVarianceLines" ELSE 0 END, CASE WHEN "pData" ? 'stockVarianceValue' THEN "vRec"."stockVarianceValue" ELSE 0 END, CASE WHEN "pData" ? 'returnTransferId' THEN "vRec"."returnTransferId" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Distribution"."RouteSettlements" t
       SET "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "deliveryRunId" = CASE WHEN "pData" ? 'deliveryRunId' THEN "vRec"."deliveryRunId" ELSE t."deliveryRunId" END,
           "salesmanEmployeeId" = CASE WHEN "pData" ? 'salesmanEmployeeId' THEN "vRec"."salesmanEmployeeId" ELSE t."salesmanEmployeeId" END,
           "cashAccountId" = CASE WHEN "pData" ? 'cashAccountId' THEN "vRec"."cashAccountId" ELSE t."cashAccountId" END,
           "invoiceTotal" = CASE WHEN "pData" ? 'invoiceTotal' THEN "vRec"."invoiceTotal" ELSE t."invoiceTotal" END,
           "returnTotal" = CASE WHEN "pData" ? 'returnTotal' THEN "vRec"."returnTotal" ELSE t."returnTotal" END,
           "returnCostTotal" = CASE WHEN "pData" ? 'returnCostTotal' THEN "vRec"."returnCostTotal" ELSE t."returnCostTotal" END,
           "cashExpected" = CASE WHEN "pData" ? 'cashExpected' THEN "vRec"."cashExpected" ELSE t."cashExpected" END,
           "cashCounted" = CASE WHEN "pData" ? 'cashCounted' THEN "vRec"."cashCounted" ELSE t."cashCounted" END,
           "chequeTotal" = CASE WHEN "pData" ? 'chequeTotal' THEN "vRec"."chequeTotal" ELSE t."chequeTotal" END,
           "creditTotal" = CASE WHEN "pData" ? 'creditTotal' THEN "vRec"."creditTotal" ELSE t."creditTotal" END,
           "unexplainedShortTotal" = CASE WHEN "pData" ? 'unexplainedShortTotal' THEN "vRec"."unexplainedShortTotal" ELSE t."unexplainedShortTotal" END,
           "unexplainedExcessTotal" = CASE WHEN "pData" ? 'unexplainedExcessTotal' THEN "vRec"."unexplainedExcessTotal" ELSE t."unexplainedExcessTotal" END,
           "stockVarianceLines" = CASE WHEN "pData" ? 'stockVarianceLines' THEN "vRec"."stockVarianceLines" ELSE t."stockVarianceLines" END,
           "stockVarianceValue" = CASE WHEN "pData" ? 'stockVarianceValue' THEN "vRec"."stockVarianceValue" ELSE t."stockVarianceValue" END,
           "returnTransferId" = CASE WHEN "pData" ? 'returnTransferId' THEN "vRec"."returnTransferId" ELSE t."returnTransferId" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Distribution"."RouteSettlements" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'RouteSettlements %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'RouteSettlements % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'cashCounts' THEN
    -- cashCounts: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Distribution"."RouteSettlementCashCounts"
     WHERE "tenantId" = "vTenant" AND "runSettlementId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'cashCounts') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'cashCounts') WITH ORDINALITY t(x, n) LOOP
      "vC1RouteSettlementCashCounts" := jsonb_populate_record(NULL::"Distribution"."RouteSettlementCashCounts", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Distribution"."RouteSettlementCashCounts" t
           SET denomination = CASE WHEN "vE1" ? 'denomination' THEN "vC1RouteSettlementCashCounts".denomination ELSE t.denomination END,
               "noteCount" = CASE WHEN "vE1" ? 'noteCount' THEN "vC1RouteSettlementCashCounts"."noteCount" ELSE t."noteCount" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."runSettlementId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'RouteSettlementCashCounts: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Distribution"."RouteSettlementCashCounts" ("runSettlementId", "tenantId", denomination, "noteCount")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'denomination' THEN "vC1RouteSettlementCashCounts".denomination ELSE NULL END, CASE WHEN "vE1" ? 'noteCount' THEN "vC1RouteSettlementCashCounts"."noteCount" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'cheques' THEN
    -- cheques: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Distribution"."RouteSettlementCheques"
     WHERE "tenantId" = "vTenant" AND "runSettlementId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'cheques') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'cheques') WITH ORDINALITY t(x, n) LOOP
      "vC1RouteSettlementCheques" := jsonb_populate_record(NULL::"Distribution"."RouteSettlementCheques", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Distribution"."RouteSettlementCheques" t
           SET "settlementLineId" = CASE WHEN "vE1" ? 'settlementLineId' THEN "vC1RouteSettlementCheques"."settlementLineId" ELSE t."settlementLineId" END,
               "chequeNo" = CASE WHEN "vE1" ? 'chequeNo' THEN "vC1RouteSettlementCheques"."chequeNo" ELSE t."chequeNo" END,
               "bankId" = CASE WHEN "vE1" ? 'bankId' THEN "vC1RouteSettlementCheques"."bankId" ELSE t."bankId" END,
               "bankName" = CASE WHEN "vE1" ? 'bankName' THEN "vC1RouteSettlementCheques"."bankName" ELSE t."bankName" END,
               "chequeDate" = CASE WHEN "vE1" ? 'chequeDate' THEN "vC1RouteSettlementCheques"."chequeDate" ELSE t."chequeDate" END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1RouteSettlementCheques".amount ELSE t.amount END,
               "chequeId" = CASE WHEN "vE1" ? 'chequeId' THEN "vC1RouteSettlementCheques"."chequeId" ELSE t."chequeId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."runSettlementId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'RouteSettlementCheques: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Distribution"."RouteSettlementCheques" ("runSettlementId", "tenantId", "settlementLineId", "chequeNo", "bankId", "bankName", "chequeDate", amount, "chequeId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'settlementLineId' THEN "vC1RouteSettlementCheques"."settlementLineId" ELSE NULL END, CASE WHEN "vE1" ? 'chequeNo' THEN "vC1RouteSettlementCheques"."chequeNo" ELSE NULL END, CASE WHEN "vE1" ? 'bankId' THEN "vC1RouteSettlementCheques"."bankId" ELSE NULL END, CASE WHEN "vE1" ? 'bankName' THEN "vC1RouteSettlementCheques"."bankName" ELSE NULL END, CASE WHEN "vE1" ? 'chequeDate' THEN "vC1RouteSettlementCheques"."chequeDate" ELSE NULL END, CASE WHEN "vE1" ? 'amount' THEN "vC1RouteSettlementCheques".amount ELSE NULL END, CASE WHEN "vE1" ? 'chequeId' THEN "vC1RouteSettlementCheques"."chequeId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Distribution"."RouteSettlementLines"
     WHERE "tenantId" = "vTenant" AND "runSettlementId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1RouteSettlementLines" := jsonb_populate_record(NULL::"Distribution"."RouteSettlementLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1RouteSettlementLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Distribution"."RouteSettlementLines" t
           SET "invoiceId" = CASE WHEN "vE1" ? 'invoiceId' THEN "vC1RouteSettlementLines"."invoiceId" ELSE t."invoiceId" END,
               "customerId" = CASE WHEN "vE1" ? 'customerId' THEN "vC1RouteSettlementLines"."customerId" ELSE t."customerId" END,
               "invoiceAmount" = CASE WHEN "vE1" ? 'invoiceAmount' THEN "vC1RouteSettlementLines"."invoiceAmount" ELSE t."invoiceAmount" END,
               "returnAmount" = CASE WHEN "vE1" ? 'returnAmount' THEN "vC1RouteSettlementLines"."returnAmount" ELSE t."returnAmount" END,
               "deliveryState" = CASE WHEN "vE1" ? 'deliveryState' THEN "vC1RouteSettlementLines"."deliveryState" ELSE t."deliveryState" END,
               "nonDeliveryReason" = CASE WHEN "vE1" ? 'nonDeliveryReason' THEN "vC1RouteSettlementLines"."nonDeliveryReason" ELSE t."nonDeliveryReason" END,
               "cashAmount" = CASE WHEN "vE1" ? 'cashAmount' THEN "vC1RouteSettlementLines"."cashAmount" ELSE t."cashAmount" END,
               "chequeAmount" = CASE WHEN "vE1" ? 'chequeAmount' THEN "vC1RouteSettlementLines"."chequeAmount" ELSE t."chequeAmount" END,
               "creditAmount" = CASE WHEN "vE1" ? 'creditAmount' THEN "vC1RouteSettlementLines"."creditAmount" ELSE t."creditAmount" END,
               "receiptId" = CASE WHEN "vE1" ? 'receiptId' THEN "vC1RouteSettlementLines"."receiptId" ELSE t."receiptId" END,
               "salesReturnId" = CASE WHEN "vE1" ? 'salesReturnId' THEN "vC1RouteSettlementLines"."salesReturnId" ELSE t."salesReturnId" END,
               "lineNo" = "vC1RouteSettlementLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."runSettlementId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'RouteSettlementLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Distribution"."RouteSettlementLines" ("runSettlementId", "tenantId", "lineNo", "invoiceId", "customerId", "invoiceAmount", "returnAmount", "deliveryState", "nonDeliveryReason", "cashAmount", "chequeAmount", "creditAmount", "receiptId", "salesReturnId")
        VALUES ("vRet", "vTenant", "vC1RouteSettlementLines"."lineNo", CASE WHEN "vE1" ? 'invoiceId' THEN "vC1RouteSettlementLines"."invoiceId" ELSE NULL END, CASE WHEN "vE1" ? 'customerId' THEN "vC1RouteSettlementLines"."customerId" ELSE NULL END, CASE WHEN "vE1" ? 'invoiceAmount' THEN "vC1RouteSettlementLines"."invoiceAmount" ELSE NULL END, CASE WHEN "vE1" ? 'returnAmount' THEN "vC1RouteSettlementLines"."returnAmount" ELSE 0 END, CASE WHEN "vE1" ? 'deliveryState' THEN "vC1RouteSettlementLines"."deliveryState" ELSE 'FULL' END, CASE WHEN "vE1" ? 'nonDeliveryReason' THEN "vC1RouteSettlementLines"."nonDeliveryReason" ELSE NULL END, CASE WHEN "vE1" ? 'cashAmount' THEN "vC1RouteSettlementLines"."cashAmount" ELSE 0 END, CASE WHEN "vE1" ? 'chequeAmount' THEN "vC1RouteSettlementLines"."chequeAmount" ELSE 0 END, CASE WHEN "vE1" ? 'creditAmount' THEN "vC1RouteSettlementLines"."creditAmount" ELSE 0 END, CASE WHEN "vE1" ? 'receiptId' THEN "vC1RouteSettlementLines"."receiptId" ELSE NULL END, CASE WHEN "vE1" ? 'salesReturnId' THEN "vC1RouteSettlementLines"."salesReturnId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'returns' THEN
    -- returns: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Distribution"."RouteSettlementReturns"
     WHERE "tenantId" = "vTenant" AND "runSettlementId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'returns') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'returns') WITH ORDINALITY t(x, n) LOOP
      "vC1RouteSettlementReturns" := jsonb_populate_record(NULL::"Distribution"."RouteSettlementReturns", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Distribution"."RouteSettlementReturns" t
           SET "settlementLineId" = CASE WHEN "vE1" ? 'settlementLineId' THEN "vC1RouteSettlementReturns"."settlementLineId" ELSE t."settlementLineId" END,
               "invoiceLineId" = CASE WHEN "vE1" ? 'invoiceLineId' THEN "vC1RouteSettlementReturns"."invoiceLineId" ELSE t."invoiceLineId" END,
               "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1RouteSettlementReturns"."itemId" ELSE t."itemId" END,
               "batchId" = CASE WHEN "vE1" ? 'batchId' THEN "vC1RouteSettlementReturns"."batchId" ELSE t."batchId" END,
               "suppliedQty" = CASE WHEN "vE1" ? 'suppliedQty' THEN "vC1RouteSettlementReturns"."suppliedQty" ELSE t."suppliedQty" END,
               "returnQty" = CASE WHEN "vE1" ? 'returnQty' THEN "vC1RouteSettlementReturns"."returnQty" ELSE t."returnQty" END,
               "unitPrice" = CASE WHEN "vE1" ? 'unitPrice' THEN "vC1RouteSettlementReturns"."unitPrice" ELSE t."unitPrice" END,
               "unitCost" = CASE WHEN "vE1" ? 'unitCost' THEN "vC1RouteSettlementReturns"."unitCost" ELSE t."unitCost" END,
               reason = CASE WHEN "vE1" ? 'reason' THEN "vC1RouteSettlementReturns".reason ELSE t.reason END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."runSettlementId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'RouteSettlementReturns: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Distribution"."RouteSettlementReturns" ("runSettlementId", "tenantId", "settlementLineId", "invoiceLineId", "itemId", "batchId", "suppliedQty", "returnQty", "unitPrice", "unitCost", reason)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'settlementLineId' THEN "vC1RouteSettlementReturns"."settlementLineId" ELSE NULL END, CASE WHEN "vE1" ? 'invoiceLineId' THEN "vC1RouteSettlementReturns"."invoiceLineId" ELSE NULL END, CASE WHEN "vE1" ? 'itemId' THEN "vC1RouteSettlementReturns"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'batchId' THEN "vC1RouteSettlementReturns"."batchId" ELSE NULL END, CASE WHEN "vE1" ? 'suppliedQty' THEN "vC1RouteSettlementReturns"."suppliedQty" ELSE NULL END, CASE WHEN "vE1" ? 'returnQty' THEN "vC1RouteSettlementReturns"."returnQty" ELSE NULL END, CASE WHEN "vE1" ? 'unitPrice' THEN "vC1RouteSettlementReturns"."unitPrice" ELSE NULL END, CASE WHEN "vE1" ? 'unitCost' THEN "vC1RouteSettlementReturns"."unitCost" ELSE NULL END, CASE WHEN "vE1" ? 'reason' THEN "vC1RouteSettlementReturns".reason ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'vanStockCounts' THEN
    -- vanStockCounts: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Distribution"."VanStockCounts"
     WHERE "tenantId" = "vTenant" AND "runSettlementId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'vanStockCounts') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'vanStockCounts') WITH ORDINALITY t(x, n) LOOP
      "vC1VanStockCounts" := jsonb_populate_record(NULL::"Distribution"."VanStockCounts", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Distribution"."VanStockCounts" t
           SET "itemId" = CASE WHEN "vE1" ? 'itemId' THEN "vC1VanStockCounts"."itemId" ELSE t."itemId" END,
               "unitsPerCtn" = CASE WHEN "vE1" ? 'unitsPerCtn' THEN "vC1VanStockCounts"."unitsPerCtn" ELSE t."unitsPerCtn" END,
               "loadedQty" = CASE WHEN "vE1" ? 'loadedQty' THEN "vC1VanStockCounts"."loadedQty" ELSE t."loadedQty" END,
               "deliveredQty" = CASE WHEN "vE1" ? 'deliveredQty' THEN "vC1VanStockCounts"."deliveredQty" ELSE t."deliveredQty" END,
               "returnedQty" = CASE WHEN "vE1" ? 'returnedQty' THEN "vC1VanStockCounts"."returnedQty" ELSE t."returnedQty" END,
               "countedQty" = CASE WHEN "vE1" ? 'countedQty' THEN "vC1VanStockCounts"."countedQty" ELSE t."countedQty" END,
               "unitCost" = CASE WHEN "vE1" ? 'unitCost' THEN "vC1VanStockCounts"."unitCost" ELSE t."unitCost" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."runSettlementId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'VanStockCounts: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Distribution"."VanStockCounts" ("runSettlementId", "tenantId", "itemId", "unitsPerCtn", "loadedQty", "deliveredQty", "returnedQty", "countedQty", "unitCost")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'itemId' THEN "vC1VanStockCounts"."itemId" ELSE NULL END, CASE WHEN "vE1" ? 'unitsPerCtn' THEN "vC1VanStockCounts"."unitsPerCtn" ELSE 1 END, CASE WHEN "vE1" ? 'loadedQty' THEN "vC1VanStockCounts"."loadedQty" ELSE NULL END, CASE WHEN "vE1" ? 'deliveredQty' THEN "vC1VanStockCounts"."deliveredQty" ELSE NULL END, CASE WHEN "vE1" ? 'returnedQty' THEN "vC1VanStockCounts"."returnedQty" ELSE NULL END, CASE WHEN "vE1" ? 'countedQty' THEN "vC1VanStockCounts"."countedQty" ELSE NULL END, CASE WHEN "vE1" ? 'unitCost' THEN "vC1VanStockCounts"."unitCost" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Distribution"."routeSettlementAddUpdate"(jsonb) IS 'Save (insert or update) one RouteSettlements record with its cashCounts, cheques, lines, returns, vanStockCounts.';

-- RouteSettlements: one record as JSON (camelCase keys), with lookup labels and cashCounts, cheques, lines, returns, vanStockCounts
CREATE OR REPLACE FUNCTION "Distribution"."getRouteSettlementInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('RouteSettlementStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('RouteSettlementStatus', t.status) ->> 'tone') ||
         jsonb_build_object('cashCounts', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Distribution"."RouteSettlementCashCounts" c1 WHERE c1."runSettlementId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'cheques', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Distribution"."RouteSettlementCheques" c1 WHERE c1."runSettlementId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Distribution"."RouteSettlementLines" c1 WHERE c1."runSettlementId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'returns', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Distribution"."RouteSettlementReturns" c1 WHERE c1."runSettlementId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'vanStockCounts', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Distribution"."VanStockCounts" c1 WHERE c1."runSettlementId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Distribution"."RouteSettlements" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Distribution"."getRouteSettlementInfo"(uuid) IS 'Read one RouteSettlements record (getter for its screens).';

-- RouteSettlements: Post (status -> SETTLED); allowed from OPEN
CREATE OR REPLACE FUNCTION "Distribution"."routeSettlementPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Distribution"."RouteSettlements";
BEGIN
  SELECT * INTO "vRow" FROM "Distribution"."RouteSettlements" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RouteSettlements % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'SETTLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('OPEN') THEN
    RAISE EXCEPTION 'RouteSettlements %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Distribution"."routeSettlementPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Distribution"."routeSettlementPostEntries"') USING "pId";
  END IF;
  UPDATE "Distribution"."RouteSettlements" t SET status = 'SETTLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- RecoverySheets: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Distribution"."recoverySheetAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Distribution"."RecoverySheets";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1RecoverySheetLines" "Distribution"."RecoverySheetLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Distribution"."RecoverySheets", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('RCV', "vRec"."docDate", "vRec"."branchId");
    END IF;
    INSERT INTO "Distribution"."RecoverySheets" ("tenantId", "branchId", "docNo", "docDate", "salesmanEmployeeId", "routeId", "shopCount", "targetAmount", "outstandingTotal", "collectedTotal", "printedAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE NULL END, CASE WHEN "pData" ? 'salesmanEmployeeId' THEN "vRec"."salesmanEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE NULL END, CASE WHEN "pData" ? 'shopCount' THEN "vRec"."shopCount" ELSE 0 END, CASE WHEN "pData" ? 'targetAmount' THEN "vRec"."targetAmount" ELSE 0 END, CASE WHEN "pData" ? 'outstandingTotal' THEN "vRec"."outstandingTotal" ELSE 0 END, CASE WHEN "pData" ? 'collectedTotal' THEN "vRec"."collectedTotal" ELSE 0 END, CASE WHEN "pData" ? 'printedAt' THEN "vRec"."printedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Distribution"."RecoverySheets" t
       SET "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "salesmanEmployeeId" = CASE WHEN "pData" ? 'salesmanEmployeeId' THEN "vRec"."salesmanEmployeeId" ELSE t."salesmanEmployeeId" END,
           "routeId" = CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE t."routeId" END,
           "shopCount" = CASE WHEN "pData" ? 'shopCount' THEN "vRec"."shopCount" ELSE t."shopCount" END,
           "targetAmount" = CASE WHEN "pData" ? 'targetAmount' THEN "vRec"."targetAmount" ELSE t."targetAmount" END,
           "outstandingTotal" = CASE WHEN "pData" ? 'outstandingTotal' THEN "vRec"."outstandingTotal" ELSE t."outstandingTotal" END,
           "collectedTotal" = CASE WHEN "pData" ? 'collectedTotal' THEN "vRec"."collectedTotal" ELSE t."collectedTotal" END,
           "printedAt" = CASE WHEN "pData" ? 'printedAt' THEN "vRec"."printedAt" ELSE t."printedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Distribution"."RecoverySheets" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'RecoverySheets %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'RecoverySheets % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Distribution"."RecoverySheetLines"
     WHERE "tenantId" = "vTenant" AND "recoverySheetId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1RecoverySheetLines" := jsonb_populate_record(NULL::"Distribution"."RecoverySheetLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1RecoverySheetLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Distribution"."RecoverySheetLines" t
           SET "customerId" = CASE WHEN "vE1" ? 'customerId' THEN "vC1RecoverySheetLines"."customerId" ELSE t."customerId" END,
               "outstandingAmount" = CASE WHEN "vE1" ? 'outstandingAmount' THEN "vC1RecoverySheetLines"."outstandingAmount" ELSE t."outstandingAmount" END,
               age030 = CASE WHEN "vE1" ? 'age030' THEN "vC1RecoverySheetLines".age030 ELSE t.age030 END,
               age3160 = CASE WHEN "vE1" ? 'age3160' THEN "vC1RecoverySheetLines".age3160 ELSE t.age3160 END,
               age6190 = CASE WHEN "vE1" ? 'age6190' THEN "vC1RecoverySheetLines".age6190 ELSE t.age6190 END,
               "age90Plus" = CASE WHEN "vE1" ? 'age90Plus' THEN "vC1RecoverySheetLines"."age90Plus" ELSE t."age90Plus" END,
               "creditLimit" = CASE WHEN "vE1" ? 'creditLimit' THEN "vC1RecoverySheetLines"."creditLimit" ELSE t."creditLimit" END,
               "lastPaymentDate" = CASE WHEN "vE1" ? 'lastPaymentDate' THEN "vC1RecoverySheetLines"."lastPaymentDate" ELSE t."lastPaymentDate" END,
               "lastPaymentAmount" = CASE WHEN "vE1" ? 'lastPaymentAmount' THEN "vC1RecoverySheetLines"."lastPaymentAmount" ELSE t."lastPaymentAmount" END,
               "targetAmount" = CASE WHEN "vE1" ? 'targetAmount' THEN "vC1RecoverySheetLines"."targetAmount" ELSE t."targetAmount" END,
               "collectedAmount" = CASE WHEN "vE1" ? 'collectedAmount' THEN "vC1RecoverySheetLines"."collectedAmount" ELSE t."collectedAmount" END,
               mode = CASE WHEN "vE1" ? 'mode' THEN "vC1RecoverySheetLines".mode ELSE t.mode END,
               remarks = CASE WHEN "vE1" ? 'remarks' THEN "vC1RecoverySheetLines".remarks ELSE t.remarks END,
               "chequeId" = CASE WHEN "vE1" ? 'chequeId' THEN "vC1RecoverySheetLines"."chequeId" ELSE t."chequeId" END,
               "depositBankAccountId" = CASE WHEN "vE1" ? 'depositBankAccountId' THEN "vC1RecoverySheetLines"."depositBankAccountId" ELSE t."depositBankAccountId" END,
               "promiseToPayDate" = CASE WHEN "vE1" ? 'promiseToPayDate' THEN "vC1RecoverySheetLines"."promiseToPayDate" ELSE t."promiseToPayDate" END,
               "remindedAt" = CASE WHEN "vE1" ? 'remindedAt' THEN "vC1RecoverySheetLines"."remindedAt" ELSE t."remindedAt" END,
               "reminderLanguage" = CASE WHEN "vE1" ? 'reminderLanguage' THEN "vC1RecoverySheetLines"."reminderLanguage" ELSE t."reminderLanguage" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1RecoverySheetLines".status ELSE t.status END,
               "receiptId" = CASE WHEN "vE1" ? 'receiptId' THEN "vC1RecoverySheetLines"."receiptId" ELSE t."receiptId" END,
               "postedAt" = CASE WHEN "vE1" ? 'postedAt' THEN "vC1RecoverySheetLines"."postedAt" ELSE t."postedAt" END,
               "postedByUserId" = CASE WHEN "vE1" ? 'postedByUserId' THEN "vC1RecoverySheetLines"."postedByUserId" ELSE t."postedByUserId" END,
               "lineNo" = "vC1RecoverySheetLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."recoverySheetId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'RecoverySheetLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Distribution"."RecoverySheetLines" ("recoverySheetId", "tenantId", "lineNo", "customerId", "outstandingAmount", age030, age3160, age6190, "age90Plus", "creditLimit", "lastPaymentDate", "lastPaymentAmount", "targetAmount", "collectedAmount", mode, remarks, "chequeId", "depositBankAccountId", "promiseToPayDate", "remindedAt", "reminderLanguage", status, "receiptId", "postedAt", "postedByUserId")
        VALUES ("vRet", "vTenant", "vC1RecoverySheetLines"."lineNo", CASE WHEN "vE1" ? 'customerId' THEN "vC1RecoverySheetLines"."customerId" ELSE NULL END, CASE WHEN "vE1" ? 'outstandingAmount' THEN "vC1RecoverySheetLines"."outstandingAmount" ELSE NULL END, CASE WHEN "vE1" ? 'age030' THEN "vC1RecoverySheetLines".age030 ELSE 0 END, CASE WHEN "vE1" ? 'age3160' THEN "vC1RecoverySheetLines".age3160 ELSE 0 END, CASE WHEN "vE1" ? 'age6190' THEN "vC1RecoverySheetLines".age6190 ELSE 0 END, CASE WHEN "vE1" ? 'age90Plus' THEN "vC1RecoverySheetLines"."age90Plus" ELSE 0 END, CASE WHEN "vE1" ? 'creditLimit' THEN "vC1RecoverySheetLines"."creditLimit" ELSE NULL END, CASE WHEN "vE1" ? 'lastPaymentDate' THEN "vC1RecoverySheetLines"."lastPaymentDate" ELSE NULL END, CASE WHEN "vE1" ? 'lastPaymentAmount' THEN "vC1RecoverySheetLines"."lastPaymentAmount" ELSE NULL END, CASE WHEN "vE1" ? 'targetAmount' THEN "vC1RecoverySheetLines"."targetAmount" ELSE 0 END, CASE WHEN "vE1" ? 'collectedAmount' THEN "vC1RecoverySheetLines"."collectedAmount" ELSE 0 END, CASE WHEN "vE1" ? 'mode' THEN "vC1RecoverySheetLines".mode ELSE 'CASH' END, CASE WHEN "vE1" ? 'remarks' THEN "vC1RecoverySheetLines".remarks ELSE NULL END, CASE WHEN "vE1" ? 'chequeId' THEN "vC1RecoverySheetLines"."chequeId" ELSE NULL END, CASE WHEN "vE1" ? 'depositBankAccountId' THEN "vC1RecoverySheetLines"."depositBankAccountId" ELSE NULL END, CASE WHEN "vE1" ? 'promiseToPayDate' THEN "vC1RecoverySheetLines"."promiseToPayDate" ELSE NULL END, CASE WHEN "vE1" ? 'remindedAt' THEN "vC1RecoverySheetLines"."remindedAt" ELSE NULL END, CASE WHEN "vE1" ? 'reminderLanguage' THEN "vC1RecoverySheetLines"."reminderLanguage" ELSE NULL END, CASE WHEN "vE1" ? 'status' THEN "vC1RecoverySheetLines".status ELSE 'PENDING' END, CASE WHEN "vE1" ? 'receiptId' THEN "vC1RecoverySheetLines"."receiptId" ELSE NULL END, CASE WHEN "vE1" ? 'postedAt' THEN "vC1RecoverySheetLines"."postedAt" ELSE NULL END, CASE WHEN "vE1" ? 'postedByUserId' THEN "vC1RecoverySheetLines"."postedByUserId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Distribution"."recoverySheetAddUpdate"(jsonb) IS 'Save (insert or update) one RecoverySheets record with its lines.';

-- RecoverySheets: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Distribution"."getRecoverySheetInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('RecoverySheetStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('RecoverySheetStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Distribution"."RecoverySheetLines" c1 WHERE c1."recoverySheetId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Distribution"."RecoverySheets" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Distribution"."getRecoverySheetInfo"(uuid) IS 'Read one RecoverySheets record (getter for its screens).';

-- RecoverySheets: Post (status -> POSTED); allowed from OPEN
CREATE OR REPLACE FUNCTION "Distribution"."recoverySheetPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Distribution"."RecoverySheets";
BEGIN
  SELECT * INTO "vRow" FROM "Distribution"."RecoverySheets" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RecoverySheets % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('OPEN') THEN
    RAISE EXCEPTION 'RecoverySheets %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Distribution"."recoverySheetPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Distribution"."recoverySheetPostEntries"') USING "pId";
  END IF;
  UPDATE "Distribution"."RecoverySheets" t SET status = 'POSTED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- SalesmanTargets: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Distribution"."salesmanTargetAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Distribution"."SalesmanTargets";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Distribution"."SalesmanTargets", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Distribution"."SalesmanTargets" ("tenantId", "employeeId", role, "routeId", "periodStart", "periodEnd", "fiscalPeriodId", "targetAmount", "achievedAmount", calls, "productiveCalls", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'role' THEN "vRec".role ELSE NULL END, CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE NULL END, CASE WHEN "pData" ? 'periodStart' THEN "vRec"."periodStart" ELSE NULL END, CASE WHEN "pData" ? 'periodEnd' THEN "vRec"."periodEnd" ELSE NULL END, CASE WHEN "pData" ? 'fiscalPeriodId' THEN "vRec"."fiscalPeriodId" ELSE NULL END, CASE WHEN "pData" ? 'targetAmount' THEN "vRec"."targetAmount" ELSE NULL END, CASE WHEN "pData" ? 'achievedAmount' THEN "vRec"."achievedAmount" ELSE 0 END, CASE WHEN "pData" ? 'calls' THEN "vRec".calls ELSE 0 END, CASE WHEN "pData" ? 'productiveCalls' THEN "vRec"."productiveCalls" ELSE 0 END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'OPEN' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Distribution"."SalesmanTargets" t
       SET "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           role = CASE WHEN "pData" ? 'role' THEN "vRec".role ELSE t.role END,
           "routeId" = CASE WHEN "pData" ? 'routeId' THEN "vRec"."routeId" ELSE t."routeId" END,
           "periodStart" = CASE WHEN "pData" ? 'periodStart' THEN "vRec"."periodStart" ELSE t."periodStart" END,
           "periodEnd" = CASE WHEN "pData" ? 'periodEnd' THEN "vRec"."periodEnd" ELSE t."periodEnd" END,
           "fiscalPeriodId" = CASE WHEN "pData" ? 'fiscalPeriodId' THEN "vRec"."fiscalPeriodId" ELSE t."fiscalPeriodId" END,
           "targetAmount" = CASE WHEN "pData" ? 'targetAmount' THEN "vRec"."targetAmount" ELSE t."targetAmount" END,
           "achievedAmount" = CASE WHEN "pData" ? 'achievedAmount' THEN "vRec"."achievedAmount" ELSE t."achievedAmount" END,
           calls = CASE WHEN "pData" ? 'calls' THEN "vRec".calls ELSE t.calls END,
           "productiveCalls" = CASE WHEN "pData" ? 'productiveCalls' THEN "vRec"."productiveCalls" ELSE t."productiveCalls" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Distribution"."SalesmanTargets" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'SalesmanTargets %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SalesmanTargets % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Distribution"."salesmanTargetAddUpdate"(jsonb) IS 'Save (insert or update) one SalesmanTargets record.';

-- SalesmanTargets: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Distribution"."getSalesmanTargetInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('roleLabel', "Lookups"."getLookupLabel"('SalesmanTargetRole', t.role) ->> 'label', 'roleTone', "Lookups"."getLookupLabel"('SalesmanTargetRole', t.role) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('OpenClosedStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('OpenClosedStatus', t.status) ->> 'tone')
    FROM "Distribution"."SalesmanTargets" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Distribution"."getSalesmanTargetInfo"(uuid) IS 'Read one SalesmanTargets record (getter for its screens).';

-- CommissionSlabs: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Distribution"."commissionSlabAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Distribution"."CommissionSlabs";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Distribution"."CommissionSlabs", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Distribution"."CommissionSlabs" ("tenantId", label, "fromPct", "toPct", "ratePct", "effectiveFrom", "effectiveTo")
    VALUES ("vTenant", CASE WHEN "pData" ? 'label' THEN "vRec".label ELSE NULL END, CASE WHEN "pData" ? 'fromPct' THEN "vRec"."fromPct" ELSE NULL END, CASE WHEN "pData" ? 'toPct' THEN "vRec"."toPct" ELSE NULL END, CASE WHEN "pData" ? 'ratePct' THEN "vRec"."ratePct" ELSE NULL END, CASE WHEN "pData" ? 'effectiveFrom' THEN "vRec"."effectiveFrom" ELSE NULL END, CASE WHEN "pData" ? 'effectiveTo' THEN "vRec"."effectiveTo" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Distribution"."CommissionSlabs" t
       SET label = CASE WHEN "pData" ? 'label' THEN "vRec".label ELSE t.label END,
           "fromPct" = CASE WHEN "pData" ? 'fromPct' THEN "vRec"."fromPct" ELSE t."fromPct" END,
           "toPct" = CASE WHEN "pData" ? 'toPct' THEN "vRec"."toPct" ELSE t."toPct" END,
           "ratePct" = CASE WHEN "pData" ? 'ratePct' THEN "vRec"."ratePct" ELSE t."ratePct" END,
           "effectiveFrom" = CASE WHEN "pData" ? 'effectiveFrom' THEN "vRec"."effectiveFrom" ELSE t."effectiveFrom" END,
           "effectiveTo" = CASE WHEN "pData" ? 'effectiveTo' THEN "vRec"."effectiveTo" ELSE t."effectiveTo" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Distribution"."CommissionSlabs" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CommissionSlabs %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CommissionSlabs % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Distribution"."commissionSlabAddUpdate"(jsonb) IS 'Save (insert or update) one CommissionSlabs record.';

-- CommissionSlabs: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Distribution"."getCommissionSlabInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "Distribution"."CommissionSlabs" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Distribution"."getCommissionSlabInfo"(uuid) IS 'Read one CommissionSlabs record (getter for its screens).';

-- SalesmanCommissions: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Distribution"."salesmanCommissionAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Distribution"."SalesmanCommissions";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Distribution"."SalesmanCommissions", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Distribution"."SalesmanCommissions" ("tenantId", "employeeId", "salesTargetId", "periodStart", "periodEnd", "targetAmount", "achievedAmount", "achievementPct", "commissionSlabId", "ratePct", "commissionAmount", status, "approvedByUserId", "approvedAt", "journalEntryId", "paidAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'salesTargetId' THEN "vRec"."salesTargetId" ELSE NULL END, CASE WHEN "pData" ? 'periodStart' THEN "vRec"."periodStart" ELSE NULL END, CASE WHEN "pData" ? 'periodEnd' THEN "vRec"."periodEnd" ELSE NULL END, CASE WHEN "pData" ? 'targetAmount' THEN "vRec"."targetAmount" ELSE NULL END, CASE WHEN "pData" ? 'achievedAmount' THEN "vRec"."achievedAmount" ELSE NULL END, CASE WHEN "pData" ? 'achievementPct' THEN "vRec"."achievementPct" ELSE NULL END, CASE WHEN "pData" ? 'commissionSlabId' THEN "vRec"."commissionSlabId" ELSE NULL END, CASE WHEN "pData" ? 'ratePct' THEN "vRec"."ratePct" ELSE NULL END, CASE WHEN "pData" ? 'commissionAmount' THEN "vRec"."commissionAmount" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'DRAFT' END, CASE WHEN "pData" ? 'approvedByUserId' THEN "vRec"."approvedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'approvedAt' THEN "vRec"."approvedAt" ELSE NULL END, CASE WHEN "pData" ? 'journalEntryId' THEN "vRec"."journalEntryId" ELSE NULL END, CASE WHEN "pData" ? 'paidAt' THEN "vRec"."paidAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Distribution"."SalesmanCommissions" t
       SET "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "salesTargetId" = CASE WHEN "pData" ? 'salesTargetId' THEN "vRec"."salesTargetId" ELSE t."salesTargetId" END,
           "periodStart" = CASE WHEN "pData" ? 'periodStart' THEN "vRec"."periodStart" ELSE t."periodStart" END,
           "periodEnd" = CASE WHEN "pData" ? 'periodEnd' THEN "vRec"."periodEnd" ELSE t."periodEnd" END,
           "targetAmount" = CASE WHEN "pData" ? 'targetAmount' THEN "vRec"."targetAmount" ELSE t."targetAmount" END,
           "achievedAmount" = CASE WHEN "pData" ? 'achievedAmount' THEN "vRec"."achievedAmount" ELSE t."achievedAmount" END,
           "achievementPct" = CASE WHEN "pData" ? 'achievementPct' THEN "vRec"."achievementPct" ELSE t."achievementPct" END,
           "commissionSlabId" = CASE WHEN "pData" ? 'commissionSlabId' THEN "vRec"."commissionSlabId" ELSE t."commissionSlabId" END,
           "ratePct" = CASE WHEN "pData" ? 'ratePct' THEN "vRec"."ratePct" ELSE t."ratePct" END,
           "commissionAmount" = CASE WHEN "pData" ? 'commissionAmount' THEN "vRec"."commissionAmount" ELSE t."commissionAmount" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "approvedByUserId" = CASE WHEN "pData" ? 'approvedByUserId' THEN "vRec"."approvedByUserId" ELSE t."approvedByUserId" END,
           "approvedAt" = CASE WHEN "pData" ? 'approvedAt' THEN "vRec"."approvedAt" ELSE t."approvedAt" END,
           "journalEntryId" = CASE WHEN "pData" ? 'journalEntryId' THEN "vRec"."journalEntryId" ELSE t."journalEntryId" END,
           "paidAt" = CASE WHEN "pData" ? 'paidAt' THEN "vRec"."paidAt" ELSE t."paidAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Distribution"."SalesmanCommissions" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'SalesmanCommissions %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SalesmanCommissions % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Distribution"."salesmanCommissionAddUpdate"(jsonb) IS 'Save (insert or update) one SalesmanCommissions record.';

-- SalesmanCommissions: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Distribution"."getSalesmanCommissionInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('SalesmanCommissionStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('SalesmanCommissionStatus', t.status) ->> 'tone')
    FROM "Distribution"."SalesmanCommissions" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Distribution"."getSalesmanCommissionInfo"(uuid) IS 'Read one SalesmanCommissions record (getter for its screens).';
