-- =============================================================================
-- Finsoft ERP (Basic edition) — API: "Company"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- Branches: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."branchAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."Branches";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."Branches", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."Branches" ("tenantId", code, name, description, "isHeadOffice", "isDefault", "managerUserId", address, city, province, "salesTaxAuthority", phone, email, "openingDate", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'isHeadOffice' THEN "vRec"."isHeadOffice" ELSE FALSE END, CASE WHEN "pData" ? 'isDefault' THEN "vRec"."isDefault" ELSE FALSE END, CASE WHEN "pData" ? 'managerUserId' THEN "vRec"."managerUserId" ELSE NULL END, CASE WHEN "pData" ? 'address' THEN "vRec".address ELSE NULL END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'province' THEN "vRec".province ELSE NULL END, CASE WHEN "pData" ? 'salesTaxAuthority' THEN "vRec"."salesTaxAuthority" ELSE NULL END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'openingDate' THEN "vRec"."openingDate" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."Branches" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "isHeadOffice" = CASE WHEN "pData" ? 'isHeadOffice' THEN "vRec"."isHeadOffice" ELSE t."isHeadOffice" END,
           "isDefault" = CASE WHEN "pData" ? 'isDefault' THEN "vRec"."isDefault" ELSE t."isDefault" END,
           "managerUserId" = CASE WHEN "pData" ? 'managerUserId' THEN "vRec"."managerUserId" ELSE t."managerUserId" END,
           address = CASE WHEN "pData" ? 'address' THEN "vRec".address ELSE t.address END,
           city = CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE t.city END,
           province = CASE WHEN "pData" ? 'province' THEN "vRec".province ELSE t.province END,
           "salesTaxAuthority" = CASE WHEN "pData" ? 'salesTaxAuthority' THEN "vRec"."salesTaxAuthority" ELSE t."salesTaxAuthority" END,
           phone = CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE t.phone END,
           email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           "openingDate" = CASE WHEN "pData" ? 'openingDate' THEN "vRec"."openingDate" ELSE t."openingDate" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."Branches" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Branches %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Branches % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."branchAddUpdate"(jsonb) IS 'Save (insert or update) one Branches record.';

