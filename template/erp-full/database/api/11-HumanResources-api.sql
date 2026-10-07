-- =============================================================================
-- Finsoft ERP (Full edition) — API: "HumanResources"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- Grades: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."gradeAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."Grades";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."Grades", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."Grades" ("tenantId", code, "levelRank", "levelName", "minSalary", "midSalary", "maxSalary", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'levelRank' THEN "vRec"."levelRank" ELSE NULL END, CASE WHEN "pData" ? 'levelName' THEN "vRec"."levelName" ELSE NULL END, CASE WHEN "pData" ? 'minSalary' THEN "vRec"."minSalary" ELSE NULL END, CASE WHEN "pData" ? 'midSalary' THEN "vRec"."midSalary" ELSE NULL END, CASE WHEN "pData" ? 'maxSalary' THEN "vRec"."maxSalary" ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."Grades" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           "levelRank" = CASE WHEN "pData" ? 'levelRank' THEN "vRec"."levelRank" ELSE t."levelRank" END,
           "levelName" = CASE WHEN "pData" ? 'levelName' THEN "vRec"."levelName" ELSE t."levelName" END,
           "minSalary" = CASE WHEN "pData" ? 'minSalary' THEN "vRec"."minSalary" ELSE t."minSalary" END,
           "midSalary" = CASE WHEN "pData" ? 'midSalary' THEN "vRec"."midSalary" ELSE t."midSalary" END,
           "maxSalary" = CASE WHEN "pData" ? 'maxSalary' THEN "vRec"."maxSalary" ELSE t."maxSalary" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."Grades" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Grades %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Grades % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."gradeAddUpdate"(jsonb) IS 'Save (insert or update) one Grades record.';

-- Grades: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getGradeInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "HumanResources"."Grades" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getGradeInfo"(uuid) IS 'Read one Grades record (getter for its screens).';

-- Departments: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."departmentAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."Departments";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."Departments", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."Departments" ("tenantId", code, name, description, "parentId", division, "headEmployeeId", "costCentreId", "annualBudget", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'parentId' THEN "vRec"."parentId" ELSE NULL END, CASE WHEN "pData" ? 'division' THEN "vRec".division ELSE NULL END, CASE WHEN "pData" ? 'headEmployeeId' THEN "vRec"."headEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE NULL END, CASE WHEN "pData" ? 'annualBudget' THEN "vRec"."annualBudget" ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."Departments" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "parentId" = CASE WHEN "pData" ? 'parentId' THEN "vRec"."parentId" ELSE t."parentId" END,
           division = CASE WHEN "pData" ? 'division' THEN "vRec".division ELSE t.division END,
           "headEmployeeId" = CASE WHEN "pData" ? 'headEmployeeId' THEN "vRec"."headEmployeeId" ELSE t."headEmployeeId" END,
           "costCentreId" = CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE t."costCentreId" END,
           "annualBudget" = CASE WHEN "pData" ? 'annualBudget' THEN "vRec"."annualBudget" ELSE t."annualBudget" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."Departments" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Departments %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Departments % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."departmentAddUpdate"(jsonb) IS 'Save (insert or update) one Departments record.';

-- Departments: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getDepartmentInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('divisionLabel', "Lookups"."getLookupLabel"('Division', t.division) ->> 'label', 'divisionTone', "Lookups"."getLookupLabel"('Division', t.division) ->> 'tone')
    FROM "HumanResources"."Departments" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getDepartmentInfo"(uuid) IS 'Read one Departments record (getter for its screens).';

-- Designations: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."designationAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."Designations";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."Designations", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."Designations" ("tenantId", title, "departmentId", "gradeId", "approvedPositions", "reportsToDesignationId", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE NULL END, CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE NULL END, CASE WHEN "pData" ? 'gradeId' THEN "vRec"."gradeId" ELSE NULL END, CASE WHEN "pData" ? 'approvedPositions' THEN "vRec"."approvedPositions" ELSE 1 END, CASE WHEN "pData" ? 'reportsToDesignationId' THEN "vRec"."reportsToDesignationId" ELSE NULL END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."Designations" t
       SET title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
           "departmentId" = CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE t."departmentId" END,
           "gradeId" = CASE WHEN "pData" ? 'gradeId' THEN "vRec"."gradeId" ELSE t."gradeId" END,
           "approvedPositions" = CASE WHEN "pData" ? 'approvedPositions' THEN "vRec"."approvedPositions" ELSE t."approvedPositions" END,
           "reportsToDesignationId" = CASE WHEN "pData" ? 'reportsToDesignationId' THEN "vRec"."reportsToDesignationId" ELSE t."reportsToDesignationId" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."Designations" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Designations %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Designations % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."designationAddUpdate"(jsonb) IS 'Save (insert or update) one Designations record.';

-- Designations: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getDesignationInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "HumanResources"."Designations" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getDesignationInfo"(uuid) IS 'Read one Designations record (getter for its screens).';

-- WorkShifts: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."workShiftAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."WorkShifts";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."WorkShifts", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."WorkShifts" ("tenantId", code, name, description, colour, "startTime", "endTime", "crossesMidnight", "graceMinutes", "breakStart", "breakEnd", "fridayExtendedBreak", "fridayBreakEnd", "prayerBreakNote", "halfDayBelowHours", "lateMarksPerHalfDay", "overtimeAfterMinutes", "weeklyOff", "isDefault", "isSeasonal", season, "validFrom", "validTo", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'colour' THEN "vRec".colour ELSE 'TEAL' END, CASE WHEN "pData" ? 'startTime' THEN "vRec"."startTime" ELSE NULL END, CASE WHEN "pData" ? 'endTime' THEN "vRec"."endTime" ELSE NULL END, CASE WHEN "pData" ? 'crossesMidnight' THEN "vRec"."crossesMidnight" ELSE FALSE END, CASE WHEN "pData" ? 'graceMinutes' THEN "vRec"."graceMinutes" ELSE 15 END, CASE WHEN "pData" ? 'breakStart' THEN "vRec"."breakStart" ELSE NULL END, CASE WHEN "pData" ? 'breakEnd' THEN "vRec"."breakEnd" ELSE NULL END, CASE WHEN "pData" ? 'fridayExtendedBreak' THEN "vRec"."fridayExtendedBreak" ELSE FALSE END, CASE WHEN "pData" ? 'fridayBreakEnd' THEN "vRec"."fridayBreakEnd" ELSE NULL END, CASE WHEN "pData" ? 'prayerBreakNote' THEN "vRec"."prayerBreakNote" ELSE NULL END, CASE WHEN "pData" ? 'halfDayBelowHours' THEN "vRec"."halfDayBelowHours" ELSE NULL END, CASE WHEN "pData" ? 'lateMarksPerHalfDay' THEN "vRec"."lateMarksPerHalfDay" ELSE NULL END, CASE WHEN "pData" ? 'overtimeAfterMinutes' THEN "vRec"."overtimeAfterMinutes" ELSE 30 END, CASE WHEN "pData" ? 'weeklyOff' THEN "vRec"."weeklyOff" ELSE 'SUNDAY' END, CASE WHEN "pData" ? 'isDefault' THEN "vRec"."isDefault" ELSE FALSE END, CASE WHEN "pData" ? 'isSeasonal' THEN "vRec"."isSeasonal" ELSE FALSE END, CASE WHEN "pData" ? 'season' THEN "vRec".season ELSE NULL END, CASE WHEN "pData" ? 'validFrom' THEN "vRec"."validFrom" ELSE NULL END, CASE WHEN "pData" ? 'validTo' THEN "vRec"."validTo" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."WorkShifts" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           colour = CASE WHEN "pData" ? 'colour' THEN "vRec".colour ELSE t.colour END,
           "startTime" = CASE WHEN "pData" ? 'startTime' THEN "vRec"."startTime" ELSE t."startTime" END,
           "endTime" = CASE WHEN "pData" ? 'endTime' THEN "vRec"."endTime" ELSE t."endTime" END,
           "crossesMidnight" = CASE WHEN "pData" ? 'crossesMidnight' THEN "vRec"."crossesMidnight" ELSE t."crossesMidnight" END,
           "graceMinutes" = CASE WHEN "pData" ? 'graceMinutes' THEN "vRec"."graceMinutes" ELSE t."graceMinutes" END,
           "breakStart" = CASE WHEN "pData" ? 'breakStart' THEN "vRec"."breakStart" ELSE t."breakStart" END,
           "breakEnd" = CASE WHEN "pData" ? 'breakEnd' THEN "vRec"."breakEnd" ELSE t."breakEnd" END,
           "fridayExtendedBreak" = CASE WHEN "pData" ? 'fridayExtendedBreak' THEN "vRec"."fridayExtendedBreak" ELSE t."fridayExtendedBreak" END,
           "fridayBreakEnd" = CASE WHEN "pData" ? 'fridayBreakEnd' THEN "vRec"."fridayBreakEnd" ELSE t."fridayBreakEnd" END,
           "prayerBreakNote" = CASE WHEN "pData" ? 'prayerBreakNote' THEN "vRec"."prayerBreakNote" ELSE t."prayerBreakNote" END,
           "halfDayBelowHours" = CASE WHEN "pData" ? 'halfDayBelowHours' THEN "vRec"."halfDayBelowHours" ELSE t."halfDayBelowHours" END,
           "lateMarksPerHalfDay" = CASE WHEN "pData" ? 'lateMarksPerHalfDay' THEN "vRec"."lateMarksPerHalfDay" ELSE t."lateMarksPerHalfDay" END,
           "overtimeAfterMinutes" = CASE WHEN "pData" ? 'overtimeAfterMinutes' THEN "vRec"."overtimeAfterMinutes" ELSE t."overtimeAfterMinutes" END,
           "weeklyOff" = CASE WHEN "pData" ? 'weeklyOff' THEN "vRec"."weeklyOff" ELSE t."weeklyOff" END,
           "isDefault" = CASE WHEN "pData" ? 'isDefault' THEN "vRec"."isDefault" ELSE t."isDefault" END,
           "isSeasonal" = CASE WHEN "pData" ? 'isSeasonal' THEN "vRec"."isSeasonal" ELSE t."isSeasonal" END,
           season = CASE WHEN "pData" ? 'season' THEN "vRec".season ELSE t.season END,
           "validFrom" = CASE WHEN "pData" ? 'validFrom' THEN "vRec"."validFrom" ELSE t."validFrom" END,
           "validTo" = CASE WHEN "pData" ? 'validTo' THEN "vRec"."validTo" ELSE t."validTo" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."WorkShifts" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'WorkShifts %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'WorkShifts % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."workShiftAddUpdate"(jsonb) IS 'Save (insert or update) one WorkShifts record.';

