-- =============================================================================
-- Finsoft ERP (Full edition) — API: "EmployeeSelfService"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- LetterRequests: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."letterRequestAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "EmployeeSelfService"."LetterRequests";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"EmployeeSelfService"."LetterRequests", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('RQ', "vRec"."docDate", NULL);
    END IF;
    INSERT INTO "EmployeeSelfService"."LetterRequests" ("tenantId", "docNo", "docDate", "employeeId", "letterType", "addressedTo", purpose, "travelCountry", "travelFrom", "travelTill", "leaveRequestId", "includeSalary", responsibilities, "outputFormat", language, stage, "rejectedReason", "dueAt", "signedByUserId", "signedAt", "referenceNo", "verificationCode", "salaryGrossSnapshot", "salaryNetSnapshot", "docTemplateId", "pdfAttachmentId", "hrLetterId", "withdrawnAt")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE CURRENT_DATE END, CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'letterType' THEN "vRec"."letterType" ELSE NULL END, CASE WHEN "pData" ? 'addressedTo' THEN "vRec"."addressedTo" ELSE NULL END, CASE WHEN "pData" ? 'purpose' THEN "vRec".purpose ELSE NULL END, CASE WHEN "pData" ? 'travelCountry' THEN "vRec"."travelCountry" ELSE NULL END, CASE WHEN "pData" ? 'travelFrom' THEN "vRec"."travelFrom" ELSE NULL END, CASE WHEN "pData" ? 'travelTill' THEN "vRec"."travelTill" ELSE NULL END, CASE WHEN "pData" ? 'leaveRequestId' THEN "vRec"."leaveRequestId" ELSE NULL END, CASE WHEN "pData" ? 'includeSalary' THEN "vRec"."includeSalary" ELSE FALSE END, CASE WHEN "pData" ? 'responsibilities' THEN "vRec".responsibilities ELSE NULL END, CASE WHEN "pData" ? 'outputFormat' THEN "vRec"."outputFormat" ELSE 'DIGITAL_PDF_QR' END, CASE WHEN "pData" ? 'language' THEN "vRec".language ELSE 'EN' END, CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE 'SUBMITTED' END, CASE WHEN "pData" ? 'rejectedReason' THEN "vRec"."rejectedReason" ELSE NULL END, CASE WHEN "pData" ? 'dueAt' THEN "vRec"."dueAt" ELSE NULL END, CASE WHEN "pData" ? 'signedByUserId' THEN "vRec"."signedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'signedAt' THEN "vRec"."signedAt" ELSE NULL END, CASE WHEN "pData" ? 'referenceNo' THEN "vRec"."referenceNo" ELSE NULL END, CASE WHEN "pData" ? 'verificationCode' THEN "vRec"."verificationCode" ELSE NULL END, CASE WHEN "pData" ? 'salaryGrossSnapshot' THEN "vRec"."salaryGrossSnapshot" ELSE NULL END, CASE WHEN "pData" ? 'salaryNetSnapshot' THEN "vRec"."salaryNetSnapshot" ELSE NULL END, CASE WHEN "pData" ? 'docTemplateId' THEN "vRec"."docTemplateId" ELSE NULL END, CASE WHEN "pData" ? 'pdfAttachmentId' THEN "vRec"."pdfAttachmentId" ELSE NULL END, CASE WHEN "pData" ? 'hrLetterId' THEN "vRec"."hrLetterId" ELSE NULL END, CASE WHEN "pData" ? 'withdrawnAt' THEN "vRec"."withdrawnAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "EmployeeSelfService"."LetterRequests" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "letterType" = CASE WHEN "pData" ? 'letterType' THEN "vRec"."letterType" ELSE t."letterType" END,
           "addressedTo" = CASE WHEN "pData" ? 'addressedTo' THEN "vRec"."addressedTo" ELSE t."addressedTo" END,
           purpose = CASE WHEN "pData" ? 'purpose' THEN "vRec".purpose ELSE t.purpose END,
           "travelCountry" = CASE WHEN "pData" ? 'travelCountry' THEN "vRec"."travelCountry" ELSE t."travelCountry" END,
           "travelFrom" = CASE WHEN "pData" ? 'travelFrom' THEN "vRec"."travelFrom" ELSE t."travelFrom" END,
           "travelTill" = CASE WHEN "pData" ? 'travelTill' THEN "vRec"."travelTill" ELSE t."travelTill" END,
           "leaveRequestId" = CASE WHEN "pData" ? 'leaveRequestId' THEN "vRec"."leaveRequestId" ELSE t."leaveRequestId" END,
           "includeSalary" = CASE WHEN "pData" ? 'includeSalary' THEN "vRec"."includeSalary" ELSE t."includeSalary" END,
           responsibilities = CASE WHEN "pData" ? 'responsibilities' THEN "vRec".responsibilities ELSE t.responsibilities END,
           "outputFormat" = CASE WHEN "pData" ? 'outputFormat' THEN "vRec"."outputFormat" ELSE t."outputFormat" END,
           language = CASE WHEN "pData" ? 'language' THEN "vRec".language ELSE t.language END,
           stage = CASE WHEN "pData" ? 'stage' THEN "vRec".stage ELSE t.stage END,
           "rejectedReason" = CASE WHEN "pData" ? 'rejectedReason' THEN "vRec"."rejectedReason" ELSE t."rejectedReason" END,
           "dueAt" = CASE WHEN "pData" ? 'dueAt' THEN "vRec"."dueAt" ELSE t."dueAt" END,
           "signedByUserId" = CASE WHEN "pData" ? 'signedByUserId' THEN "vRec"."signedByUserId" ELSE t."signedByUserId" END,
           "signedAt" = CASE WHEN "pData" ? 'signedAt' THEN "vRec"."signedAt" ELSE t."signedAt" END,
           "referenceNo" = CASE WHEN "pData" ? 'referenceNo' THEN "vRec"."referenceNo" ELSE t."referenceNo" END,
           "verificationCode" = CASE WHEN "pData" ? 'verificationCode' THEN "vRec"."verificationCode" ELSE t."verificationCode" END,
           "salaryGrossSnapshot" = CASE WHEN "pData" ? 'salaryGrossSnapshot' THEN "vRec"."salaryGrossSnapshot" ELSE t."salaryGrossSnapshot" END,
           "salaryNetSnapshot" = CASE WHEN "pData" ? 'salaryNetSnapshot' THEN "vRec"."salaryNetSnapshot" ELSE t."salaryNetSnapshot" END,
           "docTemplateId" = CASE WHEN "pData" ? 'docTemplateId' THEN "vRec"."docTemplateId" ELSE t."docTemplateId" END,
           "pdfAttachmentId" = CASE WHEN "pData" ? 'pdfAttachmentId' THEN "vRec"."pdfAttachmentId" ELSE t."pdfAttachmentId" END,
           "hrLetterId" = CASE WHEN "pData" ? 'hrLetterId' THEN "vRec"."hrLetterId" ELSE t."hrLetterId" END,
           "withdrawnAt" = CASE WHEN "pData" ? 'withdrawnAt' THEN "vRec"."withdrawnAt" ELSE t."withdrawnAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "EmployeeSelfService"."LetterRequests" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'LetterRequests %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'LetterRequests % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "EmployeeSelfService"."letterRequestAddUpdate"(jsonb) IS 'Save (insert or update) one LetterRequests record.';

-- LetterRequests: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."getLetterRequestInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('letterTypeLabel', "Lookups"."getLookupLabel"('LetterRequestLetterType', t."letterType") ->> 'label', 'letterTypeTone', "Lookups"."getLookupLabel"('LetterRequestLetterType', t."letterType") ->> 'tone', 'outputFormatLabel', "Lookups"."getLookupLabel"('OutputFormat', t."outputFormat") ->> 'label', 'outputFormatTone', "Lookups"."getLookupLabel"('OutputFormat', t."outputFormat") ->> 'tone', 'languageLabel', "Lookups"."getLookupLabel"('EnUrLanguage', t.language) ->> 'label', 'languageTone', "Lookups"."getLookupLabel"('EnUrLanguage', t.language) ->> 'tone', 'stageLabel', "Lookups"."getLookupLabel"('LetterRequestStage', t.stage) ->> 'label', 'stageTone', "Lookups"."getLookupLabel"('LetterRequestStage', t.stage) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('LetterRequestStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('LetterRequestStatus', t.status) ->> 'tone')
    FROM "EmployeeSelfService"."LetterRequests" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "EmployeeSelfService"."getLetterRequestInfo"(uuid) IS 'Read one LetterRequests record (getter for its screens).';

