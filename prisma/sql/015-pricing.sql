-- Phase 9: Pricing & collections setup (price lists with dated prices and quantity breaks; sales schemes; price tiers;
-- payment-reminder templates and rules). Idempotent. Apply with: npm run db:sql

-- ---------------------------------------------------------------------------
-- 1. Row history on the tables that had none
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "salesSchemeItemsAudit" ON "Sales"."SalesSchemeItems";
CREATE TRIGGER "salesSchemeItemsAudit" AFTER INSERT OR UPDATE OR DELETE ON "Sales"."SalesSchemeItems"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "salesSchemeEligibilitiesAudit" ON "Sales"."SalesSchemeEligibilities";
CREATE TRIGGER "salesSchemeEligibilitiesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Sales"."SalesSchemeEligibilities"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "paymentReminderTemplatesAudit" ON "Sales"."PaymentReminderTemplates";
CREATE TRIGGER "paymentReminderTemplatesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Sales"."PaymentReminderTemplates"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();
DROP TRIGGER IF EXISTS "paymentReminderRulesAudit" ON "Sales"."PaymentReminderRules";
CREATE TRIGGER "paymentReminderRulesAudit" AFTER INSERT OR UPDATE OR DELETE ON "Sales"."PaymentReminderRules"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAudit"();

-- ---------------------------------------------------------------------------
-- 2. Set-based saves that don't rewrite the price list header (the generated priceListAddUpdate replaces whole child sets)
-- ---------------------------------------------------------------------------
-- Upserts list prices for one effective date: {"priceListId", "effectiveFrom", "items": [{"itemId", "price"}]}.
-- A product's price on that date is updated in place; other dates are untouched (older prices stay as history).
CREATE OR REPLACE FUNCTION "Sales"."priceListItemsUpsert"("pData" jsonb)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vList" uuid := ("pData" ->> 'priceListId')::uuid;
  "vDate" date := COALESCE(NULLIF("pData" ->> 'effectiveFrom', '')::date, CURRENT_DATE);
  "vCount" integer := 0;
  "vRow" jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Sales"."PriceLists" WHERE id = "vList" AND "tenantId" = "vTenant" AND "deletedAt" IS NULL) THEN
    RAISE EXCEPTION 'PriceLists % not found', "vList" USING ERRCODE = 'no_data_found';
  END IF;
  FOR "vRow" IN SELECT x FROM jsonb_array_elements(COALESCE("pData" -> 'items', '[]'::jsonb)) x LOOP
    INSERT INTO "Sales"."PriceListItems" ("tenantId", "priceListId", "itemId", price, "effectiveFrom")
    VALUES ("vTenant", "vList", ("vRow" ->> 'itemId')::uuid, ("vRow" ->> 'price')::numeric, "vDate")
    ON CONFLICT ("tenantId", "priceListId", "itemId", "effectiveFrom")
      DO UPDATE SET price = EXCLUDED.price
      WHERE "PriceListItems".price IS DISTINCT FROM EXCLUDED.price;
    "vCount" := "vCount" + 1;
  END LOOP;
  RETURN "vCount";
END $function$;
GRANT EXECUTE ON FUNCTION "Sales"."priceListItemsUpsert"(jsonb) TO "finsoftApp";

-- Replaces one product's quantity-break slabs for a list (or for every list when priceListId is null):
-- {"priceListId" | null, "itemId", "slabs": [{"minQty", "maxQty", "unitPrice"}]}; slabs are numbered T1… in order.
CREATE OR REPLACE FUNCTION "Sales"."quantityBreaksReplace"("pData" jsonb)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vTenant" uuid := "Company"."getCurrentTenantId"();
  "vList" uuid := NULLIF("pData" ->> 'priceListId', '')::uuid;
  "vItem" uuid := ("pData" ->> 'itemId')::uuid;
  "vSlab" jsonb;
  "vNo" bigint;
