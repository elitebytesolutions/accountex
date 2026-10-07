-- =============================================================================
-- Finsoft ERP (Full edition) — API: "Payroll"
-- GENERATED from the schema. One save function per entity (<entity>AddUpdate),
-- one getter (get<Entity>Info) and the document actions (Post / Approve / Void /
-- Cancel / Reverse). The application role can only EXECUTE these; it has no
-- INSERT/UPDATE/DELETE on tables.
-- =============================================================================
-- SalaryComponents: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Payroll"."salaryComponentAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Payroll"."SalaryComponents";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Payroll"."SalaryComponents", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Payroll"."SalaryComponents" ("tenantId", code, name, "componentType", "calcMethod", "baseBasis", "baseComponentId", percent, "fixedAmount", "wageCeiling", formula, "calcDescription", "debitAccountId", "creditAccountId", "taxTreatment", "exemptLimitPercentOfBasic", "exemptLimitAnnualAmount", "prorateOnPaidDays", "showOnPayslip", "includeInGratuityBase", "includeInEobiWage", "systemRole", "sortOrder", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'componentType' THEN "vRec"."componentType" ELSE NULL END, CASE WHEN "pData" ? 'calcMethod' THEN "vRec"."calcMethod" ELSE NULL END, CASE WHEN "pData" ? 'baseBasis' THEN "vRec"."baseBasis" ELSE NULL END, CASE WHEN "pData" ? 'baseComponentId' THEN "vRec"."baseComponentId" ELSE NULL END, CASE WHEN "pData" ? 'percent' THEN "vRec".percent ELSE NULL END, CASE WHEN "pData" ? 'fixedAmount' THEN "vRec"."fixedAmount" ELSE NULL END, CASE WHEN "pData" ? 'wageCeiling' THEN "vRec"."wageCeiling" ELSE NULL END, CASE WHEN "pData" ? 'formula' THEN "vRec".formula ELSE NULL END, CASE WHEN "pData" ? 'calcDescription' THEN "vRec"."calcDescription" ELSE NULL END, CASE WHEN "pData" ? 'debitAccountId' THEN "vRec"."debitAccountId" ELSE NULL END, CASE WHEN "pData" ? 'creditAccountId' THEN "vRec"."creditAccountId" ELSE NULL END, CASE WHEN "pData" ? 'taxTreatment' THEN "vRec"."taxTreatment" ELSE NULL END, CASE WHEN "pData" ? 'exemptLimitPercentOfBasic' THEN "vRec"."exemptLimitPercentOfBasic" ELSE NULL END, CASE WHEN "pData" ? 'exemptLimitAnnualAmount' THEN "vRec"."exemptLimitAnnualAmount" ELSE NULL END, CASE WHEN "pData" ? 'prorateOnPaidDays' THEN "vRec"."prorateOnPaidDays" ELSE TRUE END, CASE WHEN "pData" ? 'showOnPayslip' THEN "vRec"."showOnPayslip" ELSE TRUE END, CASE WHEN "pData" ? 'includeInGratuityBase' THEN "vRec"."includeInGratuityBase" ELSE FALSE END, CASE WHEN "pData" ? 'includeInEobiWage' THEN "vRec"."includeInEobiWage" ELSE FALSE END, CASE WHEN "pData" ? 'systemRole' THEN "vRec"."systemRole" ELSE NULL END, CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE 0 END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Payroll"."SalaryComponents" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "componentType" = CASE WHEN "pData" ? 'componentType' THEN "vRec"."componentType" ELSE t."componentType" END,
           "calcMethod" = CASE WHEN "pData" ? 'calcMethod' THEN "vRec"."calcMethod" ELSE t."calcMethod" END,
           "baseBasis" = CASE WHEN "pData" ? 'baseBasis' THEN "vRec"."baseBasis" ELSE t."baseBasis" END,
           "baseComponentId" = CASE WHEN "pData" ? 'baseComponentId' THEN "vRec"."baseComponentId" ELSE t."baseComponentId" END,
           percent = CASE WHEN "pData" ? 'percent' THEN "vRec".percent ELSE t.percent END,
           "fixedAmount" = CASE WHEN "pData" ? 'fixedAmount' THEN "vRec"."fixedAmount" ELSE t."fixedAmount" END,
           "wageCeiling" = CASE WHEN "pData" ? 'wageCeiling' THEN "vRec"."wageCeiling" ELSE t."wageCeiling" END,
           formula = CASE WHEN "pData" ? 'formula' THEN "vRec".formula ELSE t.formula END,
           "calcDescription" = CASE WHEN "pData" ? 'calcDescription' THEN "vRec"."calcDescription" ELSE t."calcDescription" END,
           "debitAccountId" = CASE WHEN "pData" ? 'debitAccountId' THEN "vRec"."debitAccountId" ELSE t."debitAccountId" END,
           "creditAccountId" = CASE WHEN "pData" ? 'creditAccountId' THEN "vRec"."creditAccountId" ELSE t."creditAccountId" END,
           "taxTreatment" = CASE WHEN "pData" ? 'taxTreatment' THEN "vRec"."taxTreatment" ELSE t."taxTreatment" END,
           "exemptLimitPercentOfBasic" = CASE WHEN "pData" ? 'exemptLimitPercentOfBasic' THEN "vRec"."exemptLimitPercentOfBasic" ELSE t."exemptLimitPercentOfBasic" END,
           "exemptLimitAnnualAmount" = CASE WHEN "pData" ? 'exemptLimitAnnualAmount' THEN "vRec"."exemptLimitAnnualAmount" ELSE t."exemptLimitAnnualAmount" END,
           "prorateOnPaidDays" = CASE WHEN "pData" ? 'prorateOnPaidDays' THEN "vRec"."prorateOnPaidDays" ELSE t."prorateOnPaidDays" END,
           "showOnPayslip" = CASE WHEN "pData" ? 'showOnPayslip' THEN "vRec"."showOnPayslip" ELSE t."showOnPayslip" END,
           "includeInGratuityBase" = CASE WHEN "pData" ? 'includeInGratuityBase' THEN "vRec"."includeInGratuityBase" ELSE t."includeInGratuityBase" END,
           "includeInEobiWage" = CASE WHEN "pData" ? 'includeInEobiWage' THEN "vRec"."includeInEobiWage" ELSE t."includeInEobiWage" END,
           "systemRole" = CASE WHEN "pData" ? 'systemRole' THEN "vRec"."systemRole" ELSE t."systemRole" END,
           "sortOrder" = CASE WHEN "pData" ? 'sortOrder' THEN "vRec"."sortOrder" ELSE t."sortOrder" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Payroll"."SalaryComponents" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'SalaryComponents %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SalaryComponents % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Payroll"."salaryComponentAddUpdate"(jsonb) IS 'Save (insert or update) one SalaryComponents record.';