-- HelpdeskCategories: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."helpdeskCategoryAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "EmployeeSelfService"."HelpdeskCategories";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"EmployeeSelfService"."HelpdeskCategories", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "EmployeeSelfService"."HelpdeskCategories" ("tenantId", code, name, description, "ownerEmployeeId", "slaHours", "highPrioritySlaFactor", "routingKeywords", icon, "sortOrder", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'ownerEmployeeId' THEN "vRec"."ownerEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'slaHours' THEN "vRec"."slaHours" ELSE NULL END, CASE WHEN "pData" ? 'highPrioritySlaFactor' THEN "vRec"."highPrioritySlaFactor" ELSE 0.5 END, CASE WHEN "pData" ? 'routingKeywords' THEN "vRec"."routingKeywords" ELSE '{}' END, CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE NULL END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "EmployeeSelfService"."HelpdeskCategories" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "ownerEmployeeId" = CASE WHEN "pData" ? 'ownerEmployeeId' THEN "vRec"."ownerEmployeeId" ELSE t."ownerEmployeeId" END,
           "slaHours" = CASE WHEN "pData" ? 'slaHours' THEN "vRec"."slaHours" ELSE t."slaHours" END,
           "highPrioritySlaFactor" = CASE WHEN "pData" ? 'highPrioritySlaFactor' THEN "vRec"."highPrioritySlaFactor" ELSE t."highPrioritySlaFactor" END,
           "routingKeywords" = CASE WHEN "pData" ? 'routingKeywords' THEN "vRec"."routingKeywords" ELSE t."routingKeywords" END,
           icon = CASE WHEN "pData" ? 'icon' THEN "vRec".icon ELSE t.icon END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "EmployeeSelfService"."HelpdeskCategories" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'HelpdeskCategories %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'HelpdeskCategories % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "EmployeeSelfService"."helpdeskCategoryAddUpdate"(jsonb) IS 'Save (insert or update) one HelpdeskCategories record.';

-- HelpdeskCategories: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."getHelpdeskCategoryInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone')
    FROM "EmployeeSelfService"."HelpdeskCategories" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "EmployeeSelfService"."getHelpdeskCategoryInfo"(uuid) IS 'Read one HelpdeskCategories record (getter for its screens).';