BEGIN
  DELETE FROM "Sales"."PriceListQuantityBreaks"
   WHERE "tenantId" = "vTenant" AND "itemId" = "vItem" AND "priceListId" IS NOT DISTINCT FROM "vList";
  FOR "vSlab", "vNo" IN SELECT x, n FROM jsonb_array_elements(COALESCE("pData" -> 'slabs', '[]'::jsonb)) WITH ORDINALITY t(x, n) LOOP
    INSERT INTO "Sales"."PriceListQuantityBreaks" ("tenantId", "priceListId", "itemId", "tierNo", "minQty", "maxQty", "unitPrice")
    VALUES ("vTenant", "vList", "vItem", "vNo", ("vSlab" ->> 'minQty')::numeric, NULLIF("vSlab" ->> 'maxQty', '')::numeric, ("vSlab" ->> 'unitPrice')::numeric);
  END LOOP;
  RETURN "vNo";
END $function$;
GRANT EXECUTE ON FUNCTION "Sales"."quantityBreaksReplace"(jsonb) TO "finsoftApp";

-- ---------------------------------------------------------------------------
-- 3. Every company's defaults: the three price tiers, four reminder templates (English + Urdu) and four rules
--    (the template's set). At provisioning, and backfilled now. Existing rows are never overwritten.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Sales"."seedPricingDefaultsFor"("pTenant" uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  "vCount" integer := 0;
  "vN" integer;
  "vOwner" uuid;
BEGIN
  INSERT INTO "Distribution"."PriceTiers" ("tenantId", code, name, "rateFactor", "allocationRank", "isActive")
  SELECT "pTenant", v.code, v.name, v.f, v.r, true
    FROM (VALUES ('RETAILER', 'Retailer', 1.00, 3::smallint), ('WHOLESALER', 'Wholesaler', 0.95, 2), ('DISTRIBUTOR', 'Distributor', 0.90, 1)) AS v(code, name, f, r)
   WHERE NOT EXISTS (SELECT 1 FROM "Distribution"."PriceTiers" t WHERE t."tenantId" = "pTenant" AND t.code = v.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT; "vCount" := "vCount" + "vN";

  INSERT INTO "Sales"."PaymentReminderTemplates" ("tenantId", code, name, "emailSubject", "bodyEn", "bodyUr", "isActive")
  SELECT "pTenant", v.code, v.name, v.subj, v.en, v.ur, true
    FROM (VALUES
      ('GENTLE', 'Gentle heads-up', 'Upcoming payment: {invoice}',
       'Assalam o Alaikum {customer}, a friendly reminder that invoice {invoice} for {amount} is due on {due_date}. The invoice is attached for your reference. Thank you for your business! – {company}',
       'السلام علیکم {customer}، یاد دہانی کے طور پر عرض ہے کہ انوائس {invoice} کی رقم {amount} کی ادائیگی {due_date} کو واجب الادا ہے۔ انوائس منسلک ہے۔ شکریہ! – {company}'),
      ('DUE_TODAY', 'Due today', 'Payment due today: {invoice}',
       'Dear {customer}, invoice {invoice} for {amount} is due today ({due_date}). Please arrange payment at your earliest. Reply PAID if already settled. – {company}',
       'محترم {customer}، انوائس {invoice} کی رقم {amount} آج ({due_date}) واجب الادا ہے۔ براہ کرم ادائیگی کا انتظام فرمائیں۔ اگر ادائیگی ہو چکی ہے تو PAID لکھ کر جواب دیں۔ – {company}'),
      ('FIRM', 'Firm follow-up', 'Overdue: {invoice}',
       'Dear {customer}, our records show invoice {invoice} for {amount} is now overdue (due {due_date}). Kindly clear the balance at the earliest to avoid any interruption in supplies. – {company}',
       'محترم {customer}، ہمارے ریکارڈ کے مطابق انوائس {invoice} کی رقم {amount} ({due_date} سے) واجب الادا ہے۔ سپلائی میں تعطل سے بچنے کے لیے براہ کرم جلد از جلد ادائیگی فرمائیں۔ – {company}'),
      ('FINAL', 'Final notice + hold', 'Final notice: {invoice}',
       'FINAL NOTICE: {customer}, invoice {invoice} for {amount} is 15+ days overdue (due {due_date}). New orders are on credit hold until payment is received. Our team will call you today. – {company}',
       'حتمی نوٹس: {customer}، انوائس {invoice} کی رقم {amount} ({due_date}) پندرہ دن سے زائد واجب الادا ہے۔ ادائیگی موصول ہونے تک نئے آرڈرز روک دیے گئے ہیں۔ ہماری ٹیم آج آپ سے رابطہ کرے گی۔ – {company}')
    ) AS v(code, name, subj, en, ur)
   WHERE NOT EXISTS (SELECT 1 FROM "Sales"."PaymentReminderTemplates" t WHERE t."tenantId" = "pTenant" AND t.code = v.code);
  GET DIAGNOSTICS "vN" = ROW_COUNT; "vCount" := "vCount" + "vN";

  -- Rules only for a company with no schedule yet (rules are keyed by offset, not code).
  IF NOT EXISTS (SELECT 1 FROM "Sales"."PaymentReminderRules" WHERE "tenantId" = "pTenant") THEN
    SELECT "defaultUserId" INTO "vOwner" FROM "Platform"."Tenants" WHERE id = "pTenant";
    INSERT INTO "Sales"."PaymentReminderRules" ("tenantId", name, "offsetDays", "dunningLevel", "sendWhatsapp", "sendSms", "sendEmail", "templateId", action,
                                                "attachStatement", escalate, "escalateToUserId", "applyCreditHold", "isActive")
    SELECT "pTenant", v.name, v.off, v.lvl, v.wa, v.sms, v.em, t.id, 'MESSAGE', v.stmt, v.esc AND "vOwner" IS NOT NULL, CASE WHEN v.esc THEN "vOwner" END, v.hold, true
      FROM (VALUES
        ('3 days before due', -3, 'PRE_DUE', true, false, true, 'GENTLE', false, false, false),
        ('On due date', 0, 'DUE', true, true, true, 'DUE_TODAY', false, false, false),
        ('7 days after due', 7, 'LEVEL_1', true, true, false, 'FIRM', false, false, false),
        ('15 days after due', 15, 'FINAL', true, false, true, 'FINAL', true, true, true)
      ) AS v(name, off, lvl, wa, sms, em, tpl, stmt, esc, hold)
      JOIN "Sales"."PaymentReminderTemplates" t ON t."tenantId" = "pTenant" AND t.code = v.tpl;
    GET DIAGNOSTICS "vN" = ROW_COUNT; "vCount" := "vCount" + "vN";
  END IF;
  RETURN "vCount";
END $function$;

-- Runs after the tenant row exists. The default user is set later in provisionTenant's transaction, so a brand-new
-- company's final rule is seeded without escalation; it can be switched on in the rule drawer.
CREATE OR REPLACE FUNCTION "Sales"."triggerTenantPricingDefaults"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM "Sales"."seedPricingDefaultsFor"(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS "tenantsPricingDefaults" ON "Platform"."Tenants";
CREATE TRIGGER "tenantsPricingDefaults" AFTER INSERT ON "Platform"."Tenants"
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerTenantPricingDefaults"();

SELECT set_config('app.actorLabel', 'seedPricingDefaultsFor', true);
SELECT "Sales"."seedPricingDefaultsFor"(t.id) FROM "Platform"."Tenants" t;

-- ---------------------------------------------------------------------------
-- 4. Error catalogue
-- ---------------------------------------------------------------------------
INSERT INTO "Platform"."ErrorCodes" ("code", "httpStatus", "category", "module", "userMessage", "description", "isLogged", "sqlState")
VALUES
  ('PRICE_LIST_IN_USE',        409, 'BUSINESS_RULE', 'SALES',       'Customer groups, customers or documents use this price list. Deactivate it instead.', 'Delete of a used price list', true, NULL),
  ('SCHEME_IN_USE',            409, 'BUSINESS_RULE', 'SALES',       'Documents have used this scheme. Deactivate it instead.', 'Delete of a used scheme', true, NULL),
  ('SCHEME_FIELDS',            400, 'VALIDATION',    'SALES',       'This scheme type needs different terms. Check the highlighted fields.', 'Scheme terms do not match its type (schemeTypeFieldsChk)', true, NULL),
  ('QTY_BREAK_RANGES',         400, 'VALIDATION',    'SALES',       'Quantity slabs must start at 1 and run upwards without gaps or overlaps.', 'Quantity-break ranges invalid', true, NULL),
  ('REMINDER_TEMPLATE_IN_USE', 409, 'BUSINESS_RULE', 'RECEIVABLES', 'Reminder rules or sent reminders use this template. Deactivate it instead.', 'Delete of a used reminder template', true, NULL),
  ('REMINDER_RULE_IN_USE',     409, 'BUSINESS_RULE', 'RECEIVABLES', 'Reminders have been sent with this rule. Pause it instead.', 'Delete of a used reminder rule', true, NULL)
ON CONFLICT ("code") DO UPDATE SET "httpStatus" = EXCLUDED."httpStatus", "category" = EXCLUDED."category", "module" = EXCLUDED."module",
  "userMessage" = EXCLUDED."userMessage", "description" = EXCLUDED."description", "isLogged" = EXCLUDED."isLogged",
  "sqlState" = EXCLUDED."sqlState", "isActive" = true;

-- ---------------------------------------------------------------------------
-- 5. Readable labels and tones for the Phase 9 selects (codes unchanged)
-- ---------------------------------------------------------------------------
UPDATE "Lookups"."Lookups" l
   SET "label" = v.label, "tone" = v.tone
  FROM (VALUES
    ('SchemeType','FREE_GOODS','Free goods','good'), ('SchemeType','INVOICE_DISCOUNT','Invoice discount','info'),
    ('SchemeType','BUNDLE_PRICE','Bundle price','warn'), ('SchemeType','LINE_DISCOUNT','Line discount','violet'),
    ('SchemeType','SETTLEMENT','Settlement','danger'), ('SchemeType','SERVICE','Service','good'),
    ('ItemRole','BUY','Buy','neutral'), ('ItemRole','FREE','Free','good'), ('ItemRole','BUNDLE','In bundle','warn'), ('ItemRole','DISCOUNTED','Discounted','violet'),
    ('DunningLevel','PRE_DUE','Before due','info'), ('DunningLevel','DUE','Due','warn'), ('DunningLevel','LEVEL_1','Overdue 1','warn'),
    ('DunningLevel','LEVEL_2','Overdue 2','danger'), ('DunningLevel','LEVEL_3','Overdue 3','danger'), ('DunningLevel','FINAL','Final','danger'),
    ('PaymentReminderRuleAction','MESSAGE','Send message','info'), ('PaymentReminderRuleAction','CALL_TASK','Call task','warn'),
    ('PaymentReminderRuleAction','CREDIT_HOLD','Credit hold','danger'), ('PaymentReminderRuleAction','LEGAL_NOTICE','Legal notice','danger'),
    ('PriceTier','RETAILER','Retailer','neutral'), ('PriceTier','WHOLESALER','Wholesaler','info'), ('PriceTier','DISTRIBUTOR','Distributor','violet'),
    ('PriceTierCode','RETAILER','Retailer','neutral'), ('PriceTierCode','WHOLESALER','Wholesaler','info'), ('PriceTierCode','DISTRIBUTOR','Distributor','violet')
  ) AS v(type, code, label, tone)
 WHERE l."lookupType" = v.type AND l.code = v.code AND l."tenantId" IS NULL
   AND (l."label" IS DISTINCT FROM v.label OR l."tone" IS DISTINCT FROM v.tone);