-- SalaryComponents: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Payroll"."getSalaryComponentInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('componentTypeLabel', "Lookups"."getLookupLabel"('ComponentType', t."componentType") ->> 'label', 'componentTypeTone', "Lookups"."getLookupLabel"('ComponentType', t."componentType") ->> 'tone', 'calcMethodLabel', "Lookups"."getLookupLabel"('SalaryComponentCalcMethod', t."calcMethod") ->> 'label', 'calcMethodTone', "Lookups"."getLookupLabel"('SalaryComponentCalcMethod', t."calcMethod") ->> 'tone', 'baseBasisLabel', "Lookups"."getLookupLabel"('BaseBasis', t."baseBasis") ->> 'label', 'baseBasisTone', "Lookups"."getLookupLabel"('BaseBasis', t."baseBasis") ->> 'tone', 'taxTreatmentLabel', "Lookups"."getLookupLabel"('TaxTreatment', t."taxTreatment") ->> 'label', 'taxTreatmentTone', "Lookups"."getLookupLabel"('TaxTreatment', t."taxTreatment") ->> 'tone', 'systemRoleLabel', "Lookups"."getLookupLabel"('SystemRole', t."systemRole") ->> 'label', 'systemRoleTone', "Lookups"."getLookupLabel"('SystemRole', t."systemRole") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone')
    FROM "Payroll"."SalaryComponents" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Payroll"."getSalaryComponentInfo"(uuid) IS 'Read one SalaryComponents record (getter for its screens).';

-- SalaryStructures: insert (no "id") or update (with "id"); child arrays: components, commissionTiers
CREATE OR REPLACE FUNCTION "Payroll"."salaryStructureAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Payroll"."SalaryStructures";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vC1SalaryStructureCommissionTiers" "Payroll"."SalaryStructureCommissionTiers";
  "vC1SalaryStructureComponents" "Payroll"."SalaryStructureComponents";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Payroll"."SalaryStructures", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Payroll"."SalaryStructures" ("tenantId", code, name, "structureKind", "gradeId", "basicMin", "basicMax", "grossMid", "commissionCapPercentOfBasic", description, "effectiveFrom", "copiedFromStructureId", status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'structureKind' THEN "vRec"."structureKind" ELSE 'GRADE' END, CASE WHEN "pData" ? 'gradeId' THEN "vRec"."gradeId" ELSE NULL END, CASE WHEN "pData" ? 'basicMin' THEN "vRec"."basicMin" ELSE NULL END, CASE WHEN "pData" ? 'basicMax' THEN "vRec"."basicMax" ELSE NULL END, CASE WHEN "pData" ? 'grossMid' THEN "vRec"."grossMid" ELSE NULL END, CASE WHEN "pData" ? 'commissionCapPercentOfBasic' THEN "vRec"."commissionCapPercentOfBasic" ELSE NULL END, CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE NULL END, CASE WHEN "pData" ? 'effectiveFrom' THEN "vRec"."effectiveFrom" ELSE CURRENT_DATE END, CASE WHEN "pData" ? 'copiedFromStructureId' THEN "vRec"."copiedFromStructureId" ELSE NULL END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'DRAFT' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Payroll"."SalaryStructures" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           "structureKind" = CASE WHEN "pData" ? 'structureKind' THEN "vRec"."structureKind" ELSE t."structureKind" END,
           "gradeId" = CASE WHEN "pData" ? 'gradeId' THEN "vRec"."gradeId" ELSE t."gradeId" END,
           "basicMin" = CASE WHEN "pData" ? 'basicMin' THEN "vRec"."basicMin" ELSE t."basicMin" END,
           "basicMax" = CASE WHEN "pData" ? 'basicMax' THEN "vRec"."basicMax" ELSE t."basicMax" END,
           "grossMid" = CASE WHEN "pData" ? 'grossMid' THEN "vRec"."grossMid" ELSE t."grossMid" END,
           "commissionCapPercentOfBasic" = CASE WHEN "pData" ? 'commissionCapPercentOfBasic' THEN "vRec"."commissionCapPercentOfBasic" ELSE t."commissionCapPercentOfBasic" END,
           description = CASE WHEN "pData" ? 'description' THEN "vRec".description ELSE t.description END,
           "effectiveFrom" = CASE WHEN "pData" ? 'effectiveFrom' THEN "vRec"."effectiveFrom" ELSE t."effectiveFrom" END,
           "copiedFromStructureId" = CASE WHEN "pData" ? 'copiedFromStructureId' THEN "vRec"."copiedFromStructureId" ELSE t."copiedFromStructureId" END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Payroll"."SalaryStructures" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'SalaryStructures %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SalaryStructures % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'components' THEN
    -- components: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."SalaryStructureComponents"
     WHERE "tenantId" = "vTenant" AND "structureId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'components') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'components') WITH ORDINALITY t(x, n) LOOP
      "vC1SalaryStructureComponents" := jsonb_populate_record(NULL::"Payroll"."SalaryStructureComponents", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Payroll"."SalaryStructureComponents" t
           SET "componentId" = CASE WHEN "vE1" ? 'componentId' THEN "vC1SalaryStructureComponents"."componentId" ELSE t."componentId" END,
               "calcMethod" = CASE WHEN "vE1" ? 'calcMethod' THEN "vC1SalaryStructureComponents"."calcMethod" ELSE t."calcMethod" END,
               percent = CASE WHEN "vE1" ? 'percent' THEN "vC1SalaryStructureComponents".percent ELSE t.percent END,
               "fixedAmount" = CASE WHEN "vE1" ? 'fixedAmount' THEN "vC1SalaryStructureComponents"."fixedAmount" ELSE t."fixedAmount" END,
               quantity = CASE WHEN "vE1" ? 'quantity' THEN "vC1SalaryStructureComponents".quantity ELSE t.quantity END,
               formula = CASE WHEN "vE1" ? 'formula' THEN "vC1SalaryStructureComponents".formula ELSE t.formula END,
               "displayText" = CASE WHEN "vE1" ? 'displayText' THEN "vC1SalaryStructureComponents"."displayText" ELSE t."displayText" END,
               "sortOrder" = CASE WHEN "vE1" ? 'sortOrder' THEN "vC1SalaryStructureComponents"."sortOrder" ELSE t."sortOrder" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."structureId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SalaryStructureComponents: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."SalaryStructureComponents" ("structureId", "tenantId", "componentId", "calcMethod", percent, "fixedAmount", quantity, formula, "displayText", "sortOrder")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'componentId' THEN "vC1SalaryStructureComponents"."componentId" ELSE NULL END, CASE WHEN "vE1" ? 'calcMethod' THEN "vC1SalaryStructureComponents"."calcMethod" ELSE NULL END, CASE WHEN "vE1" ? 'percent' THEN "vC1SalaryStructureComponents".percent ELSE NULL END, CASE WHEN "vE1" ? 'fixedAmount' THEN "vC1SalaryStructureComponents"."fixedAmount" ELSE NULL END, CASE WHEN "vE1" ? 'quantity' THEN "vC1SalaryStructureComponents".quantity ELSE NULL END, CASE WHEN "vE1" ? 'formula' THEN "vC1SalaryStructureComponents".formula ELSE NULL END, CASE WHEN "vE1" ? 'displayText' THEN "vC1SalaryStructureComponents"."displayText" ELSE NULL END, CASE WHEN "vE1" ? 'sortOrder' THEN "vC1SalaryStructureComponents"."sortOrder" ELSE 0 END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'commissionTiers' THEN
    -- commissionTiers: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."SalaryStructureCommissionTiers"
     WHERE "tenantId" = "vTenant" AND "structureId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'commissionTiers') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'commissionTiers') WITH ORDINALITY t(x, n) LOOP
      "vC1SalaryStructureCommissionTiers" := jsonb_populate_record(NULL::"Payroll"."SalaryStructureCommissionTiers", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Payroll"."SalaryStructureCommissionTiers" t
           SET "achievementFromPct" = CASE WHEN "vE1" ? 'achievementFromPct' THEN "vC1SalaryStructureCommissionTiers"."achievementFromPct" ELSE t."achievementFromPct" END,
               "achievementToPct" = CASE WHEN "vE1" ? 'achievementToPct' THEN "vC1SalaryStructureCommissionTiers"."achievementToPct" ELSE t."achievementToPct" END,
               "commissionRatePct" = CASE WHEN "vE1" ? 'commissionRatePct' THEN "vC1SalaryStructureCommissionTiers"."commissionRatePct" ELSE t."commissionRatePct" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."structureId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SalaryStructureCommissionTiers: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."SalaryStructureCommissionTiers" ("structureId", "tenantId", "achievementFromPct", "achievementToPct", "commissionRatePct")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'achievementFromPct' THEN "vC1SalaryStructureCommissionTiers"."achievementFromPct" ELSE NULL END, CASE WHEN "vE1" ? 'achievementToPct' THEN "vC1SalaryStructureCommissionTiers"."achievementToPct" ELSE NULL END, CASE WHEN "vE1" ? 'commissionRatePct' THEN "vC1SalaryStructureCommissionTiers"."commissionRatePct" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Payroll"."salaryStructureAddUpdate"(jsonb) IS 'Save (insert or update) one SalaryStructures record with its components, commissionTiers.';

-- SalaryStructures: one record as JSON (camelCase keys), with lookup labels and components, commissionTiers
CREATE OR REPLACE FUNCTION "Payroll"."getSalaryStructureInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('structureKindLabel', "Lookups"."getLookupLabel"('StructureKind', t."structureKind") ->> 'label', 'structureKindTone', "Lookups"."getLookupLabel"('StructureKind', t."structureKind") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('SalaryStructureStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('SalaryStructureStatus', t.status) ->> 'tone') ||
         jsonb_build_object('components', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."sortOrder") FROM "Payroll"."SalaryStructureComponents" c1 WHERE c1."structureId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'commissionTiers', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Payroll"."SalaryStructureCommissionTiers" c1 WHERE c1."structureId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Payroll"."SalaryStructures" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Payroll"."getSalaryStructureInfo"(uuid) IS 'Read one SalaryStructures record (getter for its screens).';

-- PayGroups: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Payroll"."payGroupAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Payroll"."PayGroups";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Payroll"."PayGroups", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Payroll"."PayGroups" ("tenantId", code, name, frequency, status)
    VALUES ("vTenant", CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE NULL END, CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE NULL END, CASE WHEN "pData" ? 'frequency' THEN "vRec".frequency ELSE 'MONTHLY' END, CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE 'ACTIVE' END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Payroll"."PayGroups" t
       SET code = CASE WHEN "pData" ? 'code' THEN "vRec".code ELSE t.code END,
           name = CASE WHEN "pData" ? 'name' THEN "vRec".name ELSE t.name END,
           frequency = CASE WHEN "pData" ? 'frequency' THEN "vRec".frequency ELSE t.frequency END,
           status = CASE WHEN "pData" ? 'status' THEN "vRec".status ELSE t.status END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Payroll"."PayGroups" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PayGroups %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PayGroups % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Payroll"."payGroupAddUpdate"(jsonb) IS 'Save (insert or update) one PayGroups record.';

-- PayGroups: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Payroll"."getPayGroupInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('frequencyLabel', "Lookups"."getLookupLabel"('PayGroupFrequency', t.frequency) ->> 'label', 'frequencyTone', "Lookups"."getLookupLabel"('PayGroupFrequency', t.frequency) ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('ActiveInactiveStatus', t.status) ->> 'tone')
    FROM "Payroll"."PayGroups" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Payroll"."getPayGroupInfo"(uuid) IS 'Read one PayGroups record (getter for its screens).';

-- EmployeeSalaries: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Payroll"."employeeSalaryAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Payroll"."EmployeeSalaries";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Payroll"."EmployeeSalaries", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Payroll"."EmployeeSalaries" ("tenantId", "employeeId", "structureId", "addonStructureId", "payGroupId", "effectiveFrom", "effectiveTo", "basicAmount", "grossAmount", "payMode", "revisionType", "revisionReason", "approvedByUserId", "approvedAt")
    VALUES ("vTenant", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'structureId' THEN "vRec"."structureId" ELSE NULL END, CASE WHEN "pData" ? 'addonStructureId' THEN "vRec"."addonStructureId" ELSE NULL END, CASE WHEN "pData" ? 'payGroupId' THEN "vRec"."payGroupId" ELSE NULL END, CASE WHEN "pData" ? 'effectiveFrom' THEN "vRec"."effectiveFrom" ELSE NULL END, CASE WHEN "pData" ? 'effectiveTo' THEN "vRec"."effectiveTo" ELSE NULL END, CASE WHEN "pData" ? 'basicAmount' THEN "vRec"."basicAmount" ELSE NULL END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE NULL END, CASE WHEN "pData" ? 'payMode' THEN "vRec"."payMode" ELSE 'BANK_TRANSFER' END, CASE WHEN "pData" ? 'revisionType' THEN "vRec"."revisionType" ELSE 'JOINING' END, CASE WHEN "pData" ? 'revisionReason' THEN "vRec"."revisionReason" ELSE NULL END, CASE WHEN "pData" ? 'approvedByUserId' THEN "vRec"."approvedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'approvedAt' THEN "vRec"."approvedAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Payroll"."EmployeeSalaries" t
       SET "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "structureId" = CASE WHEN "pData" ? 'structureId' THEN "vRec"."structureId" ELSE t."structureId" END,
           "addonStructureId" = CASE WHEN "pData" ? 'addonStructureId' THEN "vRec"."addonStructureId" ELSE t."addonStructureId" END,
           "payGroupId" = CASE WHEN "pData" ? 'payGroupId' THEN "vRec"."payGroupId" ELSE t."payGroupId" END,
           "effectiveFrom" = CASE WHEN "pData" ? 'effectiveFrom' THEN "vRec"."effectiveFrom" ELSE t."effectiveFrom" END,
           "effectiveTo" = CASE WHEN "pData" ? 'effectiveTo' THEN "vRec"."effectiveTo" ELSE t."effectiveTo" END,
           "basicAmount" = CASE WHEN "pData" ? 'basicAmount' THEN "vRec"."basicAmount" ELSE t."basicAmount" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "payMode" = CASE WHEN "pData" ? 'payMode' THEN "vRec"."payMode" ELSE t."payMode" END,
           "revisionType" = CASE WHEN "pData" ? 'revisionType' THEN "vRec"."revisionType" ELSE t."revisionType" END,
           "revisionReason" = CASE WHEN "pData" ? 'revisionReason' THEN "vRec"."revisionReason" ELSE t."revisionReason" END,
           "approvedByUserId" = CASE WHEN "pData" ? 'approvedByUserId' THEN "vRec"."approvedByUserId" ELSE t."approvedByUserId" END,
           "approvedAt" = CASE WHEN "pData" ? 'approvedAt' THEN "vRec"."approvedAt" ELSE t."approvedAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Payroll"."EmployeeSalaries" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'EmployeeSalaries %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'EmployeeSalaries % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Payroll"."employeeSalaryAddUpdate"(jsonb) IS 'Save (insert or update) one EmployeeSalaries record.';

-- EmployeeSalaries: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Payroll"."getEmployeeSalaryInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('payModeLabel', "Lookups"."getLookupLabel"('BankTransferChequeCashPayMode', t."payMode") ->> 'label', 'payModeTone', "Lookups"."getLookupLabel"('BankTransferChequeCashPayMode', t."payMode") ->> 'tone', 'revisionTypeLabel', "Lookups"."getLookupLabel"('RevisionType', t."revisionType") ->> 'label', 'revisionTypeTone', "Lookups"."getLookupLabel"('RevisionType', t."revisionType") ->> 'tone')
    FROM "Payroll"."EmployeeSalaries" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Payroll"."getEmployeeSalaryInfo"(uuid) IS 'Read one EmployeeSalaries record (getter for its screens).';

-- LoansAndAdvances: insert (no "id") or update (with "id"); child arrays: installments
CREATE OR REPLACE FUNCTION "Payroll"."loanAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Payroll"."LoansAndAdvances";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1LoanInstallments" "Payroll"."LoanInstallments";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Payroll"."LoansAndAdvances", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"(CASE WHEN "vRec"."loanType" = 'LOAN' THEN 'LN' WHEN "vRec"."loanType" = 'MEDICAL' THEN 'LN' WHEN "vRec"."loanType" = 'SALARY_ADVANCE' THEN 'ADV' ELSE 'LN' END, "vRec"."docDate", NULL);
    END IF;
    INSERT INTO "Payroll"."LoansAndAdvances" ("tenantId", "docNo", "docDate", "employeeId", "loanType", purpose, "purposeDetail", "requestChannel", "requestedAmount", "installmentCount", "installmentAmount", "firstDeductionMonth", "markupType", "markupRate", "grossSalarySnapshot", "installmentPctOfGross", "eligibleLimitAmount", "pfBalanceSnapshot", "isWithinPolicy", "disbursementDate", "disbursedFromBankAccountId", "disbursedFromCashAccountId", "disbursementJournalEntryId", "approvalRequestId", "decisionComment", "closedAt", remarks)
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE CURRENT_DATE END, CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'loanType' THEN "vRec"."loanType" ELSE NULL END, CASE WHEN "pData" ? 'purpose' THEN "vRec".purpose ELSE 'PERSONAL' END, CASE WHEN "pData" ? 'purposeDetail' THEN "vRec"."purposeDetail" ELSE NULL END, CASE WHEN "pData" ? 'requestChannel' THEN "vRec"."requestChannel" ELSE 'HR' END, CASE WHEN "pData" ? 'requestedAmount' THEN "vRec"."requestedAmount" ELSE NULL END, CASE WHEN "pData" ? 'installmentCount' THEN "vRec"."installmentCount" ELSE NULL END, CASE WHEN "pData" ? 'installmentAmount' THEN "vRec"."installmentAmount" ELSE NULL END, CASE WHEN "pData" ? 'firstDeductionMonth' THEN "vRec"."firstDeductionMonth" ELSE NULL END, CASE WHEN "pData" ? 'markupType' THEN "vRec"."markupType" ELSE 'INTEREST_FREE' END, CASE WHEN "pData" ? 'markupRate' THEN "vRec"."markupRate" ELSE NULL END, CASE WHEN "pData" ? 'grossSalarySnapshot' THEN "vRec"."grossSalarySnapshot" ELSE NULL END, CASE WHEN "pData" ? 'installmentPctOfGross' THEN "vRec"."installmentPctOfGross" ELSE NULL END, CASE WHEN "pData" ? 'eligibleLimitAmount' THEN "vRec"."eligibleLimitAmount" ELSE NULL END, CASE WHEN "pData" ? 'pfBalanceSnapshot' THEN "vRec"."pfBalanceSnapshot" ELSE NULL END, CASE WHEN "pData" ? 'isWithinPolicy' THEN "vRec"."isWithinPolicy" ELSE NULL END, CASE WHEN "pData" ? 'disbursementDate' THEN "vRec"."disbursementDate" ELSE NULL END, CASE WHEN "pData" ? 'disbursedFromBankAccountId' THEN "vRec"."disbursedFromBankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'disbursedFromCashAccountId' THEN "vRec"."disbursedFromCashAccountId" ELSE NULL END, CASE WHEN "pData" ? 'disbursementJournalEntryId' THEN "vRec"."disbursementJournalEntryId" ELSE NULL END, CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE NULL END, CASE WHEN "pData" ? 'decisionComment' THEN "vRec"."decisionComment" ELSE NULL END, CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Payroll"."LoansAndAdvances" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "loanType" = CASE WHEN "pData" ? 'loanType' THEN "vRec"."loanType" ELSE t."loanType" END,
           purpose = CASE WHEN "pData" ? 'purpose' THEN "vRec".purpose ELSE t.purpose END,
           "purposeDetail" = CASE WHEN "pData" ? 'purposeDetail' THEN "vRec"."purposeDetail" ELSE t."purposeDetail" END,
           "requestChannel" = CASE WHEN "pData" ? 'requestChannel' THEN "vRec"."requestChannel" ELSE t."requestChannel" END,
           "requestedAmount" = CASE WHEN "pData" ? 'requestedAmount' THEN "vRec"."requestedAmount" ELSE t."requestedAmount" END,
           "installmentCount" = CASE WHEN "pData" ? 'installmentCount' THEN "vRec"."installmentCount" ELSE t."installmentCount" END,
           "installmentAmount" = CASE WHEN "pData" ? 'installmentAmount' THEN "vRec"."installmentAmount" ELSE t."installmentAmount" END,
           "firstDeductionMonth" = CASE WHEN "pData" ? 'firstDeductionMonth' THEN "vRec"."firstDeductionMonth" ELSE t."firstDeductionMonth" END,
           "markupType" = CASE WHEN "pData" ? 'markupType' THEN "vRec"."markupType" ELSE t."markupType" END,
           "markupRate" = CASE WHEN "pData" ? 'markupRate' THEN "vRec"."markupRate" ELSE t."markupRate" END,
           "grossSalarySnapshot" = CASE WHEN "pData" ? 'grossSalarySnapshot' THEN "vRec"."grossSalarySnapshot" ELSE t."grossSalarySnapshot" END,
           "installmentPctOfGross" = CASE WHEN "pData" ? 'installmentPctOfGross' THEN "vRec"."installmentPctOfGross" ELSE t."installmentPctOfGross" END,
           "eligibleLimitAmount" = CASE WHEN "pData" ? 'eligibleLimitAmount' THEN "vRec"."eligibleLimitAmount" ELSE t."eligibleLimitAmount" END,
           "pfBalanceSnapshot" = CASE WHEN "pData" ? 'pfBalanceSnapshot' THEN "vRec"."pfBalanceSnapshot" ELSE t."pfBalanceSnapshot" END,
           "isWithinPolicy" = CASE WHEN "pData" ? 'isWithinPolicy' THEN "vRec"."isWithinPolicy" ELSE t."isWithinPolicy" END,
           "disbursementDate" = CASE WHEN "pData" ? 'disbursementDate' THEN "vRec"."disbursementDate" ELSE t."disbursementDate" END,
           "disbursedFromBankAccountId" = CASE WHEN "pData" ? 'disbursedFromBankAccountId' THEN "vRec"."disbursedFromBankAccountId" ELSE t."disbursedFromBankAccountId" END,
           "disbursedFromCashAccountId" = CASE WHEN "pData" ? 'disbursedFromCashAccountId' THEN "vRec"."disbursedFromCashAccountId" ELSE t."disbursedFromCashAccountId" END,
           "disbursementJournalEntryId" = CASE WHEN "pData" ? 'disbursementJournalEntryId' THEN "vRec"."disbursementJournalEntryId" ELSE t."disbursementJournalEntryId" END,
           "approvalRequestId" = CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE t."approvalRequestId" END,
           "decisionComment" = CASE WHEN "pData" ? 'decisionComment' THEN "vRec"."decisionComment" ELSE t."decisionComment" END,
           "closedAt" = CASE WHEN "pData" ? 'closedAt' THEN "vRec"."closedAt" ELSE t."closedAt" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Payroll"."LoansAndAdvances" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'LoansAndAdvances %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'LoansAndAdvances % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'installments' THEN
    -- installments: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."LoanInstallments"
     WHERE "tenantId" = "vTenant" AND "loanId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'installments') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'installments') WITH ORDINALITY t(x, n) LOOP
      "vC1LoanInstallments" := jsonb_populate_record(NULL::"Payroll"."LoanInstallments", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Payroll"."LoanInstallments" t
           SET "installmentNo" = CASE WHEN "vE1" ? 'installmentNo' THEN "vC1LoanInstallments"."installmentNo" ELSE t."installmentNo" END,
               "installmentType" = CASE WHEN "vE1" ? 'installmentType' THEN "vC1LoanInstallments"."installmentType" ELSE t."installmentType" END,
               "dueMonth" = CASE WHEN "vE1" ? 'dueMonth' THEN "vC1LoanInstallments"."dueMonth" ELSE t."dueMonth" END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1LoanInstallments".amount ELSE t.amount END,
               "balanceAfter" = CASE WHEN "vE1" ? 'balanceAfter' THEN "vC1LoanInstallments"."balanceAfter" ELSE t."balanceAfter" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1LoanInstallments".status ELSE t.status END,
               "payrollLineId" = CASE WHEN "vE1" ? 'payrollLineId' THEN "vC1LoanInstallments"."payrollLineId" ELSE t."payrollLineId" END,
               "finalSettlementId" = CASE WHEN "vE1" ? 'finalSettlementId' THEN "vC1LoanInstallments"."finalSettlementId" ELSE t."finalSettlementId" END,
               "recoveredAt" = CASE WHEN "vE1" ? 'recoveredAt' THEN "vC1LoanInstallments"."recoveredAt" ELSE t."recoveredAt" END,
               remarks = CASE WHEN "vE1" ? 'remarks' THEN "vC1LoanInstallments".remarks ELSE t.remarks END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."loanId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'LoanInstallments: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."LoanInstallments" ("loanId", "tenantId", "installmentNo", "installmentType", "dueMonth", amount, "balanceAfter", status, "payrollLineId", "finalSettlementId", "recoveredAt", remarks)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'installmentNo' THEN "vC1LoanInstallments"."installmentNo" ELSE NULL END, CASE WHEN "vE1" ? 'installmentType' THEN "vC1LoanInstallments"."installmentType" ELSE 'SCHEDULED' END, CASE WHEN "vE1" ? 'dueMonth' THEN "vC1LoanInstallments"."dueMonth" ELSE NULL END, CASE WHEN "vE1" ? 'amount' THEN "vC1LoanInstallments".amount ELSE NULL END, CASE WHEN "vE1" ? 'balanceAfter' THEN "vC1LoanInstallments"."balanceAfter" ELSE NULL END, CASE WHEN "vE1" ? 'status' THEN "vC1LoanInstallments".status ELSE 'SCHEDULED' END, CASE WHEN "vE1" ? 'payrollLineId' THEN "vC1LoanInstallments"."payrollLineId" ELSE NULL END, CASE WHEN "vE1" ? 'finalSettlementId' THEN "vC1LoanInstallments"."finalSettlementId" ELSE NULL END, CASE WHEN "vE1" ? 'recoveredAt' THEN "vC1LoanInstallments"."recoveredAt" ELSE NULL END, CASE WHEN "vE1" ? 'remarks' THEN "vC1LoanInstallments".remarks ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Payroll"."loanAddUpdate"(jsonb) IS 'Save (insert or update) one LoansAndAdvances record with its installments.';

-- LoansAndAdvances: one record as JSON (camelCase keys), with lookup labels and installments
CREATE OR REPLACE FUNCTION "Payroll"."getLoanInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('loanTypeLabel', "Lookups"."getLookupLabel"('LoanType', t."loanType") ->> 'label', 'loanTypeTone', "Lookups"."getLookupLabel"('LoanType', t."loanType") ->> 'tone', 'purposeLabel', "Lookups"."getLookupLabel"('LoanPurpose', t.purpose) ->> 'label', 'purposeTone', "Lookups"."getLookupLabel"('LoanPurpose', t.purpose) ->> 'tone', 'requestChannelLabel', "Lookups"."getLookupLabel"('RequestChannel', t."requestChannel") ->> 'label', 'requestChannelTone', "Lookups"."getLookupLabel"('RequestChannel', t."requestChannel") ->> 'tone', 'markupTypeLabel', "Lookups"."getLookupLabel"('MarkupType', t."markupType") ->> 'label', 'markupTypeTone', "Lookups"."getLookupLabel"('MarkupType', t."markupType") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('LoanStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('LoanStatus', t.status) ->> 'tone') ||
         jsonb_build_object('installments', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Payroll"."LoanInstallments" c1 WHERE c1."loanId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Payroll"."LoansAndAdvances" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Payroll"."getLoanInfo"(uuid) IS 'Read one LoansAndAdvances record (getter for its screens).';

-- LoansAndAdvances: Approve (status -> APPROVED); allowed from PENDING
CREATE OR REPLACE FUNCTION "Payroll"."loanApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Payroll"."LoansAndAdvances";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."LoansAndAdvances" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LoansAndAdvances % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING') THEN
    RAISE EXCEPTION 'LoansAndAdvances %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'LoansAndAdvances: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Payroll"."loanApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Payroll"."loanApproveEntries"') USING "pId";
  END IF;
  UPDATE "Payroll"."LoansAndAdvances" t SET status = 'APPROVED', "approvedAt" = now(), "approvedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- LoansAndAdvances: Disburse (status -> ACTIVE); allowed from APPROVED
CREATE OR REPLACE FUNCTION "Payroll"."loanDisburse"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Payroll"."LoansAndAdvances";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."LoansAndAdvances" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LoansAndAdvances % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'ACTIVE' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('APPROVED') THEN
    RAISE EXCEPTION 'LoansAndAdvances %: cannot disburse from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Payroll"."loanDisburseEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Payroll"."loanDisburseEntries"') USING "pId";
  END IF;
  UPDATE "Payroll"."LoansAndAdvances" t SET status = 'ACTIVE' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- PayrollRuns: insert (no "id") or update (with "id"); child arrays: paymentBatches, adjustments, lines, branches, checklist
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Payroll"."PayrollRuns";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1PayrollAdjustments" "Payroll"."PayrollAdjustments";
  "vC1PayrollRunBranches" "Payroll"."PayrollRunBranches";
  "vC1PayrollRunChecklistItems" "Payroll"."PayrollRunChecklistItems";
  "vC1PayrollRunLines" "Payroll"."PayrollRunLines";
  "vC1SalaryPaymentBatches" "Payroll"."SalaryPaymentBatches";
  "vC2PayrollRunLineComponents" "Payroll"."PayrollRunLineComponents";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
  "vE2" jsonb;  "vO2" bigint;  "vCid2" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Payroll"."PayrollRuns", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('PRUN', current_date, NULL);
    END IF;
    INSERT INTO "Payroll"."PayrollRuns" ("tenantId", "docNo", "runType", "payrollMonth", "periodFrom", "periodTo", "payDate", "attendanceCutoffDate", "payGroupId", "salaryPayableAccountId", "includeNoticePeriod", "includeExited", "workingDays", "publicHolidays", "employeeCount", "grossAmount", "taxAmount", "eobiEmployeeAmount", "pfEmployeeAmount", "loanAmount", "deductionAmount", "netAmount", "employerContributionAmount", "wizardStep", "inputsFrozenAt", "calculatedAt", "preparedByUserId", "preparedAt", "checkedByUserId", "checkedAt", "approvalRequestId", "paidAt", "fiscalPeriodId", "emailPayslips", "publishToEss", "smsNetPayAlert", "createDepositReminders", narration, remarks)
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'runType' THEN "vRec"."runType" ELSE 'REGULAR' END, CASE WHEN "pData" ? 'payrollMonth' THEN "vRec"."payrollMonth" ELSE NULL END, CASE WHEN "pData" ? 'periodFrom' THEN "vRec"."periodFrom" ELSE NULL END, CASE WHEN "pData" ? 'periodTo' THEN "vRec"."periodTo" ELSE NULL END, CASE WHEN "pData" ? 'payDate' THEN "vRec"."payDate" ELSE NULL END, CASE WHEN "pData" ? 'attendanceCutoffDate' THEN "vRec"."attendanceCutoffDate" ELSE NULL END, CASE WHEN "pData" ? 'payGroupId' THEN "vRec"."payGroupId" ELSE NULL END, CASE WHEN "pData" ? 'salaryPayableAccountId' THEN "vRec"."salaryPayableAccountId" ELSE NULL END, CASE WHEN "pData" ? 'includeNoticePeriod' THEN "vRec"."includeNoticePeriod" ELSE TRUE END, CASE WHEN "pData" ? 'includeExited' THEN "vRec"."includeExited" ELSE FALSE END, CASE WHEN "pData" ? 'workingDays' THEN "vRec"."workingDays" ELSE NULL END, CASE WHEN "pData" ? 'publicHolidays' THEN "vRec"."publicHolidays" ELSE NULL END, CASE WHEN "pData" ? 'employeeCount' THEN "vRec"."employeeCount" ELSE 0 END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE 0 END, CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE 0 END, CASE WHEN "pData" ? 'eobiEmployeeAmount' THEN "vRec"."eobiEmployeeAmount" ELSE 0 END, CASE WHEN "pData" ? 'pfEmployeeAmount' THEN "vRec"."pfEmployeeAmount" ELSE 0 END, CASE WHEN "pData" ? 'loanAmount' THEN "vRec"."loanAmount" ELSE 0 END, CASE WHEN "pData" ? 'deductionAmount' THEN "vRec"."deductionAmount" ELSE 0 END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE 0 END, CASE WHEN "pData" ? 'employerContributionAmount' THEN "vRec"."employerContributionAmount" ELSE 0 END, CASE WHEN "pData" ? 'wizardStep' THEN "vRec"."wizardStep" ELSE 1 END, CASE WHEN "pData" ? 'inputsFrozenAt' THEN "vRec"."inputsFrozenAt" ELSE NULL END, CASE WHEN "pData" ? 'calculatedAt' THEN "vRec"."calculatedAt" ELSE NULL END, CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'preparedAt' THEN "vRec"."preparedAt" ELSE NULL END, CASE WHEN "pData" ? 'checkedByUserId' THEN "vRec"."checkedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'checkedAt' THEN "vRec"."checkedAt" ELSE NULL END, CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE NULL END, CASE WHEN "pData" ? 'paidAt' THEN "vRec"."paidAt" ELSE NULL END, CASE WHEN "pData" ? 'fiscalPeriodId' THEN "vRec"."fiscalPeriodId" ELSE NULL END, CASE WHEN "pData" ? 'emailPayslips' THEN "vRec"."emailPayslips" ELSE TRUE END, CASE WHEN "pData" ? 'publishToEss' THEN "vRec"."publishToEss" ELSE TRUE END, CASE WHEN "pData" ? 'smsNetPayAlert' THEN "vRec"."smsNetPayAlert" ELSE FALSE END, CASE WHEN "pData" ? 'createDepositReminders' THEN "vRec"."createDepositReminders" ELSE TRUE END, CASE WHEN "pData" ? 'narration' THEN "vRec".narration ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Payroll"."PayrollRuns" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'PayrollRuns: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Payroll"."PayrollRuns" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "runType" = CASE WHEN "pData" ? 'runType' THEN "vRec"."runType" ELSE t."runType" END,
           "payrollMonth" = CASE WHEN "pData" ? 'payrollMonth' THEN "vRec"."payrollMonth" ELSE t."payrollMonth" END,
           "periodFrom" = CASE WHEN "pData" ? 'periodFrom' THEN "vRec"."periodFrom" ELSE t."periodFrom" END,
           "periodTo" = CASE WHEN "pData" ? 'periodTo' THEN "vRec"."periodTo" ELSE t."periodTo" END,
           "payDate" = CASE WHEN "pData" ? 'payDate' THEN "vRec"."payDate" ELSE t."payDate" END,
           "attendanceCutoffDate" = CASE WHEN "pData" ? 'attendanceCutoffDate' THEN "vRec"."attendanceCutoffDate" ELSE t."attendanceCutoffDate" END,
           "payGroupId" = CASE WHEN "pData" ? 'payGroupId' THEN "vRec"."payGroupId" ELSE t."payGroupId" END,
           "salaryPayableAccountId" = CASE WHEN "pData" ? 'salaryPayableAccountId' THEN "vRec"."salaryPayableAccountId" ELSE t."salaryPayableAccountId" END,
           "includeNoticePeriod" = CASE WHEN "pData" ? 'includeNoticePeriod' THEN "vRec"."includeNoticePeriod" ELSE t."includeNoticePeriod" END,
           "includeExited" = CASE WHEN "pData" ? 'includeExited' THEN "vRec"."includeExited" ELSE t."includeExited" END,
           "workingDays" = CASE WHEN "pData" ? 'workingDays' THEN "vRec"."workingDays" ELSE t."workingDays" END,
           "publicHolidays" = CASE WHEN "pData" ? 'publicHolidays' THEN "vRec"."publicHolidays" ELSE t."publicHolidays" END,
           "employeeCount" = CASE WHEN "pData" ? 'employeeCount' THEN "vRec"."employeeCount" ELSE t."employeeCount" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "taxAmount" = CASE WHEN "pData" ? 'taxAmount' THEN "vRec"."taxAmount" ELSE t."taxAmount" END,
           "eobiEmployeeAmount" = CASE WHEN "pData" ? 'eobiEmployeeAmount' THEN "vRec"."eobiEmployeeAmount" ELSE t."eobiEmployeeAmount" END,
           "pfEmployeeAmount" = CASE WHEN "pData" ? 'pfEmployeeAmount' THEN "vRec"."pfEmployeeAmount" ELSE t."pfEmployeeAmount" END,
           "loanAmount" = CASE WHEN "pData" ? 'loanAmount' THEN "vRec"."loanAmount" ELSE t."loanAmount" END,
           "deductionAmount" = CASE WHEN "pData" ? 'deductionAmount' THEN "vRec"."deductionAmount" ELSE t."deductionAmount" END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "employerContributionAmount" = CASE WHEN "pData" ? 'employerContributionAmount' THEN "vRec"."employerContributionAmount" ELSE t."employerContributionAmount" END,
           "wizardStep" = CASE WHEN "pData" ? 'wizardStep' THEN "vRec"."wizardStep" ELSE t."wizardStep" END,
           "inputsFrozenAt" = CASE WHEN "pData" ? 'inputsFrozenAt' THEN "vRec"."inputsFrozenAt" ELSE t."inputsFrozenAt" END,
           "calculatedAt" = CASE WHEN "pData" ? 'calculatedAt' THEN "vRec"."calculatedAt" ELSE t."calculatedAt" END,
           "preparedByUserId" = CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE t."preparedByUserId" END,
           "preparedAt" = CASE WHEN "pData" ? 'preparedAt' THEN "vRec"."preparedAt" ELSE t."preparedAt" END,
           "checkedByUserId" = CASE WHEN "pData" ? 'checkedByUserId' THEN "vRec"."checkedByUserId" ELSE t."checkedByUserId" END,
           "checkedAt" = CASE WHEN "pData" ? 'checkedAt' THEN "vRec"."checkedAt" ELSE t."checkedAt" END,
           "approvalRequestId" = CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE t."approvalRequestId" END,
           "paidAt" = CASE WHEN "pData" ? 'paidAt' THEN "vRec"."paidAt" ELSE t."paidAt" END,
           "fiscalPeriodId" = CASE WHEN "pData" ? 'fiscalPeriodId' THEN "vRec"."fiscalPeriodId" ELSE t."fiscalPeriodId" END,
           "emailPayslips" = CASE WHEN "pData" ? 'emailPayslips' THEN "vRec"."emailPayslips" ELSE t."emailPayslips" END,
           "publishToEss" = CASE WHEN "pData" ? 'publishToEss' THEN "vRec"."publishToEss" ELSE t."publishToEss" END,
           "smsNetPayAlert" = CASE WHEN "pData" ? 'smsNetPayAlert' THEN "vRec"."smsNetPayAlert" ELSE t."smsNetPayAlert" END,
           "createDepositReminders" = CASE WHEN "pData" ? 'createDepositReminders' THEN "vRec"."createDepositReminders" ELSE t."createDepositReminders" END,
           narration = CASE WHEN "pData" ? 'narration' THEN "vRec".narration ELSE t.narration END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Payroll"."PayrollRuns" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'PayrollRuns %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'PayrollRuns % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'paymentBatches' THEN
    -- paymentBatches: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."SalaryPaymentBatches"
     WHERE "tenantId" = "vTenant" AND "payrollRunId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'paymentBatches') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'paymentBatches') WITH ORDINALITY t(x, n) LOOP
      "vC1SalaryPaymentBatches" := jsonb_populate_record(NULL::"Payroll"."SalaryPaymentBatches", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Payroll"."SalaryPaymentBatches" t
           SET "paymentMethod" = CASE WHEN "vE1" ? 'paymentMethod' THEN "vC1SalaryPaymentBatches"."paymentMethod" ELSE t."paymentMethod" END,
               "bankAccountId" = CASE WHEN "vE1" ? 'bankAccountId' THEN "vC1SalaryPaymentBatches"."bankAccountId" ELSE t."bankAccountId" END,
               "fileFormat" = CASE WHEN "vE1" ? 'fileFormat' THEN "vC1SalaryPaymentBatches"."fileFormat" ELSE t."fileFormat" END,
               "employeeCount" = CASE WHEN "vE1" ? 'employeeCount' THEN "vC1SalaryPaymentBatches"."employeeCount" ELSE t."employeeCount" END,
               "totalAmount" = CASE WHEN "vE1" ? 'totalAmount' THEN "vC1SalaryPaymentBatches"."totalAmount" ELSE t."totalAmount" END,
               "instructionRef" = CASE WHEN "vE1" ? 'instructionRef' THEN "vC1SalaryPaymentBatches"."instructionRef" ELSE t."instructionRef" END,
               "valueDate" = CASE WHEN "vE1" ? 'valueDate' THEN "vC1SalaryPaymentBatches"."valueDate" ELSE t."valueDate" END,
               "fileAttachmentId" = CASE WHEN "vE1" ? 'fileAttachmentId' THEN "vC1SalaryPaymentBatches"."fileAttachmentId" ELSE t."fileAttachmentId" END,
               "adviceAttachmentId" = CASE WHEN "vE1" ? 'adviceAttachmentId' THEN "vC1SalaryPaymentBatches"."adviceAttachmentId" ELSE t."adviceAttachmentId" END,
               "generatedAt" = CASE WHEN "vE1" ? 'generatedAt' THEN "vC1SalaryPaymentBatches"."generatedAt" ELSE t."generatedAt" END,
               "sentAt" = CASE WHEN "vE1" ? 'sentAt' THEN "vC1SalaryPaymentBatches"."sentAt" ELSE t."sentAt" END,
               status = CASE WHEN "vE1" ? 'status' THEN "vC1SalaryPaymentBatches".status ELSE t.status END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."payrollRunId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'SalaryPaymentBatches: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."SalaryPaymentBatches" ("payrollRunId", "tenantId", "paymentMethod", "bankAccountId", "fileFormat", "employeeCount", "totalAmount", "instructionRef", "valueDate", "fileAttachmentId", "adviceAttachmentId", "generatedAt", "sentAt", status)
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'paymentMethod' THEN "vC1SalaryPaymentBatches"."paymentMethod" ELSE NULL END, CASE WHEN "vE1" ? 'bankAccountId' THEN "vC1SalaryPaymentBatches"."bankAccountId" ELSE NULL END, CASE WHEN "vE1" ? 'fileFormat' THEN "vC1SalaryPaymentBatches"."fileFormat" ELSE NULL END, CASE WHEN "vE1" ? 'employeeCount' THEN "vC1SalaryPaymentBatches"."employeeCount" ELSE 0 END, CASE WHEN "vE1" ? 'totalAmount' THEN "vC1SalaryPaymentBatches"."totalAmount" ELSE 0 END, CASE WHEN "vE1" ? 'instructionRef' THEN "vC1SalaryPaymentBatches"."instructionRef" ELSE NULL END, CASE WHEN "vE1" ? 'valueDate' THEN "vC1SalaryPaymentBatches"."valueDate" ELSE NULL END, CASE WHEN "vE1" ? 'fileAttachmentId' THEN "vC1SalaryPaymentBatches"."fileAttachmentId" ELSE NULL END, CASE WHEN "vE1" ? 'adviceAttachmentId' THEN "vC1SalaryPaymentBatches"."adviceAttachmentId" ELSE NULL END, CASE WHEN "vE1" ? 'generatedAt' THEN "vC1SalaryPaymentBatches"."generatedAt" ELSE NULL END, CASE WHEN "vE1" ? 'sentAt' THEN "vC1SalaryPaymentBatches"."sentAt" ELSE NULL END, CASE WHEN "vE1" ? 'status' THEN "vC1SalaryPaymentBatches".status ELSE 'DRAFT' END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'adjustments' THEN
    -- adjustments: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."PayrollAdjustments"
     WHERE "tenantId" = "vTenant" AND "payrollRunId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'adjustments') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'adjustments') WITH ORDINALITY t(x, n) LOOP
      "vC1PayrollAdjustments" := jsonb_populate_record(NULL::"Payroll"."PayrollAdjustments", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Payroll"."PayrollAdjustments" t
           SET "employeeId" = CASE WHEN "vE1" ? 'employeeId' THEN "vC1PayrollAdjustments"."employeeId" ELSE t."employeeId" END,
               "componentId" = CASE WHEN "vE1" ? 'componentId' THEN "vC1PayrollAdjustments"."componentId" ELSE t."componentId" END,
               "inputSource" = CASE WHEN "vE1" ? 'inputSource' THEN "vC1PayrollAdjustments"."inputSource" ELSE t."inputSource" END,
               quantity = CASE WHEN "vE1" ? 'quantity' THEN "vC1PayrollAdjustments".quantity ELSE t.quantity END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1PayrollAdjustments".amount ELSE t.amount END,
               "isTaxable" = CASE WHEN "vE1" ? 'isTaxable' THEN "vC1PayrollAdjustments"."isTaxable" ELSE t."isTaxable" END,
               remarks = CASE WHEN "vE1" ? 'remarks' THEN "vC1PayrollAdjustments".remarks ELSE t.remarks END,
               "sourceDocType" = CASE WHEN "vE1" ? 'sourceDocType' THEN "vC1PayrollAdjustments"."sourceDocType" ELSE t."sourceDocType" END,
               "sourceDocId" = CASE WHEN "vE1" ? 'sourceDocId' THEN "vC1PayrollAdjustments"."sourceDocId" ELSE t."sourceDocId" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."payrollRunId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PayrollAdjustments: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."PayrollAdjustments" ("payrollRunId", "tenantId", "employeeId", "componentId", "inputSource", quantity, amount, "isTaxable", remarks, "sourceDocType", "sourceDocId")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'employeeId' THEN "vC1PayrollAdjustments"."employeeId" ELSE NULL END, CASE WHEN "vE1" ? 'componentId' THEN "vC1PayrollAdjustments"."componentId" ELSE NULL END, CASE WHEN "vE1" ? 'inputSource' THEN "vC1PayrollAdjustments"."inputSource" ELSE 'MANUAL' END, CASE WHEN "vE1" ? 'quantity' THEN "vC1PayrollAdjustments".quantity ELSE NULL END, CASE WHEN "vE1" ? 'amount' THEN "vC1PayrollAdjustments".amount ELSE NULL END, CASE WHEN "vE1" ? 'isTaxable' THEN "vC1PayrollAdjustments"."isTaxable" ELSE TRUE END, CASE WHEN "vE1" ? 'remarks' THEN "vC1PayrollAdjustments".remarks ELSE NULL END, CASE WHEN "vE1" ? 'sourceDocType' THEN "vC1PayrollAdjustments"."sourceDocType" ELSE NULL END, CASE WHEN "vE1" ? 'sourceDocId' THEN "vC1PayrollAdjustments"."sourceDocId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."PayrollRunLines"
     WHERE "tenantId" = "vTenant" AND "payrollRunId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1PayrollRunLines" := jsonb_populate_record(NULL::"Payroll"."PayrollRunLines", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Payroll"."PayrollRunLines" t
           SET "employeeId" = CASE WHEN "vE1" ? 'employeeId' THEN "vC1PayrollRunLines"."employeeId" ELSE t."employeeId" END,
               "employeeSalaryId" = CASE WHEN "vE1" ? 'employeeSalaryId' THEN "vC1PayrollRunLines"."employeeSalaryId" ELSE t."employeeSalaryId" END,
               "branchId" = CASE WHEN "vE1" ? 'branchId' THEN "vC1PayrollRunLines"."branchId" ELSE t."branchId" END,
               "departmentId" = CASE WHEN "vE1" ? 'departmentId' THEN "vC1PayrollRunLines"."departmentId" ELSE t."departmentId" END,
               "gradeId" = CASE WHEN "vE1" ? 'gradeId' THEN "vC1PayrollRunLines"."gradeId" ELSE t."gradeId" END,
               "costCentreId" = CASE WHEN "vE1" ? 'costCentreId' THEN "vC1PayrollRunLines"."costCentreId" ELSE t."costCentreId" END,
               "structureId" = CASE WHEN "vE1" ? 'structureId' THEN "vC1PayrollRunLines"."structureId" ELSE t."structureId" END,
               "daysInMonth" = CASE WHEN "vE1" ? 'daysInMonth' THEN "vC1PayrollRunLines"."daysInMonth" ELSE t."daysInMonth" END,
               "paidDays" = CASE WHEN "vE1" ? 'paidDays' THEN "vC1PayrollRunLines"."paidDays" ELSE t."paidDays" END,
               "lwpDays" = CASE WHEN "vE1" ? 'lwpDays' THEN "vC1PayrollRunLines"."lwpDays" ELSE t."lwpDays" END,
               "leaveTakenDays" = CASE WHEN "vE1" ? 'leaveTakenDays' THEN "vC1PayrollRunLines"."leaveTakenDays" ELSE t."leaveTakenDays" END,
               "overtimeHours" = CASE WHEN "vE1" ? 'overtimeHours' THEN "vC1PayrollRunLines"."overtimeHours" ELSE t."overtimeHours" END,
               "basicAmount" = CASE WHEN "vE1" ? 'basicAmount' THEN "vC1PayrollRunLines"."basicAmount" ELSE t."basicAmount" END,
               "allowanceAmount" = CASE WHEN "vE1" ? 'allowanceAmount' THEN "vC1PayrollRunLines"."allowanceAmount" ELSE t."allowanceAmount" END,
               "grossAmount" = CASE WHEN "vE1" ? 'grossAmount' THEN "vC1PayrollRunLines"."grossAmount" ELSE t."grossAmount" END,
               "taxAmount" = CASE WHEN "vE1" ? 'taxAmount' THEN "vC1PayrollRunLines"."taxAmount" ELSE t."taxAmount" END,
               "eobiAmount" = CASE WHEN "vE1" ? 'eobiAmount' THEN "vC1PayrollRunLines"."eobiAmount" ELSE t."eobiAmount" END,
               "pfAmount" = CASE WHEN "vE1" ? 'pfAmount' THEN "vC1PayrollRunLines"."pfAmount" ELSE t."pfAmount" END,
               "loanAmount" = CASE WHEN "vE1" ? 'loanAmount' THEN "vC1PayrollRunLines"."loanAmount" ELSE t."loanAmount" END,
               "otherDeductionAmount" = CASE WHEN "vE1" ? 'otherDeductionAmount' THEN "vC1PayrollRunLines"."otherDeductionAmount" ELSE t."otherDeductionAmount" END,
               "deductionAmount" = CASE WHEN "vE1" ? 'deductionAmount' THEN "vC1PayrollRunLines"."deductionAmount" ELSE t."deductionAmount" END,
               "netAmount" = CASE WHEN "vE1" ? 'netAmount' THEN "vC1PayrollRunLines"."netAmount" ELSE t."netAmount" END,
               "employerEobiAmount" = CASE WHEN "vE1" ? 'employerEobiAmount' THEN "vC1PayrollRunLines"."employerEobiAmount" ELSE t."employerEobiAmount" END,
               "employerPessiAmount" = CASE WHEN "vE1" ? 'employerPessiAmount' THEN "vC1PayrollRunLines"."employerPessiAmount" ELSE t."employerPessiAmount" END,
               "employerPfAmount" = CASE WHEN "vE1" ? 'employerPfAmount' THEN "vC1PayrollRunLines"."employerPfAmount" ELSE t."employerPfAmount" END,
               "gratuityProvisionAmount" = CASE WHEN "vE1" ? 'gratuityProvisionAmount' THEN "vC1PayrollRunLines"."gratuityProvisionAmount" ELSE t."gratuityProvisionAmount" END,
               "taxStatus" = CASE WHEN "vE1" ? 'taxStatus' THEN "vC1PayrollRunLines"."taxStatus" ELSE t."taxStatus" END,
               "projectedAnnualSalary" = CASE WHEN "vE1" ? 'projectedAnnualSalary' THEN "vC1PayrollRunLines"."projectedAnnualSalary" ELSE t."projectedAnnualSalary" END,
               "annualExemptAmount" = CASE WHEN "vE1" ? 'annualExemptAmount' THEN "vC1PayrollRunLines"."annualExemptAmount" ELSE t."annualExemptAmount" END,
               "annualTaxableIncome" = CASE WHEN "vE1" ? 'annualTaxableIncome' THEN "vC1PayrollRunLines"."annualTaxableIncome" ELSE t."annualTaxableIncome" END,
               "annualTaxLiability" = CASE WHEN "vE1" ? 'annualTaxLiability' THEN "vC1PayrollRunLines"."annualTaxLiability" ELSE t."annualTaxLiability" END,
               "taxSlabId" = CASE WHEN "vE1" ? 'taxSlabId' THEN "vC1PayrollRunLines"."taxSlabId" ELSE t."taxSlabId" END,
               "prevNetAmount" = CASE WHEN "vE1" ? 'prevNetAmount' THEN "vC1PayrollRunLines"."prevNetAmount" ELSE t."prevNetAmount" END,
               "variancePct" = CASE WHEN "vE1" ? 'variancePct' THEN "vC1PayrollRunLines"."variancePct" ELSE t."variancePct" END,
               "isNewJoiner" = CASE WHEN "vE1" ? 'isNewJoiner' THEN "vC1PayrollRunLines"."isNewJoiner" ELSE t."isNewJoiner" END,
               "isRevised" = CASE WHEN "vE1" ? 'isRevised' THEN "vC1PayrollRunLines"."isRevised" ELSE t."isRevised" END,
               flags = CASE WHEN "vE1" ? 'flags' THEN "vC1PayrollRunLines".flags ELSE t.flags END,
               "varianceExplanation" = CASE WHEN "vE1" ? 'varianceExplanation' THEN "vC1PayrollRunLines"."varianceExplanation" ELSE t."varianceExplanation" END,
               "payMode" = CASE WHEN "vE1" ? 'payMode' THEN "vC1PayrollRunLines"."payMode" ELSE t."payMode" END,
               "bankName" = CASE WHEN "vE1" ? 'bankName' THEN "vC1PayrollRunLines"."bankName" ELSE t."bankName" END,
               "ibanMasked" = CASE WHEN "vE1" ? 'ibanMasked' THEN "vC1PayrollRunLines"."ibanMasked" ELSE t."ibanMasked" END,
               "paymentBatchId" = CASE WHEN "vE1" ? 'paymentBatchId' THEN "vC1PayrollRunLines"."paymentBatchId" ELSE t."paymentBatchId" END,
               "paymentRef" = CASE WHEN "vE1" ? 'paymentRef' THEN "vC1PayrollRunLines"."paymentRef" ELSE t."paymentRef" END,
               "isOnHold" = CASE WHEN "vE1" ? 'isOnHold' THEN "vC1PayrollRunLines"."isOnHold" ELSE t."isOnHold" END,
               "holdReason" = CASE WHEN "vE1" ? 'holdReason' THEN "vC1PayrollRunLines"."holdReason" ELSE t."holdReason" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."payrollRunId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PayrollRunLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."PayrollRunLines" ("payrollRunId", "tenantId", "employeeId", "employeeSalaryId", "branchId", "departmentId", "gradeId", "costCentreId", "structureId", "daysInMonth", "paidDays", "lwpDays", "leaveTakenDays", "overtimeHours", "basicAmount", "allowanceAmount", "grossAmount", "taxAmount", "eobiAmount", "pfAmount", "loanAmount", "otherDeductionAmount", "deductionAmount", "netAmount", "employerEobiAmount", "employerPessiAmount", "employerPfAmount", "gratuityProvisionAmount", "taxStatus", "projectedAnnualSalary", "annualExemptAmount", "annualTaxableIncome", "annualTaxLiability", "taxSlabId", "prevNetAmount", "variancePct", "isNewJoiner", "isRevised", flags, "varianceExplanation", "payMode", "bankName", "ibanMasked", "paymentBatchId", "paymentRef", "isOnHold", "holdReason")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'employeeId' THEN "vC1PayrollRunLines"."employeeId" ELSE NULL END, CASE WHEN "vE1" ? 'employeeSalaryId' THEN "vC1PayrollRunLines"."employeeSalaryId" ELSE NULL END, CASE WHEN "vE1" ? 'branchId' THEN "vC1PayrollRunLines"."branchId" ELSE NULL END, CASE WHEN "vE1" ? 'departmentId' THEN "vC1PayrollRunLines"."departmentId" ELSE NULL END, CASE WHEN "vE1" ? 'gradeId' THEN "vC1PayrollRunLines"."gradeId" ELSE NULL END, CASE WHEN "vE1" ? 'costCentreId' THEN "vC1PayrollRunLines"."costCentreId" ELSE NULL END, CASE WHEN "vE1" ? 'structureId' THEN "vC1PayrollRunLines"."structureId" ELSE NULL END, CASE WHEN "vE1" ? 'daysInMonth' THEN "vC1PayrollRunLines"."daysInMonth" ELSE NULL END, CASE WHEN "vE1" ? 'paidDays' THEN "vC1PayrollRunLines"."paidDays" ELSE NULL END, CASE WHEN "vE1" ? 'lwpDays' THEN "vC1PayrollRunLines"."lwpDays" ELSE 0 END, CASE WHEN "vE1" ? 'leaveTakenDays' THEN "vC1PayrollRunLines"."leaveTakenDays" ELSE 0 END, CASE WHEN "vE1" ? 'overtimeHours' THEN "vC1PayrollRunLines"."overtimeHours" ELSE 0 END, CASE WHEN "vE1" ? 'basicAmount' THEN "vC1PayrollRunLines"."basicAmount" ELSE 0 END, CASE WHEN "vE1" ? 'allowanceAmount' THEN "vC1PayrollRunLines"."allowanceAmount" ELSE 0 END, CASE WHEN "vE1" ? 'grossAmount' THEN "vC1PayrollRunLines"."grossAmount" ELSE NULL END, CASE WHEN "vE1" ? 'taxAmount' THEN "vC1PayrollRunLines"."taxAmount" ELSE 0 END, CASE WHEN "vE1" ? 'eobiAmount' THEN "vC1PayrollRunLines"."eobiAmount" ELSE 0 END, CASE WHEN "vE1" ? 'pfAmount' THEN "vC1PayrollRunLines"."pfAmount" ELSE 0 END, CASE WHEN "vE1" ? 'loanAmount' THEN "vC1PayrollRunLines"."loanAmount" ELSE 0 END, CASE WHEN "vE1" ? 'otherDeductionAmount' THEN "vC1PayrollRunLines"."otherDeductionAmount" ELSE 0 END, CASE WHEN "vE1" ? 'deductionAmount' THEN "vC1PayrollRunLines"."deductionAmount" ELSE NULL END, CASE WHEN "vE1" ? 'netAmount' THEN "vC1PayrollRunLines"."netAmount" ELSE NULL END, CASE WHEN "vE1" ? 'employerEobiAmount' THEN "vC1PayrollRunLines"."employerEobiAmount" ELSE 0 END, CASE WHEN "vE1" ? 'employerPessiAmount' THEN "vC1PayrollRunLines"."employerPessiAmount" ELSE 0 END, CASE WHEN "vE1" ? 'employerPfAmount' THEN "vC1PayrollRunLines"."employerPfAmount" ELSE 0 END, CASE WHEN "vE1" ? 'gratuityProvisionAmount' THEN "vC1PayrollRunLines"."gratuityProvisionAmount" ELSE 0 END, CASE WHEN "vE1" ? 'taxStatus' THEN "vC1PayrollRunLines"."taxStatus" ELSE NULL END, CASE WHEN "vE1" ? 'projectedAnnualSalary' THEN "vC1PayrollRunLines"."projectedAnnualSalary" ELSE NULL END, CASE WHEN "vE1" ? 'annualExemptAmount' THEN "vC1PayrollRunLines"."annualExemptAmount" ELSE NULL END, CASE WHEN "vE1" ? 'annualTaxableIncome' THEN "vC1PayrollRunLines"."annualTaxableIncome" ELSE NULL END, CASE WHEN "vE1" ? 'annualTaxLiability' THEN "vC1PayrollRunLines"."annualTaxLiability" ELSE NULL END, CASE WHEN "vE1" ? 'taxSlabId' THEN "vC1PayrollRunLines"."taxSlabId" ELSE NULL END, CASE WHEN "vE1" ? 'prevNetAmount' THEN "vC1PayrollRunLines"."prevNetAmount" ELSE NULL END, CASE WHEN "vE1" ? 'variancePct' THEN "vC1PayrollRunLines"."variancePct" ELSE NULL END, CASE WHEN "vE1" ? 'isNewJoiner' THEN "vC1PayrollRunLines"."isNewJoiner" ELSE FALSE END, CASE WHEN "vE1" ? 'isRevised' THEN "vC1PayrollRunLines"."isRevised" ELSE FALSE END, CASE WHEN "vE1" ? 'flags' THEN "vC1PayrollRunLines".flags ELSE '{}' END, CASE WHEN "vE1" ? 'varianceExplanation' THEN "vC1PayrollRunLines"."varianceExplanation" ELSE NULL END, CASE WHEN "vE1" ? 'payMode' THEN "vC1PayrollRunLines"."payMode" ELSE 'BANK_TRANSFER' END, CASE WHEN "vE1" ? 'bankName' THEN "vC1PayrollRunLines"."bankName" ELSE NULL END, CASE WHEN "vE1" ? 'ibanMasked' THEN "vC1PayrollRunLines"."ibanMasked" ELSE NULL END, CASE WHEN "vE1" ? 'paymentBatchId' THEN "vC1PayrollRunLines"."paymentBatchId" ELSE NULL END, CASE WHEN "vE1" ? 'paymentRef' THEN "vC1PayrollRunLines"."paymentRef" ELSE NULL END, CASE WHEN "vE1" ? 'isOnHold' THEN "vC1PayrollRunLines"."isOnHold" ELSE FALSE END, CASE WHEN "vE1" ? 'holdReason' THEN "vC1PayrollRunLines"."holdReason" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

  IF "vE1" ? 'components' THEN
    -- components: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."PayrollRunLineComponents"
     WHERE "tenantId" = "vTenant" AND "payrollLineId" = "vCid1"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("vE1" -> 'components') x WHERE x ? 'id');
    FOR "vE2", "vO2" IN SELECT x, n FROM jsonb_array_elements("vE1" -> 'components') WITH ORDINALITY t(x, n) LOOP
      "vC2PayrollRunLineComponents" := jsonb_populate_record(NULL::"Payroll"."PayrollRunLineComponents", "vE2");
      IF "vE2" ? 'id' THEN
        UPDATE "Payroll"."PayrollRunLineComponents" t
           SET "componentId" = CASE WHEN "vE2" ? 'componentId' THEN "vC2PayrollRunLineComponents"."componentId" ELSE t."componentId" END,
               "componentType" = CASE WHEN "vE2" ? 'componentType' THEN "vC2PayrollRunLineComponents"."componentType" ELSE t."componentType" END,
               label = CASE WHEN "vE2" ? 'label' THEN "vC2PayrollRunLineComponents".label ELSE t.label END,
               "basisText" = CASE WHEN "vE2" ? 'basisText' THEN "vC2PayrollRunLineComponents"."basisText" ELSE t."basisText" END,
               quantity = CASE WHEN "vE2" ? 'quantity' THEN "vC2PayrollRunLineComponents".quantity ELSE t.quantity END,
               rate = CASE WHEN "vE2" ? 'rate' THEN "vC2PayrollRunLineComponents".rate ELSE t.rate END,
               amount = CASE WHEN "vE2" ? 'amount' THEN "vC2PayrollRunLineComponents".amount ELSE t.amount END,
               "isTaxable" = CASE WHEN "vE2" ? 'isTaxable' THEN "vC2PayrollRunLineComponents"."isTaxable" ELSE t."isTaxable" END,
               "exemptAmount" = CASE WHEN "vE2" ? 'exemptAmount' THEN "vC2PayrollRunLineComponents"."exemptAmount" ELSE t."exemptAmount" END,
               "loanId" = CASE WHEN "vE2" ? 'loanId' THEN "vC2PayrollRunLineComponents"."loanId" ELSE t."loanId" END,
               "payrollInputId" = CASE WHEN "vE2" ? 'payrollInputId' THEN "vC2PayrollRunLineComponents"."payrollInputId" ELSE t."payrollInputId" END,
               "showOnPayslip" = CASE WHEN "vE2" ? 'showOnPayslip' THEN "vC2PayrollRunLineComponents"."showOnPayslip" ELSE t."showOnPayslip" END,
               "sortOrder" = CASE WHEN "vE2" ? 'sortOrder' THEN "vC2PayrollRunLineComponents"."sortOrder" ELSE t."sortOrder" END
         WHERE t.id = ("vE2" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."payrollLineId" = "vCid1"
        RETURNING t.id INTO "vCid2";
        IF "vCid2" IS NULL THEN
          RAISE EXCEPTION 'PayrollRunLineComponents: row % does not belong to this record', "vE2" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."PayrollRunLineComponents" ("payrollLineId", "tenantId", "componentId", "componentType", label, "basisText", quantity, rate, amount, "isTaxable", "exemptAmount", "loanId", "payrollInputId", "showOnPayslip", "sortOrder")
        VALUES ("vCid1", "vTenant", CASE WHEN "vE2" ? 'componentId' THEN "vC2PayrollRunLineComponents"."componentId" ELSE NULL END, CASE WHEN "vE2" ? 'componentType' THEN "vC2PayrollRunLineComponents"."componentType" ELSE NULL END, CASE WHEN "vE2" ? 'label' THEN "vC2PayrollRunLineComponents".label ELSE NULL END, CASE WHEN "vE2" ? 'basisText' THEN "vC2PayrollRunLineComponents"."basisText" ELSE NULL END, CASE WHEN "vE2" ? 'quantity' THEN "vC2PayrollRunLineComponents".quantity ELSE NULL END, CASE WHEN "vE2" ? 'rate' THEN "vC2PayrollRunLineComponents".rate ELSE NULL END, CASE WHEN "vE2" ? 'amount' THEN "vC2PayrollRunLineComponents".amount ELSE NULL END, CASE WHEN "vE2" ? 'isTaxable' THEN "vC2PayrollRunLineComponents"."isTaxable" ELSE FALSE END, CASE WHEN "vE2" ? 'exemptAmount' THEN "vC2PayrollRunLineComponents"."exemptAmount" ELSE 0 END, CASE WHEN "vE2" ? 'loanId' THEN "vC2PayrollRunLineComponents"."loanId" ELSE NULL END, CASE WHEN "vE2" ? 'payrollInputId' THEN "vC2PayrollRunLineComponents"."payrollInputId" ELSE NULL END, CASE WHEN "vE2" ? 'showOnPayslip' THEN "vC2PayrollRunLineComponents"."showOnPayslip" ELSE TRUE END, CASE WHEN "vE2" ? 'sortOrder' THEN "vC2PayrollRunLineComponents"."sortOrder" ELSE 0 END)
        RETURNING id INTO "vCid2";
      END IF;

    END LOOP;
  END IF;
    END LOOP;
  END IF;

  IF "pData" ? 'branches' THEN
    -- branches: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."PayrollRunBranches"
     WHERE "tenantId" = "vTenant" AND "payrollRunId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'branches') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'branches') WITH ORDINALITY t(x, n) LOOP
      "vC1PayrollRunBranches" := jsonb_populate_record(NULL::"Payroll"."PayrollRunBranches", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Payroll"."PayrollRunBranches" t
           SET "branchId" = CASE WHEN "vE1" ? 'branchId' THEN "vC1PayrollRunBranches"."branchId" ELSE t."branchId" END,
               "employeeCount" = CASE WHEN "vE1" ? 'employeeCount' THEN "vC1PayrollRunBranches"."employeeCount" ELSE t."employeeCount" END,
               "isIncluded" = CASE WHEN "vE1" ? 'isIncluded' THEN "vC1PayrollRunBranches"."isIncluded" ELSE t."isIncluded" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."payrollRunId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PayrollRunBranches: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."PayrollRunBranches" ("payrollRunId", "tenantId", "branchId", "employeeCount", "isIncluded")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'branchId' THEN "vC1PayrollRunBranches"."branchId" ELSE NULL END, CASE WHEN "vE1" ? 'employeeCount' THEN "vC1PayrollRunBranches"."employeeCount" ELSE 0 END, CASE WHEN "vE1" ? 'isIncluded' THEN "vC1PayrollRunBranches"."isIncluded" ELSE TRUE END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;

  IF "pData" ? 'checklist' THEN
    -- checklist: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."PayrollRunChecklistItems"
     WHERE "tenantId" = "vTenant" AND "payrollRunId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'checklist') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'checklist') WITH ORDINALITY t(x, n) LOOP
      "vC1PayrollRunChecklistItems" := jsonb_populate_record(NULL::"Payroll"."PayrollRunChecklistItems", "vE1");
      IF "vE1" ? 'id' THEN
        UPDATE "Payroll"."PayrollRunChecklistItems" t
           SET "itemKey" = CASE WHEN "vE1" ? 'itemKey' THEN "vC1PayrollRunChecklistItems"."itemKey" ELSE t."itemKey" END,
               label = CASE WHEN "vE1" ? 'label' THEN "vC1PayrollRunChecklistItems".label ELSE t.label END,
               "sortOrder" = CASE WHEN "vE1" ? 'sortOrder' THEN "vC1PayrollRunChecklistItems"."sortOrder" ELSE t."sortOrder" END,
               "isDone" = CASE WHEN "vE1" ? 'isDone' THEN "vC1PayrollRunChecklistItems"."isDone" ELSE t."isDone" END,
               "doneByUserId" = CASE WHEN "vE1" ? 'doneByUserId' THEN "vC1PayrollRunChecklistItems"."doneByUserId" ELSE t."doneByUserId" END,
               "doneAt" = CASE WHEN "vE1" ? 'doneAt' THEN "vC1PayrollRunChecklistItems"."doneAt" ELSE t."doneAt" END
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."payrollRunId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'PayrollRunChecklistItems: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."PayrollRunChecklistItems" ("payrollRunId", "tenantId", "itemKey", label, "sortOrder", "isDone", "doneByUserId", "doneAt")
        VALUES ("vRet", "vTenant", CASE WHEN "vE1" ? 'itemKey' THEN "vC1PayrollRunChecklistItems"."itemKey" ELSE NULL END, CASE WHEN "vE1" ? 'label' THEN "vC1PayrollRunChecklistItems".label ELSE NULL END, CASE WHEN "vE1" ? 'sortOrder' THEN "vC1PayrollRunChecklistItems"."sortOrder" ELSE 0 END, CASE WHEN "vE1" ? 'isDone' THEN "vC1PayrollRunChecklistItems"."isDone" ELSE FALSE END, CASE WHEN "vE1" ? 'doneByUserId' THEN "vC1PayrollRunChecklistItems"."doneByUserId" ELSE NULL END, CASE WHEN "vE1" ? 'doneAt' THEN "vC1PayrollRunChecklistItems"."doneAt" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Payroll"."payrollRunAddUpdate"(jsonb) IS 'Save (insert or update) one PayrollRuns record with its paymentBatches, adjustments, lines, branches, checklist.';

-- PayrollRuns: one record as JSON (camelCase keys), with lookup labels and paymentBatches, adjustments, lines, branches, checklist
CREATE OR REPLACE FUNCTION "Payroll"."getPayrollRunInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('runTypeLabel', "Lookups"."getLookupLabel"('RunType', t."runType") ->> 'label', 'runTypeTone', "Lookups"."getLookupLabel"('RunType', t."runType") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('PayrollRunStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('PayrollRunStatus', t.status) ->> 'tone') ||
         jsonb_build_object('paymentBatches', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Payroll"."SalaryPaymentBatches" c1 WHERE c1."payrollRunId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'adjustments', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Payroll"."PayrollAdjustments" c1 WHERE c1."payrollRunId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) || jsonb_build_object('components', COALESCE((SELECT jsonb_agg(to_jsonb(c2) ORDER BY c2."sortOrder") FROM "Payroll"."PayrollRunLineComponents" c2 WHERE c2."payrollLineId" = c1.id AND c2."tenantId" = c1."tenantId"), '[]'::jsonb)) ORDER BY c1."createdAt") FROM "Payroll"."PayrollRunLines" c1 WHERE c1."payrollRunId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'branches', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."createdAt") FROM "Payroll"."PayrollRunBranches" c1 WHERE c1."payrollRunId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb), 'checklist', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."sortOrder") FROM "Payroll"."PayrollRunChecklistItems" c1 WHERE c1."payrollRunId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Payroll"."PayrollRuns" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Payroll"."getPayrollRunInfo"(uuid) IS 'Read one PayrollRuns record (getter for its screens).';

-- PayrollRuns: Approve (status -> APPROVED); allowed from DRAFT
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Payroll"."PayrollRuns";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."PayrollRuns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PayrollRuns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'PayrollRuns %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'PayrollRuns: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Payroll"."payrollRunApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Payroll"."payrollRunApproveEntries"') USING "pId";
  END IF;
  UPDATE "Payroll"."PayrollRuns" t SET status = 'APPROVED', "approvedAt" = now(), "approvedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- PayrollRuns: Post (status -> POSTED); allowed from DRAFT, APPROVED
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunPost"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Payroll"."PayrollRuns";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."PayrollRuns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PayrollRuns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'POSTED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'APPROVED') THEN
    RAISE EXCEPTION 'PayrollRuns %: cannot post from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Payroll"."payrollRunPostEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Payroll"."payrollRunPostEntries"') USING "pId";
  END IF;
  UPDATE "Payroll"."PayrollRuns" t SET status = 'POSTED', "postedAt" = now(), "postedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- PayrollRuns: Cancel (status -> CANCELLED); allowed from DRAFT, REVIEW, AWAITING_APPROVAL, APPROVED, POSTED, PAID, REJECTED
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Payroll"."PayrollRuns";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."PayrollRuns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PayrollRuns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'REVIEW', 'AWAITING_APPROVAL', 'APPROVED', 'POSTED', 'PAID', 'REJECTED') THEN
    RAISE EXCEPTION 'PayrollRuns %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Payroll"."payrollRunCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Payroll"."payrollRunCancelEntries"') USING "pId";
  END IF;
  UPDATE "Payroll"."PayrollRuns" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- PayrollRuns: Reverse (status -> REVERSED); allowed from POSTED
CREATE OR REPLACE FUNCTION "Payroll"."payrollRunReverse"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Payroll"."PayrollRuns";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."PayrollRuns" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PayrollRuns % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'REVERSED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('POSTED') THEN
    RAISE EXCEPTION 'PayrollRuns %: cannot reverse from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Payroll"."payrollRunReverseEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Payroll"."payrollRunReverseEntries"') USING "pId";
  END IF;
  UPDATE "Payroll"."PayrollRuns" t SET status = 'REVERSED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- Payslips: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Payroll"."payslipAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Payroll"."Payslips";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Payroll"."Payslips", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('PS', current_date, NULL);
    END IF;
    INSERT INTO "Payroll"."Payslips" ("tenantId", "docNo", "payrollRunId", "payrollLineId", "employeeId", "payrollMonth", "grossAmount", "deductionAmount", "netAmount", "netAmountWords", "generatedAt", "publishedToEssAt", "emailTo", "emailedAt", "emailCount", "bounceReason", "printedAt", "holdReason", "isPasswordProtected", "pdfAttachmentId", "shareToken", "shareExpiresAt")
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'payrollRunId' THEN "vRec"."payrollRunId" ELSE NULL END, CASE WHEN "pData" ? 'payrollLineId' THEN "vRec"."payrollLineId" ELSE NULL END, CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'payrollMonth' THEN "vRec"."payrollMonth" ELSE NULL END, CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE NULL END, CASE WHEN "pData" ? 'deductionAmount' THEN "vRec"."deductionAmount" ELSE NULL END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE NULL END, CASE WHEN "pData" ? 'netAmountWords' THEN "vRec"."netAmountWords" ELSE NULL END, CASE WHEN "pData" ? 'generatedAt' THEN "vRec"."generatedAt" ELSE now() END, CASE WHEN "pData" ? 'publishedToEssAt' THEN "vRec"."publishedToEssAt" ELSE NULL END, CASE WHEN "pData" ? 'emailTo' THEN "vRec"."emailTo" ELSE NULL END, CASE WHEN "pData" ? 'emailedAt' THEN "vRec"."emailedAt" ELSE NULL END, CASE WHEN "pData" ? 'emailCount' THEN "vRec"."emailCount" ELSE 0 END, CASE WHEN "pData" ? 'bounceReason' THEN "vRec"."bounceReason" ELSE NULL END, CASE WHEN "pData" ? 'printedAt' THEN "vRec"."printedAt" ELSE NULL END, CASE WHEN "pData" ? 'holdReason' THEN "vRec"."holdReason" ELSE NULL END, CASE WHEN "pData" ? 'isPasswordProtected' THEN "vRec"."isPasswordProtected" ELSE TRUE END, CASE WHEN "pData" ? 'pdfAttachmentId' THEN "vRec"."pdfAttachmentId" ELSE NULL END, CASE WHEN "pData" ? 'shareToken' THEN "vRec"."shareToken" ELSE NULL END, CASE WHEN "pData" ? 'shareExpiresAt' THEN "vRec"."shareExpiresAt" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Payroll"."Payslips" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "payrollRunId" = CASE WHEN "pData" ? 'payrollRunId' THEN "vRec"."payrollRunId" ELSE t."payrollRunId" END,
           "payrollLineId" = CASE WHEN "pData" ? 'payrollLineId' THEN "vRec"."payrollLineId" ELSE t."payrollLineId" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "payrollMonth" = CASE WHEN "pData" ? 'payrollMonth' THEN "vRec"."payrollMonth" ELSE t."payrollMonth" END,
           "grossAmount" = CASE WHEN "pData" ? 'grossAmount' THEN "vRec"."grossAmount" ELSE t."grossAmount" END,
           "deductionAmount" = CASE WHEN "pData" ? 'deductionAmount' THEN "vRec"."deductionAmount" ELSE t."deductionAmount" END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "netAmountWords" = CASE WHEN "pData" ? 'netAmountWords' THEN "vRec"."netAmountWords" ELSE t."netAmountWords" END,
           "generatedAt" = CASE WHEN "pData" ? 'generatedAt' THEN "vRec"."generatedAt" ELSE t."generatedAt" END,
           "publishedToEssAt" = CASE WHEN "pData" ? 'publishedToEssAt' THEN "vRec"."publishedToEssAt" ELSE t."publishedToEssAt" END,
           "emailTo" = CASE WHEN "pData" ? 'emailTo' THEN "vRec"."emailTo" ELSE t."emailTo" END,
           "emailedAt" = CASE WHEN "pData" ? 'emailedAt' THEN "vRec"."emailedAt" ELSE t."emailedAt" END,
           "emailCount" = CASE WHEN "pData" ? 'emailCount' THEN "vRec"."emailCount" ELSE t."emailCount" END,
           "bounceReason" = CASE WHEN "pData" ? 'bounceReason' THEN "vRec"."bounceReason" ELSE t."bounceReason" END,
           "printedAt" = CASE WHEN "pData" ? 'printedAt' THEN "vRec"."printedAt" ELSE t."printedAt" END,
           "holdReason" = CASE WHEN "pData" ? 'holdReason' THEN "vRec"."holdReason" ELSE t."holdReason" END,
           "isPasswordProtected" = CASE WHEN "pData" ? 'isPasswordProtected' THEN "vRec"."isPasswordProtected" ELSE t."isPasswordProtected" END,
           "pdfAttachmentId" = CASE WHEN "pData" ? 'pdfAttachmentId' THEN "vRec"."pdfAttachmentId" ELSE t."pdfAttachmentId" END,
           "shareToken" = CASE WHEN "pData" ? 'shareToken' THEN "vRec"."shareToken" ELSE t."shareToken" END,
           "shareExpiresAt" = CASE WHEN "pData" ? 'shareExpiresAt' THEN "vRec"."shareExpiresAt" ELSE t."shareExpiresAt" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Payroll"."Payslips" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'Payslips %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'Payslips % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Payroll"."payslipAddUpdate"(jsonb) IS 'Save (insert or update) one Payslips record.';

-- Payslips: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Payroll"."getPayslipInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t) - 'isPasswordProtected') ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('PayslipStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('PayslipStatus', t.status) ->> 'tone')
    FROM "Payroll"."Payslips" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Payroll"."getPayslipInfo"(uuid) IS 'Read one Payslips record (getter for its screens).';

-- FinalSettlements: insert (no "id") or update (with "id"); child arrays: lines
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Payroll"."FinalSettlements";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
  "vC1FinalSettlementLines" "Payroll"."FinalSettlementLines";
  "vE1" jsonb;  "vO1" bigint;  "vCid1" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Payroll"."FinalSettlements", "pData");
  IF "vId" IS NULL THEN
    IF NOT ("pData" ? 'docNo') OR "vRec"."docNo" IS NULL THEN
      "vRec"."docNo" := "Company"."getNextDocNo"('FS', "vRec"."docDate", NULL);
    END IF;
    INSERT INTO "Payroll"."FinalSettlements" ("tenantId", "docNo", "docDate", "employeeId", "offboardingId", "payrollRunId", "serviceMonths", "noticeShortfallDays", "lastBasicAmount", "lastGrossAmount", "perDayGrossAmount", "perDayBasicAmount", "earningsAmount", "deductionAmount", "netAmount", "netAmountWords", "pfTrustBalanceAmount", "employeeBankId", "payFromBankAccountId", "paymentJournalEntryId", "preparedByUserId", "preparedAt", "approvalRequestId", "paidAt", remarks)
    VALUES ("vTenant", "vRec"."docNo", CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE CURRENT_DATE END, CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'offboardingId' THEN "vRec"."offboardingId" ELSE NULL END, CASE WHEN "pData" ? 'payrollRunId' THEN "vRec"."payrollRunId" ELSE NULL END, CASE WHEN "pData" ? 'serviceMonths' THEN "vRec"."serviceMonths" ELSE NULL END, CASE WHEN "pData" ? 'noticeShortfallDays' THEN "vRec"."noticeShortfallDays" ELSE 0 END, CASE WHEN "pData" ? 'lastBasicAmount' THEN "vRec"."lastBasicAmount" ELSE NULL END, CASE WHEN "pData" ? 'lastGrossAmount' THEN "vRec"."lastGrossAmount" ELSE NULL END, CASE WHEN "pData" ? 'perDayGrossAmount' THEN "vRec"."perDayGrossAmount" ELSE NULL END, CASE WHEN "pData" ? 'perDayBasicAmount' THEN "vRec"."perDayBasicAmount" ELSE NULL END, CASE WHEN "pData" ? 'earningsAmount' THEN "vRec"."earningsAmount" ELSE 0 END, CASE WHEN "pData" ? 'deductionAmount' THEN "vRec"."deductionAmount" ELSE 0 END, CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE 0 END, CASE WHEN "pData" ? 'netAmountWords' THEN "vRec"."netAmountWords" ELSE NULL END, CASE WHEN "pData" ? 'pfTrustBalanceAmount' THEN "vRec"."pfTrustBalanceAmount" ELSE NULL END, CASE WHEN "pData" ? 'employeeBankId' THEN "vRec"."employeeBankId" ELSE NULL END, CASE WHEN "pData" ? 'payFromBankAccountId' THEN "vRec"."payFromBankAccountId" ELSE NULL END, CASE WHEN "pData" ? 'paymentJournalEntryId' THEN "vRec"."paymentJournalEntryId" ELSE NULL END, CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'preparedAt' THEN "vRec"."preparedAt" ELSE NULL END, CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE NULL END, CASE WHEN "pData" ? 'paidAt' THEN "vRec"."paidAt" ELSE NULL END, CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    SELECT t.status INTO "vStatus" FROM "Payroll"."FinalSettlements" t WHERE t.id = "vId" AND t."tenantId" = "vTenant";
    IF "vStatus" IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'FinalSettlements: only DRAFT records can be edited (current status %)', "vStatus"
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    UPDATE "Payroll"."FinalSettlements" t
       SET "docNo" = CASE WHEN "pData" ? 'docNo' THEN "vRec"."docNo" ELSE t."docNo" END,
           "docDate" = CASE WHEN "pData" ? 'docDate' THEN "vRec"."docDate" ELSE t."docDate" END,
           "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "offboardingId" = CASE WHEN "pData" ? 'offboardingId' THEN "vRec"."offboardingId" ELSE t."offboardingId" END,
           "payrollRunId" = CASE WHEN "pData" ? 'payrollRunId' THEN "vRec"."payrollRunId" ELSE t."payrollRunId" END,
           "serviceMonths" = CASE WHEN "pData" ? 'serviceMonths' THEN "vRec"."serviceMonths" ELSE t."serviceMonths" END,
           "noticeShortfallDays" = CASE WHEN "pData" ? 'noticeShortfallDays' THEN "vRec"."noticeShortfallDays" ELSE t."noticeShortfallDays" END,
           "lastBasicAmount" = CASE WHEN "pData" ? 'lastBasicAmount' THEN "vRec"."lastBasicAmount" ELSE t."lastBasicAmount" END,
           "lastGrossAmount" = CASE WHEN "pData" ? 'lastGrossAmount' THEN "vRec"."lastGrossAmount" ELSE t."lastGrossAmount" END,
           "perDayGrossAmount" = CASE WHEN "pData" ? 'perDayGrossAmount' THEN "vRec"."perDayGrossAmount" ELSE t."perDayGrossAmount" END,
           "perDayBasicAmount" = CASE WHEN "pData" ? 'perDayBasicAmount' THEN "vRec"."perDayBasicAmount" ELSE t."perDayBasicAmount" END,
           "earningsAmount" = CASE WHEN "pData" ? 'earningsAmount' THEN "vRec"."earningsAmount" ELSE t."earningsAmount" END,
           "deductionAmount" = CASE WHEN "pData" ? 'deductionAmount' THEN "vRec"."deductionAmount" ELSE t."deductionAmount" END,
           "netAmount" = CASE WHEN "pData" ? 'netAmount' THEN "vRec"."netAmount" ELSE t."netAmount" END,
           "netAmountWords" = CASE WHEN "pData" ? 'netAmountWords' THEN "vRec"."netAmountWords" ELSE t."netAmountWords" END,
           "pfTrustBalanceAmount" = CASE WHEN "pData" ? 'pfTrustBalanceAmount' THEN "vRec"."pfTrustBalanceAmount" ELSE t."pfTrustBalanceAmount" END,
           "employeeBankId" = CASE WHEN "pData" ? 'employeeBankId' THEN "vRec"."employeeBankId" ELSE t."employeeBankId" END,
           "payFromBankAccountId" = CASE WHEN "pData" ? 'payFromBankAccountId' THEN "vRec"."payFromBankAccountId" ELSE t."payFromBankAccountId" END,
           "paymentJournalEntryId" = CASE WHEN "pData" ? 'paymentJournalEntryId' THEN "vRec"."paymentJournalEntryId" ELSE t."paymentJournalEntryId" END,
           "preparedByUserId" = CASE WHEN "pData" ? 'preparedByUserId' THEN "vRec"."preparedByUserId" ELSE t."preparedByUserId" END,
           "preparedAt" = CASE WHEN "pData" ? 'preparedAt' THEN "vRec"."preparedAt" ELSE t."preparedAt" END,
           "approvalRequestId" = CASE WHEN "pData" ? 'approvalRequestId' THEN "vRec"."approvalRequestId" ELSE t."approvalRequestId" END,
           "paidAt" = CASE WHEN "pData" ? 'paidAt' THEN "vRec"."paidAt" ELSE t."paidAt" END,
           remarks = CASE WHEN "pData" ? 'remarks' THEN "vRec".remarks ELSE t.remarks END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Payroll"."FinalSettlements" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'FinalSettlements %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'FinalSettlements % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF "pData" ? 'lines' THEN
    -- lines: rows missing from the array are removed, rows with "id" are updated, others inserted
    DELETE FROM "Payroll"."FinalSettlementLines"
     WHERE "tenantId" = "vTenant" AND "settlementId" = "vRet"
       AND id NOT IN (SELECT (x ->> 'id')::uuid FROM jsonb_array_elements("pData" -> 'lines') x WHERE x ? 'id');
    FOR "vE1", "vO1" IN SELECT x, n FROM jsonb_array_elements("pData" -> 'lines') WITH ORDINALITY t(x, n) LOOP
      "vC1FinalSettlementLines" := jsonb_populate_record(NULL::"Payroll"."FinalSettlementLines", "vE1");
      IF NOT ("vE1" ? 'lineNo') THEN "vC1FinalSettlementLines"."lineNo" := "vO1"; END IF;
      IF "vE1" ? 'id' THEN
        UPDATE "Payroll"."FinalSettlementLines" t
           SET "componentKind" = CASE WHEN "vE1" ? 'componentKind' THEN "vC1FinalSettlementLines"."componentKind" ELSE t."componentKind" END,
               direction = CASE WHEN "vE1" ? 'direction' THEN "vC1FinalSettlementLines".direction ELSE t.direction END,
               label = CASE WHEN "vE1" ? 'label' THEN "vC1FinalSettlementLines".label ELSE t.label END,
               "basisText" = CASE WHEN "vE1" ? 'basisText' THEN "vC1FinalSettlementLines"."basisText" ELSE t."basisText" END,
               quantity = CASE WHEN "vE1" ? 'quantity' THEN "vC1FinalSettlementLines".quantity ELSE t.quantity END,
               rate = CASE WHEN "vE1" ? 'rate' THEN "vC1FinalSettlementLines".rate ELSE t.rate END,
               amount = CASE WHEN "vE1" ? 'amount' THEN "vC1FinalSettlementLines".amount ELSE t.amount END,
               "taxableAmount" = CASE WHEN "vE1" ? 'taxableAmount' THEN "vC1FinalSettlementLines"."taxableAmount" ELSE t."taxableAmount" END,
               "componentId" = CASE WHEN "vE1" ? 'componentId' THEN "vC1FinalSettlementLines"."componentId" ELSE t."componentId" END,
               "loanId" = CASE WHEN "vE1" ? 'loanId' THEN "vC1FinalSettlementLines"."loanId" ELSE t."loanId" END,
               "accountId" = CASE WHEN "vE1" ? 'accountId' THEN "vC1FinalSettlementLines"."accountId" ELSE t."accountId" END,
               "lineNo" = "vC1FinalSettlementLines"."lineNo"
         WHERE t.id = ("vE1" ->> 'id')::uuid AND t."tenantId" = "vTenant" AND t."settlementId" = "vRet"
        RETURNING t.id INTO "vCid1";
        IF "vCid1" IS NULL THEN
          RAISE EXCEPTION 'FinalSettlementLines: row % does not belong to this record', "vE1" ->> 'id' USING ERRCODE = 'no_data_found';
        END IF;
      ELSE
        INSERT INTO "Payroll"."FinalSettlementLines" ("settlementId", "tenantId", "lineNo", "componentKind", direction, label, "basisText", quantity, rate, amount, "taxableAmount", "componentId", "loanId", "accountId")
        VALUES ("vRet", "vTenant", "vC1FinalSettlementLines"."lineNo", CASE WHEN "vE1" ? 'componentKind' THEN "vC1FinalSettlementLines"."componentKind" ELSE NULL END, CASE WHEN "vE1" ? 'direction' THEN "vC1FinalSettlementLines".direction ELSE NULL END, CASE WHEN "vE1" ? 'label' THEN "vC1FinalSettlementLines".label ELSE NULL END, CASE WHEN "vE1" ? 'basisText' THEN "vC1FinalSettlementLines"."basisText" ELSE NULL END, CASE WHEN "vE1" ? 'quantity' THEN "vC1FinalSettlementLines".quantity ELSE NULL END, CASE WHEN "vE1" ? 'rate' THEN "vC1FinalSettlementLines".rate ELSE NULL END, CASE WHEN "vE1" ? 'amount' THEN "vC1FinalSettlementLines".amount ELSE NULL END, CASE WHEN "vE1" ? 'taxableAmount' THEN "vC1FinalSettlementLines"."taxableAmount" ELSE NULL END, CASE WHEN "vE1" ? 'componentId' THEN "vC1FinalSettlementLines"."componentId" ELSE NULL END, CASE WHEN "vE1" ? 'loanId' THEN "vC1FinalSettlementLines"."loanId" ELSE NULL END, CASE WHEN "vE1" ? 'accountId' THEN "vC1FinalSettlementLines"."accountId" ELSE NULL END)
        RETURNING id INTO "vCid1";
      END IF;

    END LOOP;
  END IF;
  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Payroll"."finalSettlementAddUpdate"(jsonb) IS 'Save (insert or update) one FinalSettlements record with its lines.';

-- FinalSettlements: one record as JSON (camelCase keys), with lookup labels and lines
CREATE OR REPLACE FUNCTION "Payroll"."getFinalSettlementInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('statusLabel', "Lookups"."getLookupLabel"('FinalSettlementStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('FinalSettlementStatus', t.status) ->> 'tone') ||
         jsonb_build_object('lines', COALESCE((SELECT jsonb_agg(to_jsonb(c1) ORDER BY c1."lineNo") FROM "Payroll"."FinalSettlementLines" c1 WHERE c1."settlementId" = t.id AND c1."tenantId" = t."tenantId"), '[]'::jsonb))
    FROM "Payroll"."FinalSettlements" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Payroll"."getFinalSettlementInfo"(uuid) IS 'Read one FinalSettlements record (getter for its screens).';

-- FinalSettlements: Approve (status -> APPROVED); allowed from DRAFT, PENDING_APPROVAL
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Payroll"."FinalSettlements";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."FinalSettlements" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FinalSettlements % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'FinalSettlements %: cannot approve from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'FinalSettlements: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Payroll"."finalSettlementApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Payroll"."finalSettlementApproveEntries"') USING "pId";
  END IF;
  UPDATE "Payroll"."FinalSettlements" t SET status = 'APPROVED', "approvedAt" = now(), "approvedByUserId" = "Company"."getCurrentUserId"() WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- FinalSettlements: Cancel (status -> CANCELLED); allowed from DRAFT, PENDING_APPROVAL, APPROVED, PAID
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementCancel"("pId" uuid, "pReason" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Payroll"."FinalSettlements";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."FinalSettlements" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FinalSettlements % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'CANCELLED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID') THEN
    RAISE EXCEPTION 'FinalSettlements %: cannot cancel from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Payroll"."finalSettlementCancelEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Payroll"."finalSettlementCancelEntries"') USING "pId";
  END IF;
  UPDATE "Payroll"."FinalSettlements" t SET status = 'CANCELLED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- FinalSettlements: Pay (status -> PAID); allowed from APPROVED
CREATE OR REPLACE FUNCTION "Payroll"."finalSettlementPay"("pId" uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Payroll"."FinalSettlements";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."FinalSettlements" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FinalSettlements % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'PAID' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('APPROVED') THEN
    RAISE EXCEPTION 'FinalSettlements %: cannot pay from status %', "vRow"."docNo", "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Payroll"."finalSettlementPayEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Payroll"."finalSettlementPayEntries"') USING "pId";
  END IF;
  UPDATE "Payroll"."FinalSettlements" t SET status = 'PAID' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- TaxDeclarations: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Payroll"."taxDeclarationAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Payroll"."TaxDeclarations";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
  "vStatus" text;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Payroll"."TaxDeclarations", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Payroll"."TaxDeclarations" ("tenantId", "employeeId", "taxYear", "declarationType", "itoSection", "reliefKind", amount, "paidTo", "proofAttachmentId", "proofDueDate", "estimatedTaxSaving", "verifiedByUserId", "verifiedAt", "rejectionReason", "effectiveFromMonth")
    VALUES ("vTenant", CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE NULL END, CASE WHEN "pData" ? 'taxYear' THEN "vRec"."taxYear" ELSE NULL END, CASE WHEN "pData" ? 'declarationType' THEN "vRec"."declarationType" ELSE NULL END, CASE WHEN "pData" ? 'itoSection' THEN "vRec"."itoSection" ELSE NULL END, CASE WHEN "pData" ? 'reliefKind' THEN "vRec"."reliefKind" ELSE NULL END, CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE NULL END, CASE WHEN "pData" ? 'paidTo' THEN "vRec"."paidTo" ELSE NULL END, CASE WHEN "pData" ? 'proofAttachmentId' THEN "vRec"."proofAttachmentId" ELSE NULL END, CASE WHEN "pData" ? 'proofDueDate' THEN "vRec"."proofDueDate" ELSE NULL END, CASE WHEN "pData" ? 'estimatedTaxSaving' THEN "vRec"."estimatedTaxSaving" ELSE NULL END, CASE WHEN "pData" ? 'verifiedByUserId' THEN "vRec"."verifiedByUserId" ELSE NULL END, CASE WHEN "pData" ? 'verifiedAt' THEN "vRec"."verifiedAt" ELSE NULL END, CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE NULL END, CASE WHEN "pData" ? 'effectiveFromMonth' THEN "vRec"."effectiveFromMonth" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Payroll"."TaxDeclarations" t
       SET "employeeId" = CASE WHEN "pData" ? 'employeeId' THEN "vRec"."employeeId" ELSE t."employeeId" END,
           "taxYear" = CASE WHEN "pData" ? 'taxYear' THEN "vRec"."taxYear" ELSE t."taxYear" END,
           "declarationType" = CASE WHEN "pData" ? 'declarationType' THEN "vRec"."declarationType" ELSE t."declarationType" END,
           "itoSection" = CASE WHEN "pData" ? 'itoSection' THEN "vRec"."itoSection" ELSE t."itoSection" END,
           "reliefKind" = CASE WHEN "pData" ? 'reliefKind' THEN "vRec"."reliefKind" ELSE t."reliefKind" END,
           amount = CASE WHEN "pData" ? 'amount' THEN "vRec".amount ELSE t.amount END,
           "paidTo" = CASE WHEN "pData" ? 'paidTo' THEN "vRec"."paidTo" ELSE t."paidTo" END,
           "proofAttachmentId" = CASE WHEN "pData" ? 'proofAttachmentId' THEN "vRec"."proofAttachmentId" ELSE t."proofAttachmentId" END,
           "proofDueDate" = CASE WHEN "pData" ? 'proofDueDate' THEN "vRec"."proofDueDate" ELSE t."proofDueDate" END,
           "estimatedTaxSaving" = CASE WHEN "pData" ? 'estimatedTaxSaving' THEN "vRec"."estimatedTaxSaving" ELSE t."estimatedTaxSaving" END,
           "verifiedByUserId" = CASE WHEN "pData" ? 'verifiedByUserId' THEN "vRec"."verifiedByUserId" ELSE t."verifiedByUserId" END,
           "verifiedAt" = CASE WHEN "pData" ? 'verifiedAt' THEN "vRec"."verifiedAt" ELSE t."verifiedAt" END,
           "rejectionReason" = CASE WHEN "pData" ? 'rejectionReason' THEN "vRec"."rejectionReason" ELSE t."rejectionReason" END,
           "effectiveFromMonth" = CASE WHEN "pData" ? 'effectiveFromMonth' THEN "vRec"."effectiveFromMonth" ELSE t."effectiveFromMonth" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Payroll"."TaxDeclarations" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'TaxDeclarations %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'TaxDeclarations % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Payroll"."taxDeclarationAddUpdate"(jsonb) IS 'Save (insert or update) one TaxDeclarations record.';

-- TaxDeclarations: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Payroll"."getTaxDeclarationInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t)) ||
         jsonb_build_object('declarationTypeLabel', "Lookups"."getLookupLabel"('DeclarationType', t."declarationType") ->> 'label', 'declarationTypeTone', "Lookups"."getLookupLabel"('DeclarationType', t."declarationType") ->> 'tone', 'itoSectionLabel', "Lookups"."getLookupLabel"('ItoSection', t."itoSection") ->> 'label', 'itoSectionTone', "Lookups"."getLookupLabel"('ItoSection', t."itoSection") ->> 'tone', 'reliefKindLabel', "Lookups"."getLookupLabel"('ReliefKind', t."reliefKind") ->> 'label', 'reliefKindTone', "Lookups"."getLookupLabel"('ReliefKind', t."reliefKind") ->> 'tone', 'statusLabel', "Lookups"."getLookupLabel"('TaxDeclarationStatus', t.status) ->> 'label', 'statusTone', "Lookups"."getLookupLabel"('TaxDeclarationStatus', t.status) ->> 'tone')
    FROM "Payroll"."TaxDeclarations" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Payroll"."getTaxDeclarationInfo"(uuid) IS 'Read one TaxDeclarations record (getter for its screens).';

-- TaxDeclarations: Approve (status -> APPROVED); allowed from PENDING, IN_REVIEW
CREATE OR REPLACE FUNCTION "Payroll"."taxDeclarationApprove"("pId" uuid, "pComment" text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vRow" "Payroll"."TaxDeclarations";
BEGIN
  SELECT * INTO "vRow" FROM "Payroll"."TaxDeclarations" t WHERE t.id = "pId" AND t."tenantId" = "Company"."getCurrentTenantId"() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TaxDeclarations % not found', "pId" USING ERRCODE = 'no_data_found';
  END IF;
  IF "vRow".status = 'APPROVED' THEN
    RETURN "pId";                                   -- idempotent: already done
  END IF;
  IF "vRow".status NOT IN ('PENDING', 'IN_REVIEW') THEN
    RAISE EXCEPTION 'TaxDeclarations %: cannot approve from status %', "vRow".id, "vRow".status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF "vRow"."createdBy" = "Company"."getCurrentUserId"() THEN
    RAISE EXCEPTION 'TaxDeclarations: the preparer cannot approve their own record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- module posting logic (journal entries, stock movements, …) when the module provides it
  IF to_regprocedure('"Payroll"."taxDeclarationApproveEntries"(uuid)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1)', '"Payroll"."taxDeclarationApproveEntries"') USING "pId";
  END IF;
  UPDATE "Payroll"."TaxDeclarations" t SET status = 'APPROVED' WHERE t.id = "pId";
  RETURN "pId";
END $$;

-- SalaryTaxSlabs: insert (no "id") or update (with "id"); child arrays: none
CREATE OR REPLACE FUNCTION "Payroll"."salaryTaxSlabAddUpdate"("pData" jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vRec" "Payroll"."SalaryTaxSlabs";
  "vId" uuid := NULLIF("pData" ->> 'id', '')::uuid;
  "vRet" uuid;
BEGIN
  "vRec" := jsonb_populate_record(NULL::"Payroll"."SalaryTaxSlabs", "pData");
  IF "vId" IS NULL THEN
    INSERT INTO "Payroll"."SalaryTaxSlabs" ("tenantId", "taxYear", "slabNo", "incomeFrom", "incomeTo", "fixedTax", "ratePercent", "sourceMasterId")
    VALUES ("vTenant", CASE WHEN "pData" ? 'taxYear' THEN "vRec"."taxYear" ELSE NULL END, CASE WHEN "pData" ? 'slabNo' THEN "vRec"."slabNo" ELSE NULL END, CASE WHEN "pData" ? 'incomeFrom' THEN "vRec"."incomeFrom" ELSE NULL END, CASE WHEN "pData" ? 'incomeTo' THEN "vRec"."incomeTo" ELSE NULL END, CASE WHEN "pData" ? 'fixedTax' THEN "vRec"."fixedTax" ELSE 0 END, CASE WHEN "pData" ? 'ratePercent' THEN "vRec"."ratePercent" ELSE NULL END, CASE WHEN "pData" ? 'sourceMasterId' THEN "vRec"."sourceMasterId" ELSE NULL END)
    RETURNING id INTO "vRet";
  ELSE
    UPDATE "Payroll"."SalaryTaxSlabs" t
       SET "taxYear" = CASE WHEN "pData" ? 'taxYear' THEN "vRec"."taxYear" ELSE t."taxYear" END,
           "slabNo" = CASE WHEN "pData" ? 'slabNo' THEN "vRec"."slabNo" ELSE t."slabNo" END,
           "incomeFrom" = CASE WHEN "pData" ? 'incomeFrom' THEN "vRec"."incomeFrom" ELSE t."incomeFrom" END,
           "incomeTo" = CASE WHEN "pData" ? 'incomeTo' THEN "vRec"."incomeTo" ELSE t."incomeTo" END,
           "fixedTax" = CASE WHEN "pData" ? 'fixedTax' THEN "vRec"."fixedTax" ELSE t."fixedTax" END,
           "ratePercent" = CASE WHEN "pData" ? 'ratePercent' THEN "vRec"."ratePercent" ELSE t."ratePercent" END,
           "sourceMasterId" = CASE WHEN "pData" ? 'sourceMasterId' THEN "vRec"."sourceMasterId" ELSE t."sourceMasterId" END
     WHERE t.id = "vId" AND t."tenantId" = "vTenant"
       AND (NOT ("pData" ? 'rowVersion') OR t."rowVersion" = ("pData" ->> 'rowVersion')::int)
    RETURNING t.id INTO "vRet";
    IF "vRet" IS NULL THEN
      IF EXISTS (SELECT 1 FROM "Payroll"."SalaryTaxSlabs" t WHERE t.id = "vId" AND t."tenantId" = "vTenant") THEN
        RAISE EXCEPTION 'SalaryTaxSlabs %: record was changed by another user, reload and try again', "vId"
          USING ERRCODE = 'serialization_failure';
      END IF;
      RAISE EXCEPTION 'SalaryTaxSlabs % not found', "vId" USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN "vRet";
END $$;
COMMENT ON FUNCTION "Payroll"."salaryTaxSlabAddUpdate"(jsonb) IS 'Save (insert or update) one SalaryTaxSlabs record.';

-- SalaryTaxSlabs: one record as JSON (camelCase keys), with lookup labels
CREATE OR REPLACE FUNCTION "Payroll"."getSalaryTaxSlabInfo"("pId" uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT (to_jsonb(t))
    FROM "Payroll"."SalaryTaxSlabs" t
   WHERE t.id = "pId"
$$;
COMMENT ON FUNCTION "Payroll"."getSalaryTaxSlabInfo"(uuid) IS 'Read one SalaryTaxSlabs record (getter for its screens).';