-- HelpdeskTickets: insert (no "id") or update (with "id"); child arrays: messages
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."helpdeskTicketAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "EmployeeSelfService"."HelpdeskTickets";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1HelpdeskTicketMessages" "EmployeeSelfService"."HelpdeskTicketMessages";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"EmployeeSelfService"."HelpdeskTickets", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('HD', current_date, NULL);
    END IF;
    INSERT INTO "EmployeeSelfService"."HelpdeskTickets" ("tenantId", "docNo", "employeeId", "categoryId", subject, description, priority, "agentEmployeeId", "contactChannel", "contactValue", "openedAt", "slaHours", "dueAt", "firstResponseAt", "resolvedAt", "closedAt", "slaMet", "reopenedCount", "csatRating", "csatAt", "sourceDocType", "sourceDocId")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'categoryId' THEN "vRec"."categoryId" ELSE NULL END, CASE WHEN "pData" ? 'subject' THEN "vRec".subject ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'priority' THEN "vRec".priority ELSE 'NORMAL' END, CASE WHEN "pData" ? 'agentEmployeeId' THEN "vRec"."agentEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'contactChannel' THEN "vRec"."contactChannel" ELSE 'WHATSAPP' END, CASE WHEN "pData" ? 'contactValue' THEN "vRec"."contactValue" ELSE NULL END, CASE WHEN "pData" ? 'openedAt' THEN "vRec"."openedAt" ELSE now() END, CASE WHEN "pData" ? 'slaHours' THEN "vRec"."slaHours" ELSE NULL END, CASE WHEN "pData" ? 'dueAt' THEN "vRec"."dueAt" ELSE NULL END, CASE WHEN "pData" ? 'firstResponseAt' THEN "vRec"."firstResponseAt" ELSE NULL END, CASE WHEN "pData" ? 'resolvedAt' THEN "vRec"."resolvedAt" ELSE NULL END, CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE NULL END, CASE WHEN "pData" ? 'slaMet' THEN "vRec"."slaMet" ELSE NULL END, CASE WHEN "pData" ? 'reopenedCount' THEN "vRec"."reopenedCount" ELSE 0 END, CASE WHEN "pData" ? 'csatRating' THEN "vRec"."csatRating" ELSE NULL END, CASE WHEN "pData" ? 'csatAt' THEN "vRec"."csatAt" ELSE NULL END, CASE WHEN "pData" ? 'sourceDocType' THEN "vRec"."sourceDocType" ELSE NULL END, CASE WHEN "pData" ? 'sourceDocId' THEN "vRec"."sourceDocId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "EmployeeSelfService"."HelpdeskTickets" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "categoryId" = CASE WHEN "pData" ? 'categoryId' THEN "vRec"."categoryId" ELSE t."categoryId" END,
           subject = CASE WHEN "pData" ? 'subject' THEN "vRec".subject ELSE t.subject END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           priority = CASE WHEN "pData" ? 'priority' THEN "vRec".priority ELSE t.priority END,
           "agentEmployeeId" = CASE WHEN "pData" ? 'agentEmployeeId' THEN "vRec"."agentEmployeeId" ELSE t."agentEmployeeId" END,
           "contactChannel" = CASE WHEN "pData" ? 'contactChannel' THEN "vRec"."contactChannel" ELSE t."contactChannel" END,
           "contactValue" = CASE WHEN "pData" ? 'contactValue' THEN "vRec"."contactValue" ELSE t."contactValue" END,
           "openedAt" = CASE WHEN "pData" ? 'openedAt' THEN "vRec"."openedAt" ELSE t."openedAt" END,
           "slaHours" = CASE WHEN "pData" ? 'slaHours' THEN "vRec"."slaHours" ELSE t."slaHours" END,
           "dueAt" = CASE WHEN "pData" ? 'dueAt' THEN "vRec"."dueAt" ELSE t."dueAt" END,
           "firstResponseAt" = CASE WHEN "pData" ? 'firstResponseAt' THEN "vRec"."firstResponseAt" ELSE t."firstResponseAt" END,
           "resolvedAt" = CASE WHEN "pData" ? 'resolvedAt' THEN "vRec"."resolvedAt" ELSE t."resolvedAt" END,
           "closedAt" = CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE t."closedAt" END,
           "slaMet" = CASE WHEN "pData" ? 'slaMet' THEN "vRec"."slaMet" ELSE t."slaMet" END,
           "reopenedCount" = CASE WHEN "pData" ? 'reopenedCount' THEN "vRec"."reopenedCount" ELSE t."reopenedCount" END,
           "csatRating" = CASE WHEN "pData" ? 'csatRating' THEN "vRec"."csatRating" ELSE t."csatRating" END,
           "csatAt" = CASE WHEN "pData" ? 'csatAt' THEN "vRec"."csatAt" ELSE t."csatAt" END,
           "sourceDocType" = CASE WHEN "pData" ? 'sourceDocType' THEN "vRec"."sourceDocType" ELSE t."sourceDocType" END,
           "sourceDocId" = CASE WHEN "pData" ? 'sourceDocId' THEN "vRec"."sourceDocId" ELSE t."sourceDocId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "EmployeeSelfService"."HelpdeskTickets" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'HelpdeskTickets %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'HelpdeskTickets % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'messages' THEN
    -- messages: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "EmployeeSelfService"."HelpdeskTicketMessages"
     WHERE "tenantId" = "vTenant" AND "ticketId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'messages') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'messages') WITH ORDINALITY t(x, n) LOOP
      "vC1HelpdeskTicketMessages" := jsonb_populate_record(NULL::"EmployeeSelfService"."HelpdeskTicketMessages", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "EmployeeSelfService"."HelpdeskTicketMessages" t
           SET "authorRole" = CASE WHEN "vE1" ? 'authorRole' THEN "vC1HelpdeskTicketMessages"."authorRole" ELSE t."authorRole" END,
               "authorEmployeeId" = CASE WHEN "vE1" ? 'authorEmployeeId' THEN "vC1HelpdeskTicketMessages"."authorEmployeeId" ELSE t."authorEmployeeId" END,
               body = CASE WHEN "vE1" ? 'body' THEN "vC1HelpdeskTicketMessages".body ELSE t.body END,
               "attachmentId" = CASE WHEN "vE1" ? 'attachmentId' THEN "vC1HelpdeskTicketMessages"."attachmentId" ELSE t."attachmentId" END,
               "sentAt" = CASE WHEN "vE1" ? 'sentAt' THEN "vC1HelpdeskTicketMessages"."sentAt" ELSE t."sentAt" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."ticketId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'HelpdeskTicketMessages: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "EmployeeSelfService"."HelpdeskTicketMessages" ("ticketId", "tenantId", "authorRole", "authorEmployeeId", body, "attachmentId", "sentAt")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'authorRole' THEN "vC1HelpdeskTicketMessages"."authorRole" ELSE NULL END, CASE WHEN "vE1" ? 'authorEmployeeId' THEN "vC1HelpdeskTicketMessages"."authorEmployeeId" ELSE NULL END, CASE WHEN "vE1" ? 'body' THEN "vC1HelpdeskTicketMessages".body ELSE NULL END, CASE WHEN "vE1" ? 'attachmentId' THEN "vC1HelpdeskTicketMessages"."attachmentId" ELSE NULL END, CASE WHEN "vE1" ? 'sentAt' THEN "vC1HelpdeskTicketMessages"."sentAt" ELSE now() END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "EmployeeSelfService"."helpdeskTicketAddUpdate"(jsonb) IS 'Save (insert or update) one HelpdeskTickets record with its messages.';

-- HelpdeskTickets: one record as JSON (camelCase keys), with lookup labels and messages
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."getHelpdeskTicketInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('priorityLabel', "Lookups"."getLookupLabel"('HelpdeskTicketPriority', t.priority) ->> 'label', 'priorityTone', "Lookups"."getLookupLabel"('HelpdeskTicketPriority', t.priority) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('HelpdeskTicketStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('HelpdeskTicketStatus', t.status) ->> 'tone', 'contactChannelLabel', "Lookups"."getLookupLabel"('ContactChannel', t."contactChannel") ->> 'label', 'contactChannelTone', "Lookups"."getLookupLabel"('ContactChannel', t."contactChannel") ->> 'tone') ||
         jsonb_build_object('messages', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "EmployeeSelfService"."HelpdeskTicketMessages" c1 WHERE c1."ticketId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "EmployeeSelfService"."HelpdeskTickets" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "EmployeeSelfService"."getHelpdeskTicketInfo"(uuid) IS 'Read one HelpdeskTickets record (getter for its screens).';

-- HelpdeskFaqs: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."helpdeskFaqAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "EmployeeSelfService"."HelpdeskFaqs";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"EmployeeSelfService"."HelpdeskFaqs", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "EmployeeSelfService"."HelpdeskFaqs" ("tenantId", "categoryId", question, answer, keywords, "sortOrder", "isPublished")
    VALUES ("vTenant", CASE WHEN "pData" ? 'categoryId' THEN "vRec"."categoryId" ELSE NULL END, CASE WHEN "pData" ? 'question' THEN "vRec".question ELSE NULL END, CASE WHEN "pData" ? 'answer' THEN "vRec".answer ELSE NULL END, CASE WHEN "pData" ? 'keywords' THEN "vRec".keywords ELSE '{}' END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END, CASE WHEN "pData" ? 'isPublished' THEN "vRec"."isPublished" ELSE TRUE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "EmployeeSelfService"."HelpdeskFaqs" t
       SET "categoryId" = CASE WHEN "pData" ? 'categoryId' THEN "vRec"."categoryId" ELSE t."categoryId" END,
           question = CASE WHEN "pData" ? 'question' THEN "vRec".question ELSE t.question END,
           answer = CASE WHEN "pData" ? 'answer' THEN "vRec".answer ELSE t.answer END,
           keywords = CASE WHEN "pData" ? 'keywords' THEN "vRec".keywords ELSE t.keywords END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END,
           "isPublished" = CASE WHEN "pData" ? 'isPublished' THEN "vRec"."isPublished" ELSE t."isPublished" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "EmployeeSelfService"."HelpdeskFaqs" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'HelpdeskFaqs %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'HelpdeskFaqs % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "EmployeeSelfService"."helpdeskFaqAddUpdate"(jsonb) IS 'Save (insert or update) one HelpdeskFaqs record.';

-- HelpdeskFaqs: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."getHelpdeskFaqInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "EmployeeSelfService"."HelpdeskFaqs" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "EmployeeSelfService"."getHelpdeskFaqInfo"(uuid) IS 'Read one HelpdeskFaqs record (getter for its screens).';

-- Kudos: insert (no "id") or update (with "id"); child arrays: reactions
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."kudosAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "EmployeeSelfService"."Kudos";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1KudosReactions" "EmployeeSelfService"."KudosReactions";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"EmployeeSelfService"."Kudos", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "EmployeeSelfService"."Kudos" ("tenantId", "fromEmployeeId", "toEmployeeId", badge, message, "shareOnWall", "pointsToRecipient", "pointsToGiver", "givenAt", "isHidden")
    VALUES ("vTenant", CASE WHEN "pData" ? 'fromEmployeeId' THEN "vRec"."fromEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'toEmployeeId' THEN "vRec"."toEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'badge' THEN "vRec".badge ELSE NULL END, CASE WHEN "pData" ? 'message' THEN "vRec".message ELSE NULL END, CASE WHEN "pData" ? 'shareOnWall' THEN "vRec"."shareOnWall" ELSE TRUE END, CASE WHEN "pData" ? 'pointsToRecipient' THEN "vRec"."pointsToRecipient" ELSE 20 END, CASE WHEN "pData" ? 'pointsToGiver' THEN "vRec"."pointsToGiver" ELSE 5 END, CASE WHEN "pData" ? 'givenAt' THEN "vRec"."givenAt" ELSE now() END, CASE WHEN "pData" ? 'isHidden' THEN "vRec"."isHidden" ELSE FALSE END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "EmployeeSelfService"."Kudos" t
       SET "fromEmployeeId" = CASE WHEN "pData" ? 'fromEmployeeId' THEN "vRec"."fromEmployeeId" ELSE t."fromEmployeeId" END,
           "toEmployeeId" = CASE WHEN "pData" ? 'toEmployeeId' THEN "vRec"."toEmployeeId" ELSE t."toEmployeeId" END,
           badge = CASE WHEN "pData" ? 'badge' THEN "vRec".badge ELSE t.badge END,
           message = CASE WHEN "pData" ? 'message' THEN "vRec".message ELSE t.message END,
           "shareOnWall" = CASE WHEN "pData" ? 'shareOnWall' THEN "vRec"."shareOnWall" ELSE t."shareOnWall" END,
           "pointsToRecipient" = CASE WHEN "pData" ? 'pointsToRecipient' THEN "vRec"."pointsToRecipient" ELSE t."pointsToRecipient" END,
           "pointsToGiver" = CASE WHEN "pData" ? 'pointsToGiver' THEN "vRec"."pointsToGiver" ELSE t."pointsToGiver" END,
           "givenAt" = CASE WHEN "pData" ? 'givenAt' THEN "vRec"."givenAt" ELSE t."givenAt" END,
           "isHidden" = CASE WHEN "pData" ? 'isHidden' THEN "vRec"."isHidden" ELSE t."isHidden" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "EmployeeSelfService"."Kudos" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Kudos %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Kudos % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'reactions' THEN
    -- reactions: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "EmployeeSelfService"."KudosReactions"
     WHERE "tenantId" = "vTenant" AND "kudosId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'reactions') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'reactions') WITH ORDINALITY t(x, n) LOOP
      "vC1KudosReactions" := jsonb_populate_record(NULL::"EmployeeSelfService"."KudosReactions", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "EmployeeSelfService"."KudosReactions" t
           SET "employeeId" = CASE WHEN "vE1" ? 'employeeId' THEN "vC1KudosReactions"."employeeId" ELSE t."employeeId" END,
               reaction = CASE WHEN "vE1" ? 'reaction' THEN "vC1KudosReactions".reaction ELSE t.reaction END,
               "isActive" = CASE WHEN "vE1" ? 'isActive' THEN "vC1KudosReactions"."isActive" ELSE t."isActive" END,
               "reactedAt" = CASE WHEN "vE1" ? 'reactedAt' THEN "vC1KudosReactions"."reactedAt" ELSE t."reactedAt" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."kudosId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'KudosReactions: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "EmployeeSelfService"."KudosReactions" ("kudosId", "tenantId", "employeeId", reaction, "isActive", "reactedAt")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'employeeId' THEN "vC1KudosReactions"."employeeId" ELSE NULL END, CASE WHEN "vE1" ? 'reaction' THEN "vC1KudosReactions".reaction ELSE NULL END, CASE WHEN "vE1" ? 'isActive' THEN "vC1KudosReactions"."isActive" ELSE TRUE END, CASE WHEN "vE1" ? 'reactedAt' THEN "vC1KudosReactions"."reactedAt" ELSE now() END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "EmployeeSelfService"."kudosAddUpdate"(jsonb) IS 'Save (insert or update) one Kudos record with its reactions.';

-- Kudos: one record as JSON (camelCase keys), with lookup labels and reactions
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."getKudosInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('badgeLabel', "Lookups"."getLookupLabel"('Badge', t.badge) ->> 'label', 'badgeTone', "Lookups"."getLookupLabel"('Badge', t.badge) ->> 'tone') ||
         jsonb_build_object('reactions', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "EmployeeSelfService"."KudosReactions" c1 WHERE c1."kudosId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "EmployeeSelfService"."Kudos" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "EmployeeSelfService"."getKudosInfo"(uuid) IS 'Read one Kudos record (getter for its screens).';

-- PulseSurveys: insert (no "id") or update (with "id"); child arrays: questions
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."pulseSurveyAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "EmployeeSelfService"."PulseSurveys";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1PulseSurveyQuestions" "EmployeeSelfService"."PulseSurveyQuestions";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"EmployeeSelfService"."PulseSurveys", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "EmployeeSelfService"."PulseSurveys" ("tenantId", title, "periodFrom", "periodTo", "departmentId", "isAnonymous", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE NULL END, CASE WHEN "pData" ? 'periodFrom' THEN "vRec"."periodFrom" ELSE NULL END, CASE WHEN "pData" ? 'periodTo' THEN "vRec"."periodTo" ELSE NULL END, CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE NULL END, CASE WHEN "pData" ? 'isAnonymous' THEN "vRec"."isAnonymous" ELSE TRUE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'DRAFT' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "EmployeeSelfService"."PulseSurveys" t
       SET title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
           "periodFrom" = CASE WHEN "pData" ? 'periodFrom' THEN "vRec"."periodFrom" ELSE t."periodFrom" END,
           "periodTo" = CASE WHEN "pData" ? 'periodTo' THEN "vRec"."periodTo" ELSE t."periodTo" END,
           "departmentId" = CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE t."departmentId" END,
           "isAnonymous" = CASE WHEN "pData" ? 'isAnonymous' THEN "vRec"."isAnonymous" ELSE t."isAnonymous" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "EmployeeSelfService"."PulseSurveys" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PulseSurveys %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PulseSurveys % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'questions' THEN
    -- questions: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "EmployeeSelfService"."PulseSurveyQuestions"
     WHERE "tenantId" = "vTenant" AND "surveyId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'questions') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'questions') WITH ORDINALITY t(x, n) LOOP
      "vC1PulseSurveyQuestions" := jsonb_populate_record(NULL::"EmployeeSelfService"."PulseSurveyQuestions", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "EmployeeSelfService"."PulseSurveyQuestions" t
           SET seq = CASE WHEN "vE1" ? 'seq' THEN "vC1PulseSurveyQuestions".seq ELSE t.seq END,
               "questionText" = CASE WHEN "vE1" ? 'questionText' THEN "vC1PulseSurveyQuestions"."questionText" ELSE t."questionText" END,
               "lowLabel" = CASE WHEN "vE1" ? 'lowLabel' THEN "vC1PulseSurveyQuestions"."lowLabel" ELSE t."lowLabel" END,
               "highLabel" = CASE WHEN "vE1" ? 'highLabel' THEN "vC1PulseSurveyQuestions"."highLabel" ELSE t."highLabel" END,
               "metricKey" = CASE WHEN "vE1" ? 'metricKey' THEN "vC1PulseSurveyQuestions"."metricKey" ELSE t."metricKey" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."surveyId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PulseSurveyQuestions: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "EmployeeSelfService"."PulseSurveyQuestions" ("surveyId", "tenantId", seq, "questionText", "lowLabel", "highLabel", "metricKey")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'seq' THEN "vC1PulseSurveyQuestions".seq ELSE NULL END, CASE WHEN "vE1" ? 'questionText' THEN "vC1PulseSurveyQuestions"."questionText" ELSE NULL END, CASE WHEN "vE1" ? 'lowLabel' THEN "vC1PulseSurveyQuestions"."lowLabel" ELSE NULL END, CASE WHEN "vE1" ? 'highLabel' THEN "vC1PulseSurveyQuestions"."highLabel" ELSE NULL END, CASE WHEN "vE1" ? 'metricKey' THEN "vC1PulseSurveyQuestions"."metricKey" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "EmployeeSelfService"."pulseSurveyAddUpdate"(jsonb) IS 'Save (insert or update) one PulseSurveys record with its questions.';

-- PulseSurveys: one record as JSON (camelCase keys), with lookup labels and questions
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."getPulseSurveyInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('DraftOpenClosedStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('DraftOpenClosedStatus', t.status) ->> 'tone') ||
         jsonb_build_object('questions', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "EmployeeSelfService"."PulseSurveyQuestions" c1 WHERE c1."surveyId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "EmployeeSelfService"."PulseSurveys" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "EmployeeSelfService"."getPulseSurveyInfo"(uuid) IS 'Read one PulseSurveys record (getter for its screens).';

-- Polls: insert (no "id") or update (with "id"); child arrays: options
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."pollAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "EmployeeSelfService"."Polls";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1PollOptions" "EmployeeSelfService"."PollOptions";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"EmployeeSelfService"."Polls", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "EmployeeSelfService"."Polls" ("tenantId", question, "createdByEmployeeId", "departmentId", "opensAt", "closesAt", "showResultsAfterVote", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'question' THEN "vRec".question ELSE NULL END, CASE WHEN "pData" ? 'createdByEmployeeId' THEN "vRec"."createdByEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE NULL END, CASE WHEN "pData" ? 'opensAt' THEN "vRec"."opensAt" ELSE now() END, CASE WHEN "pData" ? 'closesAt' THEN "vRec"."closesAt" ELSE NULL END, CASE WHEN "pData" ? 'showResultsAfterVote' THEN "vRec"."showResultsAfterVote" ELSE TRUE END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'OPEN' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "EmployeeSelfService"."Polls" t
       SET question = CASE WHEN "pData" ? 'question' THEN "vRec".question ELSE t.question END,
           "createdByEmployeeId" = CASE WHEN "pData" ? 'createdByEmployeeId' THEN "vRec"."createdByEmployeeId" ELSE t."createdByEmployeeId" END,
           "departmentId" = CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE t."departmentId" END,
           "opensAt" = CASE WHEN "pData" ? 'opensAt' THEN "vRec"."opensAt" ELSE t."opensAt" END,
           "closesAt" = CASE WHEN "pData" ? 'closesAt' THEN "vRec"."closesAt" ELSE t."closesAt" END,
           "showResultsAfterVote" = CASE WHEN "pData" ? 'showResultsAfterVote' THEN "vRec"."showResultsAfterVote" ELSE t."showResultsAfterVote" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "EmployeeSelfService"."Polls" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Polls %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Polls % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'options' THEN
    -- options: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "EmployeeSelfService"."PollOptions"
     WHERE "tenantId" = "vTenant" AND "pollId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'options') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'options') WITH ORDINALITY t(x, n) LOOP
      "vC1PollOptions" := jsonb_populate_record(NULL::"EmployeeSelfService"."PollOptions", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "EmployeeSelfService"."PollOptions" t
           SET seq = CASE WHEN "vE1" ? 'seq' THEN "vC1PollOptions".seq ELSE t.seq END,
               label = CASE WHEN "vE1" ? 'label' THEN "vC1PollOptions".label ELSE t.label END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."pollId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PollOptions: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "EmployeeSelfService"."PollOptions" ("pollId", "tenantId", seq, label)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'seq' THEN "vC1PollOptions".seq ELSE NULL END, CASE WHEN "vE1" ? 'label' THEN "vC1PollOptions".label ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "EmployeeSelfService"."pollAddUpdate"(jsonb) IS 'Save (insert or update) one Polls record with its options.';

-- Polls: one record as JSON (camelCase keys), with lookup labels and options
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."getPollInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('DraftOpenClosedStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('DraftOpenClosedStatus', t.status) ->> 'tone') ||
         jsonb_build_object('options', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "EmployeeSelfService"."PollOptions" c1 WHERE c1."pollId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "EmployeeSelfService"."Polls" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "EmployeeSelfService"."getPollInfo"(uuid) IS 'Read one Polls record (getter for its screens).';

-- ShiftSwapRequests: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."shiftSwapRequestAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "EmployeeSelfService"."ShiftSwapRequests";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"EmployeeSelfService"."ShiftSwapRequests", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('SW', "vRec"."docDate", NULL);
    END IF;
    INSERT INTO "EmployeeSelfService"."ShiftSwapRequests" ("tenantId", "docNo", "docDate", "requesterEmployeeId", "counterpartEmployeeId", "swapDate", "swapMode", "requesterShiftId", "counterpartShiftId", "reasonCategory", reason, "noteToCounterpart", "acceptedAt", "approverEmployeeId", "decisionReason")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE CURRENT_DATE END, CASE WHEN "pData" ? 'requesterEmployeeId' THEN "vRec"."requesterEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'counterpartEmployeeId' THEN "vRec"."counterpartEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'swapDate' THEN "vRec"."swapDate" ELSE NULL END, CASE WHEN "pData" ? 'swapMode' THEN "vRec"."swapMode" ELSE NULL END, CASE WHEN "pData" ? 'requesterShiftId' THEN "vRec"."requesterShiftId" ELSE NULL END, CASE WHEN "pData" ? 'counterpartShiftId' THEN "vRec"."counterpartShiftId" ELSE NULL END, CASE WHEN "pData" ? 'reasonCategory' THEN "vRec"."reasonCategory" ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'noteToCounterpart' THEN "vRec"."noteToCounterpart" ELSE NULL END, CASE WHEN "pData" ? 'acceptedAt' THEN "vRec"."acceptedAt" ELSE NULL END, CASE WHEN "pData" ? 'approverEmployeeId' THEN "vRec"."approverEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'decisionReason' THEN "vRec"."decisionReason" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "EmployeeSelfService"."ShiftSwapRequests" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "requesterEmployeeId" = CASE WHEN "pData" ? 'requesterEmployeeId' THEN "vRec"."requesterEmployeeId" ELSE t."requesterEmployeeId" END,
           "counterpartEmployeeId" = CASE WHEN "pData" ? 'counterpartEmployeeId' THEN "vRec"."counterpartEmployeeId" ELSE t."counterpartEmployeeId" END,
           "swapDate" = CASE WHEN "pData" ? 'swapDate' THEN "vRec"."swapDate" ELSE t."swapDate" END,
           "swapMode" = CASE WHEN "pData" ? 'swapMode' THEN "vRec"."swapMode" ELSE t."swapMode" END,
           "requesterShiftId" = CASE WHEN "pData" ? 'requesterShiftId' THEN "vRec"."requesterShiftId" ELSE t."requesterShiftId" END,
           "counterpartShiftId" = CASE WHEN "pData" ? 'counterpartShiftId' THEN "vRec"."counterpartShiftId" ELSE t."counterpartShiftId" END,
           "reasonCategory" = CASE WHEN "pData" ? 'reasonCategory' THEN "vRec"."reasonCategory" ELSE t."reasonCategory" END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           "noteToCounterpart" = CASE WHEN "pData" ? 'noteToCounterpart' THEN "vRec"."noteToCounterpart" ELSE t."noteToCounterpart" END,
           "acceptedAt" = CASE WHEN "pData" ? 'acceptedAt' THEN "vRec"."acceptedAt" ELSE t."acceptedAt" END,
           "approverEmployeeId" = CASE WHEN "pData" ? 'approverEmployeeId' THEN "vRec"."approverEmployeeId" ELSE t."approverEmployeeId" END,
           "decisionReason" = CASE WHEN "pData" ? 'decisionReason' THEN "vRec"."decisionReason" ELSE t."decisionReason" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "EmployeeSelfService"."ShiftSwapRequests" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ShiftSwapRequests %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ShiftSwapRequests % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "EmployeeSelfService"."shiftSwapRequestAddUpdate"(jsonb) IS 'Save (insert or update) one ShiftSwapRequests record.';

-- ShiftSwapRequests: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."getShiftSwapRequestInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('swapModeLabel', "Lookups"."getLookupLabel"('SwapMode', t."swapMode") ->> 'label', 'swapModeTone', "Lookups"."getLookupLabel"('SwapMode', t."swapMode") ->> 'tone', 'reasonCategoryLabel', "Lookups"."getLookupLabel"('ShiftSwapRequestReasonCategory', t."reasonCategory") ->> 'label', 'reasonCategoryTone', "Lookups"."getLookupLabel"('ShiftSwapRequestReasonCategory', t."reasonCategory") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ShiftSwapRequestStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ShiftSwapRequestStatus', t.status) ->> 'tone')
    FROM "EmployeeSelfService"."ShiftSwapRequests" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "EmployeeSelfService"."getShiftSwapRequestInfo"(uuid) IS 'Read one ShiftSwapRequests record (getter for its screens).';

-- ShiftSwapRequests: Approve (status -> APPROVED); allowed from REQUESTED, ACCEPTED
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."shiftSwapRequestApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "EmployeeSelfService"."ShiftSwapRequests";
BEGIN
  SELECT * INTO "vRow" FROM "EmployeeSelfService"."ShiftSwapRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ShiftSwapRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('REQUESTED', 'ACCEPTED') THEN
    RAISE EXCEPTION 'ShiftSwapRequests %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'ShiftSwapRequests: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"EmployeeSelfService"."shiftSwapRequestApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"EmployeeSelfService"."shiftSwapRequestApproveEntries"') USING "pId";
  END IF;
  UPDATE "EmployeeSelfService"."ShiftSwapRequests" t SET status = 'APPROVED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- OpenShifts: insert (no "id") or update (with "id"); child arrays: claims
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."openShiftAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "EmployeeSelfService"."OpenShifts";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1OpenShiftClaims" "EmployeeSelfService"."OpenShiftClaims";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"EmployeeSelfService"."OpenShifts", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "EmployeeSelfService"."OpenShifts" ("tenantId", code, "shiftDate", "shiftId", "branchId", "departmentId", title, "perkText", "allowanceAmount", "overtimeMultiplier", "slotsTotal")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'shiftDate' THEN "vRec"."shiftDate" ELSE NULL END, CASE WHEN "pData" ? 'shiftId' THEN "vRec"."shiftId" ELSE NULL END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE NULL END, CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE NULL END, CASE WHEN "pData" ? 'perkText' THEN "vRec"."perkText" ELSE NULL END, CASE WHEN "pData" ? 'allowanceAmount' THEN "vRec"."allowanceAmount" ELSE NULL END, CASE WHEN "pData" ? 'overtimeMultiplier' THEN "vRec"."overtimeMultiplier" ELSE NULL END, CASE WHEN "pData" ? 'slotsTotal' THEN "vRec"."slotsTotal" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "EmployeeSelfService"."OpenShifts" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'OpenShifts: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "EmployeeSelfService"."OpenShifts" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           "shiftDate" = CASE WHEN "pData" ? 'shiftDate' THEN "vRec"."shiftDate" ELSE t."shiftDate" END,
           "shiftId" = CASE WHEN "pData" ? 'shiftId' THEN "vRec"."shiftId" ELSE t."shiftId" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "departmentId" = CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE t."departmentId" END,
           title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
           "perkText" = CASE WHEN "pData" ? 'perkText' THEN "vRec"."perkText" ELSE t."perkText" END,
           "allowanceAmount" = CASE WHEN "pData" ? 'allowanceAmount' THEN "vRec"."allowanceAmount" ELSE t."allowanceAmount" END,
           "overtimeMultiplier" = CASE WHEN "pData" ? 'overtimeMultiplier' THEN "vRec"."overtimeMultiplier" ELSE t."overtimeMultiplier" END,
           "slotsTotal" = CASE WHEN "pData" ? 'slotsTotal' THEN "vRec"."slotsTotal" ELSE t."slotsTotal" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "EmployeeSelfService"."OpenShifts" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'OpenShifts %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'OpenShifts % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'claims' THEN
    -- claims: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "EmployeeSelfService"."OpenShiftClaims"
     WHERE "tenantId" = "vTenant" AND "openShiftId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'claims') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'claims') WITH ORDINALITY t(x, n) LOOP
      "vC1OpenShiftClaims" := jsonb_populate_record(NULL::"EmployeeSelfService"."OpenShiftClaims", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "EmployeeSelfService"."OpenShiftClaims" t
           SET "employeeId" = CASE WHEN "vE1" ? 'employeeId' THEN "vC1OpenShiftClaims"."employeeId" ELSE t."employeeId" END,
               "claimedAt" = CASE WHEN "vE1" ? 'claimedAt' THEN "vC1OpenShiftClaims"."claimedAt" ELSE t."claimedAt" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1OpenShiftClaims".status ELSE t.status END,
               "decidedByUserId" = CASE WHEN "vE1" ? 'decidedByUserId' THEN "vC1OpenShiftClaims"."decidedByUserId" ELSE t."decidedByUserId" END,
               "decidedAt" = CASE WHEN "vE1" ? 'decidedAt' THEN "vC1OpenShiftClaims"."decidedAt" ELSE t."decidedAt" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."openShiftId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'OpenShiftClaims: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "EmployeeSelfService"."OpenShiftClaims" ("openShiftId", "tenantId", "employeeId", "claimedAt", status, "decidedByUserId", "decidedAt")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'employeeId' THEN "vC1OpenShiftClaims"."employeeId" ELSE NULL END, CASE WHEN "vE1" ? 'claimedAt' THEN "vC1OpenShiftClaims"."claimedAt" ELSE now() END, CASE WHEN "vE1" ? 'status' THEN "vC1OpenShiftClaims".status ELSE 'REQUESTED' END, CASE WHEN "vE1" ? 'decidedByUserId' THEN "vC1OpenShiftClaims"."decidedByUserId" ELSE NULL END, CASE WHEN "vE1" ? 'decidedAt' THEN "vC1OpenShiftClaims"."decidedAt" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "EmployeeSelfService"."openShiftAddUpdate"(jsonb) IS 'Save (insert or update) one OpenShifts record with its claims.';

-- OpenShifts: one record as JSON (camelCase keys), with lookup labels and claims
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."getOpenShiftInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('OpenShiftStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('OpenShiftStatus', t.status) ->> 'tone') ||
         jsonb_build_object('claims', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "EmployeeSelfService"."OpenShiftClaims" c1 WHERE c1."openShiftId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "EmployeeSelfService"."OpenShifts" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "EmployeeSelfService"."getOpenShiftInfo"(uuid) IS 'Read one OpenShifts record (getter for its screens).';

-- OpenShifts: Cancel (status -> CANCELLED); allowed from DRAFT, OPEN, FILLED
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."openShiftCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "EmployeeSelfService"."OpenShifts";
BEGIN
  SELECT * INTO "vRow" FROM "EmployeeSelfService"."OpenShifts" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OpenShifts % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'OPEN', 'FILLED') THEN
    RAISE EXCEPTION 'OpenShifts %: cannot cancel from status %', "vRow".code, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"EmployeeSelfService"."openShiftCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"EmployeeSelfService"."openShiftCancelEntries"') USING "pId";
  END IF;
  UPDATE "EmployeeSelfService"."OpenShifts" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- CompanyAnnouncements: insert (no "id") or update (with "id"); child arrays: reads
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."companyAnnouncementAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "EmployeeSelfService"."CompanyAnnouncements";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1CompanyAnnouncementReads" "EmployeeSelfService"."CompanyAnnouncementReads";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"EmployeeSelfService"."CompanyAnnouncements", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "EmployeeSelfService"."CompanyAnnouncements" ("tenantId", title, summary, body, kind, "authorEmployeeId", "authorLabel", "eventAt", venue, "requiresRsvp", "branchId", "departmentId", "policyDocumentId", "isPinned", "publishedAt", "expiresAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE NULL END, CASE WHEN "pData" ? 'summary' THEN "vRec".summary ELSE NULL END, CASE WHEN "pData" ? 'body' THEN "vRec".body ELSE NULL END, CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE 'GENERAL' END, CASE WHEN "pData" ? 'authorEmployeeId' THEN "vRec"."authorEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'authorLabel' THEN "vRec"."authorLabel" ELSE NULL END, CASE WHEN "pData" ? 'eventAt' THEN "vRec"."eventAt" ELSE NULL END, CASE WHEN "pData" ? 'venue' THEN "vRec".venue ELSE NULL END, CASE WHEN "pData" ? 'requiresRsvp' THEN "vRec"."requiresRsvp" ELSE FALSE END, CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE NULL END, CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE NULL END, CASE WHEN "pData" ? 'policyDocumentId' THEN "vRec"."policyDocumentId" ELSE NULL END, CASE WHEN "pData" ? 'isPinned' THEN "vRec"."isPinned" ELSE FALSE END, CASE WHEN "pData" ? 'publishedAt' THEN "vRec"."publishedAt" ELSE NULL END, CASE WHEN "pData" ? 'expiresAt' THEN "vRec"."expiresAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "EmployeeSelfService"."CompanyAnnouncements" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'CompanyAnnouncements: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "EmployeeSelfService"."CompanyAnnouncements" t
       SET title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
           summary = CASE WHEN "pData" ? 'summary' THEN "vRec".summary ELSE t.summary END,
           body = CASE WHEN "pData" ? 'body' THEN "vRec".body ELSE t.body END,
           kind = CASE WHEN "pData" ? 'kind' THEN "vRec".kind ELSE t.kind END,
           "authorEmployeeId" = CASE WHEN "pData" ? 'authorEmployeeId' THEN "vRec"."authorEmployeeId" ELSE t."authorEmployeeId" END,
           "authorLabel" = CASE WHEN "pData" ? 'authorLabel' THEN "vRec"."authorLabel" ELSE t."authorLabel" END,
           "eventAt" = CASE WHEN "pData" ? 'eventAt' THEN "vRec"."eventAt" ELSE t."eventAt" END,
           venue = CASE WHEN "pData" ? 'venue' THEN "vRec".venue ELSE t.venue END,
           "requiresRsvp" = CASE WHEN "pData" ? 'requiresRsvp' THEN "vRec"."requiresRsvp" ELSE t."requiresRsvp" END,
           "branchId" = CASE WHEN "pData" ? 'branchId' THEN "vRec"."branchId" ELSE t."branchId" END,
           "departmentId" = CASE WHEN "pData" ? 'departmentId' THEN "vRec"."departmentId" ELSE t."departmentId" END,
           "policyDocumentId" = CASE WHEN "pData" ? 'policyDocumentId' THEN "vRec"."policyDocumentId" ELSE t."policyDocumentId" END,
           "isPinned" = CASE WHEN "pData" ? 'isPinned' THEN "vRec"."isPinned" ELSE t."isPinned" END,
           "publishedAt" = CASE WHEN "pData" ? 'publishedAt' THEN "vRec"."publishedAt" ELSE t."publishedAt" END,
           "expiresAt" = CASE WHEN "pData" ? 'expiresAt' THEN "vRec"."expiresAt" ELSE t."expiresAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "EmployeeSelfService"."CompanyAnnouncements" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CompanyAnnouncements %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CompanyAnnouncements % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'reads' THEN
    -- reads: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "EmployeeSelfService"."CompanyAnnouncementReads"
     WHERE "tenantId" = "vTenant" AND "announcementId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'reads') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'reads') WITH ORDINALITY t(x, n) LOOP
      "vC1CompanyAnnouncementReads" := jsonb_populate_record(NULL::"EmployeeSelfService"."CompanyAnnouncementReads", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "EmployeeSelfService"."CompanyAnnouncementReads" t
           SET "employeeId" = CASE WHEN "vE1" ? 'employeeId' THEN "vC1CompanyAnnouncementReads"."employeeId" ELSE t."employeeId" END,
               "readAt" = CASE WHEN "vE1" ? 'readAt' THEN "vC1CompanyAnnouncementReads"."readAt" ELSE t."readAt" END,
               rsvp = CASE WHEN "vE1" ? 'rsvp' THEN "vC1CompanyAnnouncementReads".rsvp ELSE t.rsvp END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."announcementId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'CompanyAnnouncementReads: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "EmployeeSelfService"."CompanyAnnouncementReads" ("announcementId", "tenantId", "employeeId", "readAt", rsvp)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'employeeId' THEN "vC1CompanyAnnouncementReads"."employeeId" ELSE NULL END, CASE WHEN "vE1" ? 'readAt' THEN "vC1CompanyAnnouncementReads"."readAt" ELSE now() END, CASE WHEN "vE1" ? 'rsvp' THEN "vC1CompanyAnnouncementReads".rsvp ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "EmployeeSelfService"."companyAnnouncementAddUpdate"(jsonb) IS 'Save (insert or update) one CompanyAnnouncements record with its reads.';

-- CompanyAnnouncements: one record as JSON (camelCase keys), with lookup labels and reads
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."getCompanyAnnouncementInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('kindLabel', "Lookups"."getLookupLabel"('CompanyAnnouncementKind', t.kind) ->> 'label', 'kindTone', "Lookups"."getLookupLabel"('CompanyAnnouncementKind', t.kind) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('CompanyAnnouncementStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('CompanyAnnouncementStatus', t.status) ->> 'tone') ||
         jsonb_build_object('reads', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "EmployeeSelfService"."CompanyAnnouncementReads" c1 WHERE c1."announcementId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "EmployeeSelfService"."CompanyAnnouncements" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "EmployeeSelfService"."getCompanyAnnouncementInfo"(uuid) IS 'Read one CompanyAnnouncements record (getter for its screens).';

-- CompanyPolicies: insert (no "id") or update (with "id"); child arrays: acknowledgements
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."companyPolicyAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "EmployeeSelfService"."CompanyPolicies";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1PolicyAcknowledgements" "EmployeeSelfService"."PolicyAcknowledgements";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"EmployeeSelfService"."CompanyPolicies", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "EmployeeSelfService"."CompanyPolicies" ("tenantId", code, title, version, category, "effectiveDate", "ownerEmployeeId", body, "readMinutes", "attachmentId", "requiresAcknowledgement", "supersedesPolicyId", status, "publishedAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE NULL END, CASE WHEN "pData" ? 'version' THEN "vRec".version ELSE NULL END, CASE WHEN "pData" ? 'category' THEN "vRec".category ELSE 'HR' END, CASE WHEN "pData" ? 'effectiveDate' THEN "vRec"."effectiveDate" ELSE NULL END, CASE WHEN "pData" ? 'ownerEmployeeId' THEN "vRec"."ownerEmployeeId" ELSE NULL END, CASE WHEN "pData" ? 'body' THEN "vRec".body ELSE NULL END, CASE WHEN "pData" ? 'readMinutes' THEN "vRec"."readMinutes" ELSE NULL END, CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE NULL END, CASE WHEN "pData" ? 'requiresAcknowledgement' THEN "vRec"."requiresAcknowledgement" ELSE TRUE END, CASE WHEN "pData" ? 'supersedesPolicyId' THEN "vRec"."supersedesPolicyId" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'DRAFT' END, CASE WHEN "pData" ? 'publishedAt' THEN "vRec"."publishedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "EmployeeSelfService"."CompanyPolicies" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           title = CASE WHEN "pData" ? 'title' THEN "vRec".title ELSE t.title END,
           version = CASE WHEN "pData" ? 'version' THEN "vRec".version ELSE t.version END,
           category = CASE WHEN "pData" ? 'category' THEN "vRec".category ELSE t.category END,
           "effectiveDate" = CASE WHEN "pData" ? 'effectiveDate' THEN "vRec"."effectiveDate" ELSE t."effectiveDate" END,
           "ownerEmployeeId" = CASE WHEN "pData" ? 'ownerEmployeeId' THEN "vRec"."ownerEmployeeId" ELSE t."ownerEmployeeId" END,
           body = CASE WHEN "pData" ? 'body' THEN "vRec".body ELSE t.body END,
           "readMinutes" = CASE WHEN "pData" ? 'readMinutes' THEN "vRec"."readMinutes" ELSE t."readMinutes" END,
           "attachmentId" = CASE WHEN "pData" ? 'attachmentId' THEN "vRec"."attachmentId" ELSE t."attachmentId" END,
           "requiresAcknowledgement" = CASE WHEN "pData" ? 'requiresAcknowledgement' THEN "vRec"."requiresAcknowledgement" ELSE t."requiresAcknowledgement" END,
           "supersedesPolicyId" = CASE WHEN "pData" ? 'supersedesPolicyId' THEN "vRec"."supersedesPolicyId" ELSE t."supersedesPolicyId" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END,
           "publishedAt" = CASE WHEN "pData" ? 'publishedAt' THEN "vRec"."publishedAt" ELSE t."publishedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "EmployeeSelfService"."CompanyPolicies" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'CompanyPolicies %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'CompanyPolicies % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'acknowledgements' THEN
    -- acknowledgements: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "EmployeeSelfService"."PolicyAcknowledgements"
     WHERE "tenantId" = "vTenant" AND "policyDocumentId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'acknowledgements') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'acknowledgements') WITH ORDINALITY t(x, n) LOOP
      "vC1PolicyAcknowledgements" := jsonb_populate_record(NULL::"EmployeeSelfService"."PolicyAcknowledgements", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "EmployeeSelfService"."PolicyAcknowledgements" t
           SET "employeeId" = CASE WHEN "vE1" ? 'employeeId' THEN "vC1PolicyAcknowledgements"."employeeId" ELSE t."employeeId" END,
               "acknowledgedAt" = CASE WHEN "vE1" ? 'acknowledgedAt' THEN "vC1PolicyAcknowledgements"."acknowledgedAt" ELSE t."acknowledgedAt" END,
               "readToEnd" = CASE WHEN "vE1" ? 'readToEnd' THEN "vC1PolicyAcknowledgements"."readToEnd" ELSE t."readToEnd" END,
               "signatureText" = CASE WHEN "vE1" ? 'signatureText' THEN "vC1PolicyAcknowledgements"."signatureText" ELSE t."signatureText" END,
               "ipAddress" = CASE WHEN "vE1" ? 'ipAddress' THEN "vC1PolicyAcknowledgements"."ipAddress" ELSE t."ipAddress" END,
               "userAgent" = CASE WHEN "vE1" ? 'userAgent' THEN "vC1PolicyAcknowledgements"."userAgent" ELSE t."userAgent" END,
               "onboardingTaskId" = CASE WHEN "vE1" ? 'onboardingTaskId' THEN "vC1PolicyAcknowledgements"."onboardingTaskId" ELSE t."onboardingTaskId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."policyDocumentId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PolicyAcknowledgements: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "EmployeeSelfService"."PolicyAcknowledgements" ("policyDocumentId", "tenantId", "employeeId", "acknowledgedAt", "readToEnd", "signatureText", "ipAddress", "userAgent", "onboardingTaskId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'employeeId' THEN "vC1PolicyAcknowledgements"."employeeId" ELSE NULL END, CASE WHEN "vE1" ? 'acknowledgedAt' THEN "vC1PolicyAcknowledgements"."acknowledgedAt" ELSE now() END, CASE WHEN "vE1" ? 'readToEnd' THEN "vC1PolicyAcknowledgements"."readToEnd" ELSE FALSE END, CASE WHEN "vE1" ? 'signatureText' THEN "vC1PolicyAcknowledgements"."signatureText" ELSE NULL END, CASE WHEN "vE1" ? 'ipAddress' THEN "vC1PolicyAcknowledgements"."ipAddress" ELSE NULL END, CASE WHEN "vE1" ? 'userAgent' THEN "vC1PolicyAcknowledgements"."userAgent" ELSE NULL END, CASE WHEN "vE1" ? 'onboardingTaskId' THEN "vC1PolicyAcknowledgements"."onboardingTaskId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "EmployeeSelfService"."companyPolicyAddUpdate"(jsonb) IS 'Save (insert or update) one CompanyPolicies record with its acknowledgements.';

-- CompanyPolicies: one record as JSON (camelCase keys), with lookup labels and acknowledgements
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."getCompanyPolicyInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('categoryLabel', "Lookups"."getLookupLabel"('CompanyPolicyCategory', t.category) ->> 'label', 'categoryTone', "Lookups"."getLookupLabel"('CompanyPolicyCategory', t.category) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('CompanyPolicyStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('CompanyPolicyStatus', t.status) ->> 'tone') ||
         jsonb_build_object('acknowledgements', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "EmployeeSelfService"."PolicyAcknowledgements" c1 WHERE c1."policyDocumentId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "EmployeeSelfService"."CompanyPolicies" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "EmployeeSelfService"."getCompanyPolicyInfo"(uuid) IS 'Read one CompanyPolicies record (getter for its screens).';

-- ProfileChangeRequests: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."profileChangeRequestAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "EmployeeSelfService"."ProfileChangeRequests";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"EmployeeSelfService"."ProfileChangeRequests", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "EmployeeSelfService"."ProfileChangeRequests" ("tenantId", "employeeId", "fieldKey", "fieldLabel", "currentValue", "requestedValue", reason, "proofAttachmentId", "otpVerifiedAt", "reviewedByUserId", "reviewedAt", "reviewComment", "appliedAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'fieldKey' THEN "vRec"."fieldKey" ELSE NULL END, CASE WHEN "pData" ? 'fieldLabel' THEN "vRec"."fieldLabel" ELSE NULL END, CASE WHEN "pData" ? 'currentValue' THEN "vRec"."currentValue" ELSE NULL END, CASE WHEN "pData" ? 'requestedValue' THEN "vRec"."requestedValue" ELSE NULL END, CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE NULL END, CASE WHEN "pData" ? 'proofAttachmentId' THEN "vRec"."proofAttachmentId" ELSE NULL END, CASE WHEN "pData" ? 'otpVerifiedAt' THEN "vRec"."otpVerifiedAt" ELSE NULL END, CASE WHEN "pData" ? 'reviewedByUserId' THEN "vRec"."reviewedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'reviewedAt' THEN "vRec"."reviewedAt" ELSE NULL END, CASE WHEN "pData" ? 'reviewComment' THEN "vRec"."reviewComment" ELSE NULL END, CASE WHEN "pData" ? 'appliedAt' THEN "vRec"."appliedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "EmployeeSelfService"."ProfileChangeRequests" t
       SET "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "fieldKey" = CASE WHEN "pData" ? 'fieldKey' THEN "vRec"."fieldKey" ELSE t."fieldKey" END,
           "fieldLabel" = CASE WHEN "pData" ? 'fieldLabel' THEN "vRec"."fieldLabel" ELSE t."fieldLabel" END,
           "currentValue" = CASE WHEN "pData" ? 'currentValue' THEN "vRec"."currentValue" ELSE t."currentValue" END,
           "requestedValue" = CASE WHEN "pData" ? 'requestedValue' THEN "vRec"."requestedValue" ELSE t."requestedValue" END,
           reason = CASE WHEN "pData" ? 'reason' THEN "vRec".reason ELSE t.reason END,
           "proofAttachmentId" = CASE WHEN "pData" ? 'proofAttachmentId' THEN "vRec"."proofAttachmentId" ELSE t."proofAttachmentId" END,
           "otpVerifiedAt" = CASE WHEN "pData" ? 'otpVerifiedAt' THEN "vRec"."otpVerifiedAt" ELSE t."otpVerifiedAt" END,
           "reviewedByUserId" = CASE WHEN "pData" ? 'reviewedByUserId' THEN "vRec"."reviewedByUserId" ELSE t."reviewedByUserId" END,
           "reviewedAt" = CASE WHEN "pData" ? 'reviewedAt' THEN "vRec"."reviewedAt" ELSE t."reviewedAt" END,
           "reviewComment" = CASE WHEN "pData" ? 'reviewComment' THEN "vRec"."reviewComment" ELSE t."reviewComment" END,
           "appliedAt" = CASE WHEN "pData" ? 'appliedAt' THEN "vRec"."appliedAt" ELSE t."appliedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "EmployeeSelfService"."ProfileChangeRequests" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'ProfileChangeRequests %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'ProfileChangeRequests % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "EmployeeSelfService"."profileChangeRequestAddUpdate"(jsonb) IS 'Save (insert or update) one ProfileChangeRequests record.';

-- ProfileChangeRequests: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."getProfileChangeRequestInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('fieldKeyLabel', "Lookups"."getLookupLabel"('FieldKey', t."fieldKey") ->> 'label', 'fieldKeyTone', "Lookups"."getLookupLabel"('FieldKey', t."fieldKey") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ProfileChangeRequestStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ProfileChangeRequestStatus', t.status) ->> 'tone')
    FROM "EmployeeSelfService"."ProfileChangeRequests" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "EmployeeSelfService"."getProfileChangeRequestInfo"(uuid) IS 'Read one ProfileChangeRequests record (getter for its screens).';

-- ProfileChangeRequests: Approve (status -> APPROVED); allowed from PENDING
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."profileChangeRequestApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "EmployeeSelfService"."ProfileChangeRequests";
BEGIN
  SELECT * INTO "vRow" FROM "EmployeeSelfService"."ProfileChangeRequests" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ProfileChangeRequests % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING') THEN
    RAISE EXCEPTION 'ProfileChangeRequests %: cannot approve from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'ProfileChangeRequests: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"EmployeeSelfService"."profileChangeRequestApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"EmployeeSelfService"."profileChangeRequestApproveEntries"') USING "pId";
  END IF;
  UPDATE "EmployeeSelfService"."ProfileChangeRequests" t SET status = 'APPROVED' WHERE t.id = "pId";
  RETURN "pId";
END $$;
