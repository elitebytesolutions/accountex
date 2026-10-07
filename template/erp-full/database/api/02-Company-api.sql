-- =============================================================================
-- Finsoft ERP (Full edition) — API: "Company"
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
    INSERT INTO "Company"."Branches" ("tenantId", code, name, description, "isHeadOffice", "isDefault", "managerUserId", address, city, province, "salesTaxAuthority", phone, email, "openingDate", status, "managerEmployeeId", latitude, longitude, "geofenceRadiusM")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'isHeadOffice' THEN "vRec"."isHeadOffice" ELSE FALSE END, CASE WHEN "pData" ? 'isDefault' THEN "vRec"."isDefault" ELSE FALSE END, CASE WHEN "pData" ? 'managerUserId' THEN "vRec"."managerUserId" ELSE NULL END, CASE WHEN "pData" ? 'address' THEN "vRec".address ELSE NULL END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'province' THEN "vRec".province ELSE NULL END, CASE WHEN "pData" ? 'salesTaxAuthority' THEN "vRec"."salesTaxAuthority" ELSE NULL END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'openingDate' THEN "vRec"."openingDate" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'managerEmployeeId' THEN "vRec"."managerEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'latitude' THEN "vRec".latitude ELSE NULL END, CASE WHEN "pData" ? 'longitude' THEN "vRec".longitude ELSE NULL END, CASE WHEN "pData" ? 'geofenceRadiusM' THEN "vRec"."geofenceRadiusM" ELSE NULL END)
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
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "managerEmployeeId" = CASE WHEN "pData" ? 'managerEmployeeId' THEN "vRec"."managerEmployeeId" ELSE t."managerEmployeeId" END,
           latitude = CASE WHEN "pData" ? 'latitude' THEN "vRec".latitude ELSE t.latitude END,
           longitude = CASE WHEN "pData" ? 'longitude' THEN "vRec".longitude ELSE t.longitude END,
           "geofenceRadiusM" = CASE WHEN "pData" ? 'geofenceRadiusM' THEN "vRec"."geofenceRadiusM" ELSE t."geofenceRadiusM" END
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

-- Users: insert (no "id") or update (with "id"); child arrays: branches, mfaMethods, roles, warehouses
CREATE OR REPLACE FUNCTION "Company"."userAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."Users";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1UserBranches" "Company"."UserBranches";
  "vC1UserMfaMethods" "Company"."UserMfaMethods";
  "vC1UserRoles" "Company"."UserRoles";
  "vC1UserWarehouses" "Company"."UserWarehouses";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."Users", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."Users" ("tenantId", email, "passwordHash", "mustChangePassword", "passwordChangedAt", "firstName", "lastName", "fullName", "jobTitle", department, phone, "avatarAttachmentId", "emailSignature", "isExternal", "externalOrg", status, "defaultBranchId", "dataScope", "moduleAccess", "approvalLimit", "mfaEnabled", "mfaMethod", "mfaSecretEnc", "mfaRecoveryCodes", "ipRestricted", "ipAllowlist", "sessionTimeoutMin", "loginHours", "loginFrom", "loginTo", "ssoProvider", "ssoSubject", "failedLoginCount", "lockedUntil", "invitedByUserId", "invitedAt", "activatedAt", "suspendedAt", "lastLoginAt", "lastLoginIp", "lastActiveAt", "employeeId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'passwordHash' THEN "vRec"."passwordHash" ELSE NULL END, CASE WHEN "pData" ? 'mustChangePassword' THEN "vRec"."mustChangePassword" ELSE FALSE END, CASE WHEN "pData" ? 'passwordChangedAt' THEN "vRec"."passwordChangedAt" ELSE NULL END, CASE WHEN "pData" ? 'firstName' THEN "vRec"."firstName" ELSE NULL END, CASE WHEN "pData" ? 'lastName' THEN "vRec"."lastName" ELSE NULL END, CASE WHEN "pData" ? 'fullName' THEN "vRec"."fullName" ELSE NULL END, CASE WHEN "pData" ? 'jobTitle' THEN "vRec"."jobTitle" ELSE NULL END, CASE WHEN "pData" ? 'department' THEN "vRec".department ELSE NULL END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'avatarAttachmentId' THEN "vRec"."avatarAttachmentId" ELSE NULL END, CASE WHEN "pData" ? 'emailSignature' THEN "vRec"."emailSignature" ELSE NULL END, CASE WHEN "pData" ? 'isExternal' THEN "vRec"."isExternal" ELSE FALSE END, CASE WHEN "pData" ? 'externalOrg' THEN "vRec"."externalOrg" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'INVITED' END, CASE WHEN "pData" ? 'defaultBranchId' THEN "vRec"."defaultBranchId" ELSE NULL END, CASE WHEN "pData" ? 'dataScope' THEN "vRec"."dataScope" ELSE 'BRANCH' END, CASE WHEN "pData" ? 'moduleAccess' THEN "vRec"."moduleAccess" ELSE '{}' END, CASE WHEN "pData" ? 'approvalLimit' THEN "vRec"."approvalLimit" ELSE 0 END, CASE WHEN "pData" ? 'mfaEnabled' THEN "vRec"."mfaEnabled" ELSE FALSE END, CASE WHEN "pData" ? 'mfaMethod' THEN "vRec"."mfaMethod" ELSE NULL END, CASE WHEN "pData" ? 'mfaSecretEnc' THEN "vRec"."mfaSecretEnc" ELSE NULL END, CASE WHEN "pData" ? 'mfaRecoveryCodes' THEN "vRec"."mfaRecoveryCodes" ELSE NULL END, CASE WHEN "pData" ? 'ipRestricted' THEN "vRec"."ipRestricted" ELSE FALSE END, CASE WHEN "pData" ? 'ipAllowlist' THEN "vRec"."ipAllowlist" ELSE NULL END, CASE WHEN "pData" ? 'sessionTimeoutMin' THEN "vRec"."sessionTimeoutMin" ELSE 60 END, CASE WHEN "pData" ? 'loginHours' THEN "vRec"."loginHours" ELSE 'ANY' END, CASE WHEN "pData" ? 'loginFrom' THEN "vRec"."loginFrom" ELSE NULL END, CASE WHEN "pData" ? 'loginTo' THEN "vRec"."loginTo" ELSE NULL END, CASE WHEN "pData" ? 'ssoProvider' THEN "vRec"."ssoProvider" ELSE NULL END, CASE WHEN "pData" ? 'ssoSubject' THEN "vRec"."ssoSubject" ELSE NULL END, CASE WHEN "pData" ? 'failedLoginCount' THEN "vRec"."failedLoginCount" ELSE 0 END, CASE WHEN "pData" ? 'lockedUntil' THEN "vRec"."lockedUntil" ELSE NULL END, CASE WHEN "pData" ? 'invitedByUserId' THEN "vRec"."invitedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'invitedAt' THEN "vRec"."invitedAt" ELSE NULL END, CASE WHEN "pData" ? 'activatedAt' THEN "vRec"."activatedAt" ELSE NULL END, CASE WHEN "pData" ? 'suspendedAt' THEN "vRec"."suspendedAt" ELSE NULL END, CASE WHEN "pData" ? 'lastLoginAt' THEN "vRec"."lastLoginAt" ELSE NULL END, CASE WHEN "pData" ? 'lastLoginIp' THEN "vRec"."lastLoginIp" ELSE NULL END, CASE WHEN "pData" ? 'lastActiveAt' THEN "vRec"."lastActiveAt" ELSE NULL END, CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END)
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
           "lastActiveAt" = CASE WHEN "pData" ? 'lastActiveAt' THEN "vRec"."lastActiveAt" ELSE t."lastActiveAt" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END
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

  IF "pData" ? 'mfaMethods' THEN
    -- mfaMethods: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Company"."UserMfaMethods"
     WHERE "tenantId" = "vTenant" AND "userId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'mfaMethods') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'mfaMethods') WITH ORDINALITY t(x, n) LOOP
      "vC1UserMfaMethods" := jsonb_populate_record(NULL::"Company"."UserMfaMethods", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Company"."UserMfaMethods" t
           SET "factorType" = CASE WHEN "vE1" ? 'factorType' THEN "vC1UserMfaMethods"."factorType" ELSE t."factorType" END,
               label = CASE WHEN "vE1" ? 'label' THEN "vC1UserMfaMethods".label ELSE t.label END,
               "secretEnc" = CASE WHEN "vE1" ? 'secretEnc' THEN "vC1UserMfaMethods"."secretEnc" ELSE t."secretEnc" END,
               phone = CASE WHEN "vE1" ? 'phone' THEN "vC1UserMfaMethods".phone ELSE t.phone END,
               "isPrimary" = CASE WHEN "vE1" ? 'isPrimary' THEN "vC1UserMfaMethods"."isPrimary" ELSE t."isPrimary" END,
               "verifiedAt" = CASE WHEN "vE1" ? 'verifiedAt' THEN "vC1UserMfaMethods"."verifiedAt" ELSE t."verifiedAt" END,
               "lastUsedAt" = CASE WHEN "vE1" ? 'lastUsedAt' THEN "vC1UserMfaMethods"."lastUsedAt" ELSE t."lastUsedAt" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1UserMfaMethods".status ELSE t.status END,
               "revokedAt" = CASE WHEN "vE1" ? 'revokedAt' THEN "vC1UserMfaMethods"."revokedAt" ELSE t."revokedAt" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."userId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'UserMfaMethods: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Company"."UserMfaMethods" ("userId", "tenantId", "factorType", label, "secretEnc", phone, "isPrimary", "verifiedAt", "lastUsedAt", status, "revokedAt")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'factorType' THEN "vC1UserMfaMethods"."factorType" ELSE NULL END, CASE WHEN "vE1" ? 'label' THEN "vC1UserMfaMethods".label ELSE NULL END, CASE WHEN "vE1" ? 'secretEnc' THEN "vC1UserMfaMethods"."secretEnc" ELSE NULL END, CASE WHEN "vE1" ? 'phone' THEN "vC1UserMfaMethods".phone ELSE NULL END, CASE WHEN "vE1" ? 'isPrimary' THEN "vC1UserMfaMethods"."isPrimary" ELSE FALSE END, CASE WHEN "vE1" ? 'verifiedAt' THEN "vC1UserMfaMethods"."verifiedAt" ELSE NULL END, CASE WHEN "vE1" ? 'lastUsedAt' THEN "vC1UserMfaMethods"."lastUsedAt" ELSE NULL END, CASE WHEN "vE1" ? 'status' THEN "vC1UserMfaMethods".status ELSE 'PENDING' END, CASE WHEN "vE1" ? 'revokedAt' THEN "vC1UserMfaMethods"."revokedAt" ELSE NULL END)
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
COMMENT ON FUNCTION "Company"."userAddUpdate"(jsonb) IS 'Save (insert or update) one Users record with its branches, mfaMethods, roles, warehouses.';