-- WorkShifts: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getWorkShiftInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('colourLabel', "Lookups"."getLookupLabel"('WorkShiftColour', t.colour) ->> 'label', 'colourTone', "Lookups"."getLookupLabel"('WorkShiftColour', t.colour) ->> 'tone', 'weeklyOffLabel', "Lookups"."getLookupLabel"('WeeklyOff', t."weeklyOff") ->> 'label', 'weeklyOffTone', "Lookups"."getLookupLabel"('WeeklyOff', t."weeklyOff") ->> 'tone', 'seasonLabel', "Lookups"."getLookupLabel"('Season', t.season) ->> 'label', 'seasonTone', "Lookups"."getLookupLabel"('Season', t.season) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone')
    FROM "HumanResources"."WorkShifts" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getWorkShiftInfo"(uuid) IS 'Read one WorkShifts record (getter for its screens).';

-- Employees: insert (no "id") or update (with "id"); child arrays: assets, bankAccounts, documents, statutoryDetails
CREATE OR REPLACE FUNCTION "HumanResources"."employeeAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."Employees";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1EmployeeAssets" "HumanResources"."EmployeeAssets";
  "vC1EmployeeBankAccounts" "HumanResources"."EmployeeBankAccounts";
  "vC1EmployeeDocuments" "HumanResources"."EmployeeDocuments";
  "vC1EmployeeStatutoryDetails" "HumanResources"."EmployeeStatutoryDetails";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."Employees", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'code') OR "vRec".code IS NULL THEN
      "vRec".code := "Company"."getNextDocNo"('EMP', current_date, "vRec"."branchId");
    END IF;
    INSERT INTO "HumanResources"."Employees" ("tenantId", code, "firstName", "lastName", "legalName", "guardianName", "guardianRelation", cnic, "cnicIssueDate", "cnicExpiryDate", "dateOfBirth", gender, "maritalStatus", "childrenCount", religion, "bloodGroup", nationality, "photoAttachmentId", mobile, "personalEmail", "workEmail", "currentAddress", "permanentAddress", city, "emergencyContactName", "emergencyRelation", "emergencyPhone", "emergencyAltName", "emergencyAltRelation", "emergencyAltPhone", "departmentId", "designationId", "gradeId", "reportingManagerId", "costCentreId", "branchId", "shiftId", "weeklyOff", "payGroup", "employmentType", "workPattern", "joiningDate", "probationMonths", "confirmationDueOn", "confirmedOn", "contractEndDate", "noticeDays", "biometricId", "isBooker", "isSalesman", "isDeliveryman", "isSupervisor", status, "exitDate", "exitType", "appUserId")
    VALUES ("vTenant", "vRec".code, CASE WHEN "pData" ? 'firstName' THEN "vRec"."firstName" ELSE NULL END, CASE WHEN "pData" ? 'lastName' THEN "vRec"."lastName" ELSE NULL END, CASE WHEN "pData" ? 'legalName' THEN "vRec"."legalName" ELSE NULL END, CASE WHEN "pData" ? 'guardianName' THEN "vRec"."guardianName" ELSE NULL END, CASE WHEN "pData" ? 'guardianRelation' THEN "vRec"."guardianRelation" ELSE 'FATHER' END, CASE WHEN "pData" ? 'cnic' THEN "vRec".cnic ELSE NULL END, CASE WHEN "pData" ? 'cnicIssueDate' THEN "vRec"."cnicIssueDate" ELSE NULL END, CASE WHEN "pData" ? 'cnicExpiryDate' THEN "vRec"."cnicExpiryDate" ELSE NULL END, CASE WHEN "pData" ? 'dateOfBirth' THEN "vRec"."dateOfBirth" ELSE NULL END, CASE WHEN "pData" ? 'gender' THEN "vRec".gender ELSE NULL END, CASE WHEN "pData" ? 'maritalStatus' THEN "vRec"."maritalStatus" ELSE NULL END, CASE WHEN "pData" ? 'childrenCount' THEN "vRec"."childrenCount" ELSE NULL END, CASE WHEN "pData" ? 'religion' THEN "vRec".religion ELSE NULL END, CASE WHEN "pData" ? 'bloodGroup' THEN "vRec"."bloodGroup" ELSE NULL END, CASE WHEN "pData" ? 'nationality' THEN "vRec".nationality ELSE 'PAKISTANI' END, CASE WHEN "pData" ? 'photoAttachmentId' THEN "vRec"."photoAttachmentId" ELSE NULL END, CASE WHEN "pData" ? 'mobile' THEN "vRec".mobile ELSE NULL END, CASE WHEN "pData" ? 'personalEmail' THEN "vRec"."personalEmail" ELSE NULL END, CASE WHEN "pData" ? 'workEmail' THEN "vRec"."workEmail" ELSE NULL END, CASE WHEN "pData" ? 'currentAddress' THEN "vRec"."currentAddress" ELSE NULL END, CASE WHEN "pData" ? 'permanentAddress' THEN "vRec"."permanentAddress" ELSE NULL END, CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE NULL END, CASE WHEN "pData" ? 'emergencyContactName' THEN "vRec"."emergencyContactName" ELSE NULL END, CASE WHEN "pData" ? 'emergencyRelation' THEN "vRec"."emergencyRelation" ELSE NULL END, CASE WHEN "pData" ? 'emergencyPhone' THEN "vRec"."emergencyPhone" ELSE NULL END, CASE WHEN "pData" ? 'emergencyAltName' THEN "vRec"."emergencyAltName" ELSE NULL END, CASE WHEN "pData" ? 'emergencyAltRelation' THEN "vRec"."emergencyAltRelation" ELSE NULL END, CASE WHEN "pData" ? 'emergencyAltPhone' THEN "vRec"."emergencyAltPhone" ELSE NULL END, CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE NULL END, CASE WHEN "pData" ? 'designationId' THEN "vRec"."designationId" ELSE NULL END, CASE WHEN "pData" ? 'gradeId' THEN "vRec"."gradeId" ELSE NULL END, CASE WHEN "pData" ? 'reportingManagerId' THEN "vRec"."reportingManagerId" ELSE NULL END, CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'shiftId' THEN "vRec"."shiftId" ELSE NULL END, CASE WHEN "pData" ? 'weeklyOff' THEN "vRec"."weeklyOff" ELSE 'SUNDAY' END, CASE WHEN "pData" ? 'payGroup' THEN "vRec"."payGroup" ELSE 'STAFF' END, CASE WHEN "pData" ? 'employmentType' THEN "vRec"."employmentType" ELSE NULL END, CASE WHEN "pData" ? 'workPattern' THEN "vRec"."workPattern" ELSE 'FULL_TIME' END, CASE WHEN "pData" ? 'joiningDate' THEN "vRec"."joiningDate" ELSE NULL END, CASE WHEN "pData" ? 'probationMonths' THEN "vRec"."probationMonths" ELSE 3 END, CASE WHEN "pData" ? 'confirmationDueOn' THEN "vRec"."confirmationDueOn" ELSE NULL END, CASE WHEN "pData" ? 'confirmedOn' THEN "vRec"."confirmedOn" ELSE NULL END, CASE WHEN "pData" ? 'contractEndDate' THEN "vRec"."contractEndDate" ELSE NULL END, CASE WHEN "pData" ? 'noticeDays' THEN "vRec"."noticeDays" ELSE 30 END, CASE WHEN "pData" ? 'biometricId' THEN "vRec"."biometricId" ELSE NULL END, CASE WHEN "pData" ? 'isBooker' THEN "vRec"."isBooker" ELSE FALSE END, CASE WHEN "pData" ? 'isSalesman' THEN "vRec"."isSalesman" ELSE FALSE END, CASE WHEN "pData" ? 'isDeliveryman' THEN "vRec"."isDeliveryman" ELSE FALSE END, CASE WHEN "pData" ? 'isSupervisor' THEN "vRec"."isSupervisor" ELSE FALSE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'PROBATION' END, CASE WHEN "pData" ? 'exitDate' THEN "vRec"."exitDate" ELSE NULL END, CASE WHEN "pData" ? 'exitType' THEN "vRec"."exitType" ELSE NULL END, CASE WHEN "pData" ? 'appUserId' THEN "vRec"."appUserId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."Employees" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           "firstName" = CASE WHEN "pData" ? 'firstName' THEN "vRec"."firstName" ELSE t."firstName" END,
           "lastName" = CASE WHEN "pData" ? 'lastName' THEN "vRec"."lastName" ELSE t."lastName" END,
           "legalName" = CASE WHEN "pData" ? 'legalName' THEN "vRec"."legalName" ELSE t."legalName" END,
           "guardianName" = CASE WHEN "pData" ? 'guardianName' THEN "vRec"."guardianName" ELSE t."guardianName" END,
           "guardianRelation" = CASE WHEN "pData" ? 'guardianRelation' THEN "vRec"."guardianRelation" ELSE t."guardianRelation" END,
           cnic = CASE WHEN "pData" ? 'cnic' THEN "vRec".cnic ELSE t.cnic END,
           "cnicIssueDate" = CASE WHEN "pData" ? 'cnicIssueDate' THEN "vRec"."cnicIssueDate" ELSE t."cnicIssueDate" END,
           "cnicExpiryDate" = CASE WHEN "pData" ? 'cnicExpiryDate' THEN "vRec"."cnicExpiryDate" ELSE t."cnicExpiryDate" END,
           "dateOfBirth" = CASE WHEN "pData" ? 'dateOfBirth' THEN "vRec"."dateOfBirth" ELSE t."dateOfBirth" END,
           gender = CASE WHEN "pData" ? 'gender' THEN "vRec".gender ELSE t.gender END,
           "maritalStatus" = CASE WHEN "pData" ? 'maritalStatus' THEN "vRec"."maritalStatus" ELSE t."maritalStatus" END,
           "childrenCount" = CASE WHEN "pData" ? 'childrenCount' THEN "vRec"."childrenCount" ELSE t."childrenCount" END,
           religion = CASE WHEN "pData" ? 'religion' THEN "vRec".religion ELSE t.religion END,
           "bloodGroup" = CASE WHEN "pData" ? 'bloodGroup' THEN "vRec"."bloodGroup" ELSE t."bloodGroup" END,
           nationality = CASE WHEN "pData" ? 'nationality' THEN "vRec".nationality ELSE t.nationality END,
           "photoAttachmentId" = CASE WHEN "pData" ? 'photoAttachmentId' THEN "vRec"."photoAttachmentId" ELSE t."photoAttachmentId" END,
           mobile = CASE WHEN "pData" ? 'mobile' THEN "vRec".mobile ELSE t.mobile END,
           "personalEmail" = CASE WHEN "pData" ? 'personalEmail' THEN "vRec"."personalEmail" ELSE t."personalEmail" END,
           "workEmail" = CASE WHEN "pData" ? 'workEmail' THEN "vRec"."workEmail" ELSE t."workEmail" END,
           "currentAddress" = CASE WHEN "pData" ? 'currentAddress' THEN "vRec"."currentAddress" ELSE t."currentAddress" END,
           "permanentAddress" = CASE WHEN "pData" ? 'permanentAddress' THEN "vRec"."permanentAddress" ELSE t."permanentAddress" END,
           city = CASE WHEN "pData" ? 'city' THEN "vRec".city ELSE t.city END,
           "emergencyContactName" = CASE WHEN "pData" ? 'emergencyContactName' THEN "vRec"."emergencyContactName" ELSE t."emergencyContactName" END,
           "emergencyRelation" = CASE WHEN "pData" ? 'emergencyRelation' THEN "vRec"."emergencyRelation" ELSE t."emergencyRelation" END,
           "emergencyPhone" = CASE WHEN "pData" ? 'emergencyPhone' THEN "vRec"."emergencyPhone" ELSE t."emergencyPhone" END,
           "emergencyAltName" = CASE WHEN "pData" ? 'emergencyAltName' THEN "vRec"."emergencyAltName" ELSE t."emergencyAltName" END,
           "emergencyAltRelation" = CASE WHEN "pData" ? 'emergencyAltRelation' THEN "vRec"."emergencyAltRelation" ELSE t."emergencyAltRelation" END,
           "emergencyAltPhone" = CASE WHEN "pData" ? 'emergencyAltPhone' THEN "vRec"."emergencyAltPhone" ELSE t."emergencyAltPhone" END,
           "departmentId" = CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE t."departmentId" END,
           "designationId" = CASE WHEN "pData" ? 'designationId' THEN "vRec"."designationId" ELSE t."designationId" END,
           "gradeId" = CASE WHEN "pData" ? 'gradeId' THEN "vRec"."gradeId" ELSE t."gradeId" END,
           "reportingManagerId" = CASE WHEN "pData" ? 'reportingManagerId' THEN "vRec"."reportingManagerId" ELSE t."reportingManagerId" END,
           "costCentreId" = CASE WHEN "pData" ? 'costCentreId' THEN "vRec"."costCentreId" ELSE t."costCentreId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "shiftId" = CASE WHEN "pData" ? 'shiftId' THEN "vRec"."shiftId" ELSE t."shiftId" END,
           "weeklyOff" = CASE WHEN "pData" ? 'weeklyOff' THEN "vRec"."weeklyOff" ELSE t."weeklyOff" END,
           "payGroup" = CASE WHEN "pData" ? 'payGroup' THEN "vRec"."payGroup" ELSE t."payGroup" END,
           "employmentType" = CASE WHEN "pData" ? 'employmentType' THEN "vRec"."employmentType" ELSE t."employmentType" END,
           "workPattern" = CASE WHEN "pData" ? 'workPattern' THEN "vRec"."workPattern" ELSE t."workPattern" END,
           "joiningDate" = CASE WHEN "pData" ? 'joiningDate' THEN "vRec"."joiningDate" ELSE t."joiningDate" END,
           "probationMonths" = CASE WHEN "pData" ? 'probationMonths' THEN "vRec"."probationMonths" ELSE t."probationMonths" END,
           "confirmationDueOn" = CASE WHEN "pData" ? 'confirmationDueOn' THEN "vRec"."confirmationDueOn" ELSE t."confirmationDueOn" END,
           "confirmedOn" = CASE WHEN "pData" ? 'confirmedOn' THEN "vRec"."confirmedOn" ELSE t."confirmedOn" END,
           "contractEndDate" = CASE WHEN "pData" ? 'contractEndDate' THEN "vRec"."contractEndDate" ELSE t."contractEndDate" END,
           "noticeDays" = CASE WHEN "pData" ? 'noticeDays' THEN "vRec"."noticeDays" ELSE t."noticeDays" END,
           "biometricId" = CASE WHEN "pData" ? 'biometricId' THEN "vRec"."biometricId" ELSE t."biometricId" END,
           "isBooker" = CASE WHEN "pData" ? 'isBooker' THEN "vRec"."isBooker" ELSE t."isBooker" END,
           "isSalesman" = CASE WHEN "pData" ? 'isSalesman' THEN "vRec"."isSalesman" ELSE t."isSalesman" END,
           "isDeliveryman" = CASE WHEN "pData" ? 'isDeliveryman' THEN "vRec"."isDeliveryman" ELSE t."isDeliveryman" END,
           "isSupervisor" = CASE WHEN "pData" ? 'isSupervisor' THEN "vRec"."isSupervisor" ELSE t."isSupervisor" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "exitDate" = CASE WHEN "pData" ? 'exitDate' THEN "vRec"."exitDate" ELSE t."exitDate" END,
           "exitType" = CASE WHEN "pData" ? 'exitType' THEN "vRec"."exitType" ELSE t."exitType" END,
           "appUserId" = CASE WHEN "pData" ? 'appUserId' THEN "vRec"."appUserId" ELSE t."appUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."Employees" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Employees %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Employees % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'assets' THEN
    -- assets: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "HumanResources"."EmployeeAssets"
     WHERE "tenantId" = "vTenant" AND "employeeId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'assets') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'assets') WITH ORDINALITY t(x, n) LOOP
      "vC1EmployeeAssets" := jsonb_populate_record(NULL::"HumanResources"."EmployeeAssets", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "HumanResources"."EmployeeAssets" t
           SET "assetId" = CASE WHEN "vE1" ? 'assetId' THEN "vC1EmployeeAssets"."assetId" ELSE t."assetId" END,
               category = CASE WHEN "vE1" ? 'category' THEN "vC1EmployeeAssets".category ELSE t.category END,
               "assetName" = CASE WHEN "vE1" ? 'assetName' THEN "vC1EmployeeAssets"."assetName" ELSE t."assetName" END,
               specification = CASE WHEN "vE1" ? 'specification' THEN "vC1EmployeeAssets".specification ELSE t.specification END,
               tag = CASE WHEN "vE1" ? 'tag' THEN "vC1EmployeeAssets".tag ELSE t.tag END,
               "serialNo" = CASE WHEN "vE1" ? 'serialNo' THEN "vC1EmployeeAssets"."serialNo" ELSE t."serialNo" END,
               "issuedOn" = CASE WHEN "vE1" ? 'issuedOn' THEN "vC1EmployeeAssets"."issuedOn" ELSE t."issuedOn" END,
               "returnedOn" = CASE WHEN "vE1" ? 'returnedOn' THEN "vC1EmployeeAssets"."returnedOn" ELSE t."returnedOn" END,
               condition = CASE WHEN "vE1" ? 'condition' THEN "vC1EmployeeAssets".condition ELSE t.condition END,
               "valueAmount" = CASE WHEN "vE1" ? 'valueAmount' THEN "vC1EmployeeAssets"."valueAmount" ELSE t."valueAmount" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1EmployeeAssets".status ELSE t.status END,
               remarks = CASE WHEN "vE1" ? 'remarks' THEN "vC1EmployeeAssets".remarks ELSE t.remarks END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."employeeId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'EmployeeAssets: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "HumanResources"."EmployeeAssets" ("employeeId", "tenantId", "assetId", category, "assetName", specification, tag, "serialNo", "issuedOn", "returnedOn", condition, "valueAmount", status, remarks)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'assetId' THEN "vC1EmployeeAssets"."assetId" ELSE NULL END, CASE WHEN "vE1" ? 'category' THEN "vC1EmployeeAssets".category ELSE NULL END, CASE WHEN "vE1" ? 'assetName' THEN "vC1EmployeeAssets"."assetName" ELSE NULL END, CASE WHEN "vE1" ? 'specification' THEN "vC1EmployeeAssets".specification ELSE NULL END, CASE WHEN "vE1" ? 'tag' THEN "vC1EmployeeAssets".tag ELSE NULL END, CASE WHEN "vE1" ? 'serialNo' THEN "vC1EmployeeAssets"."serialNo" ELSE NULL END, CASE WHEN "vE1" ? 'issuedOn' THEN "vC1EmployeeAssets"."issuedOn" ELSE NULL END, CASE WHEN "vE1" ? 'returnedOn' THEN "vC1EmployeeAssets"."returnedOn" ELSE NULL END, CASE WHEN "vE1" ? 'condition' THEN "vC1EmployeeAssets".condition ELSE NULL END, CASE WHEN "vE1" ? 'valueAmount' THEN "vC1EmployeeAssets"."valueAmount" ELSE NULL END, CASE WHEN "vE1" ? 'status' THEN "vC1EmployeeAssets".status ELSE 'ISSUED' END, CASE WHEN "vE1" ? 'remarks' THEN "vC1EmployeeAssets".remarks ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'bankAccounts' THEN
    -- bankAccounts: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "HumanResources"."EmployeeBankAccounts"
     WHERE "tenantId" = "vTenant" AND "employeeId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'bankAccounts') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'bankAccounts') WITH ORDINALITY t(x, n) LOOP
      "vC1EmployeeBankAccounts" := jsonb_populate_record(NULL::"HumanResources"."EmployeeBankAccounts", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "HumanResources"."EmployeeBankAccounts" t
           SET "paymentMode" = CASE WHEN "vE1" ? 'paymentMode' THEN "vC1EmployeeBankAccounts"."paymentMode" ELSE t."paymentMode" END,
               "bankId" = CASE WHEN "vE1" ? 'bankId' THEN "vC1EmployeeBankAccounts"."bankId" ELSE t."bankId" END,
               "bankName" = CASE WHEN "vE1" ? 'bankName' THEN "vC1EmployeeBankAccounts"."bankName" ELSE t."bankName" END,
               "branchName" = CASE WHEN "vE1" ? 'branchName' THEN "vC1EmployeeBankAccounts"."branchName" ELSE t."branchName" END,
               "accountTitle" = CASE WHEN "vE1" ? 'accountTitle' THEN "vC1EmployeeBankAccounts"."accountTitle" ELSE t."accountTitle" END,
               iban = CASE WHEN "vE1" ? 'iban' THEN "vC1EmployeeBankAccounts".iban ELSE t.iban END,
               "isPrimary" = CASE WHEN "vE1" ? 'isPrimary' THEN "vC1EmployeeBankAccounts"."isPrimary" ELSE t."isPrimary" END,
               "effectiveFrom" = CASE WHEN "vE1" ? 'effectiveFrom' THEN "vC1EmployeeBankAccounts"."effectiveFrom" ELSE t."effectiveFrom" END,
               "isActive" = CASE WHEN "vE1" ? 'isActive' THEN "vC1EmployeeBankAccounts"."isActive" ELSE t."isActive" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."employeeId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'EmployeeBankAccounts: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "HumanResources"."EmployeeBankAccounts" ("employeeId", "tenantId", "paymentMode", "bankId", "bankName", "branchName", "accountTitle", iban, "isPrimary", "effectiveFrom", "isActive")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'paymentMode' THEN "vC1EmployeeBankAccounts"."paymentMode" ELSE 'BANK' END, CASE WHEN "vE1" ? 'bankId' THEN "vC1EmployeeBankAccounts"."bankId" ELSE NULL END, CASE WHEN "vE1" ? 'bankName' THEN "vC1EmployeeBankAccounts"."bankName" ELSE NULL END, CASE WHEN "vE1" ? 'branchName' THEN "vC1EmployeeBankAccounts"."branchName" ELSE NULL END, CASE WHEN "vE1" ? 'accountTitle' THEN "vC1EmployeeBankAccounts"."accountTitle" ELSE NULL END, CASE WHEN "vE1" ? 'iban' THEN "vC1EmployeeBankAccounts".iban ELSE NULL END, CASE WHEN "vE1" ? 'isPrimary' THEN "vC1EmployeeBankAccounts"."isPrimary" ELSE TRUE END, CASE WHEN "vE1" ? 'effectiveFrom' THEN "vC1EmployeeBankAccounts"."effectiveFrom" ELSE CURRENT_DATE END, CASE WHEN "vE1" ? 'isActive' THEN "vC1EmployeeBankAccounts"."isActive" ELSE TRUE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'documents' THEN
    -- documents: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "HumanResources"."EmployeeDocuments"
     WHERE "tenantId" = "vTenant" AND "employeeId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'documents') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'documents') WITH ORDINALITY t(x, n) LOOP
      "vC1EmployeeDocuments" := jsonb_populate_record(NULL::"HumanResources"."EmployeeDocuments", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "HumanResources"."EmployeeDocuments" t
           SET category = CASE WHEN "vE1" ? 'category' THEN "vC1EmployeeDocuments".category ELSE t.category END,
               title = CASE WHEN "vE1" ? 'title' THEN "vC1EmployeeDocuments".title ELSE t.title END,
               "attachmentId" = CASE WHEN "vE1" ? 'attachmentId' THEN "vC1EmployeeDocuments"."attachmentId" ELSE t."attachmentId" END,
               "hrLetterId" = CASE WHEN "vE1" ? 'hrLetterId' THEN "vC1EmployeeDocuments"."hrLetterId" ELSE t."hrLetterId" END,
               "issuedOn" = CASE WHEN "vE1" ? 'issuedOn' THEN "vC1EmployeeDocuments"."issuedOn" ELSE t."issuedOn" END,
               "expiresOn" = CASE WHEN "vE1" ? 'expiresOn' THEN "vC1EmployeeDocuments"."expiresOn" ELSE t."expiresOn" END,
               "isRequired" = CASE WHEN "vE1" ? 'isRequired' THEN "vC1EmployeeDocuments"."isRequired" ELSE t."isRequired" END,
               "renewalFrequency" = CASE WHEN "vE1" ? 'renewalFrequency' THEN "vC1EmployeeDocuments"."renewalFrequency" ELSE t."renewalFrequency" END,
               "dueOn" = CASE WHEN "vE1" ? 'dueOn' THEN "vC1EmployeeDocuments"."dueOn" ELSE t."dueOn" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1EmployeeDocuments".status ELSE t.status END,
               "verifiedByUserId" = CASE WHEN "vE1" ? 'verifiedByUserId' THEN "vC1EmployeeDocuments"."verifiedByUserId" ELSE t."verifiedByUserId" END,
               "verifiedAt" = CASE WHEN "vE1" ? 'verifiedAt' THEN "vC1EmployeeDocuments"."verifiedAt" ELSE t."verifiedAt" END,
               remarks = CASE WHEN "vE1" ? 'remarks' THEN "vC1EmployeeDocuments".remarks ELSE t.remarks END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."employeeId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'EmployeeDocuments: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "HumanResources"."EmployeeDocuments" ("employeeId", "tenantId", category, title, "attachmentId", "hrLetterId", "issuedOn", "expiresOn", "isRequired", "renewalFrequency", "dueOn", status, "verifiedByUserId", "verifiedAt", remarks)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'category' THEN "vC1EmployeeDocuments".category ELSE NULL END, CASE WHEN "vE1" ? 'title' THEN "vC1EmployeeDocuments".title ELSE NULL END, CASE WHEN "vE1" ? 'attachmentId' THEN "vC1EmployeeDocuments"."attachmentId" ELSE NULL END, CASE WHEN "vE1" ? 'hrLetterId' THEN "vC1EmployeeDocuments"."hrLetterId" ELSE NULL END, CASE WHEN "vE1" ? 'issuedOn' THEN "vC1EmployeeDocuments"."issuedOn" ELSE NULL END, CASE WHEN "vE1" ? 'expiresOn' THEN "vC1EmployeeDocuments"."expiresOn" ELSE NULL END, CASE WHEN "vE1" ? 'isRequired' THEN "vC1EmployeeDocuments"."isRequired" ELSE FALSE END, CASE WHEN "vE1" ? 'renewalFrequency' THEN "vC1EmployeeDocuments"."renewalFrequency" ELSE NULL END, CASE WHEN "vE1" ? 'dueOn' THEN "vC1EmployeeDocuments"."dueOn" ELSE NULL END, CASE WHEN "vE1" ? 'status' THEN "vC1EmployeeDocuments".status ELSE 'UPLOADED' END, CASE WHEN "vE1" ? 'verifiedByUserId' THEN "vC1EmployeeDocuments"."verifiedByUserId" ELSE NULL END, CASE WHEN "vE1" ? 'verifiedAt' THEN "vC1EmployeeDocuments"."verifiedAt" ELSE NULL END, CASE WHEN "vE1" ? 'remarks' THEN "vC1EmployeeDocuments".remarks ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'statutoryDetails' THEN
    -- statutoryDetails: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "HumanResources"."EmployeeStatutoryDetails"
     WHERE "tenantId" = "vTenant" AND "employeeId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'statutoryDetails') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'statutoryDetails') WITH ORDINALITY t(x, n) LOOP
      "vC1EmployeeStatutoryDetails" := jsonb_populate_record(NULL::"HumanResources"."EmployeeStatutoryDetails", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "HumanResources"."EmployeeStatutoryDetails" t
           SET "eobiApplicable" = CASE WHEN "vE1" ? 'eobiApplicable' THEN "vC1EmployeeStatutoryDetails"."eobiApplicable" ELSE t."eobiApplicable" END,
               "eobiNo" = CASE WHEN "vE1" ? 'eobiNo' THEN "vC1EmployeeStatutoryDetails"."eobiNo" ELSE t."eobiNo" END,
               "eobiRegisteredOn" = CASE WHEN "vE1" ? 'eobiRegisteredOn' THEN "vC1EmployeeStatutoryDetails"."eobiRegisteredOn" ELSE t."eobiRegisteredOn" END,
               "socialSecurityApplicable" = CASE WHEN "vE1" ? 'socialSecurityApplicable' THEN "vC1EmployeeStatutoryDetails"."socialSecurityApplicable" ELSE t."socialSecurityApplicable" END,
               "socialSecurityScheme" = CASE WHEN "vE1" ? 'socialSecurityScheme' THEN "vC1EmployeeStatutoryDetails"."socialSecurityScheme" ELSE t."socialSecurityScheme" END,
               "socialSecurityNo" = CASE WHEN "vE1" ? 'socialSecurityNo' THEN "vC1EmployeeStatutoryDetails"."socialSecurityNo" ELSE t."socialSecurityNo" END,
               ntn = CASE WHEN "vE1" ? 'ntn' THEN "vC1EmployeeStatutoryDetails".ntn ELSE t.ntn END,
               "atlStatus" = CASE WHEN "vE1" ? 'atlStatus' THEN "vC1EmployeeStatutoryDetails"."atlStatus" ELSE t."atlStatus" END,
               "pfApplicable" = CASE WHEN "vE1" ? 'pfApplicable' THEN "vC1EmployeeStatutoryDetails"."pfApplicable" ELSE t."pfApplicable" END,
               "pfFromDate" = CASE WHEN "vE1" ? 'pfFromDate' THEN "vC1EmployeeStatutoryDetails"."pfFromDate" ELSE t."pfFromDate" END,
               "groupInsurance" = CASE WHEN "vE1" ? 'groupInsurance' THEN "vC1EmployeeStatutoryDetails"."groupInsurance" ELSE t."groupInsurance" END,
               "overtimeEligible" = CASE WHEN "vE1" ? 'overtimeEligible' THEN "vC1EmployeeStatutoryDetails"."overtimeEligible" ELSE t."overtimeEligible" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."employeeId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'EmployeeStatutoryDetails: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "HumanResources"."EmployeeStatutoryDetails" ("employeeId", "tenantId", "eobiApplicable", "eobiNo", "eobiRegisteredOn", "socialSecurityApplicable", "socialSecurityScheme", "socialSecurityNo", ntn, "atlStatus", "pfApplicable", "pfFromDate", "groupInsurance", "overtimeEligible")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'eobiApplicable' THEN "vC1EmployeeStatutoryDetails"."eobiApplicable" ELSE TRUE END, CASE WHEN "vE1" ? 'eobiNo' THEN "vC1EmployeeStatutoryDetails"."eobiNo" ELSE NULL END, CASE WHEN "vE1" ? 'eobiRegisteredOn' THEN "vC1EmployeeStatutoryDetails"."eobiRegisteredOn" ELSE NULL END, CASE WHEN "vE1" ? 'socialSecurityApplicable' THEN "vC1EmployeeStatutoryDetails"."socialSecurityApplicable" ELSE TRUE END, CASE WHEN "vE1" ? 'socialSecurityScheme' THEN "vC1EmployeeStatutoryDetails"."socialSecurityScheme" ELSE NULL END, CASE WHEN "vE1" ? 'socialSecurityNo' THEN "vC1EmployeeStatutoryDetails"."socialSecurityNo" ELSE NULL END, CASE WHEN "vE1" ? 'ntn' THEN "vC1EmployeeStatutoryDetails".ntn ELSE NULL END, CASE WHEN "vE1" ? 'atlStatus' THEN "vC1EmployeeStatutoryDetails"."atlStatus" ELSE 'NON_FILER' END, CASE WHEN "vE1" ? 'pfApplicable' THEN "vC1EmployeeStatutoryDetails"."pfApplicable" ELSE FALSE END, CASE WHEN "vE1" ? 'pfFromDate' THEN "vC1EmployeeStatutoryDetails"."pfFromDate" ELSE NULL END, CASE WHEN "vE1" ? 'groupInsurance' THEN "vC1EmployeeStatutoryDetails"."groupInsurance" ELSE FALSE END, CASE WHEN "vE1" ? 'overtimeEligible' THEN "vC1EmployeeStatutoryDetails"."overtimeEligible" ELSE FALSE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."employeeAddUpdate"(jsonb) IS 'Save (insert or update) one Employees record with its assets, bankAccounts, documents, statutoryDetails.';

-- Employees: one record as JSON (camelCase keys), with lookup labels and assets, bankAccounts, documents, statutoryDetails
CREATE OR REPLACE FUNCTION "HumanResources"."getEmployeeInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('guardianRelationLabel', "Lookups"."getLookupLabel"('GuardianRelation', t."guardianRelation") ->> 'label', 'guardianRelationTone', "Lookups"."getLookupLabel"('GuardianRelation', t."guardianRelation") ->> 'tone', 'genderLabel', "Lookups"."getLookupLabel"('EmployeeGender', t.gender) ->> 'label', 'genderTone', "Lookups"."getLookupLabel"('EmployeeGender', t.gender) ->> 'tone', 'maritalStatusLabel', "Lookups"."getLookupLabel"('MaritalStatus', t."maritalStatus") ->> 'label', 'maritalStatusTone', "Lookups"."getLookupLabel"('MaritalStatus', t."maritalStatus") ->> 'tone', 'religionLabel', "Lookups"."getLookupLabel"('Religion', t.religion) ->> 'label', 'religionTone', "Lookups"."getLookupLabel"('Religion', t.religion) ->> 'tone', 'bloodGroupLabel', "Lookups"."getLookupLabel"('BloodGroup', t."bloodGroup") ->> 'label', 'bloodGroupTone', "Lookups"."getLookupLabel"('BloodGroup', t."bloodGroup") ->> 'tone', 'weeklyOffLabel', "Lookups"."getLookupLabel"('WeeklyOff', t."weeklyOff") ->> 'label', 'weeklyOffTone', "Lookups"."getLookupLabel"('WeeklyOff', t."weeklyOff") ->> 'tone', 'payGroupLabel', "Lookups"."getLookupLabel"('PayGroup', t."payGroup") ->> 'label', 'payGroupTone', "Lookups"."getLookupLabel"('PayGroup', t."payGroup") ->> 'tone', 'employmentTypeLabel', "Lookups"."getLookupLabel"('EmploymentType', t."employmentType") ->> 'label', 'employmentTypeTone', "Lookups"."getLookupLabel"('EmploymentType', t."employmentType") ->> 'tone', 'workPatternLabel', "Lookups"."getLookupLabel"('WorkPattern', t."workPattern") ->> 'label', 'workPatternTone', "Lookups"."getLookupLabel"('WorkPattern', t."workPattern") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('EmployeeStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('EmployeeStatus', t.status) ->> 'tone', 'exitTypeLabel', "Lookups"."getLookupLabel"('ExitType', t."exitType") ->> 'label', 'exitTypeTone', "Lookups"."getLookupLabel"('ExitType', t."exitType") ->> 'tone') ||
         jsonb_build_object('assets', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "HumanResources"."EmployeeAssets" c1 WHERE c1."employeeId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'bankAccounts', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "HumanResources"."EmployeeBankAccounts" c1 WHERE c1."employeeId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'documents', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "HumanResources"."EmployeeDocuments" c1 WHERE c1."employeeId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'statutoryDetails', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "HumanResources"."EmployeeStatutoryDetails" c1 WHERE c1."employeeId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "HumanResources"."Employees" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getEmployeeInfo"(uuid) IS 'Read one Employees record (getter for its screens).';

-- BranchHrSettings: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."branchHrSettingAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."BranchHrSettings";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."BranchHrSettings", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."BranchHrSettings" ("tenantId", "branchId", "socialSecurityScheme", "managerEmployeeId", "defaultShiftId", "geofenceLat", "geofenceLng", "geofenceRadiusM")
    VALUES ("vTenant", CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'socialSecurityScheme' THEN "vRec"."socialSecurityScheme" ELSE 'NONE' END, CASE WHEN "pData" ? 'managerEmployeeId' THEN "vRec"."managerEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'defaultShiftId' THEN "vRec"."defaultShiftId" ELSE NULL END, CASE WHEN "pData" ? 'geofenceLat' THEN "vRec"."geofenceLat" ELSE NULL END, CASE WHEN "pData" ? 'geofenceLng' THEN "vRec"."geofenceLng" ELSE NULL END, CASE WHEN "pData" ? 'geofenceRadiusM' THEN "vRec"."geofenceRadiusM" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."BranchHrSettings" t
       SET "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "socialSecurityScheme" = CASE WHEN "pData" ? 'socialSecurityScheme' THEN "vRec"."socialSecurityScheme" ELSE t."socialSecurityScheme" END,
           "managerEmployeeId" = CASE WHEN "pData" ? 'managerEmployeeId' THEN "vRec"."managerEmployeeId" ELSE t."managerEmployeeId" END,
           "defaultShiftId" = CASE WHEN "pData" ? 'defaultShiftId' THEN "vRec"."defaultShiftId" ELSE t."defaultShiftId" END,
           "geofenceLat" = CASE WHEN "pData" ? 'geofenceLat' THEN "vRec"."geofenceLat" ELSE t."geofenceLat" END,
           "geofenceLng" = CASE WHEN "pData" ? 'geofenceLng' THEN "vRec"."geofenceLng" ELSE t."geofenceLng" END,
           "geofenceRadiusM" = CASE WHEN "pData" ? 'geofenceRadiusM' THEN "vRec"."geofenceRadiusM" ELSE t."geofenceRadiusM" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."BranchHrSettings" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'BranchHrSettings %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'BranchHrSettings % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."branchHrSettingAddUpdate"(jsonb) IS 'Save (insert or update) one BranchHrSettings record.';

-- BranchHrSettings: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getBranchHrSettingInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('socialSecuritySchemeLabel', "Lookups"."getLookupLabel"('BranchHrSettingSocialSecurityScheme', t."socialSecurityScheme") ->> 'label', 'socialSecuritySchemeTone', "Lookups"."getLookupLabel"('BranchHrSettingSocialSecurityScheme', t."socialSecurityScheme") ->> 'tone')
    FROM "HumanResources"."BranchHrSettings" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getBranchHrSettingInfo"(uuid) IS 'Read one BranchHrSettings record (getter for its screens).';

-- EmployeeLetters: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."employeeLetterAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."EmployeeLetters";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."EmployeeLetters", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."EmployeeLetters" ("tenantId", "letterNo", "employeeId", "letterType", "docTemplateId", "addressedTo", "letterDate", "signatoryEmployeeId", language, "includeSalary", "emailToEmployee", "emailedAt", "pdfAttachmentId", "verificationCode", remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'letterNo' THEN "vRec"."letterNo" ELSE NULL END, CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'letterType' THEN "vRec"."letterType" ELSE NULL END, CASE WHEN "pData" ? 'docTemplateId' THEN "vRec"."docTemplateId" ELSE NULL END, CASE WHEN "pData" ? 'addressedTo' THEN "vRec"."addressedTo" ELSE NULL END, CASE WHEN "pData" ? 'letterDate' THEN "vRec"."letterDate" ELSE CURRENT_DATE END, CASE WHEN "pData" ? 'signatoryEmployeeId' THEN "vRec"."signatoryEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'language' THEN "vRec".language ELSE 'EN' END, CASE WHEN "pData" ? 'includeSalary' THEN "vRec"."includeSalary" ELSE FALSE END, CASE WHEN "pData" ? 'emailToEmployee' THEN "vRec"."emailToEmployee" ELSE FALSE END, CASE WHEN "pData" ? 'emailedAt' THEN "vRec"."emailedAt" ELSE NULL END, CASE WHEN "pData" ? 'pdfAttachmentId' THEN "vRec"."pdfAttachmentId" ELSE NULL END, CASE WHEN "pData" ? 'verificationCode' THEN "vRec"."verificationCode" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "HumanResources"."EmployeeLetters" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'EmployeeLetters: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "HumanResources"."EmployeeLetters" t
       SET "letterNo" = CASE WHEN "pData" ? 'letterNo' THEN "vRec"."letterNo" ELSE t."letterNo" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "letterType" = CASE WHEN "pData" ? 'letterType' THEN "vRec"."letterType" ELSE t."letterType" END,
           "docTemplateId" = CASE WHEN "pData" ? 'docTemplateId' THEN "vRec"."docTemplateId" ELSE t."docTemplateId" END,
           "addressedTo" = CASE WHEN "pData" ? 'addressedTo' THEN "vRec"."addressedTo" ELSE t."addressedTo" END,
           "letterDate" = CASE WHEN "pData" ? 'letterDate' THEN "vRec"."letterDate" ELSE t."letterDate" END,
           "signatoryEmployeeId" = CASE WHEN "pData" ? 'signatoryEmployeeId' THEN "vRec"."signatoryEmployeeId" ELSE t."signatoryEmployeeId" END,
           language = CASE WHEN "pData" ? 'language' THEN "vRec".language ELSE t.language END,
           "includeSalary" = CASE WHEN "pData" ? 'includeSalary' THEN "vRec"."includeSalary" ELSE t."includeSalary" END,
           "emailToEmployee" = CASE WHEN "pData" ? 'emailToEmployee' THEN "vRec"."emailToEmployee" ELSE t."emailToEmployee" END,
           "emailedAt" = CASE WHEN "pData" ? 'emailedAt' THEN "vRec"."emailedAt" ELSE t."emailedAt" END,
           "pdfAttachmentId" = CASE WHEN "pData" ? 'pdfAttachmentId' THEN "vRec"."pdfAttachmentId" ELSE t."pdfAttachmentId" END,
           "verificationCode" = CASE WHEN "pData" ? 'verificationCode' THEN "vRec"."verificationCode" ELSE t."verificationCode" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."EmployeeLetters" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'EmployeeLetters %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'EmployeeLetters % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."employeeLetterAddUpdate"(jsonb) IS 'Save (insert or update) one EmployeeLetters record.';

-- EmployeeLetters: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getEmployeeLetterInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('letterTypeLabel', "Lookups"."getLookupLabel"('EmployeeLetterType', t."letterType") ->> 'label', 'letterTypeTone', "Lookups"."getLookupLabel"('EmployeeLetterType', t."letterType") ->> 'tone', 'languageLabel', "Lookups"."getLookupLabel"('EnUrLanguage', t.language) ->> 'label', 'languageTone', "Lookups"."getLookupLabel"('EnUrLanguage', t.language) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('EmployeeLetterStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('EmployeeLetterStatus', t.status) ->> 'tone')
    FROM "HumanResources"."EmployeeLetters" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getEmployeeLetterInfo"(uuid) IS 'Read one EmployeeLetters record (getter for its screens).';

-- EmployeeLetters: Void (status -> VOID); allowed from DRAFT, ISSUED, SIGNED
CREATE OR REPLACE FUNCTION "HumanResources"."employeeLetterVoid"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "HumanResources"."EmployeeLetters";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."EmployeeLetters" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EmployeeLetters % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'VOID' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'ISSUED', 'SIGNED') THEN
    RAISE EXCEPTION 'EmployeeLetters %: cannot void from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"HumanResources"."employeeLetterVoidEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"HumanResources"."employeeLetterVoidEntries"') USING "pId";
  END IF;
  UPDATE "HumanResources"."EmployeeLetters" t SET status = 'VOID' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- ShiftRosters: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."shiftRosterEntryAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."ShiftRosters";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."ShiftRosters", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."ShiftRosters" ("tenantId", "employeeId", "rosterDate", "entryType", "shiftId", "isPublished", "publishedAt", remarks)
    VALUES ("vTenant", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'rosterDate' THEN "vRec"."rosterDate" ELSE NULL END, CASE WHEN "pData" ? 'entryType' THEN "vRec"."entryType" ELSE 'SHIFT' END, CASE WHEN "pData" ? 'shiftId' THEN "vRec"."shiftId" ELSE NULL END, CASE WHEN "pData" ? 'isPublished' THEN "vRec"."isPublished" ELSE FALSE END, CASE WHEN "pData" ? 'publishedAt' THEN "vRec"."publishedAt" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."ShiftRosters" t
       SET "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "rosterDate" = CASE WHEN "pData" ? 'rosterDate' THEN "vRec"."rosterDate" ELSE t."rosterDate" END,
           "entryType" = CASE WHEN "pData" ? 'entryType' THEN "vRec"."entryType" ELSE t."entryType" END,
           "shiftId" = CASE WHEN "pData" ? 'shiftId' THEN "vRec"."shiftId" ELSE t."shiftId" END,
           "isPublished" = CASE WHEN "pData" ? 'isPublished' THEN "vRec"."isPublished" ELSE t."isPublished" END,
           "publishedAt" = CASE WHEN "pData" ? 'publishedAt' THEN "vRec"."publishedAt" ELSE t."publishedAt" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."ShiftRosters" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ShiftRosters %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ShiftRosters % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."shiftRosterEntryAddUpdate"(jsonb) IS 'Save (insert or update) one ShiftRosters record.';

-- ShiftRosters: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getShiftRosterEntryInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('entryTypeLabel', "Lookups"."getLookupLabel"('ShiftRosterEntryType', t."entryType") ->> 'label', 'entryTypeTone', "Lookups"."getLookupLabel"('ShiftRosterEntryType', t."entryType") ->> 'tone')
    FROM "HumanResources"."ShiftRosters" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getShiftRosterEntryInfo"(uuid) IS 'Read one ShiftRosters record (getter for its screens).';

-- Holidays: insert (no "id") or update (with "id"); child arrays: branches
CREATE OR REPLACE FUNCTION "HumanResources"."holidayAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."Holidays";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1HolidayBranches" "HumanResources"."HolidayBranches";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."Holidays", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."Holidays" ("tenantId", name, "fromDate", "toDate", "holidayType", "isMoonDependent", "hijriNote", "eligibilityNote", "appliesToAllBranches", status, source, "notifyEss")
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'fromDate' THEN "vRec"."fromDate" ELSE NULL END, CASE WHEN "pData" ? 'toDate' THEN "vRec"."toDate" ELSE NULL END, CASE WHEN "pData" ? 'holidayType' THEN "vRec"."holidayType" ELSE NULL END, CASE WHEN "pData" ? 'isMoonDependent' THEN "vRec"."isMoonDependent" ELSE FALSE END, CASE WHEN "pData" ? 'hijriNote' THEN "vRec"."hijriNote" ELSE NULL END, CASE WHEN "pData" ? 'eligibilityNote' THEN "vRec"."eligibilityNote" ELSE NULL END, CASE WHEN "pData" ? 'appliesToAllBranches' THEN "vRec"."appliesToAllBranches" ELSE TRUE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'UPCOMING' END, CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE 'MANUAL' END, CASE WHEN "pData" ? 'notifyEss' THEN "vRec"."notifyEss" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."Holidays" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "fromDate" = CASE WHEN "pData" ? 'fromDate' THEN "vRec"."fromDate" ELSE t."fromDate" END,
           "toDate" = CASE WHEN "pData" ? 'toDate' THEN "vRec"."toDate" ELSE t."toDate" END,
           "holidayType" = CASE WHEN "pData" ? 'holidayType' THEN "vRec"."holidayType" ELSE t."holidayType" END,
           "isMoonDependent" = CASE WHEN "pData" ? 'isMoonDependent' THEN "vRec"."isMoonDependent" ELSE t."isMoonDependent" END,
           "hijriNote" = CASE WHEN "pData" ? 'hijriNote' THEN "vRec"."hijriNote" ELSE t."hijriNote" END,
           "eligibilityNote" = CASE WHEN "pData" ? 'eligibilityNote' THEN "vRec"."eligibilityNote" ELSE t."eligibilityNote" END,
           "appliesToAllBranches" = CASE WHEN "pData" ? 'appliesToAllBranches' THEN "vRec"."appliesToAllBranches" ELSE t."appliesToAllBranches" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           source = CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE t.source END,
           "notifyEss" = CASE WHEN "pData" ? 'notifyEss' THEN "vRec"."notifyEss" ELSE t."notifyEss" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."Holidays" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Holidays %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Holidays % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'branches' THEN
    -- branches: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "HumanResources"."HolidayBranches"
     WHERE "tenantId" = "vTenant" AND "holidayId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'branches') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'branches') WITH ORDINALITY t(x, n) LOOP
      "vC1HolidayBranches" := jsonb_populate_record(NULL::"HumanResources"."HolidayBranches", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "HumanResources"."HolidayBranches" t
           SET "branchId" = CASE WHEN "vE1" ? 'branchId' THEN "vC1HolidayBranches"."branchId" ELSE t."branchId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."holidayId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'HolidayBranches: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "HumanResources"."HolidayBranches" ("holidayId", "tenantId", "branchId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'branchId' THEN "vC1HolidayBranches"."branchId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."holidayAddUpdate"(jsonb) IS 'Save (insert or update) one Holidays record with its branches.';

-- Holidays: one record as JSON (camelCase keys), with lookup labels and branches
CREATE OR REPLACE FUNCTION "HumanResources"."getHolidayInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('holidayTypeLabel', "Lookups"."getLookupLabel"('HolidayType', t."holidayType") ->> 'label', 'holidayTypeTone', "Lookups"."getLookupLabel"('HolidayType', t."holidayType") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('HolidayStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('HolidayStatus', t.status) ->> 'tone', 'sourceLabel', "Lookups"."getLookupLabel"('HolidaySource', t.source) ->> 'label', 'sourceTone', "Lookups"."getLookupLabel"('HolidaySource', t.source) ->> 'tone') ||
         jsonb_build_object('branches', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "HumanResources"."HolidayBranches" c1 WHERE c1."holidayId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "HumanResources"."Holidays" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getHolidayInfo"(uuid) IS 'Read one Holidays record (getter for its screens).';

-- BiometricDevices: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."biometricDeviceAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."BiometricDevices";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."BiometricDevices", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."BiometricDevices" ("tenantId", code, "locationLabel", brand, model, "serialNo", "branchId", "connectionType", "ipAddress", port, "commKeySecret", timezone, "punchDirection", "syncIntervalMin", "firmwareVersion", status, "lastHeartbeatAt", "lastSyncAt", "usersEnrolled", "facesEnrolled", "fingersEnrolled", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'locationLabel' THEN "vRec"."locationLabel" ELSE NULL END, CASE WHEN "pData" ? 'brand' THEN "vRec".brand ELSE 'ZKTECO' END, CASE WHEN "pData" ? 'model' THEN "vRec".model ELSE NULL END, CASE WHEN "pData" ? 'serialNo' THEN "vRec"."serialNo" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'connectionType' THEN "vRec"."connectionType" ELSE 'ADMS_PUSH' END, CASE WHEN "pData" ? 'ipAddress' THEN "vRec"."ipAddress" ELSE NULL END, CASE WHEN "pData" ? 'port' THEN "vRec".port ELSE 4370 END, CASE WHEN "pData" ? 'commKeySecret' THEN "vRec"."commKeySecret" ELSE NULL END, CASE WHEN "pData" ? 'timezone' THEN "vRec".timezone ELSE 'Asia/Karachi' END, CASE WHEN "pData" ? 'punchDirection' THEN "vRec"."punchDirection" ELSE 'AUTO' END, CASE WHEN "pData" ? 'syncIntervalMin' THEN "vRec"."syncIntervalMin" ELSE 5 END, CASE WHEN "pData" ? 'firmwareVersion' THEN "vRec"."firmwareVersion" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'OFFLINE' END, CASE WHEN "pData" ? 'lastHeartbeatAt' THEN "vRec"."lastHeartbeatAt" ELSE NULL END, CASE WHEN "pData" ? 'lastSyncAt' THEN "vRec"."lastSyncAt" ELSE NULL END, CASE WHEN "pData" ? 'usersEnrolled' THEN "vRec"."usersEnrolled" ELSE 0 END, CASE WHEN "pData" ? 'facesEnrolled' THEN "vRec"."facesEnrolled" ELSE 0 END, CASE WHEN "pData" ? 'fingersEnrolled' THEN "vRec"."fingersEnrolled" ELSE 0 END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."BiometricDevices" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           "locationLabel" = CASE WHEN "pData" ? 'locationLabel' THEN "vRec"."locationLabel" ELSE t."locationLabel" END,
           brand = CASE WHEN "pData" ? 'brand' THEN "vRec".brand ELSE t.brand END,
           model = CASE WHEN "pData" ? 'model' THEN "vRec".model ELSE t.model END,
           "serialNo" = CASE WHEN "pData" ? 'serialNo' THEN "vRec"."serialNo" ELSE t."serialNo" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "connectionType" = CASE WHEN "pData" ? 'connectionType' THEN "vRec"."connectionType" ELSE t."connectionType" END,
           "ipAddress" = CASE WHEN "pData" ? 'ipAddress' THEN "vRec"."ipAddress" ELSE t."ipAddress" END,
           port = CASE WHEN "pData" ? 'port' THEN "vRec".port ELSE t.port END,
           "commKeySecret" = CASE WHEN "pData" ? 'commKeySecret' THEN "vRec"."commKeySecret" ELSE t."commKeySecret" END,
           timezone = CASE WHEN "pData" ? 'timezone' THEN "vRec".timezone ELSE t.timezone END,
           "punchDirection" = CASE WHEN "pData" ? 'punchDirection' THEN "vRec"."punchDirection" ELSE t."punchDirection" END,
           "syncIntervalMin" = CASE WHEN "pData" ? 'syncIntervalMin' THEN "vRec"."syncIntervalMin" ELSE t."syncIntervalMin" END,
           "firmwareVersion" = CASE WHEN "pData" ? 'firmwareVersion' THEN "vRec"."firmwareVersion" ELSE t."firmwareVersion" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "lastHeartbeatAt" = CASE WHEN "pData" ? 'lastHeartbeatAt' THEN "vRec"."lastHeartbeatAt" ELSE t."lastHeartbeatAt" END,
           "lastSyncAt" = CASE WHEN "pData" ? 'lastSyncAt' THEN "vRec"."lastSyncAt" ELSE t."lastSyncAt" END,
           "usersEnrolled" = CASE WHEN "pData" ? 'usersEnrolled' THEN "vRec"."usersEnrolled" ELSE t."usersEnrolled" END,
           "facesEnrolled" = CASE WHEN "pData" ? 'facesEnrolled' THEN "vRec"."facesEnrolled" ELSE t."facesEnrolled" END,
           "fingersEnrolled" = CASE WHEN "pData" ? 'fingersEnrolled' THEN "vRec"."fingersEnrolled" ELSE t."fingersEnrolled" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."BiometricDevices" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'BiometricDevices %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'BiometricDevices % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."biometricDeviceAddUpdate"(jsonb) IS 'Save (insert or update) one BiometricDevices record.';

-- BiometricDevices: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getBiometricDeviceInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t) - 'commKeySecret') ||
         jsonb_build_object('brandLabel', "Lookups"."getLookupLabel"('Brand', t.brand) ->> 'label', 'brandTone', "Lookups"."getLookupLabel"('Brand', t.brand) ->> 'tone', 'connectionTypeLabel', "Lookups"."getLookupLabel"('ConnectionType', t."connectionType") ->> 'label', 'connectionTypeTone', "Lookups"."getLookupLabel"('ConnectionType', t."connectionType") ->> 'tone', 'punchDirectionLabel', "Lookups"."getLookupLabel"('BiometricDevicePunchDirection', t."punchDirection") ->> 'label', 'punchDirectionTone', "Lookups"."getLookupLabel"('BiometricDevicePunchDirection', t."punchDirection") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('BiometricDeviceStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('BiometricDeviceStatus', t.status) ->> 'tone')
    FROM "HumanResources"."BiometricDevices" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getBiometricDeviceInfo"(uuid) IS 'Read one BiometricDevices record (getter for its screens).';

-- RegularisationRequests: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."regularisationRequestAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."RegularisationRequests";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."RegularisationRequests", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('REG', current_date, NULL);
    END IF;
    INSERT INTO "HumanResources"."RegularisationRequests" ("tenantId", "docNo", "employeeId", "requestType", "punchDirection", "attDate", "requestedIn", "requestedOut", reason, "attachmentId", "linkedDeviceId", channel, stage, "currentApproverEmployeeId", "approvalRequestId", "rejectionReason", "decisionComment", "markAbsentIfUnresolved")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'requestType' THEN "vRec"."requestType" ELSE NULL END, CASE WHEN "pData" ? 'punchDirection' THEN "vRec"."punchDirection" ELSE NULL END, CASE WHEN "pData" ? 'attDate' THEN "vRec"."attDate" ELSE NULL END, CASE WHEN "pData" ? 'requestedIn' THEN "vRec"."requestedIn" ELSE NULL END, CASE WHEN "pData" ? 'requestedOut' THEN "vRec"."requestedOut" ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE NULL END, CASE WHEN "pData" ? 'linkedDeviceId' THEN "vRec"."linkedDeviceId" ELSE NULL END, CASE WHEN "pData" ? 'channel' THEN "vRec".channel ELSE 'ESS_WEB' END, CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE 'LINE_MANAGER' END, CASE WHEN "pData" ? 'currentApproverEmployeeId' THEN "vRec"."currentApproverEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE NULL END, CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE NULL END, CASE WHEN "pData" ? 'decisionComment' THEN "vRec"."decisionComment" ELSE NULL END, CASE WHEN "pData" ? 'markAbsentIfUnresolved' THEN "vRec"."markAbsentIfUnresolved" ELSE FALSE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."RegularisationRequests" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "requestType" = CASE WHEN "pData" ? 'requestType' THEN "vRec"."requestType" ELSE t."requestType" END,
           "punchDirection" = CASE WHEN "pData" ? 'punchDirection' THEN "vRec"."punchDirection" ELSE t."punchDirection" END,
           "attDate" = CASE WHEN "pData" ? 'attDate' THEN "vRec"."attDate" ELSE t."attDate" END,
           "requestedIn" = CASE WHEN "pData" ? 'requestedIn' THEN "vRec"."requestedIn" ELSE t."requestedIn" END,
           "requestedOut" = CASE WHEN "pData" ? 'requestedOut' THEN "vRec"."requestedOut" ELSE t."requestedOut" END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           "attachmentId" = CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE t."attachmentId" END,
           "linkedDeviceId" = CASE WHEN "pData" ? 'linkedDeviceId' THEN "vRec"."linkedDeviceId" ELSE t."linkedDeviceId" END,
           channel = CASE WHEN "pData" ? 'channel' THEN "vRec".channel ELSE t.channel END,
           stage = CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE t.stage END,
           "currentApproverEmployeeId" = CASE WHEN "pData" ? 'currentApproverEmployeeId' THEN "vRec"."currentApproverEmployeeId" ELSE t."currentApproverEmployeeId" END,
           "approvalRequestId" = CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE t."approvalRequestId" END,
           "rejectionReason" = CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE t."rejectionReason" END,
           "decisionComment" = CASE WHEN "pData" ? 'decisionComment' THEN "vRec"."decisionComment" ELSE t."decisionComment" END,
           "markAbsentIfUnresolved" = CASE WHEN "pData" ? 'markAbsentIfUnresolved' THEN "vRec"."markAbsentIfUnresolved" ELSE t."markAbsentIfUnresolved" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."RegularisationRequests" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'RegularisationRequests %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'RegularisationRequests % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."regularisationRequestAddUpdate"(jsonb) IS 'Save (insert or update) one RegularisationRequests record.';

-- RegularisationRequests: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getRegularisationRequestInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('requestTypeLabel', "Lookups"."getLookupLabel"('RegularisationRequestType', t."requestType") ->> 'label', 'requestTypeTone', "Lookups"."getLookupLabel"('RegularisationRequestType', t."requestType") ->> 'tone', 'punchDirectionLabel', "Lookups"."getLookupLabel"('RegularisationRequestPunchDirection', t."punchDirection") ->> 'label', 'punchDirectionTone', "Lookups"."getLookupLabel"('RegularisationRequestPunchDirection', t."punchDirection") ->> 'tone', 'channelLabel', "Lookups"."getLookupLabel"('EssWebEssMobileHrChannel', t.channel) ->> 'label', 'channelTone', "Lookups"."getLookupLabel"('EssWebEssMobileHrChannel', t.channel) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ProfileChangeRequestStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ProfileChangeRequestStatus', t.status) ->> 'tone', 'stageLabel', "Lookups"."getLookupLabel"('RegularisationRequestStage', t.stage) ->> 'label', 'stageTone', "Lookups"."getLookupLabel"('RegularisationRequestStage', t.stage) ->> 'tone', 'rejectionReasonLabel', "Lookups"."getLookupLabel"('RegularisationRequestRejectionReason', t."rejectionReason") ->> 'label', 'rejectionReasonTone', "Lookups"."getLookupLabel"('RegularisationRequestRejectionReason', t."rejectionReason") ->> 'tone')
    FROM "HumanResources"."RegularisationRequests" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getRegularisationRequestInfo"(uuid) IS 'Read one RegularisationRequests record (getter for its screens).';

-- RegularisationRequests: Approve (status -> APPROVED); allowed from PENDING
CREATE OR REPLACE FUNCTION "HumanResources"."regularisationRequestApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "HumanResources"."RegularisationRequests";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."RegularisationRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RegularisationRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING') THEN
    RAISE EXCEPTION 'RegularisationRequests %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'RegularisationRequests: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"HumanResources"."regularisationRequestApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"HumanResources"."regularisationRequestApproveEntries"') USING "pId";
  END IF;
  UPDATE "HumanResources"."RegularisationRequests" t SET status = 'APPROVED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- OvertimePolicies: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."overtimePolicyAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."OvertimePolicies";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."OvertimePolicies", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."OvertimePolicies" ("tenantId", name, "statuteNote", "weekdayMultiplier", "weeklyOffMultiplier", "holidayMultiplier", "hourlyRateBasis", "minMinutes", "dailyCapHours", "monthlyCapHours", rounding, "eligibleUpToGradeId", "requiresPreApproval", "allowCompOff", "effectiveFrom", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE 'Standard' END, CASE WHEN "pData" ? 'statuteNote' THEN "vRec"."statuteNote" ELSE NULL END, CASE WHEN "pData" ? 'weekdayMultiplier' THEN "vRec"."weekdayMultiplier" ELSE 1.50 END, CASE WHEN "pData" ? 'weeklyOffMultiplier' THEN "vRec"."weeklyOffMultiplier" ELSE 2.00 END, CASE WHEN "pData" ? 'holidayMultiplier' THEN "vRec"."holidayMultiplier" ELSE 2.00 END, CASE WHEN "pData" ? 'hourlyRateBasis' THEN "vRec"."hourlyRateBasis" ELSE 'GROSS_26_8' END, CASE WHEN "pData" ? 'minMinutes' THEN "vRec"."minMinutes" ELSE 30 END, CASE WHEN "pData" ? 'dailyCapHours' THEN "vRec"."dailyCapHours" ELSE NULL END, CASE WHEN "pData" ? 'monthlyCapHours' THEN "vRec"."monthlyCapHours" ELSE NULL END, CASE WHEN "pData" ? 'rounding' THEN "vRec".rounding ELSE 'NEAREST_30' END, CASE WHEN "pData" ? 'eligibleUpToGradeId' THEN "vRec"."eligibleUpToGradeId" ELSE NULL END, CASE WHEN "pData" ? 'requiresPreApproval' THEN "vRec"."requiresPreApproval" ELSE TRUE END, CASE WHEN "pData" ? 'allowCompOff' THEN "vRec"."allowCompOff" ELSE TRUE END, CASE WHEN "pData" ? 'effectiveFrom' THEN "vRec"."effectiveFrom" ELSE CURRENT_DATE END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."OvertimePolicies" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "statuteNote" = CASE WHEN "pData" ? 'statuteNote' THEN "vRec"."statuteNote" ELSE t."statuteNote" END,
           "weekdayMultiplier" = CASE WHEN "pData" ? 'weekdayMultiplier' THEN "vRec"."weekdayMultiplier" ELSE t."weekdayMultiplier" END,
           "weeklyOffMultiplier" = CASE WHEN "pData" ? 'weeklyOffMultiplier' THEN "vRec"."weeklyOffMultiplier" ELSE t."weeklyOffMultiplier" END,
           "holidayMultiplier" = CASE WHEN "pData" ? 'holidayMultiplier' THEN "vRec"."holidayMultiplier" ELSE t."holidayMultiplier" END,
           "hourlyRateBasis" = CASE WHEN "pData" ? 'hourlyRateBasis' THEN "vRec"."hourlyRateBasis" ELSE t."hourlyRateBasis" END,
           "minMinutes" = CASE WHEN "pData" ? 'minMinutes' THEN "vRec"."minMinutes" ELSE t."minMinutes" END,
           "dailyCapHours" = CASE WHEN "pData" ? 'dailyCapHours' THEN "vRec"."dailyCapHours" ELSE t."dailyCapHours" END,
           "monthlyCapHours" = CASE WHEN "pData" ? 'monthlyCapHours' THEN "vRec"."monthlyCapHours" ELSE t."monthlyCapHours" END,
           rounding = CASE WHEN "pData" ? 'rounding' THEN "vRec".rounding ELSE t.rounding END,
           "eligibleUpToGradeId" = CASE WHEN "pData" ? 'eligibleUpToGradeId' THEN "vRec"."eligibleUpToGradeId" ELSE t."eligibleUpToGradeId" END,
           "requiresPreApproval" = CASE WHEN "pData" ? 'requiresPreApproval' THEN "vRec"."requiresPreApproval" ELSE t."requiresPreApproval" END,
           "allowCompOff" = CASE WHEN "pData" ? 'allowCompOff' THEN "vRec"."allowCompOff" ELSE t."allowCompOff" END,
           "effectiveFrom" = CASE WHEN "pData" ? 'effectiveFrom' THEN "vRec"."effectiveFrom" ELSE t."effectiveFrom" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."OvertimePolicies" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'OvertimePolicies %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'OvertimePolicies % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."overtimePolicyAddUpdate"(jsonb) IS 'Save (insert or update) one OvertimePolicies record.';

-- OvertimePolicies: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getOvertimePolicyInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('hourlyRateBasisLabel', "Lookups"."getLookupLabel"('HourlyRateBasis', t."hourlyRateBasis") ->> 'label', 'hourlyRateBasisTone', "Lookups"."getLookupLabel"('HourlyRateBasis', t."hourlyRateBasis") ->> 'tone', 'roundingLabel', "Lookups"."getLookupLabel"('Rounding', t.rounding) ->> 'label', 'roundingTone', "Lookups"."getLookupLabel"('Rounding', t.rounding) ->> 'tone')
    FROM "HumanResources"."OvertimePolicies" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getOvertimePolicyInfo"(uuid) IS 'Read one OvertimePolicies record (getter for its screens).';

-- OvertimeClaims: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."overtimeClaimAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."OvertimeClaims";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."OvertimeClaims", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('OT', current_date, NULL);
    END IF;
    INSERT INTO "HumanResources"."OvertimeClaims" ("tenantId", "docNo", "employeeId", "dateFrom", "dateTo", "dayType", "timeFrom", "timeTo", hours, multiplier, "hourlyRate", "isCompOff", amount, reason, source, "overtimePolicyId", "preApproved", "payrollMonth", "approverEmployeeId", "approvalRequestId", "rejectionReason", "payrollRunId", "pushedAt")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'dateFrom' THEN "vRec"."dateFrom" ELSE NULL END, CASE WHEN "pData" ? 'dateTo' THEN "vRec"."dateTo" ELSE NULL END, CASE WHEN "pData" ? 'dayType' THEN "vRec"."dayType" ELSE NULL END, CASE WHEN "pData" ? 'timeFrom' THEN "vRec"."timeFrom" ELSE NULL END, CASE WHEN "pData" ? 'timeTo' THEN "vRec"."timeTo" ELSE NULL END, CASE WHEN "pData" ? 'hours' THEN "vRec".hours ELSE NULL END, CASE WHEN "pData" ? 'multiplier' THEN "vRec".multiplier ELSE NULL END, CASE WHEN "pData" ? 'hourlyRate' THEN "vRec"."hourlyRate" ELSE NULL END, CASE WHEN "pData" ? 'isCompOff' THEN "vRec"."isCompOff" ELSE FALSE END, CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE 'HR' END, CASE WHEN "pData" ? 'overtimePolicyId' THEN "vRec"."overtimePolicyId" ELSE NULL END, CASE WHEN "pData" ? 'preApproved' THEN "vRec"."preApproved" ELSE FALSE END, CASE WHEN "pData" ? 'payrollMonth' THEN "vRec"."payrollMonth" ELSE NULL END, CASE WHEN "pData" ? 'approverEmployeeId' THEN "vRec"."approverEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE NULL END, CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE NULL END, CASE WHEN "pData" ? 'payrollRunId' THEN "vRec"."payrollRunId" ELSE NULL END, CASE WHEN "pData" ? 'pushedAt' THEN "vRec"."pushedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."OvertimeClaims" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "dateFrom" = CASE WHEN "pData" ? 'dateFrom' THEN "vRec"."dateFrom" ELSE t."dateFrom" END,
           "dateTo" = CASE WHEN "pData" ? 'dateTo' THEN "vRec"."dateTo" ELSE t."dateTo" END,
           "dayType" = CASE WHEN "pData" ? 'dayType' THEN "vRec"."dayType" ELSE t."dayType" END,
           "timeFrom" = CASE WHEN "pData" ? 'timeFrom' THEN "vRec"."timeFrom" ELSE t."timeFrom" END,
           "timeTo" = CASE WHEN "pData" ? 'timeTo' THEN "vRec"."timeTo" ELSE t."timeTo" END,
           hours = CASE WHEN "pData" ? 'hours' THEN "vRec".hours ELSE t.hours END,
           multiplier = CASE WHEN "pData" ? 'multiplier' THEN "vRec".multiplier ELSE t.multiplier END,
           "hourlyRate" = CASE WHEN "pData" ? 'hourlyRate' THEN "vRec"."hourlyRate" ELSE t."hourlyRate" END,
           "isCompOff" = CASE WHEN "pData" ? 'isCompOff' THEN "vRec"."isCompOff" ELSE t."isCompOff" END,
           amount = CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE t.amount END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           source = CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE t.source END,
           "overtimePolicyId" = CASE WHEN "pData" ? 'overtimePolicyId' THEN "vRec"."overtimePolicyId" ELSE t."overtimePolicyId" END,
           "preApproved" = CASE WHEN "pData" ? 'preApproved' THEN "vRec"."preApproved" ELSE t."preApproved" END,
           "payrollMonth" = CASE WHEN "pData" ? 'payrollMonth' THEN "vRec"."payrollMonth" ELSE t."payrollMonth" END,
           "approverEmployeeId" = CASE WHEN "pData" ? 'approverEmployeeId' THEN "vRec"."approverEmployeeId" ELSE t."approverEmployeeId" END,
           "approvalRequestId" = CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE t."approvalRequestId" END,
           "rejectionReason" = CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE t."rejectionReason" END,
           "payrollRunId" = CASE WHEN "pData" ? 'payrollRunId' THEN "vRec"."payrollRunId" ELSE t."payrollRunId" END,
           "pushedAt" = CASE WHEN "pData" ? 'pushedAt' THEN "vRec"."pushedAt" ELSE t."pushedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."OvertimeClaims" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'OvertimeClaims %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'OvertimeClaims % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."overtimeClaimAddUpdate"(jsonb) IS 'Save (insert or update) one OvertimeClaims record.';

-- OvertimeClaims: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getOvertimeClaimInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('dayTypeLabel', "Lookups"."getLookupLabel"('DayType', t."dayType") ->> 'label', 'dayTypeTone', "Lookups"."getLookupLabel"('DayType', t."dayType") ->> 'tone', 'sourceLabel', "Lookups"."getLookupLabel"('OvertimeClaimSource', t.source) ->> 'label', 'sourceTone', "Lookups"."getLookupLabel"('OvertimeClaimSource', t.source) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('OvertimeClaimStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('OvertimeClaimStatus', t.status) ->> 'tone')
    FROM "HumanResources"."OvertimeClaims" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getOvertimeClaimInfo"(uuid) IS 'Read one OvertimeClaims record (getter for its screens).';

-- OvertimeClaims: Approve (status -> APPROVED); allowed from PENDING
CREATE OR REPLACE FUNCTION "HumanResources"."overtimeClaimApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "HumanResources"."OvertimeClaims";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."OvertimeClaims" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OvertimeClaims % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING') THEN
    RAISE EXCEPTION 'OvertimeClaims %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'OvertimeClaims: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"HumanResources"."overtimeClaimApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"HumanResources"."overtimeClaimApproveEntries"') USING "pId";
  END IF;
  UPDATE "HumanResources"."OvertimeClaims" t SET status = 'APPROVED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- OvertimeClaims: Cancel (status -> CANCELLED); allowed from PENDING, APPROVED, REJECTED, PUSHED
CREATE OR REPLACE FUNCTION "HumanResources"."overtimeClaimCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "HumanResources"."OvertimeClaims";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."OvertimeClaims" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OvertimeClaims % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING', 'APPROVED', 'REJECTED', 'PUSHED') THEN
    RAISE EXCEPTION 'OvertimeClaims %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"HumanResources"."overtimeClaimCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"HumanResources"."overtimeClaimCancelEntries"') USING "pId";
  END IF;
  UPDATE "HumanResources"."OvertimeClaims" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- LeaveTypes: insert (no "id") or update (with "id"); child arrays: eligibilityRules
CREATE OR REPLACE FUNCTION "HumanResources"."leaveTypeAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."LeaveTypes";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1LeaveEligibilityRules" "HumanResources"."LeaveEligibilityRules";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."LeaveTypes", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."LeaveTypes" ("tenantId", code, name, "seedLeaveTypeId", category, colour, "isPaid", "daysPerYear", unit, description, "statuteNote", "accrualMethod", "accrualAmount", "prorateNewJoiners", "carryForwardMode", "carryForwardMax", "accumulationCap", "carryExpiryMonths", "encashmentMode", "encashMaxDays", "encashBasis", "deductionBasis", "sandwichRule", "allowHalfDay", "allowNegative", "blockInPayrollLock", "attachmentRequired", "attachmentAfterDays", "backdateDays", "minNoticeDays", "maxConsecutiveDays", "maxPerMonth", "maxTimesInService", "applyWindowDays", "compOffExpiryDays", gender, "employmentTypes", "availableAfter", "probationRule", "approvalWorkflow", "hrApprovalAboveDays", "sortOrder", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'seedLeaveTypeId' THEN "vRec"."seedLeaveTypeId" ELSE NULL END, CASE WHEN "pData" ? 'category' THEN "vRec".category ELSE NULL END, CASE WHEN "pData" ? 'colour' THEN "vRec".colour ELSE 'GREEN' END, CASE WHEN "pData" ? 'isPaid' THEN "vRec"."isPaid" ELSE TRUE END, CASE WHEN "pData" ? 'daysPerYear' THEN "vRec"."daysPerYear" ELSE 0 END, CASE WHEN "pData" ? 'unit' THEN "vRec".unit ELSE 'DAYS' END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'statuteNote' THEN "vRec"."statuteNote" ELSE NULL END, CASE WHEN "pData" ? 'accrualMethod' THEN "vRec"."accrualMethod" ELSE 'UPFRONT' END, CASE WHEN "pData" ? 'accrualAmount' THEN "vRec"."accrualAmount" ELSE NULL END, CASE WHEN "pData" ? 'prorateNewJoiners' THEN "vRec"."prorateNewJoiners" ELSE TRUE END, CASE WHEN "pData" ? 'carryForwardMode' THEN "vRec"."carryForwardMode" ELSE 'NONE' END, CASE WHEN "pData" ? 'carryForwardMax' THEN "vRec"."carryForwardMax" ELSE NULL END, CASE WHEN "pData" ? 'accumulationCap' THEN "vRec"."accumulationCap" ELSE NULL END, CASE WHEN "pData" ? 'carryExpiryMonths' THEN "vRec"."carryExpiryMonths" ELSE NULL END, CASE WHEN "pData" ? 'encashmentMode' THEN "vRec"."encashmentMode" ELSE 'NOT_ALLOWED' END, CASE WHEN "pData" ? 'encashMaxDays' THEN "vRec"."encashMaxDays" ELSE NULL END, CASE WHEN "pData" ? 'encashBasis' THEN "vRec"."encashBasis" ELSE NULL END, CASE WHEN "pData" ? 'deductionBasis' THEN "vRec"."deductionBasis" ELSE NULL END, CASE WHEN "pData" ? 'sandwichRule' THEN "vRec"."sandwichRule" ELSE FALSE END, CASE WHEN "pData" ? 'allowHalfDay' THEN "vRec"."allowHalfDay" ELSE TRUE END, CASE WHEN "pData" ? 'allowNegative' THEN "vRec"."allowNegative" ELSE FALSE END, CASE WHEN "pData" ? 'blockInPayrollLock' THEN "vRec"."blockInPayrollLock" ELSE FALSE END, CASE WHEN "pData" ? 'attachmentRequired' THEN "vRec"."attachmentRequired" ELSE FALSE END, CASE WHEN "pData" ? 'attachmentAfterDays' THEN "vRec"."attachmentAfterDays" ELSE NULL END, CASE WHEN "pData" ? 'backdateDays' THEN "vRec"."backdateDays" ELSE NULL END, CASE WHEN "pData" ? 'minNoticeDays' THEN "vRec"."minNoticeDays" ELSE NULL END, CASE WHEN "pData" ? 'maxConsecutiveDays' THEN "vRec"."maxConsecutiveDays" ELSE NULL END, CASE WHEN "pData" ? 'maxPerMonth' THEN "vRec"."maxPerMonth" ELSE NULL END, CASE WHEN "pData" ? 'maxTimesInService' THEN "vRec"."maxTimesInService" ELSE NULL END, CASE WHEN "pData" ? 'applyWindowDays' THEN "vRec"."applyWindowDays" ELSE NULL END, CASE WHEN "pData" ? 'compOffExpiryDays' THEN "vRec"."compOffExpiryDays" ELSE NULL END, CASE WHEN "pData" ? 'gender' THEN "vRec".gender ELSE 'ALL' END, CASE WHEN "pData" ? 'employmentTypes' THEN "vRec"."employmentTypes" ELSE CAST(ARRAY['PERMANENT', 'CONTRACT'] AS text[]) END, CASE WHEN "pData" ? 'availableAfter' THEN "vRec"."availableAfter" ELSE 'JOINING' END, CASE WHEN "pData" ? 'probationRule' THEN "vRec"."probationRule" ELSE 'ALLOWED' END, CASE WHEN "pData" ? 'approvalWorkflow' THEN "vRec"."approvalWorkflow" ELSE 'MANAGER_HR' END, CASE WHEN "pData" ? 'hrApprovalAboveDays' THEN "vRec"."hrApprovalAboveDays" ELSE NULL END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."LeaveTypes" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "seedLeaveTypeId" = CASE WHEN "pData" ? 'seedLeaveTypeId' THEN "vRec"."seedLeaveTypeId" ELSE t."seedLeaveTypeId" END,
           category = CASE WHEN "pData" ? 'category' THEN "vRec".category ELSE t.category END,
           colour = CASE WHEN "pData" ? 'colour' THEN "vRec".colour ELSE t.colour END,
           "isPaid" = CASE WHEN "pData" ? 'isPaid' THEN "vRec"."isPaid" ELSE t."isPaid" END,
           "daysPerYear" = CASE WHEN "pData" ? 'daysPerYear' THEN "vRec"."daysPerYear" ELSE t."daysPerYear" END,
           unit = CASE WHEN "pData" ? 'unit' THEN "vRec".unit ELSE t.unit END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "statuteNote" = CASE WHEN "pData" ? 'statuteNote' THEN "vRec"."statuteNote" ELSE t."statuteNote" END,
           "accrualMethod" = CASE WHEN "pData" ? 'accrualMethod' THEN "vRec"."accrualMethod" ELSE t."accrualMethod" END,
           "accrualAmount" = CASE WHEN "pData" ? 'accrualAmount' THEN "vRec"."accrualAmount" ELSE t."accrualAmount" END,
           "prorateNewJoiners" = CASE WHEN "pData" ? 'prorateNewJoiners' THEN "vRec"."prorateNewJoiners" ELSE t."prorateNewJoiners" END,
           "carryForwardMode" = CASE WHEN "pData" ? 'carryForwardMode' THEN "vRec"."carryForwardMode" ELSE t."carryForwardMode" END,
           "carryForwardMax" = CASE WHEN "pData" ? 'carryForwardMax' THEN "vRec"."carryForwardMax" ELSE t."carryForwardMax" END,
           "accumulationCap" = CASE WHEN "pData" ? 'accumulationCap' THEN "vRec"."accumulationCap" ELSE t."accumulationCap" END,
           "carryExpiryMonths" = CASE WHEN "pData" ? 'carryExpiryMonths' THEN "vRec"."carryExpiryMonths" ELSE t."carryExpiryMonths" END,
           "encashmentMode" = CASE WHEN "pData" ? 'encashmentMode' THEN "vRec"."encashmentMode" ELSE t."encashmentMode" END,
           "encashMaxDays" = CASE WHEN "pData" ? 'encashMaxDays' THEN "vRec"."encashMaxDays" ELSE t."encashMaxDays" END,
           "encashBasis" = CASE WHEN "pData" ? 'encashBasis' THEN "vRec"."encashBasis" ELSE t."encashBasis" END,
           "deductionBasis" = CASE WHEN "pData" ? 'deductionBasis' THEN "vRec"."deductionBasis" ELSE t."deductionBasis" END,
           "sandwichRule" = CASE WHEN "pData" ? 'sandwichRule' THEN "vRec"."sandwichRule" ELSE t."sandwichRule" END,
           "allowHalfDay" = CASE WHEN "pData" ? 'allowHalfDay' THEN "vRec"."allowHalfDay" ELSE t."allowHalfDay" END,
           "allowNegative" = CASE WHEN "pData" ? 'allowNegative' THEN "vRec"."allowNegative" ELSE t."allowNegative" END,
           "blockInPayrollLock" = CASE WHEN "pData" ? 'blockInPayrollLock' THEN "vRec"."blockInPayrollLock" ELSE t."blockInPayrollLock" END,
           "attachmentRequired" = CASE WHEN "pData" ? 'attachmentRequired' THEN "vRec"."attachmentRequired" ELSE t."attachmentRequired" END,
           "attachmentAfterDays" = CASE WHEN "pData" ? 'attachmentAfterDays' THEN "vRec"."attachmentAfterDays" ELSE t."attachmentAfterDays" END,
           "backdateDays" = CASE WHEN "pData" ? 'backdateDays' THEN "vRec"."backdateDays" ELSE t."backdateDays" END,
           "minNoticeDays" = CASE WHEN "pData" ? 'minNoticeDays' THEN "vRec"."minNoticeDays" ELSE t."minNoticeDays" END,
           "maxConsecutiveDays" = CASE WHEN "pData" ? 'maxConsecutiveDays' THEN "vRec"."maxConsecutiveDays" ELSE t."maxConsecutiveDays" END,
           "maxPerMonth" = CASE WHEN "pData" ? 'maxPerMonth' THEN "vRec"."maxPerMonth" ELSE t."maxPerMonth" END,
           "maxTimesInService" = CASE WHEN "pData" ? 'maxTimesInService' THEN "vRec"."maxTimesInService" ELSE t."maxTimesInService" END,
           "applyWindowDays" = CASE WHEN "pData" ? 'applyWindowDays' THEN "vRec"."applyWindowDays" ELSE t."applyWindowDays" END,
           "compOffExpiryDays" = CASE WHEN "pData" ? 'compOffExpiryDays' THEN "vRec"."compOffExpiryDays" ELSE t."compOffExpiryDays" END,
           gender = CASE WHEN "pData" ? 'gender' THEN "vRec".gender ELSE t.gender END,
           "employmentTypes" = CASE WHEN "pData" ? 'employmentTypes' THEN "vRec"."employmentTypes" ELSE t."employmentTypes" END,
           "availableAfter" = CASE WHEN "pData" ? 'availableAfter' THEN "vRec"."availableAfter" ELSE t."availableAfter" END,
           "probationRule" = CASE WHEN "pData" ? 'probationRule' THEN "vRec"."probationRule" ELSE t."probationRule" END,
           "approvalWorkflow" = CASE WHEN "pData" ? 'approvalWorkflow' THEN "vRec"."approvalWorkflow" ELSE t."approvalWorkflow" END,
           "hrApprovalAboveDays" = CASE WHEN "pData" ? 'hrApprovalAboveDays' THEN "vRec"."hrApprovalAboveDays" ELSE t."hrApprovalAboveDays" END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."LeaveTypes" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'LeaveTypes %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'LeaveTypes % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'eligibilityRules' THEN
    -- eligibilityRules: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "HumanResources"."LeaveEligibilityRules"
     WHERE "tenantId" = "vTenant" AND "leaveTypeId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'eligibilityRules') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'eligibilityRules') WITH ORDINALITY t(x, n) LOOP
      "vC1LeaveEligibilityRules" := jsonb_populate_record(NULL::"HumanResources"."LeaveEligibilityRules", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "HumanResources"."LeaveEligibilityRules" t
           SET scope = CASE WHEN "vE1" ? 'scope' THEN "vC1LeaveEligibilityRules".scope ELSE t.scope END,
               "branchId" = CASE WHEN "vE1" ? 'branchId' THEN "vC1LeaveEligibilityRules"."branchId" ELSE t."branchId" END,
               "gradeId" = CASE WHEN "vE1" ? 'gradeId' THEN "vC1LeaveEligibilityRules"."gradeId" ELSE t."gradeId" END,
               "isIncluded" = CASE WHEN "vE1" ? 'isIncluded' THEN "vC1LeaveEligibilityRules"."isIncluded" ELSE t."isIncluded" END,
               "daysOverride" = CASE WHEN "vE1" ? 'daysOverride' THEN "vC1LeaveEligibilityRules"."daysOverride" ELSE t."daysOverride" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."leaveTypeId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'LeaveEligibilityRules: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "HumanResources"."LeaveEligibilityRules" ("leaveTypeId", "tenantId", scope, "branchId", "gradeId", "isIncluded", "daysOverride")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'scope' THEN "vC1LeaveEligibilityRules".scope ELSE NULL END, CASE WHEN "vE1" ? 'branchId' THEN "vC1LeaveEligibilityRules"."branchId" ELSE NULL END, CASE WHEN "vE1" ? 'gradeId' THEN "vC1LeaveEligibilityRules"."gradeId" ELSE NULL END, CASE WHEN "vE1" ? 'isIncluded' THEN "vC1LeaveEligibilityRules"."isIncluded" ELSE TRUE END, CASE WHEN "vE1" ? 'daysOverride' THEN "vC1LeaveEligibilityRules"."daysOverride" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."leaveTypeAddUpdate"(jsonb) IS 'Save (insert or update) one LeaveTypes record with its eligibilityRules.';

-- LeaveTypes: one record as JSON (camelCase keys), with lookup labels and eligibilityRules
CREATE OR REPLACE FUNCTION "HumanResources"."getLeaveTypeInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('categoryLabel', "Lookups"."getLookupLabel"('LeaveTypeCategory', t.category) ->> 'label', 'categoryTone', "Lookups"."getLookupLabel"('LeaveTypeCategory', t.category) ->> 'tone', 'colourLabel', "Lookups"."getLookupLabel"('LeaveTypeColour', t.colour) ->> 'label', 'colourTone', "Lookups"."getLookupLabel"('LeaveTypeColour', t.colour) ->> 'tone', 'unitLabel', "Lookups"."getLookupLabel"('LeaveTypeUnit', t.unit) ->> 'label', 'unitTone', "Lookups"."getLookupLabel"('LeaveTypeUnit', t.unit) ->> 'tone', 'accrualMethodLabel', "Lookups"."getLookupLabel"('AccrualMethod', t."accrualMethod") ->> 'label', 'accrualMethodTone', "Lookups"."getLookupLabel"('AccrualMethod', t."accrualMethod") ->> 'tone', 'carryForwardModeLabel', "Lookups"."getLookupLabel"('CarryForwardMode', t."carryForwardMode") ->> 'label', 'carryForwardModeTone', "Lookups"."getLookupLabel"('CarryForwardMode', t."carryForwardMode") ->> 'tone', 'encashmentModeLabel', "Lookups"."getLookupLabel"('EncashmentMode', t."encashmentMode") ->> 'label', 'encashmentModeTone', "Lookups"."getLookupLabel"('EncashmentMode', t."encashmentMode") ->> 'tone', 'encashBasisLabel', "Lookups"."getLookupLabel"('EncashBasis', t."encashBasis") ->> 'label', 'encashBasisTone', "Lookups"."getLookupLabel"('EncashBasis', t."encashBasis") ->> 'tone', 'deductionBasisLabel', "Lookups"."getLookupLabel"('DeductionBasis', t."deductionBasis") ->> 'label', 'deductionBasisTone', "Lookups"."getLookupLabel"('DeductionBasis', t."deductionBasis") ->> 'tone', 'genderLabel', "Lookups"."getLookupLabel"('LeaveTypeGender', t.gender) ->> 'label', 'genderTone', "Lookups"."getLookupLabel"('LeaveTypeGender', t.gender) ->> 'tone', 'availableAfterLabel', "Lookups"."getLookupLabel"('AvailableAfter', t."availableAfter") ->> 'label', 'availableAfterTone', "Lookups"."getLookupLabel"('AvailableAfter', t."availableAfter") ->> 'tone', 'probationRuleLabel', "Lookups"."getLookupLabel"('ProbationRule', t."probationRule") ->> 'label', 'probationRuleTone', "Lookups"."getLookupLabel"('ProbationRule', t."probationRule") ->> 'tone', 'approvalWorkflowLabel', "Lookups"."getLookupLabel"('ApprovalWorkflow', t."approvalWorkflow") ->> 'label', 'approvalWorkflowTone', "Lookups"."getLookupLabel"('ApprovalWorkflow', t."approvalWorkflow") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone') ||
         jsonb_build_object('eligibilityRules', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "HumanResources"."LeaveEligibilityRules" c1 WHERE c1."leaveTypeId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "HumanResources"."LeaveTypes" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getLeaveTypeInfo"(uuid) IS 'Read one LeaveTypes record (getter for its screens).';

-- LeaveYearEndClosings: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."leaveYearEndClosingAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."LeaveYearEndClosings";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."LeaveYearEndClosings", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."LeaveYearEndClosings" ("tenantId", "closingYearStart", "openingYearStart", "encashmentTarget", "payrollRunId", "employeesCount", "daysCarried", "daysEncashed", "daysLapsed", "encashAmount", "emailStatements", "completedAt", "completedByUserId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'closingYearStart' THEN "vRec"."closingYearStart" ELSE NULL END, CASE WHEN "pData" ? 'openingYearStart' THEN "vRec"."openingYearStart" ELSE NULL END, CASE WHEN "pData" ? 'encashmentTarget' THEN "vRec"."encashmentTarget" ELSE 'NEXT_PAYROLL' END, CASE WHEN "pData" ? 'payrollRunId' THEN "vRec"."payrollRunId" ELSE NULL END, CASE WHEN "pData" ? 'employeesCount' THEN "vRec"."employeesCount" ELSE NULL END, CASE WHEN "pData" ? 'daysCarried' THEN "vRec"."daysCarried" ELSE 0 END, CASE WHEN "pData" ? 'daysEncashed' THEN "vRec"."daysEncashed" ELSE 0 END, CASE WHEN "pData" ? 'daysLapsed' THEN "vRec"."daysLapsed" ELSE 0 END, CASE WHEN "pData" ? 'encashAmount' THEN "vRec"."encashAmount" ELSE 0 END, CASE WHEN "pData" ? 'emailStatements' THEN "vRec"."emailStatements" ELSE TRUE END, CASE WHEN "pData" ? 'completedAt' THEN "vRec"."completedAt" ELSE NULL END, CASE WHEN "pData" ? 'completedByUserId' THEN "vRec"."completedByUserId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "HumanResources"."LeaveYearEndClosings" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'LeaveYearEndClosings: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "HumanResources"."LeaveYearEndClosings" t
       SET "closingYearStart" = CASE WHEN "pData" ? 'closingYearStart' THEN "vRec"."closingYearStart" ELSE t."closingYearStart" END,
           "openingYearStart" = CASE WHEN "pData" ? 'openingYearStart' THEN "vRec"."openingYearStart" ELSE t."openingYearStart" END,
           "encashmentTarget" = CASE WHEN "pData" ? 'encashmentTarget' THEN "vRec"."encashmentTarget" ELSE t."encashmentTarget" END,
           "payrollRunId" = CASE WHEN "pData" ? 'payrollRunId' THEN "vRec"."payrollRunId" ELSE t."payrollRunId" END,
           "employeesCount" = CASE WHEN "pData" ? 'employeesCount' THEN "vRec"."employeesCount" ELSE t."employeesCount" END,
           "daysCarried" = CASE WHEN "pData" ? 'daysCarried' THEN "vRec"."daysCarried" ELSE t."daysCarried" END,
           "daysEncashed" = CASE WHEN "pData" ? 'daysEncashed' THEN "vRec"."daysEncashed" ELSE t."daysEncashed" END,
           "daysLapsed" = CASE WHEN "pData" ? 'daysLapsed' THEN "vRec"."daysLapsed" ELSE t."daysLapsed" END,
           "encashAmount" = CASE WHEN "pData" ? 'encashAmount' THEN "vRec"."encashAmount" ELSE t."encashAmount" END,
           "emailStatements" = CASE WHEN "pData" ? 'emailStatements' THEN "vRec"."emailStatements" ELSE t."emailStatements" END,
           "completedAt" = CASE WHEN "pData" ? 'completedAt' THEN "vRec"."completedAt" ELSE t."completedAt" END,
           "completedByUserId" = CASE WHEN "pData" ? 'completedByUserId' THEN "vRec"."completedByUserId" ELSE t."completedByUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."LeaveYearEndClosings" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'LeaveYearEndClosings %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'LeaveYearEndClosings % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."leaveYearEndClosingAddUpdate"(jsonb) IS 'Save (insert or update) one LeaveYearEndClosings record.';

-- LeaveYearEndClosings: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getLeaveYearEndClosingInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('encashmentTargetLabel', "Lookups"."getLookupLabel"('EncashmentTarget', t."encashmentTarget") ->> 'label', 'encashmentTargetTone', "Lookups"."getLookupLabel"('EncashmentTarget', t."encashmentTarget") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('LeaveYearEndClosingStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('LeaveYearEndClosingStatus', t.status) ->> 'tone')
    FROM "HumanResources"."LeaveYearEndClosings" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getLeaveYearEndClosingInfo"(uuid) IS 'Read one LeaveYearEndClosings record (getter for its screens).';

-- LeaveYearEndClosings: Reverse (status -> REVERSED); allowed from DRAFT, COMPLETED
CREATE OR REPLACE FUNCTION "HumanResources"."leaveYearEndClosingReverse"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "HumanResources"."LeaveYearEndClosings";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."LeaveYearEndClosings" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LeaveYearEndClosings % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'REVERSED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'COMPLETED') THEN
    RAISE EXCEPTION 'LeaveYearEndClosings %: cannot reverse from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"HumanResources"."leaveYearEndClosingReverseEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"HumanResources"."leaveYearEndClosingReverseEntries"') USING "pId";
  END IF;
  UPDATE "HumanResources"."LeaveYearEndClosings" t SET status = 'REVERSED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- LeaveRequests: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."leaveRequestAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."LeaveRequests";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."LeaveRequests", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('LV', current_date, NULL);
    END IF;
    INSERT INTO "HumanResources"."LeaveRequests" ("tenantId", "docNo", "employeeId", "leaveTypeId", duration, "fromDate", "toDate", days, reason, "attachmentId", "handoverEmployeeId", "contactDuringLeave", "balanceBefore", "balanceAfter", channel, "appliedOnBehalf", stage, "currentApproverEmployeeId", "approvalRequestId", "rejectionReason", "decisionComment", "suggestAlternative")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'leaveTypeId' THEN "vRec"."leaveTypeId" ELSE NULL END, CASE WHEN "pData" ? 'duration' THEN "vRec".duration ELSE 'FULL' END, CASE WHEN "pData" ? 'fromDate' THEN "vRec"."fromDate" ELSE NULL END, CASE WHEN "pData" ? 'toDate' THEN "vRec"."toDate" ELSE NULL END, CASE WHEN "pData" ? 'days' THEN "vRec".days ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE NULL END, CASE WHEN "pData" ? 'handoverEmployeeId' THEN "vRec"."handoverEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'contactDuringLeave' THEN "vRec"."contactDuringLeave" ELSE NULL END, CASE WHEN "pData" ? 'balanceBefore' THEN "vRec"."balanceBefore" ELSE NULL END, CASE WHEN "pData" ? 'balanceAfter' THEN "vRec"."balanceAfter" ELSE NULL END, CASE WHEN "pData" ? 'channel' THEN "vRec".channel ELSE 'ESS_WEB' END, CASE WHEN "pData" ? 'appliedOnBehalf' THEN "vRec"."appliedOnBehalf" ELSE FALSE END, CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE 'LINE_MANAGER' END, CASE WHEN "pData" ? 'currentApproverEmployeeId' THEN "vRec"."currentApproverEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE NULL END, CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE NULL END, CASE WHEN "pData" ? 'decisionComment' THEN "vRec"."decisionComment" ELSE NULL END, CASE WHEN "pData" ? 'suggestAlternative' THEN "vRec"."suggestAlternative" ELSE FALSE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."LeaveRequests" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "leaveTypeId" = CASE WHEN "pData" ? 'leaveTypeId' THEN "vRec"."leaveTypeId" ELSE t."leaveTypeId" END,
           duration = CASE WHEN "pData" ? 'duration' THEN "vRec".duration ELSE t.duration END,
           "fromDate" = CASE WHEN "pData" ? 'fromDate' THEN "vRec"."fromDate" ELSE t."fromDate" END,
           "toDate" = CASE WHEN "pData" ? 'toDate' THEN "vRec"."toDate" ELSE t."toDate" END,
           days = CASE WHEN "pData" ? 'days' THEN "vRec".days ELSE t.days END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           "attachmentId" = CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE t."attachmentId" END,
           "handoverEmployeeId" = CASE WHEN "pData" ? 'handoverEmployeeId' THEN "vRec"."handoverEmployeeId" ELSE t."handoverEmployeeId" END,
           "contactDuringLeave" = CASE WHEN "pData" ? 'contactDuringLeave' THEN "vRec"."contactDuringLeave" ELSE t."contactDuringLeave" END,
           "balanceBefore" = CASE WHEN "pData" ? 'balanceBefore' THEN "vRec"."balanceBefore" ELSE t."balanceBefore" END,
           "balanceAfter" = CASE WHEN "pData" ? 'balanceAfter' THEN "vRec"."balanceAfter" ELSE t."balanceAfter" END,
           channel = CASE WHEN "pData" ? 'channel' THEN "vRec".channel ELSE t.channel END,
           "appliedOnBehalf" = CASE WHEN "pData" ? 'appliedOnBehalf' THEN "vRec"."appliedOnBehalf" ELSE t."appliedOnBehalf" END,
           stage = CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE t.stage END,
           "currentApproverEmployeeId" = CASE WHEN "pData" ? 'currentApproverEmployeeId' THEN "vRec"."currentApproverEmployeeId" ELSE t."currentApproverEmployeeId" END,
           "approvalRequestId" = CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE t."approvalRequestId" END,
           "rejectionReason" = CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE t."rejectionReason" END,
           "decisionComment" = CASE WHEN "pData" ? 'decisionComment' THEN "vRec"."decisionComment" ELSE t."decisionComment" END,
           "suggestAlternative" = CASE WHEN "pData" ? 'suggestAlternative' THEN "vRec"."suggestAlternative" ELSE t."suggestAlternative" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."LeaveRequests" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'LeaveRequests %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'LeaveRequests % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."leaveRequestAddUpdate"(jsonb) IS 'Save (insert or update) one LeaveRequests record.';

-- LeaveRequests: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getLeaveRequestInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('durationLabel', "Lookups"."getLookupLabel"('LeaveRequestDuration', t.duration) ->> 'label', 'durationTone', "Lookups"."getLookupLabel"('LeaveRequestDuration', t.duration) ->> 'tone', 'channelLabel', "Lookups"."getLookupLabel"('EssWebEssMobileHrChannel', t.channel) ->> 'label', 'channelTone', "Lookups"."getLookupLabel"('EssWebEssMobileHrChannel', t.channel) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('LeaveRequestStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('LeaveRequestStatus', t.status) ->> 'tone', 'stageLabel', "Lookups"."getLookupLabel"('LeaveRequestStage', t.stage) ->> 'label', 'stageTone', "Lookups"."getLookupLabel"('LeaveRequestStage', t.stage) ->> 'tone', 'rejectionReasonLabel', "Lookups"."getLookupLabel"('LeaveRequestRejectionReason', t."rejectionReason") ->> 'label', 'rejectionReasonTone', "Lookups"."getLookupLabel"('LeaveRequestRejectionReason', t."rejectionReason") ->> 'tone')
    FROM "HumanResources"."LeaveRequests" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getLeaveRequestInfo"(uuid) IS 'Read one LeaveRequests record (getter for its screens).';

-- LeaveRequests: Approve (status -> APPROVED); allowed from PENDING
CREATE OR REPLACE FUNCTION "HumanResources"."leaveRequestApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "HumanResources"."LeaveRequests";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."LeaveRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LeaveRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING') THEN
    RAISE EXCEPTION 'LeaveRequests %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'LeaveRequests: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"HumanResources"."leaveRequestApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"HumanResources"."leaveRequestApproveEntries"') USING "pId";
  END IF;
  UPDATE "HumanResources"."LeaveRequests" t SET status = 'APPROVED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- LeaveRequests: Cancel (status -> CANCELLED); allowed from PENDING, APPROVED, REJECTED
CREATE OR REPLACE FUNCTION "HumanResources"."leaveRequestCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "HumanResources"."LeaveRequests";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."LeaveRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LeaveRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING', 'APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'LeaveRequests %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"HumanResources"."leaveRequestCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"HumanResources"."leaveRequestCancelEntries"') USING "pId";
  END IF;
  UPDATE "HumanResources"."LeaveRequests" t SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = "pReason" WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- OnboardingTemplates: insert (no "id") or update (with "id"); child arrays: tasks
CREATE OR REPLACE FUNCTION "HumanResources"."onboardingTemplateAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."OnboardingTemplates";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1OnboardingTemplateTasks" "HumanResources"."OnboardingTemplateTasks";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."OnboardingTemplates", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."OnboardingTemplates" ("tenantId", name, track, "isDefault", "isActive")
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'track' THEN "vRec".track ELSE 'NEW_JOINER' END, CASE WHEN "pData" ? 'isDefault' THEN "vRec"."isDefault" ELSE FALSE END, CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."OnboardingTemplates" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           track = CASE WHEN "pData" ? 'track' THEN "vRec".track ELSE t.track END,
           "isDefault" = CASE WHEN "pData" ? 'isDefault' THEN "vRec"."isDefault" ELSE t."isDefault" END,
           "isActive" = CASE WHEN "pData" ? 'isActive' THEN "vRec"."isActive" ELSE t."isActive" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."OnboardingTemplates" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'OnboardingTemplates %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'OnboardingTemplates % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'tasks' THEN
    -- tasks: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "HumanResources"."OnboardingTemplateTasks"
     WHERE "tenantId" = "vTenant" AND "templateId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'tasks') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'tasks') WITH ORDINALITY t(x, n) LOOP
      "vC1OnboardingTemplateTasks" := jsonb_populate_record(NULL::"HumanResources"."OnboardingTemplateTasks", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "HumanResources"."OnboardingTemplateTasks" t
           SET "taskGroup" = CASE WHEN "vE1" ? 'taskGroup' THEN "vC1OnboardingTemplateTasks"."taskGroup" ELSE t."taskGroup" END,
               title = CASE WHEN "vE1" ? 'title' THEN "vC1OnboardingTemplateTasks".title ELSE t.title END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1OnboardingTemplateTasks".description ELSE t.description END,
               "ownerFunction" = CASE WHEN "vE1" ? 'ownerFunction' THEN "vC1OnboardingTemplateTasks"."ownerFunction" ELSE t."ownerFunction" END,
               "dueOffsetDays" = CASE WHEN "vE1" ? 'dueOffsetDays' THEN "vC1OnboardingTemplateTasks"."dueOffsetDays" ELSE t."dueOffsetDays" END,
               "actionKind" = CASE WHEN "vE1" ? 'actionKind' THEN "vC1OnboardingTemplateTasks"."actionKind" ELSE t."actionKind" END,
               "sortOrder" = CASE WHEN "vE1" ? 'sortOrder' THEN "vC1OnboardingTemplateTasks"."sortOrder" ELSE t."sortOrder" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."templateId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'OnboardingTemplateTasks: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "HumanResources"."OnboardingTemplateTasks" ("templateId", "tenantId", "taskGroup", title, description, "ownerFunction", "dueOffsetDays", "actionKind", "sortOrder")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'taskGroup' THEN "vC1OnboardingTemplateTasks"."taskGroup" ELSE NULL END, CASE WHEN "vE1" ? 'title' THEN "vC1OnboardingTemplateTasks".title ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1OnboardingTemplateTasks".description ELSE NULL END, CASE WHEN "vE1" ? 'ownerFunction' THEN "vC1OnboardingTemplateTasks"."ownerFunction" ELSE NULL END, CASE WHEN "vE1" ? 'dueOffsetDays' THEN "vC1OnboardingTemplateTasks"."dueOffsetDays" ELSE 0 END, CASE WHEN "vE1" ? 'actionKind' THEN "vC1OnboardingTemplateTasks"."actionKind" ELSE 'NONE' END, CASE WHEN "vE1" ? 'sortOrder' THEN "vC1OnboardingTemplateTasks"."sortOrder" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."onboardingTemplateAddUpdate"(jsonb) IS 'Save (insert or update) one OnboardingTemplates record with its tasks.';

-- OnboardingTemplates: one record as JSON (camelCase keys), with lookup labels and tasks
CREATE OR REPLACE FUNCTION "HumanResources"."getOnboardingTemplateInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('trackLabel', "Lookups"."getLookupLabel"('Track', t.track) ->> 'label', 'trackTone', "Lookups"."getLookupLabel"('Track', t.track) ->> 'tone') ||
         jsonb_build_object('tasks', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."sortOrder") FROM "HumanResources"."OnboardingTemplateTasks" c1 WHERE c1."templateId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "HumanResources"."OnboardingTemplates" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getOnboardingTemplateInfo"(uuid) IS 'Read one OnboardingTemplates record (getter for its screens).';

-- Onboardings: insert (no "id") or update (with "id"); child arrays: tasks
CREATE OR REPLACE FUNCTION "HumanResources"."onboardingAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."Onboardings";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1OnboardingTasks" "HumanResources"."OnboardingTasks";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."Onboardings", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('ONB', current_date, NULL);
    END IF;
    INSERT INTO "HumanResources"."Onboardings" ("tenantId", "docNo", "employeeId", "templateId", track, "designationId", "joiningDate", "startDate", "targetDate", "buddyEmployeeId", "candidateId", "completedAt")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'templateId' THEN "vRec"."templateId" ELSE NULL END, CASE WHEN "pData" ? 'track' THEN "vRec".track ELSE 'NEW_JOINER' END, CASE WHEN "pData" ? 'designationId' THEN "vRec"."designationId" ELSE NULL END, CASE WHEN "pData" ? 'joiningDate' THEN "vRec"."joiningDate" ELSE NULL END, CASE WHEN "pData" ? 'startDate' THEN "vRec"."startDate" ELSE CURRENT_DATE END, CASE WHEN "pData" ? 'targetDate' THEN "vRec"."targetDate" ELSE NULL END, CASE WHEN "pData" ? 'buddyEmployeeId' THEN "vRec"."buddyEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'candidateId' THEN "vRec"."candidateId" ELSE NULL END, CASE WHEN "pData" ? 'completedAt' THEN "vRec"."completedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."Onboardings" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "templateId" = CASE WHEN "pData" ? 'templateId' THEN "vRec"."templateId" ELSE t."templateId" END,
           track = CASE WHEN "pData" ? 'track' THEN "vRec".track ELSE t.track END,
           "designationId" = CASE WHEN "pData" ? 'designationId' THEN "vRec"."designationId" ELSE t."designationId" END,
           "joiningDate" = CASE WHEN "pData" ? 'joiningDate' THEN "vRec"."joiningDate" ELSE t."joiningDate" END,
           "startDate" = CASE WHEN "pData" ? 'startDate' THEN "vRec"."startDate" ELSE t."startDate" END,
           "targetDate" = CASE WHEN "pData" ? 'targetDate' THEN "vRec"."targetDate" ELSE t."targetDate" END,
           "buddyEmployeeId" = CASE WHEN "pData" ? 'buddyEmployeeId' THEN "vRec"."buddyEmployeeId" ELSE t."buddyEmployeeId" END,
           "candidateId" = CASE WHEN "pData" ? 'candidateId' THEN "vRec"."candidateId" ELSE t."candidateId" END,
           "completedAt" = CASE WHEN "pData" ? 'completedAt' THEN "vRec"."completedAt" ELSE t."completedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."Onboardings" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Onboardings %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Onboardings % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'tasks' THEN
    -- tasks: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "HumanResources"."OnboardingTasks"
     WHERE "tenantId" = "vTenant" AND "onboardingId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'tasks') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'tasks') WITH ORDINALITY t(x, n) LOOP
      "vC1OnboardingTasks" := jsonb_populate_record(NULL::"HumanResources"."OnboardingTasks", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "HumanResources"."OnboardingTasks" t
           SET "templateTaskId" = CASE WHEN "vE1" ? 'templateTaskId' THEN "vC1OnboardingTasks"."templateTaskId" ELSE t."templateTaskId" END,
               "taskGroup" = CASE WHEN "vE1" ? 'taskGroup' THEN "vC1OnboardingTasks"."taskGroup" ELSE t."taskGroup" END,
               title = CASE WHEN "vE1" ? 'title' THEN "vC1OnboardingTasks".title ELSE t.title END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1OnboardingTasks".description ELSE t.description END,
               "ownerFunction" = CASE WHEN "vE1" ? 'ownerFunction' THEN "vC1OnboardingTasks"."ownerFunction" ELSE t."ownerFunction" END,
               "ownerEmployeeId" = CASE WHEN "vE1" ? 'ownerEmployeeId' THEN "vC1OnboardingTasks"."ownerEmployeeId" ELSE t."ownerEmployeeId" END,
               "dueOn" = CASE WHEN "vE1" ? 'dueOn' THEN "vC1OnboardingTasks"."dueOn" ELSE t."dueOn" END,
               "actionKind" = CASE WHEN "vE1" ? 'actionKind' THEN "vC1OnboardingTasks"."actionKind" ELSE t."actionKind" END,
               "progressPct" = CASE WHEN "vE1" ? 'progressPct' THEN "vC1OnboardingTasks"."progressPct" ELSE t."progressPct" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1OnboardingTasks".status ELSE t.status END,
               "scheduledAt" = CASE WHEN "vE1" ? 'scheduledAt' THEN "vC1OnboardingTasks"."scheduledAt" ELSE t."scheduledAt" END,
               "attachmentId" = CASE WHEN "vE1" ? 'attachmentId' THEN "vC1OnboardingTasks"."attachmentId" ELSE t."attachmentId" END,
               "completionNote" = CASE WHEN "vE1" ? 'completionNote' THEN "vC1OnboardingTasks"."completionNote" ELSE t."completionNote" END,
               "completedAt" = CASE WHEN "vE1" ? 'completedAt' THEN "vC1OnboardingTasks"."completedAt" ELSE t."completedAt" END,
               "completedByUserId" = CASE WHEN "vE1" ? 'completedByUserId' THEN "vC1OnboardingTasks"."completedByUserId" ELSE t."completedByUserId" END,
               "sortOrder" = CASE WHEN "vE1" ? 'sortOrder' THEN "vC1OnboardingTasks"."sortOrder" ELSE t."sortOrder" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."onboardingId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'OnboardingTasks: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "HumanResources"."OnboardingTasks" ("onboardingId", "tenantId", "templateTaskId", "taskGroup", title, description, "ownerFunction", "ownerEmployeeId", "dueOn", "actionKind", "progressPct", status, "scheduledAt", "attachmentId", "completionNote", "completedAt", "completedByUserId", "sortOrder")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'templateTaskId' THEN "vC1OnboardingTasks"."templateTaskId" ELSE NULL END, CASE WHEN "vE1" ? 'taskGroup' THEN "vC1OnboardingTasks"."taskGroup" ELSE NULL END, CASE WHEN "vE1" ? 'title' THEN "vC1OnboardingTasks".title ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1OnboardingTasks".description ELSE NULL END, CASE WHEN "vE1" ? 'ownerFunction' THEN "vC1OnboardingTasks"."ownerFunction" ELSE NULL END, CASE WHEN "vE1" ? 'ownerEmployeeId' THEN "vC1OnboardingTasks"."ownerEmployeeId" ELSE NULL END, CASE WHEN "vE1" ? 'dueOn' THEN "vC1OnboardingTasks"."dueOn" ELSE NULL END, CASE WHEN "vE1" ? 'actionKind' THEN "vC1OnboardingTasks"."actionKind" ELSE 'NONE' END, CASE WHEN "vE1" ? 'progressPct' THEN "vC1OnboardingTasks"."progressPct" ELSE 0 END, CASE WHEN "vE1" ? 'status' THEN "vC1OnboardingTasks".status ELSE 'NOT_STARTED' END, CASE WHEN "vE1" ? 'scheduledAt' THEN "vC1OnboardingTasks"."scheduledAt" ELSE NULL END, CASE WHEN "vE1" ? 'attachmentId' THEN "vC1OnboardingTasks"."attachmentId" ELSE NULL END, CASE WHEN "vE1" ? 'completionNote' THEN "vC1OnboardingTasks"."completionNote" ELSE NULL END, CASE WHEN "vE1" ? 'completedAt' THEN "vC1OnboardingTasks"."completedAt" ELSE NULL END, CASE WHEN "vE1" ? 'completedByUserId' THEN "vC1OnboardingTasks"."completedByUserId" ELSE NULL END, CASE WHEN "vE1" ? 'sortOrder' THEN "vC1OnboardingTasks"."sortOrder" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."onboardingAddUpdate"(jsonb) IS 'Save (insert or update) one Onboardings record with its tasks.';

-- Onboardings: one record as JSON (camelCase keys), with lookup labels and tasks
CREATE OR REPLACE FUNCTION "HumanResources"."getOnboardingInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('trackLabel', "Lookups"."getLookupLabel"('Track', t.track) ->> 'label', 'trackTone', "Lookups"."getLookupLabel"('Track', t.track) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('OnboardingStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('OnboardingStatus', t.status) ->> 'tone') ||
         jsonb_build_object('tasks', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."sortOrder") FROM "HumanResources"."OnboardingTasks" c1 WHERE c1."onboardingId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "HumanResources"."Onboardings" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getOnboardingInfo"(uuid) IS 'Read one Onboardings record (getter for its screens).';

-- Onboardings: Cancel (status -> CANCELLED); allowed from PRE_JOINING, IN_PROGRESS, COMPLETED
CREATE OR REPLACE FUNCTION "HumanResources"."onboardingCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "HumanResources"."Onboardings";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."Onboardings" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboardings % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PRE_JOINING', 'IN_PROGRESS', 'COMPLETED') THEN
    RAISE EXCEPTION 'Onboardings %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"HumanResources"."onboardingCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"HumanResources"."onboardingCancelEntries"') USING "pId";
  END IF;
  UPDATE "HumanResources"."Onboardings" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- Offboardings: insert (no "id") or update (with "id"); child arrays: clearanceItems, exitInterviews
CREATE OR REPLACE FUNCTION "HumanResources"."offboardingAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."Offboardings";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1ClearanceItems" "HumanResources"."ClearanceItems";
  "vC1ExitInterviews" "HumanResources"."ExitInterviews";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."Offboardings", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('OFF', current_date, NULL);
    END IF;
    INSERT INTO "HumanResources"."Offboardings" ("tenantId", "docNo", "employeeId", "exitType", "resignationDate", "lastWorkingDay", "noticeDaysRequired", "noticeDaysServed", "noticeWaived", "reasonCategory", "reasonDetail", "isVoluntary", "resignationAttachmentId", "closedAt", remarks)
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'exitType' THEN "vRec"."exitType" ELSE NULL END, CASE WHEN "pData" ? 'resignationDate' THEN "vRec"."resignationDate" ELSE NULL END, CASE WHEN "pData" ? 'lastWorkingDay' THEN "vRec"."lastWorkingDay" ELSE NULL END, CASE WHEN "pData" ? 'noticeDaysRequired' THEN "vRec"."noticeDaysRequired" ELSE NULL END, CASE WHEN "pData" ? 'noticeDaysServed' THEN "vRec"."noticeDaysServed" ELSE NULL END, CASE WHEN "pData" ? 'noticeWaived' THEN "vRec"."noticeWaived" ELSE FALSE END, CASE WHEN "pData" ? 'reasonCategory' THEN "vRec"."reasonCategory" ELSE NULL END, CASE WHEN "pData" ? 'reasonDetail' THEN "vRec"."reasonDetail" ELSE NULL END, CASE WHEN "pData" ? 'isVoluntary' THEN "vRec"."isVoluntary" ELSE TRUE END, CASE WHEN "pData" ? 'resignationAttachmentId' THEN "vRec"."resignationAttachmentId" ELSE NULL END, CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."Offboardings" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "exitType" = CASE WHEN "pData" ? 'exitType' THEN "vRec"."exitType" ELSE t."exitType" END,
           "resignationDate" = CASE WHEN "pData" ? 'resignationDate' THEN "vRec"."resignationDate" ELSE t."resignationDate" END,
           "lastWorkingDay" = CASE WHEN "pData" ? 'lastWorkingDay' THEN "vRec"."lastWorkingDay" ELSE t."lastWorkingDay" END,
           "noticeDaysRequired" = CASE WHEN "pData" ? 'noticeDaysRequired' THEN "vRec"."noticeDaysRequired" ELSE t."noticeDaysRequired" END,
           "noticeDaysServed" = CASE WHEN "pData" ? 'noticeDaysServed' THEN "vRec"."noticeDaysServed" ELSE t."noticeDaysServed" END,
           "noticeWaived" = CASE WHEN "pData" ? 'noticeWaived' THEN "vRec"."noticeWaived" ELSE t."noticeWaived" END,
           "reasonCategory" = CASE WHEN "pData" ? 'reasonCategory' THEN "vRec"."reasonCategory" ELSE t."reasonCategory" END,
           "reasonDetail" = CASE WHEN "pData" ? 'reasonDetail' THEN "vRec"."reasonDetail" ELSE t."reasonDetail" END,
           "isVoluntary" = CASE WHEN "pData" ? 'isVoluntary' THEN "vRec"."isVoluntary" ELSE t."isVoluntary" END,
           "resignationAttachmentId" = CASE WHEN "pData" ? 'resignationAttachmentId' THEN "vRec"."resignationAttachmentId" ELSE t."resignationAttachmentId" END,
           "closedAt" = CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE t."closedAt" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."Offboardings" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Offboardings %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Offboardings % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'clearanceItems' THEN
    -- clearanceItems: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "HumanResources"."ClearanceItems"
     WHERE "tenantId" = "vTenant" AND "offboardingId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'clearanceItems') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'clearanceItems') WITH ORDINALITY t(x, n) LOOP
      "vC1ClearanceItems" := jsonb_populate_record(NULL::"HumanResources"."ClearanceItems", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "HumanResources"."ClearanceItems" t
           SET "clearanceArea" = CASE WHEN "vE1" ? 'clearanceArea' THEN "vC1ClearanceItems"."clearanceArea" ELSE t."clearanceArea" END,
               "departmentId" = CASE WHEN "vE1" ? 'departmentId' THEN "vC1ClearanceItems"."departmentId" ELSE t."departmentId" END,
               description = CASE WHEN "vE1" ? 'description' THEN "vC1ClearanceItems".description ELSE t.description END,
               "ownerEmployeeId" = CASE WHEN "vE1" ? 'ownerEmployeeId' THEN "vC1ClearanceItems"."ownerEmployeeId" ELSE t."ownerEmployeeId" END,
               "employeeAssetId" = CASE WHEN "vE1" ? 'employeeAssetId' THEN "vC1ClearanceItems"."employeeAssetId" ELSE t."employeeAssetId" END,
               "recoverableAmount" = CASE WHEN "vE1" ? 'recoverableAmount' THEN "vC1ClearanceItems"."recoverableAmount" ELSE t."recoverableAmount" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1ClearanceItems".status ELSE t.status END,
               "clearedAt" = CASE WHEN "vE1" ? 'clearedAt' THEN "vC1ClearanceItems"."clearedAt" ELSE t."clearedAt" END,
               "clearedByUserId" = CASE WHEN "vE1" ? 'clearedByUserId' THEN "vC1ClearanceItems"."clearedByUserId" ELSE t."clearedByUserId" END,
               remarks = CASE WHEN "vE1" ? 'remarks' THEN "vC1ClearanceItems".remarks ELSE t.remarks END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."offboardingId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ClearanceItems: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "HumanResources"."ClearanceItems" ("offboardingId", "tenantId", "clearanceArea", "departmentId", description, "ownerEmployeeId", "employeeAssetId", "recoverableAmount", status, "clearedAt", "clearedByUserId", remarks)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'clearanceArea' THEN "vC1ClearanceItems"."clearanceArea" ELSE NULL END, CASE WHEN "vE1" ? 'departmentId' THEN "vC1ClearanceItems"."departmentId" ELSE NULL END, CASE WHEN "vE1" ? 'description' THEN "vC1ClearanceItems".description ELSE NULL END, CASE WHEN "vE1" ? 'ownerEmployeeId' THEN "vC1ClearanceItems"."ownerEmployeeId" ELSE NULL END, CASE WHEN "vE1" ? 'employeeAssetId' THEN "vC1ClearanceItems"."employeeAssetId" ELSE NULL END, CASE WHEN "vE1" ? 'recoverableAmount' THEN "vC1ClearanceItems"."recoverableAmount" ELSE NULL END, CASE WHEN "vE1" ? 'status' THEN "vC1ClearanceItems".status ELSE 'PENDING' END, CASE WHEN "vE1" ? 'clearedAt' THEN "vC1ClearanceItems"."clearedAt" ELSE NULL END, CASE WHEN "vE1" ? 'clearedByUserId' THEN "vC1ClearanceItems"."clearedByUserId" ELSE NULL END, CASE WHEN "vE1" ? 'remarks' THEN "vC1ClearanceItems".remarks ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'exitInterviews' THEN
    -- exitInterviews: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "HumanResources"."ExitInterviews"
     WHERE "tenantId" = "vTenant" AND "offboardingId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'exitInterviews') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'exitInterviews') WITH ORDINALITY t(x, n) LOOP
      "vC1ExitInterviews" := jsonb_populate_record(NULL::"HumanResources"."ExitInterviews", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "HumanResources"."ExitInterviews" t
           SET "interviewDate" = CASE WHEN "vE1" ? 'interviewDate' THEN "vC1ExitInterviews"."interviewDate" ELSE t."interviewDate" END,
               "conductedByEmployeeId" = CASE WHEN "vE1" ? 'conductedByEmployeeId' THEN "vC1ExitInterviews"."conductedByEmployeeId" ELSE t."conductedByEmployeeId" END,
               "primaryReason" = CASE WHEN "vE1" ? 'primaryReason' THEN "vC1ExitInterviews"."primaryReason" ELSE t."primaryReason" END,
               "wouldRejoin" = CASE WHEN "vE1" ? 'wouldRejoin' THEN "vC1ExitInterviews"."wouldRejoin" ELSE t."wouldRejoin" END,
               "roleSatisfaction" = CASE WHEN "vE1" ? 'roleSatisfaction' THEN "vC1ExitInterviews"."roleSatisfaction" ELSE t."roleSatisfaction" END,
               "managerSatisfaction" = CASE WHEN "vE1" ? 'managerSatisfaction' THEN "vC1ExitInterviews"."managerSatisfaction" ELSE t."managerSatisfaction" END,
               "compensationFairness" = CASE WHEN "vE1" ? 'compensationFairness' THEN "vC1ExitInterviews"."compensationFairness" ELSE t."compensationFairness" END,
               "wouldRecommend" = CASE WHEN "vE1" ? 'wouldRecommend' THEN "vC1ExitInterviews"."wouldRecommend" ELSE t."wouldRecommend" END,
               "valuedMost" = CASE WHEN "vE1" ? 'valuedMost' THEN "vC1ExitInterviews"."valuedMost" ELSE t."valuedMost" END,
               "shouldImprove" = CASE WHEN "vE1" ? 'shouldImprove' THEN "vC1ExitInterviews"."shouldImprove" ELSE t."shouldImprove" END,
               "eligibleForRehire" = CASE WHEN "vE1" ? 'eligibleForRehire' THEN "vC1ExitInterviews"."eligibleForRehire" ELSE t."eligibleForRehire" END,
               "isConfidential" = CASE WHEN "vE1" ? 'isConfidential' THEN "vC1ExitInterviews"."isConfidential" ELSE t."isConfidential" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."offboardingId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'ExitInterviews: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "HumanResources"."ExitInterviews" ("offboardingId", "tenantId", "interviewDate", "conductedByEmployeeId", "primaryReason", "wouldRejoin", "roleSatisfaction", "managerSatisfaction", "compensationFairness", "wouldRecommend", "valuedMost", "shouldImprove", "eligibleForRehire", "isConfidential")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'interviewDate' THEN "vC1ExitInterviews"."interviewDate" ELSE NULL END, CASE WHEN "vE1" ? 'conductedByEmployeeId' THEN "vC1ExitInterviews"."conductedByEmployeeId" ELSE NULL END, CASE WHEN "vE1" ? 'primaryReason' THEN "vC1ExitInterviews"."primaryReason" ELSE NULL END, CASE WHEN "vE1" ? 'wouldRejoin' THEN "vC1ExitInterviews"."wouldRejoin" ELSE NULL END, CASE WHEN "vE1" ? 'roleSatisfaction' THEN "vC1ExitInterviews"."roleSatisfaction" ELSE NULL END, CASE WHEN "vE1" ? 'managerSatisfaction' THEN "vC1ExitInterviews"."managerSatisfaction" ELSE NULL END, CASE WHEN "vE1" ? 'compensationFairness' THEN "vC1ExitInterviews"."compensationFairness" ELSE NULL END, CASE WHEN "vE1" ? 'wouldRecommend' THEN "vC1ExitInterviews"."wouldRecommend" ELSE NULL END, CASE WHEN "vE1" ? 'valuedMost' THEN "vC1ExitInterviews"."valuedMost" ELSE NULL END, CASE WHEN "vE1" ? 'shouldImprove' THEN "vC1ExitInterviews"."shouldImprove" ELSE NULL END, CASE WHEN "vE1" ? 'eligibleForRehire' THEN "vC1ExitInterviews"."eligibleForRehire" ELSE TRUE END, CASE WHEN "vE1" ? 'isConfidential' THEN "vC1ExitInterviews"."isConfidential" ELSE FALSE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."offboardingAddUpdate"(jsonb) IS 'Save (insert or update) one Offboardings record with its clearanceItems, exitInterviews.';

-- Offboardings: one record as JSON (camelCase keys), with lookup labels and clearanceItems, exitInterviews
CREATE OR REPLACE FUNCTION "HumanResources"."getOffboardingInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('exitTypeLabel', "Lookups"."getLookupLabel"('ExitType', t."exitType") ->> 'label', 'exitTypeTone', "Lookups"."getLookupLabel"('ExitType', t."exitType") ->> 'tone', 'reasonCategoryLabel', "Lookups"."getLookupLabel"('OffboardingReasonCategory', t."reasonCategory") ->> 'label', 'reasonCategoryTone', "Lookups"."getLookupLabel"('OffboardingReasonCategory', t."reasonCategory") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('OffboardingStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('OffboardingStatus', t.status) ->> 'tone') ||
         jsonb_build_object('clearanceItems', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "HumanResources"."ClearanceItems" c1 WHERE c1."offboardingId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'exitInterviews', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "HumanResources"."ExitInterviews" c1 WHERE c1."offboardingId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "HumanResources"."Offboardings" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getOffboardingInfo"(uuid) IS 'Read one Offboardings record (getter for its screens).';

-- JobOpenings: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."jobOpeningAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."JobOpenings";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."JobOpenings", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('REQ', current_date, "vRec"."branchId");
    END IF;
    INSERT INTO "HumanResources"."JobOpenings" ("tenantId", "docNo", title, "designationId", "departmentId", "branchId", openings, "requisitionType", "replacesEmployeeId", "hiringMode", "hiringManagerEmployeeId", priority, "salaryMin", "salaryMax", "jobDescription", "targetHireDate", "approvalRequestId", "closedOn")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE NULL END, CASE WHEN "pData" ? 'designationId' THEN "vRec"."designationId" ELSE NULL END, CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'openings' THEN "vRec".openings ELSE 1 END, CASE WHEN "pData" ? 'requisitionType' THEN "vRec"."requisitionType" ELSE 'NEW' END, CASE WHEN "pData" ? 'replacesEmployeeId' THEN "vRec"."replacesEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'hiringMode' THEN "vRec"."hiringMode" ELSE 'STANDARD' END, CASE WHEN "pData" ? 'hiringManagerEmployeeId' THEN "vRec"."hiringManagerEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'priority' THEN "vRec".priority ELSE 'NORMAL' END, CASE WHEN "pData" ? 'salaryMin' THEN "vRec"."salaryMin" ELSE NULL END, CASE WHEN "pData" ? 'salaryMax' THEN "vRec"."salaryMax" ELSE NULL END, CASE WHEN "pData" ? 'jobDescription' THEN "vRec"."jobDescription" ELSE NULL END, CASE WHEN "pData" ? 'targetHireDate' THEN "vRec"."targetHireDate" ELSE NULL END, CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE NULL END, CASE WHEN "pData" ? 'closedOn' THEN "vRec"."closedOn" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "HumanResources"."JobOpenings" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'JobOpenings: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "HumanResources"."JobOpenings" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
           "designationId" = CASE WHEN "pData" ? 'designationId' THEN "vRec"."designationId" ELSE t."designationId" END,
           "departmentId" = CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE t."departmentId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           openings = CASE WHEN "pData" ? 'openings' THEN "vRec".openings ELSE t.openings END,
           "requisitionType" = CASE WHEN "pData" ? 'requisitionType' THEN "vRec"."requisitionType" ELSE t."requisitionType" END,
           "replacesEmployeeId" = CASE WHEN "pData" ? 'replacesEmployeeId' THEN "vRec"."replacesEmployeeId" ELSE t."replacesEmployeeId" END,
           "hiringMode" = CASE WHEN "pData" ? 'hiringMode' THEN "vRec"."hiringMode" ELSE t."hiringMode" END,
           "hiringManagerEmployeeId" = CASE WHEN "pData" ? 'hiringManagerEmployeeId' THEN "vRec"."hiringManagerEmployeeId" ELSE t."hiringManagerEmployeeId" END,
           priority = CASE WHEN "pData" ? 'priority' THEN "vRec".priority ELSE t.priority END,
           "salaryMin" = CASE WHEN "pData" ? 'salaryMin' THEN "vRec"."salaryMin" ELSE t."salaryMin" END,
           "salaryMax" = CASE WHEN "pData" ? 'salaryMax' THEN "vRec"."salaryMax" ELSE t."salaryMax" END,
           "jobDescription" = CASE WHEN "pData" ? 'jobDescription' THEN "vRec"."jobDescription" ELSE t."jobDescription" END,
           "targetHireDate" = CASE WHEN "pData" ? 'targetHireDate' THEN "vRec"."targetHireDate" ELSE t."targetHireDate" END,
           "approvalRequestId" = CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE t."approvalRequestId" END,
           "closedOn" = CASE WHEN "pData" ? 'closedOn' THEN "vRec"."closedOn" ELSE t."closedOn" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."JobOpenings" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'JobOpenings %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'JobOpenings % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."jobOpeningAddUpdate"(jsonb) IS 'Save (insert or update) one JobOpenings record.';

-- JobOpenings: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getJobOpeningInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('requisitionTypeLabel', "Lookups"."getLookupLabel"('RequisitionType', t."requisitionType") ->> 'label', 'requisitionTypeTone', "Lookups"."getLookupLabel"('RequisitionType', t."requisitionType") ->> 'tone', 'hiringModeLabel', "Lookups"."getLookupLabel"('HiringMode', t."hiringMode") ->> 'label', 'hiringModeTone', "Lookups"."getLookupLabel"('HiringMode', t."hiringMode") ->> 'tone', 'priorityLabel', "Lookups"."getLookupLabel"('JobOpeningPriority', t.priority) ->> 'label', 'priorityTone', "Lookups"."getLookupLabel"('JobOpeningPriority', t.priority) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('JobOpeningStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('JobOpeningStatus', t.status) ->> 'tone')
    FROM "HumanResources"."JobOpenings" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getJobOpeningInfo"(uuid) IS 'Read one JobOpenings record (getter for its screens).';

-- JobOpenings: Cancel (status -> CANCELLED); allowed from DRAFT, PENDING_APPROVAL, OPEN, ON_HOLD, OFFER_STAGE, CLOSED
CREATE OR REPLACE FUNCTION "HumanResources"."jobOpeningCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "HumanResources"."JobOpenings";
BEGIN
  SELECT * INTO "vRow" FROM "HumanResources"."JobOpenings" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'JobOpenings % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_APPROVAL', 'OPEN', 'ON_HOLD', 'OFFER_STAGE', 'CLOSED') THEN
    RAISE EXCEPTION 'JobOpenings %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"HumanResources"."jobOpeningCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"HumanResources"."jobOpeningCancelEntries"') USING "pId";
  END IF;
  UPDATE "HumanResources"."JobOpenings" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- Candidates: insert (no "id") or update (with "id"); child arrays: activities
CREATE OR REPLACE FUNCTION "HumanResources"."candidateAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."Candidates";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1CandidateActivities" "HumanResources"."CandidateActivities";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."Candidates", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."Candidates" ("tenantId", "jobRequisitionId", "fullName", email, phone, cnic, headline, "currentEmployer", "currentTitle", "experienceYears", education, source, "referredByEmployeeId", "appliedOn", stage, "currentSalary", "expectedSalary", "noticeDays", rating, "nextInterviewAt", "offeredSalary", "offerStatus", "offerSentOn", "hiredEmployeeId", "rejectionReason", "cvAttachmentId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'jobRequisitionId' THEN "vRec"."jobRequisitionId" ELSE NULL END, CASE WHEN "pData" ? 'fullName' THEN "vRec"."fullName" ELSE NULL END, CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE NULL END, CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE NULL END, CASE WHEN "pData" ? 'cnic' THEN "vRec".cnic ELSE NULL END, CASE WHEN "pData" ? 'headline' THEN "vRec".headline ELSE NULL END, CASE WHEN "pData" ? 'currentEmployer' THEN "vRec"."currentEmployer" ELSE NULL END, CASE WHEN "pData" ? 'currentTitle' THEN "vRec"."currentTitle" ELSE NULL END, CASE WHEN "pData" ? 'experienceYears' THEN "vRec"."experienceYears" ELSE NULL END, CASE WHEN "pData" ? 'education' THEN "vRec".education ELSE NULL END, CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE NULL END, CASE WHEN "pData" ? 'referredByEmployeeId' THEN "vRec"."referredByEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'appliedOn' THEN "vRec"."appliedOn" ELSE CURRENT_DATE END, CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE 'APPLIED' END, CASE WHEN "pData" ? 'currentSalary' THEN "vRec"."currentSalary" ELSE NULL END, CASE WHEN "pData" ? 'expectedSalary' THEN "vRec"."expectedSalary" ELSE NULL END, CASE WHEN "pData" ? 'noticeDays' THEN "vRec"."noticeDays" ELSE NULL END, CASE WHEN "pData" ? 'rating' THEN "vRec".rating ELSE NULL END, CASE WHEN "pData" ? 'nextInterviewAt' THEN "vRec"."nextInterviewAt" ELSE NULL END, CASE WHEN "pData" ? 'offeredSalary' THEN "vRec"."offeredSalary" ELSE NULL END, CASE WHEN "pData" ? 'offerStatus' THEN "vRec"."offerStatus" ELSE NULL END, CASE WHEN "pData" ? 'offerSentOn' THEN "vRec"."offerSentOn" ELSE NULL END, CASE WHEN "pData" ? 'hiredEmployeeId' THEN "vRec"."hiredEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE NULL END, CASE WHEN "pData" ? 'cvAttachmentId' THEN "vRec"."cvAttachmentId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."Candidates" t
       SET "jobRequisitionId" = CASE WHEN "pData" ? 'jobRequisitionId' THEN "vRec"."jobRequisitionId" ELSE t."jobRequisitionId" END,
           "fullName" = CASE WHEN "pData" ? 'fullName' THEN "vRec"."fullName" ELSE t."fullName" END,
           email = CASE WHEN "pData" ? 'email' THEN "vRec".email ELSE t.email END,
           phone = CASE WHEN "pData" ? 'phone' THEN "vRec".phone ELSE t.phone END,
           cnic = CASE WHEN "pData" ? 'cnic' THEN "vRec".cnic ELSE t.cnic END,
           headline = CASE WHEN "pData" ? 'headline' THEN "vRec".headline ELSE t.headline END,
           "currentEmployer" = CASE WHEN "pData" ? 'currentEmployer' THEN "vRec"."currentEmployer" ELSE t."currentEmployer" END,
           "currentTitle" = CASE WHEN "pData" ? 'currentTitle' THEN "vRec"."currentTitle" ELSE t."currentTitle" END,
           "experienceYears" = CASE WHEN "pData" ? 'experienceYears' THEN "vRec"."experienceYears" ELSE t."experienceYears" END,
           education = CASE WHEN "pData" ? 'education' THEN "vRec".education ELSE t.education END,
           source = CASE WHEN "pData" ? 'source' THEN "vRec".source ELSE t.source END,
           "referredByEmployeeId" = CASE WHEN "pData" ? 'referredByEmployeeId' THEN "vRec"."referredByEmployeeId" ELSE t."referredByEmployeeId" END,
           "appliedOn" = CASE WHEN "pData" ? 'appliedOn' THEN "vRec"."appliedOn" ELSE t."appliedOn" END,
           stage = CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE t.stage END,
           "currentSalary" = CASE WHEN "pData" ? 'currentSalary' THEN "vRec"."currentSalary" ELSE t."currentSalary" END,
           "expectedSalary" = CASE WHEN "pData" ? 'expectedSalary' THEN "vRec"."expectedSalary" ELSE t."expectedSalary" END,
           "noticeDays" = CASE WHEN "pData" ? 'noticeDays' THEN "vRec"."noticeDays" ELSE t."noticeDays" END,
           rating = CASE WHEN "pData" ? 'rating' THEN "vRec".rating ELSE t.rating END,
           "nextInterviewAt" = CASE WHEN "pData" ? 'nextInterviewAt' THEN "vRec"."nextInterviewAt" ELSE t."nextInterviewAt" END,
           "offeredSalary" = CASE WHEN "pData" ? 'offeredSalary' THEN "vRec"."offeredSalary" ELSE t."offeredSalary" END,
           "offerStatus" = CASE WHEN "pData" ? 'offerStatus' THEN "vRec"."offerStatus" ELSE t."offerStatus" END,
           "offerSentOn" = CASE WHEN "pData" ? 'offerSentOn' THEN "vRec"."offerSentOn" ELSE t."offerSentOn" END,
           "hiredEmployeeId" = CASE WHEN "pData" ? 'hiredEmployeeId' THEN "vRec"."hiredEmployeeId" ELSE t."hiredEmployeeId" END,
           "rejectionReason" = CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE t."rejectionReason" END,
           "cvAttachmentId" = CASE WHEN "pData" ? 'cvAttachmentId' THEN "vRec"."cvAttachmentId" ELSE t."cvAttachmentId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."Candidates" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Candidates %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Candidates % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'activities' THEN
    -- activities: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "HumanResources"."CandidateActivities"
     WHERE "tenantId" = "vTenant" AND "candidateId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'activities') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'activities') WITH ORDINALITY t(x, n) LOOP
      "vC1CandidateActivities" := jsonb_populate_record(NULL::"HumanResources"."CandidateActivities", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "HumanResources"."CandidateActivities" t
           SET "activityType" = CASE WHEN "vE1" ? 'activityType' THEN "vC1CandidateActivities"."activityType" ELSE t."activityType" END,
               "occurredAt" = CASE WHEN "vE1" ? 'occurredAt' THEN "vC1CandidateActivities"."occurredAt" ELSE t."occurredAt" END,
               "scheduledAt" = CASE WHEN "vE1" ? 'scheduledAt' THEN "vC1CandidateActivities"."scheduledAt" ELSE t."scheduledAt" END,
               "byEmployeeId" = CASE WHEN "vE1" ? 'byEmployeeId' THEN "vC1CandidateActivities"."byEmployeeId" ELSE t."byEmployeeId" END,
               "panelNote" = CASE WHEN "vE1" ? 'panelNote' THEN "vC1CandidateActivities"."panelNote" ELSE t."panelNote" END,
               "fromStage" = CASE WHEN "vE1" ? 'fromStage' THEN "vC1CandidateActivities"."fromStage" ELSE t."fromStage" END,
               "toStage" = CASE WHEN "vE1" ? 'toStage' THEN "vC1CandidateActivities"."toStage" ELSE t."toStage" END,
               "scorePct" = CASE WHEN "vE1" ? 'scorePct' THEN "vC1CandidateActivities"."scorePct" ELSE t."scorePct" END,
               rating = CASE WHEN "vE1" ? 'rating' THEN "vC1CandidateActivities".rating ELSE t.rating END,
               summary = CASE WHEN "vE1" ? 'summary' THEN "vC1CandidateActivities".summary ELSE t.summary END,
               notes = CASE WHEN "vE1" ? 'notes' THEN "vC1CandidateActivities".notes ELSE t.notes END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."candidateId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'CandidateActivities: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "HumanResources"."CandidateActivities" ("candidateId", "tenantId", "activityType", "occurredAt", "scheduledAt", "byEmployeeId", "panelNote", "fromStage", "toStage", "scorePct", rating, summary, notes)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'activityType' THEN "vC1CandidateActivities"."activityType" ELSE NULL END, CASE WHEN "vE1" ? 'occurredAt' THEN "vC1CandidateActivities"."occurredAt" ELSE now() END, CASE WHEN "vE1" ? 'scheduledAt' THEN "vC1CandidateActivities"."scheduledAt" ELSE NULL END, CASE WHEN "vE1" ? 'byEmployeeId' THEN "vC1CandidateActivities"."byEmployeeId" ELSE NULL END, CASE WHEN "vE1" ? 'panelNote' THEN "vC1CandidateActivities"."panelNote" ELSE NULL END, CASE WHEN "vE1" ? 'fromStage' THEN "vC1CandidateActivities"."fromStage" ELSE NULL END, CASE WHEN "vE1" ? 'toStage' THEN "vC1CandidateActivities"."toStage" ELSE NULL END, CASE WHEN "vE1" ? 'scorePct' THEN "vC1CandidateActivities"."scorePct" ELSE NULL END, CASE WHEN "vE1" ? 'rating' THEN "vC1CandidateActivities".rating ELSE NULL END, CASE WHEN "vE1" ? 'summary' THEN "vC1CandidateActivities".summary ELSE NULL END, CASE WHEN "vE1" ? 'notes' THEN "vC1CandidateActivities".notes ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."candidateAddUpdate"(jsonb) IS 'Save (insert or update) one Candidates record with its activities.';

-- Candidates: one record as JSON (camelCase keys), with lookup labels and activities
CREATE OR REPLACE FUNCTION "HumanResources"."getCandidateInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('sourceLabel', "Lookups"."getLookupLabel"('CandidateSource', t.source) ->> 'label', 'sourceTone', "Lookups"."getLookupLabel"('CandidateSource', t.source) ->> 'tone', 'stageLabel', "Lookups"."getLookupLabel"('CandidateStage', t.stage) ->> 'label', 'stageTone', "Lookups"."getLookupLabel"('CandidateStage', t.stage) ->> 'tone', 'offerStatusLabel', "Lookups"."getLookupLabel"('OfferStatus', t."offerStatus") ->> 'label', 'offerStatusTone', "Lookups"."getLookupLabel"('OfferStatus', t."offerStatus") ->> 'tone') ||
         jsonb_build_object('activities', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "HumanResources"."CandidateActivities" c1 WHERE c1."candidateId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "HumanResources"."Candidates" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getCandidateInfo"(uuid) IS 'Read one Candidates record (getter for its screens).';

-- PerformanceCycles: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."performanceCycleAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."PerformanceCycles";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."PerformanceCycles", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."PerformanceCycles" ("tenantId", name, "cycleType", "periodStart", "periodEnd", "goalSettingDue", "selfReviewDue", "managerReviewDue", "calibrationStart", "calibrationEnd", "signOffDue", "incrementsEffectiveMonth", "excludeProbation", "ratingScaleMax", stage, status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'cycleType' THEN "vRec"."cycleType" ELSE 'HALF_YEARLY' END, CASE WHEN "pData" ? 'periodStart' THEN "vRec"."periodStart" ELSE NULL END, CASE WHEN "pData" ? 'periodEnd' THEN "vRec"."periodEnd" ELSE NULL END, CASE WHEN "pData" ? 'goalSettingDue' THEN "vRec"."goalSettingDue" ELSE NULL END, CASE WHEN "pData" ? 'selfReviewDue' THEN "vRec"."selfReviewDue" ELSE NULL END, CASE WHEN "pData" ? 'managerReviewDue' THEN "vRec"."managerReviewDue" ELSE NULL END, CASE WHEN "pData" ? 'calibrationStart' THEN "vRec"."calibrationStart" ELSE NULL END, CASE WHEN "pData" ? 'calibrationEnd' THEN "vRec"."calibrationEnd" ELSE NULL END, CASE WHEN "pData" ? 'signOffDue' THEN "vRec"."signOffDue" ELSE NULL END, CASE WHEN "pData" ? 'incrementsEffectiveMonth' THEN "vRec"."incrementsEffectiveMonth" ELSE NULL END, CASE WHEN "pData" ? 'excludeProbation' THEN "vRec"."excludeProbation" ELSE TRUE END, CASE WHEN "pData" ? 'ratingScaleMax' THEN "vRec"."ratingScaleMax" ELSE 5 END, CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE 'GOAL_SETTING' END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'DRAFT' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."PerformanceCycles" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "cycleType" = CASE WHEN "pData" ? 'cycleType' THEN "vRec"."cycleType" ELSE t."cycleType" END,
           "periodStart" = CASE WHEN "pData" ? 'periodStart' THEN "vRec"."periodStart" ELSE t."periodStart" END,
           "periodEnd" = CASE WHEN "pData" ? 'periodEnd' THEN "vRec"."periodEnd" ELSE t."periodEnd" END,
           "goalSettingDue" = CASE WHEN "pData" ? 'goalSettingDue' THEN "vRec"."goalSettingDue" ELSE t."goalSettingDue" END,
           "selfReviewDue" = CASE WHEN "pData" ? 'selfReviewDue' THEN "vRec"."selfReviewDue" ELSE t."selfReviewDue" END,
           "managerReviewDue" = CASE WHEN "pData" ? 'managerReviewDue' THEN "vRec"."managerReviewDue" ELSE t."managerReviewDue" END,
           "calibrationStart" = CASE WHEN "pData" ? 'calibrationStart' THEN "vRec"."calibrationStart" ELSE t."calibrationStart" END,
           "calibrationEnd" = CASE WHEN "pData" ? 'calibrationEnd' THEN "vRec"."calibrationEnd" ELSE t."calibrationEnd" END,
           "signOffDue" = CASE WHEN "pData" ? 'signOffDue' THEN "vRec"."signOffDue" ELSE t."signOffDue" END,
           "incrementsEffectiveMonth" = CASE WHEN "pData" ? 'incrementsEffectiveMonth' THEN "vRec"."incrementsEffectiveMonth" ELSE t."incrementsEffectiveMonth" END,
           "excludeProbation" = CASE WHEN "pData" ? 'excludeProbation' THEN "vRec"."excludeProbation" ELSE t."excludeProbation" END,
           "ratingScaleMax" = CASE WHEN "pData" ? 'ratingScaleMax' THEN "vRec"."ratingScaleMax" ELSE t."ratingScaleMax" END,
           stage = CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE t.stage END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."PerformanceCycles" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PerformanceCycles %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PerformanceCycles % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."performanceCycleAddUpdate"(jsonb) IS 'Save (insert or update) one PerformanceCycles record.';

-- PerformanceCycles: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getPerformanceCycleInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('cycleTypeLabel', "Lookups"."getLookupLabel"('CycleType', t."cycleType") ->> 'label', 'cycleTypeTone', "Lookups"."getLookupLabel"('CycleType', t."cycleType") ->> 'tone', 'stageLabel', "Lookups"."getLookupLabel"('PerformanceCycleStage', t.stage) ->> 'label', 'stageTone', "Lookups"."getLookupLabel"('PerformanceCycleStage', t.stage) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('PerformanceCycleStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('PerformanceCycleStatus', t.status) ->> 'tone')
    FROM "HumanResources"."PerformanceCycles" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getPerformanceCycleInfo"(uuid) IS 'Read one PerformanceCycles record (getter for its screens).';

-- PerformanceReviews: insert (no "id") or update (with "id"); child arrays: competencies
CREATE OR REPLACE FUNCTION "HumanResources"."performanceReviewAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."PerformanceReviews";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1CompetencyRatings" "HumanResources"."CompetencyRatings";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."PerformanceReviews", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."PerformanceReviews" ("tenantId", "cycleId", "employeeId", "managerEmployeeId", "goalAchievementPct", "selfRating", "managerRating", "finalRating", "ratingLabel", "performanceBand", "potentialBand", "pipSuggested", stage, "selfComment", "managerComment", "selfSubmittedAt", "managerSubmittedAt", "calibratedAt", "signedOffAt", "incrementPctRecommended")
    VALUES ("vTenant", CASE WHEN "pData" ? 'cycleId' THEN "vRec"."cycleId" ELSE NULL END, CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'managerEmployeeId' THEN "vRec"."managerEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'goalAchievementPct' THEN "vRec"."goalAchievementPct" ELSE NULL END, CASE WHEN "pData" ? 'selfRating' THEN "vRec"."selfRating" ELSE NULL END, CASE WHEN "pData" ? 'managerRating' THEN "vRec"."managerRating" ELSE NULL END, CASE WHEN "pData" ? 'finalRating' THEN "vRec"."finalRating" ELSE NULL END, CASE WHEN "pData" ? 'ratingLabel' THEN "vRec"."ratingLabel" ELSE NULL END, CASE WHEN "pData" ? 'performanceBand' THEN "vRec"."performanceBand" ELSE NULL END, CASE WHEN "pData" ? 'potentialBand' THEN "vRec"."potentialBand" ELSE NULL END, CASE WHEN "pData" ? 'pipSuggested' THEN "vRec"."pipSuggested" ELSE FALSE END, CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE 'SELF_PENDING' END, CASE WHEN "pData" ? 'selfComment' THEN "vRec"."selfComment" ELSE NULL END, CASE WHEN "pData" ? 'managerComment' THEN "vRec"."managerComment" ELSE NULL END, CASE WHEN "pData" ? 'selfSubmittedAt' THEN "vRec"."selfSubmittedAt" ELSE NULL END, CASE WHEN "pData" ? 'managerSubmittedAt' THEN "vRec"."managerSubmittedAt" ELSE NULL END, CASE WHEN "pData" ? 'calibratedAt' THEN "vRec"."calibratedAt" ELSE NULL END, CASE WHEN "pData" ? 'signedOffAt' THEN "vRec"."signedOffAt" ELSE NULL END, CASE WHEN "pData" ? 'incrementPctRecommended' THEN "vRec"."incrementPctRecommended" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."PerformanceReviews" t
       SET "cycleId" = CASE WHEN "pData" ? 'cycleId' THEN "vRec"."cycleId" ELSE t."cycleId" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "managerEmployeeId" = CASE WHEN "pData" ? 'managerEmployeeId' THEN "vRec"."managerEmployeeId" ELSE t."managerEmployeeId" END,
           "goalAchievementPct" = CASE WHEN "pData" ? 'goalAchievementPct' THEN "vRec"."goalAchievementPct" ELSE t."goalAchievementPct" END,
           "selfRating" = CASE WHEN "pData" ? 'selfRating' THEN "vRec"."selfRating" ELSE t."selfRating" END,
           "managerRating" = CASE WHEN "pData" ? 'managerRating' THEN "vRec"."managerRating" ELSE t."managerRating" END,
           "finalRating" = CASE WHEN "pData" ? 'finalRating' THEN "vRec"."finalRating" ELSE t."finalRating" END,
           "ratingLabel" = CASE WHEN "pData" ? 'ratingLabel' THEN "vRec"."ratingLabel" ELSE t."ratingLabel" END,
           "performanceBand" = CASE WHEN "pData" ? 'performanceBand' THEN "vRec"."performanceBand" ELSE t."performanceBand" END,
           "potentialBand" = CASE WHEN "pData" ? 'potentialBand' THEN "vRec"."potentialBand" ELSE t."potentialBand" END,
           "pipSuggested" = CASE WHEN "pData" ? 'pipSuggested' THEN "vRec"."pipSuggested" ELSE t."pipSuggested" END,
           stage = CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE t.stage END,
           "selfComment" = CASE WHEN "pData" ? 'selfComment' THEN "vRec"."selfComment" ELSE t."selfComment" END,
           "managerComment" = CASE WHEN "pData" ? 'managerComment' THEN "vRec"."managerComment" ELSE t."managerComment" END,
           "selfSubmittedAt" = CASE WHEN "pData" ? 'selfSubmittedAt' THEN "vRec"."selfSubmittedAt" ELSE t."selfSubmittedAt" END,
           "managerSubmittedAt" = CASE WHEN "pData" ? 'managerSubmittedAt' THEN "vRec"."managerSubmittedAt" ELSE t."managerSubmittedAt" END,
           "calibratedAt" = CASE WHEN "pData" ? 'calibratedAt' THEN "vRec"."calibratedAt" ELSE t."calibratedAt" END,
           "signedOffAt" = CASE WHEN "pData" ? 'signedOffAt' THEN "vRec"."signedOffAt" ELSE t."signedOffAt" END,
           "incrementPctRecommended" = CASE WHEN "pData" ? 'incrementPctRecommended' THEN "vRec"."incrementPctRecommended" ELSE t."incrementPctRecommended" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."PerformanceReviews" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PerformanceReviews %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PerformanceReviews % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'competencies' THEN
    -- competencies: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "HumanResources"."CompetencyRatings"
     WHERE "tenantId" = "vTenant" AND "performanceReviewId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'competencies') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'competencies') WITH ORDINALITY t(x, n) LOOP
      "vC1CompetencyRatings" := jsonb_populate_record(NULL::"HumanResources"."CompetencyRatings", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "HumanResources"."CompetencyRatings" t
           SET competency = CASE WHEN "vE1" ? 'competency' THEN "vC1CompetencyRatings".competency ELSE t.competency END,
               "competencyDescription" = CASE WHEN "vE1" ? 'competencyDescription' THEN "vC1CompetencyRatings"."competencyDescription" ELSE t."competencyDescription" END,
               "raterRole" = CASE WHEN "vE1" ? 'raterRole' THEN "vC1CompetencyRatings"."raterRole" ELSE t."raterRole" END,
               rating = CASE WHEN "vE1" ? 'rating' THEN "vC1CompetencyRatings".rating ELSE t.rating END,
               evidence = CASE WHEN "vE1" ? 'evidence' THEN "vC1CompetencyRatings".evidence ELSE t.evidence END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."performanceReviewId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'CompetencyRatings: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "HumanResources"."CompetencyRatings" ("performanceReviewId", "tenantId", competency, "competencyDescription", "raterRole", rating, evidence)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'competency' THEN "vC1CompetencyRatings".competency ELSE NULL END, CASE WHEN "vE1" ? 'competencyDescription' THEN "vC1CompetencyRatings"."competencyDescription" ELSE NULL END, CASE WHEN "vE1" ? 'raterRole' THEN "vC1CompetencyRatings"."raterRole" ELSE NULL END, CASE WHEN "vE1" ? 'rating' THEN "vC1CompetencyRatings".rating ELSE NULL END, CASE WHEN "vE1" ? 'evidence' THEN "vC1CompetencyRatings".evidence ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."performanceReviewAddUpdate"(jsonb) IS 'Save (insert or update) one PerformanceReviews record with its competencies.';

-- PerformanceReviews: one record as JSON (camelCase keys), with lookup labels and competencies
CREATE OR REPLACE FUNCTION "HumanResources"."getPerformanceReviewInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('ratingLabelLabel', "Lookups"."getLookupLabel"('RatingLabel', t."ratingLabel") ->> 'label', 'ratingLabelTone', "Lookups"."getLookupLabel"('RatingLabel', t."ratingLabel") ->> 'tone', 'performanceBandLabel', "Lookups"."getLookupLabel"('PerformanceBand', t."performanceBand") ->> 'label', 'performanceBandTone', "Lookups"."getLookupLabel"('PerformanceBand', t."performanceBand") ->> 'tone', 'potentialBandLabel', "Lookups"."getLookupLabel"('PotentialBand', t."potentialBand") ->> 'label', 'potentialBandTone', "Lookups"."getLookupLabel"('PotentialBand', t."potentialBand") ->> 'tone', 'stageLabel', "Lookups"."getLookupLabel"('PerformanceReviewStage', t.stage) ->> 'label', 'stageTone', "Lookups"."getLookupLabel"('PerformanceReviewStage', t.stage) ->> 'tone') ||
         jsonb_build_object('competencies', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "HumanResources"."CompetencyRatings" c1 WHERE c1."performanceReviewId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "HumanResources"."PerformanceReviews" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getPerformanceReviewInfo"(uuid) IS 'Read one PerformanceReviews record (getter for its screens).';

-- Goals: insert (no "id") or update (with "id"); child arrays: keyResults
CREATE OR REPLACE FUNCTION "HumanResources"."goalAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."Goals";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1KeyResults" "HumanResources"."KeyResults";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."Goals", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."Goals" ("tenantId", "employeeId", "cycleId", "performanceReviewId", "goalKind", title, description, "weightPct", unit, "targetValue", "actualValue", "progressPct", status, "fromLibrary", "sortOrder")
    VALUES ("vTenant", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'cycleId' THEN "vRec"."cycleId" ELSE NULL END, CASE WHEN "pData" ? 'performanceReviewId' THEN "vRec"."performanceReviewId" ELSE NULL END, CASE WHEN "pData" ? 'goalKind' THEN "vRec"."goalKind" ELSE 'KRA' END, CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'weightPct' THEN "vRec"."weightPct" ELSE NULL END, CASE WHEN "pData" ? 'unit' THEN "vRec".unit ELSE NULL END, CASE WHEN "pData" ? 'targetValue' THEN "vRec"."targetValue" ELSE NULL END, CASE WHEN "pData" ? 'actualValue' THEN "vRec"."actualValue" ELSE NULL END, CASE WHEN "pData" ? 'progressPct' THEN "vRec"."progressPct" ELSE 0 END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ON_TRACK' END, CASE WHEN "pData" ? 'fromLibrary' THEN "vRec"."fromLibrary" ELSE FALSE END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."Goals" t
       SET "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "cycleId" = CASE WHEN "pData" ? 'cycleId' THEN "vRec"."cycleId" ELSE t."cycleId" END,
           "performanceReviewId" = CASE WHEN "pData" ? 'performanceReviewId' THEN "vRec"."performanceReviewId" ELSE t."performanceReviewId" END,
           "goalKind" = CASE WHEN "pData" ? 'goalKind' THEN "vRec"."goalKind" ELSE t."goalKind" END,
           title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "weightPct" = CASE WHEN "pData" ? 'weightPct' THEN "vRec"."weightPct" ELSE t."weightPct" END,
           unit = CASE WHEN "pData" ? 'unit' THEN "vRec".unit ELSE t.unit END,
           "targetValue" = CASE WHEN "pData" ? 'targetValue' THEN "vRec"."targetValue" ELSE t."targetValue" END,
           "actualValue" = CASE WHEN "pData" ? 'actualValue' THEN "vRec"."actualValue" ELSE t."actualValue" END,
           "progressPct" = CASE WHEN "pData" ? 'progressPct' THEN "vRec"."progressPct" ELSE t."progressPct" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "fromLibrary" = CASE WHEN "pData" ? 'fromLibrary' THEN "vRec"."fromLibrary" ELSE t."fromLibrary" END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."Goals" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Goals %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Goals % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'keyResults' THEN
    -- keyResults: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "HumanResources"."KeyResults"
     WHERE "tenantId" = "vTenant" AND "goalId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'keyResults') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'keyResults') WITH ORDINALITY t(x, n) LOOP
      "vC1KeyResults" := jsonb_populate_record(NULL::"HumanResources"."KeyResults", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "HumanResources"."KeyResults" t
           SET title = CASE WHEN "vE1" ? 'title' THEN "vC1KeyResults".title ELSE t.title END,
               "weightPct" = CASE WHEN "vE1" ? 'weightPct' THEN "vC1KeyResults"."weightPct" ELSE t."weightPct" END,
               unit = CASE WHEN "vE1" ? 'unit' THEN "vC1KeyResults".unit ELSE t.unit END,
               "startValue" = CASE WHEN "vE1" ? 'startValue' THEN "vC1KeyResults"."startValue" ELSE t."startValue" END,
               "targetValue" = CASE WHEN "vE1" ? 'targetValue' THEN "vC1KeyResults"."targetValue" ELSE t."targetValue" END,
               "currentValue" = CASE WHEN "vE1" ? 'currentValue' THEN "vC1KeyResults"."currentValue" ELSE t."currentValue" END,
               "progressPct" = CASE WHEN "vE1" ? 'progressPct' THEN "vC1KeyResults"."progressPct" ELSE t."progressPct" END,
               "sortOrder" = CASE WHEN "vE1" ? 'sortOrder' THEN "vC1KeyResults"."sortOrder" ELSE t."sortOrder" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."goalId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'KeyResults: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "HumanResources"."KeyResults" ("goalId", "tenantId", title, "weightPct", unit, "startValue", "targetValue", "currentValue", "progressPct", "sortOrder")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'title' THEN "vC1KeyResults".title ELSE NULL END, CASE WHEN "vE1" ? 'weightPct' THEN "vC1KeyResults"."weightPct" ELSE NULL END, CASE WHEN "vE1" ? 'unit' THEN "vC1KeyResults".unit ELSE NULL END, CASE WHEN "vE1" ? 'startValue' THEN "vC1KeyResults"."startValue" ELSE NULL END, CASE WHEN "vE1" ? 'targetValue' THEN "vC1KeyResults"."targetValue" ELSE NULL END, CASE WHEN "vE1" ? 'currentValue' THEN "vC1KeyResults"."currentValue" ELSE NULL END, CASE WHEN "vE1" ? 'progressPct' THEN "vC1KeyResults"."progressPct" ELSE 0 END, CASE WHEN "vE1" ? 'sortOrder' THEN "vC1KeyResults"."sortOrder" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."goalAddUpdate"(jsonb) IS 'Save (insert or update) one Goals record with its keyResults.';

-- Goals: one record as JSON (camelCase keys), with lookup labels and keyResults
CREATE OR REPLACE FUNCTION "HumanResources"."getGoalInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('goalKindLabel', "Lookups"."getLookupLabel"('GoalKind', t."goalKind") ->> 'label', 'goalKindTone', "Lookups"."getLookupLabel"('GoalKind', t."goalKind") ->> 'tone', 'unitLabel', "Lookups"."getLookupLabel"('GoalUnit', t.unit) ->> 'label', 'unitTone', "Lookups"."getLookupLabel"('GoalUnit', t.unit) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('GoalStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('GoalStatus', t.status) ->> 'tone') ||
         jsonb_build_object('keyResults', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."sortOrder") FROM "HumanResources"."KeyResults" c1 WHERE c1."goalId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "HumanResources"."Goals" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getGoalInfo"(uuid) IS 'Read one Goals record (getter for its screens).';

-- OneOnOneMeetings: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."oneOnOneMeetingAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."OneOnOneMeetings";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."OneOnOneMeetings", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."OneOnOneMeetings" ("tenantId", "employeeId", "managerEmployeeId", "meetingDate", topic, notes, "actionItems", "cycleId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'managerEmployeeId' THEN "vRec"."managerEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'meetingDate' THEN "vRec"."meetingDate" ELSE NULL END, CASE WHEN "pData" ? 'topic' THEN "vRec".topic ELSE NULL END, CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE NULL END, CASE WHEN "pData" ? 'actionItems' THEN "vRec"."actionItems" ELSE CAST('[]' AS jsonb) END, CASE WHEN "pData" ? 'cycleId' THEN "vRec"."cycleId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."OneOnOneMeetings" t
       SET "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "managerEmployeeId" = CASE WHEN "pData" ? 'managerEmployeeId' THEN "vRec"."managerEmployeeId" ELSE t."managerEmployeeId" END,
           "meetingDate" = CASE WHEN "pData" ? 'meetingDate' THEN "vRec"."meetingDate" ELSE t."meetingDate" END,
           topic = CASE WHEN "pData" ? 'topic' THEN "vRec".topic ELSE t.topic END,
           notes = CASE WHEN "pData" ? 'notes' THEN "vRec".notes ELSE t.notes END,
           "actionItems" = CASE WHEN "pData" ? 'actionItems' THEN "vRec"."actionItems" ELSE t."actionItems" END,
           "cycleId" = CASE WHEN "pData" ? 'cycleId' THEN "vRec"."cycleId" ELSE t."cycleId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."OneOnOneMeetings" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'OneOnOneMeetings %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'OneOnOneMeetings % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."oneOnOneMeetingAddUpdate"(jsonb) IS 'Save (insert or update) one OneOnOneMeetings record.';

-- OneOnOneMeetings: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getOneOnOneMeetingInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "HumanResources"."OneOnOneMeetings" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getOneOnOneMeetingInfo"(uuid) IS 'Read one OneOnOneMeetings record (getter for its screens).';

-- PerformanceFeedback: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."performanceFeedbackAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."PerformanceFeedback";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."PerformanceFeedback", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."PerformanceFeedback" ("tenantId", "toEmployeeId", "fromEmployeeId", "requestedByEmployeeId", relationship, tag, body, "cycleId", "requestedAt", "givenAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'toEmployeeId' THEN "vRec"."toEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'fromEmployeeId' THEN "vRec"."fromEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'requestedByEmployeeId' THEN "vRec"."requestedByEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'relationship' THEN "vRec".relationship ELSE NULL END, CASE WHEN "pData" ? 'tag' THEN "vRec".tag ELSE NULL END, CASE WHEN "pData" ? 'body' THEN "vRec".body ELSE NULL END, CASE WHEN "pData" ? 'cycleId' THEN "vRec"."cycleId" ELSE NULL END, CASE WHEN "pData" ? 'requestedAt' THEN "vRec"."requestedAt" ELSE NULL END, CASE WHEN "pData" ? 'givenAt' THEN "vRec"."givenAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."PerformanceFeedback" t
       SET "toEmployeeId" = CASE WHEN "pData" ? 'toEmployeeId' THEN "vRec"."toEmployeeId" ELSE t."toEmployeeId" END,
           "fromEmployeeId" = CASE WHEN "pData" ? 'fromEmployeeId' THEN "vRec"."fromEmployeeId" ELSE t."fromEmployeeId" END,
           "requestedByEmployeeId" = CASE WHEN "pData" ? 'requestedByEmployeeId' THEN "vRec"."requestedByEmployeeId" ELSE t."requestedByEmployeeId" END,
           relationship = CASE WHEN "pData" ? 'relationship' THEN "vRec".relationship ELSE t.relationship END,
           tag = CASE WHEN "pData" ? 'tag' THEN "vRec".tag ELSE t.tag END,
           body = CASE WHEN "pData" ? 'body' THEN "vRec".body ELSE t.body END,
           "cycleId" = CASE WHEN "pData" ? 'cycleId' THEN "vRec"."cycleId" ELSE t."cycleId" END,
           "requestedAt" = CASE WHEN "pData" ? 'requestedAt' THEN "vRec"."requestedAt" ELSE t."requestedAt" END,
           "givenAt" = CASE WHEN "pData" ? 'givenAt' THEN "vRec"."givenAt" ELSE t."givenAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."PerformanceFeedback" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PerformanceFeedback %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PerformanceFeedback % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."performanceFeedbackAddUpdate"(jsonb) IS 'Save (insert or update) one PerformanceFeedback record.';

-- PerformanceFeedback: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getPerformanceFeedbackInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('relationshipLabel', "Lookups"."getLookupLabel"('Relationship', t.relationship) ->> 'label', 'relationshipTone', "Lookups"."getLookupLabel"('Relationship', t.relationship) ->> 'tone', 'tagLabel', "Lookups"."getLookupLabel"('Tag', t.tag) ->> 'label', 'tagTone', "Lookups"."getLookupLabel"('Tag', t.tag) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('PerformanceFeedbackStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('PerformanceFeedbackStatus', t.status) ->> 'tone')
    FROM "HumanResources"."PerformanceFeedback" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getPerformanceFeedbackInfo"(uuid) IS 'Read one PerformanceFeedback record (getter for its screens).';

-- TrainingPrograms: insert (no "id") or update (with "id"); child arrays: sessions
CREATE OR REPLACE FUNCTION "HumanResources"."trainingProgramAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."TrainingPrograms";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1TrainingSessions" "HumanResources"."TrainingSessions";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."TrainingPrograms", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."TrainingPrograms" ("tenantId", code, name, audience, "departmentId", format, "durationLabel", "durationHours", provider, "isMandatory", "isCpdCertified", seats, "targetParticipants", budget, "costPerHead", "grantsCertification", "certificationValidityMonths", "startDate", "endDate", status, description)
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'audience' THEN "vRec".audience ELSE NULL END, CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE NULL END, CASE WHEN "pData" ? 'format' THEN "vRec".format ELSE NULL END, CASE WHEN "pData" ? 'durationLabel' THEN "vRec"."durationLabel" ELSE NULL END, CASE WHEN "pData" ? 'durationHours' THEN "vRec"."durationHours" ELSE NULL END, CASE WHEN "pData" ? 'provider' THEN "vRec".provider ELSE NULL END, CASE WHEN "pData" ? 'isMandatory' THEN "vRec"."isMandatory" ELSE FALSE END, CASE WHEN "pData" ? 'isCpdCertified' THEN "vRec"."isCpdCertified" ELSE FALSE END, CASE WHEN "pData" ? 'seats' THEN "vRec".seats ELSE NULL END, CASE WHEN "pData" ? 'targetParticipants' THEN "vRec"."targetParticipants" ELSE NULL END, CASE WHEN "pData" ? 'budget' THEN "vRec".budget ELSE NULL END, CASE WHEN "pData" ? 'costPerHead' THEN "vRec"."costPerHead" ELSE NULL END, CASE WHEN "pData" ? 'grantsCertification' THEN "vRec"."grantsCertification" ELSE NULL END, CASE WHEN "pData" ? 'certificationValidityMonths' THEN "vRec"."certificationValidityMonths" ELSE NULL END, CASE WHEN "pData" ? 'startDate' THEN "vRec"."startDate" ELSE NULL END, CASE WHEN "pData" ? 'endDate' THEN "vRec"."endDate" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'PLANNED' END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."TrainingPrograms" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           audience = CASE WHEN "pData" ? 'audience' THEN "vRec".audience ELSE t.audience END,
           "departmentId" = CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE t."departmentId" END,
           format = CASE WHEN "pData" ? 'format' THEN "vRec".format ELSE t.format END,
           "durationLabel" = CASE WHEN "pData" ? 'durationLabel' THEN "vRec"."durationLabel" ELSE t."durationLabel" END,
           "durationHours" = CASE WHEN "pData" ? 'durationHours' THEN "vRec"."durationHours" ELSE t."durationHours" END,
           provider = CASE WHEN "pData" ? 'provider' THEN "vRec".provider ELSE t.provider END,
           "isMandatory" = CASE WHEN "pData" ? 'isMandatory' THEN "vRec"."isMandatory" ELSE t."isMandatory" END,
           "isCpdCertified" = CASE WHEN "pData" ? 'isCpdCertified' THEN "vRec"."isCpdCertified" ELSE t."isCpdCertified" END,
           seats = CASE WHEN "pData" ? 'seats' THEN "vRec".seats ELSE t.seats END,
           "targetParticipants" = CASE WHEN "pData" ? 'targetParticipants' THEN "vRec"."targetParticipants" ELSE t."targetParticipants" END,
           budget = CASE WHEN "pData" ? 'budget' THEN "vRec".budget ELSE t.budget END,
           "costPerHead" = CASE WHEN "pData" ? 'costPerHead' THEN "vRec"."costPerHead" ELSE t."costPerHead" END,
           "grantsCertification" = CASE WHEN "pData" ? 'grantsCertification' THEN "vRec"."grantsCertification" ELSE t."grantsCertification" END,
           "certificationValidityMonths" = CASE WHEN "pData" ? 'certificationValidityMonths' THEN "vRec"."certificationValidityMonths" ELSE t."certificationValidityMonths" END,
           "startDate" = CASE WHEN "pData" ? 'startDate' THEN "vRec"."startDate" ELSE t."startDate" END,
           "endDate" = CASE WHEN "pData" ? 'endDate' THEN "vRec"."endDate" ELSE t."endDate" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."TrainingPrograms" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'TrainingPrograms %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'TrainingPrograms % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'sessions' THEN
    -- sessions: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "HumanResources"."TrainingSessions"
     WHERE "tenantId" = "vTenant" AND "programId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'sessions') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'sessions') WITH ORDINALITY t(x, n) LOOP
      "vC1TrainingSessions" := jsonb_populate_record(NULL::"HumanResources"."TrainingSessions", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "HumanResources"."TrainingSessions" t
           SET title = CASE WHEN "vE1" ? 'title' THEN "vC1TrainingSessions".title ELSE t.title END,
               "startsAt" = CASE WHEN "vE1" ? 'startsAt' THEN "vC1TrainingSessions"."startsAt" ELSE t."startsAt" END,
               "endsAt" = CASE WHEN "vE1" ? 'endsAt' THEN "vC1TrainingSessions"."endsAt" ELSE t."endsAt" END,
               "deliveryMode" = CASE WHEN "vE1" ? 'deliveryMode' THEN "vC1TrainingSessions"."deliveryMode" ELSE t."deliveryMode" END,
               venue = CASE WHEN "vE1" ? 'venue' THEN "vC1TrainingSessions".venue ELSE t.venue END,
               "branchId" = CASE WHEN "vE1" ? 'branchId' THEN "vC1TrainingSessions"."branchId" ELSE t."branchId" END,
               trainer = CASE WHEN "vE1" ? 'trainer' THEN "vC1TrainingSessions".trainer ELSE t.trainer END,
               seats = CASE WHEN "vE1" ? 'seats' THEN "vC1TrainingSessions".seats ELSE t.seats END,
               "isMandatory" = CASE WHEN "vE1" ? 'isMandatory' THEN "vC1TrainingSessions"."isMandatory" ELSE t."isMandatory" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1TrainingSessions".status ELSE t.status END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."programId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'TrainingSessions: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "HumanResources"."TrainingSessions" ("programId", "tenantId", title, "startsAt", "endsAt", "deliveryMode", venue, "branchId", trainer, seats, "isMandatory", status)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'title' THEN "vC1TrainingSessions".title ELSE NULL END, CASE WHEN "vE1" ? 'startsAt' THEN "vC1TrainingSessions"."startsAt" ELSE NULL END, CASE WHEN "vE1" ? 'endsAt' THEN "vC1TrainingSessions"."endsAt" ELSE NULL END, CASE WHEN "vE1" ? 'deliveryMode' THEN "vC1TrainingSessions"."deliveryMode" ELSE 'IN_PERSON' END, CASE WHEN "vE1" ? 'venue' THEN "vC1TrainingSessions".venue ELSE NULL END, CASE WHEN "vE1" ? 'branchId' THEN "vC1TrainingSessions"."branchId" ELSE NULL END, CASE WHEN "vE1" ? 'trainer' THEN "vC1TrainingSessions".trainer ELSE NULL END, CASE WHEN "vE1" ? 'seats' THEN "vC1TrainingSessions".seats ELSE NULL END, CASE WHEN "vE1" ? 'isMandatory' THEN "vC1TrainingSessions"."isMandatory" ELSE FALSE END, CASE WHEN "vE1" ? 'status' THEN "vC1TrainingSessions".status ELSE 'SCHEDULED' END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."trainingProgramAddUpdate"(jsonb) IS 'Save (insert or update) one TrainingPrograms record with its sessions.';

-- TrainingPrograms: one record as JSON (camelCase keys), with lookup labels and sessions
CREATE OR REPLACE FUNCTION "HumanResources"."getTrainingProgramInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('formatLabel', "Lookups"."getLookupLabel"('TrainingProgramFormat', t.format) ->> 'label', 'formatTone', "Lookups"."getLookupLabel"('TrainingProgramFormat', t.format) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('TrainingProgramStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('TrainingProgramStatus', t.status) ->> 'tone') ||
         jsonb_build_object('sessions', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "HumanResources"."TrainingSessions" c1 WHERE c1."programId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "HumanResources"."TrainingPrograms" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getTrainingProgramInfo"(uuid) IS 'Read one TrainingPrograms record (getter for its screens).';

-- TrainingEnrolments: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."trainingEnrolmentAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."TrainingEnrolments";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."TrainingEnrolments", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."TrainingEnrolments" ("tenantId", "programId", "employeeId", "enrolledOn", "progressPct", "scorePct", "hoursCompleted", cost, status, "completedOn")
    VALUES ("vTenant", CASE WHEN "pData" ? 'programId' THEN "vRec"."programId" ELSE NULL END, CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'enrolledOn' THEN "vRec"."enrolledOn" ELSE CURRENT_DATE END, CASE WHEN "pData" ? 'progressPct' THEN "vRec"."progressPct" ELSE 0 END, CASE WHEN "pData" ? 'scorePct' THEN "vRec"."scorePct" ELSE NULL END, CASE WHEN "pData" ? 'hoursCompleted' THEN "vRec"."hoursCompleted" ELSE 0 END, CASE WHEN "pData" ? 'cost' THEN "vRec".cost ELSE 0 END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ENROLLED' END, CASE WHEN "pData" ? 'completedOn' THEN "vRec"."completedOn" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."TrainingEnrolments" t
       SET "programId" = CASE WHEN "pData" ? 'programId' THEN "vRec"."programId" ELSE t."programId" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "enrolledOn" = CASE WHEN "pData" ? 'enrolledOn' THEN "vRec"."enrolledOn" ELSE t."enrolledOn" END,
           "progressPct" = CASE WHEN "pData" ? 'progressPct' THEN "vRec"."progressPct" ELSE t."progressPct" END,
           "scorePct" = CASE WHEN "pData" ? 'scorePct' THEN "vRec"."scorePct" ELSE t."scorePct" END,
           "hoursCompleted" = CASE WHEN "pData" ? 'hoursCompleted' THEN "vRec"."hoursCompleted" ELSE t."hoursCompleted" END,
           cost = CASE WHEN "pData" ? 'cost' THEN "vRec".cost ELSE t.cost END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "completedOn" = CASE WHEN "pData" ? 'completedOn' THEN "vRec"."completedOn" ELSE t."completedOn" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."TrainingEnrolments" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'TrainingEnrolments %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'TrainingEnrolments % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."trainingEnrolmentAddUpdate"(jsonb) IS 'Save (insert or update) one TrainingEnrolments record.';

-- TrainingEnrolments: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getTrainingEnrolmentInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('TrainingEnrolmentStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('TrainingEnrolmentStatus', t.status) ->> 'tone')
    FROM "HumanResources"."TrainingEnrolments" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getTrainingEnrolmentInfo"(uuid) IS 'Read one TrainingEnrolments record (getter for its screens).';

-- Certifications: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "HumanResources"."certificationAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "HumanResources"."Certifications";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"HumanResources"."Certifications", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "HumanResources"."Certifications" ("tenantId", "employeeId", name, issuer, "certificateNo", "issuedOn", "expiresOn", "trainingEnrolmentId", "attachmentId", status, "reminderSentAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'issuer' THEN "vRec".issuer ELSE NULL END, CASE WHEN "pData" ? 'certificateNo' THEN "vRec"."certificateNo" ELSE NULL END, CASE WHEN "pData" ? 'issuedOn' THEN "vRec"."issuedOn" ELSE NULL END, CASE WHEN "pData" ? 'expiresOn' THEN "vRec"."expiresOn" ELSE NULL END, CASE WHEN "pData" ? 'trainingEnrolmentId' THEN "vRec"."trainingEnrolmentId" ELSE NULL END, CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'reminderSentAt' THEN "vRec"."reminderSentAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "HumanResources"."Certifications" t
       SET "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           issuer = CASE WHEN "pData" ? 'issuer' THEN "vRec".issuer ELSE t.issuer END,
           "certificateNo" = CASE WHEN "pData" ? 'certificateNo' THEN "vRec"."certificateNo" ELSE t."certificateNo" END,
           "issuedOn" = CASE WHEN "pData" ? 'issuedOn' THEN "vRec"."issuedOn" ELSE t."issuedOn" END,
           "expiresOn" = CASE WHEN "pData" ? 'expiresOn' THEN "vRec"."expiresOn" ELSE t."expiresOn" END,
           "trainingEnrolmentId" = CASE WHEN "pData" ? 'trainingEnrolmentId' THEN "vRec"."trainingEnrolmentId" ELSE t."trainingEnrolmentId" END,
           "attachmentId" = CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE t."attachmentId" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "reminderSentAt" = CASE WHEN "pData" ? 'reminderSentAt' THEN "vRec"."reminderSentAt" ELSE t."reminderSentAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "HumanResources"."Certifications" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Certifications %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Certifications % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "HumanResources"."certificationAddUpdate"(jsonb) IS 'Save (insert or update) one Certifications record.';

-- Certifications: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "HumanResources"."getCertificationInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('CertificationStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('CertificationStatus', t.status) ->> 'tone')
    FROM "HumanResources"."Certifications" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "HumanResources"."getCertificationInfo"(uuid) IS 'Read one Certifications record (getter for its screens).';