-- Branches: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getBranchInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('provinceLabel', "Lookups"."getLookupLabel"('Province', t.province) ->> 'label', 'provinceTone', "Lookups"."getLookupLabel"('Province', t.province) ->> 'tone', 'salesTaxAuthorityLabel', "Lookups"."getLookupLabel"('SalesTaxAuthority', t."salesTaxAuthority") ->> 'label', 'salesTaxAuthorityTone', "Lookups"."getLookupLabel"('SalesTaxAuthority', t."salesTaxAuthority") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone')
    FROM "Company"."Branches" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getBranchInfo"(uuid) IS 'Read one Branches record (getter for its screens).';

-- Users: insert (no "id") or update (with "id"); child arrays: branches, roles, warehouses
CREATE OR REPLACE FUNCTION "Company"."userAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."Users";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1UserBranches" "Company"."UserBranches";
  "vC1UserRoles" "Company"."UserRoles";
  "vC1UserWarehouses" "Company"."UserWarehouses";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."Users", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."Users" ("tenantId", email, "passwordHash", "mustChangePassword", "passwordChangedAt", "firstName", "lastName", "fullName", "jobTitle", department, phone, "avatarAttachmentId", "emailSignature", "isExternal", "externalOrg", status, "defaultBranchId", "dataScope", "moduleAccess", "approvalLimit", "mfaEnabled", "mfaMethod", "mfaSecretEnc", "mfaRecoveryCodes", "ipRestricted", "ipAllowlist", "sessionTimeoutMin", "loginHours", "loginFrom", "loginTo", "ssoProvider", "ssoSubject", "failedLoginCount", "lockedUntil", "invitedByUserId", "invitedAt", "activatedAt", "suspendedAt", "lastLoginAt", "lastLoginIp", "lastActiveAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'passwordHash' THEN "vRec"."passwordHash" ELSE NULL END, CASE WHEN "pData" ? 'mustChangePassword' THEN "vRec"."mustChangePassword" ELSE FALSE END, CASE WHEN "pData" ? 'passwordChangedAt' THEN "vRec"."passwordChangedAt" ELSE NULL END, CASE WHEN "pData" ? 'firstName' THEN "vRec"."firstName" ELSE NULL END, CASE WHEN "pData" ? 'lastName' THEN "vRec"."lastName" ELSE NULL END, CASE WHEN "pData" ? 'fullName' THEN "vRec"."fullName" ELSE NULL END, CASE WHEN "pData" ? 'jobTitle' THEN "vRec"."jobTitle" ELSE NULL END, CASE WHEN "pData" ? 'department' THEN "vRec".department ELSE NULL END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'avatarAttachmentId' THEN "vRec"."avatarAttachmentId" ELSE NULL END, CASE WHEN "pData" ? 'emailSignature' THEN "vRec"."emailSignature" ELSE NULL END, CASE WHEN "pData" ? 'isExternal' THEN "vRec"."isExternal" ELSE FALSE END, CASE WHEN "pData" ? 'externalOrg' THEN "vRec"."externalOrg" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'INVITED' END, CASE WHEN "pData" ? 'defaultBranchId' THEN "vRec"."defaultBranchId" ELSE NULL END, CASE WHEN "pData" ? 'dataScope' THEN "vRec"."dataScope" ELSE 'BRANCH' END, CASE WHEN "pData" ? 'moduleAccess' THEN "vRec"."moduleAccess" ELSE '{}' END, CASE WHEN "pData" ? 'approvalLimit' THEN "vRec"."approvalLimit" ELSE 0 END, CASE WHEN "pData" ? 'mfaEnabled' THEN "vRec"."mfaEnabled" ELSE FALSE END, CASE WHEN "pData" ? 'mfaMethod' THEN "vRec"."mfaMethod" ELSE NULL END, CASE WHEN "pData" ? 'mfaSecretEnc' THEN "vRec"."mfaSecretEnc" ELSE NULL END, CASE WHEN "pData" ? 'mfaRecoveryCodes' THEN "vRec"."mfaRecoveryCodes" ELSE NULL END, CASE WHEN "pData" ? 'ipRestricted' THEN "vRec"."ipRestricted" ELSE FALSE END, CASE WHEN "pData" ? 'ipAllowlist' THEN "vRec"."ipAllowlist" ELSE NULL END, CASE WHEN "pData" ? 'sessionTimeoutMin' THEN "vRec"."sessionTimeoutMin" ELSE 60 END, CASE WHEN "pData" ? 'loginHours' THEN "vRec"."loginHours" ELSE 'ANY' END, CASE WHEN "pData" ? 'loginFrom' THEN "vRec"."loginFrom" ELSE NULL END, CASE WHEN "pData" ? 'loginTo' THEN "vRec"."loginTo" ELSE NULL END, CASE WHEN "pData" ? 'ssoProvider' THEN "vRec"."ssoProvider" ELSE NULL END, CASE WHEN "pData" ? 'ssoSubject' THEN "vRec"."ssoSubject" ELSE NULL END, CASE WHEN "pData" ? 'failedLoginCount' THEN "vRec"."failedLoginCount" ELSE 0 END, CASE WHEN "pData" ? 'lockedUntil' THEN "vRec"."lockedUntil" ELSE NULL END, CASE WHEN "pData" ? 'invitedByUserId' THEN "vRec"."invitedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'invitedAt' THEN "vRec"."invitedAt" ELSE NULL END, CASE WHEN "pData" ? 'activatedAt' THEN "vRec"."activatedAt" ELSE NULL END, CASE WHEN "pData" ? 'suspendedAt' THEN "vRec"."suspendedAt" ELSE NULL END, CASE WHEN "pData" ? 'lastLoginAt' THEN "vRec"."lastLoginAt" ELSE NULL END, CASE WHEN "pData" ? 'lastLoginIp' THEN "vRec"."lastLoginIp" ELSE NULL END, CASE WHEN "pData" ? 'lastActiveAt' THEN "vRec"."lastActiveAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."Users" t
       SET email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           "passwordHash" = CASE WHEN "pData" ? 'passwordHash' THEN "vRec"."passwordHash" ELSE t."passwordHash" END,
           "mustChangePassword" = CASE WHEN "pData" ? 'mustChangePassword' THEN "vRec"."mustChangePassword" ELSE t."mustChangePassword" END,
           "passwordChangedAt" = CASE WHEN "pData" ? 'passwordChangedAt' THEN "vRec"."passwordChangedAt" ELSE t."passwordChangedAt" END,
           "firstName" = CASE WHEN "pData" ? 'firstName' THEN "vRec"."firstName" ELSE t."firstName" END,
           "lastName" = CASE WHEN "pData" ? 'lastName' THEN "vRec"."lastName" ELSE t."lastName" END,
           "fullName" = CASE WHEN "pData" ? 'fullName' THEN "vRec"."fullName" ELSE t."fullName" END,
           "jobTitle" = CASE WHEN "pData" ? 'jobTitle' THEN "vRec"."jobTitle" ELSE t."jobTitle" END,
           department = CASE WHEN "pData" ? 'department' THEN "vRec".department ELSE t.department END,
           phone = CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE t.phone END,
           "avatarAttachmentId" = CASE WHEN "pData" ? 'avatarAttachmentId' THEN "vRec"."avatarAttachmentId" ELSE t."avatarAttachmentId" END,
           "emailSignature" = CASE WHEN "pData" ? 'emailSignature' THEN "vRec"."emailSignature" ELSE t."emailSignature" END,
           "isExternal" = CASE WHEN "pData" ? 'isExternal' THEN "vRec"."isExternal" ELSE t."isExternal" END,
           "externalOrg" = CASE WHEN "pData" ? 'externalOrg' THEN "vRec"."externalOrg" ELSE t."externalOrg" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "defaultBranchId" = CASE WHEN "pData" ? 'defaultBranchId' THEN "vRec"."defaultBranchId" ELSE t."defaultBranchId" END,
           "dataScope" = CASE WHEN "pData" ? 'dataScope' THEN "vRec"."dataScope" ELSE t."dataScope" END,
           "moduleAccess" = CASE WHEN "pData" ? 'moduleAccess' THEN "vRec"."moduleAccess" ELSE t."moduleAccess" END,
           "approvalLimit" = CASE WHEN "pData" ? 'approvalLimit' THEN "vRec"."approvalLimit" ELSE t."approvalLimit" END,
           "mfaEnabled" = CASE WHEN "pData" ? 'mfaEnabled' THEN "vRec"."mfaEnabled" ELSE t."mfaEnabled" END,
           "mfaMethod" = CASE WHEN "pData" ? 'mfaMethod' THEN "vRec"."mfaMethod" ELSE t."mfaMethod" END,
           "mfaSecretEnc" = CASE WHEN "pData" ? 'mfaSecretEnc' THEN "vRec"."mfaSecretEnc" ELSE t."mfaSecretEnc" END,
           "mfaRecoveryCodes" = CASE WHEN "pData" ? 'mfaRecoveryCodes' THEN "vRec"."mfaRecoveryCodes" ELSE t."mfaRecoveryCodes" END,
           "ipRestricted" = CASE WHEN "pData" ? 'ipRestricted' THEN "vRec"."ipRestricted" ELSE t."ipRestricted" END,
           "ipAllowlist" = CASE WHEN "pData" ? 'ipAllowlist' THEN "vRec"."ipAllowlist" ELSE t."ipAllowlist" END,
           "sessionTimeoutMin" = CASE WHEN "pData" ? 'sessionTimeoutMin' THEN "vRec"."sessionTimeoutMin" ELSE t."sessionTimeoutMin" END,
           "loginHours" = CASE WHEN "pData" ? 'loginHours' THEN "vRec"."loginHours" ELSE t."loginHours" END,
           "loginFrom" = CASE WHEN "pData" ? 'loginFrom' THEN "vRec"."loginFrom" ELSE t."loginFrom" END,
           "loginTo" = CASE WHEN "pData" ? 'loginTo' THEN "vRec"."loginTo" ELSE t."loginTo" END,
           "ssoProvider" = CASE WHEN "pData" ? 'ssoProvider' THEN "vRec"."ssoProvider" ELSE t."ssoProvider" END,
           "ssoSubject" = CASE WHEN "pData" ? 'ssoSubject' THEN "vRec"."ssoSubject" ELSE t."ssoSubject" END,
           "failedLoginCount" = CASE WHEN "pData" ? 'failedLoginCount' THEN "vRec"."failedLoginCount" ELSE t."failedLoginCount" END,
           "lockedUntil" = CASE WHEN "pData" ? 'lockedUntil' THEN "vRec"."lockedUntil" ELSE t."lockedUntil" END,
           "invitedByUserId" = CASE WHEN "pData" ? 'invitedByUserId' THEN "vRec"."invitedByUserId" ELSE t."invitedByUserId" END,
           "invitedAt" = CASE WHEN "pData" ? 'invitedAt' THEN "vRec"."invitedAt" ELSE t."invitedAt" END,
           "activatedAt" = CASE WHEN "pData" ? 'activatedAt' THEN "vRec"."activatedAt" ELSE t."activatedAt" END,
           "suspendedAt" = CASE WHEN "pData" ? 'suspendedAt' THEN "vRec"."suspendedAt" ELSE t."suspendedAt" END,
           "lastLoginAt" = CASE WHEN "pData" ? 'lastLoginAt' THEN "vRec"."lastLoginAt" ELSE t."lastLoginAt" END,
           "lastLoginIp" = CASE WHEN "pData" ? 'lastLoginIp' THEN "vRec"."lastLoginIp" ELSE t."lastLoginIp" END,
           "lastActiveAt" = CASE WHEN "pData" ? 'lastActiveAt' THEN "vRec"."lastActiveAt" ELSE t."lastActiveAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."Users" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Users %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Users % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'branches' THEN
    -- branches: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Company"."UserBranches"
     WHERE "tenantId" = "vTenant" AND "userId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'branches') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'branches') WITH ORDINALITY t(x, n) LOOP
      "vC1UserBranches" := jsonb_populate_record(NULL::"Company"."UserBranches", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Company"."UserBranches" t
           SET "branchId" = CASE WHEN "vE1" ? 'branchId' THEN "vC1UserBranches"."branchId" ELSE t."branchId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."userId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'UserBranches: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Company"."UserBranches" ("userId", "tenantId", "branchId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'branchId' THEN "vC1UserBranches"."branchId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'roles' THEN
    -- roles: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Company"."UserRoles"
     WHERE "tenantId" = "vTenant" AND "userId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'roles') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'roles') WITH ORDINALITY t(x, n) LOOP
      "vC1UserRoles" := jsonb_populate_record(NULL::"Company"."UserRoles", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Company"."UserRoles" t
           SET "roleId" = CASE WHEN "vE1" ? 'roleId' THEN "vC1UserRoles"."roleId" ELSE t."roleId" END,
               "isPrimary" = CASE WHEN "vE1" ? 'isPrimary' THEN "vC1UserRoles"."isPrimary" ELSE t."isPrimary" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."userId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'UserRoles: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Company"."UserRoles" ("userId", "tenantId", "roleId", "isPrimary")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'roleId' THEN "vC1UserRoles"."roleId" ELSE NULL END, CASE WHEN "vE1" ? 'isPrimary' THEN "vC1UserRoles"."isPrimary" ELSE TRUE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'warehouses' THEN
    -- warehouses: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Company"."UserWarehouses"
     WHERE "tenantId" = "vTenant" AND "userId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'warehouses') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'warehouses') WITH ORDINALITY t(x, n) LOOP
      "vC1UserWarehouses" := jsonb_populate_record(NULL::"Company"."UserWarehouses", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Company"."UserWarehouses" t
           SET "warehouseId" = CASE WHEN "vE1" ? 'warehouseId' THEN "vC1UserWarehouses"."warehouseId" ELSE t."warehouseId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."userId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'UserWarehouses: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Company"."UserWarehouses" ("userId", "tenantId", "warehouseId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'warehouseId' THEN "vC1UserWarehouses"."warehouseId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."userAddUpdate"(jsonb) IS 'Save (insert or update) one Users record with its branches, roles, warehouses.';

-- Users: one record as JSON (camelCase keys), with lookup labels and branches, roles, warehouses
CREATE OR REPLACE FUNCTION "Company"."getUserInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t) - 'passwordHash' - 'mustChangePassword' - 'passwordChangedAt' - 'mfaSecretEnc' - 'mfaRecoveryCodes') ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('UserStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('UserStatus', t.status) ->> 'tone', 'dataScopeLabel', "Lookups"."getLookupLabel"('DataScope', t."dataScope") ->> 'label', 'dataScopeTone', "Lookups"."getLookupLabel"('DataScope', t."dataScope") ->> 'tone', 'mfaMethodLabel', "Lookups"."getLookupLabel"('UserMfaMethod', t."mfaMethod") ->> 'label', 'mfaMethodTone', "Lookups"."getLookupLabel"('UserMfaMethod', t."mfaMethod") ->> 'tone', 'loginHoursLabel', "Lookups"."getLookupLabel"('LoginHours', t."loginHours") ->> 'label', 'loginHoursTone', "Lookups"."getLookupLabel"('LoginHours', t."loginHours") ->> 'tone', 'ssoProviderLabel', "Lookups"."getLookupLabel"('UserSsoProvider', t."ssoProvider") ->> 'label', 'ssoProviderTone', "Lookups"."getLookupLabel"('UserSsoProvider', t."ssoProvider") ->> 'tone') ||
         jsonb_build_object('branches', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Company"."UserBranches" c1 WHERE c1."userId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'roles', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Company"."UserRoles" c1 WHERE c1."userId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'warehouses', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Company"."UserWarehouses" c1 WHERE c1."userId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Company"."Users" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getUserInfo"(uuid) IS 'Read one Users record (getter for its screens).';

-- CompanySettings: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."companySettingAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."CompanySettings";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."CompanySettings", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."CompanySettings" ("tenantId", "legalName", "tradingName", "secpRegNo", ntn, strn, "registeredAddress", city, province, phone, email, website, industry, timezone, "legalStructure", "logoAttachmentId", "fyStartMonth", "baseCurrencyCode", "amountDecimals", "numberFormat", "booksLockDate", "fxRateSource", "allowMultiCurrency", "requireCostCentreOnExpense", "allowFuturePeriodPosting", "defaultCustomerTermsDays", "quotationValidityDays", "defaultSalesTaxCodeId", "invoiceTerms", "creditLimitAction", "overdueToleranceDays", "blockOverdueOver90", "defaultVendorTermsDays", "threeWayMatchTolerancePct", "billApprovalThreshold", "requireApprovedPoForBill", "autoDeductWht153", "allowPartialGrn", "warnDuplicateVendorInvoice", "stockAdjustmentApprovalThreshold", "gstRegistered", "salesTaxReturnPeriod", "standardGstRatePct", "furtherTaxRatePct", "provincialTaxAuthority", "provincialServicesRatePct", "atlStatus", "atlVerifiedAt", "brandPrimaryColour", "brandAccentColour", "documentFont", "paperSize", "emailFooter", "showPoweredBy")
    VALUES ("vTenant", CASE WHEN "pData" ? 'legalName' THEN "vRec"."legalName" ELSE NULL END, CASE WHEN "pData" ? 'tradingName' THEN "vRec"."tradingName" ELSE NULL END, CASE WHEN "pData" ? 'secpRegNo' THEN "vRec"."secpRegNo" ELSE NULL END, CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE NULL END, CASE WHEN "pData" ? 'strn' THEN "vRec".strn ELSE NULL END, CASE WHEN "pData" ? 'registeredAddress' THEN "vRec"."registeredAddress" ELSE NULL END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'province' THEN "vRec".province ELSE NULL END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'website' THEN "vRec".website ELSE NULL END, CASE WHEN "pData" ? 'industry' THEN "vRec".industry ELSE NULL END, CASE WHEN "pData" ? 'timezone' THEN "vRec".timezone ELSE 'Asia/Karachi' END, CASE WHEN "pData" ? 'legalStructure' THEN "vRec"."legalStructure" ELSE NULL END, CASE WHEN "pData" ? 'logoAttachmentId' THEN "vRec"."logoAttachmentId" ELSE NULL END, CASE WHEN "pData" ? 'fyStartMonth' THEN "vRec"."fyStartMonth" ELSE 7 END, CASE WHEN "pData" ? 'baseCurrencyCode' THEN "vRec"."baseCurrencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'amountDecimals' THEN "vRec"."amountDecimals" ELSE 2 END, CASE WHEN "pData" ? 'numberFormat' THEN "vRec"."numberFormat" ELSE 'WESTERN' END, CASE WHEN "pData" ? 'booksLockDate' THEN "vRec"."booksLockDate" ELSE NULL END, CASE WHEN "pData" ? 'fxRateSource' THEN "vRec"."fxRateSource" ELSE 'SBP_DAILY' END, CASE WHEN "pData" ? 'allowMultiCurrency' THEN "vRec"."allowMultiCurrency" ELSE FALSE END, CASE WHEN "pData" ? 'requireCostCentreOnExpense' THEN "vRec"."requireCostCentreOnExpense" ELSE FALSE END, CASE WHEN "pData" ? 'allowFuturePeriodPosting' THEN "vRec"."allowFuturePeriodPosting" ELSE FALSE END, CASE WHEN "pData" ? 'defaultCustomerTermsDays' THEN "vRec"."defaultCustomerTermsDays" ELSE 30 END, CASE WHEN "pData" ? 'quotationValidityDays' THEN "vRec"."quotationValidityDays" ELSE 15 END, CASE WHEN "pData" ? 'defaultSalesTaxCodeId' THEN "vRec"."defaultSalesTaxCodeId" ELSE NULL END, CASE WHEN "pData" ? 'invoiceTerms' THEN "vRec"."invoiceTerms" ELSE NULL END, CASE WHEN "pData" ? 'creditLimitAction' THEN "vRec"."creditLimitAction" ELSE 'BLOCK_OVERRIDE' END, CASE WHEN "pData" ? 'overdueToleranceDays' THEN "vRec"."overdueToleranceDays" ELSE 15 END, CASE WHEN "pData" ? 'blockOverdueOver90' THEN "vRec"."blockOverdueOver90" ELSE TRUE END, CASE WHEN "pData" ? 'defaultVendorTermsDays' THEN "vRec"."defaultVendorTermsDays" ELSE 45 END, CASE WHEN "pData" ? 'threeWayMatchTolerancePct' THEN "vRec"."threeWayMatchTolerancePct" ELSE 2 END, CASE WHEN "pData" ? 'billApprovalThreshold' THEN "vRec"."billApprovalThreshold" ELSE NULL END, CASE WHEN "pData" ? 'requireApprovedPoForBill' THEN "vRec"."requireApprovedPoForBill" ELSE TRUE END, CASE WHEN "pData" ? 'autoDeductWht153' THEN "vRec"."autoDeductWht153" ELSE TRUE END, CASE WHEN "pData" ? 'allowPartialGrn' THEN "vRec"."allowPartialGrn" ELSE FALSE END, CASE WHEN "pData" ? 'warnDuplicateVendorInvoice' THEN "vRec"."warnDuplicateVendorInvoice" ELSE TRUE END, CASE WHEN "pData" ? 'stockAdjustmentApprovalThreshold' THEN "vRec"."stockAdjustmentApprovalThreshold" ELSE 25000 END, CASE WHEN "pData" ? 'gstRegistered' THEN "vRec"."gstRegistered" ELSE TRUE END, CASE WHEN "pData" ? 'salesTaxReturnPeriod' THEN "vRec"."salesTaxReturnPeriod" ELSE 'MONTHLY' END, CASE WHEN "pData" ? 'standardGstRatePct' THEN "vRec"."standardGstRatePct" ELSE 18 END, CASE WHEN "pData" ? 'furtherTaxRatePct' THEN "vRec"."furtherTaxRatePct" ELSE 4 END, CASE WHEN "pData" ? 'provincialTaxAuthority' THEN "vRec"."provincialTaxAuthority" ELSE NULL END, CASE WHEN "pData" ? 'provincialServicesRatePct' THEN "vRec"."provincialServicesRatePct" ELSE NULL END, CASE WHEN "pData" ? 'atlStatus' THEN "vRec"."atlStatus" ELSE 'UNKNOWN' END, CASE WHEN "pData" ? 'atlVerifiedAt' THEN "vRec"."atlVerifiedAt" ELSE NULL END, CASE WHEN "pData" ? 'brandPrimaryColour' THEN "vRec"."brandPrimaryColour" ELSE '#15803D' END, CASE WHEN "pData" ? 'brandAccentColour' THEN "vRec"."brandAccentColour" ELSE '#EFBC61' END, CASE WHEN "pData" ? 'documentFont' THEN "vRec"."documentFont" ELSE 'INTER' END, CASE WHEN "pData" ? 'paperSize' THEN "vRec"."paperSize" ELSE 'A4' END, CASE WHEN "pData" ? 'emailFooter' THEN "vRec"."emailFooter" ELSE NULL END, CASE WHEN "pData" ? 'showPoweredBy' THEN "vRec"."showPoweredBy" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."CompanySettings" t
       SET "legalName" = CASE WHEN "pData" ? 'legalName' THEN "vRec"."legalName" ELSE t."legalName" END,
           "tradingName" = CASE WHEN "pData" ? 'tradingName' THEN "vRec"."tradingName" ELSE t."tradingName" END,
           "secpRegNo" = CASE WHEN "pData" ? 'secpRegNo' THEN "vRec"."secpRegNo" ELSE t."secpRegNo" END,
           ntn = CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE t.ntn END,
           strn = CASE WHEN "pData" ? 'strn' THEN "vRec".strn ELSE t.strn END,
           "registeredAddress" = CASE WHEN "pData" ? 'registeredAddress' THEN "vRec"."registeredAddress" ELSE t."registeredAddress" END,
           city = CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE t.city END,
           province = CASE WHEN "pData" ? 'province' THEN "vRec".province ELSE t.province END,
           phone = CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE t.phone END,
           email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           website = CASE WHEN "pData" ? 'website' THEN "vRec".website ELSE t.website END,
           industry = CASE WHEN "pData" ? 'industry' THEN "vRec".industry ELSE t.industry END,
           timezone = CASE WHEN "pData" ? 'timezone' THEN "vRec".timezone ELSE t.timezone END,
           "legalStructure" = CASE WHEN "pData" ? 'legalStructure' THEN "vRec"."legalStructure" ELSE t."legalStructure" END,
           "logoAttachmentId" = CASE WHEN "pData" ? 'logoAttachmentId' THEN "vRec"."logoAttachmentId" ELSE t."logoAttachmentId" END,
           "fyStartMonth" = CASE WHEN "pData" ? 'fyStartMonth' THEN "vRec"."fyStartMonth" ELSE t."fyStartMonth" END,
           "baseCurrencyCode" = CASE WHEN "pData" ? 'baseCurrencyCode' THEN "vRec"."baseCurrencyCode" ELSE t."baseCurrencyCode" END,
           "amountDecimals" = CASE WHEN "pData" ? 'amountDecimals' THEN "vRec"."amountDecimals" ELSE t."amountDecimals" END,
           "numberFormat" = CASE WHEN "pData" ? 'numberFormat' THEN "vRec"."numberFormat" ELSE t."numberFormat" END,
           "booksLockDate" = CASE WHEN "pData" ? 'booksLockDate' THEN "vRec"."booksLockDate" ELSE t."booksLockDate" END,
           "fxRateSource" = CASE WHEN "pData" ? 'fxRateSource' THEN "vRec"."fxRateSource" ELSE t."fxRateSource" END,
           "allowMultiCurrency" = CASE WHEN "pData" ? 'allowMultiCurrency' THEN "vRec"."allowMultiCurrency" ELSE t."allowMultiCurrency" END,
           "requireCostCentreOnExpense" = CASE WHEN "pData" ? 'requireCostCentreOnExpense' THEN "vRec"."requireCostCentreOnExpense" ELSE t."requireCostCentreOnExpense" END,
           "allowFuturePeriodPosting" = CASE WHEN "pData" ? 'allowFuturePeriodPosting' THEN "vRec"."allowFuturePeriodPosting" ELSE t."allowFuturePeriodPosting" END,
           "defaultCustomerTermsDays" = CASE WHEN "pData" ? 'defaultCustomerTermsDays' THEN "vRec"."defaultCustomerTermsDays" ELSE t."defaultCustomerTermsDays" END,
           "quotationValidityDays" = CASE WHEN "pData" ? 'quotationValidityDays' THEN "vRec"."quotationValidityDays" ELSE t."quotationValidityDays" END,
           "defaultSalesTaxCodeId" = CASE WHEN "pData" ? 'defaultSalesTaxCodeId' THEN "vRec"."defaultSalesTaxCodeId" ELSE t."defaultSalesTaxCodeId" END,
           "invoiceTerms" = CASE WHEN "pData" ? 'invoiceTerms' THEN "vRec"."invoiceTerms" ELSE t."invoiceTerms" END,
           "creditLimitAction" = CASE WHEN "pData" ? 'creditLimitAction' THEN "vRec"."creditLimitAction" ELSE t."creditLimitAction" END,
           "overdueToleranceDays" = CASE WHEN "pData" ? 'overdueToleranceDays' THEN "vRec"."overdueToleranceDays" ELSE t."overdueToleranceDays" END,
           "blockOverdueOver90" = CASE WHEN "pData" ? 'blockOverdueOver90' THEN "vRec"."blockOverdueOver90" ELSE t."blockOverdueOver90" END,
           "defaultVendorTermsDays" = CASE WHEN "pData" ? 'defaultVendorTermsDays' THEN "vRec"."defaultVendorTermsDays" ELSE t."defaultVendorTermsDays" END,
           "threeWayMatchTolerancePct" = CASE WHEN "pData" ? 'threeWayMatchTolerancePct' THEN "vRec"."threeWayMatchTolerancePct" ELSE t."threeWayMatchTolerancePct" END,
           "billApprovalThreshold" = CASE WHEN "pData" ? 'billApprovalThreshold' THEN "vRec"."billApprovalThreshold" ELSE t."billApprovalThreshold" END,
           "requireApprovedPoForBill" = CASE WHEN "pData" ? 'requireApprovedPoForBill' THEN "vRec"."requireApprovedPoForBill" ELSE t."requireApprovedPoForBill" END,
           "autoDeductWht153" = CASE WHEN "pData" ? 'autoDeductWht153' THEN "vRec"."autoDeductWht153" ELSE t."autoDeductWht153" END,
           "allowPartialGrn" = CASE WHEN "pData" ? 'allowPartialGrn' THEN "vRec"."allowPartialGrn" ELSE t."allowPartialGrn" END,
           "warnDuplicateVendorInvoice" = CASE WHEN "pData" ? 'warnDuplicateVendorInvoice' THEN "vRec"."warnDuplicateVendorInvoice" ELSE t."warnDuplicateVendorInvoice" END,
           "stockAdjustmentApprovalThreshold" = CASE WHEN "pData" ? 'stockAdjustmentApprovalThreshold' THEN "vRec"."stockAdjustmentApprovalThreshold" ELSE t."stockAdjustmentApprovalThreshold" END,
           "gstRegistered" = CASE WHEN "pData" ? 'gstRegistered' THEN "vRec"."gstRegistered" ELSE t."gstRegistered" END,
           "salesTaxReturnPeriod" = CASE WHEN "pData" ? 'salesTaxReturnPeriod' THEN "vRec"."salesTaxReturnPeriod" ELSE t."salesTaxReturnPeriod" END,
           "standardGstRatePct" = CASE WHEN "pData" ? 'standardGstRatePct' THEN "vRec"."standardGstRatePct" ELSE t."standardGstRatePct" END,
           "furtherTaxRatePct" = CASE WHEN "pData" ? 'furtherTaxRatePct' THEN "vRec"."furtherTaxRatePct" ELSE t."furtherTaxRatePct" END,
           "provincialTaxAuthority" = CASE WHEN "pData" ? 'provincialTaxAuthority' THEN "vRec"."provincialTaxAuthority" ELSE t."provincialTaxAuthority" END,
           "provincialServicesRatePct" = CASE WHEN "pData" ? 'provincialServicesRatePct' THEN "vRec"."provincialServicesRatePct" ELSE t."provincialServicesRatePct" END,
           "atlStatus" = CASE WHEN "pData" ? 'atlStatus' THEN "vRec"."atlStatus" ELSE t."atlStatus" END,
           "atlVerifiedAt" = CASE WHEN "pData" ? 'atlVerifiedAt' THEN "vRec"."atlVerifiedAt" ELSE t."atlVerifiedAt" END,
           "brandPrimaryColour" = CASE WHEN "pData" ? 'brandPrimaryColour' THEN "vRec"."brandPrimaryColour" ELSE t."brandPrimaryColour" END,
           "brandAccentColour" = CASE WHEN "pData" ? 'brandAccentColour' THEN "vRec"."brandAccentColour" ELSE t."brandAccentColour" END,
           "documentFont" = CASE WHEN "pData" ? 'documentFont' THEN "vRec"."documentFont" ELSE t."documentFont" END,
           "paperSize" = CASE WHEN "pData" ? 'paperSize' THEN "vRec"."paperSize" ELSE t."paperSize" END,
           "emailFooter" = CASE WHEN "pData" ? 'emailFooter' THEN "vRec"."emailFooter" ELSE t."emailFooter" END,
           "showPoweredBy" = CASE WHEN "pData" ? 'showPoweredBy' THEN "vRec"."showPoweredBy" ELSE t."showPoweredBy" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."CompanySettings" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CompanySettings %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CompanySettings % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."companySettingAddUpdate"(jsonb) IS 'Save (insert or update) one CompanySettings record.';

-- CompanySettings: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getCompanySettingInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('provinceLabel', "Lookups"."getLookupLabel"('Province', t.province) ->> 'label', 'provinceTone', "Lookups"."getLookupLabel"('Province', t.province) ->> 'tone', 'industryLabel', "Lookups"."getLookupLabel"('CompanySettingIndustry', t.industry) ->> 'label', 'industryTone', "Lookups"."getLookupLabel"('CompanySettingIndustry', t.industry) ->> 'tone', 'legalStructureLabel', "Lookups"."getLookupLabel"('LegalStructure', t."legalStructure") ->> 'label', 'legalStructureTone', "Lookups"."getLookupLabel"('LegalStructure', t."legalStructure") ->> 'tone', 'numberFormatLabel', "Lookups"."getLookupLabel"('NumberFormat', t."numberFormat") ->> 'label', 'numberFormatTone', "Lookups"."getLookupLabel"('NumberFormat', t."numberFormat") ->> 'tone', 'fxRateSourceLabel', "Lookups"."getLookupLabel"('FxRateSource', t."fxRateSource") ->> 'label', 'fxRateSourceTone', "Lookups"."getLookupLabel"('FxRateSource', t."fxRateSource") ->> 'tone', 'creditLimitActionLabel', "Lookups"."getLookupLabel"('CreditLimitAction', t."creditLimitAction") ->> 'label', 'creditLimitActionTone', "Lookups"."getLookupLabel"('CreditLimitAction', t."creditLimitAction") ->> 'tone', 'salesTaxReturnPeriodLabel', "Lookups"."getLookupLabel"('SalesTaxReturnPeriod', t."salesTaxReturnPeriod") ->> 'label', 'salesTaxReturnPeriodTone', "Lookups"."getLookupLabel"('SalesTaxReturnPeriod', t."salesTaxReturnPeriod") ->> 'tone', 'provincialTaxAuthorityLabel', "Lookups"."getLookupLabel"('ProvincialTaxAuthority', t."provincialTaxAuthority") ->> 'label', 'provincialTaxAuthorityTone', "Lookups"."getLookupLabel"('ProvincialTaxAuthority', t."provincialTaxAuthority") ->> 'tone', 'atlStatusLabel', "Lookups"."getLookupLabel"('CompanySettingAtlStatus', t."atlStatus") ->> 'label', 'atlStatusTone', "Lookups"."getLookupLabel"('CompanySettingAtlStatus', t."atlStatus") ->> 'tone', 'documentFontLabel', "Lookups"."getLookupLabel"('DocumentFont', t."documentFont") ->> 'label', 'documentFontTone', "Lookups"."getLookupLabel"('DocumentFont', t."documentFont") ->> 'tone', 'paperSizeLabel', "Lookups"."getLookupLabel"('PaperSize', t."paperSize") ->> 'label', 'paperSizeTone', "Lookups"."getLookupLabel"('PaperSize', t."paperSize") ->> 'tone')
    FROM "Company"."CompanySettings" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getCompanySettingInfo"(uuid) IS 'Read one CompanySettings record (getter for its screens).';

-- DefaultAccountMappings: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."defaultAccountMappingAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."DefaultAccountMappings";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."DefaultAccountMappings", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."DefaultAccountMappings" ("tenantId", role, "accountId", "bankAccountId", remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'role' THEN "vRec".role ELSE NULL END, CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE NULL END, CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."DefaultAccountMappings" t
       SET role = CASE WHEN "pData" ? 'role' THEN "vRec".role ELSE t.role END,
           "accountId" = CASE WHEN "pData" ? 'accountId' THEN "vRec"."accountId" ELSE t."accountId" END,
           "bankAccountId" = CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE t."bankAccountId" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."DefaultAccountMappings" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'DefaultAccountMappings %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'DefaultAccountMappings % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."defaultAccountMappingAddUpdate"(jsonb) IS 'Save (insert or update) one DefaultAccountMappings record.';

-- DefaultAccountMappings: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getDefaultAccountMappingInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "Company"."DefaultAccountMappings" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getDefaultAccountMappingInfo"(uuid) IS 'Read one DefaultAccountMappings record (getter for its screens).';

-- Roles: insert (no "id") or update (with "id"); child arrays: permissions
CREATE OR REPLACE FUNCTION "Company"."roleAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."Roles";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1RolePermissions" "Company"."RolePermissions";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."Roles", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."Roles" ("tenantId", name, "systemKey", description, icon, tone, "isSystem", "branchRestricted", "copiedFromRoleId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'systemKey' THEN "vRec"."systemKey" ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE NULL END, CASE WHEN "pData" ? 'tone' THEN "vRec".tone ELSE NULL END, CASE WHEN "pData" ? 'isSystem' THEN "vRec"."isSystem" ELSE FALSE END, CASE WHEN "pData" ? 'branchRestricted' THEN "vRec"."branchRestricted" ELSE TRUE END, CASE WHEN "pData" ? 'copiedFromRoleId' THEN "vRec"."copiedFromRoleId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."Roles" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "systemKey" = CASE WHEN "pData" ? 'systemKey' THEN "vRec"."systemKey" ELSE t."systemKey" END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END,
           tone = CASE WHEN "pData" ? 'tone' THEN "vRec".tone ELSE t.tone END,
           "isSystem" = CASE WHEN "pData" ? 'isSystem' THEN "vRec"."isSystem" ELSE t."isSystem" END,
           "branchRestricted" = CASE WHEN "pData" ? 'branchRestricted' THEN "vRec"."branchRestricted" ELSE t."branchRestricted" END,
           "copiedFromRoleId" = CASE WHEN "pData" ? 'copiedFromRoleId' THEN "vRec"."copiedFromRoleId" ELSE t."copiedFromRoleId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."Roles" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Roles %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Roles % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'permissions' THEN
    -- permissions: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Company"."RolePermissions"
     WHERE "tenantId" = "vTenant" AND "roleId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'permissions') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'permissions') WITH ORDINALITY t(x, n) LOOP
      "vC1RolePermissions" := jsonb_populate_record(NULL::"Company"."RolePermissions", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Company"."RolePermissions" t
           SET "permissionCode" = CASE WHEN "vE1" ? 'permissionCode' THEN "vC1RolePermissions"."permissionCode" ELSE t."permissionCode" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."roleId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'RolePermissions: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Company"."RolePermissions" ("roleId", "tenantId", "permissionCode")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'permissionCode' THEN "vC1RolePermissions"."permissionCode" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."roleAddUpdate"(jsonb) IS 'Save (insert or update) one Roles record with its permissions.';

-- Roles: one record as JSON (camelCase keys), with lookup labels and permissions
CREATE OR REPLACE FUNCTION "Company"."getRoleInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('systemKeyLabel', "Lookups"."getLookupLabel"('SystemKey', t."systemKey") ->> 'label', 'systemKeyTone', "Lookups"."getLookupLabel"('SystemKey', t."systemKey") ->> 'tone', 'toneLabel', "Lookups"."getLookupLabel"('RoleTone', t.tone) ->> 'label', 'toneTone', "Lookups"."getLookupLabel"('RoleTone', t.tone) ->> 'tone') ||
         jsonb_build_object('permissions', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Company"."RolePermissions" c1 WHERE c1."roleId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Company"."Roles" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getRoleInfo"(uuid) IS 'Read one Roles record (getter for its screens).';

-- UserPreferences: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."userPreferenceAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."UserPreferences";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."UserPreferences", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."UserPreferences" ("tenantId", "userId", language, "dateFormat", "numberFormat", "startRoute", theme, "compactTables", "showAccountCodes", "notifyInApp", "notifyEmailDigest", "emailDigestTime", "notifySmsApprovalsAbove", "notifyWhatsapp", "notifyEvents")
    VALUES ("vTenant", CASE WHEN "pData" ? 'userId' THEN "vRec"."userId" ELSE NULL END, CASE WHEN "pData" ? 'language' THEN "vRec".language ELSE 'EN' END, CASE WHEN "pData" ? 'dateFormat' THEN "vRec"."dateFormat" ELSE 'DD MMM YYYY' END, CASE WHEN "pData" ? 'numberFormat' THEN "vRec"."numberFormat" ELSE 'WESTERN' END, CASE WHEN "pData" ? 'startRoute' THEN "vRec"."startRoute" ELSE 'app/dashboard' END, CASE WHEN "pData" ? 'theme' THEN "vRec".theme ELSE 'SYSTEM' END, CASE WHEN "pData" ? 'compactTables' THEN "vRec"."compactTables" ELSE TRUE END, CASE WHEN "pData" ? 'showAccountCodes' THEN "vRec"."showAccountCodes" ELSE FALSE END, CASE WHEN "pData" ? 'notifyInApp' THEN "vRec"."notifyInApp" ELSE TRUE END, CASE WHEN "pData" ? 'notifyEmailDigest' THEN "vRec"."notifyEmailDigest" ELSE TRUE END, CASE WHEN "pData" ? 'emailDigestTime' THEN "vRec"."emailDigestTime" ELSE '08:00' END, CASE WHEN "pData" ? 'notifySmsApprovalsAbove' THEN "vRec"."notifySmsApprovalsAbove" ELSE NULL END, CASE WHEN "pData" ? 'notifyWhatsapp' THEN "vRec"."notifyWhatsapp" ELSE FALSE END, CASE WHEN "pData" ? 'notifyEvents' THEN "vRec"."notifyEvents" ELSE ARRAY['APPROVAL_ASSIGNED', 'DOC_REJECTED', 'BANK_ALERT', 'CREDIT_BREACH', 'TAX_DUE'] END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."UserPreferences" t
       SET "userId" = CASE WHEN "pData" ? 'userId' THEN "vRec"."userId" ELSE t."userId" END,
           language = CASE WHEN "pData" ? 'language' THEN "vRec".language ELSE t.language END,
           "dateFormat" = CASE WHEN "pData" ? 'dateFormat' THEN "vRec"."dateFormat" ELSE t."dateFormat" END,
           "numberFormat" = CASE WHEN "pData" ? 'numberFormat' THEN "vRec"."numberFormat" ELSE t."numberFormat" END,
           "startRoute" = CASE WHEN "pData" ? 'startRoute' THEN "vRec"."startRoute" ELSE t."startRoute" END,
           theme = CASE WHEN "pData" ? 'theme' THEN "vRec".theme ELSE t.theme END,
           "compactTables" = CASE WHEN "pData" ? 'compactTables' THEN "vRec"."compactTables" ELSE t."compactTables" END,
           "showAccountCodes" = CASE WHEN "pData" ? 'showAccountCodes' THEN "vRec"."showAccountCodes" ELSE t."showAccountCodes" END,
           "notifyInApp" = CASE WHEN "pData" ? 'notifyInApp' THEN "vRec"."notifyInApp" ELSE t."notifyInApp" END,
           "notifyEmailDigest" = CASE WHEN "pData" ? 'notifyEmailDigest' THEN "vRec"."notifyEmailDigest" ELSE t."notifyEmailDigest" END,
           "emailDigestTime" = CASE WHEN "pData" ? 'emailDigestTime' THEN "vRec"."emailDigestTime" ELSE t."emailDigestTime" END,
           "notifySmsApprovalsAbove" = CASE WHEN "pData" ? 'notifySmsApprovalsAbove' THEN "vRec"."notifySmsApprovalsAbove" ELSE t."notifySmsApprovalsAbove" END,
           "notifyWhatsapp" = CASE WHEN "pData" ? 'notifyWhatsapp' THEN "vRec"."notifyWhatsapp" ELSE t."notifyWhatsapp" END,
           "notifyEvents" = CASE WHEN "pData" ? 'notifyEvents' THEN "vRec"."notifyEvents" ELSE t."notifyEvents" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."UserPreferences" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'UserPreferences %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'UserPreferences % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."userPreferenceAddUpdate"(jsonb) IS 'Save (insert or update) one UserPreferences record.';

-- UserPreferences: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getUserPreferenceInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('languageLabel', "Lookups"."getLookupLabel"('EnUrLanguage', t.language) ->> 'label', 'languageTone', "Lookups"."getLookupLabel"('EnUrLanguage', t.language) ->> 'tone', 'dateFormatLabel', "Lookups"."getLookupLabel"('DateFormat', t."dateFormat") ->> 'label', 'dateFormatTone', "Lookups"."getLookupLabel"('DateFormat', t."dateFormat") ->> 'tone', 'numberFormatLabel', "Lookups"."getLookupLabel"('NumberFormat', t."numberFormat") ->> 'label', 'numberFormatTone', "Lookups"."getLookupLabel"('NumberFormat', t."numberFormat") ->> 'tone', 'startRouteLabel', "Lookups"."getLookupLabel"('StartRoute', t."startRoute") ->> 'label', 'startRouteTone', "Lookups"."getLookupLabel"('StartRoute', t."startRoute") ->> 'tone', 'themeLabel', "Lookups"."getLookupLabel"('Theme', t.theme) ->> 'label', 'themeTone', "Lookups"."getLookupLabel"('Theme', t.theme) ->> 'tone')
    FROM "Company"."UserPreferences" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getUserPreferenceInfo"(uuid) IS 'Read one UserPreferences record (getter for its screens).';

-- NumberingSeries: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."numberingSeriesAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."NumberingSeries";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."NumberingSeries", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."NumberingSeries" ("tenantId", "docType", "branchId", prefix, pattern, padding, "startValue", "resetPolicy", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'docType' THEN "vRec"."docType" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'prefix' THEN "vRec".prefix ELSE NULL END, CASE WHEN "pData" ? 'pattern' THEN "vRec".pattern ELSE '{PREFIX}-{YYYY}-{SEQ6}' END, CASE WHEN "pData" ? 'padding' THEN "vRec".padding ELSE 6 END, CASE WHEN "pData" ? 'startValue' THEN "vRec"."startValue" ELSE 1 END, CASE WHEN "pData" ? 'resetPolicy' THEN "vRec"."resetPolicy" ELSE 'YEARLY' END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."NumberingSeries" t
       SET "docType" = CASE WHEN "pData" ? 'docType' THEN "vRec"."docType" ELSE t."docType" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           prefix = CASE WHEN "pData" ? 'prefix' THEN "vRec".prefix ELSE t.prefix END,
           pattern = CASE WHEN "pData" ? 'pattern' THEN "vRec".pattern ELSE t.pattern END,
           padding = CASE WHEN "pData" ? 'padding' THEN "vRec".padding ELSE t.padding END,
           "startValue" = CASE WHEN "pData" ? 'startValue' THEN "vRec"."startValue" ELSE t."startValue" END,
           "resetPolicy" = CASE WHEN "pData" ? 'resetPolicy' THEN "vRec"."resetPolicy" ELSE t."resetPolicy" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."NumberingSeries" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'NumberingSeries %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'NumberingSeries % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."numberingSeriesAddUpdate"(jsonb) IS 'Save (insert or update) one NumberingSeries record.';

-- NumberingSeries: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getNumberingSeriesInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('resetPolicyLabel', "Lookups"."getLookupLabel"('ResetPolicy', t."resetPolicy") ->> 'label', 'resetPolicyTone', "Lookups"."getLookupLabel"('ResetPolicy', t."resetPolicy") ->> 'tone')
    FROM "Company"."NumberingSeries" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getNumberingSeriesInfo"(uuid) IS 'Read one NumberingSeries record (getter for its screens).';
