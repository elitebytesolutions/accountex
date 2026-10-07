-- =============================================================================
-- Finsoft ERP (Full edition) — API: "Reports"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- SavedReports: insert (no "id") or update (with "id"); child arrays: columns, shares
CREATE OR REPLACE FUNCTION "Reports"."savedReportAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Reports"."SavedReports";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1SavedReportColumns" "Reports"."SavedReportColumns";
  "vC1SavedReportShares" "Reports"."SavedReportShares";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Reports"."SavedReports", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Reports"."SavedReports" ("tenantId", name, description, folder, kind, studio, "studioTab", "sourceEntity", "dateRange", "dateFrom", "dateTo", "branchId", filters, "groupBy", "sortField", "sortDir", "rowLimit", "showTotals", "viewMode", display, "chartType", options, "defaultFormat", visibility, "ownerUserId", "isFavourite", "isSystem", status, "lastRunAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'folder' THEN "vRec".folder ELSE 'GENERAL' END, CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE NULL END, CASE WHEN "pData" ? 'studio' THEN "vRec".studio ELSE NULL END, CASE WHEN "pData" ? 'studioTab' THEN "vRec"."studioTab" ELSE NULL END, CASE WHEN "pData" ? 'sourceEntity' THEN "vRec"."sourceEntity" ELSE NULL END, CASE WHEN "pData" ? 'dateRange' THEN "vRec"."dateRange" ELSE 'THIS_QUARTER' END, CASE WHEN "pData" ? 'dateFrom' THEN "vRec"."dateFrom" ELSE NULL END, CASE WHEN "pData" ? 'dateTo' THEN "vRec"."dateTo" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'filters' THEN "vRec".filters ELSE CAST('[]' AS jsonb) END, CASE WHEN "pData" ? 'groupBy' THEN "vRec"."groupBy" ELSE '{}' END, CASE WHEN "pData" ? 'sortField' THEN "vRec"."sortField" ELSE NULL END, CASE WHEN "pData" ? 'sortDir' THEN "vRec"."sortDir" ELSE 'DESC' END, CASE WHEN "pData" ? 'rowLimit' THEN "vRec"."rowLimit" ELSE NULL END, CASE WHEN "pData" ? 'showTotals' THEN "vRec"."showTotals" ELSE TRUE END, CASE WHEN "pData" ? 'viewMode' THEN "vRec"."viewMode" ELSE 'DETAIL' END, CASE WHEN "pData" ? 'display' THEN "vRec".display ELSE 'TABLE' END, CASE WHEN "pData" ? 'chartType' THEN "vRec"."chartType" ELSE NULL END, CASE WHEN "pData" ? 'options' THEN "vRec".options ELSE CAST('{}' AS jsonb) END, CASE WHEN "pData" ? 'defaultFormat' THEN "vRec"."defaultFormat" ELSE 'PDF' END, CASE WHEN "pData" ? 'visibility' THEN "vRec".visibility ELSE 'PRIVATE' END, CASE WHEN "pData" ? 'ownerUserId' THEN "vRec"."ownerUserId" ELSE NULL END, CASE WHEN "pData" ? 'isFavourite' THEN "vRec"."isFavourite" ELSE FALSE END, CASE WHEN "pData" ? 'isSystem' THEN "vRec"."isSystem" ELSE FALSE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'lastRunAt' THEN "vRec"."lastRunAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Reports"."SavedReports" t
       SET name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           folder = CASE WHEN "pData" ? 'folder' THEN "vRec".folder ELSE t.folder END,
           kind = CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE t.kind END,
           studio = CASE WHEN "pData" ? 'studio' THEN "vRec".studio ELSE t.studio END,
           "studioTab" = CASE WHEN "pData" ? 'studioTab' THEN "vRec"."studioTab" ELSE t."studioTab" END,
           "sourceEntity" = CASE WHEN "pData" ? 'sourceEntity' THEN "vRec"."sourceEntity" ELSE t."sourceEntity" END,
           "dateRange" = CASE WHEN "pData" ? 'dateRange' THEN "vRec"."dateRange" ELSE t."dateRange" END,
           "dateFrom" = CASE WHEN "pData" ? 'dateFrom' THEN "vRec"."dateFrom" ELSE t."dateFrom" END,
           "dateTo" = CASE WHEN "pData" ? 'dateTo' THEN "vRec"."dateTo" ELSE t."dateTo" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           filters = CASE WHEN "pData" ? 'filters' THEN "vRec".filters ELSE t.filters END,
           "groupBy" = CASE WHEN "pData" ? 'groupBy' THEN "vRec"."groupBy" ELSE t."groupBy" END,
           "sortField" = CASE WHEN "pData" ? 'sortField' THEN "vRec"."sortField" ELSE t."sortField" END,
           "sortDir" = CASE WHEN "pData" ? 'sortDir' THEN "vRec"."sortDir" ELSE t."sortDir" END,
           "rowLimit" = CASE WHEN "pData" ? 'rowLimit' THEN "vRec"."rowLimit" ELSE t."rowLimit" END,
           "showTotals" = CASE WHEN "pData" ? 'showTotals' THEN "vRec"."showTotals" ELSE t."showTotals" END,
           "viewMode" = CASE WHEN "pData" ? 'viewMode' THEN "vRec"."viewMode" ELSE t."viewMode" END,
           display = CASE WHEN "pData" ? 'display' THEN "vRec".display ELSE t.display END,
           "chartType" = CASE WHEN "pData" ? 'chartType' THEN "vRec"."chartType" ELSE t."chartType" END,
           options = CASE WHEN "pData" ? 'options' THEN "vRec".options ELSE t.options END,
           "defaultFormat" = CASE WHEN "pData" ? 'defaultFormat' THEN "vRec"."defaultFormat" ELSE t."defaultFormat" END,
           visibility = CASE WHEN "pData" ? 'visibility' THEN "vRec".visibility ELSE t.visibility END,
           "ownerUserId" = CASE WHEN "pData" ? 'ownerUserId' THEN "vRec"."ownerUserId" ELSE t."ownerUserId" END,
           "isFavourite" = CASE WHEN "pData" ? 'isFavourite' THEN "vRec"."isFavourite" ELSE t."isFavourite" END,
           "isSystem" = CASE WHEN "pData" ? 'isSystem' THEN "vRec"."isSystem" ELSE t."isSystem" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "lastRunAt" = CASE WHEN "pData" ? 'lastRunAt' THEN "vRec"."lastRunAt" ELSE t."lastRunAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Reports"."SavedReports" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'SavedReports %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SavedReports % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'columns' THEN
    -- columns: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Reports"."SavedReportColumns"
     WHERE "tenantId" = "vTenant" AND "reportId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'columns') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'columns') WITH ORDINALITY t(x, n) LOOP
      "vC1SavedReportColumns" := jsonb_populate_record(NULL::"Reports"."SavedReportColumns", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Reports"."SavedReportColumns" t
           SET seq = CASE WHEN "vE1" ? 'seq' THEN "vC1SavedReportColumns".seq ELSE t.seq END,
               "fieldKey" = CASE WHEN "vE1" ? 'fieldKey' THEN "vC1SavedReportColumns"."fieldKey" ELSE t."fieldKey" END,
               label = CASE WHEN "vE1" ? 'label' THEN "vC1SavedReportColumns".label ELSE t.label END,
               "isVisible" = CASE WHEN "vE1" ? 'isVisible' THEN "vC1SavedReportColumns"."isVisible" ELSE t."isVisible" END,
               aggregate = CASE WHEN "vE1" ? 'aggregate' THEN "vC1SavedReportColumns".aggregate ELSE t.aggregate END,
               format = CASE WHEN "vE1" ? 'format' THEN "vC1SavedReportColumns".format ELSE t.format END,
               "widthPx" = CASE WHEN "vE1" ? 'widthPx' THEN "vC1SavedReportColumns"."widthPx" ELSE t."widthPx" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."reportId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SavedReportColumns: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Reports"."SavedReportColumns" ("reportId", "tenantId", seq, "fieldKey", label, "isVisible", aggregate, format, "widthPx")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'seq' THEN "vC1SavedReportColumns".seq ELSE NULL END, CASE WHEN "vE1" ? 'fieldKey' THEN "vC1SavedReportColumns"."fieldKey" ELSE NULL END, CASE WHEN "vE1" ? 'label' THEN "vC1SavedReportColumns".label ELSE NULL END, CASE WHEN "vE1" ? 'isVisible' THEN "vC1SavedReportColumns"."isVisible" ELSE TRUE END, CASE WHEN "vE1" ? 'aggregate' THEN "vC1SavedReportColumns".aggregate ELSE 'NONE' END, CASE WHEN "vE1" ? 'format' THEN "vC1SavedReportColumns".format ELSE 'TEXT' END, CASE WHEN "vE1" ? 'widthPx' THEN "vC1SavedReportColumns"."widthPx" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'shares' THEN
    -- shares: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Reports"."SavedReportShares"
     WHERE "tenantId" = "vTenant" AND "reportId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'shares') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'shares') WITH ORDINALITY t(x, n) LOOP
      "vC1SavedReportShares" := jsonb_populate_record(NULL::"Reports"."SavedReportShares", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Reports"."SavedReportShares" t
           SET "shareType" = CASE WHEN "vE1" ? 'shareType' THEN "vC1SavedReportShares"."shareType" ELSE t."shareType" END,
               "roleId" = CASE WHEN "vE1" ? 'roleId' THEN "vC1SavedReportShares"."roleId" ELSE t."roleId" END,
               "userId" = CASE WHEN "vE1" ? 'userId' THEN "vC1SavedReportShares"."userId" ELSE t."userId" END,
               "canEdit" = CASE WHEN "vE1" ? 'canEdit' THEN "vC1SavedReportShares"."canEdit" ELSE t."canEdit" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."reportId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SavedReportShares: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Reports"."SavedReportShares" ("reportId", "tenantId", "shareType", "roleId", "userId", "canEdit")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'shareType' THEN "vC1SavedReportShares"."shareType" ELSE NULL END, CASE WHEN "vE1" ? 'roleId' THEN "vC1SavedReportShares"."roleId" ELSE NULL END, CASE WHEN "vE1" ? 'userId' THEN "vC1SavedReportShares"."userId" ELSE NULL END, CASE WHEN "vE1" ? 'canEdit' THEN "vC1SavedReportShares"."canEdit" ELSE FALSE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Reports"."savedReportAddUpdate"(jsonb) IS 'Save (insert or update) one SavedReports record with its columns, shares.';

-- SavedReports: one record as JSON (camelCase keys), with lookup labels and columns, shares
CREATE OR REPLACE FUNCTION "Reports"."getSavedReportInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('folderLabel', "Lookups"."getLookupLabel"('Folder', t.folder) ->> 'label', 'folderTone', "Lookups"."getLookupLabel"('Folder', t.folder) ->> 'tone', 'kindLabel', "Lookups"."getLookupLabel"('SavedReportKind', t.kind) ->> 'label', 'kindTone', "Lookups"."getLookupLabel"('SavedReportKind', t.kind) ->> 'tone', 'studioLabel', "Lookups"."getLookupLabel"('SavedReportStudio', t.studio) ->> 'label', 'studioTone', "Lookups"."getLookupLabel"('SavedReportStudio', t.studio) ->> 'tone', 'sourceEntityLabel', "Lookups"."getLookupLabel"('SourceEntity', t."sourceEntity") ->> 'label', 'sourceEntityTone', "Lookups"."getLookupLabel"('SourceEntity', t."sourceEntity") ->> 'tone', 'dateRangeLabel', "Lookups"."getLookupLabel"('DateRange', t."dateRange") ->> 'label', 'dateRangeTone', "Lookups"."getLookupLabel"('DateRange', t."dateRange") ->> 'tone', 'sortDirLabel', "Lookups"."getLookupLabel"('SortDir', t."sortDir") ->> 'label', 'sortDirTone', "Lookups"."getLookupLabel"('SortDir', t."sortDir") ->> 'tone', 'viewModeLabel', "Lookups"."getLookupLabel"('ViewMode', t."viewMode") ->> 'label', 'viewModeTone', "Lookups"."getLookupLabel"('ViewMode', t."viewMode") ->> 'tone', 'displayLabel', "Lookups"."getLookupLabel"('Display', t.display) ->> 'label', 'displayTone', "Lookups"."getLookupLabel"('Display', t.display) ->> 'tone', 'chartTypeLabel', "Lookups"."getLookupLabel"('ChartType', t."chartType") ->> 'label', 'chartTypeTone', "Lookups"."getLookupLabel"('ChartType', t."chartType") ->> 'tone', 'defaultFormatLabel', "Lookups"."getLookupLabel"('DefaultFormat', t."defaultFormat") ->> 'label', 'defaultFormatTone', "Lookups"."getLookupLabel"('DefaultFormat', t."defaultFormat") ->> 'tone', 'visibilityLabel', "Lookups"."getLookupLabel"('Visibility', t.visibility) ->> 'label', 'visibilityTone', "Lookups"."getLookupLabel"('Visibility', t.visibility) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ActiveArchivedStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveArchivedStatus', t.status) ->> 'tone') ||
         jsonb_build_object('columns', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Reports"."SavedReportColumns" c1 WHERE c1."reportId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'shares', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Reports"."SavedReportShares" c1 WHERE c1."reportId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Reports"."SavedReports" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Reports"."getSavedReportInfo"(uuid) IS 'Read one SavedReports record (getter for its screens).';

-- ReportSchedules: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Reports"."reportScheduleAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Reports"."ReportSchedules";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Reports"."ReportSchedules", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Reports"."ReportSchedules" ("tenantId", "reportId", frequency, "dayOfWeek", "dayOfMonth", "runTime", timezone, format, "recipientEmails", "recipientUserIds", "onlyIfRows", status, "nextRunAt", "lastRunAt", "lastRowCount", "ownerUserId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'reportId' THEN "vRec"."reportId" ELSE NULL END, CASE WHEN "pData" ? 'frequency' THEN "vRec".frequency ELSE NULL END, CASE WHEN "pData" ? 'dayOfWeek' THEN "vRec"."dayOfWeek" ELSE NULL END, CASE WHEN "pData" ? 'dayOfMonth' THEN "vRec"."dayOfMonth" ELSE NULL END, CASE WHEN "pData" ? 'runTime' THEN "vRec"."runTime" ELSE '08:00' END, CASE WHEN "pData" ? 'timezone' THEN "vRec".timezone ELSE 'Asia/Karachi' END, CASE WHEN "pData" ? 'format' THEN "vRec".format ELSE 'XLSX' END, CASE WHEN "pData" ? 'recipientEmails' THEN "vRec"."recipientEmails" ELSE '{}' END, CASE WHEN "pData" ? 'recipientUserIds' THEN "vRec"."recipientUserIds" ELSE '{}' END, CASE WHEN "pData" ? 'onlyIfRows' THEN "vRec"."onlyIfRows" ELSE FALSE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END, CASE WHEN "pData" ? 'nextRunAt' THEN "vRec"."nextRunAt" ELSE NULL END, CASE WHEN "pData" ? 'lastRunAt' THEN "vRec"."lastRunAt" ELSE NULL END, CASE WHEN "pData" ? 'lastRowCount' THEN "vRec"."lastRowCount" ELSE NULL END, CASE WHEN "pData" ? 'ownerUserId' THEN "vRec"."ownerUserId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Reports"."ReportSchedules" t
       SET "reportId" = CASE WHEN "pData" ? 'reportId' THEN "vRec"."reportId" ELSE t."reportId" END,
           frequency = CASE WHEN "pData" ? 'frequency' THEN "vRec".frequency ELSE t.frequency END,
           "dayOfWeek" = CASE WHEN "pData" ? 'dayOfWeek' THEN "vRec"."dayOfWeek" ELSE t."dayOfWeek" END,
           "dayOfMonth" = CASE WHEN "pData" ? 'dayOfMonth' THEN "vRec"."dayOfMonth" ELSE t."dayOfMonth" END,
           "runTime" = CASE WHEN "pData" ? 'runTime' THEN "vRec"."runTime" ELSE t."runTime" END,
           timezone = CASE WHEN "pData" ? 'timezone' THEN "vRec".timezone ELSE t.timezone END,
           format = CASE WHEN "pData" ? 'format' THEN "vRec".format ELSE t.format END,
           "recipientEmails" = CASE WHEN "pData" ? 'recipientEmails' THEN "vRec"."recipientEmails" ELSE t."recipientEmails" END,
           "recipientUserIds" = CASE WHEN "pData" ? 'recipientUserIds' THEN "vRec"."recipientUserIds" ELSE t."recipientUserIds" END,
           "onlyIfRows" = CASE WHEN "pData" ? 'onlyIfRows' THEN "vRec"."onlyIfRows" ELSE t."onlyIfRows" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "nextRunAt" = CASE WHEN "pData" ? 'nextRunAt' THEN "vRec"."nextRunAt" ELSE t."nextRunAt" END,
           "lastRunAt" = CASE WHEN "pData" ? 'lastRunAt' THEN "vRec"."lastRunAt" ELSE t."lastRunAt" END,
           "lastRowCount" = CASE WHEN "pData" ? 'lastRowCount' THEN "vRec"."lastRowCount" ELSE t."lastRowCount" END,
           "ownerUserId" = CASE WHEN "pData" ? 'ownerUserId' THEN "vRec"."ownerUserId" ELSE t."ownerUserId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Reports"."ReportSchedules" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ReportSchedules %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ReportSchedules % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Reports"."reportScheduleAddUpdate"(jsonb) IS 'Save (insert or update) one ReportSchedules record.';

-- ReportSchedules: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Reports"."getReportScheduleInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('frequencyLabel', "Lookups"."getLookupLabel"('ReportScheduleFrequency', t.frequency) ->> 'label', 'frequencyTone', "Lookups"."getLookupLabel"('ReportScheduleFrequency', t.frequency) ->> 'tone', 'formatLabel', "Lookups"."getLookupLabel"('ReportScheduleFormat', t.format) ->> 'label', 'formatTone', "Lookups"."getLookupLabel"('ReportScheduleFormat', t.format) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ReportScheduleStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ReportScheduleStatus', t.status) ->> 'tone')
    FROM "Reports"."ReportSchedules" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Reports"."getReportScheduleInfo"(uuid) IS 'Read one ReportSchedules record (getter for its screens).';