-- Users: one record as JSON (camelCase keys), with lookup labels and branches, mfaMethods, roles, warehouses
CREATE OR REPLACE FUNCTION "Company"."getUserInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t) - 'passwordHash' - 'mustChangePassword' - 'passwordChangedAt' - 'mfaSecretEnc' - 'mfaRecoveryCodes') ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('UserStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('UserStatus', t.status) ->> 'tone', 'dataScopeLabel', "Lookups"."getLookupLabel"('DataScope', t."dataScope") ->> 'label', 'dataScopeTone', "Lookups"."getLookupLabel"('DataScope', t."dataScope") ->> 'tone', 'mfaMethodLabel', "Lookups"."getLookupLabel"('UserMfaMethod', t."mfaMethod") ->> 'label', 'mfaMethodTone', "Lookups"."getLookupLabel"('UserMfaMethod', t."mfaMethod") ->> 'tone', 'loginHoursLabel', "Lookups"."getLookupLabel"('LoginHours', t."loginHours") ->> 'label', 'loginHoursTone', "Lookups"."getLookupLabel"('LoginHours', t."loginHours") ->> 'tone', 'ssoProviderLabel', "Lookups"."getLookupLabel"('UserSsoProvider', t."ssoProvider") ->> 'label', 'ssoProviderTone', "Lookups"."getLookupLabel"('UserSsoProvider', t."ssoProvider") ->> 'tone') ||
         jsonb_build_object('branches', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Company"."UserBranches" c1 WHERE c1."userId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'mfaMethods', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Company"."UserMfaMethods" c1 WHERE c1."userId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'roles', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Company"."UserRoles" c1 WHERE c1."userId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'warehouses', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Company"."UserWarehouses" c1 WHERE c1."userId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
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
    INSERT INTO "Company"."CompanySettings" ("tenantId", "legalName", "tradingName", "secpRegNo", ntn, strn, "registeredAddress", city, province, phone, email, website, industry, timezone, "legalStructure", "logoAttachmentId", "fyStartMonth", "baseCurrencyCode", "amountDecimals", "numberFormat", "booksLockDate", "fxRateSource", "allowMultiCurrency", "requireCostCentreOnExpense", "allowFuturePeriodPosting", "defaultCustomerTermsDays", "quotationValidityDays", "defaultSalesTaxCodeId", "invoiceTerms", "creditLimitAction", "overdueToleranceDays", "blockOverdueOver90", "defaultVendorTermsDays", "threeWayMatchTolerancePct", "billApprovalThreshold", "requireApprovedPoForBill", "autoDeductWht153", "allowPartialGrn", "warnDuplicateVendorInvoice", "stockAdjustmentApprovalThreshold", "gstRegistered", "salesTaxReturnPeriod", "standardGstRatePct", "furtherTaxRatePct", "provincialTaxAuthority", "provincialServicesRatePct", "atlStatus", "atlVerifiedAt", "brandPrimaryColour", "brandAccentColour", "documentFont", "paperSize", "emailFooter", "showPoweredBy", "fbrRealtimeReporting", "printFbrQr", "payDayRule", "payrollCutoff", "workingDaysBasis", "eobiEmployerAmount", "pfRatePct", "autoDeductSalaryTax", "publishPayslipsToEss", "workingWeek", "graceMinutes", "lateMarksPerLeave", "halfDayBelowHours", "overtimeMultiplier", "attendanceSource", "geofenceEssPunch", "allowOffsitePersonalPunch")
    VALUES ("vTenant", CASE WHEN "pData" ? 'legalName' THEN "vRec"."legalName" ELSE NULL END, CASE WHEN "pData" ? 'tradingName' THEN "vRec"."tradingName" ELSE NULL END, CASE WHEN "pData" ? 'secpRegNo' THEN "vRec"."secpRegNo" ELSE NULL END, CASE WHEN "pData" ? 'ntn' THEN "vRec".ntn ELSE NULL END, CASE WHEN "pData" ? 'strn' THEN "vRec".strn ELSE NULL END, CASE WHEN "pData" ? 'registeredAddress' THEN "vRec"."registeredAddress" ELSE NULL END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'province' THEN "vRec".province ELSE NULL END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'website' THEN "vRec".website ELSE NULL END, CASE WHEN "pData" ? 'industry' THEN "vRec".industry ELSE NULL END, CASE WHEN "pData" ? 'timezone' THEN "vRec".timezone ELSE 'Asia/Karachi' END, CASE WHEN "pData" ? 'legalStructure' THEN "vRec"."legalStructure" ELSE NULL END, CASE WHEN "pData" ? 'logoAttachmentId' THEN "vRec"."logoAttachmentId" ELSE NULL END, CASE WHEN "pData" ? 'fyStartMonth' THEN "vRec"."fyStartMonth" ELSE 7 END, CASE WHEN "pData" ? 'baseCurrencyCode' THEN "vRec"."baseCurrencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'amountDecimals' THEN "vRec"."amountDecimals" ELSE 2 END, CASE WHEN "pData" ? 'numberFormat' THEN "vRec"."numberFormat" ELSE 'WESTERN' END, CASE WHEN "pData" ? 'booksLockDate' THEN "vRec"."booksLockDate" ELSE NULL END, CASE WHEN "pData" ? 'fxRateSource' THEN "vRec"."fxRateSource" ELSE 'SBP_DAILY' END, CASE WHEN "pData" ? 'allowMultiCurrency' THEN "vRec"."allowMultiCurrency" ELSE FALSE END, CASE WHEN "pData" ? 'requireCostCentreOnExpense' THEN "vRec"."requireCostCentreOnExpense" ELSE FALSE END, CASE WHEN "pData" ? 'allowFuturePeriodPosting' THEN "vRec"."allowFuturePeriodPosting" ELSE FALSE END, CASE WHEN "pData" ? 'defaultCustomerTermsDays' THEN "vRec"."defaultCustomerTermsDays" ELSE 30 END, CASE WHEN "pData" ? 'quotationValidityDays' THEN "vRec"."quotationValidityDays" ELSE 15 END, CASE WHEN "pData" ? 'defaultSalesTaxCodeId' THEN "vRec"."defaultSalesTaxCodeId" ELSE NULL END, CASE WHEN "pData" ? 'invoiceTerms' THEN "vRec"."invoiceTerms" ELSE NULL END, CASE WHEN "pData" ? 'creditLimitAction' THEN "vRec"."creditLimitAction" ELSE 'BLOCK_OVERRIDE' END, CASE WHEN "pData" ? 'overdueToleranceDays' THEN "vRec"."overdueToleranceDays" ELSE 15 END, CASE WHEN "pData" ? 'blockOverdueOver90' THEN "vRec"."blockOverdueOver90" ELSE TRUE END, CASE WHEN "pData" ? 'defaultVendorTermsDays' THEN "vRec"."defaultVendorTermsDays" ELSE 45 END, CASE WHEN "pData" ? 'threeWayMatchTolerancePct' THEN "vRec"."threeWayMatchTolerancePct" ELSE 2 END, CASE WHEN "pData" ? 'billApprovalThreshold' THEN "vRec"."billApprovalThreshold" ELSE NULL END, CASE WHEN "pData" ? 'requireApprovedPoForBill' THEN "vRec"."requireApprovedPoForBill" ELSE TRUE END, CASE WHEN "pData" ? 'autoDeductWht153' THEN "vRec"."autoDeductWht153" ELSE TRUE END, CASE WHEN "pData" ? 'allowPartialGrn' THEN "vRec"."allowPartialGrn" ELSE FALSE END, CASE WHEN "pData" ? 'warnDuplicateVendorInvoice' THEN "vRec"."warnDuplicateVendorInvoice" ELSE TRUE END, CASE WHEN "pData" ? 'stockAdjustmentApprovalThreshold' THEN "vRec"."stockAdjustmentApprovalThreshold" ELSE 25000 END, CASE WHEN "pData" ? 'gstRegistered' THEN "vRec"."gstRegistered" ELSE TRUE END, CASE WHEN "pData" ? 'salesTaxReturnPeriod' THEN "vRec"."salesTaxReturnPeriod" ELSE 'MONTHLY' END, CASE WHEN "pData" ? 'standardGstRatePct' THEN "vRec"."standardGstRatePct" ELSE 18 END, CASE WHEN "pData" ? 'furtherTaxRatePct' THEN "vRec"."furtherTaxRatePct" ELSE 4 END, CASE WHEN "pData" ? 'provincialTaxAuthority' THEN "vRec"."provincialTaxAuthority" ELSE NULL END, CASE WHEN "pData" ? 'provincialServicesRatePct' THEN "vRec"."provincialServicesRatePct" ELSE NULL END, CASE WHEN "pData" ? 'atlStatus' THEN "vRec"."atlStatus" ELSE 'UNKNOWN' END, CASE WHEN "pData" ? 'atlVerifiedAt' THEN "vRec"."atlVerifiedAt" ELSE NULL END, CASE WHEN "pData" ? 'brandPrimaryColour' THEN "vRec"."brandPrimaryColour" ELSE '#15803D' END, CASE WHEN "pData" ? 'brandAccentColour' THEN "vRec"."brandAccentColour" ELSE '#EFBC61' END, CASE WHEN "pData" ? 'documentFont' THEN "vRec"."documentFont" ELSE 'INTER' END, CASE WHEN "pData" ? 'paperSize' THEN "vRec"."paperSize" ELSE 'A4' END, CASE WHEN "pData" ? 'emailFooter' THEN "vRec"."emailFooter" ELSE NULL END, CASE WHEN "pData" ? 'showPoweredBy' THEN "vRec"."showPoweredBy" ELSE TRUE END, CASE WHEN "pData" ? 'fbrRealtimeReporting' THEN "vRec"."fbrRealtimeReporting" ELSE FALSE END, CASE WHEN "pData" ? 'printFbrQr' THEN "vRec"."printFbrQr" ELSE FALSE END, CASE WHEN "pData" ? 'payDayRule' THEN "vRec"."payDayRule" ELSE 'LAST_WORKING_DAY' END, CASE WHEN "pData" ? 'payrollCutoff' THEN "vRec"."payrollCutoff" ELSE 'DAY_25' END, CASE WHEN "pData" ? 'workingDaysBasis' THEN "vRec"."workingDaysBasis" ELSE 'CALENDAR_DAYS' END, CASE WHEN "pData" ? 'eobiEmployerAmount' THEN "vRec"."eobiEmployerAmount" ELSE NULL END, CASE WHEN "pData" ? 'pfRatePct' THEN "vRec"."pfRatePct" ELSE NULL END, CASE WHEN "pData" ? 'autoDeductSalaryTax' THEN "vRec"."autoDeductSalaryTax" ELSE TRUE END, CASE WHEN "pData" ? 'publishPayslipsToEss' THEN "vRec"."publishPayslipsToEss" ELSE TRUE END, CASE WHEN "pData" ? 'workingWeek' THEN "vRec"."workingWeek" ELSE 'MON_SAT_HALF_SAT' END, CASE WHEN "pData" ? 'graceMinutes' THEN "vRec"."graceMinutes" ELSE 15 END, CASE WHEN "pData" ? 'lateMarksPerLeave' THEN "vRec"."lateMarksPerLeave" ELSE 3 END, CASE WHEN "pData" ? 'halfDayBelowHours' THEN "vRec"."halfDayBelowHours" ELSE 5 END, CASE WHEN "pData" ? 'overtimeMultiplier' THEN "vRec"."overtimeMultiplier" ELSE 2 END, CASE WHEN "pData" ? 'attendanceSource' THEN "vRec"."attendanceSource" ELSE 'BIOMETRIC_AND_ESS' END, CASE WHEN "pData" ? 'geofenceEssPunch' THEN "vRec"."geofenceEssPunch" ELSE TRUE END, CASE WHEN "pData" ? 'allowOffsitePersonalPunch' THEN "vRec"."allowOffsitePersonalPunch" ELSE FALSE END)
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
           "showPoweredBy" = CASE WHEN "pData" ? 'showPoweredBy' THEN "vRec"."showPoweredBy" ELSE t."showPoweredBy" END,
           "fbrRealtimeReporting" = CASE WHEN "pData" ? 'fbrRealtimeReporting' THEN "vRec"."fbrRealtimeReporting" ELSE t."fbrRealtimeReporting" END,
           "printFbrQr" = CASE WHEN "pData" ? 'printFbrQr' THEN "vRec"."printFbrQr" ELSE t."printFbrQr" END,
           "payDayRule" = CASE WHEN "pData" ? 'payDayRule' THEN "vRec"."payDayRule" ELSE t."payDayRule" END,
           "payrollCutoff" = CASE WHEN "pData" ? 'payrollCutoff' THEN "vRec"."payrollCutoff" ELSE t."payrollCutoff" END,
           "workingDaysBasis" = CASE WHEN "pData" ? 'workingDaysBasis' THEN "vRec"."workingDaysBasis" ELSE t."workingDaysBasis" END,
           "eobiEmployerAmount" = CASE WHEN "pData" ? 'eobiEmployerAmount' THEN "vRec"."eobiEmployerAmount" ELSE t."eobiEmployerAmount" END,
           "pfRatePct" = CASE WHEN "pData" ? 'pfRatePct' THEN "vRec"."pfRatePct" ELSE t."pfRatePct" END,
           "autoDeductSalaryTax" = CASE WHEN "pData" ? 'autoDeductSalaryTax' THEN "vRec"."autoDeductSalaryTax" ELSE t."autoDeductSalaryTax" END,
           "publishPayslipsToEss" = CASE WHEN "pData" ? 'publishPayslipsToEss' THEN "vRec"."publishPayslipsToEss" ELSE t."publishPayslipsToEss" END,
           "workingWeek" = CASE WHEN "pData" ? 'workingWeek' THEN "vRec"."workingWeek" ELSE t."workingWeek" END,
           "graceMinutes" = CASE WHEN "pData" ? 'graceMinutes' THEN "vRec"."graceMinutes" ELSE t."graceMinutes" END,
           "lateMarksPerLeave" = CASE WHEN "pData" ? 'lateMarksPerLeave' THEN "vRec"."lateMarksPerLeave" ELSE t."lateMarksPerLeave" END,
           "halfDayBelowHours" = CASE WHEN "pData" ? 'halfDayBelowHours' THEN "vRec"."halfDayBelowHours" ELSE t."halfDayBelowHours" END,
           "overtimeMultiplier" = CASE WHEN "pData" ? 'overtimeMultiplier' THEN "vRec"."overtimeMultiplier" ELSE t."overtimeMultiplier" END,
           "attendanceSource" = CASE WHEN "pData" ? 'attendanceSource' THEN "vRec"."attendanceSource" ELSE t."attendanceSource" END,
           "geofenceEssPunch" = CASE WHEN "pData" ? 'geofenceEssPunch' THEN "vRec"."geofenceEssPunch" ELSE t."geofenceEssPunch" END,
           "allowOffsitePersonalPunch" = CASE WHEN "pData" ? 'allowOffsitePersonalPunch' THEN "vRec"."allowOffsitePersonalPunch" ELSE t."allowOffsitePersonalPunch" END
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
         jsonb_build_object('provinceLabel', "Lookups"."getLookupLabel"('Province', t.province) ->> 'label', 'provinceTone', "Lookups"."getLookupLabel"('Province', t.province) ->> 'tone', 'industryLabel', "Lookups"."getLookupLabel"('CompanySettingIndustry', t.industry) ->> 'label', 'industryTone', "Lookups"."getLookupLabel"('CompanySettingIndustry', t.industry) ->> 'tone', 'legalStructureLabel', "Lookups"."getLookupLabel"('LegalStructure', t."legalStructure") ->> 'label', 'legalStructureTone', "Lookups"."getLookupLabel"('LegalStructure', t."legalStructure") ->> 'tone', 'numberFormatLabel', "Lookups"."getLookupLabel"('NumberFormat', t."numberFormat") ->> 'label', 'numberFormatTone', "Lookups"."getLookupLabel"('NumberFormat', t."numberFormat") ->> 'tone', 'fxRateSourceLabel', "Lookups"."getLookupLabel"('FxRateSource', t."fxRateSource") ->> 'label', 'fxRateSourceTone', "Lookups"."getLookupLabel"('FxRateSource', t."fxRateSource") ->> 'tone', 'creditLimitActionLabel', "Lookups"."getLookupLabel"('CreditLimitAction', t."creditLimitAction") ->> 'label', 'creditLimitActionTone', "Lookups"."getLookupLabel"('CreditLimitAction', t."creditLimitAction") ->> 'tone', 'salesTaxReturnPeriodLabel', "Lookups"."getLookupLabel"('SalesTaxReturnPeriod', t."salesTaxReturnPeriod") ->> 'label', 'salesTaxReturnPeriodTone', "Lookups"."getLookupLabel"('SalesTaxReturnPeriod', t."salesTaxReturnPeriod") ->> 'tone', 'provincialTaxAuthorityLabel', "Lookups"."getLookupLabel"('ProvincialTaxAuthority', t."provincialTaxAuthority") ->> 'label', 'provincialTaxAuthorityTone', "Lookups"."getLookupLabel"('ProvincialTaxAuthority', t."provincialTaxAuthority") ->> 'tone', 'atlStatusLabel', "Lookups"."getLookupLabel"('CompanySettingAtlStatus', t."atlStatus") ->> 'label', 'atlStatusTone', "Lookups"."getLookupLabel"('CompanySettingAtlStatus', t."atlStatus") ->> 'tone', 'documentFontLabel', "Lookups"."getLookupLabel"('DocumentFont', t."documentFont") ->> 'label', 'documentFontTone', "Lookups"."getLookupLabel"('DocumentFont', t."documentFont") ->> 'tone', 'paperSizeLabel', "Lookups"."getLookupLabel"('PaperSize', t."paperSize") ->> 'label', 'paperSizeTone', "Lookups"."getLookupLabel"('PaperSize', t."paperSize") ->> 'tone', 'payDayRuleLabel', "Lookups"."getLookupLabel"('PayDayRule', t."payDayRule") ->> 'label', 'payDayRuleTone', "Lookups"."getLookupLabel"('PayDayRule', t."payDayRule") ->> 'tone', 'payrollCutoffLabel', "Lookups"."getLookupLabel"('PayrollCutoff', t."payrollCutoff") ->> 'label', 'payrollCutoffTone', "Lookups"."getLookupLabel"('PayrollCutoff', t."payrollCutoff") ->> 'tone', 'workingDaysBasisLabel', "Lookups"."getLookupLabel"('WorkingDaysBasis', t."workingDaysBasis") ->> 'label', 'workingDaysBasisTone', "Lookups"."getLookupLabel"('WorkingDaysBasis', t."workingDaysBasis") ->> 'tone', 'workingWeekLabel', "Lookups"."getLookupLabel"('WorkingWeek', t."workingWeek") ->> 'label', 'workingWeekTone', "Lookups"."getLookupLabel"('WorkingWeek', t."workingWeek") ->> 'tone', 'attendanceSourceLabel', "Lookups"."getLookupLabel"('AttendanceSource', t."attendanceSource") ->> 'label', 'attendanceSourceTone', "Lookups"."getLookupLabel"('AttendanceSource', t."attendanceSource") ->> 'tone')
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

-- Roles: insert (no "id") or update (with "id"); child arrays: limits, permissions
CREATE OR REPLACE FUNCTION "Company"."roleAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."Roles";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1RoleLimits" "Company"."RoleLimits";
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

  IF "pData" ? 'limits' THEN
    -- limits: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Company"."RoleLimits"
     WHERE "tenantId" = "vTenant" AND "roleId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'limits') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'limits') WITH ORDINALITY t(x, n) LOOP
      "vC1RoleLimits" := jsonb_populate_record(NULL::"Company"."RoleLimits", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Company"."RoleLimits" t
           SET "maxVoucherAmount" = CASE WHEN "vE1" ? 'maxVoucherAmount' THEN "vC1RoleLimits"."maxVoucherAmount" ELSE t."maxVoucherAmount" END,
               "maxDiscountPct" = CASE WHEN "vE1" ? 'maxDiscountPct' THEN "vC1RoleLimits"."maxDiscountPct" ELSE t."maxDiscountPct" END,
               "backdateDays" = CASE WHEN "vE1" ? 'backdateDays' THEN "vC1RoleLimits"."backdateDays" ELSE t."backdateDays" END,
               "salaryVisibility" = CASE WHEN "vE1" ? 'salaryVisibility' THEN "vC1RoleLimits"."salaryVisibility" ELSE t."salaryVisibility" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."roleId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'RoleLimits: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Company"."RoleLimits" ("roleId", "tenantId", "maxVoucherAmount", "maxDiscountPct", "backdateDays", "salaryVisibility")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'maxVoucherAmount' THEN "vC1RoleLimits"."maxVoucherAmount" ELSE 0 END, CASE WHEN "vE1" ? 'maxDiscountPct' THEN "vC1RoleLimits"."maxDiscountPct" ELSE 0 END, CASE WHEN "vE1" ? 'backdateDays' THEN "vC1RoleLimits"."backdateDays" ELSE 0 END, CASE WHEN "vE1" ? 'salaryVisibility' THEN "vC1RoleLimits"."salaryVisibility" ELSE 'HIDDEN' END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
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
COMMENT ON FUNCTION "Company"."roleAddUpdate"(jsonb) IS 'Save (insert or update) one Roles record with its limits, permissions.';

-- Roles: one record as JSON (camelCase keys), with lookup labels and limits, permissions
CREATE OR REPLACE FUNCTION "Company"."getRoleInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('systemKeyLabel', "Lookups"."getLookupLabel"('SystemKey', t."systemKey") ->> 'label', 'systemKeyTone', "Lookups"."getLookupLabel"('SystemKey', t."systemKey") ->> 'tone', 'toneLabel', "Lookups"."getLookupLabel"('RoleTone', t.tone) ->> 'label', 'toneTone', "Lookups"."getLookupLabel"('RoleTone', t.tone) ->> 'tone') ||
         jsonb_build_object('limits', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Company"."RoleLimits" c1 WHERE c1."roleId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'permissions', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Company"."RolePermissions" c1 WHERE c1."roleId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
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

-- ExchangeRates: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."exchangeRateAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."ExchangeRates";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."ExchangeRates", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."ExchangeRates" ("tenantId", "currencyCode", "rateDate", rate, source)
    VALUES ("vTenant", CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE NULL END, CASE WHEN "pData" ? 'rateDate' THEN "vRec"."rateDate" ELSE NULL END, CASE WHEN "pData" ? 'rate' THEN "vRec".rate ELSE NULL END, CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE 'SBP' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."ExchangeRates" t
       SET "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "rateDate" = CASE WHEN "pData" ? 'rateDate' THEN "vRec"."rateDate" ELSE t."rateDate" END,
           rate = CASE WHEN "pData" ? 'rate' THEN "vRec".rate ELSE t.rate END,
           source = CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE t.source END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."ExchangeRates" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ExchangeRates %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ExchangeRates % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."exchangeRateAddUpdate"(jsonb) IS 'Save (insert or update) one ExchangeRates record.';

-- ExchangeRates: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getExchangeRateInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('sourceLabel', "Lookups"."getLookupLabel"('ExchangeRateSource', t.source) ->> 'label', 'sourceTone', "Lookups"."getLookupLabel"('ExchangeRateSource', t.source) ->> 'tone')
    FROM "Company"."ExchangeRates" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getExchangeRateInfo"(uuid) IS 'Read one ExchangeRates record (getter for its screens).';

-- UserInvites: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."userInviteAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."UserInvites";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."UserInvites", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."UserInvites" ("tenantId", "userId", email, "fullName", phone, "roleId", "branchId", "employeeId", channels, "passwordResetId", "invitedByUserId", "sentAt", "expiresAt", "resendCount", "lastResentAt", status, "acceptedAt", "revokedAt", "revokedByUserId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'userId' THEN "vRec"."userId" ELSE NULL END, CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'fullName' THEN "vRec"."fullName" ELSE NULL END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'roleId' THEN "vRec"."roleId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'channels' THEN "vRec".channels ELSE ARRAY['EMAIL'] END, CASE WHEN "pData" ? 'passwordResetId' THEN "vRec"."passwordResetId" ELSE NULL END, CASE WHEN "pData" ? 'invitedByUserId' THEN "vRec"."invitedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'sentAt' THEN "vRec"."sentAt" ELSE now() END, CASE WHEN "pData" ? 'expiresAt' THEN "vRec"."expiresAt" ELSE NULL END, CASE WHEN "pData" ? 'resendCount' THEN "vRec"."resendCount" ELSE 0 END, CASE WHEN "pData" ? 'lastResentAt' THEN "vRec"."lastResentAt" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'PENDING' END, CASE WHEN "pData" ? 'acceptedAt' THEN "vRec"."acceptedAt" ELSE NULL END, CASE WHEN "pData" ? 'revokedAt' THEN "vRec"."revokedAt" ELSE NULL END, CASE WHEN "pData" ? 'revokedByUserId' THEN "vRec"."revokedByUserId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."UserInvites" t
       SET "userId" = CASE WHEN "pData" ? 'userId' THEN "vRec"."userId" ELSE t."userId" END,
           email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           "fullName" = CASE WHEN "pData" ? 'fullName' THEN "vRec"."fullName" ELSE t."fullName" END,
           phone = CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE t.phone END,
           "roleId" = CASE WHEN "pData" ? 'roleId' THEN "vRec"."roleId" ELSE t."roleId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           channels = CASE WHEN "pData" ? 'channels' THEN "vRec".channels ELSE t.channels END,
           "passwordResetId" = CASE WHEN "pData" ? 'passwordResetId' THEN "vRec"."passwordResetId" ELSE t."passwordResetId" END,
           "invitedByUserId" = CASE WHEN "pData" ? 'invitedByUserId' THEN "vRec"."invitedByUserId" ELSE t."invitedByUserId" END,
           "sentAt" = CASE WHEN "pData" ? 'sentAt' THEN "vRec"."sentAt" ELSE t."sentAt" END,
           "expiresAt" = CASE WHEN "pData" ? 'expiresAt' THEN "vRec"."expiresAt" ELSE t."expiresAt" END,
           "resendCount" = CASE WHEN "pData" ? 'resendCount' THEN "vRec"."resendCount" ELSE t."resendCount" END,
           "lastResentAt" = CASE WHEN "pData" ? 'lastResentAt' THEN "vRec"."lastResentAt" ELSE t."lastResentAt" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "acceptedAt" = CASE WHEN "pData" ? 'acceptedAt' THEN "vRec"."acceptedAt" ELSE t."acceptedAt" END,
           "revokedAt" = CASE WHEN "pData" ? 'revokedAt' THEN "vRec"."revokedAt" ELSE t."revokedAt" END,
           "revokedByUserId" = CASE WHEN "pData" ? 'revokedByUserId' THEN "vRec"."revokedByUserId" ELSE t."revokedByUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."UserInvites" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'UserInvites %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'UserInvites % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."userInviteAddUpdate"(jsonb) IS 'Save (insert or update) one UserInvites record.';

-- UserInvites: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getUserInviteInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t) - 'passwordResetId') ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('UserInviteStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('UserInviteStatus', t.status) ->> 'tone')
    FROM "Company"."UserInvites" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getUserInviteInfo"(uuid) IS 'Read one UserInvites record (getter for its screens).';

-- SegregationOfDutiesRules: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."segregationOfDutiesRuleAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."SegregationOfDutiesRules";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."SegregationOfDutiesRules", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."SegregationOfDutiesRules" ("tenantId", code, name, kind, "permissionA", "permissionB", description, severity, "ownerExempt", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE NULL END, CASE WHEN "pData" ? 'permissionA' THEN "vRec"."permissionA" ELSE NULL END, CASE WHEN "pData" ? 'permissionB' THEN "vRec"."permissionB" ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'severity' THEN "vRec".severity ELSE 'WARN' END, CASE WHEN "pData" ? 'ownerExempt' THEN "vRec"."ownerExempt" ELSE TRUE END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."SegregationOfDutiesRules" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           kind = CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE t.kind END,
           "permissionA" = CASE WHEN "pData" ? 'permissionA' THEN "vRec"."permissionA" ELSE t."permissionA" END,
           "permissionB" = CASE WHEN "pData" ? 'permissionB' THEN "vRec"."permissionB" ELSE t."permissionB" END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           severity = CASE WHEN "pData" ? 'severity' THEN "vRec".severity ELSE t.severity END,
           "ownerExempt" = CASE WHEN "pData" ? 'ownerExempt' THEN "vRec"."ownerExempt" ELSE t."ownerExempt" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."SegregationOfDutiesRules" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'SegregationOfDutiesRules %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SegregationOfDutiesRules % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."segregationOfDutiesRuleAddUpdate"(jsonb) IS 'Save (insert or update) one SegregationOfDutiesRules record.';

-- SegregationOfDutiesRules: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getSegregationOfDutiesRuleInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('kindLabel', "Lookups"."getLookupLabel"('SegregationOfDutiesRuleKind', t.kind) ->> 'label', 'kindTone', "Lookups"."getLookupLabel"('SegregationOfDutiesRuleKind', t.kind) ->> 'tone', 'severityLabel', "Lookups"."getLookupLabel"('SegregationOfDutiesRuleSeverity', t.severity) ->> 'label', 'severityTone', "Lookups"."getLookupLabel"('SegregationOfDutiesRuleSeverity', t.severity) ->> 'tone')
    FROM "Company"."SegregationOfDutiesRules" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getSegregationOfDutiesRuleInfo"(uuid) IS 'Read one SegregationOfDutiesRules record (getter for its screens).';

-- ApprovalWorkflows: insert (no "id") or update (with "id"); child arrays: conditions, steps
CREATE OR REPLACE FUNCTION "Company"."approvalWorkflowAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."ApprovalWorkflows";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1ApprovalWorkflowConditions" "Company"."ApprovalWorkflowConditions";
  "vC1ApprovalWorkflowSteps" "Company"."ApprovalWorkflowSteps";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."ApprovalWorkflows", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."ApprovalWorkflows" ("tenantId", name, subject, description, status, version, priority, "onComplete", "onReject", "notifyPreparer", "notifyInApp", "notifyEmail", "notifyWhatsapp", "publishedAt", "publishedByUserId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'subject' THEN "vRec".subject ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'DRAFT' END, CASE WHEN "pData" ? 'version' THEN "vRec".version ELSE 1 END, CASE WHEN "pData" ? 'priority' THEN "vRec".priority ELSE 100 END, CASE WHEN "pData" ? 'onComplete' THEN "vRec"."onComplete" ELSE 'AUTO_POST' END, CASE WHEN "pData" ? 'onReject' THEN "vRec"."onReject" ELSE 'RETURN_TO_PREPARER' END, CASE WHEN "pData" ? 'notifyPreparer' THEN "vRec"."notifyPreparer" ELSE TRUE END, CASE WHEN "pData" ? 'notifyInApp' THEN "vRec"."notifyInApp" ELSE TRUE END, CASE WHEN "pData" ? 'notifyEmail' THEN "vRec"."notifyEmail" ELSE TRUE END, CASE WHEN "pData" ? 'notifyWhatsapp' THEN "vRec"."notifyWhatsapp" ELSE FALSE END, CASE WHEN "pData" ? 'publishedAt' THEN "vRec"."publishedAt" ELSE NULL END, CASE WHEN "pData" ? 'publishedByUserId' THEN "vRec"."publishedByUserId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."ApprovalWorkflows" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           subject = CASE WHEN "pData" ? 'subject' THEN "vRec".subject ELSE t.subject END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           version = CASE WHEN "pData" ? 'version' THEN "vRec".version ELSE t.version END,
           priority = CASE WHEN "pData" ? 'priority' THEN "vRec".priority ELSE t.priority END,
           "onComplete" = CASE WHEN "pData" ? 'onComplete' THEN "vRec"."onComplete" ELSE t."onComplete" END,
           "onReject" = CASE WHEN "pData" ? 'onReject' THEN "vRec"."onReject" ELSE t."onReject" END,
           "notifyPreparer" = CASE WHEN "pData" ? 'notifyPreparer' THEN "vRec"."notifyPreparer" ELSE t."notifyPreparer" END,
           "notifyInApp" = CASE WHEN "pData" ? 'notifyInApp' THEN "vRec"."notifyInApp" ELSE t."notifyInApp" END,
           "notifyEmail" = CASE WHEN "pData" ? 'notifyEmail' THEN "vRec"."notifyEmail" ELSE t."notifyEmail" END,
           "notifyWhatsapp" = CASE WHEN "pData" ? 'notifyWhatsapp' THEN "vRec"."notifyWhatsapp" ELSE t."notifyWhatsapp" END,
           "publishedAt" = CASE WHEN "pData" ? 'publishedAt' THEN "vRec"."publishedAt" ELSE t."publishedAt" END,
           "publishedByUserId" = CASE WHEN "pData" ? 'publishedByUserId' THEN "vRec"."publishedByUserId" ELSE t."publishedByUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."ApprovalWorkflows" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ApprovalWorkflows %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ApprovalWorkflows % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'conditions' THEN
    -- conditions: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Company"."ApprovalWorkflowConditions"
     WHERE "tenantId" = "vTenant" AND "workflowId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'conditions') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'conditions') WITH ORDINALITY t(x, n) LOOP
      "vC1ApprovalWorkflowConditions" := jsonb_populate_record(NULL::"Company"."ApprovalWorkflowConditions", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Company"."ApprovalWorkflowConditions" t
           SET seq = CASE WHEN "vE1" ? 'seq' THEN "vC1ApprovalWorkflowConditions".seq ELSE t.seq END,
               field = CASE WHEN "vE1" ? 'field' THEN "vC1ApprovalWorkflowConditions".field ELSE t.field END,
               operator = CASE WHEN "vE1" ? 'operator' THEN "vC1ApprovalWorkflowConditions".operator ELSE t.operator END,
               value = CASE WHEN "vE1" ? 'value' THEN "vC1ApprovalWorkflowConditions".value ELSE t.value END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."workflowId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ApprovalWorkflowConditions: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Company"."ApprovalWorkflowConditions" ("workflowId", "tenantId", seq, field, operator, value)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'seq' THEN "vC1ApprovalWorkflowConditions".seq ELSE NULL END, CASE WHEN "vE1" ? 'field' THEN "vC1ApprovalWorkflowConditions".field ELSE NULL END, CASE WHEN "vE1" ? 'operator' THEN "vC1ApprovalWorkflowConditions".operator ELSE NULL END, CASE WHEN "vE1" ? 'value' THEN "vC1ApprovalWorkflowConditions".value ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'steps' THEN
    -- steps: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Company"."ApprovalWorkflowSteps"
     WHERE "tenantId" = "vTenant" AND "workflowId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'steps') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'steps') WITH ORDINALITY t(x, n) LOOP
      "vC1ApprovalWorkflowSteps" := jsonb_populate_record(NULL::"Company"."ApprovalWorkflowSteps", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Company"."ApprovalWorkflowSteps" t
           SET "stepNo" = CASE WHEN "vE1" ? 'stepNo' THEN "vC1ApprovalWorkflowSteps"."stepNo" ELSE t."stepNo" END,
               name = CASE WHEN "vE1" ? 'name' THEN "vC1ApprovalWorkflowSteps".name ELSE t.name END,
               "approverType" = CASE WHEN "vE1" ? 'approverType' THEN "vC1ApprovalWorkflowSteps"."approverType" ELSE t."approverType" END,
               "approverRoleId" = CASE WHEN "vE1" ? 'approverRoleId' THEN "vC1ApprovalWorkflowSteps"."approverRoleId" ELSE t."approverRoleId" END,
               "approverUserId" = CASE WHEN "vE1" ? 'approverUserId' THEN "vC1ApprovalWorkflowSteps"."approverUserId" ELSE t."approverUserId" END,
               "appliesAboveAmount" = CASE WHEN "vE1" ? 'appliesAboveAmount' THEN "vC1ApprovalWorkflowSteps"."appliesAboveAmount" ELSE t."appliesAboveAmount" END,
               "slaHours" = CASE WHEN "vE1" ? 'slaHours' THEN "vC1ApprovalWorkflowSteps"."slaHours" ELSE t."slaHours" END,
               "onSlaBreach" = CASE WHEN "vE1" ? 'onSlaBreach' THEN "vC1ApprovalWorkflowSteps"."onSlaBreach" ELSE t."onSlaBreach" END,
               "approvalMode" = CASE WHEN "vE1" ? 'approvalMode' THEN "vC1ApprovalWorkflowSteps"."approvalMode" ELSE t."approvalMode" END,
               "blockSelfApproval" = CASE WHEN "vE1" ? 'blockSelfApproval' THEN "vC1ApprovalWorkflowSteps"."blockSelfApproval" ELSE t."blockSelfApproval" END,
               "allowDelegation" = CASE WHEN "vE1" ? 'allowDelegation' THEN "vC1ApprovalWorkflowSteps"."allowDelegation" ELSE t."allowDelegation" END,
               "requireComment" = CASE WHEN "vE1" ? 'requireComment' THEN "vC1ApprovalWorkflowSteps"."requireComment" ELSE t."requireComment" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."workflowId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ApprovalWorkflowSteps: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Company"."ApprovalWorkflowSteps" ("workflowId", "tenantId", "stepNo", name, "approverType", "approverRoleId", "approverUserId", "appliesAboveAmount", "slaHours", "onSlaBreach", "approvalMode", "blockSelfApproval", "allowDelegation", "requireComment")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'stepNo' THEN "vC1ApprovalWorkflowSteps"."stepNo" ELSE NULL END, CASE WHEN "vE1" ? 'name' THEN "vC1ApprovalWorkflowSteps".name ELSE NULL END, CASE WHEN "vE1" ? 'approverType' THEN "vC1ApprovalWorkflowSteps"."approverType" ELSE NULL END, CASE WHEN "vE1" ? 'approverRoleId' THEN "vC1ApprovalWorkflowSteps"."approverRoleId" ELSE NULL END, CASE WHEN "vE1" ? 'approverUserId' THEN "vC1ApprovalWorkflowSteps"."approverUserId" ELSE NULL END, CASE WHEN "vE1" ? 'appliesAboveAmount' THEN "vC1ApprovalWorkflowSteps"."appliesAboveAmount" ELSE NULL END, CASE WHEN "vE1" ? 'slaHours' THEN "vC1ApprovalWorkflowSteps"."slaHours" ELSE 8 END, CASE WHEN "vE1" ? 'onSlaBreach' THEN "vC1ApprovalWorkflowSteps"."onSlaBreach" ELSE 'ESCALATE' END, CASE WHEN "vE1" ? 'approvalMode' THEN "vC1ApprovalWorkflowSteps"."approvalMode" ELSE 'ANY' END, CASE WHEN "vE1" ? 'blockSelfApproval' THEN "vC1ApprovalWorkflowSteps"."blockSelfApproval" ELSE TRUE END, CASE WHEN "vE1" ? 'allowDelegation' THEN "vC1ApprovalWorkflowSteps"."allowDelegation" ELSE TRUE END, CASE WHEN "vE1" ? 'requireComment' THEN "vC1ApprovalWorkflowSteps"."requireComment" ELSE FALSE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."approvalWorkflowAddUpdate"(jsonb) IS 'Save (insert or update) one ApprovalWorkflows record with its conditions, steps.';

-- ApprovalWorkflows: one record as JSON (camelCase keys), with lookup labels and conditions, steps
CREATE OR REPLACE FUNCTION "Company"."getApprovalWorkflowInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('subjectLabel', "Lookups"."getLookupLabel"('Subject', t.subject) ->> 'label', 'subjectTone', "Lookups"."getLookupLabel"('Subject', t.subject) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ApprovalWorkflowStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ApprovalWorkflowStatus', t.status) ->> 'tone', 'onCompleteLabel', "Lookups"."getLookupLabel"('OnComplete', t."onComplete") ->> 'label', 'onCompleteTone', "Lookups"."getLookupLabel"('OnComplete', t."onComplete") ->> 'tone', 'onRejectLabel', "Lookups"."getLookupLabel"('OnReject', t."onReject") ->> 'label', 'onRejectTone', "Lookups"."getLookupLabel"('OnReject', t."onReject") ->> 'tone') ||
         jsonb_build_object('conditions', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Company"."ApprovalWorkflowConditions" c1 WHERE c1."workflowId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'steps', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Company"."ApprovalWorkflowSteps" c1 WHERE c1."workflowId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Company"."ApprovalWorkflows" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getApprovalWorkflowInfo"(uuid) IS 'Read one ApprovalWorkflows record (getter for its screens).';

-- Approvals: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."approvalAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."Approvals";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."Approvals", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."Approvals" ("tenantId", "workflowId", "entityType", "entityId", "docLabel", title, amount, "currencyCode", "branchId", "requestedByUserId", "requestedAt", "currentStepNo", "currentStepDueAt", "isEscalated", "completedAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'workflowId' THEN "vRec"."workflowId" ELSE NULL END, CASE WHEN "pData" ? 'entityType' THEN "vRec"."entityType" ELSE NULL END, CASE WHEN "pData" ? 'entityId' THEN "vRec"."entityId" ELSE NULL END, CASE WHEN "pData" ? 'docLabel' THEN "vRec"."docLabel" ELSE NULL END, CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE NULL END, CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE NULL END, CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE 'PKR' END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'requestedByUserId' THEN "vRec"."requestedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'requestedAt' THEN "vRec"."requestedAt" ELSE now() END, CASE WHEN "pData" ? 'currentStepNo' THEN "vRec"."currentStepNo" ELSE NULL END, CASE WHEN "pData" ? 'currentStepDueAt' THEN "vRec"."currentStepDueAt" ELSE NULL END, CASE WHEN "pData" ? 'isEscalated' THEN "vRec"."isEscalated" ELSE FALSE END, CASE WHEN "pData" ? 'completedAt' THEN "vRec"."completedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."Approvals" t
       SET "workflowId" = CASE WHEN "pData" ? 'workflowId' THEN "vRec"."workflowId" ELSE t."workflowId" END,
           "entityType" = CASE WHEN "pData" ? 'entityType' THEN "vRec"."entityType" ELSE t."entityType" END,
           "entityId" = CASE WHEN "pData" ? 'entityId' THEN "vRec"."entityId" ELSE t."entityId" END,
           "docLabel" = CASE WHEN "pData" ? 'docLabel' THEN "vRec"."docLabel" ELSE t."docLabel" END,
           title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
           amount = CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE t.amount END,
           "currencyCode" = CASE WHEN "pData" ? 'currencyCode' THEN "vRec"."currencyCode" ELSE t."currencyCode" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "requestedByUserId" = CASE WHEN "pData" ? 'requestedByUserId' THEN "vRec"."requestedByUserId" ELSE t."requestedByUserId" END,
           "requestedAt" = CASE WHEN "pData" ? 'requestedAt' THEN "vRec"."requestedAt" ELSE t."requestedAt" END,
           "currentStepNo" = CASE WHEN "pData" ? 'currentStepNo' THEN "vRec"."currentStepNo" ELSE t."currentStepNo" END,
           "currentStepDueAt" = CASE WHEN "pData" ? 'currentStepDueAt' THEN "vRec"."currentStepDueAt" ELSE t."currentStepDueAt" END,
           "isEscalated" = CASE WHEN "pData" ? 'isEscalated' THEN "vRec"."isEscalated" ELSE t."isEscalated" END,
           "completedAt" = CASE WHEN "pData" ? 'completedAt' THEN "vRec"."completedAt" ELSE t."completedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."Approvals" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Approvals %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Approvals % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."approvalAddUpdate"(jsonb) IS 'Save (insert or update) one Approvals record.';

-- Approvals: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getApprovalInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('ApprovalStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ApprovalStatus', t.status) ->> 'tone')
    FROM "Company"."Approvals" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getApprovalInfo"(uuid) IS 'Read one Approvals record (getter for its screens).';

-- Approvals: Approve (status -> APPROVED); allowed from PENDING
CREATE OR REPLACE FUNCTION "Company"."approvalApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Company"."Approvals";
BEGIN
  SELECT * INTO "vRow" FROM "Company"."Approvals" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approvals % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING') THEN
    RAISE EXCEPTION 'Approvals %: cannot approve from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'Approvals: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Company"."approvalApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Company"."approvalApproveEntries"') USING "pId";
  END IF;
  UPDATE "Company"."Approvals" t SET status = 'APPROVED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- Approvals: Cancel (status -> CANCELLED); allowed from PENDING, APPROVED, REJECTED, CHANGES_REQUESTED
CREATE OR REPLACE FUNCTION "Company"."approvalCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Company"."Approvals";
BEGIN
  SELECT * INTO "vRow" FROM "Company"."Approvals" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approvals % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED') THEN
    RAISE EXCEPTION 'Approvals %: cannot cancel from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Company"."approvalCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Company"."approvalCancelEntries"') USING "pId";
  END IF;
  UPDATE "Company"."Approvals" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- ApprovalDelegations: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."approvalDelegationAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."ApprovalDelegations";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."ApprovalDelegations", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."ApprovalDelegations" ("tenantId", "fromUserId", "toUserId", subject, "startsOn", "endsOn", reason, "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'fromUserId' THEN "vRec"."fromUserId" ELSE NULL END, CASE WHEN "pData" ? 'toUserId' THEN "vRec"."toUserId" ELSE NULL END, CASE WHEN "pData" ? 'subject' THEN "vRec".subject ELSE NULL END, CASE WHEN "pData" ? 'startsOn' THEN "vRec"."startsOn" ELSE NULL END, CASE WHEN "pData" ? 'endsOn' THEN "vRec"."endsOn" ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."ApprovalDelegations" t
       SET "fromUserId" = CASE WHEN "pData" ? 'fromUserId' THEN "vRec"."fromUserId" ELSE t."fromUserId" END,
           "toUserId" = CASE WHEN "pData" ? 'toUserId' THEN "vRec"."toUserId" ELSE t."toUserId" END,
           subject = CASE WHEN "pData" ? 'subject' THEN "vRec".subject ELSE t.subject END,
           "startsOn" = CASE WHEN "pData" ? 'startsOn' THEN "vRec"."startsOn" ELSE t."startsOn" END,
           "endsOn" = CASE WHEN "pData" ? 'endsOn' THEN "vRec"."endsOn" ELSE t."endsOn" END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."ApprovalDelegations" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ApprovalDelegations %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ApprovalDelegations % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."approvalDelegationAddUpdate"(jsonb) IS 'Save (insert or update) one ApprovalDelegations record.';

-- ApprovalDelegations: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getApprovalDelegationInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('subjectLabel', "Lookups"."getLookupLabel"('Subject', t.subject) ->> 'label', 'subjectTone', "Lookups"."getLookupLabel"('Subject', t.subject) ->> 'tone')
    FROM "Company"."ApprovalDelegations" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getApprovalDelegationInfo"(uuid) IS 'Read one ApprovalDelegations record (getter for its screens).';

-- Tags: insert (no "id") or update (with "id"); child arrays: records
CREATE OR REPLACE FUNCTION "Company"."tagAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."Tags";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1TaggedRecords" "Company"."TaggedRecords";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."Tags", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."Tags" ("tenantId", name, tone)
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'tone' THEN "vRec".tone ELSE 'neutral' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."Tags" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           tone = CASE WHEN "pData" ? 'tone' THEN "vRec".tone ELSE t.tone END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."Tags" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Tags %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Tags % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'records' THEN
    -- records: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Company"."TaggedRecords"
     WHERE "tenantId" = "vTenant" AND "tagId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'records') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'records') WITH ORDINALITY t(x, n) LOOP
      "vC1TaggedRecords" := jsonb_populate_record(NULL::"Company"."TaggedRecords", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Company"."TaggedRecords" t
           SET "entityType" = CASE WHEN "vE1" ? 'entityType' THEN "vC1TaggedRecords"."entityType" ELSE t."entityType" END,
               "entityId" = CASE WHEN "vE1" ? 'entityId' THEN "vC1TaggedRecords"."entityId" ELSE t."entityId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."tagId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'TaggedRecords: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Company"."TaggedRecords" ("tagId", "tenantId", "entityType", "entityId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'entityType' THEN "vC1TaggedRecords"."entityType" ELSE NULL END, CASE WHEN "vE1" ? 'entityId' THEN "vC1TaggedRecords"."entityId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."tagAddUpdate"(jsonb) IS 'Save (insert or update) one Tags record with its records.';

-- Tags: one record as JSON (camelCase keys), with lookup labels and records
CREATE OR REPLACE FUNCTION "Company"."getTagInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('toneLabel', "Lookups"."getLookupLabel"('TagTone', t.tone) ->> 'label', 'toneTone', "Lookups"."getLookupLabel"('TagTone', t.tone) ->> 'tone') ||
         jsonb_build_object('records', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Company"."TaggedRecords" c1 WHERE c1."tagId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Company"."Tags" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getTagInfo"(uuid) IS 'Read one Tags record (getter for its screens).';

-- NotificationPreferences: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."notificationPreferenceAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."NotificationPreferences";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."NotificationPreferences", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."NotificationPreferences" ("tenantId", "userId", "eventCode", channel, "isEnabled", "minAmount", delivery, "digestTime")
    VALUES ("vTenant", CASE WHEN "pData" ? 'userId' THEN "vRec"."userId" ELSE NULL END, CASE WHEN "pData" ? 'eventCode' THEN "vRec"."eventCode" ELSE NULL END, CASE WHEN "pData" ? 'channel' THEN "vRec".channel ELSE NULL END, CASE WHEN "pData" ? 'isEnabled' THEN "vRec"."isEnabled" ELSE TRUE END, CASE WHEN "pData" ? 'minAmount' THEN "vRec"."minAmount" ELSE NULL END, CASE WHEN "pData" ? 'delivery' THEN "vRec".delivery ELSE 'INSTANT' END, CASE WHEN "pData" ? 'digestTime' THEN "vRec"."digestTime" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."NotificationPreferences" t
       SET "userId" = CASE WHEN "pData" ? 'userId' THEN "vRec"."userId" ELSE t."userId" END,
           "eventCode" = CASE WHEN "pData" ? 'eventCode' THEN "vRec"."eventCode" ELSE t."eventCode" END,
           channel = CASE WHEN "pData" ? 'channel' THEN "vRec".channel ELSE t.channel END,
           "isEnabled" = CASE WHEN "pData" ? 'isEnabled' THEN "vRec"."isEnabled" ELSE t."isEnabled" END,
           "minAmount" = CASE WHEN "pData" ? 'minAmount' THEN "vRec"."minAmount" ELSE t."minAmount" END,
           delivery = CASE WHEN "pData" ? 'delivery' THEN "vRec".delivery ELSE t.delivery END,
           "digestTime" = CASE WHEN "pData" ? 'digestTime' THEN "vRec"."digestTime" ELSE t."digestTime" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."NotificationPreferences" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'NotificationPreferences %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'NotificationPreferences % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."notificationPreferenceAddUpdate"(jsonb) IS 'Save (insert or update) one NotificationPreferences record.';

-- NotificationPreferences: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getNotificationPreferenceInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('channelLabel', "Lookups"."getLookupLabel"('NotificationPreferenceChannel', t.channel) ->> 'label', 'channelTone', "Lookups"."getLookupLabel"('NotificationPreferenceChannel', t.channel) ->> 'tone', 'deliveryLabel', "Lookups"."getLookupLabel"('Delivery', t.delivery) ->> 'label', 'deliveryTone', "Lookups"."getLookupLabel"('Delivery', t.delivery) ->> 'tone')
    FROM "Company"."NotificationPreferences" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getNotificationPreferenceInfo"(uuid) IS 'Read one NotificationPreferences record (getter for its screens).';

-- Tasks: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."taskAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."Tasks";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."Tasks", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."Tasks" ("tenantId", kind, title, notes, module, "assigneeUserId", "assignedByUserId", participants, "dueDate", "dueTime", priority, status, "repeatRule", "remindBeforeMin", source, "linkRoute", "entityType", "entityId", "completedAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE 'TASK' END, CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE NULL END, CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE NULL END, CASE WHEN "pData" ? 'module' THEN "vRec".module ELSE 'ACCOUNTING' END, CASE WHEN "pData" ? 'assigneeUserId' THEN "vRec"."assigneeUserId" ELSE NULL END, CASE WHEN "pData" ? 'assignedByUserId' THEN "vRec"."assignedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'participants' THEN "vRec".participants ELSE NULL END, CASE WHEN "pData" ? 'dueDate' THEN "vRec"."dueDate" ELSE NULL END, CASE WHEN "pData" ? 'dueTime' THEN "vRec"."dueTime" ELSE NULL END, CASE WHEN "pData" ? 'priority' THEN "vRec".priority ELSE 'MEDIUM' END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'PENDING' END, CASE WHEN "pData" ? 'repeatRule' THEN "vRec"."repeatRule" ELSE 'NEVER' END, CASE WHEN "pData" ? 'remindBeforeMin' THEN "vRec"."remindBeforeMin" ELSE NULL END, CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE 'MANUAL' END, CASE WHEN "pData" ? 'linkRoute' THEN "vRec"."linkRoute" ELSE NULL END, CASE WHEN "pData" ? 'entityType' THEN "vRec"."entityType" ELSE NULL END, CASE WHEN "pData" ? 'entityId' THEN "vRec"."entityId" ELSE NULL END, CASE WHEN "pData" ? 'completedAt' THEN "vRec"."completedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."Tasks" t
       SET kind = CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE t.kind END,
           title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
           notes = CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE t.notes END,
           module = CASE WHEN "pData" ? 'module' THEN "vRec".module ELSE t.module END,
           "assigneeUserId" = CASE WHEN "pData" ? 'assigneeUserId' THEN "vRec"."assigneeUserId" ELSE t."assigneeUserId" END,
           "assignedByUserId" = CASE WHEN "pData" ? 'assignedByUserId' THEN "vRec"."assignedByUserId" ELSE t."assignedByUserId" END,
           participants = CASE WHEN "pData" ? 'participants' THEN "vRec".participants ELSE t.participants END,
           "dueDate" = CASE WHEN "pData" ? 'dueDate' THEN "vRec"."dueDate" ELSE t."dueDate" END,
           "dueTime" = CASE WHEN "pData" ? 'dueTime' THEN "vRec"."dueTime" ELSE t."dueTime" END,
           priority = CASE WHEN "pData" ? 'priority' THEN "vRec".priority ELSE t.priority END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "repeatRule" = CASE WHEN "pData" ? 'repeatRule' THEN "vRec"."repeatRule" ELSE t."repeatRule" END,
           "remindBeforeMin" = CASE WHEN "pData" ? 'remindBeforeMin' THEN "vRec"."remindBeforeMin" ELSE t."remindBeforeMin" END,
           source = CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE t.source END,
           "linkRoute" = CASE WHEN "pData" ? 'linkRoute' THEN "vRec"."linkRoute" ELSE t."linkRoute" END,
           "entityType" = CASE WHEN "pData" ? 'entityType' THEN "vRec"."entityType" ELSE t."entityType" END,
           "entityId" = CASE WHEN "pData" ? 'entityId' THEN "vRec"."entityId" ELSE t."entityId" END,
           "completedAt" = CASE WHEN "pData" ? 'completedAt' THEN "vRec"."completedAt" ELSE t."completedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."Tasks" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Tasks %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Tasks % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."taskAddUpdate"(jsonb) IS 'Save (insert or update) one Tasks record.';

-- Tasks: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getTaskInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('kindLabel', "Lookups"."getLookupLabel"('TaskKind', t.kind) ->> 'label', 'kindTone', "Lookups"."getLookupLabel"('TaskKind', t.kind) ->> 'tone', 'moduleLabel', "Lookups"."getLookupLabel"('TaskModule', t.module) ->> 'label', 'moduleTone', "Lookups"."getLookupLabel"('TaskModule', t.module) ->> 'tone', 'priorityLabel', "Lookups"."getLookupLabel"('TaskPriority', t.priority) ->> 'label', 'priorityTone', "Lookups"."getLookupLabel"('TaskPriority', t.priority) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('TaskStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('TaskStatus', t.status) ->> 'tone', 'repeatRuleLabel', "Lookups"."getLookupLabel"('RepeatRule', t."repeatRule") ->> 'label', 'repeatRuleTone', "Lookups"."getLookupLabel"('RepeatRule', t."repeatRule") ->> 'tone', 'sourceLabel', "Lookups"."getLookupLabel"('TaskSource', t.source) ->> 'label', 'sourceTone', "Lookups"."getLookupLabel"('TaskSource', t.source) ->> 'tone')
    FROM "Company"."Tasks" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getTaskInfo"(uuid) IS 'Read one Tasks record (getter for its screens).';

-- DataImports: insert (no "id") or update (with "id"); child arrays: errors
CREATE OR REPLACE FUNCTION "Company"."dataImportAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."DataImports";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1DataImportErrors" "Company"."DataImportErrors";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."DataImports", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."DataImports" ("tenantId", "jobNo", entity, "fileAttachmentId", "fileName", "fileSizeBytes", "sourceSystem", "totalRows", "columnMap", "skipErrorRows", "errorCount", "rowsCreated", "rowsUpdated", "rowsSkipped", "startedByUserId", "startedAt", "finishedAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'jobNo' THEN "vRec"."jobNo" ELSE NULL END, CASE WHEN "pData" ? 'entity' THEN "vRec".entity ELSE NULL END, CASE WHEN "pData" ? 'fileAttachmentId' THEN "vRec"."fileAttachmentId" ELSE NULL END, CASE WHEN "pData" ? 'fileName' THEN "vRec"."fileName" ELSE NULL END, CASE WHEN "pData" ? 'fileSizeBytes' THEN "vRec"."fileSizeBytes" ELSE NULL END, CASE WHEN "pData" ? 'sourceSystem' THEN "vRec"."sourceSystem" ELSE NULL END, CASE WHEN "pData" ? 'totalRows' THEN "vRec"."totalRows" ELSE NULL END, CASE WHEN "pData" ? 'columnMap' THEN "vRec"."columnMap" ELSE CAST('{}' AS jsonb) END, CASE WHEN "pData" ? 'skipErrorRows' THEN "vRec"."skipErrorRows" ELSE TRUE END, CASE WHEN "pData" ? 'errorCount' THEN "vRec"."errorCount" ELSE 0 END, CASE WHEN "pData" ? 'rowsCreated' THEN "vRec"."rowsCreated" ELSE 0 END, CASE WHEN "pData" ? 'rowsUpdated' THEN "vRec"."rowsUpdated" ELSE 0 END, CASE WHEN "pData" ? 'rowsSkipped' THEN "vRec"."rowsSkipped" ELSE 0 END, CASE WHEN "pData" ? 'startedByUserId' THEN "vRec"."startedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'startedAt' THEN "vRec"."startedAt" ELSE NULL END, CASE WHEN "pData" ? 'finishedAt' THEN "vRec"."finishedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."DataImports" t
       SET "jobNo" = CASE WHEN "pData" ? 'jobNo' THEN "vRec"."jobNo" ELSE t."jobNo" END,
           entity = CASE WHEN "pData" ? 'entity' THEN "vRec".entity ELSE t.entity END,
           "fileAttachmentId" = CASE WHEN "pData" ? 'fileAttachmentId' THEN "vRec"."fileAttachmentId" ELSE t."fileAttachmentId" END,
           "fileName" = CASE WHEN "pData" ? 'fileName' THEN "vRec"."fileName" ELSE t."fileName" END,
           "fileSizeBytes" = CASE WHEN "pData" ? 'fileSizeBytes' THEN "vRec"."fileSizeBytes" ELSE t."fileSizeBytes" END,
           "sourceSystem" = CASE WHEN "pData" ? 'sourceSystem' THEN "vRec"."sourceSystem" ELSE t."sourceSystem" END,
           "totalRows" = CASE WHEN "pData" ? 'totalRows' THEN "vRec"."totalRows" ELSE t."totalRows" END,
           "columnMap" = CASE WHEN "pData" ? 'columnMap' THEN "vRec"."columnMap" ELSE t."columnMap" END,
           "skipErrorRows" = CASE WHEN "pData" ? 'skipErrorRows' THEN "vRec"."skipErrorRows" ELSE t."skipErrorRows" END,
           "errorCount" = CASE WHEN "pData" ? 'errorCount' THEN "vRec"."errorCount" ELSE t."errorCount" END,
           "rowsCreated" = CASE WHEN "pData" ? 'rowsCreated' THEN "vRec"."rowsCreated" ELSE t."rowsCreated" END,
           "rowsUpdated" = CASE WHEN "pData" ? 'rowsUpdated' THEN "vRec"."rowsUpdated" ELSE t."rowsUpdated" END,
           "rowsSkipped" = CASE WHEN "pData" ? 'rowsSkipped' THEN "vRec"."rowsSkipped" ELSE t."rowsSkipped" END,
           "startedByUserId" = CASE WHEN "pData" ? 'startedByUserId' THEN "vRec"."startedByUserId" ELSE t."startedByUserId" END,
           "startedAt" = CASE WHEN "pData" ? 'startedAt' THEN "vRec"."startedAt" ELSE t."startedAt" END,
           "finishedAt" = CASE WHEN "pData" ? 'finishedAt' THEN "vRec"."finishedAt" ELSE t."finishedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."DataImports" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'DataImports %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'DataImports % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'errors' THEN
    -- errors: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Company"."DataImportErrors"
     WHERE "tenantId" = "vTenant" AND "jobId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'errors') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'errors') WITH ORDINALITY t(x, n) LOOP
      "vC1DataImportErrors" := jsonb_populate_record(NULL::"Company"."DataImportErrors", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Company"."DataImportErrors" t
           SET "rowNo" = CASE WHEN "vE1" ? 'rowNo' THEN "vC1DataImportErrors"."rowNo" ELSE t."rowNo" END,
               "fieldKey" = CASE WHEN "vE1" ? 'fieldKey' THEN "vC1DataImportErrors"."fieldKey" ELSE t."fieldKey" END,
               "badValue" = CASE WHEN "vE1" ? 'badValue' THEN "vC1DataImportErrors"."badValue" ELSE t."badValue" END,
               message = CASE WHEN "vE1" ? 'message' THEN "vC1DataImportErrors".message ELSE t.message END,
               "isFixed" = CASE WHEN "vE1" ? 'isFixed' THEN "vC1DataImportErrors"."isFixed" ELSE t."isFixed" END,
               "fixedValue" = CASE WHEN "vE1" ? 'fixedValue' THEN "vC1DataImportErrors"."fixedValue" ELSE t."fixedValue" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."jobId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'DataImportErrors: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Company"."DataImportErrors" ("jobId", "tenantId", "rowNo", "fieldKey", "badValue", message, "isFixed", "fixedValue")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'rowNo' THEN "vC1DataImportErrors"."rowNo" ELSE NULL END, CASE WHEN "vE1" ? 'fieldKey' THEN "vC1DataImportErrors"."fieldKey" ELSE NULL END, CASE WHEN "vE1" ? 'badValue' THEN "vC1DataImportErrors"."badValue" ELSE NULL END, CASE WHEN "vE1" ? 'message' THEN "vC1DataImportErrors".message ELSE NULL END, CASE WHEN "vE1" ? 'isFixed' THEN "vC1DataImportErrors"."isFixed" ELSE FALSE END, CASE WHEN "vE1" ? 'fixedValue' THEN "vC1DataImportErrors"."fixedValue" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."dataImportAddUpdate"(jsonb) IS 'Save (insert or update) one DataImports record with its errors.';

-- DataImports: one record as JSON (camelCase keys), with lookup labels and errors
CREATE OR REPLACE FUNCTION "Company"."getDataImportInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('entityLabel', "Lookups"."getLookupLabel"('Entity', t.entity) ->> 'label', 'entityTone', "Lookups"."getLookupLabel"('Entity', t.entity) ->> 'tone', 'sourceSystemLabel', "Lookups"."getLookupLabel"('SourceSystem', t."sourceSystem") ->> 'label', 'sourceSystemTone', "Lookups"."getLookupLabel"('SourceSystem', t."sourceSystem") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('DataImportStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('DataImportStatus', t.status) ->> 'tone') ||
         jsonb_build_object('errors', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Company"."DataImportErrors" c1 WHERE c1."jobId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Company"."DataImports" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getDataImportInfo"(uuid) IS 'Read one DataImports record (getter for its screens).';

-- DataImports: Cancel (status -> CANCELLED); allowed from UPLOADED, MAPPED, VALIDATED, IMPORTING, COMPLETED, FAILED
CREATE OR REPLACE FUNCTION "Company"."dataImportCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Company"."DataImports";
BEGIN
  SELECT * INTO "vRow" FROM "Company"."DataImports" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DataImports % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('UPLOADED', 'MAPPED', 'VALIDATED', 'IMPORTING', 'COMPLETED', 'FAILED') THEN
    RAISE EXCEPTION 'DataImports %: cannot cancel from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Company"."dataImportCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Company"."dataImportCancelEntries"') USING "pId";
  END IF;
  UPDATE "Company"."DataImports" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- DocumentTemplates: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."documentTemplateAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."DocumentTemplates";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."DocumentTemplates", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."DocumentTemplates" ("tenantId", name, category, "docType", "letterKind", paper, "headerLayout", language, "showNtnStrn", "showFbrQr", "showHsCodes", "showItemImages", "showAmountInWords", "showBankDetails", "bodyHtml", version, "isDefault", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'category' THEN "vRec".category ELSE NULL END, CASE WHEN "pData" ? 'docType' THEN "vRec"."docType" ELSE NULL END, CASE WHEN "pData" ? 'letterKind' THEN "vRec"."letterKind" ELSE NULL END, CASE WHEN "pData" ? 'paper' THEN "vRec".paper ELSE 'A4_PORTRAIT' END, CASE WHEN "pData" ? 'headerLayout' THEN "vRec"."headerLayout" ELSE 'LOGO_LEFT' END, CASE WHEN "pData" ? 'language' THEN "vRec".language ELSE 'EN' END, CASE WHEN "pData" ? 'showNtnStrn' THEN "vRec"."showNtnStrn" ELSE TRUE END, CASE WHEN "pData" ? 'showFbrQr' THEN "vRec"."showFbrQr" ELSE TRUE END, CASE WHEN "pData" ? 'showHsCodes' THEN "vRec"."showHsCodes" ELSE TRUE END, CASE WHEN "pData" ? 'showItemImages' THEN "vRec"."showItemImages" ELSE FALSE END, CASE WHEN "pData" ? 'showAmountInWords' THEN "vRec"."showAmountInWords" ELSE TRUE END, CASE WHEN "pData" ? 'showBankDetails' THEN "vRec"."showBankDetails" ELSE TRUE END, CASE WHEN "pData" ? 'bodyHtml' THEN "vRec"."bodyHtml" ELSE NULL END, CASE WHEN "pData" ? 'version' THEN "vRec".version ELSE 1 END, CASE WHEN "pData" ? 'isDefault' THEN "vRec"."isDefault" ELSE FALSE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'DRAFT' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."DocumentTemplates" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           category = CASE WHEN "pData" ? 'category' THEN "vRec".category ELSE t.category END,
           "docType" = CASE WHEN "pData" ? 'docType' THEN "vRec"."docType" ELSE t."docType" END,
           "letterKind" = CASE WHEN "pData" ? 'letterKind' THEN "vRec"."letterKind" ELSE t."letterKind" END,
           paper = CASE WHEN "pData" ? 'paper' THEN "vRec".paper ELSE t.paper END,
           "headerLayout" = CASE WHEN "pData" ? 'headerLayout' THEN "vRec"."headerLayout" ELSE t."headerLayout" END,
           language = CASE WHEN "pData" ? 'language' THEN "vRec".language ELSE t.language END,
           "showNtnStrn" = CASE WHEN "pData" ? 'showNtnStrn' THEN "vRec"."showNtnStrn" ELSE t."showNtnStrn" END,
           "showFbrQr" = CASE WHEN "pData" ? 'showFbrQr' THEN "vRec"."showFbrQr" ELSE t."showFbrQr" END,
           "showHsCodes" = CASE WHEN "pData" ? 'showHsCodes' THEN "vRec"."showHsCodes" ELSE t."showHsCodes" END,
           "showItemImages" = CASE WHEN "pData" ? 'showItemImages' THEN "vRec"."showItemImages" ELSE t."showItemImages" END,
           "showAmountInWords" = CASE WHEN "pData" ? 'showAmountInWords' THEN "vRec"."showAmountInWords" ELSE t."showAmountInWords" END,
           "showBankDetails" = CASE WHEN "pData" ? 'showBankDetails' THEN "vRec"."showBankDetails" ELSE t."showBankDetails" END,
           "bodyHtml" = CASE WHEN "pData" ? 'bodyHtml' THEN "vRec"."bodyHtml" ELSE t."bodyHtml" END,
           version = CASE WHEN "pData" ? 'version' THEN "vRec".version ELSE t.version END,
           "isDefault" = CASE WHEN "pData" ? 'isDefault' THEN "vRec"."isDefault" ELSE t."isDefault" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."DocumentTemplates" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'DocumentTemplates %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'DocumentTemplates % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."documentTemplateAddUpdate"(jsonb) IS 'Save (insert or update) one DocumentTemplates record.';

-- DocumentTemplates: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getDocumentTemplateInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('categoryLabel', "Lookups"."getLookupLabel"('DocumentTemplateCategory', t.category) ->> 'label', 'categoryTone', "Lookups"."getLookupLabel"('DocumentTemplateCategory', t.category) ->> 'tone', 'letterKindLabel', "Lookups"."getLookupLabel"('LetterKind', t."letterKind") ->> 'label', 'letterKindTone', "Lookups"."getLookupLabel"('LetterKind', t."letterKind") ->> 'tone', 'paperLabel', "Lookups"."getLookupLabel"('Paper', t.paper) ->> 'label', 'paperTone', "Lookups"."getLookupLabel"('Paper', t.paper) ->> 'tone', 'headerLayoutLabel', "Lookups"."getLookupLabel"('HeaderLayout', t."headerLayout") ->> 'label', 'headerLayoutTone', "Lookups"."getLookupLabel"('HeaderLayout', t."headerLayout") ->> 'tone', 'languageLabel', "Lookups"."getLookupLabel"('DocumentTemplateLanguage', t.language) ->> 'label', 'languageTone', "Lookups"."getLookupLabel"('DocumentTemplateLanguage', t.language) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('DocumentTemplateStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('DocumentTemplateStatus', t.status) ->> 'tone')
    FROM "Company"."DocumentTemplates" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getDocumentTemplateInfo"(uuid) IS 'Read one DocumentTemplates record (getter for its screens).';

-- Integrations: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."integrationAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."Integrations";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."Integrations", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."Integrations" ("tenantId", category, provider, "displayName", "referenceLabel", "bankAccountId", status, config, "secretRef", "tokenExpiresAt", "connectedAt", "connectedByUserId", "lastSyncAt", "lastSyncSummary", "lastError")
    VALUES ("vTenant", CASE WHEN "pData" ? 'category' THEN "vRec".category ELSE NULL END, CASE WHEN "pData" ? 'provider' THEN "vRec".provider ELSE NULL END, CASE WHEN "pData" ? 'displayName' THEN "vRec"."displayName" ELSE NULL END, CASE WHEN "pData" ? 'referenceLabel' THEN "vRec"."referenceLabel" ELSE NULL END, CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'NOT_CONNECTED' END, CASE WHEN "pData" ? 'config' THEN "vRec".config ELSE CAST('{}' AS jsonb) END, CASE WHEN "pData" ? 'secretRef' THEN "vRec"."secretRef" ELSE NULL END, CASE WHEN "pData" ? 'tokenExpiresAt' THEN "vRec"."tokenExpiresAt" ELSE NULL END, CASE WHEN "pData" ? 'connectedAt' THEN "vRec"."connectedAt" ELSE NULL END, CASE WHEN "pData" ? 'connectedByUserId' THEN "vRec"."connectedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'lastSyncAt' THEN "vRec"."lastSyncAt" ELSE NULL END, CASE WHEN "pData" ? 'lastSyncSummary' THEN "vRec"."lastSyncSummary" ELSE NULL END, CASE WHEN "pData" ? 'lastError' THEN "vRec"."lastError" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."Integrations" t
       SET category = CASE WHEN "pData" ? 'category' THEN "vRec".category ELSE t.category END,
           provider = CASE WHEN "pData" ? 'provider' THEN "vRec".provider ELSE t.provider END,
           "displayName" = CASE WHEN "pData" ? 'displayName' THEN "vRec"."displayName" ELSE t."displayName" END,
           "referenceLabel" = CASE WHEN "pData" ? 'referenceLabel' THEN "vRec"."referenceLabel" ELSE t."referenceLabel" END,
           "bankAccountId" = CASE WHEN "pData" ? 'bankAccountId' THEN "vRec"."bankAccountId" ELSE t."bankAccountId" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           config = CASE WHEN "pData" ? 'config' THEN "vRec".config ELSE t.config END,
           "secretRef" = CASE WHEN "pData" ? 'secretRef' THEN "vRec"."secretRef" ELSE t."secretRef" END,
           "tokenExpiresAt" = CASE WHEN "pData" ? 'tokenExpiresAt' THEN "vRec"."tokenExpiresAt" ELSE t."tokenExpiresAt" END,
           "connectedAt" = CASE WHEN "pData" ? 'connectedAt' THEN "vRec"."connectedAt" ELSE t."connectedAt" END,
           "connectedByUserId" = CASE WHEN "pData" ? 'connectedByUserId' THEN "vRec"."connectedByUserId" ELSE t."connectedByUserId" END,
           "lastSyncAt" = CASE WHEN "pData" ? 'lastSyncAt' THEN "vRec"."lastSyncAt" ELSE t."lastSyncAt" END,
           "lastSyncSummary" = CASE WHEN "pData" ? 'lastSyncSummary' THEN "vRec"."lastSyncSummary" ELSE t."lastSyncSummary" END,
           "lastError" = CASE WHEN "pData" ? 'lastError' THEN "vRec"."lastError" ELSE t."lastError" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."Integrations" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Integrations %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Integrations % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."integrationAddUpdate"(jsonb) IS 'Save (insert or update) one Integrations record.';

-- Integrations: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getIntegrationInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t) - 'secretRef') ||
         jsonb_build_object('categoryLabel', "Lookups"."getLookupLabel"('IntegrationCategory', t.category) ->> 'label', 'categoryTone', "Lookups"."getLookupLabel"('IntegrationCategory', t.category) ->> 'tone', 'providerLabel', "Lookups"."getLookupLabel"('Provider', t.provider) ->> 'label', 'providerTone', "Lookups"."getLookupLabel"('Provider', t.provider) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('IntegrationStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('IntegrationStatus', t.status) ->> 'tone')
    FROM "Company"."Integrations" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getIntegrationInfo"(uuid) IS 'Read one Integrations record (getter for its screens).';

-- ApiKeys: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."apiKeyAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."ApiKeys";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."ApiKeys", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."ApiKeys" ("tenantId", name, "ownerUserId", "keyPrefix", "keyLast4", "keyHash", scopes, "ipAllowlist", "expiresAt", "lastUsedAt", "lastUsedIp", "revokedAt", "revokedByUserId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'ownerUserId' THEN "vRec"."ownerUserId" ELSE NULL END, CASE WHEN "pData" ? 'keyPrefix' THEN "vRec"."keyPrefix" ELSE 'fs_live_' END, CASE WHEN "pData" ? 'keyLast4' THEN "vRec"."keyLast4" ELSE NULL END, CASE WHEN "pData" ? 'keyHash' THEN "vRec"."keyHash" ELSE NULL END, CASE WHEN "pData" ? 'scopes' THEN "vRec".scopes ELSE NULL END, CASE WHEN "pData" ? 'ipAllowlist' THEN "vRec"."ipAllowlist" ELSE NULL END, CASE WHEN "pData" ? 'expiresAt' THEN "vRec"."expiresAt" ELSE NULL END, CASE WHEN "pData" ? 'lastUsedAt' THEN "vRec"."lastUsedAt" ELSE NULL END, CASE WHEN "pData" ? 'lastUsedIp' THEN "vRec"."lastUsedIp" ELSE NULL END, CASE WHEN "pData" ? 'revokedAt' THEN "vRec"."revokedAt" ELSE NULL END, CASE WHEN "pData" ? 'revokedByUserId' THEN "vRec"."revokedByUserId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."ApiKeys" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "ownerUserId" = CASE WHEN "pData" ? 'ownerUserId' THEN "vRec"."ownerUserId" ELSE t."ownerUserId" END,
           "keyPrefix" = CASE WHEN "pData" ? 'keyPrefix' THEN "vRec"."keyPrefix" ELSE t."keyPrefix" END,
           "keyLast4" = CASE WHEN "pData" ? 'keyLast4' THEN "vRec"."keyLast4" ELSE t."keyLast4" END,
           "keyHash" = CASE WHEN "pData" ? 'keyHash' THEN "vRec"."keyHash" ELSE t."keyHash" END,
           scopes = CASE WHEN "pData" ? 'scopes' THEN "vRec".scopes ELSE t.scopes END,
           "ipAllowlist" = CASE WHEN "pData" ? 'ipAllowlist' THEN "vRec"."ipAllowlist" ELSE t."ipAllowlist" END,
           "expiresAt" = CASE WHEN "pData" ? 'expiresAt' THEN "vRec"."expiresAt" ELSE t."expiresAt" END,
           "lastUsedAt" = CASE WHEN "pData" ? 'lastUsedAt' THEN "vRec"."lastUsedAt" ELSE t."lastUsedAt" END,
           "lastUsedIp" = CASE WHEN "pData" ? 'lastUsedIp' THEN "vRec"."lastUsedIp" ELSE t."lastUsedIp" END,
           "revokedAt" = CASE WHEN "pData" ? 'revokedAt' THEN "vRec"."revokedAt" ELSE t."revokedAt" END,
           "revokedByUserId" = CASE WHEN "pData" ? 'revokedByUserId' THEN "vRec"."revokedByUserId" ELSE t."revokedByUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."ApiKeys" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ApiKeys %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ApiKeys % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."apiKeyAddUpdate"(jsonb) IS 'Save (insert or update) one ApiKeys record.';

-- ApiKeys: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getApiKeyInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t) - 'keyHash') ||
         jsonb_build_object('keyPrefixLabel', "Lookups"."getLookupLabel"('KeyPrefix', t."keyPrefix") ->> 'label', 'keyPrefixTone', "Lookups"."getLookupLabel"('KeyPrefix', t."keyPrefix") ->> 'tone')
    FROM "Company"."ApiKeys" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getApiKeyInfo"(uuid) IS 'Read one ApiKeys record (getter for its screens).';

-- IntegrationWebhooks: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."integrationWebhookAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."IntegrationWebhooks";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."IntegrationWebhooks", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."IntegrationWebhooks" ("tenantId", url, events, "signingSecretEnc", "isActive", "healthStatus", "successRatePct", "lastDeliveryAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'url' THEN "vRec".url ELSE NULL END, CASE WHEN "pData" ? 'events' THEN "vRec".events ELSE NULL END, CASE WHEN "pData" ? 'signingSecretEnc' THEN "vRec"."signingSecretEnc" ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END, CASE WHEN "pData" ? 'healthStatus' THEN "vRec"."healthStatus" ELSE 'HEALTHY' END, CASE WHEN "pData" ? 'successRatePct' THEN "vRec"."successRatePct" ELSE NULL END, CASE WHEN "pData" ? 'lastDeliveryAt' THEN "vRec"."lastDeliveryAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."IntegrationWebhooks" t
       SET url = CASE WHEN "pData" ? 'url' THEN "vRec".url ELSE t.url END,
           events = CASE WHEN "pData" ? 'events' THEN "vRec".events ELSE t.events END,
           "signingSecretEnc" = CASE WHEN "pData" ? 'signingSecretEnc' THEN "vRec"."signingSecretEnc" ELSE t."signingSecretEnc" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END,
           "healthStatus" = CASE WHEN "pData" ? 'healthStatus' THEN "vRec"."healthStatus" ELSE t."healthStatus" END,
           "successRatePct" = CASE WHEN "pData" ? 'successRatePct' THEN "vRec"."successRatePct" ELSE t."successRatePct" END,
           "lastDeliveryAt" = CASE WHEN "pData" ? 'lastDeliveryAt' THEN "vRec"."lastDeliveryAt" ELSE t."lastDeliveryAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."IntegrationWebhooks" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'IntegrationWebhooks %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'IntegrationWebhooks % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."integrationWebhookAddUpdate"(jsonb) IS 'Save (insert or update) one IntegrationWebhooks record.';

-- IntegrationWebhooks: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getIntegrationWebhookInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t) - 'signingSecretEnc') ||
         jsonb_build_object('healthStatusLabel', "Lookups"."getLookupLabel"('HealthStatus', t."healthStatus") ->> 'label', 'healthStatusTone', "Lookups"."getLookupLabel"('HealthStatus', t."healthStatus") ->> 'tone')
    FROM "Company"."IntegrationWebhooks" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getIntegrationWebhookInfo"(uuid) IS 'Read one IntegrationWebhooks record (getter for its screens).';

-- BackupSettings: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."backupSettingAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."BackupSettings";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."BackupSettings", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."BackupSettings" ("tenantId", frequency, "runAt", timezone, "keepDailyDays", "keepMonthlyMonths", "includeAttachments", "emailOwnerOnFailure", "copyToGoogleDrive", "nextRunAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'frequency' THEN "vRec".frequency ELSE 'DAILY' END, CASE WHEN "pData" ? 'runAt' THEN "vRec"."runAt" ELSE '02:00' END, CASE WHEN "pData" ? 'timezone' THEN "vRec".timezone ELSE 'Asia/Karachi' END, CASE WHEN "pData" ? 'keepDailyDays' THEN "vRec"."keepDailyDays" ELSE 35 END, CASE WHEN "pData" ? 'keepMonthlyMonths' THEN "vRec"."keepMonthlyMonths" ELSE 12 END, CASE WHEN "pData" ? 'includeAttachments' THEN "vRec"."includeAttachments" ELSE TRUE END, CASE WHEN "pData" ? 'emailOwnerOnFailure' THEN "vRec"."emailOwnerOnFailure" ELSE TRUE END, CASE WHEN "pData" ? 'copyToGoogleDrive' THEN "vRec"."copyToGoogleDrive" ELSE FALSE END, CASE WHEN "pData" ? 'nextRunAt' THEN "vRec"."nextRunAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."BackupSettings" t
       SET frequency = CASE WHEN "pData" ? 'frequency' THEN "vRec".frequency ELSE t.frequency END,
           "runAt" = CASE WHEN "pData" ? 'runAt' THEN "vRec"."runAt" ELSE t."runAt" END,
           timezone = CASE WHEN "pData" ? 'timezone' THEN "vRec".timezone ELSE t.timezone END,
           "keepDailyDays" = CASE WHEN "pData" ? 'keepDailyDays' THEN "vRec"."keepDailyDays" ELSE t."keepDailyDays" END,
           "keepMonthlyMonths" = CASE WHEN "pData" ? 'keepMonthlyMonths' THEN "vRec"."keepMonthlyMonths" ELSE t."keepMonthlyMonths" END,
           "includeAttachments" = CASE WHEN "pData" ? 'includeAttachments' THEN "vRec"."includeAttachments" ELSE t."includeAttachments" END,
           "emailOwnerOnFailure" = CASE WHEN "pData" ? 'emailOwnerOnFailure' THEN "vRec"."emailOwnerOnFailure" ELSE t."emailOwnerOnFailure" END,
           "copyToGoogleDrive" = CASE WHEN "pData" ? 'copyToGoogleDrive' THEN "vRec"."copyToGoogleDrive" ELSE t."copyToGoogleDrive" END,
           "nextRunAt" = CASE WHEN "pData" ? 'nextRunAt' THEN "vRec"."nextRunAt" ELSE t."nextRunAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."BackupSettings" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'BackupSettings %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'BackupSettings % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."backupSettingAddUpdate"(jsonb) IS 'Save (insert or update) one BackupSettings record.';

-- BackupSettings: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getBackupSettingInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('frequencyLabel', "Lookups"."getLookupLabel"('BackupSettingFrequency', t.frequency) ->> 'label', 'frequencyTone', "Lookups"."getLookupLabel"('BackupSettingFrequency', t.frequency) ->> 'tone')
    FROM "Company"."BackupSettings" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getBackupSettingInfo"(uuid) IS 'Read one BackupSettings record (getter for its screens).';

-- BackupRestoreRequests: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."backupRestoreRequestAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."BackupRestoreRequests";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."BackupRestoreRequests", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."BackupRestoreRequests" ("tenantId", "snapshotId", reason, "confirmText", "takeSafetyBackup", "safetySnapshotId", "requestedByUserId", "requestedAt", "scheduledFor", "startedAt", "completedAt", error)
    VALUES ("vTenant", CASE WHEN "pData" ? 'snapshotId' THEN "vRec"."snapshotId" ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'confirmText' THEN "vRec"."confirmText" ELSE NULL END, CASE WHEN "pData" ? 'takeSafetyBackup' THEN "vRec"."takeSafetyBackup" ELSE TRUE END, CASE WHEN "pData" ? 'safetySnapshotId' THEN "vRec"."safetySnapshotId" ELSE NULL END, CASE WHEN "pData" ? 'requestedByUserId' THEN "vRec"."requestedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'requestedAt' THEN "vRec"."requestedAt" ELSE now() END, CASE WHEN "pData" ? 'scheduledFor' THEN "vRec"."scheduledFor" ELSE NULL END, CASE WHEN "pData" ? 'startedAt' THEN "vRec"."startedAt" ELSE NULL END, CASE WHEN "pData" ? 'completedAt' THEN "vRec"."completedAt" ELSE NULL END, CASE WHEN "pData" ? 'error' THEN "vRec".error ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."BackupRestoreRequests" t
       SET "snapshotId" = CASE WHEN "pData" ? 'snapshotId' THEN "vRec"."snapshotId" ELSE t."snapshotId" END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           "confirmText" = CASE WHEN "pData" ? 'confirmText' THEN "vRec"."confirmText" ELSE t."confirmText" END,
           "takeSafetyBackup" = CASE WHEN "pData" ? 'takeSafetyBackup' THEN "vRec"."takeSafetyBackup" ELSE t."takeSafetyBackup" END,
           "safetySnapshotId" = CASE WHEN "pData" ? 'safetySnapshotId' THEN "vRec"."safetySnapshotId" ELSE t."safetySnapshotId" END,
           "requestedByUserId" = CASE WHEN "pData" ? 'requestedByUserId' THEN "vRec"."requestedByUserId" ELSE t."requestedByUserId" END,
           "requestedAt" = CASE WHEN "pData" ? 'requestedAt' THEN "vRec"."requestedAt" ELSE t."requestedAt" END,
           "scheduledFor" = CASE WHEN "pData" ? 'scheduledFor' THEN "vRec"."scheduledFor" ELSE t."scheduledFor" END,
           "startedAt" = CASE WHEN "pData" ? 'startedAt' THEN "vRec"."startedAt" ELSE t."startedAt" END,
           "completedAt" = CASE WHEN "pData" ? 'completedAt' THEN "vRec"."completedAt" ELSE t."completedAt" END,
           error = CASE WHEN "pData" ? 'error' THEN "vRec".error ELSE t.error END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."BackupRestoreRequests" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'BackupRestoreRequests %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'BackupRestoreRequests % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."backupRestoreRequestAddUpdate"(jsonb) IS 'Save (insert or update) one BackupRestoreRequests record.';

-- BackupRestoreRequests: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getBackupRestoreRequestInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('BackupRestoreRequestStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('BackupRestoreRequestStatus', t.status) ->> 'tone')
    FROM "Company"."BackupRestoreRequests" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getBackupRestoreRequestInfo"(uuid) IS 'Read one BackupRestoreRequests record (getter for its screens).';

-- BackupRestoreRequests: Cancel (status -> CANCELLED); allowed from REQUESTED, SCHEDULED, RUNNING, COMPLETED, FAILED
CREATE OR REPLACE FUNCTION "Company"."backupRestoreRequestCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Company"."BackupRestoreRequests";
BEGIN
  SELECT * INTO "vRow" FROM "Company"."BackupRestoreRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BackupRestoreRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('REQUESTED', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED') THEN
    RAISE EXCEPTION 'BackupRestoreRequests %: cannot cancel from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Company"."backupRestoreRequestCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Company"."backupRestoreRequestCancelEntries"') USING "pId";
  END IF;
  UPDATE "Company"."BackupRestoreRequests" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- CalculatorSettings: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Company"."calculatorSettingAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Company"."CalculatorSettings";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Company"."CalculatorSettings", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Company"."CalculatorSettings" ("tenantId", "userId", "roundingStep", "numberGrouping", "gstRatePct", language, "memoryValue")
    VALUES ("vTenant", CASE WHEN "pData" ? 'userId' THEN "vRec"."userId" ELSE NULL END, CASE WHEN "pData" ? 'roundingStep' THEN "vRec"."roundingStep" ELSE 0 END, CASE WHEN "pData" ? 'numberGrouping' THEN "vRec"."numberGrouping" ELSE 'INTL' END, CASE WHEN "pData" ? 'gstRatePct' THEN "vRec"."gstRatePct" ELSE 18 END, CASE WHEN "pData" ? 'language' THEN "vRec".language ELSE 'EN' END, CASE WHEN "pData" ? 'memoryValue' THEN "vRec"."memoryValue" ELSE 0 END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Company"."CalculatorSettings" t
       SET "userId" = CASE WHEN "pData" ? 'userId' THEN "vRec"."userId" ELSE t."userId" END,
           "roundingStep" = CASE WHEN "pData" ? 'roundingStep' THEN "vRec"."roundingStep" ELSE t."roundingStep" END,
           "numberGrouping" = CASE WHEN "pData" ? 'numberGrouping' THEN "vRec"."numberGrouping" ELSE t."numberGrouping" END,
           "gstRatePct" = CASE WHEN "pData" ? 'gstRatePct' THEN "vRec"."gstRatePct" ELSE t."gstRatePct" END,
           language = CASE WHEN "pData" ? 'language' THEN "vRec".language ELSE t.language END,
           "memoryValue" = CASE WHEN "pData" ? 'memoryValue' THEN "vRec"."memoryValue" ELSE t."memoryValue" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Company"."CalculatorSettings" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CalculatorSettings %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CalculatorSettings % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Company"."calculatorSettingAddUpdate"(jsonb) IS 'Save (insert or update) one CalculatorSettings record.';

-- CalculatorSettings: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Company"."getCalculatorSettingInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('numberGroupingLabel', "Lookups"."getLookupLabel"('NumberGrouping', t."numberGrouping") ->> 'label', 'numberGroupingTone', "Lookups"."getLookupLabel"('NumberGrouping', t."numberGrouping") ->> 'tone', 'languageLabel', "Lookups"."getLookupLabel"('EnUrLanguage', t.language) ->> 'label', 'languageTone', "Lookups"."getLookupLabel"('EnUrLanguage', t.language) ->> 'tone')
    FROM "Company"."CalculatorSettings" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Company"."getCalculatorSettingInfo"(uuid) IS 'Read one CalculatorSettings record (getter for its screens).';
