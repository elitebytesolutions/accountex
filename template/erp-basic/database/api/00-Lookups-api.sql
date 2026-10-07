-- =============================================================================
-- Finsoft ERP — API: "Lookups" + permission helpers   (identical in erp-basic and erp-full)
-- Hand-written. Dropdown values for every screen come from "Lookups"."getLookups".
-- =============================================================================

-- lookupAddUpdate: a tenant adds or edits its own value of a list that allows it
-- (registry "allowTenantValues"), or — without a tenant context (platform
-- console / seed) — a global value.
-- Payload: {"id"?, "lookupType", "code", "label", "labelUrdu"?, "tone"?, "sortOrder"?, "isActive"?, "rowVersion"?}
CREATE OR REPLACE FUNCTION "Lookups"."lookupAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := NULLIF(current_setting('app.tenantId', true), '')::uuid;
  "vRec"    "Lookups"."Lookups";
  "vId"     uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet"    uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Lookups"."Lookups", "pData");
  IF "vTenant" IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "Lookups"."LookupColumns" lc
        WHERE lc."lookupType" = "vRec"."lookupType" AND lc."allowTenantValues") THEN
    RAISE EXCEPTION 'List % is maintained by Finsoft; tenants cannot add values to it', "vRec"."lookupType"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF "vId" IS NULL THEN
    INSERT INTO "Lookups"."Lookups" ("lookupType", code, label, "labelUrdu", description, tone, "sortOrder",
                                     "isActive", "isSystem", "tenantId")
    VALUES ("vRec"."lookupType", "vRec".code, "vRec".label, "vRec"."labelUrdu", "vRec".description,
            COALESCE("vRec".tone, 'neutral'), COALESCE("vRec"."sortOrder", 999), COALESCE("vRec"."isActive", true),
            false, "vTenant")
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Lookups"."Lookups" l
       SET label       = CASE WHEN "pData" ? 'label'       THEN "vRec".label       ELSE l.label END,
           "labelUrdu" = CASE WHEN "pData" ? 'labelUrdu'   THEN "vRec"."labelUrdu" ELSE l."labelUrdu" END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE l.description END,
           tone        = CASE WHEN "pData" ? 'tone'        THEN "vRec".tone        ELSE l.tone END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder'   THEN "vRec"."sortOrder" ELSE l."sortOrder" END,
           "isActive"  = CASE WHEN "pData" ? 'isActive'    THEN "vRec"."isActive"  ELSE l."isActive" END,
           code        = CASE WHEN "pData" ? 'code' AND NOT l."isSystem" THEN "vRec".code ELSE l.code END
     WHERE l.id = "vId"
       AND (l."tenantId" IS NOT DISTINCT FROM "vTenant")
       AND (NOT ("pData" ? 'rowVersion') OR l."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING l.id INTO "vRet";
    IF "vRet" IS NULL THEN
      RAISE EXCEPTION 'Lookup % not found, not editable, or changed by another user', "vId"
        USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Lookups"."lookupAddUpdate"(jsonb) IS
  'Save one lookup value. Tenants may only add/edit their own values of lists that allow it; system codes keep their code.';

CREATE OR REPLACE FUNCTION "Lookups"."getLookupInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT to_jsonb(l) || jsonb_build_object('usedBy',
           COALESCE((SELECT jsonb_agg(jsonb_build_object('schemaName', lc."schemaName", 'tableName', lc."tableName",
                                                          'columnName', lc."columnName"))
                       FROM "Lookups"."LookupColumns" lc WHERE lc."lookupType" = l."lookupType"), '[]'::jsonb))
    FROM "Lookups"."Lookups" l
   WHERE l.id = "pId"
$$;
COMMENT ON FUNCTION "Lookups"."getLookupInfo"(uuid) IS 'Read one lookup value with the columns that use its list.';

-- ---------------------------------------------------------------------------
-- Permission check used by the API layer: does the signed-in user hold
-- '<resource>:<action>' (Settings › Roles & Permissions matrix)?
-- System calls (no user in the session) are trusted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Company"."hasPermission"("pCode" text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT "Company"."getCurrentUserId"() IS NULL
      OR EXISTS (SELECT 1
                   FROM "Company"."UserRoles" ur
                   JOIN "Company"."RolePermissions" rp ON rp."roleId" = ur."roleId" AND rp."tenantId" = ur."tenantId"
                  WHERE ur."userId" = "Company"."getCurrentUserId"()
                    AND ur."tenantId" = "Company"."getCurrentTenantId"()
                    AND rp."permissionCode" = "pCode")
$$;

CREATE OR REPLACE FUNCTION "Company"."assertPermission"("pCode" text) RETURNS void
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF NOT "Company"."hasPermission"("pCode") THEN
    RAISE EXCEPTION 'You do not have permission %', "pCode" USING ERRCODE = 'insufficient_privilege';
  END IF;
END $$;
